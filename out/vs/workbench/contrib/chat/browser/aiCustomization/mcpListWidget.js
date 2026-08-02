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
import { Disposable, DisposableStore, isDisposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { NotSelectableGroupId } from "../../../../../base/browser/ui/list/list.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../../platform/mcp/common/mcpManagement.js";
import { IMcpWorkbenchService, McpConnectionState, McpServerInstallState, IMcpService } from "../../../../contrib/mcp/common/mcpTypes.js";
import { IMcpRegistry } from "../../../mcp/common/mcpRegistryTypes.js";
import { MCP_PLUGIN_COLLECTION_ID_PREFIX } from "../../../mcp/common/discovery/pluginMcpDiscovery.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { ContributionEnablementState, isContributionDisabled } from "../../common/enablement.js";
import { McpCommandIds } from "../../../../contrib/mcp/common/mcpCommandIds.js";
import { autorun } from "../../../../../base/common/observable.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { URI } from "../../../../../base/common/uri.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Delayer } from "../../../../../base/common/async.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { ConfigureModelAccessAction, DisableMcpServerForWorkspaceAction, DisableMcpServerGloballyAction, EnableMcpServerForWorkspaceAction, EnableMcpServerGloballyAction, getContextMenuActions, RestartServerAction, ShowSamplingRequestsAction, StartServerAction, StopServerAction } from "../../../../contrib/mcp/browser/mcpServerActions.js";
import { LocalMcpServerScope } from "../../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IAgentPluginService } from "../../common/plugins/agentPluginService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { workspaceIcon, userIcon, mcpServerIcon, builtinIcon, pluginIcon, extensionIcon } from "./aiCustomizationIcons.js";
import { formatDisplayName, truncateToFirstLine } from "./aiCustomizationListWidget.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IAICustomizationWorkspaceService } from "../../common/aiCustomizationWorkspaceService.js";
import { CustomizationGroupHeaderRenderer, CUSTOMIZATION_GROUP_HEADER_HEIGHT, CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR } from "./customizationGroupHeaderRenderer.js";
import { AgentPluginItemKind } from "../agentPluginEditor/agentPluginItems.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { IAgentHostCustomizationService } from "../agentSessions/agentHost/agentHostCustomizationService.js";
import { McpServerStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { GalleryItemInstallState, GalleryItemRenderer } from "./galleryItemRenderer.js";
import { IOutputService } from "../../../../services/output/common/output.js";
const $ = DOM.$;
const MCP_ITEM_HEIGHT = 36;
const MCP_ITEM_WITH_DESCRIPTION_HEIGHT = 44;
const PLUGIN_COLLECTION_PREFIX = MCP_PLUGIN_COLLECTION_ID_PREFIX;
const COPILOT_EXTENSION_IDS = ["github.copilot", "github.copilot-chat"];
function isCopilotExtension(id) {
  return COPILOT_EXTENSION_IDS.some((copilotId) => ExtensionIdentifier.equals(id, copilotId));
}
function getPluginUriFromCollectionId(collectionId) {
  return collectionId?.startsWith(PLUGIN_COLLECTION_PREFIX) ? collectionId.slice(PLUGIN_COLLECTION_PREFIX.length) : void 0;
}
class McpServerItemDelegate {
  getHeight(element) {
    if (element.type === "group-header") {
      return element.isFirst ? CUSTOMIZATION_GROUP_HEADER_HEIGHT : CUSTOMIZATION_GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
    }
    if (element.type === "server-item" && element.server.gallery && (element.marketplace || !element.server.local)) {
      return 62;
    }
    if (element.type === "server-item" && element.server.description?.trim()) {
      return MCP_ITEM_WITH_DESCRIPTION_HEIGHT;
    }
    if (element.type === "builtin-item" && element.description) {
      return MCP_ITEM_WITH_DESCRIPTION_HEIGHT;
    }
    return MCP_ITEM_HEIGHT;
  }
  getTemplateId(element) {
    if (element.type === "group-header") {
      return "mcpGroupHeader";
    }
    if (element.type === "builtin-item") {
      return "mcpServerItem";
    }
    if (element.type === "session-server-item") {
      return "mcpServerItem";
    }
    const server = element.server;
    return server.gallery && (element.marketplace || !server.local) ? MCP_GALLERY_ITEM_TEMPLATE_ID : "mcpServerItem";
  }
}
let McpServerItemRenderer = class {
  constructor(_afterShowOutput, workspaceService, agentPluginService, hoverService, agentHostCustomizationService, customizationHarnessService, outputService) {
    this._afterShowOutput = _afterShowOutput;
    this.workspaceService = workspaceService;
    this.agentPluginService = agentPluginService;
    this.hoverService = hoverService;
    this.agentHostCustomizationService = agentHostCustomizationService;
    this.customizationHarnessService = customizationHarnessService;
    this.outputService = outputService;
    this.templateId = "mcpServerItem";
  }
  renderTemplate(container) {
    container.classList.add("mcp-server-item");
    const typeIcon = DOM.append(container, $(".mcp-server-icon"));
    typeIcon.classList.add(...ThemeIcon.asClassNameArray(mcpServerIcon));
    const details = DOM.append(container, $(".mcp-server-details"));
    const nameRow = DOM.append(details, $(".mcp-server-name-row"));
    const name = DOM.append(nameRow, $(".mcp-server-name"));
    const description = DOM.append(details, $(".mcp-server-description"));
    const actions = DOM.append(container, $(".mcp-server-actions"));
    return {
      container,
      typeIcon,
      name,
      description,
      actions,
      elementDisposables: new DisposableStore(),
      actionDisposables: new DisposableStore()
    };
  }
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionDisposables.clear();
    if (element.type === "builtin-item") {
      templateData.container.classList.add("builtin");
      templateData.container.classList.toggle("has-detail", false);
      templateData.name.textContent = formatDisplayName(element.label);
      if (element.description) {
        templateData.description.textContent = truncateToFirstLine(element.description);
        templateData.description.style.display = "";
      } else {
        templateData.description.textContent = "";
        templateData.description.style.display = "none";
      }
      this.updateKnownServerStatus(templateData, element);
      const pluginUriStr = getPluginUriFromCollectionId(element.collectionId);
      if (pluginUriStr) {
        templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.container, () => {
          const plugin = this.agentPluginService.plugins.get().find((p) => p.uri.toString() === pluginUriStr);
          if (plugin) {
            return {
              content: `${element.label}
${localize("fromPlugin", "Plugin: {0}", plugin.label)}`,
              appearance: { compact: true, skipFadeInAnimation: true }
            };
          }
          return { content: element.label, appearance: { compact: true, skipFadeInAnimation: true } };
        }));
      }
      return;
    }
    if (element.type === "session-server-item") {
      templateData.container.classList.remove("builtin");
      templateData.container.classList.toggle("has-detail", false);
      templateData.name.textContent = formatDisplayName(element.server.name);
      templateData.description.textContent = "";
      templateData.description.style.display = "none";
      this.updateActiveSessionStatus(templateData, element);
      return;
    }
    templateData.container.classList.remove("builtin");
    templateData.name.textContent = formatDisplayName(element.server.label);
    const description = element.server.description?.trim();
    const isGallery = !element.server.local;
    const hasDetail = !!description || isGallery;
    templateData.container.classList.toggle("has-detail", hasDetail);
    if (description) {
      templateData.description.textContent = truncateToFirstLine(description);
      templateData.description.style.display = "";
    } else {
      templateData.description.textContent = "";
      templateData.description.style.display = "none";
    }
    if (element.activeSessionServer) {
      this.updateKnownServerStatus(templateData, element);
    } else if (this.workspaceService.isSessionsWindow) {
      this.updateKnownServerStatus(templateData, element);
    } else {
      templateData.elementDisposables.add(autorun((reader) => {
        const disabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
        const connectionState = element.localServer?.connectionState.read(reader);
        templateData.container.classList.toggle("disabled", disabled);
        this.updateStatus(templateData, element, disabled ? "disabled" : connectionState?.state);
      }));
    }
  }
  updateKnownServerStatus(templateData, element) {
    templateData.elementDisposables.add(autorun((reader) => {
      const localDisabled = element.localServer ? isContributionDisabled(element.localServer.enablement.read(reader)) : false;
      const activeSessionServer = element.activeSessionServer;
      templateData.container.classList.toggle("disabled", localDisabled || activeSessionServer?.enabled === false);
      this.updateStatus(templateData, element, localDisabled ? "disabled" : activeSessionServer ? activeSessionServer.enabled ? activeSessionServer.status : "disabled" : void 0);
    }));
  }
  updateActiveSessionStatus(templateData, element) {
    const disabled = element.server.enabled === false;
    templateData.container.classList.toggle("disabled", disabled);
    this.updateStatus(templateData, element, disabled ? "disabled" : element.server.status);
  }
  updateStatus(templateData, element, state) {
    templateData.actionDisposables.clear();
    DOM.clearNode(templateData.actions);
    const presentation = getMcpStatusPresentation(state);
    if (!presentation) {
      return;
    }
    const activeSessionServer = getActiveSessionServer(element);
    const label = getMcpEntryLabel(element);
    const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
    const showActiveSessionOutput = activeSessionServer ? (beforeShow) => this.agentHostCustomizationService.showMcpServerLog(activeSessionResource, activeSessionServer.id, beforeShow) : void 0;
    if (state === McpServerStatus.AuthRequired && activeSessionServer) {
      const signInLabel = localize("signInToMcpServer", "Sign in to {0}", label);
      const signInButton = templateData.actionDisposables.add(new Button(templateData.actions, {
        ...defaultButtonStyles,
        secondary: true,
        small: true,
        title: signInLabel,
        ariaLabel: signInLabel
      }));
      signInButton.label = localize("signIn", "Sign In");
      signInButton.element.classList.add("mcp-server-sign-in");
      registerMcpInlineButtonAction(templateData.actionDisposables, signInButton, async () => {
        signInButton.enabled = false;
        try {
          await authenticateMcpServer(this.agentHostCustomizationService, this.customizationHarnessService.activeSessionResource.get(), activeSessionServer.id);
        } finally {
          signInButton.enabled = true;
        }
      });
    }
    if (!presentation.icon) {
      return;
    }
    const showOutput = state === McpServerStatus.Error || state === McpConnectionState.Kind.Error ? getMcpServerOutputHandler(this.outputService, element.type === "session-server-item" ? void 0 : element.localServer, activeSessionServer, this._afterShowOutput, showActiveSessionOutput) : void 0;
    if (showOutput) {
      const showOutputLabel = localize("showMcpServerOutput", "Show output for {0}", label);
      const statusButton = templateData.actionDisposables.add(new Button(templateData.actions, {
        title: showOutputLabel,
        ariaLabel: showOutputLabel
      }));
      statusButton.icon = presentation.icon;
      statusButton.element.classList.add("mcp-server-status", "mcp-server-status-action", presentation.className);
      registerMcpInlineButtonAction(templateData.actionDisposables, statusButton, showOutput);
      return;
    }
    const statusElement = DOM.append(templateData.actions, $(".mcp-server-status"));
    statusElement.classList.add(presentation.className, ...ThemeIcon.asClassNameArray(presentation.icon));
    statusElement.setAttribute("aria-hidden", "true");
    templateData.actionDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), statusElement, presentation.label));
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionDisposables.dispose();
  }
};
McpServerItemRenderer = __decorateClass([
  __decorateParam(1, IAICustomizationWorkspaceService),
  __decorateParam(2, IAgentPluginService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IAgentHostCustomizationService),
  __decorateParam(5, ICustomizationHarnessService),
  __decorateParam(6, IOutputService)
], McpServerItemRenderer);
function registerMcpInlineButtonAction(store, button, action) {
  store.add(DOM.addDisposableGenericMouseDownListener(button.element, (event) => DOM.EventHelper.stop(event, true)));
  store.add(button.onDidClick((event) => {
    DOM.EventHelper.stop(event, true);
    void action();
  }));
}
function authenticateMcpServer(agentHostCustomizationService, sessionResource, serverId) {
  return agentHostCustomizationService.authenticateMcpServer(sessionResource, serverId);
}
function getMcpServerOutputHandler(outputService, localServer, activeSessionServer, closeCustomizationEditor, showActiveSessionOutput) {
  const outputChannelId = activeSessionServer?.logOutputChannelId;
  if (showActiveSessionOutput) {
    return () => showActiveSessionOutput(closeCustomizationEditor);
  }
  if (outputChannelId) {
    return async () => {
      await closeCustomizationEditor?.();
      await outputService.showChannel(outputChannelId);
    };
  }
  if (localServer) {
    return async () => {
      await closeCustomizationEditor?.();
      await localServer.showOutput();
    };
  }
  return void 0;
}
function getMcpStatusPresentation(state) {
  if (state === void 0) {
    return void 0;
  }
  if (state === "disabled") {
    return { label: localize("disabled", "Disabled"), className: "disabled", icon: Codicon.circleSlash };
  }
  switch (state) {
    case McpConnectionState.Kind.Running:
    case McpServerStatus.Ready:
      return { label: localize("running", "Running"), className: "running", icon: Codicon.check };
    case McpConnectionState.Kind.Starting:
    case McpServerStatus.Starting:
      return { label: localize("starting", "Starting"), className: "starting", icon: ThemeIcon.modify(Codicon.loading, "spin") };
    case McpServerStatus.AuthRequired:
      return { label: localize("authRequired", "Authentication required"), className: "auth-required", icon: Codicon.account };
    case McpConnectionState.Kind.Error:
    case McpServerStatus.Error:
      return { label: localize("error", "Error"), className: "error", icon: Codicon.error };
    case McpConnectionState.Kind.Stopped:
    case McpServerStatus.Stopped:
    default:
      return { label: localize("stopped", "Stopped"), className: "stopped" };
  }
}
function getActiveSessionServer(entry) {
  return entry.type === "session-server-item" ? entry.server : entry.activeSessionServer;
}
function getMcpEntryLabel(element) {
  return element.type === "session-server-item" ? element.server.name : element.type === "builtin-item" ? element.label : element.server.label;
}
function getMcpStatusKind(entry, isSessionsWindow) {
  if (entry.type === "session-server-item") {
    return entry.server.enabled ? entry.server.status : "disabled";
  }
  if (entry.localServer && isContributionDisabled(entry.localServer.enablement.get())) {
    return "disabled";
  }
  if (entry.activeSessionServer) {
    return entry.activeSessionServer.enabled ? entry.activeSessionServer.status : "disabled";
  }
  if (entry.type === "server-item" && !isSessionsWindow) {
    return entry.localServer?.connectionState.get().state;
  }
  return void 0;
}
function getMcpEntryAriaLabel(element, isSessionsWindow) {
  if (element.type === "group-header") {
    return localize("mcpGroupAriaLabel", "{0}, {1} items, {2}", element.label, element.count, element.collapsed ? localize("collapsed", "collapsed") : localize("expanded", "expanded"));
  }
  const label = getMcpEntryLabel(element);
  const status = getMcpStatusPresentation(getMcpStatusKind(element, isSessionsWindow));
  return status ? localize("mcpServerAriaLabelWithStatus", "{0}, {1}", label, status.label) : label;
}
function normalizeMcpMatchKey(value) {
  return value || void 0;
}
function getUniqueMcpMatchKeys(values) {
  const keys = /* @__PURE__ */ new Set();
  for (const value of values) {
    const key = normalizeMcpMatchKey(value);
    if (key) {
      keys.add(key);
    }
  }
  return [...keys];
}
class ActiveSessionMcpServerMatcher {
  constructor(servers) {
    this.servers = servers;
    this.byKey = /* @__PURE__ */ new Map();
    this.matchedIds = /* @__PURE__ */ new Set();
    for (const server of servers) {
      const separator = server.id.indexOf("/");
      const rawId = separator >= 0 ? server.id.slice(separator + 1) : server.id;
      for (const key of getUniqueMcpMatchKeys([rawId, server.name])) {
        let bucket = this.byKey.get(key);
        if (!bucket) {
          bucket = [];
          this.byKey.set(key, bucket);
        }
        bucket.push(server);
      }
    }
  }
  take(keys) {
    for (const key of getUniqueMcpMatchKeys(keys)) {
      const matches = this.byKey.get(key)?.filter((server) => !this.matchedIds.has(server.id));
      if (matches?.length === 1) {
        this.matchedIds.add(matches[0].id);
        return matches[0];
      }
    }
    return void 0;
  }
  unmatched(query) {
    return this.servers.filter((server) => !this.matchedIds.has(server.id) && matchesActiveSessionServerQuery(server, query));
  }
}
class LocalMcpServerMatcher {
  constructor(servers) {
    this.byKey = /* @__PURE__ */ new Map();
    for (const server of servers) {
      for (const key of getRuntimeServerMatchKeys(server)) {
        let matches = this.byKey.get(key);
        if (!matches) {
          matches = [];
          this.byKey.set(key, matches);
        }
        matches.push(server);
      }
    }
  }
  find(keys) {
    for (const key of getUniqueMcpMatchKeys(keys)) {
      const matches = this.byKey.get(key);
      if (matches?.length === 1) {
        return matches[0];
      }
    }
    return void 0;
  }
}
function matchesActiveSessionServerQuery(server, query) {
  if (!query) {
    return true;
  }
  return server.name.toLowerCase().includes(query);
}
function getWorkbenchServerMatchKeys(server) {
  return getUniqueMcpMatchKeys([server.id, server.name, server.label]);
}
function getRuntimeServerMatchKeys(server) {
  return getUniqueMcpMatchKeys([server.definition.id, server.definition.label]);
}
function getActiveSessionServerLifecycleAction(server) {
  if (!server.enabled) {
    return void 0;
  }
  return server.status === McpServerStatus.Stopped || server.status === McpServerStatus.Error ? new Action(
    "mcpServer.activeSession.start",
    localize("activeSessionMcpServerStart", "Start Server"),
    void 0,
    true,
    () => server.start()
  ) : new Action(
    "mcpServer.activeSession.stop",
    localize("activeSessionMcpServerStop", "Stop Server"),
    void 0,
    true,
    () => server.stop()
  );
}
function getSessionEnablementAction(server) {
  return new Action(
    server.enabled ? "mcpServer.session.disable" : "mcpServer.session.enable",
    server.enabled ? localize("sessionMcpServerDisable", "Disable (Session)") : localize("sessionMcpServerEnable", "Enable (Session)"),
    void 0,
    true,
    () => {
      server.setEnabled(!server.enabled);
      return Promise.resolve();
    }
  );
}
function getAgentHostMcpServerEnablementActions(agentHostCustomizations, sessionResource, server, isEmptyWorkbench) {
  const disabled = isContributionDisabled(agentHostCustomizations.getMcpServerEnablement(sessionResource, server.name));
  const actions = [];
  if (disabled) {
    actions.push(new Action("mcpServer.agentHost.enable", localize("agentHostMcpServerEnable", "Enable"), void 0, true, () => {
      agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.EnabledProfile);
    }));
    if (!isEmptyWorkbench) {
      actions.push(new Action("mcpServer.agentHost.enableWorkspace", localize("agentHostMcpServerEnableForWorkspace", "Enable (Workspace)"), void 0, true, () => {
        agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.EnabledWorkspace);
      }));
    }
  } else {
    actions.push(new Action("mcpServer.agentHost.disable", localize("agentHostMcpServerDisable", "Disable"), void 0, true, () => {
      agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.DisabledProfile);
    }));
    if (!isEmptyWorkbench) {
      actions.push(new Action("mcpServer.agentHost.disableWorkspace", localize("agentHostMcpServerDisableForWorkspace", "Disable (Workspace)"), void 0, true, () => {
        agentHostCustomizations.setMcpServerEnablement(sessionResource, server.name, ContributionEnablementState.DisabledWorkspace);
      }));
    }
  }
  return actions;
}
function getLocalMcpServerEnablementActions(mcpService, serverId, isEmptyWorkbench) {
  const disabled = isContributionDisabled(mcpService.enablementModel.readEnabled(serverId));
  const actions = [];
  if (disabled) {
    actions.push(new Action("mcpServer.builtin.enable", localize("builtinMcpServerEnable", "Enable"), void 0, true, () => {
      mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledProfile);
    }));
    if (!isEmptyWorkbench) {
      actions.push(new Action("mcpServer.builtin.enableWorkspace", localize("builtinMcpServerEnableForWorkspace", "Enable (Workspace)"), void 0, true, () => {
        mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.EnabledWorkspace);
      }));
    }
  } else {
    actions.push(new Action("mcpServer.builtin.disable", localize("builtinMcpServerDisable", "Disable"), void 0, true, () => {
      mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledProfile);
    }));
    if (!isEmptyWorkbench) {
      actions.push(new Action("mcpServer.builtin.disableWorkspace", localize("builtinMcpServerDisableForWorkspace", "Disable (Workspace)"), void 0, true, () => {
        mcpService.enablementModel.setEnabled(serverId, ContributionEnablementState.DisabledWorkspace);
      }));
    }
  }
  return actions;
}
function getActiveSessionServerOptionsActions(commandService, agentHostCustomizations, isEmptyWorkbench, sessionResource, server) {
  const actions = [];
  const lifecycleAction = getActiveSessionServerLifecycleAction(server);
  if (lifecycleAction) {
    actions.push(lifecycleAction);
  }
  const durableActions = getAgentHostMcpServerEnablementActions(agentHostCustomizations, sessionResource, server, isEmptyWorkbench);
  if (durableActions.length > 0) {
    if (actions.length > 0) {
      actions.push(new Separator());
    }
    actions.push(...durableActions);
  }
  actions.push(getSessionEnablementAction(server));
  actions.push(new Separator());
  actions.push(new Action(
    "mcpServer.activeSession.options",
    localize("activeSessionMcpServerOptions", "Server Options"),
    void 0,
    true,
    async () => {
      await commandService.executeCommand(McpCommandIds.AgentHostServerOptions, sessionResource, server.id);
    }
  ));
  return actions;
}
function shouldHideLocalActionForActiveSessionServer(action) {
  return action instanceof StartServerAction || action instanceof StopServerAction || action instanceof RestartServerAction || action instanceof ConfigureModelAccessAction || action instanceof ShowSamplingRequestsAction;
}
function isLocalMcpServerEnablementAction(action) {
  return action instanceof EnableMcpServerGloballyAction || action instanceof EnableMcpServerForWorkspaceAction || action instanceof DisableMcpServerGloballyAction || action instanceof DisableMcpServerForWorkspaceAction;
}
function createBuiltinEntry(server, activeSessionServer) {
  return {
    type: "builtin-item",
    id: `builtin-${server.definition.id}`,
    label: server.definition.label,
    description: "",
    collectionId: server.collection.id,
    activeSessionServer,
    localServer: server
  };
}
const MCP_GALLERY_ITEM_TEMPLATE_ID = "mcpGalleryItem";
class McpGalleryItemProvider {
  constructor(mcpWorkbenchService) {
    this.mcpWorkbenchService = mcpWorkbenchService;
  }
  getLabel(element) {
    return element.server.label;
  }
  getPublisherDisplayName(element) {
    return element.server.publisherDisplayName;
  }
  getDescription(element) {
    return element.server.description;
  }
  getInstallState(element) {
    switch (element.server.installState) {
      case McpServerInstallState.Installed:
        return GalleryItemInstallState.Installed;
      case McpServerInstallState.Installing:
        return GalleryItemInstallState.Installing;
      default:
        return GalleryItemInstallState.Uninstalled;
    }
  }
  canInstall(element) {
    return this.mcpWorkbenchService.canInstall(element.server) === true;
  }
  async install(element) {
    await this.mcpWorkbenchService.install(element.server);
  }
  onDidChangeInstallState(element, listener) {
    return this.mcpWorkbenchService.onChange((changed) => {
      if (!changed || changed.id === element.server.id) {
        listener();
      }
    });
  }
}
let McpListWidget = class extends Disposable {
  constructor(instantiationService, mcpWorkbenchService, mcpService, mcpRegistry, commandService, openerService, contextViewService, contextMenuService, hoverService, agentPluginService, dialogService, configurationService, customizationHarnessService, agentHostCustomizationService, workspaceService) {
    super();
    this.instantiationService = instantiationService;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.mcpService = mcpService;
    this.mcpRegistry = mcpRegistry;
    this.commandService = commandService;
    this.openerService = openerService;
    this.contextViewService = contextViewService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.agentPluginService = agentPluginService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.customizationHarnessService = customizationHarnessService;
    this.agentHostCustomizationService = agentHostCustomizationService;
    this.workspaceService = workspaceService;
    this._onDidSelectServer = this._register(new Emitter());
    this.onDidSelectServer = this._onDidSelectServer.event;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this._onDidRequestShowPlugin = this._register(new Emitter());
    this.onDidRequestShowPlugin = this._onDidRequestShowPlugin.event;
    this.disabledLinkListener = this._register(new MutableDisposable());
    this.filteredServers = [];
    this.filteredBuiltinCount = 0;
    this.filteredActiveSessionCount = 0;
    this.displayEntries = [];
    this.galleryServers = [];
    this.searchQuery = "";
    this.browseMode = false;
    this.lastHeight = 0;
    this.lastWidth = 0;
    this.lastHeaderHeight = 0;
    this._layoutDeferred = false;
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this.delayedFilter = new Delayer(200);
    this.delayedGallerySearch = new Delayer(400);
    this._closeCustomizationEditor = () => Promise.resolve();
    this.element = $(".mcp-list-widget");
    this.create();
    this.updateAccessState();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(mcpAccessConfig)) {
        this.updateAccessState();
      }
    }));
    this._register({
      dispose: () => {
        this.galleryCts?.dispose();
      }
    });
  }
  setCloseCustomizationEditor(closeCustomizationEditor) {
    this._closeCustomizationEditor = closeCustomizationEditor;
  }
  create() {
    this.sectionTitleHeader = DOM.append(this.element, $(".section-title-header"));
    const titleRow = DOM.append(this.sectionTitleHeader, $(".section-title-row"));
    const sectionTitle = DOM.append(titleRow, $("h2.section-title"));
    sectionTitle.textContent = localize("mcpServers", "MCP Servers");
    const sectionTitleDescription = DOM.append(this.sectionTitleHeader, $("p.section-title-description"));
    const sectionTitleDescriptionText = DOM.append(sectionTitleDescription, $("span.section-title-description-text"));
    sectionTitleDescriptionText.textContent = localize("mcpServersDescription", "An open standard that lets AI use external tools and services. MCP servers provide tools for file operations, databases, APIs, and more.");
    sectionTitleDescription.appendChild(document.createTextNode(" "));
    this.sectionLink = DOM.append(sectionTitleDescription, $("a.section-title-link"));
    this.sectionLink.textContent = localize("learnMoreMcp", "Learn more about MCP servers");
    this.sectionLink.href = "https://code.visualstudio.com/docs/agent-customization/mcp-servers?referrer=in-product";
    this._register(DOM.addDisposableListener(this.sectionLink, "click", (e) => {
      e.preventDefault();
      const href = this.sectionLink.href;
      if (href) {
        this.openerService.open(URI.parse(href));
      }
    }));
    const targetWindow = DOM.getWindow(this.element);
    const headerObserver = this._register(new DOM.DisposableResizeObserver(
      "McpListWidget.sectionTitleHeader",
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
      placeholder: localize("searchMcpPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this._register(this.searchInput.onDidChange(() => {
      this.searchQuery = this.searchInput.value;
      if (this.browseMode) {
        this.delayedGallerySearch.trigger(() => this.queryGallery());
      } else {
        this.delayedFilter.trigger(() => this.filterServers());
      }
    }));
    const buttonContainer = DOM.append(this.searchAndButtonContainer, $(".list-button-group"));
    const backButtonContainer = DOM.append(buttonContainer, $(".list-add-button-container"));
    this.backButton = this._register(new Button(backButtonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true,
      title: localize("backToInstalled", "Back to installed servers"),
      ariaLabel: localize("backToInstalled", "Back to installed servers")
    }));
    this.backButton.label = `$(${Codicon.arrowLeft.id}) ${localize("mcpBrowseBack", "Back")}`;
    this.backButton.element.classList.add("list-add-button");
    backButtonContainer.style.display = "none";
    this._register(this.backButton.onDidClick(() => {
      this.toggleBrowseMode(false);
    }));
    const browseButtonContainer = DOM.append(buttonContainer, $(".list-add-button-container"));
    this.browseButton = this._register(new Button(browseButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this.browseButton.label = `$(${Codicon.library.id}) ${localize("browseMarketplace", "Browse Marketplace")}`;
    this.browseButton.element.classList.add("list-add-button");
    this._register(this.browseButton.onDidClick(() => {
      this.toggleBrowseMode(!this.browseMode);
    }));
    this.addButton = this._register(new Button(buttonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true,
      title: localize("addServer", "Add Server"),
      ariaLabel: localize("addServer", "Add Server")
    }));
    this.addButton.label = `$(${Codicon.add.id})`;
    this.addButton.element.classList.add("list-icon-button");
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.addButton.element, localize("addServerTooltip", "Add Server")));
    this._register(this.addButton.onDidClick(() => {
      this.commandService.executeCommand(McpCommandIds.AddConfiguration);
    }));
    this.emptyContainer = DOM.append(this.element, $(".mcp-empty-state"));
    const emptyHeader = DOM.append(this.emptyContainer, $(".empty-state-header"));
    this.emptyText = DOM.append(emptyHeader, $(".empty-text"));
    this.emptySubtext = DOM.append(this.emptyContainer, $(".empty-subtext"));
    this.disabledContainer = DOM.append(this.element, $(".mcp-disabled-state"));
    const disabledHeader = DOM.append(this.disabledContainer, $(".empty-state-header"));
    this.disabledIcon = DOM.append(disabledHeader, $(".empty-icon"));
    const disabledText = DOM.append(disabledHeader, $(".empty-text"));
    disabledText.textContent = localize("mcpAccessDisabledTitle", "MCP servers are disabled");
    this.disabledMessage = DOM.append(this.disabledContainer, $(".empty-subtext"));
    this.listContainer = DOM.append(this.element, $(".mcp-list-container"));
    const delegate = new McpServerItemDelegate();
    const groupHeaderRenderer = new CustomizationGroupHeaderRenderer("mcpGroupHeader", this.hoverService);
    const localRenderer = this.instantiationService.createInstance(McpServerItemRenderer, () => this._closeCustomizationEditor());
    const galleryRenderer = new GalleryItemRenderer(MCP_GALLERY_ITEM_TEMPLATE_ID, new McpGalleryItemProvider(this.mcpWorkbenchService));
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "McpManagementList",
      this.listContainer,
      delegate,
      [groupHeaderRenderer, localRenderer, galleryRenderer],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (element) => {
            return getMcpEntryAriaLabel(element, this.workspaceService.isSessionsWindow);
          },
          getWidgetAriaLabel() {
            return localize("mcpServersListAriaLabel", "MCP Servers");
          }
        },
        openOnSingleClick: true,
        identityProvider: {
          getId(element) {
            if (element.type === "group-header") {
              return element.id;
            }
            if (element.type === "builtin-item") {
              return element.id;
            }
            return element.server.id;
          },
          getGroupId(element) {
            return element.type === "group-header" ? NotSelectableGroupId : 0;
          }
        }
      }
    ));
    this._register(this.list.onDidOpen((e) => {
      if (e.element) {
        if (e.element.type === "group-header") {
          this.toggleGroup(e.element);
        } else if (e.element.type === "server-item") {
          const server = e.element.server;
          const isGallery = e.element.marketplace || !server.local;
          if (isGallery || server.description) {
            this._onDidSelectServer.fire(server);
          }
        } else if (e.element.type === "session-server-item") {
          this.openActiveSessionServerOptions(e.element.server);
        }
      }
    }));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.mcpWorkbenchService.onChange(() => {
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    this._register(autorun((reader) => {
      this.mcpService.servers.read(reader);
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    this._register(autorun((reader) => {
      this.customizationHarnessService.activeSessionResource.read(reader);
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    this._register(this.agentHostCustomizationService.onDidChangeCustomizations(() => {
      if (!this.browseMode) {
        this.refresh();
      }
    }));
    void this.refresh();
  }
  async refresh() {
    if (this.browseMode) {
      await this.queryGallery();
    } else {
      this.filterServers();
    }
  }
  updateAccessState() {
    const inspect = this.configurationService.inspect(mcpAccessConfig);
    const value = inspect.value ?? inspect.defaultValue;
    const disabled = value === McpAccessValue.None;
    const policyLocked = inspect.policyValue === McpAccessValue.None;
    this.element.classList.toggle("access-disabled", disabled);
    if (disabled) {
      this.disabledIcon.className = "empty-icon";
      this.disabledIcon.classList.add(...ThemeIcon.asClassNameArray(policyLocked ? Codicon.shield : mcpServerIcon));
      DOM.clearNode(this.disabledMessage);
      this.disabledLinkListener.clear();
      if (policyLocked) {
        this.disabledMessage.textContent = localize("mcpAccessDisabledByPolicy", "Access to MCP servers is disabled by your organization. Contact your organization administrator for more information.");
      } else {
        this.disabledMessage.appendChild(document.createTextNode(localize("mcpAccessDisabledBySettingPrefix", "MCP servers are disabled in settings. ")));
        const link = DOM.append(this.disabledMessage, $("a.mcp-disabled-settings-link"));
        link.textContent = localize("mcpAccessDisabledSettingLink", "Configure in settings.");
        link.href = "#";
        link.setAttribute("role", "button");
        this.disabledLinkListener.value = DOM.addDisposableListener(link, "click", (e) => {
          e.preventDefault();
          this.commandService.executeCommand("workbench.action.openSettings", `@id:${mcpAccessConfig}`);
        });
      }
    }
  }
  showBrowseMarketplace() {
    if (!this.browseMode) {
      this.toggleBrowseMode(true);
    }
  }
  toggleBrowseMode(browse) {
    this.browseMode = browse;
    this.searchInput.value = "";
    this.searchQuery = "";
    this.addButton.element.style.display = browse ? "none" : "";
    this.browseButton.element.parentElement.style.display = browse ? "none" : "";
    this.backButton.element.parentElement.style.display = browse ? "" : "none";
    this.searchInput.setPlaceHolder(
      browse ? localize("searchGalleryPlaceholder", "Search MCP marketplace...") : localize("searchMcpPlaceholder", "Type to search...")
    );
    if (browse) {
      void this.queryGallery();
    } else {
      this.galleryCts?.dispose(true);
      this.galleryServers = [];
      this.filterServers();
    }
    if (this.lastHeight > 0) {
      this.layout(this.lastHeight, this.lastWidth);
    }
  }
  async queryGallery() {
    this.galleryCts?.dispose(true);
    const cts = this.galleryCts = new CancellationTokenSource();
    this.emptyContainer.style.display = "flex";
    this.listContainer.style.display = "none";
    this.emptyText.textContent = localize("loadingGallery", "Loading marketplace...");
    this.emptySubtext.textContent = "";
    try {
      const pager = await this.mcpWorkbenchService.queryGallery(
        { text: this.searchQuery.trim() || void 0 },
        cts.token
      );
      if (cts.token.isCancellationRequested) {
        return;
      }
      this.galleryServers = pager.firstPage.items;
      this.updateGalleryList();
    } catch {
      if (!cts.token.isCancellationRequested) {
        this.galleryServers = [];
        this.emptyContainer.style.display = "flex";
        this.listContainer.style.display = "none";
        this.emptyText.textContent = localize("galleryError", "Unable to load marketplace");
        this.emptySubtext.textContent = localize("tryAgainLater", "Check your connection and try again");
      }
    }
  }
  updateGalleryList() {
    if (this.galleryServers.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noGalleryResults", "No servers match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        this.emptyText.textContent = localize("emptyGallery", "No MCP servers available");
        this.emptySubtext.textContent = "";
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const entries = this.galleryServers.map((server) => ({ type: "server-item", server, marketplace: true }));
    this.list.splice(0, this.list.length, entries);
  }
  filterServers() {
    const query = this.searchQuery.toLowerCase().trim();
    const activeSessionResource = this.customizationHarnessService.activeSessionResource.get();
    const activeSessionMatcher = new ActiveSessionMcpServerMatcher(this.agentHostCustomizationService.getMcpServers(activeSessionResource));
    const localServerMatcher = new LocalMcpServerMatcher(this.mcpService.servers.get());
    if (query) {
      this.filteredServers = this.mcpWorkbenchService.local.filter(
        (server) => server.label.toLowerCase().includes(query) || server.description?.toLowerCase().includes(query)
      );
    } else {
      this.filteredServers = [...this.mcpWorkbenchService.local];
    }
    const localIds = new Set(this.filteredServers.map((s) => s.id));
    const builtinServers = this.mcpService.servers.get().filter((s) => !localIds.has(s.definition.id)).filter((s) => !query || s.definition.label.toLowerCase().includes(query));
    const groups = [
      { scope: LocalMcpServerScope.Workspace, label: localize("workspaceGroup", "Workspace"), icon: workspaceIcon, description: localize("workspaceGroupDescription", "MCP servers configured in your workspace or reported by the active session."), entries: [] },
      { scope: LocalMcpServerScope.User, label: localize("userGroup", "User"), icon: userIcon, description: localize("userGroupDescription", "MCP servers configured in your user settings. Private to you and available across all projects."), entries: [] }
    ];
    for (const server of this.filteredServers) {
      const entry = {
        type: "server-item",
        server,
        activeSessionServer: activeSessionMatcher.take(getWorkbenchServerMatchKeys(server)),
        localServer: localServerMatcher.find(getWorkbenchServerMatchKeys(server))
      };
      const scope = server.local?.scope;
      if (scope === LocalMcpServerScope.Workspace) {
        groups[0].entries.push(entry);
      } else {
        groups[1].entries.push(entry);
      }
    }
    const collectionSources = new Map(this.mcpRegistry.collections.get().map((c) => [c.id, c.source]));
    const pluginServers = [];
    const extensionServers = [];
    const otherBuiltinServers = [];
    for (const server of builtinServers) {
      const entry = { server, activeSessionServer: activeSessionMatcher.take(getRuntimeServerMatchKeys(server)) };
      const source = collectionSources.get(server.collection.id);
      if (server.collection.id.startsWith(PLUGIN_COLLECTION_PREFIX)) {
        pluginServers.push(entry);
      } else if (source instanceof ExtensionIdentifier && !isCopilotExtension(source)) {
        extensionServers.push(entry);
      } else {
        otherBuiltinServers.push(entry);
      }
    }
    const activeSessionOnlyServers = activeSessionMatcher.unmatched(query);
    for (const server of activeSessionOnlyServers) {
      groups[0].entries.push({ type: "session-server-item", server });
    }
    if (this.filteredServers.length === 0 && builtinServers.length === 0 && activeSessionOnlyServers.length === 0) {
      this.emptyContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyText.textContent = localize("noMatchingServers", "No servers match '{0}'", this.searchQuery);
        this.emptySubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        this.emptyText.textContent = localize("noMcpServers", "No MCP servers configured");
        this.emptySubtext.textContent = localize("addMcpServer", "Add an MCP server configuration to get started");
      }
    } else {
      this.emptyContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
    const entries = [];
    let isFirst = true;
    for (const group of groups) {
      if (group.entries.length === 0) {
        continue;
      }
      const collapsed = this.collapsedGroups.has(group.scope);
      entries.push({
        type: "group-header",
        id: `mcp-group-${group.scope}`,
        scope: group.scope,
        label: group.label,
        icon: group.icon,
        count: group.entries.length,
        isFirst,
        description: group.description,
        collapsed
      });
      if (!collapsed) {
        entries.push(...group.entries);
      }
      isFirst = false;
    }
    if (pluginServers.length > 0) {
      const collapsed = this.collapsedGroups.has("plugin");
      entries.push({
        type: "group-header",
        id: "mcp-group-plugin",
        scope: "plugin",
        label: localize("pluginGroup", "Plugins"),
        icon: pluginIcon,
        count: pluginServers.length,
        isFirst,
        description: localize("pluginGroupDescription", "MCP servers provided by installed plugins."),
        collapsed
      });
      if (!collapsed) {
        for (const { server, activeSessionServer } of pluginServers) {
          entries.push(createBuiltinEntry(server, activeSessionServer));
        }
      }
      isFirst = false;
    }
    if (extensionServers.length > 0) {
      const collapsed = this.collapsedGroups.has("extension");
      entries.push({
        type: "group-header",
        id: "mcp-group-extension",
        scope: "extension",
        label: localize("extensionGroup", "Extensions"),
        icon: extensionIcon,
        count: extensionServers.length,
        isFirst,
        description: localize("extensionGroupDescription", "MCP servers contributed by installed VS Code extensions."),
        collapsed
      });
      if (!collapsed) {
        for (const { server, activeSessionServer } of extensionServers) {
          entries.push(createBuiltinEntry(server, activeSessionServer));
        }
      }
      isFirst = false;
    }
    if (otherBuiltinServers.length > 0) {
      const collapsed = this.collapsedGroups.has("builtin");
      entries.push({
        type: "group-header",
        id: "mcp-group-builtin",
        scope: "builtin",
        label: localize("builtInGroup", "Built-in"),
        icon: builtinIcon,
        count: otherBuiltinServers.length,
        isFirst,
        description: localize("builtInGroupDescription", "MCP servers built into VS Code. These are available automatically."),
        collapsed
      });
      if (!collapsed) {
        for (const { server, activeSessionServer } of otherBuiltinServers) {
          entries.push(createBuiltinEntry(server, activeSessionServer));
        }
      }
      isFirst = false;
    }
    this.displayEntries = entries;
    this.list.splice(0, this.list.length, this.displayEntries);
    this.filteredBuiltinCount = builtinServers.length;
    this.filteredActiveSessionCount = activeSessionOnlyServers.length;
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  /**
   * Gets the total item count from the underlying data arrays
   * (the same source used to build group headers).
   */
  get itemCount() {
    return this.filteredServers.length + this.filteredBuiltinCount + this.filteredActiveSessionCount;
  }
  /**
   * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
   * to ensure the subscriber receives the latest count.
   */
  fireItemCount() {
    this._onDidChangeItemCount.fire(this.itemCount);
  }
  /**
   * Toggles the collapsed state of a group.
   */
  toggleGroup(entry) {
    if (this.collapsedGroups.has(entry.scope)) {
      this.collapsedGroups.delete(entry.scope);
    } else {
      this.collapsedGroups.add(entry.scope);
    }
    this.filterServers();
  }
  /**
   * Whether the widget is currently in marketplace browse mode.
   */
  isInBrowseMode() {
    return this.browseMode;
  }
  /**
   * Exits marketplace browse mode and returns to the installed servers list.
   */
  exitBrowseMode() {
    if (this.browseMode) {
      this.toggleBrowseMode(false);
    }
  }
  /**
   * Layouts the widget.
   */
  layout(height, width) {
    this.lastHeight = height;
    this.lastWidth = width;
    this.element.style.height = "";
    const availableHeight = this.element.clientHeight || height;
    const availableWidth = this.element.clientWidth || width;
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
    const listHeight = Math.max(0, availableHeight - searchBarHeight - headerHeight);
    this.listContainer.style.height = `${listHeight}px`;
    this.list.layout(listHeight, availableWidth);
  }
  /**
   * Focuses the search input.
   */
  focusSearch() {
    this.searchInput.focus();
  }
  /**
   * Scrolls the list so the last item is visible.
   */
  revealLastItem() {
    if (this.list.length > 0) {
      this.list.reveal(this.list.length - 1);
    }
  }
  /**
   * Focuses the list.
   */
  focus() {
    this.list.domFocus();
    const servers = this.list.length;
    if (servers > 0) {
      this.list.setFocus([0]);
    }
  }
  openActiveSessionServerOptions(server) {
    void this.commandService.executeCommand(McpCommandIds.AgentHostServerOptions, this.customizationHarnessService.activeSessionResource.get(), server.id);
  }
  /**
   * Handles context menu for MCP server items.
   */
  onContextMenu(e) {
    if (!e.element) {
      return;
    }
    if (e.element.type === "session-server-item") {
      const disposables2 = new DisposableStore();
      const isEmptyWorkbench = this.workspaceService.getActiveProjectRoot() === void 0;
      const activeSessionActions = getActiveSessionServerOptionsActions(this.commandService, this.agentHostCustomizationService, isEmptyWorkbench, this.customizationHarnessService.activeSessionResource.get(), e.element.server);
      activeSessionActions.forEach((action) => isDisposable(action) && disposables2.add(action));
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => activeSessionActions,
        onHide: () => disposables2.dispose()
      });
      return;
    }
    if (e.element.type === "builtin-item") {
      const collectionId = e.element.collectionId;
      const pluginUriStr = getPluginUriFromCollectionId(collectionId);
      const plugin = pluginUriStr ? this.agentPluginService.plugins.get().find((p) => p.uri.toString() === pluginUriStr) : void 0;
      const disposables2 = new DisposableStore();
      const actions2 = [];
      const lifecycleAction = e.element.activeSessionServer ? getActiveSessionServerLifecycleAction(e.element.activeSessionServer) : void 0;
      if (lifecycleAction) {
        actions2.push(disposables2.add(lifecycleAction));
      }
      if (e.element.localServer) {
        const isEmptyWorkbench = this.workspaceService.getActiveProjectRoot() === void 0;
        const enablementActions = getLocalMcpServerEnablementActions(this.mcpService, e.element.localServer.definition.id, isEmptyWorkbench);
        if (enablementActions.length > 0) {
          if (actions2.length > 0) {
            actions2.push(new Separator());
          }
          for (const enablementAction of enablementActions) {
            if (isDisposable(enablementAction)) {
              disposables2.add(enablementAction);
            }
            actions2.push(enablementAction);
          }
        }
      }
      if (e.element.activeSessionServer) {
        const sessionAction = getSessionEnablementAction(e.element.activeSessionServer);
        if (isDisposable(sessionAction)) {
          disposables2.add(sessionAction);
        }
        actions2.push(sessionAction);
      }
      if (plugin) {
        if (actions2.length > 0) {
          actions2.push(new Separator());
        }
        actions2.push(disposables2.add(new Action(
          "mcpServer.showPlugin",
          localize("showPlugin", "Show Plugin"),
          void 0,
          true,
          async () => {
            const item = {
              kind: AgentPluginItemKind.Installed,
              name: plugin.label,
              description: plugin.fromMarketplace?.description ?? "",
              marketplace: plugin.fromMarketplace?.marketplace,
              plugin
            };
            this._onDidRequestShowPlugin.fire(item);
          }
        )));
        actions2.push(disposables2.add(new Action(
          "mcpServer.uninstallPlugin",
          localize("uninstallPlugin", "Uninstall Plugin"),
          void 0,
          true,
          async () => {
            const result = await this.dialogService.confirm({
              message: localize("confirmUninstallPluginMcp", "This MCP server is provided by the plugin '{0}'", plugin.label),
              detail: localize("confirmUninstallPluginMcpDetail", "Individual MCP servers from a plugin cannot be removed separately. Would you like to uninstall the entire plugin?"),
              primaryButton: localize("uninstallPluginBtn", "Uninstall Plugin"),
              type: "question"
            });
            if (result.confirmed) {
              plugin.remove?.();
            }
          }
        )));
      }
      if (actions2.length === 0) {
        disposables2.dispose();
        return;
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions2,
        onHide: () => disposables2.dispose()
      });
      return;
    }
    if (e.element.type !== "server-item") {
      return;
    }
    const serverEntry = e.element;
    const disposables = new DisposableStore();
    const mcpServer = this.mcpWorkbenchService.local.find((local) => local.id === serverEntry.server.id) || serverEntry.server;
    const groups = getContextMenuActions(mcpServer, false, this.instantiationService);
    const actions = [];
    const activeSessionLifecycleAction = serverEntry.activeSessionServer ? getActiveSessionServerLifecycleAction(serverEntry.activeSessionServer) : void 0;
    const activeSessionEnablementAction = serverEntry.activeSessionServer ? getSessionEnablementAction(serverEntry.activeSessionServer) : void 0;
    let sessionEnablementAdded = false;
    if (activeSessionLifecycleAction) {
      actions.push(disposables.add(activeSessionLifecycleAction));
      actions.push(new Separator());
    }
    if (activeSessionEnablementAction && isDisposable(activeSessionEnablementAction)) {
      disposables.add(activeSessionEnablementAction);
    }
    for (const menuActions of groups) {
      for (const menuAction of menuActions) {
        if (isDisposable(menuAction)) {
          disposables.add(menuAction);
        }
      }
      const visibleMenuActions = serverEntry.activeSessionServer ? menuActions.filter((action) => !shouldHideLocalActionForActiveSessionServer(action)) : menuActions;
      for (const menuAction of visibleMenuActions) {
        actions.push(menuAction);
      }
      if (activeSessionEnablementAction && menuActions.some(isLocalMcpServerEnablementAction)) {
        actions.push(activeSessionEnablementAction);
        sessionEnablementAdded = true;
      }
      if (visibleMenuActions.length > 0) {
        actions.push(new Separator());
      }
    }
    if (activeSessionEnablementAction && !sessionEnablementAdded) {
      actions.push(activeSessionEnablementAction);
    }
    if (actions.length > 0 && actions[actions.length - 1] instanceof Separator) {
      actions.pop();
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions,
      onHide: () => disposables.dispose()
    });
  }
};
McpListWidget = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, IMcpService),
  __decorateParam(3, IMcpRegistry),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IContextViewService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IAgentPluginService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, ICustomizationHarnessService),
  __decorateParam(13, IAgentHostCustomizationService),
  __decorateParam(14, IAICustomizationWorkspaceService)
], McpListWidget);
export {
  McpListWidget,
  authenticateMcpServer,
  getActiveSessionServerOptionsActions,
  getAgentHostMcpServerEnablementActions,
  getLocalMcpServerEnablementActions,
  getMcpServerOutputHandler,
  getSessionEnablementAction,
  registerMcpInlineButtonAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vbWNwTGlzdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGlzRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciwgSUxpc3RDb250ZXh0TWVudUV2ZW50LCBOb3RTZWxlY3RhYmxlR3JvdXBJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTWNwV29ya2JlbmNoU2VydmljZSwgSVdvcmtiZW5jaE1jcFNlcnZlciwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUsIElNY3BTZXJ2aWNlLCBJTWNwU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL21jcC9jb21tb24vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBNQ1BfUExVR0lOX0NPTExFQ1RJT05fSURfUFJFRklYIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9kaXNjb3ZlcnkvcGx1Z2luTWNwRGlzY292ZXJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSwgaXNDb250cmlidXRpb25EaXNhYmxlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IE1jcENvbW1hbmRJZHMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyZU1vZGVsQWNjZXNzQWN0aW9uLCBEaXNhYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uLCBEaXNhYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24sIEVuYWJsZU1jcFNlcnZlckZvcldvcmtzcGFjZUFjdGlvbiwgRW5hYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24sIGdldENvbnRleHRNZW51QWN0aW9ucywgUmVzdGFydFNlcnZlckFjdGlvbiwgU2hvd1NhbXBsaW5nUmVxdWVzdHNBY3Rpb24sIFN0YXJ0U2VydmVyQWN0aW9uLCBTdG9wU2VydmVyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9tY3AvYnJvd3Nlci9tY3BTZXJ2ZXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IExvY2FsTWNwU2VydmVyU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9tY3AvY29tbW9uL21jcFdvcmtiZW5jaE1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IHdvcmtzcGFjZUljb24sIHVzZXJJY29uLCBtY3BTZXJ2ZXJJY29uLCBidWlsdGluSWNvbiwgcGx1Z2luSWNvbiwgZXh0ZW5zaW9uSWNvbiB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSWNvbnMuanMnO1xuaW1wb3J0IHsgZm9ybWF0RGlzcGxheU5hbWUsIHRydW5jYXRlVG9GaXJzdExpbmUgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbkxpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uR3JvdXBIZWFkZXJSZW5kZXJlciwgSUN1c3RvbWl6YXRpb25Hcm91cEhlYWRlckVudHJ5LCBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFQsIENVU1RPTUlaQVRJT05fR1JPVVBfSEVBREVSX0hFSUdIVF9XSVRIX1NFUEFSQVRPUiB9IGZyb20gJy4vY3VzdG9taXphdGlvbkdyb3VwSGVhZGVyUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5JdGVtS2luZCwgSUFnZW50UGx1Z2luSXRlbSB9IGZyb20gJy4uL2FnZW50UGx1Z2luRWRpdG9yL2FnZW50UGx1Z2luSXRlbXMuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZSwgR2FsbGVyeUl0ZW1SZW5kZXJlciwgSUdhbGxlcnlJdGVtUHJvdmlkZXIgfSBmcm9tICcuL2dhbGxlcnlJdGVtUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgTUNQX0lURU1fSEVJR0hUID0gMzY7XG5jb25zdCBNQ1BfSVRFTV9XSVRIX0RFU0NSSVBUSU9OX0hFSUdIVCA9IDQ0O1xuXG5jb25zdCBQTFVHSU5fQ09MTEVDVElPTl9QUkVGSVggPSBNQ1BfUExVR0lOX0NPTExFQ1RJT05fSURfUFJFRklYO1xuXG5jb25zdCBDT1BJTE9UX0VYVEVOU0lPTl9JRFMgPSBbJ2dpdGh1Yi5jb3BpbG90JywgJ2dpdGh1Yi5jb3BpbG90LWNoYXQnXTtcblxuZnVuY3Rpb24gaXNDb3BpbG90RXh0ZW5zaW9uKGlkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBDT1BJTE9UX0VYVEVOU0lPTl9JRFMuc29tZShjb3BpbG90SWQgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoaWQsIGNvcGlsb3RJZCkpO1xufVxuXG5mdW5jdGlvbiBnZXRQbHVnaW5VcmlGcm9tQ29sbGVjdGlvbklkKGNvbGxlY3Rpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGNvbGxlY3Rpb25JZD8uc3RhcnRzV2l0aChQTFVHSU5fQ09MTEVDVElPTl9QUkVGSVgpID8gY29sbGVjdGlvbklkLnNsaWNlKFBMVUdJTl9DT0xMRUNUSU9OX1BSRUZJWC5sZW5ndGgpIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBjb2xsYXBzaWJsZSBncm91cCBoZWFkZXIgaW4gdGhlIE1DUCBzZXJ2ZXIgbGlzdC5cbiAqL1xuaW50ZXJmYWNlIElNY3BHcm91cEhlYWRlckVudHJ5IGV4dGVuZHMgSUN1c3RvbWl6YXRpb25Hcm91cEhlYWRlckVudHJ5IHtcblx0cmVhZG9ubHkgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUgfCAnYnVpbHRpbicgfCAncGx1Z2luJyB8ICdleHRlbnNpb24nO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gaW5kaXZpZHVhbCBNQ1Agc2VydmVyIGl0ZW0gaW4gdGhlIGxpc3QuXG4gKi9cbmludGVyZmFjZSBJTWNwU2VydmVySXRlbUVudHJ5IHtcblx0cmVhZG9ubHkgdHlwZTogJ3NlcnZlci1pdGVtJztcblx0cmVhZG9ubHkgc2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyO1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uU2VydmVyPzogQWdlbnRIb3N0TWNwU2VydmVyO1xuXHRyZWFkb25seSBsb2NhbFNlcnZlcj86IElNY3BTZXJ2ZXI7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgZW50cnkgb3JpZ2luYXRlcyBmcm9tIGEgbWFya2V0cGxhY2UgYnJvd3NlIHJlc3VsdC4gTWFya2V0cGxhY2Ugcm93cyBhbHdheXMgdXNlXG5cdCAqIHRoZSBnYWxsZXJ5IHJvdyBwcmVzZW50YXRpb24gKHdpdGggYW4gSW5zdGFsbC9JbnN0YWxsZWQgYnV0dG9uKSwgZXZlbiB3aGVuIHRoZSBzZXJ2ZXIgaXNcblx0ICogYWxyZWFkeSBpbnN0YWxsZWQsIHNvIGluc3RhbGxlZCBhbmQgbm90LWluc3RhbGxlZCByZXN1bHRzIGxvb2sgY29uc2lzdGVudC5cblx0ICovXG5cdHJlYWRvbmx5IG1hcmtldHBsYWNlPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5IHtcblx0cmVhZG9ubHkgdHlwZTogJ3Nlc3Npb24tc2VydmVyLWl0ZW0nO1xuXHRyZWFkb25seSBzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlcjtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgYnVpbHQtaW4gTUNQIHNlcnZlciBwcm92aWRlZCBieSBhbiBleHRlbnNpb24gb3IgcGx1Z2luLlxuICovXG5pbnRlcmZhY2UgSU1jcEJ1aWx0aW5JdGVtRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAnYnVpbHRpbi1pdGVtJztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgY29sbGVjdGlvbklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uU2VydmVyPzogQWdlbnRIb3N0TWNwU2VydmVyO1xuXHRyZWFkb25seSBsb2NhbFNlcnZlcj86IElNY3BTZXJ2ZXI7XG59XG5cbmV4cG9ydCB0eXBlIEFnZW50SG9zdE1jcFNlcnZlciA9IFJldHVyblR5cGU8SUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlWydnZXRNY3BTZXJ2ZXJzJ10+W251bWJlcl07XG5cbnR5cGUgSU1jcExpc3RFbnRyeSA9IElNY3BHcm91cEhlYWRlckVudHJ5IHwgSU1jcFNlcnZlckl0ZW1FbnRyeSB8IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5IHwgSU1jcEJ1aWx0aW5JdGVtRW50cnk7XG5cbnR5cGUgTWNwU3RhdHVzS2luZCA9IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kIHwgTWNwU2VydmVyU3RhdHVzIHwgJ2Rpc2FibGVkJztcblxuLyoqXG4gKiBEZWxlZ2F0ZSBmb3IgdGhlIE1DUCBzZXJ2ZXIgbGlzdC5cbiAqL1xuY2xhc3MgTWNwU2VydmVySXRlbURlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SU1jcExpc3RFbnRyeT4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSU1jcExpc3RFbnRyeSk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmlzRmlyc3QgPyBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFQgOiBDVVNUT01JWkFUSU9OX0dST1VQX0hFQURFUl9IRUlHSFRfV0lUSF9TRVBBUkFUT1I7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdzZXJ2ZXItaXRlbScgJiYgZWxlbWVudC5zZXJ2ZXIuZ2FsbGVyeSAmJiAoZWxlbWVudC5tYXJrZXRwbGFjZSB8fCAhZWxlbWVudC5zZXJ2ZXIubG9jYWwpKSB7XG5cdFx0XHRyZXR1cm4gNjI7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdzZXJ2ZXItaXRlbScgJiYgZWxlbWVudC5zZXJ2ZXIuZGVzY3JpcHRpb24/LnRyaW0oKSkge1xuXHRcdFx0cmV0dXJuIE1DUF9JVEVNX1dJVEhfREVTQ1JJUFRJT05fSEVJR0hUO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnYnVpbHRpbi1pdGVtJyAmJiBlbGVtZW50LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4gTUNQX0lURU1fV0lUSF9ERVNDUklQVElPTl9IRUlHSFQ7XG5cdFx0fVxuXHRcdHJldHVybiBNQ1BfSVRFTV9IRUlHSFQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElNY3BMaXN0RW50cnkpOiBzdHJpbmcge1xuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0XHRyZXR1cm4gJ21jcEdyb3VwSGVhZGVyJztcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2J1aWx0aW4taXRlbScpIHtcblx0XHRcdHJldHVybiAnbWNwU2VydmVySXRlbSc7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdzZXNzaW9uLXNlcnZlci1pdGVtJykge1xuXHRcdFx0cmV0dXJuICdtY3BTZXJ2ZXJJdGVtJztcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gZWxlbWVudC5zZXJ2ZXI7XG5cdFx0cmV0dXJuIHNlcnZlci5nYWxsZXJ5ICYmIChlbGVtZW50Lm1hcmtldHBsYWNlIHx8ICFzZXJ2ZXIubG9jYWwpID8gTUNQX0dBTExFUllfSVRFTV9URU1QTEFURV9JRCA6ICdtY3BTZXJ2ZXJJdGVtJztcblx0fVxufVxuXG5pbnRlcmZhY2UgSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0eXBlSWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbnM6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgYWN0aW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuLyoqXG4gKiBSZW5kZXJlciBmb3IgbG9jYWwgTUNQIHNlcnZlciBsaXN0IGl0ZW1zLlxuICovXG5jbGFzcyBNY3BTZXJ2ZXJJdGVtUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElNY3BTZXJ2ZXJJdGVtRW50cnkgfCBJTWNwU2Vzc2lvblNlcnZlckl0ZW1FbnRyeSB8IElNY3BCdWlsdGluSXRlbUVudHJ5LCBJTWNwU2VydmVySXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ21jcFNlcnZlckl0ZW0nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FmdGVyU2hvd091dHB1dDogKCkgPT4gUHJvbWlzZTx2b2lkPixcblx0XHRASUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtY3Atc2VydmVyLWl0ZW0nKTtcblxuXHRcdGNvbnN0IHR5cGVJY29uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLWljb24nKSk7XG5cdFx0dHlwZUljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShtY3BTZXJ2ZXJJY29uKSk7XG5cblx0XHRjb25zdCBkZXRhaWxzID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tY3Atc2VydmVyLWRldGFpbHMnKSk7XG5cdFx0Y29uc3QgbmFtZVJvdyA9IERPTS5hcHBlbmQoZGV0YWlscywgJCgnLm1jcC1zZXJ2ZXItbmFtZS1yb3cnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IERPTS5hcHBlbmQobmFtZVJvdywgJCgnLm1jcC1zZXJ2ZXItbmFtZScpKTtcblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gRE9NLmFwcGVuZChkZXRhaWxzLCAkKCcubWNwLXNlcnZlci1kZXNjcmlwdGlvbicpKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1jcC1zZXJ2ZXItYWN0aW9ucycpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR0eXBlSWNvbixcblx0XHRcdG5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSxcblx0XHRcdGFjdGlvbkRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCksXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSB8IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5IHwgSU1jcEJ1aWx0aW5JdGVtRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1jcFNlcnZlckl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnYnVpbHRpbi1pdGVtJykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdidWlsdGluJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1kZXRhaWwnLCBmYWxzZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IGZvcm1hdERpc3BsYXlOYW1lKGVsZW1lbnQubGFiZWwpO1xuXHRcdFx0aWYgKGVsZW1lbnQuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gdHJ1bmNhdGVUb0ZpcnN0TGluZShlbGVtZW50LmRlc2NyaXB0aW9uKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlS25vd25TZXJ2ZXJTdGF0dXModGVtcGxhdGVEYXRhLCBlbGVtZW50KTtcblxuXHRcdFx0Ly8gQWRkIGhvdmVyIHdpdGggcGx1Z2luIHByb3ZlbmFuY2UgZm9yIHBsdWdpbi1zb3VyY2VkIGJ1aWx0aW4gaXRlbXNcblx0XHRcdGNvbnN0IHBsdWdpblVyaVN0ciA9IGdldFBsdWdpblVyaUZyb21Db2xsZWN0aW9uSWQoZWxlbWVudC5jb2xsZWN0aW9uSWQpO1xuXHRcdFx0aWYgKHBsdWdpblVyaVN0cikge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGx1Z2luID0gdGhpcy5hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5nZXQoKS5maW5kKHAgPT4gcC51cmkudG9TdHJpbmcoKSA9PT0gcGx1Z2luVXJpU3RyKTtcblx0XHRcdFx0XHRpZiAocGx1Z2luKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50OiBgJHtlbGVtZW50LmxhYmVsfVxcbiR7bG9jYWxpemUoJ2Zyb21QbHVnaW4nLCBcIlBsdWdpbjogezB9XCIsIHBsdWdpbi5sYWJlbCl9YCxcblx0XHRcdFx0XHRcdFx0YXBwZWFyYW5jZTogeyBjb21wYWN0OiB0cnVlLCBza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBlbGVtZW50LmxhYmVsLCBhcHBlYXJhbmNlOiB7IGNvbXBhY3Q6IHRydWUsIHNraXBGYWRlSW5BbmltYXRpb246IHRydWUgfSB9O1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2J1aWx0aW4nKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWRldGFpbCcsIGZhbHNlKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5uYW1lLnRleHRDb250ZW50ID0gZm9ybWF0RGlzcGxheU5hbWUoZWxlbWVudC5zZXJ2ZXIubmFtZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy51cGRhdGVBY3RpdmVTZXNzaW9uU3RhdHVzKHRlbXBsYXRlRGF0YSwgZWxlbWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdidWlsdGluJyk7XG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBmb3JtYXREaXNwbGF5TmFtZShlbGVtZW50LnNlcnZlci5sYWJlbCk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBlbGVtZW50LnNlcnZlci5kZXNjcmlwdGlvbj8udHJpbSgpO1xuXHRcdC8vIE1hcmtldHBsYWNlIChnYWxsZXJ5KSBlbnRyaWVzIGFyZSBhbHdheXMgY2xpY2thYmxlIHNvIHVzZXJzIGNhbiBpbnN0YWxsL2luc3BlY3QgdGhlbSxcblx0XHQvLyBldmVuIHdoZW4gbm8gZGVzY3JpcHRpb24gaXMgcmV0dXJuZWQgYnkgdGhlIGdhbGxlcnkuIEluc3RhbGxlZCByb3dzIG9ubHkgb3B0LWluIHRvIHRoZVxuXHRcdC8vIGRldGFpbCB2aWV3IHdoZW4gdGhlcmUgaXMgc29tZXRoaW5nIGV4dHJhIHRvIHNob3cuXG5cdFx0Y29uc3QgaXNHYWxsZXJ5ID0gIWVsZW1lbnQuc2VydmVyLmxvY2FsO1xuXHRcdGNvbnN0IGhhc0RldGFpbCA9ICEhZGVzY3JpcHRpb24gfHwgaXNHYWxsZXJ5O1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWRldGFpbCcsIGhhc0RldGFpbCk7XG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSB0cnVuY2F0ZVRvRmlyc3RMaW5lKGRlc2NyaXB0aW9uKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuYWN0aXZlU2Vzc2lvblNlcnZlcikge1xuXHRcdFx0dGhpcy51cGRhdGVLbm93blNlcnZlclN0YXR1cyh0ZW1wbGF0ZURhdGEsIGVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHRoaXMudXBkYXRlS25vd25TZXJ2ZXJTdGF0dXModGVtcGxhdGVEYXRhLCBlbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBkaXNhYmxlZCA9IGVsZW1lbnQubG9jYWxTZXJ2ZXIgPyBpc0NvbnRyaWJ1dGlvbkRpc2FibGVkKGVsZW1lbnQubG9jYWxTZXJ2ZXIuZW5hYmxlbWVudC5yZWFkKHJlYWRlcikpIDogZmFsc2U7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb25TdGF0ZSA9IGVsZW1lbnQubG9jYWxTZXJ2ZXI/LmNvbm5lY3Rpb25TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBkaXNhYmxlZCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHRlbXBsYXRlRGF0YSwgZWxlbWVudCwgZGlzYWJsZWQgPyAnZGlzYWJsZWQnIDogY29ubmVjdGlvblN0YXRlPy5zdGF0ZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVLbm93blNlcnZlclN0YXR1cyh0ZW1wbGF0ZURhdGE6IElNY3BTZXJ2ZXJJdGVtVGVtcGxhdGVEYXRhLCBlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5IHwgSU1jcEJ1aWx0aW5JdGVtRW50cnkpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsb2NhbERpc2FibGVkID0gZWxlbWVudC5sb2NhbFNlcnZlciA/IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQoZWxlbWVudC5sb2NhbFNlcnZlci5lbmFibGVtZW50LnJlYWQocmVhZGVyKSkgOiBmYWxzZTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25TZXJ2ZXIgPSBlbGVtZW50LmFjdGl2ZVNlc3Npb25TZXJ2ZXI7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgbG9jYWxEaXNhYmxlZCB8fCBhY3RpdmVTZXNzaW9uU2VydmVyPy5lbmFibGVkID09PSBmYWxzZSk7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh0ZW1wbGF0ZURhdGEsIGVsZW1lbnQsIGxvY2FsRGlzYWJsZWQgPyAnZGlzYWJsZWQnIDogYWN0aXZlU2Vzc2lvblNlcnZlciA/IChhY3RpdmVTZXNzaW9uU2VydmVyLmVuYWJsZWQgPyBhY3RpdmVTZXNzaW9uU2VydmVyLnN0YXR1cyA6ICdkaXNhYmxlZCcpIDogdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjdGl2ZVNlc3Npb25TdGF0dXModGVtcGxhdGVEYXRhOiBJTWNwU2VydmVySXRlbVRlbXBsYXRlRGF0YSwgZWxlbWVudDogSU1jcFNlc3Npb25TZXJ2ZXJJdGVtRW50cnkpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNhYmxlZCA9IGVsZW1lbnQuc2VydmVyLmVuYWJsZWQgPT09IGZhbHNlO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBkaXNhYmxlZCk7XG5cdFx0dGhpcy51cGRhdGVTdGF0dXModGVtcGxhdGVEYXRhLCBlbGVtZW50LCBkaXNhYmxlZCA/ICdkaXNhYmxlZCcgOiBlbGVtZW50LnNlcnZlci5zdGF0dXMpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0dXModGVtcGxhdGVEYXRhOiBJTWNwU2VydmVySXRlbVRlbXBsYXRlRGF0YSwgZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSB8IElNY3BTZXNzaW9uU2VydmVySXRlbUVudHJ5IHwgSU1jcEJ1aWx0aW5JdGVtRW50cnksIHN0YXRlOiBNY3BTdGF0dXNLaW5kIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuYWN0aW9ucyk7XG5cblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBnZXRNY3BTdGF0dXNQcmVzZW50YXRpb24oc3RhdGUpO1xuXHRcdGlmICghcHJlc2VudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblNlcnZlciA9IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXIoZWxlbWVudCk7XG5cdFx0Y29uc3QgbGFiZWwgPSBnZXRNY3BFbnRyeUxhYmVsKGVsZW1lbnQpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5nZXQoKTtcblx0XHRjb25zdCBzaG93QWN0aXZlU2Vzc2lvbk91dHB1dCA9IGFjdGl2ZVNlc3Npb25TZXJ2ZXJcblx0XHRcdD8gKGJlZm9yZVNob3c/OiAoKSA9PiBQcm9taXNlPHZvaWQ+KSA9PiB0aGlzLmFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLnNob3dNY3BTZXJ2ZXJMb2coYWN0aXZlU2Vzc2lvblJlc291cmNlLCBhY3RpdmVTZXNzaW9uU2VydmVyLmlkLCBiZWZvcmVTaG93KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKHN0YXRlID09PSBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkICYmIGFjdGl2ZVNlc3Npb25TZXJ2ZXIpIHtcblx0XHRcdGNvbnN0IHNpZ25JbkxhYmVsID0gbG9jYWxpemUoJ3NpZ25JblRvTWNwU2VydmVyJywgXCJTaWduIGluIHRvIHswfVwiLCBsYWJlbCk7XG5cdFx0XHRjb25zdCBzaWduSW5CdXR0b24gPSB0ZW1wbGF0ZURhdGEuYWN0aW9uRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGVtcGxhdGVEYXRhLmFjdGlvbnMsIHtcblx0XHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRzbWFsbDogdHJ1ZSxcblx0XHRcdFx0dGl0bGU6IHNpZ25JbkxhYmVsLFxuXHRcdFx0XHRhcmlhTGFiZWw6IHNpZ25JbkxhYmVsLFxuXHRcdFx0fSkpO1xuXHRcdFx0c2lnbkluQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3NpZ25JbicsIFwiU2lnbiBJblwiKTtcblx0XHRcdHNpZ25JbkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21jcC1zZXJ2ZXItc2lnbi1pbicpO1xuXHRcdFx0cmVnaXN0ZXJNY3BJbmxpbmVCdXR0b25BY3Rpb24odGVtcGxhdGVEYXRhLmFjdGlvbkRpc3Bvc2FibGVzLCBzaWduSW5CdXR0b24sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2lnbkluQnV0dG9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBhdXRoZW50aWNhdGVNY3BTZXJ2ZXIodGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgdGhpcy5jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlLmdldCgpLCBhY3RpdmVTZXNzaW9uU2VydmVyLmlkKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRzaWduSW5CdXR0b24uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICghcHJlc2VudGF0aW9uLmljb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaG93T3V0cHV0ID0gc3RhdGUgPT09IE1jcFNlcnZlclN0YXR1cy5FcnJvciB8fCBzdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3Jcblx0XHRcdD8gZ2V0TWNwU2VydmVyT3V0cHV0SGFuZGxlcih0aGlzLm91dHB1dFNlcnZpY2UsIGVsZW1lbnQudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nID8gdW5kZWZpbmVkIDogZWxlbWVudC5sb2NhbFNlcnZlciwgYWN0aXZlU2Vzc2lvblNlcnZlciwgdGhpcy5fYWZ0ZXJTaG93T3V0cHV0LCBzaG93QWN0aXZlU2Vzc2lvbk91dHB1dClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChzaG93T3V0cHV0KSB7XG5cdFx0XHRjb25zdCBzaG93T3V0cHV0TGFiZWwgPSBsb2NhbGl6ZSgnc2hvd01jcFNlcnZlck91dHB1dCcsIFwiU2hvdyBvdXRwdXQgZm9yIHswfVwiLCBsYWJlbCk7XG5cdFx0XHRjb25zdCBzdGF0dXNCdXR0b24gPSB0ZW1wbGF0ZURhdGEuYWN0aW9uRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGVtcGxhdGVEYXRhLmFjdGlvbnMsIHtcblx0XHRcdFx0dGl0bGU6IHNob3dPdXRwdXRMYWJlbCxcblx0XHRcdFx0YXJpYUxhYmVsOiBzaG93T3V0cHV0TGFiZWwsXG5cdFx0XHR9KSk7XG5cdFx0XHRzdGF0dXNCdXR0b24uaWNvbiA9IHByZXNlbnRhdGlvbi5pY29uO1xuXHRcdFx0c3RhdHVzQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbWNwLXNlcnZlci1zdGF0dXMnLCAnbWNwLXNlcnZlci1zdGF0dXMtYWN0aW9uJywgcHJlc2VudGF0aW9uLmNsYXNzTmFtZSk7XG5cdFx0XHRyZWdpc3Rlck1jcElubGluZUJ1dHRvbkFjdGlvbih0ZW1wbGF0ZURhdGEuYWN0aW9uRGlzcG9zYWJsZXMsIHN0YXR1c0J1dHRvbiwgc2hvd091dHB1dCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdHVzRWxlbWVudCA9IERPTS5hcHBlbmQodGVtcGxhdGVEYXRhLmFjdGlvbnMsICQoJy5tY3Atc2VydmVyLXN0YXR1cycpKTtcblx0XHRzdGF0dXNFbGVtZW50LmNsYXNzTGlzdC5hZGQocHJlc2VudGF0aW9uLmNsYXNzTmFtZSwgLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkocHJlc2VudGF0aW9uLmljb24pKTtcblx0XHRzdGF0dXNFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25EaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgc3RhdHVzRWxlbWVudCwgcHJlc2VudGF0aW9uLmxhYmVsKSk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJTWNwU2VydmVySXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25EaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqIFJlZ2lzdGVycyBhbiBpbmxpbmUgTUNQIGJ1dHRvbiB3aXRob3V0IGFsbG93aW5nIGl0cyBwb2ludGVyIG9yIGNsaWNrIGV2ZW50cyB0byBvcGVuIHRoZSBjb250YWluaW5nIGxpc3Qgcm93LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTWNwSW5saW5lQnV0dG9uQWN0aW9uKHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBidXR0b246IEJ1dHRvbiwgYWN0aW9uOiAoKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPik6IHZvaWQge1xuXHRzdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoYnV0dG9uLmVsZW1lbnQsIGV2ZW50ID0+IERPTS5FdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKSkpO1xuXHRzdG9yZS5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soZXZlbnQgPT4ge1xuXHRcdERPTS5FdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcblx0XHR2b2lkIGFjdGlvbigpO1xuXHR9KSk7XG59XG5cbi8qKiBSdW5zIGF1dGhlbnRpY2F0aW9uIGZvciBvbmUgYWN0aXZlLXNlc3Npb24gTUNQIHNlcnZlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhdXRoZW50aWNhdGVNY3BTZXJ2ZXIoYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIHNlcnZlcklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0cmV0dXJuIGFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmF1dGhlbnRpY2F0ZU1jcFNlcnZlcihzZXNzaW9uUmVzb3VyY2UsIHNlcnZlcklkKTtcbn1cblxuLyoqIFJlc29sdmVzIHRoZSBvdXRwdXQgYWN0aW9uIGZvciBhbiBNQ1Agc2VydmVyLCBwcmVmZXJyaW5nIGl0cyBhY3RpdmUgYWdlbnQtaG9zdCBvdXRwdXQuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TWNwU2VydmVyT3V0cHV0SGFuZGxlcihvdXRwdXRTZXJ2aWNlOiBQaWNrPElPdXRwdXRTZXJ2aWNlLCAnc2hvd0NoYW5uZWwnPiwgbG9jYWxTZXJ2ZXI6IFBpY2s8SU1jcFNlcnZlciwgJ3Nob3dPdXRwdXQnPiB8IHVuZGVmaW5lZCwgYWN0aXZlU2Vzc2lvblNlcnZlcjogQWdlbnRIb3N0TWNwU2VydmVyIHwgdW5kZWZpbmVkLCBjbG9zZUN1c3RvbWl6YXRpb25FZGl0b3I/OiAoKSA9PiBQcm9taXNlPHZvaWQ+LCBzaG93QWN0aXZlU2Vzc2lvbk91dHB1dD86IChiZWZvcmVTaG93PzogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4gUHJvbWlzZTx2b2lkPik6ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG91dHB1dENoYW5uZWxJZCA9IGFjdGl2ZVNlc3Npb25TZXJ2ZXI/LmxvZ091dHB1dENoYW5uZWxJZDtcblx0aWYgKHNob3dBY3RpdmVTZXNzaW9uT3V0cHV0KSB7XG5cdFx0cmV0dXJuICgpID0+IHNob3dBY3RpdmVTZXNzaW9uT3V0cHV0KGNsb3NlQ3VzdG9taXphdGlvbkVkaXRvcik7XG5cdH1cblx0aWYgKG91dHB1dENoYW5uZWxJZCkge1xuXHRcdHJldHVybiBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBjbG9zZUN1c3RvbWl6YXRpb25FZGl0b3I/LigpO1xuXHRcdFx0YXdhaXQgb3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbChvdXRwdXRDaGFubmVsSWQpO1xuXHRcdH07XG5cdH1cblx0aWYgKGxvY2FsU2VydmVyKSB7XG5cdFx0cmV0dXJuIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGNsb3NlQ3VzdG9taXphdGlvbkVkaXRvcj8uKCk7XG5cdFx0XHRhd2FpdCBsb2NhbFNlcnZlci5zaG93T3V0cHV0KCk7XG5cdFx0fTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSU1jcFN0YXR1c1ByZXNlbnRhdGlvbiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xufVxuXG5mdW5jdGlvbiBnZXRNY3BTdGF0dXNQcmVzZW50YXRpb24oc3RhdGU6IE1jcFN0YXR1c0tpbmQgfCB1bmRlZmluZWQpOiBJTWNwU3RhdHVzUHJlc2VudGF0aW9uIHwgdW5kZWZpbmVkIHtcblx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChzdGF0ZSA9PT0gJ2Rpc2FibGVkJykge1xuXHRcdHJldHVybiB7IGxhYmVsOiBsb2NhbGl6ZSgnZGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpLCBjbGFzc05hbWU6ICdkaXNhYmxlZCcsIGljb246IENvZGljb24uY2lyY2xlU2xhc2ggfTtcblx0fVxuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nOlxuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLlJlYWR5OlxuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IGxvY2FsaXplKCdydW5uaW5nJywgXCJSdW5uaW5nXCIpLCBjbGFzc05hbWU6ICdydW5uaW5nJywgaWNvbjogQ29kaWNvbi5jaGVjayB9O1xuXHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RhcnRpbmc6XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmc6XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogbG9jYWxpemUoJ3N0YXJ0aW5nJywgXCJTdGFydGluZ1wiKSwgY2xhc3NOYW1lOiAnc3RhcnRpbmcnLCBpY29uOiBUaGVtZUljb24ubW9kaWZ5KENvZGljb24ubG9hZGluZywgJ3NwaW4nKSB9O1xuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZDpcblx0XHRcdHJldHVybiB7IGxhYmVsOiBsb2NhbGl6ZSgnYXV0aFJlcXVpcmVkJywgXCJBdXRoZW50aWNhdGlvbiByZXF1aXJlZFwiKSwgY2xhc3NOYW1lOiAnYXV0aC1yZXF1aXJlZCcsIGljb246IENvZGljb24uYWNjb3VudCB9O1xuXHRcdGNhc2UgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3I6XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3I6XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogbG9jYWxpemUoJ2Vycm9yJywgXCJFcnJvclwiKSwgY2xhc3NOYW1lOiAnZXJyb3InLCBpY29uOiBDb2RpY29uLmVycm9yIH07XG5cdFx0Y2FzZSBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkOlxuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQ6XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB7IGxhYmVsOiBsb2NhbGl6ZSgnc3RvcHBlZCcsIFwiU3RvcHBlZFwiKSwgY2xhc3NOYW1lOiAnc3RvcHBlZCcgfTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRBY3RpdmVTZXNzaW9uU2VydmVyKGVudHJ5OiBJTWNwU2VydmVySXRlbUVudHJ5IHwgSU1jcFNlc3Npb25TZXJ2ZXJJdGVtRW50cnkgfCBJTWNwQnVpbHRpbkl0ZW1FbnRyeSk6IEFnZW50SG9zdE1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBlbnRyeS50eXBlID09PSAnc2Vzc2lvbi1zZXJ2ZXItaXRlbScgPyBlbnRyeS5zZXJ2ZXIgOiBlbnRyeS5hY3RpdmVTZXNzaW9uU2VydmVyO1xufVxuXG5mdW5jdGlvbiBnZXRNY3BFbnRyeUxhYmVsKGVsZW1lbnQ6IElNY3BTZXJ2ZXJJdGVtRW50cnkgfCBJTWNwU2Vzc2lvblNlcnZlckl0ZW1FbnRyeSB8IElNY3BCdWlsdGluSXRlbUVudHJ5KTogc3RyaW5nIHtcblx0cmV0dXJuIGVsZW1lbnQudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nXG5cdFx0PyBlbGVtZW50LnNlcnZlci5uYW1lXG5cdFx0OiBlbGVtZW50LnR5cGUgPT09ICdidWlsdGluLWl0ZW0nXG5cdFx0XHQ/IGVsZW1lbnQubGFiZWxcblx0XHRcdDogZWxlbWVudC5zZXJ2ZXIubGFiZWw7XG59XG5cbmZ1bmN0aW9uIGdldE1jcFN0YXR1c0tpbmQoZW50cnk6IElNY3BTZXJ2ZXJJdGVtRW50cnkgfCBJTWNwU2Vzc2lvblNlcnZlckl0ZW1FbnRyeSB8IElNY3BCdWlsdGluSXRlbUVudHJ5LCBpc1Nlc3Npb25zV2luZG93OiBib29sZWFuKTogTWNwU3RhdHVzS2luZCB8IHVuZGVmaW5lZCB7XG5cdGlmIChlbnRyeS50eXBlID09PSAnc2Vzc2lvbi1zZXJ2ZXItaXRlbScpIHtcblx0XHRyZXR1cm4gZW50cnkuc2VydmVyLmVuYWJsZWQgPyBlbnRyeS5zZXJ2ZXIuc3RhdHVzIDogJ2Rpc2FibGVkJztcblx0fVxuXHRpZiAoZW50cnkubG9jYWxTZXJ2ZXIgJiYgaXNDb250cmlidXRpb25EaXNhYmxlZChlbnRyeS5sb2NhbFNlcnZlci5lbmFibGVtZW50LmdldCgpKSkge1xuXHRcdHJldHVybiAnZGlzYWJsZWQnO1xuXHR9XG5cdGlmIChlbnRyeS5hY3RpdmVTZXNzaW9uU2VydmVyKSB7XG5cdFx0cmV0dXJuIGVudHJ5LmFjdGl2ZVNlc3Npb25TZXJ2ZXIuZW5hYmxlZCA/IGVudHJ5LmFjdGl2ZVNlc3Npb25TZXJ2ZXIuc3RhdHVzIDogJ2Rpc2FibGVkJztcblx0fVxuXHRpZiAoZW50cnkudHlwZSA9PT0gJ3NlcnZlci1pdGVtJyAmJiAhaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdHJldHVybiBlbnRyeS5sb2NhbFNlcnZlcj8uY29ubmVjdGlvblN0YXRlLmdldCgpLnN0YXRlO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldE1jcEVudHJ5QXJpYUxhYmVsKGVsZW1lbnQ6IElNY3BMaXN0RW50cnksIGlzU2Vzc2lvbnNXaW5kb3c6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRpZiAoZWxlbWVudC50eXBlID09PSAnZ3JvdXAtaGVhZGVyJykge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwR3JvdXBBcmlhTGFiZWwnLCBcInswfSwgezF9IGl0ZW1zLCB7Mn1cIiwgZWxlbWVudC5sYWJlbCwgZWxlbWVudC5jb3VudCwgZWxlbWVudC5jb2xsYXBzZWQgPyBsb2NhbGl6ZSgnY29sbGFwc2VkJywgXCJjb2xsYXBzZWRcIikgOiBsb2NhbGl6ZSgnZXhwYW5kZWQnLCBcImV4cGFuZGVkXCIpKTtcblx0fVxuXHRjb25zdCBsYWJlbCA9IGdldE1jcEVudHJ5TGFiZWwoZWxlbWVudCk7XG5cdGNvbnN0IHN0YXR1cyA9IGdldE1jcFN0YXR1c1ByZXNlbnRhdGlvbihnZXRNY3BTdGF0dXNLaW5kKGVsZW1lbnQsIGlzU2Vzc2lvbnNXaW5kb3cpKTtcblx0cmV0dXJuIHN0YXR1c1xuXHRcdD8gbG9jYWxpemUoJ21jcFNlcnZlckFyaWFMYWJlbFdpdGhTdGF0dXMnLCBcInswfSwgezF9XCIsIGxhYmVsLCBzdGF0dXMubGFiZWwpXG5cdFx0OiBsYWJlbDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplTWNwTWF0Y2hLZXkodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2YWx1ZSB8fCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldFVuaXF1ZU1jcE1hdGNoS2V5cyh2YWx1ZXM6IHJlYWRvbmx5IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRjb25zdCBrZXkgPSBub3JtYWxpemVNY3BNYXRjaEtleSh2YWx1ZSk7XG5cdFx0aWYgKGtleSkge1xuXHRcdFx0a2V5cy5hZGQoa2V5KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFsuLi5rZXlzXTtcbn1cblxuY2xhc3MgQWN0aXZlU2Vzc2lvbk1jcFNlcnZlck1hdGNoZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIEFnZW50SG9zdE1jcFNlcnZlcltdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hdGNoZWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHNlcnZlcnM6IHJlYWRvbmx5IEFnZW50SG9zdE1jcFNlcnZlcltdKSB7XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygc2VydmVycykge1xuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yID0gc2VydmVyLmlkLmluZGV4T2YoJy8nKTtcblx0XHRcdGNvbnN0IHJhd0lkID0gc2VwYXJhdG9yID49IDAgPyBzZXJ2ZXIuaWQuc2xpY2Uoc2VwYXJhdG9yICsgMSkgOiBzZXJ2ZXIuaWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBnZXRVbmlxdWVNY3BNYXRjaEtleXMoW3Jhd0lkLCBzZXJ2ZXIubmFtZV0pKSB7XG5cdFx0XHRcdGxldCBidWNrZXQgPSB0aGlzLmJ5S2V5LmdldChrZXkpO1xuXHRcdFx0XHRpZiAoIWJ1Y2tldCkge1xuXHRcdFx0XHRcdGJ1Y2tldCA9IFtdO1xuXHRcdFx0XHRcdHRoaXMuYnlLZXkuc2V0KGtleSwgYnVja2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRidWNrZXQucHVzaChzZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRha2Uoa2V5czogcmVhZG9ubHkgKHN0cmluZyB8IHVuZGVmaW5lZClbXSk6IEFnZW50SG9zdE1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgZ2V0VW5pcXVlTWNwTWF0Y2hLZXlzKGtleXMpKSB7XG5cdFx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5ieUtleS5nZXQoa2V5KT8uZmlsdGVyKHNlcnZlciA9PiAhdGhpcy5tYXRjaGVkSWRzLmhhcyhzZXJ2ZXIuaWQpKTtcblx0XHRcdGlmIChtYXRjaGVzPy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0dGhpcy5tYXRjaGVkSWRzLmFkZChtYXRjaGVzWzBdLmlkKTtcblx0XHRcdFx0cmV0dXJuIG1hdGNoZXNbMF07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHR1bm1hdGNoZWQocXVlcnk6IHN0cmluZyk6IEFnZW50SG9zdE1jcFNlcnZlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5zZXJ2ZXJzLmZpbHRlcihzZXJ2ZXIgPT4gIXRoaXMubWF0Y2hlZElkcy5oYXMoc2VydmVyLmlkKSAmJiBtYXRjaGVzQWN0aXZlU2Vzc2lvblNlcnZlclF1ZXJ5KHNlcnZlciwgcXVlcnkpKTtcblx0fVxufVxuXG5jbGFzcyBMb2NhbE1jcFNlcnZlck1hdGNoZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ5S2V5ID0gbmV3IE1hcDxzdHJpbmcsIElNY3BTZXJ2ZXJbXT4oKTtcblxuXHRjb25zdHJ1Y3RvcihzZXJ2ZXJzOiByZWFkb25seSBJTWNwU2VydmVyW10pIHtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBnZXRSdW50aW1lU2VydmVyTWF0Y2hLZXlzKHNlcnZlcikpIHtcblx0XHRcdFx0bGV0IG1hdGNoZXMgPSB0aGlzLmJ5S2V5LmdldChrZXkpO1xuXHRcdFx0XHRpZiAoIW1hdGNoZXMpIHtcblx0XHRcdFx0XHRtYXRjaGVzID0gW107XG5cdFx0XHRcdFx0dGhpcy5ieUtleS5zZXQoa2V5LCBtYXRjaGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXRjaGVzLnB1c2goc2VydmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmaW5kKGtleXM6IHJlYWRvbmx5IChzdHJpbmcgfCB1bmRlZmluZWQpW10pOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBnZXRVbmlxdWVNY3BNYXRjaEtleXMoa2V5cykpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLmJ5S2V5LmdldChrZXkpO1xuXHRcdFx0aWYgKG1hdGNoZXM/Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2hlc1swXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBtYXRjaGVzQWN0aXZlU2Vzc2lvblNlcnZlclF1ZXJ5KHNlcnZlcjogQWdlbnRIb3N0TWNwU2VydmVyLCBxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICghcXVlcnkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gc2VydmVyLm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSk7XG59XG5cbmZ1bmN0aW9uIGdldFdvcmtiZW5jaFNlcnZlck1hdGNoS2V5cyhzZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIpOiBzdHJpbmdbXSB7XG5cdHJldHVybiBnZXRVbmlxdWVNY3BNYXRjaEtleXMoW3NlcnZlci5pZCwgc2VydmVyLm5hbWUsIHNlcnZlci5sYWJlbF0pO1xufVxuXG5mdW5jdGlvbiBnZXRSdW50aW1lU2VydmVyTWF0Y2hLZXlzKHNlcnZlcjogSU1jcFNlcnZlcik6IHN0cmluZ1tdIHtcblx0cmV0dXJuIGdldFVuaXF1ZU1jcE1hdGNoS2V5cyhbc2VydmVyLmRlZmluaXRpb24uaWQsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsXSk7XG59XG5cbmZ1bmN0aW9uIGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJMaWZlY3ljbGVBY3Rpb24oc2VydmVyOiBBZ2VudEhvc3RNY3BTZXJ2ZXIpOiBBY3Rpb24gfCB1bmRlZmluZWQge1xuXHRpZiAoIXNlcnZlci5lbmFibGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gc2VydmVyLnN0YXR1cyA9PT0gTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQgfHwgc2VydmVyLnN0YXR1cyA9PT0gTWNwU2VydmVyU3RhdHVzLkVycm9yXG5cdFx0PyBuZXcgQWN0aW9uKFxuXHRcdFx0J21jcFNlcnZlci5hY3RpdmVTZXNzaW9uLnN0YXJ0Jyxcblx0XHRcdGxvY2FsaXplKCdhY3RpdmVTZXNzaW9uTWNwU2VydmVyU3RhcnQnLCBcIlN0YXJ0IFNlcnZlclwiKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiBzZXJ2ZXIuc3RhcnQoKVxuXHRcdClcblx0XHQ6IG5ldyBBY3Rpb24oXG5cdFx0XHQnbWNwU2VydmVyLmFjdGl2ZVNlc3Npb24uc3RvcCcsXG5cdFx0XHRsb2NhbGl6ZSgnYWN0aXZlU2Vzc2lvbk1jcFNlcnZlclN0b3AnLCBcIlN0b3AgU2VydmVyXCIpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdCgpID0+IHNlcnZlci5zdG9wKClcblx0XHQpO1xufVxuXG4vKiogQ3JlYXRlcyB0aGUgbm9uLXBlcnNpc3RlbnQgZW5hYmxlbWVudCBhY3Rpb24gZm9yIG9uZSBhZ2VudC1ob3N0IHNlc3Npb24uICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2Vzc2lvbkVuYWJsZW1lbnRBY3Rpb24oc2VydmVyOiBBZ2VudEhvc3RNY3BTZXJ2ZXIpOiBJQWN0aW9uIHtcblx0cmV0dXJuIG5ldyBBY3Rpb24oXG5cdFx0c2VydmVyLmVuYWJsZWQgPyAnbWNwU2VydmVyLnNlc3Npb24uZGlzYWJsZScgOiAnbWNwU2VydmVyLnNlc3Npb24uZW5hYmxlJyxcblx0XHRzZXJ2ZXIuZW5hYmxlZCA/IGxvY2FsaXplKCdzZXNzaW9uTWNwU2VydmVyRGlzYWJsZScsIFwiRGlzYWJsZSAoU2Vzc2lvbilcIikgOiBsb2NhbGl6ZSgnc2Vzc2lvbk1jcFNlcnZlckVuYWJsZScsIFwiRW5hYmxlIChTZXNzaW9uKVwiKSxcblx0XHR1bmRlZmluZWQsXG5cdFx0dHJ1ZSxcblx0XHQoKSA9PiB7XG5cdFx0XHRzZXJ2ZXIuc2V0RW5hYmxlZCghc2VydmVyLmVuYWJsZWQpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0KTtcbn1cblxuLyoqIENyZWF0ZXMgZHVyYWJsZSBwcm9maWxlL3dvcmtzcGFjZSBhY3Rpb25zIGZvciBhbiBhZ2VudC1ob3N0LW9ubHkgc2VydmVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKGFnZW50SG9zdEN1c3RvbWl6YXRpb25zOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlciwgaXNFbXB0eVdvcmtiZW5jaDogYm9vbGVhbik6IElBY3Rpb25bXSB7XG5cdGNvbnN0IGRpc2FibGVkID0gaXNDb250cmlidXRpb25EaXNhYmxlZChhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5nZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLm5hbWUpKTtcblx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGlmIChkaXNhYmxlZCkge1xuXHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYWdlbnRIb3N0LmVuYWJsZScsIGxvY2FsaXplKCdhZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGUnLCBcIkVuYWJsZVwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5zZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLm5hbWUsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSk7XG5cdFx0fSkpO1xuXHRcdGlmICghaXNFbXB0eVdvcmtiZW5jaCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ21jcFNlcnZlci5hZ2VudEhvc3QuZW5hYmxlV29ya3NwYWNlJywgbG9jYWxpemUoJ2FnZW50SG9zdE1jcFNlcnZlckVuYWJsZUZvcldvcmtzcGFjZScsIFwiRW5hYmxlIChXb3Jrc3BhY2UpXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0YWdlbnRIb3N0Q3VzdG9taXphdGlvbnMuc2V0TWNwU2VydmVyRW5hYmxlbWVudChzZXNzaW9uUmVzb3VyY2UsIHNlcnZlci5uYW1lLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYWdlbnRIb3N0LmRpc2FibGUnLCBsb2NhbGl6ZSgnYWdlbnRIb3N0TWNwU2VydmVyRGlzYWJsZScsIFwiRGlzYWJsZVwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5zZXRNY3BTZXJ2ZXJFbmFibGVtZW50KHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLm5hbWUsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUpO1xuXHRcdH0pKTtcblx0XHRpZiAoIWlzRW1wdHlXb3JrYmVuY2gpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYWdlbnRIb3N0LmRpc2FibGVXb3Jrc3BhY2UnLCBsb2NhbGl6ZSgnYWdlbnRIb3N0TWNwU2VydmVyRGlzYWJsZUZvcldvcmtzcGFjZScsIFwiRGlzYWJsZSAoV29ya3NwYWNlKVwiKSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7XG5cdFx0XHRcdGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLnNldE1jcFNlcnZlckVuYWJsZW1lbnQoc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIubmFtZSwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbi8qKiBDcmVhdGVzIGR1cmFibGUgcHJvZmlsZS93b3Jrc3BhY2UgYWN0aW9ucyBmb3IgYSBsb2NhbGx5IGJhY2tlZCBidWlsdC1pbiBzZXJ2ZXIgcm93LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMobWNwU2VydmljZTogSU1jcFNlcnZpY2UsIHNlcnZlcklkOiBzdHJpbmcsIGlzRW1wdHlXb3JrYmVuY2g6IGJvb2xlYW4pOiBJQWN0aW9uW10ge1xuXHRjb25zdCBkaXNhYmxlZCA9IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQobWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwucmVhZEVuYWJsZWQoc2VydmVySWQpKTtcblx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGlmIChkaXNhYmxlZCkge1xuXHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYnVpbHRpbi5lbmFibGUnLCBsb2NhbGl6ZSgnYnVpbHRpbk1jcFNlcnZlckVuYWJsZScsIFwiRW5hYmxlXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdG1jcFNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQoc2VydmVySWQsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSk7XG5cdFx0fSkpO1xuXHRcdGlmICghaXNFbXB0eVdvcmtiZW5jaCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oJ21jcFNlcnZlci5idWlsdGluLmVuYWJsZVdvcmtzcGFjZScsIGxvY2FsaXplKCdidWlsdGluTWNwU2VydmVyRW5hYmxlRm9yV29ya3NwYWNlJywgXCJFbmFibGUgKFdvcmtzcGFjZSlcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4ge1xuXHRcdFx0XHRtY3BTZXJ2aWNlLmVuYWJsZW1lbnRNb2RlbC5zZXRFbmFibGVkKHNlcnZlcklkLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYnVpbHRpbi5kaXNhYmxlJywgbG9jYWxpemUoJ2J1aWx0aW5NY3BTZXJ2ZXJEaXNhYmxlJywgXCJEaXNhYmxlXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdG1jcFNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQoc2VydmVySWQsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUpO1xuXHRcdH0pKTtcblx0XHRpZiAoIWlzRW1wdHlXb3JrYmVuY2gpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgQWN0aW9uKCdtY3BTZXJ2ZXIuYnVpbHRpbi5kaXNhYmxlV29ya3NwYWNlJywgbG9jYWxpemUoJ2J1aWx0aW5NY3BTZXJ2ZXJEaXNhYmxlRm9yV29ya3NwYWNlJywgXCJEaXNhYmxlIChXb3Jrc3BhY2UpXCIpLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0bWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZChzZXJ2ZXJJZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbi8qKiBDb21wb3NlcyBsaWZlY3ljbGUsIGR1cmFibGUsIHNlc3Npb24sIGFuZCBvcHRpb25zIGFjdGlvbnMgZm9yIGFuIGFnZW50LWhvc3Qtb25seSByb3cuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWN0aXZlU2Vzc2lvblNlcnZlck9wdGlvbnNBY3Rpb25zKGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsIGFnZW50SG9zdEN1c3RvbWl6YXRpb25zOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIGlzRW1wdHlXb3JrYmVuY2g6IGJvb2xlYW4sIHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlcik6IElBY3Rpb25bXSB7XG5cdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdGNvbnN0IGxpZmVjeWNsZUFjdGlvbiA9IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJMaWZlY3ljbGVBY3Rpb24oc2VydmVyKTtcblx0aWYgKGxpZmVjeWNsZUFjdGlvbikge1xuXHRcdGFjdGlvbnMucHVzaChsaWZlY3ljbGVBY3Rpb24pO1xuXHR9XG5cblx0Y29uc3QgZHVyYWJsZUFjdGlvbnMgPSBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhhZ2VudEhvc3RDdXN0b21pemF0aW9ucywgc2Vzc2lvblJlc291cmNlLCBzZXJ2ZXIsIGlzRW1wdHlXb3JrYmVuY2gpO1xuXHRpZiAoZHVyYWJsZUFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdH1cblx0XHRhY3Rpb25zLnB1c2goLi4uZHVyYWJsZUFjdGlvbnMpO1xuXHR9XG5cblx0YWN0aW9ucy5wdXNoKGdldFNlc3Npb25FbmFibGVtZW50QWN0aW9uKHNlcnZlcikpO1xuXG5cdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRhY3Rpb25zLnB1c2gobmV3IEFjdGlvbihcblx0XHQnbWNwU2VydmVyLmFjdGl2ZVNlc3Npb24ub3B0aW9ucycsXG5cdFx0bG9jYWxpemUoJ2FjdGl2ZVNlc3Npb25NY3BTZXJ2ZXJPcHRpb25zJywgXCJTZXJ2ZXIgT3B0aW9uc1wiKSxcblx0XHR1bmRlZmluZWQsXG5cdFx0dHJ1ZSxcblx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsIHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLmlkKTtcblx0XHR9XG5cdCkpO1xuXG5cdHJldHVybiBhY3Rpb25zO1xufVxuXG5mdW5jdGlvbiBzaG91bGRIaWRlTG9jYWxBY3Rpb25Gb3JBY3RpdmVTZXNzaW9uU2VydmVyKGFjdGlvbjogSUFjdGlvbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYWN0aW9uIGluc3RhbmNlb2YgU3RhcnRTZXJ2ZXJBY3Rpb25cblx0XHR8fCBhY3Rpb24gaW5zdGFuY2VvZiBTdG9wU2VydmVyQWN0aW9uXG5cdFx0fHwgYWN0aW9uIGluc3RhbmNlb2YgUmVzdGFydFNlcnZlckFjdGlvblxuXHRcdHx8IGFjdGlvbiBpbnN0YW5jZW9mIENvbmZpZ3VyZU1vZGVsQWNjZXNzQWN0aW9uXG5cdFx0fHwgYWN0aW9uIGluc3RhbmNlb2YgU2hvd1NhbXBsaW5nUmVxdWVzdHNBY3Rpb247XG59XG5cbmZ1bmN0aW9uIGlzTG9jYWxNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYWN0aW9uIGluc3RhbmNlb2YgRW5hYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb25cblx0XHR8fCBhY3Rpb24gaW5zdGFuY2VvZiBFbmFibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb25cblx0XHR8fCBhY3Rpb24gaW5zdGFuY2VvZiBEaXNhYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb25cblx0XHR8fCBhY3Rpb24gaW5zdGFuY2VvZiBEaXNhYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCdWlsdGluRW50cnkoc2VydmVyOiBJTWNwU2VydmVyLCBhY3RpdmVTZXNzaW9uU2VydmVyPzogQWdlbnRIb3N0TWNwU2VydmVyKTogSU1jcEJ1aWx0aW5JdGVtRW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICdidWlsdGluLWl0ZW0nLFxuXHRcdGlkOiBgYnVpbHRpbi0ke3NlcnZlci5kZWZpbml0aW9uLmlkfWAsXG5cdFx0bGFiZWw6IHNlcnZlci5kZWZpbml0aW9uLmxhYmVsLFxuXHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRjb2xsZWN0aW9uSWQ6IHNlcnZlci5jb2xsZWN0aW9uLmlkLFxuXHRcdGFjdGl2ZVNlc3Npb25TZXJ2ZXIsXG5cdFx0bG9jYWxTZXJ2ZXI6IHNlcnZlcixcblx0fTtcbn1cblxuY29uc3QgTUNQX0dBTExFUllfSVRFTV9URU1QTEFURV9JRCA9ICdtY3BHYWxsZXJ5SXRlbSc7XG5cbi8qKiBBZGFwdHMgYSBnYWxsZXJ5IE1DUCBzZXJ2ZXIgZW50cnkgdG8gdGhlIHNoYXJlZCBnYWxsZXJ5IHJvdyByZW5kZXJlci4gKi9cbmNsYXNzIE1jcEdhbGxlcnlJdGVtUHJvdmlkZXIgaW1wbGVtZW50cyBJR2FsbGVyeUl0ZW1Qcm92aWRlcjxJTWNwU2VydmVySXRlbUVudHJ5PiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBtY3BXb3JrYmVuY2hTZXJ2aWNlOiBJTWNwV29ya2JlbmNoU2VydmljZSkgeyB9XG5cblx0Z2V0TGFiZWwoZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuc2VydmVyLmxhYmVsO1xuXHR9XG5cblx0Z2V0UHVibGlzaGVyRGlzcGxheU5hbWUoZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuc2VydmVyLnB1Ymxpc2hlckRpc3BsYXlOYW1lO1xuXHR9XG5cblx0Z2V0RGVzY3JpcHRpb24oZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuc2VydmVyLmRlc2NyaXB0aW9uO1xuXHR9XG5cblx0Z2V0SW5zdGFsbFN0YXRlKGVsZW1lbnQ6IElNY3BTZXJ2ZXJJdGVtRW50cnkpOiBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZSB7XG5cdFx0c3dpdGNoIChlbGVtZW50LnNlcnZlci5pbnN0YWxsU3RhdGUpIHtcblx0XHRcdGNhc2UgTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxlZDogcmV0dXJuIEdhbGxlcnlJdGVtSW5zdGFsbFN0YXRlLkluc3RhbGxlZDtcblx0XHRcdGNhc2UgTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxpbmc6IHJldHVybiBHYWxsZXJ5SXRlbUluc3RhbGxTdGF0ZS5JbnN0YWxsaW5nO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIEdhbGxlcnlJdGVtSW5zdGFsbFN0YXRlLlVuaW5zdGFsbGVkO1xuXHRcdH1cblx0fVxuXG5cdGNhbkluc3RhbGwoZWxlbWVudDogSU1jcFNlcnZlckl0ZW1FbnRyeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuY2FuSW5zdGFsbChlbGVtZW50LnNlcnZlcikgPT09IHRydWU7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsKGVsZW1lbnQ6IElNY3BTZXJ2ZXJJdGVtRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbChlbGVtZW50LnNlcnZlcik7XG5cdH1cblxuXHRvbkRpZENoYW5nZUluc3RhbGxTdGF0ZShlbGVtZW50OiBJTWNwU2VydmVySXRlbUVudHJ5LCBsaXN0ZW5lcjogKCkgPT4gdm9pZCkge1xuXHRcdHJldHVybiB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoY2hhbmdlZCA9PiB7XG5cdFx0XHRpZiAoIWNoYW5nZWQgfHwgY2hhbmdlZC5pZCA9PT0gZWxlbWVudC5zZXJ2ZXIuaWQpIHtcblx0XHRcdFx0bGlzdGVuZXIoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFdpZGdldCB0aGF0IGRpc3BsYXlzIGEgbGlzdCBvZiBNQ1Agc2VydmVycyB3aXRoIG1hcmtldHBsYWNlIGJyb3dzaW5nLlxuICovXG5leHBvcnQgY2xhc3MgTWNwTGlzdFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2VsZWN0U2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtiZW5jaE1jcFNlcnZlcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VsZWN0U2VydmVyID0gdGhpcy5fb25EaWRTZWxlY3RTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtQ291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1Db3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdFNob3dQbHVnaW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRQbHVnaW5JdGVtPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0U2hvd1BsdWdpbiA9IHRoaXMuX29uRGlkUmVxdWVzdFNob3dQbHVnaW4uZXZlbnQ7XG5cblx0cHJpdmF0ZSBzZWN0aW9uVGl0bGVIZWFkZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWN0aW9uTGluayE6IEhUTUxBbmNob3JFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaElucHV0ITogSW5wdXRCb3g7XG5cdHByaXZhdGUgbGlzdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGxpc3QhOiBXb3JrYmVuY2hMaXN0PElNY3BMaXN0RW50cnk+O1xuXHRwcml2YXRlIGVtcHR5Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZW1wdHlUZXh0ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZW1wdHlTdWJ0ZXh0ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZGlzYWJsZWRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkaXNhYmxlZEljb24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkaXNhYmxlZE1lc3NhZ2UhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNhYmxlZExpbmtMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBicm93c2VCdXR0b24hOiBCdXR0b247XG5cdHByaXZhdGUgYmFja0J1dHRvbiE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBhZGRCdXR0b24hOiBCdXR0b247XG5cblx0cHJpdmF0ZSBmaWx0ZXJlZFNlcnZlcnM6IElXb3JrYmVuY2hNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRwcml2YXRlIGZpbHRlcmVkQnVpbHRpbkNvdW50ID0gMDtcblx0cHJpdmF0ZSBmaWx0ZXJlZEFjdGl2ZVNlc3Npb25Db3VudCA9IDA7XG5cdHByaXZhdGUgZGlzcGxheUVudHJpZXM6IElNY3BMaXN0RW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIGdhbGxlcnlTZXJ2ZXJzOiBJV29ya2JlbmNoTWNwU2VydmVyW10gPSBbXTtcblx0cHJpdmF0ZSBzZWFyY2hRdWVyeTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgYnJvd3NlTW9kZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgbGFzdFdpZHRoOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIGxhc3RIZWFkZXJIZWlnaHQgPSAwO1xuXHRwcml2YXRlIF9sYXlvdXREZWZlcnJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZEdyb3VwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIGdhbGxlcnlDdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGF5ZWRGaWx0ZXIgPSBuZXcgRGVsYXllcjx2b2lkPigyMDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGF5ZWRHYWxsZXJ5U2VhcmNoID0gbmV3IERlbGF5ZXI8dm9pZD4oNDAwKTtcblx0cHJpdmF0ZSBfY2xvc2VDdXN0b21pemF0aW9uRWRpdG9yOiAoKSA9PiBQcm9taXNlPHZvaWQ+ID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElNY3BSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IG1jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnksXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElBZ2VudFBsdWdpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnLm1jcC1saXN0LXdpZGdldCcpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdFx0dGhpcy51cGRhdGVBY2Nlc3NTdGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obWNwQWNjZXNzQ29uZmlnKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFjY2Vzc1N0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5nYWxsZXJ5Q3RzPy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRDbG9zZUN1c3RvbWl6YXRpb25FZGl0b3IoY2xvc2VDdXN0b21pemF0aW9uRWRpdG9yOiAoKSA9PiBQcm9taXNlPHZvaWQ+KTogdm9pZCB7XG5cdFx0dGhpcy5fY2xvc2VDdXN0b21pemF0aW9uRWRpdG9yID0gY2xvc2VDdXN0b21pemF0aW9uRWRpdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUoKTogdm9pZCB7XG5cdFx0Ly8gU2VjdGlvbiB0aXRsZSBoZWFkZXIgKHRpdGxlICsgZGVzY3JpcHRpb24gd2l0aCBpbmxpbmUgbGVhcm4gbW9yZSkgYXQgdGhlIHRvcC5cblx0XHR0aGlzLnNlY3Rpb25UaXRsZUhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcuc2VjdGlvbi10aXRsZS1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvblRpdGxlSGVhZGVyLCAkKCcuc2VjdGlvbi10aXRsZS1yb3cnKSk7XG5cdFx0Y29uc3Qgc2VjdGlvblRpdGxlID0gRE9NLmFwcGVuZCh0aXRsZVJvdywgJCgnaDIuc2VjdGlvbi10aXRsZScpKTtcblx0XHRzZWN0aW9uVGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbWNwU2VydmVycycsIFwiTUNQIFNlcnZlcnNcIik7XG5cdFx0Y29uc3Qgc2VjdGlvblRpdGxlRGVzY3JpcHRpb24gPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvblRpdGxlSGVhZGVyLCAkKCdwLnNlY3Rpb24tdGl0bGUtZGVzY3JpcHRpb24nKSk7XG5cdFx0Y29uc3Qgc2VjdGlvblRpdGxlRGVzY3JpcHRpb25UZXh0ID0gRE9NLmFwcGVuZChzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiwgJCgnc3Bhbi5zZWN0aW9uLXRpdGxlLWRlc2NyaXB0aW9uLXRleHQnKSk7XG5cdFx0c2VjdGlvblRpdGxlRGVzY3JpcHRpb25UZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ21jcFNlcnZlcnNEZXNjcmlwdGlvbicsIFwiQW4gb3BlbiBzdGFuZGFyZCB0aGF0IGxldHMgQUkgdXNlIGV4dGVybmFsIHRvb2xzIGFuZCBzZXJ2aWNlcy4gTUNQIHNlcnZlcnMgcHJvdmlkZSB0b29scyBmb3IgZmlsZSBvcGVyYXRpb25zLCBkYXRhYmFzZXMsIEFQSXMsIGFuZCBtb3JlLlwiKTtcblx0XHQvLyBSZWFsIHdoaXRlc3BhY2UgdGV4dCBub2RlIGJldHdlZW4gZGVzY3JpcHRpb24gYW5kIGxpbmsgc28gdGhlIGdhcCBjb2xsYXBzZXNcblx0XHQvLyB3aGVuIHRoZSBsaW5rIHdyYXBzIHRvIGEgbmV3IGxpbmUgKGEgQ1NTIG1hcmdpbi1sZWZ0IHdvdWxkIHB1c2ggaXQgaW53YXJkKS5cblx0XHRzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHR0aGlzLnNlY3Rpb25MaW5rID0gRE9NLmFwcGVuZChzZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiwgJCgnYS5zZWN0aW9uLXRpdGxlLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0dGhpcy5zZWN0aW9uTGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsZWFybk1vcmVNY3AnLCBcIkxlYXJuIG1vcmUgYWJvdXQgTUNQIHNlcnZlcnNcIik7XG5cdFx0dGhpcy5zZWN0aW9uTGluay5ocmVmID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvYWdlbnQtY3VzdG9taXphdGlvbi9tY3Atc2VydmVycz9yZWZlcnJlcj1pbi1wcm9kdWN0Jztcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc2VjdGlvbkxpbmssICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRjb25zdCBocmVmID0gdGhpcy5zZWN0aW9uTGluay5ocmVmO1xuXHRcdFx0aWYgKGhyZWYpIHtcblx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKGhyZWYpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1sYXlvdXQgd2hlbiB0aGUgaGVhZGVyIGhlaWdodCBjaGFuZ2VzIHNvIHRoZSBsaXN0J3MgYWxsb3R0ZWRcblx0XHQvLyBoZWlnaHQgc3RheXMgaW4gc3luYyB3aXRoIHRoZSBhY3R1YWwgb24tc2NyZWVuIGhlYWRlciBzaXplLiBPbmx5XG5cdFx0Ly8gcmVsYXlvdXQgd2hlbiB0aGUgaGVhZGVyIGhlaWdodCBhY3R1YWxseSBjaGFuZ2VkIHRvIGF2b2lkIHJlZHVuZGFudFxuXHRcdC8vIHdvcmsgb24gRFBSIGNoYW5nZXMgb3Igd2lkdGgtb25seSByZXNpemVzLlxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IERPTS5nZXRXaW5kb3codGhpcy5lbGVtZW50KTtcblx0XHRjb25zdCBoZWFkZXJPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBET00uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKFxuXHRcdFx0J01jcExpc3RXaWRnZXQuc2VjdGlvblRpdGxlSGVhZGVyJyxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMubGFzdFdpZHRoIDw9IDAgfHwgdGhpcy5sYXN0SGVpZ2h0IDw9IDApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdFx0XHRpZiAoaGVhZGVySGVpZ2h0ID09PSB0aGlzLmxhc3RIZWFkZXJIZWlnaHQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5sYXN0SGVpZ2h0LCB0aGlzLmxhc3RXaWR0aCk7XG5cdFx0XHR9LFxuXHRcdFx0dGFyZ2V0V2luZG93LFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhlYWRlck9ic2VydmVyLm9ic2VydmUodGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIpKTtcblxuXHRcdC8vIFNlYXJjaCBhbmQgYnV0dG9uIGNvbnRhaW5lclxuXHRcdHRoaXMuc2VhcmNoQW5kQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5saXN0LXNlYXJjaC1hbmQtYnV0dG9uLWNvbnRhaW5lcicpKTtcblxuXHRcdC8vIFNlYXJjaCBjb250YWluZXJcblx0XHRjb25zdCBzZWFyY2hDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuc2VhcmNoQW5kQnV0dG9uQ29udGFpbmVyLCAkKCcubGlzdC1zZWFyY2gtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW5wdXRCb3goc2VhcmNoQ29udGFpbmVyLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdzZWFyY2hNY3BQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2guLi5cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hRdWVyeSA9IHRoaXMuc2VhcmNoSW5wdXQudmFsdWU7XG5cdFx0XHRpZiAodGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHRcdHRoaXMuZGVsYXllZEdhbGxlcnlTZWFyY2gudHJpZ2dlcigoKSA9PiB0aGlzLnF1ZXJ5R2FsbGVyeSgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZGVsYXllZEZpbHRlci50cmlnZ2VyKCgpID0+IHRoaXMuZmlsdGVyU2VydmVycygpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBCdXR0b24gY29udGFpbmVyIChCcm93c2UgTWFya2V0cGxhY2UgKyBBZGQgU2VydmVyKVxuXHRcdGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIsICQoJy5saXN0LWJ1dHRvbi1ncm91cCcpKTtcblxuXHRcdC8vIEJhY2sgYnV0dG9uICh2aXNpYmxlIG9ubHkgaW4gbWFya2V0cGxhY2UgYnJvd3NlIG1vZGUpXG5cdFx0Y29uc3QgYmFja0J1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoYnV0dG9uQ29udGFpbmVyLCAkKCcubGlzdC1hZGQtYnV0dG9uLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmJhY2tCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGJhY2tCdXR0b25Db250YWluZXIsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2JhY2tUb0luc3RhbGxlZCcsIFwiQmFjayB0byBpbnN0YWxsZWQgc2VydmVyc1wiKSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2JhY2tUb0luc3RhbGxlZCcsIFwiQmFjayB0byBpbnN0YWxsZWQgc2VydmVyc1wiKVxuXHRcdH0pKTtcblx0XHR0aGlzLmJhY2tCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uYXJyb3dMZWZ0LmlkfSkgJHtsb2NhbGl6ZSgnbWNwQnJvd3NlQmFjaycsIFwiQmFja1wiKX1gO1xuXHRcdHRoaXMuYmFja0J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpc3QtYWRkLWJ1dHRvbicpO1xuXHRcdGJhY2tCdXR0b25Db250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmJhY2tCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLnRvZ2dsZUJyb3dzZU1vZGUoZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEJyb3dzZSBNYXJrZXRwbGFjZSBidXR0b25cblx0XHRjb25zdCBicm93c2VCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3QtYWRkLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0dGhpcy5icm93c2VCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGJyb3dzZUJ1dHRvbkNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5icm93c2VCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24ubGlicmFyeS5pZH0pICR7bG9jYWxpemUoJ2Jyb3dzZU1hcmtldHBsYWNlJywgXCJCcm93c2UgTWFya2V0cGxhY2VcIil9YDtcblx0XHR0aGlzLmJyb3dzZUJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2xpc3QtYWRkLWJ1dHRvbicpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYnJvd3NlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy50b2dnbGVCcm93c2VNb2RlKCF0aGlzLmJyb3dzZU1vZGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuYWRkQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihidXR0b25Db250YWluZXIsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FkZFNlcnZlcicsIFwiQWRkIFNlcnZlclwiKSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2FkZFNlcnZlcicsIFwiQWRkIFNlcnZlclwiKVxuXHRcdH0pKTtcblx0XHR0aGlzLmFkZEJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5hZGQuaWR9KWA7XG5cdFx0dGhpcy5hZGRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaXN0LWljb24tYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy5hZGRCdXR0b24uZWxlbWVudCwgbG9jYWxpemUoJ2FkZFNlcnZlclRvb2x0aXAnLCBcIkFkZCBTZXJ2ZXJcIikpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFkZEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5BZGRDb25maWd1cmF0aW9uKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFbXB0eSBzdGF0ZVxuXHRcdHRoaXMuZW1wdHlDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLm1jcC1lbXB0eS1zdGF0ZScpKTtcblx0XHRjb25zdCBlbXB0eUhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5lbXB0eUNvbnRhaW5lciwgJCgnLmVtcHR5LXN0YXRlLWhlYWRlcicpKTtcblx0XHR0aGlzLmVtcHR5VGV4dCA9IERPTS5hcHBlbmQoZW1wdHlIZWFkZXIsICQoJy5lbXB0eS10ZXh0JykpO1xuXHRcdHRoaXMuZW1wdHlTdWJ0ZXh0ID0gRE9NLmFwcGVuZCh0aGlzLmVtcHR5Q29udGFpbmVyLCAkKCcuZW1wdHktc3VidGV4dCcpKTtcblxuXHRcdC8vIERpc2FibGVkIChhY2Nlc3MgYmxvY2tlZCkgc3RhdGUgXHUyMDE0IHNob3duIHdoZW4gY2hhdC5tY3AuYWNjZXNzIGlzIHNldCB0byBub25lLFxuXHRcdC8vIGVpdGhlciBieSB1c2VyIHNldHRpbmcgb3IgYnkgZW50ZXJwcmlzZSBwb2xpY3kuXG5cdFx0dGhpcy5kaXNhYmxlZENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcubWNwLWRpc2FibGVkLXN0YXRlJykpO1xuXHRcdGNvbnN0IGRpc2FibGVkSGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLmRpc2FibGVkQ29udGFpbmVyLCAkKCcuZW1wdHktc3RhdGUtaGVhZGVyJykpO1xuXHRcdHRoaXMuZGlzYWJsZWRJY29uID0gRE9NLmFwcGVuZChkaXNhYmxlZEhlYWRlciwgJCgnLmVtcHR5LWljb24nKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRUZXh0ID0gRE9NLmFwcGVuZChkaXNhYmxlZEhlYWRlciwgJCgnLmVtcHR5LXRleHQnKSk7XG5cdFx0ZGlzYWJsZWRUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ21jcEFjY2Vzc0Rpc2FibGVkVGl0bGUnLCBcIk1DUCBzZXJ2ZXJzIGFyZSBkaXNhYmxlZFwiKTtcblx0XHR0aGlzLmRpc2FibGVkTWVzc2FnZSA9IERPTS5hcHBlbmQodGhpcy5kaXNhYmxlZENvbnRhaW5lciwgJCgnLmVtcHR5LXN1YnRleHQnKSk7XG5cblx0XHQvLyBMaXN0IGNvbnRhaW5lclxuXHRcdHRoaXMubGlzdENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcubWNwLWxpc3QtY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gQ3JlYXRlIGxpc3Rcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBNY3BTZXJ2ZXJJdGVtRGVsZWdhdGUoKTtcblx0XHRjb25zdCBncm91cEhlYWRlclJlbmRlcmVyID0gbmV3IEN1c3RvbWl6YXRpb25Hcm91cEhlYWRlclJlbmRlcmVyPElNY3BHcm91cEhlYWRlckVudHJ5PignbWNwR3JvdXBIZWFkZXInLCB0aGlzLmhvdmVyU2VydmljZSk7XG5cdFx0Y29uc3QgbG9jYWxSZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2VydmVySXRlbVJlbmRlcmVyLCAoKSA9PiB0aGlzLl9jbG9zZUN1c3RvbWl6YXRpb25FZGl0b3IoKSk7XG5cdFx0Y29uc3QgZ2FsbGVyeVJlbmRlcmVyID0gbmV3IEdhbGxlcnlJdGVtUmVuZGVyZXI8SU1jcFNlcnZlckl0ZW1FbnRyeT4oTUNQX0dBTExFUllfSVRFTV9URU1QTEFURV9JRCwgbmV3IE1jcEdhbGxlcnlJdGVtUHJvdmlkZXIodGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLmxpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJTWNwTGlzdEVudHJ5Pixcblx0XHRcdCdNY3BNYW5hZ2VtZW50TGlzdCcsXG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdFtncm91cEhlYWRlclJlbmRlcmVyLCBsb2NhbFJlbmRlcmVyLCBnYWxsZXJ5UmVuZGVyZXJdLFxuXHRcdFx0e1xuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGVsZW1lbnQ6IElNY3BMaXN0RW50cnkpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBnZXRNY3BFbnRyeUFyaWFMYWJlbChlbGVtZW50LCB0aGlzLndvcmtzcGFjZVNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcFNlcnZlcnNMaXN0QXJpYUxhYmVsJywgXCJNQ1AgU2VydmVyc1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wZW5PblNpbmdsZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQoZWxlbWVudDogSU1jcExpc3RFbnRyeSkge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuaWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnYnVpbHRpbi1pdGVtJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5pZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LnNlcnZlci5pZDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldEdyb3VwSWQoZWxlbWVudDogSU1jcExpc3RFbnRyeSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicgPyBOb3RTZWxlY3RhYmxlR3JvdXBJZCA6IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0XHRpZiAoZS5lbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0XHRcdFx0dGhpcy50b2dnbGVHcm91cChlLmVsZW1lbnQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUuZWxlbWVudC50eXBlID09PSAnc2VydmVyLWl0ZW0nKSB7XG5cdFx0XHRcdFx0Ly8gTWFya2V0cGxhY2UgZW50cmllcyBhcmUgYWx3YXlzIHNlbGVjdGFibGU7IGluc3RhbGxlZCByb3dzIG9ubHkgb3BlblxuXHRcdFx0XHRcdC8vIGRldGFpbCB3aGVuIHRoZXJlIGlzIHNvbWV0aGluZyBleHRyYSB0byBzaG93IGJleW9uZCB0aGUgcm93LlxuXHRcdFx0XHRcdGNvbnN0IHNlcnZlciA9IGUuZWxlbWVudC5zZXJ2ZXI7XG5cdFx0XHRcdFx0Y29uc3QgaXNHYWxsZXJ5ID0gZS5lbGVtZW50Lm1hcmtldHBsYWNlIHx8ICFzZXJ2ZXIubG9jYWw7XG5cdFx0XHRcdFx0aWYgKGlzR2FsbGVyeSB8fCBzZXJ2ZXIuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0U2VydmVyLmZpcmUoc2VydmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50LnR5cGUgPT09ICdzZXNzaW9uLXNlcnZlci1pdGVtJykge1xuXHRcdFx0XHRcdHRoaXMub3BlbkFjdGl2ZVNlc3Npb25TZXJ2ZXJPcHRpb25zKGUuZWxlbWVudC5zZXJ2ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGJ1aWx0aW4taXRlbTogbm8gYWN0aW9uIG9uIGNsaWNrIChyZWFkLW9ubHkpXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGNvbnRleHQgbWVudVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUgYXMgSUxpc3RDb250ZXh0TWVudUV2ZW50PElNY3BMaXN0RW50cnk+KSkpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIE1DUCBzZXJ2aWNlIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghdGhpcy5icm93c2VNb2RlKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucygoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbml0aWFsIHJlZnJlc2hcblx0XHR2b2lkIHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmJyb3dzZU1vZGUpIHtcblx0XHRcdGF3YWl0IHRoaXMucXVlcnlHYWxsZXJ5KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZmlsdGVyU2VydmVycygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWNjZXNzU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5zcGVjdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxzdHJpbmc+KG1jcEFjY2Vzc0NvbmZpZyk7XG5cdFx0Y29uc3QgdmFsdWUgPSBpbnNwZWN0LnZhbHVlID8/IGluc3BlY3QuZGVmYXVsdFZhbHVlO1xuXHRcdGNvbnN0IGRpc2FibGVkID0gdmFsdWUgPT09IE1jcEFjY2Vzc1ZhbHVlLk5vbmU7XG5cdFx0Y29uc3QgcG9saWN5TG9ja2VkID0gaW5zcGVjdC5wb2xpY3lWYWx1ZSA9PT0gTWNwQWNjZXNzVmFsdWUuTm9uZTtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdhY2Nlc3MtZGlzYWJsZWQnLCBkaXNhYmxlZCk7XG5cblx0XHRpZiAoZGlzYWJsZWQpIHtcblx0XHRcdHRoaXMuZGlzYWJsZWRJY29uLmNsYXNzTmFtZSA9ICdlbXB0eS1pY29uJztcblx0XHRcdHRoaXMuZGlzYWJsZWRJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkocG9saWN5TG9ja2VkID8gQ29kaWNvbi5zaGllbGQgOiBtY3BTZXJ2ZXJJY29uKSk7XG5cblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5kaXNhYmxlZE1lc3NhZ2UpO1xuXHRcdFx0dGhpcy5kaXNhYmxlZExpbmtMaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0aWYgKHBvbGljeUxvY2tlZCkge1xuXHRcdFx0XHR0aGlzLmRpc2FibGVkTWVzc2FnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtY3BBY2Nlc3NEaXNhYmxlZEJ5UG9saWN5JywgXCJBY2Nlc3MgdG8gTUNQIHNlcnZlcnMgaXMgZGlzYWJsZWQgYnkgeW91ciBvcmdhbml6YXRpb24uIENvbnRhY3QgeW91ciBvcmdhbml6YXRpb24gYWRtaW5pc3RyYXRvciBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmRpc2FibGVkTWVzc2FnZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsb2NhbGl6ZSgnbWNwQWNjZXNzRGlzYWJsZWRCeVNldHRpbmdQcmVmaXgnLCBcIk1DUCBzZXJ2ZXJzIGFyZSBkaXNhYmxlZCBpbiBzZXR0aW5ncy4gXCIpKSk7XG5cdFx0XHRcdGNvbnN0IGxpbmsgPSBET00uYXBwZW5kKHRoaXMuZGlzYWJsZWRNZXNzYWdlLCAkKCdhLm1jcC1kaXNhYmxlZC1zZXR0aW5ncy1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdFx0XHRsaW5rLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ21jcEFjY2Vzc0Rpc2FibGVkU2V0dGluZ0xpbmsnLCBcIkNvbmZpZ3VyZSBpbiBzZXR0aW5ncy5cIik7XG5cdFx0XHRcdGxpbmsuaHJlZiA9ICcjJztcblx0XHRcdFx0bGluay5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdHRoaXMuZGlzYWJsZWRMaW5rTGlzdGVuZXIudmFsdWUgPSBET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgYEBpZDoke21jcEFjY2Vzc0NvbmZpZ31gKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNob3dCcm93c2VNYXJrZXRwbGFjZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0dGhpcy50b2dnbGVCcm93c2VNb2RlKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlQnJvd3NlTW9kZShicm93c2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmJyb3dzZU1vZGUgPSBicm93c2U7XG5cdFx0dGhpcy5zZWFyY2hJbnB1dC52YWx1ZSA9ICcnO1xuXHRcdHRoaXMuc2VhcmNoUXVlcnkgPSAnJztcblxuXHRcdC8vIFVwZGF0ZSBVSSBmb3IgYnJvd3NlIHZzIGluc3RhbGxlZCBtb2RlXG5cdFx0dGhpcy5hZGRCdXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gYnJvd3NlID8gJ25vbmUnIDogJyc7XG5cdFx0dGhpcy5icm93c2VCdXR0b24uZWxlbWVudC5wYXJlbnRFbGVtZW50IS5zdHlsZS5kaXNwbGF5ID0gYnJvd3NlID8gJ25vbmUnIDogJyc7XG5cdFx0dGhpcy5iYWNrQnV0dG9uLmVsZW1lbnQucGFyZW50RWxlbWVudCEuc3R5bGUuZGlzcGxheSA9IGJyb3dzZSA/ICcnIDogJ25vbmUnO1xuXG5cdFx0dGhpcy5zZWFyY2hJbnB1dC5zZXRQbGFjZUhvbGRlcihicm93c2Vcblx0XHRcdD8gbG9jYWxpemUoJ3NlYXJjaEdhbGxlcnlQbGFjZWhvbGRlcicsIFwiU2VhcmNoIE1DUCBtYXJrZXRwbGFjZS4uLlwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnc2VhcmNoTWNwUGxhY2Vob2xkZXInLCBcIlR5cGUgdG8gc2VhcmNoLi4uXCIpXG5cdFx0KTtcblxuXHRcdGlmIChicm93c2UpIHtcblx0XHRcdHZvaWQgdGhpcy5xdWVyeUdhbGxlcnkoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5nYWxsZXJ5Q3RzPy5kaXNwb3NlKHRydWUpO1xuXHRcdFx0dGhpcy5nYWxsZXJ5U2VydmVycyA9IFtdO1xuXHRcdFx0dGhpcy5maWx0ZXJTZXJ2ZXJzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmUtbGF5b3V0IHRvIGFjY291bnQgZm9yIHRoZSBiYWNrIGxpbmsgaGVpZ2h0IGNoYW5nZVxuXHRcdGlmICh0aGlzLmxhc3RIZWlnaHQgPiAwKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RIZWlnaHQsIHRoaXMubGFzdFdpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5R2FsbGVyeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmdhbGxlcnlDdHM/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5nYWxsZXJ5Q3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHQvLyBTaG93IGxvYWRpbmcgc3RhdGVcblx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbG9hZGluZ0dhbGxlcnknLCBcIkxvYWRpbmcgbWFya2V0cGxhY2UuLi5cIik7XG5cdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSAnJztcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYWdlciA9IGF3YWl0IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5xdWVyeUdhbGxlcnkoXG5cdFx0XHRcdHsgdGV4dDogdGhpcy5zZWFyY2hRdWVyeS50cmltKCkgfHwgdW5kZWZpbmVkIH0sXG5cdFx0XHRcdGN0cy50b2tlbixcblx0XHRcdCk7XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmdhbGxlcnlTZXJ2ZXJzID0gcGFnZXIuZmlyc3RQYWdlLml0ZW1zO1xuXHRcdFx0dGhpcy51cGRhdGVHYWxsZXJ5TGlzdCgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0aWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5nYWxsZXJ5U2VydmVycyA9IFtdO1xuXHRcdFx0XHR0aGlzLmVtcHR5Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdnYWxsZXJ5RXJyb3InLCBcIlVuYWJsZSB0byBsb2FkIG1hcmtldHBsYWNlXCIpO1xuXHRcdFx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0cnlBZ2FpbkxhdGVyJywgXCJDaGVjayB5b3VyIGNvbm5lY3Rpb24gYW5kIHRyeSBhZ2FpblwiKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUdhbGxlcnlMaXN0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmdhbGxlcnlTZXJ2ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRpZiAodGhpcy5zZWFyY2hRdWVyeS50cmltKCkpIHtcblx0XHRcdFx0dGhpcy5lbXB0eVRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9HYWxsZXJ5UmVzdWx0cycsIFwiTm8gc2VydmVycyBtYXRjaCAnezB9J1wiLCB0aGlzLnNlYXJjaFF1ZXJ5KTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndHJ5RGlmZmVyZW50U2VhcmNoJywgXCJUcnkgYSBkaWZmZXJlbnQgc2VhcmNoIHRlcm1cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdlbXB0eUdhbGxlcnknLCBcIk5vIE1DUCBzZXJ2ZXJzIGF2YWlsYWJsZVwiKTtcblx0XHRcdFx0dGhpcy5lbXB0eVN1YnRleHQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBJTWNwTGlzdEVudHJ5W10gPSB0aGlzLmdhbGxlcnlTZXJ2ZXJzLm1hcChzZXJ2ZXIgPT4gKHsgdHlwZTogJ3NlcnZlci1pdGVtJyBhcyBjb25zdCwgc2VydmVyLCBtYXJrZXRwbGFjZTogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5saXN0LnNwbGljZSgwLCB0aGlzLmxpc3QubGVuZ3RoLCBlbnRyaWVzKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyU2VydmVycygpOiB2b2lkIHtcblx0XHRjb25zdCBxdWVyeSA9IHRoaXMuc2VhcmNoUXVlcnkudG9Mb3dlckNhc2UoKS50cmltKCk7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gdGhpcy5jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlLmdldCgpO1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25NYXRjaGVyID0gbmV3IEFjdGl2ZVNlc3Npb25NY3BTZXJ2ZXJNYXRjaGVyKHRoaXMuYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuZ2V0TWNwU2VydmVycyhhY3RpdmVTZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRjb25zdCBsb2NhbFNlcnZlck1hdGNoZXIgPSBuZXcgTG9jYWxNY3BTZXJ2ZXJNYXRjaGVyKHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpKTtcblxuXHRcdGlmIChxdWVyeSkge1xuXHRcdFx0dGhpcy5maWx0ZXJlZFNlcnZlcnMgPSB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmlsdGVyKHNlcnZlciA9PlxuXHRcdFx0XHRzZXJ2ZXIubGFiZWwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkgfHxcblx0XHRcdFx0KHNlcnZlci5kZXNjcmlwdGlvbj8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkpXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmZpbHRlcmVkU2VydmVycyA9IFsuLi50aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UubG9jYWxdO1xuXHRcdH1cblxuXHRcdC8vIEZpbmQgZXh0ZW5zaW9uLXByb3ZpZGVkIHNlcnZlcnMgbm90IGluIHRoZSBsb2NhbCBsaXN0IChlLmcuIEdpdEh1YiBNQ1ApXG5cdFx0Y29uc3QgbG9jYWxJZHMgPSBuZXcgU2V0KHRoaXMuZmlsdGVyZWRTZXJ2ZXJzLm1hcChzID0+IHMuaWQpKTtcblx0XHRjb25zdCBidWlsdGluU2VydmVycyA9IHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpXG5cdFx0XHQuZmlsdGVyKHMgPT4gIWxvY2FsSWRzLmhhcyhzLmRlZmluaXRpb24uaWQpKVxuXHRcdFx0LmZpbHRlcihzID0+ICFxdWVyeSB8fCBzLmRlZmluaXRpb24ubGFiZWwudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzOiB7IHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlOyBsYWJlbDogc3RyaW5nOyBpY29uOiBUaGVtZUljb247IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGVudHJpZXM6IEFycmF5PElNY3BTZXJ2ZXJJdGVtRW50cnkgfCBJTWNwU2Vzc2lvblNlcnZlckl0ZW1FbnRyeT4gfVtdID0gW1xuXHRcdFx0eyBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UsIGxhYmVsOiBsb2NhbGl6ZSgnd29ya3NwYWNlR3JvdXAnLCBcIldvcmtzcGFjZVwiKSwgaWNvbjogd29ya3NwYWNlSWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3Jrc3BhY2VHcm91cERlc2NyaXB0aW9uJywgXCJNQ1Agc2VydmVycyBjb25maWd1cmVkIGluIHlvdXIgd29ya3NwYWNlIG9yIHJlcG9ydGVkIGJ5IHRoZSBhY3RpdmUgc2Vzc2lvbi5cIiksIGVudHJpZXM6IFtdIH0sXG5cdFx0XHR7IHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIsIGxhYmVsOiBsb2NhbGl6ZSgndXNlckdyb3VwJywgXCJVc2VyXCIpLCBpY29uOiB1c2VySWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCd1c2VyR3JvdXBEZXNjcmlwdGlvbicsIFwiTUNQIHNlcnZlcnMgY29uZmlndXJlZCBpbiB5b3VyIHVzZXIgc2V0dGluZ3MuIFByaXZhdGUgdG8geW91IGFuZCBhdmFpbGFibGUgYWNyb3NzIGFsbCBwcm9qZWN0cy5cIiksIGVudHJpZXM6IFtdIH0sXG5cdFx0XTtcblxuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMuZmlsdGVyZWRTZXJ2ZXJzKSB7XG5cdFx0XHRjb25zdCBlbnRyeTogSU1jcFNlcnZlckl0ZW1FbnRyeSA9IHtcblx0XHRcdFx0dHlwZTogJ3NlcnZlci1pdGVtJyxcblx0XHRcdFx0c2VydmVyLFxuXHRcdFx0XHRhY3RpdmVTZXNzaW9uU2VydmVyOiBhY3RpdmVTZXNzaW9uTWF0Y2hlci50YWtlKGdldFdvcmtiZW5jaFNlcnZlck1hdGNoS2V5cyhzZXJ2ZXIpKSxcblx0XHRcdFx0bG9jYWxTZXJ2ZXI6IGxvY2FsU2VydmVyTWF0Y2hlci5maW5kKGdldFdvcmtiZW5jaFNlcnZlck1hdGNoS2V5cyhzZXJ2ZXIpKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzY29wZSA9IHNlcnZlci5sb2NhbD8uc2NvcGU7XG5cdFx0XHRpZiAoc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdGdyb3Vwc1swXS5lbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVXNlciwgUmVtb3RlVXNlciwgb3IgdW5rbm93biBcdTIxOTIgZ3JvdXAgdW5kZXIgVXNlclxuXHRcdFx0XHRncm91cHNbMV0uZW50cmllcy5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgcGx1Z2luLXByb3ZpZGVkLCBleHRlbnNpb24tcHJvdmlkZWQsIGFuZCBidWlsdC1pbiBzZXJ2ZXJzLlxuXHRcdC8vIFNlcnZlcnMgZnJvbSB0aGUgQ29waWxvdCBleHRlbnNpb24gKGdpdGh1Yi5jb3BpbG90IC8gZ2l0aHViLmNvcGlsb3QtY2hhdClcblx0XHQvLyBhcmUgdHJlYXRlZCBhcyBidWlsdC1pbjsgc2VydmVycyBmcm9tIG90aGVyIGV4dGVuc2lvbnMgZ28gdW5kZXIgXCJFeHRlbnNpb25zXCIuXG5cdFx0Y29uc3QgY29sbGVjdGlvblNvdXJjZXMgPSBuZXcgTWFwKHRoaXMubWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkubWFwKGMgPT4gW2MuaWQsIGMuc291cmNlXSkpO1xuXHRcdGNvbnN0IHBsdWdpblNlcnZlcnM6IEFycmF5PHsgc2VydmVyOiBJTWNwU2VydmVyOyBhY3RpdmVTZXNzaW9uU2VydmVyPzogQWdlbnRIb3N0TWNwU2VydmVyIH0+ID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VydmVyczogQXJyYXk8eyBzZXJ2ZXI6IElNY3BTZXJ2ZXI7IGFjdGl2ZVNlc3Npb25TZXJ2ZXI/OiBBZ2VudEhvc3RNY3BTZXJ2ZXIgfT4gPSBbXTtcblx0XHRjb25zdCBvdGhlckJ1aWx0aW5TZXJ2ZXJzOiBBcnJheTx7IHNlcnZlcjogSU1jcFNlcnZlcjsgYWN0aXZlU2Vzc2lvblNlcnZlcj86IEFnZW50SG9zdE1jcFNlcnZlciB9PiA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIGJ1aWx0aW5TZXJ2ZXJzKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHsgc2VydmVyLCBhY3RpdmVTZXNzaW9uU2VydmVyOiBhY3RpdmVTZXNzaW9uTWF0Y2hlci50YWtlKGdldFJ1bnRpbWVTZXJ2ZXJNYXRjaEtleXMoc2VydmVyKSkgfTtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGNvbGxlY3Rpb25Tb3VyY2VzLmdldChzZXJ2ZXIuY29sbGVjdGlvbi5pZCk7XG5cdFx0XHRpZiAoc2VydmVyLmNvbGxlY3Rpb24uaWQuc3RhcnRzV2l0aChQTFVHSU5fQ09MTEVDVElPTl9QUkVGSVgpKSB7XG5cdFx0XHRcdHBsdWdpblNlcnZlcnMucHVzaChlbnRyeSk7XG5cdFx0XHR9IGVsc2UgaWYgKHNvdXJjZSBpbnN0YW5jZW9mIEV4dGVuc2lvbklkZW50aWZpZXIgJiYgIWlzQ29waWxvdEV4dGVuc2lvbihzb3VyY2UpKSB7XG5cdFx0XHRcdGV4dGVuc2lvblNlcnZlcnMucHVzaChlbnRyeSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdGhlckJ1aWx0aW5TZXJ2ZXJzLnB1c2goZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uT25seVNlcnZlcnMgPSBhY3RpdmVTZXNzaW9uTWF0Y2hlci51bm1hdGNoZWQocXVlcnkpO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIGFjdGl2ZVNlc3Npb25Pbmx5U2VydmVycykge1xuXHRcdFx0Z3JvdXBzWzBdLmVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXNzaW9uLXNlcnZlci1pdGVtJywgc2VydmVyIH0pO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgZW1wdHkgc3RhdGUgb25seSB3aGVuIHRoZXJlIGFyZSBubyBzZXJ2ZXJzIGF0IGFsbCAobm90IHdoZW4gZmlsdGVyZWQgdG8gZW1wdHkpXG5cdFx0aWYgKHRoaXMuZmlsdGVyZWRTZXJ2ZXJzLmxlbmd0aCA9PT0gMCAmJiBidWlsdGluU2VydmVycy5sZW5ndGggPT09IDAgJiYgYWN0aXZlU2Vzc2lvbk9ubHlTZXJ2ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRcdGlmICh0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKSkge1xuXHRcdFx0XHQvLyBTZWFyY2ggd2l0aCBubyByZXN1bHRzXG5cdFx0XHRcdHRoaXMuZW1wdHlUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vTWF0Y2hpbmdTZXJ2ZXJzJywgXCJObyBzZXJ2ZXJzIG1hdGNoICd7MH0nXCIsIHRoaXMuc2VhcmNoUXVlcnkpO1xuXHRcdFx0XHR0aGlzLmVtcHR5U3VidGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0cnlEaWZmZXJlbnRTZWFyY2gnLCBcIlRyeSBhIGRpZmZlcmVudCBzZWFyY2ggdGVybVwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vIHNlcnZlcnMgY29uZmlndXJlZFxuXHRcdFx0XHR0aGlzLmVtcHR5VGV4dC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdub01jcFNlcnZlcnMnLCBcIk5vIE1DUCBzZXJ2ZXJzIGNvbmZpZ3VyZWRcIik7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdWJ0ZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FkZE1jcFNlcnZlcicsIFwiQWRkIGFuIE1DUCBzZXJ2ZXIgY29uZmlndXJhdGlvbiB0byBnZXQgc3RhcnRlZFwiKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbXB0eUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBJTWNwTGlzdEVudHJ5W10gPSBbXTtcblx0XHRsZXQgaXNGaXJzdCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGlmIChncm91cC5lbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhncm91cC5zY29wZSk7XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnZ3JvdXAtaGVhZGVyJyxcblx0XHRcdFx0aWQ6IGBtY3AtZ3JvdXAtJHtncm91cC5zY29wZX1gLFxuXHRcdFx0XHRzY29wZTogZ3JvdXAuc2NvcGUsXG5cdFx0XHRcdGxhYmVsOiBncm91cC5sYWJlbCxcblx0XHRcdFx0aWNvbjogZ3JvdXAuaWNvbixcblx0XHRcdFx0Y291bnQ6IGdyb3VwLmVudHJpZXMubGVuZ3RoLFxuXHRcdFx0XHRpc0ZpcnN0LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZ3JvdXAuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGNvbGxhcHNlZCxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFjb2xsYXBzZWQpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKC4uLmdyb3VwLmVudHJpZXMpO1xuXHRcdFx0fVxuXHRcdFx0aXNGaXJzdCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChwbHVnaW5TZXJ2ZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcygncGx1Z2luJyk7XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnZ3JvdXAtaGVhZGVyJyxcblx0XHRcdFx0aWQ6ICdtY3AtZ3JvdXAtcGx1Z2luJyxcblx0XHRcdFx0c2NvcGU6ICdwbHVnaW4nLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3BsdWdpbkdyb3VwJywgXCJQbHVnaW5zXCIpLFxuXHRcdFx0XHRpY29uOiBwbHVnaW5JY29uLFxuXHRcdFx0XHRjb3VudDogcGx1Z2luU2VydmVycy5sZW5ndGgsXG5cdFx0XHRcdGlzRmlyc3QsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGx1Z2luR3JvdXBEZXNjcmlwdGlvbicsIFwiTUNQIHNlcnZlcnMgcHJvdmlkZWQgYnkgaW5zdGFsbGVkIHBsdWdpbnMuXCIpLFxuXHRcdFx0XHRjb2xsYXBzZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29sbGFwc2VkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBzZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXIgfSBvZiBwbHVnaW5TZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKGNyZWF0ZUJ1aWx0aW5FbnRyeShzZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aXNGaXJzdCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25TZXJ2ZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcygnZXh0ZW5zaW9uJyk7XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnZ3JvdXAtaGVhZGVyJyxcblx0XHRcdFx0aWQ6ICdtY3AtZ3JvdXAtZXh0ZW5zaW9uJyxcblx0XHRcdFx0c2NvcGU6ICdleHRlbnNpb24nLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2V4dGVuc2lvbkdyb3VwJywgXCJFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHRpY29uOiBleHRlbnNpb25JY29uLFxuXHRcdFx0XHRjb3VudDogZXh0ZW5zaW9uU2VydmVycy5sZW5ndGgsXG5cdFx0XHRcdGlzRmlyc3QsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uR3JvdXBEZXNjcmlwdGlvbicsIFwiTUNQIHNlcnZlcnMgY29udHJpYnV0ZWQgYnkgaW5zdGFsbGVkIFZTIENvZGUgZXh0ZW5zaW9ucy5cIiksXG5cdFx0XHRcdGNvbGxhcHNlZCxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFjb2xsYXBzZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB7IHNlcnZlciwgYWN0aXZlU2Vzc2lvblNlcnZlciB9IG9mIGV4dGVuc2lvblNlcnZlcnMpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goY3JlYXRlQnVpbHRpbkVudHJ5KHNlcnZlciwgYWN0aXZlU2Vzc2lvblNlcnZlcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpc0ZpcnN0ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVyQnVpbHRpblNlcnZlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5jb2xsYXBzZWRHcm91cHMuaGFzKCdidWlsdGluJyk7XG5cdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnZ3JvdXAtaGVhZGVyJyxcblx0XHRcdFx0aWQ6ICdtY3AtZ3JvdXAtYnVpbHRpbicsXG5cdFx0XHRcdHNjb3BlOiAnYnVpbHRpbicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnVpbHRJbkdyb3VwJywgXCJCdWlsdC1pblwiKSxcblx0XHRcdFx0aWNvbjogYnVpbHRpbkljb24sXG5cdFx0XHRcdGNvdW50OiBvdGhlckJ1aWx0aW5TZXJ2ZXJzLmxlbmd0aCxcblx0XHRcdFx0aXNGaXJzdCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdidWlsdEluR3JvdXBEZXNjcmlwdGlvbicsIFwiTUNQIHNlcnZlcnMgYnVpbHQgaW50byBWUyBDb2RlLiBUaGVzZSBhcmUgYXZhaWxhYmxlIGF1dG9tYXRpY2FsbHkuXCIpLFxuXHRcdFx0XHRjb2xsYXBzZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlmICghY29sbGFwc2VkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBzZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXIgfSBvZiBvdGhlckJ1aWx0aW5TZXJ2ZXJzKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKGNyZWF0ZUJ1aWx0aW5FbnRyeShzZXJ2ZXIsIGFjdGl2ZVNlc3Npb25TZXJ2ZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aXNGaXJzdCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuZGlzcGxheUVudHJpZXMgPSBlbnRyaWVzO1xuXHRcdHRoaXMubGlzdC5zcGxpY2UoMCwgdGhpcy5saXN0Lmxlbmd0aCwgdGhpcy5kaXNwbGF5RW50cmllcyk7XG5cblx0XHQvLyBDb21wdXRlIHNpZGViYXIgYmFkZ2UgZGlyZWN0bHkgZnJvbSB0aGUgZGF0YSBhcnJheXMgKHNhbWUgc291cmNlIGFzIGdyb3VwIGhlYWRlcnMpXG5cdFx0dGhpcy5maWx0ZXJlZEJ1aWx0aW5Db3VudCA9IGJ1aWx0aW5TZXJ2ZXJzLmxlbmd0aDtcblx0XHR0aGlzLmZpbHRlcmVkQWN0aXZlU2Vzc2lvbkNvdW50ID0gYWN0aXZlU2Vzc2lvbk9ubHlTZXJ2ZXJzLmxlbmd0aDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5maXJlKHRoaXMuaXRlbUNvdW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSB0b3RhbCBpdGVtIGNvdW50IGZyb20gdGhlIHVuZGVybHlpbmcgZGF0YSBhcnJheXNcblx0ICogKHRoZSBzYW1lIHNvdXJjZSB1c2VkIHRvIGJ1aWxkIGdyb3VwIGhlYWRlcnMpLlxuXHQgKi9cblx0Z2V0IGl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmZpbHRlcmVkU2VydmVycy5sZW5ndGggKyB0aGlzLmZpbHRlcmVkQnVpbHRpbkNvdW50ICsgdGhpcy5maWx0ZXJlZEFjdGl2ZVNlc3Npb25Db3VudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1maXJlcyB0aGUgY3VycmVudCBpdGVtIGNvdW50LiBDYWxsIGFmdGVyIHN1YnNjcmliaW5nIHRvIG9uRGlkQ2hhbmdlSXRlbUNvdW50XG5cdCAqIHRvIGVuc3VyZSB0aGUgc3Vic2NyaWJlciByZWNlaXZlcyB0aGUgbGF0ZXN0IGNvdW50LlxuXHQgKi9cblx0ZmlyZUl0ZW1Db3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5maXJlKHRoaXMuaXRlbUNvdW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSBjb2xsYXBzZWQgc3RhdGUgb2YgYSBncm91cC5cblx0ICovXG5cdHByaXZhdGUgdG9nZ2xlR3JvdXAoZW50cnk6IElNY3BHcm91cEhlYWRlckVudHJ5KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhlbnRyeS5zY29wZSkpIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmRlbGV0ZShlbnRyeS5zY29wZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmFkZChlbnRyeS5zY29wZSk7XG5cdFx0fVxuXHRcdHRoaXMuZmlsdGVyU2VydmVycygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHdpZGdldCBpcyBjdXJyZW50bHkgaW4gbWFya2V0cGxhY2UgYnJvd3NlIG1vZGUuXG5cdCAqL1xuXHRpc0luQnJvd3NlTW9kZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5icm93c2VNb2RlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4aXRzIG1hcmtldHBsYWNlIGJyb3dzZSBtb2RlIGFuZCByZXR1cm5zIHRvIHRoZSBpbnN0YWxsZWQgc2VydmVycyBsaXN0LlxuXHQgKi9cblx0ZXhpdEJyb3dzZU1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYnJvd3NlTW9kZSkge1xuXHRcdFx0dGhpcy50b2dnbGVCcm93c2VNb2RlKGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTGF5b3V0cyB0aGUgd2lkZ2V0LlxuXHQgKi9cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMubGFzdFdpZHRoID0gd2lkdGg7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0Y29uc3QgYXZhaWxhYmxlSGVpZ2h0ID0gdGhpcy5lbGVtZW50LmNsaWVudEhlaWdodCB8fCBoZWlnaHQ7XG5cdFx0Y29uc3QgYXZhaWxhYmxlV2lkdGggPSB0aGlzLmVsZW1lbnQuY2xpZW50V2lkdGggfHwgd2lkdGg7XG5cblx0XHQvLyBNZWFzdXJlIHNpYmxpbmcgZWxlbWVudHMgdG8gY2FsY3VsYXRlIHRoZSBsaXN0IGhlaWdodC5cblx0XHQvLyBXaGVuIG9mZnNldEhlaWdodCByZXR1cm5zIDAgdGhlIGNvbnRhaW5lciBtYXkgaGF2ZSBqdXN0IGJlY29tZSB2aXNpYmxlXG5cdFx0Ly8gYWZ0ZXIgZGlzcGxheTpub25lIGFuZCB0aGUgYnJvd3NlciBoYXNuJ3QgcmVmbG93ZWQgeWV0IFx1MjAxNCBkZWZlciBsYXlvdXRcblx0XHQvLyBvbmNlIHNvIG1lYXN1cmVtZW50cyBhcmUgYWNjdXJhdGUuIE9ubHkgcmV0cnkgb25jZSB0byBhdm9pZCBhbiBlbmRsZXNzXG5cdFx0Ly8gbG9vcCB3aGVuIHRoZSB3aWRnZXQgaXMgY3JlYXRlZCB3aGlsZSBwZXJtYW5lbnRseSBoaWRkZW4uXG5cdFx0Y29uc3Qgc2VhcmNoQmFySGVpZ2h0ID0gdGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdGlmIChzZWFyY2hCYXJIZWlnaHQgPT09IDAgJiYgIXRoaXMuX2xheW91dERlZmVycmVkKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXREZWZlcnJlZCA9IHRydWU7XG5cdFx0XHRET00uZ2V0V2luZG93KHRoaXMuZWxlbWVudCkucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RIZWlnaHQsIHRoaXMubGFzdFdpZHRoKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXREZWZlcnJlZCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdHRoaXMubGFzdEhlYWRlckhlaWdodCA9IGhlYWRlckhlaWdodDtcblx0XHRjb25zdCBsaXN0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgYXZhaWxhYmxlSGVpZ2h0IC0gc2VhcmNoQmFySGVpZ2h0IC0gaGVhZGVySGVpZ2h0KTtcblxuXHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtsaXN0SGVpZ2h0fXB4YDtcblx0XHR0aGlzLmxpc3QubGF5b3V0KGxpc3RIZWlnaHQsIGF2YWlsYWJsZVdpZHRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBzZWFyY2ggaW5wdXQuXG5cdCAqL1xuXHRmb2N1c1NlYXJjaCgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2Nyb2xscyB0aGUgbGlzdCBzbyB0aGUgbGFzdCBpdGVtIGlzIHZpc2libGUuXG5cdCAqL1xuXHRyZXZlYWxMYXN0SXRlbSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saXN0Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubGlzdC5yZXZlYWwodGhpcy5saXN0Lmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBsaXN0LlxuXHQgKi9cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0LmRvbUZvY3VzKCk7XG5cdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMubGlzdC5sZW5ndGg7XG5cdFx0aWYgKHNlcnZlcnMgPiAwKSB7XG5cdFx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9wZW5BY3RpdmVTZXNzaW9uU2VydmVyT3B0aW9ucyhzZXJ2ZXI6IEFnZW50SG9zdE1jcFNlcnZlcik6IHZvaWQge1xuXHRcdHZvaWQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsIHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5nZXQoKSwgc2VydmVyLmlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGNvbnRleHQgbWVudSBmb3IgTUNQIHNlcnZlciBpdGVtcy5cblx0ICovXG5cdHByaXZhdGUgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SU1jcExpc3RFbnRyeT4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmVsZW1lbnQudHlwZSA9PT0gJ3Nlc3Npb24tc2VydmVyLWl0ZW0nKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IGlzRW1wdHlXb3JrYmVuY2ggPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSA9PT0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbkFjdGlvbnMgPSBnZXRBY3RpdmVTZXNzaW9uU2VydmVyT3B0aW9uc0FjdGlvbnModGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgaXNFbXB0eVdvcmtiZW5jaCwgdGhpcy5jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuYWN0aXZlU2Vzc2lvblJlc291cmNlLmdldCgpLCBlLmVsZW1lbnQuc2VydmVyKTtcblx0XHRcdGFjdGl2ZVNlc3Npb25BY3Rpb25zLmZvckVhY2goYWN0aW9uID0+IGlzRGlzcG9zYWJsZShhY3Rpb24pICYmIGRpc3Bvc2FibGVzLmFkZChhY3Rpb24pKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGl2ZVNlc3Npb25BY3Rpb25zLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWx0LWluIHJvd3MgdXNlIElNY3BTZXJ2aWNlIGZvciBkdXJhYmxlIGVuYWJsZW1lbnQgYW5kIHRoZSBhZ2VudCBob3N0IGZvciBzZXNzaW9uIGVuYWJsZW1lbnQuXG5cdFx0aWYgKGUuZWxlbWVudC50eXBlID09PSAnYnVpbHRpbi1pdGVtJykge1xuXHRcdFx0Y29uc3QgY29sbGVjdGlvbklkID0gZS5lbGVtZW50LmNvbGxlY3Rpb25JZDtcblx0XHRcdGNvbnN0IHBsdWdpblVyaVN0ciA9IGdldFBsdWdpblVyaUZyb21Db2xsZWN0aW9uSWQoY29sbGVjdGlvbklkKTtcblx0XHRcdGNvbnN0IHBsdWdpbiA9IHBsdWdpblVyaVN0ciA/IHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMuZ2V0KCkuZmluZChwID0+IHAudXJpLnRvU3RyaW5nKCkgPT09IHBsdWdpblVyaVN0cikgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBsaWZlY3ljbGVBY3Rpb24gPSBlLmVsZW1lbnQuYWN0aXZlU2Vzc2lvblNlcnZlciA/IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJMaWZlY3ljbGVBY3Rpb24oZS5lbGVtZW50LmFjdGl2ZVNlc3Npb25TZXJ2ZXIpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGxpZmVjeWNsZUFjdGlvbikge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2goZGlzcG9zYWJsZXMuYWRkKGxpZmVjeWNsZUFjdGlvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5lbGVtZW50LmxvY2FsU2VydmVyKSB7XG5cdFx0XHRcdGNvbnN0IGlzRW1wdHlXb3JrYmVuY2ggPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSA9PT0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBlbmFibGVtZW50QWN0aW9ucyA9IGdldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnModGhpcy5tY3BTZXJ2aWNlLCBlLmVsZW1lbnQubG9jYWxTZXJ2ZXIuZGVmaW5pdGlvbi5pZCwgaXNFbXB0eVdvcmtiZW5jaCk7XG5cdFx0XHRcdGlmIChlbmFibGVtZW50QWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgZW5hYmxlbWVudEFjdGlvbiBvZiBlbmFibGVtZW50QWN0aW9ucykge1xuXHRcdFx0XHRcdFx0aWYgKGlzRGlzcG9zYWJsZShlbmFibGVtZW50QWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoZW5hYmxlbWVudEFjdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2goZW5hYmxlbWVudEFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmVsZW1lbnQuYWN0aXZlU2Vzc2lvblNlcnZlcikge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uQWN0aW9uID0gZ2V0U2Vzc2lvbkVuYWJsZW1lbnRBY3Rpb24oZS5lbGVtZW50LmFjdGl2ZVNlc3Npb25TZXJ2ZXIpO1xuXHRcdFx0XHRpZiAoaXNEaXNwb3NhYmxlKHNlc3Npb25BY3Rpb24pKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlc3Npb25BY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGlvbnMucHVzaChzZXNzaW9uQWN0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBsdWdpbikge1xuXHRcdFx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCdtY3BTZXJ2ZXIuc2hvd1BsdWdpbicsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3Nob3dQbHVnaW4nLCBcIlNob3cgUGx1Z2luXCIpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6IEFnZW50UGx1Z2luSXRlbUtpbmQuSW5zdGFsbGVkIGFzIGNvbnN0LFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBwbHVnaW4ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBwbHVnaW4uZnJvbU1hcmtldHBsYWNlPy5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdFx0bWFya2V0cGxhY2U6IHBsdWdpbi5mcm9tTWFya2V0cGxhY2U/Lm1hcmtldHBsYWNlLFxuXHRcdFx0XHRcdFx0XHRwbHVnaW4sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0U2hvd1BsdWdpbi5maXJlKGl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KSkpO1xuXHRcdFx0XHRhY3Rpb25zLnB1c2goZGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0J21jcFNlcnZlci51bmluc3RhbGxQbHVnaW4nLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd1bmluc3RhbGxQbHVnaW4nLCBcIlVuaW5zdGFsbCBQbHVnaW5cIiksXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybVVuaW5zdGFsbFBsdWdpbk1jcCcsIFwiVGhpcyBNQ1Agc2VydmVyIGlzIHByb3ZpZGVkIGJ5IHRoZSBwbHVnaW4gJ3swfSdcIiwgcGx1Z2luLmxhYmVsKSxcblx0XHRcdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY29uZmlybVVuaW5zdGFsbFBsdWdpbk1jcERldGFpbCcsIFwiSW5kaXZpZHVhbCBNQ1Agc2VydmVycyBmcm9tIGEgcGx1Z2luIGNhbm5vdCBiZSByZW1vdmVkIHNlcGFyYXRlbHkuIFdvdWxkIHlvdSBsaWtlIHRvIHVuaW5zdGFsbCB0aGUgZW50aXJlIHBsdWdpbj9cIiksXG5cdFx0XHRcdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCd1bmluc3RhbGxQbHVnaW5CdG4nLCBcIlVuaW5zdGFsbCBQbHVnaW5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdHBsdWdpbi5yZW1vdmU/LigpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmVsZW1lbnQudHlwZSAhPT0gJ3NlcnZlci1pdGVtJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZlckVudHJ5ID0gZS5lbGVtZW50O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1jcFNlcnZlciA9IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5sb2NhbC5maW5kKGxvY2FsID0+IGxvY2FsLmlkID09PSBzZXJ2ZXJFbnRyeS5zZXJ2ZXIuaWQpIHx8IHNlcnZlckVudHJ5LnNlcnZlcjtcblxuXHRcdC8vIExvY2FsIHNlcnZlciBhY3Rpb25zIGFscmVhZHkgaW5jbHVkZSBkdXJhYmxlIHByb2ZpbGUvd29ya3NwYWNlIGVuYWJsZW1lbnQuXG5cdFx0Y29uc3QgZ3JvdXBzOiBJQWN0aW9uW11bXSA9IGdldENvbnRleHRNZW51QWN0aW9ucyhtY3BTZXJ2ZXIsIGZhbHNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uTGlmZWN5Y2xlQWN0aW9uID0gc2VydmVyRW50cnkuYWN0aXZlU2Vzc2lvblNlcnZlciA/IGdldEFjdGl2ZVNlc3Npb25TZXJ2ZXJMaWZlY3ljbGVBY3Rpb24oc2VydmVyRW50cnkuYWN0aXZlU2Vzc2lvblNlcnZlcikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbkVuYWJsZW1lbnRBY3Rpb24gPSBzZXJ2ZXJFbnRyeS5hY3RpdmVTZXNzaW9uU2VydmVyID8gZ2V0U2Vzc2lvbkVuYWJsZW1lbnRBY3Rpb24oc2VydmVyRW50cnkuYWN0aXZlU2Vzc2lvblNlcnZlcikgOiB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlc3Npb25FbmFibGVtZW50QWRkZWQgPSBmYWxzZTtcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbkxpZmVjeWNsZUFjdGlvbikge1xuXHRcdFx0YWN0aW9ucy5wdXNoKGRpc3Bvc2FibGVzLmFkZChhY3RpdmVTZXNzaW9uTGlmZWN5Y2xlQWN0aW9uKSk7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cdFx0aWYgKGFjdGl2ZVNlc3Npb25FbmFibGVtZW50QWN0aW9uICYmIGlzRGlzcG9zYWJsZShhY3RpdmVTZXNzaW9uRW5hYmxlbWVudEFjdGlvbikpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhY3RpdmVTZXNzaW9uRW5hYmxlbWVudEFjdGlvbik7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbWVudUFjdGlvbnMgb2YgZ3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb24gb2YgbWVudUFjdGlvbnMpIHtcblx0XHRcdFx0aWYgKGlzRGlzcG9zYWJsZShtZW51QWN0aW9uKSkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChtZW51QWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmlzaWJsZU1lbnVBY3Rpb25zID0gc2VydmVyRW50cnkuYWN0aXZlU2Vzc2lvblNlcnZlclxuXHRcdFx0XHQ/IG1lbnVBY3Rpb25zLmZpbHRlcihhY3Rpb24gPT4gIXNob3VsZEhpZGVMb2NhbEFjdGlvbkZvckFjdGl2ZVNlc3Npb25TZXJ2ZXIoYWN0aW9uKSlcblx0XHRcdFx0OiBtZW51QWN0aW9ucztcblx0XHRcdGZvciAoY29uc3QgbWVudUFjdGlvbiBvZiB2aXNpYmxlTWVudUFjdGlvbnMpIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKG1lbnVBY3Rpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb25FbmFibGVtZW50QWN0aW9uICYmIG1lbnVBY3Rpb25zLnNvbWUoaXNMb2NhbE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb24pKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChhY3RpdmVTZXNzaW9uRW5hYmxlbWVudEFjdGlvbik7XG5cdFx0XHRcdHNlc3Npb25FbmFibGVtZW50QWRkZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZpc2libGVNZW51QWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYWN0aXZlU2Vzc2lvbkVuYWJsZW1lbnRBY3Rpb24gJiYgIXNlc3Npb25FbmFibGVtZW50QWRkZWQpIHtcblx0XHRcdGFjdGlvbnMucHVzaChhY3RpdmVTZXNzaW9uRW5hYmxlbWVudEFjdGlvbik7XG5cdFx0fVxuXHRcdC8vIFJlbW92ZSB0cmFpbGluZyBzZXBhcmF0b3Jcblx0XHRpZiAoYWN0aW9ucy5sZW5ndGggPiAwICYmIGFjdGlvbnNbYWN0aW9ucy5sZW5ndGggLSAxXSBpbnN0YW5jZW9mIFNlcGFyYXRvcikge1xuXHRcdFx0YWN0aW9ucy5wb3AoKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGlu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
