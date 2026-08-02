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
import { $, addDisposableListener, append, clearNode, reset } from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { coalesce, equals } from "../../../../base/common/arrays.js";
import { Delayer, Throttler } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { splitRecentLabel } from "../../../../base/common/labels.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { parse } from "../../../../base/common/marshalling.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { OS } from "../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import "./media/gettingStarted.css";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
import { firstSessionDateStorageKey, ITelemetryService, TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { getTelemetryLevel } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { defaultButtonStyles, defaultKeybindingLabelStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspacesService, isRecentFolder, isRecentWorkspace } from "../../../../platform/workspaces/common/workspaces.js";
import { OpenRecentAction } from "../../../browser/actions/windowActions.js";
import { OpenFileFolderAction, OpenFolderAction, OpenFolderViaWorkspaceAction } from "../../../browser/actions/workspaceActions.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { WorkbenchStateContext } from "../../../common/contextkeys.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import "./gettingStartedColors.js";
import { GettingStartedDetailsRenderer } from "./gettingStartedDetailsRenderer.js";
import { gettingStartedCheckedCodicon, gettingStartedUncheckedCodicon } from "./gettingStartedIcons.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
import { IWalkthroughsService, hiddenEntriesConfigurationKey, parseDescription } from "./gettingStartedService.js";
import { restoreWalkthroughsConfigurationKey } from "./startupPage.js";
import { startEntries } from "../common/gettingStartedContent.js";
import { GroupsOrder, IEditorGroupsService, preferredSideBySideGroupDirection } from "../../../services/editor/common/editorGroupsService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { GettingStartedIndexList } from "./gettingStartedList.js";
import { canShowAgentsBanner, createAgentsBanner } from "../../chat/browser/agentSessions/agentSessionsBanner.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibleViewAction } from "../../accessibility/browser/accessibleViewActions.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
const SLIDE_TRANSITION_TIME_MS = 250;
const configurationKey = "workbench.startupEditor";
const allWalkthroughsHiddenContext = new RawContextKey("allWalkthroughsHidden", false);
const inWelcomeContext = new RawContextKey("inWelcome", false);
const parsedStartEntries = startEntries.map((e, i) => ({
  command: e.content.command,
  description: e.description,
  icon: { type: "icon", icon: e.icon },
  id: e.id,
  order: i,
  title: e.title,
  when: ContextKeyExpr.deserialize(e.when) ?? ContextKeyExpr.true()
}));
const REDUCED_MOTION_KEY = "workbench.welcomePage.preferReducedMotion";
let GettingStartedPage = class extends EditorPane {
  constructor(group, commandService, productService, keybindingService, gettingStartedService, configurationService, telemetryService, languageService, fileService, openerService, themeService, storageService, extensionService, instantiationService, notificationService, groupsService, contextService, quickInputService, workspacesService, labelService, hostService, webviewService, workspaceContextService, accessibilityService, markdownRendererService, chatEntitlementService) {
    super(GettingStartedPage.ID, group, telemetryService, themeService, storageService);
    this.commandService = commandService;
    this.productService = productService;
    this.keybindingService = keybindingService;
    this.gettingStartedService = gettingStartedService;
    this.configurationService = configurationService;
    this.languageService = languageService;
    this.fileService = fileService;
    this.openerService = openerService;
    this.themeService = themeService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.instantiationService = instantiationService;
    this.notificationService = notificationService;
    this.groupsService = groupsService;
    this.quickInputService = quickInputService;
    this.workspacesService = workspacesService;
    this.labelService = labelService;
    this.hostService = hostService;
    this.webviewService = webviewService;
    this.workspaceContextService = workspaceContextService;
    this.accessibilityService = accessibilityService;
    this.markdownRendererService = markdownRendererService;
    this.chatEntitlementService = chatEntitlementService;
    this.inProgressScroll = Promise.resolve();
    this.dispatchListeners = new DisposableStore();
    this.stepDisposables = new DisposableStore();
    this.detailsPageDisposables = new DisposableStore();
    this.mediaDisposables = new DisposableStore();
    this.detailsScrollbar = this._register(new MutableDisposable());
    this.buildSlideThrottle = this._register(new Throttler());
    this.recentlyOpenedList = this._register(new MutableDisposable());
    this.startList = this._register(new MutableDisposable());
    this.gettingStartedList = this._register(new MutableDisposable());
    this.showFeaturedWalkthrough = true;
    this.currentMediaComponent = void 0;
    this.currentMediaType = void 0;
    this.container = $(
      ".gettingStartedContainer",
      {
        role: "document",
        tabindex: 0,
        "aria-label": localize("welcomeAriaLabel", "Overview of how to get up to speed with your editor.")
      }
    );
    this.stepMediaComponent = $(".getting-started-media");
    this.stepMediaComponent.id = generateUuid();
    this.categoriesSlideDisposables = this._register(new DisposableStore());
    this.detailsRenderer = new GettingStartedDetailsRenderer(this.fileService, this.notificationService, this.extensionService, this.languageService);
    this.contextService = this._register(contextService.createScoped(this.container));
    inWelcomeContext.bindTo(this.contextService).set(true);
    this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
    this._register(this.dispatchListeners);
    const rerender = () => {
      this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
      if (this.currentWalkthrough) {
        const existingSteps = this.currentWalkthrough.steps.map((step) => step.id);
        const newCategory = this.gettingStartedCategories.find((category) => this.currentWalkthrough?.id === category.id);
        if (newCategory) {
          const newSteps = newCategory.steps.map((step) => step.id);
          if (!equals(newSteps, existingSteps)) {
            this.buildSlideThrottle.queue(() => this.buildCategoriesSlide());
          }
        }
      } else {
        this.buildSlideThrottle.queue(() => this.buildCategoriesSlide());
      }
    };
    this._register(this.gettingStartedService.onDidAddWalkthrough(rerender));
    this._register(this.gettingStartedService.onDidRemoveWalkthrough(rerender));
    this.recentlyOpened = this.workspacesService.getRecentlyOpened();
    this._register(workspacesService.onDidChangeRecentlyOpened(() => {
      this.recentlyOpened = workspacesService.getRecentlyOpened();
      this.refreshRecentlyOpened();
    }));
    this._register(this.gettingStartedService.onDidChangeWalkthrough((category) => {
      const ourCategory = this.gettingStartedCategories.find((c) => c.id === category.id);
      if (!ourCategory) {
        return;
      }
      ourCategory.title = category.title;
      ourCategory.description = category.description;
      this.container.querySelectorAll(`[x-category-title-for="${category.id}"]`).forEach((step) => step.innerText = ourCategory.title);
      this.container.querySelectorAll(`[x-category-description-for="${category.id}"]`).forEach((step) => step.innerText = ourCategory.description);
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(REDUCED_MOTION_KEY)) {
        this.container.classList.toggle("animatable", this.shouldAnimate());
      }
    }));
    this._register(this.gettingStartedService.onDidProgressStep((step) => {
      const category = this.gettingStartedCategories.find((c) => c.id === step.category);
      if (!category) {
        throw Error("Could not find category with ID: " + step.category);
      }
      const ourStep = category.steps.find((_step) => _step.id === step.id);
      if (!ourStep) {
        throw Error("Could not find step with ID: " + step.id);
      }
      const stats = this.getWalkthroughCompletionStats(category);
      if (!ourStep.done && stats.stepsComplete === stats.stepsTotal - 1) {
        this.hideCategory(category.id);
      }
      ourStep.done = step.done;
      if (category.id === this.currentWalkthrough?.id) {
        const badgeelements = assertReturnsDefined(this.window.document.querySelectorAll(`[data-done-step-id="${step.id}"]`));
        badgeelements.forEach((badgeelement) => {
          if (step.done) {
            badgeelement.setAttribute("aria-checked", "true");
            badgeelement.parentElement?.setAttribute("aria-checked", "true");
            badgeelement.classList.remove(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
            badgeelement.classList.add("complete", ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
            badgeelement.setAttribute("aria-label", localize("stepDone", "{0}: Completed", step.title));
          } else {
            badgeelement.setAttribute("aria-checked", "false");
            badgeelement.parentElement?.setAttribute("aria-checked", "false");
            badgeelement.classList.remove("complete", ...ThemeIcon.asClassNameArray(gettingStartedCheckedCodicon));
            badgeelement.classList.add(...ThemeIcon.asClassNameArray(gettingStartedUncheckedCodicon));
            badgeelement.setAttribute("aria-label", localize("stepNotDone", "{0}: Not completed", step.title));
          }
        });
        if (step.done) {
          status(localize("stepAutoCompleted", "Step {0} completed", step.title));
        }
      }
      this.updateCategoryProgress();
    }));
    this._register(this.storageService.onWillSaveState((e) => {
      if (e.reason !== WillSaveStateReason.SHUTDOWN) {
        return;
      }
      if (this.workspaceContextService.getWorkspace().folders.length !== 0) {
        return;
      }
      if (!this.editorInput || !this.currentWalkthrough || !this.editorInput.selectedCategory || !this.editorInput.selectedStep) {
        return;
      }
      const editorPane = this.groupsService.activeGroup.activeEditorPane;
      if (!(editorPane instanceof GettingStartedPage)) {
        return;
      }
      const restoreData = { folder: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, category: this.editorInput.selectedCategory, step: this.editorInput.selectedStep };
      this.storageService.store(
        restoreWalkthroughsConfigurationKey,
        JSON.stringify(restoreData),
        StorageScope.PROFILE,
        StorageTarget.MACHINE
      );
    }));
  }
  get editorInput() {
    return this._input;
  }
  // remove when 'workbench.welcomePage.preferReducedMotion' deprecated
  shouldAnimate() {
    if (this.configurationService.getValue(REDUCED_MOTION_KEY)) {
      return false;
    }
    if (this.accessibilityService.isMotionReduced()) {
      return false;
    }
    return true;
  }
  getWalkthroughCompletionStats(walkthrough) {
    const activeSteps = walkthrough.steps.filter((s) => this.contextService.contextMatchesRules(s.when));
    return {
      stepsComplete: activeSteps.filter((s) => s.done).length,
      stepsTotal: activeSteps.length
    };
  }
  async setInput(newInput, options, context, token) {
    await super.setInput(newInput, options, context, token);
    const selectedCategory = options?.selectedCategory ?? newInput.selectedCategory;
    const selectedStep = options?.selectedStep ?? newInput.selectedStep;
    await this.applyInput({ ...options, selectedCategory, selectedStep });
  }
  async setOptions(options) {
    super.setOptions(options);
    if (!this.editorInput) {
      return;
    }
    if (this.editorInput.selectedCategory !== options?.selectedCategory || this.editorInput.selectedStep !== options?.selectedStep) {
      await this.applyInput(options);
    }
  }
  async applyInput(options) {
    if (!this.editorInput) {
      return;
    }
    this.editorInput.showTelemetryNotice = options?.showTelemetryNotice ?? true;
    this.editorInput.selectedCategory = options?.selectedCategory;
    this.editorInput.selectedStep = options?.selectedStep;
    this.editorInput.returnToCommand = options?.returnToCommand;
    this.container.classList.remove("animatable");
    await this.buildCategoriesSlide(options?.preserveFocus);
    if (this.shouldAnimate()) {
      setTimeout(() => this.container.classList.add("animatable"), 0);
    }
  }
  async makeCategoryVisibleWhenAvailable(categoryID, stepId) {
    this.scrollToCategory(categoryID, stepId);
  }
  registerDispatchListeners() {
    this.dispatchListeners.clear();
    this.container.querySelectorAll("[x-dispatch]").forEach((element) => {
      const dispatch = element.getAttribute("x-dispatch") ?? "";
      let command, argument;
      if (dispatch.startsWith("openLink:https")) {
        [command, argument] = ["openLink", dispatch.replace("openLink:", "")];
      } else {
        [command, argument] = dispatch.split(":");
      }
      if (command) {
        this.dispatchListeners.add(addDisposableListener(element, "click", (e) => {
          e.stopPropagation();
          this.runDispatchCommand(command, argument);
        }));
        this.dispatchListeners.add(addDisposableListener(element, "keyup", (e) => {
          const keyboardEvent = new StandardKeyboardEvent(e);
          e.stopPropagation();
          switch (keyboardEvent.keyCode) {
            case KeyCode.Enter:
            case KeyCode.Space:
              this.runDispatchCommand(command, argument);
              return;
          }
        }));
      }
    });
  }
  async runDispatchCommand(command, argument) {
    this.commandService.executeCommand("workbench.action.keepEditor");
    this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command, argument, walkthroughId: this.currentWalkthrough?.id });
    switch (command) {
      case "scrollPrev": {
        this.scrollPrev();
        break;
      }
      case "skip": {
        this.runSkip();
        break;
      }
      case "showMoreRecents": {
        this.commandService.executeCommand(OpenRecentAction.ID);
        break;
      }
      case "seeAllWalkthroughs": {
        await this.openWalkthroughSelector();
        break;
      }
      case "openFolder": {
        if (this.contextService.contextMatchesRules(ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace")))) {
          this.commandService.executeCommand(OpenFolderViaWorkspaceAction.ID);
        } else {
          this.commandService.executeCommand("workbench.action.files.openFolder");
        }
        break;
      }
      case "selectCategory": {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "selectCategory", argument, walkthroughId: this.currentWalkthrough?.id });
        this.scrollToCategory(argument);
        this.gettingStartedService.markWalkthroughOpened(argument);
        break;
      }
      case "selectStartEntry": {
        const selected = startEntries.find((e) => e.id === argument);
        if (selected) {
          this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "selectStartEntry", argument, walkthroughId: this.currentWalkthrough?.id });
          this.runStepCommand(selected.content.command);
        } else {
          throw Error("could not find start entry with id: " + argument);
        }
        break;
      }
      case "hideCategory": {
        this.hideCategory(argument);
        break;
      }
      // Use selectTask over selectStep to keep telemetry consistant:https://github.com/microsoft/vscode/issues/122256
      case "selectTask": {
        this.selectStep(argument);
        break;
      }
      case "toggleStepCompletion": {
        this.toggleStepCompletion(argument);
        break;
      }
      case "allDone": {
        this.markAllStepsComplete();
        break;
      }
      case "nextSection": {
        const next = this.currentWalkthrough?.next;
        if (next) {
          this.prevWalkthrough = this.currentWalkthrough;
          this.scrollToCategory(next);
        } else {
          console.error("Error scrolling to next section of", this.currentWalkthrough);
        }
        break;
      }
      case "openLink": {
        this.openerService.open(argument);
        break;
      }
      default: {
        console.error("Dispatch to", command, argument, "not defined");
        break;
      }
    }
  }
  hideCategory(categoryId) {
    const selectedCategory = this.gettingStartedCategories.find((category) => category.id === categoryId);
    if (!selectedCategory) {
      throw Error("Could not find category with ID " + categoryId);
    }
    this.setHiddenCategories([...this.getHiddenCategories().add(categoryId)]);
    this.gettingStartedList.value?.rerender();
  }
  markAllStepsComplete() {
    if (this.currentWalkthrough) {
      this.currentWalkthrough?.steps.forEach((step) => {
        if (!step.done) {
          this.gettingStartedService.progressStep(step.id);
        }
      });
      this.hideCategory(this.currentWalkthrough?.id);
      this.scrollPrev();
    } else {
      throw Error("No walkthrough opened");
    }
  }
  toggleStepCompletion(argument) {
    const stepToggle = assertReturnsDefined(this.currentWalkthrough?.steps.find((step) => step.id === argument));
    if (stepToggle.done) {
      this.gettingStartedService.deprogressStep(argument);
    } else {
      this.gettingStartedService.progressStep(argument);
    }
  }
  async openWalkthroughSelector() {
    const selection = await this.quickInputService.pick(this.gettingStartedCategories.filter((c) => this.contextService.contextMatchesRules(c.when)).map((x) => ({
      id: x.id,
      label: x.title,
      detail: x.description,
      description: x.source
    })), { canPickMany: false, matchOnDescription: true, matchOnDetail: true, title: localize("pickWalkthroughs", "Open Walkthrough...") });
    if (selection) {
      this.runDispatchCommand("selectCategory", selection.id);
    }
  }
  getHiddenCategories() {
    return new Set(JSON.parse(this.storageService.get(hiddenEntriesConfigurationKey, StorageScope.PROFILE, "[]")));
  }
  setHiddenCategories(hidden) {
    this.storageService.store(
      hiddenEntriesConfigurationKey,
      JSON.stringify(hidden),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
  }
  async buildMediaComponent(stepId, forceRebuild = false) {
    if (!this.currentWalkthrough) {
      throw Error("no walkthrough selected");
    }
    const stepToExpand = assertReturnsDefined(this.currentWalkthrough.steps.find((step) => step.id === stepId));
    if (!forceRebuild && this.currentMediaComponent === stepId) {
      return;
    }
    this.currentMediaComponent = stepId;
    this.stepDisposables.clear();
    this.stepDisposables.add({
      dispose: () => {
        this.currentMediaComponent = void 0;
      }
    });
    if (this.currentMediaType !== stepToExpand.media.type) {
      this.mediaDisposables.clear();
      this.currentMediaType = stepToExpand.media.type;
      this.mediaDisposables.add(toDisposable(() => {
        this.currentMediaType = void 0;
      }));
      clearNode(this.stepMediaComponent);
      if (stepToExpand.media.type === "svg") {
        this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ title: void 0, options: { disableServiceWorker: true }, contentOptions: {}, extension: void 0 }));
        this.webview.mountTo(this.stepMediaComponent, this.window);
      } else if (stepToExpand.media.type === "markdown") {
        this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ options: {}, contentOptions: { localResourceRoots: [stepToExpand.media.root], allowScripts: true }, title: "", extension: void 0 }));
        this.webview.mountTo(this.stepMediaComponent, this.window);
      } else if (stepToExpand.media.type === "video") {
        this.webview = this.mediaDisposables.add(this.webviewService.createWebviewElement({ options: {}, contentOptions: { localResourceRoots: [stepToExpand.media.root], allowScripts: true }, title: "", extension: void 0 }));
        this.webview.mountTo(this.stepMediaComponent, this.window);
      }
    }
    if (stepToExpand.media.type === "image") {
      this.stepsContent.classList.add("image");
      this.stepsContent.classList.remove("markdown");
      this.stepsContent.classList.remove("video");
      const media = stepToExpand.media;
      const mediaElement = $("img");
      clearNode(this.stepMediaComponent);
      this.stepMediaComponent.appendChild(mediaElement);
      mediaElement.setAttribute("alt", media.altText);
      this.updateMediaSourceForColorMode(mediaElement, media.path);
      this.stepDisposables.add(addDisposableListener(this.stepMediaComponent, "click", () => {
        const hrefs = stepToExpand.description.map((lt) => lt.nodes.filter((node) => typeof node !== "string").map((node) => node.href)).flat();
        if (hrefs.length === 1) {
          const href = hrefs[0];
          if (href.startsWith("http")) {
            this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "runStepAction", argument: href, walkthroughId: this.currentWalkthrough?.id });
            this.openerService.open(href);
          }
        }
      }));
      this.stepDisposables.add(this.themeService.onDidColorThemeChange(() => this.updateMediaSourceForColorMode(mediaElement, media.path)));
    } else if (stepToExpand.media.type === "svg") {
      this.stepsContent.classList.add("image");
      this.stepsContent.classList.remove("markdown");
      this.stepsContent.classList.remove("video");
      const media = stepToExpand.media;
      this.webview.setHtml(await this.detailsRenderer.renderSVG(media.path));
      let isDisposed = false;
      this.stepDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
        const body = await this.detailsRenderer.renderSVG(media.path);
        if (!isDisposed) {
          this.webview.setHtml(body);
        }
      }));
      this.stepDisposables.add(addDisposableListener(this.stepMediaComponent, "click", () => {
        const hrefs = stepToExpand.description.map((lt) => lt.nodes.filter((node) => typeof node !== "string").map((node) => node.href)).flat();
        if (hrefs.length === 1) {
          const href = hrefs[0];
          if (href.startsWith("http")) {
            this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "runStepAction", argument: href, walkthroughId: this.currentWalkthrough?.id });
            this.openerService.open(href);
          }
        }
      }));
      this.stepDisposables.add(this.webview.onDidClickLink((link) => {
        if (matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.command)) {
          this.openerService.open(link, { allowCommands: true });
        }
      }));
    } else if (stepToExpand.media.type === "markdown") {
      this.stepsContent.classList.remove("image");
      this.stepsContent.classList.add("markdown");
      this.stepsContent.classList.remove("video");
      const media = stepToExpand.media;
      const rawHTML = await this.detailsRenderer.renderMarkdown(media.path, media.base);
      this.webview.setHtml(rawHTML);
      const serializedContextKeyExprs = rawHTML.match(/checked-on=\"([^'][^"]*)\"/g)?.map((attr) => attr.slice('checked-on="'.length, -1).replace(/&#39;/g, "'").replace(/&amp;/g, "&"));
      const postTrueKeysMessage = () => {
        const enabledContextKeys = serializedContextKeyExprs?.filter((expr) => this.contextService.contextMatchesRules(ContextKeyExpr.deserialize(expr)));
        if (enabledContextKeys) {
          this.webview.postMessage({
            enabledContextKeys
          });
        }
      };
      if (serializedContextKeyExprs) {
        const contextKeyExprs = coalesce(serializedContextKeyExprs.map((expr) => ContextKeyExpr.deserialize(expr)));
        const watchingKeys = new Set(contextKeyExprs.flatMap((expr) => expr.keys()));
        this.stepDisposables.add(this.contextService.onDidChangeContext((e) => {
          if (e.affectsSome(watchingKeys)) {
            postTrueKeysMessage();
          }
        }));
      }
      let isDisposed = false;
      this.stepDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.stepDisposables.add(this.webview.onDidClickLink((link) => {
        if (matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.command)) {
          const toSide = link.startsWith("command:toSide:");
          if (toSide) {
            link = link.replace("command:toSide:", "command:");
            this.focusSideEditorGroup();
          }
          this.openerService.open(link, { allowCommands: true, openToSide: toSide });
        }
      }));
      if (rawHTML.indexOf("<code>") >= 0) {
        this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
          const body = await this.detailsRenderer.renderMarkdown(media.path, media.base);
          if (!isDisposed) {
            this.webview.setHtml(body);
            postTrueKeysMessage();
          }
        }));
      }
      const layoutDelayer = new Delayer(50);
      this.layoutMarkdown = () => {
        layoutDelayer.trigger(() => {
          this.webview.postMessage({ layoutMeNow: true });
        });
      };
      this.stepDisposables.add(layoutDelayer);
      this.stepDisposables.add({ dispose: () => this.layoutMarkdown = void 0 });
      postTrueKeysMessage();
      this.stepDisposables.add(this.webview.onMessage(async (e) => {
        const message = e.message;
        if (message.startsWith("command:")) {
          this.openerService.open(message, { allowCommands: true });
        } else if (message.startsWith("setTheme:")) {
          const themeId = message.slice("setTheme:".length);
          const theme = (await this.themeService.getColorThemes()).find((theme2) => theme2.settingsId === themeId);
          if (theme) {
            this.themeService.setColorTheme(theme.id, ConfigurationTarget.USER);
          }
        } else {
          console.error("Unexpected message", message);
        }
      }));
    } else if (stepToExpand.media.type === "video") {
      this.stepsContent.classList.add("video");
      this.stepsContent.classList.remove("markdown");
      this.stepsContent.classList.remove("image");
      const media = stepToExpand.media;
      const themeType = this.themeService.getColorTheme().type;
      const videoPath = media.path[themeType];
      const videoPoster = media.poster ? media.poster[themeType] : void 0;
      const altText = media.altText ? media.altText : localize("videoAltText", "Video for {0}", stepToExpand.title);
      const rawHTML = await this.detailsRenderer.renderVideo(videoPath, videoPoster, altText);
      this.webview.setHtml(rawHTML);
      let isDisposed = false;
      this.stepDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.stepDisposables.add(this.themeService.onDidColorThemeChange(async () => {
        const themeType2 = this.themeService.getColorTheme().type;
        const videoPath2 = media.path[themeType2];
        const videoPoster2 = media.poster ? media.poster[themeType2] : void 0;
        const body = await this.detailsRenderer.renderVideo(videoPath2, videoPoster2, altText);
        if (!isDisposed) {
          this.webview.setHtml(body);
        }
      }));
    }
  }
  async selectStepLoose(id) {
    if (!this.editorInput) {
      return;
    }
    if (id.startsWith(`${this.editorInput.selectedCategory}#`)) {
      this.selectStep(id);
    } else {
      const toSelect = this.editorInput.selectedCategory + "#" + id;
      this.selectStep(toSelect);
    }
  }
  provideScreenReaderUpdate() {
    if (this.configurationService.getValue(AccessibilityVerbositySettingId.Walkthrough)) {
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
      return kbLabel ? localize("acessibleViewHint", "Inspect this in the accessible view ({0}).\n", kbLabel) : localize("acessibleViewHintNoKbOpen", "Inspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.\n");
    }
    return "";
  }
  async selectStep(id, delayFocus = true, preserveFocus) {
    if (!this.editorInput) {
      return;
    }
    if (id) {
      let stepElement = this.container.querySelector(`[data-step-id="${id}"]`);
      if (!stepElement) {
        stepElement = this.container.querySelector(`[data-step-id]`);
        if (!stepElement) {
          return;
        }
        id = assertReturnsDefined(stepElement.getAttribute("data-step-id"));
      }
      stepElement.parentElement?.querySelectorAll(".expanded").forEach((node) => {
        if (node.getAttribute("data-step-id") !== id) {
          node.classList.remove("expanded");
          node.setAttribute("aria-expanded", "false");
          const codiconElement2 = node.querySelector(".codicon");
          if (codiconElement2) {
            codiconElement2.removeAttribute("tabindex");
          }
        }
      });
      if (!preserveFocus) {
        setTimeout(() => stepElement.focus(), delayFocus && this.shouldAnimate() ? SLIDE_TRANSITION_TIME_MS : 0);
      }
      this.editorInput.selectedStep = id;
      stepElement.classList.add("expanded");
      stepElement.setAttribute("aria-expanded", "true");
      this.buildMediaComponent(id, true);
      const codiconElement = stepElement.querySelector(".codicon");
      if (codiconElement) {
        codiconElement.setAttribute("tabindex", "0");
      }
      this.gettingStartedService.progressByEvent("stepSelected:" + id);
      const step = this.currentWalkthrough?.steps?.find((step2) => step2.id === id);
      if (step) {
        stepElement.setAttribute("aria-label", `${this.provideScreenReaderUpdate()} ${step.title}`);
      }
    } else {
      this.editorInput.selectedStep = void 0;
    }
    this.detailsPageScrollbar?.scanDomNode();
    this.detailsScrollbar.value?.scanDomNode();
  }
  updateMediaSourceForColorMode(element, sources) {
    const themeType = this.themeService.getColorTheme().type;
    const src = sources[themeType].toString(true).replace(/ /g, "%20");
    element.srcset = src.toLowerCase().endsWith(".svg") ? src : src + " 1.5x";
  }
  createEditor(parent) {
    if (this.detailsPageScrollbar) {
      this.detailsPageScrollbar.dispose();
    }
    if (this.categoriesPageScrollbar) {
      this.categoriesPageScrollbar.dispose();
    }
    this.categoriesSlide = $(".gettingStartedSlideCategories.gettingStartedSlide");
    const prevButton = $("button.prev-button.button-link", { "x-dispatch": "scrollPrev" }, $("span.scroll-button.codicon.codicon-chevron-left"), $("span.moreText", {}, localize("goBack", "Go Back")));
    this.stepsSlide = $(".gettingStartedSlideDetails.gettingStartedSlide", {}, prevButton);
    this.stepsContent = $(".gettingStartedDetailsContent", {});
    this.detailsPageScrollbar = this._register(new DomScrollableElement(this.stepsContent, { className: "full-height-scrollable", vertical: ScrollbarVisibility.Hidden }));
    this.categoriesPageScrollbar = this._register(new DomScrollableElement(this.categoriesSlide, { className: "full-height-scrollable categoriesScrollbar", vertical: ScrollbarVisibility.Hidden }));
    this.stepsSlide.appendChild(this.detailsPageScrollbar.getDomNode());
    const gettingStartedPage = $(".gettingStarted", {}, this.categoriesPageScrollbar.getDomNode(), this.stepsSlide);
    this.container.appendChild(gettingStartedPage);
    this.categoriesPageScrollbar.scanDomNode();
    this.detailsPageScrollbar.scanDomNode();
    parent.appendChild(this.container);
  }
  async buildCategoriesSlide(preserveFocus) {
    this.categoriesSlideDisposables.clear();
    const showOnStartupCheckbox = new Toggle({
      icon: Codicon.check,
      actionClassName: "getting-started-checkbox",
      isChecked: this.configurationService.getValue(configurationKey) === "welcomePage",
      title: localize("checkboxTitle", "When checked, this page will be shown on startup."),
      ...defaultToggleStyles
    });
    showOnStartupCheckbox.domNode.id = "showOnStartup";
    const showOnStartupLabel = $("label.caption", { for: "showOnStartup" }, localize("welcomePage.showOnStartup", "Show welcome page on startup"));
    const onShowOnStartupChanged = () => {
      if (showOnStartupCheckbox.checked) {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "showOnStartupChecked", argument: void 0, walkthroughId: this.currentWalkthrough?.id });
        this.configurationService.updateValue(configurationKey, "welcomePage");
      } else {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "showOnStartupUnchecked", argument: void 0, walkthroughId: this.currentWalkthrough?.id });
        this.configurationService.updateValue(configurationKey, "none");
      }
    };
    this.categoriesSlideDisposables.add(showOnStartupCheckbox);
    this.categoriesSlideDisposables.add(showOnStartupCheckbox.onChange(() => {
      onShowOnStartupChanged();
    }));
    this.categoriesSlideDisposables.add(addDisposableListener(showOnStartupLabel, "click", () => {
      showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
      onShowOnStartupChanged();
    }));
    const header = $(
      ".header",
      {},
      $("h1.product-name.caption", {}, this.productService.nameLong),
      $("p.subtitle.description", {}, localize({ key: "gettingStarted.editingEvolved", comment: ["Shown as subtitle on the Welcome page."] }, "Editing evolved"))
    );
    const leftColumn = $(".categories-column.categories-column-left", {});
    const rightColumn = $(".categories-column.categories-column-right", {});
    const startList = this.buildStartList();
    const recentList = this.buildRecentlyOpenedList();
    const gettingStartedList = this.buildGettingStartedWalkthroughsList();
    const footerChildren = [];
    if (canShowAgentsBanner(this.chatEntitlementService)) {
      const agentsBanner = createAgentsBanner(
        {
          cssClass: "getting-started-category.agents-banner",
          source: "welcomePage"
        },
        this.commandService,
        this.telemetryService
      );
      this.categoriesSlideDisposables.add(agentsBanner.disposables);
      footerChildren.push(agentsBanner.element);
    }
    footerChildren.push($(
      "p.showOnStartup",
      {},
      showOnStartupCheckbox.domNode,
      showOnStartupLabel
    ));
    const footer = $(".footer", {}, ...footerChildren);
    const layoutLists = () => {
      if (gettingStartedList.itemCount) {
        this.container.classList.remove("noWalkthroughs");
        reset(rightColumn, gettingStartedList.getDomElement());
      } else {
        this.container.classList.add("noWalkthroughs");
        reset(rightColumn);
      }
      setTimeout(() => this.categoriesPageScrollbar?.scanDomNode(), 50);
      layoutRecentList();
    };
    const layoutRecentList = () => {
      if (this.container.classList.contains("noWalkthroughs")) {
        recentList.setLimit(10);
        reset(leftColumn, startList.getDomElement());
        reset(rightColumn, recentList.getDomElement());
      } else {
        recentList.setLimit(5);
        reset(leftColumn, startList.getDomElement(), recentList.getDomElement());
      }
    };
    gettingStartedList.onDidChange(layoutLists);
    layoutLists();
    reset(this.categoriesSlide, $(".gettingStartedCategoriesContainer", {}, header, leftColumn, rightColumn, footer));
    this.categoriesPageScrollbar?.scanDomNode();
    this.updateCategoryProgress();
    this.registerDispatchListeners();
    const editorInput = this.editorInput;
    if (editorInput?.selectedCategory) {
      this.currentWalkthrough = this.gettingStartedCategories.find((category) => category.id === editorInput.selectedCategory);
      if (!this.currentWalkthrough) {
        this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
        this.currentWalkthrough = this.gettingStartedCategories.find((category) => category.id === editorInput.selectedCategory);
        if (this.currentWalkthrough) {
          this.buildCategorySlide(editorInput.selectedCategory, editorInput.selectedStep, preserveFocus);
          this.setSlide("details");
          return;
        }
      } else {
        this.buildCategorySlide(editorInput.selectedCategory, editorInput.selectedStep, preserveFocus);
        this.setSlide("details");
        return;
      }
    }
    if (this.editorInput?.showTelemetryNotice && this.productService.openToWelcomeMainPage) {
      const telemetryNotice = $("p.telemetry-notice");
      this.buildTelemetryFooter(telemetryNotice);
      footer.appendChild(telemetryNotice);
    } else if (!this.productService.openToWelcomeMainPage && this.showFeaturedWalkthrough && this.storageService.isNew(StorageScope.APPLICATION) && !this.configurationService.getValue("workbench.welcomePage.experimentalOnboarding")) {
      const firstSessionDateString = this.storageService.get(firstSessionDateStorageKey, StorageScope.APPLICATION) || (/* @__PURE__ */ new Date()).toUTCString();
      const daysSinceFirstSession = (+/* @__PURE__ */ new Date() - +new Date(firstSessionDateString)) / 1e3 / 60 / 60 / 24;
      const fistContentBehaviour = daysSinceFirstSession < 1 ? "openToFirstCategory" : "index";
      if (fistContentBehaviour === "openToFirstCategory") {
        const first = this.gettingStartedCategories.filter((c) => !c.when || this.contextService.contextMatchesRules(c.when))[0];
        if (first && this.editorInput) {
          this.currentWalkthrough = first;
          this.editorInput.selectedCategory = this.currentWalkthrough?.id;
          this.editorInput.walkthroughPageTitle = this.currentWalkthrough.walkthroughPageTitle;
          this.buildCategorySlide(this.editorInput.selectedCategory, void 0, preserveFocus);
          this.setSlide(
            "details",
            true
            /* firstLaunch */
          );
          return;
        }
      }
    }
    this.setSlide("categories");
  }
  buildRecentlyOpenedList() {
    const renderRecent = (recent) => {
      let fullPath;
      let windowOpenable;
      let resourceUri;
      if (isRecentFolder(recent)) {
        windowOpenable = { folderUri: recent.folderUri };
        fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.folderUri, { verbose: Verbosity.LONG });
        resourceUri = recent.folderUri;
      } else {
        fullPath = recent.label || this.labelService.getWorkspaceLabel(recent.workspace, { verbose: Verbosity.LONG });
        windowOpenable = { workspaceUri: recent.workspace.configPath };
        resourceUri = recent.workspace.configPath;
      }
      const { name, parentPath } = splitRecentLabel(fullPath);
      const li = $("li");
      const link = $("button.button-link");
      link.innerText = name;
      link.title = fullPath;
      link.setAttribute("aria-label", localize("welcomePage.openFolderWithPath", "Open folder {0} with path {1}", name, parentPath));
      link.addEventListener("click", (e) => {
        this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "openRecent", argument: void 0, walkthroughId: this.currentWalkthrough?.id });
        this.hostService.openWindow([windowOpenable], {
          forceNewWindow: e.ctrlKey || e.metaKey,
          remoteAuthority: recent.remoteAuthority || null
          // local window if remoteAuthority is not set or can not be deducted from the openable
        });
        e.preventDefault();
        e.stopPropagation();
      });
      li.appendChild(link);
      const span = $("span");
      span.classList.add("path");
      span.classList.add("detail");
      span.innerText = parentPath;
      span.title = fullPath;
      li.appendChild(span);
      const deleteButton = $("a.codicon.codicon-close.hide-category-button.recently-opened-delete-button", {
        "tabindex": 0,
        "role": "button",
        "title": localize("welcomePage.removeRecent", "Remove from Recently Opened"),
        "aria-label": localize("welcomePage.removeRecentAriaLabel", "Remove {0} from Recently Opened", name)
      });
      const handleDelete = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.workspacesService.removeRecentlyOpened([resourceUri]);
      };
      deleteButton.addEventListener("click", handleDelete);
      deleteButton.addEventListener("keydown", async (e) => {
        const event = new StandardKeyboardEvent(e);
        if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
          await handleDelete(e);
        }
      });
      li.appendChild(deleteButton);
      return li;
    };
    const recentlyOpenedList = this.recentlyOpenedList.value = new GettingStartedIndexList(
      {
        title: localize("recent", "Recent"),
        klass: "recently-opened",
        limit: 5,
        empty: $(
          ".empty-recent",
          {},
          localize("noRecents", "You have no recent folders,"),
          $("button.button-link", { "x-dispatch": "openFolder" }, localize("openFolder", "open a folder")),
          localize("toStart", "to start.")
        ),
        more: $(
          ".more",
          {},
          $(
            "button.button-link",
            {
              "x-dispatch": "showMoreRecents",
              title: localize("show more recents", "Show All Recent Folders {0}", this.getKeybindingLabel(OpenRecentAction.ID))
            },
            localize("showAll", "More...")
          )
        ),
        renderElement: renderRecent,
        contextService: this.contextService
      }
    );
    recentlyOpenedList.onDidChange(() => this.registerDispatchListeners());
    this.recentlyOpened.then(({ workspaces }) => {
      const workspacesWithID = this.filterRecentlyOpened(workspaces);
      const updateEntries = () => {
        recentlyOpenedList.setEntries(workspacesWithID);
      };
      updateEntries();
      recentlyOpenedList.register(this.labelService.onDidChangeFormatters(() => updateEntries()));
    }).catch(onUnexpectedError);
    return recentlyOpenedList;
  }
  filterRecentlyOpened(workspaces) {
    return workspaces.filter((recent) => !this.workspaceContextService.isCurrentWorkspace(isRecentWorkspace(recent) ? recent.workspace : recent.folderUri)).map((recent) => ({ ...recent, id: isRecentWorkspace(recent) ? recent.workspace.id : recent.folderUri.toString() }));
  }
  refreshRecentlyOpened() {
    if (!this.recentlyOpenedList.value) {
      return;
    }
    this.recentlyOpened.then(({ workspaces }) => {
      const workspacesWithID = this.filterRecentlyOpened(workspaces);
      this.recentlyOpenedList.value?.setEntries(workspacesWithID);
    }).catch(onUnexpectedError);
  }
  buildStartList() {
    const renderStartEntry = (entry) => $(
      "li",
      {},
      $(
        "button.button-link",
        {
          "x-dispatch": "selectStartEntry:" + entry.id,
          title: entry.description + " " + this.getKeybindingLabel(entry.command)
        },
        this.iconWidgetFor(entry),
        $("span", {}, entry.title)
      )
    );
    const startList = this.startList.value = new GettingStartedIndexList(
      {
        title: localize("start", "Start"),
        klass: "start-container",
        limit: 10,
        renderElement: renderStartEntry,
        rankElement: (e) => -e.order,
        contextService: this.contextService
      }
    );
    startList.setEntries(parsedStartEntries);
    startList.onDidChange(() => this.registerDispatchListeners());
    return startList;
  }
  buildGettingStartedWalkthroughsList() {
    const renderGetttingStaredWalkthrough = (category) => {
      const renderNewBadge = (category.newItems || category.newEntry) && !category.isFeatured;
      const newBadge = $(".new-badge", {});
      if (category.newEntry) {
        reset(newBadge, $(".new-category", {}, localize("new", "New")));
      } else if (category.newItems) {
        reset(newBadge, $(".new-items", {}, localize({ key: "newItems", comment: ["Shown when a list of items has changed based on an update from a remote source"] }, "Updated")));
      }
      const featuredBadge = $(".featured-badge", {});
      const descriptionContent = $(".description-content", {});
      if (category.isFeatured && this.showFeaturedWalkthrough) {
        reset(featuredBadge, $(".featured", {}, $("span.featured-icon.codicon.codicon-star-full")));
        reset(descriptionContent, ...renderLabelWithIcons(category.description));
      }
      const titleContent = $("h3.category-title.max-lines-3", { "x-category-title-for": category.id });
      reset(titleContent, ...renderLabelWithIcons(category.title));
      return $(
        "button.getting-started-category" + (category.isFeatured && this.showFeaturedWalkthrough ? ".featured" : ""),
        {
          "x-dispatch": "selectCategory:" + category.id,
          "title": category.description
        },
        featuredBadge,
        $(
          ".main-content",
          {},
          this.iconWidgetFor(category),
          titleContent,
          renderNewBadge ? newBadge : $(".no-badge"),
          $("a.codicon.codicon-close.hide-category-button", {
            "tabindex": 0,
            "x-dispatch": "hideCategory:" + category.id,
            "title": localize("close", "Hide"),
            "role": "button",
            "aria-label": localize("closeAriaLabel", "Hide")
          })
        ),
        descriptionContent,
        $(
          ".category-progress",
          { "x-data-category-id": category.id },
          $(
            ".progress-bar-outer",
            { "role": "progressbar" },
            $(".progress-bar-inner")
          )
        )
      );
    };
    const rankWalkthrough = (e) => {
      let rank = e.order;
      if (e.isFeatured) {
        rank += 7;
      }
      if (e.newEntry) {
        rank += 3;
      }
      if (e.newItems) {
        rank += 2;
      }
      if (e.recencyBonus) {
        rank += 4 * e.recencyBonus;
      }
      if (this.getHiddenCategories().has(e.id)) {
        rank = null;
      }
      return rank;
    };
    const gettingStartedList = this.gettingStartedList.value = new GettingStartedIndexList(
      {
        title: localize("walkthroughs", "Walkthroughs"),
        klass: "getting-started",
        limit: 5,
        footer: $("span.button-link.see-all-walkthroughs", { "x-dispatch": "seeAllWalkthroughs", "tabindex": 0 }, localize("showAll", "More...")),
        renderElement: renderGetttingStaredWalkthrough,
        rankElement: rankWalkthrough,
        contextService: this.contextService
      }
    );
    gettingStartedList.onDidChange(() => {
      const hidden = this.getHiddenCategories();
      const someWalkthroughsHidden = hidden.size || gettingStartedList.itemCount < this.gettingStartedCategories.filter((c) => this.contextService.contextMatchesRules(c.when)).length;
      this.container.classList.toggle("someWalkthroughsHidden", !!someWalkthroughsHidden);
      this.registerDispatchListeners();
      allWalkthroughsHiddenContext.bindTo(this.contextService).set(gettingStartedList.itemCount === 0);
      this.updateCategoryProgress();
    });
    gettingStartedList.setEntries(this.gettingStartedCategories);
    allWalkthroughsHiddenContext.bindTo(this.contextService).set(gettingStartedList.itemCount === 0);
    return gettingStartedList;
  }
  layout(size) {
    this.detailsScrollbar.value?.scanDomNode();
    this.categoriesPageScrollbar?.scanDomNode();
    this.detailsPageScrollbar?.scanDomNode();
    this.startList.value?.layout(size);
    this.gettingStartedList.value?.layout(size);
    this.recentlyOpenedList.value?.layout(size);
    if (this.editorInput?.selectedStep && this.currentMediaType) {
      this.mediaDisposables.clear();
      this.stepDisposables.clear();
      this.buildMediaComponent(this.editorInput.selectedStep);
    }
    this.layoutMarkdown?.();
    this.container.classList.toggle("height-constrained", size.height <= 600);
    this.container.classList.toggle("width-constrained", size.width <= 400);
    this.container.classList.toggle("width-semi-constrained", size.width <= 950);
    this.categoriesPageScrollbar?.scanDomNode();
    this.detailsPageScrollbar?.scanDomNode();
    this.detailsScrollbar.value?.scanDomNode();
  }
  updateCategoryProgress() {
    this.window.document.querySelectorAll(".category-progress").forEach((element) => {
      const categoryID = element.getAttribute("x-data-category-id");
      const category = this.gettingStartedCategories.find((c) => c.id === categoryID);
      if (!category) {
        return;
      }
      const stats = this.getWalkthroughCompletionStats(category);
      const bar = assertReturnsDefined(element.querySelector(".progress-bar-inner"));
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuenow", "" + stats.stepsComplete);
      bar.setAttribute("aria-valuemax", "" + stats.stepsTotal);
      const progress = stats.stepsComplete / stats.stepsTotal * 100;
      bar.style.width = `${progress}%`;
      element.parentElement.classList.toggle("no-progress", stats.stepsComplete === 0);
      if (stats.stepsTotal === stats.stepsComplete) {
        bar.title = localize("gettingStarted.allStepsComplete", "All {0} steps complete!", stats.stepsComplete);
      } else {
        bar.title = localize("gettingStarted.someStepsComplete", "{0} of {1} steps complete", stats.stepsComplete, stats.stepsTotal);
      }
    });
  }
  async scrollToCategory(categoryID, stepId) {
    if (!this.gettingStartedCategories.some((c) => c.id === categoryID)) {
      this.gettingStartedCategories = this.gettingStartedService.getWalkthroughs();
    }
    const ourCategory = this.gettingStartedCategories.find((c) => c.id === categoryID);
    if (!ourCategory) {
      throw Error("Could not find category with ID: " + categoryID);
    }
    this.inProgressScroll = this.inProgressScroll.then(async () => {
      if (!this.editorInput) {
        return;
      }
      reset(this.stepsContent);
      this.editorInput.selectedCategory = categoryID;
      this.editorInput.selectedStep = stepId;
      this.editorInput.walkthroughPageTitle = ourCategory.walkthroughPageTitle;
      this.currentWalkthrough = ourCategory;
      this.buildCategorySlide(categoryID, stepId);
      this.setSlide("details");
    });
  }
  iconWidgetFor(category) {
    const widget = category.icon.type === "icon" ? $(ThemeIcon.asCSSSelector(category.icon.icon)) : $("img.category-icon", { src: category.icon.path });
    widget.classList.add("icon-widget");
    return widget;
  }
  focusSideEditorGroup() {
    const fullSize = this.groupsService.getPart(this.group).contentDimension;
    if (!fullSize || fullSize.width <= 700 || this.container.classList.contains("width-constrained") || this.container.classList.contains("width-semi-constrained")) {
      return;
    }
    if (this.groupsService.count === 1) {
      const editorGroupSplitDirection = preferredSideBySideGroupDirection(this.configurationService);
      const sideGroup = this.groupsService.addGroup(this.groupsService.groups[0], editorGroupSplitDirection);
      this.groupsService.activateGroup(sideGroup);
    }
    const nonGettingStartedGroup = this.groupsService.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE).find((group) => !(group.activeEditor instanceof GettingStartedInput));
    if (nonGettingStartedGroup) {
      this.groupsService.activateGroup(nonGettingStartedGroup);
      nonGettingStartedGroup.focus();
    }
  }
  runStepCommand(href) {
    const isCommand = href.startsWith("command:");
    const toSide = href.startsWith("command:toSide:");
    const command = href.replace(/command:(toSide:)?/, "command:");
    this.telemetryService.publicLog2("gettingStarted.ActionExecuted", { command: "runStepAction", argument: href, walkthroughId: this.currentWalkthrough?.id });
    if (toSide) {
      this.focusSideEditorGroup();
    }
    if (isCommand) {
      const commandURI = URI.parse(command);
      let args = [];
      try {
        args = parse(decodeURIComponent(commandURI.query));
      } catch {
        try {
          args = parse(commandURI.query);
        } catch {
        }
      }
      if (!Array.isArray(args)) {
        args = [args];
      }
      if ((commandURI.path === OpenFileFolderAction.ID.toString() || commandURI.path === OpenFolderAction.ID.toString()) && this.workspaceContextService.getWorkspace().folders.length === 0) {
        const selectedStepIndex = this.currentWalkthrough?.steps.findIndex((step) => step.id === this.editorInput?.selectedStep);
        if (selectedStepIndex !== void 0 && selectedStepIndex > -1 && this.currentWalkthrough?.steps.slice(selectedStepIndex + 1).some((step) => !step.done)) {
          const restoreData = { folder: UNKNOWN_EMPTY_WINDOW_WORKSPACE.id, category: this.editorInput?.selectedCategory, step: this.editorInput?.selectedStep };
          this.storageService.store(
            restoreWalkthroughsConfigurationKey,
            JSON.stringify(restoreData),
            StorageScope.PROFILE,
            StorageTarget.MACHINE
          );
        }
      }
      this.commandService.executeCommand(commandURI.path, ...args).then((result) => {
        const toOpen = result?.openFolder;
        if (toOpen) {
          if (!URI.isUri(toOpen)) {
            console.warn("Warn: Running walkthrough command", href, "yielded non-URI `openFolder` result", toOpen, ". It will be disregarded.");
            return;
          }
          const restoreData = { folder: toOpen.toString(), category: this.editorInput?.selectedCategory, step: this.editorInput?.selectedStep };
          this.storageService.store(
            restoreWalkthroughsConfigurationKey,
            JSON.stringify(restoreData),
            StorageScope.PROFILE,
            StorageTarget.MACHINE
          );
          this.hostService.openWindow([{ folderUri: toOpen }]);
        }
      });
    } else {
      this.openerService.open(command, { allowCommands: true });
    }
    if (!isCommand && (href.startsWith("https://") || href.startsWith("http://"))) {
      this.gettingStartedService.progressByEvent("onLink:" + href);
    }
  }
  buildMarkdownDescription(container, text) {
    while (container.firstChild) {
      container.firstChild.remove();
    }
    for (const linkedText of text) {
      if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== "string") {
        const node = linkedText.nodes[0];
        const buttonContainer = append(container, $(".button-container"));
        const button = new Button(buttonContainer, { title: node.title, supportIcons: true, ...defaultButtonStyles });
        const isCommand = node.href.startsWith("command:");
        const command = node.href.replace(/command:(toSide:)?/, "command:");
        button.label = node.label;
        button.onDidClick((e) => {
          e.stopPropagation();
          e.preventDefault();
          this.runStepCommand(node.href);
        }, null, this.detailsPageDisposables);
        if (isCommand) {
          const keybinding = this.getKeyBinding(command);
          if (keybinding) {
            const shortcutMessage = $("span.shortcut-message", {}, localize("gettingStarted.keyboardTip", "Tip: Use keyboard shortcut "));
            container.appendChild(shortcutMessage);
            const label = new KeybindingLabel(shortcutMessage, OS, { ...defaultKeybindingLabelStyles });
            label.set(keybinding);
            this.detailsPageDisposables.add(label);
          }
        }
        this.detailsPageDisposables.add(button);
      } else {
        const p = append(container, $("p"));
        for (const node of linkedText.nodes) {
          if (typeof node === "string") {
            const labelWithIcon = renderLabelWithIcons(node);
            for (const element of labelWithIcon) {
              if (typeof element === "string") {
                p.appendChild(renderFormattedText(element, { renderCodeSegments: true }, $("span")));
              } else {
                p.appendChild(element);
              }
            }
          } else {
            const nodeWithTitle = matchesScheme(node.href, Schemas.http) || matchesScheme(node.href, Schemas.https) ? { ...node, title: node.href } : node;
            const link = this.instantiationService.createInstance(Link, p, nodeWithTitle, { opener: (href) => this.runStepCommand(href) });
            this.detailsPageDisposables.add(link);
          }
        }
      }
    }
    return container;
  }
  clearInput() {
    this.stepDisposables.clear();
    super.clearInput();
  }
  buildCategorySlide(categoryID, selectedStep, preserveFocus) {
    if (!this.editorInput) {
      return;
    }
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.extensionService.activateByEvent(`onWalkthrough:${categoryID.replace(/[^#]+#/, "")}`);
    });
    this.detailsPageDisposables.clear();
    this.mediaDisposables.clear();
    const category = this.gettingStartedCategories.find((category2) => category2.id === categoryID);
    if (!category) {
      throw Error("could not find category with ID " + categoryID);
    }
    const descriptionContainer = $(".category-description.description.max-lines-3", { "x-category-description-for": category.id });
    this.buildMarkdownDescription(descriptionContainer, parseDescription(category.description));
    const categoryDescriptorComponent = $(
      ".getting-started-category",
      {},
      $(
        ".category-description-container",
        {},
        $("h2.category-title.max-lines-3", { "x-category-title-for": category.id }, ...renderLabelWithIcons(category.title)),
        descriptionContainer
      )
    );
    const stepListContainer = $(".step-list-container");
    this.detailsPageDisposables.add(addDisposableListener(stepListContainer, "keydown", (e) => {
      const event = new StandardKeyboardEvent(e);
      const currentStepIndex = () => category.steps.findIndex((e2) => e2.id === this.editorInput?.selectedStep);
      if (event.keyCode === KeyCode.UpArrow) {
        const toExpand2 = category.steps.filter((step, index) => index < currentStepIndex() && this.contextService.contextMatchesRules(step.when));
        if (toExpand2.length) {
          this.selectStep(toExpand2[toExpand2.length - 1].id, false);
        }
      }
      if (event.keyCode === KeyCode.DownArrow) {
        const toExpand2 = category.steps.find((step, index) => index > currentStepIndex() && this.contextService.contextMatchesRules(step.when));
        if (toExpand2) {
          this.selectStep(toExpand2.id, false);
        }
      }
    }));
    let renderedSteps = void 0;
    const contextKeysToWatch = new Set(category.steps.flatMap((step) => step.when.keys()));
    const buildStepList = () => {
      category.steps.sort((a, b) => a.order - b.order);
      const toRender = category.steps.filter((step) => this.contextService.contextMatchesRules(step.when));
      if (equals(renderedSteps, toRender, (a, b) => a.id === b.id)) {
        return;
      }
      renderedSteps = toRender;
      reset(stepListContainer, ...renderedSteps.map((step) => {
        const codicon = $(
          ".codicon" + (step.done ? ".complete" + ThemeIcon.asCSSSelector(gettingStartedCheckedCodicon) : ThemeIcon.asCSSSelector(gettingStartedUncheckedCodicon)),
          {
            "data-done-step-id": step.id,
            "x-dispatch": "toggleStepCompletion:" + step.id,
            "role": "checkbox",
            "aria-checked": step.done ? "true" : "false",
            "aria-label": step.done ? localize("stepDone", "{0}: Completed", step.title) : localize("stepNotDone", "{0}: Not completed", step.title)
          }
        );
        const container = $(".step-description-container", { "x-step-description-for": step.id });
        this.buildMarkdownDescription(container, step.description);
        const stepTitle = $("h3.step-title.max-lines-3", { "x-step-title-for": step.id });
        reset(stepTitle, ...renderLabelWithIcons(step.title));
        const stepDescription = $(
          ".step-container",
          {},
          stepTitle,
          container
        );
        if (step.media.type === "image") {
          stepDescription.appendChild(
            $(".image-description", { "aria-label": localize("imageShowing", "Image showing {0}", step.media.altText) })
          );
        } else if (step.media.type === "video") {
          stepDescription.appendChild(
            $(".video-description", { "aria-label": localize("videoShowing", "Video showing {0}", step.media.altText) })
          );
        }
        return $(
          "button.getting-started-step",
          {
            "x-dispatch": "selectTask:" + step.id,
            "data-step-id": step.id,
            "aria-expanded": "false",
            "aria-checked": step.done ? "true" : "false",
            "role": "button"
          },
          codicon,
          stepDescription
        );
      }));
    };
    buildStepList();
    this.detailsPageDisposables.add(this.contextService.onDidChangeContext((e) => {
      if (e.affectsSome(contextKeysToWatch) && this.currentWalkthrough && this.editorInput) {
        buildStepList();
        this.registerDispatchListeners();
        this.selectStep(this.editorInput.selectedStep, false);
      }
    }));
    const showNextCategory = this.gettingStartedCategories.find((_category) => _category.id === category.next);
    const stepsContainer = $(
      ".getting-started-detail-container",
      { "role": "list" },
      stepListContainer,
      $(
        ".done-next-container",
        {},
        $("button.button-link.all-done", { "x-dispatch": "allDone" }, $("span.codicon.codicon-check-all"), localize("allDone", "Mark Done")),
        ...showNextCategory ? [$("button.button-link.next", { "x-dispatch": "nextSection" }, localize("nextOne", "Next Section"), $("span.codicon.codicon-arrow-right"))] : []
      )
    );
    this.detailsScrollbar.value = new DomScrollableElement(stepsContainer, { className: "steps-container" });
    const stepListComponent = this.detailsScrollbar.value.getDomNode();
    const categoryFooter = $(".getting-started-footer");
    if (this.editorInput.showTelemetryNotice && getTelemetryLevel(this.configurationService) !== TelemetryLevel.NONE && this.productService.enableTelemetry) {
      this.buildTelemetryFooter(categoryFooter);
    }
    reset(this.stepsContent, categoryDescriptorComponent, stepListComponent, this.stepMediaComponent, categoryFooter);
    const toExpand = category.steps.find((step) => this.contextService.contextMatchesRules(step.when) && !step.done) ?? category.steps[0];
    this.selectStep(selectedStep ?? toExpand.id, !selectedStep, preserveFocus);
    this.detailsScrollbar.value?.scanDomNode();
    this.detailsPageScrollbar?.scanDomNode();
    this.registerDispatchListeners();
  }
  buildTelemetryFooter(parent) {
    const privacyStatementCopy = localize("privacy statement", "privacy statement");
    const privacyStatementButton = `[${privacyStatementCopy}](command:workbench.action.openPrivacyStatementUrl)`;
    const optOutCopy = localize("optOut", "opt out");
    const optOutButton = `[${optOutCopy}](command:settings.filterByTelemetry)`;
    const text = localize(
      { key: "footer", comment: ['fist substitution is "vs code", second is "privacy statement", third is "opt out".'] },
      "{0} collects usage data. Read our {1} and learn how to {2}.",
      this.productService.nameShort,
      privacyStatementButton,
      optOutButton
    );
    const renderedContents = this.detailsPageDisposables.add(this.markdownRendererService.render({ value: text, isTrusted: true }));
    parent.append(renderedContents.element);
  }
  getKeybindingLabel(command) {
    command = command.replace(/^command:/, "");
    const label = this.keybindingService.lookupKeybinding(command)?.getLabel();
    if (!label) {
      return "";
    } else {
      return `(${label})`;
    }
  }
  getKeyBinding(command) {
    command = command.replace(/^command:/, "");
    return this.keybindingService.lookupKeybinding(command);
  }
  async scrollPrev() {
    this.inProgressScroll = this.inProgressScroll.then(async () => {
      if (this.prevWalkthrough && this.prevWalkthrough !== this.currentWalkthrough) {
        this.currentWalkthrough = this.prevWalkthrough;
        this.prevWalkthrough = void 0;
        this.makeCategoryVisibleWhenAvailable(this.currentWalkthrough.id);
      } else if (this.editorInput?.returnToCommand) {
        this.commandService.executeCommand(this.editorInput.returnToCommand);
      } else {
        this.currentWalkthrough = void 0;
        if (this.editorInput) {
          this.editorInput.selectedCategory = void 0;
          this.editorInput.selectedStep = void 0;
          this.editorInput.showTelemetryNotice = false;
          this.editorInput.walkthroughPageTitle = void 0;
        }
        if (this.gettingStartedCategories.length !== this.gettingStartedList.value?.itemCount) {
          this.buildCategoriesSlide();
        }
        this.selectStep(void 0);
        this.setSlide("categories");
        this.container.focus();
      }
    });
  }
  runSkip() {
    this.commandService.executeCommand("workbench.action.closeActiveEditor");
  }
  escape() {
    if (this.editorInput?.selectedCategory) {
      this.scrollPrev();
    } else {
      this.runSkip();
    }
  }
  setSlide(toEnable, firstLaunch = false) {
    const slideManager = assertReturnsDefined(this.container.querySelector(".gettingStarted"));
    if (toEnable === "categories") {
      slideManager.classList.remove("showDetails");
      slideManager.classList.add("showCategories");
      this.container.querySelector(".prev-button.button-link").style.display = "none";
      this.container.querySelector(".gettingStartedSlideDetails").querySelectorAll("button").forEach((button) => button.disabled = true);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("button").forEach((button) => button.disabled = false);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("input").forEach((button) => button.disabled = false);
    } else {
      slideManager.classList.add("showDetails");
      slideManager.classList.remove("showCategories");
      const prevButton = this.container.querySelector(".prev-button.button-link");
      prevButton.style.display = this.editorInput?.showWelcome || this.editorInput?.returnToCommand || this.prevWalkthrough ? "block" : "none";
      const moreTextElement = prevButton.querySelector(".moreText");
      moreTextElement.textContent = firstLaunch ? localize("welcome", "Welcome") : localize("goBack", "Go Back");
      this.container.querySelector(".gettingStartedSlideDetails").querySelectorAll("button").forEach((button) => button.disabled = false);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("button").forEach((button) => button.disabled = true);
      this.container.querySelector(".gettingStartedSlideCategories").querySelectorAll("input").forEach((button) => button.disabled = true);
    }
  }
  focus() {
    super.focus();
    const active = this.container.ownerDocument.activeElement;
    let parent = this.container.parentElement;
    while (parent && parent !== active) {
      parent = parent.parentElement;
    }
    if (parent) {
      this.container.focus();
    }
  }
};
GettingStartedPage.ID = "gettingStartedPage";
GettingStartedPage = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IWalkthroughsService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, IWorkbenchThemeService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IExtensionService),
  __decorateParam(13, IInstantiationService),
  __decorateParam(14, INotificationService),
  __decorateParam(15, IEditorGroupsService),
  __decorateParam(16, IContextKeyService),
  __decorateParam(17, IQuickInputService),
  __decorateParam(18, IWorkspacesService),
  __decorateParam(19, ILabelService),
  __decorateParam(20, IHostService),
  __decorateParam(21, IWebviewService),
  __decorateParam(22, IWorkspaceContextService),
  __decorateParam(23, IAccessibilityService),
  __decorateParam(24, IMarkdownRendererService),
  __decorateParam(25, IChatEntitlementService)
], GettingStartedPage);
class GettingStartedInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return JSON.stringify({ selectedCategory: editorInput.selectedCategory, selectedStep: editorInput.selectedStep });
  }
  deserialize(instantiationService, serializedEditorInput) {
    return instantiationService.invokeFunction((accessor) => {
      try {
        const { selectedCategory, selectedStep } = JSON.parse(serializedEditorInput);
        return new GettingStartedInput({ selectedCategory, selectedStep });
      } catch {
      }
      return new GettingStartedInput({});
    });
  }
}
export {
  GettingStartedInputSerializer,
  GettingStartedPage,
  allWalkthroughsHiddenContext,
  inWelcomeContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgY2xlYXJOb2RlLCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyRm9ybWF0dGVkVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb3JtYXR0ZWRUZXh0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgVG9nZ2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyLCBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IHNwbGl0UmVjZW50TGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMaW5rLCBMaW5rZWRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkVGV4dC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IFNjaGVtYXMsIG1hdGNoZXNTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICcuL21lZGlhL2dldHRpbmdTdGFydGVkLmNzcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0LCBXaWxsU2F2ZVN0YXRlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBmaXJzdFNlc3Npb25EYXRlU3RvcmFnZUtleSwgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZ2V0VGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRLZXliaW5kaW5nTGFiZWxTdHlsZXMsIGRlZmF1bHRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVdpbmRvd09wZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBVTktOT1dOX0VNUFRZX1dJTkRPV19XT1JLU1BBQ0UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJUmVjZW50Rm9sZGVyLCBJUmVjZW50V29ya3NwYWNlLCBJUmVjZW50bHlPcGVuZWQsIElXb3Jrc3BhY2VzU2VydmljZSwgaXNSZWNlbnRGb2xkZXIsIGlzUmVjZW50V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBPcGVuUmVjZW50QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dpbmRvd0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgT3BlbkZpbGVGb2xkZXJBY3Rpb24sIE9wZW5Gb2xkZXJBY3Rpb24sIE9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2VBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hTdGF0ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yU2VyaWFsaXplciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdFbGVtZW50LCBJV2Vidmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgJy4vZ2V0dGluZ1N0YXJ0ZWRDb2xvcnMuanMnO1xuaW1wb3J0IHsgR2V0dGluZ1N0YXJ0ZWREZXRhaWxzUmVuZGVyZXIgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkRGV0YWlsc1JlbmRlcmVyLmpzJztcbmltcG9ydCB7IGdldHRpbmdTdGFydGVkQ2hlY2tlZENvZGljb24sIGdldHRpbmdTdGFydGVkVW5jaGVja2VkQ29kaWNvbiB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWRJY29ucy5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZEVkaXRvck9wdGlvbnMsIEdldHRpbmdTdGFydGVkSW5wdXQgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkV2Fsa3Rocm91Z2gsIElSZXNvbHZlZFdhbGt0aHJvdWdoU3RlcCwgSVdhbGt0aHJvdWdoc1NlcnZpY2UsIGhpZGRlbkVudHJpZXNDb25maWd1cmF0aW9uS2V5LCBwYXJzZURlc2NyaXB0aW9uIH0gZnJvbSAnLi9nZXR0aW5nU3RhcnRlZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzdG9yZVdhbGt0aHJvdWdoc0NvbmZpZ3VyYXRpb25WYWx1ZSwgcmVzdG9yZVdhbGt0aHJvdWdoc0NvbmZpZ3VyYXRpb25LZXkgfSBmcm9tICcuL3N0YXJ0dXBQYWdlLmpzJztcbmltcG9ydCB7IHN0YXJ0RW50cmllcyB9IGZyb20gJy4uL2NvbW1vbi9nZXR0aW5nU3RhcnRlZENvbnRlbnQuanMnO1xuaW1wb3J0IHsgR3JvdXBzT3JkZXIsIElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdldHRpbmdTdGFydGVkSW5kZXhMaXN0IH0gZnJvbSAnLi9nZXR0aW5nU3RhcnRlZExpc3QuanMnO1xuaW1wb3J0IHsgY2FuU2hvd0FnZW50c0Jhbm5lciwgY3JlYXRlQWdlbnRzQmFubmVyIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0Jhbm5lci5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld0FjdGlvbiB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuXG5jb25zdCBTTElERV9UUkFOU0lUSU9OX1RJTUVfTVMgPSAyNTA7XG5jb25zdCBjb25maWd1cmF0aW9uS2V5ID0gJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yJztcblxuZXhwb3J0IGNvbnN0IGFsbFdhbGt0aHJvdWdoc0hpZGRlbkNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWxsV2Fsa3Rocm91Z2hzSGlkZGVuJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IGluV2VsY29tZUNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaW5XZWxjb21lJywgZmFsc2UpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXZWxjb21lUGFnZVN0YXJ0RW50cnkge1xuXHRpZDogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRjb21tYW5kOiBzdHJpbmc7XG5cdG9yZGVyOiBudW1iZXI7XG5cdGljb246IHsgdHlwZTogJ2ljb24nOyBpY29uOiBUaGVtZUljb24gfTtcblx0d2hlbjogQ29udGV4dEtleUV4cHJlc3Npb247XG59XG5cbmNvbnN0IHBhcnNlZFN0YXJ0RW50cmllczogSVdlbGNvbWVQYWdlU3RhcnRFbnRyeVtdID0gc3RhcnRFbnRyaWVzLm1hcCgoZSwgaSkgPT4gKHtcblx0Y29tbWFuZDogZS5jb250ZW50LmNvbW1hbmQsXG5cdGRlc2NyaXB0aW9uOiBlLmRlc2NyaXB0aW9uLFxuXHRpY29uOiB7IHR5cGU6ICdpY29uJywgaWNvbjogZS5pY29uIH0sXG5cdGlkOiBlLmlkLFxuXHRvcmRlcjogaSxcblx0dGl0bGU6IGUudGl0bGUsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGUud2hlbikgPz8gQ29udGV4dEtleUV4cHIudHJ1ZSgpXG59KSk7XG5cbnR5cGUgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0Y29tbWFuZDogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29tbWFuZCBiZWluZyBleGVjdXRlZCBvbiB0aGUgZ2V0dGluZyBzdGFydGVkIHBhZ2UuJyB9O1xuXHR3YWxrdGhyb3VnaElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB3YWxrdGhyb3VnaCB3aGljaCB0aGUgY29tbWFuZCBpcyBpbicgfTtcblx0YXJndW1lbnQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFyZ3VtZW50cyBiZWluZyBwYXNzZWQgdG8gdGhlIGNvbW1hbmQnIH07XG5cdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRjb21tZW50OiAnSGVscCB1bmRlcnN0YW5kIHdoYXQgYWN0aW9ucyBhcmUgbW9zdCBjb21tb25seSB0YWtlbiBvbiB0aGUgZ2V0dGluZyBzdGFydGVkIHBhZ2UnO1xufTtcblxudHlwZSBHZXR0aW5nU3RhcnRlZEFjdGlvbkV2ZW50ID0ge1xuXHRjb21tYW5kOiBzdHJpbmc7XG5cdHdhbGt0aHJvdWdoSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0YXJndW1lbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn07XG5cbnR5cGUgUmVjZW50RW50cnkgPSAoSVJlY2VudEZvbGRlciB8IElSZWNlbnRXb3Jrc3BhY2UpICYgeyBpZDogc3RyaW5nIH07XG5cbmNvbnN0IFJFRFVDRURfTU9USU9OX0tFWSA9ICd3b3JrYmVuY2gud2VsY29tZVBhZ2UucHJlZmVyUmVkdWNlZE1vdGlvbic7XG5leHBvcnQgY2xhc3MgR2V0dGluZ1N0YXJ0ZWRQYWdlIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdnZXR0aW5nU3RhcnRlZFBhZ2UnO1xuXG5cdHByaXZhdGUgaW5Qcm9ncmVzc1Njcm9sbCA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcGF0Y2hMaXN0ZW5lcnM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBzdGVwRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBkZXRhaWxzUGFnZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVkaWFEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdC8vIEVuc3VyZSB0aGF0IHRoZSB0aGVzZSBhcmUgaW5pdGlhbGl6ZWQgYmVmb3JlIHVzZS5cblx0Ly8gQ3VycmVudGx5IGluaXRpYWxpemVkIGJlZm9yZSB1c2UgaW4gYnVpbGRDYXRlZ29yaWVzU2xpZGUgYW5kIHNjcm9sbFRvQ2F0ZWdvcnlcblx0cHJpdmF0ZSByZWNlbnRseU9wZW5lZCE6IFByb21pc2U8SVJlY2VudGx5T3BlbmVkPjtcblx0cHJpdmF0ZSBnZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMhOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFtdO1xuXG5cdHByaXZhdGUgY3VycmVudFdhbGt0aHJvdWdoOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcmV2V2Fsa3Rocm91Z2g6IElSZXNvbHZlZFdhbGt0aHJvdWdoIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY2F0ZWdvcmllc1BhZ2VTY3JvbGxiYXI6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGRldGFpbHNQYWdlU2Nyb2xsYmFyOiBEb21TY3JvbGxhYmxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRldGFpbHNTY3JvbGxiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RG9tU2Nyb2xsYWJsZUVsZW1lbnQ+KCkpO1xuXG5cdHByaXZhdGUgYnVpbGRTbGlkZVRocm90dGxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblxuXHRwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBjb250ZXh0U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVjZW50bHlPcGVuZWRMaXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEdldHRpbmdTdGFydGVkSW5kZXhMaXN0PFJlY2VudEVudHJ5Pj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhcnRMaXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEdldHRpbmdTdGFydGVkSW5kZXhMaXN0PElXZWxjb21lUGFnZVN0YXJ0RW50cnk+PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBnZXR0aW5nU3RhcnRlZExpc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8R2V0dGluZ1N0YXJ0ZWRJbmRleExpc3Q8SVJlc29sdmVkV2Fsa3Rocm91Z2g+PigpKTtcblxuXHRwcml2YXRlIHN0ZXBzU2xpZGUhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjYXRlZ29yaWVzU2xpZGUhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzdGVwc0NvbnRlbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzdGVwTWVkaWFDb21wb25lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB3ZWJ2aWV3ITogSVdlYnZpZXdFbGVtZW50O1xuXG5cdHByaXZhdGUgbGF5b3V0TWFya2Rvd246ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGRldGFpbHNSZW5kZXJlcjogR2V0dGluZ1N0YXJ0ZWREZXRhaWxzUmVuZGVyZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYXRlZ29yaWVzU2xpZGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRwcml2YXRlIHNob3dGZWF0dXJlZFdhbGt0aHJvdWdoID0gdHJ1ZTtcblxuXHRnZXQgZWRpdG9ySW5wdXQoKTogR2V0dGluZ1N0YXJ0ZWRJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0IGFzIEdldHRpbmdTdGFydGVkSW5wdXQgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJV2Fsa3Rocm91Z2hzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdldHRpbmdTdGFydGVkU2VydmljZTogSVdhbGt0aHJvdWdoc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VzU2VydmljZTogSVdvcmtzcGFjZXNTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3ZWJ2aWV3U2VydmljZTogSVdlYnZpZXdTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHN1cGVyKEdldHRpbmdTdGFydGVkUGFnZS5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSAkKCcuZ2V0dGluZ1N0YXJ0ZWRDb250YWluZXInLFxuXHRcdFx0e1xuXHRcdFx0XHRyb2xlOiAnZG9jdW1lbnQnLFxuXHRcdFx0XHR0YWJpbmRleDogMCxcblx0XHRcdFx0J2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnd2VsY29tZUFyaWFMYWJlbCcsIFwiT3ZlcnZpZXcgb2YgaG93IHRvIGdldCB1cCB0byBzcGVlZCB3aXRoIHlvdXIgZWRpdG9yLlwiKVxuXHRcdFx0fSk7XG5cdFx0dGhpcy5zdGVwTWVkaWFDb21wb25lbnQgPSAkKCcuZ2V0dGluZy1zdGFydGVkLW1lZGlhJyk7XG5cdFx0dGhpcy5zdGVwTWVkaWFDb21wb25lbnQuaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRcdHRoaXMuY2F0ZWdvcmllc1NsaWRlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0dGhpcy5kZXRhaWxzUmVuZGVyZXIgPSBuZXcgR2V0dGluZ1N0YXJ0ZWREZXRhaWxzUmVuZGVyZXIodGhpcy5maWxlU2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLmV4dGVuc2lvblNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlKTtcblxuXHRcdHRoaXMuY29udGV4dFNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5jb250YWluZXIpKTtcblx0XHRpbldlbGNvbWVDb250ZXh0LmJpbmRUbyh0aGlzLmNvbnRleHRTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHR0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcyA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmdldFdhbGt0aHJvdWdocygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kaXNwYXRjaExpc3RlbmVycyk7XG5cblx0XHRjb25zdCByZXJlbmRlciA9ICgpID0+IHtcblx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzID0gdGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UuZ2V0V2Fsa3Rocm91Z2hzKCk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50V2Fsa3Rocm91Z2gpIHtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdTdGVwcyA9IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoLnN0ZXBzLm1hcChzdGVwID0+IHN0ZXAuaWQpO1xuXHRcdFx0XHRjb25zdCBuZXdDYXRlZ29yeSA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoY2F0ZWdvcnkgPT4gdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkID09PSBjYXRlZ29yeS5pZCk7XG5cdFx0XHRcdGlmIChuZXdDYXRlZ29yeSkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld1N0ZXBzID0gbmV3Q2F0ZWdvcnkuc3RlcHMubWFwKHN0ZXAgPT4gc3RlcC5pZCk7XG5cdFx0XHRcdFx0aWYgKCFlcXVhbHMobmV3U3RlcHMsIGV4aXN0aW5nU3RlcHMpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmJ1aWxkU2xpZGVUaHJvdHRsZS5xdWV1ZSgoKSA9PiB0aGlzLmJ1aWxkQ2F0ZWdvcmllc1NsaWRlKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5idWlsZFNsaWRlVGhyb3R0bGUucXVldWUoKCkgPT4gdGhpcy5idWlsZENhdGVnb3JpZXNTbGlkZSgpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2Uub25EaWRBZGRXYWxrdGhyb3VnaChyZXJlbmRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLm9uRGlkUmVtb3ZlV2Fsa3Rocm91Z2gocmVyZW5kZXIpKTtcblxuXHRcdHRoaXMucmVjZW50bHlPcGVuZWQgPSB0aGlzLndvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudGx5T3BlbmVkKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod29ya3NwYWNlc1NlcnZpY2Uub25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZCgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlY2VudGx5T3BlbmVkID0gd29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50bHlPcGVuZWQoKTtcblx0XHRcdHRoaXMucmVmcmVzaFJlY2VudGx5T3BlbmVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2Uub25EaWRDaGFuZ2VXYWxrdGhyb3VnaChjYXRlZ29yeSA9PiB7XG5cdFx0XHRjb25zdCBvdXJDYXRlZ29yeSA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoYyA9PiBjLmlkID09PSBjYXRlZ29yeS5pZCk7XG5cdFx0XHRpZiAoIW91ckNhdGVnb3J5KSB7IHJldHVybjsgfVxuXG5cdFx0XHRvdXJDYXRlZ29yeS50aXRsZSA9IGNhdGVnb3J5LnRpdGxlO1xuXHRcdFx0b3VyQ2F0ZWdvcnkuZGVzY3JpcHRpb24gPSBjYXRlZ29yeS5kZXNjcmlwdGlvbjtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxEaXZFbGVtZW50PihgW3gtY2F0ZWdvcnktdGl0bGUtZm9yPVwiJHtjYXRlZ29yeS5pZH1cIl1gKS5mb3JFYWNoKHN0ZXAgPT4gKHN0ZXAgYXMgSFRNTERpdkVsZW1lbnQpLmlubmVyVGV4dCA9IG91ckNhdGVnb3J5LnRpdGxlKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbDxIVE1MRGl2RWxlbWVudD4oYFt4LWNhdGVnb3J5LWRlc2NyaXB0aW9uLWZvcj1cIiR7Y2F0ZWdvcnkuaWR9XCJdYCkuZm9yRWFjaChzdGVwID0+IChzdGVwIGFzIEhUTUxEaXZFbGVtZW50KS5pbm5lclRleHQgPSBvdXJDYXRlZ29yeS5kZXNjcmlwdGlvbik7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSRURVQ0VEX01PVElPTl9LRVkpKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FuaW1hdGFibGUnLCB0aGlzLnNob3VsZEFuaW1hdGUoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2Uub25EaWRQcm9ncmVzc1N0ZXAoc3RlcCA9PiB7XG5cdFx0XHRjb25zdCBjYXRlZ29yeSA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoYyA9PiBjLmlkID09PSBzdGVwLmNhdGVnb3J5KTtcblx0XHRcdGlmICghY2F0ZWdvcnkpIHsgdGhyb3cgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIGNhdGVnb3J5IHdpdGggSUQ6ICcgKyBzdGVwLmNhdGVnb3J5KTsgfVxuXHRcdFx0Y29uc3Qgb3VyU3RlcCA9IGNhdGVnb3J5LnN0ZXBzLmZpbmQoX3N0ZXAgPT4gX3N0ZXAuaWQgPT09IHN0ZXAuaWQpO1xuXHRcdFx0aWYgKCFvdXJTdGVwKSB7XG5cdFx0XHRcdHRocm93IEVycm9yKCdDb3VsZCBub3QgZmluZCBzdGVwIHdpdGggSUQ6ICcgKyBzdGVwLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdHMgPSB0aGlzLmdldFdhbGt0aHJvdWdoQ29tcGxldGlvblN0YXRzKGNhdGVnb3J5KTtcblx0XHRcdGlmICghb3VyU3RlcC5kb25lICYmIHN0YXRzLnN0ZXBzQ29tcGxldGUgPT09IHN0YXRzLnN0ZXBzVG90YWwgLSAxKSB7XG5cdFx0XHRcdHRoaXMuaGlkZUNhdGVnb3J5KGNhdGVnb3J5LmlkKTtcblx0XHRcdH1cblxuXHRcdFx0b3VyU3RlcC5kb25lID0gc3RlcC5kb25lO1xuXG5cdFx0XHRpZiAoY2F0ZWdvcnkuaWQgPT09IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3QgYmFkZ2VlbGVtZW50cyA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMud2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoYFtkYXRhLWRvbmUtc3RlcC1pZD1cIiR7c3RlcC5pZH1cIl1gKSk7XG5cdFx0XHRcdGJhZGdlZWxlbWVudHMuZm9yRWFjaChiYWRnZWVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdGlmIChzdGVwLmRvbmUpIHtcblx0XHRcdFx0XHRcdGJhZGdlZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsICd0cnVlJyk7XG5cdFx0XHRcdFx0XHRiYWRnZWVsZW1lbnQucGFyZW50RWxlbWVudD8uc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCAndHJ1ZScpO1xuXHRcdFx0XHRcdFx0YmFkZ2VlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoZ2V0dGluZ1N0YXJ0ZWRVbmNoZWNrZWRDb2RpY29uKSk7XG5cdFx0XHRcdFx0XHRiYWRnZWVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29tcGxldGUnLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShnZXR0aW5nU3RhcnRlZENoZWNrZWRDb2RpY29uKSk7XG5cdFx0XHRcdFx0XHRiYWRnZWVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3N0ZXBEb25lJywgXCJ7MH06IENvbXBsZXRlZFwiLCBzdGVwLnRpdGxlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0YmFkZ2VlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdFx0XHRiYWRnZWVsZW1lbnQucGFyZW50RWxlbWVudD8uc2V0QXR0cmlidXRlKCdhcmlhLWNoZWNrZWQnLCAnZmFsc2UnKTtcblx0XHRcdFx0XHRcdGJhZGdlZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjb21wbGV0ZScsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGdldHRpbmdTdGFydGVkQ2hlY2tlZENvZGljb24pKTtcblx0XHRcdFx0XHRcdGJhZGdlZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGdldHRpbmdTdGFydGVkVW5jaGVja2VkQ29kaWNvbikpO1xuXHRcdFx0XHRcdFx0YmFkZ2VlbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdzdGVwTm90RG9uZScsIFwiezB9OiBOb3QgY29tcGxldGVkXCIsIHN0ZXAudGl0bGUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoc3RlcC5kb25lKSB7XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdzdGVwQXV0b0NvbXBsZXRlZCcsIFwiU3RlcCB7MH0gY29tcGxldGVkXCIsIHN0ZXAudGl0bGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVDYXRlZ29yeVByb2dyZXNzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKGUpID0+IHtcblx0XHRcdGlmIChlLnJlYXNvbiAhPT0gV2lsbFNhdmVTdGF0ZVJlYXNvbi5TSFVURE9XTikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLmVkaXRvcklucHV0IHx8ICF0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCB8fCAhdGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5IHx8ICF0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVkaXRvclBhbmUgPSB0aGlzLmdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRcdGlmICghKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBHZXR0aW5nU3RhcnRlZFBhZ2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2F2ZSB0aGUgc3RhdGUgb2YgdGhlIHdhbGt0aHJvdWdoIHNvIHdlIGNhbiByZXN0b3JlIGl0IG9uIHJlbG9hZFxuXHRcdFx0Y29uc3QgcmVzdG9yZURhdGE6IFJlc3RvcmVXYWxrdGhyb3VnaHNDb25maWd1cmF0aW9uVmFsdWUgPSB7IGZvbGRlcjogVU5LTk9XTl9FTVBUWV9XSU5ET1dfV09SS1NQQUNFLmlkLCBjYXRlZ29yeTogdGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5LCBzdGVwOiB0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCB9O1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0cmVzdG9yZVdhbGt0aHJvdWdoc0NvbmZpZ3VyYXRpb25LZXksXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KHJlc3RvcmVEYXRhKSxcblx0XHRcdFx0U3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gcmVtb3ZlIHdoZW4gJ3dvcmtiZW5jaC53ZWxjb21lUGFnZS5wcmVmZXJSZWR1Y2VkTW90aW9uJyBkZXByZWNhdGVkXG5cdHByaXZhdGUgc2hvdWxkQW5pbWF0ZSgpIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShSRURVQ0VEX01PVElPTl9LRVkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXYWxrdGhyb3VnaENvbXBsZXRpb25TdGF0cyh3YWxrdGhyb3VnaDogSVJlc29sdmVkV2Fsa3Rocm91Z2gpOiB7IHN0ZXBzQ29tcGxldGU6IG51bWJlcjsgc3RlcHNUb3RhbDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IGFjdGl2ZVN0ZXBzID0gd2Fsa3Rocm91Z2guc3RlcHMuZmlsdGVyKHMgPT4gdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHMud2hlbikpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGVwc0NvbXBsZXRlOiBhY3RpdmVTdGVwcy5maWx0ZXIocyA9PiBzLmRvbmUpLmxlbmd0aCxcblx0XHRcdHN0ZXBzVG90YWw6IGFjdGl2ZVN0ZXBzLmxlbmd0aCxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQobmV3SW5wdXQ6IEdldHRpbmdTdGFydGVkSW5wdXQsIG9wdGlvbnM6IEdldHRpbmdTdGFydGVkRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChuZXdJbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdGNvbnN0IHNlbGVjdGVkQ2F0ZWdvcnkgPSBvcHRpb25zPy5zZWxlY3RlZENhdGVnb3J5ID8/IG5ld0lucHV0LnNlbGVjdGVkQ2F0ZWdvcnk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRTdGVwID0gb3B0aW9ucz8uc2VsZWN0ZWRTdGVwID8/IG5ld0lucHV0LnNlbGVjdGVkU3RlcDtcblx0XHRhd2FpdCB0aGlzLmFwcGx5SW5wdXQoeyAuLi5vcHRpb25zLCBzZWxlY3RlZENhdGVnb3J5LCBzZWxlY3RlZFN0ZXAgfSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRPcHRpb25zKG9wdGlvbnM6IEdldHRpbmdTdGFydGVkRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5ICE9PSBvcHRpb25zPy5zZWxlY3RlZENhdGVnb3J5IHx8XG5cdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCAhPT0gb3B0aW9ucz8uc2VsZWN0ZWRTdGVwXG5cdFx0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLmFwcGx5SW5wdXQob3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcHBseUlucHV0KG9wdGlvbnM6IEdldHRpbmdTdGFydGVkRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5lZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmVkaXRvcklucHV0LnNob3dUZWxlbWV0cnlOb3RpY2UgPSBvcHRpb25zPy5zaG93VGVsZW1ldHJ5Tm90aWNlID8/IHRydWU7XG5cdFx0dGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5ID0gb3B0aW9ucz8uc2VsZWN0ZWRDYXRlZ29yeTtcblx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCA9IG9wdGlvbnM/LnNlbGVjdGVkU3RlcDtcblx0XHR0aGlzLmVkaXRvcklucHV0LnJldHVyblRvQ29tbWFuZCA9IG9wdGlvbnM/LnJldHVyblRvQ29tbWFuZDtcblxuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2FuaW1hdGFibGUnKTtcblx0XHRhd2FpdCB0aGlzLmJ1aWxkQ2F0ZWdvcmllc1NsaWRlKG9wdGlvbnM/LnByZXNlcnZlRm9jdXMpO1xuXHRcdGlmICh0aGlzLnNob3VsZEFuaW1hdGUoKSkge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhbmltYXRhYmxlJyksIDApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIG1ha2VDYXRlZ29yeVZpc2libGVXaGVuQXZhaWxhYmxlKGNhdGVnb3J5SUQ6IHN0cmluZywgc3RlcElkPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5zY3JvbGxUb0NhdGVnb3J5KGNhdGVnb3J5SUQsIHN0ZXBJZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRGlzcGF0Y2hMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5kaXNwYXRjaExpc3RlbmVycy5jbGVhcigpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnW3gtZGlzcGF0Y2hdJykuZm9yRWFjaChlbGVtZW50ID0+IHtcblx0XHRcdGNvbnN0IGRpc3BhdGNoID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ3gtZGlzcGF0Y2gnKSA/PyAnJztcblx0XHRcdGxldCBjb21tYW5kLCBhcmd1bWVudDtcblx0XHRcdGlmIChkaXNwYXRjaC5zdGFydHNXaXRoKCdvcGVuTGluazpodHRwcycpKSB7XG5cdFx0XHRcdFtjb21tYW5kLCBhcmd1bWVudF0gPSBbJ29wZW5MaW5rJywgZGlzcGF0Y2gucmVwbGFjZSgnb3Blbkxpbms6JywgJycpXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFtjb21tYW5kLCBhcmd1bWVudF0gPSBkaXNwYXRjaC5zcGxpdCgnOicpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0dGhpcy5kaXNwYXRjaExpc3RlbmVycy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR0aGlzLnJ1bkRpc3BhdGNoQ29tbWFuZChjb21tYW5kLCBhcmd1bWVudCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5kaXNwYXRjaExpc3RlbmVycy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsICdrZXl1cCcsIChlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRzd2l0Y2ggKGtleWJvYXJkRXZlbnQua2V5Q29kZSkge1xuXHRcdFx0XHRcdFx0Y2FzZSBLZXlDb2RlLkVudGVyOlxuXHRcdFx0XHRcdFx0Y2FzZSBLZXlDb2RlLlNwYWNlOlxuXHRcdFx0XHRcdFx0XHR0aGlzLnJ1bkRpc3BhdGNoQ29tbWFuZChjb21tYW5kLCBhcmd1bWVudCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuRGlzcGF0Y2hDb21tYW5kKGNvbW1hbmQ6IHN0cmluZywgYXJndW1lbnQ6IHN0cmluZykge1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ua2VlcEVkaXRvcicpO1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdldHRpbmdTdGFydGVkQWN0aW9uRXZlbnQsIEdldHRpbmdTdGFydGVkQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdnZXR0aW5nU3RhcnRlZC5BY3Rpb25FeGVjdXRlZCcsIHsgY29tbWFuZCwgYXJndW1lbnQsIHdhbGt0aHJvdWdoSWQ6IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCB9KTtcblx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdGNhc2UgJ3Njcm9sbFByZXYnOiB7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsUHJldigpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3NraXAnOiB7XG5cdFx0XHRcdHRoaXMucnVuU2tpcCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Nob3dNb3JlUmVjZW50cyc6IHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChPcGVuUmVjZW50QWN0aW9uLklEKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzZWVBbGxXYWxrdGhyb3VnaHMnOiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbldhbGt0aHJvdWdoU2VsZWN0b3IoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdvcGVuRm9sZGVyJzoge1xuXHRcdFx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSkpKSB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChPcGVuRm9sZGVyVmlhV29ya3NwYWNlQWN0aW9uLklEKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Gb2xkZXInKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3NlbGVjdENhdGVnb3J5Jzoge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHZXR0aW5nU3RhcnRlZEFjdGlvbkV2ZW50LCBHZXR0aW5nU3RhcnRlZEFjdGlvbkNsYXNzaWZpY2F0aW9uPignZ2V0dGluZ1N0YXJ0ZWQuQWN0aW9uRXhlY3V0ZWQnLCB7IGNvbW1hbmQ6ICdzZWxlY3RDYXRlZ29yeScsIGFyZ3VtZW50LCB3YWxrdGhyb3VnaElkOiB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQgfSk7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsVG9DYXRlZ29yeShhcmd1bWVudCk7XG5cdFx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLm1hcmtXYWxrdGhyb3VnaE9wZW5lZChhcmd1bWVudCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2VsZWN0U3RhcnRFbnRyeSc6IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBzdGFydEVudHJpZXMuZmluZChlID0+IGUuaWQgPT09IGFyZ3VtZW50KTtcblx0XHRcdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBY3Rpb25FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2dldHRpbmdTdGFydGVkLkFjdGlvbkV4ZWN1dGVkJywgeyBjb21tYW5kOiAnc2VsZWN0U3RhcnRFbnRyeScsIGFyZ3VtZW50LCB3YWxrdGhyb3VnaElkOiB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQgfSk7XG5cdFx0XHRcdFx0dGhpcy5ydW5TdGVwQ29tbWFuZChzZWxlY3RlZC5jb250ZW50LmNvbW1hbmQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IEVycm9yKCdjb3VsZCBub3QgZmluZCBzdGFydCBlbnRyeSB3aXRoIGlkOiAnICsgYXJndW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaGlkZUNhdGVnb3J5Jzoge1xuXHRcdFx0XHR0aGlzLmhpZGVDYXRlZ29yeShhcmd1bWVudCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVXNlIHNlbGVjdFRhc2sgb3ZlciBzZWxlY3RTdGVwIHRvIGtlZXAgdGVsZW1ldHJ5IGNvbnNpc3RhbnQ6aHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyMjI1NlxuXHRcdFx0Y2FzZSAnc2VsZWN0VGFzayc6IHtcblx0XHRcdFx0dGhpcy5zZWxlY3RTdGVwKGFyZ3VtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd0b2dnbGVTdGVwQ29tcGxldGlvbic6IHtcblx0XHRcdFx0dGhpcy50b2dnbGVTdGVwQ29tcGxldGlvbihhcmd1bWVudCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYWxsRG9uZSc6IHtcblx0XHRcdFx0dGhpcy5tYXJrQWxsU3RlcHNDb21wbGV0ZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ25leHRTZWN0aW9uJzoge1xuXHRcdFx0XHRjb25zdCBuZXh0ID0gdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/Lm5leHQ7XG5cdFx0XHRcdGlmIChuZXh0KSB7XG5cdFx0XHRcdFx0dGhpcy5wcmV2V2Fsa3Rocm91Z2ggPSB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaDtcblx0XHRcdFx0XHR0aGlzLnNjcm9sbFRvQ2F0ZWdvcnkobmV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3Igc2Nyb2xsaW5nIHRvIG5leHQgc2VjdGlvbiBvZicsIHRoaXMuY3VycmVudFdhbGt0aHJvdWdoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ29wZW5MaW5rJzoge1xuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihhcmd1bWVudCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdEaXNwYXRjaCB0bycsIGNvbW1hbmQsIGFyZ3VtZW50LCAnbm90IGRlZmluZWQnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoaWRlQ2F0ZWdvcnkoY2F0ZWdvcnlJZDogc3RyaW5nKSB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRDYXRlZ29yeSA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkuaWQgPT09IGNhdGVnb3J5SWQpO1xuXHRcdGlmICghc2VsZWN0ZWRDYXRlZ29yeSkgeyB0aHJvdyBFcnJvcignQ291bGQgbm90IGZpbmQgY2F0ZWdvcnkgd2l0aCBJRCAnICsgY2F0ZWdvcnlJZCk7IH1cblx0XHR0aGlzLnNldEhpZGRlbkNhdGVnb3JpZXMoWy4uLnRoaXMuZ2V0SGlkZGVuQ2F0ZWdvcmllcygpLmFkZChjYXRlZ29yeUlkKV0pO1xuXHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRMaXN0LnZhbHVlPy5yZXJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXJrQWxsU3RlcHNDb21wbGV0ZSgpIHtcblx0XHRpZiAodGhpcy5jdXJyZW50V2Fsa3Rocm91Z2gpIHtcblx0XHRcdHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5zdGVwcy5mb3JFYWNoKHN0ZXAgPT4ge1xuXHRcdFx0XHRpZiAoIXN0ZXAuZG9uZSkge1xuXHRcdFx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLnByb2dyZXNzU3RlcChzdGVwLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmhpZGVDYXRlZ29yeSh0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQpO1xuXHRcdFx0dGhpcy5zY3JvbGxQcmV2KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IEVycm9yKCdObyB3YWxrdGhyb3VnaCBvcGVuZWQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZVN0ZXBDb21wbGV0aW9uKGFyZ3VtZW50OiBzdHJpbmcpIHtcblx0XHRjb25zdCBzdGVwVG9nZ2xlID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LnN0ZXBzLmZpbmQoc3RlcCA9PiBzdGVwLmlkID09PSBhcmd1bWVudCkpO1xuXHRcdGlmIChzdGVwVG9nZ2xlLmRvbmUpIHtcblx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmRlcHJvZ3Jlc3NTdGVwKGFyZ3VtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UucHJvZ3Jlc3NTdGVwKGFyZ3VtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5XYWxrdGhyb3VnaFNlbGVjdG9yKCkge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayh0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllc1xuXHRcdFx0LmZpbHRlcihjID0+IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhjLndoZW4pKVxuXHRcdFx0Lm1hcCh4ID0+ICh7XG5cdFx0XHRcdGlkOiB4LmlkLFxuXHRcdFx0XHRsYWJlbDogeC50aXRsZSxcblx0XHRcdFx0ZGV0YWlsOiB4LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogeC5zb3VyY2UsXG5cdFx0XHR9KSksIHsgY2FuUGlja01hbnk6IGZhbHNlLCBtYXRjaE9uRGVzY3JpcHRpb246IHRydWUsIG1hdGNoT25EZXRhaWw6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgncGlja1dhbGt0aHJvdWdocycsIFwiT3BlbiBXYWxrdGhyb3VnaC4uLlwiKSB9KTtcblx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLnJ1bkRpc3BhdGNoQ29tbWFuZCgnc2VsZWN0Q2F0ZWdvcnknLCBzZWxlY3Rpb24uaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SGlkZGVuQ2F0ZWdvcmllcygpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIG5ldyBTZXQoSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChoaWRkZW5FbnRyaWVzQ29uZmlndXJhdGlvbktleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpKSk7XG5cdH1cblxuXHRwcml2YXRlIHNldEhpZGRlbkNhdGVnb3JpZXMoaGlkZGVuOiBzdHJpbmdbXSkge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRoaWRkZW5FbnRyaWVzQ29uZmlndXJhdGlvbktleSxcblx0XHRcdEpTT04uc3RyaW5naWZ5KGhpZGRlbiksXG5cdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIGN1cnJlbnRNZWRpYUNvbXBvbmVudDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRNZWRpYVR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhc3luYyBidWlsZE1lZGlhQ29tcG9uZW50KHN0ZXBJZDogc3RyaW5nLCBmb3JjZVJlYnVpbGQ6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdGlmICghdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2gpIHtcblx0XHRcdHRocm93IEVycm9yKCdubyB3YWxrdGhyb3VnaCBzZWxlY3RlZCcpO1xuXHRcdH1cblx0XHRjb25zdCBzdGVwVG9FeHBhbmQgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaC5zdGVwcy5maW5kKHN0ZXAgPT4gc3RlcC5pZCA9PT0gc3RlcElkKSk7XG5cblx0XHRpZiAoIWZvcmNlUmVidWlsZCAmJiB0aGlzLmN1cnJlbnRNZWRpYUNvbXBvbmVudCA9PT0gc3RlcElkKSB7IHJldHVybjsgfVxuXHRcdHRoaXMuY3VycmVudE1lZGlhQ29tcG9uZW50ID0gc3RlcElkO1xuXG5cdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY3VycmVudE1lZGlhQ29tcG9uZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuY3VycmVudE1lZGlhVHlwZSAhPT0gc3RlcFRvRXhwYW5kLm1lZGlhLnR5cGUpIHtcblx0XHRcdHRoaXMubWVkaWFEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0XHR0aGlzLmN1cnJlbnRNZWRpYVR5cGUgPSBzdGVwVG9FeHBhbmQubWVkaWEudHlwZTtcblxuXHRcdFx0dGhpcy5tZWRpYURpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRNZWRpYVR5cGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNsZWFyTm9kZSh0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudCk7XG5cblx0XHRcdGlmIChzdGVwVG9FeHBhbmQubWVkaWEudHlwZSA9PT0gJ3N2ZycpIHtcblx0XHRcdFx0dGhpcy53ZWJ2aWV3ID0gdGhpcy5tZWRpYURpc3Bvc2FibGVzLmFkZCh0aGlzLndlYnZpZXdTZXJ2aWNlLmNyZWF0ZVdlYnZpZXdFbGVtZW50KHsgdGl0bGU6IHVuZGVmaW5lZCwgb3B0aW9uczogeyBkaXNhYmxlU2VydmljZVdvcmtlcjogdHJ1ZSB9LCBjb250ZW50T3B0aW9uczoge30sIGV4dGVuc2lvbjogdW5kZWZpbmVkIH0pKTtcblx0XHRcdFx0dGhpcy53ZWJ2aWV3Lm1vdW50VG8odGhpcy5zdGVwTWVkaWFDb21wb25lbnQsIHRoaXMud2luZG93KTtcblx0XHRcdH0gZWxzZSBpZiAoc3RlcFRvRXhwYW5kLm1lZGlhLnR5cGUgPT09ICdtYXJrZG93bicpIHtcblx0XHRcdFx0dGhpcy53ZWJ2aWV3ID0gdGhpcy5tZWRpYURpc3Bvc2FibGVzLmFkZCh0aGlzLndlYnZpZXdTZXJ2aWNlLmNyZWF0ZVdlYnZpZXdFbGVtZW50KHsgb3B0aW9uczoge30sIGNvbnRlbnRPcHRpb25zOiB7IGxvY2FsUmVzb3VyY2VSb290czogW3N0ZXBUb0V4cGFuZC5tZWRpYS5yb290XSwgYWxsb3dTY3JpcHRzOiB0cnVlIH0sIHRpdGxlOiAnJywgZXh0ZW5zaW9uOiB1bmRlZmluZWQgfSkpO1xuXHRcdFx0XHR0aGlzLndlYnZpZXcubW91bnRUbyh0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudCwgdGhpcy53aW5kb3cpO1xuXHRcdFx0fSBlbHNlIGlmIChzdGVwVG9FeHBhbmQubWVkaWEudHlwZSA9PT0gJ3ZpZGVvJykge1xuXHRcdFx0XHR0aGlzLndlYnZpZXcgPSB0aGlzLm1lZGlhRGlzcG9zYWJsZXMuYWRkKHRoaXMud2Vidmlld1NlcnZpY2UuY3JlYXRlV2Vidmlld0VsZW1lbnQoeyBvcHRpb25zOiB7fSwgY29udGVudE9wdGlvbnM6IHsgbG9jYWxSZXNvdXJjZVJvb3RzOiBbc3RlcFRvRXhwYW5kLm1lZGlhLnJvb3RdLCBhbGxvd1NjcmlwdHM6IHRydWUgfSwgdGl0bGU6ICcnLCBleHRlbnNpb246IHVuZGVmaW5lZCB9KSk7XG5cdFx0XHRcdHRoaXMud2Vidmlldy5tb3VudFRvKHRoaXMuc3RlcE1lZGlhQ29tcG9uZW50LCB0aGlzLndpbmRvdyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0ZXBUb0V4cGFuZC5tZWRpYS50eXBlID09PSAnaW1hZ2UnKSB7XG5cblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5hZGQoJ2ltYWdlJyk7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCdtYXJrZG93bicpO1xuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgndmlkZW8nKTtcblxuXHRcdFx0Y29uc3QgbWVkaWEgPSBzdGVwVG9FeHBhbmQubWVkaWE7XG5cdFx0XHRjb25zdCBtZWRpYUVsZW1lbnQgPSAkPEhUTUxJbWFnZUVsZW1lbnQ+KCdpbWcnKTtcblx0XHRcdGNsZWFyTm9kZSh0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudCk7XG5cdFx0XHR0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudC5hcHBlbmRDaGlsZChtZWRpYUVsZW1lbnQpO1xuXHRcdFx0bWVkaWFFbGVtZW50LnNldEF0dHJpYnV0ZSgnYWx0JywgbWVkaWEuYWx0VGV4dCk7XG5cdFx0XHR0aGlzLnVwZGF0ZU1lZGlhU291cmNlRm9yQ29sb3JNb2RlKG1lZGlhRWxlbWVudCwgbWVkaWEucGF0aCk7XG5cblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zdGVwTWVkaWFDb21wb25lbnQsICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaHJlZnMgPSBzdGVwVG9FeHBhbmQuZGVzY3JpcHRpb24ubWFwKGx0ID0+IGx0Lm5vZGVzLmZpbHRlcigobm9kZSk6IG5vZGUgaXMgSUxpbmsgPT4gdHlwZW9mIG5vZGUgIT09ICdzdHJpbmcnKS5tYXAobm9kZSA9PiBub2RlLmhyZWYpKS5mbGF0KCk7XG5cdFx0XHRcdGlmIChocmVmcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRjb25zdCBocmVmID0gaHJlZnNbMF07XG5cdFx0XHRcdFx0aWYgKGhyZWYuc3RhcnRzV2l0aCgnaHR0cCcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxHZXR0aW5nU3RhcnRlZEFjdGlvbkV2ZW50LCBHZXR0aW5nU3RhcnRlZEFjdGlvbkNsYXNzaWZpY2F0aW9uPignZ2V0dGluZ1N0YXJ0ZWQuQWN0aW9uRXhlY3V0ZWQnLCB7IGNvbW1hbmQ6ICdydW5TdGVwQWN0aW9uJywgYXJndW1lbnQ6IGhyZWYsIHdhbGt0aHJvdWdoSWQ6IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCB9KTtcblx0XHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGhyZWYpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlTWVkaWFTb3VyY2VGb3JDb2xvck1vZGUobWVkaWFFbGVtZW50LCBtZWRpYS5wYXRoKSkpO1xuXG5cdFx0fVxuXHRcdGVsc2UgaWYgKHN0ZXBUb0V4cGFuZC5tZWRpYS50eXBlID09PSAnc3ZnJykge1xuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LmFkZCgnaW1hZ2UnKTtcblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5yZW1vdmUoJ21hcmtkb3duJyk7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCd2aWRlbycpO1xuXG5cdFx0XHRjb25zdCBtZWRpYSA9IHN0ZXBUb0V4cGFuZC5tZWRpYTtcblx0XHRcdHRoaXMud2Vidmlldy5zZXRIdG1sKGF3YWl0IHRoaXMuZGV0YWlsc1JlbmRlcmVyLnJlbmRlclNWRyhtZWRpYS5wYXRoKSk7XG5cblx0XHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgaXNEaXNwb3NlZCA9IHRydWU7IH0pKTtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIFJlbmRlciBhZ2FpbiBzaW5jZSBjb2xvciB2YXJzIGNoYW5nZVxuXHRcdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5kZXRhaWxzUmVuZGVyZXIucmVuZGVyU1ZHKG1lZGlhLnBhdGgpO1xuXHRcdFx0XHRpZiAoIWlzRGlzcG9zZWQpIHsgLy8gTWFrZSBzdXJlIHdlIHdlcmVuJ3QgZGlzcG9zZWQgb2YgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdFx0dGhpcy53ZWJ2aWV3LnNldEh0bWwoYm9keSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnN0ZXBNZWRpYUNvbXBvbmVudCwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBocmVmcyA9IHN0ZXBUb0V4cGFuZC5kZXNjcmlwdGlvbi5tYXAobHQgPT4gbHQubm9kZXMuZmlsdGVyKChub2RlKTogbm9kZSBpcyBJTGluayA9PiB0eXBlb2Ygbm9kZSAhPT0gJ3N0cmluZycpLm1hcChub2RlID0+IG5vZGUuaHJlZikpLmZsYXQoKTtcblx0XHRcdFx0aWYgKGhyZWZzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGhyZWYgPSBocmVmc1swXTtcblx0XHRcdFx0XHRpZiAoaHJlZi5zdGFydHNXaXRoKCdodHRwJykpIHtcblx0XHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdldHRpbmdTdGFydGVkQWN0aW9uRXZlbnQsIEdldHRpbmdTdGFydGVkQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdnZXR0aW5nU3RhcnRlZC5BY3Rpb25FeGVjdXRlZCcsIHsgY29tbWFuZDogJ3J1blN0ZXBBY3Rpb24nLCBhcmd1bWVudDogaHJlZiwgd2Fsa3Rocm91Z2hJZDogdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkIH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oaHJlZik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0aGlzLndlYnZpZXcub25EaWRDbGlja0xpbmsobGluayA9PiB7XG5cdFx0XHRcdGlmIChtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuaHR0cHMpIHx8IG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5odHRwKSB8fCAobWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmNvbW1hbmQpKSkge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmssIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0fVxuXHRcdGVsc2UgaWYgKHN0ZXBUb0V4cGFuZC5tZWRpYS50eXBlID09PSAnbWFya2Rvd24nKSB7XG5cblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ltYWdlJyk7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QuYWRkKCdtYXJrZG93bicpO1xuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgndmlkZW8nKTtcblxuXHRcdFx0Y29uc3QgbWVkaWEgPSBzdGVwVG9FeHBhbmQubWVkaWE7XG5cblx0XHRcdGNvbnN0IHJhd0hUTUwgPSBhd2FpdCB0aGlzLmRldGFpbHNSZW5kZXJlci5yZW5kZXJNYXJrZG93bihtZWRpYS5wYXRoLCBtZWRpYS5iYXNlKTtcblx0XHRcdHRoaXMud2Vidmlldy5zZXRIdG1sKHJhd0hUTUwpO1xuXG5cdFx0XHRjb25zdCBzZXJpYWxpemVkQ29udGV4dEtleUV4cHJzID0gcmF3SFRNTC5tYXRjaCgvY2hlY2tlZC1vbj1cXFwiKFteJ11bXlwiXSopXFxcIi9nKT8ubWFwKGF0dHIgPT4gYXR0ci5zbGljZSgnY2hlY2tlZC1vbj1cIicubGVuZ3RoLCAtMSlcblx0XHRcdFx0LnJlcGxhY2UoLyYjMzk7L2csICdcXCcnKVxuXHRcdFx0XHQucmVwbGFjZSgvJmFtcDsvZywgJyYnKSk7XG5cblx0XHRcdGNvbnN0IHBvc3RUcnVlS2V5c01lc3NhZ2UgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWRDb250ZXh0S2V5cyA9IHNlcmlhbGl6ZWRDb250ZXh0S2V5RXhwcnM/LmZpbHRlcihleHByID0+IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShleHByKSkpO1xuXHRcdFx0XHRpZiAoZW5hYmxlZENvbnRleHRLZXlzKSB7XG5cdFx0XHRcdFx0dGhpcy53ZWJ2aWV3LnBvc3RNZXNzYWdlKHtcblx0XHRcdFx0XHRcdGVuYWJsZWRDb250ZXh0S2V5c1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoc2VyaWFsaXplZENvbnRleHRLZXlFeHBycykge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0S2V5RXhwcnMgPSBjb2FsZXNjZShzZXJpYWxpemVkQ29udGV4dEtleUV4cHJzLm1hcChleHByID0+IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGV4cHIpKSk7XG5cdFx0XHRcdGNvbnN0IHdhdGNoaW5nS2V5cyA9IG5ldyBTZXQoY29udGV4dEtleUV4cHJzLmZsYXRNYXAoZXhwciA9PiBleHByLmtleXMoKSkpO1xuXG5cdFx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzU29tZSh3YXRjaGluZ0tleXMpKSB7IHBvc3RUcnVlS2V5c01lc3NhZ2UoKTsgfVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgaXNEaXNwb3NlZCA9IHRydWU7IH0pKTtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHRoaXMud2Vidmlldy5vbkRpZENsaWNrTGluayhsaW5rID0+IHtcblx0XHRcdFx0aWYgKG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5odHRwcykgfHwgbWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmh0dHApIHx8IChtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuY29tbWFuZCkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdG9TaWRlID0gbGluay5zdGFydHNXaXRoKCdjb21tYW5kOnRvU2lkZTonKTtcblx0XHRcdFx0XHRpZiAodG9TaWRlKSB7XG5cdFx0XHRcdFx0XHRsaW5rID0gbGluay5yZXBsYWNlKCdjb21tYW5kOnRvU2lkZTonLCAnY29tbWFuZDonKTtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXNTaWRlRWRpdG9yR3JvdXAoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4obGluaywgeyBhbGxvd0NvbW1hbmRzOiB0cnVlLCBvcGVuVG9TaWRlOiB0b1NpZGUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKHJhd0hUTUwuaW5kZXhPZignPGNvZGU+JykgPj0gMCkge1xuXHRcdFx0XHQvLyBSZW5kZXIgYWdhaW4gd2hlbiBUaGVtZSBjaGFuZ2VzIHNpbmNlIHN5bnRheCBoaWdobGlnaHRpbmcgb2YgY29kZSBibG9ja3MgbWF5IGhhdmUgY2hhbmdlZFxuXHRcdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5kZXRhaWxzUmVuZGVyZXIucmVuZGVyTWFya2Rvd24obWVkaWEucGF0aCwgbWVkaWEuYmFzZSk7XG5cdFx0XHRcdFx0aWYgKCFpc0Rpc3Bvc2VkKSB7IC8vIE1ha2Ugc3VyZSB3ZSB3ZXJlbid0IGRpc3Bvc2VkIG9mIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRcdFx0dGhpcy53ZWJ2aWV3LnNldEh0bWwoYm9keSk7XG5cdFx0XHRcdFx0XHRwb3N0VHJ1ZUtleXNNZXNzYWdlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxheW91dERlbGF5ZXIgPSBuZXcgRGVsYXllcig1MCk7XG5cblx0XHRcdHRoaXMubGF5b3V0TWFya2Rvd24gPSAoKSA9PiB7XG5cdFx0XHRcdGxheW91dERlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy53ZWJ2aWV3LnBvc3RNZXNzYWdlKHsgbGF5b3V0TWVOb3c6IHRydWUgfSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKGxheW91dERlbGF5ZXIpO1xuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gdGhpcy5sYXlvdXRNYXJrZG93biA9IHVuZGVmaW5lZCB9KTtcblxuXHRcdFx0cG9zdFRydWVLZXlzTWVzc2FnZSgpO1xuXG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5hZGQodGhpcy53ZWJ2aWV3Lm9uTWVzc2FnZShhc3luYyBlID0+IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZTogc3RyaW5nID0gZS5tZXNzYWdlIGFzIHN0cmluZztcblx0XHRcdFx0aWYgKG1lc3NhZ2Uuc3RhcnRzV2l0aCgnY29tbWFuZDonKSkge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKG1lc3NhZ2UsIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChtZXNzYWdlLnN0YXJ0c1dpdGgoJ3NldFRoZW1lOicpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGhlbWVJZCA9IG1lc3NhZ2Uuc2xpY2UoJ3NldFRoZW1lOicubGVuZ3RoKTtcblx0XHRcdFx0XHRjb25zdCB0aGVtZSA9IChhd2FpdCB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lcygpKS5maW5kKHRoZW1lID0+IHRoZW1lLnNldHRpbmdzSWQgPT09IHRoZW1lSWQpO1xuXHRcdFx0XHRcdGlmICh0aGVtZSkge1xuXHRcdFx0XHRcdFx0dGhpcy50aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZSh0aGVtZS5pZCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignVW5leHBlY3RlZCBtZXNzYWdlJywgbWVzc2FnZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoc3RlcFRvRXhwYW5kLm1lZGlhLnR5cGUgPT09ICd2aWRlbycpIHtcblx0XHRcdHRoaXMuc3RlcHNDb250ZW50LmNsYXNzTGlzdC5hZGQoJ3ZpZGVvJyk7XG5cdFx0XHR0aGlzLnN0ZXBzQ29udGVudC5jbGFzc0xpc3QucmVtb3ZlKCdtYXJrZG93bicpO1xuXHRcdFx0dGhpcy5zdGVwc0NvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgnaW1hZ2UnKTtcblxuXHRcdFx0Y29uc3QgbWVkaWEgPSBzdGVwVG9FeHBhbmQubWVkaWE7XG5cblx0XHRcdGNvbnN0IHRoZW1lVHlwZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlO1xuXHRcdFx0Y29uc3QgdmlkZW9QYXRoID0gbWVkaWEucGF0aFt0aGVtZVR5cGVdO1xuXHRcdFx0Y29uc3QgdmlkZW9Qb3N0ZXIgPSBtZWRpYS5wb3N0ZXIgPyBtZWRpYS5wb3N0ZXJbdGhlbWVUeXBlXSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGFsdFRleHQgPSBtZWRpYS5hbHRUZXh0ID8gbWVkaWEuYWx0VGV4dCA6IGxvY2FsaXplKCd2aWRlb0FsdFRleHQnLCBcIlZpZGVvIGZvciB7MH1cIiwgc3RlcFRvRXhwYW5kLnRpdGxlKTtcblx0XHRcdGNvbnN0IHJhd0hUTUwgPSBhd2FpdCB0aGlzLmRldGFpbHNSZW5kZXJlci5yZW5kZXJWaWRlbyh2aWRlb1BhdGgsIHZpZGVvUG9zdGVyLCBhbHRUZXh0KTtcblx0XHRcdHRoaXMud2Vidmlldy5zZXRIdG1sKHJhd0hUTUwpO1xuXG5cdFx0XHRsZXQgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5zdGVwRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IGlzRGlzcG9zZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRcdHRoaXMuc3RlcERpc3Bvc2FibGVzLmFkZCh0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHQvLyBSZW5kZXIgYWdhaW4gc2luY2UgY29sb3IgdmFycyBjaGFuZ2Vcblx0XHRcdFx0Y29uc3QgdGhlbWVUeXBlID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGU7XG5cdFx0XHRcdGNvbnN0IHZpZGVvUGF0aCA9IG1lZGlhLnBhdGhbdGhlbWVUeXBlXTtcblx0XHRcdFx0Y29uc3QgdmlkZW9Qb3N0ZXIgPSBtZWRpYS5wb3N0ZXIgPyBtZWRpYS5wb3N0ZXJbdGhlbWVUeXBlXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHRoaXMuZGV0YWlsc1JlbmRlcmVyLnJlbmRlclZpZGVvKHZpZGVvUGF0aCwgdmlkZW9Qb3N0ZXIsIGFsdFRleHQpO1xuXG5cdFx0XHRcdGlmICghaXNEaXNwb3NlZCkgeyAvLyBNYWtlIHN1cmUgd2Ugd2VyZW4ndCBkaXNwb3NlZCBvZiBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0XHR0aGlzLndlYnZpZXcuc2V0SHRtbChib2R5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNlbGVjdFN0ZXBMb29zZShpZDogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEFsbG93IHBhc3NpbmcgaW4gaWQgd2l0aCBhIGNhdGVnb3J5IGFwcGVuZGVkIG9yIHdpdGgganVzdCB0aGUgaWQgb2YgdGhlIHN0ZXBcblx0XHRpZiAoaWQuc3RhcnRzV2l0aChgJHt0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnl9I2ApKSB7XG5cdFx0XHR0aGlzLnNlbGVjdFN0ZXAoaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB0b1NlbGVjdCA9IHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSArICcjJyArIGlkO1xuXHRcdFx0dGhpcy5zZWxlY3RTdGVwKHRvU2VsZWN0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb3ZpZGVTY3JlZW5SZWFkZXJVcGRhdGUoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLldhbGt0aHJvdWdoKSkge1xuXHRcdFx0Y29uc3Qga2JMYWJlbCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmxlVmlld0FjdGlvbi5pZCk/LmdldEFyaWFMYWJlbCgpO1xuXHRcdFx0cmV0dXJuIGtiTGFiZWwgPyBsb2NhbGl6ZSgnYWNlc3NpYmxlVmlld0hpbnQnLCBcIkluc3BlY3QgdGhpcyBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3ICh7MH0pLlxcblwiLCBrYkxhYmVsKSA6IGxvY2FsaXplKCdhY2Vzc2libGVWaWV3SGludE5vS2JPcGVuJywgXCJJbnNwZWN0IHRoaXMgaW4gdGhlIGFjY2Vzc2libGUgdmlldyB2aWEgdGhlIGNvbW1hbmQgT3BlbiBBY2Nlc3NpYmxlIFZpZXcgd2hpY2ggaXMgY3VycmVudGx5IG5vdCB0cmlnZ2VyYWJsZSB2aWEga2V5YmluZGluZy5cXG5cIik7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VsZWN0U3RlcChpZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZWxheUZvY3VzID0gdHJ1ZSwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGlkKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGxldCBzdGVwRWxlbWVudCA9IHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTERpdkVsZW1lbnQ+KGBbZGF0YS1zdGVwLWlkPVwiJHtpZH1cIl1gKTtcblx0XHRcdGlmICghc3RlcEVsZW1lbnQpIHtcblx0XHRcdFx0Ly8gU2VsZWN0ZWQgYW4gZWxlbWVudCB0aGF0IGlzIG5vdCBpbi1jb250ZXh0LCBqdXN0IGZhbGxiYWNrIHRvIHdoYXRldmVyLlxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0c3RlcEVsZW1lbnQgPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxEaXZFbGVtZW50PihgW2RhdGEtc3RlcC1pZF1gKTtcblx0XHRcdFx0aWYgKCFzdGVwRWxlbWVudCkge1xuXHRcdFx0XHRcdC8vIE5vIHN0ZXBzIGFyb3VuZC4uLiBqdXN0IGlnbm9yZS5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWQgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChzdGVwRWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtc3RlcC1pZCcpKTtcblx0XHRcdH1cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0c3RlcEVsZW1lbnQucGFyZW50RWxlbWVudD8ucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5leHBhbmRlZCcpLmZvckVhY2gobm9kZSA9PiB7XG5cdFx0XHRcdGlmIChub2RlLmdldEF0dHJpYnV0ZSgnZGF0YS1zdGVwLWlkJykgIT09IGlkKSB7XG5cdFx0XHRcdFx0bm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdleHBhbmRlZCcpO1xuXHRcdFx0XHRcdG5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdFx0Y29uc3QgY29kaWNvbkVsZW1lbnQgPSBub2RlLnF1ZXJ5U2VsZWN0b3IoJy5jb2RpY29uJyk7XG5cdFx0XHRcdFx0aWYgKGNvZGljb25FbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRjb2RpY29uRWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3RhYmluZGV4Jyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGlmICghcHJlc2VydmVGb2N1cykge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IChzdGVwRWxlbWVudCBhcyBIVE1MRWxlbWVudCkuZm9jdXMoKSwgZGVsYXlGb2N1cyAmJiB0aGlzLnNob3VsZEFuaW1hdGUoKSA/IFNMSURFX1RSQU5TSVRJT05fVElNRV9NUyA6IDApO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCA9IGlkO1xuXG5cdFx0XHRzdGVwRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdleHBhbmRlZCcpO1xuXHRcdFx0c3RlcEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHRcdHRoaXMuYnVpbGRNZWRpYUNvbXBvbmVudChpZCwgdHJ1ZSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGNvZGljb25FbGVtZW50ID0gc3RlcEVsZW1lbnQucXVlcnlTZWxlY3RvcignLmNvZGljb24nKTtcblx0XHRcdGlmIChjb2RpY29uRWxlbWVudCkge1xuXHRcdFx0XHRjb2RpY29uRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLnByb2dyZXNzQnlFdmVudCgnc3RlcFNlbGVjdGVkOicgKyBpZCk7XG5cdFx0XHRjb25zdCBzdGVwID0gdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LnN0ZXBzPy5maW5kKHN0ZXAgPT4gc3RlcC5pZCA9PT0gaWQpO1xuXHRcdFx0aWYgKHN0ZXApIHtcblx0XHRcdFx0c3RlcEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYCR7dGhpcy5wcm92aWRlU2NyZWVuUmVhZGVyVXBkYXRlKCl9ICR7c3RlcC50aXRsZX1gKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZFN0ZXAgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5kZXRhaWxzUGFnZVNjcm9sbGJhcj8uc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLmRldGFpbHNTY3JvbGxiYXIudmFsdWU/LnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1lZGlhU291cmNlRm9yQ29sb3JNb2RlKGVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQsIHNvdXJjZXM6IHsgaGNEYXJrOiBVUkk7IGhjTGlnaHQ6IFVSSTsgZGFyazogVVJJOyBsaWdodDogVVJJIH0pIHtcblx0XHRjb25zdCB0aGVtZVR5cGUgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZTtcblx0XHRjb25zdCBzcmMgPSBzb3VyY2VzW3RoZW1lVHlwZV0udG9TdHJpbmcodHJ1ZSkucmVwbGFjZSgvIC9nLCAnJTIwJyk7XG5cdFx0ZWxlbWVudC5zcmNzZXQgPSBzcmMudG9Mb3dlckNhc2UoKS5lbmRzV2l0aCgnLnN2ZycpID8gc3JjIDogKHNyYyArICcgMS41eCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KSB7XG5cdFx0aWYgKHRoaXMuZGV0YWlsc1BhZ2VTY3JvbGxiYXIpIHsgdGhpcy5kZXRhaWxzUGFnZVNjcm9sbGJhci5kaXNwb3NlKCk7IH1cblx0XHRpZiAodGhpcy5jYXRlZ29yaWVzUGFnZVNjcm9sbGJhcikgeyB0aGlzLmNhdGVnb3JpZXNQYWdlU2Nyb2xsYmFyLmRpc3Bvc2UoKTsgfVxuXG5cdFx0dGhpcy5jYXRlZ29yaWVzU2xpZGUgPSAkKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZUNhdGVnb3JpZXMuZ2V0dGluZ1N0YXJ0ZWRTbGlkZScpO1xuXG5cdFx0Y29uc3QgcHJldkJ1dHRvbiA9ICQoJ2J1dHRvbi5wcmV2LWJ1dHRvbi5idXR0b24tbGluaycsIHsgJ3gtZGlzcGF0Y2gnOiAnc2Nyb2xsUHJldicgfSwgJCgnc3Bhbi5zY3JvbGwtYnV0dG9uLmNvZGljb24uY29kaWNvbi1jaGV2cm9uLWxlZnQnKSwgJCgnc3Bhbi5tb3JlVGV4dCcsIHt9LCBsb2NhbGl6ZSgnZ29CYWNrJywgXCJHbyBCYWNrXCIpKSk7XG5cdFx0dGhpcy5zdGVwc1NsaWRlID0gJCgnLmdldHRpbmdTdGFydGVkU2xpZGVEZXRhaWxzLmdldHRpbmdTdGFydGVkU2xpZGUnLCB7fSwgcHJldkJ1dHRvbik7XG5cblx0XHR0aGlzLnN0ZXBzQ29udGVudCA9ICQoJy5nZXR0aW5nU3RhcnRlZERldGFpbHNDb250ZW50Jywge30pO1xuXG5cdFx0dGhpcy5kZXRhaWxzUGFnZVNjcm9sbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLnN0ZXBzQ29udGVudCwgeyBjbGFzc05hbWU6ICdmdWxsLWhlaWdodC1zY3JvbGxhYmxlJywgdmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuIH0pKTtcblx0XHR0aGlzLmNhdGVnb3JpZXNQYWdlU2Nyb2xsYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuY2F0ZWdvcmllc1NsaWRlLCB7IGNsYXNzTmFtZTogJ2Z1bGwtaGVpZ2h0LXNjcm9sbGFibGUgY2F0ZWdvcmllc1Njcm9sbGJhcicsIHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbiB9KSk7XG5cblx0XHR0aGlzLnN0ZXBzU2xpZGUuYXBwZW5kQ2hpbGQodGhpcy5kZXRhaWxzUGFnZVNjcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXG5cdFx0Y29uc3QgZ2V0dGluZ1N0YXJ0ZWRQYWdlID0gJCgnLmdldHRpbmdTdGFydGVkJywge30sIHRoaXMuY2F0ZWdvcmllc1BhZ2VTY3JvbGxiYXIuZ2V0RG9tTm9kZSgpLCB0aGlzLnN0ZXBzU2xpZGUpO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGdldHRpbmdTdGFydGVkUGFnZSk7XG5cblx0XHR0aGlzLmNhdGVnb3JpZXNQYWdlU2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdFx0dGhpcy5kZXRhaWxzUGFnZVNjcm9sbGJhci5zY2FuRG9tTm9kZSgpO1xuXG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuY29udGFpbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYnVpbGRDYXRlZ29yaWVzU2xpZGUocHJlc2VydmVGb2N1cz86IGJvb2xlYW4pIHtcblxuXHRcdHRoaXMuY2F0ZWdvcmllc1NsaWRlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBzaG93T25TdGFydHVwQ2hlY2tib3ggPSBuZXcgVG9nZ2xlKHtcblx0XHRcdGljb246IENvZGljb24uY2hlY2ssXG5cdFx0XHRhY3Rpb25DbGFzc05hbWU6ICdnZXR0aW5nLXN0YXJ0ZWQtY2hlY2tib3gnLFxuXHRcdFx0aXNDaGVja2VkOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGNvbmZpZ3VyYXRpb25LZXkpID09PSAnd2VsY29tZVBhZ2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGVja2JveFRpdGxlJywgXCJXaGVuIGNoZWNrZWQsIHRoaXMgcGFnZSB3aWxsIGJlIHNob3duIG9uIHN0YXJ0dXAuXCIpLFxuXHRcdFx0Li4uZGVmYXVsdFRvZ2dsZVN0eWxlc1xuXHRcdH0pO1xuXHRcdHNob3dPblN0YXJ0dXBDaGVja2JveC5kb21Ob2RlLmlkID0gJ3Nob3dPblN0YXJ0dXAnO1xuXHRcdGNvbnN0IHNob3dPblN0YXJ0dXBMYWJlbCA9ICQoJ2xhYmVsLmNhcHRpb24nLCB7IGZvcjogJ3Nob3dPblN0YXJ0dXAnIH0sIGxvY2FsaXplKCd3ZWxjb21lUGFnZS5zaG93T25TdGFydHVwJywgXCJTaG93IHdlbGNvbWUgcGFnZSBvbiBzdGFydHVwXCIpKTtcblx0XHRjb25zdCBvblNob3dPblN0YXJ0dXBDaGFuZ2VkID0gKCkgPT4ge1xuXHRcdFx0aWYgKHNob3dPblN0YXJ0dXBDaGVja2JveC5jaGVja2VkKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdldHRpbmdTdGFydGVkQWN0aW9uRXZlbnQsIEdldHRpbmdTdGFydGVkQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdnZXR0aW5nU3RhcnRlZC5BY3Rpb25FeGVjdXRlZCcsIHsgY29tbWFuZDogJ3Nob3dPblN0YXJ0dXBDaGVja2VkJywgYXJndW1lbnQ6IHVuZGVmaW5lZCwgd2Fsa3Rocm91Z2hJZDogdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkIH0pO1xuXHRcdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGNvbmZpZ3VyYXRpb25LZXksICd3ZWxjb21lUGFnZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBY3Rpb25FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2dldHRpbmdTdGFydGVkLkFjdGlvbkV4ZWN1dGVkJywgeyBjb21tYW5kOiAnc2hvd09uU3RhcnR1cFVuY2hlY2tlZCcsIGFyZ3VtZW50OiB1bmRlZmluZWQsIHdhbGt0aHJvdWdoSWQ6IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCB9KTtcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShjb25maWd1cmF0aW9uS2V5LCAnbm9uZScpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5jYXRlZ29yaWVzU2xpZGVEaXNwb3NhYmxlcy5hZGQoc2hvd09uU3RhcnR1cENoZWNrYm94KTtcblx0XHR0aGlzLmNhdGVnb3JpZXNTbGlkZURpc3Bvc2FibGVzLmFkZChzaG93T25TdGFydHVwQ2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0b25TaG93T25TdGFydHVwQ2hhbmdlZCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmNhdGVnb3JpZXNTbGlkZURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2hvd09uU3RhcnR1cExhYmVsLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRzaG93T25TdGFydHVwQ2hlY2tib3guY2hlY2tlZCA9ICFzaG93T25TdGFydHVwQ2hlY2tib3guY2hlY2tlZDtcblx0XHRcdG9uU2hvd09uU3RhcnR1cENoYW5nZWQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBoZWFkZXIgPSAkKCcuaGVhZGVyJywge30sXG5cdFx0XHQkKCdoMS5wcm9kdWN0LW5hbWUuY2FwdGlvbicsIHt9LCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdCQoJ3Auc3VidGl0bGUuZGVzY3JpcHRpb24nLCB7fSwgbG9jYWxpemUoeyBrZXk6ICdnZXR0aW5nU3RhcnRlZC5lZGl0aW5nRXZvbHZlZCcsIGNvbW1lbnQ6IFsnU2hvd24gYXMgc3VidGl0bGUgb24gdGhlIFdlbGNvbWUgcGFnZS4nXSB9LCBcIkVkaXRpbmcgZXZvbHZlZFwiKSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgbGVmdENvbHVtbiA9ICQoJy5jYXRlZ29yaWVzLWNvbHVtbi5jYXRlZ29yaWVzLWNvbHVtbi1sZWZ0Jywge30sKTtcblx0XHRjb25zdCByaWdodENvbHVtbiA9ICQoJy5jYXRlZ29yaWVzLWNvbHVtbi5jYXRlZ29yaWVzLWNvbHVtbi1yaWdodCcsIHt9LCk7XG5cblx0XHRjb25zdCBzdGFydExpc3QgPSB0aGlzLmJ1aWxkU3RhcnRMaXN0KCk7XG5cdFx0Y29uc3QgcmVjZW50TGlzdCA9IHRoaXMuYnVpbGRSZWNlbnRseU9wZW5lZExpc3QoKTtcblx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZExpc3QgPSB0aGlzLmJ1aWxkR2V0dGluZ1N0YXJ0ZWRXYWxrdGhyb3VnaHNMaXN0KCk7XG5cblx0XHRjb25zdCBmb290ZXJDaGlsZHJlbjogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRcdGlmIChjYW5TaG93QWdlbnRzQmFubmVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZSkpIHtcblx0XHRcdGNvbnN0IGFnZW50c0Jhbm5lciA9IGNyZWF0ZUFnZW50c0Jhbm5lcihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNzc0NsYXNzOiAnZ2V0dGluZy1zdGFydGVkLWNhdGVnb3J5LmFnZW50cy1iYW5uZXInLFxuXHRcdFx0XHRcdHNvdXJjZTogJ3dlbGNvbWVQYWdlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZSxcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuY2F0ZWdvcmllc1NsaWRlRGlzcG9zYWJsZXMuYWRkKGFnZW50c0Jhbm5lci5kaXNwb3NhYmxlcyk7XG5cdFx0XHRmb290ZXJDaGlsZHJlbi5wdXNoKGFnZW50c0Jhbm5lci5lbGVtZW50KTtcblx0XHR9XG5cdFx0Zm9vdGVyQ2hpbGRyZW4ucHVzaCgkKCdwLnNob3dPblN0YXJ0dXAnLCB7fSxcblx0XHRcdHNob3dPblN0YXJ0dXBDaGVja2JveC5kb21Ob2RlLFxuXHRcdFx0c2hvd09uU3RhcnR1cExhYmVsLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgZm9vdGVyID0gJCgnLmZvb3RlcicsIHt9LCAuLi5mb290ZXJDaGlsZHJlbik7XG5cblx0XHRjb25zdCBsYXlvdXRMaXN0cyA9ICgpID0+IHtcblx0XHRcdGlmIChnZXR0aW5nU3RhcnRlZExpc3QuaXRlbUNvdW50KSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ25vV2Fsa3Rocm91Z2hzJyk7XG5cdFx0XHRcdHJlc2V0KHJpZ2h0Q29sdW1uLCBnZXR0aW5nU3RhcnRlZExpc3QuZ2V0RG9tRWxlbWVudCgpKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub1dhbGt0aHJvdWdocycpO1xuXHRcdFx0XHRyZXNldChyaWdodENvbHVtbik7XG5cdFx0XHR9XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuY2F0ZWdvcmllc1BhZ2VTY3JvbGxiYXI/LnNjYW5Eb21Ob2RlKCksIDUwKTtcblx0XHRcdGxheW91dFJlY2VudExpc3QoKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbGF5b3V0UmVjZW50TGlzdCA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ25vV2Fsa3Rocm91Z2hzJykpIHtcblx0XHRcdFx0cmVjZW50TGlzdC5zZXRMaW1pdCgxMCk7XG5cdFx0XHRcdHJlc2V0KGxlZnRDb2x1bW4sIHN0YXJ0TGlzdC5nZXREb21FbGVtZW50KCkpO1xuXHRcdFx0XHRyZXNldChyaWdodENvbHVtbiwgcmVjZW50TGlzdC5nZXREb21FbGVtZW50KCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVjZW50TGlzdC5zZXRMaW1pdCg1KTtcblx0XHRcdFx0cmVzZXQobGVmdENvbHVtbiwgc3RhcnRMaXN0LmdldERvbUVsZW1lbnQoKSwgcmVjZW50TGlzdC5nZXREb21FbGVtZW50KCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRnZXR0aW5nU3RhcnRlZExpc3Qub25EaWRDaGFuZ2UobGF5b3V0TGlzdHMpO1xuXHRcdGxheW91dExpc3RzKCk7XG5cblx0XHRyZXNldCh0aGlzLmNhdGVnb3JpZXNTbGlkZSwgJCgnLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllc0NvbnRhaW5lcicsIHt9LCBoZWFkZXIsIGxlZnRDb2x1bW4sIHJpZ2h0Q29sdW1uLCBmb290ZXIsKSk7XG5cdFx0dGhpcy5jYXRlZ29yaWVzUGFnZVNjcm9sbGJhcj8uc2NhbkRvbU5vZGUoKTtcblxuXHRcdHRoaXMudXBkYXRlQ2F0ZWdvcnlQcm9ncmVzcygpO1xuXHRcdHRoaXMucmVnaXN0ZXJEaXNwYXRjaExpc3RlbmVycygpO1xuXG5cdFx0Y29uc3QgZWRpdG9ySW5wdXQgPSB0aGlzLmVkaXRvcklucHV0O1xuXHRcdGlmIChlZGl0b3JJbnB1dD8uc2VsZWN0ZWRDYXRlZ29yeSkge1xuXHRcdFx0dGhpcy5jdXJyZW50V2Fsa3Rocm91Z2ggPSB0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5maW5kKGNhdGVnb3J5ID0+IGNhdGVnb3J5LmlkID09PSBlZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5KTtcblxuXHRcdFx0aWYgKCF0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCkge1xuXHRcdFx0XHR0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcyA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmdldFdhbGt0aHJvdWdocygpO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoY2F0ZWdvcnkgPT4gY2F0ZWdvcnkuaWQgPT09IGVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnkpO1xuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50V2Fsa3Rocm91Z2gpIHtcblx0XHRcdFx0XHR0aGlzLmJ1aWxkQ2F0ZWdvcnlTbGlkZShlZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5LCBlZGl0b3JJbnB1dC5zZWxlY3RlZFN0ZXAsIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHRcdHRoaXMuc2V0U2xpZGUoJ2RldGFpbHMnKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLmJ1aWxkQ2F0ZWdvcnlTbGlkZShlZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5LCBlZGl0b3JJbnB1dC5zZWxlY3RlZFN0ZXAsIHByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHR0aGlzLnNldFNsaWRlKCdkZXRhaWxzJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JJbnB1dD8uc2hvd1RlbGVtZXRyeU5vdGljZSAmJiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm9wZW5Ub1dlbGNvbWVNYWluUGFnZSkge1xuXHRcdFx0Y29uc3QgdGVsZW1ldHJ5Tm90aWNlID0gJCgncC50ZWxlbWV0cnktbm90aWNlJyk7XG5cdFx0XHR0aGlzLmJ1aWxkVGVsZW1ldHJ5Rm9vdGVyKHRlbGVtZXRyeU5vdGljZSk7XG5cdFx0XHRmb290ZXIuYXBwZW5kQ2hpbGQodGVsZW1ldHJ5Tm90aWNlKTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLnByb2R1Y3RTZXJ2aWNlLm9wZW5Ub1dlbGNvbWVNYWluUGFnZSAmJiB0aGlzLnNob3dGZWF0dXJlZFdhbGt0aHJvdWdoICYmIHRoaXMuc3RvcmFnZVNlcnZpY2UuaXNOZXcoU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSAmJiAhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignd29ya2JlbmNoLndlbGNvbWVQYWdlLmV4cGVyaW1lbnRhbE9uYm9hcmRpbmcnKSkge1xuXHRcdFx0Y29uc3QgZmlyc3RTZXNzaW9uRGF0ZVN0cmluZyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KGZpcnN0U2Vzc2lvbkRhdGVTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pIHx8IG5ldyBEYXRlKCkudG9VVENTdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRheXNTaW5jZUZpcnN0U2Vzc2lvbiA9ICgoK25ldyBEYXRlKCkpIC0gKCtuZXcgRGF0ZShmaXJzdFNlc3Npb25EYXRlU3RyaW5nKSkpIC8gMTAwMCAvIDYwIC8gNjAgLyAyNDtcblx0XHRcdGNvbnN0IGZpc3RDb250ZW50QmVoYXZpb3VyID0gZGF5c1NpbmNlRmlyc3RTZXNzaW9uIDwgMSA/ICdvcGVuVG9GaXJzdENhdGVnb3J5JyA6ICdpbmRleCc7XG5cblx0XHRcdGlmIChmaXN0Q29udGVudEJlaGF2aW91ciA9PT0gJ29wZW5Ub0ZpcnN0Q2F0ZWdvcnknKSB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmlsdGVyKGMgPT4gIWMud2hlbiB8fCB0aGlzLmNvbnRleHRTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoYy53aGVuKSlbMF07XG5cdFx0XHRcdGlmIChmaXJzdCAmJiB0aGlzLmVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50V2Fsa3Rocm91Z2ggPSBmaXJzdDtcblx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnkgPSB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uaWQ7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JJbnB1dC53YWxrdGhyb3VnaFBhZ2VUaXRsZSA9IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoLndhbGt0aHJvdWdoUGFnZVRpdGxlO1xuXHRcdFx0XHRcdHRoaXMuYnVpbGRDYXRlZ29yeVNsaWRlKHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSwgdW5kZWZpbmVkLCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHRcdFx0XHR0aGlzLnNldFNsaWRlKCdkZXRhaWxzJywgdHJ1ZSAvKiBmaXJzdExhdW5jaCAqLyk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRTbGlkZSgnY2F0ZWdvcmllcycpO1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZFJlY2VudGx5T3BlbmVkTGlzdCgpOiBHZXR0aW5nU3RhcnRlZEluZGV4TGlzdDxSZWNlbnRFbnRyeT4ge1xuXHRcdGNvbnN0IHJlbmRlclJlY2VudCA9IChyZWNlbnQ6IFJlY2VudEVudHJ5KSA9PiB7XG5cdFx0XHRsZXQgZnVsbFBhdGg6IHN0cmluZztcblx0XHRcdGxldCB3aW5kb3dPcGVuYWJsZTogSVdpbmRvd09wZW5hYmxlO1xuXHRcdFx0bGV0IHJlc291cmNlVXJpOiBVUkk7XG5cdFx0XHRpZiAoaXNSZWNlbnRGb2xkZXIocmVjZW50KSkge1xuXHRcdFx0XHR3aW5kb3dPcGVuYWJsZSA9IHsgZm9sZGVyVXJpOiByZWNlbnQuZm9sZGVyVXJpIH07XG5cdFx0XHRcdGZ1bGxQYXRoID0gcmVjZW50LmxhYmVsIHx8IHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHJlY2VudC5mb2xkZXJVcmksIHsgdmVyYm9zZTogVmVyYm9zaXR5LkxPTkcgfSk7XG5cdFx0XHRcdHJlc291cmNlVXJpID0gcmVjZW50LmZvbGRlclVyaTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZ1bGxQYXRoID0gcmVjZW50LmxhYmVsIHx8IHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHJlY2VudC53b3Jrc3BhY2UsIHsgdmVyYm9zZTogVmVyYm9zaXR5LkxPTkcgfSk7XG5cdFx0XHRcdHdpbmRvd09wZW5hYmxlID0geyB3b3Jrc3BhY2VVcmk6IHJlY2VudC53b3Jrc3BhY2UuY29uZmlnUGF0aCB9O1xuXHRcdFx0XHRyZXNvdXJjZVVyaSA9IHJlY2VudC53b3Jrc3BhY2UuY29uZmlnUGF0aDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBuYW1lLCBwYXJlbnRQYXRoIH0gPSBzcGxpdFJlY2VudExhYmVsKGZ1bGxQYXRoKTtcblxuXHRcdFx0Y29uc3QgbGkgPSAkKCdsaScpO1xuXHRcdFx0Y29uc3QgbGluayA9ICQoJ2J1dHRvbi5idXR0b24tbGluaycpO1xuXG5cdFx0XHRsaW5rLmlubmVyVGV4dCA9IG5hbWU7XG5cdFx0XHRsaW5rLnRpdGxlID0gZnVsbFBhdGg7XG5cdFx0XHRsaW5rLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd3ZWxjb21lUGFnZS5vcGVuRm9sZGVyV2l0aFBhdGgnLCBcIk9wZW4gZm9sZGVyIHswfSB3aXRoIHBhdGggezF9XCIsIG5hbWUsIHBhcmVudFBhdGgpKTtcblx0XHRcdGxpbmsuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBlID0+IHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8R2V0dGluZ1N0YXJ0ZWRBY3Rpb25FdmVudCwgR2V0dGluZ1N0YXJ0ZWRBY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2dldHRpbmdTdGFydGVkLkFjdGlvbkV4ZWN1dGVkJywgeyBjb21tYW5kOiAnb3BlblJlY2VudCcsIGFyZ3VtZW50OiB1bmRlZmluZWQsIHdhbGt0aHJvdWdoSWQ6IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5pZCB9KTtcblx0XHRcdFx0dGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt3aW5kb3dPcGVuYWJsZV0sIHtcblx0XHRcdFx0XHRmb3JjZU5ld1dpbmRvdzogZS5jdHJsS2V5IHx8IGUubWV0YUtleSxcblx0XHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHJlY2VudC5yZW1vdGVBdXRob3JpdHkgfHwgbnVsbCAvLyBsb2NhbCB3aW5kb3cgaWYgcmVtb3RlQXV0aG9yaXR5IGlzIG5vdCBzZXQgb3IgY2FuIG5vdCBiZSBkZWR1Y3RlZCBmcm9tIHRoZSBvcGVuYWJsZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fSk7XG5cdFx0XHRsaS5hcHBlbmRDaGlsZChsaW5rKTtcblxuXHRcdFx0Y29uc3Qgc3BhbiA9ICQoJ3NwYW4nKTtcblx0XHRcdHNwYW4uY2xhc3NMaXN0LmFkZCgncGF0aCcpO1xuXHRcdFx0c3Bhbi5jbGFzc0xpc3QuYWRkKCdkZXRhaWwnKTtcblx0XHRcdHNwYW4uaW5uZXJUZXh0ID0gcGFyZW50UGF0aDtcblx0XHRcdHNwYW4udGl0bGUgPSBmdWxsUGF0aDtcblx0XHRcdGxpLmFwcGVuZENoaWxkKHNwYW4pO1xuXG5cdFx0XHRjb25zdCBkZWxldGVCdXR0b24gPSAkKCdhLmNvZGljb24uY29kaWNvbi1jbG9zZS5oaWRlLWNhdGVnb3J5LWJ1dHRvbi5yZWNlbnRseS1vcGVuZWQtZGVsZXRlLWJ1dHRvbicsIHtcblx0XHRcdFx0J3RhYmluZGV4JzogMCxcblx0XHRcdFx0J3JvbGUnOiAnYnV0dG9uJyxcblx0XHRcdFx0J3RpdGxlJzogbG9jYWxpemUoJ3dlbGNvbWVQYWdlLnJlbW92ZVJlY2VudCcsIFwiUmVtb3ZlIGZyb20gUmVjZW50bHkgT3BlbmVkXCIpLFxuXHRcdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCd3ZWxjb21lUGFnZS5yZW1vdmVSZWNlbnRBcmlhTGFiZWwnLCBcIlJlbW92ZSB7MH0gZnJvbSBSZWNlbnRseSBPcGVuZWRcIiwgbmFtZSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGhhbmRsZURlbGV0ZSA9IGFzeW5jIChlOiBFdmVudCkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlc1NlcnZpY2UucmVtb3ZlUmVjZW50bHlPcGVuZWQoW3Jlc291cmNlVXJpXSk7XG5cdFx0XHR9O1xuXHRcdFx0ZGVsZXRlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlRGVsZXRlKTtcblx0XHRcdGRlbGV0ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgfHwgZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSkge1xuXHRcdFx0XHRcdGF3YWl0IGhhbmRsZURlbGV0ZShlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRsaS5hcHBlbmRDaGlsZChkZWxldGVCdXR0b24pO1xuXG5cdFx0XHRyZXR1cm4gbGk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlY2VudGx5T3BlbmVkTGlzdCA9IHRoaXMucmVjZW50bHlPcGVuZWRMaXN0LnZhbHVlID0gbmV3IEdldHRpbmdTdGFydGVkSW5kZXhMaXN0KFxuXHRcdFx0e1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JlY2VudCcsIFwiUmVjZW50XCIpLFxuXHRcdFx0XHRrbGFzczogJ3JlY2VudGx5LW9wZW5lZCcsXG5cdFx0XHRcdGxpbWl0OiA1LFxuXHRcdFx0XHRlbXB0eTogJCgnLmVtcHR5LXJlY2VudCcsIHt9LFxuXHRcdFx0XHRcdGxvY2FsaXplKCdub1JlY2VudHMnLCBcIllvdSBoYXZlIG5vIHJlY2VudCBmb2xkZXJzLFwiKSxcblx0XHRcdFx0XHQkKCdidXR0b24uYnV0dG9uLWxpbmsnLCB7ICd4LWRpc3BhdGNoJzogJ29wZW5Gb2xkZXInIH0sIGxvY2FsaXplKCdvcGVuRm9sZGVyJywgXCJvcGVuIGEgZm9sZGVyXCIpKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndG9TdGFydCcsIFwidG8gc3RhcnQuXCIpKSxcblxuXHRcdFx0XHRtb3JlOiAkKCcubW9yZScsIHt9LFxuXHRcdFx0XHRcdCQoJ2J1dHRvbi5idXR0b24tbGluaycsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCd4LWRpc3BhdGNoJzogJ3Nob3dNb3JlUmVjZW50cycsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc2hvdyBtb3JlIHJlY2VudHMnLCBcIlNob3cgQWxsIFJlY2VudCBGb2xkZXJzIHswfVwiLCB0aGlzLmdldEtleWJpbmRpbmdMYWJlbChPcGVuUmVjZW50QWN0aW9uLklEKSlcblx0XHRcdFx0XHRcdH0sIGxvY2FsaXplKCdzaG93QWxsJywgXCJNb3JlLi4uXCIpKSksXG5cdFx0XHRcdHJlbmRlckVsZW1lbnQ6IHJlbmRlclJlY2VudCxcblx0XHRcdFx0Y29udGV4dFNlcnZpY2U6IHRoaXMuY29udGV4dFNlcnZpY2Vcblx0XHRcdH0pO1xuXG5cdFx0cmVjZW50bHlPcGVuZWRMaXN0Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMucmVnaXN0ZXJEaXNwYXRjaExpc3RlbmVycygpKTtcblx0XHR0aGlzLnJlY2VudGx5T3BlbmVkLnRoZW4oKHsgd29ya3NwYWNlcyB9KSA9PiB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VzV2l0aElEID0gdGhpcy5maWx0ZXJSZWNlbnRseU9wZW5lZCh3b3Jrc3BhY2VzKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlRW50cmllcyA9ICgpID0+IHtcblx0XHRcdFx0cmVjZW50bHlPcGVuZWRMaXN0LnNldEVudHJpZXMod29ya3NwYWNlc1dpdGhJRCk7XG5cdFx0XHR9O1xuXG5cdFx0XHR1cGRhdGVFbnRyaWVzKCk7XG5cdFx0XHRyZWNlbnRseU9wZW5lZExpc3QucmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzKCgpID0+IHVwZGF0ZUVudHJpZXMoKSkpO1xuXHRcdH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblxuXHRcdHJldHVybiByZWNlbnRseU9wZW5lZExpc3Q7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlclJlY2VudGx5T3BlbmVkKHdvcmtzcGFjZXM6IChJUmVjZW50Rm9sZGVyIHwgSVJlY2VudFdvcmtzcGFjZSlbXSk6IFJlY2VudEVudHJ5W10ge1xuXHRcdHJldHVybiB3b3Jrc3BhY2VzXG5cdFx0XHQuZmlsdGVyKHJlY2VudCA9PiAhdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5pc0N1cnJlbnRXb3Jrc3BhY2UoaXNSZWNlbnRXb3Jrc3BhY2UocmVjZW50KSA/IHJlY2VudC53b3Jrc3BhY2UgOiByZWNlbnQuZm9sZGVyVXJpKSlcblx0XHRcdC5tYXAocmVjZW50ID0+ICh7IC4uLnJlY2VudCwgaWQ6IGlzUmVjZW50V29ya3NwYWNlKHJlY2VudCkgPyByZWNlbnQud29ya3NwYWNlLmlkIDogcmVjZW50LmZvbGRlclVyaS50b1N0cmluZygpIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaFJlY2VudGx5T3BlbmVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5yZWNlbnRseU9wZW5lZExpc3QudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlY2VudGx5T3BlbmVkLnRoZW4oKHsgd29ya3NwYWNlcyB9KSA9PiB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VzV2l0aElEID0gdGhpcy5maWx0ZXJSZWNlbnRseU9wZW5lZCh3b3Jrc3BhY2VzKTtcblx0XHRcdHRoaXMucmVjZW50bHlPcGVuZWRMaXN0LnZhbHVlPy5zZXRFbnRyaWVzKHdvcmtzcGFjZXNXaXRoSUQpO1xuXHRcdH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRTdGFydExpc3QoKTogR2V0dGluZ1N0YXJ0ZWRJbmRleExpc3Q8SVdlbGNvbWVQYWdlU3RhcnRFbnRyeT4ge1xuXHRcdGNvbnN0IHJlbmRlclN0YXJ0RW50cnkgPSAoZW50cnk6IElXZWxjb21lUGFnZVN0YXJ0RW50cnkpOiBIVE1MRWxlbWVudCA9PlxuXHRcdFx0JCgnbGknLFxuXHRcdFx0XHR7fSwgJCgnYnV0dG9uLmJ1dHRvbi1saW5rJyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQneC1kaXNwYXRjaCc6ICdzZWxlY3RTdGFydEVudHJ5OicgKyBlbnRyeS5pZCxcblx0XHRcdFx0XHRcdHRpdGxlOiBlbnRyeS5kZXNjcmlwdGlvbiArICcgJyArIHRoaXMuZ2V0S2V5YmluZGluZ0xhYmVsKGVudHJ5LmNvbW1hbmQpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dGhpcy5pY29uV2lkZ2V0Rm9yKGVudHJ5KSxcblx0XHRcdFx0XHQkKCdzcGFuJywge30sIGVudHJ5LnRpdGxlKSkpO1xuXG5cdFx0Y29uc3Qgc3RhcnRMaXN0ID0gdGhpcy5zdGFydExpc3QudmFsdWUgPSBuZXcgR2V0dGluZ1N0YXJ0ZWRJbmRleExpc3QoXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3RhcnQnLCBcIlN0YXJ0XCIpLFxuXHRcdFx0XHRrbGFzczogJ3N0YXJ0LWNvbnRhaW5lcicsXG5cdFx0XHRcdGxpbWl0OiAxMCxcblx0XHRcdFx0cmVuZGVyRWxlbWVudDogcmVuZGVyU3RhcnRFbnRyeSxcblx0XHRcdFx0cmFua0VsZW1lbnQ6IGUgPT4gLWUub3JkZXIsXG5cdFx0XHRcdGNvbnRleHRTZXJ2aWNlOiB0aGlzLmNvbnRleHRTZXJ2aWNlXG5cdFx0XHR9KTtcblxuXHRcdHN0YXJ0TGlzdC5zZXRFbnRyaWVzKHBhcnNlZFN0YXJ0RW50cmllcyk7XG5cdFx0c3RhcnRMaXN0Lm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMucmVnaXN0ZXJEaXNwYXRjaExpc3RlbmVycygpKTtcblx0XHRyZXR1cm4gc3RhcnRMaXN0O1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZEdldHRpbmdTdGFydGVkV2Fsa3Rocm91Z2hzTGlzdCgpOiBHZXR0aW5nU3RhcnRlZEluZGV4TGlzdDxJUmVzb2x2ZWRXYWxrdGhyb3VnaD4ge1xuXG5cdFx0Y29uc3QgcmVuZGVyR2V0dHRpbmdTdGFyZWRXYWxrdGhyb3VnaCA9IChjYXRlZ29yeTogSVJlc29sdmVkV2Fsa3Rocm91Z2gpOiBIVE1MRWxlbWVudCA9PiB7XG5cblx0XHRcdGNvbnN0IHJlbmRlck5ld0JhZGdlID0gKGNhdGVnb3J5Lm5ld0l0ZW1zIHx8IGNhdGVnb3J5Lm5ld0VudHJ5KSAmJiAhY2F0ZWdvcnkuaXNGZWF0dXJlZDtcblx0XHRcdGNvbnN0IG5ld0JhZGdlID0gJCgnLm5ldy1iYWRnZScsIHt9KTtcblx0XHRcdGlmIChjYXRlZ29yeS5uZXdFbnRyeSkge1xuXHRcdFx0XHRyZXNldChuZXdCYWRnZSwgJCgnLm5ldy1jYXRlZ29yeScsIHt9LCBsb2NhbGl6ZSgnbmV3JywgXCJOZXdcIikpKTtcblx0XHRcdH0gZWxzZSBpZiAoY2F0ZWdvcnkubmV3SXRlbXMpIHtcblx0XHRcdFx0cmVzZXQobmV3QmFkZ2UsICQoJy5uZXctaXRlbXMnLCB7fSwgbG9jYWxpemUoeyBrZXk6ICduZXdJdGVtcycsIGNvbW1lbnQ6IFsnU2hvd24gd2hlbiBhIGxpc3Qgb2YgaXRlbXMgaGFzIGNoYW5nZWQgYmFzZWQgb24gYW4gdXBkYXRlIGZyb20gYSByZW1vdGUgc291cmNlJ10gfSwgXCJVcGRhdGVkXCIpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZlYXR1cmVkQmFkZ2UgPSAkKCcuZmVhdHVyZWQtYmFkZ2UnLCB7fSk7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbkNvbnRlbnQgPSAkKCcuZGVzY3JpcHRpb24tY29udGVudCcsIHt9LCk7XG5cblx0XHRcdGlmIChjYXRlZ29yeS5pc0ZlYXR1cmVkICYmIHRoaXMuc2hvd0ZlYXR1cmVkV2Fsa3Rocm91Z2gpIHtcblx0XHRcdFx0cmVzZXQoZmVhdHVyZWRCYWRnZSwgJCgnLmZlYXR1cmVkJywge30sICQoJ3NwYW4uZmVhdHVyZWQtaWNvbi5jb2RpY29uLmNvZGljb24tc3Rhci1mdWxsJykpKTtcblx0XHRcdFx0cmVzZXQoZGVzY3JpcHRpb25Db250ZW50LCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhjYXRlZ29yeS5kZXNjcmlwdGlvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aXRsZUNvbnRlbnQgPSAkKCdoMy5jYXRlZ29yeS10aXRsZS5tYXgtbGluZXMtMycsIHsgJ3gtY2F0ZWdvcnktdGl0bGUtZm9yJzogY2F0ZWdvcnkuaWQgfSk7XG5cdFx0XHRyZXNldCh0aXRsZUNvbnRlbnQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGNhdGVnb3J5LnRpdGxlKSk7XG5cblx0XHRcdHJldHVybiAkKCdidXR0b24uZ2V0dGluZy1zdGFydGVkLWNhdGVnb3J5JyArIChjYXRlZ29yeS5pc0ZlYXR1cmVkICYmIHRoaXMuc2hvd0ZlYXR1cmVkV2Fsa3Rocm91Z2ggPyAnLmZlYXR1cmVkJyA6ICcnKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCd4LWRpc3BhdGNoJzogJ3NlbGVjdENhdGVnb3J5OicgKyBjYXRlZ29yeS5pZCxcblx0XHRcdFx0XHQndGl0bGUnOiBjYXRlZ29yeS5kZXNjcmlwdGlvblxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmZWF0dXJlZEJhZGdlLFxuXHRcdFx0XHQkKCcubWFpbi1jb250ZW50Jywge30sXG5cdFx0XHRcdFx0dGhpcy5pY29uV2lkZ2V0Rm9yKGNhdGVnb3J5KSxcblx0XHRcdFx0XHR0aXRsZUNvbnRlbnQsXG5cdFx0XHRcdFx0cmVuZGVyTmV3QmFkZ2UgPyBuZXdCYWRnZSA6ICQoJy5uby1iYWRnZScpLFxuXHRcdFx0XHRcdCQoJ2EuY29kaWNvbi5jb2RpY29uLWNsb3NlLmhpZGUtY2F0ZWdvcnktYnV0dG9uJywge1xuXHRcdFx0XHRcdFx0J3RhYmluZGV4JzogMCxcblx0XHRcdFx0XHRcdCd4LWRpc3BhdGNoJzogJ2hpZGVDYXRlZ29yeTonICsgY2F0ZWdvcnkuaWQsXG5cdFx0XHRcdFx0XHQndGl0bGUnOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkhpZGVcIiksXG5cdFx0XHRcdFx0XHQncm9sZSc6ICdidXR0b24nLFxuXHRcdFx0XHRcdFx0J2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnY2xvc2VBcmlhTGFiZWwnLCBcIkhpZGVcIiksXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uQ29udGVudCxcblx0XHRcdFx0JCgnLmNhdGVnb3J5LXByb2dyZXNzJywgeyAneC1kYXRhLWNhdGVnb3J5LWlkJzogY2F0ZWdvcnkuaWQsIH0sXG5cdFx0XHRcdFx0JCgnLnByb2dyZXNzLWJhci1vdXRlcicsIHsgJ3JvbGUnOiAncHJvZ3Jlc3NiYXInIH0sXG5cdFx0XHRcdFx0XHQkKCcucHJvZ3Jlc3MtYmFyLWlubmVyJykpKSk7XG5cdFx0fTtcblxuXG5cblx0XHRjb25zdCByYW5rV2Fsa3Rocm91Z2ggPSAoZTogSVJlc29sdmVkV2Fsa3Rocm91Z2gpID0+IHtcblx0XHRcdGxldCByYW5rOiBudW1iZXIgfCBudWxsID0gZS5vcmRlcjtcblxuXHRcdFx0aWYgKGUuaXNGZWF0dXJlZCkgeyByYW5rICs9IDc7IH1cblx0XHRcdGlmIChlLm5ld0VudHJ5KSB7IHJhbmsgKz0gMzsgfVxuXHRcdFx0aWYgKGUubmV3SXRlbXMpIHsgcmFuayArPSAyOyB9XG5cdFx0XHRpZiAoZS5yZWNlbmN5Qm9udXMpIHsgcmFuayArPSA0ICogZS5yZWNlbmN5Qm9udXM7IH1cblxuXHRcdFx0aWYgKHRoaXMuZ2V0SGlkZGVuQ2F0ZWdvcmllcygpLmhhcyhlLmlkKSkgeyByYW5rID0gbnVsbDsgfVxuXHRcdFx0cmV0dXJuIHJhbms7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkTGlzdCA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRMaXN0LnZhbHVlID0gbmV3IEdldHRpbmdTdGFydGVkSW5kZXhMaXN0KFxuXHRcdFx0e1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dhbGt0aHJvdWdocycsIFwiV2Fsa3Rocm91Z2hzXCIpLFxuXHRcdFx0XHRrbGFzczogJ2dldHRpbmctc3RhcnRlZCcsXG5cdFx0XHRcdGxpbWl0OiA1LFxuXHRcdFx0XHRmb290ZXI6ICQoJ3NwYW4uYnV0dG9uLWxpbmsuc2VlLWFsbC13YWxrdGhyb3VnaHMnLCB7ICd4LWRpc3BhdGNoJzogJ3NlZUFsbFdhbGt0aHJvdWdocycsICd0YWJpbmRleCc6IDAgfSwgbG9jYWxpemUoJ3Nob3dBbGwnLCBcIk1vcmUuLi5cIikpLFxuXHRcdFx0XHRyZW5kZXJFbGVtZW50OiByZW5kZXJHZXR0dGluZ1N0YXJlZFdhbGt0aHJvdWdoLFxuXHRcdFx0XHRyYW5rRWxlbWVudDogcmFua1dhbGt0aHJvdWdoLFxuXHRcdFx0XHRjb250ZXh0U2VydmljZTogdGhpcy5jb250ZXh0U2VydmljZSxcblx0XHRcdH0pO1xuXG5cdFx0Z2V0dGluZ1N0YXJ0ZWRMaXN0Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IGhpZGRlbiA9IHRoaXMuZ2V0SGlkZGVuQ2F0ZWdvcmllcygpO1xuXHRcdFx0Y29uc3Qgc29tZVdhbGt0aHJvdWdoc0hpZGRlbiA9IGhpZGRlbi5zaXplIHx8IGdldHRpbmdTdGFydGVkTGlzdC5pdGVtQ291bnQgPCB0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5maWx0ZXIoYyA9PiB0aGlzLmNvbnRleHRTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoYy53aGVuKSkubGVuZ3RoO1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc29tZVdhbGt0aHJvdWdoc0hpZGRlbicsICEhc29tZVdhbGt0aHJvdWdoc0hpZGRlbik7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyRGlzcGF0Y2hMaXN0ZW5lcnMoKTtcblx0XHRcdGFsbFdhbGt0aHJvdWdoc0hpZGRlbkNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dFNlcnZpY2UpLnNldChnZXR0aW5nU3RhcnRlZExpc3QuaXRlbUNvdW50ID09PSAwKTtcblx0XHRcdHRoaXMudXBkYXRlQ2F0ZWdvcnlQcm9ncmVzcygpO1xuXHRcdH0pO1xuXG5cdFx0Z2V0dGluZ1N0YXJ0ZWRMaXN0LnNldEVudHJpZXModGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMpO1xuXHRcdGFsbFdhbGt0aHJvdWdoc0hpZGRlbkNvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dFNlcnZpY2UpLnNldChnZXR0aW5nU3RhcnRlZExpc3QuaXRlbUNvdW50ID09PSAwKTtcblxuXHRcdHJldHVybiBnZXR0aW5nU3RhcnRlZExpc3Q7XG5cdH1cblxuXHRsYXlvdXQoc2l6ZTogRGltZW5zaW9uKSB7XG5cdFx0dGhpcy5kZXRhaWxzU2Nyb2xsYmFyLnZhbHVlPy5zY2FuRG9tTm9kZSgpO1xuXG5cdFx0dGhpcy5jYXRlZ29yaWVzUGFnZVNjcm9sbGJhcj8uc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyPy5zY2FuRG9tTm9kZSgpO1xuXG5cdFx0dGhpcy5zdGFydExpc3QudmFsdWU/LmxheW91dChzaXplKTtcblx0XHR0aGlzLmdldHRpbmdTdGFydGVkTGlzdC52YWx1ZT8ubGF5b3V0KHNpemUpO1xuXHRcdHRoaXMucmVjZW50bHlPcGVuZWRMaXN0LnZhbHVlPy5sYXlvdXQoc2l6ZSk7XG5cblx0XHRpZiAodGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRTdGVwICYmIHRoaXMuY3VycmVudE1lZGlhVHlwZSkge1xuXHRcdFx0dGhpcy5tZWRpYURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5idWlsZE1lZGlhQ29tcG9uZW50KHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRTdGVwKTtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dE1hcmtkb3duPy4oKTtcblxuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hlaWdodC1jb25zdHJhaW5lZCcsIHNpemUuaGVpZ2h0IDw9IDYwMCk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnd2lkdGgtY29uc3RyYWluZWQnLCBzaXplLndpZHRoIDw9IDQwMCk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnd2lkdGgtc2VtaS1jb25zdHJhaW5lZCcsIHNpemUud2lkdGggPD0gOTUwKTtcblxuXHRcdHRoaXMuY2F0ZWdvcmllc1BhZ2VTY3JvbGxiYXI/LnNjYW5Eb21Ob2RlKCk7XG5cdFx0dGhpcy5kZXRhaWxzUGFnZVNjcm9sbGJhcj8uc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLmRldGFpbHNTY3JvbGxiYXIudmFsdWU/LnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNhdGVnb3J5UHJvZ3Jlc3MoKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0dGhpcy53aW5kb3cuZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnLmNhdGVnb3J5LXByb2dyZXNzJykuZm9yRWFjaChlbGVtZW50ID0+IHtcblx0XHRcdGNvbnN0IGNhdGVnb3J5SUQgPSBlbGVtZW50LmdldEF0dHJpYnV0ZSgneC1kYXRhLWNhdGVnb3J5LWlkJyk7XG5cdFx0XHRjb25zdCBjYXRlZ29yeSA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRDYXRlZ29yaWVzLmZpbmQoYyA9PiBjLmlkID09PSBjYXRlZ29yeUlEKTtcblx0XHRcdGlmICghY2F0ZWdvcnkpIHsgcmV0dXJuOyB9XG5cblx0XHRcdGNvbnN0IHN0YXRzID0gdGhpcy5nZXRXYWxrdGhyb3VnaENvbXBsZXRpb25TdGF0cyhjYXRlZ29yeSk7XG5cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgYmFyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcucHJvZ3Jlc3MtYmFyLWlubmVyJykpIGFzIEhUTUxEaXZFbGVtZW50O1xuXHRcdFx0YmFyLnNldEF0dHJpYnV0ZSgnYXJpYS12YWx1ZW1pbicsICcwJyk7XG5cdFx0XHRiYXIuc2V0QXR0cmlidXRlKCdhcmlhLXZhbHVlbm93JywgJycgKyBzdGF0cy5zdGVwc0NvbXBsZXRlKTtcblx0XHRcdGJhci5zZXRBdHRyaWJ1dGUoJ2FyaWEtdmFsdWVtYXgnLCAnJyArIHN0YXRzLnN0ZXBzVG90YWwpO1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3MgPSAoc3RhdHMuc3RlcHNDb21wbGV0ZSAvIHN0YXRzLnN0ZXBzVG90YWwpICogMTAwO1xuXHRcdFx0YmFyLnN0eWxlLndpZHRoID0gYCR7cHJvZ3Jlc3N9JWA7XG5cblx0XHRcdChlbGVtZW50LnBhcmVudEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC50b2dnbGUoJ25vLXByb2dyZXNzJywgc3RhdHMuc3RlcHNDb21wbGV0ZSA9PT0gMCk7XG5cblx0XHRcdGlmIChzdGF0cy5zdGVwc1RvdGFsID09PSBzdGF0cy5zdGVwc0NvbXBsZXRlKSB7XG5cdFx0XHRcdGJhci50aXRsZSA9IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5hbGxTdGVwc0NvbXBsZXRlJywgXCJBbGwgezB9IHN0ZXBzIGNvbXBsZXRlIVwiLCBzdGF0cy5zdGVwc0NvbXBsZXRlKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRiYXIudGl0bGUgPSBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc29tZVN0ZXBzQ29tcGxldGUnLCBcInswfSBvZiB7MX0gc3RlcHMgY29tcGxldGVcIiwgc3RhdHMuc3RlcHNDb21wbGV0ZSwgc3RhdHMuc3RlcHNUb3RhbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNjcm9sbFRvQ2F0ZWdvcnkoY2F0ZWdvcnlJRDogc3RyaW5nLCBzdGVwSWQ/OiBzdHJpbmcpIHtcblxuXHRcdGlmICghdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuc29tZShjID0+IGMuaWQgPT09IGNhdGVnb3J5SUQpKSB7XG5cdFx0XHR0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcyA9IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmdldFdhbGt0aHJvdWdocygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG91ckNhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChjID0+IGMuaWQgPT09IGNhdGVnb3J5SUQpO1xuXHRcdGlmICghb3VyQ2F0ZWdvcnkpIHtcblx0XHRcdHRocm93IEVycm9yKCdDb3VsZCBub3QgZmluZCBjYXRlZ29yeSB3aXRoIElEOiAnICsgY2F0ZWdvcnlJRCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pblByb2dyZXNzU2Nyb2xsID0gdGhpcy5pblByb2dyZXNzU2Nyb2xsLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJlc2V0KHRoaXMuc3RlcHNDb250ZW50KTtcblx0XHRcdHRoaXMuZWRpdG9ySW5wdXQuc2VsZWN0ZWRDYXRlZ29yeSA9IGNhdGVnb3J5SUQ7XG5cdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCA9IHN0ZXBJZDtcblx0XHRcdHRoaXMuZWRpdG9ySW5wdXQud2Fsa3Rocm91Z2hQYWdlVGl0bGUgPSBvdXJDYXRlZ29yeS53YWxrdGhyb3VnaFBhZ2VUaXRsZTtcblx0XHRcdHRoaXMuY3VycmVudFdhbGt0aHJvdWdoID0gb3VyQ2F0ZWdvcnk7XG5cdFx0XHR0aGlzLmJ1aWxkQ2F0ZWdvcnlTbGlkZShjYXRlZ29yeUlELCBzdGVwSWQpO1xuXHRcdFx0dGhpcy5zZXRTbGlkZSgnZGV0YWlscycpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBpY29uV2lkZ2V0Rm9yKGNhdGVnb3J5OiBJUmVzb2x2ZWRXYWxrdGhyb3VnaCB8IHsgaWNvbjogeyB0eXBlOiAnaWNvbic7IGljb246IFRoZW1lSWNvbiB9IH0pIHtcblx0XHRjb25zdCB3aWRnZXQgPSBjYXRlZ29yeS5pY29uLnR5cGUgPT09ICdpY29uJyA/ICQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoY2F0ZWdvcnkuaWNvbi5pY29uKSkgOiAkKCdpbWcuY2F0ZWdvcnktaWNvbicsIHsgc3JjOiBjYXRlZ29yeS5pY29uLnBhdGggfSk7XG5cdFx0d2lkZ2V0LmNsYXNzTGlzdC5hZGQoJ2ljb24td2lkZ2V0Jyk7XG5cdFx0cmV0dXJuIHdpZGdldDtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNTaWRlRWRpdG9yR3JvdXAoKSB7XG5cdFx0Y29uc3QgZnVsbFNpemUgPSB0aGlzLmdyb3Vwc1NlcnZpY2UuZ2V0UGFydCh0aGlzLmdyb3VwKS5jb250ZW50RGltZW5zaW9uO1xuXHRcdGlmICghZnVsbFNpemUgfHwgZnVsbFNpemUud2lkdGggPD0gNzAwIHx8IHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnd2lkdGgtY29uc3RyYWluZWQnKSB8fCB0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3dpZHRoLXNlbWktY29uc3RyYWluZWQnKSkgeyByZXR1cm47IH1cblx0XHRpZiAodGhpcy5ncm91cHNTZXJ2aWNlLmNvdW50ID09PSAxKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cFNwbGl0RGlyZWN0aW9uID0gcHJlZmVycmVkU2lkZUJ5U2lkZUdyb3VwRGlyZWN0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgc2lkZUdyb3VwID0gdGhpcy5ncm91cHNTZXJ2aWNlLmFkZEdyb3VwKHRoaXMuZ3JvdXBzU2VydmljZS5ncm91cHNbMF0sIGVkaXRvckdyb3VwU3BsaXREaXJlY3Rpb24pO1xuXHRcdFx0dGhpcy5ncm91cHNTZXJ2aWNlLmFjdGl2YXRlR3JvdXAoc2lkZUdyb3VwKTtcblx0XHR9XG5cblx0XHRjb25zdCBub25HZXR0aW5nU3RhcnRlZEdyb3VwID0gdGhpcy5ncm91cHNTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkuZmluZChncm91cCA9PiAhKGdyb3VwLmFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIEdldHRpbmdTdGFydGVkSW5wdXQpKTtcblx0XHRpZiAobm9uR2V0dGluZ1N0YXJ0ZWRHcm91cCkge1xuXHRcdFx0dGhpcy5ncm91cHNTZXJ2aWNlLmFjdGl2YXRlR3JvdXAobm9uR2V0dGluZ1N0YXJ0ZWRHcm91cCk7XG5cdFx0XHRub25HZXR0aW5nU3RhcnRlZEdyb3VwLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgcnVuU3RlcENvbW1hbmQoaHJlZjogc3RyaW5nKSB7XG5cblx0XHRjb25zdCBpc0NvbW1hbmQgPSBocmVmLnN0YXJ0c1dpdGgoJ2NvbW1hbmQ6Jyk7XG5cdFx0Y29uc3QgdG9TaWRlID0gaHJlZi5zdGFydHNXaXRoKCdjb21tYW5kOnRvU2lkZTonKTtcblx0XHRjb25zdCBjb21tYW5kID0gaHJlZi5yZXBsYWNlKC9jb21tYW5kOih0b1NpZGU6KT8vLCAnY29tbWFuZDonKTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEdldHRpbmdTdGFydGVkQWN0aW9uRXZlbnQsIEdldHRpbmdTdGFydGVkQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdnZXR0aW5nU3RhcnRlZC5BY3Rpb25FeGVjdXRlZCcsIHsgY29tbWFuZDogJ3J1blN0ZXBBY3Rpb24nLCBhcmd1bWVudDogaHJlZiwgd2Fsa3Rocm91Z2hJZDogdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2g/LmlkIH0pO1xuXG5cdFx0aWYgKHRvU2lkZSkge1xuXHRcdFx0dGhpcy5mb2N1c1NpZGVFZGl0b3JHcm91cCgpO1xuXHRcdH1cblx0XHRpZiAoaXNDb21tYW5kKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kVVJJID0gVVJJLnBhcnNlKGNvbW1hbmQpO1xuXG5cdFx0XHQvLyBleGVjdXRlIGFzIGNvbW1hbmRcblx0XHRcdGxldCBhcmdzID0gW107XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhcmdzID0gcGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KGNvbW1hbmRVUkkucXVlcnkpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgYW5kIHJldHJ5XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXJncyA9IHBhcnNlKGNvbW1hbmRVUkkucXVlcnkpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBpZ25vcmUgZXJyb3Jcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGFyZ3MpKSB7XG5cdFx0XHRcdGFyZ3MgPSBbYXJnc107XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGEgc3RlcCBpcyByZXF1ZXN0aW5nIHRoZSBPcGVuRm9sZGVyIGFjdGlvbiB0byBiZSBleGVjdXRlZCBpbiBhbiBlbXB0eSB3b3Jrc3BhY2UuLi5cblx0XHRcdGlmICgoY29tbWFuZFVSSS5wYXRoID09PSBPcGVuRmlsZUZvbGRlckFjdGlvbi5JRC50b1N0cmluZygpIHx8XG5cdFx0XHRcdGNvbW1hbmRVUkkucGF0aCA9PT0gT3BlbkZvbGRlckFjdGlvbi5JRC50b1N0cmluZygpKSAmJlxuXHRcdFx0XHR0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRTdGVwSW5kZXggPSB0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaD8uc3RlcHMuZmluZEluZGV4KHN0ZXAgPT4gc3RlcC5pZCA9PT0gdGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRTdGVwKTtcblxuXHRcdFx0XHQvLyBhbmQgdGhlcmUgYXJlIGEgZmV3IG1vcmUgc3RlcHMgYWZ0ZXIgdGhpcyBzdGVwIHdoaWNoIGFyZSB5ZXQgdG8gYmUgY29tcGxldGVkLi4uXG5cdFx0XHRcdGlmIChzZWxlY3RlZFN0ZXBJbmRleCAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHRcdFx0c2VsZWN0ZWRTdGVwSW5kZXggPiAtMSAmJlxuXHRcdFx0XHRcdHRoaXMuY3VycmVudFdhbGt0aHJvdWdoPy5zdGVwcy5zbGljZShzZWxlY3RlZFN0ZXBJbmRleCArIDEpLnNvbWUoc3RlcCA9PiAhc3RlcC5kb25lKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3RvcmVEYXRhOiBSZXN0b3JlV2Fsa3Rocm91Z2hzQ29uZmlndXJhdGlvblZhbHVlID0geyBmb2xkZXI6IFVOS05PV05fRU1QVFlfV0lORE9XX1dPUktTUEFDRS5pZCwgY2F0ZWdvcnk6IHRoaXMuZWRpdG9ySW5wdXQ/LnNlbGVjdGVkQ2F0ZWdvcnksIHN0ZXA6IHRoaXMuZWRpdG9ySW5wdXQ/LnNlbGVjdGVkU3RlcCB9O1xuXG5cdFx0XHRcdFx0Ly8gc2F2ZSBzdGF0ZSB0byByZXN0b3JlIGFmdGVyIHJlbG9hZFxuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHRcdFx0XHRyZXN0b3JlV2Fsa3Rocm91Z2hzQ29uZmlndXJhdGlvbktleSxcblx0XHRcdFx0XHRcdEpTT04uc3RyaW5naWZ5KHJlc3RvcmVEYXRhKSxcblx0XHRcdFx0XHRcdFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZFVSSS5wYXRoLCAuLi5hcmdzKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdGNvbnN0IHRvT3BlbiA9IChyZXN1bHQgYXMgeyBvcGVuRm9sZGVyPzogVVJJIH0pPy5vcGVuRm9sZGVyO1xuXHRcdFx0XHRpZiAodG9PcGVuKSB7XG5cdFx0XHRcdFx0aWYgKCFVUkkuaXNVcmkodG9PcGVuKSkge1xuXHRcdFx0XHRcdFx0Y29uc29sZS53YXJuKCdXYXJuOiBSdW5uaW5nIHdhbGt0aHJvdWdoIGNvbW1hbmQnLCBocmVmLCAneWllbGRlZCBub24tVVJJIGBvcGVuRm9sZGVyYCByZXN1bHQnLCB0b09wZW4sICcuIEl0IHdpbGwgYmUgZGlzcmVnYXJkZWQuJyk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlc3RvcmVEYXRhOiBSZXN0b3JlV2Fsa3Rocm91Z2hzQ29uZmlndXJhdGlvblZhbHVlID0geyBmb2xkZXI6IHRvT3Blbi50b1N0cmluZygpLCBjYXRlZ29yeTogdGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRDYXRlZ29yeSwgc3RlcDogdGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRTdGVwIH07XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0XHRcdHJlc3RvcmVXYWxrdGhyb3VnaHNDb25maWd1cmF0aW9uS2V5LFxuXHRcdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkocmVzdG9yZURhdGEpLFxuXHRcdFx0XHRcdFx0U3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdFx0dGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IGZvbGRlclVyaTogdG9PcGVuIH1dKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGNvbW1hbmQsIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRpZiAoIWlzQ29tbWFuZCAmJiAoaHJlZi5zdGFydHNXaXRoKCdodHRwczovLycpIHx8IGhyZWYuc3RhcnRzV2l0aCgnaHR0cDovLycpKSkge1xuXHRcdFx0dGhpcy5nZXR0aW5nU3RhcnRlZFNlcnZpY2UucHJvZ3Jlc3NCeUV2ZW50KCdvbkxpbms6JyArIGhyZWYpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYnVpbGRNYXJrZG93bkRlc2NyaXB0aW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRleHQ6IExpbmtlZFRleHRbXSkge1xuXHRcdHdoaWxlIChjb250YWluZXIuZmlyc3RDaGlsZCkgeyBjb250YWluZXIuZmlyc3RDaGlsZC5yZW1vdmUoKTsgfVxuXG5cdFx0Zm9yIChjb25zdCBsaW5rZWRUZXh0IG9mIHRleHQpIHtcblx0XHRcdGlmIChsaW5rZWRUZXh0Lm5vZGVzLmxlbmd0aCA9PT0gMSAmJiB0eXBlb2YgbGlua2VkVGV4dC5ub2Rlc1swXSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3Qgbm9kZSA9IGxpbmtlZFRleHQubm9kZXNbMF07XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5idXR0b24tY29udGFpbmVyJykpO1xuXHRcdFx0XHRjb25zdCBidXR0b24gPSBuZXcgQnV0dG9uKGJ1dHRvbkNvbnRhaW5lciwgeyB0aXRsZTogbm9kZS50aXRsZSwgc3VwcG9ydEljb25zOiB0cnVlLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pO1xuXG5cdFx0XHRcdGNvbnN0IGlzQ29tbWFuZCA9IG5vZGUuaHJlZi5zdGFydHNXaXRoKCdjb21tYW5kOicpO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kID0gbm9kZS5ocmVmLnJlcGxhY2UoL2NvbW1hbmQ6KHRvU2lkZTopPy8sICdjb21tYW5kOicpO1xuXG5cdFx0XHRcdGJ1dHRvbi5sYWJlbCA9IG5vZGUubGFiZWw7XG5cdFx0XHRcdGJ1dHRvbi5vbkRpZENsaWNrKGUgPT4ge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMucnVuU3RlcENvbW1hbmQobm9kZS5ocmVmKTtcblx0XHRcdFx0fSwgbnVsbCwgdGhpcy5kZXRhaWxzUGFnZURpc3Bvc2FibGVzKTtcblxuXHRcdFx0XHRpZiAoaXNDb21tYW5kKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMuZ2V0S2V5QmluZGluZyhjb21tYW5kKTtcblx0XHRcdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2hvcnRjdXRNZXNzYWdlID0gJCgnc3Bhbi5zaG9ydGN1dC1tZXNzYWdlJywge30sIGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5rZXlib2FyZFRpcCcsICdUaXA6IFVzZSBrZXlib2FyZCBzaG9ydGN1dCAnKSk7XG5cdFx0XHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2hvcnRjdXRNZXNzYWdlKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gbmV3IEtleWJpbmRpbmdMYWJlbChzaG9ydGN1dE1lc3NhZ2UsIE9TLCB7IC4uLmRlZmF1bHRLZXliaW5kaW5nTGFiZWxTdHlsZXMgfSk7XG5cdFx0XHRcdFx0XHRsYWJlbC5zZXQoa2V5YmluZGluZyk7XG5cdFx0XHRcdFx0XHR0aGlzLmRldGFpbHNQYWdlRGlzcG9zYWJsZXMuYWRkKGxhYmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmRldGFpbHNQYWdlRGlzcG9zYWJsZXMuYWRkKGJ1dHRvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwID0gYXBwZW5kKGNvbnRhaW5lciwgJCgncCcpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGxpbmtlZFRleHQubm9kZXMpIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIG5vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYWJlbFdpdGhJY29uID0gcmVuZGVyTGFiZWxXaXRoSWNvbnMobm9kZSk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgbGFiZWxXaXRoSWNvbikge1xuXHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdFx0cC5hcHBlbmRDaGlsZChyZW5kZXJGb3JtYXR0ZWRUZXh0KGVsZW1lbnQsIHsgcmVuZGVyQ29kZVNlZ21lbnRzOiB0cnVlIH0sICQoJ3NwYW4nKSkpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHAuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm9kZVdpdGhUaXRsZTogSUxpbmsgPSBtYXRjaGVzU2NoZW1lKG5vZGUuaHJlZiwgU2NoZW1hcy5odHRwKSB8fCBtYXRjaGVzU2NoZW1lKG5vZGUuaHJlZiwgU2NoZW1hcy5odHRwcykgPyB7IC4uLm5vZGUsIHRpdGxlOiBub2RlLmhyZWYgfSA6IG5vZGU7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaW5rLCBwLCBub2RlV2l0aFRpdGxlLCB7IG9wZW5lcjogKGhyZWYpID0+IHRoaXMucnVuU3RlcENvbW1hbmQoaHJlZikgfSk7XG5cdFx0XHRcdFx0XHR0aGlzLmRldGFpbHNQYWdlRGlzcG9zYWJsZXMuYWRkKGxpbmspO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpIHtcblx0XHR0aGlzLnN0ZXBEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRDYXRlZ29yeVNsaWRlKGNhdGVnb3J5SUQ6IHN0cmluZywgc2VsZWN0ZWRTdGVwPzogc3RyaW5nLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbikge1xuXHRcdGlmICghdGhpcy5lZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Ly8gUmVtb3ZlIGludGVybmFsIGV4dGVuc2lvbiBpZCBzcGVjaWZpZXIgZnJvbSBleHBvc2VkIGlkJ3Ncblx0XHRcdHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uV2Fsa3Rocm91Z2g6JHtjYXRlZ29yeUlELnJlcGxhY2UoL1teI10rIy8sICcnKX1gKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuZGV0YWlsc1BhZ2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMubWVkaWFEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgY2F0ZWdvcnkgPSB0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5maW5kKGNhdGVnb3J5ID0+IGNhdGVnb3J5LmlkID09PSBjYXRlZ29yeUlEKTtcblx0XHRpZiAoIWNhdGVnb3J5KSB7XG5cdFx0XHR0aHJvdyBFcnJvcignY291bGQgbm90IGZpbmQgY2F0ZWdvcnkgd2l0aCBJRCAnICsgY2F0ZWdvcnlJRCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb25Db250YWluZXIgPSAkKCcuY2F0ZWdvcnktZGVzY3JpcHRpb24uZGVzY3JpcHRpb24ubWF4LWxpbmVzLTMnLCB7ICd4LWNhdGVnb3J5LWRlc2NyaXB0aW9uLWZvcic6IGNhdGVnb3J5LmlkIH0pO1xuXHRcdHRoaXMuYnVpbGRNYXJrZG93bkRlc2NyaXB0aW9uKGRlc2NyaXB0aW9uQ29udGFpbmVyLCBwYXJzZURlc2NyaXB0aW9uKGNhdGVnb3J5LmRlc2NyaXB0aW9uKSk7XG5cblx0XHRjb25zdCBjYXRlZ29yeURlc2NyaXB0b3JDb21wb25lbnQgPVxuXHRcdFx0JCgnLmdldHRpbmctc3RhcnRlZC1jYXRlZ29yeScsXG5cdFx0XHRcdHt9LFxuXHRcdFx0XHQkKCcuY2F0ZWdvcnktZGVzY3JpcHRpb24tY29udGFpbmVyJywge30sXG5cdFx0XHRcdFx0JCgnaDIuY2F0ZWdvcnktdGl0bGUubWF4LWxpbmVzLTMnLCB7ICd4LWNhdGVnb3J5LXRpdGxlLWZvcic6IGNhdGVnb3J5LmlkIH0sIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGNhdGVnb3J5LnRpdGxlKSksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25Db250YWluZXIpKTtcblxuXHRcdGNvbnN0IHN0ZXBMaXN0Q29udGFpbmVyID0gJCgnLnN0ZXAtbGlzdC1jb250YWluZXInKTtcblxuXHRcdHRoaXMuZGV0YWlsc1BhZ2VEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHN0ZXBMaXN0Q29udGFpbmVyLCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRjb25zdCBjdXJyZW50U3RlcEluZGV4ID0gKCkgPT5cblx0XHRcdFx0Y2F0ZWdvcnkuc3RlcHMuZmluZEluZGV4KGUgPT4gZS5pZCA9PT0gdGhpcy5lZGl0b3JJbnB1dD8uc2VsZWN0ZWRTdGVwKTtcblxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdykge1xuXHRcdFx0XHRjb25zdCB0b0V4cGFuZCA9IGNhdGVnb3J5LnN0ZXBzLmZpbHRlcigoc3RlcCwgaW5kZXgpID0+IGluZGV4IDwgY3VycmVudFN0ZXBJbmRleCgpICYmIHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhzdGVwLndoZW4pKTtcblx0XHRcdFx0aWYgKHRvRXhwYW5kLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0U3RlcCh0b0V4cGFuZFt0b0V4cGFuZC5sZW5ndGggLSAxXS5pZCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cpIHtcblx0XHRcdFx0Y29uc3QgdG9FeHBhbmQgPSBjYXRlZ29yeS5zdGVwcy5maW5kKChzdGVwLCBpbmRleCkgPT4gaW5kZXggPiBjdXJyZW50U3RlcEluZGV4KCkgJiYgdGhpcy5jb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHN0ZXAud2hlbikpO1xuXHRcdFx0XHRpZiAodG9FeHBhbmQpIHtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdFN0ZXAodG9FeHBhbmQuaWQsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCByZW5kZXJlZFN0ZXBzOiBJUmVzb2x2ZWRXYWxrdGhyb3VnaFN0ZXBbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGNvbnRleHRLZXlzVG9XYXRjaCA9IG5ldyBTZXQoY2F0ZWdvcnkuc3RlcHMuZmxhdE1hcChzdGVwID0+IHN0ZXAud2hlbi5rZXlzKCkpKTtcblxuXHRcdGNvbnN0IGJ1aWxkU3RlcExpc3QgPSAoKSA9PiB7XG5cblx0XHRcdGNhdGVnb3J5LnN0ZXBzLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKTtcblx0XHRcdGNvbnN0IHRvUmVuZGVyID0gY2F0ZWdvcnkuc3RlcHNcblx0XHRcdFx0LmZpbHRlcihzdGVwID0+IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhzdGVwLndoZW4pKTtcblxuXHRcdFx0aWYgKGVxdWFscyhyZW5kZXJlZFN0ZXBzLCB0b1JlbmRlciwgKGEsIGIpID0+IGEuaWQgPT09IGIuaWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmVuZGVyZWRTdGVwcyA9IHRvUmVuZGVyO1xuXG5cdFx0XHRyZXNldChzdGVwTGlzdENvbnRhaW5lciwgLi4ucmVuZGVyZWRTdGVwc1xuXHRcdFx0XHQubWFwKHN0ZXAgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvZGljb24gPSAkKCcuY29kaWNvbicgKyAoc3RlcC5kb25lID8gJy5jb21wbGV0ZScgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihnZXR0aW5nU3RhcnRlZENoZWNrZWRDb2RpY29uKSA6IFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGdldHRpbmdTdGFydGVkVW5jaGVja2VkQ29kaWNvbikpLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQnZGF0YS1kb25lLXN0ZXAtaWQnOiBzdGVwLmlkLFxuXHRcdFx0XHRcdFx0XHQneC1kaXNwYXRjaCc6ICd0b2dnbGVTdGVwQ29tcGxldGlvbjonICsgc3RlcC5pZCxcblx0XHRcdFx0XHRcdFx0J3JvbGUnOiAnY2hlY2tib3gnLFxuXHRcdFx0XHRcdFx0XHQnYXJpYS1jaGVja2VkJzogc3RlcC5kb25lID8gJ3RydWUnIDogJ2ZhbHNlJyxcblx0XHRcdFx0XHRcdFx0J2FyaWEtbGFiZWwnOiBzdGVwLmRvbmVcblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzdGVwRG9uZScsIFwiezB9OiBDb21wbGV0ZWRcIiwgc3RlcC50aXRsZSlcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdzdGVwTm90RG9uZScsIFwiezB9OiBOb3QgY29tcGxldGVkXCIsIHN0ZXAudGl0bGUpLFxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuc3RlcC1kZXNjcmlwdGlvbi1jb250YWluZXInLCB7ICd4LXN0ZXAtZGVzY3JpcHRpb24tZm9yJzogc3RlcC5pZCB9KTtcblx0XHRcdFx0XHR0aGlzLmJ1aWxkTWFya2Rvd25EZXNjcmlwdGlvbihjb250YWluZXIsIHN0ZXAuZGVzY3JpcHRpb24pO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3RlcFRpdGxlID0gJCgnaDMuc3RlcC10aXRsZS5tYXgtbGluZXMtMycsIHsgJ3gtc3RlcC10aXRsZS1mb3InOiBzdGVwLmlkIH0pO1xuXHRcdFx0XHRcdHJlc2V0KHN0ZXBUaXRsZSwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoc3RlcC50aXRsZSkpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3RlcERlc2NyaXB0aW9uID0gJCgnLnN0ZXAtY29udGFpbmVyJywge30sXG5cdFx0XHRcdFx0XHRzdGVwVGl0bGUsXG5cdFx0XHRcdFx0XHRjb250YWluZXIsXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGlmIChzdGVwLm1lZGlhLnR5cGUgPT09ICdpbWFnZScpIHtcblx0XHRcdFx0XHRcdHN0ZXBEZXNjcmlwdGlvbi5hcHBlbmRDaGlsZChcblx0XHRcdFx0XHRcdFx0JCgnLmltYWdlLWRlc2NyaXB0aW9uJywgeyAnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdpbWFnZVNob3dpbmcnLCBcIkltYWdlIHNob3dpbmcgezB9XCIsIHN0ZXAubWVkaWEuYWx0VGV4dCkgfSksXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RlcC5tZWRpYS50eXBlID09PSAndmlkZW8nKSB7XG5cdFx0XHRcdFx0XHRzdGVwRGVzY3JpcHRpb24uYXBwZW5kQ2hpbGQoXG5cdFx0XHRcdFx0XHRcdCQoJy52aWRlby1kZXNjcmlwdGlvbicsIHsgJ2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgndmlkZW9TaG93aW5nJywgXCJWaWRlbyBzaG93aW5nIHswfVwiLCBzdGVwLm1lZGlhLmFsdFRleHQpIH0pLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gJCgnYnV0dG9uLmdldHRpbmctc3RhcnRlZC1zdGVwJyxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0J3gtZGlzcGF0Y2gnOiAnc2VsZWN0VGFzazonICsgc3RlcC5pZCxcblx0XHRcdFx0XHRcdFx0J2RhdGEtc3RlcC1pZCc6IHN0ZXAuaWQsXG5cdFx0XHRcdFx0XHRcdCdhcmlhLWV4cGFuZGVkJzogJ2ZhbHNlJyxcblx0XHRcdFx0XHRcdFx0J2FyaWEtY2hlY2tlZCc6IHN0ZXAuZG9uZSA/ICd0cnVlJyA6ICdmYWxzZScsXG5cdFx0XHRcdFx0XHRcdCdyb2xlJzogJ2J1dHRvbicsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y29kaWNvbixcblx0XHRcdFx0XHRcdHN0ZXBEZXNjcmlwdGlvbik7XG5cdFx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0YnVpbGRTdGVwTGlzdCgpO1xuXG5cdFx0dGhpcy5kZXRhaWxzUGFnZURpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKGNvbnRleHRLZXlzVG9XYXRjaCkgJiYgdGhpcy5jdXJyZW50V2Fsa3Rocm91Z2ggJiYgdGhpcy5lZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRidWlsZFN0ZXBMaXN0KCk7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJEaXNwYXRjaExpc3RlbmVycygpO1xuXHRcdFx0XHR0aGlzLnNlbGVjdFN0ZXAodGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZFN0ZXAsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzaG93TmV4dENhdGVnb3J5ID0gdGhpcy5nZXR0aW5nU3RhcnRlZENhdGVnb3JpZXMuZmluZChfY2F0ZWdvcnkgPT4gX2NhdGVnb3J5LmlkID09PSBjYXRlZ29yeS5uZXh0KTtcblxuXHRcdGNvbnN0IHN0ZXBzQ29udGFpbmVyID0gJChcblx0XHRcdCcuZ2V0dGluZy1zdGFydGVkLWRldGFpbC1jb250YWluZXInLCB7ICdyb2xlJzogJ2xpc3QnIH0sXG5cdFx0XHRzdGVwTGlzdENvbnRhaW5lcixcblx0XHRcdCQoJy5kb25lLW5leHQtY29udGFpbmVyJywge30sXG5cdFx0XHRcdCQoJ2J1dHRvbi5idXR0b24tbGluay5hbGwtZG9uZScsIHsgJ3gtZGlzcGF0Y2gnOiAnYWxsRG9uZScgfSwgJCgnc3Bhbi5jb2RpY29uLmNvZGljb24tY2hlY2stYWxsJyksIGxvY2FsaXplKCdhbGxEb25lJywgXCJNYXJrIERvbmVcIikpLFxuXHRcdFx0XHQuLi4oc2hvd05leHRDYXRlZ29yeVxuXHRcdFx0XHRcdD8gWyQoJ2J1dHRvbi5idXR0b24tbGluay5uZXh0JywgeyAneC1kaXNwYXRjaCc6ICduZXh0U2VjdGlvbicgfSwgbG9jYWxpemUoJ25leHRPbmUnLCBcIk5leHQgU2VjdGlvblwiKSwgJCgnc3Bhbi5jb2RpY29uLmNvZGljb24tYXJyb3ctcmlnaHQnKSldXG5cdFx0XHRcdFx0OiBbXSksXG5cdFx0XHQpXG5cdFx0KTtcblx0XHR0aGlzLmRldGFpbHNTY3JvbGxiYXIudmFsdWUgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoc3RlcHNDb250YWluZXIsIHsgY2xhc3NOYW1lOiAnc3RlcHMtY29udGFpbmVyJyB9KTtcblx0XHRjb25zdCBzdGVwTGlzdENvbXBvbmVudCA9IHRoaXMuZGV0YWlsc1Njcm9sbGJhci52YWx1ZS5nZXREb21Ob2RlKCk7XG5cblx0XHRjb25zdCBjYXRlZ29yeUZvb3RlciA9ICQoJy5nZXR0aW5nLXN0YXJ0ZWQtZm9vdGVyJyk7XG5cdFx0aWYgKHRoaXMuZWRpdG9ySW5wdXQuc2hvd1RlbGVtZXRyeU5vdGljZSAmJiBnZXRUZWxlbWV0cnlMZXZlbCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSAhPT0gVGVsZW1ldHJ5TGV2ZWwuTk9ORSAmJiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmVuYWJsZVRlbGVtZXRyeSkge1xuXHRcdFx0dGhpcy5idWlsZFRlbGVtZXRyeUZvb3RlcihjYXRlZ29yeUZvb3Rlcik7XG5cdFx0fVxuXG5cdFx0cmVzZXQodGhpcy5zdGVwc0NvbnRlbnQsIGNhdGVnb3J5RGVzY3JpcHRvckNvbXBvbmVudCwgc3RlcExpc3RDb21wb25lbnQsIHRoaXMuc3RlcE1lZGlhQ29tcG9uZW50LCBjYXRlZ29yeUZvb3Rlcik7XG5cblx0XHRjb25zdCB0b0V4cGFuZCA9IGNhdGVnb3J5LnN0ZXBzLmZpbmQoc3RlcCA9PiB0aGlzLmNvbnRleHRTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoc3RlcC53aGVuKSAmJiAhc3RlcC5kb25lKSA/PyBjYXRlZ29yeS5zdGVwc1swXTtcblx0XHR0aGlzLnNlbGVjdFN0ZXAoc2VsZWN0ZWRTdGVwID8/IHRvRXhwYW5kLmlkLCAhc2VsZWN0ZWRTdGVwLCBwcmVzZXJ2ZUZvY3VzKTtcblxuXHRcdHRoaXMuZGV0YWlsc1Njcm9sbGJhci52YWx1ZT8uc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLmRldGFpbHNQYWdlU2Nyb2xsYmFyPy5zY2FuRG9tTm9kZSgpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckRpc3BhdGNoTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkVGVsZW1ldHJ5Rm9vdGVyKHBhcmVudDogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBwcml2YWN5U3RhdGVtZW50Q29weSA9IGxvY2FsaXplKCdwcml2YWN5IHN0YXRlbWVudCcsIFwicHJpdmFjeSBzdGF0ZW1lbnRcIik7XG5cdFx0Y29uc3QgcHJpdmFjeVN0YXRlbWVudEJ1dHRvbiA9IGBbJHtwcml2YWN5U3RhdGVtZW50Q29weX1dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuUHJpdmFjeVN0YXRlbWVudFVybClgO1xuXG5cdFx0Y29uc3Qgb3B0T3V0Q29weSA9IGxvY2FsaXplKCdvcHRPdXQnLCBcIm9wdCBvdXRcIik7XG5cdFx0Y29uc3Qgb3B0T3V0QnV0dG9uID0gYFske29wdE91dENvcHl9XShjb21tYW5kOnNldHRpbmdzLmZpbHRlckJ5VGVsZW1ldHJ5KWA7XG5cblx0XHRjb25zdCB0ZXh0ID0gbG9jYWxpemUoeyBrZXk6ICdmb290ZXInLCBjb21tZW50OiBbJ2Zpc3Qgc3Vic3RpdHV0aW9uIGlzIFwidnMgY29kZVwiLCBzZWNvbmQgaXMgXCJwcml2YWN5IHN0YXRlbWVudFwiLCB0aGlyZCBpcyBcIm9wdCBvdXRcIi4nXSB9LFxuXHRcdFx0XCJ7MH0gY29sbGVjdHMgdXNhZ2UgZGF0YS4gUmVhZCBvdXIgezF9IGFuZCBsZWFybiBob3cgdG8gezJ9LlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCwgcHJpdmFjeVN0YXRlbWVudEJ1dHRvbiwgb3B0T3V0QnV0dG9uKTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkQ29udGVudHMgPSB0aGlzLmRldGFpbHNQYWdlRGlzcG9zYWJsZXMuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKHsgdmFsdWU6IHRleHQsIGlzVHJ1c3RlZDogdHJ1ZSB9KSk7XG5cdFx0cGFyZW50LmFwcGVuZChyZW5kZXJlZENvbnRlbnRzLmVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXliaW5kaW5nTGFiZWwoY29tbWFuZDogc3RyaW5nKSB7XG5cdFx0Y29tbWFuZCA9IGNvbW1hbmQucmVwbGFjZSgvXmNvbW1hbmQ6LywgJycpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmQpPy5nZXRMYWJlbCgpO1xuXHRcdGlmICghbGFiZWwpIHsgcmV0dXJuICcnOyB9XG5cdFx0ZWxzZSB7XG5cdFx0XHRyZXR1cm4gYCgke2xhYmVsfSlgO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0S2V5QmluZGluZyhjb21tYW5kOiBzdHJpbmcpIHtcblx0XHRjb21tYW5kID0gY29tbWFuZC5yZXBsYWNlKC9eY29tbWFuZDovLCAnJyk7XG5cdFx0cmV0dXJuIHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjb21tYW5kKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2Nyb2xsUHJldigpIHtcblx0XHR0aGlzLmluUHJvZ3Jlc3NTY3JvbGwgPSB0aGlzLmluUHJvZ3Jlc3NTY3JvbGwudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5wcmV2V2Fsa3Rocm91Z2ggJiYgdGhpcy5wcmV2V2Fsa3Rocm91Z2ggIT09IHRoaXMuY3VycmVudFdhbGt0aHJvdWdoKSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudFdhbGt0aHJvdWdoID0gdGhpcy5wcmV2V2Fsa3Rocm91Z2g7XG5cdFx0XHRcdHRoaXMucHJldldhbGt0aHJvdWdoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLm1ha2VDYXRlZ29yeVZpc2libGVXaGVuQXZhaWxhYmxlKHRoaXMuY3VycmVudFdhbGt0aHJvdWdoLmlkKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5lZGl0b3JJbnB1dD8ucmV0dXJuVG9Db21tYW5kKSB7XG5cdFx0XHRcdC8vIEV4ZWN1dGUgdGhlIHNwZWNpZmllZCBjb21tYW5kIHRvIHJldHVybiB0byB0aGUgb3JpZ2luIHBhZ2Vcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh0aGlzLmVkaXRvcklucHV0LnJldHVyblRvQ29tbWFuZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRXYWxrdGhyb3VnaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRoaXMuZWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0XHR0aGlzLmVkaXRvcklucHV0LnNlbGVjdGVkQ2F0ZWdvcnkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JJbnB1dC5zZWxlY3RlZFN0ZXAgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JJbnB1dC5zaG93VGVsZW1ldHJ5Tm90aWNlID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JJbnB1dC53YWxrdGhyb3VnaFBhZ2VUaXRsZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmdldHRpbmdTdGFydGVkQ2F0ZWdvcmllcy5sZW5ndGggIT09IHRoaXMuZ2V0dGluZ1N0YXJ0ZWRMaXN0LnZhbHVlPy5pdGVtQ291bnQpIHtcblx0XHRcdFx0XHQvLyBleHRlbnNpb25zIG1heSBoYXZlIGNoYW5nZWQgaW4gdGhlIHRpbWUgc2luY2Ugd2UgbGFzdCBkaXNwbGF5ZWQgdGhlIHdhbGt0aHJvdWdoIGxpc3Rcblx0XHRcdFx0XHQvLyByZWJ1aWxkIHRoZSBsaXN0XG5cdFx0XHRcdFx0dGhpcy5idWlsZENhdGVnb3JpZXNTbGlkZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5zZWxlY3RTdGVwKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuc2V0U2xpZGUoJ2NhdGVnb3JpZXMnKTtcblx0XHRcdFx0dGhpcy5jb250YWluZXIuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcnVuU2tpcCgpIHtcblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNsb3NlQWN0aXZlRWRpdG9yJyk7XG5cdH1cblxuXHRlc2NhcGUoKSB7XG5cdFx0aWYgKHRoaXMuZWRpdG9ySW5wdXQ/LnNlbGVjdGVkQ2F0ZWdvcnkpIHtcblx0XHRcdHRoaXMuc2Nyb2xsUHJldigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJ1blNraXAoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldFNsaWRlKHRvRW5hYmxlOiAnZGV0YWlscycgfCAnY2F0ZWdvcmllcycsIGZpcnN0TGF1bmNoOiBib29sZWFuID0gZmFsc2UpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzbGlkZU1hbmFnZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZ2V0dGluZ1N0YXJ0ZWQnKSk7XG5cdFx0aWYgKHRvRW5hYmxlID09PSAnY2F0ZWdvcmllcycpIHtcblx0XHRcdHNsaWRlTWFuYWdlci5jbGFzc0xpc3QucmVtb3ZlKCdzaG93RGV0YWlscycpO1xuXHRcdFx0c2xpZGVNYW5hZ2VyLmNsYXNzTGlzdC5hZGQoJ3Nob3dDYXRlZ29yaWVzJyk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdHRoaXMuY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcucHJldi1idXR0b24uYnV0dG9uLWxpbmsnKSEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmdldHRpbmdTdGFydGVkU2xpZGVEZXRhaWxzJykhLnF1ZXJ5U2VsZWN0b3JBbGwoJ2J1dHRvbicpLmZvckVhY2goYnV0dG9uID0+IGJ1dHRvbi5kaXNhYmxlZCA9IHRydWUpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZUNhdGVnb3JpZXMnKSEucXVlcnlTZWxlY3RvckFsbCgnYnV0dG9uJykuZm9yRWFjaChidXR0b24gPT4gYnV0dG9uLmRpc2FibGVkID0gZmFsc2UpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZUNhdGVnb3JpZXMnKSEucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQnKS5mb3JFYWNoKGJ1dHRvbiA9PiBidXR0b24uZGlzYWJsZWQgPSBmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNsaWRlTWFuYWdlci5jbGFzc0xpc3QuYWRkKCdzaG93RGV0YWlscycpO1xuXHRcdFx0c2xpZGVNYW5hZ2VyLmNsYXNzTGlzdC5yZW1vdmUoJ3Nob3dDYXRlZ29yaWVzJyk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IHByZXZCdXR0b24gPSB0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yPEhUTUxCdXR0b25FbGVtZW50PignLnByZXYtYnV0dG9uLmJ1dHRvbi1saW5rJyk7XG5cdFx0XHRwcmV2QnV0dG9uIS5zdHlsZS5kaXNwbGF5ID0gdGhpcy5lZGl0b3JJbnB1dD8uc2hvd1dlbGNvbWUgfHwgdGhpcy5lZGl0b3JJbnB1dD8ucmV0dXJuVG9Db21tYW5kIHx8IHRoaXMucHJldldhbGt0aHJvdWdoID8gJ2Jsb2NrJyA6ICdub25lJztcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgbW9yZVRleHRFbGVtZW50ID0gcHJldkJ1dHRvbiEucXVlcnlTZWxlY3RvcignLm1vcmVUZXh0Jyk7XG5cdFx0XHRtb3JlVGV4dEVsZW1lbnQhLnRleHRDb250ZW50ID0gZmlyc3RMYXVuY2ggPyBsb2NhbGl6ZSgnd2VsY29tZScsIFwiV2VsY29tZVwiKSA6IGxvY2FsaXplKCdnb0JhY2snLCBcIkdvIEJhY2tcIik7XG5cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmdldHRpbmdTdGFydGVkU2xpZGVEZXRhaWxzJykhLnF1ZXJ5U2VsZWN0b3JBbGwoJ2J1dHRvbicpLmZvckVhY2goYnV0dG9uID0+IGJ1dHRvbi5kaXNhYmxlZCA9IGZhbHNlKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0dGhpcy5jb250YWluZXIucXVlcnlTZWxlY3RvcignLmdldHRpbmdTdGFydGVkU2xpZGVDYXRlZ29yaWVzJykhLnF1ZXJ5U2VsZWN0b3JBbGwoJ2J1dHRvbicpLmZvckVhY2goYnV0dG9uID0+IGJ1dHRvbi5kaXNhYmxlZCA9IHRydWUpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuZ2V0dGluZ1N0YXJ0ZWRTbGlkZUNhdGVnb3JpZXMnKSEucXVlcnlTZWxlY3RvckFsbCgnaW5wdXQnKS5mb3JFYWNoKGJ1dHRvbiA9PiBidXR0b24uZGlzYWJsZWQgPSB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0Y29uc3QgYWN0aXZlID0gdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXG5cdFx0bGV0IHBhcmVudCA9IHRoaXMuY29udGFpbmVyLnBhcmVudEVsZW1lbnQ7XG5cdFx0d2hpbGUgKHBhcmVudCAmJiBwYXJlbnQgIT09IGFjdGl2ZSkge1xuXHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0Ly8gT25seSBzZXQgZm9jdXMgaWYgdGhlcmUgaXMgbm8gb3RoZXIgZm9jdWVkIGVsZW1lbnQgb3V0c2lkZSB0aGlzIGNoYWluLlxuXHRcdFx0Ly8gVGhpcyBwcmV2ZW50cyB1cyBmcm9tIHN0ZWFsaW5nIGJhY2sgZm9jdXMgZnJvbSBvdGhlciBmb2N1c2VkIGVsZW1lbnRzIHN1Y2ggYXMgcXVpY2sgcGljayBkdWUgdG8gZGVsYXllZCBsb2FkLlxuXHRcdFx0dGhpcy5jb250YWluZXIuZm9jdXMoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdldHRpbmdTdGFydGVkSW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRwdWJsaWMgY2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBHZXR0aW5nU3RhcnRlZElucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgc2VyaWFsaXplKGVkaXRvcklucHV0OiBHZXR0aW5nU3RhcnRlZElucHV0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBzZWxlY3RlZENhdGVnb3J5OiBlZGl0b3JJbnB1dC5zZWxlY3RlZENhdGVnb3J5LCBzZWxlY3RlZFN0ZXA6IGVkaXRvcklucHV0LnNlbGVjdGVkU3RlcCB9KTtcblx0fVxuXG5cdHB1YmxpYyBkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJpYWxpemVkRWRpdG9ySW5wdXQ6IHN0cmluZyk6IEdldHRpbmdTdGFydGVkSW5wdXQge1xuXG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHsgc2VsZWN0ZWRDYXRlZ29yeSwgc2VsZWN0ZWRTdGVwIH0gPSBKU09OLnBhcnNlKHNlcmlhbGl6ZWRFZGl0b3JJbnB1dCk7XG5cdFx0XHRcdHJldHVybiBuZXcgR2V0dGluZ1N0YXJ0ZWRJbnB1dCh7IHNlbGVjdGVkQ2F0ZWdvcnksIHNlbGVjdGVkU3RlcCB9KTtcblx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0XHRyZXR1cm4gbmV3IEdldHRpbmdTdGFydGVkSW5wdXQoe30pO1xuXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFjLHVCQUF1QixRQUFRLFdBQVcsYUFBYTtBQUM5RSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsY0FBYztBQUN2QixTQUFTLFVBQVUsY0FBYztBQUNqQyxTQUFTLFNBQVMsaUJBQWlCO0FBRW5DLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUVqRSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLHFCQUFxQjtBQUN2QyxTQUFTLFVBQVU7QUFDbkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLE9BQU87QUFDUCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyxnQkFBc0Msb0JBQW9CLHFCQUFxQjtBQUN4RixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWUsaUJBQWlCO0FBQ3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsWUFBWTtBQUNyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQixjQUFjLGVBQWUsMkJBQTJCO0FBQ2xGLFNBQVMsNEJBQTRCLG1CQUFtQixzQkFBc0I7QUFDOUUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUIsOEJBQThCLDJCQUEyQjtBQUV2RixTQUFTLDBCQUEwQixzQ0FBc0M7QUFDekUsU0FBMkQsb0JBQW9CLGdCQUFnQix5QkFBeUI7QUFDeEgsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0Isa0JBQWtCLG9DQUFvQztBQUNyRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUV0QyxTQUEwQix1QkFBdUI7QUFDakQsT0FBTztBQUNQLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsOEJBQThCLHNDQUFzQztBQUM3RSxTQUFzQywyQkFBMkI7QUFDakUsU0FBeUQsc0JBQXNCLCtCQUErQix3QkFBd0I7QUFDdEksU0FBZ0QsMkNBQTJDO0FBQzNGLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBMkIsc0JBQXNCLHlDQUF5QztBQUNuRyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFCQUFxQiwwQkFBMEI7QUFDeEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFFcEMsTUFBTSwyQkFBMkI7QUFDakMsTUFBTSxtQkFBbUI7QUFFbEIsTUFBTSwrQkFBK0IsSUFBSSxjQUF1Qix5QkFBeUIsS0FBSztBQUM5RixNQUFNLG1CQUFtQixJQUFJLGNBQXVCLGFBQWEsS0FBSztBQVk3RSxNQUFNLHFCQUErQyxhQUFhLElBQUksQ0FBQyxHQUFHLE9BQU87QUFBQSxFQUNoRixTQUFTLEVBQUUsUUFBUTtBQUFBLEVBQ25CLGFBQWEsRUFBRTtBQUFBLEVBQ2YsTUFBTSxFQUFFLE1BQU0sUUFBUSxNQUFNLEVBQUUsS0FBSztBQUFBLEVBQ25DLElBQUksRUFBRTtBQUFBLEVBQ04sT0FBTztBQUFBLEVBQ1AsT0FBTyxFQUFFO0FBQUEsRUFDVCxNQUFNLGVBQWUsWUFBWSxFQUFFLElBQUksS0FBSyxlQUFlLEtBQUs7QUFDakUsRUFBRTtBQWtCRixNQUFNLHFCQUFxQjtBQUNwQixJQUFNLHFCQUFOLGNBQWlDLFdBQVc7QUFBQSxFQW1EbEQsWUFDQyxPQUNrQyxnQkFDQSxnQkFDRyxtQkFDRSx1QkFDQyxzQkFDckIsa0JBQ2dCLGlCQUNKLGFBQ0UsZUFDbUIsY0FDM0IsZ0JBQ1csa0JBQ0ksc0JBQ0QscUJBQ0EsZUFDbkIsZ0JBQ1EsbUJBQ1MsbUJBQ0wsY0FDRCxhQUNHLGdCQUNTLHlCQUNILHNCQUNHLHlCQUNELHdCQUN6QztBQUVELFVBQU0sbUJBQW1CLElBQUksT0FBTyxrQkFBa0IsY0FBYyxjQUFjO0FBM0JoRDtBQUNBO0FBQ0c7QUFDRTtBQUNDO0FBRUw7QUFDSjtBQUNFO0FBQ21CO0FBQzNCO0FBQ1c7QUFDSTtBQUNEO0FBQ0E7QUFFWDtBQUNTO0FBQ0w7QUFDRDtBQUNHO0FBQ1M7QUFDSDtBQUNHO0FBQ0Q7QUF6RTNDLFNBQVEsbUJBQW1CLFFBQVEsUUFBUTtBQUUzQyxTQUFpQixvQkFBcUMsSUFBSSxnQkFBZ0I7QUFDMUUsU0FBaUIsa0JBQW1DLElBQUksZ0JBQWdCO0FBQ3hFLFNBQWlCLHlCQUEwQyxJQUFJLGdCQUFnQjtBQUMvRSxTQUFpQixtQkFBb0MsSUFBSSxnQkFBZ0I7QUFhekUsU0FBaUIsbUJBQW1CLEtBQUssVUFBVSxJQUFJLGtCQUF3QyxDQUFDO0FBRWhHLFNBQVEscUJBQXFCLEtBQUssVUFBVSxJQUFJLFVBQVUsQ0FBQztBQU0zRCxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksa0JBQXdELENBQUM7QUFDbEgsU0FBaUIsWUFBWSxLQUFLLFVBQVUsSUFBSSxrQkFBbUUsQ0FBQztBQUNwSCxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksa0JBQWlFLENBQUM7QUFhM0gsU0FBUSwwQkFBMEI7QUE4WWxDLFNBQVEsd0JBQTRDO0FBQ3BELFNBQVEsbUJBQXVDO0FBMVc5QyxTQUFLLFlBQVk7QUFBQSxNQUFFO0FBQUEsTUFDbEI7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLGNBQWMsU0FBUyxvQkFBb0Isc0RBQXNEO0FBQUEsTUFDbEc7QUFBQSxJQUFDO0FBQ0YsU0FBSyxxQkFBcUIsRUFBRSx3QkFBd0I7QUFDcEQsU0FBSyxtQkFBbUIsS0FBSyxhQUFhO0FBRTFDLFNBQUssNkJBQTZCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRXRFLFNBQUssa0JBQWtCLElBQUksOEJBQThCLEtBQUssYUFBYSxLQUFLLHFCQUFxQixLQUFLLGtCQUFrQixLQUFLLGVBQWU7QUFFaEosU0FBSyxpQkFBaUIsS0FBSyxVQUFVLGVBQWUsYUFBYSxLQUFLLFNBQVMsQ0FBQztBQUNoRixxQkFBaUIsT0FBTyxLQUFLLGNBQWMsRUFBRSxJQUFJLElBQUk7QUFFckQsU0FBSywyQkFBMkIsS0FBSyxzQkFBc0IsZ0JBQWdCO0FBRTNFLFNBQUssVUFBVSxLQUFLLGlCQUFpQjtBQUVyQyxVQUFNLFdBQVcsTUFBTTtBQUN0QixXQUFLLDJCQUEyQixLQUFLLHNCQUFzQixnQkFBZ0I7QUFDM0UsVUFBSSxLQUFLLG9CQUFvQjtBQUM1QixjQUFNLGdCQUFnQixLQUFLLG1CQUFtQixNQUFNLElBQUksVUFBUSxLQUFLLEVBQUU7QUFDdkUsY0FBTSxjQUFjLEtBQUsseUJBQXlCLEtBQUssY0FBWSxLQUFLLG9CQUFvQixPQUFPLFNBQVMsRUFBRTtBQUM5RyxZQUFJLGFBQWE7QUFDaEIsZ0JBQU0sV0FBVyxZQUFZLE1BQU0sSUFBSSxVQUFRLEtBQUssRUFBRTtBQUN0RCxjQUFJLENBQUMsT0FBTyxVQUFVLGFBQWEsR0FBRztBQUNyQyxpQkFBSyxtQkFBbUIsTUFBTSxNQUFNLEtBQUsscUJBQXFCLENBQUM7QUFBQSxVQUNoRTtBQUFBLFFBQ0Q7QUFBQSxNQUNELE9BQU87QUFDTixhQUFLLG1CQUFtQixNQUFNLE1BQU0sS0FBSyxxQkFBcUIsQ0FBQztBQUFBLE1BQ2hFO0FBQUEsSUFDRDtBQUVBLFNBQUssVUFBVSxLQUFLLHNCQUFzQixvQkFBb0IsUUFBUSxDQUFDO0FBQ3ZFLFNBQUssVUFBVSxLQUFLLHNCQUFzQix1QkFBdUIsUUFBUSxDQUFDO0FBRTFFLFNBQUssaUJBQWlCLEtBQUssa0JBQWtCLGtCQUFrQjtBQUMvRCxTQUFLLFVBQVUsa0JBQWtCLDBCQUEwQixNQUFNO0FBQ2hFLFdBQUssaUJBQWlCLGtCQUFrQixrQkFBa0I7QUFDMUQsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QixDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxzQkFBc0IsdUJBQXVCLGNBQVk7QUFDNUUsWUFBTSxjQUFjLEtBQUsseUJBQXlCLEtBQUssT0FBSyxFQUFFLE9BQU8sU0FBUyxFQUFFO0FBQ2hGLFVBQUksQ0FBQyxhQUFhO0FBQUU7QUFBQSxNQUFRO0FBRTVCLGtCQUFZLFFBQVEsU0FBUztBQUM3QixrQkFBWSxjQUFjLFNBQVM7QUFHbkMsV0FBSyxVQUFVLGlCQUFpQywwQkFBMEIsU0FBUyxFQUFFLElBQUksRUFBRSxRQUFRLFVBQVMsS0FBd0IsWUFBWSxZQUFZLEtBQUs7QUFFakssV0FBSyxVQUFVLGlCQUFpQyxnQ0FBZ0MsU0FBUyxFQUFFLElBQUksRUFBRSxRQUFRLFVBQVMsS0FBd0IsWUFBWSxZQUFZLFdBQVc7QUFBQSxJQUM5SyxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE9BQUs7QUFDdEUsVUFBSSxFQUFFLHFCQUFxQixrQkFBa0IsR0FBRztBQUMvQyxhQUFLLFVBQVUsVUFBVSxPQUFPLGNBQWMsS0FBSyxjQUFjLENBQUM7QUFBQSxNQUNuRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssc0JBQXNCLGtCQUFrQixVQUFRO0FBQ25FLFlBQU0sV0FBVyxLQUFLLHlCQUF5QixLQUFLLE9BQUssRUFBRSxPQUFPLEtBQUssUUFBUTtBQUMvRSxVQUFJLENBQUMsVUFBVTtBQUFFLGNBQU0sTUFBTSxzQ0FBc0MsS0FBSyxRQUFRO0FBQUEsTUFBRztBQUNuRixZQUFNLFVBQVUsU0FBUyxNQUFNLEtBQUssV0FBUyxNQUFNLE9BQU8sS0FBSyxFQUFFO0FBQ2pFLFVBQUksQ0FBQyxTQUFTO0FBQ2IsY0FBTSxNQUFNLGtDQUFrQyxLQUFLLEVBQUU7QUFBQSxNQUN0RDtBQUVBLFlBQU0sUUFBUSxLQUFLLDhCQUE4QixRQUFRO0FBQ3pELFVBQUksQ0FBQyxRQUFRLFFBQVEsTUFBTSxrQkFBa0IsTUFBTSxhQUFhLEdBQUc7QUFDbEUsYUFBSyxhQUFhLFNBQVMsRUFBRTtBQUFBLE1BQzlCO0FBRUEsY0FBUSxPQUFPLEtBQUs7QUFFcEIsVUFBSSxTQUFTLE9BQU8sS0FBSyxvQkFBb0IsSUFBSTtBQUVoRCxjQUFNLGdCQUFnQixxQkFBcUIsS0FBSyxPQUFPLFNBQVMsaUJBQWlCLHVCQUF1QixLQUFLLEVBQUUsSUFBSSxDQUFDO0FBQ3BILHNCQUFjLFFBQVEsa0JBQWdCO0FBQ3JDLGNBQUksS0FBSyxNQUFNO0FBQ2QseUJBQWEsYUFBYSxnQkFBZ0IsTUFBTTtBQUNoRCx5QkFBYSxlQUFlLGFBQWEsZ0JBQWdCLE1BQU07QUFDL0QseUJBQWEsVUFBVSxPQUFPLEdBQUcsVUFBVSxpQkFBaUIsOEJBQThCLENBQUM7QUFDM0YseUJBQWEsVUFBVSxJQUFJLFlBQVksR0FBRyxVQUFVLGlCQUFpQiw0QkFBNEIsQ0FBQztBQUNsRyx5QkFBYSxhQUFhLGNBQWMsU0FBUyxZQUFZLGtCQUFrQixLQUFLLEtBQUssQ0FBQztBQUFBLFVBQzNGLE9BQ0s7QUFDSix5QkFBYSxhQUFhLGdCQUFnQixPQUFPO0FBQ2pELHlCQUFhLGVBQWUsYUFBYSxnQkFBZ0IsT0FBTztBQUNoRSx5QkFBYSxVQUFVLE9BQU8sWUFBWSxHQUFHLFVBQVUsaUJBQWlCLDRCQUE0QixDQUFDO0FBQ3JHLHlCQUFhLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLDhCQUE4QixDQUFDO0FBQ3hGLHlCQUFhLGFBQWEsY0FBYyxTQUFTLGVBQWUsc0JBQXNCLEtBQUssS0FBSyxDQUFDO0FBQUEsVUFDbEc7QUFBQSxRQUNELENBQUM7QUFDRCxZQUFJLEtBQUssTUFBTTtBQUNkLGlCQUFPLFNBQVMscUJBQXFCLHNCQUFzQixLQUFLLEtBQUssQ0FBQztBQUFBLFFBQ3ZFO0FBQUEsTUFDRDtBQUNBLFdBQUssdUJBQXVCO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssZUFBZSxnQkFBZ0IsQ0FBQyxNQUFNO0FBQ3pELFVBQUksRUFBRSxXQUFXLG9CQUFvQixVQUFVO0FBQzlDO0FBQUEsTUFDRDtBQUVBLFVBQUksS0FBSyx3QkFBd0IsYUFBYSxFQUFFLFFBQVEsV0FBVyxHQUFHO0FBQ3JFO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxLQUFLLGVBQWUsQ0FBQyxLQUFLLHNCQUFzQixDQUFDLEtBQUssWUFBWSxvQkFBb0IsQ0FBQyxLQUFLLFlBQVksY0FBYztBQUMxSDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGFBQWEsS0FBSyxjQUFjLFlBQVk7QUFDbEQsVUFBSSxFQUFFLHNCQUFzQixxQkFBcUI7QUFDaEQ7QUFBQSxNQUNEO0FBR0EsWUFBTSxjQUFxRCxFQUFFLFFBQVEsK0JBQStCLElBQUksVUFBVSxLQUFLLFlBQVksa0JBQWtCLE1BQU0sS0FBSyxZQUFZLGFBQWE7QUFDekwsV0FBSyxlQUFlO0FBQUEsUUFDbkI7QUFBQSxRQUNBLEtBQUssVUFBVSxXQUFXO0FBQUEsUUFDMUIsYUFBYTtBQUFBLFFBQVMsY0FBYztBQUFBLE1BQU87QUFBQSxJQUM3QyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFyS0EsSUFBSSxjQUErQztBQUNsRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUE7QUFBQSxFQXNLUSxnQkFBZ0I7QUFDdkIsUUFBSSxLQUFLLHFCQUFxQixTQUFTLGtCQUFrQixHQUFHO0FBQzNELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLHFCQUFxQixnQkFBZ0IsR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSw4QkFBOEIsYUFBa0Y7QUFDdkgsVUFBTSxjQUFjLFlBQVksTUFBTSxPQUFPLE9BQUssS0FBSyxlQUFlLG9CQUFvQixFQUFFLElBQUksQ0FBQztBQUNqRyxXQUFPO0FBQUEsTUFDTixlQUFlLFlBQVksT0FBTyxPQUFLLEVBQUUsSUFBSSxFQUFFO0FBQUEsTUFDL0MsWUFBWSxZQUFZO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFlLFNBQVMsVUFBK0IsU0FBa0QsU0FBNkIsT0FBMEI7QUFDL0osVUFBTSxNQUFNLFNBQVMsVUFBVSxTQUFTLFNBQVMsS0FBSztBQUN0RCxVQUFNLG1CQUFtQixTQUFTLG9CQUFvQixTQUFTO0FBQy9ELFVBQU0sZUFBZSxTQUFTLGdCQUFnQixTQUFTO0FBQ3ZELFVBQU0sS0FBSyxXQUFXLEVBQUUsR0FBRyxTQUFTLGtCQUFrQixhQUFhLENBQUM7QUFBQSxFQUNyRTtBQUFBLEVBRUEsTUFBZSxXQUFXLFNBQWlFO0FBQzFGLFVBQU0sV0FBVyxPQUFPO0FBQ3hCLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEI7QUFBQSxJQUNEO0FBRUEsUUFDQyxLQUFLLFlBQVkscUJBQXFCLFNBQVMsb0JBQy9DLEtBQUssWUFBWSxpQkFBaUIsU0FBUyxjQUMxQztBQUNELFlBQU0sS0FBSyxXQUFXLE9BQU87QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsV0FBVyxTQUFpRTtBQUN6RixRQUFJLENBQUMsS0FBSyxhQUFhO0FBQ3RCO0FBQUEsSUFDRDtBQUNBLFNBQUssWUFBWSxzQkFBc0IsU0FBUyx1QkFBdUI7QUFDdkUsU0FBSyxZQUFZLG1CQUFtQixTQUFTO0FBQzdDLFNBQUssWUFBWSxlQUFlLFNBQVM7QUFDekMsU0FBSyxZQUFZLGtCQUFrQixTQUFTO0FBRTVDLFNBQUssVUFBVSxVQUFVLE9BQU8sWUFBWTtBQUM1QyxVQUFNLEtBQUsscUJBQXFCLFNBQVMsYUFBYTtBQUN0RCxRQUFJLEtBQUssY0FBYyxHQUFHO0FBQ3pCLGlCQUFXLE1BQU0sS0FBSyxVQUFVLFVBQVUsSUFBSSxZQUFZLEdBQUcsQ0FBQztBQUFBLElBQy9EO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxpQ0FBaUMsWUFBb0IsUUFBaUI7QUFDM0UsU0FBSyxpQkFBaUIsWUFBWSxNQUFNO0FBQUEsRUFDekM7QUFBQSxFQUVRLDRCQUE0QjtBQUNuQyxTQUFLLGtCQUFrQixNQUFNO0FBRzdCLFNBQUssVUFBVSxpQkFBaUIsY0FBYyxFQUFFLFFBQVEsYUFBVztBQUNsRSxZQUFNLFdBQVcsUUFBUSxhQUFhLFlBQVksS0FBSztBQUN2RCxVQUFJLFNBQVM7QUFDYixVQUFJLFNBQVMsV0FBVyxnQkFBZ0IsR0FBRztBQUMxQyxTQUFDLFNBQVMsUUFBUSxJQUFJLENBQUMsWUFBWSxTQUFTLFFBQVEsYUFBYSxFQUFFLENBQUM7QUFBQSxNQUNyRSxPQUFPO0FBQ04sU0FBQyxTQUFTLFFBQVEsSUFBSSxTQUFTLE1BQU0sR0FBRztBQUFBLE1BQ3pDO0FBQ0EsVUFBSSxTQUFTO0FBQ1osYUFBSyxrQkFBa0IsSUFBSSxzQkFBc0IsU0FBUyxTQUFTLENBQUMsTUFBTTtBQUN6RSxZQUFFLGdCQUFnQjtBQUNsQixlQUFLLG1CQUFtQixTQUFTLFFBQVE7QUFBQSxRQUMxQyxDQUFDLENBQUM7QUFDRixhQUFLLGtCQUFrQixJQUFJLHNCQUFzQixTQUFTLFNBQVMsQ0FBQyxNQUFNO0FBQ3pFLGdCQUFNLGdCQUFnQixJQUFJLHNCQUFzQixDQUFDO0FBQ2pELFlBQUUsZ0JBQWdCO0FBQ2xCLGtCQUFRLGNBQWMsU0FBUztBQUFBLFlBQzlCLEtBQUssUUFBUTtBQUFBLFlBQ2IsS0FBSyxRQUFRO0FBQ1osbUJBQUssbUJBQW1CLFNBQVMsUUFBUTtBQUN6QztBQUFBLFVBQ0Y7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLG1CQUFtQixTQUFpQixVQUFrQjtBQUNuRSxTQUFLLGVBQWUsZUFBZSw2QkFBNkI7QUFDaEUsU0FBSyxpQkFBaUIsV0FBMEUsaUNBQWlDLEVBQUUsU0FBUyxVQUFVLGVBQWUsS0FBSyxvQkFBb0IsR0FBRyxDQUFDO0FBQ2xNLFlBQVEsU0FBUztBQUFBLE1BQ2hCLEtBQUssY0FBYztBQUNsQixhQUFLLFdBQVc7QUFDaEI7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLFFBQVE7QUFDWixhQUFLLFFBQVE7QUFDYjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssbUJBQW1CO0FBQ3ZCLGFBQUssZUFBZSxlQUFlLGlCQUFpQixFQUFFO0FBQ3REO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxzQkFBc0I7QUFDMUIsY0FBTSxLQUFLLHdCQUF3QjtBQUNuQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssY0FBYztBQUNsQixZQUFJLEtBQUssZUFBZSxvQkFBb0IsZUFBZSxJQUFJLHNCQUFzQixVQUFVLFdBQVcsQ0FBQyxDQUFDLEdBQUc7QUFDOUcsZUFBSyxlQUFlLGVBQWUsNkJBQTZCLEVBQUU7QUFBQSxRQUNuRSxPQUFPO0FBQ04sZUFBSyxlQUFlLGVBQWUsbUNBQW1DO0FBQUEsUUFDdkU7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssa0JBQWtCO0FBQ3RCLGFBQUssaUJBQWlCLFdBQTBFLGlDQUFpQyxFQUFFLFNBQVMsa0JBQWtCLFVBQVUsZUFBZSxLQUFLLG9CQUFvQixHQUFHLENBQUM7QUFDcE4sYUFBSyxpQkFBaUIsUUFBUTtBQUM5QixhQUFLLHNCQUFzQixzQkFBc0IsUUFBUTtBQUN6RDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssb0JBQW9CO0FBQ3hCLGNBQU0sV0FBVyxhQUFhLEtBQUssT0FBSyxFQUFFLE9BQU8sUUFBUTtBQUN6RCxZQUFJLFVBQVU7QUFDYixlQUFLLGlCQUFpQixXQUEwRSxpQ0FBaUMsRUFBRSxTQUFTLG9CQUFvQixVQUFVLGVBQWUsS0FBSyxvQkFBb0IsR0FBRyxDQUFDO0FBQ3ROLGVBQUssZUFBZSxTQUFTLFFBQVEsT0FBTztBQUFBLFFBQzdDLE9BQU87QUFDTixnQkFBTSxNQUFNLHlDQUF5QyxRQUFRO0FBQUEsUUFDOUQ7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssZ0JBQWdCO0FBQ3BCLGFBQUssYUFBYSxRQUFRO0FBQzFCO0FBQUEsTUFDRDtBQUFBO0FBQUEsTUFFQSxLQUFLLGNBQWM7QUFDbEIsYUFBSyxXQUFXLFFBQVE7QUFDeEI7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLHdCQUF3QjtBQUM1QixhQUFLLHFCQUFxQixRQUFRO0FBQ2xDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxXQUFXO0FBQ2YsYUFBSyxxQkFBcUI7QUFDMUI7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLGVBQWU7QUFDbkIsY0FBTSxPQUFPLEtBQUssb0JBQW9CO0FBQ3RDLFlBQUksTUFBTTtBQUNULGVBQUssa0JBQWtCLEtBQUs7QUFDNUIsZUFBSyxpQkFBaUIsSUFBSTtBQUFBLFFBQzNCLE9BQU87QUFDTixrQkFBUSxNQUFNLHNDQUFzQyxLQUFLLGtCQUFrQjtBQUFBLFFBQzVFO0FBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLFlBQVk7QUFDaEIsYUFBSyxjQUFjLEtBQUssUUFBUTtBQUNoQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFDUixnQkFBUSxNQUFNLGVBQWUsU0FBUyxVQUFVLGFBQWE7QUFDN0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEsWUFBb0I7QUFDeEMsVUFBTSxtQkFBbUIsS0FBSyx5QkFBeUIsS0FBSyxjQUFZLFNBQVMsT0FBTyxVQUFVO0FBQ2xHLFFBQUksQ0FBQyxrQkFBa0I7QUFBRSxZQUFNLE1BQU0scUNBQXFDLFVBQVU7QUFBQSxJQUFHO0FBQ3ZGLFNBQUssb0JBQW9CLENBQUMsR0FBRyxLQUFLLG9CQUFvQixFQUFFLElBQUksVUFBVSxDQUFDLENBQUM7QUFDeEUsU0FBSyxtQkFBbUIsT0FBTyxTQUFTO0FBQUEsRUFDekM7QUFBQSxFQUVRLHVCQUF1QjtBQUM5QixRQUFJLEtBQUssb0JBQW9CO0FBQzVCLFdBQUssb0JBQW9CLE1BQU0sUUFBUSxVQUFRO0FBQzlDLFlBQUksQ0FBQyxLQUFLLE1BQU07QUFDZixlQUFLLHNCQUFzQixhQUFhLEtBQUssRUFBRTtBQUFBLFFBQ2hEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxhQUFhLEtBQUssb0JBQW9CLEVBQUU7QUFDN0MsV0FBSyxXQUFXO0FBQUEsSUFDakIsT0FBTztBQUNOLFlBQU0sTUFBTSx1QkFBdUI7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixVQUFrQjtBQUM5QyxVQUFNLGFBQWEscUJBQXFCLEtBQUssb0JBQW9CLE1BQU0sS0FBSyxVQUFRLEtBQUssT0FBTyxRQUFRLENBQUM7QUFDekcsUUFBSSxXQUFXLE1BQU07QUFDcEIsV0FBSyxzQkFBc0IsZUFBZSxRQUFRO0FBQUEsSUFDbkQsT0FBTztBQUNOLFdBQUssc0JBQXNCLGFBQWEsUUFBUTtBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYywwQkFBMEI7QUFDdkMsVUFBTSxZQUFZLE1BQU0sS0FBSyxrQkFBa0IsS0FBSyxLQUFLLHlCQUN2RCxPQUFPLE9BQUssS0FBSyxlQUFlLG9CQUFvQixFQUFFLElBQUksQ0FBQyxFQUMzRCxJQUFJLFFBQU07QUFBQSxNQUNWLElBQUksRUFBRTtBQUFBLE1BQ04sT0FBTyxFQUFFO0FBQUEsTUFDVCxRQUFRLEVBQUU7QUFBQSxNQUNWLGFBQWEsRUFBRTtBQUFBLElBQ2hCLEVBQUUsR0FBRyxFQUFFLGFBQWEsT0FBTyxvQkFBb0IsTUFBTSxlQUFlLE1BQU0sT0FBTyxTQUFTLG9CQUFvQixxQkFBcUIsRUFBRSxDQUFDO0FBQ3ZJLFFBQUksV0FBVztBQUNkLFdBQUssbUJBQW1CLGtCQUFrQixVQUFVLEVBQUU7QUFBQSxJQUN2RDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFtQztBQUMxQyxXQUFPLElBQUksSUFBSSxLQUFLLE1BQU0sS0FBSyxlQUFlLElBQUksK0JBQStCLGFBQWEsU0FBUyxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQzlHO0FBQUEsRUFFUSxvQkFBb0IsUUFBa0I7QUFDN0MsU0FBSyxlQUFlO0FBQUEsTUFDbkI7QUFBQSxNQUNBLEtBQUssVUFBVSxNQUFNO0FBQUEsTUFDckIsYUFBYTtBQUFBLE1BQ2IsY0FBYztBQUFBLElBQUk7QUFBQSxFQUNwQjtBQUFBLEVBSUEsTUFBYyxvQkFBb0IsUUFBZ0IsZUFBd0IsT0FBTztBQUNoRixRQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0IsWUFBTSxNQUFNLHlCQUF5QjtBQUFBLElBQ3RDO0FBQ0EsVUFBTSxlQUFlLHFCQUFxQixLQUFLLG1CQUFtQixNQUFNLEtBQUssVUFBUSxLQUFLLE9BQU8sTUFBTSxDQUFDO0FBRXhHLFFBQUksQ0FBQyxnQkFBZ0IsS0FBSywwQkFBMEIsUUFBUTtBQUFFO0FBQUEsSUFBUTtBQUN0RSxTQUFLLHdCQUF3QjtBQUU3QixTQUFLLGdCQUFnQixNQUFNO0FBRTNCLFNBQUssZ0JBQWdCLElBQUk7QUFBQSxNQUN4QixTQUFTLE1BQU07QUFDZCxhQUFLLHdCQUF3QjtBQUFBLE1BQzlCO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxLQUFLLHFCQUFxQixhQUFhLE1BQU0sTUFBTTtBQUN0RCxXQUFLLGlCQUFpQixNQUFNO0FBRTVCLFdBQUssbUJBQW1CLGFBQWEsTUFBTTtBQUUzQyxXQUFLLGlCQUFpQixJQUFJLGFBQWEsTUFBTTtBQUM1QyxhQUFLLG1CQUFtQjtBQUFBLE1BQ3pCLENBQUMsQ0FBQztBQUVGLGdCQUFVLEtBQUssa0JBQWtCO0FBRWpDLFVBQUksYUFBYSxNQUFNLFNBQVMsT0FBTztBQUN0QyxhQUFLLFVBQVUsS0FBSyxpQkFBaUIsSUFBSSxLQUFLLGVBQWUscUJBQXFCLEVBQUUsT0FBTyxRQUFXLFNBQVMsRUFBRSxzQkFBc0IsS0FBSyxHQUFHLGdCQUFnQixDQUFDLEdBQUcsV0FBVyxPQUFVLENBQUMsQ0FBQztBQUMxTCxhQUFLLFFBQVEsUUFBUSxLQUFLLG9CQUFvQixLQUFLLE1BQU07QUFBQSxNQUMxRCxXQUFXLGFBQWEsTUFBTSxTQUFTLFlBQVk7QUFDbEQsYUFBSyxVQUFVLEtBQUssaUJBQWlCLElBQUksS0FBSyxlQUFlLHFCQUFxQixFQUFFLFNBQVMsQ0FBQyxHQUFHLGdCQUFnQixFQUFFLG9CQUFvQixDQUFDLGFBQWEsTUFBTSxJQUFJLEdBQUcsY0FBYyxLQUFLLEdBQUcsT0FBTyxJQUFJLFdBQVcsT0FBVSxDQUFDLENBQUM7QUFDMU4sYUFBSyxRQUFRLFFBQVEsS0FBSyxvQkFBb0IsS0FBSyxNQUFNO0FBQUEsTUFDMUQsV0FBVyxhQUFhLE1BQU0sU0FBUyxTQUFTO0FBQy9DLGFBQUssVUFBVSxLQUFLLGlCQUFpQixJQUFJLEtBQUssZUFBZSxxQkFBcUIsRUFBRSxTQUFTLENBQUMsR0FBRyxnQkFBZ0IsRUFBRSxvQkFBb0IsQ0FBQyxhQUFhLE1BQU0sSUFBSSxHQUFHLGNBQWMsS0FBSyxHQUFHLE9BQU8sSUFBSSxXQUFXLE9BQVUsQ0FBQyxDQUFDO0FBQzFOLGFBQUssUUFBUSxRQUFRLEtBQUssb0JBQW9CLEtBQUssTUFBTTtBQUFBLE1BQzFEO0FBQUEsSUFDRDtBQUVBLFFBQUksYUFBYSxNQUFNLFNBQVMsU0FBUztBQUV4QyxXQUFLLGFBQWEsVUFBVSxJQUFJLE9BQU87QUFDdkMsV0FBSyxhQUFhLFVBQVUsT0FBTyxVQUFVO0FBQzdDLFdBQUssYUFBYSxVQUFVLE9BQU8sT0FBTztBQUUxQyxZQUFNLFFBQVEsYUFBYTtBQUMzQixZQUFNLGVBQWUsRUFBb0IsS0FBSztBQUM5QyxnQkFBVSxLQUFLLGtCQUFrQjtBQUNqQyxXQUFLLG1CQUFtQixZQUFZLFlBQVk7QUFDaEQsbUJBQWEsYUFBYSxPQUFPLE1BQU0sT0FBTztBQUM5QyxXQUFLLDhCQUE4QixjQUFjLE1BQU0sSUFBSTtBQUUzRCxXQUFLLGdCQUFnQixJQUFJLHNCQUFzQixLQUFLLG9CQUFvQixTQUFTLE1BQU07QUFDdEYsY0FBTSxRQUFRLGFBQWEsWUFBWSxJQUFJLFFBQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxTQUF3QixPQUFPLFNBQVMsUUFBUSxFQUFFLElBQUksVUFBUSxLQUFLLElBQUksQ0FBQyxFQUFFLEtBQUs7QUFDakosWUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QixnQkFBTSxPQUFPLE1BQU0sQ0FBQztBQUNwQixjQUFJLEtBQUssV0FBVyxNQUFNLEdBQUc7QUFDNUIsaUJBQUssaUJBQWlCLFdBQTBFLGlDQUFpQyxFQUFFLFNBQVMsaUJBQWlCLFVBQVUsTUFBTSxlQUFlLEtBQUssb0JBQW9CLEdBQUcsQ0FBQztBQUN6TixpQkFBSyxjQUFjLEtBQUssSUFBSTtBQUFBLFVBQzdCO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBSyxnQkFBZ0IsSUFBSSxLQUFLLGFBQWEsc0JBQXNCLE1BQU0sS0FBSyw4QkFBOEIsY0FBYyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFFckksV0FDUyxhQUFhLE1BQU0sU0FBUyxPQUFPO0FBQzNDLFdBQUssYUFBYSxVQUFVLElBQUksT0FBTztBQUN2QyxXQUFLLGFBQWEsVUFBVSxPQUFPLFVBQVU7QUFDN0MsV0FBSyxhQUFhLFVBQVUsT0FBTyxPQUFPO0FBRTFDLFlBQU0sUUFBUSxhQUFhO0FBQzNCLFdBQUssUUFBUSxRQUFRLE1BQU0sS0FBSyxnQkFBZ0IsVUFBVSxNQUFNLElBQUksQ0FBQztBQUVyRSxVQUFJLGFBQWE7QUFDakIsV0FBSyxnQkFBZ0IsSUFBSSxhQUFhLE1BQU07QUFBRSxxQkFBYTtBQUFBLE1BQU0sQ0FBQyxDQUFDO0FBRW5FLFdBQUssZ0JBQWdCLElBQUksS0FBSyxhQUFhLHNCQUFzQixZQUFZO0FBRTVFLGNBQU0sT0FBTyxNQUFNLEtBQUssZ0JBQWdCLFVBQVUsTUFBTSxJQUFJO0FBQzVELFlBQUksQ0FBQyxZQUFZO0FBQ2hCLGVBQUssUUFBUSxRQUFRLElBQUk7QUFBQSxRQUMxQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBSyxnQkFBZ0IsSUFBSSxzQkFBc0IsS0FBSyxvQkFBb0IsU0FBUyxNQUFNO0FBQ3RGLGNBQU0sUUFBUSxhQUFhLFlBQVksSUFBSSxRQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsU0FBd0IsT0FBTyxTQUFTLFFBQVEsRUFBRSxJQUFJLFVBQVEsS0FBSyxJQUFJLENBQUMsRUFBRSxLQUFLO0FBQ2pKLFlBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsZ0JBQU0sT0FBTyxNQUFNLENBQUM7QUFDcEIsY0FBSSxLQUFLLFdBQVcsTUFBTSxHQUFHO0FBQzVCLGlCQUFLLGlCQUFpQixXQUEwRSxpQ0FBaUMsRUFBRSxTQUFTLGlCQUFpQixVQUFVLE1BQU0sZUFBZSxLQUFLLG9CQUFvQixHQUFHLENBQUM7QUFDek4saUJBQUssY0FBYyxLQUFLLElBQUk7QUFBQSxVQUM3QjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUVGLFdBQUssZ0JBQWdCLElBQUksS0FBSyxRQUFRLGVBQWUsVUFBUTtBQUM1RCxZQUFJLGNBQWMsTUFBTSxRQUFRLEtBQUssS0FBSyxjQUFjLE1BQU0sUUFBUSxJQUFJLEtBQU0sY0FBYyxNQUFNLFFBQVEsT0FBTyxHQUFJO0FBQ3RILGVBQUssY0FBYyxLQUFLLE1BQU0sRUFBRSxlQUFlLEtBQUssQ0FBQztBQUFBLFFBQ3REO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUVILFdBQ1MsYUFBYSxNQUFNLFNBQVMsWUFBWTtBQUVoRCxXQUFLLGFBQWEsVUFBVSxPQUFPLE9BQU87QUFDMUMsV0FBSyxhQUFhLFVBQVUsSUFBSSxVQUFVO0FBQzFDLFdBQUssYUFBYSxVQUFVLE9BQU8sT0FBTztBQUUxQyxZQUFNLFFBQVEsYUFBYTtBQUUzQixZQUFNLFVBQVUsTUFBTSxLQUFLLGdCQUFnQixlQUFlLE1BQU0sTUFBTSxNQUFNLElBQUk7QUFDaEYsV0FBSyxRQUFRLFFBQVEsT0FBTztBQUU1QixZQUFNLDRCQUE0QixRQUFRLE1BQU0sNkJBQTZCLEdBQUcsSUFBSSxVQUFRLEtBQUssTUFBTSxlQUFlLFFBQVEsRUFBRSxFQUM5SCxRQUFRLFVBQVUsR0FBSSxFQUN0QixRQUFRLFVBQVUsR0FBRyxDQUFDO0FBRXhCLFlBQU0sc0JBQXNCLE1BQU07QUFDakMsY0FBTSxxQkFBcUIsMkJBQTJCLE9BQU8sVUFBUSxLQUFLLGVBQWUsb0JBQW9CLGVBQWUsWUFBWSxJQUFJLENBQUMsQ0FBQztBQUM5SSxZQUFJLG9CQUFvQjtBQUN2QixlQUFLLFFBQVEsWUFBWTtBQUFBLFlBQ3hCO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLDJCQUEyQjtBQUM5QixjQUFNLGtCQUFrQixTQUFTLDBCQUEwQixJQUFJLFVBQVEsZUFBZSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBQ3hHLGNBQU0sZUFBZSxJQUFJLElBQUksZ0JBQWdCLFFBQVEsVUFBUSxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBRXpFLGFBQUssZ0JBQWdCLElBQUksS0FBSyxlQUFlLG1CQUFtQixPQUFLO0FBQ3BFLGNBQUksRUFBRSxZQUFZLFlBQVksR0FBRztBQUFFLGdDQUFvQjtBQUFBLFVBQUc7QUFBQSxRQUMzRCxDQUFDLENBQUM7QUFBQSxNQUNIO0FBRUEsVUFBSSxhQUFhO0FBQ2pCLFdBQUssZ0JBQWdCLElBQUksYUFBYSxNQUFNO0FBQUUscUJBQWE7QUFBQSxNQUFNLENBQUMsQ0FBQztBQUVuRSxXQUFLLGdCQUFnQixJQUFJLEtBQUssUUFBUSxlQUFlLFVBQVE7QUFDNUQsWUFBSSxjQUFjLE1BQU0sUUFBUSxLQUFLLEtBQUssY0FBYyxNQUFNLFFBQVEsSUFBSSxLQUFNLGNBQWMsTUFBTSxRQUFRLE9BQU8sR0FBSTtBQUN0SCxnQkFBTSxTQUFTLEtBQUssV0FBVyxpQkFBaUI7QUFDaEQsY0FBSSxRQUFRO0FBQ1gsbUJBQU8sS0FBSyxRQUFRLG1CQUFtQixVQUFVO0FBQ2pELGlCQUFLLHFCQUFxQjtBQUFBLFVBQzNCO0FBQ0EsZUFBSyxjQUFjLEtBQUssTUFBTSxFQUFFLGVBQWUsTUFBTSxZQUFZLE9BQU8sQ0FBQztBQUFBLFFBQzFFO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixVQUFJLFFBQVEsUUFBUSxRQUFRLEtBQUssR0FBRztBQUVuQyxhQUFLLGdCQUFnQixJQUFJLEtBQUssYUFBYSxzQkFBc0IsWUFBWTtBQUM1RSxnQkFBTSxPQUFPLE1BQU0sS0FBSyxnQkFBZ0IsZUFBZSxNQUFNLE1BQU0sTUFBTSxJQUFJO0FBQzdFLGNBQUksQ0FBQyxZQUFZO0FBQ2hCLGlCQUFLLFFBQVEsUUFBUSxJQUFJO0FBQ3pCLGdDQUFvQjtBQUFBLFVBQ3JCO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFBQSxNQUNIO0FBRUEsWUFBTSxnQkFBZ0IsSUFBSSxRQUFRLEVBQUU7QUFFcEMsV0FBSyxpQkFBaUIsTUFBTTtBQUMzQixzQkFBYyxRQUFRLE1BQU07QUFDM0IsZUFBSyxRQUFRLFlBQVksRUFBRSxhQUFhLEtBQUssQ0FBQztBQUFBLFFBQy9DLENBQUM7QUFBQSxNQUNGO0FBRUEsV0FBSyxnQkFBZ0IsSUFBSSxhQUFhO0FBQ3RDLFdBQUssZ0JBQWdCLElBQUksRUFBRSxTQUFTLE1BQU0sS0FBSyxpQkFBaUIsT0FBVSxDQUFDO0FBRTNFLDBCQUFvQjtBQUVwQixXQUFLLGdCQUFnQixJQUFJLEtBQUssUUFBUSxVQUFVLE9BQU0sTUFBSztBQUMxRCxjQUFNLFVBQWtCLEVBQUU7QUFDMUIsWUFBSSxRQUFRLFdBQVcsVUFBVSxHQUFHO0FBQ25DLGVBQUssY0FBYyxLQUFLLFNBQVMsRUFBRSxlQUFlLEtBQUssQ0FBQztBQUFBLFFBQ3pELFdBQVcsUUFBUSxXQUFXLFdBQVcsR0FBRztBQUMzQyxnQkFBTSxVQUFVLFFBQVEsTUFBTSxZQUFZLE1BQU07QUFDaEQsZ0JBQU0sU0FBUyxNQUFNLEtBQUssYUFBYSxlQUFlLEdBQUcsS0FBSyxDQUFBQSxXQUFTQSxPQUFNLGVBQWUsT0FBTztBQUNuRyxjQUFJLE9BQU87QUFDVixpQkFBSyxhQUFhLGNBQWMsTUFBTSxJQUFJLG9CQUFvQixJQUFJO0FBQUEsVUFDbkU7QUFBQSxRQUNELE9BQU87QUFDTixrQkFBUSxNQUFNLHNCQUFzQixPQUFPO0FBQUEsUUFDNUM7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0gsV0FDUyxhQUFhLE1BQU0sU0FBUyxTQUFTO0FBQzdDLFdBQUssYUFBYSxVQUFVLElBQUksT0FBTztBQUN2QyxXQUFLLGFBQWEsVUFBVSxPQUFPLFVBQVU7QUFDN0MsV0FBSyxhQUFhLFVBQVUsT0FBTyxPQUFPO0FBRTFDLFlBQU0sUUFBUSxhQUFhO0FBRTNCLFlBQU0sWUFBWSxLQUFLLGFBQWEsY0FBYyxFQUFFO0FBQ3BELFlBQU0sWUFBWSxNQUFNLEtBQUssU0FBUztBQUN0QyxZQUFNLGNBQWMsTUFBTSxTQUFTLE1BQU0sT0FBTyxTQUFTLElBQUk7QUFDN0QsWUFBTSxVQUFVLE1BQU0sVUFBVSxNQUFNLFVBQVUsU0FBUyxnQkFBZ0IsaUJBQWlCLGFBQWEsS0FBSztBQUM1RyxZQUFNLFVBQVUsTUFBTSxLQUFLLGdCQUFnQixZQUFZLFdBQVcsYUFBYSxPQUFPO0FBQ3RGLFdBQUssUUFBUSxRQUFRLE9BQU87QUFFNUIsVUFBSSxhQUFhO0FBQ2pCLFdBQUssZ0JBQWdCLElBQUksYUFBYSxNQUFNO0FBQUUscUJBQWE7QUFBQSxNQUFNLENBQUMsQ0FBQztBQUVuRSxXQUFLLGdCQUFnQixJQUFJLEtBQUssYUFBYSxzQkFBc0IsWUFBWTtBQUU1RSxjQUFNQyxhQUFZLEtBQUssYUFBYSxjQUFjLEVBQUU7QUFDcEQsY0FBTUMsYUFBWSxNQUFNLEtBQUtELFVBQVM7QUFDdEMsY0FBTUUsZUFBYyxNQUFNLFNBQVMsTUFBTSxPQUFPRixVQUFTLElBQUk7QUFDN0QsY0FBTSxPQUFPLE1BQU0sS0FBSyxnQkFBZ0IsWUFBWUMsWUFBV0MsY0FBYSxPQUFPO0FBRW5GLFlBQUksQ0FBQyxZQUFZO0FBQ2hCLGVBQUssUUFBUSxRQUFRLElBQUk7QUFBQSxRQUMxQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZ0JBQWdCLElBQVk7QUFDakMsUUFBSSxDQUFDLEtBQUssYUFBYTtBQUN0QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEdBQUcsV0FBVyxHQUFHLEtBQUssWUFBWSxnQkFBZ0IsR0FBRyxHQUFHO0FBQzNELFdBQUssV0FBVyxFQUFFO0FBQUEsSUFDbkIsT0FBTztBQUNOLFlBQU0sV0FBVyxLQUFLLFlBQVksbUJBQW1CLE1BQU07QUFDM0QsV0FBSyxXQUFXLFFBQVE7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDRCQUFvQztBQUMzQyxRQUFJLEtBQUsscUJBQXFCLFNBQVMsZ0NBQWdDLFdBQVcsR0FBRztBQUNwRixZQUFNLFVBQVUsS0FBSyxrQkFBa0IsaUJBQWlCLHFCQUFxQixFQUFFLEdBQUcsYUFBYTtBQUMvRixhQUFPLFVBQVUsU0FBUyxxQkFBcUIsZ0RBQWdELE9BQU8sSUFBSSxTQUFTLDZCQUE2QiwrSEFBK0g7QUFBQSxJQUNoUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLFdBQVcsSUFBd0IsYUFBYSxNQUFNLGVBQXlCO0FBQzVGLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxJQUFJO0FBRVAsVUFBSSxjQUFjLEtBQUssVUFBVSxjQUE4QixrQkFBa0IsRUFBRSxJQUFJO0FBQ3ZGLFVBQUksQ0FBQyxhQUFhO0FBR2pCLHNCQUFjLEtBQUssVUFBVSxjQUE4QixnQkFBZ0I7QUFDM0UsWUFBSSxDQUFDLGFBQWE7QUFFakI7QUFBQSxRQUNEO0FBQ0EsYUFBSyxxQkFBcUIsWUFBWSxhQUFhLGNBQWMsQ0FBQztBQUFBLE1BQ25FO0FBRUEsa0JBQVksZUFBZSxpQkFBOEIsV0FBVyxFQUFFLFFBQVEsVUFBUTtBQUNyRixZQUFJLEtBQUssYUFBYSxjQUFjLE1BQU0sSUFBSTtBQUM3QyxlQUFLLFVBQVUsT0FBTyxVQUFVO0FBQ2hDLGVBQUssYUFBYSxpQkFBaUIsT0FBTztBQUUxQyxnQkFBTUMsa0JBQWlCLEtBQUssY0FBYyxVQUFVO0FBQ3BELGNBQUlBLGlCQUFnQjtBQUNuQixZQUFBQSxnQkFBZSxnQkFBZ0IsVUFBVTtBQUFBLFVBQzFDO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUNELFVBQUksQ0FBQyxlQUFlO0FBQ25CLG1CQUFXLE1BQU8sWUFBNEIsTUFBTSxHQUFHLGNBQWMsS0FBSyxjQUFjLElBQUksMkJBQTJCLENBQUM7QUFBQSxNQUN6SDtBQUVBLFdBQUssWUFBWSxlQUFlO0FBRWhDLGtCQUFZLFVBQVUsSUFBSSxVQUFVO0FBQ3BDLGtCQUFZLGFBQWEsaUJBQWlCLE1BQU07QUFDaEQsV0FBSyxvQkFBb0IsSUFBSSxJQUFJO0FBRWpDLFlBQU0saUJBQWlCLFlBQVksY0FBYyxVQUFVO0FBQzNELFVBQUksZ0JBQWdCO0FBQ25CLHVCQUFlLGFBQWEsWUFBWSxHQUFHO0FBQUEsTUFDNUM7QUFDQSxXQUFLLHNCQUFzQixnQkFBZ0Isa0JBQWtCLEVBQUU7QUFDL0QsWUFBTSxPQUFPLEtBQUssb0JBQW9CLE9BQU8sS0FBSyxDQUFBQyxVQUFRQSxNQUFLLE9BQU8sRUFBRTtBQUN4RSxVQUFJLE1BQU07QUFDVCxvQkFBWSxhQUFhLGNBQWMsR0FBRyxLQUFLLDBCQUEwQixDQUFDLElBQUksS0FBSyxLQUFLLEVBQUU7QUFBQSxNQUMzRjtBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssWUFBWSxlQUFlO0FBQUEsSUFDakM7QUFFQSxTQUFLLHNCQUFzQixZQUFZO0FBQ3ZDLFNBQUssaUJBQWlCLE9BQU8sWUFBWTtBQUFBLEVBQzFDO0FBQUEsRUFFUSw4QkFBOEIsU0FBMkIsU0FBK0Q7QUFDL0gsVUFBTSxZQUFZLEtBQUssYUFBYSxjQUFjLEVBQUU7QUFDcEQsVUFBTSxNQUFNLFFBQVEsU0FBUyxFQUFFLFNBQVMsSUFBSSxFQUFFLFFBQVEsTUFBTSxLQUFLO0FBQ2pFLFlBQVEsU0FBUyxJQUFJLFlBQVksRUFBRSxTQUFTLE1BQU0sSUFBSSxNQUFPLE1BQU07QUFBQSxFQUNwRTtBQUFBLEVBRVUsYUFBYSxRQUFxQjtBQUMzQyxRQUFJLEtBQUssc0JBQXNCO0FBQUUsV0FBSyxxQkFBcUIsUUFBUTtBQUFBLElBQUc7QUFDdEUsUUFBSSxLQUFLLHlCQUF5QjtBQUFFLFdBQUssd0JBQXdCLFFBQVE7QUFBQSxJQUFHO0FBRTVFLFNBQUssa0JBQWtCLEVBQUUsb0RBQW9EO0FBRTdFLFVBQU0sYUFBYSxFQUFFLGtDQUFrQyxFQUFFLGNBQWMsYUFBYSxHQUFHLEVBQUUsaURBQWlELEdBQUcsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLFNBQVMsVUFBVSxTQUFTLENBQUMsQ0FBQztBQUNsTSxTQUFLLGFBQWEsRUFBRSxtREFBbUQsQ0FBQyxHQUFHLFVBQVU7QUFFckYsU0FBSyxlQUFlLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztBQUV6RCxTQUFLLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxxQkFBcUIsS0FBSyxjQUFjLEVBQUUsV0FBVywwQkFBMEIsVUFBVSxvQkFBb0IsT0FBTyxDQUFDLENBQUM7QUFDckssU0FBSywwQkFBMEIsS0FBSyxVQUFVLElBQUkscUJBQXFCLEtBQUssaUJBQWlCLEVBQUUsV0FBVyw4Q0FBOEMsVUFBVSxvQkFBb0IsT0FBTyxDQUFDLENBQUM7QUFFL0wsU0FBSyxXQUFXLFlBQVksS0FBSyxxQkFBcUIsV0FBVyxDQUFDO0FBRWxFLFVBQU0scUJBQXFCLEVBQUUsbUJBQW1CLENBQUMsR0FBRyxLQUFLLHdCQUF3QixXQUFXLEdBQUcsS0FBSyxVQUFVO0FBQzlHLFNBQUssVUFBVSxZQUFZLGtCQUFrQjtBQUU3QyxTQUFLLHdCQUF3QixZQUFZO0FBQ3pDLFNBQUsscUJBQXFCLFlBQVk7QUFFdEMsV0FBTyxZQUFZLEtBQUssU0FBUztBQUFBLEVBQ2xDO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixlQUF5QjtBQUUzRCxTQUFLLDJCQUEyQixNQUFNO0FBQ3RDLFVBQU0sd0JBQXdCLElBQUksT0FBTztBQUFBLE1BQ3hDLE1BQU0sUUFBUTtBQUFBLE1BQ2QsaUJBQWlCO0FBQUEsTUFDakIsV0FBVyxLQUFLLHFCQUFxQixTQUFTLGdCQUFnQixNQUFNO0FBQUEsTUFDcEUsT0FBTyxTQUFTLGlCQUFpQixtREFBbUQ7QUFBQSxNQUNwRixHQUFHO0FBQUEsSUFDSixDQUFDO0FBQ0QsMEJBQXNCLFFBQVEsS0FBSztBQUNuQyxVQUFNLHFCQUFxQixFQUFFLGlCQUFpQixFQUFFLEtBQUssZ0JBQWdCLEdBQUcsU0FBUyw2QkFBNkIsOEJBQThCLENBQUM7QUFDN0ksVUFBTSx5QkFBeUIsTUFBTTtBQUNwQyxVQUFJLHNCQUFzQixTQUFTO0FBQ2xDLGFBQUssaUJBQWlCLFdBQTBFLGlDQUFpQyxFQUFFLFNBQVMsd0JBQXdCLFVBQVUsUUFBVyxlQUFlLEtBQUssb0JBQW9CLEdBQUcsQ0FBQztBQUNyTyxhQUFLLHFCQUFxQixZQUFZLGtCQUFrQixhQUFhO0FBQUEsTUFDdEUsT0FBTztBQUNOLGFBQUssaUJBQWlCLFdBQTBFLGlDQUFpQyxFQUFFLFNBQVMsMEJBQTBCLFVBQVUsUUFBVyxlQUFlLEtBQUssb0JBQW9CLEdBQUcsQ0FBQztBQUN2TyxhQUFLLHFCQUFxQixZQUFZLGtCQUFrQixNQUFNO0FBQUEsTUFDL0Q7QUFBQSxJQUNEO0FBQ0EsU0FBSywyQkFBMkIsSUFBSSxxQkFBcUI7QUFDekQsU0FBSywyQkFBMkIsSUFBSSxzQkFBc0IsU0FBUyxNQUFNO0FBQ3hFLDZCQUF1QjtBQUFBLElBQ3hCLENBQUMsQ0FBQztBQUNGLFNBQUssMkJBQTJCLElBQUksc0JBQXNCLG9CQUFvQixTQUFTLE1BQU07QUFDNUYsNEJBQXNCLFVBQVUsQ0FBQyxzQkFBc0I7QUFDdkQsNkJBQXVCO0FBQUEsSUFDeEIsQ0FBQyxDQUFDO0FBRUYsVUFBTSxTQUFTO0FBQUEsTUFBRTtBQUFBLE1BQVcsQ0FBQztBQUFBLE1BQzVCLEVBQUUsMkJBQTJCLENBQUMsR0FBRyxLQUFLLGVBQWUsUUFBUTtBQUFBLE1BQzdELEVBQUUsMEJBQTBCLENBQUMsR0FBRyxTQUFTLEVBQUUsS0FBSyxpQ0FBaUMsU0FBUyxDQUFDLHdDQUF3QyxFQUFFLEdBQUcsaUJBQWlCLENBQUM7QUFBQSxJQUMzSjtBQUVBLFVBQU0sYUFBYSxFQUFFLDZDQUE2QyxDQUFDLENBQUU7QUFDckUsVUFBTSxjQUFjLEVBQUUsOENBQThDLENBQUMsQ0FBRTtBQUV2RSxVQUFNLFlBQVksS0FBSyxlQUFlO0FBQ3RDLFVBQU0sYUFBYSxLQUFLLHdCQUF3QjtBQUNoRCxVQUFNLHFCQUFxQixLQUFLLG9DQUFvQztBQUVwRSxVQUFNLGlCQUFnQyxDQUFDO0FBQ3ZDLFFBQUksb0JBQW9CLEtBQUssc0JBQXNCLEdBQUc7QUFDckQsWUFBTSxlQUFlO0FBQUEsUUFDcEI7QUFBQSxVQUNDLFVBQVU7QUFBQSxVQUNWLFFBQVE7QUFBQSxRQUNUO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDTjtBQUNBLFdBQUssMkJBQTJCLElBQUksYUFBYSxXQUFXO0FBQzVELHFCQUFlLEtBQUssYUFBYSxPQUFPO0FBQUEsSUFDekM7QUFDQSxtQkFBZSxLQUFLO0FBQUEsTUFBRTtBQUFBLE1BQW1CLENBQUM7QUFBQSxNQUN6QyxzQkFBc0I7QUFBQSxNQUN0QjtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sU0FBUyxFQUFFLFdBQVcsQ0FBQyxHQUFHLEdBQUcsY0FBYztBQUVqRCxVQUFNLGNBQWMsTUFBTTtBQUN6QixVQUFJLG1CQUFtQixXQUFXO0FBQ2pDLGFBQUssVUFBVSxVQUFVLE9BQU8sZ0JBQWdCO0FBQ2hELGNBQU0sYUFBYSxtQkFBbUIsY0FBYyxDQUFDO0FBQUEsTUFDdEQsT0FDSztBQUNKLGFBQUssVUFBVSxVQUFVLElBQUksZ0JBQWdCO0FBQzdDLGNBQU0sV0FBVztBQUFBLE1BQ2xCO0FBQ0EsaUJBQVcsTUFBTSxLQUFLLHlCQUF5QixZQUFZLEdBQUcsRUFBRTtBQUNoRSx1QkFBaUI7QUFBQSxJQUNsQjtBQUVBLFVBQU0sbUJBQW1CLE1BQU07QUFDOUIsVUFBSSxLQUFLLFVBQVUsVUFBVSxTQUFTLGdCQUFnQixHQUFHO0FBQ3hELG1CQUFXLFNBQVMsRUFBRTtBQUN0QixjQUFNLFlBQVksVUFBVSxjQUFjLENBQUM7QUFDM0MsY0FBTSxhQUFhLFdBQVcsY0FBYyxDQUFDO0FBQUEsTUFDOUMsT0FBTztBQUNOLG1CQUFXLFNBQVMsQ0FBQztBQUNyQixjQUFNLFlBQVksVUFBVSxjQUFjLEdBQUcsV0FBVyxjQUFjLENBQUM7QUFBQSxNQUN4RTtBQUFBLElBQ0Q7QUFFQSx1QkFBbUIsWUFBWSxXQUFXO0FBQzFDLGdCQUFZO0FBRVosVUFBTSxLQUFLLGlCQUFpQixFQUFFLHNDQUFzQyxDQUFDLEdBQUcsUUFBUSxZQUFZLGFBQWEsTUFBTyxDQUFDO0FBQ2pILFNBQUsseUJBQXlCLFlBQVk7QUFFMUMsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSywwQkFBMEI7QUFFL0IsVUFBTSxjQUFjLEtBQUs7QUFDekIsUUFBSSxhQUFhLGtCQUFrQjtBQUNsQyxXQUFLLHFCQUFxQixLQUFLLHlCQUF5QixLQUFLLGNBQVksU0FBUyxPQUFPLFlBQVksZ0JBQWdCO0FBRXJILFVBQUksQ0FBQyxLQUFLLG9CQUFvQjtBQUM3QixhQUFLLDJCQUEyQixLQUFLLHNCQUFzQixnQkFBZ0I7QUFDM0UsYUFBSyxxQkFBcUIsS0FBSyx5QkFBeUIsS0FBSyxjQUFZLFNBQVMsT0FBTyxZQUFZLGdCQUFnQjtBQUNySCxZQUFJLEtBQUssb0JBQW9CO0FBQzVCLGVBQUssbUJBQW1CLFlBQVksa0JBQWtCLFlBQVksY0FBYyxhQUFhO0FBQzdGLGVBQUssU0FBUyxTQUFTO0FBQ3ZCO0FBQUEsUUFDRDtBQUFBLE1BQ0QsT0FDSztBQUNKLGFBQUssbUJBQW1CLFlBQVksa0JBQWtCLFlBQVksY0FBYyxhQUFhO0FBQzdGLGFBQUssU0FBUyxTQUFTO0FBQ3ZCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssYUFBYSx1QkFBdUIsS0FBSyxlQUFlLHVCQUF1QjtBQUN2RixZQUFNLGtCQUFrQixFQUFFLG9CQUFvQjtBQUM5QyxXQUFLLHFCQUFxQixlQUFlO0FBQ3pDLGFBQU8sWUFBWSxlQUFlO0FBQUEsSUFDbkMsV0FBVyxDQUFDLEtBQUssZUFBZSx5QkFBeUIsS0FBSywyQkFBMkIsS0FBSyxlQUFlLE1BQU0sYUFBYSxXQUFXLEtBQUssQ0FBQyxLQUFLLHFCQUFxQixTQUFrQiw4Q0FBOEMsR0FBRztBQUM3TyxZQUFNLHlCQUF5QixLQUFLLGVBQWUsSUFBSSw0QkFBNEIsYUFBYSxXQUFXLE1BQUssb0JBQUksS0FBSyxHQUFFLFlBQVk7QUFDdkksWUFBTSx5QkFBMEIsQ0FBQyxvQkFBSSxLQUFLLElBQU0sQ0FBQyxJQUFJLEtBQUssc0JBQXNCLEtBQU0sTUFBTyxLQUFLLEtBQUs7QUFDdkcsWUFBTSx1QkFBdUIsd0JBQXdCLElBQUksd0JBQXdCO0FBRWpGLFVBQUkseUJBQXlCLHVCQUF1QjtBQUNuRCxjQUFNLFFBQVEsS0FBSyx5QkFBeUIsT0FBTyxPQUFLLENBQUMsRUFBRSxRQUFRLEtBQUssZUFBZSxvQkFBb0IsRUFBRSxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQ3JILFlBQUksU0FBUyxLQUFLLGFBQWE7QUFDOUIsZUFBSyxxQkFBcUI7QUFDMUIsZUFBSyxZQUFZLG1CQUFtQixLQUFLLG9CQUFvQjtBQUM3RCxlQUFLLFlBQVksdUJBQXVCLEtBQUssbUJBQW1CO0FBQ2hFLGVBQUssbUJBQW1CLEtBQUssWUFBWSxrQkFBa0IsUUFBVyxhQUFhO0FBQ25GLGVBQUs7QUFBQSxZQUFTO0FBQUEsWUFBVztBQUFBO0FBQUEsVUFBc0I7QUFDL0M7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLFNBQVMsWUFBWTtBQUFBLEVBQzNCO0FBQUEsRUFFUSwwQkFBZ0U7QUFDdkUsVUFBTSxlQUFlLENBQUMsV0FBd0I7QUFDN0MsVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSSxlQUFlLE1BQU0sR0FBRztBQUMzQix5QkFBaUIsRUFBRSxXQUFXLE9BQU8sVUFBVTtBQUMvQyxtQkFBVyxPQUFPLFNBQVMsS0FBSyxhQUFhLGtCQUFrQixPQUFPLFdBQVcsRUFBRSxTQUFTLFVBQVUsS0FBSyxDQUFDO0FBQzVHLHNCQUFjLE9BQU87QUFBQSxNQUN0QixPQUFPO0FBQ04sbUJBQVcsT0FBTyxTQUFTLEtBQUssYUFBYSxrQkFBa0IsT0FBTyxXQUFXLEVBQUUsU0FBUyxVQUFVLEtBQUssQ0FBQztBQUM1Ryx5QkFBaUIsRUFBRSxjQUFjLE9BQU8sVUFBVSxXQUFXO0FBQzdELHNCQUFjLE9BQU8sVUFBVTtBQUFBLE1BQ2hDO0FBRUEsWUFBTSxFQUFFLE1BQU0sV0FBVyxJQUFJLGlCQUFpQixRQUFRO0FBRXRELFlBQU0sS0FBSyxFQUFFLElBQUk7QUFDakIsWUFBTSxPQUFPLEVBQUUsb0JBQW9CO0FBRW5DLFdBQUssWUFBWTtBQUNqQixXQUFLLFFBQVE7QUFDYixXQUFLLGFBQWEsY0FBYyxTQUFTLGtDQUFrQyxpQ0FBaUMsTUFBTSxVQUFVLENBQUM7QUFDN0gsV0FBSyxpQkFBaUIsU0FBUyxPQUFLO0FBQ25DLGFBQUssaUJBQWlCLFdBQTBFLGlDQUFpQyxFQUFFLFNBQVMsY0FBYyxVQUFVLFFBQVcsZUFBZSxLQUFLLG9CQUFvQixHQUFHLENBQUM7QUFDM04sYUFBSyxZQUFZLFdBQVcsQ0FBQyxjQUFjLEdBQUc7QUFBQSxVQUM3QyxnQkFBZ0IsRUFBRSxXQUFXLEVBQUU7QUFBQSxVQUMvQixpQkFBaUIsT0FBTyxtQkFBbUI7QUFBQTtBQUFBLFFBQzVDLENBQUM7QUFDRCxVQUFFLGVBQWU7QUFDakIsVUFBRSxnQkFBZ0I7QUFBQSxNQUNuQixDQUFDO0FBQ0QsU0FBRyxZQUFZLElBQUk7QUFFbkIsWUFBTSxPQUFPLEVBQUUsTUFBTTtBQUNyQixXQUFLLFVBQVUsSUFBSSxNQUFNO0FBQ3pCLFdBQUssVUFBVSxJQUFJLFFBQVE7QUFDM0IsV0FBSyxZQUFZO0FBQ2pCLFdBQUssUUFBUTtBQUNiLFNBQUcsWUFBWSxJQUFJO0FBRW5CLFlBQU0sZUFBZSxFQUFFLDhFQUE4RTtBQUFBLFFBQ3BHLFlBQVk7QUFBQSxRQUNaLFFBQVE7QUFBQSxRQUNSLFNBQVMsU0FBUyw0QkFBNEIsNkJBQTZCO0FBQUEsUUFDM0UsY0FBYyxTQUFTLHFDQUFxQyxtQ0FBbUMsSUFBSTtBQUFBLE1BQ3BHLENBQUM7QUFDRCxZQUFNLGVBQWUsT0FBTyxNQUFhO0FBQ3hDLFVBQUUsZUFBZTtBQUNqQixVQUFFLGdCQUFnQjtBQUNsQixjQUFNLEtBQUssa0JBQWtCLHFCQUFxQixDQUFDLFdBQVcsQ0FBQztBQUFBLE1BQ2hFO0FBQ0EsbUJBQWEsaUJBQWlCLFNBQVMsWUFBWTtBQUNuRCxtQkFBYSxpQkFBaUIsV0FBVyxPQUFNLE1BQUs7QUFDbkQsY0FBTSxRQUFRLElBQUksc0JBQXNCLENBQUM7QUFDekMsWUFBSSxNQUFNLFlBQVksUUFBUSxTQUFTLE1BQU0sWUFBWSxRQUFRLE9BQU87QUFDdkUsZ0JBQU0sYUFBYSxDQUFDO0FBQUEsUUFDckI7QUFBQSxNQUNELENBQUM7QUFDRCxTQUFHLFlBQVksWUFBWTtBQUUzQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0scUJBQXFCLEtBQUssbUJBQW1CLFFBQVEsSUFBSTtBQUFBLE1BQzlEO0FBQUEsUUFDQyxPQUFPLFNBQVMsVUFBVSxRQUFRO0FBQUEsUUFDbEMsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFVBQUU7QUFBQSxVQUFpQixDQUFDO0FBQUEsVUFDMUIsU0FBUyxhQUFhLDZCQUE2QjtBQUFBLFVBQ25ELEVBQUUsc0JBQXNCLEVBQUUsY0FBYyxhQUFhLEdBQUcsU0FBUyxjQUFjLGVBQWUsQ0FBQztBQUFBLFVBQy9GLFNBQVMsV0FBVyxXQUFXO0FBQUEsUUFBQztBQUFBLFFBRWpDLE1BQU07QUFBQSxVQUFFO0FBQUEsVUFBUyxDQUFDO0FBQUEsVUFDakI7QUFBQSxZQUFFO0FBQUEsWUFDRDtBQUFBLGNBQ0MsY0FBYztBQUFBLGNBQ2QsT0FBTyxTQUFTLHFCQUFxQiwrQkFBK0IsS0FBSyxtQkFBbUIsaUJBQWlCLEVBQUUsQ0FBQztBQUFBLFlBQ2pIO0FBQUEsWUFBRyxTQUFTLFdBQVcsU0FBUztBQUFBLFVBQUM7QUFBQSxRQUFDO0FBQUEsUUFDcEMsZUFBZTtBQUFBLFFBQ2YsZ0JBQWdCLEtBQUs7QUFBQSxNQUN0QjtBQUFBLElBQUM7QUFFRix1QkFBbUIsWUFBWSxNQUFNLEtBQUssMEJBQTBCLENBQUM7QUFDckUsU0FBSyxlQUFlLEtBQUssQ0FBQyxFQUFFLFdBQVcsTUFBTTtBQUM1QyxZQUFNLG1CQUFtQixLQUFLLHFCQUFxQixVQUFVO0FBRTdELFlBQU0sZ0JBQWdCLE1BQU07QUFDM0IsMkJBQW1CLFdBQVcsZ0JBQWdCO0FBQUEsTUFDL0M7QUFFQSxvQkFBYztBQUNkLHlCQUFtQixTQUFTLEtBQUssYUFBYSxzQkFBc0IsTUFBTSxjQUFjLENBQUMsQ0FBQztBQUFBLElBQzNGLENBQUMsRUFBRSxNQUFNLGlCQUFpQjtBQUUxQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEscUJBQXFCLFlBQWlFO0FBQzdGLFdBQU8sV0FDTCxPQUFPLFlBQVUsQ0FBQyxLQUFLLHdCQUF3QixtQkFBbUIsa0JBQWtCLE1BQU0sSUFBSSxPQUFPLFlBQVksT0FBTyxTQUFTLENBQUMsRUFDbEksSUFBSSxhQUFXLEVBQUUsR0FBRyxRQUFRLElBQUksa0JBQWtCLE1BQU0sSUFBSSxPQUFPLFVBQVUsS0FBSyxPQUFPLFVBQVUsU0FBUyxFQUFFLEVBQUU7QUFBQSxFQUNuSDtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLG1CQUFtQixPQUFPO0FBQ25DO0FBQUEsSUFDRDtBQUVBLFNBQUssZUFBZSxLQUFLLENBQUMsRUFBRSxXQUFXLE1BQU07QUFDNUMsWUFBTSxtQkFBbUIsS0FBSyxxQkFBcUIsVUFBVTtBQUM3RCxXQUFLLG1CQUFtQixPQUFPLFdBQVcsZ0JBQWdCO0FBQUEsSUFDM0QsQ0FBQyxFQUFFLE1BQU0saUJBQWlCO0FBQUEsRUFDM0I7QUFBQSxFQUVRLGlCQUFrRTtBQUN6RSxVQUFNLG1CQUFtQixDQUFDLFVBQ3pCO0FBQUEsTUFBRTtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQUc7QUFBQSxRQUFFO0FBQUEsUUFDTDtBQUFBLFVBQ0MsY0FBYyxzQkFBc0IsTUFBTTtBQUFBLFVBQzFDLE9BQU8sTUFBTSxjQUFjLE1BQU0sS0FBSyxtQkFBbUIsTUFBTSxPQUFPO0FBQUEsUUFDdkU7QUFBQSxRQUNBLEtBQUssY0FBYyxLQUFLO0FBQUEsUUFDeEIsRUFBRSxRQUFRLENBQUMsR0FBRyxNQUFNLEtBQUs7QUFBQSxNQUFDO0FBQUEsSUFBQztBQUU5QixVQUFNLFlBQVksS0FBSyxVQUFVLFFBQVEsSUFBSTtBQUFBLE1BQzVDO0FBQUEsUUFDQyxPQUFPLFNBQVMsU0FBUyxPQUFPO0FBQUEsUUFDaEMsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsZUFBZTtBQUFBLFFBQ2YsYUFBYSxPQUFLLENBQUMsRUFBRTtBQUFBLFFBQ3JCLGdCQUFnQixLQUFLO0FBQUEsTUFDdEI7QUFBQSxJQUFDO0FBRUYsY0FBVSxXQUFXLGtCQUFrQjtBQUN2QyxjQUFVLFlBQVksTUFBTSxLQUFLLDBCQUEwQixDQUFDO0FBQzVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQ0FBcUY7QUFFNUYsVUFBTSxrQ0FBa0MsQ0FBQyxhQUFnRDtBQUV4RixZQUFNLGtCQUFrQixTQUFTLFlBQVksU0FBUyxhQUFhLENBQUMsU0FBUztBQUM3RSxZQUFNLFdBQVcsRUFBRSxjQUFjLENBQUMsQ0FBQztBQUNuQyxVQUFJLFNBQVMsVUFBVTtBQUN0QixjQUFNLFVBQVUsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLFNBQVMsT0FBTyxLQUFLLENBQUMsQ0FBQztBQUFBLE1BQy9ELFdBQVcsU0FBUyxVQUFVO0FBQzdCLGNBQU0sVUFBVSxFQUFFLGNBQWMsQ0FBQyxHQUFHLFNBQVMsRUFBRSxLQUFLLFlBQVksU0FBUyxDQUFDLGdGQUFnRixFQUFFLEdBQUcsU0FBUyxDQUFDLENBQUM7QUFBQSxNQUMzSztBQUVBLFlBQU0sZ0JBQWdCLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztBQUM3QyxZQUFNLHFCQUFxQixFQUFFLHdCQUF3QixDQUFDLENBQUU7QUFFeEQsVUFBSSxTQUFTLGNBQWMsS0FBSyx5QkFBeUI7QUFDeEQsY0FBTSxlQUFlLEVBQUUsYUFBYSxDQUFDLEdBQUcsRUFBRSw4Q0FBOEMsQ0FBQyxDQUFDO0FBQzFGLGNBQU0sb0JBQW9CLEdBQUcscUJBQXFCLFNBQVMsV0FBVyxDQUFDO0FBQUEsTUFDeEU7QUFFQSxZQUFNLGVBQWUsRUFBRSxpQ0FBaUMsRUFBRSx3QkFBd0IsU0FBUyxHQUFHLENBQUM7QUFDL0YsWUFBTSxjQUFjLEdBQUcscUJBQXFCLFNBQVMsS0FBSyxDQUFDO0FBRTNELGFBQU87QUFBQSxRQUFFLHFDQUFxQyxTQUFTLGNBQWMsS0FBSywwQkFBMEIsY0FBYztBQUFBLFFBQ2pIO0FBQUEsVUFDQyxjQUFjLG9CQUFvQixTQUFTO0FBQUEsVUFDM0MsU0FBUyxTQUFTO0FBQUEsUUFDbkI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFVBQUU7QUFBQSxVQUFpQixDQUFDO0FBQUEsVUFDbkIsS0FBSyxjQUFjLFFBQVE7QUFBQSxVQUMzQjtBQUFBLFVBQ0EsaUJBQWlCLFdBQVcsRUFBRSxXQUFXO0FBQUEsVUFDekMsRUFBRSxnREFBZ0Q7QUFBQSxZQUNqRCxZQUFZO0FBQUEsWUFDWixjQUFjLGtCQUFrQixTQUFTO0FBQUEsWUFDekMsU0FBUyxTQUFTLFNBQVMsTUFBTTtBQUFBLFlBQ2pDLFFBQVE7QUFBQSxZQUNSLGNBQWMsU0FBUyxrQkFBa0IsTUFBTTtBQUFBLFVBQ2hELENBQUM7QUFBQSxRQUNGO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxVQUFFO0FBQUEsVUFBc0IsRUFBRSxzQkFBc0IsU0FBUyxHQUFJO0FBQUEsVUFDNUQ7QUFBQSxZQUFFO0FBQUEsWUFBdUIsRUFBRSxRQUFRLGNBQWM7QUFBQSxZQUNoRCxFQUFFLHFCQUFxQjtBQUFBLFVBQUM7QUFBQSxRQUFDO0FBQUEsTUFBQztBQUFBLElBQzlCO0FBSUEsVUFBTSxrQkFBa0IsQ0FBQyxNQUE0QjtBQUNwRCxVQUFJLE9BQXNCLEVBQUU7QUFFNUIsVUFBSSxFQUFFLFlBQVk7QUFBRSxnQkFBUTtBQUFBLE1BQUc7QUFDL0IsVUFBSSxFQUFFLFVBQVU7QUFBRSxnQkFBUTtBQUFBLE1BQUc7QUFDN0IsVUFBSSxFQUFFLFVBQVU7QUFBRSxnQkFBUTtBQUFBLE1BQUc7QUFDN0IsVUFBSSxFQUFFLGNBQWM7QUFBRSxnQkFBUSxJQUFJLEVBQUU7QUFBQSxNQUFjO0FBRWxELFVBQUksS0FBSyxvQkFBb0IsRUFBRSxJQUFJLEVBQUUsRUFBRSxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQU07QUFDekQsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLHFCQUFxQixLQUFLLG1CQUFtQixRQUFRLElBQUk7QUFBQSxNQUM5RDtBQUFBLFFBQ0MsT0FBTyxTQUFTLGdCQUFnQixjQUFjO0FBQUEsUUFDOUMsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsUUFBUSxFQUFFLHlDQUF5QyxFQUFFLGNBQWMsc0JBQXNCLFlBQVksRUFBRSxHQUFHLFNBQVMsV0FBVyxTQUFTLENBQUM7QUFBQSxRQUN4SSxlQUFlO0FBQUEsUUFDZixhQUFhO0FBQUEsUUFDYixnQkFBZ0IsS0FBSztBQUFBLE1BQ3RCO0FBQUEsSUFBQztBQUVGLHVCQUFtQixZQUFZLE1BQU07QUFDcEMsWUFBTSxTQUFTLEtBQUssb0JBQW9CO0FBQ3hDLFlBQU0seUJBQXlCLE9BQU8sUUFBUSxtQkFBbUIsWUFBWSxLQUFLLHlCQUF5QixPQUFPLE9BQUssS0FBSyxlQUFlLG9CQUFvQixFQUFFLElBQUksQ0FBQyxFQUFFO0FBQ3hLLFdBQUssVUFBVSxVQUFVLE9BQU8sMEJBQTBCLENBQUMsQ0FBQyxzQkFBc0I7QUFDbEYsV0FBSywwQkFBMEI7QUFDL0IsbUNBQTZCLE9BQU8sS0FBSyxjQUFjLEVBQUUsSUFBSSxtQkFBbUIsY0FBYyxDQUFDO0FBQy9GLFdBQUssdUJBQXVCO0FBQUEsSUFDN0IsQ0FBQztBQUVELHVCQUFtQixXQUFXLEtBQUssd0JBQXdCO0FBQzNELGlDQUE2QixPQUFPLEtBQUssY0FBYyxFQUFFLElBQUksbUJBQW1CLGNBQWMsQ0FBQztBQUUvRixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBTyxNQUFpQjtBQUN2QixTQUFLLGlCQUFpQixPQUFPLFlBQVk7QUFFekMsU0FBSyx5QkFBeUIsWUFBWTtBQUMxQyxTQUFLLHNCQUFzQixZQUFZO0FBRXZDLFNBQUssVUFBVSxPQUFPLE9BQU8sSUFBSTtBQUNqQyxTQUFLLG1CQUFtQixPQUFPLE9BQU8sSUFBSTtBQUMxQyxTQUFLLG1CQUFtQixPQUFPLE9BQU8sSUFBSTtBQUUxQyxRQUFJLEtBQUssYUFBYSxnQkFBZ0IsS0FBSyxrQkFBa0I7QUFDNUQsV0FBSyxpQkFBaUIsTUFBTTtBQUM1QixXQUFLLGdCQUFnQixNQUFNO0FBQzNCLFdBQUssb0JBQW9CLEtBQUssWUFBWSxZQUFZO0FBQUEsSUFDdkQ7QUFFQSxTQUFLLGlCQUFpQjtBQUV0QixTQUFLLFVBQVUsVUFBVSxPQUFPLHNCQUFzQixLQUFLLFVBQVUsR0FBRztBQUN4RSxTQUFLLFVBQVUsVUFBVSxPQUFPLHFCQUFxQixLQUFLLFNBQVMsR0FBRztBQUN0RSxTQUFLLFVBQVUsVUFBVSxPQUFPLDBCQUEwQixLQUFLLFNBQVMsR0FBRztBQUUzRSxTQUFLLHlCQUF5QixZQUFZO0FBQzFDLFNBQUssc0JBQXNCLFlBQVk7QUFDdkMsU0FBSyxpQkFBaUIsT0FBTyxZQUFZO0FBQUEsRUFDMUM7QUFBQSxFQUVRLHlCQUF5QjtBQUVoQyxTQUFLLE9BQU8sU0FBUyxpQkFBaUIsb0JBQW9CLEVBQUUsUUFBUSxhQUFXO0FBQzlFLFlBQU0sYUFBYSxRQUFRLGFBQWEsb0JBQW9CO0FBQzVELFlBQU0sV0FBVyxLQUFLLHlCQUF5QixLQUFLLE9BQUssRUFBRSxPQUFPLFVBQVU7QUFDNUUsVUFBSSxDQUFDLFVBQVU7QUFBRTtBQUFBLE1BQVE7QUFFekIsWUFBTSxRQUFRLEtBQUssOEJBQThCLFFBQVE7QUFHekQsWUFBTSxNQUFNLHFCQUFxQixRQUFRLGNBQWMscUJBQXFCLENBQUM7QUFDN0UsVUFBSSxhQUFhLGlCQUFpQixHQUFHO0FBQ3JDLFVBQUksYUFBYSxpQkFBaUIsS0FBSyxNQUFNLGFBQWE7QUFDMUQsVUFBSSxhQUFhLGlCQUFpQixLQUFLLE1BQU0sVUFBVTtBQUN2RCxZQUFNLFdBQVksTUFBTSxnQkFBZ0IsTUFBTSxhQUFjO0FBQzVELFVBQUksTUFBTSxRQUFRLEdBQUcsUUFBUTtBQUU3QixNQUFDLFFBQVEsY0FBOEIsVUFBVSxPQUFPLGVBQWUsTUFBTSxrQkFBa0IsQ0FBQztBQUVoRyxVQUFJLE1BQU0sZUFBZSxNQUFNLGVBQWU7QUFDN0MsWUFBSSxRQUFRLFNBQVMsbUNBQW1DLDJCQUEyQixNQUFNLGFBQWE7QUFBQSxNQUN2RyxPQUNLO0FBQ0osWUFBSSxRQUFRLFNBQVMsb0NBQW9DLDZCQUE2QixNQUFNLGVBQWUsTUFBTSxVQUFVO0FBQUEsTUFDNUg7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixZQUFvQixRQUFpQjtBQUVuRSxRQUFJLENBQUMsS0FBSyx5QkFBeUIsS0FBSyxPQUFLLEVBQUUsT0FBTyxVQUFVLEdBQUc7QUFDbEUsV0FBSywyQkFBMkIsS0FBSyxzQkFBc0IsZ0JBQWdCO0FBQUEsSUFDNUU7QUFFQSxVQUFNLGNBQWMsS0FBSyx5QkFBeUIsS0FBSyxPQUFLLEVBQUUsT0FBTyxVQUFVO0FBQy9FLFFBQUksQ0FBQyxhQUFhO0FBQ2pCLFlBQU0sTUFBTSxzQ0FBc0MsVUFBVTtBQUFBLElBQzdEO0FBRUEsU0FBSyxtQkFBbUIsS0FBSyxpQkFBaUIsS0FBSyxZQUFZO0FBQzlELFVBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxLQUFLLFlBQVk7QUFDdkIsV0FBSyxZQUFZLG1CQUFtQjtBQUNwQyxXQUFLLFlBQVksZUFBZTtBQUNoQyxXQUFLLFlBQVksdUJBQXVCLFlBQVk7QUFDcEQsV0FBSyxxQkFBcUI7QUFDMUIsV0FBSyxtQkFBbUIsWUFBWSxNQUFNO0FBQzFDLFdBQUssU0FBUyxTQUFTO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGNBQWMsVUFBOEU7QUFDbkcsVUFBTSxTQUFTLFNBQVMsS0FBSyxTQUFTLFNBQVMsRUFBRSxVQUFVLGNBQWMsU0FBUyxLQUFLLElBQUksQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUUsS0FBSyxTQUFTLEtBQUssS0FBSyxDQUFDO0FBQ2xKLFdBQU8sVUFBVSxJQUFJLGFBQWE7QUFDbEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHVCQUF1QjtBQUM5QixVQUFNLFdBQVcsS0FBSyxjQUFjLFFBQVEsS0FBSyxLQUFLLEVBQUU7QUFDeEQsUUFBSSxDQUFDLFlBQVksU0FBUyxTQUFTLE9BQU8sS0FBSyxVQUFVLFVBQVUsU0FBUyxtQkFBbUIsS0FBSyxLQUFLLFVBQVUsVUFBVSxTQUFTLHdCQUF3QixHQUFHO0FBQUU7QUFBQSxJQUFRO0FBQzNLLFFBQUksS0FBSyxjQUFjLFVBQVUsR0FBRztBQUNuQyxZQUFNLDRCQUE0QixrQ0FBa0MsS0FBSyxvQkFBb0I7QUFDN0YsWUFBTSxZQUFZLEtBQUssY0FBYyxTQUFTLEtBQUssY0FBYyxPQUFPLENBQUMsR0FBRyx5QkFBeUI7QUFDckcsV0FBSyxjQUFjLGNBQWMsU0FBUztBQUFBLElBQzNDO0FBRUEsVUFBTSx5QkFBeUIsS0FBSyxjQUFjLFVBQVUsWUFBWSxvQkFBb0IsRUFBRSxLQUFLLFdBQVMsRUFBRSxNQUFNLHdCQUF3QixvQkFBb0I7QUFDaEssUUFBSSx3QkFBd0I7QUFDM0IsV0FBSyxjQUFjLGNBQWMsc0JBQXNCO0FBQ3ZELDZCQUF1QixNQUFNO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUEsRUFDUSxlQUFlLE1BQWM7QUFFcEMsVUFBTSxZQUFZLEtBQUssV0FBVyxVQUFVO0FBQzVDLFVBQU0sU0FBUyxLQUFLLFdBQVcsaUJBQWlCO0FBQ2hELFVBQU0sVUFBVSxLQUFLLFFBQVEsc0JBQXNCLFVBQVU7QUFFN0QsU0FBSyxpQkFBaUIsV0FBMEUsaUNBQWlDLEVBQUUsU0FBUyxpQkFBaUIsVUFBVSxNQUFNLGVBQWUsS0FBSyxvQkFBb0IsR0FBRyxDQUFDO0FBRXpOLFFBQUksUUFBUTtBQUNYLFdBQUsscUJBQXFCO0FBQUEsSUFDM0I7QUFDQSxRQUFJLFdBQVc7QUFDZCxZQUFNLGFBQWEsSUFBSSxNQUFNLE9BQU87QUFHcEMsVUFBSSxPQUFPLENBQUM7QUFDWixVQUFJO0FBQ0gsZUFBTyxNQUFNLG1CQUFtQixXQUFXLEtBQUssQ0FBQztBQUFBLE1BQ2xELFFBQVE7QUFFUCxZQUFJO0FBQ0gsaUJBQU8sTUFBTSxXQUFXLEtBQUs7QUFBQSxRQUM5QixRQUFRO0FBQUEsUUFFUjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLENBQUMsTUFBTSxRQUFRLElBQUksR0FBRztBQUN6QixlQUFPLENBQUMsSUFBSTtBQUFBLE1BQ2I7QUFHQSxXQUFLLFdBQVcsU0FBUyxxQkFBcUIsR0FBRyxTQUFTLEtBQ3pELFdBQVcsU0FBUyxpQkFBaUIsR0FBRyxTQUFTLE1BQ2pELEtBQUssd0JBQXdCLGFBQWEsRUFBRSxRQUFRLFdBQVcsR0FBRztBQUVsRSxjQUFNLG9CQUFvQixLQUFLLG9CQUFvQixNQUFNLFVBQVUsVUFBUSxLQUFLLE9BQU8sS0FBSyxhQUFhLFlBQVk7QUFHckgsWUFBSSxzQkFBc0IsVUFDekIsb0JBQW9CLE1BQ3BCLEtBQUssb0JBQW9CLE1BQU0sTUFBTSxvQkFBb0IsQ0FBQyxFQUFFLEtBQUssVUFBUSxDQUFDLEtBQUssSUFBSSxHQUFHO0FBQ3RGLGdCQUFNLGNBQXFELEVBQUUsUUFBUSwrQkFBK0IsSUFBSSxVQUFVLEtBQUssYUFBYSxrQkFBa0IsTUFBTSxLQUFLLGFBQWEsYUFBYTtBQUczTCxlQUFLLGVBQWU7QUFBQSxZQUNuQjtBQUFBLFlBQ0EsS0FBSyxVQUFVLFdBQVc7QUFBQSxZQUMxQixhQUFhO0FBQUEsWUFBUyxjQUFjO0FBQUEsVUFBTztBQUFBLFFBQzdDO0FBQUEsTUFDRDtBQUVBLFdBQUssZUFBZSxlQUFlLFdBQVcsTUFBTSxHQUFHLElBQUksRUFBRSxLQUFLLFlBQVU7QUFDM0UsY0FBTSxTQUFVLFFBQWlDO0FBQ2pELFlBQUksUUFBUTtBQUNYLGNBQUksQ0FBQyxJQUFJLE1BQU0sTUFBTSxHQUFHO0FBQ3ZCLG9CQUFRLEtBQUsscUNBQXFDLE1BQU0sdUNBQXVDLFFBQVEsMkJBQTJCO0FBQ2xJO0FBQUEsVUFDRDtBQUNBLGdCQUFNLGNBQXFELEVBQUUsUUFBUSxPQUFPLFNBQVMsR0FBRyxVQUFVLEtBQUssYUFBYSxrQkFBa0IsTUFBTSxLQUFLLGFBQWEsYUFBYTtBQUMzSyxlQUFLLGVBQWU7QUFBQSxZQUNuQjtBQUFBLFlBQ0EsS0FBSyxVQUFVLFdBQVc7QUFBQSxZQUMxQixhQUFhO0FBQUEsWUFBUyxjQUFjO0FBQUEsVUFBTztBQUM1QyxlQUFLLFlBQVksV0FBVyxDQUFDLEVBQUUsV0FBVyxPQUFPLENBQUMsQ0FBQztBQUFBLFFBQ3BEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sV0FBSyxjQUFjLEtBQUssU0FBUyxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsSUFDekQ7QUFFQSxRQUFJLENBQUMsY0FBYyxLQUFLLFdBQVcsVUFBVSxLQUFLLEtBQUssV0FBVyxTQUFTLElBQUk7QUFDOUUsV0FBSyxzQkFBc0IsZ0JBQWdCLFlBQVksSUFBSTtBQUFBLElBQzVEO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQXlCLFdBQXdCLE1BQW9CO0FBQzVFLFdBQU8sVUFBVSxZQUFZO0FBQUUsZ0JBQVUsV0FBVyxPQUFPO0FBQUEsSUFBRztBQUU5RCxlQUFXLGNBQWMsTUFBTTtBQUM5QixVQUFJLFdBQVcsTUFBTSxXQUFXLEtBQUssT0FBTyxXQUFXLE1BQU0sQ0FBQyxNQUFNLFVBQVU7QUFDN0UsY0FBTSxPQUFPLFdBQVcsTUFBTSxDQUFDO0FBQy9CLGNBQU0sa0JBQWtCLE9BQU8sV0FBVyxFQUFFLG1CQUFtQixDQUFDO0FBQ2hFLGNBQU0sU0FBUyxJQUFJLE9BQU8saUJBQWlCLEVBQUUsT0FBTyxLQUFLLE9BQU8sY0FBYyxNQUFNLEdBQUcsb0JBQW9CLENBQUM7QUFFNUcsY0FBTSxZQUFZLEtBQUssS0FBSyxXQUFXLFVBQVU7QUFDakQsY0FBTSxVQUFVLEtBQUssS0FBSyxRQUFRLHNCQUFzQixVQUFVO0FBRWxFLGVBQU8sUUFBUSxLQUFLO0FBQ3BCLGVBQU8sV0FBVyxPQUFLO0FBQ3RCLFlBQUUsZ0JBQWdCO0FBQ2xCLFlBQUUsZUFBZTtBQUNqQixlQUFLLGVBQWUsS0FBSyxJQUFJO0FBQUEsUUFDOUIsR0FBRyxNQUFNLEtBQUssc0JBQXNCO0FBRXBDLFlBQUksV0FBVztBQUNkLGdCQUFNLGFBQWEsS0FBSyxjQUFjLE9BQU87QUFDN0MsY0FBSSxZQUFZO0FBQ2Ysa0JBQU0sa0JBQWtCLEVBQUUseUJBQXlCLENBQUMsR0FBRyxTQUFTLDhCQUE4Qiw2QkFBNkIsQ0FBQztBQUM1SCxzQkFBVSxZQUFZLGVBQWU7QUFDckMsa0JBQU0sUUFBUSxJQUFJLGdCQUFnQixpQkFBaUIsSUFBSSxFQUFFLEdBQUcsNkJBQTZCLENBQUM7QUFDMUYsa0JBQU0sSUFBSSxVQUFVO0FBQ3BCLGlCQUFLLHVCQUF1QixJQUFJLEtBQUs7QUFBQSxVQUN0QztBQUFBLFFBQ0Q7QUFFQSxhQUFLLHVCQUF1QixJQUFJLE1BQU07QUFBQSxNQUN2QyxPQUFPO0FBQ04sY0FBTSxJQUFJLE9BQU8sV0FBVyxFQUFFLEdBQUcsQ0FBQztBQUNsQyxtQkFBVyxRQUFRLFdBQVcsT0FBTztBQUNwQyxjQUFJLE9BQU8sU0FBUyxVQUFVO0FBQzdCLGtCQUFNLGdCQUFnQixxQkFBcUIsSUFBSTtBQUMvQyx1QkFBVyxXQUFXLGVBQWU7QUFDcEMsa0JBQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsa0JBQUUsWUFBWSxvQkFBb0IsU0FBUyxFQUFFLG9CQUFvQixLQUFLLEdBQUcsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUFBLGNBQ3BGLE9BQU87QUFDTixrQkFBRSxZQUFZLE9BQU87QUFBQSxjQUN0QjtBQUFBLFlBQ0Q7QUFBQSxVQUNELE9BQU87QUFDTixrQkFBTSxnQkFBdUIsY0FBYyxLQUFLLE1BQU0sUUFBUSxJQUFJLEtBQUssY0FBYyxLQUFLLE1BQU0sUUFBUSxLQUFLLElBQUksRUFBRSxHQUFHLE1BQU0sT0FBTyxLQUFLLEtBQUssSUFBSTtBQUNqSixrQkFBTSxPQUFPLEtBQUsscUJBQXFCLGVBQWUsTUFBTSxHQUFHLGVBQWUsRUFBRSxRQUFRLENBQUMsU0FBUyxLQUFLLGVBQWUsSUFBSSxFQUFFLENBQUM7QUFDN0gsaUJBQUssdUJBQXVCLElBQUksSUFBSTtBQUFBLFVBQ3JDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVTLGFBQWE7QUFDckIsU0FBSyxnQkFBZ0IsTUFBTTtBQUMzQixVQUFNLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRVEsbUJBQW1CLFlBQW9CLGNBQXVCLGVBQXlCO0FBQzlGLFFBQUksQ0FBQyxLQUFLLGFBQWE7QUFDdEI7QUFBQSxJQUNEO0FBR0EsU0FBSyxpQkFBaUIsa0NBQWtDLEVBQUUsS0FBSyxNQUFNO0FBRXBFLFdBQUssaUJBQWlCLGdCQUFnQixpQkFBaUIsV0FBVyxRQUFRLFVBQVUsRUFBRSxDQUFDLEVBQUU7QUFBQSxJQUMxRixDQUFDO0FBRUQsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLGlCQUFpQixNQUFNO0FBRTVCLFVBQU0sV0FBVyxLQUFLLHlCQUF5QixLQUFLLENBQUFDLGNBQVlBLFVBQVMsT0FBTyxVQUFVO0FBQzFGLFFBQUksQ0FBQyxVQUFVO0FBQ2QsWUFBTSxNQUFNLHFDQUFxQyxVQUFVO0FBQUEsSUFDNUQ7QUFFQSxVQUFNLHVCQUF1QixFQUFFLGlEQUFpRCxFQUFFLDhCQUE4QixTQUFTLEdBQUcsQ0FBQztBQUM3SCxTQUFLLHlCQUF5QixzQkFBc0IsaUJBQWlCLFNBQVMsV0FBVyxDQUFDO0FBRTFGLFVBQU0sOEJBQ0w7QUFBQSxNQUFFO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRDtBQUFBLFFBQUU7QUFBQSxRQUFtQyxDQUFDO0FBQUEsUUFDckMsRUFBRSxpQ0FBaUMsRUFBRSx3QkFBd0IsU0FBUyxHQUFHLEdBQUcsR0FBRyxxQkFBcUIsU0FBUyxLQUFLLENBQUM7QUFBQSxRQUNuSDtBQUFBLE1BQW9CO0FBQUEsSUFBQztBQUV4QixVQUFNLG9CQUFvQixFQUFFLHNCQUFzQjtBQUVsRCxTQUFLLHVCQUF1QixJQUFJLHNCQUFzQixtQkFBbUIsV0FBVyxDQUFDLE1BQU07QUFDMUYsWUFBTSxRQUFRLElBQUksc0JBQXNCLENBQUM7QUFDekMsWUFBTSxtQkFBbUIsTUFDeEIsU0FBUyxNQUFNLFVBQVUsQ0FBQUMsT0FBS0EsR0FBRSxPQUFPLEtBQUssYUFBYSxZQUFZO0FBRXRFLFVBQUksTUFBTSxZQUFZLFFBQVEsU0FBUztBQUN0QyxjQUFNQyxZQUFXLFNBQVMsTUFBTSxPQUFPLENBQUMsTUFBTSxVQUFVLFFBQVEsaUJBQWlCLEtBQUssS0FBSyxlQUFlLG9CQUFvQixLQUFLLElBQUksQ0FBQztBQUN4SSxZQUFJQSxVQUFTLFFBQVE7QUFDcEIsZUFBSyxXQUFXQSxVQUFTQSxVQUFTLFNBQVMsQ0FBQyxFQUFFLElBQUksS0FBSztBQUFBLFFBQ3hEO0FBQUEsTUFDRDtBQUNBLFVBQUksTUFBTSxZQUFZLFFBQVEsV0FBVztBQUN4QyxjQUFNQSxZQUFXLFNBQVMsTUFBTSxLQUFLLENBQUMsTUFBTSxVQUFVLFFBQVEsaUJBQWlCLEtBQUssS0FBSyxlQUFlLG9CQUFvQixLQUFLLElBQUksQ0FBQztBQUN0SSxZQUFJQSxXQUFVO0FBQ2IsZUFBSyxXQUFXQSxVQUFTLElBQUksS0FBSztBQUFBLFFBQ25DO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsUUFBSSxnQkFBd0Q7QUFFNUQsVUFBTSxxQkFBcUIsSUFBSSxJQUFJLFNBQVMsTUFBTSxRQUFRLFVBQVEsS0FBSyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBRW5GLFVBQU0sZ0JBQWdCLE1BQU07QUFFM0IsZUFBUyxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxRQUFRLEVBQUUsS0FBSztBQUMvQyxZQUFNLFdBQVcsU0FBUyxNQUN4QixPQUFPLFVBQVEsS0FBSyxlQUFlLG9CQUFvQixLQUFLLElBQUksQ0FBQztBQUVuRSxVQUFJLE9BQU8sZUFBZSxVQUFVLENBQUMsR0FBRyxNQUFNLEVBQUUsT0FBTyxFQUFFLEVBQUUsR0FBRztBQUM3RDtBQUFBLE1BQ0Q7QUFFQSxzQkFBZ0I7QUFFaEIsWUFBTSxtQkFBbUIsR0FBRyxjQUMxQixJQUFJLFVBQVE7QUFDWixjQUFNLFVBQVU7QUFBQSxVQUFFLGNBQWMsS0FBSyxPQUFPLGNBQWMsVUFBVSxjQUFjLDRCQUE0QixJQUFJLFVBQVUsY0FBYyw4QkFBOEI7QUFBQSxVQUN2SztBQUFBLFlBQ0MscUJBQXFCLEtBQUs7QUFBQSxZQUMxQixjQUFjLDBCQUEwQixLQUFLO0FBQUEsWUFDN0MsUUFBUTtBQUFBLFlBQ1IsZ0JBQWdCLEtBQUssT0FBTyxTQUFTO0FBQUEsWUFDckMsY0FBYyxLQUFLLE9BQ2hCLFNBQVMsWUFBWSxrQkFBa0IsS0FBSyxLQUFLLElBQ2pELFNBQVMsZUFBZSxzQkFBc0IsS0FBSyxLQUFLO0FBQUEsVUFDNUQ7QUFBQSxRQUFDO0FBRUYsY0FBTSxZQUFZLEVBQUUsK0JBQStCLEVBQUUsMEJBQTBCLEtBQUssR0FBRyxDQUFDO0FBQ3hGLGFBQUsseUJBQXlCLFdBQVcsS0FBSyxXQUFXO0FBRXpELGNBQU0sWUFBWSxFQUFFLDZCQUE2QixFQUFFLG9CQUFvQixLQUFLLEdBQUcsQ0FBQztBQUNoRixjQUFNLFdBQVcsR0FBRyxxQkFBcUIsS0FBSyxLQUFLLENBQUM7QUFFcEQsY0FBTSxrQkFBa0I7QUFBQSxVQUFFO0FBQUEsVUFBbUIsQ0FBQztBQUFBLFVBQzdDO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFFQSxZQUFJLEtBQUssTUFBTSxTQUFTLFNBQVM7QUFDaEMsMEJBQWdCO0FBQUEsWUFDZixFQUFFLHNCQUFzQixFQUFFLGNBQWMsU0FBUyxnQkFBZ0IscUJBQXFCLEtBQUssTUFBTSxPQUFPLEVBQUUsQ0FBQztBQUFBLFVBQzVHO0FBQUEsUUFDRCxXQUFXLEtBQUssTUFBTSxTQUFTLFNBQVM7QUFDdkMsMEJBQWdCO0FBQUEsWUFDZixFQUFFLHNCQUFzQixFQUFFLGNBQWMsU0FBUyxnQkFBZ0IscUJBQXFCLEtBQUssTUFBTSxPQUFPLEVBQUUsQ0FBQztBQUFBLFVBQzVHO0FBQUEsUUFDRDtBQUVBLGVBQU87QUFBQSxVQUFFO0FBQUEsVUFDUjtBQUFBLFlBQ0MsY0FBYyxnQkFBZ0IsS0FBSztBQUFBLFlBQ25DLGdCQUFnQixLQUFLO0FBQUEsWUFDckIsaUJBQWlCO0FBQUEsWUFDakIsZ0JBQWdCLEtBQUssT0FBTyxTQUFTO0FBQUEsWUFDckMsUUFBUTtBQUFBLFVBQ1Q7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQWU7QUFBQSxNQUNqQixDQUFDLENBQUM7QUFBQSxJQUNKO0FBRUEsa0JBQWM7QUFFZCxTQUFLLHVCQUF1QixJQUFJLEtBQUssZUFBZSxtQkFBbUIsT0FBSztBQUMzRSxVQUFJLEVBQUUsWUFBWSxrQkFBa0IsS0FBSyxLQUFLLHNCQUFzQixLQUFLLGFBQWE7QUFDckYsc0JBQWM7QUFDZCxhQUFLLDBCQUEwQjtBQUMvQixhQUFLLFdBQVcsS0FBSyxZQUFZLGNBQWMsS0FBSztBQUFBLE1BQ3JEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLG1CQUFtQixLQUFLLHlCQUF5QixLQUFLLGVBQWEsVUFBVSxPQUFPLFNBQVMsSUFBSTtBQUV2RyxVQUFNLGlCQUFpQjtBQUFBLE1BQ3RCO0FBQUEsTUFBcUMsRUFBRSxRQUFRLE9BQU87QUFBQSxNQUN0RDtBQUFBLE1BQ0E7QUFBQSxRQUFFO0FBQUEsUUFBd0IsQ0FBQztBQUFBLFFBQzFCLEVBQUUsK0JBQStCLEVBQUUsY0FBYyxVQUFVLEdBQUcsRUFBRSxnQ0FBZ0MsR0FBRyxTQUFTLFdBQVcsV0FBVyxDQUFDO0FBQUEsUUFDbkksR0FBSSxtQkFDRCxDQUFDLEVBQUUsMkJBQTJCLEVBQUUsY0FBYyxjQUFjLEdBQUcsU0FBUyxXQUFXLGNBQWMsR0FBRyxFQUFFLGtDQUFrQyxDQUFDLENBQUMsSUFDMUksQ0FBQztBQUFBLE1BQ0w7QUFBQSxJQUNEO0FBQ0EsU0FBSyxpQkFBaUIsUUFBUSxJQUFJLHFCQUFxQixnQkFBZ0IsRUFBRSxXQUFXLGtCQUFrQixDQUFDO0FBQ3ZHLFVBQU0sb0JBQW9CLEtBQUssaUJBQWlCLE1BQU0sV0FBVztBQUVqRSxVQUFNLGlCQUFpQixFQUFFLHlCQUF5QjtBQUNsRCxRQUFJLEtBQUssWUFBWSx1QkFBdUIsa0JBQWtCLEtBQUssb0JBQW9CLE1BQU0sZUFBZSxRQUFRLEtBQUssZUFBZSxpQkFBaUI7QUFDeEosV0FBSyxxQkFBcUIsY0FBYztBQUFBLElBQ3pDO0FBRUEsVUFBTSxLQUFLLGNBQWMsNkJBQTZCLG1CQUFtQixLQUFLLG9CQUFvQixjQUFjO0FBRWhILFVBQU0sV0FBVyxTQUFTLE1BQU0sS0FBSyxVQUFRLEtBQUssZUFBZSxvQkFBb0IsS0FBSyxJQUFJLEtBQUssQ0FBQyxLQUFLLElBQUksS0FBSyxTQUFTLE1BQU0sQ0FBQztBQUNsSSxTQUFLLFdBQVcsZ0JBQWdCLFNBQVMsSUFBSSxDQUFDLGNBQWMsYUFBYTtBQUV6RSxTQUFLLGlCQUFpQixPQUFPLFlBQVk7QUFDekMsU0FBSyxzQkFBc0IsWUFBWTtBQUV2QyxTQUFLLDBCQUEwQjtBQUFBLEVBQ2hDO0FBQUEsRUFFUSxxQkFBcUIsUUFBcUI7QUFDakQsVUFBTSx1QkFBdUIsU0FBUyxxQkFBcUIsbUJBQW1CO0FBQzlFLFVBQU0seUJBQXlCLElBQUksb0JBQW9CO0FBRXZELFVBQU0sYUFBYSxTQUFTLFVBQVUsU0FBUztBQUMvQyxVQUFNLGVBQWUsSUFBSSxVQUFVO0FBRW5DLFVBQU0sT0FBTztBQUFBLE1BQVMsRUFBRSxLQUFLLFVBQVUsU0FBUyxDQUFDLG9GQUFvRixFQUFFO0FBQUEsTUFDdEk7QUFBQSxNQUErRCxLQUFLLGVBQWU7QUFBQSxNQUFXO0FBQUEsTUFBd0I7QUFBQSxJQUFZO0FBRW5JLFVBQU0sbUJBQW1CLEtBQUssdUJBQXVCLElBQUksS0FBSyx3QkFBd0IsT0FBTyxFQUFFLE9BQU8sTUFBTSxXQUFXLEtBQUssQ0FBQyxDQUFDO0FBQzlILFdBQU8sT0FBTyxpQkFBaUIsT0FBTztBQUFBLEVBQ3ZDO0FBQUEsRUFFUSxtQkFBbUIsU0FBaUI7QUFDM0MsY0FBVSxRQUFRLFFBQVEsYUFBYSxFQUFFO0FBQ3pDLFVBQU0sUUFBUSxLQUFLLGtCQUFrQixpQkFBaUIsT0FBTyxHQUFHLFNBQVM7QUFDekUsUUFBSSxDQUFDLE9BQU87QUFBRSxhQUFPO0FBQUEsSUFBSSxPQUNwQjtBQUNKLGFBQU8sSUFBSSxLQUFLO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFNBQWlCO0FBQ3RDLGNBQVUsUUFBUSxRQUFRLGFBQWEsRUFBRTtBQUN6QyxXQUFPLEtBQUssa0JBQWtCLGlCQUFpQixPQUFPO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLE1BQWMsYUFBYTtBQUMxQixTQUFLLG1CQUFtQixLQUFLLGlCQUFpQixLQUFLLFlBQVk7QUFDOUQsVUFBSSxLQUFLLG1CQUFtQixLQUFLLG9CQUFvQixLQUFLLG9CQUFvQjtBQUM3RSxhQUFLLHFCQUFxQixLQUFLO0FBQy9CLGFBQUssa0JBQWtCO0FBQ3ZCLGFBQUssaUNBQWlDLEtBQUssbUJBQW1CLEVBQUU7QUFBQSxNQUNqRSxXQUFXLEtBQUssYUFBYSxpQkFBaUI7QUFFN0MsYUFBSyxlQUFlLGVBQWUsS0FBSyxZQUFZLGVBQWU7QUFBQSxNQUNwRSxPQUFPO0FBQ04sYUFBSyxxQkFBcUI7QUFDMUIsWUFBSSxLQUFLLGFBQWE7QUFDckIsZUFBSyxZQUFZLG1CQUFtQjtBQUNwQyxlQUFLLFlBQVksZUFBZTtBQUNoQyxlQUFLLFlBQVksc0JBQXNCO0FBQ3ZDLGVBQUssWUFBWSx1QkFBdUI7QUFBQSxRQUN6QztBQUVBLFlBQUksS0FBSyx5QkFBeUIsV0FBVyxLQUFLLG1CQUFtQixPQUFPLFdBQVc7QUFHdEYsZUFBSyxxQkFBcUI7QUFBQSxRQUMzQjtBQUVBLGFBQUssV0FBVyxNQUFTO0FBQ3pCLGFBQUssU0FBUyxZQUFZO0FBQzFCLGFBQUssVUFBVSxNQUFNO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxVQUFVO0FBQ2pCLFNBQUssZUFBZSxlQUFlLG9DQUFvQztBQUFBLEVBQ3hFO0FBQUEsRUFFQSxTQUFTO0FBQ1IsUUFBSSxLQUFLLGFBQWEsa0JBQWtCO0FBQ3ZDLFdBQUssV0FBVztBQUFBLElBQ2pCLE9BQU87QUFDTixXQUFLLFFBQVE7QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUFBLEVBRVEsU0FBUyxVQUFvQyxjQUF1QixPQUFPO0FBRWxGLFVBQU0sZUFBZSxxQkFBcUIsS0FBSyxVQUFVLGNBQWMsaUJBQWlCLENBQUM7QUFDekYsUUFBSSxhQUFhLGNBQWM7QUFDOUIsbUJBQWEsVUFBVSxPQUFPLGFBQWE7QUFDM0MsbUJBQWEsVUFBVSxJQUFJLGdCQUFnQjtBQUUzQyxXQUFLLFVBQVUsY0FBaUMsMEJBQTBCLEVBQUcsTUFBTSxVQUFVO0FBRTdGLFdBQUssVUFBVSxjQUFjLDZCQUE2QixFQUFHLGlCQUFpQixRQUFRLEVBQUUsUUFBUSxZQUFVLE9BQU8sV0FBVyxJQUFJO0FBRWhJLFdBQUssVUFBVSxjQUFjLGdDQUFnQyxFQUFHLGlCQUFpQixRQUFRLEVBQUUsUUFBUSxZQUFVLE9BQU8sV0FBVyxLQUFLO0FBRXBJLFdBQUssVUFBVSxjQUFjLGdDQUFnQyxFQUFHLGlCQUFpQixPQUFPLEVBQUUsUUFBUSxZQUFVLE9BQU8sV0FBVyxLQUFLO0FBQUEsSUFDcEksT0FBTztBQUNOLG1CQUFhLFVBQVUsSUFBSSxhQUFhO0FBQ3hDLG1CQUFhLFVBQVUsT0FBTyxnQkFBZ0I7QUFFOUMsWUFBTSxhQUFhLEtBQUssVUFBVSxjQUFpQywwQkFBMEI7QUFDN0YsaUJBQVksTUFBTSxVQUFVLEtBQUssYUFBYSxlQUFlLEtBQUssYUFBYSxtQkFBbUIsS0FBSyxrQkFBa0IsVUFBVTtBQUVuSSxZQUFNLGtCQUFrQixXQUFZLGNBQWMsV0FBVztBQUM3RCxzQkFBaUIsY0FBYyxjQUFjLFNBQVMsV0FBVyxTQUFTLElBQUksU0FBUyxVQUFVLFNBQVM7QUFHMUcsV0FBSyxVQUFVLGNBQWMsNkJBQTZCLEVBQUcsaUJBQWlCLFFBQVEsRUFBRSxRQUFRLFlBQVUsT0FBTyxXQUFXLEtBQUs7QUFFakksV0FBSyxVQUFVLGNBQWMsZ0NBQWdDLEVBQUcsaUJBQWlCLFFBQVEsRUFBRSxRQUFRLFlBQVUsT0FBTyxXQUFXLElBQUk7QUFFbkksV0FBSyxVQUFVLGNBQWMsZ0NBQWdDLEVBQUcsaUJBQWlCLE9BQU8sRUFBRSxRQUFRLFlBQVUsT0FBTyxXQUFXLElBQUk7QUFBQSxJQUNuSTtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFFBQVE7QUFDaEIsVUFBTSxNQUFNO0FBRVosVUFBTSxTQUFTLEtBQUssVUFBVSxjQUFjO0FBRTVDLFFBQUksU0FBUyxLQUFLLFVBQVU7QUFDNUIsV0FBTyxVQUFVLFdBQVcsUUFBUTtBQUNuQyxlQUFTLE9BQU87QUFBQSxJQUNqQjtBQUVBLFFBQUksUUFBUTtBQUdYLFdBQUssVUFBVSxNQUFNO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQ0Q7QUFwbkRhLG1CQUVXLEtBQUs7QUFGaEIscUJBQU47QUFBQSxFQXFESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBN0VVO0FBc25ETixNQUFNLDhCQUEyRDtBQUFBLEVBQ2hFLGFBQWEsYUFBMkM7QUFDOUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFVBQVUsYUFBMEM7QUFDMUQsV0FBTyxLQUFLLFVBQVUsRUFBRSxrQkFBa0IsWUFBWSxrQkFBa0IsY0FBYyxZQUFZLGFBQWEsQ0FBQztBQUFBLEVBQ2pIO0FBQUEsRUFFTyxZQUFZLHNCQUE2Qyx1QkFBb0Q7QUFFbkgsV0FBTyxxQkFBcUIsZUFBZSxjQUFZO0FBQ3RELFVBQUk7QUFDSCxjQUFNLEVBQUUsa0JBQWtCLGFBQWEsSUFBSSxLQUFLLE1BQU0scUJBQXFCO0FBQzNFLGVBQU8sSUFBSSxvQkFBb0IsRUFBRSxrQkFBa0IsYUFBYSxDQUFDO0FBQUEsTUFDbEUsUUFBUTtBQUFBLE1BQUU7QUFDVixhQUFPLElBQUksb0JBQW9CLENBQUMsQ0FBQztBQUFBLElBRWxDLENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbInRoZW1lIiwgInRoZW1lVHlwZSIsICJ2aWRlb1BhdGgiLCAidmlkZW9Qb3N0ZXIiLCAiY29kaWNvbkVsZW1lbnQiLCAic3RlcCIsICJjYXRlZ29yeSIsICJlIiwgInRvRXhwYW5kIl0KfQo=
