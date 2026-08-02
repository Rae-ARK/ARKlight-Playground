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
import { $, addDisposableListener, disposableWindowInterval, EventType } from "../../../../base/browser/dom.js";
import { renderMarkdown } from "../../../../base/browser/markdownRenderer.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { findLast } from "../../../../base/common/arraysFind.js";
import { assertNever } from "../../../../base/common/assert.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { groupBy } from "../../../../base/common/collections.js";
import { Event } from "../../../../base/common/event.js";
import { createMarkdownCommandLink, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, derivedObservableWithCache, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { hasKey, isDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { Range } from "../../../../editor/common/core/range.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, MenuId, MenuItemAction, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { McpServerStatus } from "../../../../platform/agentHost/common/state/protocol/state.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { mcpAutoStartConfig, McpAutoStartValue } from "../../../../platform/mcp/common/mcpManagement.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { defaultCheckboxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { spinningLoading } from "../../../../platform/theme/common/iconRegistry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { ActiveEditorContext, RemoteNameContext, ResourceContextKey, WorkbenchStateContext, WorkspaceFolderCountContext } from "../../../common/contextkeys.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IAuthenticationQueryService } from "../../../services/authentication/common/authenticationQuery.js";
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from "../../../services/configuration/common/configuration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IRemoteUserDataProfilesService } from "../../../services/userDataProfile/common/remoteUserDataProfiles.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { CHAT_CONFIG_MENU_ID } from "../../chat/browser/actions/chatActions.js";
import { ChatViewId, IChatWidgetService } from "../../chat/browser/chat.js";
import { IAgentHostCustomizationService } from "../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IAICustomizationWorkspaceService } from "../../chat/common/aiCustomizationWorkspaceService.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { ChatAgentLocation, ChatModeKind } from "../../chat/common/constants.js";
import { ContributionEnablementState, isContributionDisabled } from "../../chat/common/enablement.js";
import { ILanguageModelsService } from "../../chat/common/languageModels.js";
import { ILanguageModelToolsService } from "../../chat/common/tools/languageModelToolsService.js";
import { extensionsFilterSubMenu, IExtensionsWorkbenchService, VIEWLET_ID } from "../../extensions/common/extensions.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { McpContextKeys } from "../common/mcpContextKeys.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { HasInstalledMcpServersContext, IMcpSamplingService, IMcpService, InstalledMcpServersViewId, LazyCollectionState, McpCapability, McpConnectionState, mcpOAuthClientSecretStorageKey, mcpPromptPrefix, McpServerCacheState, McpStartServerInteraction } from "../common/mcpTypes.js";
import { startServerAndWaitForLiveTools } from "../common/mcpTypesUtils.js";
import { McpAddConfigurationCommand, McpInstallFromManifestCommand } from "./mcpCommandsAddConfiguration.js";
import { McpResourceQuickAccess, McpResourceQuickPick } from "./mcpResourceQuickAccess.js";
import "./media/mcpServerAction.css";
import { openPanelChatAndGetWidget } from "./openPanelChatAndGetWidget.js";
const category = {
  original: "MCP",
  value: "MCP"
};
class ListMcpServerCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ListServer,
      title: localize2("mcp.list", "List Servers"),
      icon: Codicon.server,
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: [{
        when: ContextKeyExpr.and(
          ContextKeyExpr.or(
            ContextKeyExpr.and(ContextKeyExpr.equals(`config.${mcpAutoStartConfig}`, McpAutoStartValue.Never), McpContextKeys.hasUnknownTools),
            McpContextKeys.hasServersWithErrors
          ),
          ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
          ChatContextKeys.lockedToCodingAgent.negate(),
          ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
        ),
        id: MenuId.ChatInput,
        group: "navigation",
        order: 101
      }]
    });
  }
  async run(accessor) {
    const services = {
      chatWidgetService: accessor.get(IChatWidgetService),
      agentHostCustomizations: accessor.get(IAgentHostCustomizationService),
      mcpService: accessor.get(IMcpService),
      commandService: accessor.get(ICommandService),
      quickInput: accessor.get(IQuickInputService),
      notificationService: accessor.get(INotificationService),
      logService: accessor.get(ILogService)
    };
    return this._runWithMode(services, void 0);
  }
  async _runWithMode(services, initialMode) {
    let mode = initialMode;
    if (mode === void 0) {
      const sessionResource = services.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
      const hasAgentHostMcp = sessionResource && services.agentHostCustomizations.getMcpServers(sessionResource).length > 0;
      mode = hasAgentHostMcp ? { agentHostSession: sessionResource } : "local";
    }
    if (mode === "local") {
      await this._runLocal(services);
      return;
    }
    const nextMode = await this._runAgentHost(services, mode.agentHostSession);
    if (nextMode === "local") {
      await this._runWithMode(services, "local");
    }
  }
  async _runLocal(services) {
    const { mcpService, commandService, quickInput } = services;
    const store = new DisposableStore();
    const pick = quickInput.createQuickPick({ useSeparators: true });
    pick.placeholder = localize("mcp.selectServer", "Select an MCP Server");
    mcpService.activateCollections();
    store.add(pick);
    store.add(autorun((reader) => {
      const servers = groupBy(mcpService.servers.read(reader).slice().sort((a, b) => a.collection.order - b.collection.order), (s) => s.collection.id);
      const firstRun = pick.items.length === 0;
      const previousActiveId = pick.activeItems[0]?.id;
      pick.items = [
        { id: "$add", label: localize("mcp.addServer", "Add Server"), description: localize("mcp.addServer.description", "Add a new server configuration"), alwaysShow: true, iconClass: ThemeIcon.asClassName(Codicon.add) },
        ...Object.values(servers).filter((s) => s.length).flatMap((servers2) => [
          { type: "separator", label: servers2[0].collection.label, id: servers2[0].collection.id },
          ...servers2.map((server) => {
            const disabled = isContributionDisabled(server.enablement.read(reader));
            return {
              id: server.definition.id,
              label: server.definition.label,
              description: disabled ? localize("mcp.disabled", "Disabled") : McpConnectionState.toString(server.connectionState.read(reader))
            };
          })
        ])
      ];
      if (previousActiveId) {
        const previousItem = pick.items.find((item) => !("type" in item) && item.id === previousActiveId);
        if (previousItem) {
          pick.activeItems = [previousItem];
          return;
        }
      }
      if (firstRun && pick.items.length > 3) {
        pick.activeItems = pick.items.slice(2, 3);
      }
    }));
    const picked = await new Promise((resolve) => {
      store.add(pick.onDidAccept(() => {
        resolve(pick.activeItems[0]);
      }));
      store.add(pick.onDidHide(() => {
        resolve(void 0);
      }));
      pick.show();
    });
    store.dispose();
    if (!picked) {
    } else if (picked.id === "$add") {
      commandService.executeCommand(McpCommandIds.AddConfiguration);
    } else {
      commandService.executeCommand(McpCommandIds.ServerOptions, picked.id);
    }
  }
  async _runAgentHost(services, agentHostSession) {
    const { agentHostCustomizations, commandService, quickInput } = services;
    const BACK_ID = "$back";
    const store = new DisposableStore();
    const pick = quickInput.createQuickPick({ useSeparators: true });
    pick.placeholder = localize("mcp.selectAgentHostServer", "Select an MCP Server for this session");
    store.add(pick);
    const refresh = () => {
      const firstRun = pick.items.length === 0;
      const previousActiveId = pick.activeItems[0]?.id;
      const servers = agentHostCustomizations.getMcpServers(agentHostSession);
      pick.items = [
        ...servers.length === 0 ? [{
          id: "$empty",
          label: localize("mcp.agentHost.noServers", "No MCP servers"),
          description: localize("mcp.agentHost.noServers.description", "This session does not expose any MCP servers"),
          alwaysShow: true
        }] : servers.map((server) => ({
          id: server.id,
          server,
          label: server.name,
          description: server.enabled ? mcpServerStatusToLabel(server.status) : localize("mcp.disabled", "Disabled"),
          buttons: getAgentHostMcpServerButtons(server)
        })),
        { type: "separator" },
        {
          id: BACK_ID,
          label: localize("mcp.agentHost.showLocal", "Show locally configured servers..."),
          iconClass: ThemeIcon.asClassName(Codicon.arrowLeft),
          alwaysShow: true
        }
      ];
      if (previousActiveId) {
        const previousItem = pick.items.find((item) => !("type" in item) && item.id === previousActiveId);
        if (previousItem) {
          pick.activeItems = [previousItem];
          return;
        }
      }
      if (firstRun && servers.length > 0) {
        pick.activeItems = [pick.items[0]];
      }
    };
    refresh();
    store.add(agentHostCustomizations.onDidChangeCustomizations(() => refresh()));
    store.add(pick.onDidTriggerItemButton(async (event) => {
      if (!isAgentHostMcpServerButton(event.button) || !event.item.server) {
        return;
      }
      pick.busy = true;
      try {
        await runAgentHostMcpServerLifecycleAction(event.item.server, event.button.action, services);
        refresh();
      } finally {
        pick.busy = false;
      }
    }));
    const picked = await new Promise((resolve) => {
      store.add(pick.onDidAccept(() => {
        resolve(pick.activeItems[0]);
      }));
      store.add(pick.onDidHide(() => {
        resolve(void 0);
      }));
      pick.show();
    });
    store.dispose();
    if (!picked || picked.id === "$empty") {
      return void 0;
    }
    if (picked.id === BACK_ID) {
      return "local";
    }
    await commandService.executeCommand(McpCommandIds.AgentHostServerOptions, agentHostSession, picked.id);
    return void 0;
  }
}
function isAgentHostMcpServerButton(button) {
  return "action" in button && (button.action === "start" || button.action === "stop");
}
const startAgentHostMcpServerButton = {
  iconClass: ThemeIcon.asClassName(Codicon.play),
  tooltip: localize("mcp.start", "Start Server"),
  action: "start"
};
const stopAgentHostMcpServerButton = {
  iconClass: ThemeIcon.asClassName(Codicon.debugStop),
  tooltip: localize("mcp.stop", "Stop Server"),
  action: "stop"
};
function getAgentHostMcpServerButtons(server) {
  if (canStartAgentHostMcpServer(server)) {
    return [startAgentHostMcpServerButton];
  }
  if (canStopAgentHostMcpServer(server)) {
    return [stopAgentHostMcpServerButton];
  }
  return [];
}
function canStartAgentHostMcpServer(server) {
  return server.enabled && (server.status === McpServerStatus.Stopped || server.status === McpServerStatus.Error);
}
function canStopAgentHostMcpServer(server) {
  return server.enabled && (server.status === McpServerStatus.Starting || server.status === McpServerStatus.Ready || server.status === McpServerStatus.AuthRequired);
}
async function runAgentHostMcpServerLifecycleAction(server, action, services) {
  try {
    if (action === "start" && canStartAgentHostMcpServer(server)) {
      await server.start();
    } else if (action === "stop" && canStopAgentHostMcpServer(server)) {
      await server.stop();
    }
  } catch (error) {
    services.logService.error(`Failed to ${action} MCP server '${server.name}'`, error);
    const message = error instanceof Error ? error.message : String(error);
    services.notificationService.error(action === "start" ? localize("mcp.agentHost.startError", "Failed to start MCP server '{0}': {1}", server.name, message) : localize("mcp.agentHost.stopError", "Failed to stop MCP server '{0}': {1}", server.name, message));
  }
}
function mcpServerStatusToLabel(status) {
  switch (status) {
    case McpServerStatus.Starting:
      return localize("mcp.agentHost.status.starting", "Starting");
    case McpServerStatus.Ready:
      return localize("mcp.agentHost.status.ready", "Running");
    case McpServerStatus.AuthRequired:
      return localize("mcp.agentHost.status.authRequired", "Authentication required");
    case McpServerStatus.Error:
      return localize("mcp.agentHost.status.error", "Error");
    case McpServerStatus.Stopped:
      return localize("mcp.agentHost.status.stopped", "Stopped");
    default:
      return "";
  }
}
function getAgentHostMcpServerEnablementItems(disabled, isEmptyWorkbench) {
  const items = [];
  if (disabled) {
    items.push({ label: localize("mcp.agentHost.enable", "Enable"), action: "enableProfile" });
    if (!isEmptyWorkbench) {
      items.push({ label: localize("mcp.agentHost.enableWorkspace", "Enable (Workspace)"), action: "enableWorkspace" });
    }
  } else {
    items.push({ label: localize("mcp.agentHost.disable", "Disable"), action: "disableProfile" });
    if (!isEmptyWorkbench) {
      items.push({ label: localize("mcp.agentHost.disableWorkspace", "Disable (Workspace)"), action: "disableWorkspace" });
    }
  }
  return items;
}
function enablementStateForAction(action) {
  switch (action) {
    case "enableProfile":
      return ContributionEnablementState.EnabledProfile;
    case "disableProfile":
      return ContributionEnablementState.DisabledProfile;
    case "enableWorkspace":
      return ContributionEnablementState.EnabledWorkspace;
    case "disableWorkspace":
      return ContributionEnablementState.DisabledWorkspace;
    default:
      return assertNever(action);
  }
}
function findLocalMcpServer(mcpService, server) {
  const servers = mcpService.servers.get();
  const separator = server.id.indexOf("/");
  const rawId = separator >= 0 ? server.id.slice(separator + 1) : server.id;
  const idMatches = servers.filter((candidate) => candidate.definition.id === rawId);
  if (idMatches.length === 1) {
    return idMatches[0];
  }
  const nameMatches = servers.filter((candidate) => candidate.definition.label === server.name);
  return nameMatches.length === 1 ? nameMatches[0] : void 0;
}
class McpAgentHostServerOptionsCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.AgentHostServerOptions,
      title: localize2("mcp.agentHostOptions", "Agent Host Server Options"),
      category,
      f1: false
    });
  }
  async run(accessor, agentHostSession, customizationId) {
    const agentHostCustomizations = accessor.get(IAgentHostCustomizationService);
    const quickInputService = accessor.get(IQuickInputService);
    const notificationService = accessor.get(INotificationService);
    const logService = accessor.get(ILogService);
    const aiCustomizationWorkspaceService = accessor.get(IAICustomizationWorkspaceService);
    const mcpService = accessor.get(IMcpService);
    const server = agentHostCustomizations.getMcpServers(agentHostSession).find((s) => s.id === customizationId);
    if (!server) {
      return;
    }
    const items = [
      { type: "separator", label: localize("mcp.actions.status", "Status") }
    ];
    if (canStartAgentHostMcpServer(server)) {
      items.push({
        label: localize("mcp.start", "Start Server"),
        description: mcpServerStatusToLabel(server.status),
        action: "start"
      });
    } else if (canStopAgentHostMcpServer(server)) {
      items.push({
        label: localize("mcp.stop", "Stop Server"),
        description: mcpServerStatusToLabel(server.status),
        action: "stop"
      });
    }
    const localServer = findLocalMcpServer(mcpService, server);
    const durableEnablement = localServer ? localServer.enablement.get() : agentHostCustomizations.getMcpServerEnablement(agentHostSession, server.name);
    const durableDisabled = isContributionDisabled(durableEnablement);
    const isEmptyWorkbench = aiCustomizationWorkspaceService.getActiveProjectRoot() === void 0;
    items.push(
      { type: "separator", label: localize("mcp.actions.enablement", "Enablement") },
      ...getAgentHostMcpServerEnablementItems(durableDisabled, isEmptyWorkbench),
      {
        label: server.enabled ? localize("mcp.agentHost.disableSession", "Disable (Session)") : localize("mcp.agentHost.enableSession", "Enable (Session)"),
        description: server.enabled ? mcpServerStatusToLabel(server.status) : localize("mcp.disabled", "Disabled"),
        action: "toggleSession"
      }
    );
    if (server.state.kind === McpServerStatus.AuthRequired) {
      items.push({
        label: localize("mcp.agentHost.authenticate", "Authenticate"),
        description: server.state.resource.resource,
        action: "authenticate"
      });
    }
    items.push({
      label: localize("mcp.showOutput", "Show Output"),
      action: "showOutput"
    });
    const picked = await quickInputService.pick(items, {
      placeHolder: server.name
    });
    if (!picked || !hasKey(picked, { action: true })) {
      return;
    }
    if (picked.action === "showOutput") {
      agentHostCustomizations.showMcpServerLog(agentHostSession, server.id);
      return;
    }
    if (picked.action === "authenticate") {
      await agentHostCustomizations.authenticateMcpServer(agentHostSession, server.id);
      return;
    }
    if (picked.action === "start" || picked.action === "stop") {
      await runAgentHostMcpServerLifecycleAction(server, picked.action, { notificationService, logService });
      return;
    }
    if (picked.action === "toggleSession") {
      server.setEnabled(!server.enabled);
      return;
    }
    const state = enablementStateForAction(picked.action);
    if (localServer) {
      mcpService.enablementModel.setEnabled(localServer.definition.id, state);
    } else {
      agentHostCustomizations.setMcpServerEnablement(agentHostSession, server.name, state);
    }
  }
}
class McpConfirmationServerOptionsCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ServerOptionsInConfirmation,
      title: localize2("mcp.options", "Server Options"),
      category,
      icon: Codicon.settingsGear,
      f1: false,
      menu: [{
        id: MenuId.ChatConfirmationMenu,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("chatConfirmationPartSource", "mcp"),
          ContextKeyExpr.or(
            ContextKeyExpr.equals("chatConfirmationPartType", "chatToolConfirmation"),
            ContextKeyExpr.equals("chatConfirmationPartType", "elicitation")
          )
        ),
        group: "navigation"
      }]
    });
  }
  async run(accessor, arg) {
    const toolsService = accessor.get(ILanguageModelToolsService);
    if (arg.kind === "toolInvocation") {
      const tool = toolsService.getTool(arg.toolId);
      if (tool?.source.type === "mcp") {
        accessor.get(ICommandService).executeCommand(McpCommandIds.ServerOptions, tool.source.definitionId);
      }
    } else if (arg.kind === "elicitation2") {
      if (arg.source?.type === "mcp") {
        accessor.get(ICommandService).executeCommand(McpCommandIds.ServerOptions, arg.source.definitionId);
      }
    } else {
      assertNever(arg);
    }
  }
}
class McpServerOptionsCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ServerOptions,
      title: localize2("mcp.options", "Server Options"),
      category,
      f1: false
    });
  }
  async run(accessor, id) {
    const mcpService = accessor.get(IMcpService);
    const quickInputService = accessor.get(IQuickInputService);
    const mcpRegistry = accessor.get(IMcpRegistry);
    const editorService = accessor.get(IEditorService);
    const commandService = accessor.get(ICommandService);
    const samplingService = accessor.get(IMcpSamplingService);
    const authenticationQueryService = accessor.get(IAuthenticationQueryService);
    const authenticationService = accessor.get(IAuthenticationService);
    const server = mcpService.servers.get().find((s) => s.definition.id === id);
    if (!server) {
      return;
    }
    const collection = mcpRegistry.collections.get().find((c) => c.id === server.collection.id);
    const serverDefinition = collection?.serverDefinitions.get().find((s) => s.id === server.definition.id);
    const items = [];
    const serverState = server.connectionState.get();
    const disabled = isContributionDisabled(server.enablement.get());
    items.push({ type: "separator", label: localize("mcp.actions.status", "Status") });
    if (disabled) {
      items.push({
        label: localize("mcp.enableWorkspace", "Enable Server (Workspace)"),
        action: "enable"
      });
    } else if (McpConnectionState.canBeStarted(serverState.state)) {
      items.push({
        label: localize("mcp.start", "Start Server"),
        action: "start"
      });
    } else {
      items.push({
        label: localize("mcp.stop", "Stop Server"),
        action: "stop"
      });
      items.push({
        label: localize("mcp.restart", "Restart Server"),
        action: "restart"
      });
    }
    items.push(...this._getAuthActions(authenticationQueryService, server.definition.id));
    const configTarget = serverDefinition?.presentation?.origin || collection?.presentation?.origin;
    if (configTarget) {
      items.push({
        label: localize("mcp.config", "Show Configuration"),
        action: "config"
      });
    }
    items.push({
      label: localize("mcp.showOutput", "Show Output"),
      action: "showOutput"
    });
    items.push(
      { type: "separator", label: localize("mcp.actions.sampling", "Sampling") },
      {
        label: localize("mcp.configAccess", "Configure Model Access"),
        description: localize("mcp.showOutput.description", "Set the models the server can use via MCP sampling"),
        action: "configSampling"
      }
    );
    if (samplingService.hasLogs(server)) {
      items.push({
        label: localize("mcp.samplingLog", "Show Sampling Requests"),
        description: localize("mcp.samplingLog.description", "Show the sampling requests for this server"),
        action: "samplingLog"
      });
    }
    const capabilities = server.capabilities.get();
    if (capabilities === void 0 || capabilities & McpCapability.Resources) {
      items.push({ type: "separator", label: localize("mcp.actions.resources", "Resources") });
      items.push({
        label: localize("mcp.resources", "Browse Resources"),
        action: "resources"
      });
    }
    const pick = await quickInputService.pick(items, {
      placeHolder: localize("mcp.selectAction", "Select action for '{0}'", server.definition.label)
    });
    if (!pick) {
      return;
    }
    switch (pick.action) {
      case "enable":
        mcpService.enablementModel.setEnabled(server.definition.id, ContributionEnablementState.EnabledWorkspace);
        break;
      case "start":
        await server.start({ promptType: "all-untrusted" });
        server.showOutput();
        break;
      case "stop":
        await server.stop();
        break;
      case "restart":
        await server.stop();
        await server.start({ promptType: "all-untrusted" });
        break;
      case "disconnect":
        await server.stop();
        await this._handleAuth(authenticationService, pick.accountQuery, server.definition, false);
        break;
      case "signout":
        await server.stop();
        await this._handleAuth(authenticationService, pick.accountQuery, server.definition, true);
        break;
      case "showOutput":
        server.showOutput();
        break;
      case "config":
        editorService.openEditor({
          resource: URI.isUri(configTarget) ? configTarget : configTarget.uri,
          options: { selection: URI.isUri(configTarget) ? void 0 : configTarget.range }
        });
        break;
      case "configSampling":
        return commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, server);
      case "resources":
        return commandService.executeCommand(McpCommandIds.BrowseResources, server);
      case "samplingLog":
        editorService.openEditor({
          resource: void 0,
          contents: samplingService.getLogText(server),
          label: localize("mcp.samplingLog.title", "MCP Sampling: {0}", server.definition.label)
        });
        break;
      default:
        assertNever(pick);
    }
  }
  _getAuthActions(authenticationQueryService, serverId) {
    const result = [];
    for (const [providerId, accountName] of authenticationQueryService.mcpServer(serverId).getAllAccountPreferences()) {
      const accountQuery = authenticationQueryService.provider(providerId).account(accountName);
      if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
        continue;
      }
      if (accountQuery.entities().getEntityCount().total > 1) {
        result.push({
          action: "disconnect",
          label: localize("mcp.disconnect", "Disconnect Account"),
          description: `(${accountName})`,
          accountQuery
        });
      } else {
        result.push({
          action: "signout",
          label: localize("mcp.signOut", "Sign Out"),
          description: `(${accountName})`,
          accountQuery
        });
      }
    }
    return result;
  }
  async _handleAuth(authenticationService, accountQuery, definition, signOut) {
    const { providerId, accountName } = accountQuery;
    accountQuery.mcpServer(definition.id).setAccessAllowed(false, definition.label);
    if (signOut) {
      const accounts = await authenticationService.getAccounts(providerId);
      const account = accounts.find((a) => a.label === accountName);
      if (account) {
        const sessions = await authenticationService.getSessions(providerId, void 0, { account });
        for (const session of sessions) {
          await authenticationService.removeSession(providerId, session.id);
        }
      }
    }
  }
}
let MCPServerActionRendering = class extends Disposable {
  constructor(actionViewItemService, mcpService, instaService, commandService, configurationService) {
    super();
    const hoverIsOpen = observableValue(this, false);
    const config = observableConfigValue(mcpAutoStartConfig, McpAutoStartValue.NewAndOutdated, configurationService);
    let DisplayedState;
    ((DisplayedState2) => {
      DisplayedState2[DisplayedState2["None"] = 0] = "None";
      DisplayedState2[DisplayedState2["NewTools"] = 1] = "NewTools";
      DisplayedState2[DisplayedState2["Error"] = 2] = "Error";
      DisplayedState2[DisplayedState2["Refreshing"] = 3] = "Refreshing";
    })(DisplayedState || (DisplayedState = {}));
    function isServer(s) {
      return typeof s.start === "function";
    }
    const displayedStateCurrent = derived((reader) => {
      const servers = mcpService.servers.read(reader);
      const serversPerState = [];
      for (const server of servers) {
        let thisState = 0 /* None */;
        switch (server.cacheState.read(reader)) {
          case McpServerCacheState.Unknown:
          case McpServerCacheState.Outdated:
            thisState = server.connectionState.read(reader).state === McpConnectionState.Kind.Error ? 2 /* Error */ : 1 /* NewTools */;
            break;
          case McpServerCacheState.RefreshingFromUnknown:
            thisState = 3 /* Refreshing */;
            break;
          default:
            thisState = server.connectionState.read(reader).state === McpConnectionState.Kind.Error ? 2 /* Error */ : 0 /* None */;
            break;
        }
        serversPerState[thisState] ??= [];
        serversPerState[thisState].push(server);
      }
      const unknownServerStates = mcpService.lazyCollectionState.read(reader);
      if (unknownServerStates.state === LazyCollectionState.LoadingUnknown) {
        serversPerState[3 /* Refreshing */] ??= [];
        serversPerState[3 /* Refreshing */].push(...unknownServerStates.collections);
      } else if (unknownServerStates.state === LazyCollectionState.HasUnknown) {
        serversPerState[1 /* NewTools */] ??= [];
        serversPerState[1 /* NewTools */].push(...unknownServerStates.collections);
      }
      let maxState = serversPerState.length - 1;
      if (maxState === 1 /* NewTools */ && config.read(reader) !== McpAutoStartValue.Never) {
        maxState = 0 /* None */;
      }
      return { state: maxState, servers: serversPerState[maxState] || [] };
    });
    const displayedState = derivedObservableWithCache(this, (reader, last) => {
      if (last && hoverIsOpen.read(reader)) {
        return last;
      } else {
        return displayedStateCurrent.read(reader);
      }
    });
    const actionItemState = displayedState.map((s) => s.state);
    this._store.add(actionViewItemService.register(MenuId.ChatInput, McpCommandIds.ListServer, (action, options) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instaService.createInstance(class extends MenuEntryActionViewItem {
        render(container) {
          super.render(container);
          container.classList.add("chat-mcp");
          container.style.position = "relative";
          const stateIndicator = container.appendChild($(".chat-mcp-state-indicator"));
          stateIndicator.style.display = "none";
          this._register(autorun((r) => {
            const displayed = displayedState.read(r);
            const { state } = displayed;
            this.updateTooltip();
            stateIndicator.ariaLabel = this.getLabelForState(displayed);
            stateIndicator.className = "chat-mcp-state-indicator";
            if (state === 1 /* NewTools */) {
              stateIndicator.style.display = "block";
              stateIndicator.classList.add("chat-mcp-state-new", ...ThemeIcon.asClassNameArray(Codicon.refresh));
            } else if (state === 2 /* Error */) {
              stateIndicator.style.display = "block";
              stateIndicator.classList.add("chat-mcp-state-error", ...ThemeIcon.asClassNameArray(Codicon.warning));
            } else if (state === 3 /* Refreshing */) {
              stateIndicator.style.display = "block";
              stateIndicator.classList.add("chat-mcp-state-refreshing", ...ThemeIcon.asClassNameArray(spinningLoading));
            } else {
              stateIndicator.style.display = "none";
            }
          }));
        }
        async onClick(e) {
          e.preventDefault();
          e.stopPropagation();
          const { state, servers } = displayedStateCurrent.get();
          if (state === 1 /* NewTools */) {
            const interaction = new McpStartServerInteraction();
            servers.filter(isServer).forEach((server) => server.stop().then(() => server.start({ interaction })));
            mcpService.activateCollections();
          } else if (state === 3 /* Refreshing */) {
            findLast(servers, isServer)?.showOutput();
          } else if (state === 2 /* Error */) {
            const server = findLast(servers, isServer);
            if (server) {
              await server.showOutput(true);
              commandService.executeCommand(McpCommandIds.ServerOptions, server.definition.id);
            }
          } else {
            commandService.executeCommand(McpCommandIds.ListServer);
          }
        }
        getTooltip() {
          return this.getLabelForState() || super.getTooltip();
        }
        getHoverContents({ state, servers } = displayedStateCurrent.get()) {
          const link = (s) => createMarkdownCommandLink({
            text: s.definition.label,
            id: McpCommandIds.ServerOptions,
            arguments: [s.definition.id],
            tooltip: localize("mcp.server.options.tooltip", "Show server options for {0}", s.definition.label)
          });
          const single = servers.length === 1;
          const names = servers.map((s) => isServer(s) ? link(s) : "`" + s.label + "`").map((l) => single ? l : `- ${l}`).join("\n");
          let markdown;
          if (state === 1 /* NewTools */) {
            markdown = new MarkdownString(
              single ? localize("mcp.newTools.md.single", "MCP server {0} has been updated and may have new tools available.", names) : localize("mcp.newTools.md.multi", "MCP servers have been updated and may have new tools available:\n\n{0}", names)
            );
          } else if (state === 2 /* Error */) {
            markdown = new MarkdownString(
              single ? localize("mcp.err.md.single", "MCP server {0} was unable to start successfully.", names) : localize("mcp.err.md.multi", "Multiple MCP servers were unable to start successfully:\n\n{0}", names)
            );
          } else {
            return this.getLabelForState() || void 0;
          }
          return {
            element: (token) => {
              hoverIsOpen.set(true, void 0);
              const store = new DisposableStore();
              store.add(toDisposable(() => hoverIsOpen.set(false, void 0)));
              store.add(token.onCancellationRequested(() => {
                store.dispose();
              }));
              store.add(disposableWindowInterval(mainWindow, () => {
                if (!container.isConnected) {
                  store.dispose();
                }
              }, 2e3));
              const container = $("div.mcp-hover-contents");
              markdown.isTrusted = true;
              const markdownResult = store.add(renderMarkdown(markdown));
              container.appendChild(markdownResult.element);
              const divider = $("hr.mcp-hover-divider");
              container.appendChild(divider);
              const checkboxContainer = $("div.mcp-hover-setting");
              const settingLabelStr = localize("mcp.autoStart", "Automatically start MCP servers when sending a chat message");
              const checkbox = store.add(new Checkbox(
                settingLabelStr,
                config.get() !== McpAutoStartValue.Never,
                { ...defaultCheckboxStyles }
              ));
              checkboxContainer.appendChild(checkbox.domNode);
              const settingLabel = $("span.mcp-hover-setting-label", void 0, settingLabelStr);
              checkboxContainer.appendChild(settingLabel);
              const onChange = () => {
                const newValue = checkbox.checked ? McpAutoStartValue.NewAndOutdated : McpAutoStartValue.Never;
                configurationService.updateValue(mcpAutoStartConfig, newValue);
              };
              store.add(checkbox.onChange(onChange));
              store.add(addDisposableListener(settingLabel, EventType.CLICK, () => {
                checkbox.checked = !checkbox.checked;
                onChange();
              }));
              container.appendChild(checkboxContainer);
              return container;
            }
          };
        }
        getLabelForState({ state, servers } = displayedStateCurrent.get()) {
          if (state === 1 /* NewTools */) {
            return localize("mcp.newTools", "New tools available ({0})", servers.length || 1);
          } else if (state === 2 /* Error */) {
            return localize("mcp.toolError", "Error loading {0} tool(s)", servers.length || 1);
          } else if (state === 3 /* Refreshing */) {
            return localize("mcp.toolRefresh", "Discovering tools...");
          } else {
            return null;
          }
        }
      }, action, { ...options, keybindingNotRenderedWithLabel: true });
    }, Event.fromObservableLight(actionItemState)));
  }
};
MCPServerActionRendering = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IMcpService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IConfigurationService)
], MCPServerActionRendering);
class ResetMcpTrustCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ResetTrust,
      title: localize2("mcp.resetTrust", "Reset Trust"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  run(accessor) {
    const mcpService = accessor.get(IMcpService);
    mcpService.resetTrust();
  }
}
class ResetMcpCachedTools extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ResetCachedTools,
      title: localize2("mcp.resetCachedTools", "Reset Cached Tools"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(McpContextKeys.toolsCount.greater(0), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  run(accessor) {
    const mcpService = accessor.get(IMcpService);
    mcpService.resetCaches();
  }
}
class AddConfigurationAction extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.AddConfiguration,
      title: localize2("mcp.addConfiguration", "Add Server..."),
      metadata: {
        description: localize2("mcp.addConfiguration.description", "Installs a new Model Context protocol to the mcp.json settings")
      },
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ContextKeyExpr.regex(ResourceContextKey.Path.key, /\.vscode[/\\]mcp\.json$/),
          ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
          ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
        )
      }
    });
  }
  async run(accessor, configUri) {
    const instantiationService = accessor.get(IInstantiationService);
    const workspaceService = accessor.get(IWorkspaceContextService);
    const target = configUri ? workspaceService.getWorkspaceFolder(URI.parse(configUri)) : void 0;
    return instantiationService.createInstance(McpAddConfigurationCommand, target ?? void 0).run();
  }
}
class InstallFromManifestAction extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.InstallFromManifest,
      title: localize2("mcp.installFromManifest", "Install Server from Manifest..."),
      metadata: {
        description: localize2("mcp.installFromManifest.description", "Install an MCP server from a JSON manifest file")
      },
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  async run(accessor) {
    const instantiationService = accessor.get(IInstantiationService);
    return instantiationService.createInstance(McpInstallFromManifestCommand).run();
  }
}
class RemoveStoredInput extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.RemoveStoredInput,
      title: localize2("mcp.resetCachedTools", "Reset Cached Tools"),
      category,
      f1: false
    });
  }
  run(accessor, scope, id) {
    accessor.get(IMcpRegistry).clearSavedInputs(scope, id);
  }
}
class EditStoredInput extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.EditStoredInput,
      title: localize2("mcp.editStoredInput", "Edit Stored Input"),
      category,
      f1: false
    });
  }
  run(accessor, inputId, uri, configSection, target) {
    const workspaceFolder = uri && accessor.get(IWorkspaceContextService).getWorkspaceFolder(uri);
    accessor.get(IMcpRegistry).editSavedInput(inputId, workspaceFolder || void 0, configSection, target);
  }
}
class SetOAuthClientSecret extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.SetOAuthClientSecret,
      title: localize2("mcp.setOAuthClientSecret", "Set OAuth Client Secret"),
      category,
      f1: false
    });
  }
  async run(accessor, clientId, mcpServerUrl, serverName) {
    const quickInputService = accessor.get(IQuickInputService);
    const secretStorageService = accessor.get(ISecretStorageService);
    const key = mcpOAuthClientSecretStorageKey(mcpServerUrl, clientId);
    const existing = await secretStorageService.get(key);
    const deleteButton = {
      iconClass: ThemeIcon.asClassName(Codicon.trash),
      tooltip: localize("mcp.setOAuthClientSecret.delete", "Delete stored client secret")
    };
    const revealButton = {
      iconClass: ThemeIcon.asClassName(Codicon.eye),
      tooltip: localize("mcp.setOAuthClientSecret.reveal", "Show client secret")
    };
    const hideButton = {
      iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
      tooltip: localize("mcp.setOAuthClientSecret.hide", "Hide client secret")
    };
    const result = await new Promise((resolve) => {
      const input = quickInputService.createInputBox();
      input.title = existing ? localize("mcp.setOAuthClientSecret.title.replace", "Replace Client Secret for {0}", serverName) : localize("mcp.setOAuthClientSecret.title.set", "Set Client Secret for {0}", serverName);
      input.prompt = localize("mcp.setOAuthClientSecret.prompt", "Enter the client secret for OAuth client '{0}'.", clientId);
      input.placeholder = existing ? localize("mcp.setOAuthClientSecret.placeholder.replace", "Enter a new client secret to replace the stored value") : localize("mcp.setOAuthClientSecret.placeholder.set", "Enter client secret");
      input.password = true;
      input.ignoreFocusOut = true;
      if (existing) {
        input.value = existing;
        input.valueSelection = [0, existing.length];
      }
      const updateButtons = () => {
        const toggleButton = input.password ? revealButton : hideButton;
        input.buttons = existing ? [toggleButton, deleteButton] : [toggleButton];
      };
      updateButtons();
      const disposables = new DisposableStore();
      disposables.add(input.onDidAccept(() => {
        const value = input.value;
        if (value.length === 0) {
          resolve({ kind: "delete" });
          input.hide();
          return;
        }
        resolve({ kind: "accept", value });
        input.hide();
      }));
      disposables.add(input.onDidTriggerButton((btn) => {
        if (btn === deleteButton) {
          resolve({ kind: "delete" });
          input.hide();
        } else if (btn === revealButton || btn === hideButton) {
          input.password = !input.password;
          updateButtons();
        }
      }));
      disposables.add(input.onDidHide(() => {
        resolve(void 0);
        disposables.dispose();
        input.dispose();
      }));
      input.show();
    });
    if (!result) {
      return;
    }
    if (result.kind === "delete") {
      await secretStorageService.delete(key);
    } else {
      await secretStorageService.set(key, result.value);
    }
  }
}
class ShowConfiguration extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ShowConfiguration,
      title: localize2("mcp.command.showConfiguration", "Show Configuration"),
      category,
      f1: false
    });
  }
  run(accessor, collectionId, serverId) {
    const collection = accessor.get(IMcpRegistry).collections.get().find((c) => c.id === collectionId);
    if (!collection) {
      return;
    }
    const server = collection?.serverDefinitions.get().find((s) => s.id === serverId);
    const editorService = accessor.get(IEditorService);
    if (server?.presentation?.origin) {
      editorService.openEditor({
        resource: server.presentation.origin.uri,
        options: { selection: server.presentation.origin.range }
      });
    } else if (collection.presentation?.origin) {
      editorService.openEditor({
        resource: collection.presentation.origin
      });
    }
  }
}
class ShowOutput extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ShowOutput,
      title: localize2("mcp.command.showOutput", "Show Output"),
      category,
      f1: false
    });
  }
  run(accessor, serverId) {
    accessor.get(IMcpService).servers.get().find((s) => s.definition.id === serverId)?.showOutput();
  }
}
function isAgentHostMcpServerCommandArg(arg) {
  return typeof arg !== "string" && URI.isUri(arg.agentHostSession) && typeof arg.serverId === "string";
}
function getAgentHostMcpServer(accessor, arg) {
  return accessor.get(IAgentHostCustomizationService).getMcpServers(arg.agentHostSession).find((server) => server.id === arg.serverId);
}
class RestartServer extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.RestartServer,
      title: localize2("mcp.command.restartServer", "Restart Server"),
      category,
      f1: false
    });
  }
  async run(accessor, serverId, opts) {
    if (isAgentHostMcpServerCommandArg(serverId)) {
      const server = getAgentHostMcpServer(accessor, serverId);
      accessor.get(ILogService).warn(`Restarting MCP server '${server?.name ?? serverId.serverId}' is not supported for agent-host servers`);
      accessor.get(INotificationService).warn(localize("mcp.agentHost.restartUnsupported", "Restarting MCP server '{0}' is not supported for agent-host servers. Stop and start the server instead.", server?.name ?? serverId.serverId));
      return;
    }
    const s = accessor.get(IMcpService).servers.get().find((s2) => s2.definition.id === serverId);
    s?.showOutput();
    await s?.stop();
    await s?.start({ promptType: "all-untrusted", ...opts });
  }
}
class StartServer extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.StartServer,
      title: localize2("mcp.command.startServer", "Start Server"),
      category,
      f1: false
    });
  }
  async run(accessor, serverId, opts) {
    if (isAgentHostMcpServerCommandArg(serverId)) {
      await getAgentHostMcpServer(accessor, serverId)?.start();
      return;
    }
    let servers = accessor.get(IMcpService).servers.get();
    if (serverId !== "*") {
      servers = servers.filter((s) => s.definition.id === serverId);
    }
    const startOpts = { promptType: "all-untrusted", ...opts };
    if (opts?.waitForLiveTools) {
      await Promise.all(servers.map((s) => startServerAndWaitForLiveTools(s, startOpts)));
    } else {
      await Promise.all(servers.map((s) => s.start(startOpts)));
    }
  }
}
class StopServer extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.StopServer,
      title: localize2("mcp.command.stopServer", "Stop Server"),
      category,
      f1: false
    });
  }
  async run(accessor, serverId) {
    if (isAgentHostMcpServerCommandArg(serverId)) {
      await getAgentHostMcpServer(accessor, serverId)?.stop();
      return;
    }
    const s = accessor.get(IMcpService).servers.get().find((s2) => s2.definition.id === serverId);
    await s?.stop();
  }
}
class McpBrowseCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.Browse,
      title: localize2("mcp.command.browse", "MCP Servers"),
      tooltip: localize2("mcp.command.browse.tooltip", "Browse MCP Servers"),
      category,
      icon: Codicon.search,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      menu: [{
        id: extensionsFilterSubMenu,
        group: "1_predefined",
        order: 1,
        when: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
      }, {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", InstalledMcpServersViewId), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        group: "navigation"
      }]
    });
  }
  async run(accessor) {
    accessor.get(IExtensionsWorkbenchService).openSearch("@mcp ");
  }
}
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: McpCommandIds.Browse,
    title: localize2("mcp.command.browse.mcp", "Browse MCP Servers"),
    category,
    precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
  }
});
class ShowInstalledMcpServersCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ShowInstalled,
      title: localize2("mcp.command.show.installed", "Show Installed Servers"),
      category,
      precondition: ContextKeyExpr.and(HasInstalledMcpServersContext, ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      f1: true
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = await viewsService.openView(InstalledMcpServersViewId, true);
    if (!view) {
      await viewsService.openViewContainer(VIEWLET_ID);
      await viewsService.openView(InstalledMcpServersViewId, true);
    }
  }
}
MenuRegistry.appendMenuItem(CHAT_CONFIG_MENU_ID, {
  command: {
    id: McpCommandIds.ShowInstalled,
    title: localize2("mcp.servers", "MCP Servers")
  },
  when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
  order: 10,
  group: "2_level"
});
class OpenMcpResourceCommand extends Action2 {
  async run(accessor) {
    const fileService = accessor.get(IFileService);
    const editorService = accessor.get(IEditorService);
    const resource = await this.getURI(accessor);
    if (!await fileService.exists(resource)) {
      await fileService.createFile(resource, VSBuffer.fromString(JSON.stringify({ servers: {} }, null, "	")));
    }
    await editorService.openEditor({ resource });
  }
}
class OpenUserMcpResourceCommand extends OpenMcpResourceCommand {
  constructor() {
    super({
      id: McpCommandIds.OpenUserMcp,
      title: localize2("mcp.command.openUserMcp", "Open User Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate())
    });
  }
  getURI(accessor) {
    const userDataProfileService = accessor.get(IUserDataProfileService);
    return Promise.resolve(userDataProfileService.currentProfile.mcpResource);
  }
}
class OpenRemoteUserMcpResourceCommand extends OpenMcpResourceCommand {
  constructor() {
    super({
      id: McpCommandIds.OpenRemoteUserMcp,
      title: localize2("mcp.command.openRemoteUserMcp", "Open Remote User Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        RemoteNameContext.notEqualsTo("")
      )
    });
  }
  async getURI(accessor) {
    const userDataProfileService = accessor.get(IUserDataProfileService);
    const remoteUserDataProfileService = accessor.get(IRemoteUserDataProfilesService);
    const remoteProfile = await remoteUserDataProfileService.getRemoteProfile(userDataProfileService.currentProfile);
    return remoteProfile.mcpResource;
  }
}
class OpenWorkspaceFolderMcpResourceCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.OpenWorkspaceFolderMcp,
      title: localize2("mcp.command.openWorkspaceFolderMcp", "Open Workspace Folder MCP Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        WorkspaceFolderCountContext.notEqualsTo(0)
      )
    });
  }
  async run(accessor) {
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const commandService = accessor.get(ICommandService);
    const editorService = accessor.get(IEditorService);
    const workspaceFolders = workspaceContextService.getWorkspace().folders;
    const workspaceFolder = workspaceFolders.length === 1 ? workspaceFolders[0] : await commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
    if (workspaceFolder) {
      await editorService.openEditor({ resource: workspaceFolder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]) });
    }
  }
}
class OpenWorkspaceMcpResourceCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.OpenWorkspaceMcp,
      title: localize2("mcp.command.openWorkspaceMcp", "Open Workspace MCP Configuration"),
      category,
      f1: true,
      precondition: ContextKeyExpr.and(
        ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
        WorkbenchStateContext.isEqualTo("workspace")
      )
    });
  }
  async run(accessor) {
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const editorService = accessor.get(IEditorService);
    const workspaceConfiguration = workspaceContextService.getWorkspace().configuration;
    if (workspaceConfiguration) {
      await editorService.openEditor({ resource: workspaceConfiguration });
    }
  }
}
class McpBrowseResourcesCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.BrowseResources,
      title: localize2("mcp.browseResources", "Browse Resources..."),
      category,
      precondition: ContextKeyExpr.and(McpContextKeys.serverCount.greater(0), ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
      f1: true
    });
  }
  run(accessor, server) {
    if (server) {
      accessor.get(IInstantiationService).createInstance(McpResourceQuickPick, server).pick();
    } else {
      accessor.get(IQuickInputService).quickAccess.show(McpResourceQuickAccess.PREFIX);
    }
  }
}
class McpConfigureSamplingModels extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.ConfigureSamplingModels,
      title: localize2("mcp.configureSamplingModels", "Configure SamplingModel"),
      category
    });
  }
  async run(accessor, server) {
    const quickInputService = accessor.get(IQuickInputService);
    const lmService = accessor.get(ILanguageModelsService);
    const mcpSampling = accessor.get(IMcpSamplingService);
    const existingIds = new Set(mcpSampling.getConfig(server).allowedModels);
    const allItems = lmService.getLanguageModelIds().map((id) => {
      const model = lmService.lookupLanguageModel(id);
      if (!model.isUserSelectable) {
        return void 0;
      }
      return {
        label: model.name,
        description: model.tooltip,
        id,
        picked: existingIds.size ? existingIds.has(id) : model.isDefaultForLocation[ChatAgentLocation.Chat]
      };
    }).filter(isDefined);
    allItems.sort((a, b) => (b.picked ? 1 : 0) - (a.picked ? 1 : 0) || a.label.localeCompare(b.label));
    const picked = await quickInputService.pick(allItems, {
      placeHolder: localize("mcp.configureSamplingModels.ph", "Pick the models {0} can access via MCP sampling", server.definition.label),
      canPickMany: true
    });
    if (picked) {
      await mcpSampling.updateConfig(server, (c) => c.allowedModels = picked.map((p) => p.id));
    }
    return picked?.length || 0;
  }
}
class McpStartPromptingServerCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.StartPromptForServer,
      title: localize2("mcp.startPromptingServer", "Start Prompting Server"),
      category,
      f1: false
    });
  }
  async run(accessor, server) {
    const widget = await openPanelChatAndGetWidget(accessor.get(IViewsService), accessor.get(IChatWidgetService));
    if (!widget) {
      return;
    }
    const editor = widget.inputEditor;
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const range = (editor.getSelection() || model.getFullModelRange()).collapseToEnd();
    const text = mcpPromptPrefix(server.definition) + ".";
    model.applyEdits([{ range, text }]);
    editor.setSelection(Range.fromPositions(range.getEndPosition().delta(0, text.length)));
    widget.focusInput();
    SuggestController.get(editor)?.triggerSuggest();
  }
}
class McpSkipCurrentAutostartCommand extends Action2 {
  constructor() {
    super({
      id: McpCommandIds.SkipCurrentAutostart,
      title: localize2("mcp.skipCurrentAutostart", "Skip Current Autostart"),
      category,
      f1: false
    });
  }
  async run(accessor) {
    accessor.get(IMcpService).cancelAutostart();
  }
}
export {
  AddConfigurationAction,
  EditStoredInput,
  InstallFromManifestAction,
  ListMcpServerCommand,
  MCPServerActionRendering,
  McpAgentHostServerOptionsCommand,
  McpBrowseCommand,
  McpBrowseResourcesCommand,
  McpConfigureSamplingModels,
  McpConfirmationServerOptionsCommand,
  McpServerOptionsCommand,
  McpSkipCurrentAutostartCommand,
  McpStartPromptingServerCommand,
  OpenRemoteUserMcpResourceCommand,
  OpenUserMcpResourceCommand,
  OpenWorkspaceFolderMcpResourceCommand,
  OpenWorkspaceMcpResourceCommand,
  RemoveStoredInput,
  ResetMcpCachedTools,
  ResetMcpTrustCommand,
  RestartServer,
  SetOAuthClientSecret,
  ShowConfiguration,
  ShowInstalledMcpServersCommand,
  ShowOutput,
  StartServer,
  StopServer,
  findLocalMcpServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcENvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwsIEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyVG9vbHRpcEhUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IENoZWNrYm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgZmluZExhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBncm91cEJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nLCBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBtY3BBdXRvU3RhcnRDb25maWcsIE1jcEF1dG9TdGFydFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgc3Bpbm5pbmdMb2FkaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBQSUNLX1dPUktTUEFDRV9GT0xERVJfQ09NTUFORF9JRCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93b3Jrc3BhY2VDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBSZW1vdGVOYW1lQ29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5LCBXb3JrYmVuY2hTdGF0ZUNvbnRleHQsIFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWNjb3VudFF1ZXJ5LCBJQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb25RdWVyeS5qcyc7XG5pbXBvcnQgeyBNQ1BfQ09ORklHVVJBVElPTl9LRVksIFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3JlbW90ZVVzZXJEYXRhUHJvZmlsZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX0NPTkZJR19NRU5VX0lEIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdCwgSUNoYXRUb29sSW52b2NhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLCBpc0NvbnRyaWJ1dGlvbkRpc2FibGVkIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dGVuc2lvbnNGaWx0ZXJTdWJNZW51LCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIFZJRVdMRVRfSUQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRFWFRfRklMRV9FRElUT1JfSUQgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTWNwQ29tbWFuZElkcyB9IGZyb20gJy4uL2NvbW1vbi9tY3BDb21tYW5kSWRzLmpzJztcbmltcG9ydCB7IE1jcENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL21jcENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElNY3BSZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9tY3BSZWdpc3RyeVR5cGVzLmpzJztcbmltcG9ydCB7IEhhc0luc3RhbGxlZE1jcFNlcnZlcnNDb250ZXh0LCBJTWNwU2FtcGxpbmdTZXJ2aWNlLCBJTWNwU2VydmVyLCBJTWNwU2VydmVyU3RhcnRPcHRzLCBJTWNwU2VydmljZSwgSW5zdGFsbGVkTWNwU2VydmVyc1ZpZXdJZCwgTGF6eUNvbGxlY3Rpb25TdGF0ZSwgTWNwQ2FwYWJpbGl0eSwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sIE1jcENvbm5lY3Rpb25TdGF0ZSwgTWNwRGVmaW5pdGlvblJlZmVyZW5jZSwgbWNwT0F1dGhDbGllbnRTZWNyZXRTdG9yYWdlS2V5LCBtY3BQcm9tcHRQcmVmaXgsIE1jcFNlcnZlckNhY2hlU3RhdGUsIE1jcFN0YXJ0U2VydmVySW50ZXJhY3Rpb24gfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgc3RhcnRTZXJ2ZXJBbmRXYWl0Rm9yTGl2ZVRvb2xzIH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzVXRpbHMuanMnO1xuaW1wb3J0IHsgTWNwQWRkQ29uZmlndXJhdGlvbkNvbW1hbmQsIE1jcEluc3RhbGxGcm9tTWFuaWZlc3RDb21tYW5kIH0gZnJvbSAnLi9tY3BDb21tYW5kc0FkZENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWNwUmVzb3VyY2VRdWlja0FjY2VzcywgTWNwUmVzb3VyY2VRdWlja1BpY2sgfSBmcm9tICcuL21jcFJlc291cmNlUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0ICcuL21lZGlhL21jcFNlcnZlckFjdGlvbi5jc3MnO1xuaW1wb3J0IHsgb3BlblBhbmVsQ2hhdEFuZEdldFdpZGdldCB9IGZyb20gJy4vb3BlblBhbmVsQ2hhdEFuZEdldFdpZGdldC5qcyc7XG5cbi8vIGFjcm95bm1zIGRvIG5vdCBnZXQgbG9jYWxpemVkXG5jb25zdCBjYXRlZ29yeTogSUxvY2FsaXplZFN0cmluZyA9IHtcblx0b3JpZ2luYWw6ICdNQ1AnLFxuXHR2YWx1ZTogJ01DUCcsXG59O1xuXG5leHBvcnQgY2xhc3MgTGlzdE1jcFNlcnZlckNvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuTGlzdFNlcnZlcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5saXN0JywgJ0xpc3QgU2VydmVycycpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zZXJ2ZXIsXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7bWNwQXV0b1N0YXJ0Q29uZmlnfWAsIE1jcEF1dG9TdGFydFZhbHVlLk5ldmVyKSwgTWNwQ29udGV4dEtleXMuaGFzVW5rbm93blRvb2xzKSxcblx0XHRcdFx0XHRcdE1jcENvbnRleHRLZXlzLmhhc1NlcnZlcnNXaXRoRXJyb3JzLFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5uZWdhdGUoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dCxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEwMSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2VydmljZXM6IElMaXN0TWNwU2VydmVyU2VydmljZXMgPSB7XG5cdFx0XHRjaGF0V2lkZ2V0U2VydmljZTogYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSksXG5cdFx0XHRhZ2VudEhvc3RDdXN0b21pemF0aW9uczogYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSksXG5cdFx0XHRtY3BTZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSU1jcFNlcnZpY2UpLFxuXHRcdFx0Y29tbWFuZFNlcnZpY2U6IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLFxuXHRcdFx0cXVpY2tJbnB1dDogYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSksXG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlOiBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpLFxuXHRcdFx0bG9nU2VydmljZTogYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKSxcblx0XHR9O1xuXHRcdHJldHVybiB0aGlzLl9ydW5XaXRoTW9kZShzZXJ2aWNlcywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bldpdGhNb2RlKHNlcnZpY2VzOiBJTGlzdE1jcFNlcnZlclNlcnZpY2VzLCBpbml0aWFsTW9kZTogJ2xvY2FsJyB8IHsgYWdlbnRIb3N0U2Vzc2lvbjogVVJJIH0gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgbW9kZSA9IGluaXRpYWxNb2RlO1xuXHRcdGlmIChtb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHNlcnZpY2VzLmNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGNvbnN0IGhhc0FnZW50SG9zdE1jcCA9IHNlc3Npb25SZXNvdXJjZSAmJiBzZXJ2aWNlcy5hZ2VudEhvc3RDdXN0b21pemF0aW9ucy5nZXRNY3BTZXJ2ZXJzKHNlc3Npb25SZXNvdXJjZSkubGVuZ3RoID4gMDtcblx0XHRcdG1vZGUgPSBoYXNBZ2VudEhvc3RNY3AgPyB7IGFnZW50SG9zdFNlc3Npb246IHNlc3Npb25SZXNvdXJjZSEgfSA6ICdsb2NhbCc7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGUgPT09ICdsb2NhbCcpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3J1bkxvY2FsKHNlcnZpY2VzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXh0TW9kZSA9IGF3YWl0IHRoaXMuX3J1bkFnZW50SG9zdChzZXJ2aWNlcywgbW9kZS5hZ2VudEhvc3RTZXNzaW9uKTtcblx0XHRpZiAobmV4dE1vZGUgPT09ICdsb2NhbCcpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3J1bldpdGhNb2RlKHNlcnZpY2VzLCAnbG9jYWwnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5Mb2NhbChzZXJ2aWNlczogSUxpc3RNY3BTZXJ2ZXJTZXJ2aWNlcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgbWNwU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIHF1aWNrSW5wdXQgfSA9IHNlcnZpY2VzO1xuXG5cdFx0dHlwZSBJdGVtVHlwZSA9IHsgaWQ6IHN0cmluZyB9ICYgSVF1aWNrUGlja0l0ZW07XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrID0gcXVpY2tJbnB1dC5jcmVhdGVRdWlja1BpY2s8SXRlbVR5cGU+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRwaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ21jcC5zZWxlY3RTZXJ2ZXInLCAnU2VsZWN0IGFuIE1DUCBTZXJ2ZXInKTtcblxuXHRcdG1jcFNlcnZpY2UuYWN0aXZhdGVDb2xsZWN0aW9ucygpO1xuXG5cdFx0c3RvcmUuYWRkKHBpY2spO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlcnZlcnMgPSBncm91cEJ5KG1jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcikuc2xpY2UoKS5zb3J0KChhLCBiKSA9PiBhLmNvbGxlY3Rpb24ub3JkZXIgLSBiLmNvbGxlY3Rpb24ub3JkZXIpLCBzID0+IHMuY29sbGVjdGlvbi5pZCk7XG5cdFx0XHRjb25zdCBmaXJzdFJ1biA9IHBpY2suaXRlbXMubGVuZ3RoID09PSAwO1xuXHRcdFx0Y29uc3QgcHJldmlvdXNBY3RpdmVJZCA9IHBpY2suYWN0aXZlSXRlbXNbMF0/LmlkO1xuXG5cdFx0XHRwaWNrLml0ZW1zID0gW1xuXHRcdFx0XHR7IGlkOiAnJGFkZCcsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFkZFNlcnZlcicsICdBZGQgU2VydmVyJyksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLmFkZFNlcnZlci5kZXNjcmlwdGlvbicsICdBZGQgYSBuZXcgc2VydmVyIGNvbmZpZ3VyYXRpb24nKSwgYWx3YXlzU2hvdzogdHJ1ZSwgaWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5hZGQpIH0sXG5cdFx0XHRcdC4uLk9iamVjdC52YWx1ZXMoc2VydmVycykuZmlsdGVyKHMgPT4gcyEubGVuZ3RoKS5mbGF0TWFwKChzZXJ2ZXJzKTogKEl0ZW1UeXBlIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9PiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IHNlcnZlcnMhWzBdLmNvbGxlY3Rpb24ubGFiZWwsIGlkOiBzZXJ2ZXJzIVswXS5jb2xsZWN0aW9uLmlkIH0sXG5cdFx0XHRcdFx0Li4uc2VydmVycyEubWFwKHNlcnZlciA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNhYmxlZCA9IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQoc2VydmVyLmVuYWJsZW1lbnQucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBzZXJ2ZXIuZGVmaW5pdGlvbi5pZCxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHNlcnZlci5kZWZpbml0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGlzYWJsZWRcblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtY3AuZGlzYWJsZWQnLCAnRGlzYWJsZWQnKVxuXHRcdFx0XHRcdFx0XHRcdDogTWNwQ29ubmVjdGlvblN0YXRlLnRvU3RyaW5nKHNlcnZlci5jb25uZWN0aW9uU3RhdGUucmVhZChyZWFkZXIpKSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XTtcblxuXHRcdFx0Ly8gUHJlc2VydmUgdGhlIHByZXZpb3VzbHkgc2VsZWN0ZWQgaXRlbSBpZiBpdCBzdGlsbCBleGlzdHMsIG90aGVyd2lzZSBzZWxlY3QgdGhlIGZpcnN0IHNlcnZlciBvbiBmaXJzdCBydW5cblx0XHRcdGlmIChwcmV2aW91c0FjdGl2ZUlkKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzSXRlbSA9IHBpY2suaXRlbXMuZmluZCgoaXRlbSk6IGl0ZW0gaXMgSXRlbVR5cGUgPT4gISgndHlwZScgaW4gaXRlbSkgJiYgaXRlbS5pZCA9PT0gcHJldmlvdXNBY3RpdmVJZCk7XG5cdFx0XHRcdGlmIChwcmV2aW91c0l0ZW0pIHtcblx0XHRcdFx0XHRwaWNrLmFjdGl2ZUl0ZW1zID0gW3ByZXZpb3VzSXRlbV07XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaXJzdFJ1biAmJiBwaWNrLml0ZW1zLmxlbmd0aCA+IDMpIHtcblx0XHRcdFx0cGljay5hY3RpdmVJdGVtcyA9IHBpY2suaXRlbXMuc2xpY2UoMiwgMykgYXMgSXRlbVR5cGVbXTsgLy8gc2VsZWN0IHRoZSBmaXJzdCBzZXJ2ZXIgYnkgZGVmYXVsdFxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXG5cdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgbmV3IFByb21pc2U8SXRlbVR5cGUgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHBpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHBpY2suYWN0aXZlSXRlbXNbMF0pO1xuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKHBpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cGljay5zaG93KCk7XG5cdFx0fSk7XG5cblx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cblx0XHRpZiAoIXBpY2tlZCkge1xuXHRcdFx0Ly8gbm8tb3Bcblx0XHR9IGVsc2UgaWYgKHBpY2tlZC5pZCA9PT0gJyRhZGQnKSB7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkFkZENvbmZpZ3VyYXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsIHBpY2tlZC5pZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuQWdlbnRIb3N0KHNlcnZpY2VzOiBJTGlzdE1jcFNlcnZlclNlcnZpY2VzLCBhZ2VudEhvc3RTZXNzaW9uOiBVUkkpOiBQcm9taXNlPCdsb2NhbCcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLCBjb21tYW5kU2VydmljZSwgcXVpY2tJbnB1dCB9ID0gc2VydmljZXM7XG5cblx0XHRjb25zdCBCQUNLX0lEID0gJyRiYWNrJztcblx0XHR0eXBlIEl0ZW1UeXBlID0geyBpZDogc3RyaW5nOyBzZXJ2ZXI/OiBJQWdlbnRIb3N0TWNwU2VydmVyIH0gJiBJUXVpY2tQaWNrSXRlbTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHBpY2sgPSBxdWlja0lucHV0LmNyZWF0ZVF1aWNrUGljazxJdGVtVHlwZT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pO1xuXHRcdHBpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnbWNwLnNlbGVjdEFnZW50SG9zdFNlcnZlcicsICdTZWxlY3QgYW4gTUNQIFNlcnZlciBmb3IgdGhpcyBzZXNzaW9uJyk7XG5cblx0XHRzdG9yZS5hZGQocGljayk7XG5cblx0XHRjb25zdCByZWZyZXNoID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3RSdW4gPSBwaWNrLml0ZW1zLmxlbmd0aCA9PT0gMDtcblx0XHRcdGNvbnN0IHByZXZpb3VzQWN0aXZlSWQgPSBwaWNrLmFjdGl2ZUl0ZW1zWzBdPy5pZDtcblx0XHRcdGNvbnN0IHNlcnZlcnMgPSBhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5nZXRNY3BTZXJ2ZXJzKGFnZW50SG9zdFNlc3Npb24pO1xuXG5cdFx0XHRwaWNrLml0ZW1zID0gW1xuXHRcdFx0XHQuLi4oc2VydmVycy5sZW5ndGggPT09IDAgPyBbe1xuXHRcdFx0XHRcdGlkOiAnJGVtcHR5Jyxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Qubm9TZXJ2ZXJzJywgJ05vIE1DUCBzZXJ2ZXJzJyksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0Lm5vU2VydmVycy5kZXNjcmlwdGlvbicsICdUaGlzIHNlc3Npb24gZG9lcyBub3QgZXhwb3NlIGFueSBNQ1Agc2VydmVycycpLFxuXHRcdFx0XHRcdGFsd2F5c1Nob3c6IHRydWUsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIEl0ZW1UeXBlXSA6IHNlcnZlcnMubWFwKChzZXJ2ZXIpOiBJdGVtVHlwZSA9PiAoe1xuXHRcdFx0XHRcdGlkOiBzZXJ2ZXIuaWQsXG5cdFx0XHRcdFx0c2VydmVyLFxuXHRcdFx0XHRcdGxhYmVsOiBzZXJ2ZXIubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogc2VydmVyLmVuYWJsZWRcblx0XHRcdFx0XHRcdD8gbWNwU2VydmVyU3RhdHVzVG9MYWJlbChzZXJ2ZXIuc3RhdHVzKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbWNwLmRpc2FibGVkJywgJ0Rpc2FibGVkJyksXG5cdFx0XHRcdFx0YnV0dG9uczogZ2V0QWdlbnRIb3N0TWNwU2VydmVyQnV0dG9ucyhzZXJ2ZXIpLFxuXHRcdFx0XHR9KSkpLFxuXHRcdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InIH0gc2F0aXNmaWVzIElRdWlja1BpY2tTZXBhcmF0b3IsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogQkFDS19JRCxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc2hvd0xvY2FsJywgJ1Nob3cgbG9jYWxseSBjb25maWd1cmVkIHNlcnZlcnMuLi4nKSxcblx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmFycm93TGVmdCksXG5cdFx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSXRlbVR5cGUsXG5cdFx0XHRdO1xuXG5cdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgcHJldmlvdXNseSBzZWxlY3RlZCBpdGVtIGlmIGl0IHN0aWxsIGV4aXN0cywgb3RoZXJ3aXNlIHNlbGVjdCB0aGUgZmlyc3Qgc2VydmVyIG9uIGZpcnN0IHJ1blxuXHRcdFx0aWYgKHByZXZpb3VzQWN0aXZlSWQpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNJdGVtID0gcGljay5pdGVtcy5maW5kKChpdGVtKTogaXRlbSBpcyBJdGVtVHlwZSA9PiAhKCd0eXBlJyBpbiBpdGVtKSAmJiBpdGVtLmlkID09PSBwcmV2aW91c0FjdGl2ZUlkKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzSXRlbSkge1xuXHRcdFx0XHRcdHBpY2suYWN0aXZlSXRlbXMgPSBbcHJldmlvdXNJdGVtXTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGZpcnN0UnVuICYmIHNlcnZlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRwaWNrLmFjdGl2ZUl0ZW1zID0gW3BpY2suaXRlbXNbMF0gYXMgSXRlbVR5cGVdO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZWZyZXNoKCk7XG5cdFx0c3RvcmUuYWRkKGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLm9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMoKCkgPT4gcmVmcmVzaCgpKSk7XG5cdFx0c3RvcmUuYWRkKHBpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihhc3luYyBldmVudCA9PiB7XG5cdFx0XHRpZiAoIWlzQWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uKGV2ZW50LmJ1dHRvbikgfHwgIWV2ZW50Lml0ZW0uc2VydmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cGljay5idXN5ID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJ1bkFnZW50SG9zdE1jcFNlcnZlckxpZmVjeWNsZUFjdGlvbihldmVudC5pdGVtLnNlcnZlciwgZXZlbnQuYnV0dG9uLmFjdGlvbiwgc2VydmljZXMpO1xuXHRcdFx0XHRyZWZyZXNoKCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRwaWNrLmJ1c3kgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCBuZXcgUHJvbWlzZTxJdGVtVHlwZSB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQocGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGljay5hY3RpdmVJdGVtc1swXSk7XG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQocGljay5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRwaWNrLnNob3coKTtcblx0XHR9KTtcblxuXHRcdHN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGlmICghcGlja2VkIHx8IHBpY2tlZC5pZCA9PT0gJyRlbXB0eScpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2tlZC5pZCA9PT0gQkFDS19JRCkge1xuXHRcdFx0cmV0dXJuICdsb2NhbCc7XG5cdFx0fVxuXG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5BZ2VudEhvc3RTZXJ2ZXJPcHRpb25zLCBhZ2VudEhvc3RTZXNzaW9uLCBwaWNrZWQuaWQpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElMaXN0TWNwU2VydmVyU2VydmljZXMge1xuXHRyZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlO1xuXHRyZWFkb25seSBhZ2VudEhvc3RDdXN0b21pemF0aW9uczogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZTtcblx0cmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZTtcblx0cmVhZG9ubHkgcXVpY2tJbnB1dDogSVF1aWNrSW5wdXRTZXJ2aWNlO1xuXHRyZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZTtcblx0cmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG59XG5cbnR5cGUgQWdlbnRIb3N0TWNwU2VydmVyTGlmZWN5Y2xlQWN0aW9uID0gJ3N0YXJ0JyB8ICdzdG9wJztcbnR5cGUgSUFnZW50SG9zdE1jcFNlcnZlciA9IFJldHVyblR5cGU8SUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlWydnZXRNY3BTZXJ2ZXJzJ10+W251bWJlcl07XG5cbmludGVyZmFjZSBJQWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uIGV4dGVuZHMgSVF1aWNrSW5wdXRCdXR0b24ge1xuXHRyZWFkb25seSBhY3Rpb246IEFnZW50SG9zdE1jcFNlcnZlckxpZmVjeWNsZUFjdGlvbjtcbn1cblxuZnVuY3Rpb24gaXNBZ2VudEhvc3RNY3BTZXJ2ZXJCdXR0b24oYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbik6IGJ1dHRvbiBpcyBJQWdlbnRIb3N0TWNwU2VydmVyQnV0dG9uIHtcblx0cmV0dXJuICdhY3Rpb24nIGluIGJ1dHRvbiAmJiAoYnV0dG9uLmFjdGlvbiA9PT0gJ3N0YXJ0JyB8fCBidXR0b24uYWN0aW9uID09PSAnc3RvcCcpO1xufVxuXG5jb25zdCBzdGFydEFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbjogSUFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbiA9IHtcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5wbGF5KSxcblx0dG9vbHRpcDogbG9jYWxpemUoJ21jcC5zdGFydCcsICdTdGFydCBTZXJ2ZXInKSxcblx0YWN0aW9uOiAnc3RhcnQnLFxufTtcblxuY29uc3Qgc3RvcEFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbjogSUFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbiA9IHtcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kZWJ1Z1N0b3ApLFxuXHR0b29sdGlwOiBsb2NhbGl6ZSgnbWNwLnN0b3AnLCAnU3RvcCBTZXJ2ZXInKSxcblx0YWN0aW9uOiAnc3RvcCcsXG59O1xuXG5mdW5jdGlvbiBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJCdXR0b25zKHNlcnZlcjogSUFnZW50SG9zdE1jcFNlcnZlcik6IElBZ2VudEhvc3RNY3BTZXJ2ZXJCdXR0b25bXSB7XG5cdGlmIChjYW5TdGFydEFnZW50SG9zdE1jcFNlcnZlcihzZXJ2ZXIpKSB7XG5cdFx0cmV0dXJuIFtzdGFydEFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbl07XG5cdH1cblx0aWYgKGNhblN0b3BBZ2VudEhvc3RNY3BTZXJ2ZXIoc2VydmVyKSkge1xuXHRcdHJldHVybiBbc3RvcEFnZW50SG9zdE1jcFNlcnZlckJ1dHRvbl07XG5cdH1cblx0cmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBjYW5TdGFydEFnZW50SG9zdE1jcFNlcnZlcihzZXJ2ZXI6IElBZ2VudEhvc3RNY3BTZXJ2ZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIHNlcnZlci5lbmFibGVkICYmIChzZXJ2ZXIuc3RhdHVzID09PSBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB8fCBzZXJ2ZXIuc3RhdHVzID09PSBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IpO1xufVxuXG5mdW5jdGlvbiBjYW5TdG9wQWdlbnRIb3N0TWNwU2VydmVyKHNlcnZlcjogSUFnZW50SG9zdE1jcFNlcnZlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2VydmVyLmVuYWJsZWQgJiYgKFxuXHRcdHNlcnZlci5zdGF0dXMgPT09IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZ1xuXHRcdHx8IHNlcnZlci5zdGF0dXMgPT09IE1jcFNlcnZlclN0YXR1cy5SZWFkeVxuXHRcdHx8IHNlcnZlci5zdGF0dXMgPT09IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWRcblx0KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcnVuQWdlbnRIb3N0TWNwU2VydmVyTGlmZWN5Y2xlQWN0aW9uKHNlcnZlcjogSUFnZW50SG9zdE1jcFNlcnZlciwgYWN0aW9uOiBBZ2VudEhvc3RNY3BTZXJ2ZXJMaWZlY3ljbGVBY3Rpb24sIHNlcnZpY2VzOiBQaWNrPElMaXN0TWNwU2VydmVyU2VydmljZXMsICdub3RpZmljYXRpb25TZXJ2aWNlJyB8ICdsb2dTZXJ2aWNlJz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0dHJ5IHtcblx0XHRpZiAoYWN0aW9uID09PSAnc3RhcnQnICYmIGNhblN0YXJ0QWdlbnRIb3N0TWNwU2VydmVyKHNlcnZlcikpIHtcblx0XHRcdGF3YWl0IHNlcnZlci5zdGFydCgpO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uID09PSAnc3RvcCcgJiYgY2FuU3RvcEFnZW50SG9zdE1jcFNlcnZlcihzZXJ2ZXIpKSB7XG5cdFx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHRcdH1cblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRzZXJ2aWNlcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gJHthY3Rpb259IE1DUCBzZXJ2ZXIgJyR7c2VydmVyLm5hbWV9J2AsIGVycm9yKTtcblx0XHRjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuXHRcdHNlcnZpY2VzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoYWN0aW9uID09PSAnc3RhcnQnXG5cdFx0XHQ/IGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LnN0YXJ0RXJyb3InLCBcIkZhaWxlZCB0byBzdGFydCBNQ1Agc2VydmVyICd7MH0nOiB7MX1cIiwgc2VydmVyLm5hbWUsIG1lc3NhZ2UpXG5cdFx0XHQ6IGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LnN0b3BFcnJvcicsIFwiRmFpbGVkIHRvIHN0b3AgTUNQIHNlcnZlciAnezB9JzogezF9XCIsIHNlcnZlci5uYW1lLCBtZXNzYWdlKSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbWNwU2VydmVyU3RhdHVzVG9MYWJlbChzdGF0dXM6IE1jcFNlcnZlclN0YXR1cyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmc6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc3RhdHVzLnN0YXJ0aW5nJywgJ1N0YXJ0aW5nJyk7XG5cdFx0Y2FzZSBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHk6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc3RhdHVzLnJlYWR5JywgJ1J1bm5pbmcnKTtcblx0XHRjYXNlIE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc3RhdHVzLmF1dGhSZXF1aXJlZCcsICdBdXRoZW50aWNhdGlvbiByZXF1aXJlZCcpO1xuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLkVycm9yOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LnN0YXR1cy5lcnJvcicsICdFcnJvcicpO1xuXHRcdGNhc2UgTWNwU2VydmVyU3RhdHVzLlN0b3BwZWQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3Quc3RhdHVzLnN0b3BwZWQnLCAnU3RvcHBlZCcpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gJyc7XG5cdH1cbn1cblxudHlwZSBBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uID0gJ2VuYWJsZVByb2ZpbGUnIHwgJ2Rpc2FibGVQcm9maWxlJyB8ICdlbmFibGVXb3Jrc3BhY2UnIHwgJ2Rpc2FibGVXb3Jrc3BhY2UnO1xuXG5pbnRlcmZhY2UgQWdlbnRIb3N0RW5hYmxlbWVudEl0ZW1UeXBlIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRhY3Rpb246IEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb247XG59XG5cbmZ1bmN0aW9uIGdldEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRJdGVtcyhkaXNhYmxlZDogYm9vbGVhbiwgaXNFbXB0eVdvcmtiZW5jaDogYm9vbGVhbik6IEFnZW50SG9zdEVuYWJsZW1lbnRJdGVtVHlwZVtdIHtcblx0Y29uc3QgaXRlbXM6IEFnZW50SG9zdEVuYWJsZW1lbnRJdGVtVHlwZVtdID0gW107XG5cdGlmIChkaXNhYmxlZCkge1xuXHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZW5hYmxlJywgJ0VuYWJsZScpLCBhY3Rpb246ICdlbmFibGVQcm9maWxlJyB9KTtcblx0XHRpZiAoIWlzRW1wdHlXb3JrYmVuY2gpIHtcblx0XHRcdGl0ZW1zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZW5hYmxlV29ya3NwYWNlJywgJ0VuYWJsZSAoV29ya3NwYWNlKScpLCBhY3Rpb246ICdlbmFibGVXb3Jrc3BhY2UnIH0pO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LmRpc2FibGUnLCAnRGlzYWJsZScpLCBhY3Rpb246ICdkaXNhYmxlUHJvZmlsZScgfSk7XG5cdFx0aWYgKCFpc0VtcHR5V29ya2JlbmNoKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHsgbGFiZWw6IGxvY2FsaXplKCdtY3AuYWdlbnRIb3N0LmRpc2FibGVXb3Jrc3BhY2UnLCAnRGlzYWJsZSAoV29ya3NwYWNlKScpLCBhY3Rpb246ICdkaXNhYmxlV29ya3NwYWNlJyB9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGl0ZW1zO1xufVxuXG5mdW5jdGlvbiBlbmFibGVtZW50U3RhdGVGb3JBY3Rpb24oYWN0aW9uOiBBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9uKTogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlIHtcblx0c3dpdGNoIChhY3Rpb24pIHtcblx0XHRjYXNlICdlbmFibGVQcm9maWxlJzpcblx0XHRcdHJldHVybiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGU7XG5cdFx0Y2FzZSAnZGlzYWJsZVByb2ZpbGUnOlxuXHRcdFx0cmV0dXJuIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGU7XG5cdFx0Y2FzZSAnZW5hYmxlV29ya3NwYWNlJzpcblx0XHRcdHJldHVybiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZTtcblx0XHRjYXNlICdkaXNhYmxlV29ya3NwYWNlJzpcblx0XHRcdHJldHVybiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2U7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBhc3NlcnROZXZlcihhY3Rpb24pO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTG9jYWxNY3BTZXJ2ZXIobWNwU2VydmljZTogSU1jcFNlcnZpY2UsIHNlcnZlcjogSUFnZW50SG9zdE1jcFNlcnZlcik6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzZXJ2ZXJzID0gbWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpO1xuXHRjb25zdCBzZXBhcmF0b3IgPSBzZXJ2ZXIuaWQuaW5kZXhPZignLycpO1xuXHRjb25zdCByYXdJZCA9IHNlcGFyYXRvciA+PSAwID8gc2VydmVyLmlkLnNsaWNlKHNlcGFyYXRvciArIDEpIDogc2VydmVyLmlkO1xuXHRjb25zdCBpZE1hdGNoZXMgPSBzZXJ2ZXJzLmZpbHRlcihjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmRlZmluaXRpb24uaWQgPT09IHJhd0lkKTtcblx0aWYgKGlkTWF0Y2hlcy5sZW5ndGggPT09IDEpIHtcblx0XHRyZXR1cm4gaWRNYXRjaGVzWzBdO1xuXHR9XG5cdGNvbnN0IG5hbWVNYXRjaGVzID0gc2VydmVycy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5kZWZpbml0aW9uLmxhYmVsID09PSBzZXJ2ZXIubmFtZSk7XG5cdHJldHVybiBuYW1lTWF0Y2hlcy5sZW5ndGggPT09IDEgPyBuYW1lTWF0Y2hlc1swXSA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIE1jcEFnZW50SG9zdFNlcnZlck9wdGlvbnNDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkFnZW50SG9zdFNlcnZlck9wdGlvbnMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuYWdlbnRIb3N0T3B0aW9ucycsICdBZ2VudCBIb3N0IFNlcnZlciBPcHRpb25zJyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYWdlbnRIb3N0U2Vzc2lvbjogVVJJLCBjdXN0b21pemF0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFnZW50SG9zdEN1c3RvbWl6YXRpb25zID0gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBhaUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlKTtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNY3BTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlcnZlciA9IGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLmdldE1jcFNlcnZlcnMoYWdlbnRIb3N0U2Vzc2lvbikuZmluZChzID0+IHMuaWQgPT09IGN1c3RvbWl6YXRpb25JZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0eXBlIEl0ZW1UeXBlID0geyBhY3Rpb246ICd0b2dnbGVTZXNzaW9uJyB8ICdzaG93T3V0cHV0JyB8ICdhdXRoZW50aWNhdGUnIHwgQWdlbnRIb3N0TWNwU2VydmVyTGlmZWN5Y2xlQWN0aW9uIHwgQWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbiB9ICYgSVF1aWNrUGlja0l0ZW07XG5cblx0XHRjb25zdCBpdGVtczogKEl0ZW1UeXBlIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFjdGlvbnMuc3RhdHVzJywgJ1N0YXR1cycpIH0sXG5cdFx0XTtcblx0XHRpZiAoY2FuU3RhcnRBZ2VudEhvc3RNY3BTZXJ2ZXIoc2VydmVyKSkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnN0YXJ0JywgJ1N0YXJ0IFNlcnZlcicpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbWNwU2VydmVyU3RhdHVzVG9MYWJlbChzZXJ2ZXIuc3RhdHVzKSxcblx0XHRcdFx0YWN0aW9uOiAnc3RhcnQnLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChjYW5TdG9wQWdlbnRIb3N0TWNwU2VydmVyKHNlcnZlcikpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zdG9wJywgJ1N0b3AgU2VydmVyJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBtY3BTZXJ2ZXJTdGF0dXNUb0xhYmVsKHNlcnZlci5zdGF0dXMpLFxuXHRcdFx0XHRhY3Rpb246ICdzdG9wJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvY2FsU2VydmVyID0gZmluZExvY2FsTWNwU2VydmVyKG1jcFNlcnZpY2UsIHNlcnZlcik7XG5cdFx0Y29uc3QgZHVyYWJsZUVuYWJsZW1lbnQgPSBsb2NhbFNlcnZlclxuXHRcdFx0PyBsb2NhbFNlcnZlci5lbmFibGVtZW50LmdldCgpXG5cdFx0XHQ6IGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLmdldE1jcFNlcnZlckVuYWJsZW1lbnQoYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLm5hbWUpO1xuXHRcdGNvbnN0IGR1cmFibGVEaXNhYmxlZCA9IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQoZHVyYWJsZUVuYWJsZW1lbnQpO1xuXHRcdGNvbnN0IGlzRW1wdHlXb3JrYmVuY2ggPSBhaUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCkgPT09IHVuZGVmaW5lZDtcblx0XHRpdGVtcy5wdXNoKFxuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdtY3AuYWN0aW9ucy5lbmFibGVtZW50JywgJ0VuYWJsZW1lbnQnKSB9LFxuXHRcdFx0Li4uZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEl0ZW1zKGR1cmFibGVEaXNhYmxlZCwgaXNFbXB0eVdvcmtiZW5jaCksXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBzZXJ2ZXIuZW5hYmxlZFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZGlzYWJsZVNlc3Npb24nLCAnRGlzYWJsZSAoU2Vzc2lvbiknKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21jcC5hZ2VudEhvc3QuZW5hYmxlU2Vzc2lvbicsICdFbmFibGUgKFNlc3Npb24pJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBzZXJ2ZXIuZW5hYmxlZFxuXHRcdFx0XHRcdD8gbWNwU2VydmVyU3RhdHVzVG9MYWJlbChzZXJ2ZXIuc3RhdHVzKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21jcC5kaXNhYmxlZCcsICdEaXNhYmxlZCcpLFxuXHRcdFx0XHRhY3Rpb246ICd0b2dnbGVTZXNzaW9uJyxcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdGlmIChzZXJ2ZXIuc3RhdGUua2luZCA9PT0gTWNwU2VydmVyU3RhdHVzLkF1dGhSZXF1aXJlZCkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5hdXRoZW50aWNhdGUnLCAnQXV0aGVudGljYXRlJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBzZXJ2ZXIuc3RhdGUucmVzb3VyY2UucmVzb3VyY2UsXG5cdFx0XHRcdGFjdGlvbjogJ2F1dGhlbnRpY2F0ZScsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBFdmVyeSBhZ2VudC1ob3N0IE1DUCBzZXJ2ZXIgaGFzIGEgcGVyLXNlcnZlciBkaWFnbm9zdGljcyBjaGFubmVsLlxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3Auc2hvd091dHB1dCcsICdTaG93IE91dHB1dCcpLFxuXHRcdFx0YWN0aW9uOiAnc2hvd091dHB1dCcsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRwbGFjZUhvbGRlcjogc2VydmVyLm5hbWUsXG5cdFx0fSk7XG5cblx0XHRpZiAoIXBpY2tlZCB8fCAhaGFzS2V5KHBpY2tlZCwgeyBhY3Rpb246IHRydWUgfSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGlja2VkLmFjdGlvbiA9PT0gJ3Nob3dPdXRwdXQnKSB7XG5cdFx0XHRhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5zaG93TWNwU2VydmVyTG9nKGFnZW50SG9zdFNlc3Npb24sIHNlcnZlci5pZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHBpY2tlZC5hY3Rpb24gPT09ICdhdXRoZW50aWNhdGUnKSB7XG5cdFx0XHRhd2FpdCBhZ2VudEhvc3RDdXN0b21pemF0aW9ucy5hdXRoZW50aWNhdGVNY3BTZXJ2ZXIoYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLmlkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGlja2VkLmFjdGlvbiA9PT0gJ3N0YXJ0JyB8fCBwaWNrZWQuYWN0aW9uID09PSAnc3RvcCcpIHtcblx0XHRcdGF3YWl0IHJ1bkFnZW50SG9zdE1jcFNlcnZlckxpZmVjeWNsZUFjdGlvbihzZXJ2ZXIsIHBpY2tlZC5hY3Rpb24sIHsgbm90aWZpY2F0aW9uU2VydmljZSwgbG9nU2VydmljZSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocGlja2VkLmFjdGlvbiA9PT0gJ3RvZ2dsZVNlc3Npb24nKSB7XG5cdFx0XHRzZXJ2ZXIuc2V0RW5hYmxlZCghc2VydmVyLmVuYWJsZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gZW5hYmxlbWVudFN0YXRlRm9yQWN0aW9uKHBpY2tlZC5hY3Rpb24pO1xuXHRcdGlmIChsb2NhbFNlcnZlcikge1xuXHRcdFx0bWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZChsb2NhbFNlcnZlci5kZWZpbml0aW9uLmlkLCBzdGF0ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFnZW50SG9zdEN1c3RvbWl6YXRpb25zLnNldE1jcFNlcnZlckVuYWJsZW1lbnQoYWdlbnRIb3N0U2Vzc2lvbiwgc2VydmVyLm5hbWUsIHN0YXRlKTtcblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIEFjdGlvbkl0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGFjdGlvbjogJ3N0YXJ0JyB8ICdzdG9wJyB8ICdyZXN0YXJ0JyB8ICdzaG93T3V0cHV0JyB8ICdjb25maWcnIHwgJ2NvbmZpZ1NhbXBsaW5nJyB8ICdzYW1wbGluZ0xvZycgfCAncmVzb3VyY2VzJyB8ICdlbmFibGUnO1xufVxuXG5pbnRlcmZhY2UgQXV0aEFjdGlvbkl0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGFjdGlvbjogJ2Rpc2Nvbm5lY3QnIHwgJ3NpZ25vdXQnO1xuXHRhY2NvdW50UXVlcnk6IElBY2NvdW50UXVlcnk7XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BDb25maXJtYXRpb25TZXJ2ZXJPcHRpb25zQ29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TZXJ2ZXJPcHRpb25zSW5Db25maXJtYXRpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3Aub3B0aW9ucycsICdTZXJ2ZXIgT3B0aW9ucycpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNldHRpbmdzR2Vhcixcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdENvbmZpcm1hdGlvbk1lbnUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NoYXRDb25maXJtYXRpb25QYXJ0U291cmNlJywgJ21jcCcpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjaGF0Q29uZmlybWF0aW9uUGFydFR5cGUnLCAnY2hhdFRvb2xDb25maXJtYXRpb24nKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY2hhdENvbmZpcm1hdGlvblBhcnRUeXBlJywgJ2VsaWNpdGF0aW9uJyksXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZzogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0RWxpY2l0YXRpb25SZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9vbHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTtcblx0XHRpZiAoYXJnLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdGNvbnN0IHRvb2wgPSB0b29sc1NlcnZpY2UuZ2V0VG9vbChhcmcudG9vbElkKTtcblx0XHRcdGlmICh0b29sPy5zb3VyY2UudHlwZSA9PT0gJ21jcCcpIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5TZXJ2ZXJPcHRpb25zLCB0b29sLnNvdXJjZS5kZWZpbml0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYXJnLmtpbmQgPT09ICdlbGljaXRhdGlvbjInKSB7XG5cdFx0XHRpZiAoYXJnLnNvdXJjZT8udHlwZSA9PT0gJ21jcCcpIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5TZXJ2ZXJPcHRpb25zLCBhcmcuc291cmNlLmRlZmluaXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydE5ldmVyKGFyZyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJPcHRpb25zQ29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5TZXJ2ZXJPcHRpb25zLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLm9wdGlvbnMnLCAnU2VydmVyIE9wdGlvbnMnKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IGFjY2Vzc29yLmdldChJTWNwU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBtY3BSZWdpc3RyeSA9IGFjY2Vzc29yLmdldChJTWNwUmVnaXN0cnkpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3Qgc2FtcGxpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNY3BTYW1wbGluZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZSk7XG5cdFx0Y29uc3QgYXV0aGVudGljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlcnZlciA9IG1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBpZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IHNlcnZlci5jb2xsZWN0aW9uLmlkKTtcblx0XHRjb25zdCBzZXJ2ZXJEZWZpbml0aW9uID0gY29sbGVjdGlvbj8uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCkuZmluZChzID0+IHMuaWQgPT09IHNlcnZlci5kZWZpbml0aW9uLmlkKTtcblxuXHRcdGNvbnN0IGl0ZW1zOiAoQWN0aW9uSXRlbSB8IEF1dGhBY3Rpb25JdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtdO1xuXHRcdGNvbnN0IHNlcnZlclN0YXRlID0gc2VydmVyLmNvbm5lY3Rpb25TdGF0ZS5nZXQoKTtcblx0XHRjb25zdCBkaXNhYmxlZCA9IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQoc2VydmVyLmVuYWJsZW1lbnQuZ2V0KCkpO1xuXG5cdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ21jcC5hY3Rpb25zLnN0YXR1cycsICdTdGF0dXMnKSB9KTtcblxuXHRcdGlmIChkaXNhYmxlZCkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmVuYWJsZVdvcmtzcGFjZScsICdFbmFibGUgU2VydmVyIChXb3Jrc3BhY2UpJyksXG5cdFx0XHRcdGFjdGlvbjogJ2VuYWJsZSdcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoTWNwQ29ubmVjdGlvblN0YXRlLmNhbkJlU3RhcnRlZChzZXJ2ZXJTdGF0ZS5zdGF0ZSkpIHtcblx0XHRcdC8vIE9ubHkgc2hvdyBzdGFydCB3aGVuIHNlcnZlciBpcyBzdG9wcGVkIG9yIGluIGVycm9yIHN0YXRlXG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3Auc3RhcnQnLCAnU3RhcnQgU2VydmVyJyksXG5cdFx0XHRcdGFjdGlvbjogJ3N0YXJ0J1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zdG9wJywgJ1N0b3AgU2VydmVyJyksXG5cdFx0XHRcdGFjdGlvbjogJ3N0b3AnXG5cdFx0XHR9KTtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5yZXN0YXJ0JywgJ1Jlc3RhcnQgU2VydmVyJyksXG5cdFx0XHRcdGFjdGlvbjogJ3Jlc3RhcnQnXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpdGVtcy5wdXNoKC4uLnRoaXMuX2dldEF1dGhBY3Rpb25zKGF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlLCBzZXJ2ZXIuZGVmaW5pdGlvbi5pZCkpO1xuXG5cdFx0Y29uc3QgY29uZmlnVGFyZ2V0ID0gc2VydmVyRGVmaW5pdGlvbj8ucHJlc2VudGF0aW9uPy5vcmlnaW4gfHwgY29sbGVjdGlvbj8ucHJlc2VudGF0aW9uPy5vcmlnaW47XG5cdFx0aWYgKGNvbmZpZ1RhcmdldCkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmNvbmZpZycsICdTaG93IENvbmZpZ3VyYXRpb24nKSxcblx0XHRcdFx0YWN0aW9uOiAnY29uZmlnJyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3Auc2hvd091dHB1dCcsICdTaG93IE91dHB1dCcpLFxuXHRcdFx0YWN0aW9uOiAnc2hvd091dHB1dCdcblx0XHR9KTtcblxuXHRcdGl0ZW1zLnB1c2goXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ21jcC5hY3Rpb25zLnNhbXBsaW5nJywgJ1NhbXBsaW5nJykgfSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3AuY29uZmlnQWNjZXNzJywgJ0NvbmZpZ3VyZSBNb2RlbCBBY2Nlc3MnKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3Auc2hvd091dHB1dC5kZXNjcmlwdGlvbicsICdTZXQgdGhlIG1vZGVscyB0aGUgc2VydmVyIGNhbiB1c2UgdmlhIE1DUCBzYW1wbGluZycpLFxuXHRcdFx0XHRhY3Rpb246ICdjb25maWdTYW1wbGluZydcblx0XHRcdH0sXG5cdFx0KTtcblxuXG5cdFx0aWYgKHNhbXBsaW5nU2VydmljZS5oYXNMb2dzKHNlcnZlcikpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zYW1wbGluZ0xvZycsICdTaG93IFNhbXBsaW5nIFJlcXVlc3RzJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nTG9nLmRlc2NyaXB0aW9uJywgJ1Nob3cgdGhlIHNhbXBsaW5nIHJlcXVlc3RzIGZvciB0aGlzIHNlcnZlcicpLFxuXHRcdFx0XHRhY3Rpb246ICdzYW1wbGluZ0xvZycsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBzZXJ2ZXIuY2FwYWJpbGl0aWVzLmdldCgpO1xuXHRcdGlmIChjYXBhYmlsaXRpZXMgPT09IHVuZGVmaW5lZCB8fCAoY2FwYWJpbGl0aWVzICYgTWNwQ2FwYWJpbGl0eS5SZXNvdXJjZXMpKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmFjdGlvbnMucmVzb3VyY2VzJywgJ1Jlc291cmNlcycpIH0pO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnJlc291cmNlcycsICdCcm93c2UgUmVzb3VyY2VzJyksXG5cdFx0XHRcdGFjdGlvbjogJ3Jlc291cmNlcycsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdtY3Auc2VsZWN0QWN0aW9uJywgJ1NlbGVjdCBhY3Rpb24gZm9yIFxcJ3swfVxcJycsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHR9KTtcblxuXHRcdGlmICghcGljaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAocGljay5hY3Rpb24pIHtcblx0XHRcdGNhc2UgJ2VuYWJsZSc6XG5cdFx0XHRcdG1jcFNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQoc2VydmVyLmRlZmluaXRpb24uaWQsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzdGFydCc6XG5cdFx0XHRcdGF3YWl0IHNlcnZlci5zdGFydCh7IHByb21wdFR5cGU6ICdhbGwtdW50cnVzdGVkJyB9KTtcblx0XHRcdFx0c2VydmVyLnNob3dPdXRwdXQoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzdG9wJzpcblx0XHRcdFx0YXdhaXQgc2VydmVyLnN0b3AoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdyZXN0YXJ0Jzpcblx0XHRcdFx0YXdhaXQgc2VydmVyLnN0b3AoKTtcblx0XHRcdFx0YXdhaXQgc2VydmVyLnN0YXJ0KHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2Rpc2Nvbm5lY3QnOlxuXHRcdFx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVBdXRoKGF1dGhlbnRpY2F0aW9uU2VydmljZSwgcGljay5hY2NvdW50UXVlcnksIHNlcnZlci5kZWZpbml0aW9uLCBmYWxzZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnc2lnbm91dCc6XG5cdFx0XHRcdGF3YWl0IHNlcnZlci5zdG9wKCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZUF1dGgoYXV0aGVudGljYXRpb25TZXJ2aWNlLCBwaWNrLmFjY291bnRRdWVyeSwgc2VydmVyLmRlZmluaXRpb24sIHRydWUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Nob3dPdXRwdXQnOlxuXHRcdFx0XHRzZXJ2ZXIuc2hvd091dHB1dCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2NvbmZpZyc6XG5cdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5pc1VyaShjb25maWdUYXJnZXQpID8gY29uZmlnVGFyZ2V0IDogY29uZmlnVGFyZ2V0IS51cmksXG5cdFx0XHRcdFx0b3B0aW9uczogeyBzZWxlY3Rpb246IFVSSS5pc1VyaShjb25maWdUYXJnZXQpID8gdW5kZWZpbmVkIDogY29uZmlnVGFyZ2V0IS5yYW5nZSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2NvbmZpZ1NhbXBsaW5nJzpcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1jcENvbW1hbmRJZHMuQ29uZmlndXJlU2FtcGxpbmdNb2RlbHMsIHNlcnZlcik7XG5cdFx0XHRjYXNlICdyZXNvdXJjZXMnOlxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5Ccm93c2VSZXNvdXJjZXMsIHNlcnZlcik7XG5cdFx0XHRjYXNlICdzYW1wbGluZ0xvZyc6XG5cdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb250ZW50czogc2FtcGxpbmdTZXJ2aWNlLmdldExvZ1RleHQoc2VydmVyKSxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zYW1wbGluZ0xvZy50aXRsZScsICdNQ1AgU2FtcGxpbmc6IHswfScsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YXNzZXJ0TmV2ZXIocGljayk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXV0aEFjdGlvbnMoXG5cdFx0YXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2U6IElBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZSxcblx0XHRzZXJ2ZXJJZDogc3RyaW5nXG5cdCk6IEF1dGhBY3Rpb25JdGVtW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogQXV0aEFjdGlvbkl0ZW1bXSA9IFtdO1xuXHRcdC8vIFJlYWxseSwgdGhpcyBzaG91bGQgb25seSBldmVyIGhhdmUgb25lIGVudHJ5LlxuXHRcdGZvciAoY29uc3QgW3Byb3ZpZGVySWQsIGFjY291bnROYW1lXSBvZiBhdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZS5tY3BTZXJ2ZXIoc2VydmVySWQpLmdldEFsbEFjY291bnRQcmVmZXJlbmNlcygpKSB7XG5cblx0XHRcdGNvbnN0IGFjY291bnRRdWVyeSA9IGF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlLnByb3ZpZGVyKHByb3ZpZGVySWQpLmFjY291bnQoYWNjb3VudE5hbWUpO1xuXHRcdFx0aWYgKCFhY2NvdW50UXVlcnkubWNwU2VydmVyKHNlcnZlcklkKS5pc0FjY2Vzc0FsbG93ZWQoKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gc2tpcCBhY2NvdW50cyB0aGF0IGFyZSBub3QgYWxsb3dlZFxuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgdGhlcmUgYXJlIG11bHRpcGxlIGFsbG93ZWQgc2VydmVycy9leHRlbnNpb25zLCBvdGhlciB0aGluZ3MgYXJlIHVzaW5nIHRoaXMgcHJvdmlkZXJcblx0XHRcdC8vIHNvIHdlIHNob3cgYSBkaXNjb25uZWN0IGFjdGlvbiwgb3RoZXJ3aXNlIHdlIHNob3cgYSBzaWduIG91dCBhY3Rpb24uXG5cdFx0XHRpZiAoYWNjb3VudFF1ZXJ5LmVudGl0aWVzKCkuZ2V0RW50aXR5Q291bnQoKS50b3RhbCA+IDEpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdGFjdGlvbjogJ2Rpc2Nvbm5lY3QnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmRpc2Nvbm5lY3QnLCAnRGlzY29ubmVjdCBBY2NvdW50JyksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGAoJHthY2NvdW50TmFtZX0pYCxcblx0XHRcdFx0XHRhY2NvdW50UXVlcnlcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0YWN0aW9uOiAnc2lnbm91dCcsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3Auc2lnbk91dCcsICdTaWduIE91dCcpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBgKCR7YWNjb3VudE5hbWV9KWAsXG5cdFx0XHRcdFx0YWNjb3VudFF1ZXJ5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQXV0aChcblx0XHRhdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0YWNjb3VudFF1ZXJ5OiBJQWNjb3VudFF1ZXJ5LFxuXHRcdGRlZmluaXRpb246IE1jcERlZmluaXRpb25SZWZlcmVuY2UsXG5cdFx0c2lnbk91dDogYm9vbGVhblxuXHQpIHtcblx0XHRjb25zdCB7IHByb3ZpZGVySWQsIGFjY291bnROYW1lIH0gPSBhY2NvdW50UXVlcnk7XG5cdFx0YWNjb3VudFF1ZXJ5Lm1jcFNlcnZlcihkZWZpbml0aW9uLmlkKS5zZXRBY2Nlc3NBbGxvd2VkKGZhbHNlLCBkZWZpbml0aW9uLmxhYmVsKTtcblx0XHRpZiAoc2lnbk91dCkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHMocHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCBhY2NvdW50ID0gYWNjb3VudHMuZmluZChhID0+IGEubGFiZWwgPT09IGFjY291bnROYW1lKTtcblx0XHRcdGlmIChhY2NvdW50KSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQsIHVuZGVmaW5lZCwgeyBhY2NvdW50IH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRhd2FpdCBhdXRoZW50aWNhdGlvblNlcnZpY2UucmVtb3ZlU2Vzc2lvbihwcm92aWRlcklkLCBzZXNzaW9uLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTUNQU2VydmVyQWN0aW9uUmVuZGVyaW5nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGhvdmVySXNPcGVuID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0XHRjb25zdCBjb25maWcgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUobWNwQXV0b1N0YXJ0Q29uZmlnLCBNY3BBdXRvU3RhcnRWYWx1ZS5OZXdBbmRPdXRkYXRlZCwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZW51bSBEaXNwbGF5ZWRTdGF0ZSB7XG5cdFx0XHROb25lLFxuXHRcdFx0TmV3VG9vbHMsXG5cdFx0XHRFcnJvcixcblx0XHRcdFJlZnJlc2hpbmcsXG5cdFx0fVxuXG5cdFx0dHlwZSBEaXNwbGF5ZWRTdGF0ZVQgPSB7XG5cdFx0XHRzdGF0ZTogRGlzcGxheWVkU3RhdGU7XG5cdFx0XHRzZXJ2ZXJzOiAoSU1jcFNlcnZlciB8IE1jcENvbGxlY3Rpb25EZWZpbml0aW9uKVtdO1xuXHRcdH07XG5cblx0XHRmdW5jdGlvbiBpc1NlcnZlcihzOiBJTWNwU2VydmVyIHwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24pOiBzIGlzIElNY3BTZXJ2ZXIge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiAocyBhcyBJTWNwU2VydmVyKS5zdGFydCA9PT0gJ2Z1bmN0aW9uJztcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwbGF5ZWRTdGF0ZUN1cnJlbnQgPSBkZXJpdmVkKChyZWFkZXIpOiBEaXNwbGF5ZWRTdGF0ZVQgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IG1jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzUGVyU3RhdGU6IChJTWNwU2VydmVyIHwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24pW11bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygc2VydmVycykge1xuXHRcdFx0XHRsZXQgdGhpc1N0YXRlID0gRGlzcGxheWVkU3RhdGUuTm9uZTtcblx0XHRcdFx0c3dpdGNoIChzZXJ2ZXIuY2FjaGVTdGF0ZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRjYXNlIE1jcFNlcnZlckNhY2hlU3RhdGUuVW5rbm93bjpcblx0XHRcdFx0XHRjYXNlIE1jcFNlcnZlckNhY2hlU3RhdGUuT3V0ZGF0ZWQ6XG5cdFx0XHRcdFx0XHR0aGlzU3RhdGUgPSBzZXJ2ZXIuY29ubmVjdGlvblN0YXRlLnJlYWQocmVhZGVyKS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IgPyBEaXNwbGF5ZWRTdGF0ZS5FcnJvciA6IERpc3BsYXllZFN0YXRlLk5ld1Rvb2xzO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBNY3BTZXJ2ZXJDYWNoZVN0YXRlLlJlZnJlc2hpbmdGcm9tVW5rbm93bjpcblx0XHRcdFx0XHRcdHRoaXNTdGF0ZSA9IERpc3BsYXllZFN0YXRlLlJlZnJlc2hpbmc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0dGhpc1N0YXRlID0gc2VydmVyLmNvbm5lY3Rpb25TdGF0ZS5yZWFkKHJlYWRlcikuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yID8gRGlzcGxheWVkU3RhdGUuRXJyb3IgOiBEaXNwbGF5ZWRTdGF0ZS5Ob25lO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZXJ2ZXJzUGVyU3RhdGVbdGhpc1N0YXRlXSA/Pz0gW107XG5cdFx0XHRcdHNlcnZlcnNQZXJTdGF0ZVt0aGlzU3RhdGVdLnB1c2goc2VydmVyKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdW5rbm93blNlcnZlclN0YXRlcyA9IG1jcFNlcnZpY2UubGF6eUNvbGxlY3Rpb25TdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodW5rbm93blNlcnZlclN0YXRlcy5zdGF0ZSA9PT0gTGF6eUNvbGxlY3Rpb25TdGF0ZS5Mb2FkaW5nVW5rbm93bikge1xuXHRcdFx0XHRzZXJ2ZXJzUGVyU3RhdGVbRGlzcGxheWVkU3RhdGUuUmVmcmVzaGluZ10gPz89IFtdO1xuXHRcdFx0XHRzZXJ2ZXJzUGVyU3RhdGVbRGlzcGxheWVkU3RhdGUuUmVmcmVzaGluZ10ucHVzaCguLi51bmtub3duU2VydmVyU3RhdGVzLmNvbGxlY3Rpb25zKTtcblx0XHRcdH0gZWxzZSBpZiAodW5rbm93blNlcnZlclN0YXRlcy5zdGF0ZSA9PT0gTGF6eUNvbGxlY3Rpb25TdGF0ZS5IYXNVbmtub3duKSB7XG5cdFx0XHRcdHNlcnZlcnNQZXJTdGF0ZVtEaXNwbGF5ZWRTdGF0ZS5OZXdUb29sc10gPz89IFtdO1xuXHRcdFx0XHRzZXJ2ZXJzUGVyU3RhdGVbRGlzcGxheWVkU3RhdGUuTmV3VG9vbHNdLnB1c2goLi4udW5rbm93blNlcnZlclN0YXRlcy5jb2xsZWN0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBtYXhTdGF0ZSA9IChzZXJ2ZXJzUGVyU3RhdGUubGVuZ3RoIC0gMSkgYXMgRGlzcGxheWVkU3RhdGU7XG5cdFx0XHRpZiAobWF4U3RhdGUgPT09IERpc3BsYXllZFN0YXRlLk5ld1Rvb2xzICYmIGNvbmZpZy5yZWFkKHJlYWRlcikgIT09IE1jcEF1dG9TdGFydFZhbHVlLk5ldmVyKSB7XG5cdFx0XHRcdG1heFN0YXRlID0gRGlzcGxheWVkU3RhdGUuTm9uZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgc3RhdGU6IG1heFN0YXRlLCBzZXJ2ZXJzOiBzZXJ2ZXJzUGVyU3RhdGVbbWF4U3RhdGVdIHx8IFtdIH07XG5cdFx0fSk7XG5cblx0XHQvLyBhdm9pZCBoaWRpbmcgdGhlIGhvdmVyIGlmIGEgc3RhdGUgY2hhbmdlcyB3aGlsZSBpdCdzIG9wZW46XG5cdFx0Y29uc3QgZGlzcGxheWVkU3RhdGUgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxEaXNwbGF5ZWRTdGF0ZVQ+KHRoaXMsIChyZWFkZXIsIGxhc3QpID0+IHtcblx0XHRcdGlmIChsYXN0ICYmIGhvdmVySXNPcGVuLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gbGFzdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBkaXNwbGF5ZWRTdGF0ZUN1cnJlbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9uSXRlbVN0YXRlID0gZGlzcGxheWVkU3RhdGUubWFwKHMgPT4gcy5zdGF0ZSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVJZC5DaGF0SW5wdXQsIE1jcENvbW1hbmRJZHMuTGlzdFNlcnZlciwgKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoY2xhc3MgZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB7XG5cblx0XHRcdFx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblxuXHRcdFx0XHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LW1jcCcpO1xuXHRcdFx0XHRcdGNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cblx0XHRcdFx0XHRjb25zdCBzdGF0ZUluZGljYXRvciA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuY2hhdC1tY3Atc3RhdGUtaW5kaWNhdG9yJykpO1xuXHRcdFx0XHRcdHN0YXRlSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcGxheWVkID0gZGlzcGxheWVkU3RhdGUucmVhZChyKTtcblx0XHRcdFx0XHRcdGNvbnN0IHsgc3RhdGUgfSA9IGRpc3BsYXllZDtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXG5cblx0XHRcdFx0XHRcdHN0YXRlSW5kaWNhdG9yLmFyaWFMYWJlbCA9IHRoaXMuZ2V0TGFiZWxGb3JTdGF0ZShkaXNwbGF5ZWQpO1xuXHRcdFx0XHRcdFx0c3RhdGVJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2NoYXQtbWNwLXN0YXRlLWluZGljYXRvcic7XG5cdFx0XHRcdFx0XHRpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLk5ld1Rvb2xzKSB7XG5cdFx0XHRcdFx0XHRcdHN0YXRlSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdFx0XHRcdFx0XHRzdGF0ZUluZGljYXRvci5jbGFzc0xpc3QuYWRkKCdjaGF0LW1jcC1zdGF0ZS1uZXcnLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnJlZnJlc2gpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLkVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHN0YXRlSW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdFx0XHRcdFx0XHRzdGF0ZUluZGljYXRvci5jbGFzc0xpc3QuYWRkKCdjaGF0LW1jcC1zdGF0ZS1lcnJvcicsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ud2FybmluZykpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuUmVmcmVzaGluZykge1xuXHRcdFx0XHRcdFx0XHRzdGF0ZUluZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdFx0XHRcdFx0c3RhdGVJbmRpY2F0b3IuY2xhc3NMaXN0LmFkZCgnY2hhdC1tY3Atc3RhdGUtcmVmcmVzaGluZycsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHNwaW5uaW5nTG9hZGluZykpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c3RhdGVJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBvbkNsaWNrKGU6IE1vdXNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdFx0XHRcdGNvbnN0IHsgc3RhdGUsIHNlcnZlcnMgfSA9IGRpc3BsYXllZFN0YXRlQ3VycmVudC5nZXQoKTtcblx0XHRcdFx0XHRpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLk5ld1Rvb2xzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnRlcmFjdGlvbiA9IG5ldyBNY3BTdGFydFNlcnZlckludGVyYWN0aW9uKCk7XG5cdFx0XHRcdFx0XHRzZXJ2ZXJzLmZpbHRlcihpc1NlcnZlcikuZm9yRWFjaChzZXJ2ZXIgPT4gc2VydmVyLnN0b3AoKS50aGVuKCgpID0+IHNlcnZlci5zdGFydCh7IGludGVyYWN0aW9uIH0pKSk7XG5cdFx0XHRcdFx0XHRtY3BTZXJ2aWNlLmFjdGl2YXRlQ29sbGVjdGlvbnMoKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBEaXNwbGF5ZWRTdGF0ZS5SZWZyZXNoaW5nKSB7XG5cdFx0XHRcdFx0XHRmaW5kTGFzdChzZXJ2ZXJzLCBpc1NlcnZlcik/LnNob3dPdXRwdXQoKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBEaXNwbGF5ZWRTdGF0ZS5FcnJvcikge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2VydmVyID0gZmluZExhc3Qoc2VydmVycywgaXNTZXJ2ZXIpO1xuXHRcdFx0XHRcdFx0aWYgKHNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBzZXJ2ZXIuc2hvd091dHB1dCh0cnVlKTtcblx0XHRcdFx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5TZXJ2ZXJPcHRpb25zLCBzZXJ2ZXIuZGVmaW5pdGlvbi5pZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1jcENvbW1hbmRJZHMuTGlzdFNlcnZlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRMYWJlbEZvclN0YXRlKCkgfHwgc3VwZXIuZ2V0VG9vbHRpcCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldEhvdmVyQ29udGVudHMoeyBzdGF0ZSwgc2VydmVycyB9ID0gZGlzcGxheWVkU3RhdGVDdXJyZW50LmdldCgpKTogc3RyaW5nIHwgdW5kZWZpbmVkIHwgSU1hbmFnZWRIb3ZlclRvb2x0aXBIVE1MRWxlbWVudCB7XG5cdFx0XHRcdFx0Y29uc3QgbGluayA9IChzOiBJTWNwU2VydmVyKSA9PiBjcmVhdGVNYXJrZG93bkNvbW1hbmRMaW5rKHtcblx0XHRcdFx0XHRcdHRleHQ6IHMuZGVmaW5pdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IFtzLmRlZmluaXRpb24uaWRdLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21jcC5zZXJ2ZXIub3B0aW9ucy50b29sdGlwJywgJ1Nob3cgc2VydmVyIG9wdGlvbnMgZm9yIHswfScsIHMuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRjb25zdCBzaW5nbGUgPSBzZXJ2ZXJzLmxlbmd0aCA9PT0gMTtcblx0XHRcdFx0XHRjb25zdCBuYW1lcyA9IHNlcnZlcnMubWFwKHMgPT4gaXNTZXJ2ZXIocykgPyBsaW5rKHMpIDogJ2AnICsgcy5sYWJlbCArICdgJykubWFwKGwgPT4gc2luZ2xlID8gbCA6IGAtICR7bH1gKS5qb2luKCdcXG4nKTtcblx0XHRcdFx0XHRsZXQgbWFya2Rvd246IE1hcmtkb3duU3RyaW5nO1xuXHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gRGlzcGxheWVkU3RhdGUuTmV3VG9vbHMpIHtcblx0XHRcdFx0XHRcdG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKHNpbmdsZVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtY3AubmV3VG9vbHMubWQuc2luZ2xlJywgXCJNQ1Agc2VydmVyIHswfSBoYXMgYmVlbiB1cGRhdGVkIGFuZCBtYXkgaGF2ZSBuZXcgdG9vbHMgYXZhaWxhYmxlLlwiLCBuYW1lcylcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbWNwLm5ld1Rvb2xzLm1kLm11bHRpJywgXCJNQ1Agc2VydmVycyBoYXZlIGJlZW4gdXBkYXRlZCBhbmQgbWF5IGhhdmUgbmV3IHRvb2xzIGF2YWlsYWJsZTpcXG5cXG57MH1cIiwgbmFtZXMpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLkVycm9yKSB7XG5cdFx0XHRcdFx0XHRtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZyhzaW5nbGVcblx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbWNwLmVyci5tZC5zaW5nbGUnLCBcIk1DUCBzZXJ2ZXIgezB9IHdhcyB1bmFibGUgdG8gc3RhcnQgc3VjY2Vzc2Z1bGx5LlwiLCBuYW1lcylcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbWNwLmVyci5tZC5tdWx0aScsIFwiTXVsdGlwbGUgTUNQIHNlcnZlcnMgd2VyZSB1bmFibGUgdG8gc3RhcnQgc3VjY2Vzc2Z1bGx5OlxcblxcbnswfVwiLCBuYW1lcylcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdldExhYmVsRm9yU3RhdGUoKSB8fCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6ICh0b2tlbik6IEhUTUxFbGVtZW50ID0+IHtcblx0XHRcdFx0XHRcdFx0aG92ZXJJc09wZW4uc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gaG92ZXJJc09wZW4uc2V0KGZhbHNlLCB1bmRlZmluZWQpKSk7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyL0BiZW5pYmVuajogd29ya2Fyb3VuZCBmb3IgIzI1NzkyM1xuXHRcdFx0XHRcdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKG1haW5XaW5kb3csICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIWNvbnRhaW5lci5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSwgMjAwMCkpO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJ2Rpdi5tY3AtaG92ZXItY29udGVudHMnKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBSZW5kZXIgbWFya2Rvd24gY29udGVudFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bi5pc1RydXN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtYXJrZG93blJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93bikpO1xuXHRcdFx0XHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQobWFya2Rvd25SZXN1bHQuZWxlbWVudCk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gQWRkIGRpdmlkZXJcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGl2aWRlciA9ICQoJ2hyLm1jcC1ob3Zlci1kaXZpZGVyJyk7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChkaXZpZGVyKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBBZGQgY2hlY2tib3ggZm9yIG1jcEF1dG9TdGFydENvbmZpZyBzZXR0aW5nXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNoZWNrYm94Q29udGFpbmVyID0gJCgnZGl2Lm1jcC1ob3Zlci1zZXR0aW5nJyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNldHRpbmdMYWJlbFN0ciA9IGxvY2FsaXplKCdtY3AuYXV0b1N0YXJ0JywgXCJBdXRvbWF0aWNhbGx5IHN0YXJ0IE1DUCBzZXJ2ZXJzIHdoZW4gc2VuZGluZyBhIGNoYXQgbWVzc2FnZVwiKTtcblxuXHRcdFx0XHRcdFx0XHRjb25zdCBjaGVja2JveCA9IHN0b3JlLmFkZChuZXcgQ2hlY2tib3goXG5cdFx0XHRcdFx0XHRcdFx0c2V0dGluZ0xhYmVsU3RyLFxuXHRcdFx0XHRcdFx0XHRcdGNvbmZpZy5nZXQoKSAhPT0gTWNwQXV0b1N0YXJ0VmFsdWUuTmV2ZXIsXG5cdFx0XHRcdFx0XHRcdFx0eyAuLi5kZWZhdWx0Q2hlY2tib3hTdHlsZXMgfVxuXHRcdFx0XHRcdFx0XHQpKTtcblxuXHRcdFx0XHRcdFx0XHRjaGVja2JveENvbnRhaW5lci5hcHBlbmRDaGlsZChjaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBBZGQgbGFiZWwgbmV4dCB0byBjaGVja2JveFxuXHRcdFx0XHRcdFx0XHRjb25zdCBzZXR0aW5nTGFiZWwgPSAkKCdzcGFuLm1jcC1ob3Zlci1zZXR0aW5nLWxhYmVsJywgdW5kZWZpbmVkLCBzZXR0aW5nTGFiZWxTdHIpO1xuXHRcdFx0XHRcdFx0XHRjaGVja2JveENvbnRhaW5lci5hcHBlbmRDaGlsZChzZXR0aW5nTGFiZWwpO1xuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9uQ2hhbmdlID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5ld1ZhbHVlID0gY2hlY2tib3guY2hlY2tlZCA/IE1jcEF1dG9TdGFydFZhbHVlLk5ld0FuZE91dGRhdGVkIDogTWNwQXV0b1N0YXJ0VmFsdWUuTmV2ZXI7XG5cdFx0XHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUobWNwQXV0b1N0YXJ0Q29uZmlnLCBuZXdWYWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdFx0c3RvcmUuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKG9uQ2hhbmdlKSk7XG5cblx0XHRcdFx0XHRcdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihzZXR0aW5nTGFiZWwsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNoZWNrYm94LmNoZWNrZWQgPSAhY2hlY2tib3guY2hlY2tlZDtcblx0XHRcdFx0XHRcdFx0XHRvbkNoYW5nZSgpO1xuXHRcdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjaGVja2JveENvbnRhaW5lcik7XG5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByaXZhdGUgZ2V0TGFiZWxGb3JTdGF0ZSh7IHN0YXRlLCBzZXJ2ZXJzIH0gPSBkaXNwbGF5ZWRTdGF0ZUN1cnJlbnQuZ2V0KCkpIHtcblx0XHRcdFx0XHRpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLk5ld1Rvb2xzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21jcC5uZXdUb29scycsIFwiTmV3IHRvb2xzIGF2YWlsYWJsZSAoezB9KVwiLCBzZXJ2ZXJzLmxlbmd0aCB8fCAxKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBEaXNwbGF5ZWRTdGF0ZS5FcnJvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtY3AudG9vbEVycm9yJywgXCJFcnJvciBsb2FkaW5nIHswfSB0b29sKHMpXCIsIHNlcnZlcnMubGVuZ3RoIHx8IDEpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IERpc3BsYXllZFN0YXRlLlJlZnJlc2hpbmcpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWNwLnRvb2xSZWZyZXNoJywgXCJEaXNjb3ZlcmluZyB0b29scy4uLlwiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LCBhY3Rpb24sIHsgLi4ub3B0aW9ucywga2V5YmluZGluZ05vdFJlbmRlcmVkV2l0aExhYmVsOiB0cnVlIH0pO1xuXG5cdFx0fSwgRXZlbnQuZnJvbU9ic2VydmFibGVMaWdodChhY3Rpb25JdGVtU3RhdGUpKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc2V0TWNwVHJ1c3RDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlJlc2V0VHJ1c3QsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AucmVzZXRUcnVzdCcsIFwiUmVzZXQgVHJ1c3RcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoTWNwQ29udGV4dEtleXMudG9vbHNDb3VudC5ncmVhdGVyKDApLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBtY3BTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNY3BTZXJ2aWNlKTtcblx0XHRtY3BTZXJ2aWNlLnJlc2V0VHJ1c3QoKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBSZXNldE1jcENhY2hlZFRvb2xzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlJlc2V0Q2FjaGVkVG9vbHMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AucmVzZXRDYWNoZWRUb29scycsIFwiUmVzZXQgQ2FjaGVkIFRvb2xzXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKE1jcENvbnRleHRLZXlzLnRvb2xzQ291bnQuZ3JlYXRlcigwKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgbWNwU2VydmljZSA9IGFjY2Vzc29yLmdldChJTWNwU2VydmljZSk7XG5cdFx0bWNwU2VydmljZS5yZXNldENhY2hlcygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZGRDb25maWd1cmF0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkFkZENvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuYWRkQ29uZmlndXJhdGlvbicsIFwiQWRkIFNlcnZlci4uLlwiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ21jcC5hZGRDb25maWd1cmF0aW9uLmRlc2NyaXB0aW9uJywgXCJJbnN0YWxscyBhIG5ldyBNb2RlbCBDb250ZXh0IHByb3RvY29sIHRvIHRoZSBtY3AuanNvbiBzZXR0aW5nc1wiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvckNvbnRlbnQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5yZWdleChSZXNvdXJjZUNvbnRleHRLZXkuUGF0aC5rZXksIC9cXC52c2NvZGVbL1xcXFxdbWNwXFwuanNvbiQvKSxcblx0XHRcdFx0XHRBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhURVhUX0ZJTEVfRURJVE9SX0lEKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbmZpZ1VyaT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGNvbmZpZ1VyaSA/IHdvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKFVSSS5wYXJzZShjb25maWdVcmkpKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwQWRkQ29uZmlndXJhdGlvbkNvbW1hbmQsIHRhcmdldCA/PyB1bmRlZmluZWQpLnJ1bigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsRnJvbU1hbmlmZXN0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkluc3RhbGxGcm9tTWFuaWZlc3QsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuaW5zdGFsbEZyb21NYW5pZmVzdCcsIFwiSW5zdGFsbCBTZXJ2ZXIgZnJvbSBNYW5pZmVzdC4uLlwiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZTIoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LmRlc2NyaXB0aW9uJywgXCJJbnN0YWxsIGFuIE1DUCBzZXJ2ZXIgZnJvbSBhIEpTT04gbWFuaWZlc3QgZmlsZVwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwSW5zdGFsbEZyb21NYW5pZmVzdENvbW1hbmQpLnJ1bigpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFJlbW92ZVN0b3JlZElucHV0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlJlbW92ZVN0b3JlZElucHV0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLnJlc2V0Q2FjaGVkVG9vbHMnLCBcIlJlc2V0IENhY2hlZCBUb29sc1wiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzY29wZTogU3RvcmFnZVNjb3BlLCBpZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJTWNwUmVnaXN0cnkpLmNsZWFyU2F2ZWRJbnB1dHMoc2NvcGUsIGlkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRWRpdFN0b3JlZElucHV0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLkVkaXRTdG9yZWRJbnB1dCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5lZGl0U3RvcmVkSW5wdXQnLCBcIkVkaXQgU3RvcmVkIElucHV0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGlucHV0SWQ6IHN0cmluZywgdXJpOiBVUkkgfCB1bmRlZmluZWQsIGNvbmZpZ1NlY3Rpb246IHN0cmluZywgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdXJpICYmIGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpLmdldFdvcmtzcGFjZUZvbGRlcih1cmkpO1xuXHRcdGFjY2Vzc29yLmdldChJTWNwUmVnaXN0cnkpLmVkaXRTYXZlZElucHV0KGlucHV0SWQsIHdvcmtzcGFjZUZvbGRlciB8fCB1bmRlZmluZWQsIGNvbmZpZ1NlY3Rpb24sIHRhcmdldCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldE9BdXRoQ2xpZW50U2VjcmV0IGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlNldE9BdXRoQ2xpZW50U2VjcmV0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLnNldE9BdXRoQ2xpZW50U2VjcmV0JywgXCJTZXQgT0F1dGggQ2xpZW50IFNlY3JldFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjbGllbnRJZDogc3RyaW5nLCBtY3BTZXJ2ZXJVcmw6IHN0cmluZywgc2VydmVyTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBzZWNyZXRTdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2VjcmV0U3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qga2V5ID0gbWNwT0F1dGhDbGllbnRTZWNyZXRTdG9yYWdlS2V5KG1jcFNlcnZlclVybCwgY2xpZW50SWQpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYXdhaXQgc2VjcmV0U3RvcmFnZVNlcnZpY2UuZ2V0KGtleSk7XG5cblx0XHRjb25zdCBkZWxldGVCdXR0b24gPSB7XG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRyYXNoKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQuZGVsZXRlJywgXCJEZWxldGUgc3RvcmVkIGNsaWVudCBzZWNyZXRcIiksXG5cdFx0fTtcblx0XHRjb25zdCByZXZlYWxCdXR0b24gPSB7XG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmV5ZSksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbWNwLnNldE9BdXRoQ2xpZW50U2VjcmV0LnJldmVhbCcsIFwiU2hvdyBjbGllbnQgc2VjcmV0XCIpLFxuXHRcdH07XG5cdFx0Y29uc3QgaGlkZUJ1dHRvbiA9IHtcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXllQ2xvc2VkKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQuaGlkZScsIFwiSGlkZSBjbGllbnQgc2VjcmV0XCIpLFxuXHRcdH07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTx7IGtpbmQ6ICdhY2NlcHQnOyB2YWx1ZTogc3RyaW5nIH0gfCB7IGtpbmQ6ICdkZWxldGUnIH0gfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBxdWlja0lucHV0U2VydmljZS5jcmVhdGVJbnB1dEJveCgpO1xuXHRcdFx0aW5wdXQudGl0bGUgPSBleGlzdGluZ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQudGl0bGUucmVwbGFjZScsIFwiUmVwbGFjZSBDbGllbnQgU2VjcmV0IGZvciB7MH1cIiwgc2VydmVyTmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbWNwLnNldE9BdXRoQ2xpZW50U2VjcmV0LnRpdGxlLnNldCcsIFwiU2V0IENsaWVudCBTZWNyZXQgZm9yIHswfVwiLCBzZXJ2ZXJOYW1lKTtcblx0XHRcdGlucHV0LnByb21wdCA9IGxvY2FsaXplKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQucHJvbXB0JywgXCJFbnRlciB0aGUgY2xpZW50IHNlY3JldCBmb3IgT0F1dGggY2xpZW50ICd7MH0nLlwiLCBjbGllbnRJZCk7XG5cdFx0XHRpbnB1dC5wbGFjZWhvbGRlciA9IGV4aXN0aW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21jcC5zZXRPQXV0aENsaWVudFNlY3JldC5wbGFjZWhvbGRlci5yZXBsYWNlJywgXCJFbnRlciBhIG5ldyBjbGllbnQgc2VjcmV0IHRvIHJlcGxhY2UgdGhlIHN0b3JlZCB2YWx1ZVwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdtY3Auc2V0T0F1dGhDbGllbnRTZWNyZXQucGxhY2Vob2xkZXIuc2V0JywgXCJFbnRlciBjbGllbnQgc2VjcmV0XCIpO1xuXHRcdFx0aW5wdXQucGFzc3dvcmQgPSB0cnVlO1xuXHRcdFx0aW5wdXQuaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdGlucHV0LnZhbHVlID0gZXhpc3Rpbmc7XG5cdFx0XHRcdGlucHV0LnZhbHVlU2VsZWN0aW9uID0gWzAsIGV4aXN0aW5nLmxlbmd0aF07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVCdXR0b25zID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0b2dnbGVCdXR0b24gPSBpbnB1dC5wYXNzd29yZCA/IHJldmVhbEJ1dHRvbiA6IGhpZGVCdXR0b247XG5cdFx0XHRcdGlucHV0LmJ1dHRvbnMgPSBleGlzdGluZyA/IFt0b2dnbGVCdXR0b24sIGRlbGV0ZUJ1dHRvbl0gOiBbdG9nZ2xlQnV0dG9uXTtcblx0XHRcdH07XG5cdFx0XHR1cGRhdGVCdXR0b25zKCk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gaW5wdXQudmFsdWU7XG5cdFx0XHRcdGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBFbXB0eSB2YWx1ZTogdHJlYXQgYXMgYSBkZWxldGUgKHNhbWUgYXMgdGhlIHRyYXNoIGJ1dHRvbilcblx0XHRcdFx0XHRyZXNvbHZlKHsga2luZDogJ2RlbGV0ZScgfSk7XG5cdFx0XHRcdFx0aW5wdXQuaGlkZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKHsga2luZDogJ2FjY2VwdCcsIHZhbHVlIH0pO1xuXHRcdFx0XHRpbnB1dC5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRUcmlnZ2VyQnV0dG9uKGJ0biA9PiB7XG5cdFx0XHRcdGlmIChidG4gPT09IGRlbGV0ZUJ1dHRvbikge1xuXHRcdFx0XHRcdHJlc29sdmUoeyBraW5kOiAnZGVsZXRlJyB9KTtcblx0XHRcdFx0XHRpbnB1dC5oaWRlKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYnRuID09PSByZXZlYWxCdXR0b24gfHwgYnRuID09PSBoaWRlQnV0dG9uKSB7XG5cdFx0XHRcdFx0aW5wdXQucGFzc3dvcmQgPSAhaW5wdXQucGFzc3dvcmQ7XG5cdFx0XHRcdFx0dXBkYXRlQnV0dG9ucygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXQub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdGlucHV0LmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdGlucHV0LnNob3coKTtcblx0XHR9KTtcblxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm47IC8vIGNhbmNlbGxlZFxuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ2RlbGV0ZScpIHtcblx0XHRcdGF3YWl0IHNlY3JldFN0b3JhZ2VTZXJ2aWNlLmRlbGV0ZShrZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBzZWNyZXRTdG9yYWdlU2VydmljZS5zZXQoa2V5LCByZXN1bHQudmFsdWUpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd0NvbmZpZ3VyYXRpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2hvd0NvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5zaG93Q29uZmlndXJhdGlvbicsIFwiU2hvdyBDb25maWd1cmF0aW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbGxlY3Rpb25JZDogc3RyaW5nLCBzZXJ2ZXJJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IGFjY2Vzc29yLmdldChJTWNwUmVnaXN0cnkpLmNvbGxlY3Rpb25zLmdldCgpLmZpbmQoYyA9PiBjLmlkID09PSBjb2xsZWN0aW9uSWQpO1xuXHRcdGlmICghY29sbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZlciA9IGNvbGxlY3Rpb24/LnNlcnZlckRlZmluaXRpb25zLmdldCgpLmZpbmQocyA9PiBzLmlkID09PSBzZXJ2ZXJJZCk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKHNlcnZlcj8ucHJlc2VudGF0aW9uPy5vcmlnaW4pIHtcblx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBzZXJ2ZXIucHJlc2VudGF0aW9uLm9yaWdpbi51cmksXG5cdFx0XHRcdG9wdGlvbnM6IHsgc2VsZWN0aW9uOiBzZXJ2ZXIucHJlc2VudGF0aW9uLm9yaWdpbi5yYW5nZSB9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGNvbGxlY3Rpb24ucHJlc2VudGF0aW9uPy5vcmlnaW4pIHtcblx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBjb2xsZWN0aW9uLnByZXNlbnRhdGlvbi5vcmlnaW4sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dPdXRwdXQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2hvd091dHB1dCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLnNob3dPdXRwdXQnLCBcIlNob3cgT3V0cHV0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlcnZlcklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSU1jcFNlcnZpY2UpLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gc2VydmVySWQpPy5zaG93T3V0cHV0KCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnIHtcblx0cmVhZG9ubHkgYWdlbnRIb3N0U2Vzc2lvbjogVVJJO1xuXHRyZWFkb25seSBzZXJ2ZXJJZDogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBpc0FnZW50SG9zdE1jcFNlcnZlckNvbW1hbmRBcmcoYXJnOiBzdHJpbmcgfCBJQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZyk6IGFyZyBpcyBJQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZyB7XG5cdHJldHVybiB0eXBlb2YgYXJnICE9PSAnc3RyaW5nJyAmJiBVUkkuaXNVcmkoYXJnLmFnZW50SG9zdFNlc3Npb24pICYmIHR5cGVvZiBhcmcuc2VydmVySWQgPT09ICdzdHJpbmcnO1xufVxuXG5mdW5jdGlvbiBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZzogSUFnZW50SG9zdE1jcFNlcnZlckNvbW1hbmRBcmcpOiBJQWdlbnRIb3N0TWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGFjY2Vzc29yLmdldChJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UpLmdldE1jcFNlcnZlcnMoYXJnLmFnZW50SG9zdFNlc3Npb24pLmZpbmQoc2VydmVyID0+IHNlcnZlci5pZCA9PT0gYXJnLnNlcnZlcklkKTtcbn1cblxuZXhwb3J0IGNsYXNzIFJlc3RhcnRTZXJ2ZXIgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuUmVzdGFydFNlcnZlcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLnJlc3RhcnRTZXJ2ZXInLCBcIlJlc3RhcnQgU2VydmVyXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlcnZlcklkOiBzdHJpbmcgfCBJQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZywgb3B0cz86IElNY3BTZXJ2ZXJTdGFydE9wdHMpIHtcblx0XHRpZiAoaXNBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnKHNlcnZlcklkKSkge1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gZ2V0QWdlbnRIb3N0TWNwU2VydmVyKGFjY2Vzc29yLCBzZXJ2ZXJJZCk7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpLndhcm4oYFJlc3RhcnRpbmcgTUNQIHNlcnZlciAnJHtzZXJ2ZXI/Lm5hbWUgPz8gc2VydmVySWQuc2VydmVySWR9JyBpcyBub3Qgc3VwcG9ydGVkIGZvciBhZ2VudC1ob3N0IHNlcnZlcnNgKTtcblx0XHRcdGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSkud2Fybihsb2NhbGl6ZSgnbWNwLmFnZW50SG9zdC5yZXN0YXJ0VW5zdXBwb3J0ZWQnLCBcIlJlc3RhcnRpbmcgTUNQIHNlcnZlciAnezB9JyBpcyBub3Qgc3VwcG9ydGVkIGZvciBhZ2VudC1ob3N0IHNlcnZlcnMuIFN0b3AgYW5kIHN0YXJ0IHRoZSBzZXJ2ZXIgaW5zdGVhZC5cIiwgc2VydmVyPy5uYW1lID8/IHNlcnZlcklkLnNlcnZlcklkKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcyA9IGFjY2Vzc29yLmdldChJTWNwU2VydmljZSkuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSBzZXJ2ZXJJZCk7XG5cdFx0cz8uc2hvd091dHB1dCgpO1xuXHRcdGF3YWl0IHM/LnN0b3AoKTtcblx0XHRhd2FpdCBzPy5zdGFydCh7IHByb21wdFR5cGU6ICdhbGwtdW50cnVzdGVkJywgLi4ub3B0cyB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhcnRTZXJ2ZXIgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RhcnRTZXJ2ZXIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5zdGFydFNlcnZlcicsIFwiU3RhcnQgU2VydmVyXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlcnZlcklkOiBzdHJpbmcgfCBJQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZywgb3B0cz86IElNY3BTZXJ2ZXJTdGFydE9wdHMgJiB7IHdhaXRGb3JMaXZlVG9vbHM/OiBib29sZWFuIH0pIHtcblx0XHRpZiAoaXNBZ2VudEhvc3RNY3BTZXJ2ZXJDb21tYW5kQXJnKHNlcnZlcklkKSkge1xuXHRcdFx0YXdhaXQgZ2V0QWdlbnRIb3N0TWNwU2VydmVyKGFjY2Vzc29yLCBzZXJ2ZXJJZCk/LnN0YXJ0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHNlcnZlcnMgPSBhY2Nlc3Nvci5nZXQoSU1jcFNlcnZpY2UpLnNlcnZlcnMuZ2V0KCk7XG5cdFx0aWYgKHNlcnZlcklkICE9PSAnKicpIHtcblx0XHRcdHNlcnZlcnMgPSBzZXJ2ZXJzLmZpbHRlcihzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gc2VydmVySWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0T3B0czogSU1jcFNlcnZlclN0YXJ0T3B0cyA9IHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnLCAuLi5vcHRzIH07XG5cdFx0aWYgKG9wdHM/LndhaXRGb3JMaXZlVG9vbHMpIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHNlcnZlcnMubWFwKHMgPT4gc3RhcnRTZXJ2ZXJBbmRXYWl0Rm9yTGl2ZVRvb2xzKHMsIHN0YXJ0T3B0cykpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2VydmVycy5tYXAocyA9PiBzLnN0YXJ0KHN0YXJ0T3B0cykpKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0b3BTZXJ2ZXIgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU3RvcFNlcnZlcixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLnN0b3BTZXJ2ZXInLCBcIlN0b3AgU2VydmVyXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlcnZlcklkOiBzdHJpbmcgfCBJQWdlbnRIb3N0TWNwU2VydmVyQ29tbWFuZEFyZykge1xuXHRcdGlmIChpc0FnZW50SG9zdE1jcFNlcnZlckNvbW1hbmRBcmcoc2VydmVySWQpKSB7XG5cdFx0XHRhd2FpdCBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXIoYWNjZXNzb3IsIHNlcnZlcklkKT8uc3RvcCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHMgPSBhY2Nlc3Nvci5nZXQoSU1jcFNlcnZpY2UpLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gc2VydmVySWQpO1xuXHRcdGF3YWl0IHM/LnN0b3AoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwQnJvd3NlQ29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5Ccm93c2UsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5icm93c2UnLCBcIk1DUCBTZXJ2ZXJzXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5icm93c2UudG9vbHRpcCcsIFwiQnJvd3NlIE1DUCBTZXJ2ZXJzXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNlYXJjaCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBleHRlbnNpb25zRmlsdGVyU3ViTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX3ByZWRlZmluZWQnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBJbnN0YWxsZWRNY3BTZXJ2ZXJzVmlld0lkKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlKS5vcGVuU2VhcmNoKCdAbWNwICcpO1xuXHR9XG59XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBNY3BDb21tYW5kSWRzLkJyb3dzZSxcblx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5icm93c2UubWNwJywgXCJCcm93c2UgTUNQIFNlcnZlcnNcIiksXG5cdFx0Y2F0ZWdvcnksXG5cdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHR9LFxufSk7XG5cbmV4cG9ydCBjbGFzcyBTaG93SW5zdGFsbGVkTWNwU2VydmVyc0NvbW1hbmQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuU2hvd0luc3RhbGxlZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb21tYW5kLnNob3cuaW5zdGFsbGVkJywgXCJTaG93IEluc3RhbGxlZCBTZXJ2ZXJzXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChIYXNJbnN0YWxsZWRNY3BTZXJ2ZXJzQ29udGV4dCwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgdmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhJbnN0YWxsZWRNY3BTZXJ2ZXJzVmlld0lkLCB0cnVlKTtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihWSUVXTEVUX0lEKTtcblx0XHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhJbnN0YWxsZWRNY3BTZXJ2ZXJzVmlld0lkLCB0cnVlKTtcblx0XHR9XG5cdH1cbn1cblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKENIQVRfQ09ORklHX01FTlVfSUQsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBNY3BDb21tYW5kSWRzLlNob3dJbnN0YWxsZWQsXG5cdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLnNlcnZlcnMnLCBcIk1DUCBTZXJ2ZXJzXCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ2hhdFZpZXdJZCkpLFxuXHRvcmRlcjogMTAsXG5cdGdyb3VwOiAnMl9sZXZlbCdcbn0pO1xuXG5hYnN0cmFjdCBjbGFzcyBPcGVuTWNwUmVzb3VyY2VDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRVUkkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPFVSST47XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGF3YWl0IHRoaXMuZ2V0VVJJKGFjY2Vzc29yKTtcblx0XHRpZiAoIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMocmVzb3VyY2UpKSkge1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7IHNlcnZlcnM6IHt9IH0sIG51bGwsICdcXHQnKSkpO1xuXHRcdH1cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlblVzZXJNY3BSZXNvdXJjZUNvbW1hbmQgZXh0ZW5kcyBPcGVuTWNwUmVzb3VyY2VDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuT3BlblVzZXJNY3AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5vcGVuVXNlck1jcCcsIFwiT3BlbiBVc2VyIENvbmZpZ3VyYXRpb25cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFVSSShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlblJlbW90ZVVzZXJNY3BSZXNvdXJjZUNvbW1hbmQgZXh0ZW5kcyBPcGVuTWNwUmVzb3VyY2VDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1jcENvbW1hbmRJZHMuT3BlblJlbW90ZVVzZXJNY3AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5vcGVuUmVtb3RlVXNlck1jcCcsIFwiT3BlbiBSZW1vdGUgVXNlciBDb25maWd1cmF0aW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHRSZW1vdGVOYW1lQ29udGV4dC5ub3RFcXVhbHNUbygnJylcblx0XHRcdClcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBnZXRVUkkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlbW90ZVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKTtcblx0XHRjb25zdCByZW1vdGVQcm9maWxlID0gYXdhaXQgcmVtb3RlVXNlckRhdGFQcm9maWxlU2VydmljZS5nZXRSZW1vdGVQcm9maWxlKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUpO1xuXHRcdHJldHVybiByZW1vdGVQcm9maWxlLm1jcFJlc291cmNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuV29ya3NwYWNlRm9sZGVyTWNwUmVzb3VyY2VDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLk9wZW5Xb3Jrc3BhY2VGb2xkZXJNY3AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5vcGVuV29ya3NwYWNlRm9sZGVyTWNwJywgXCJPcGVuIFdvcmtzcGFjZSBGb2xkZXIgTUNQIENvbmZpZ3VyYXRpb25cIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRcdFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dC5ub3RFcXVhbHNUbygwKVxuXHRcdFx0KVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID09PSAxID8gd29ya3NwYWNlRm9sZGVyc1swXSA6IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPElXb3Jrc3BhY2VGb2xkZXI+KFBJQ0tfV09SS1NQQUNFX0ZPTERFUl9DT01NQU5EX0lEKTtcblx0XHRpZiAod29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogd29ya3NwYWNlRm9sZGVyLnRvUmVzb3VyY2UoV09SS1NQQUNFX1NUQU5EQUxPTkVfQ09ORklHVVJBVElPTlNbTUNQX0NPTkZJR1VSQVRJT05fS0VZXSkgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuV29ya3NwYWNlTWNwUmVzb3VyY2VDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLk9wZW5Xb3Jrc3BhY2VNY3AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuY29tbWFuZC5vcGVuV29ya3NwYWNlTWNwJywgXCJPcGVuIFdvcmtzcGFjZSBNQ1AgQ29uZmlndXJhdGlvblwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpKSxcblx0XHRcdFx0V29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJylcblx0XHRcdClcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb247XG5cdFx0aWYgKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB3b3Jrc3BhY2VDb25maWd1cmF0aW9uIH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwQnJvd3NlUmVzb3VyY2VzQ29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5Ccm93c2VSZXNvdXJjZXMsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtY3AuYnJvd3NlUmVzb3VyY2VzJywgXCJCcm93c2UgUmVzb3VyY2VzLi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChNY3BDb250ZXh0S2V5cy5zZXJ2ZXJDb3VudC5ncmVhdGVyKDApLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VydmVyPzogSU1jcFNlcnZlcik6IHZvaWQge1xuXHRcdGlmIChzZXJ2ZXIpIHtcblx0XHRcdGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKE1jcFJlc291cmNlUXVpY2tQaWNrLCBzZXJ2ZXIpLnBpY2soKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSkucXVpY2tBY2Nlc3Muc2hvdyhNY3BSZXNvdXJjZVF1aWNrQWNjZXNzLlBSRUZJWCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BDb25maWd1cmVTYW1wbGluZ01vZGVscyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5Db25maWd1cmVTYW1wbGluZ01vZGVscyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5jb25maWd1cmVTYW1wbGluZ01vZGVscycsIFwiQ29uZmlndXJlIFNhbXBsaW5nTW9kZWxcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VydmVyOiBJTWNwU2VydmVyKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxtU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBtY3BTYW1wbGluZyA9IGFjY2Vzc29yLmdldChJTWNwU2FtcGxpbmdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nSWRzID0gbmV3IFNldChtY3BTYW1wbGluZy5nZXRDb25maWcoc2VydmVyKS5hbGxvd2VkTW9kZWxzKTtcblx0XHRjb25zdCBhbGxJdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IGxtU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCkubWFwKGlkID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbG1TZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWQpITtcblx0XHRcdGlmICghbW9kZWwuaXNVc2VyU2VsZWN0YWJsZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IG1vZGVsLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBtb2RlbC50b29sdGlwLFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0cGlja2VkOiBleGlzdGluZ0lkcy5zaXplID8gZXhpc3RpbmdJZHMuaGFzKGlkKSA6IG1vZGVsLmlzRGVmYXVsdEZvckxvY2F0aW9uW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0fTtcblx0XHR9KS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdGFsbEl0ZW1zLnNvcnQoKGEsIGIpID0+IChiLnBpY2tlZCA/IDEgOiAwKSAtIChhLnBpY2tlZCA/IDEgOiAwKSB8fCBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG5cdFx0Ly8gZG8gdGhlIHF1aWNrcGljayBzZWxlY3Rpb25cblx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGFsbEl0ZW1zLCB7XG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ21jcC5jb25maWd1cmVTYW1wbGluZ01vZGVscy5waCcsICdQaWNrIHRoZSBtb2RlbHMgezB9IGNhbiBhY2Nlc3MgdmlhIE1DUCBzYW1wbGluZycsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsKSxcblx0XHRcdGNhblBpY2tNYW55OiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHBpY2tlZCkge1xuXHRcdFx0YXdhaXQgbWNwU2FtcGxpbmcudXBkYXRlQ29uZmlnKHNlcnZlciwgYyA9PiBjLmFsbG93ZWRNb2RlbHMgPSBwaWNrZWQubWFwKHAgPT4gcC5pZCEpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGlja2VkPy5sZW5ndGggfHwgMDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwU3RhcnRQcm9tcHRpbmdTZXJ2ZXJDb21tYW5kIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNY3BDb21tYW5kSWRzLlN0YXJ0UHJvbXB0Rm9yU2VydmVyLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWNwLnN0YXJ0UHJvbXB0aW5nU2VydmVyJywgXCJTdGFydCBQcm9tcHRpbmcgU2VydmVyXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlcnZlcjogSU1jcFNlcnZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IG9wZW5QYW5lbENoYXRBbmRHZXRXaWRnZXQoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKSk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSB3aWRnZXQuaW5wdXRFZGl0b3I7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSAoZWRpdG9yLmdldFNlbGVjdGlvbigpIHx8IG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkpLmNvbGxhcHNlVG9FbmQoKTtcblx0XHRjb25zdCB0ZXh0ID0gbWNwUHJvbXB0UHJlZml4KHNlcnZlci5kZWZpbml0aW9uKSArICcuJztcblxuXHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2UsIHRleHQgfV0pO1xuXHRcdGVkaXRvci5zZXRTZWxlY3Rpb24oUmFuZ2UuZnJvbVBvc2l0aW9ucyhyYW5nZS5nZXRFbmRQb3NpdGlvbigpLmRlbHRhKDAsIHRleHQubGVuZ3RoKSkpO1xuXHRcdHdpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnRyaWdnZXJTdWdnZXN0KCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1jcFNraXBDdXJyZW50QXV0b3N0YXJ0Q29tbWFuZCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTWNwQ29tbWFuZElkcy5Ta2lwQ3VycmVudEF1dG9zdGFydCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21jcC5za2lwQ3VycmVudEF1dG9zdGFydCcsIFwiU2tpcCBDdXJyZW50IEF1dG9zdGFydFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElNY3BTZXJ2aWNlKS5jYW5jZWxBdXRvc3RhcnQoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsdUJBQXVCLDBCQUEwQixpQkFBaUI7QUFDOUUsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7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QUFFRCxRQUFJLFFBQVE7QUFDWCxZQUFNLFlBQVksYUFBYSxRQUFRLE9BQUssRUFBRSxnQkFBZ0IsT0FBTyxJQUFJLE9BQUssRUFBRSxFQUFHLENBQUM7QUFBQSxJQUNyRjtBQUVBLFdBQU8sUUFBUSxVQUFVO0FBQUEsRUFDMUI7QUFDRDtBQUVPLE1BQU0sdUNBQXVDLFFBQVE7QUFBQSxFQUMzRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSxjQUFjO0FBQUEsTUFDbEIsT0FBTyxVQUFVLDRCQUE0Qix3QkFBd0I7QUFBQSxNQUNyRTtBQUFBLE1BQ0EsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixRQUFtQztBQUN4RSxVQUFNLFNBQVMsTUFBTSwwQkFBMEIsU0FBUyxJQUFJLGFBQWEsR0FBRyxTQUFTLElBQUksa0JBQWtCLENBQUM7QUFDNUcsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsT0FBTztBQUN0QixVQUFNLFFBQVEsT0FBTyxTQUFTO0FBQzlCLFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLE9BQU8sYUFBYSxLQUFLLE1BQU0sa0JBQWtCLEdBQUcsY0FBYztBQUNqRixVQUFNLE9BQU8sZ0JBQWdCLE9BQU8sVUFBVSxJQUFJO0FBRWxELFVBQU0sV0FBVyxDQUFDLEVBQUUsT0FBTyxLQUFLLENBQUMsQ0FBQztBQUNsQyxXQUFPLGFBQWEsTUFBTSxjQUFjLE1BQU0sZUFBZSxFQUFFLE1BQU0sR0FBRyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQ3JGLFdBQU8sV0FBVztBQUNsQixzQkFBa0IsSUFBSSxNQUFNLEdBQUcsZUFBZTtBQUFBLEVBQy9DO0FBQ0Q7QUFFTyxNQUFNLHVDQUF1QyxRQUFRO0FBQUEsRUFDM0QsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksY0FBYztBQUFBLE1BQ2xCLE9BQU8sVUFBVSw0QkFBNEIsd0JBQXdCO0FBQUEsTUFDckU7QUFBQSxNQUNBLElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsYUFBUyxJQUFJLFdBQVcsRUFBRSxnQkFBZ0I7QUFBQSxFQUMzQztBQUNEOyIsCiAgIm5hbWVzIjogWyJzZXJ2ZXJzIiwgIkRpc3BsYXllZFN0YXRlIiwgInMiXQp9Cg==
