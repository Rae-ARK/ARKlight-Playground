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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
import { localize } from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { asTextOrError, IRequestService } from "../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ShowCurrentReleaseNotesActionId } from "../common/update.js";
import { parseUpdateInfoInput } from "../common/updateInfoParser.js";
import { getUpdateInfoUrl, isMajorMinorVersionChange } from "../common/updateUtils.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { URI } from "../../../../base/common/uri.js";
import "./media/postUpdateWidget.css";
const LAST_KNOWN_VERSION_KEY = "postUpdateWidget/lastKnownVersion";
let PostUpdateWidgetContribution = class extends Disposable {
  constructor(commandService, configurationService, hostService, hoverService, layoutService, markdownRendererService, openerService, productService, requestService, storageService, telemetryService) {
    super();
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.hoverService = hoverService;
    this.layoutService = layoutService;
    this.markdownRendererService = markdownRendererService;
    this.openerService = openerService;
    this.productService = productService;
    this.requestService = requestService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    if (isWeb) {
      return;
    }
    this._register(CommandsRegistry.registerCommand("_update.showUpdateInfo", (_accessor, markdown) => this.showUpdateInfo(markdown)));
    void this.tryShowOnStartup();
  }
  async tryShowOnStartup() {
    if (!await this.hostService.hadLastFocus()) {
      return;
    }
    if (!this.detectVersionChange()) {
      return;
    }
    if (this.configurationService.getValue("update.showPostInstallInfo") === false) {
      return;
    }
    await this.showUpdateInfo();
  }
  async showUpdateInfo(markdown) {
    const info = await this.getUpdateInfo(markdown);
    if (!info) {
      return;
    }
    const contentDisposables = new DisposableStore();
    const target = this.layoutService.mainContainer;
    const { clientWidth } = target;
    const maxWidth = 420;
    const x = Math.max(clientWidth - maxWidth - 80, 16);
    this.hoverService.showInstantHover({
      content: this.buildContent(info, contentDisposables),
      target: {
        targetElements: [target],
        x,
        y: 40,
        dispose: () => contentDisposables.dispose()
      },
      additionalClasses: ["post-update-widget-hover"],
      persistence: { sticky: true },
      appearance: { showPointer: false, compact: true, maxHeightRatio: 1 },
      trapFocus: true
    }, true);
  }
  async getUpdateInfo(input) {
    if (!input) {
      try {
        const url = getUpdateInfoUrl(this.productService.version);
        const context = await this.requestService.request({ url, callSite: "postUpdateWidget" }, CancellationToken.None);
        input = await asTextOrError(context);
      } catch {
      }
    }
    if (!input) {
      return void 0;
    }
    let info = parseUpdateInfoInput(input);
    if (!info?.buttons?.length) {
      info = {
        ...info,
        buttons: [{
          label: localize("postUpdate.releaseNotes", "Release Notes"),
          commandId: ShowCurrentReleaseNotesActionId,
          args: [this.productService.version],
          style: "secondary"
        }]
      };
    }
    return info;
  }
  buildContent(info, disposables) {
    const { markdown, buttons, bannerImageUrl, badge, title, features } = info;
    const container = dom.$(".post-update-widget");
    const titleId = `post-update-widget-title-${PostUpdateWidgetContribution.idCounter++}`;
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-labelledby", titleId);
    const banner = dom.append(container, dom.$(".banner"));
    banner.setAttribute("aria-hidden", "true");
    const safeBannerUrl = sanitizeBannerImageUrl(bannerImageUrl);
    if (safeBannerUrl) {
      banner.style.setProperty("background-image", `url(${JSON.stringify(safeBannerUrl)})`);
    }
    const closeButton = dom.append(container, dom.$("button.banner-close"));
    closeButton.setAttribute("aria-label", localize("postUpdate.close", "Close"));
    const closeIcon = dom.append(closeButton, dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
    closeIcon.setAttribute("aria-hidden", "true");
    disposables.add(dom.addDisposableListener(closeButton, "click", () => {
      this.hoverService.hideHover(true);
    }));
    const body = dom.append(container, dom.$(".body"));
    if (badge) {
      const badgeEl = dom.append(body, dom.$(".badge"));
      badgeEl.textContent = badge;
    }
    const titleEl = dom.append(body, dom.$(".title"));
    titleEl.id = titleId;
    titleEl.textContent = title ?? localize("postUpdate.title", "New in {0}", this.productService.version);
    if (features?.length) {
      const list = dom.append(body, dom.$(".features"));
      list.setAttribute("role", "list");
      for (const feature of features) {
        const row = dom.append(list, dom.$(".feature"));
        row.setAttribute("role", "listitem");
        const iconEl = dom.append(row, dom.$(".feature-icon"));
        const iconId = feature.icon ?? Codicon.sparkle.id;
        const themeIcon = ThemeIcon.fromId(iconId);
        iconEl.classList.add(...ThemeIcon.asClassNameArray(themeIcon));
        iconEl.setAttribute("aria-hidden", "true");
        const text = dom.append(row, dom.$(".feature-text"));
        const featureTitle = dom.append(text, dom.$(".feature-title"));
        featureTitle.textContent = feature.title;
        const featureDescription = dom.append(text, dom.$(".feature-description"));
        const rendered = disposables.add(this.markdownRendererService.render(
          new MarkdownString(feature.description, {
            isTrusted: true,
            supportThemeIcons: true
          }),
          {
            actionHandler: (link, mdStr) => {
              openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
              this.hoverService.hideHover(true);
            }
          }
        ));
        featureDescription.appendChild(rendered.element);
      }
    } else if (markdown) {
      const markdownContainer = dom.append(body, dom.$(".update-markdown"));
      const rendered = disposables.add(this.markdownRendererService.render(
        new MarkdownString(markdown, {
          isTrusted: true,
          supportHtml: true,
          supportThemeIcons: true
        }),
        {
          actionHandler: (link, mdStr) => {
            openLinkFromMarkdown(this.openerService, link, mdStr.isTrusted);
            this.hoverService.hideHover(true);
          }
        }
      ));
      markdownContainer.appendChild(rendered.element);
    }
    if (buttons?.length) {
      const buttonBar = dom.append(body, dom.$(".button-bar"));
      const isSingleButton = buttons.length === 1;
      let seenSecondary = false;
      for (const { label, style, commandId, args } of buttons) {
        const button = dom.append(buttonBar, dom.$("button"));
        button.textContent = label;
        if (style === "secondary") {
          button.classList.add("update-button-secondary");
          if (!seenSecondary && buttons.length > 1) {
            button.classList.add("update-button-leading-secondary");
            seenSecondary = true;
          }
        } else {
          button.classList.add("update-button-primary");
        }
        if (isSingleButton) {
          button.classList.add("update-button-full-width");
        }
        disposables.add(dom.addDisposableListener(button, "click", () => {
          this.telemetryService.publicLog2(
            "workbenchActionExecuted",
            { id: commandId, from: "postUpdateWidget" }
          );
          void this.commandService.executeCommand(commandId, ...args ?? []);
          this.hoverService.hideHover(true);
        }));
      }
    }
    return container;
  }
  detectVersionChange() {
    let from;
    try {
      from = this.storageService.getObject(LAST_KNOWN_VERSION_KEY, StorageScope.APPLICATION);
    } catch {
    }
    const to = {
      version: this.productService.version,
      commit: this.productService.commit,
      timestamp: Date.now()
    };
    if (from?.commit === to.commit) {
      return false;
    }
    this.storageService.store(LAST_KNOWN_VERSION_KEY, JSON.stringify(to), StorageScope.APPLICATION, StorageTarget.MACHINE);
    if (from) {
      return isMajorMinorVersionChange(from.version, to.version);
    }
    return false;
  }
};
PostUpdateWidgetContribution.idCounter = 0;
PostUpdateWidgetContribution = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IHostService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, ILayoutService),
  __decorateParam(5, IMarkdownRendererService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, IProductService),
  __decorateParam(8, IRequestService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, ITelemetryService)
], PostUpdateWidgetContribution);
function sanitizeBannerImageUrl(value) {
  if (!value) {
    return void 0;
  }
  try {
    const uri = URI.parse(value, true);
    if (uri.scheme === "https") {
      return uri.toString(true);
    }
    if (uri.scheme === "data" && /^image\//i.test(uri.path)) {
      return uri.toString(true);
    }
  } catch {
  }
  return void 0;
}
export {
  PostUpdateWidgetContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VwZGF0ZS9icm93c2VyL3Bvc3RVcGRhdGVXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIG9wZW5MaW5rRnJvbU1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNUZXh0T3JFcnJvciwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgU2hvd0N1cnJlbnRSZWxlYXNlTm90ZXNBY3Rpb25JZCB9IGZyb20gJy4uL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgSVBhcnNlZFVwZGF0ZUluZm9JbnB1dCwgcGFyc2VVcGRhdGVJbmZvSW5wdXQgfSBmcm9tICcuLi9jb21tb24vdXBkYXRlSW5mb1BhcnNlci5qcyc7XG5pbXBvcnQgeyBnZXRVcGRhdGVJbmZvVXJsLCBpc01ham9yTWlub3JWZXJzaW9uQ2hhbmdlIH0gZnJvbSAnLi4vY29tbW9uL3VwZGF0ZVV0aWxzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAnLi9tZWRpYS9wb3N0VXBkYXRlV2lkZ2V0LmNzcyc7XG5cbmNvbnN0IExBU1RfS05PV05fVkVSU0lPTl9LRVkgPSAncG9zdFVwZGF0ZVdpZGdldC9sYXN0S25vd25WZXJzaW9uJztcblxuaW50ZXJmYWNlIElMYXN0S25vd25WZXJzaW9uIHtcblx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSBjb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBudW1iZXI7XG59XG5cbi8qKlxuICogRGlzcGxheXMgcG9zdC11cGRhdGUgY2FsbC10by1hY3Rpb24gd2lkZ2V0IGFmdGVyIGEgdmVyc2lvbiBjaGFuZ2UgaXMgZGV0ZWN0ZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBQb3N0VXBkYXRlV2lkZ2V0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIGlkQ291bnRlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHJldHVybjsgLy8gRWxlY3Ryb24gb25seVxuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfdXBkYXRlLnNob3dVcGRhdGVJbmZvJywgKF9hY2Nlc3NvciwgbWFya2Rvd24/OiBzdHJpbmcpID0+IHRoaXMuc2hvd1VwZGF0ZUluZm8obWFya2Rvd24pKSk7XG5cdFx0dm9pZCB0aGlzLnRyeVNob3dPblN0YXJ0dXAoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ5U2hvd09uU3RhcnR1cCgpIHtcblx0XHRpZiAoIWF3YWl0IHRoaXMuaG9zdFNlcnZpY2UuaGFkTGFzdEZvY3VzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZGV0ZWN0VmVyc2lvbkNoYW5nZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3VwZGF0ZS5zaG93UG9zdEluc3RhbGxJbmZvJykgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zaG93VXBkYXRlSW5mbygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93VXBkYXRlSW5mbyhtYXJrZG93bj86IHN0cmluZykge1xuXHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLmdldFVwZGF0ZUluZm8obWFya2Rvd24pO1xuXHRcdGlmICghaW5mbykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lcjtcblx0XHRjb25zdCB7IGNsaWVudFdpZHRoIH0gPSB0YXJnZXQ7XG5cdFx0Y29uc3QgbWF4V2lkdGggPSA0MjA7XG5cdFx0Y29uc3QgeCA9IE1hdGgubWF4KGNsaWVudFdpZHRoIC0gbWF4V2lkdGggLSA4MCwgMTYpO1xuXG5cdFx0dGhpcy5ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcih7XG5cdFx0XHRjb250ZW50OiB0aGlzLmJ1aWxkQ29udGVudChpbmZvLCBjb250ZW50RGlzcG9zYWJsZXMpLFxuXHRcdFx0dGFyZ2V0OiB7XG5cdFx0XHRcdHRhcmdldEVsZW1lbnRzOiBbdGFyZ2V0XSxcblx0XHRcdFx0eCxcblx0XHRcdFx0eTogNDAsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGNvbnRlbnREaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsQ2xhc3NlczogWydwb3N0LXVwZGF0ZS13aWRnZXQtaG92ZXInXSxcblx0XHRcdHBlcnNpc3RlbmNlOiB7IHN0aWNreTogdHJ1ZSB9LFxuXHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogZmFsc2UsIGNvbXBhY3Q6IHRydWUsIG1heEhlaWdodFJhdGlvOiAxIH0sXG5cdFx0XHR0cmFwRm9jdXM6IHRydWUsXG5cdFx0fSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFVwZGF0ZUluZm8oaW5wdXQ/OiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTxJUGFyc2VkVXBkYXRlSW5mb0lucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXBkYXRlSW5mb1VybCh0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pO1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHsgdXJsLCBjYWxsU2l0ZTogJ3Bvc3RVcGRhdGVXaWRnZXQnIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRpbnB1dCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHR9IGNhdGNoIHsgfVxuXHRcdH1cblxuXHRcdGlmICghaW5wdXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGluZm8gPSBwYXJzZVVwZGF0ZUluZm9JbnB1dChpbnB1dCk7XG5cdFx0aWYgKCFpbmZvPy5idXR0b25zPy5sZW5ndGgpIHtcblx0XHRcdGluZm8gPSB7XG5cdFx0XHRcdC4uLmluZm8sIGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwb3N0VXBkYXRlLnJlbGVhc2VOb3RlcycsIFwiUmVsZWFzZSBOb3Rlc1wiKSxcblx0XHRcdFx0XHRjb21tYW5kSWQ6IFNob3dDdXJyZW50UmVsZWFzZU5vdGVzQWN0aW9uSWQsXG5cdFx0XHRcdFx0YXJnczogW3RoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbl0sXG5cdFx0XHRcdFx0c3R5bGU6ICdzZWNvbmRhcnknXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBpbmZvO1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZENvbnRlbnQoaW5mbzogSVBhcnNlZFVwZGF0ZUluZm9JbnB1dCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCB7IG1hcmtkb3duLCBidXR0b25zLCBiYW5uZXJJbWFnZVVybCwgYmFkZ2UsIHRpdGxlLCBmZWF0dXJlcyB9ID0gaW5mbztcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLnBvc3QtdXBkYXRlLXdpZGdldCcpO1xuXHRcdGNvbnN0IHRpdGxlSWQgPSBgcG9zdC11cGRhdGUtd2lkZ2V0LXRpdGxlLSR7UG9zdFVwZGF0ZVdpZGdldENvbnRyaWJ1dGlvbi5pZENvdW50ZXIrK31gO1xuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZGlhbG9nJyk7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbGxlZGJ5JywgdGl0bGVJZCk7XG5cdFx0Ly8gRXNjYXBlLXRvLWRpc21pc3MgaXMgaGFuZGxlZCBieSB0aGUgaG92ZXIgd2lkZ2V0IGl0c2VsZiAoSG92ZXJXaWRnZXQgbGlzdGVucyBmb3IgRXNjYXBlXG5cdFx0Ly8gb24gaXRzIGNvbnRhaW5lciBhbmQgZGlzcG9zZXMgdGhlIGhvdmVyKS5cblxuXHRcdC8vIEJhbm5lciAoZGVjb3JhdGl2ZSkuIERlZmF1bHQgaXMgYSBDU1MgZ3JhZGllbnQ7IGFuIGltYWdlIGZyb20gdGhlIG1hcmtkb3duIGZyb250bWF0dGVyIG92ZXJyaWRlcyBpdC5cblx0XHRjb25zdCBiYW5uZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5iYW5uZXInKSk7XG5cdFx0YmFubmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGNvbnN0IHNhZmVCYW5uZXJVcmwgPSBzYW5pdGl6ZUJhbm5lckltYWdlVXJsKGJhbm5lckltYWdlVXJsKTtcblx0XHRpZiAoc2FmZUJhbm5lclVybCkge1xuXHRcdFx0Ly8gVXNlIHNldFByb3BlcnR5ICsgSlNPTi5zdHJpbmdpZnkgdG8gc2FmZWx5IHF1b3RlIHRoZSBVUkwgaW5zaWRlIENTUyB3aXRob3V0IGJyZWFraW5nIG91dC5cblx0XHRcdGJhbm5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnYmFja2dyb3VuZC1pbWFnZScsIGB1cmwoJHtKU09OLnN0cmluZ2lmeShzYWZlQmFubmVyVXJsKX0pYCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgYnV0dG9uIGlzIGEgc2libGluZyBvZiB0aGUgYmFubmVyIHNvIGl0IGlzbid0IGEgZm9jdXNhYmxlIGRlc2NlbmRhbnQgb2YgYW4gYXJpYS1oaWRkZW4gcmVnaW9uLlxuXHRcdGNvbnN0IGNsb3NlQnV0dG9uID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdidXR0b24uYmFubmVyLWNsb3NlJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdGNsb3NlQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdwb3N0VXBkYXRlLmNsb3NlJywgXCJDbG9zZVwiKSk7XG5cdFx0Y29uc3QgY2xvc2VJY29uID0gZG9tLmFwcGVuZChjbG9zZUJ1dHRvbiwgZG9tLiQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5jbG9zZSkpKTtcblx0XHRjbG9zZUljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2xvc2VCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBCb2R5XG5cdFx0Y29uc3QgYm9keSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmJvZHknKSk7XG5cblx0XHQvLyBCYWRnZVxuXHRcdGlmIChiYWRnZSkge1xuXHRcdFx0Y29uc3QgYmFkZ2VFbCA9IGRvbS5hcHBlbmQoYm9keSwgZG9tLiQoJy5iYWRnZScpKTtcblx0XHRcdGJhZGdlRWwudGV4dENvbnRlbnQgPSBiYWRnZTtcblx0XHR9XG5cblx0XHQvLyBUaXRsZVxuXHRcdGNvbnN0IHRpdGxlRWwgPSBkb20uYXBwZW5kKGJvZHksIGRvbS4kKCcudGl0bGUnKSk7XG5cdFx0dGl0bGVFbC5pZCA9IHRpdGxlSWQ7XG5cdFx0dGl0bGVFbC50ZXh0Q29udGVudCA9IHRpdGxlID8/IGxvY2FsaXplKCdwb3N0VXBkYXRlLnRpdGxlJywgXCJOZXcgaW4gezB9XCIsIHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbik7XG5cblx0XHQvLyBGZWF0dXJlcyAocHJlZmVycmVkKSBvciBtYXJrZG93biBib2R5XG5cdFx0aWYgKGZlYXR1cmVzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGxpc3QgPSBkb20uYXBwZW5kKGJvZHksIGRvbS4kKCcuZmVhdHVyZXMnKSk7XG5cdFx0XHRsaXN0LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Jyk7XG5cdFx0XHRmb3IgKGNvbnN0IGZlYXR1cmUgb2YgZmVhdHVyZXMpIHtcblx0XHRcdFx0Y29uc3Qgcm93ID0gZG9tLmFwcGVuZChsaXN0LCBkb20uJCgnLmZlYXR1cmUnKSk7XG5cdFx0XHRcdHJvdy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdGl0ZW0nKTtcblx0XHRcdFx0Y29uc3QgaWNvbkVsID0gZG9tLmFwcGVuZChyb3csIGRvbS4kKCcuZmVhdHVyZS1pY29uJykpO1xuXHRcdFx0XHRjb25zdCBpY29uSWQgPSBmZWF0dXJlLmljb24gPz8gQ29kaWNvbi5zcGFya2xlLmlkO1xuXHRcdFx0XHRjb25zdCB0aGVtZUljb24gPSBUaGVtZUljb24uZnJvbUlkKGljb25JZCk7XG5cdFx0XHRcdGljb25FbC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoZW1lSWNvbikpO1xuXHRcdFx0XHRpY29uRWwuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBkb20uYXBwZW5kKHJvdywgZG9tLiQoJy5mZWF0dXJlLXRleHQnKSk7XG5cdFx0XHRcdGNvbnN0IGZlYXR1cmVUaXRsZSA9IGRvbS5hcHBlbmQodGV4dCwgZG9tLiQoJy5mZWF0dXJlLXRpdGxlJykpO1xuXHRcdFx0XHRmZWF0dXJlVGl0bGUudGV4dENvbnRlbnQgPSBmZWF0dXJlLnRpdGxlO1xuXHRcdFx0XHRjb25zdCBmZWF0dXJlRGVzY3JpcHRpb24gPSBkb20uYXBwZW5kKHRleHQsIGRvbS4kKCcuZmVhdHVyZS1kZXNjcmlwdGlvbicpKTtcblx0XHRcdFx0Ly8gUmVuZGVyIGRlc2NyaXB0aW9uIGFzIG1hcmtkb3duIHNvIGl0IGNhbiBpbmNsdWRlIGlubGluZSBsaW5rcyBhbmQgZW1waGFzaXMuXG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKFxuXHRcdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhmZWF0dXJlLmRlc2NyaXB0aW9uLCB7XG5cdFx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRhY3Rpb25IYW5kbGVyOiAobGluaywgbWRTdHIpID0+IHtcblx0XHRcdFx0XHRcdFx0b3BlbkxpbmtGcm9tTWFya2Rvd24odGhpcy5vcGVuZXJTZXJ2aWNlLCBsaW5rLCBtZFN0ci5pc1RydXN0ZWQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0ZmVhdHVyZURlc2NyaXB0aW9uLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAobWFya2Rvd24pIHtcblx0XHRcdGNvbnN0IG1hcmtkb3duQ29udGFpbmVyID0gZG9tLmFwcGVuZChib2R5LCBkb20uJCgnLnVwZGF0ZS1tYXJrZG93bicpKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKFxuXHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcobWFya2Rvd24sIHtcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0c3VwcG9ydEh0bWw6IHRydWUsXG5cdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWN0aW9uSGFuZGxlcjogKGxpbmssIG1kU3RyKSA9PiB7XG5cdFx0XHRcdFx0XHRvcGVuTGlua0Zyb21NYXJrZG93bih0aGlzLm9wZW5lclNlcnZpY2UsIGxpbmssIG1kU3RyLmlzVHJ1c3RlZCk7XG5cdFx0XHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0bWFya2Rvd25Db250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnV0dG9uc1xuXHRcdGlmIChidXR0b25zPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbkJhciA9IGRvbS5hcHBlbmQoYm9keSwgZG9tLiQoJy5idXR0b24tYmFyJykpO1xuXHRcdFx0Y29uc3QgaXNTaW5nbGVCdXR0b24gPSBidXR0b25zLmxlbmd0aCA9PT0gMTtcblx0XHRcdGxldCBzZWVuU2Vjb25kYXJ5ID0gZmFsc2U7XG5cblx0XHRcdGZvciAoY29uc3QgeyBsYWJlbCwgc3R5bGUsIGNvbW1hbmRJZCwgYXJncyB9IG9mIGJ1dHRvbnMpIHtcblx0XHRcdFx0Y29uc3QgYnV0dG9uID0gZG9tLmFwcGVuZChidXR0b25CYXIsIGRvbS4kKCdidXR0b24nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0XHRcdGJ1dHRvbi50ZXh0Q29udGVudCA9IGxhYmVsO1xuXG5cdFx0XHRcdGlmIChzdHlsZSA9PT0gJ3NlY29uZGFyeScpIHtcblx0XHRcdFx0XHRidXR0b24uY2xhc3NMaXN0LmFkZCgndXBkYXRlLWJ1dHRvbi1zZWNvbmRhcnknKTtcblx0XHRcdFx0XHRpZiAoIXNlZW5TZWNvbmRhcnkgJiYgYnV0dG9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRidXR0b24uY2xhc3NMaXN0LmFkZCgndXBkYXRlLWJ1dHRvbi1sZWFkaW5nLXNlY29uZGFyeScpO1xuXHRcdFx0XHRcdFx0c2VlblNlY29uZGFyeSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKCd1cGRhdGUtYnV0dG9uLXByaW1hcnknKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc1NpbmdsZUJ1dHRvbikge1xuXHRcdFx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QuYWRkKCd1cGRhdGUtYnV0dG9uLWZ1bGwtd2lkdGgnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0XHRcdFx0J3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJyxcblx0XHRcdFx0XHRcdHsgaWQ6IGNvbW1hbmRJZCwgZnJvbTogJ3Bvc3RVcGRhdGVXaWRnZXQnIH1cblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0dm9pZCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCwgLi4uKGFyZ3MgPz8gW10pKTtcblx0XHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZS5oaWRlSG92ZXIodHJ1ZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBkZXRlY3RWZXJzaW9uQ2hhbmdlKCk6IGJvb2xlYW4ge1xuXHRcdGxldCBmcm9tOiBJTGFzdEtub3duVmVyc2lvbiB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0ZnJvbSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0KExBU1RfS05PV05fVkVSU0lPTl9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fSBjYXRjaCB7IH1cblxuXHRcdGNvbnN0IHRvOiBJTGFzdEtub3duVmVyc2lvbiA9IHtcblx0XHRcdHZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdGNvbW1pdDogdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQsXG5cdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0fTtcblxuXHRcdGlmIChmcm9tPy5jb21taXQgPT09IHRvLmNvbW1pdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoTEFTVF9LTk9XTl9WRVJTSU9OX0tFWSwgSlNPTi5zdHJpbmdpZnkodG8pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRpZiAoZnJvbSkge1xuXHRcdFx0cmV0dXJuIGlzTWFqb3JNaW5vclZlcnNpb25DaGFuZ2UoZnJvbS52ZXJzaW9uLCB0by52ZXJzaW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLyoqXG4gKiBWYWxpZGF0ZXMgYSBiYW5uZXIgaW1hZ2UgVVJMIGZyb20gdXBkYXRlIGluZm8uIE9ubHkgYGh0dHBzOmAgYW5kIGBkYXRhOmltYWdlLypgIHNjaGVtZXMgYXJlXG4gKiBhbGxvd2VkIHRvIHByZXZlbnQgQ1NTLWluamVjdGlvbiBvciB1bmV4cGVjdGVkIHByb3RvY29sIGhhbmRsZXJzIGJlaW5nIGludm9rZWQgZnJvbSB0aGUgbWFya2Rvd24gcGF5bG9hZC5cbiAqL1xuZnVuY3Rpb24gc2FuaXRpemVCYW5uZXJJbWFnZVVybCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF2YWx1ZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UodmFsdWUsIHRydWUpO1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSAnaHR0cHMnKSB7XG5cdFx0XHRyZXR1cm4gdXJpLnRvU3RyaW5nKHRydWUpO1xuXHRcdH1cblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gJ2RhdGEnICYmIC9eaW1hZ2VcXC8vaS50ZXN0KHVyaS5wYXRoKSkge1xuXHRcdFx0cmV0dXJuIHVyaS50b1N0cmluZyh0cnVlKTtcblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIGZhbGwgdGhyb3VnaFxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQix1QkFBdUI7QUFDbEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEIsNEJBQTRCO0FBQy9ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZSx1QkFBdUI7QUFDL0MsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBaUMsNEJBQTRCO0FBQzdELFNBQVMsa0JBQWtCLGlDQUFpQztBQUM1RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLE9BQU87QUFFUCxNQUFNLHlCQUF5QjtBQVd4QixJQUFNLCtCQUFOLGNBQTJDLFdBQTZDO0FBQUEsRUFJOUYsWUFDbUMsZ0JBQ00sc0JBQ1QsYUFDQyxjQUNDLGVBQ1UseUJBQ1YsZUFDQyxnQkFDQSxnQkFDQSxnQkFDRSxrQkFDbkM7QUFDRCxVQUFNO0FBWjRCO0FBQ007QUFDVDtBQUNDO0FBQ0M7QUFDVTtBQUNWO0FBQ0M7QUFDQTtBQUNBO0FBQ0U7QUFJcEMsUUFBSSxPQUFPO0FBQ1Y7QUFBQSxJQUNEO0FBRUEsU0FBSyxVQUFVLGlCQUFpQixnQkFBZ0IsMEJBQTBCLENBQUMsV0FBVyxhQUFzQixLQUFLLGVBQWUsUUFBUSxDQUFDLENBQUM7QUFDMUksU0FBSyxLQUFLLGlCQUFpQjtBQUFBLEVBQzVCO0FBQUEsRUFFQSxNQUFjLG1CQUFtQjtBQUNoQyxRQUFJLENBQUMsTUFBTSxLQUFLLFlBQVksYUFBYSxHQUFHO0FBQzNDO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLG9CQUFvQixHQUFHO0FBQ2hDO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxxQkFBcUIsU0FBa0IsNEJBQTRCLE1BQU0sT0FBTztBQUN4RjtBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssZUFBZTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxNQUFjLGVBQWUsVUFBbUI7QUFDL0MsVUFBTSxPQUFPLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFDOUMsUUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLElBQ0Q7QUFFQSxVQUFNLHFCQUFxQixJQUFJLGdCQUFnQjtBQUMvQyxVQUFNLFNBQVMsS0FBSyxjQUFjO0FBQ2xDLFVBQU0sRUFBRSxZQUFZLElBQUk7QUFDeEIsVUFBTSxXQUFXO0FBQ2pCLFVBQU0sSUFBSSxLQUFLLElBQUksY0FBYyxXQUFXLElBQUksRUFBRTtBQUVsRCxTQUFLLGFBQWEsaUJBQWlCO0FBQUEsTUFDbEMsU0FBUyxLQUFLLGFBQWEsTUFBTSxrQkFBa0I7QUFBQSxNQUNuRCxRQUFRO0FBQUEsUUFDUCxnQkFBZ0IsQ0FBQyxNQUFNO0FBQUEsUUFDdkI7QUFBQSxRQUNBLEdBQUc7QUFBQSxRQUNILFNBQVMsTUFBTSxtQkFBbUIsUUFBUTtBQUFBLE1BQzNDO0FBQUEsTUFDQSxtQkFBbUIsQ0FBQywwQkFBMEI7QUFBQSxNQUM5QyxhQUFhLEVBQUUsUUFBUSxLQUFLO0FBQUEsTUFDNUIsWUFBWSxFQUFFLGFBQWEsT0FBTyxTQUFTLE1BQU0sZ0JBQWdCLEVBQUU7QUFBQSxNQUNuRSxXQUFXO0FBQUEsSUFDWixHQUFHLElBQUk7QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGNBQWMsT0FBb0U7QUFDL0YsUUFBSSxDQUFDLE9BQU87QUFDWCxVQUFJO0FBQ0gsY0FBTSxNQUFNLGlCQUFpQixLQUFLLGVBQWUsT0FBTztBQUN4RCxjQUFNLFVBQVUsTUFBTSxLQUFLLGVBQWUsUUFBUSxFQUFFLEtBQUssVUFBVSxtQkFBbUIsR0FBRyxrQkFBa0IsSUFBSTtBQUMvRyxnQkFBUSxNQUFNLGNBQWMsT0FBTztBQUFBLE1BQ3BDLFFBQVE7QUFBQSxNQUFFO0FBQUEsSUFDWDtBQUVBLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE9BQU8scUJBQXFCLEtBQUs7QUFDckMsUUFBSSxDQUFDLE1BQU0sU0FBUyxRQUFRO0FBQzNCLGFBQU87QUFBQSxRQUNOLEdBQUc7QUFBQSxRQUFNLFNBQVMsQ0FBQztBQUFBLFVBQ2xCLE9BQU8sU0FBUywyQkFBMkIsZUFBZTtBQUFBLFVBQzFELFdBQVc7QUFBQSxVQUNYLE1BQU0sQ0FBQyxLQUFLLGVBQWUsT0FBTztBQUFBLFVBQ2xDLE9BQU87QUFBQSxRQUNSLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxhQUFhLE1BQThCLGFBQTJDO0FBQzdGLFVBQU0sRUFBRSxVQUFVLFNBQVMsZ0JBQWdCLE9BQU8sT0FBTyxTQUFTLElBQUk7QUFDdEUsVUFBTSxZQUFZLElBQUksRUFBRSxxQkFBcUI7QUFDN0MsVUFBTSxVQUFVLDRCQUE0Qiw2QkFBNkIsV0FBVztBQUNwRixjQUFVLGFBQWEsUUFBUSxRQUFRO0FBQ3ZDLGNBQVUsYUFBYSxtQkFBbUIsT0FBTztBQUtqRCxVQUFNLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLFNBQVMsQ0FBQztBQUNyRCxXQUFPLGFBQWEsZUFBZSxNQUFNO0FBQ3pDLFVBQU0sZ0JBQWdCLHVCQUF1QixjQUFjO0FBQzNELFFBQUksZUFBZTtBQUVsQixhQUFPLE1BQU0sWUFBWSxvQkFBb0IsT0FBTyxLQUFLLFVBQVUsYUFBYSxDQUFDLEdBQUc7QUFBQSxJQUNyRjtBQUdBLFVBQU0sY0FBYyxJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUscUJBQXFCLENBQUM7QUFDdEUsZ0JBQVksYUFBYSxjQUFjLFNBQVMsb0JBQW9CLE9BQU8sQ0FBQztBQUM1RSxVQUFNLFlBQVksSUFBSSxPQUFPLGFBQWEsSUFBSSxFQUFFLFVBQVUsY0FBYyxRQUFRLEtBQUssQ0FBQyxDQUFDO0FBQ3ZGLGNBQVUsYUFBYSxlQUFlLE1BQU07QUFDNUMsZ0JBQVksSUFBSSxJQUFJLHNCQUFzQixhQUFhLFNBQVMsTUFBTTtBQUNyRSxXQUFLLGFBQWEsVUFBVSxJQUFJO0FBQUEsSUFDakMsQ0FBQyxDQUFDO0FBR0YsVUFBTSxPQUFPLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxPQUFPLENBQUM7QUFHakQsUUFBSSxPQUFPO0FBQ1YsWUFBTSxVQUFVLElBQUksT0FBTyxNQUFNLElBQUksRUFBRSxRQUFRLENBQUM7QUFDaEQsY0FBUSxjQUFjO0FBQUEsSUFDdkI7QUFHQSxVQUFNLFVBQVUsSUFBSSxPQUFPLE1BQU0sSUFBSSxFQUFFLFFBQVEsQ0FBQztBQUNoRCxZQUFRLEtBQUs7QUFDYixZQUFRLGNBQWMsU0FBUyxTQUFTLG9CQUFvQixjQUFjLEtBQUssZUFBZSxPQUFPO0FBR3JHLFFBQUksVUFBVSxRQUFRO0FBQ3JCLFlBQU0sT0FBTyxJQUFJLE9BQU8sTUFBTSxJQUFJLEVBQUUsV0FBVyxDQUFDO0FBQ2hELFdBQUssYUFBYSxRQUFRLE1BQU07QUFDaEMsaUJBQVcsV0FBVyxVQUFVO0FBQy9CLGNBQU0sTUFBTSxJQUFJLE9BQU8sTUFBTSxJQUFJLEVBQUUsVUFBVSxDQUFDO0FBQzlDLFlBQUksYUFBYSxRQUFRLFVBQVU7QUFDbkMsY0FBTSxTQUFTLElBQUksT0FBTyxLQUFLLElBQUksRUFBRSxlQUFlLENBQUM7QUFDckQsY0FBTSxTQUFTLFFBQVEsUUFBUSxRQUFRLFFBQVE7QUFDL0MsY0FBTSxZQUFZLFVBQVUsT0FBTyxNQUFNO0FBQ3pDLGVBQU8sVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsU0FBUyxDQUFDO0FBQzdELGVBQU8sYUFBYSxlQUFlLE1BQU07QUFDekMsY0FBTSxPQUFPLElBQUksT0FBTyxLQUFLLElBQUksRUFBRSxlQUFlLENBQUM7QUFDbkQsY0FBTSxlQUFlLElBQUksT0FBTyxNQUFNLElBQUksRUFBRSxnQkFBZ0IsQ0FBQztBQUM3RCxxQkFBYSxjQUFjLFFBQVE7QUFDbkMsY0FBTSxxQkFBcUIsSUFBSSxPQUFPLE1BQU0sSUFBSSxFQUFFLHNCQUFzQixDQUFDO0FBRXpFLGNBQU0sV0FBVyxZQUFZLElBQUksS0FBSyx3QkFBd0I7QUFBQSxVQUM3RCxJQUFJLGVBQWUsUUFBUSxhQUFhO0FBQUEsWUFDdkMsV0FBVztBQUFBLFlBQ1gsbUJBQW1CO0FBQUEsVUFDcEIsQ0FBQztBQUFBLFVBQ0Q7QUFBQSxZQUNDLGVBQWUsQ0FBQyxNQUFNLFVBQVU7QUFDL0IsbUNBQXFCLEtBQUssZUFBZSxNQUFNLE1BQU0sU0FBUztBQUM5RCxtQkFBSyxhQUFhLFVBQVUsSUFBSTtBQUFBLFlBQ2pDO0FBQUEsVUFDRDtBQUFBLFFBQUMsQ0FBQztBQUNILDJCQUFtQixZQUFZLFNBQVMsT0FBTztBQUFBLE1BQ2hEO0FBQUEsSUFDRCxXQUFXLFVBQVU7QUFDcEIsWUFBTSxvQkFBb0IsSUFBSSxPQUFPLE1BQU0sSUFBSSxFQUFFLGtCQUFrQixDQUFDO0FBQ3BFLFlBQU0sV0FBVyxZQUFZLElBQUksS0FBSyx3QkFBd0I7QUFBQSxRQUM3RCxJQUFJLGVBQWUsVUFBVTtBQUFBLFVBQzVCLFdBQVc7QUFBQSxVQUNYLGFBQWE7QUFBQSxVQUNiLG1CQUFtQjtBQUFBLFFBQ3BCLENBQUM7QUFBQSxRQUNEO0FBQUEsVUFDQyxlQUFlLENBQUMsTUFBTSxVQUFVO0FBQy9CLGlDQUFxQixLQUFLLGVBQWUsTUFBTSxNQUFNLFNBQVM7QUFDOUQsaUJBQUssYUFBYSxVQUFVLElBQUk7QUFBQSxVQUNqQztBQUFBLFFBQ0Q7QUFBQSxNQUFDLENBQUM7QUFDSCx3QkFBa0IsWUFBWSxTQUFTLE9BQU87QUFBQSxJQUMvQztBQUdBLFFBQUksU0FBUyxRQUFRO0FBQ3BCLFlBQU0sWUFBWSxJQUFJLE9BQU8sTUFBTSxJQUFJLEVBQUUsYUFBYSxDQUFDO0FBQ3ZELFlBQU0saUJBQWlCLFFBQVEsV0FBVztBQUMxQyxVQUFJLGdCQUFnQjtBQUVwQixpQkFBVyxFQUFFLE9BQU8sT0FBTyxXQUFXLEtBQUssS0FBSyxTQUFTO0FBQ3hELGNBQU0sU0FBUyxJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsUUFBUSxDQUFDO0FBQ3BELGVBQU8sY0FBYztBQUVyQixZQUFJLFVBQVUsYUFBYTtBQUMxQixpQkFBTyxVQUFVLElBQUkseUJBQXlCO0FBQzlDLGNBQUksQ0FBQyxpQkFBaUIsUUFBUSxTQUFTLEdBQUc7QUFDekMsbUJBQU8sVUFBVSxJQUFJLGlDQUFpQztBQUN0RCw0QkFBZ0I7QUFBQSxVQUNqQjtBQUFBLFFBQ0QsT0FBTztBQUNOLGlCQUFPLFVBQVUsSUFBSSx1QkFBdUI7QUFBQSxRQUM3QztBQUVBLFlBQUksZ0JBQWdCO0FBQ25CLGlCQUFPLFVBQVUsSUFBSSwwQkFBMEI7QUFBQSxRQUNoRDtBQUVBLG9CQUFZLElBQUksSUFBSSxzQkFBc0IsUUFBUSxTQUFTLE1BQU07QUFDaEUsZUFBSyxpQkFBaUI7QUFBQSxZQUNyQjtBQUFBLFlBQ0EsRUFBRSxJQUFJLFdBQVcsTUFBTSxtQkFBbUI7QUFBQSxVQUMzQztBQUVBLGVBQUssS0FBSyxlQUFlLGVBQWUsV0FBVyxHQUFJLFFBQVEsQ0FBQyxDQUFFO0FBQ2xFLGVBQUssYUFBYSxVQUFVLElBQUk7QUFBQSxRQUNqQyxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxzQkFBK0I7QUFDdEMsUUFBSTtBQUNKLFFBQUk7QUFDSCxhQUFPLEtBQUssZUFBZSxVQUFVLHdCQUF3QixhQUFhLFdBQVc7QUFBQSxJQUN0RixRQUFRO0FBQUEsSUFBRTtBQUVWLFVBQU0sS0FBd0I7QUFBQSxNQUM3QixTQUFTLEtBQUssZUFBZTtBQUFBLE1BQzdCLFFBQVEsS0FBSyxlQUFlO0FBQUEsTUFDNUIsV0FBVyxLQUFLLElBQUk7QUFBQSxJQUNyQjtBQUVBLFFBQUksTUFBTSxXQUFXLEdBQUcsUUFBUTtBQUMvQixhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssZUFBZSxNQUFNLHdCQUF3QixLQUFLLFVBQVUsRUFBRSxHQUFHLGFBQWEsYUFBYSxjQUFjLE9BQU87QUFFckgsUUFBSSxNQUFNO0FBQ1QsYUFBTywwQkFBMEIsS0FBSyxTQUFTLEdBQUcsT0FBTztBQUFBLElBQzFEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXpQYSw2QkFFRyxZQUFZO0FBRmYsK0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZlU7QUErUGIsU0FBUyx1QkFBdUIsT0FBK0M7QUFDOUUsTUFBSSxDQUFDLE9BQU87QUFDWCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUk7QUFDSCxVQUFNLE1BQU0sSUFBSSxNQUFNLE9BQU8sSUFBSTtBQUNqQyxRQUFJLElBQUksV0FBVyxTQUFTO0FBQzNCLGFBQU8sSUFBSSxTQUFTLElBQUk7QUFBQSxJQUN6QjtBQUNBLFFBQUksSUFBSSxXQUFXLFVBQVUsWUFBWSxLQUFLLElBQUksSUFBSSxHQUFHO0FBQ3hELGFBQU8sSUFBSSxTQUFTLElBQUk7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsUUFBUTtBQUFBLEVBRVI7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
