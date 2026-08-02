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
import "./media/mcpServersView.css";
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../base/common/htmlContent.js";
import { combinedDisposable, Disposable, DisposableStore, dispose, isDisposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { DelayedPagedModel, PagedModel, IterativePagedModel } from "../../../../base/common/paging.js";
import { localize, localize2 } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyDefinedExpr, ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchPagedList } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { getLocationBasedViewColors } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService, ViewContainerLocation, Extensions as ViewExtensions } from "../../../common/views.js";
import { HasInstalledMcpServersContext, IMcpWorkbenchService, InstalledMcpServersViewId, McpServerContainers, McpServerEnablementState, McpServersGalleryStatusContext } from "../common/mcpTypes.js";
import { DropDownAction, getContextMenuActions, InstallAction, InstallingLabelAction, ManageMcpServerAction, McpServerStatusAction } from "./mcpServerActions.js";
import { PublisherWidget, StarredWidget, McpServerIconWidget, McpServerHoverWidget, McpServerScopeBadgeWidget } from "./mcpServerWidgets.js";
import { ActionRunner, Separator } from "../../../../base/common/actions.js";
import { mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig } from "../../../../platform/mcp/common/mcpManagement.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { DefaultViewsContext, SearchMcpServersContext } from "../../extensions/common/extensions.js";
import { VIEW_CONTAINER } from "../../extensions/browser/extensions.contribution.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { AbstractExtensionsListView } from "../../extensions/browser/extensionsViews.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IWorkbenchLayoutService, Position } from "../../../services/layout/browser/layoutService.js";
import { mcpServerIcon } from "./mcpServerIcons.js";
import { IMcpGalleryManifestService, McpGalleryManifestStatus } from "../../../../platform/mcp/common/mcpGalleryManifest.js";
import { ProductQualityContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { buildModalNavigationForPagedList } from "../../extensions/browser/extensionsViewer.js";
let McpServersListView = class extends AbstractExtensionsListView {
  constructor(mpcViewOptions, options, keybindingService, contextMenuService, instantiationService, themeService, hoverService, configurationService, contextKeyService, viewDescriptorService, openerService, dialogService, mcpWorkbenchService, mcpGalleryManifestService, layoutService, markdownRendererService, logService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.mpcViewOptions = mpcViewOptions;
    this.dialogService = dialogService;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.mcpGalleryManifestService = mcpGalleryManifestService;
    this.layoutService = layoutService;
    this.markdownRendererService = markdownRendererService;
    this.logService = logService;
    this.list = null;
    this.listContainer = null;
    this.welcomeContainer = null;
    this.contextMenuActionRunner = this._register(new ActionRunner());
    this.modalNavigationDisposable = this._register(new MutableDisposable());
  }
  renderBody(container) {
    super.renderBody(container);
    this.welcomeContainer = dom.append(container, dom.$(".mcp-welcome-container.hide"));
    this.createWelcomeContent(this.welcomeContainer);
    const messageContainer = dom.append(container, dom.$(".message-container"));
    const messageSeverityIcon = dom.append(messageContainer, dom.$(""));
    const messageBox = dom.append(messageContainer, dom.$(".message"));
    const mcpServersList = dom.$(".mcp-servers-list");
    this.bodyTemplate = {
      mcpServersList,
      messageBox,
      messageContainer,
      messageSeverityIcon
    };
    this.listContainer = dom.append(container, mcpServersList);
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchPagedList,
      `${this.id}-MCP-Servers`,
      this.listContainer,
      {
        getHeight() {
          return 72;
        },
        getTemplateId: () => McpServerRenderer.templateId
      },
      [this.instantiationService.createInstance(McpServerRenderer, {
        hoverOptions: {
          position: () => {
            const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
            if (viewLocation === ViewContainerLocation.Sidebar) {
              return this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
            }
            if (viewLocation === ViewContainerLocation.AuxiliaryBar) {
              return this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
            }
            return HoverPosition.RIGHT;
          }
        }
      })],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(mcpServer) {
            return mcpServer?.label ?? "";
          },
          getWidgetAriaLabel() {
            return localize("mcp servers", "MCP Servers");
          }
        },
        overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles,
        openOnSingleClick: true
      }
    ));
    this._register(Event.debounce(Event.filter(this.list.onDidOpen, (e) => e.element !== null), (_, event) => event, 75, true)((options) => {
      this.mcpWorkbenchService.open(options.element, {
        ...options.editorOptions,
        modal: options.sideBySide ? void 0 : buildModalNavigationForPagedList(
          options.element,
          () => this.list?.model,
          (serverA, serverB) => serverA.id === serverB.id,
          (server, modal) => this.mcpWorkbenchService.open(server, { pinned: false, modal }),
          this.modalNavigationDisposable,
          this.logService
        )
      });
    }));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e), this));
    if (this.input) {
      this.renderInput();
    }
  }
  async onContextMenu(e) {
    if (e.element) {
      const disposables = new DisposableStore();
      const mcpServer = e.element ? this.mcpWorkbenchService.local.find((local) => local.id === e.element.id) || e.element : e.element;
      const groups = getContextMenuActions(mcpServer, false, this.instantiationService);
      const actions = [];
      for (const menuActions of groups) {
        for (const menuAction of menuActions) {
          actions.push(menuAction);
          if (isDisposable(menuAction)) {
            disposables.add(menuAction);
          }
        }
        actions.push(new Separator());
      }
      actions.pop();
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions,
        actionRunner: this.contextMenuActionRunner,
        onHide: () => disposables.dispose()
      });
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.list?.layout(height, width);
  }
  async show(query) {
    if (this.input) {
      this.input.disposables.dispose();
      this.input = void 0;
    }
    if (this.mpcViewOptions.showWelcome) {
      this.input = { model: new PagedModel([]), disposables: new DisposableStore(), showWelcomeContent: true };
    } else {
      this.input = await this.query(query.trim());
    }
    this.renderInput();
    if (this.input.onDidChangeModel) {
      this.input.disposables.add(this.input.onDidChangeModel((model) => {
        if (!this.input) {
          return;
        }
        this.input.model = model;
        this.renderInput();
      }));
    }
    return this.input.model;
  }
  renderInput() {
    if (!this.input) {
      return;
    }
    if (this.list) {
      this.list.model = new DelayedPagedModel(this.input.model);
    }
    this.showWelcomeContent(!!this.input.showWelcomeContent);
    if (!this.input.showWelcomeContent) {
      this.updateBody();
    }
  }
  showWelcomeContent(show) {
    this.welcomeContainer?.classList.toggle("hide", !show);
    this.listContainer?.classList.toggle("hide", show);
  }
  createWelcomeContent(welcomeContainer) {
    const welcomeContent = dom.append(welcomeContainer, dom.$(".mcp-welcome-content"));
    const iconContainer = dom.append(welcomeContent, dom.$(".mcp-welcome-icon"));
    const iconElement = dom.append(iconContainer, dom.$("span"));
    iconElement.className = ThemeIcon.asClassName(mcpServerIcon);
    const title = dom.append(welcomeContent, dom.$(".mcp-welcome-title"));
    title.textContent = localize("mcp.welcome.title", "MCP Servers");
    const settingsCommandLink = createMarkdownCommandLink({ id: "workbench.action.openSettings", arguments: [`@id:${mcpGalleryServiceEnablementConfig}`], text: mcpGalleryServiceEnablementConfig, tooltip: localize("mcp.welcome.settings.tooltip", "Open Settings") }).toString();
    const description = dom.append(welcomeContent, dom.$(".mcp-welcome-description"));
    const markdownResult = this._register(this.markdownRendererService.render(
      new MarkdownString(
        localize("mcp.welcome.descriptionWithLink", "Browse and install [Model Context Protocol (MCP) servers](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) directly from VS Code to extend agent mode with extra tools for connecting to databases, invoking APIs and performing specialized tasks."),
        { isTrusted: { enabledCommands: ["workbench.action.openSettings"] } }
      ).appendMarkdown("\n\n").appendMarkdown(localize("mcp.gallery.enableDialog.setting", "This feature is currently in preview. You can disable it anytime using the setting {0}.", settingsCommandLink))
    ));
    description.appendChild(markdownResult.element);
    const buttonContainer = dom.append(welcomeContent, dom.$(".mcp-welcome-button-container"));
    const button = this._register(new Button(buttonContainer, {
      title: localize("mcp.welcome.enableGalleryButton", "Enable MCP Servers Marketplace"),
      ...defaultButtonStyles
    }));
    button.label = localize("mcp.welcome.enableGalleryButton", "Enable MCP Servers Marketplace");
    this._register(button.onDidClick(async () => {
      const { result } = await this.dialogService.prompt({
        type: "info",
        message: localize("mcp.gallery.enableDialog.title", "Enable MCP Servers Marketplace?"),
        custom: {
          markdownDetails: [{
            markdown: new MarkdownString(localize("mcp.gallery.enableDialog.setting", "This feature is currently in preview. You can disable it anytime using the setting {0}.", settingsCommandLink), { isTrusted: true })
          }]
        },
        buttons: [
          { label: localize("mcp.gallery.enableDialog.enable", "Enable"), run: () => true },
          { label: localize("mcp.gallery.enableDialog.cancel", "Cancel"), run: () => false }
        ]
      });
      if (result) {
        await this.configurationService.updateValue(mcpGalleryServiceEnablementConfig, true);
      }
    }));
  }
  updateBody(message) {
    if (this.bodyTemplate) {
      const count = this.input?.model.length ?? 0;
      this.bodyTemplate.mcpServersList.classList.toggle("hidden", count === 0);
      this.bodyTemplate.messageContainer.classList.toggle("hidden", !message && count > 0);
      if (this.isBodyVisible()) {
        if (message) {
          this.bodyTemplate.messageSeverityIcon.className = SeverityIcon.className(message.severity);
          this.bodyTemplate.messageBox.textContent = message.text;
        } else if (count === 0) {
          this.bodyTemplate.messageSeverityIcon.className = "";
          this.bodyTemplate.messageBox.textContent = localize("no extensions found", "No MCP Servers found.");
        }
        if (this.bodyTemplate.messageBox.textContent) {
          alert(this.bodyTemplate.messageBox.textContent);
        }
      }
    }
  }
  async query(query) {
    const disposables = new DisposableStore();
    if (query) {
      const servers2 = await this.mcpWorkbenchService.queryGallery({ text: query.replace("@mcp", "") });
      const model = disposables.add(new IterativePagedModel(servers2));
      return { model, disposables };
    }
    const onDidChangeModel = disposables.add(new Emitter());
    let servers = await this.mcpWorkbenchService.queryLocal();
    disposables.add(Event.debounce(this.mcpWorkbenchService.onChange, () => void 0)(() => {
      const mergedMcpServers = this.mergeChangedMcpServers(servers, [...this.mcpWorkbenchService.local]);
      if (mergedMcpServers) {
        servers = mergedMcpServers;
        onDidChangeModel.fire(new PagedModel(servers));
      }
    }));
    disposables.add(this.mcpWorkbenchService.onReset(() => onDidChangeModel.fire(new PagedModel([...this.mcpWorkbenchService.local]))));
    return { model: new PagedModel(servers), onDidChangeModel: onDidChangeModel.event, disposables };
  }
  mergeChangedMcpServers(mcpServers, newMcpServers) {
    const oldMcpServers = [...mcpServers];
    const findPreviousMcpServerIndex = (from) => {
      let index = -1;
      const previousMcpServerInNew = newMcpServers[from];
      if (previousMcpServerInNew) {
        index = oldMcpServers.findIndex((e) => e.id === previousMcpServerInNew.id);
        if (index === -1) {
          return findPreviousMcpServerIndex(from - 1);
        }
      }
      return index;
    };
    let hasChanged = false;
    for (let index = 0; index < newMcpServers.length; index++) {
      const newMcpServer = newMcpServers[index];
      if (mcpServers.every((r) => r.id !== newMcpServer.id)) {
        hasChanged = true;
        mcpServers.splice(findPreviousMcpServerIndex(index - 1) + 1, 0, newMcpServer);
      }
    }
    for (let index = mcpServers.length - 1; index >= 0; index--) {
      const oldMcpServer = mcpServers[index];
      if (newMcpServers.every((r) => r.id !== oldMcpServer.id) && newMcpServers.some((r) => r.name === oldMcpServer.name)) {
        hasChanged = true;
        mcpServers.splice(index, 1);
      }
    }
    if (!hasChanged) {
      if (mcpServers.length === newMcpServers.length) {
        for (let index = 0; index < newMcpServers.length; index++) {
          if (mcpServers[index]?.id !== newMcpServers[index]?.id) {
            hasChanged = true;
            mcpServers = newMcpServers;
            break;
          }
        }
      }
    }
    return hasChanged ? mcpServers : void 0;
  }
};
McpServersListView = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IDialogService),
  __decorateParam(12, IMcpWorkbenchService),
  __decorateParam(13, IMcpGalleryManifestService),
  __decorateParam(14, IWorkbenchLayoutService),
  __decorateParam(15, IMarkdownRendererService),
  __decorateParam(16, ILogService)
], McpServersListView);
let McpServerRenderer = class {
  constructor(options, instantiationService, mcpWorkbenchService, notificationService) {
    this.options = options;
    this.instantiationService = instantiationService;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.notificationService = notificationService;
    this.templateId = McpServerRenderer.templateId;
  }
  renderTemplate(root) {
    const element = dom.append(root, dom.$(".mcp-server-item.extension-list-item"));
    const iconContainer = dom.append(element, dom.$(".icon-container"));
    const iconWidget = this.instantiationService.createInstance(McpServerIconWidget, iconContainer);
    const details = dom.append(element, dom.$(".details"));
    const headerContainer = dom.append(details, dom.$(".header-container"));
    const header = dom.append(headerContainer, dom.$(".header"));
    const name = dom.append(header, dom.$("span.name"));
    const starred = dom.append(header, dom.$("span.ratings"));
    const description = dom.append(details, dom.$(".description.ellipsis"));
    const footer = dom.append(details, dom.$(".footer"));
    const publisherWidget = this.instantiationService.createInstance(PublisherWidget, dom.append(footer, dom.$(".publisher-container")), true);
    const actionbar = new ActionBar(footer, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof DropDownAction) {
          return action.createActionViewItem(options);
        }
        return void 0;
      },
      focusOnlyEnabledItems: true
    });
    actionbar.setFocusable(false);
    const actionBarListener = actionbar.onDidRun(({ error }) => error && this.notificationService.error(error));
    const mcpServerStatusAction = this.instantiationService.createInstance(McpServerStatusAction);
    const actions = [
      this.instantiationService.createInstance(InstallAction, true),
      this.instantiationService.createInstance(InstallingLabelAction),
      this.instantiationService.createInstance(ManageMcpServerAction, false),
      mcpServerStatusAction
    ];
    const widgets = [
      iconWidget,
      publisherWidget,
      this.instantiationService.createInstance(StarredWidget, starred, true),
      this.instantiationService.createInstance(McpServerScopeBadgeWidget, iconContainer),
      this.instantiationService.createInstance(McpServerHoverWidget, { target: root, position: this.options.hoverOptions.position }, mcpServerStatusAction)
    ];
    const extensionContainers = this.instantiationService.createInstance(McpServerContainers, [...actions, ...widgets]);
    actionbar.push(actions, { icon: true, label: true });
    const disposable = combinedDisposable(...actions, ...widgets, actionbar, actionBarListener, extensionContainers);
    return {
      root,
      element,
      name,
      description,
      starred,
      disposables: [disposable],
      actionbar,
      mcpServerDisposables: [],
      set mcpServer(mcpServer) {
        extensionContainers.mcpServer = mcpServer;
      }
    };
  }
  renderPlaceholder(index, data) {
    data.element.classList.add("loading");
    data.mcpServerDisposables = dispose(data.mcpServerDisposables);
    data.name.textContent = "";
    data.description.textContent = "";
    data.starred.style.display = "none";
    data.mcpServer = null;
  }
  renderElement(mcpServer, index, data) {
    data.element.classList.remove("loading");
    data.mcpServerDisposables = dispose(data.mcpServerDisposables);
    data.root.setAttribute("data-mcp-server-id", mcpServer.id);
    data.name.textContent = mcpServer.label;
    data.description.textContent = mcpServer.description;
    data.starred.style.display = "";
    data.mcpServer = mcpServer;
    const updateEnablement = () => data.root.classList.toggle("disabled", !!mcpServer.runtimeStatus?.state && mcpServer.runtimeStatus.state !== McpServerEnablementState.Enabled);
    updateEnablement();
    data.mcpServerDisposables.push(this.mcpWorkbenchService.onChange((e) => {
      if (!e || e.id === mcpServer.id) {
        updateEnablement();
      }
    }));
  }
  disposeElement(mcpServer, index, data) {
    data.mcpServerDisposables = dispose(data.mcpServerDisposables);
  }
  disposeTemplate(data) {
    data.mcpServerDisposables = dispose(data.mcpServerDisposables);
    data.disposables = dispose(data.disposables);
  }
};
McpServerRenderer.templateId = "mcpServer";
McpServerRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IMcpWorkbenchService),
  __decorateParam(3, INotificationService)
], McpServerRenderer);
class DefaultBrowseMcpServersView extends McpServersListView {
  renderBody(container) {
    super.renderBody(container);
    this._register(this.mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => this.show()));
  }
  async show() {
    return super.show("@mcp");
  }
}
class McpServersViewsContribution extends Disposable {
  constructor() {
    super();
    Registry.as(ViewExtensions.ViewsRegistry).registerViews([
      {
        id: InstalledMcpServersViewId,
        name: localize2("mcp-installed", "MCP Servers - Installed"),
        ctorDescriptor: new SyncDescriptor(McpServersListView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext, ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        weight: 40,
        order: 4,
        canToggleVisibility: true
      },
      {
        id: "workbench.views.mcp.default.marketplace",
        name: localize2("mcp", "MCP Servers"),
        ctorDescriptor: new SyncDescriptor(DefaultBrowseMcpServersView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext.toNegated(), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate(), McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyExpr.or(ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`), ProductQualityContext.notEqualsTo("stable"), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`))),
        weight: 40,
        order: 4,
        canToggleVisibility: true
      },
      {
        id: "workbench.views.mcp.marketplace",
        name: localize2("mcp", "MCP Servers"),
        ctorDescriptor: new SyncDescriptor(McpServersListView, [{}]),
        when: ContextKeyExpr.and(SearchMcpServersContext, ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate(), McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyExpr.or(ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`), ProductQualityContext.notEqualsTo("stable"), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`)))
      },
      {
        id: "workbench.views.mcp.default.welcomeView",
        name: localize2("mcp", "MCP Servers"),
        ctorDescriptor: new SyncDescriptor(DefaultBrowseMcpServersView, [{ showWelcome: true }]),
        when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledMcpServersContext.toNegated(), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate(), McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`).negate(), ProductQualityContext.isEqualTo("stable"), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`).negate()),
        weight: 40,
        order: 4,
        canToggleVisibility: true
      },
      {
        id: "workbench.views.mcp.welcomeView",
        name: localize2("mcp", "MCP Servers"),
        ctorDescriptor: new SyncDescriptor(McpServersListView, [{ showWelcome: true }]),
        when: ContextKeyExpr.and(SearchMcpServersContext, ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate(), McpServersGalleryStatusContext.isEqualTo(McpGalleryManifestStatus.Available), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceUrlConfig}`).negate(), ProductQualityContext.isEqualTo("stable"), ContextKeyDefinedExpr.create(`config.${mcpGalleryServiceEnablementConfig}`).negate())
      }
    ], VIEW_CONTAINER);
  }
}
McpServersViewsContribution.ID = "workbench.mcp.servers.views.contribution";
export {
  DefaultBrowseMcpServersView,
  McpServersListView,
  McpServersViewsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFNlcnZlcnNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL21jcFNlcnZlcnNWaWV3LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJTGlzdENvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWFya2Rvd25Db21tYW5kTGluaywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIGlzRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVsYXllZFBhZ2VkTW9kZWwsIElQYWdlZE1vZGVsLCBQYWdlZE1vZGVsLCBJdGVyYXRpdmVQYWdlZE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFnaW5nLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RGVmaW5lZEV4cHIsIENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoUGFnZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBJVmlld3NSZWdpc3RyeSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBFeHRlbnNpb25zIGFzIFZpZXdFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEhhc0luc3RhbGxlZE1jcFNlcnZlcnNDb250ZXh0LCBJTWNwV29ya2JlbmNoU2VydmljZSwgSW5zdGFsbGVkTWNwU2VydmVyc1ZpZXdJZCwgSVdvcmtiZW5jaE1jcFNlcnZlciwgTWNwU2VydmVyQ29udGFpbmVycywgTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLCBNY3BTZXJ2ZXJzR2FsbGVyeVN0YXR1c0NvbnRleHQgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgRHJvcERvd25BY3Rpb24sIGdldENvbnRleHRNZW51QWN0aW9ucywgSW5zdGFsbEFjdGlvbiwgSW5zdGFsbGluZ0xhYmVsQWN0aW9uLCBNYW5hZ2VNY3BTZXJ2ZXJBY3Rpb24sIE1jcFNlcnZlclN0YXR1c0FjdGlvbiB9IGZyb20gJy4vbWNwU2VydmVyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQdWJsaXNoZXJXaWRnZXQsIFN0YXJyZWRXaWRnZXQsIE1jcFNlcnZlckljb25XaWRnZXQsIE1jcFNlcnZlckhvdmVyV2lkZ2V0LCBNY3BTZXJ2ZXJTY29wZUJhZGdlV2lkZ2V0IH0gZnJvbSAnLi9tY3BTZXJ2ZXJXaWRnZXRzLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgbWNwR2FsbGVyeVNlcnZpY2VFbmFibGVtZW50Q29uZmlnLCBtY3BHYWxsZXJ5U2VydmljZVVybENvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IERlZmF1bHRWaWV3c0NvbnRleHQsIFNlYXJjaE1jcFNlcnZlcnNDb250ZXh0IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBWSUVXX0NPTlRBSU5FUiB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXh0ZW5zaW9uc0xpc3RWaWV3IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNWaWV3cy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25MaXN0UmVuZGVyZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNMaXN0LmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBtY3BTZXJ2ZXJJY29uIH0gZnJvbSAnLi9tY3BTZXJ2ZXJJY29ucy5qcyc7XG5pbXBvcnQgeyBJUGFnZWRSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RQYWdpbmcuanMnO1xuaW1wb3J0IHsgSU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsIE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IFByb2R1Y3RRdWFsaXR5Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNldmVyaXR5SWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZXZlcml0eUljb24vc2V2ZXJpdHlJY29uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGJ1aWxkTW9kYWxOYXZpZ2F0aW9uRm9yUGFnZWRMaXN0IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNWaWV3ZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1jcFNlcnZlckxpc3RWaWV3T3B0aW9ucyB7XG5cdHNob3dXZWxjb21lPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElRdWVyeVJlc3VsdCB7XG5cdG1vZGVsOiBJUGFnZWRNb2RlbDxJV29ya2JlbmNoTWNwU2VydmVyPjtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0c2hvd1dlbGNvbWVDb250ZW50PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbD86IEV2ZW50PElQYWdlZE1vZGVsPElXb3JrYmVuY2hNY3BTZXJ2ZXI+Pjtcbn1cblxudHlwZSBNZXNzYWdlID0ge1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNldmVyaXR5OiBTZXZlcml0eTtcbn07XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJzTGlzdFZpZXcgZXh0ZW5kcyBBYnN0cmFjdEV4dGVuc2lvbnNMaXN0VmlldzxJV29ya2JlbmNoTWNwU2VydmVyPiB7XG5cblx0cHJpdmF0ZSBsaXN0OiBXb3JrYmVuY2hQYWdlZExpc3Q8SVdvcmtiZW5jaE1jcFNlcnZlcj4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBsaXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHdlbGNvbWVDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgYm9keVRlbXBsYXRlOiB7XG5cdFx0bWVzc2FnZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdFx0bWVzc2FnZVNldmVyaXR5SWNvbjogSFRNTEVsZW1lbnQ7XG5cdFx0bWVzc2FnZUJveDogSFRNTEVsZW1lbnQ7XG5cdFx0bWNwU2VydmVyc0xpc3Q6IEhUTUxFbGVtZW50O1xuXHR9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51QWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvblJ1bm5lcigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RhbE5hdmlnYXRpb25EaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIGlucHV0OiBJUXVlcnlSZXN1bHQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtcGNWaWV3T3B0aW9uczogTWNwU2VydmVyTGlzdFZpZXdPcHRpb25zLFxuXHRcdG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHQvLyBDcmVhdGUgd2VsY29tZSBjb250YWluZXJcblx0XHR0aGlzLndlbGNvbWVDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5tY3Atd2VsY29tZS1jb250YWluZXIuaGlkZScpKTtcblx0XHR0aGlzLmNyZWF0ZVdlbGNvbWVDb250ZW50KHRoaXMud2VsY29tZUNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBtZXNzYWdlQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcubWVzc2FnZS1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbWVzc2FnZVNldmVyaXR5SWNvbiA9IGRvbS5hcHBlbmQobWVzc2FnZUNvbnRhaW5lciwgZG9tLiQoJycpKTtcblx0XHRjb25zdCBtZXNzYWdlQm94ID0gZG9tLmFwcGVuZChtZXNzYWdlQ29udGFpbmVyLCBkb20uJCgnLm1lc3NhZ2UnKSk7XG5cdFx0Y29uc3QgbWNwU2VydmVyc0xpc3QgPSBkb20uJCgnLm1jcC1zZXJ2ZXJzLWxpc3QnKTtcblxuXHRcdHRoaXMuYm9keVRlbXBsYXRlID0ge1xuXHRcdFx0bWNwU2VydmVyc0xpc3QsXG5cdFx0XHRtZXNzYWdlQm94LFxuXHRcdFx0bWVzc2FnZUNvbnRhaW5lcixcblx0XHRcdG1lc3NhZ2VTZXZlcml0eUljb25cblx0XHR9O1xuXG5cdFx0dGhpcy5saXN0Q29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIG1jcFNlcnZlcnNMaXN0KTtcblx0XHR0aGlzLmxpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFBhZ2VkTGlzdCxcblx0XHRcdGAke3RoaXMuaWR9LU1DUC1TZXJ2ZXJzYCxcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0Z2V0SGVpZ2h0KCkgeyByZXR1cm4gNzI7IH0sXG5cdFx0XHRcdGdldFRlbXBsYXRlSWQ6ICgpID0+IE1jcFNlcnZlclJlbmRlcmVyLnRlbXBsYXRlSWQsXG5cdFx0XHR9LFxuXHRcdFx0W3RoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2VydmVyUmVuZGVyZXIsIHtcblx0XHRcdFx0aG92ZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cG9zaXRpb246ICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHZpZXdMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodGhpcy5pZCk7XG5cdFx0XHRcdFx0XHRpZiAodmlld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpID09PSBQb3NpdGlvbi5MRUZUID8gSG92ZXJQb3NpdGlvbi5SSUdIVCA6IEhvdmVyUG9zaXRpb24uTEVGVDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICh2aWV3TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IEhvdmVyUG9zaXRpb24uTEVGVCA6IEhvdmVyUG9zaXRpb24uUklHSFQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gSG92ZXJQb3NpdGlvbi5SSUdIVDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pXSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwobWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbWNwU2VydmVyPy5sYWJlbCA/PyAnJztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtY3Agc2VydmVycycsIFwiTUNQIFNlcnZlcnNcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnModGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh0aGlzLmlkKSkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdH0pIGFzIFdvcmtiZW5jaFBhZ2VkTGlzdDxJV29ya2JlbmNoTWNwU2VydmVyPik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UoRXZlbnQuZmlsdGVyKHRoaXMubGlzdC5vbkRpZE9wZW4sIGUgPT4gZS5lbGVtZW50ICE9PSBudWxsKSwgKF8sIGV2ZW50KSA9PiBldmVudCwgNzUsIHRydWUpKG9wdGlvbnMgPT4ge1xuXHRcdFx0dGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLm9wZW4ob3B0aW9ucy5lbGVtZW50ISwge1xuXHRcdFx0XHQuLi5vcHRpb25zLmVkaXRvck9wdGlvbnMsXG5cdFx0XHRcdG1vZGFsOiBvcHRpb25zLnNpZGVCeVNpZGUgPyB1bmRlZmluZWQgOiBidWlsZE1vZGFsTmF2aWdhdGlvbkZvclBhZ2VkTGlzdChcblx0XHRcdFx0XHRvcHRpb25zLmVsZW1lbnQhLFxuXHRcdFx0XHRcdCgpID0+IHRoaXMubGlzdD8ubW9kZWwsXG5cdFx0XHRcdFx0KHNlcnZlckEsIHNlcnZlckIpID0+IHNlcnZlckEuaWQgPT09IHNlcnZlckIuaWQsXG5cdFx0XHRcdFx0KHNlcnZlciwgbW9kYWwpID0+IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5vcGVuKHNlcnZlciwgeyBwaW5uZWQ6IGZhbHNlLCBtb2RhbCB9KSxcblx0XHRcdFx0XHR0aGlzLm1vZGFsTmF2aWdhdGlvbkRpc3Bvc2FibGUsXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlXG5cdFx0XHRcdCksXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSksIHRoaXMpKTtcblxuXHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHR0aGlzLnJlbmRlcklucHV0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkNvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxJV29ya2JlbmNoTWNwU2VydmVyPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgbWNwU2VydmVyID0gZS5lbGVtZW50ID8gdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQobG9jYWwgPT4gbG9jYWwuaWQgPT09IGUuZWxlbWVudCEuaWQpIHx8IGUuZWxlbWVudFxuXHRcdFx0XHQ6IGUuZWxlbWVudDtcblx0XHRcdGNvbnN0IGdyb3VwczogSUFjdGlvbltdW10gPSBnZXRDb250ZXh0TWVudUFjdGlvbnMobWNwU2VydmVyLCBmYWxzZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgbWVudUFjdGlvbnMgb2YgZ3JvdXBzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbWVudUFjdGlvbiBvZiBtZW51QWN0aW9ucykge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaChtZW51QWN0aW9uKTtcblx0XHRcdFx0XHRpZiAoaXNEaXNwb3NhYmxlKG1lbnVBY3Rpb24pKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobWVudUFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXHRcdFx0YWN0aW9ucy5wb3AoKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5jb250ZXh0TWVudUFjdGlvblJ1bm5lcixcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLmxpc3Q/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdGFzeW5jIHNob3cocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SVBhZ2VkTW9kZWw8SVdvcmtiZW5jaE1jcFNlcnZlcj4+IHtcblx0XHRpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0dGhpcy5pbnB1dC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmlucHV0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm1wY1ZpZXdPcHRpb25zLnNob3dXZWxjb21lKSB7XG5cdFx0XHR0aGlzLmlucHV0ID0geyBtb2RlbDogbmV3IFBhZ2VkTW9kZWwoW10pLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCBzaG93V2VsY29tZUNvbnRlbnQ6IHRydWUgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dCA9IGF3YWl0IHRoaXMucXVlcnkocXVlcnkudHJpbSgpKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcklucHV0KCk7XG5cblx0XHRpZiAodGhpcy5pbnB1dC5vbkRpZENoYW5nZU1vZGVsKSB7XG5cdFx0XHR0aGlzLmlucHV0LmRpc3Bvc2FibGVzLmFkZCh0aGlzLmlucHV0Lm9uRGlkQ2hhbmdlTW9kZWwobW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuaW5wdXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5pbnB1dC5tb2RlbCA9IG1vZGVsO1xuXHRcdFx0XHR0aGlzLnJlbmRlcklucHV0KCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQubW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcklucHV0KCkge1xuXHRcdGlmICghdGhpcy5pbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5saXN0KSB7XG5cdFx0XHR0aGlzLmxpc3QubW9kZWwgPSBuZXcgRGVsYXllZFBhZ2VkTW9kZWwodGhpcy5pbnB1dC5tb2RlbCk7XG5cdFx0fVxuXHRcdHRoaXMuc2hvd1dlbGNvbWVDb250ZW50KCEhdGhpcy5pbnB1dC5zaG93V2VsY29tZUNvbnRlbnQpO1xuXHRcdGlmICghdGhpcy5pbnB1dC5zaG93V2VsY29tZUNvbnRlbnQpIHtcblx0XHRcdHRoaXMudXBkYXRlQm9keSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd1dlbGNvbWVDb250ZW50KHNob3c6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLndlbGNvbWVDb250YWluZXI/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCAhc2hvdyk7XG5cdFx0dGhpcy5saXN0Q29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgc2hvdyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVdlbGNvbWVDb250ZW50KHdlbGNvbWVDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2VsY29tZUNvbnRlbnQgPSBkb20uYXBwZW5kKHdlbGNvbWVDb250YWluZXIsIGRvbS4kKCcubWNwLXdlbGNvbWUtY29udGVudCcpKTtcblxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSBkb20uYXBwZW5kKHdlbGNvbWVDb250ZW50LCBkb20uJCgnLm1jcC13ZWxjb21lLWljb24nKSk7XG5cdFx0Y29uc3QgaWNvbkVsZW1lbnQgPSBkb20uYXBwZW5kKGljb25Db250YWluZXIsIGRvbS4kKCdzcGFuJykpO1xuXHRcdGljb25FbGVtZW50LmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShtY3BTZXJ2ZXJJY29uKTtcblxuXHRcdGNvbnN0IHRpdGxlID0gZG9tLmFwcGVuZCh3ZWxjb21lQ29udGVudCwgZG9tLiQoJy5tY3Atd2VsY29tZS10aXRsZScpKTtcblx0XHR0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtY3Aud2VsY29tZS50aXRsZScsIFwiTUNQIFNlcnZlcnNcIik7XG5cblx0XHRjb25zdCBzZXR0aW5nc0NvbW1hbmRMaW5rID0gY3JlYXRlTWFya2Rvd25Db21tYW5kTGluayh7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCBhcmd1bWVudHM6IFtgQGlkOiR7bWNwR2FsbGVyeVNlcnZpY2VFbmFibGVtZW50Q29uZmlnfWBdLCB0ZXh0OiBtY3BHYWxsZXJ5U2VydmljZUVuYWJsZW1lbnRDb25maWcsIHRvb2x0aXA6IGxvY2FsaXplKCdtY3Aud2VsY29tZS5zZXR0aW5ncy50b29sdGlwJywgXCJPcGVuIFNldHRpbmdzXCIpIH0pLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBkb20uYXBwZW5kKHdlbGNvbWVDb250ZW50LCBkb20uJCgnLm1jcC13ZWxjb21lLWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IG1hcmtkb3duUmVzdWx0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoXG5cdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKCdtY3Aud2VsY29tZS5kZXNjcmlwdGlvbldpdGhMaW5rJywgXCJCcm93c2UgYW5kIGluc3RhbGwgW01vZGVsIENvbnRleHQgUHJvdG9jb2wgKE1DUCkgc2VydmVyc10oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9jb3BpbG90L2N1c3RvbWl6YXRpb24vbWNwLXNlcnZlcnMpIGRpcmVjdGx5IGZyb20gVlMgQ29kZSB0byBleHRlbmQgYWdlbnQgbW9kZSB3aXRoIGV4dHJhIHRvb2xzIGZvciBjb25uZWN0aW5nIHRvIGRhdGFiYXNlcywgaW52b2tpbmcgQVBJcyBhbmQgcGVyZm9ybWluZyBzcGVjaWFsaXplZCB0YXNrcy5cIiksXG5cdFx0XHRcdHsgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyddIH0gfSxcblx0XHRcdClcblx0XHRcdFx0LmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKVxuXHRcdFx0XHQuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ21jcC5nYWxsZXJ5LmVuYWJsZURpYWxvZy5zZXR0aW5nJywgXCJUaGlzIGZlYXR1cmUgaXMgY3VycmVudGx5IGluIHByZXZpZXcuIFlvdSBjYW4gZGlzYWJsZSBpdCBhbnl0aW1lIHVzaW5nIHRoZSBzZXR0aW5nIHswfS5cIiwgc2V0dGluZ3NDb21tYW5kTGluaykpLFxuXHRcdCkpO1xuXHRcdGRlc2NyaXB0aW9uLmFwcGVuZENoaWxkKG1hcmtkb3duUmVzdWx0LmVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gZG9tLmFwcGVuZCh3ZWxjb21lQ29udGVudCwgZG9tLiQoJy5tY3Atd2VsY29tZS1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oYnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC53ZWxjb21lLmVuYWJsZUdhbGxlcnlCdXR0b24nLCBcIkVuYWJsZSBNQ1AgU2VydmVycyBNYXJrZXRwbGFjZVwiKSxcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXNcblx0XHR9KSk7XG5cdFx0YnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ21jcC53ZWxjb21lLmVuYWJsZUdhbGxlcnlCdXR0b24nLCBcIkVuYWJsZSBNQ1AgU2VydmVycyBNYXJrZXRwbGFjZVwiKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiAnaW5mbycsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtY3AuZ2FsbGVyeS5lbmFibGVEaWFsb2cudGl0bGUnLCBcIkVuYWJsZSBNQ1AgU2VydmVycyBNYXJrZXRwbGFjZT9cIiksXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3tcblx0XHRcdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ21jcC5nYWxsZXJ5LmVuYWJsZURpYWxvZy5zZXR0aW5nJywgXCJUaGlzIGZlYXR1cmUgaXMgY3VycmVudGx5IGluIHByZXZpZXcuIFlvdSBjYW4gZGlzYWJsZSBpdCBhbnl0aW1lIHVzaW5nIHRoZSBzZXR0aW5nIHswfS5cIiwgc2V0dGluZ3NDb21tYW5kTGluayksIHsgaXNUcnVzdGVkOiB0cnVlIH0pXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtY3AuZ2FsbGVyeS5lbmFibGVEaWFsb2cuZW5hYmxlJywgXCJFbmFibGVcIiksIHJ1bjogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdtY3AuZ2FsbGVyeS5lbmFibGVEaWFsb2cuY2FuY2VsJywgXCJDYW5jZWxcIiksIHJ1bjogKCkgPT4gZmFsc2UgfVxuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKG1jcEdhbGxlcnlTZXJ2aWNlRW5hYmxlbWVudENvbmZpZywgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCb2R5KG1lc3NhZ2U/OiBNZXNzYWdlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYm9keVRlbXBsYXRlKSB7XG5cblx0XHRcdGNvbnN0IGNvdW50ID0gdGhpcy5pbnB1dD8ubW9kZWwubGVuZ3RoID8/IDA7XG5cdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tY3BTZXJ2ZXJzTGlzdC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBjb3VudCA9PT0gMCk7XG5cdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFtZXNzYWdlICYmIGNvdW50ID4gMCk7XG5cblx0XHRcdGlmICh0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VTZXZlcml0eUljb24uY2xhc3NOYW1lID0gU2V2ZXJpdHlJY29uLmNsYXNzTmFtZShtZXNzYWdlLnNldmVyaXR5KTtcblx0XHRcdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlQm94LnRleHRDb250ZW50ID0gbWVzc2FnZS50ZXh0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5ib2R5VGVtcGxhdGUubWVzc2FnZVNldmVyaXR5SWNvbi5jbGFzc05hbWUgPSAnJztcblx0XHRcdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlQm94LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vIGV4dGVuc2lvbnMgZm91bmQnLCBcIk5vIE1DUCBTZXJ2ZXJzIGZvdW5kLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5ib2R5VGVtcGxhdGUubWVzc2FnZUJveC50ZXh0Q29udGVudCkge1xuXHRcdFx0XHRcdGFsZXJ0KHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VCb3gudGV4dENvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeShxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUXVlcnlSZXN1bHQ+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpZiAocXVlcnkpIHtcblx0XHRcdGNvbnN0IHNlcnZlcnMgPSBhd2FpdCB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UucXVlcnlHYWxsZXJ5KHsgdGV4dDogcXVlcnkucmVwbGFjZSgnQG1jcCcsICcnKSB9KTtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJdGVyYXRpdmVQYWdlZE1vZGVsKHNlcnZlcnMpKTtcblx0XHRcdHJldHVybiB7IG1vZGVsLCBkaXNwb3NhYmxlcyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVBhZ2VkTW9kZWw8SVdvcmtiZW5jaE1jcFNlcnZlcj4+KCkpO1xuXHRcdGxldCBzZXJ2ZXJzID0gYXdhaXQgdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UodGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlLCAoKSA9PiB1bmRlZmluZWQpKCgpID0+IHtcblx0XHRcdGNvbnN0IG1lcmdlZE1jcFNlcnZlcnMgPSB0aGlzLm1lcmdlQ2hhbmdlZE1jcFNlcnZlcnMoc2VydmVycywgWy4uLnRoaXMubWNwV29ya2JlbmNoU2VydmljZS5sb2NhbF0pO1xuXHRcdFx0aWYgKG1lcmdlZE1jcFNlcnZlcnMpIHtcblx0XHRcdFx0c2VydmVycyA9IG1lcmdlZE1jcFNlcnZlcnM7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlTW9kZWwuZmlyZShuZXcgUGFnZWRNb2RlbChzZXJ2ZXJzKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub25SZXNldCgoKSA9PiBvbkRpZENoYW5nZU1vZGVsLmZpcmUobmV3IFBhZ2VkTW9kZWwoWy4uLnRoaXMubWNwV29ya2JlbmNoU2VydmljZS5sb2NhbF0pKSkpO1xuXHRcdHJldHVybiB7IG1vZGVsOiBuZXcgUGFnZWRNb2RlbChzZXJ2ZXJzKSwgb25EaWRDaGFuZ2VNb2RlbDogb25EaWRDaGFuZ2VNb2RlbC5ldmVudCwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgbWVyZ2VDaGFuZ2VkTWNwU2VydmVycyhtY3BTZXJ2ZXJzOiBJV29ya2JlbmNoTWNwU2VydmVyW10sIG5ld01jcFNlcnZlcnM6IElXb3JrYmVuY2hNY3BTZXJ2ZXJbXSk6IElXb3JrYmVuY2hNY3BTZXJ2ZXJbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgb2xkTWNwU2VydmVycyA9IFsuLi5tY3BTZXJ2ZXJzXTtcblx0XHRjb25zdCBmaW5kUHJldmlvdXNNY3BTZXJ2ZXJJbmRleCA9IChmcm9tOiBudW1iZXIpOiBudW1iZXIgPT4ge1xuXHRcdFx0bGV0IGluZGV4ID0gLTE7XG5cdFx0XHRjb25zdCBwcmV2aW91c01jcFNlcnZlckluTmV3ID0gbmV3TWNwU2VydmVyc1tmcm9tXTtcblx0XHRcdGlmIChwcmV2aW91c01jcFNlcnZlckluTmV3KSB7XG5cdFx0XHRcdGluZGV4ID0gb2xkTWNwU2VydmVycy5maW5kSW5kZXgoZSA9PiBlLmlkID09PSBwcmV2aW91c01jcFNlcnZlckluTmV3LmlkKTtcblx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybiBmaW5kUHJldmlvdXNNY3BTZXJ2ZXJJbmRleChmcm9tIC0gMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBpbmRleDtcblx0XHR9O1xuXG5cdFx0bGV0IGhhc0NoYW5nZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgbmV3TWNwU2VydmVycy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IG5ld01jcFNlcnZlciA9IG5ld01jcFNlcnZlcnNbaW5kZXhdO1xuXHRcdFx0aWYgKG1jcFNlcnZlcnMuZXZlcnkociA9PiByLmlkICE9PSBuZXdNY3BTZXJ2ZXIuaWQpKSB7XG5cdFx0XHRcdGhhc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRtY3BTZXJ2ZXJzLnNwbGljZShmaW5kUHJldmlvdXNNY3BTZXJ2ZXJJbmRleChpbmRleCAtIDEpICsgMSwgMCwgbmV3TWNwU2VydmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGxldCBpbmRleCA9IG1jcFNlcnZlcnMubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuXHRcdFx0Y29uc3Qgb2xkTWNwU2VydmVyID0gbWNwU2VydmVyc1tpbmRleF07XG5cdFx0XHRpZiAobmV3TWNwU2VydmVycy5ldmVyeShyID0+IHIuaWQgIT09IG9sZE1jcFNlcnZlci5pZCkgJiYgbmV3TWNwU2VydmVycy5zb21lKHIgPT4gci5uYW1lID09PSBvbGRNY3BTZXJ2ZXIubmFtZSkpIHtcblx0XHRcdFx0aGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdG1jcFNlcnZlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWhhc0NoYW5nZWQpIHtcblx0XHRcdGlmIChtY3BTZXJ2ZXJzLmxlbmd0aCA9PT0gbmV3TWNwU2VydmVycy5sZW5ndGgpIHtcblx0XHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IG5ld01jcFNlcnZlcnMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdFx0aWYgKG1jcFNlcnZlcnNbaW5kZXhdPy5pZCAhPT0gbmV3TWNwU2VydmVyc1tpbmRleF0/LmlkKSB7XG5cdFx0XHRcdFx0XHRoYXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdG1jcFNlcnZlcnMgPSBuZXdNY3BTZXJ2ZXJzO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhhc0NoYW5nZWQgPyBtY3BTZXJ2ZXJzIDogdW5kZWZpbmVkO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTWNwU2VydmVyVGVtcGxhdGVEYXRhIHtcblx0cm9vdDogSFRNTEVsZW1lbnQ7XG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRuYW1lOiBIVE1MRWxlbWVudDtcblx0ZGVzY3JpcHRpb246IEhUTUxFbGVtZW50O1xuXHRzdGFycmVkOiBIVE1MRWxlbWVudDtcblx0bWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbDtcblx0ZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW107XG5cdG1jcFNlcnZlckRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRhY3Rpb25iYXI6IEFjdGlvbkJhcjtcbn1cblxuY2xhc3MgTWNwU2VydmVyUmVuZGVyZXIgaW1wbGVtZW50cyBJUGFnZWRSZW5kZXJlcjxJV29ya2JlbmNoTWNwU2VydmVyLCBJTWNwU2VydmVyVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnbWNwU2VydmVyJztcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9IE1jcFNlcnZlclJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBFeHRlbnNpb25MaXN0UmVuZGVyZXJPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWNwV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKHJvb3Q6IEhUTUxFbGVtZW50KTogSU1jcFNlcnZlclRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy5tY3Atc2VydmVyLWl0ZW0uZXh0ZW5zaW9uLWxpc3QtaXRlbScpKTtcblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gZG9tLmFwcGVuZChlbGVtZW50LCBkb20uJCgnLmljb24tY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGljb25XaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNlcnZlckljb25XaWRnZXQsIGljb25Db250YWluZXIpO1xuXHRcdGNvbnN0IGRldGFpbHMgPSBkb20uYXBwZW5kKGVsZW1lbnQsIGRvbS4kKCcuZGV0YWlscycpKTtcblx0XHRjb25zdCBoZWFkZXJDb250YWluZXIgPSBkb20uYXBwZW5kKGRldGFpbHMsIGRvbS4kKCcuaGVhZGVyLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKGhlYWRlckNvbnRhaW5lciwgZG9tLiQoJy5oZWFkZXInKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnc3Bhbi5uYW1lJykpO1xuXHRcdGNvbnN0IHN0YXJyZWQgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJ3NwYW4ucmF0aW5ncycpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGRvbS5hcHBlbmQoZGV0YWlscywgZG9tLiQoJy5kZXNjcmlwdGlvbi5lbGxpcHNpcycpKTtcblx0XHRjb25zdCBmb290ZXIgPSBkb20uYXBwZW5kKGRldGFpbHMsIGRvbS4kKCcuZm9vdGVyJykpO1xuXHRcdGNvbnN0IHB1Ymxpc2hlcldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHVibGlzaGVyV2lkZ2V0LCBkb20uYXBwZW5kKGZvb3RlciwgZG9tLiQoJy5wdWJsaXNoZXItY29udGFpbmVyJykpLCB0cnVlKTtcblx0XHRjb25zdCBhY3Rpb25iYXIgPSBuZXcgQWN0aW9uQmFyKGZvb3Rlciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgRHJvcERvd25BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uLmNyZWF0ZUFjdGlvblZpZXdJdGVtKG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNPbmx5RW5hYmxlZEl0ZW1zOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRhY3Rpb25iYXIuc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0XHRjb25zdCBhY3Rpb25CYXJMaXN0ZW5lciA9IGFjdGlvbmJhci5vbkRpZFJ1bigoeyBlcnJvciB9KSA9PiBlcnJvciAmJiB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0XHRjb25zdCBtY3BTZXJ2ZXJTdGF0dXNBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNlcnZlclN0YXR1c0FjdGlvbik7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gW1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB0cnVlKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbGluZ0xhYmVsQWN0aW9uKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFuYWdlTWNwU2VydmVyQWN0aW9uLCBmYWxzZSksXG5cdFx0XHRtY3BTZXJ2ZXJTdGF0dXNBY3Rpb25cblx0XHRdO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0cyA9IFtcblx0XHRcdGljb25XaWRnZXQsXG5cdFx0XHRwdWJsaXNoZXJXaWRnZXQsXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YXJyZWRXaWRnZXQsIHN0YXJyZWQsIHRydWUpLFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTZXJ2ZXJTY29wZUJhZGdlV2lkZ2V0LCBpY29uQ29udGFpbmVyKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2VydmVySG92ZXJXaWRnZXQsIHsgdGFyZ2V0OiByb290LCBwb3NpdGlvbjogdGhpcy5vcHRpb25zLmhvdmVyT3B0aW9ucy5wb3NpdGlvbiB9LCBtY3BTZXJ2ZXJTdGF0dXNBY3Rpb24pXG5cdFx0XTtcblx0XHRjb25zdCBleHRlbnNpb25Db250YWluZXJzOiBNY3BTZXJ2ZXJDb250YWluZXJzID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BTZXJ2ZXJDb250YWluZXJzLCBbLi4uYWN0aW9ucywgLi4ud2lkZ2V0c10pO1xuXG5cdFx0YWN0aW9uYmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogdHJ1ZSB9KTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gY29tYmluZWREaXNwb3NhYmxlKC4uLmFjdGlvbnMsIC4uLndpZGdldHMsIGFjdGlvbmJhciwgYWN0aW9uQmFyTGlzdGVuZXIsIGV4dGVuc2lvbkNvbnRhaW5lcnMpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJvb3QsIGVsZW1lbnQsIG5hbWUsIGRlc2NyaXB0aW9uLCBzdGFycmVkLCBkaXNwb3NhYmxlczogW2Rpc3Bvc2FibGVdLCBhY3Rpb25iYXIsXG5cdFx0XHRtY3BTZXJ2ZXJEaXNwb3NhYmxlczogW10sXG5cdFx0XHRzZXQgbWNwU2VydmVyKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlcikge1xuXHRcdFx0XHRleHRlbnNpb25Db250YWluZXJzLm1jcFNlcnZlciA9IG1jcFNlcnZlcjtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyUGxhY2Vob2xkZXIoaW5kZXg6IG51bWJlciwgZGF0YTogSU1jcFNlcnZlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsb2FkaW5nJyk7XG5cblx0XHRkYXRhLm1jcFNlcnZlckRpc3Bvc2FibGVzID0gZGlzcG9zZShkYXRhLm1jcFNlcnZlckRpc3Bvc2FibGVzKTtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSAnJztcblx0XHRkYXRhLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gJyc7XG5cdFx0ZGF0YS5zdGFycmVkLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0ZGF0YS5tY3BTZXJ2ZXIgPSBudWxsO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIGluZGV4OiBudW1iZXIsIGRhdGE6IElNY3BTZXJ2ZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnbG9hZGluZycpO1xuXHRcdGRhdGEubWNwU2VydmVyRGlzcG9zYWJsZXMgPSBkaXNwb3NlKGRhdGEubWNwU2VydmVyRGlzcG9zYWJsZXMpO1xuXHRcdGRhdGEucm9vdC5zZXRBdHRyaWJ1dGUoJ2RhdGEtbWNwLXNlcnZlci1pZCcsIG1jcFNlcnZlci5pZCk7XG5cdFx0ZGF0YS5uYW1lLnRleHRDb250ZW50ID0gbWNwU2VydmVyLmxhYmVsO1xuXHRcdGRhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBtY3BTZXJ2ZXIuZGVzY3JpcHRpb247XG5cblx0XHRkYXRhLnN0YXJyZWQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdGRhdGEubWNwU2VydmVyID0gbWNwU2VydmVyO1xuXG5cdFx0Y29uc3QgdXBkYXRlRW5hYmxlbWVudCA9ICgpID0+IGRhdGEucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICEhbWNwU2VydmVyLnJ1bnRpbWVTdGF0dXM/LnN0YXRlICYmIG1jcFNlcnZlci5ydW50aW1lU3RhdHVzLnN0YXRlICE9PSBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdGUuRW5hYmxlZCk7XG5cdFx0dXBkYXRlRW5hYmxlbWVudCgpO1xuXHRcdGRhdGEubWNwU2VydmVyRGlzcG9zYWJsZXMucHVzaCh0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoIWUgfHwgZS5pZCA9PT0gbWNwU2VydmVyLmlkKSB7XG5cdFx0XHRcdHVwZGF0ZUVuYWJsZW1lbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIGluZGV4OiBudW1iZXIsIGRhdGE6IElNY3BTZXJ2ZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLm1jcFNlcnZlckRpc3Bvc2FibGVzID0gZGlzcG9zZShkYXRhLm1jcFNlcnZlckRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShkYXRhOiBJTWNwU2VydmVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS5tY3BTZXJ2ZXJEaXNwb3NhYmxlcyA9IGRpc3Bvc2UoZGF0YS5tY3BTZXJ2ZXJEaXNwb3NhYmxlcyk7XG5cdFx0ZGF0YS5kaXNwb3NhYmxlcyA9IGRpc3Bvc2UoZGF0YS5kaXNwb3NhYmxlcyk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdEJyb3dzZU1jcFNlcnZlcnNWaWV3IGV4dGVuZHMgTWNwU2VydmVyc0xpc3RWaWV3IHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5vbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdCgoKSA9PiB0aGlzLnNob3coKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2hvdygpOiBQcm9taXNlPElQYWdlZE1vZGVsPElXb3JrYmVuY2hNY3BTZXJ2ZXI+PiB7XG5cdFx0cmV0dXJuIHN1cGVyLnNob3coJ0BtY3AnKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVyc1ZpZXdzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyBJRCA9ICd3b3JrYmVuY2gubWNwLnNlcnZlcnMudmlld3MuY29udHJpYnV0aW9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0UmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld3MoW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogSW5zdGFsbGVkTWNwU2VydmVyc1ZpZXdJZCxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUyKCdtY3AtaW5zdGFsbGVkJywgXCJNQ1AgU2VydmVycyAtIEluc3RhbGxlZFwiKSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihNY3BTZXJ2ZXJzTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRGVmYXVsdFZpZXdzQ29udGV4dCwgSGFzSW5zdGFsbGVkTWNwU2VydmVyc0NvbnRleHQsIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHRcdFx0d2VpZ2h0OiA0MCxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLm1jcC5kZWZhdWx0Lm1hcmtldHBsYWNlJyxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUyKCdtY3AnLCBcIk1DUCBTZXJ2ZXJzXCIpLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKERlZmF1bHRCcm93c2VNY3BTZXJ2ZXJzVmlldywgW3t9XSksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChEZWZhdWx0Vmlld3NDb250ZXh0LCBIYXNJbnN0YWxsZWRNY3BTZXJ2ZXJzQ29udGV4dC50b05lZ2F0ZWQoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksIE1jcFNlcnZlcnNHYWxsZXJ5U3RhdHVzQ29udGV4dC5pc0VxdWFsVG8oTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkF2YWlsYWJsZSksIENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlEZWZpbmVkRXhwci5jcmVhdGUoYGNvbmZpZy4ke21jcEdhbGxlcnlTZXJ2aWNlVXJsQ29uZmlnfWApLCBQcm9kdWN0UXVhbGl0eUNvbnRleHQubm90RXF1YWxzVG8oJ3N0YWJsZScpLCBDb250ZXh0S2V5RGVmaW5lZEV4cHIuY3JlYXRlKGBjb25maWcuJHttY3BHYWxsZXJ5U2VydmljZUVuYWJsZW1lbnRDb25maWd9YCkpKSxcblx0XHRcdFx0d2VpZ2h0OiA0MCxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLm1jcC5tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplMignbWNwJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihNY3BTZXJ2ZXJzTGlzdFZpZXcsIFt7fV0pLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoTWNwU2VydmVyc0NvbnRleHQsIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpLCBNY3BTZXJ2ZXJzR2FsbGVyeVN0YXR1c0NvbnRleHQuaXNFcXVhbFRvKE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BdmFpbGFibGUpLCBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RGVmaW5lZEV4cHIuY3JlYXRlKGBjb25maWcuJHttY3BHYWxsZXJ5U2VydmljZVVybENvbmZpZ31gKSwgUHJvZHVjdFF1YWxpdHlDb250ZXh0Lm5vdEVxdWFsc1RvKCdzdGFibGUnKSwgQ29udGV4dEtleURlZmluZWRFeHByLmNyZWF0ZShgY29uZmlnLiR7bWNwR2FsbGVyeVNlcnZpY2VFbmFibGVtZW50Q29uZmlnfWApKSksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC52aWV3cy5tY3AuZGVmYXVsdC53ZWxjb21lVmlldycsXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplMignbWNwJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihEZWZhdWx0QnJvd3NlTWNwU2VydmVyc1ZpZXcsIFt7IHNob3dXZWxjb21lOiB0cnVlIH1dKSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKERlZmF1bHRWaWV3c0NvbnRleHQsIEhhc0luc3RhbGxlZE1jcFNlcnZlcnNDb250ZXh0LnRvTmVnYXRlZCgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSwgTWNwU2VydmVyc0dhbGxlcnlTdGF0dXNDb250ZXh0LmlzRXF1YWxUbyhNY3BHYWxsZXJ5TWFuaWZlc3RTdGF0dXMuQXZhaWxhYmxlKSwgQ29udGV4dEtleURlZmluZWRFeHByLmNyZWF0ZShgY29uZmlnLiR7bWNwR2FsbGVyeVNlcnZpY2VVcmxDb25maWd9YCkubmVnYXRlKCksIFByb2R1Y3RRdWFsaXR5Q29udGV4dC5pc0VxdWFsVG8oJ3N0YWJsZScpLCBDb250ZXh0S2V5RGVmaW5lZEV4cHIuY3JlYXRlKGBjb25maWcuJHttY3BHYWxsZXJ5U2VydmljZUVuYWJsZW1lbnRDb25maWd9YCkubmVnYXRlKCkpLFxuXHRcdFx0XHR3ZWlnaHQ6IDQwLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2gudmlld3MubWNwLndlbGNvbWVWaWV3Jyxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUyKCdtY3AnLCBcIk1DUCBTZXJ2ZXJzXCIpLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKE1jcFNlcnZlcnNMaXN0VmlldywgW3sgc2hvd1dlbGNvbWU6IHRydWUgfV0pLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoTWNwU2VydmVyc0NvbnRleHQsIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpLCBNY3BTZXJ2ZXJzR2FsbGVyeVN0YXR1c0NvbnRleHQuaXNFcXVhbFRvKE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cy5BdmFpbGFibGUpLCBDb250ZXh0S2V5RGVmaW5lZEV4cHIuY3JlYXRlKGBjb25maWcuJHttY3BHYWxsZXJ5U2VydmljZVVybENvbmZpZ31gKS5uZWdhdGUoKSwgUHJvZHVjdFF1YWxpdHlDb250ZXh0LmlzRXF1YWxUbygnc3RhYmxlJyksIENvbnRleHRLZXlEZWZpbmVkRXhwci5jcmVhdGUoYGNvbmZpZy4ke21jcEdhbGxlcnlTZXJ2aWNlRW5hYmxlbWVudENvbmZpZ31gKS5uZWdhdGUoKSksXG5cdFx0XHR9XG5cdFx0XSwgVklFV19DT05UQUlORVIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUywyQkFBMkIsc0JBQXNCO0FBQzFELFNBQVMsb0JBQW9CLFlBQVksaUJBQWlCLFNBQXNCLGNBQWMseUJBQXlCO0FBQ3ZILFNBQVMsbUJBQWdDLFlBQVksMkJBQTJCO0FBQ2hGLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUIsZ0JBQWdCLDBCQUEwQjtBQUMxRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDRCQUFzQztBQUMvQyxTQUFTLHNC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
