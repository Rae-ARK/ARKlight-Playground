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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { verifiedPublisherIcon } from "../../../services/extensionManagement/common/extensionsIcons.js";
import { McpServerInstallState } from "../common/mcpTypes.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { Emitter } from "../../../../base/common/event.js";
import { reset } from "../../../../base/browser/dom.js";
import { mcpLicenseIcon, mcpServerIcon, mcpServerRemoteIcon, mcpServerWorkspaceIcon, mcpStarredIcon } from "./mcpServerIcons.js";
import { escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../base/common/htmlContent.js";
import { ExtensionIconBadge } from "../../extensions/browser/extensionsWidgets.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { LocalMcpServerScope } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerColor } from "../../../../platform/theme/common/colorUtils.js";
import { textLinkForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
class McpServerWidget extends Disposable {
  constructor() {
    super(...arguments);
    this._mcpServer = null;
  }
  get mcpServer() {
    return this._mcpServer;
  }
  set mcpServer(mcpServer) {
    this._mcpServer = mcpServer;
    this.update();
  }
  update() {
    this.render();
  }
}
function onClick(element, callback) {
  const disposables = new DisposableStore();
  disposables.add(dom.addDisposableListener(element, dom.EventType.CLICK, dom.finalHandler(callback)));
  disposables.add(dom.addDisposableListener(element, dom.EventType.KEY_UP, (e) => {
    const keyboardEvent = new StandardKeyboardEvent(e);
    if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  }));
  return disposables;
}
let McpServerIconWidget = class extends McpServerWidget {
  constructor(container, themeService) {
    super();
    this.themeService = themeService;
    this.iconLoadingDisposable = this._register(new MutableDisposable());
    this.element = dom.append(container, dom.$(".extension-icon"));
    this.iconElement = dom.append(this.element, dom.$("img.icon", { alt: "" }));
    this.iconElement.style.display = "none";
    this.codiconIconElement = dom.append(this.element, dom.$(ThemeIcon.asCSSSelector(mcpServerIcon)));
    this.codiconIconElement.style.display = "none";
    this.render();
    this._register(toDisposable(() => this.clear()));
    this._register(this.themeService.onDidColorThemeChange(() => this.render()));
  }
  clear() {
    this.iconUrl = void 0;
    this.iconElement.src = "";
    this.iconElement.style.display = "none";
    this.codiconIconElement.style.display = "none";
    this.codiconIconElement.className = ThemeIcon.asClassName(mcpServerIcon);
    this.iconLoadingDisposable.clear();
  }
  render() {
    if (!this.mcpServer) {
      this.clear();
      return;
    }
    if (this.mcpServer.icon) {
      const type = this.themeService.getColorTheme().type;
      const iconUrl = isDark(type) ? this.mcpServer.icon.dark : this.mcpServer.icon.light;
      if (this.iconUrl !== iconUrl) {
        this.iconElement.style.display = "inherit";
        this.codiconIconElement.style.display = "none";
        this.iconUrl = iconUrl;
        this.iconLoadingDisposable.value = dom.addDisposableListener(this.iconElement, "error", () => {
          this.iconElement.style.display = "none";
          this.codiconIconElement.style.display = "inherit";
        }, { once: true });
        this.iconElement.src = this.iconUrl;
        if (!this.iconElement.complete) {
          this.iconElement.style.visibility = "hidden";
          this.iconElement.onload = () => this.iconElement.style.visibility = "inherit";
        } else {
          this.iconElement.style.visibility = "inherit";
        }
      }
    } else {
      this.iconUrl = void 0;
      this.iconElement.style.display = "none";
      this.iconElement.src = "";
      this.codiconIconElement.className = this.mcpServer.codicon ? `codicon ${this.mcpServer.codicon}` : ThemeIcon.asClassName(mcpServerIcon);
      this.codiconIconElement.style.display = "inherit";
      this.iconLoadingDisposable.clear();
    }
  }
};
McpServerIconWidget = __decorateClass([
  __decorateParam(1, IThemeService)
], McpServerIconWidget);
let PublisherWidget = class extends McpServerWidget {
  constructor(container, small, hoverService, openerService) {
    super();
    this.container = container;
    this.small = small;
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
    if (!this.mcpServer?.publisherDisplayName) {
      return;
    }
    this.element = dom.append(this.container, dom.$(".publisher"));
    const publisherDisplayName = dom.$(".publisher-name.ellipsis");
    publisherDisplayName.textContent = this.mcpServer.publisherDisplayName;
    const verifiedPublisher = dom.$(".verified-publisher");
    dom.append(verifiedPublisher, dom.$("span.extension-verified-publisher.clickable"), renderIcon(verifiedPublisherIcon));
    if (this.small) {
      if (this.mcpServer.gallery?.publisherDomain?.verified) {
        dom.append(this.element, verifiedPublisher);
      }
      dom.append(this.element, publisherDisplayName);
    } else {
      this.element.classList.toggle("clickable", !!this.mcpServer.gallery?.publisherUrl);
      this.element.setAttribute("role", "button");
      this.element.tabIndex = 0;
      this.containerHover = this.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, localize("publisher", "Publisher ({0})", this.mcpServer.publisherDisplayName)));
      dom.append(this.element, publisherDisplayName);
      if (this.mcpServer.gallery?.publisherDomain?.verified) {
        dom.append(this.element, verifiedPublisher);
        const publisherDomainLink = URI.parse(this.mcpServer.gallery?.publisherDomain.link);
        verifiedPublisher.tabIndex = 0;
        verifiedPublisher.setAttribute("role", "button");
        this.containerHover.update(localize("verified publisher", "This publisher has verified ownership of {0}", this.mcpServer.gallery?.publisherDomain.link));
        verifiedPublisher.setAttribute("role", "link");
        dom.append(verifiedPublisher, dom.$("span.extension-verified-publisher-domain", void 0, publisherDomainLink.authority.startsWith("www.") ? publisherDomainLink.authority.substring(4) : publisherDomainLink.authority));
        this.disposables.add(onClick(verifiedPublisher, () => this.openerService.open(publisherDomainLink)));
      }
      if (this.mcpServer.gallery?.publisherUrl) {
        this.disposables.add(onClick(this.element, () => this.openerService.open(this.mcpServer?.gallery?.publisherUrl)));
      }
    }
  }
};
PublisherWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IOpenerService)
], PublisherWidget);
class StarredWidget extends McpServerWidget {
  constructor(container, small) {
    super();
    this.container = container;
    this.small = small;
    this.disposables = this._register(new DisposableStore());
    this.container.classList.add("extension-ratings");
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
    if (!this.mcpServer?.starsCount) {
      return;
    }
    if (this.small && this.mcpServer.installState !== McpServerInstallState.Uninstalled) {
      return;
    }
    const parent = this.small ? this.container : dom.append(this.container, dom.$("span.rating", { tabIndex: 0 }));
    dom.append(parent, dom.$("span" + ThemeIcon.asCSSSelector(mcpStarredIcon)));
    const ratingCountElement = dom.append(parent, dom.$("span.count", void 0, StarredWidget.getCountLabel(this.mcpServer.starsCount)));
    if (!this.small) {
      ratingCountElement.style.paddingLeft = "3px";
    }
  }
  static getCountLabel(starsCount) {
    if (starsCount > 1e6) {
      return `${Math.floor(starsCount / 1e5) / 10}M`;
    } else if (starsCount > 1e3) {
      return `${Math.floor(starsCount / 1e3)}K`;
    } else {
      return String(starsCount);
    }
  }
}
class LicenseWidget extends McpServerWidget {
  constructor(container) {
    super();
    this.container = container;
    this.disposables = this._register(new DisposableStore());
    this.container.classList.add("license");
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.container.innerText = "";
    this.disposables.clear();
  }
  render() {
    this.clear();
    if (!this.mcpServer?.license) {
      return;
    }
    const parent = dom.append(this.container, dom.$("span.license", { tabIndex: 0 }));
    dom.append(parent, dom.$("span" + ThemeIcon.asCSSSelector(mcpLicenseIcon)));
    const licenseElement = dom.append(parent, dom.$("span", void 0, this.mcpServer.license));
    licenseElement.style.paddingLeft = "3px";
  }
}
let McpServerHoverWidget = class extends McpServerWidget {
  constructor(options, mcpServerStatusAction, hoverService, configurationService) {
    super();
    this.options = options;
    this.mcpServerStatusAction = mcpServerStatusAction;
    this.hoverService = hoverService;
    this.configurationService = configurationService;
    this.hover = this._register(new MutableDisposable());
  }
  render() {
    this.hover.value = void 0;
    if (this.mcpServer) {
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
          markdown: () => Promise.resolve(this.getHoverMarkdown()),
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
    if (!this.mcpServer) {
      return void 0;
    }
    const markdown = new MarkdownString("", { isTrusted: false, supportThemeIcons: true });
    markdown.appendMarkdown(`**${escapeMarkdownSyntaxTokens(this.mcpServer.label)}**`);
    markdown.appendText(`
`);
    let addSeparator = false;
    if (this.mcpServer.local?.scope === LocalMcpServerScope.Workspace) {
      markdown.appendMarkdown(`$(${mcpServerWorkspaceIcon.id})&nbsp;`);
      markdown.appendMarkdown(localize("workspace extension", "Workspace MCP Server"));
      addSeparator = true;
    }
    if (this.mcpServer.local?.scope === LocalMcpServerScope.RemoteUser) {
      markdown.appendMarkdown(`$(${mcpServerRemoteIcon.id})&nbsp;`);
      markdown.appendMarkdown(localize("remote user extension", "Remote MCP Server"));
      addSeparator = true;
    }
    if (this.mcpServer.installState === McpServerInstallState.Installed) {
      if (this.mcpServer.starsCount) {
        if (addSeparator) {
          markdown.appendText(`  |  `);
        }
        const starsCountLabel = StarredWidget.getCountLabel(this.mcpServer.starsCount);
        markdown.appendMarkdown(`$(${mcpStarredIcon.id}) ${starsCountLabel}`);
        addSeparator = true;
      }
    }
    if (addSeparator) {
      markdown.appendText(`
`);
    }
    if (this.mcpServer.description) {
      markdown.appendMarkdown(escapeMarkdownSyntaxTokens(this.mcpServer.description));
    }
    const extensionStatus = this.mcpServerStatusAction.status;
    if (extensionStatus.length) {
      markdown.appendMarkdown(`---`);
      markdown.appendText(`
`);
      for (const status of extensionStatus) {
        if (status.icon) {
          markdown.appendMarkdown(`$(${status.icon.id})&nbsp;`);
        }
        markdown.appendMarkdown(status.message.value);
        markdown.appendText(`
`);
      }
    }
    return markdown;
  }
};
McpServerHoverWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IConfigurationService)
], McpServerHoverWidget);
let McpServerScopeBadgeWidget = class extends McpServerWidget {
  constructor(container, instantiationService) {
    super();
    this.container = container;
    this.instantiationService = instantiationService;
    this.badge = this._register(new MutableDisposable());
    this.element = dom.append(this.container, dom.$(""));
    this.render();
    this._register(toDisposable(() => this.clear()));
  }
  clear() {
    this.badge.value?.element.remove();
    this.badge.clear();
  }
  render() {
    this.clear();
    const scope = this.mcpServer?.local?.scope;
    if (!scope || scope === LocalMcpServerScope.User) {
      return;
    }
    let icon;
    switch (scope) {
      case LocalMcpServerScope.Workspace: {
        icon = mcpServerWorkspaceIcon;
        break;
      }
      case LocalMcpServerScope.RemoteUser: {
        icon = mcpServerRemoteIcon;
        break;
      }
    }
    this.badge.value = this.instantiationService.createInstance(ExtensionIconBadge, icon, void 0);
    dom.append(this.element, this.badge.value.element);
  }
};
McpServerScopeBadgeWidget = __decorateClass([
  __decorateParam(1, IInstantiationService)
], McpServerScopeBadgeWidget);
let McpServerStatusWidget = class extends McpServerWidget {
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
      dom.append(this.container, rendered.element);
    }
    this._onDidRender.fire();
  }
};
McpServerStatusWidget = __decorateClass([
  __decorateParam(2, IMarkdownRendererService)
], McpServerStatusWidget);
const mcpStarredIconColor = registerColor("mcpIcon.starForeground", { light: "#DF6100", dark: "#FF8E00", hcDark: "#FF8E00", hcLight: textLinkForeground }, localize("mcpIconStarForeground", "The icon color for mcp starred."), false);
registerThemingParticipant((theme, collector) => {
  const mcpStarredIconColorValue = theme.getColor(mcpStarredIconColor);
  if (mcpStarredIconColorValue) {
    collector.addRule(`.extension-ratings .codicon-mcp-server-starred { color: ${mcpStarredIconColorValue}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(mcpStarredIcon)} { color: ${mcpStarredIconColorValue}; }`);
  }
});
export {
  LicenseWidget,
  McpServerHoverWidget,
  McpServerIconWidget,
  McpServerScopeBadgeWidget,
  McpServerStatusWidget,
  McpServerWidget,
  PublisherWidget,
  StarredWidget,
  mcpStarredIconColor,
  onClick
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFNlcnZlcldpZGdldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IHZlcmlmaWVkUHVibGlzaGVySWNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29udGFpbmVyLCBJV29ya2JlbmNoTWNwU2VydmVyLCBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclN0YXR1c0FjdGlvbiB9IGZyb20gJy4vbWNwU2VydmVyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWNwTGljZW5zZUljb24sIG1jcFNlcnZlckljb24sIG1jcFNlcnZlclJlbW90ZUljb24sIG1jcFNlcnZlcldvcmtzcGFjZUljb24sIG1jcFN0YXJyZWRJY29uIH0gZnJvbSAnLi9tY3BTZXJ2ZXJJY29ucy5qcyc7XG5pbXBvcnQgeyBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25Ib3Zlck9wdGlvbnMsIEV4dGVuc2lvbkljb25CYWRnZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zV2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IExvY2FsTWNwU2VydmVyU2NvcGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9tY3AvY29tbW9uL21jcFdvcmtiZW5jaE1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IHRleHRMaW5rRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNY3BTZXJ2ZXJXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcFNlcnZlckNvbnRhaW5lciB7XG5cdHByaXZhdGUgX21jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciB8IG51bGwgPSBudWxsO1xuXHRnZXQgbWNwU2VydmVyKCk6IElXb3JrYmVuY2hNY3BTZXJ2ZXIgfCBudWxsIHsgcmV0dXJuIHRoaXMuX21jcFNlcnZlcjsgfVxuXHRzZXQgbWNwU2VydmVyKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciB8IG51bGwpIHsgdGhpcy5fbWNwU2VydmVyID0gbWNwU2VydmVyOyB0aGlzLnVwZGF0ZSgpOyB9XG5cdHVwZGF0ZSgpOiB2b2lkIHsgdGhpcy5yZW5kZXIoKTsgfVxuXHRhYnN0cmFjdCByZW5kZXIoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG9uQ2xpY2soZWxlbWVudDogSFRNTEVsZW1lbnQsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCBkb20uZmluYWxIYW5kbGVyKGNhbGxiYWNrKSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9VUCwgZSA9PiB7XG5cdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHR9XG5cdH0pKTtcblx0cmV0dXJuIGRpc3Bvc2FibGVzO1xufVxuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVySWNvbldpZGdldCBleHRlbmRzIE1jcFNlcnZlcldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpY29uTG9hZGluZ0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgaWNvbkVsZW1lbnQ6IEhUTUxJbWFnZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29kaWNvbkljb25FbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGljb25Vcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuZXh0ZW5zaW9uLWljb24nKSk7XG5cblx0XHR0aGlzLmljb25FbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIGRvbS4kKCdpbWcuaWNvbicsIHsgYWx0OiAnJyB9KSk7XG5cdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGhpcy5jb2RpY29uSWNvbkVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgZG9tLiQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IobWNwU2VydmVySWNvbikpKTtcblx0XHR0aGlzLmNvZGljb25JY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHRoaXMucmVuZGVyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5pY29uVXJsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuaWNvbkVsZW1lbnQuc3JjID0gJyc7XG5cdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuY29kaWNvbkljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5jb2RpY29uSWNvbkVsZW1lbnQuY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKG1jcFNlcnZlckljb24pO1xuXHRcdHRoaXMuaWNvbkxvYWRpbmdEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm1jcFNlcnZlci5pY29uKSB7XG5cdFx0XHRjb25zdCB0eXBlID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGU7XG5cdFx0XHRjb25zdCBpY29uVXJsID0gaXNEYXJrKHR5cGUpID8gdGhpcy5tY3BTZXJ2ZXIuaWNvbi5kYXJrIDogdGhpcy5tY3BTZXJ2ZXIuaWNvbi5saWdodDtcblx0XHRcdGlmICh0aGlzLmljb25VcmwgIT09IGljb25VcmwpIHtcblx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHR0aGlzLmNvZGljb25JY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLmljb25VcmwgPSBpY29uVXJsO1xuXHRcdFx0XHR0aGlzLmljb25Mb2FkaW5nRGlzcG9zYWJsZS52YWx1ZSA9IGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pY29uRWxlbWVudCwgJ2Vycm9yJywgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHR0aGlzLmNvZGljb25JY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2luaGVyaXQnO1xuXHRcdFx0XHR9LCB7IG9uY2U6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuc3JjID0gdGhpcy5pY29uVXJsO1xuXHRcdFx0XHRpZiAoIXRoaXMuaWNvbkVsZW1lbnQuY29tcGxldGUpIHtcblx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJztcblx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50Lm9ubG9hZCA9ICgpID0+IHRoaXMuaWNvbkVsZW1lbnQuc3R5bGUudmlzaWJpbGl0eSA9ICdpbmhlcml0Jztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLnZpc2liaWxpdHkgPSAnaW5oZXJpdCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pY29uVXJsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5pY29uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5pY29uRWxlbWVudC5zcmMgPSAnJztcblx0XHRcdHRoaXMuY29kaWNvbkljb25FbGVtZW50LmNsYXNzTmFtZSA9IHRoaXMubWNwU2VydmVyLmNvZGljb24gPyBgY29kaWNvbiAke3RoaXMubWNwU2VydmVyLmNvZGljb259YCA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShtY3BTZXJ2ZXJJY29uKTtcblx0XHRcdHRoaXMuY29kaWNvbkljb25FbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5oZXJpdCc7XG5cdFx0XHR0aGlzLmljb25Mb2FkaW5nRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUHVibGlzaGVyV2lkZ2V0IGV4dGVuZHMgTWNwU2VydmVyV2lkZ2V0IHtcblxuXHRwcml2YXRlIGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbnRhaW5lckhvdmVyOiBJTWFuYWdlZEhvdmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSBzbWFsbDogYm9vbGVhbixcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8ucHVibGlzaGVyRGlzcGxheU5hbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCBkb20uJCgnLnB1Ymxpc2hlcicpKTtcblx0XHRjb25zdCBwdWJsaXNoZXJEaXNwbGF5TmFtZSA9IGRvbS4kKCcucHVibGlzaGVyLW5hbWUuZWxsaXBzaXMnKTtcblx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZS50ZXh0Q29udGVudCA9IHRoaXMubWNwU2VydmVyLnB1Ymxpc2hlckRpc3BsYXlOYW1lO1xuXG5cdFx0Y29uc3QgdmVyaWZpZWRQdWJsaXNoZXIgPSBkb20uJCgnLnZlcmlmaWVkLXB1Ymxpc2hlcicpO1xuXHRcdGRvbS5hcHBlbmQodmVyaWZpZWRQdWJsaXNoZXIsIGRvbS4kKCdzcGFuLmV4dGVuc2lvbi12ZXJpZmllZC1wdWJsaXNoZXIuY2xpY2thYmxlJyksIHJlbmRlckljb24odmVyaWZpZWRQdWJsaXNoZXJJY29uKSk7XG5cblx0XHRpZiAodGhpcy5zbWFsbCkge1xuXHRcdFx0aWYgKHRoaXMubWNwU2VydmVyLmdhbGxlcnk/LnB1Ymxpc2hlckRvbWFpbj8udmVyaWZpZWQpIHtcblx0XHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmVsZW1lbnQsIHZlcmlmaWVkUHVibGlzaGVyKTtcblx0XHRcdH1cblx0XHRcdGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCBwdWJsaXNoZXJEaXNwbGF5TmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjbGlja2FibGUnLCAhIXRoaXMubWNwU2VydmVyLmdhbGxlcnk/LnB1Ymxpc2hlclVybCk7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gMDtcblxuXHRcdFx0dGhpcy5jb250YWluZXJIb3ZlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsZW1lbnQsIGxvY2FsaXplKCdwdWJsaXNoZXInLCBcIlB1Ymxpc2hlciAoezB9KVwiLCB0aGlzLm1jcFNlcnZlci5wdWJsaXNoZXJEaXNwbGF5TmFtZSkpKTtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCBwdWJsaXNoZXJEaXNwbGF5TmFtZSk7XG5cblx0XHRcdGlmICh0aGlzLm1jcFNlcnZlci5nYWxsZXJ5Py5wdWJsaXNoZXJEb21haW4/LnZlcmlmaWVkKSB7XG5cdFx0XHRcdGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCB2ZXJpZmllZFB1Ymxpc2hlcik7XG5cdFx0XHRcdGNvbnN0IHB1Ymxpc2hlckRvbWFpbkxpbmsgPSBVUkkucGFyc2UodGhpcy5tY3BTZXJ2ZXIuZ2FsbGVyeT8ucHVibGlzaGVyRG9tYWluLmxpbmspO1xuXHRcdFx0XHR2ZXJpZmllZFB1Ymxpc2hlci50YWJJbmRleCA9IDA7XG5cdFx0XHRcdHZlcmlmaWVkUHVibGlzaGVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdFx0dGhpcy5jb250YWluZXJIb3Zlci51cGRhdGUobG9jYWxpemUoJ3ZlcmlmaWVkIHB1Ymxpc2hlcicsIFwiVGhpcyBwdWJsaXNoZXIgaGFzIHZlcmlmaWVkIG93bmVyc2hpcCBvZiB7MH1cIiwgdGhpcy5tY3BTZXJ2ZXIuZ2FsbGVyeT8ucHVibGlzaGVyRG9tYWluLmxpbmspKTtcblx0XHRcdFx0dmVyaWZpZWRQdWJsaXNoZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpbmsnKTtcblxuXHRcdFx0XHRkb20uYXBwZW5kKHZlcmlmaWVkUHVibGlzaGVyLCBkb20uJCgnc3Bhbi5leHRlbnNpb24tdmVyaWZpZWQtcHVibGlzaGVyLWRvbWFpbicsIHVuZGVmaW5lZCwgcHVibGlzaGVyRG9tYWluTGluay5hdXRob3JpdHkuc3RhcnRzV2l0aCgnd3d3LicpID8gcHVibGlzaGVyRG9tYWluTGluay5hdXRob3JpdHkuc3Vic3RyaW5nKDQpIDogcHVibGlzaGVyRG9tYWluTGluay5hdXRob3JpdHkpKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQob25DbGljayh2ZXJpZmllZFB1Ymxpc2hlciwgKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4ocHVibGlzaGVyRG9tYWluTGluaykpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMubWNwU2VydmVyLmdhbGxlcnk/LnB1Ymxpc2hlclVybCkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChvbkNsaWNrKHRoaXMuZWxlbWVudCwgKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odGhpcy5tY3BTZXJ2ZXI/LmdhbGxlcnk/LnB1Ymxpc2hlclVybCEpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgU3RhcnJlZFdpZGdldCBleHRlbmRzIE1jcFNlcnZlcldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHNtYWxsOiBib29sZWFuLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2V4dGVuc2lvbi1yYXRpbmdzJyk7XG5cdFx0aWYgKHRoaXMuc21hbGwpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzbWFsbCcpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8uc3RhcnNDb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNtYWxsICYmIHRoaXMubWNwU2VydmVyLmluc3RhbGxTdGF0ZSAhPT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5zbWFsbCA/IHRoaXMuY29udGFpbmVyIDogZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgZG9tLiQoJ3NwYW4ucmF0aW5nJywgeyB0YWJJbmRleDogMCB9KSk7XG5cdFx0ZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCdzcGFuJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKG1jcFN0YXJyZWRJY29uKSkpO1xuXG5cdFx0Y29uc3QgcmF0aW5nQ291bnRFbGVtZW50ID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCdzcGFuLmNvdW50JywgdW5kZWZpbmVkLCBTdGFycmVkV2lkZ2V0LmdldENvdW50TGFiZWwodGhpcy5tY3BTZXJ2ZXIuc3RhcnNDb3VudCkpKTtcblx0XHRpZiAoIXRoaXMuc21hbGwpIHtcblx0XHRcdHJhdGluZ0NvdW50RWxlbWVudC5zdHlsZS5wYWRkaW5nTGVmdCA9ICczcHgnO1xuXHRcdH1cblx0fVxuXG5cdHN0YXRpYyBnZXRDb3VudExhYmVsKHN0YXJzQ291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0aWYgKHN0YXJzQ291bnQgPiAxMDAwMDAwKSB7XG5cdFx0XHRyZXR1cm4gYCR7TWF0aC5mbG9vcihzdGFyc0NvdW50IC8gMTAwMDAwKSAvIDEwfU1gO1xuXHRcdH0gZWxzZSBpZiAoc3RhcnNDb3VudCA+IDEwMDApIHtcblx0XHRcdHJldHVybiBgJHtNYXRoLmZsb29yKHN0YXJzQ291bnQgLyAxMDAwKX1LYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFN0cmluZyhzdGFyc0NvdW50KTtcblx0XHR9XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgTGljZW5zZVdpZGdldCBleHRlbmRzIE1jcFNlcnZlcldpZGdldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsaWNlbnNlJyk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmlubmVyVGV4dCA9ICcnO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5saWNlbnNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyZW50ID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgZG9tLiQoJ3NwYW4ubGljZW5zZScsIHsgdGFiSW5kZXg6IDAgfSkpO1xuXHRcdGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihtY3BMaWNlbnNlSWNvbikpKTtcblxuXHRcdGNvbnN0IGxpY2Vuc2VFbGVtZW50ID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCB0aGlzLm1jcFNlcnZlci5saWNlbnNlKSk7XG5cdFx0bGljZW5zZUVsZW1lbnQuc3R5bGUucGFkZGluZ0xlZnQgPSAnM3B4Jztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVySG92ZXJXaWRnZXQgZXh0ZW5kcyBNY3BTZXJ2ZXJXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaG92ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogRXh0ZW5zaW9uSG92ZXJPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmVyU3RhdHVzQWN0aW9uOiBNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24sXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5ob3Zlci52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHRoaXMuaG92ZXIudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcih7XG5cdFx0XHRcdGRlbGF5OiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3dvcmtiZW5jaC5ob3Zlci5kZWxheScpLFxuXHRcdFx0XHRzaG93SG92ZXI6IChvcHRpb25zLCBmb2N1cykgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsQ2xhc3NlczogWydleHRlbnNpb24taG92ZXInXSxcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGhvdmVyUG9zaXRpb246IHRoaXMub3B0aW9ucy5wb3NpdGlvbigpLFxuXHRcdFx0XHRcdFx0XHRmb3JjZVBvc2l0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHBlcnNpc3RlbmNlOiB7XG5cdFx0XHRcdFx0XHRcdGhpZGVPbktleURvd246IHRydWUsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgZm9jdXMpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwbGFjZW1lbnQ6ICdlbGVtZW50J1xuXHRcdFx0fSxcblx0XHRcdFx0dGhpcy5vcHRpb25zLnRhcmdldCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1hcmtkb3duOiAoKSA9PiBQcm9taXNlLnJlc29sdmUodGhpcy5nZXRIb3Zlck1hcmtkb3duKCkpLFxuXHRcdFx0XHRcdG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IHVuZGVmaW5lZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdFx0c2hvd0hvdmVySGludDogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEhvdmVyTWFya2Rvd24oKTogTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogZmFsc2UsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXG5cdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCoqJHtlc2NhcGVNYXJrZG93blN5bnRheFRva2Vucyh0aGlzLm1jcFNlcnZlci5sYWJlbCl9KipgKTtcblx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblxuXHRcdGxldCBhZGRTZXBhcmF0b3IgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIubG9jYWw/LnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHttY3BTZXJ2ZXJXb3Jrc3BhY2VJY29uLmlkfSkmbmJzcDtgKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCd3b3Jrc3BhY2UgZXh0ZW5zaW9uJywgXCJXb3Jrc3BhY2UgTUNQIFNlcnZlclwiKSk7XG5cdFx0XHRhZGRTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm1jcFNlcnZlci5sb2NhbD8uc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHttY3BTZXJ2ZXJSZW1vdGVJY29uLmlkfSkmbmJzcDtgKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdyZW1vdGUgdXNlciBleHRlbnNpb24nLCBcIlJlbW90ZSBNQ1AgU2VydmVyXCIpKTtcblx0XHRcdGFkZFNlcGFyYXRvciA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWNwU2VydmVyLmluc3RhbGxTdGF0ZSA9PT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxlZCkge1xuXHRcdFx0aWYgKHRoaXMubWNwU2VydmVyLnN0YXJzQ291bnQpIHtcblx0XHRcdFx0aWYgKGFkZFNlcGFyYXRvcikge1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYCAgfCAgYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3RhcnNDb3VudExhYmVsID0gU3RhcnJlZFdpZGdldC5nZXRDb3VudExhYmVsKHRoaXMubWNwU2VydmVyLnN0YXJzQ291bnQpO1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke21jcFN0YXJyZWRJY29uLmlkfSkgJHtzdGFyc0NvdW50TGFiZWx9YCk7XG5cdFx0XHRcdGFkZFNlcGFyYXRvciA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGFkZFNlcGFyYXRvcikge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWNwU2VydmVyLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihlc2NhcGVNYXJrZG93blN5bnRheFRva2Vucyh0aGlzLm1jcFNlcnZlci5kZXNjcmlwdGlvbikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvblN0YXR1cyA9IHRoaXMubWNwU2VydmVyU3RhdHVzQWN0aW9uLnN0YXR1cztcblxuXHRcdGlmIChleHRlbnNpb25TdGF0dXMubGVuZ3RoKSB7XG5cblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAtLS1gKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHN0YXR1cyBvZiBleHRlbnNpb25TdGF0dXMpIHtcblx0XHRcdFx0aWYgKHN0YXR1cy5pY29uKSB7XG5cdFx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtzdGF0dXMuaWNvbi5pZH0pJm5ic3A7YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oc3RhdHVzLm1lc3NhZ2UudmFsdWUpO1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdHJldHVybiBtYXJrZG93bjtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJTY29wZUJhZGdlV2lkZ2V0IGV4dGVuZHMgTWNwU2VydmVyV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGJhZGdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEV4dGVuc2lvbkljb25CYWRnZT4oKSk7XG5cdHByaXZhdGUgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsIGRvbS4kKCcnKSk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuYmFkZ2UudmFsdWU/LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0dGhpcy5iYWRnZS5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHNjb3BlID0gdGhpcy5tY3BTZXJ2ZXI/LmxvY2FsPy5zY29wZTtcblxuXHRcdGlmICghc2NvcGUgfHwgc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuVXNlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpY29uOiBUaGVtZUljb247XG5cdFx0c3dpdGNoIChzY29wZSkge1xuXHRcdFx0Y2FzZSBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZToge1xuXHRcdFx0XHRpY29uID0gbWNwU2VydmVyV29ya3NwYWNlSWNvbjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcjoge1xuXHRcdFx0XHRpY29uID0gbWNwU2VydmVyUmVtb3RlSWNvbjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5iYWRnZS52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uSWNvbkJhZGdlLCBpY29uLCB1bmRlZmluZWQpO1xuXHRcdGRvbS5hcHBlbmQodGhpcy5lbGVtZW50LCB0aGlzLmJhZGdlLnZhbHVlLmVsZW1lbnQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJTdGF0dXNXaWRnZXQgZXh0ZW5kcyBNY3BTZXJ2ZXJXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5kZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW5kZXI6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRSZW5kZXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU3RhdHVzQWN0aW9uOiBNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24sXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TdGF0dXNBY3Rpb24ub25EaWRDaGFuZ2VTdGF0dXMoKCkgPT4gdGhpcy5yZW5kZXIoKSkpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdHJlc2V0KHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLnJlbmRlckRpc3Bvc2FibGVzLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMucmVuZGVyRGlzcG9zYWJsZXMudmFsdWUgPSBkaXNwb3NhYmxlcztcblx0XHRjb25zdCBleHRlbnNpb25TdGF0dXMgPSB0aGlzLmV4dGVuc2lvblN0YXR1c0FjdGlvbi5zdGF0dXM7XG5cdFx0aWYgKGV4dGVuc2lvblN0YXR1cy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV4dGVuc2lvblN0YXR1cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBzdGF0dXMgPSBleHRlbnNpb25TdGF0dXNbaV07XG5cdFx0XHRcdGlmIChzdGF0dXMuaWNvbikge1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAkKCR7c3RhdHVzLmljb24uaWR9KSZuYnNwO2ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKHN0YXR1cy5tZXNzYWdlLnZhbHVlKTtcblx0XHRcdFx0aWYgKGkgPCBleHRlbnNpb25TdGF0dXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtYXJrZG93bikpO1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgcmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkUmVuZGVyLmZpcmUoKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgbWNwU3RhcnJlZEljb25Db2xvciA9IHJlZ2lzdGVyQ29sb3IoJ21jcEljb24uc3RhckZvcmVncm91bmQnLCB7IGxpZ2h0OiAnI0RGNjEwMCcsIGRhcms6ICcjRkY4RTAwJywgaGNEYXJrOiAnI0ZGOEUwMCcsIGhjTGlnaHQ6IHRleHRMaW5rRm9yZWdyb3VuZCB9LCBsb2NhbGl6ZSgnbWNwSWNvblN0YXJGb3JlZ3JvdW5kJywgXCJUaGUgaWNvbiBjb2xvciBmb3IgbWNwIHN0YXJyZWQuXCIpLCBmYWxzZSk7XG5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IG1jcFN0YXJyZWRJY29uQ29sb3JWYWx1ZSA9IHRoZW1lLmdldENvbG9yKG1jcFN0YXJyZWRJY29uQ29sb3IpO1xuXHRpZiAobWNwU3RhcnJlZEljb25Db2xvclZhbHVlKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb24tcmF0aW5ncyAuY29kaWNvbi1tY3Atc2VydmVyLXN0YXJyZWQgeyBjb2xvcjogJHttY3BTdGFycmVkSWNvbkNvbG9yVmFsdWV9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28taG92ZXIuZXh0ZW5zaW9uLWhvdmVyIC5tYXJrZG93bi1ob3ZlciAuaG92ZXItY29udGVudHMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihtY3BTdGFycmVkSWNvbil9IHsgY29sb3I6ICR7bWNwU3RhcnJlZEljb25Db2xvclZhbHVlfTsgfWApO1xuXHR9XG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBbUQsNkJBQTZCO0FBQ2hGLFNBQVMsZUFBZSxrQ0FBa0M7QUFDMUQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCLGVBQWUscUJBQXFCLHdCQUF3QixzQkFBc0I7QUFDM0csU0FBUyw0QkFBNEIsc0JBQXNCO0FBQzNELFNBQWdDLDBCQUEwQjtBQUMxRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUVsQyxNQUFlLHdCQUF3QixXQUEwQztBQUFBLEVBQWpGO0FBQUE7QUFDTixTQUFRLGFBQXlDO0FBQUE7QUFBQSxFQUNqRCxJQUFJLFlBQXdDO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBWTtBQUFBLEVBQ3RFLElBQUksVUFBVSxXQUF1QztBQUFFLFNBQUssYUFBYTtBQUFXLFNBQUssT0FBTztBQUFBLEVBQUc7QUFBQSxFQUNuRyxTQUFlO0FBQUUsU0FBSyxPQUFPO0FBQUEsRUFBRztBQUVqQztBQUVPLFNBQVMsUUFBUSxTQUFzQixVQUFtQztBQUNoRixRQUFNLGNBQStC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
