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
import "./media/aiCustomizationManagement.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, MutableDisposable, isDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Button, ButtonWithDropdown } from "../../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { autorun, runOnChange } from "../../../../../base/common/observable.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { URI } from "../../../../../base/common/uri.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Delayer } from "../../../../../base/common/async.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { basename, dirname, isEqual } from "../../../../../base/common/resources.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { IAgentPluginService } from "../../common/plugins/agentPluginService.js";
import { isContributionEnabled } from "../../common/enablement.js";
import { getInstalledPluginContextMenuActions } from "../agentPluginActions.js";
import { IPluginMarketplaceService } from "../../common/plugins/pluginMarketplaceService.js";
import { IPluginInstallService } from "../../common/plugins/pluginInstallService.js";
import { AgentPluginItemKind } from "../agentPluginEditor/agentPluginItems.js";
import { pluginIcon } from "./aiCustomizationIcons.js";
import { formatDisplayName, truncateToFirstLine } from "./aiCustomizationListWidget.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from "./customizationGroupHeaderRenderer.js";
import { ICustomizationHarnessService, isPluginCustomizationItem } from "../../common/customizationHarnessService.js";
import { Checkbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ChatConfiguration } from "../../common/constants.js";
import { IAICustomizationItemsModel } from "./aiCustomizationItemsModel.js";
import { GalleryItemInstallState, GalleryItemRenderer } from "./galleryItemRenderer.js";
const $ = DOM.$;
const PLUGIN_ITEM_HEIGHT = 36;
class PluginItemDelegate {
  getHeight(element) {
    if (element.type === "group-header") {
      return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
    }
    if (element.type === "marketplace-item") {
      return 62;
    }
    return PLUGIN_ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (element.type === "group-header") {
      return "pluginGroupHeader";
    }
    if (element.type === "marketplace-item") {
      return PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID;
    }
    if (element.type === "remote-item") {
      return "pluginRemoteItem";
    }
    return "pluginInstalledItem";
  }
}
class PluginInstalledItemRenderer {
  constructor(_harnessService) {
    this._harnessService = _harnessService;
    this.templateId = "pluginInstalledItem";
  }
  renderTemplate(container) {
    container.classList.add("mcp-server-item");
    const syncCheckboxContainer = DOM.append(container, $(".item-sync-checkbox"));
    const typeIcon = DOM.append(container, $(".mcp-server-icon"));
    typeIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
    const details = DOM.append(container, $(".mcp-server-details"));
    const name = DOM.append(details, $(".mcp-server-name"));
    const description = DOM.append(details, $(".mcp-server-description"));
    return { container, syncCheckboxContainer, typeIcon, name, description, disposables: new DisposableStore() };
  }
  renderElement(element, _index, templateData) {
    templateData.disposables.clear();
    templateData.name.textContent = formatDisplayName(element.item.name);
    if (element.item.description) {
      templateData.description.textContent = truncateToFirstLine(element.item.description);
      templateData.description.style.display = "";
    } else {
      templateData.description.style.display = "none";
    }
    templateData.disposables.add(autorun((reader) => {
      const enabled = isContributionEnabled(element.item.plugin.enablement.read(reader));
      templateData.container.classList.toggle("disabled", !enabled);
    }));
    const syncProvider = this._harnessService.getActiveDescriptor().syncProvider;
    if (syncProvider) {
      templateData.syncCheckboxContainer.style.display = "";
      const pluginUri = element.item.plugin.uri;
      const disabled = syncProvider.isDisabled(pluginUri);
      const title = disabled ? localize("enablePlugin", "Enable {0} for sync", element.item.name) : localize("disablePlugin", "Disable {0} from sync", element.item.name);
      const checkbox = templateData.disposables.add(
        new Checkbox(title, !disabled, defaultCheckboxStyles)
      );
      templateData.syncCheckboxContainer.replaceChildren(checkbox.domNode);
      templateData.disposables.add(checkbox.onChange(() => {
        syncProvider.setDisabled(pluginUri, !checkbox.checked);
      }));
    } else {
      templateData.syncCheckboxContainer.style.display = "none";
      templateData.syncCheckboxContainer.replaceChildren();
    }
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
}
class PluginRemoteItemRenderer {
  constructor() {
    this.templateId = "pluginRemoteItem";
  }
  renderTemplate(container) {
    container.classList.add("mcp-server-item");
    const typeIcon = DOM.append(container, $(".mcp-server-icon"));
    typeIcon.classList.add(...ThemeIcon.asClassNameArray(pluginIcon));
    const details = DOM.append(container, $(".mcp-server-details"));
    const nameRow = DOM.append(details, $(".mcp-server-name"));
    const name = DOM.append(nameRow, $("span"));
    const badge = DOM.append(nameRow, $(".inline-badge.item-badge"));
    const description = DOM.append(details, $(".mcp-server-description"));
    const status = DOM.append(container, $(".mcp-server-status"));
    return { container, typeIcon, name, badge, description, status };
  }
  renderElement(element, _index, templateData) {
    templateData.name.textContent = formatDisplayName(element.item.name);
    if (element.item.badge) {
      templateData.badge.textContent = element.item.badge;
      templateData.badge.style.display = "";
      templateData.badge.title = element.item.badgeTooltip ?? "";
    } else {
      templateData.badge.textContent = "";
      templateData.badge.style.display = "none";
      templateData.badge.title = "";
    }
    if (element.item.description) {
      templateData.description.textContent = truncateToFirstLine(element.item.description);
      templateData.description.style.display = "";
    } else {
      templateData.description.textContent = "";
      templateData.description.style.display = "none";
    }
    templateData.container.classList.toggle("disabled", element.item.enabled === false);
    templateData.status.className = "mcp-server-status";
    if (element.item.enabled === false) {
      templateData.status.textContent = localize("remotePluginDisabled", "Disabled");
      templateData.status.classList.add("disabled");
      return;
    }
    switch (element.item.status) {
      case "loading":
        templateData.status.textContent = localize("remotePluginLoading", "Loading");
        templateData.status.classList.add("running");
        break;
      case "loaded":
        templateData.status.textContent = localize("remotePluginLoaded", "Loaded");
        templateData.status.classList.add("running");
        break;
      case "degraded":
        templateData.status.textContent = localize("remotePluginDegraded", "Warning");
        templateData.status.classList.add("disabled");
        break;
      case "error":
        templateData.status.textContent = localize("remotePluginError", "Error");
        templateData.status.classList.add("disabled");
        break;
      default:
        templateData.status.textContent = "";
        break;
    }
  }
  disposeTemplate(_templateData) {
  }
}
const PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID = "pluginMarketplaceItem";
class PluginMarketplaceItemProvider {
  constructor(pluginInstallService, agentPluginService) {
    this.pluginInstallService = pluginInstallService;
    this.agentPluginService = agentPluginService;
  }
  getLabel(element) {
    return element.item.name;
  }
  getPublisherDisplayName(element) {
    return element.item.marketplace;
  }
  getDescription(element) {
    return element.item.description;
  }
  getInstallState(element) {
    const installUri = this.pluginInstallService.getPluginInstallUri(this._toInstallable(element.item));
    const isInstalled = this.agentPluginService.plugins.get().some((p) => isEqual(p.uri, installUri));
    return isInstalled ? GalleryItemInstallState.Installed : GalleryItemInstallState.Uninstalled;
  }
  async install(element) {
    await this.pluginInstallService.installPlugin({ ...this._toInstallable(element.item), readmeUri: element.item.readmeUri });
  }
  onDidChangeInstallState(_element, listener) {
    return runOnChange(this.agentPluginService.plugins, () => listener());
  }
  _toInstallable(item) {
    return {
      name: item.name,
      description: item.description,
      version: "",
      sourceDescriptor: item.sourceDescriptor,
      source: item.source,
      marketplace: item.marketplace,
      marketplaceReference: item.marketplaceReference,
      marketplaceType: item.marketplaceType
    };
  }
}
function installedPluginToItem(plugin, labelService) {
  const name = plugin.label || basename(plugin.uri);
  const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
  const marketplace = plugin.fromMarketplace?.marketplace;
  return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin };
}
function marketplacePluginToItem(plugin) {
  return {
    kind: AgentPluginItemKind.Marketplace,
    name: plugin.name,
    description: plugin.description,
    source: plugin.source,
    sourceDescriptor: plugin.sourceDescriptor,
    marketplace: plugin.marketplace,
    marketplaceReference: plugin.marketplaceReference,
    marketplaceType: plugin.marketplaceType,
    readmeUri: plugin.readmeUri
  };
}
let PluginListWidget = class extends Disposable {
  constructor(instantiationService, agentPluginService, pluginMarketplaceService, pluginInstallService, openerService, contextViewService, contextMenuService, hoverService, labelService, commandService, harnessService, itemsModel, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.agentPluginService = agentPluginService;
    this.pluginMarketplaceService = pluginMarketplaceService;
    this.pluginInstallService = pluginInstallService;
    this.openerService = openerService;
    this.contextViewService = contextViewService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.commandService = commandService;
    this.harnessService = harnessService;
    this.itemsModel = itemsModel;
    this.configurationService = configurationService;
    this._onDidSelectPlugin = this._register(new Emitter());
    this.onDidSelectPlugin = this._onDidSelectPlugin.event;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this.disabledLinkListener = this._register(new MutableDisposable());
    this.addDropdownActions = this._register(new DisposableStore());
    this.installedItems = [];
    this.remoteItems = [];
    this.displayEntries = [];
    this.marketplaceItems = [];
    this.searchQuery = "";
    this.browseMode = false;
    this.lastHeight = 0;
    this.lastWidth = 0;
    this.lastHeaderHeight = 0;
    this._layoutDeferred = false;
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.delayedFilter = new Delayer(200);
    this.delayedMarketplaceSearch = new Delayer(400);
    this.element = $(".mcp-list-widget");
    this.create();
    this.updateAccessState();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.PluginsEnabled)) {
        this.updateAccessState();
      }
    }));
    this._register({
      dispose: () => {
        this.marketplaceCts?.dispose();
      }
    });
  }
  create() {
    this.sectionTitleHeader = DOM.append(this.element, $(".section-title-header"));
    const titleRow = DOM.append(this.sectionTitleHeader, $(".section-title-row"));
    const sectionTitle = DOM.append(titleRow, $("h2.section-title"));
    sectionTitle.textContent = localize("plugins", "Plugins");
    const sectionTitleDescription = DOM.append(this.sectionTitleHeader, $("p.section-title-description"));
    const sectionTitleDescriptionText = DOM.append(sectionTitleDescription, $("span.section-title-description-text"));
    sectionTitleDescriptionText.textContent = localize("pluginsDescription", "Extend your AI agent with plugins that add commands, skills, agents, hooks, and MCP servers from reusable packages.");
    sectionTitleDescription.appendChild(document.createTextNode(" "));
    this.sectionLink = DOM.append(sectionTitleDescription, $("a.section-title-link"));
    this.sectionLink.textContent = localize("learnMorePlugins", "Learn more about agent plugins");
    this.sectionLink.href = "https://code.visualstudio.com/docs/agent-customization/agent-plugins?referrer=in-product";
    this._register(DOM.addDisposableListener(this.sectionLink, "click", (e) => {
      e.preventDefault();
      const href = this.sectionLink.href;
      if (href) {
        this.openerService.open(URI.parse(href));
      }
    }));
    const targetWindow = DOM.getWindow(this.element);
    const headerObserver = this._register(new DOM.DisposableResizeObserver(
      "PluginListWidget.sectionTitleHeader",
      () => {
        if (this.lastWidth <= 0 || this.lastHeight <= 0) {
          return;
        }
        const headerHeight = this.sectionTitleHeader.offsetHeight;
        if (headerHeight === this.lastHeaderHeight) {
          return;
        }
        this.layout(this.lastHeight, this.lastWidth);
      },
      targetWindow
    ));
    this._register(headerObserver.observe(this.sectionTitleHeader));
    this.searchAndButtonContainer = DOM.append(this.element, $(".list-search-and-button-container"));
    const searchContainer = DOM.append(this.searchAndButtonContainer, $(".list-search-container"));
    this.searchInput = this._register(new InputBox(searchContainer, this.contextViewService, {
      placeholder: localize("searchPluginsPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this._register(this.searchInput.onDidChange(() => {
      this.searchQuery = this.searchInput.value;
      if (this.browseMode) {
        this.delayedMarketplaceSearch.trigger(() => this.queryMarketplace());
      } else {
        this.delayedFilter.trigger(() => this.filterPlugins());
      }
    }));
    this.buttonContainer = DOM.append(this.searchAndButtonContainer, $(".list-button-group"));
    const backButtonContainer = DOM.append(this.buttonContainer, $(".list-add-button-container"));
    const backToInstalledLabel = localize("backToInstalledPlugins", "Back to Installed Plugins");
    this.backButton = this._register(new Button(backButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: backToInstalledLabel, ariaLabel: backToInstalledLabel }));
    this.backButton.label = `$(${Codicon.arrowLeft.id}) ${localize("pluginBrowseBack", "Back")}`;
    this.backButton.element.classList.add("list-add-button");
    backButtonContainer.style.display = "none";
    this._register(this.backButton.onDidClick(() => this.toggleBrowseMode(false)));
    const browseButtonContainer = DOM.append(this.buttonContainer, $(".list-add-button-container"));
    const browseMarketplaceLabel = localize("browseMarketplace", "Browse Marketplace");
    this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: browseMarketplaceLabel, ariaLabel: browseMarketplaceLabel }));
    this.browseButton.element.classList.add("list-add-button");
    this._register(this.browseButton.onDidClick(() => this.runPrimaryButtonAction()));
    this.addButtonContainer = DOM.append(this.buttonContainer, $(".list-add-button-container"));
    const addPluginLabel = localize("addPlugin", "Add Plugin");
    this.addButtonSimple = this._register(new Button(this.addButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: addPluginLabel, ariaLabel: addPluginLabel }));
    this.addButtonSimple.element.classList.add("list-add-button");
    this._register(this.addButtonSimple.onDidClick(() => this.runPrimaryAddAction()));
    this.addButton = this._register(new ButtonWithDropdown(this.addButtonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true,
      contextMenuProvider: this.contextMenuService,
      addPrimaryActionToDropdown: false,
      actions: { getActions: () => this.getAddDropdownActions() },
      title: addPluginLabel,
      ariaLabel: addPluginLabel
    }));
    this.addButton.element.classList.add("list-add-button");
    this._register(this.addButton.onDidClick(() => this.runPrimaryAddAction()));
    const createPluginLabel = localize("createPlugin", "Create Plugin");
    this.createPluginButton = this._register(new Button(this.buttonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: createPluginLabel, ariaLabel: createPluginLabel }));
    this.createPluginButton.element.classList.add("list-icon-button");
    this.createPluginButton.label = `$(${Codicon.newFile.id})`;
    this._register(this.createPluginButton.onDidClick(() => this.runCreatePluginAction()));
    this.emptyContainer = DOM.append(this.element, $(".mcp-empty-state"));
    const emptyHeader = DOM.append(this.emptyContainer, $(".empty-state-header"));
    this.emptyText = DOM.append(emptyHeader, $(".empty-text"));
    this.emptySubtext = DOM.append(this.emptyContainer, $(".empty-subtext"));
    this.disabledContainer = DOM.append(this.element, $(".mcp-disabled-state"));
    const disabledHeader = DOM.append(this.disabledContainer, $(".empty-state-header"));
    this.disabledIcon = DOM.append(disabledHeader, $(".empty-icon"));
    const disabledText = DOM.append(disabledHeader, $(".empty-text"));
    disabledText.textContent = localize("pluginsDisabledTitle", "Plugins are disabled");
    this.disabledMessage = DOM.append(this.disabledContainer, $(".empty-subtext"));
    this.listContainer = DOM.append(this.element, $(".mcp-list-container"));
    const delegate = new PluginItemDelegate();
    const groupHeaderRenderer = new CustomizationGroupHeaderRenderer("pluginGroupHeader", this.hoverService);
    const installedRenderer = new PluginInstalledItemRenderer(this.harnessService);
    const remoteRenderer = new PluginRemoteItemRenderer();
    const marketplaceRenderer = new GalleryItemRenderer(PLUGIN_MARKETPLACE_ITEM_TEMPLATE_ID, new PluginMarketplaceItemProvider(this.pluginInstallService, this.agentPluginService));
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "PluginManagementList",
      this.listContainer,
      delegate,
      [groupHeaderRenderer, installedRenderer, remoteRenderer, marketplaceRenderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(element) {
            if (element.type === "group-header") {
              return localize("pluginGroupAriaLabel", "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize("collapsed", "collapsed") : localize("expanded", "expanded"));
            }
            const name = formatDisplayName(element.item.name);
            const description = element.item.description ? truncateToFirstLine(element.item.description) : void 0;
            const nameAndDesc = description ? localize("pluginItemAriaLabel", "{0}. {1}", name, description) : name;
            if (element.type === "plugin-item") {
              const enabled = isContributionEnabled(element.item.plugin.enablement.get());
              return enabled ? localize("pluginInstalledItemAriaLabelEnabled", "{0}. Enabled", nameAndDesc) : localize("pluginInstalledItemAriaLabelDisabled", "{0}. Disabled", nameAndDesc);
            }
            return nameAndDesc;
          },
          getWidgetAriaLabel() {
            return localize("pluginsListAriaLabel", "Plugins");
          }
        },
        openOnSingleClick: true,
        identityProvider: {
          getId(element) {
            if (element.type === "group-header") {
              return element.id;
            }
            if (element.type === "marketplace-item") {
              return `marketplace-${element.item.marketplaceReference.canonicalId}/${element.item.source}`;
            }
            if (element.type === "remote-item") {
              return element.item.itemKey ?? `remote-${element.item.groupKey ?? "default"}-${element.item.uri.toString()}`;
            }
            return element.item.plugin.uri.toString();
          }
        }
      }
    ));
    this._register(this.list.onDidOpen((e) => {
      if (e.element) {
        if (e.element.type === "group-header") {
          this.toggleGroup(e.element);
        } else if (e.element.type === "plugin-item") {
          this._onDidSelectPlugin.fire(e.element.item);
        } else if (e.element.type === "remote-item") {
        } else if (e.element.type === "marketplace-item") {
          this._onDidSelectPlugin.fire(e.element.item);
        }
      }
    }));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e)));
    this._register(autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      for (const plugin of plugins) {
        plugin.enablement.read(reader);
      }
      if (!this.browseMode) {
        void this.refresh();
      }
    }));
    this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
      if (!this.browseMode) {
        void this.refresh();
      }
    }));
    this._register(autorun((reader) => {
      this.harnessService.activeHarness.read(reader);
      this.updateToolbarActions();
      if (!this.browseMode) {
        void this.refresh();
      }
    }));
    const itemProviderChangeDisposable = this._register(new MutableDisposable());
    this._register(autorun((reader) => {
      this.harnessService.activeHarness.read(reader);
      const itemProvider = this.harnessService.getActiveDescriptor().itemProvider;
      if (itemProvider) {
        itemProviderChangeDisposable.value = itemProvider.onDidChange(() => {
          if (!this.browseMode) {
            void this.refresh();
          }
        });
      } else {
        itemProviderChangeDisposable.clear();
      }
    }));
    this.updateToolbarActions();
    void this.refresh();
  }
  async refresh() {
    if (this.browseMode) {
      await this.queryMarketplace();
    } else {
      this.filterPlugins();
    }
  }
  updateAccessState() {
    const inspect = this.configurationService.inspect(ChatConfiguration.PluginsEnabled);
    const value = inspect.value ?? inspect.defaultValue;
    const disabled = value === false;
    const policyLocked = inspect.policyValue === false;
    this.element.classList.toggle("access-disabled", disabled);
    if (disabled) {
      this.disabledIcon.className = "empty-icon";
      this.disabledIcon.classList.add(...ThemeIcon.asClassNameArray(policyLocked ? Codicon.shield : pluginIcon));
      DOM.clearNode(this.disabledMessage);
      this.disabledLinkListener.clear();
      if (policyLocked) {
        this.disabledMessage.textContent = localize("pluginsDisabledByPolicy", "Plugin integration in chat is disabled by your organization. Contact your organization administrator for more information.");
      } else {
        this.disabledMessage.appendChild(document.createTextNode(localize("pluginsDisabledBySettingPrefix", "Plugins are disabled in settings. ")));
        const link = DOM.append(this.disabledMessage, $("a.mcp-disabled-settings-link"));
        link.textContent = localize("pluginsDisabledSettingLink", "Configure in settings.");
        link.href = "#";
        link.setAttribute("role", "button");
        this.disabledLinkListener.value = DOM.addDisposableListener(link, "click", (e) => {
          e.preventDefault();
          this.commandService.executeCommand("workbench.action.openSettings", `@id:${ChatConfiguration.PluginsEnabled}`);
        });
      }
    }
  }
  get pluginActions() {
    return this.harnessService.getActiveDescriptor().pluginActions ?? [];
  }
  formatActionLabel(action, iconOnly = false) {
    if (!action.icon) {
      return action.label;
    }
    return iconOnly ? `$(${action.icon.id})` : `$(${action.icon.id}) ${action.label}`;
  }
  updateToolbarActions() {
    const browseMarketplaceAvailable = this.isBrowseMarketplaceAvailable();
    if (!browseMarketplaceAvailable && this.browseMode) {
      this.toggleBrowseMode(false);
    }
    this.browseButton.element.parentElement.style.display = this.browseMode ? "none" : "";
    this.browseButton.label = `$(${Codicon.library.id}) ${localize("browseMarketplace", "Browse Marketplace")}`;
    this.browseButton.enabled = browseMarketplaceAvailable;
    const browseTitle = browseMarketplaceAvailable ? localize("browseMarketplace", "Browse Marketplace") : localize("browseMarketplaceUnsupportedWeb", "Browse Marketplace is not available in VS Code for the Web.");
    this.browseButton.setTitle(browseTitle);
    this.browseButton.element.setAttribute("aria-label", browseTitle);
    this.updateAddButton();
    this.createPluginButton.enabled = true;
  }
  isBrowseMarketplaceAvailable() {
    return !isWeb;
  }
  updateAddButton() {
    const actions = this.buildAddActions();
    const [primary, ...dropdown] = actions;
    const hasDropdown = dropdown.length > 0;
    this.addButton.element.style.display = hasDropdown ? "" : "none";
    this.addButtonSimple.element.style.display = hasDropdown ? "none" : "";
    if (!primary) {
      this.addButton.element.style.display = "none";
      this.addButtonSimple.element.style.display = "none";
      return;
    }
    if (hasDropdown) {
      this.addButton.label = this.formatActionLabel(primary);
      this.addButton.enabled = primary.enabled !== false;
      const addPrimaryTitle = primary.tooltip ?? primary.label;
      this.addButton.primaryButton.setTitle(addPrimaryTitle);
      this.addButton.primaryButton.element.setAttribute("aria-label", addPrimaryTitle);
      const moreLabel = localize("morePluginAddActions", "More Plugin Add Actions...");
      this.addButton.dropdownButton.setTitle(moreLabel);
      this.addButton.dropdownButton.element.setAttribute("aria-label", moreLabel);
    } else {
      this.addButtonSimple.label = this.formatActionLabel(primary);
      this.addButtonSimple.enabled = primary.enabled !== false;
      const addSimpleTitle = primary.tooltip ?? primary.label;
      this.addButtonSimple.setTitle(addSimpleTitle);
      this.addButtonSimple.element.setAttribute("aria-label", addSimpleTitle);
    }
  }
  buildAddActions() {
    return [
      ...this.pluginActions,
      {
        id: "plugin.installFromSource",
        label: localize("installFromSource", "Install Plugin from Source"),
        tooltip: localize("installFromSource", "Install Plugin from Source"),
        icon: Codicon.add,
        run: async () => {
          const installed = await this.commandService.executeCommand("workbench.action.chat.installPluginFromSource", { skipReveal: true });
          if (installed && this.browseMode) {
            this.exitBrowseMode();
          }
        }
      }
    ];
  }
  getAddDropdownActions() {
    this.addDropdownActions.clear();
    return this.buildAddActions().slice(1).map((action, index) => this.addDropdownActions.add(new Action(`plugin_add_${index}`, this.formatActionLabel(action), void 0, action.enabled !== false, () => this.runPluginAction(action))));
  }
  async runPrimaryButtonAction() {
    if (!this.isBrowseMarketplaceAvailable()) {
      return;
    }
    this.toggleBrowseMode(!this.browseMode);
  }
  async runPrimaryAddAction() {
    const [primary] = this.buildAddActions();
    if (primary) {
      await this.runPluginAction(primary);
    }
  }
  async runCreatePluginAction() {
    await this.commandService.executeCommand("workbench.action.chat.createPlugin");
  }
  async runPluginAction(action) {
    if (action.enabled !== false) {
      await action.run();
    }
  }
  showBrowseMarketplace() {
    if (!this.isBrowseMarketplaceAvailable()) {
      return;
    }
    if (!this.browseMode) {
      this.toggleBrowseMode(true);
    }
  }
  toggleBrowseMode(browse) {
    this.browseMode = browse;
    this.searchInput.value = "";
    this.searchQuery = "";
    this.browseButton.element.parentElement.style.display = browse ? "none" : "";
    this.backButton.element.parentElement.style.display = browse ? "" : "none";
    this.searchInput.setPlaceHolder(
      browse ? localize("searchMarketplacePlaceholder", "Search plugin marketplace...") : localize("searchPluginsPlaceholder", "Type to search...")
    );
    if (browse) {
      void this.queryMarketplace();
    } else {
      this.marketplaceCts?.dispose(true);
      this.marketplaceItems = [];
      void this.filterPlugins();
    }
    if (this.lastHeight > 0) {
      this.layout(this.lastHeight, this.lastWidth);
    }
  }
  async queryMarketplace() {
    this.marketplaceCts?.dispose(true);
    const cts = this.marketplaceCts = new CancellationTokenSource();
    this.emptyContainer.style.display = "flex";
    this.listContainer.style.display = "none";
    this.emptyText.textContent = localize("loadingMarketplace", "Loading marketplace...");
    this.emptySubtext.textContent = "";
    try {
      const plugins = await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
      if (cts.token.isCancellationRequested) {
        return;
      }
      const query = this.searchQuery.toLowerCase().trim();
      const filtered = query ? plugins.filter((p) => p.name.toLowerCase().includes(query) || p.description.toLowerCase().includes(query)) : plugins;
      const installedUris = new Set(this.agentPluginService.plugins.get().map((p) => p.uri.toString()));
      this.marketplaceItems = filtered.filter((p) => {
        const expectedUri = this.pluginInstallService.getPluginInstallUri(p);
        return !installedUris.has(expectedUri.toString());
      }).map(marketplacePluginToItem);
      this.updateMarketplaceList();
    } catch {
      if (!cts.token.isCancellationRequested) {
        this.marketplaceItems = [];
        this.emptyContainer.style.display = "flex";
        this.listContainer.style.display = "none";
        this.emptyText.textContent = localize("marketplaceError", "Unable to load marketplace");
        this.emptySubtext.textContent = localize("tryAgainLater", "Check your connection and try again");
      }
    }
  }
  updateMarketplaceList() {
    if (this.marketplaceItems.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noMarketplaceResults", "No plugins match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        this.emptyText.textContent = localize("emptyMarketplace", "No plugins available");
        this.emptySubtext.textContent = "";
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const entries = this.marketplaceItems.map((item) => ({ type: "marketplace-item", item }));
    this.list.splice(0, this.list.length, entries);
  }
  async getRemotePluginItems(query) {
    if (!this.harnessService.getActiveDescriptor().itemProvider) {
      return [];
    }
    try {
      const provided = await this.itemsModel.getActiveItemSource().fetchProviderItems();
      return provided.filter(
        (item) => isPluginCustomizationItem(item) && (!query || item.name.toLowerCase().includes(query) || item.description?.toLowerCase().includes(query) || item.badge?.toLowerCase().includes(query))
      );
    } catch {
      return [];
    }
  }
  getRemoteGroupMetadata(groupKey) {
    return {
      group: groupKey ?? "remote-host",
      label: localize("remoteHostGroup", "Remote"),
      description: localize("remoteHostGroupDescription", "Plugins configured directly on the remote agent host and available without local sync.")
    };
  }
  appendGroup(entries, header, items, isFirst) {
    if (items.length === 0) {
      return isFirst;
    }
    const collapsed = this.collapsedGroups.has(header.group);
    entries.push({
      type: "group-header",
      id: `plugin-group-${header.group}`,
      group: header.group,
      label: header.label,
      icon: pluginIcon,
      count: items.length,
      isFirst,
      description: header.description,
      collapsed
    });
    if (!collapsed) {
      entries.push(...items);
    }
    return false;
  }
  async filterPlugins() {
    const query = this.searchQuery.toLowerCase().trim();
    const allPlugins = this.agentPluginService.plugins.get();
    this.remoteItems = [...await this.getRemotePluginItems(query)];
    this.installedItems = allPlugins.map((p) => installedPluginToItem(p, this.labelService)).filter(
      (item) => !query || item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)
    );
    if (this.remoteItems.length === 0 && this.installedItems.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noMatchingPlugins", "No plugins match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else if (this.harnessService.getActiveDescriptor().itemProvider) {
        this.emptyText.textContent = localize("noRemotePlugins", "No plugins configured");
        this.emptySubtext.textContent = localize("addRemotePlugins", "Use the toolbar to add remote plugins or install plugins from a source.");
      } else {
        this.emptyText.textContent = localize("noPlugins", "No plugins installed");
        this.emptySubtext.textContent = localize("browseToAdd", "Browse the marketplace to discover and install plugins");
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const enabledPlugins = this.installedItems.filter((item) => isContributionEnabled(item.plugin.enablement.get()));
    const disabledPlugins = this.installedItems.filter((item) => !isContributionEnabled(item.plugin.enablement.get()));
    const entries = [];
    let isFirst = true;
    const installedNames = new Set(this.installedItems.map((item) => item.name.toLowerCase()));
    const remoteGroups = /* @__PURE__ */ new Map();
    for (const item of this.remoteItems) {
      const key = item.groupKey ?? "remote-host";
      if (key === "remote-client") {
        continue;
      }
      if (item.name && installedNames.has(item.name.toLowerCase())) {
        continue;
      }
      let group = remoteGroups.get(key);
      if (!group) {
        group = [];
        remoteGroups.set(key, group);
      }
      group.push({ type: "remote-item", item });
    }
    for (const [groupKey, items] of remoteGroups) {
      isFirst = this.appendGroup(entries, this.getRemoteGroupMetadata(groupKey), items, isFirst);
    }
    if (enabledPlugins.length > 0) {
      isFirst = this.appendGroup(
        entries,
        {
          group: "enabled",
          label: localize("enabledGroup", "Enabled Locally"),
          description: localize("enabledGroupDescription", "Plugins installed in this client and available for syncing to the remote session.")
        },
        enabledPlugins.map((item) => ({ type: "plugin-item", item })),
        isFirst
      );
    }
    if (disabledPlugins.length > 0) {
      this.appendGroup(
        entries,
        {
          group: "disabled",
          label: localize("disabledGroup", "Disabled Locally"),
          description: localize("disabledGroupDescription", "Plugins installed in this client but currently disabled.")
        },
        disabledPlugins.map((item) => ({ type: "plugin-item", item })),
        isFirst
      );
    }
    this.displayEntries = entries;
    this.list.splice(0, this.list.length, this.displayEntries);
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  /**
   * Gets the total item count from the underlying data array
   * (the same source used to build group headers).
   */
  get itemCount() {
    const installedNames = new Set(this.installedItems.map((item) => item.name.toLowerCase()));
    const uniqueRemote = this.remoteItems.filter((item) => {
      if (item.groupKey === "remote-client") {
        return false;
      }
      if (item.name && installedNames.has(item.name.toLowerCase())) {
        return false;
      }
      return true;
    });
    return uniqueRemote.length + this.installedItems.length;
  }
  /**
   * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
   * to ensure the subscriber receives the latest count.
   */
  fireItemCount() {
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  toggleGroup(entry) {
    if (this.collapsedGroups.has(entry.group)) {
      this.collapsedGroups.delete(entry.group);
    } else {
      this.collapsedGroups.add(entry.group);
    }
    void this.filterPlugins();
  }
  /**
   * Whether the widget is currently in marketplace browse mode.
   */
  isInBrowseMode() {
    return this.browseMode;
  }
  /**
   * Exits marketplace browse mode and returns to the installed plugins list.
   */
  exitBrowseMode() {
    if (this.browseMode) {
      this.toggleBrowseMode(false);
    }
  }
  layout(height, width) {
    this.lastHeight = height;
    this.lastWidth = width;
    this.element.style.height = `${height}px`;
    const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
    if (searchBarHeight === 0 && !this._layoutDeferred) {
      this._layoutDeferred = true;
      DOM.getWindow(this.element).requestAnimationFrame(() => {
        try {
          this.layout(this.lastHeight, this.lastWidth);
        } finally {
          this._layoutDeferred = false;
        }
      });
      return;
    }
    const headerHeight = this.sectionTitleHeader.offsetHeight;
    this.lastHeaderHeight = headerHeight;
    const listHeight = Math.max(0, height - searchBarHeight - headerHeight);
    this.listContainer.style.height = `${listHeight}px`;
    this.list.layout(listHeight, width);
  }
  focusSearch() {
    this.searchInput.focus();
  }
  revealLastItem() {
    if (this.list.length > 0) {
      this.list.reveal(this.list.length - 1);
    }
  }
  focus() {
    this.list.domFocus();
    if (this.list.length > 0) {
      this.list.setFocus([0]);
    }
  }
  onContextMenu(e) {
    if (!e.element || e.element.type === "group-header" || e.element.type === "marketplace-item") {
      return;
    }
    const entry = e.element;
    const disposables = new DisposableStore();
    const actions = [];
    if (entry.type === "plugin-item") {
      const groups = getInstalledPluginContextMenuActions(entry.item.plugin, this.instantiationService);
      for (const menuActions of groups) {
        for (const menuAction of menuActions) {
          actions.push(menuAction);
          if (isDisposable(menuAction)) {
            disposables.add(menuAction);
          }
        }
        actions.push(new Separator());
      }
      if (actions.length > 0 && actions[actions.length - 1] instanceof Separator) {
        actions.pop();
      }
    } else {
      const itemActions = entry.item.actions ?? [];
      for (const itemAction of itemActions) {
        actions.push(new Action(
          itemAction.id,
          itemAction.label,
          itemAction.icon ? ThemeIcon.asClassName(itemAction.icon) : void 0,
          itemAction.enabled !== false,
          () => itemAction.run()
        ));
      }
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      onHide: () => disposables.dispose()
    });
  }
};
PluginListWidget = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IAgentPluginService),
  __decorateParam(2, IPluginMarketplaceService),
  __decorateParam(3, IPluginInstallService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IContextViewService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, ICustomizationHarnessService),
  __decorateParam(11, IAICustomizationItemsModel),
  __decorateParam(12, IConfigurationService)
], PluginListWidget);
export {
  PluginListWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vcGx1Z2luTGlzdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciwgSUxpc3RDb250ZXh0TWVudUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uV2l0aERyb3Bkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdENoZWNrYm94U3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luLCBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ29udHJpYnV0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IGdldEluc3RhbGxlZFBsdWdpbkNvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uL2FnZW50UGx1Z2luQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2V0cGxhY2VQbHVnaW4sIElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpbkluc3RhbGxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5JdGVtS2luZCwgSUFnZW50UGx1Z2luSXRlbSwgSUluc3RhbGxlZFBsdWdpbkl0ZW0sIElNYXJrZXRwbGFjZVBsdWdpbkl0ZW0gfSBmcm9tICcuLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkl0ZW1zLmpzJztcbmltcG9ydCB7IHBsdWdpbkljb24gfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbkljb25zLmpzJztcbmltcG9ydCB7IGZvcm1hdERpc3BsYXlOYW1lLCB0cnVuY2F0ZVRvRmlyc3RMaW5lIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbkdyb3VwSGVhZGVyUmVuZGVyZXIsIElDdXN0b21pemF0aW9uR3JvdXBIZWFkZXJFbnRyeSwgQ1VTVE9NSVpBVElPTl9HUk9VUF9IRUFERVJfSEVJR0hULCBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFRfV0lUSF9TRVBBUkFUT1IgfSBmcm9tICcuL2N1c3RvbWl6YXRpb25Hcm91cEhlYWRlclJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIGlzUGx1Z2luQ3VzdG9taXphdGlvbkl0ZW0sIHR5cGUgSUN1c3RvbWl6YXRpb25JdGVtLCB0eXBlIElDdXN0b21pemF0aW9uSXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC5qcyc7XG5pbXBvcnQgeyBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZSwgR2FsbGVyeUl0ZW1SZW5kZXJlciwgSUdhbGxlcnlJdGVtUHJvdmlkZXIgfSBmcm9tICcuL2dhbGxlcnlJdGVtUmVuZGVyZXIuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmNvbnN0IFBMVUdJTl9JVEVNX0hFSUdIVCA9IDM2O1xuXG4vLyNyZWdpb24gRW50cnkgdHlwZXNcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgY29sbGFwc2libGUgZ3JvdXAgaGVhZGVyIGluIHRoZSBwbHVnaW4gbGlzdC5cbiAqL1xuaW50ZXJmYWNlIElQbHVnaW5Hcm91cEhlYWRlckVudHJ5IGV4dGVuZHMgSUN1c3RvbWl6YXRpb25Hcm91cEhlYWRlckVudHJ5IHtcblx0cmVhZG9ubHkgZ3JvdXA6IHN0cmluZztcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGFuIGluc3RhbGxlZCBwbHVnaW4gaXRlbSBpbiB0aGUgbGlzdC5cbiAqL1xuaW50ZXJmYWNlIElQbHVnaW5JbnN0YWxsZWRJdGVtRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAncGx1Z2luLWl0ZW0nO1xuXHRyZWFkb25seSBpdGVtOiBJSW5zdGFsbGVkUGx1Z2luSXRlbTtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgbWFya2V0cGxhY2UgcGx1Z2luIGl0ZW0gaW4gdGhlIGxpc3QgKGJyb3dzZSBtb2RlKS5cbiAqL1xuaW50ZXJmYWNlIElQbHVnaW5NYXJrZXRwbGFjZUl0ZW1FbnRyeSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdtYXJrZXRwbGFjZS1pdGVtJztcblx0cmVhZG9ubHkgaXRlbTogSU1hcmtldHBsYWNlUGx1Z2luSXRlbTtcbn1cblxuaW50ZXJmYWNlIElQbHVnaW5SZW1vdGVJdGVtRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAncmVtb3RlLWl0ZW0nO1xuXHRyZWFkb25seSBpdGVtOiBJQ3VzdG9taXphdGlvbkl0ZW07XG59XG5cbnR5cGUgSVBsdWdpbkxpc3RFbnRyeSA9IElQbHVnaW5Hcm91cEhlYWRlckVudHJ5IHwgSVBsdWdpbkluc3RhbGxlZEl0ZW1FbnRyeSB8IElQbHVnaW5NYXJrZXRwbGFjZUl0ZW1FbnRyeSB8IElQbHVnaW5SZW1vdGVJdGVtRW50cnk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gRGVsZWdhdGVcblxuY2xhc3MgUGx1Z2luSXRlbURlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SVBsdWdpbkxpc3RFbnRyeT4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSVBsdWdpbkxpc3RFbnRyeSk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmlzRmlyc3QgPyBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFQgOiBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFRfV0lUSF9TRVBBUkFUT1I7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdtYXJrZXRwbGFjZS1pdGVtJykge1xuXHRcdFx0cmV0dXJuIDYyO1xuXHRcdH1cblx0XHRyZXR1cm4gUExVR0lOX0lURU1fSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJUGx1Z2luTGlzdEVudHJ5KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnZ3JvdXAtaGVhZGVyJykge1xuXHRcdFx0cmV0dXJuICdwbHVnaW5Hcm91cEhlYWRlcic7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdtYXJrZXRwbGFjZS1pdGVtJykge1xuXHRcdFx0cmV0dXJuIFBMVUdJTl9NQVJLRVRQTEFDRV9JVEVNX1RFTVBMQVRFX0lEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC50eXBlID09PSAncmVtb3RlLWl0ZW0nKSB7XG5cdFx0XHRyZXR1cm4gJ3BsdWdpblJlbW90ZUl0ZW0nO1xuXHRcdH1cblx0XHRyZXR1cm4gJ3BsdWdpbkluc3RhbGxlZEl0ZW0nO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEluc3RhbGxlZCBQbHVnaW4gUmVuZGVyZXIgKHJldXNlcyAubWNwLXNlcnZlci1pdGVtIENTUylcblxuaW50ZXJmYWNlIElQbHVnaW5JbnN0YWxsZWRJdGVtVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc3luY0NoZWNrYm94Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdHlwZUljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBuYW1lOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBQbHVnaW5JbnN0YWxsZWRJdGVtUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElQbHVnaW5JbnN0YWxsZWRJdGVtRW50cnksIElQbHVnaW5JbnN0YWxsZWRJdGVtVGVtcGxhdGVEYXRhPiB7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAncGx1Z2luSW5zdGFsbGVkSXRlbSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElQbHVnaW5JbnN0YWxsZWRJdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbWNwLXNlcnZlci1pdGVtJyk7XG5cblx0XHRjb25zdCBzeW5jQ2hlY2tib3hDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLml0ZW0tc3luYy1jaGVja2JveCcpKTtcblx0XHRjb25zdCB0eXBlSWNvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcubWNwLXNlcnZlci1pY29uJykpO1xuXHRcdHR5cGVJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkocGx1Z2luSWNvbikpO1xuXG5cdFx0Y29uc3QgZGV0YWlscyA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcubWNwLXNlcnZlci1kZXRhaWxzJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBET00uYXBwZW5kKGRldGFpbHMsICQoJy5tY3Atc2VydmVyLW5hbWUnKSk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBET00uYXBwZW5kKGRldGFpbHMsICQoJy5tY3Atc2VydmVyLWRlc2NyaXB0aW9uJykpO1xuXG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCBzeW5jQ2hlY2tib3hDb250YWluZXIsIHR5cGVJY29uLCBuYW1lLCBkZXNjcmlwdGlvbiwgZGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJUGx1Z2luSW5zdGFsbGVkSXRlbUVudHJ5LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUGx1Z2luSW5zdGFsbGVkSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBmb3JtYXREaXNwbGF5TmFtZShlbGVtZW50Lml0ZW0ubmFtZSk7XG5cblx0XHRpZiAoZWxlbWVudC5pdGVtLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSB0cnVuY2F0ZVRvRmlyc3RMaW5lKGVsZW1lbnQuaXRlbS5kZXNjcmlwdGlvbik7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBSZWZsZWN0IGVuYWJsZWQvZGlzYWJsZWQgc3RhdGUgb24gdGhlIGNvbnRhaW5lciBmb3IgdmlzdWFsIHN0eWxpbmcuIFRoZVxuXHRcdC8vIGlubGluZSBzdGF0dXMgYmFkZ2UgKFwiRW5hYmxlZFwiL1wiRGlzYWJsZWRcIikgaXMgaW50ZW50aW9uYWxseSBvbWl0dGVkIFx1MjAxNFxuXHRcdC8vIGl0ZW1zIGFyZSBhbHJlYWR5IGdyb3VwZWQgdW5kZXIgXCJFbmFibGVkIExvY2FsbHlcIiAvIFwiRGlzYWJsZWQgTG9jYWxseVwiXG5cdFx0Ly8gc2VjdGlvbiBoZWFkZXJzLCBhbmQgdGhlIHJvdydzIGFyaWEtbGFiZWwgY29udmV5cyBzdGF0ZSB0byBzY3JlZW4gcmVhZGVycy5cblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZWxlbWVudC5pdGVtLnBsdWdpbi5lbmFibGVtZW50LnJlYWQocmVhZGVyKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWVuYWJsZWQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERpc2FibGUgY2hlY2tib3g6IHNob3duIHdoZW4gdGhlIGFjdGl2ZSBoYXJuZXNzIGhhcyBhIGRpc2FibGUgcHJvdmlkZXJcblx0XHRjb25zdCBzeW5jUHJvdmlkZXIgPSB0aGlzLl9oYXJuZXNzU2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCkuc3luY1Byb3ZpZGVyO1xuXHRcdGlmIChzeW5jUHJvdmlkZXIpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5zeW5jQ2hlY2tib3hDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0Y29uc3QgcGx1Z2luVXJpID0gZWxlbWVudC5pdGVtLnBsdWdpbi51cmk7XG5cdFx0XHRjb25zdCBkaXNhYmxlZCA9IHN5bmNQcm92aWRlci5pc0Rpc2FibGVkKHBsdWdpblVyaSk7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGRpc2FibGVkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2VuYWJsZVBsdWdpbicsIFwiRW5hYmxlIHswfSBmb3Igc3luY1wiLCBlbGVtZW50Lml0ZW0ubmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZGlzYWJsZVBsdWdpbicsIFwiRGlzYWJsZSB7MH0gZnJvbSBzeW5jXCIsIGVsZW1lbnQuaXRlbS5uYW1lKTtcblx0XHRcdGNvbnN0IGNoZWNrYm94ID0gdGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0bmV3IENoZWNrYm94KHRpdGxlLCAhZGlzYWJsZWQsIGRlZmF1bHRDaGVja2JveFN0eWxlcylcblx0XHRcdCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc3luY0NoZWNrYm94Q29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbihjaGVja2JveC5kb21Ob2RlKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRzeW5jUHJvdmlkZXIuc2V0RGlzYWJsZWQocGx1Z2luVXJpLCAhY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5zeW5jQ2hlY2tib3hDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRlbXBsYXRlRGF0YS5zeW5jQ2hlY2tib3hDb250YWluZXIucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVBsdWdpbkluc3RhbGxlZEl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gUmVtb3RlIFBsdWdpbiBSZW5kZXJlclxuXG5pbnRlcmZhY2UgSVBsdWdpblJlbW90ZUl0ZW1UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0eXBlSWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBiYWRnZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc3RhdHVzOiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgUGx1Z2luUmVtb3RlSXRlbVJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJUGx1Z2luUmVtb3RlSXRlbUVudHJ5LCBJUGx1Z2luUmVtb3RlSXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ3BsdWdpblJlbW90ZUl0ZW0nO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUGx1Z2luUmVtb3RlSXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21jcC1zZXJ2ZXItaXRlbScpO1xuXG5cdFx0Y29uc3QgdHlwZUljb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1jcC1zZXJ2ZXItaWNvbicpKTtcblx0XHR0eXBlSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHBsdWdpbkljb24pKTtcblxuXHRcdGNvbnN0IGRldGFpbHMgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1jcC1zZXJ2ZXItZGV0YWlscycpKTtcblx0XHRjb25zdCBuYW1lUm93ID0gRE9NLmFwcGVuZChkZXRhaWxzLCAkKCcubWNwLXNlcnZlci1uYW1lJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBET00uYXBwZW5kKG5hbWVSb3csICQoJ3NwYW4nKSk7XG5cdFx0Y29uc3QgYmFkZ2UgPSBET00uYXBwZW5kKG5hbWVSb3csICQoJy5pbmxpbmUtYmFkZ2UuaXRlbS1iYWRnZScpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IERPTS5hcHBlbmQoZGV0YWlscywgJCgnLm1jcC1zZXJ2ZXItZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3Qgc3RhdHVzID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLXN0YXR1cycpKTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgdHlwZUljb24sIG5hbWUsIGJhZGdlLCBkZXNjcmlwdGlvbiwgc3RhdHVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElQbHVnaW5SZW1vdGVJdGVtRW50cnksIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElQbHVnaW5SZW1vdGVJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBmb3JtYXREaXNwbGF5TmFtZShlbGVtZW50Lml0ZW0ubmFtZSk7XG5cblx0XHRpZiAoZWxlbWVudC5pdGVtLmJhZGdlKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2UudGV4dENvbnRlbnQgPSBlbGVtZW50Lml0ZW0uYmFkZ2U7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmJhZGdlLnRpdGxlID0gZWxlbWVudC5pdGVtLmJhZGdlVG9vbHRpcCA/PyAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmJhZGdlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRlbXBsYXRlRGF0YS5iYWRnZS50aXRsZSA9ICcnO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50Lml0ZW0uZGVzY3JpcHRpb24pIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9IHRydW5jYXRlVG9GaXJzdExpbmUoZWxlbWVudC5pdGVtLmRlc2NyaXB0aW9uKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGVsZW1lbnQuaXRlbS5lbmFibGVkID09PSBmYWxzZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy5jbGFzc05hbWUgPSAnbWNwLXNlcnZlci1zdGF0dXMnO1xuXHRcdGlmIChlbGVtZW50Lml0ZW0uZW5hYmxlZCA9PT0gZmFsc2UpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncmVtb3RlUGx1Z2luRGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoZWxlbWVudC5pdGVtLnN0YXR1cykge1xuXHRcdFx0Y2FzZSAnbG9hZGluZyc6XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXMudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncmVtb3RlUGx1Z2luTG9hZGluZycsIFwiTG9hZGluZ1wiKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy5jbGFzc0xpc3QuYWRkKCdydW5uaW5nJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbG9hZGVkJzpcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdyZW1vdGVQbHVnaW5Mb2FkZWQnLCBcIkxvYWRlZFwiKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy5jbGFzc0xpc3QuYWRkKCdydW5uaW5nJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZGVncmFkZWQnOlxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3JlbW90ZVBsdWdpbkRlZ3JhZGVkJywgXCJXYXJuaW5nXCIpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3JlbW90ZVBsdWdpbkVycm9yJywgXCJFcnJvclwiKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1cy5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXMudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKF90ZW1wbGF0ZURhdGE6IElQbHVnaW5SZW1vdGVJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7IH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBNYXJrZXRwbGFjZSBQbHVnaW4gUmVuZGVyZXJcblxuY29uc3QgUExVR0lOX01BUktFVFBMQUNFX0lURU1fVEVNUExBVEVfSUQgPSAncGx1Z2luTWFya2V0cGxhY2VJdGVtJztcblxuLyoqIEFkYXB0cyBhIG1hcmtldHBsYWNlIHBsdWdpbiBlbnRyeSB0byB0aGUgc2hhcmVkIGdhbGxlcnkgcm93IHJlbmRlcmVyLiAqL1xuY2xhc3MgUGx1Z2luTWFya2V0cGxhY2VJdGVtUHJvdmlkZXIgaW1wbGVtZW50cyBJR2FsbGVyeUl0ZW1Qcm92aWRlcjxJUGx1Z2luTWFya2V0cGxhY2VJdGVtRW50cnk+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBsdWdpbkluc3RhbGxTZXJ2aWNlOiBJUGx1Z2luSW5zdGFsbFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0TGFiZWwoZWxlbWVudDogSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWxlbWVudC5pdGVtLm5hbWU7XG5cdH1cblxuXHRnZXRQdWJsaXNoZXJEaXNwbGF5TmFtZShlbGVtZW50OiBJUGx1Z2luTWFya2V0cGxhY2VJdGVtRW50cnkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBlbGVtZW50Lml0ZW0ubWFya2V0cGxhY2U7XG5cdH1cblxuXHRnZXREZXNjcmlwdGlvbihlbGVtZW50OiBJUGx1Z2luTWFya2V0cGxhY2VJdGVtRW50cnkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBlbGVtZW50Lml0ZW0uZGVzY3JpcHRpb247XG5cdH1cblxuXHRnZXRJbnN0YWxsU3RhdGUoZWxlbWVudDogSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5KTogR2FsbGVyeUl0ZW1JbnN0YWxsU3RhdGUge1xuXHRcdGNvbnN0IGluc3RhbGxVcmkgPSB0aGlzLnBsdWdpbkluc3RhbGxTZXJ2aWNlLmdldFBsdWdpbkluc3RhbGxVcmkodGhpcy5fdG9JbnN0YWxsYWJsZShlbGVtZW50Lml0ZW0pKTtcblx0XHRjb25zdCBpc0luc3RhbGxlZCA9IHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMuZ2V0KCkuc29tZShwID0+IGlzRXF1YWwocC51cmksIGluc3RhbGxVcmkpKTtcblx0XHRyZXR1cm4gaXNJbnN0YWxsZWQgPyBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZS5JbnN0YWxsZWQgOiBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZS5Vbmluc3RhbGxlZDtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwoZWxlbWVudDogSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5wbHVnaW5JbnN0YWxsU2VydmljZS5pbnN0YWxsUGx1Z2luKHsgLi4udGhpcy5fdG9JbnN0YWxsYWJsZShlbGVtZW50Lml0ZW0pLCByZWFkbWVVcmk6IGVsZW1lbnQuaXRlbS5yZWFkbWVVcmkgfSk7XG5cdH1cblxuXHRvbkRpZENoYW5nZUluc3RhbGxTdGF0ZShfZWxlbWVudDogSVBsdWdpbk1hcmtldHBsYWNlSXRlbUVudHJ5LCBsaXN0ZW5lcjogKCkgPT4gdm9pZCkge1xuXHRcdHJldHVybiBydW5PbkNoYW5nZSh0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLCAoKSA9PiBsaXN0ZW5lcigpKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvSW5zdGFsbGFibGUoaXRlbTogSU1hcmtldHBsYWNlUGx1Z2luSXRlbSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0c291cmNlRGVzY3JpcHRvcjogaXRlbS5zb3VyY2VEZXNjcmlwdG9yLFxuXHRcdFx0c291cmNlOiBpdGVtLnNvdXJjZSxcblx0XHRcdG1hcmtldHBsYWNlOiBpdGVtLm1hcmtldHBsYWNlLFxuXHRcdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IGl0ZW0ubWFya2V0cGxhY2VSZWZlcmVuY2UsXG5cdFx0XHRtYXJrZXRwbGFjZVR5cGU6IGl0ZW0ubWFya2V0cGxhY2VUeXBlLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBIZWxwZXJzXG5cbmZ1bmN0aW9uIGluc3RhbGxlZFBsdWdpblRvSXRlbShwbHVnaW46IElBZ2VudFBsdWdpbiwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlKTogSUluc3RhbGxlZFBsdWdpbkl0ZW0ge1xuXHQvLyBVc2UgYHx8YCAobm90IGA/P2ApIHNvIGFuIGVtcHR5IGBsYWJlbGAgYWxzbyBmYWxscyBiYWNrIHRvIHRoZSBVUkkgYmFzZW5hbWUuXG5cdC8vIFRoZSBpdGVtcyBtb2RlbCdzIGBnZXRQbHVnaW5Db3VudGAgZGVkdXBlcyBhZ2FpbnN0IHRoaXMgc2FtZSBmYWxsYmFjazsgdXNpbmdcblx0Ly8gYD8/YCBoZXJlIHdvdWxkIHNpbGVudGx5IGJyZWFrIGRlZHVwIGZvciBwbHVnaW5zIHdob3NlIGxhYmVsIGlzIGAnJ2AuXG5cdGNvbnN0IG5hbWUgPSBwbHVnaW4ubGFiZWwgfHwgYmFzZW5hbWUocGx1Z2luLnVyaSk7XG5cdGNvbnN0IGRlc2NyaXB0aW9uID0gcGx1Z2luLmZyb21NYXJrZXRwbGFjZT8uZGVzY3JpcHRpb24gPz8gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUocGx1Z2luLnVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdGNvbnN0IG1hcmtldHBsYWNlID0gcGx1Z2luLmZyb21NYXJrZXRwbGFjZT8ubWFya2V0cGxhY2U7XG5cdHJldHVybiB7IGtpbmQ6IEFnZW50UGx1Z2luSXRlbUtpbmQuSW5zdGFsbGVkLCBuYW1lLCBkZXNjcmlwdGlvbiwgbWFya2V0cGxhY2UsIHBsdWdpbiB9O1xufVxuXG5mdW5jdGlvbiBtYXJrZXRwbGFjZVBsdWdpblRvSXRlbShwbHVnaW46IElNYXJrZXRwbGFjZVBsdWdpbik6IElNYXJrZXRwbGFjZVBsdWdpbkl0ZW0ge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6IEFnZW50UGx1Z2luSXRlbUtpbmQuTWFya2V0cGxhY2UsXG5cdFx0bmFtZTogcGx1Z2luLm5hbWUsXG5cdFx0ZGVzY3JpcHRpb246IHBsdWdpbi5kZXNjcmlwdGlvbixcblx0XHRzb3VyY2U6IHBsdWdpbi5zb3VyY2UsXG5cdFx0c291cmNlRGVzY3JpcHRvcjogcGx1Z2luLnNvdXJjZURlc2NyaXB0b3IsXG5cdFx0bWFya2V0cGxhY2U6IHBsdWdpbi5tYXJrZXRwbGFjZSxcblx0XHRtYXJrZXRwbGFjZVJlZmVyZW5jZTogcGx1Z2luLm1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdG1hcmtldHBsYWNlVHlwZTogcGx1Z2luLm1hcmtldHBsYWNlVHlwZSxcblx0XHRyZWFkbWVVcmk6IHBsdWdpbi5yZWFkbWVVcmksXG5cdH07XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vKipcbiAqIFdpZGdldCB0aGF0IGRpc3BsYXlzIGEgbGlzdCBvZiBhZ2VudCBwbHVnaW5zIHdpdGggbWFya2V0cGxhY2UgYnJvd3NpbmcuXG4gKiBGb2xsb3dzIHRoZSBzYW1lIHBhdHRlcm5zIGFzIHtAbGluayBNY3BMaXN0V2lkZ2V0fS5cbiAqL1xuZXhwb3J0IGNsYXNzIFBsdWdpbkxpc3RXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbGVjdFBsdWdpbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFBsdWdpbkl0ZW0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNlbGVjdFBsdWdpbiA9IHRoaXMuX29uRGlkU2VsZWN0UGx1Z2luLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbUNvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtQ291bnQgPSB0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5ldmVudDtcblxuXHRwcml2YXRlIHNlY3Rpb25UaXRsZUhlYWRlciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlY3Rpb25MaW5rITogSFRNTEFuY2hvckVsZW1lbnQ7XG5cdHByaXZhdGUgc2VhcmNoQW5kQnV0dG9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VhcmNoSW5wdXQhOiBJbnB1dEJveDtcblx0cHJpdmF0ZSBsaXN0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGlzdCE6IFdvcmtiZW5jaExpc3Q8SVBsdWdpbkxpc3RFbnRyeT47XG5cdHByaXZhdGUgZW1wdHlDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlbXB0eVRleHQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlbXB0eVN1YnRleHQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkaXNhYmxlZENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRpc2FibGVkSWNvbiE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRpc2FibGVkTWVzc2FnZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc2FibGVkTGlua0xpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIGJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGJyb3dzZUJ1dHRvbiE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBiYWNrQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIGFkZEJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGFkZEJ1dHRvblNpbXBsZSE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBhZGRCdXR0b24hOiBCdXR0b25XaXRoRHJvcGRvd247XG5cdHByaXZhdGUgY3JlYXRlUGx1Z2luQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFkZERyb3Bkb3duQWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBpbnN0YWxsZWRJdGVtczogSUluc3RhbGxlZFBsdWdpbkl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIHJlbW90ZUl0ZW1zOiBJQ3VzdG9taXphdGlvbkl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIGRpc3BsYXlFbnRyaWVzOiBJUGx1Z2luTGlzdEVudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSBtYXJrZXRwbGFjZUl0ZW1zOiBJTWFya2V0cGxhY2VQbHVnaW5JdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBzZWFyY2hRdWVyeTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgYnJvd3NlTW9kZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgbGFzdFdpZHRoOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGxhc3RIZWFkZXJIZWlnaHQgPSAwO1xuXHRwcml2YXRlIF9sYXlvdXREZWZlcnJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZEdyb3VwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIG1hcmtldHBsYWNlQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVkRmlsdGVyID0gbmV3IERlbGF5ZXI8dm9pZD4oMjAwKTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVkTWFya2V0cGxhY2VTZWFyY2ggPSBuZXcgRGVsYXllcjx2b2lkPig0MDApO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHRcdEBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlOiBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLFxuXHRcdEBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5JbnN0YWxsU2VydmljZTogSVBsdWdpbkluc3RhbGxTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIHByaXZhdGUgcmVhZG9ubHkgaXRlbXNNb2RlbDogSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLm1jcC1saXN0LXdpZGdldCcpOyAvLyByZXVzZSBNQ1AgbGlzdCB3aWRnZXQgQ1NTXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0XHR0aGlzLnVwZGF0ZUFjY2Vzc1N0YXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBY2Nlc3NTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMubWFya2V0cGxhY2VDdHM/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCk6IHZvaWQge1xuXHRcdC8vIFNlY3Rpb24gdGl0bGUgaGVhZGVyICh0aXRsZSArIGRlc2NyaXB0aW9uIHdpdGggaW5saW5lIGxlYXJuIG1vcmUpIGF0IHRoZSB0b3AuXG5cdFx0dGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLnNlY3Rpb24tdGl0bGUtaGVhZGVyJykpO1xuXHRcdGNvbnN0IHRpdGxlUm93ID0gRE9NLmFwcGVuZCh0aGlzLnNlY3Rpb25UaXRsZUhlYWRlciwgJCgnLnNlY3Rpb24tdGl0bGUtcm93JykpO1xuXHRcdGNvbnN0IHNlY3Rpb25UaXRsZSA9IERPTS5hcHBlbmQodGl0bGVSb3csICQoJ2gyLnNlY3Rpb24tdGl0bGUnKSk7XG5cdFx0c2VjdGlvblRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BsdWdpbnMnLCBcIlBsdWdpbnNcIik7XG5cdFx0Y29uc3Qgc2VjdGlvblRpdGxlRGVzY3JpcHRpb24gPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvblRpdGxlSGVhZGVyLCAkKCdwLnNlY3Rpb24tdGl0bGUtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3Qgc2VjdGlvblRpdGxlRGVzY3JpcHRpb25UZXh0ID0gRE9NLmFwcGVuZChzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiwgJCgnc3Bhbi5zZWN0aW9uLXRpdGxlLWRlc2NyaXB0aW9uLXRleHQnKSk7XG5cdFx0c2VjdGlvblRpdGxlRGVzY3JpcHRpb25UZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BsdWdpbnNEZXNjcmlwdGlvbicsIFwiRXh0ZW5kIHlvdXIgQUkgYWdlbnQgd2l0aCBwbHVnaW5zIHRoYXQgYWRkIGNvbW1hbmRzLCBza2lsbHMsIGFnZW50cywgaG9va3MsIGFuZCBNQ1Agc2VydmVycyBmcm9tIHJldXNhYmxlIHBhY2thZ2VzLlwiKTtcblx0XHQvLyBSZWFsIHdoaXRlc3BhY2UgdGV4dCBub2RlIGJldHdlZW4gZGVzY3JpcHRpb24gYW5kIGxpbmsgc28gdGhlIGdhcCBjb2xsYXBzZXNcblx0XHQvLyB3aGVuIHRoZSBsaW5rIHdyYXBzIHRvIGEgbmV3IGxpbmUgKGEgQ1NTIG1hcmdpbi1sZWZ0IHdvdWxkIHB1c2ggaXQgaW53YXJkKS5cblx0XHRzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHR0aGlzLnNlY3Rpb25MaW5rID0gRE9NLmFwcGVuZChzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiwgJCgnYS5zZWN0aW9uLXRpdGxlLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0dGhpcy5zZWN0aW9uTGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsZWFybk1vcmVQbHVnaW5zJywgXCJMZWFybiBtb3JlIGFib3V0IGFnZW50IHBsdWdpbnNcIik7XG5cdFx0dGhpcy5zZWN0aW9uTGluay5ocmVmID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvYWdlbnQtY3VzdG9taXphdGlvbi9hZ2VudC1wbHVnaW5zP3JlZmVycmVyPWluLXByb2R1Y3QnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWN0aW9uTGluaywgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGNvbnN0IGhyZWYgPSB0aGlzLnNlY3Rpb25MaW5rLmhyZWY7XG5cdFx0XHRpZiAoaHJlZikge1xuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoaHJlZikpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLWxheW91dCB3aGVuIHRoZSBoZWFkZXIgaGVpZ2h0IGNoYW5nZXMgc28gdGhlIGxpc3QncyBhbGxvdHRlZFxuXHRcdC8vIGhlaWdodCBzdGF5cyBpbiBzeW5jIHdpdGggdGhlIGFjdHVhbCBvbi1zY3JlZW4gaGVhZGVyIHNpemUuIE9ubHlcblx0XHQvLyByZWxheW91dCB3aGVuIHRoZSBoZWFkZXIgaGVpZ2h0IGFjdHVhbGx5IGNoYW5nZWQgdG8gYXZvaWQgcmVkdW5kYW50XG5cdFx0Ly8gd29yayBvbiBEUFIgY2hhbmdlcyBvciB3aWR0aC1vbmx5IHJlc2l6ZXMuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdGNvbnN0IGhlYWRlck9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERPTS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoXG5cdFx0XHQnUGx1Z2luTGlzdFdpZGdldC5zZWN0aW9uVGl0bGVIZWFkZXInLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5sYXN0V2lkdGggPD0gMCB8fCB0aGlzLmxhc3RIZWlnaHQgPD0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSB0aGlzLnNlY3Rpb25UaXRsZUhlYWRlci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRcdGlmIChoZWFkZXJIZWlnaHQgPT09IHRoaXMubGFzdEhlYWRlckhlaWdodCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RIZWlnaHQsIHRoaXMubGFzdFdpZHRoKTtcblx0XHRcdH0sXG5cdFx0XHR0YXJnZXRXaW5kb3csXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGVhZGVyT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLnNlY3Rpb25UaXRsZUhlYWRlcikpO1xuXG5cdFx0Ly8gU2VhcmNoIGFuZCBidXR0b24gY29udGFpbmVyXG5cdFx0dGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmxpc3Qtc2VhcmNoLWFuZC1idXR0b24tY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gU2VhcmNoIGNvbnRhaW5lclxuXHRcdGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIsICQoJy5saXN0LXNlYXJjaC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnB1dEJveChzZWFyY2hDb250YWluZXIsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3NlYXJjaFBsdWdpbnNQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2guLi5cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hRdWVyeSA9IHRoaXMuc2VhcmNoSW5wdXQudmFsdWU7XG5cdFx0XHRpZiAodGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHRcdHRoaXMuZGVsYXllZE1hcmtldHBsYWNlU2VhcmNoLnRyaWdnZXIoKCkgPT4gdGhpcy5xdWVyeU1hcmtldHBsYWNlKCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5kZWxheWVkRmlsdGVyLnRyaWdnZXIoKCkgPT4gdGhpcy5maWx0ZXJQbHVnaW5zKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJ1dHRvbiBjb250YWluZXIgKEJyb3dzZSBNYXJrZXRwbGFjZSArIEFkZCBhY3Rpb25zICsgQ3JlYXRlIFBsdWdpbilcblx0XHR0aGlzLmJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIsICQoJy5saXN0LWJ1dHRvbi1ncm91cCcpKTtcblxuXHRcdC8vIEJhY2sgYnV0dG9uICh2aXNpYmxlIG9ubHkgaW4gbWFya2V0cGxhY2UgYnJvd3NlIG1vZGUpXG5cdFx0Y29uc3QgYmFja0J1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5idXR0b25Db250YWluZXIsICQoJy5saXN0LWFkZC1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGJhY2tUb0luc3RhbGxlZExhYmVsID0gbG9jYWxpemUoJ2JhY2tUb0luc3RhbGxlZFBsdWdpbnMnLCBcIkJhY2sgdG8gSW5zdGFsbGVkIFBsdWdpbnNcIik7XG5cdFx0dGhpcy5iYWNrQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihiYWNrQnV0dG9uQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogYmFja1RvSW5zdGFsbGVkTGFiZWwsIGFyaWFMYWJlbDogYmFja1RvSW5zdGFsbGVkTGFiZWwgfSkpO1xuXHRcdHRoaXMuYmFja0J1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5hcnJvd0xlZnQuaWR9KSAke2xvY2FsaXplKCdwbHVnaW5Ccm93c2VCYWNrJywgXCJCYWNrXCIpfWA7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYmFja0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMudG9nZ2xlQnJvd3NlTW9kZShmYWxzZSkpKTtcblxuXHRcdGNvbnN0IGJyb3dzZUJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5idXR0b25Db250YWluZXIsICQoJy5saXN0LWFkZC1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGJyb3dzZU1hcmtldHBsYWNlTGFiZWwgPSBsb2NhbGl6ZSgnYnJvd3NlTWFya2V0cGxhY2UnLCBcIkJyb3dzZSBNYXJrZXRwbGFjZVwiKTtcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oYnJvd3NlQnV0dG9uQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogYnJvd3NlTWFya2V0cGxhY2VMYWJlbCwgYXJpYUxhYmVsOiBicm93c2VNYXJrZXRwbGFjZUxhYmVsIH0pKTtcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpc3QtYWRkLWJ1dHRvbicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJvd3NlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5QcmltYXJ5QnV0dG9uQWN0aW9uKCkpKTtcblxuXHRcdHRoaXMuYWRkQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3QtYWRkLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYWRkUGx1Z2luTGFiZWwgPSBsb2NhbGl6ZSgnYWRkUGx1Z2luJywgXCJBZGQgUGx1Z2luXCIpO1xuXHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmFkZEJ1dHRvbkNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSwgdGl0bGU6IGFkZFBsdWdpbkxhYmVsLCBhcmlhTGFiZWw6IGFkZFBsdWdpbkxhYmVsIH0pKTtcblx0XHR0aGlzLmFkZEJ1dHRvblNpbXBsZS5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpc3QtYWRkLWJ1dHRvbicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWRkQnV0dG9uU2ltcGxlLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5QcmltYXJ5QWRkQWN0aW9uKCkpKTtcblxuXHRcdHRoaXMuYWRkQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbldpdGhEcm9wZG93bih0aGlzLmFkZEJ1dHRvbkNvbnRhaW5lciwge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0YWRkUHJpbWFyeUFjdGlvblRvRHJvcGRvd246IGZhbHNlLFxuXHRcdFx0YWN0aW9uczogeyBnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLmdldEFkZERyb3Bkb3duQWN0aW9ucygpIH0sXG5cdFx0XHR0aXRsZTogYWRkUGx1Z2luTGFiZWwsXG5cdFx0XHRhcmlhTGFiZWw6IGFkZFBsdWdpbkxhYmVsLFxuXHRcdH0pKTtcblx0XHR0aGlzLmFkZEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpc3QtYWRkLWJ1dHRvbicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWRkQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5ydW5QcmltYXJ5QWRkQWN0aW9uKCkpKTtcblxuXHRcdGNvbnN0IGNyZWF0ZVBsdWdpbkxhYmVsID0gbG9jYWxpemUoJ2NyZWF0ZVBsdWdpbicsIFwiQ3JlYXRlIFBsdWdpblwiKTtcblx0XHR0aGlzLmNyZWF0ZVBsdWdpbkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5idXR0b25Db250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBjcmVhdGVQbHVnaW5MYWJlbCwgYXJpYUxhYmVsOiBjcmVhdGVQbHVnaW5MYWJlbCB9KSk7XG5cdFx0dGhpcy5jcmVhdGVQbHVnaW5CdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaXN0LWljb24tYnV0dG9uJyk7XG5cdFx0dGhpcy5jcmVhdGVQbHVnaW5CdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24ubmV3RmlsZS5pZH0pYDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZVBsdWdpbkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMucnVuQ3JlYXRlUGx1Z2luQWN0aW9uKCkpKTtcblxuXHRcdC8vIEVtcHR5IHN0YXRlXG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcubWNwLWVtcHR5LXN0YXRlJykpO1xuXHRcdGNvbnN0IGVtcHR5SGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLmVtcHR5Q29udGFpbmVyLCAkKCcuZW1wdHktc3RhdGUtaGVhZGVyJykpO1xuXHRcdHRoaXMuZW1wdHlUZXh0ID0gRE9NLmFwcGVuZChlbXB0eUhlYWRlciwgJCgnLmVtcHR5LXRleHQnKSk7XG5cdFx0dGhpcy5lbXB0eVN1YnRleHQgPSBET00uYXBwZW5kKHRoaXMuZW1wdHlDb250YWluZXIsICQoJy5lbXB0eS1zdWJ0ZXh0JykpO1xuXG5cdFx0Ly8gRGlzYWJsZWQgKGFjY2VzcyBibG9ja2VkKSBzdGF0ZSBcdTIwMTQgc2hvd24gd2hlbiBjaGF0LnBsdWdpbnMuZW5hYmxlZCBpcyBmYWxzZSxcblx0XHQvLyBlaXRoZXIgYnkgdXNlciBzZXR0aW5nIG9yIGJ5IGVudGVycHJpc2UgcG9saWN5LlxuXHRcdHRoaXMuZGlzYWJsZWRDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLm1jcC1kaXNhYmxlZC1zdGF0ZScpKTtcblx0XHRjb25zdCBkaXNhYmxlZEhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5kaXNhYmxlZENvbnRhaW5lciwgJCgnLmVtcHR5LXN0YXRlLWhlYWRlcicpKTtcblx0XHR0aGlzLmRpc2FibGVkSWNvbiA9IERPTS5hcHBlbmQoZGlzYWJsZWRIZWFkZXIsICQoJy5lbXB0eS1pY29uJykpO1xuXHRcdGNvbnN0IGRpc2FibGVkVGV4dCA9IERPTS5hcHBlbmQoZGlzYWJsZWRIZWFkZXIsICQoJy5lbXB0eS10ZXh0JykpO1xuXHRcdGRpc2FibGVkVGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwbHVnaW5zRGlzYWJsZWRUaXRsZScsIFwiUGx1Z2lucyBhcmUgZGlzYWJsZWRcIik7XG5cdFx0dGhpcy5kaXNhYmxlZE1lc3NhZ2UgPSBET00uYXBwZW5kKHRoaXMuZGlzYWJsZWRDb250YWluZXIsICQoJy5lbXB0eS1zdWJ0ZXh0JykpO1xuXG5cdFx0Ly8gTGlzdCBjb250YWluZXJcblx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLm1jcC1saXN0LWNvbnRhaW5lcicpKTtcblxuXHRcdC8vIFNlY3Rpb24gZm9vdGVyIChyZW1vdmVkIFx1MjAxNCBzZWUgc2VjdGlvbi10aXRsZS1oZWFkZXIgYXQgdG9wKVxuXG5cdFx0Ly8gQ3JlYXRlIGxpc3Rcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBQbHVnaW5JdGVtRGVsZWdhdGUoKTtcblx0XHRjb25zdCBncm91cEhlYWRlclJlbmRlcmVyID0gbmV3IEN1c3RvbWl6YXRpb25Hcm91cEhlYWRlclJlbmRlcmVyPElQbHVnaW5Hcm91cEhlYWRlckVudHJ5PigncGx1Z2luR3JvdXBIZWFkZXInLCB0aGlzLmhvdmVyU2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFsbGVkUmVuZGVyZXIgPSBuZXcgUGx1Z2luSW5zdGFsbGVkSXRlbVJlbmRlcmVyKHRoaXMuaGFybmVzc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJlbW90ZVJlbmRlcmVyID0gbmV3IFBsdWdpblJlbW90ZUl0ZW1SZW5kZXJlcigpO1xuXHRcdGNvbnN0IG1hcmtldHBsYWNlUmVuZGVyZXIgPSBuZXcgR2FsbGVyeUl0ZW1SZW5kZXJlcjxJUGx1Z2luTWFya2V0cGxhY2VJdGVtRW50cnk+KFBMVUdJTl9NQVJLRVRQTEFDRV9JVEVNX1RFTVBMQVRFX0lELCBuZXcgUGx1Z2luTWFya2V0cGxhY2VJdGVtUHJvdmlkZXIodGhpcy5wbHVnaW5JbnN0YWxsU2VydmljZSwgdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UpKTtcblxuXHRcdHRoaXMubGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0PElQbHVnaW5MaXN0RW50cnk+LFxuXHRcdFx0J1BsdWdpbk1hbmFnZW1lbnRMaXN0Jyxcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lcixcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0W2dyb3VwSGVhZGVyUmVuZGVyZXIsIGluc3RhbGxlZFJlbmRlcmVyLCByZW1vdGVSZW5kZXJlciwgbWFya2V0cGxhY2VSZW5kZXJlcl0sXG5cdFx0XHR7XG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IElQbHVnaW5MaXN0RW50cnkpIHtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncGx1Z2luR3JvdXBBcmlhTGFiZWwnLCBcInswfSwgezF9IGl0ZW1zLCB7Mn1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5jb3VudCwgZWxlbWVudC5jb2xsYXBzZWQgPyBsb2NhbGl6ZSgnY29sbGFwc2VkJywgXCJjb2xsYXBzZWRcIikgOiBsb2NhbGl6ZSgnZXhwYW5kZWQnLCBcImV4cGFuZGVkXCIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBmb3JtYXREaXNwbGF5TmFtZShlbGVtZW50Lml0ZW0ubmFtZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGVsZW1lbnQuaXRlbS5kZXNjcmlwdGlvbiA/IHRydW5jYXRlVG9GaXJzdExpbmUoZWxlbWVudC5pdGVtLmRlc2NyaXB0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGNvbnN0IG5hbWVBbmREZXNjID0gZGVzY3JpcHRpb25cblx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncGx1Z2luSXRlbUFyaWFMYWJlbCcsIFwiezB9LiB7MX1cIiwgbmFtZSwgZGVzY3JpcHRpb24pXG5cdFx0XHRcdFx0XHRcdDogbmFtZTtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdwbHVnaW4taXRlbScpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZW5hYmxlZCA9IGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbGVtZW50Lml0ZW0ucGx1Z2luLmVuYWJsZW1lbnQuZ2V0KCkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZW5hYmxlZFxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3BsdWdpbkluc3RhbGxlZEl0ZW1BcmlhTGFiZWxFbmFibGVkJywgXCJ7MH0uIEVuYWJsZWRcIiwgbmFtZUFuZERlc2MpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgncGx1Z2luSW5zdGFsbGVkSXRlbUFyaWFMYWJlbERpc2FibGVkJywgXCJ7MH0uIERpc2FibGVkXCIsIG5hbWVBbmREZXNjKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBuYW1lQW5kRGVzYztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncGx1Z2luc0xpc3RBcmlhTGFiZWwnLCBcIlBsdWdpbnNcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkKGVsZW1lbnQ6IElQbHVnaW5MaXN0RW50cnkpIHtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmlkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ21hcmtldHBsYWNlLWl0ZW0nKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgbWFya2V0cGxhY2UtJHtlbGVtZW50Lml0ZW0ubWFya2V0cGxhY2VSZWZlcmVuY2UuY2Fub25pY2FsSWR9LyR7ZWxlbWVudC5pdGVtLnNvdXJjZX1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ3JlbW90ZS1pdGVtJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5pdGVtLml0ZW1LZXkgPz8gYHJlbW90ZS0ke2VsZW1lbnQuaXRlbS5ncm91cEtleSA/PyAnZGVmYXVsdCd9LSR7ZWxlbWVudC5pdGVtLnVyaS50b1N0cmluZygpfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5pdGVtLnBsdWdpbi51cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdFx0XHR0aGlzLnRvZ2dsZUdyb3VwKGUuZWxlbWVudCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50LnR5cGUgPT09ICdwbHVnaW4taXRlbScpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNlbGVjdFBsdWdpbi5maXJlKGUuZWxlbWVudC5pdGVtKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ3JlbW90ZS1pdGVtJykge1xuXHRcdFx0XHRcdC8vIEtlZXAgcm93IGFjdGl2YXRpb24gaW5lcnQgZm9yIHJlbW90ZS1jb25maWd1cmVkIHBsdWdpbnMuIE1hbmFnZW1lbnRcblx0XHRcdFx0XHQvLyBhY3Rpb25zIGFyZSBzdXJmYWNlZCB2aWEgdGhlIGNvbnRleHQgbWVudSBhbmQgdG9vbGJhci5cblx0XHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ21hcmtldHBsYWNlLWl0ZW0nKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RQbHVnaW4uZmlyZShlLmVsZW1lbnQuaXRlbSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgY29udGV4dCBtZW51XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0Lm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSBhcyBJTGlzdENvbnRleHRNZW51RXZlbnQ8SVBsdWdpbkxpc3RFbnRyeT4pKSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gcGx1Z2luIHNlcnZpY2UgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpbnMgPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGZvciAoY29uc3QgcGx1Z2luIG9mIHBsdWdpbnMpIHtcblx0XHRcdFx0cGx1Z2luLmVuYWJsZW1lbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0dm9pZCB0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2Uub25EaWRDaGFuZ2VNYXJrZXRwbGFjZXMoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0dm9pZCB0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiB0aGUgYWN0aXZlIGhhcm5lc3MgY2hhbmdlcyAoc3luYyBjaGVja2JveGVzIG1heSBhcHBlYXIvZGlzYXBwZWFyKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuaGFybmVzc1NlcnZpY2UuYWN0aXZlSGFybmVzcy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnVwZGF0ZVRvb2xiYXJBY3Rpb25zKCk7XG5cdFx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0XHR2b2lkIHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB3aGVuIHRoZSBhY3RpdmUgaGFybmVzcydzIHJlbW90ZSBpdGVtIHByb3ZpZGVyIHJlcG9ydHMgY2hhbmdlc1xuXHRcdGNvbnN0IGl0ZW1Qcm92aWRlckNoYW5nZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGl0ZW1Qcm92aWRlciA9IHRoaXMuaGFybmVzc1NlcnZpY2UuZ2V0QWN0aXZlRGVzY3JpcHRvcigpLml0ZW1Qcm92aWRlcjtcblx0XHRcdGlmIChpdGVtUHJvdmlkZXIpIHtcblx0XHRcdFx0aXRlbVByb3ZpZGVyQ2hhbmdlRGlzcG9zYWJsZS52YWx1ZSA9IGl0ZW1Qcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGl0ZW1Qcm92aWRlckNoYW5nZURpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVRvb2xiYXJBY3Rpb25zKCk7XG5cblx0XHQvLyBJbml0aWFsIHJlZnJlc2hcblx0XHR2b2lkIHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdGF3YWl0IHRoaXMucXVlcnlNYXJrZXRwbGFjZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZpbHRlclBsdWdpbnMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjY2Vzc1N0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWQpO1xuXHRcdGNvbnN0IHZhbHVlID0gaW5zcGVjdC52YWx1ZSA/PyBpbnNwZWN0LmRlZmF1bHRWYWx1ZTtcblx0XHRjb25zdCBkaXNhYmxlZCA9IHZhbHVlID09PSBmYWxzZTtcblx0XHRjb25zdCBwb2xpY3lMb2NrZWQgPSBpbnNwZWN0LnBvbGljeVZhbHVlID09PSBmYWxzZTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdhY2Nlc3MtZGlzYWJsZWQnLCBkaXNhYmxlZCk7XG5cblx0XHRpZiAoZGlzYWJsZWQpIHtcblx0XHRcdHRoaXMuZGlzYWJsZWRJY29uLmNsYXNzTmFtZSA9ICdlbXB0eS1pY29uJztcblx0XHRcdHRoaXMuZGlzYWJsZWRJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkocG9saWN5TG9ja2VkID8gQ29kaWNvbi5zaGllbGQgOiBwbHVnaW5JY29uKSk7XG5cblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5kaXNhYmxlZE1lc3NhZ2UpO1xuXHRcdFx0dGhpcy5kaXNhYmxlZExpbmtMaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0aWYgKHBvbGljeUxvY2tlZCkge1xuXHRcdFx0XHR0aGlzLmRpc2FibGVkTWVzc2FnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwbHVnaW5zRGlzYWJsZWRCeVBvbGljeScsIFwiUGx1Z2luIGludGVncmF0aW9uIGluIGNoYXQgaXMgZGlzYWJsZWQgYnkgeW91ciBvcmdhbml6YXRpb24uIENvbnRhY3QgeW91ciBvcmdhbml6YXRpb24gYWRtaW5pc3RyYXRvciBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmRpc2FibGVkTWVzc2FnZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsb2NhbGl6ZSgncGx1Z2luc0Rpc2FibGVkQnlTZXR0aW5nUHJlZml4JywgXCJQbHVnaW5zIGFyZSBkaXNhYmxlZCBpbiBzZXR0aW5ncy4gXCIpKSk7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSBET00uYXBwZW5kKHRoaXMuZGlzYWJsZWRNZXNzYWdlLCAkKCdhLm1jcC1kaXNhYmxlZC1zZXR0aW5ncy1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdFx0XHRsaW5rLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3BsdWdpbnNEaXNhYmxlZFNldHRpbmdMaW5rJywgXCJDb25maWd1cmUgaW4gc2V0dGluZ3MuXCIpO1xuXHRcdFx0XHRsaW5rLmhyZWYgPSAnIyc7XG5cdFx0XHRcdGxpbmsuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0XHR0aGlzLmRpc2FibGVkTGlua0xpc3RlbmVyLnZhbHVlID0gRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsIGBAaWQ6JHtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5zRW5hYmxlZH1gKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgcGx1Z2luQWN0aW9ucygpOiByZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1BY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuaGFybmVzc1NlcnZpY2UuZ2V0QWN0aXZlRGVzY3JpcHRvcigpLnBsdWdpbkFjdGlvbnMgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIGZvcm1hdEFjdGlvbkxhYmVsKGFjdGlvbjogSUN1c3RvbWl6YXRpb25JdGVtQWN0aW9uLCBpY29uT25seSA9IGZhbHNlKTogc3RyaW5nIHtcblx0XHRpZiAoIWFjdGlvbi5pY29uKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9uLmxhYmVsO1xuXHRcdH1cblxuXHRcdHJldHVybiBpY29uT25seVxuXHRcdFx0PyBgJCgke2FjdGlvbi5pY29uLmlkfSlgXG5cdFx0XHQ6IGAkKCR7YWN0aW9uLmljb24uaWR9KSAke2FjdGlvbi5sYWJlbH1gO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUb29sYmFyQWN0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBicm93c2VNYXJrZXRwbGFjZUF2YWlsYWJsZSA9IHRoaXMuaXNCcm93c2VNYXJrZXRwbGFjZUF2YWlsYWJsZSgpO1xuXHRcdGlmICghYnJvd3NlTWFya2V0cGxhY2VBdmFpbGFibGUgJiYgdGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUJyb3dzZU1vZGUoZmFsc2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuYnJvd3NlQnV0dG9uLmVsZW1lbnQucGFyZW50RWxlbWVudCEuc3R5bGUuZGlzcGxheSA9IHRoaXMuYnJvd3NlTW9kZSA/ICdub25lJyA6ICcnO1xuXHRcdHRoaXMuYnJvd3NlQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmxpYnJhcnkuaWR9KSAke2xvY2FsaXplKCdicm93c2VNYXJrZXRwbGFjZScsIFwiQnJvd3NlIE1hcmtldHBsYWNlXCIpfWA7XG5cdFx0dGhpcy5icm93c2VCdXR0b24uZW5hYmxlZCA9IGJyb3dzZU1hcmtldHBsYWNlQXZhaWxhYmxlO1xuXHRcdGNvbnN0IGJyb3dzZVRpdGxlID0gYnJvd3NlTWFya2V0cGxhY2VBdmFpbGFibGVcblx0XHRcdD8gbG9jYWxpemUoJ2Jyb3dzZU1hcmtldHBsYWNlJywgXCJCcm93c2UgTWFya2V0cGxhY2VcIilcblx0XHRcdDogbG9jYWxpemUoJ2Jyb3dzZU1hcmtldHBsYWNlVW5zdXBwb3J0ZWRXZWInLCBcIkJyb3dzZSBNYXJrZXRwbGFjZSBpcyBub3QgYXZhaWxhYmxlIGluIFZTIENvZGUgZm9yIHRoZSBXZWIuXCIpO1xuXHRcdHRoaXMuYnJvd3NlQnV0dG9uLnNldFRpdGxlKGJyb3dzZVRpdGxlKTtcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGJyb3dzZVRpdGxlKTtcblxuXHRcdHRoaXMudXBkYXRlQWRkQnV0dG9uKCk7XG5cdFx0dGhpcy5jcmVhdGVQbHVnaW5CdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGlzQnJvd3NlTWFya2V0cGxhY2VBdmFpbGFibGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFpc1dlYjtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWRkQnV0dG9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmJ1aWxkQWRkQWN0aW9ucygpO1xuXHRcdGNvbnN0IFtwcmltYXJ5LCAuLi5kcm9wZG93bl0gPSBhY3Rpb25zO1xuXHRcdGNvbnN0IGhhc0Ryb3Bkb3duID0gZHJvcGRvd24ubGVuZ3RoID4gMDtcblxuXHRcdHRoaXMuYWRkQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IGhhc0Ryb3Bkb3duID8gJycgOiAnbm9uZSc7XG5cdFx0dGhpcy5hZGRCdXR0b25TaW1wbGUuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gaGFzRHJvcGRvd24gPyAnbm9uZScgOiAnJztcblxuXHRcdGlmICghcHJpbWFyeSkge1xuXHRcdFx0dGhpcy5hZGRCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5hZGRCdXR0b25TaW1wbGUuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChoYXNEcm9wZG93bikge1xuXHRcdFx0dGhpcy5hZGRCdXR0b24ubGFiZWwgPSB0aGlzLmZvcm1hdEFjdGlvbkxhYmVsKHByaW1hcnkpO1xuXHRcdFx0dGhpcy5hZGRCdXR0b24uZW5hYmxlZCA9IHByaW1hcnkuZW5hYmxlZCAhPT0gZmFsc2U7XG5cdFx0XHRjb25zdCBhZGRQcmltYXJ5VGl0bGUgPSBwcmltYXJ5LnRvb2x0aXAgPz8gcHJpbWFyeS5sYWJlbDtcblx0XHRcdHRoaXMuYWRkQnV0dG9uLnByaW1hcnlCdXR0b24uc2V0VGl0bGUoYWRkUHJpbWFyeVRpdGxlKTtcblx0XHRcdHRoaXMuYWRkQnV0dG9uLnByaW1hcnlCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhZGRQcmltYXJ5VGl0bGUpO1xuXHRcdFx0Y29uc3QgbW9yZUxhYmVsID0gbG9jYWxpemUoJ21vcmVQbHVnaW5BZGRBY3Rpb25zJywgXCJNb3JlIFBsdWdpbiBBZGQgQWN0aW9ucy4uLlwiKTtcblx0XHRcdHRoaXMuYWRkQnV0dG9uLmRyb3Bkb3duQnV0dG9uLnNldFRpdGxlKG1vcmVMYWJlbCk7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvbi5kcm9wZG93bkJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG1vcmVMYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmxhYmVsID0gdGhpcy5mb3JtYXRBY3Rpb25MYWJlbChwcmltYXJ5KTtcblx0XHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmVuYWJsZWQgPSBwcmltYXJ5LmVuYWJsZWQgIT09IGZhbHNlO1xuXHRcdFx0Y29uc3QgYWRkU2ltcGxlVGl0bGUgPSBwcmltYXJ5LnRvb2x0aXAgPz8gcHJpbWFyeS5sYWJlbDtcblx0XHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLnNldFRpdGxlKGFkZFNpbXBsZVRpdGxlKTtcblx0XHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYWRkU2ltcGxlVGl0bGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYnVpbGRBZGRBY3Rpb25zKCk6IHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbUFjdGlvbltdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0Li4udGhpcy5wbHVnaW5BY3Rpb25zLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3BsdWdpbi5pbnN0YWxsRnJvbVNvdXJjZScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbEZyb21Tb3VyY2UnLCBcIkluc3RhbGwgUGx1Z2luIGZyb20gU291cmNlXCIpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnaW5zdGFsbEZyb21Tb3VyY2UnLCBcIkluc3RhbGwgUGx1Z2luIGZyb20gU291cmNlXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmFkZCxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxib29sZWFuPignd29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc3RhbGxQbHVnaW5Gcm9tU291cmNlJywgeyBza2lwUmV2ZWFsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdC8vIFJldHVybiB0byB0aGUgaW5zdGFsbGVkIGxpc3Qgc28gdGhlIG5ld2x5IGluc3RhbGxlZCBwbHVnaW4gaXNcblx0XHRcdFx0XHQvLyB2aXNpYmxlIFx1MjAxNCBzb3VyY2UtaW5zdGFsbGVkIHBsdWdpbnMgbWF5IG5vdCBhcHBlYXIgaW4gdGhlIG1hcmtldHBsYWNlLlxuXHRcdFx0XHRcdGlmIChpbnN0YWxsZWQgJiYgdGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmV4aXRCcm93c2VNb2RlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBZGREcm9wZG93bkFjdGlvbnMoKTogQWN0aW9uW10ge1xuXHRcdHRoaXMuYWRkRHJvcGRvd25BY3Rpb25zLmNsZWFyKCk7XG5cdFx0cmV0dXJuIHRoaXMuYnVpbGRBZGRBY3Rpb25zKCkuc2xpY2UoMSkubWFwKChhY3Rpb24sIGluZGV4KSA9PiB0aGlzLmFkZERyb3Bkb3duQWN0aW9ucy5hZGQobmV3IEFjdGlvbihgcGx1Z2luX2FkZF8ke2luZGV4fWAsIHRoaXMuZm9ybWF0QWN0aW9uTGFiZWwoYWN0aW9uKSwgdW5kZWZpbmVkLCBhY3Rpb24uZW5hYmxlZCAhPT0gZmFsc2UsICgpID0+IHRoaXMucnVuUGx1Z2luQWN0aW9uKGFjdGlvbikpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1blByaW1hcnlCdXR0b25BY3Rpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmlzQnJvd3NlTWFya2V0cGxhY2VBdmFpbGFibGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudG9nZ2xlQnJvd3NlTW9kZSghdGhpcy5icm93c2VNb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcnVuUHJpbWFyeUFkZEFjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbcHJpbWFyeV0gPSB0aGlzLmJ1aWxkQWRkQWN0aW9ucygpO1xuXHRcdGlmIChwcmltYXJ5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJ1blBsdWdpbkFjdGlvbihwcmltYXJ5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1bkNyZWF0ZVBsdWdpbkFjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY3JlYXRlUGx1Z2luJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJ1blBsdWdpbkFjdGlvbihhY3Rpb246IElDdXN0b21pemF0aW9uSXRlbUFjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhY3Rpb24uZW5hYmxlZCAhPT0gZmFsc2UpIHtcblx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvd0Jyb3dzZU1hcmtldHBsYWNlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc0Jyb3dzZU1hcmtldHBsYWNlQXZhaWxhYmxlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdHRoaXMudG9nZ2xlQnJvd3NlTW9kZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUJyb3dzZU1vZGUoYnJvd3NlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5icm93c2VNb2RlID0gYnJvd3NlO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQudmFsdWUgPSAnJztcblx0XHR0aGlzLnNlYXJjaFF1ZXJ5ID0gJyc7XG5cblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5lbGVtZW50LnBhcmVudEVsZW1lbnQhLnN0eWxlLmRpc3BsYXkgPSBicm93c2UgPyAnbm9uZScgOiAnJztcblx0XHR0aGlzLmJhY2tCdXR0b24uZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gYnJvd3NlID8gJycgOiAnbm9uZSc7XG5cblx0XHR0aGlzLnNlYXJjaElucHV0LnNldFBsYWNlSG9sZGVyKGJyb3dzZVxuXHRcdFx0PyBsb2NhbGl6ZSgnc2VhcmNoTWFya2V0cGxhY2VQbGFjZWhvbGRlcicsIFwiU2VhcmNoIHBsdWdpbiBtYXJrZXRwbGFjZS4uLlwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnc2VhcmNoUGx1Z2luc1BsYWNlaG9sZGVyJywgXCJUeXBlIHRvIHNlYXJjaC4uLlwiKVxuXHRcdCk7XG5cblx0XHRpZiAoYnJvd3NlKSB7XG5cdFx0XHR2b2lkIHRoaXMucXVlcnlNYXJrZXRwbGFjZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1hcmtldHBsYWNlQ3RzPy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0dGhpcy5tYXJrZXRwbGFjZUl0ZW1zID0gW107XG5cdFx0XHR2b2lkIHRoaXMuZmlsdGVyUGx1Z2lucygpO1xuXHRcdH1cblxuXHRcdC8vIFJlLWxheW91dCB0byBhY2NvdW50IGZvciB0aGUgYmFjayBsaW5rIGhlaWdodCBjaGFuZ2Vcblx0XHRpZiAodGhpcy5sYXN0SGVpZ2h0ID4gMCkge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5sYXN0SGVpZ2h0LCB0aGlzLmxhc3RXaWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeU1hcmtldHBsYWNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubWFya2V0cGxhY2VDdHM/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5tYXJrZXRwbGFjZUN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Ly8gU2hvdyBsb2FkaW5nIHN0YXRlXG5cdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuZW1wdHlUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2xvYWRpbmdNYXJrZXRwbGFjZScsIFwiTG9hZGluZyBtYXJrZXRwbGFjZS4uLlwiKTtcblx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5mZXRjaE1hcmtldHBsYWNlUGx1Z2lucyhjdHMudG9rZW4pO1xuXG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFF1ZXJ5LnRvTG93ZXJDYXNlKCkudHJpbSgpO1xuXHRcdFx0Y29uc3QgZmlsdGVyZWQgPSBxdWVyeVxuXHRcdFx0XHQ/IHBsdWdpbnMuZmlsdGVyKHAgPT4gcC5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpIHx8IHAuZGVzY3JpcHRpb24udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkpXG5cdFx0XHRcdDogcGx1Z2lucztcblxuXHRcdFx0Ly8gRmlsdGVyIG91dCBhbHJlYWR5LWluc3RhbGxlZCBwbHVnaW5zXG5cdFx0XHRjb25zdCBpbnN0YWxsZWRVcmlzID0gbmV3IFNldCh0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpLm1hcChwID0+IHAudXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdHRoaXMubWFya2V0cGxhY2VJdGVtcyA9IGZpbHRlcmVkXG5cdFx0XHRcdC5maWx0ZXIocCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRVcmkgPSB0aGlzLnBsdWdpbkluc3RhbGxTZXJ2aWNlLmdldFBsdWdpbkluc3RhbGxVcmkocCk7XG5cdFx0XHRcdFx0cmV0dXJuICFpbnN0YWxsZWRVcmlzLmhhcyhleHBlY3RlZFVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0Lm1hcChtYXJrZXRwbGFjZVBsdWdpblRvSXRlbSk7XG5cblx0XHRcdHRoaXMudXBkYXRlTWFya2V0cGxhY2VMaXN0KCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLm1hcmtldHBsYWNlSXRlbXMgPSBbXTtcblx0XHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWFya2V0cGxhY2VFcnJvcicsIFwiVW5hYmxlIHRvIGxvYWQgbWFya2V0cGxhY2VcIik7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RyeUFnYWluTGF0ZXInLCBcIkNoZWNrIHlvdXIgY29ubmVjdGlvbiBhbmQgdHJ5IGFnYWluXCIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWFya2V0cGxhY2VMaXN0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1hcmtldHBsYWNlSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGlmICh0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKSkge1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub01hcmtldHBsYWNlUmVzdWx0cycsIFwiTm8gcGx1Z2lucyBtYXRjaCAnezB9J1wiLCB0aGlzLnNlYXJjaFF1ZXJ5KTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndHJ5RGlmZmVyZW50U2VhcmNoJywgXCJUcnkgYSBkaWZmZXJlbnQgc2VhcmNoIHRlcm1cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdlbXB0eU1hcmtldHBsYWNlJywgXCJObyBwbHVnaW5zIGF2YWlsYWJsZVwiKTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBJUGx1Z2luTGlzdEVudHJ5W10gPSB0aGlzLm1hcmtldHBsYWNlSXRlbXMubWFwKGl0ZW0gPT4gKHsgdHlwZTogJ21hcmtldHBsYWNlLWl0ZW0nIGFzIGNvbnN0LCBpdGVtIH0pKTtcblx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIGVudHJpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZW1vdGVQbHVnaW5JdGVtcyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdGlmICghdGhpcy5oYXJuZXNzU2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCkuaXRlbVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkID0gYXdhaXQgdGhpcy5pdGVtc01vZGVsLmdldEFjdGl2ZUl0ZW1Tb3VyY2UoKS5mZXRjaFByb3ZpZGVySXRlbXMoKTtcblx0XHRcdHJldHVybiBwcm92aWRlZC5maWx0ZXIoaXRlbSA9PlxuXHRcdFx0XHRpc1BsdWdpbkN1c3RvbWl6YXRpb25JdGVtKGl0ZW0pXG5cdFx0XHRcdCYmICghcXVlcnlcblx0XHRcdFx0XHR8fCBpdGVtLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcblx0XHRcdFx0XHR8fCBpdGVtLmRlc2NyaXB0aW9uPy50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5KVxuXHRcdFx0XHRcdHx8IGl0ZW0uYmFkZ2U/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpKVxuXHRcdFx0KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlbW90ZUdyb3VwTWV0YWRhdGEoZ3JvdXBLZXk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgZ3JvdXA6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z3JvdXA6IGdyb3VwS2V5ID8/ICdyZW1vdGUtaG9zdCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlbW90ZUhvc3RHcm91cCcsIFwiUmVtb3RlXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGVIb3N0R3JvdXBEZXNjcmlwdGlvbicsIFwiUGx1Z2lucyBjb25maWd1cmVkIGRpcmVjdGx5IG9uIHRoZSByZW1vdGUgYWdlbnQgaG9zdCBhbmQgYXZhaWxhYmxlIHdpdGhvdXQgbG9jYWwgc3luYy5cIiksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kR3JvdXAoZW50cmllczogSVBsdWdpbkxpc3RFbnRyeVtdLCBoZWFkZXI6IHsgZ3JvdXA6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9LCBpdGVtczogcmVhZG9ubHkgSVBsdWdpbkxpc3RFbnRyeVtdLCBpc0ZpcnN0OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGlzRmlyc3Q7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5jb2xsYXBzZWRHcm91cHMuaGFzKGhlYWRlci5ncm91cCk7XG5cdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdHR5cGU6ICdncm91cC1oZWFkZXInLFxuXHRcdFx0aWQ6IGBwbHVnaW4tZ3JvdXAtJHtoZWFkZXIuZ3JvdXB9YCxcblx0XHRcdGdyb3VwOiBoZWFkZXIuZ3JvdXAsXG5cdFx0XHRsYWJlbDogaGVhZGVyLmxhYmVsLFxuXHRcdFx0aWNvbjogcGx1Z2luSWNvbixcblx0XHRcdGNvdW50OiBpdGVtcy5sZW5ndGgsXG5cdFx0XHRpc0ZpcnN0LFxuXHRcdFx0ZGVzY3JpcHRpb246IGhlYWRlci5kZXNjcmlwdGlvbixcblx0XHRcdGNvbGxhcHNlZCxcblx0XHR9KTtcblx0XHRpZiAoIWNvbGxhcHNlZCkge1xuXHRcdFx0ZW50cmllcy5wdXNoKC4uLml0ZW1zKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmaWx0ZXJQbHVnaW5zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hRdWVyeS50b0xvd2VyQ2FzZSgpLnRyaW0oKTtcblx0XHRjb25zdCBhbGxQbHVnaW5zID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5nZXQoKTtcblx0XHR0aGlzLnJlbW90ZUl0ZW1zID0gWy4uLmF3YWl0IHRoaXMuZ2V0UmVtb3RlUGx1Z2luSXRlbXMocXVlcnkpXTtcblxuXHRcdHRoaXMuaW5zdGFsbGVkSXRlbXMgPSBhbGxQbHVnaW5zXG5cdFx0XHQubWFwKHAgPT4gaW5zdGFsbGVkUGx1Z2luVG9JdGVtKHAsIHRoaXMubGFiZWxTZXJ2aWNlKSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiAhcXVlcnkgfHxcblx0XHRcdFx0aXRlbS5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMocXVlcnkpIHx8XG5cdFx0XHRcdGl0ZW0uZGVzY3JpcHRpb24udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSlcblx0XHRcdCk7XG5cblx0XHRpZiAodGhpcy5yZW1vdGVJdGVtcy5sZW5ndGggPT09IDAgJiYgdGhpcy5pbnN0YWxsZWRJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZW1wdHlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hRdWVyeS50cmltKCkpIHtcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9NYXRjaGluZ1BsdWdpbnMnLCBcIk5vIHBsdWdpbnMgbWF0Y2ggJ3swfSdcIiwgdGhpcy5zZWFyY2hRdWVyeSk7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3RyeURpZmZlcmVudFNlYXJjaCcsIFwiVHJ5IGEgZGlmZmVyZW50IHNlYXJjaCB0ZXJtXCIpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmhhcm5lc3NTZXJ2aWNlLmdldEFjdGl2ZURlc2NyaXB0b3IoKS5pdGVtUHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9SZW1vdGVQbHVnaW5zJywgXCJObyBwbHVnaW5zIGNvbmZpZ3VyZWRcIik7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FkZFJlbW90ZVBsdWdpbnMnLCBcIlVzZSB0aGUgdG9vbGJhciB0byBhZGQgcmVtb3RlIHBsdWdpbnMgb3IgaW5zdGFsbCBwbHVnaW5zIGZyb20gYSBzb3VyY2UuXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9QbHVnaW5zJywgXCJObyBwbHVnaW5zIGluc3RhbGxlZFwiKTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYnJvd3NlVG9BZGQnLCBcIkJyb3dzZSB0aGUgbWFya2V0cGxhY2UgdG8gZGlzY292ZXIgYW5kIGluc3RhbGwgcGx1Z2luc1wiKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cblx0XHQvLyBHcm91cCBwbHVnaW5zOiBlbmFibGVkIHZzIGRpc2FibGVkXG5cdFx0Y29uc3QgZW5hYmxlZFBsdWdpbnMgPSB0aGlzLmluc3RhbGxlZEl0ZW1zLmZpbHRlcihpdGVtID0+IGlzQ29udHJpYnV0aW9uRW5hYmxlZChpdGVtLnBsdWdpbi5lbmFibGVtZW50LmdldCgpKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRQbHVnaW5zID0gdGhpcy5pbnN0YWxsZWRJdGVtcy5maWx0ZXIoaXRlbSA9PiAhaXNDb250cmlidXRpb25FbmFibGVkKGl0ZW0ucGx1Z2luLmVuYWJsZW1lbnQuZ2V0KCkpKTtcblxuXHRcdGNvbnN0IGVudHJpZXM6IElQbHVnaW5MaXN0RW50cnlbXSA9IFtdO1xuXHRcdGxldCBpc0ZpcnN0ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZE5hbWVzID0gbmV3IFNldCh0aGlzLmluc3RhbGxlZEl0ZW1zLm1hcChpdGVtID0+IGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0Y29uc3QgcmVtb3RlR3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIElQbHVnaW5SZW1vdGVJdGVtRW50cnlbXT4oKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5yZW1vdGVJdGVtcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gaXRlbS5ncm91cEtleSA/PyAncmVtb3RlLWhvc3QnO1xuXHRcdFx0aWYgKGtleSA9PT0gJ3JlbW90ZS1jbGllbnQnKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBjbGllbnQtc3luY2VkIGl0ZW1zIGFyZSBhbHJlYWR5IHNob3duIGluIFwiRW5hYmxlZCBMb2NhbGx5XCJcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtLm5hbWUgJiYgaW5zdGFsbGVkTmFtZXMuaGFzKGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gcGx1Z2luIGlzIGFsc28gbG9jYWxseSBpbnN0YWxsZWQ7IHNob3cgaXQgb25jZSBpbiBcIkVuYWJsZWQgTG9jYWxseVwiXG5cdFx0XHR9XG5cdFx0XHRsZXQgZ3JvdXAgPSByZW1vdGVHcm91cHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwID0gW107XG5cdFx0XHRcdHJlbW90ZUdyb3Vwcy5zZXQoa2V5LCBncm91cCk7XG5cdFx0XHR9XG5cdFx0XHRncm91cC5wdXNoKHsgdHlwZTogJ3JlbW90ZS1pdGVtJywgaXRlbSB9KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXBLZXksIGl0ZW1zXSBvZiByZW1vdGVHcm91cHMpIHtcblx0XHRcdGlzRmlyc3QgPSB0aGlzLmFwcGVuZEdyb3VwKGVudHJpZXMsIHRoaXMuZ2V0UmVtb3RlR3JvdXBNZXRhZGF0YShncm91cEtleSksIGl0ZW1zLCBpc0ZpcnN0KTtcblx0XHR9XG5cblx0XHRpZiAoZW5hYmxlZFBsdWdpbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aXNGaXJzdCA9IHRoaXMuYXBwZW5kR3JvdXAoXG5cdFx0XHRcdGVudHJpZXMsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRncm91cDogJ2VuYWJsZWQnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZW5hYmxlZEdyb3VwJywgXCJFbmFibGVkIExvY2FsbHlcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlbmFibGVkR3JvdXBEZXNjcmlwdGlvbicsIFwiUGx1Z2lucyBpbnN0YWxsZWQgaW4gdGhpcyBjbGllbnQgYW5kIGF2YWlsYWJsZSBmb3Igc3luY2luZyB0byB0aGUgcmVtb3RlIHNlc3Npb24uXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbmFibGVkUGx1Z2lucy5tYXAoaXRlbSA9PiAoeyB0eXBlOiAncGx1Z2luLWl0ZW0nIGFzIGNvbnN0LCBpdGVtIH0pKSxcblx0XHRcdFx0aXNGaXJzdCxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRpc2FibGVkUGx1Z2lucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmFwcGVuZEdyb3VwKFxuXHRcdFx0XHRlbnRyaWVzLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Z3JvdXA6ICdkaXNhYmxlZCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaXNhYmxlZEdyb3VwJywgXCJEaXNhYmxlZCBMb2NhbGx5XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlzYWJsZWRHcm91cERlc2NyaXB0aW9uJywgXCJQbHVnaW5zIGluc3RhbGxlZCBpbiB0aGlzIGNsaWVudCBidXQgY3VycmVudGx5IGRpc2FibGVkLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGlzYWJsZWRQbHVnaW5zLm1hcChpdGVtID0+ICh7IHR5cGU6ICdwbHVnaW4taXRlbScgYXMgY29uc3QsIGl0ZW0gfSkpLFxuXHRcdFx0XHRpc0ZpcnN0LFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3BsYXlFbnRyaWVzID0gZW50cmllcztcblx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIHRoaXMuZGlzcGxheUVudHJpZXMpO1xuXG5cdFx0Ly8gQ29tcHV0ZSBzaWRlYmFyIGJhZGdlIGRpcmVjdGx5IGZyb20gdGhlIGRhdGEgYXJyYXkgKHNhbWUgc291cmNlIGFzIGdyb3VwIGhlYWRlcnMpXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZmlyZSh0aGlzLml0ZW1Db3VudCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgdG90YWwgaXRlbSBjb3VudCBmcm9tIHRoZSB1bmRlcmx5aW5nIGRhdGEgYXJyYXlcblx0ICogKHRoZSBzYW1lIHNvdXJjZSB1c2VkIHRvIGJ1aWxkIGdyb3VwIGhlYWRlcnMpLlxuXHQgKi9cblx0Z2V0IGl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGluc3RhbGxlZE5hbWVzID0gbmV3IFNldCh0aGlzLmluc3RhbGxlZEl0ZW1zLm1hcChpdGVtID0+IGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0Y29uc3QgdW5pcXVlUmVtb3RlID0gdGhpcy5yZW1vdGVJdGVtcy5maWx0ZXIoaXRlbSA9PiB7XG5cdFx0XHRpZiAoaXRlbS5ncm91cEtleSA9PT0gJ3JlbW90ZS1jbGllbnQnKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChpdGVtLm5hbWUgJiYgaW5zdGFsbGVkTmFtZXMuaGFzKGl0ZW0ubmFtZS50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdW5pcXVlUmVtb3RlLmxlbmd0aCArIHRoaXMuaW5zdGFsbGVkSXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWZpcmVzIHRoZSBjdXJyZW50IGl0ZW0gY291bnQuIENhbGwgYWZ0ZXIgc3Vic2NyaWJpbmcgdG8gb25EaWRDaGFuZ2VJdGVtQ291bnRcblx0ICogdG8gZW5zdXJlIHRoZSBzdWJzY3JpYmVyIHJlY2VpdmVzIHRoZSBsYXRlc3QgY291bnQuXG5cdCAqL1xuXHRmaXJlSXRlbUNvdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmZpcmUodGhpcy5pdGVtQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVHcm91cChlbnRyeTogSVBsdWdpbkdyb3VwSGVhZGVyRW50cnkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb2xsYXBzZWRHcm91cHMuaGFzKGVudHJ5Lmdyb3VwKSkge1xuXHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuZGVsZXRlKGVudHJ5Lmdyb3VwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb2xsYXBzZWRHcm91cHMuYWRkKGVudHJ5Lmdyb3VwKTtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLmZpbHRlclBsdWdpbnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB3aWRnZXQgaXMgY3VycmVudGx5IGluIG1hcmtldHBsYWNlIGJyb3dzZSBtb2RlLlxuXHQgKi9cblx0aXNJbkJyb3dzZU1vZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYnJvd3NlTW9kZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeGl0cyBtYXJrZXRwbGFjZSBicm93c2UgbW9kZSBhbmQgcmV0dXJucyB0byB0aGUgaW5zdGFsbGVkIHBsdWdpbnMgbGlzdC5cblx0ICovXG5cdGV4aXRCcm93c2VNb2RlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdHRoaXMudG9nZ2xlQnJvd3NlTW9kZShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMubGFzdFdpZHRoID0gd2lkdGg7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRcdC8vIE1lYXN1cmUgc2libGluZyBlbGVtZW50cyB0byBjYWxjdWxhdGUgdGhlIGxpc3QgaGVpZ2h0LlxuXHRcdC8vIFdoZW4gb2Zmc2V0SGVpZ2h0IHJldHVybnMgMCB0aGUgY29udGFpbmVyIG1heSBoYXZlIGp1c3QgYmVjb21lIHZpc2libGVcblx0XHQvLyBhZnRlciBkaXNwbGF5Om5vbmUgYW5kIHRoZSBicm93c2VyIGhhc24ndCByZWZsb3dlZCB5ZXQgXHUyMDE0IGRlZmVyIGxheW91dFxuXHRcdC8vIG9uY2Ugc28gbWVhc3VyZW1lbnRzIGFyZSBhY2N1cmF0ZS4gT25seSByZXRyeSBvbmNlIHRvIGF2b2lkIGFuIGVuZGxlc3Ncblx0XHQvLyBsb29wIHdoZW4gdGhlIHdpZGdldCBpcyBjcmVhdGVkIHdoaWxlIHBlcm1hbmVudGx5IGhpZGRlbi5cblx0XHRjb25zdCBzZWFyY2hCYXJIZWlnaHQgPSB0aGlzLnNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0aWYgKHNlYXJjaEJhckhlaWdodCA9PT0gMCAmJiAhdGhpcy5fbGF5b3V0RGVmZXJyZWQpIHtcblx0XHRcdHRoaXMuX2xheW91dERlZmVycmVkID0gdHJ1ZTtcblx0XHRcdERPTS5nZXRXaW5kb3codGhpcy5lbGVtZW50KS5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMubGFzdEhlaWdodCwgdGhpcy5sYXN0V2lkdGgpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX2xheW91dERlZmVycmVkID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSB0aGlzLnNlY3Rpb25UaXRsZUhlYWRlci5vZmZzZXRIZWlnaHQ7XG5cdFx0dGhpcy5sYXN0SGVhZGVySGVpZ2h0ID0gaGVhZGVySGVpZ2h0O1xuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSBNYXRoLm1heCgwLCBoZWlnaHQgLSBzZWFyY2hCYXJIZWlnaHQgLSBoZWFkZXJIZWlnaHQpO1xuXG5cdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2xpc3RIZWlnaHR9cHhgO1xuXHRcdHRoaXMubGlzdC5sYXlvdXQobGlzdEhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0Zm9jdXNTZWFyY2goKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5mb2N1cygpO1xuXHR9XG5cblx0cmV2ZWFsTGFzdEl0ZW0oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGlzdC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxpc3QucmV2ZWFsKHRoaXMubGlzdC5sZW5ndGggLSAxKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmxpc3QuZG9tRm9jdXMoKTtcblx0XHRpZiAodGhpcy5saXN0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SVBsdWdpbkxpc3RFbnRyeT4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCB8fCBlLmVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicgfHwgZS5lbGVtZW50LnR5cGUgPT09ICdtYXJrZXRwbGFjZS1pdGVtJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gZS5lbGVtZW50O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0aWYgKGVudHJ5LnR5cGUgPT09ICdwbHVnaW4taXRlbScpIHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdldEluc3RhbGxlZFBsdWdpbkNvbnRleHRNZW51QWN0aW9ucyhlbnRyeS5pdGVtLnBsdWdpbiwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb25zIG9mIGdyb3Vwcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb24gb2YgbWVudUFjdGlvbnMpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobWVudUFjdGlvbik7XG5cdFx0XHRcdFx0aWYgKGlzRGlzcG9zYWJsZShtZW51QWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1lbnVBY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCA+IDAgJiYgYWN0aW9uc1thY3Rpb25zLmxlbmd0aCAtIDFdIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdGFjdGlvbnMucG9wKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGl0ZW1BY3Rpb25zID0gZW50cnkuaXRlbS5hY3Rpb25zID8/IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtQWN0aW9uIG9mIGl0ZW1BY3Rpb25zKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdGl0ZW1BY3Rpb24uaWQsXG5cdFx0XHRcdFx0aXRlbUFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRpdGVtQWN0aW9uLmljb24gPyBUaGVtZUljb24uYXNDbGFzc05hbWUoaXRlbUFjdGlvbi5pY29uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpdGVtQWN0aW9uLmVuYWJsZWQgIT09IGZhbHNlLFxuXHRcdFx0XHRcdCgpID0+IGl0ZW1BY3Rpb24ucnVuKCksXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBRTlCLFNB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
