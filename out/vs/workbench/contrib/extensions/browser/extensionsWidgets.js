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
import "./media/extensionsWidgets.css";
import * as semver from "../../../../base/common/semver/semver.js";
import { Disposable, toDisposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IExtensionsWorkbenchService, ExtensionState, ExtensionEditorTab } from "../common/extensions.js";
import { append, $, reset, addDisposableListener, EventType, finalHandler } from "../../../../base/browser/dom.js";
import * as platform from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { IExtensionManagementServerService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { extensionButtonProminentBackground } from "./extensionsActions.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { EXTENSION_BADGE_BACKGROUND, EXTENSION_BADGE_FOREGROUND } from "../../../common/theme.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { activationTimeIcon, errorIcon, infoIcon, installCountIcon, preReleaseIcon, privateExtensionIcon, ratingIcon, remoteIcon, restartRequiredIcon, sponsorIcon, starEmptyIcon, starFullIcon, starHalfIcon, syncIgnoredIcon, warningIcon } from "./extensionsIcons.js";
import { registerColor, textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { URI } from "../../../../base/common/uri.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import Severity from "../../../../base/common/severity.js";
import { Color } from "../../../../base/common/color.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { extensionDefaultIcon, extensionVerifiedPublisherIconColor, verifiedPublisherIcon } from "../../../services/extensionManagement/common/extensionsIcons.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IExplorerService } from "../../files/browser/files.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { VIEW_ID as EXPLORER_VIEW_ID } from "../../files/common/files.js";
import { IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
class ExtensionWidget extends Disposable {
  constructor() {
    super(...arguments);
    this._extension = null;
  }
  get extension() {
    return this._extension;
  }
  set extension(extension) {
    this._extension = extension;
    this.update();
  }
  update() {
    this.render();
  }
}
function onClick(element, callback) {
  const disposables = new DisposableStore();
  disposables.add(addDisposableListener(element, EventType.CLICK, finalHandler(callback)));
  disposables.add(addDisposableListener(element, EventType.KEY_UP, (e) => {
    const keyboardEvent = new StandardKeyboardEvent(e);
    if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  }));
  return disposables;
}
class ExtensionIconWidget extends ExtensionWidget {
  constructor(container) {
    super();
    this.iconLoadingDisposable = this._register(new MutableDisposable());
    this.iconErrorDisposable = this._register(new MutableDisposable());
    this.element = append(container, $(".extension-icon"));
    this.iconElement = append(this.element, $("img.icon", { alt: "" }));
    this.iconElement.style.display = "none";
    this.defaultIconElement = append(this.element, $(ThemeIcon.asCSSSelector(extensionDefaultIcon)));
    this.defaultIconElement.style.display = "none";
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.iconUrl = void 0;
    this.iconElement.src = "";
    this.iconElement.style.display = "none";
    this.defaultIconElement.style.display = "none";
    this.iconErrorDisposable.clear();
    this.iconLoadingDisposable.clear();
  }
  render() {
    if (!this.extension) {
      this.clear();
      return;
    }
    if (this.extension.iconUrl) {
      if (this.iconUrl !== this.extension.iconUrl) {
        this.iconElement.style.display = "inherit";
        this.defaultIconElement.style.display = "none";
        this.iconUrl = this.extension.iconUrl;
        this.iconErrorDisposable.value = addDisposableListener(this.iconElement, "error", () => {
          if (this.extension?.iconUrlFallback) {
            this.iconElement.src = this.extension.iconUrlFallback;
          } else {
            this.iconElement.style.display = "none";
            this.defaultIconElement.style.display = "inherit";
          }
        }, { once: true });
        this.iconElement.src = this.iconUrl;
        if (!this.iconElement.complete) {
          this.iconElement.style.visibility = "hidden";
          this.iconLoadingDisposable.value = addDisposableListener(this.iconElement, "load", () => {
            this.iconElement.style.visibility = "inherit";
          });
        } else {
          this.iconElement.style.visibility = "inherit";
        }
      }
    } else {
      this.iconUrl = void 0;
      this.iconElement.style.display = "none";
      this.iconElement.src = "";
      this.defaultIconElement.style.display = "inherit";
      this.iconErrorDisposable.clear();
      this.iconLoadingDisposable.clear();
    }
  }
}
let InstallCountWidget = class extends ExtensionWidget {
  constructor(container, small, hoverService) {
    super();
    this.container = container;
    this.small = small;
    this.hoverService = hoverService;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.container.innerText = "";
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension) {
      return;
    }
    if (this.small && this.extension.state !== ExtensionState.Uninstalled) {
      return;
    }
    const installLabel = InstallCountWidget.getInstallLabel(this.extension, this.small);
    if (!installLabel) {
      return;
    }
    const parent = this.small ? this.container : append(this.container, $("span.install", { tabIndex: 0 }));
    append(parent, $("span" + ThemeIcon.asCSSSelector(installCountIcon)));
    const count = append(parent, $("span.count"));
    count.textContent = installLabel;
    if (!this.small) {
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.container, localize("install count", "Install count")));
    }
  }
  static getInstallLabel(extension, small) {
    const installCount = extension.installCount;
    if (!installCount) {
      return void 0;
    }
    let installLabel;
    if (small) {
      if (installCount > 1e6) {
        installLabel = `${Math.floor(installCount / 1e5) / 10}M`;
      } else if (installCount > 1e3) {
        installLabel = `${Math.floor(installCount / 1e3)}K`;
      } else {
        installLabel = String(installCount);
      }
    } else {
      installLabel = installCount.toLocaleString(platform.language);
    }
    return installLabel;
  }
};
InstallCountWidget = __decorateClass([
  __decorateParam(2, IHoverService)
], InstallCountWidget);
let RatingsWidget = class extends ExtensionWidget {
  constructor(container, small, hoverService, openerService) {
    super();
    this.container = container;
    this.small = small;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    container.classList.add("extension-ratings");
    if (this.small) {
      container.classList.add("small");
    }
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.container.innerText = "";
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension) {
      return;
    }
    if (this.small && this.extension.state !== ExtensionState.Uninstalled) {
      return;
    }
    if (this.extension.rating === void 0) {
      return;
    }
    if (this.small && !this.extension.ratingCount) {
      return;
    }
    if (!this.extension.url) {
      return;
    }
    const rating = Math.round(this.extension.rating * 2) / 2;
    if (this.small) {
      append(this.container, $("span" + ThemeIcon.asCSSSelector(starFullIcon)));
      const count = append(this.container, $("span.count"));
      count.textContent = String(rating);
    } else {
      const element = append(this.container, $("span.rating.clickable", { tabIndex: 0 }));
      for (let i = 1; i <= 5; i++) {
        if (rating >= i) {
          append(element, $("span" + ThemeIcon.asCSSSelector(starFullIcon)));
        } else if (rating >= i - 0.5) {
          append(element, $("span" + ThemeIcon.asCSSSelector(starHalfIcon)));
        } else {
          append(element, $("span" + ThemeIcon.asCSSSelector(starEmptyIcon)));
        }
      }
      if (this.extension.ratingCount) {
        const ratingCountElemet = append(element, $("span", void 0, ` (${this.extension.ratingCount})`));
        ratingCountElemet.style.paddingLeft = "1px";
      }
      this.containerHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, ""));
      this.containerHover.update(localize("ratedLabel", "Average rating: {0} out of 5", rating));
      element.setAttribute("role", "link");
      if (this.extension.ratingUrl) {
        this.disposables.add(onClick(element, () => this.openerService.open(URI.parse(this.extension.ratingUrl))));
      }
    }
  }
};
RatingsWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IOpenerService)
], RatingsWidget);
let PublisherWidget = class extends ExtensionWidget {
  constructor(container, small, extensionsWorkbenchService, hoverService, openerService) {
    super();
    this.container = container;
    this.small = small;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.element?.remove();
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension) {
      return;
    }
    if (this.extension.resourceExtension) {
      return;
    }
    if (this.extension.local?.source === "resource") {
      return;
    }
    this.element = append(this.container, $(".publisher"));
    const publisherDisplayName = $(".publisher-name.ellipsis");
    publisherDisplayName.textContent = this.extension.publisherDisplayName;
    const verifiedPublisher = $(".verified-publisher");
    append(verifiedPublisher, $("span.extension-verified-publisher.clickable"), renderIcon(verifiedPublisherIcon));
    if (this.small) {
      if (this.extension.publisherDomain?.verified) {
        append(this.element, verifiedPublisher);
      }
      append(this.element, publisherDisplayName);
    } else {
      this.element.classList.toggle("clickable", !!this.extension.url);
      this.element.setAttribute("role", "button");
      this.element.tabIndex = 0;
      this.containerHover = this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, localize("publisher", "Publisher ({0})", this.extension.publisherDisplayName)));
      append(this.element, publisherDisplayName);
      if (this.extension.publisherDomain?.verified) {
        append(this.element, verifiedPublisher);
        const publisherDomainLink = URI.parse(this.extension.publisherDomain.link);
        verifiedPublisher.tabIndex = 0;
        verifiedPublisher.setAttribute("role", "button");
        this.containerHover.update(localize("verified publisher", "This publisher has verified ownership of {0}", this.extension.publisherDomain.link));
        verifiedPublisher.setAttribute("role", "link");
        append(verifiedPublisher, $("span.extension-verified-publisher-domain", void 0, publisherDomainLink.authority.startsWith("www.") ? publisherDomainLink.authority.substring(4) : publisherDomainLink.authority));
        this.disposables.add(onClick(verifiedPublisher, () => this.openerService.open(publisherDomainLink)));
      }
      if (this.extension.url) {
        this.disposables.add(onClick(this.element, () => this.extensionsWorkbenchService.openSearch(`publisher:"${this.extension?.publisherDisplayName}"`)));
      }
    }
  }
};
PublisherWidget = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IOpenerService)
], PublisherWidget);
let SponsorWidget = class extends ExtensionWidget {
  constructor(container, hoverService, openerService) {
    super();
    this.container = container;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    this.render();
  }
  render() {
    reset(this.container);
    this.disposables.clear();
    if (!this.extension?.publisherSponsorLink) {
      return;
    }
    const sponsor = append(this.container, $("span.sponsor.clickable", { tabIndex: 0 }));
    this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), sponsor, this.extension?.publisherSponsorLink.toString() ?? ""));
    sponsor.setAttribute("role", "link");
    const sponsorIconElement = renderIcon(sponsorIcon);
    const label = $("span", void 0, localize("sponsor", "Sponsor"));
    append(sponsor, sponsorIconElement, label);
    this.disposables.add(onClick(sponsor, () => {
      this.openerService.open(this.extension.publisherSponsorLink);
    }));
  }
};
SponsorWidget = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IOpenerService)
], SponsorWidget);
let RecommendationWidget = class extends ExtensionWidget {
  constructor(parent, extensionRecommendationsService) {
    super();
    this.parent = parent;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.render()));
  }
  clear() {
    this.element?.remove();
    this.element = void 0;
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension || this.extension.state === ExtensionState.Installed || this.extension.deprecationInfo) {
      return;
    }
    const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
    if (extRecommendations[this.extension.identifier.id.toLowerCase()]) {
      this.element = append(this.parent, $("div.extension-bookmark"));
      const recommendation = append(this.element, $(".recommendation"));
      append(recommendation, $("span" + ThemeIcon.asCSSSelector(ratingIcon)));
    }
  }
};
RecommendationWidget = __decorateClass([
  __decorateParam(1, IExtensionRecommendationsService)
], RecommendationWidget);
class PreReleaseBookmarkWidget extends ExtensionWidget {
  constructor(parent) {
    super();
    this.parent = parent;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.element?.remove();
    this.element = void 0;
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (this.extension?.state === ExtensionState.Installed ? this.extension.preRelease : this.extension?.hasPreReleaseVersion) {
      this.element = append(this.parent, $("div.extension-bookmark"));
      const preRelease = append(this.element, $(".pre-release"));
      append(preRelease, $("span" + ThemeIcon.asCSSSelector(preReleaseIcon)));
    }
  }
}
let RemoteBadgeWidget = class extends ExtensionWidget {
  constructor(parent, tooltip, extensionManagementServerService, instantiationService) {
    super();
    this.tooltip = tooltip;
    this.extensionManagementServerService = extensionManagementServerService;
    this.instantiationService = instantiationService;
    this.remoteBadge = this._register(new MutableDisposable());
    this.element = append(parent, $(""));
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.remoteBadge.value?.element.remove();
    this.remoteBadge.clear();
  }
  render() {
    this.clear();
    if (!this.extension || !this.extension.local || !this.extension.server || !(this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) || this.extension.server !== this.extensionManagementServerService.remoteExtensionManagementServer) {
      return;
    }
    let tooltip;
    if (this.tooltip && this.extensionManagementServerService.remoteExtensionManagementServer) {
      tooltip = localize("remote extension title", "Extension in {0}", this.extensionManagementServerService.remoteExtensionManagementServer.label);
    }
    this.remoteBadge.value = this.instantiationService.createInstance(ExtensionIconBadge, remoteIcon, tooltip);
    append(this.element, this.remoteBadge.value.element);
  }
};
RemoteBadgeWidget = __decorateClass([
  __decorateParam(2, IExtensionManagementServerService),
  __decorateParam(3, IInstantiationService)
], RemoteBadgeWidget);
let ExtensionIconBadge = class extends Disposable {
  constructor(icon, tooltip, hoverService, labelService, themeService) {
    super();
    this.icon = icon;
    this.tooltip = tooltip;
    this.labelService = labelService;
    this.themeService = themeService;
    this.element = $("div.extension-badge.extension-icon-badge");
    this.elementHover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, ""));
    this.render();
  }
  render() {
    append(this.element, $("span" + ThemeIcon.asCSSSelector(this.icon)));
    const applyBadgeStyle = () => {
      if (!this.element) {
        return;
      }
      const bgColor = this.themeService.getColorTheme().getColor(EXTENSION_BADGE_BACKGROUND);
      const fgColor = this.themeService.getColorTheme().getColor(EXTENSION_BADGE_FOREGROUND);
      this.element.style.backgroundColor = bgColor ? bgColor.toString() : "";
      this.element.style.color = fgColor ? fgColor.toString() : "";
    };
    applyBadgeStyle();
    this._register(this.themeService.onDidColorThemeChange(() => applyBadgeStyle()));
    if (this.tooltip) {
      const updateTitle = () => {
        if (this.element) {
          this.elementHover.update(this.tooltip);
        }
      };
      this._register(this.labelService.onDidChangeFormatters(() => updateTitle()));
      updateTitle();
    }
  }
};
ExtensionIconBadge = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IThemeService)
], ExtensionIconBadge);
class ExtensionPackCountWidget extends ExtensionWidget {
  constructor(parent) {
    super();
    this.parent = parent;
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.element?.remove();
    this.countBadge?.dispose();
    this.countBadge = void 0;
  }
  render() {
    this.clear();
    if (!this.extension || !this.extension.categories?.some((category) => category.toLowerCase() === "extension packs") || !this.extension.extensionPack.length) {
      return;
    }
    this.element = append(this.parent, $(".extension-badge.extension-pack-badge"));
    this.countBadge = new CountBadge(this.element, {}, defaultCountBadgeStyles);
    this.countBadge.setCount(this.extension.extensionPack.length);
  }
}
let ExtensionKindIndicatorWidget = class extends ExtensionWidget {
  constructor(container, small, hoverService, contextService, uriIdentityService, explorerService, viewsService, extensionGalleryManifestService) {
    super();
    this.container = container;
    this.small = small;
    this.hoverService = hoverService;
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this.explorerService = explorerService;
    this.viewsService = viewsService;
    this.extensionGalleryManifest = null;
    this.disposables = this._register(new DisposableStore());
    this.render();
    this._register(toDisposable(() => this.clear()));
    extensionGalleryManifestService.getExtensionGalleryManifest().then((manifest) => {
      if (this._store.isDisposed) {
        return;
      }
      this.extensionGalleryManifest = manifest;
      this.render();
    });
  }
  clear() {
    this.element?.remove();
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.extension) {
      return;
    }
    if (this.extension?.private) {
      this.element = append(this.container, $(".extension-kind-indicator"));
      if (!this.small || this.extensionGalleryManifest?.capabilities.extensions?.includePublicExtensions && this.extensionGalleryManifest?.capabilities.extensions?.includePrivateExtensions) {
        append(this.element, $("span" + ThemeIcon.asCSSSelector(privateExtensionIcon)));
      }
      if (!this.small) {
        append(this.element, $("span.private-extension-label", void 0, localize("privateExtension", "Private Extension")));
      }
      return;
    }
    if (!this.small) {
      return;
    }
    const location = this.extension.resourceExtension?.location ?? (this.extension.local?.source === "resource" ? this.extension.local?.location : void 0);
    if (!location) {
      return;
    }
    this.element = append(this.container, $(".extension-kind-indicator"));
    const workspaceFolder = this.contextService.getWorkspaceFolder(location);
    if (workspaceFolder && this.extension.isWorkspaceScoped) {
      this.element.textContent = localize("workspace extension", "Workspace Extension");
      this.element.classList.add("clickable");
      this.element.setAttribute("role", "button");
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, this.uriIdentityService.extUri.relativePath(workspaceFolder.uri, location)));
      this.disposables.add(onClick(this.element, () => {
        this.viewsService.openView(EXPLORER_VIEW_ID, true).then(() => this.explorerService.select(location, true));
      }));
    } else {
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, location.path));
      this.element.textContent = localize("local extension", "Local Extension");
    }
  }
};
ExtensionKindIndicatorWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IExplorerService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, IExtensionGalleryManifestService)
], ExtensionKindIndicatorWidget);
let SyncIgnoredWidget = class extends ExtensionWidget {
  constructor(container, configurationService, extensionsWorkbenchService, hoverService, userDataSyncEnablementService) {
    super();
    this.container = container;
    this.configurationService = configurationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.hoverService = hoverService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.disposables = this._register(new DisposableStore());
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.ignoredExtensions"))(() => this.render()));
    this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.update()));
    this.render();
  }
  render() {
    this.disposables.clear();
    this.container.innerText = "";
    if (this.extension && this.extension.state === ExtensionState.Installed && this.userDataSyncEnablementService.isEnabled() && this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension)) {
      const element = append(this.container, $("span.extension-sync-ignored" + ThemeIcon.asCSSSelector(syncIgnoredIcon)));
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, localize("syncingore.label", "This extension is ignored during sync.")));
      element.classList.add(...ThemeIcon.asClassNameArray(syncIgnoredIcon));
    }
  }
};
SyncIgnoredWidget = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IUserDataSyncEnablementService)
], SyncIgnoredWidget);
let ExtensionRestartRequiredWidget = class extends ExtensionWidget {
  constructor(container, hoverService) {
    super();
    this.container = container;
    this.hoverService = hoverService;
    this.disposables = this._register(new DisposableStore());
  }
  render() {
    this.disposables.clear();
    this.container.innerText = "";
    const runtimeState = this.extension?.runtimeState;
    const reason = typeof runtimeState?.reason === "string" ? runtimeState.reason : "";
    if (runtimeState && /restart|reload/i.test(reason)) {
      const element = append(this.container, $("span.extension-restart-required" + ThemeIcon.asCSSSelector(restartRequiredIcon)));
      append(this.container, $("span.extension-restart-required-label", void 0, localize("restart required", "Restart Required")));
      this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), element, reason));
    }
  }
};
ExtensionRestartRequiredWidget = __decorateClass([
  __decorateParam(1, IHoverService)
], ExtensionRestartRequiredWidget);
let ExtensionRuntimeStatusWidget = class extends ExtensionWidget {
  constructor(extensionViewState, container, extensionService, extensionFeaturesManagementService, extensionsWorkbenchService) {
    super();
    this.extensionViewState = extensionViewState;
    this.container = container;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this._register(extensionService.onDidChangeExtensionsStatus((extensions) => {
      if (this.extension && extensions.some((e) => areSameExtensions({ id: e.value }, this.extension.identifier))) {
        this.update();
      }
    }));
    this._register(extensionFeaturesManagementService.onDidChangeAccessData((e) => {
      if (this.extension && ExtensionIdentifier.equals(this.extension.identifier.id, e.extension)) {
        this.update();
      }
    }));
  }
  render() {
    this.container.innerText = "";
    if (!this.extension) {
      return;
    }
    if (this.extensionViewState.filters.featureId && this.extension.state === ExtensionState.Installed) {
      const accessData = this.extensionFeaturesManagementService.getAllAccessDataForExtension(new ExtensionIdentifier(this.extension.identifier.id)).get(this.extensionViewState.filters.featureId);
      const feature = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeature(this.extensionViewState.filters.featureId);
      if (feature?.icon && accessData) {
        const featureAccessTimeElement = append(this.container, $("span.activationTime"));
        featureAccessTimeElement.textContent = localize("feature access label", "{0} reqs", accessData.accessTimes.length);
        const iconElement = append(this.container, $("span" + ThemeIcon.asCSSSelector(feature.icon)));
        iconElement.style.paddingLeft = "4px";
        return;
      }
    }
    const extensionStatus = this.extensionsWorkbenchService.getExtensionRuntimeStatus(this.extension);
    if (extensionStatus?.activationTimes) {
      const activationTime = extensionStatus.activationTimes.codeLoadingTime + extensionStatus.activationTimes.activateCallTime;
      append(this.container, $("span" + ThemeIcon.asCSSSelector(activationTimeIcon)));
      const activationTimeElement = append(this.container, $("span.activationTime"));
      activationTimeElement.textContent = `${activationTime}ms`;
    }
  }
};
ExtensionRuntimeStatusWidget = __decorateClass([
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IExtensionFeaturesManagementService),
  __decorateParam(4, IExtensionsWorkbenchService)
], ExtensionRuntimeStatusWidget);
let ExtensionHoverWidget = class extends ExtensionWidget {
  constructor(options, extensionStatusAction, extensionsWorkbenchService, extensionFeaturesManagementService, hoverService, configurationService, extensionRecommendationsService, themeService, contextService) {
    super();
    this.options = options;
    this.extensionStatusAction = extensionStatusAction;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.hoverService = hoverService;
    this.configurationService = configurationService;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.themeService = themeService;
    this.contextService = contextService;
    this.hover = this._register(new MutableDisposable());
  }
  render() {
    this.hover.value = void 0;
    if (this.extension) {
      this.hover.value = this.hoverService.setupManagedHover(
        {
          delay: this.configurationService.getValue("workbench.hover.delay"),
          showHover: (options, focus) => {
            return this.hoverService.showInstantHover({
              ...options,
              additionalClasses: ["extension-hover"],
              position: {
                hoverPosition: this.options.position(),
                forcePosition: true
              },
              persistence: {
                hideOnKeyDown: true
              }
            }, focus);
          },
          placement: "element"
        },
        this.options.target,
        {
          markdown: async () => {
            try {
              await this.extensionStatusAction.recomputeStatus();
            } catch (error) {
            }
            return this.getHoverMarkdown();
          },
          markdownNotSupportedFallback: void 0
        },
        {
          appearance: {
            showHoverHint: true
          }
        }
      );
    }
  }
  getHoverMarkdown() {
    if (!this.extension) {
      return void 0;
    }
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    markdown.appendMarkdown(`**`).appendText(this.extension.displayName).appendMarkdown(`**`);
    if (semver.valid(this.extension.version)) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">**&nbsp;_v${this.extension.version}${this.extension.isPreReleaseVersion ? " (pre-release)" : ""}_**&nbsp;</span>`);
    }
    markdown.appendText(`
`);
    let addSeparator = false;
    if (this.extension.private) {
      markdown.appendMarkdown(`$(${privateExtensionIcon.id}) ${localize("privateExtension", "Private Extension")}`);
      addSeparator = true;
    }
    if (this.extension.state === ExtensionState.Installed) {
      const installLabel = InstallCountWidget.getInstallLabel(this.extension, true);
      if (installLabel) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        markdown.appendMarkdown(`$(${installCountIcon.id}) ${installLabel}`);
        addSeparator = true;
      }
      if (this.extension.rating) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        const rating = Math.round(this.extension.rating * 2) / 2;
        markdown.appendMarkdown(`$(${starFullIcon.id}) [${rating}](${this.extension.url}&ssr=false#review-details)`);
        addSeparator = true;
      }
      if (this.extension.publisherSponsorLink) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        markdown.appendMarkdown(`$(${sponsorIcon.id}) [${localize("sponsor", "Sponsor")}](${this.extension.publisherSponsorLink})`);
        addSeparator = true;
      }
    }
    if (addSeparator) {
      markdown.appendText(`
`);
    }
    const location = this.extension.resourceExtension?.location ?? (this.extension.local?.source === "resource" ? this.extension.local?.location : void 0);
    if (location) {
      if (this.extension.isWorkspaceScoped && this.contextService.isInsideWorkspace(location)) {
        markdown.appendMarkdown(localize("workspace extension", "Workspace Extension"));
      } else {
        markdown.appendMarkdown(localize("local extension", "Local Extension"));
      }
      markdown.appendText(`
`);
    }
    if (this.extension.description) {
      markdown.appendText(this.extension.description);
      markdown.appendText(`
`);
    }
    if (this.extension.publisherDomain?.verified) {
      const bgColor = this.themeService.getColorTheme().getColor(extensionVerifiedPublisherIconColor);
      const publisherVerifiedTooltip = localize("publisher verified tooltip", "This publisher has verified ownership of {0}", `[${URI.parse(this.extension.publisherDomain.link).authority}](${this.extension.publisherDomain.link})`);
      markdown.appendMarkdown(`<span style="color:${bgColor ? Color.Format.CSS.formatHex(bgColor) : "#ffffff"};">$(${verifiedPublisherIcon.id})</span>&nbsp;${publisherVerifiedTooltip}`);
      markdown.appendText(`
`);
    }
    if (this.extension.outdated) {
      markdown.appendMarkdown(localize("updateRequired", "Latest version:"));
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">**&nbsp;_v${this.extension.latestVersion}_**&nbsp;</span>`);
      markdown.appendText(`
`);
    }
    const preReleaseMessage = ExtensionHoverWidget.getPreReleaseMessage(this.extension);
    const extensionRuntimeStatus = this.extensionsWorkbenchService.getExtensionRuntimeStatus(this.extension);
    const extensionFeaturesAccessData = this.extensionFeaturesManagementService.getAllAccessDataForExtension(new ExtensionIdentifier(this.extension.identifier.id));
    const extensionStatus = this.extensionStatusAction.status;
    const runtimeState = this.extension.runtimeState;
    const recommendationMessage = this.getRecommendationMessage(this.extension);
    if (extensionRuntimeStatus || extensionFeaturesAccessData.size || extensionStatus.length || runtimeState || recommendationMessage || preReleaseMessage) {
      markdown.appendMarkdown(`---`);
      markdown.appendText(`
`);
      if (extensionRuntimeStatus) {
        if (extensionRuntimeStatus.activationTimes) {
          const activationTime = extensionRuntimeStatus.activationTimes.codeLoadingTime + extensionRuntimeStatus.activationTimes.activateCallTime;
          markdown.appendMarkdown(`${localize("activation", "Activation time")}${extensionRuntimeStatus.activationTimes.activationReason.startup ? ` (${localize("startup", "Startup")})` : ""}: \`${activationTime}ms\``);
          markdown.appendText(`
`);
        }
        if (extensionRuntimeStatus.runtimeErrors.length || extensionRuntimeStatus.messages.length) {
          const hasErrors = extensionRuntimeStatus.runtimeErrors.length || extensionRuntimeStatus.messages.some((message) => message.type === Severity.Error);
          const hasWarnings = extensionRuntimeStatus.messages.some((message) => message.type === Severity.Warning);
          const errorsLink = extensionRuntimeStatus.runtimeErrors.length ? `[${extensionRuntimeStatus.runtimeErrors.length === 1 ? localize("uncaught error", "1 uncaught error") : localize("uncaught errors", "{0} uncaught errors", extensionRuntimeStatus.runtimeErrors.length)}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features)})` : void 0;
          const messageLink = extensionRuntimeStatus.messages.length ? `[${extensionRuntimeStatus.messages.length === 1 ? localize("message", "1 message") : localize("messages", "{0} messages", extensionRuntimeStatus.messages.length)}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features)})` : void 0;
          markdown.appendMarkdown(`$(${hasErrors ? errorIcon.id : hasWarnings ? warningIcon.id : infoIcon.id}) This extension has reported `);
          if (errorsLink && messageLink) {
            markdown.appendMarkdown(`${errorsLink} and ${messageLink}`);
          } else {
            markdown.appendMarkdown(`${errorsLink || messageLink}`);
          }
          markdown.appendText(`
`);
        }
      }
      if (extensionFeaturesAccessData.size) {
        const registry = Registry.as(Extensions.ExtensionFeaturesRegistry);
        for (const [featureId, accessData] of extensionFeaturesAccessData) {
          if (accessData?.accessTimes.length) {
            const feature = registry.getExtensionFeature(featureId);
            if (feature) {
              markdown.appendMarkdown(localize("feature usage label", "{0} usage", feature.label));
              markdown.appendMarkdown(`: [${localize("total", "{0} {1} requests in last 30 days", accessData.accessTimes.length, feature.accessDataLabel ?? feature.label)}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features)})`);
              markdown.appendText(`
`);
            }
          }
        }
      }
      for (const status of extensionStatus) {
        if (status.icon) {
          markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
        }
        markdown.appendMarkdown(status.message.value);
        markdown.appendText(`
`);
      }
      if (runtimeState) {
        markdown.appendMarkdown(`$(${infoIcon.id})&nbsp;`);
        markdown.appendMarkdown(`${runtimeState.reason}`);
        markdown.appendText(`
`);
      }
      if (preReleaseMessage) {
        const extensionPreReleaseIcon = this.themeService.getColorTheme().getColor(extensionPreReleaseIconColor);
        markdown.appendMarkdown(`<span style="color:${extensionPreReleaseIcon ? Color.Format.CSS.formatHex(extensionPreReleaseIcon) : "#ffffff"};">$(${preReleaseIcon.id})</span>&nbsp;${preReleaseMessage}`);
        markdown.appendText(`
`);
      }
      if (recommendationMessage) {
        markdown.appendMarkdown(recommendationMessage);
        markdown.appendText(`
`);
      }
    }
    return markdown;
  }
  getRecommendationMessage(extension) {
    if (extension.state === ExtensionState.Installed) {
      return void 0;
    }
    if (extension.deprecationInfo) {
      return void 0;
    }
    const recommendation = this.extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()];
    if (!recommendation?.reasonText) {
      return void 0;
    }
    const bgColor = this.themeService.getColorTheme().getColor(extensionButtonProminentBackground);
    return `<span style="color:${bgColor ? Color.Format.CSS.formatHex(bgColor) : "#ffffff"};">$(${starEmptyIcon.id})</span>&nbsp;${recommendation.reasonText}`;
  }
  static getPreReleaseMessage(extension) {
    if (!extension.hasPreReleaseVersion) {
      return void 0;
    }
    if (extension.isBuiltin) {
      return void 0;
    }
    if (extension.isPreReleaseVersion) {
      return void 0;
    }
    if (extension.preRelease) {
      return void 0;
    }
    const preReleaseVersionLink = `[${localize("Show prerelease version", "Pre-Release version")}](${createCommandUri("workbench.extensions.action.showPreReleaseVersion", extension.identifier.id)})`;
    return localize("has prerelease", "This extension has a {0} available", preReleaseVersionLink);
  }
};
ExtensionHoverWidget = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IExtensionFeaturesManagementService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IExtensionRecommendationsService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IWorkspaceContextService)
], ExtensionHoverWidget);
let ExtensionStatusWidget = class extends ExtensionWidget {
  constructor(container, extensionStatusAction, markdownRendererService) {
    super();
    this.container = container;
    this.extensionStatusAction = extensionStatusAction;
    this.markdownRendererService = markdownRendererService;
    this.renderDisposables = this._register(new MutableDisposable());
    this._onDidRender = this._register(new Emitter());
    this.onDidRender = this._onDidRender.event;
    this.render();
    this._register(extensionStatusAction.onDidChangeStatus(() => this.render()));
  }
  render() {
    reset(this.container);
    this.renderDisposables.value = void 0;
    const disposables = new DisposableStore();
    this.renderDisposables.value = disposables;
    const extensionStatus = this.extensionStatusAction.status;
    if (extensionStatus.length) {
      const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
      for (let i = 0; i < extensionStatus.length; i++) {
        const status = extensionStatus[i];
        if (status.icon) {
          markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
        }
        markdown.appendMarkdown(status.message.value);
        if (i < extensionStatus.length - 1) {
          markdown.appendText(`
`);
        }
      }
      const rendered = disposables.add(this.markdownRendererService.render(markdown));
      append(this.container, rendered.element);
    }
    this._onDidRender.fire();
  }
};
ExtensionStatusWidget = __decorateClass([
  __decorateParam(2, IMarkdownRendererService)
], ExtensionStatusWidget);
let ExtensionRecommendationWidget = class extends ExtensionWidget {
  constructor(container, extensionRecommendationsService, extensionIgnoredRecommendationsService) {
    super();
    this.container = container;
    this.extensionRecommendationsService = extensionRecommendationsService;
    this.extensionIgnoredRecommendationsService = extensionIgnoredRecommendationsService;
    this._onDidRender = this._register(new Emitter());
    this.onDidRender = this._onDidRender.event;
    this.render();
    this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.render()));
  }
  render() {
    reset(this.container);
    const recommendationStatus = this.getRecommendationStatus();
    if (recommendationStatus) {
      if (recommendationStatus.icon) {
        append(this.container, $(`div${ThemeIcon.asCSSSelector(recommendationStatus.icon)}`));
      }
      append(this.container, $(`div.recommendation-text`, void 0, recommendationStatus.message));
    }
    this._onDidRender.fire();
  }
  getRecommendationStatus() {
    if (!this.extension || this.extension.deprecationInfo || this.extension.state === ExtensionState.Installed) {
      return void 0;
    }
    const extRecommendations = this.extensionRecommendationsService.getAllRecommendationsWithReason();
    if (extRecommendations[this.extension.identifier.id.toLowerCase()]) {
      const reasonText = extRecommendations[this.extension.identifier.id.toLowerCase()].reasonText;
      if (reasonText) {
        return { icon: starEmptyIcon, message: reasonText };
      }
    } else if (this.extensionIgnoredRecommendationsService.globalIgnoredRecommendations.indexOf(this.extension.identifier.id.toLowerCase()) !== -1) {
      return { icon: void 0, message: localize("recommendationHasBeenIgnored", "You have chosen not to receive recommendations for this extension.") };
    }
    return void 0;
  }
};
ExtensionRecommendationWidget = __decorateClass([
  __decorateParam(1, IExtensionRecommendationsService),
  __decorateParam(2, IExtensionIgnoredRecommendationsService)
], ExtensionRecommendationWidget);
const extensionRatingIconColor = registerColor("extensionIcon.starForeground", { light: "#DF6100", dark: "#FF8E00", hcDark: "#FF8E00", hcLight: textLinkForeground }, localize("extensionIconStarForeground", "The icon color for extension ratings."), false);
const extensionPreReleaseIconColor = registerColor("extensionIcon.preReleaseForeground", { dark: "#1d9271", light: "#1d9271", hcDark: "#1d9271", hcLight: textLinkForeground }, localize("extensionPreReleaseForeground", "The icon color for pre-release extension."), false);
const extensionSponsorIconColor = registerColor("extensionIcon.sponsorForeground", { light: "#B51E78", dark: "#D758B3", hcDark: null, hcLight: "#B51E78" }, localize("extensionIcon.sponsorForeground", "The icon color for extension sponsor."), false);
const extensionPrivateBadgeBackground = registerColor("extensionIcon.privateForeground", { dark: "#ffffff60", light: "#00000060", hcDark: "#ffffff60", hcLight: "#00000060" }, localize("extensionIcon.private", "The icon color for private extensions."));
registerThemingParticipant((theme, collector) => {
  const extensionRatingIcon = theme.getColor(extensionRatingIconColor);
  if (extensionRatingIcon) {
    collector.addRule(`.extension-ratings .codicon-extensions-star-full, .extension-ratings .codicon-extensions-star-half { color: ${extensionRatingIcon}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(starFullIcon)} { color: ${extensionRatingIcon}; }`);
  }
  const extensionVerifiedPublisherIcon = theme.getColor(extensionVerifiedPublisherIconColor);
  if (extensionVerifiedPublisherIcon) {
    collector.addRule(`${ThemeIcon.asCSSSelector(verifiedPublisherIcon)} { color: ${extensionVerifiedPublisherIcon}; }`);
  }
  collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(sponsorIcon)} { color: var(--vscode-extensionIcon-sponsorForeground); }`);
  collector.addRule(`.extension-editor > .header > .details > .subtitle .sponsor ${ThemeIcon.asCSSSelector(sponsorIcon)} { color: var(--vscode-extensionIcon-sponsorForeground); }`);
  const privateBadgeBackground = theme.getColor(extensionPrivateBadgeBackground);
  if (privateBadgeBackground) {
    collector.addRule(`.extension-private-badge { color: ${privateBadgeBackground}; }`);
  }
});
export {
  ExtensionHoverWidget,
  ExtensionIconBadge,
  ExtensionIconWidget,
  ExtensionKindIndicatorWidget,
  ExtensionPackCountWidget,
  ExtensionRecommendationWidget,
  ExtensionRestartRequiredWidget,
  ExtensionRuntimeStatusWidget,
  ExtensionStatusWidget,
  ExtensionWidget,
  InstallCountWidget,
  PreReleaseBookmarkWidget,
  PublisherWidget,
  RatingsWidget,
  RecommendationWidget,
  RemoteBadgeWidget,
  SponsorWidget,
  SyncIgnoredWidget,
  extensionPreReleaseIconColor,
  extensionPrivateBadgeBackground,
  extensionRatingIconColor,
  extensionSponsorIconColor,
  onClick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zV2lkZ2V0cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9leHRlbnNpb25zV2lkZ2V0cy5jc3MnO1xuaW1wb3J0ICogYXMgc2VtdmVyIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NlbXZlci9zZW12ZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIElFeHRlbnNpb25Db250YWluZXIsIEV4dGVuc2lvblN0YXRlLCBFeHRlbnNpb25FZGl0b3JUYWIsIElFeHRlbnNpb25zVmlld1N0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgYXBwZW5kLCAkLCByZXNldCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGZpbmFsSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UsIElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBleHRlbnNpb25CdXR0b25Qcm9taW5lbnRCYWNrZ3JvdW5kLCBFeHRlbnNpb25TdGF0dXNBY3Rpb24gfSBmcm9tICcuL2V4dGVuc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OX0JBREdFX0JBQ0tHUk9VTkQsIEVYVEVOU0lPTl9CQURHRV9GT1JFR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb3VudEJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvdW50QmFkZ2UvY291bnRCYWRnZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IGFjdGl2YXRpb25UaW1lSWNvbiwgZXJyb3JJY29uLCBpbmZvSWNvbiwgaW5zdGFsbENvdW50SWNvbiwgcHJlUmVsZWFzZUljb24sIHByaXZhdGVFeHRlbnNpb25JY29uLCByYXRpbmdJY29uLCByZW1vdGVJY29uLCByZXN0YXJ0UmVxdWlyZWRJY29uLCBzcG9uc29ySWNvbiwgc3RhckVtcHR5SWNvbiwgc3RhckZ1bGxJY29uLCBzdGFySGFsZkljb24sIHN5bmNJZ25vcmVkSWNvbiwgd2FybmluZ0ljb24gfSBmcm9tICcuL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9yLCB0ZXh0TGlua0ZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmksIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGV4dGVuc2lvbkRlZmF1bHRJY29uLCBleHRlbnNpb25WZXJpZmllZFB1Ymxpc2hlckljb25Db2xvciwgdmVyaWZpZWRQdWJsaXNoZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2Jyb3dzZXIvZmlsZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVklFV19JRCBhcyBFWFBMT1JFUl9WSUVXX0lEIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QsIElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBFeHRlbnNpb25XaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkNvbnRhaW5lciB7XG5cdHByaXZhdGUgX2V4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwgPSBudWxsO1xuXHRnZXQgZXh0ZW5zaW9uKCk6IElFeHRlbnNpb24gfCBudWxsIHsgcmV0dXJuIHRoaXMuX2V4dGVuc2lvbjsgfVxuXHRzZXQgZXh0ZW5zaW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwpIHsgdGhpcy5fZXh0ZW5zaW9uID0gZXh0ZW5zaW9uOyB0aGlzLnVwZGF0ZSgpOyB9XG5cdHVwZGF0ZSgpOiB2b2lkIHsgdGhpcy5yZW5kZXIoKTsgfVxuXHRhYnN0cmFjdCByZW5kZXIoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9uQ2xpY2soZWxlbWVudDogSFRNTEVsZW1lbnQsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZmluYWxIYW5kbGVyKGNhbGxiYWNrKSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfVVAsIGUgPT4ge1xuXHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0fVxuXHR9KSk7XG5cdHJldHVybiBkaXNwb3NhYmxlcztcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkljb25XaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaWNvbkxvYWRpbmdEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGljb25FcnJvckRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWNvbkVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEljb25FbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGljb25Vcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5leHRlbnNpb24taWNvbicpKTtcblxuXHRcdHRoaXMuaWNvbkVsZW1lbnQgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdpbWcuaWNvbicsIHsgYWx0OiAnJyB9KSk7XG5cdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGhpcy5kZWZhdWx0SWNvbkVsZW1lbnQgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGV4dGVuc2lvbkRlZmF1bHRJY29uKSkpO1xuXHRcdHRoaXMuZGVmYXVsdEljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5pY29uVXJsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuaWNvbkVsZW1lbnQuc3JjID0gJyc7XG5cdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuZGVmYXVsdEljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5pY29uRXJyb3JEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0dGhpcy5pY29uTG9hZGluZ0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmljb25VcmwpIHtcblx0XHRcdGlmICh0aGlzLmljb25VcmwgIT09IHRoaXMuZXh0ZW5zaW9uLmljb25VcmwpIHtcblx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHR0aGlzLmRlZmF1bHRJY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLmljb25VcmwgPSB0aGlzLmV4dGVuc2lvbi5pY29uVXJsO1xuXHRcdFx0XHR0aGlzLmljb25FcnJvckRpc3Bvc2FibGUudmFsdWUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pY29uRWxlbWVudCwgJ2Vycm9yJywgKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbj8uaWNvblVybEZhbGxiYWNrKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnNyYyA9IHRoaXMuZXh0ZW5zaW9uLmljb25VcmxGYWxsYmFjaztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRcdFx0dGhpcy5kZWZhdWx0SWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmhlcml0Jztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHsgb25jZTogdHJ1ZSB9KTtcblx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zcmMgPSB0aGlzLmljb25Vcmw7XG5cdFx0XHRcdGlmICghdGhpcy5pY29uRWxlbWVudC5jb21wbGV0ZSkge1xuXHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdFx0XHRcdHRoaXMuaWNvbkxvYWRpbmdEaXNwb3NhYmxlLnZhbHVlID0gYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuaWNvbkVsZW1lbnQsICdsb2FkJywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS52aXNpYmlsaXR5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdpbmhlcml0Jztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmljb25VcmwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLmljb25FbGVtZW50LnNyYyA9ICcnO1xuXHRcdFx0dGhpcy5kZWZhdWx0SWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmhlcml0Jztcblx0XHRcdHRoaXMuaWNvbkVycm9yRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0dGhpcy5pY29uTG9hZGluZ0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxDb3VudFdpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHNtYWxsOiBib29sZWFuLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc21hbGwgJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFsbExhYmVsID0gSW5zdGFsbENvdW50V2lkZ2V0LmdldEluc3RhbGxMYWJlbCh0aGlzLmV4dGVuc2lvbiwgdGhpcy5zbWFsbCk7XG5cdFx0aWYgKCFpbnN0YWxsTGFiZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLnNtYWxsID8gdGhpcy5jb250YWluZXIgOiBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4uaW5zdGFsbCcsIHsgdGFiSW5kZXg6IDAgfSkpO1xuXHRcdGFwcGVuZChwYXJlbnQsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaW5zdGFsbENvdW50SWNvbikpKTtcblx0XHRjb25zdCBjb3VudCA9IGFwcGVuZChwYXJlbnQsICQoJ3NwYW4uY291bnQnKSk7XG5cdFx0Y291bnQudGV4dENvbnRlbnQgPSBpbnN0YWxsTGFiZWw7XG5cblx0XHRpZiAoIXRoaXMuc21hbGwpIHtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmNvbnRhaW5lciwgbG9jYWxpemUoJ2luc3RhbGwgY291bnQnLCBcIkluc3RhbGwgY291bnRcIikpKTtcblx0XHR9XG5cdH1cblxuXHRzdGF0aWMgZ2V0SW5zdGFsbExhYmVsKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgc21hbGw6IGJvb2xlYW4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluc3RhbGxDb3VudCA9IGV4dGVuc2lvbi5pbnN0YWxsQ291bnQ7XG5cblx0XHRpZiAoIWluc3RhbGxDb3VudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgaW5zdGFsbExhYmVsOiBzdHJpbmc7XG5cblx0XHRpZiAoc21hbGwpIHtcblx0XHRcdGlmIChpbnN0YWxsQ291bnQgPiAxMDAwMDAwKSB7XG5cdFx0XHRcdGluc3RhbGxMYWJlbCA9IGAke01hdGguZmxvb3IoaW5zdGFsbENvdW50IC8gMTAwMDAwKSAvIDEwfU1gO1xuXHRcdFx0fSBlbHNlIGlmIChpbnN0YWxsQ291bnQgPiAxMDAwKSB7XG5cdFx0XHRcdGluc3RhbGxMYWJlbCA9IGAke01hdGguZmxvb3IoaW5zdGFsbENvdW50IC8gMTAwMCl9S2A7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbnN0YWxsTGFiZWwgPSBTdHJpbmcoaW5zdGFsbENvdW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRpbnN0YWxsTGFiZWwgPSBpbnN0YWxsQ291bnQudG9Mb2NhbGVTdHJpbmcocGxhdGZvcm0ubGFuZ3VhZ2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbnN0YWxsTGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJhdGluZ3NXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgY29udGFpbmVySG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSBzbWFsbDogYm9vbGVhbixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZXh0ZW5zaW9uLXJhdGluZ3MnKTtcblxuXHRcdGlmICh0aGlzLnNtYWxsKSB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc21hbGwnKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zbWFsbCAmJiB0aGlzLmV4dGVuc2lvbi5zdGF0ZSAhPT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24ucmF0aW5nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zbWFsbCAmJiAhdGhpcy5leHRlbnNpb24ucmF0aW5nQ291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uLnVybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhdGluZyA9IE1hdGgucm91bmQodGhpcy5leHRlbnNpb24ucmF0aW5nICogMikgLyAyO1xuXHRcdGlmICh0aGlzLnNtYWxsKSB7XG5cdFx0XHRhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc3RhckZ1bGxJY29uKSkpO1xuXG5cdFx0XHRjb25zdCBjb3VudCA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3Bhbi5jb3VudCcpKTtcblx0XHRcdGNvdW50LnRleHRDb250ZW50ID0gU3RyaW5nKHJhdGluZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4ucmF0aW5nLmNsaWNrYWJsZScsIHsgdGFiSW5kZXg6IDAgfSkpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPD0gNTsgaSsrKSB7XG5cdFx0XHRcdGlmIChyYXRpbmcgPj0gaSkge1xuXHRcdFx0XHRcdGFwcGVuZChlbGVtZW50LCAkKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHN0YXJGdWxsSWNvbikpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChyYXRpbmcgPj0gaSAtIDAuNSkge1xuXHRcdFx0XHRcdGFwcGVuZChlbGVtZW50LCAkKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHN0YXJIYWxmSWNvbikpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhcHBlbmQoZWxlbWVudCwgJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihzdGFyRW1wdHlJY29uKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24ucmF0aW5nQ291bnQpIHtcblx0XHRcdFx0Y29uc3QgcmF0aW5nQ291bnRFbGVtZXQgPSBhcHBlbmQoZWxlbWVudCwgJCgnc3BhbicsIHVuZGVmaW5lZCwgYCAoJHt0aGlzLmV4dGVuc2lvbi5yYXRpbmdDb3VudH0pYCkpO1xuXHRcdFx0XHRyYXRpbmdDb3VudEVsZW1ldC5zdHlsZS5wYWRkaW5nTGVmdCA9ICcxcHgnO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNvbnRhaW5lckhvdmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGVsZW1lbnQsICcnKSk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lckhvdmVyLnVwZGF0ZShsb2NhbGl6ZSgncmF0ZWRMYWJlbCcsIFwiQXZlcmFnZSByYXRpbmc6IHswfSBvdXQgb2YgNVwiLCByYXRpbmcpKTtcblx0XHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpbmsnKTtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5yYXRpbmdVcmwpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayhlbGVtZW50LCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodGhpcy5leHRlbnNpb24hLnJhdGluZ1VybCEpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBQdWJsaXNoZXJXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgZWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGFpbmVySG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHNtYWxsOiBib29sZWFuLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnJlc291cmNlRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmxvY2FsPy5zb3VyY2UgPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5wdWJsaXNoZXInKSk7XG5cdFx0Y29uc3QgcHVibGlzaGVyRGlzcGxheU5hbWUgPSAkKCcucHVibGlzaGVyLW5hbWUuZWxsaXBzaXMnKTtcblx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZS50ZXh0Q29udGVudCA9IHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lO1xuXG5cdFx0Y29uc3QgdmVyaWZpZWRQdWJsaXNoZXIgPSAkKCcudmVyaWZpZWQtcHVibGlzaGVyJyk7XG5cdFx0YXBwZW5kKHZlcmlmaWVkUHVibGlzaGVyLCAkKCdzcGFuLmV4dGVuc2lvbi12ZXJpZmllZC1wdWJsaXNoZXIuY2xpY2thYmxlJyksIHJlbmRlckljb24odmVyaWZpZWRQdWJsaXNoZXJJY29uKSk7XG5cblx0XHRpZiAodGhpcy5zbWFsbCkge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpIHtcblx0XHRcdFx0YXBwZW5kKHRoaXMuZWxlbWVudCwgdmVyaWZpZWRQdWJsaXNoZXIpO1xuXHRcdFx0fVxuXHRcdFx0YXBwZW5kKHRoaXMuZWxlbWVudCwgcHVibGlzaGVyRGlzcGxheU5hbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2xpY2thYmxlJywgISF0aGlzLmV4dGVuc2lvbi51cmwpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdHRoaXMuZWxlbWVudC50YWJJbmRleCA9IDA7XG5cblx0XHRcdHRoaXMuY29udGFpbmVySG92ZXIgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5lbGVtZW50LCBsb2NhbGl6ZSgncHVibGlzaGVyJywgXCJQdWJsaXNoZXIgKHswfSlcIiwgdGhpcy5leHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUpKSk7XG5cdFx0XHRhcHBlbmQodGhpcy5lbGVtZW50LCBwdWJsaXNoZXJEaXNwbGF5TmFtZSk7XG5cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEb21haW4/LnZlcmlmaWVkKSB7XG5cdFx0XHRcdGFwcGVuZCh0aGlzLmVsZW1lbnQsIHZlcmlmaWVkUHVibGlzaGVyKTtcblx0XHRcdFx0Y29uc3QgcHVibGlzaGVyRG9tYWluTGluayA9IFVSSS5wYXJzZSh0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEb21haW4ubGluayk7XG5cdFx0XHRcdHZlcmlmaWVkUHVibGlzaGVyLnRhYkluZGV4ID0gMDtcblx0XHRcdFx0dmVyaWZpZWRQdWJsaXNoZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lckhvdmVyLnVwZGF0ZShsb2NhbGl6ZSgndmVyaWZpZWQgcHVibGlzaGVyJywgXCJUaGlzIHB1Ymxpc2hlciBoYXMgdmVyaWZpZWQgb3duZXJzaGlwIG9mIHswfVwiLCB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEb21haW4ubGluaykpO1xuXHRcdFx0XHR2ZXJpZmllZFB1Ymxpc2hlci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGluaycpO1xuXG5cdFx0XHRcdGFwcGVuZCh2ZXJpZmllZFB1Ymxpc2hlciwgJCgnc3Bhbi5leHRlbnNpb24tdmVyaWZpZWQtcHVibGlzaGVyLWRvbWFpbicsIHVuZGVmaW5lZCwgcHVibGlzaGVyRG9tYWluTGluay5hdXRob3JpdHkuc3RhcnRzV2l0aCgnd3d3LicpID8gcHVibGlzaGVyRG9tYWluTGluay5hdXRob3JpdHkuc3Vic3RyaW5nKDQpIDogcHVibGlzaGVyRG9tYWluTGluay5hdXRob3JpdHkpKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayh2ZXJpZmllZFB1Ymxpc2hlciwgKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4ocHVibGlzaGVyRG9tYWluTGluaykpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnVybCkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKHRoaXMuZWxlbWVudCwgKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBwdWJsaXNoZXI6XCIke3RoaXMuZXh0ZW5zaW9uPy5wdWJsaXNoZXJEaXNwbGF5TmFtZX1cImApKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgU3BvbnNvcldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHJlc2V0KHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbj8ucHVibGlzaGVyU3BvbnNvckxpbmspIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzcG9uc29yID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdzcGFuLnNwb25zb3IuY2xpY2thYmxlJywgeyB0YWJJbmRleDogMCB9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHNwb25zb3IsIHRoaXMuZXh0ZW5zaW9uPy5wdWJsaXNoZXJTcG9uc29yTGluay50b1N0cmluZygpID8/ICcnKSk7XG5cdFx0c3BvbnNvci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGluaycpOyAvLyAjMTMyNjQ1XG5cdFx0Y29uc3Qgc3BvbnNvckljb25FbGVtZW50ID0gcmVuZGVySWNvbihzcG9uc29ySWNvbik7XG5cdFx0Y29uc3QgbGFiZWwgPSAkKCdzcGFuJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnc3BvbnNvcicsIFwiU3BvbnNvclwiKSk7XG5cdFx0YXBwZW5kKHNwb25zb3IsIHNwb25zb3JJY29uRWxlbWVudCwgbGFiZWwpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2soc3BvbnNvciwgKCkgPT4ge1xuXHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odGhpcy5leHRlbnNpb24hLnB1Ymxpc2hlclNwb25zb3JMaW5rISk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZWNvbW1lbmRhdGlvbldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSBlbGVtZW50PzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5vbkRpZENoYW5nZVJlY29tbWVuZGF0aW9ucygoKSA9PiB0aGlzLnJlbmRlcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbiB8fCB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkIHx8IHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBleHRSZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpO1xuXHRcdGlmIChleHRSZWNvbW1lbmRhdGlvbnNbdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXSkge1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKHRoaXMucGFyZW50LCAkKCdkaXYuZXh0ZW5zaW9uLWJvb2ttYXJrJykpO1xuXHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb24gPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCcucmVjb21tZW5kYXRpb24nKSk7XG5cdFx0XHRhcHBlbmQocmVjb21tZW5kYXRpb24sICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IocmF0aW5nSWNvbikpKTtcblx0XHR9XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgUHJlUmVsZWFzZUJvb2ttYXJrV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIGVsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMuZWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbj8uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZCA/IHRoaXMuZXh0ZW5zaW9uLnByZVJlbGVhc2UgOiB0aGlzLmV4dGVuc2lvbj8uaGFzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHRoaXMuZWxlbWVudCA9IGFwcGVuZCh0aGlzLnBhcmVudCwgJCgnZGl2LmV4dGVuc2lvbi1ib29rbWFyaycpKTtcblx0XHRcdGNvbnN0IHByZVJlbGVhc2UgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCcucHJlLXJlbGVhc2UnKSk7XG5cdFx0XHRhcHBlbmQocHJlUmVsZWFzZSwgJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihwcmVSZWxlYXNlSWNvbikpKTtcblx0XHR9XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgUmVtb3RlQmFkZ2VXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlQmFkZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RXh0ZW5zaW9uSWNvbkJhZGdlPigpKTtcblxuXHRwcml2YXRlIGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0b29sdGlwOiBib29sZWFuLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKHBhcmVudCwgJCgnJykpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLnJlbW90ZUJhZGdlLnZhbHVlPy5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdHRoaXMucmVtb3RlQmFkZ2UuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbiB8fCAhdGhpcy5leHRlbnNpb24ubG9jYWwgfHwgIXRoaXMuZXh0ZW5zaW9uLnNlcnZlciB8fCAhKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikgfHwgdGhpcy5leHRlbnNpb24uc2VydmVyICE9PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IHRvb2x0aXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy50b29sdGlwICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0dG9vbHRpcCA9IGxvY2FsaXplKCdyZW1vdGUgZXh0ZW5zaW9uIHRpdGxlJywgXCJFeHRlbnNpb24gaW4gezB9XCIsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5sYWJlbCk7XG5cdFx0fVxuXHRcdHRoaXMucmVtb3RlQmFkZ2UudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbkljb25CYWRnZSwgcmVtb3RlSWNvbiwgdG9vbHRpcCk7XG5cdFx0YXBwZW5kKHRoaXMuZWxlbWVudCwgdGhpcy5yZW1vdGVCYWRnZS52YWx1ZS5lbGVtZW50KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uSWNvbkJhZGdlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGVsZW1lbnRIb3ZlcjogSU1hbmFnZWRIb3ZlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGljb246IFRoZW1lSWNvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnZGl2LmV4dGVuc2lvbi1iYWRnZS5leHRlbnNpb24taWNvbi1iYWRnZScpO1xuXHRcdHRoaXMuZWxlbWVudEhvdmVyID0gdGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsZW1lbnQsICcnKSk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKCk6IHZvaWQge1xuXHRcdGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ3NwYW4nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IodGhpcy5pY29uKSkpO1xuXG5cdFx0Y29uc3QgYXBwbHlCYWRnZVN0eWxlID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmdDb2xvciA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihFWFRFTlNJT05fQkFER0VfQkFDS0dST1VORCk7XG5cdFx0XHRjb25zdCBmZ0NvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKEVYVEVOU0lPTl9CQURHRV9GT1JFR1JPVU5EKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiZ0NvbG9yID8gYmdDb2xvci50b1N0cmluZygpIDogJyc7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY29sb3IgPSBmZ0NvbG9yID8gZmdDb2xvci50b1N0cmluZygpIDogJyc7XG5cdFx0fTtcblx0XHRhcHBseUJhZGdlU3R5bGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gYXBwbHlCYWRnZVN0eWxlKCkpKTtcblxuXHRcdGlmICh0aGlzLnRvb2x0aXApIHtcblx0XHRcdGNvbnN0IHVwZGF0ZVRpdGxlID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50SG92ZXIudXBkYXRlKHRoaXMudG9vbHRpcCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhYmVsU2VydmljZS5vbkRpZENoYW5nZUZvcm1hdHRlcnMoKCkgPT4gdXBkYXRlVGl0bGUoKSkpO1xuXHRcdFx0dXBkYXRlVGl0bGUoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblBhY2tDb3VudFdpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSBlbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb3VudEJhZGdlOiBDb3VudEJhZGdlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFyZW50OiBIVE1MRWxlbWVudCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmNsZWFyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50Py5yZW1vdmUoKTtcblx0XHR0aGlzLmNvdW50QmFkZ2U/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNvdW50QmFkZ2UgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24gfHwgISh0aGlzLmV4dGVuc2lvbi5jYXRlZ29yaWVzPy5zb21lKGNhdGVnb3J5ID0+IGNhdGVnb3J5LnRvTG93ZXJDYXNlKCkgPT09ICdleHRlbnNpb24gcGFja3MnKSkgfHwgIXRoaXMuZXh0ZW5zaW9uLmV4dGVuc2lvblBhY2subGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZWxlbWVudCA9IGFwcGVuZCh0aGlzLnBhcmVudCwgJCgnLmV4dGVuc2lvbi1iYWRnZS5leHRlbnNpb24tcGFjay1iYWRnZScpKTtcblx0XHR0aGlzLmNvdW50QmFkZ2UgPSBuZXcgQ291bnRCYWRnZSh0aGlzLmVsZW1lbnQsIHt9LCBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcyk7XG5cdFx0dGhpcy5jb3VudEJhZGdlLnNldENvdW50KHRoaXMuZXh0ZW5zaW9uLmV4dGVuc2lvblBhY2subGVuZ3RoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uS2luZEluZGljYXRvcldpZGdldCBleHRlbmRzIEV4dGVuc2lvbldpZGdldCB7XG5cblx0cHJpdmF0ZSBlbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBleHRlbnNpb25HYWxsZXJ5TWFuaWZlc3Q6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3QgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgc21hbGw6IGJvb2xlYW4sXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHBsb3JlclNlcnZpY2U6IElFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHRcdGV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCkudGhlbihtYW5pZmVzdCA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCA9IG1hbmlmZXN0O1xuXHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50Py5yZW1vdmUoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbj8ucHJpdmF0ZSkge1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuZXh0ZW5zaW9uLWtpbmQtaW5kaWNhdG9yJykpO1xuXHRcdFx0aWYgKCF0aGlzLnNtYWxsIHx8ICh0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdD8uY2FwYWJpbGl0aWVzLmV4dGVuc2lvbnM/LmluY2x1ZGVQdWJsaWNFeHRlbnNpb25zICYmIHRoaXMuZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0Py5jYXBhYmlsaXRpZXMuZXh0ZW5zaW9ucz8uaW5jbHVkZVByaXZhdGVFeHRlbnNpb25zKSkge1xuXHRcdFx0XHRhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHByaXZhdGVFeHRlbnNpb25JY29uKSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLnNtYWxsKSB7XG5cdFx0XHRcdGFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJ3NwYW4ucHJpdmF0ZS1leHRlbnNpb24tbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdwcml2YXRlRXh0ZW5zaW9uJywgXCJQcml2YXRlIEV4dGVuc2lvblwiKSkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zbWFsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5leHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24/LmxvY2F0aW9uID8/ICh0aGlzLmV4dGVuc2lvbi5sb2NhbD8uc291cmNlID09PSAncmVzb3VyY2UnID8gdGhpcy5leHRlbnNpb24ubG9jYWw/LmxvY2F0aW9uIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoIWxvY2F0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuZXh0ZW5zaW9uLWtpbmQtaW5kaWNhdG9yJykpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGxvY2F0aW9uKTtcblx0XHRpZiAod29ya3NwYWNlRm9sZGVyICYmIHRoaXMuZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnd29ya3NwYWNlIGV4dGVuc2lvbicsIFwiV29ya3NwYWNlIEV4dGVuc2lvblwiKTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjbGlja2FibGUnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5lbGVtZW50LCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkucmVsYXRpdmVQYXRoKHdvcmtzcGFjZUZvbGRlci51cmksIGxvY2F0aW9uKSkpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayh0aGlzLmVsZW1lbnQsICgpID0+IHtcblx0XHRcdFx0dGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXcoRVhQTE9SRVJfVklFV19JRCwgdHJ1ZSkudGhlbigoKSA9PiB0aGlzLmV4cGxvcmVyU2VydmljZS5zZWxlY3QobG9jYXRpb24sIHRydWUpKTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuZWxlbWVudCwgbG9jYXRpb24ucGF0aCkpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xvY2FsIGV4dGVuc2lvbicsIFwiTG9jYWwgRXh0ZW5zaW9uXCIpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3luY0lnbm9yZWRXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignc2V0dGluZ3NTeW5jLmlnbm9yZWRFeHRlbnNpb25zJykpKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQgJiYgdGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSAmJiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmlzRXh0ZW5zaW9uSWdub3JlZFRvU3luYyh0aGlzLmV4dGVuc2lvbikpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4uZXh0ZW5zaW9uLXN5bmMtaWdub3JlZCcgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihzeW5jSWdub3JlZEljb24pKSk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZWxlbWVudCwgbG9jYWxpemUoJ3N5bmNpbmdvcmUubGFiZWwnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGlnbm9yZWQgZHVyaW5nIHN5bmMuXCIpKSk7XG5cdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoc3luY0lnbm9yZWRJY29uKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25SZXN0YXJ0UmVxdWlyZWRXaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5jb250YWluZXIuaW5uZXJUZXh0ID0gJyc7XG5cblx0XHRjb25zdCBydW50aW1lU3RhdGUgPSB0aGlzLmV4dGVuc2lvbj8ucnVudGltZVN0YXRlO1xuXHRcdGNvbnN0IHJlYXNvbiA9IHR5cGVvZiBydW50aW1lU3RhdGU/LnJlYXNvbiA9PT0gJ3N0cmluZycgPyBydW50aW1lU3RhdGUucmVhc29uIDogJyc7XG5cblx0XHQvLyBPbmx5IHNob3cgXCJSZXN0YXJ0IFJlcXVpcmVkXCIgd2hlbiB0aGUgcnVudGltZSBzdGF0ZSByZWFzb24gY2xlYXJseSBpbmRpY2F0ZXNcblx0XHQvLyBhIHJlc3RhcnQgb3IgcmVsb2FkIGlzIG5lZWRlZCwgdG8gYXZvaWQgbWlzbGFiZWxpbmcgb3RoZXIgcnVudGltZSBhY3Rpb25zLlxuXHRcdGlmIChydW50aW1lU3RhdGUgJiYgL3Jlc3RhcnR8cmVsb2FkL2kudGVzdChyZWFzb24pKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdzcGFuLmV4dGVuc2lvbi1yZXN0YXJ0LXJlcXVpcmVkJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHJlc3RhcnRSZXF1aXJlZEljb24pKSk7XG5cdFx0XHRhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3NwYW4uZXh0ZW5zaW9uLXJlc3RhcnQtcmVxdWlyZWQtbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdyZXN0YXJ0IHJlcXVpcmVkJywgXCJSZXN0YXJ0IFJlcXVpcmVkXCIpKSk7XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgZWxlbWVudCwgcmVhc29uKSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25SdW50aW1lU3RhdHVzV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblZpZXdTdGF0ZTogSUV4dGVuc2lvbnNWaWV3U3RhdGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cyhleHRlbnNpb25zID0+IHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbiAmJiBleHRlbnNpb25zLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlLnZhbHVlIH0sIHRoaXMuZXh0ZW5zaW9uIS5pZGVudGlmaWVyKSkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZUFjY2Vzc0RhdGEoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24gJiYgRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgZS5leHRlbnNpb24pKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvblZpZXdTdGF0ZS5maWx0ZXJzLmZlYXR1cmVJZCAmJiB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkKSB7XG5cdFx0XHRjb25zdCBhY2Nlc3NEYXRhID0gdGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLmdldEFsbEFjY2Vzc0RhdGFGb3JFeHRlbnNpb24obmV3IEV4dGVuc2lvbklkZW50aWZpZXIodGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCkpLmdldCh0aGlzLmV4dGVuc2lvblZpZXdTdGF0ZS5maWx0ZXJzLmZlYXR1cmVJZCk7XG5cdFx0XHRjb25zdCBmZWF0dXJlID0gUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkuZ2V0RXh0ZW5zaW9uRmVhdHVyZSh0aGlzLmV4dGVuc2lvblZpZXdTdGF0ZS5maWx0ZXJzLmZlYXR1cmVJZCk7XG5cdFx0XHRpZiAoZmVhdHVyZT8uaWNvbiAmJiBhY2Nlc3NEYXRhKSB7XG5cdFx0XHRcdGNvbnN0IGZlYXR1cmVBY2Nlc3NUaW1lRWxlbWVudCA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3Bhbi5hY3RpdmF0aW9uVGltZScpKTtcblx0XHRcdFx0ZmVhdHVyZUFjY2Vzc1RpbWVFbGVtZW50LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2ZlYXR1cmUgYWNjZXNzIGxhYmVsJywgXCJ7MH0gcmVxc1wiLCBhY2Nlc3NEYXRhLmFjY2Vzc1RpbWVzLmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IGljb25FbGVtZW50ID0gYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGZlYXR1cmUuaWNvbikpKTtcblx0XHRcdFx0aWNvbkVsZW1lbnQuc3R5bGUucGFkZGluZ0xlZnQgPSAnNHB4Jztcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9uUnVudGltZVN0YXR1cyh0aGlzLmV4dGVuc2lvbik7XG5cdFx0aWYgKGV4dGVuc2lvblN0YXR1cz8uYWN0aXZhdGlvblRpbWVzKSB7XG5cdFx0XHRjb25zdCBhY3RpdmF0aW9uVGltZSA9IGV4dGVuc2lvblN0YXR1cy5hY3RpdmF0aW9uVGltZXMuY29kZUxvYWRpbmdUaW1lICsgZXh0ZW5zaW9uU3RhdHVzLmFjdGl2YXRpb25UaW1lcy5hY3RpdmF0ZUNhbGxUaW1lO1xuXHRcdFx0YXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKGFjdGl2YXRpb25UaW1lSWNvbikpKTtcblx0XHRcdGNvbnN0IGFjdGl2YXRpb25UaW1lRWxlbWVudCA9IGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnc3Bhbi5hY3RpdmF0aW9uVGltZScpKTtcblx0XHRcdGFjdGl2YXRpb25UaW1lRWxlbWVudC50ZXh0Q29udGVudCA9IGAke2FjdGl2YXRpb25UaW1lfW1zYDtcblx0XHR9XG5cdH1cblxufVxuXG5leHBvcnQgdHlwZSBFeHRlbnNpb25Ib3Zlck9wdGlvbnMgPSB7XG5cdHBvc2l0aW9uOiAoKSA9PiBIb3ZlclBvc2l0aW9uO1xuXHRyZWFkb25seSB0YXJnZXQ6IEhUTUxFbGVtZW50O1xufTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkhvdmVyV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IEV4dGVuc2lvbkhvdmVyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblN0YXR1c0FjdGlvbjogRXh0ZW5zaW9uU3RhdHVzQWN0aW9uLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuaG92ZXIudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmhvdmVyLnZhbHVlID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoe1xuXHRcdFx0XHRkZWxheTogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCd3b3JrYmVuY2guaG92ZXIuZGVsYXknKSxcblx0XHRcdFx0c2hvd0hvdmVyOiAob3B0aW9ucywgZm9jdXMpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbENsYXNzZXM6IFsnZXh0ZW5zaW9uLWhvdmVyJ10sXG5cdFx0XHRcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRob3ZlclBvc2l0aW9uOiB0aGlzLm9wdGlvbnMucG9zaXRpb24oKSxcblx0XHRcdFx0XHRcdFx0Zm9yY2VQb3NpdGlvbjogdHJ1ZSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwZXJzaXN0ZW5jZToge1xuXHRcdFx0XHRcdFx0XHRoaWRlT25LZXlEb3duOiB0cnVlLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIGZvY3VzKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cGxhY2VtZW50OiAnZWxlbWVudCdcblx0XHRcdH0sXG5cdFx0XHRcdHRoaXMub3B0aW9ucy50YXJnZXQsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtYXJrZG93bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gUmVjb21wdXRlIHRoZSBzdGF0dXMgc28gYW55IHRpbWUtc2Vuc2l0aXZlIGNvbnRlbnQgKGUuZy4gdGhlXG5cdFx0XHRcdFx0XHQvLyBkZWxheWVkIGF1dG8tdXBkYXRlIG1lc3NhZ2UpIHJlZmxlY3RzIHRoZSBjdXJyZW50IHRpbWUgb24gZWFjaCBob3Zlci5cblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU3RhdHVzQWN0aW9uLnJlY29tcHV0ZVN0YXR1cygpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0Ly8gSWdub3JlOiBmYWxsIGJhY2sgdG8gdGhlIGxhc3QgY29tcHV0ZWQgc3RhdHVzLlxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0SG92ZXJNYXJrZG93bigpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogdW5kZWZpbmVkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0XHRzaG93SG92ZXJIaW50OiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SG92ZXJNYXJrZG93bigpOiBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblxuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAqKmApLmFwcGVuZFRleHQodGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpLmFwcGVuZE1hcmtkb3duKGAqKmApO1xuXHRcdGlmIChzZW12ZXIudmFsaWQodGhpcy5leHRlbnNpb24udmVyc2lvbikpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPioqJm5ic3A7X3Yke3RoaXMuZXh0ZW5zaW9uLnZlcnNpb259JHsodGhpcy5leHRlbnNpb24uaXNQcmVSZWxlYXNlVmVyc2lvbiA/ICcgKHByZS1yZWxlYXNlKScgOiAnJyl9XyoqJm5ic3A7PC9zcGFuPmApO1xuXHRcdH1cblx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblxuXHRcdGxldCBhZGRTZXBhcmF0b3IgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5leHRlbnNpb24ucHJpdmF0ZSkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtwcml2YXRlRXh0ZW5zaW9uSWNvbi5pZH0pICR7bG9jYWxpemUoJ3ByaXZhdGVFeHRlbnNpb24nLCBcIlByaXZhdGUgRXh0ZW5zaW9uXCIpfWApO1xuXHRcdFx0YWRkU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IGluc3RhbGxMYWJlbCA9IEluc3RhbGxDb3VudFdpZGdldC5nZXRJbnN0YWxsTGFiZWwodGhpcy5leHRlbnNpb24sIHRydWUpO1xuXHRcdFx0aWYgKGluc3RhbGxMYWJlbCkge1xuXHRcdFx0XHRpZiAoYWRkU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgICB8ICBgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke2luc3RhbGxDb3VudEljb24uaWR9KSAke2luc3RhbGxMYWJlbH1gKTtcblx0XHRcdFx0YWRkU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5yYXRpbmcpIHtcblx0XHRcdFx0aWYgKGFkZFNlcGFyYXRvcikge1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYCAgfCAgYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmF0aW5nID0gTWF0aC5yb3VuZCh0aGlzLmV4dGVuc2lvbi5yYXRpbmcgKiAyKSAvIDI7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAkKCR7c3RhckZ1bGxJY29uLmlkfSkgWyR7cmF0aW5nfV0oJHt0aGlzLmV4dGVuc2lvbi51cmx9JnNzcj1mYWxzZSNyZXZpZXctZGV0YWlscylgKTtcblx0XHRcdFx0YWRkU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJTcG9uc29yTGluaykge1xuXHRcdFx0XHRpZiAoYWRkU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgICB8ICBgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke3Nwb25zb3JJY29uLmlkfSkgWyR7bG9jYWxpemUoJ3Nwb25zb3InLCBcIlNwb25zb3JcIil9XSgke3RoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlclNwb25zb3JMaW5rfSlgKTtcblx0XHRcdFx0YWRkU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGFkZFNlcGFyYXRvcikge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbj8ubG9jYXRpb24gPz8gKHRoaXMuZXh0ZW5zaW9uLmxvY2FsPy5zb3VyY2UgPT09ICdyZXNvdXJjZScgPyB0aGlzLmV4dGVuc2lvbi5sb2NhbD8ubG9jYXRpb24gOiB1bmRlZmluZWQpO1xuXHRcdGlmIChsb2NhdGlvbikge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkICYmIHRoaXMuY29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UobG9jYXRpb24pKSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCd3b3Jrc3BhY2UgZXh0ZW5zaW9uJywgXCJXb3Jrc3BhY2UgRXh0ZW5zaW9uXCIpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdsb2NhbCBleHRlbnNpb24nLCBcIkxvY2FsIEV4dGVuc2lvblwiKSk7XG5cdFx0XHR9XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZGVzY3JpcHRpb24pIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQodGhpcy5leHRlbnNpb24uZGVzY3JpcHRpb24pO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpIHtcblx0XHRcdGNvbnN0IGJnQ29sb3IgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoZXh0ZW5zaW9uVmVyaWZpZWRQdWJsaXNoZXJJY29uQ29sb3IpO1xuXHRcdFx0Y29uc3QgcHVibGlzaGVyVmVyaWZpZWRUb29sdGlwID0gbG9jYWxpemUoJ3B1Ymxpc2hlciB2ZXJpZmllZCB0b29sdGlwJywgXCJUaGlzIHB1Ymxpc2hlciBoYXMgdmVyaWZpZWQgb3duZXJzaGlwIG9mIHswfVwiLCBgWyR7VVJJLnBhcnNlKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbi5saW5rKS5hdXRob3JpdHl9XSgke3RoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlckRvbWFpbi5saW5rfSlgKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGA8c3BhbiBzdHlsZT1cImNvbG9yOiR7YmdDb2xvciA/IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4KGJnQ29sb3IpIDogJyNmZmZmZmYnfTtcIj4kKCR7dmVyaWZpZWRQdWJsaXNoZXJJY29uLmlkfSk8L3NwYW4+Jm5ic3A7JHtwdWJsaXNoZXJWZXJpZmllZFRvb2x0aXB9YCk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24ub3V0ZGF0ZWQpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCd1cGRhdGVSZXF1aXJlZCcsIFwiTGF0ZXN0IHZlcnNpb246XCIpKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPioqJm5ic3A7X3Yke3RoaXMuZXh0ZW5zaW9uLmxhdGVzdFZlcnNpb259XyoqJm5ic3A7PC9zcGFuPmApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJlUmVsZWFzZU1lc3NhZ2UgPSBFeHRlbnNpb25Ib3ZlcldpZGdldC5nZXRQcmVSZWxlYXNlTWVzc2FnZSh0aGlzLmV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uUnVudGltZVN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9uUnVudGltZVN0YXR1cyh0aGlzLmV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRmVhdHVyZXNBY2Nlc3NEYXRhID0gdGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLmdldEFsbEFjY2Vzc0RhdGFGb3JFeHRlbnNpb24obmV3IEV4dGVuc2lvbklkZW50aWZpZXIodGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uU3RhdHVzQWN0aW9uLnN0YXR1cztcblx0XHRjb25zdCBydW50aW1lU3RhdGUgPSB0aGlzLmV4dGVuc2lvbi5ydW50aW1lU3RhdGU7XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb25NZXNzYWdlID0gdGhpcy5nZXRSZWNvbW1lbmRhdGlvbk1lc3NhZ2UodGhpcy5leHRlbnNpb24pO1xuXG5cdFx0aWYgKGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMgfHwgZXh0ZW5zaW9uRmVhdHVyZXNBY2Nlc3NEYXRhLnNpemUgfHwgZXh0ZW5zaW9uU3RhdHVzLmxlbmd0aCB8fCBydW50aW1lU3RhdGUgfHwgcmVjb21tZW5kYXRpb25NZXNzYWdlIHx8IHByZVJlbGVhc2VNZXNzYWdlKSB7XG5cblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAtLS1gKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXG5cdFx0XHRpZiAoZXh0ZW5zaW9uUnVudGltZVN0YXR1cykge1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5hY3RpdmF0aW9uVGltZXMpIHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmF0aW9uVGltZSA9IGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMuYWN0aXZhdGlvblRpbWVzLmNvZGVMb2FkaW5nVGltZSArIGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMuYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRlQ2FsbFRpbWU7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7bG9jYWxpemUoJ2FjdGl2YXRpb24nLCBcIkFjdGl2YXRpb24gdGltZVwiKX0ke2V4dGVuc2lvblJ1bnRpbWVTdGF0dXMuYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRpb25SZWFzb24uc3RhcnR1cCA/IGAgKCR7bG9jYWxpemUoJ3N0YXJ0dXAnLCBcIlN0YXJ0dXBcIil9KWAgOiAnJ306IFxcYCR7YWN0aXZhdGlvblRpbWV9bXNcXGBgKTtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCB8fCBleHRlbnNpb25SdW50aW1lU3RhdHVzLm1lc3NhZ2VzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IGhhc0Vycm9ycyA9IGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMucnVudGltZUVycm9ycy5sZW5ndGggfHwgZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5tZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS50eXBlID09PSBTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRcdFx0Y29uc3QgaGFzV2FybmluZ3MgPSBleHRlbnNpb25SdW50aW1lU3RhdHVzLm1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLnR5cGUgPT09IFNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0XHRcdGNvbnN0IGVycm9yc0xpbmsgPSBleHRlbnNpb25SdW50aW1lU3RhdHVzLnJ1bnRpbWVFcnJvcnMubGVuZ3RoID8gYFske2V4dGVuc2lvblJ1bnRpbWVTdGF0dXMucnVudGltZUVycm9ycy5sZW5ndGggPT09IDEgPyBsb2NhbGl6ZSgndW5jYXVnaHQgZXJyb3InLCAnMSB1bmNhdWdodCBlcnJvcicpIDogbG9jYWxpemUoJ3VuY2F1Z2h0IGVycm9ycycsICd7MH0gdW5jYXVnaHQgZXJyb3JzJywgZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCl9XSgke2NyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgRXh0ZW5zaW9uRWRpdG9yVGFiLkZlYXR1cmVzKX0pYCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlTGluayA9IGV4dGVuc2lvblJ1bnRpbWVTdGF0dXMubWVzc2FnZXMubGVuZ3RoID8gYFske2V4dGVuc2lvblJ1bnRpbWVTdGF0dXMubWVzc2FnZXMubGVuZ3RoID09PSAxID8gbG9jYWxpemUoJ21lc3NhZ2UnLCAnMSBtZXNzYWdlJykgOiBsb2NhbGl6ZSgnbWVzc2FnZXMnLCAnezB9IG1lc3NhZ2VzJywgZXh0ZW5zaW9uUnVudGltZVN0YXR1cy5tZXNzYWdlcy5sZW5ndGgpfV0oJHtjcmVhdGVDb21tYW5kVXJpKCdleHRlbnNpb24ub3BlbicsIHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIEV4dGVuc2lvbkVkaXRvclRhYi5GZWF0dXJlcyl9KWAgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtoYXNFcnJvcnMgPyBlcnJvckljb24uaWQgOiBoYXNXYXJuaW5ncyA/IHdhcm5pbmdJY29uLmlkIDogaW5mb0ljb24uaWR9KSBUaGlzIGV4dGVuc2lvbiBoYXMgcmVwb3J0ZWQgYCk7XG5cdFx0XHRcdFx0aWYgKGVycm9yc0xpbmsgJiYgbWVzc2FnZUxpbmspIHtcblx0XHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2Vycm9yc0xpbmt9IGFuZCAke21lc3NhZ2VMaW5rfWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJHtlcnJvcnNMaW5rIHx8IG1lc3NhZ2VMaW5rfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXh0ZW5zaW9uRmVhdHVyZXNBY2Nlc3NEYXRhLnNpemUpIHtcblx0XHRcdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KTtcblx0XHRcdFx0Zm9yIChjb25zdCBbZmVhdHVyZUlkLCBhY2Nlc3NEYXRhXSBvZiBleHRlbnNpb25GZWF0dXJlc0FjY2Vzc0RhdGEpIHtcblx0XHRcdFx0XHRpZiAoYWNjZXNzRGF0YT8uYWNjZXNzVGltZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmZWF0dXJlID0gcmVnaXN0cnkuZ2V0RXh0ZW5zaW9uRmVhdHVyZShmZWF0dXJlSWQpO1xuXHRcdFx0XHRcdFx0aWYgKGZlYXR1cmUpIHtcblx0XHRcdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ2ZlYXR1cmUgdXNhZ2UgbGFiZWwnLCBcInswfSB1c2FnZVwiLCBmZWF0dXJlLmxhYmVsKSk7XG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGA6IFske2xvY2FsaXplKCd0b3RhbCcsIFwiezB9IHsxfSByZXF1ZXN0cyBpbiBsYXN0IDMwIGRheXNcIiwgYWNjZXNzRGF0YS5hY2Nlc3NUaW1lcy5sZW5ndGgsIGZlYXR1cmUuYWNjZXNzRGF0YUxhYmVsID8/IGZlYXR1cmUubGFiZWwpfV0oJHtjcmVhdGVDb21tYW5kVXJpKCdleHRlbnNpb24ub3BlbicsIHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIEV4dGVuc2lvbkVkaXRvclRhYi5GZWF0dXJlcyl9KWApO1xuXHRcdFx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBzdGF0dXMgb2YgZXh0ZW5zaW9uU3RhdHVzKSB7XG5cdFx0XHRcdGlmIChzdGF0dXMuaWNvbikge1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAkKCR7c3RhdHVzLmljb24uaWR9KSZuYnNwO2ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKHN0YXR1cy5tZXNzYWdlLnZhbHVlKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChydW50aW1lU3RhdGUpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtpbmZvSWNvbi5pZH0pJm5ic3A7YCk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke3J1bnRpbWVTdGF0ZS5yZWFzb259YCk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJlUmVsZWFzZU1lc3NhZ2UpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uUHJlUmVsZWFzZUljb24gPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoZXh0ZW5zaW9uUHJlUmVsZWFzZUljb25Db2xvcik7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGA8c3BhbiBzdHlsZT1cImNvbG9yOiR7ZXh0ZW5zaW9uUHJlUmVsZWFzZUljb24gPyBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleChleHRlbnNpb25QcmVSZWxlYXNlSWNvbikgOiAnI2ZmZmZmZid9O1wiPiQoJHtwcmVSZWxlYXNlSWNvbi5pZH0pPC9zcGFuPiZuYnNwOyR7cHJlUmVsZWFzZU1lc3NhZ2V9YCk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVjb21tZW5kYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKHJlY29tbWVuZGF0aW9uTWVzc2FnZSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtYXJrZG93bjtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVjb21tZW5kYXRpb25NZXNzYWdlKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVjb21tZW5kYXRpb24gPSB0aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpW2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCldO1xuXHRcdGlmICghcmVjb21tZW5kYXRpb24/LnJlYXNvblRleHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGJnQ29sb3IgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoZXh0ZW5zaW9uQnV0dG9uUHJvbWluZW50QmFja2dyb3VuZCk7XG5cdFx0cmV0dXJuIGA8c3BhbiBzdHlsZT1cImNvbG9yOiR7YmdDb2xvciA/IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4KGJnQ29sb3IpIDogJyNmZmZmZmYnfTtcIj4kKCR7c3RhckVtcHR5SWNvbi5pZH0pPC9zcGFuPiZuYnNwOyR7cmVjb21tZW5kYXRpb24ucmVhc29uVGV4dH1gO1xuXHR9XG5cblx0c3RhdGljIGdldFByZVJlbGVhc2VNZXNzYWdlKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFleHRlbnNpb24uaGFzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24uaXNCdWlsdGluKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZXh0ZW5zaW9uLmlzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb24ucHJlUmVsZWFzZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJlUmVsZWFzZVZlcnNpb25MaW5rID0gYFske2xvY2FsaXplKCdTaG93IHByZXJlbGVhc2UgdmVyc2lvbicsIFwiUHJlLVJlbGVhc2UgdmVyc2lvblwiKX1dKCR7Y3JlYXRlQ29tbWFuZFVyaSgnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dQcmVSZWxlYXNlVmVyc2lvbicsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKX0pYDtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2hhcyBwcmVyZWxlYXNlJywgXCJUaGlzIGV4dGVuc2lvbiBoYXMgYSB7MH0gYXZhaWxhYmxlXCIsIHByZVJlbGVhc2VWZXJzaW9uTGluayk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uU3RhdHVzV2lkZ2V0IGV4dGVuZHMgRXh0ZW5zaW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVuZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVuZGVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkUmVuZGVyLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblN0YXR1c0FjdGlvbjogRXh0ZW5zaW9uU3RhdHVzQWN0aW9uLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZXh0ZW5zaW9uU3RhdHVzQWN0aW9uLm9uRGlkQ2hhbmdlU3RhdHVzKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHRyZXNldCh0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NhYmxlcy52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLnZhbHVlID0gZGlzcG9zYWJsZXM7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU3RhdHVzID0gdGhpcy5leHRlbnNpb25TdGF0dXNBY3Rpb24uc3RhdHVzO1xuXHRcdGlmIChleHRlbnNpb25TdGF0dXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleHRlbnNpb25TdGF0dXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gZXh0ZW5zaW9uU3RhdHVzW2ldO1xuXHRcdFx0XHRpZiAoc3RhdHVzLmljb24pIHtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke3N0YXR1cy5pY29uLmlkfSkmbmJzcDtgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihzdGF0dXMubWVzc2FnZS52YWx1ZSk7XG5cdFx0XHRcdGlmIChpIDwgZXh0ZW5zaW9uU3RhdHVzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobWFya2Rvd24pKTtcblx0XHRcdGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgcmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkUmVuZGVyLmZpcmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25XaWRnZXQgZXh0ZW5kcyBFeHRlbnNpb25XaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVuZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVuZGVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkUmVuZGVyLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZSxcblx0XHRASUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5vbkRpZENoYW5nZVJlY29tbWVuZGF0aW9ucygoKSA9PiB0aGlzLnJlbmRlcigpKSk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0cmVzZXQodGhpcy5jb250YWluZXIpO1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uU3RhdHVzID0gdGhpcy5nZXRSZWNvbW1lbmRhdGlvblN0YXR1cygpO1xuXHRcdGlmIChyZWNvbW1lbmRhdGlvblN0YXR1cykge1xuXHRcdFx0aWYgKHJlY29tbWVuZGF0aW9uU3RhdHVzLmljb24pIHtcblx0XHRcdFx0YXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKGBkaXYke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHJlY29tbWVuZGF0aW9uU3RhdHVzLmljb24pfWApKTtcblx0XHRcdH1cblx0XHRcdGFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJChgZGl2LnJlY29tbWVuZGF0aW9uLXRleHRgLCB1bmRlZmluZWQsIHJlY29tbWVuZGF0aW9uU3RhdHVzLm1lc3NhZ2UpKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRSZW5kZXIuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZWNvbW1lbmRhdGlvblN0YXR1cygpOiB7IGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDsgbWVzc2FnZTogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb25cblx0XHRcdHx8IHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mb1xuXHRcdFx0fHwgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZXh0UmVjb21tZW5kYXRpb25zID0gdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdldEFsbFJlY29tbWVuZGF0aW9uc1dpdGhSZWFzb24oKTtcblx0XHRpZiAoZXh0UmVjb21tZW5kYXRpb25zW3RoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV0pIHtcblx0XHRcdGNvbnN0IHJlYXNvblRleHQgPSBleHRSZWNvbW1lbmRhdGlvbnNbdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpXS5yZWFzb25UZXh0O1xuXHRcdFx0aWYgKHJlYXNvblRleHQpIHtcblx0XHRcdFx0cmV0dXJuIHsgaWNvbjogc3RhckVtcHR5SWNvbiwgbWVzc2FnZTogcmVhc29uVGV4dCB9O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5leHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZS5nbG9iYWxJZ25vcmVkUmVjb21tZW5kYXRpb25zLmluZGV4T2YodGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiB7IGljb246IHVuZGVmaW5lZCwgbWVzc2FnZTogbG9jYWxpemUoJ3JlY29tbWVuZGF0aW9uSGFzQmVlbklnbm9yZWQnLCBcIllvdSBoYXZlIGNob3NlbiBub3QgdG8gcmVjZWl2ZSByZWNvbW1lbmRhdGlvbnMgZm9yIHRoaXMgZXh0ZW5zaW9uLlwiKSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBleHRlbnNpb25SYXRpbmdJY29uQ29sb3IgPSByZWdpc3RlckNvbG9yKCdleHRlbnNpb25JY29uLnN0YXJGb3JlZ3JvdW5kJywgeyBsaWdodDogJyNERjYxMDAnLCBkYXJrOiAnI0ZGOEUwMCcsIGhjRGFyazogJyNGRjhFMDAnLCBoY0xpZ2h0OiB0ZXh0TGlua0ZvcmVncm91bmQgfSwgbG9jYWxpemUoJ2V4dGVuc2lvbkljb25TdGFyRm9yZWdyb3VuZCcsIFwiVGhlIGljb24gY29sb3IgZm9yIGV4dGVuc2lvbiByYXRpbmdzLlwiKSwgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IGV4dGVuc2lvblByZVJlbGVhc2VJY29uQ29sb3IgPSByZWdpc3RlckNvbG9yKCdleHRlbnNpb25JY29uLnByZVJlbGVhc2VGb3JlZ3JvdW5kJywgeyBkYXJrOiAnIzFkOTI3MScsIGxpZ2h0OiAnIzFkOTI3MScsIGhjRGFyazogJyMxZDkyNzEnLCBoY0xpZ2h0OiB0ZXh0TGlua0ZvcmVncm91bmQgfSwgbG9jYWxpemUoJ2V4dGVuc2lvblByZVJlbGVhc2VGb3JlZ3JvdW5kJywgXCJUaGUgaWNvbiBjb2xvciBmb3IgcHJlLXJlbGVhc2UgZXh0ZW5zaW9uLlwiKSwgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IGV4dGVuc2lvblNwb25zb3JJY29uQ29sb3IgPSByZWdpc3RlckNvbG9yKCdleHRlbnNpb25JY29uLnNwb25zb3JGb3JlZ3JvdW5kJywgeyBsaWdodDogJyNCNTFFNzgnLCBkYXJrOiAnI0Q3NThCMycsIGhjRGFyazogbnVsbCwgaGNMaWdodDogJyNCNTFFNzgnIH0sIGxvY2FsaXplKCdleHRlbnNpb25JY29uLnNwb25zb3JGb3JlZ3JvdW5kJywgXCJUaGUgaWNvbiBjb2xvciBmb3IgZXh0ZW5zaW9uIHNwb25zb3IuXCIpLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgZXh0ZW5zaW9uUHJpdmF0ZUJhZGdlQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkljb24ucHJpdmF0ZUZvcmVncm91bmQnLCB7IGRhcms6ICcjZmZmZmZmNjAnLCBsaWdodDogJyMwMDAwMDA2MCcsIGhjRGFyazogJyNmZmZmZmY2MCcsIGhjTGlnaHQ6ICcjMDAwMDAwNjAnIH0sIGxvY2FsaXplKCdleHRlbnNpb25JY29uLnByaXZhdGUnLCBcIlRoZSBpY29uIGNvbG9yIGZvciBwcml2YXRlIGV4dGVuc2lvbnMuXCIpKTtcblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgZXh0ZW5zaW9uUmF0aW5nSWNvbiA9IHRoZW1lLmdldENvbG9yKGV4dGVuc2lvblJhdGluZ0ljb25Db2xvcik7XG5cdGlmIChleHRlbnNpb25SYXRpbmdJY29uKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb24tcmF0aW5ncyAuY29kaWNvbi1leHRlbnNpb25zLXN0YXItZnVsbCwgLmV4dGVuc2lvbi1yYXRpbmdzIC5jb2RpY29uLWV4dGVuc2lvbnMtc3Rhci1oYWxmIHsgY29sb3I6ICR7ZXh0ZW5zaW9uUmF0aW5nSWNvbn07IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1ob3Zlci5leHRlbnNpb24taG92ZXIgLm1hcmtkb3duLWhvdmVyIC5ob3Zlci1jb250ZW50cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHN0YXJGdWxsSWNvbil9IHsgY29sb3I6ICR7ZXh0ZW5zaW9uUmF0aW5nSWNvbn07IH1gKTtcblx0fVxuXG5cdGNvbnN0IGV4dGVuc2lvblZlcmlmaWVkUHVibGlzaGVySWNvbiA9IHRoZW1lLmdldENvbG9yKGV4dGVuc2lvblZlcmlmaWVkUHVibGlzaGVySWNvbkNvbG9yKTtcblx0aWYgKGV4dGVuc2lvblZlcmlmaWVkUHVibGlzaGVySWNvbikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHZlcmlmaWVkUHVibGlzaGVySWNvbil9IHsgY29sb3I6ICR7ZXh0ZW5zaW9uVmVyaWZpZWRQdWJsaXNoZXJJY29ufTsgfWApO1xuXHR9XG5cblx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28taG92ZXIuZXh0ZW5zaW9uLWhvdmVyIC5tYXJrZG93bi1ob3ZlciAuaG92ZXItY29udGVudHMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihzcG9uc29ySWNvbil9IHsgY29sb3I6IHZhcigtLXZzY29kZS1leHRlbnNpb25JY29uLXNwb25zb3JGb3JlZ3JvdW5kKTsgfWApO1xuXHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbi1lZGl0b3IgPiAuaGVhZGVyID4gLmRldGFpbHMgPiAuc3VidGl0bGUgLnNwb25zb3IgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihzcG9uc29ySWNvbil9IHsgY29sb3I6IHZhcigtLXZzY29kZS1leHRlbnNpb25JY29uLXNwb25zb3JGb3JlZ3JvdW5kKTsgfWApO1xuXG5cdGNvbnN0IHByaXZhdGVCYWRnZUJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihleHRlbnNpb25Qcml2YXRlQmFkZ2VCYWNrZ3JvdW5kKTtcblx0aWYgKHByaXZhdGVCYWRnZUJhY2tncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbi1wcml2YXRlLWJhZGdlIHsgY29sb3I6ICR7cHJpdmF0ZUJhZGdlQmFja2dyb3VuZH07IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFlBQVk7QUFDeEIsU0FBUyxZQUFZLGNBQWMsaUJBQWlCLHlCQUFzQztBQUMxRixTQUFxQiw2QkFBa0QsZ0JBQWdCLDBCQUFnRDtBQUN2SSxTQUFTLFFBQVEsR0FBRyxPQUFPLHVCQUF1QixXQUFXLG9CQUFvQjtBQUNqRixZQUFZLGNBQWM7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyx5Q0FBeUMsd0NBQXdDO0FBQzFGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMENBQWlFO0FBQzFFLFNBQVMsZUFBZSxrQ0FBa0M7QUFDMUQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw0QkFBNEIsa0NBQWtDO0FBQ3ZFLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsb0JBQW9CLFdBQVcsVUFBVSxrQkFBa0IsZ0JBQWdCLHNCQUFzQixZQUFZLFlBQVkscUJBQXFCLGFBQWEsZUFBZSxjQUFjLGNBQWMsaUJBQWlCLG1CQUFtQjtBQUNuUCxTQUFTLGVBQWUsMEJBQTBCO0FBQ2xELFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsT0FBTyxjQUFj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
