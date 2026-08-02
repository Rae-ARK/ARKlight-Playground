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
import "./media/mcpServerEditor.css";
import { $, append, clearNode, setParentFlowTo } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action } from "../../../../base/common/actions.js";
import * as arrays from "../../../../base/common/arrays.js";
import { Cache } from "../../../../base/common/cache.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap } from "../../../../editor/common/languages/supports/tokenization.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { DEFAULT_MARKDOWN_STYLES, renderMarkdownDocument } from "../../markdown/browser/markdownDocumentRenderer.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IMcpWorkbenchService, McpServerContainers, McpServerInstallState } from "../common/mcpTypes.js";
import { StarredWidget, McpServerIconWidget, McpServerStatusWidget, McpServerWidget, onClick, PublisherWidget, McpServerScopeBadgeWidget, LicenseWidget } from "./mcpServerWidgets.js";
import { ButtonWithDropDownExtensionAction, ButtonWithDropdownExtensionActionViewItem, DisableMcpDropDownAction, DropDownAction, EnableMcpDropDownAction, InstallAction, InstallingLabelAction, InstallInRemoteAction, InstallInWorkspaceAction, ManageMcpServerAction, McpServerStatusAction, UninstallAction } from "./mcpServerActions.js";
import { McpServerType } from "../../../../platform/mcp/common/mcpPlatformTypes.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { getMcpGalleryManifestResourceUri, IMcpGalleryManifestService, McpGalleryResourceType } from "../../../../platform/mcp/common/mcpGalleryManifest.js";
import { fromNow } from "../../../../base/common/date.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
var McpServerEditorTab = /* @__PURE__ */ ((McpServerEditorTab2) => {
  McpServerEditorTab2["Readme"] = "readme";
  McpServerEditorTab2["Configuration"] = "configuration";
  McpServerEditorTab2["Manifest"] = "manifest";
  return McpServerEditorTab2;
})(McpServerEditorTab || {});
class NavBar extends Disposable {
  constructor(container) {
    super();
    this._onChange = this._register(new Emitter());
    this._currentId = null;
    const element = append(container, $(".navbar"));
    this.actions = [];
    this.actionbar = this._register(new ActionBar(element));
  }
  get onChange() {
    return this._onChange.event;
  }
  get currentId() {
    return this._currentId;
  }
  push(id, label, tooltip, index) {
    const action = new Action(id, label, void 0, true, () => this.update(id, true));
    action.tooltip = tooltip;
    if (typeof index === "number") {
      this.actions.splice(index, 0, action);
    } else {
      this.actions.push(action);
    }
    this.actionbar.push(action, { index });
    if (this.actions.length === 1) {
      this.update(id);
    }
  }
  remove(id) {
    const index = this.actions.findIndex((action) => action.id === id);
    if (index !== -1) {
      this.actions.splice(index, 1);
      this.actionbar.pull(index);
      if (this._currentId === id) {
        this.switch(this.actions[0]?.id);
      }
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
  has(id) {
    return this.actions.some((action) => action.id === id);
  }
  update(id, focus) {
    this._currentId = id;
    this._onChange.fire({ id, focus: !!focus });
    this.actions.forEach((a) => a.checked = a.id === id);
  }
}
var WebviewIndex = /* @__PURE__ */ ((WebviewIndex2) => {
  WebviewIndex2[WebviewIndex2["Readme"] = 0] = "Readme";
  WebviewIndex2[WebviewIndex2["Changelog"] = 1] = "Changelog";
  return WebviewIndex2;
})(WebviewIndex || {});
let McpServerEditor = class extends EditorPane {
  constructor(group, telemetryService, instantiationService, themeService, notificationService, openerService, storageService, extensionService, webviewService, languageService, contextKeyService, mcpWorkbenchService, hoverService, contextMenuService) {
    super(McpServerEditor.ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.extensionService = extensionService;
    this.webviewService = webviewService;
    this.languageService = languageService;
    this.contextKeyService = contextKeyService;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.hoverService = hoverService;
    this.contextMenuService = contextMenuService;
    this._scopedContextKeyService = this._register(new MutableDisposable());
    // Some action bar items use a webview whose vertical scroll position we track in this map
    this.initialScrollProgress = /* @__PURE__ */ new Map();
    // Spot when an ExtensionEditor instance gets reused for a different extension, in which case the vertical scroll positions must be zeroed
    this.currentIdentifier = "";
    this.layoutParticipants = [];
    this.contentDisposables = this._register(new DisposableStore());
    this.transientDisposables = this._register(new DisposableStore());
    this.activeElement = null;
    this.mcpServerReadme = null;
    this.mcpServerManifest = null;
  }
  get scopedContextKeyService() {
    return this._scopedContextKeyService.value;
  }
  createEditor(parent) {
    const root = append(parent, $(".extension-editor.mcp-server-editor"));
    this._scopedContextKeyService.value = this.contextKeyService.createScoped(root);
    this._scopedContextKeyService.value.createKey("inExtensionEditor", true);
    root.tabIndex = 0;
    root.style.outline = "none";
    root.setAttribute("role", "document");
    const header = append(root, $(".header"));
    const iconContainer = append(header, $(".icon-container"));
    const iconWidget = this.instantiationService.createInstance(McpServerIconWidget, iconContainer);
    const scopeWidget = this.instantiationService.createInstance(McpServerScopeBadgeWidget, iconContainer);
    const details = append(header, $(".details"));
    const title = append(details, $(".title"));
    const name = append(title, $("span.name.clickable", { role: "heading", tabIndex: 0 }));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), name, localize("name", "Extension name")));
    const subtitle = append(details, $(".subtitle"));
    const subTitleEntryContainers = [];
    const publisherContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(publisherContainer);
    const publisherWidget = this.instantiationService.createInstance(PublisherWidget, publisherContainer, false);
    const starredContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(starredContainer);
    const installCountWidget = this.instantiationService.createInstance(StarredWidget, starredContainer, false);
    const licenseContainer = append(subtitle, $(".subtitle-entry"));
    subTitleEntryContainers.push(licenseContainer);
    const licenseWidget = this.instantiationService.createInstance(LicenseWidget, licenseContainer);
    const widgets = [
      iconWidget,
      publisherWidget,
      installCountWidget,
      scopeWidget,
      licenseWidget
    ];
    const description = append(details, $(".description"));
    const actions = [
      this.instantiationService.createInstance(InstallAction, false),
      this.instantiationService.createInstance(InstallingLabelAction),
      this.instantiationService.createInstance(ButtonWithDropDownExtensionAction, "extensions.uninstall", UninstallAction.CLASS, [
        [
          this.instantiationService.createInstance(UninstallAction),
          this.instantiationService.createInstance(InstallInWorkspaceAction, false),
          this.instantiationService.createInstance(InstallInRemoteAction, false)
        ]
      ]),
      this.instantiationService.createInstance(EnableMcpDropDownAction),
      this.instantiationService.createInstance(DisableMcpDropDownAction),
      this.instantiationService.createInstance(ManageMcpServerAction, true)
    ];
    const actionsAndStatusContainer = append(details, $(".actions-status-container.mcp-server-actions"));
    const actionBar = this._register(new ActionBar(actionsAndStatusContainer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof DropDownAction) {
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
        return void 0;
      },
      focusOnlyEnabledItems: true
    }));
    actionBar.push(actions, { icon: true, label: true });
    actionBar.setFocusable(true);
    this._register(Event.any(...actions.map((a) => Event.filter(a.onDidChange, (e) => e.enabled !== void 0)))(() => {
      actionBar.setFocusable(false);
      actionBar.setFocusable(true);
    }));
    const otherContainers = [];
    const mcpServerStatusAction = this.instantiationService.createInstance(McpServerStatusAction);
    const mcpServerStatusWidget = this._register(this.instantiationService.createInstance(McpServerStatusWidget, append(actionsAndStatusContainer, $(".status")), mcpServerStatusAction));
    this._register(Event.any(mcpServerStatusWidget.onDidRender)(() => {
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }));
    otherContainers.push(mcpServerStatusAction, new class extends McpServerWidget {
      render() {
        actionsAndStatusContainer.classList.toggle("list-layout", this.mcpServer?.installState === McpServerInstallState.Installed);
      }
    }());
    const mcpServerContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets, ...otherContainers]);
    for (const disposable of [...actions, ...widgets, ...otherContainers, mcpServerContainers]) {
      this._register(disposable);
    }
    const onError = Event.chain(
      actionBar.onDidRun,
      ($2) => $2.map(({ error }) => error).filter((error) => !!error)
    );
    this._register(onError(this.onError, this));
    const body = append(root, $(".body"));
    const navbar = new NavBar(body);
    const content = append(body, $(".content"));
    content.id = generateUuid();
    this.template = {
      content,
      description,
      header,
      name,
      navbar,
      actionsAndStatusContainer,
      actionBar,
      set mcpServer(mcpServer) {
        mcpServerContainers.mcpServer = mcpServer;
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
      }
    };
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (this.template) {
      await this.render(input.mcpServer, this.template, !!options?.preserveFocus);
    }
  }
  async render(mcpServer, template, preserveFocus) {
    this.activeElement = null;
    this.transientDisposables.clear();
    const token = this.transientDisposables.add(new CancellationTokenSource()).token;
    this.mcpServerReadme = new Cache(() => mcpServer.getReadme(token));
    this.mcpServerManifest = new Cache(() => mcpServer.getManifest(token));
    template.mcpServer = mcpServer;
    template.name.textContent = mcpServer.label;
    template.name.classList.toggle("clickable", !!mcpServer.gallery?.webUrl);
    template.description.textContent = mcpServer.description;
    if (mcpServer.gallery?.webUrl) {
      this.transientDisposables.add(onClick(template.name, () => this.openerService.open(URI.parse(mcpServer.gallery?.webUrl))));
    }
    this.renderNavbar(mcpServer, template, preserveFocus);
  }
  setOptions(options) {
    super.setOptions(options);
    if (options?.tab) {
      this.template?.navbar.switch(options.tab);
    }
  }
  renderNavbar(extension, template, preserveFocus) {
    template.content.innerText = "";
    template.navbar.clear();
    if (this.currentIdentifier !== extension.id) {
      this.initialScrollProgress.clear();
      this.currentIdentifier = extension.id;
    }
    if (extension.readmeUrl || extension.gallery?.readme) {
      template.navbar.push("readme" /* Readme */, localize("details", "Details"), localize("detailstooltip", "Extension details, rendered from the extension's 'README.md' file"));
    }
    if (extension.gallery || extension.local?.manifest) {
      template.navbar.push("manifest" /* Manifest */, localize("manifest", "Manifest"), localize("manifesttooltip", "Server manifest details"));
    }
    if (extension.config) {
      template.navbar.push("configuration" /* Configuration */, localize("configuration", "Configuration"), localize("configurationtooltip", "Server configuration details"));
    }
    this.transientDisposables.add(this.mcpWorkbenchService.onChange((e) => {
      if (e === extension) {
        if (e.config && !template.navbar.has("configuration" /* Configuration */)) {
          template.navbar.push("configuration" /* Configuration */, localize("configuration", "Configuration"), localize("configurationtooltip", "Server configuration details"), extension.readmeUrl ? 1 : 0);
        }
        if (!e.config && template.navbar.has("configuration" /* Configuration */)) {
          template.navbar.remove("configuration" /* Configuration */);
        }
      }
    }));
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
    switch (id) {
      case "configuration" /* Configuration */:
        return this.openConfiguration(extension, template, token);
      case "readme" /* Readme */:
        return this.openDetails(extension, template, token);
      case "manifest" /* Manifest */:
        return extension.readmeUrl ? this.openManifest(extension, template.content, token) : this.openManifestWithAdditionalDetails(extension, template, token);
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
      const removeLayoutParticipant = arrays.insert(this.layoutParticipants, {
        layout: () => {
          webview.setAnchorElement(container);
        }
      });
      this.contentDisposables.add(toDisposable(removeLayoutParticipant));
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
    const content = await renderMarkdownDocument(contents, this.extensionService, this.languageService, {}, token);
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
  async openDetails(extension, template, token) {
    const details = append(template.content, $(".details"));
    const readmeContainer = append(details, $(".content-container"));
    const additionalDetailsContainer = append(details, $(".additional-details-container"));
    const layout = () => details.classList.toggle("narrow", this.dimension && this.dimension.width < 500);
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    const activeElement = await this.openMarkdown(extension, this.mcpServerReadme.get(), localize("noReadme", "No README available."), readmeContainer, 0 /* Readme */, localize("Readme title", "Readme"), token);
    this.renderAdditionalDetails(additionalDetailsContainer, extension);
    return activeElement;
  }
  async openConfiguration(mcpServer, template, token) {
    const configContainer = append(template.content, $(".configuration"));
    const content = $("div", { class: "configuration-content" });
    this.renderConfigurationDetails(content, mcpServer);
    const scrollableContent = new DomScrollableElement(content, {});
    const layout = () => scrollableContent.scanDomNode();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    append(configContainer, scrollableContent.getDomNode());
    return { focus: () => content.focus() };
  }
  async openManifestWithAdditionalDetails(mcpServer, template, token) {
    const details = append(template.content, $(".details"));
    const readmeContainer = append(details, $(".content-container"));
    const additionalDetailsContainer = append(details, $(".additional-details-container"));
    const layout = () => details.classList.toggle("narrow", this.dimension && this.dimension.width < 500);
    layout();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    const activeElement = await this.openManifest(mcpServer, readmeContainer, token);
    this.renderAdditionalDetails(additionalDetailsContainer, mcpServer);
    return activeElement;
  }
  async openManifest(mcpServer, parent, token) {
    const manifestContainer = append(parent, $(".manifest"));
    const content = $("div", { class: "manifest-content" });
    try {
      const manifest = await this.loadContents(() => this.mcpServerManifest.get(), content);
      if (token.isCancellationRequested) {
        return null;
      }
      this.renderManifestDetails(content, manifest);
    } catch (error) {
      while (content.firstChild) {
        content.removeChild(content.firstChild);
      }
      const noManifestMessage = append(content, $(".no-manifest"));
      noManifestMessage.textContent = localize("noManifest", "No manifest available for this MCP server.");
    }
    const scrollableContent = new DomScrollableElement(content, {});
    const layout = () => scrollableContent.scanDomNode();
    this.contentDisposables.add(toDisposable(arrays.insert(this.layoutParticipants, { layout })));
    append(manifestContainer, scrollableContent.getDomNode());
    return { focus: () => content.focus() };
  }
  renderConfigurationDetails(container, mcpServer) {
    clearNode(container);
    const config = mcpServer.config;
    if (!config) {
      const noConfigMessage = append(container, $(".no-config"));
      noConfigMessage.textContent = localize("noConfig", "No configuration available for this MCP server.");
      return;
    }
    const nameSection = append(container, $(".config-section"));
    const nameLabel = append(nameSection, $(".config-label"));
    nameLabel.textContent = localize("serverName", "Name:");
    const nameValue = append(nameSection, $(".config-value"));
    nameValue.textContent = mcpServer.name;
    const typeSection = append(container, $(".config-section"));
    const typeLabel = append(typeSection, $(".config-label"));
    typeLabel.textContent = localize("serverType", "Type:");
    const typeValue = append(typeSection, $(".config-value"));
    typeValue.textContent = config.type;
    if (config.type === McpServerType.LOCAL) {
      const commandSection = append(container, $(".config-section"));
      const commandLabel = append(commandSection, $(".config-label"));
      commandLabel.textContent = localize("command", "Command:");
      const commandValue = append(commandSection, $("code.config-value"));
      commandValue.textContent = config.command;
      if (config.args && config.args.length > 0) {
        const argsSection = append(container, $(".config-section"));
        const argsLabel = append(argsSection, $(".config-label"));
        argsLabel.textContent = localize("arguments", "Arguments:");
        const argsValue = append(argsSection, $("code.config-value"));
        argsValue.textContent = config.args.join(" ");
      }
      if (config.env && Object.keys(config.env).length > 0) {
        const envSection = append(container, $(".config-section"));
        const envLabel = append(envSection, $(".config-label"));
        envLabel.textContent = localize("environment", "Environment:");
        const envValue = append(envSection, $(".config-value"));
        for (const [key, value] of Object.entries(config.env)) {
          append(envValue, $("code.env-entry", void 0, `${key}=${value ?? ""}`));
        }
      }
      if (config.envFile) {
        const envFileSection = append(container, $(".config-section"));
        const envFileLabel = append(envFileSection, $(".config-label"));
        envFileLabel.textContent = localize("envFile", "Environment File:");
        const envFileValue = append(envFileSection, $("code.config-value"));
        envFileValue.textContent = config.envFile;
      }
    } else if (config.type === McpServerType.REMOTE) {
      const urlSection = append(container, $(".config-section"));
      const urlLabel = append(urlSection, $(".config-label"));
      urlLabel.textContent = localize("url", "URL:");
      const urlValue = append(urlSection, $("code.config-value"));
      urlValue.textContent = config.url;
      if (config.headers && Object.keys(config.headers).length > 0) {
        const headersSection = append(container, $(".config-section"));
        const headersLabel = append(headersSection, $(".config-label"));
        headersLabel.textContent = localize("headers", "Headers:");
        const headersValue = append(headersSection, $(".config-value"));
        for (const [key, value] of Object.entries(config.headers)) {
          append(headersValue, $("code.env-entry", void 0, `${key}: ${value ?? ""}`));
        }
      }
    }
  }
  renderManifestDetails(container, manifest) {
    clearNode(container);
    if (manifest.packages && manifest.packages.length > 0) {
      const packagesByType = /* @__PURE__ */ new Map();
      for (const pkg of manifest.packages) {
        const type = pkg.registryType;
        let packages = packagesByType.get(type);
        if (!packages) {
          packagesByType.set(type, packages = []);
        }
        packages.push(pkg);
      }
      append(container, $(".manifest-section", void 0, $(".manifest-section-title", void 0, localize("packages", "Packages"))));
      for (const [packageType, packages] of packagesByType) {
        const packageSection = append(container, $(".package-section", void 0, $(".package-section-title", void 0, packageType.toUpperCase())));
        const packagesGrid = append(packageSection, $(".package-details"));
        for (let i = 0; i < packages.length; i++) {
          const pkg = packages[i];
          append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("packageName", "Package:")), $(".detail-value", void 0, pkg.identifier)));
          if (pkg.packageArguments && pkg.packageArguments.length > 0) {
            const argStrings = [];
            for (const arg of pkg.packageArguments) {
              if (arg.type === "named") {
                argStrings.push(arg.name);
                if (arg.value) {
                  argStrings.push(arg.value);
                }
              }
              if (arg.type === "positional") {
                const val = arg.value ?? arg.valueHint;
                if (val) {
                  argStrings.push(val);
                }
              }
            }
            append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("packagearguments", "Package Arguments:")), $("code.detail-value", void 0, argStrings.join(" "))));
          }
          if (pkg.runtimeArguments && pkg.runtimeArguments.length > 0) {
            const argStrings = [];
            for (const arg of pkg.runtimeArguments) {
              if (arg.type === "named") {
                argStrings.push(arg.name);
                if (arg.value) {
                  argStrings.push(arg.value);
                }
              }
              if (arg.type === "positional") {
                const val = arg.value ?? arg.valueHint;
                if (val) {
                  argStrings.push(val);
                }
              }
            }
            append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("runtimeargs", "Runtime Arguments:")), $("code.detail-value", void 0, argStrings.join(" "))));
          }
          if (pkg.environmentVariables && pkg.environmentVariables.length > 0) {
            const envStrings = pkg.environmentVariables.map((envVar) => `${envVar.name}=${envVar.value ?? ""}`);
            append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("environmentVariables", "Environment Variables:")), $("code.detail-value", void 0, envStrings.join(" "))));
          }
          if (i < packages.length - 1) {
            append(packagesGrid, $(".package-separator"));
          }
        }
      }
    }
    if (manifest.remotes && manifest.remotes.length > 0) {
      const packageSection = append(container, $(".package-section", void 0, $(".package-section-title", void 0, localize("remotes", "Remote").toLocaleUpperCase())));
      for (const remote of manifest.remotes) {
        const packagesGrid = append(packageSection, $(".package-details"));
        append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("url", "URL:")), $(".detail-value", void 0, remote.url)));
        if (remote.type) {
          append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("transport", "Transport:")), $(".detail-value", void 0, remote.type)));
        }
        if (remote.headers && remote.headers.length > 0) {
          const headerStrings = remote.headers.map((header) => `${header.name}: ${header.value ?? ""}`);
          append(packagesGrid, $(".package-detail", void 0, $(".detail-label", void 0, localize("headers", "Headers:")), $(".detail-value", void 0, headerStrings.join(", "))));
        }
      }
    }
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
McpServerEditor.ID = "workbench.editor.mcpServer";
McpServerEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IWebviewService),
  __decorateParam(9, ILanguageService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IMcpWorkbenchService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, IContextMenuService)
], McpServerEditor);
let AdditionalDetailsWidget = class extends Disposable {
  constructor(container, extension, mcpGalleryManifestService, hoverService, openerService) {
    super();
    this.container = container;
    this.mcpGalleryManifestService = mcpGalleryManifestService;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.disposables = this._register(new DisposableStore());
    this.render(extension);
    this._register(this.mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => this.render(extension)));
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
    this.renderTags(this.container, extension);
    this.renderExtensionResources(this.container, extension);
  }
  renderTags(container, extension) {
    if (extension.gallery?.topics?.length) {
      const categoriesContainer = append(container, $(".categories-container.additional-details-element"));
      append(categoriesContainer, $(".additional-details-title", void 0, localize("tags", "Tags")));
      const categoriesElement = append(categoriesContainer, $(".categories"));
      for (const category of extension.gallery.topics) {
        append(categoriesElement, $("span.category", { tabindex: "0" }, category));
      }
    }
  }
  async renderExtensionResources(container, extension) {
    const resources = [];
    const manifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    if (extension.repository) {
      try {
        resources.push([localize("repository", "Repository"), ThemeIcon.fromId(Codicon.repo.id), URI.parse(extension.repository)]);
      } catch (error) {
      }
    }
    if (manifest) {
      const supportUri = getMcpGalleryManifestResourceUri(manifest, McpGalleryResourceType.ContactSupportUri);
      if (supportUri) {
        try {
          resources.push([localize("support", "Contact Support"), ThemeIcon.fromId(Codicon.commentDiscussion.id), URI.parse(supportUri)]);
        } catch (error) {
        }
      }
    }
    if (resources.length) {
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
        $("code", void 0, extension.name)
      )
    );
    if (extension.version) {
      append(
        installInfo,
        $(
          ".more-info-entry",
          void 0,
          $("div.more-info-entry-name", void 0, localize("Version", "Version")),
          $("code", void 0, extension.version)
        )
      );
    }
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
            $("code", void 0, extension.name)
          )
        );
        if (gallery.version) {
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
      }
      if (gallery.lastUpdated) {
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("last updated", "Last Released")),
            $("div", {
              "title": new Date(gallery.lastUpdated).toString()
            }, fromNow(gallery.lastUpdated, true, true, true))
          )
        );
      }
      if (gallery.publishDate) {
        append(
          moreInfo,
          $(
            ".more-info-entry",
            void 0,
            $("div.more-info-entry-name", void 0, localize("published", "Published")),
            $("div", {
              "title": new Date(gallery.publishDate).toString()
            }, fromNow(gallery.publishDate, true, true, true))
          )
        );
      }
    }
  }
};
AdditionalDetailsWidget = __decorateClass([
  __decorateParam(2, IMcpGalleryManifestService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IOpenerService)
], AdditionalDetailsWidget);
export {
  McpServerEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFNlcnZlckVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9tY3BTZXJ2ZXJFZGl0b3IuY3NzJztcbmltcG9ydCB7ICQsIERpbWVuc2lvbiwgYXBwZW5kLCBjbGVhck5vZGUsIHNldFBhcmVudEZsb3dUbyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYWNoZSwgQ2FjaGVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYWNoZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzLCBtYXRjaGVzU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX01BUktET1dOX1NUWUxFUywgcmVuZGVyTWFya2Rvd25Eb2N1bWVudCB9IGZyb20gJy4uLy4uL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25Eb2N1bWVudFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElXZWJ2aWV3LCBJV2Vidmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2ZXJDb250YWluZXIsIElNY3BTZXJ2ZXJFZGl0b3JPcHRpb25zLCBJTWNwV29ya2JlbmNoU2VydmljZSwgSVdvcmtiZW5jaE1jcFNlcnZlciwgTWNwU2VydmVyQ29udGFpbmVycywgTWNwU2VydmVySW5zdGFsbFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IFN0YXJyZWRXaWRnZXQsIE1jcFNlcnZlckljb25XaWRnZXQsIE1jcFNlcnZlclN0YXR1c1dpZGdldCwgTWNwU2VydmVyV2lkZ2V0LCBvbkNsaWNrLCBQdWJsaXNoZXJXaWRnZXQsIE1jcFNlcnZlclNjb3BlQmFkZ2VXaWRnZXQsIExpY2Vuc2VXaWRnZXQgfSBmcm9tICcuL21jcFNlcnZlcldpZGdldHMuanMnO1xuaW1wb3J0IHsgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uLCBCdXR0b25XaXRoRHJvcGRvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbSwgRGlzYWJsZU1jcERyb3BEb3duQWN0aW9uLCBEcm9wRG93bkFjdGlvbiwgRW5hYmxlTWNwRHJvcERvd25BY3Rpb24sIEluc3RhbGxBY3Rpb24sIEluc3RhbGxpbmdMYWJlbEFjdGlvbiwgSW5zdGFsbEluUmVtb3RlQWN0aW9uLCBJbnN0YWxsSW5Xb3Jrc3BhY2VBY3Rpb24sIE1hbmFnZU1jcFNlcnZlckFjdGlvbiwgTWNwU2VydmVyU3RhdHVzQWN0aW9uLCBVbmluc3RhbGxBY3Rpb24gfSBmcm9tICcuL21jcFNlcnZlckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyRWRpdG9ySW5wdXQgfSBmcm9tICcuL21jcFNlcnZlckVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElMb2NhbE1jcFNlcnZlciwgSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uLCBJTWNwU2VydmVyUGFja2FnZSwgSU1jcFNlcnZlcktleVZhbHVlSW5wdXQsIFJlZ2lzdHJ5VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdldE1jcEdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpLCBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSwgTWNwR2FsbGVyeVJlc291cmNlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IGZyb21Ob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcblxuY29uc3QgZW51bSBNY3BTZXJ2ZXJFZGl0b3JUYWIge1xuXHRSZWFkbWUgPSAncmVhZG1lJyxcblx0Q29uZmlndXJhdGlvbiA9ICdjb25maWd1cmF0aW9uJyxcblx0TWFuaWZlc3QgPSAnbWFuaWZlc3QnLFxufVxuXG5jbGFzcyBOYXZCYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9vbkNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IHN0cmluZyB8IG51bGw7IGZvY3VzOiBib29sZWFuIH0+KCkpO1xuXHRnZXQgb25DaGFuZ2UoKTogRXZlbnQ8eyBpZDogc3RyaW5nIHwgbnVsbDsgZm9jdXM6IGJvb2xlYW4gfT4geyByZXR1cm4gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7IH1cblxuXHRwcml2YXRlIF9jdXJyZW50SWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRnZXQgY3VycmVudElkKCk6IHN0cmluZyB8IG51bGwgeyByZXR1cm4gdGhpcy5fY3VycmVudElkOyB9XG5cblx0cHJpdmF0ZSBhY3Rpb25zOiBBY3Rpb25bXTtcblx0cHJpdmF0ZSBhY3Rpb25iYXI6IEFjdGlvbkJhcjtcblxuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm5hdmJhcicpKTtcblx0XHR0aGlzLmFjdGlvbnMgPSBbXTtcblx0XHR0aGlzLmFjdGlvbmJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIoZWxlbWVudCkpO1xuXHR9XG5cblx0cHVzaChpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0b29sdGlwOiBzdHJpbmcsIGluZGV4PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbihpZCwgbGFiZWwsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy51cGRhdGUoaWQsIHRydWUpKTtcblxuXHRcdGFjdGlvbi50b29sdGlwID0gdG9vbHRpcDtcblxuXHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnMuc3BsaWNlKGluZGV4LCAwLCBhY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLmFjdGlvbmJhci5wdXNoKGFjdGlvbiwgeyBpbmRleCB9KTtcblxuXHRcdGlmICh0aGlzLmFjdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZShpZCk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuYWN0aW9ucy5maW5kSW5kZXgoYWN0aW9uID0+IGFjdGlvbi5pZCA9PT0gaWQpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuYWN0aW9ucy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0dGhpcy5hY3Rpb25iYXIucHVsbChpbmRleCk7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudElkID09PSBpZCkge1xuXHRcdFx0XHR0aGlzLnN3aXRjaCh0aGlzLmFjdGlvbnNbMF0/LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGlvbnMgPSBkaXNwb3NlKHRoaXMuYWN0aW9ucyk7XG5cdFx0dGhpcy5hY3Rpb25iYXIuY2xlYXIoKTtcblx0fVxuXG5cdHN3aXRjaChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5hY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5pZCA9PT0gaWQpO1xuXHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRoYXMoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmFjdGlvbnMuc29tZShhY3Rpb24gPT4gYWN0aW9uLmlkID09PSBpZCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZShpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50SWQgPSBpZDtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgaWQsIGZvY3VzOiAhIWZvY3VzIH0pO1xuXHRcdHRoaXMuYWN0aW9ucy5mb3JFYWNoKGEgPT4gYS5jaGVja2VkID0gYS5pZCA9PT0gaWQpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTGF5b3V0UGFydGljaXBhbnQge1xuXHRsYXlvdXQoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElBY3RpdmVFbGVtZW50IHtcblx0Zm9jdXMoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSB7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRkZXNjcmlwdGlvbjogSFRNTEVsZW1lbnQ7XG5cdGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0bmF2YmFyOiBOYXZCYXI7XG5cdGNvbnRlbnQ6IEhUTUxFbGVtZW50O1xuXHRoZWFkZXI6IEhUTUxFbGVtZW50O1xuXHRtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXI7XG59XG5cbmNvbnN0IGVudW0gV2Vidmlld0luZGV4IHtcblx0UmVhZG1lLFxuXHRDaGFuZ2Vsb2dcbn1cblxuZXhwb3J0IGNsYXNzIE1jcFNlcnZlckVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ3dvcmtiZW5jaC5lZGl0b3IubWNwU2VydmVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU2NvcGVkQ29udGV4dEtleVNlcnZpY2U+KCkpO1xuXHRwcml2YXRlIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBtY3BTZXJ2ZXJSZWFkbWU6IENhY2hlPHN0cmluZz4gfCBudWxsO1xuXHRwcml2YXRlIG1jcFNlcnZlck1hbmlmZXN0OiBDYWNoZTxJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24+IHwgbnVsbDtcblxuXHQvLyBTb21lIGFjdGlvbiBiYXIgaXRlbXMgdXNlIGEgd2VidmlldyB3aG9zZSB2ZXJ0aWNhbCBzY3JvbGwgcG9zaXRpb24gd2UgdHJhY2sgaW4gdGhpcyBtYXBcblx0cHJpdmF0ZSBpbml0aWFsU2Nyb2xsUHJvZ3Jlc3M6IE1hcDxXZWJ2aWV3SW5kZXgsIG51bWJlcj4gPSBuZXcgTWFwKCk7XG5cblx0Ly8gU3BvdCB3aGVuIGFuIEV4dGVuc2lvbkVkaXRvciBpbnN0YW5jZSBnZXRzIHJldXNlZCBmb3IgYSBkaWZmZXJlbnQgZXh0ZW5zaW9uLCBpbiB3aGljaCBjYXNlIHRoZSB2ZXJ0aWNhbCBzY3JvbGwgcG9zaXRpb25zIG11c3QgYmUgemVyb2VkXG5cdHByaXZhdGUgY3VycmVudElkZW50aWZpZXI6IHN0cmluZyA9ICcnO1xuXG5cdHByaXZhdGUgbGF5b3V0UGFydGljaXBhbnRzOiBJTGF5b3V0UGFydGljaXBhbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhbnNpZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIGFjdGl2ZUVsZW1lbnQ6IElBY3RpdmVFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgZGltZW5zaW9uOiBEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVdlYnZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2Vidmlld1NlcnZpY2U6IElXZWJ2aWV3U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1jcFdvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BXb3JrYmVuY2hTZXJ2aWNlOiBJTWNwV29ya2JlbmNoU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoTWNwU2VydmVyRWRpdG9yLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5tY3BTZXJ2ZXJSZWFkbWUgPSBudWxsO1xuXHRcdHRoaXMubWNwU2VydmVyTWFuaWZlc3QgPSBudWxsO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKCk6IElDb250ZXh0S2V5U2VydmljZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlLnZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgcm9vdCA9IGFwcGVuZChwYXJlbnQsICQoJy5leHRlbnNpb24tZWRpdG9yLm1jcC1zZXJ2ZXItZWRpdG9yJykpO1xuXHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlLnZhbHVlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQocm9vdCk7XG5cdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UudmFsdWUuY3JlYXRlS2V5KCdpbkV4dGVuc2lvbkVkaXRvcicsIHRydWUpO1xuXG5cdFx0cm9vdC50YWJJbmRleCA9IDA7IC8vIHRoaXMgaXMgcmVxdWlyZWQgZm9yIHRoZSBmb2N1cyB0cmFja2VyIG9uIHRoZSBlZGl0b3Jcblx0XHRyb290LnN0eWxlLm91dGxpbmUgPSAnbm9uZSc7XG5cdFx0cm9vdC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZG9jdW1lbnQnKTtcblx0XHRjb25zdCBoZWFkZXIgPSBhcHBlbmQocm9vdCwgJCgnLmhlYWRlcicpKTtcblxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSBhcHBlbmQoaGVhZGVyLCAkKCcuaWNvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaWNvbldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2VydmVySWNvbldpZGdldCwgaWNvbkNvbnRhaW5lcik7XG5cdFx0Y29uc3Qgc2NvcGVXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNlcnZlclNjb3BlQmFkZ2VXaWRnZXQsIGljb25Db250YWluZXIpO1xuXG5cdFx0Y29uc3QgZGV0YWlscyA9IGFwcGVuZChoZWFkZXIsICQoJy5kZXRhaWxzJykpO1xuXHRcdGNvbnN0IHRpdGxlID0gYXBwZW5kKGRldGFpbHMsICQoJy50aXRsZScpKTtcblx0XHRjb25zdCBuYW1lID0gYXBwZW5kKHRpdGxlLCAkKCdzcGFuLm5hbWUuY2xpY2thYmxlJywgeyByb2xlOiAnaGVhZGluZycsIHRhYkluZGV4OiAwIH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgbmFtZSwgbG9jYWxpemUoJ25hbWUnLCBcIkV4dGVuc2lvbiBuYW1lXCIpKSk7XG5cblx0XHRjb25zdCBzdWJ0aXRsZSA9IGFwcGVuZChkZXRhaWxzLCAkKCcuc3VidGl0bGUnKSk7XG5cdFx0Y29uc3Qgc3ViVGl0bGVFbnRyeUNvbnRhaW5lcnM6IEhUTUxFbGVtZW50W10gPSBbXTtcblxuXHRcdGNvbnN0IHB1Ymxpc2hlckNvbnRhaW5lciA9IGFwcGVuZChzdWJ0aXRsZSwgJCgnLnN1YnRpdGxlLWVudHJ5JykpO1xuXHRcdHN1YlRpdGxlRW50cnlDb250YWluZXJzLnB1c2gocHVibGlzaGVyQ29udGFpbmVyKTtcblx0XHRjb25zdCBwdWJsaXNoZXJXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFB1Ymxpc2hlcldpZGdldCwgcHVibGlzaGVyQ29udGFpbmVyLCBmYWxzZSk7XG5cblx0XHRjb25zdCBzdGFycmVkQ29udGFpbmVyID0gYXBwZW5kKHN1YnRpdGxlLCAkKCcuc3VidGl0bGUtZW50cnknKSk7XG5cdFx0c3ViVGl0bGVFbnRyeUNvbnRhaW5lcnMucHVzaChzdGFycmVkQ29udGFpbmVyKTtcblx0XHRjb25zdCBpbnN0YWxsQ291bnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YXJyZWRXaWRnZXQsIHN0YXJyZWRDb250YWluZXIsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGxpY2Vuc2VDb250YWluZXIgPSBhcHBlbmQoc3VidGl0bGUsICQoJy5zdWJ0aXRsZS1lbnRyeScpKTtcblx0XHRzdWJUaXRsZUVudHJ5Q29udGFpbmVycy5wdXNoKGxpY2Vuc2VDb250YWluZXIpO1xuXHRcdGNvbnN0IGxpY2Vuc2VXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpY2Vuc2VXaWRnZXQsIGxpY2Vuc2VDb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0czogTWNwU2VydmVyV2lkZ2V0W10gPSBbXG5cdFx0XHRpY29uV2lkZ2V0LFxuXHRcdFx0cHVibGlzaGVyV2lkZ2V0LFxuXHRcdFx0aW5zdGFsbENvdW50V2lkZ2V0LFxuXHRcdFx0c2NvcGVXaWRnZXQsXG5cdFx0XHRsaWNlbnNlV2lkZ2V0XG5cdFx0XTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYXBwZW5kKGRldGFpbHMsICQoJy5kZXNjcmlwdGlvbicpKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBbXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIGZhbHNlKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbGluZ0xhYmVsQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uLCAnZXh0ZW5zaW9ucy51bmluc3RhbGwnLCBVbmluc3RhbGxBY3Rpb24uQ0xBU1MsIFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5pbnN0YWxsQWN0aW9uKSxcblx0XHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxJbldvcmtzcGFjZUFjdGlvbiwgZmFsc2UpLFxuXHRcdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEluUmVtb3RlQWN0aW9uLCBmYWxzZSlcblx0XHRcdFx0XVxuXHRcdFx0XSksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZU1jcERyb3BEb3duQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZU1jcERyb3BEb3duQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFuYWdlTWNwU2VydmVyQWN0aW9uLCB0cnVlKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lciA9IGFwcGVuZChkZXRhaWxzLCAkKCcuYWN0aW9ucy1zdGF0dXMtY29udGFpbmVyLm1jcC1zZXJ2ZXItYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGFjdGlvbnNBbmRTdGF0dXNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIERyb3BEb3duQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGlvbi5jcmVhdGVBY3Rpb25WaWV3SXRlbShvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBCdXR0b25XaXRoRHJvcGRvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbShcblx0XHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdFx0aWNvbjogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHRydWUsXG5cdFx0XHRcdFx0XHRcdG1lbnVBY3Rpb25zT3JQcm92aWRlcjogeyBnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb24ubWVudUFjdGlvbnMgfSxcblx0XHRcdFx0XHRcdFx0bWVudUFjdGlvbkNsYXNzTmFtZXM6IGFjdGlvbi5tZW51QWN0aW9uQ2xhc3NOYW1lc1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGZvY3VzT25seUVuYWJsZWRJdGVtczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0YWN0aW9uQmFyLnNldEZvY3VzYWJsZSh0cnVlKTtcblx0XHQvLyB1cGRhdGUgZm9jdXNhYmxlIGVsZW1lbnRzIHdoZW4gdGhlIGVuYWJsZW1lbnQgb2YgYW4gYWN0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoLi4uYWN0aW9ucy5tYXAoYSA9PiBFdmVudC5maWx0ZXIoYS5vbkRpZENoYW5nZSwgZSA9PiBlLmVuYWJsZWQgIT09IHVuZGVmaW5lZCkpKSgoKSA9PiB7XG5cdFx0XHRhY3Rpb25CYXIuc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHRcdGFjdGlvbkJhci5zZXRGb2N1c2FibGUodHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgb3RoZXJDb250YWluZXJzOiBJTWNwU2VydmVyQ29udGFpbmVyW10gPSBbXTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJTdGF0dXNBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNlcnZlclN0YXR1c0FjdGlvbik7XG5cdFx0Y29uc3QgbWNwU2VydmVyU3RhdHVzV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTZXJ2ZXJTdGF0dXNXaWRnZXQsIGFwcGVuZChhY3Rpb25zQW5kU3RhdHVzQ29udGFpbmVyLCAkKCcuc3RhdHVzJykpLCBtY3BTZXJ2ZXJTdGF0dXNBY3Rpb24pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkobWNwU2VydmVyU3RhdHVzV2lkZ2V0Lm9uRGlkUmVuZGVyKSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdG90aGVyQ29udGFpbmVycy5wdXNoKG1jcFNlcnZlclN0YXR1c0FjdGlvbiwgbmV3IGNsYXNzIGV4dGVuZHMgTWNwU2VydmVyV2lkZ2V0IHtcblx0XHRcdHJlbmRlcigpIHtcblx0XHRcdFx0YWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdsaXN0LWxheW91dCcsIHRoaXMubWNwU2VydmVyPy5pbnN0YWxsU3RhdGUgPT09IE1jcFNlcnZlckluc3RhbGxTdGF0ZS5JbnN0YWxsZWQpO1xuXHRcdFx0fVxuXHRcdH0oKSk7XG5cblx0XHRjb25zdCBtY3BTZXJ2ZXJDb250YWluZXJzOiBNY3BTZXJ2ZXJDb250YWluZXJzID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTZXJ2ZXJDb250YWluZXJzLCBbLi4uYWN0aW9ucywgLi4ud2lkZ2V0cywgLi4ub3RoZXJDb250YWluZXJzXSk7XG5cdFx0Zm9yIChjb25zdCBkaXNwb3NhYmxlIG9mIFsuLi5hY3Rpb25zLCAuLi53aWRnZXRzLCAuLi5vdGhlckNvbnRhaW5lcnMsIG1jcFNlcnZlckNvbnRhaW5lcnNdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHRjb25zdCBvbkVycm9yID0gRXZlbnQuY2hhaW4oYWN0aW9uQmFyLm9uRGlkUnVuLCAkID0+XG5cdFx0XHQkLm1hcCgoeyBlcnJvciB9KSA9PiBlcnJvcilcblx0XHRcdFx0LmZpbHRlcihlcnJvciA9PiAhIWVycm9yKVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvbkVycm9yKHRoaXMub25FcnJvciwgdGhpcykpO1xuXG5cdFx0Y29uc3QgYm9keSA9IGFwcGVuZChyb290LCAkKCcuYm9keScpKTtcblx0XHRjb25zdCBuYXZiYXIgPSBuZXcgTmF2QmFyKGJvZHkpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGFwcGVuZChib2R5LCAkKCcuY29udGVudCcpKTtcblx0XHRjb250ZW50LmlkID0gZ2VuZXJhdGVVdWlkKCk7IC8vIEFuIGlkIGlzIG5lZWRlZCBmb3IgdGhlIHdlYnZpZXcgcGFyZW50IGZsb3cgdG9cblxuXHRcdHRoaXMudGVtcGxhdGUgPSB7XG5cdFx0XHRjb250ZW50LFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRoZWFkZXIsXG5cdFx0XHRuYW1lLFxuXHRcdFx0bmF2YmFyLFxuXHRcdFx0YWN0aW9uc0FuZFN0YXR1c0NvbnRhaW5lcixcblx0XHRcdGFjdGlvbkJhcjogYWN0aW9uQmFyLFxuXHRcdFx0c2V0IG1jcFNlcnZlcihtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIpIHtcblx0XHRcdFx0bWNwU2VydmVyQ29udGFpbmVycy5tY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXI7XG5cdFx0XHRcdGxldCBsYXN0Tm9uRW1wdHlTdWJ0aXRsZUVudHJ5Q29udGFpbmVyO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHN1YlRpdGxlRW50cnlFbGVtZW50IG9mIHN1YlRpdGxlRW50cnlDb250YWluZXJzKSB7XG5cdFx0XHRcdFx0c3ViVGl0bGVFbnRyeUVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnbGFzdC1ub24tZW1wdHknKTtcblx0XHRcdFx0XHRpZiAoc3ViVGl0bGVFbnRyeUVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0bGFzdE5vbkVtcHR5U3VidGl0bGVFbnRyeUNvbnRhaW5lciA9IHN1YlRpdGxlRW50cnlFbGVtZW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobGFzdE5vbkVtcHR5U3VidGl0bGVFbnRyeUNvbnRhaW5lcikge1xuXHRcdFx0XHRcdGxhc3ROb25FbXB0eVN1YnRpdGxlRW50cnlDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbGFzdC1ub24tZW1wdHknKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogTWNwU2VydmVyRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElNY3BTZXJ2ZXJFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKHRoaXMudGVtcGxhdGUpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVuZGVyKGlucHV0Lm1jcFNlcnZlciwgdGhpcy50ZW1wbGF0ZSwgISFvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlcihtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFjdGl2ZUVsZW1lbnQgPSBudWxsO1xuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpLnRva2VuO1xuXG5cdFx0dGhpcy5tY3BTZXJ2ZXJSZWFkbWUgPSBuZXcgQ2FjaGUoKCkgPT4gbWNwU2VydmVyLmdldFJlYWRtZSh0b2tlbikpO1xuXHRcdHRoaXMubWNwU2VydmVyTWFuaWZlc3QgPSBuZXcgQ2FjaGUoKCkgPT4gbWNwU2VydmVyLmdldE1hbmlmZXN0KHRva2VuKSk7XG5cdFx0dGVtcGxhdGUubWNwU2VydmVyID0gbWNwU2VydmVyO1xuXG5cdFx0dGVtcGxhdGUubmFtZS50ZXh0Q29udGVudCA9IG1jcFNlcnZlci5sYWJlbDtcblx0XHR0ZW1wbGF0ZS5uYW1lLmNsYXNzTGlzdC50b2dnbGUoJ2NsaWNrYWJsZScsICEhbWNwU2VydmVyLmdhbGxlcnk/LndlYlVybCk7XG5cdFx0dGVtcGxhdGUuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBtY3BTZXJ2ZXIuZGVzY3JpcHRpb247XG5cdFx0aWYgKG1jcFNlcnZlci5nYWxsZXJ5Py53ZWJVcmwpIHtcblx0XHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2sodGVtcGxhdGUubmFtZSwgKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKG1jcFNlcnZlci5nYWxsZXJ5Py53ZWJVcmwhKSkpKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlck5hdmJhcihtY3BTZXJ2ZXIsIHRlbXBsYXRlLCBwcmVzZXJ2ZUZvY3VzKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldE9wdGlvbnMob3B0aW9uczogSU1jcFNlcnZlckVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRzdXBlci5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXHRcdGlmIChvcHRpb25zPy50YWIpIHtcblx0XHRcdHRoaXMudGVtcGxhdGU/Lm5hdmJhci5zd2l0Y2gob3B0aW9ucy50YWIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTmF2YmFyKGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlciwgdGVtcGxhdGU6IElFeHRlbnNpb25FZGl0b3JUZW1wbGF0ZSwgcHJlc2VydmVGb2N1czogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmNvbnRlbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGVtcGxhdGUubmF2YmFyLmNsZWFyKCk7XG5cblx0XHRpZiAodGhpcy5jdXJyZW50SWRlbnRpZmllciAhPT0gZXh0ZW5zaW9uLmlkKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxTY3JvbGxQcm9ncmVzcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5jdXJyZW50SWRlbnRpZmllciA9IGV4dGVuc2lvbi5pZDtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uLnJlYWRtZVVybCB8fCBleHRlbnNpb24uZ2FsbGVyeT8ucmVhZG1lKSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChNY3BTZXJ2ZXJFZGl0b3JUYWIuUmVhZG1lLCBsb2NhbGl6ZSgnZGV0YWlscycsIFwiRGV0YWlsc1wiKSwgbG9jYWxpemUoJ2RldGFpbHN0b29sdGlwJywgXCJFeHRlbnNpb24gZGV0YWlscywgcmVuZGVyZWQgZnJvbSB0aGUgZXh0ZW5zaW9uJ3MgJ1JFQURNRS5tZCcgZmlsZVwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKGV4dGVuc2lvbi5nYWxsZXJ5IHx8IGV4dGVuc2lvbi5sb2NhbD8ubWFuaWZlc3QpIHtcblx0XHRcdHRlbXBsYXRlLm5hdmJhci5wdXNoKE1jcFNlcnZlckVkaXRvclRhYi5NYW5pZmVzdCwgbG9jYWxpemUoJ21hbmlmZXN0JywgXCJNYW5pZmVzdFwiKSwgbG9jYWxpemUoJ21hbmlmZXN0dG9vbHRpcCcsIFwiU2VydmVyIG1hbmlmZXN0IGRldGFpbHNcIikpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24uY29uZmlnKSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIucHVzaChNY3BTZXJ2ZXJFZGl0b3JUYWIuQ29uZmlndXJhdGlvbiwgbG9jYWxpemUoJ2NvbmZpZ3VyYXRpb24nLCBcIkNvbmZpZ3VyYXRpb25cIiksIGxvY2FsaXplKCdjb25maWd1cmF0aW9udG9vbHRpcCcsIFwiU2VydmVyIGNvbmZpZ3VyYXRpb24gZGV0YWlsc1wiKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFuc2llbnREaXNwb3NhYmxlcy5hZGQodGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUgPT09IGV4dGVuc2lvbikge1xuXHRcdFx0XHRpZiAoZS5jb25maWcgJiYgIXRlbXBsYXRlLm5hdmJhci5oYXMoTWNwU2VydmVyRWRpdG9yVGFiLkNvbmZpZ3VyYXRpb24pKSB7XG5cdFx0XHRcdFx0dGVtcGxhdGUubmF2YmFyLnB1c2goTWNwU2VydmVyRWRpdG9yVGFiLkNvbmZpZ3VyYXRpb24sIGxvY2FsaXplKCdjb25maWd1cmF0aW9uJywgXCJDb25maWd1cmF0aW9uXCIpLCBsb2NhbGl6ZSgnY29uZmlndXJhdGlvbnRvb2x0aXAnLCBcIlNlcnZlciBjb25maWd1cmF0aW9uIGRldGFpbHNcIiksIGV4dGVuc2lvbi5yZWFkbWVVcmwgPyAxIDogMCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFlLmNvbmZpZyAmJiB0ZW1wbGF0ZS5uYXZiYXIuaGFzKE1jcFNlcnZlckVkaXRvclRhYi5Db25maWd1cmF0aW9uKSkge1xuXHRcdFx0XHRcdHRlbXBsYXRlLm5hdmJhci5yZW1vdmUoTWNwU2VydmVyRWRpdG9yVGFiLkNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCg8SU1jcFNlcnZlckVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQ+dGhpcy5vcHRpb25zKT8udGFiKSB7XG5cdFx0XHR0ZW1wbGF0ZS5uYXZiYXIuc3dpdGNoKCg8SU1jcFNlcnZlckVkaXRvck9wdGlvbnM+dGhpcy5vcHRpb25zKS50YWIhKTtcblx0XHR9XG5cblx0XHRpZiAodGVtcGxhdGUubmF2YmFyLmN1cnJlbnRJZCkge1xuXHRcdFx0dGhpcy5vbk5hdmJhckNoYW5nZShleHRlbnNpb24sIHsgaWQ6IHRlbXBsYXRlLm5hdmJhci5jdXJyZW50SWQsIGZvY3VzOiAhcHJlc2VydmVGb2N1cyB9LCB0ZW1wbGF0ZSk7XG5cdFx0fVxuXHRcdHRlbXBsYXRlLm5hdmJhci5vbkNoYW5nZShlID0+IHRoaXMub25OYXZiYXJDaGFuZ2UoZXh0ZW5zaW9uLCBlLCB0ZW1wbGF0ZSksIHRoaXMsIHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMudHJhbnNpZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy5hY3RpdmVFbGVtZW50Py5mb2N1cygpO1xuXHR9XG5cblx0c2hvd0ZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVXZWJ2aWV3Py5zaG93RmluZCgpO1xuXHR9XG5cblx0cnVuRmluZEFjdGlvbihwcmV2aW91czogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlV2Vidmlldz8ucnVuRmluZEFjdGlvbihwcmV2aW91cyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGFjdGl2ZVdlYnZpZXcoKTogSVdlYnZpZXcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5hY3RpdmVFbGVtZW50IHx8ICEodGhpcy5hY3RpdmVFbGVtZW50IGFzIElXZWJ2aWV3KS5ydW5GaW5kQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5hY3RpdmVFbGVtZW50IGFzIElXZWJ2aWV3O1xuXHR9XG5cblx0cHJpdmF0ZSBvbk5hdmJhckNoYW5nZShleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIHsgaWQsIGZvY3VzIH06IHsgaWQ6IHN0cmluZyB8IG51bGw7IGZvY3VzOiBib29sZWFuIH0sIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlLmNvbnRlbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5hY3RpdmVFbGVtZW50ID0gbnVsbDtcblx0XHRpZiAoaWQpIHtcblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdFx0dGhpcy5vcGVuKGlkLCBleHRlbnNpb24sIHRlbXBsYXRlLCBjdHMudG9rZW4pXG5cdFx0XHRcdC50aGVuKGFjdGl2ZUVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVFbGVtZW50ID0gYWN0aXZlRWxlbWVudDtcblx0XHRcdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb3BlbihpZDogc3RyaW5nLCBleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0c3dpdGNoIChpZCkge1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJFZGl0b3JUYWIuQ29uZmlndXJhdGlvbjogcmV0dXJuIHRoaXMub3BlbkNvbmZpZ3VyYXRpb24oZXh0ZW5zaW9uLCB0ZW1wbGF0ZSwgdG9rZW4pO1xuXHRcdFx0Y2FzZSBNY3BTZXJ2ZXJFZGl0b3JUYWIuUmVhZG1lOiByZXR1cm4gdGhpcy5vcGVuRGV0YWlscyhleHRlbnNpb24sIHRlbXBsYXRlLCB0b2tlbik7XG5cdFx0XHRjYXNlIE1jcFNlcnZlckVkaXRvclRhYi5NYW5pZmVzdDogcmV0dXJuIGV4dGVuc2lvbi5yZWFkbWVVcmwgPyB0aGlzLm9wZW5NYW5pZmVzdChleHRlbnNpb24sIHRlbXBsYXRlLmNvbnRlbnQsIHRva2VuKSA6IHRoaXMub3Blbk1hbmlmZXN0V2l0aEFkZGl0aW9uYWxEZXRhaWxzKGV4dGVuc2lvbiwgdGVtcGxhdGUsIHRva2VuKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbk1hcmtkb3duKGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlciwgY2FjaGVSZXN1bHQ6IENhY2hlUmVzdWx0PHN0cmluZz4sIG5vQ29udGVudENvcHk6IHN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgd2Vidmlld0luZGV4OiBXZWJ2aWV3SW5kZXgsIHRpdGxlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCB0aGlzLnJlbmRlck1hcmtkb3duKGV4dGVuc2lvbiwgY2FjaGVSZXN1bHQsIGNvbnRhaW5lciwgdG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdlYnZpZXcgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy53ZWJ2aWV3U2VydmljZS5jcmVhdGVXZWJ2aWV3T3ZlcmxheSh7XG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZW5hYmxlRmluZFdpZGdldDogdHJ1ZSxcblx0XHRcdFx0XHR0cnlSZXN0b3JlU2Nyb2xsUG9zaXRpb246IHRydWUsXG5cdFx0XHRcdFx0ZGlzYWJsZVNlcnZpY2VXb3JrZXI6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbnRlbnRPcHRpb25zOiB7fSxcblx0XHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cblx0XHRcdHdlYnZpZXcuaW5pdGlhbFNjcm9sbFByb2dyZXNzID0gdGhpcy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MuZ2V0KHdlYnZpZXdJbmRleCkgfHwgMDtcblxuXHRcdFx0d2Vidmlldy5jbGFpbSh0aGlzLCB0aGlzLndpbmRvdywgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRzZXRQYXJlbnRGbG93VG8od2Vidmlldy5jb250YWluZXIsIGNvbnRhaW5lcik7XG5cdFx0XHR3ZWJ2aWV3LnNldEFuY2hvckVsZW1lbnQoY29udGFpbmVyKTtcblxuXHRcdFx0d2Vidmlldy5zZXRIdG1sKGJvZHkpO1xuXHRcdFx0d2Vidmlldy5jbGFpbSh0aGlzLCB0aGlzLndpbmRvdywgdW5kZWZpbmVkKTtcblxuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHdlYnZpZXcub25EaWRGb2N1cygoKSA9PiB0aGlzLl9vbkRpZEZvY3VzPy5maXJlKCkpKTtcblxuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHdlYnZpZXcub25EaWRTY3JvbGwoKCkgPT4gdGhpcy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3Muc2V0KHdlYnZpZXdJbmRleCwgd2Vidmlldy5pbml0aWFsU2Nyb2xsUHJvZ3Jlc3MpKSk7XG5cblx0XHRcdGNvbnN0IHJlbW92ZUxheW91dFBhcnRpY2lwYW50ID0gYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywge1xuXHRcdFx0XHRsYXlvdXQ6ICgpID0+IHtcblx0XHRcdFx0XHR3ZWJ2aWV3LnNldEFuY2hvckVsZW1lbnQoY29udGFpbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKHJlbW92ZUxheW91dFBhcnRpY2lwYW50KSk7XG5cblx0XHRcdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgaXNEaXNwb3NlZCA9IHRydWU7IH0pKTtcblxuXHRcdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIFJlbmRlciBhZ2FpbiBzaW5jZSBzeW50YXggaGlnaGxpZ2h0aW5nIG9mIGNvZGUgYmxvY2tzIG1heSBoYXZlIGNoYW5nZWRcblx0XHRcdFx0Y29uc3QgYm9keSA9IGF3YWl0IHRoaXMucmVuZGVyTWFya2Rvd24oZXh0ZW5zaW9uLCBjYWNoZVJlc3VsdCwgY29udGFpbmVyKTtcblx0XHRcdFx0aWYgKCFpc0Rpc3Bvc2VkKSB7IC8vIE1ha2Ugc3VyZSB3ZSB3ZXJlbid0IGRpc3Bvc2VkIG9mIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRcdHdlYnZpZXcuc2V0SHRtbChib2R5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQod2Vidmlldy5vbkRpZENsaWNrTGluayhsaW5rID0+IHtcblx0XHRcdFx0aWYgKCFsaW5rKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE9ubHkgYWxsb3cgbGlua3Mgd2l0aCBzcGVjaWZpYyBzY2hlbWVzXG5cdFx0XHRcdGlmIChtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMuaHR0cCkgfHwgbWF0Y2hlc1NjaGVtZShsaW5rLCBTY2hlbWFzLmh0dHBzKSB8fCBtYXRjaGVzU2NoZW1lKGxpbmssIFNjaGVtYXMubWFpbHRvKSkge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKGxpbmspO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB3ZWJ2aWV3O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IHAgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdwLm5vY29udGVudCcpKTtcblx0XHRcdHAudGV4dENvbnRlbnQgPSBub0NvbnRlbnRDb3B5O1xuXHRcdFx0cmV0dXJuIHA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJNYXJrZG93bihleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIGNhY2hlUmVzdWx0OiBDYWNoZVJlc3VsdDxzdHJpbmc+LCBjb250YWluZXI6IEhUTUxFbGVtZW50LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMubG9hZENvbnRlbnRzKCgpID0+IGNhY2hlUmVzdWx0LCBjb250YWluZXIpO1xuXHRcdGlmICh0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgcmVuZGVyTWFya2Rvd25Eb2N1bWVudChjb250ZW50cywgdGhpcy5leHRlbnNpb25TZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwge30sIHRva2VuKTtcblx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyQm9keShjb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQm9keShib2R5OiBUcnVzdGVkSFRNTCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgbm9uY2UgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBjb2xvck1hcCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldENvbG9yTWFwKCk7XG5cdFx0Y29uc3QgY3NzID0gY29sb3JNYXAgPyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwKGNvbG9yTWFwKSA6ICcnO1xuXHRcdHJldHVybiBgPCFET0NUWVBFIGh0bWw+XG5cdFx0PGh0bWw+XG5cdFx0XHQ8aGVhZD5cblx0XHRcdFx0PG1ldGEgaHR0cC1lcXVpdj1cIkNvbnRlbnQtdHlwZVwiIGNvbnRlbnQ9XCJ0ZXh0L2h0bWw7Y2hhcnNldD1VVEYtOFwiPlxuXHRcdFx0XHQ8bWV0YSBodHRwLWVxdWl2PVwiQ29udGVudC1TZWN1cml0eS1Qb2xpY3lcIiBjb250ZW50PVwiZGVmYXVsdC1zcmMgJ25vbmUnOyBpbWctc3JjIGh0dHBzOiBkYXRhOjsgbWVkaWEtc3JjIGh0dHBzOjsgc2NyaXB0LXNyYyAnbm9uZSc7IHN0eWxlLXNyYyAnbm9uY2UtJHtub25jZX0nO1wiPlxuXHRcdFx0XHQ8c3R5bGUgbm9uY2U9XCIke25vbmNlfVwiPlxuXHRcdFx0XHRcdCR7REVGQVVMVF9NQVJLRE9XTl9TVFlMRVN9XG5cblx0XHRcdFx0XHQvKiBwcmV2ZW50IHNjcm9sbC10by10b3AgYnV0dG9uIGZyb20gYmxvY2tpbmcgdGhlIGJvZHkgdGV4dCAqL1xuXHRcdFx0XHRcdGJvZHkge1xuXHRcdFx0XHRcdFx0cGFkZGluZy1ib3R0b206IDc1cHg7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3Njcm9sbC10by10b3Age1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IGZpeGVkO1xuXHRcdFx0XHRcdFx0d2lkdGg6IDMycHg7XG5cdFx0XHRcdFx0XHRoZWlnaHQ6IDMycHg7XG5cdFx0XHRcdFx0XHRyaWdodDogMjVweDtcblx0XHRcdFx0XHRcdGJvdHRvbTogMjVweDtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5QmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRib3JkZXItY29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tYm9yZGVyKTtcblx0XHRcdFx0XHRcdGJvcmRlci1yYWRpdXM6IDUwJTtcblx0XHRcdFx0XHRcdGN1cnNvcjogcG9pbnRlcjtcblx0XHRcdFx0XHRcdGJveC1zaGFkb3c6IDFweCAxcHggMXB4IHJnYmEoMCwwLDAsLjI1KTtcblx0XHRcdFx0XHRcdG91dGxpbmU6IG5vbmU7XG5cdFx0XHRcdFx0XHRkaXNwbGF5OiBmbGV4O1xuXHRcdFx0XHRcdFx0anVzdGlmeS1jb250ZW50OiBjZW50ZXI7XG5cdFx0XHRcdFx0XHRhbGlnbi1pdGVtczogY2VudGVyO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdCNzY3JvbGwtdG8tdG9wOmhvdmVyIHtcblx0XHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kKTtcblx0XHRcdFx0XHRcdGJveC1zaGFkb3c6IDJweCAycHggMnB4IHJnYmEoMCwwLDAsLjI1KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRib2R5LnZzY29kZS1oaWdoLWNvbnRyYXN0ICNzY3JvbGwtdG8tdG9wIHtcblx0XHRcdFx0XHRcdGJvcmRlci13aWR0aDogMnB4O1xuXHRcdFx0XHRcdFx0Ym9yZGVyLXN0eWxlOiBzb2xpZDtcblx0XHRcdFx0XHRcdGJveC1zaGFkb3c6IG5vbmU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0I3Njcm9sbC10by10b3Agc3Bhbi5pY29uOjpiZWZvcmUge1xuXHRcdFx0XHRcdFx0Y29udGVudDogXCJcIjtcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGJsb2NrO1xuXHRcdFx0XHRcdFx0YmFja2dyb3VuZDogdmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlGb3JlZ3JvdW5kKTtcblx0XHRcdFx0XHRcdC8qIENoZXZyb24gdXAgaWNvbiAqL1xuXHRcdFx0XHRcdFx0d2Via2l0LW1hc2staW1hZ2U6IHVybCgnZGF0YTppbWFnZS9zdmcreG1sO2Jhc2U2NCxQRDk0Yld3Z2RtVnljMmx2YmowaU1TNHdJaUJsYm1OdlpHbHVaejBpZFhSbUxUZ2lQejRLUENFdExTQkhaVzVsY21GMGIzSTZJRUZrYjJKbElFbHNiSFZ6ZEhKaGRHOXlJREU1TGpJdU1Dd2dVMVpISUVWNGNHOXlkQ0JRYkhWbkxVbHVJQzRnVTFaSElGWmxjbk5wYjI0NklEWXVNREFnUW5WcGJHUWdNQ2tnSUMwdFBnbzhjM1puSUhabGNuTnBiMjQ5SWpFdU1TSWdhV1E5SWt4aGVXVnlYekVpSUhodGJHNXpQU0pvZEhSd09pOHZkM2QzTG5jekxtOXlaeTh5TURBd0wzTjJaeUlnZUcxc2JuTTZlR3hwYm1zOUltaDBkSEE2THk5M2QzY3Vkek11YjNKbkx6RTVPVGt2ZUd4cGJtc2lJSGc5SWpCd2VDSWdlVDBpTUhCNElnb0pJSFpwWlhkQ2IzZzlJakFnTUNBeE5pQXhOaUlnYzNSNWJHVTlJbVZ1WVdKc1pTMWlZV05yWjNKdmRXNWtPbTVsZHlBd0lEQWdNVFlnTVRZN0lpQjRiV3c2YzNCaFkyVTlJbkJ5WlhObGNuWmxJajRLUEhOMGVXeGxJSFI1Y0dVOUluUmxlSFF2WTNOeklqNEtDUzV6ZERCN1ptbHNiRG9qUmtaR1JrWkdPMzBLQ1M1emRERjdabWxzYkRwdWIyNWxPMzBLUEM5emRIbHNaVDRLUEhScGRHeGxQblZ3WTJobGRuSnZiand2ZEdsMGJHVStDanh3WVhSb0lHTnNZWE56UFNKemREQWlJR1E5SWswNExEVXVNV3d0Tnk0ekxEY3VNMHd3TERFeExqWnNPQzA0YkRnc09Hd3RNQzQzTERBdU4wdzRMRFV1TVhvaUx6NEtQSEpsWTNRZ1kyeGhjM005SW5OME1TSWdkMmxrZEdnOUlqRTJJaUJvWldsbmFIUTlJakUySWk4K0Nqd3ZjM1puUGdvPScpO1xuXHRcdFx0XHRcdFx0LXdlYmtpdC1tYXNrLWltYWdlOiB1cmwoJ2RhdGE6aW1hZ2Uvc3ZnK3htbDtiYXNlNjQsUEQ5NGJXd2dkbVZ5YzJsdmJqMGlNUzR3SWlCbGJtTnZaR2x1WnowaWRYUm1MVGdpUHo0S1BDRXRMU0JIWlc1bGNtRjBiM0k2SUVGa2IySmxJRWxzYkhWemRISmhkRzl5SURFNUxqSXVNQ3dnVTFaSElFVjRjRzl5ZENCUWJIVm5MVWx1SUM0Z1UxWkhJRlpsY25OcGIyNDZJRFl1TURBZ1FuVnBiR1FnTUNrZ0lDMHRQZ284YzNabklIWmxjbk5wYjI0OUlqRXVNU0lnYVdROUlreGhlV1Z5WHpFaUlIaHRiRzV6UFNKb2RIUndPaTh2ZDNkM0xuY3pMbTl5Wnk4eU1EQXdMM04yWnlJZ2VHMXNibk02ZUd4cGJtczlJbWgwZEhBNkx5OTNkM2N1ZHpNdWIzSm5MekU1T1RrdmVHeHBibXNpSUhnOUlqQndlQ0lnZVQwaU1IQjRJZ29KSUhacFpYZENiM2c5SWpBZ01DQXhOaUF4TmlJZ2MzUjViR1U5SW1WdVlXSnNaUzFpWVdOclozSnZkVzVrT201bGR5QXdJREFnTVRZZ01UWTdJaUI0Yld3NmMzQmhZMlU5SW5CeVpYTmxjblpsSWo0S1BITjBlV3hsSUhSNWNHVTlJblJsZUhRdlkzTnpJajRLQ1M1emREQjdabWxzYkRvalJrWkdSa1pHTzMwS0NTNXpkREY3Wm1sc2JEcHViMjVsTzMwS1BDOXpkSGxzWlQ0S1BIUnBkR3hsUG5Wd1kyaGxkbkp2Ymp3dmRHbDBiR1UrQ2p4d1lYUm9JR05zWVhOelBTSnpkREFpSUdROUlrMDRMRFV1TVd3dE55NHpMRGN1TTB3d0xERXhMalpzT0MwNGJEZ3NPR3d0TUM0M0xEQXVOMHc0TERVdU1Yb2lMejRLUEhKbFkzUWdZMnhoYzNNOUluTjBNU0lnZDJsa2RHZzlJakUySWlCb1pXbG5hSFE5SWpFMklpOCtDand2YzNablBnbz0nKTtcblx0XHRcdFx0XHRcdHdpZHRoOiAxNnB4O1xuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxNnB4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQke2Nzc31cblx0XHRcdFx0PC9zdHlsZT5cblx0XHRcdDwvaGVhZD5cblx0XHRcdDxib2R5PlxuXHRcdFx0XHQ8YSBpZD1cInNjcm9sbC10by10b3BcIiByb2xlPVwiYnV0dG9uXCIgYXJpYS1sYWJlbD1cInNjcm9sbCB0byB0b3BcIiBocmVmPVwiI1wiPjxzcGFuIGNsYXNzPVwiaWNvblwiPjwvc3Bhbj48L2E+XG5cdFx0XHRcdCR7Ym9keX1cblx0XHRcdDwvYm9keT5cblx0XHQ8L2h0bWw+YDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkRldGFpbHMoZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyLCB0ZW1wbGF0ZTogSUV4dGVuc2lvbkVkaXRvclRlbXBsYXRlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBY3RpdmVFbGVtZW50IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGRldGFpbHMgPSBhcHBlbmQodGVtcGxhdGUuY29udGVudCwgJCgnLmRldGFpbHMnKSk7XG5cdFx0Y29uc3QgcmVhZG1lQ29udGFpbmVyID0gYXBwZW5kKGRldGFpbHMsICQoJy5jb250ZW50LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhZGRpdGlvbmFsRGV0YWlsc0NvbnRhaW5lciA9IGFwcGVuZChkZXRhaWxzLCAkKCcuYWRkaXRpb25hbC1kZXRhaWxzLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IGxheW91dCA9ICgpID0+IGRldGFpbHMuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93JywgdGhpcy5kaW1lbnNpb24gJiYgdGhpcy5kaW1lbnNpb24ud2lkdGggPCA1MDApO1xuXHRcdGxheW91dCgpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywgeyBsYXlvdXQgfSkpKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBhd2FpdCB0aGlzLm9wZW5NYXJrZG93bihleHRlbnNpb24sIHRoaXMubWNwU2VydmVyUmVhZG1lIS5nZXQoKSwgbG9jYWxpemUoJ25vUmVhZG1lJywgXCJObyBSRUFETUUgYXZhaWxhYmxlLlwiKSwgcmVhZG1lQ29udGFpbmVyLCBXZWJ2aWV3SW5kZXguUmVhZG1lLCBsb2NhbGl6ZSgnUmVhZG1lIHRpdGxlJywgXCJSZWFkbWVcIiksIHRva2VuKTtcblx0XHR0aGlzLnJlbmRlckFkZGl0aW9uYWxEZXRhaWxzKGFkZGl0aW9uYWxEZXRhaWxzQ29udGFpbmVyLCBleHRlbnNpb24pO1xuXHRcdHJldHVybiBhY3RpdmVFbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQ29uZmlndXJhdGlvbihtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0Y29uc3QgY29uZmlnQ29udGFpbmVyID0gYXBwZW5kKHRlbXBsYXRlLmNvbnRlbnQsICQoJy5jb25maWd1cmF0aW9uJykpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAkKCdkaXYnLCB7IGNsYXNzOiAnY29uZmlndXJhdGlvbi1jb250ZW50JyB9KTtcblxuXHRcdHRoaXMucmVuZGVyQ29uZmlndXJhdGlvbkRldGFpbHMoY29udGVudCwgbWNwU2VydmVyKTtcblxuXHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gbmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGNvbnRlbnQsIHt9KTtcblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiBzY3JvbGxhYmxlQ29udGVudC5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoYXJyYXlzLmluc2VydCh0aGlzLmxheW91dFBhcnRpY2lwYW50cywgeyBsYXlvdXQgfSkpKTtcblxuXHRcdGFwcGVuZChjb25maWdDb250YWluZXIsIHNjcm9sbGFibGVDb250ZW50LmdldERvbU5vZGUoKSk7XG5cblx0XHRyZXR1cm4geyBmb2N1czogKCkgPT4gY29udGVudC5mb2N1cygpIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5NYW5pZmVzdFdpdGhBZGRpdGlvbmFsRGV0YWlscyhtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIHRlbXBsYXRlOiBJRXh0ZW5zaW9uRWRpdG9yVGVtcGxhdGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0Y29uc3QgZGV0YWlscyA9IGFwcGVuZCh0ZW1wbGF0ZS5jb250ZW50LCAkKCcuZGV0YWlscycpKTtcblxuXHRcdGNvbnN0IHJlYWRtZUNvbnRhaW5lciA9IGFwcGVuZChkZXRhaWxzLCAkKCcuY29udGVudC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYWRkaXRpb25hbERldGFpbHNDb250YWluZXIgPSBhcHBlbmQoZGV0YWlscywgJCgnLmFkZGl0aW9uYWwtZGV0YWlscy1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBsYXlvdXQgPSAoKSA9PiBkZXRhaWxzLmNsYXNzTGlzdC50b2dnbGUoJ25hcnJvdycsIHRoaXMuZGltZW5zaW9uICYmIHRoaXMuZGltZW5zaW9uLndpZHRoIDwgNTAwKTtcblx0XHRsYXlvdXQoKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0IH0pKSk7XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gYXdhaXQgdGhpcy5vcGVuTWFuaWZlc3QobWNwU2VydmVyLCByZWFkbWVDb250YWluZXIsIHRva2VuKTtcblxuXHRcdHRoaXMucmVuZGVyQWRkaXRpb25hbERldGFpbHMoYWRkaXRpb25hbERldGFpbHNDb250YWluZXIsIG1jcFNlcnZlcik7XG5cdFx0cmV0dXJuIGFjdGl2ZUVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5NYW5pZmVzdChtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIHBhcmVudDogSFRNTEVsZW1lbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFjdGl2ZUVsZW1lbnQgfCBudWxsPiB7XG5cdFx0Y29uc3QgbWFuaWZlc3RDb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcubWFuaWZlc3QnKSk7XG5cdFx0Y29uc3QgY29udGVudCA9ICQoJ2RpdicsIHsgY2xhc3M6ICdtYW5pZmVzdC1jb250ZW50JyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMubG9hZENvbnRlbnRzKCgpID0+IHRoaXMubWNwU2VydmVyTWFuaWZlc3QhLmdldCgpLCBjb250ZW50KTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVuZGVyTWFuaWZlc3REZXRhaWxzKGNvbnRlbnQsIG1hbmlmZXN0KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gSGFuZGxlIGVycm9yIC0gc2hvdyBubyBtYW5pZmVzdCBtZXNzYWdlXG5cdFx0XHR3aGlsZSAoY29udGVudC5maXJzdENoaWxkKSB7XG5cdFx0XHRcdGNvbnRlbnQucmVtb3ZlQ2hpbGQoY29udGVudC5maXJzdENoaWxkKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5vTWFuaWZlc3RNZXNzYWdlID0gYXBwZW5kKGNvbnRlbnQsICQoJy5uby1tYW5pZmVzdCcpKTtcblx0XHRcdG5vTWFuaWZlc3RNZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vTWFuaWZlc3QnLCBcIk5vIG1hbmlmZXN0IGF2YWlsYWJsZSBmb3IgdGhpcyBNQ1Agc2VydmVyLlwiKTtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxhYmxlQ29udGVudCA9IG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudChjb250ZW50LCB7fSk7XG5cdFx0Y29uc3QgbGF5b3V0ID0gKCkgPT4gc2Nyb2xsYWJsZUNvbnRlbnQuc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKGFycmF5cy5pbnNlcnQodGhpcy5sYXlvdXRQYXJ0aWNpcGFudHMsIHsgbGF5b3V0IH0pKSk7XG5cblx0XHRhcHBlbmQobWFuaWZlc3RDb250YWluZXIsIHNjcm9sbGFibGVDb250ZW50LmdldERvbU5vZGUoKSk7XG5cblx0XHRyZXR1cm4geyBmb2N1czogKCkgPT4gY29udGVudC5mb2N1cygpIH07XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbmZpZ3VyYXRpb25EZXRhaWxzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlcik6IHZvaWQge1xuXHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gbWNwU2VydmVyLmNvbmZpZztcblxuXHRcdGlmICghY29uZmlnKSB7XG5cdFx0XHRjb25zdCBub0NvbmZpZ01lc3NhZ2UgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubm8tY29uZmlnJykpO1xuXHRcdFx0bm9Db25maWdNZXNzYWdlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vQ29uZmlnJywgXCJObyBjb25maWd1cmF0aW9uIGF2YWlsYWJsZSBmb3IgdGhpcyBNQ1Agc2VydmVyLlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZXJ2ZXIgTmFtZVxuXHRcdGNvbnN0IG5hbWVTZWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvbmZpZy1zZWN0aW9uJykpO1xuXHRcdGNvbnN0IG5hbWVMYWJlbCA9IGFwcGVuZChuYW1lU2VjdGlvbiwgJCgnLmNvbmZpZy1sYWJlbCcpKTtcblx0XHRuYW1lTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2VydmVyTmFtZScsIFwiTmFtZTpcIik7XG5cdFx0Y29uc3QgbmFtZVZhbHVlID0gYXBwZW5kKG5hbWVTZWN0aW9uLCAkKCcuY29uZmlnLXZhbHVlJykpO1xuXHRcdG5hbWVWYWx1ZS50ZXh0Q29udGVudCA9IG1jcFNlcnZlci5uYW1lO1xuXG5cdFx0Ly8gU2VydmVyIFR5cGVcblx0XHRjb25zdCB0eXBlU2VjdGlvbiA9IGFwcGVuZChjb250YWluZXIsICQoJy5jb25maWctc2VjdGlvbicpKTtcblx0XHRjb25zdCB0eXBlTGFiZWwgPSBhcHBlbmQodHlwZVNlY3Rpb24sICQoJy5jb25maWctbGFiZWwnKSk7XG5cdFx0dHlwZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3NlcnZlclR5cGUnLCBcIlR5cGU6XCIpO1xuXHRcdGNvbnN0IHR5cGVWYWx1ZSA9IGFwcGVuZCh0eXBlU2VjdGlvbiwgJCgnLmNvbmZpZy12YWx1ZScpKTtcblx0XHR0eXBlVmFsdWUudGV4dENvbnRlbnQgPSBjb25maWcudHlwZTtcblxuXHRcdC8vIFR5cGUtc3BlY2lmaWMgY29uZmlndXJhdGlvblxuXHRcdGlmIChjb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0Ly8gQ29tbWFuZFxuXHRcdFx0Y29uc3QgY29tbWFuZFNlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY29uZmlnLXNlY3Rpb24nKSk7XG5cdFx0XHRjb25zdCBjb21tYW5kTGFiZWwgPSBhcHBlbmQoY29tbWFuZFNlY3Rpb24sICQoJy5jb25maWctbGFiZWwnKSk7XG5cdFx0XHRjb21tYW5kTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY29tbWFuZCcsIFwiQ29tbWFuZDpcIik7XG5cdFx0XHRjb25zdCBjb21tYW5kVmFsdWUgPSBhcHBlbmQoY29tbWFuZFNlY3Rpb24sICQoJ2NvZGUuY29uZmlnLXZhbHVlJykpO1xuXHRcdFx0Y29tbWFuZFZhbHVlLnRleHRDb250ZW50ID0gY29uZmlnLmNvbW1hbmQ7XG5cblx0XHRcdC8vIEFyZ3VtZW50cyAoaWYgcHJlc2VudClcblx0XHRcdGlmIChjb25maWcuYXJncyAmJiBjb25maWcuYXJncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGFyZ3NTZWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvbmZpZy1zZWN0aW9uJykpO1xuXHRcdFx0XHRjb25zdCBhcmdzTGFiZWwgPSBhcHBlbmQoYXJnc1NlY3Rpb24sICQoJy5jb25maWctbGFiZWwnKSk7XG5cdFx0XHRcdGFyZ3NMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhcmd1bWVudHMnLCBcIkFyZ3VtZW50czpcIik7XG5cdFx0XHRcdGNvbnN0IGFyZ3NWYWx1ZSA9IGFwcGVuZChhcmdzU2VjdGlvbiwgJCgnY29kZS5jb25maWctdmFsdWUnKSk7XG5cdFx0XHRcdGFyZ3NWYWx1ZS50ZXh0Q29udGVudCA9IGNvbmZpZy5hcmdzLmpvaW4oJyAnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW52aXJvbm1lbnQgdmFyaWFibGVzIChpZiBwcmVzZW50KVxuXHRcdFx0aWYgKGNvbmZpZy5lbnYgJiYgT2JqZWN0LmtleXMoY29uZmlnLmVudikubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBlbnZTZWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvbmZpZy1zZWN0aW9uJykpO1xuXHRcdFx0XHRjb25zdCBlbnZMYWJlbCA9IGFwcGVuZChlbnZTZWN0aW9uLCAkKCcuY29uZmlnLWxhYmVsJykpO1xuXHRcdFx0XHRlbnZMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdlbnZpcm9ubWVudCcsIFwiRW52aXJvbm1lbnQ6XCIpO1xuXHRcdFx0XHRjb25zdCBlbnZWYWx1ZSA9IGFwcGVuZChlbnZTZWN0aW9uLCAkKCcuY29uZmlnLXZhbHVlJykpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuZW52KSkge1xuXHRcdFx0XHRcdGFwcGVuZChlbnZWYWx1ZSwgJCgnY29kZS5lbnYtZW50cnknLCB1bmRlZmluZWQsIGAke2tleX09JHt2YWx1ZSA/PyAnJ31gKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRW52IGZpbGUgKGlmIHByZXNlbnQpXG5cdFx0XHRpZiAoY29uZmlnLmVudkZpbGUpIHtcblx0XHRcdFx0Y29uc3QgZW52RmlsZVNlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY29uZmlnLXNlY3Rpb24nKSk7XG5cdFx0XHRcdGNvbnN0IGVudkZpbGVMYWJlbCA9IGFwcGVuZChlbnZGaWxlU2VjdGlvbiwgJCgnLmNvbmZpZy1sYWJlbCcpKTtcblx0XHRcdFx0ZW52RmlsZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2VudkZpbGUnLCBcIkVudmlyb25tZW50IEZpbGU6XCIpO1xuXHRcdFx0XHRjb25zdCBlbnZGaWxlVmFsdWUgPSBhcHBlbmQoZW52RmlsZVNlY3Rpb24sICQoJ2NvZGUuY29uZmlnLXZhbHVlJykpO1xuXHRcdFx0XHRlbnZGaWxlVmFsdWUudGV4dENvbnRlbnQgPSBjb25maWcuZW52RmlsZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLlJFTU9URSkge1xuXHRcdFx0Ly8gVVJMXG5cdFx0XHRjb25zdCB1cmxTZWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvbmZpZy1zZWN0aW9uJykpO1xuXHRcdFx0Y29uc3QgdXJsTGFiZWwgPSBhcHBlbmQodXJsU2VjdGlvbiwgJCgnLmNvbmZpZy1sYWJlbCcpKTtcblx0XHRcdHVybExhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3VybCcsIFwiVVJMOlwiKTtcblx0XHRcdGNvbnN0IHVybFZhbHVlID0gYXBwZW5kKHVybFNlY3Rpb24sICQoJ2NvZGUuY29uZmlnLXZhbHVlJykpO1xuXHRcdFx0dXJsVmFsdWUudGV4dENvbnRlbnQgPSBjb25maWcudXJsO1xuXG5cdFx0XHQvLyBIZWFkZXJzIChpZiBwcmVzZW50KVxuXHRcdFx0aWYgKGNvbmZpZy5oZWFkZXJzICYmIE9iamVjdC5rZXlzKGNvbmZpZy5oZWFkZXJzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGhlYWRlcnNTZWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNvbmZpZy1zZWN0aW9uJykpO1xuXHRcdFx0XHRjb25zdCBoZWFkZXJzTGFiZWwgPSBhcHBlbmQoaGVhZGVyc1NlY3Rpb24sICQoJy5jb25maWctbGFiZWwnKSk7XG5cdFx0XHRcdGhlYWRlcnNMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdoZWFkZXJzJywgXCJIZWFkZXJzOlwiKTtcblx0XHRcdFx0Y29uc3QgaGVhZGVyc1ZhbHVlID0gYXBwZW5kKGhlYWRlcnNTZWN0aW9uLCAkKCcuY29uZmlnLXZhbHVlJykpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcuaGVhZGVycykpIHtcblx0XHRcdFx0XHRhcHBlbmQoaGVhZGVyc1ZhbHVlLCAkKCdjb2RlLmVudi1lbnRyeScsIHVuZGVmaW5lZCwgYCR7a2V5fTogJHt2YWx1ZSA/PyAnJ31gKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hbmlmZXN0RGV0YWlscyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKTogdm9pZCB7XG5cdFx0Y2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cblx0XHRpZiAobWFuaWZlc3QucGFja2FnZXMgJiYgbWFuaWZlc3QucGFja2FnZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgcGFja2FnZXNCeVR5cGUgPSBuZXcgTWFwPFJlZ2lzdHJ5VHlwZSwgSU1jcFNlcnZlclBhY2thZ2VbXT4oKTtcblx0XHRcdGZvciAoY29uc3QgcGtnIG9mIG1hbmlmZXN0LnBhY2thZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSBwa2cucmVnaXN0cnlUeXBlO1xuXHRcdFx0XHRsZXQgcGFja2FnZXMgPSBwYWNrYWdlc0J5VHlwZS5nZXQodHlwZSk7XG5cdFx0XHRcdGlmICghcGFja2FnZXMpIHtcblx0XHRcdFx0XHRwYWNrYWdlc0J5VHlwZS5zZXQodHlwZSwgcGFja2FnZXMgPSBbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFja2FnZXMucHVzaChwa2cpO1xuXHRcdFx0fVxuXG5cdFx0XHRhcHBlbmQoY29udGFpbmVyLCAkKCcubWFuaWZlc3Qtc2VjdGlvbicsIHVuZGVmaW5lZCwgJCgnLm1hbmlmZXN0LXNlY3Rpb24tdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdwYWNrYWdlcycsIFwiUGFja2FnZXNcIikpKSk7XG5cblx0XHRcdGZvciAoY29uc3QgW3BhY2thZ2VUeXBlLCBwYWNrYWdlc10gb2YgcGFja2FnZXNCeVR5cGUpIHtcblx0XHRcdFx0Y29uc3QgcGFja2FnZVNlY3Rpb24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucGFja2FnZS1zZWN0aW9uJywgdW5kZWZpbmVkLCAkKCcucGFja2FnZS1zZWN0aW9uLXRpdGxlJywgdW5kZWZpbmVkLCBwYWNrYWdlVHlwZS50b1VwcGVyQ2FzZSgpKSkpO1xuXHRcdFx0XHRjb25zdCBwYWNrYWdlc0dyaWQgPSBhcHBlbmQocGFja2FnZVNlY3Rpb24sICQoJy5wYWNrYWdlLWRldGFpbHMnKSk7XG5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYWNrYWdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IHBrZyA9IHBhY2thZ2VzW2ldO1xuXHRcdFx0XHRcdGFwcGVuZChwYWNrYWdlc0dyaWQsICQoJy5wYWNrYWdlLWRldGFpbCcsIHVuZGVmaW5lZCwgJCgnLmRldGFpbC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3BhY2thZ2VOYW1lJywgXCJQYWNrYWdlOlwiKSksICQoJy5kZXRhaWwtdmFsdWUnLCB1bmRlZmluZWQsIHBrZy5pZGVudGlmaWVyKSkpO1xuXHRcdFx0XHRcdGlmIChwa2cucGFja2FnZUFyZ3VtZW50cyAmJiBwa2cucGFja2FnZUFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhcmdTdHJpbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBhcmcgb2YgcGtnLnBhY2thZ2VBcmd1bWVudHMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGFyZy50eXBlID09PSAnbmFtZWQnKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXJnU3RyaW5ncy5wdXNoKGFyZy5uYW1lKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYXJnLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhcmdTdHJpbmdzLnB1c2goYXJnLnZhbHVlKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKGFyZy50eXBlID09PSAncG9zaXRpb25hbCcpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCB2YWwgPSBhcmcudmFsdWUgPz8gYXJnLnZhbHVlSGludDtcblx0XHRcdFx0XHRcdFx0XHRpZiAodmFsKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhcmdTdHJpbmdzLnB1c2godmFsKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGFwcGVuZChwYWNrYWdlc0dyaWQsICQoJy5wYWNrYWdlLWRldGFpbCcsIHVuZGVmaW5lZCwgJCgnLmRldGFpbC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3BhY2thZ2Vhcmd1bWVudHMnLCBcIlBhY2thZ2UgQXJndW1lbnRzOlwiKSksICQoJ2NvZGUuZGV0YWlsLXZhbHVlJywgdW5kZWZpbmVkLCBhcmdTdHJpbmdzLmpvaW4oJyAnKSkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBrZy5ydW50aW1lQXJndW1lbnRzICYmIHBrZy5ydW50aW1lQXJndW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFyZ1N0cmluZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGFyZyBvZiBwa2cucnVudGltZUFyZ3VtZW50cykge1xuXHRcdFx0XHRcdFx0XHRpZiAoYXJnLnR5cGUgPT09ICduYW1lZCcpIHtcblx0XHRcdFx0XHRcdFx0XHRhcmdTdHJpbmdzLnB1c2goYXJnLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChhcmcudmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ1N0cmluZ3MucHVzaChhcmcudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoYXJnLnR5cGUgPT09ICdwb3NpdGlvbmFsJykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHZhbCA9IGFyZy52YWx1ZSA/PyBhcmcudmFsdWVIaW50O1xuXHRcdFx0XHRcdFx0XHRcdGlmICh2YWwpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ1N0cmluZ3MucHVzaCh2YWwpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YXBwZW5kKHBhY2thZ2VzR3JpZCwgJCgnLnBhY2thZ2UtZGV0YWlsJywgdW5kZWZpbmVkLCAkKCcuZGV0YWlsLWxhYmVsJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgncnVudGltZWFyZ3MnLCBcIlJ1bnRpbWUgQXJndW1lbnRzOlwiKSksICQoJ2NvZGUuZGV0YWlsLXZhbHVlJywgdW5kZWZpbmVkLCBhcmdTdHJpbmdzLmpvaW4oJyAnKSkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBrZy5lbnZpcm9ubWVudFZhcmlhYmxlcyAmJiBwa2cuZW52aXJvbm1lbnRWYXJpYWJsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW52U3RyaW5ncyA9IHBrZy5lbnZpcm9ubWVudFZhcmlhYmxlcy5tYXAoKGVudlZhcjogSU1jcFNlcnZlcktleVZhbHVlSW5wdXQpID0+IGAke2VudlZhci5uYW1lfT0ke2VudlZhci52YWx1ZSA/PyAnJ31gKTtcblx0XHRcdFx0XHRcdGFwcGVuZChwYWNrYWdlc0dyaWQsICQoJy5wYWNrYWdlLWRldGFpbCcsIHVuZGVmaW5lZCwgJCgnLmRldGFpbC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2Vudmlyb25tZW50VmFyaWFibGVzJywgXCJFbnZpcm9ubWVudCBWYXJpYWJsZXM6XCIpKSwgJCgnY29kZS5kZXRhaWwtdmFsdWUnLCB1bmRlZmluZWQsIGVudlN0cmluZ3Muam9pbignICcpKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaSA8IHBhY2thZ2VzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHRcdGFwcGVuZChwYWNrYWdlc0dyaWQsICQoJy5wYWNrYWdlLXNlcGFyYXRvcicpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobWFuaWZlc3QucmVtb3RlcyAmJiBtYW5pZmVzdC5yZW1vdGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHBhY2thZ2VTZWN0aW9uID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnBhY2thZ2Utc2VjdGlvbicsIHVuZGVmaW5lZCwgJCgnLnBhY2thZ2Utc2VjdGlvbi10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3JlbW90ZXMnLCBcIlJlbW90ZVwiKS50b0xvY2FsZVVwcGVyQ2FzZSgpKSkpO1xuXHRcdFx0Zm9yIChjb25zdCByZW1vdGUgb2YgbWFuaWZlc3QucmVtb3Rlcykge1xuXHRcdFx0XHRjb25zdCBwYWNrYWdlc0dyaWQgPSBhcHBlbmQocGFja2FnZVNlY3Rpb24sICQoJy5wYWNrYWdlLWRldGFpbHMnKSk7XG5cdFx0XHRcdGFwcGVuZChwYWNrYWdlc0dyaWQsICQoJy5wYWNrYWdlLWRldGFpbCcsIHVuZGVmaW5lZCwgJCgnLmRldGFpbC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3VybCcsIFwiVVJMOlwiKSksICQoJy5kZXRhaWwtdmFsdWUnLCB1bmRlZmluZWQsIHJlbW90ZS51cmwpKSk7XG5cdFx0XHRcdGlmIChyZW1vdGUudHlwZSkge1xuXHRcdFx0XHRcdGFwcGVuZChwYWNrYWdlc0dyaWQsICQoJy5wYWNrYWdlLWRldGFpbCcsIHVuZGVmaW5lZCwgJCgnLmRldGFpbC1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3RyYW5zcG9ydCcsIFwiVHJhbnNwb3J0OlwiKSksICQoJy5kZXRhaWwtdmFsdWUnLCB1bmRlZmluZWQsIHJlbW90ZS50eXBlKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZW1vdGUuaGVhZGVycyAmJiByZW1vdGUuaGVhZGVycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGVhZGVyU3RyaW5ncyA9IHJlbW90ZS5oZWFkZXJzLm1hcCgoaGVhZGVyOiBJTWNwU2VydmVyS2V5VmFsdWVJbnB1dCkgPT4gYCR7aGVhZGVyLm5hbWV9OiAke2hlYWRlci52YWx1ZSA/PyAnJ31gKTtcblx0XHRcdFx0XHRhcHBlbmQocGFja2FnZXNHcmlkLCAkKCcucGFja2FnZS1kZXRhaWwnLCB1bmRlZmluZWQsICQoJy5kZXRhaWwtbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdoZWFkZXJzJywgXCJIZWFkZXJzOlwiKSksICQoJy5kZXRhaWwtdmFsdWUnLCB1bmRlZmluZWQsIGhlYWRlclN0cmluZ3Muam9pbignLCAnKSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQWRkaXRpb25hbERldGFpbHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGVudCA9ICQoJ2RpdicsIHsgY2xhc3M6ICdhZGRpdGlvbmFsLWRldGFpbHMtY29udGVudCcsIHRhYmluZGV4OiAnMCcgfSk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQoY29udGVudCwge30pO1xuXHRcdGNvbnN0IGxheW91dCA9ICgpID0+IHNjcm9sbGFibGVDb250ZW50LnNjYW5Eb21Ob2RlKCk7XG5cdFx0Y29uc3QgcmVtb3ZlTGF5b3V0UGFydGljaXBhbnQgPSBhcnJheXMuaW5zZXJ0KHRoaXMubGF5b3V0UGFydGljaXBhbnRzLCB7IGxheW91dCB9KTtcblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKHJlbW92ZUxheW91dFBhcnRpY2lwYW50KSk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHNjcm9sbGFibGVDb250ZW50KTtcblxuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFkZGl0aW9uYWxEZXRhaWxzV2lkZ2V0LCBjb250ZW50LCBleHRlbnNpb24pKTtcblxuXHRcdGFwcGVuZChjb250YWluZXIsIHNjcm9sbGFibGVDb250ZW50LmdldERvbU5vZGUoKSk7XG5cdFx0c2Nyb2xsYWJsZUNvbnRlbnQuc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZENvbnRlbnRzPFQ+KGxvYWRpbmdUYXNrOiAoKSA9PiBDYWNoZVJlc3VsdDxUPiwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdsb2FkaW5nJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQobG9hZGluZ1Rhc2soKSk7XG5cdFx0Y29uc3Qgb25Eb25lID0gKCkgPT4gY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2xvYWRpbmcnKTtcblx0XHRyZXN1bHQucHJvbWlzZS50aGVuKG9uRG9uZSwgb25Eb25lKTtcblxuXHRcdHJldHVybiByZXN1bHQucHJvbWlzZTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9uO1xuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLmZvckVhY2gocCA9PiBwLmxheW91dCgpKTtcblx0fVxuXG5cdHByaXZhdGUgb25FcnJvcihlcnI6IEVycm9yKTogdm9pZCB7XG5cdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHR9XG59XG5cbmNsYXNzIEFkZGl0aW9uYWxEZXRhaWxzV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlcixcblx0XHRASU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlbmRlcihleHRlbnNpb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5vbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdCgoKSA9PiB0aGlzLnJlbmRlcihleHRlbnNpb24pKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcihleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRhaW5lci5pbm5lclRleHQgPSAnJztcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoZXh0ZW5zaW9uLmxvY2FsKSB7XG5cdFx0XHR0aGlzLnJlbmRlckluc3RhbGxJbmZvKHRoaXMuY29udGFpbmVyLCBleHRlbnNpb24ubG9jYWwpO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb24uZ2FsbGVyeSkge1xuXHRcdFx0dGhpcy5yZW5kZXJNYXJrZXRwbGFjZUluZm8odGhpcy5jb250YWluZXIsIGV4dGVuc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyVGFncyh0aGlzLmNvbnRhaW5lciwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLnJlbmRlckV4dGVuc2lvblJlc291cmNlcyh0aGlzLmNvbnRhaW5lciwgZXh0ZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVGFncyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHRlbnNpb246IElXb3JrYmVuY2hNY3BTZXJ2ZXIpOiB2b2lkIHtcblx0XHRpZiAoZXh0ZW5zaW9uLmdhbGxlcnk/LnRvcGljcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBjYXRlZ29yaWVzQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNhdGVnb3JpZXMtY29udGFpbmVyLmFkZGl0aW9uYWwtZGV0YWlscy1lbGVtZW50JykpO1xuXHRcdFx0YXBwZW5kKGNhdGVnb3JpZXNDb250YWluZXIsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCd0YWdzJywgXCJUYWdzXCIpKSk7XG5cdFx0XHRjb25zdCBjYXRlZ29yaWVzRWxlbWVudCA9IGFwcGVuZChjYXRlZ29yaWVzQ29udGFpbmVyLCAkKCcuY2F0ZWdvcmllcycpKTtcblx0XHRcdGZvciAoY29uc3QgY2F0ZWdvcnkgb2YgZXh0ZW5zaW9uLmdhbGxlcnkudG9waWNzKSB7XG5cdFx0XHRcdGFwcGVuZChjYXRlZ29yaWVzRWxlbWVudCwgJCgnc3Bhbi5jYXRlZ29yeScsIHsgdGFiaW5kZXg6ICcwJyB9LCBjYXRlZ29yeSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyRXh0ZW5zaW9uUmVzb3VyY2VzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc291cmNlczogW3N0cmluZywgVGhlbWVJY29uLCBVUkldW10gPSBbXTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHRoaXMubWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRNY3BHYWxsZXJ5TWFuaWZlc3QoKTtcblx0XHRpZiAoZXh0ZW5zaW9uLnJlcG9zaXRvcnkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlc291cmNlcy5wdXNoKFtsb2NhbGl6ZSgncmVwb3NpdG9yeScsIFwiUmVwb3NpdG9yeVwiKSwgVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnJlcG8uaWQpLCBVUkkucGFyc2UoZXh0ZW5zaW9uLnJlcG9zaXRvcnkpXSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgey8qIElnbm9yZSAqLyB9XG5cdFx0fVxuXHRcdGlmIChtYW5pZmVzdCkge1xuXHRcdFx0Y29uc3Qgc3VwcG9ydFVyaSA9IGdldE1jcEdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpKG1hbmlmZXN0LCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLkNvbnRhY3RTdXBwb3J0VXJpKTtcblx0XHRcdGlmIChzdXBwb3J0VXJpKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLnB1c2goW2xvY2FsaXplKCdzdXBwb3J0JywgXCJDb250YWN0IFN1cHBvcnRcIiksIFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbi5pZCksIFVSSS5wYXJzZShzdXBwb3J0VXJpKV0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikgey8qIElnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChyZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25SZXNvdXJjZXNDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucmVzb3VyY2VzLWNvbnRhaW5lci5hZGRpdGlvbmFsLWRldGFpbHMtZWxlbWVudCcpKTtcblx0XHRcdGFwcGVuZChleHRlbnNpb25SZXNvdXJjZXNDb250YWluZXIsICQoJy5hZGRpdGlvbmFsLWRldGFpbHMtdGl0bGUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdyZXNvdXJjZXMnLCBcIlJlc291cmNlc1wiKSkpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzRWxlbWVudCA9IGFwcGVuZChleHRlbnNpb25SZXNvdXJjZXNDb250YWluZXIsICQoJy5yZXNvdXJjZXMnKSk7XG5cdFx0XHRmb3IgKGNvbnN0IFtsYWJlbCwgaWNvbiwgdXJpXSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VFbGVtZW50ID0gYXBwZW5kKHJlc291cmNlc0VsZW1lbnQsICQoJy5yZXNvdXJjZScpKTtcblx0XHRcdFx0YXBwZW5kKHJlc291cmNlRWxlbWVudCwgJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpY29uKSkpO1xuXHRcdFx0XHRhcHBlbmQocmVzb3VyY2VFbGVtZW50LCAkKCdhJywgeyB0YWJpbmRleDogJzAnIH0sIGxhYmVsKSk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG9uQ2xpY2socmVzb3VyY2VFbGVtZW50LCAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmkpKSk7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCByZXNvdXJjZUVsZW1lbnQsIHVyaS50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbnN0YWxsSW5mbyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBleHRlbnNpb246IElMb2NhbE1jcFNlcnZlcik6IHZvaWQge1xuXHRcdGNvbnN0IGluc3RhbGxJbmZvQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vcmUtaW5mby1jb250YWluZXIuYWRkaXRpb25hbC1kZXRhaWxzLWVsZW1lbnQnKSk7XG5cdFx0YXBwZW5kKGluc3RhbGxJbmZvQ29udGFpbmVyLCAkKCcuYWRkaXRpb25hbC1kZXRhaWxzLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnSW5zdGFsbCBJbmZvJywgXCJJbnN0YWxsYXRpb25cIikpKTtcblx0XHRjb25zdCBpbnN0YWxsSW5mbyA9IGFwcGVuZChpbnN0YWxsSW5mb0NvbnRhaW5lciwgJCgnLm1vcmUtaW5mbycpKTtcblx0XHRhcHBlbmQoaW5zdGFsbEluZm8sXG5cdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdpZCcsIFwiSWRlbnRpZmllclwiKSksXG5cdFx0XHRcdCQoJ2NvZGUnLCB1bmRlZmluZWQsIGV4dGVuc2lvbi5uYW1lKVxuXHRcdFx0KSk7XG5cdFx0aWYgKGV4dGVuc2lvbi52ZXJzaW9uKSB7XG5cdFx0XHRhcHBlbmQoaW5zdGFsbEluZm8sXG5cdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnVmVyc2lvbicsIFwiVmVyc2lvblwiKSksXG5cdFx0XHRcdFx0JCgnY29kZScsIHVuZGVmaW5lZCwgZXh0ZW5zaW9uLnZlcnNpb24pXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYXJrZXRwbGFjZUluZm8oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXh0ZW5zaW9uOiBJV29ya2JlbmNoTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZ2FsbGVyeSA9IGV4dGVuc2lvbi5nYWxsZXJ5O1xuXHRcdGNvbnN0IG1vcmVJbmZvQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vcmUtaW5mby1jb250YWluZXIuYWRkaXRpb25hbC1kZXRhaWxzLWVsZW1lbnQnKSk7XG5cdFx0YXBwZW5kKG1vcmVJbmZvQ29udGFpbmVyLCAkKCcuYWRkaXRpb25hbC1kZXRhaWxzLXRpdGxlJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnTWFya2V0cGxhY2UgSW5mbycsIFwiTWFya2V0cGxhY2VcIikpKTtcblx0XHRjb25zdCBtb3JlSW5mbyA9IGFwcGVuZChtb3JlSW5mb0NvbnRhaW5lciwgJCgnLm1vcmUtaW5mbycpKTtcblx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0aWYgKCFleHRlbnNpb24ubG9jYWwpIHtcblx0XHRcdFx0YXBwZW5kKG1vcmVJbmZvLFxuXHRcdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdpZCcsIFwiSWRlbnRpZmllclwiKSksXG5cdFx0XHRcdFx0XHQkKCdjb2RlJywgdW5kZWZpbmVkLCBleHRlbnNpb24ubmFtZSlcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0aWYgKGdhbGxlcnkudmVyc2lvbikge1xuXHRcdFx0XHRcdGFwcGVuZChtb3JlSW5mbyxcblx0XHRcdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdCQoJ2Rpdi5tb3JlLWluZm8tZW50cnktbmFtZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ1ZlcnNpb24nLCBcIlZlcnNpb25cIikpLFxuXHRcdFx0XHRcdFx0XHQkKCdjb2RlJywgdW5kZWZpbmVkLCBnYWxsZXJ5LnZlcnNpb24pXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGdhbGxlcnkubGFzdFVwZGF0ZWQpIHtcblx0XHRcdFx0YXBwZW5kKG1vcmVJbmZvLFxuXHRcdFx0XHRcdCQoJy5tb3JlLWluZm8tZW50cnknLCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQkKCdkaXYubW9yZS1pbmZvLWVudHJ5LW5hbWUnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdsYXN0IHVwZGF0ZWQnLCBcIkxhc3QgUmVsZWFzZWRcIikpLFxuXHRcdFx0XHRcdFx0JCgnZGl2Jywge1xuXHRcdFx0XHRcdFx0XHQndGl0bGUnOiBuZXcgRGF0ZShnYWxsZXJ5Lmxhc3RVcGRhdGVkKS50b1N0cmluZygpXG5cdFx0XHRcdFx0XHR9LCBmcm9tTm93KGdhbGxlcnkubGFzdFVwZGF0ZWQsIHRydWUsIHRydWUsIHRydWUpKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGlmIChnYWxsZXJ5LnB1Ymxpc2hEYXRlKSB7XG5cdFx0XHRcdGFwcGVuZChtb3JlSW5mbyxcblx0XHRcdFx0XHQkKCcubW9yZS1pbmZvLWVudHJ5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0JCgnZGl2Lm1vcmUtaW5mby1lbnRyeS1uYW1lJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgncHVibGlzaGVkJywgXCJQdWJsaXNoZWRcIikpLFxuXHRcdFx0XHRcdFx0JCgnZGl2Jywge1xuXHRcdFx0XHRcdFx0XHQndGl0bGUnOiBuZXcgRGF0ZShnYWxsZXJ5LnB1Ymxpc2hEYXRlKS50b1N0cmluZygpXG5cdFx0XHRcdFx0XHR9LCBmcm9tTm93KGdhbGxlcnkucHVibGlzaERhdGUsIHRydWUsIHRydWUsIHRydWUpKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBYyxRQUFRLFdBQVcsdUJBQXVCO0FBQ2pFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRC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
