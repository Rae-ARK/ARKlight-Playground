import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { OS } from "../../../../base/common/platform.js";
import "./media/issueReporterOverlay.css";
import { $, addDisposableListener, append, disposableWindowInterval, EventType, getWindow } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { isRemoteDiagnosticError } from "../../../../platform/diagnostics/common/diagnostics.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles, defaultKeybindingLabelStyles, defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import product from "../../../../platform/product/common/product.js";
import { URI } from "../../../../base/common/uri.js";
import { normalizeGitHubUrl } from "../common/issueReporterUtil.js";
import { IssueSource, IssueType } from "../common/issue.js";
import { IssueReporterModel } from "./issueReporterModel.js";
import { RecordingState } from "./recordingService.js";
import { ScreenshotAnnotationEditor } from "./screenshotAnnotation.js";
const MAX_ATTACHMENTS = 5;
const MAX_SIMILAR_ISSUES = 5;
var WizardStep = /* @__PURE__ */ ((WizardStep2) => {
  WizardStep2[WizardStep2["Attachments"] = 0] = "Attachments";
  WizardStep2[WizardStep2["Describe"] = 1] = "Describe";
  WizardStep2[WizardStep2["Review"] = 2] = "Review";
  return WizardStep2;
})(WizardStep || {});
const STEP_COUNT = 3;
class IssueReporterOverlay {
  constructor(data, recordingSupported = false, container, contextViewService, contextMenuProvider, markdownRendererService, initialHideToolbar = true, resolveExtensionIssueData, openExternalLink, showUpdateBanner = false, refreshPerformanceInfo, resolveKeybinding) {
    this.data = data;
    this.recordingSupported = recordingSupported;
    this.container = container;
    this.contextViewService = contextViewService;
    this.contextMenuProvider = contextMenuProvider;
    this.markdownRendererService = markdownRendererService;
    this.resolveExtensionIssueData = resolveExtensionIssueData;
    this.openExternalLink = openExternalLink;
    this.showUpdateBanner = showUpdateBanner;
    this.refreshPerformanceInfo = refreshPerformanceInfo;
    this.resolveKeybinding = resolveKeybinding;
    this.disposables = new DisposableStore();
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._onDidSubmit = new Emitter();
    this.onDidSubmit = this._onDidSubmit.event;
    this._onDidRequestScreenshot = new Emitter();
    this.onDidRequestScreenshot = this._onDidRequestScreenshot.event;
    this._onDidRequestStartRecording = new Emitter();
    this.onDidRequestStartRecording = this._onDidRequestStartRecording.event;
    this._onDidRequestStopRecording = new Emitter();
    this.onDidRequestStopRecording = this._onDidRequestStopRecording.event;
    this._onDidRequestOpenRecording = new Emitter();
    this.onDidRequestOpenRecording = this._onDidRequestOpenRecording.event;
    this._onDidRequestOpenScreenshot = new Emitter();
    this.onDidRequestOpenScreenshot = this._onDidRequestOpenScreenshot.event;
    this._onDidChangeAttachments = new Emitter();
    /** Fires whenever the screenshot/recording collection changes so the host can persist it. */
    this.onDidChangeAttachments = this._onDidChangeAttachments.event;
    this.stepPages = [];
    // Step 1: Describe (category + description + title)
    this.issueTypeButtons = [];
    this.issueSourceButtons = [];
    this.extensionOptions = [];
    this.didAttemptDescribeSubmit = false;
    this.similarIssuesRequest = 0;
    this.extensionDataRequest = 0;
    this._onDidRequestGenerateTitle = new Emitter();
    this.onDidRequestGenerateTitle = this._onDidRequestGenerateTitle.event;
    this.screenshotDelay = 0;
    this.recordingStartTime = 0;
    this.currentRecordingState = RecordingState.Idle;
    this.delayedScreenshotPending = false;
    this.recordings = [];
    // Step 2: Review
    this.reviewThumbCards = [];
    this.reviewRenderDisposables = new DisposableStore();
    this.similarIssuesDisposables = new DisposableStore();
    this.descriptionGuidanceDisposables = new DisposableStore();
    this.uploading = false;
    this.includeSystemInfo = true;
    this.includeProcessInfo = true;
    this.includeWorkspaceInfo = true;
    this.includeExtensions = true;
    this.includeExperiments = true;
    this.includeExtensionData = false;
    this.diagnosticsCollapsed = false;
    this.performanceInfoLoaded = false;
    this.performanceInfoRefreshing = false;
    // Progress dots
    this.progressDots = [];
    this.currentStep = 0 /* Attachments */;
    this.screenshots = [];
    this.visible = false;
    this.previewOpened = false;
    this._hideToolbarInScreenshots = true;
    this._hideToolbarInScreenshots = initialHideToolbar;
    const hasStandaloneExtensionData = !!data.data && !data.extensionId;
    this.includeExtensionData = hasStandaloneExtensionData;
    this.model = new IssueReporterModel({
      ...data,
      issueType: data.issueType || IssueType.Bug,
      allExtensions: data.enabledExtensions,
      extensionData: hasStandaloneExtensionData ? data.data : void 0,
      includeSystemInfo: true,
      includeWorkspaceInfo: true,
      includeProcessInfo: true,
      includeExtensions: true,
      includeExperiments: true,
      includeExtensionData: hasStandaloneExtensionData
    });
    this.selectedIssueType = data.issueType;
    this.selectedIssueSource = data.issueSource ?? (data.extensionId ? IssueSource.Extension : void 0);
    this.createWizard();
  }
  createWizard() {
    this.wizardPanel = $("div.issue-reporter-wizard");
    this.wizardPanel.setAttribute("role", "dialog");
    this.wizardPanel.setAttribute("aria-label", localize("reportIssue", "Report Issue"));
    this.wizardPanel.setAttribute("tabindex", "-1");
    const toolbar = append(this.wizardPanel, $("div.wizard-toolbar"));
    const progressArea = append(toolbar, $("div.wizard-progress-area"));
    const progressDotsContainer = append(progressArea, $("div.wizard-progress-dots"));
    for (let i = 0; i < STEP_COUNT; i++) {
      const dot = append(progressDotsContainer, $("div.wizard-progress-dot"));
      this.progressDots.push(dot);
    }
    this.stepIndicator = append(progressArea, $("span.wizard-step-indicator"));
    append(progressArea, $("span.wizard-step-separator"));
    this.stepLabel = append(progressArea, $("span.wizard-step-label"));
    const nav = append(toolbar, $("div.wizard-nav"));
    this.backButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
    this.backButton.label = localize("back", "Back");
    this.backButton.element.classList.add("wizard-back");
    this.backButton.element.title = localize("back", "Back");
    this.nextButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, supportIcons: true }));
    this.nextButton.label = localize("next", "Next");
    this.nextButton.element.classList.add("wizard-next");
    this.nextButton.element.title = localize("next", "Next");
    this.updateBanner = append(this.wizardPanel, $("div.wizard-update-banner"));
    this.updateBanner.setAttribute("role", "status");
    this.updateBanner.setAttribute("aria-live", "polite");
    this.updateBanner.textContent = localize("updateAvailable", "A new version of {0} is available.", product.nameLong);
    this.setUpdateAvailable(this.showUpdateBanner);
    this.stepContainer = append(this.wizardPanel, $("div.wizard-step-container"));
    this.createStep0Attachments();
    this.createStep1Describe();
    this.createStep2Review();
    this.registerEventHandlers();
    if (this.data.extensionId) {
      void this.updateSelectedExtension(this.data.extensionId, false);
    }
    this.updateStepUI();
  }
  // Step 0: Attachments
  createStep0Attachments() {
    const page = append(this.stepContainer, $("div.wizard-step"));
    this.stepPages.push(page);
    const heading = append(page, $("h2.wizard-heading"));
    heading.textContent = localize("screenshotsHeading", "Add attachments for better context");
    const subtitle = append(page, $("p.wizard-subtitle"));
    subtitle.textContent = localize("screenshotsSubtitle", "You can add up to {0} screenshots or videos. Navigate VS Code and choose when to capture.", MAX_ATTACHMENTS);
    const captureShortcut = this.resolveKeybinding?.("workbench.action.issueReporter.captureScreenshot");
    const recordShortcut = this.recordingSupported ? this.resolveKeybinding?.("workbench.action.issueReporter.toggleRecording") : void 0;
    if (captureShortcut || recordShortcut) {
      const targetDocument = getWindow(this.container).document;
      const hint = append(page, $("p.wizard-subtitle.wizard-shortcut-hint"));
      const intro = localize("shortcutHintIntro", "Use the floating capture bar, or press");
      hint.appendChild(targetDocument.createTextNode(`${intro} `));
      if (captureShortcut) {
        this.renderShortcutKeycap(hint, captureShortcut);
        hint.appendChild(targetDocument.createTextNode(` ${localize("toCapture", "to capture a screenshot")}`));
      }
      if (captureShortcut && recordShortcut) {
        hint.appendChild(targetDocument.createTextNode(` ${localize("or", "or")} `));
      }
      if (recordShortcut) {
        this.renderShortcutKeycap(hint, recordShortcut);
        hint.appendChild(targetDocument.createTextNode(` ${localize("toRecord", "to start or stop recording")}`));
      }
      hint.appendChild(targetDocument.createTextNode("."));
    }
    this.screenshotContainer = append(page, $("div.wizard-screenshots"));
    this.updateScreenshotThumbnails();
    this.createFloatingCaptureBar();
  }
  createFloatingCaptureBar() {
    const targetWindow = getWindow(this.container);
    const workbench = targetWindow.document.querySelector(".monaco-workbench");
    const mountTarget = workbench ?? targetWindow.document.body;
    this.floatingBar = $("div.issue-reporter-floating-bar");
    const dragArea = append(this.floatingBar, $("div.wizard-floating-drag"));
    dragArea.appendChild(renderIcon(Codicon.gripper));
    const segmented = append(this.floatingBar, $("div.wizard-segmented-btn"));
    const floatingButtonStyles = this.getFloatingBarButtonStyles(targetWindow);
    const captureBtn = this.disposables.add(new Button(segmented, { ...floatingButtonStyles, supportIcons: true }));
    captureBtn.element.classList.add("wizard-segmented-main");
    captureBtn.label = `$(device-camera) ${localize("screenshot", "Screenshot")}`;
    this.captureStripCaptureBtn = captureBtn;
    const delayOptions = this.getScreenshotDelayOptions();
    const delayDropdownButton = this.disposables.add(new Button(segmented, { ...floatingButtonStyles, supportIcons: true }));
    delayDropdownButton.element.classList.add("wizard-segmented-dropdown");
    delayDropdownButton.element.title = localize("captureOptions", "Capture options");
    delayDropdownButton.element.setAttribute("aria-label", localize("captureOptions", "Capture options"));
    delayDropdownButton.label = "$(chevron-down)";
    this.captureStripDelayBtn = delayDropdownButton;
    if (this.contextMenuProvider) {
      let menuOpen = false;
      this.disposables.add(delayDropdownButton.onDidClick(() => {
        if (!delayDropdownButton.enabled || menuOpen) {
          return;
        }
        const hideAction = new Action(
          "hide-toolbar",
          localize("hideToolbarInScreenshots", "Hide Toolbar in Screenshots"),
          void 0,
          true,
          async () => {
            this._hideToolbarInScreenshots = !this._hideToolbarInScreenshots;
          }
        );
        hideAction.checked = this._hideToolbarInScreenshots;
        const actions = delayOptions.map((opt) => {
          const action = new Action(
            `delay-${opt.value}`,
            opt.label,
            void 0,
            true,
            async () => {
              this.screenshotDelay = opt.value;
            }
          );
          action.checked = opt.value === this.screenshotDelay;
          return action;
        });
        const allActions = [hideAction, new Separator(), ...actions];
        menuOpen = true;
        this.contextMenuProvider.showContextMenu({
          getAnchor: () => this.floatingBar,
          getActions: () => allActions,
          skipTelemetry: true,
          onHide: () => {
            menuOpen = false;
            hideAction.dispose();
            for (const a of actions) {
              a.dispose();
            }
          }
        });
      }));
      this.disposables.add(addDisposableListener(dragArea, EventType.POINTER_DOWN, () => {
        dragArea.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      }));
    }
    this.disposables.add(captureBtn.onDidClick(() => {
      if (this.getTotalAttachments() >= MAX_ATTACHMENTS || !captureBtn.enabled) {
        return;
      }
      if (this.screenshotDelay > 0) {
        captureBtn.element.style.minWidth = `${captureBtn.element.offsetWidth}px`;
        captureBtn.enabled = false;
        this.delayedScreenshotPending = true;
        this.updateScreenshotThumbnails();
        this.updateAttachmentButtons();
        let remaining = this.screenshotDelay;
        captureBtn.label = `${remaining}...`;
        const targetWindow2 = getWindow(this.container);
        const intervalDisposable = this.disposables.add(disposableWindowInterval(targetWindow2, () => {
          remaining--;
          if (remaining > 0) {
            captureBtn.label = `${remaining}...`;
          } else {
            this.disposables.delete(intervalDisposable);
            captureBtn.label = `$(device-camera) ${localize("screenshot", "Screenshot")}`;
            captureBtn.element.style.minWidth = "";
            captureBtn.enabled = true;
            this.delayedScreenshotPending = false;
            this.updateScreenshotThumbnails();
            this.updateAttachmentButtons();
            this._onDidRequestScreenshot.fire();
          }
        }, 1e3));
      } else {
        this._onDidRequestScreenshot.fire();
      }
    }));
    if (this.recordingSupported) {
      this.captureStripRecordBtn = this.disposables.add(new Button(this.floatingBar, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      this.captureStripRecordBtn.label = `$(record) ${localize("recordVideo", "Record video")}`;
      this.captureStripRecordBtn.element.classList.add("wizard-record-btn");
      this.disposables.add(this.captureStripRecordBtn.onDidClick(() => {
        if (this.currentRecordingState === RecordingState.Recording) {
          this._onDidRequestStopRecording.fire();
        } else if (this.currentRecordingState === RecordingState.Idle && this.getTotalAttachments() < MAX_ATTACHMENTS) {
          this._onDidRequestStartRecording.fire();
        }
      }));
    }
    mountTarget.appendChild(this.floatingBar);
    let dragStartX = 0;
    let dragStartY = 0;
    let barStartX = 0;
    let barStartY = 0;
    const onPointerMove = (e) => {
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const barW = this.floatingBar.offsetWidth;
      const barH = this.floatingBar.offsetHeight;
      const maxX = targetWindow.innerWidth - barW;
      const maxY = targetWindow.innerHeight - barH;
      const newX = Math.max(0, Math.min(barStartX + dx, maxX));
      const newY = Math.max(0, Math.min(barStartY + dy, maxY));
      this.floatingBar.style.left = `${newX}px`;
      this.floatingBar.style.top = `${newY}px`;
      this.floatingBar.style.right = "auto";
    };
    const onPointerUp = () => {
      dragArea.classList.remove("dragged");
      targetWindow.document.removeEventListener("pointermove", onPointerMove);
      targetWindow.document.removeEventListener("pointerup", onPointerUp);
    };
    this.disposables.add(addDisposableListener(dragArea, EventType.POINTER_DOWN, (e) => {
      e.preventDefault();
      dragArea.classList.add("dragged");
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = this.floatingBar.getBoundingClientRect();
      barStartX = rect.left;
      barStartY = rect.top;
      targetWindow.document.addEventListener("pointermove", onPointerMove);
      targetWindow.document.addEventListener("pointerup", onPointerUp);
    }));
    const clampIntoView = () => {
      if (!this.floatingBar) {
        return;
      }
      const rect = this.floatingBar.getBoundingClientRect();
      const winW = targetWindow.innerWidth;
      const winH = targetWindow.innerHeight;
      const margin = 8;
      let needsClamp = false;
      let nextLeft = rect.left;
      let nextTop = rect.top;
      if (rect.right > winW - margin) {
        nextLeft = Math.max(margin, winW - margin - rect.width);
        needsClamp = true;
      }
      if (rect.left < margin) {
        nextLeft = margin;
        needsClamp = true;
      }
      if (rect.bottom > winH - margin) {
        nextTop = Math.max(margin, winH - margin - rect.height);
        needsClamp = true;
      }
      if (rect.top < margin) {
        nextTop = margin;
        needsClamp = true;
      }
      if (needsClamp) {
        this.floatingBar.style.left = `${nextLeft}px`;
        this.floatingBar.style.top = `${nextTop}px`;
        this.floatingBar.style.right = "auto";
      }
    };
    this.disposables.add(addDisposableListener(targetWindow, "resize", clampIntoView));
    this.disposables.add(toDisposable(() => {
      this.floatingBar?.remove();
    }));
  }
  updateCaptureStripVisibility() {
    if (!this.floatingBar) {
      return;
    }
    this.floatingBar.style.display = "";
  }
  // Step 1: Describe (category + description + title)
  createStep1Describe() {
    const page = append(this.stepContainer, $("div.wizard-step"));
    this.stepPages.push(page);
    const heading = append(page, $("h2.wizard-heading"));
    heading.textContent = localize("describeHeading", "Describe your feedback");
    if (this.markdownRendererService) {
      const guidanceContainer = append(page, $("div.wizard-issue-guidance"));
      const guidanceMd = new MarkdownString(localize(
        {
          key: "reviewGuidanceLabelWizard",
          comment: ['{Locked="https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions"}']
        },
        "Before you report an issue here please [review the guidance we provide](https://github.com/microsoft/vscode/wiki/Submitting-Bugs-and-Suggestions). Please complete the form in English."
      ), { isTrusted: true });
      const rendered = this.markdownRendererService.render(guidanceMd, {
        actionHandler: async (link) => {
          await this.openExternalLink?.(link);
          return true;
        }
      });
      guidanceContainer.appendChild(rendered.element);
      this.disposables.add(rendered);
    }
    const targetRow = append(page, $("div.wizard-target-row"));
    const sourceField = append(targetRow, $("div.wizard-field.wizard-source-field"));
    const sourceLabel = append(sourceField, $("label.wizard-field-label"));
    sourceLabel.textContent = localize("target", "Target");
    this.appendRequiredMarker(sourceLabel);
    this.sourceButtonGroup = append(sourceField, $("div.wizard-type-buttons.wizard-source-buttons"));
    for (const option of this.getAllSourceOptions()) {
      const btn = this.disposables.add(new Button(this.sourceButtonGroup, { ...defaultButtonStyles, secondary: true }));
      btn.element.classList.add("wizard-type-btn", "wizard-source-btn");
      btn.element.setAttribute("data-source", option.value);
      btn.element.setAttribute("aria-pressed", "false");
      btn.label = option.label;
      this.issueSourceButtons.push(btn);
      this.disposables.add(btn.onDidClick(() => {
        this.setIssueSource(option.value);
        if (option.value === IssueSource.Extension && this.selectedExtension) {
          void this.updateSelectedExtension(this.selectedExtension.id);
        }
      }));
    }
    this.sourceError = this.createFieldError(sourceField, localize("targetRequired", "Select a target to continue."));
    this.targetStatus = append(sourceField, $("div.wizard-target-status"));
    this.extensionField = append(targetRow, $("div.wizard-field.wizard-extension-field"));
    const extensionLabel = append(this.extensionField, $("label.wizard-field-label"));
    extensionLabel.textContent = localize("extension", "Extension");
    this.appendRequiredMarker(extensionLabel);
    const extensionSelectContainer = append(this.extensionField, $("div.wizard-extension-select"));
    this.extensionOptions = this.getExtensionOptions();
    this.extensionSelect = this.disposables.add(new SelectBox(
      this.getExtensionSelectItems(),
      this.getSelectedExtensionIndex(),
      this.contextViewService,
      defaultSelectBoxStyles,
      { ariaLabel: localize("extension", "Extension"), useCustomDrawn: true, optionsAsChildren: true }
    ));
    this.extensionSelect.render(extensionSelectContainer);
    this.disposables.add(this.extensionSelect.onDidSelect((e) => {
      void this.updateSelectedExtension(this.extensionOptions[e.index]?.value);
    }));
    this.extensionError = this.createFieldError(this.extensionField, localize("extensionRequired", "Select an extension to continue."));
    this.extensionStatus = append(this.extensionField, $("div.wizard-extension-status"));
    this.updateExtensionOptions();
    this.updateExtensionFieldVisibility();
    if (!this.selectedIssueSource) {
      if (this.data.extensionId) {
        this.selectedIssueSource = IssueSource.Extension;
      } else if (this.data.isSessionsWindow) {
        this.selectedIssueSource = IssueSource.AgentsWindow;
      } else {
        this.selectedIssueSource = IssueSource.VSCode;
      }
      this.updateIssueSourceFlags();
    }
    this.updateIssueSourceButtons();
    const catLabel = append(page, $("label.wizard-field-label"));
    catLabel.textContent = localize("feedbackCategory", "Category");
    this.appendRequiredMarker(catLabel);
    this.typeButtonGroup = append(page, $("div.wizard-type-buttons"));
    const selectType = (type) => {
      this.selectedIssueType = type;
      this.model.update({ issueType: type });
      this.setFieldError(this.typeButtonGroup, this.typeError, false);
      for (const b of this.issueTypeButtons) {
        const isSelected = b.element.getAttribute("data-type") === String(type);
        b.element.classList.toggle("selected", isSelected);
        b.element.setAttribute("aria-pressed", String(isSelected));
      }
      this.updateDescriptionGuidance();
      this.updateIssueSourceButtons();
      if (this.currentStep === 2 /* Review */) {
        this.updateReviewDetails();
      }
      this.searchSimilarIssues();
    };
    for (const { type, label, icon } of this.getIssueTypeOptions()) {
      const btn = this.disposables.add(new Button(this.typeButtonGroup, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      btn.element.classList.add("wizard-type-btn");
      btn.element.setAttribute("data-type", String(type));
      btn.element.setAttribute("aria-pressed", "false");
      btn.label = `$(${icon.id}) ${label}`;
      this.issueTypeButtons.push(btn);
      this.disposables.add(btn.onDidClick(() => selectType(type)));
    }
    this.typeError = this.createFieldError(page, localize("categoryRequired", "Select a category to continue."));
    const titleGroup = append(page, $("div.wizard-field.wizard-title-field"));
    const titleLabelRow = append(titleGroup, $("div.wizard-title-label-row"));
    const titleLabel = append(titleLabelRow, $("label.wizard-field-label"));
    titleLabel.textContent = localize("issueTitle", "Title");
    this.appendRequiredMarker(titleLabel);
    const aiBtn = this.disposables.add(new Button(titleLabelRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    aiBtn.label = `$(sparkle) ${localize("generateTitleBtn", "Generate from description")}`;
    aiBtn.element.classList.add("wizard-ai-title-btn");
    aiBtn.element.title = localize("generateTitle", "Generate title from description");
    aiBtn.enabled = !!this.data.issueBody?.trim();
    this.disposables.add(aiBtn.onDidClick(() => {
      const desc = this.descriptionTextarea.value.trim();
      if (desc && !aiBtn.element.classList.contains("loading")) {
        aiBtn.element.style.minWidth = `${aiBtn.element.offsetWidth}px`;
        aiBtn.enabled = false;
        aiBtn.label = `$(loading~spin) ${localize("generatingTitle", "Generating...")}`;
        aiBtn.element.classList.add("loading");
        this._onDidRequestGenerateTitle.fire(desc);
      }
    }));
    this.generateTitleBtn = aiBtn;
    this.titleInput = this.disposables.add(new InputBox(titleGroup, void 0, {
      placeholder: localize("issueTitlePlaceholder", "Brief summary of the issue"),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.updateTitlePlaceholder();
    if (this.data.issueTitle) {
      this.titleInput.value = this.data.issueTitle;
    }
    this.disposables.add(this.titleInput.onDidChange(() => {
      if (this.titleInput.value.trim()) {
        this.setFieldError(this.titleInput.element, this.titleError, false);
      }
      this.searchSimilarIssues();
    }));
    this.titleError = this.createFieldError(titleGroup, localize("titleRequired", "Enter a title to continue."));
    const descriptionGroup = append(page, $("div.wizard-field"));
    const descLabel = append(descriptionGroup, $("label.wizard-field-label"));
    descLabel.textContent = localize("description", "Description");
    this.appendRequiredMarker(descLabel);
    this.descriptionGuidance = append(descriptionGroup, $("p.wizard-subtitle.wizard-description-guidance"));
    this.updateDescriptionGuidance();
    this.descriptionTextarea = append(descriptionGroup, $("textarea.wizard-textarea"));
    this.descriptionTextarea.placeholder = localize("descriptionPlaceholder", "Describe the issue in detail...");
    this.descriptionTextarea.rows = 6;
    if (this.data.issueBody) {
      this.descriptionTextarea.value = this.data.issueBody;
    }
    const autoGrowTextarea = () => {
      this.descriptionTextarea.style.height = "0";
      const newHeight = Math.max(this.descriptionTextarea.scrollHeight, 120);
      this.descriptionTextarea.style.height = `${newHeight}px`;
    };
    autoGrowTextarea();
    this.disposables.add(addDisposableListener(this.descriptionTextarea, EventType.INPUT, () => {
      if (this.descriptionTextarea.value.trim()) {
        this.setFieldError(this.descriptionTextarea, this.descriptionError, false);
      }
      autoGrowTextarea();
      this.searchSimilarIssues();
      this.updateGenerateTitleButtonState();
    }));
    this.descriptionError = this.createFieldError(descriptionGroup, localize("descriptionRequired", "Enter a description to continue."));
    this.updateIssueSourceFlags();
    this.updateTargetStatus();
    if (this.selectedIssueType === void 0) {
      selectType(IssueType.Bug);
    } else {
      selectType(this.selectedIssueType);
    }
  }
  appendRequiredMarker(label) {
    const marker = append(label, $("span.wizard-required-marker"));
    marker.textContent = "*";
    marker.setAttribute("aria-hidden", "true");
  }
  getIssueTypeOptions() {
    const options = [
      { type: IssueType.Bug, label: localize("bug", "Bug"), icon: Codicon.bug },
      { type: IssueType.FeatureRequest, label: localize("featureRequest", "Feature Request"), icon: Codicon.lightbulb },
      { type: IssueType.PerformanceIssue, label: localize("performanceIssue", "Performance Issue"), icon: Codicon.dashboard }
    ];
    if (this.selectedIssueSource === IssueSource.Marketplace) {
      return options.filter((o) => o.type !== IssueType.PerformanceIssue);
    }
    return options;
  }
  getAllSourceOptions() {
    return [
      { label: product.nameLong || localize("vscode", "Visual Studio Code"), value: IssueSource.VSCode },
      { label: localize("agentsWindow", "Agents Window"), value: IssueSource.AgentsWindow },
      { label: localize("extensionSource", "A VS Code extension"), value: IssueSource.Extension },
      { label: localize("marketplace", "Extensions Marketplace"), value: IssueSource.Marketplace }
    ];
  }
  getSourceOptions() {
    const options = this.getAllSourceOptions();
    if (this.data.isSessionsWindow || !this.hasReportableExtensions()) {
      return options.filter((o) => o.value !== IssueSource.Extension);
    }
    return options;
  }
  hasReportableExtensions() {
    const modelData = this.model.getData();
    const sourceExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions ?? [];
    return sourceExtensions.some((extension) => !extension.isTheme && !extension.isBuiltin);
  }
  updateIssueSourceButtons() {
    const availableSources = new Set(this.getSourceOptions().map((option) => option.value));
    if (this.selectedIssueSource && !availableSources.has(this.selectedIssueSource)) {
      this.selectedIssueSource = void 0;
      this.updateIssueSourceFlags();
      this.updateExtensionValidation();
    }
    for (const button of this.issueSourceButtons) {
      const source = button.element.getAttribute("data-source");
      const isAvailable = availableSources.has(source);
      const isSelected = source === this.selectedIssueSource;
      button.element.classList.toggle("hidden", !isAvailable);
      button.element.classList.toggle("selected", isSelected);
      button.element.setAttribute("aria-pressed", String(isSelected));
    }
    this.updateExtensionFieldVisibility();
  }
  setIssueSource(source) {
    this.selectedIssueSource = source;
    this.setFieldError(this.sourceButtonGroup, this.sourceError, this.didAttemptDescribeSubmit && !source);
    this.updateIssueSourceFlags();
    this.updateIssueSourceButtons();
    this.updateIssueTypeButtons();
    this.updateExtensionValidation();
    this.updateTitlePlaceholder();
    this.updateTargetStatus();
    this.updateDescriptionGuidance();
    this.searchSimilarIssues();
  }
  /**
   * Hide or restore issue type buttons based on the current source. The Marketplace
   * source does not support reporting performance issues, so the button is hidden
   * and the selection falls back to Bug when it was the Performance option.
   */
  updateIssueTypeButtons() {
    if (!this.issueTypeButtons.length) {
      return;
    }
    const allowedTypes = new Set(this.getIssueTypeOptions().map((option) => String(option.type)));
    for (const button of this.issueTypeButtons) {
      const buttonType = button.element.getAttribute("data-type");
      const isAvailable = !!buttonType && allowedTypes.has(buttonType);
      button.element.classList.toggle("hidden", !isAvailable);
    }
    if (this.selectedIssueType !== void 0 && !allowedTypes.has(String(this.selectedIssueType))) {
      this.selectedIssueType = IssueType.Bug;
      this.model.update({ issueType: IssueType.Bug });
      for (const b of this.issueTypeButtons) {
        const isSelected = b.element.getAttribute("data-type") === String(IssueType.Bug);
        b.element.classList.toggle("selected", isSelected);
        b.element.setAttribute("aria-pressed", String(isSelected));
      }
    }
  }
  updateIssueSourceFlags() {
    const fileOnExtension = this.selectedIssueSource === IssueSource.Extension;
    const fileOnMarketplace = this.selectedIssueSource === IssueSource.Marketplace;
    const fileOnProduct = this.selectedIssueSource === IssueSource.VSCode || this.selectedIssueSource === IssueSource.AgentsWindow || this.selectedIssueSource === IssueSource.Unknown;
    const fileOnAgentsWindow = this.selectedIssueSource === IssueSource.AgentsWindow;
    this.model.update({
      issueSource: this.selectedIssueSource,
      fileOnExtension,
      fileOnMarketplace,
      fileOnProduct,
      isSessionsWindow: fileOnAgentsWindow ? true : this.data.isSessionsWindow,
      selectedExtension: this.selectedExtension
    });
    this.data.issueSource = this.selectedIssueSource;
    this.data.extensionId = fileOnExtension ? this.selectedExtension?.id ?? this.data.extensionId : void 0;
  }
  updateTitlePlaceholder() {
    switch (this.selectedIssueSource) {
      case IssueSource.Extension:
        this.titleInput.setPlaceHolder(localize("extensionPlaceholder", "E.g. Missing alt text on extension readme image"));
        break;
      case IssueSource.Marketplace:
        this.titleInput.setPlaceHolder(localize("marketplacePlaceholder", "E.g. Cannot disable installed extension"));
        break;
      case IssueSource.AgentsWindow:
        this.titleInput.setPlaceHolder(localize("agentsWindowPlaceholder", "E.g. Sessions list does not refresh after creating a new session"));
        break;
      case IssueSource.VSCode:
        this.titleInput.setPlaceHolder(localize("vscodePlaceholder", "E.g. Workbench is missing problems panel"));
        break;
      default:
        this.titleInput.setPlaceHolder(localize("issueTitlePlaceholder", "Brief summary of the issue"));
        break;
    }
  }
  getExtensionOptions() {
    const modelData = this.model.getData();
    const sourceExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions ?? [];
    const extensions = [...sourceExtensions].filter((extension) => !extension.isTheme && !extension.isBuiltin).sort((a, b) => (a.displayName || a.name || a.id).localeCompare(b.displayName || b.name || b.id));
    return [
      { label: localize("selectExtension", "Select extension"), value: void 0, hidden: true },
      ...extensions.map((extension) => ({ label: extension.displayName || extension.name || extension.id, value: extension.id }))
    ];
  }
  getExtensionSelectItems() {
    return this.extensionOptions.map((option) => ({ text: option.label, isDisabled: option.hidden }));
  }
  getSelectedExtensionIndex() {
    return Math.max(0, this.extensionOptions.findIndex((option) => option.value === this.selectedExtension?.id || option.value === this.data.extensionId));
  }
  updateExtensionOptions() {
    this.extensionOptions = this.getExtensionOptions();
    this.extensionSelect.setOptions(this.getExtensionSelectItems(), this.getSelectedExtensionIndex());
    if (!this.selectedExtension && this.data.extensionId) {
      void this.updateSelectedExtension(this.data.extensionId, false);
    }
  }
  updateExtensionFieldVisibility() {
    this.extensionField.classList.toggle("hidden", this.selectedIssueSource !== IssueSource.Extension);
  }
  updateExtensionValidation() {
    const hasExtension = this.selectedIssueSource !== IssueSource.Extension || !!this.selectedExtension;
    const hasExtensionIssueUrl = this.selectedIssueSource !== IssueSource.Extension || !this.selectedExtension || !!this.getSelectedExtensionIssueUrl();
    this.setFieldError(this.extensionField, this.extensionError, this.didAttemptDescribeSubmit && (!hasExtension || !hasExtensionIssueUrl));
  }
  async updateSelectedExtension(extensionId, loadExtensionData = true) {
    const extension = extensionId ? this.model.getData().allExtensions.find((candidate) => candidate.id.toLowerCase() === extensionId.toLowerCase()) : void 0;
    this.selectedExtension = extension;
    if (extensionId === void 0 || extension) {
      this.data.extensionId = extension?.id;
    }
    this.extensionSelect.select(this.getSelectedExtensionIndex());
    this.updateExtensionValidation();
    this.updateIssueSourceFlags();
    if (!extension) {
      this.updateTargetStatus();
      this.searchSimilarIssues();
      return;
    }
    const hasPresetData = !this.includeExtensionData && (this.data.data !== void 0 || this.data.uri !== void 0 || this.data.privateUri !== void 0);
    if (!loadExtensionData && hasPresetData) {
      this.applyExtensionIssueData(extension, this.data);
    }
    if (extension.isBuiltin && this.selectedIssueSource === IssueSource.Extension && !this.data.issueSource) {
      this.setIssueSource(IssueSource.VSCode);
      return;
    }
    if (loadExtensionData && this.resolveExtensionIssueData) {
      const request = ++this.extensionDataRequest;
      this.extensionStatus.textContent = localize("loadingExtensionData", "Loading extension issue data...");
      const issueData = await this.resolveExtensionIssueData(extension.id);
      if (request !== this.extensionDataRequest) {
        return;
      }
      if (issueData) {
        this.applyExtensionIssueData(extension, issueData);
      }
    }
    this.updateTargetStatus();
    this.searchSimilarIssues();
  }
  applyExtensionIssueData(extension, issueData) {
    extension.data = issueData.data;
    extension.uri = issueData.uri;
    extension.privateUri = issueData.privateUri;
    this.data.data = issueData.data;
    this.data.uri = issueData.uri;
    this.data.privateUri = issueData.privateUri;
    this.data.issueBody = issueData.issueBody ?? this.data.issueBody;
    this.data.issueTitle = issueData.issueTitle ?? this.data.issueTitle;
    if (issueData.issueTitle && !this.titleInput.value.trim()) {
      this.titleInput.value = issueData.issueTitle;
    }
    if (issueData.issueBody && !this.descriptionTextarea.value.includes(issueData.issueBody)) {
      this.descriptionTextarea.value = this.descriptionTextarea.value ? `${this.descriptionTextarea.value}
${issueData.issueBody}` : issueData.issueBody;
    }
    if (issueData.data) {
      extension.extensionData = issueData.data;
      this.model.update({ extensionData: issueData.data, includeExtensionData: true });
      this.includeExtensionData = true;
    }
  }
  updateTargetStatus() {
    this.targetStatus.textContent = "";
    this.extensionStatus.textContent = "";
    if (!this.selectedIssueSource) {
      return;
    }
    if (this.selectedIssueSource !== IssueSource.Extension) {
      const repo = this.getIssueTargetRepo();
      this.targetStatus.textContent = repo ? localize("issueTargetRepo", "Issue will be created in {0}/{1}.", repo.owner, repo.repositoryName) : "";
      return;
    }
    if (!this.selectedExtension) {
      return;
    }
    const issueUrl = this.getSelectedExtensionIssueUrl();
    if (!issueUrl) {
      this.extensionStatus.textContent = localize("extensionNoIssueUrl", "This extension does not provide an issue reporting URL.");
    } else if (!this.isGitHubUrl(issueUrl)) {
      this.extensionStatus.textContent = localize("extensionExternalIssueUrl", "This extension uses an external issue reporter. Preview will open that issue reporter.");
    } else {
      const repo = this.getIssueTargetRepo();
      this.extensionStatus.textContent = repo ? localize("issueTargetRepo", "Issue will be created in {0}/{1}.", repo.owner, repo.repositoryName) : "";
    }
  }
  getIssueTargetRepo() {
    const targetUrl = this.getIssueTargetUrl();
    return targetUrl ? this.parseGitHubUrl(targetUrl) : void 0;
  }
  getSelectedExtensionIssueUrl() {
    const extension = this.selectedExtension;
    if (!extension) {
      return void 0;
    }
    if (extension.uri) {
      return URI.revive(extension.uri).toString();
    }
    if (extension.bugsUrl && /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?(\/issues)?\/?$/.test(extension.bugsUrl)) {
      return `${normalizeGitHubUrl(extension.bugsUrl)}/issues/new`;
    }
    if (extension.repositoryUrl && /^https?:\/\/github\.com\/([^\/]*)\/([^\/]*)\/?$/.test(extension.repositoryUrl)) {
      return `${normalizeGitHubUrl(extension.repositoryUrl)}/issues/new`;
    }
    return extension.bugsUrl || extension.repositoryUrl;
  }
  getIssueSourceLabel() {
    switch (this.selectedIssueSource) {
      case IssueSource.VSCode:
        return product.nameLong || localize("vscode", "Visual Studio Code");
      case IssueSource.AgentsWindow:
        return localize("agentsWindow", "Agents Window");
      case IssueSource.Extension:
        return this.selectedExtension?.displayName || this.selectedExtension?.name || localize("extensionSource", "A VS Code extension");
      case IssueSource.Marketplace:
        return localize("marketplace", "Extensions Marketplace");
      case IssueSource.Unknown:
        return localize("unknownSource", "Don't know");
      default:
        return localize("unknown", "Unknown");
    }
  }
  getIssueTargetUrl() {
    if (this.selectedIssueSource === IssueSource.Extension) {
      return this.getSelectedExtensionIssueUrl();
    }
    if (this.selectedIssueSource === IssueSource.Marketplace) {
      return product.reportMarketplaceIssueUrl ?? product.reportIssueUrl;
    }
    if (this.data.uri) {
      return URI.revive(this.data.uri).toString();
    }
    if (this.data.privateUri) {
      return URI.revive(this.data.privateUri).toString();
    }
    return product.reportIssueUrl;
  }
  isGitHubUrl(url) {
    return /^https?:\/\/github\.com\//i.test(url);
  }
  parseGitHubUrl(url) {
    const match = /^https?:\/\/github\.com\/([^\/?#]+)\/([^\/?#]+).*/i.exec(url);
    if (!match) {
      return void 0;
    }
    return { owner: match[1], repositoryName: match[2] };
  }
  searchSimilarIssues() {
    if (this.currentStep !== 2 /* Review */ || !this.similarIssuesContainer) {
      return;
    }
    if (this.similarIssuesHandle) {
      clearTimeout(this.similarIssuesHandle);
    }
    this.renderSimilarIssuesMessage(localize("searchingSimilarIssues", "Searching similar issues..."));
    this.similarIssuesHandle = setTimeout(() => this.doSearchSimilarIssues(), 300);
  }
  async doSearchSimilarIssues() {
    const title = this.titleInput.value.trim();
    const request = ++this.similarIssuesRequest;
    if (!title || !this.selectedIssueSource) {
      this.renderSimilarIssuesMessage(localize("similarIssuesNeedsTitle", "Enter a title to search for similar issues."));
      return;
    }
    this.renderSimilarIssuesMessage(localize("searchingSimilarIssues", "Searching similar issues..."));
    try {
      let results = [];
      if (this.selectedIssueSource === IssueSource.Extension) {
        const extensionIssueUrl = this.getSelectedExtensionIssueUrl();
        const repo = extensionIssueUrl && this.parseGitHubUrl(extensionIssueUrl);
        results = repo ? await this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
      } else if (this.selectedIssueSource === IssueSource.Marketplace) {
        const marketplaceIssueUrl = product.reportMarketplaceIssueUrl ?? product.reportIssueUrl;
        const repo = marketplaceIssueUrl && this.parseGitHubUrl(marketplaceIssueUrl);
        results = repo ? await this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
      } else {
        results = await this.searchVSCodeSimilarIssues(title, this.descriptionTextarea.value.trim());
      }
      if (request === this.similarIssuesRequest) {
        this.renderSimilarIssues(results);
      }
    } catch {
      if (request === this.similarIssuesRequest) {
        this.renderSimilarIssuesMessage(localize("similarIssuesSearchFailed", "Unable to search for similar issues."));
      }
    }
  }
  async searchGitHubIssues(repo, title) {
    const query = `is:issue repo:${repo} ${title}`;
    const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}`);
    const result = await response.json();
    return Array.isArray(result?.items) ? result.items : [];
  }
  async searchVSCodeDuplicates(title, body) {
    const response = await fetch("https://vscode-probot.westus.cloudapp.azure.com:7890/duplicate_candidates", {
      method: "POST",
      body: JSON.stringify({ title, body }),
      headers: new Headers({ "Content-Type": "application/json" })
    });
    const result = await response.json();
    return Array.isArray(result?.candidates) ? result.candidates : [];
  }
  async searchVSCodeSimilarIssues(title, body) {
    try {
      const duplicates = await this.searchVSCodeDuplicates(title, body);
      if (duplicates.length) {
        return duplicates;
      }
    } catch {
    }
    const repo = this.getIssueTargetRepo();
    return repo ? this.searchGitHubIssues(`${repo.owner}/${repo.repositoryName}`, title) : [];
  }
  renderSimilarIssuesMessage(message) {
    this.resetSimilarIssuesContainer();
    const status = append(this.similarIssuesContainer, $("div.wizard-similar-status"));
    status.textContent = message;
  }
  renderSimilarIssues(results) {
    if (!results.length) {
      this.renderSimilarIssuesMessage(localize("noSimilarIssues", "No similar issues found."));
      return;
    }
    this.resetSimilarIssuesContainer();
    const list = append(this.similarIssuesContainer, $("ul.wizard-similar-list"));
    for (const issue of results.slice(0, MAX_SIMILAR_ISSUES)) {
      const item = append(list, $("li.wizard-similar-item"));
      const link = append(item, $("a.wizard-similar-link"));
      link.href = issue.html_url;
      link.textContent = issue.title;
      link.title = issue.title;
      this.similarIssuesDisposables.add(addDisposableListener(link, EventType.CLICK, (e) => {
        e.preventDefault();
        this.openExternalLink?.(issue.html_url);
      }));
      if (issue.state) {
        const state = append(item, $("span.wizard-similar-state"));
        state.textContent = issue.state;
      }
    }
  }
  /** Clear the similar-issues container and re-render the section heading. */
  resetSimilarIssuesContainer() {
    this.similarIssuesDisposables.clear();
    this.similarIssuesContainer.textContent = "";
    const heading = append(this.similarIssuesContainer, $("div.wizard-similar-heading"));
    heading.textContent = localize("similarIssues", "Similar Issues");
  }
  /** Update the guidance text above the description based on selected category */
  updateDescriptionGuidance() {
    const markdownHint = localize("markdownSupported", "Markdown formatting is supported.");
    const perfWikiUrl = "https://github.com/microsoft/vscode/wiki/Performance-Issues";
    this.descriptionGuidanceDisposables.clear();
    this.descriptionGuidance.textContent = "";
    this.descriptionGuidance.classList.remove("wizard-description-guidance-with-link");
    const appendText = (text) => {
      const targetDocument = getWindow(this.container).document;
      this.descriptionGuidance.appendChild(targetDocument.createTextNode(text));
    };
    switch (this.selectedIssueType) {
      case IssueType.Bug:
        appendText(`${localize("bugGuidance", "Describe what happened, the steps to reproduce, what you expected, and what you observed instead.")}
${markdownHint}`);
        break;
      case IssueType.FeatureRequest:
        appendText(`${localize("featureGuidance", "Describe the feature you'd like to see, what problem it would solve, and any alternatives you've considered.")}
${markdownHint}`);
        break;
      case IssueType.PerformanceIssue: {
        appendText(`${localize("perfGuidance", "Describe what is slow, when it happens, whether it's consistent or intermittent, and any patterns you've noticed.")} `);
        const link = $("a.wizard-description-guidance-link");
        link.href = perfWikiUrl;
        link.textContent = localize("perfWikiLink", "See the performance issue reporting guide.");
        this.descriptionGuidanceDisposables.add(addDisposableListener(link, EventType.CLICK, (e) => {
          e.preventDefault();
          this.openExternalLink?.(perfWikiUrl);
        }));
        this.descriptionGuidance.appendChild(link);
        appendText(`
${markdownHint}`);
        this.descriptionGuidance.classList.add("wizard-description-guidance-with-link");
        break;
      }
      default:
        appendText(`${localize("defaultGuidance", "Select a category above, then describe your feedback in detail.")}
${markdownHint}`);
        break;
    }
  }
  hasDescriptionContent() {
    return !!this.descriptionTextarea.value.trim();
  }
  updateGenerateTitleButtonState() {
    if (!this.generateTitleBtn || this.generateTitleBtn.element.classList.contains("loading")) {
      return;
    }
    this.generateTitleBtn.enabled = this.hasDescriptionContent();
  }
  createFieldError(parent, message) {
    const error = append(parent, $("div.wizard-field-error.hidden"));
    error.textContent = message;
    error.setAttribute("role", "alert");
    return error;
  }
  setFieldError(field, error, hasError) {
    field.classList.toggle("invalid-input", hasError);
    error.classList.toggle("hidden", !hasError);
  }
  // Step 2: Review & Submit
  createStep2Review() {
    const page = append(this.stepContainer, $("div.wizard-step.wizard-step-review"));
    this.stepPages.push(page);
    const heading = append(page, $("h2.wizard-heading"));
    heading.textContent = localize("reviewSubmit", "Review and submit");
    append(page, $("div.wizard-review-details"));
  }
  registerEventHandlers() {
    this.disposables.add(this.backButton.onDidClick(() => this.goBack()));
    this.disposables.add(this.nextButton.onDidClick(() => this.goNext()));
  }
  goBack() {
    if (this.currentStep > 0 /* Attachments */) {
      this.setStep(this.currentStep - 1);
    }
  }
  goNext() {
    if (this.currentStep === 1 /* Describe */) {
      this.didAttemptDescribeSubmit = true;
      const hasIssueSource = this.selectedIssueSource !== void 0;
      const hasExtension = this.selectedIssueSource !== IssueSource.Extension || !!this.selectedExtension;
      const hasExtensionIssueUrl = this.selectedIssueSource !== IssueSource.Extension || !this.selectedExtension || !!this.getSelectedExtensionIssueUrl();
      const hasIssueType = this.selectedIssueType !== void 0;
      const hasDescription = this.hasDescriptionContent();
      const title = this.titleInput.value.trim();
      this.setFieldError(this.sourceButtonGroup, this.sourceError, !hasIssueSource);
      this.setFieldError(this.extensionField, this.extensionError, !hasExtension || !hasExtensionIssueUrl);
      this.setFieldError(this.typeButtonGroup, this.typeError, !hasIssueType);
      this.setFieldError(this.descriptionTextarea, this.descriptionError, !hasDescription);
      this.setFieldError(this.titleInput.element, this.titleError, !title);
      if (!hasIssueSource || !hasExtension || !hasExtensionIssueUrl || !hasIssueType || !hasDescription || !title) {
        if (!hasIssueSource) {
          this.issueSourceButtons.find((button) => !button.element.classList.contains("hidden"))?.element.focus();
        } else if (!hasExtension || !hasExtensionIssueUrl) {
          this.extensionSelect.focus();
        } else if (!hasIssueType) {
          this.issueTypeButtons[0]?.element.focus();
        } else if (!hasDescription) {
          this.descriptionTextarea.focus();
        } else {
          this.titleInput.focus();
        }
        return;
      }
      this.updateIssueSourceFlags();
      this.model.update({ issueDescription: this.descriptionTextarea.value.trim() });
    }
    if (this.currentStep === 2 /* Review */) {
      if (this.selectedIssueType === IssueType.PerformanceIssue && (!this.performanceInfoLoaded || this.performanceInfoRefreshing)) {
        return;
      }
      this.submit();
      return;
    }
    if (this.currentStep < 2 /* Review */) {
      this.setStep(this.currentStep + 1);
    }
  }
  setStep(step) {
    const oldStep = this.currentStep;
    this.currentStep = step;
    const oldPage = this.stepPages[oldStep];
    const newPage = this.stepPages[step];
    oldPage.style.display = "none";
    newPage.style.display = "flex";
    this.updateStepUI();
    if (step === 1 /* Describe */) {
      this.descriptionTextarea.focus();
    } else if (step === 2 /* Review */) {
      this.updateReviewDetails();
      this.searchSimilarIssues();
      this.wizardPanel.focus();
    } else {
      this.wizardPanel.focus();
    }
  }
  updateStepUI() {
    const stepNum = this.currentStep + 1;
    this.stepIndicator.textContent = localize("stepOf", "Step {0} of {1}", stepNum, STEP_COUNT);
    const stepNames = [
      localize("screenshots", "Attachments"),
      localize("composeMessage", "Describe"),
      localize("submit", "Review")
    ];
    this.stepLabel.textContent = stepNames[this.currentStep];
    for (let i = 0; i < this.progressDots.length; i++) {
      this.progressDots[i].classList.toggle("active", i === this.currentStep);
      this.progressDots[i].classList.toggle("completed", i < this.currentStep);
    }
    for (let i = 0; i < this.stepPages.length; i++) {
      if (i === this.currentStep) {
        this.stepPages[i].style.display = "flex";
      } else if (!this.stepPages[i].classList.contains("slide-out-left") && !this.stepPages[i].classList.contains("slide-out-right")) {
        this.stepPages[i].style.display = "none";
      }
    }
    this.backButton.element.style.display = this.currentStep === 0 /* Attachments */ ? "none" : "";
    if (this.closeButton) {
      const currentDraftPreviewed = this.previewedDraftKey === this.getDraftKey();
      this.closeButton.element.style.display = this.previewOpened && currentDraftPreviewed && this.currentStep === 2 /* Review */ ? "" : "none";
    }
    if (this.currentStep === 2 /* Review */) {
      const externalExtensionUrl = this.selectedIssueSource === IssueSource.Extension && this.getIssueTargetUrl() && !this.isGitHubUrl(this.getIssueTargetUrl());
      const waitingForData = this.selectedIssueType === IssueType.PerformanceIssue && (!this.performanceInfoLoaded || this.performanceInfoRefreshing);
      if (waitingForData) {
        this.nextButton.label = `$(loading~spin) ${localize("loadingDiagnostics", "Loading diagnostics...")}`;
        this.nextButton.element.title = localize("waitingForDiagnostics", "Waiting for performance diagnostics to finish loading");
        this.nextButton.enabled = false;
      } else {
        this.nextButton.label = externalExtensionUrl ? localize("openExternalIssueReporter", "Open External Issue Reporter") : localize("previewOnGitHub", "Preview on GitHub");
        this.nextButton.element.title = this.nextButton.label;
        this.nextButton.enabled = true;
      }
    } else if (this.currentStep === 0 /* Attachments */) {
      this.nextButton.label = this.getTotalAttachments() === 0 ? localize("skip", "Skip") : localize("next", "Next");
      this.nextButton.element.title = this.nextButton.label;
    } else {
      this.nextButton.label = localize("next", "Next");
      this.nextButton.element.title = localize("next", "Next");
    }
    this.updateCaptureStripVisibility();
    this.updateNextButtonForRecording();
  }
  updateReviewDetails() {
    const page = this.stepPages[2 /* Review */];
    const details = page.querySelector(".wizard-review-details");
    if (!details) {
      return;
    }
    this.reviewRenderDisposables.clear();
    details.textContent = "";
    const similarSection = append(details, $("div.review-section.wizard-review-similar-section"));
    this.similarIssuesContainer = append(similarSection, $("div.wizard-similar-issues"));
    this.similarIssuesContainer.setAttribute("aria-live", "polite");
    this.renderSimilarIssuesMessage(localize("searchingSimilarIssues", "Searching similar issues..."));
    const sourceSection = append(details, $("div.review-section"));
    const sourceLabel = append(sourceSection, $("div.review-label"));
    sourceLabel.textContent = localize("target", "Target");
    const sourceValue = append(sourceSection, $("div.review-value"));
    sourceValue.textContent = this.getIssueSourceLabel();
    const catSection = append(details, $("div.review-section"));
    const catLabel = append(catSection, $("div.review-label"));
    catLabel.textContent = localize("category", "Category");
    const catValue = append(catSection, $("div.review-value"));
    const typeLabels = {
      [IssueType.Bug]: localize("bug", "Bug"),
      [IssueType.FeatureRequest]: localize("featureRequest", "Feature Request"),
      [IssueType.PerformanceIssue]: localize("performanceIssue", "Performance Issue")
    };
    catValue.textContent = (this.selectedIssueType !== void 0 ? typeLabels[this.selectedIssueType] : void 0) ?? localize("unknown", "Unknown");
    const titleSection = append(details, $("div.review-section"));
    const titleLabel = append(titleSection, $("div.review-label"));
    titleLabel.textContent = localize("issueTitle", "Title");
    const titleValue = append(titleSection, $("div.review-value"));
    titleValue.textContent = this.titleInput.value.trim() || localize("noTitle", "(no title)");
    const descSection = append(details, $("div.review-section"));
    const descLabel = append(descSection, $("div.review-label"));
    descLabel.textContent = localize("description", "Description");
    const descValue = append(descSection, $("div.review-value.review-description"));
    const description = this.descriptionTextarea.value.trim();
    if (description && this.markdownRendererService) {
      const renderedMarkdown = this.markdownRendererService.render(
        new MarkdownString(description),
        { markedOptions: { breaks: true } }
      );
      append(descValue, renderedMarkdown.element);
      this.reviewRenderDisposables.add(renderedMarkdown);
    } else {
      descValue.textContent = description || localize("noDescription", "(no description)");
    }
    const totalAttachments = this.screenshots.length + this.recordings.length;
    if (totalAttachments > 0) {
      const attachSection = append(details, $("div.review-section"));
      const attachLabel = append(attachSection, $("div.review-label"));
      attachLabel.textContent = localize("attachments", "Attachments ({0})", totalAttachments);
      const thumbRow = append(attachSection, $("div.review-thumbnails"));
      this.reviewThumbCards = [];
      for (let i = 0; i < this.screenshots.length; i++) {
        const s = this.screenshots[i];
        const card = append(thumbRow, $("div.wizard-screenshot-card.review-attachment-card"));
        const img = append(card, $("img"));
        img.src = s.annotatedDataUrl ?? s.dataUrl;
        img.alt = localize("screenshotAlt", "Screenshot {0}", i + 1);
        const progressOverlay = append(card, $("div.review-progress-overlay"));
        append(progressOverlay, $("div.review-progress-ring"));
        this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
          if (!this.uploading) {
            this._onDidRequestOpenScreenshot.fire(s);
          }
        }));
        this.reviewThumbCards.push(card);
      }
      for (let i = 0; i < this.recordings.length; i++) {
        const rec = this.recordings[i];
        const card = this.renderRecordingCard(thumbRow, rec, i);
        card.classList.add("review-attachment-card");
        const progressOverlay = append(card, $("div.review-progress-overlay"));
        append(progressOverlay, $("div.review-progress-ring"));
        this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
          if (!this.uploading) {
            this._onDidRequestOpenRecording.fire(rec.filePath);
          }
        }));
        this.reviewThumbCards.push(card);
      }
    }
    const diagContainer = append(details, $("div.review-diagnostics"));
    const modelData = this.model.getData();
    let diagnosticSectionCount = 0;
    if (modelData.versionInfo || modelData.systemInfo) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "system-info",
        label: localize("systemInformation", "System Information"),
        checked: this.includeSystemInfo,
        onToggle: (checked) => {
          this.includeSystemInfo = checked;
          this.model.update({ includeSystemInfo: checked });
        },
        renderContent: (container) => {
          const sysTable = append(container, $("table.review-diag-table"));
          if (modelData.versionInfo) {
            this.addDiagRow(sysTable, "VS Code", modelData.versionInfo.vscodeVersion);
            this.addDiagRow(sysTable, "OS", modelData.versionInfo.os);
          }
          if (modelData.systemInfo) {
            this.addDiagRow(sysTable, "CPUs", modelData.systemInfo.cpus ?? "");
            this.addDiagRow(sysTable, "Memory", modelData.systemInfo.memory);
            this.addDiagRow(sysTable, "VM", modelData.systemInfo.vmHint);
            this.addDiagRow(sysTable, "Screen Reader", modelData.systemInfo.screenReader);
          }
          this.addDiagRow(sysTable, "User Agent", navigator.userAgent);
          this.addDiagRow(sysTable, "Installation pure", String(modelData.isInstallationPure ?? true));
          if (modelData.restrictedMode) {
            this.addDiagRow(sysTable, "Mode", "Restricted");
          }
        }
      });
    } else {
      const loading = append(diagContainer, $("div.review-diag-loading"));
      loading.textContent = localize("loadingSystemInfo", "Loading system information...");
    }
    if (modelData.extensionData) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "extension-data",
        label: localize("extensionData", "Extension Data"),
        checked: this.includeExtensionData,
        onToggle: (checked) => {
          this.includeExtensionData = checked;
          this.model.update({ includeExtensionData: checked });
        },
        renderContent: (container) => {
          const pre = append(container, $("pre.review-diag-pre"));
          pre.textContent = modelData.extensionData;
        }
      });
    }
    const nonThemeExtensions = (modelData.allExtensions ?? []).filter((e) => !e.isTheme && !e.isBuiltin);
    if (!modelData.fileOnExtension && !modelData.fileOnMarketplace && nonThemeExtensions.length > 0) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "extensions",
        label: localize("extensions", "Extensions ({0})", nonThemeExtensions.length),
        checked: this.includeExtensions,
        onToggle: (checked) => {
          this.includeExtensions = checked;
          this.model.update({ includeExtensions: checked });
        },
        renderContent: (container) => {
          const extTable = append(container, $("table.review-diag-table.review-ext-table"));
          const header = append(extTable, $("tr"));
          for (const h of ["Name", "Identifier", "Author", "Version"]) {
            const th = append(header, $("th.review-ext-th"));
            th.textContent = h;
          }
          for (const ext of nonThemeExtensions) {
            const row = append(extTable, $("tr"));
            append(row, $("td")).textContent = ext.displayName || ext.name;
            append(row, $("td")).textContent = ext.id;
            append(row, $("td")).textContent = ext.publisher ?? "";
            append(row, $("td")).textContent = ext.version;
          }
        }
      });
    }
    if (modelData.experimentInfo) {
      diagnosticSectionCount++;
      this.createDiagSection(diagContainer, {
        id: "experiments",
        label: localize("abExperiments", "A/B Experiments"),
        checked: this.includeExperiments,
        onToggle: (checked) => {
          this.includeExperiments = checked;
          this.model.update({ includeExperiments: checked });
        },
        renderContent: (container) => {
          const pre = append(container, $("pre.review-diag-pre"));
          pre.textContent = modelData.experimentInfo;
        }
      });
    }
    if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
      const performanceContainer = append(diagContainer, $("div.review-performance-data"));
      if (this.performanceInfoRefreshing) {
        performanceContainer.classList.add("refreshing");
      }
      const performanceTitleRow = append(performanceContainer, $("div.review-performance-title-row"));
      const performanceTitle = append(performanceTitleRow, $("div.review-performance-title"));
      performanceTitle.textContent = localize("additionalPerformanceData", "Additional Performance Data");
      if (this.refreshPerformanceInfo) {
        const refreshBtn = this.disposables.add(new Button(performanceTitleRow, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
        refreshBtn.element.classList.add("review-performance-refresh");
        refreshBtn.label = `$(refresh) ${localize("refresh", "Refresh")}`;
        refreshBtn.element.title = localize("refreshPerformanceData", "Reload running processes and workspace metadata");
        refreshBtn.enabled = !this.performanceInfoRefreshing;
        this.disposables.add(refreshBtn.onDidClick(async () => {
          if (!this.refreshPerformanceInfo || this.performanceInfoRefreshing) {
            return;
          }
          this.performanceInfoRefreshing = true;
          refreshBtn.enabled = false;
          performanceContainer.classList.add("refreshing");
          this.updateStepUI();
          try {
            await this.refreshPerformanceInfo();
          } finally {
            this.performanceInfoRefreshing = false;
            if (this.currentStep === 2 /* Review */) {
              this.updateReviewDetails();
            }
            this.updateStepUI();
          }
        }));
      }
      const performanceDescription = append(performanceContainer, $("div.review-performance-description"));
      performanceDescription.textContent = localize("additionalPerformanceDataDescription", "Optionally include currently running processes and workspace metadata to help diagnose performance issues.");
      if (modelData.processInfo) {
        diagnosticSectionCount++;
        this.createDiagSection(performanceContainer, {
          id: "process-info",
          label: localize("runningProcesses", "Running Processes"),
          checked: this.includeProcessInfo,
          onToggle: (checked) => {
            this.includeProcessInfo = checked;
            this.model.update({ includeProcessInfo: checked });
          },
          renderContent: (container) => {
            const pre = append(container, $("pre.review-diag-pre"));
            pre.textContent = modelData.processInfo;
          }
        });
      } else if (!this.performanceInfoLoaded) {
        const loading = append(performanceContainer, $("div.review-diag-loading"));
        loading.textContent = localize("loadingProcessInfo", "Loading currently running processes...");
      }
      if (modelData.workspaceInfo) {
        diagnosticSectionCount++;
        this.createDiagSection(performanceContainer, {
          id: "workspace-info",
          label: localize("workspaceMetadata", "Workspace Metadata"),
          checked: this.includeWorkspaceInfo,
          onToggle: (checked) => {
            this.includeWorkspaceInfo = checked;
            this.model.update({ includeWorkspaceInfo: checked });
          },
          renderContent: (container) => {
            const pre = append(container, $("pre.review-diag-pre"));
            pre.textContent = modelData.workspaceInfo;
          }
        });
      } else if (!this.performanceInfoLoaded) {
        const loading = append(performanceContainer, $("div.review-diag-loading"));
        loading.textContent = localize("loadingWorkspaceInfo", "Loading workspace metadata...");
      }
    }
    if (diagnosticSectionCount > 0) {
      const heading = document.createElement("div");
      heading.className = "review-diag-heading";
      const masterWrap = append(heading, $("div.review-diag-master-wrap"));
      const masterCheckbox = this.disposables.add(new Checkbox(localize("additionalInformation", "Additional Information"), !this.diagnosticsCollapsed, defaultCheckboxStyles));
      masterCheckbox.domNode.classList.add("review-diag-master-checkbox");
      masterWrap.appendChild(masterCheckbox.domNode);
      const title = append(masterWrap, $("h3.review-diag-heading-title"));
      title.textContent = localize("additionalInformation", "Additional Information");
      this.disposables.add(masterCheckbox.onChange(() => {
        this.diagnosticsCollapsed = !masterCheckbox.checked;
        this.setAllDiagnosticSectionsIncluded(masterCheckbox.checked);
      }));
      diagContainer.classList.toggle("all-excluded", this.diagnosticsCollapsed);
      diagContainer.prepend(heading);
    }
    const titles = diagContainer.querySelectorAll(".review-diag-title");
    let maxWidth = 0;
    for (const t of titles) {
      t.style.minWidth = "";
    }
    for (const t of titles) {
      maxWidth = Math.max(maxWidth, t.offsetWidth);
    }
    if (maxWidth > 0) {
      for (const t of titles) {
        t.style.minWidth = `${maxWidth}px`;
      }
    }
  }
  setAllDiagnosticSectionsIncluded(included) {
    this.includeSystemInfo = included;
    this.includeExtensionData = included;
    this.includeExtensions = included;
    this.includeExperiments = included;
    this.includeProcessInfo = included;
    this.includeWorkspaceInfo = included;
    this.model.update({
      includeSystemInfo: included,
      includeExtensionData: included,
      includeExtensions: included,
      includeExperiments: included,
      includeProcessInfo: included,
      includeWorkspaceInfo: included
    });
    this.updateReviewDetails();
  }
  createDiagSection(parent, opts) {
    const group = append(parent, $("div.review-diag-group"));
    group.classList.toggle("excluded", !opts.checked);
    const header = append(group, $("div.review-diag-header"));
    const checkWrap = append(header, $("div.review-diag-check-wrap"));
    const checkbox = this.disposables.add(new Checkbox(opts.label, opts.checked, defaultCheckboxStyles));
    checkbox.domNode.classList.add("review-diag-checkbox");
    checkWrap.appendChild(checkbox.domNode);
    const toggleArea = append(header, $("div.review-diag-toggle-area"));
    toggleArea.setAttribute("role", "button");
    toggleArea.setAttribute("tabindex", "0");
    toggleArea.setAttribute("aria-expanded", "true");
    const chevron = append(toggleArea, $("span.review-diag-chevron"));
    chevron.appendChild(renderIcon(Codicon.chevronDown));
    const title = append(toggleArea, $("span.review-diag-title"));
    title.textContent = opts.label;
    const content = append(group, $("div.review-diag-content"));
    opts.renderContent(content);
    let expanded = true;
    const setExpanded = (next) => {
      expanded = next;
      content.style.display = expanded ? "" : "none";
      toggleArea.setAttribute("aria-expanded", String(expanded));
      chevron.textContent = "";
      chevron.appendChild(renderIcon(expanded ? Codicon.chevronDown : Codicon.chevronRight));
    };
    this.disposables.add(addDisposableListener(toggleArea, EventType.CLICK, () => setExpanded(!expanded)));
    this.disposables.add(addDisposableListener(toggleArea, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        e.preventDefault();
        setExpanded(!expanded);
      }
    }));
    this.disposables.add(checkbox.onChange(() => {
      opts.onToggle(checkbox.checked);
      group.classList.toggle("excluded", !checkbox.checked);
      this.updateStepUI();
    }));
  }
  addDiagRow(table, label, value) {
    const row = append(table, $("tr"));
    const th = append(row, $("td.review-diag-key"));
    th.textContent = label;
    const td = append(row, $("td.review-diag-val"));
    td.textContent = value;
  }
  /** Called by the form service to show upload progress */
  setUploading(uploading) {
    this.uploading = uploading;
    if (uploading) {
      this.nextButton.element.classList.add("uploading");
      this.nextButton.label = localize("uploading", "Uploading...");
      this.nextButton.enabled = false;
      this.backButton.element.style.display = "none";
    } else {
      this.nextButton.element.classList.remove("uploading");
      this.nextButton.enabled = true;
      this.updateStepUI();
    }
  }
  /** Mark a specific attachment as uploading / done */
  setAttachmentUploadState(index, state) {
    if (index < 0 || index >= this.reviewThumbCards.length) {
      return;
    }
    const card = this.reviewThumbCards[index];
    card.classList.remove("upload-pending", "upload-uploading", "upload-done");
    card.classList.add(`upload-${state}`);
    const overlay = card.querySelector(".review-progress-overlay");
    if (!overlay) {
      return;
    }
    if (state === "done") {
      overlay.textContent = "";
      const check = $("span.review-progress-check");
      check.appendChild(renderIcon(Codicon.check));
      overlay.appendChild(check);
    }
  }
  submit() {
    const title = this.titleInput.value.trim();
    if (!title) {
      return;
    }
    const description = this.descriptionTextarea.value.trim();
    this.updateIssueSourceFlags();
    this.model.update({ issueDescription: description, issueTitle: title, ...this.selectedIssueType !== void 0 ? { issueType: this.selectedIssueType } : {} });
    const body = this.buildIssueBody();
    this._onDidSubmit.fire({ title, body });
  }
  show() {
    if (this.visible) {
      return;
    }
    this.visible = true;
    this.wizardPanel.classList.add("open", "wizard-embedded");
    this.wizardPanel.style.maxHeight = "none";
    append(this.container, this.wizardPanel);
    this.wizardPanel.focus();
  }
  getTotalAttachments() {
    return this.screenshots.length + this.recordings.length;
  }
  getScreenshotDelayOptions() {
    return [
      { label: localize("noDelay", "No delay"), value: 0 },
      { label: localize("threeSeconds", "3 seconds"), value: 3 },
      { label: localize("fiveSeconds", "5 seconds"), value: 5 },
      { label: localize("tenSeconds", "10 seconds"), value: 10 }
    ];
  }
  getFloatingBarButtonStyles(targetWindow) {
    const containerStyles = targetWindow.getComputedStyle(this.container);
    const cssVar = (name, fallback) => containerStyles.getPropertyValue(name).trim() || fallback;
    return {
      ...defaultButtonStyles,
      buttonForeground: cssVar("--vscode-button-foreground", "#fff"),
      buttonBackground: cssVar("--vscode-button-background", "#0e639c"),
      buttonHoverBackground: cssVar("--vscode-button-hoverBackground", "#1177bb"),
      buttonBorder: cssVar("--vscode-button-border", "transparent")
    };
  }
  addScreenshot(screenshot) {
    if (this.getTotalAttachments() >= MAX_ATTACHMENTS) {
      return;
    }
    this.screenshots.push(screenshot);
    if (this.currentStep !== 0 /* Attachments */) {
      this.setStep(0 /* Attachments */);
    }
    this.updateAttachmentViews();
    this.updateAttachmentButtons();
    this.updateStepUI();
    this._onDidChangeAttachments.fire();
    this.openAnnotationEditor(this.screenshots.length - 1);
  }
  updateAttachmentButtons() {
    const atMax = this.getTotalAttachments() >= MAX_ATTACHMENTS;
    const maxMsg = localize("maxAttachmentsReached", "Max attachments reached");
    const wouldReachMax = this.getTotalAttachments() >= MAX_ATTACHMENTS - 1;
    const screenshotDisabled = atMax || wouldReachMax && this.currentRecordingState === RecordingState.Recording || this.delayedScreenshotPending;
    const recordDisabled = atMax || wouldReachMax && this.delayedScreenshotPending;
    if (this.captureStripCaptureBtn) {
      this.captureStripCaptureBtn.enabled = !screenshotDisabled;
      this.captureStripCaptureBtn.element.title = screenshotDisabled ? maxMsg : localize("screenshot", "Screenshot");
    }
    if (this.captureStripDelayBtn) {
      this.captureStripDelayBtn.enabled = !screenshotDisabled;
      this.captureStripDelayBtn.element.title = screenshotDisabled ? maxMsg : localize("captureOptions", "Capture options");
    }
    if (this.captureStripRecordBtn) {
      if (this.currentRecordingState !== RecordingState.Recording) {
        this.captureStripRecordBtn.enabled = !recordDisabled;
        this.captureStripRecordBtn.element.title = recordDisabled ? maxMsg : localize("recordVideo", "Record video");
      }
    }
    this.updateNextButtonForRecording();
  }
  updateNextButtonForRecording() {
    if (this.currentStep !== 2 /* Review */) {
      return;
    }
    const recording = this.currentRecordingState === RecordingState.Recording;
    this.nextButton.enabled = !recording;
    this.nextButton.element.title = recording ? localize("recordingActive", "Recording active") : localize("previewOnGitHub", "Preview on GitHub");
  }
  renderRecordingCard(parent, rec, index) {
    const card = append(parent, $("div.wizard-screenshot-card.wizard-recording-card"));
    if (rec.thumbnailDataUrl) {
      const thumbImg = append(card, $("img.wizard-screenshot-img"));
      thumbImg.setAttribute("src", rec.thumbnailDataUrl);
      thumbImg.alt = localize("recordingThumbnailAlt", "Recording {0}", index + 1);
      thumbImg.setAttribute("draggable", "false");
    }
    const playOverlay = append(card, $("div.wizard-recording-play"));
    playOverlay.appendChild(renderIcon(Codicon.play));
    const durSec = Math.floor(rec.durationMs / 1e3);
    const durLabel = append(card, $("div.wizard-recording-duration"));
    durLabel.textContent = `${Math.floor(durSec / 60)}:${(durSec % 60).toString().padStart(2, "0")}`;
    return card;
  }
  updateScreenshotThumbnails() {
    this.screenshotContainer.textContent = "";
    for (let i = 0; i < this.screenshots.length; i++) {
      const screenshot = this.screenshots[i];
      const card = append(this.screenshotContainer, $("div.wizard-screenshot-card"));
      const img = append(card, $("img"));
      img.src = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
      img.alt = localize("screenshotAlt", "Screenshot {0}", i + 1);
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.title = localize("editScreenshot", "Click to edit screenshot");
      const openEditor = () => this.openAnnotationEditor(i);
      this.disposables.add(addDisposableListener(card, EventType.CLICK, openEditor));
      this.disposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
          e.preventDefault();
          openEditor();
        }
      }));
      const deleteBtn = append(card, $("div.wizard-screenshot-delete"));
      deleteBtn.setAttribute("role", "button");
      deleteBtn.setAttribute("aria-label", localize("deleteScreenshot", "Delete screenshot"));
      deleteBtn.appendChild(renderIcon(Codicon.close));
      this.disposables.add(addDisposableListener(deleteBtn, EventType.CLICK, (e) => {
        e.stopPropagation();
        this.screenshots.splice(i, 1);
        this.updateScreenshotThumbnails();
        this.updateAttachmentButtons();
        this.updateStepUI();
        this._onDidChangeAttachments.fire();
      }));
    }
    for (let i = 0; i < this.recordings.length; i++) {
      const rec = this.recordings[i];
      const card = this.renderRecordingCard(this.screenshotContainer, rec, i);
      this.disposables.add(addDisposableListener(card, EventType.CLICK, () => {
        this._onDidRequestOpenRecording.fire(rec.filePath);
      }));
      const deleteBtn = append(card, $("div.wizard-screenshot-delete"));
      deleteBtn.setAttribute("role", "button");
      deleteBtn.setAttribute("aria-label", localize("deleteRecording", "Remove recording"));
      deleteBtn.appendChild(renderIcon(Codicon.close));
      this.disposables.add(addDisposableListener(deleteBtn, EventType.CLICK, (e) => {
        e.stopPropagation();
        this.recordings.splice(i, 1);
        this.updateScreenshotThumbnails();
        this.updateAttachmentButtons();
        this.updateStepUI();
        this._onDidChangeAttachments.fire();
      }));
    }
    if (this.getTotalAttachments() < MAX_ATTACHMENTS) {
      const wouldReachMax = this.getTotalAttachments() >= MAX_ATTACHMENTS - 1;
      const addDisabled = wouldReachMax && (this.currentRecordingState === RecordingState.Recording || this.delayedScreenshotPending);
      const addCard = append(this.screenshotContainer, $("div.wizard-screenshot-card.wizard-screenshot-add"));
      if (addDisabled) {
        addCard.classList.add("disabled");
        addCard.title = localize("maxAttachmentsReached", "Max attachments reached");
      }
      const plus = append(addCard, $("div.wizard-screenshot-plus"));
      plus.appendChild(renderIcon(Codicon.add));
      this.disposables.add(addDisposableListener(addCard, EventType.CLICK, () => {
        if (!addCard.classList.contains("disabled")) {
          this._onDidRequestScreenshot.fire();
        }
      }));
    }
  }
  openAnnotationEditor(index) {
    if (index < 0 || index >= this.screenshots.length) {
      return;
    }
    const screenshot = this.screenshots[index];
    const editor = new ScreenshotAnnotationEditor(screenshot, this.wizardPanel, screenshot.annotationState);
    this.disposables.add(editor);
    this.disposables.add(editor.onDidSave(({ dataUrl, state }) => {
      screenshot.annotatedDataUrl = dataUrl;
      screenshot.annotationState = state;
      this.updateAttachmentViews();
      this._onDidChangeAttachments.fire();
    }));
    this.disposables.add(editor.onDidCancel(() => {
    }));
  }
  getScreenshots() {
    return this.screenshots;
  }
  getRecordings() {
    return this.recordings;
  }
  /**
   * Replace the current attachments with a previously-captured set. Used when the
   * issue reporter editor is moved between the main editor area and a modal editor
   * part in the Agents Window, which rebuilds the wizard and would otherwise drop
   * the in-memory screenshots and recordings. Does not fire
   * `onDidChangeAttachments` since the host is the source of this state.
   */
  restoreAttachments(screenshots, recordings) {
    this.screenshots.length = 0;
    this.screenshots.push(...screenshots.slice(0, MAX_ATTACHMENTS));
    this.recordings.length = 0;
    this.recordings.push(...recordings.slice(0, Math.max(0, MAX_ATTACHMENTS - this.screenshots.length)));
    this.updateAttachmentViews();
    this.updateAttachmentButtons();
    this.updateStepUI();
  }
  buildIssueBody() {
    const description = this.descriptionTextarea.value.trim();
    this.model.update({
      issueDescription: description,
      issueType: this.selectedIssueType ?? IssueType.Bug,
      includeSystemInfo: this.includeSystemInfo,
      includeProcessInfo: this.includeProcessInfo,
      includeWorkspaceInfo: this.includeWorkspaceInfo,
      includeExtensions: this.includeExtensions,
      includeExperiments: this.includeExperiments,
      includeExtensionData: this.includeExtensionData
    });
    const modelData = this.model.getData();
    const sections = [
      `### Description

${description}`,
      this.generateIssueDetailsMd()
    ];
    if (this.includeExtensionData && modelData.extensionData) {
      sections.push(this.createDetails("Extension Data", modelData.extensionData));
    }
    if (this.includeSystemInfo && (modelData.versionInfo || modelData.systemInfo || modelData.systemInfoWeb)) {
      sections.push(this.generateSystemInfoMd());
    }
    if (!modelData.fileOnExtension && !modelData.fileOnMarketplace && this.includeExtensions) {
      sections.push(this.generateExtensionsMd());
    }
    if (this.includeExperiments && modelData.experimentInfo) {
      sections.push(this.createDetails("A/B Experiments", this.createCodeBlock(modelData.experimentInfo)));
    }
    if (this.selectedIssueType === IssueType.PerformanceIssue && !modelData.fileOnMarketplace) {
      if (this.includeProcessInfo && modelData.processInfo) {
        sections.push(this.createDetails("Running Processes", this.createCodeBlock(modelData.processInfo)));
      }
      if (this.includeWorkspaceInfo && modelData.workspaceInfo) {
        sections.push(this.createDetails("Workspace Metadata", this.createCodeBlock(modelData.workspaceInfo)));
      }
    }
    sections.push("<!-- generated by issue reporter -->");
    return sections.join("\n\n");
  }
  generateIssueDetailsMd() {
    const modelData = this.model.getData();
    const rows = [
      ["Issue Category", this.getIssueTypeTitle(this.selectedIssueType ?? IssueType.Bug)],
      ["Target", this.getIssueSourceLabel()],
      ["VS Code Version", modelData.versionInfo?.vscodeVersion ?? product.version],
      ["OS Version", modelData.versionInfo?.os ?? modelData.systemInfo?.os]
    ];
    if (this.selectedIssueSource === IssueSource.Extension && this.selectedExtension) {
      rows.push(
        ["Extension Identifier", this.selectedExtension.id],
        ["Extension Version", this.selectedExtension.version],
        ["Extension Publisher", this.selectedExtension.publisher]
      );
    }
    return `### Issue Details

${this.createMarkdownTable(rows)}`;
  }
  generateSystemInfoMd() {
    const modelData = this.model.getData();
    const rows = [];
    if (modelData.versionInfo) {
      rows.push(
        ["VS Code Version", modelData.versionInfo.vscodeVersion],
        ["OS Version", modelData.versionInfo.os]
      );
    }
    if (modelData.systemInfo) {
      rows.push(
        ["CPUs", modelData.systemInfo.cpus],
        ["GPU Status", Object.keys(modelData.systemInfo.gpuStatus).map((key) => `${key}: ${modelData.systemInfo.gpuStatus[key]}`).join("<br>")],
        ["Load (avg)", modelData.systemInfo.load],
        ["Memory (System)", modelData.systemInfo.memory],
        ["Process Argv", modelData.systemInfo.processArgs],
        ["Screen Reader", modelData.systemInfo.screenReader],
        ["VM", modelData.systemInfo.vmHint]
      );
      if (modelData.systemInfo.linuxEnv) {
        rows.push(
          ["DESKTOP_SESSION", modelData.systemInfo.linuxEnv.desktopSession],
          ["XDG_CURRENT_DESKTOP", modelData.systemInfo.linuxEnv.xdgCurrentDesktop],
          ["XDG_SESSION_DESKTOP", modelData.systemInfo.linuxEnv.xdgSessionDesktop],
          ["XDG_SESSION_TYPE", modelData.systemInfo.linuxEnv.xdgSessionType]
        );
      }
      for (const remote of modelData.systemInfo.remoteData) {
        if (isRemoteDiagnosticError(remote)) {
          rows.push(["Remote Error", remote.errorMessage]);
        } else {
          rows.push(
            ["Remote", remote.latency ? `${remote.hostName} (latency: ${remote.latency.current.toFixed(2)}ms last, ${remote.latency.average.toFixed(2)}ms average)` : remote.hostName],
            ["Remote OS", remote.machineInfo.os],
            ["Remote CPUs", remote.machineInfo.cpus],
            ["Remote Memory (System)", remote.machineInfo.memory],
            ["Remote VM", remote.machineInfo.vmHint]
          );
        }
      }
    }
    if (modelData.systemInfoWeb) {
      rows.push(["User Agent", modelData.systemInfoWeb]);
    }
    rows.push(["Installation pure", String(modelData.isInstallationPure ?? true)]);
    return this.createDetails("System Info", this.createMarkdownTable(rows));
  }
  generateExtensionsMd() {
    const modelData = this.model.getData();
    const nonThemeExtensions = modelData.enabledNonThemeExtesions ?? modelData.allExtensions.filter((extension) => !extension.isTheme && !extension.isBuiltin);
    if (modelData.extensionsDisabled) {
      return "### Extensions\n\nExtensions disabled.";
    }
    if (!nonThemeExtensions.length && !modelData.numberOfThemeExtesions) {
      return "### Extensions\n\nExtensions: none";
    }
    const rows = nonThemeExtensions.map((extension) => [
      extension.displayName || extension.name,
      extension.id,
      extension.publisher ?? "N/A",
      extension.version
    ]);
    const details = [];
    if (rows.length) {
      details.push(this.createMarkdownTable(rows, ["Name", "Identifier", "Author", "Version"]));
    }
    if (modelData.numberOfThemeExtesions) {
      details.push(`Theme extensions: ${modelData.numberOfThemeExtesions}`);
    }
    return this.createDetails(`Extensions (${nonThemeExtensions.length})`, details.join("\n\n"));
  }
  getIssueTypeTitle(issueType) {
    switch (issueType) {
      case IssueType.Bug:
        return "Bug";
      case IssueType.PerformanceIssue:
        return "Performance Issue";
      case IssueType.FeatureRequest:
        return "Feature Request";
    }
  }
  createDetails(summary, content) {
    return `<details>
<summary>${summary}</summary>

${content}

</details>`;
  }
  createCodeBlock(content, language = "") {
    return `\`\`\`${language}
${content.trimEnd()}
\`\`\``;
  }
  createMarkdownTable(rows, headers = ["Item", "Value"]) {
    return `${headers.map((header) => this.escapeMarkdownTableCell(header)).join("|")}
${headers.map(() => "---").join("|")}
${rows.map((row) => row.map((value) => this.escapeMarkdownTableCell(value ?? "")).join("|")).join("\n")}`;
  }
  escapeMarkdownTableCell(value) {
    return value.replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
  }
  setUpdateAvailable(showUpdateBanner) {
    this.showUpdateBanner = showUpdateBanner;
    this.updateBanner.style.display = showUpdateBanner ? "" : "none";
  }
  focus() {
    this.wizardPanel.focus();
  }
  getPanel() {
    return this.wizardPanel;
  }
  get recordingState() {
    return this.currentRecordingState;
  }
  hideFloatingBar() {
    if (this.floatingBar) {
      this.floatingBar.style.display = "none";
    }
  }
  showFloatingBar() {
    if (this.floatingBar) {
      this.floatingBar.style.display = "";
    }
  }
  get shouldHideToolbarForCapture() {
    return this._hideToolbarInScreenshots;
  }
  /** Re-parent the floating bar into the wizard's current window. */
  reparentFloatingBar() {
    if (!this.floatingBar) {
      return;
    }
    const targetWindow = getWindow(this.container);
    const workbench = targetWindow.document.querySelector(".monaco-workbench");
    const mountTarget = workbench ?? targetWindow.document.body;
    if (this.floatingBar.parentElement !== mountTarget) {
      this.floatingBar.remove();
      mountTarget.appendChild(this.floatingBar);
      this.floatingBar.style.left = "";
      this.floatingBar.style.top = "";
      this.floatingBar.style.right = "30%";
    }
  }
  /** Update the internal model with additional data loaded asynchronously */
  updateModel(newData) {
    this.model.update(newData);
    if (Array.isArray(newData.allExtensions)) {
      this.data.enabledExtensions = newData.allExtensions;
      this.updateExtensionOptions();
      this.updateIssueSourceFlags();
      this.updateIssueSourceButtons();
    }
    if (this.currentStep === 2 /* Review */) {
      this.updateReviewDetails();
    }
  }
  /** Called once performance info has resolved; suppresses "Loading…" placeholders. */
  markPerformanceInfoLoaded() {
    this.performanceInfoLoaded = true;
    if (this.currentStep === 2 /* Review */) {
      this.updateReviewDetails();
      this.updateStepUI();
    }
  }
  hasUnsavedChanges() {
    if (this.previewOpened && this.previewedDraftKey === this.getDraftKey()) {
      return false;
    }
    return this.hasUserInput();
  }
  hasUserInput() {
    return !!(this.hasDescriptionContent() || this.titleInput.value.trim() || this.selectedIssueType !== void 0 || this.screenshots.length > 0 || this.recordings.length > 0);
  }
  markPreviewOpened() {
    this.previewOpened = true;
    this.previewedDraftKey = this.getDraftKey();
    this.updateStepUI();
  }
  getDraftKey() {
    return JSON.stringify({
      title: this.titleInput.value.trim(),
      description: this.descriptionTextarea.value.trim(),
      issueType: this.selectedIssueType,
      issueSource: this.selectedIssueSource,
      extensionId: this.selectedExtension?.id,
      includeSystemInfo: this.includeSystemInfo,
      includeProcessInfo: this.includeProcessInfo,
      includeWorkspaceInfo: this.includeWorkspaceInfo,
      includeExtensions: this.includeExtensions,
      includeExperiments: this.includeExperiments,
      includeExtensionData: this.includeExtensionData,
      screenshots: this.screenshots.map((screenshot) => screenshot.annotatedDataUrl ?? screenshot.dataUrl),
      recordings: this.recordings.map((recording) => recording.filePath)
    });
  }
  /** Set the title input value (e.g., from AI generation) */
  setGeneratedTitle(title) {
    this.titleInput.value = title;
    if (title.trim()) {
      this.setFieldError(this.titleInput.element, this.titleError, false);
    }
    this.resetGenerateButton();
  }
  resetGenerateButton() {
    this.generateTitleBtn.label = `$(sparkle) ${localize("generateTitleBtn", "Generate from description")}`;
    this.generateTitleBtn.element.classList.remove("loading");
    this.generateTitleBtn.element.style.minWidth = "";
    this.generateTitleBtn.enabled = this.hasDescriptionContent();
  }
  /** Show a "Close" button next to the submit button after successful submission */
  showCloseButton() {
    const nav = this.nextButton.element.parentElement;
    if (nav && !nav.querySelector(".wizard-close-btn")) {
      this.closeButton = this.disposables.add(new Button(nav, { ...defaultButtonStyles, secondary: true }));
      this.closeButton.label = localize("closeTab", "Close");
      this.closeButton.element.classList.add("wizard-close-btn");
      this.disposables.add(this.closeButton.onDidClick(() => {
        this._onDidClose.fire();
      }));
    }
    this.updateStepUI();
  }
  setRecordingState(state) {
    this.currentRecordingState = state;
    if (state === RecordingState.Recording) {
      this.recordingStartTime = Date.now();
      const formatTime = () => {
        const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1e3);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, "0");
        const secs = (elapsed % 60).toString().padStart(2, "0");
        return `${mins}:${secs}`;
      };
      const stopLabel = localize("stopRecording", "Stop recording");
      const makeLabel = () => `$(stop-circle) ${stopLabel} ${formatTime()}`;
      if (this.captureStripRecordBtn) {
        this.captureStripRecordBtn.element.classList.add("recording");
        this.captureStripRecordBtn.element.title = stopLabel;
        this.captureStripRecordBtn.label = makeLabel();
      }
      this.recordingElapsedTimer = getWindow(this.container).setInterval(() => {
        if (this.captureStripRecordBtn) {
          this.captureStripRecordBtn.label = makeLabel();
        }
      }, 1e3);
    } else {
      if (this.recordingElapsedTimer !== void 0) {
        getWindow(this.container).clearInterval(this.recordingElapsedTimer);
        this.recordingElapsedTimer = void 0;
      }
      if (this.captureStripRecordBtn) {
        this.captureStripRecordBtn.element.classList.remove("recording");
        this.captureStripRecordBtn.element.title = localize("recordVideo", "Record video");
        this.captureStripRecordBtn.label = `$(record) ${localize("recordVideo", "Record video")}`;
      }
    }
    this.updateScreenshotThumbnails();
    this.updateAttachmentButtons();
  }
  addRecording(filePath, durationMs, thumbnailDataUrl) {
    this.recordings.push({ filePath, durationMs, thumbnailDataUrl });
    if (this.currentStep !== 0 /* Attachments */) {
      this.setStep(0 /* Attachments */);
    }
    this.updateAttachmentViews();
    this.updateAttachmentButtons();
    this.updateStepUI();
    this._onDidChangeAttachments.fire();
  }
  updateAttachmentViews() {
    this.updateScreenshotThumbnails();
    if (this.currentStep === 2 /* Review */) {
      this.updateReviewDetails();
    }
  }
  /**
   * Trigger a screenshot capture as if the user clicked the screenshot button
   * on the floating capture bar. The floating bar is mounted at the workbench
   * root and the button is enabled regardless of the current wizard step, so
   * the shortcut works from any step without changing it. The existing
   * capture flow opens the annotation editor and re-activates the issue
   * reporter editor when the screenshot is added.
   *
   * No-op when the capture button is disabled (e.g. at the attachment limit).
   */
  triggerCaptureScreenshot() {
    const btn = this.captureStripCaptureBtn;
    if (!btn?.enabled) {
      return;
    }
    btn.element.click();
  }
  /**
   * Toggle screen recording on/off as if the user clicked the record button.
   * Works from any step without changing it. No-op when recording isn't
   * supported or the record button is disabled.
   */
  triggerToggleRecording() {
    if (!this.recordingSupported) {
      return;
    }
    const btn = this.captureStripRecordBtn;
    if (!btn?.enabled) {
      return;
    }
    btn.element.click();
  }
  renderShortcutKeycap(parent, keybinding) {
    const label = this.disposables.add(new KeybindingLabel(parent, OS, { ...defaultKeybindingLabelStyles }));
    label.set(keybinding);
    label.element.classList.add("wizard-shortcut");
  }
  dispose() {
    if (this.recordingElapsedTimer !== void 0) {
      getWindow(this.container).clearInterval(this.recordingElapsedTimer);
    }
    if (this.similarIssuesHandle !== void 0) {
      clearTimeout(this.similarIssuesHandle);
    }
    this.similarIssuesRequest++;
    this.reviewRenderDisposables.dispose();
    this.similarIssuesDisposables.dispose();
    this.descriptionGuidanceDisposables.dispose();
    this.disposables.dispose();
    this._onDidClose.dispose();
    this._onDidSubmit.dispose();
    this._onDidRequestScreenshot.dispose();
    this._onDidRequestStartRecording.dispose();
    this._onDidRequestStopRecording.dispose();
    this._onDidRequestOpenRecording.dispose();
    this._onDidRequestOpenScreenshot.dispose();
    this._onDidChangeAttachments.dispose();
    this._onDidRequestGenerateTitle.dispose();
  }
}
export {
  IssueReporterOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2Jyb3dzZXIvaXNzdWVSZXBvcnRlck92ZXJsYXkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBLZXliaW5kaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAnLi9tZWRpYS9pc3N1ZVJlcG9ydGVyT3ZlcmxheS5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCwgRXZlbnRUeXBlLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSW5wdXRCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgSVNlbGVjdE9wdGlvbkl0ZW0sIFNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBpc1JlbW90ZURpYWdub3N0aWNFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2NvbW1vbi9kaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMsIGRlZmF1bHRJbnB1dEJveFN0eWxlcywgZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVHaXRIdWJVcmwgfSBmcm9tICcuLi9jb21tb24vaXNzdWVSZXBvcnRlclV0aWwuanMnO1xuaW1wb3J0IHsgSXNzdWVSZXBvcnRlckRhdGEsIElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhLCBJc3N1ZVNvdXJjZSwgSXNzdWVUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2lzc3VlLmpzJztcbmltcG9ydCB7IElzc3VlUmVwb3J0ZXJNb2RlbCB9IGZyb20gJy4vaXNzdWVSZXBvcnRlck1vZGVsLmpzJztcbmltcG9ydCB7IFJlY29yZGluZ1N0YXRlIH0gZnJvbSAnLi9yZWNvcmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBbm5vdGF0aW9uRWRpdG9yU3RhdGUsIFNjcmVlbnNob3RBbm5vdGF0aW9uRWRpdG9yIH0gZnJvbSAnLi9zY3JlZW5zaG90QW5ub3RhdGlvbi5qcyc7XG5cbmNvbnN0IE1BWF9BVFRBQ0hNRU5UUyA9IDU7XG5jb25zdCBNQVhfU0lNSUxBUl9JU1NVRVMgPSA1O1xuXG5pbnRlcmZhY2UgSVNpbWlsYXJJc3N1ZSB7XG5cdHJlYWRvbmx5IGh0bWxfdXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0YXRlPzogc3RyaW5nO1xufVxuXG5jb25zdCBlbnVtIFdpemFyZFN0ZXAge1xuXHRBdHRhY2htZW50cyA9IDAsXG5cdERlc2NyaWJlID0gMSxcblx0UmV2aWV3ID0gMixcbn1cblxuY29uc3QgU1RFUF9DT1VOVCA9IDM7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNjcmVlbnNob3Qge1xuXHRyZWFkb25seSBkYXRhVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xuXHRhbm5vdGF0ZWREYXRhVXJsPzogc3RyaW5nO1xuXHRhbm5vdGF0aW9uU3RhdGU/OiBJQW5ub3RhdGlvbkVkaXRvclN0YXRlO1xufVxuXG5leHBvcnQgY2xhc3MgSXNzdWVSZXBvcnRlck92ZXJsYXkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3VibWl0ID0gbmV3IEVtaXR0ZXI8eyB0aXRsZTogc3RyaW5nOyBib2R5OiBzdHJpbmcgfT4oKTtcblx0cmVhZG9ubHkgb25EaWRTdWJtaXQ6IEV2ZW50PHsgdGl0bGU6IHN0cmluZzsgYm9keTogc3RyaW5nIH0+ID0gdGhpcy5fb25EaWRTdWJtaXQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdFNjcmVlbnNob3QgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RTY3JlZW5zaG90OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkUmVxdWVzdFNjcmVlbnNob3QuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdFN0YXJ0UmVjb3JkaW5nID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0U3RhcnRSZWNvcmRpbmc6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRSZXF1ZXN0U3RhcnRSZWNvcmRpbmcuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdFN0b3BSZWNvcmRpbmcgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RTdG9wUmVjb3JkaW5nOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkUmVxdWVzdFN0b3BSZWNvcmRpbmcuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdE9wZW5SZWNvcmRpbmcgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdE9wZW5SZWNvcmRpbmc6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRpZFJlcXVlc3RPcGVuUmVjb3JkaW5nLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RPcGVuU2NyZWVuc2hvdCA9IG5ldyBFbWl0dGVyPElTY3JlZW5zaG90PigpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RPcGVuU2NyZWVuc2hvdDogRXZlbnQ8SVNjcmVlbnNob3Q+ID0gdGhpcy5fb25EaWRSZXF1ZXN0T3BlblNjcmVlbnNob3QuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXR0YWNobWVudHMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHQvKiogRmlyZXMgd2hlbmV2ZXIgdGhlIHNjcmVlbnNob3QvcmVjb3JkaW5nIGNvbGxlY3Rpb24gY2hhbmdlcyBzbyB0aGUgaG9zdCBjYW4gcGVyc2lzdCBpdC4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdHRhY2htZW50czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUF0dGFjaG1lbnRzLmV2ZW50O1xuXG5cdHByaXZhdGUgd2l6YXJkUGFuZWwhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB1cGRhdGVCYW5uZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzdGVwQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RlcFBhZ2VzOiBIVE1MRWxlbWVudFtdID0gW107XG5cblx0Ly8gU3RlcCAxOiBEZXNjcmliZSAoY2F0ZWdvcnkgKyBkZXNjcmlwdGlvbiArIHRpdGxlKVxuXHRwcml2YXRlIHJlYWRvbmx5IGlzc3VlVHlwZUJ1dHRvbnM6IEJ1dHRvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgaXNzdWVTb3VyY2VCdXR0b25zOiBCdXR0b25bXSA9IFtdO1xuXHRwcml2YXRlIHNlbGVjdGVkSXNzdWVUeXBlOiBJc3N1ZVR5cGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2VsZWN0ZWRJc3N1ZVNvdXJjZTogSXNzdWVTb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2VsZWN0ZWRFeHRlbnNpb246IElzc3VlUmVwb3J0ZXJFeHRlbnNpb25EYXRhIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNvdXJjZUJ1dHRvbkdyb3VwITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc291cmNlRXJyb3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0YXJnZXRTdGF0dXMhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBleHRlbnNpb25GaWVsZCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGV4dGVuc2lvblNlbGVjdCE6IFNlbGVjdEJveDtcblx0cHJpdmF0ZSBleHRlbnNpb25PcHRpb25zOiB7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGhpZGRlbj86IGJvb2xlYW4gfVtdID0gW107XG5cdHByaXZhdGUgZXh0ZW5zaW9uRXJyb3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBleHRlbnNpb25TdGF0dXMhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkaWRBdHRlbXB0RGVzY3JpYmVTdWJtaXQgPSBmYWxzZTtcblx0cHJpdmF0ZSBzaW1pbGFySXNzdWVzQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2ltaWxhcklzc3Vlc1JlcXVlc3QgPSAwO1xuXHRwcml2YXRlIGV4dGVuc2lvbkRhdGFSZXF1ZXN0ID0gMDtcblx0cHJpdmF0ZSBzaW1pbGFySXNzdWVzSGFuZGxlOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0eXBlQnV0dG9uR3JvdXAhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0eXBlRXJyb3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkZXNjcmlwdGlvblRleHRhcmVhITogSFRNTFRleHRBcmVhRWxlbWVudDtcblx0cHJpdmF0ZSBkZXNjcmlwdGlvbkd1aWRhbmNlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZGVzY3JpcHRpb25FcnJvciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRpdGxlSW5wdXQhOiBJbnB1dEJveDtcblx0cHJpdmF0ZSB0aXRsZUVycm9yITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZ2VuZXJhdGVUaXRsZUJ0biE6IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXF1ZXN0R2VuZXJhdGVUaXRsZSA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0R2VuZXJhdGVUaXRsZTogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkUmVxdWVzdEdlbmVyYXRlVGl0bGUuZXZlbnQ7XG5cblx0Ly8gU3RlcCAwOiBTY3JlZW5zaG90cyAmIFJlY29yZGluZ1xuXHRwcml2YXRlIHNjcmVlbnNob3RDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzY3JlZW5zaG90RGVsYXkgPSAwO1xuXHRwcml2YXRlIHJlY29yZGluZ0VsYXBzZWRUaW1lcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlY29yZGluZ1N0YXJ0VGltZSA9IDA7XG5cdHByaXZhdGUgY3VycmVudFJlY29yZGluZ1N0YXRlID0gUmVjb3JkaW5nU3RhdGUuSWRsZTtcblx0cHJpdmF0ZSBkZWxheWVkU2NyZWVuc2hvdFBlbmRpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSByZWNvcmRpbmdzOiB7IGZpbGVQYXRoOiBzdHJpbmc7IGR1cmF0aW9uTXM6IG51bWJlcjsgdGh1bWJuYWlsRGF0YVVybD86IHN0cmluZyB9W10gPSBbXTtcblxuXHQvLyBTdGVwIDI6IFJldmlld1xuXHRwcml2YXRlIHJldmlld1RodW1iQ2FyZHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSByZXZpZXdSZW5kZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBzaW1pbGFySXNzdWVzRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVzY3JpcHRpb25HdWlkYW5jZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHVwbG9hZGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIGluY2x1ZGVTeXN0ZW1JbmZvID0gdHJ1ZTtcblx0cHJpdmF0ZSBpbmNsdWRlUHJvY2Vzc0luZm8gPSB0cnVlO1xuXHRwcml2YXRlIGluY2x1ZGVXb3Jrc3BhY2VJbmZvID0gdHJ1ZTtcblx0cHJpdmF0ZSBpbmNsdWRlRXh0ZW5zaW9ucyA9IHRydWU7XG5cdHByaXZhdGUgaW5jbHVkZUV4cGVyaW1lbnRzID0gdHJ1ZTtcblx0cHJpdmF0ZSBpbmNsdWRlRXh0ZW5zaW9uRGF0YSA9IGZhbHNlO1xuXHRwcml2YXRlIGRpYWdub3N0aWNzQ29sbGFwc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgcGVyZm9ybWFuY2VJbmZvTG9hZGVkID0gZmFsc2U7XG5cdHByaXZhdGUgcGVyZm9ybWFuY2VJbmZvUmVmcmVzaGluZyA9IGZhbHNlO1xuXG5cdC8vIE5hdmlnYXRpb25cblx0cHJpdmF0ZSBzdGVwSW5kaWNhdG9yITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc3RlcExhYmVsITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYmFja0J1dHRvbiE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBuZXh0QnV0dG9uITogQnV0dG9uO1xuXG5cdC8vIFByb2dyZXNzIGRvdHNcblx0cHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc0RvdHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblxuXHRwcml2YXRlIGN1cnJlbnRTdGVwOiBXaXphcmRTdGVwID0gV2l6YXJkU3RlcC5BdHRhY2htZW50cztcblx0cHJpdmF0ZSByZWFkb25seSBzY3JlZW5zaG90czogSVNjcmVlbnNob3RbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJc3N1ZVJlcG9ydGVyTW9kZWw7XG5cdHByaXZhdGUgdmlzaWJsZSA9IGZhbHNlO1xuXHRwcml2YXRlIGZsb2F0aW5nQmFyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcmV2aWV3T3BlbmVkID0gZmFsc2U7XG5cdHByaXZhdGUgcHJldmlld2VkRHJhZnRLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjbG9zZUJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oaWRlVG9vbGJhckluU2NyZWVuc2hvdHMgPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgZGF0YTogSXNzdWVSZXBvcnRlckRhdGEsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZWNvcmRpbmdTdXBwb3J0ZWQ6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVByb3ZpZGVyPzogSUNvbnRleHRNZW51UHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZT86IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRpbml0aWFsSGlkZVRvb2xiYXI6IGJvb2xlYW4gPSB0cnVlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVzb2x2ZUV4dGVuc2lvbklzc3VlRGF0YT86IChleHRlbnNpb25JZDogc3RyaW5nKSA9PiBQcm9taXNlPElzc3VlUmVwb3J0ZXJEYXRhIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wZW5FeHRlcm5hbExpbms/OiAodXJsOiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD4sXG5cdFx0cHJpdmF0ZSBzaG93VXBkYXRlQmFubmVyID0gZmFsc2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZWZyZXNoUGVyZm9ybWFuY2VJbmZvPzogKCkgPT4gUHJvbWlzZTx2b2lkPixcblx0XHQvKiogUmV0dXJucyB0aGUgdXNlcidzIGN1cnJlbnRseS1ib3VuZCBrZXliaW5kaW5nIGZvciB0aGUgZ2l2ZW4gY29tbWFuZCBpZCwgb3IgdW5kZWZpbmVkIHdoZW4gdW5ib3VuZC4gKi9cblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlc29sdmVLZXliaW5kaW5nPzogKGNvbW1hbmRJZDogc3RyaW5nKSA9PiBSZXNvbHZlZEtleWJpbmRpbmcgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHRoaXMuX2hpZGVUb29sYmFySW5TY3JlZW5zaG90cyA9IGluaXRpYWxIaWRlVG9vbGJhcjtcblx0XHRjb25zdCBoYXNTdGFuZGFsb25lRXh0ZW5zaW9uRGF0YSA9ICEhZGF0YS5kYXRhICYmICFkYXRhLmV4dGVuc2lvbklkO1xuXHRcdHRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGEgPSBoYXNTdGFuZGFsb25lRXh0ZW5zaW9uRGF0YTtcblx0XHR0aGlzLm1vZGVsID0gbmV3IElzc3VlUmVwb3J0ZXJNb2RlbCh7XG5cdFx0XHQuLi5kYXRhLFxuXHRcdFx0aXNzdWVUeXBlOiBkYXRhLmlzc3VlVHlwZSB8fCBJc3N1ZVR5cGUuQnVnLFxuXHRcdFx0YWxsRXh0ZW5zaW9uczogZGF0YS5lbmFibGVkRXh0ZW5zaW9ucyxcblx0XHRcdGV4dGVuc2lvbkRhdGE6IGhhc1N0YW5kYWxvbmVFeHRlbnNpb25EYXRhID8gZGF0YS5kYXRhIDogdW5kZWZpbmVkLFxuXHRcdFx0aW5jbHVkZVN5c3RlbUluZm86IHRydWUsXG5cdFx0XHRpbmNsdWRlV29ya3NwYWNlSW5mbzogdHJ1ZSxcblx0XHRcdGluY2x1ZGVQcm9jZXNzSW5mbzogdHJ1ZSxcblx0XHRcdGluY2x1ZGVFeHRlbnNpb25zOiB0cnVlLFxuXHRcdFx0aW5jbHVkZUV4cGVyaW1lbnRzOiB0cnVlLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbkRhdGE6IGhhc1N0YW5kYWxvbmVFeHRlbnNpb25EYXRhLFxuXHRcdH0pO1xuXHRcdHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPSBkYXRhLmlzc3VlVHlwZTtcblx0XHR0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPSBkYXRhLmlzc3VlU291cmNlID8/IChkYXRhLmV4dGVuc2lvbklkID8gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uIDogdW5kZWZpbmVkKTtcblxuXHRcdHRoaXMuY3JlYXRlV2l6YXJkKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVdpemFyZCgpOiB2b2lkIHtcblx0XHR0aGlzLndpemFyZFBhbmVsID0gJCgnZGl2Lmlzc3VlLXJlcG9ydGVyLXdpemFyZCcpO1xuXHRcdHRoaXMud2l6YXJkUGFuZWwuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2RpYWxvZycpO1xuXHRcdHRoaXMud2l6YXJkUGFuZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3JlcG9ydElzc3VlJywgXCJSZXBvcnQgSXNzdWVcIikpO1xuXHRcdHRoaXMud2l6YXJkUGFuZWwuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICctMScpO1xuXG5cdFx0Ly8gVG9vbGJhciB3aXRoIHByb2dyZXNzIGluZGljYXRvciBhbmQgbmF2aWdhdGlvbiBidXR0b25zLiBUaGUgbmF2IGJ1dHRvbnNcblx0XHQvLyBzaXQgaW4gdGhlaXIgb3duIHJvdyBkaXJlY3RseSBiZW5lYXRoIHRoZSBzdGVwIGluZGljYXRvciwgYWxpZ25lZCB0byB0aGVcblx0XHQvLyBzdGFydCwgc28gdGhleSByZWFkIGFzIHBhcnQgb2YgdGhlIHN0ZXAgVUkuXG5cdFx0Y29uc3QgdG9vbGJhciA9IGFwcGVuZCh0aGlzLndpemFyZFBhbmVsLCAkKCdkaXYud2l6YXJkLXRvb2xiYXInKSk7XG5cblx0XHQvLyBQcm9ncmVzcyBpbmRpY2F0b3IgYXJlYVxuXHRcdGNvbnN0IHByb2dyZXNzQXJlYSA9IGFwcGVuZCh0b29sYmFyLCAkKCdkaXYud2l6YXJkLXByb2dyZXNzLWFyZWEnKSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NEb3RzQ29udGFpbmVyID0gYXBwZW5kKHByb2dyZXNzQXJlYSwgJCgnZGl2LndpemFyZC1wcm9ncmVzcy1kb3RzJykpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgU1RFUF9DT1VOVDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkb3QgPSBhcHBlbmQocHJvZ3Jlc3NEb3RzQ29udGFpbmVyLCAkKCdkaXYud2l6YXJkLXByb2dyZXNzLWRvdCcpKTtcblx0XHRcdHRoaXMucHJvZ3Jlc3NEb3RzLnB1c2goZG90KTtcblx0XHR9XG5cdFx0dGhpcy5zdGVwSW5kaWNhdG9yID0gYXBwZW5kKHByb2dyZXNzQXJlYSwgJCgnc3Bhbi53aXphcmQtc3RlcC1pbmRpY2F0b3InKSk7XG5cdFx0YXBwZW5kKHByb2dyZXNzQXJlYSwgJCgnc3Bhbi53aXphcmQtc3RlcC1zZXBhcmF0b3InKSk7XG5cdFx0dGhpcy5zdGVwTGFiZWwgPSBhcHBlbmQocHJvZ3Jlc3NBcmVhLCAkKCdzcGFuLndpemFyZC1zdGVwLWxhYmVsJykpO1xuXG5cdFx0Ly8gTmF2aWdhdGlvbiBidXR0b25zIHBsYWNlZCBpbiB0aGVpciBvd24gcm93IGRpcmVjdGx5IHVuZGVyIHRoZSBzdGVwXG5cdFx0Ly8gaW5kaWNhdG9yLCBhbGlnbmVkIHRvIHRoZSBzdGFydC5cblx0XHRjb25zdCBuYXYgPSBhcHBlbmQodG9vbGJhciwgJCgnZGl2LndpemFyZC1uYXYnKSk7XG5cblx0XHR0aGlzLmJhY2tCdXR0b24gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKG5hdiwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdHRoaXMuYmFja0J1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdiYWNrJywgXCJCYWNrXCIpO1xuXHRcdHRoaXMuYmFja0J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dpemFyZC1iYWNrJyk7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmVsZW1lbnQudGl0bGUgPSBsb2NhbGl6ZSgnYmFjaycsIFwiQmFja1wiKTtcblxuXHRcdHRoaXMubmV4dEJ1dHRvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24obmF2LCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5uZXh0QnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ25leHQnLCBcIk5leHRcIik7XG5cdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLW5leHQnKTtcblx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC50aXRsZSA9IGxvY2FsaXplKCduZXh0JywgXCJOZXh0XCIpO1xuXG5cdFx0dGhpcy51cGRhdGVCYW5uZXIgPSBhcHBlbmQodGhpcy53aXphcmRQYW5lbCwgJCgnZGl2LndpemFyZC11cGRhdGUtYmFubmVyJykpO1xuXHRcdHRoaXMudXBkYXRlQmFubmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdzdGF0dXMnKTtcblx0XHR0aGlzLnVwZGF0ZUJhbm5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblx0XHR0aGlzLnVwZGF0ZUJhbm5lci50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd1cGRhdGVBdmFpbGFibGUnLCBcIkEgbmV3IHZlcnNpb24gb2YgezB9IGlzIGF2YWlsYWJsZS5cIiwgcHJvZHVjdC5uYW1lTG9uZyk7XG5cdFx0dGhpcy5zZXRVcGRhdGVBdmFpbGFibGUodGhpcy5zaG93VXBkYXRlQmFubmVyKTtcblxuXHRcdC8vIFN0ZXAgY29udGVudCBhcmVhXG5cdFx0dGhpcy5zdGVwQ29udGFpbmVyID0gYXBwZW5kKHRoaXMud2l6YXJkUGFuZWwsICQoJ2Rpdi53aXphcmQtc3RlcC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5jcmVhdGVTdGVwMEF0dGFjaG1lbnRzKCk7XG5cdFx0dGhpcy5jcmVhdGVTdGVwMURlc2NyaWJlKCk7XG5cdFx0dGhpcy5jcmVhdGVTdGVwMlJldmlldygpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50SGFuZGxlcnMoKTtcblx0XHRpZiAodGhpcy5kYXRhLmV4dGVuc2lvbklkKSB7XG5cdFx0XHR2b2lkIHRoaXMudXBkYXRlU2VsZWN0ZWRFeHRlbnNpb24odGhpcy5kYXRhLmV4dGVuc2lvbklkLCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlU3RlcFVJKCk7XG5cdH1cblxuXHQvLyBTdGVwIDA6IEF0dGFjaG1lbnRzXG5cdHByaXZhdGUgY3JlYXRlU3RlcDBBdHRhY2htZW50cygpOiB2b2lkIHtcblx0XHRjb25zdCBwYWdlID0gYXBwZW5kKHRoaXMuc3RlcENvbnRhaW5lciwgJCgnZGl2LndpemFyZC1zdGVwJykpO1xuXHRcdHRoaXMuc3RlcFBhZ2VzLnB1c2gocGFnZSk7XG5cblx0XHRjb25zdCBoZWFkaW5nID0gYXBwZW5kKHBhZ2UsICQoJ2gyLndpemFyZC1oZWFkaW5nJykpO1xuXHRcdGhlYWRpbmcudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2NyZWVuc2hvdHNIZWFkaW5nJywgXCJBZGQgYXR0YWNobWVudHMgZm9yIGJldHRlciBjb250ZXh0XCIpO1xuXG5cdFx0Y29uc3Qgc3VidGl0bGUgPSBhcHBlbmQocGFnZSwgJCgncC53aXphcmQtc3VidGl0bGUnKSk7XG5cdFx0c3VidGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2NyZWVuc2hvdHNTdWJ0aXRsZScsIFwiWW91IGNhbiBhZGQgdXAgdG8gezB9IHNjcmVlbnNob3RzIG9yIHZpZGVvcy4gTmF2aWdhdGUgVlMgQ29kZSBhbmQgY2hvb3NlIHdoZW4gdG8gY2FwdHVyZS5cIiwgTUFYX0FUVEFDSE1FTlRTKTtcblxuXHRcdGNvbnN0IGNhcHR1cmVTaG9ydGN1dCA9IHRoaXMucmVzb2x2ZUtleWJpbmRpbmc/Lignd29ya2JlbmNoLmFjdGlvbi5pc3N1ZVJlcG9ydGVyLmNhcHR1cmVTY3JlZW5zaG90Jyk7XG5cdFx0Y29uc3QgcmVjb3JkU2hvcnRjdXQgPSB0aGlzLnJlY29yZGluZ1N1cHBvcnRlZCA/IHRoaXMucmVzb2x2ZUtleWJpbmRpbmc/Lignd29ya2JlbmNoLmFjdGlvbi5pc3N1ZVJlcG9ydGVyLnRvZ2dsZVJlY29yZGluZycpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjYXB0dXJlU2hvcnRjdXQgfHwgcmVjb3JkU2hvcnRjdXQpIHtcblx0XHRcdGNvbnN0IHRhcmdldERvY3VtZW50ID0gZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5kb2N1bWVudDtcblx0XHRcdGNvbnN0IGhpbnQgPSBhcHBlbmQocGFnZSwgJCgncC53aXphcmQtc3VidGl0bGUud2l6YXJkLXNob3J0Y3V0LWhpbnQnKSk7XG5cdFx0XHRjb25zdCBpbnRybyA9IGxvY2FsaXplKCdzaG9ydGN1dEhpbnRJbnRybycsIFwiVXNlIHRoZSBmbG9hdGluZyBjYXB0dXJlIGJhciwgb3IgcHJlc3NcIik7XG5cdFx0XHRoaW50LmFwcGVuZENoaWxkKHRhcmdldERvY3VtZW50LmNyZWF0ZVRleHROb2RlKGAke2ludHJvfSBgKSk7XG5cdFx0XHRpZiAoY2FwdHVyZVNob3J0Y3V0KSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyU2hvcnRjdXRLZXljYXAoaGludCwgY2FwdHVyZVNob3J0Y3V0KTtcblx0XHRcdFx0aGludC5hcHBlbmRDaGlsZCh0YXJnZXREb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShgICR7bG9jYWxpemUoJ3RvQ2FwdHVyZScsIFwidG8gY2FwdHVyZSBhIHNjcmVlbnNob3RcIil9YCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNhcHR1cmVTaG9ydGN1dCAmJiByZWNvcmRTaG9ydGN1dCkge1xuXHRcdFx0XHRoaW50LmFwcGVuZENoaWxkKHRhcmdldERvY3VtZW50LmNyZWF0ZVRleHROb2RlKGAgJHtsb2NhbGl6ZSgnb3InLCBcIm9yXCIpfSBgKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVjb3JkU2hvcnRjdXQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJTaG9ydGN1dEtleWNhcChoaW50LCByZWNvcmRTaG9ydGN1dCk7XG5cdFx0XHRcdGhpbnQuYXBwZW5kQ2hpbGQodGFyZ2V0RG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoYCAke2xvY2FsaXplKCd0b1JlY29yZCcsIFwidG8gc3RhcnQgb3Igc3RvcCByZWNvcmRpbmdcIil9YCkpO1xuXHRcdFx0fVxuXHRcdFx0aGludC5hcHBlbmRDaGlsZCh0YXJnZXREb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnLicpKTtcblx0XHR9XG5cblx0XHR0aGlzLnNjcmVlbnNob3RDb250YWluZXIgPSBhcHBlbmQocGFnZSwgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90cycpKTtcblx0XHR0aGlzLnVwZGF0ZVNjcmVlbnNob3RUaHVtYm5haWxzKCk7XG5cblx0XHR0aGlzLmNyZWF0ZUZsb2F0aW5nQ2FwdHVyZUJhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYXB0dXJlU3RyaXBDYXB0dXJlQnRuOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2FwdHVyZVN0cmlwRGVsYXlCdG46IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYXB0dXJlU3RyaXBSZWNvcmRCdG46IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNyZWF0ZUZsb2F0aW5nQ2FwdHVyZUJhcigpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpO1xuXHRcdC8vIE1vdW50IGluc2lkZSAubW9uYWNvLXdvcmtiZW5jaCBzbyBWUyBDb2RlJ3MgY29sb3IgdGhlbWUgQ1NTIHZhcnNcblx0XHQvLyAoLS12c2NvZGUtZGVidWdUb29sQmFyLWJhY2tncm91bmQsIGV0Yy4pIGNhc2NhZGUgYW5kIHRoZSBiYXIgbWF0Y2hlcyB0aGVcblx0XHQvLyBhY3RpdmUgdGhlbWUuIGJvZHkgaXMgb3V0c2lkZSB0aGF0IHNjb3BlIGFuZCB0aGUgdmFycyB3b3VsZG4ndCByZXNvbHZlLlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHdvcmtiZW5jaCA9IHRhcmdldFdpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXdvcmtiZW5jaCcpIGFzIEhUTUxFbGVtZW50IHwgbnVsbDtcblx0XHRjb25zdCBtb3VudFRhcmdldCA9IHdvcmtiZW5jaCA/PyB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuYm9keTtcblxuXHRcdHRoaXMuZmxvYXRpbmdCYXIgPSAkKCdkaXYuaXNzdWUtcmVwb3J0ZXItZmxvYXRpbmctYmFyJyk7XG5cblx0XHQvLyBEcmFnIGhhbmRsZVxuXHRcdGNvbnN0IGRyYWdBcmVhID0gYXBwZW5kKHRoaXMuZmxvYXRpbmdCYXIsICQoJ2Rpdi53aXphcmQtZmxvYXRpbmctZHJhZycpKTtcblx0XHRkcmFnQXJlYS5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uZ3JpcHBlcikpO1xuXG5cdFx0Ly8gU2VnbWVudGVkIHNjcmVlbnNob3QgYnV0dG9uOiBbU2NyZWVuc2hvdCB8IG9wdGlvbnNdXG5cdFx0Y29uc3Qgc2VnbWVudGVkID0gYXBwZW5kKHRoaXMuZmxvYXRpbmdCYXIsICQoJ2Rpdi53aXphcmQtc2VnbWVudGVkLWJ0bicpKTtcblx0XHRjb25zdCBmbG9hdGluZ0J1dHRvblN0eWxlcyA9IHRoaXMuZ2V0RmxvYXRpbmdCYXJCdXR0b25TdHlsZXModGFyZ2V0V2luZG93KTtcblxuXHRcdGNvbnN0IGNhcHR1cmVCdG4gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHNlZ21lbnRlZCwgeyAuLi5mbG9hdGluZ0J1dHRvblN0eWxlcywgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRjYXB0dXJlQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLXNlZ21lbnRlZC1tYWluJyk7XG5cdFx0Y2FwdHVyZUJ0bi5sYWJlbCA9IGAkKGRldmljZS1jYW1lcmEpICR7bG9jYWxpemUoJ3NjcmVlbnNob3QnLCBcIlNjcmVlbnNob3RcIil9YDtcblx0XHR0aGlzLmNhcHR1cmVTdHJpcENhcHR1cmVCdG4gPSBjYXB0dXJlQnRuO1xuXG5cdFx0Ly8gRGVsYXkvb3B0aW9ucyBkcm9wZG93biB1c2luZyBWUyBDb2RlJ3MgY29udGV4dCBtZW51XG5cdFx0Y29uc3QgZGVsYXlPcHRpb25zID0gdGhpcy5nZXRTY3JlZW5zaG90RGVsYXlPcHRpb25zKCk7XG5cdFx0Y29uc3QgZGVsYXlEcm9wZG93bkJ1dHRvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oc2VnbWVudGVkLCB7IC4uLmZsb2F0aW5nQnV0dG9uU3R5bGVzLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdGRlbGF5RHJvcGRvd25CdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtc2VnbWVudGVkLWRyb3Bkb3duJyk7XG5cdFx0ZGVsYXlEcm9wZG93bkJ1dHRvbi5lbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ2NhcHR1cmVPcHRpb25zJywgXCJDYXB0dXJlIG9wdGlvbnNcIik7XG5cdFx0ZGVsYXlEcm9wZG93bkJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjYXB0dXJlT3B0aW9ucycsIFwiQ2FwdHVyZSBvcHRpb25zXCIpKTtcblx0XHRkZWxheURyb3Bkb3duQnV0dG9uLmxhYmVsID0gJyQoY2hldnJvbi1kb3duKSc7XG5cdFx0dGhpcy5jYXB0dXJlU3RyaXBEZWxheUJ0biA9IGRlbGF5RHJvcGRvd25CdXR0b247XG5cblx0XHRpZiAodGhpcy5jb250ZXh0TWVudVByb3ZpZGVyKSB7XG5cdFx0XHRsZXQgbWVudU9wZW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRlbGF5RHJvcGRvd25CdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdGlmICghZGVsYXlEcm9wZG93bkJ1dHRvbi5lbmFibGVkIHx8IG1lbnVPcGVuKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhpZGUtdG9vbGJhci1pbi1zY3JlZW5zaG90cyB0b2dnbGUgKGZpcnN0KVxuXHRcdFx0XHRjb25zdCBoaWRlQWN0aW9uID0gbmV3IEFjdGlvbihcblx0XHRcdFx0XHQnaGlkZS10b29sYmFyJyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnaGlkZVRvb2xiYXJJblNjcmVlbnNob3RzJywgXCJIaWRlIFRvb2xiYXIgaW4gU2NyZWVuc2hvdHNcIiksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5faGlkZVRvb2xiYXJJblNjcmVlbnNob3RzID0gIXRoaXMuX2hpZGVUb29sYmFySW5TY3JlZW5zaG90cztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHRcdGhpZGVBY3Rpb24uY2hlY2tlZCA9IHRoaXMuX2hpZGVUb29sYmFySW5TY3JlZW5zaG90cztcblxuXHRcdFx0XHRjb25zdCBhY3Rpb25zID0gZGVsYXlPcHRpb25zLm1hcChvcHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0XHRgZGVsYXktJHtvcHQudmFsdWV9YCxcblx0XHRcdFx0XHRcdG9wdC5sYWJlbCxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7IHRoaXMuc2NyZWVuc2hvdERlbGF5ID0gb3B0LnZhbHVlOyB9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRhY3Rpb24uY2hlY2tlZCA9IG9wdC52YWx1ZSA9PT0gdGhpcy5zY3JlZW5zaG90RGVsYXk7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGlvbjtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgYWxsQWN0aW9ucyA9IFtoaWRlQWN0aW9uLCBuZXcgU2VwYXJhdG9yKCksIC4uLmFjdGlvbnNdO1xuXHRcdFx0XHRtZW51T3BlbiA9IHRydWU7XG5cdFx0XHRcdHRoaXMuY29udGV4dE1lbnVQcm92aWRlciEuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuZmxvYXRpbmdCYXIhLFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFsbEFjdGlvbnMsXG5cdFx0XHRcdFx0c2tpcFRlbGVtZXRyeTogdHJ1ZSxcblx0XHRcdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0XHRcdG1lbnVPcGVuID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRoaWRlQWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYSBvZiBhY3Rpb25zKSB7IGEuZGlzcG9zZSgpOyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIENsb3NlIHRoZSBkZWxheSBtZW51IHdoZW4gZHJhZyBzdGFydHMuXG5cdFx0XHQvLyBUaGUgZHJhZyBoYW5kbGVyIGNhbGxzIGUucHJldmVudERlZmF1bHQoKSBvbiBwb2ludGVyZG93biB3aGljaFxuXHRcdFx0Ly8gc3VwcHJlc3NlcyB0aGUgbW91c2Vkb3duIGV2ZW50IHRoYXQgdGhlIGNvbnRleHQgbWVudSB1c2VzIGZvclxuXHRcdFx0Ly8gb3V0c2lkZS1jbGljayBkZXRlY3Rpb24sIHNvIHdlIGRpc3BhdGNoIGEgc3ludGhldGljIG9uZS5cblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkcmFnQXJlYSwgRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgKCkgPT4ge1xuXHRcdFx0XHRkcmFnQXJlYS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGNhcHR1cmVCdG4ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5nZXRUb3RhbEF0dGFjaG1lbnRzKCkgPj0gTUFYX0FUVEFDSE1FTlRTIHx8ICFjYXB0dXJlQnRuLmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc2NyZWVuc2hvdERlbGF5ID4gMCkge1xuXHRcdFx0XHQvLyBMb2NrIHdpZHRoIHNvIGJ1dHRvbiBkb2Vzbid0IHNocmluayBkdXJpbmcgY291bnRkb3duXG5cdFx0XHRcdGNhcHR1cmVCdG4uZWxlbWVudC5zdHlsZS5taW5XaWR0aCA9IGAke2NhcHR1cmVCdG4uZWxlbWVudC5vZmZzZXRXaWR0aH1weGA7XG5cdFx0XHRcdGNhcHR1cmVCdG4uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLmRlbGF5ZWRTY3JlZW5zaG90UGVuZGluZyA9IHRydWU7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2NyZWVuc2hvdFRodW1ibmFpbHMoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVBdHRhY2htZW50QnV0dG9ucygpO1xuXHRcdFx0XHRsZXQgcmVtYWluaW5nID0gdGhpcy5zY3JlZW5zaG90RGVsYXk7XG5cdFx0XHRcdGNhcHR1cmVCdG4ubGFiZWwgPSBgJHtyZW1haW5pbmd9Li4uYDtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKTtcblx0XHRcdFx0Y29uc3QgaW50ZXJ2YWxEaXNwb3NhYmxlID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKHRhcmdldFdpbmRvdywgKCkgPT4ge1xuXHRcdFx0XHRcdHJlbWFpbmluZy0tO1xuXHRcdFx0XHRcdGlmIChyZW1haW5pbmcgPiAwKSB7XG5cdFx0XHRcdFx0XHRjYXB0dXJlQnRuLmxhYmVsID0gYCR7cmVtYWluaW5nfS4uLmA7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuZGVsZXRlKGludGVydmFsRGlzcG9zYWJsZSk7XG5cdFx0XHRcdFx0XHRjYXB0dXJlQnRuLmxhYmVsID0gYCQoZGV2aWNlLWNhbWVyYSkgJHtsb2NhbGl6ZSgnc2NyZWVuc2hvdCcsIFwiU2NyZWVuc2hvdFwiKX1gO1xuXHRcdFx0XHRcdFx0Y2FwdHVyZUJ0bi5lbGVtZW50LnN0eWxlLm1pbldpZHRoID0gJyc7XG5cdFx0XHRcdFx0XHRjYXB0dXJlQnRuLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5kZWxheWVkU2NyZWVuc2hvdFBlbmRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2NyZWVuc2hvdFRodW1ibmFpbHMoKTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlQXR0YWNobWVudEJ1dHRvbnMoKTtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdFNjcmVlbnNob3QuZmlyZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMTAwMCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0U2NyZWVuc2hvdC5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVjb3JkIGJ1dHRvblxuXHRcdGlmICh0aGlzLnJlY29yZGluZ1N1cHBvcnRlZCkge1xuXHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRoaXMuZmxvYXRpbmdCYXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4ubGFiZWwgPSBgJChyZWNvcmQpICR7bG9jYWxpemUoJ3JlY29yZFZpZGVvJywgXCJSZWNvcmQgdmlkZW9cIil9YDtcblx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLXJlY29yZC1idG4nKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLlJlY29yZGluZykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdFN0b3BSZWNvcmRpbmcuZmlyZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY3VycmVudFJlY29yZGluZ1N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5JZGxlICYmIHRoaXMuZ2V0VG90YWxBdHRhY2htZW50cygpIDwgTUFYX0FUVEFDSE1FTlRTKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0U3RhcnRSZWNvcmRpbmcuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0bW91bnRUYXJnZXQuYXBwZW5kQ2hpbGQodGhpcy5mbG9hdGluZ0Jhcik7XG5cblx0XHQvLyBEcmFnZ2luZyAoY2xhbXBlZCB0byB3aW5kb3cgYm91bmRzKVxuXHRcdGxldCBkcmFnU3RhcnRYID0gMDtcblx0XHRsZXQgZHJhZ1N0YXJ0WSA9IDA7XG5cdFx0bGV0IGJhclN0YXJ0WCA9IDA7XG5cdFx0bGV0IGJhclN0YXJ0WSA9IDA7XG5cblx0XHRjb25zdCBvblBvaW50ZXJNb3ZlID0gKGU6IFBvaW50ZXJFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZHggPSBlLmNsaWVudFggLSBkcmFnU3RhcnRYO1xuXHRcdFx0Y29uc3QgZHkgPSBlLmNsaWVudFkgLSBkcmFnU3RhcnRZO1xuXHRcdFx0Y29uc3QgYmFyVyA9IHRoaXMuZmxvYXRpbmdCYXIhLm9mZnNldFdpZHRoO1xuXHRcdFx0Y29uc3QgYmFySCA9IHRoaXMuZmxvYXRpbmdCYXIhLm9mZnNldEhlaWdodDtcblx0XHRcdGNvbnN0IG1heFggPSB0YXJnZXRXaW5kb3cuaW5uZXJXaWR0aCAtIGJhclc7XG5cdFx0XHRjb25zdCBtYXhZID0gdGFyZ2V0V2luZG93LmlubmVySGVpZ2h0IC0gYmFySDtcblx0XHRcdGNvbnN0IG5ld1ggPSBNYXRoLm1heCgwLCBNYXRoLm1pbihiYXJTdGFydFggKyBkeCwgbWF4WCkpO1xuXHRcdFx0Y29uc3QgbmV3WSA9IE1hdGgubWF4KDAsIE1hdGgubWluKGJhclN0YXJ0WSArIGR5LCBtYXhZKSk7XG5cdFx0XHR0aGlzLmZsb2F0aW5nQmFyIS5zdHlsZS5sZWZ0ID0gYCR7bmV3WH1weGA7XG5cdFx0XHR0aGlzLmZsb2F0aW5nQmFyIS5zdHlsZS50b3AgPSBgJHtuZXdZfXB4YDtcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIhLnN0eWxlLnJpZ2h0ID0gJ2F1dG8nO1xuXHRcdH07XG5cblx0XHRjb25zdCBvblBvaW50ZXJVcCA9ICgpID0+IHtcblx0XHRcdGRyYWdBcmVhLmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWdnZWQnKTtcblx0XHRcdHRhcmdldFdpbmRvdy5kb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdwb2ludGVybW92ZScsIG9uUG9pbnRlck1vdmUpO1xuXHRcdFx0dGFyZ2V0V2luZG93LmRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsIG9uUG9pbnRlclVwKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRyYWdBcmVhLCBFdmVudFR5cGUuUE9JTlRFUl9ET1dOLCAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRkcmFnQXJlYS5jbGFzc0xpc3QuYWRkKCdkcmFnZ2VkJyk7XG5cdFx0XHRkcmFnU3RhcnRYID0gZS5jbGllbnRYO1xuXHRcdFx0ZHJhZ1N0YXJ0WSA9IGUuY2xpZW50WTtcblx0XHRcdGNvbnN0IHJlY3QgPSB0aGlzLmZsb2F0aW5nQmFyIS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGJhclN0YXJ0WCA9IHJlY3QubGVmdDtcblx0XHRcdGJhclN0YXJ0WSA9IHJlY3QudG9wO1xuXHRcdFx0dGFyZ2V0V2luZG93LmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJtb3ZlJywgb25Qb2ludGVyTW92ZSk7XG5cdFx0XHR0YXJnZXRXaW5kb3cuZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgb25Qb2ludGVyVXApO1xuXHRcdH0pKTtcblxuXHRcdC8vIEtlZXAgdGhlIGJhciBmdWxseSB3aXRoaW4gdGhlIHZpc2libGUgdmlld3BvcnQgd2hlbiB0aGUgd2luZG93IGlzXG5cdFx0Ly8gcmVzaXplZC4gV2l0aG91dCB0aGlzLCBuYXJyb3dpbmcgdGhlIHdpbmRvdyBjYW4gY2xpcCB0aGUgYmFyIG9mZiB0aGVcblx0XHQvLyByaWdodCBlZGdlIFx1MjAxNCBzZWUgc2NyZWVuc2hvdCBpbiBpc3N1ZS4gVGhlIGJhciBzdGF5cyBpbiBpdHMgY3VycmVudFxuXHRcdC8vIHJlbGF0aXZlIHBvc2l0aW9uOyB3ZSBvbmx5IG51ZGdlIGl0IGlud2FyZCB3aGVuIGl0IHdvdWxkIG90aGVyd2lzZVxuXHRcdC8vIGZhbGwgb2ZmLXNjcmVlbi5cblx0XHRjb25zdCBjbGFtcEludG9WaWV3ID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmZsb2F0aW5nQmFyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlY3QgPSB0aGlzLmZsb2F0aW5nQmFyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0Y29uc3Qgd2luVyA9IHRhcmdldFdpbmRvdy5pbm5lcldpZHRoO1xuXHRcdFx0Y29uc3Qgd2luSCA9IHRhcmdldFdpbmRvdy5pbm5lckhlaWdodDtcblx0XHRcdGNvbnN0IG1hcmdpbiA9IDg7XG5cdFx0XHRsZXQgbmVlZHNDbGFtcCA9IGZhbHNlO1xuXHRcdFx0bGV0IG5leHRMZWZ0ID0gcmVjdC5sZWZ0O1xuXHRcdFx0bGV0IG5leHRUb3AgPSByZWN0LnRvcDtcblx0XHRcdGlmIChyZWN0LnJpZ2h0ID4gd2luVyAtIG1hcmdpbikge1xuXHRcdFx0XHRuZXh0TGVmdCA9IE1hdGgubWF4KG1hcmdpbiwgd2luVyAtIG1hcmdpbiAtIHJlY3Qud2lkdGgpO1xuXHRcdFx0XHRuZWVkc0NsYW1wID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWN0LmxlZnQgPCBtYXJnaW4pIHtcblx0XHRcdFx0bmV4dExlZnQgPSBtYXJnaW47XG5cdFx0XHRcdG5lZWRzQ2xhbXAgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY3QuYm90dG9tID4gd2luSCAtIG1hcmdpbikge1xuXHRcdFx0XHRuZXh0VG9wID0gTWF0aC5tYXgobWFyZ2luLCB3aW5IIC0gbWFyZ2luIC0gcmVjdC5oZWlnaHQpO1xuXHRcdFx0XHRuZWVkc0NsYW1wID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWN0LnRvcCA8IG1hcmdpbikge1xuXHRcdFx0XHRuZXh0VG9wID0gbWFyZ2luO1xuXHRcdFx0XHRuZWVkc0NsYW1wID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChuZWVkc0NsYW1wKSB7XG5cdFx0XHRcdHRoaXMuZmxvYXRpbmdCYXIuc3R5bGUubGVmdCA9IGAke25leHRMZWZ0fXB4YDtcblx0XHRcdFx0dGhpcy5mbG9hdGluZ0Jhci5zdHlsZS50b3AgPSBgJHtuZXh0VG9wfXB4YDtcblx0XHRcdFx0dGhpcy5mbG9hdGluZ0Jhci5zdHlsZS5yaWdodCA9ICdhdXRvJztcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3csICdyZXNpemUnLCBjbGFtcEludG9WaWV3KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5mbG9hdGluZ0Jhcj8ucmVtb3ZlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDYXB0dXJlU3RyaXBWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5mbG9hdGluZ0Jhcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTaG93IG9uIGFsbCBzdGVwcyBzbyB0aGUgdXNlciBjYW4gY2FwdHVyZSBzY3JlZW5zaG90cyBvZiB0aGUgd2l6YXJkIGl0c2VsZlxuXHRcdHRoaXMuZmxvYXRpbmdCYXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHR9XG5cblx0Ly8gU3RlcCAxOiBEZXNjcmliZSAoY2F0ZWdvcnkgKyBkZXNjcmlwdGlvbiArIHRpdGxlKVxuXHRwcml2YXRlIGNyZWF0ZVN0ZXAxRGVzY3JpYmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFnZSA9IGFwcGVuZCh0aGlzLnN0ZXBDb250YWluZXIsICQoJ2Rpdi53aXphcmQtc3RlcCcpKTtcblx0XHR0aGlzLnN0ZXBQYWdlcy5wdXNoKHBhZ2UpO1xuXG5cdFx0Y29uc3QgaGVhZGluZyA9IGFwcGVuZChwYWdlLCAkKCdoMi53aXphcmQtaGVhZGluZycpKTtcblx0XHRoZWFkaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Rlc2NyaWJlSGVhZGluZycsIFwiRGVzY3JpYmUgeW91ciBmZWVkYmFja1wiKTtcblxuXHRcdC8vIElzc3VlIGd1aWRhbmNlIGxpbmsgXHUyMDE0IGtlZXAgdGhlIHNhbWUgd29yZGluZyBhcyB0aGUgY2xhc3NpYyByZXBvcnRlci5cblx0XHRpZiAodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZSkge1xuXHRcdFx0Y29uc3QgZ3VpZGFuY2VDb250YWluZXIgPSBhcHBlbmQocGFnZSwgJCgnZGl2LndpemFyZC1pc3N1ZS1ndWlkYW5jZScpKTtcblx0XHRcdGNvbnN0IGd1aWRhbmNlTWQgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRrZXk6ICdyZXZpZXdHdWlkYW5jZUxhYmVsV2l6YXJkJyxcblx0XHRcdFx0XHRjb21tZW50OiBbJ3tMb2NrZWQ9XCJodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS93aWtpL1N1Ym1pdHRpbmctQnVncy1hbmQtU3VnZ2VzdGlvbnNcIn0nXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnQmVmb3JlIHlvdSByZXBvcnQgYW4gaXNzdWUgaGVyZSBwbGVhc2UgW3JldmlldyB0aGUgZ3VpZGFuY2Ugd2UgcHJvdmlkZV0oaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvd2lraS9TdWJtaXR0aW5nLUJ1Z3MtYW5kLVN1Z2dlc3Rpb25zKS4gUGxlYXNlIGNvbXBsZXRlIHRoZSBmb3JtIGluIEVuZ2xpc2guJ1xuXHRcdFx0KSwgeyBpc1RydXN0ZWQ6IHRydWUgfSk7XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGd1aWRhbmNlTWQsIHtcblx0XHRcdFx0YWN0aW9uSGFuZGxlcjogYXN5bmMgKGxpbms6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMub3BlbkV4dGVybmFsTGluaz8uKGxpbmspO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRndWlkYW5jZUNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkKTtcblx0XHR9XG5cblx0XHQvLyBJc3N1ZSBzb3VyY2Ugc2VsZWN0aW9uICsgZXh0ZW5zaW9uIGRyb3Bkb3duIHNoYXJlIGEgcm93IHdoZW4gYm90aCBhcmUgdmlzaWJsZVxuXHRcdGNvbnN0IHRhcmdldFJvdyA9IGFwcGVuZChwYWdlLCAkKCdkaXYud2l6YXJkLXRhcmdldC1yb3cnKSk7XG5cdFx0Y29uc3Qgc291cmNlRmllbGQgPSBhcHBlbmQodGFyZ2V0Um93LCAkKCdkaXYud2l6YXJkLWZpZWxkLndpemFyZC1zb3VyY2UtZmllbGQnKSk7XG5cdFx0Y29uc3Qgc291cmNlTGFiZWwgPSBhcHBlbmQoc291cmNlRmllbGQsICQoJ2xhYmVsLndpemFyZC1maWVsZC1sYWJlbCcpKTtcblx0XHRzb3VyY2VMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0YXJnZXQnLCBcIlRhcmdldFwiKTtcblx0XHR0aGlzLmFwcGVuZFJlcXVpcmVkTWFya2VyKHNvdXJjZUxhYmVsKTtcblx0XHR0aGlzLnNvdXJjZUJ1dHRvbkdyb3VwID0gYXBwZW5kKHNvdXJjZUZpZWxkLCAkKCdkaXYud2l6YXJkLXR5cGUtYnV0dG9ucy53aXphcmQtc291cmNlLWJ1dHRvbnMnKSk7XG5cdFx0Ly8gQ3JlYXRlIGEgYnV0dG9uIGZvciBldmVyeSBzb3VyY2UgdXAgZnJvbnQgc28gYXN5bmMtbG9hZGVkIGV4dGVuc2lvbnMgY2FuXG5cdFx0Ly8gcmV2ZWFsIHRoZSBFeHRlbnNpb24gdGFyZ2V0IGxhdGVyOyB1cGRhdGVJc3N1ZVNvdXJjZUJ1dHRvbnMoKSBjb250cm9sc1xuXHRcdC8vIHdoaWNoIGJ1dHRvbnMgYXJlIHZpc2libGUuXG5cdFx0Zm9yIChjb25zdCBvcHRpb24gb2YgdGhpcy5nZXRBbGxTb3VyY2VPcHRpb25zKCkpIHtcblx0XHRcdGNvbnN0IGJ0biA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGhpcy5zb3VyY2VCdXR0b25Hcm91cCwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdFx0YnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLXR5cGUtYnRuJywgJ3dpemFyZC1zb3VyY2UtYnRuJyk7XG5cdFx0XHRidG4uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtc291cmNlJywgb3B0aW9uLnZhbHVlKTtcblx0XHRcdGJ0bi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgJ2ZhbHNlJyk7XG5cdFx0XHRidG4ubGFiZWwgPSBvcHRpb24ubGFiZWw7XG5cdFx0XHR0aGlzLmlzc3VlU291cmNlQnV0dG9ucy5wdXNoKGJ0bik7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChidG4ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2V0SXNzdWVTb3VyY2Uob3B0aW9uLnZhbHVlKTtcblx0XHRcdFx0aWYgKG9wdGlvbi52YWx1ZSA9PT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uICYmIHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24pIHtcblx0XHRcdFx0XHR2b2lkIHRoaXMudXBkYXRlU2VsZWN0ZWRFeHRlbnNpb24odGhpcy5zZWxlY3RlZEV4dGVuc2lvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy5zb3VyY2VFcnJvciA9IHRoaXMuY3JlYXRlRmllbGRFcnJvcihzb3VyY2VGaWVsZCwgbG9jYWxpemUoJ3RhcmdldFJlcXVpcmVkJywgXCJTZWxlY3QgYSB0YXJnZXQgdG8gY29udGludWUuXCIpKTtcblx0XHR0aGlzLnRhcmdldFN0YXR1cyA9IGFwcGVuZChzb3VyY2VGaWVsZCwgJCgnZGl2LndpemFyZC10YXJnZXQtc3RhdHVzJykpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25GaWVsZCA9IGFwcGVuZCh0YXJnZXRSb3csICQoJ2Rpdi53aXphcmQtZmllbGQud2l6YXJkLWV4dGVuc2lvbi1maWVsZCcpKTtcblx0XHRjb25zdCBleHRlbnNpb25MYWJlbCA9IGFwcGVuZCh0aGlzLmV4dGVuc2lvbkZpZWxkLCAkKCdsYWJlbC53aXphcmQtZmllbGQtbGFiZWwnKSk7XG5cdFx0ZXh0ZW5zaW9uTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uJywgXCJFeHRlbnNpb25cIik7XG5cdFx0dGhpcy5hcHBlbmRSZXF1aXJlZE1hcmtlcihleHRlbnNpb25MYWJlbCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VsZWN0Q29udGFpbmVyID0gYXBwZW5kKHRoaXMuZXh0ZW5zaW9uRmllbGQsICQoJ2Rpdi53aXphcmQtZXh0ZW5zaW9uLXNlbGVjdCcpKTtcblx0XHR0aGlzLmV4dGVuc2lvbk9wdGlvbnMgPSB0aGlzLmdldEV4dGVuc2lvbk9wdGlvbnMoKTtcblx0XHR0aGlzLmV4dGVuc2lvblNlbGVjdCA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBTZWxlY3RCb3goXG5cdFx0XHR0aGlzLmdldEV4dGVuc2lvblNlbGVjdEl0ZW1zKCksXG5cdFx0XHR0aGlzLmdldFNlbGVjdGVkRXh0ZW5zaW9uSW5kZXgoKSxcblx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0ZGVmYXVsdFNlbGVjdEJveFN0eWxlcyxcblx0XHRcdHsgYXJpYUxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uJywgXCJFeHRlbnNpb25cIiksIHVzZUN1c3RvbURyYXduOiB0cnVlLCBvcHRpb25zQXNDaGlsZHJlbjogdHJ1ZSB9XG5cdFx0KSk7XG5cdFx0dGhpcy5leHRlbnNpb25TZWxlY3QucmVuZGVyKGV4dGVuc2lvblNlbGVjdENvbnRhaW5lcik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25TZWxlY3Qub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMudXBkYXRlU2VsZWN0ZWRFeHRlbnNpb24odGhpcy5leHRlbnNpb25PcHRpb25zW2UuaW5kZXhdPy52YWx1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uRXJyb3IgPSB0aGlzLmNyZWF0ZUZpZWxkRXJyb3IodGhpcy5leHRlbnNpb25GaWVsZCwgbG9jYWxpemUoJ2V4dGVuc2lvblJlcXVpcmVkJywgXCJTZWxlY3QgYW4gZXh0ZW5zaW9uIHRvIGNvbnRpbnVlLlwiKSk7XG5cdFx0dGhpcy5leHRlbnNpb25TdGF0dXMgPSBhcHBlbmQodGhpcy5leHRlbnNpb25GaWVsZCwgJCgnZGl2LndpemFyZC1leHRlbnNpb24tc3RhdHVzJykpO1xuXHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uT3B0aW9ucygpO1xuXHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uRmllbGRWaXNpYmlsaXR5KCk7XG5cblx0XHQvLyBEZWZhdWx0IHRoZSB0YXJnZXQgdG8gdGhlIG1vc3QgbGlrZWx5IG9wdGlvbiB3aGVuIHRoZSByZXBvcnRlciBvcGVucy5cblx0XHQvLyBJbiB0aGUgQWdlbnRzIFdpbmRvdyB3ZSBwcmVzZWxlY3QgQWdlbnRzIFdpbmRvdzsgb3RoZXJ3aXNlIGRlZmF1bHQgdG9cblx0XHQvLyBWUyBDb2RlICh0aGUgbW9zdCBjb21tb24gdGFyZ2V0KS4gRXh0ZW5zaW9uIGlzIHByZXNlbGVjdGVkIG9ubHkgd2hlbiBhblxuXHRcdC8vIGV4dGVuc2lvbiBpZCB3YXMgYWxyZWFkeSBwcm92aWRlZC4gVGhlIHVzZXIgY2FuIGFsd2F5cyBvdmVycmlkZS5cblx0XHRpZiAoIXRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSkge1xuXHRcdFx0aWYgKHRoaXMuZGF0YS5leHRlbnNpb25JZCkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPSBJc3N1ZVNvdXJjZS5FeHRlbnNpb247XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGF0YS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9IElzc3VlU291cmNlLkFnZW50c1dpbmRvdztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9IElzc3VlU291cmNlLlZTQ29kZTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlSXNzdWVTb3VyY2VGbGFncygpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlQnV0dG9ucygpO1xuXG5cdFx0Ly8gQ2F0ZWdvcnkgc2VsZWN0aW9uXG5cdFx0Y29uc3QgY2F0TGFiZWwgPSBhcHBlbmQocGFnZSwgJCgnbGFiZWwud2l6YXJkLWZpZWxkLWxhYmVsJykpO1xuXHRcdGNhdExhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2ZlZWRiYWNrQ2F0ZWdvcnknLCBcIkNhdGVnb3J5XCIpO1xuXHRcdHRoaXMuYXBwZW5kUmVxdWlyZWRNYXJrZXIoY2F0TGFiZWwpO1xuXG5cdFx0dGhpcy50eXBlQnV0dG9uR3JvdXAgPSBhcHBlbmQocGFnZSwgJCgnZGl2LndpemFyZC10eXBlLWJ1dHRvbnMnKSk7XG5cblx0XHRjb25zdCBzZWxlY3RUeXBlID0gKHR5cGU6IElzc3VlVHlwZSkgPT4ge1xuXHRcdFx0dGhpcy5zZWxlY3RlZElzc3VlVHlwZSA9IHR5cGU7XG5cdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7IGlzc3VlVHlwZTogdHlwZSB9KTtcblx0XHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLnR5cGVCdXR0b25Hcm91cCwgdGhpcy50eXBlRXJyb3IsIGZhbHNlKTtcblx0XHRcdGZvciAoY29uc3QgYiBvZiB0aGlzLmlzc3VlVHlwZUJ1dHRvbnMpIHtcblx0XHRcdFx0Y29uc3QgaXNTZWxlY3RlZCA9IGIuZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdHlwZScpID09PSBTdHJpbmcodHlwZSk7XG5cdFx0XHRcdGIuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzZWxlY3RlZCcsIGlzU2VsZWN0ZWQpO1xuXHRcdFx0XHRiLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcoaXNTZWxlY3RlZCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVEZXNjcmlwdGlvbkd1aWRhbmNlKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlQnV0dG9ucygpO1xuXHRcdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlUmV2aWV3RGV0YWlscygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZWFyY2hTaW1pbGFySXNzdWVzKCk7XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgeyB0eXBlLCBsYWJlbCwgaWNvbiB9IG9mIHRoaXMuZ2V0SXNzdWVUeXBlT3B0aW9ucygpKSB7XG5cdFx0XHRjb25zdCBidG4gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHRoaXMudHlwZUJ1dHRvbkdyb3VwLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRcdGJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dpemFyZC10eXBlLWJ0bicpO1xuXHRcdFx0YnRuLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLXR5cGUnLCBTdHJpbmcodHlwZSkpO1xuXHRcdFx0YnRuLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCAnZmFsc2UnKTtcblx0XHRcdGJ0bi5sYWJlbCA9IGAkKCR7aWNvbi5pZH0pICR7bGFiZWx9YDtcblx0XHRcdHRoaXMuaXNzdWVUeXBlQnV0dG9ucy5wdXNoKGJ0bik7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChidG4ub25EaWRDbGljaygoKSA9PiBzZWxlY3RUeXBlKHR5cGUpKSk7XG5cdFx0fVxuXHRcdHRoaXMudHlwZUVycm9yID0gdGhpcy5jcmVhdGVGaWVsZEVycm9yKHBhZ2UsIGxvY2FsaXplKCdjYXRlZ29yeVJlcXVpcmVkJywgXCJTZWxlY3QgYSBjYXRlZ29yeSB0byBjb250aW51ZS5cIikpO1xuXG5cdFx0Ly8gVGl0bGUgZmllbGQgd2l0aCBBSSBnZW5lcmF0ZSBidXR0b24gbmV4dCB0byBsYWJlbFxuXHRcdGNvbnN0IHRpdGxlR3JvdXAgPSBhcHBlbmQocGFnZSwgJCgnZGl2LndpemFyZC1maWVsZC53aXphcmQtdGl0bGUtZmllbGQnKSk7XG5cdFx0Y29uc3QgdGl0bGVMYWJlbFJvdyA9IGFwcGVuZCh0aXRsZUdyb3VwLCAkKCdkaXYud2l6YXJkLXRpdGxlLWxhYmVsLXJvdycpKTtcblx0XHRjb25zdCB0aXRsZUxhYmVsID0gYXBwZW5kKHRpdGxlTGFiZWxSb3csICQoJ2xhYmVsLndpemFyZC1maWVsZC1sYWJlbCcpKTtcblx0XHR0aXRsZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2lzc3VlVGl0bGUnLCBcIlRpdGxlXCIpO1xuXHRcdHRoaXMuYXBwZW5kUmVxdWlyZWRNYXJrZXIodGl0bGVMYWJlbCk7XG5cblx0XHRjb25zdCBhaUJ0biA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGl0bGVMYWJlbFJvdywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0YWlCdG4ubGFiZWwgPSBgJChzcGFya2xlKSAke2xvY2FsaXplKCdnZW5lcmF0ZVRpdGxlQnRuJywgXCJHZW5lcmF0ZSBmcm9tIGRlc2NyaXB0aW9uXCIpfWA7XG5cdFx0YWlCdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtYWktdGl0bGUtYnRuJyk7XG5cdFx0YWlCdG4uZWxlbWVudC50aXRsZSA9IGxvY2FsaXplKCdnZW5lcmF0ZVRpdGxlJywgXCJHZW5lcmF0ZSB0aXRsZSBmcm9tIGRlc2NyaXB0aW9uXCIpO1xuXHRcdGFpQnRuLmVuYWJsZWQgPSAhIXRoaXMuZGF0YS5pc3N1ZUJvZHk/LnRyaW0oKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhaUJ0bi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGNvbnN0IGRlc2MgPSB0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUudHJpbSgpO1xuXHRcdFx0aWYgKGRlc2MgJiYgIWFpQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdsb2FkaW5nJykpIHtcblx0XHRcdFx0Ly8gTG9jayB3aWR0aCB0byBwcmV2ZW50IGxheW91dCBzaGlmdCBkdXJpbmcgbG9hZGluZ1xuXHRcdFx0XHRhaUJ0bi5lbGVtZW50LnN0eWxlLm1pbldpZHRoID0gYCR7YWlCdG4uZWxlbWVudC5vZmZzZXRXaWR0aH1weGA7XG5cdFx0XHRcdGFpQnRuLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0YWlCdG4ubGFiZWwgPSBgJChsb2FkaW5nfnNwaW4pICR7bG9jYWxpemUoJ2dlbmVyYXRpbmdUaXRsZScsIFwiR2VuZXJhdGluZy4uLlwiKX1gO1xuXHRcdFx0XHRhaUJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xvYWRpbmcnKTtcblx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0R2VuZXJhdGVUaXRsZS5maXJlKGRlc2MpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmdlbmVyYXRlVGl0bGVCdG4gPSBhaUJ0bjtcblxuXHRcdHRoaXMudGl0bGVJbnB1dCA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnB1dEJveCh0aXRsZUdyb3VwLCB1bmRlZmluZWQsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnaXNzdWVUaXRsZVBsYWNlaG9sZGVyJywgXCJCcmllZiBzdW1tYXJ5IG9mIHRoZSBpc3N1ZVwiKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0fSkpO1xuXHRcdHRoaXMudXBkYXRlVGl0bGVQbGFjZWhvbGRlcigpO1xuXHRcdGlmICh0aGlzLmRhdGEuaXNzdWVUaXRsZSkge1xuXHRcdFx0dGhpcy50aXRsZUlucHV0LnZhbHVlID0gdGhpcy5kYXRhLmlzc3VlVGl0bGU7XG5cdFx0fVxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudGl0bGVJbnB1dC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKSkge1xuXHRcdFx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy50aXRsZUlucHV0LmVsZW1lbnQsIHRoaXMudGl0bGVFcnJvciwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZWFyY2hTaW1pbGFySXNzdWVzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMudGl0bGVFcnJvciA9IHRoaXMuY3JlYXRlRmllbGRFcnJvcih0aXRsZUdyb3VwLCBsb2NhbGl6ZSgndGl0bGVSZXF1aXJlZCcsIFwiRW50ZXIgYSB0aXRsZSB0byBjb250aW51ZS5cIikpO1xuXG5cdFx0Ly8gRGVzY3JpcHRpb24gZmllbGQgd2l0aCBndWlkYW5jZSBhbmQgYXV0by1ncm93aW5nIHRleHRhcmVhXG5cdFx0Y29uc3QgZGVzY3JpcHRpb25Hcm91cCA9IGFwcGVuZChwYWdlLCAkKCdkaXYud2l6YXJkLWZpZWxkJykpO1xuXHRcdGNvbnN0IGRlc2NMYWJlbCA9IGFwcGVuZChkZXNjcmlwdGlvbkdyb3VwLCAkKCdsYWJlbC53aXphcmQtZmllbGQtbGFiZWwnKSk7XG5cdFx0ZGVzY0xhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Rlc2NyaXB0aW9uJywgXCJEZXNjcmlwdGlvblwiKTtcblx0XHR0aGlzLmFwcGVuZFJlcXVpcmVkTWFya2VyKGRlc2NMYWJlbCk7XG5cblx0XHR0aGlzLmRlc2NyaXB0aW9uR3VpZGFuY2UgPSBhcHBlbmQoZGVzY3JpcHRpb25Hcm91cCwgJCgncC53aXphcmQtc3VidGl0bGUud2l6YXJkLWRlc2NyaXB0aW9uLWd1aWRhbmNlJykpO1xuXHRcdHRoaXMudXBkYXRlRGVzY3JpcHRpb25HdWlkYW5jZSgpO1xuXG5cdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhID0gYXBwZW5kKGRlc2NyaXB0aW9uR3JvdXAsICQoJ3RleHRhcmVhLndpemFyZC10ZXh0YXJlYScpKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50O1xuXHRcdHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdkZXNjcmlwdGlvblBsYWNlaG9sZGVyJywgXCJEZXNjcmliZSB0aGUgaXNzdWUgaW4gZGV0YWlsLi4uXCIpO1xuXHRcdHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS5yb3dzID0gNjtcblx0XHRpZiAodGhpcy5kYXRhLmlzc3VlQm9keSkge1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlID0gdGhpcy5kYXRhLmlzc3VlQm9keTtcblx0XHR9XG5cdFx0Y29uc3QgYXV0b0dyb3dUZXh0YXJlYSA9ICgpID0+IHtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnMCc7XG5cdFx0XHRjb25zdCBuZXdIZWlnaHQgPSBNYXRoLm1heCh0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEuc2Nyb2xsSGVpZ2h0LCAxMjApO1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnN0eWxlLmhlaWdodCA9IGAke25ld0hlaWdodH1weGA7XG5cdFx0fTtcblx0XHRhdXRvR3Jvd1RleHRhcmVhKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYSwgRXZlbnRUeXBlLklOUFVULCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlLnRyaW0oKSkge1xuXHRcdFx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLCB0aGlzLmRlc2NyaXB0aW9uRXJyb3IsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdGF1dG9Hcm93VGV4dGFyZWEoKTtcblx0XHRcdHRoaXMuc2VhcmNoU2ltaWxhcklzc3VlcygpO1xuXHRcdFx0dGhpcy51cGRhdGVHZW5lcmF0ZVRpdGxlQnV0dG9uU3RhdGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbkVycm9yID0gdGhpcy5jcmVhdGVGaWVsZEVycm9yKGRlc2NyaXB0aW9uR3JvdXAsIGxvY2FsaXplKCdkZXNjcmlwdGlvblJlcXVpcmVkJywgXCJFbnRlciBhIGRlc2NyaXB0aW9uIHRvIGNvbnRpbnVlLlwiKSk7XG5cblx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlRmxhZ3MoKTtcblx0XHR0aGlzLnVwZGF0ZVRhcmdldFN0YXR1cygpO1xuXG5cdFx0Ly8gRGVmYXVsdCB0aGUgY2F0ZWdvcnkgdG8gQnVnIChtb3N0IGNvbW1vbikuIE11c3QgcnVuIGFmdGVyXG5cdFx0Ly8gZGVzY3JpcHRpb25HdWlkYW5jZSBpcyBpbml0aWFsaXplZCBiZWNhdXNlIHNlbGVjdFR5cGUgLT5cblx0XHQvLyB1cGRhdGVEZXNjcmlwdGlvbkd1aWRhbmNlIHRvdWNoZXMgaXQuXG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0c2VsZWN0VHlwZShJc3N1ZVR5cGUuQnVnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2VsZWN0VHlwZSh0aGlzLnNlbGVjdGVkSXNzdWVUeXBlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZFJlcXVpcmVkTWFya2VyKGxhYmVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtlciA9IGFwcGVuZChsYWJlbCwgJCgnc3Bhbi53aXphcmQtcmVxdWlyZWQtbWFya2VyJykpO1xuXHRcdG1hcmtlci50ZXh0Q29udGVudCA9ICcqJztcblx0XHRtYXJrZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdH1cblxuXHRwcml2YXRlIGdldElzc3VlVHlwZU9wdGlvbnMoKTogeyB0eXBlOiBJc3N1ZVR5cGU7IGxhYmVsOiBzdHJpbmc7IGljb246IHsgaWQ6IHN0cmluZyB9IH1bXSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IFtcblx0XHRcdHsgdHlwZTogSXNzdWVUeXBlLkJ1ZywgbGFiZWw6IGxvY2FsaXplKCdidWcnLCBcIkJ1Z1wiKSwgaWNvbjogQ29kaWNvbi5idWcgfSxcblx0XHRcdHsgdHlwZTogSXNzdWVUeXBlLkZlYXR1cmVSZXF1ZXN0LCBsYWJlbDogbG9jYWxpemUoJ2ZlYXR1cmVSZXF1ZXN0JywgXCJGZWF0dXJlIFJlcXVlc3RcIiksIGljb246IENvZGljb24ubGlnaHRidWxiIH0sXG5cdFx0XHR7IHR5cGU6IElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlLCBsYWJlbDogbG9jYWxpemUoJ3BlcmZvcm1hbmNlSXNzdWUnLCBcIlBlcmZvcm1hbmNlIElzc3VlXCIpLCBpY29uOiBDb2RpY29uLmRhc2hib2FyZCB9LFxuXHRcdF07XG5cdFx0Ly8gVGhlIE1hcmtldHBsYWNlIHRhcmdldCBpcyBmb3IgaXNzdWVzIHdpdGggdGhlIG1hcmtldHBsYWNlIHNpdGUvc2VydmljZVxuXHRcdC8vIGl0c2VsZiwgd2hlcmUgcGVyZm9ybWFuY2UgbWV0cmljcyBmcm9tIGEgc2luZ2xlIFZTIENvZGUgaW5zdGFuY2UgYXJlbid0IHVzZWZ1bC5cblx0XHRpZiAodGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5NYXJrZXRwbGFjZSkge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnMuZmlsdGVyKG8gPT4gby50eXBlICE9PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBbGxTb3VyY2VPcHRpb25zKCk6IHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IElzc3VlU291cmNlIH1bXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHsgbGFiZWw6IHByb2R1Y3QubmFtZUxvbmcgfHwgbG9jYWxpemUoJ3ZzY29kZScsIFwiVmlzdWFsIFN0dWRpbyBDb2RlXCIpLCB2YWx1ZTogSXNzdWVTb3VyY2UuVlNDb2RlIH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRzV2luZG93JywgXCJBZ2VudHMgV2luZG93XCIpLCB2YWx1ZTogSXNzdWVTb3VyY2UuQWdlbnRzV2luZG93IH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uU291cmNlJywgXCJBIFZTIENvZGUgZXh0ZW5zaW9uXCIpLCB2YWx1ZTogSXNzdWVTb3VyY2UuRXh0ZW5zaW9uIH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbWFya2V0cGxhY2UnLCBcIkV4dGVuc2lvbnMgTWFya2V0cGxhY2VcIiksIHZhbHVlOiBJc3N1ZVNvdXJjZS5NYXJrZXRwbGFjZSB9LFxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIGdldFNvdXJjZU9wdGlvbnMoKTogeyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogSXNzdWVTb3VyY2UgfVtdIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5nZXRBbGxTb3VyY2VPcHRpb25zKCk7XG5cdFx0Ly8gVGhlIEV4dGVuc2lvbiB0YXJnZXQgb25seSBhcHBsaWVzIHdoZW4gdGhlcmUgYXJlIG5vbi1idWlsdGluLCBub24tdGhlbWVcblx0XHQvLyBleHRlbnNpb25zIHRvIHJlcG9ydCBhZ2FpbnN0LCB3aGljaCBuZXZlciBoYXBwZW5zIGluIHRoZSBBZ2VudHMgV2luZG93LlxuXHRcdGlmICh0aGlzLmRhdGEuaXNTZXNzaW9uc1dpbmRvdyB8fCAhdGhpcy5oYXNSZXBvcnRhYmxlRXh0ZW5zaW9ucygpKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucy5maWx0ZXIobyA9PiBvLnZhbHVlICE9PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgaGFzUmVwb3J0YWJsZUV4dGVuc2lvbnMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5tb2RlbC5nZXREYXRhKCk7XG5cdFx0Y29uc3Qgc291cmNlRXh0ZW5zaW9ucyA9IG1vZGVsRGF0YS5lbmFibGVkTm9uVGhlbWVFeHRlc2lvbnMgPz8gbW9kZWxEYXRhLmFsbEV4dGVuc2lvbnMgPz8gW107XG5cdFx0cmV0dXJuIHNvdXJjZUV4dGVuc2lvbnMuc29tZShleHRlbnNpb24gPT4gIWV4dGVuc2lvbi5pc1RoZW1lICYmICFleHRlbnNpb24uaXNCdWlsdGluKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSXNzdWVTb3VyY2VCdXR0b25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGF2YWlsYWJsZVNvdXJjZXMgPSBuZXcgU2V0KHRoaXMuZ2V0U291cmNlT3B0aW9ucygpLm1hcChvcHRpb24gPT4gb3B0aW9uLnZhbHVlKSk7XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSAmJiAhYXZhaWxhYmxlU291cmNlcy5oYXModGhpcy5zZWxlY3RlZElzc3VlU291cmNlKSkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZElzc3VlU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblZhbGlkYXRpb24oKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGJ1dHRvbiBvZiB0aGlzLmlzc3VlU291cmNlQnV0dG9ucykge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gYnV0dG9uLmVsZW1lbnQuZ2V0QXR0cmlidXRlKCdkYXRhLXNvdXJjZScpIGFzIElzc3VlU291cmNlO1xuXHRcdFx0Y29uc3QgaXNBdmFpbGFibGUgPSBhdmFpbGFibGVTb3VyY2VzLmhhcyhzb3VyY2UpO1xuXHRcdFx0Y29uc3QgaXNTZWxlY3RlZCA9IHNvdXJjZSA9PT0gdGhpcy5zZWxlY3RlZElzc3VlU291cmNlO1xuXHRcdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWlzQXZhaWxhYmxlKTtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgaXNTZWxlY3RlZCk7XG5cdFx0XHRidXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhpc1NlbGVjdGVkKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVFeHRlbnNpb25GaWVsZFZpc2liaWxpdHkoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0SXNzdWVTb3VyY2Uoc291cmNlOiBJc3N1ZVNvdXJjZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy5zb3VyY2VCdXR0b25Hcm91cCwgdGhpcy5zb3VyY2VFcnJvciwgdGhpcy5kaWRBdHRlbXB0RGVzY3JpYmVTdWJtaXQgJiYgIXNvdXJjZSk7XG5cdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk7XG5cdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUJ1dHRvbnMoKTtcblx0XHR0aGlzLnVwZGF0ZUlzc3VlVHlwZUJ1dHRvbnMoKTtcblx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvblZhbGlkYXRpb24oKTtcblx0XHR0aGlzLnVwZGF0ZVRpdGxlUGxhY2Vob2xkZXIoKTtcblx0XHR0aGlzLnVwZGF0ZVRhcmdldFN0YXR1cygpO1xuXHRcdHRoaXMudXBkYXRlRGVzY3JpcHRpb25HdWlkYW5jZSgpO1xuXHRcdHRoaXMuc2VhcmNoU2ltaWxhcklzc3VlcygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGUgb3IgcmVzdG9yZSBpc3N1ZSB0eXBlIGJ1dHRvbnMgYmFzZWQgb24gdGhlIGN1cnJlbnQgc291cmNlLiBUaGUgTWFya2V0cGxhY2Vcblx0ICogc291cmNlIGRvZXMgbm90IHN1cHBvcnQgcmVwb3J0aW5nIHBlcmZvcm1hbmNlIGlzc3Vlcywgc28gdGhlIGJ1dHRvbiBpcyBoaWRkZW5cblx0ICogYW5kIHRoZSBzZWxlY3Rpb24gZmFsbHMgYmFjayB0byBCdWcgd2hlbiBpdCB3YXMgdGhlIFBlcmZvcm1hbmNlIG9wdGlvbi5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlSXNzdWVUeXBlQnV0dG9ucygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNzdWVUeXBlQnV0dG9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWxsb3dlZFR5cGVzID0gbmV3IFNldCh0aGlzLmdldElzc3VlVHlwZU9wdGlvbnMoKS5tYXAob3B0aW9uID0+IFN0cmluZyhvcHRpb24udHlwZSkpKTtcblx0XHRmb3IgKGNvbnN0IGJ1dHRvbiBvZiB0aGlzLmlzc3VlVHlwZUJ1dHRvbnMpIHtcblx0XHRcdGNvbnN0IGJ1dHRvblR5cGUgPSBidXR0b24uZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdHlwZScpO1xuXHRcdFx0Y29uc3QgaXNBdmFpbGFibGUgPSAhIWJ1dHRvblR5cGUgJiYgYWxsb3dlZFR5cGVzLmhhcyhidXR0b25UeXBlKTtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFpc0F2YWlsYWJsZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVUeXBlICE9PSB1bmRlZmluZWQgJiYgIWFsbG93ZWRUeXBlcy5oYXMoU3RyaW5nKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUpKSkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZElzc3VlVHlwZSA9IElzc3VlVHlwZS5CdWc7XG5cdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7IGlzc3VlVHlwZTogSXNzdWVUeXBlLkJ1ZyB9KTtcblx0XHRcdGZvciAoY29uc3QgYiBvZiB0aGlzLmlzc3VlVHlwZUJ1dHRvbnMpIHtcblx0XHRcdFx0Y29uc3QgaXNTZWxlY3RlZCA9IGIuZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtdHlwZScpID09PSBTdHJpbmcoSXNzdWVUeXBlLkJ1Zyk7XG5cdFx0XHRcdGIuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzZWxlY3RlZCcsIGlzU2VsZWN0ZWQpO1xuXHRcdFx0XHRiLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcoaXNTZWxlY3RlZCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSXNzdWVTb3VyY2VGbGFncygpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlT25FeHRlbnNpb24gPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLkV4dGVuc2lvbjtcblx0XHRjb25zdCBmaWxlT25NYXJrZXRwbGFjZSA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuTWFya2V0cGxhY2U7XG5cdFx0Y29uc3QgZmlsZU9uUHJvZHVjdCA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuVlNDb2RlIHx8IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuQWdlbnRzV2luZG93IHx8IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuVW5rbm93bjtcblx0XHRjb25zdCBmaWxlT25BZ2VudHNXaW5kb3cgPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLkFnZW50c1dpbmRvdztcblx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7XG5cdFx0XHRpc3N1ZVNvdXJjZTogdGhpcy5zZWxlY3RlZElzc3VlU291cmNlLFxuXHRcdFx0ZmlsZU9uRXh0ZW5zaW9uLFxuXHRcdFx0ZmlsZU9uTWFya2V0cGxhY2UsXG5cdFx0XHRmaWxlT25Qcm9kdWN0LFxuXHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogZmlsZU9uQWdlbnRzV2luZG93ID8gdHJ1ZSA6IHRoaXMuZGF0YS5pc1Nlc3Npb25zV2luZG93LFxuXHRcdFx0c2VsZWN0ZWRFeHRlbnNpb246IHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24sXG5cdFx0fSk7XG5cdFx0dGhpcy5kYXRhLmlzc3VlU291cmNlID0gdGhpcy5zZWxlY3RlZElzc3VlU291cmNlO1xuXHRcdC8vIFByZXNlcnZlIGEgcHJlc2V0IGBleHRlbnNpb25JZGAgd2hpbGUgdGhlIGV4dGVuc2lvbiBsaXN0IGlzIHN0aWxsIGxvYWRpbmc6XG5cdFx0Ly8gYHNlbGVjdGVkRXh0ZW5zaW9uYCBtYXkgYmUgdW5kZWZpbmVkIGhlcmUgZXZlbiB0aG91Z2ggdGhlIGNhbGxlciBhc2tlZFxuXHRcdC8vIGZvciBhIHNwZWNpZmljIGV4dGVuc2lvbiwgYW5kIG92ZXJ3cml0aW5nIHdpdGggYHVuZGVmaW5lZGAgd291bGQgcHJldmVudFxuXHRcdC8vIHRoZSBjYXRjaC11cCByZXRyeSBpbiBgdXBkYXRlRXh0ZW5zaW9uT3B0aW9uc2AgZnJvbSByZS1yZXNvbHZpbmcgaXQuXG5cdFx0dGhpcy5kYXRhLmV4dGVuc2lvbklkID0gZmlsZU9uRXh0ZW5zaW9uXG5cdFx0XHQ/ICh0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uPy5pZCA/PyB0aGlzLmRhdGEuZXh0ZW5zaW9uSWQpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGl0bGVQbGFjZWhvbGRlcigpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSkge1xuXHRcdFx0Y2FzZSBJc3N1ZVNvdXJjZS5FeHRlbnNpb246XG5cdFx0XHRcdHRoaXMudGl0bGVJbnB1dC5zZXRQbGFjZUhvbGRlcihsb2NhbGl6ZSgnZXh0ZW5zaW9uUGxhY2Vob2xkZXInLCBcIkUuZy4gTWlzc2luZyBhbHQgdGV4dCBvbiBleHRlbnNpb24gcmVhZG1lIGltYWdlXCIpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIElzc3VlU291cmNlLk1hcmtldHBsYWNlOlxuXHRcdFx0XHR0aGlzLnRpdGxlSW5wdXQuc2V0UGxhY2VIb2xkZXIobG9jYWxpemUoJ21hcmtldHBsYWNlUGxhY2Vob2xkZXInLCBcIkUuZy4gQ2Fubm90IGRpc2FibGUgaW5zdGFsbGVkIGV4dGVuc2lvblwiKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBJc3N1ZVNvdXJjZS5BZ2VudHNXaW5kb3c6XG5cdFx0XHRcdHRoaXMudGl0bGVJbnB1dC5zZXRQbGFjZUhvbGRlcihsb2NhbGl6ZSgnYWdlbnRzV2luZG93UGxhY2Vob2xkZXInLCBcIkUuZy4gU2Vzc2lvbnMgbGlzdCBkb2VzIG5vdCByZWZyZXNoIGFmdGVyIGNyZWF0aW5nIGEgbmV3IHNlc3Npb25cIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSXNzdWVTb3VyY2UuVlNDb2RlOlxuXHRcdFx0XHR0aGlzLnRpdGxlSW5wdXQuc2V0UGxhY2VIb2xkZXIobG9jYWxpemUoJ3ZzY29kZVBsYWNlaG9sZGVyJywgXCJFLmcuIFdvcmtiZW5jaCBpcyBtaXNzaW5nIHByb2JsZW1zIHBhbmVsXCIpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aGlzLnRpdGxlSW5wdXQuc2V0UGxhY2VIb2xkZXIobG9jYWxpemUoJ2lzc3VlVGl0bGVQbGFjZWhvbGRlcicsIFwiQnJpZWYgc3VtbWFyeSBvZiB0aGUgaXNzdWVcIikpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvbk9wdGlvbnMoKTogeyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBoaWRkZW4/OiBib29sZWFuIH1bXSB7XG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5tb2RlbC5nZXREYXRhKCk7XG5cdFx0Y29uc3Qgc291cmNlRXh0ZW5zaW9ucyA9IG1vZGVsRGF0YS5lbmFibGVkTm9uVGhlbWVFeHRlc2lvbnMgPz8gbW9kZWxEYXRhLmFsbEV4dGVuc2lvbnMgPz8gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IFsuLi5zb3VyY2VFeHRlbnNpb25zXVxuXHRcdFx0LmZpbHRlcihleHRlbnNpb24gPT4gIWV4dGVuc2lvbi5pc1RoZW1lICYmICFleHRlbnNpb24uaXNCdWlsdGluKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IChhLmRpc3BsYXlOYW1lIHx8IGEubmFtZSB8fCBhLmlkKS5sb2NhbGVDb21wYXJlKGIuZGlzcGxheU5hbWUgfHwgYi5uYW1lIHx8IGIuaWQpKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ3NlbGVjdEV4dGVuc2lvbicsIFwiU2VsZWN0IGV4dGVuc2lvblwiKSwgdmFsdWU6IHVuZGVmaW5lZCwgaGlkZGVuOiB0cnVlIH0sXG5cdFx0XHQuLi5leHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gKHsgbGFiZWw6IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSB8fCBleHRlbnNpb24uaWQsIHZhbHVlOiBleHRlbnNpb24uaWQgfSkpLFxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvblNlbGVjdEl0ZW1zKCk6IElTZWxlY3RPcHRpb25JdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk9wdGlvbnMubWFwKG9wdGlvbiA9PiAoeyB0ZXh0OiBvcHRpb24ubGFiZWwsIGlzRGlzYWJsZWQ6IG9wdGlvbi5oaWRkZW4gfSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3RlZEV4dGVuc2lvbkluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgubWF4KDAsIHRoaXMuZXh0ZW5zaW9uT3B0aW9ucy5maW5kSW5kZXgob3B0aW9uID0+IG9wdGlvbi52YWx1ZSA9PT0gdGhpcy5zZWxlY3RlZEV4dGVuc2lvbj8uaWQgfHwgb3B0aW9uLnZhbHVlID09PSB0aGlzLmRhdGEuZXh0ZW5zaW9uSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXh0ZW5zaW9uT3B0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLmV4dGVuc2lvbk9wdGlvbnMgPSB0aGlzLmdldEV4dGVuc2lvbk9wdGlvbnMoKTtcblx0XHR0aGlzLmV4dGVuc2lvblNlbGVjdC5zZXRPcHRpb25zKHRoaXMuZ2V0RXh0ZW5zaW9uU2VsZWN0SXRlbXMoKSwgdGhpcy5nZXRTZWxlY3RlZEV4dGVuc2lvbkluZGV4KCkpO1xuXHRcdGlmICghdGhpcy5zZWxlY3RlZEV4dGVuc2lvbiAmJiB0aGlzLmRhdGEuZXh0ZW5zaW9uSWQpIHtcblx0XHRcdHZvaWQgdGhpcy51cGRhdGVTZWxlY3RlZEV4dGVuc2lvbih0aGlzLmRhdGEuZXh0ZW5zaW9uSWQsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4dGVuc2lvbkZpZWxkVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHR0aGlzLmV4dGVuc2lvbkZpZWxkLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSAhPT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRXh0ZW5zaW9uVmFsaWRhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBoYXNFeHRlbnNpb24gPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgIT09IElzc3VlU291cmNlLkV4dGVuc2lvbiB8fCAhIXRoaXMuc2VsZWN0ZWRFeHRlbnNpb247XG5cdFx0Y29uc3QgaGFzRXh0ZW5zaW9uSXNzdWVVcmwgPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgIT09IElzc3VlU291cmNlLkV4dGVuc2lvbiB8fCAhdGhpcy5zZWxlY3RlZEV4dGVuc2lvbiB8fCAhIXRoaXMuZ2V0U2VsZWN0ZWRFeHRlbnNpb25Jc3N1ZVVybCgpO1xuXHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLmV4dGVuc2lvbkZpZWxkLCB0aGlzLmV4dGVuc2lvbkVycm9yLCB0aGlzLmRpZEF0dGVtcHREZXNjcmliZVN1Ym1pdCAmJiAoIWhhc0V4dGVuc2lvbiB8fCAhaGFzRXh0ZW5zaW9uSXNzdWVVcmwpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlU2VsZWN0ZWRFeHRlbnNpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbG9hZEV4dGVuc2lvbkRhdGEgPSB0cnVlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gZXh0ZW5zaW9uSWRcblx0XHRcdD8gdGhpcy5tb2RlbC5nZXREYXRhKCkuYWxsRXh0ZW5zaW9ucy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQudG9Mb3dlckNhc2UoKSA9PT0gZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0Ly8gUHJlc2VydmUgdGhlIHJlcXVlc3RlZCBleHRlbnNpb25JZCBldmVuIHdoZW4gdGhlIGV4dGVuc2lvbiBsaXN0IGhhc24ndFxuXHRcdC8vIGJlZW4gcG9wdWxhdGVkIHlldCAodHlwaWNhbCB3aXphcmQgZmxvdzogdGhlIGNvbnN0cnVjdG9yIHJ1bnMgYmVmb3JlXG5cdFx0Ly8gYHBvcHVsYXRlUmVwb3J0ZXJEYXRhQXN5bmNgIGZpbmlzaGVzIGZpbGxpbmcgYGFsbEV4dGVuc2lvbnNgKS4gV2l0aG91dFxuXHRcdC8vIHRoaXMgcHJlc2VydmF0aW9uLCB0aGUgbGF0ZXIgY2F0Y2gtdXAgcmV0cnkgaW4gYHVwZGF0ZUV4dGVuc2lvbk9wdGlvbnNgXG5cdFx0Ly8gc2VlcyBgdGhpcy5kYXRhLmV4dGVuc2lvbklkID09PSB1bmRlZmluZWRgIGFuZCBuZXZlciByZS1yZXNvbHZlcyxcblx0XHQvLyBkcm9wcGluZyBhbnkgcHJlc2V0IGV4dGVuc2lvbiBkYXRhIHdpdGggaXQuXG5cdFx0aWYgKGV4dGVuc2lvbklkID09PSB1bmRlZmluZWQgfHwgZXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmRhdGEuZXh0ZW5zaW9uSWQgPSBleHRlbnNpb24/LmlkO1xuXHRcdH1cblx0XHR0aGlzLmV4dGVuc2lvblNlbGVjdC5zZWxlY3QodGhpcy5nZXRTZWxlY3RlZEV4dGVuc2lvbkluZGV4KCkpO1xuXHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uVmFsaWRhdGlvbigpO1xuXHRcdHRoaXMudXBkYXRlSXNzdWVTb3VyY2VGbGFncygpO1xuXG5cdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdHRoaXMudXBkYXRlVGFyZ2V0U3RhdHVzKCk7XG5cdFx0XHR0aGlzLnNlYXJjaFNpbWlsYXJJc3N1ZXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBhbnkgcHJlc2V0IGV4dGVuc2lvbiBkYXRhIEJFRk9SRSB0aGUgYnVpbHQtaW4gc291cmNlLXN3aXRjaCBiZWxvdy5cblx0XHQvLyBXaGVuIHRoZSByZXBvcnRlciBpcyBvcGVuZWQgcHJvZ3JhbW1hdGljYWxseSAoZS5nLiB2aWEgdGhlXG5cdFx0Ly8gYHdvcmtiZW5jaC5hY3Rpb24ub3Blbklzc3VlUmVwb3J0ZXJgIGNvbW1hbmQpIHdpdGggYSBwcmVzZXQgYGV4dGVuc2lvbklkYFxuXHRcdC8vIHBsdXMgZXh0ZW5zaW9uIGBkYXRhYC9gdXJpYCwgcHJvcGFnYXRlIHRoYXQgZGF0YSBvbnRvIHRoZSBzZWxlY3RlZFxuXHRcdC8vIGV4dGVuc2lvbiBhbmQgdGhlIG1vZGVsIHNvIGl0IHNob3dzIHVwIGluIHRoZSBpc3N1ZSBib2R5LiBEb2luZyB0aGlzXG5cdFx0Ly8gYmVmb3JlIHRoZSBidWlsdC1pbiBlYXJseS1yZXR1cm4gaXMgaW1wb3J0YW50OiBleHRlbnNpb25zIGJ1bmRsZWQgd2l0aFxuXHRcdC8vIHRoZSBkZXYgYnVpbGQgKENvcGlsb3QsIGV0Yy4pIGFyZSBmbGFnZ2VkIGBpc0J1aWx0aW5gLCB3aGljaCB0cmlnZ2Vyc1xuXHRcdC8vIHRoZSBzb3VyY2Ugc3dpdGNoIHRvIFZTQ29kZSBhbmQgcmV0dXJucyBcdTIwMTQgb3RoZXJ3aXNlIHRoZSBwcmVzZXQgZGF0YVxuXHRcdC8vIHdvdWxkIGJlIHNpbGVudGx5IGxvc3QgZm9yIGV2ZXJ5IGJ1aWx0LWluIGNhbGxlci4gV2UgZ3VhcmQgb25cblx0XHQvLyBgIXRoaXMuaW5jbHVkZUV4dGVuc2lvbkRhdGFgIChyYXRoZXIgdGhhbiBgIWV4dGVuc2lvbi5kYXRhYCkgYmVjYXVzZVxuXHRcdC8vIGBpc3N1ZVNlcnZpY2VgIHByZS1wb3B1bGF0ZXMgYGV4dGVuc2lvbi5kYXRhYCBvbiBldmVyeSBlbmFibGVkXG5cdFx0Ly8gZXh0ZW5zaW9uLCBzbyB0aGF0IGZpZWxkIGlzIG5vdCBhIHJlbGlhYmxlIFwiYWxyZWFkeSBhcHBsaWVkXCIgc2lnbmFsIFx1MjAxNFxuXHRcdC8vIGBpbmNsdWRlRXh0ZW5zaW9uRGF0YWAgaXMgb25seSBmbGlwcGVkIHRvIGB0cnVlYCBieVxuXHRcdC8vIGBhcHBseUV4dGVuc2lvbklzc3VlRGF0YWAuXG5cdFx0Y29uc3QgaGFzUHJlc2V0RGF0YSA9ICF0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhICYmICh0aGlzLmRhdGEuZGF0YSAhPT0gdW5kZWZpbmVkIHx8IHRoaXMuZGF0YS51cmkgIT09IHVuZGVmaW5lZCB8fCB0aGlzLmRhdGEucHJpdmF0ZVVyaSAhPT0gdW5kZWZpbmVkKTtcblx0XHRpZiAoIWxvYWRFeHRlbnNpb25EYXRhICYmIGhhc1ByZXNldERhdGEpIHtcblx0XHRcdHRoaXMuYXBwbHlFeHRlbnNpb25Jc3N1ZURhdGEoZXh0ZW5zaW9uLCB0aGlzLmRhdGEpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24uaXNCdWlsdGluICYmIHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uICYmICF0aGlzLmRhdGEuaXNzdWVTb3VyY2UpIHtcblx0XHRcdHRoaXMuc2V0SXNzdWVTb3VyY2UoSXNzdWVTb3VyY2UuVlNDb2RlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobG9hZEV4dGVuc2lvbkRhdGEgJiYgdGhpcy5yZXNvbHZlRXh0ZW5zaW9uSXNzdWVEYXRhKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gKyt0aGlzLmV4dGVuc2lvbkRhdGFSZXF1ZXN0O1xuXHRcdFx0dGhpcy5leHRlbnNpb25TdGF0dXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbG9hZGluZ0V4dGVuc2lvbkRhdGEnLCBcIkxvYWRpbmcgZXh0ZW5zaW9uIGlzc3VlIGRhdGEuLi5cIik7XG5cdFx0XHRjb25zdCBpc3N1ZURhdGEgPSBhd2FpdCB0aGlzLnJlc29sdmVFeHRlbnNpb25Jc3N1ZURhdGEoZXh0ZW5zaW9uLmlkKTtcblx0XHRcdGlmIChyZXF1ZXN0ICE9PSB0aGlzLmV4dGVuc2lvbkRhdGFSZXF1ZXN0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChpc3N1ZURhdGEpIHtcblx0XHRcdFx0dGhpcy5hcHBseUV4dGVuc2lvbklzc3VlRGF0YShleHRlbnNpb24sIGlzc3VlRGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVUYXJnZXRTdGF0dXMoKTtcblx0XHR0aGlzLnNlYXJjaFNpbWlsYXJJc3N1ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlFeHRlbnNpb25Jc3N1ZURhdGEoZXh0ZW5zaW9uOiBJc3N1ZVJlcG9ydGVyRXh0ZW5zaW9uRGF0YSwgaXNzdWVEYXRhOiBJc3N1ZVJlcG9ydGVyRGF0YSk6IHZvaWQge1xuXHRcdGV4dGVuc2lvbi5kYXRhID0gaXNzdWVEYXRhLmRhdGE7XG5cdFx0ZXh0ZW5zaW9uLnVyaSA9IGlzc3VlRGF0YS51cmk7XG5cdFx0ZXh0ZW5zaW9uLnByaXZhdGVVcmkgPSBpc3N1ZURhdGEucHJpdmF0ZVVyaTtcblx0XHR0aGlzLmRhdGEuZGF0YSA9IGlzc3VlRGF0YS5kYXRhO1xuXHRcdHRoaXMuZGF0YS51cmkgPSBpc3N1ZURhdGEudXJpO1xuXHRcdHRoaXMuZGF0YS5wcml2YXRlVXJpID0gaXNzdWVEYXRhLnByaXZhdGVVcmk7XG5cdFx0dGhpcy5kYXRhLmlzc3VlQm9keSA9IGlzc3VlRGF0YS5pc3N1ZUJvZHkgPz8gdGhpcy5kYXRhLmlzc3VlQm9keTtcblx0XHR0aGlzLmRhdGEuaXNzdWVUaXRsZSA9IGlzc3VlRGF0YS5pc3N1ZVRpdGxlID8/IHRoaXMuZGF0YS5pc3N1ZVRpdGxlO1xuXHRcdGlmIChpc3N1ZURhdGEuaXNzdWVUaXRsZSAmJiAhdGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKSkge1xuXHRcdFx0dGhpcy50aXRsZUlucHV0LnZhbHVlID0gaXNzdWVEYXRhLmlzc3VlVGl0bGU7XG5cdFx0fVxuXHRcdGlmIChpc3N1ZURhdGEuaXNzdWVCb2R5ICYmICF0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUuaW5jbHVkZXMoaXNzdWVEYXRhLmlzc3VlQm9keSkpIHtcblx0XHRcdHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZSA9IHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZVxuXHRcdFx0XHQ/IGAke3RoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZX1cXG4ke2lzc3VlRGF0YS5pc3N1ZUJvZHl9YFxuXHRcdFx0XHQ6IGlzc3VlRGF0YS5pc3N1ZUJvZHk7XG5cdFx0fVxuXHRcdGlmIChpc3N1ZURhdGEuZGF0YSkge1xuXHRcdFx0ZXh0ZW5zaW9uLmV4dGVuc2lvbkRhdGEgPSBpc3N1ZURhdGEuZGF0YTtcblx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgZXh0ZW5zaW9uRGF0YTogaXNzdWVEYXRhLmRhdGEsIGluY2x1ZGVFeHRlbnNpb25EYXRhOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5pbmNsdWRlRXh0ZW5zaW9uRGF0YSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUYXJnZXRTdGF0dXMoKTogdm9pZCB7XG5cdFx0dGhpcy50YXJnZXRTdGF0dXMudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLmV4dGVuc2lvblN0YXR1cy50ZXh0Q29udGVudCA9ICcnO1xuXHRcdGlmICghdGhpcy5zZWxlY3RlZElzc3VlU291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSAhPT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uKSB7XG5cdFx0XHRjb25zdCByZXBvID0gdGhpcy5nZXRJc3N1ZVRhcmdldFJlcG8oKTtcblx0XHRcdHRoaXMudGFyZ2V0U3RhdHVzLnRleHRDb250ZW50ID0gcmVwb1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdpc3N1ZVRhcmdldFJlcG8nLCBcIklzc3VlIHdpbGwgYmUgY3JlYXRlZCBpbiB7MH0vezF9LlwiLCByZXBvLm93bmVyLCByZXBvLnJlcG9zaXRvcnlOYW1lKVxuXHRcdFx0XHQ6ICcnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zZWxlY3RlZEV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzc3VlVXJsID0gdGhpcy5nZXRTZWxlY3RlZEV4dGVuc2lvbklzc3VlVXJsKCk7XG5cdFx0aWYgKCFpc3N1ZVVybCkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25TdGF0dXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uTm9Jc3N1ZVVybCcsIFwiVGhpcyBleHRlbnNpb24gZG9lcyBub3QgcHJvdmlkZSBhbiBpc3N1ZSByZXBvcnRpbmcgVVJMLlwiKTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLmlzR2l0SHViVXJsKGlzc3VlVXJsKSkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25TdGF0dXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uRXh0ZXJuYWxJc3N1ZVVybCcsIFwiVGhpcyBleHRlbnNpb24gdXNlcyBhbiBleHRlcm5hbCBpc3N1ZSByZXBvcnRlci4gUHJldmlldyB3aWxsIG9wZW4gdGhhdCBpc3N1ZSByZXBvcnRlci5cIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlcG8gPSB0aGlzLmdldElzc3VlVGFyZ2V0UmVwbygpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25TdGF0dXMudGV4dENvbnRlbnQgPSByZXBvXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2lzc3VlVGFyZ2V0UmVwbycsIFwiSXNzdWUgd2lsbCBiZSBjcmVhdGVkIGluIHswfS97MX0uXCIsIHJlcG8ub3duZXIsIHJlcG8ucmVwb3NpdG9yeU5hbWUpXG5cdFx0XHRcdDogJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRJc3N1ZVRhcmdldFJlcG8oKTogeyBvd25lcjogc3RyaW5nOyByZXBvc2l0b3J5TmFtZTogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRhcmdldFVybCA9IHRoaXMuZ2V0SXNzdWVUYXJnZXRVcmwoKTtcblx0XHRyZXR1cm4gdGFyZ2V0VXJsID8gdGhpcy5wYXJzZUdpdEh1YlVybCh0YXJnZXRVcmwpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3RlZEV4dGVuc2lvbklzc3VlVXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi51cmkpIHtcblx0XHRcdHJldHVybiBVUkkucmV2aXZlKGV4dGVuc2lvbi51cmkpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24uYnVnc1VybCAmJiAvXmh0dHBzPzpcXC9cXC9naXRodWJcXC5jb21cXC8oW15cXC9dKilcXC8oW15cXC9dKilcXC8/KFxcL2lzc3Vlcyk/XFwvPyQvLnRlc3QoZXh0ZW5zaW9uLmJ1Z3NVcmwpKSB7XG5cdFx0XHRyZXR1cm4gYCR7bm9ybWFsaXplR2l0SHViVXJsKGV4dGVuc2lvbi5idWdzVXJsKX0vaXNzdWVzL25ld2A7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24ucmVwb3NpdG9yeVVybCAmJiAvXmh0dHBzPzpcXC9cXC9naXRodWJcXC5jb21cXC8oW15cXC9dKilcXC8oW15cXC9dKilcXC8/JC8udGVzdChleHRlbnNpb24ucmVwb3NpdG9yeVVybCkpIHtcblx0XHRcdHJldHVybiBgJHtub3JtYWxpemVHaXRIdWJVcmwoZXh0ZW5zaW9uLnJlcG9zaXRvcnlVcmwpfS9pc3N1ZXMvbmV3YDtcblx0XHR9XG5cdFx0cmV0dXJuIGV4dGVuc2lvbi5idWdzVXJsIHx8IGV4dGVuc2lvbi5yZXBvc2l0b3J5VXJsO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJc3N1ZVNvdXJjZUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UpIHtcblx0XHRcdGNhc2UgSXNzdWVTb3VyY2UuVlNDb2RlOlxuXHRcdFx0XHRyZXR1cm4gcHJvZHVjdC5uYW1lTG9uZyB8fCBsb2NhbGl6ZSgndnNjb2RlJywgXCJWaXN1YWwgU3R1ZGlvIENvZGVcIik7XG5cdFx0XHRjYXNlIElzc3VlU291cmNlLkFnZW50c1dpbmRvdzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudHNXaW5kb3cnLCBcIkFnZW50cyBXaW5kb3dcIik7XG5cdFx0XHRjYXNlIElzc3VlU291cmNlLkV4dGVuc2lvbjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24/LmRpc3BsYXlOYW1lIHx8IHRoaXMuc2VsZWN0ZWRFeHRlbnNpb24/Lm5hbWUgfHwgbG9jYWxpemUoJ2V4dGVuc2lvblNvdXJjZScsIFwiQSBWUyBDb2RlIGV4dGVuc2lvblwiKTtcblx0XHRcdGNhc2UgSXNzdWVTb3VyY2UuTWFya2V0cGxhY2U6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWFya2V0cGxhY2UnLCBcIkV4dGVuc2lvbnMgTWFya2V0cGxhY2VcIik7XG5cdFx0XHRjYXNlIElzc3VlU291cmNlLlVua25vd246XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndW5rbm93blNvdXJjZScsIFwiRG9uJ3Qga25vd1wiKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndW5rbm93bicsIFwiVW5rbm93blwiKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldElzc3VlVGFyZ2V0VXJsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSA9PT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRTZWxlY3RlZEV4dGVuc2lvbklzc3VlVXJsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLk1hcmtldHBsYWNlKSB7XG5cdFx0XHRyZXR1cm4gcHJvZHVjdC5yZXBvcnRNYXJrZXRwbGFjZUlzc3VlVXJsID8/IHByb2R1Y3QucmVwb3J0SXNzdWVVcmw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmRhdGEudXJpKSB7XG5cdFx0XHRyZXR1cm4gVVJJLnJldml2ZSh0aGlzLmRhdGEudXJpKS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5kYXRhLnByaXZhdGVVcmkpIHtcblx0XHRcdHJldHVybiBVUkkucmV2aXZlKHRoaXMuZGF0YS5wcml2YXRlVXJpKS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvZHVjdC5yZXBvcnRJc3N1ZVVybDtcblx0fVxuXG5cdHByaXZhdGUgaXNHaXRIdWJVcmwodXJsOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gL15odHRwcz86XFwvXFwvZ2l0aHViXFwuY29tXFwvL2kudGVzdCh1cmwpO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZUdpdEh1YlVybCh1cmw6IHN0cmluZyk6IHsgb3duZXI6IHN0cmluZzsgcmVwb3NpdG9yeU5hbWU6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYXRjaCA9IC9eaHR0cHM/OlxcL1xcL2dpdGh1YlxcLmNvbVxcLyhbXlxcLz8jXSspXFwvKFteXFwvPyNdKykuKi9pLmV4ZWModXJsKTtcblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBvd25lcjogbWF0Y2hbMV0sIHJlcG9zaXRvcnlOYW1lOiBtYXRjaFsyXSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzZWFyY2hTaW1pbGFySXNzdWVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwICE9PSBXaXphcmRTdGVwLlJldmlldyB8fCAhdGhpcy5zaW1pbGFySXNzdWVzQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNpbWlsYXJJc3N1ZXNIYW5kbGUpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLnNpbWlsYXJJc3N1ZXNIYW5kbGUpO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlclNpbWlsYXJJc3N1ZXNNZXNzYWdlKGxvY2FsaXplKCdzZWFyY2hpbmdTaW1pbGFySXNzdWVzJywgXCJTZWFyY2hpbmcgc2ltaWxhciBpc3N1ZXMuLi5cIikpO1xuXHRcdHRoaXMuc2ltaWxhcklzc3Vlc0hhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5kb1NlYXJjaFNpbWlsYXJJc3N1ZXMoKSwgMzAwKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TZWFyY2hTaW1pbGFySXNzdWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRpdGxlID0gdGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gKyt0aGlzLnNpbWlsYXJJc3N1ZXNSZXF1ZXN0O1xuXHRcdGlmICghdGl0bGUgfHwgIXRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSkge1xuXHRcdFx0dGhpcy5yZW5kZXJTaW1pbGFySXNzdWVzTWVzc2FnZShsb2NhbGl6ZSgnc2ltaWxhcklzc3Vlc05lZWRzVGl0bGUnLCBcIkVudGVyIGEgdGl0bGUgdG8gc2VhcmNoIGZvciBzaW1pbGFyIGlzc3Vlcy5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyU2ltaWxhcklzc3Vlc01lc3NhZ2UobG9jYWxpemUoJ3NlYXJjaGluZ1NpbWlsYXJJc3N1ZXMnLCBcIlNlYXJjaGluZyBzaW1pbGFyIGlzc3Vlcy4uLlwiKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCByZXN1bHRzOiBJU2ltaWxhcklzc3VlW10gPSBbXTtcblx0XHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLkV4dGVuc2lvbikge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Jc3N1ZVVybCA9IHRoaXMuZ2V0U2VsZWN0ZWRFeHRlbnNpb25Jc3N1ZVVybCgpO1xuXHRcdFx0XHRjb25zdCByZXBvID0gZXh0ZW5zaW9uSXNzdWVVcmwgJiYgdGhpcy5wYXJzZUdpdEh1YlVybChleHRlbnNpb25Jc3N1ZVVybCk7XG5cdFx0XHRcdHJlc3VsdHMgPSByZXBvID8gYXdhaXQgdGhpcy5zZWFyY2hHaXRIdWJJc3N1ZXMoYCR7cmVwby5vd25lcn0vJHtyZXBvLnJlcG9zaXRvcnlOYW1lfWAsIHRpdGxlKSA6IFtdO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgPT09IElzc3VlU291cmNlLk1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdGNvbnN0IG1hcmtldHBsYWNlSXNzdWVVcmwgPSBwcm9kdWN0LnJlcG9ydE1hcmtldHBsYWNlSXNzdWVVcmwgPz8gcHJvZHVjdC5yZXBvcnRJc3N1ZVVybDtcblx0XHRcdFx0Y29uc3QgcmVwbyA9IG1hcmtldHBsYWNlSXNzdWVVcmwgJiYgdGhpcy5wYXJzZUdpdEh1YlVybChtYXJrZXRwbGFjZUlzc3VlVXJsKTtcblx0XHRcdFx0cmVzdWx0cyA9IHJlcG8gPyBhd2FpdCB0aGlzLnNlYXJjaEdpdEh1Yklzc3VlcyhgJHtyZXBvLm93bmVyfS8ke3JlcG8ucmVwb3NpdG9yeU5hbWV9YCwgdGl0bGUpIDogW107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHRzID0gYXdhaXQgdGhpcy5zZWFyY2hWU0NvZGVTaW1pbGFySXNzdWVzKHRpdGxlLCB0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUudHJpbSgpKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXF1ZXN0ID09PSB0aGlzLnNpbWlsYXJJc3N1ZXNSZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyU2ltaWxhcklzc3VlcyhyZXN1bHRzKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdGlmIChyZXF1ZXN0ID09PSB0aGlzLnNpbWlsYXJJc3N1ZXNSZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyU2ltaWxhcklzc3Vlc01lc3NhZ2UobG9jYWxpemUoJ3NpbWlsYXJJc3N1ZXNTZWFyY2hGYWlsZWQnLCBcIlVuYWJsZSB0byBzZWFyY2ggZm9yIHNpbWlsYXIgaXNzdWVzLlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWFyY2hHaXRIdWJJc3N1ZXMocmVwbzogc3RyaW5nLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTxJU2ltaWxhcklzc3VlW10+IHtcblx0XHRjb25zdCBxdWVyeSA9IGBpczppc3N1ZSByZXBvOiR7cmVwb30gJHt0aXRsZX1gO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vc2VhcmNoL2lzc3Vlcz9xPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHF1ZXJ5KX1gKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocmVzdWx0Py5pdGVtcykgPyByZXN1bHQuaXRlbXMgOiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VhcmNoVlNDb2RlRHVwbGljYXRlcyh0aXRsZTogc3RyaW5nLCBib2R5OiBzdHJpbmcpOiBQcm9taXNlPElTaW1pbGFySXNzdWVbXT4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vdnNjb2RlLXByb2JvdC53ZXN0dXMuY2xvdWRhcHAuYXp1cmUuY29tOjc4OTAvZHVwbGljYXRlX2NhbmRpZGF0ZXMnLCB7XG5cdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgdGl0bGUsIGJvZHkgfSksXG5cdFx0XHRoZWFkZXJzOiBuZXcgSGVhZGVycyh7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuXHRcdHJldHVybiBBcnJheS5pc0FycmF5KHJlc3VsdD8uY2FuZGlkYXRlcykgPyByZXN1bHQuY2FuZGlkYXRlcyA6IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWFyY2hWU0NvZGVTaW1pbGFySXNzdWVzKHRpdGxlOiBzdHJpbmcsIGJvZHk6IHN0cmluZyk6IFByb21pc2U8SVNpbWlsYXJJc3N1ZVtdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGR1cGxpY2F0ZXMgPSBhd2FpdCB0aGlzLnNlYXJjaFZTQ29kZUR1cGxpY2F0ZXModGl0bGUsIGJvZHkpO1xuXHRcdFx0aWYgKGR1cGxpY2F0ZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBkdXBsaWNhdGVzO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRmFsbCBiYWNrIHRvIEdpdEh1YiBzZWFyY2ggYmVsb3cuXG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwbyA9IHRoaXMuZ2V0SXNzdWVUYXJnZXRSZXBvKCk7XG5cdFx0cmV0dXJuIHJlcG8gPyB0aGlzLnNlYXJjaEdpdEh1Yklzc3VlcyhgJHtyZXBvLm93bmVyfS8ke3JlcG8ucmVwb3NpdG9yeU5hbWV9YCwgdGl0bGUpIDogW107XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNpbWlsYXJJc3N1ZXNNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucmVzZXRTaW1pbGFySXNzdWVzQ29udGFpbmVyKCk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gYXBwZW5kKHRoaXMuc2ltaWxhcklzc3Vlc0NvbnRhaW5lciwgJCgnZGl2LndpemFyZC1zaW1pbGFyLXN0YXR1cycpKTtcblx0XHRzdGF0dXMudGV4dENvbnRlbnQgPSBtZXNzYWdlO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTaW1pbGFySXNzdWVzKHJlc3VsdHM6IElTaW1pbGFySXNzdWVbXSk6IHZvaWQge1xuXHRcdGlmICghcmVzdWx0cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMucmVuZGVyU2ltaWxhcklzc3Vlc01lc3NhZ2UobG9jYWxpemUoJ25vU2ltaWxhcklzc3VlcycsIFwiTm8gc2ltaWxhciBpc3N1ZXMgZm91bmQuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlc2V0U2ltaWxhcklzc3Vlc0NvbnRhaW5lcigpO1xuXHRcdGNvbnN0IGxpc3QgPSBhcHBlbmQodGhpcy5zaW1pbGFySXNzdWVzQ29udGFpbmVyLCAkKCd1bC53aXphcmQtc2ltaWxhci1saXN0JykpO1xuXHRcdGZvciAoY29uc3QgaXNzdWUgb2YgcmVzdWx0cy5zbGljZSgwLCBNQVhfU0lNSUxBUl9JU1NVRVMpKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gYXBwZW5kKGxpc3QsICQoJ2xpLndpemFyZC1zaW1pbGFyLWl0ZW0nKSk7XG5cdFx0XHRjb25zdCBsaW5rID0gYXBwZW5kKGl0ZW0sICQoJ2Eud2l6YXJkLXNpbWlsYXItbGluaycpKSBhcyBIVE1MQW5jaG9yRWxlbWVudDtcblx0XHRcdGxpbmsuaHJlZiA9IGlzc3VlLmh0bWxfdXJsO1xuXHRcdFx0bGluay50ZXh0Q29udGVudCA9IGlzc3VlLnRpdGxlO1xuXHRcdFx0bGluay50aXRsZSA9IGlzc3VlLnRpdGxlO1xuXHRcdFx0dGhpcy5zaW1pbGFySXNzdWVzRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHRoaXMub3BlbkV4dGVybmFsTGluaz8uKGlzc3VlLmh0bWxfdXJsKTtcblx0XHRcdH0pKTtcblx0XHRcdGlmIChpc3N1ZS5zdGF0ZSkge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGFwcGVuZChpdGVtLCAkKCdzcGFuLndpemFyZC1zaW1pbGFyLXN0YXRlJykpO1xuXHRcdFx0XHRzdGF0ZS50ZXh0Q29udGVudCA9IGlzc3VlLnN0YXRlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBDbGVhciB0aGUgc2ltaWxhci1pc3N1ZXMgY29udGFpbmVyIGFuZCByZS1yZW5kZXIgdGhlIHNlY3Rpb24gaGVhZGluZy4gKi9cblx0cHJpdmF0ZSByZXNldFNpbWlsYXJJc3N1ZXNDb250YWluZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5zaW1pbGFySXNzdWVzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNpbWlsYXJJc3N1ZXNDb250YWluZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHRjb25zdCBoZWFkaW5nID0gYXBwZW5kKHRoaXMuc2ltaWxhcklzc3Vlc0NvbnRhaW5lciwgJCgnZGl2LndpemFyZC1zaW1pbGFyLWhlYWRpbmcnKSk7XG5cdFx0aGVhZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzaW1pbGFySXNzdWVzJywgXCJTaW1pbGFyIElzc3Vlc1wiKTtcblx0fVxuXG5cdC8qKiBVcGRhdGUgdGhlIGd1aWRhbmNlIHRleHQgYWJvdmUgdGhlIGRlc2NyaXB0aW9uIGJhc2VkIG9uIHNlbGVjdGVkIGNhdGVnb3J5ICovXG5cdHByaXZhdGUgdXBkYXRlRGVzY3JpcHRpb25HdWlkYW5jZSgpOiB2b2lkIHtcblx0XHRjb25zdCBtYXJrZG93bkhpbnQgPSBsb2NhbGl6ZSgnbWFya2Rvd25TdXBwb3J0ZWQnLCBcIk1hcmtkb3duIGZvcm1hdHRpbmcgaXMgc3VwcG9ydGVkLlwiKTtcblx0XHRjb25zdCBwZXJmV2lraVVybCA9ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS93aWtpL1BlcmZvcm1hbmNlLUlzc3Vlcyc7XG5cblx0XHQvLyBSZXNldCBiZWZvcmUgdXBkYXRpbmdcblx0XHR0aGlzLmRlc2NyaXB0aW9uR3VpZGFuY2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZGVzY3JpcHRpb25HdWlkYW5jZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMuZGVzY3JpcHRpb25HdWlkYW5jZS5jbGFzc0xpc3QucmVtb3ZlKCd3aXphcmQtZGVzY3JpcHRpb24tZ3VpZGFuY2Utd2l0aC1saW5rJyk7XG5cblx0XHRjb25zdCBhcHBlbmRUZXh0ID0gKHRleHQ6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0RG9jdW1lbnQgPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpLmRvY3VtZW50O1xuXHRcdFx0dGhpcy5kZXNjcmlwdGlvbkd1aWRhbmNlLmFwcGVuZENoaWxkKHRhcmdldERvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpKTtcblx0XHR9O1xuXG5cdFx0c3dpdGNoICh0aGlzLnNlbGVjdGVkSXNzdWVUeXBlKSB7XG5cdFx0XHRjYXNlIElzc3VlVHlwZS5CdWc6XG5cdFx0XHRcdGFwcGVuZFRleHQoYCR7bG9jYWxpemUoJ2J1Z0d1aWRhbmNlJywgXCJEZXNjcmliZSB3aGF0IGhhcHBlbmVkLCB0aGUgc3RlcHMgdG8gcmVwcm9kdWNlLCB3aGF0IHlvdSBleHBlY3RlZCwgYW5kIHdoYXQgeW91IG9ic2VydmVkIGluc3RlYWQuXCIpfVxcbiR7bWFya2Rvd25IaW50fWApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgSXNzdWVUeXBlLkZlYXR1cmVSZXF1ZXN0OlxuXHRcdFx0XHRhcHBlbmRUZXh0KGAke2xvY2FsaXplKCdmZWF0dXJlR3VpZGFuY2UnLCBcIkRlc2NyaWJlIHRoZSBmZWF0dXJlIHlvdSdkIGxpa2UgdG8gc2VlLCB3aGF0IHByb2JsZW0gaXQgd291bGQgc29sdmUsIGFuZCBhbnkgYWx0ZXJuYXRpdmVzIHlvdSd2ZSBjb25zaWRlcmVkLlwiKX1cXG4ke21hcmtkb3duSGludH1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIElzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlOiB7XG5cdFx0XHRcdGFwcGVuZFRleHQoYCR7bG9jYWxpemUoJ3BlcmZHdWlkYW5jZScsIFwiRGVzY3JpYmUgd2hhdCBpcyBzbG93LCB3aGVuIGl0IGhhcHBlbnMsIHdoZXRoZXIgaXQncyBjb25zaXN0ZW50IG9yIGludGVybWl0dGVudCwgYW5kIGFueSBwYXR0ZXJucyB5b3UndmUgbm90aWNlZC5cIil9IGApO1xuXHRcdFx0XHRjb25zdCBsaW5rID0gJCgnYS53aXphcmQtZGVzY3JpcHRpb24tZ3VpZGFuY2UtbGluaycpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdFx0XHRsaW5rLmhyZWYgPSBwZXJmV2lraVVybDtcblx0XHRcdFx0bGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwZXJmV2lraUxpbmsnLCBcIlNlZSB0aGUgcGVyZm9ybWFuY2UgaXNzdWUgcmVwb3J0aW5nIGd1aWRlLlwiKTtcblx0XHRcdFx0dGhpcy5kZXNjcmlwdGlvbkd1aWRhbmNlRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCBFdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0aGlzLm9wZW5FeHRlcm5hbExpbms/LihwZXJmV2lraVVybCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5kZXNjcmlwdGlvbkd1aWRhbmNlLmFwcGVuZENoaWxkKGxpbmspO1xuXHRcdFx0XHRhcHBlbmRUZXh0KGBcXG4ke21hcmtkb3duSGludH1gKTtcblx0XHRcdFx0dGhpcy5kZXNjcmlwdGlvbkd1aWRhbmNlLmNsYXNzTGlzdC5hZGQoJ3dpemFyZC1kZXNjcmlwdGlvbi1ndWlkYW5jZS13aXRoLWxpbmsnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhcHBlbmRUZXh0KGAke2xvY2FsaXplKCdkZWZhdWx0R3VpZGFuY2UnLCBcIlNlbGVjdCBhIGNhdGVnb3J5IGFib3ZlLCB0aGVuIGRlc2NyaWJlIHlvdXIgZmVlZGJhY2sgaW4gZGV0YWlsLlwiKX1cXG4ke21hcmtkb3duSGludH1gKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNEZXNjcmlwdGlvbkNvbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlLnRyaW0oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlR2VuZXJhdGVUaXRsZUJ1dHRvblN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5nZW5lcmF0ZVRpdGxlQnRuIHx8IHRoaXMuZ2VuZXJhdGVUaXRsZUJ0bi5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnbG9hZGluZycpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZ2VuZXJhdGVUaXRsZUJ0bi5lbmFibGVkID0gdGhpcy5oYXNEZXNjcmlwdGlvbkNvbnRlbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRmllbGRFcnJvcihwYXJlbnQ6IEhUTUxFbGVtZW50LCBtZXNzYWdlOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgZXJyb3IgPSBhcHBlbmQocGFyZW50LCAkKCdkaXYud2l6YXJkLWZpZWxkLWVycm9yLmhpZGRlbicpKTtcblx0XHRlcnJvci50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdFx0ZXJyb3Iuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2FsZXJ0Jyk7XG5cdFx0cmV0dXJuIGVycm9yO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRGaWVsZEVycm9yKGZpZWxkOiBIVE1MRWxlbWVudCwgZXJyb3I6IEhUTUxFbGVtZW50LCBoYXNFcnJvcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGZpZWxkLmNsYXNzTGlzdC50b2dnbGUoJ2ludmFsaWQtaW5wdXQnLCBoYXNFcnJvcik7XG5cdFx0ZXJyb3IuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWhhc0Vycm9yKTtcblx0fVxuXG5cdC8vIFN0ZXAgMjogUmV2aWV3ICYgU3VibWl0XG5cdHByaXZhdGUgY3JlYXRlU3RlcDJSZXZpZXcoKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFnZSA9IGFwcGVuZCh0aGlzLnN0ZXBDb250YWluZXIsICQoJ2Rpdi53aXphcmQtc3RlcC53aXphcmQtc3RlcC1yZXZpZXcnKSk7XG5cdFx0dGhpcy5zdGVwUGFnZXMucHVzaChwYWdlKTtcblxuXHRcdGNvbnN0IGhlYWRpbmcgPSBhcHBlbmQocGFnZSwgJCgnaDIud2l6YXJkLWhlYWRpbmcnKSk7XG5cdFx0aGVhZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdyZXZpZXdTdWJtaXQnLCBcIlJldmlldyBhbmQgc3VibWl0XCIpO1xuXG5cdFx0Ly8gUmV2aWV3IGRldGFpbHMgKGZpbGxlZCBkeW5hbWljYWxseSkgd2l0aCBjb21wYWN0IGhvcml6b250YWwgbGF5b3V0XG5cdFx0YXBwZW5kKHBhZ2UsICQoJ2Rpdi53aXphcmQtcmV2aWV3LWRldGFpbHMnKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRXZlbnRIYW5kbGVycygpOiB2b2lkIHtcblx0XHQvLyBCYWNrXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5iYWNrQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5nb0JhY2soKSkpO1xuXG5cdFx0Ly8gTmV4dFxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubmV4dEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuZ29OZXh0KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgZ29CYWNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwID4gV2l6YXJkU3RlcC5BdHRhY2htZW50cykge1xuXHRcdFx0dGhpcy5zZXRTdGVwKHRoaXMuY3VycmVudFN0ZXAgLSAxKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdvTmV4dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5EZXNjcmliZSkge1xuXHRcdFx0dGhpcy5kaWRBdHRlbXB0RGVzY3JpYmVTdWJtaXQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgaGFzSXNzdWVTb3VyY2UgPSB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UgIT09IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGhhc0V4dGVuc2lvbiA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVNvdXJjZSAhPT0gSXNzdWVTb3VyY2UuRXh0ZW5zaW9uIHx8ICEhdGhpcy5zZWxlY3RlZEV4dGVuc2lvbjtcblx0XHRcdGNvbnN0IGhhc0V4dGVuc2lvbklzc3VlVXJsID0gdGhpcy5zZWxlY3RlZElzc3VlU291cmNlICE9PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gfHwgIXRoaXMuc2VsZWN0ZWRFeHRlbnNpb24gfHwgISF0aGlzLmdldFNlbGVjdGVkRXh0ZW5zaW9uSXNzdWVVcmwoKTtcblx0XHRcdGNvbnN0IGhhc0lzc3VlVHlwZSA9IHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgIT09IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGhhc0Rlc2NyaXB0aW9uID0gdGhpcy5oYXNEZXNjcmlwdGlvbkNvbnRlbnQoKTtcblx0XHRcdGNvbnN0IHRpdGxlID0gdGhpcy50aXRsZUlucHV0LnZhbHVlLnRyaW0oKTtcblxuXHRcdFx0dGhpcy5zZXRGaWVsZEVycm9yKHRoaXMuc291cmNlQnV0dG9uR3JvdXAsIHRoaXMuc291cmNlRXJyb3IsICFoYXNJc3N1ZVNvdXJjZSk7XG5cdFx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy5leHRlbnNpb25GaWVsZCwgdGhpcy5leHRlbnNpb25FcnJvciwgIWhhc0V4dGVuc2lvbiB8fCAhaGFzRXh0ZW5zaW9uSXNzdWVVcmwpO1xuXHRcdFx0dGhpcy5zZXRGaWVsZEVycm9yKHRoaXMudHlwZUJ1dHRvbkdyb3VwLCB0aGlzLnR5cGVFcnJvciwgIWhhc0lzc3VlVHlwZSk7XG5cdFx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLCB0aGlzLmRlc2NyaXB0aW9uRXJyb3IsICFoYXNEZXNjcmlwdGlvbik7XG5cdFx0XHR0aGlzLnNldEZpZWxkRXJyb3IodGhpcy50aXRsZUlucHV0LmVsZW1lbnQsIHRoaXMudGl0bGVFcnJvciwgIXRpdGxlKTtcblxuXHRcdFx0aWYgKCFoYXNJc3N1ZVNvdXJjZSB8fCAhaGFzRXh0ZW5zaW9uIHx8ICFoYXNFeHRlbnNpb25Jc3N1ZVVybCB8fCAhaGFzSXNzdWVUeXBlIHx8ICFoYXNEZXNjcmlwdGlvbiB8fCAhdGl0bGUpIHtcblx0XHRcdFx0aWYgKCFoYXNJc3N1ZVNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMuaXNzdWVTb3VyY2VCdXR0b25zLmZpbmQoYnV0dG9uID0+ICFidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpKT8uZWxlbWVudC5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFoYXNFeHRlbnNpb24gfHwgIWhhc0V4dGVuc2lvbklzc3VlVXJsKSB7XG5cdFx0XHRcdFx0dGhpcy5leHRlbnNpb25TZWxlY3QuZm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIGlmICghaGFzSXNzdWVUeXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5pc3N1ZVR5cGVCdXR0b25zWzBdPy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWhhc0Rlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy50aXRsZUlucHV0LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk7XG5cdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7IGlzc3VlRGVzY3JpcHRpb246IHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZS50cmltKCkgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHQvLyBEZWZlbnNpdmU6IGlmIHVzZXIgbWFuYWdlZCB0byBpbnZva2UgZ29OZXh0IHdoaWxlIGRpYWdub3N0aWNzIGFyZVxuXHRcdFx0Ly8gc3RpbGwgbG9hZGluZyAoZS5nLiB2aWEgQ21kL0N0cmwrRW50ZXIpLCBibG9jayB0aGUgc3VibWl0LiBUaGVcblx0XHRcdC8vIFByZXZpZXcgYnV0dG9uIGlzIGFsc28gdmlzdWFsbHkgZGlzYWJsZWQgaW4gdGhpcyBzdGF0ZS5cblx0XHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSAmJiAoIXRoaXMucGVyZm9ybWFuY2VJbmZvTG9hZGVkIHx8IHRoaXMucGVyZm9ybWFuY2VJbmZvUmVmcmVzaGluZykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zdWJtaXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCA8IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHR0aGlzLnNldFN0ZXAodGhpcy5jdXJyZW50U3RlcCArIDEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0U3RlcChzdGVwOiBXaXphcmRTdGVwKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkU3RlcCA9IHRoaXMuY3VycmVudFN0ZXA7XG5cdFx0dGhpcy5jdXJyZW50U3RlcCA9IHN0ZXA7XG5cblx0XHRjb25zdCBvbGRQYWdlID0gdGhpcy5zdGVwUGFnZXNbb2xkU3RlcF07XG5cdFx0Y29uc3QgbmV3UGFnZSA9IHRoaXMuc3RlcFBhZ2VzW3N0ZXBdO1xuXG5cdFx0Ly8gSW1tZWRpYXRlIHRyYW5zaXRpb24gd2l0aCBubyBhbmltYXRpb25cblx0XHRvbGRQYWdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0bmV3UGFnZS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXG5cdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblxuXHRcdGlmIChzdGVwID09PSBXaXphcmRTdGVwLkRlc2NyaWJlKSB7XG5cdFx0XHR0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEuZm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVJldmlld0RldGFpbHMoKTtcblx0XHRcdHRoaXMuc2VhcmNoU2ltaWxhcklzc3VlcygpO1xuXHRcdFx0dGhpcy53aXphcmRQYW5lbC5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBBdHRhY2htZW50czogZm9jdXMgdGhlIHBhbmVsIHNvIGtleWJvYXJkIHNob3J0Y3V0cyB3b3JrXG5cdFx0XHR0aGlzLndpemFyZFBhbmVsLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGVwVUkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RlcE51bSA9IHRoaXMuY3VycmVudFN0ZXAgKyAxO1xuXHRcdHRoaXMuc3RlcEluZGljYXRvci50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzdGVwT2YnLCBcIlN0ZXAgezB9IG9mIHsxfVwiLCBzdGVwTnVtLCBTVEVQX0NPVU5UKTtcblxuXHRcdGNvbnN0IHN0ZXBOYW1lcyA9IFtcblx0XHRcdGxvY2FsaXplKCdzY3JlZW5zaG90cycsIFwiQXR0YWNobWVudHNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29tcG9zZU1lc3NhZ2UnLCBcIkRlc2NyaWJlXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3N1Ym1pdCcsIFwiUmV2aWV3XCIpLFxuXHRcdF07XG5cdFx0dGhpcy5zdGVwTGFiZWwudGV4dENvbnRlbnQgPSBzdGVwTmFtZXNbdGhpcy5jdXJyZW50U3RlcF07XG5cblx0XHQvLyBVcGRhdGUgcHJvZ3Jlc3MgZG90c1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5wcm9ncmVzc0RvdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMucHJvZ3Jlc3NEb3RzW2ldLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGkgPT09IHRoaXMuY3VycmVudFN0ZXApO1xuXHRcdFx0dGhpcy5wcm9ncmVzc0RvdHNbaV0uY2xhc3NMaXN0LnRvZ2dsZSgnY29tcGxldGVkJywgaSA8IHRoaXMuY3VycmVudFN0ZXApO1xuXHRcdH1cblxuXHRcdC8vIFNob3cvaGlkZSBwYWdlc1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zdGVwUGFnZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpID09PSB0aGlzLmN1cnJlbnRTdGVwKSB7XG5cdFx0XHRcdHRoaXMuc3RlcFBhZ2VzW2ldLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0XHR9IGVsc2UgaWYgKCF0aGlzLnN0ZXBQYWdlc1tpXS5jbGFzc0xpc3QuY29udGFpbnMoJ3NsaWRlLW91dC1sZWZ0JykgJiYgIXRoaXMuc3RlcFBhZ2VzW2ldLmNsYXNzTGlzdC5jb250YWlucygnc2xpZGUtb3V0LXJpZ2h0JykpIHtcblx0XHRcdFx0dGhpcy5zdGVwUGFnZXNbaV0uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBCYWNrIGJ1dHRvbiB2aXNpYmlsaXR5XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuQXR0YWNobWVudHMgPyAnbm9uZScgOiAnJztcblx0XHRpZiAodGhpcy5jbG9zZUJ1dHRvbikge1xuXHRcdFx0Y29uc3QgY3VycmVudERyYWZ0UHJldmlld2VkID0gdGhpcy5wcmV2aWV3ZWREcmFmdEtleSA9PT0gdGhpcy5nZXREcmFmdEtleSgpO1xuXHRcdFx0dGhpcy5jbG9zZUJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSB0aGlzLnByZXZpZXdPcGVuZWQgJiYgY3VycmVudERyYWZ0UHJldmlld2VkICYmIHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3ID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gTmV4dCBidXR0b24gbGFiZWxcblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCA9PT0gV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdGNvbnN0IGV4dGVybmFsRXh0ZW5zaW9uVXJsID0gdGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gJiYgdGhpcy5nZXRJc3N1ZVRhcmdldFVybCgpICYmICF0aGlzLmlzR2l0SHViVXJsKHRoaXMuZ2V0SXNzdWVUYXJnZXRVcmwoKSEpO1xuXHRcdFx0Y29uc3Qgd2FpdGluZ0ZvckRhdGEgPSB0aGlzLnNlbGVjdGVkSXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSAmJiAoIXRoaXMucGVyZm9ybWFuY2VJbmZvTG9hZGVkIHx8IHRoaXMucGVyZm9ybWFuY2VJbmZvUmVmcmVzaGluZyk7XG5cdFx0XHRpZiAod2FpdGluZ0ZvckRhdGEpIHtcblx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmxhYmVsID0gYCQobG9hZGluZ35zcGluKSAke2xvY2FsaXplKCdsb2FkaW5nRGlhZ25vc3RpY3MnLCBcIkxvYWRpbmcgZGlhZ25vc3RpY3MuLi5cIil9YDtcblx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQudGl0bGUgPSBsb2NhbGl6ZSgnd2FpdGluZ0ZvckRpYWdub3N0aWNzJywgXCJXYWl0aW5nIGZvciBwZXJmb3JtYW5jZSBkaWFnbm9zdGljcyB0byBmaW5pc2ggbG9hZGluZ1wiKTtcblx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi5sYWJlbCA9IGV4dGVybmFsRXh0ZW5zaW9uVXJsXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnb3BlbkV4dGVybmFsSXNzdWVSZXBvcnRlcicsIFwiT3BlbiBFeHRlcm5hbCBJc3N1ZSBSZXBvcnRlclwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ3ByZXZpZXdPbkdpdEh1YicsIFwiUHJldmlldyBvbiBHaXRIdWJcIik7XG5cdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi5lbGVtZW50LnRpdGxlID0gdGhpcy5uZXh0QnV0dG9uLmxhYmVsO1xuXHRcdFx0XHR0aGlzLm5leHRCdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGVwID09PSBXaXphcmRTdGVwLkF0dGFjaG1lbnRzKSB7XG5cdFx0XHR0aGlzLm5leHRCdXR0b24ubGFiZWwgPSB0aGlzLmdldFRvdGFsQXR0YWNobWVudHMoKSA9PT0gMFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdza2lwJywgXCJTa2lwXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ25leHQnLCBcIk5leHRcIik7XG5cdFx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC50aXRsZSA9IHRoaXMubmV4dEJ1dHRvbi5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5uZXh0QnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ25leHQnLCBcIk5leHRcIik7XG5cdFx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC50aXRsZSA9IGxvY2FsaXplKCduZXh0JywgXCJOZXh0XCIpO1xuXHRcdH1cblxuXHRcdC8vIFNob3cvaGlkZSBjYXB0dXJlIHN0cmlwIChvbmx5IG9uIGF0dGFjaG1lbnRzIHN0ZXApXG5cdFx0dGhpcy51cGRhdGVDYXB0dXJlU3RyaXBWaXNpYmlsaXR5KCk7XG5cdFx0Ly8gUmVmbGVjdCByZWNvcmRpbmcgc3RhdGUgb24gbmV4dCBidXR0b25cblx0XHR0aGlzLnVwZGF0ZU5leHRCdXR0b25Gb3JSZWNvcmRpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmV2aWV3RGV0YWlscygpOiB2b2lkIHtcblx0XHRjb25zdCBwYWdlID0gdGhpcy5zdGVwUGFnZXNbV2l6YXJkU3RlcC5SZXZpZXddO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGRldGFpbHMgPSBwYWdlLnF1ZXJ5U2VsZWN0b3IoJy53aXphcmQtcmV2aWV3LWRldGFpbHMnKTtcblx0XHRpZiAoIWRldGFpbHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZXZpZXdSZW5kZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGRldGFpbHMudGV4dENvbnRlbnQgPSAnJztcblxuXHRcdGNvbnN0IHNpbWlsYXJTZWN0aW9uID0gYXBwZW5kKGRldGFpbHMgYXMgSFRNTEVsZW1lbnQsICQoJ2Rpdi5yZXZpZXctc2VjdGlvbi53aXphcmQtcmV2aWV3LXNpbWlsYXItc2VjdGlvbicpKTtcblx0XHR0aGlzLnNpbWlsYXJJc3N1ZXNDb250YWluZXIgPSBhcHBlbmQoc2ltaWxhclNlY3Rpb24sICQoJ2Rpdi53aXphcmQtc2ltaWxhci1pc3N1ZXMnKSk7XG5cdFx0dGhpcy5zaW1pbGFySXNzdWVzQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1saXZlJywgJ3BvbGl0ZScpO1xuXHRcdHRoaXMucmVuZGVyU2ltaWxhcklzc3Vlc01lc3NhZ2UobG9jYWxpemUoJ3NlYXJjaGluZ1NpbWlsYXJJc3N1ZXMnLCBcIlNlYXJjaGluZyBzaW1pbGFyIGlzc3Vlcy4uLlwiKSk7XG5cblx0XHRjb25zdCBzb3VyY2VTZWN0aW9uID0gYXBwZW5kKGRldGFpbHMgYXMgSFRNTEVsZW1lbnQsICQoJ2Rpdi5yZXZpZXctc2VjdGlvbicpKTtcblx0XHRjb25zdCBzb3VyY2VMYWJlbCA9IGFwcGVuZChzb3VyY2VTZWN0aW9uLCAkKCdkaXYucmV2aWV3LWxhYmVsJykpO1xuXHRcdHNvdXJjZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RhcmdldCcsIFwiVGFyZ2V0XCIpO1xuXHRcdGNvbnN0IHNvdXJjZVZhbHVlID0gYXBwZW5kKHNvdXJjZVNlY3Rpb24sICQoJ2Rpdi5yZXZpZXctdmFsdWUnKSk7XG5cdFx0c291cmNlVmFsdWUudGV4dENvbnRlbnQgPSB0aGlzLmdldElzc3VlU291cmNlTGFiZWwoKTtcblxuXHRcdGNvbnN0IGNhdFNlY3Rpb24gPSBhcHBlbmQoZGV0YWlscyBhcyBIVE1MRWxlbWVudCwgJCgnZGl2LnJldmlldy1zZWN0aW9uJykpO1xuXHRcdGNvbnN0IGNhdExhYmVsID0gYXBwZW5kKGNhdFNlY3Rpb24sICQoJ2Rpdi5yZXZpZXctbGFiZWwnKSk7XG5cdFx0Y2F0TGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2F0ZWdvcnknLCBcIkNhdGVnb3J5XCIpO1xuXHRcdGNvbnN0IGNhdFZhbHVlID0gYXBwZW5kKGNhdFNlY3Rpb24sICQoJ2Rpdi5yZXZpZXctdmFsdWUnKSk7XG5cdFx0Y29uc3QgdHlwZUxhYmVsczogUmVjb3JkPG51bWJlciwgc3RyaW5nPiA9IHtcblx0XHRcdFtJc3N1ZVR5cGUuQnVnXTogbG9jYWxpemUoJ2J1ZycsIFwiQnVnXCIpLFxuXHRcdFx0W0lzc3VlVHlwZS5GZWF0dXJlUmVxdWVzdF06IGxvY2FsaXplKCdmZWF0dXJlUmVxdWVzdCcsIFwiRmVhdHVyZSBSZXF1ZXN0XCIpLFxuXHRcdFx0W0lzc3VlVHlwZS5QZXJmb3JtYW5jZUlzc3VlXTogbG9jYWxpemUoJ3BlcmZvcm1hbmNlSXNzdWUnLCBcIlBlcmZvcm1hbmNlIElzc3VlXCIpLFxuXHRcdH07XG5cdFx0Y2F0VmFsdWUudGV4dENvbnRlbnQgPSAodGhpcy5zZWxlY3RlZElzc3VlVHlwZSAhPT0gdW5kZWZpbmVkID8gdHlwZUxhYmVsc1t0aGlzLnNlbGVjdGVkSXNzdWVUeXBlXSA6IHVuZGVmaW5lZCkgPz8gbG9jYWxpemUoJ3Vua25vd24nLCBcIlVua25vd25cIik7XG5cblx0XHRjb25zdCB0aXRsZVNlY3Rpb24gPSBhcHBlbmQoZGV0YWlscyBhcyBIVE1MRWxlbWVudCwgJCgnZGl2LnJldmlldy1zZWN0aW9uJykpO1xuXHRcdGNvbnN0IHRpdGxlTGFiZWwgPSBhcHBlbmQodGl0bGVTZWN0aW9uLCAkKCdkaXYucmV2aWV3LWxhYmVsJykpO1xuXHRcdHRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnaXNzdWVUaXRsZScsIFwiVGl0bGVcIik7XG5cdFx0Y29uc3QgdGl0bGVWYWx1ZSA9IGFwcGVuZCh0aXRsZVNlY3Rpb24sICQoJ2Rpdi5yZXZpZXctdmFsdWUnKSk7XG5cdFx0dGl0bGVWYWx1ZS50ZXh0Q29udGVudCA9IHRoaXMudGl0bGVJbnB1dC52YWx1ZS50cmltKCkgfHwgbG9jYWxpemUoJ25vVGl0bGUnLCBcIihubyB0aXRsZSlcIik7XG5cblx0XHRjb25zdCBkZXNjU2VjdGlvbiA9IGFwcGVuZChkZXRhaWxzIGFzIEhUTUxFbGVtZW50LCAkKCdkaXYucmV2aWV3LXNlY3Rpb24nKSk7XG5cdFx0Y29uc3QgZGVzY0xhYmVsID0gYXBwZW5kKGRlc2NTZWN0aW9uLCAkKCdkaXYucmV2aWV3LWxhYmVsJykpO1xuXHRcdGRlc2NMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdkZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb25cIik7XG5cdFx0Y29uc3QgZGVzY1ZhbHVlID0gYXBwZW5kKGRlc2NTZWN0aW9uLCAkKCdkaXYucmV2aWV3LXZhbHVlLnJldmlldy1kZXNjcmlwdGlvbicpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuZGVzY3JpcHRpb25UZXh0YXJlYS52YWx1ZS50cmltKCk7XG5cdFx0aWYgKGRlc2NyaXB0aW9uICYmIHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd24gPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihcblx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKGRlc2NyaXB0aW9uKSxcblx0XHRcdFx0eyBtYXJrZWRPcHRpb25zOiB7IGJyZWFrczogdHJ1ZSB9IH0sXG5cdFx0XHQpO1xuXHRcdFx0YXBwZW5kKGRlc2NWYWx1ZSwgcmVuZGVyZWRNYXJrZG93bi5lbGVtZW50KTtcblx0XHRcdHRoaXMucmV2aWV3UmVuZGVyRGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkTWFya2Rvd24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZXNjVmFsdWUudGV4dENvbnRlbnQgPSBkZXNjcmlwdGlvbiB8fCBsb2NhbGl6ZSgnbm9EZXNjcmlwdGlvbicsIFwiKG5vIGRlc2NyaXB0aW9uKVwiKTtcblx0XHR9XG5cblx0XHQvLyBBdHRhY2htZW50cyByb3cgd2l0aCBmdWxsLXNpemUgY2xpY2thYmxlIHRodW1ibmFpbHNcblx0XHRjb25zdCB0b3RhbEF0dGFjaG1lbnRzID0gdGhpcy5zY3JlZW5zaG90cy5sZW5ndGggKyB0aGlzLnJlY29yZGluZ3MubGVuZ3RoO1xuXHRcdGlmICh0b3RhbEF0dGFjaG1lbnRzID4gMCkge1xuXHRcdFx0Y29uc3QgYXR0YWNoU2VjdGlvbiA9IGFwcGVuZChkZXRhaWxzIGFzIEhUTUxFbGVtZW50LCAkKCdkaXYucmV2aWV3LXNlY3Rpb24nKSk7XG5cdFx0XHRjb25zdCBhdHRhY2hMYWJlbCA9IGFwcGVuZChhdHRhY2hTZWN0aW9uLCAkKCdkaXYucmV2aWV3LWxhYmVsJykpO1xuXHRcdFx0YXR0YWNoTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYXR0YWNobWVudHMnLCBcIkF0dGFjaG1lbnRzICh7MH0pXCIsIHRvdGFsQXR0YWNobWVudHMpO1xuXHRcdFx0Y29uc3QgdGh1bWJSb3cgPSBhcHBlbmQoYXR0YWNoU2VjdGlvbiwgJCgnZGl2LnJldmlldy10aHVtYm5haWxzJykpO1xuXHRcdFx0dGhpcy5yZXZpZXdUaHVtYkNhcmRzID0gW107XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5zY3JlZW5zaG90cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBzID0gdGhpcy5zY3JlZW5zaG90c1tpXTtcblx0XHRcdFx0Y29uc3QgY2FyZCA9IGFwcGVuZCh0aHVtYlJvdywgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90LWNhcmQucmV2aWV3LWF0dGFjaG1lbnQtY2FyZCcpKTtcblx0XHRcdFx0Y29uc3QgaW1nID0gYXBwZW5kKGNhcmQsICQoJ2ltZycpKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdFx0XHRpbWcuc3JjID0gcy5hbm5vdGF0ZWREYXRhVXJsID8/IHMuZGF0YVVybDtcblx0XHRcdFx0aW1nLmFsdCA9IGxvY2FsaXplKCdzY3JlZW5zaG90QWx0JywgXCJTY3JlZW5zaG90IHswfVwiLCBpICsgMSk7XG5cblx0XHRcdFx0Ly8gUHJvZ3Jlc3Mgb3ZlcmxheSAoaGlkZGVuIGluaXRpYWxseSlcblx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3NPdmVybGF5ID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi5yZXZpZXctcHJvZ3Jlc3Mtb3ZlcmxheScpKTtcblx0XHRcdFx0YXBwZW5kKHByb2dyZXNzT3ZlcmxheSwgJCgnZGl2LnJldmlldy1wcm9ncmVzcy1yaW5nJykpO1xuXG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMudXBsb2FkaW5nKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RPcGVuU2NyZWVuc2hvdC5maXJlKHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLnJldmlld1RodW1iQ2FyZHMucHVzaChjYXJkKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnJlY29yZGluZ3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgcmVjID0gdGhpcy5yZWNvcmRpbmdzW2ldO1xuXHRcdFx0XHRjb25zdCBjYXJkID0gdGhpcy5yZW5kZXJSZWNvcmRpbmdDYXJkKHRodW1iUm93LCByZWMsIGkpO1xuXHRcdFx0XHRjYXJkLmNsYXNzTGlzdC5hZGQoJ3Jldmlldy1hdHRhY2htZW50LWNhcmQnKTtcblxuXHRcdFx0XHRjb25zdCBwcm9ncmVzc092ZXJsYXkgPSBhcHBlbmQoY2FyZCwgJCgnZGl2LnJldmlldy1wcm9ncmVzcy1vdmVybGF5JykpO1xuXHRcdFx0XHRhcHBlbmQocHJvZ3Jlc3NPdmVybGF5LCAkKCdkaXYucmV2aWV3LXByb2dyZXNzLXJpbmcnKSk7XG5cblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy51cGxvYWRpbmcpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdE9wZW5SZWNvcmRpbmcuZmlyZShyZWMuZmlsZVBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLnJldmlld1RodW1iQ2FyZHMucHVzaChjYXJkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEaWFnbm9zdGljIGRhdGEgc2VjdGlvbnMgd2l0aCBjaGVja2JveGVzIGFuZCBjb2xsYXBzaWJsZSBkZXRhaWxzXG5cdFx0Y29uc3QgZGlhZ0NvbnRhaW5lciA9IGFwcGVuZChkZXRhaWxzIGFzIEhUTUxFbGVtZW50LCAkKCdkaXYucmV2aWV3LWRpYWdub3N0aWNzJykpO1xuXG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5tb2RlbC5nZXREYXRhKCk7XG5cdFx0bGV0IGRpYWdub3N0aWNTZWN0aW9uQ291bnQgPSAwO1xuXG5cdFx0Ly8gU3lzdGVtIEluZm9cblx0XHRpZiAobW9kZWxEYXRhLnZlcnNpb25JbmZvIHx8IG1vZGVsRGF0YS5zeXN0ZW1JbmZvKSB7XG5cdFx0XHRkaWFnbm9zdGljU2VjdGlvbkNvdW50Kys7XG5cdFx0XHR0aGlzLmNyZWF0ZURpYWdTZWN0aW9uKGRpYWdDb250YWluZXIsIHtcblx0XHRcdFx0aWQ6ICdzeXN0ZW0taW5mbycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc3lzdGVtSW5mb3JtYXRpb24nLCBcIlN5c3RlbSBJbmZvcm1hdGlvblwiKSxcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5pbmNsdWRlU3lzdGVtSW5mbyxcblx0XHRcdFx0b25Ub2dnbGU6IChjaGVja2VkKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5pbmNsdWRlU3lzdGVtSW5mbyA9IGNoZWNrZWQ7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbC51cGRhdGUoeyBpbmNsdWRlU3lzdGVtSW5mbzogY2hlY2tlZCB9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVuZGVyQ29udGVudDogKGNvbnRhaW5lcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHN5c1RhYmxlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgndGFibGUucmV2aWV3LWRpYWctdGFibGUnKSk7XG5cdFx0XHRcdFx0aWYgKG1vZGVsRGF0YS52ZXJzaW9uSW5mbykge1xuXHRcdFx0XHRcdFx0dGhpcy5hZGREaWFnUm93KHN5c1RhYmxlLCAnVlMgQ29kZScsIG1vZGVsRGF0YS52ZXJzaW9uSW5mby52c2NvZGVWZXJzaW9uKTtcblx0XHRcdFx0XHRcdHRoaXMuYWRkRGlhZ1JvdyhzeXNUYWJsZSwgJ09TJywgbW9kZWxEYXRhLnZlcnNpb25JbmZvLm9zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1vZGVsRGF0YS5zeXN0ZW1JbmZvKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZERpYWdSb3coc3lzVGFibGUsICdDUFVzJywgbW9kZWxEYXRhLnN5c3RlbUluZm8uY3B1cyA/PyAnJyk7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZERpYWdSb3coc3lzVGFibGUsICdNZW1vcnknLCBtb2RlbERhdGEuc3lzdGVtSW5mby5tZW1vcnkpO1xuXHRcdFx0XHRcdFx0dGhpcy5hZGREaWFnUm93KHN5c1RhYmxlLCAnVk0nLCBtb2RlbERhdGEuc3lzdGVtSW5mby52bUhpbnQpO1xuXHRcdFx0XHRcdFx0dGhpcy5hZGREaWFnUm93KHN5c1RhYmxlLCAnU2NyZWVuIFJlYWRlcicsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLnNjcmVlblJlYWRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuYWRkRGlhZ1JvdyhzeXNUYWJsZSwgJ1VzZXIgQWdlbnQnLCBuYXZpZ2F0b3IudXNlckFnZW50KTtcblx0XHRcdFx0XHR0aGlzLmFkZERpYWdSb3coc3lzVGFibGUsICdJbnN0YWxsYXRpb24gcHVyZScsIFN0cmluZyhtb2RlbERhdGEuaXNJbnN0YWxsYXRpb25QdXJlID8/IHRydWUpKTtcblx0XHRcdFx0XHRpZiAobW9kZWxEYXRhLnJlc3RyaWN0ZWRNb2RlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZERpYWdSb3coc3lzVGFibGUsICdNb2RlJywgJ1Jlc3RyaWN0ZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbG9hZGluZyA9IGFwcGVuZChkaWFnQ29udGFpbmVyLCAkKCdkaXYucmV2aWV3LWRpYWctbG9hZGluZycpKTtcblx0XHRcdGxvYWRpbmcudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbG9hZGluZ1N5c3RlbUluZm8nLCBcIkxvYWRpbmcgc3lzdGVtIGluZm9ybWF0aW9uLi4uXCIpO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbERhdGEuZXh0ZW5zaW9uRGF0YSkge1xuXHRcdFx0Ly8gTWF0Y2ggYGJ1aWxkSXNzdWVCb2R5YCwgd2hpY2ggb25seSBnYXRlcyBvbiBgZXh0ZW5zaW9uRGF0YWAuIEdhdGluZ1xuXHRcdFx0Ly8gaGVyZSBvbiBgZmlsZU9uRXh0ZW5zaW9uYCBhcyB3ZWxsIHdvdWxkIGhpZGUgdGhlIHNlY3Rpb24gaW4gdGhlXG5cdFx0XHQvLyByZXZpZXcgVUkgd2hlbmV2ZXIgdGhlIGlzc3VlIHNvdXJjZSB3YXMgYXV0by1zd2l0Y2hlZCBhd2F5IGZyb21cblx0XHRcdC8vIEV4dGVuc2lvbiAoZS5nLiBidWlsdC1pbiBleHRlbnNpb25zIGFyZSBmaWxlZCBhZ2FpbnN0IFZTIENvZGUpLFxuXHRcdFx0Ly8gZXZlbiB0aG91Z2ggdGhlIGV4dGVuc2lvbiBkYXRhIHN0aWxsIGVuZHMgdXAgaW4gdGhlIHN1Ym1pdHRlZCBib2R5LlxuXHRcdFx0ZGlhZ25vc3RpY1NlY3Rpb25Db3VudCsrO1xuXHRcdFx0dGhpcy5jcmVhdGVEaWFnU2VjdGlvbihkaWFnQ29udGFpbmVyLCB7XG5cdFx0XHRcdGlkOiAnZXh0ZW5zaW9uLWRhdGEnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2V4dGVuc2lvbkRhdGEnLCBcIkV4dGVuc2lvbiBEYXRhXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhLFxuXHRcdFx0XHRvblRvZ2dsZTogKGNoZWNrZWQpID0+IHtcblx0XHRcdFx0XHR0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhID0gY2hlY2tlZDtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7IGluY2x1ZGVFeHRlbnNpb25EYXRhOiBjaGVja2VkIH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW5kZXJDb250ZW50OiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgncHJlLnJldmlldy1kaWFnLXByZScpKTtcblx0XHRcdFx0XHRwcmUudGV4dENvbnRlbnQgPSBtb2RlbERhdGEuZXh0ZW5zaW9uRGF0YSE7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBFeHRlbnNpb25zIChub24tdGhlbWUgb25seSlcblx0XHRjb25zdCBub25UaGVtZUV4dGVuc2lvbnMgPSAobW9kZWxEYXRhLmFsbEV4dGVuc2lvbnMgPz8gW10pLmZpbHRlcihlID0+ICFlLmlzVGhlbWUgJiYgIWUuaXNCdWlsdGluKTtcblx0XHRpZiAoIW1vZGVsRGF0YS5maWxlT25FeHRlbnNpb24gJiYgIW1vZGVsRGF0YS5maWxlT25NYXJrZXRwbGFjZSAmJiBub25UaGVtZUV4dGVuc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0ZGlhZ25vc3RpY1NlY3Rpb25Db3VudCsrO1xuXHRcdFx0dGhpcy5jcmVhdGVEaWFnU2VjdGlvbihkaWFnQ29udGFpbmVyLCB7XG5cdFx0XHRcdGlkOiAnZXh0ZW5zaW9ucycsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9ucyAoezB9KVwiLCBub25UaGVtZUV4dGVuc2lvbnMubGVuZ3RoKSxcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5pbmNsdWRlRXh0ZW5zaW9ucyxcblx0XHRcdFx0b25Ub2dnbGU6IChjaGVja2VkKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5pbmNsdWRlRXh0ZW5zaW9ucyA9IGNoZWNrZWQ7XG5cdFx0XHRcdFx0dGhpcy5tb2RlbC51cGRhdGUoeyBpbmNsdWRlRXh0ZW5zaW9uczogY2hlY2tlZCB9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVuZGVyQ29udGVudDogKGNvbnRhaW5lcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV4dFRhYmxlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgndGFibGUucmV2aWV3LWRpYWctdGFibGUucmV2aWV3LWV4dC10YWJsZScpKTtcblx0XHRcdFx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQoZXh0VGFibGUsICQoJ3RyJykpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgaCBvZiBbJ05hbWUnLCAnSWRlbnRpZmllcicsICdBdXRob3InLCAnVmVyc2lvbiddKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0aCA9IGFwcGVuZChoZWFkZXIsICQoJ3RoLnJldmlldy1leHQtdGgnKSk7XG5cdFx0XHRcdFx0XHR0aC50ZXh0Q29udGVudCA9IGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZXh0IG9mIG5vblRoZW1lRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgcm93ID0gYXBwZW5kKGV4dFRhYmxlLCAkKCd0cicpKTtcblx0XHRcdFx0XHRcdGFwcGVuZChyb3csICQoJ3RkJykpLnRleHRDb250ZW50ID0gZXh0LmRpc3BsYXlOYW1lIHx8IGV4dC5uYW1lO1xuXHRcdFx0XHRcdFx0YXBwZW5kKHJvdywgJCgndGQnKSkudGV4dENvbnRlbnQgPSBleHQuaWQ7XG5cdFx0XHRcdFx0XHRhcHBlbmQocm93LCAkKCd0ZCcpKS50ZXh0Q29udGVudCA9IGV4dC5wdWJsaXNoZXIgPz8gJyc7XG5cdFx0XHRcdFx0XHRhcHBlbmQocm93LCAkKCd0ZCcpKS50ZXh0Q29udGVudCA9IGV4dC52ZXJzaW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEV4cGVyaW1lbnRzXG5cdFx0aWYgKG1vZGVsRGF0YS5leHBlcmltZW50SW5mbykge1xuXHRcdFx0ZGlhZ25vc3RpY1NlY3Rpb25Db3VudCsrO1xuXHRcdFx0dGhpcy5jcmVhdGVEaWFnU2VjdGlvbihkaWFnQ29udGFpbmVyLCB7XG5cdFx0XHRcdGlkOiAnZXhwZXJpbWVudHMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FiRXhwZXJpbWVudHMnLCBcIkEvQiBFeHBlcmltZW50c1wiKSxcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5pbmNsdWRlRXhwZXJpbWVudHMsXG5cdFx0XHRcdG9uVG9nZ2xlOiAoY2hlY2tlZCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuaW5jbHVkZUV4cGVyaW1lbnRzID0gY2hlY2tlZDtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZSh7IGluY2x1ZGVFeHBlcmltZW50czogY2hlY2tlZCB9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVuZGVyQ29udGVudDogKGNvbnRhaW5lcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByZSA9IGFwcGVuZChjb250YWluZXIsICQoJ3ByZS5yZXZpZXctZGlhZy1wcmUnKSk7XG5cdFx0XHRcdFx0cHJlLnRleHRDb250ZW50ID0gbW9kZWxEYXRhLmV4cGVyaW1lbnRJbmZvITtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSAmJiAhbW9kZWxEYXRhLmZpbGVPbk1hcmtldHBsYWNlKSB7XG5cdFx0XHRjb25zdCBwZXJmb3JtYW5jZUNvbnRhaW5lciA9IGFwcGVuZChkaWFnQ29udGFpbmVyLCAkKCdkaXYucmV2aWV3LXBlcmZvcm1hbmNlLWRhdGEnKSk7XG5cdFx0XHRpZiAodGhpcy5wZXJmb3JtYW5jZUluZm9SZWZyZXNoaW5nKSB7XG5cdFx0XHRcdHBlcmZvcm1hbmNlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3JlZnJlc2hpbmcnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBlcmZvcm1hbmNlVGl0bGVSb3cgPSBhcHBlbmQocGVyZm9ybWFuY2VDb250YWluZXIsICQoJ2Rpdi5yZXZpZXctcGVyZm9ybWFuY2UtdGl0bGUtcm93JykpO1xuXHRcdFx0Y29uc3QgcGVyZm9ybWFuY2VUaXRsZSA9IGFwcGVuZChwZXJmb3JtYW5jZVRpdGxlUm93LCAkKCdkaXYucmV2aWV3LXBlcmZvcm1hbmNlLXRpdGxlJykpO1xuXHRcdFx0cGVyZm9ybWFuY2VUaXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZGRpdGlvbmFsUGVyZm9ybWFuY2VEYXRhJywgXCJBZGRpdGlvbmFsIFBlcmZvcm1hbmNlIERhdGFcIik7XG5cdFx0XHRpZiAodGhpcy5yZWZyZXNoUGVyZm9ybWFuY2VJbmZvKSB7XG5cdFx0XHRcdGNvbnN0IHJlZnJlc2hCdG4gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHBlcmZvcm1hbmNlVGl0bGVSb3csIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdFx0XHRyZWZyZXNoQnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgncmV2aWV3LXBlcmZvcm1hbmNlLXJlZnJlc2gnKTtcblx0XHRcdFx0cmVmcmVzaEJ0bi5sYWJlbCA9IGAkKHJlZnJlc2gpICR7bG9jYWxpemUoJ3JlZnJlc2gnLCBcIlJlZnJlc2hcIil9YDtcblx0XHRcdFx0cmVmcmVzaEJ0bi5lbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ3JlZnJlc2hQZXJmb3JtYW5jZURhdGEnLCBcIlJlbG9hZCBydW5uaW5nIHByb2Nlc3NlcyBhbmQgd29ya3NwYWNlIG1ldGFkYXRhXCIpO1xuXHRcdFx0XHRyZWZyZXNoQnRuLmVuYWJsZWQgPSAhdGhpcy5wZXJmb3JtYW5jZUluZm9SZWZyZXNoaW5nO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChyZWZyZXNoQnRuLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5yZWZyZXNoUGVyZm9ybWFuY2VJbmZvIHx8IHRoaXMucGVyZm9ybWFuY2VJbmZvUmVmcmVzaGluZykge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLnBlcmZvcm1hbmNlSW5mb1JlZnJlc2hpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdHJlZnJlc2hCdG4uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHBlcmZvcm1hbmNlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3JlZnJlc2hpbmcnKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2hQZXJmb3JtYW5jZUluZm8oKTtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0dGhpcy5wZXJmb3JtYW5jZUluZm9SZWZyZXNoaW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0XHQvLyB1cGRhdGVNb2RlbCBpbnNpZGUgcmVmcmVzaFBlcmZvcm1hbmNlSW5mbyBhbHJlYWR5IHJlLXJlbmRlcnMgdGhlXG5cdFx0XHRcdFx0XHQvLyByZXZpZXcgc3RlcCwgc28gdGhlIHByZXZpb3VzIHBlcmZvcm1hbmNlQ29udGFpbmVyL3JlZnJlc2hCdG4gbWF5XG5cdFx0XHRcdFx0XHQvLyBiZSBzdGFsZSBieSBub3cuIFJlLXJlbmRlcmluZyBvbmNlIG1vcmUgaGVyZSBlbnN1cmVzIHRoZVxuXHRcdFx0XHRcdFx0Ly8gXCJyZWZyZXNoaW5nXCIgY2xhc3MgaXMgY2xlYXJlZCBhbmQgdGhlIGJ1dHRvbiBpcyByZS1lbmFibGVkIGV2ZW5cblx0XHRcdFx0XHRcdC8vIGlmIHRoZSBtb2RlbCBkaWRuJ3QgdXBkYXRlIChlLmcuIGVycm9yIHBhdGgpLlxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlUmV2aWV3RGV0YWlscygpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBlcmZvcm1hbmNlRGVzY3JpcHRpb24gPSBhcHBlbmQocGVyZm9ybWFuY2VDb250YWluZXIsICQoJ2Rpdi5yZXZpZXctcGVyZm9ybWFuY2UtZGVzY3JpcHRpb24nKSk7XG5cdFx0XHRwZXJmb3JtYW5jZURlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FkZGl0aW9uYWxQZXJmb3JtYW5jZURhdGFEZXNjcmlwdGlvbicsIFwiT3B0aW9uYWxseSBpbmNsdWRlIGN1cnJlbnRseSBydW5uaW5nIHByb2Nlc3NlcyBhbmQgd29ya3NwYWNlIG1ldGFkYXRhIHRvIGhlbHAgZGlhZ25vc2UgcGVyZm9ybWFuY2UgaXNzdWVzLlwiKTtcblxuXHRcdFx0aWYgKG1vZGVsRGF0YS5wcm9jZXNzSW5mbykge1xuXHRcdFx0XHRkaWFnbm9zdGljU2VjdGlvbkNvdW50Kys7XG5cdFx0XHRcdHRoaXMuY3JlYXRlRGlhZ1NlY3Rpb24ocGVyZm9ybWFuY2VDb250YWluZXIsIHtcblx0XHRcdFx0XHRpZDogJ3Byb2Nlc3MtaW5mbycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdydW5uaW5nUHJvY2Vzc2VzJywgXCJSdW5uaW5nIFByb2Nlc3Nlc1wiKSxcblx0XHRcdFx0XHRjaGVja2VkOiB0aGlzLmluY2x1ZGVQcm9jZXNzSW5mbyxcblx0XHRcdFx0XHRvblRvZ2dsZTogKGNoZWNrZWQpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuaW5jbHVkZVByb2Nlc3NJbmZvID0gY2hlY2tlZDtcblx0XHRcdFx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaW5jbHVkZVByb2Nlc3NJbmZvOiBjaGVja2VkIH0pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVuZGVyQ29udGVudDogKGNvbnRhaW5lcikgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJlID0gYXBwZW5kKGNvbnRhaW5lciwgJCgncHJlLnJldmlldy1kaWFnLXByZScpKTtcblx0XHRcdFx0XHRcdHByZS50ZXh0Q29udGVudCA9IG1vZGVsRGF0YS5wcm9jZXNzSW5mbyE7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKCF0aGlzLnBlcmZvcm1hbmNlSW5mb0xvYWRlZCkge1xuXHRcdFx0XHRjb25zdCBsb2FkaW5nID0gYXBwZW5kKHBlcmZvcm1hbmNlQ29udGFpbmVyLCAkKCdkaXYucmV2aWV3LWRpYWctbG9hZGluZycpKTtcblx0XHRcdFx0bG9hZGluZy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsb2FkaW5nUHJvY2Vzc0luZm8nLCBcIkxvYWRpbmcgY3VycmVudGx5IHJ1bm5pbmcgcHJvY2Vzc2VzLi4uXCIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZWxEYXRhLndvcmtzcGFjZUluZm8pIHtcblx0XHRcdFx0ZGlhZ25vc3RpY1NlY3Rpb25Db3VudCsrO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZURpYWdTZWN0aW9uKHBlcmZvcm1hbmNlQ29udGFpbmVyLCB7XG5cdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2UtaW5mbycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd3b3Jrc3BhY2VNZXRhZGF0YScsIFwiV29ya3NwYWNlIE1ldGFkYXRhXCIpLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IHRoaXMuaW5jbHVkZVdvcmtzcGFjZUluZm8sXG5cdFx0XHRcdFx0b25Ub2dnbGU6IChjaGVja2VkKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmluY2x1ZGVXb3Jrc3BhY2VJbmZvID0gY2hlY2tlZDtcblx0XHRcdFx0XHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaW5jbHVkZVdvcmtzcGFjZUluZm86IGNoZWNrZWQgfSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZW5kZXJDb250ZW50OiAoY29udGFpbmVyKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcmUgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdwcmUucmV2aWV3LWRpYWctcHJlJykpO1xuXHRcdFx0XHRcdFx0cHJlLnRleHRDb250ZW50ID0gbW9kZWxEYXRhLndvcmtzcGFjZUluZm8hO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5wZXJmb3JtYW5jZUluZm9Mb2FkZWQpIHtcblx0XHRcdFx0Y29uc3QgbG9hZGluZyA9IGFwcGVuZChwZXJmb3JtYW5jZUNvbnRhaW5lciwgJCgnZGl2LnJldmlldy1kaWFnLWxvYWRpbmcnKSk7XG5cdFx0XHRcdGxvYWRpbmcudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbG9hZGluZ1dvcmtzcGFjZUluZm8nLCBcIkxvYWRpbmcgd29ya3NwYWNlIG1ldGFkYXRhLi4uXCIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkaWFnbm9zdGljU2VjdGlvbkNvdW50ID4gMCkge1xuXHRcdFx0Y29uc3QgaGVhZGluZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0aGVhZGluZy5jbGFzc05hbWUgPSAncmV2aWV3LWRpYWctaGVhZGluZyc7XG5cblx0XHRcdC8vIE1hc3RlciBjaGVja2JveCBiZWZvcmUgXCJBZGRpdGlvbmFsIEluZm9ybWF0aW9uXCIgc2hvd3MvaGlkZXMgYW5kXG5cdFx0XHQvLyBpbmNsdWRlcy9leGNsdWRlcyB0aGUgd2hvbGUgYmxvY2suIEl0IGlzIGFuIGV4cGxpY2l0IHRvZ2dsZVxuXHRcdFx0Ly8gY29udHJvbGxlZCBvbmx5IGJ5IHRoZSB1c2VyOiBjbGlja2luZyBhIHBlci1zZWN0aW9uIGNoZWNrYm94IGFmZmVjdHNcblx0XHRcdC8vIHRoYXQgc2VjdGlvbiBhbG9uZSBhbmQgbmV2ZXIgY2hhbmdlcyB0aGUgbWFzdGVyIG9yIGhpZGVzIHRoZSBvdGhlcnMuXG5cdFx0XHRjb25zdCBtYXN0ZXJXcmFwID0gYXBwZW5kKGhlYWRpbmcsICQoJ2Rpdi5yZXZpZXctZGlhZy1tYXN0ZXItd3JhcCcpKTtcblx0XHRcdGNvbnN0IG1hc3RlckNoZWNrYm94ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IENoZWNrYm94KGxvY2FsaXplKCdhZGRpdGlvbmFsSW5mb3JtYXRpb24nLCBcIkFkZGl0aW9uYWwgSW5mb3JtYXRpb25cIiksICF0aGlzLmRpYWdub3N0aWNzQ29sbGFwc2VkLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpKTtcblx0XHRcdG1hc3RlckNoZWNrYm94LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgncmV2aWV3LWRpYWctbWFzdGVyLWNoZWNrYm94Jyk7XG5cdFx0XHRtYXN0ZXJXcmFwLmFwcGVuZENoaWxkKG1hc3RlckNoZWNrYm94LmRvbU5vZGUpO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBhcHBlbmQobWFzdGVyV3JhcCwgJCgnaDMucmV2aWV3LWRpYWctaGVhZGluZy10aXRsZScpKTtcblx0XHRcdHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FkZGl0aW9uYWxJbmZvcm1hdGlvbicsIFwiQWRkaXRpb25hbCBJbmZvcm1hdGlvblwiKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG1hc3RlckNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5kaWFnbm9zdGljc0NvbGxhcHNlZCA9ICFtYXN0ZXJDaGVja2JveC5jaGVja2VkO1xuXHRcdFx0XHR0aGlzLnNldEFsbERpYWdub3N0aWNTZWN0aW9uc0luY2x1ZGVkKG1hc3RlckNoZWNrYm94LmNoZWNrZWQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBIaWRlIGFsbCBzZWN0aW9ucyBvbmx5IHdoZW4gdGhlIHVzZXIgdHVybnMgdGhlIG1hc3RlciBvZmYuXG5cdFx0XHRkaWFnQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FsbC1leGNsdWRlZCcsIHRoaXMuZGlhZ25vc3RpY3NDb2xsYXBzZWQpO1xuXG5cdFx0XHRkaWFnQ29udGFpbmVyLnByZXBlbmQoaGVhZGluZyk7XG5cdFx0fVxuXG5cdFx0Ly8gQWxpZ24gYWxsIHRpdGxlIHdpZHRocyBkeW5hbWljYWxseSB0byB0aGUgd2lkZXN0IHRpdGxlIHNvIGNoZXZyb24gY29sdW1ucyBsaW5lIHVwLlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRpdGxlcyA9IGRpYWdDb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnJldmlldy1kaWFnLXRpdGxlJyk7XG5cdFx0bGV0IG1heFdpZHRoID0gMDtcblx0XHRmb3IgKGNvbnN0IHQgb2YgdGl0bGVzKSB7XG5cdFx0XHQodCBhcyBIVE1MRWxlbWVudCkuc3R5bGUubWluV2lkdGggPSAnJztcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB0IG9mIHRpdGxlcykge1xuXHRcdFx0bWF4V2lkdGggPSBNYXRoLm1heChtYXhXaWR0aCwgKHQgYXMgSFRNTEVsZW1lbnQpLm9mZnNldFdpZHRoKTtcblx0XHR9XG5cdFx0aWYgKG1heFdpZHRoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCB0IG9mIHRpdGxlcykge1xuXHRcdFx0XHQodCBhcyBIVE1MRWxlbWVudCkuc3R5bGUubWluV2lkdGggPSBgJHttYXhXaWR0aH1weGA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRBbGxEaWFnbm9zdGljU2VjdGlvbnNJbmNsdWRlZChpbmNsdWRlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuaW5jbHVkZVN5c3RlbUluZm8gPSBpbmNsdWRlZDtcblx0XHR0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhID0gaW5jbHVkZWQ7XG5cdFx0dGhpcy5pbmNsdWRlRXh0ZW5zaW9ucyA9IGluY2x1ZGVkO1xuXHRcdHRoaXMuaW5jbHVkZUV4cGVyaW1lbnRzID0gaW5jbHVkZWQ7XG5cdFx0dGhpcy5pbmNsdWRlUHJvY2Vzc0luZm8gPSBpbmNsdWRlZDtcblx0XHR0aGlzLmluY2x1ZGVXb3Jrc3BhY2VJbmZvID0gaW5jbHVkZWQ7XG5cdFx0dGhpcy5tb2RlbC51cGRhdGUoe1xuXHRcdFx0aW5jbHVkZVN5c3RlbUluZm86IGluY2x1ZGVkLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbkRhdGE6IGluY2x1ZGVkLFxuXHRcdFx0aW5jbHVkZUV4dGVuc2lvbnM6IGluY2x1ZGVkLFxuXHRcdFx0aW5jbHVkZUV4cGVyaW1lbnRzOiBpbmNsdWRlZCxcblx0XHRcdGluY2x1ZGVQcm9jZXNzSW5mbzogaW5jbHVkZWQsXG5cdFx0XHRpbmNsdWRlV29ya3NwYWNlSW5mbzogaW5jbHVkZWQsXG5cdFx0fSk7XG5cdFx0dGhpcy51cGRhdGVSZXZpZXdEZXRhaWxzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZURpYWdTZWN0aW9uKHBhcmVudDogSFRNTEVsZW1lbnQsIG9wdHM6IHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdGxhYmVsOiBzdHJpbmc7XG5cdFx0Y2hlY2tlZDogYm9vbGVhbjtcblx0XHRvblRvZ2dsZTogKGNoZWNrZWQ6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdFx0cmVuZGVyQ29udGVudDogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XG5cdH0pOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IGFwcGVuZChwYXJlbnQsICQoJ2Rpdi5yZXZpZXctZGlhZy1ncm91cCcpKTtcblx0XHRncm91cC5jbGFzc0xpc3QudG9nZ2xlKCdleGNsdWRlZCcsICFvcHRzLmNoZWNrZWQpO1xuXG5cdFx0Ly8gSGVhZGVyIGxheW91dDogW0NoZWNrYm94XSBbQ2hldnJvbiArIFRpdGxlICh0b2dnbGUgYXJlYSldLiBUaGUgd2hvbGVcblx0XHQvLyB0aXRsZSBhcmVhIGlzIGNsaWNrYWJsZSB0byBleHBhbmQvY29sbGFwc2UuXG5cdFx0Y29uc3QgaGVhZGVyID0gYXBwZW5kKGdyb3VwLCAkKCdkaXYucmV2aWV3LWRpYWctaGVhZGVyJykpO1xuXG5cdFx0Y29uc3QgY2hlY2tXcmFwID0gYXBwZW5kKGhlYWRlciwgJCgnZGl2LnJldmlldy1kaWFnLWNoZWNrLXdyYXAnKSk7XG5cdFx0Y29uc3QgY2hlY2tib3ggPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3gob3B0cy5sYWJlbCwgb3B0cy5jaGVja2VkLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMpKTtcblx0XHRjaGVja2JveC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3Jldmlldy1kaWFnLWNoZWNrYm94Jyk7XG5cdFx0Y2hlY2tXcmFwLmFwcGVuZENoaWxkKGNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0Y29uc3QgdG9nZ2xlQXJlYSA9IGFwcGVuZChoZWFkZXIsICQoJ2Rpdi5yZXZpZXctZGlhZy10b2dnbGUtYXJlYScpKTtcblx0XHR0b2dnbGVBcmVhLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0b2dnbGVBcmVhLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdHRvZ2dsZUFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IGNoZXZyb24gPSBhcHBlbmQodG9nZ2xlQXJlYSwgJCgnc3Bhbi5yZXZpZXctZGlhZy1jaGV2cm9uJykpO1xuXHRcdGNoZXZyb24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cblx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZCh0b2dnbGVBcmVhLCAkKCdzcGFuLnJldmlldy1kaWFnLXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gb3B0cy5sYWJlbDtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhcHBlbmQoZ3JvdXAsICQoJ2Rpdi5yZXZpZXctZGlhZy1jb250ZW50JykpO1xuXHRcdG9wdHMucmVuZGVyQ29udGVudChjb250ZW50KTtcblxuXHRcdGxldCBleHBhbmRlZCA9IHRydWU7XG5cdFx0Y29uc3Qgc2V0RXhwYW5kZWQgPSAobmV4dDogYm9vbGVhbikgPT4ge1xuXHRcdFx0ZXhwYW5kZWQgPSBuZXh0O1xuXHRcdFx0Y29udGVudC5zdHlsZS5kaXNwbGF5ID0gZXhwYW5kZWQgPyAnJyA6ICdub25lJztcblx0XHRcdHRvZ2dsZUFyZWEuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKGV4cGFuZGVkKSk7XG5cdFx0XHRjaGV2cm9uLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRjaGV2cm9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oZXhwYW5kZWQgPyBDb2RpY29uLmNoZXZyb25Eb3duIDogQ29kaWNvbi5jaGV2cm9uUmlnaHQpKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRvZ2dsZUFyZWEsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gc2V0RXhwYW5kZWQoIWV4cGFuZGVkKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0b2dnbGVBcmVhLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRzZXRFeHBhbmRlZCghZXhwYW5kZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdG9wdHMub25Ub2dnbGUoY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHRncm91cC5jbGFzc0xpc3QudG9nZ2xlKCdleGNsdWRlZCcsICFjaGVja2JveC5jaGVja2VkKTtcblx0XHRcdHRoaXMudXBkYXRlU3RlcFVJKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGREaWFnUm93KHRhYmxlOiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJvdyA9IGFwcGVuZCh0YWJsZSwgJCgndHInKSk7XG5cdFx0Y29uc3QgdGggPSBhcHBlbmQocm93LCAkKCd0ZC5yZXZpZXctZGlhZy1rZXknKSk7XG5cdFx0dGgudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRjb25zdCB0ZCA9IGFwcGVuZChyb3csICQoJ3RkLnJldmlldy1kaWFnLXZhbCcpKTtcblx0XHR0ZC50ZXh0Q29udGVudCA9IHZhbHVlO1xuXHR9XG5cblx0LyoqIENhbGxlZCBieSB0aGUgZm9ybSBzZXJ2aWNlIHRvIHNob3cgdXBsb2FkIHByb2dyZXNzICovXG5cdHNldFVwbG9hZGluZyh1cGxvYWRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnVwbG9hZGluZyA9IHVwbG9hZGluZztcblxuXHRcdGlmICh1cGxvYWRpbmcpIHtcblx0XHRcdHRoaXMubmV4dEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3VwbG9hZGluZycpO1xuXHRcdFx0dGhpcy5uZXh0QnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3VwbG9hZGluZycsIFwiVXBsb2FkaW5nLi4uXCIpO1xuXHRcdFx0dGhpcy5uZXh0QnV0dG9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuYmFja0J1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubmV4dEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3VwbG9hZGluZycpO1xuXHRcdFx0dGhpcy5uZXh0QnV0dG9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogTWFyayBhIHNwZWNpZmljIGF0dGFjaG1lbnQgYXMgdXBsb2FkaW5nIC8gZG9uZSAqL1xuXHRzZXRBdHRhY2htZW50VXBsb2FkU3RhdGUoaW5kZXg6IG51bWJlciwgc3RhdGU6ICdwZW5kaW5nJyB8ICd1cGxvYWRpbmcnIHwgJ2RvbmUnKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnJldmlld1RodW1iQ2FyZHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNhcmQgPSB0aGlzLnJldmlld1RodW1iQ2FyZHNbaW5kZXhdO1xuXHRcdGNhcmQuY2xhc3NMaXN0LnJlbW92ZSgndXBsb2FkLXBlbmRpbmcnLCAndXBsb2FkLXVwbG9hZGluZycsICd1cGxvYWQtZG9uZScpO1xuXHRcdGNhcmQuY2xhc3NMaXN0LmFkZChgdXBsb2FkLSR7c3RhdGV9YCk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBvdmVybGF5ID0gY2FyZC5xdWVyeVNlbGVjdG9yKCcucmV2aWV3LXByb2dyZXNzLW92ZXJsYXknKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0aWYgKCFvdmVybGF5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXRlID09PSAnZG9uZScpIHtcblx0XHRcdC8vIFJlcGxhY2UgcmluZyB3aXRoIGNoZWNrbWFya1xuXHRcdFx0b3ZlcmxheS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0Y29uc3QgY2hlY2sgPSAkKCdzcGFuLnJldmlldy1wcm9ncmVzcy1jaGVjaycpO1xuXHRcdFx0Y2hlY2suYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNoZWNrKSk7XG5cdFx0XHRvdmVybGF5LmFwcGVuZENoaWxkKGNoZWNrKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN1Ym1pdCgpOiB2b2lkIHtcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMudGl0bGVJbnB1dC52YWx1ZS50cmltKCk7XG5cdFx0aWYgKCF0aXRsZSkge1xuXHRcdFx0Ly8gU2hvdWxkIG5vdCBoYXBwZW46IHZhbGlkYXRlZCBpbiBnb05leHQoKSBvbiBEZXNjcmliZSBzdGVwXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUudHJpbSgpO1xuXHRcdHRoaXMudXBkYXRlSXNzdWVTb3VyY2VGbGFncygpO1xuXHRcdHRoaXMubW9kZWwudXBkYXRlKHsgaXNzdWVEZXNjcmlwdGlvbjogZGVzY3JpcHRpb24sIGlzc3VlVGl0bGU6IHRpdGxlLCAuLi4odGhpcy5zZWxlY3RlZElzc3VlVHlwZSAhPT0gdW5kZWZpbmVkID8geyBpc3N1ZVR5cGU6IHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgfSA6IHt9KSB9KTtcblxuXHRcdGNvbnN0IGJvZHkgPSB0aGlzLmJ1aWxkSXNzdWVCb2R5KCk7XG5cdFx0dGhpcy5fb25EaWRTdWJtaXQuZmlyZSh7IHRpdGxlLCBib2R5IH0pO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudmlzaWJsZSA9IHRydWU7XG5cblx0XHR0aGlzLndpemFyZFBhbmVsLmNsYXNzTGlzdC5hZGQoJ29wZW4nLCAnd2l6YXJkLWVtYmVkZGVkJyk7XG5cdFx0dGhpcy53aXphcmRQYW5lbC5zdHlsZS5tYXhIZWlnaHQgPSAnbm9uZSc7XG5cdFx0YXBwZW5kKHRoaXMuY29udGFpbmVyLCB0aGlzLndpemFyZFBhbmVsKTtcblx0XHR0aGlzLndpemFyZFBhbmVsLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRvdGFsQXR0YWNobWVudHMoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5zY3JlZW5zaG90cy5sZW5ndGggKyB0aGlzLnJlY29yZGluZ3MubGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTY3JlZW5zaG90RGVsYXlPcHRpb25zKCk6IHsgbGFiZWw6IHN0cmluZzsgdmFsdWU6IG51bWJlciB9W10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnbm9EZWxheScsIFwiTm8gZGVsYXlcIiksIHZhbHVlOiAwIH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgndGhyZWVTZWNvbmRzJywgXCIzIHNlY29uZHNcIiksIHZhbHVlOiAzIH0sXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgnZml2ZVNlY29uZHMnLCBcIjUgc2Vjb25kc1wiKSwgdmFsdWU6IDUgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCd0ZW5TZWNvbmRzJywgXCIxMCBzZWNvbmRzXCIpLCB2YWx1ZTogMTAgfSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRGbG9hdGluZ0JhckJ1dHRvblN0eWxlcyh0YXJnZXRXaW5kb3c6IFdpbmRvdyk6IHR5cGVvZiBkZWZhdWx0QnV0dG9uU3R5bGVzIHtcblx0XHRjb25zdCBjb250YWluZXJTdHlsZXMgPSB0YXJnZXRXaW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLmNvbnRhaW5lcik7XG5cdFx0Y29uc3QgY3NzVmFyID0gKG5hbWU6IHN0cmluZywgZmFsbGJhY2s6IHN0cmluZyk6IHN0cmluZyA9PiBjb250YWluZXJTdHlsZXMuZ2V0UHJvcGVydHlWYWx1ZShuYW1lKS50cmltKCkgfHwgZmFsbGJhY2s7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiBjc3NWYXIoJy0tdnNjb2RlLWJ1dHRvbi1mb3JlZ3JvdW5kJywgJyNmZmYnKSxcblx0XHRcdGJ1dHRvbkJhY2tncm91bmQ6IGNzc1ZhcignLS12c2NvZGUtYnV0dG9uLWJhY2tncm91bmQnLCAnIzBlNjM5YycpLFxuXHRcdFx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiBjc3NWYXIoJy0tdnNjb2RlLWJ1dHRvbi1ob3ZlckJhY2tncm91bmQnLCAnIzExNzdiYicpLFxuXHRcdFx0YnV0dG9uQm9yZGVyOiBjc3NWYXIoJy0tdnNjb2RlLWJ1dHRvbi1ib3JkZXInLCAndHJhbnNwYXJlbnQnKSxcblx0XHR9O1xuXHR9XG5cblx0YWRkU2NyZWVuc2hvdChzY3JlZW5zaG90OiBJU2NyZWVuc2hvdCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmdldFRvdGFsQXR0YWNobWVudHMoKSA+PSBNQVhfQVRUQUNITUVOVFMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zY3JlZW5zaG90cy5wdXNoKHNjcmVlbnNob3QpO1xuXHRcdC8vIE5hdmlnYXRlIHRvIHRoZSBBdHRhY2htZW50cyBzdGVwIHNvIHRoZSB1c2VyIHNlZXMgd2hlcmUgdGhlIHNjcmVlbnNob3Rcblx0XHQvLyB3YXMgc2F2ZWQgaW5zdGVhZCBvZiBzdGF5aW5nIG9uIHdoYXRldmVyIHN0ZXAgdGhleSB3ZXJlIGNvbXBvc2luZyBvbi5cblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCAhPT0gV2l6YXJkU3RlcC5BdHRhY2htZW50cykge1xuXHRcdFx0dGhpcy5zZXRTdGVwKFdpemFyZFN0ZXAuQXR0YWNobWVudHMpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUF0dGFjaG1lbnRWaWV3cygpO1xuXHRcdHRoaXMudXBkYXRlQXR0YWNobWVudEJ1dHRvbnMoKTtcblx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNobWVudHMuZmlyZSgpO1xuXG5cdFx0Ly8gSW1tZWRpYXRlbHkgb3BlbiB0aGUgYW5ub3RhdGlvbiBlZGl0b3IgZm9yIHRoZSBuZXcgc2NyZWVuc2hvdFxuXHRcdHRoaXMub3BlbkFubm90YXRpb25FZGl0b3IodGhpcy5zY3JlZW5zaG90cy5sZW5ndGggLSAxKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQXR0YWNobWVudEJ1dHRvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYXRNYXggPSB0aGlzLmdldFRvdGFsQXR0YWNobWVudHMoKSA+PSBNQVhfQVRUQUNITUVOVFM7XG5cdFx0Y29uc3QgbWF4TXNnID0gbG9jYWxpemUoJ21heEF0dGFjaG1lbnRzUmVhY2hlZCcsIFwiTWF4IGF0dGFjaG1lbnRzIHJlYWNoZWRcIik7XG5cdFx0Y29uc3Qgd291bGRSZWFjaE1heCA9IHRoaXMuZ2V0VG90YWxBdHRhY2htZW50cygpID49IE1BWF9BVFRBQ0hNRU5UUyAtIDE7XG5cblx0XHQvLyBTY3JlZW5zaG90IGRpc2FibGVkIHdoZW46IGF0IG1heCwgT1IgcmVjb3JkaW5nIHdpbGwgZmlsbCB0aGUgbGFzdCBzbG90LCBPUiBkZWxheWVkIHNjcmVlbnNob3QgcGVuZGluZ1xuXHRcdGNvbnN0IHNjcmVlbnNob3REaXNhYmxlZCA9IGF0TWF4IHx8ICh3b3VsZFJlYWNoTWF4ICYmIHRoaXMuY3VycmVudFJlY29yZGluZ1N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpIHx8IHRoaXMuZGVsYXllZFNjcmVlbnNob3RQZW5kaW5nO1xuXHRcdC8vIFJlY29yZCBkaXNhYmxlZCB3aGVuOiBhdCBtYXgsIE9SIGRlbGF5ZWQgc2NyZWVuc2hvdCB3aWxsIGZpbGwgdGhlIGxhc3Qgc2xvdFxuXHRcdGNvbnN0IHJlY29yZERpc2FibGVkID0gYXRNYXggfHwgKHdvdWxkUmVhY2hNYXggJiYgdGhpcy5kZWxheWVkU2NyZWVuc2hvdFBlbmRpbmcpO1xuXG5cdFx0aWYgKHRoaXMuY2FwdHVyZVN0cmlwQ2FwdHVyZUJ0bikge1xuXHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBDYXB0dXJlQnRuLmVuYWJsZWQgPSAhc2NyZWVuc2hvdERpc2FibGVkO1xuXHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBDYXB0dXJlQnRuLmVsZW1lbnQudGl0bGUgPSBzY3JlZW5zaG90RGlzYWJsZWQgPyBtYXhNc2cgOiBsb2NhbGl6ZSgnc2NyZWVuc2hvdCcsIFwiU2NyZWVuc2hvdFwiKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY2FwdHVyZVN0cmlwRGVsYXlCdG4pIHtcblx0XHRcdC8vIERlbGF5IGRyb3Bkb3duIGFsc28gZGlzYWJsZWQgd2hpbGUgY291bnRkb3duIGlzIHJ1bm5pbmdcblx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwRGVsYXlCdG4uZW5hYmxlZCA9ICFzY3JlZW5zaG90RGlzYWJsZWQ7XG5cdFx0XHR0aGlzLmNhcHR1cmVTdHJpcERlbGF5QnRuLmVsZW1lbnQudGl0bGUgPSBzY3JlZW5zaG90RGlzYWJsZWQgPyBtYXhNc2cgOiBsb2NhbGl6ZSgnY2FwdHVyZU9wdGlvbnMnLCBcIkNhcHR1cmUgb3B0aW9uc1wiKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuKSB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGUgIT09IFJlY29yZGluZ1N0YXRlLlJlY29yZGluZykge1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5lbmFibGVkID0gIXJlY29yZERpc2FibGVkO1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5lbGVtZW50LnRpdGxlID0gcmVjb3JkRGlzYWJsZWQgPyBtYXhNc2cgOiBsb2NhbGl6ZSgncmVjb3JkVmlkZW8nLCBcIlJlY29yZCB2aWRlb1wiKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEaXNhYmxlIFwiUHJldmlldyBvbiBHaXRIdWJcIiB3aGlsZSByZWNvcmRpbmdcblx0XHR0aGlzLnVwZGF0ZU5leHRCdXR0b25Gb3JSZWNvcmRpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTmV4dEJ1dHRvbkZvclJlY29yZGluZygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCAhPT0gV2l6YXJkU3RlcC5SZXZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVjb3JkaW5nID0gdGhpcy5jdXJyZW50UmVjb3JkaW5nU3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLlJlY29yZGluZztcblx0XHR0aGlzLm5leHRCdXR0b24uZW5hYmxlZCA9ICFyZWNvcmRpbmc7XG5cdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQudGl0bGUgPSByZWNvcmRpbmdcblx0XHRcdD8gbG9jYWxpemUoJ3JlY29yZGluZ0FjdGl2ZScsIFwiUmVjb3JkaW5nIGFjdGl2ZVwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgncHJldmlld09uR2l0SHViJywgXCJQcmV2aWV3IG9uIEdpdEh1YlwiKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUmVjb3JkaW5nQ2FyZChwYXJlbnQ6IEhUTUxFbGVtZW50LCByZWM6IHsgZmlsZVBhdGg6IHN0cmluZzsgZHVyYXRpb25NczogbnVtYmVyOyB0aHVtYm5haWxEYXRhVXJsPzogc3RyaW5nIH0sIGluZGV4OiBudW1iZXIpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY2FyZCA9IGFwcGVuZChwYXJlbnQsICQoJ2Rpdi53aXphcmQtc2NyZWVuc2hvdC1jYXJkLndpemFyZC1yZWNvcmRpbmctY2FyZCcpKTtcblxuXHRcdGlmIChyZWMudGh1bWJuYWlsRGF0YVVybCkge1xuXHRcdFx0Y29uc3QgdGh1bWJJbWcgPSBhcHBlbmQoY2FyZCwgJCgnaW1nLndpemFyZC1zY3JlZW5zaG90LWltZycpKSBhcyBIVE1MSW1hZ2VFbGVtZW50O1xuXHRcdFx0dGh1bWJJbWcuc2V0QXR0cmlidXRlKCdzcmMnLCByZWMudGh1bWJuYWlsRGF0YVVybCk7XG5cdFx0XHR0aHVtYkltZy5hbHQgPSBsb2NhbGl6ZSgncmVjb3JkaW5nVGh1bWJuYWlsQWx0JywgXCJSZWNvcmRpbmcgezB9XCIsIGluZGV4ICsgMSk7XG5cdFx0XHR0aHVtYkltZy5zZXRBdHRyaWJ1dGUoJ2RyYWdnYWJsZScsICdmYWxzZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBsYXlPdmVybGF5ID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi53aXphcmQtcmVjb3JkaW5nLXBsYXknKSk7XG5cdFx0cGxheU92ZXJsYXkuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLnBsYXkpKTtcblxuXHRcdGNvbnN0IGR1clNlYyA9IE1hdGguZmxvb3IocmVjLmR1cmF0aW9uTXMgLyAxMDAwKTtcblx0XHRjb25zdCBkdXJMYWJlbCA9IGFwcGVuZChjYXJkLCAkKCdkaXYud2l6YXJkLXJlY29yZGluZy1kdXJhdGlvbicpKTtcblx0XHRkdXJMYWJlbC50ZXh0Q29udGVudCA9IGAke01hdGguZmxvb3IoZHVyU2VjIC8gNjApfTokeyhkdXJTZWMgJSA2MCkudG9TdHJpbmcoKS5wYWRTdGFydCgyLCAnMCcpfWA7XG5cblx0XHRyZXR1cm4gY2FyZDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2NyZWVuc2hvdFRodW1ibmFpbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5zY3JlZW5zaG90Q29udGFpbmVyLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuc2NyZWVuc2hvdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHNjcmVlbnNob3QgPSB0aGlzLnNjcmVlbnNob3RzW2ldO1xuXHRcdFx0Y29uc3QgY2FyZCA9IGFwcGVuZCh0aGlzLnNjcmVlbnNob3RDb250YWluZXIsICQoJ2Rpdi53aXphcmQtc2NyZWVuc2hvdC1jYXJkJykpO1xuXG5cdFx0XHRjb25zdCBpbWcgPSBhcHBlbmQoY2FyZCwgJCgnaW1nJykpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHRpbWcuc3JjID0gc2NyZWVuc2hvdC5hbm5vdGF0ZWREYXRhVXJsID8/IHNjcmVlbnNob3QuZGF0YVVybDtcblx0XHRcdGltZy5hbHQgPSBsb2NhbGl6ZSgnc2NyZWVuc2hvdEFsdCcsIFwiU2NyZWVuc2hvdCB7MH1cIiwgaSArIDEpO1xuXG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdGNhcmQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRjYXJkLnRpdGxlID0gbG9jYWxpemUoJ2VkaXRTY3JlZW5zaG90JywgXCJDbGljayB0byBlZGl0IHNjcmVlbnNob3RcIik7XG5cdFx0XHRjb25zdCBvcGVuRWRpdG9yID0gKCkgPT4gdGhpcy5vcGVuQW5ub3RhdGlvbkVkaXRvcihpKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCBFdmVudFR5cGUuQ0xJQ0ssIG9wZW5FZGl0b3IpKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdG9wZW5FZGl0b3IoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBkZWxldGVCdG4gPSBhcHBlbmQoY2FyZCwgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90LWRlbGV0ZScpKTtcblx0XHRcdGRlbGV0ZUJ0bi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRkZWxldGVCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2RlbGV0ZVNjcmVlbnNob3QnLCBcIkRlbGV0ZSBzY3JlZW5zaG90XCIpKTtcblx0XHRcdGRlbGV0ZUJ0bi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2xvc2UpKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihkZWxldGVCdG4sIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuc2NyZWVuc2hvdHMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNjcmVlbnNob3RUaHVtYm5haWxzKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlQXR0YWNobWVudEJ1dHRvbnMoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBdHRhY2htZW50cy5maXJlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVjb3JkaW5nIHRodW1ibmFpbHNcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucmVjb3JkaW5ncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcmVjID0gdGhpcy5yZWNvcmRpbmdzW2ldO1xuXHRcdFx0Y29uc3QgY2FyZCA9IHRoaXMucmVuZGVyUmVjb3JkaW5nQ2FyZCh0aGlzLnNjcmVlbnNob3RDb250YWluZXIsIHJlYywgaSk7XG5cblx0XHRcdC8vIENsaWNrIHRvIG9wZW4gZnJvbSBPU1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RPcGVuUmVjb3JkaW5nLmZpcmUocmVjLmZpbGVQYXRoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgZGVsZXRlQnRuID0gYXBwZW5kKGNhcmQsICQoJ2Rpdi53aXphcmQtc2NyZWVuc2hvdC1kZWxldGUnKSk7XG5cdFx0XHRkZWxldGVCdG4uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0ZGVsZXRlQnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdkZWxldGVSZWNvcmRpbmcnLCBcIlJlbW92ZSByZWNvcmRpbmdcIikpO1xuXHRcdFx0ZGVsZXRlQnRuLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jbG9zZSkpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRlbGV0ZUJ0biwgRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5yZWNvcmRpbmdzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0dGhpcy51cGRhdGVTY3JlZW5zaG90VGh1bWJuYWlscygpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUF0dGFjaG1lbnRCdXR0b25zKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RlcFVJKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNobWVudHMuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdldFRvdGFsQXR0YWNobWVudHMoKSA8IE1BWF9BVFRBQ0hNRU5UUykge1xuXHRcdFx0Y29uc3Qgd291bGRSZWFjaE1heCA9IHRoaXMuZ2V0VG90YWxBdHRhY2htZW50cygpID49IE1BWF9BVFRBQ0hNRU5UUyAtIDE7XG5cdFx0XHRjb25zdCBhZGREaXNhYmxlZCA9IHdvdWxkUmVhY2hNYXggJiYgKHRoaXMuY3VycmVudFJlY29yZGluZ1N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcgfHwgdGhpcy5kZWxheWVkU2NyZWVuc2hvdFBlbmRpbmcpO1xuXHRcdFx0Y29uc3QgYWRkQ2FyZCA9IGFwcGVuZCh0aGlzLnNjcmVlbnNob3RDb250YWluZXIsICQoJ2Rpdi53aXphcmQtc2NyZWVuc2hvdC1jYXJkLndpemFyZC1zY3JlZW5zaG90LWFkZCcpKTtcblx0XHRcdGlmIChhZGREaXNhYmxlZCkge1xuXHRcdFx0XHRhZGRDYXJkLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdGFkZENhcmQudGl0bGUgPSBsb2NhbGl6ZSgnbWF4QXR0YWNobWVudHNSZWFjaGVkJywgXCJNYXggYXR0YWNobWVudHMgcmVhY2hlZFwiKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBsdXMgPSBhcHBlbmQoYWRkQ2FyZCwgJCgnZGl2LndpemFyZC1zY3JlZW5zaG90LXBsdXMnKSk7XG5cdFx0XHRwbHVzLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5hZGQpKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhZGRDYXJkLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0aWYgKCFhZGRDYXJkLmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdFNjcmVlbnNob3QuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvcGVuQW5ub3RhdGlvbkVkaXRvcihpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLnNjcmVlbnNob3RzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFBlci1lZGl0b3IgbGlmZWN5Y2xlOiBlYWNoIGNhbGwgY3JlYXRlcyBhIG5ldyBlZGl0b3IgdGhhdCBtb3VudHMgYW5cblx0XHQvLyBhYnNvbHV0ZWx5LXBvc2l0aW9uZWQgb3ZlcmxheSBvbiB0b3Agb2YgYW55IHByZXZpb3VzbHktb3BlbiBlZGl0b3IgYW5kXG5cdFx0Ly8gZGlzcG9zZXMgaXRzZWxmIG9uIHNhdmUvY2FuY2VsLiBUaGlzIGdpdmVzIHVzIHRoZSBzdGFja2luZyBiZWhhdmlvciB0aGVcblx0XHQvLyB1c2VyIGV4cGVjdHMgd2hlbiB0YWtpbmcgbXVsdGlwbGUgc2NyZWVuc2hvdHMgaW4gYSByb3cgXHUyMDE0IHRoZSB0b3Btb3N0XG5cdFx0Ly8gZWRpdG9yIGhhbmRsZXMgc2F2ZS9jYW5jZWwsIHRoZW4gdGhlIHByZXZpb3VzIG9uZSBiZWNvbWVzIHZpc2libGVcblx0XHQvLyBhZ2Fpbi5cblx0XHRjb25zdCBzY3JlZW5zaG90ID0gdGhpcy5zY3JlZW5zaG90c1tpbmRleF07XG5cdFx0Y29uc3QgZWRpdG9yID0gbmV3IFNjcmVlbnNob3RBbm5vdGF0aW9uRWRpdG9yKHNjcmVlbnNob3QsIHRoaXMud2l6YXJkUGFuZWwsIHNjcmVlbnNob3QuYW5ub3RhdGlvblN0YXRlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChlZGl0b3IpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkU2F2ZSgoeyBkYXRhVXJsLCBzdGF0ZSB9KSA9PiB7XG5cdFx0XHRzY3JlZW5zaG90LmFubm90YXRlZERhdGFVcmwgPSBkYXRhVXJsO1xuXHRcdFx0c2NyZWVuc2hvdC5hbm5vdGF0aW9uU3RhdGUgPSBzdGF0ZTtcblx0XHRcdHRoaXMudXBkYXRlQXR0YWNobWVudFZpZXdzKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF0dGFjaG1lbnRzLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWRDYW5jZWwoKCkgPT4ge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkbywgZWRpdG9yIGRpc3Bvc2VzIGl0c2VsZlxuXHRcdH0pKTtcblx0fVxuXG5cdGdldFNjcmVlbnNob3RzKCk6IHJlYWRvbmx5IElTY3JlZW5zaG90W10ge1xuXHRcdHJldHVybiB0aGlzLnNjcmVlbnNob3RzO1xuXHR9XG5cblx0Z2V0UmVjb3JkaW5ncygpOiByZWFkb25seSB7IGZpbGVQYXRoOiBzdHJpbmc7IGR1cmF0aW9uTXM6IG51bWJlcjsgdGh1bWJuYWlsRGF0YVVybD86IHN0cmluZyB9W10ge1xuXHRcdHJldHVybiB0aGlzLnJlY29yZGluZ3M7XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGFjZSB0aGUgY3VycmVudCBhdHRhY2htZW50cyB3aXRoIGEgcHJldmlvdXNseS1jYXB0dXJlZCBzZXQuIFVzZWQgd2hlbiB0aGVcblx0ICogaXNzdWUgcmVwb3J0ZXIgZWRpdG9yIGlzIG1vdmVkIGJldHdlZW4gdGhlIG1haW4gZWRpdG9yIGFyZWEgYW5kIGEgbW9kYWwgZWRpdG9yXG5cdCAqIHBhcnQgaW4gdGhlIEFnZW50cyBXaW5kb3csIHdoaWNoIHJlYnVpbGRzIHRoZSB3aXphcmQgYW5kIHdvdWxkIG90aGVyd2lzZSBkcm9wXG5cdCAqIHRoZSBpbi1tZW1vcnkgc2NyZWVuc2hvdHMgYW5kIHJlY29yZGluZ3MuIERvZXMgbm90IGZpcmVcblx0ICogYG9uRGlkQ2hhbmdlQXR0YWNobWVudHNgIHNpbmNlIHRoZSBob3N0IGlzIHRoZSBzb3VyY2Ugb2YgdGhpcyBzdGF0ZS5cblx0ICovXG5cdHJlc3RvcmVBdHRhY2htZW50cyhzY3JlZW5zaG90czogcmVhZG9ubHkgSVNjcmVlbnNob3RbXSwgcmVjb3JkaW5nczogcmVhZG9ubHkgeyBmaWxlUGF0aDogc3RyaW5nOyBkdXJhdGlvbk1zOiBudW1iZXI7IHRodW1ibmFpbERhdGFVcmw/OiBzdHJpbmcgfVtdKTogdm9pZCB7XG5cdFx0dGhpcy5zY3JlZW5zaG90cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuc2NyZWVuc2hvdHMucHVzaCguLi5zY3JlZW5zaG90cy5zbGljZSgwLCBNQVhfQVRUQUNITUVOVFMpKTtcblx0XHR0aGlzLnJlY29yZGluZ3MubGVuZ3RoID0gMDtcblx0XHR0aGlzLnJlY29yZGluZ3MucHVzaCguLi5yZWNvcmRpbmdzLnNsaWNlKDAsIE1hdGgubWF4KDAsIE1BWF9BVFRBQ0hNRU5UUyAtIHRoaXMuc2NyZWVuc2hvdHMubGVuZ3RoKSkpO1xuXHRcdHRoaXMudXBkYXRlQXR0YWNobWVudFZpZXdzKCk7XG5cdFx0dGhpcy51cGRhdGVBdHRhY2htZW50QnV0dG9ucygpO1xuXHRcdHRoaXMudXBkYXRlU3RlcFVJKCk7XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkSXNzdWVCb2R5KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0aGlzLmRlc2NyaXB0aW9uVGV4dGFyZWEudmFsdWUudHJpbSgpO1xuXHRcdHRoaXMubW9kZWwudXBkYXRlKHtcblx0XHRcdGlzc3VlRGVzY3JpcHRpb246IGRlc2NyaXB0aW9uLFxuXHRcdFx0aXNzdWVUeXBlOiB0aGlzLnNlbGVjdGVkSXNzdWVUeXBlID8/IElzc3VlVHlwZS5CdWcsXG5cdFx0XHRpbmNsdWRlU3lzdGVtSW5mbzogdGhpcy5pbmNsdWRlU3lzdGVtSW5mbyxcblx0XHRcdGluY2x1ZGVQcm9jZXNzSW5mbzogdGhpcy5pbmNsdWRlUHJvY2Vzc0luZm8sXG5cdFx0XHRpbmNsdWRlV29ya3NwYWNlSW5mbzogdGhpcy5pbmNsdWRlV29ya3NwYWNlSW5mbyxcblx0XHRcdGluY2x1ZGVFeHRlbnNpb25zOiB0aGlzLmluY2x1ZGVFeHRlbnNpb25zLFxuXHRcdFx0aW5jbHVkZUV4cGVyaW1lbnRzOiB0aGlzLmluY2x1ZGVFeHBlcmltZW50cyxcblx0XHRcdGluY2x1ZGVFeHRlbnNpb25EYXRhOiB0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5tb2RlbC5nZXREYXRhKCk7XG5cdFx0Y29uc3Qgc2VjdGlvbnM6IHN0cmluZ1tdID0gW1xuXHRcdFx0YCMjIyBEZXNjcmlwdGlvblxcblxcbiR7ZGVzY3JpcHRpb259YCxcblx0XHRcdHRoaXMuZ2VuZXJhdGVJc3N1ZURldGFpbHNNZCgpLFxuXHRcdF07XG5cblx0XHRpZiAodGhpcy5pbmNsdWRlRXh0ZW5zaW9uRGF0YSAmJiBtb2RlbERhdGEuZXh0ZW5zaW9uRGF0YSkge1xuXHRcdFx0c2VjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZURldGFpbHMoJ0V4dGVuc2lvbiBEYXRhJywgbW9kZWxEYXRhLmV4dGVuc2lvbkRhdGEpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbmNsdWRlU3lzdGVtSW5mbyAmJiAobW9kZWxEYXRhLnZlcnNpb25JbmZvIHx8IG1vZGVsRGF0YS5zeXN0ZW1JbmZvIHx8IG1vZGVsRGF0YS5zeXN0ZW1JbmZvV2ViKSkge1xuXHRcdFx0c2VjdGlvbnMucHVzaCh0aGlzLmdlbmVyYXRlU3lzdGVtSW5mb01kKCkpO1xuXHRcdH1cblxuXHRcdGlmICghbW9kZWxEYXRhLmZpbGVPbkV4dGVuc2lvbiAmJiAhbW9kZWxEYXRhLmZpbGVPbk1hcmtldHBsYWNlICYmIHRoaXMuaW5jbHVkZUV4dGVuc2lvbnMpIHtcblx0XHRcdHNlY3Rpb25zLnB1c2godGhpcy5nZW5lcmF0ZUV4dGVuc2lvbnNNZCgpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbmNsdWRlRXhwZXJpbWVudHMgJiYgbW9kZWxEYXRhLmV4cGVyaW1lbnRJbmZvKSB7XG5cdFx0XHRzZWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlRGV0YWlscygnQS9CIEV4cGVyaW1lbnRzJywgdGhpcy5jcmVhdGVDb2RlQmxvY2sobW9kZWxEYXRhLmV4cGVyaW1lbnRJbmZvKSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNlbGVjdGVkSXNzdWVUeXBlID09PSBJc3N1ZVR5cGUuUGVyZm9ybWFuY2VJc3N1ZSAmJiAhbW9kZWxEYXRhLmZpbGVPbk1hcmtldHBsYWNlKSB7XG5cdFx0XHRpZiAodGhpcy5pbmNsdWRlUHJvY2Vzc0luZm8gJiYgbW9kZWxEYXRhLnByb2Nlc3NJbmZvKSB7XG5cdFx0XHRcdHNlY3Rpb25zLnB1c2godGhpcy5jcmVhdGVEZXRhaWxzKCdSdW5uaW5nIFByb2Nlc3NlcycsIHRoaXMuY3JlYXRlQ29kZUJsb2NrKG1vZGVsRGF0YS5wcm9jZXNzSW5mbykpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmluY2x1ZGVXb3Jrc3BhY2VJbmZvICYmIG1vZGVsRGF0YS53b3Jrc3BhY2VJbmZvKSB7XG5cdFx0XHRcdHNlY3Rpb25zLnB1c2godGhpcy5jcmVhdGVEZXRhaWxzKCdXb3Jrc3BhY2UgTWV0YWRhdGEnLCB0aGlzLmNyZWF0ZUNvZGVCbG9jayhtb2RlbERhdGEud29ya3NwYWNlSW5mbykpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZWN0aW9ucy5wdXNoKCc8IS0tIGdlbmVyYXRlZCBieSBpc3N1ZSByZXBvcnRlciAtLT4nKTtcblxuXHRcdHJldHVybiBzZWN0aW9ucy5qb2luKCdcXG5cXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVJc3N1ZURldGFpbHNNZCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1vZGVsRGF0YSA9IHRoaXMubW9kZWwuZ2V0RGF0YSgpO1xuXHRcdGNvbnN0IHJvd3M6IFtzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZF1bXSA9IFtcblx0XHRcdFsnSXNzdWUgQ2F0ZWdvcnknLCB0aGlzLmdldElzc3VlVHlwZVRpdGxlKHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgPz8gSXNzdWVUeXBlLkJ1ZyldLFxuXHRcdFx0WydUYXJnZXQnLCB0aGlzLmdldElzc3VlU291cmNlTGFiZWwoKV0sXG5cdFx0XHRbJ1ZTIENvZGUgVmVyc2lvbicsIG1vZGVsRGF0YS52ZXJzaW9uSW5mbz8udnNjb2RlVmVyc2lvbiA/PyBwcm9kdWN0LnZlcnNpb25dLFxuXHRcdFx0WydPUyBWZXJzaW9uJywgbW9kZWxEYXRhLnZlcnNpb25JbmZvPy5vcyA/PyBtb2RlbERhdGEuc3lzdGVtSW5mbz8ub3NdLFxuXHRcdF07XG5cblx0XHRpZiAodGhpcy5zZWxlY3RlZElzc3VlU291cmNlID09PSBJc3N1ZVNvdXJjZS5FeHRlbnNpb24gJiYgdGhpcy5zZWxlY3RlZEV4dGVuc2lvbikge1xuXHRcdFx0cm93cy5wdXNoKFxuXHRcdFx0XHRbJ0V4dGVuc2lvbiBJZGVudGlmaWVyJywgdGhpcy5zZWxlY3RlZEV4dGVuc2lvbi5pZF0sXG5cdFx0XHRcdFsnRXh0ZW5zaW9uIFZlcnNpb24nLCB0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uLnZlcnNpb25dLFxuXHRcdFx0XHRbJ0V4dGVuc2lvbiBQdWJsaXNoZXInLCB0aGlzLnNlbGVjdGVkRXh0ZW5zaW9uLnB1Ymxpc2hlcl0sXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBgIyMjIElzc3VlIERldGFpbHNcXG5cXG4ke3RoaXMuY3JlYXRlTWFya2Rvd25UYWJsZShyb3dzKX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZVN5c3RlbUluZm9NZCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1vZGVsRGF0YSA9IHRoaXMubW9kZWwuZ2V0RGF0YSgpO1xuXHRcdGNvbnN0IHJvd3M6IFtzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZF1bXSA9IFtdO1xuXG5cdFx0aWYgKG1vZGVsRGF0YS52ZXJzaW9uSW5mbykge1xuXHRcdFx0cm93cy5wdXNoKFxuXHRcdFx0XHRbJ1ZTIENvZGUgVmVyc2lvbicsIG1vZGVsRGF0YS52ZXJzaW9uSW5mby52c2NvZGVWZXJzaW9uXSxcblx0XHRcdFx0WydPUyBWZXJzaW9uJywgbW9kZWxEYXRhLnZlcnNpb25JbmZvLm9zXSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsRGF0YS5zeXN0ZW1JbmZvKSB7XG5cdFx0XHRyb3dzLnB1c2goXG5cdFx0XHRcdFsnQ1BVcycsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLmNwdXNdLFxuXHRcdFx0XHRbJ0dQVSBTdGF0dXMnLCBPYmplY3Qua2V5cyhtb2RlbERhdGEuc3lzdGVtSW5mby5ncHVTdGF0dXMpLm1hcChrZXkgPT4gYCR7a2V5fTogJHttb2RlbERhdGEuc3lzdGVtSW5mbyEuZ3B1U3RhdHVzW2tleV19YCkuam9pbignPGJyPicpXSxcblx0XHRcdFx0WydMb2FkIChhdmcpJywgbW9kZWxEYXRhLnN5c3RlbUluZm8ubG9hZF0sXG5cdFx0XHRcdFsnTWVtb3J5IChTeXN0ZW0pJywgbW9kZWxEYXRhLnN5c3RlbUluZm8ubWVtb3J5XSxcblx0XHRcdFx0WydQcm9jZXNzIEFyZ3YnLCBtb2RlbERhdGEuc3lzdGVtSW5mby5wcm9jZXNzQXJnc10sXG5cdFx0XHRcdFsnU2NyZWVuIFJlYWRlcicsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLnNjcmVlblJlYWRlcl0sXG5cdFx0XHRcdFsnVk0nLCBtb2RlbERhdGEuc3lzdGVtSW5mby52bUhpbnRdLFxuXHRcdFx0KTtcblxuXHRcdFx0aWYgKG1vZGVsRGF0YS5zeXN0ZW1JbmZvLmxpbnV4RW52KSB7XG5cdFx0XHRcdHJvd3MucHVzaChcblx0XHRcdFx0XHRbJ0RFU0tUT1BfU0VTU0lPTicsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLmxpbnV4RW52LmRlc2t0b3BTZXNzaW9uXSxcblx0XHRcdFx0XHRbJ1hER19DVVJSRU5UX0RFU0tUT1AnLCBtb2RlbERhdGEuc3lzdGVtSW5mby5saW51eEVudi54ZGdDdXJyZW50RGVza3RvcF0sXG5cdFx0XHRcdFx0WydYREdfU0VTU0lPTl9ERVNLVE9QJywgbW9kZWxEYXRhLnN5c3RlbUluZm8ubGludXhFbnYueGRnU2Vzc2lvbkRlc2t0b3BdLFxuXHRcdFx0XHRcdFsnWERHX1NFU1NJT05fVFlQRScsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvLmxpbnV4RW52LnhkZ1Nlc3Npb25UeXBlXSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCByZW1vdGUgb2YgbW9kZWxEYXRhLnN5c3RlbUluZm8ucmVtb3RlRGF0YSkge1xuXHRcdFx0XHRpZiAoaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IocmVtb3RlKSkge1xuXHRcdFx0XHRcdHJvd3MucHVzaChbJ1JlbW90ZSBFcnJvcicsIHJlbW90ZS5lcnJvck1lc3NhZ2VdKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyb3dzLnB1c2goXG5cdFx0XHRcdFx0XHRbJ1JlbW90ZScsIHJlbW90ZS5sYXRlbmN5ID8gYCR7cmVtb3RlLmhvc3ROYW1lfSAobGF0ZW5jeTogJHtyZW1vdGUubGF0ZW5jeS5jdXJyZW50LnRvRml4ZWQoMil9bXMgbGFzdCwgJHtyZW1vdGUubGF0ZW5jeS5hdmVyYWdlLnRvRml4ZWQoMil9bXMgYXZlcmFnZSlgIDogcmVtb3RlLmhvc3ROYW1lXSxcblx0XHRcdFx0XHRcdFsnUmVtb3RlIE9TJywgcmVtb3RlLm1hY2hpbmVJbmZvLm9zXSxcblx0XHRcdFx0XHRcdFsnUmVtb3RlIENQVXMnLCByZW1vdGUubWFjaGluZUluZm8uY3B1c10sXG5cdFx0XHRcdFx0XHRbJ1JlbW90ZSBNZW1vcnkgKFN5c3RlbSknLCByZW1vdGUubWFjaGluZUluZm8ubWVtb3J5XSxcblx0XHRcdFx0XHRcdFsnUmVtb3RlIFZNJywgcmVtb3RlLm1hY2hpbmVJbmZvLnZtSGludF0sXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtb2RlbERhdGEuc3lzdGVtSW5mb1dlYikge1xuXHRcdFx0cm93cy5wdXNoKFsnVXNlciBBZ2VudCcsIG1vZGVsRGF0YS5zeXN0ZW1JbmZvV2ViXSk7XG5cdFx0fVxuXHRcdHJvd3MucHVzaChbJ0luc3RhbGxhdGlvbiBwdXJlJywgU3RyaW5nKG1vZGVsRGF0YS5pc0luc3RhbGxhdGlvblB1cmUgPz8gdHJ1ZSldKTtcblxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZURldGFpbHMoJ1N5c3RlbSBJbmZvJywgdGhpcy5jcmVhdGVNYXJrZG93blRhYmxlKHJvd3MpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVFeHRlbnNpb25zTWQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLm1vZGVsLmdldERhdGEoKTtcblx0XHRjb25zdCBub25UaGVtZUV4dGVuc2lvbnMgPSAobW9kZWxEYXRhLmVuYWJsZWROb25UaGVtZUV4dGVzaW9ucyA/PyBtb2RlbERhdGEuYWxsRXh0ZW5zaW9ucy5maWx0ZXIoZXh0ZW5zaW9uID0+ICFleHRlbnNpb24uaXNUaGVtZSAmJiAhZXh0ZW5zaW9uLmlzQnVpbHRpbikpO1xuXHRcdGlmIChtb2RlbERhdGEuZXh0ZW5zaW9uc0Rpc2FibGVkKSB7XG5cdFx0XHRyZXR1cm4gJyMjIyBFeHRlbnNpb25zXFxuXFxuRXh0ZW5zaW9ucyBkaXNhYmxlZC4nO1xuXHRcdH1cblxuXHRcdGlmICghbm9uVGhlbWVFeHRlbnNpb25zLmxlbmd0aCAmJiAhbW9kZWxEYXRhLm51bWJlck9mVGhlbWVFeHRlc2lvbnMpIHtcblx0XHRcdHJldHVybiAnIyMjIEV4dGVuc2lvbnNcXG5cXG5FeHRlbnNpb25zOiBub25lJztcblx0XHR9XG5cblx0XHRjb25zdCByb3dzID0gbm9uVGhlbWVFeHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gW1xuXHRcdFx0ZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0ZXh0ZW5zaW9uLmlkLFxuXHRcdFx0ZXh0ZW5zaW9uLnB1Ymxpc2hlciA/PyAnTi9BJyxcblx0XHRcdGV4dGVuc2lvbi52ZXJzaW9uLFxuXHRcdF0gYXMgW3N0cmluZywgc3RyaW5nLCBzdHJpbmcsIHN0cmluZ10pO1xuXHRcdGNvbnN0IGRldGFpbHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKHJvd3MubGVuZ3RoKSB7XG5cdFx0XHRkZXRhaWxzLnB1c2godGhpcy5jcmVhdGVNYXJrZG93blRhYmxlKHJvd3MsIFsnTmFtZScsICdJZGVudGlmaWVyJywgJ0F1dGhvcicsICdWZXJzaW9uJ10pKTtcblx0XHR9XG5cdFx0aWYgKG1vZGVsRGF0YS5udW1iZXJPZlRoZW1lRXh0ZXNpb25zKSB7XG5cdFx0XHRkZXRhaWxzLnB1c2goYFRoZW1lIGV4dGVuc2lvbnM6ICR7bW9kZWxEYXRhLm51bWJlck9mVGhlbWVFeHRlc2lvbnN9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlRGV0YWlscyhgRXh0ZW5zaW9ucyAoJHtub25UaGVtZUV4dGVuc2lvbnMubGVuZ3RofSlgLCBkZXRhaWxzLmpvaW4oJ1xcblxcbicpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SXNzdWVUeXBlVGl0bGUoaXNzdWVUeXBlOiBJc3N1ZVR5cGUpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoaXNzdWVUeXBlKSB7XG5cdFx0XHRjYXNlIElzc3VlVHlwZS5CdWc6XG5cdFx0XHRcdHJldHVybiAnQnVnJztcblx0XHRcdGNhc2UgSXNzdWVUeXBlLlBlcmZvcm1hbmNlSXNzdWU6XG5cdFx0XHRcdHJldHVybiAnUGVyZm9ybWFuY2UgSXNzdWUnO1xuXHRcdFx0Y2FzZSBJc3N1ZVR5cGUuRmVhdHVyZVJlcXVlc3Q6XG5cdFx0XHRcdHJldHVybiAnRmVhdHVyZSBSZXF1ZXN0Jztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZURldGFpbHMoc3VtbWFyeTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgPGRldGFpbHM+XG48c3VtbWFyeT4ke3N1bW1hcnl9PC9zdW1tYXJ5PlxuXG4ke2NvbnRlbnR9XG5cbjwvZGV0YWlscz5gO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb2RlQmxvY2soY29udGVudDogc3RyaW5nLCBsYW5ndWFnZSA9ICcnKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYFxcYFxcYFxcYCR7bGFuZ3VhZ2V9XG4ke2NvbnRlbnQudHJpbUVuZCgpfVxuXFxgXFxgXFxgYDtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTWFya2Rvd25UYWJsZShyb3dzOiByZWFkb25seSAocmVhZG9ubHkgKHN0cmluZyB8IHVuZGVmaW5lZClbXSlbXSwgaGVhZGVyczogcmVhZG9ubHkgc3RyaW5nW10gPSBbJ0l0ZW0nLCAnVmFsdWUnXSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2hlYWRlcnMubWFwKGhlYWRlciA9PiB0aGlzLmVzY2FwZU1hcmtkb3duVGFibGVDZWxsKGhlYWRlcikpLmpvaW4oJ3wnKX1cbiR7aGVhZGVycy5tYXAoKCkgPT4gJy0tLScpLmpvaW4oJ3wnKX1cbiR7cm93cy5tYXAocm93ID0+IHJvdy5tYXAodmFsdWUgPT4gdGhpcy5lc2NhcGVNYXJrZG93blRhYmxlQ2VsbCh2YWx1ZSA/PyAnJykpLmpvaW4oJ3wnKSkuam9pbignXFxuJyl9YDtcblx0fVxuXG5cdHByaXZhdGUgZXNjYXBlTWFya2Rvd25UYWJsZUNlbGwodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoL1xccj9cXG4vZywgJzxicj4nKS5yZXBsYWNlKC9cXHwvZywgJ1xcXFx8Jyk7XG5cdH1cblxuXHRzZXRVcGRhdGVBdmFpbGFibGUoc2hvd1VwZGF0ZUJhbm5lcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc2hvd1VwZGF0ZUJhbm5lciA9IHNob3dVcGRhdGVCYW5uZXI7XG5cdFx0dGhpcy51cGRhdGVCYW5uZXIuc3R5bGUuZGlzcGxheSA9IHNob3dVcGRhdGVCYW5uZXIgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMud2l6YXJkUGFuZWwuZm9jdXMoKTtcblx0fVxuXG5cdGdldFBhbmVsKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy53aXphcmRQYW5lbDtcblx0fVxuXG5cdGdldCByZWNvcmRpbmdTdGF0ZSgpOiBSZWNvcmRpbmdTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudFJlY29yZGluZ1N0YXRlO1xuXHR9XG5cblx0aGlkZUZsb2F0aW5nQmFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmZsb2F0aW5nQmFyKSB7XG5cdFx0XHR0aGlzLmZsb2F0aW5nQmFyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0c2hvd0Zsb2F0aW5nQmFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmZsb2F0aW5nQmFyKSB7XG5cdFx0XHR0aGlzLmZsb2F0aW5nQmFyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cdH1cblxuXHRnZXQgc2hvdWxkSGlkZVRvb2xiYXJGb3JDYXB0dXJlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oaWRlVG9vbGJhckluU2NyZWVuc2hvdHM7XG5cdH1cblxuXHQvKiogUmUtcGFyZW50IHRoZSBmbG9hdGluZyBiYXIgaW50byB0aGUgd2l6YXJkJ3MgY3VycmVudCB3aW5kb3cuICovXG5cdHJlcGFyZW50RmxvYXRpbmdCYXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmZsb2F0aW5nQmFyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0Ly8gTW91bnQgaW5zaWRlIC5tb25hY28td29ya2JlbmNoIHNvIHRoZW1lIENTUyB2YXJzIGNhc2NhZGUuIEZhbGwgYmFjayB0b1xuXHRcdC8vIGRvY3VtZW50LmJvZHkgd2hlbiBubyB3b3JrYmVuY2ggcm9vdCBpcyBwcmVzZW50IChzaG91bGRuJ3QgaGFwcGVuIGluXG5cdFx0Ly8gcHJhY3RpY2UgYnV0IGtlZXBzIHRoZSBiYXIgdmlzaWJsZSByZWdhcmRsZXNzKS5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCB3b3JrYmVuY2ggPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLm1vbmFjby13b3JrYmVuY2gnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0Y29uc3QgbW91bnRUYXJnZXQgPSB3b3JrYmVuY2ggPz8gdGFyZ2V0V2luZG93LmRvY3VtZW50LmJvZHk7XG5cdFx0aWYgKHRoaXMuZmxvYXRpbmdCYXIucGFyZW50RWxlbWVudCAhPT0gbW91bnRUYXJnZXQpIHtcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIucmVtb3ZlKCk7XG5cdFx0XHRtb3VudFRhcmdldC5hcHBlbmRDaGlsZCh0aGlzLmZsb2F0aW5nQmFyKTtcblx0XHRcdC8vIFJlc2V0IHBvc2l0aW9uIHNvIGl0IGFwcGVhcnMgaW4gdGhlIG5ldyB3aW5kb3dcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIuc3R5bGUubGVmdCA9ICcnO1xuXHRcdFx0dGhpcy5mbG9hdGluZ0Jhci5zdHlsZS50b3AgPSAnJztcblx0XHRcdHRoaXMuZmxvYXRpbmdCYXIuc3R5bGUucmlnaHQgPSAnMzAlJztcblx0XHR9XG5cdH1cblxuXHQvKiogVXBkYXRlIHRoZSBpbnRlcm5hbCBtb2RlbCB3aXRoIGFkZGl0aW9uYWwgZGF0YSBsb2FkZWQgYXN5bmNocm9ub3VzbHkgKi9cblx0dXBkYXRlTW9kZWwobmV3RGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnVwZGF0ZShuZXdEYXRhKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShuZXdEYXRhLmFsbEV4dGVuc2lvbnMpKSB7XG5cdFx0XHR0aGlzLmRhdGEuZW5hYmxlZEV4dGVuc2lvbnMgPSBuZXdEYXRhLmFsbEV4dGVuc2lvbnMgYXMgSXNzdWVSZXBvcnRlckV4dGVuc2lvbkRhdGFbXTtcblx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9uT3B0aW9ucygpO1xuXHRcdFx0dGhpcy51cGRhdGVJc3N1ZVNvdXJjZUZsYWdzKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUlzc3VlU291cmNlQnV0dG9ucygpO1xuXHRcdH1cblx0XHQvLyBSZWZyZXNoIHJldmlldyBkZXRhaWxzIGlmIHdlJ3JlIG9uIHRoZSByZXZpZXcgc3RlcCAoYXN5bmMgZGF0YSBtYXkgaGF2ZSBhcnJpdmVkKVxuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwID09PSBXaXphcmRTdGVwLlJldmlldykge1xuXHRcdFx0dGhpcy51cGRhdGVSZXZpZXdEZXRhaWxzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIENhbGxlZCBvbmNlIHBlcmZvcm1hbmNlIGluZm8gaGFzIHJlc29sdmVkOyBzdXBwcmVzc2VzIFwiTG9hZGluZ1x1MjAyNlwiIHBsYWNlaG9sZGVycy4gKi9cblx0bWFya1BlcmZvcm1hbmNlSW5mb0xvYWRlZCgpOiB2b2lkIHtcblx0XHR0aGlzLnBlcmZvcm1hbmNlSW5mb0xvYWRlZCA9IHRydWU7XG5cdFx0aWYgKHRoaXMuY3VycmVudFN0ZXAgPT09IFdpemFyZFN0ZXAuUmV2aWV3KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVJldmlld0RldGFpbHMoKTtcblx0XHRcdC8vIFJlLWVuYWJsZSB0aGUgUHJldmlldyBidXR0b24gbm93IHRoYXQgZGlhZ25vc3RpY3MgYXJlIHJlYWR5LlxuXHRcdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0XHR9XG5cdH1cblxuXHRoYXNVbnNhdmVkQ2hhbmdlcygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5wcmV2aWV3T3BlbmVkICYmIHRoaXMucHJldmlld2VkRHJhZnRLZXkgPT09IHRoaXMuZ2V0RHJhZnRLZXkoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5oYXNVc2VySW5wdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgaGFzVXNlcklucHV0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIShcblx0XHRcdHRoaXMuaGFzRGVzY3JpcHRpb25Db250ZW50KCkgfHxcblx0XHRcdHRoaXMudGl0bGVJbnB1dC52YWx1ZS50cmltKCkgfHxcblx0XHRcdHRoaXMuc2VsZWN0ZWRJc3N1ZVR5cGUgIT09IHVuZGVmaW5lZCB8fFxuXHRcdFx0dGhpcy5zY3JlZW5zaG90cy5sZW5ndGggPiAwIHx8XG5cdFx0XHR0aGlzLnJlY29yZGluZ3MubGVuZ3RoID4gMFxuXHRcdCk7XG5cdH1cblxuXHRtYXJrUHJldmlld09wZW5lZCgpOiB2b2lkIHtcblx0XHR0aGlzLnByZXZpZXdPcGVuZWQgPSB0cnVlO1xuXHRcdHRoaXMucHJldmlld2VkRHJhZnRLZXkgPSB0aGlzLmdldERyYWZ0S2V5KCk7XG5cdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RHJhZnRLZXkoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0dGl0bGU6IHRoaXMudGl0bGVJbnB1dC52YWx1ZS50cmltKCksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvblRleHRhcmVhLnZhbHVlLnRyaW0oKSxcblx0XHRcdGlzc3VlVHlwZTogdGhpcy5zZWxlY3RlZElzc3VlVHlwZSxcblx0XHRcdGlzc3VlU291cmNlOiB0aGlzLnNlbGVjdGVkSXNzdWVTb3VyY2UsXG5cdFx0XHRleHRlbnNpb25JZDogdGhpcy5zZWxlY3RlZEV4dGVuc2lvbj8uaWQsXG5cdFx0XHRpbmNsdWRlU3lzdGVtSW5mbzogdGhpcy5pbmNsdWRlU3lzdGVtSW5mbyxcblx0XHRcdGluY2x1ZGVQcm9jZXNzSW5mbzogdGhpcy5pbmNsdWRlUHJvY2Vzc0luZm8sXG5cdFx0XHRpbmNsdWRlV29ya3NwYWNlSW5mbzogdGhpcy5pbmNsdWRlV29ya3NwYWNlSW5mbyxcblx0XHRcdGluY2x1ZGVFeHRlbnNpb25zOiB0aGlzLmluY2x1ZGVFeHRlbnNpb25zLFxuXHRcdFx0aW5jbHVkZUV4cGVyaW1lbnRzOiB0aGlzLmluY2x1ZGVFeHBlcmltZW50cyxcblx0XHRcdGluY2x1ZGVFeHRlbnNpb25EYXRhOiB0aGlzLmluY2x1ZGVFeHRlbnNpb25EYXRhLFxuXHRcdFx0c2NyZWVuc2hvdHM6IHRoaXMuc2NyZWVuc2hvdHMubWFwKHNjcmVlbnNob3QgPT4gc2NyZWVuc2hvdC5hbm5vdGF0ZWREYXRhVXJsID8/IHNjcmVlbnNob3QuZGF0YVVybCksXG5cdFx0XHRyZWNvcmRpbmdzOiB0aGlzLnJlY29yZGluZ3MubWFwKHJlY29yZGluZyA9PiByZWNvcmRpbmcuZmlsZVBhdGgpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqIFNldCB0aGUgdGl0bGUgaW5wdXQgdmFsdWUgKGUuZy4sIGZyb20gQUkgZ2VuZXJhdGlvbikgKi9cblx0c2V0R2VuZXJhdGVkVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudGl0bGVJbnB1dC52YWx1ZSA9IHRpdGxlO1xuXHRcdGlmICh0aXRsZS50cmltKCkpIHtcblx0XHRcdHRoaXMuc2V0RmllbGRFcnJvcih0aGlzLnRpdGxlSW5wdXQuZWxlbWVudCwgdGhpcy50aXRsZUVycm9yLCBmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMucmVzZXRHZW5lcmF0ZUJ1dHRvbigpO1xuXHR9XG5cblx0cmVzZXRHZW5lcmF0ZUJ1dHRvbigpOiB2b2lkIHtcblx0XHR0aGlzLmdlbmVyYXRlVGl0bGVCdG4ubGFiZWwgPSBgJChzcGFya2xlKSAke2xvY2FsaXplKCdnZW5lcmF0ZVRpdGxlQnRuJywgXCJHZW5lcmF0ZSBmcm9tIGRlc2NyaXB0aW9uXCIpfWA7XG5cdFx0dGhpcy5nZW5lcmF0ZVRpdGxlQnRuLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnbG9hZGluZycpO1xuXHRcdHRoaXMuZ2VuZXJhdGVUaXRsZUJ0bi5lbGVtZW50LnN0eWxlLm1pbldpZHRoID0gJyc7XG5cdFx0dGhpcy5nZW5lcmF0ZVRpdGxlQnRuLmVuYWJsZWQgPSB0aGlzLmhhc0Rlc2NyaXB0aW9uQ29udGVudCgpO1xuXHR9XG5cblx0LyoqIFNob3cgYSBcIkNsb3NlXCIgYnV0dG9uIG5leHQgdG8gdGhlIHN1Ym1pdCBidXR0b24gYWZ0ZXIgc3VjY2Vzc2Z1bCBzdWJtaXNzaW9uICovXG5cdHNob3dDbG9zZUJ1dHRvbigpOiB2b2lkIHtcblx0XHQvLyBBZGQgY2xvc2UgYnV0dG9uIG5leHQgdG8gdGhlIGV4aXN0aW5nIHByZXZpZXcgYnV0dG9uXG5cdFx0Y29uc3QgbmF2ID0gdGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRpZiAobmF2ICYmICFuYXYucXVlcnlTZWxlY3RvcignLndpemFyZC1jbG9zZS1idG4nKSkge1xuXHRcdFx0dGhpcy5jbG9zZUJ1dHRvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24obmF2LCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0XHR0aGlzLmNsb3NlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2Nsb3NlVGFiJywgXCJDbG9zZVwiKTtcblx0XHRcdHRoaXMuY2xvc2VCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3aXphcmQtY2xvc2UtYnRuJyk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmNsb3NlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVTdGVwVUkoKTtcblx0fVxuXG5cdHNldFJlY29yZGluZ1N0YXRlKHN0YXRlOiBSZWNvcmRpbmdTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuY3VycmVudFJlY29yZGluZ1N0YXRlID0gc3RhdGU7XG5cblx0XHRpZiAoc3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLlJlY29yZGluZykge1xuXHRcdFx0dGhpcy5yZWNvcmRpbmdTdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHRjb25zdCBmb3JtYXRUaW1lID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlbGFwc2VkID0gTWF0aC5mbG9vcigoRGF0ZS5ub3coKSAtIHRoaXMucmVjb3JkaW5nU3RhcnRUaW1lKSAvIDEwMDApO1xuXHRcdFx0XHRjb25zdCBtaW5zID0gTWF0aC5mbG9vcihlbGFwc2VkIC8gNjApLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcblx0XHRcdFx0Y29uc3Qgc2VjcyA9IChlbGFwc2VkICUgNjApLnRvU3RyaW5nKCkucGFkU3RhcnQoMiwgJzAnKTtcblx0XHRcdFx0cmV0dXJuIGAke21pbnN9OiR7c2Vjc31gO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc3RvcExhYmVsID0gbG9jYWxpemUoJ3N0b3BSZWNvcmRpbmcnLCBcIlN0b3AgcmVjb3JkaW5nXCIpO1xuXHRcdFx0Y29uc3QgbWFrZUxhYmVsID0gKCkgPT4gYCQoc3RvcC1jaXJjbGUpICR7c3RvcExhYmVsfSAke2Zvcm1hdFRpbWUoKX1gO1xuXG5cdFx0XHRpZiAodGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4pIHtcblx0XHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdyZWNvcmRpbmcnKTtcblx0XHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4uZWxlbWVudC50aXRsZSA9IHN0b3BMYWJlbDtcblx0XHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4ubGFiZWwgPSBtYWtlTGFiZWwoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZWNvcmRpbmdFbGFwc2VkVGltZXIgPSBnZXRXaW5kb3codGhpcy5jb250YWluZXIpLnNldEludGVydmFsKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuKSB7XG5cdFx0XHRcdFx0dGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG4ubGFiZWwgPSBtYWtlTGFiZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMTAwMCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEJhY2sgdG8gaWRsZVxuXHRcdFx0aWYgKHRoaXMucmVjb3JkaW5nRWxhcHNlZFRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Z2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5jbGVhckludGVydmFsKHRoaXMucmVjb3JkaW5nRWxhcHNlZFRpbWVyKTtcblx0XHRcdFx0dGhpcy5yZWNvcmRpbmdFbGFwc2VkVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bikge1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3JlY29yZGluZycpO1xuXHRcdFx0XHR0aGlzLmNhcHR1cmVTdHJpcFJlY29yZEJ0bi5lbGVtZW50LnRpdGxlID0gbG9jYWxpemUoJ3JlY29yZFZpZGVvJywgXCJSZWNvcmQgdmlkZW9cIik7XG5cdFx0XHRcdHRoaXMuY2FwdHVyZVN0cmlwUmVjb3JkQnRuLmxhYmVsID0gYCQocmVjb3JkKSAke2xvY2FsaXplKCdyZWNvcmRWaWRlbycsIFwiUmVjb3JkIHZpZGVvXCIpfWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVTY3JlZW5zaG90VGh1bWJuYWlscygpO1xuXHRcdHRoaXMudXBkYXRlQXR0YWNobWVudEJ1dHRvbnMoKTtcblx0fVxuXG5cdGFkZFJlY29yZGluZyhmaWxlUGF0aDogc3RyaW5nLCBkdXJhdGlvbk1zOiBudW1iZXIsIHRodW1ibmFpbERhdGFVcmw/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnJlY29yZGluZ3MucHVzaCh7IGZpbGVQYXRoLCBkdXJhdGlvbk1zLCB0aHVtYm5haWxEYXRhVXJsIH0pO1xuXHRcdC8vIE5hdmlnYXRlIHRvIHRoZSBBdHRhY2htZW50cyBzdGVwIHNvIHRoZSB1c2VyIHNlZXMgdGhlIHNhdmVkIHJlY29yZGluZy5cblx0XHRpZiAodGhpcy5jdXJyZW50U3RlcCAhPT0gV2l6YXJkU3RlcC5BdHRhY2htZW50cykge1xuXHRcdFx0dGhpcy5zZXRTdGVwKFdpemFyZFN0ZXAuQXR0YWNobWVudHMpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUF0dGFjaG1lbnRWaWV3cygpO1xuXHRcdHRoaXMudXBkYXRlQXR0YWNobWVudEJ1dHRvbnMoKTtcblx0XHR0aGlzLnVwZGF0ZVN0ZXBVSSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXR0YWNobWVudHMuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBdHRhY2htZW50Vmlld3MoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVTY3JlZW5zaG90VGh1bWJuYWlscygpO1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwID09PSBXaXphcmRTdGVwLlJldmlldykge1xuXHRcdFx0dGhpcy51cGRhdGVSZXZpZXdEZXRhaWxzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRyaWdnZXIgYSBzY3JlZW5zaG90IGNhcHR1cmUgYXMgaWYgdGhlIHVzZXIgY2xpY2tlZCB0aGUgc2NyZWVuc2hvdCBidXR0b25cblx0ICogb24gdGhlIGZsb2F0aW5nIGNhcHR1cmUgYmFyLiBUaGUgZmxvYXRpbmcgYmFyIGlzIG1vdW50ZWQgYXQgdGhlIHdvcmtiZW5jaFxuXHQgKiByb290IGFuZCB0aGUgYnV0dG9uIGlzIGVuYWJsZWQgcmVnYXJkbGVzcyBvZiB0aGUgY3VycmVudCB3aXphcmQgc3RlcCwgc29cblx0ICogdGhlIHNob3J0Y3V0IHdvcmtzIGZyb20gYW55IHN0ZXAgd2l0aG91dCBjaGFuZ2luZyBpdC4gVGhlIGV4aXN0aW5nXG5cdCAqIGNhcHR1cmUgZmxvdyBvcGVucyB0aGUgYW5ub3RhdGlvbiBlZGl0b3IgYW5kIHJlLWFjdGl2YXRlcyB0aGUgaXNzdWVcblx0ICogcmVwb3J0ZXIgZWRpdG9yIHdoZW4gdGhlIHNjcmVlbnNob3QgaXMgYWRkZWQuXG5cdCAqXG5cdCAqIE5vLW9wIHdoZW4gdGhlIGNhcHR1cmUgYnV0dG9uIGlzIGRpc2FibGVkIChlLmcuIGF0IHRoZSBhdHRhY2htZW50IGxpbWl0KS5cblx0ICovXG5cdHRyaWdnZXJDYXB0dXJlU2NyZWVuc2hvdCgpOiB2b2lkIHtcblx0XHRjb25zdCBidG4gPSB0aGlzLmNhcHR1cmVTdHJpcENhcHR1cmVCdG47XG5cdFx0aWYgKCFidG4/LmVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YnRuLmVsZW1lbnQuY2xpY2soKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGUgc2NyZWVuIHJlY29yZGluZyBvbi9vZmYgYXMgaWYgdGhlIHVzZXIgY2xpY2tlZCB0aGUgcmVjb3JkIGJ1dHRvbi5cblx0ICogV29ya3MgZnJvbSBhbnkgc3RlcCB3aXRob3V0IGNoYW5naW5nIGl0LiBOby1vcCB3aGVuIHJlY29yZGluZyBpc24ndFxuXHQgKiBzdXBwb3J0ZWQgb3IgdGhlIHJlY29yZCBidXR0b24gaXMgZGlzYWJsZWQuXG5cdCAqL1xuXHR0cmlnZ2VyVG9nZ2xlUmVjb3JkaW5nKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5yZWNvcmRpbmdTdXBwb3J0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYnRuID0gdGhpcy5jYXB0dXJlU3RyaXBSZWNvcmRCdG47XG5cdFx0aWYgKCFidG4/LmVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YnRuLmVsZW1lbnQuY2xpY2soKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU2hvcnRjdXRLZXljYXAocGFyZW50OiBIVE1MRWxlbWVudCwga2V5YmluZGluZzogUmVzb2x2ZWRLZXliaW5kaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgS2V5YmluZGluZ0xhYmVsKHBhcmVudCwgT1MsIHsgLi4uZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcyB9KSk7XG5cdFx0bGFiZWwuc2V0KGtleWJpbmRpbmcpO1xuXHRcdGxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnd2l6YXJkLXNob3J0Y3V0Jyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnJlY29yZGluZ0VsYXBzZWRUaW1lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRnZXRXaW5kb3codGhpcy5jb250YWluZXIpLmNsZWFySW50ZXJ2YWwodGhpcy5yZWNvcmRpbmdFbGFwc2VkVGltZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zaW1pbGFySXNzdWVzSGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLnNpbWlsYXJJc3N1ZXNIYW5kbGUpO1xuXHRcdH1cblx0XHR0aGlzLnNpbWlsYXJJc3N1ZXNSZXF1ZXN0Kys7XG5cdFx0dGhpcy5yZXZpZXdSZW5kZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zaW1pbGFySXNzdWVzRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGVzY3JpcHRpb25HdWlkYW5jZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFN1Ym1pdC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0U2NyZWVuc2hvdC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0U3RhcnRSZWNvcmRpbmcuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVxdWVzdFN0b3BSZWNvcmRpbmcuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVxdWVzdE9wZW5SZWNvcmRpbmcuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkUmVxdWVzdE9wZW5TY3JlZW5zaG90LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUF0dGFjaG1lbnRzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlcXVlc3RHZW5lcmF0ZVRpdGxlLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxVQUFVO0FBQ25CLE9BQU87QUFDUCxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsMEJBQTBCLFdBQVcsaUJBQWlCO0FBQ2pHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYztBQUV2QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUE0QixpQkFBaUI7QUFDN0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxRQUFRLGlCQUFpQjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCLHVCQUF1Qix1QkFBdUIsOEJBQThCLDhCQUE4QjtBQUN4SSxPQUFPLGFBQWE7QUFDcEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXdELGFBQWEsaUJBQWlCO0FBQ3RGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQWlDLGtDQUFrQztBQUVuRSxNQUFNLGtCQUFrQjtBQUN4QixNQUFNLHFCQUFxQjtBQVEzQixJQUFXLGFBQVgsa0JBQVdBLGdCQUFYO0FBQ0MsRUFBQUEsd0JBQUEsaUJBQWMsS0FBZDtBQUNBLEVBQUFBLHdCQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLHdCQUFBLFlBQVMsS0FBVDtBQUhVLFNBQUFBO0FBQUEsR0FBQTtBQU1YLE1BQU0sYUFBYTtBQVVaLE1BQU0scUJBQXFCO0FBQUEsRUFvR2pDLFlBQ1MsTUFDUyxxQkFBOEIsT0FDOUIsV0FDQSxvQkFDQSxxQkFDQSx5QkFDakIscUJBQThCLE1BQ2IsMkJBQ0Esa0JB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
