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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { disposeIfDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IAuthenticationQueryService } from "../../../services/authentication/common/authenticationQuery.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { errorIcon, infoIcon, manageExtensionIcon, trustIcon, warningIcon } from "../../extensions/browser/extensionsIcons.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { IMcpSamplingService, IMcpService, IMcpWorkbenchService, McpCapability, McpConnectionState, McpServerEditorTab, McpServerInstallState } from "../common/mcpTypes.js";
import { startServerByFilter } from "../common/mcpTypesUtils.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { Schemas } from "../../../../base/common/network.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { LocalMcpServerScope } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { ActionWithDropdownActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import Severity from "../../../../base/common/severity.js";
import { ContributionEnablementState, isContributionDisabled, isContributionEnabled } from "../../chat/common/enablement.js";
import { getWorkbenchMenuMotionContextMenuOptions } from "../../../browser/actions/menuMotion.js";
const _McpServerAction = class _McpServerAction extends Action {
  constructor() {
    super(...arguments);
    this._onDidChange = this._register(new Emitter());
    this._hidden = false;
    this.hideOnDisabled = true;
    this._mcpServer = null;
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(hidden) {
    if (this._hidden !== hidden) {
      this._hidden = hidden;
      this._onDidChange.fire({ hidden });
    }
  }
  _setEnabled(value) {
    super._setEnabled(value);
    if (this.hideOnDisabled) {
      this.hidden = !value;
    }
  }
  get mcpServer() {
    return this._mcpServer;
  }
  set mcpServer(mcpServer) {
    this._mcpServer = mcpServer;
    this.update();
  }
};
_McpServerAction.EXTENSION_ACTION_CLASS = "extension-action";
_McpServerAction.TEXT_ACTION_CLASS = `${_McpServerAction.EXTENSION_ACTION_CLASS} text`;
_McpServerAction.LABEL_ACTION_CLASS = `${_McpServerAction.EXTENSION_ACTION_CLASS} label`;
_McpServerAction.PROMINENT_LABEL_ACTION_CLASS = `${_McpServerAction.LABEL_ACTION_CLASS} prominent`;
_McpServerAction.ICON_ACTION_CLASS = `${_McpServerAction.EXTENSION_ACTION_CLASS} icon`;
let McpServerAction = _McpServerAction;
class ButtonWithDropDownExtensionAction extends McpServerAction {
  constructor(id, clazz, actionsGroups) {
    clazz = `${clazz} action-dropdown`;
    super(id, void 0, clazz);
    this.actionsGroups = actionsGroups;
    this.menuActionClassNames = [];
    this._menuActions = [];
    this.menuActionClassNames = clazz.split(" ");
    this.hideOnDisabled = false;
    this.actions = actionsGroups.flat();
    this.update();
    this._register(Event.any(...this.actions.map((a) => a.onDidChange))(() => this.update(true)));
    this.actions.forEach((a) => this._register(a));
  }
  get menuActions() {
    return [...this._menuActions];
  }
  get mcpServer() {
    return super.mcpServer;
  }
  set mcpServer(mcpServer) {
    this.actions.forEach((a) => a.mcpServer = mcpServer);
    super.mcpServer = mcpServer;
  }
  update(donotUpdateActions) {
    if (!donotUpdateActions) {
      this.actions.forEach((a) => a.update());
    }
    const actionsGroups = this.actionsGroups.map((actionsGroup) => actionsGroup.filter((a) => !a.hidden));
    let actions = [];
    for (const visibleActions of actionsGroups) {
      if (visibleActions.length) {
        actions = [...actions, ...visibleActions, new Separator()];
      }
    }
    actions = actions.length ? actions.slice(0, actions.length - 1) : actions;
    this.primaryAction = actions[0];
    this._menuActions = actions.length > 1 ? actions : [];
    this._onDidChange.fire({ menuActions: this._menuActions });
    if (this.primaryAction) {
      this.hidden = false;
      this.enabled = this.primaryAction.enabled;
      this.label = this.getLabel(this.primaryAction);
      this.tooltip = this.primaryAction.tooltip;
    } else {
      this.hidden = true;
      this.enabled = false;
    }
  }
  async run() {
    if (this.enabled) {
      await this.primaryAction?.run();
    }
  }
  getLabel(action) {
    return action.label;
  }
}
class ButtonWithDropdownExtensionActionViewItem extends ActionWithDropdownActionViewItem {
  constructor(action, options, contextMenuProvider) {
    super(null, action, options, contextMenuProvider);
    this._register(action.onDidChange((e) => {
      if (e.hidden !== void 0 || e.menuActions !== void 0) {
        this.updateClass();
      }
    }));
  }
  render(container) {
    super.render(container);
    this.updateClass();
  }
  updateClass() {
    super.updateClass();
    if (this.element && this.dropdownMenuActionViewItem?.element) {
      this.element.classList.toggle("hide", this._action.hidden);
      const isMenuEmpty = this._action.menuActions.length === 0;
      this.element.classList.toggle("empty", isMenuEmpty);
      this.dropdownMenuActionViewItem.element.classList.toggle("hide", isMenuEmpty);
    }
  }
}
let DropDownAction = class extends McpServerAction {
  constructor(id, label, cssClass, enabled, instantiationService) {
    super(id, label, cssClass, enabled);
    this.instantiationService = instantiationService;
    this._actionViewItem = null;
  }
  createActionViewItem(options) {
    this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
    return this._actionViewItem;
  }
  run(actionGroups) {
    this._actionViewItem?.showMenu(actionGroups);
    return Promise.resolve();
  }
};
DropDownAction = __decorateClass([
  __decorateParam(4, IInstantiationService)
], DropDownAction);
let DropDownExtensionActionViewItem = class extends ActionViewItem {
  constructor(action, options, contextMenuService) {
    super(null, action, { ...options, icon: true, label: true });
    this.contextMenuService = contextMenuService;
  }
  showMenu(menuActionGroups) {
    if (this.element) {
      const actions = this.getActions(menuActionGroups);
      this.contextMenuService.showContextMenu({
        ...getWorkbenchMenuMotionContextMenuOptions(this.element),
        getActions: () => actions,
        actionRunner: this.actionRunner,
        onHide: () => disposeIfDisposable(actions)
      });
    }
  }
  getActions(menuActionGroups) {
    let actions = [];
    for (const menuActions of menuActionGroups) {
      actions = [...actions, ...menuActions, new Separator()];
    }
    return actions.length ? actions.slice(0, actions.length - 1) : actions;
  }
};
DropDownExtensionActionViewItem = __decorateClass([
  __decorateParam(2, IContextMenuService)
], DropDownExtensionActionViewItem);
let InstallAction = class extends McpServerAction {
  constructor(open, mcpWorkbenchService, telemetryService, mcpService) {
    super("extensions.install", localize("install", "Install"), InstallAction.CLASS, false);
    this.open = open;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.telemetryService = telemetryService;
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallAction.HIDE;
    if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Uninstalled) {
      return;
    }
    this.class = InstallAction.CLASS;
    this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    if (this.open) {
      this.mcpWorkbenchService.open(this.mcpServer);
      alert(localize("mcpServerInstallation", "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
    }
    this.telemetryService.publicLog2("mcp:action:install", { name: this.mcpServer.gallery?.name });
    const installed = await this.mcpWorkbenchService.install(this.mcpServer);
    await startServerByFilter(this.mcpService, (s) => {
      return s.definition.label === installed.name;
    });
  }
};
InstallAction.CLASS = `${InstallAction.LABEL_ACTION_CLASS} prominent install`;
InstallAction.HIDE = `${InstallAction.CLASS} hide`;
InstallAction = __decorateClass([
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IMcpService)
], InstallAction);
let InstallInWorkspaceAction = class extends McpServerAction {
  constructor(open, mcpWorkbenchService, workspaceService, quickInputService, telemetryService, mcpService) {
    super("extensions.installWorkspace", localize("installInWorkspace", "Install in Workspace"), InstallAction.CLASS, false);
    this.open = open;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.workspaceService = workspaceService;
    this.quickInputService = quickInputService;
    this.telemetryService = telemetryService;
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallInWorkspaceAction.HIDE;
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Uninstalled && this.mcpServer.local?.scope === LocalMcpServerScope.Workspace) {
      return;
    }
    this.class = InstallAction.CLASS;
    this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    if (this.open) {
      this.mcpWorkbenchService.open(this.mcpServer, { preserveFocus: true });
      alert(localize("mcpServerInstallation", "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
    }
    const target = await this.getConfigurationTarget();
    if (!target) {
      return;
    }
    this.telemetryService.publicLog2("mcp:action:install:workspace", { name: this.mcpServer.gallery?.name });
    const installed = await this.mcpWorkbenchService.install(this.mcpServer, { target });
    await startServerByFilter(this.mcpService, (s) => {
      return s.definition.label === installed.name;
    });
  }
  async getConfigurationTarget() {
    const options = [];
    for (const folder of this.workspaceService.getWorkspace().folders) {
      options.push({ target: folder, label: folder.name, description: localize("install in workspace folder", "Workspace Folder") });
    }
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      if (options.length > 0) {
        options.push({ type: "separator" });
      }
      options.push({ target: ConfigurationTarget.WORKSPACE, label: localize("mcp.target.workspace", "Workspace") });
    }
    if (options.length === 1) {
      return options[0].target;
    }
    const targetPick = await this.quickInputService.pick(options, {
      title: localize("mcp.target.title", "Choose where to install the MCP server")
    });
    return targetPick?.target;
  }
};
InstallInWorkspaceAction.CLASS = `${InstallInWorkspaceAction.LABEL_ACTION_CLASS} prominent install`;
InstallInWorkspaceAction.HIDE = `${InstallInWorkspaceAction.CLASS} hide`;
InstallInWorkspaceAction = __decorateClass([
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IMcpService)
], InstallInWorkspaceAction);
let InstallInRemoteAction = class extends McpServerAction {
  constructor(open, mcpWorkbenchService, environmentService, telemetryService, labelService, mcpService) {
    super("extensions.installRemote", localize("installInRemote", "Install (Remote)"), InstallAction.CLASS, false);
    this.open = open;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.labelService = labelService;
    this.mcpService = mcpService;
    const remoteLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
    this.label = localize("installInRemoteLabel", "Install in {0}", remoteLabel);
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallInRemoteAction.HIDE;
    if (!this.environmentService.remoteAuthority) {
      return;
    }
    if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Uninstalled) {
      if (this.mcpServer.local?.scope === LocalMcpServerScope.RemoteUser) {
        return;
      }
      if (this.mcpWorkbenchService.local.find((mcpServer) => mcpServer.name === this.mcpServer?.name && mcpServer.local?.scope === LocalMcpServerScope.RemoteUser)) {
        return;
      }
    }
    this.class = InstallAction.CLASS;
    this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    if (this.open) {
      this.mcpWorkbenchService.open(this.mcpServer);
      alert(localize("mcpServerInstallation", "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
    }
    this.telemetryService.publicLog2("mcp:action:install:remote", { name: this.mcpServer.gallery?.name });
    const installed = await this.mcpWorkbenchService.install(this.mcpServer, { target: ConfigurationTarget.USER_REMOTE });
    await startServerByFilter(this.mcpService, (s) => {
      return s.definition.label === installed.name;
    });
  }
};
InstallInRemoteAction.CLASS = `${InstallInRemoteAction.LABEL_ACTION_CLASS} prominent install`;
InstallInRemoteAction.HIDE = `${InstallInRemoteAction.CLASS} hide`;
InstallInRemoteAction = __decorateClass([
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IMcpService)
], InstallInRemoteAction);
const _InstallingLabelAction = class _InstallingLabelAction extends McpServerAction {
  constructor() {
    super("extension.installing", _InstallingLabelAction.LABEL, _InstallingLabelAction.CLASS, false);
  }
  update() {
    this.class = `${_InstallingLabelAction.CLASS}${this.mcpServer && this.mcpServer.installState === McpServerInstallState.Installing ? "" : " hide"}`;
  }
};
_InstallingLabelAction.LABEL = localize("installing", "Installing");
_InstallingLabelAction.CLASS = `${McpServerAction.LABEL_ACTION_CLASS} install installing`;
let InstallingLabelAction = _InstallingLabelAction;
let UninstallAction = class extends McpServerAction {
  constructor(mcpWorkbenchService) {
    super("extensions.uninstall", localize("uninstall", "Uninstall"), UninstallAction.CLASS, false);
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = UninstallAction.HIDE;
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Installed) {
      this.enabled = false;
      return;
    }
    this.class = UninstallAction.CLASS;
    this.enabled = true;
    this.label = localize("uninstall", "Uninstall");
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    await this.mcpWorkbenchService.uninstall(this.mcpServer);
  }
};
UninstallAction.CLASS = `${UninstallAction.LABEL_ACTION_CLASS} prominent uninstall`;
UninstallAction.HIDE = `${UninstallAction.CLASS} hide`;
UninstallAction = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService)
], UninstallAction);
let EnableMcpServerGloballyAction = class extends McpServerAction {
  constructor(mcpService) {
    super(EnableMcpServerGloballyAction.ID, localize("enableGlobally", "Enable"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.tooltip = localize("enableGloballyTooltip", "Enable this MCP server");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionDisabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.EnabledProfile);
  }
};
EnableMcpServerGloballyAction.ID = "mcpServer.enableGlobally";
EnableMcpServerGloballyAction = __decorateClass([
  __decorateParam(0, IMcpService)
], EnableMcpServerGloballyAction);
let EnableMcpServerForWorkspaceAction = class extends McpServerAction {
  constructor(mcpService, workspaceService) {
    super(EnableMcpServerForWorkspaceAction.ID, localize("enableForWorkspace", "Enable (Workspace)"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.workspaceService = workspaceService;
    this.tooltip = localize("enableForWorkspaceTooltip", "Enable this MCP server only in this workspace");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionDisabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.EnabledWorkspace);
  }
};
EnableMcpServerForWorkspaceAction.ID = "mcpServer.enableForWorkspace";
EnableMcpServerForWorkspaceAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IWorkspaceContextService)
], EnableMcpServerForWorkspaceAction);
let DisableMcpServerGloballyAction = class extends McpServerAction {
  constructor(mcpService) {
    super(DisableMcpServerGloballyAction.ID, localize("disableGlobally", "Disable"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.tooltip = localize("disableGloballyTooltip", "Disable this MCP server");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionEnabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.DisabledProfile);
  }
};
DisableMcpServerGloballyAction.ID = "mcpServer.disableGlobally";
DisableMcpServerGloballyAction = __decorateClass([
  __decorateParam(0, IMcpService)
], DisableMcpServerGloballyAction);
let DisableMcpServerForWorkspaceAction = class extends McpServerAction {
  constructor(mcpService, workspaceService) {
    super(DisableMcpServerForWorkspaceAction.ID, localize("disableForWorkspace", "Disable (Workspace)"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.workspaceService = workspaceService;
    this.tooltip = localize("disableForWorkspaceTooltip", "Disable this MCP server only in this workspace");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionEnabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.DisabledWorkspace);
  }
};
DisableMcpServerForWorkspaceAction.ID = "mcpServer.disableForWorkspace";
DisableMcpServerForWorkspaceAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IWorkspaceContextService)
], DisableMcpServerForWorkspaceAction);
let EnableMcpDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("mcpServer.enable", McpServerAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(EnableMcpServerGloballyAction),
        instantiationService.createInstance(EnableMcpServerForWorkspaceAction)
      ]
    ]);
  }
};
EnableMcpDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], EnableMcpDropDownAction);
let DisableMcpDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("mcpServer.disable", McpServerAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(DisableMcpServerGloballyAction),
        instantiationService.createInstance(DisableMcpServerForWorkspaceAction)
      ]
    ]);
  }
};
DisableMcpDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], DisableMcpDropDownAction);
function getContextMenuActions(mcpServer, isEditorAction, instantiationService) {
  return instantiationService.invokeFunction((accessor) => {
    const workspaceService = accessor.get(IWorkspaceContextService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    const groups = [];
    const isInstalled = mcpServer.installState === McpServerInstallState.Installed;
    if (isInstalled) {
      groups.push([
        instantiationService.createInstance(StartServerAction)
      ]);
      groups.push([
        instantiationService.createInstance(StopServerAction),
        instantiationService.createInstance(RestartServerAction)
      ]);
      groups.push([
        instantiationService.createInstance(EnableMcpServerGloballyAction),
        instantiationService.createInstance(EnableMcpServerForWorkspaceAction),
        instantiationService.createInstance(DisableMcpServerGloballyAction),
        instantiationService.createInstance(DisableMcpServerForWorkspaceAction)
      ]);
      groups.push([
        instantiationService.createInstance(AuthServerAction)
      ]);
      groups.push([
        instantiationService.createInstance(ShowServerOutputAction),
        instantiationService.createInstance(ShowServerConfigurationAction),
        instantiationService.createInstance(ShowServerJsonConfigurationAction)
      ]);
      groups.push([
        instantiationService.createInstance(ConfigureModelAccessAction),
        instantiationService.createInstance(ShowSamplingRequestsAction)
      ]);
      groups.push([
        instantiationService.createInstance(BrowseResourcesAction)
      ]);
      if (!isEditorAction) {
        const installGroup = [instantiationService.createInstance(UninstallAction)];
        if (workspaceService.getWorkbenchState() !== WorkbenchState.EMPTY) {
          installGroup.push(instantiationService.createInstance(InstallInWorkspaceAction, false));
        }
        if (environmentService.remoteAuthority && mcpServer.local?.scope !== LocalMcpServerScope.RemoteUser) {
          installGroup.push(instantiationService.createInstance(InstallInRemoteAction, false));
        }
        groups.push(installGroup);
      }
    } else {
      const installGroup = [];
      if (workspaceService.getWorkbenchState() !== WorkbenchState.EMPTY) {
        installGroup.push(instantiationService.createInstance(InstallInWorkspaceAction, !isEditorAction));
      }
      if (environmentService.remoteAuthority) {
        installGroup.push(instantiationService.createInstance(InstallInRemoteAction, !isEditorAction));
      }
      groups.push(installGroup);
    }
    groups.forEach((group) => group.forEach((extensionAction) => extensionAction.mcpServer = mcpServer));
    return groups;
  });
}
let ManageMcpServerAction = class extends DropDownAction {
  constructor(isEditorAction, instantiationService) {
    super(ManageMcpServerAction.ID, "", "", true, instantiationService);
    this.isEditorAction = isEditorAction;
    this.tooltip = localize("manage", "Manage");
    this.update();
  }
  async run() {
    return super.run(this.mcpServer ? getContextMenuActions(this.mcpServer, this.isEditorAction, this.instantiationService) : []);
  }
  update() {
    this.class = ManageMcpServerAction.HideManageExtensionClass;
    this.enabled = false;
    if (!this.mcpServer) {
      return;
    }
    if (this.isEditorAction) {
      this.enabled = true;
      this.class = ManageMcpServerAction.Class;
    } else {
      this.enabled = !!this.mcpServer.local;
      this.class = this.enabled ? ManageMcpServerAction.Class : ManageMcpServerAction.HideManageExtensionClass;
    }
  }
};
ManageMcpServerAction.ID = "mcpServer.manage";
ManageMcpServerAction.Class = `${McpServerAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon);
ManageMcpServerAction.HideManageExtensionClass = `${ManageMcpServerAction.Class} hide`;
ManageMcpServerAction = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ManageMcpServerAction);
let StartServerAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.start", localize("start", "Start Server"), StartServerAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = StartServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const serverState = server.connectionState.get();
    if (!McpConnectionState.canBeStarted(serverState.state)) {
      return;
    }
    this.class = StartServerAction.CLASS;
    this.enabled = true;
    this.label = localize("start", "Start Server");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    await server.start({ promptType: "all-untrusted" });
    server.showOutput();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
StartServerAction.CLASS = `${StartServerAction.LABEL_ACTION_CLASS} prominent start`;
StartServerAction.HIDE = `${StartServerAction.CLASS} hide`;
StartServerAction = __decorateClass([
  __decorateParam(0, IMcpService)
], StartServerAction);
let StopServerAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.stop", localize("stop", "Stop Server"), StopServerAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = StopServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const serverState = server.connectionState.get();
    if (McpConnectionState.canBeStarted(serverState.state)) {
      return;
    }
    this.class = StopServerAction.CLASS;
    this.enabled = true;
    this.label = localize("stop", "Stop Server");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    await server.stop();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
StopServerAction.CLASS = `${StopServerAction.LABEL_ACTION_CLASS} prominent stop`;
StopServerAction.HIDE = `${StopServerAction.CLASS} hide`;
StopServerAction = __decorateClass([
  __decorateParam(0, IMcpService)
], StopServerAction);
let RestartServerAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.restart", localize("restart", "Restart Server"), RestartServerAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = RestartServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const serverState = server.connectionState.get();
    if (McpConnectionState.canBeStarted(serverState.state)) {
      return;
    }
    this.class = RestartServerAction.CLASS;
    this.enabled = true;
    this.label = localize("restart", "Restart Server");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    await server.stop();
    await server.start({ promptType: "all-untrusted" });
    server.showOutput();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
RestartServerAction.CLASS = `${RestartServerAction.LABEL_ACTION_CLASS} prominent restart`;
RestartServerAction.HIDE = `${RestartServerAction.CLASS} hide`;
RestartServerAction = __decorateClass([
  __decorateParam(0, IMcpService)
], RestartServerAction);
let AuthServerAction = class extends McpServerAction {
  constructor(mcpService, _authenticationQueryService, _authenticationService) {
    super("extensions.restart", localize("restart", "Restart Server"), RestartServerAction.CLASS, false);
    this.mcpService = mcpService;
    this._authenticationQueryService = _authenticationQueryService;
    this._authenticationService = _authenticationService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = AuthServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const accountQuery = this.getAccountQuery();
    if (!accountQuery) {
      return;
    }
    this._accountQuery = accountQuery;
    this.class = AuthServerAction.CLASS;
    this.enabled = true;
    let label = accountQuery.entities().getEntityCount().total > 1 ? AuthServerAction.DISCONNECT : AuthServerAction.SIGN_OUT;
    label += ` (${accountQuery.accountName})`;
    this.label = label;
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    const accountQuery = this.getAccountQuery();
    if (!accountQuery) {
      return;
    }
    await server.stop();
    const { providerId, accountName } = accountQuery;
    accountQuery.mcpServer(server.definition.id).setAccessAllowed(false, server.definition.label);
    if (this.label === AuthServerAction.SIGN_OUT) {
      const accounts = await this._authenticationService.getAccounts(providerId);
      const account = accounts.find((a) => a.label === accountName);
      if (account) {
        const sessions = await this._authenticationService.getSessions(providerId, void 0, { account });
        for (const session of sessions) {
          await this._authenticationService.removeSession(providerId, session.id);
        }
      }
    }
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
  getAccountQuery() {
    const server = this.getServer();
    if (!server) {
      return void 0;
    }
    if (this._accountQuery) {
      return this._accountQuery;
    }
    const serverId = server.definition.id;
    const preferences = this._authenticationQueryService.mcpServer(serverId).getAllAccountPreferences();
    if (!preferences.size) {
      return void 0;
    }
    for (const [providerId, accountName] of preferences) {
      const accountQuery = this._authenticationQueryService.provider(providerId).account(accountName);
      if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
        continue;
      }
      return accountQuery;
    }
    return void 0;
  }
};
AuthServerAction.CLASS = `${AuthServerAction.LABEL_ACTION_CLASS} prominent account`;
AuthServerAction.HIDE = `${AuthServerAction.CLASS} hide`;
AuthServerAction.SIGN_OUT = localize("mcp.signOut", "Sign Out");
AuthServerAction.DISCONNECT = localize("mcp.disconnect", "Disconnect Account");
AuthServerAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IAuthenticationQueryService),
  __decorateParam(2, IAuthenticationService)
], AuthServerAction);
let ShowServerOutputAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.output", localize("output", "Show Output"), ShowServerOutputAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowServerOutputAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    this.class = ShowServerOutputAction.CLASS;
    this.enabled = true;
    this.label = localize("output", "Show Output");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    server.showOutput();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
ShowServerOutputAction.CLASS = `${ShowServerOutputAction.LABEL_ACTION_CLASS} prominent output`;
ShowServerOutputAction.HIDE = `${ShowServerOutputAction.CLASS} hide`;
ShowServerOutputAction = __decorateClass([
  __decorateParam(0, IMcpService)
], ShowServerOutputAction);
let ShowServerConfigurationAction = class extends McpServerAction {
  constructor(mcpWorkbenchService) {
    super("extensions.config", localize("config", "Show Configuration"), ShowServerConfigurationAction.CLASS, false);
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowServerConfigurationAction.HIDE;
    if (!this.mcpServer?.local) {
      return;
    }
    this.class = ShowServerConfigurationAction.CLASS;
    this.enabled = true;
  }
  async run() {
    if (!this.mcpServer?.local) {
      return;
    }
    this.mcpWorkbenchService.open(this.mcpServer, { tab: McpServerEditorTab.Configuration });
  }
};
ShowServerConfigurationAction.CLASS = `${ShowServerConfigurationAction.LABEL_ACTION_CLASS} prominent config`;
ShowServerConfigurationAction.HIDE = `${ShowServerConfigurationAction.CLASS} hide`;
ShowServerConfigurationAction = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService)
], ShowServerConfigurationAction);
let ShowServerJsonConfigurationAction = class extends McpServerAction {
  constructor(mcpService, mcpRegistry, editorService) {
    super("extensions.jsonConfig", localize("configJson", "Show Configuration (JSON)"), ShowServerJsonConfigurationAction.CLASS, false);
    this.mcpService = mcpService;
    this.mcpRegistry = mcpRegistry;
    this.editorService = editorService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowServerJsonConfigurationAction.HIDE;
    const configurationTarget = this.getConfigurationTarget();
    if (!configurationTarget) {
      return;
    }
    this.class = ShowServerConfigurationAction.CLASS;
    this.enabled = true;
  }
  async run() {
    const configurationTarget = this.getConfigurationTarget();
    if (!configurationTarget) {
      return;
    }
    this.editorService.openEditor({
      resource: URI.isUri(configurationTarget) ? configurationTarget : configurationTarget.uri,
      options: { selection: URI.isUri(configurationTarget) ? void 0 : configurationTarget.range }
    });
  }
  getConfigurationTarget() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.label === this.mcpServer?.name);
    if (!server) {
      return;
    }
    const collection = this.mcpRegistry.collections.get().find((c) => c.id === server.collection.id);
    const serverDefinition = collection?.serverDefinitions.get().find((s) => s.id === server.definition.id);
    return serverDefinition?.presentation?.origin || collection?.presentation?.origin;
  }
};
ShowServerJsonConfigurationAction.CLASS = `${ShowServerJsonConfigurationAction.LABEL_ACTION_CLASS} prominent config`;
ShowServerJsonConfigurationAction.HIDE = `${ShowServerJsonConfigurationAction.CLASS} hide`;
ShowServerJsonConfigurationAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IMcpRegistry),
  __decorateParam(2, IEditorService)
], ShowServerJsonConfigurationAction);
let ConfigureModelAccessAction = class extends McpServerAction {
  constructor(mcpService, commandService) {
    super("extensions.config", localize("mcp.configAccess", "Configure Model Access"), ConfigureModelAccessAction.CLASS, false);
    this.mcpService = mcpService;
    this.commandService = commandService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ConfigureModelAccessAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    this.class = ConfigureModelAccessAction.CLASS;
    this.enabled = true;
    this.label = localize("mcp.configAccess", "Configure Model Access");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    this.commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, server);
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
ConfigureModelAccessAction.CLASS = `${ConfigureModelAccessAction.LABEL_ACTION_CLASS} prominent config`;
ConfigureModelAccessAction.HIDE = `${ConfigureModelAccessAction.CLASS} hide`;
ConfigureModelAccessAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, ICommandService)
], ConfigureModelAccessAction);
let ShowSamplingRequestsAction = class extends McpServerAction {
  constructor(mcpService, samplingService, editorService) {
    super("extensions.config", localize("mcp.samplingLog", "Show Sampling Requests"), ShowSamplingRequestsAction.CLASS, false);
    this.mcpService = mcpService;
    this.samplingService = samplingService;
    this.editorService = editorService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowSamplingRequestsAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    if (!this.samplingService.hasLogs(server)) {
      return;
    }
    this.class = ShowSamplingRequestsAction.CLASS;
    this.enabled = true;
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    if (!this.samplingService.hasLogs(server)) {
      return;
    }
    this.editorService.openEditor({
      resource: void 0,
      contents: this.samplingService.getLogText(server),
      label: localize("mcp.samplingLog.title", "MCP Sampling: {0}", server.definition.label)
    });
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
ShowSamplingRequestsAction.CLASS = `${ShowSamplingRequestsAction.LABEL_ACTION_CLASS} prominent config`;
ShowSamplingRequestsAction.HIDE = `${ShowSamplingRequestsAction.CLASS} hide`;
ShowSamplingRequestsAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IMcpSamplingService),
  __decorateParam(2, IEditorService)
], ShowSamplingRequestsAction);
let BrowseResourcesAction = class extends McpServerAction {
  constructor(mcpService, commandService) {
    super("extensions.config", localize("mcp.resources", "Browse Resources"), BrowseResourcesAction.CLASS, false);
    this.mcpService = mcpService;
    this.commandService = commandService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = BrowseResourcesAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const capabilities = server.capabilities.get();
    if (capabilities !== void 0 && !(capabilities & McpCapability.Resources)) {
      return;
    }
    this.class = BrowseResourcesAction.CLASS;
    this.enabled = true;
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    const capabilities = server.capabilities.get();
    if (capabilities !== void 0 && !(capabilities & McpCapability.Resources)) {
      return;
    }
    return this.commandService.executeCommand(McpCommandIds.BrowseResources, server);
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
BrowseResourcesAction.CLASS = `${BrowseResourcesAction.LABEL_ACTION_CLASS} prominent config`;
BrowseResourcesAction.HIDE = `${BrowseResourcesAction.CLASS} hide`;
BrowseResourcesAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, ICommandService)
], BrowseResourcesAction);
let McpServerStatusAction = class extends McpServerAction {
  constructor(mcpWorkbenchService, commandService) {
    super("extensions.status", "", `${McpServerStatusAction.CLASS} hide`, false);
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.commandService = commandService;
    this._status = [];
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this.update();
  }
  get status() {
    return this._status;
  }
  update() {
    this.computeAndUpdateStatus();
  }
  computeAndUpdateStatus() {
    this.updateStatus(void 0, true);
    this.enabled = false;
    if (!this.mcpServer) {
      return;
    }
    if ((this.mcpServer.gallery || this.mcpServer.installable) && this.mcpServer.installState === McpServerInstallState.Uninstalled) {
      const result = this.mcpWorkbenchService.canInstall(this.mcpServer);
      if (result !== true) {
        this.updateStatus({ icon: warningIcon, message: result }, true);
        return;
      }
    }
    const runtimeState = this.mcpServer.runtimeStatus;
    if (runtimeState?.message) {
      this.updateStatus({ icon: runtimeState.message.severity === Severity.Warning ? warningIcon : runtimeState.message.severity === Severity.Error ? errorIcon : infoIcon, message: runtimeState.message.text }, true);
    }
  }
  updateStatus(status, updateClass) {
    if (status) {
      if (this._status.some((s) => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
        return;
      }
    } else {
      if (this._status.length === 0) {
        return;
      }
      this._status = [];
    }
    if (status) {
      this._status.push(status);
      this._status.sort(
        (a, b) => b.icon === trustIcon ? -1 : a.icon === trustIcon ? 1 : b.icon === errorIcon ? -1 : a.icon === errorIcon ? 1 : b.icon === warningIcon ? -1 : a.icon === warningIcon ? 1 : b.icon === infoIcon ? -1 : a.icon === infoIcon ? 1 : 0
      );
    }
    if (updateClass) {
      if (status?.icon === errorIcon) {
        this.class = `${McpServerStatusAction.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
      } else if (status?.icon === warningIcon) {
        this.class = `${McpServerStatusAction.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
      } else if (status?.icon === infoIcon) {
        this.class = `${McpServerStatusAction.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
      } else if (status?.icon === trustIcon) {
        this.class = `${McpServerStatusAction.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
      } else {
        this.class = `${McpServerStatusAction.CLASS} hide`;
      }
    }
    this._onDidChangeStatus.fire();
  }
  async run() {
    if (this._status[0]?.icon === trustIcon) {
      return this.commandService.executeCommand("workbench.trust.manage");
    }
  }
};
McpServerStatusAction.CLASS = `${McpServerAction.ICON_ACTION_CLASS} extension-status`;
McpServerStatusAction = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService),
  __decorateParam(1, ICommandService)
], McpServerStatusAction);
export {
  AuthServerAction,
  BrowseResourcesAction,
  ButtonWithDropDownExtensionAction,
  ButtonWithDropdownExtensionActionViewItem,
  ConfigureModelAccessAction,
  DisableMcpDropDownAction,
  DisableMcpServerForWorkspaceAction,
  DisableMcpServerGloballyAction,
  DropDownAction,
  DropDownExtensionActionViewItem,
  EnableMcpDropDownAction,
  EnableMcpServerForWorkspaceAction,
  EnableMcpServerGloballyAction,
  InstallAction,
  InstallInRemoteAction,
  InstallInWorkspaceAction,
  InstallingLabelAction,
  ManageMcpServerAction,
  McpServerAction,
  McpServerStatusAction,
  RestartServerAction,
  ShowSamplingRequestsAction,
  ShowServerConfigurationAction,
  ShowServerJsonConfigurationAction,
  ShowServerOutputAction,
  StartServerAction,
  StopServerAction,
  UninstallAction,
  getContextMenuActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFNlcnZlckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIElBY3Rpb25DaGFuZ2VFdmVudCwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGRpc3Bvc2VJZkRpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWNjb3VudFF1ZXJ5LCBJQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb25RdWVyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlcnJvckljb24sIGluZm9JY29uLCBtYW5hZ2VFeHRlbnNpb25JY29uLCB0cnVzdEljb24sIHdhcm5pbmdJY29uIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBNY3BDb21tYW5kSWRzIH0gZnJvbSAnLi4vY29tbW9uL21jcENvbW1hbmRJZHMuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcFNhbXBsaW5nU2VydmljZSwgSU1jcFNlcnZlciwgSU1jcFNlcnZlckNvbnRhaW5lciwgSU1jcFNlcnZpY2UsIElNY3BXb3JrYmVuY2hTZXJ2aWNlLCBJV29ya2JlbmNoTWNwU2VydmVyLCBNY3BDYXBhYmlsaXR5LCBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcFNlcnZlckVkaXRvclRhYiwgTWNwU2VydmVySW5zdGFsbFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IHN0YXJ0U2VydmVyQnlGaWx0ZXIgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXNVdGlscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IExvY2FsTWNwU2VydmVyU2NvcGUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9tY3AvY29tbW9uL21jcFdvcmtiZW5jaE1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkFjdGlvbiB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25XaXRoRHJvcGRvd25BY3Rpb25WaWV3SXRlbSwgSUFjdGlvbldpdGhEcm9wZG93bkFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUsIGlzQ29udHJpYnV0aW9uRGlzYWJsZWQsIGlzQ29udHJpYnV0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgZ2V0V29ya2JlbmNoTWVudU1vdGlvbkNvbnRleHRNZW51T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9tZW51TW90aW9uLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTWNwU2VydmVyQWN0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBJQWN0aW9uQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBoaWRkZW4/OiBib29sZWFuO1xuXHRyZWFkb25seSBtZW51QWN0aW9ucz86IElBY3Rpb25bXTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE1jcFNlcnZlckFjdGlvbiBleHRlbmRzIEFjdGlvbiBpbXBsZW1lbnRzIElNY3BTZXJ2ZXJDb250YWluZXIge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWNwU2VydmVyQWN0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRvdmVycmlkZSBnZXQgb25EaWRDaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDsgfVxuXG5cdHN0YXRpYyByZWFkb25seSBFWFRFTlNJT05fQUNUSU9OX0NMQVNTID0gJ2V4dGVuc2lvbi1hY3Rpb24nO1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVYVF9BQ1RJT05fQ0xBU1MgPSBgJHtNY3BTZXJ2ZXJBY3Rpb24uRVhURU5TSU9OX0FDVElPTl9DTEFTU30gdGV4dGA7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTF9BQ1RJT05fQ0xBU1MgPSBgJHtNY3BTZXJ2ZXJBY3Rpb24uRVhURU5TSU9OX0FDVElPTl9DTEFTU30gbGFiZWxgO1xuXHRzdGF0aWMgcmVhZG9ubHkgUFJPTUlORU5UX0xBQkVMX0FDVElPTl9DTEFTUyA9IGAke01jcFNlcnZlckFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudGA7XG5cdHN0YXRpYyByZWFkb25seSBJQ09OX0FDVElPTl9DTEFTUyA9IGAke01jcFNlcnZlckFjdGlvbi5FWFRFTlNJT05fQUNUSU9OX0NMQVNTfSBpY29uYDtcblxuXHRwcml2YXRlIF9oaWRkZW46IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGhpZGRlbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hpZGRlbjsgfVxuXHRzZXQgaGlkZGVuKGhpZGRlbjogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9oaWRkZW4gIT09IGhpZGRlbikge1xuXHRcdFx0dGhpcy5faGlkZGVuID0gaGlkZGVuO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGhpZGRlbiB9KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3NldEVuYWJsZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5fc2V0RW5hYmxlZCh2YWx1ZSk7XG5cdFx0aWYgKHRoaXMuaGlkZU9uRGlzYWJsZWQpIHtcblx0XHRcdHRoaXMuaGlkZGVuID0gIXZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBoaWRlT25EaXNhYmxlZDogYm9vbGVhbiA9IHRydWU7XG5cblx0cHJpdmF0ZSBfbWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCA9IG51bGw7XG5cdGdldCBtY3BTZXJ2ZXIoKTogSVdvcmtiZW5jaE1jcFNlcnZlciB8IG51bGwgeyByZXR1cm4gdGhpcy5fbWNwU2VydmVyOyB9XG5cdHNldCBtY3BTZXJ2ZXIobWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCkgeyB0aGlzLl9tY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXI7IHRoaXMudXBkYXRlKCk7IH1cblxuXHRhYnN0cmFjdCB1cGRhdGUoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0cHJpdmF0ZSBwcmltYXJ5QWN0aW9uOiBJQWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG1lbnVBY3Rpb25DbGFzc05hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIF9tZW51QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGdldCBtZW51QWN0aW9ucygpOiBJQWN0aW9uW10geyByZXR1cm4gWy4uLnRoaXMuX21lbnVBY3Rpb25zXTsgfVxuXG5cdG92ZXJyaWRlIGdldCBtY3BTZXJ2ZXIoKTogSVdvcmtiZW5jaE1jcFNlcnZlciB8IG51bGwge1xuXHRcdHJldHVybiBzdXBlci5tY3BTZXJ2ZXI7XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgbWNwU2VydmVyKG1jcFNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlciB8IG51bGwpIHtcblx0XHR0aGlzLmFjdGlvbnMuZm9yRWFjaChhID0+IGEubWNwU2VydmVyID0gbWNwU2VydmVyKTtcblx0XHRzdXBlci5tY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgYWN0aW9uczogTWNwU2VydmVyQWN0aW9uW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRjbGF6ejogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uc0dyb3VwczogTWNwU2VydmVyQWN0aW9uW11bXSxcblx0KSB7XG5cdFx0Y2xhenogPSBgJHtjbGF6en0gYWN0aW9uLWRyb3Bkb3duYDtcblx0XHRzdXBlcihpZCwgdW5kZWZpbmVkLCBjbGF6eik7XG5cdFx0dGhpcy5tZW51QWN0aW9uQ2xhc3NOYW1lcyA9IGNsYXp6LnNwbGl0KCcgJyk7XG5cdFx0dGhpcy5oaWRlT25EaXNhYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuYWN0aW9ucyA9IGFjdGlvbnNHcm91cHMuZmxhdCgpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KC4uLnRoaXMuYWN0aW9ucy5tYXAoYSA9PiBhLm9uRGlkQ2hhbmdlKSkoKCkgPT4gdGhpcy51cGRhdGUodHJ1ZSkpKTtcblx0XHR0aGlzLmFjdGlvbnMuZm9yRWFjaChhID0+IHRoaXMuX3JlZ2lzdGVyKGEpKTtcblx0fVxuXG5cdHVwZGF0ZShkb25vdFVwZGF0ZUFjdGlvbnM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFkb25vdFVwZGF0ZUFjdGlvbnMpIHtcblx0XHRcdHRoaXMuYWN0aW9ucy5mb3JFYWNoKGEgPT4gYS51cGRhdGUoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uc0dyb3VwcyA9IHRoaXMuYWN0aW9uc0dyb3Vwcy5tYXAoYWN0aW9uc0dyb3VwID0+IGFjdGlvbnNHcm91cC5maWx0ZXIoYSA9PiAhYS5oaWRkZW4pKTtcblxuXHRcdGxldCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHZpc2libGVBY3Rpb25zIG9mIGFjdGlvbnNHcm91cHMpIHtcblx0XHRcdGlmICh2aXNpYmxlQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0YWN0aW9ucyA9IFsuLi5hY3Rpb25zLCAuLi52aXNpYmxlQWN0aW9ucywgbmV3IFNlcGFyYXRvcigpXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWN0aW9ucyA9IGFjdGlvbnMubGVuZ3RoID8gYWN0aW9ucy5zbGljZSgwLCBhY3Rpb25zLmxlbmd0aCAtIDEpIDogYWN0aW9ucztcblxuXHRcdHRoaXMucHJpbWFyeUFjdGlvbiA9IGFjdGlvbnNbMF07XG5cdFx0dGhpcy5fbWVudUFjdGlvbnMgPSBhY3Rpb25zLmxlbmd0aCA+IDEgPyBhY3Rpb25zIDogW107XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IG1lbnVBY3Rpb25zOiB0aGlzLl9tZW51QWN0aW9ucyB9KTtcblxuXHRcdGlmICh0aGlzLnByaW1hcnlBY3Rpb24pIHtcblx0XHRcdHRoaXMuaGlkZGVuID0gZmFsc2U7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLnByaW1hcnlBY3Rpb24uZW5hYmxlZDtcblx0XHRcdHRoaXMubGFiZWwgPSB0aGlzLmdldExhYmVsKHRoaXMucHJpbWFyeUFjdGlvbiBhcyBFeHRlbnNpb25BY3Rpb24pO1xuXHRcdFx0dGhpcy50b29sdGlwID0gdGhpcy5wcmltYXJ5QWN0aW9uLnRvb2x0aXA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaGlkZGVuID0gdHJ1ZTtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5lbmFibGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnByaW1hcnlBY3Rpb24/LnJ1bigpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBnZXRMYWJlbChhY3Rpb246IEV4dGVuc2lvbkFjdGlvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGFjdGlvbi5sYWJlbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnV0dG9uV2l0aERyb3Bkb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25XaXRoRHJvcGRvd25BY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyAmIElBY3Rpb25XaXRoRHJvcGRvd25BY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0Y29udGV4dE1lbnVQcm92aWRlcjogSUNvbnRleHRNZW51UHJvdmlkZXJcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCBvcHRpb25zLCBjb250ZXh0TWVudVByb3ZpZGVyKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5oaWRkZW4gIT09IHVuZGVmaW5lZCB8fCBlLm1lbnVBY3Rpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNsYXNzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZUNsYXNzKCk7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCAmJiB0aGlzLmRyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtPy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsICg8QnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uPnRoaXMuX2FjdGlvbikuaGlkZGVuKTtcblx0XHRcdGNvbnN0IGlzTWVudUVtcHR5ID0gKDxCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24+dGhpcy5fYWN0aW9uKS5tZW51QWN0aW9ucy5sZW5ndGggPT09IDA7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHknLCBpc01lbnVFbXB0eSk7XG5cdFx0XHR0aGlzLmRyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsIGlzTWVudUVtcHR5KTtcblx0XHR9XG5cdH1cblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRHJvcERvd25BY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bGFiZWw6IHN0cmluZyxcblx0XHRjc3NDbGFzczogc3RyaW5nLFxuXHRcdGVuYWJsZWQ6IGJvb2xlYW4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwsIGNzc0NsYXNzLCBlbmFibGVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2FjdGlvblZpZXdJdGVtOiBEcm9wRG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtIHwgbnVsbCA9IG51bGw7XG5cdGNyZWF0ZUFjdGlvblZpZXdJdGVtKG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBEcm9wRG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtIHtcblx0XHR0aGlzLl9hY3Rpb25WaWV3SXRlbSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRHJvcERvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbSwgdGhpcywgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvblZpZXdJdGVtO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bihhY3Rpb25Hcm91cHM6IElBY3Rpb25bXVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYWN0aW9uVmlld0l0ZW0/LnNob3dNZW51KGFjdGlvbkdyb3Vwcyk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEcm9wRG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiB0cnVlLCBsYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHB1YmxpYyBzaG93TWVudShtZW51QWN0aW9uR3JvdXBzOiBJQWN0aW9uW11bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldEFjdGlvbnMobWVudUFjdGlvbkdyb3Vwcyk7XG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHQuLi5nZXRXb3JrYmVuY2hNZW51TW90aW9uQ29udGV4dE1lbnVPcHRpb25zKHRoaXMuZWxlbWVudCksXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5hY3Rpb25SdW5uZXIsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zZUlmRGlzcG9zYWJsZShhY3Rpb25zKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zKG1lbnVBY3Rpb25Hcm91cHM6IElBY3Rpb25bXVtdKTogSUFjdGlvbltdIHtcblx0XHRsZXQgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBtZW51QWN0aW9ucyBvZiBtZW51QWN0aW9uR3JvdXBzKSB7XG5cdFx0XHRhY3Rpb25zID0gWy4uLmFjdGlvbnMsIC4uLm1lbnVBY3Rpb25zLCBuZXcgU2VwYXJhdG9yKCldO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aW9ucy5sZW5ndGggPyBhY3Rpb25zLnNsaWNlKDAsIGFjdGlvbnMubGVuZ3RoIC0gMSkgOiBhY3Rpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHt0aGlzLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IGluc3RhbGxgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcGVuOiBib29sZWFuLFxuXHRcdEBJTWNwV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5pbnN0YWxsJywgbG9jYWxpemUoJ2luc3RhbGwnLCBcIkluc3RhbGxcIiksIEluc3RhbGxBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBJbnN0YWxsQWN0aW9uLkhJREU7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8uZ2FsbGVyeSAmJiAhdGhpcy5tY3BTZXJ2ZXI/Lmluc3RhbGxhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1jcFNlcnZlci5pbnN0YWxsU3RhdGUgIT09IE1jcFNlcnZlckluc3RhbGxTdGF0ZS5Vbmluc3RhbGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gSW5zdGFsbEFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuY2FuSW5zdGFsbCh0aGlzLm1jcFNlcnZlcikgPT09IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wZW4pIHtcblx0XHRcdHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5vcGVuKHRoaXMubWNwU2VydmVyKTtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdtY3BTZXJ2ZXJJbnN0YWxsYXRpb24nLCBcIkluc3RhbGxpbmcgTUNQIFNlcnZlciB7MH0gc3RhcnRlZC4gQW4gZWRpdG9yIGlzIG5vdyBvcGVuIHdpdGggbW9yZSBkZXRhaWxzIG9uIHRoaXMgTUNQIFNlcnZlclwiLCB0aGlzLm1jcFNlcnZlci5sYWJlbCkpO1xuXHRcdH1cblxuXHRcdHR5cGUgTWNwU2VydmVySW5zdGFsbENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRjb21tZW50OiAnVXNlZCB0byB1bmRlcnN0YW5kIGlmIHRoZSBhY3Rpb24gdG8gaW5zdGFsbCB0aGUgTUNQIHNlcnZlciBpcyB1c2VkLic7XG5cdFx0XHRuYW1lPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBnYWxsZXJ5IG5hbWUgb2YgdGhlIE1DUCBzZXJ2ZXIgYmVpbmcgaW5zdGFsbGVkJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBNY3BTZXJ2ZXJJbnN0YWxsID0ge1xuXHRcdFx0bmFtZT86IHN0cmluZztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPE1jcFNlcnZlckluc3RhbGwsIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbj4oJ21jcDphY3Rpb246aW5zdGFsbCcsIHsgbmFtZTogdGhpcy5tY3BTZXJ2ZXIuZ2FsbGVyeT8ubmFtZSB9KTtcblxuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKHRoaXMubWNwU2VydmVyKTtcblxuXHRcdGF3YWl0IHN0YXJ0U2VydmVyQnlGaWx0ZXIodGhpcy5tY3BTZXJ2aWNlLCBzID0+IHtcblx0XHRcdHJldHVybiBzLmRlZmluaXRpb24ubGFiZWwgPT09IGluc3RhbGxlZC5uYW1lO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsSW5Xb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgaW5zdGFsbGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wZW46IGJvb2xlYW4sXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuaW5zdGFsbFdvcmtzcGFjZScsIGxvY2FsaXplKCdpbnN0YWxsSW5Xb3Jrc3BhY2UnLCBcIkluc3RhbGwgaW4gV29ya3NwYWNlXCIpLCBJbnN0YWxsQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gSW5zdGFsbEluV29ya3NwYWNlQWN0aW9uLkhJREU7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5nYWxsZXJ5ICYmICF0aGlzLm1jcFNlcnZlcj8uaW5zdGFsbGFibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMubWNwU2VydmVyLmluc3RhbGxTdGF0ZSAhPT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLlVuaW5zdGFsbGVkICYmIHRoaXMubWNwU2VydmVyLmxvY2FsPy5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IEluc3RhbGxBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwodGhpcy5tY3BTZXJ2ZXIpID09PSB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcGVuKSB7XG5cdFx0XHR0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub3Blbih0aGlzLm1jcFNlcnZlciwgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0YWxlcnQobG9jYWxpemUoJ21jcFNlcnZlckluc3RhbGxhdGlvbicsIFwiSW5zdGFsbGluZyBNQ1AgU2VydmVyIHswfSBzdGFydGVkLiBBbiBlZGl0b3IgaXMgbm93IG9wZW4gd2l0aCBtb3JlIGRldGFpbHMgb24gdGhpcyBNQ1AgU2VydmVyXCIsIHRoaXMubWNwU2VydmVyLmxhYmVsKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5nZXRDb25maWd1cmF0aW9uVGFyZ2V0KCk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0eXBlIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0Y29tbWVudDogJ1VzZWQgdG8gdW5kZXJzdGFuZCBpZiB0aGUgYWN0aW9uIHRvIGluc3RhbGwgdGhlIE1DUCBzZXJ2ZXIgaXMgdXNlZC4nO1xuXHRcdFx0bmFtZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZ2FsbGVyeSBuYW1lIG9mIHRoZSBNQ1Agc2VydmVyIGJlaW5nIGluc3RhbGxlZCcgfTtcblx0XHR9O1xuXHRcdHR5cGUgTWNwU2VydmVySW5zdGFsbCA9IHtcblx0XHRcdG5hbWU/OiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxNY3BTZXJ2ZXJJbnN0YWxsLCBNY3BTZXJ2ZXJJbnN0YWxsQ2xhc3NpZmljYXRpb24+KCdtY3A6YWN0aW9uOmluc3RhbGw6d29ya3NwYWNlJywgeyBuYW1lOiB0aGlzLm1jcFNlcnZlci5nYWxsZXJ5Py5uYW1lIH0pO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwodGhpcy5tY3BTZXJ2ZXIsIHsgdGFyZ2V0IH0pO1xuXHRcdGF3YWl0IHN0YXJ0U2VydmVyQnlGaWx0ZXIodGhpcy5tY3BTZXJ2aWNlLCBzID0+IHtcblx0XHRcdHJldHVybiBzLmRlZmluaXRpb24ubGFiZWwgPT09IGluc3RhbGxlZC5uYW1lO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRDb25maWd1cmF0aW9uVGFyZ2V0KCk6IFByb21pc2U8Q29uZmlndXJhdGlvblRhcmdldCB8IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ+IHtcblx0XHR0eXBlIE9wdGlvblF1aWNrUGlja0l0ZW0gPSBRdWlja1BpY2tJdGVtICYgeyB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgSVdvcmtzcGFjZUZvbGRlciB9O1xuXHRcdGNvbnN0IG9wdGlvbnM6IE9wdGlvblF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdG9wdGlvbnMucHVzaCh7IHRhcmdldDogZm9sZGVyLCBsYWJlbDogZm9sZGVyLm5hbWUsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5zdGFsbCBpbiB3b3Jrc3BhY2UgZm9sZGVyJywgXCJXb3Jrc3BhY2UgRm9sZGVyXCIpIH0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHRpZiAob3B0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdG9wdGlvbnMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InIH0pO1xuXHRcdFx0fVxuXHRcdFx0b3B0aW9ucy5wdXNoKHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSwgbGFiZWw6IGxvY2FsaXplKCdtY3AudGFyZ2V0LndvcmtzcGFjZScsIFwiV29ya3NwYWNlXCIpIH0pO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnNbMF0udGFyZ2V0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFBpY2sgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2sob3B0aW9ucywge1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AudGFyZ2V0LnRpdGxlJywgXCJDaG9vc2Ugd2hlcmUgdG8gaW5zdGFsbCB0aGUgTUNQIHNlcnZlclwiKSxcblx0XHR9KTtcblxuXHRcdHJldHVybiAodGFyZ2V0UGljayBhcyBPcHRpb25RdWlja1BpY2tJdGVtKT8udGFyZ2V0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsSW5SZW1vdGVBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgaW5zdGFsbGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wZW46IGJvb2xlYW4sXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmluc3RhbGxSZW1vdGUnLCBsb2NhbGl6ZSgnaW5zdGFsbEluUmVtb3RlJywgXCJJbnN0YWxsIChSZW1vdGUpXCIpLCBJbnN0YWxsQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0Y29uc3QgcmVtb3RlTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0dGhpcy5sYWJlbCA9IGxvY2FsaXplKCdpbnN0YWxsSW5SZW1vdGVMYWJlbCcsIFwiSW5zdGFsbCBpbiB7MH1cIiwgcmVtb3RlTGFiZWwpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IEluc3RhbGxJblJlbW90ZUFjdGlvbi5ISURFO1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXI/LmdhbGxlcnkgJiYgIXRoaXMubWNwU2VydmVyPy5pbnN0YWxsYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlICE9PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdGlmICh0aGlzLm1jcFNlcnZlci5sb2NhbD8uc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQobWNwU2VydmVyID0+IG1jcFNlcnZlci5uYW1lID09PSB0aGlzLm1jcFNlcnZlcj8ubmFtZSAmJiBtY3BTZXJ2ZXIubG9jYWw/LnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IEluc3RhbGxBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLmNhbkluc3RhbGwodGhpcy5tY3BTZXJ2ZXIpID09PSB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcGVuKSB7XG5cdFx0XHR0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2Uub3Blbih0aGlzLm1jcFNlcnZlcik7XG5cdFx0XHRhbGVydChsb2NhbGl6ZSgnbWNwU2VydmVySW5zdGFsbGF0aW9uJywgXCJJbnN0YWxsaW5nIE1DUCBTZXJ2ZXIgezB9IHN0YXJ0ZWQuIEFuIGVkaXRvciBpcyBub3cgb3BlbiB3aXRoIG1vcmUgZGV0YWlscyBvbiB0aGlzIE1DUCBTZXJ2ZXJcIiwgdGhpcy5tY3BTZXJ2ZXIubGFiZWwpKTtcblx0XHR9XG5cblx0XHR0eXBlIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2FuZHkwODEnO1xuXHRcdFx0Y29tbWVudDogJ1VzZWQgdG8gdW5kZXJzdGFuZCBpZiB0aGUgYWN0aW9uIHRvIGluc3RhbGwgdGhlIE1DUCBzZXJ2ZXIgaXMgdXNlZC4nO1xuXHRcdFx0bmFtZT86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZ2FsbGVyeSBuYW1lIG9mIHRoZSBNQ1Agc2VydmVyIGJlaW5nIGluc3RhbGxlZCcgfTtcblx0XHR9O1xuXHRcdHR5cGUgTWNwU2VydmVySW5zdGFsbCA9IHtcblx0XHRcdG5hbWU/OiBzdHJpbmc7XG5cdFx0fTtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxNY3BTZXJ2ZXJJbnN0YWxsLCBNY3BTZXJ2ZXJJbnN0YWxsQ2xhc3NpZmljYXRpb24+KCdtY3A6YWN0aW9uOmluc3RhbGw6cmVtb3RlJywgeyBuYW1lOiB0aGlzLm1jcFNlcnZlci5nYWxsZXJ5Py5uYW1lIH0pO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwodGhpcy5tY3BTZXJ2ZXIsIHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFIH0pO1xuXHRcdGF3YWl0IHN0YXJ0U2VydmVyQnlGaWx0ZXIodGhpcy5tY3BTZXJ2aWNlLCBzID0+IHtcblx0XHRcdHJldHVybiBzLmRlZmluaXRpb24ubGFiZWwgPT09IGluc3RhbGxlZC5uYW1lO1xuXHRcdH0pO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxpbmdMYWJlbEFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnaW5zdGFsbGluZycsIFwiSW5zdGFsbGluZ1wiKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHtNY3BTZXJ2ZXJBY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBpbnN0YWxsIGluc3RhbGxpbmdgO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb24uaW5zdGFsbGluZycsIEluc3RhbGxpbmdMYWJlbEFjdGlvbi5MQUJFTCwgSW5zdGFsbGluZ0xhYmVsQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGFzcyA9IGAke0luc3RhbGxpbmdMYWJlbEFjdGlvbi5DTEFTU30ke3RoaXMubWNwU2VydmVyICYmIHRoaXMubWNwU2VydmVyLmluc3RhbGxTdGF0ZSA9PT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxpbmcgPyAnJyA6ICcgaGlkZSd9YDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5pbnN0YWxsQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHt0aGlzLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IHVuaW5zdGFsbGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFdvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BXb3JrYmVuY2hTZXJ2aWNlOiBJTWNwV29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMudW5pbnN0YWxsJywgbG9jYWxpemUoJ3VuaW5zdGFsbCcsIFwiVW5pbnN0YWxsXCIpLCBVbmluc3RhbGxBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBVbmluc3RhbGxBY3Rpb24uSElERTtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMubWNwU2VydmVyLmluc3RhbGxTdGF0ZSAhPT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2xhc3MgPSBVbmluc3RhbGxBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ3VuaW5zdGFsbCcsIFwiVW5pbnN0YWxsXCIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLnVuaW5zdGFsbCh0aGlzLm1jcFNlcnZlcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVuYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnbWNwU2VydmVyLmVuYWJsZUdsb2JhbGx5JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRW5hYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24uSUQsIGxvY2FsaXplKCdlbmFibGVHbG9iYWxseScsIFwiRW5hYmxlXCIpLCBNY3BTZXJ2ZXJBY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZW5hYmxlR2xvYmFsbHlUb29sdGlwJywgXCJFbmFibGUgdGhpcyBNQ1Agc2VydmVyXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVtZW50ID0gc2VydmVyLmVuYWJsZW1lbnQuZ2V0KCk7XG5cdFx0dGhpcy5lbmFibGVkID0gaXNDb250cmlidXRpb25EaXNhYmxlZChlbmFibGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZCh0aGlzLm1jcFNlcnZlci5pZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnbWNwU2VydmVyLmVuYWJsZUZvcldvcmtzcGFjZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRW5hYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uLklELCBsb2NhbGl6ZSgnZW5hYmxlRm9yV29ya3NwYWNlJywgXCJFbmFibGUgKFdvcmtzcGFjZSlcIiksIE1jcFNlcnZlckFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdlbmFibGVGb3JXb3Jrc3BhY2VUb29sdGlwJywgXCJFbmFibGUgdGhpcyBNQ1Agc2VydmVyIG9ubHkgaW4gdGhpcyB3b3Jrc3BhY2VcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHRoaXMubWNwU2VydmVyPy5pZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlbWVudCA9IHNlcnZlci5lbmFibGVtZW50LmdldCgpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IGlzQ29udHJpYnV0aW9uRGlzYWJsZWQoZW5hYmxlbWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1jcFNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQodGhpcy5tY3BTZXJ2ZXIuaWQsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnbWNwU2VydmVyLmRpc2FibGVHbG9iYWxseSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKERpc2FibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbi5JRCwgbG9jYWxpemUoJ2Rpc2FibGVHbG9iYWxseScsIFwiRGlzYWJsZVwiKSwgTWNwU2VydmVyQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2Rpc2FibGVHbG9iYWxseVRvb2x0aXAnLCBcIkRpc2FibGUgdGhpcyBNQ1Agc2VydmVyXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVtZW50ID0gc2VydmVyLmVuYWJsZW1lbnQuZ2V0KCk7XG5cdFx0dGhpcy5lbmFibGVkID0gaXNDb250cmlidXRpb25FbmFibGVkKGVuYWJsZW1lbnQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5tY3BTZXJ2aWNlLmVuYWJsZW1lbnRNb2RlbC5zZXRFbmFibGVkKHRoaXMubWNwU2VydmVyLmlkLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZU1jcFNlcnZlckZvcldvcmtzcGFjZUFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ21jcFNlcnZlci5kaXNhYmxlRm9yV29ya3NwYWNlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihEaXNhYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uLklELCBsb2NhbGl6ZSgnZGlzYWJsZUZvcldvcmtzcGFjZScsIFwiRGlzYWJsZSAoV29ya3NwYWNlKVwiKSwgTWNwU2VydmVyQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2Rpc2FibGVGb3JXb3Jrc3BhY2VUb29sdGlwJywgXCJEaXNhYmxlIHRoaXMgTUNQIHNlcnZlciBvbmx5IGluIHRoaXMgd29ya3NwYWNlXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBzZXJ2ZXIuZW5hYmxlbWVudC5nZXQoKTtcblx0XHR0aGlzLmVuYWJsZWQgPSBpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1jcFNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQodGhpcy5tY3BTZXJ2ZXIuaWQsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVuYWJsZU1jcERyb3BEb3duQWN0aW9uIGV4dGVuZHMgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdtY3BTZXJ2ZXIuZW5hYmxlJywgTWNwU2VydmVyQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUywgW1xuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZU1jcFNlcnZlckZvcldvcmtzcGFjZUFjdGlvbiksXG5cdFx0XHRdXG5cdFx0XSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVNY3BEcm9wRG93bkFjdGlvbiBleHRlbmRzIEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignbWNwU2VydmVyLmRpc2FibGUnLCBNY3BTZXJ2ZXJBY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTLCBbXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24pLFxuXHRcdFx0XVxuXHRcdF0pO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250ZXh0TWVudUFjdGlvbnMobWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyLCBpc0VkaXRvckFjdGlvbjogYm9vbGVhbiwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IElBY3Rpb25bXVtdIHtcblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzOiBNY3BTZXJ2ZXJBY3Rpb25bXVtdID0gW107XG5cdFx0Y29uc3QgaXNJbnN0YWxsZWQgPSBtY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlID09PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuSW5zdGFsbGVkO1xuXG5cdFx0aWYgKGlzSW5zdGFsbGVkKSB7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YXJ0U2VydmVyQWN0aW9uKSxcblx0XHRcdF0pO1xuXHRcdFx0Z3JvdXBzLnB1c2goW1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdG9wU2VydmVyQWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzdGFydFNlcnZlckFjdGlvbiksXG5cdFx0XHRdKTtcblx0XHRcdGdyb3Vwcy5wdXNoKFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uKSxcblx0XHRcdF0pO1xuXHRcdFx0Z3JvdXBzLnB1c2goW1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXRoU2VydmVyQWN0aW9uKSxcblx0XHRcdF0pO1xuXHRcdFx0Z3JvdXBzLnB1c2goW1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaG93U2VydmVyT3V0cHV0QWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hvd1NlcnZlckNvbmZpZ3VyYXRpb25BY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaG93U2VydmVySnNvbkNvbmZpZ3VyYXRpb25BY3Rpb24pLFxuXHRcdFx0XSk7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbmZpZ3VyZU1vZGVsQWNjZXNzQWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hvd1NhbXBsaW5nUmVxdWVzdHNBY3Rpb24pLFxuXHRcdFx0XSk7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyb3dzZVJlc291cmNlc0FjdGlvbiksXG5cdFx0XHRdKTtcblx0XHRcdGlmICghaXNFZGl0b3JBY3Rpb24pIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFsbEdyb3VwOiBNY3BTZXJ2ZXJBY3Rpb25bXSA9IFtpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbmluc3RhbGxBY3Rpb24pXTtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdFx0XHRpbnN0YWxsR3JvdXAucHVzaChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsSW5Xb3Jrc3BhY2VBY3Rpb24sIGZhbHNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgJiYgbWNwU2VydmVyLmxvY2FsPy5zY29wZSAhPT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKSB7XG5cdFx0XHRcdFx0aW5zdGFsbEdyb3VwLnB1c2goaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEluUmVtb3RlQWN0aW9uLCBmYWxzZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyb3Vwcy5wdXNoKGluc3RhbGxHcm91cCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluc3RhbGxHcm91cCA9IFtdO1xuXHRcdFx0aWYgKHdvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdFx0aW5zdGFsbEdyb3VwLnB1c2goaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEluV29ya3NwYWNlQWN0aW9uLCAhaXNFZGl0b3JBY3Rpb24pKTtcblx0XHRcdH1cblx0XHRcdGlmIChlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdGluc3RhbGxHcm91cC5wdXNoKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxJblJlbW90ZUFjdGlvbiwgIWlzRWRpdG9yQWN0aW9uKSk7XG5cdFx0XHR9XG5cdFx0XHRncm91cHMucHVzaChpbnN0YWxsR3JvdXApO1xuXHRcdH1cblx0XHRncm91cHMuZm9yRWFjaChncm91cCA9PiBncm91cC5mb3JFYWNoKGV4dGVuc2lvbkFjdGlvbiA9PiBleHRlbnNpb25BY3Rpb24ubWNwU2VydmVyID0gbWNwU2VydmVyKSk7XG5cblx0XHRyZXR1cm4gZ3JvdXBzO1xuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIE1hbmFnZU1jcFNlcnZlckFjdGlvbiBleHRlbmRzIERyb3BEb3duQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnbWNwU2VydmVyLm1hbmFnZSc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ2xhc3MgPSBgJHtNY3BTZXJ2ZXJBY3Rpb24uSUNPTl9BQ1RJT05fQ0xBU1N9IG1hbmFnZSBgICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKG1hbmFnZUV4dGVuc2lvbkljb24pO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBIaWRlTWFuYWdlRXh0ZW5zaW9uQ2xhc3MgPSBgJHt0aGlzLkNsYXNzfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzRWRpdG9yQWN0aW9uOiBib29sZWFuLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cblx0XHRzdXBlcihNYW5hZ2VNY3BTZXJ2ZXJBY3Rpb24uSUQsICcnLCAnJywgdHJ1ZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdtYW5hZ2UnLCBcIk1hbmFnZVwiKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBzdXBlci5ydW4odGhpcy5tY3BTZXJ2ZXIgPyBnZXRDb250ZXh0TWVudUFjdGlvbnModGhpcy5tY3BTZXJ2ZXIsIHRoaXMuaXNFZGl0b3JBY3Rpb24sIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpIDogW10pO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xhc3MgPSBNYW5hZ2VNY3BTZXJ2ZXJBY3Rpb24uSGlkZU1hbmFnZUV4dGVuc2lvbkNsYXNzO1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaXNFZGl0b3JBY3Rpb24pIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0XHR0aGlzLmNsYXNzID0gTWFuYWdlTWNwU2VydmVyQWN0aW9uLkNsYXNzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSAhIXRoaXMubWNwU2VydmVyLmxvY2FsO1xuXHRcdFx0dGhpcy5jbGFzcyA9IHRoaXMuZW5hYmxlZCA/IE1hbmFnZU1jcFNlcnZlckFjdGlvbi5DbGFzcyA6IE1hbmFnZU1jcFNlcnZlckFjdGlvbi5IaWRlTWFuYWdlRXh0ZW5zaW9uQ2xhc3M7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFydFNlcnZlckFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBzdGFydGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuc3RhcnQnLCBsb2NhbGl6ZSgnc3RhcnQnLCBcIlN0YXJ0IFNlcnZlclwiKSwgU3RhcnRTZXJ2ZXJBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBTdGFydFNlcnZlckFjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyU3RhdGUgPSBzZXJ2ZXIuY29ubmVjdGlvblN0YXRlLmdldCgpO1xuXHRcdGlmICghTWNwQ29ubmVjdGlvblN0YXRlLmNhbkJlU3RhcnRlZChzZXJ2ZXJTdGF0ZS5zdGF0ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IFN0YXJ0U2VydmVyQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5sYWJlbCA9IGxvY2FsaXplKCdzdGFydCcsIFwiU3RhcnQgU2VydmVyXCIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgc2VydmVyLnN0YXJ0KHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnIH0pO1xuXHRcdHNlcnZlci5zaG93T3V0cHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlcnZlcigpOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHRoaXMubWNwU2VydmVyPy5pZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0b3BTZXJ2ZXJBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgc3RvcGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuc3RvcCcsIGxvY2FsaXplKCdzdG9wJywgXCJTdG9wIFNlcnZlclwiKSwgU3RvcFNlcnZlckFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFN0b3BTZXJ2ZXJBY3Rpb24uSElERTtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcigpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlcnZlclN0YXRlID0gc2VydmVyLmNvbm5lY3Rpb25TdGF0ZS5nZXQoKTtcblx0XHRpZiAoTWNwQ29ubmVjdGlvblN0YXRlLmNhbkJlU3RhcnRlZChzZXJ2ZXJTdGF0ZS5zdGF0ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IFN0b3BTZXJ2ZXJBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ3N0b3AnLCBcIlN0b3AgU2VydmVyXCIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgc2VydmVyLnN0b3AoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVyKCk6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVzdGFydFNlcnZlckFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCByZXN0YXJ0YDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5yZXN0YXJ0JywgbG9jYWxpemUoJ3Jlc3RhcnQnLCBcIlJlc3RhcnQgU2VydmVyXCIpLCBSZXN0YXJ0U2VydmVyQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gUmVzdGFydFNlcnZlckFjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyU3RhdGUgPSBzZXJ2ZXIuY29ubmVjdGlvblN0YXRlLmdldCgpO1xuXHRcdGlmIChNY3BDb25uZWN0aW9uU3RhdGUuY2FuQmVTdGFydGVkKHNlcnZlclN0YXRlLnN0YXRlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gUmVzdGFydFNlcnZlckFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMubGFiZWwgPSBsb2NhbGl6ZSgncmVzdGFydCcsIFwiUmVzdGFydCBTZXJ2ZXJcIik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHRcdGF3YWl0IHNlcnZlci5zdGFydCh7IHByb21wdFR5cGU6ICdhbGwtdW50cnVzdGVkJyB9KTtcblx0XHRzZXJ2ZXIuc2hvd091dHB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJ2ZXIoKTogSU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBdXRoU2VydmVyQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHt0aGlzLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IGFjY291bnRgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0lHTl9PVVQgPSBsb2NhbGl6ZSgnbWNwLnNpZ25PdXQnLCAnU2lnbiBPdXQnKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRElTQ09OTkVDVCA9IGxvY2FsaXplKCdtY3AuZGlzY29ubmVjdCcsICdEaXNjb25uZWN0IEFjY291bnQnKTtcblxuXHRwcml2YXRlIF9hY2NvdW50UXVlcnk6IElBY2NvdW50UXVlcnkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZTogSUF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5yZXN0YXJ0JywgbG9jYWxpemUoJ3Jlc3RhcnQnLCBcIlJlc3RhcnQgU2VydmVyXCIpLCBSZXN0YXJ0U2VydmVyQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gQXV0aFNlcnZlckFjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWNjb3VudFF1ZXJ5ID0gdGhpcy5nZXRBY2NvdW50UXVlcnkoKTtcblx0XHRpZiAoIWFjY291bnRRdWVyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hY2NvdW50UXVlcnkgPSBhY2NvdW50UXVlcnk7XG5cdFx0dGhpcy5jbGFzcyA9IEF1dGhTZXJ2ZXJBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRsZXQgbGFiZWwgPSBhY2NvdW50UXVlcnkuZW50aXRpZXMoKS5nZXRFbnRpdHlDb3VudCgpLnRvdGFsID4gMSA/IEF1dGhTZXJ2ZXJBY3Rpb24uRElTQ09OTkVDVCA6IEF1dGhTZXJ2ZXJBY3Rpb24uU0lHTl9PVVQ7XG5cdFx0bGFiZWwgKz0gYCAoJHthY2NvdW50UXVlcnkuYWNjb3VudE5hbWV9KWA7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWNjb3VudFF1ZXJ5ID0gdGhpcy5nZXRBY2NvdW50UXVlcnkoKTtcblx0XHRpZiAoIWFjY291bnRRdWVyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHRcdGNvbnN0IHsgcHJvdmlkZXJJZCwgYWNjb3VudE5hbWUgfSA9IGFjY291bnRRdWVyeTtcblx0XHRhY2NvdW50UXVlcnkubWNwU2VydmVyKHNlcnZlci5kZWZpbml0aW9uLmlkKS5zZXRBY2Nlc3NBbGxvd2VkKGZhbHNlLCBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCk7XG5cdFx0aWYgKHRoaXMubGFiZWwgPT09IEF1dGhTZXJ2ZXJBY3Rpb24uU0lHTl9PVVQpIHtcblx0XHRcdGNvbnN0IGFjY291bnRzID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldEFjY291bnRzKHByb3ZpZGVySWQpO1xuXHRcdFx0Y29uc3QgYWNjb3VudCA9IGFjY291bnRzLmZpbmQoYSA9PiBhLmxhYmVsID09PSBhY2NvdW50TmFtZSk7XG5cdFx0XHRpZiAoYWNjb3VudCkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCB1bmRlZmluZWQsIHsgYWNjb3VudCB9KTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLnJlbW92ZVNlc3Npb24ocHJvdmlkZXJJZCwgc2Vzc2lvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFNlcnZlcigpOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHRoaXMubWNwU2VydmVyPy5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjY291bnRRdWVyeSgpOiBJQWNjb3VudFF1ZXJ5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcigpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYWNjb3VudFF1ZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWNjb3VudFF1ZXJ5O1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXJJZCA9IHNlcnZlci5kZWZpbml0aW9uLmlkO1xuXHRcdGNvbnN0IHByZWZlcmVuY2VzID0gdGhpcy5fYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UubWNwU2VydmVyKHNlcnZlcklkKS5nZXRBbGxBY2NvdW50UHJlZmVyZW5jZXMoKTtcblx0XHRpZiAoIXByZWZlcmVuY2VzLnNpemUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW3Byb3ZpZGVySWQsIGFjY291bnROYW1lXSBvZiBwcmVmZXJlbmNlcykge1xuXHRcdFx0Y29uc3QgYWNjb3VudFF1ZXJ5ID0gdGhpcy5fYXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UucHJvdmlkZXIocHJvdmlkZXJJZCkuYWNjb3VudChhY2NvdW50TmFtZSk7XG5cdFx0XHRpZiAoIWFjY291bnRRdWVyeS5tY3BTZXJ2ZXIoc2VydmVySWQpLmlzQWNjZXNzQWxsb3dlZCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBza2lwIGFjY291bnRzIHRoYXQgYXJlIG5vdCBhbGxvd2VkXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYWNjb3VudFF1ZXJ5O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dTZXJ2ZXJPdXRwdXRBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgb3V0cHV0YDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5vdXRwdXQnLCBsb2NhbGl6ZSgnb3V0cHV0JywgXCJTaG93IE91dHB1dFwiKSwgU2hvd1NlcnZlck91dHB1dEFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTZXJ2ZXJPdXRwdXRBY3Rpb24uSElERTtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcigpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2xhc3MgPSBTaG93U2VydmVyT3V0cHV0QWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5sYWJlbCA9IGxvY2FsaXplKCdvdXRwdXQnLCBcIlNob3cgT3V0cHV0XCIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2VydmVyLnNob3dPdXRwdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVyKCk6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd1NlcnZlckNvbmZpZ3VyYXRpb25BY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgY29uZmlnYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmNvbmZpZycsIGxvY2FsaXplKCdjb25maWcnLCBcIlNob3cgQ29uZmlndXJhdGlvblwiKSwgU2hvd1NlcnZlckNvbmZpZ3VyYXRpb25BY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBTaG93U2VydmVyQ29uZmlndXJhdGlvbkFjdGlvbi5ISURFO1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXI/LmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2xhc3MgPSBTaG93U2VydmVyQ29uZmlndXJhdGlvbkFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXI/LmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5vcGVuKHRoaXMubWNwU2VydmVyLCB7IHRhYjogTWNwU2VydmVyRWRpdG9yVGFiLkNvbmZpZ3VyYXRpb24gfSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgU2hvd1NlcnZlckpzb25Db25maWd1cmF0aW9uQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHt0aGlzLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IGNvbmZpZ2A7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASU1jcFJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgbWNwUmVnaXN0cnk6IElNY3BSZWdpc3RyeSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuanNvbkNvbmZpZycsIGxvY2FsaXplKCdjb25maWdKc29uJywgXCJTaG93IENvbmZpZ3VyYXRpb24gKEpTT04pXCIpLCBTaG93U2VydmVySnNvbkNvbmZpZ3VyYXRpb25BY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBTaG93U2VydmVySnNvbkNvbmZpZ3VyYXRpb25BY3Rpb24uSElERTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uVGFyZ2V0ID0gdGhpcy5nZXRDb25maWd1cmF0aW9uVGFyZ2V0KCk7XG5cdFx0aWYgKCFjb25maWd1cmF0aW9uVGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2xhc3MgPSBTaG93U2VydmVyQ29uZmlndXJhdGlvbkFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25UYXJnZXQgPSB0aGlzLmdldENvbmZpZ3VyYXRpb25UYXJnZXQoKTtcblx0XHRpZiAoIWNvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5pc1VyaShjb25maWd1cmF0aW9uVGFyZ2V0KSA/IGNvbmZpZ3VyYXRpb25UYXJnZXQgOiBjb25maWd1cmF0aW9uVGFyZ2V0IS51cmksXG5cdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogVVJJLmlzVXJpKGNvbmZpZ3VyYXRpb25UYXJnZXQpID8gdW5kZWZpbmVkIDogY29uZmlndXJhdGlvblRhcmdldCEucmFuZ2UgfVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWd1cmF0aW9uVGFyZ2V0KCk6IExvY2F0aW9uIHwgVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5sYWJlbCA9PT0gdGhpcy5tY3BTZXJ2ZXI/Lm5hbWUpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbGxlY3Rpb24gPSB0aGlzLm1jcFJlZ2lzdHJ5LmNvbGxlY3Rpb25zLmdldCgpLmZpbmQoYyA9PiBjLmlkID09PSBzZXJ2ZXIuY29sbGVjdGlvbi5pZCk7XG5cdFx0Y29uc3Qgc2VydmVyRGVmaW5pdGlvbiA9IGNvbGxlY3Rpb24/LnNlcnZlckRlZmluaXRpb25zLmdldCgpLmZpbmQocyA9PiBzLmlkID09PSBzZXJ2ZXIuZGVmaW5pdGlvbi5pZCk7XG5cdFx0cmV0dXJuIHNlcnZlckRlZmluaXRpb24/LnByZXNlbnRhdGlvbj8ub3JpZ2luIHx8IGNvbGxlY3Rpb24/LnByZXNlbnRhdGlvbj8ub3JpZ2luO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmVNb2RlbEFjY2Vzc0FjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBjb25maWdgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmNvbmZpZycsIGxvY2FsaXplKCdtY3AuY29uZmlnQWNjZXNzJywgJ0NvbmZpZ3VyZSBNb2RlbCBBY2Nlc3MnKSwgQ29uZmlndXJlTW9kZWxBY2Nlc3NBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBDb25maWd1cmVNb2RlbEFjY2Vzc0FjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IENvbmZpZ3VyZU1vZGVsQWNjZXNzQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5sYWJlbCA9IGxvY2FsaXplKCdtY3AuY29uZmlnQWNjZXNzJywgJ0NvbmZpZ3VyZSBNb2RlbCBBY2Nlc3MnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcigpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5Db25maWd1cmVTYW1wbGluZ01vZGVscywgc2VydmVyKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVyKCk6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd1NhbXBsaW5nUmVxdWVzdHNBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgY29uZmlnYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJTWNwU2FtcGxpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2FtcGxpbmdTZXJ2aWNlOiBJTWNwU2FtcGxpbmdTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5jb25maWcnLCBsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nTG9nJywgJ1Nob3cgU2FtcGxpbmcgUmVxdWVzdHMnKSwgU2hvd1NhbXBsaW5nUmVxdWVzdHNBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBTaG93U2FtcGxpbmdSZXF1ZXN0c0FjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnNhbXBsaW5nU2VydmljZS5oYXNMb2dzKHNlcnZlcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTYW1wbGluZ1JlcXVlc3RzQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuc2FtcGxpbmdTZXJ2aWNlLmhhc0xvZ3Moc2VydmVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0Y29udGVudHM6IHRoaXMuc2FtcGxpbmdTZXJ2aWNlLmdldExvZ1RleHQoc2VydmVyKSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNhbXBsaW5nTG9nLnRpdGxlJywgJ01DUCBTYW1wbGluZzogezB9Jywgc2VydmVyLmRlZmluaXRpb24ubGFiZWwpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJ2ZXIoKTogSU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VSZXNvdXJjZXNBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgY29uZmlnYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5jb25maWcnLCBsb2NhbGl6ZSgnbWNwLnJlc291cmNlcycsICdCcm93c2UgUmVzb3VyY2VzJyksIEJyb3dzZVJlc291cmNlc0FjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IEJyb3dzZVJlc291cmNlc0FjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc2VydmVyLmNhcGFiaWxpdGllcy5nZXQoKTtcblx0XHRpZiAoY2FwYWJpbGl0aWVzICE9PSB1bmRlZmluZWQgJiYgIShjYXBhYmlsaXRpZXMgJiBNY3BDYXBhYmlsaXR5LlJlc291cmNlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IEJyb3dzZVJlc291cmNlc0FjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc2VydmVyLmNhcGFiaWxpdGllcy5nZXQoKTtcblx0XHRpZiAoY2FwYWJpbGl0aWVzICE9PSB1bmRlZmluZWQgJiYgIShjYXBhYmlsaXRpZXMgJiBNY3BDYXBhYmlsaXR5LlJlc291cmNlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWNwQ29tbWFuZElkcy5Ccm93c2VSZXNvdXJjZXMsIHNlcnZlcik7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlcnZlcigpOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHRoaXMubWNwU2VydmVyPy5pZCk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgTWNwU2VydmVyU3RhdHVzID0geyByZWFkb25seSBtZXNzYWdlOiBJTWFya2Rvd25TdHJpbmc7IHJlYWRvbmx5IGljb24/OiBUaGVtZUljb24gfTtcblxuZXhwb3J0IGNsYXNzIE1jcFNlcnZlclN0YXR1c0FjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHtNY3BTZXJ2ZXJBY3Rpb24uSUNPTl9BQ1RJT05fQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXNgO1xuXG5cdHByaXZhdGUgX3N0YXR1czogTWNwU2VydmVyU3RhdHVzW10gPSBbXTtcblx0Z2V0IHN0YXR1cygpOiBNY3BTZXJ2ZXJTdGF0dXNbXSB7IHJldHVybiB0aGlzLl9zdGF0dXM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN0YXR1cyA9IHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5zdGF0dXMnLCAnJywgYCR7TWNwU2VydmVyU3RhdHVzQWN0aW9uLkNMQVNTfSBoaWRlYCwgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wdXRlQW5kVXBkYXRlU3RhdHVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVBbmRVcGRhdGVTdGF0dXMoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVTdGF0dXModW5kZWZpbmVkLCB0cnVlKTtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoKHRoaXMubWNwU2VydmVyLmdhbGxlcnkgfHwgdGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbGFibGUpICYmIHRoaXMubWNwU2VydmVyLmluc3RhbGxTdGF0ZSA9PT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuY2FuSW5zdGFsbCh0aGlzLm1jcFNlcnZlcik7XG5cdFx0XHRpZiAocmVzdWx0ICE9PSB0cnVlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IHJlc3VsdCB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJ1bnRpbWVTdGF0ZSA9IHRoaXMubWNwU2VydmVyLnJ1bnRpbWVTdGF0dXM7XG5cdFx0aWYgKHJ1bnRpbWVTdGF0ZT8ubWVzc2FnZSkge1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiBydW50aW1lU3RhdGUubWVzc2FnZS5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuV2FybmluZyA/IHdhcm5pbmdJY29uIDogcnVudGltZVN0YXRlLm1lc3NhZ2Uuc2V2ZXJpdHkgPT09IFNldmVyaXR5LkVycm9yID8gZXJyb3JJY29uIDogaW5mb0ljb24sIG1lc3NhZ2U6IHJ1bnRpbWVTdGF0ZS5tZXNzYWdlLnRleHQgfSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0dXMoc3RhdHVzOiBNY3BTZXJ2ZXJTdGF0dXMgfCB1bmRlZmluZWQsIHVwZGF0ZUNsYXNzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0aWYgKHRoaXMuX3N0YXR1cy5zb21lKHMgPT4gcy5tZXNzYWdlLnZhbHVlID09PSBzdGF0dXMubWVzc2FnZS52YWx1ZSAmJiBzLmljb24/LmlkID09PSBzdGF0dXMuaWNvbj8uaWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuX3N0YXR1cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhdHVzID0gW107XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0dGhpcy5fc3RhdHVzLnB1c2goc3RhdHVzKTtcblx0XHRcdHRoaXMuX3N0YXR1cy5zb3J0KChhLCBiKSA9PlxuXHRcdFx0XHRiLmljb24gPT09IHRydXN0SWNvbiA/IC0xIDpcblx0XHRcdFx0XHRhLmljb24gPT09IHRydXN0SWNvbiA/IDEgOlxuXHRcdFx0XHRcdFx0Yi5pY29uID09PSBlcnJvckljb24gPyAtMSA6XG5cdFx0XHRcdFx0XHRcdGEuaWNvbiA9PT0gZXJyb3JJY29uID8gMSA6XG5cdFx0XHRcdFx0XHRcdFx0Yi5pY29uID09PSB3YXJuaW5nSWNvbiA/IC0xIDpcblx0XHRcdFx0XHRcdFx0XHRcdGEuaWNvbiA9PT0gd2FybmluZ0ljb24gPyAxIDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0Yi5pY29uID09PSBpbmZvSWNvbiA/IC0xIDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhLmljb24gPT09IGluZm9JY29uID8gMSA6XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQwXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVDbGFzcykge1xuXHRcdFx0aWYgKHN0YXR1cz8uaWNvbiA9PT0gZXJyb3JJY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24uQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXMtZXJyb3IgJHtUaGVtZUljb24uYXNDbGFzc05hbWUoZXJyb3JJY29uKX1gO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3RhdHVzPy5pY29uID09PSB3YXJuaW5nSWNvbikge1xuXHRcdFx0XHR0aGlzLmNsYXNzID0gYCR7TWNwU2VydmVyU3RhdHVzQWN0aW9uLkNMQVNTfSBleHRlbnNpb24tc3RhdHVzLXdhcm5pbmcgJHtUaGVtZUljb24uYXNDbGFzc05hbWUod2FybmluZ0ljb24pfWA7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdGF0dXM/Lmljb24gPT09IGluZm9JY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24uQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXMtaW5mbyAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShpbmZvSWNvbil9YDtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKHN0YXR1cz8uaWNvbiA9PT0gdHJ1c3RJY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24uQ0xBU1N9ICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHRydXN0SWNvbil9YDtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNsYXNzID0gYCR7TWNwU2VydmVyU3RhdHVzQWN0aW9uLkNMQVNTfSBoaWRlYDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZmlyZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdGF0dXNbMF0/Lmljb24gPT09IHRydXN0SWNvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC50cnVzdC5tYW5hZ2UnKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBOEM7QUFDdkQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsUUFBcUMsaUJBQWlCO0FBQy9ELFNBQVMsU0FBUyxhQUFhO0FBRS9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUF3QixtQ0FBbUM7QUFDM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXLFVBQVUscUJBQXFCLFdBQVcsbUJBQW1CO0FBQ2pGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXNELGFBQWEsc0JBQTJDLGVBQWUsb0JBQW9CLG9CQUFvQiw2QkFBNkI7QUFDM00sU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBNEMsc0JBQXNCO0FBQzNFLFNBQVMsMEJBQXlDO0FB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
