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
import { $, isHTMLInputElement, isHTMLTextAreaElement, reset } from "../../../../base/browser/dom.js";
import { createStyleSheet } from "../../../../base/browser/domStylesheets.js";
import { Button, ButtonWithDropdown, unthemedButtonStyles } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Delayer, RunOnceScheduler } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { groupBy } from "../../../../base/common/collections.js";
import { debounce } from "../../../../base/common/decorators.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isLinuxSnap, isMacintosh } from "../../../../base/common/platform.js";
import { joinPath } from "../../../../base/common/resources.js";
import { escape } from "../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { Action } from "../../../../base/common/actions.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { getIconsStyleSheet } from "../../../../platform/theme/browser/iconsStyleSheet.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IIssueFormService, IssueType } from "../common/issue.js";
import { normalizeGitHubUrl } from "../common/issueReporterUtil.js";
import { IssueReporterModel } from "./issueReporterModel.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
const MAX_URL_LENGTH = 7500;
const MAX_EXTENSION_DATA_LENGTH = 6e4;
var IssueSource = /* @__PURE__ */ ((IssueSource2) => {
  IssueSource2["VSCode"] = "vscode";
  IssueSource2["Extension"] = "extension";
  IssueSource2["Marketplace"] = "marketplace";
  IssueSource2["Unknown"] = "unknown";
  return IssueSource2;
})(IssueSource || {});
let BaseIssueReporterService = class extends Disposable {
  constructor(disableExtensions, data, os, product, window, isWeb, issueFormService, themeService, fileService, fileDialogService, contextMenuService, authenticationService, openerService) {
    super();
    this.disableExtensions = disableExtensions;
    this.data = data;
    this.os = os;
    this.product = product;
    this.window = window;
    this.isWeb = isWeb;
    this.issueFormService = issueFormService;
    this.themeService = themeService;
    this.fileService = fileService;
    this.fileDialogService = fileDialogService;
    this.contextMenuService = contextMenuService;
    this.authenticationService = authenticationService;
    this.openerService = openerService;
    this.receivedSystemInfo = false;
    this.numberOfSearchResultsDisplayed = 0;
    this.receivedPerformanceInfo = false;
    this.shouldQueueSearch = false;
    this.hasBeenSubmitted = false;
    this.openReporter = false;
    this.loadingExtensionData = false;
    this.selectedExtension = "";
    this.delayedSubmit = new Delayer(300);
    this.nonGitHubIssueUrl = false;
    this.needsUpdate = false;
    this.acknowledged = false;
    const targetExtension = data.extensionId ? data.enabledExtensions.find((extension) => extension.id.toLocaleLowerCase() === data.extensionId?.toLocaleLowerCase()) : void 0;
    this.issueReporterModel = new IssueReporterModel({
      ...data,
      issueType: data.issueType || IssueType.Bug,
      versionInfo: {
        vscodeVersion: `${product.nameShort} ${!!product.darwinUniversalAssetId ? `${product.version} (Universal)` : product.version} (${product.commit || "Commit unknown"}, ${product.date || "Date unknown"})`,
        os: `${this.os.type} ${this.os.arch} ${this.os.release}${isLinuxSnap ? " snap" : ""}`
      },
      extensionsDisabled: !!this.disableExtensions,
      fileOnExtension: data.extensionId ? !targetExtension?.isBuiltin : void 0,
      selectedExtension: targetExtension
    });
    this._register(this.authenticationService.onDidChangeSessions(async () => {
      const previousAuthState = !!this.data.githubAccessToken;
      let githubAccessToken = "";
      try {
        const githubSessions = await this.authenticationService.getSessions("github");
        const potentialSessions = githubSessions.filter((session) => session.scopes.includes("repo"));
        githubAccessToken = potentialSessions[0]?.accessToken;
      } catch (e) {
      }
      this.data.githubAccessToken = githubAccessToken;
      const currentAuthState = !!githubAccessToken;
      if (previousAuthState !== currentAuthState) {
        this.updateButtonStates();
      }
    }));
    const fileOnMarketplace = data.issueSource === "marketplace" /* Marketplace */;
    const fileOnProduct = data.issueSource === "vscode" /* VSCode */;
    this.issueReporterModel.update({ fileOnMarketplace, fileOnProduct });
    this.createAction = this._register(new Action("issueReporter.create", localize("create", "Create on GitHub"), void 0, true, async () => {
      this.delayedSubmit.trigger(async () => {
        this.setSubmittingState(true);
        try {
          await this.createIssue(true);
        } finally {
          this.setSubmittingState(false);
        }
      });
    }));
    this.previewAction = this._register(new Action("issueReporter.preview", localize("preview", "Preview on GitHub"), void 0, true, async () => {
      this.delayedSubmit.trigger(async () => {
        this.setSubmittingState(true);
        try {
          await this.createIssue(false);
        } finally {
          this.setSubmittingState(false);
        }
      });
    }));
    this.privateAction = this._register(new Action("issueReporter.privateCreate", localize("privateCreate", "Create Internally"), void 0, true, async () => {
      this.delayedSubmit.trigger(async () => {
        this.setSubmittingState(true);
        try {
          await this.createIssue(true, true);
        } finally {
          this.setSubmittingState(false);
        }
      });
    }));
    const issueTitle = data.issueTitle;
    if (issueTitle) {
      const issueTitleElement = this.getElementById("issue-title");
      if (issueTitleElement) {
        issueTitleElement.value = issueTitle;
      }
    }
    const issueBody = data.issueBody;
    if (issueBody) {
      const description = this.getElementById("description");
      if (description) {
        description.value = issueBody;
        this.issueReporterModel.update({ issueDescription: issueBody });
      }
    }
    if (this.window.document.documentElement.lang !== "en") {
      show(this.getElementById("english"));
    }
    const codiconStyleSheet = createStyleSheet();
    codiconStyleSheet.id = "codiconStyles";
    const iconsStyleSheet = this._register(getIconsStyleSheet(this.themeService));
    function updateAll() {
      codiconStyleSheet.textContent = iconsStyleSheet.getCSS();
    }
    const delayer = new RunOnceScheduler(updateAll, 0);
    this._register(iconsStyleSheet.onDidChange(() => delayer.schedule()));
    delayer.schedule();
    this.handleExtensionData(data.enabledExtensions);
    this.setUpTypes();
    if ((data.data || data.uri) && targetExtension) {
      this.updateExtensionStatus(targetExtension);
    }
    const issueReporterElement = this.getElementById("issue-reporter");
    if (issueReporterElement) {
      this.updateButtonStates();
    }
  }
  render() {
    this.renderBlocks();
  }
  setInitialFocus() {
    const { fileOnExtension } = this.issueReporterModel.getData();
    if (fileOnExtension) {
      const issueTitle = this.window.document.getElementById("issue-title");
      issueTitle?.focus();
    } else {
      const issueType = this.window.document.getElementById("issue-type");
      issueType?.focus();
    }
  }
  updateButtonStates() {
    const issueReporterElement = this.getElementById("issue-reporter");
    if (!issueReporterElement) {
      return;
    }
    let publicElements = this.getElementById("public-elements");
    if (!publicElements) {
      publicElements = document.createElement("div");
      publicElements.id = "public-elements";
      publicElements.classList.add("public-elements");
      issueReporterElement.appendChild(publicElements);
    }
    this.updatePublicGithubButton(publicElements);
    this.updatePublicRepoLink(publicElements);
    let internalElements = this.getElementById("internal-elements");
    if (!internalElements) {
      internalElements = document.createElement("div");
      internalElements.id = "internal-elements";
      internalElements.classList.add("internal-elements");
      internalElements.classList.add("hidden");
      issueReporterElement.appendChild(internalElements);
    }
    let filingRow = this.getElementById("internal-top-row");
    if (!filingRow) {
      filingRow = document.createElement("div");
      filingRow.id = "internal-top-row";
      filingRow.classList.add("internal-top-row");
      internalElements.appendChild(filingRow);
    }
    this.updateInternalFilingNote(filingRow);
    this.updateInternalGithubButton(filingRow);
    this.updateInternalElementsVisibility();
  }
  updateInternalFilingNote(container) {
    let filingNote = this.getElementById("internal-preview-message");
    if (!filingNote) {
      filingNote = document.createElement("span");
      filingNote.id = "internal-preview-message";
      filingNote.classList.add("internal-preview-message");
      container.appendChild(filingNote);
    }
    filingNote.textContent = escape(localize("internalPreviewMessage", "If your copilot debug logs contain private information:"));
  }
  updatePublicGithubButton(container) {
    const issueReporterElement = this.getElementById("issue-reporter");
    if (!issueReporterElement) {
      return;
    }
    if (this.publicGithubButton) {
      this.publicGithubButton.dispose();
    }
    if (!this.acknowledged && this.needsUpdate) {
      this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this.publicGithubButton.label = localize("acknowledge", "Confirm Version Acknowledgement");
      this.publicGithubButton.enabled = false;
    } else if (this.data.githubAccessToken && this.isPreviewEnabled()) {
      this.publicGithubButton = this._register(new ButtonWithDropdown(container, {
        contextMenuProvider: this.contextMenuService,
        actions: [this.previewAction],
        addPrimaryActionToDropdown: false,
        ...unthemedButtonStyles
      }));
      this._register(this.publicGithubButton.onDidClick(() => {
        this.createAction.run();
      }));
      this.publicGithubButton.label = localize("createOnGitHub", "Create on GitHub");
      this.publicGithubButton.enabled = true;
    } else if (this.data.githubAccessToken && !this.isPreviewEnabled()) {
      this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this._register(this.publicGithubButton.onDidClick(() => {
        this.createAction.run();
      }));
      this.publicGithubButton.label = localize("createOnGitHub", "Create on GitHub");
      this.publicGithubButton.enabled = true;
    } else {
      this.publicGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this._register(this.publicGithubButton.onDidClick(() => {
        this.previewAction.run();
      }));
      this.publicGithubButton.label = localize("previewOnGitHub", "Preview on GitHub");
      this.publicGithubButton.enabled = true;
    }
    const repoLink = this.getElementById("show-repo-name");
    if (repoLink) {
      container.insertBefore(this.publicGithubButton.element, repoLink);
    }
  }
  updatePublicRepoLink(container) {
    let issueRepoName = this.getElementById("show-repo-name");
    if (!issueRepoName) {
      issueRepoName = document.createElement("a");
      issueRepoName.id = "show-repo-name";
      issueRepoName.classList.add("hidden");
      container.appendChild(issueRepoName);
    }
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    if (selectedExtension && selectedExtension.uri) {
      const urlString = URI.revive(selectedExtension.uri).toString();
      issueRepoName.href = urlString;
      issueRepoName.addEventListener("click", (e) => this.openLink(e));
      issueRepoName.addEventListener("auxclick", (e) => this.openLink(e));
      const gitHubInfo = this.parseGitHubUrl(urlString);
      issueRepoName.textContent = gitHubInfo ? gitHubInfo.owner + "/" + gitHubInfo.repositoryName : urlString;
      Object.assign(issueRepoName.style, {
        alignSelf: "flex-end",
        display: "block",
        fontSize: "13px",
        padding: "4px 0px",
        textDecoration: "none",
        width: "auto"
      });
      show(issueRepoName);
    } else if (issueRepoName) {
      issueRepoName.removeAttribute("style");
      hide(issueRepoName);
    }
  }
  updateInternalGithubButton(container) {
    const issueReporterElement = this.getElementById("issue-reporter");
    if (!issueReporterElement) {
      return;
    }
    if (this.internalGithubButton) {
      this.internalGithubButton.dispose();
    }
    if (this.data.githubAccessToken && this.data.privateUri) {
      this.internalGithubButton = this._register(new Button(container, unthemedButtonStyles));
      this._register(this.internalGithubButton.onDidClick(() => {
        this.privateAction.run();
      }));
      this.internalGithubButton.element.id = "internal-create-btn";
      this.internalGithubButton.element.classList.add("internal-create-subtle");
      this.internalGithubButton.label = localize("createInternally", "Create Internally");
      this.internalGithubButton.enabled = true;
      this.internalGithubButton.setTitle(this.data.privateUri.path.slice(1));
    }
  }
  updateInternalElementsVisibility() {
    const container = this.getElementById("internal-elements");
    if (!container) {
      return;
    }
    if (this.data.githubAccessToken && this.data.privateUri) {
      show(container);
      container.style.display = "";
      if (this.internalGithubButton) {
        this.internalGithubButton.enabled = this.publicGithubButton?.enabled ?? false;
      }
    } else {
      hide(container);
      container.style.display = "none";
    }
  }
  getSubmitButtonElement() {
    if (this.publicGithubButton instanceof ButtonWithDropdown) {
      return this.publicGithubButton.primaryButton.element;
    }
    return this.publicGithubButton.element;
  }
  setSubmittingState(submitting) {
    this.publicGithubButton.enabled = !submitting;
    if (this.internalGithubButton) {
      this.internalGithubButton.enabled = !submitting;
    }
    const buttonEl = this.getSubmitButtonElement();
    if (submitting) {
      const currentLabel = this.publicGithubButton instanceof ButtonWithDropdown ? this.publicGithubButton.primaryButton.label : this.publicGithubButton.label;
      this.preSubmitButtonLabel = typeof currentLabel === "string" ? currentLabel : "";
      this.publicGithubButton.label = localize("submittingIssue", "Submitting...");
      const spinnerIcon = renderIcon(ThemeIcon.modify(Codicon.loading, "spin"));
      buttonEl.prepend(spinnerIcon);
    } else {
      const spinnerEl = buttonEl.querySelector(".codicon-loading");
      spinnerEl?.remove();
      if (this.preSubmitButtonLabel !== void 0) {
        this.publicGithubButton.label = this.preSubmitButtonLabel;
        this.preSubmitButtonLabel = void 0;
      }
    }
  }
  async updateIssueReporterUri(extension) {
    try {
      if (extension.uri) {
        const uri = URI.revive(extension.uri);
        extension.bugsUrl = uri.toString();
      }
    } catch (e) {
      this.renderBlocks();
    }
  }
  handleExtensionData(extensions) {
    const installedExtensions = extensions.filter((x) => !x.isBuiltin);
    const { nonThemes, themes } = groupBy(installedExtensions, (ext) => {
      return ext.isTheme ? "themes" : "nonThemes";
    });
    const numberOfThemeExtesions = (themes && themes.length) ?? 0;
    this.issueReporterModel.update({ numberOfThemeExtesions, enabledNonThemeExtesions: nonThemes, allExtensions: installedExtensions });
    this.updateExtensionTable(nonThemes ?? [], numberOfThemeExtesions);
    if (this.disableExtensions || installedExtensions.length === 0) {
      this.getElementById("disableExtensions").disabled = true;
    }
    this.updateExtensionSelector(installedExtensions);
  }
  updateExtensionSelector(extensions) {
    const extensionOptions = extensions.map((extension) => {
      return {
        name: extension.displayName || extension.name || "",
        id: extension.id
      };
    });
    extensionOptions.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      if (aName > bName) {
        return 1;
      }
      if (aName < bName) {
        return -1;
      }
      return 0;
    });
    const makeOption = (extension, selectedExtension) => {
      const selected = selectedExtension && extension.id === selectedExtension.id;
      return $("option", {
        "value": extension.id,
        "selected": selected || ""
      }, extension.name);
    };
    const extensionsSelector = this.getElementById("extension-selector");
    if (extensionsSelector) {
      const { selectedExtension } = this.issueReporterModel.getData();
      reset(extensionsSelector, this.makeOption("", localize("selectExtension", "Select extension"), true), ...extensionOptions.map((extension) => makeOption(extension, selectedExtension)));
      if (!selectedExtension) {
        extensionsSelector.selectedIndex = 0;
      }
      this.addEventListener("extension-selector", "change", async (e) => {
        this.clearExtensionData();
        const selectedExtensionId = e.target.value;
        this.selectedExtension = selectedExtensionId;
        const extensions2 = this.issueReporterModel.getData().allExtensions;
        const matches = extensions2.filter((extension) => extension.id === selectedExtensionId);
        if (matches.length) {
          this.issueReporterModel.update({ selectedExtension: matches[0] });
          const selectedExtension2 = this.issueReporterModel.getData().selectedExtension;
          if (selectedExtension2) {
            const iconElement = document.createElement("span");
            iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
            this.setLoading(iconElement);
            const openReporterData = await this.sendReporterMenu(selectedExtension2);
            if (openReporterData) {
              if (this.selectedExtension === selectedExtensionId) {
                this.removeLoading(iconElement, true);
                this.data = openReporterData;
              }
            } else {
              if (!this.loadingExtensionData) {
                iconElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
              }
              this.removeLoading(iconElement);
              this.clearExtensionData();
              selectedExtension2.data = void 0;
              selectedExtension2.uri = void 0;
            }
            if (this.selectedExtension === selectedExtensionId) {
              this.updateExtensionStatus(matches[0]);
              this.openReporter = false;
            }
          } else {
            this.issueReporterModel.update({ selectedExtension: void 0 });
            this.clearSearchResults();
            this.clearExtensionData();
            this.validateSelectedExtension();
            this.updateExtensionStatus(matches[0]);
          }
        }
        this.updateInternalElementsVisibility();
      });
    }
    this.addEventListener("problem-source", "change", (_) => {
      this.clearExtensionData();
      this.validateSelectedExtension();
    });
  }
  async sendReporterMenu(extension) {
    try {
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("sendReporterMenu timed out")), 1e4)
      );
      const data = await Promise.race([
        this.issueFormService.sendReporterMenu(extension.id),
        timeoutPromise
      ]);
      return data;
    } catch (e) {
      console.error(e);
      return void 0;
    }
  }
  updateAcknowledgementState() {
    const acknowledgementCheckbox = this.getElementById("includeAcknowledgement");
    if (acknowledgementCheckbox) {
      this.acknowledged = acknowledgementCheckbox.checked;
      this.updateButtonStates();
    }
  }
  setEventHandlers() {
    ["includeSystemInfo", "includeProcessInfo", "includeWorkspaceInfo", "includeExtensions", "includeExperiments", "includeExtensionData"].forEach((elementId) => {
      this.addEventListener(elementId, "click", (event) => {
        event.stopPropagation();
        this.issueReporterModel.update({ [elementId]: !this.issueReporterModel.getData()[elementId] });
      });
    });
    this.addEventListener("includeAcknowledgement", "click", (event) => {
      event.stopPropagation();
      this.updateAcknowledgementState();
    });
    const showInfoElements = this.window.document.getElementsByClassName("showInfo");
    for (let i = 0; i < showInfoElements.length; i++) {
      const showInfo = showInfoElements.item(i);
      showInfo.addEventListener("click", (e) => {
        e.preventDefault();
        const label = e.target;
        if (label) {
          const containingElement = label.parentElement && label.parentElement.parentElement;
          const info = containingElement && containingElement.lastElementChild;
          if (info && info.classList.contains("hidden")) {
            show(info);
            label.textContent = localize("hide", "hide");
          } else {
            hide(info);
            label.textContent = localize("show", "show");
          }
        }
      });
    }
    this.addEventListener("issue-source", "change", (e) => {
      const value = e.target.value;
      const problemSourceHelpText = this.getElementById("problem-source-help-text");
      if (value === "") {
        this.issueReporterModel.update({ fileOnExtension: void 0 });
        show(problemSourceHelpText);
        this.clearSearchResults();
        this.render();
        return;
      } else {
        hide(problemSourceHelpText);
      }
      const descriptionTextArea = this.getElementById("issue-title");
      if (value === "vscode" /* VSCode */) {
        descriptionTextArea.placeholder = localize("vscodePlaceholder", "E.g Workbench is missing problems panel");
      } else if (value === "extension" /* Extension */) {
        descriptionTextArea.placeholder = localize("extensionPlaceholder", "E.g. Missing alt text on extension readme image");
      } else if (value === "marketplace" /* Marketplace */) {
        descriptionTextArea.placeholder = localize("marketplacePlaceholder", "E.g Cannot disable installed extension");
      } else {
        descriptionTextArea.placeholder = localize("undefinedPlaceholder", "Please enter a title");
      }
      let fileOnExtension, fileOnMarketplace, fileOnProduct = false;
      if (value === "extension" /* Extension */) {
        fileOnExtension = true;
      } else if (value === "marketplace" /* Marketplace */) {
        fileOnMarketplace = true;
      } else if (value === "vscode" /* VSCode */) {
        fileOnProduct = true;
      }
      this.issueReporterModel.update({ fileOnExtension, fileOnMarketplace, fileOnProduct });
      this.render();
      const title = this.getElementById("issue-title").value;
      this.searchIssues(title, fileOnExtension, fileOnMarketplace);
    });
    this.addEventListener("description", "input", (e) => {
      const issueDescription = e.target.value;
      this.issueReporterModel.update({ issueDescription });
      if (this.issueReporterModel.fileOnExtension() === false) {
        const title = this.getElementById("issue-title").value;
        this.searchVSCodeIssues(title, issueDescription);
      }
    });
    this.addEventListener("issue-title", "input", (_) => {
      const titleElement = this.getElementById("issue-title");
      if (titleElement) {
        const title = titleElement.value;
        this.issueReporterModel.update({ issueTitle: title });
      }
    });
    this.addEventListener("issue-title", "input", (e) => {
      const title = e.target.value;
      const lengthValidationMessage = this.getElementById("issue-title-length-validation-error");
      const issueUrl = this.getIssueUrl();
      if (title && this.getIssueUrlWithTitle(title, issueUrl).length > MAX_URL_LENGTH) {
        show(lengthValidationMessage);
      } else {
        hide(lengthValidationMessage);
      }
      const issueSource = this.getElementById("issue-source");
      if (!issueSource || issueSource.value === "") {
        return;
      }
      const { fileOnExtension, fileOnMarketplace } = this.issueReporterModel.getData();
      this.searchIssues(title, fileOnExtension, fileOnMarketplace);
    });
    this.addEventListener("disableExtensions", "click", () => {
      this.issueFormService.reloadWithExtensionsDisabled();
    });
    this.addEventListener("extensionBugsLink", "click", (e) => {
      const url = e.target.innerText;
      this.openLink(url);
    });
    this.addEventListener("disableExtensions", "keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === " ") {
        this.issueFormService.reloadWithExtensionsDisabled();
      }
    });
    this.window.document.onkeydown = async (e) => {
      const cmdOrCtrlKey = isMacintosh ? e.metaKey : e.ctrlKey;
      if (cmdOrCtrlKey && e.key === "Enter") {
        this.delayedSubmit.trigger(async () => {
          this.setSubmittingState(true);
          try {
            if (await this.createIssue()) {
              this.close();
            }
          } finally {
            this.setSubmittingState(false);
          }
        });
      }
      if (cmdOrCtrlKey && e.key === "w") {
        e.stopPropagation();
        e.preventDefault();
        const issueTitle = this.getElementById("issue-title").value;
        const { issueDescription } = this.issueReporterModel.getData();
        if (!this.hasBeenSubmitted && (issueTitle || issueDescription)) {
          this.issueFormService.showConfirmCloseDialog();
        } else {
          this.close();
        }
      }
      if (isMacintosh) {
        if (cmdOrCtrlKey && e.key === "a" && e.target) {
          if (isHTMLInputElement(e.target) || isHTMLTextAreaElement(e.target)) {
            e.target.select();
          }
        }
      }
    };
    this.addEventListener("review-guidance-help-text", "click", (e) => {
      const target = e.target;
      if (target.tagName === "A" && target.getAttribute("target") === "_blank") {
        this.openLink(e);
      }
    });
  }
  updatePerformanceInfo(info) {
    this.issueReporterModel.update(info);
    this.receivedPerformanceInfo = true;
    const state = this.issueReporterModel.getData();
    this.updateProcessInfo(state);
    this.updateWorkspaceInfo(state);
    this.updateButtonStates();
  }
  isPreviewEnabled() {
    const issueType = this.issueReporterModel.getData().issueType;
    if (this.loadingExtensionData) {
      return false;
    }
    if (this.isWeb) {
      if (issueType === IssueType.FeatureRequest || issueType === IssueType.PerformanceIssue || issueType === IssueType.Bug) {
        return true;
      }
    } else {
      if (issueType === IssueType.Bug && this.receivedSystemInfo) {
        return true;
      }
      if (issueType === IssueType.PerformanceIssue && this.receivedSystemInfo && this.receivedPerformanceInfo) {
        return true;
      }
      if (issueType === IssueType.FeatureRequest) {
        return true;
      }
    }
    return false;
  }
  getExtensionRepositoryUrl() {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    return selectedExtension && selectedExtension.repositoryUrl;
  }
  getExtensionBugsUrl() {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    return selectedExtension && selectedExtension.bugsUrl;
  }
  searchVSCodeIssues(title, issueDescription) {
    if (title) {
      this.searchDuplicates(title, issueDescription);
    } else {
      this.clearSearchResults();
    }
  }
  searchIssues(title, fileOnExtension, fileOnMarketplace) {
    if (fileOnExtension) {
      return this.searchExtensionIssues(title);
    }
    if (fileOnMarketplace) {
      return this.searchMarketplaceIssues(title);
    }
    const description = this.issueReporterModel.getData().issueDescription;
    this.searchVSCodeIssues(title, description);
  }
  searchExtensionIssues(title) {
    const url = this.getExtensionGitHubUrl();
    if (title) {
      const matches = /^https?:\/\/github\.com\/(.*)/.exec(url);
      if (matches && matches.length) {
        const repo = matches[1];
        return this.searchGitHub(repo, title);
      }
      if (this.issueReporterModel.getData().selectedExtension) {
        this.clearSearchResults();
        return this.displaySearchResults([]);
      }
    }
    this.clearSearchResults();
  }
  searchMarketplaceIssues(title) {
    if (title) {
      const gitHubInfo = this.parseGitHubUrl(this.product.reportMarketplaceIssueUrl);
      if (gitHubInfo) {
        return this.searchGitHub(`${gitHubInfo.owner}/${gitHubInfo.repositoryName}`, title);
      }
    }
  }
  async close() {
    await this.issueFormService.closeReporter();
  }
  clearSearchResults() {
    const similarIssues = this.getElementById("similar-issues");
    similarIssues.innerText = "";
    this.numberOfSearchResultsDisplayed = 0;
  }
  searchGitHub(repo, title) {
    const query = `is:issue+repo:${repo}+${title}`;
    const similarIssues = this.getElementById("similar-issues");
    fetch(`https://api.github.com/search/issues?q=${query}`).then((response) => {
      response.json().then((result) => {
        similarIssues.innerText = "";
        if (result && result.items) {
          this.displaySearchResults(result.items);
        }
      }).catch((_) => {
        console.warn("Timeout or query limit exceeded");
      });
    }).catch((_) => {
      console.warn("Error fetching GitHub issues");
    });
  }
  searchDuplicates(title, body) {
    const url = "https://vscode-probot.westus.cloudapp.azure.com:7890/duplicate_candidates";
    const init = {
      method: "POST",
      body: JSON.stringify({
        title,
        body
      }),
      headers: new Headers({
        "Content-Type": "application/json"
      })
    };
    fetch(url, init).then((response) => {
      response.json().then((result) => {
        this.clearSearchResults();
        if (result && result.candidates) {
          this.displaySearchResults(result.candidates);
        } else {
          throw new Error("Unexpected response, no candidates property");
        }
      }).catch((_) => {
      });
    }).catch((_) => {
    });
  }
  displaySearchResults(results) {
    const similarIssues = this.getElementById("similar-issues");
    if (results.length) {
      const issues = $("div.issues-container");
      const issuesText = $("div.list-title");
      issuesText.textContent = localize("similarIssues", "Similar issues");
      this.numberOfSearchResultsDisplayed = results.length < 5 ? results.length : 5;
      for (let i = 0; i < this.numberOfSearchResultsDisplayed; i++) {
        const issue = results[i];
        const link = $("a.issue-link", { href: issue.html_url });
        link.textContent = issue.title;
        link.title = issue.title;
        link.addEventListener("click", (e) => this.openLink(e));
        link.addEventListener("auxclick", (e) => this.openLink(e));
        let issueState;
        let item;
        if (issue.state) {
          issueState = $("span.issue-state");
          const issueIcon = $("span.issue-icon");
          issueIcon.appendChild(renderIcon(issue.state === "open" ? Codicon.issueOpened : Codicon.issueClosed));
          const issueStateLabel = $("span.issue-state.label");
          issueStateLabel.textContent = issue.state === "open" ? localize("open", "Open") : localize("closed", "Closed");
          issueState.title = issue.state === "open" ? localize("open", "Open") : localize("closed", "Closed");
          issueState.appendChild(issueIcon);
          issueState.appendChild(issueStateLabel);
          item = $("div.issue", void 0, issueState, link);
        } else {
          item = $("div.issue", void 0, link);
        }
        issues.appendChild(item);
      }
      similarIssues.appendChild(issuesText);
      similarIssues.appendChild(issues);
    }
  }
  setUpTypes() {
    const makeOption = (issueType2, description) => $("option", { "value": issueType2.valueOf() }, escape(description));
    const typeSelect = this.getElementById("issue-type");
    const { issueType } = this.issueReporterModel.getData();
    reset(
      typeSelect,
      makeOption(IssueType.Bug, localize("bugReporter", "Bug Report")),
      makeOption(IssueType.FeatureRequest, localize("featureRequest", "Feature Request")),
      makeOption(IssueType.PerformanceIssue, localize("performanceIssue", "Performance Issue (freeze, slow, crash)"))
    );
    typeSelect.value = issueType.toString();
    this.setSourceOptions();
  }
  makeOption(value, description, disabled) {
    const option = document.createElement("option");
    option.disabled = disabled;
    option.value = value;
    option.textContent = description;
    return option;
  }
  setSourceOptions() {
    const sourceSelect = this.getElementById("issue-source");
    const { issueType, fileOnExtension, selectedExtension, fileOnMarketplace, fileOnProduct } = this.issueReporterModel.getData();
    let selected = sourceSelect.selectedIndex;
    if (selected === -1) {
      if (fileOnExtension !== void 0) {
        selected = fileOnExtension ? 2 : 1;
      } else if (selectedExtension?.isBuiltin) {
        selected = 1;
      } else if (fileOnMarketplace) {
        selected = 3;
      } else if (fileOnProduct) {
        selected = 1;
      }
    }
    sourceSelect.innerText = "";
    sourceSelect.append(this.makeOption("", localize("selectSource", "Select source"), true));
    sourceSelect.append(this.makeOption("vscode" /* VSCode */, localize("vscode", "Visual Studio Code"), false));
    sourceSelect.append(this.makeOption("extension" /* Extension */, localize("extension", "A VS Code extension"), false));
    if (this.product.reportMarketplaceIssueUrl) {
      sourceSelect.append(this.makeOption("marketplace" /* Marketplace */, localize("marketplace", "Extensions Marketplace"), false));
    }
    if (issueType !== IssueType.FeatureRequest) {
      sourceSelect.append(this.makeOption("unknown" /* Unknown */, localize("unknown", "Don't know"), false));
    }
    if (selected !== -1 && selected < sourceSelect.options.length) {
      sourceSelect.selectedIndex = selected;
    } else {
      sourceSelect.selectedIndex = 0;
      hide(this.getElementById("problem-source-help-text"));
    }
  }
  async renderBlocks() {
    const { issueType, fileOnExtension, fileOnMarketplace, selectedExtension } = this.issueReporterModel.getData();
    const blockContainer = this.getElementById("block-container");
    const systemBlock = this.window.document.querySelector(".block-system");
    const processBlock = this.window.document.querySelector(".block-process");
    const workspaceBlock = this.window.document.querySelector(".block-workspace");
    const extensionsBlock = this.window.document.querySelector(".block-extensions");
    const experimentsBlock = this.window.document.querySelector(".block-experiments");
    const extensionDataBlock = this.window.document.querySelector(".block-extension-data");
    const problemSource = this.getElementById("problem-source");
    const descriptionTitle = this.getElementById("issue-description-label");
    const descriptionSubtitle = this.getElementById("issue-description-subtitle");
    const extensionSelector = this.getElementById("extension-selection");
    const downloadExtensionDataLink = this.getElementById("extension-data-download");
    const titleTextArea = this.getElementById("issue-title-container");
    const descriptionTextArea = this.getElementById("description");
    const extensionDataTextArea = this.getElementById("extension-data");
    hide(blockContainer);
    hide(systemBlock);
    hide(processBlock);
    hide(workspaceBlock);
    hide(extensionsBlock);
    hide(experimentsBlock);
    hide(extensionSelector);
    hide(extensionDataTextArea);
    hide(extensionDataBlock);
    hide(downloadExtensionDataLink);
    show(problemSource);
    show(titleTextArea);
    show(descriptionTextArea);
    if (fileOnExtension) {
      show(extensionSelector);
    }
    const extensionData = this.issueReporterModel.getData().extensionData;
    if (extensionData && extensionData.length > MAX_EXTENSION_DATA_LENGTH) {
      show(downloadExtensionDataLink);
      const date = /* @__PURE__ */ new Date();
      const formattedDate = date.toISOString().split("T")[0];
      const formattedTime = date.toTimeString().split(" ")[0].replace(/:/g, "-");
      const fileName = `extensionData_${formattedDate}_${formattedTime}.md`;
      const handleLinkClick = async () => {
        const downloadPath = await this.fileDialogService.showSaveDialog({
          title: localize("saveExtensionData", "Save Extension Data"),
          availableFileSystems: [Schemas.file],
          defaultUri: joinPath(await this.fileDialogService.defaultFilePath(Schemas.file), fileName)
        });
        if (downloadPath) {
          await this.fileService.writeFile(downloadPath, VSBuffer.fromString(extensionData));
        }
      };
      downloadExtensionDataLink.addEventListener("click", handleLinkClick);
      this._register({
        dispose: () => downloadExtensionDataLink.removeEventListener("click", handleLinkClick)
      });
    }
    if (selectedExtension && this.nonGitHubIssueUrl) {
      hide(titleTextArea);
      hide(descriptionTextArea);
      reset(descriptionTitle, localize("handlesIssuesElsewhere", "This extension handles issues outside of VS Code"));
      reset(descriptionSubtitle, localize("elsewhereDescription", "The '{0}' extension prefers to use an external issue reporter. To be taken to that issue reporting experience, click the button below.", selectedExtension.displayName));
      this.publicGithubButton.label = localize("openIssueReporter", "Open External Issue Reporter");
      return;
    }
    if (fileOnExtension && selectedExtension?.data) {
      const data = selectedExtension?.data;
      extensionDataTextArea.innerText = data.toString();
      extensionDataTextArea.readOnly = true;
      show(extensionDataBlock);
    }
    if (fileOnExtension && this.openReporter) {
      extensionDataTextArea.readOnly = true;
      setTimeout(() => {
        if (this.openReporter) {
          show(extensionDataBlock);
        }
      }, 100);
      show(extensionDataBlock);
    }
    if (issueType === IssueType.Bug) {
      if (!fileOnMarketplace) {
        show(blockContainer);
        show(systemBlock);
        show(experimentsBlock);
        if (!fileOnExtension) {
          show(extensionsBlock);
        }
      }
      reset(descriptionTitle, localize("stepsToReproduce", "Steps to Reproduce") + " ", $("span.required-input", void 0, "*"));
      reset(descriptionSubtitle, localize("bugDescription", "Share the steps needed to reliably reproduce the problem. Please include actual and expected results. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
    } else if (issueType === IssueType.PerformanceIssue) {
      if (!fileOnMarketplace) {
        show(blockContainer);
        show(systemBlock);
        show(processBlock);
        show(workspaceBlock);
        show(experimentsBlock);
      }
      if (fileOnExtension) {
        show(extensionSelector);
      } else if (!fileOnMarketplace) {
        show(extensionsBlock);
      }
      reset(descriptionTitle, localize("stepsToReproduce", "Steps to Reproduce") + " ", $("span.required-input", void 0, "*"));
      reset(descriptionSubtitle, localize("performanceIssueDesciption", "When did this performance issue happen? Does it occur on startup or after a specific series of actions? We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
    } else if (issueType === IssueType.FeatureRequest) {
      reset(descriptionTitle, localize("description", "Description") + " ", $("span.required-input", void 0, "*"));
      reset(descriptionSubtitle, localize("featureRequestDescription", "Please describe the feature you would like to see. We support GitHub-flavored Markdown. You will be able to edit your issue and add screenshots when we preview it on GitHub."));
    }
  }
  validateInput(inputId) {
    const inputElement = this.getElementById(inputId);
    const inputValidationMessage = this.getElementById(`${inputId}-empty-error`);
    const descriptionShortMessage = this.getElementById(`description-short-error`);
    if (inputId === "description" && this.nonGitHubIssueUrl && this.data.extensionId) {
      return true;
    } else if (!inputElement.value) {
      inputElement.classList.add("invalid-input");
      inputValidationMessage?.classList.remove("hidden");
      descriptionShortMessage?.classList.add("hidden");
      return false;
    } else if (inputId === "description" && inputElement.value.length < 10) {
      inputElement.classList.add("invalid-input");
      descriptionShortMessage?.classList.remove("hidden");
      inputValidationMessage?.classList.add("hidden");
      return false;
    } else {
      inputElement.classList.remove("invalid-input");
      inputValidationMessage?.classList.add("hidden");
      if (inputId === "description") {
        descriptionShortMessage?.classList.add("hidden");
      }
      return true;
    }
  }
  validateInputs() {
    let isValid = true;
    ["issue-title", "description", "issue-source"].forEach((elementId) => {
      isValid = this.validateInput(elementId) && isValid;
    });
    if (this.issueReporterModel.fileOnExtension()) {
      isValid = this.validateInput("extension-selector") && isValid;
    }
    return isValid;
  }
  async submitToGitHub(issueTitle, issueBody, gitHubDetails) {
    const url = `https://api.github.com/repos/${gitHubDetails.owner}/${gitHubDetails.repositoryName}/issues`;
    const init = {
      method: "POST",
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody
      }),
      headers: new Headers({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.data.githubAccessToken}`,
        "User-Agent": "request"
      })
    };
    const response = await fetch(url, init);
    if (!response.ok) {
      console.error("Invalid GitHub URL provided.");
      return false;
    }
    const result = await response.json();
    await this.openLink(result.html_url);
    this.close();
    return true;
  }
  async createIssue(shouldCreate, privateUri) {
    const selectedExtension = this.issueReporterModel.getData().selectedExtension;
    if (this.nonGitHubIssueUrl) {
      const url2 = this.getExtensionBugsUrl();
      if (url2) {
        this.hasBeenSubmitted = true;
        return true;
      }
    }
    if (!this.validateInputs()) {
      const invalidInput = this.window.document.getElementsByClassName("invalid-input");
      if (invalidInput.length) {
        invalidInput[0].focus();
      }
      this.addEventListener("issue-title", "input", (_) => {
        this.validateInput("issue-title");
      });
      this.addEventListener("description", "input", (_) => {
        this.validateInput("description");
      });
      this.addEventListener("issue-source", "change", (_) => {
        this.validateInput("issue-source");
      });
      if (this.issueReporterModel.fileOnExtension()) {
        this.addEventListener("extension-selector", "change", (_) => {
          this.validateInput("extension-selector");
        });
      }
      return false;
    }
    this.hasBeenSubmitted = true;
    const issueTitle = this.getElementById("issue-title").value;
    const issueBody = this.issueReporterModel.serialize();
    let issueUrl = privateUri ? this.getPrivateIssueUrl() : this.getIssueUrl();
    if (!issueUrl) {
      console.error(`No ${privateUri ? "private " : ""}issue url found`);
      return false;
    }
    if (selectedExtension?.uri) {
      const uri = URI.revive(selectedExtension.uri);
      issueUrl = uri.toString();
    }
    const gitHubDetails = this.parseGitHubUrl(issueUrl);
    if (this.data.githubAccessToken && gitHubDetails && shouldCreate) {
      return this.submitToGitHub(issueTitle, issueBody, gitHubDetails);
    }
    const baseUrl = this.getIssueUrlWithTitle(this.getElementById("issue-title").value, issueUrl);
    let url = baseUrl + `&body=${encodeURIComponent(issueBody)}`;
    url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
    if (url.length > MAX_URL_LENGTH) {
      try {
        url = await this.writeToClipboard(baseUrl, issueBody);
        url = this.addTemplateToUrl(url, gitHubDetails?.owner, gitHubDetails?.repositoryName);
      } catch (_) {
        console.error("Writing to clipboard failed");
        return false;
      }
    }
    await this.openLink(url);
    return true;
  }
  async writeToClipboard(baseUrl, issueBody) {
    const shouldWrite = await this.issueFormService.showClipboardDialog();
    if (!shouldWrite) {
      throw new CancellationError();
    }
    return baseUrl + `&body=${encodeURIComponent(localize("pasteData", "We have written the needed data into your clipboard because it was too large to send. Please paste."))}`;
  }
  addTemplateToUrl(baseUrl, owner, repositoryName) {
    const isVscode = this.issueReporterModel.getData().fileOnProduct;
    const isMicrosoft = owner?.toLowerCase() === "microsoft";
    const needsTemplate = isVscode || isMicrosoft && (repositoryName === "vscode" || repositoryName === "vscode-python");
    if (needsTemplate) {
      try {
        const url = new URL(baseUrl);
        url.searchParams.set("template", "bug_report.md");
        return url.toString();
      } catch {
        return baseUrl + "&template=bug_report.md";
      }
    }
    return baseUrl;
  }
  getIssueUrl() {
    return this.issueReporterModel.fileOnExtension() ? this.getExtensionGitHubUrl() : this.issueReporterModel.getData().fileOnMarketplace ? this.product.reportMarketplaceIssueUrl : this.product.reportIssueUrl;
  }
  // for when command 'workbench.action.openIssueReporter' passes along a
  // `privateUri` UriComponents value
  getPrivateIssueUrl() {
    return URI.revive(this.data.privateUri)?.toString();
  }
  parseGitHubUrl(url) {
    const match = /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*).*/.exec(url);
    if (match && match.length) {
      return {
        owner: match[1],
        repositoryName: match[2]
      };
    } else {
      console.error("No GitHub issues match");
    }
    return void 0;
  }
  getExtensionGitHubUrl() {
    let repositoryUrl = "";
    const bugsUrl = this.getExtensionBugsUrl();
    const extensionUrl = this.getExtensionRepositoryUrl();
    if (bugsUrl && bugsUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?(\/issues)?$/)) {
      repositoryUrl = normalizeGitHubUrl(bugsUrl);
    } else if (extensionUrl && extensionUrl.match(/^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)$/)) {
      repositoryUrl = normalizeGitHubUrl(extensionUrl);
    } else {
      this.nonGitHubIssueUrl = true;
      repositoryUrl = bugsUrl || extensionUrl || "";
    }
    return repositoryUrl;
  }
  getIssueUrlWithTitle(issueTitle, repositoryUrl) {
    if (this.issueReporterModel.fileOnExtension()) {
      repositoryUrl = repositoryUrl + "/issues/new";
    }
    const queryStringPrefix = repositoryUrl.indexOf("?") === -1 ? "?" : "&";
    return `${repositoryUrl}${queryStringPrefix}title=${encodeURIComponent(issueTitle)}`;
  }
  clearExtensionData() {
    this.nonGitHubIssueUrl = false;
    this.issueReporterModel.update({ extensionData: void 0 });
    this.data.issueBody = this.data.issueBody || "";
    this.data.data = void 0;
    this.data.uri = void 0;
    this.data.privateUri = void 0;
  }
  async updateExtensionStatus(extension) {
    this.issueReporterModel.update({ selectedExtension: extension });
    const template = this.data.issueBody;
    if (template) {
      const descriptionTextArea = this.getElementById("description");
      const descriptionText = descriptionTextArea.value;
      if (descriptionText === "" || !descriptionText.includes(template.toString())) {
        const fullTextArea = descriptionText + (descriptionText === "" ? "" : "\n") + template.toString();
        descriptionTextArea.value = fullTextArea;
        this.issueReporterModel.update({ issueDescription: fullTextArea });
      }
    }
    const data = this.data.data;
    if (data) {
      this.issueReporterModel.update({ extensionData: data });
      extension.data = data;
      const extensionDataBlock = this.window.document.querySelector(".block-extension-data");
      show(extensionDataBlock);
      this.renderBlocks();
    }
    const uri = this.data.uri;
    if (uri) {
      extension.uri = uri;
      this.updateIssueReporterUri(extension);
    }
    this.validateSelectedExtension();
    const title = this.getElementById("issue-title").value;
    this.searchExtensionIssues(title);
    this.updateButtonStates();
    this.renderBlocks();
  }
  validateSelectedExtension() {
    const extensionValidationMessage = this.getElementById("extension-selection-validation-error");
    const extensionValidationNoUrlsMessage = this.getElementById("extension-selection-validation-error-no-url");
    hide(extensionValidationMessage);
    hide(extensionValidationNoUrlsMessage);
    const extension = this.issueReporterModel.getData().selectedExtension;
    if (!extension) {
      this.publicGithubButton.enabled = true;
      return;
    }
    if (this.loadingExtensionData) {
      return;
    }
    const hasValidGitHubUrl = this.getExtensionGitHubUrl();
    if (hasValidGitHubUrl) {
      this.publicGithubButton.enabled = true;
    } else {
      this.setExtensionValidationMessage();
      this.publicGithubButton.enabled = false;
    }
  }
  setLoading(element) {
    this.openReporter = true;
    this.loadingExtensionData = true;
    this.updateButtonStates();
    const extensionDataCaption = this.getElementById("extension-id");
    hide(extensionDataCaption);
    const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll(".ext-parens"));
    extensionDataCaption2.forEach((extensionDataCaption22) => hide(extensionDataCaption22));
    const showLoading = this.getElementById("ext-loading");
    show(showLoading);
    while (showLoading.firstChild) {
      showLoading.firstChild.remove();
    }
    showLoading.append(element);
    this.renderBlocks();
  }
  removeLoading(element, fromReporter = false) {
    this.openReporter = fromReporter;
    this.loadingExtensionData = false;
    this.updateButtonStates();
    const extensionDataCaption = this.getElementById("extension-id");
    show(extensionDataCaption);
    const extensionDataCaption2 = Array.from(this.window.document.querySelectorAll(".ext-parens"));
    extensionDataCaption2.forEach((extensionDataCaption22) => show(extensionDataCaption22));
    const hideLoading = this.getElementById("ext-loading");
    hide(hideLoading);
    if (hideLoading.firstChild) {
      element.remove();
    }
    this.renderBlocks();
  }
  setExtensionValidationMessage() {
    const extensionValidationMessage = this.getElementById("extension-selection-validation-error");
    const extensionValidationNoUrlsMessage = this.getElementById("extension-selection-validation-error-no-url");
    const bugsUrl = this.getExtensionBugsUrl();
    if (bugsUrl) {
      show(extensionValidationMessage);
      const link = this.getElementById("extensionBugsLink");
      link.textContent = bugsUrl;
      return;
    }
    const extensionUrl = this.getExtensionRepositoryUrl();
    if (extensionUrl) {
      show(extensionValidationMessage);
      const link = this.getElementById("extensionBugsLink");
      link.textContent = extensionUrl;
      return;
    }
    show(extensionValidationNoUrlsMessage);
  }
  updateProcessInfo(state) {
    const target = this.window.document.querySelector(".block-process .block-info");
    if (target) {
      reset(target, $("code", void 0, state.processInfo ?? ""));
    }
  }
  updateWorkspaceInfo(state) {
    this.window.document.querySelector(".block-workspace .block-info code").textContent = "\n" + state.workspaceInfo;
  }
  updateExtensionTable(extensions, numThemeExtensions) {
    const target = this.window.document.querySelector(".block-extensions .block-info");
    if (target) {
      if (this.disableExtensions) {
        reset(target, localize("disabledExtensions", "Extensions are disabled"));
        return;
      }
      const themeExclusionStr = numThemeExtensions ? `
(${numThemeExtensions} theme extensions excluded)` : "";
      extensions = extensions || [];
      if (!extensions.length) {
        target.innerText = "Extensions: none" + themeExclusionStr;
        return;
      }
      reset(target, this.getExtensionTableHtml(extensions), document.createTextNode(themeExclusionStr));
    }
  }
  getExtensionTableHtml(extensions) {
    return $(
      "table",
      void 0,
      $(
        "tr",
        void 0,
        $("th", void 0, "Extension"),
        $("th", void 0, "Author (truncated)"),
        $("th", void 0, "Version")
      ),
      ...extensions.map((extension) => $(
        "tr",
        void 0,
        $("td", void 0, extension.name),
        $("td", void 0, extension.publisher?.substr(0, 3) ?? "N/A"),
        $("td", void 0, extension.version)
      ))
    );
  }
  async openLink(eventOrUrl) {
    if (typeof eventOrUrl === "string") {
      await this.openerService.open(eventOrUrl, { openExternal: true });
    } else {
      const event = eventOrUrl;
      event.preventDefault();
      event.stopPropagation();
      if (event.which < 3) {
        await this.openerService.open(event.target.href, { openExternal: true });
      }
    }
  }
  getElementById(elementId) {
    const element = this.window.document.getElementById(elementId);
    if (element) {
      return element;
    } else {
      return void 0;
    }
  }
  addEventListener(elementId, eventType, handler) {
    const element = this.getElementById(elementId);
    element?.addEventListener(eventType, handler);
  }
};
__decorateClass([
  debounce(300)
], BaseIssueReporterService.prototype, "searchGitHub", 1);
__decorateClass([
  debounce(300)
], BaseIssueReporterService.prototype, "searchDuplicates", 1);
BaseIssueReporterService = __decorateClass([
  __decorateParam(6, IIssueFormService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IFileDialogService),
  __decorateParam(10, IContextMenuService),
  __decorateParam(11, IAuthenticationService),
  __decorateParam(12, IOpenerService)
], BaseIssueReporterService);
function hide(el) {
  el?.classList.add("hidden");
}
function show(el) {
  el?.classList.remove("hidden");
}
export {
  BaseIssueReporterService,
  hide,
  show
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2Jyb3dzZXIvYmFzZUlzc3VlUmVwb3J0ZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7ICQsIGlzSFRNTElucHV0RWxlbWVudCwgaXNIVE1MVGV4dEFyZWFFbGVtZW50LCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIEJ1dHRvbldpdGhEcm9wZG93biwgdW50aGVtZWRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZ3JvdXBCeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzTGludXhTbmFwLCBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElQcm9kdWN0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZXNjYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBnZXRJY29uc1N0eWxlU2hlZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2ljb25zU3R5bGVTaGVldC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSXNzdWVGb3JtU2VydmljZSwgSXNzdWVSZXBvcnRlckRhdGEsIElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhLCBJc3N1ZVR5cGUgfSBmcm9tICcuLi9jb21tb24vaXNzdWUuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplR2l0SHViVXJsIH0gZnJvbSAnLi4vY29tbW9uL2lzc3VlUmVwb3J0ZXJVdGlsLmpzJztcbmltcG9ydCB7IElzc3VlUmVwb3J0ZXJNb2RlbCwgSXNzdWVSZXBvcnRlckRhdGEgYXMgSXNzdWVSZXBvcnRlck1vZGVsRGF0YSB9IGZyb20gJy4vaXNzdWVSZXBvcnRlck1vZGVsLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuXG5jb25zdCBNQVhfVVJMX0xFTkdUSCA9IDc1MDA7XG5cbi8vIEdpdGh1YiBBUEkgYW5kIGlzc3VlcyBvbiB3ZWIgaGFzIGEgbGltaXQgb2YgNjU1MzYuIElmIGV4dGVuc2lvbiBkYXRhIGlzIHRvbyBsYXJnZSwgd2Ugd2lsbCBhbGxvdyB1c2VycyB0byBkb3dubGFvZCBhbmQgYXR0YWNoIGl0IGFzIGEgZmlsZS5cbi8vIFdlIHJvdW5kIGRvd24gdG8gYmUgc2FmZS5cbi8vIHJlZiBodHRwczovL2dpdGh1Yi5jb20vZ2l0aHViL2lzc3Vlcy9pc3N1ZXMvMTI4NThcblxuY29uc3QgTUFYX0VYVEVOU0lPTl9EQVRBX0xFTkdUSCA9IDYwMDAwO1xuXG5pbnRlcmZhY2UgU2VhcmNoUmVzdWx0IHtcblx0aHRtbF91cmw6IHN0cmluZztcblx0dGl0bGU6IHN0cmluZztcblx0c3RhdGU/OiBzdHJpbmc7XG59XG5cbmVudW0gSXNzdWVTb3VyY2Uge1xuXHRWU0NvZGUgPSAndnNjb2RlJyxcblx0RXh0ZW5zaW9uID0gJ2V4dGVuc2lvbicsXG5cdE1hcmtldHBsYWNlID0gJ21hcmtldHBsYWNlJyxcblx0VW5rbm93biA9ICd1bmtub3duJ1xufVxuXG5cbmV4cG9ydCBjbGFzcyBCYXNlSXNzdWVSZXBvcnRlclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIGlzc3VlUmVwb3J0ZXJNb2RlbDogSXNzdWVSZXBvcnRlck1vZGVsO1xuXHRwdWJsaWMgcmVjZWl2ZWRTeXN0ZW1JbmZvID0gZmFsc2U7XG5cdHB1YmxpYyBudW1iZXJPZlNlYXJjaFJlc3VsdHNEaXNwbGF5ZWQgPSAwO1xuXHRwdWJsaWMgcmVjZWl2ZWRQZXJmb3JtYW5jZUluZm8gPSBmYWxzZTtcblx0cHVibGljIHNob3VsZFF1ZXVlU2VhcmNoID0gZmFsc2U7XG5cdHB1YmxpYyBoYXNCZWVuU3VibWl0dGVkID0gZmFsc2U7XG5cdHB1YmxpYyBvcGVuUmVwb3J0ZXIgPSBmYWxzZTtcblx0cHVibGljIGxvYWRpbmdFeHRlbnNpb25EYXRhID0gZmFsc2U7XG5cdHB1YmxpYyBzZWxlY3RlZEV4dGVuc2lvbiA9ICcnO1xuXHRwdWJsaWMgZGVsYXllZFN1Ym1pdCA9IG5ldyBEZWxheWVyPHZvaWQ+KDMwMCk7XG5cdHB1YmxpYyBwdWJsaWNHaXRodWJCdXR0b24hOiBCdXR0b24gfCBCdXR0b25XaXRoRHJvcGRvd247XG5cdHB1YmxpYyBpbnRlcm5hbEdpdGh1YkJ1dHRvbiE6IEJ1dHRvbiB8IEJ1dHRvbldpdGhEcm9wZG93bjtcblx0cHVibGljIG5vbkdpdEh1Yklzc3VlVXJsID0gZmFsc2U7XG5cdHB1YmxpYyBuZWVkc1VwZGF0ZSA9IGZhbHNlO1xuXHRwdWJsaWMgYWNrbm93bGVkZ2VkID0gZmFsc2U7XG5cdHByaXZhdGUgY3JlYXRlQWN0aW9uOiBBY3Rpb247XG5cdHByaXZhdGUgcHJldmlld0FjdGlvbjogQWN0aW9uO1xuXHRwcml2YXRlIHByaXZhdGVBY3Rpb246IEFjdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgZGlzYWJsZUV4dGVuc2lvbnM6IGJvb2xlYW4sXG5cdFx0cHVibGljIGRhdGE6IElzc3VlUmVwb3J0ZXJEYXRhLFxuXHRcdHB1YmxpYyBvczoge1xuXHRcdFx0dHlwZTogc3RyaW5nO1xuXHRcdFx0YXJjaDogc3RyaW5nO1xuXHRcdFx0cmVsZWFzZTogc3RyaW5nO1xuXHRcdH0sXG5cdFx0cHVibGljIHByb2R1Y3Q6IElQcm9kdWN0Q29uZmlndXJhdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgd2luZG93OiBXaW5kb3csXG5cdFx0cHVibGljIHJlYWRvbmx5IGlzV2ViOiBib29sZWFuLFxuXHRcdEBJSXNzdWVGb3JtU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgaXNzdWVGb3JtU2VydmljZTogSUlzc3VlRm9ybVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHVibGljIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHVibGljIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHVibGljIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwdWJsaWMgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCB0YXJnZXRFeHRlbnNpb24gPSBkYXRhLmV4dGVuc2lvbklkID8gZGF0YS5lbmFibGVkRXh0ZW5zaW9ucy5maW5kKGV4dGVuc2lvbiA9PiBleHRlbnNpb24uaWQudG9Mb2NhbGVMb3dlckNhc2UoKSA9PT0gZGF0YS5leHRlbnNpb25JZD8udG9Mb2NhbGVMb3dlckNhc2UoKSkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwgPSBuZXcgSXNzdWVSZXBvcnRlck1vZGVsKHtcblx0XHRcdC4uLmRhdGEsXG5cdFx0XHRpc3N1ZVR5cGU6IGRhdGEuaXNzdWVUeXBlIHx8IElzc3VlVHlwZS5CdWcsXG5cdFx0XHR2ZXJzaW9uSW5mbzoge1xuXHRcdFx0XHR2c2NvZGVWZXJzaW9uOiBgJHtwcm9kdWN0Lm5hbWVTaG9ydH0gJHshIXByb2R1Y3QuZGFyd2luVW5pdmVyc2FsQXNzZXRJZCA/IGAke3Byb2R1Y3QudmVyc2lvbn0gKFVuaXZlcnNhbClgIDogcHJvZHVjdC52ZXJzaW9ufSAoJHtwcm9kdWN0LmNvbW1pdCB8fCAnQ29tbWl0IHVua25vd24nfSwgJHtwcm9kdWN0LmRhdGUgfHwgJ0RhdGUgdW5rbm93bid9KWAsXG5cdFx0XHRcdG9zOiBgJHt0aGlzLm9zLnR5cGV9ICR7dGhpcy5vcy5hcmNofSAke3RoaXMub3MucmVsZWFzZX0ke2lzTGludXhTbmFwID8gJyBzbmFwJyA6ICcnfWBcblx0XHRcdH0sXG5cdFx0XHRleHRlbnNpb25zRGlzYWJsZWQ6ICEhdGhpcy5kaXNhYmxlRXh0ZW5zaW9ucyxcblx0XHRcdGZpbGVPbkV4dGVuc2lvbjogZGF0YS5leHRlbnNpb25JZCA/ICF0YXJnZXRFeHRlbnNpb24/LmlzQnVpbHRpbiA6IHVuZGVmaW5lZCxcblx0XHRcdHNlbGVjdGVkRXh0ZW5zaW9uOiB0YXJnZXRFeHRlbnNpb25cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNBdXRoU3RhdGUgPSAhIXRoaXMuZGF0YS5naXRodWJBY2Nlc3NUb2tlbjtcblxuXHRcdFx0bGV0IGdpdGh1YkFjY2Vzc1Rva2VuID0gJyc7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBnaXRodWJTZXNzaW9ucyA9IGF3YWl0IHRoaXMuYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInKTtcblx0XHRcdFx0Y29uc3QgcG90ZW50aWFsU2Vzc2lvbnMgPSBnaXRodWJTZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiBzZXNzaW9uLnNjb3Blcy5pbmNsdWRlcygncmVwbycpKTtcblx0XHRcdFx0Z2l0aHViQWNjZXNzVG9rZW4gPSBwb3RlbnRpYWxTZXNzaW9uc1swXT8uYWNjZXNzVG9rZW47XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIElnbm9yZVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRhdGEuZ2l0aHViQWNjZXNzVG9rZW4gPSBnaXRodWJBY2Nlc3NUb2tlbjtcblxuXHRcdFx0Y29uc3QgY3VycmVudEF1dGhTdGF0ZSA9ICEhZ2l0aHViQWNjZXNzVG9rZW47XG5cdFx0XHRpZiAocHJldmlvdXNBdXRoU3RhdGUgIT09IGN1cnJlbnRBdXRoU3RhdGUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVCdXR0b25TdGF0ZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBmaWxlT25NYXJrZXRwbGFjZSA9IGRhdGEuaXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLk1hcmtldHBsYWNlO1xuXHRcdGNvbnN0IGZpbGVPblByb2R1Y3QgPSBkYXRhLmlzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5WU0NvZGU7XG5cdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgZmlsZU9uTWFya2V0cGxhY2UsIGZpbGVPblByb2R1Y3QgfSk7XG5cblx0XHR0aGlzLmNyZWF0ZUFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oJ2lzc3VlUmVwb3J0ZXIuY3JlYXRlJywgbG9jYWxpemUoJ2NyZWF0ZScsIFwiQ3JlYXRlIG9uIEdpdEh1YlwiKSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLmRlbGF5ZWRTdWJtaXQudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2V0U3VibWl0dGluZ1N0YXRlKHRydWUpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY3JlYXRlSXNzdWUodHJ1ZSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdWJtaXR0aW5nU3RhdGUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5wcmV2aWV3QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbignaXNzdWVSZXBvcnRlci5wcmV2aWV3JywgbG9jYWxpemUoJ3ByZXZpZXcnLCBcIlByZXZpZXcgb24gR2l0SHViXCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuZGVsYXllZFN1Ym1pdC50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXRTdWJtaXR0aW5nU3RhdGUodHJ1ZSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVJc3N1ZShmYWxzZSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdWJtaXR0aW5nU3RhdGUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5wcml2YXRlQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbignaXNzdWVSZXBvcnRlci5wcml2YXRlQ3JlYXRlJywgbG9jYWxpemUoJ3ByaXZhdGVDcmVhdGUnLCBcIkNyZWF0ZSBJbnRlcm5hbGx5XCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuZGVsYXllZFN1Ym1pdC50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXRTdWJtaXR0aW5nU3RhdGUodHJ1ZSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVJc3N1ZSh0cnVlLCB0cnVlKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLnNldFN1Ym1pdHRpbmdTdGF0ZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGlzc3VlVGl0bGUgPSBkYXRhLmlzc3VlVGl0bGU7XG5cdFx0aWYgKGlzc3VlVGl0bGUpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgaXNzdWVUaXRsZUVsZW1lbnQgPSB0aGlzLmdldEVsZW1lbnRCeUlkPEhUTUxJbnB1dEVsZW1lbnQ+KCdpc3N1ZS10aXRsZScpO1xuXHRcdFx0aWYgKGlzc3VlVGl0bGVFbGVtZW50KSB7XG5cdFx0XHRcdGlzc3VlVGl0bGVFbGVtZW50LnZhbHVlID0gaXNzdWVUaXRsZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpc3N1ZUJvZHkgPSBkYXRhLmlzc3VlQm9keTtcblx0XHRpZiAoaXNzdWVCb2R5KSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5nZXRFbGVtZW50QnlJZDxIVE1MVGV4dEFyZWFFbGVtZW50PignZGVzY3JpcHRpb24nKTtcblx0XHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRkZXNjcmlwdGlvbi52YWx1ZSA9IGlzc3VlQm9keTtcblx0XHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgaXNzdWVEZXNjcmlwdGlvbjogaXNzdWVCb2R5IH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLndpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQubGFuZyAhPT0gJ2VuJykge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRzaG93KHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2VuZ2xpc2gnKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kaWNvblN0eWxlU2hlZXQgPSBjcmVhdGVTdHlsZVNoZWV0KCk7XG5cdFx0Y29kaWNvblN0eWxlU2hlZXQuaWQgPSAnY29kaWNvblN0eWxlcyc7XG5cblx0XHRjb25zdCBpY29uc1N0eWxlU2hlZXQgPSB0aGlzLl9yZWdpc3RlcihnZXRJY29uc1N0eWxlU2hlZXQodGhpcy50aGVtZVNlcnZpY2UpKTtcblx0XHRmdW5jdGlvbiB1cGRhdGVBbGwoKSB7XG5cdFx0XHRjb2RpY29uU3R5bGVTaGVldC50ZXh0Q29udGVudCA9IGljb25zU3R5bGVTaGVldC5nZXRDU1MoKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxheWVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIodXBkYXRlQWxsLCAwKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpY29uc1N0eWxlU2hlZXQub25EaWRDaGFuZ2UoKCkgPT4gZGVsYXllci5zY2hlZHVsZSgpKSk7XG5cdFx0ZGVsYXllci5zY2hlZHVsZSgpO1xuXG5cdFx0dGhpcy5oYW5kbGVFeHRlbnNpb25EYXRhKGRhdGEuZW5hYmxlZEV4dGVuc2lvbnMpO1xuXHRcdHRoaXMuc2V0VXBUeXBlcygpO1xuXG5cdFx0Ly8gSGFuZGxlIGNhc2Ugd2hlcmUgZXh0ZW5zaW9uIGlzIHByZS1zZWxlY3RlZCB0aHJvdWdoIHRoZSBjb21tYW5kXG5cdFx0aWYgKChkYXRhLmRhdGEgfHwgZGF0YS51cmkpICYmIHRhcmdldEV4dGVuc2lvbikge1xuXHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25TdGF0dXModGFyZ2V0RXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHQvLyBpbml0aWFsaXplIHRoZSByZXBvcnRpbmcgYnV0dG9uKHMpXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaXNzdWVSZXBvcnRlckVsZW1lbnQgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS1yZXBvcnRlcicpO1xuXHRcdGlmIChpc3N1ZVJlcG9ydGVyRWxlbWVudCkge1xuXHRcdFx0dGhpcy51cGRhdGVCdXR0b25TdGF0ZXMoKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJCbG9ja3MoKTtcblx0fVxuXG5cdHNldEluaXRpYWxGb2N1cygpIHtcblx0XHRjb25zdCB7IGZpbGVPbkV4dGVuc2lvbiB9ID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpO1xuXHRcdGlmIChmaWxlT25FeHRlbnNpb24pIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgaXNzdWVUaXRsZSA9IHRoaXMud2luZG93LmRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpO1xuXHRcdFx0aXNzdWVUaXRsZT8uZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBpc3N1ZVR5cGUgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnaXNzdWUtdHlwZScpO1xuXHRcdFx0aXNzdWVUeXBlPy5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVCdXR0b25TdGF0ZXMoKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaXNzdWVSZXBvcnRlckVsZW1lbnQgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS1yZXBvcnRlcicpO1xuXHRcdGlmICghaXNzdWVSZXBvcnRlckVsZW1lbnQpIHtcblx0XHRcdC8vIHNob3VsZG4ndCBvY2N1ciAtLSB0aHJvdz9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdC8vIHB1YmxpYyBlbGVtZW50cyBzZWN0aW9uXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0bGV0IHB1YmxpY0VsZW1lbnRzID0gdGhpcy5nZXRFbGVtZW50QnlJZCgncHVibGljLWVsZW1lbnRzJyk7XG5cdFx0aWYgKCFwdWJsaWNFbGVtZW50cykge1xuXHRcdFx0cHVibGljRWxlbWVudHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHB1YmxpY0VsZW1lbnRzLmlkID0gJ3B1YmxpYy1lbGVtZW50cyc7XG5cdFx0XHRwdWJsaWNFbGVtZW50cy5jbGFzc0xpc3QuYWRkKCdwdWJsaWMtZWxlbWVudHMnKTtcblx0XHRcdGlzc3VlUmVwb3J0ZXJFbGVtZW50LmFwcGVuZENoaWxkKHB1YmxpY0VsZW1lbnRzKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVQdWJsaWNHaXRodWJCdXR0b24ocHVibGljRWxlbWVudHMpO1xuXHRcdHRoaXMudXBkYXRlUHVibGljUmVwb0xpbmsocHVibGljRWxlbWVudHMpO1xuXG5cblx0XHQvLyBwcml2YXRlIGZpbGluZyBzZWN0aW9uXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0bGV0IGludGVybmFsRWxlbWVudHMgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpbnRlcm5hbC1lbGVtZW50cycpO1xuXHRcdGlmICghaW50ZXJuYWxFbGVtZW50cykge1xuXHRcdFx0aW50ZXJuYWxFbGVtZW50cyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0aW50ZXJuYWxFbGVtZW50cy5pZCA9ICdpbnRlcm5hbC1lbGVtZW50cyc7XG5cdFx0XHRpbnRlcm5hbEVsZW1lbnRzLmNsYXNzTGlzdC5hZGQoJ2ludGVybmFsLWVsZW1lbnRzJyk7XG5cdFx0XHRpbnRlcm5hbEVsZW1lbnRzLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0aXNzdWVSZXBvcnRlckVsZW1lbnQuYXBwZW5kQ2hpbGQoaW50ZXJuYWxFbGVtZW50cyk7XG5cdFx0fVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGxldCBmaWxpbmdSb3cgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpbnRlcm5hbC10b3Atcm93Jyk7XG5cdFx0aWYgKCFmaWxpbmdSb3cpIHtcblx0XHRcdGZpbGluZ1JvdyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZmlsaW5nUm93LmlkID0gJ2ludGVybmFsLXRvcC1yb3cnO1xuXHRcdFx0ZmlsaW5nUm93LmNsYXNzTGlzdC5hZGQoJ2ludGVybmFsLXRvcC1yb3cnKTtcblx0XHRcdGludGVybmFsRWxlbWVudHMuYXBwZW5kQ2hpbGQoZmlsaW5nUm93KTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVJbnRlcm5hbEZpbGluZ05vdGUoZmlsaW5nUm93KTtcblx0XHR0aGlzLnVwZGF0ZUludGVybmFsR2l0aHViQnV0dG9uKGZpbGluZ1Jvdyk7XG5cdFx0dGhpcy51cGRhdGVJbnRlcm5hbEVsZW1lbnRzVmlzaWJpbGl0eSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnRlcm5hbEZpbGluZ05vdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGxldCBmaWxpbmdOb3RlID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnaW50ZXJuYWwtcHJldmlldy1tZXNzYWdlJyk7XG5cdFx0aWYgKCFmaWxpbmdOb3RlKSB7XG5cdFx0XHRmaWxpbmdOb3RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0ZmlsaW5nTm90ZS5pZCA9ICdpbnRlcm5hbC1wcmV2aWV3LW1lc3NhZ2UnO1xuXHRcdFx0ZmlsaW5nTm90ZS5jbGFzc0xpc3QuYWRkKCdpbnRlcm5hbC1wcmV2aWV3LW1lc3NhZ2UnKTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChmaWxpbmdOb3RlKTtcblx0XHR9XG5cblx0XHRmaWxpbmdOb3RlLnRleHRDb250ZW50ID0gZXNjYXBlKGxvY2FsaXplKCdpbnRlcm5hbFByZXZpZXdNZXNzYWdlJywgJ0lmIHlvdXIgY29waWxvdCBkZWJ1ZyBsb2dzIGNvbnRhaW4gcHJpdmF0ZSBpbmZvcm1hdGlvbjonKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVB1YmxpY0dpdGh1YkJ1dHRvbihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaXNzdWVSZXBvcnRlckVsZW1lbnQgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS1yZXBvcnRlcicpO1xuXHRcdGlmICghaXNzdWVSZXBvcnRlckVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIG9mIHRoZSBleGlzdGluZyBidXR0b25cblx0XHRpZiAodGhpcy5wdWJsaWNHaXRodWJCdXR0b24pIHtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBzZXR1cCBidXR0b24gKyBkcm9wZG93biBpZiBhcHBsaWNhYmxlXG5cdFx0aWYgKCF0aGlzLmFja25vd2xlZGdlZCAmJiB0aGlzLm5lZWRzVXBkYXRlKSB7IC8vICogb2xkIHZlcnNpb24gYW5kIGhhc24ndCBhY2snZFxuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGNvbnRhaW5lciwgdW50aGVtZWRCdXR0b25TdHlsZXMpKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2Fja25vd2xlZGdlJywgXCJDb25maXJtIFZlcnNpb24gQWNrbm93bGVkZ2VtZW50XCIpO1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5kYXRhLmdpdGh1YkFjY2Vzc1Rva2VuICYmIHRoaXMuaXNQcmV2aWV3RW5hYmxlZCgpKSB7IC8vICogaGFzIGFjY2VzcyB0b2tlbiwgY3JlYXRlIGJ5IGRlZmF1bHQsIHByZXZpZXcgZHJvcGRvd25cblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbldpdGhEcm9wZG93bihjb250YWluZXIsIHtcblx0XHRcdFx0Y29udGV4dE1lbnVQcm92aWRlcjogdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdGFjdGlvbnM6IFt0aGlzLnByZXZpZXdBY3Rpb25dLFxuXHRcdFx0XHRhZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93bjogZmFsc2UsXG5cdFx0XHRcdC4uLnVudGhlbWVkQnV0dG9uU3R5bGVzXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5jcmVhdGVBY3Rpb24ucnVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdjcmVhdGVPbkdpdEh1YicsIFwiQ3JlYXRlIG9uIEdpdEh1YlwiKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5kYXRhLmdpdGh1YkFjY2Vzc1Rva2VuICYmICF0aGlzLmlzUHJldmlld0VuYWJsZWQoKSkgeyAvLyAqIEFjY2VzcyB0b2tlbiBidXQgaW52YWxpZCBwcmV2aWV3IHN0YXRlOiBzaW1wbGUgQnV0dG9uIChjcmVhdGUgb25seSlcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihjb250YWluZXIsIHVudGhlbWVkQnV0dG9uU3R5bGVzKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5jcmVhdGVBY3Rpb24ucnVuKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdjcmVhdGVPbkdpdEh1YicsIFwiQ3JlYXRlIG9uIEdpdEh1YlwiKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdH0gZWxzZSB7IC8vICogTm8gYWNjZXNzIHRva2VuOiBzaW1wbGUgQnV0dG9uIChwcmV2aWV3IG9ubHkpXG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oY29udGFpbmVyLCB1bnRoZW1lZEJ1dHRvblN0eWxlcykpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wdWJsaWNHaXRodWJCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdHRoaXMucHJldmlld0FjdGlvbi5ydW4oKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3ByZXZpZXdPbkdpdEh1YicsIFwiUHJldmlldyBvbiBHaXRIdWJcIik7XG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBtYWtlIHN1cmUgdGhhdCB0aGUgcmVwbyBsaW5rIGlzIGFmdGVyIHRoZSBidXR0b25cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCByZXBvTGluayA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ3Nob3ctcmVwby1uYW1lJyk7XG5cdFx0aWYgKHJlcG9MaW5rKSB7XG5cdFx0XHRjb250YWluZXIuaW5zZXJ0QmVmb3JlKHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVsZW1lbnQsIHJlcG9MaW5rKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVB1YmxpY1JlcG9MaW5rKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRsZXQgaXNzdWVSZXBvTmFtZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ3Nob3ctcmVwby1uYW1lJykgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0aWYgKCFpc3N1ZVJlcG9OYW1lKSB7XG5cdFx0XHRpc3N1ZVJlcG9OYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRcdFx0aXNzdWVSZXBvTmFtZS5pZCA9ICdzaG93LXJlcG8tbmFtZSc7XG5cdFx0XHRpc3N1ZVJlcG9OYW1lLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGlzc3VlUmVwb05hbWUpO1xuXHRcdH1cblxuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRFeHRlbnNpb24gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCkuc2VsZWN0ZWRFeHRlbnNpb247XG5cdFx0aWYgKHNlbGVjdGVkRXh0ZW5zaW9uICYmIHNlbGVjdGVkRXh0ZW5zaW9uLnVyaSkge1xuXHRcdFx0Y29uc3QgdXJsU3RyaW5nID0gVVJJLnJldml2ZShzZWxlY3RlZEV4dGVuc2lvbi51cmkpLnRvU3RyaW5nKCk7XG5cdFx0XHRpc3N1ZVJlcG9OYW1lLmhyZWYgPSB1cmxTdHJpbmc7XG5cdFx0XHRpc3N1ZVJlcG9OYW1lLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHRoaXMub3BlbkxpbmsoZSkpO1xuXHRcdFx0aXNzdWVSZXBvTmFtZS5hZGRFdmVudExpc3RlbmVyKCdhdXhjbGljaycsIChlKSA9PiB0aGlzLm9wZW5MaW5rKDxNb3VzZUV2ZW50PmUpKTtcblx0XHRcdGNvbnN0IGdpdEh1YkluZm8gPSB0aGlzLnBhcnNlR2l0SHViVXJsKHVybFN0cmluZyk7XG5cdFx0XHRpc3N1ZVJlcG9OYW1lLnRleHRDb250ZW50ID0gZ2l0SHViSW5mbyA/IGdpdEh1YkluZm8ub3duZXIgKyAnLycgKyBnaXRIdWJJbmZvLnJlcG9zaXRvcnlOYW1lIDogdXJsU3RyaW5nO1xuXHRcdFx0T2JqZWN0LmFzc2lnbihpc3N1ZVJlcG9OYW1lLnN0eWxlLCB7XG5cdFx0XHRcdGFsaWduU2VsZjogJ2ZsZXgtZW5kJyxcblx0XHRcdFx0ZGlzcGxheTogJ2Jsb2NrJyxcblx0XHRcdFx0Zm9udFNpemU6ICcxM3B4Jyxcblx0XHRcdFx0cGFkZGluZzogJzRweCAwcHgnLFxuXHRcdFx0XHR0ZXh0RGVjb3JhdGlvbjogJ25vbmUnLFxuXHRcdFx0XHR3aWR0aDogJ2F1dG8nXG5cdFx0XHR9KTtcblx0XHRcdHNob3coaXNzdWVSZXBvTmFtZSk7XG5cdFx0fSBlbHNlIGlmIChpc3N1ZVJlcG9OYW1lKSB7XG5cdFx0XHQvLyBjbGVhciBzdHlsZXNcblx0XHRcdGlzc3VlUmVwb05hbWUucmVtb3ZlQXR0cmlidXRlKCdzdHlsZScpO1xuXHRcdFx0aGlkZShpc3N1ZVJlcG9OYW1lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUludGVybmFsR2l0aHViQnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpc3N1ZVJlcG9ydGVyRWxlbWVudCA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXJlcG9ydGVyJyk7XG5cdFx0aWYgKCFpc3N1ZVJlcG9ydGVyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2Ugb2YgdGhlIGV4aXN0aW5nIGJ1dHRvblxuXHRcdGlmICh0aGlzLmludGVybmFsR2l0aHViQnV0dG9uKSB7XG5cdFx0XHR0aGlzLmludGVybmFsR2l0aHViQnV0dG9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kYXRhLmdpdGh1YkFjY2Vzc1Rva2VuICYmIHRoaXMuZGF0YS5wcml2YXRlVXJpKSB7XG5cdFx0XHR0aGlzLmludGVybmFsR2l0aHViQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihjb250YWluZXIsIHVudGhlbWVkQnV0dG9uU3R5bGVzKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmludGVybmFsR2l0aHViQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnByaXZhdGVBY3Rpb24ucnVuKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24uZWxlbWVudC5pZCA9ICdpbnRlcm5hbC1jcmVhdGUtYnRuJztcblx0XHRcdHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnRlcm5hbC1jcmVhdGUtc3VidGxlJyk7XG5cdFx0XHR0aGlzLmludGVybmFsR2l0aHViQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NyZWF0ZUludGVybmFsbHknLCBcIkNyZWF0ZSBJbnRlcm5hbGx5XCIpO1xuXHRcdFx0dGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24uc2V0VGl0bGUodGhpcy5kYXRhLnByaXZhdGVVcmkucGF0aCEuc2xpY2UoMSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW50ZXJuYWxFbGVtZW50c1Zpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgY29udGFpbmVyID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnaW50ZXJuYWwtZWxlbWVudHMnKTtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0Ly8gc2hvdWxkbid0IGhhcHBlblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRhdGEuZ2l0aHViQWNjZXNzVG9rZW4gJiYgdGhpcy5kYXRhLnByaXZhdGVVcmkpIHtcblx0XHRcdHNob3coY29udGFpbmVyKTtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7IC8vdG9kbzogbmVjZXNzYXJ5IGV2ZW4gd2l0aCBzaG93P1xuXHRcdFx0aWYgKHRoaXMuaW50ZXJuYWxHaXRodWJCdXR0b24pIHtcblx0XHRcdFx0dGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbi5lbmFibGVkID0gdGhpcy5wdWJsaWNHaXRodWJCdXR0b24/LmVuYWJsZWQgPz8gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGhpZGUoY29udGFpbmVyKTtcblx0XHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnOyAvL3RvZG86IG5lY2Vzc2FyeSBldmVuIHdpdGggaGlkZT9cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByZVN1Ym1pdEJ1dHRvbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBnZXRTdWJtaXRCdXR0b25FbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRpZiAodGhpcy5wdWJsaWNHaXRodWJCdXR0b24gaW5zdGFuY2VvZiBCdXR0b25XaXRoRHJvcGRvd24pIHtcblx0XHRcdHJldHVybiB0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5wcmltYXJ5QnV0dG9uLmVsZW1lbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5lbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdWJtaXR0aW5nU3RhdGUoc3VibWl0dGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVuYWJsZWQgPSAhc3VibWl0dGluZztcblx0XHRpZiAodGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbikge1xuXHRcdFx0dGhpcy5pbnRlcm5hbEdpdGh1YkJ1dHRvbi5lbmFibGVkID0gIXN1Ym1pdHRpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnV0dG9uRWwgPSB0aGlzLmdldFN1Ym1pdEJ1dHRvbkVsZW1lbnQoKTtcblx0XHRpZiAoc3VibWl0dGluZykge1xuXHRcdFx0Y29uc3QgY3VycmVudExhYmVsID0gdGhpcy5wdWJsaWNHaXRodWJCdXR0b24gaW5zdGFuY2VvZiBCdXR0b25XaXRoRHJvcGRvd25cblx0XHRcdFx0PyB0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5wcmltYXJ5QnV0dG9uLmxhYmVsXG5cdFx0XHRcdDogdGhpcy5wdWJsaWNHaXRodWJCdXR0b24ubGFiZWw7XG5cdFx0XHR0aGlzLnByZVN1Ym1pdEJ1dHRvbkxhYmVsID0gdHlwZW9mIGN1cnJlbnRMYWJlbCA9PT0gJ3N0cmluZycgPyBjdXJyZW50TGFiZWwgOiAnJztcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3N1Ym1pdHRpbmdJc3N1ZScsIFwiU3VibWl0dGluZy4uLlwiKTtcblx0XHRcdGNvbnN0IHNwaW5uZXJJY29uID0gcmVuZGVySWNvbihUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZywgJ3NwaW4nKSk7XG5cdFx0XHRidXR0b25FbC5wcmVwZW5kKHNwaW5uZXJJY29uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBzcGlubmVyRWwgPSBidXR0b25FbC5xdWVyeVNlbGVjdG9yKCcuY29kaWNvbi1sb2FkaW5nJyk7XG5cdFx0XHRzcGlubmVyRWw/LnJlbW92ZSgpO1xuXHRcdFx0aWYgKHRoaXMucHJlU3VibWl0QnV0dG9uTGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5sYWJlbCA9IHRoaXMucHJlU3VibWl0QnV0dG9uTGFiZWw7XG5cdFx0XHRcdHRoaXMucHJlU3VibWl0QnV0dG9uTGFiZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVJc3N1ZVJlcG9ydGVyVXJpKGV4dGVuc2lvbjogSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGV4dGVuc2lvbi51cmkpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShleHRlbnNpb24udXJpKTtcblx0XHRcdFx0ZXh0ZW5zaW9uLmJ1Z3NVcmwgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLnJlbmRlckJsb2NrcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRXh0ZW5zaW9uRGF0YShleHRlbnNpb25zOiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YVtdKSB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9ucyA9IGV4dGVuc2lvbnMuZmlsdGVyKHggPT4gIXguaXNCdWlsdGluKTtcblx0XHRjb25zdCB7IG5vblRoZW1lcywgdGhlbWVzIH0gPSBncm91cEJ5KGluc3RhbGxlZEV4dGVuc2lvbnMsIGV4dCA9PiB7XG5cdFx0XHRyZXR1cm4gZXh0LmlzVGhlbWUgPyAndGhlbWVzJyA6ICdub25UaGVtZXMnO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbnVtYmVyT2ZUaGVtZUV4dGVzaW9ucyA9ICh0aGVtZXMgJiYgdGhlbWVzLmxlbmd0aCkgPz8gMDtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBudW1iZXJPZlRoZW1lRXh0ZXNpb25zLCBlbmFibGVkTm9uVGhlbWVFeHRlc2lvbnM6IG5vblRoZW1lcywgYWxsRXh0ZW5zaW9uczogaW5zdGFsbGVkRXh0ZW5zaW9ucyB9KTtcblx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblRhYmxlKG5vblRoZW1lcyA/PyBbXSwgbnVtYmVyT2ZUaGVtZUV4dGVzaW9ucyk7XG5cdFx0aWYgKHRoaXMuZGlzYWJsZUV4dGVuc2lvbnMgfHwgaW5zdGFsbGVkRXh0ZW5zaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0KDxIVE1MQnV0dG9uRWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdkaXNhYmxlRXh0ZW5zaW9ucycpKS5kaXNhYmxlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVFeHRlbnNpb25TZWxlY3RvcihpbnN0YWxsZWRFeHRlbnNpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXh0ZW5zaW9uU2VsZWN0b3IoZXh0ZW5zaW9uczogSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGFbXSk6IHZvaWQge1xuXHRcdGludGVyZmFjZSBJT3B0aW9uIHtcblx0XHRcdG5hbWU6IHN0cmluZztcblx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uT3B0aW9uczogSU9wdGlvbltdID0gZXh0ZW5zaW9ucy5tYXAoZXh0ZW5zaW9uID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG5hbWU6IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSB8fCAnJyxcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbi5pZFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdC8vIFNvcnQgZXh0ZW5zaW9ucyBieSBuYW1lXG5cdFx0ZXh0ZW5zaW9uT3B0aW9ucy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCBhTmFtZSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0Y29uc3QgYk5hbWUgPSBiLm5hbWUudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmIChhTmFtZSA+IGJOYW1lKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYU5hbWUgPCBiTmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAwO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWFrZU9wdGlvbiA9IChleHRlbnNpb246IElPcHRpb24sIHNlbGVjdGVkRXh0ZW5zaW9uPzogSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGEpOiBIVE1MT3B0aW9uRWxlbWVudCA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IHNlbGVjdGVkRXh0ZW5zaW9uICYmIGV4dGVuc2lvbi5pZCA9PT0gc2VsZWN0ZWRFeHRlbnNpb24uaWQ7XG5cdFx0XHRyZXR1cm4gJDxIVE1MT3B0aW9uRWxlbWVudD4oJ29wdGlvbicsIHtcblx0XHRcdFx0J3ZhbHVlJzogZXh0ZW5zaW9uLmlkLFxuXHRcdFx0XHQnc2VsZWN0ZWQnOiBzZWxlY3RlZCB8fCAnJ1xuXHRcdFx0fSwgZXh0ZW5zaW9uLm5hbWUpO1xuXHRcdH07XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25zU2VsZWN0b3IgPSB0aGlzLmdldEVsZW1lbnRCeUlkPEhUTUxTZWxlY3RFbGVtZW50PignZXh0ZW5zaW9uLXNlbGVjdG9yJyk7XG5cdFx0aWYgKGV4dGVuc2lvbnNTZWxlY3Rvcikge1xuXHRcdFx0Y29uc3QgeyBzZWxlY3RlZEV4dGVuc2lvbiB9ID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpO1xuXHRcdFx0cmVzZXQoZXh0ZW5zaW9uc1NlbGVjdG9yLCB0aGlzLm1ha2VPcHRpb24oJycsIGxvY2FsaXplKCdzZWxlY3RFeHRlbnNpb24nLCBcIlNlbGVjdCBleHRlbnNpb25cIiksIHRydWUpLCAuLi5leHRlbnNpb25PcHRpb25zLm1hcChleHRlbnNpb24gPT4gbWFrZU9wdGlvbihleHRlbnNpb24sIHNlbGVjdGVkRXh0ZW5zaW9uKSkpO1xuXG5cdFx0XHRpZiAoIXNlbGVjdGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGV4dGVuc2lvbnNTZWxlY3Rvci5zZWxlY3RlZEluZGV4ID0gMDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdleHRlbnNpb24tc2VsZWN0b3InLCAnY2hhbmdlJywgYXN5bmMgKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYXJFeHRlbnNpb25EYXRhKCk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkRXh0ZW5zaW9uSWQgPSAoPEhUTUxJbnB1dEVsZW1lbnQ+ZS50YXJnZXQpLnZhbHVlO1xuXHRcdFx0XHR0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uID0gc2VsZWN0ZWRFeHRlbnNpb25JZDtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5hbGxFeHRlbnNpb25zO1xuXHRcdFx0XHRjb25zdCBtYXRjaGVzID0gZXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZCA9PT0gc2VsZWN0ZWRFeHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmIChtYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLnVwZGF0ZSh7IHNlbGVjdGVkRXh0ZW5zaW9uOiBtYXRjaGVzWzBdIH0pO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkRXh0ZW5zaW9uID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLnNlbGVjdGVkRXh0ZW5zaW9uO1xuXHRcdFx0XHRcdGlmIChzZWxlY3RlZEV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRcdFx0XHRpY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubG9hZGluZyksICdjb2RpY29uLW1vZGlmaWVyLXNwaW4nKTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0TG9hZGluZyhpY29uRWxlbWVudCk7XG5cdFx0XHRcdFx0XHRjb25zdCBvcGVuUmVwb3J0ZXJEYXRhID0gYXdhaXQgdGhpcy5zZW5kUmVwb3J0ZXJNZW51KHNlbGVjdGVkRXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRcdGlmIChvcGVuUmVwb3J0ZXJEYXRhKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uID09PSBzZWxlY3RlZEV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5yZW1vdmVMb2FkaW5nKGljb25FbGVtZW50LCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmRhdGEgPSBvcGVuUmVwb3J0ZXJEYXRhO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdFx0aWYgKCF0aGlzLmxvYWRpbmdFeHRlbnNpb25EYXRhKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWNvbkVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmxvYWRpbmcpLCAnY29kaWNvbi1tb2RpZmllci1zcGluJyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGhpcy5yZW1vdmVMb2FkaW5nKGljb25FbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0Ly8gaWYgbm90IHVzaW5nIGNvbW1hbmQsIHNob3VsZCBoYXZlIG5vIGNvbmZpZ3VyYXRpb24gZGF0YSBpbiBmaWVsZHMgd2UgY2FyZSBhYm91dCBhbmQgY2hlY2sgbGF0ZXIuXG5cdFx0XHRcdFx0XHRcdHRoaXMuY2xlYXJFeHRlbnNpb25EYXRhKCk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gY2FzZSB3aGVuIHByZXZpb3VzIGV4dGVuc2lvbiB3YXMgb3BlbmVkIGZyb20gbm9ybWFsIG9wZW5Jc3N1ZVJlcG9ydGVyIGNvbW1hbmRcblx0XHRcdFx0XHRcdFx0c2VsZWN0ZWRFeHRlbnNpb24uZGF0YSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0c2VsZWN0ZWRFeHRlbnNpb24udXJpID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24gPT09IHNlbGVjdGVkRXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0XHRcdFx0Ly8gcmVwb3B1bGF0ZXMgdGhlIGZpZWxkcyB3aXRoIHRoZSBuZXcgZGF0YSBnaXZlbiB0aGUgc2VsZWN0ZWQgZXh0ZW5zaW9uLlxuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblN0YXR1cyhtYXRjaGVzWzBdKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5vcGVuUmVwb3J0ZXIgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgc2VsZWN0ZWRFeHRlbnNpb246IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0XHRcdHRoaXMuY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cdFx0XHRcdFx0XHR0aGlzLmNsZWFyRXh0ZW5zaW9uRGF0YSgpO1xuXHRcdFx0XHRcdFx0dGhpcy52YWxpZGF0ZVNlbGVjdGVkRXh0ZW5zaW9uKCk7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblN0YXR1cyhtYXRjaGVzWzBdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGRhdGUgaW50ZXJuYWwgYWN0aW9uIHZpc2liaWxpdHkgYWZ0ZXIgZXhwbGljaXQgc2VsZWN0aW9uXG5cdFx0XHRcdHRoaXMudXBkYXRlSW50ZXJuYWxFbGVtZW50c1Zpc2liaWxpdHkoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcigncHJvYmxlbS1zb3VyY2UnLCAnY2hhbmdlJywgKF8pID0+IHtcblx0XHRcdHRoaXMuY2xlYXJFeHRlbnNpb25EYXRhKCk7XG5cdFx0XHR0aGlzLnZhbGlkYXRlU2VsZWN0ZWRFeHRlbnNpb24oKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VuZFJlcG9ydGVyTWVudShleHRlbnNpb246IElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhKTogUHJvbWlzZTxJc3N1ZVJlcG9ydGVyRGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0aW1lb3V0UHJvbWlzZSA9IG5ldyBQcm9taXNlPHVuZGVmaW5lZD4oKF8sIHJlamVjdCkgPT5cblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiByZWplY3QobmV3IEVycm9yKCdzZW5kUmVwb3J0ZXJNZW51IHRpbWVkIG91dCcpKSwgMTAwMDApXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdHRoaXMuaXNzdWVGb3JtU2VydmljZS5zZW5kUmVwb3J0ZXJNZW51KGV4dGVuc2lvbi5pZCksXG5cdFx0XHRcdHRpbWVvdXRQcm9taXNlXG5cdFx0XHRdKTtcblx0XHRcdHJldHVybiBkYXRhO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWNrbm93bGVkZ2VtZW50U3RhdGUoKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgYWNrbm93bGVkZ2VtZW50Q2hlY2tib3ggPSB0aGlzLmdldEVsZW1lbnRCeUlkPEhUTUxJbnB1dEVsZW1lbnQ+KCdpbmNsdWRlQWNrbm93bGVkZ2VtZW50Jyk7XG5cdFx0aWYgKGFja25vd2xlZGdlbWVudENoZWNrYm94KSB7XG5cdFx0XHR0aGlzLmFja25vd2xlZGdlZCA9IGFja25vd2xlZGdlbWVudENoZWNrYm94LmNoZWNrZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRFdmVudEhhbmRsZXJzKCk6IHZvaWQge1xuXHRcdChbJ2luY2x1ZGVTeXN0ZW1JbmZvJywgJ2luY2x1ZGVQcm9jZXNzSW5mbycsICdpbmNsdWRlV29ya3NwYWNlSW5mbycsICdpbmNsdWRlRXh0ZW5zaW9ucycsICdpbmNsdWRlRXhwZXJpbWVudHMnLCAnaW5jbHVkZUV4dGVuc2lvbkRhdGEnXSBhcyBjb25zdCkuZm9yRWFjaChlbGVtZW50SWQgPT4ge1xuXHRcdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKGVsZW1lbnRJZCwgJ2NsaWNrJywgKGV2ZW50OiBFdmVudCkgPT4ge1xuXHRcdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgW2VsZW1lbnRJZF06ICF0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKClbZWxlbWVudElkXSB9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdpbmNsdWRlQWNrbm93bGVkZ2VtZW50JywgJ2NsaWNrJywgKGV2ZW50OiBFdmVudCkgPT4ge1xuXHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUFja25vd2xlZGdlbWVudFN0YXRlKCk7XG5cdFx0fSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzaG93SW5mb0VsZW1lbnRzID0gdGhpcy53aW5kb3cuZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnc2hvd0luZm8nKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNob3dJbmZvRWxlbWVudHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHNob3dJbmZvID0gc2hvd0luZm9FbGVtZW50cy5pdGVtKGkpITtcblx0XHRcdChzaG93SW5mbyBhcyBIVE1MQW5jaG9yRWxlbWVudCkuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gKDxIVE1MRGl2RWxlbWVudD5lLnRhcmdldCk7XG5cdFx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5pbmdFbGVtZW50ID0gbGFiZWwucGFyZW50RWxlbWVudCAmJiBsYWJlbC5wYXJlbnRFbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHRcdFx0Y29uc3QgaW5mbyA9IGNvbnRhaW5pbmdFbGVtZW50ICYmIGNvbnRhaW5pbmdFbGVtZW50Lmxhc3RFbGVtZW50Q2hpbGQ7XG5cdFx0XHRcdFx0aWYgKGluZm8gJiYgaW5mby5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpKSB7XG5cdFx0XHRcdFx0XHRzaG93KGluZm8pO1xuXHRcdFx0XHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnaGlkZScsIFwiaGlkZVwiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aGlkZShpbmZvKTtcblx0XHRcdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Nob3cnLCBcInNob3dcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2lzc3VlLXNvdXJjZScsICdjaGFuZ2UnLCAoZTogRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gKDxIVE1MSW5wdXRFbGVtZW50PmUudGFyZ2V0KS52YWx1ZTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgcHJvYmxlbVNvdXJjZUhlbHBUZXh0ID0gdGhpcy5nZXRFbGVtZW50QnlJZCgncHJvYmxlbS1zb3VyY2UtaGVscC10ZXh0JykhO1xuXHRcdFx0aWYgKHZhbHVlID09PSAnJykge1xuXHRcdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBmaWxlT25FeHRlbnNpb246IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0c2hvdyhwcm9ibGVtU291cmNlSGVscFRleHQpO1xuXHRcdFx0XHR0aGlzLmNsZWFyU2VhcmNoUmVzdWx0cygpO1xuXHRcdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoaWRlKHByb2JsZW1Tb3VyY2VIZWxwVGV4dCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25UZXh0QXJlYSA9IDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJyk7XG5cdFx0XHRpZiAodmFsdWUgPT09IElzc3VlU291cmNlLlZTQ29kZSkge1xuXHRcdFx0XHRkZXNjcmlwdGlvblRleHRBcmVhLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3ZzY29kZVBsYWNlaG9sZGVyJywgXCJFLmcgV29ya2JlbmNoIGlzIG1pc3NpbmcgcHJvYmxlbXMgcGFuZWxcIik7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24pIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25UZXh0QXJlYS5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdleHRlbnNpb25QbGFjZWhvbGRlcicsIFwiRS5nLiBNaXNzaW5nIGFsdCB0ZXh0IG9uIGV4dGVuc2lvbiByZWFkbWUgaW1hZ2VcIik7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBJc3N1ZVNvdXJjZS5NYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRkZXNjcmlwdGlvblRleHRBcmVhLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ21hcmtldHBsYWNlUGxhY2Vob2xkZXInLCBcIkUuZyBDYW5ub3QgZGlzYWJsZSBpbnN0YWxsZWQgZXh0ZW5zaW9uXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVzY3JpcHRpb25UZXh0QXJlYS5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCd1bmRlZmluZWRQbGFjZWhvbGRlcicsIFwiUGxlYXNlIGVudGVyIGEgdGl0bGVcIik7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBmaWxlT25FeHRlbnNpb24sIGZpbGVPbk1hcmtldHBsYWNlLCBmaWxlT25Qcm9kdWN0ID0gZmFsc2U7XG5cdFx0XHRpZiAodmFsdWUgPT09IElzc3VlU291cmNlLkV4dGVuc2lvbikge1xuXHRcdFx0XHRmaWxlT25FeHRlbnNpb24gPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gSXNzdWVTb3VyY2UuTWFya2V0cGxhY2UpIHtcblx0XHRcdFx0ZmlsZU9uTWFya2V0cGxhY2UgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gSXNzdWVTb3VyY2UuVlNDb2RlKSB7XG5cdFx0XHRcdGZpbGVPblByb2R1Y3QgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBmaWxlT25FeHRlbnNpb24sIGZpbGVPbk1hcmtldHBsYWNlLCBmaWxlT25Qcm9kdWN0IH0pO1xuXHRcdFx0dGhpcy5yZW5kZXIoKTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCB0aXRsZSA9ICg8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpKS52YWx1ZTtcblx0XHRcdHRoaXMuc2VhcmNoSXNzdWVzKHRpdGxlLCBmaWxlT25FeHRlbnNpb24sIGZpbGVPbk1hcmtldHBsYWNlKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignZGVzY3JpcHRpb24nLCAnaW5wdXQnLCAoZTogRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGlzc3VlRGVzY3JpcHRpb24gPSAoPEhUTUxJbnB1dEVsZW1lbnQ+ZS50YXJnZXQpLnZhbHVlO1xuXHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgaXNzdWVEZXNjcmlwdGlvbiB9KTtcblxuXHRcdFx0Ly8gT25seSBzZWFyY2ggZm9yIGV4dGVuc2lvbiBpc3N1ZXMgb24gdGl0bGUgY2hhbmdlXG5cdFx0XHRpZiAodGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZmlsZU9uRXh0ZW5zaW9uKCkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCB0aXRsZSA9ICg8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpKS52YWx1ZTtcblx0XHRcdFx0dGhpcy5zZWFyY2hWU0NvZGVJc3N1ZXModGl0bGUsIGlzc3VlRGVzY3JpcHRpb24pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdpc3N1ZS10aXRsZScsICdpbnB1dCcsIF8gPT4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCB0aXRsZUVsZW1lbnQgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpIGFzIEhUTUxJbnB1dEVsZW1lbnQ7XG5cdFx0XHRpZiAodGl0bGVFbGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IHRpdGxlID0gdGl0bGVFbGVtZW50LnZhbHVlO1xuXHRcdFx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBpc3N1ZVRpdGxlOiB0aXRsZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignaXNzdWUtdGl0bGUnLCAnaW5wdXQnLCAoZTogRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gKDxIVE1MSW5wdXRFbGVtZW50PmUudGFyZ2V0KS52YWx1ZTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgbGVuZ3RoVmFsaWRhdGlvbk1lc3NhZ2UgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZS1sZW5ndGgtdmFsaWRhdGlvbi1lcnJvcicpO1xuXHRcdFx0Y29uc3QgaXNzdWVVcmwgPSB0aGlzLmdldElzc3VlVXJsKCk7XG5cdFx0XHRpZiAodGl0bGUgJiYgdGhpcy5nZXRJc3N1ZVVybFdpdGhUaXRsZSh0aXRsZSwgaXNzdWVVcmwpLmxlbmd0aCA+IE1BWF9VUkxfTEVOR1RIKSB7XG5cdFx0XHRcdHNob3cobGVuZ3RoVmFsaWRhdGlvbk1lc3NhZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGlkZShsZW5ndGhWYWxpZGF0aW9uTWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGlzc3VlU291cmNlID0gdGhpcy5nZXRFbGVtZW50QnlJZDxIVE1MU2VsZWN0RWxlbWVudD4oJ2lzc3VlLXNvdXJjZScpO1xuXHRcdFx0aWYgKCFpc3N1ZVNvdXJjZSB8fCBpc3N1ZVNvdXJjZS52YWx1ZSA9PT0gJycpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IGZpbGVPbkV4dGVuc2lvbiwgZmlsZU9uTWFya2V0cGxhY2UgfSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKTtcblx0XHRcdHRoaXMuc2VhcmNoSXNzdWVzKHRpdGxlLCBmaWxlT25FeHRlbnNpb24sIGZpbGVPbk1hcmtldHBsYWNlKTtcblx0XHR9KTtcblxuXHRcdC8vIFdlIGhhbmRsZSBjbGlja3MgaW4gdGhlIGRyb3Bkb3duIGFjdGlvbnMgbm93XG5cblx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2Rpc2FibGVFeHRlbnNpb25zJywgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5pc3N1ZUZvcm1TZXJ2aWNlLnJlbG9hZFdpdGhFeHRlbnNpb25zRGlzYWJsZWQoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignZXh0ZW5zaW9uQnVnc0xpbmsnLCAnY2xpY2snLCAoZTogRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9ICg8SFRNTEVsZW1lbnQ+ZS50YXJnZXQpLmlubmVyVGV4dDtcblx0XHRcdHRoaXMub3BlbkxpbmsodXJsKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkRXZlbnRMaXN0ZW5lcignZGlzYWJsZUV4dGVuc2lvbnMnLCAna2V5ZG93bicsIChlOiBFdmVudCkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmICgoZSBhcyBLZXlib2FyZEV2ZW50KS5rZXkgPT09ICdFbnRlcicgfHwgKGUgYXMgS2V5Ym9hcmRFdmVudCkua2V5ID09PSAnICcpIHtcblx0XHRcdFx0dGhpcy5pc3N1ZUZvcm1TZXJ2aWNlLnJlbG9hZFdpdGhFeHRlbnNpb25zRGlzYWJsZWQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMud2luZG93LmRvY3VtZW50Lm9ua2V5ZG93biA9IGFzeW5jIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBjbWRPckN0cmxLZXkgPSBpc01hY2ludG9zaCA/IGUubWV0YUtleSA6IGUuY3RybEtleTtcblx0XHRcdC8vIENtZC9DdHJsK0VudGVyIHByZXZpZXdzIGlzc3VlIGFuZCBjbG9zZXMgd2luZG93XG5cdFx0XHRpZiAoY21kT3JDdHJsS2V5ICYmIGUua2V5ID09PSAnRW50ZXInKSB7XG5cdFx0XHRcdHRoaXMuZGVsYXllZFN1Ym1pdC50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnNldFN1Ym1pdHRpbmdTdGF0ZSh0cnVlKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuY3JlYXRlSXNzdWUoKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U3VibWl0dGluZ1N0YXRlKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbWQvQ3RybCArIHcgY2xvc2VzIGlzc3VlIHdpbmRvd1xuXHRcdFx0aWYgKGNtZE9yQ3RybEtleSAmJiBlLmtleSA9PT0gJ3cnKSB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3QgaXNzdWVUaXRsZSA9ICg8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpKSEudmFsdWU7XG5cdFx0XHRcdGNvbnN0IHsgaXNzdWVEZXNjcmlwdGlvbiB9ID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpO1xuXHRcdFx0XHRpZiAoIXRoaXMuaGFzQmVlblN1Ym1pdHRlZCAmJiAoaXNzdWVUaXRsZSB8fCBpc3N1ZURlc2NyaXB0aW9uKSkge1xuXHRcdFx0XHRcdC8vIGZpcmUgYW5kIGZvcmdldFxuXHRcdFx0XHRcdHRoaXMuaXNzdWVGb3JtU2VydmljZS5zaG93Q29uZmlybUNsb3NlRGlhbG9nKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5jbG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdpdGggbGF0ZXN0IGVsZWN0cm9uIHVwZ3JhZGUsIGNtZCthIGlzIG5vIGxvbmdlciBwcm9wYWdhdGluZyBjb3JyZWN0bHkgZm9yIGlucHV0cyBpbiB0aGlzIHdpbmRvdyBvbiBtYWNcblx0XHRcdC8vIE1hbnVhbGx5IHBlcmZvcm0gdGhlIHNlbGVjdGlvblxuXHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdGlmIChjbWRPckN0cmxLZXkgJiYgZS5rZXkgPT09ICdhJyAmJiBlLnRhcmdldCkge1xuXHRcdFx0XHRcdGlmIChpc0hUTUxJbnB1dEVsZW1lbnQoZS50YXJnZXQpIHx8IGlzSFRNTFRleHRBcmVhRWxlbWVudChlLnRhcmdldCkpIHtcblx0XHRcdFx0XHRcdCg8SFRNTElucHV0RWxlbWVudD5lLnRhcmdldCkuc2VsZWN0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIEhhbmRsZSB0aGUgZ3VpZGFuY2UgbGluayBzcGVjaWZpY2FsbHkgdG8gdXNlIG9wZW5lclNlcnZpY2Vcblx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ3Jldmlldy1ndWlkYW5jZS1oZWxwLXRleHQnLCAnY2xpY2snLCAoZTogRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0aWYgKHRhcmdldC50YWdOYW1lID09PSAnQScgJiYgdGFyZ2V0LmdldEF0dHJpYnV0ZSgndGFyZ2V0JykgPT09ICdfYmxhbmsnKSB7XG5cdFx0XHRcdHRoaXMub3BlbkxpbmsoPE1vdXNlRXZlbnQ+ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlUGVyZm9ybWFuY2VJbmZvKGluZm86IFBhcnRpYWw8SXNzdWVSZXBvcnRlckRhdGE+KSB7XG5cdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKGluZm8pO1xuXHRcdHRoaXMucmVjZWl2ZWRQZXJmb3JtYW5jZUluZm8gPSB0cnVlO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCk7XG5cdFx0dGhpcy51cGRhdGVQcm9jZXNzSW5mbyhzdGF0ZSk7XG5cdFx0dGhpcy51cGRhdGVXb3Jrc3BhY2VJbmZvKHN0YXRlKTtcblx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1ByZXZpZXdFbmFibGVkKCkge1xuXHRcdGNvbnN0IGlzc3VlVHlwZSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5pc3N1ZVR5cGU7XG5cblx0XHRpZiAodGhpcy5sb2FkaW5nRXh0ZW5zaW9uRGF0YSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzV2ViKSB7XG5cdFx0XHRpZiAoaXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuRmVhdHVyZVJlcXVlc3QgfHwgaXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSB8fCBpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5CdWcpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5CdWcgJiYgdGhpcy5yZWNlaXZlZFN5c3RlbUluZm8pIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlICYmIHRoaXMucmVjZWl2ZWRTeXN0ZW1JbmZvICYmIHRoaXMucmVjZWl2ZWRQZXJmb3JtYW5jZUluZm8pIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5GZWF0dXJlUmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvblJlcG9zaXRvcnlVcmwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZWxlY3RlZEV4dGVuc2lvbiA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHRyZXR1cm4gc2VsZWN0ZWRFeHRlbnNpb24gJiYgc2VsZWN0ZWRFeHRlbnNpb24ucmVwb3NpdG9yeVVybDtcblx0fVxuXG5cdHB1YmxpYyBnZXRFeHRlbnNpb25CdWdzVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRFeHRlbnNpb24gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCkuc2VsZWN0ZWRFeHRlbnNpb247XG5cdFx0cmV0dXJuIHNlbGVjdGVkRXh0ZW5zaW9uICYmIHNlbGVjdGVkRXh0ZW5zaW9uLmJ1Z3NVcmw7XG5cdH1cblxuXHRwdWJsaWMgc2VhcmNoVlNDb2RlSXNzdWVzKHRpdGxlOiBzdHJpbmcsIGlzc3VlRGVzY3JpcHRpb24/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGl0bGUpIHtcblx0XHRcdHRoaXMuc2VhcmNoRHVwbGljYXRlcyh0aXRsZSwgaXNzdWVEZXNjcmlwdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNlYXJjaElzc3Vlcyh0aXRsZTogc3RyaW5nLCBmaWxlT25FeHRlbnNpb246IGJvb2xlYW4gfCB1bmRlZmluZWQsIGZpbGVPbk1hcmtldHBsYWNlOiBib29sZWFuIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGZpbGVPbkV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VhcmNoRXh0ZW5zaW9uSXNzdWVzKHRpdGxlKTtcblx0XHR9XG5cblx0XHRpZiAoZmlsZU9uTWFya2V0cGxhY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnNlYXJjaE1hcmtldHBsYWNlSXNzdWVzKHRpdGxlKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5pc3N1ZURlc2NyaXB0aW9uO1xuXHRcdHRoaXMuc2VhcmNoVlNDb2RlSXNzdWVzKHRpdGxlLCBkZXNjcmlwdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHNlYXJjaEV4dGVuc2lvbklzc3Vlcyh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdXJsID0gdGhpcy5nZXRFeHRlbnNpb25HaXRIdWJVcmwoKTtcblx0XHRpZiAodGl0bGUpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSAvXmh0dHBzPzpcXC9cXC9naXRodWJcXC5jb21cXC8oLiopLy5leGVjKHVybCk7XG5cdFx0XHRpZiAobWF0Y2hlcyAmJiBtYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCByZXBvID0gbWF0Y2hlc1sxXTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VhcmNoR2l0SHViKHJlcG8sIHRpdGxlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgdGhlIGV4dGVuc2lvbiBoYXMgbm8gcmVwb3NpdG9yeSwgZGlzcGxheSBlbXB0eSBzZWFyY2ggcmVzdWx0c1xuXHRcdFx0aWYgKHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5zZWxlY3RlZEV4dGVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmNsZWFyU2VhcmNoUmVzdWx0cygpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5kaXNwbGF5U2VhcmNoUmVzdWx0cyhbXSk7XG5cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmNsZWFyU2VhcmNoUmVzdWx0cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWFyY2hNYXJrZXRwbGFjZUlzc3Vlcyh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRpdGxlKSB7XG5cdFx0XHRjb25zdCBnaXRIdWJJbmZvID0gdGhpcy5wYXJzZUdpdEh1YlVybCh0aGlzLnByb2R1Y3QucmVwb3J0TWFya2V0cGxhY2VJc3N1ZVVybCEpO1xuXHRcdFx0aWYgKGdpdEh1YkluZm8pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VhcmNoR2l0SHViKGAke2dpdEh1YkluZm8ub3duZXJ9LyR7Z2l0SHViSW5mby5yZXBvc2l0b3J5TmFtZX1gLCB0aXRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuaXNzdWVGb3JtU2VydmljZS5jbG9zZVJlcG9ydGVyKCk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJTZWFyY2hSZXN1bHRzKCk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHNpbWlsYXJJc3N1ZXMgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdzaW1pbGFyLWlzc3VlcycpITtcblx0XHRzaW1pbGFySXNzdWVzLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRoaXMubnVtYmVyT2ZTZWFyY2hSZXN1bHRzRGlzcGxheWVkID0gMDtcblx0fVxuXG5cdEBkZWJvdW5jZSgzMDApXG5cdHByaXZhdGUgc2VhcmNoR2l0SHViKHJlcG86IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYGlzOmlzc3VlK3JlcG86JHtyZXBvfSske3RpdGxlfWA7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgc2ltaWxhcklzc3VlcyA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ3NpbWlsYXItaXNzdWVzJykhO1xuXG5cdFx0ZmV0Y2goYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vc2VhcmNoL2lzc3Vlcz9xPSR7cXVlcnl9YCkudGhlbigocmVzcG9uc2UpID0+IHtcblx0XHRcdHJlc3BvbnNlLmpzb24oKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdHNpbWlsYXJJc3N1ZXMuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdGlmIChyZXN1bHQgJiYgcmVzdWx0Lml0ZW1zKSB7XG5cdFx0XHRcdFx0dGhpcy5kaXNwbGF5U2VhcmNoUmVzdWx0cyhyZXN1bHQuaXRlbXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5jYXRjaChfID0+IHtcblx0XHRcdFx0Y29uc29sZS53YXJuKCdUaW1lb3V0IG9yIHF1ZXJ5IGxpbWl0IGV4Y2VlZGVkJyk7XG5cdFx0XHR9KTtcblx0XHR9KS5jYXRjaChfID0+IHtcblx0XHRcdGNvbnNvbGUud2FybignRXJyb3IgZmV0Y2hpbmcgR2l0SHViIGlzc3VlcycpO1xuXHRcdH0pO1xuXHR9XG5cblx0QGRlYm91bmNlKDMwMClcblx0cHJpdmF0ZSBzZWFyY2hEdXBsaWNhdGVzKHRpdGxlOiBzdHJpbmcsIGJvZHk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB1cmwgPSAnaHR0cHM6Ly92c2NvZGUtcHJvYm90Lndlc3R1cy5jbG91ZGFwcC5henVyZS5jb206Nzg5MC9kdXBsaWNhdGVfY2FuZGlkYXRlcyc7XG5cdFx0Y29uc3QgaW5pdCA9IHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0Ym9keVxuXHRcdFx0fSksXG5cdFx0XHRoZWFkZXJzOiBuZXcgSGVhZGVycyh7XG5cdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbidcblx0XHRcdH0pXG5cdFx0fTtcblxuXHRcdGZldGNoKHVybCwgaW5pdCkudGhlbigocmVzcG9uc2UpID0+IHtcblx0XHRcdHJlc3BvbnNlLmpzb24oKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG5cblx0XHRcdFx0aWYgKHJlc3VsdCAmJiByZXN1bHQuY2FuZGlkYXRlcykge1xuXHRcdFx0XHRcdHRoaXMuZGlzcGxheVNlYXJjaFJlc3VsdHMocmVzdWx0LmNhbmRpZGF0ZXMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCByZXNwb25zZSwgbm8gY2FuZGlkYXRlcyBwcm9wZXJ0eScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5jYXRjaChfID0+IHtcblx0XHRcdFx0Ly8gSWdub3JlXG5cdFx0XHR9KTtcblx0XHR9KS5jYXRjaChfID0+IHtcblx0XHRcdC8vIElnbm9yZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwbGF5U2VhcmNoUmVzdWx0cyhyZXN1bHRzOiBTZWFyY2hSZXN1bHRbXSkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHNpbWlsYXJJc3N1ZXMgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdzaW1pbGFyLWlzc3VlcycpITtcblx0XHRpZiAocmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGlzc3VlcyA9ICQoJ2Rpdi5pc3N1ZXMtY29udGFpbmVyJyk7XG5cdFx0XHRjb25zdCBpc3N1ZXNUZXh0ID0gJCgnZGl2Lmxpc3QtdGl0bGUnKTtcblx0XHRcdGlzc3Vlc1RleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2ltaWxhcklzc3VlcycsIFwiU2ltaWxhciBpc3N1ZXNcIik7XG5cblx0XHRcdHRoaXMubnVtYmVyT2ZTZWFyY2hSZXN1bHRzRGlzcGxheWVkID0gcmVzdWx0cy5sZW5ndGggPCA1ID8gcmVzdWx0cy5sZW5ndGggOiA1O1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLm51bWJlck9mU2VhcmNoUmVzdWx0c0Rpc3BsYXllZDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGlzc3VlID0gcmVzdWx0c1tpXTtcblx0XHRcdFx0Y29uc3QgbGluayA9ICQoJ2EuaXNzdWUtbGluaycsIHsgaHJlZjogaXNzdWUuaHRtbF91cmwgfSk7XG5cdFx0XHRcdGxpbmsudGV4dENvbnRlbnQgPSBpc3N1ZS50aXRsZTtcblx0XHRcdFx0bGluay50aXRsZSA9IGlzc3VlLnRpdGxlO1xuXHRcdFx0XHRsaW5rLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKGUpID0+IHRoaXMub3BlbkxpbmsoZSkpO1xuXHRcdFx0XHRsaW5rLmFkZEV2ZW50TGlzdGVuZXIoJ2F1eGNsaWNrJywgKGUpID0+IHRoaXMub3BlbkxpbmsoPE1vdXNlRXZlbnQ+ZSkpO1xuXG5cdFx0XHRcdGxldCBpc3N1ZVN0YXRlOiBIVE1MRWxlbWVudDtcblx0XHRcdFx0bGV0IGl0ZW06IEhUTUxFbGVtZW50O1xuXHRcdFx0XHRpZiAoaXNzdWUuc3RhdGUpIHtcblx0XHRcdFx0XHRpc3N1ZVN0YXRlID0gJCgnc3Bhbi5pc3N1ZS1zdGF0ZScpO1xuXG5cdFx0XHRcdFx0Y29uc3QgaXNzdWVJY29uID0gJCgnc3Bhbi5pc3N1ZS1pY29uJyk7XG5cdFx0XHRcdFx0aXNzdWVJY29uLmFwcGVuZENoaWxkKHJlbmRlckljb24oaXNzdWUuc3RhdGUgPT09ICdvcGVuJyA/IENvZGljb24uaXNzdWVPcGVuZWQgOiBDb2RpY29uLmlzc3VlQ2xvc2VkKSk7XG5cblx0XHRcdFx0XHRjb25zdCBpc3N1ZVN0YXRlTGFiZWwgPSAkKCdzcGFuLmlzc3VlLXN0YXRlLmxhYmVsJyk7XG5cdFx0XHRcdFx0aXNzdWVTdGF0ZUxhYmVsLnRleHRDb250ZW50ID0gaXNzdWUuc3RhdGUgPT09ICdvcGVuJyA/IGxvY2FsaXplKCdvcGVuJywgXCJPcGVuXCIpIDogbG9jYWxpemUoJ2Nsb3NlZCcsIFwiQ2xvc2VkXCIpO1xuXG5cdFx0XHRcdFx0aXNzdWVTdGF0ZS50aXRsZSA9IGlzc3VlLnN0YXRlID09PSAnb3BlbicgPyBsb2NhbGl6ZSgnb3BlbicsIFwiT3BlblwiKSA6IGxvY2FsaXplKCdjbG9zZWQnLCBcIkNsb3NlZFwiKTtcblx0XHRcdFx0XHRpc3N1ZVN0YXRlLmFwcGVuZENoaWxkKGlzc3VlSWNvbik7XG5cdFx0XHRcdFx0aXNzdWVTdGF0ZS5hcHBlbmRDaGlsZChpc3N1ZVN0YXRlTGFiZWwpO1xuXG5cdFx0XHRcdFx0aXRlbSA9ICQoJ2Rpdi5pc3N1ZScsIHVuZGVmaW5lZCwgaXNzdWVTdGF0ZSwgbGluayk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aXRlbSA9ICQoJ2Rpdi5pc3N1ZScsIHVuZGVmaW5lZCwgbGluayk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpc3N1ZXMuYXBwZW5kQ2hpbGQoaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdHNpbWlsYXJJc3N1ZXMuYXBwZW5kQ2hpbGQoaXNzdWVzVGV4dCk7XG5cdFx0XHRzaW1pbGFySXNzdWVzLmFwcGVuZENoaWxkKGlzc3Vlcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRVcFR5cGVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1ha2VPcHRpb24gPSAoaXNzdWVUeXBlOiBJc3N1ZVR5cGUsIGRlc2NyaXB0aW9uOiBzdHJpbmcpID0+ICQoJ29wdGlvbicsIHsgJ3ZhbHVlJzogaXNzdWVUeXBlLnZhbHVlT2YoKSB9LCBlc2NhcGUoZGVzY3JpcHRpb24pKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHR5cGVTZWxlY3QgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10eXBlJykhIGFzIEhUTUxTZWxlY3RFbGVtZW50O1xuXHRcdGNvbnN0IHsgaXNzdWVUeXBlIH0gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCk7XG5cdFx0cmVzZXQodHlwZVNlbGVjdCxcblx0XHRcdG1ha2VPcHRpb24oSXNzdWVUeXBlLkJ1ZywgbG9jYWxpemUoJ2J1Z1JlcG9ydGVyJywgXCJCdWcgUmVwb3J0XCIpKSxcblx0XHRcdG1ha2VPcHRpb24oSXNzdWVUeXBlLkZlYXR1cmVSZXF1ZXN0LCBsb2NhbGl6ZSgnZmVhdHVyZVJlcXVlc3QnLCBcIkZlYXR1cmUgUmVxdWVzdFwiKSksXG5cdFx0XHRtYWtlT3B0aW9uKElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlLCBsb2NhbGl6ZSgncGVyZm9ybWFuY2VJc3N1ZScsIFwiUGVyZm9ybWFuY2UgSXNzdWUgKGZyZWV6ZSwgc2xvdywgY3Jhc2gpXCIpKVxuXHRcdCk7XG5cblx0XHR0eXBlU2VsZWN0LnZhbHVlID0gaXNzdWVUeXBlLnRvU3RyaW5nKCk7XG5cblx0XHR0aGlzLnNldFNvdXJjZU9wdGlvbnMoKTtcblx0fVxuXG5cdHB1YmxpYyBtYWtlT3B0aW9uKHZhbHVlOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGRpc2FibGVkOiBib29sZWFuKTogSFRNTE9wdGlvbkVsZW1lbnQge1xuXHRcdGNvbnN0IG9wdGlvbjogSFRNTE9wdGlvbkVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdvcHRpb24nKTtcblx0XHRvcHRpb24uZGlzYWJsZWQgPSBkaXNhYmxlZDtcblx0XHRvcHRpb24udmFsdWUgPSB2YWx1ZTtcblx0XHRvcHRpb24udGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbjtcblxuXHRcdHJldHVybiBvcHRpb247XG5cdH1cblxuXHRwdWJsaWMgc2V0U291cmNlT3B0aW9ucygpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzb3VyY2VTZWxlY3QgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS1zb3VyY2UnKSEgYXMgSFRNTFNlbGVjdEVsZW1lbnQ7XG5cdFx0Y29uc3QgeyBpc3N1ZVR5cGUsIGZpbGVPbkV4dGVuc2lvbiwgc2VsZWN0ZWRFeHRlbnNpb24sIGZpbGVPbk1hcmtldHBsYWNlLCBmaWxlT25Qcm9kdWN0IH0gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCk7XG5cdFx0bGV0IHNlbGVjdGVkID0gc291cmNlU2VsZWN0LnNlbGVjdGVkSW5kZXg7XG5cdFx0aWYgKHNlbGVjdGVkID09PSAtMSkge1xuXHRcdFx0aWYgKGZpbGVPbkV4dGVuc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHNlbGVjdGVkID0gZmlsZU9uRXh0ZW5zaW9uID8gMiA6IDE7XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkRXh0ZW5zaW9uPy5pc0J1aWx0aW4pIHtcblx0XHRcdFx0c2VsZWN0ZWQgPSAxO1xuXHRcdFx0fSBlbHNlIGlmIChmaWxlT25NYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRzZWxlY3RlZCA9IDM7XG5cdFx0XHR9IGVsc2UgaWYgKGZpbGVPblByb2R1Y3QpIHtcblx0XHRcdFx0c2VsZWN0ZWQgPSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNvdXJjZVNlbGVjdC5pbm5lclRleHQgPSAnJztcblx0XHRzb3VyY2VTZWxlY3QuYXBwZW5kKHRoaXMubWFrZU9wdGlvbignJywgbG9jYWxpemUoJ3NlbGVjdFNvdXJjZScsIFwiU2VsZWN0IHNvdXJjZVwiKSwgdHJ1ZSkpO1xuXHRcdHNvdXJjZVNlbGVjdC5hcHBlbmQodGhpcy5tYWtlT3B0aW9uKElzc3VlU291cmNlLlZTQ29kZSwgbG9jYWxpemUoJ3ZzY29kZScsIFwiVmlzdWFsIFN0dWRpbyBDb2RlXCIpLCBmYWxzZSkpO1xuXHRcdHNvdXJjZVNlbGVjdC5hcHBlbmQodGhpcy5tYWtlT3B0aW9uKElzc3VlU291cmNlLkV4dGVuc2lvbiwgbG9jYWxpemUoJ2V4dGVuc2lvbicsIFwiQSBWUyBDb2RlIGV4dGVuc2lvblwiKSwgZmFsc2UpKTtcblx0XHRpZiAodGhpcy5wcm9kdWN0LnJlcG9ydE1hcmtldHBsYWNlSXNzdWVVcmwpIHtcblx0XHRcdHNvdXJjZVNlbGVjdC5hcHBlbmQodGhpcy5tYWtlT3B0aW9uKElzc3VlU291cmNlLk1hcmtldHBsYWNlLCBsb2NhbGl6ZSgnbWFya2V0cGxhY2UnLCBcIkV4dGVuc2lvbnMgTWFya2V0cGxhY2VcIiksIGZhbHNlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzc3VlVHlwZSAhPT0gSXNzdWVUeXBlLkZlYXR1cmVSZXF1ZXN0KSB7XG5cdFx0XHRzb3VyY2VTZWxlY3QuYXBwZW5kKHRoaXMubWFrZU9wdGlvbihJc3N1ZVNvdXJjZS5Vbmtub3duLCBsb2NhbGl6ZSgndW5rbm93bicsIFwiRG9uJ3Qga25vd1wiKSwgZmFsc2UpKTtcblx0XHR9XG5cblx0XHRpZiAoc2VsZWN0ZWQgIT09IC0xICYmIHNlbGVjdGVkIDwgc291cmNlU2VsZWN0Lm9wdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRzb3VyY2VTZWxlY3Quc2VsZWN0ZWRJbmRleCA9IHNlbGVjdGVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzb3VyY2VTZWxlY3Quc2VsZWN0ZWRJbmRleCA9IDA7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGhpZGUodGhpcy5nZXRFbGVtZW50QnlJZCgncHJvYmxlbS1zb3VyY2UtaGVscC10ZXh0JykpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZW5kZXJCbG9ja3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRGVwZW5kaW5nIG9uIElzc3VlIFR5cGUsIHdlIHJlbmRlciBkaWZmZXJlbnQgYmxvY2tzIGFuZCB0ZXh0XG5cdFx0Y29uc3QgeyBpc3N1ZVR5cGUsIGZpbGVPbkV4dGVuc2lvbiwgZmlsZU9uTWFya2V0cGxhY2UsIHNlbGVjdGVkRXh0ZW5zaW9uIH0gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgYmxvY2tDb250YWluZXIgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdibG9jay1jb250YWluZXInKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzeXN0ZW1CbG9jayA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay1zeXN0ZW0nKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBwcm9jZXNzQmxvY2sgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuYmxvY2stcHJvY2VzcycpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHdvcmtzcGFjZUJsb2NrID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLXdvcmtzcGFjZScpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvbnNCbG9jayA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay1leHRlbnNpb25zJyk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXhwZXJpbWVudHNCbG9jayA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay1leHBlcmltZW50cycpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGV4dGVuc2lvbkRhdGFCbG9jayA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay1leHRlbnNpb24tZGF0YScpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgcHJvYmxlbVNvdXJjZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ3Byb2JsZW0tc291cmNlJykhO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uVGl0bGUgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS1kZXNjcmlwdGlvbi1sYWJlbCcpITtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBkZXNjcmlwdGlvblN1YnRpdGxlID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtZGVzY3JpcHRpb24tc3VidGl0bGUnKSE7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VsZWN0b3IgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb24tc2VsZWN0aW9uJykhO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGRvd25sb2FkRXh0ZW5zaW9uRGF0YUxpbmsgPSA8SFRNTEFuY2hvckVsZW1lbnQ+dGhpcy5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uLWRhdGEtZG93bmxvYWQnKSE7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCB0aXRsZVRleHRBcmVhID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnaXNzdWUtdGl0bGUtY29udGFpbmVyJykhO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uVGV4dEFyZWEgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdkZXNjcmlwdGlvbicpITtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25EYXRhVGV4dEFyZWEgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb24tZGF0YScpITtcblxuXHRcdC8vIEhpZGUgYWxsIGJ5IGRlZmF1bHRcblx0XHRoaWRlKGJsb2NrQ29udGFpbmVyKTtcblx0XHRoaWRlKHN5c3RlbUJsb2NrKTtcblx0XHRoaWRlKHByb2Nlc3NCbG9jayk7XG5cdFx0aGlkZSh3b3Jrc3BhY2VCbG9jayk7XG5cdFx0aGlkZShleHRlbnNpb25zQmxvY2spO1xuXHRcdGhpZGUoZXhwZXJpbWVudHNCbG9jayk7XG5cdFx0aGlkZShleHRlbnNpb25TZWxlY3Rvcik7XG5cdFx0aGlkZShleHRlbnNpb25EYXRhVGV4dEFyZWEpO1xuXHRcdGhpZGUoZXh0ZW5zaW9uRGF0YUJsb2NrKTtcblx0XHRoaWRlKGRvd25sb2FkRXh0ZW5zaW9uRGF0YUxpbmspO1xuXG5cdFx0c2hvdyhwcm9ibGVtU291cmNlKTtcblx0XHRzaG93KHRpdGxlVGV4dEFyZWEpO1xuXHRcdHNob3coZGVzY3JpcHRpb25UZXh0QXJlYSk7XG5cblx0XHRpZiAoZmlsZU9uRXh0ZW5zaW9uKSB7XG5cdFx0XHRzaG93KGV4dGVuc2lvblNlbGVjdG9yKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25EYXRhID0gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZ2V0RGF0YSgpLmV4dGVuc2lvbkRhdGE7XG5cdFx0aWYgKGV4dGVuc2lvbkRhdGEgJiYgZXh0ZW5zaW9uRGF0YS5sZW5ndGggPiBNQVhfRVhURU5TSU9OX0RBVEFfTEVOR1RIKSB7XG5cdFx0XHRzaG93KGRvd25sb2FkRXh0ZW5zaW9uRGF0YUxpbmspO1xuXHRcdFx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKCk7XG5cdFx0XHRjb25zdCBmb3JtYXR0ZWREYXRlID0gZGF0ZS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF07IC8vIFlZWVktTU0tRERcblx0XHRcdGNvbnN0IGZvcm1hdHRlZFRpbWUgPSBkYXRlLnRvVGltZVN0cmluZygpLnNwbGl0KCcgJylbMF0ucmVwbGFjZSgvOi9nLCAnLScpOyAvLyBISC1NTS1TU1xuXHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBgZXh0ZW5zaW9uRGF0YV8ke2Zvcm1hdHRlZERhdGV9XyR7Zm9ybWF0dGVkVGltZX0ubWRgO1xuXHRcdFx0Y29uc3QgaGFuZGxlTGlua0NsaWNrID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkb3dubG9hZFBhdGggPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlRGlhbG9nKHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NhdmVFeHRlbnNpb25EYXRhJywgXCJTYXZlIEV4dGVuc2lvbiBEYXRhXCIpLFxuXHRcdFx0XHRcdGF2YWlsYWJsZUZpbGVTeXN0ZW1zOiBbU2NoZW1hcy5maWxlXSxcblx0XHRcdFx0XHRkZWZhdWx0VXJpOiBqb2luUGF0aChhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aChTY2hlbWFzLmZpbGUpLCBmaWxlTmFtZSksXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChkb3dubG9hZFBhdGgpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShkb3dubG9hZFBhdGgsIFZTQnVmZmVyLmZyb21TdHJpbmcoZXh0ZW5zaW9uRGF0YSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRkb3dubG9hZEV4dGVuc2lvbkRhdGFMaW5rLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlTGlua0NsaWNrKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBkb3dubG9hZEV4dGVuc2lvbkRhdGFMaW5rLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlTGlua0NsaWNrKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNlbGVjdGVkRXh0ZW5zaW9uICYmIHRoaXMubm9uR2l0SHViSXNzdWVVcmwpIHtcblx0XHRcdGhpZGUodGl0bGVUZXh0QXJlYSk7XG5cdFx0XHRoaWRlKGRlc2NyaXB0aW9uVGV4dEFyZWEpO1xuXHRcdFx0cmVzZXQoZGVzY3JpcHRpb25UaXRsZSwgbG9jYWxpemUoJ2hhbmRsZXNJc3N1ZXNFbHNld2hlcmUnLCBcIlRoaXMgZXh0ZW5zaW9uIGhhbmRsZXMgaXNzdWVzIG91dHNpZGUgb2YgVlMgQ29kZVwiKSk7XG5cdFx0XHRyZXNldChkZXNjcmlwdGlvblN1YnRpdGxlLCBsb2NhbGl6ZSgnZWxzZXdoZXJlRGVzY3JpcHRpb24nLCBcIlRoZSAnezB9JyBleHRlbnNpb24gcHJlZmVycyB0byB1c2UgYW4gZXh0ZXJuYWwgaXNzdWUgcmVwb3J0ZXIuIFRvIGJlIHRha2VuIHRvIHRoYXQgaXNzdWUgcmVwb3J0aW5nIGV4cGVyaWVuY2UsIGNsaWNrIHRoZSBidXR0b24gYmVsb3cuXCIsIHNlbGVjdGVkRXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSk7XG5cdFx0XHR0aGlzLnB1YmxpY0dpdGh1YkJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdvcGVuSXNzdWVSZXBvcnRlcicsIFwiT3BlbiBFeHRlcm5hbCBJc3N1ZSBSZXBvcnRlclwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZmlsZU9uRXh0ZW5zaW9uICYmIHNlbGVjdGVkRXh0ZW5zaW9uPy5kYXRhKSB7XG5cdFx0XHRjb25zdCBkYXRhID0gc2VsZWN0ZWRFeHRlbnNpb24/LmRhdGE7XG5cdFx0XHQoZXh0ZW5zaW9uRGF0YVRleHRBcmVhIGFzIEhUTUxFbGVtZW50KS5pbm5lclRleHQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cdFx0XHQoZXh0ZW5zaW9uRGF0YVRleHRBcmVhIGFzIEhUTUxUZXh0QXJlYUVsZW1lbnQpLnJlYWRPbmx5ID0gdHJ1ZTtcblx0XHRcdHNob3coZXh0ZW5zaW9uRGF0YUJsb2NrKTtcblx0XHR9XG5cblx0XHQvLyBvbmx5IGlmIHdlIGtub3cgY29tZXMgZnJvbSB0aGUgb3BlbiByZXBvcnRlciBjb21tYW5kXG5cdFx0aWYgKGZpbGVPbkV4dGVuc2lvbiAmJiB0aGlzLm9wZW5SZXBvcnRlcikge1xuXHRcdFx0KGV4dGVuc2lvbkRhdGFUZXh0QXJlYSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS5yZWFkT25seSA9IHRydWU7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Ly8gZGVsYXkgdG8gbWFrZSBzdXJlIGZyb20gY29tbWFuZCBvciBub3Rcblx0XHRcdFx0aWYgKHRoaXMub3BlblJlcG9ydGVyKSB7XG5cdFx0XHRcdFx0c2hvdyhleHRlbnNpb25EYXRhQmxvY2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMDApO1xuXHRcdFx0c2hvdyhleHRlbnNpb25EYXRhQmxvY2spO1xuXHRcdH1cblxuXHRcdGlmIChpc3N1ZVR5cGUgPT09IElzc3VlVHlwZS5CdWcpIHtcblx0XHRcdGlmICghZmlsZU9uTWFya2V0cGxhY2UpIHtcblx0XHRcdFx0c2hvdyhibG9ja0NvbnRhaW5lcik7XG5cdFx0XHRcdHNob3coc3lzdGVtQmxvY2spO1xuXHRcdFx0XHRzaG93KGV4cGVyaW1lbnRzQmxvY2spO1xuXHRcdFx0XHRpZiAoIWZpbGVPbkV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHNob3coZXh0ZW5zaW9uc0Jsb2NrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXNldChkZXNjcmlwdGlvblRpdGxlLCBsb2NhbGl6ZSgnc3RlcHNUb1JlcHJvZHVjZScsIFwiU3RlcHMgdG8gUmVwcm9kdWNlXCIpICsgJyAnLCAkKCdzcGFuLnJlcXVpcmVkLWlucHV0JywgdW5kZWZpbmVkLCAnKicpKTtcblx0XHRcdHJlc2V0KGRlc2NyaXB0aW9uU3VidGl0bGUsIGxvY2FsaXplKCdidWdEZXNjcmlwdGlvbicsIFwiU2hhcmUgdGhlIHN0ZXBzIG5lZWRlZCB0byByZWxpYWJseSByZXByb2R1Y2UgdGhlIHByb2JsZW0uIFBsZWFzZSBpbmNsdWRlIGFjdHVhbCBhbmQgZXhwZWN0ZWQgcmVzdWx0cy4gV2Ugc3VwcG9ydCBHaXRIdWItZmxhdm9yZWQgTWFya2Rvd24uIFlvdSB3aWxsIGJlIGFibGUgdG8gZWRpdCB5b3VyIGlzc3VlIGFuZCBhZGQgc2NyZWVuc2hvdHMgd2hlbiB3ZSBwcmV2aWV3IGl0IG9uIEdpdEh1Yi5cIikpO1xuXHRcdH0gZWxzZSBpZiAoaXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSkge1xuXHRcdFx0aWYgKCFmaWxlT25NYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRzaG93KGJsb2NrQ29udGFpbmVyKTtcblx0XHRcdFx0c2hvdyhzeXN0ZW1CbG9jayk7XG5cdFx0XHRcdHNob3cocHJvY2Vzc0Jsb2NrKTtcblx0XHRcdFx0c2hvdyh3b3Jrc3BhY2VCbG9jayk7XG5cdFx0XHRcdHNob3coZXhwZXJpbWVudHNCbG9jayk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaWxlT25FeHRlbnNpb24pIHtcblx0XHRcdFx0c2hvdyhleHRlbnNpb25TZWxlY3Rvcik7XG5cdFx0XHR9IGVsc2UgaWYgKCFmaWxlT25NYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRzaG93KGV4dGVuc2lvbnNCbG9jayk7XG5cdFx0XHR9XG5cblx0XHRcdHJlc2V0KGRlc2NyaXB0aW9uVGl0bGUsIGxvY2FsaXplKCdzdGVwc1RvUmVwcm9kdWNlJywgXCJTdGVwcyB0byBSZXByb2R1Y2VcIikgKyAnICcsICQoJ3NwYW4ucmVxdWlyZWQtaW5wdXQnLCB1bmRlZmluZWQsICcqJykpO1xuXHRcdFx0cmVzZXQoZGVzY3JpcHRpb25TdWJ0aXRsZSwgbG9jYWxpemUoJ3BlcmZvcm1hbmNlSXNzdWVEZXNjaXB0aW9uJywgXCJXaGVuIGRpZCB0aGlzIHBlcmZvcm1hbmNlIGlzc3VlIGhhcHBlbj8gRG9lcyBpdCBvY2N1ciBvbiBzdGFydHVwIG9yIGFmdGVyIGEgc3BlY2lmaWMgc2VyaWVzIG9mIGFjdGlvbnM/IFdlIHN1cHBvcnQgR2l0SHViLWZsYXZvcmVkIE1hcmtkb3duLiBZb3Ugd2lsbCBiZSBhYmxlIHRvIGVkaXQgeW91ciBpc3N1ZSBhbmQgYWRkIHNjcmVlbnNob3RzIHdoZW4gd2UgcHJldmlldyBpdCBvbiBHaXRIdWIuXCIpKTtcblx0XHR9IGVsc2UgaWYgKGlzc3VlVHlwZSA9PT0gSXNzdWVUeXBlLkZlYXR1cmVSZXF1ZXN0KSB7XG5cdFx0XHRyZXNldChkZXNjcmlwdGlvblRpdGxlLCBsb2NhbGl6ZSgnZGVzY3JpcHRpb24nLCBcIkRlc2NyaXB0aW9uXCIpICsgJyAnLCAkKCdzcGFuLnJlcXVpcmVkLWlucHV0JywgdW5kZWZpbmVkLCAnKicpKTtcblx0XHRcdHJlc2V0KGRlc2NyaXB0aW9uU3VidGl0bGUsIGxvY2FsaXplKCdmZWF0dXJlUmVxdWVzdERlc2NyaXB0aW9uJywgXCJQbGVhc2UgZGVzY3JpYmUgdGhlIGZlYXR1cmUgeW91IHdvdWxkIGxpa2UgdG8gc2VlLiBXZSBzdXBwb3J0IEdpdEh1Yi1mbGF2b3JlZCBNYXJrZG93bi4gWW91IHdpbGwgYmUgYWJsZSB0byBlZGl0IHlvdXIgaXNzdWUgYW5kIGFkZCBzY3JlZW5zaG90cyB3aGVuIHdlIHByZXZpZXcgaXQgb24gR2l0SHViLlwiKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlSW5wdXQoaW5wdXRJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaW5wdXRFbGVtZW50ID0gKDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoaW5wdXRJZCkpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGlucHV0VmFsaWRhdGlvbk1lc3NhZ2UgPSB0aGlzLmdldEVsZW1lbnRCeUlkKGAke2lucHV0SWR9LWVtcHR5LWVycm9yYCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25TaG9ydE1lc3NhZ2UgPSB0aGlzLmdldEVsZW1lbnRCeUlkKGBkZXNjcmlwdGlvbi1zaG9ydC1lcnJvcmApO1xuXHRcdGlmIChpbnB1dElkID09PSAnZGVzY3JpcHRpb24nICYmIHRoaXMubm9uR2l0SHViSXNzdWVVcmwgJiYgdGhpcy5kYXRhLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKCFpbnB1dEVsZW1lbnQudmFsdWUpIHtcblx0XHRcdGlucHV0RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRpbnB1dFZhbGlkYXRpb25NZXNzYWdlPy5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHRcdGRlc2NyaXB0aW9uU2hvcnRNZXNzYWdlPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKGlucHV0SWQgPT09ICdkZXNjcmlwdGlvbicgJiYgaW5wdXRFbGVtZW50LnZhbHVlLmxlbmd0aCA8IDEwKSB7XG5cdFx0XHRpbnB1dEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW52YWxpZC1pbnB1dCcpO1xuXHRcdFx0ZGVzY3JpcHRpb25TaG9ydE1lc3NhZ2U/LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdFx0aW5wdXRWYWxpZGF0aW9uTWVzc2FnZT8uY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlucHV0RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRpbnB1dFZhbGlkYXRpb25NZXNzYWdlPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdGlmIChpbnB1dElkID09PSAnZGVzY3JpcHRpb24nKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uU2hvcnRNZXNzYWdlPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZUlucHV0cygpOiBib29sZWFuIHtcblx0XHRsZXQgaXNWYWxpZCA9IHRydWU7XG5cdFx0Wydpc3N1ZS10aXRsZScsICdkZXNjcmlwdGlvbicsICdpc3N1ZS1zb3VyY2UnXS5mb3JFYWNoKGVsZW1lbnRJZCA9PiB7XG5cdFx0XHRpc1ZhbGlkID0gdGhpcy52YWxpZGF0ZUlucHV0KGVsZW1lbnRJZCkgJiYgaXNWYWxpZDtcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5maWxlT25FeHRlbnNpb24oKSkge1xuXHRcdFx0aXNWYWxpZCA9IHRoaXMudmFsaWRhdGVJbnB1dCgnZXh0ZW5zaW9uLXNlbGVjdG9yJykgJiYgaXNWYWxpZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNWYWxpZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzdWJtaXRUb0dpdEh1Yihpc3N1ZVRpdGxlOiBzdHJpbmcsIGlzc3VlQm9keTogc3RyaW5nLCBnaXRIdWJEZXRhaWxzOiB7IG93bmVyOiBzdHJpbmc7IHJlcG9zaXRvcnlOYW1lOiBzdHJpbmcgfSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHVybCA9IGBodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zLyR7Z2l0SHViRGV0YWlscy5vd25lcn0vJHtnaXRIdWJEZXRhaWxzLnJlcG9zaXRvcnlOYW1lfS9pc3N1ZXNgO1xuXHRcdGNvbnN0IGluaXQgPSB7XG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dGl0bGU6IGlzc3VlVGl0bGUsXG5cdFx0XHRcdGJvZHk6IGlzc3VlQm9keVxuXHRcdFx0fSksXG5cdFx0XHRoZWFkZXJzOiBuZXcgSGVhZGVycyh7XG5cdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke3RoaXMuZGF0YS5naXRodWJBY2Nlc3NUb2tlbn1gLFxuXHRcdFx0XHQnVXNlci1BZ2VudCc6ICdyZXF1ZXN0J1xuXHRcdFx0fSlcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh1cmwsIGluaXQpO1xuXHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgR2l0SHViIFVSTCBwcm92aWRlZC4nKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXHRcdGF3YWl0IHRoaXMub3BlbkxpbmsocmVzdWx0Lmh0bWxfdXJsKTtcblx0XHR0aGlzLmNsb3NlKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY3JlYXRlSXNzdWUoc2hvdWxkQ3JlYXRlPzogYm9vbGVhbiwgcHJpdmF0ZVVyaT86IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBzZWxlY3RlZEV4dGVuc2lvbiA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHQvLyBTaG9ydCBjaXJjdWl0IGlmIHRoZSBleHRlbnNpb24gcHJvdmlkZXMgYSBjdXN0b20gaXNzdWUgaGFuZGxlclxuXHRcdGlmICh0aGlzLm5vbkdpdEh1Yklzc3VlVXJsKSB7XG5cdFx0XHRjb25zdCB1cmwgPSB0aGlzLmdldEV4dGVuc2lvbkJ1Z3NVcmwoKTtcblx0XHRcdGlmICh1cmwpIHtcblx0XHRcdFx0dGhpcy5oYXNCZWVuU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnZhbGlkYXRlSW5wdXRzKCkpIHtcblx0XHRcdC8vIElmIGlucHV0cyBhcmUgaW52YWxpZCwgc2V0IGZvY3VzIHRvIHRoZSBmaXJzdCBvbmUgYW5kIGFkZCBsaXN0ZW5lcnMgb24gdGhlbVxuXHRcdFx0Ly8gdG8gZGV0ZWN0IGZ1cnRoZXIgY2hhbmdlc1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBpbnZhbGlkSW5wdXQgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdpbnZhbGlkLWlucHV0Jyk7XG5cdFx0XHRpZiAoaW52YWxpZElucHV0Lmxlbmd0aCkge1xuXHRcdFx0XHQoPEhUTUxJbnB1dEVsZW1lbnQ+aW52YWxpZElucHV0WzBdKS5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2lzc3VlLXRpdGxlJywgJ2lucHV0JywgXyA9PiB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVJbnB1dCgnaXNzdWUtdGl0bGUnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2Rlc2NyaXB0aW9uJywgJ2lucHV0JywgXyA9PiB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVJbnB1dCgnZGVzY3JpcHRpb24nKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIoJ2lzc3VlLXNvdXJjZScsICdjaGFuZ2UnLCBfID0+IHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdpc3N1ZS1zb3VyY2UnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAodGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZmlsZU9uRXh0ZW5zaW9uKCkpIHtcblx0XHRcdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKCdleHRlbnNpb24tc2VsZWN0b3InLCAnY2hhbmdlJywgXyA9PiB7XG5cdFx0XHRcdFx0dGhpcy52YWxpZGF0ZUlucHV0KCdleHRlbnNpb24tc2VsZWN0b3InKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLmhhc0JlZW5TdWJtaXR0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaXNzdWVUaXRsZSA9ICg8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpKS52YWx1ZTtcblx0XHRjb25zdCBpc3N1ZUJvZHkgPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5zZXJpYWxpemUoKTtcblxuXHRcdGxldCBpc3N1ZVVybCA9IHByaXZhdGVVcmkgPyB0aGlzLmdldFByaXZhdGVJc3N1ZVVybCgpIDogdGhpcy5nZXRJc3N1ZVVybCgpO1xuXHRcdGlmICghaXNzdWVVcmwpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoYE5vICR7cHJpdmF0ZVVyaSA/ICdwcml2YXRlICcgOiAnJ31pc3N1ZSB1cmwgZm91bmRgKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHNlbGVjdGVkRXh0ZW5zaW9uPy51cmkpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUoc2VsZWN0ZWRFeHRlbnNpb24udXJpKTtcblx0XHRcdGlzc3VlVXJsID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2l0SHViRGV0YWlscyA9IHRoaXMucGFyc2VHaXRIdWJVcmwoaXNzdWVVcmwpO1xuXHRcdGlmICh0aGlzLmRhdGEuZ2l0aHViQWNjZXNzVG9rZW4gJiYgZ2l0SHViRGV0YWlscyAmJiBzaG91bGRDcmVhdGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnN1Ym1pdFRvR2l0SHViKGlzc3VlVGl0bGUsIGlzc3VlQm9keSwgZ2l0SHViRGV0YWlscyk7XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgYmFzZVVybCA9IHRoaXMuZ2V0SXNzdWVVcmxXaXRoVGl0bGUoKDxIVE1MSW5wdXRFbGVtZW50PnRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2lzc3VlLXRpdGxlJykpLnZhbHVlLCBpc3N1ZVVybCk7XG5cdFx0bGV0IHVybCA9IGJhc2VVcmwgKyBgJmJvZHk9JHtlbmNvZGVVUklDb21wb25lbnQoaXNzdWVCb2R5KX1gO1xuXG5cdFx0dXJsID0gdGhpcy5hZGRUZW1wbGF0ZVRvVXJsKHVybCwgZ2l0SHViRGV0YWlscz8ub3duZXIsIGdpdEh1YkRldGFpbHM/LnJlcG9zaXRvcnlOYW1lKTtcblxuXHRcdGlmICh1cmwubGVuZ3RoID4gTUFYX1VSTF9MRU5HVEgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHVybCA9IGF3YWl0IHRoaXMud3JpdGVUb0NsaXBib2FyZChiYXNlVXJsLCBpc3N1ZUJvZHkpO1xuXHRcdFx0XHR1cmwgPSB0aGlzLmFkZFRlbXBsYXRlVG9VcmwodXJsLCBnaXRIdWJEZXRhaWxzPy5vd25lciwgZ2l0SHViRGV0YWlscz8ucmVwb3NpdG9yeU5hbWUpO1xuXHRcdFx0fSBjYXRjaCAoXykge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdXcml0aW5nIHRvIGNsaXBib2FyZCBmYWlsZWQnKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMub3BlbkxpbmsodXJsKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHdyaXRlVG9DbGlwYm9hcmQoYmFzZVVybDogc3RyaW5nLCBpc3N1ZUJvZHk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3Qgc2hvdWxkV3JpdGUgPSBhd2FpdCB0aGlzLmlzc3VlRm9ybVNlcnZpY2Uuc2hvd0NsaXBib2FyZERpYWxvZygpO1xuXHRcdGlmICghc2hvdWxkV3JpdGUpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdHJldHVybiBiYXNlVXJsICsgYCZib2R5PSR7ZW5jb2RlVVJJQ29tcG9uZW50KGxvY2FsaXplKCdwYXN0ZURhdGEnLCBcIldlIGhhdmUgd3JpdHRlbiB0aGUgbmVlZGVkIGRhdGEgaW50byB5b3VyIGNsaXBib2FyZCBiZWNhdXNlIGl0IHdhcyB0b28gbGFyZ2UgdG8gc2VuZC4gUGxlYXNlIHBhc3RlLlwiKSl9YDtcblx0fVxuXG5cdHB1YmxpYyBhZGRUZW1wbGF0ZVRvVXJsKGJhc2VVcmw6IHN0cmluZywgb3duZXI/OiBzdHJpbmcsIHJlcG9zaXRvcnlOYW1lPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBpc1ZzY29kZSA9IHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmdldERhdGEoKS5maWxlT25Qcm9kdWN0O1xuXHRcdGNvbnN0IGlzTWljcm9zb2Z0ID0gb3duZXI/LnRvTG93ZXJDYXNlKCkgPT09ICdtaWNyb3NvZnQnO1xuXHRcdGNvbnN0IG5lZWRzVGVtcGxhdGUgPSBpc1ZzY29kZSB8fCAoaXNNaWNyb3NvZnQgJiYgKHJlcG9zaXRvcnlOYW1lID09PSAndnNjb2RlJyB8fCByZXBvc2l0b3J5TmFtZSA9PT0gJ3ZzY29kZS1weXRob24nKSk7XG5cblx0XHRpZiAobmVlZHNUZW1wbGF0ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gbmV3IFVSTChiYXNlVXJsKTtcblx0XHRcdFx0dXJsLnNlYXJjaFBhcmFtcy5zZXQoJ3RlbXBsYXRlJywgJ2J1Z19yZXBvcnQubWQnKTtcblx0XHRcdFx0cmV0dXJuIHVybC50b1N0cmluZygpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGZhbGxiYWNrIGlmIGJhc2VVcmwgaXMgbm90IGEgdmFsaWQgVVJMXG5cdFx0XHRcdHJldHVybiBiYXNlVXJsICsgJyZ0ZW1wbGF0ZT1idWdfcmVwb3J0Lm1kJztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGJhc2VVcmw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SXNzdWVVcmwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwuZmlsZU9uRXh0ZW5zaW9uKClcblx0XHRcdD8gdGhpcy5nZXRFeHRlbnNpb25HaXRIdWJVcmwoKVxuXHRcdFx0OiB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCkuZmlsZU9uTWFya2V0cGxhY2Vcblx0XHRcdFx0PyB0aGlzLnByb2R1Y3QucmVwb3J0TWFya2V0cGxhY2VJc3N1ZVVybCFcblx0XHRcdFx0OiB0aGlzLnByb2R1Y3QucmVwb3J0SXNzdWVVcmwhO1xuXHR9XG5cblx0Ly8gZm9yIHdoZW4gY29tbWFuZCAnd29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlcicgcGFzc2VzIGFsb25nIGFcblx0Ly8gYHByaXZhdGVVcmlgIFVyaUNvbXBvbmVudHMgdmFsdWVcblx0cHVibGljIGdldFByaXZhdGVJc3N1ZVVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBVUkkucmV2aXZlKHRoaXMuZGF0YS5wcml2YXRlVXJpKT8udG9TdHJpbmcoKTtcblx0fVxuXG5cdHB1YmxpYyBwYXJzZUdpdEh1YlVybCh1cmw6IHN0cmluZyk6IHVuZGVmaW5lZCB8IHsgcmVwb3NpdG9yeU5hbWU6IHN0cmluZzsgb3duZXI6IHN0cmluZyB9IHtcblx0XHQvLyBBc3N1bWVzIGEgR2l0SHViIHVybCB0byBhIHBhcnRpY3VsYXIgcmVwbywgaHR0cHM6Ly9naXRodWIuY29tL3JlcG9zaXRvcnlOYW1lL293bmVyLlxuXHRcdC8vIFJlcG9zaXRvcnkgbmFtZSBhbmQgb3duZXIgY2Fubm90IGNvbnRhaW4gJy8nXG5cdFx0Y29uc3QgbWF0Y2ggPSAvXmh0dHBzPzpcXC9cXC9naXRodWJcXC5jb21cXC8oW15cXC9dKilcXC8oW15cXC9dKikuKi8uZXhlYyh1cmwpO1xuXHRcdGlmIChtYXRjaCAmJiBtYXRjaC5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG93bmVyOiBtYXRjaFsxXSxcblx0XHRcdFx0cmVwb3NpdG9yeU5hbWU6IG1hdGNoWzJdXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdObyBHaXRIdWIgaXNzdWVzIG1hdGNoJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXh0ZW5zaW9uR2l0SHViVXJsKCk6IHN0cmluZyB7XG5cdFx0bGV0IHJlcG9zaXRvcnlVcmwgPSAnJztcblx0XHRjb25zdCBidWdzVXJsID0gdGhpcy5nZXRFeHRlbnNpb25CdWdzVXJsKCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVXJsID0gdGhpcy5nZXRFeHRlbnNpb25SZXBvc2l0b3J5VXJsKCk7XG5cdFx0Ly8gSWYgZ2l2ZW4sIHRyeSB0byBtYXRjaCB0aGUgZXh0ZW5zaW9uJ3MgYnVnIHVybFxuXHRcdGlmIChidWdzVXJsICYmIGJ1Z3NVcmwubWF0Y2goL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvKFteXFwvXSopXFwvKFteXFwvXSopXFwvPyhcXC9pc3N1ZXMpPyQvKSkge1xuXHRcdFx0Ly8gbWF0Y2hlcyBleGFjdGx5OiBodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9pc3N1ZXNcblx0XHRcdHJlcG9zaXRvcnlVcmwgPSBub3JtYWxpemVHaXRIdWJVcmwoYnVnc1VybCk7XG5cdFx0fSBlbHNlIGlmIChleHRlbnNpb25VcmwgJiYgZXh0ZW5zaW9uVXJsLm1hdGNoKC9eaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLyhbXlxcL10qKVxcLyhbXlxcL10qKSQvKSkge1xuXHRcdFx0Ly8gbWF0Y2hlcyBleGFjdGx5OiBodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwb1xuXHRcdFx0cmVwb3NpdG9yeVVybCA9IG5vcm1hbGl6ZUdpdEh1YlVybChleHRlbnNpb25VcmwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5vbkdpdEh1Yklzc3VlVXJsID0gdHJ1ZTtcblx0XHRcdHJlcG9zaXRvcnlVcmwgPSBidWdzVXJsIHx8IGV4dGVuc2lvblVybCB8fCAnJztcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVwb3NpdG9yeVVybDtcblx0fVxuXG5cdHB1YmxpYyBnZXRJc3N1ZVVybFdpdGhUaXRsZShpc3N1ZVRpdGxlOiBzdHJpbmcsIHJlcG9zaXRvcnlVcmw6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuaXNzdWVSZXBvcnRlck1vZGVsLmZpbGVPbkV4dGVuc2lvbigpKSB7XG5cdFx0XHRyZXBvc2l0b3J5VXJsID0gcmVwb3NpdG9yeVVybCArICcvaXNzdWVzL25ldyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVlcnlTdHJpbmdQcmVmaXggPSByZXBvc2l0b3J5VXJsLmluZGV4T2YoJz8nKSA9PT0gLTEgPyAnPycgOiAnJic7XG5cdFx0cmV0dXJuIGAke3JlcG9zaXRvcnlVcmx9JHtxdWVyeVN0cmluZ1ByZWZpeH10aXRsZT0ke2VuY29kZVVSSUNvbXBvbmVudChpc3N1ZVRpdGxlKX1gO1xuXHR9XG5cblx0cHVibGljIGNsZWFyRXh0ZW5zaW9uRGF0YSgpOiB2b2lkIHtcblx0XHR0aGlzLm5vbkdpdEh1Yklzc3VlVXJsID0gZmFsc2U7XG5cdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgZXh0ZW5zaW9uRGF0YTogdW5kZWZpbmVkIH0pO1xuXHRcdHRoaXMuZGF0YS5pc3N1ZUJvZHkgPSB0aGlzLmRhdGEuaXNzdWVCb2R5IHx8ICcnO1xuXHRcdHRoaXMuZGF0YS5kYXRhID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuZGF0YS51cmkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5kYXRhLnByaXZhdGVVcmkgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlRXh0ZW5zaW9uU3RhdHVzKGV4dGVuc2lvbjogSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGEpIHtcblx0XHR0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC51cGRhdGUoeyBzZWxlY3RlZEV4dGVuc2lvbjogZXh0ZW5zaW9uIH0pO1xuXG5cdFx0Ly8gdXNlcyB0aGlzLmNvbmZpZ3V1cmF0aW9uLmRhdGEgdG8gZW5zdXJlIHRoYXQgZGF0YSBpcyBjb21pbmcgZnJvbSBgb3BlblJlcG9ydGVyYCBjb21tYW5kLlxuXHRcdGNvbnN0IHRlbXBsYXRlID0gdGhpcy5kYXRhLmlzc3VlQm9keTtcblx0XHRpZiAodGVtcGxhdGUpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25UZXh0QXJlYSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2Rlc2NyaXB0aW9uJykhO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25UZXh0ID0gKGRlc2NyaXB0aW9uVGV4dEFyZWEgYXMgSFRNTFRleHRBcmVhRWxlbWVudCkudmFsdWU7XG5cdFx0XHRpZiAoZGVzY3JpcHRpb25UZXh0ID09PSAnJyB8fCAhZGVzY3JpcHRpb25UZXh0LmluY2x1ZGVzKHRlbXBsYXRlLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdGNvbnN0IGZ1bGxUZXh0QXJlYSA9IGRlc2NyaXB0aW9uVGV4dCArIChkZXNjcmlwdGlvblRleHQgPT09ICcnID8gJycgOiAnXFxuJykgKyB0ZW1wbGF0ZS50b1N0cmluZygpO1xuXHRcdFx0XHQoZGVzY3JpcHRpb25UZXh0QXJlYSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50KS52YWx1ZSA9IGZ1bGxUZXh0QXJlYTtcblx0XHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgaXNzdWVEZXNjcmlwdGlvbjogZnVsbFRleHRBcmVhIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLmRhdGEuZGF0YTtcblx0XHRpZiAoZGF0YSkge1xuXHRcdFx0dGhpcy5pc3N1ZVJlcG9ydGVyTW9kZWwudXBkYXRlKHsgZXh0ZW5zaW9uRGF0YTogZGF0YSB9KTtcblx0XHRcdGV4dGVuc2lvbi5kYXRhID0gZGF0YTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGF0YUJsb2NrID0gdGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLmJsb2NrLWV4dGVuc2lvbi1kYXRhJykhO1xuXHRcdFx0c2hvdyhleHRlbnNpb25EYXRhQmxvY2spO1xuXHRcdFx0dGhpcy5yZW5kZXJCbG9ja3MoKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmkgPSB0aGlzLmRhdGEudXJpO1xuXHRcdGlmICh1cmkpIHtcblx0XHRcdGV4dGVuc2lvbi51cmkgPSB1cmk7XG5cdFx0XHR0aGlzLnVwZGF0ZUlzc3VlUmVwb3J0ZXJVcmkoZXh0ZW5zaW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLnZhbGlkYXRlU2VsZWN0ZWRFeHRlbnNpb24oKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCB0aXRsZSA9ICg8SFRNTElucHV0RWxlbWVudD50aGlzLmdldEVsZW1lbnRCeUlkKCdpc3N1ZS10aXRsZScpKS52YWx1ZTtcblx0XHR0aGlzLnNlYXJjaEV4dGVuc2lvbklzc3Vlcyh0aXRsZSk7XG5cblx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXHRcdHRoaXMucmVuZGVyQmxvY2tzKCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGVTZWxlY3RlZEV4dGVuc2lvbigpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25WYWxpZGF0aW9uTWVzc2FnZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1zZWxlY3Rpb24tdmFsaWRhdGlvbi1lcnJvcicpITtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25WYWxpZGF0aW9uTm9VcmxzTWVzc2FnZSA9IHRoaXMuZ2V0RWxlbWVudEJ5SWQoJ2V4dGVuc2lvbi1zZWxlY3Rpb24tdmFsaWRhdGlvbi1lcnJvci1uby11cmwnKSE7XG5cdFx0aGlkZShleHRlbnNpb25WYWxpZGF0aW9uTWVzc2FnZSk7XG5cdFx0aGlkZShleHRlbnNpb25WYWxpZGF0aW9uTm9VcmxzTWVzc2FnZSk7XG5cblx0XHRjb25zdCBleHRlbnNpb24gPSB0aGlzLmlzc3VlUmVwb3J0ZXJNb2RlbC5nZXREYXRhKCkuc2VsZWN0ZWRFeHRlbnNpb247XG5cdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxvYWRpbmdFeHRlbnNpb25EYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzVmFsaWRHaXRIdWJVcmwgPSB0aGlzLmdldEV4dGVuc2lvbkdpdEh1YlVybCgpO1xuXHRcdGlmIChoYXNWYWxpZEdpdEh1YlVybCkge1xuXHRcdFx0dGhpcy5wdWJsaWNHaXRodWJCdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0RXh0ZW5zaW9uVmFsaWRhdGlvbk1lc3NhZ2UoKTtcblx0XHRcdHRoaXMucHVibGljR2l0aHViQnV0dG9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0TG9hZGluZyhlbGVtZW50OiBIVE1MRWxlbWVudCkge1xuXHRcdC8vIFNob3cgbG9hZGluZ1xuXHRcdHRoaXMub3BlblJlcG9ydGVyID0gdHJ1ZTtcblx0XHR0aGlzLmxvYWRpbmdFeHRlbnNpb25EYXRhID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRGF0YUNhcHRpb24gPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb24taWQnKSE7XG5cdFx0aGlkZShleHRlbnNpb25EYXRhQ2FwdGlvbik7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25EYXRhQ2FwdGlvbjIgPSBBcnJheS5mcm9tKHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5leHQtcGFyZW5zJykpO1xuXHRcdGV4dGVuc2lvbkRhdGFDYXB0aW9uMi5mb3JFYWNoKGV4dGVuc2lvbkRhdGFDYXB0aW9uMiA9PiBoaWRlKGV4dGVuc2lvbkRhdGFDYXB0aW9uMikpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgc2hvd0xvYWRpbmcgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHQtbG9hZGluZycpITtcblx0XHRzaG93KHNob3dMb2FkaW5nKTtcblx0XHR3aGlsZSAoc2hvd0xvYWRpbmcuZmlyc3RDaGlsZCkge1xuXHRcdFx0c2hvd0xvYWRpbmcuZmlyc3RDaGlsZC5yZW1vdmUoKTtcblx0XHR9XG5cdFx0c2hvd0xvYWRpbmcuYXBwZW5kKGVsZW1lbnQpO1xuXG5cdFx0dGhpcy5yZW5kZXJCbG9ja3MoKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVMb2FkaW5nKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBmcm9tUmVwb3J0ZXI6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdHRoaXMub3BlblJlcG9ydGVyID0gZnJvbVJlcG9ydGVyO1xuXHRcdHRoaXMubG9hZGluZ0V4dGVuc2lvbkRhdGEgPSBmYWxzZTtcblx0XHR0aGlzLnVwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRGF0YUNhcHRpb24gPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb24taWQnKSE7XG5cdFx0c2hvdyhleHRlbnNpb25EYXRhQ2FwdGlvbik7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBleHRlbnNpb25EYXRhQ2FwdGlvbjIgPSBBcnJheS5mcm9tKHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5leHQtcGFyZW5zJykpO1xuXHRcdGV4dGVuc2lvbkRhdGFDYXB0aW9uMi5mb3JFYWNoKGV4dGVuc2lvbkRhdGFDYXB0aW9uMiA9PiBzaG93KGV4dGVuc2lvbkRhdGFDYXB0aW9uMikpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaGlkZUxvYWRpbmcgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHQtbG9hZGluZycpITtcblx0XHRoaWRlKGhpZGVMb2FkaW5nKTtcblx0XHRpZiAoaGlkZUxvYWRpbmcuZmlyc3RDaGlsZCkge1xuXHRcdFx0ZWxlbWVudC5yZW1vdmUoKTtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJCbG9ja3MoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0RXh0ZW5zaW9uVmFsaWRhdGlvbk1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVmFsaWRhdGlvbk1lc3NhZ2UgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb24tc2VsZWN0aW9uLXZhbGlkYXRpb24tZXJyb3InKSE7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVmFsaWRhdGlvbk5vVXJsc01lc3NhZ2UgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb24tc2VsZWN0aW9uLXZhbGlkYXRpb24tZXJyb3Itbm8tdXJsJykhO1xuXHRcdGNvbnN0IGJ1Z3NVcmwgPSB0aGlzLmdldEV4dGVuc2lvbkJ1Z3NVcmwoKTtcblx0XHRpZiAoYnVnc1VybCkge1xuXHRcdFx0c2hvdyhleHRlbnNpb25WYWxpZGF0aW9uTWVzc2FnZSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGxpbmsgPSB0aGlzLmdldEVsZW1lbnRCeUlkKCdleHRlbnNpb25CdWdzTGluaycpITtcblx0XHRcdGxpbmsudGV4dENvbnRlbnQgPSBidWdzVXJsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvblVybCA9IHRoaXMuZ2V0RXh0ZW5zaW9uUmVwb3NpdG9yeVVybCgpO1xuXHRcdGlmIChleHRlbnNpb25VcmwpIHtcblx0XHRcdHNob3coZXh0ZW5zaW9uVmFsaWRhdGlvbk1lc3NhZ2UpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBsaW5rID0gdGhpcy5nZXRFbGVtZW50QnlJZCgnZXh0ZW5zaW9uQnVnc0xpbmsnKTtcblx0XHRcdGxpbmshLnRleHRDb250ZW50ID0gZXh0ZW5zaW9uVXJsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNob3coZXh0ZW5zaW9uVmFsaWRhdGlvbk5vVXJsc01lc3NhZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcm9jZXNzSW5mbyhzdGF0ZTogSXNzdWVSZXBvcnRlck1vZGVsRGF0YSkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay1wcm9jZXNzIC5ibG9jay1pbmZvJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0cmVzZXQodGFyZ2V0LCAkKCdjb2RlJywgdW5kZWZpbmVkLCBzdGF0ZS5wcm9jZXNzSW5mbyA/PyAnJykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlV29ya3NwYWNlSW5mbyhzdGF0ZTogSXNzdWVSZXBvcnRlck1vZGVsRGF0YSkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJy5ibG9jay13b3Jrc3BhY2UgLmJsb2NrLWluZm8gY29kZScpIS50ZXh0Q29udGVudCA9ICdcXG4nICsgc3RhdGUud29ya3NwYWNlSW5mbztcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVFeHRlbnNpb25UYWJsZShleHRlbnNpb25zOiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YVtdLCBudW1UaGVtZUV4dGVuc2lvbnM6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYmxvY2stZXh0ZW5zaW9ucyAuYmxvY2staW5mbycpO1xuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdGlmICh0aGlzLmRpc2FibGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdHJlc2V0KHRhcmdldCwgbG9jYWxpemUoJ2Rpc2FibGVkRXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9ucyBhcmUgZGlzYWJsZWRcIikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRoZW1lRXhjbHVzaW9uU3RyID0gbnVtVGhlbWVFeHRlbnNpb25zID8gYFxcbigke251bVRoZW1lRXh0ZW5zaW9uc30gdGhlbWUgZXh0ZW5zaW9ucyBleGNsdWRlZClgIDogJyc7XG5cdFx0XHRleHRlbnNpb25zID0gZXh0ZW5zaW9ucyB8fCBbXTtcblxuXHRcdFx0aWYgKCFleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR0YXJnZXQuaW5uZXJUZXh0ID0gJ0V4dGVuc2lvbnM6IG5vbmUnICsgdGhlbWVFeGNsdXNpb25TdHI7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmVzZXQodGFyZ2V0LCB0aGlzLmdldEV4dGVuc2lvblRhYmxlSHRtbChleHRlbnNpb25zKSwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGhlbWVFeGNsdXNpb25TdHIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvblRhYmxlSHRtbChleHRlbnNpb25zOiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YVtdKTogSFRNTFRhYmxlRWxlbWVudCB7XG5cdFx0cmV0dXJuICQoJ3RhYmxlJywgdW5kZWZpbmVkLFxuXHRcdFx0JCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3RoJywgdW5kZWZpbmVkLCAnRXh0ZW5zaW9uJyksXG5cdFx0XHRcdCQoJ3RoJywgdW5kZWZpbmVkLCAnQXV0aG9yICh0cnVuY2F0ZWQpJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHQkKCd0aCcsIHVuZGVmaW5lZCwgJ1ZlcnNpb24nKVxuXHRcdFx0KSxcblx0XHRcdC4uLmV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiAkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIGV4dGVuc2lvbi5uYW1lKSxcblx0XHRcdFx0JCgndGQnLCB1bmRlZmluZWQsIGV4dGVuc2lvbi5wdWJsaXNoZXI/LnN1YnN0cigwLCAzKSA/PyAnTi9BJyksXG5cdFx0XHRcdCQoJ3RkJywgdW5kZWZpbmVkLCBleHRlbnNpb24udmVyc2lvbilcblx0XHRcdCkpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkxpbmsoZXZlbnRPclVybDogTW91c2VFdmVudCB8IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlb2YgZXZlbnRPclVybCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdC8vIERpcmVjdCBVUkwgY2FsbFxuXHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oZXZlbnRPclVybCwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE1vdXNlRXZlbnQgY2FsbFxuXHRcdFx0Y29uc3QgZXZlbnQgPSBldmVudE9yVXJsO1xuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Ly8gRXhjbHVkZSByaWdodCBjbGlja1xuXHRcdFx0aWYgKGV2ZW50LndoaWNoIDwgMykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbigoPEhUTUxBbmNob3JFbGVtZW50PmV2ZW50LnRhcmdldCkuaHJlZiwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldEVsZW1lbnRCeUlkPFQgZXh0ZW5kcyBIVE1MRWxlbWVudCA9IEhUTUxFbGVtZW50PihlbGVtZW50SWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5nZXRFbGVtZW50QnlJZChlbGVtZW50SWQpIGFzIFQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhZGRFdmVudExpc3RlbmVyKGVsZW1lbnRJZDogc3RyaW5nLCBldmVudFR5cGU6IHN0cmluZywgaGFuZGxlcjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmdldEVsZW1lbnRCeUlkKGVsZW1lbnRJZCk7XG5cdFx0ZWxlbWVudD8uYWRkRXZlbnRMaXN0ZW5lcihldmVudFR5cGUsIGhhbmRsZXIpO1xuXHR9XG59XG5cbi8vIGhlbHBlciBmdW5jdGlvbnNcblxuZXhwb3J0IGZ1bmN0aW9uIGhpZGUoZWw6IEVsZW1lbnQgfCB1bmRlZmluZWQgfCBudWxsKSB7XG5cdGVsPy5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBzaG93KGVsOiBFbGVtZW50IHwgdW5kZWZpbmVkIHwgbnVsbCkge1xuXHRlbD8uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFNBQVMsR0FBRyxvQkFBb0IsdUJBQXVCLGFBQWE7QUFDcEUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxRQUFRLG9CQUFvQiw0QkFBNEI7QUFDakUsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLHdCQUF3QjtBQUMxQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWEsbUJBQW1CO0FBRXpDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQWtFLGlCQUFpQjtBQUM1RixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUF1RTtBQUNoRixTQUFTLDhCQUE4QjtBQUV2QyxNQUFNLGlCQUFpQjtBQU12QixNQUFNLDRCQUE0QjtBQVFsQyxJQUFLLGNBQUwsa0JBQUtBLGlCQUFMO0FBQ0MsRUFBQUEsYUFBQSxZQUFTO0FBQ1QsRUFBQUEsYUFBQSxlQUFZO0FBQ1osRUFBQUEsYUFBQSxpQkFBYztBQUNkLEVBQUFBLGFBQUEs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
