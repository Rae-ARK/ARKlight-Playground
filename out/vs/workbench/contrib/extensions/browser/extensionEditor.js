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
import { $, append, hide, setParentFlowTo, show } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { CheckboxActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { Action } from "../../../../base/common/actions.js";
import * as arrays from "../../../../base/common/arrays.js";
import { Cache } from "../../../../base/common/cache.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { isNative } from "../../../../base/common/platform.js";
import { isUndefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import "./media/extensionEditor.css";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { localize } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { computeSize, FilterType, IExtensionGalleryService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { buttonForeground, buttonHoverBackground, editorBackground, textLinkActiveForeground, textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ExtensionFeaturesTab } from "./extensionFeaturesTab.js";
import {
  ButtonWithDropDownExtensionAction,
  ClearLanguageAction,
  DisableDropDownAction,
  EnableDropDownAction,
  ButtonWithDropdownExtensionActionViewItem,
  DropDownExtensionAction,
  ExtensionEditorManageExtensionAction,
  ExtensionStatusAction,
  ExtensionStatusLabelAction,
  InstallAnotherVersionAction,
  InstallDropdownAction,
  InstallingLabelAction,
  LocalInstallAction,
  MigrateDeprecatedExtensionAction,
  ExtensionRuntimeStateAction,
  RemoteInstallAction,
  SetColorThemeAction,
  SetFileIconThemeAction,
  SetLanguageAction,
  SetProductIconThemeAction,
  ToggleAutoUpdateForExtensionAction,
  UninstallAction,
  UpdateAction,
  WebInstallAction,
  TogglePreReleaseExtensionAction
} from "./extensionsActions.js";
import { Delegate } from "./extensionsList.js";
import { ExtensionData, ExtensionsGridView, ExtensionsTree, getExtensions } from "./extensionsViewer.js";
import { ExtensionRecommendationWidget, ExtensionStatusWidget, ExtensionWidget, InstallCountWidget, RatingsWidget, RemoteBadgeWidget, SponsorWidget, PublisherWidget, onClick, ExtensionKindIndicatorWidget, ExtensionIconWidget } from "./extensionsWidgets.js";
import { ExtensionContainers, ExtensionEditorTab, ExtensionState, IExtensionsWorkbenchService } from "../common/extensions.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { IWebviewService, KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED } from "../../webview/browser/webview.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ByteSize, IFileService } from "../../../../platform/files/common/files.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { ShowCurrentReleaseNotesActionId } from "../../update/common/update.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { fromNow } from "../../../../base/common/date.js";
class NavBar extends Disposable {
  constructor(container) {
    super();
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this._currentId = null;
    const element = append(container, $(".navbar"));
    this.actions = [];
    this.actionbar = this._register(new ActionBar(element));
  }
  get currentId() {
    return this._currentId;
  }
  push(id, label, tooltip) {
    const action = new Action(id, label, void 0, true, () => this.update(id, true));
    action.tooltip = tooltip;
    this.actions.push(action);
    this.actionbar.push(action);
    if (this.actions.length === 1) {
      this.update(id);
    }
  }
  clear() {
    this.actions = dispose(this.actions);
    this.actionbar.clear();
  }
  switch(id) {
    const action = this.actions.find((action2) => action2.id === id);
    if (action) {
      action.run();
      return true;
    }
    return false;
  }
  update(id, focus) {
    this._currentId = id;
    this._onChange.fire({ id, focus: !!focus });
    this.actions.forEach((a) => a.checked = a.id === id);
  }
  dispose() {
    this.clear();
    super.dispose();
  }
}
var WebviewIndex = /* @__PURE__ */ ((WebviewIndex2) => {
  WebviewIndex2[WebviewIndex2["Readme"] = 0] = "Readme";
  WebviewIndex2[WebviewIndex2["Changelog"] = 1] = "Changelog";
  return WebviewIndex2;
})(WebviewIndex || {});
const CONTEXT_SHOW_PRE_RELEASE_VERSION = new RawContextKey("showPreReleaseVersion", false);
class ExtensionWithDifferentGalleryVersionWidget extends ExtensionWidget {
  constructor() {
    super(...arguments);
    this._gallery = null;
  }
  get gallery() {
    return this._gallery;
  }
  set gallery(gallery) {
    if (this.extension && gallery && !areSameExtensions(this.extension.identifier, gallery.identifier)) {
      return;
    }
    this._gallery = gallery;
    this.update();
  }
}
class VersionWidget extends ExtensionWithDifferentGalleryVersionWidget {
  constructor(container, hoverService) {
    super();
    this.element = append(container, $("code.version", void 0, "pre-release"));
    this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, localize("extension version", "Extension Version")));
    this.render();
  }
  render() {
    if (this.extension?.preRelease) {
      show(this.element);
    } else {
      hide(this.element);
    }
  }
}
let ExtensionEditor = class extends EditorPane {
  constructor(group, telemetryService, instantiationService, extensionsWorkbenchService, extensionGalleryService, themeService, notificationService, openerService, extensionRecommendationsService, storageService, extensionService, webviewService, languageService, contextMenuService, contextKeyService, hoverService) {
    super(ExtensionEditor.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionGalleryService = extensionGalleryService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.extensionService = extensionService;
    this.webviewService = webviewService;
    this.languageService = languageService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this._scopedContextKeyService = this._register(new MutableDisposable());
    // Some action bar items use a webview whose vertical scroll position we track in this map
    this.initialScrollProgress = /* @__PURE__ */ new Map();
    // Spot when an ExtensionEditor instance gets reused for a different extension, in which case the vertical scroll positions must be zeroed
    this.currentIdentifier = "";
    this.layoutParticipants = [];
    this.contentDisposables = this._register(new DisposableStore());
    this.transientDisposables = this._register(new DisposableStore());
    this.activeElement = null;
    this.extensionReadme = null;
    this.extensionChangelog = null;
    this.extensionManifest = null;
  }
  get scopedContextKeyService() {
    return this._scopedContextKeyService.value;
  }
  createEditor(parent) {
    const root = append(parent, $(".extension-editor"));
    this._scopedContextKeyService.value = this.contextKeyService.createScoped(root);
    this._scopedContextKeyService.value.createKey("inExtensionEditor", true);
    this.showPreReleaseVersionContextKey = CONTEXT_SHOW_PRE_RELEASE_VERSION.bindTo(this._scopedContextKeyService.value);
    root.tabIndex = 0;
    root.style.outline = "none";
    root.setAttribute("role", "document");
    const header = append(root, $(".header"));
    const iconContainer = append(header, $(".icon-container"));
    const iconWidget = this.instantiationService.createInstance(ExtensionIconWidget, iconContainer);
    const remoteBadge = this.instantiationService.createInstance(RemoteBadgeWidget, iconContainer, true);
    const details = append(header, $(".details"));
    const title = append(details, $(".title"));
    const name = append(title, $("span.name.clickable", { role: "heading", tabIndex: 0 }));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), name, localize("name", "Extension name")));
    const versionWidget = new VersionWidget(title, this.hoverService);
    const preview = append(title, $("span.preview"));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), preview, localize("preview", "Preview")));
    preview.textContent = localize("preview", "Preview");
    const builtin = append(title, $("span.builtin"));
    builtin.textContent = localize("builtin", "Built-in");
    const subtitle = append(details, $(".subtitle"));
    const subTitleEntryContainers = [];
    const publisherContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(publisherContainer);
    const publisherWidget = this.instantiationService.createInstance(PublisherWidget, publisherContainer, false);
    const extensionKindContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(extensionKindContainer);
    const extensionKindWidget = this.instantiationService.createInstance(ExtensionKindIndicatorWidget, extensionKindContainer, false);
    const installCountContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(installCountContainer);
    const installCountWidget = this.instantiationService.createInstance(InstallCountWidget, installCountContainer, false);
    const ratingsContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(ratingsContainer);
    const ratingsWidget = this.instantiationService.createInstance(RatingsWidget, ratingsContainer, false);
    const sponsorContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(sponsorContainer);
    const sponsorWidget = this.instantiationService.createInstance(SponsorWidget, sponsorContainer);
    const widgets = [
      iconWidget,
      remoteBadge,
      versionWidget,
      publisherWidget,
      extensionKindWidget,
      installCountWidget,
      ratingsWidget,
      sponsorWidget
    ];
    const description = append(details, $(".description"));
    const installAction = this.instantiationService.createInstance(InstallDropdownAction);
    const actions = [
      this.instantiationService.createInstance(ExtensionRuntimeStateAction),
      this.instantiationService.createInstance(ExtensionStatusLabelAction),
      this.instantiationService.createInstance(UpdateAction, true),
      this.instantiationService.createInstance(SetColorThemeAction),
      this.instantiationService.createInstance(SetFileIconThemeAction),
      this.instantiationService.createInstance(SetProductIconThemeAction),
      this.instantiationService.createInstance(SetLanguageAction),
      this.instantiationService.createInstance(ClearLanguageAction),
      this.instantiationService.createInstance(EnableDropDownAction),
      this.instantiationService.createInstance(TogglePreReleaseExtensionAction),
      this.instantiationService.createInstance(DisableDropDownAction),
      this.instantiationService.createInstance(RemoteInstallAction, false),
      this.instantiationService.createInstance(LocalInstallAction),
      this.instantiationService.createInstance(WebInstallAction),
      installAction,
      this.instantiationService.createInstance(InstallingLabelAction),
      this.instantiationService.createInstance(ButtonWithDropDownExtensionAction, "extensions.uninstall", UninstallAction.UninstallClass, [
        [
          this.instantiationService.createInstance(MigrateDeprecatedExtensionAction, false),
          this.instantiationService.createInstance(UninstallAction),
          this.instantiationService.createInstance(InstallAnotherVersionAction, null, true)
        ]
      ]),
      this.instantiationService.createInstance(ToggleAutoUpdateForExtensionAction),
      new ExtensionEditorManageExtensionAction(this.scopedContextKeyService || this.contextKeyService, this.instantiationService)
    ];
    const actionsAndStatusContainer = append(details, $(".actions-status-container"));
    const extensionActionBar = this._register(new ActionBar(actionsAndStatusContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof DropDownExtensionAction) {
          return action.createActionViewItem(options);
        }
        if (action instanceof ButtonWithDropDownExtensionAction) {
          return new ButtonWithDropdownExtensionActionViewItem(
            action,
            {
              ...options,
              icon: true,
              label: true,
              menuActionsOrProvider: { getActions: () => action.menuActions },
              menuActionClassNames: action.menuActionClassNames
            },
            this.contextMenuService
          );
        }
        if (action instanceof ToggleAutoUpdateForExtensionAction) {
          return new CheckboxActionViewItem(void 0, action, { ...options, icon: true, label: true, checkboxStyles: defaultCheckboxStyles });
        }
        return void 0;
      },
      focusOnlyEnabledItems: true
    }));
    extensionActionBar.push(actions, { icon: true, label: true });
    extensionActionBar.setFocusable(true);
    this._register(Event.any(...actions.map((a) => Event.filter(a.onDidChange, (e) => e.enabled !== void 0)))(() => {
      extensionActionBar.setFocusable(false);
      extensionActionBar.setFocusable(true);
    }));
    const otherExtensionContainers = [];
    const extensionStatusAction = this.instantiationService.createInstance(ExtensionStatusAction);
    const extensionStatusWidget = this._register(this.instantiationService.createInstance(ExtensionStatusWidget, append(actionsAndStatusContainer, $(".status")), extensionStatusAction));
    otherExtensionContainers.push(extensionStatusAction, new class extends ExtensionWidget {
      render() {
        actionsAndStatusContainer.classList.toggle("list-layout", this.extension?.state === ExtensionState.Installed);
      }
    }());
    const recommendationWidget = this.instantiationService.createInstance(ExtensionRecommendationWidget, append(details, $(".recommendation")));
    widgets.push(recommendationWidget);
    this._register(Event.any(extensionStatusWidget.onDidRender, recommendationWidget.onDidRender)(() => {
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }));
    const extensionContainers = this.instantiationService.createInstance(ExtensionContainers, [...actions, ...widgets, ...otherExtensionContainers]);
    for (const disposable of [...actions, ...widgets, ...otherExtensionContainers, extensionContainers]) {
      this._register(disposable);
    }
    const onError = Event.chain(
      extensionActionBar.onDidRun,
      ($2) => $2.map(({ error }) => error).filter((error) => !!error)
    );
    this._register(onError(this.onError, this));
    const body = append(root, $(".body"));
    const navbar = this._register(new NavBar(body));
    const content = append(body, $(".content"));
    content.id = generateUuid();
    this.template = {
      builtin,
      content,
      description,
      header,
      name,
      navbar,
      preview,
      actionsAndStatusContainer,
      extensionActionBar,
      set extension(extension) {
        extensionContainers.extension = extension;
        let lastNonEmptySubtitleEntryContainer;
        for (const subTitleEntryElement of subTitleEntryContainers) {
          subTitleEntryElement.classList.remove("last-non-empty");
          if (subTitleEntryElement.children.length > 0) {
            lastNonEmptySubtitleEntryContainer = subTitleEntryElement;
          }
        }
        if (lastNonEmptySubtitleEntryContainer) {
          lastNonEmptySubtitleEntryContainer.classList.add("last-non-empty");
        }
      },
      set gallery(gallery) {
        versionWidget.gallery = gallery;
      },
      set manifest(manifest) {
        installAction.manifest = manifest;
      }
    };
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    this.updatePreReleaseVersionContext();
    if (this.template) {
      await this.render(input.extension, this.template, !!options?.preserveFocus);
    }
  }
  setOptions(options) {
    const currentOptions = this.options;
    super.setOptions(options);
    this.updatePreReleaseVersionContext();
    if (this.input && this.template && currentOptions?.showPreReleaseVersion !== options?.showPreReleaseVersion) {
      this.render(this.input.extension, this.template, !!options?.preserveFocus);
      return;
    }
    if (options?.tab) {
      this.template?.navbar.switch(options.tab);
    }
  }
  updatePreReleaseVersionContext() {
    let showPreReleaseVersion = this.options?.showPreReleaseVersion;
    if (isUndefined(showPreReleaseVersion)) {
      showPreReleaseVersion = !!this.input.extension.gallery?.properties.isPreReleaseVersion;
    }
    this.showPreReleaseVersionContextKey?.set(showPreReleaseVersion);
  }
  async openTab(tab) {
    if (!this.input || !this.template) {
      return;
    }
    if (this.template.navbar.switch(tab)) {
      return;
    }
    if (tab === ExtensionEditorTab.ExtensionPack) {
      this.template.navbar.switch(ExtensionEditorTab.Readme);
    }
  }
  async getGalleryVersionToShow(extension, preRelease) {
    if (extension.resourceExtension) {
      return null;
    }
    if (extension.local?.source === "resource") {
      return null;
    }
    if (isUndefined(preRelease)) {
      return null;
    }
    if (preRelease === extension.gallery?.properties.isPreReleaseVersion) {
      return null;
    }
    if (preRelease && !extension.hasPreReleaseVersion) {
      return null;
    }
    if (!preRelease && !extension.hasReleaseVersion) {
      return null;
    }
    return (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease, hasPreRelease: extension.hasPreReleaseVersion }], CancellationToken.None))[0] || null;
  }
  async render(extension, template, preserveFocus) {
    this.activeElement = null;
    this.transientDisposables.clear();
    const token = this.transientDisposables.add(new CancellationTokenSource()).token;
    const gallery = await this.getGalleryVersionToShow(extension, this.options?.showPreReleaseVersion);
    if (token.isCancellationRequested) {
      return;
    }
    this.extensionReadme = new Cache(() => gallery ? this.extensionGalleryService.getReadme(gallery, token) : extension.getReadme(token));
    this.extensionChangelog = new Cache(() => gallery ? this.extensionGalleryService.getChangelog(gallery, token) : extension.getChangelog(token));
    this.extensionManifest = new Cache(() => gallery ? this.extensionGalleryService.getManifest(gallery, token) : extension.getManifest(token));
    template.extension = extension;
    template.gallery = gallery;
    template.manifest = null;
    template.name.textContent = extension.displayName;
    template.name.classList.toggle("clickable", !!extension.url);
    template.name.classList.toggle("deprecated", !!extension.deprecationInfo);
    template.preview.style.display = extension.preview ? "inherit" : "none";
    template.builtin.style.display = extension.isBuiltin ? "inherit" : "none";
    template.description.textContent = extension.description;
    if (extension.url) {
      this.transientDisposables.add(onClick(template.name, () => this.openerService.open(URI.parse(extension.url))));
    }
    const manifest = await this.extensionManifest.get().promise;
    if (token.isCancellationRequested) {
      return;
    }
    if (manifest) {
      template.manifest = manifest;
    }
    this.renderNavbar(extension, manifest, template, preserveFocus);
    const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
    let recommendationsData = {};
    if (extRecommendations[extension.identifier.id.toLowerCase()]) {
      recommendationsData = { recommendationReason: extRecommendations[extension.identifier.id.toLowerCase()].reasonId };
    }
    this.telemetryService.publicLog("extensionGallery:openExtension", { ...extension.telemetryData, ...recommendationsData });
  }
  renderNavbar(extension, manifest, template, preserveFocus) {
    template.content.innerText = "";
    template.navbar.clear();
    if (this.currentIdentifier !== extension.identifier.id) {
      this.initialScrollProgress.clear();
      this.currentIdentifier = extension.identifier.id;
    }
    template.navbar.push(ExtensionEditorTab.Readme, localize("details", "Details"), localize("detailstooltip", "Extension details, rendered from the extension's 'README.md' file"));
    if (manifest) {
      template.navbar.push(ExtensionEditorTab.Features, localize("features", "Features"), localize("featurestooltip", "Lists features contributed by this extension"));
    }
    if (extension.hasChangelog()) {
      template.navbar.push(ExtensionEditorTab.Changelog, localize("changelog", "Changelog"), localize("changelogtooltip", "Extension update history, rendered from the extension's 'CHANGELOG.md' file"));
    }
    if (extension.dependencies.length) {
      template.navbar.push(ExtensionEditorTab.Dependencies, localize("dependencies", "Dependencies"), localize("dependenciestooltip", "Lists extensions this extension depends on"));
    }
    if (manifest && manifest.extensionPack?.length && !this.shallRenderAsExtensionPack(manifest)) {
      template.navbar.push(ExtensionEditorTab.ExtensionPack, localize("extensionpack", "Extension Pack"), localize("extensionpacktooltip", "Lists extensions those will be installed together with this extension"));
    }
    if (this.options?.tab) {
      template.navbar.switch(this.options.tab);
    }
    if (template.navbar.currentId) {
      this.onNavbarChange(extension, { id: template.navbar.currentId, focus: !preserveFocus }, template);
    }
    template.navbar.onChange((e) => this.onNavbarChange(extension, e, template), this, this.transientDisposables);
  }
  clearInput() {
    this.contentDisposables.clear();
    this.transientDisposables.clear();
    super.clearInput();
  }
  focus() {
    super.focus();
    this.activeElement?.focus();
  }
  showFind() {
    this.activeWebview?.showFind();
  }
  runFindAction(previous) {
    this.activeWebview?.runFindAction(previous);
  }
  get activeWebview() {
    if (!this.activeElement || !this.activeElement.runFindAction) {
      return void 0;
    }
    return this.activeElement;
  }
  onNavbarChange(extension, { id, focus }, template) {
    this.contentDisposables.clear();
    template.content.innerText = "";
    this.activeElement = null;
    if (id) {
      const cts = new CancellationTokenSource();
      this.contentDisposables.add(toDisposable(() => cts.dispose(true)));
      this.open(id, extension, template, cts.token).then((activeElement) => {
        if (cts.token.isCancellationRequested) {
          return;
        }
        this.activeElement = activeElement;
        if (focus) {
          this.focus();
        }
      });
    }
  }
  open(id, extension, template, token) {
    const details = append(template.content, $(".details"));
    const contentContainer = append(details, $(".content-container"));
    const additionalDetailsContainer = append(details, $(".additional-details-container"));
    const layout = () => details.classList.toggle("narrow", this.dimension && this.dimension.width < 500);
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    this.renderAdditionalDetails(additionalDetailsContainer, extension);
    switch (id) {
      case ExtensionEditorTab.Readme:
        return this.openDetails(extension, contentContainer, token);
      case ExtensionEditorTab.Features:
        return this.openFeatures(extension, contentContainer, token);
      case ExtensionEditorTab.Changelog:
        return this.openChangelog(extension, contentContainer, token);
      case ExtensionEditorTab.Dependencies:
        return this.openExtensionDependencies(extension, contentContainer, token);
      case ExtensionEditorTab.ExtensionPack:
        return this.openExtensionPack(extension, contentContainer, token);
    }
    return Promise.resolve(null);
  }
  async openMarkdown(extension, cacheResult, noContentCopy, container, webviewIndex, title, token) {
    try {
      const body = await this.renderMarkdown(extension, cacheResult, container, token);
      if (token.isCancellationRequested) {
        return Promise.resolve(null);
      }
      const webview = this.contentDisposables.add(this.webviewService.createWebviewOverlay({
        title,
        options: {
          enableFindWidget: true,
          tryRestoreScrollPosition: true,
          disableServiceWorker: true
        },
        contentOptions: {},
        extension: void 0
      }));
      webview.initialScrollProgress = this.initialScrollProgress.get(webviewIndex) || 0;
      webview.claim(this, this.window, this.scopedContextKeyService);
      setParentFlowTo(webview.container, container);
      webview.setAnchorElement(container);
      webview.setHtml(body);
      webview.claim(this, this.window, void 0);
      this.contentDisposables.add(webview.onDidFocus(() => this._onDidFocus?.fire()));
      this.contentDisposables.add(webview.onDidScroll(() => this.initialScrollProgress.set(webviewIndex, webview.initialScrollProgress)));
      let isDisposed = false;
      this.contentDisposables.add(toDisposable(() => {
        isDisposed = true;
      }));
      this.contentDisposables.add(this.themeService.onDidColorThemeChange(async () => {
        const body2 = await this.renderMarkdown(extension, cacheResult, container);
        if (!isDisposed) {
          webview.setHtml(body2);
        }
      }));
      this.contentDisposables.add(webview.onDidClickLink((link) => {
        if (!link) {
          return;
        }
        if (matchesScheme(link, Schemas.http) || matchesScheme(link, Schemas.https) || matchesScheme(link, Schemas.mailto)) {
          this.openerService.open(link);
        } else if (matchesScheme(link, Schemas.command) && extension.type === ExtensionType.System) {
          this.openerService.open(link, {
            allowCommands: [
              ShowCurrentReleaseNotesActionId
            ]
          });
        }
      }));
      return webview;
    } catch (e) {
      const p = append(container, $("p.nocontent"));
      p.textContent = noContentCopy;
      return p;
    }
  }
  async renderMarkdown(extension, cacheResult, container, token) {
    const contents = await this.loadContents(() => cacheResult, container);
    if (token?.isCancellationRequested) {
      return "";
    }
    const allowedLinkProtocols = [Schemas.http, Schemas.https, Schemas.mailto];
    const content = await renderMarkdownDocument(contents, this.extensionService, this.languageService, {
      sanitizerConfig: {
        allowedLinkProtocols: {
          override: extension.type === ExtensionType.System ? [...allowedLinkProtocols, Schemas.command] : allowedLinkProtocols
        }
      }
    }, token);
    if (token?.isCancellationRequested) {
      return "";
    }
    return this.renderBody(content);
  }
  renderBody(body) {
    const nonce = generateUuid();
    const colorMap = TokenizationRegistry.getColorMap();
    const css = colorMap ? generateTokensCSSForColorMap(colorMap) : "";
    return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; media-src https:; script-src 'none'; style-src 'nonce-${nonce}';">
				<style nonce="${nonce}">
					${DEFAULT_MARKDOWN_STYLES}

					/* prevent scroll-to-top button from blocking the body text */
					body {
						padding-bottom: 75px;
					}

					#scroll-to-top {
						position: fixed;
						width: 32px;
						height: 32px;
						right: 25px;
						bottom: 25px;
						background-color: var(--vscode-button-secondaryBackground);
						border-color: var(--vscode-button-border);
						border-radius: 50%;
						cursor: pointer;
						box-shadow: 1px 1px 1px rgba(0,0,0,.25);
						outline: none;
						display: flex;
						justify-content: center;
						align-items: center;
					}

					#scroll-to-top:hover {
						background-color: var(--vscode-button-secondaryHoverBackground);
						box-shadow: 2px 2px 2px rgba(0,0,0,.25);
					}

					body.vscode-high-contrast #scroll-to-top {
						border-width: 2px;
						border-style: solid;
						box-shadow: none;
					}

					#scroll-to-top span.icon::before {
						content: "";
						display: block;
						background: var(--vscode-button-secondaryForeground);
						/* Chevron up icon */
						webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						-webkit-mask-image: url('data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDE5LjIuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDYuMDAgQnVpbGQgMCkgIC0tPgo8c3ZnIHZlcnNpb249IjEuMSIgaWQ9IkxheWVyXzEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHg9IjBweCIgeT0iMHB4IgoJIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImVuYWJsZS1iYWNrZ3JvdW5kOm5ldyAwIDAgMTYgMTY7IiB4bWw6c3BhY2U9InByZXNlcnZlIj4KPHN0eWxlIHR5cGU9InRleHQvY3NzIj4KCS5zdDB7ZmlsbDojRkZGRkZGO30KCS5zdDF7ZmlsbDpub25lO30KPC9zdHlsZT4KPHRpdGxlPnVwY2hldnJvbjwvdGl0bGU+CjxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik04LDUuMWwtNy4zLDcuM0wwLDExLjZsOC04bDgsOGwtMC43LDAuN0w4LDUuMXoiLz4KPHJlY3QgY2xhc3M9InN0MSIgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2Ii8+Cjwvc3ZnPgo=');
						width: 16px;
						height: 16px;
					}
					${css}
				</style>
			</head>
			<body>
				<a id="scroll-to-top" role="button" aria-label="scroll to top" href="#"><span class="icon"></span></a>
				${body}
			</body>
		</html>`;
  }
  async openDetails(extension, contentContainer, token) {
    let activeElement = null;
    const manifest = await this.extensionManifest.get().promise;
    if (manifest && manifest.extensionPack?.length && this.shallRenderAsExtensionPack(manifest)) {
      activeElement = await this.openExtensionPackReadme(extension, manifest, contentContainer, token);
    } else {
      activeElement = await this.openMarkdown(extension, this.extensionReadme.get(), localize("noReadme", "No README available."), contentContainer, 0 /* Readme */, localize("Readme title", "Readme"), token);
    }
    return activeElement;
  }
  shallRenderAsExtensionPack(manifest) {
    return !!manifest.categories?.some((category) => category.toLowerCase() === "extension packs");
  }
  async openExtensionPackReadme(extension, manifest, container, token) {
    if (token.isCancellationRequested) {
      return Promise.resolve(null);
    }
    const extensionPackReadme = append(container, $("div", { class: "extension-pack-readme" }));
    extensionPackReadme.style.margin = "0 auto";
    extensionPackReadme.style.maxWidth = "882px";
    const extensionPack = append(extensionPackReadme, $("div", { class: "extension-pack" }));
    const packCount = manifest.extensionPack.length;
    const headerHeight = 37;
    const contentMinHeight = 200;
    const layout = () => {
      extensionPackReadme.classList.remove("one-row", "two-rows", "three-rows", "more-rows");
      const availableHeight = container.clientHeight;
      const availableForPack = Math.max(availableHeight - headerHeight - contentMinHeight, 0);
      let rowClass = "one-row";
      if (availableForPack >= 302 && packCount > 6) {
        rowClass = "more-rows";
      } else if (availableForPack >= 282 && packCount > 4) {
        rowClass = "three-rows";
      } else if (availableForPack >= 200 && packCount > 2) {
        rowClass = "two-rows";
      } else {
        rowClass = "one-row";
      }
      extensionPackReadme.classList.add(rowClass);
    };
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    const extensionPackHeader = append(extensionPack, $("div.header"));
    extensionPackHeader.textContent = localize("extension pack", "Extension Pack ({0})", manifest.extensionPack.length);
    const extensionPackContent = append(extensionPack, $("div", { class: "extension-pack-content" }));
    extensionPackContent.setAttribute("tabindex", "0");
    const readmeContent = append(extensionPackReadme, $("div.readme-content"));
    await Promise.all([
      this.renderExtensionPack(manifest, extensionPackContent, token),
      this.openMarkdown(extension, this.extensionReadme.get(), localize("noReadme", "No README available."), readmeContent, 0 /* Readme */, localize("Readme title", "Readme"), token)
    ]);
    return { focus: () => extensionPackContent.focus() };
  }
  renderAdditionalDetails(container, extension) {
    const content = $("div", { class: "additional-details-content", tabindex: "0" });
    const scrollableContent = new DomScrollableElement(content, {});
    const layout = () => scrollableContent.scanDomNode();
    const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout });
    this.contentDisposables.add(toDisposable(removeLayoutParticipant));
    this.contentDisposables.add(scrollableContent);
    this.contentDisposables.add(this.instantiationService.createInstance(AdditionalDetailsWidget, content, extension));
    append(container, scrollableContent.getDomNode());
    scrollableContent.scanDomNode();
  }
  async openChangelog(extension, contentContainer, token) {
    const activeElement = await this.openMarkdown(extension, this.extensionChangelog.get(), localize("noChangelog", "No Changelog available."), contentContainer, 1 /* Changelog */, localize("Changelog title", "Changelog"), token);
    return activeElement;
  }
  async openFeatures(extension, contentContainer, token) {
    const manifest = await this.loadContents(() => this.extensionManifest.get(), contentContainer);
    if (token.isCancellationRequested) {
      return null;
    }
    if (!manifest) {
      return null;
    }
    const extensionFeaturesTab = this.contentDisposables.add(this.instantiationService.createInstance(ExtensionFeaturesTab, manifest, this.options?.feature));
    const featureLayout = () => extensionFeaturesTab.layout(contentContainer.clientHeight, contentContainer.clientWidth);
    const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout: featureLayout });
    this.contentDisposables.add(toDisposable(removeLayoutParticipant));
    append(contentContainer, extensionFeaturesTab.domNode);
    featureLayout();
    return extensionFeaturesTab.domNode;
  }
  openExtensionDependencies(extension, contentContainer, token) {
    if (token.isCancellationRequested) {
      return Promise.resolve(null);
    }
    if (arrays.isFalsyOrEmpty(extension.dependencies)) {
      append(contentContainer, $("p.nocontent")).textContent = localize("noDependencies", "No Dependencies");
      return Promise.resolve(contentContainer);
    }
    const content = $("div", { class: "subcontent" });
    const scrollableContent = new DomScrollableElement(content, {});
    append(contentContainer, scrollableContent.getDomNode());
    this.contentDisposables.add(scrollableContent);
    const dependenciesTree = this.instantiationService.createInstance(
      ExtensionsTree,
      new ExtensionData(extension, null, (extension2) => extension2.dependencies || [], this.extensionsWorkbenchService),
      content,
      {
        listBackground: editorBackground
      }
    );
    const depLayout = () => {
      scrollableContent.scanDomNode();
      const scrollDimensions = scrollableContent.getScrollDimensions();
      dependenciesTree.layout(scrollDimensions.height);
    };
    const removeLayoutParticipant = arrays.insert(this.layoutParticipants, { layout: depLayout });
    this.contentDisposables.add(toDisposable(removeLayoutParticipant));
    this.contentDisposables.add(dependenciesTree);
    depLayout();
    return Promise.resolve({ focus() {
      dependenciesTree.domFocus();
    } });
  }
  async openExtensionPack(extension, contentContainer, token) {
    if (token.isCancellationRequested) {
      return Promise.resolve(null);
    }
    const manifest = await this.loadContents(() => this.extensionManifest.get(), contentContainer);
    if (token.isCancellationRequested) {
      return null;
    }
    if (!manifest) {
      return null;
    }
    return this.renderExtensionPack(manifest, contentContainer, token);
  }
  async renderExtensionPack(manifest, parent, token) {
    if (token.isCancellationRequested) {
      return null;
    }
    const content = $("div", { class: "subcontent" });
    const scrollableContent = new DomScrollableElement(content, { useShadows: false });
    append(parent, scrollableContent.getDomNode());
    const extensionsGridView = this.instantiationService.createInstance(ExtensionsGridView, content, new Delegate());
    const extensions = await getExtensions(manifest.extensionPack, this.extensionsWorkbenchService);
    extensionsGridView.setExtensions(extensions);
    scrollableContent.scanDomNode();
    this.contentDisposables.add(scrollableContent);
    this.contentDisposables.add(extensionsGridView);
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout: () => scrollableContent.scanDomNode() })));
    return content;
  }
  loadContents(loadingTask, container) {
    container.classList.add("loading");
    const result = this.contentDisposables.add(loadingTask());
    const onDone = () => container.classList.remove("loading");
    result.promise.then(onDone, onDone);
    return result.promise;
  }
  layout(dimension) {
    this.dimension = dimension;
    this.layoutParticipants.forEach((p) => p.layout());
  }
  onError(err) {
    if (isCancellationError(err)) {
      return;
    }
    this.notificationService.error(err);
  }
};
ExtensionEditor.ID = "workbench.editor.extension";
ExtensionEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IExtensionsWorkbenchService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IExtensionRecommendationsService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IWebviewService),
  __decorateParam(12, ILanguageService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IHoverService)
], ExtensionEditor);
let AdditionalDetailsWidget = class extends Disposable {
  constructor(container, extension, hoverService, openerService, userDataProfilesService, remoteAgentService, fileService, uriIdentityService, extensionsWorkbenchService, extensionGalleryManifestService) {
    super();
    this.container = container;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.userDataProfilesService = userDataProfilesService;
    this.remoteAgentService = remoteAgentService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.disposables = this._register(new DisposableStore());
    this.render(extension);
    this._register(this.extensionsWorkbenchService.onChange((e) => {
      if (e && areSameExtensions(e.identifier, extension.identifier) && e.server === extension.server) {
        this.render(e);
      }
    }));
  }
  render(extension) {
    this.container.innerText = "";
    this.disposables.clear();
    if (extension.local) {
      this.renderInstallInfo(this.container, extension.local);
    }
    if (extension.gallery) {
      this.renderMarketplaceInfo(this.container, extension);
    }
    this.renderCategories(this.container, extension);
    this.renderExtensionResources(this.container, extension);
  }
  renderCategories(container, extension) {
    if (extension.categories.length) {
      const categoriesContainer = append(container, $(".categories-container.additional-details-element"));
      append(categoriesContainer, $(".additional-details-title", void 0, localize("categories", "Categories")));
      const categoriesElement = append(categoriesContainer, $(".categories"));
      this.extensionGalleryManifestService.getExtensionGalleryManifest().then((manifest) => {
        const hasCategoryFilter = manifest?.capabilities.extensionQuery.filtering?.some(({ name }) => name === FilterType.Category);
        for (const category of extension.categories) {
          const categoryElement = append(categoriesElement, $("span.category", { tabindex: "0" }, category));
          if (hasCategoryFilter) {
            categoryElement.classList.add("clickable");
            this.disposables.add(onClick(categoryElement, () => this.extensionsWorkbenchService.openSearch(`@category:"${category}"`)));
          }
        }
      });
    }
  }
  renderExtensionResources(container, extension) {
    const resources = [];
    if (extension.repository) {
      try {
        resources.push([localize("repository", "Repository"), ThemeIcon.fromId(Codicon.repo.id), URI.parse(extension.repository)]);
      } catch (error) {
      }
    }
    if (extension.supportUrl) {
      try {
        resources.push([localize("issues", "Issues"), ThemeIcon.fromId(Codicon.issues.id), URI.parse(extension.supportUrl)]);
      } catch (error) {
      }
    }
    if (extension.licenseUrl) {
      try {
        resources.push([localize("license", "License"), ThemeIcon.fromId(Codicon.linkExternal.id), URI.parse(extension.licenseUrl)]);
      } catch (error) {
      }
    }
    if (extension.publisherUrl) {
      resources.push([extension.publisherDisplayName, ThemeIcon.fromId(Codicon.linkExternal.id), extension.publisherUrl]);
    }
    if (extension.url) {
      resources.push([localize("Marketplace", "Marketplace"), ThemeIcon.fromId(Codicon.linkExternal.id), URI.parse(extension.url)]);
    }
    if (resources.length || extension.publisherSponsorLink) {
      const extensionResourcesContainer = append(container, $(".resources-container.additional-details-element"));
      append(extensionResourcesContainer, $(".additional-details-title", void 0, localize("resources", "Resources")));
      const resourcesElement = append(extensionResourcesContainer, $(".resources"));
      for (const [label, icon, uri] of resources) {
        const resourceElement = append(resourcesElement, $(".resource"));
        append(resourceElement, $(ThemeIcon.asCSSSelector(icon)));
        append(resourceElement, $("a", { tabindex: "0" }, label));
        this.disposables.add(onClick(resourceElement, () => this.openerService.open(uri)));
        this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), resourceElement, uri.toString()));
      }
    }
  }
  renderInstallInfo(container, extension) {
    const installInfoContainer = append(container, $(".more-info-container.additional-details-element"));
    append(installInfoContainer, $(".additional-details-title", void 0, localize("Install Info", "Installation")));
    const installInfo = append(installInfoContainer, $(".more-info"));
    append(
      installInfo,
      $(
        ".more-info-entry",
        void 0,
        $("div.more-info-entry-name", void 0, localize("id", "Identifier")),
        $("code", void 0, extension.identifier.id)
      )
    );
    if (extension.type !== ExtensionType.System) {
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("Version", "Version")),
          $("code", void 0, extension.manifest.version)
        )
      );
    }
    if (extension.installedTimestamp) {
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("last updated", "Last Updated")),
          $("div", {
            "title": new Date(extension.installedTimestamp).toString()
          }, fromNow(extension.installedTimestamp, true, true, true))
        )
      );
    }
    if (!extension.isBuiltin && extension.source !== "gallery") {
      const element = $("div", void 0, extension.source === "vsix" ? localize("vsix", "VSIX") : localize("other", "Local"));
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("source", "Source")),
          element
        )
      );
      if (isNative && extension.source === "resource" && extension.location.scheme === Schemas.file) {
        element.classList.add("link");
        element.tabIndex = 0;
        element.setAttribute("role", "link");
        element.title = extension.location.fsPath;
        this.disposables.add(onClick(element, () => this.openerService.open(extension.location, { openExternal: true })));
      }
    }
    if (extension.size) {
      const element = $("div", void 0, ByteSize.formatSize(extension.size));
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", { title: localize("size when installed", "Size when installed") }, localize("size", "Size")),
          element
        )
      );
      if (isNative && extension.location.scheme === Schemas.file) {
        element.classList.add("link");
        element.tabIndex = 0;
        element.setAttribute("role", "link");
        element.title = extension.location.fsPath;
        this.disposables.add(onClick(element, () => this.openerService.open(extension.location, { openExternal: true })));
      }
    }
    this.getCacheLocation(extension).then((cacheLocation) => {
      if (!cacheLocation) {
        return;
      }
      computeSize(cacheLocation, this.fileService).then((cacheSize) => {
        if (!cacheSize) {
          return;
        }
        const element = $("div", void 0, ByteSize.formatSize(cacheSize));
        append(
          installInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", { title: localize("disk space used", "Cache size") }, localize("cache size", "Cache")),
            element
          )
        );
        if (isNative && extension.location.scheme === Schemas.file) {
          element.classList.add("link");
          element.tabIndex = 0;
          element.setAttribute("role", "link");
          element.title = cacheLocation.fsPath;
          this.disposables.add(onClick(element, () => this.openerService.open(cacheLocation.with({ scheme: Schemas.file }), { openExternal: true })));
        }
      });
    });
  }
  async getCacheLocation(extension) {
    let extensionCacheLocation = this.uriIdentityService.extUri.joinPath(this.userDataProfilesService.defaultProfile.globalStorageHome, extension.identifier.id.toLowerCase());
    if (extension.location.scheme === Schemas.vscodeRemote) {
      const environment = await this.remoteAgentService.getEnvironment();
      if (!environment) {
        return void 0;
      }
      extensionCacheLocation = this.uriIdentityService.extUri.joinPath(environment.globalStorageHome, extension.identifier.id.toLowerCase());
    }
    return extensionCacheLocation;
  }
  renderMarketplaceInfo(container, extension) {
    const gallery = extension.gallery;
    const moreInfoContainer = append(container, $(".more-info-container.additional-details-element"));
    append(moreInfoContainer, $(".additional-details-title", void 0, localize("Marketplace Info", "Marketplace")));
    const moreInfo = append(moreInfoContainer, $(".more-info"));
    if (gallery) {
      if (!extension.local) {
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("id", "Identifier")),
            $("code", void 0, extension.identifier.id)
          )
        );
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("Version", "Version")),
            $("code", void 0, gallery.version)
          )
        );
      }
      append(
        moreInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("published", "Published")),
          $("div", {
            "title": new Date(gallery.releaseDate).toString()
          }, fromNow(gallery.releaseDate, true, true, true))
        ),
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("last released", "Last Released")),
          $("div", {
            "title": new Date(gallery.lastUpdated).toString()
          }, fromNow(gallery.lastUpdated, true, true, true))
        )
      );
    }
  }
};
AdditionalDetailsWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IRemoteAgentService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IUriIdentityService),
  __decorateParam(8, IExtensionsWorkbenchService),
  __decorateParam(9, IExtensionGalleryManifestService)
], AdditionalDetailsWidget);
const contextKeyExpr = ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", ExtensionEditor.ID), EditorContextKeys.focus.toNegated());
registerAction2(class ShowExtensionEditorFindAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.extensioneditor.showfind",
      title: localize("find", "Find"),
      keybinding: {
        when: contextKeyExpr,
        weight: KeybindingWeight.EditorContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyF
      }
    });
  }
  run(accessor) {
    const extensionEditor = getExtensionEditor(accessor);
    extensionEditor?.showFind();
  }
});
registerAction2(class StartExtensionEditorFindNextAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.extensioneditor.findNext",
      title: localize("find next", "Find Next"),
      keybinding: {
        when: ContextKeyExpr.and(
          contextKeyExpr,
          KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED
        ),
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor) {
    const extensionEditor = getExtensionEditor(accessor);
    extensionEditor?.runFindAction(false);
  }
});
registerAction2(class StartExtensionEditorFindPreviousAction extends Action2 {
  constructor() {
    super({
      id: "editor.action.extensioneditor.findPrevious",
      title: localize("find previous", "Find Previous"),
      keybinding: {
        when: ContextKeyExpr.and(
          contextKeyExpr,
          KEYBINDING_CONTEXT_WEBVIEW_FIND_WIDGET_FOCUSED
        ),
        primary: KeyMod.Shift | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor) {
    const extensionEditor = getExtensionEditor(accessor);
    extensionEditor?.runFindAction(true);
  }
});
registerThemingParticipant((theme, collector) => {
  const link = theme.getColor(textLinkForeground);
  if (link) {
    collector.addRule(`.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource { color: ${link}; }`);
    collector.addRule(`.monaco-workbench .extension-editor .content .feature-contributions a { color: ${link}; }`);
  }
  const activeLink = theme.getColor(textLinkActiveForeground);
  if (activeLink) {
    collector.addRule(`.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource:hover,
			.monaco-workbench .extension-editor .content .details .additional-details-container .resources-container a.resource:active { color: ${activeLink}; }`);
    collector.addRule(`.monaco-workbench .extension-editor .content .feature-contributions a:hover,
			.monaco-workbench .extension-editor .content .feature-contributions a:active { color: ${activeLink}; }`);
  }
  const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
  if (buttonHoverBackgroundColor) {
    collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .categories-container > .categories > .category.clickable:hover { background-color: ${buttonHoverBackgroundColor}; border-color: ${buttonHoverBackgroundColor}; }`);
  }
  const buttonForegroundColor = theme.getColor(buttonForeground);
  if (buttonForegroundColor) {
    collector.addRule(`.monaco-workbench .extension-editor .content > .details > .additional-details-container .categories-container > .categories > .category.clickable:hover { color: ${buttonForegroundColor}; }`);
  }
});
function getExtensionEditor(accessor) {
  const activeEditorPane = accessor.get(IEditorService).activeEditorPane;
  if (activeEditorPane instanceof ExtensionEditor) {
    return activeEditorPane;
  }
  return null;
}
export {
  ExtensionEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25FZGl0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGFwcGVuZCwgaGlkZSwgc2V0UGFyZW50Rmxvd1RvLCBzaG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3hBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYWNoZSwgQ2FjaGVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYWNoZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzLCBtYXRjaGVzU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc05hdGl2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICcuL21lZGlhL2V4dGVuc2lvbkVkaXRvci5jc3MnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU2l6ZSwgRmlsdGVyVHlwZSwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJR2FsbGVyeUV4dGVuc2lvbiwgSUxvY2FsRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblR5cGUsIElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRDaGVja2JveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBidXR0b25Gb3JlZ3JvdW5kLCBidXR0b25Ib3ZlckJhY2tncm91bmQsIGVkaXRvckJhY2tncm91bmQsIHRleHRMaW5rQWN0aXZlRm9yZWdyb3VuZCwgdGV4dExpbmtGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElDc3NTdHlsZUNvbGxlY3RvciwgSVRoZW1lU2VydmljZSwgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRmVhdHVyZXNUYWIgfSBmcm9tICcuL2V4dGVuc2lvbkZlYXR1cmVzVGFiLmpzJztcbmltcG9ydCB7XG5cdEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbixcblx0Q2xlYXJMYW5ndWFnZUFjdGlvbixcblx0RGlzYWJsZURyb3BEb3duQWN0aW9uLFxuXHRFbmFibGVEcm9wRG93bkFjdGlvbixcblx0QnV0dG9uV2l0aERyb3Bkb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0sIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uLFxuXHRFeHRlbnNpb25FZGl0b3JNYW5hZ2VFeHRlbnNpb25BY3Rpb24sXG5cdEV4dGVuc2lvblN0YXR1c0FjdGlvbixcblx0RXh0ZW5zaW9uU3RhdHVzTGFiZWxBY3Rpb24sXG5cdEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbixcblx0SW5zdGFsbERyb3Bkb3duQWN0aW9uLCBJbnN0YWxsaW5nTGFiZWxBY3Rpb24sXG5cdExvY2FsSW5zdGFsbEFjdGlvbixcblx0TWlncmF0ZURlcHJlY2F0ZWRFeHRlbnNpb25BY3Rpb24sXG5cdEV4dGVuc2lvblJ1bnRpbWVTdGF0ZUFjdGlvbixcblx0UmVtb3RlSW5zdGFsbEFjdGlvbixcblx0U2V0Q29sb3JUaGVtZUFjdGlvbixcblx0U2V0RmlsZUljb25UaGVtZUFjdGlvbixcblx0U2V0TGFuZ3VhZ2VBY3Rpb24sXG5cdFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24sXG5cdFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24sXG5cdFVuaW5zdGFsbEFjdGlvbixcblx0VXBkYXRlQWN0aW9uLFxuXHRXZWJJbnN0YWxsQWN0aW9uLFxuXHRUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uLFxufSBmcm9tICcuL2V4dGVuc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IERlbGVnYXRlIH0gZnJvbSAnLi9leHRlbnNpb25zTGlzdC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EYXRhLCBFeHRlbnNpb25zR3JpZFZpZXcsIEV4dGVuc2lvbnNUcmVlLCBnZXRFeHRlbnNpb25zIH0gZnJvbSAnLi9leHRlbnNpb25zVmlld2VyLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uV2lkZ2V0LCBFeHRlbnNpb25TdGF0dXNXaWRnZXQsIEV4dGVuc2lvbldpZGdldCwgSW5zdGFsbENvdW50V2lkZ2V0LCBSYXRpbmdzV2lkZ2V0LCBSZW1vdGVCYWRnZVdpZGdldCwgU3BvbnNvcldpZGdldCwgUHVibGlzaGVyV2lkZ2V0LCBvbkNsaWNrLCBFeHRlbnNpb25LaW5kSW5kaWNhdG9yV2lkZ2V0LCBFeHRlbnNpb25JY29uV2lkZ2V0IH0gZnJvbSAnLi9leHRlbnNpb25zV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Db250YWluZXJzLCBFeHRlbnNpb25FZGl0b3JUYWIsIEV4dGVuc2lvblN0YXRlLCBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uQ29udGFpbmVyLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zSW5wdXQsIElFeHRlbnNpb25FZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNJbnB1dC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01BUktET1dOX1NUWUxFUywgcmVuZGVyTWFya2Rvd25Eb2N1bWVudCB9IGZyb20gJy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25Eb2N1bWVudFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElXZWJ2aWV3LCBJV2Vidmlld1NlcnZpY2UsIEtFWUJJTkRJTkdfQ09OVEVYVF9XRUJWSUVXX0ZJTkRfV0lER0VUX0ZPQ1VTRUQgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBTaG93Q3VycmVudFJlbGVhc2VOb3Rlc0FjdGlvbklkIH0gZnJvbSAnLi4vLi4vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5cbmNsYXNzIE5hdkJhciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nIHwgbnVsbDsgZm9jdXM6IGJvb2xlYW4gfT4oKSk7XG5cdHJlYWRvbmx5IG9uQ2hhbmdlID0gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfY3VycmVudElkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0Z2V0IGN1cnJlbnRJZCgpOiBzdHJpbmcgfCBudWxsIHsgcmV0dXJuIHRoaXMuX2N1cnJlbnRJZDsgfVxuXG5cdHByaXZhdGUgYWN0aW9uczogQWN0aW9uW107XG5cdHByaXZhdGUgYWN0aW9uYmFyOiBBY3Rpb25CYXI7XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5uYXZiYXInKSk7XG5cdFx0dGhpcy5hY3Rpb25zID0gW107XG5cdFx0dGhpcy5hY3Rpb25iYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGVsZW1lbnQpKTtcblx0fVxuXG5cdHB1c2goaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgdG9vbHRpcDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbihpZCwgbGFiZWwsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy51cGRhdGUoaWQsIHRydWUpKTtcblxuXHRcdGFjdGlvbi50b29sdGlwID0gdG9vbHRpcDtcblxuXHRcdHRoaXMuYWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0dGhpcy5hY3Rpb25iYXIucHVzaChhY3Rpb24pO1xuXG5cdFx0aWYgKHRoaXMuYWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMudXBkYXRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGlvbnMgPSBkaXNwb3NlKHRoaXMuYWN0aW9ucyk7XG5cdFx0dGhpcy5hY3Rpb25iYXIuY2xlYXIoKTtcblx0fVxuXG5cdHN3aXRjaChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5hY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5pZCA9PT0gaWQpO1xuXHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZShpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50SWQgPSBpZDtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgaWQsIGZvY3VzOiAhIWZvY3VzIH0pO1xuXHRcdHRoaXMuYWN0aW9ucy5mb3JFYWNoKGEgPT4gYS5jaGVja2VkID0gYS5pZCA9PT0gaWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTGF5b3V0UGFydGljaXBhbnQge1xuXHRsYXlvdXQoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElBY3RpdmVFbGVtZW50IHtcblx0Zm9jdXMoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSB7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRwcmV2aWV3OiBIVE1MRWxlbWVudDtcblx0YnVpbHRpbjogSFRNTEVsZW1lbnQ7XG5cdGRlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGV4dGVuc2lvbkFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRuYXZiYXI6IE5hdkJhcjtcblx0Y29udGVudDogSFRNTEVsZW1lbnQ7XG5cdGhlYWRlcjogSFRNTEVsZW1lbnQ7XG5cdGV4dGVuc2lvbjogSUV4dGVuc2lvbjtcblx0Z2FsbGVyeTogSUdhbGxlcnlFeHRlbnNpb24gfCBudWxsO1xuXHRtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0IHwgbnVsbDtcbn1cblxuY29uc3QgZW51bSBXZWJ2aWV3SW5kZXgge1xuXHRSZWFkbWUsXG5cdENoYW5nZWxvZ1xufVxuXG5jb25zdCBDT05URVhUX1NIT1dfUFJFX1JFTEVBU0VfVkVSU0lPTiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzaG93UHJlUmVsZWFzZVZlcnNpb24nLCBmYWxzZSk7XG5cbmFic3RyYWN0IGNsYXNzIEV4dGVuc2lvbldpdGhEaWZmZXJlbnRHYWxsZXJ5VmVyc2lvbldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cdHByaXZhdGUgX2dhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbCA9IG51bGw7XG5cdGdldCBnYWxsZXJ5KCk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbCB7IHJldHVybiB0aGlzLl9nYWxsZXJ5OyB9XG5cdHNldCBnYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbCkge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbiAmJiBnYWxsZXJ5ICYmICFhcmVTYW1lRXh0ZW5zaW9ucyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBnYWxsZXJ5LmlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2dhbGxlcnkgPSBnYWxsZXJ5O1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cbn1cblxuY2xhc3MgVmVyc2lvbldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpdGhEaWZmZXJlbnRHYWxsZXJ5VmVyc2lvbldpZGdldCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0aG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnY29kZS52ZXJzaW9uJywgdW5kZWZpbmVkLCAncHJlLXJlbGVhc2UnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsZW1lbnQsIGxvY2FsaXplKCdleHRlbnNpb24gdmVyc2lvbicsIFwiRXh0ZW5zaW9uIFZlcnNpb25cIikpKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5leHRlbnNpb24/LnByZVJlbGVhc2UpIHtcblx0XHRcdHNob3codGhpcy5lbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aGlkZSh0aGlzLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uRWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci5leHRlbnNpb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTY29wZWRDb250ZXh0S2V5U2VydmljZT4oKSk7XG5cdHByaXZhdGUgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGV4dGVuc2lvblJlYWRtZTogQ2FjaGU8c3RyaW5nPiB8IG51bGw7XG5cdHByaXZhdGUgZXh0ZW5zaW9uQ2hhbmdlbG9nOiBDYWNoZTxzdHJpbmc+IHwgbnVsbDtcblx0cHJpdmF0ZSBleHRlbnNpb25NYW5pZmVzdDogQ2FjaGU8SUV4dGVuc2lvbk1hbmlmZXN0IHwgbnVsbD4gfCBudWxsO1xuXG5cdC8vIFNvbWUgYWN0aW9uIGJhciBpdGVtcyB1c2UgYSB3ZWJ2aWV3IHdob3NlIHZlcnRpY2FsIHNjcm9sbCBwb3NpdGlvbiB3ZSB0cmFjayBpbiB0aGlzIG1hcFxuXHRwcml2YXRlIGluaXRpYWxTY3JvbGxQcm9ncmVzczogTWFwPFdlYnZpZXdJbmRleCwgbnVtYmVyPiA9IG5ldyBNYXAoKTtcblxuXHQvLyBTcG90IHdoZW4gYW4gRXh0ZW5zaW9uRWRpdG9yIGluc3RhbmNlIGdldHMgcmV1c2VkIGZvciBhIGRpZmZlcmVudCBleHRlbnNpb24sIGluIHdoaWNoIGNhc2UgdGhlIHZlcnRpY2FsIHNjcm9sbCBwb3NpdGlvbnMgbXVzdCBiZSB6ZXJvZWRcblx0cHJpdmF0ZSBjdXJyZW50SWRlbnRpZmllcjogc3RyaW5nID0gJyc7XG5cblx0cHJpdmF0ZSBsYXlvdXRQYXJ0aWNpcGFudHM6IElMYXlvdXRQYXJ0aWNpcGFudFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSB0cmFuc2llbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgYWN0aXZlRWxlbWVudDogSUFjdGl2ZUVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBkaW1lbnNpb246IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNob3dQcmVSZWxlYXNlVmVyc2lvbkNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXZWJ2aWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdlYnZpZXdTZXJ2aWNlOiBJV2Vidmlld1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEV4dGVuc2lvbkVkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uUmVhZG1lID0gbnVsbDtcblx0XHR0aGlzLmV4dGVuc2lvbkNoYW5nZWxvZyA9IG51bGw7XG5cdFx0dGhpcy5leHRlbnNpb25NYW5pZmVzdCA9IG51bGw7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UudmFsdWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCByb290ID0gYXBwZW5kKHBhcmVudCwgJCgnLmV4dGVuc2lvbi1lZGl0b3InKSk7XG5cdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UudmFsdWUgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChyb290KTtcblx0XHR0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZS52YWx1ZS5jcmVhdGVLZXkoJ2luRXh0ZW5zaW9uRWRpdG9yJywgdHJ1ZSk7XG5cdFx0dGhpcy5zaG93UHJlUmVsZWFzZVZlcnNpb25Db250ZXh0S2V5ID0gQ09OVEVYVF9TSE9XX1BSRV9SRUxFQVNFX1ZFUlNJT04uYmluZFRvKHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlLnZhbHVlKTtcblxuXHRcdHJvb3QudGFiSW5kZXggPSAwOyAvLyB0aGlzIGlzIHJlcXVpcmVkIGZvciB0aGUgZm9jdXMgdHJhY2tlciBvbiB0aGUgZWRpdG9yXG5cdFx0cm9vdC5zdHlsZS5vdXRsaW5lID0gJ25vbmUnO1xuXHRcdHJvb3Quc2V0QXR0cmlidXRlKCdyb2xlJywgJ2RvY3VtZW50Jyk7XG5cdFx0Y29uc3QgaGVhZGVyID0gYXBwZW5kKHJvb3QsICQoJy5oZWFkZXInKSk7XG5cblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gYXBwZW5kKGhlYWRlciwgJCgnLmljb24tY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGljb25XaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbkljb25XaWRnZXQsIGljb25Db250YWluZXIpO1xuXHRcdGNvbnN0IHJlbW90ZUJhZGdlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZW1vdGVCYWRnZVdpZGdldCwgaWNvbkNvbnRhaW5lciwgdHJ1ZSk7XG5cblx0XHRjb25zdCBkZXRhaWxzID0gYXBwZW5kKGhlYWRlciwgJCgnLmRldGFpbHMnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBhcHBlbmQoZGV0YWlscywgJCgnLnRpdGxlJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBhcHBlbmQodGl0bGUsICQoJ3NwYW4ubmFtZS5jbGlja2FibGUnLCB7IHJvbGU6ICdoZWFkaW5nJywgdGFiSW5kZXg6IDAgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBuYW1lLCBsb2NhbGl6ZSgnbmFtZScsIFwiRXh0ZW5zaW9uIG5hbWVcIikpKTtcblx0XHRjb25zdCB2ZXJzaW9uV2lkZ2V0ID0gbmV3IFZlcnNpb25XaWRnZXQodGl0bGUsIHRoaXMuaG92ZXJTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHByZXZpZXcgPSBhcHBlbmQodGl0bGUsICQoJ3NwYW4ucHJldmlldycpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgcHJldmlldywgbG9jYWxpemUoJ3ByZXZpZXcnLCBcIlByZXZpZXdcIikpKTtcblx0XHRwcmV2aWV3LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3ByZXZpZXcnLCBcIlByZXZpZXdcIik7XG5cblx0XHRjb25zdCBidWlsdGluID0gYXBwZW5kKHRpdGxlLCAkKCdzcGFuLmJ1aWx0aW4nKSk7XG5cdFx0YnVpbHRpbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdidWlsdGluJywgXCJCdWlsdC1pblwiKTtcblxuXHRcdGNvbnN0IHN1YnRpdGxlID0gYXBwZW5kKGRldGFpbHMsICQoJy5zdWJ0aXRsZScpKTtcblx0XHRjb25zdCBzdWJUaXRsZUVudHJ5Q29udGFpbmVyczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXG5cdFx0Y29uc3QgcHVibGlzaGVyQ29udGFpbmVyID0gYXBwZW5kKHN1YnRpdGxlLCAkKCcuc3VidGl0bGUtZW50cnknKSk7XG5cdFx0c3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMucHVzaChwdWJsaXNoZXJDb250YWluZXIpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlcldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHVibGlzaGVyV2lkZ2V0LCBwdWJsaXNoZXJDb250YWluZXIsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmRDb250YWluZXIgPSBhcHBlbmQoc3VidGl0bGUsICQoJy5zdWJ0aXRsZS1lbnRyeScpKTtcblx0XHRzdWJUaXRsZUVudHJ5Q29udGFpbmVycy5wdXNoKGV4dGVuc2lvbktpbmRDb250YWluZXIpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbktpbmRJbmRpY2F0b3JXaWRnZXQsIGV4dGVuc2lvbktpbmRDb250YWluZXIsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGluc3RhbGxDb3VudENvbnRhaW5lciA9IGFwcGVuZChzdWJ0aXRsZSwgJCgnLnN1YnRpdGxlLWVudHJ5JykpO1xuXHRcdHN1YlRpdGxlRW50cnlDb250YWluZXJzLnB1c2goaW5zdGFsbENvdW50Q29udGFpbmVyKTtcblx0XHRjb25zdCBpbnN0YWxsQ291bnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxDb3VudFdpZGdldCwgaW5zdGFsbENvdW50Q29udGFpbmVyLCBmYWxzZSk7XG5cblx0XHRjb25zdCByYXRpbmdzQ29udGFpbmVyID0gYXBwZW5kKHN1YnRpdGxlLCAkKCcuc3VidGl0bGUtZW50cnknKSk7XG5cdFx0c3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMucHVzaChyYXRpbmdzQ29udGFpbmVyKTtcblx0XHRjb25zdCByYXRpbmdzV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSYXRpbmdzV2lkZ2V0LCByYXRpbmdzQ29udGFpbmVyLCBmYWxzZSk7XG5cblx0XHRjb25zdCBzcG9uc29yQ29udGFpbmVyID0gYXBwZW5kKHN1YnRpdGxlLCAkKCcuc3VidGl0bGUtZW50cnknKSk7XG5cdFx0c3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMucHVzaChzcG9uc29yQ29udGFpbmVyKTtcblx0XHRjb25zdCBzcG9uc29yV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTcG9uc29yV2lkZ2V0LCBzcG9uc29yQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHdpZGdldHM6IEV4dGVuc2lvbldpZGdldFtdID0gW1xuXHRcdFx0aWNvbldpZGdldCxcblx0XHRcdHJlbW90ZUJhZGdlLFxuXHRcdFx0dmVyc2lvbldpZGdldCxcblx0XHRcdHB1Ymxpc2hlcldpZGdldCxcblx0XHRcdGV4dGVuc2lvbktpbmRXaWRnZXQsXG5cdFx0XHRpbnN0YWxsQ291bnRXaWRnZXQsXG5cdFx0XHRyYXRpbmdzV2lkZ2V0LFxuXHRcdFx0c3BvbnNvcldpZGdldCxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhcHBlbmQoZGV0YWlscywgJCgnLmRlc2NyaXB0aW9uJykpO1xuXG5cdFx0Y29uc3QgaW5zdGFsbEFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbERyb3Bkb3duQWN0aW9uKTtcblx0XHRjb25zdCBhY3Rpb25zID0gW1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25TdGF0dXNMYWJlbEFjdGlvbiksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVwZGF0ZUFjdGlvbiwgdHJ1ZSksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldENvbG9yVGhlbWVBY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXRGaWxlSWNvblRoZW1lQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbiksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldExhbmd1YWdlQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xlYXJMYW5ndWFnZUFjdGlvbiksXG5cblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlRHJvcERvd25BY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZURyb3BEb3duQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlSW5zdGFsbEFjdGlvbiwgZmFsc2UpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbEluc3RhbGxBY3Rpb24pLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXZWJJbnN0YWxsQWN0aW9uKSxcblx0XHRcdGluc3RhbGxBY3Rpb24sXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxpbmdMYWJlbEFjdGlvbiksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiwgJ2V4dGVuc2lvbnMudW5pbnN0YWxsJywgVW5pbnN0YWxsQWN0aW9uLlVuaW5zdGFsbENsYXNzLCBbXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1pZ3JhdGVEZXByZWNhdGVkRXh0ZW5zaW9uQWN0aW9uLCBmYWxzZSksXG5cdFx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbmluc3RhbGxBY3Rpb24pLFxuXHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLCBudWxsLCB0cnVlKSxcblx0XHRcdFx0XVxuXHRcdFx0XSksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24pLFxuXHRcdFx0bmV3IEV4dGVuc2lvbkVkaXRvck1hbmFnZUV4dGVuc2lvbkFjdGlvbih0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlIHx8IHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMsICQoJy5hY3Rpb25zLXN0YXR1cy1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uQWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBEcm9wRG93bkV4dGVuc2lvbkFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBhY3Rpb24uY3JlYXRlQWN0aW9uVmlld0l0ZW0ob3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQnV0dG9uV2l0aERyb3Bkb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0oXG5cdFx0XHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdGljb246IHRydWUsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRtZW51QWN0aW9uc09yUHJvdmlkZXI6IHsgZ2V0QWN0aW9uczogKCkgPT4gYWN0aW9uLm1lbnVBY3Rpb25zIH0sXG5cdFx0XHRcdFx0XHRcdG1lbnVBY3Rpb25DbGFzc05hbWVzOiBhY3Rpb24ubWVudUFjdGlvbkNsYXNzTmFtZXNcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IENoZWNrYm94QWN0aW9uVmlld0l0ZW0odW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogdHJ1ZSwgbGFiZWw6IHRydWUsIGNoZWNrYm94U3R5bGVzOiBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRmb2N1c09ubHlFbmFibGVkSXRlbXM6IHRydWVcblx0XHR9KSk7XG5cblx0XHRleHRlbnNpb25BY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGljb246IHRydWUsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdGV4dGVuc2lvbkFjdGlvbkJhci5zZXRGb2N1c2FibGUodHJ1ZSk7XG5cdFx0Ly8gdXBkYXRlIGZvY3VzYWJsZSBlbGVtZW50cyB3aGVuIHRoZSBlbmFibGVtZW50IG9mIGFuIGFjdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KC4uLmFjdGlvbnMubWFwKGEgPT4gRXZlbnQuZmlsdGVyKGEub25EaWRDaGFuZ2UsIGUgPT4gZS5lbmFibGVkICE9PSB1bmRlZmluZWQpKSkoKCkgPT4ge1xuXHRcdFx0ZXh0ZW5zaW9uQWN0aW9uQmFyLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0XHRleHRlbnNpb25BY3Rpb25CYXIuc2V0Rm9jdXNhYmxlKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG90aGVyRXh0ZW5zaW9uQ29udGFpbmVyczogSUV4dGVuc2lvbkNvbnRhaW5lcltdID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25TdGF0dXNBY3Rpb24pO1xuXHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1c1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uU3RhdHVzV2lkZ2V0LCBhcHBlbmQoYWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lciwgJCgnLnN0YXR1cycpKSwgZXh0ZW5zaW9uU3RhdHVzQWN0aW9uKSk7XG5cblx0XHRvdGhlckV4dGVuc2lvbkNvbnRhaW5lcnMucHVzaChleHRlbnNpb25TdGF0dXNBY3Rpb24sIG5ldyBjbGFzcyBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cdFx0XHRyZW5kZXIoKSB7XG5cdFx0XHRcdGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbGlzdC1sYXlvdXQnLCB0aGlzLmV4dGVuc2lvbj8uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCk7XG5cdFx0XHR9XG5cdFx0fSgpKTtcblxuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25SZWNvbW1lbmRhdGlvbldpZGdldCwgYXBwZW5kKGRldGFpbHMsICQoJy5yZWNvbW1lbmRhdGlvbicpKSk7XG5cdFx0d2lkZ2V0cy5wdXNoKHJlY29tbWVuZGF0aW9uV2lkZ2V0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShleHRlbnNpb25TdGF0dXNXaWRnZXQub25EaWRSZW5kZXIsIHJlY29tbWVuZGF0aW9uV2lkZ2V0Lm9uRGlkUmVuZGVyKSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvbkNvbnRhaW5lcnM6IEV4dGVuc2lvbkNvbnRhaW5lcnMgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbkNvbnRhaW5lcnMsIFsuLi5hY3Rpb25zLCAuLi53aWRnZXRzLCAuLi5vdGhlckV4dGVuc2lvbkNvbnRhaW5lcnNdKTtcblx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgWy4uLmFjdGlvbnMsIC4uLndpZGdldHMsIC4uLm90aGVyRXh0ZW5zaW9uQ29udGFpbmVycywgZXh0ZW5zaW9uQ29udGFpbmVyc10pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRXJyb3IgPSBFdmVudC5jaGFpbihleHRlbnNpb25BY3Rpb25CYXIub25EaWRSdW4sICQgPT5cblx0XHRcdCQubWFwKCh7IGVycm9yIH0pID0+IGVycm9yKVxuXHRcdFx0XHQuZmlsdGVyKGVycm9yID0+ICEhZXJyb3IpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRXJyb3IodGhpcy5vbkVycm9yLCB0aGlzKSk7XG5cblx0XHRjb25zdCBib2R5ID0gYXBwZW5kKHJvb3QsICQoJy5ib2R5JykpO1xuXHRcdGNvbnN0IG5hdmJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOYXZCYXIoYm9keSkpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGFwcGVuZChib2R5LCAkKCcuY29udGVudCcpKTtcblx0XHRjb250ZW50LmlkID0gZ2VuZXJhdGVVdWlkKCk7IC8vIEFuIGlkIGlzIG5lZWRlZCBmb3IgdGhlIHdlYnZpZXcgcGFyZW50IGZsb3cgdG9cblxuXHRcdHRoaXMudGVtcGxhdGUgPSB7XG5cdFx0XHRidWlsdGluLFxuXHRcdFx0Y29udGVudCxcblx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0aGVhZGVyLFxuXHRcdFx0bmFtZSxcblx0XHRcdG5hdmJhcixcblx0XHRcdHByZXZpZXcsXG5cdFx0XHRhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyLFxuXHRcdFx0ZXh0ZW5zaW9uQWN0aW9uQmFyLFxuXHRcdFx0c2V0IGV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24pIHtcblx0XHRcdFx0ZXh0ZW5zaW9uQ29udGFpbmVycy5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0XHRcdGxldCBsYXN0Tm9uRW1wdHlTdWJ0aXRsZUVudHJ5Q29udGFpbmVyO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHN1YlRpdGxlRW50cnlFbGVtZW50IG9mIHN1YlRpdGxlRW50cnlDb250YWluZXJzKSB7XG5cdFx0XHRcdFx0c3ViVGl0bGVFbnRyeUVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnbGFzdC1ub24tZW1wdHknKTtcblx0XHRcdFx0XHRpZiAoc3ViVGl0bGVFbnRyeUVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0bGFzdE5vbkVtcHR5U3VidGl0bGVFbnRyeUNvbnRhaW5lciA9IHN1YlRpdGxlRW50cnlFbGVtZW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobGFzdE5vbkVtcHR5U3VidGl0bGVFbnRyeUNvbnRhaW5lcikge1xuXHRcdFx0XHRcdGxhc3ROb25FbXB0eVN1YnRpdGxlRW50cnlDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbGFzdC1ub24tZW1wdHknKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHNldCBnYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbCkge1xuXHRcdFx0XHR2ZXJzaW9uV2lkZ2V0LmdhbGxlcnkgPSBnYWxsZXJ5O1xuXHRcdFx0fSxcblx0XHRcdHNldCBtYW5pZmVzdChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0IHwgbnVsbCkge1xuXHRcdFx0XHRpbnN0YWxsQWN0aW9uLm1hbmlmZXN0ID0gbWFuaWZlc3Q7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBFeHRlbnNpb25zSW5wdXQsIG9wdGlvbnM6IElFeHRlbnNpb25FZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0dGhpcy51cGRhdGVQcmVSZWxlYXNlVmVyc2lvbkNvbnRleHQoKTtcblx0XHRpZiAodGhpcy50ZW1wbGF0ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZW5kZXIoaW5wdXQuZXh0ZW5zaW9uLCB0aGlzLnRlbXBsYXRlLCAhIW9wdGlvbnM/LnByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNldE9wdGlvbnMob3B0aW9uczogSUV4dGVuc2lvbkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50T3B0aW9uczogSUV4dGVuc2lvbkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQgPSB0aGlzLm9wdGlvbnM7XG5cdFx0c3VwZXIuc2V0T3B0aW9ucyhvcHRpb25zKTtcblx0XHR0aGlzLnVwZGF0ZVByZVJlbGVhc2VWZXJzaW9uQ29udGV4dCgpO1xuXG5cdFx0aWYgKHRoaXMuaW5wdXQgJiYgdGhpcy50ZW1wbGF0ZSAmJiBjdXJyZW50T3B0aW9ucz8uc2hvd1ByZVJlbGVhc2VWZXJzaW9uICE9PSBvcHRpb25zPy5zaG93UHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHRoaXMucmVuZGVyKCh0aGlzLmlucHV0IGFzIEV4dGVuc2lvbnNJbnB1dCkuZXh0ZW5zaW9uLCB0aGlzLnRlbXBsYXRlLCAhIW9wdGlvbnM/LnByZXNlcnZlRm9jdXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zPy50YWIpIHtcblx0XHRcdHRoaXMudGVtcGxhdGU/Lm5hdmJhci5zd2l0Y2gob3B0aW9ucy50YWIpO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQcmVSZWxlYXNlVmVyc2lvbkNvbnRleHQoKTogdm9pZCB7XG5cdFx0bGV0IHNob3dQcmVSZWxlYXNlVmVyc2lvbiA9ICg8SUV4dGVuc2lvbkVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQ+dGhpcy5vcHRpb25zKT8uc2hvd1ByZVJlbGVhc2VWZXJzaW9uO1xuXHRcdGlmIChpc1VuZGVmaW5lZChzaG93UHJlUmVsZWFzZVZlcnNpb24pKSB7XG5cdFx0XHRzaG93UHJlUmVsZWFzZVZlcnNpb24gPSAhISg8RXh0ZW5zaW9uc0lucHV0PnRoaXMuaW5wdXQpLmV4dGVuc2lvbi5nYWxsZXJ5Py5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb247XG5cdFx0fVxuXHRcdHRoaXMuc2hvd1ByZVJlbGVhc2VWZXJzaW9uQ29udGV4dEtleT8uc2V0KHNob3dQcmVSZWxlYXNlVmVyc2lvbik7XG5cdH1cblxuXHRhc3luYyBvcGVuVGFiKHRhYjogRXh0ZW5zaW9uRWRpdG9yVGFiKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmlucHV0IHx8ICF0aGlzLnRlbXBsYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRlbXBsYXRlLm5hdmJhci5zd2l0Y2godGFiKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBGYWxsYmFjayB0byBSZWFkbWUgdGFiIGlmIEV4dGVuc2lvblBhY2sgdGFiIGRvZXMgbm90IGV4aXN0XG5cdFx0aWYgKHRhYiA9PT0gRXh0ZW5zaW9uRWRpdG9yVGFiLkV4dGVuc2lvblBhY2spIHtcblx0XHRcdHRoaXMudGVtcGxhdGUubmF2YmFyLnN3aXRjaChFeHRlbnNpb25FZGl0b3JUYWIuUmVhZG1lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEdhbGxlcnlWZXJzaW9uVG9TaG93KGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgcHJlUmVsZWFzZT86IGJvb2xlYW4pOiBQcm9taXNlPElHYWxsZXJ5RXh0ZW5zaW9uIHwgbnVsbD4ge1xuXHRcdGlmIChleHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsPy5zb3VyY2UgPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoaXNVbmRlZmluZWQocHJlUmVsZWFzZSkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAocHJlUmVsZWFzZSA9PT0gZXh0ZW5zaW9uLmdhbGxlcnk/LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChwcmVSZWxlYXNlICYmICFleHRlbnNpb24uaGFzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoIXByZVJlbGVhc2UgJiYgIWV4dGVuc2lvbi5oYXNSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IC4uLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBwcmVSZWxlYXNlLCBoYXNQcmVSZWxlYXNlOiBleHRlbnNpb24uaGFzUHJlUmVsZWFzZVZlcnNpb24gfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVswXSB8fCBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCB0ZW1wbGF0ZTogSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5hY3RpdmVFbGVtZW50ID0gbnVsbDtcblx0XHR0aGlzLnRyYW5zaWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKS50b2tlbjtcblxuXHRcdGNvbnN0IGdhbGxlcnkgPSBhd2FpdCB0aGlzLmdldEdhbGxlcnlWZXJzaW9uVG9TaG93KGV4dGVuc2lvbiwgKHRoaXMub3B0aW9ucyBhcyBJRXh0ZW5zaW9uRWRpdG9yT3B0aW9ucyk/LnNob3dQcmVSZWxlYXNlVmVyc2lvbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5leHRlbnNpb25SZWFkbWUgPSBuZXcgQ2FjaGUoKCkgPT4gZ2FsbGVyeSA/IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0UmVhZG1lKGdhbGxlcnksIHRva2VuKSA6IGV4dGVuc2lvbi5nZXRSZWFkbWUodG9rZW4pKTtcblx0XHR0aGlzLmV4dGVuc2lvbkNoYW5nZWxvZyA9IG5ldyBDYWNoZSgoKSA9PiBnYWxsZXJ5ID8gdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRDaGFuZ2Vsb2coZ2FsbGVyeSwgdG9rZW4pIDogZXh0ZW5zaW9uLmdldENoYW5nZWxvZyh0b2tlbikpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3QgPSBuZXcgQ2FjaGUoKCkgPT4gZ2FsbGVyeSA/IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0TWFuaWZlc3QoZ2FsbGVyeSwgdG9rZW4pIDogZXh0ZW5zaW9uLmdldE1hbmlmZXN0KHRva2VuKSk7XG5cblx0XHR0ZW1wbGF0ZS5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0dGVtcGxhdGUuZ2FsbGVyeSA9IGdhbGxlcnk7XG5cdFx0dGVtcGxhdGUubWFuaWZlc3QgPSBudWxsO1xuXG5cdFx0dGVtcGxhdGUubmFtZS50ZXh0Q29udGVudCA9IGV4dGVuc2lvbi5kaXNwbGF5TmFtZTtcblx0XHR0ZW1wbGF0ZS5uYW1lLmNsYXNzTGlzdC50b2dnbGUoJ2NsaWNrYWJsZScsICEhZXh0ZW5zaW9uLnVybCk7XG5cdFx0dGVtcGxhdGUubmFtZS5jbGFzc0xpc3QudG9nZ2xlKCdkZXByZWNhdGVkJywgISFleHRlbnNpb24uZGVwcmVjYXRpb25JbmZvKTtcblx0XHR0ZW1wbGF0ZS5wcmV2aWV3LnN0eWxlLmRpc3BsYXkgPSBleHRlbnNpb24ucHJldmlldyA/ICdpbmhlcml0JyA6ICdub25lJztcblx0XHR0ZW1wbGF0ZS5idWlsdGluLnN0eWxlLmRpc3BsYXkgPSBleHRlbnNpb24uaXNCdWlsdGluID8gJ2luaGVyaXQnIDogJ25vbmUnO1xuXG5cdFx0dGVtcGxhdGUuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBleHRlbnNpb24uZGVzY3JpcHRpb247XG5cblx0XHRpZiAoZXh0ZW5zaW9uLnVybCkge1xuXHRcdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5hZGQob25DbGljayh0ZW1wbGF0ZS5uYW1lLCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoZXh0ZW5zaW9uLnVybCEpKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5pZmVzdC5nZXQoKS5wcm9taXNlO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtYW5pZmVzdCkge1xuXHRcdFx0dGVtcGxhdGUubWFuaWZlc3QgPSBtYW5pZmVzdDtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlck5hdmJhcihleHRlbnNpb24sIG1hbmlmZXN0LCB0ZW1wbGF0ZSwgcHJlc2VydmVGb2N1cyk7XG5cblx0XHQvLyByZXBvcnQgdGVsZW1ldHJ5XG5cdFx0Y29uc3QgZXh0UmVjb21tZW5kYXRpb25zID0gdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldEFsbFJlY29tbWVuZGF0aW9uc1dpdGhSZWFzb24oKTtcblx0XHRsZXQgcmVjb21tZW5kYXRpb25zRGF0YSA9IHt9O1xuXHRcdGlmIChleHRSZWNvbW1lbmRhdGlvbnNbZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV0pIHtcblx0XHRcdHJlY29tbWVuZGF0aW9uc0RhdGEgPSB7IHJlY29tbWVuZGF0aW9uUmVhc29uOiBleHRSZWNvbW1lbmRhdGlvbnNbZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV0ucmVhc29uSWQgfTtcblx0XHR9XG5cdFx0LyogX19HRFBSX19cblx0XHRcImV4dGVuc2lvbkdhbGxlcnk6b3BlbkV4dGVuc2lvblwiIDoge1xuXHRcdFx0XCJvd25lclwiOiBcInNhbmR5MDgxXCIsXG5cdFx0XHRcInJlY29tbWVuZGF0aW9uUmVhc29uXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcIiR7aW5jbHVkZX1cIjogW1xuXHRcdFx0XHRcIiR7R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGF9XCJcblx0XHRcdF1cblx0XHR9XG5cdFx0Ki9cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCdleHRlbnNpb25HYWxsZXJ5Om9wZW5FeHRlbnNpb24nLCB7IC4uLmV4dGVuc2lvbi50ZWxlbWV0cnlEYXRhLCAuLi5yZWNvbW1lbmRhdGlvbnNEYXRhIH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck5hdmJhcihleHRlbnNpb246IElFeHRlbnNpb24sIG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsLCB0ZW1wbGF0ZTogSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlLCBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuY29udGVudC5pbm5lclRleHQgPSAnJztcblx0XHR0ZW1wbGF0ZS5uYXZiYXIuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLmN1cnJlbnRJZGVudGlmaWVyICE9PSBleHRlbnNpb24uaWRlbnRpZmllci5pZCkge1xuXHRcdFx0dGhpcy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MuY2xlYXIoKTtcblx0XHRcdHRoaXMuY3VycmVudElkZW50aWZpZXIgPSBleHRlbnNpb24uaWRlbnRpZmllci5pZDtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChFeHRlbnNpb25FZGl0b3JUYWIuUmVhZG1lLCBsb2NhbGl6ZSgnZGV0YWlscycsIFwiRGV0YWlsc1wiKSwgbG9jYWxpemUoJ2RldGFpbHN0b29sdGlwJywgXCJFeHRlbnNpb24gZGV0YWlscywgcmVuZGVyZWQgZnJvbSB0aGUgZXh0ZW5zaW9uJ3MgJ1JFQURNRS5tZCcgZmlsZVwiKSk7XG5cdFx0aWYgKG1hbmlmZXN0KSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChFeHRlbnNpb25FZGl0b3JUYWIuRmVhdHVyZXMsIGxvY2FsaXplKCdmZWF0dXJlcycsIFwiRmVhdHVyZXNcIiksIGxvY2FsaXplKCdmZWF0dXJlc3Rvb2x0aXAnLCBcIkxpc3RzIGZlYXR1cmVzIGNvbnRyaWJ1dGVkIGJ5IHRoaXMgZXh0ZW5zaW9uXCIpKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5oYXNDaGFuZ2Vsb2coKSkge1xuXHRcdFx0dGVtcGxhdGUubmF2YmFyLnB1c2goRXh0ZW5zaW9uRWRpdG9yVGFiLkNoYW5nZWxvZywgbG9jYWxpemUoJ2NoYW5nZWxvZycsIFwiQ2hhbmdlbG9nXCIpLCBsb2NhbGl6ZSgnY2hhbmdlbG9ndG9vbHRpcCcsIFwiRXh0ZW5zaW9uIHVwZGF0ZSBoaXN0b3J5LCByZW5kZXJlZCBmcm9tIHRoZSBleHRlbnNpb24ncyAnQ0hBTkdFTE9HLm1kJyBmaWxlXCIpKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5kZXBlbmRlbmNpZXMubGVuZ3RoKSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChFeHRlbnNpb25FZGl0b3JUYWIuRGVwZW5kZW5jaWVzLCBsb2NhbGl6ZSgnZGVwZW5kZW5jaWVzJywgXCJEZXBlbmRlbmNpZXNcIiksIGxvY2FsaXplKCdkZXBlbmRlbmNpZXN0b29sdGlwJywgXCJMaXN0cyBleHRlbnNpb25zIHRoaXMgZXh0ZW5zaW9uIGRlcGVuZHMgb25cIikpO1xuXHRcdH1cblx0XHRpZiAobWFuaWZlc3QgJiYgbWFuaWZlc3QuZXh0ZW5zaW9uUGFjaz8ubGVuZ3RoICYmICF0aGlzLnNoYWxsUmVuZGVyQXNFeHRlbnNpb25QYWNrKG1hbmlmZXN0KSkge1xuXHRcdFx0dGVtcGxhdGUubmF2YmFyLnB1c2goRXh0ZW5zaW9uRWRpdG9yVGFiLkV4dGVuc2lvblBhY2ssIGxvY2FsaXplKCdleHRlbnNpb25wYWNrJywgXCJFeHRlbnNpb24gUGFja1wiKSwgbG9jYWxpemUoJ2V4dGVuc2lvbnBhY2t0b29sdGlwJywgXCJMaXN0cyBleHRlbnNpb25zIHRob3NlIHdpbGwgYmUgaW5zdGFsbGVkIHRvZ2V0aGVyIHdpdGggdGhpcyBleHRlbnNpb25cIikpO1xuXHRcdH1cblxuXHRcdGlmICgoPElFeHRlbnNpb25FZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkPnRoaXMub3B0aW9ucyk/LnRhYikge1xuXHRcdFx0dGVtcGxhdGUubmF2YmFyLnN3aXRjaCgoPElFeHRlbnNpb25FZGl0b3JPcHRpb25zPnRoaXMub3B0aW9ucykudGFiISk7XG5cdFx0fVxuXHRcdGlmICh0ZW1wbGF0ZS5uYXZiYXIuY3VycmVudElkKSB7XG5cdFx0XHR0aGlzLm9uTmF2YmFyQ2hhbmdlKGV4dGVuc2lvbiwgeyBpZDogdGVtcGxhdGUubmF2YmFyLmN1cnJlbnRJZCwgZm9jdXM6ICFwcmVzZXJ2ZUZvY3VzIH0sIHRlbXBsYXRlKTtcblx0XHR9XG5cdFx0dGVtcGxhdGUubmF2YmFyLm9uQ2hhbmdlKGUgPT4gdGhpcy5vbk5hdmJhckNoYW5nZShleHRlbnNpb24sIGUsIHRlbXBsYXRlKSwgdGhpcywgdGhpcy50cmFuc2llbnREaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQ/LmZvY3VzKCk7XG5cdH1cblxuXHRzaG93RmluZCgpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZVdlYnZpZXc/LnNob3dGaW5kKCk7XG5cdH1cblxuXHRydW5GaW5kQWN0aW9uKHByZXZpb3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVXZWJ2aWV3Py5ydW5GaW5kQWN0aW9uKHByZXZpb3VzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYWN0aXZlV2VidmlldygpOiBJV2VidmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmFjdGl2ZUVsZW1lbnQgfHwgISh0aGlzLmFjdGl2ZUVsZW1lbnQgYXMgSVdlYnZpZXcpLnJ1bkZpbmRBY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmFjdGl2ZUVsZW1lbnQgYXMgSVdlYnZpZXc7XG5cdH1cblxuXHRwcml2YXRlIG9uTmF2YmFyQ2hhbmdlKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgeyBpZCwgZm9jdXMgfTogeyBpZDogc3RyaW5nIHwgbnVsbDsgZm9jdXM6IGJvb2xlYW4gfSwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGUuY29udGVudC5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQgPSBudWxsO1xuXHRcdGlmIChpZCkge1xuXHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHR0aGlzLm9wZW4oaWQsIGV4dGVuc2lvbiwgdGVtcGxhdGUsIGN0cy50b2tlbilcblx0XHRcdFx0LnRoZW4oYWN0aXZlRWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQgPSBhY3RpdmVFbGVtZW50O1xuXHRcdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvcGVuKGlkOiBzdHJpbmcsIGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHQvLyBTZXR1cCBjb21tb24gY29udGFpbmVyIHN0cnVjdHVyZSBmb3IgYWxsIHRhYnNcblx0XHRjb25zdCBkZXRhaWxzID0gYXBwZW5kKHRlbXBsYXRlLmNvbnRlbnQsICQoJy5kZXRhaWxzJykpO1xuXHRcdGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSBhcHBlbmQoZGV0YWlscywgJCgnLmNvbnRlbnQtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxEZXRhaWxzQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtY29udGFpbmVyJykpO1xuXG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4gZGV0YWlscy5jbGFzc0xpc3QudG9nZ2xlKCduYXJyb3cnLCB0aGlzLmRpbWVuc2lvbiAmJiB0aGlzLmRpbWVuc2lvbi53aWR0aCA8IDUwMCk7XG5cdFx0bGF5b3V0KCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dCB9KSkpO1xuXG5cdFx0Ly8gUmVuZGVyIGFkZGl0aW9uYWwgZGV0YWlscyBzeW5jaHJvbm91c2x5IHRvIGF2b2lkIGZsaWNrZXJcblx0XHR0aGlzLnJlbmRlckFkZGl0aW9uYWxEZXRhaWxzKGFkZGl0aW9uYWxEZXRhaWxzQ29udGFpbmVyLCBleHRlbnNpb24pO1xuXG5cdFx0c3dpdGNoIChpZCkge1xuXHRcdFx0Y2FzZSBFeHRlbnNpb25FZGl0b3JUYWIuUmVhZG1lOiByZXR1cm4gdGhpcy5vcGVuRGV0YWlscyhleHRlbnNpb24sIGNvbnRlbnRDb250YWluZXIsIHRva2VuKTtcblx0XHRcdGNhc2UgRXh0ZW5zaW9uRWRpdG9yVGFiLkZlYXR1cmVzOiByZXR1cm4gdGhpcy5vcGVuRmVhdHVyZXMoZXh0ZW5zaW9uLCBjb250ZW50Q29udGFpbmVyLCB0b2tlbik7XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkVkaXRvclRhYi5DaGFuZ2Vsb2c6IHJldHVybiB0aGlzLm9wZW5DaGFuZ2Vsb2coZXh0ZW5zaW9uLCBjb250ZW50Q29udGFpbmVyLCB0b2tlbik7XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkVkaXRvclRhYi5EZXBlbmRlbmNpZXM6IHJldHVybiB0aGlzLm9wZW5FeHRlbnNpb25EZXBlbmRlbmNpZXMoZXh0ZW5zaW9uLCBjb250ZW50Q29udGFpbmVyLCB0b2tlbik7XG5cdFx0XHRjYXNlIEV4dGVuc2lvbkVkaXRvclRhYi5FeHRlbnNpb25QYWNrOiByZXR1cm4gdGhpcy5vcGVuRXh0ZW5zaW9uUGFjayhleHRlbnNpb24sIGNvbnRlbnRDb250YWluZXIsIHRva2VuKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk1hcmtkb3duKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgY2FjaGVSZXN1bHQ6IENhY2hlUmVzdWx0PHN0cmluZz4sIG5vQ29udGVudENvcHk6IHN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgd2Vidmlld0luZGV4OiBXZWJ2aWV3SW5kZXgsIHRpdGxlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCB0aGlzLnJlbmRlck1hcmtkb3duKGV4dGVuc2lvbiwgY2FjaGVSZXN1bHQsIGNvbnRhaW5lciwgdG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdlYnZpZXcgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy53ZWJ2aWV3U2VydmljZS5jcmVhdGVXZWJ2aWV3T3ZlcmxheSh7XG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZW5hYmxlRmluZFdpZGdldDogdHJ1ZSxcblx0XHRcdFx0XHR0cnlSZXN0b3JlU2Nyb2xsUG9zaXRpb246IHRydWUsXG5cdFx0XHRcdFx0ZGlzYWJsZVNlcnZpY2VXb3JrZXI6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbnRlbnRPcHRpb25zOiB7fSxcblx0XHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cblx0XHRcdHdlYnZpZXcuaW5pdGlhbFNjcm9sbFByb2dyZXNzID0gdGhpcy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MuZ2V0KHdlYnZpZXdJbmRleCkgfHwgMDtcblxuXHRcdFx0d2Vidmlldy5jbGFpbSh0aGlzLCB0aGlzLndpbmRvdywgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRzZXRQYXJlbnRGbG93VG8od2Vidmlldy5jb250YWluZXIsIGNvbnRhaW5lcik7XG5cdFx0XHR3ZWJ2aWV3LnNldEFuY2hvckVsZW1lbnQoY29udGFpbmVyKTtcblxuXHRcdFx0d2Vidmlldy5zZXRIdG1sKGJvZHkpO1xuXHRcdFx0d2Vidmlldy5jbGFpbSh0aGlzLCB0aGlzLndpbmRvdywgdW5kZWZpbmVkKTtcblxuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHdlYnZpZXcub25EaWRGb2N1cygoKSA9PiB0aGlzLl9vbkRpZEZvY3VzPy5maXJlKCkpKTtcblxuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHdlYnZpZXcub25EaWRTY3JvbGwoKCkgPT4gdGhpcy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3Muc2V0KHdlYnZpZXdJbmRleCwgd2Vidmlldy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MpKSk7XG5cblx0XHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgaXNEaXNwb3NlZCA9IHRydWU7IH0pKTtcblxuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIFJlbmRlciBhZ2FpbiBzaW5jZSBzeW50YXggaGlnaGxpZ2h0aW5nIG9mIGNvZGUgYmxvY2tzIG1heSBoYXZlIGNoYW5nZWRcblx0XHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHRoaXMucmVuZGVyTWFya2Rvd24oZXh0ZW5zaW9uLCBjYWNoZVJlc3VsdCwgY29udGFpbmVyKTtcblx0XHRcdFx0aWYgKCFpc0Rpc3Bvc2VkKSB7IC8vIE1ha2Ugc3VyZSB3ZSB3ZXJlbid0IGRpc3Bvc2VkIG9mIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRcdHdlYnZpZXcuc2V0SHRtbChib2R5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZENsaWNrTGluayhsaW5rID0+IHtcblx0XHRcdFx0aWYgKCFsaW5rKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE9ubHkgYWxsb3cgbGlua3Mgd2l0aCBzcGVjaWZpYyBzY2hlbWVzXG5cdFx0XHRcdGlmIChtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuaHR0cCkgfHwgbWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmh0dHBzKSB8fCBtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMubWFpbHRvKSkge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmspO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG1hdGNoZXNTY2hlbWUobGluaywgU2NoZW1hcy5jb21tYW5kKSAmJiBleHRlbnNpb24udHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW0pIHtcblx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihsaW5rLCB7XG5cdFx0XHRcdFx0XHRhbGxvd0NvbW1hbmRzOiBbXG5cdFx0XHRcdFx0XHRcdFNob3dDdXJyZW50UmVsZWFzZU5vdGVzQWN0aW9uSWRcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4gd2Vidmlldztcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zdCBwID0gYXBwZW5kKGNvbnRhaW5lciwgJCgncC5ub2NvbnRlbnQnKSk7XG5cdFx0XHRwLnRleHRDb250ZW50ID0gbm9Db250ZW50Q29weTtcblx0XHRcdHJldHVybiBwO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyTWFya2Rvd24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBjYWNoZVJlc3VsdDogQ2FjaGVSZXN1bHQ8c3RyaW5nPiwgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLmxvYWRDb250ZW50cygoKSA9PiBjYWNoZVJlc3VsdCwgY29udGFpbmVyKTtcblx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsb3dlZExpbmtQcm90b2NvbHMgPSBbU2NoZW1hcy5odHRwLCBTY2hlbWFzLmh0dHBzLCBTY2hlbWFzLm1haWx0b107XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlbmRlck1hcmtkb3duRG9jdW1lbnQoY29udGVudHMsIHRoaXMuZXh0ZW5zaW9uU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHtcblx0XHRcdHNhbml0aXplckNvbmZpZzoge1xuXHRcdFx0XHRhbGxvd2VkTGlua1Byb3RvY29sczoge1xuXHRcdFx0XHRcdG92ZXJyaWRlOiBleHRlbnNpb24udHlwZSA9PT0gRXh0ZW5zaW9uVHlwZS5TeXN0ZW1cblx0XHRcdFx0XHRcdD8gWy4uLmFsbG93ZWRMaW5rUHJvdG9jb2xzLCBTY2hlbWFzLmNvbW1hbmRdXG5cdFx0XHRcdFx0XHQ6IGFsbG93ZWRMaW5rUHJvdG9jb2xzXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuPy5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlbmRlckJvZHkoY29udGVudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckJvZHkoYm9keTogVHJ1c3RlZEhUTUwpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5vbmNlID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpO1xuXHRcdGNvbnN0IGNzcyA9IGNvbG9yTWFwID8gZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCkgOiAnJztcblx0XHRyZXR1cm4gYDwhRE9DVFlQRSBodG1sPlxuXHRcdDxodG1sPlxuXHRcdFx0PGhlYWQ+XG5cdFx0XHRcdDxtZXRhIGh0dHAtZXF1aXY9XCJDb250ZW50LXR5cGVcIiBjb250ZW50PVwidGV4dC9odG1sO2NoYXJzZXQ9VVRGLThcIj5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCIgY29udGVudD1cImRlZmF1bHQtc3JjICdub25lJzsgaW1nLXNyYyBodHRwczogZGF0YTo7IG1lZGlhLXNyYyBodHRwczo7IHNjcmlwdC1zcmMgJ25vbmUnOyBzdHlsZS1zcmMgJ25vbmNlLSR7bm9uY2V9JztcIj5cblx0XHRcdFx0PHN0eWxlIG5vbmNlPVwiJHtub25jZX1cIj5cblx0XHRcdFx0XHQke0RFRkFVTFRfTUFSS0RPV05fU1RZTEVTfVxuXG5cdFx0XHRcdFx0LyogcHJldmVudCBzY3JvbGwtdG8tdG9wIGJ1dHRvbiBmcm9tIGJsb2NraW5nIHRoZSBib2R5IHRleHQgKi9cblx0XHRcdFx0XHRib2R5IHtcblx0XHRcdFx0XHRcdHBhZGRpbmctYm90dG9tOiA3NXB4O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNzY3JvbGwtdG8tdG9wIHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBmaXhlZDtcblx0XHRcdFx0XHRcdHdpZHRoOiAzMnB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAzMnB4O1xuXHRcdFx0XHRcdFx0cmlnaHQ6IDI1cHg7XG5cdFx0XHRcdFx0XHRib3R0b206IDI1cHg7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUJhY2tncm91bmQpO1xuXHRcdFx0XHRcdFx0Ym9yZGVyLWNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLWJvcmRlcik7XG5cdFx0XHRcdFx0XHRib3JkZXItcmFkaXVzOiA1MCU7XG5cdFx0XHRcdFx0XHRjdXJzb3I6IHBvaW50ZXI7XG5cdFx0XHRcdFx0XHRib3gtc2hhZG93OiAxcHggMXB4IDFweCByZ2JhKDAsMCwwLC4yNSk7XG5cdFx0XHRcdFx0XHRvdXRsaW5lOiBub25lO1xuXHRcdFx0XHRcdFx0ZGlzcGxheTogZmxleDtcblx0XHRcdFx0XHRcdGp1c3RpZnktY29udGVudDogY2VudGVyO1xuXHRcdFx0XHRcdFx0YWxpZ24taXRlbXM6IGNlbnRlcjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQjc2Nyb2xsLXRvLXRvcDpob3ZlciB7XG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiB2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUhvdmVyQmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRib3gtc2hhZG93OiAycHggMnB4IDJweCByZ2JhKDAsMCwwLC4yNSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ym9keS52c2NvZGUtaGlnaC1jb250cmFzdCAjc2Nyb2xsLXRvLXRvcCB7XG5cdFx0XHRcdFx0XHRib3JkZXItd2lkdGg6IDJweDtcblx0XHRcdFx0XHRcdGJvcmRlci1zdHlsZTogc29saWQ7XG5cdFx0XHRcdFx0XHRib3gtc2hhZG93OiBub25lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNzY3JvbGwtdG8tdG9wIHNwYW4uaWNvbjo6YmVmb3JlIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFwiXCI7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBibG9jaztcblx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IHZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5Rm9yZWdyb3VuZCk7XG5cdFx0XHRcdFx0XHQvKiBDaGV2cm9uIHVwIGljb24gKi9cblx0XHRcdFx0XHRcdHdlYmtpdC1tYXNrLWltYWdlOiB1cmwoJ2RhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEQ5NGJXd2dkbVZ5YzJsdmJqMGlNUzR3SWlCbGJtTnZaR2x1WnowaWRYUm1MVGdpUHo0S1BDRXRMU0JIWlc1bGNtRjBiM0k2SUVGa2IySmxJRWxzYkhWemRISmhkRzl5SURFNUxqSXVNQ3dnVTFaSElFVjRjRzl5ZENCUWJIVm5MVWx1SUM0Z1UxWkhJRlpsY25OcGIyNDZJRFl1TURBZ1FuVnBiR1FnTUNrZ0lDMHRQZ284YzNabklIWmxjbk5wYjI0OUlqRXVNU0lnYVdROUlreGhlV1Z5WHpFaUlIaHRiRzV6UFNKb2RIUndPaTh2ZDNkM0xuY3pMbTl5Wnk4eU1EQXdMM04yWnlJZ2VHMXNibk02ZUd4cGJtczlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5MekU1T1RrdmVHeHBibXNpSUhnOUlqQndlQ0lnZVQwaU1IQjRJZ29KSUhacFpYZENiM2c5SWpBZ01DQXhOaUF4TmlJZ2MzUjViR1U5SW1WdVlXSnNaUzFpWVdOclozSnZkVzVrT201bGR5QXdJREFnTVRZZ01UWTdJaUI0Yld3NmMzQmhZMlU5SW5CeVpYTmxjblpsSWo0S1BITjBlV3hsSUhSNWNHVTlJblJsZUhRdlkzTnpJajRLQ1M1emREQjdabWxzYkRvalJrWkdSa1pHTzMwS0NTNXpkREY3Wm1sc2JEcHViMjVsTzMwS1BDOXpkSGxzWlQ0S1BIUnBkR3hsUG5Wd1kyaGxkbkp2Ymp3dmRHbDBiR1UrQ2p4d1lYUm9JR05zWVhOelBTSnpkREFpSUdROUlrMDRMRFV1TVd3dE55NHpMRGN1TTB3d0xERXhMalpzT0MwNGJEZ3NPR3d0TUM0M0xEQXVOMHc0TERVdU1Yb2lMejRLUEhKbFkzUWdZMnhoYzNNOUluTjBNU0lnZDJsa2RHZzlJakUySWlCb1pXbG5hSFE5SWpFMklpOCtDand2YzNablBnbz0nKTtcblx0XHRcdFx0XHRcdC13ZWJraXQtbWFzay1pbWFnZTogdXJsKCdkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBEOTRiV3dnZG1WeWMybHZiajBpTVM0d0lpQmxibU52WkdsdVp6MGlkWFJtTFRnaVB6NEtQQ0V0TFNCSFpXNWxjbUYwYjNJNklFRmtiMkpsSUVsc2JIVnpkSEpoZEc5eUlERTVMakl1TUN3Z1UxWkhJRVY0Y0c5eWRDQlFiSFZuTFVsdUlDNGdVMVpISUZabGNuTnBiMjQ2SURZdU1EQWdRblZwYkdRZ01Da2dJQzB0UGdvOGMzWm5JSFpsY25OcGIyNDlJakV1TVNJZ2FXUTlJa3hoZVdWeVh6RWlJSGh0Ykc1elBTSm9kSFJ3T2k4dmQzZDNMbmN6TG05eVp5OHlNREF3TDNOMlp5SWdlRzFzYm5NNmVHeHBibXM5SW1oMGRIQTZMeTkzZDNjdWR6TXViM0puTHpFNU9Ua3ZlR3hwYm1zaUlIZzlJakJ3ZUNJZ2VUMGlNSEI0SWdvSklIWnBaWGRDYjNnOUlqQWdNQ0F4TmlBeE5pSWdjM1I1YkdVOUltVnVZV0pzWlMxaVlXTnJaM0p2ZFc1a09tNWxkeUF3SURBZ01UWWdNVFk3SWlCNGJXdzZjM0JoWTJVOUluQnlaWE5sY25abElqNEtQSE4wZVd4bElIUjVjR1U5SW5SbGVIUXZZM056SWo0S0NTNXpkREI3Wm1sc2JEb2pSa1pHUmtaR08zMEtDUzV6ZERGN1ptbHNiRHB1YjI1bE8zMEtQQzl6ZEhsc1pUNEtQSFJwZEd4bFBuVndZMmhsZG5KdmJqd3ZkR2wwYkdVK0NqeHdZWFJvSUdOc1lYTnpQU0p6ZERBaUlHUTlJazA0TERVdU1Xd3ROeTR6TERjdU0wd3dMREV4TGpac09DMDRiRGdzT0d3dE1DNDNMREF1TjB3NExEVXVNWG9pTHo0S1BISmxZM1FnWTJ4aGMzTTlJbk4wTVNJZ2QybGtkR2c5SWpFMklpQm9aV2xuYUhROUlqRTJJaTgrQ2p3dmMzWm5QZ289Jyk7XG5cdFx0XHRcdFx0XHR3aWR0aDogMTZweDtcblx0XHRcdFx0XHRcdGhlaWdodDogMTZweDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0JHtjc3N9XG5cdFx0XHRcdDwvc3R5bGU+XG5cdFx0XHQ8L2hlYWQ+XG5cdFx0XHQ8Ym9keT5cblx0XHRcdFx0PGEgaWQ9XCJzY3JvbGwtdG8tdG9wXCIgcm9sZT1cImJ1dHRvblwiIGFyaWEtbGFiZWw9XCJzY3JvbGwgdG8gdG9wXCIgaHJlZj1cIiNcIj48c3BhbiBjbGFzcz1cImljb25cIj48L3NwYW4+PC9hPlxuXHRcdFx0XHQke2JvZHl9XG5cdFx0XHQ8L2JvZHk+XG5cdFx0PC9odG1sPmA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5EZXRhaWxzKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0bGV0IGFjdGl2ZUVsZW1lbnQ6IElBY3RpdmVFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0IS5nZXQoKS5wcm9taXNlO1xuXHRcdGlmIChtYW5pZmVzdCAmJiBtYW5pZmVzdC5leHRlbnNpb25QYWNrPy5sZW5ndGggJiYgdGhpcy5zaGFsbFJlbmRlckFzRXh0ZW5zaW9uUGFjayhtYW5pZmVzdCkpIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQgPSBhd2FpdCB0aGlzLm9wZW5FeHRlbnNpb25QYWNrUmVhZG1lKGV4dGVuc2lvbiwgbWFuaWZlc3QsIGNvbnRlbnRDb250YWluZXIsIHRva2VuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWN0aXZlRWxlbWVudCA9IGF3YWl0IHRoaXMub3Blbk1hcmtkb3duKGV4dGVuc2lvbiwgdGhpcy5leHRlbnNpb25SZWFkbWUhLmdldCgpLCBsb2NhbGl6ZSgnbm9SZWFkbWUnLCBcIk5vIFJFQURNRSBhdmFpbGFibGUuXCIpLCBjb250ZW50Q29udGFpbmVyLCBXZWJ2aWV3SW5kZXguUmVhZG1lLCBsb2NhbGl6ZSgnUmVhZG1lIHRpdGxlJywgXCJSZWFkbWVcIiksIHRva2VuKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYWN0aXZlRWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgc2hhbGxSZW5kZXJBc0V4dGVuc2lvblBhY2sobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIShtYW5pZmVzdC5jYXRlZ29yaWVzPy5zb21lKGNhdGVnb3J5ID0+IGNhdGVnb3J5LnRvTG93ZXJDYXNlKCkgPT09ICdleHRlbnNpb24gcGFja3MnKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5FeHRlbnNpb25QYWNrUmVhZG1lKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uUGFja1JlYWRtZSA9IGFwcGVuZChjb250YWluZXIsICQoJ2RpdicsIHsgY2xhc3M6ICdleHRlbnNpb24tcGFjay1yZWFkbWUnIH0pKTtcblx0XHRleHRlbnNpb25QYWNrUmVhZG1lLnN0eWxlLm1hcmdpbiA9ICcwIGF1dG8nO1xuXHRcdGV4dGVuc2lvblBhY2tSZWFkbWUuc3R5bGUubWF4V2lkdGggPSAnODgycHgnO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uUGFjayA9IGFwcGVuZChleHRlbnNpb25QYWNrUmVhZG1lLCAkKCdkaXYnLCB7IGNsYXNzOiAnZXh0ZW5zaW9uLXBhY2snIH0pKTtcblxuXHRcdGNvbnN0IHBhY2tDb3VudCA9IG1hbmlmZXN0LmV4dGVuc2lvblBhY2shLmxlbmd0aDtcblx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSAzNzsgLy8gbmF2YmFyIGhlaWdodFxuXHRcdGNvbnN0IGNvbnRlbnRNaW5IZWlnaHQgPSAyMDA7IC8vIG1pbmltdW0gaGVpZ2h0IGZvciByZWFkbWUgY29udGVudFxuXG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4ge1xuXHRcdFx0ZXh0ZW5zaW9uUGFja1JlYWRtZS5jbGFzc0xpc3QucmVtb3ZlKCdvbmUtcm93JywgJ3R3by1yb3dzJywgJ3RocmVlLXJvd3MnLCAnbW9yZS1yb3dzJyk7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVIZWlnaHQgPSBjb250YWluZXIuY2xpZW50SGVpZ2h0O1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlRm9yUGFjayA9IE1hdGgubWF4KGF2YWlsYWJsZUhlaWdodCAtIGhlYWRlckhlaWdodCAtIGNvbnRlbnRNaW5IZWlnaHQsIDApO1xuXHRcdFx0bGV0IHJvd0NsYXNzID0gJ29uZS1yb3cnO1xuXHRcdFx0aWYgKGF2YWlsYWJsZUZvclBhY2sgPj0gMzAyICYmIHBhY2tDb3VudCA+IDYpIHtcblx0XHRcdFx0cm93Q2xhc3MgPSAnbW9yZS1yb3dzJztcblx0XHRcdH0gZWxzZSBpZiAoYXZhaWxhYmxlRm9yUGFjayA+PSAyODIgJiYgcGFja0NvdW50ID4gNCkge1xuXHRcdFx0XHRyb3dDbGFzcyA9ICd0aHJlZS1yb3dzJztcblx0XHRcdH0gZWxzZSBpZiAoYXZhaWxhYmxlRm9yUGFjayA+PSAyMDAgJiYgcGFja0NvdW50ID4gMikge1xuXHRcdFx0XHRyb3dDbGFzcyA9ICd0d28tcm93cyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyb3dDbGFzcyA9ICdvbmUtcm93Jztcblx0XHRcdH1cblx0XHRcdGV4dGVuc2lvblBhY2tSZWFkbWUuY2xhc3NMaXN0LmFkZChyb3dDbGFzcyk7XG5cdFx0fTtcblxuXHRcdGxheW91dCgpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywgeyBsYXlvdXQgfSkpKTtcblxuXHRcdGNvbnN0IGV4dGVuc2lvblBhY2tIZWFkZXIgPSBhcHBlbmQoZXh0ZW5zaW9uUGFjaywgJCgnZGl2LmhlYWRlcicpKTtcblx0XHRleHRlbnNpb25QYWNrSGVhZGVyLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2V4dGVuc2lvbiBwYWNrJywgXCJFeHRlbnNpb24gUGFjayAoezB9KVwiLCBtYW5pZmVzdC5leHRlbnNpb25QYWNrIS5sZW5ndGgpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblBhY2tDb250ZW50ID0gYXBwZW5kKGV4dGVuc2lvblBhY2ssICQoJ2RpdicsIHsgY2xhc3M6ICdleHRlbnNpb24tcGFjay1jb250ZW50JyB9KSk7XG5cdFx0ZXh0ZW5zaW9uUGFja0NvbnRlbnQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0Y29uc3QgcmVhZG1lQ29udGVudCA9IGFwcGVuZChleHRlbnNpb25QYWNrUmVhZG1lLCAkKCdkaXYucmVhZG1lLWNvbnRlbnQnKSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLnJlbmRlckV4dGVuc2lvblBhY2sobWFuaWZlc3QsIGV4dGVuc2lvblBhY2tDb250ZW50LCB0b2tlbiksXG5cdFx0XHR0aGlzLm9wZW5NYXJrZG93bihleHRlbnNpb24sIHRoaXMuZXh0ZW5zaW9uUmVhZG1lIS5nZXQoKSwgbG9jYWxpemUoJ25vUmVhZG1lJywgXCJObyBSRUFETUUgYXZhaWxhYmxlLlwiKSwgcmVhZG1lQ29udGVudCwgV2Vidmlld0luZGV4LlJlYWRtZSwgbG9jYWxpemUoJ1JlYWRtZSB0aXRsZScsIFwiUmVhZG1lXCIpLCB0b2tlbiksXG5cdFx0XSk7XG5cblx0XHRyZXR1cm4geyBmb2N1czogKCkgPT4gZXh0ZW5zaW9uUGFja0NvbnRlbnQuZm9jdXMoKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBZGRpdGlvbmFsRGV0YWlscyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHRlbnNpb246IElFeHRlbnNpb24pOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZW50ID0gJCgnZGl2JywgeyBjbGFzczogJ2FkZGl0aW9uYWwtZGV0YWlscy1jb250ZW50JywgdGFiaW5kZXg6ICcwJyB9KTtcblx0XHRjb25zdCBzY3JvbGxhYmxlQ29udGVudCA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChjb250ZW50LCB7fSk7XG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4gc2Nyb2xsYWJsZUNvbnRlbnQuc2NhbkRvbU5vZGUoKTtcblx0XHRjb25zdCByZW1vdmVMYXlvdXRQYXJ0aWNpcGFudCA9IGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0IH0pO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUocmVtb3ZlTGF5b3V0UGFydGljaXBhbnQpKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoc2Nyb2xsYWJsZUNvbnRlbnQpO1xuXG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWRkaXRpb25hbERldGFpbHNXaWRnZXQsIGNvbnRlbnQsIGV4dGVuc2lvbikpO1xuXG5cdFx0YXBwZW5kKGNvbnRhaW5lciwgc2Nyb2xsYWJsZUNvbnRlbnQuZ2V0RG9tTm9kZSgpKTtcblx0XHRzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQ2hhbmdlbG9nKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGF3YWl0IHRoaXMub3Blbk1hcmtkb3duKGV4dGVuc2lvbiwgdGhpcy5leHRlbnNpb25DaGFuZ2Vsb2chLmdldCgpLCBsb2NhbGl6ZSgnbm9DaGFuZ2Vsb2cnLCBcIk5vIENoYW5nZWxvZyBhdmFpbGFibGUuXCIpLCBjb250ZW50Q29udGFpbmVyLCBXZWJ2aWV3SW5kZXguQ2hhbmdlbG9nLCBsb2NhbGl6ZSgnQ2hhbmdlbG9nIHRpdGxlJywgXCJDaGFuZ2Vsb2dcIiksIHRva2VuKTtcblxuXHRcdHJldHVybiBhY3RpdmVFbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuRmVhdHVyZXMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMubG9hZENvbnRlbnRzKCgpID0+IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3QhLmdldCgpLCBjb250ZW50Q29udGFpbmVyKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25GZWF0dXJlc1RhYiA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbkZlYXR1cmVzVGFiLCBtYW5pZmVzdCwgKDxJRXh0ZW5zaW9uRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZD50aGlzLm9wdGlvbnMpPy5mZWF0dXJlKSk7XG5cdFx0Y29uc3QgZmVhdHVyZUxheW91dCA9ICgpID0+IGV4dGVuc2lvbkZlYXR1cmVzVGFiLmxheW91dChjb250ZW50Q29udGFpbmVyLmNsaWVudEhlaWdodCwgY29udGVudENvbnRhaW5lci5jbGllbnRXaWR0aCk7XG5cdFx0Y29uc3QgcmVtb3ZlTGF5b3V0UGFydGljaXBhbnQgPSBhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dDogZmVhdHVyZUxheW91dCB9KTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKHJlbW92ZUxheW91dFBhcnRpY2lwYW50KSk7XG5cdFx0YXBwZW5kKGNvbnRlbnRDb250YWluZXIsIGV4dGVuc2lvbkZlYXR1cmVzVGFiLmRvbU5vZGUpO1xuXHRcdGZlYXR1cmVMYXlvdXQoKTtcblxuXHRcdHJldHVybiBleHRlbnNpb25GZWF0dXJlc1RhYi5kb21Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuRXh0ZW5zaW9uRGVwZW5kZW5jaWVzKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH1cblxuXHRcdGlmIChhcnJheXMuaXNGYWxzeU9yRW1wdHkoZXh0ZW5zaW9uLmRlcGVuZGVuY2llcykpIHtcblx0XHRcdGFwcGVuZChjb250ZW50Q29udGFpbmVyLCAkKCdwLm5vY29udGVudCcpKS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub0RlcGVuZGVuY2llcycsIFwiTm8gRGVwZW5kZW5jaWVzXCIpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShjb250ZW50Q29udGFpbmVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50ID0gJCgnZGl2JywgeyBjbGFzczogJ3N1YmNvbnRlbnQnIH0pO1xuXHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gbmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGNvbnRlbnQsIHt9KTtcblx0XHRhcHBlbmQoY29udGVudENvbnRhaW5lciwgc2Nyb2xsYWJsZUNvbnRlbnQuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoc2Nyb2xsYWJsZUNvbnRlbnQpO1xuXG5cdFx0Y29uc3QgZGVwZW5kZW5jaWVzVHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc1RyZWUsXG5cdFx0XHRuZXcgRXh0ZW5zaW9uRGF0YShleHRlbnNpb24sIG51bGwsIGV4dGVuc2lvbiA9PiBleHRlbnNpb24uZGVwZW5kZW5jaWVzIHx8IFtdLCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKSwgY29udGVudCxcblx0XHRcdHtcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmRcblx0XHRcdH0pO1xuXHRcdGNvbnN0IGRlcExheW91dCA9ICgpID0+IHtcblx0XHRcdHNjcm9sbGFibGVDb250ZW50LnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHRjb25zdCBzY3JvbGxEaW1lbnNpb25zID0gc2Nyb2xsYWJsZUNvbnRlbnQuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdFx0ZGVwZW5kZW5jaWVzVHJlZS5sYXlvdXQoc2Nyb2xsRGltZW5zaW9ucy5oZWlnaHQpO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVtb3ZlTGF5b3V0UGFydGljaXBhbnQgPSBhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dDogZGVwTGF5b3V0IH0pO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUocmVtb3ZlTGF5b3V0UGFydGljaXBhbnQpKTtcblxuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChkZXBlbmRlbmNpZXNUcmVlKTtcblx0XHRkZXBMYXlvdXQoKTtcblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBmb2N1cygpIHsgZGVwZW5kZW5jaWVzVHJlZS5kb21Gb2N1cygpOyB9IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuRXh0ZW5zaW9uUGFjayhleHRlbnNpb246IElFeHRlbnNpb24sIGNvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMubG9hZENvbnRlbnRzKCgpID0+IHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3QhLmdldCgpLCBjb250ZW50Q29udGFpbmVyKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoIW1hbmlmZXN0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yZW5kZXJFeHRlbnNpb25QYWNrKG1hbmlmZXN0LCBjb250ZW50Q29udGFpbmVyLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlckV4dGVuc2lvblBhY2sobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgcGFyZW50OiBIVE1MRWxlbWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWN0aXZlRWxlbWVudCB8IG51bGw+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQgPSAkKCdkaXYnLCB7IGNsYXNzOiAnc3ViY29udGVudCcgfSk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoY29udGVudCwgeyB1c2VTaGFkb3dzOiBmYWxzZSB9KTtcblx0XHRhcHBlbmQocGFyZW50LCBzY3JvbGxhYmxlQ29udGVudC5nZXREb21Ob2RlKCkpO1xuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0dyaWRWaWV3ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zR3JpZFZpZXcsIGNvbnRlbnQsIG5ldyBEZWxlZ2F0ZSgpKTtcblx0XHRjb25zdCBleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBhd2FpdCBnZXRFeHRlbnNpb25zKG1hbmlmZXN0LmV4dGVuc2lvblBhY2shLCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHRleHRlbnNpb25zR3JpZFZpZXcuc2V0RXh0ZW5zaW9ucyhleHRlbnNpb25zKTtcblx0XHRzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpO1xuXG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHNjcm9sbGFibGVDb250ZW50KTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoZXh0ZW5zaW9uc0dyaWRWaWV3KTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0OiAoKSA9PiBzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpIH0pKSk7XG5cblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXG5cdHByaXZhdGUgbG9hZENvbnRlbnRzPFQ+KGxvYWRpbmdUYXNrOiAoKSA9PiBDYWNoZVJlc3VsdDxUPiwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsb2FkaW5nJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQobG9hZGluZ1Rhc2soKSk7XG5cdFx0Y29uc3Qgb25Eb25lID0gKCkgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2xvYWRpbmcnKTtcblx0XHRyZXN1bHQucHJvbWlzZS50aGVuKG9uRG9uZSwgb25Eb25lKTtcblxuXHRcdHJldHVybiByZXN1bHQucHJvbWlzZTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9uO1xuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLmZvckVhY2gocCA9PiBwLmxheW91dCgpKTtcblx0fVxuXG5cdHByaXZhdGUgb25FcnJvcihlcnI6IGFueSk6IHZvaWQge1xuXHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0fVxufVxuXG5jbGFzcyBBZGRpdGlvbmFsRGV0YWlsc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRleHRlbnNpb246IElFeHRlbnNpb24sXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUgJiYgYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikgJiYgZS5zZXJ2ZXIgPT09IGV4dGVuc2lvbi5zZXJ2ZXIpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXIoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKGV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0dGhpcy5yZW5kZXJJbnN0YWxsSW5mbyh0aGlzLmNvbnRhaW5lciwgZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5nYWxsZXJ5KSB7XG5cdFx0XHR0aGlzLnJlbmRlck1hcmtldHBsYWNlSW5mbyh0aGlzLmNvbnRhaW5lciwgZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXJDYXRlZ29yaWVzKHRoaXMuY29udGFpbmVyLCBleHRlbnNpb24pO1xuXHRcdHRoaXMucmVuZGVyRXh0ZW5zaW9uUmVzb3VyY2VzKHRoaXMuY29udGFpbmVyLCBleHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDYXRlZ29yaWVzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IHZvaWQge1xuXHRcdGlmIChleHRlbnNpb24uY2F0ZWdvcmllcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGNhdGVnb3JpZXNDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY2F0ZWdvcmllcy1jb250YWluZXIuYWRkaXRpb25hbC1kZXRhaWxzLWVsZW1lbnQnKSk7XG5cdFx0XHRhcHBlbmQoY2F0ZWdvcmllc0NvbnRhaW5lciwgJCgnLmFkZGl0aW9uYWwtZGV0YWlscy10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NhdGVnb3JpZXMnLCBcIkNhdGVnb3JpZXNcIikpKTtcblx0XHRcdGNvbnN0IGNhdGVnb3JpZXNFbGVtZW50ID0gYXBwZW5kKGNhdGVnb3JpZXNDb250YWluZXIsICQoJy5jYXRlZ29yaWVzJykpO1xuXHRcdFx0dGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCgpXG5cdFx0XHRcdC50aGVuKG1hbmlmZXN0ID0+IHtcblx0XHRcdFx0XHRjb25zdCBoYXNDYXRlZ29yeUZpbHRlciA9IG1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9uUXVlcnkuZmlsdGVyaW5nPy5zb21lKCh7IG5hbWUgfSkgPT4gbmFtZSA9PT0gRmlsdGVyVHlwZS5DYXRlZ29yeSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjYXRlZ29yeSBvZiBleHRlbnNpb24uY2F0ZWdvcmllcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2F0ZWdvcnlFbGVtZW50ID0gYXBwZW5kKGNhdGVnb3JpZXNFbGVtZW50LCAkKCdzcGFuLmNhdGVnb3J5JywgeyB0YWJpbmRleDogJzAnIH0sIGNhdGVnb3J5KSk7XG5cdFx0XHRcdFx0XHRpZiAoaGFzQ2F0ZWdvcnlGaWx0ZXIpIHtcblx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnlFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NsaWNrYWJsZScpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKGNhdGVnb3J5RWxlbWVudCwgKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAY2F0ZWdvcnk6XCIke2NhdGVnb3J5fVwiYCkpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRXh0ZW5zaW9uUmVzb3VyY2VzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlczogW3N0cmluZywgVGhlbWVJY29uLCBVUkldW10gPSBbXTtcblx0XHRpZiAoZXh0ZW5zaW9uLnJlcG9zaXRvcnkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlc291cmNlcy5wdXNoKFtsb2NhbGl6ZSgncmVwb3NpdG9yeScsIFwiUmVwb3NpdG9yeVwiKSwgVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnJlcG8uaWQpLCBVUkkucGFyc2UoZXh0ZW5zaW9uLnJlcG9zaXRvcnkpXSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgey8qIElnbm9yZSAqLyB9XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24uc3VwcG9ydFVybCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzb3VyY2VzLnB1c2goW2xvY2FsaXplKCdpc3N1ZXMnLCBcIklzc3Vlc1wiKSwgVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmlzc3Vlcy5pZCksIFVSSS5wYXJzZShleHRlbnNpb24uc3VwcG9ydFVybCldKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7LyogSWdub3JlICovIH1cblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbi5saWNlbnNlVXJsKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXNvdXJjZXMucHVzaChbbG9jYWxpemUoJ2xpY2Vuc2UnLCBcIkxpY2Vuc2VcIiksIFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5saW5rRXh0ZXJuYWwuaWQpLCBVUkkucGFyc2UoZXh0ZW5zaW9uLmxpY2Vuc2VVcmwpXSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgey8qIElnbm9yZSAqLyB9XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24ucHVibGlzaGVyVXJsKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaChbZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLCBUaGVtZUljb24uZnJvbUlkKENvZGljb24ubGlua0V4dGVybmFsLmlkKSwgZXh0ZW5zaW9uLnB1Ymxpc2hlclVybF0pO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLnVybCkge1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goW2xvY2FsaXplKCdNYXJrZXRwbGFjZScsIFwiTWFya2V0cGxhY2VcIiksIFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5saW5rRXh0ZXJuYWwuaWQpLCBVUkkucGFyc2UoZXh0ZW5zaW9uLnVybCldKTtcblx0XHR9XG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGggfHwgZXh0ZW5zaW9uLnB1Ymxpc2hlclNwb25zb3JMaW5rKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25SZXNvdXJjZXNDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucmVzb3VyY2VzLWNvbnRhaW5lci5hZGRpdGlvbmFsLWRldGFpbHMtZWxlbWVudCcpKTtcblx0XHRcdGFwcGVuZChleHRlbnNpb25SZXNvdXJjZXNDb250YWluZXIsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdyZXNvdXJjZXMnLCBcIlJlc291cmNlc1wiKSkpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzRWxlbWVudCA9IGFwcGVuZChleHRlbnNpb25SZXNvdXJjZXNDb250YWluZXIsICQoJy5yZXNvdXJjZXMnKSk7XG5cdFx0XHRmb3IgKGNvbnN0IFtsYWJlbCwgaWNvbiwgdXJpXSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VFbGVtZW50ID0gYXBwZW5kKHJlc291cmNlc0VsZW1lbnQsICQoJy5yZXNvdXJjZScpKTtcblx0XHRcdFx0YXBwZW5kKHJlc291cmNlRWxlbWVudCwgJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29uKSkpO1xuXHRcdFx0XHRhcHBlbmQocmVzb3VyY2VFbGVtZW50LCAkKCdhJywgeyB0YWJpbmRleDogJzAnIH0sIGxhYmVsKSk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2socmVzb3VyY2VFbGVtZW50LCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmkpKSk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCByZXNvdXJjZUVsZW1lbnQsIHVyaS50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbnN0YWxsSW5mbyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGluc3RhbGxJbmZvQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vcmUtaW5mby1jb250YWluZXIuYWRkaXRpb25hbC1kZXRhaWxzLWVsZW1lbnQnKSk7XG5cdFx0YXBwZW5kKGluc3RhbGxJbmZvQ29udGFpbmVyLCAkKCcuYWRkaXRpb25hbC1kZXRhaWxzLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnSW5zdGFsbCBJbmZvJywgXCJJbnN0YWxsYXRpb25cIikpKTtcblx0XHRjb25zdCBpbnN0YWxsSW5mbyA9IGFwcGVuZChpbnN0YWxsSW5mb0NvbnRhaW5lciwgJCgnLm1vcmUtaW5mbycpKTtcblx0XHRhcHBlbmQoaW5zdGFsbEluZm8sXG5cdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdpZCcsIFwiSWRlbnRpZmllclwiKSksXG5cdFx0XHRcdCQoJ2NvZGUnLCB1bmRlZmluZWQsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKVxuXHRcdFx0KSk7XG5cdFx0aWYgKGV4dGVuc2lvbi50eXBlICE9PSBFeHRlbnNpb25UeXBlLlN5c3RlbSkge1xuXHRcdFx0YXBwZW5kKGluc3RhbGxJbmZvLFxuXHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ1ZlcnNpb24nLCBcIlZlcnNpb25cIikpLFxuXHRcdFx0XHRcdCQoJ2NvZGUnLCB1bmRlZmluZWQsIGV4dGVuc2lvbi5tYW5pZmVzdC52ZXJzaW9uKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmluc3RhbGxlZFRpbWVzdGFtcCkge1xuXHRcdFx0YXBwZW5kKGluc3RhbGxJbmZvLFxuXHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2xhc3QgdXBkYXRlZCcsIFwiTGFzdCBVcGRhdGVkXCIpKSxcblx0XHRcdFx0XHQkKCdkaXYnLCB7XG5cdFx0XHRcdFx0XHQndGl0bGUnOiBuZXcgRGF0ZShleHRlbnNpb24uaW5zdGFsbGVkVGltZXN0YW1wKS50b1N0cmluZygpXG5cdFx0XHRcdFx0fSwgZnJvbU5vdyhleHRlbnNpb24uaW5zdGFsbGVkVGltZXN0YW1wLCB0cnVlLCB0cnVlLCB0cnVlKSlcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKCFleHRlbnNpb24uaXNCdWlsdGluICYmIGV4dGVuc2lvbi5zb3VyY2UgIT09ICdnYWxsZXJ5Jykge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9ICQoJ2RpdicsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLnNvdXJjZSA9PT0gJ3ZzaXgnID8gbG9jYWxpemUoJ3ZzaXgnLCBcIlZTSVhcIikgOiBsb2NhbGl6ZSgnb3RoZXInLCBcIkxvY2FsXCIpKTtcblx0XHRcdGFwcGVuZChpbnN0YWxsSW5mbyxcblx0XHRcdFx0JCgnLm1vcmUtaW5mby1lbnRyeScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdzb3VyY2UnLCBcIlNvdXJjZVwiKSksXG5cdFx0XHRcdFx0ZWxlbWVudFxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGlzTmF0aXZlICYmIGV4dGVuc2lvbi5zb3VyY2UgPT09ICdyZXNvdXJjZScgJiYgZXh0ZW5zaW9uLmxvY2F0aW9uLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGluaycpO1xuXHRcdFx0XHRlbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGluaycpO1xuXHRcdFx0XHRlbGVtZW50LnRpdGxlID0gZXh0ZW5zaW9uLmxvY2F0aW9uLmZzUGF0aDtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayhlbGVtZW50LCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihleHRlbnNpb24ubG9jYXRpb24sIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24uc2l6ZSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9ICQoJ2RpdicsIHVuZGVmaW5lZCwgQnl0ZVNpemUuZm9ybWF0U2l6ZShleHRlbnNpb24uc2l6ZSkpO1xuXHRcdFx0YXBwZW5kKGluc3RhbGxJbmZvLFxuXHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHsgdGl0bGU6IGxvY2FsaXplKCdzaXplIHdoZW4gaW5zdGFsbGVkJywgXCJTaXplIHdoZW4gaW5zdGFsbGVkXCIpIH0sIGxvY2FsaXplKCdzaXplJywgXCJTaXplXCIpKSxcblx0XHRcdFx0XHRlbGVtZW50XG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0XHRpZiAoaXNOYXRpdmUgJiYgZXh0ZW5zaW9uLmxvY2F0aW9uLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGluaycpO1xuXHRcdFx0XHRlbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGluaycpO1xuXHRcdFx0XHRlbGVtZW50LnRpdGxlID0gZXh0ZW5zaW9uLmxvY2F0aW9uLmZzUGF0aDtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayhlbGVtZW50LCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihleHRlbnNpb24ubG9jYXRpb24sIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuZ2V0Q2FjaGVMb2NhdGlvbihleHRlbnNpb24pLnRoZW4oY2FjaGVMb2NhdGlvbiA9PiB7XG5cdFx0XHRpZiAoIWNhY2hlTG9jYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29tcHV0ZVNpemUoY2FjaGVMb2NhdGlvbiwgdGhpcy5maWxlU2VydmljZSkudGhlbihjYWNoZVNpemUgPT4ge1xuXHRcdFx0XHRpZiAoIWNhY2hlU2l6ZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gJCgnZGl2JywgdW5kZWZpbmVkLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGNhY2hlU2l6ZSkpO1xuXHRcdFx0XHRhcHBlbmQoaW5zdGFsbEluZm8sXG5cdFx0XHRcdFx0JCgnLm1vcmUtaW5mby1lbnRyeScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHsgdGl0bGU6IGxvY2FsaXplKCdkaXNrIHNwYWNlIHVzZWQnLCBcIkNhY2hlIHNpemVcIikgfSwgbG9jYWxpemUoJ2NhY2hlIHNpemUnLCBcIkNhY2hlXCIpKSxcblx0XHRcdFx0XHRcdGVsZW1lbnQpXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmIChpc05hdGl2ZSAmJiBleHRlbnNpb24ubG9jYXRpb24uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpbmsnKTtcblx0XHRcdFx0XHRlbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaW5rJyk7XG5cdFx0XHRcdFx0ZWxlbWVudC50aXRsZSA9IGNhY2hlTG9jYXRpb24uZnNQYXRoO1xuXHRcdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2soZWxlbWVudCwgKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oY2FjaGVMb2NhdGlvbi53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUgfSksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDYWNoZUxvY2F0aW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgZXh0ZW5zaW9uQ2FjaGVMb2NhdGlvbiA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLmdsb2JhbFN0b3JhZ2VIb21lLCBleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2F0aW9uLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVSZW1vdGUpIHtcblx0XHRcdGNvbnN0IGVudmlyb25tZW50ID0gYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRcdGlmICghZW52aXJvbm1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGV4dGVuc2lvbkNhY2hlTG9jYXRpb24gPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgoZW52aXJvbm1lbnQuZ2xvYmFsU3RvcmFnZUhvbWUsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uQ2FjaGVMb2NhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWFya2V0cGxhY2VJbmZvKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGdhbGxlcnkgPSBleHRlbnNpb24uZ2FsbGVyeTtcblx0XHRjb25zdCBtb3JlSW5mb0NvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5tb3JlLWluZm8tY29udGFpbmVyLmFkZGl0aW9uYWwtZGV0YWlscy1lbGVtZW50JykpO1xuXHRcdGFwcGVuZChtb3JlSW5mb0NvbnRhaW5lciwgJCgnLmFkZGl0aW9uYWwtZGV0YWlscy10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ01hcmtldHBsYWNlIEluZm8nLCBcIk1hcmtldHBsYWNlXCIpKSk7XG5cdFx0Y29uc3QgbW9yZUluZm8gPSBhcHBlbmQobW9yZUluZm9Db250YWluZXIsICQoJy5tb3JlLWluZm8nKSk7XG5cdFx0aWYgKGdhbGxlcnkpIHtcblx0XHRcdGlmICghZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHRcdGFwcGVuZChtb3JlSW5mbyxcblx0XHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnaWQnLCBcIklkZW50aWZpZXJcIikpLFxuXHRcdFx0XHRcdFx0JCgnY29kZScsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdGFwcGVuZChtb3JlSW5mbyxcblx0XHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnVmVyc2lvbicsIFwiVmVyc2lvblwiKSksXG5cdFx0XHRcdFx0XHQkKCdjb2RlJywgdW5kZWZpbmVkLCBnYWxsZXJ5LnZlcnNpb24pXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0YXBwZW5kKG1vcmVJbmZvLFxuXHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3B1Ymxpc2hlZCcsIFwiUHVibGlzaGVkXCIpKSxcblx0XHRcdFx0XHQkKCdkaXYnLCB7XG5cdFx0XHRcdFx0XHQndGl0bGUnOiBuZXcgRGF0ZShnYWxsZXJ5LnJlbGVhc2VEYXRlKS50b1N0cmluZygpXG5cdFx0XHRcdFx0fSwgZnJvbU5vdyhnYWxsZXJ5LnJlbGVhc2VEYXRlLCB0cnVlLCB0cnVlLCB0cnVlKSlcblx0XHRcdFx0KSxcblx0XHRcdFx0JCgnLm1vcmUtaW5mby1lbnRyeScsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdsYXN0IHJlbGVhc2VkJywgXCJMYXN0IFJlbGVhc2VkXCIpKSxcblx0XHRcdFx0XHQkKCdkaXYnLCB7XG5cdFx0XHRcdFx0XHQndGl0bGUnOiBuZXcgRGF0ZShnYWxsZXJ5Lmxhc3RVcGRhdGVkKS50b1N0cmluZygpXG5cdFx0XHRcdFx0fSwgZnJvbU5vdyhnYWxsZXJ5Lmxhc3RVcGRhdGVkLCB0cnVlLCB0cnVlLCB0cnVlKSlcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgY29udGV4dEtleUV4cHIgPSBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBFeHRlbnNpb25FZGl0b3IuSUQpLCBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cy50b05lZ2F0ZWQoKSk7XG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0V4dGVuc2lvbkVkaXRvckZpbmRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmV4dGVuc2lvbmVkaXRvci5zaG93ZmluZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbmQnLCBcIkZpbmRcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IGNvbnRleHRLZXlFeHByLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUYsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRWRpdG9yID0gZ2V0RXh0ZW5zaW9uRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRleHRlbnNpb25FZGl0b3I/LnNob3dGaW5kKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RhcnRFeHRlbnNpb25FZGl0b3JGaW5kTmV4dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uZXh0ZW5zaW9uZWRpdG9yLmZpbmROZXh0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZmluZCBuZXh0JywgXCJGaW5kIE5leHRcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRjb250ZXh0S2V5RXhwcixcblx0XHRcdFx0XHRLRVlCSU5ESU5HX0NPTlRFWFRfV0VCVklFV19GSU5EX1dJREdFVF9GT0NVU0VEKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBleHRlbnNpb25FZGl0b3IgPSBnZXRFeHRlbnNpb25FZGl0b3IoYWNjZXNzb3IpO1xuXHRcdGV4dGVuc2lvbkVkaXRvcj8ucnVuRmluZEFjdGlvbihmYWxzZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RhcnRFeHRlbnNpb25FZGl0b3JGaW5kUHJldmlvdXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmV4dGVuc2lvbmVkaXRvci5maW5kUHJldmlvdXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmaW5kIHByZXZpb3VzJywgXCJGaW5kIFByZXZpb3VzXCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Y29udGV4dEtleUV4cHIsXG5cdFx0XHRcdFx0S0VZQklORElOR19DT05URVhUX1dFQlZJRVdfRklORF9XSURHRVRfRk9DVVNFRCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRWRpdG9yID0gZ2V0RXh0ZW5zaW9uRWRpdG9yKGFjY2Vzc29yKTtcblx0XHRleHRlbnNpb25FZGl0b3I/LnJ1bkZpbmRBY3Rpb24odHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWU6IElDb2xvclRoZW1lLCBjb2xsZWN0b3I6IElDc3NTdHlsZUNvbGxlY3RvcikgPT4ge1xuXG5cdGNvbnN0IGxpbmsgPSB0aGVtZS5nZXRDb2xvcih0ZXh0TGlua0ZvcmVncm91bmQpO1xuXHRpZiAobGluaykge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAuZXh0ZW5zaW9uLWVkaXRvciAuY29udGVudCAuZGV0YWlscyAuYWRkaXRpb25hbC1kZXRhaWxzLWNvbnRhaW5lciAucmVzb3VyY2VzLWNvbnRhaW5lciBhLnJlc291cmNlIHsgY29sb3I6ICR7bGlua307IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLmV4dGVuc2lvbi1lZGl0b3IgLmNvbnRlbnQgLmZlYXR1cmUtY29udHJpYnV0aW9ucyBhIHsgY29sb3I6ICR7bGlua307IH1gKTtcblx0fVxuXG5cdGNvbnN0IGFjdGl2ZUxpbmsgPSB0aGVtZS5nZXRDb2xvcih0ZXh0TGlua0FjdGl2ZUZvcmVncm91bmQpO1xuXHRpZiAoYWN0aXZlTGluaykge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAuZXh0ZW5zaW9uLWVkaXRvciAuY29udGVudCAuZGV0YWlscyAuYWRkaXRpb25hbC1kZXRhaWxzLWNvbnRhaW5lciAucmVzb3VyY2VzLWNvbnRhaW5lciBhLnJlc291cmNlOmhvdmVyLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLmV4dGVuc2lvbi1lZGl0b3IgLmNvbnRlbnQgLmRldGFpbHMgLmFkZGl0aW9uYWwtZGV0YWlscy1jb250YWluZXIgLnJlc291cmNlcy1jb250YWluZXIgYS5yZXNvdXJjZTphY3RpdmUgeyBjb2xvcjogJHthY3RpdmVMaW5rfTsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLXdvcmtiZW5jaCAuZXh0ZW5zaW9uLWVkaXRvciAuY29udGVudCAuZmVhdHVyZS1jb250cmlidXRpb25zIGE6aG92ZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAuZXh0ZW5zaW9uLWVkaXRvciAuY29udGVudCAuZmVhdHVyZS1jb250cmlidXRpb25zIGE6YWN0aXZlIHsgY29sb3I6ICR7YWN0aXZlTGlua307IH1gKTtcblx0fVxuXG5cdGNvbnN0IGJ1dHRvbkhvdmVyQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoYnV0dG9uSG92ZXJCYWNrZ3JvdW5kKTtcblx0aWYgKGJ1dHRvbkhvdmVyQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28td29ya2JlbmNoIC5leHRlbnNpb24tZWRpdG9yIC5jb250ZW50ID4gLmRldGFpbHMgPiAuYWRkaXRpb25hbC1kZXRhaWxzLWNvbnRhaW5lciAuY2F0ZWdvcmllcy1jb250YWluZXIgPiAuY2F0ZWdvcmllcyA+IC5jYXRlZ29yeS5jbGlja2FibGU6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke2J1dHRvbkhvdmVyQmFja2dyb3VuZENvbG9yfTsgYm9yZGVyLWNvbG9yOiAke2J1dHRvbkhvdmVyQmFja2dyb3VuZENvbG9yfTsgfWApO1xuXHR9XG5cblx0Y29uc3QgYnV0dG9uRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoYnV0dG9uRm9yZWdyb3VuZCk7XG5cdGlmIChidXR0b25Gb3JlZ3JvdW5kQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby13b3JrYmVuY2ggLmV4dGVuc2lvbi1lZGl0b3IgLmNvbnRlbnQgPiAuZGV0YWlscyA+IC5hZGRpdGlvbmFsLWRldGFpbHMtY29udGFpbmVyIC5jYXRlZ29yaWVzLWNvbnRhaW5lciA+IC5jYXRlZ29yaWVzID4gLmNhdGVnb3J5LmNsaWNrYWJsZTpob3ZlciB7IGNvbG9yOiAke2J1dHRvbkZvcmVncm91bmRDb2xvcn07IH1gKTtcblx0fVxuXG59KTtcblxuZnVuY3Rpb24gZ2V0RXh0ZW5zaW9uRWRpdG9yKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogRXh0ZW5zaW9uRWRpdG9yIHwgbnVsbCB7XG5cdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmU7XG5cdGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgRXh0ZW5zaW9uRWRpdG9yKSB7XG5cdFx0cmV0dXJuIGFjdGl2ZUVkaXRvclBhbmU7XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBYyxRQUFRLE1BQU0saUJBQWlCLFlBQVk7QUFDbEUsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxjQUF1QjtBQUNoQyxZQUFZLFlBQVk7QUFDeEIsU0FBUyxhQUEwQjtBQUNuQyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsU0FBUyxvQkFBb0I7QUFDdEYsU0FBUyxTQUFTLHFCQUFxQjtBQUN2QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTztBQUNQLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxnQkFBNkIsb0JBQThDLHFCQUFx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QUFRO0FBQ25ELHFCQUFpQixjQUFjLElBQUk7QUFBQSxFQUNwQztBQUNELENBQUM7QUFFRCwyQkFBMkIsQ0FBQyxPQUFvQixjQUFrQztBQUVqRixRQUFNLE9BQU8sTUFBTSxTQUFTLGtCQUFrQjtBQUM5QyxNQUFJLE1BQU07QUFDVCxjQUFVLFFBQVEsZ0lBQWdJLElBQUksS0FBSztBQUMzSixjQUFVLFFBQVEsa0ZBQWtGLElBQUksS0FBSztBQUFBLEVBQzlHO0FBRUEsUUFBTSxhQUFhLE1BQU0sU0FBUyx3QkFBd0I7QUFDMUQsTUFBSSxZQUFZO0FBQ2YsY0FBVSxRQUFRO0FBQUEseUlBQ3FILFVBQVUsS0FBSztBQUN0SixjQUFVLFFBQVE7QUFBQSwyRkFDdUUsVUFBVSxLQUFLO0FBQUEsRUFDekc7QUFFQSxRQUFNLDZCQUE2QixNQUFNLFNBQVMscUJBQXFCO0FBQ3ZFLE1BQUksNEJBQTRCO0FBQy9CLGNBQVUsUUFBUSwrS0FBK0ssMEJBQTBCLG1CQUFtQiwwQkFBMEIsS0FBSztBQUFBLEVBQzlRO0FBRUEsUUFBTSx3QkFBd0IsTUFBTSxTQUFTLGdCQUFnQjtBQUM3RCxNQUFJLHVCQUF1QjtBQUMxQixjQUFVLFFBQVEsb0tBQW9LLHFCQUFxQixLQUFLO0FBQUEsRUFDak47QUFFRCxDQUFDO0FBRUQsU0FBUyxtQkFBbUIsVUFBb0Q7QUFDL0UsUUFBTSxtQkFBbUIsU0FBUyxJQUFJLGNBQWMsRUFBRTtBQUN0RCxNQUFJLDRCQUE0QixpQkFBaUI7QUFDaEQsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImFjdGlvbiIsICJXZWJ2aWV3SW5kZXgiLCAiJCIsICJib2R5IiwgImV4dGVuc2lvbiJdCn0K
