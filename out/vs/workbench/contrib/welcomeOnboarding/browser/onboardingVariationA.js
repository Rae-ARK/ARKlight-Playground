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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { $, append, addDisposableListener, EventType, clearNode, getActiveWindow } from "../../../../base/browser/dom.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { isWindows, isMacintosh, isLinux } from "../../../../base/common/platform.js";
import { assertDefined } from "../../../../base/common/types.js";
import { FileAccess } from "../../../../base/common/network.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import product from "../../../../platform/product/common/product.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ChatSetupStrategy } from "../../chat/browser/chatSetup/chatSetup.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import {
  OnboardingStepId,
  ONBOARDING_STEPS,
  ONBOARDING_AI_PREFERENCE_OPTIONS,
  AiCollaborationMode,
  getOnboardingStepTitle,
  getOnboardingStepSubtitle,
  GHE_FULL_URI_REGEX,
  GheParseResultKind,
  parseGheInstanceInput
} from "../common/onboardingTypes.js";
assertDefined(product.defaultChatAgent, "Onboarding requires a default chat agent product configuration.");
const defaultChat = product.defaultChatAgent;
let OnboardingVariationA = class extends Disposable {
  constructor(layoutService, themeService, defaultAccountService, extensionGalleryService, extensionManagementService, configurationService, notificationService, fileService, pathService, telemetryService, commandService, accessibilityService) {
    super();
    this.layoutService = layoutService;
    this.themeService = themeService;
    this.defaultAccountService = defaultAccountService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionManagementService = extensionManagementService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.fileService = fileService;
    this.pathService = pathService;
    this.telemetryService = telemetryService;
    this.commandService = commandService;
    this.accessibilityService = accessibilityService;
    this._onDidComplete = this._register(new Emitter());
    this.onDidComplete = this._onDidComplete.event;
    this._onDidDismiss = this._register(new Emitter());
    this.onDidDismiss = this._onDidDismiss.event;
    this.currentStepIndex = 0;
    this.steps = ONBOARDING_STEPS;
    this.disposables = this._register(new DisposableStore());
    this.stepDisposables = this._register(new DisposableStore());
    this._isShowing = false;
    this.footerFocusableElements = [];
    this.stepFocusableElements = [];
    this.selectedThemeId = "dark-2026";
    this.selectedKeymapId = "vscode";
    this._userSignedIn = false;
    this.selectedAiMode = AiCollaborationMode.Balanced;
    this.enterpriseSignInUiState = "options";
    this.enterpriseInstanceValue = "";
    const currentTheme = this.themeService.getColorTheme();
    const allThemes = product.onboardingThemes ?? [];
    const matchingTheme = allThemes.find((t) => t.themeId === currentTheme.settingsId);
    if (matchingTheme) {
      this.selectedThemeId = matchingTheme.id;
    }
    this._detectInstalledEditors().then((ids) => {
      this._detectedEditorIds = ids;
    });
  }
  get isShowing() {
    return this._isShowing;
  }
  show() {
    if (this.overlay) {
      return;
    }
    this._isShowing = true;
    this.previouslyFocusedElement = getActiveWindow().document.activeElement;
    const container = this.layoutService.activeContainer;
    this.overlay = append(container, $(".onboarding-a-overlay"));
    this.overlay.setAttribute("role", "dialog");
    this.overlay.setAttribute("aria-modal", "true");
    this.overlay.setAttribute("aria-label", localize("onboarding.a.aria", "Welcome to Visual Studio Code"));
    this.card = append(this.overlay, $(".onboarding-a-card"));
    this.closeButton = append(this.card, $("button.onboarding-a-close-btn"));
    this.closeButton.type = "button";
    this.closeButton.setAttribute("aria-label", localize("onboarding.close", "Close"));
    this.closeButton.appendChild(renderIcon(Codicon.close));
    const header = append(this.card, $(".onboarding-a-header"));
    this.progressContainer = append(header, $(".onboarding-a-progress"));
    this.stepLabelEl = append(this.progressContainer, $("span.onboarding-a-step-label"));
    this._renderProgress();
    this.bodyEl = append(this.card, $(".onboarding-a-body"));
    this.titleEl = append(this.bodyEl, $("h2.onboarding-a-step-title"));
    this.subtitleEl = append(this.bodyEl, $("p.onboarding-a-step-subtitle"));
    this.contentEl = append(this.bodyEl, $(".onboarding-a-step-content"));
    this._renderStep();
    this._logStepView();
    const footer = append(this.card, $(".onboarding-a-footer"));
    this.footerLeft = append(footer, $(".onboarding-a-footer-left"));
    const footerRight = append(footer, $(".onboarding-a-footer-right"));
    this.backButton = append(footerRight, $("button.onboarding-a-btn.onboarding-a-btn-secondary"));
    this.backButton.textContent = localize("onboarding.back", "Back");
    this.backButton.type = "button";
    this.footerFocusableElements.push(this.backButton);
    this.nextButton = append(footerRight, $("button.onboarding-a-btn.onboarding-a-btn-primary"));
    this.nextButton.type = "button";
    this.footerFocusableElements.push(this.nextButton);
    this._updateButtonStates();
    this.disposables.add(addDisposableListener(this.closeButton, EventType.CLICK, () => {
      this._logAction("skip");
      this._dismiss("skip");
    }));
    this.disposables.add(addDisposableListener(this.backButton, EventType.CLICK, () => {
      if (this.currentStepIndex === 0 && this.enterpriseSignInUiState === "instance") {
        this._logAction("cancelEnterpriseInstancePrompt");
        this.enterpriseSignInWatch = void 0;
        this._setEnterpriseSignInUiState("options");
        return;
      }
      this._logAction("back");
      this._prevStep();
    }));
    this.disposables.add(addDisposableListener(this.nextButton, EventType.CLICK, () => {
      if (this._isLastStep()) {
        this._logAction("complete");
        this._dismiss("complete");
      } else if (this.currentStepIndex === 0) {
        this._logAction("continueWithoutSignIn");
        this._nextStep();
      } else {
        this._logAction("next");
        this._nextStep();
      }
    }));
    this.disposables.add(addDisposableListener(this.overlay, EventType.MOUSE_DOWN, (e) => {
      if (e.target === this.overlay) {
        this._dismiss("skip");
      }
    }));
    this.disposables.add(addDisposableListener(this.overlay, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      e.stopPropagation();
      if (event.keyCode === KeyCode.Escape) {
        e.preventDefault();
        this._dismiss("skip");
        return;
      }
      if (event.keyCode === KeyCode.Tab) {
        this._trapTab(e, event.shiftKey);
      }
    }));
    this.overlay.classList.add("entering");
    getActiveWindow().requestAnimationFrame(() => {
      this.overlay?.classList.remove("entering");
      this.overlay?.classList.add("visible");
    });
    this._focusCurrentStepElement();
  }
  _dismiss(reason) {
    if (!this.overlay) {
      return;
    }
    this._logAction("dismiss", void 0, reason);
    this.overlay.classList.remove("visible");
    this.overlay.classList.add("exiting");
    let handled = false;
    const onTransitionEnd = () => {
      if (handled) {
        return;
      }
      handled = true;
      this._removeFromDOM();
      if (reason === "complete") {
        this._onDidComplete.fire();
      }
      this._onDidDismiss.fire();
    };
    this.overlay.addEventListener("transitionend", onTransitionEnd, { once: true });
    setTimeout(onTransitionEnd, 400);
  }
  _nextStep() {
    if (this.currentStepIndex < this.steps.length - 1) {
      const leavingStep = this.steps[this.currentStepIndex];
      if (leavingStep === OnboardingStepId.SignIn) {
        this.enterpriseSignInUiState = "options";
        this.enterpriseInstanceValue = "";
        this.enterpriseSignInWatch = void 0;
      }
      if (leavingStep === OnboardingStepId.Personalize) {
        this._applyKeymap(this.selectedKeymapId);
      }
      this.currentStepIndex++;
      this._renderStep();
      this._renderProgress();
      this._updateButtonStates();
      this._focusCurrentStepElement();
      this._logStepView();
    }
  }
  _prevStep() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this._renderStep();
      this._renderProgress();
      this._updateButtonStates();
      this._focusCurrentStepElement();
      this._logStepView();
    }
  }
  _isLastStep() {
    return this.currentStepIndex === this.steps.length - 1;
  }
  _renderProgress() {
    if (!this.progressContainer || !this.stepLabelEl) {
      return;
    }
    clearNode(this.progressContainer);
    for (let i = 0; i < this.steps.length; i++) {
      const dot = append(this.progressContainer, $("span.onboarding-a-progress-dot"));
      if (i === this.currentStepIndex) {
        dot.classList.add("active");
      } else if (i < this.currentStepIndex) {
        dot.classList.add("completed");
      }
    }
    this.progressContainer.appendChild(this.stepLabelEl);
    this.stepLabelEl.textContent = localize(
      "onboarding.stepOf",
      "{0} of {1}",
      this.currentStepIndex + 1,
      this.steps.length
    );
  }
  _renderStep() {
    if (!this.titleEl || !this.subtitleEl || !this.contentEl) {
      return;
    }
    this.stepDisposables.clear();
    this.stepFocusableElements.length = 0;
    const stepId = this.steps[this.currentStepIndex];
    const useSignInHero = stepId === OnboardingStepId.SignIn;
    this.titleEl.style.display = useSignInHero ? "none" : "";
    this.subtitleEl.style.display = useSignInHero ? "none" : "";
    this.titleEl.textContent = getOnboardingStepTitle(stepId);
    if (stepId === OnboardingStepId.AgentSessions) {
      this._renderAgentSessionsSubtitle(this.subtitleEl);
    } else if (stepId === OnboardingStepId.Personalize) {
      this._renderPersonalizeSubtitle(this.subtitleEl);
    } else {
      this.subtitleEl.textContent = getOnboardingStepSubtitle(stepId);
    }
    clearNode(this.contentEl);
    switch (stepId) {
      case OnboardingStepId.SignIn:
        this._renderSignInStep(this.contentEl);
        break;
      case OnboardingStepId.Personalize:
        this._renderPersonalizeStep(this.contentEl);
        break;
      case OnboardingStepId.AiPreference:
        this._renderAiPreferenceStep(this.contentEl);
        break;
      case OnboardingStepId.AgentSessions:
        this._renderAgentSessionsStep(this.contentEl);
        break;
    }
    this.bodyEl?.setAttribute("aria-label", localize(
      "onboarding.step.aria",
      "Step {0} of {1}: {2}",
      this.currentStepIndex + 1,
      this.steps.length,
      getOnboardingStepTitle(stepId)
    ));
  }
  _updateButtonStates() {
    if (this.backButton) {
      const showEnterpriseBack = this.currentStepIndex === 0 && this.enterpriseSignInUiState === "instance";
      this.backButton.style.display = this.currentStepIndex === 0 && !showEnterpriseBack ? "none" : "";
    }
    if (this.nextButton) {
      if (this.currentStepIndex === 0) {
        if (this._userSignedIn) {
          this.nextButton.className = "onboarding-a-btn onboarding-a-btn-primary";
          this.nextButton.textContent = localize("onboarding.continue", "Continue");
        } else {
          this.nextButton.className = "onboarding-a-btn onboarding-a-btn-secondary";
          this.nextButton.textContent = localize("onboarding.continueWithoutSignIn", "Continue without Signing In");
        }
      } else if (this._isLastStep()) {
        this.nextButton.className = "onboarding-a-btn onboarding-a-btn-primary";
        this.nextButton.textContent = localize("onboarding.getStarted", "Get Started");
      } else {
        this.nextButton.className = "onboarding-a-btn onboarding-a-btn-primary";
        this.nextButton.textContent = localize("onboarding.next", "Continue");
      }
    }
    if (this.footerLeft) {
      if (this._isLastStep()) {
        if (!this._footerSignInBtn && !this._userSignedIn) {
          this._footerSignInBtn = append(this.footerLeft, $("button.onboarding-a-signin-nudge-btn"));
          this._footerSignInBtn.type = "button";
          this._footerSignInBtn.textContent = localize("onboarding.sessions.signInNudge", "Sign in to use GitHub Copilot");
          this.stepDisposables.add(addDisposableListener(this._footerSignInBtn, EventType.CLICK, async () => {
            this._logAction("signInNudge");
            await this._handleSignIn();
            if (this._userSignedIn && this._footerSignInBtn) {
              this._footerSignInBtn.style.display = "none";
            }
          }));
        }
      } else {
        if (this._footerSignInBtn) {
          this._footerSignInBtn.remove();
          this._footerSignInBtn = void 0;
        }
      }
    }
  }
  // =====================================================================
  // Step: Sign In
  // =====================================================================
  _renderSignInStep(container) {
    const wrapper = append(container, $(".onboarding-a-signin"));
    const brand = append(wrapper, $(".onboarding-a-signin-brand"));
    const brandIcon = append(brand, $("span.onboarding-a-signin-brand-icon"));
    brandIcon.setAttribute("role", "img");
    brandIcon.setAttribute("aria-label", product.nameLong);
    const content = append(wrapper, $(".onboarding-a-signin-content"));
    const contentMain = append(content, $(".onboarding-a-signin-content-main"));
    const title = append(contentMain, $("h2.onboarding-a-signin-title"));
    title.textContent = localize("onboarding.signIn.heroTitle", "Welcome to VS Code");
    const subtitle = append(contentMain, $("p.onboarding-a-signin-subtitle"));
    subtitle.textContent = localize("onboarding.signIn.heroSubtitle", "Sign in to use GitHub Copilot.");
    const actions = append(contentMain, $(".onboarding-a-signin-actions"));
    if (this._userSignedIn) {
      const signedIn = append(actions, $(".onboarding-a-signin-confirmation"));
      const icon = append(signedIn, $("span"));
      icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
      icon.setAttribute("aria-hidden", "true");
      const text = append(signedIn, $("span"));
      text.textContent = localize("onboarding.signIn.signedIn", "You're signed in. You can continue to the next step.");
    } else {
      switch (this.enterpriseSignInUiState) {
        case "instance":
          this._renderEnterpriseInstanceForm(actions);
          break;
        case "progress":
          this._renderEnterpriseSignInProgress(actions);
          break;
        default:
          this._renderDefaultSignInActions(actions);
          break;
      }
    }
    const footer = append(wrapper, $(".onboarding-a-signin-footer"));
    const disclaimerCol = append(footer, $(".onboarding-a-signin-disclaimer-col"));
    const copilotDisclaimer = append(disclaimerCol, $(".onboarding-a-signin-disclaimer"));
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.prefix", "By signing in, you agree to {0}'s ", defaultChat.provider.default.name));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.terms", "Terms"), defaultChat.termsStatementUrl);
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.middle", " and "));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.privacy", "Privacy Statement"), defaultChat.privacyStatementUrl);
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.copilotPrefix", ". {0} Copilot may show ", defaultChat.provider.default.name));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.publicCode", "public code"), defaultChat.publicCodeMatchesUrl);
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.improveSuffix", " suggestions and use your data to improve the product."));
    copilotDisclaimer.append(" ");
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.settingsPrefix", "You can change these "));
    this._createInlineLink(copilotDisclaimer, localize("onboarding.signIn.disclaimer.settings", "settings"), this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings));
    copilotDisclaimer.append(localize("onboarding.signIn.disclaimer.suffix", " anytime."));
  }
  _renderDefaultSignInActions(actions) {
    const githubBtn = this._registerStepFocusable(this._createSignInButton(actions, "github", localize("onboarding.signIn.github", "Continue with GitHub"), {
      emphasized: true,
      label: localize("onboarding.signIn.github.aria", "Continue with GitHub")
    }));
    this.stepDisposables.add(addDisposableListener(githubBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "github");
      this._handleSignIn();
    }));
    const googleBtn = this._registerStepFocusable(this._createSignInButton(actions, "google", localize("onboarding.signIn.google", "Continue with Google"), {
      iconOnly: true,
      label: localize("onboarding.signIn.google", "Continue with Google")
    }));
    this.stepDisposables.add(addDisposableListener(googleBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "google");
      this._handleSignIn("google");
    }));
    const appleBtn = this._registerStepFocusable(this._createSignInButton(actions, "apple", localize("onboarding.signIn.apple", "Continue with Apple"), {
      iconOnly: true,
      label: localize("onboarding.signIn.apple", "Continue with Apple")
    }));
    this.stepDisposables.add(addDisposableListener(appleBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "apple");
      this._handleSignIn("apple");
    }));
    const gheBtn = this._registerStepFocusable(this._createSignInButton(actions, "github-enterprise", localize("onboarding.signIn.ghe", "GHE"), {
      textOnly: true,
      label: localize("onboarding.signIn.ghe.aria", "Continue with GitHub Enterprise")
    }));
    this.stepDisposables.add(addDisposableListener(gheBtn, EventType.CLICK, () => {
      this._logAction("signIn", void 0, "github-enterprise");
      void this._handleEnterpriseSignIn();
    }));
  }
  _renderEnterpriseInstanceForm(actions) {
    const enterprisePromptLabel = this._getEnterpriseInstancePromptLabel();
    const container = append(actions, $(".onboarding-a-signin-ghe-input"));
    const submitAction = this.stepDisposables.add(new Action(
      "onboarding.signIn.enterprise.submit",
      localize("onboarding.signIn.enterprise.continue", "Continue"),
      ThemeIcon.asClassName(Codicon.arrowRight),
      false
    ));
    const inputBox = this.stepDisposables.add(new InputBox(container, void 0, {
      placeholder: localize("onboarding.signIn.enterprise.placeholder", 'i.e. "octocat" or "https://octocat.ghe.com"...'),
      ariaLabel: enterprisePromptLabel,
      actions: [submitAction],
      inputBoxStyles: defaultInputBoxStyles
    }));
    inputBox.value = this.enterpriseInstanceValue;
    inputBox.paddingRight = OnboardingVariationA.GHE_INPUT_ACTION_PADDING;
    const input = this._registerStepFocusable(inputBox.inputElement);
    const submit = async () => {
      const result = parseGheInstanceInput(inputBox.value);
      if (result.kind === GheParseResultKind.Empty || result.kind === GheParseResultKind.Invalid) {
        validate();
        return;
      }
      await this._submitEnterpriseInstance(result.resolvedUri);
    };
    submitAction.run = submit;
    const message = append(container, $(".onboarding-a-signin-ghe-message"));
    const validate = () => {
      this.enterpriseInstanceValue = inputBox.value;
      inputBox.element.classList.remove("error");
      message.classList.remove("error", "info");
      const result = parseGheInstanceInput(inputBox.value);
      switch (result.kind) {
        case GheParseResultKind.Empty:
          message.textContent = enterprisePromptLabel;
          submitAction.enabled = false;
          return false;
        case GheParseResultKind.SingleWord:
          message.classList.add("info");
          message.textContent = localize("onboarding.signIn.enterprise.resolve", "Will resolve to {0}", result.resolvedUri);
          submitAction.enabled = true;
          return true;
        case GheParseResultKind.FullUri:
          submitAction.enabled = true;
          message.textContent = "";
          return true;
        case GheParseResultKind.Invalid:
          inputBox.element.classList.add("error");
          message.classList.add("error");
          message.textContent = localize("onboarding.signIn.enterprise.invalid", 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.provider.enterprise.name);
          submitAction.enabled = false;
          return false;
      }
    };
    this.stepDisposables.add(inputBox.onDidChange(() => {
      validate();
    }));
    this.stepDisposables.add(addDisposableListener(input, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter) {
        e.preventDefault();
        void submitAction.run();
        return;
      }
      if (event.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._logAction("cancelEnterpriseInstancePrompt");
        this.enterpriseSignInWatch = void 0;
        this._setEnterpriseSignInUiState("options");
      }
    }));
    validate();
  }
  _renderEnterpriseSignInProgress(actions) {
    const container = append(actions, $(".onboarding-a-signin-ghe-progress"));
    container.setAttribute("aria-live", "polite");
    const spinner = append(container, $("span"));
    spinner.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
    spinner.setAttribute("aria-hidden", "true");
    const message = append(container, $(".onboarding-a-signin-ghe-progress-message"));
    message.textContent = localize("onboarding.signIn.enterprise.progress", "Waiting for {0} sign-in to complete...", defaultChat.provider.enterprise.name);
  }
  _getEnterpriseInstancePromptLabel() {
    return localize("onboarding.signIn.enterprise.prompt", "What is your {0} instance?", defaultChat.provider.enterprise.name);
  }
  _setEnterpriseSignInUiState(state) {
    this.enterpriseSignInUiState = state;
    if (this.steps[this.currentStepIndex] === OnboardingStepId.SignIn && this.contentEl) {
      this._renderStep();
      this._updateButtonStates();
      this._focusCurrentStepElement();
    }
  }
  _createSignInButton(parent, providerClass, label, options) {
    const isCompact = options?.iconOnly || options?.textOnly;
    const btn = append(parent, $(isCompact ? "button.onboarding-a-signin-icon-btn" : "button.onboarding-a-signin-btn"));
    btn.type = "button";
    btn.title = options?.label ?? label;
    btn.setAttribute("aria-label", options?.label ?? label);
    if (options?.emphasized) {
      btn.classList.add("primary");
    }
    if (!options?.textOnly) {
      const mark = append(btn, $("span.onboarding-a-provider-mark"));
      mark.classList.add(providerClass);
      mark.setAttribute("aria-hidden", "true");
      if (providerClass === "github" || providerClass === "github-enterprise") {
        mark.appendChild(renderIcon(Codicon.github));
      }
    }
    if (!options?.iconOnly) {
      const labelEl = append(btn, $("span.onboarding-a-signin-btn-label"));
      labelEl.textContent = label;
    }
    return btn;
  }
  async _handleSignIn(socialProvider) {
    const provider = socialProvider ?? "github";
    const watch = StopWatch.create();
    try {
      const account = await this.defaultAccountService.signIn({
        extraAuthorizeParameters: { get_started_with: "copilot-vscode" },
        provider: socialProvider
      });
      if (account) {
        this._userSignedIn = true;
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "installed", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        this.commandService.executeCommand("workbench.action.chat.triggerSetup", void 0, {
          disableChatViewReveal: true,
          setupStrategy: ChatSetupStrategy.DefaultSetup
        });
        this._nextStep();
      }
    } catch (error) {
      if (isCancellationError(error)) {
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "cancelled", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        return;
      }
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotSignedIn", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
      this.notificationService.notify({
        severity: Severity.Error,
        message: localize("onboarding.signIn.error", "Sign-in failed. You can try again later from the Accounts menu.")
      });
    }
  }
  async _handleEnterpriseSignIn() {
    const existingUri = this.configurationService.getValue(defaultChat.providerUriSetting);
    if (typeof existingUri !== "string" || !GHE_FULL_URI_REGEX.test(existingUri)) {
      this.enterpriseInstanceValue = existingUri ?? "";
      this.enterpriseSignInWatch = StopWatch.create();
      this._setEnterpriseSignInUiState("instance");
      return;
    }
    this.enterpriseInstanceValue = existingUri;
    await this._runEnterpriseSignInSetup();
  }
  async _submitEnterpriseInstance(resolvedUri) {
    try {
      await this.configurationService.updateValue(defaultChat.providerUriSetting, resolvedUri, ConfigurationTarget.USER);
      this.enterpriseInstanceValue = resolvedUri;
      await this._runEnterpriseSignInSetup();
    } catch {
      this.enterpriseSignInWatch = void 0;
      this._setEnterpriseSignInUiState("instance");
      this._notifyEnterpriseSignInError();
    }
  }
  async _runEnterpriseSignInSetup() {
    const watch = this.enterpriseSignInWatch ?? StopWatch.create();
    const provider = defaultChat.provider.enterprise.id;
    this._setEnterpriseSignInUiState("progress");
    try {
      const success = await this.commandService.executeCommand("workbench.action.chat.triggerSetup", void 0, {
        disableChatViewReveal: true,
        setupStrategy: ChatSetupStrategy.SetupWithEnterpriseProvider
      });
      if (success) {
        this._userSignedIn = true;
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "installed", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        this._nextStep();
      } else {
        this._setEnterpriseSignInUiState("options");
      }
    } catch (error) {
      if (isCancellationError(error)) {
        this._setEnterpriseSignInUiState("options");
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "cancelled", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
        return;
      }
      this._setEnterpriseSignInUiState("instance");
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotSignedIn", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
      this._notifyEnterpriseSignInError();
    } finally {
      this.enterpriseSignInWatch = void 0;
    }
  }
  _notifyEnterpriseSignInError() {
    this.notificationService.notify({
      severity: Severity.Error,
      message: localize("onboarding.signIn.enterprise.error", "GitHub Enterprise sign-in failed. Check your instance URL and try again.")
    });
  }
  // =====================================================================
  // Step: Personalize (Theme + Keymap)
  // =====================================================================
  _renderPersonalizeStep(container) {
    const wrapper = append(container, $(".onboarding-a-personalize"));
    const themeLabel = append(wrapper, $("div.onboarding-a-section-label"));
    themeLabel.textContent = localize("onboarding.personalize.theme", "Color Theme");
    const themeHint = append(wrapper, $("div.onboarding-a-theme-hint"));
    themeHint.textContent = localize("onboarding.personalize.themeHint", "You can browse and install more themes later from the Extensions view.");
    const themeGrid = append(wrapper, $(".onboarding-a-theme-grid"));
    themeGrid.setAttribute("role", "radiogroup");
    themeGrid.setAttribute("aria-label", localize("onboarding.personalize.themeLabel", "Choose a color theme"));
    const hasOtherEditors = this._hasOtherEditors();
    const allThemes = product.onboardingThemes ?? [];
    const themes = hasOtherEditors ? allThemes.filter((t) => !t.id.startsWith("solarized")) : allThemes;
    if (!hasOtherEditors) {
      themeGrid.classList.add("theme-grid-expanded");
    }
    const themeCards = [];
    for (const theme of themes) {
      this._createThemeCard(themeGrid, theme, themeCards);
    }
    for (const card of themeCards) {
      card.setAttribute("tabindex", "0");
    }
    const keymapOptions = this._detectedEditorIds ? (product.onboardingKeymaps ?? []).filter((k) => this._detectedEditorIds.has(k.id)) : [];
    if (hasOtherEditors) {
      const keymapLabel = append(wrapper, $("div.onboarding-a-section-label.onboarding-a-section-label-keymap"));
      keymapLabel.textContent = localize("onboarding.personalize.keymap", "Keyboard Mapping");
      const keymapHint = append(wrapper, $("div.onboarding-a-theme-hint"));
      keymapHint.textContent = localize("onboarding.personalize.keymapHint", "Coming from another editor? Import your keyboard mapping to feel right at home.");
      const keymapList = append(wrapper, $(".onboarding-a-keymap-list"));
      keymapList.setAttribute("role", "radiogroup");
      keymapList.setAttribute("aria-label", localize("onboarding.personalize.keymapLabel", "Choose a keyboard mapping"));
      const keymapPills = [];
      for (const keymap of keymapOptions) {
        const pill = this._registerStepFocusable(append(keymapList, $("button.onboarding-a-keymap-pill")));
        pill.type = "button";
        pill.setAttribute("role", "radio");
        pill.setAttribute("aria-checked", keymap.id === this.selectedKeymapId ? "true" : "false");
        pill.title = keymap.description;
        keymapPills.push(pill);
        const labelSpan = append(pill, $("span"));
        labelSpan.textContent = keymap.label;
        if (keymap.id === this.selectedKeymapId) {
          pill.classList.add("selected");
        }
        this.stepDisposables.add(addDisposableListener(pill, EventType.CLICK, () => {
          this._logAction("selectKeymap", void 0, keymap.id);
          this.selectedKeymapId = keymap.id;
          for (const p of keymapPills) {
            p.classList.remove("selected");
            p.setAttribute("aria-checked", "false");
          }
          pill.classList.add("selected");
          pill.setAttribute("aria-checked", "true");
          this.accessibilityService.alert(localize("onboarding.keymap.selected.alert", "{0} keyboard mapping selected", keymap.label));
        }));
      }
      const selectedKeymapIndex = keymapOptions.findIndex((k) => k.id === this.selectedKeymapId);
      this._setupRadioGroupNavigation(keymapPills, Math.max(0, selectedKeymapIndex));
    }
  }
  _renderPersonalizeSubtitle(container) {
    clearNode(container);
    const modifier = isMacintosh ? "Cmd" : "Ctrl";
    container.append(
      localize("onboarding.personalize.tip.prefix", "Tip: Press "),
      this._createKbd(localize({ key: "onboarding.personalize.tip.modifier", comment: ["This is a keyboard modifier key, Ctrl on Windows/Linux or Cmd on Mac"] }, "{0}", modifier)),
      "+",
      this._createKbd(localize("onboarding.personalize.tip.shift", "Shift")),
      "+",
      this._createKbd(localize("onboarding.personalize.tip.p", "P")),
      localize("onboarding.personalize.tip.suffix", " to access all VS Code commands.")
    );
  }
  _createThemeCard(parent, theme, allCards) {
    const card = this._registerStepFocusable(append(parent, $("div.onboarding-a-theme-card")));
    allCards.push(card);
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", theme.id === this.selectedThemeId ? "true" : "false");
    card.setAttribute("aria-label", theme.label);
    if (theme.id === this.selectedThemeId) {
      card.classList.add("selected");
    }
    const preview = append(card, $("div.onboarding-a-theme-preview"));
    const img = append(preview, $("img.onboarding-a-theme-preview-img"));
    img.alt = "";
    img.src = FileAccess.asBrowserUri(`vs/workbench/contrib/welcomeOnboarding/browser/media/theme-preview-${theme.id}.svg`).toString(true);
    const label = append(card, $("div.onboarding-a-theme-label"));
    label.textContent = theme.label;
    this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
      this._logAction("selectTheme", void 0, theme.id);
      this._selectTheme(theme);
      for (const c of allCards) {
        c.classList.remove("selected");
        c.setAttribute("aria-checked", "false");
      }
      card.classList.add("selected");
      card.setAttribute("aria-checked", "true");
      this.accessibilityService.alert(localize("onboarding.theme.selected.alert", "{0} theme selected", theme.label));
    }));
    this.stepDisposables.add(addDisposableListener(card, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    }));
  }
  // =====================================================================
  // Theme / Keymap helpers
  // =====================================================================
  async _selectTheme(theme) {
    this.selectedThemeId = theme.id;
    const allThemes = await this.themeService.getColorThemes();
    const match = allThemes.find((t) => t.settingsId === theme.themeId);
    if (match) {
      this.themeService.setColorTheme(match.id, ConfigurationTarget.USER);
    }
  }
  async _applyKeymap(keymapId) {
    const keymap = (product.onboardingKeymaps ?? []).find((k) => k.id === keymapId);
    if (!keymap?.extensionId) {
      return;
    }
    try {
      const gallery = await this.extensionGalleryService.getExtensions([{ id: keymap.extensionId }], CancellationToken.None);
      if (gallery.length > 0) {
        await this.extensionManagementService.installFromGallery(gallery[0], { context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true } });
      }
    } catch {
      this.notificationService.notify({
        severity: Severity.Warning,
        message: localize("onboarding.keymap.installError", "Could not install {0} keymap. You can install it later from Extensions.", keymap.label)
      });
    }
  }
  _hasOtherEditors() {
    const keymapOptions = this._detectedEditorIds ? (product.onboardingKeymaps ?? []).filter((k) => this._detectedEditorIds.has(k.id)) : [];
    return keymapOptions.some((k) => k.id !== "vscode");
  }
  /**
   * Checks common install paths for known editors and returns the set of
   * keymap option IDs whose editors are found on this machine.
   * Always includes 'vscode' (the default). In web environments or on
   * unknown platforms, returns only 'vscode'.
   */
  async _detectInstalledEditors() {
    const detected = /* @__PURE__ */ new Set(["vscode"]);
    const home = this.pathService.userHome({ preferLocal: true });
    const checks = [];
    if (isWindows) {
      const localAppData = URI.joinPath(home, "AppData", "Local");
      checks.push(
        { id: "sublime", paths: [URI.file("C:\\Program Files\\Sublime Text\\sublime_text.exe"), URI.file("C:\\Program Files\\Sublime Text 3\\sublime_text.exe")] },
        { id: "intellij", paths: [URI.joinPath(localAppData, "JetBrains", "Toolbox")] },
        { id: "vim", paths: [URI.joinPath(home, "_vimrc"), URI.joinPath(localAppData, "nvim", "init.vim"), URI.joinPath(localAppData, "nvim", "init.lua")] },
        { id: "eclipse", paths: [URI.file("C:\\Program Files\\Eclipse\\eclipse.exe"), URI.file("C:\\Program Files\\eclipse\\eclipse.exe")] },
        { id: "notepadpp", paths: [URI.file("C:\\Program Files\\Notepad++\\notepad++.exe"), URI.file("C:\\Program Files (x86)\\Notepad++\\notepad++.exe")] }
      );
    } else if (isMacintosh) {
      checks.push(
        { id: "sublime", paths: [URI.file("/Applications/Sublime Text.app")] },
        { id: "intellij", paths: [URI.file("/Applications/IntelliJ IDEA.app"), URI.file("/Applications/IntelliJ IDEA CE.app")] },
        { id: "vim", paths: [URI.joinPath(home, ".vimrc"), URI.joinPath(home, ".config", "nvim", "init.vim"), URI.joinPath(home, ".config", "nvim", "init.lua")] },
        { id: "eclipse", paths: [URI.file("/Applications/Eclipse.app"), URI.file("/Applications/Eclipse IDE.app")] },
        { id: "notepadpp", paths: [URI.file("/Applications/Notepad++.app")] }
      );
    } else if (isLinux) {
      checks.push(
        { id: "sublime", paths: [URI.file("/usr/bin/subl"), URI.file("/opt/sublime_text/sublime_text")] },
        { id: "intellij", paths: [URI.joinPath(home, ".local", "share", "JetBrains", "Toolbox"), URI.file("/opt/idea")] },
        { id: "vim", paths: [URI.joinPath(home, ".vimrc"), URI.joinPath(home, ".config", "nvim", "init.vim"), URI.joinPath(home, ".config", "nvim", "init.lua")] },
        { id: "eclipse", paths: [URI.file("/usr/bin/eclipse"), URI.file("/opt/eclipse/eclipse"), URI.joinPath(home, "eclipse", "eclipse")] },
        { id: "notepadpp", paths: [URI.file("/usr/bin/notepadqq"), URI.file("/snap/notepad-plus-plus/current")] }
      );
    }
    await Promise.all(checks.map(async (check) => {
      for (const path of check.paths) {
        try {
          if (await this.fileService.exists(path)) {
            detected.add(check.id);
            return;
          }
        } catch {
        }
      }
    }));
    return detected;
  }
  // =====================================================================
  // Step: AI Preference
  // =====================================================================
  _renderAiPreferenceStep(container) {
    const wrapper = append(container, $(".onboarding-a-ai-pref"));
    const cards = append(wrapper, $(".onboarding-a-ai-pref-cards"));
    cards.setAttribute("role", "radiogroup");
    cards.setAttribute("aria-label", localize("onboarding.aiPref.label", "Choose your AI collaboration style"));
    const allCards = [];
    for (const option of ONBOARDING_AI_PREFERENCE_OPTIONS) {
      const card = this._registerStepFocusable(append(cards, $("button.onboarding-a-ai-pref-card")));
      card.type = "button";
      card.dataset.id = option.id;
      card.setAttribute("role", "radio");
      card.setAttribute("aria-checked", option.id === this.selectedAiMode ? "true" : "false");
      allCards.push(card);
      if (option.id === this.selectedAiMode) {
        card.classList.add("selected");
      }
      const iconEl = append(card, $("span.onboarding-a-ai-pref-card-icon"));
      iconEl.setAttribute("aria-hidden", "true");
      const icon = Codicon[option.icon] ?? Codicon.sparkle;
      iconEl.appendChild(renderIcon(icon));
      const titleEl = append(card, $("div.onboarding-a-ai-pref-card-title"));
      titleEl.textContent = option.label;
      const descEl = append(card, $("div.onboarding-a-ai-pref-card-desc"));
      descEl.textContent = option.description;
      this.stepDisposables.add(addDisposableListener(card, EventType.CLICK, () => {
        this._logAction("selectAiMode", void 0, option.id);
        this.selectedAiMode = option.id;
        for (const c of allCards) {
          c.classList.toggle("selected", c.dataset.id === option.id);
          c.setAttribute("aria-checked", c.dataset.id === option.id ? "true" : "false");
        }
        this._applyAiPreference(option.id);
        this.accessibilityService.alert(localize("onboarding.aiPref.selected.alert", "{0} selected", option.label));
      }));
    }
    const selectedAiIndex = ONBOARDING_AI_PREFERENCE_OPTIONS.findIndex((o) => o.id === this.selectedAiMode);
    this._setupRadioGroupNavigation(allCards, Math.max(0, selectedAiIndex));
    const hint = append(wrapper, $("div.onboarding-a-ai-pref-hint"));
    hint.textContent = localize("onboarding.aiPref.hint", "You can change this anytime in Settings.");
  }
  _applyAiPreference(mode) {
    switch (mode) {
      case AiCollaborationMode.CodeFirst:
        this.configurationService.updateValue("chat.agent.autoFix", false, ConfigurationTarget.USER);
        break;
      case AiCollaborationMode.Balanced:
        this.configurationService.updateValue("chat.agent.autoFix", true, ConfigurationTarget.USER);
        break;
      case AiCollaborationMode.AgentForward:
        this.configurationService.updateValue("chat.agent.autoFix", true, ConfigurationTarget.USER);
        break;
    }
  }
  // =====================================================================
  // Step: Agent Sessions
  // =====================================================================
  _renderAgentSessionsSubtitle(el) {
    clearNode(el);
    const keys = isMacintosh ? ["\u2318", "\u2303", "I"] : ["Ctrl", "Alt", "I"];
    const shortcut = keys.map((k) => this._createKbd(k));
    el.append(localize("onboarding.step.agentSessions.subtitle.before", "Open Chat anytime with "));
    for (let i = 0; i < shortcut.length; i++) {
      if (i > 0) {
        el.append("+");
      }
      el.append(shortcut[i]);
    }
  }
  _renderAgentSessionsStep(container) {
    const wrapper = append(container, $(".onboarding-a-sessions"));
    const features = append(wrapper, $(".onboarding-a-sessions-features"));
    const chatGroup = append(features, $(".onboarding-a-sessions-group"));
    const chatLabel = append(chatGroup, $("div.onboarding-a-sessions-group-label"));
    chatLabel.textContent = localize("onboarding.sessions.group.chat", "Agents made for the task");
    const chatGrid = append(chatGroup, $(".onboarding-a-sessions-grid.onboarding-a-sessions-grid-2"));
    this._createFeatureCard(
      chatGrid,
      Codicon.listOrdered,
      localize("onboarding.sessions.planMode", "Plan"),
      localize("onboarding.sessions.planMode.desc", "Produce a structured implementation plan before any code changes, then hand it off to an agent to execute.")
    );
    this._createFeatureCard(
      chatGrid,
      Codicon.commentDiscussion,
      localize("onboarding.sessions.agentMode", "Agent"),
      localize("onboarding.sessions.agentMode.desc", "Describe a goal. The agent plans the approach, edits files, runs commands, and self-corrects. You review and approve along the way.")
    );
    const moreGroup = append(features, $(".onboarding-a-sessions-group"));
    const moreLabel = append(moreGroup, $("div.onboarding-a-sessions-group-label"));
    moreLabel.textContent = localize("onboarding.sessions.group.more", "Agents that work your way");
    const moreGrid = append(moreGroup, $(".onboarding-a-sessions-grid.onboarding-a-sessions-grid-2"));
    this._createFeatureCard(
      moreGrid,
      Codicon.rocket,
      localize("onboarding.sessions.runAnywhere", "Run Agents Anywhere"),
      localize("onboarding.sessions.runAnywhere.desc", "Run agents locally for interactive work, in the background with Copilot CLI, or in the cloud with cloud agents that open a pull request your team can review.")
    );
    this._createFeatureCard(
      moreGrid,
      Codicon.settingsGear,
      localize("onboarding.sessions.customize", "Customize Your Agents"),
      localize("onboarding.sessions.customize.desc", "Tailor Copilot to your project with custom instructions and agents, skills, reusable prompts, and MCP servers that connect to the tools and context you rely on.")
    );
    const docsRow = append(wrapper, $(".onboarding-a-sessions-docs"));
    this._createDocLink(docsRow, localize("onboarding.sessions.agentsTutorial", "Agents tutorial"), "https://code.visualstudio.com/docs/copilot/agents/agents-tutorial", "agentsTutorial");
  }
  _createFeatureCard(parent, icon, title, description) {
    const card = append(parent, $("div.onboarding-a-feature-card"));
    const iconCol = append(card, $("div.onboarding-a-feature-icon"));
    iconCol.appendChild(renderIcon(icon));
    const textCol = append(card, $("div.onboarding-a-feature-text"));
    const titleEl = append(textCol, $("div.onboarding-a-feature-title"));
    titleEl.textContent = title;
    const descEl = append(textCol, $("div.onboarding-a-feature-desc"));
    if (description) {
      descEl.textContent = description;
    }
    return descEl;
  }
  _createKbd(label) {
    const kbd = $("kbd.onboarding-a-kbd");
    kbd.textContent = label;
    return kbd;
  }
  _createDocLink(parent, label, href, linkId) {
    const link = this._registerStepFocusable(append(parent, $("a.onboarding-a-doc-link")));
    link.textContent = label;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.prepend(renderIcon(Codicon.linkExternal));
    if (linkId) {
      this.stepDisposables.add(addDisposableListener(link, EventType.CLICK, () => {
        this._logAction("docLinkClick", void 0, linkId);
      }));
    }
  }
  _createInlineLink(parent, label, href) {
    const link = this._registerStepFocusable(append(parent, $("a.onboarding-a-inline-link")));
    link.textContent = label;
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    return link;
  }
  // =====================================================================
  // Radio-group keyboard navigation (roving tabindex)
  // =====================================================================
  /**
   * Sets up WAI-ARIA radio-group keyboard navigation on a set of elements:
   * - Arrow keys move focus between items (with wrap-around)
   * - Only the focused item has tabindex=0; the rest have tabindex=-1
   * - Space/Enter on a focused item fires its click handler
   */
  _setupRadioGroupNavigation(items, selectedIndex) {
    for (let i = 0; i < items.length; i++) {
      items[i].setAttribute("tabindex", i === selectedIndex ? "0" : "-1");
    }
    for (let i = 0; i < items.length; i++) {
      this.stepDisposables.add(addDisposableListener(items[i], EventType.KEY_DOWN, (e) => {
        const event = new StandardKeyboardEvent(e);
        let newIndex;
        if (event.keyCode === KeyCode.RightArrow || event.keyCode === KeyCode.DownArrow) {
          newIndex = (i + 1) % items.length;
        } else if (event.keyCode === KeyCode.LeftArrow || event.keyCode === KeyCode.UpArrow) {
          newIndex = (i - 1 + items.length) % items.length;
        } else if (event.keyCode === KeyCode.Home) {
          newIndex = 0;
        } else if (event.keyCode === KeyCode.End) {
          newIndex = items.length - 1;
        }
        if (newIndex !== void 0) {
          e.preventDefault();
          e.stopPropagation();
          items[i].setAttribute("tabindex", "-1");
          items[newIndex].setAttribute("tabindex", "0");
          items[newIndex].focus();
          items[newIndex].click();
        }
      }));
    }
  }
  // =====================================================================
  // Focus trap
  // =====================================================================
  _trapTab(e, shiftKey) {
    if (!this.overlay) {
      return;
    }
    const allFocusable = this._getFocusableElements();
    if (allFocusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = allFocusable[0];
    const last = allFocusable[allFocusable.length - 1];
    if (shiftKey && getActiveWindow().document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!shiftKey && getActiveWindow().document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  _getFocusableElements() {
    return [...this.closeButton ? [this.closeButton] : [], ...this.stepFocusableElements, ...this.footerFocusableElements].filter((element) => this._isTabbable(element));
  }
  _focusCurrentStepElement() {
    const stepFocusable = this.stepFocusableElements.find((element) => this._isTabbable(element));
    (stepFocusable ?? this.nextButton ?? this.closeButton)?.focus();
  }
  _registerStepFocusable(element) {
    this.stepFocusableElements.push(element);
    return element;
  }
  _isTabbable(element) {
    if (!element.isConnected || element.getAttribute("aria-hidden") === "true" || element.tabIndex === -1 || element.hasAttribute("disabled")) {
      return false;
    }
    const computedStyle = getActiveWindow().getComputedStyle(element);
    return computedStyle.display !== "none" && computedStyle.visibility !== "hidden";
  }
  // =====================================================================
  // Telemetry
  // =====================================================================
  _logStepView() {
    const stepId = this.steps[this.currentStepIndex];
    this.telemetryService.publicLog2("welcomeOnboarding.stepView", {
      step: stepId,
      stepNumber: this.currentStepIndex + 1
    });
  }
  _logAction(action, stepOverride, argument) {
    this.telemetryService.publicLog2("welcomeOnboarding.actionExecuted", {
      action,
      step: stepOverride ?? this.steps[this.currentStepIndex],
      argument: argument ?? void 0
    });
  }
  // =====================================================================
  // Cleanup
  // =====================================================================
  _removeFromDOM() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = void 0;
    }
    this.card = void 0;
    this.bodyEl = void 0;
    this.progressContainer = void 0;
    this.stepLabelEl = void 0;
    this.titleEl = void 0;
    this.subtitleEl = void 0;
    this.contentEl = void 0;
    this.backButton = void 0;
    this.nextButton = void 0;
    this.closeButton = void 0;
    this.footerLeft = void 0;
    this._footerSignInBtn = void 0;
    this.footerFocusableElements.length = 0;
    this.stepFocusableElements.length = 0;
    this.enterpriseSignInUiState = "options";
    this.enterpriseInstanceValue = "";
    this.enterpriseSignInWatch = void 0;
    this._isShowing = false;
    this.disposables.clear();
    this.stepDisposables.clear();
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = void 0;
    }
    this.currentStepIndex = 0;
  }
  dispose() {
    this._removeFromDOM();
    super.dispose();
  }
};
OnboardingVariationA.GHE_INPUT_ACTION_PADDING = 28;
OnboardingVariationA = __decorateClass([
  __decorateParam(0, ILayoutService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IDefaultAccountService),
  __decorateParam(3, IExtensionGalleryService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IPathService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IAccessibilityService)
], OnboardingVariationA);
export {
  OnboardingVariationA
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVPbmJvYXJkaW5nL2Jyb3dzZXIvb25ib2FyZGluZ1ZhcmlhdGlvbkEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlLCBjbGVhck5vZGUsIGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgaXNNYWNpbnRvc2gsIGlzTGludXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhc3NlcnREZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhULCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgR2l0SHViUGF0aHMsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uLCBDaGF0U2V0dXBTdHJhdGVneSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0U2V0dXAvY2hhdFNldHVwLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7XG5cdE9uYm9hcmRpbmdTdGVwSWQsXG5cdE9OQk9BUkRJTkdfU1RFUFMsXG5cdE9OQk9BUkRJTkdfQUlfUFJFRkVSRU5DRV9PUFRJT05TLFxuXHRBaUNvbGxhYm9yYXRpb25Nb2RlLFxuXHRJT25ib2FyZGluZ1RoZW1lT3B0aW9uLFxuXHRnZXRPbmJvYXJkaW5nU3RlcFRpdGxlLFxuXHRnZXRPbmJvYXJkaW5nU3RlcFN1YnRpdGxlLFxuXHRHSEVfRlVMTF9VUklfUkVHRVgsXG5cdEdoZVBhcnNlUmVzdWx0S2luZCxcblx0cGFyc2VHaGVJbnN0YW5jZUlucHV0LFxufSBmcm9tICcuLi9jb21tb24vb25ib2FyZGluZ1R5cGVzLmpzJztcbmltcG9ydCB7IElPbmJvYXJkaW5nU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9vbmJvYXJkaW5nU2VydmljZS5qcyc7XG5cbnR5cGUgT25ib2FyZGluZ1N0ZXBWaWV3Q2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnY3dlYnN0ZXItOTknO1xuXHRjb21tZW50OiAnVHJhY2tzIHdoaWNoIG9uYm9hcmRpbmcgc3RlcCBpcyB2aWV3ZWQuJztcblx0c3RlcDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzdGVwIGlkZW50aWZpZXIuJyB9O1xuXHRzdGVwTnVtYmVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnVGhlIDEtYmFzZWQgc3RlcCBpbmRleC4nIH07XG59O1xuXG50eXBlIE9uYm9hcmRpbmdTdGVwVmlld0V2ZW50ID0ge1xuXHRzdGVwOiBzdHJpbmc7XG5cdHN0ZXBOdW1iZXI6IG51bWJlcjtcbn07XG5cbnR5cGUgT25ib2FyZGluZ0FjdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2N3ZWJzdGVyLTk5Jztcblx0Y29tbWVudDogJ1RyYWNrcyBhY3Rpb25zIHRha2VuIG9uIHRoZSBvbmJvYXJkaW5nIHdpemFyZC4nO1xuXHRhY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWN0aW9uIHBlcmZvcm1lZC4nIH07XG5cdHN0ZXA6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc3RlcCB0aGUgYWN0aW9uIHdhcyBwZXJmb3JtZWQgb24uJyB9O1xuXHRhcmd1bWVudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ09wdGlvbmFsIGNvbnRleHQgc3VjaCBhcyB0aGVtZSBpZCwgZXh0ZW5zaW9uIGlkLCBvciBwcm92aWRlci4nIH07XG59O1xuXG50eXBlIE9uYm9hcmRpbmdBY3Rpb25FdmVudCA9IHtcblx0YWN0aW9uOiBzdHJpbmc7XG5cdHN0ZXA6IHN0cmluZztcblx0YXJndW1lbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn07XG5cbnR5cGUgRW50ZXJwcmlzZVNpZ25JblVpU3RhdGUgPSAnb3B0aW9ucycgfCAnaW5zdGFuY2UnIHwgJ3Byb2dyZXNzJztcblxuYXNzZXJ0RGVmaW5lZChwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQsICdPbmJvYXJkaW5nIHJlcXVpcmVzIGEgZGVmYXVsdCBjaGF0IGFnZW50IHByb2R1Y3QgY29uZmlndXJhdGlvbi4nKTtcbmNvbnN0IGRlZmF1bHRDaGF0ID0gcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50O1xuXG4vKipcbiAqIFZhcmlhdGlvbiBBIFx1MjAxNCBDbGFzc2ljIFdpemFyZCBNb2RhbFxuICpcbiAqIEEgY2VudGVyZWQgbW9kYWwgb3ZlcmxheSB3aXRoIHByb2dyZXNzIGRvdHMsIGNsZWFuIHN0ZXAgdHJhbnNpdGlvbnMsXG4gKiBhbmQgcG9saXNoZWQgbmF2aWdhdGlvbi4gU2l0cyBvbiB0b3Agb2YgdGhlIGFnZW50IHNlc3Npb25zIHdlbGNvbWVcbiAqIHRhYi4gV2hlbiBkaXNtaXNzZWQsIHRoZSB3ZWxjb21lIHRhYiBpcyByZXZlYWxlZCB1bmRlcm5lYXRoLlxuICpcbiAqIFN0ZXBzOlxuICogMS4gU2lnbiBJbiBcdTIwMTQgc2Vzc2lvbnMtc3R5bGUgc2lnbi1pbiBoZXJvIHdpdGggR2l0SHViIENvcGlsb3QsIEdvb2dsZSwgYW5kIEFwcGxlIG9wdGlvbnNcbiAqIDIuIFBlcnNvbmFsaXplIFx1MjAxNCBUaGVtZSBzZWxlY3Rpb24gZ3JpZCArIGtleW1hcCBwaWxsc1xuICogMy4gQWdlbnQgU2Vzc2lvbnMgXHUyMDE0IEZlYXR1cmUgY2FyZHMgc2hvd2Nhc2luZyBBSSBjYXBhYmlsaXRpZXNcbiAqL1xuZXhwb3J0IGNsYXNzIE9uYm9hcmRpbmdWYXJpYXRpb25BIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPbmJvYXJkaW5nU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb21wbGV0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENvbXBsZXRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ29tcGxldGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNtaXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzbWlzczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERpc21pc3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSBvdmVybGF5OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYXJkOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBib2R5RWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2dyZXNzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGVwTGFiZWxFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGl0bGVFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3VidGl0bGVFbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGVudEVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBiYWNrQnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBuZXh0QnV0dG9uOiBIVE1MQnV0dG9uRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjbG9zZUJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZm9vdGVyTGVmdDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Zvb3RlclNpZ25JbkJ0bjogSFRNTEJ1dHRvbkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50U3RlcEluZGV4ID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBzdGVwcyA9IE9OQk9BUkRJTkdfU1RFUFM7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0ZXBEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcHJldmlvdXNseUZvY3VzZWRFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNTaG93aW5nID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmb290ZXJGb2N1c2FibGVFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0ZXBGb2N1c2FibGVFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHNlbGVjdGVkVGhlbWVJZCA9ICdkYXJrLTIwMjYnO1xuXHRwcml2YXRlIHNlbGVjdGVkS2V5bWFwSWQgPSAndnNjb2RlJztcblx0cHJpdmF0ZSBfZGV0ZWN0ZWRFZGl0b3JJZHM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91c2VyU2lnbmVkSW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzZWxlY3RlZEFpTW9kZTogQWlDb2xsYWJvcmF0aW9uTW9kZSA9IEFpQ29sbGFib3JhdGlvbk1vZGUuQmFsYW5jZWQ7XG5cdHByaXZhdGUgZW50ZXJwcmlzZVNpZ25JblVpU3RhdGU6IEVudGVycHJpc2VTaWduSW5VaVN0YXRlID0gJ29wdGlvbnMnO1xuXHRwcml2YXRlIGVudGVycHJpc2VJbnN0YW5jZVZhbHVlID0gJyc7XG5cdHByaXZhdGUgZW50ZXJwcmlzZVNpZ25JbldhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBEZXRlY3QgY3VycmVudGx5IGFjdGl2ZSB0aGVtZVxuXHRcdGNvbnN0IGN1cnJlbnRUaGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBhbGxUaGVtZXMgPSBwcm9kdWN0Lm9uYm9hcmRpbmdUaGVtZXMgPz8gW107XG5cdFx0Y29uc3QgbWF0Y2hpbmdUaGVtZSA9IGFsbFRoZW1lcy5maW5kKHQgPT4gdC50aGVtZUlkID09PSBjdXJyZW50VGhlbWUuc2V0dGluZ3NJZCk7XG5cdFx0aWYgKG1hdGNoaW5nVGhlbWUpIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWRUaGVtZUlkID0gbWF0Y2hpbmdUaGVtZS5pZDtcblx0XHR9XG5cblx0XHQvLyBTdGFydCBkZXRlY3RpbmcgaW5zdGFsbGVkIGVkaXRvcnMgZWFybHkgc28gcmVzdWx0cyBhcmUgcmVhZHkgYnkgdGhlIFBlcnNvbmFsaXplIHN0ZXBcblx0XHR0aGlzLl9kZXRlY3RJbnN0YWxsZWRFZGl0b3JzKCkudGhlbihpZHMgPT4geyB0aGlzLl9kZXRlY3RlZEVkaXRvcklkcyA9IGlkczsgfSk7XG5cdH1cblxuXHRnZXQgaXNTaG93aW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Nob3dpbmc7XG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc1Nob3dpbmcgPSB0cnVlO1xuXHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWRFbGVtZW50ID0gZ2V0QWN0aXZlV2luZG93KCkuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXI7XG5cblx0XHQvLyBPdmVybGF5XG5cdFx0dGhpcy5vdmVybGF5ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9uYm9hcmRpbmctYS1vdmVybGF5JykpO1xuXHRcdHRoaXMub3ZlcmxheS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZGlhbG9nJyk7XG5cdFx0dGhpcy5vdmVybGF5LnNldEF0dHJpYnV0ZSgnYXJpYS1tb2RhbCcsICd0cnVlJyk7XG5cdFx0dGhpcy5vdmVybGF5LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdvbmJvYXJkaW5nLmEuYXJpYScsIFwiV2VsY29tZSB0byBWaXN1YWwgU3R1ZGlvIENvZGVcIikpO1xuXG5cdFx0Ly8gQ2FyZFxuXHRcdHRoaXMuY2FyZCA9IGFwcGVuZCh0aGlzLm92ZXJsYXksICQoJy5vbmJvYXJkaW5nLWEtY2FyZCcpKTtcblxuXHRcdC8vIENsb3NlIGJ1dHRvbiAodXBwZXItcmlnaHQgY29ybmVyIG9mIGNhcmQpXG5cdFx0dGhpcy5jbG9zZUJ1dHRvbiA9IGFwcGVuZCh0aGlzLmNhcmQsICQ8SFRNTEJ1dHRvbkVsZW1lbnQ+KCdidXR0b24ub25ib2FyZGluZy1hLWNsb3NlLWJ0bicpKTtcblx0XHR0aGlzLmNsb3NlQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLmNsb3NlQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdvbmJvYXJkaW5nLmNsb3NlJywgXCJDbG9zZVwiKSk7XG5cdFx0dGhpcy5jbG9zZUJ1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2xvc2UpKTtcblxuXHRcdC8vIEhlYWRlciB3aXRoIHByb2dyZXNzXG5cdFx0Y29uc3QgaGVhZGVyID0gYXBwZW5kKHRoaXMuY2FyZCwgJCgnLm9uYm9hcmRpbmctYS1oZWFkZXInKSk7XG5cdFx0dGhpcy5wcm9ncmVzc0NvbnRhaW5lciA9IGFwcGVuZChoZWFkZXIsICQoJy5vbmJvYXJkaW5nLWEtcHJvZ3Jlc3MnKSk7XG5cdFx0dGhpcy5zdGVwTGFiZWxFbCA9IGFwcGVuZCh0aGlzLnByb2dyZXNzQ29udGFpbmVyLCAkKCdzcGFuLm9uYm9hcmRpbmctYS1zdGVwLWxhYmVsJykpO1xuXHRcdHRoaXMuX3JlbmRlclByb2dyZXNzKCk7XG5cblx0XHQvLyBCb2R5XG5cdFx0dGhpcy5ib2R5RWwgPSBhcHBlbmQodGhpcy5jYXJkLCAkKCcub25ib2FyZGluZy1hLWJvZHknKSk7XG5cdFx0dGhpcy50aXRsZUVsID0gYXBwZW5kKHRoaXMuYm9keUVsLCAkKCdoMi5vbmJvYXJkaW5nLWEtc3RlcC10aXRsZScpKTtcblx0XHR0aGlzLnN1YnRpdGxlRWwgPSBhcHBlbmQodGhpcy5ib2R5RWwsICQoJ3Aub25ib2FyZGluZy1hLXN0ZXAtc3VidGl0bGUnKSk7XG5cdFx0dGhpcy5jb250ZW50RWwgPSBhcHBlbmQodGhpcy5ib2R5RWwsICQoJy5vbmJvYXJkaW5nLWEtc3RlcC1jb250ZW50JykpO1xuXHRcdHRoaXMuX3JlbmRlclN0ZXAoKTtcblx0XHR0aGlzLl9sb2dTdGVwVmlldygpO1xuXG5cdFx0Ly8gRm9vdGVyXG5cdFx0Y29uc3QgZm9vdGVyID0gYXBwZW5kKHRoaXMuY2FyZCwgJCgnLm9uYm9hcmRpbmctYS1mb290ZXInKSk7XG5cblx0XHR0aGlzLmZvb3RlckxlZnQgPSBhcHBlbmQoZm9vdGVyLCAkKCcub25ib2FyZGluZy1hLWZvb3Rlci1sZWZ0JykpO1xuXG5cdFx0Y29uc3QgZm9vdGVyUmlnaHQgPSBhcHBlbmQoZm9vdGVyLCAkKCcub25ib2FyZGluZy1hLWZvb3Rlci1yaWdodCcpKTtcblxuXHRcdHRoaXMuYmFja0J1dHRvbiA9IGFwcGVuZChmb290ZXJSaWdodCwgJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5vbmJvYXJkaW5nLWEtYnRuLm9uYm9hcmRpbmctYS1idG4tc2Vjb25kYXJ5JykpO1xuXHRcdHRoaXMuYmFja0J1dHRvbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLmJhY2snLCBcIkJhY2tcIik7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLmZvb3RlckZvY3VzYWJsZUVsZW1lbnRzLnB1c2godGhpcy5iYWNrQnV0dG9uKTtcblxuXHRcdHRoaXMubmV4dEJ1dHRvbiA9IGFwcGVuZChmb290ZXJSaWdodCwgJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5vbmJvYXJkaW5nLWEtYnRuLm9uYm9hcmRpbmctYS1idG4tcHJpbWFyeScpKTtcblx0XHR0aGlzLm5leHRCdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuZm9vdGVyRm9jdXNhYmxlRWxlbWVudHMucHVzaCh0aGlzLm5leHRCdXR0b24pO1xuXHRcdHRoaXMuX3VwZGF0ZUJ1dHRvblN0YXRlcygpO1xuXG5cdFx0Ly8gRXZlbnQgaGFuZGxlcnNcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jbG9zZUJ1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ3NraXAnKTtcblx0XHRcdHRoaXMuX2Rpc21pc3MoJ3NraXAnKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuYmFja0J1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50U3RlcEluZGV4ID09PSAwICYmIHRoaXMuZW50ZXJwcmlzZVNpZ25JblVpU3RhdGUgPT09ICdpbnN0YW5jZScpIHtcblx0XHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdjYW5jZWxFbnRlcnByaXNlSW5zdGFuY2VQcm9tcHQnKTtcblx0XHRcdFx0dGhpcy5lbnRlcnByaXNlU2lnbkluV2F0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3NldEVudGVycHJpc2VTaWduSW5VaVN0YXRlKCdvcHRpb25zJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdiYWNrJyk7XG5cdFx0XHR0aGlzLl9wcmV2U3RlcCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5uZXh0QnV0dG9uLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0xhc3RTdGVwKCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdjb21wbGV0ZScpO1xuXHRcdFx0XHR0aGlzLl9kaXNtaXNzKCdjb21wbGV0ZScpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmN1cnJlbnRTdGVwSW5kZXggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdjb250aW51ZVdpdGhvdXRTaWduSW4nKTtcblx0XHRcdFx0dGhpcy5fbmV4dFN0ZXAoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ0FjdGlvbignbmV4dCcpO1xuXHRcdFx0XHR0aGlzLl9uZXh0U3RlcCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm92ZXJsYXksIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0ID09PSB0aGlzLm92ZXJsYXkpIHtcblx0XHRcdFx0dGhpcy5fZGlzbWlzcygnc2tpcCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm92ZXJsYXksIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0Ly8gUHJldmVudCBhbGwga2V5Ym9hcmQgc2hvcnRjdXRzIGZyb20gcmVhY2hpbmcgdGhlIGtleWJpbmRpbmcgc2VydmljZVxuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5fZGlzbWlzcygnc2tpcCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlRhYikge1xuXHRcdFx0XHR0aGlzLl90cmFwVGFiKGUsIGV2ZW50LnNoaWZ0S2V5KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBFbnRyYW5jZSBhbmltYXRpb25cblx0XHR0aGlzLm92ZXJsYXkuY2xhc3NMaXN0LmFkZCgnZW50ZXJpbmcnKTtcblx0XHRnZXRBY3RpdmVXaW5kb3coKS5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0dGhpcy5vdmVybGF5Py5jbGFzc0xpc3QucmVtb3ZlKCdlbnRlcmluZycpO1xuXHRcdFx0dGhpcy5vdmVybGF5Py5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9mb2N1c0N1cnJlbnRTdGVwRWxlbWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzbWlzcyhyZWFzb246ICdjb21wbGV0ZScgfCAnc2tpcCcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMub3ZlcmxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ0FjdGlvbignZGlzbWlzcycsIHVuZGVmaW5lZCwgcmVhc29uKTtcblxuXHRcdHRoaXMub3ZlcmxheS5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0dGhpcy5vdmVybGF5LmNsYXNzTGlzdC5hZGQoJ2V4aXRpbmcnKTtcblxuXHRcdGxldCBoYW5kbGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgb25UcmFuc2l0aW9uRW5kID0gKCkgPT4ge1xuXHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aGFuZGxlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9yZW1vdmVGcm9tRE9NKCk7XG5cdFx0XHRpZiAocmVhc29uID09PSAnY29tcGxldGUnKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ29tcGxldGUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWREaXNtaXNzLmZpcmUoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5vdmVybGF5LmFkZEV2ZW50TGlzdGVuZXIoJ3RyYW5zaXRpb25lbmQnLCBvblRyYW5zaXRpb25FbmQsIHsgb25jZTogdHJ1ZSB9KTtcblx0XHRzZXRUaW1lb3V0KG9uVHJhbnNpdGlvbkVuZCwgNDAwKTtcblx0fVxuXG5cdHByaXZhdGUgX25leHRTdGVwKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwSW5kZXggPCB0aGlzLnN0ZXBzLmxlbmd0aCAtIDEpIHtcblx0XHRcdGNvbnN0IGxlYXZpbmdTdGVwID0gdGhpcy5zdGVwc1t0aGlzLmN1cnJlbnRTdGVwSW5kZXhdO1xuXHRcdFx0aWYgKGxlYXZpbmdTdGVwID09PSBPbmJvYXJkaW5nU3RlcElkLlNpZ25Jbikge1xuXHRcdFx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5VaVN0YXRlID0gJ29wdGlvbnMnO1xuXHRcdFx0XHR0aGlzLmVudGVycHJpc2VJbnN0YW5jZVZhbHVlID0gJyc7XG5cdFx0XHRcdHRoaXMuZW50ZXJwcmlzZVNpZ25JbldhdGNoID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxlYXZpbmdTdGVwID09PSBPbmJvYXJkaW5nU3RlcElkLlBlcnNvbmFsaXplKSB7XG5cdFx0XHRcdHRoaXMuX2FwcGx5S2V5bWFwKHRoaXMuc2VsZWN0ZWRLZXltYXBJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmN1cnJlbnRTdGVwSW5kZXgrKztcblx0XHRcdHRoaXMuX3JlbmRlclN0ZXAoKTtcblx0XHRcdHRoaXMuX3JlbmRlclByb2dyZXNzKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25TdGF0ZXMoKTtcblx0XHRcdHRoaXMuX2ZvY3VzQ3VycmVudFN0ZXBFbGVtZW50KCk7XG5cdFx0XHR0aGlzLl9sb2dTdGVwVmlldygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3ByZXZTdGVwKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRTdGVwSW5kZXggPiAwKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRTdGVwSW5kZXgtLTtcblx0XHRcdHRoaXMuX3JlbmRlclN0ZXAoKTtcblx0XHRcdHRoaXMuX3JlbmRlclByb2dyZXNzKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVCdXR0b25TdGF0ZXMoKTtcblx0XHRcdHRoaXMuX2ZvY3VzQ3VycmVudFN0ZXBFbGVtZW50KCk7XG5cdFx0XHR0aGlzLl9sb2dTdGVwVmlldygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzTGFzdFN0ZXAoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudFN0ZXBJbmRleCA9PT0gdGhpcy5zdGVwcy5sZW5ndGggLSAxO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyUHJvZ3Jlc3MoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnByb2dyZXNzQ29udGFpbmVyIHx8ICF0aGlzLnN0ZXBMYWJlbEVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2xlYXJOb2RlKHRoaXMucHJvZ3Jlc3NDb250YWluZXIpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnN0ZXBzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkb3QgPSBhcHBlbmQodGhpcy5wcm9ncmVzc0NvbnRhaW5lciwgJCgnc3Bhbi5vbmJvYXJkaW5nLWEtcHJvZ3Jlc3MtZG90JykpO1xuXHRcdFx0aWYgKGkgPT09IHRoaXMuY3VycmVudFN0ZXBJbmRleCkge1xuXHRcdFx0XHRkb3QuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cdFx0XHR9IGVsc2UgaWYgKGkgPCB0aGlzLmN1cnJlbnRTdGVwSW5kZXgpIHtcblx0XHRcdFx0ZG90LmNsYXNzTGlzdC5hZGQoJ2NvbXBsZXRlZCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucHJvZ3Jlc3NDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zdGVwTGFiZWxFbCk7XG5cdFx0dGhpcy5zdGVwTGFiZWxFbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKFxuXHRcdFx0J29uYm9hcmRpbmcuc3RlcE9mJyxcblx0XHRcdFwiezB9IG9mIHsxfVwiLFxuXHRcdFx0dGhpcy5jdXJyZW50U3RlcEluZGV4ICsgMSxcblx0XHRcdHRoaXMuc3RlcHMubGVuZ3RoXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlclN0ZXAoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRpdGxlRWwgfHwgIXRoaXMuc3VidGl0bGVFbCB8fCAhdGhpcy5jb250ZW50RWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuc3RlcEZvY3VzYWJsZUVsZW1lbnRzLmxlbmd0aCA9IDA7XG5cblx0XHRjb25zdCBzdGVwSWQgPSB0aGlzLnN0ZXBzW3RoaXMuY3VycmVudFN0ZXBJbmRleF07XG5cdFx0Y29uc3QgdXNlU2lnbkluSGVybyA9IHN0ZXBJZCA9PT0gT25ib2FyZGluZ1N0ZXBJZC5TaWduSW47XG5cdFx0dGhpcy50aXRsZUVsLnN0eWxlLmRpc3BsYXkgPSB1c2VTaWduSW5IZXJvID8gJ25vbmUnIDogJyc7XG5cdFx0dGhpcy5zdWJ0aXRsZUVsLnN0eWxlLmRpc3BsYXkgPSB1c2VTaWduSW5IZXJvID8gJ25vbmUnIDogJyc7XG5cdFx0dGhpcy50aXRsZUVsLnRleHRDb250ZW50ID0gZ2V0T25ib2FyZGluZ1N0ZXBUaXRsZShzdGVwSWQpO1xuXHRcdGlmIChzdGVwSWQgPT09IE9uYm9hcmRpbmdTdGVwSWQuQWdlbnRTZXNzaW9ucykge1xuXHRcdFx0dGhpcy5fcmVuZGVyQWdlbnRTZXNzaW9uc1N1YnRpdGxlKHRoaXMuc3VidGl0bGVFbCk7XG5cdFx0fSBlbHNlIGlmIChzdGVwSWQgPT09IE9uYm9hcmRpbmdTdGVwSWQuUGVyc29uYWxpemUpIHtcblx0XHRcdHRoaXMuX3JlbmRlclBlcnNvbmFsaXplU3VidGl0bGUodGhpcy5zdWJ0aXRsZUVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdWJ0aXRsZUVsLnRleHRDb250ZW50ID0gZ2V0T25ib2FyZGluZ1N0ZXBTdWJ0aXRsZShzdGVwSWQpO1xuXHRcdH1cblxuXHRcdGNsZWFyTm9kZSh0aGlzLmNvbnRlbnRFbCk7XG5cblx0XHRzd2l0Y2ggKHN0ZXBJZCkge1xuXHRcdFx0Y2FzZSBPbmJvYXJkaW5nU3RlcElkLlNpZ25Jbjpcblx0XHRcdFx0dGhpcy5fcmVuZGVyU2lnbkluU3RlcCh0aGlzLmNvbnRlbnRFbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBPbmJvYXJkaW5nU3RlcElkLlBlcnNvbmFsaXplOlxuXHRcdFx0XHR0aGlzLl9yZW5kZXJQZXJzb25hbGl6ZVN0ZXAodGhpcy5jb250ZW50RWwpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT25ib2FyZGluZ1N0ZXBJZC5BaVByZWZlcmVuY2U6XG5cdFx0XHRcdHRoaXMuX3JlbmRlckFpUHJlZmVyZW5jZVN0ZXAodGhpcy5jb250ZW50RWwpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgT25ib2FyZGluZ1N0ZXBJZC5BZ2VudFNlc3Npb25zOlxuXHRcdFx0XHR0aGlzLl9yZW5kZXJBZ2VudFNlc3Npb25zU3RlcCh0aGlzLmNvbnRlbnRFbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHRoaXMuYm9keUVsPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZShcblx0XHRcdCdvbmJvYXJkaW5nLnN0ZXAuYXJpYScsXG5cdFx0XHRcIlN0ZXAgezB9IG9mIHsxfTogezJ9XCIsXG5cdFx0XHR0aGlzLmN1cnJlbnRTdGVwSW5kZXggKyAxLFxuXHRcdFx0dGhpcy5zdGVwcy5sZW5ndGgsXG5cdFx0XHRnZXRPbmJvYXJkaW5nU3RlcFRpdGxlKHN0ZXBJZClcblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUJ1dHRvblN0YXRlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5iYWNrQnV0dG9uKSB7XG5cdFx0XHRjb25zdCBzaG93RW50ZXJwcmlzZUJhY2sgPSB0aGlzLmN1cnJlbnRTdGVwSW5kZXggPT09IDAgJiYgdGhpcy5lbnRlcnByaXNlU2lnbkluVWlTdGF0ZSA9PT0gJ2luc3RhbmNlJztcblx0XHRcdHRoaXMuYmFja0J1dHRvbi5zdHlsZS5kaXNwbGF5ID0gKHRoaXMuY3VycmVudFN0ZXBJbmRleCA9PT0gMCAmJiAhc2hvd0VudGVycHJpc2VCYWNrKSA/ICdub25lJyA6ICcnO1xuXHRcdH1cblx0XHRpZiAodGhpcy5uZXh0QnV0dG9uKSB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50U3RlcEluZGV4ID09PSAwKSB7XG5cdFx0XHRcdGlmICh0aGlzLl91c2VyU2lnbmVkSW4pIHtcblx0XHRcdFx0XHR0aGlzLm5leHRCdXR0b24uY2xhc3NOYW1lID0gJ29uYm9hcmRpbmctYS1idG4gb25ib2FyZGluZy1hLWJ0bi1wcmltYXJ5Jztcblx0XHRcdFx0XHR0aGlzLm5leHRCdXR0b24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5jb250aW51ZScsIFwiQ29udGludWVcIik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gU2lnbi1pbiBzdGVwOiBzZWNvbmRhcnkgXCJDb250aW51ZSB3aXRob3V0IFNpZ25pbmcgSW5cIlxuXHRcdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi5jbGFzc05hbWUgPSAnb25ib2FyZGluZy1hLWJ0biBvbmJvYXJkaW5nLWEtYnRuLXNlY29uZGFyeSc7XG5cdFx0XHRcdFx0dGhpcy5uZXh0QnV0dG9uLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcuY29udGludWVXaXRob3V0U2lnbkluJywgXCJDb250aW51ZSB3aXRob3V0IFNpZ25pbmcgSW5cIik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faXNMYXN0U3RlcCgpKSB7XG5cdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi5jbGFzc05hbWUgPSAnb25ib2FyZGluZy1hLWJ0biBvbmJvYXJkaW5nLWEtYnRuLXByaW1hcnknO1xuXHRcdFx0XHR0aGlzLm5leHRCdXR0b24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5nZXRTdGFydGVkJywgXCJHZXQgU3RhcnRlZFwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubmV4dEJ1dHRvbi5jbGFzc05hbWUgPSAnb25ib2FyZGluZy1hLWJ0biBvbmJvYXJkaW5nLWEtYnRuLXByaW1hcnknO1xuXHRcdFx0XHR0aGlzLm5leHRCdXR0b24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5uZXh0JywgXCJDb250aW51ZVwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuZm9vdGVyTGVmdCkge1xuXHRcdFx0aWYgKHRoaXMuX2lzTGFzdFN0ZXAoKSkge1xuXHRcdFx0XHQvLyBTaG93IHNpZ24taW4gbnVkZ2UgaW4gZm9vdGVyXG5cdFx0XHRcdGlmICghdGhpcy5fZm9vdGVyU2lnbkluQnRuICYmICF0aGlzLl91c2VyU2lnbmVkSW4pIHtcblx0XHRcdFx0XHR0aGlzLl9mb290ZXJTaWduSW5CdG4gPSBhcHBlbmQodGhpcy5mb290ZXJMZWZ0LCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLm9uYm9hcmRpbmctYS1zaWduaW4tbnVkZ2UtYnRuJykpO1xuXHRcdFx0XHRcdHRoaXMuX2Zvb3RlclNpZ25JbkJ0bi50eXBlID0gJ2J1dHRvbic7XG5cdFx0XHRcdFx0dGhpcy5fZm9vdGVyU2lnbkluQnRuLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcuc2Vzc2lvbnMuc2lnbkluTnVkZ2UnLCBcIlNpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90XCIpO1xuXHRcdFx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZm9vdGVyU2lnbkluQnRuLCBFdmVudFR5cGUuQ0xJQ0ssIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ0FjdGlvbignc2lnbkluTnVkZ2UnKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZVNpZ25JbigpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3VzZXJTaWduZWRJbiAmJiB0aGlzLl9mb290ZXJTaWduSW5CdG4pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZm9vdGVyU2lnbkluQnRuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fZm9vdGVyU2lnbkluQnRuKSB7XG5cdFx0XHRcdFx0dGhpcy5fZm9vdGVyU2lnbkluQnRuLnJlbW92ZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2Zvb3RlclNpZ25JbkJ0biA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBTdGVwOiBTaWduIEluXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHByaXZhdGUgX3JlbmRlclNpZ25JblN0ZXAoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcub25ib2FyZGluZy1hLXNpZ25pbicpKTtcblx0XHRjb25zdCBicmFuZCA9IGFwcGVuZCh3cmFwcGVyLCAkKCcub25ib2FyZGluZy1hLXNpZ25pbi1icmFuZCcpKTtcblx0XHRjb25zdCBicmFuZEljb24gPSBhcHBlbmQoYnJhbmQsICQoJ3NwYW4ub25ib2FyZGluZy1hLXNpZ25pbi1icmFuZC1pY29uJykpO1xuXHRcdGJyYW5kSWNvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnaW1nJyk7XG5cdFx0YnJhbmRJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHByb2R1Y3QubmFtZUxvbmcpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGFwcGVuZCh3cmFwcGVyLCAkKCcub25ib2FyZGluZy1hLXNpZ25pbi1jb250ZW50JykpO1xuXHRcdGNvbnN0IGNvbnRlbnRNYWluID0gYXBwZW5kKGNvbnRlbnQsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWNvbnRlbnQtbWFpbicpKTtcblx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChjb250ZW50TWFpbiwgJCgnaDIub25ib2FyZGluZy1hLXNpZ25pbi10aXRsZScpKTtcblx0XHR0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5oZXJvVGl0bGUnLCBcIldlbGNvbWUgdG8gVlMgQ29kZVwiKTtcblxuXHRcdGNvbnN0IHN1YnRpdGxlID0gYXBwZW5kKGNvbnRlbnRNYWluLCAkKCdwLm9uYm9hcmRpbmctYS1zaWduaW4tc3VidGl0bGUnKSk7XG5cdFx0c3VidGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uaGVyb1N1YnRpdGxlJywgXCJTaWduIGluIHRvIHVzZSBHaXRIdWIgQ29waWxvdC5cIik7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gYXBwZW5kKGNvbnRlbnRNYWluLCAkKCcub25ib2FyZGluZy1hLXNpZ25pbi1hY3Rpb25zJykpO1xuXG5cdFx0aWYgKHRoaXMuX3VzZXJTaWduZWRJbikge1xuXHRcdFx0Y29uc3Qgc2lnbmVkSW4gPSBhcHBlbmQoYWN0aW9ucywgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tY29uZmlybWF0aW9uJykpO1xuXHRcdFx0Y29uc3QgaWNvbiA9IGFwcGVuZChzaWduZWRJbiwgJCgnc3BhbicpKTtcblx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZWNrKSk7XG5cdFx0XHRpY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGFwcGVuZChzaWduZWRJbiwgJCgnc3BhbicpKTtcblx0XHRcdHRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uc2lnbmVkSW4nLCBcIllvdSdyZSBzaWduZWQgaW4uIFlvdSBjYW4gY29udGludWUgdG8gdGhlIG5leHQgc3RlcC5cIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN3aXRjaCAodGhpcy5lbnRlcnByaXNlU2lnbkluVWlTdGF0ZSkge1xuXHRcdFx0XHRjYXNlICdpbnN0YW5jZSc6XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyRW50ZXJwcmlzZUluc3RhbmNlRm9ybShhY3Rpb25zKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncHJvZ3Jlc3MnOlxuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckVudGVycHJpc2VTaWduSW5Qcm9ncmVzcyhhY3Rpb25zKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJEZWZhdWx0U2lnbkluQWN0aW9ucyhhY3Rpb25zKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb290ZXIgPSBhcHBlbmQod3JhcHBlciwgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tZm9vdGVyJykpO1xuXG5cdFx0Y29uc3QgZGlzY2xhaW1lckNvbCA9IGFwcGVuZChmb290ZXIsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWRpc2NsYWltZXItY29sJykpO1xuXG5cdFx0Ly8gR2l0SHViIENvcGlsb3QgZGlzY2xhaW1lclxuXHRcdGNvbnN0IGNvcGlsb3REaXNjbGFpbWVyID0gYXBwZW5kKGRpc2NsYWltZXJDb2wsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWRpc2NsYWltZXInKSk7XG5cdFx0Y29waWxvdERpc2NsYWltZXIuYXBwZW5kKGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLnByZWZpeCcsIFwiQnkgc2lnbmluZyBpbiwgeW91IGFncmVlIHRvIHswfSdzIFwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5kZWZhdWx0Lm5hbWUpKTtcblx0XHR0aGlzLl9jcmVhdGVJbmxpbmVMaW5rKGNvcGlsb3REaXNjbGFpbWVyLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci50ZXJtcycsIFwiVGVybXNcIiksIGRlZmF1bHRDaGF0LnRlcm1zU3RhdGVtZW50VXJsKTtcblx0XHRjb3BpbG90RGlzY2xhaW1lci5hcHBlbmQobG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmRpc2NsYWltZXIubWlkZGxlJywgXCIgYW5kIFwiKSk7XG5cdFx0dGhpcy5fY3JlYXRlSW5saW5lTGluayhjb3BpbG90RGlzY2xhaW1lciwgbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmRpc2NsYWltZXIucHJpdmFjeScsIFwiUHJpdmFjeSBTdGF0ZW1lbnRcIiksIGRlZmF1bHRDaGF0LnByaXZhY3lTdGF0ZW1lbnRVcmwpO1xuXHRcdGNvcGlsb3REaXNjbGFpbWVyLmFwcGVuZChsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci5jb3BpbG90UHJlZml4JywgXCIuIHswfSBDb3BpbG90IG1heSBzaG93IFwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5kZWZhdWx0Lm5hbWUpKTtcblx0XHR0aGlzLl9jcmVhdGVJbmxpbmVMaW5rKGNvcGlsb3REaXNjbGFpbWVyLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci5wdWJsaWNDb2RlJywgXCJwdWJsaWMgY29kZVwiKSwgZGVmYXVsdENoYXQucHVibGljQ29kZU1hdGNoZXNVcmwpO1xuXHRcdGNvcGlsb3REaXNjbGFpbWVyLmFwcGVuZChsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci5pbXByb3ZlU3VmZml4JywgXCIgc3VnZ2VzdGlvbnMgYW5kIHVzZSB5b3VyIGRhdGEgdG8gaW1wcm92ZSB0aGUgcHJvZHVjdC5cIikpO1xuXHRcdGNvcGlsb3REaXNjbGFpbWVyLmFwcGVuZCgnICcpO1xuXHRcdGNvcGlsb3REaXNjbGFpbWVyLmFwcGVuZChsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci5zZXR0aW5nc1ByZWZpeCcsIFwiWW91IGNhbiBjaGFuZ2UgdGhlc2UgXCIpKTtcblx0XHR0aGlzLl9jcmVhdGVJbmxpbmVMaW5rKGNvcGlsb3REaXNjbGFpbWVyLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZGlzY2xhaW1lci5zZXR0aW5ncycsIFwic2V0dGluZ3NcIiksIHRoaXMuZGVmYXVsdEFjY291bnRTZXJ2aWNlLnJlc29sdmVHaXRIdWJVcmwoR2l0SHViUGF0aHMuY29waWxvdFNldHRpbmdzKSk7XG5cdFx0Y29waWxvdERpc2NsYWltZXIuYXBwZW5kKGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5kaXNjbGFpbWVyLnN1ZmZpeCcsIFwiIGFueXRpbWUuXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckRlZmF1bHRTaWduSW5BY3Rpb25zKGFjdGlvbnM6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZ2l0aHViQnRuID0gdGhpcy5fcmVnaXN0ZXJTdGVwRm9jdXNhYmxlKHRoaXMuX2NyZWF0ZVNpZ25JbkJ1dHRvbihhY3Rpb25zLCAnZ2l0aHViJywgbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmdpdGh1YicsIFwiQ29udGludWUgd2l0aCBHaXRIdWJcIiksIHtcblx0XHRcdGVtcGhhc2l6ZWQ6IHRydWUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmdpdGh1Yi5hcmlhJywgXCJDb250aW51ZSB3aXRoIEdpdEh1YlwiKVxuXHRcdH0pKTtcblx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdpdGh1YkJ0biwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dBY3Rpb24oJ3NpZ25JbicsIHVuZGVmaW5lZCwgJ2dpdGh1YicpO1xuXHRcdFx0dGhpcy5faGFuZGxlU2lnbkluKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ29vZ2xlQnRuID0gdGhpcy5fcmVnaXN0ZXJTdGVwRm9jdXNhYmxlKHRoaXMuX2NyZWF0ZVNpZ25JbkJ1dHRvbihhY3Rpb25zLCAnZ29vZ2xlJywgbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmdvb2dsZScsIFwiQ29udGludWUgd2l0aCBHb29nbGVcIiksIHtcblx0XHRcdGljb25Pbmx5OiB0cnVlLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5nb29nbGUnLCBcIkNvbnRpbnVlIHdpdGggR29vZ2xlXCIpXG5cdFx0fSkpO1xuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZ29vZ2xlQnRuLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ0FjdGlvbignc2lnbkluJywgdW5kZWZpbmVkLCAnZ29vZ2xlJyk7XG5cdFx0XHR0aGlzLl9oYW5kbGVTaWduSW4oJ2dvb2dsZScpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGFwcGxlQnRuID0gdGhpcy5fcmVnaXN0ZXJTdGVwRm9jdXNhYmxlKHRoaXMuX2NyZWF0ZVNpZ25JbkJ1dHRvbihhY3Rpb25zLCAnYXBwbGUnLCBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uYXBwbGUnLCBcIkNvbnRpbnVlIHdpdGggQXBwbGVcIiksIHtcblx0XHRcdGljb25Pbmx5OiB0cnVlLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5hcHBsZScsIFwiQ29udGludWUgd2l0aCBBcHBsZVwiKVxuXHRcdH0pKTtcblx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFwcGxlQnRuLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ0FjdGlvbignc2lnbkluJywgdW5kZWZpbmVkLCAnYXBwbGUnKTtcblx0XHRcdHRoaXMuX2hhbmRsZVNpZ25JbignYXBwbGUnKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBnaGVCdG4gPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUodGhpcy5fY3JlYXRlU2lnbkluQnV0dG9uKGFjdGlvbnMsICdnaXRodWItZW50ZXJwcmlzZScsIGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5naGUnLCBcIkdIRVwiKSwge1xuXHRcdFx0dGV4dE9ubHk6IHRydWUsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmdoZS5hcmlhJywgXCJDb250aW51ZSB3aXRoIEdpdEh1YiBFbnRlcnByaXNlXCIpXG5cdFx0fSkpO1xuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZ2hlQnRuLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ0FjdGlvbignc2lnbkluJywgdW5kZWZpbmVkLCAnZ2l0aHViLWVudGVycHJpc2UnKTtcblx0XHRcdHZvaWQgdGhpcy5faGFuZGxlRW50ZXJwcmlzZVNpZ25JbigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEdIRV9JTlBVVF9BQ1RJT05fUEFERElORyA9IDI4O1xuXG5cdHByaXZhdGUgX3JlbmRlckVudGVycHJpc2VJbnN0YW5jZUZvcm0oYWN0aW9uczogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRlcnByaXNlUHJvbXB0TGFiZWwgPSB0aGlzLl9nZXRFbnRlcnByaXNlSW5zdGFuY2VQcm9tcHRMYWJlbCgpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gYXBwZW5kKGFjdGlvbnMsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWdoZS1pbnB1dCcpKTtcblxuXHRcdGNvbnN0IHN1Ym1pdEFjdGlvbiA9IHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J29uYm9hcmRpbmcuc2lnbkluLmVudGVycHJpc2Uuc3VibWl0Jyxcblx0XHRcdGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5lbnRlcnByaXNlLmNvbnRpbnVlJywgXCJDb250aW51ZVwiKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmFycm93UmlnaHQpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0KSk7XG5cblx0XHRjb25zdCBpbnB1dEJveCA9IHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChuZXcgSW5wdXRCb3goY29udGFpbmVyLCB1bmRlZmluZWQsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZW50ZXJwcmlzZS5wbGFjZWhvbGRlcicsICdpLmUuIFwib2N0b2NhdFwiIG9yIFwiaHR0cHM6Ly9vY3RvY2F0LmdoZS5jb21cIi4uLicpLFxuXHRcdFx0YXJpYUxhYmVsOiBlbnRlcnByaXNlUHJvbXB0TGFiZWwsXG5cdFx0XHRhY3Rpb25zOiBbc3VibWl0QWN0aW9uXSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0fSkpO1xuXHRcdGlucHV0Qm94LnZhbHVlID0gdGhpcy5lbnRlcnByaXNlSW5zdGFuY2VWYWx1ZTtcblx0XHRpbnB1dEJveC5wYWRkaW5nUmlnaHQgPSBPbmJvYXJkaW5nVmFyaWF0aW9uQS5HSEVfSU5QVVRfQUNUSU9OX1BBRERJTkc7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUoaW5wdXRCb3guaW5wdXRFbGVtZW50KTtcblxuXHRcdGNvbnN0IHN1Ym1pdCA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlR2hlSW5zdGFuY2VJbnB1dChpbnB1dEJveC52YWx1ZSk7XG5cdFx0XHRpZiAocmVzdWx0LmtpbmQgPT09IEdoZVBhcnNlUmVzdWx0S2luZC5FbXB0eSB8fCByZXN1bHQua2luZCA9PT0gR2hlUGFyc2VSZXN1bHRLaW5kLkludmFsaWQpIHtcblx0XHRcdFx0dmFsaWRhdGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fc3VibWl0RW50ZXJwcmlzZUluc3RhbmNlKHJlc3VsdC5yZXNvbHZlZFVyaSk7XG5cdFx0fTtcblx0XHRzdWJtaXRBY3Rpb24ucnVuID0gc3VibWl0O1xuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IGFwcGVuZChjb250YWluZXIsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWdoZS1tZXNzYWdlJykpO1xuXG5cdFx0Y29uc3QgdmFsaWRhdGUgPSAoKTogYm9vbGVhbiA9PiB7XG5cdFx0XHR0aGlzLmVudGVycHJpc2VJbnN0YW5jZVZhbHVlID0gaW5wdXRCb3gudmFsdWU7XG5cdFx0XHRpbnB1dEJveC5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2Vycm9yJyk7XG5cdFx0XHRtZXNzYWdlLmNsYXNzTGlzdC5yZW1vdmUoJ2Vycm9yJywgJ2luZm8nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VHaGVJbnN0YW5jZUlucHV0KGlucHV0Qm94LnZhbHVlKTtcblx0XHRcdHN3aXRjaCAocmVzdWx0LmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBHaGVQYXJzZVJlc3VsdEtpbmQuRW1wdHk6XG5cdFx0XHRcdFx0bWVzc2FnZS50ZXh0Q29udGVudCA9IGVudGVycHJpc2VQcm9tcHRMYWJlbDtcblx0XHRcdFx0XHRzdWJtaXRBY3Rpb24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0Y2FzZSBHaGVQYXJzZVJlc3VsdEtpbmQuU2luZ2xlV29yZDpcblx0XHRcdFx0XHRtZXNzYWdlLmNsYXNzTGlzdC5hZGQoJ2luZm8nKTtcblx0XHRcdFx0XHRtZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ29uYm9hcmRpbmcuc2lnbkluLmVudGVycHJpc2UucmVzb2x2ZScsIFwiV2lsbCByZXNvbHZlIHRvIHswfVwiLCByZXN1bHQucmVzb2x2ZWRVcmkpO1xuXHRcdFx0XHRcdHN1Ym1pdEFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0Y2FzZSBHaGVQYXJzZVJlc3VsdEtpbmQuRnVsbFVyaTpcblx0XHRcdFx0XHRzdWJtaXRBY3Rpb24uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0bWVzc2FnZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRjYXNlIEdoZVBhcnNlUmVzdWx0S2luZC5JbnZhbGlkOlxuXHRcdFx0XHRcdGlucHV0Qm94LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZXJyb3InKTtcblx0XHRcdFx0XHRtZXNzYWdlLmNsYXNzTGlzdC5hZGQoJ2Vycm9yJyk7XG5cdFx0XHRcdFx0bWVzc2FnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5lbnRlcnByaXNlLmludmFsaWQnLCAnWW91IG11c3QgZW50ZXIgYSB2YWxpZCB7MH0gaW5zdGFuY2UgKGkuZS4gXCJvY3RvY2F0XCIgb3IgXCJodHRwczovL29jdG9jYXQuZ2hlLmNvbVwiKScsIGRlZmF1bHRDaGF0LnByb3ZpZGVyLmVudGVycHJpc2UubmFtZSk7XG5cdFx0XHRcdFx0c3VibWl0QWN0aW9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChpbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR2YWxpZGF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHZvaWQgc3VibWl0QWN0aW9uLnJ1bigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2xvZ0FjdGlvbignY2FuY2VsRW50ZXJwcmlzZUluc3RhbmNlUHJvbXB0Jyk7XG5cdFx0XHRcdHRoaXMuZW50ZXJwcmlzZVNpZ25JbldhdGNoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9zZXRFbnRlcnByaXNlU2lnbkluVWlTdGF0ZSgnb3B0aW9ucycpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHZhbGlkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJFbnRlcnByaXNlU2lnbkluUHJvZ3Jlc3MoYWN0aW9uczogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSBhcHBlbmQoYWN0aW9ucywgJCgnLm9uYm9hcmRpbmctYS1zaWduaW4tZ2hlLXByb2dyZXNzJykpO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblx0XHRjb25zdCBzcGlubmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnc3BhbicpKTtcblx0XHRzcGlubmVyLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5sb2FkaW5nKSwgJ2NvZGljb24tbW9kaWZpZXItc3BpbicpO1xuXHRcdHNwaW5uZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGFwcGVuZChjb250YWluZXIsICQoJy5vbmJvYXJkaW5nLWEtc2lnbmluLWdoZS1wcm9ncmVzcy1tZXNzYWdlJykpO1xuXHRcdG1lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZW50ZXJwcmlzZS5wcm9ncmVzcycsIFwiV2FpdGluZyBmb3IgezB9IHNpZ24taW4gdG8gY29tcGxldGUuLi5cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudGVycHJpc2VJbnN0YW5jZVByb21wdExhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5lbnRlcnByaXNlLnByb21wdCcsIFwiV2hhdCBpcyB5b3VyIHswfSBpbnN0YW5jZT9cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEVudGVycHJpc2VTaWduSW5VaVN0YXRlKHN0YXRlOiBFbnRlcnByaXNlU2lnbkluVWlTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuZW50ZXJwcmlzZVNpZ25JblVpU3RhdGUgPSBzdGF0ZTtcblx0XHRpZiAodGhpcy5zdGVwc1t0aGlzLmN1cnJlbnRTdGVwSW5kZXhdID09PSBPbmJvYXJkaW5nU3RlcElkLlNpZ25JbiAmJiB0aGlzLmNvbnRlbnRFbCkge1xuXHRcdFx0dGhpcy5fcmVuZGVyU3RlcCgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQnV0dG9uU3RhdGVzKCk7XG5cdFx0XHR0aGlzLl9mb2N1c0N1cnJlbnRTdGVwRWxlbWVudCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVNpZ25JbkJ1dHRvbihwYXJlbnQ6IEhUTUxFbGVtZW50LCBwcm92aWRlckNsYXNzOiAnZ2l0aHViJyB8ICdnaXRodWItZW50ZXJwcmlzZScgfCAnZ29vZ2xlJyB8ICdhcHBsZScsIGxhYmVsOiBzdHJpbmcsIG9wdGlvbnM/OiB7IGVtcGhhc2l6ZWQ/OiBib29sZWFuOyBpY29uT25seT86IGJvb2xlYW47IHRleHRPbmx5PzogYm9vbGVhbjsgbGFiZWw/OiBzdHJpbmcgfSk6IEhUTUxCdXR0b25FbGVtZW50IHtcblx0XHRjb25zdCBpc0NvbXBhY3QgPSBvcHRpb25zPy5pY29uT25seSB8fCBvcHRpb25zPy50ZXh0T25seTtcblx0XHRjb25zdCBidG4gPSBhcHBlbmQocGFyZW50LCAkPEhUTUxCdXR0b25FbGVtZW50Pihpc0NvbXBhY3QgPyAnYnV0dG9uLm9uYm9hcmRpbmctYS1zaWduaW4taWNvbi1idG4nIDogJ2J1dHRvbi5vbmJvYXJkaW5nLWEtc2lnbmluLWJ0bicpKTtcblx0XHRidG4udHlwZSA9ICdidXR0b24nO1xuXHRcdGJ0bi50aXRsZSA9IG9wdGlvbnM/LmxhYmVsID8/IGxhYmVsO1xuXHRcdGJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBvcHRpb25zPy5sYWJlbCA/PyBsYWJlbCk7XG5cdFx0aWYgKG9wdGlvbnM/LmVtcGhhc2l6ZWQpIHtcblx0XHRcdGJ0bi5jbGFzc0xpc3QuYWRkKCdwcmltYXJ5Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKCFvcHRpb25zPy50ZXh0T25seSkge1xuXHRcdFx0Y29uc3QgbWFyayA9IGFwcGVuZChidG4sICQoJ3NwYW4ub25ib2FyZGluZy1hLXByb3ZpZGVyLW1hcmsnKSk7XG5cdFx0XHRtYXJrLmNsYXNzTGlzdC5hZGQocHJvdmlkZXJDbGFzcyk7XG5cdFx0XHRtYXJrLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0aWYgKHByb3ZpZGVyQ2xhc3MgPT09ICdnaXRodWInIHx8IHByb3ZpZGVyQ2xhc3MgPT09ICdnaXRodWItZW50ZXJwcmlzZScpIHtcblx0XHRcdFx0bWFyay5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uZ2l0aHViKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFvcHRpb25zPy5pY29uT25seSkge1xuXHRcdFx0Y29uc3QgbGFiZWxFbCA9IGFwcGVuZChidG4sICQoJ3NwYW4ub25ib2FyZGluZy1hLXNpZ25pbi1idG4tbGFiZWwnKSk7XG5cdFx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJ0bjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVNpZ25Jbihzb2NpYWxQcm92aWRlcj86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gc29jaWFsUHJvdmlkZXIgPz8gJ2dpdGh1Yic7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjY291bnQgPSBhd2FpdCB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5zaWduSW4oe1xuXHRcdFx0XHRleHRyYUF1dGhvcml6ZVBhcmFtZXRlcnM6IHsgZ2V0X3N0YXJ0ZWRfd2l0aDogJ2NvcGlsb3QtdnNjb2RlJyB9LFxuXHRcdFx0XHRwcm92aWRlcjogc29jaWFsUHJvdmlkZXIsXG5cdFx0XHR9KTtcblx0XHRcdGlmIChhY2NvdW50KSB7XG5cdFx0XHRcdHRoaXMuX3VzZXJTaWduZWRJbiA9IHRydWU7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiAnaW5zdGFsbGVkJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlciB9KTtcblx0XHRcdFx0Ly8gUnVuIGNoYXQgc2V0dXAgaW4gdGhlIGJhY2tncm91bmQgKHNpZ24tdXAsIGV4dGVuc2lvbiBpbnN0YWxsLCBlbnRpdGxlbWVudCByZXNvbHV0aW9uKVxuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQudHJpZ2dlclNldHVwJywgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdFx0ZGlzYWJsZUNoYXRWaWV3UmV2ZWFsOiB0cnVlLFxuXHRcdFx0XHRcdHNldHVwU3RyYXRlZ3k6IENoYXRTZXR1cFN0cmF0ZWd5LkRlZmF1bHRTZXR1cCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX25leHRTdGVwKCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2NhbmNlbGxlZCcsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXIgfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdmYWlsZWROb3RTaWduZWRJbicsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXIgfSk7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnb25ib2FyZGluZy5zaWduSW4uZXJyb3InLCBcIlNpZ24taW4gZmFpbGVkLiBZb3UgY2FuIHRyeSBhZ2FpbiBsYXRlciBmcm9tIHRoZSBBY2NvdW50cyBtZW51LlwiKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUVudGVycHJpc2VTaWduSW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdVcmkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oZGVmYXVsdENoYXQucHJvdmlkZXJVcmlTZXR0aW5nKTtcblx0XHRpZiAodHlwZW9mIGV4aXN0aW5nVXJpICE9PSAnc3RyaW5nJyB8fCAhR0hFX0ZVTExfVVJJX1JFR0VYLnRlc3QoZXhpc3RpbmdVcmkpKSB7XG5cdFx0XHR0aGlzLmVudGVycHJpc2VJbnN0YW5jZVZhbHVlID0gZXhpc3RpbmdVcmkgPz8gJyc7XG5cdFx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5XYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRcdHRoaXMuX3NldEVudGVycHJpc2VTaWduSW5VaVN0YXRlKCdpbnN0YW5jZScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZW50ZXJwcmlzZUluc3RhbmNlVmFsdWUgPSBleGlzdGluZ1VyaTtcblx0XHRhd2FpdCB0aGlzLl9ydW5FbnRlcnByaXNlU2lnbkluU2V0dXAoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N1Ym1pdEVudGVycHJpc2VJbnN0YW5jZShyZXNvbHZlZFVyaTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoZGVmYXVsdENoYXQucHJvdmlkZXJVcmlTZXR0aW5nLCByZXNvbHZlZFVyaSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdHRoaXMuZW50ZXJwcmlzZUluc3RhbmNlVmFsdWUgPSByZXNvbHZlZFVyaTtcblx0XHRcdGF3YWl0IHRoaXMuX3J1bkVudGVycHJpc2VTaWduSW5TZXR1cCgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5lbnRlcnByaXNlU2lnbkluV2F0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZXRFbnRlcnByaXNlU2lnbkluVWlTdGF0ZSgnaW5zdGFuY2UnKTtcblx0XHRcdHRoaXMuX25vdGlmeUVudGVycHJpc2VTaWduSW5FcnJvcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bkVudGVycHJpc2VTaWduSW5TZXR1cCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3YXRjaCA9IHRoaXMuZW50ZXJwcmlzZVNpZ25JbldhdGNoID8/IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGRlZmF1bHRDaGF0LnByb3ZpZGVyLmVudGVycHJpc2UuaWQ7XG5cdFx0dGhpcy5fc2V0RW50ZXJwcmlzZVNpZ25JblVpU3RhdGUoJ3Byb2dyZXNzJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXAnLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0ZGlzYWJsZUNoYXRWaWV3UmV2ZWFsOiB0cnVlLFxuXHRcdFx0XHRzZXR1cFN0cmF0ZWd5OiBDaGF0U2V0dXBTdHJhdGVneS5TZXR1cFdpdGhFbnRlcnByaXNlUHJvdmlkZXIsXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0dGhpcy5fdXNlclNpZ25lZEluID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdpbnN0YWxsZWQnLCBpbnN0YWxsRHVyYXRpb246IHdhdGNoLmVsYXBzZWQoKSwgc2lnblVwRXJyb3JDb2RlOiB1bmRlZmluZWQsIHByb3ZpZGVyIH0pO1xuXHRcdFx0XHR0aGlzLl9uZXh0U3RlcCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2V0RW50ZXJwcmlzZVNpZ25JblVpU3RhdGUoJ29wdGlvbnMnKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMuX3NldEVudGVycHJpc2VTaWduSW5VaVN0YXRlKCdvcHRpb25zJyk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiAnY2FuY2VsbGVkJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlciB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9zZXRFbnRlcnByaXNlU2lnbkluVWlTdGF0ZSgnaW5zdGFuY2UnKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiAnZmFpbGVkTm90U2lnbmVkSW4nLCBpbnN0YWxsRHVyYXRpb246IHdhdGNoLmVsYXBzZWQoKSwgc2lnblVwRXJyb3JDb2RlOiB1bmRlZmluZWQsIHByb3ZpZGVyIH0pO1xuXHRcdFx0dGhpcy5fbm90aWZ5RW50ZXJwcmlzZVNpZ25JbkVycm9yKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuZW50ZXJwcmlzZVNpZ25JbldhdGNoID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX25vdGlmeUVudGVycHJpc2VTaWduSW5FcnJvcigpOiB2b2lkIHtcblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNpZ25Jbi5lbnRlcnByaXNlLmVycm9yJywgXCJHaXRIdWIgRW50ZXJwcmlzZSBzaWduLWluIGZhaWxlZC4gQ2hlY2sgeW91ciBpbnN0YW5jZSBVUkwgYW5kIHRyeSBhZ2Fpbi5cIiksXG5cdFx0fSk7XG5cdH1cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gU3RlcDogUGVyc29uYWxpemUgKFRoZW1lICsgS2V5bWFwKVxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRwcml2YXRlIF9yZW5kZXJQZXJzb25hbGl6ZVN0ZXAoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcub25ib2FyZGluZy1hLXBlcnNvbmFsaXplJykpO1xuXG5cdFx0Ly8gVGhlbWUgc2VjdGlvblxuXHRcdGNvbnN0IHRoZW1lTGFiZWwgPSBhcHBlbmQod3JhcHBlciwgJCgnZGl2Lm9uYm9hcmRpbmctYS1zZWN0aW9uLWxhYmVsJykpO1xuXHRcdHRoZW1lTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5wZXJzb25hbGl6ZS50aGVtZScsIFwiQ29sb3IgVGhlbWVcIik7XG5cblx0XHRjb25zdCB0aGVtZUhpbnQgPSBhcHBlbmQod3JhcHBlciwgJCgnZGl2Lm9uYm9hcmRpbmctYS10aGVtZS1oaW50JykpO1xuXHRcdHRoZW1lSGludC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRoZW1lSGludCcsIFwiWW91IGNhbiBicm93c2UgYW5kIGluc3RhbGwgbW9yZSB0aGVtZXMgbGF0ZXIgZnJvbSB0aGUgRXh0ZW5zaW9ucyB2aWV3LlwiKTtcblxuXHRcdGNvbnN0IHRoZW1lR3JpZCA9IGFwcGVuZCh3cmFwcGVyLCAkKCcub25ib2FyZGluZy1hLXRoZW1lLWdyaWQnKSk7XG5cdFx0dGhlbWVHcmlkLnNldEF0dHJpYnV0ZSgncm9sZScsICdyYWRpb2dyb3VwJyk7XG5cdFx0dGhlbWVHcmlkLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRoZW1lTGFiZWwnLCBcIkNob29zZSBhIGNvbG9yIHRoZW1lXCIpKTtcblxuXHRcdGNvbnN0IGhhc090aGVyRWRpdG9ycyA9IHRoaXMuX2hhc090aGVyRWRpdG9ycygpO1xuXHRcdGNvbnN0IGFsbFRoZW1lcyA9IHByb2R1Y3Qub25ib2FyZGluZ1RoZW1lcyA/PyBbXTtcblx0XHQvLyBXaGVuIG90aGVyIGVkaXRvcnMgYXJlIGRldGVjdGVkLCBzaG93IGEgY29tcGFjdCBzZXQgKGV4Y2x1ZGUgc29sYXJpemVkIHZhcmlhbnRzKS5cblx0XHRjb25zdCB0aGVtZXM6IHJlYWRvbmx5IElPbmJvYXJkaW5nVGhlbWVPcHRpb25bXSA9IGhhc090aGVyRWRpdG9yc1xuXHRcdFx0PyBhbGxUaGVtZXMuZmlsdGVyKHQgPT4gIXQuaWQuc3RhcnRzV2l0aCgnc29sYXJpemVkJykpXG5cdFx0XHQ6IGFsbFRoZW1lcztcblxuXHRcdGlmICghaGFzT3RoZXJFZGl0b3JzKSB7XG5cdFx0XHR0aGVtZUdyaWQuY2xhc3NMaXN0LmFkZCgndGhlbWUtZ3JpZC1leHBhbmRlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRoZW1lQ2FyZHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHRoZW1lIG9mIHRoZW1lcykge1xuXHRcdFx0dGhpcy5fY3JlYXRlVGhlbWVDYXJkKHRoZW1lR3JpZCwgdGhlbWUsIHRoZW1lQ2FyZHMpO1xuXHRcdH1cblx0XHQvLyBNYWtlIGFsbCB0aGVtZSBjYXJkcyBpbmRpdmlkdWFsbHkgdGFiYmFibGVcblx0XHRmb3IgKGNvbnN0IGNhcmQgb2YgdGhlbWVDYXJkcykge1xuXHRcdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHR9XG5cblx0XHQvLyBLZXlib2FyZCBNYXBwaW5nIHNlY3Rpb24gXHUyMDE0IG9ubHkgc2hvd24gd2hlbiBhbm90aGVyIGVkaXRvciBpcyBkZXRlY3RlZFxuXHRcdGNvbnN0IGtleW1hcE9wdGlvbnMgPSB0aGlzLl9kZXRlY3RlZEVkaXRvcklkc1xuXHRcdFx0PyAocHJvZHVjdC5vbmJvYXJkaW5nS2V5bWFwcyA/PyBbXSkuZmlsdGVyKGsgPT4gdGhpcy5fZGV0ZWN0ZWRFZGl0b3JJZHMhLmhhcyhrLmlkKSlcblx0XHRcdDogW107XG5cblx0XHRpZiAoaGFzT3RoZXJFZGl0b3JzKSB7XG5cdFx0XHRjb25zdCBrZXltYXBMYWJlbCA9IGFwcGVuZCh3cmFwcGVyLCAkKCdkaXYub25ib2FyZGluZy1hLXNlY3Rpb24tbGFiZWwub25ib2FyZGluZy1hLXNlY3Rpb24tbGFiZWwta2V5bWFwJykpO1xuXHRcdFx0a2V5bWFwTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5wZXJzb25hbGl6ZS5rZXltYXAnLCBcIktleWJvYXJkIE1hcHBpbmdcIik7XG5cblx0XHRcdGNvbnN0IGtleW1hcEhpbnQgPSBhcHBlbmQod3JhcHBlciwgJCgnZGl2Lm9uYm9hcmRpbmctYS10aGVtZS1oaW50JykpO1xuXHRcdFx0a2V5bWFwSGludC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLmtleW1hcEhpbnQnLCBcIkNvbWluZyBmcm9tIGFub3RoZXIgZWRpdG9yPyBJbXBvcnQgeW91ciBrZXlib2FyZCBtYXBwaW5nIHRvIGZlZWwgcmlnaHQgYXQgaG9tZS5cIik7XG5cblx0XHRcdGNvbnN0IGtleW1hcExpc3QgPSBhcHBlbmQod3JhcHBlciwgJCgnLm9uYm9hcmRpbmctYS1rZXltYXAtbGlzdCcpKTtcblx0XHRcdGtleW1hcExpc3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvZ3JvdXAnKTtcblx0XHRcdGtleW1hcExpc3Quc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ29uYm9hcmRpbmcucGVyc29uYWxpemUua2V5bWFwTGFiZWwnLCBcIkNob29zZSBhIGtleWJvYXJkIG1hcHBpbmdcIikpO1xuXG5cdFx0XHRjb25zdCBrZXltYXBQaWxsczogSFRNTEJ1dHRvbkVsZW1lbnRbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBrZXltYXAgb2Yga2V5bWFwT3B0aW9ucykge1xuXHRcdFx0XHRjb25zdCBwaWxsID0gdGhpcy5fcmVnaXN0ZXJTdGVwRm9jdXNhYmxlKGFwcGVuZChrZXltYXBMaXN0LCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLm9uYm9hcmRpbmctYS1rZXltYXAtcGlsbCcpKSk7XG5cdFx0XHRcdHBpbGwudHlwZSA9ICdidXR0b24nO1xuXHRcdFx0XHRwaWxsLnNldEF0dHJpYnV0ZSgncm9sZScsICdyYWRpbycpO1xuXHRcdFx0XHRwaWxsLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywga2V5bWFwLmlkID09PSB0aGlzLnNlbGVjdGVkS2V5bWFwSWQgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHRcdFx0cGlsbC50aXRsZSA9IGtleW1hcC5kZXNjcmlwdGlvbjtcblx0XHRcdFx0a2V5bWFwUGlsbHMucHVzaChwaWxsKTtcblxuXHRcdFx0XHRjb25zdCBsYWJlbFNwYW4gPSBhcHBlbmQocGlsbCwgJCgnc3BhbicpKTtcblx0XHRcdFx0bGFiZWxTcGFuLnRleHRDb250ZW50ID0ga2V5bWFwLmxhYmVsO1xuXG5cdFx0XHRcdGlmIChrZXltYXAuaWQgPT09IHRoaXMuc2VsZWN0ZWRLZXltYXBJZCkge1xuXHRcdFx0XHRcdHBpbGwuY2xhc3NMaXN0LmFkZCgnc2VsZWN0ZWQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIocGlsbCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdzZWxlY3RLZXltYXAnLCB1bmRlZmluZWQsIGtleW1hcC5pZCk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3RlZEtleW1hcElkID0ga2V5bWFwLmlkO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwIG9mIGtleW1hcFBpbGxzKSB7XG5cdFx0XHRcdFx0XHRwLmNsYXNzTGlzdC5yZW1vdmUoJ3NlbGVjdGVkJyk7XG5cdFx0XHRcdFx0XHRwLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHBpbGwuY2xhc3NMaXN0LmFkZCgnc2VsZWN0ZWQnKTtcblx0XHRcdFx0XHRwaWxsLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgJ3RydWUnKTtcblx0XHRcdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGxvY2FsaXplKCdvbmJvYXJkaW5nLmtleW1hcC5zZWxlY3RlZC5hbGVydCcsIFwiezB9IGtleWJvYXJkIG1hcHBpbmcgc2VsZWN0ZWRcIiwga2V5bWFwLmxhYmVsKSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGVkS2V5bWFwSW5kZXggPSBrZXltYXBPcHRpb25zLmZpbmRJbmRleChrID0+IGsuaWQgPT09IHRoaXMuc2VsZWN0ZWRLZXltYXBJZCk7XG5cdFx0XHR0aGlzLl9zZXR1cFJhZGlvR3JvdXBOYXZpZ2F0aW9uKGtleW1hcFBpbGxzLCBNYXRoLm1heCgwLCBzZWxlY3RlZEtleW1hcEluZGV4KSk7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJQZXJzb25hbGl6ZVN1YnRpdGxlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRjb25zdCBtb2RpZmllciA9IGlzTWFjaW50b3NoID8gJ0NtZCcgOiAnQ3RybCc7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChcblx0XHRcdGxvY2FsaXplKCdvbmJvYXJkaW5nLnBlcnNvbmFsaXplLnRpcC5wcmVmaXgnLCBcIlRpcDogUHJlc3MgXCIpLFxuXHRcdFx0dGhpcy5fY3JlYXRlS2JkKGxvY2FsaXplKHsga2V5OiAnb25ib2FyZGluZy5wZXJzb25hbGl6ZS50aXAubW9kaWZpZXInLCBjb21tZW50OiBbJ1RoaXMgaXMgYSBrZXlib2FyZCBtb2RpZmllciBrZXksIEN0cmwgb24gV2luZG93cy9MaW51eCBvciBDbWQgb24gTWFjJ10gfSwgXCJ7MH1cIiwgbW9kaWZpZXIpKSxcblx0XHRcdCcrJyxcblx0XHRcdHRoaXMuX2NyZWF0ZUtiZChsb2NhbGl6ZSgnb25ib2FyZGluZy5wZXJzb25hbGl6ZS50aXAuc2hpZnQnLCBcIlNoaWZ0XCIpKSxcblx0XHRcdCcrJyxcblx0XHRcdHRoaXMuX2NyZWF0ZUtiZChsb2NhbGl6ZSgnb25ib2FyZGluZy5wZXJzb25hbGl6ZS50aXAucCcsIFwiUFwiKSksXG5cdFx0XHRsb2NhbGl6ZSgnb25ib2FyZGluZy5wZXJzb25hbGl6ZS50aXAuc3VmZml4JywgXCIgdG8gYWNjZXNzIGFsbCBWUyBDb2RlIGNvbW1hbmRzLlwiKSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGhlbWVDYXJkKHBhcmVudDogSFRNTEVsZW1lbnQsIHRoZW1lOiBJT25ib2FyZGluZ1RoZW1lT3B0aW9uLCBhbGxDYXJkczogSFRNTEVsZW1lbnRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNhcmQgPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUoYXBwZW5kKHBhcmVudCwgJCgnZGl2Lm9uYm9hcmRpbmctYS10aGVtZS1jYXJkJykpKTtcblx0XHRhbGxDYXJkcy5wdXNoKGNhcmQpO1xuXHRcdGNhcmQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvJyk7XG5cdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIHRoZW1lLmlkID09PSB0aGlzLnNlbGVjdGVkVGhlbWVJZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdGNhcmQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhlbWUubGFiZWwpO1xuXG5cdFx0aWYgKHRoZW1lLmlkID09PSB0aGlzLnNlbGVjdGVkVGhlbWVJZCkge1xuXHRcdFx0Y2FyZC5jbGFzc0xpc3QuYWRkKCdzZWxlY3RlZCcpO1xuXHRcdH1cblxuXHRcdC8vIFNWRyBwcmV2aWV3IGltYWdlXG5cdFx0Y29uc3QgcHJldmlldyA9IGFwcGVuZChjYXJkLCAkKCdkaXYub25ib2FyZGluZy1hLXRoZW1lLXByZXZpZXcnKSk7XG5cdFx0Y29uc3QgaW1nID0gYXBwZW5kKHByZXZpZXcsICQ8SFRNTEltYWdlRWxlbWVudD4oJ2ltZy5vbmJvYXJkaW5nLWEtdGhlbWUtcHJldmlldy1pbWcnKSk7XG5cdFx0aW1nLmFsdCA9ICcnO1xuXHRcdGltZy5zcmMgPSBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgdnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZU9uYm9hcmRpbmcvYnJvd3Nlci9tZWRpYS90aGVtZS1wcmV2aWV3LSR7dGhlbWUuaWR9LnN2Z2ApLnRvU3RyaW5nKHRydWUpO1xuXG5cdFx0Ly8gTGFiZWxcblx0XHRjb25zdCBsYWJlbCA9IGFwcGVuZChjYXJkLCAkKCdkaXYub25ib2FyZGluZy1hLXRoZW1lLWxhYmVsJykpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gdGhlbWUubGFiZWw7XG5cblx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdzZWxlY3RUaGVtZScsIHVuZGVmaW5lZCwgdGhlbWUuaWQpO1xuXHRcdFx0dGhpcy5fc2VsZWN0VGhlbWUodGhlbWUpO1xuXHRcdFx0Zm9yIChjb25zdCBjIG9mIGFsbENhcmRzKSB7XG5cdFx0XHRcdGMuY2xhc3NMaXN0LnJlbW92ZSgnc2VsZWN0ZWQnKTtcblx0XHRcdFx0Yy5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsICdmYWxzZScpO1xuXHRcdFx0fVxuXHRcdFx0Y2FyZC5jbGFzc0xpc3QuYWRkKCdzZWxlY3RlZCcpO1xuXHRcdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsICd0cnVlJyk7XG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGxvY2FsaXplKCdvbmJvYXJkaW5nLnRoZW1lLnNlbGVjdGVkLmFsZXJ0JywgXCJ7MH0gdGhlbWUgc2VsZWN0ZWRcIiwgdGhlbWUubGFiZWwpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y2FyZC5jbGljaygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBUaGVtZSAvIEtleW1hcCBoZWxwZXJzXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbGVjdFRoZW1lKHRoZW1lOiBJT25ib2FyZGluZ1RoZW1lT3B0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZWxlY3RlZFRoZW1lSWQgPSB0aGVtZS5pZDtcblx0XHRjb25zdCBhbGxUaGVtZXMgPSBhd2FpdCB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lcygpO1xuXHRcdGNvbnN0IG1hdGNoID0gYWxsVGhlbWVzLmZpbmQodCA9PiB0LnNldHRpbmdzSWQgPT09IHRoZW1lLnRoZW1lSWQpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0dGhpcy50aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZShtYXRjaC5pZCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBseUtleW1hcChrZXltYXBJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5bWFwID0gKHByb2R1Y3Qub25ib2FyZGluZ0tleW1hcHMgPz8gW10pLmZpbmQoayA9PiBrLmlkID09PSBrZXltYXBJZCk7XG5cdFx0aWYgKCFrZXltYXA/LmV4dGVuc2lvbklkKSB7XG5cdFx0XHRyZXR1cm47IC8vIFZTIENvZGUgZGVmYXVsdCwgbm90aGluZyB0byBpbnN0YWxsXG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGdhbGxlcnkgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEV4dGVuc2lvbnMoW3sgaWQ6IGtleW1hcC5leHRlbnNpb25JZCB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoZ2FsbGVyeS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnlbMF0sIHsgY29udGV4dDogeyBbRVhURU5TSU9OX0lOU1RBTExfU0tJUF9XQUxLVEhST1VHSF9DT05URVhUXTogdHJ1ZSB9IH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnb25ib2FyZGluZy5rZXltYXAuaW5zdGFsbEVycm9yJywgXCJDb3VsZCBub3QgaW5zdGFsbCB7MH0ga2V5bWFwLiBZb3UgY2FuIGluc3RhbGwgaXQgbGF0ZXIgZnJvbSBFeHRlbnNpb25zLlwiLCBrZXltYXAubGFiZWwpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzT3RoZXJFZGl0b3JzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGtleW1hcE9wdGlvbnMgPSB0aGlzLl9kZXRlY3RlZEVkaXRvcklkc1xuXHRcdFx0PyAocHJvZHVjdC5vbmJvYXJkaW5nS2V5bWFwcyA/PyBbXSkuZmlsdGVyKGsgPT4gdGhpcy5fZGV0ZWN0ZWRFZGl0b3JJZHMhLmhhcyhrLmlkKSlcblx0XHRcdDogW107XG5cdFx0cmV0dXJuIGtleW1hcE9wdGlvbnMuc29tZShrID0+IGsuaWQgIT09ICd2c2NvZGUnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3MgY29tbW9uIGluc3RhbGwgcGF0aHMgZm9yIGtub3duIGVkaXRvcnMgYW5kIHJldHVybnMgdGhlIHNldCBvZlxuXHQgKiBrZXltYXAgb3B0aW9uIElEcyB3aG9zZSBlZGl0b3JzIGFyZSBmb3VuZCBvbiB0aGlzIG1hY2hpbmUuXG5cdCAqIEFsd2F5cyBpbmNsdWRlcyAndnNjb2RlJyAodGhlIGRlZmF1bHQpLiBJbiB3ZWIgZW52aXJvbm1lbnRzIG9yIG9uXG5cdCAqIHVua25vd24gcGxhdGZvcm1zLCByZXR1cm5zIG9ubHkgJ3ZzY29kZScuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9kZXRlY3RJbnN0YWxsZWRFZGl0b3JzKCk6IFByb21pc2U8U2V0PHN0cmluZz4+IHtcblx0XHRjb25zdCBkZXRlY3RlZCA9IG5ldyBTZXQ8c3RyaW5nPihbJ3ZzY29kZSddKTtcblx0XHRjb25zdCBob21lID0gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSh7IHByZWZlckxvY2FsOiB0cnVlIH0pO1xuXG5cdFx0aW50ZXJmYWNlIEVkaXRvckNoZWNrIHsgaWQ6IHN0cmluZzsgcGF0aHM6IFVSSVtdIH1cblx0XHRjb25zdCBjaGVja3M6IEVkaXRvckNoZWNrW10gPSBbXTtcblxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IGxvY2FsQXBwRGF0YSA9IFVSSS5qb2luUGF0aChob21lLCAnQXBwRGF0YScsICdMb2NhbCcpO1xuXHRcdFx0Y2hlY2tzLnB1c2goXG5cdFx0XHRcdHsgaWQ6ICdzdWJsaW1lJywgcGF0aHM6IFtVUkkuZmlsZSgnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxTdWJsaW1lIFRleHRcXFxcc3VibGltZV90ZXh0LmV4ZScpLCBVUkkuZmlsZSgnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxTdWJsaW1lIFRleHQgM1xcXFxzdWJsaW1lX3RleHQuZXhlJyldIH0sXG5cdFx0XHRcdHsgaWQ6ICdpbnRlbGxpaicsIHBhdGhzOiBbVVJJLmpvaW5QYXRoKGxvY2FsQXBwRGF0YSwgJ0pldEJyYWlucycsICdUb29sYm94JyldIH0sXG5cdFx0XHRcdHsgaWQ6ICd2aW0nLCBwYXRoczogW1VSSS5qb2luUGF0aChob21lLCAnX3ZpbXJjJyksIFVSSS5qb2luUGF0aChsb2NhbEFwcERhdGEsICdudmltJywgJ2luaXQudmltJyksIFVSSS5qb2luUGF0aChsb2NhbEFwcERhdGEsICdudmltJywgJ2luaXQubHVhJyldIH0sXG5cdFx0XHRcdHsgaWQ6ICdlY2xpcHNlJywgcGF0aHM6IFtVUkkuZmlsZSgnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxFY2xpcHNlXFxcXGVjbGlwc2UuZXhlJyksIFVSSS5maWxlKCdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXGVjbGlwc2VcXFxcZWNsaXBzZS5leGUnKV0gfSxcblx0XHRcdFx0eyBpZDogJ25vdGVwYWRwcCcsIHBhdGhzOiBbVVJJLmZpbGUoJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcTm90ZXBhZCsrXFxcXG5vdGVwYWQrKy5leGUnKSwgVVJJLmZpbGUoJ0M6XFxcXFByb2dyYW0gRmlsZXMgKHg4NilcXFxcTm90ZXBhZCsrXFxcXG5vdGVwYWQrKy5leGUnKV0gfSxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0Y2hlY2tzLnB1c2goXG5cdFx0XHRcdHsgaWQ6ICdzdWJsaW1lJywgcGF0aHM6IFtVUkkuZmlsZSgnL0FwcGxpY2F0aW9ucy9TdWJsaW1lIFRleHQuYXBwJyldIH0sXG5cdFx0XHRcdHsgaWQ6ICdpbnRlbGxpaicsIHBhdGhzOiBbVVJJLmZpbGUoJy9BcHBsaWNhdGlvbnMvSW50ZWxsaUogSURFQS5hcHAnKSwgVVJJLmZpbGUoJy9BcHBsaWNhdGlvbnMvSW50ZWxsaUogSURFQSBDRS5hcHAnKV0gfSxcblx0XHRcdFx0eyBpZDogJ3ZpbScsIHBhdGhzOiBbVVJJLmpvaW5QYXRoKGhvbWUsICcudmltcmMnKSwgVVJJLmpvaW5QYXRoKGhvbWUsICcuY29uZmlnJywgJ252aW0nLCAnaW5pdC52aW0nKSwgVVJJLmpvaW5QYXRoKGhvbWUsICcuY29uZmlnJywgJ252aW0nLCAnaW5pdC5sdWEnKV0gfSxcblx0XHRcdFx0eyBpZDogJ2VjbGlwc2UnLCBwYXRoczogW1VSSS5maWxlKCcvQXBwbGljYXRpb25zL0VjbGlwc2UuYXBwJyksIFVSSS5maWxlKCcvQXBwbGljYXRpb25zL0VjbGlwc2UgSURFLmFwcCcpXSB9LFxuXHRcdFx0XHR7IGlkOiAnbm90ZXBhZHBwJywgcGF0aHM6IFtVUkkuZmlsZSgnL0FwcGxpY2F0aW9ucy9Ob3RlcGFkKysuYXBwJyldIH0sXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSBpZiAoaXNMaW51eCkge1xuXHRcdFx0Y2hlY2tzLnB1c2goXG5cdFx0XHRcdHsgaWQ6ICdzdWJsaW1lJywgcGF0aHM6IFtVUkkuZmlsZSgnL3Vzci9iaW4vc3VibCcpLCBVUkkuZmlsZSgnL29wdC9zdWJsaW1lX3RleHQvc3VibGltZV90ZXh0JyldIH0sXG5cdFx0XHRcdHsgaWQ6ICdpbnRlbGxpaicsIHBhdGhzOiBbVVJJLmpvaW5QYXRoKGhvbWUsICcubG9jYWwnLCAnc2hhcmUnLCAnSmV0QnJhaW5zJywgJ1Rvb2xib3gnKSwgVVJJLmZpbGUoJy9vcHQvaWRlYScpXSB9LFxuXHRcdFx0XHR7IGlkOiAndmltJywgcGF0aHM6IFtVUkkuam9pblBhdGgoaG9tZSwgJy52aW1yYycpLCBVUkkuam9pblBhdGgoaG9tZSwgJy5jb25maWcnLCAnbnZpbScsICdpbml0LnZpbScpLCBVUkkuam9pblBhdGgoaG9tZSwgJy5jb25maWcnLCAnbnZpbScsICdpbml0Lmx1YScpXSB9LFxuXHRcdFx0XHR7IGlkOiAnZWNsaXBzZScsIHBhdGhzOiBbVVJJLmZpbGUoJy91c3IvYmluL2VjbGlwc2UnKSwgVVJJLmZpbGUoJy9vcHQvZWNsaXBzZS9lY2xpcHNlJyksIFVSSS5qb2luUGF0aChob21lLCAnZWNsaXBzZScsICdlY2xpcHNlJyldIH0sXG5cdFx0XHRcdHsgaWQ6ICdub3RlcGFkcHAnLCBwYXRoczogW1VSSS5maWxlKCcvdXNyL2Jpbi9ub3RlcGFkcXEnKSwgVVJJLmZpbGUoJy9zbmFwL25vdGVwYWQtcGx1cy1wbHVzL2N1cnJlbnQnKV0gfSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoY2hlY2tzLm1hcChhc3luYyBjaGVjayA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHBhdGggb2YgY2hlY2sucGF0aHMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocGF0aCkpIHtcblx0XHRcdFx0XHRcdGRldGVjdGVkLmFkZChjaGVjay5pZCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBQYXRoIG5vdCBhY2Nlc3NpYmxlIFx1MjAxNCBza2lwXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGV0ZWN0ZWQ7XG5cdH1cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gU3RlcDogQUkgUHJlZmVyZW5jZVxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRwcml2YXRlIF9yZW5kZXJBaVByZWZlcmVuY2VTdGVwKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9uYm9hcmRpbmctYS1haS1wcmVmJykpO1xuXG5cdFx0Y29uc3QgY2FyZHMgPSBhcHBlbmQod3JhcHBlciwgJCgnLm9uYm9hcmRpbmctYS1haS1wcmVmLWNhcmRzJykpO1xuXHRcdGNhcmRzLnNldEF0dHJpYnV0ZSgncm9sZScsICdyYWRpb2dyb3VwJyk7XG5cdFx0Y2FyZHMuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ29uYm9hcmRpbmcuYWlQcmVmLmxhYmVsJywgXCJDaG9vc2UgeW91ciBBSSBjb2xsYWJvcmF0aW9uIHN0eWxlXCIpKTtcblxuXHRcdGNvbnN0IGFsbENhcmRzOiBIVE1MQnV0dG9uRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBvcHRpb24gb2YgT05CT0FSRElOR19BSV9QUkVGRVJFTkNFX09QVElPTlMpIHtcblx0XHRcdGNvbnN0IGNhcmQgPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUoYXBwZW5kKGNhcmRzLCAkPEhUTUxCdXR0b25FbGVtZW50PignYnV0dG9uLm9uYm9hcmRpbmctYS1haS1wcmVmLWNhcmQnKSkpO1xuXHRcdFx0Y2FyZC50eXBlID0gJ2J1dHRvbic7XG5cdFx0XHRjYXJkLmRhdGFzZXQuaWQgPSBvcHRpb24uaWQ7XG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdyYWRpbycpO1xuXHRcdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIG9wdGlvbi5pZCA9PT0gdGhpcy5zZWxlY3RlZEFpTW9kZSA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdFx0YWxsQ2FyZHMucHVzaChjYXJkKTtcblxuXHRcdFx0aWYgKG9wdGlvbi5pZCA9PT0gdGhpcy5zZWxlY3RlZEFpTW9kZSkge1xuXHRcdFx0XHRjYXJkLmNsYXNzTGlzdC5hZGQoJ3NlbGVjdGVkJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGljb25FbCA9IGFwcGVuZChjYXJkLCAkKCdzcGFuLm9uYm9hcmRpbmctYS1haS1wcmVmLWNhcmQtaWNvbicpKTtcblx0XHRcdGljb25FbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdGNvbnN0IGljb24gPSBDb2RpY29uW29wdGlvbi5pY29uIGFzIGtleW9mIHR5cGVvZiBDb2RpY29uXSA/PyBDb2RpY29uLnNwYXJrbGU7XG5cdFx0XHRpY29uRWwuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihpY29uKSk7XG5cblx0XHRcdGNvbnN0IHRpdGxlRWwgPSBhcHBlbmQoY2FyZCwgJCgnZGl2Lm9uYm9hcmRpbmctYS1haS1wcmVmLWNhcmQtdGl0bGUnKSk7XG5cdFx0XHR0aXRsZUVsLnRleHRDb250ZW50ID0gb3B0aW9uLmxhYmVsO1xuXG5cdFx0XHRjb25zdCBkZXNjRWwgPSBhcHBlbmQoY2FyZCwgJCgnZGl2Lm9uYm9hcmRpbmctYS1haS1wcmVmLWNhcmQtZGVzYycpKTtcblx0XHRcdGRlc2NFbC50ZXh0Q29udGVudCA9IG9wdGlvbi5kZXNjcmlwdGlvbjtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nQWN0aW9uKCdzZWxlY3RBaU1vZGUnLCB1bmRlZmluZWQsIG9wdGlvbi5pZCk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWRBaU1vZGUgPSBvcHRpb24uaWQ7XG5cdFx0XHRcdGZvciAoY29uc3QgYyBvZiBhbGxDYXJkcykge1xuXHRcdFx0XHRcdGMuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBjLmRhdGFzZXQuaWQgPT09IG9wdGlvbi5pZCk7XG5cdFx0XHRcdFx0Yy5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIGMuZGF0YXNldC5pZCA9PT0gb3B0aW9uLmlkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYXBwbHlBaVByZWZlcmVuY2Uob3B0aW9uLmlkKTtcblx0XHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5hbGVydChsb2NhbGl6ZSgnb25ib2FyZGluZy5haVByZWYuc2VsZWN0ZWQuYWxlcnQnLCBcInswfSBzZWxlY3RlZFwiLCBvcHRpb24ubGFiZWwpKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBaUluZGV4ID0gT05CT0FSRElOR19BSV9QUkVGRVJFTkNFX09QVElPTlMuZmluZEluZGV4KG8gPT4gby5pZCA9PT0gdGhpcy5zZWxlY3RlZEFpTW9kZSk7XG5cdFx0dGhpcy5fc2V0dXBSYWRpb0dyb3VwTmF2aWdhdGlvbihhbGxDYXJkcywgTWF0aC5tYXgoMCwgc2VsZWN0ZWRBaUluZGV4KSk7XG5cblx0XHRjb25zdCBoaW50ID0gYXBwZW5kKHdyYXBwZXIsICQoJ2Rpdi5vbmJvYXJkaW5nLWEtYWktcHJlZi1oaW50JykpO1xuXHRcdGhpbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5haVByZWYuaGludCcsIFwiWW91IGNhbiBjaGFuZ2UgdGhpcyBhbnl0aW1lIGluIFNldHRpbmdzLlwiKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5QWlQcmVmZXJlbmNlKG1vZGU6IEFpQ29sbGFib3JhdGlvbk1vZGUpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKG1vZGUpIHtcblx0XHRcdGNhc2UgQWlDb2xsYWJvcmF0aW9uTW9kZS5Db2RlRmlyc3Q6XG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2NoYXQuYWdlbnQuYXV0b0ZpeCcsIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWlDb2xsYWJvcmF0aW9uTW9kZS5CYWxhbmNlZDpcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnY2hhdC5hZ2VudC5hdXRvRml4JywgdHJ1ZSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFpQ29sbGFib3JhdGlvbk1vZGUuQWdlbnRGb3J3YXJkOlxuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdjaGF0LmFnZW50LmF1dG9GaXgnLCB0cnVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gU3RlcDogQWdlbnQgU2Vzc2lvbnNcblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cblx0cHJpdmF0ZSBfcmVuZGVyQWdlbnRTZXNzaW9uc1N1YnRpdGxlKGVsOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZShlbCk7XG5cdFx0Y29uc3Qga2V5cyA9IGlzTWFjaW50b3NoXG5cdFx0XHQ/IFsnXFx1MjMxOCcsICdcXHUyMzAzJywgJ0knXSAgLy8gQ21kK0NvbnRyb2wrSVxuXHRcdFx0OiBbJ0N0cmwnLCAnQWx0JywgJ0knXTtcblx0XHRjb25zdCBzaG9ydGN1dCA9IGtleXMubWFwKGsgPT4gdGhpcy5fY3JlYXRlS2JkKGspKTtcblx0XHRlbC5hcHBlbmQobG9jYWxpemUoJ29uYm9hcmRpbmcuc3RlcC5hZ2VudFNlc3Npb25zLnN1YnRpdGxlLmJlZm9yZScsIFwiT3BlbiBDaGF0IGFueXRpbWUgd2l0aCBcIikpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2hvcnRjdXQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpID4gMCkge1xuXHRcdFx0XHRlbC5hcHBlbmQoJysnKTtcblx0XHRcdH1cblx0XHRcdGVsLmFwcGVuZChzaG9ydGN1dFtpXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQWdlbnRTZXNzaW9uc1N0ZXAoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcub25ib2FyZGluZy1hLXNlc3Npb25zJykpO1xuXG5cdFx0Y29uc3QgZmVhdHVyZXMgPSBhcHBlbmQod3JhcHBlciwgJCgnLm9uYm9hcmRpbmctYS1zZXNzaW9ucy1mZWF0dXJlcycpKTtcblxuXHRcdC8vIEdyb3VwIDE6IENoYXQgbW9kZXMgXHUyMDE0IFBsYW4gLyBBZ2VudFxuXHRcdGNvbnN0IGNoYXRHcm91cCA9IGFwcGVuZChmZWF0dXJlcywgJCgnLm9uYm9hcmRpbmctYS1zZXNzaW9ucy1ncm91cCcpKTtcblx0XHRjb25zdCBjaGF0TGFiZWwgPSBhcHBlbmQoY2hhdEdyb3VwLCAkKCdkaXYub25ib2FyZGluZy1hLXNlc3Npb25zLWdyb3VwLWxhYmVsJykpO1xuXHRcdGNoYXRMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdvbmJvYXJkaW5nLnNlc3Npb25zLmdyb3VwLmNoYXQnLCBcIkFnZW50cyBtYWRlIGZvciB0aGUgdGFza1wiKTtcblx0XHRjb25zdCBjaGF0R3JpZCA9IGFwcGVuZChjaGF0R3JvdXAsICQoJy5vbmJvYXJkaW5nLWEtc2Vzc2lvbnMtZ3JpZC5vbmJvYXJkaW5nLWEtc2Vzc2lvbnMtZ3JpZC0yJykpO1xuXG5cdFx0dGhpcy5fY3JlYXRlRmVhdHVyZUNhcmQoY2hhdEdyaWQsIENvZGljb24ubGlzdE9yZGVyZWQsXG5cdFx0XHRsb2NhbGl6ZSgnb25ib2FyZGluZy5zZXNzaW9ucy5wbGFuTW9kZScsIFwiUGxhblwiKSxcblx0XHRcdGxvY2FsaXplKCdvbmJvYXJkaW5nLnNlc3Npb25zLnBsYW5Nb2RlLmRlc2MnLCBcIlByb2R1Y2UgYSBzdHJ1Y3R1cmVkIGltcGxlbWVudGF0aW9uIHBsYW4gYmVmb3JlIGFueSBjb2RlIGNoYW5nZXMsIHRoZW4gaGFuZCBpdCBvZmYgdG8gYW4gYWdlbnQgdG8gZXhlY3V0ZS5cIikpO1xuXG5cdFx0dGhpcy5fY3JlYXRlRmVhdHVyZUNhcmQoY2hhdEdyaWQsIENvZGljb24uY29tbWVudERpc2N1c3Npb24sXG5cdFx0XHRsb2NhbGl6ZSgnb25ib2FyZGluZy5zZXNzaW9ucy5hZ2VudE1vZGUnLCBcIkFnZW50XCIpLFxuXHRcdFx0bG9jYWxpemUoJ29uYm9hcmRpbmcuc2Vzc2lvbnMuYWdlbnRNb2RlLmRlc2MnLCBcIkRlc2NyaWJlIGEgZ29hbC4gVGhlIGFnZW50IHBsYW5zIHRoZSBhcHByb2FjaCwgZWRpdHMgZmlsZXMsIHJ1bnMgY29tbWFuZHMsIGFuZCBzZWxmLWNvcnJlY3RzLiBZb3UgcmV2aWV3IGFuZCBhcHByb3ZlIGFsb25nIHRoZSB3YXkuXCIpKTtcblxuXHRcdC8vIEdyb3VwIDI6IHdheXMgdG8gcnVuIGFuZCBjdXN0b21pemUgYWdlbnRzIGJleW9uZCB0aGUgZGVmYXVsdCBDaGF0IGV4cGVyaWVuY2Vcblx0XHRjb25zdCBtb3JlR3JvdXAgPSBhcHBlbmQoZmVhdHVyZXMsICQoJy5vbmJvYXJkaW5nLWEtc2Vzc2lvbnMtZ3JvdXAnKSk7XG5cdFx0Y29uc3QgbW9yZUxhYmVsID0gYXBwZW5kKG1vcmVHcm91cCwgJCgnZGl2Lm9uYm9hcmRpbmctYS1zZXNzaW9ucy1ncm91cC1sYWJlbCcpKTtcblx0XHRtb3JlTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb25ib2FyZGluZy5zZXNzaW9ucy5ncm91cC5tb3JlJywgXCJBZ2VudHMgdGhhdCB3b3JrIHlvdXIgd2F5XCIpO1xuXHRcdGNvbnN0IG1vcmVHcmlkID0gYXBwZW5kKG1vcmVHcm91cCwgJCgnLm9uYm9hcmRpbmctYS1zZXNzaW9ucy1ncmlkLm9uYm9hcmRpbmctYS1zZXNzaW9ucy1ncmlkLTInKSk7XG5cblx0XHR0aGlzLl9jcmVhdGVGZWF0dXJlQ2FyZChtb3JlR3JpZCwgQ29kaWNvbi5yb2NrZXQsXG5cdFx0XHRsb2NhbGl6ZSgnb25ib2FyZGluZy5zZXNzaW9ucy5ydW5Bbnl3aGVyZScsIFwiUnVuIEFnZW50cyBBbnl3aGVyZVwiKSxcblx0XHRcdGxvY2FsaXplKCdvbmJvYXJkaW5nLnNlc3Npb25zLnJ1bkFueXdoZXJlLmRlc2MnLCBcIlJ1biBhZ2VudHMgbG9jYWxseSBmb3IgaW50ZXJhY3RpdmUgd29yaywgaW4gdGhlIGJhY2tncm91bmQgd2l0aCBDb3BpbG90IENMSSwgb3IgaW4gdGhlIGNsb3VkIHdpdGggY2xvdWQgYWdlbnRzIHRoYXQgb3BlbiBhIHB1bGwgcmVxdWVzdCB5b3VyIHRlYW0gY2FuIHJldmlldy5cIikpO1xuXG5cdFx0dGhpcy5fY3JlYXRlRmVhdHVyZUNhcmQobW9yZUdyaWQsIENvZGljb24uc2V0dGluZ3NHZWFyLFxuXHRcdFx0bG9jYWxpemUoJ29uYm9hcmRpbmcuc2Vzc2lvbnMuY3VzdG9taXplJywgXCJDdXN0b21pemUgWW91ciBBZ2VudHNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnb25ib2FyZGluZy5zZXNzaW9ucy5jdXN0b21pemUuZGVzYycsIFwiVGFpbG9yIENvcGlsb3QgdG8geW91ciBwcm9qZWN0IHdpdGggY3VzdG9tIGluc3RydWN0aW9ucyBhbmQgYWdlbnRzLCBza2lsbHMsIHJldXNhYmxlIHByb21wdHMsIGFuZCBNQ1Agc2VydmVycyB0aGF0IGNvbm5lY3QgdG8gdGhlIHRvb2xzIGFuZCBjb250ZXh0IHlvdSByZWx5IG9uLlwiKSk7XG5cblx0XHQvLyBUdXRvcmlhbCBsaW5rIGF0IGJvdHRvbSBvZiBjb250ZW50LCBhYm92ZSBmb290ZXJcblx0XHRjb25zdCBkb2NzUm93ID0gYXBwZW5kKHdyYXBwZXIsICQoJy5vbmJvYXJkaW5nLWEtc2Vzc2lvbnMtZG9jcycpKTtcblx0XHR0aGlzLl9jcmVhdGVEb2NMaW5rKGRvY3NSb3csIGxvY2FsaXplKCdvbmJvYXJkaW5nLnNlc3Npb25zLmFnZW50c1R1dG9yaWFsJywgXCJBZ2VudHMgdHV0b3JpYWxcIiksICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2NvcGlsb3QvYWdlbnRzL2FnZW50cy10dXRvcmlhbCcsICdhZ2VudHNUdXRvcmlhbCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRmVhdHVyZUNhcmQocGFyZW50OiBIVE1MRWxlbWVudCwgaWNvbjogVGhlbWVJY29uLCB0aXRsZTogc3RyaW5nLCBkZXNjcmlwdGlvbj86IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjYXJkID0gYXBwZW5kKHBhcmVudCwgJCgnZGl2Lm9uYm9hcmRpbmctYS1mZWF0dXJlLWNhcmQnKSk7XG5cdFx0Y29uc3QgaWNvbkNvbCA9IGFwcGVuZChjYXJkLCAkKCdkaXYub25ib2FyZGluZy1hLWZlYXR1cmUtaWNvbicpKTtcblx0XHRpY29uQ29sLmFwcGVuZENoaWxkKHJlbmRlckljb24oaWNvbikpO1xuXHRcdGNvbnN0IHRleHRDb2wgPSBhcHBlbmQoY2FyZCwgJCgnZGl2Lm9uYm9hcmRpbmctYS1mZWF0dXJlLXRleHQnKSk7XG5cdFx0Y29uc3QgdGl0bGVFbCA9IGFwcGVuZCh0ZXh0Q29sLCAkKCdkaXYub25ib2FyZGluZy1hLWZlYXR1cmUtdGl0bGUnKSk7XG5cdFx0dGl0bGVFbC50ZXh0Q29udGVudCA9IHRpdGxlO1xuXHRcdGNvbnN0IGRlc2NFbCA9IGFwcGVuZCh0ZXh0Q29sLCAkKCdkaXYub25ib2FyZGluZy1hLWZlYXR1cmUtZGVzYycpKTtcblx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdGRlc2NFbC50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVzY0VsO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlS2JkKGxhYmVsOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3Qga2JkID0gJCgna2JkLm9uYm9hcmRpbmctYS1rYmQnKTtcblx0XHRrYmQudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRyZXR1cm4ga2JkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRG9jTGluayhwYXJlbnQ6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBocmVmOiBzdHJpbmcsIGxpbmtJZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGxpbmsgPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUoYXBwZW5kKHBhcmVudCwgJDxIVE1MQW5jaG9yRWxlbWVudD4oJ2Eub25ib2FyZGluZy1hLWRvYy1saW5rJykpKTtcblx0XHRsaW5rLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0bGluay5ocmVmID0gaHJlZjtcblx0XHRsaW5rLnRhcmdldCA9ICdfYmxhbmsnO1xuXHRcdGxpbmsucmVsID0gJ25vb3BlbmVyJztcblx0XHRsaW5rLnByZXBlbmQocmVuZGVySWNvbihDb2RpY29uLmxpbmtFeHRlcm5hbCkpO1xuXHRcdGlmIChsaW5rSWQpIHtcblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIobGluaywgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ0FjdGlvbignZG9jTGlua0NsaWNrJywgdW5kZWZpbmVkLCBsaW5rSWQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUlubGluZUxpbmsocGFyZW50OiBIVE1MRWxlbWVudCwgbGFiZWw6IHN0cmluZywgaHJlZjogc3RyaW5nKTogSFRNTEFuY2hvckVsZW1lbnQge1xuXHRcdGNvbnN0IGxpbmsgPSB0aGlzLl9yZWdpc3RlclN0ZXBGb2N1c2FibGUoYXBwZW5kKHBhcmVudCwgJDxIVE1MQW5jaG9yRWxlbWVudD4oJ2Eub25ib2FyZGluZy1hLWlubGluZS1saW5rJykpKTtcblx0XHRsaW5rLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0bGluay5ocmVmID0gaHJlZjtcblx0XHRsaW5rLnRhcmdldCA9ICdfYmxhbmsnO1xuXHRcdGxpbmsucmVsID0gJ25vb3BlbmVyJztcblx0XHRyZXR1cm4gbGluaztcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBSYWRpby1ncm91cCBrZXlib2FyZCBuYXZpZ2F0aW9uIChyb3ZpbmcgdGFiaW5kZXgpXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdC8qKlxuXHQgKiBTZXRzIHVwIFdBSS1BUklBIHJhZGlvLWdyb3VwIGtleWJvYXJkIG5hdmlnYXRpb24gb24gYSBzZXQgb2YgZWxlbWVudHM6XG5cdCAqIC0gQXJyb3cga2V5cyBtb3ZlIGZvY3VzIGJldHdlZW4gaXRlbXMgKHdpdGggd3JhcC1hcm91bmQpXG5cdCAqIC0gT25seSB0aGUgZm9jdXNlZCBpdGVtIGhhcyB0YWJpbmRleD0wOyB0aGUgcmVzdCBoYXZlIHRhYmluZGV4PS0xXG5cdCAqIC0gU3BhY2UvRW50ZXIgb24gYSBmb2N1c2VkIGl0ZW0gZmlyZXMgaXRzIGNsaWNrIGhhbmRsZXJcblx0ICovXG5cdHByaXZhdGUgX3NldHVwUmFkaW9Hcm91cE5hdmlnYXRpb24oaXRlbXM6IEhUTUxFbGVtZW50W10sIHNlbGVjdGVkSW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIEluaXRpYWxpc2Ugcm92aW5nIHRhYmluZGV4OiBvbmx5IHRoZSBzZWxlY3RlZCBpdGVtIGlzIHRhYi1yZWFjaGFibGVcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpdGVtc1tpXS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgaSA9PT0gc2VsZWN0ZWRJbmRleCA/ICcwJyA6ICctMScpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbXNbaV0sIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRsZXQgbmV3SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5SaWdodEFycm93IHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93KSB7XG5cdFx0XHRcdFx0bmV3SW5kZXggPSAoaSArIDEpICUgaXRlbXMubGVuZ3RoO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93IHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdykge1xuXHRcdFx0XHRcdG5ld0luZGV4ID0gKGkgLSAxICsgaXRlbXMubGVuZ3RoKSAlIGl0ZW1zLmxlbmd0aDtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkhvbWUpIHtcblx0XHRcdFx0XHRuZXdJbmRleCA9IDA7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbmQpIHtcblx0XHRcdFx0XHRuZXdJbmRleCA9IGl0ZW1zLmxlbmd0aCAtIDE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobmV3SW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdGl0ZW1zW2ldLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnLTEnKTtcblx0XHRcdFx0XHRpdGVtc1tuZXdJbmRleF0uc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRcdFx0aXRlbXNbbmV3SW5kZXhdLmZvY3VzKCk7XG5cdFx0XHRcdFx0aXRlbXNbbmV3SW5kZXhdLmNsaWNrKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblx0Ly8gRm9jdXMgdHJhcFxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRwcml2YXRlIF90cmFwVGFiKGU6IEtleWJvYXJkRXZlbnQsIHNoaWZ0S2V5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxGb2N1c2FibGUgPSB0aGlzLl9nZXRGb2N1c2FibGVFbGVtZW50cygpO1xuXG5cdFx0aWYgKGFsbEZvY3VzYWJsZS5sZW5ndGggPT09IDApIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdCA9IGFsbEZvY3VzYWJsZVswXTtcblx0XHRjb25zdCBsYXN0ID0gYWxsRm9jdXNhYmxlW2FsbEZvY3VzYWJsZS5sZW5ndGggLSAxXTtcblxuXHRcdGlmIChzaGlmdEtleSAmJiBnZXRBY3RpdmVXaW5kb3coKS5kb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBmaXJzdCkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0bGFzdC5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAoIXNoaWZ0S2V5ICYmIGdldEFjdGl2ZVdpbmRvdygpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGxhc3QpIHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGZpcnN0LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Rm9jdXNhYmxlRWxlbWVudHMoKTogSFRNTEVsZW1lbnRbXSB7XG5cdFx0cmV0dXJuIFsuLi4odGhpcy5jbG9zZUJ1dHRvbiA/IFt0aGlzLmNsb3NlQnV0dG9uXSA6IFtdKSwgLi4udGhpcy5zdGVwRm9jdXNhYmxlRWxlbWVudHMsIC4uLnRoaXMuZm9vdGVyRm9jdXNhYmxlRWxlbWVudHNdLmZpbHRlcihlbGVtZW50ID0+IHRoaXMuX2lzVGFiYmFibGUoZWxlbWVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNDdXJyZW50U3RlcEVsZW1lbnQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RlcEZvY3VzYWJsZSA9IHRoaXMuc3RlcEZvY3VzYWJsZUVsZW1lbnRzLmZpbmQoZWxlbWVudCA9PiB0aGlzLl9pc1RhYmJhYmxlKGVsZW1lbnQpKTtcblx0XHQoc3RlcEZvY3VzYWJsZSA/PyB0aGlzLm5leHRCdXR0b24gPz8gdGhpcy5jbG9zZUJ1dHRvbik/LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclN0ZXBGb2N1c2FibGU8VCBleHRlbmRzIEhUTUxFbGVtZW50PihlbGVtZW50OiBUKTogVCB7XG5cdFx0dGhpcy5zdGVwRm9jdXNhYmxlRWxlbWVudHMucHVzaChlbGVtZW50KTtcblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgX2lzVGFiYmFibGUoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIWVsZW1lbnQuaXNDb25uZWN0ZWQgfHwgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJykgPT09ICd0cnVlJyB8fCBlbGVtZW50LnRhYkluZGV4ID09PSAtMSB8fCBlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnZGlzYWJsZWQnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBnZXRBY3RpdmVXaW5kb3coKS5nZXRDb21wdXRlZFN0eWxlKGVsZW1lbnQpO1xuXHRcdHJldHVybiBjb21wdXRlZFN0eWxlLmRpc3BsYXkgIT09ICdub25lJyAmJiBjb21wdXRlZFN0eWxlLnZpc2liaWxpdHkgIT09ICdoaWRkZW4nO1xuXHR9XG5cblx0Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cdC8vIFRlbGVtZXRyeVxuXHQvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuXHRwcml2YXRlIF9sb2dTdGVwVmlldygpOiB2b2lkIHtcblx0XHRjb25zdCBzdGVwSWQgPSB0aGlzLnN0ZXBzW3RoaXMuY3VycmVudFN0ZXBJbmRleF07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8T25ib2FyZGluZ1N0ZXBWaWV3RXZlbnQsIE9uYm9hcmRpbmdTdGVwVmlld0NsYXNzaWZpY2F0aW9uPignd2VsY29tZU9uYm9hcmRpbmcuc3RlcFZpZXcnLCB7XG5cdFx0XHRzdGVwOiBzdGVwSWQsXG5cdFx0XHRzdGVwTnVtYmVyOiB0aGlzLmN1cnJlbnRTdGVwSW5kZXggKyAxLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nQWN0aW9uKGFjdGlvbjogc3RyaW5nLCBzdGVwT3ZlcnJpZGU/OiBPbmJvYXJkaW5nU3RlcElkLCBhcmd1bWVudD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPE9uYm9hcmRpbmdBY3Rpb25FdmVudCwgT25ib2FyZGluZ0FjdGlvbkNsYXNzaWZpY2F0aW9uPignd2VsY29tZU9uYm9hcmRpbmcuYWN0aW9uRXhlY3V0ZWQnLCB7XG5cdFx0XHRhY3Rpb24sXG5cdFx0XHRzdGVwOiBzdGVwT3ZlcnJpZGUgPz8gdGhpcy5zdGVwc1t0aGlzLmN1cnJlbnRTdGVwSW5kZXhdLFxuXHRcdFx0YXJndW1lbnQ6IGFyZ3VtZW50ID8/IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fVxuXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXHQvLyBDbGVhbnVwXG5cdC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5cdHByaXZhdGUgX3JlbW92ZUZyb21ET00oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3ZlcmxheSkge1xuXHRcdFx0dGhpcy5vdmVybGF5LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5vdmVybGF5ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FyZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmJvZHlFbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnByb2dyZXNzQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc3RlcExhYmVsRWwgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50aXRsZUVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc3VidGl0bGVFbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbnRlbnRFbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmJhY2tCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5uZXh0QnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY2xvc2VCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5mb290ZXJMZWZ0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2Zvb3RlclNpZ25JbkJ0biA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmZvb3RlckZvY3VzYWJsZUVsZW1lbnRzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5zdGVwRm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoID0gMDtcblx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5VaVN0YXRlID0gJ29wdGlvbnMnO1xuXHRcdHRoaXMuZW50ZXJwcmlzZUluc3RhbmNlVmFsdWUgPSAnJztcblx0XHR0aGlzLmVudGVycHJpc2VTaWduSW5XYXRjaCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pc1Nob3dpbmcgPSBmYWxzZTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLnByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCkge1xuXHRcdFx0dGhpcy5wcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWRFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudFN0ZXBJbmRleCA9IDA7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW92ZUZyb21ET00oKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsR0FBRyxRQUFRLHVCQUF1QixXQUFXLFdBQVcsdUJBQXVCO0FBQ3hGLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLFdBQVcsYUFBYSxlQUFlO0FBQ2hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNENBQTRDLDBCQUEwQixtQ0FBbUM7QUFDbEgsU0FBUyxhQUFhLDhCQUE4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ZTtBQUFBLEVBQ3pFO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxlQUFxQjtBQUM1QixVQUFNLFNBQVMsS0FBSyxNQUFNLEtBQUssZ0JBQWdCO0FBQy9DLFNBQUssaUJBQWlCLFdBQXNFLDhCQUE4QjtBQUFBLE1BQ3pILE1BQU07QUFBQSxNQUNOLFlBQVksS0FBSyxtQkFBbUI7QUFBQSxJQUNyQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsV0FBVyxRQUFnQixjQUFpQyxVQUF5QjtBQUM1RixTQUFLLGlCQUFpQixXQUFrRSxvQ0FBb0M7QUFBQSxNQUMzSDtBQUFBLE1BQ0EsTUFBTSxnQkFBZ0IsS0FBSyxNQUFNLEtBQUssZ0JBQWdCO0FBQUEsTUFDdEQsVUFBVSxZQUFZO0FBQUEsSUFDdkIsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLGlCQUF1QjtBQUM5QixRQUFJLEtBQUssU0FBUztBQUNqQixXQUFLLFFBQVEsT0FBTztBQUNwQixXQUFLLFVBQVU7QUFBQSxJQUNoQjtBQUVBLFNBQUssT0FBTztBQUNaLFNBQUssU0FBUztBQUNkLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssY0FBYztBQUNuQixTQUFLLFVBQVU7QUFDZixTQUFLLGFBQWE7QUFDbEIsU0FBSyxZQUFZO0FBQ2pCLFNBQUssYUFBYTtBQUNsQixTQUFLLGFBQWE7QUFDbEIsU0FBSyxjQUFjO0FBQ25CLFNBQUssYUFBYTtBQUNsQixTQUFLLG1CQUFtQjtBQUN4QixTQUFLLHdCQUF3QixTQUFTO0FBQ3RDLFNBQUssc0JBQXNCLFNBQVM7QUFDcEMsU0FBSywwQkFBMEI7QUFDL0IsU0FBSywwQkFBMEI7QUFDL0IsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSyxhQUFhO0FBQ2xCLFNBQUssWUFBWSxNQUFNO0FBQ3ZCLFNBQUssZ0JBQWdCLE1BQU07QUFFM0IsUUFBSSxLQUFLLDBCQUEwQjtBQUNsQyxXQUFLLHlCQUF5QixNQUFNO0FBQ3BDLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFFQSxTQUFLLG1CQUFtQjtBQUFBLEVBQ3pCO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLGVBQWU7QUFDcEIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBdnZDYSxxQkF3ZFksMkJBQTJCO0FBeGR2Qyx1QkFBTjtBQUFBLEVBMkNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXREVTsiLAogICJuYW1lcyI6IFtdCn0K
