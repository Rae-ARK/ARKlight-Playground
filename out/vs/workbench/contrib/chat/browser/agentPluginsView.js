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
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, disposeIfDisposable, isDisposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { autorun, derived } from "../../../../base/common/observable.js";
import { PagedModel } from "../../../../base/common/paging.js";
import { dirname } from "../../../../base/common/resources.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchPagedList } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { getLocationBasedViewColors } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService, Extensions as ViewExtensions } from "../../../common/views.js";
import { getWorkbenchMenuMotionContextMenuOptions } from "../../../browser/actions/menuMotion.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { VIEW_CONTAINER } from "../../extensions/browser/extensions.contribution.js";
import { manageExtensionIcon } from "../../extensions/browser/extensionsIcons.js";
import { AbstractExtensionsListView } from "../../extensions/browser/extensionsViews.js";
import { DefaultViewsContext, extensionsFilterSubMenu, IExtensionsWorkbenchService, SearchAgentPluginsContext } from "../../extensions/common/extensions.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { IAgentPluginService } from "../common/plugins/agentPluginService.js";
import { isContributionEnabled } from "../common/enablement.js";
import { IPluginInstallService } from "../common/plugins/pluginInstallService.js";
import { hasSourceChanged, IPluginMarketplaceService } from "../common/plugins/pluginMarketplaceService.js";
import { AgentPluginEditorInput } from "./agentPluginEditor/agentPluginEditorInput.js";
import { AgentPluginItemKind } from "./agentPluginEditor/agentPluginItems.js";
import { getInstalledPluginContextMenuActions, InstallPluginAction, OpenPluginReadmeAction } from "./agentPluginActions.js";
import { InstalledAgentPluginsViewId, HasInstalledAgentPluginsContext } from "./chat.js";
function installedPluginToItem(plugin, labelService, outdated) {
  const name = plugin.label;
  const description = plugin.fromMarketplace?.description ?? labelService.getUriLabel(dirname(plugin.uri), { relative: true });
  const marketplace = plugin.fromMarketplace?.marketplace;
  return { kind: AgentPluginItemKind.Installed, name, description, marketplace, plugin, outdated };
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
let UpdatePluginAction = class extends Action {
  constructor(plugin, liveMarketplacePlugin, pluginInstallService, pluginMarketplaceService) {
    super(UpdatePluginAction.ID, localize("update", "Update"), "extension-action label prominent install");
    this.plugin = plugin;
    this.liveMarketplacePlugin = liveMarketplacePlugin;
    this.pluginInstallService = pluginInstallService;
    this.pluginMarketplaceService = pluginMarketplaceService;
  }
  async run() {
    if (await this.pluginInstallService.updatePlugin(this.liveMarketplacePlugin)) {
      this.pluginMarketplaceService.addInstalledPlugin(this.plugin.uri, this.liveMarketplacePlugin);
    }
  }
};
UpdatePluginAction.ID = "agentPlugin.update";
UpdatePluginAction = __decorateClass([
  __decorateParam(2, IPluginInstallService),
  __decorateParam(3, IPluginMarketplaceService)
], UpdatePluginAction);
let ManagePluginAction = class extends Action {
  constructor(getActionGroups, instantiationService) {
    super(ManagePluginAction.ID, "", ManagePluginAction.CLASS, true);
    this.getActionGroups = getActionGroups;
    this.instantiationService = instantiationService;
    this._actionViewItem = null;
    this.tooltip = localize("manage", "Manage");
  }
  createActionViewItem(options) {
    this._actionViewItem = this.instantiationService.createInstance(DropDownActionViewItem, this, options);
    return this._actionViewItem;
  }
  async run() {
    this._actionViewItem?.showMenu(this.getActionGroups());
  }
};
ManagePluginAction.ID = "agentPlugin.manage";
ManagePluginAction.CLASS = `extension-action icon manage ${ThemeIcon.asClassName(manageExtensionIcon)}`;
ManagePluginAction = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ManagePluginAction);
let DropDownActionViewItem = class extends ActionViewItem {
  constructor(action, options, contextMenuService) {
    super(null, action, { ...options, icon: true, label: false });
    this.contextMenuService = contextMenuService;
  }
  showMenu(actionGroups) {
    if (!this.element) {
      return;
    }
    const actions = actionGroups.flatMap((group) => [...group, new Separator()]);
    if (actions.length > 0) {
      actions.pop();
    }
    this.contextMenuService.showContextMenu({
      ...getWorkbenchMenuMotionContextMenuOptions(this.element),
      getActions: () => actions,
      onHide: () => disposeIfDisposable(actions)
    });
  }
};
DropDownActionViewItem = __decorateClass([
  __decorateParam(2, IContextMenuService)
], DropDownActionViewItem);
let AgentPluginRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = AgentPluginRenderer.templateId;
  }
  renderTemplate(root) {
    const element = dom.append(root, dom.$(".agent-plugin-item.extension-list-item"));
    const details = dom.append(element, dom.$(".details"));
    const headerContainer = dom.append(details, dom.$(".header-container"));
    const header = dom.append(headerContainer, dom.$(".header"));
    const name = dom.append(header, dom.$("span.name"));
    const description = dom.append(details, dom.$(".description.ellipsis"));
    const footer = dom.append(details, dom.$(".footer"));
    const detailContainer = dom.append(footer, dom.$(".publisher-container"));
    const detail = dom.append(detailContainer, dom.$("span.publisher-name"));
    const actionbar = new ActionBar(footer, {
      focusOnlyEnabledItems: true,
      actionViewItemProvider: (action, options) => {
        if (action instanceof ManagePluginAction) {
          return action.createActionViewItem(options);
        }
        return void 0;
      }
    });
    actionbar.setFocusable(false);
    return { root, name, description, detail, actionbar, disposables: [actionbar], elementDisposables: [] };
  }
  renderPlaceholder(_index, data) {
    data.name.textContent = "";
    data.description.textContent = "";
    data.detail.textContent = "";
    data.actionbar.clear();
    this.disposeElement(void 0, 0, data);
  }
  renderElement(element, _index, data) {
    this.disposeElement(void 0, 0, data);
    data.name.textContent = element.name;
    data.description.textContent = element.description;
    data.elementDisposables.push(autorun((reader) => {
      data.root.classList.toggle("disabled", element.kind === AgentPluginItemKind.Installed && !isContributionEnabled(element.plugin.enablement.read(reader)));
    }));
    const updateActions = (reader) => {
      data.actionbar.clear();
      if (element.kind === AgentPluginItemKind.Marketplace) {
        data.detail.textContent = element.marketplace;
        const installAction = this.instantiationService.createInstance(InstallPluginAction, element);
        reader.store.add(installAction);
        data.actionbar.push([installAction], { icon: true, label: true });
      } else {
        data.detail.textContent = element.marketplace ?? "";
        const actions = [];
        const livePlugin = element.outdated?.read(reader);
        if (livePlugin) {
          const updateAction = this.instantiationService.createInstance(UpdatePluginAction, element.plugin, livePlugin);
          reader.store.add(updateAction);
          actions.push(updateAction);
        }
        const manageAction = this.instantiationService.createInstance(
          ManagePluginAction,
          () => getInstalledPluginContextMenuActions(element.plugin, this.instantiationService)
        );
        reader.store.add(manageAction);
        actions.push(manageAction);
        data.actionbar.push(actions, { icon: true, label: true });
      }
    };
    data.elementDisposables.push(autorun(updateActions));
  }
  disposeElement(_element, _index, data) {
    for (const d of data.elementDisposables) {
      d.dispose();
    }
    data.elementDisposables = [];
  }
  disposeTemplate(data) {
    for (const d of data.disposables) {
      d.dispose();
    }
    this.disposeElement(void 0, 0, data);
  }
};
AgentPluginRenderer.templateId = "agentPlugin";
AgentPluginRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], AgentPluginRenderer);
let AgentPluginsListView = class extends AbstractExtensionsListView {
  constructor(listOptions, options, keybindingService, contextMenuService, instantiationService, themeService, hoverService, configurationService, contextKeyService, viewDescriptorService, openerService, agentPluginService, pluginMarketplaceService, pluginInstallService, labelService, editorService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.listOptions = listOptions;
    this.agentPluginService = agentPluginService;
    this.pluginMarketplaceService = pluginMarketplaceService;
    this.pluginInstallService = pluginInstallService;
    this.labelService = labelService;
    this.editorService = editorService;
    this.actionStore = this._register(new DisposableStore());
    this.queryCts = new MutableDisposable();
    this.list = null;
    this.listContainer = null;
    this.currentQuery = "@agentPlugins";
    this.refreshOnPluginsChangedScheduler = this._register(new RunOnceScheduler(() => {
      if (this.list) {
        void this.show(this.currentQuery);
      }
    }, 0));
    this._register(autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      for (const plugin of plugins) {
        plugin.enablement.read(reader);
      }
      if (this.list && this.isBodyVisible()) {
        this.refreshOnPluginsChangedScheduler.schedule();
      }
    }));
    this._register(this.pluginMarketplaceService.onDidChangeMarketplaces(() => {
      if (this.list && this.isBodyVisible()) {
        this.refreshOnPluginsChangedScheduler.schedule();
      }
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    const messageContainer = dom.append(container, dom.$(".message-container"));
    const messageBox = dom.append(messageContainer, dom.$(".message"));
    const pluginsList = dom.$(".agent-plugins-list");
    this.bodyTemplate = { pluginsList, messageBox, messageContainer };
    this.listContainer = dom.append(container, pluginsList);
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchPagedList,
      `${this.id}-Agent-Plugins`,
      this.listContainer,
      {
        getHeight() {
          return 72;
        },
        getTemplateId: () => AgentPluginRenderer.templateId
      },
      [this.instantiationService.createInstance(AgentPluginRenderer)],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel(item) {
            return item?.name ?? "";
          },
          getWidgetAriaLabel() {
            return localize("agentPlugins", "Agent Plugins");
          }
        },
        overrideStyles: getLocationBasedViewColors(this.viewDescriptorService.getViewLocationById(this.id)).listOverrideStyles
      }
    ));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e), this));
    this._register(Event.debounce(Event.filter(this.list.onDidOpen, (e) => e.element !== null), (_, event) => event, 75, true)((options) => {
      this.editorService.openEditor(
        this.instantiationService.createInstance(AgentPluginEditorInput, options.element),
        options.editorOptions
      );
    }));
  }
  onContextMenu(e) {
    if (!e.element) {
      return;
    }
    const actions = this.getContextMenuActions(e.element);
    if (actions.length === 0) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions
    });
  }
  getContextMenuActions(item) {
    let actions;
    if (item.kind === AgentPluginItemKind.Installed) {
      const groups = getInstalledPluginContextMenuActions(item.plugin, this.instantiationService);
      actions = groups.flatMap((group) => [...group, new Separator()]);
      if (actions.length > 0) {
        actions.pop();
      }
    } else {
      actions = [];
      if (item.readmeUri) {
        actions.push(this.instantiationService.createInstance(OpenPluginReadmeAction, item.readmeUri));
      }
      actions.push(this.instantiationService.createInstance(InstallPluginAction, item));
    }
    this.actionStore.clear();
    for (const action of actions) {
      if (isDisposable(action)) {
        this.actionStore.add(action);
      }
    }
    return actions;
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.list?.layout(height, width);
  }
  async show(query) {
    this.currentQuery = query;
    const stripped = query.replace(/@agentPlugins/i, "").trim();
    const isRecommended = /^@recommended$/i.test(stripped);
    const isInstalled = /(?:^|\s)@installed(?:\s|$)/i.test(stripped);
    const text = isRecommended ? "" : stripped.replace(/(?:^|\s)@installed(?:\s|$)/gi, " ").trim().toLowerCase();
    let installed = this.queryInstalled();
    if (text) {
      installed = installed.filter(
        (p) => p.name.toLowerCase().includes(text) || p.description.toLowerCase().includes(text) || (p.marketplace ?? "").toLowerCase().includes(text)
      );
    }
    if (isRecommended) {
      const recommended = this.pluginMarketplaceService.recommendedPlugins.get();
      installed = installed.filter((p) => {
        const marketplace = p.plugin.fromMarketplace;
        if (!marketplace) {
          return false;
        }
        const key = `${marketplace.name}@${marketplace.marketplace}`;
        return recommended.has(key);
      });
    }
    let items = installed;
    if (!this.listOptions.installedOnly && !isInstalled) {
      const marketplacePlugins = await this.queryMarketplacePlugins();
      let filteredMp = marketplacePlugins;
      if (isRecommended) {
        const recommended = this.pluginMarketplaceService.recommendedPlugins.get();
        filteredMp = filteredMp.filter((p) => {
          const key = `${p.name}@${p.marketplace}`;
          return recommended.has(key);
        });
      } else {
        const lowerText = text.toLowerCase();
        filteredMp = filteredMp.filter((p) => p.name.toLowerCase().includes(lowerText) || p.description.toLowerCase().includes(lowerText) || p.marketplace.toLowerCase().includes(lowerText));
      }
      const marketplace = filteredMp.map(marketplacePluginToItem);
      const installedPaths = new Set(installed.map((i) => i.plugin.uri.toString()));
      const filteredMarketplace = marketplace.filter((m) => {
        const expectedUri = this.pluginInstallService.getPluginInstallUri({
          name: m.name,
          description: m.description,
          version: "",
          source: m.source,
          sourceDescriptor: m.sourceDescriptor,
          marketplace: m.marketplace,
          marketplaceReference: m.marketplaceReference,
          marketplaceType: m.marketplaceType
        });
        return !installedPaths.has(expectedUri.toString());
      });
      items = [...installed, ...filteredMarketplace];
    }
    const model = new PagedModel(items);
    if (this.list) {
      this.list.model = model;
    }
    this.updateBody(model.length);
    return model;
  }
  /**
   * Builds the installed plugin list using only cached marketplace data
   * (no IO). The cached data is populated by {@link fetchMarketplacePlugins}
   * and exposed via the {@link IPluginMarketplaceService.lastFetchedPlugins}
   * observable, which the view's autorun subscribes to for reactivity.
   */
  queryInstalled() {
    const marketplaceObs = derived((reader) => {
      const cachedMarketplace = this.pluginMarketplaceService.lastFetchedPlugins.read(reader);
      const marketplaceByKey = /* @__PURE__ */ new Map();
      for (const mp of cachedMarketplace) {
        marketplaceByKey.set(`${mp.marketplaceReference.canonicalId}::${mp.name}`, mp);
      }
      const installedByUri = /* @__PURE__ */ new Map();
      for (const entry of this.pluginMarketplaceService.installedPlugins.read(reader)) {
        installedByUri.set(entry.pluginUri.toString(), entry.plugin);
      }
      return { marketplaceByKey, installedByUri };
    });
    const plugins = this.agentPluginService.plugins.get();
    return plugins.map((p) => {
      const isOutdated = derived((reader) => {
        const { marketplaceByKey, installedByUri } = marketplaceObs.read(reader);
        const storedPlugin = installedByUri.get(p.uri.toString()) ?? p.fromMarketplace;
        if (storedPlugin) {
          const key = `${storedPlugin.marketplaceReference.canonicalId}::${storedPlugin.name}`;
          const live = marketplaceByKey.get(key);
          if (live && hasSourceChanged(storedPlugin.sourceDescriptor, live.sourceDescriptor)) {
            return live;
          }
        }
        return void 0;
      });
      return installedPluginToItem(p, this.labelService, isOutdated);
    });
  }
  async queryMarketplacePlugins() {
    this.queryCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this.queryCts.value = cts;
    try {
      return await this.pluginMarketplaceService.fetchMarketplacePlugins(cts.token);
    } catch {
      return [];
    }
  }
  updateBody(count) {
    if (this.bodyTemplate) {
      this.bodyTemplate.pluginsList.classList.toggle("hidden", count === 0);
      this.bodyTemplate.messageContainer.classList.toggle("hidden", count > 0);
      if (count === 0 && this.isBodyVisible()) {
        this.bodyTemplate.messageBox.textContent = localize("noAgentPlugins", "No agent plugins found.");
      }
    }
  }
};
AgentPluginsListView = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IViewDescriptorService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IAgentPluginService),
  __decorateParam(12, IPluginMarketplaceService),
  __decorateParam(13, IPluginInstallService),
  __decorateParam(14, ILabelService),
  __decorateParam(15, IEditorService)
], AgentPluginsListView);
class AgentPluginsBrowseCommand extends Action2 {
  constructor() {
    super({
      id: "workbench.agentPlugins.browse",
      title: localize2("agentPlugins.browse", "Agent Plugins"),
      tooltip: localize2("agentPlugins.browse.tooltip", "Browse Agent Plugins"),
      icon: Codicon.search,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: [{
        id: extensionsFilterSubMenu,
        group: "1_predefined",
        order: 2,
        when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
      }, {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", InstalledAgentPluginsViewId), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        group: "navigation"
      }]
    });
  }
  async run(accessor) {
    accessor.get(IExtensionsWorkbenchService).openSearch("@agentPlugins ");
  }
}
class CheckForPluginUpdatesCommand extends Action2 {
  constructor() {
    super({
      id: "workbench.agentPlugins.checkForUpdates",
      title: localize2("agentPlugins.checkForUpdates", "Update Plugins"),
      category: localize2("chat.category", "Chat"),
      precondition: ChatContextKeys.enabled,
      f1: true
    });
  }
  async run(accessor) {
    await accessor.get(IPluginInstallService).updateAllPlugins({}, CancellationToken.None);
  }
}
class ForceUpdatePluginsCommand extends Action2 {
  constructor() {
    super({
      id: "workbench.agentPlugins.forceUpdate",
      title: localize2("agentPlugins.forceUpdate", "Update Plugins (Force)"),
      category: localize2("chat.category", "Chat"),
      precondition: ChatContextKeys.enabled,
      f1: true
    });
  }
  async run(accessor) {
    await accessor.get(IPluginInstallService).updateAllPlugins({ force: true }, CancellationToken.None);
  }
}
let AgentPluginsViewsContribution = class extends Disposable {
  constructor(contextKeyService, agentPluginService) {
    super();
    const hasInstalledKey = HasInstalledAgentPluginsContext.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      hasInstalledKey.set(agentPluginService.plugins.read(reader).length > 0);
    }));
    registerAction2(AgentPluginsBrowseCommand);
    registerAction2(CheckForPluginUpdatesCommand);
    registerAction2(ForceUpdatePluginsCommand);
    Registry.as(ViewExtensions.ViewsRegistry).registerViews([
      {
        id: InstalledAgentPluginsViewId,
        name: localize2("agent-plugins-installed", "Agent Plugins - Installed"),
        ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{ installedOnly: true }]),
        when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledAgentPluginsContext, ChatContextKeys.Setup.hidden.negate()),
        weight: 30,
        order: 5,
        canToggleVisibility: true
      },
      {
        id: "workbench.views.agentPlugins.default.marketplace",
        name: localize2("agent-plugins", "Agent Plugins"),
        ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{}]),
        when: ContextKeyExpr.and(DefaultViewsContext, HasInstalledAgentPluginsContext.toNegated(), ChatContextKeys.Setup.hidden.negate()),
        weight: 30,
        order: 5,
        canToggleVisibility: true,
        hideByDefault: true
      },
      {
        id: "workbench.views.agentPlugins.marketplace",
        name: localize2("agent-plugins", "Agent Plugins"),
        ctorDescriptor: new SyncDescriptor(AgentPluginsListView, [{}]),
        when: ContextKeyExpr.and(SearchAgentPluginsContext, ChatContextKeys.Setup.hidden.negate())
      }
    ], VIEW_CONTAINER);
  }
};
AgentPluginsViewsContribution.ID = "workbench.chat.agentPlugins.views.contribution";
AgentPluginsViewsContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IAgentPluginService)
], AgentPluginsViewsContribution);
export {
  AgentPluginsListView,
  AgentPluginsViewsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFBsdWdpbnNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJTGlzdENvbnRleHRNZW51RXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElQYWdlZFJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFBhZ2luZy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2VJZkRpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVJlYWRlcldpdGhTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVBhZ2VkTW9kZWwsIFBhZ2VkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYWdpbmcuanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoUGFnZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgSVZpZXdzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgVmlld0V4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgZ2V0V29ya2JlbmNoTWVudU1vdGlvbkNvbnRleHRNZW51T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9tZW51TW90aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZJRVdfQ09OVEFJTkVSIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IG1hbmFnZUV4dGVuc2lvbkljb24gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RXh0ZW5zaW9uc0xpc3RWaWV3IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNWaWV3cy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Vmlld3NDb250ZXh0LCBleHRlbnNpb25zRmlsdGVyU3ViTWVudSwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBTZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luLCBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ29udHJpYnV0aW9uRW5hYmxlZCB9IGZyb20gJy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IElQbHVnaW5JbnN0YWxsU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkluc3RhbGxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc1NvdXJjZUNoYW5nZWQsIElNYXJrZXRwbGFjZVBsdWdpbiwgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkVkaXRvcklucHV0IH0gZnJvbSAnLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luSXRlbUtpbmQsIElBZ2VudFBsdWdpbkl0ZW0sIElJbnN0YWxsZWRQbHVnaW5JdGVtLCBJTWFya2V0cGxhY2VQbHVnaW5JdGVtIH0gZnJvbSAnLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkl0ZW1zLmpzJztcbmltcG9ydCB7IGdldEluc3RhbGxlZFBsdWdpbkNvbnRleHRNZW51QWN0aW9ucywgSW5zdGFsbFBsdWdpbkFjdGlvbiwgT3BlblBsdWdpblJlYWRtZUFjdGlvbiB9IGZyb20gJy4vYWdlbnRQbHVnaW5BY3Rpb25zLmpzJztcbmltcG9ydCB7IEluc3RhbGxlZEFnZW50UGx1Z2luc1ZpZXdJZCwgSGFzSW5zdGFsbGVkQWdlbnRQbHVnaW5zQ29udGV4dCB9IGZyb20gJy4vY2hhdC5qcyc7XG5cbi8vI3JlZ2lvbiBJdGVtIG1vZGVsXG5cbmZ1bmN0aW9uIGluc3RhbGxlZFBsdWdpblRvSXRlbShwbHVnaW46IElBZ2VudFBsdWdpbiwgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLCBvdXRkYXRlZD86IElPYnNlcnZhYmxlPElNYXJrZXRwbGFjZVBsdWdpbiB8IHVuZGVmaW5lZD4pOiBJSW5zdGFsbGVkUGx1Z2luSXRlbSB7XG5cdGNvbnN0IG5hbWUgPSBwbHVnaW4ubGFiZWw7XG5cdGNvbnN0IGRlc2NyaXB0aW9uID0gcGx1Z2luLmZyb21NYXJrZXRwbGFjZT8uZGVzY3JpcHRpb24gPz8gbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUocGx1Z2luLnVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdGNvbnN0IG1hcmtldHBsYWNlID0gcGx1Z2luLmZyb21NYXJrZXRwbGFjZT8ubWFya2V0cGxhY2U7XG5cdHJldHVybiB7IGtpbmQ6IEFnZW50UGx1Z2luSXRlbUtpbmQuSW5zdGFsbGVkLCBuYW1lLCBkZXNjcmlwdGlvbiwgbWFya2V0cGxhY2UsIHBsdWdpbiwgb3V0ZGF0ZWQgfTtcbn1cblxuZnVuY3Rpb24gbWFya2V0cGxhY2VQbHVnaW5Ub0l0ZW0ocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pOiBJTWFya2V0cGxhY2VQbHVnaW5JdGVtIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLk1hcmtldHBsYWNlLFxuXHRcdG5hbWU6IHBsdWdpbi5uYW1lLFxuXHRcdGRlc2NyaXB0aW9uOiBwbHVnaW4uZGVzY3JpcHRpb24sXG5cdFx0c291cmNlOiBwbHVnaW4uc291cmNlLFxuXHRcdHNvdXJjZURlc2NyaXB0b3I6IHBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLFxuXHRcdG1hcmtldHBsYWNlOiBwbHVnaW4ubWFya2V0cGxhY2UsXG5cdFx0bWFya2V0cGxhY2VSZWZlcmVuY2U6IHBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZSxcblx0XHRtYXJrZXRwbGFjZVR5cGU6IHBsdWdpbi5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0cmVhZG1lVXJpOiBwbHVnaW4ucmVhZG1lVXJpLFxuXHR9O1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIEFjdGlvbnNcblxuLy8jcmVnaW9uIEFjdGlvbnNcblxuY2xhc3MgVXBkYXRlUGx1Z2luQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FnZW50UGx1Z2luLnVwZGF0ZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwbHVnaW46IElBZ2VudFBsdWdpbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpdmVNYXJrZXRwbGFjZVBsdWdpbjogSU1hcmtldHBsYWNlUGx1Z2luLFxuXHRcdEBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5JbnN0YWxsU2VydmljZTogSVBsdWdpbkluc3RhbGxTZXJ2aWNlLFxuXHRcdEBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlOiBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihVcGRhdGVQbHVnaW5BY3Rpb24uSUQsIGxvY2FsaXplKCd1cGRhdGUnLCBcIlVwZGF0ZVwiKSwgJ2V4dGVuc2lvbi1hY3Rpb24gbGFiZWwgcHJvbWluZW50IGluc3RhbGwnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYXdhaXQgdGhpcy5wbHVnaW5JbnN0YWxsU2VydmljZS51cGRhdGVQbHVnaW4odGhpcy5saXZlTWFya2V0cGxhY2VQbHVnaW4pKSB7XG5cdFx0XHR0aGlzLnBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5hZGRJbnN0YWxsZWRQbHVnaW4odGhpcy5wbHVnaW4udXJpLCB0aGlzLmxpdmVNYXJrZXRwbGFjZVBsdWdpbik7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE1hbmFnZVBsdWdpbkFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdhZ2VudFBsdWdpbi5tYW5hZ2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgZXh0ZW5zaW9uLWFjdGlvbiBpY29uIG1hbmFnZSAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShtYW5hZ2VFeHRlbnNpb25JY29uKX1gO1xuXG5cdHByaXZhdGUgX2FjdGlvblZpZXdJdGVtOiBEcm9wRG93bkFjdGlvblZpZXdJdGVtIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBnZXRBY3Rpb25Hcm91cHM6ICgpID0+IElBY3Rpb25bXVtdLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihNYW5hZ2VQbHVnaW5BY3Rpb24uSUQsICcnLCBNYW5hZ2VQbHVnaW5BY3Rpb24uQ0xBU1MsIHRydWUpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdtYW5hZ2UnLCBcIk1hbmFnZVwiKTtcblx0fVxuXG5cdGNyZWF0ZUFjdGlvblZpZXdJdGVtKG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBEcm9wRG93bkFjdGlvblZpZXdJdGVtIHtcblx0XHR0aGlzLl9hY3Rpb25WaWV3SXRlbSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRHJvcERvd25BY3Rpb25WaWV3SXRlbSwgdGhpcywgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvblZpZXdJdGVtO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2FjdGlvblZpZXdJdGVtPy5zaG93TWVudSh0aGlzLmdldEFjdGlvbkdyb3VwcygpKTtcblx0fVxufVxuXG5jbGFzcyBEcm9wRG93bkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdHNob3dNZW51KGFjdGlvbkdyb3VwczogSUFjdGlvbltdW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3Rpb25zID0gYWN0aW9uR3JvdXBzLmZsYXRNYXAoZ3JvdXAgPT4gWy4uLmdyb3VwLCBuZXcgU2VwYXJhdG9yKCldKTtcblx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhY3Rpb25zLnBvcCgpO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Li4uZ2V0V29ya2JlbmNoTWVudU1vdGlvbkNvbnRleHRNZW51T3B0aW9ucyh0aGlzLmVsZW1lbnQpLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zZUlmRGlzcG9zYWJsZShhY3Rpb25zKSxcblx0XHR9KTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFJlbmRlcmVyXG5cbmludGVyZmFjZSBJQWdlbnRQbHVnaW5UZW1wbGF0ZURhdGEge1xuXHRyb290OiBIVE1MRWxlbWVudDtcblx0bmFtZTogSFRNTEVsZW1lbnQ7XG5cdGRlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0ZGV0YWlsOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uYmFyOiBBY3Rpb25CYXI7XG5cdGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRlbGVtZW50RGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW107XG59XG5cbmNsYXNzIEFnZW50UGx1Z2luUmVuZGVyZXIgaW1wbGVtZW50cyBJUGFnZWRSZW5kZXJlcjxJQWdlbnRQbHVnaW5JdGVtLCBJQWdlbnRQbHVnaW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdhZ2VudFBsdWdpbic7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBBZ2VudFBsdWdpblJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUocm9vdDogSFRNTEVsZW1lbnQpOiBJQWdlbnRQbHVnaW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb20uYXBwZW5kKHJvb3QsIGRvbS4kKCcuYWdlbnQtcGx1Z2luLWl0ZW0uZXh0ZW5zaW9uLWxpc3QtaXRlbScpKTtcblx0XHRjb25zdCBkZXRhaWxzID0gZG9tLmFwcGVuZChlbGVtZW50LCBkb20uJCgnLmRldGFpbHMnKSk7XG5cdFx0Y29uc3QgaGVhZGVyQ29udGFpbmVyID0gZG9tLmFwcGVuZChkZXRhaWxzLCBkb20uJCgnLmhlYWRlci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaGVhZGVyID0gZG9tLmFwcGVuZChoZWFkZXJDb250YWluZXIsIGRvbS4kKCcuaGVhZGVyJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJ3NwYW4ubmFtZScpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGRvbS5hcHBlbmQoZGV0YWlscywgZG9tLiQoJy5kZXNjcmlwdGlvbi5lbGxpcHNpcycpKTtcblx0XHRjb25zdCBmb290ZXIgPSBkb20uYXBwZW5kKGRldGFpbHMsIGRvbS4kKCcuZm9vdGVyJykpO1xuXHRcdGNvbnN0IGRldGFpbENvbnRhaW5lciA9IGRvbS5hcHBlbmQoZm9vdGVyLCBkb20uJCgnLnB1Ymxpc2hlci1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgZGV0YWlsID0gZG9tLmFwcGVuZChkZXRhaWxDb250YWluZXIsIGRvbS4kKCdzcGFuLnB1Ymxpc2hlci1uYW1lJykpO1xuXHRcdGNvbnN0IGFjdGlvbmJhciA9IG5ldyBBY3Rpb25CYXIoZm9vdGVyLCB7XG5cdFx0XHRmb2N1c09ubHlFbmFibGVkSXRlbXM6IHRydWUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNYW5hZ2VQbHVnaW5BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uLmNyZWF0ZUFjdGlvblZpZXdJdGVtKG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YWN0aW9uYmFyLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0cmV0dXJuIHsgcm9vdCwgbmFtZSwgZGVzY3JpcHRpb24sIGRldGFpbCwgYWN0aW9uYmFyLCBkaXNwb3NhYmxlczogW2FjdGlvbmJhcl0sIGVsZW1lbnREaXNwb3NhYmxlczogW10gfTtcblx0fVxuXG5cdHJlbmRlclBsYWNlaG9sZGVyKF9pbmRleDogbnVtYmVyLCBkYXRhOiBJQWdlbnRQbHVnaW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRkYXRhLm5hbWUudGV4dENvbnRlbnQgPSAnJztcblx0XHRkYXRhLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gJyc7XG5cdFx0ZGF0YS5kZXRhaWwudGV4dENvbnRlbnQgPSAnJztcblx0XHRkYXRhLmFjdGlvbmJhci5jbGVhcigpO1xuXHRcdHRoaXMuZGlzcG9zZUVsZW1lbnQodW5kZWZpbmVkLCAwLCBkYXRhKTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSUFnZW50UGx1Z2luSXRlbSwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElBZ2VudFBsdWdpblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zZUVsZW1lbnQodW5kZWZpbmVkLCAwLCBkYXRhKTtcblxuXHRcdGRhdGEubmFtZS50ZXh0Q29udGVudCA9IGVsZW1lbnQubmFtZTtcblx0XHRkYXRhLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gZWxlbWVudC5kZXNjcmlwdGlvbjtcblxuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLnB1c2goYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0ZGF0YS5yb290LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgZWxlbWVudC5raW5kID09PSBBZ2VudFBsdWdpbkl0ZW1LaW5kLkluc3RhbGxlZCAmJiAhaXNDb250cmlidXRpb25FbmFibGVkKGVsZW1lbnQucGx1Z2luLmVuYWJsZW1lbnQucmVhZChyZWFkZXIpKSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQWN0aW9ucyA9IChyZWFkZXI6IElSZWFkZXJXaXRoU3RvcmUpID0+IHtcblx0XHRcdGRhdGEuYWN0aW9uYmFyLmNsZWFyKCk7XG5cdFx0XHRpZiAoZWxlbWVudC5raW5kID09PSBBZ2VudFBsdWdpbkl0ZW1LaW5kLk1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdGRhdGEuZGV0YWlsLnRleHRDb250ZW50ID0gZWxlbWVudC5tYXJrZXRwbGFjZTtcblx0XHRcdFx0Y29uc3QgaW5zdGFsbEFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbFBsdWdpbkFjdGlvbiwgZWxlbWVudCk7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoaW5zdGFsbEFjdGlvbik7XG5cdFx0XHRcdGRhdGEuYWN0aW9uYmFyLnB1c2goW2luc3RhbGxBY3Rpb25dLCB7IGljb246IHRydWUsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGF0YS5kZXRhaWwudGV4dENvbnRlbnQgPSBlbGVtZW50Lm1hcmtldHBsYWNlID8/ICcnO1xuXHRcdFx0XHRjb25zdCBhY3Rpb25zOiBBY3Rpb25bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBsaXZlUGx1Z2luID0gZWxlbWVudC5vdXRkYXRlZD8ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAobGl2ZVBsdWdpbikge1xuXHRcdFx0XHRcdGNvbnN0IHVwZGF0ZUFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXBkYXRlUGx1Z2luQWN0aW9uLCBlbGVtZW50LnBsdWdpbiwgbGl2ZVBsdWdpbik7XG5cdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh1cGRhdGVBY3Rpb24pO1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCh1cGRhdGVBY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1hbmFnZUFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFuYWdlUGx1Z2luQWN0aW9uLFxuXHRcdFx0XHRcdCgpID0+IGdldEluc3RhbGxlZFBsdWdpbkNvbnRleHRNZW51QWN0aW9ucyhlbGVtZW50LnBsdWdpbiwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKG1hbmFnZUFjdGlvbik7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChtYW5hZ2VBY3Rpb24pO1xuXHRcdFx0XHRkYXRhLmFjdGlvbmJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLnB1c2goYXV0b3J1bih1cGRhdGVBY3Rpb25zKSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSUFnZW50UGx1Z2luSXRlbSB8IHVuZGVmaW5lZCwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElBZ2VudFBsdWdpblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZCBvZiBkYXRhLmVsZW1lbnREaXNwb3NhYmxlcykge1xuXHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzID0gW107XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUoZGF0YTogSUFnZW50UGx1Z2luVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBkIG9mIGRhdGEuZGlzcG9zYWJsZXMpIHtcblx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLmRpc3Bvc2VFbGVtZW50KHVuZGVmaW5lZCwgMCwgZGF0YSk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBMaXN0IFZpZXdcblxuaW50ZXJmYWNlIElBZ2VudFBsdWdpbnNMaXN0Vmlld09wdGlvbnMge1xuXHRpbnN0YWxsZWRPbmx5PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50UGx1Z2luc0xpc3RWaWV3IGV4dGVuZHMgQWJzdHJhY3RFeHRlbnNpb25zTGlzdFZpZXc8SUFnZW50UGx1Z2luSXRlbT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHF1ZXJ5Q3RzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXHRwcml2YXRlIGxpc3Q6IFdvcmtiZW5jaFBhZ2VkTGlzdDxJQWdlbnRQbHVnaW5JdGVtPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGxpc3RDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgY3VycmVudFF1ZXJ5ID0gJ0BhZ2VudFBsdWdpbnMnO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlZnJlc2hPblBsdWdpbnNDaGFuZ2VkU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdGlmICh0aGlzLmxpc3QpIHtcblx0XHRcdHZvaWQgdGhpcy5zaG93KHRoaXMuY3VycmVudFF1ZXJ5KTtcblx0XHR9XG5cdH0sIDApKTtcblx0cHJpdmF0ZSBib2R5VGVtcGxhdGU6IHtcblx0XHRtZXNzYWdlQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0XHRtZXNzYWdlQm94OiBIVE1MRWxlbWVudDtcblx0XHRwbHVnaW5zTGlzdDogSFRNTEVsZW1lbnQ7XG5cdH0gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsaXN0T3B0aW9uczogSUFnZW50UGx1Z2luc0xpc3RWaWV3T3B0aW9ucyxcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHRcdEBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlOiBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLFxuXHRcdEBJUGx1Z2luSW5zdGFsbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbHVnaW5JbnN0YWxsU2VydmljZTogSVBsdWdpbkluc3RhbGxTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpbnMgPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGZvciAoY29uc3QgcGx1Z2luIG9mIHBsdWdpbnMpIHtcblx0XHRcdFx0cGx1Z2luLmVuYWJsZW1lbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubGlzdCAmJiB0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hPblBsdWdpbnNDaGFuZ2VkU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2Uub25EaWRDaGFuZ2VNYXJrZXRwbGFjZXMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMubGlzdCAmJiB0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hPblBsdWdpbnNDaGFuZ2VkU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2VDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5tZXNzYWdlLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBtZXNzYWdlQm94ID0gZG9tLmFwcGVuZChtZXNzYWdlQ29udGFpbmVyLCBkb20uJCgnLm1lc3NhZ2UnKSk7XG5cdFx0Y29uc3QgcGx1Z2luc0xpc3QgPSBkb20uJCgnLmFnZW50LXBsdWdpbnMtbGlzdCcpO1xuXG5cdFx0dGhpcy5ib2R5VGVtcGxhdGUgPSB7IHBsdWdpbnNMaXN0LCBtZXNzYWdlQm94LCBtZXNzYWdlQ29udGFpbmVyIH07XG5cblx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgcGx1Z2luc0xpc3QpO1xuXHRcdHRoaXMubGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoUGFnZWRMaXN0LFxuXHRcdFx0YCR7dGhpcy5pZH0tQWdlbnQtUGx1Z2luc2AsXG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdGdldEhlaWdodCgpIHsgcmV0dXJuIDcyOyB9LFxuXHRcdFx0XHRnZXRUZW1wbGF0ZUlkOiAoKSA9PiBBZ2VudFBsdWdpblJlbmRlcmVyLnRlbXBsYXRlSWQsXG5cdFx0XHR9LFxuXHRcdFx0W3RoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRQbHVnaW5SZW5kZXJlcildLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbChpdGVtOiBJQWdlbnRQbHVnaW5JdGVtIHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaXRlbT8ubmFtZSA/PyAnJztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudFBsdWdpbnMnLCBcIkFnZW50IFBsdWdpbnNcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnModGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh0aGlzLmlkKSkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0fSkgYXMgV29ya2JlbmNoUGFnZWRMaXN0PElBZ2VudFBsdWdpbkl0ZW0+KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpLCB0aGlzKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5kZWJvdW5jZShFdmVudC5maWx0ZXIodGhpcy5saXN0Lm9uRGlkT3BlbiwgZSA9PiBlLmVsZW1lbnQgIT09IG51bGwpLCAoXywgZXZlbnQpID0+IGV2ZW50LCA3NSwgdHJ1ZSkob3B0aW9ucyA9PiB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFBsdWdpbkVkaXRvcklucHV0LCBvcHRpb25zLmVsZW1lbnQhKSxcblx0XHRcdFx0b3B0aW9ucy5lZGl0b3JPcHRpb25zXG5cdFx0XHQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SUFnZW50UGx1Z2luSXRlbT4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldENvbnRleHRNZW51QWN0aW9ucyhlLmVsZW1lbnQpO1xuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGl0ZW06IElBZ2VudFBsdWdpbkl0ZW0pOiBJQWN0aW9uW10ge1xuXHRcdGxldCBhY3Rpb25zOiBJQWN0aW9uW107XG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gQWdlbnRQbHVnaW5JdGVtS2luZC5JbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IGdldEluc3RhbGxlZFBsdWdpbkNvbnRleHRNZW51QWN0aW9ucyhpdGVtLnBsdWdpbiwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0XHRhY3Rpb25zID0gZ3JvdXBzLmZsYXRNYXAoZ3JvdXAgPT4gWy4uLmdyb3VwLCBuZXcgU2VwYXJhdG9yKCldKTtcblx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0YWN0aW9ucy5wb3AoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YWN0aW9ucyA9IFtdO1xuXHRcdFx0aWYgKGl0ZW0ucmVhZG1lVXJpKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE9wZW5QbHVnaW5SZWFkbWVBY3Rpb24sIGl0ZW0ucmVhZG1lVXJpKSk7XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25zLnB1c2godGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsUGx1Z2luQWN0aW9uLCBpdGVtKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hY3Rpb25TdG9yZS5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdGlmIChpc0Rpc3Bvc2FibGUoYWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLmFjdGlvblN0b3JlLmFkZChhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMubGlzdD8ubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0YXN5bmMgc2hvdyhxdWVyeTogc3RyaW5nKTogUHJvbWlzZTxJUGFnZWRNb2RlbDxJQWdlbnRQbHVnaW5JdGVtPj4ge1xuXHRcdHRoaXMuY3VycmVudFF1ZXJ5ID0gcXVlcnk7XG5cdFx0Y29uc3Qgc3RyaXBwZWQgPSBxdWVyeS5yZXBsYWNlKC9AYWdlbnRQbHVnaW5zL2ksICcnKS50cmltKCk7XG5cdFx0Y29uc3QgaXNSZWNvbW1lbmRlZCA9IC9eQHJlY29tbWVuZGVkJC9pLnRlc3Qoc3RyaXBwZWQpO1xuXHRcdGNvbnN0IGlzSW5zdGFsbGVkID0gLyg/Ol58XFxzKUBpbnN0YWxsZWQoPzpcXHN8JCkvaS50ZXN0KHN0cmlwcGVkKTtcblx0XHRjb25zdCB0ZXh0ID0gaXNSZWNvbW1lbmRlZCA/ICcnIDogc3RyaXBwZWQucmVwbGFjZSgvKD86XnxcXHMpQGluc3RhbGxlZCg/Olxcc3wkKS9naSwgJyAnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGxldCBpbnN0YWxsZWQgPSB0aGlzLnF1ZXJ5SW5zdGFsbGVkKCk7XG5cdFx0aWYgKHRleHQpIHtcblx0XHRcdGluc3RhbGxlZCA9IGluc3RhbGxlZC5maWx0ZXIocCA9PlxuXHRcdFx0XHRwLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0ZXh0KSB8fFxuXHRcdFx0XHRwLmRlc2NyaXB0aW9uLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGV4dCkgfHxcblx0XHRcdFx0KHAubWFya2V0cGxhY2UgPz8gJycpLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXModGV4dClcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBAcmVjb21tZW5kZWQsIGZpbHRlciB0byBwbHVnaW5zIGxpc3RlZCBpbiB3b3Jrc3BhY2UgcmVjb21tZW5kYXRpb25zLlxuXHRcdGlmIChpc1JlY29tbWVuZGVkKSB7XG5cdFx0XHRjb25zdCByZWNvbW1lbmRlZCA9IHRoaXMucGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnJlY29tbWVuZGVkUGx1Z2lucy5nZXQoKTtcblx0XHRcdGluc3RhbGxlZCA9IGluc3RhbGxlZC5maWx0ZXIocCA9PiB7XG5cdFx0XHRcdGNvbnN0IG1hcmtldHBsYWNlID0gcC5wbHVnaW4uZnJvbU1hcmtldHBsYWNlO1xuXHRcdFx0XHRpZiAoIW1hcmtldHBsYWNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGtleSA9IGAke21hcmtldHBsYWNlLm5hbWV9QCR7bWFya2V0cGxhY2UubWFya2V0cGxhY2V9YDtcblx0XHRcdFx0cmV0dXJuIHJlY29tbWVuZGVkLmhhcyhrZXkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bGV0IGl0ZW1zOiBJQWdlbnRQbHVnaW5JdGVtW10gPSBpbnN0YWxsZWQ7XG5cblx0XHRpZiAoIXRoaXMubGlzdE9wdGlvbnMuaW5zdGFsbGVkT25seSAmJiAhaXNJbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IG1hcmtldHBsYWNlUGx1Z2lucyA9IGF3YWl0IHRoaXMucXVlcnlNYXJrZXRwbGFjZVBsdWdpbnMoKTtcblx0XHRcdGxldCBmaWx0ZXJlZE1wID0gbWFya2V0cGxhY2VQbHVnaW5zO1xuXG5cdFx0XHRpZiAoaXNSZWNvbW1lbmRlZCkge1xuXHRcdFx0XHQvLyBXaGVuIEByZWNvbW1lbmRlZCwgZmlsdGVyIG1hcmtldHBsYWNlIHBsdWdpbnMgdG8gdGhvc2UgaW4gcmVjb21tZW5kYXRpb25zLlxuXHRcdFx0XHRjb25zdCByZWNvbW1lbmRlZCA9IHRoaXMucGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLnJlY29tbWVuZGVkUGx1Z2lucy5nZXQoKTtcblx0XHRcdFx0ZmlsdGVyZWRNcCA9IGZpbHRlcmVkTXAuZmlsdGVyKHAgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IGAke3AubmFtZX1AJHtwLm1hcmtldHBsYWNlfWA7XG5cdFx0XHRcdFx0cmV0dXJuIHJlY29tbWVuZGVkLmhhcyhrZXkpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGxvd2VyVGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0ZmlsdGVyZWRNcCA9IGZpbHRlcmVkTXAuZmlsdGVyKHAgPT4gcC5uYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobG93ZXJUZXh0KSB8fCBwLmRlc2NyaXB0aW9uLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobG93ZXJUZXh0KSB8fCBwLm1hcmtldHBsYWNlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMobG93ZXJUZXh0KSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hcmtldHBsYWNlID0gZmlsdGVyZWRNcC5tYXAobWFya2V0cGxhY2VQbHVnaW5Ub0l0ZW0pO1xuXG5cdFx0XHQvLyBGaWx0ZXIgb3V0IG1hcmtldHBsYWNlIGl0ZW1zIHRoYXQgYXJlIGFscmVhZHkgaW5zdGFsbGVkXG5cdFx0XHRjb25zdCBpbnN0YWxsZWRQYXRocyA9IG5ldyBTZXQoaW5zdGFsbGVkLm1hcChpID0+IGkucGx1Z2luLnVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRjb25zdCBmaWx0ZXJlZE1hcmtldHBsYWNlID0gbWFya2V0cGxhY2UuZmlsdGVyKG0gPT4ge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZFVyaSA9IHRoaXMucGx1Z2luSW5zdGFsbFNlcnZpY2UuZ2V0UGx1Z2luSW5zdGFsbFVyaSh7XG5cdFx0XHRcdFx0bmFtZTogbS5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHZlcnNpb246ICcnLFxuXHRcdFx0XHRcdHNvdXJjZTogbS5zb3VyY2UsXG5cdFx0XHRcdFx0c291cmNlRGVzY3JpcHRvcjogbS5zb3VyY2VEZXNjcmlwdG9yLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlOiBtLm1hcmtldHBsYWNlLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiBtLm1hcmtldHBsYWNlUmVmZXJlbmNlLFxuXHRcdFx0XHRcdG1hcmtldHBsYWNlVHlwZTogbS5tYXJrZXRwbGFjZVR5cGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gIWluc3RhbGxlZFBhdGhzLmhhcyhleHBlY3RlZFVyaS50b1N0cmluZygpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpdGVtcyA9IFsuLi5pbnN0YWxsZWQsIC4uLmZpbHRlcmVkTWFya2V0cGxhY2VdO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IFBhZ2VkTW9kZWwoaXRlbXMpO1xuXHRcdGlmICh0aGlzLmxpc3QpIHtcblx0XHRcdHRoaXMubGlzdC5tb2RlbCA9IG1vZGVsO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUJvZHkobW9kZWwubGVuZ3RoKTtcblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBpbnN0YWxsZWQgcGx1Z2luIGxpc3QgdXNpbmcgb25seSBjYWNoZWQgbWFya2V0cGxhY2UgZGF0YVxuXHQgKiAobm8gSU8pLiBUaGUgY2FjaGVkIGRhdGEgaXMgcG9wdWxhdGVkIGJ5IHtAbGluayBmZXRjaE1hcmtldHBsYWNlUGx1Z2luc31cblx0ICogYW5kIGV4cG9zZWQgdmlhIHRoZSB7QGxpbmsgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZS5sYXN0RmV0Y2hlZFBsdWdpbnN9XG5cdCAqIG9ic2VydmFibGUsIHdoaWNoIHRoZSB2aWV3J3MgYXV0b3J1biBzdWJzY3JpYmVzIHRvIGZvciByZWFjdGl2aXR5LlxuXHQgKi9cblx0cHJpdmF0ZSBxdWVyeUluc3RhbGxlZCgpOiBJSW5zdGFsbGVkUGx1Z2luSXRlbVtdIHtcblx0XHRjb25zdCBtYXJrZXRwbGFjZU9icyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNhY2hlZE1hcmtldHBsYWNlID0gdGhpcy5wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UubGFzdEZldGNoZWRQbHVnaW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1hcmtldHBsYWNlQnlLZXkgPSBuZXcgTWFwPHN0cmluZywgSU1hcmtldHBsYWNlUGx1Z2luPigpO1xuXHRcdFx0Zm9yIChjb25zdCBtcCBvZiBjYWNoZWRNYXJrZXRwbGFjZSkge1xuXHRcdFx0XHRtYXJrZXRwbGFjZUJ5S2V5LnNldChgJHttcC5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZH06OiR7bXAubmFtZX1gLCBtcCk7XG5cdFx0XHR9XG5cblxuXHRcdFx0Ly8gUmVhZCBmcmVzaCBpbnN0YWxsZWQgcGx1Z2luIG1ldGFkYXRhIGZyb20gdGhlIHN0b3JlIChub3QgZnJvbVxuXHRcdFx0Ly8gSUFnZW50UGx1Z2luLmZyb21NYXJrZXRwbGFjZSB3aGljaCBtYXkgYmUgc3RhbGUgYWZ0ZXIgYW4gdXBkYXRlKS5cblx0XHRcdGNvbnN0IGluc3RhbGxlZEJ5VXJpID0gbmV3IE1hcDxzdHJpbmcsIElNYXJrZXRwbGFjZVBsdWdpbj4oKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuaW5zdGFsbGVkUGx1Z2lucy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aW5zdGFsbGVkQnlVcmkuc2V0KGVudHJ5LnBsdWdpblVyaS50b1N0cmluZygpLCBlbnRyeS5wbHVnaW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBtYXJrZXRwbGFjZUJ5S2V5LCBpbnN0YWxsZWRCeVVyaSB9O1xuXHRcdH0pO1xuXG5cblx0XHRjb25zdCBwbHVnaW5zID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5nZXQoKTtcblx0XHRyZXR1cm4gcGx1Z2lucy5tYXAocCA9PiB7XG5cdFx0XHRjb25zdCBpc091dGRhdGVkID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG1hcmtldHBsYWNlQnlLZXksIGluc3RhbGxlZEJ5VXJpIH0gPSBtYXJrZXRwbGFjZU9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHN0b3JlZFBsdWdpbiA9IGluc3RhbGxlZEJ5VXJpLmdldChwLnVyaS50b1N0cmluZygpKSA/PyBwLmZyb21NYXJrZXRwbGFjZTtcblx0XHRcdFx0aWYgKHN0b3JlZFBsdWdpbikge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IGAke3N0b3JlZFBsdWdpbi5tYXJrZXRwbGFjZVJlZmVyZW5jZS5jYW5vbmljYWxJZH06OiR7c3RvcmVkUGx1Z2luLm5hbWV9YDtcblx0XHRcdFx0XHRjb25zdCBsaXZlID0gbWFya2V0cGxhY2VCeUtleS5nZXQoa2V5KTtcblx0XHRcdFx0XHRpZiAobGl2ZSAmJiBoYXNTb3VyY2VDaGFuZ2VkKHN0b3JlZFBsdWdpbi5zb3VyY2VEZXNjcmlwdG9yLCBsaXZlLnNvdXJjZURlc2NyaXB0b3IpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbGl2ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gaW5zdGFsbGVkUGx1Z2luVG9JdGVtKHAsIHRoaXMubGFiZWxTZXJ2aWNlLCBpc091dGRhdGVkKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlNYXJrZXRwbGFjZVBsdWdpbnMoKTogUHJvbWlzZTxJTWFya2V0cGxhY2VQbHVnaW5bXT4ge1xuXHRcdHRoaXMucXVlcnlDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMucXVlcnlDdHMudmFsdWUgPSBjdHM7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMucGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmZldGNoTWFya2V0cGxhY2VQbHVnaW5zKGN0cy50b2tlbik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCb2R5KGNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ib2R5VGVtcGxhdGUpIHtcblx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLnBsdWdpbnNMaXN0LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIGNvdW50ID09PSAwKTtcblx0XHRcdHRoaXMuYm9keVRlbXBsYXRlLm1lc3NhZ2VDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgY291bnQgPiAwKTtcblx0XHRcdGlmIChjb3VudCA9PT0gMCAmJiB0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0XHR0aGlzLmJvZHlUZW1wbGF0ZS5tZXNzYWdlQm94LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vQWdlbnRQbHVnaW5zJywgXCJObyBhZ2VudCBwbHVnaW5zIGZvdW5kLlwiKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBCcm93c2UgY29tbWFuZFxuXG5jbGFzcyBBZ2VudFBsdWdpbnNCcm93c2VDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFnZW50UGx1Z2lucy5icm93c2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRQbHVnaW5zLmJyb3dzZScsIFwiQWdlbnQgUGx1Z2luc1wiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplMignYWdlbnRQbHVnaW5zLmJyb3dzZS50b29sdGlwJywgXCJCcm93c2UgQWdlbnQgUGx1Z2luc1wiKSxcblx0XHRcdGljb246IENvZGljb24uc2VhcmNoLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LFxuXHRcdFx0XHRncm91cDogJzFfcHJlZGVmaW5lZCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIEluc3RhbGxlZEFnZW50UGx1Z2luc1ZpZXdJZCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkub3BlblNlYXJjaCgnQGFnZW50UGx1Z2lucyAnKTtcblx0fVxufVxuXG5jbGFzcyBDaGVja0ZvclBsdWdpblVwZGF0ZXNDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFnZW50UGx1Z2lucy5jaGVja0ZvclVwZGF0ZXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRQbHVnaW5zLmNoZWNrRm9yVXBkYXRlcycsIFwiVXBkYXRlIFBsdWdpbnNcIiksXG5cdFx0XHRjYXRlZ29yeTogbG9jYWxpemUyKCdjaGF0LmNhdGVnb3J5JywgXCJDaGF0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElQbHVnaW5JbnN0YWxsU2VydmljZSkudXBkYXRlQWxsUGx1Z2lucyh7fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cbn1cblxuY2xhc3MgRm9yY2VVcGRhdGVQbHVnaW5zQ29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hZ2VudFBsdWdpbnMuZm9yY2VVcGRhdGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWdlbnRQbHVnaW5zLmZvcmNlVXBkYXRlJywgXCJVcGRhdGUgUGx1Z2lucyAoRm9yY2UpXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplMignY2hhdC5jYXRlZ29yeScsIFwiQ2hhdFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGF3YWl0IGFjY2Vzc29yLmdldChJUGx1Z2luSW5zdGFsbFNlcnZpY2UpLnVwZGF0ZUFsbFBsdWdpbnMoeyBmb3JjZTogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBWaWV3cyBjb250cmlidXRpb25cblxuZXhwb3J0IGNsYXNzIEFnZW50UGx1Z2luc1ZpZXdzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyBJRCA9ICd3b3JrYmVuY2guY2hhdC5hZ2VudFBsdWdpbnMudmlld3MuY29udHJpYnV0aW9uJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgYWdlbnRQbHVnaW5TZXJ2aWNlOiBJQWdlbnRQbHVnaW5TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaGFzSW5zdGFsbGVkS2V5ID0gSGFzSW5zdGFsbGVkQWdlbnRQbHVnaW5zQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGhhc0luc3RhbGxlZEtleS5zZXQoYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMucmVhZChyZWFkZXIpLmxlbmd0aCA+IDApO1xuXHRcdH0pKTtcblxuXHRcdHJlZ2lzdGVyQWN0aW9uMihBZ2VudFBsdWdpbnNCcm93c2VDb21tYW5kKTtcblx0XHRyZWdpc3RlckFjdGlvbjIoQ2hlY2tGb3JQbHVnaW5VcGRhdGVzQ29tbWFuZCk7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKEZvcmNlVXBkYXRlUGx1Z2luc0NvbW1hbmQpO1xuXG5cdFx0UmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld3MoW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogSW5zdGFsbGVkQWdlbnRQbHVnaW5zVmlld0lkLFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2FnZW50LXBsdWdpbnMtaW5zdGFsbGVkJywgXCJBZ2VudCBQbHVnaW5zIC0gSW5zdGFsbGVkXCIpLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEFnZW50UGx1Z2luc0xpc3RWaWV3LCBbeyBpbnN0YWxsZWRPbmx5OiB0cnVlIH1dKSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKERlZmF1bHRWaWV3c0NvbnRleHQsIEhhc0luc3RhbGxlZEFnZW50UGx1Z2luc0NvbnRleHQsIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCkpLFxuXHRcdFx0XHR3ZWlnaHQ6IDMwLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmFnZW50UGx1Z2lucy5kZWZhdWx0Lm1hcmtldHBsYWNlJyxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUyKCdhZ2VudC1wbHVnaW5zJywgXCJBZ2VudCBQbHVnaW5zXCIpLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEFnZW50UGx1Z2luc0xpc3RWaWV3LCBbe31dKSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKERlZmF1bHRWaWV3c0NvbnRleHQsIEhhc0luc3RhbGxlZEFnZW50UGx1Z2luc0NvbnRleHQudG9OZWdhdGVkKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCkpLFxuXHRcdFx0XHR3ZWlnaHQ6IDMwLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdFx0aGlkZUJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLnZpZXdzLmFnZW50UGx1Z2lucy5tYXJrZXRwbGFjZScsXG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplMignYWdlbnQtcGx1Z2lucycsIFwiQWdlbnQgUGx1Z2luc1wiKSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihBZ2VudFBsdWdpbnNMaXN0VmlldywgW3t9XSksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTZWFyY2hBZ2VudFBsdWdpbnNDb250ZXh0LCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpKSxcblx0XHRcdH0sXG5cdFx0XSwgVklFV19DT05UQUlORVIpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxzQkFBOEM7QUFHdkQsU0FBUyxRQUFpQixpQkFBaUI7QUFDM0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGlCQUFpQixxQkFBa0MsY0FBYyx5QkFBeUI7QUFDL0csU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLGVBQThDO0FBQ2hFLFNBQXNCLGtCQUFrQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsUUFB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
