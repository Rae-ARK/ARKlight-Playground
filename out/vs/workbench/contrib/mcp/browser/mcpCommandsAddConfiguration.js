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
import { mapFindFirst } from "../../../../base/common/arraysFind.js";
import { assertNever } from "../../../../base/common/assert.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { parse as parseJsonc } from "../../../../base/common/jsonc.js";
import { mnemonicButtonLabel } from "../../../../base/common/labels.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { McpServerType } from "../../../../platform/mcp/common/mcpPlatformTypes.js";
import { RegistryType } from "../../../../platform/mcp/common/mcpManagement.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isWorkspaceFolder, IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IWorkbenchMcpManagementService } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IAgentHostCustomizationService } from "../../chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { isAgentHostTarget } from "../../chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../chat/common/model/chatUri.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { allDiscoverySources, mcpDiscoverySection, mcpStdioServerSchema } from "../common/mcpConfiguration.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { IMcpService, McpConnectionState } from "../common/mcpTypes.js";
import { ILogService } from "../../../../platform/log/common/log.js";
var AddConfigurationType = /* @__PURE__ */ ((AddConfigurationType2) => {
  AddConfigurationType2[AddConfigurationType2["Stdio"] = 0] = "Stdio";
  AddConfigurationType2[AddConfigurationType2["HTTP"] = 1] = "HTTP";
  AddConfigurationType2[AddConfigurationType2["NpmPackage"] = 2] = "NpmPackage";
  AddConfigurationType2[AddConfigurationType2["PipPackage"] = 3] = "PipPackage";
  AddConfigurationType2[AddConfigurationType2["NuGetPackage"] = 4] = "NuGetPackage";
  AddConfigurationType2[AddConfigurationType2["DockerImage"] = 5] = "DockerImage";
  return AddConfigurationType2;
})(AddConfigurationType || {});
const AssistedTypes = {
  [2 /* NpmPackage */]: {
    title: localize("mcp.npm.title", "Enter NPM Package Name"),
    placeholder: localize("mcp.npm.placeholder", "Package name (e.g., @org/package)"),
    pickLabel: localize("mcp.serverType.npm", "NPM Package"),
    pickDescription: localize("mcp.serverType.npm.description", "Install from an NPM package name"),
    enabledConfigKey: null
    // always enabled
  },
  [3 /* PipPackage */]: {
    title: localize("mcp.pip.title", "Enter Pip Package Name"),
    placeholder: localize("mcp.pip.placeholder", "Package name (e.g., package-name)"),
    pickLabel: localize("mcp.serverType.pip", "Pip Package"),
    pickDescription: localize("mcp.serverType.pip.description", "Install from a Pip package name"),
    enabledConfigKey: null
    // always enabled
  },
  [4 /* NuGetPackage */]: {
    title: localize("mcp.nuget.title", "Enter NuGet Package Name"),
    placeholder: localize("mcp.nuget.placeholder", "Package name (e.g., Package.Name)"),
    pickLabel: localize("mcp.serverType.nuget", "NuGet Package"),
    pickDescription: localize("mcp.serverType.nuget.description", "Install from a NuGet package name"),
    enabledConfigKey: "chat.mcp.assisted.nuget.enabled"
  },
  [5 /* DockerImage */]: {
    title: localize("mcp.docker.title", "Enter Docker Image Name"),
    placeholder: localize("mcp.docker.placeholder", "Image name (e.g., mcp/imagename)"),
    pickLabel: localize("mcp.serverType.docker", "Docker Image"),
    pickDescription: localize("mcp.serverType.docker.description", "Install from a Docker image"),
    enabledConfigKey: null
    // always enabled
  }
};
var AddConfigurationCopilotCommand = /* @__PURE__ */ ((AddConfigurationCopilotCommand2) => {
  AddConfigurationCopilotCommand2["IsSupported"] = "github.copilot.chat.mcp.setup.check";
  AddConfigurationCopilotCommand2["ValidatePackage"] = "github.copilot.chat.mcp.setup.validatePackage";
  AddConfigurationCopilotCommand2["StartFlow"] = "github.copilot.chat.mcp.setup.flow";
  return AddConfigurationCopilotCommand2;
})(AddConfigurationCopilotCommand || {});
let McpAddConfigurationCommand = class {
  constructor(workspaceFolder, _quickInputService, _mcpManagementService, _workspaceService, _environmentService, _commandService, _mcpRegistry, _openerService, _editorService, _fileService, _notificationService, _telemetryService, _mcpService, _label, _configurationService, _agentHostCustomizations, _chatWidgetService) {
    this.workspaceFolder = workspaceFolder;
    this._quickInputService = _quickInputService;
    this._mcpManagementService = _mcpManagementService;
    this._workspaceService = _workspaceService;
    this._environmentService = _environmentService;
    this._commandService = _commandService;
    this._mcpRegistry = _mcpRegistry;
    this._openerService = _openerService;
    this._editorService = _editorService;
    this._fileService = _fileService;
    this._notificationService = _notificationService;
    this._telemetryService = _telemetryService;
    this._mcpService = _mcpService;
    this._label = _label;
    this._configurationService = _configurationService;
    this._agentHostCustomizations = _agentHostCustomizations;
    this._chatWidgetService = _chatWidgetService;
  }
  async getServerType() {
    const items = [
      { kind: 0 /* Stdio */, label: localize("mcp.serverType.command", "Command (stdio)"), description: localize("mcp.serverType.command.description", "Run a local command that implements the MCP protocol") },
      { kind: 1 /* HTTP */, label: localize("mcp.serverType.http", "HTTP (HTTP or Server-Sent Events)"), description: localize("mcp.serverType.http.description", "Connect to a remote HTTP server that implements the MCP protocol") }
    ];
    let aiSupported;
    try {
      aiSupported = await this._commandService.executeCommand("github.copilot.chat.mcp.setup.check" /* IsSupported */);
    } catch {
    }
    if (aiSupported) {
      items.unshift({ type: "separator", label: localize("mcp.serverType.manual", "Manual Install") });
      const elligableTypes = Object.entries(AssistedTypes).map(([type, { pickLabel, pickDescription, enabledConfigKey }]) => {
        if (enabledConfigKey) {
          const enabled = this._configurationService.getValue(enabledConfigKey) ?? false;
          if (!enabled) {
            return;
          }
        }
        return {
          kind: Number(type),
          label: pickLabel,
          description: pickDescription
        };
      }).filter((x) => !!x);
      items.push(
        { type: "separator", label: localize("mcp.serverType.copilot", "Model-Assisted") },
        ...elligableTypes
      );
    }
    items.push({ type: "separator" });
    const discovery = this._configurationService.getValue(mcpDiscoverySection);
    if (discovery && typeof discovery === "object" && allDiscoverySources.some((d) => !discovery[d])) {
      items.push({
        kind: "discovery",
        label: localize("mcp.servers.discovery", "Add from another application...")
      });
    }
    items.push({
      kind: "browse",
      label: localize("mcp.servers.browse", "Browse MCP Servers...")
    });
    const result = await this._quickInputService.pick(items, {
      placeHolder: localize("mcp.serverType.placeholder", "Choose the type of MCP server to add")
    });
    if (result?.kind === "browse") {
      this._commandService.executeCommand(McpCommandIds.Browse);
      return void 0;
    }
    if (result?.kind === "discovery") {
      this._commandService.executeCommand("workbench.action.openSettings", mcpDiscoverySection);
      return void 0;
    }
    return result?.kind;
  }
  async getStdioConfig() {
    const command = await this._quickInputService.input({
      title: localize("mcp.command.title", "Enter Command"),
      placeHolder: localize("mcp.command.placeholder", "Command to run (with optional arguments)"),
      ignoreFocusLost: true
    });
    if (!command) {
      return void 0;
    }
    this._telemetryService.publicLog2("mcp.addserver", {
      packageType: "stdio"
    });
    const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);
    return {
      type: McpServerType.LOCAL,
      command: parts[0].replace(/"/g, ""),
      args: parts.slice(1).map((arg) => arg.replace(/"/g, ""))
    };
  }
  async getSSEConfig() {
    const url = await this._quickInputService.input({
      title: localize("mcp.url.title", "Enter Server URL"),
      placeHolder: localize("mcp.url.placeholder", "URL of the MCP server (e.g., http://localhost:3000)"),
      ignoreFocusLost: true
    });
    if (!url) {
      return void 0;
    }
    this._telemetryService.publicLog2("mcp.addserver", {
      packageType: "sse"
    });
    return { url, type: McpServerType.REMOTE };
  }
  async getServerId(suggestion = `my-mcp-server-${generateUuid().split("-")[0]}`) {
    const id = await this._quickInputService.input({
      title: localize("mcp.serverId.title", "Enter Server ID"),
      placeHolder: localize("mcp.serverId.placeholder", "Unique identifier for this server"),
      value: suggestion,
      ignoreFocusLost: true
    });
    return id;
  }
  async getConfigurationTarget() {
    const options = [
      { target: ConfigurationTarget.USER_LOCAL, label: localize("mcp.target.user", "Global"), description: localize("mcp.target.user.description", "Available in all workspaces, runs locally") }
    ];
    const raLabel = this._environmentService.remoteAuthority && this._label.getHostLabel(Schemas.vscodeRemote, this._environmentService.remoteAuthority);
    if (raLabel) {
      options.push({ target: ConfigurationTarget.USER_REMOTE, label: localize("mcp.target.remote", "Remote"), description: localize("mcp.target..remote.description", "Available on this remote machine, runs on {0}", raLabel) });
    }
    const workbenchState = this._workspaceService.getWorkbenchState();
    if (workbenchState !== WorkbenchState.EMPTY) {
      const target = workbenchState === WorkbenchState.FOLDER ? this._workspaceService.getWorkspace().folders[0] : ConfigurationTarget.WORKSPACE;
      if (this._environmentService.remoteAuthority) {
        options.push({ target, label: localize("mcp.target.workspace", "Workspace"), description: localize("mcp.target.workspace.description.remote", "Available in this workspace, runs on {0}", raLabel) });
      } else {
        options.push({ target, label: localize("mcp.target.workspace", "Workspace"), description: localize("mcp.target.workspace.description", "Available in this workspace, runs locally") });
      }
    }
    if (options.length === 1) {
      return options[0].target;
    }
    const targetPick = await this._quickInputService.pick(options, {
      title: localize("mcp.target.title", "Add MCP Server"),
      placeHolder: localize("mcp.target.placeholder", "Select the configuration target")
    });
    return targetPick?.target;
  }
  async getInstallTarget() {
    const session = this._chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
    const hasAgentHostSession = !!session && isAgentHostTarget(getChatSessionType(session));
    if (this.workspaceFolder) {
      return { kind: "local", target: this.workspaceFolder };
    }
    if (session && hasAgentHostSession) {
      const AGENT_HOST_ID = "$agentHost";
      const LOCAL_ID = "$local";
      const items = [
        {
          id: AGENT_HOST_ID,
          label: localize("mcp.target.agentHost", "Add to Current Agent Session"),
          alwaysShow: true
        },
        { type: "separator" },
        {
          id: LOCAL_ID,
          label: localize("mcp.target.local", "Install Server Locally..."),
          iconClass: ThemeIcon.asClassName(Codicon.arrowLeft),
          alwaysShow: true
        }
      ];
      const targetPick = await this._quickInputService.pick(items, {
        title: localize("mcp.target.title", "Add MCP Server"),
        placeHolder: localize("mcp.target.placeholder", "Select the configuration target")
      });
      if (!targetPick) {
        return void 0;
      }
      if (targetPick.id === AGENT_HOST_ID) {
        return { kind: "agentHost", session };
      }
      const target2 = await this.getConfigurationTarget();
      return target2 ? { kind: "local", target: target2 } : void 0;
    }
    const target = await this.getConfigurationTarget();
    return target ? { kind: "local", target } : void 0;
  }
  async getAssistedConfig(type) {
    const packageName = await this._quickInputService.input({
      ignoreFocusLost: true,
      title: AssistedTypes[type].title,
      placeHolder: AssistedTypes[type].placeholder
    });
    if (!packageName) {
      return void 0;
    }
    let LoadAction;
    ((LoadAction2) => {
      LoadAction2["Retry"] = "retry";
      LoadAction2["Cancel"] = "cancel";
      LoadAction2["Allow"] = "allow";
      LoadAction2["OpenUri"] = "openUri";
    })(LoadAction || (LoadAction = {}));
    const loadingQuickPickStore = new DisposableStore();
    const loadingQuickPick = loadingQuickPickStore.add(this._quickInputService.createQuickPick());
    loadingQuickPick.title = localize("mcp.loading.title", "Loading package details...");
    loadingQuickPick.busy = true;
    loadingQuickPick.ignoreFocusOut = true;
    const packageType = this.getPackageType(type);
    this._telemetryService.publicLog2("mcp.addserver", {
      packageType
    });
    this._commandService.executeCommand(
      "github.copilot.chat.mcp.setup.validatePackage" /* ValidatePackage */,
      {
        type: packageType,
        name: packageName,
        targetConfig: {
          ...mcpStdioServerSchema,
          properties: {
            ...mcpStdioServerSchema.properties,
            name: {
              type: "string",
              description: "Suggested name of the server, alphanumeric and hyphen only"
            }
          },
          required: [...mcpStdioServerSchema.required || [], "name"]
        }
      }
    ).then((result) => {
      if (!result || result.state === "error") {
        loadingQuickPick.title = result?.error || "Unknown error loading package";
        const items = [];
        if (result?.helpUri) {
          items.push({
            id: "openUri" /* OpenUri */,
            label: result.helpUriLabel ?? localize("mcp.error.openHelpUri", "Open help URL"),
            helpUri: URI.parse(result.helpUri)
          });
        }
        items.push(
          { id: "retry" /* Retry */, label: localize("mcp.error.retry", "Try a different package") },
          { id: "cancel" /* Cancel */, label: localize("cancel", "Cancel") }
        );
        loadingQuickPick.items = items;
      } else {
        loadingQuickPick.title = localize(
          "mcp.confirmPublish",
          "Install {0}{1} from {2}?",
          result.name ?? packageName,
          result.version ? `@${result.version}` : "",
          result.publisher
        );
        loadingQuickPick.items = [
          { id: "allow" /* Allow */, label: localize("allow", "Allow") },
          { id: "cancel" /* Cancel */, label: localize("cancel", "Cancel") }
        ];
      }
      loadingQuickPick.busy = false;
    });
    const loadingAction = await new Promise((resolve) => {
      loadingQuickPickStore.add(loadingQuickPick.onDidAccept(() => resolve(loadingQuickPick.selectedItems[0])));
      loadingQuickPickStore.add(loadingQuickPick.onDidHide(() => resolve(void 0)));
      loadingQuickPick.show();
    }).finally(() => loadingQuickPickStore.dispose());
    switch (loadingAction?.id) {
      case "retry" /* Retry */:
        return this.getAssistedConfig(type);
      case "openUri" /* OpenUri */:
        if (loadingAction.helpUri) {
          this._openerService.open(loadingAction.helpUri);
        }
        return void 0;
      case "allow" /* Allow */:
        break;
      case "cancel" /* Cancel */:
      default:
        return void 0;
    }
    const config = await this._commandService.executeCommand(
      "github.copilot.chat.mcp.setup.flow" /* StartFlow */,
      {
        name: packageName,
        type: packageType
      }
    );
    if (config?.type === "mapped") {
      return {
        name: config.name,
        server: config.server,
        inputs: config.inputs
      };
    } else if (config?.type === "assisted" || !config?.type) {
      return config;
    } else {
      assertNever(config?.type);
    }
  }
  /** Shows the location of a server config once it's discovered. */
  showOnceDiscovered(name) {
    const store = new DisposableStore();
    store.add(autorun((reader) => {
      const colls = this._mcpRegistry.collections.read(reader);
      const servers = this._mcpService.servers.read(reader);
      const match = mapFindFirst(colls, (collection) => mapFindFirst(
        collection.serverDefinitions.read(reader),
        (server2) => server2.label === name ? { server: server2, collection } : void 0
      ));
      const server = match && servers.find((s) => s.definition.id === match.server.id);
      if (match && server) {
        if (match.collection.presentation?.origin) {
          this._editorService.openEditor({
            resource: match.collection.presentation.origin,
            options: {
              selection: match.server.presentation?.origin?.range,
              preserveFocus: true
            }
          });
        } else {
          this._commandService.executeCommand(McpCommandIds.ServerOptions, name);
        }
        server.start({ promptType: "all-untrusted" }).then((state) => {
          if (state.state === McpConnectionState.Kind.Error) {
            server.showOutput();
          }
        });
        store.dispose();
      }
    }));
    store.add(disposableTimeout(() => store.dispose(), 5e3));
  }
  async run() {
    const serverType = await this.getServerType();
    if (serverType === void 0) {
      return;
    }
    let config;
    let suggestedName;
    let inputs;
    let inputValues;
    switch (serverType) {
      case 0 /* Stdio */:
        config = await this.getStdioConfig();
        break;
      case 1 /* HTTP */:
        config = await this.getSSEConfig();
        break;
      case 2 /* NpmPackage */:
      case 3 /* PipPackage */:
      case 4 /* NuGetPackage */:
      case 5 /* DockerImage */: {
        const r = await this.getAssistedConfig(serverType);
        config = r?.server ? { ...r.server, type: McpServerType.LOCAL } : void 0;
        suggestedName = r?.name;
        inputs = r?.inputs;
        inputValues = r?.inputValues;
        break;
      }
      default:
        assertNever(serverType);
    }
    if (!config) {
      return;
    }
    const name = await this.getServerId(suggestedName);
    if (!name) {
      return;
    }
    const installTarget = await this.getInstallTarget();
    if (!installTarget) {
      return;
    }
    if (installTarget.kind === "agentHost") {
      this._agentHostCustomizations.addMcpServer(installTarget.session, name, config);
      return;
    }
    const { target } = installTarget;
    await this._mcpManagementService.install({ name, config, inputs }, { target });
    if (inputValues) {
      for (const [key, value] of Object.entries(inputValues)) {
        await this._mcpRegistry.setSavedInput(key, (isWorkspaceFolder(target) ? ConfigurationTarget.WORKSPACE_FOLDER : target) ?? ConfigurationTarget.WORKSPACE, value);
      }
    }
    const packageType = this.getPackageType(serverType);
    if (packageType) {
      this._telemetryService.publicLog2("mcp.addserver.completed", {
        packageType,
        serverType: config.type,
        target: target === ConfigurationTarget.WORKSPACE ? "workspace" : "user"
      });
    }
    this.showOnceDiscovered(name);
  }
  async pickForUrlHandler(resource, showIsPrimary = false) {
    const name = decodeURIComponent(basename(resource)).replace(/\.json$/, "");
    const placeHolder = localize("install.title", "Install MCP server {0}", name);
    const items = [
      { id: "install", label: localize("install.start", "Install Server") },
      { id: "show", label: localize("install.show", "Show Configuration", name) },
      { id: "rename", label: localize("install.rename", 'Rename "{0}"', name) },
      { id: "cancel", label: localize("cancel", "Cancel") }
    ];
    if (showIsPrimary) {
      [items[0], items[1]] = [items[1], items[0]];
    }
    const pick = await this._quickInputService.pick(items, { placeHolder, ignoreFocusLost: true });
    const getEditors = () => this._editorService.findEditors(resource);
    switch (pick?.id) {
      case "show":
        await this._editorService.openEditor({ resource });
        break;
      case "install":
        await this._editorService.save(getEditors());
        try {
          const contents = await this._fileService.readFile(resource);
          const { inputs, ...config } = parseJsonc(contents.value.toString());
          await this._mcpManagementService.install({ name, config, inputs });
          this._editorService.closeEditors(getEditors());
          this.showOnceDiscovered(name);
        } catch (e) {
          this._notificationService.error(localize("install.error", "Error installing MCP server {0}: {1}", name, e.message));
          await this._editorService.openEditor({ resource });
        }
        break;
      case "rename": {
        const newName = await this._quickInputService.input({ placeHolder: localize("install.newName", "Enter new name"), value: name });
        if (newName) {
          const newURI = resource.with({ path: `/${encodeURIComponent(newName)}.json` });
          await this._editorService.save(getEditors());
          await this._fileService.move(resource, newURI);
          return this.pickForUrlHandler(newURI, showIsPrimary);
        }
        break;
      }
    }
  }
  getPackageType(serverType) {
    switch (serverType) {
      case 2 /* NpmPackage */:
        return "npm";
      case 3 /* PipPackage */:
        return "pip";
      case 4 /* NuGetPackage */:
        return "nuget";
      case 5 /* DockerImage */:
        return "docker";
      case 0 /* Stdio */:
        return "stdio";
      case 1 /* HTTP */:
        return "sse";
      default:
        return void 0;
    }
  }
};
McpAddConfigurationCommand = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IWorkbenchMcpManagementService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IMcpRegistry),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, IFileService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IMcpService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IAgentHostCustomizationService),
  __decorateParam(16, IChatWidgetService)
], McpAddConfigurationCommand);
let McpInstallFromManifestCommand = class {
  constructor(_fileDialogService, _fileService, _quickInputService, _notificationService, _mcpManagementService, _logService) {
    this._fileDialogService = _fileDialogService;
    this._fileService = _fileService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._mcpManagementService = _mcpManagementService;
    this._logService = _logService;
  }
  async run() {
    const result = await this._fileDialogService.showOpenDialog({
      title: localize("mcp.installFromManifest.title", "Select MCP Server Manifest"),
      filters: [{ name: localize("mcp.installFromManifest.filter", "MCP Manifest"), extensions: ["json"] }],
      canSelectFiles: true,
      canSelectMany: false,
      openLabel: mnemonicButtonLabel(localize({ key: "mcp.installFromManifest.openLabel", comment: ["&& denotes a mnemonic"] }, "&&Install"))
    });
    if (!result?.[0]) {
      return;
    }
    const manifestUri = result[0];
    let manifest;
    try {
      const contents = await this._fileService.readFile(manifestUri);
      manifest = parseJsonc(contents.value.toString());
    } catch (e) {
      this._notificationService.error(localize("mcp.installFromManifest.readError", "Failed to read manifest file: {0}", e.message));
      return;
    }
    if (!manifest || typeof manifest !== "object") {
      this._notificationService.error(localize("mcp.installFromManifest.invalidJson", "Invalid manifest file: expected a JSON object"));
      return;
    }
    const galleryManifest = manifest;
    let packageType;
    if (Array.isArray(galleryManifest.packages) && galleryManifest.packages.length > 0) {
      packageType = galleryManifest.packages[0].registryType;
    } else if (Array.isArray(galleryManifest.remotes) && galleryManifest.remotes.length > 0) {
      packageType = RegistryType.REMOTE;
    } else {
      this._notificationService.error(localize("mcp.installFromManifest.invalidManifest", "Invalid manifest: expected 'packages' or 'remotes' with at least one entry"));
      return;
    }
    let config;
    let inputs;
    try {
      const { mcpServerConfiguration, notices } = this._mcpManagementService.getMcpServerConfigurationFromManifest(galleryManifest, packageType);
      config = mcpServerConfiguration.config;
      inputs = mcpServerConfiguration.inputs;
      if (notices.length > 0) {
        this._logService.warn(`MCP Management Service: Warnings while installing the MCP server from ${manifestUri.path}`, notices);
      }
    } catch (e) {
      this._notificationService.error(localize("mcp.installFromManifest.parseError", "Failed to parse manifest: {0}", e.message));
      return;
    }
    let name = galleryManifest.name;
    if (!name) {
      name = await this._quickInputService.input({
        title: localize("mcp.installFromManifest.serverId.title", "Enter Server ID"),
        placeHolder: localize("mcp.installFromManifest.serverId.placeholder", "Unique identifier for this server"),
        value: basename(manifestUri).replace(/\.json$/i, ""),
        ignoreFocusLost: true
      });
      if (!name) {
        return;
      }
    }
    try {
      await this._mcpManagementService.install({ name, config, inputs });
      this._notificationService.info(localize("mcp.installFromManifest.success", "MCP server '{0}' installed successfully", name));
    } catch (e) {
      this._notificationService.error(localize("mcp.installFromManifest.installError", "Failed to install MCP server: {0}", e.message));
    }
  }
};
McpInstallFromManifestCommand = __decorateClass([
  __decorateParam(0, IFileDialogService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IWorkbenchMcpManagementService),
  __decorateParam(5, ILogService)
], McpInstallFromManifestCommand);
export {
  AddConfigurationType,
  AssistedTypes,
  McpAddConfigurationCommand,
  McpInstallFromManifestCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcENvbW1hbmRzQWRkQ29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1hcEZpbmRGaXJzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcGFyc2UgYXMgcGFyc2VKc29uYyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25jLmpzJztcbmltcG9ydCB7IG1uZW1vbmljQnV0dG9uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTWNwUmVtb3RlU2VydmVyQ29uZmlndXJhdGlvbiwgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIElNY3BTZXJ2ZXJWYXJpYWJsZSwgSU1jcFN0ZGlvU2VydmVyQ29uZmlndXJhdGlvbiwgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIFJlZ2lzdHJ5VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgaXNXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL21jcC9jb21tb24vbWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IE1jcENvbW1hbmRJZHMgfSBmcm9tICcuLi9jb21tb24vbWNwQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBhbGxEaXNjb3ZlcnlTb3VyY2VzLCBEaXNjb3ZlcnlTb3VyY2UsIG1jcERpc2NvdmVyeVNlY3Rpb24sIG1jcFN0ZGlvU2VydmVyU2NoZW1hIH0gZnJvbSAnLi4vY29tbW9uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZpY2UsIE1jcENvbm5lY3Rpb25TdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gQWRkQ29uZmlndXJhdGlvblR5cGUge1xuXHRTdGRpbyxcblx0SFRUUCxcblxuXHROcG1QYWNrYWdlLFxuXHRQaXBQYWNrYWdlLFxuXHROdUdldFBhY2thZ2UsXG5cdERvY2tlckltYWdlLFxufVxuXG50eXBlIEFzc2lzdGVkQ29uZmlndXJhdGlvblR5cGUgPSBBZGRDb25maWd1cmF0aW9uVHlwZS5OcG1QYWNrYWdlIHwgQWRkQ29uZmlndXJhdGlvblR5cGUuUGlwUGFja2FnZSB8IEFkZENvbmZpZ3VyYXRpb25UeXBlLk51R2V0UGFja2FnZSB8IEFkZENvbmZpZ3VyYXRpb25UeXBlLkRvY2tlckltYWdlO1xuXG50eXBlIE1jcEluc3RhbGxUYXJnZXQgPSB7IGtpbmQ6ICdsb2NhbCc7IHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCB8IElXb3Jrc3BhY2VGb2xkZXIgfSB8IHsga2luZDogJ2FnZW50SG9zdCc7IHNlc3Npb246IFVSSSB9O1xuXG5leHBvcnQgY29uc3QgQXNzaXN0ZWRUeXBlcyA9IHtcblx0W0FkZENvbmZpZ3VyYXRpb25UeXBlLk5wbVBhY2thZ2VdOiB7XG5cdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AubnBtLnRpdGxlJywgXCJFbnRlciBOUE0gUGFja2FnZSBOYW1lXCIpLFxuXHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnbWNwLm5wbS5wbGFjZWhvbGRlcicsIFwiUGFja2FnZSBuYW1lIChlLmcuLCBAb3JnL3BhY2thZ2UpXCIpLFxuXHRcdHBpY2tMYWJlbDogbG9jYWxpemUoJ21jcC5zZXJ2ZXJUeXBlLm5wbScsIFwiTlBNIFBhY2thZ2VcIiksXG5cdFx0cGlja0Rlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUubnBtLmRlc2NyaXB0aW9uJywgXCJJbnN0YWxsIGZyb20gYW4gTlBNIHBhY2thZ2UgbmFtZVwiKSxcblx0XHRlbmFibGVkQ29uZmlnS2V5OiBudWxsLCAvLyBhbHdheXMgZW5hYmxlZFxuXHR9LFxuXHRbQWRkQ29uZmlndXJhdGlvblR5cGUuUGlwUGFja2FnZV06IHtcblx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5waXAudGl0bGUnLCBcIkVudGVyIFBpcCBQYWNrYWdlIE5hbWVcIiksXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdtY3AucGlwLnBsYWNlaG9sZGVyJywgXCJQYWNrYWdlIG5hbWUgKGUuZy4sIHBhY2thZ2UtbmFtZSlcIiksXG5cdFx0cGlja0xhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUucGlwJywgXCJQaXAgUGFja2FnZVwiKSxcblx0XHRwaWNrRGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5waXAuZGVzY3JpcHRpb24nLCBcIkluc3RhbGwgZnJvbSBhIFBpcCBwYWNrYWdlIG5hbWVcIiksXG5cdFx0ZW5hYmxlZENvbmZpZ0tleTogbnVsbCwgLy8gYWx3YXlzIGVuYWJsZWRcblx0fSxcblx0W0FkZENvbmZpZ3VyYXRpb25UeXBlLk51R2V0UGFja2FnZV06IHtcblx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5udWdldC50aXRsZScsIFwiRW50ZXIgTnVHZXQgUGFja2FnZSBOYW1lXCIpLFxuXHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnbWNwLm51Z2V0LnBsYWNlaG9sZGVyJywgXCJQYWNrYWdlIG5hbWUgKGUuZy4sIFBhY2thZ2UuTmFtZSlcIiksXG5cdFx0cGlja0xhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUubnVnZXQnLCBcIk51R2V0IFBhY2thZ2VcIiksXG5cdFx0cGlja0Rlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUubnVnZXQuZGVzY3JpcHRpb24nLCBcIkluc3RhbGwgZnJvbSBhIE51R2V0IHBhY2thZ2UgbmFtZVwiKSxcblx0XHRlbmFibGVkQ29uZmlnS2V5OiAnY2hhdC5tY3AuYXNzaXN0ZWQubnVnZXQuZW5hYmxlZCcsXG5cdH0sXG5cdFtBZGRDb25maWd1cmF0aW9uVHlwZS5Eb2NrZXJJbWFnZV06IHtcblx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC5kb2NrZXIudGl0bGUnLCBcIkVudGVyIERvY2tlciBJbWFnZSBOYW1lXCIpLFxuXHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnbWNwLmRvY2tlci5wbGFjZWhvbGRlcicsIFwiSW1hZ2UgbmFtZSAoZS5nLiwgbWNwL2ltYWdlbmFtZSlcIiksXG5cdFx0cGlja0xhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUuZG9ja2VyJywgXCJEb2NrZXIgSW1hZ2VcIiksXG5cdFx0cGlja0Rlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUuZG9ja2VyLmRlc2NyaXB0aW9uJywgXCJJbnN0YWxsIGZyb20gYSBEb2NrZXIgaW1hZ2VcIiksXG5cdFx0ZW5hYmxlZENvbmZpZ0tleTogbnVsbCwgLy8gYWx3YXlzIGVuYWJsZWRcblx0fSxcbn07XG5cbmNvbnN0IGVudW0gQWRkQ29uZmlndXJhdGlvbkNvcGlsb3RDb21tYW5kIHtcblx0LyoqIFJldHVybnMgd2hldGhlciBNQ1AgZW5oYW5jZWQgc2V0dXAgaXMgZW5hYmxlZC4gKi9cblx0SXNTdXBwb3J0ZWQgPSAnZ2l0aHViLmNvcGlsb3QuY2hhdC5tY3Auc2V0dXAuY2hlY2snLFxuXG5cdC8qKiBUYWtlcyBhbiBucG0vcGlwIHBhY2thZ2UgbmFtZSwgdmFsaWRhdGVzIGl0cyBvd25lci4gKi9cblx0VmFsaWRhdGVQYWNrYWdlID0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQubWNwLnNldHVwLnZhbGlkYXRlUGFja2FnZScsXG5cblx0LyoqIFJldHVybnMgdGhlIHJlc29sdmVkIE1DUCBjb25maWd1cmF0aW9uLiAqL1xuXHRTdGFydEZsb3cgPSAnZ2l0aHViLmNvcGlsb3QuY2hhdC5tY3Auc2V0dXAuZmxvdycsXG59XG5cbnR5cGUgVmFsaWRhdGVQYWNrYWdlUmVzdWx0ID1cblx0eyBzdGF0ZTogJ29rJzsgcHVibGlzaGVyOiBzdHJpbmc7IG5hbWU/OiBzdHJpbmc7IHZlcnNpb24/OiBzdHJpbmcgfVxuXHR8IHsgc3RhdGU6ICdlcnJvcic7IGVycm9yOiBzdHJpbmc7IGhlbHBVcmk/OiBzdHJpbmc7IGhlbHBVcmlMYWJlbD86IHN0cmluZyB9O1xuXG50eXBlIEFkZFNlcnZlckRhdGEgPSB7XG5cdHBhY2thZ2VUeXBlOiBzdHJpbmc7XG59O1xudHlwZSBBZGRTZXJ2ZXJDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdkaWdpdGFyYWxkJztcblx0Y29tbWVudDogJ0dlbmVyaWMgZGV0YWlscyBmb3IgYWRkaW5nIGEgbmV3IE1DUCBzZXJ2ZXInO1xuXHRwYWNrYWdlVHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIE1DUCBzZXJ2ZXIgcGFja2FnZScgfTtcbn07XG50eXBlIEFkZFNlcnZlckNvbXBsZXRlZERhdGEgPSB7XG5cdHBhY2thZ2VUeXBlOiBzdHJpbmc7XG5cdHNlcnZlclR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dGFyZ2V0OiBzdHJpbmc7XG59O1xudHlwZSBBZGRTZXJ2ZXJDb21wbGV0ZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdkaWdpdGFyYWxkJztcblx0Y29tbWVudDogJ0dlbmVyaWMgZGV0YWlscyBmb3Igc3VjY2Vzc2Z1bGx5IGFkZGluZyBtb2RlbC1hc3Npc3RlZCBNQ1Agc2VydmVyJztcblx0cGFja2FnZVR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdHlwZSBvZiBNQ1Agc2VydmVyIHBhY2thZ2UnIH07XG5cdHNlcnZlclR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdHlwZSBvZiBNQ1Agc2VydmVyJyB9O1xuXHR0YXJnZXQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdGFyZ2V0IG9mIHRoZSBNQ1Agc2VydmVyIGNvbmZpZ3VyYXRpb24nIH07XG59O1xuXG50eXBlIEFzc2lzdGVkU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0dHlwZT86ICdhc3Npc3RlZCc7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdHNlcnZlcjogT21pdDxJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uLCAndHlwZSc+O1xuXHRpbnB1dHM/OiBJTWNwU2VydmVyVmFyaWFibGVbXTtcblx0aW5wdXRWYWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xufSB8IHtcblx0dHlwZTogJ21hcHBlZCc7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdHNlcnZlcjogT21pdDxJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uLCAndHlwZSc+O1xuXHRpbnB1dHM/OiBJTWNwU2VydmVyVmFyaWFibGVbXTtcbn07XG5cbmV4cG9ydCBjbGFzcyBNY3BBZGRDb25maWd1cmF0aW9uQ29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU1jcFJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgX21jcFJlZ2lzdHJ5OiBJTWNwUmVnaXN0cnksXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0Q3VzdG9taXphdGlvbnM6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXJ2ZXJUeXBlKCk6IFByb21pc2U8QWRkQ29uZmlndXJhdGlvblR5cGUgfCB1bmRlZmluZWQ+IHtcblx0XHR0eXBlIFRJdGVtID0geyBraW5kOiBBZGRDb25maWd1cmF0aW9uVHlwZSB8ICdicm93c2UnIHwgJ2Rpc2NvdmVyeScgfSAmIElRdWlja1BpY2tJdGVtO1xuXHRcdGNvbnN0IGl0ZW1zOiBRdWlja1BpY2tJbnB1dDxUSXRlbT5bXSA9IFtcblx0XHRcdHsga2luZDogQWRkQ29uZmlndXJhdGlvblR5cGUuU3RkaW8sIGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUuY29tbWFuZCcsIFwiQ29tbWFuZCAoc3RkaW8pXCIpLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcC5zZXJ2ZXJUeXBlLmNvbW1hbmQuZGVzY3JpcHRpb24nLCBcIlJ1biBhIGxvY2FsIGNvbW1hbmQgdGhhdCBpbXBsZW1lbnRzIHRoZSBNQ1AgcHJvdG9jb2xcIikgfSxcblx0XHRcdHsga2luZDogQWRkQ29uZmlndXJhdGlvblR5cGUuSFRUUCwgbGFiZWw6IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5odHRwJywgXCJIVFRQIChIVFRQIG9yIFNlcnZlci1TZW50IEV2ZW50cylcIiksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUuaHR0cC5kZXNjcmlwdGlvbicsIFwiQ29ubmVjdCB0byBhIHJlbW90ZSBIVFRQIHNlcnZlciB0aGF0IGltcGxlbWVudHMgdGhlIE1DUCBwcm90b2NvbFwiKSB9XG5cdFx0XTtcblxuXHRcdGxldCBhaVN1cHBvcnRlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YWlTdXBwb3J0ZWQgPSBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxib29sZWFuPihBZGRDb25maWd1cmF0aW9uQ29waWxvdENvbW1hbmQuSXNTdXBwb3J0ZWQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlZFxuXHRcdH1cblxuXHRcdGlmIChhaVN1cHBvcnRlZCkge1xuXHRcdFx0aXRlbXMudW5zaGlmdCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ21jcC5zZXJ2ZXJUeXBlLm1hbnVhbCcsIFwiTWFudWFsIEluc3RhbGxcIikgfSk7XG5cblx0XHRcdGNvbnN0IGVsbGlnYWJsZVR5cGVzID0gT2JqZWN0LmVudHJpZXMoQXNzaXN0ZWRUeXBlcykubWFwKChbdHlwZSwgeyBwaWNrTGFiZWwsIHBpY2tEZXNjcmlwdGlvbiwgZW5hYmxlZENvbmZpZ0tleSB9XSkgPT4ge1xuXHRcdFx0XHRpZiAoZW5hYmxlZENvbmZpZ0tleSkge1xuXHRcdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihlbmFibGVkQ29uZmlnS2V5KSA/PyBmYWxzZTtcblx0XHRcdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiBOdW1iZXIodHlwZSkgYXMgQWRkQ29uZmlndXJhdGlvblR5cGUsXG5cdFx0XHRcdFx0bGFiZWw6IHBpY2tMYWJlbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogcGlja0Rlc2NyaXB0aW9uLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSkuZmlsdGVyKHggPT4gISF4KTtcblxuXHRcdFx0aXRlbXMucHVzaChcblx0XHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdtY3Auc2VydmVyVHlwZS5jb3BpbG90JywgXCJNb2RlbC1Bc3Npc3RlZFwiKSB9LFxuXHRcdFx0XHQuLi5lbGxpZ2FibGVUeXBlc1xuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtLIGluIERpc2NvdmVyeVNvdXJjZV06IGJvb2xlYW4gfT4obWNwRGlzY292ZXJ5U2VjdGlvbik7XG5cdFx0aWYgKGRpc2NvdmVyeSAmJiB0eXBlb2YgZGlzY292ZXJ5ID09PSAnb2JqZWN0JyAmJiBhbGxEaXNjb3ZlcnlTb3VyY2VzLnNvbWUoZCA9PiAhZGlzY292ZXJ5W2RdKSkge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6ICdkaXNjb3ZlcnknLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zZXJ2ZXJzLmRpc2NvdmVyeScsIFwiQWRkIGZyb20gYW5vdGhlciBhcHBsaWNhdGlvbi4uLlwiKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0a2luZDogJ2Jyb3dzZScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcC5zZXJ2ZXJzLmJyb3dzZScsIFwiQnJvd3NlIE1DUCBTZXJ2ZXJzLi4uXCIpLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljazxUSXRlbT4oaXRlbXMsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLnNlcnZlclR5cGUucGxhY2Vob2xkZXInLCBcIkNob29zZSB0aGUgdHlwZSBvZiBNQ1Agc2VydmVyIHRvIGFkZFwiKSxcblx0XHR9KTtcblxuXHRcdGlmIChyZXN1bHQ/LmtpbmQgPT09ICdicm93c2UnKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkJyb3dzZSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQ/LmtpbmQgPT09ICdkaXNjb3ZlcnknKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCBtY3BEaXNjb3ZlcnlTZWN0aW9uKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdD8ua2luZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U3RkaW9Db25maWcoKTogUHJvbWlzZTxJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLmNvbW1hbmQudGl0bGUnLCBcIkVudGVyIENvbW1hbmRcIiksXG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ21jcC5jb21tYW5kLnBsYWNlaG9sZGVyJywgXCJDb21tYW5kIHRvIHJ1biAod2l0aCBvcHRpb25hbCBhcmd1bWVudHMpXCIpLFxuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZGRTZXJ2ZXJEYXRhLCBBZGRTZXJ2ZXJDbGFzc2lmaWNhdGlvbj4oJ21jcC5hZGRzZXJ2ZXInLCB7XG5cdFx0XHRwYWNrYWdlVHlwZTogJ3N0ZGlvJ1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3BsaXQgY29tbWFuZCBpbnRvIGNvbW1hbmQgYW5kIGFyZ3MsIGhhbmRsaW5nIHF1b3Rlc1xuXHRcdGNvbnN0IHBhcnRzID0gY29tbWFuZC5tYXRjaCgvKD86W15cXHNcIl0rfFwiW15cIl0qXCIpKy9nKSE7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRjb21tYW5kOiBwYXJ0c1swXS5yZXBsYWNlKC9cIi9nLCAnJyksXG5cblx0XHRcdGFyZ3M6IHBhcnRzLnNsaWNlKDEpLm1hcChhcmcgPT4gYXJnLnJlcGxhY2UoL1wiL2csICcnKSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTU0VDb25maWcoKTogUHJvbWlzZTxJTWNwUmVtb3RlU2VydmVyQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHVybCA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnVybC50aXRsZScsIFwiRW50ZXIgU2VydmVyIFVSTFwiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLnVybC5wbGFjZWhvbGRlcicsIFwiVVJMIG9mIHRoZSBNQ1Agc2VydmVyIChlLmcuLCBodHRwOi8vbG9jYWxob3N0OjMwMDApXCIpLFxuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCF1cmwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFkZFNlcnZlckRhdGEsIEFkZFNlcnZlckNsYXNzaWZpY2F0aW9uPignbWNwLmFkZHNlcnZlcicsIHtcblx0XHRcdHBhY2thZ2VUeXBlOiAnc3NlJ1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgdXJsLCB0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZXJ2ZXJJZChzdWdnZXN0aW9uID0gYG15LW1jcC1zZXJ2ZXItJHtnZW5lcmF0ZVV1aWQoKS5zcGxpdCgnLScpWzBdfWApOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGlkID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3Auc2VydmVySWQudGl0bGUnLCBcIkVudGVyIFNlcnZlciBJRFwiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLnNlcnZlcklkLnBsYWNlaG9sZGVyJywgXCJVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyBzZXJ2ZXJcIiksXG5cdFx0XHR2YWx1ZTogc3VnZ2VzdGlvbixcblx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0Q29uZmlndXJhdGlvblRhcmdldCgpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25UYXJnZXQgfCBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgb3B0aW9uczogKElRdWlja1BpY2tJdGVtICYgeyB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgSVdvcmtzcGFjZUZvbGRlciB9KVtdID0gW1xuXHRcdFx0eyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCwgbGFiZWw6IGxvY2FsaXplKCdtY3AudGFyZ2V0LnVzZXInLCBcIkdsb2JhbFwiKSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdtY3AudGFyZ2V0LnVzZXIuZGVzY3JpcHRpb24nLCBcIkF2YWlsYWJsZSBpbiBhbGwgd29ya3NwYWNlcywgcnVucyBsb2NhbGx5XCIpIH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgcmFMYWJlbCA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgJiYgdGhpcy5fbGFiZWwuZ2V0SG9zdExhYmVsKFNjaGVtYXMudnNjb2RlUmVtb3RlLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KTtcblx0XHRpZiAocmFMYWJlbCkge1xuXHRcdFx0b3B0aW9ucy5wdXNoKHsgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFLCBsYWJlbDogbG9jYWxpemUoJ21jcC50YXJnZXQucmVtb3RlJywgXCJSZW1vdGVcIiksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC4ucmVtb3RlLmRlc2NyaXB0aW9uJywgXCJBdmFpbGFibGUgb24gdGhpcyByZW1vdGUgbWFjaGluZSwgcnVucyBvbiB7MH1cIiwgcmFMYWJlbCkgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2JlbmNoU3RhdGUgPSB0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCk7XG5cdFx0aWYgKHdvcmtiZW5jaFN0YXRlICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gd29ya2JlbmNoU3RhdGUgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUiA/IHRoaXMuX3dvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXSA6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKHsgdGFyZ2V0LCBsYWJlbDogbG9jYWxpemUoJ21jcC50YXJnZXQud29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIiksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC53b3Jrc3BhY2UuZGVzY3JpcHRpb24ucmVtb3RlJywgXCJBdmFpbGFibGUgaW4gdGhpcyB3b3Jrc3BhY2UsIHJ1bnMgb24gezB9XCIsIHJhTGFiZWwpIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKHsgdGFyZ2V0LCBsYWJlbDogbG9jYWxpemUoJ21jcC50YXJnZXQud29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIiksIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC53b3Jrc3BhY2UuZGVzY3JpcHRpb24nLCBcIkF2YWlsYWJsZSBpbiB0aGlzIHdvcmtzcGFjZSwgcnVucyBsb2NhbGx5XCIpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnNbMF0udGFyZ2V0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFBpY2sgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKG9wdGlvbnMsIHtcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC50aXRsZScsIFwiQWRkIE1DUCBTZXJ2ZXJcIiksXG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ21jcC50YXJnZXQucGxhY2Vob2xkZXInLCBcIlNlbGVjdCB0aGUgY29uZmlndXJhdGlvbiB0YXJnZXRcIilcblx0XHR9KTtcblxuXHRcdHJldHVybiB0YXJnZXRQaWNrPy50YXJnZXQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEluc3RhbGxUYXJnZXQoKTogUHJvbWlzZTxNY3BJbnN0YWxsVGFyZ2V0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBoYXNBZ2VudEhvc3RTZXNzaW9uID0gISFzZXNzaW9uICYmIGlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uKSk7XG5cblx0XHRpZiAodGhpcy53b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdsb2NhbCcsIHRhcmdldDogdGhpcy53b3Jrc3BhY2VGb2xkZXIgfTtcblx0XHR9XG5cblx0XHRpZiAoc2Vzc2lvbiAmJiBoYXNBZ2VudEhvc3RTZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBBR0VOVF9IT1NUX0lEID0gJyRhZ2VudEhvc3QnO1xuXHRcdFx0Y29uc3QgTE9DQUxfSUQgPSAnJGxvY2FsJztcblx0XHRcdHR5cGUgSXRlbVR5cGUgPSB7IGlkOiB0eXBlb2YgQUdFTlRfSE9TVF9JRCB8IHR5cGVvZiBMT0NBTF9JRCB9ICYgSVF1aWNrUGlja0l0ZW07XG5cblx0XHRcdGNvbnN0IGl0ZW1zOiBRdWlja1BpY2tJbnB1dDxJdGVtVHlwZT5bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBBR0VOVF9IT1NUX0lELFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC5hZ2VudEhvc3QnLCBcIkFkZCB0byBDdXJyZW50IEFnZW50IFNlc3Npb25cIiksXG5cdFx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IExPQ0FMX0lELFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC5sb2NhbCcsIFwiSW5zdGFsbCBTZXJ2ZXIgTG9jYWxseS4uLlwiKSxcblx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmFycm93TGVmdCksXG5cdFx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHRhcmdldFBpY2sgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC50aXRsZScsIFwiQWRkIE1DUCBTZXJ2ZXJcIiksXG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnbWNwLnRhcmdldC5wbGFjZWhvbGRlcicsIFwiU2VsZWN0IHRoZSBjb25maWd1cmF0aW9uIHRhcmdldFwiKVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghdGFyZ2V0UGljaykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGFyZ2V0UGljay5pZCA9PT0gQUdFTlRfSE9TVF9JRCkge1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYWdlbnRIb3N0Jywgc2Vzc2lvbiB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLmdldENvbmZpZ3VyYXRpb25UYXJnZXQoKTtcblx0XHRcdHJldHVybiB0YXJnZXQgPyB7IGtpbmQ6ICdsb2NhbCcsIHRhcmdldCB9IDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuZ2V0Q29uZmlndXJhdGlvblRhcmdldCgpO1xuXHRcdHJldHVybiB0YXJnZXQgPyB7IGtpbmQ6ICdsb2NhbCcsIHRhcmdldCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBc3Npc3RlZENvbmZpZyh0eXBlOiBBc3Npc3RlZENvbmZpZ3VyYXRpb25UeXBlKTogUHJvbWlzZTx7IG5hbWU/OiBzdHJpbmc7IHNlcnZlcjogT21pdDxJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uLCAndHlwZSc+OyBpbnB1dHM/OiBJTWNwU2VydmVyVmFyaWFibGVbXTsgaW5wdXRWYWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwYWNrYWdlTmFtZSA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSxcblx0XHRcdHRpdGxlOiBBc3Npc3RlZFR5cGVzW3R5cGVdLnRpdGxlLFxuXHRcdFx0cGxhY2VIb2xkZXI6IEFzc2lzdGVkVHlwZXNbdHlwZV0ucGxhY2Vob2xkZXIsXG5cdFx0fSk7XG5cblx0XHRpZiAoIXBhY2thZ2VOYW1lKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudW0gTG9hZEFjdGlvbiB7XG5cdFx0XHRSZXRyeSA9ICdyZXRyeScsXG5cdFx0XHRDYW5jZWwgPSAnY2FuY2VsJyxcblx0XHRcdEFsbG93ID0gJ2FsbG93Jyxcblx0XHRcdE9wZW5VcmkgPSAnb3BlblVyaScsXG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9hZGluZ1F1aWNrUGlja1N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxvYWRpbmdRdWlja1BpY2sgPSBsb2FkaW5nUXVpY2tQaWNrU3RvcmUuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSAmIHsgaWQ6IExvYWRBY3Rpb247IGhlbHBVcmk/OiBVUkkgfT4oKSk7XG5cdFx0bG9hZGluZ1F1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKCdtY3AubG9hZGluZy50aXRsZScsIFwiTG9hZGluZyBwYWNrYWdlIGRldGFpbHMuLi5cIik7XG5cdFx0bG9hZGluZ1F1aWNrUGljay5idXN5ID0gdHJ1ZTtcblx0XHRsb2FkaW5nUXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHBhY2thZ2VUeXBlID0gdGhpcy5nZXRQYWNrYWdlVHlwZSh0eXBlKTtcblxuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZGRTZXJ2ZXJEYXRhLCBBZGRTZXJ2ZXJDbGFzc2lmaWNhdGlvbj4oJ21jcC5hZGRzZXJ2ZXInLCB7XG5cdFx0XHRwYWNrYWdlVHlwZTogcGFja2FnZVR5cGUhXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxWYWxpZGF0ZVBhY2thZ2VSZXN1bHQ+KFxuXHRcdFx0QWRkQ29uZmlndXJhdGlvbkNvcGlsb3RDb21tYW5kLlZhbGlkYXRlUGFja2FnZSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogcGFja2FnZVR5cGUsXG5cdFx0XHRcdG5hbWU6IHBhY2thZ2VOYW1lLFxuXHRcdFx0XHR0YXJnZXRDb25maWc6IHtcblx0XHRcdFx0XHQuLi5tY3BTdGRpb1NlcnZlclNjaGVtYSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQuLi5tY3BTdGRpb1NlcnZlclNjaGVtYS5wcm9wZXJ0aWVzLFxuXHRcdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTdWdnZXN0ZWQgbmFtZSBvZiB0aGUgc2VydmVyLCBhbHBoYW51bWVyaWMgYW5kIGh5cGhlbiBvbmx5Jyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbLi4uKG1jcFN0ZGlvU2VydmVyU2NoZW1hLnJlcXVpcmVkIHx8IFtdKSwgJ25hbWUnXSxcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmICghcmVzdWx0IHx8IHJlc3VsdC5zdGF0ZSA9PT0gJ2Vycm9yJykge1xuXHRcdFx0XHRsb2FkaW5nUXVpY2tQaWNrLnRpdGxlID0gcmVzdWx0Py5lcnJvciB8fCAnVW5rbm93biBlcnJvciBsb2FkaW5nIHBhY2thZ2UnO1xuXG5cdFx0XHRcdGNvbnN0IGl0ZW1zOiBBcnJheTxJUXVpY2tQaWNrSXRlbSAmIHsgaWQ6IExvYWRBY3Rpb247IGhlbHBVcmk/OiBVUkkgfT4gPSBbXTtcblxuXHRcdFx0XHRpZiAocmVzdWx0Py5oZWxwVXJpKSB7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogTG9hZEFjdGlvbi5PcGVuVXJpLFxuXHRcdFx0XHRcdFx0bGFiZWw6IHJlc3VsdC5oZWxwVXJpTGFiZWwgPz8gbG9jYWxpemUoJ21jcC5lcnJvci5vcGVuSGVscFVyaScsICdPcGVuIGhlbHAgVVJMJyksXG5cdFx0XHRcdFx0XHRoZWxwVXJpOiBVUkkucGFyc2UocmVzdWx0LmhlbHBVcmkpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aXRlbXMucHVzaChcblx0XHRcdFx0XHR7IGlkOiBMb2FkQWN0aW9uLlJldHJ5LCBsYWJlbDogbG9jYWxpemUoJ21jcC5lcnJvci5yZXRyeScsICdUcnkgYSBkaWZmZXJlbnQgcGFja2FnZScpIH0sXG5cdFx0XHRcdFx0eyBpZDogTG9hZEFjdGlvbi5DYW5jZWwsIGxhYmVsOiBsb2NhbGl6ZSgnY2FuY2VsJywgJ0NhbmNlbCcpIH0sXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0bG9hZGluZ1F1aWNrUGljay5pdGVtcyA9IGl0ZW1zO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9hZGluZ1F1aWNrUGljay50aXRsZSA9IGxvY2FsaXplKFxuXHRcdFx0XHRcdCdtY3AuY29uZmlybVB1Ymxpc2gnLCAnSW5zdGFsbCB7MH17MX0gZnJvbSB7Mn0/Jyxcblx0XHRcdFx0XHRyZXN1bHQubmFtZSA/PyBwYWNrYWdlTmFtZSxcblx0XHRcdFx0XHRyZXN1bHQudmVyc2lvbiA/IGBAJHtyZXN1bHQudmVyc2lvbn1gIDogJycsXG5cdFx0XHRcdFx0cmVzdWx0LnB1Ymxpc2hlcik7XG5cdFx0XHRcdGxvYWRpbmdRdWlja1BpY2suaXRlbXMgPSBbXG5cdFx0XHRcdFx0eyBpZDogTG9hZEFjdGlvbi5BbGxvdywgbGFiZWw6IGxvY2FsaXplKCdhbGxvdycsIFwiQWxsb3dcIikgfSxcblx0XHRcdFx0XHR7IGlkOiBMb2FkQWN0aW9uLkNhbmNlbCwgbGFiZWw6IGxvY2FsaXplKCdjYW5jZWwnLCAnQ2FuY2VsJykgfVxuXHRcdFx0XHRdO1xuXHRcdFx0fVxuXHRcdFx0bG9hZGluZ1F1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb2FkaW5nQWN0aW9uID0gYXdhaXQgbmV3IFByb21pc2U8eyBpZDogTG9hZEFjdGlvbjsgaGVscFVyaT86IFVSSSB9IHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGxvYWRpbmdRdWlja1BpY2tTdG9yZS5hZGQobG9hZGluZ1F1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiByZXNvbHZlKGxvYWRpbmdRdWlja1BpY2suc2VsZWN0ZWRJdGVtc1swXSkpKTtcblx0XHRcdGxvYWRpbmdRdWlja1BpY2tTdG9yZS5hZGQobG9hZGluZ1F1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRsb2FkaW5nUXVpY2tQaWNrLnNob3coKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IGxvYWRpbmdRdWlja1BpY2tTdG9yZS5kaXNwb3NlKCkpO1xuXG5cdFx0c3dpdGNoIChsb2FkaW5nQWN0aW9uPy5pZCkge1xuXHRcdFx0Y2FzZSBMb2FkQWN0aW9uLlJldHJ5OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRBc3Npc3RlZENvbmZpZyh0eXBlKTtcblx0XHRcdGNhc2UgTG9hZEFjdGlvbi5PcGVuVXJpOlxuXHRcdFx0XHRpZiAobG9hZGluZ0FjdGlvbi5oZWxwVXJpKSB7IHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbihsb2FkaW5nQWN0aW9uLmhlbHBVcmkpOyB9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRjYXNlIExvYWRBY3Rpb24uQWxsb3c6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBMb2FkQWN0aW9uLkNhbmNlbDpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8QXNzaXN0ZWRTZXJ2ZXJDb25maWd1cmF0aW9uPihcblx0XHRcdEFkZENvbmZpZ3VyYXRpb25Db3BpbG90Q29tbWFuZC5TdGFydEZsb3csXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IHBhY2thZ2VOYW1lLFxuXHRcdFx0XHR0eXBlOiBwYWNrYWdlVHlwZVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRpZiAoY29uZmlnPy50eXBlID09PSAnbWFwcGVkJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bmFtZTogY29uZmlnLm5hbWUsXG5cdFx0XHRcdHNlcnZlcjogY29uZmlnLnNlcnZlcixcblx0XHRcdFx0aW5wdXRzOiBjb25maWcuaW5wdXRzLFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZz8udHlwZSA9PT0gJ2Fzc2lzdGVkJyB8fCAhY29uZmlnPy50eXBlKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnROZXZlcihjb25maWc/LnR5cGUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBTaG93cyB0aGUgbG9jYXRpb24gb2YgYSBzZXJ2ZXIgY29uZmlnIG9uY2UgaXQncyBkaXNjb3ZlcmVkLiAqL1xuXHRwcml2YXRlIHNob3dPbmNlRGlzY292ZXJlZChuYW1lOiBzdHJpbmcpIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY29sbHMgPSB0aGlzLl9tY3BSZWdpc3RyeS5jb2xsZWN0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzID0gdGhpcy5fbWNwU2VydmljZS5zZXJ2ZXJzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1hdGNoID0gbWFwRmluZEZpcnN0KGNvbGxzLCBjb2xsZWN0aW9uID0+IG1hcEZpbmRGaXJzdChjb2xsZWN0aW9uLnNlcnZlckRlZmluaXRpb25zLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0c2VydmVyID0+IHNlcnZlci5sYWJlbCA9PT0gbmFtZSA/IHsgc2VydmVyLCBjb2xsZWN0aW9uIH0gOiB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IHNlcnZlciA9IG1hdGNoICYmIHNlcnZlcnMuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gbWF0Y2guc2VydmVyLmlkKTtcblxuXG5cdFx0XHRpZiAobWF0Y2ggJiYgc2VydmVyKSB7XG5cdFx0XHRcdGlmIChtYXRjaC5jb2xsZWN0aW9uLnByZXNlbnRhdGlvbj8ub3JpZ2luKSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBtYXRjaC5jb2xsZWN0aW9uLnByZXNlbnRhdGlvbi5vcmlnaW4sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdGlvbjogbWF0Y2guc2VydmVyLnByZXNlbnRhdGlvbj8ub3JpZ2luPy5yYW5nZSxcblx0XHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLlNlcnZlck9wdGlvbnMsIG5hbWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VydmVyLnN0YXJ0KHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnIH0pLnRoZW4oc3RhdGUgPT4ge1xuXHRcdFx0XHRcdGlmIChzdGF0ZS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IpIHtcblx0XHRcdFx0XHRcdHNlcnZlci5zaG93T3V0cHV0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHN0b3JlLmRpc3Bvc2UoKSwgNTAwMCkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTdGVwIDE6IENob29zZSBzZXJ2ZXIgdHlwZVxuXHRcdGNvbnN0IHNlcnZlclR5cGUgPSBhd2FpdCB0aGlzLmdldFNlcnZlclR5cGUoKTtcblx0XHRpZiAoc2VydmVyVHlwZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RlcCAyOiBHZXQgc2VydmVyIGRldGFpbHMgYmFzZWQgb24gdHlwZVxuXHRcdGxldCBjb25maWc6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzdWdnZXN0ZWROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGlucHV0czogSU1jcFNlcnZlclZhcmlhYmxlW10gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGlucHV0VmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAoc2VydmVyVHlwZSkge1xuXHRcdFx0Y2FzZSBBZGRDb25maWd1cmF0aW9uVHlwZS5TdGRpbzpcblx0XHRcdFx0Y29uZmlnID0gYXdhaXQgdGhpcy5nZXRTdGRpb0NvbmZpZygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuSFRUUDpcblx0XHRcdFx0Y29uZmlnID0gYXdhaXQgdGhpcy5nZXRTU0VDb25maWcoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLk5wbVBhY2thZ2U6XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLlBpcFBhY2thZ2U6XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLk51R2V0UGFja2FnZTpcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuRG9ja2VySW1hZ2U6IHtcblx0XHRcdFx0Y29uc3QgciA9IGF3YWl0IHRoaXMuZ2V0QXNzaXN0ZWRDb25maWcoc2VydmVyVHlwZSk7XG5cdFx0XHRcdGNvbmZpZyA9IHI/LnNlcnZlciA/IHsgLi4uci5zZXJ2ZXIsIHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwgfSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0c3VnZ2VzdGVkTmFtZSA9IHI/Lm5hbWU7XG5cdFx0XHRcdGlucHV0cyA9IHI/LmlucHV0cztcblx0XHRcdFx0aW5wdXRWYWx1ZXMgPSByPy5pbnB1dFZhbHVlcztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRhc3NlcnROZXZlcihzZXJ2ZXJUeXBlKTtcblx0XHR9XG5cblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFN0ZXAgMzogR2V0IHNlcnZlciBJRFxuXHRcdGNvbnN0IG5hbWUgPSBhd2FpdCB0aGlzLmdldFNlcnZlcklkKHN1Z2dlc3RlZE5hbWUpO1xuXHRcdGlmICghbmFtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFN0ZXAgNDogQ2hvb3NlIGNvbmZpZ3VyYXRpb24gdGFyZ2V0XG5cdFx0Y29uc3QgaW5zdGFsbFRhcmdldCA9IGF3YWl0IHRoaXMuZ2V0SW5zdGFsbFRhcmdldCgpO1xuXHRcdGlmICghaW5zdGFsbFRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbnN0YWxsVGFyZ2V0LmtpbmQgPT09ICdhZ2VudEhvc3QnKSB7XG5cdFx0XHR0aGlzLl9hZ2VudEhvc3RDdXN0b21pemF0aW9ucy5hZGRNY3BTZXJ2ZXIoaW5zdGFsbFRhcmdldC5zZXNzaW9uLCBuYW1lLCBjb25maWcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGFyZ2V0IH0gPSBpbnN0YWxsVGFyZ2V0O1xuXHRcdGF3YWl0IHRoaXMuX21jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwoeyBuYW1lLCBjb25maWcsIGlucHV0cyB9LCB7IHRhcmdldCB9KTtcblxuXHRcdGlmIChpbnB1dFZhbHVlcykge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoaW5wdXRWYWx1ZXMpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21jcFJlZ2lzdHJ5LnNldFNhdmVkSW5wdXQoa2V5LCAoaXNXb3Jrc3BhY2VGb2xkZXIodGFyZ2V0KSA/IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiA6IHRhcmdldCkgPz8gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UsIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwYWNrYWdlVHlwZSA9IHRoaXMuZ2V0UGFja2FnZVR5cGUoc2VydmVyVHlwZSk7XG5cdFx0aWYgKHBhY2thZ2VUeXBlKSB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWRkU2VydmVyQ29tcGxldGVkRGF0YSwgQWRkU2VydmVyQ29tcGxldGVkQ2xhc3NpZmljYXRpb24+KCdtY3AuYWRkc2VydmVyLmNvbXBsZXRlZCcsIHtcblx0XHRcdFx0cGFja2FnZVR5cGUsXG5cdFx0XHRcdHNlcnZlclR5cGU6IGNvbmZpZy50eXBlLFxuXHRcdFx0XHR0YXJnZXQ6IHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgPyAnd29ya3NwYWNlJyA6ICd1c2VyJ1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zaG93T25jZURpc2NvdmVyZWQobmFtZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcGlja0ZvclVybEhhbmRsZXIocmVzb3VyY2U6IFVSSSwgc2hvd0lzUHJpbWFyeSA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmFtZSA9IGRlY29kZVVSSUNvbXBvbmVudChiYXNlbmFtZShyZXNvdXJjZSkpLnJlcGxhY2UoL1xcLmpzb24kLywgJycpO1xuXHRcdGNvbnN0IHBsYWNlSG9sZGVyID0gbG9jYWxpemUoJ2luc3RhbGwudGl0bGUnLCAnSW5zdGFsbCBNQ1Agc2VydmVyIHswfScsIG5hbWUpO1xuXG5cdFx0Y29uc3QgaXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSBbXG5cdFx0XHR7IGlkOiAnaW5zdGFsbCcsIGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbC5zdGFydCcsICdJbnN0YWxsIFNlcnZlcicpIH0sXG5cdFx0XHR7IGlkOiAnc2hvdycsIGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbC5zaG93JywgJ1Nob3cgQ29uZmlndXJhdGlvbicsIG5hbWUpIH0sXG5cdFx0XHR7IGlkOiAncmVuYW1lJywgbGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsLnJlbmFtZScsICdSZW5hbWUgXCJ7MH1cIicsIG5hbWUpIH0sXG5cdFx0XHR7IGlkOiAnY2FuY2VsJywgbGFiZWw6IGxvY2FsaXplKCdjYW5jZWwnLCAnQ2FuY2VsJykgfSxcblx0XHRdO1xuXHRcdGlmIChzaG93SXNQcmltYXJ5KSB7XG5cdFx0XHRbaXRlbXNbMF0sIGl0ZW1zWzFdXSA9IFtpdGVtc1sxXSwgaXRlbXNbMF1dO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2sgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7IHBsYWNlSG9sZGVyLCBpZ25vcmVGb2N1c0xvc3Q6IHRydWUgfSk7XG5cdFx0Y29uc3QgZ2V0RWRpdG9ycyA9ICgpID0+IHRoaXMuX2VkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMocmVzb3VyY2UpO1xuXG5cdFx0c3dpdGNoIChwaWNrPy5pZCkge1xuXHRcdFx0Y2FzZSAnc2hvdyc6XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2luc3RhbGwnOlxuXHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLnNhdmUoZ2V0RWRpdG9ycygpKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHJlc291cmNlKTtcblx0XHRcdFx0XHRjb25zdCB7IGlucHV0cywgLi4uY29uZmlnIH06IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uICYgeyBpbnB1dHM/OiBJTWNwU2VydmVyVmFyaWFibGVbXSB9ID0gcGFyc2VKc29uYyhjb250ZW50cy52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9tY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHsgbmFtZSwgY29uZmlnLCBpbnB1dHMgfSk7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5jbG9zZUVkaXRvcnMoZ2V0RWRpdG9ycygpKTtcblx0XHRcdFx0XHR0aGlzLnNob3dPbmNlRGlzY292ZXJlZChuYW1lKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ2luc3RhbGwuZXJyb3InLCAnRXJyb3IgaW5zdGFsbGluZyBNQ1Agc2VydmVyIHswfTogezF9JywgbmFtZSwgZS5tZXNzYWdlKSk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdyZW5hbWUnOiB7XG5cdFx0XHRcdGNvbnN0IG5ld05hbWUgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5pbnB1dCh7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnaW5zdGFsbC5uZXdOYW1lJywgJ0VudGVyIG5ldyBuYW1lJyksIHZhbHVlOiBuYW1lIH0pO1xuXHRcdFx0XHRpZiAobmV3TmFtZSkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld1VSSSA9IHJlc291cmNlLndpdGgoeyBwYXRoOiBgLyR7ZW5jb2RlVVJJQ29tcG9uZW50KG5ld05hbWUpfS5qc29uYCB9KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLnNhdmUoZ2V0RWRpdG9ycygpKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5tb3ZlKHJlc291cmNlLCBuZXdVUkkpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnBpY2tGb3JVcmxIYW5kbGVyKG5ld1VSSSwgc2hvd0lzUHJpbWFyeSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRQYWNrYWdlVHlwZShzZXJ2ZXJUeXBlOiBBZGRDb25maWd1cmF0aW9uVHlwZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChzZXJ2ZXJUeXBlKSB7XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLk5wbVBhY2thZ2U6XG5cdFx0XHRcdHJldHVybiAnbnBtJztcblx0XHRcdGNhc2UgQWRkQ29uZmlndXJhdGlvblR5cGUuUGlwUGFja2FnZTpcblx0XHRcdFx0cmV0dXJuICdwaXAnO1xuXHRcdFx0Y2FzZSBBZGRDb25maWd1cmF0aW9uVHlwZS5OdUdldFBhY2thZ2U6XG5cdFx0XHRcdHJldHVybiAnbnVnZXQnO1xuXHRcdFx0Y2FzZSBBZGRDb25maWd1cmF0aW9uVHlwZS5Eb2NrZXJJbWFnZTpcblx0XHRcdFx0cmV0dXJuICdkb2NrZXInO1xuXHRcdFx0Y2FzZSBBZGRDb25maWd1cmF0aW9uVHlwZS5TdGRpbzpcblx0XHRcdFx0cmV0dXJuICdzdGRpbyc7XG5cdFx0XHRjYXNlIEFkZENvbmZpZ3VyYXRpb25UeXBlLkhUVFA6XG5cdFx0XHRcdHJldHVybiAnc3NlJztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BJbnN0YWxsRnJvbU1hbmlmZXN0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21jcE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTdGVwIDE6IE9wZW4gZmlsZSBkaWFsb2cgdG8gc2VsZWN0IHRoZSBtYW5pZmVzdCBmaWxlXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AuaW5zdGFsbEZyb21NYW5pZmVzdC50aXRsZScsIFwiU2VsZWN0IE1DUCBTZXJ2ZXIgTWFuaWZlc3RcIiksXG5cdFx0XHRmaWx0ZXJzOiBbeyBuYW1lOiBsb2NhbGl6ZSgnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3QuZmlsdGVyJywgXCJNQ1AgTWFuaWZlc3RcIiksIGV4dGVuc2lvbnM6IFsnanNvbiddIH1dLFxuXHRcdFx0Y2FuU2VsZWN0RmlsZXM6IHRydWUsXG5cdFx0XHRjYW5TZWxlY3RNYW55OiBmYWxzZSxcblx0XHRcdG9wZW5MYWJlbDogbW5lbW9uaWNCdXR0b25MYWJlbChsb2NhbGl6ZSh7IGtleTogJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0Lm9wZW5MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkluc3RhbGxcIikpXG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc3VsdD8uWzBdKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFuaWZlc3RVcmkgPSByZXN1bHRbMF07XG5cblx0XHQvLyBTdGVwIDI6IFJlYWQgYW5kIHBhcnNlIHRoZSBtYW5pZmVzdCBmaWxlXG5cdFx0bGV0IG1hbmlmZXN0OiB1bmtub3duO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKG1hbmlmZXN0VXJpKTtcblx0XHRcdG1hbmlmZXN0ID0gcGFyc2VKc29uYyhjb250ZW50cy52YWx1ZS50b1N0cmluZygpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdtY3AuaW5zdGFsbEZyb21NYW5pZmVzdC5yZWFkRXJyb3InLCBcIkZhaWxlZCB0byByZWFkIG1hbmlmZXN0IGZpbGU6IHswfVwiLCBlLm1lc3NhZ2UpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW1hbmlmZXN0IHx8IHR5cGVvZiBtYW5pZmVzdCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LmludmFsaWRKc29uJywgXCJJbnZhbGlkIG1hbmlmZXN0IGZpbGU6IGV4cGVjdGVkIGEgSlNPTiBvYmplY3RcIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFN0ZXAgMzogVmFsaWRhdGUgYW5kIGV4dHJhY3QgY29uZmlndXJhdGlvbiBmcm9tIGdhbGxlcnkgbWFuaWZlc3Rcblx0XHRjb25zdCBnYWxsZXJ5TWFuaWZlc3QgPSBtYW5pZmVzdCBhcyBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gJiB7IG5hbWU/OiBzdHJpbmcgfTtcblxuXHRcdC8vIERldGVybWluZSBwYWNrYWdlIHR5cGUgZnJvbSBtYW5pZmVzdFxuXHRcdGxldCBwYWNrYWdlVHlwZTogUmVnaXN0cnlUeXBlO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGdhbGxlcnlNYW5pZmVzdC5wYWNrYWdlcykgJiYgZ2FsbGVyeU1hbmlmZXN0LnBhY2thZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHBhY2thZ2VUeXBlID0gZ2FsbGVyeU1hbmlmZXN0LnBhY2thZ2VzWzBdLnJlZ2lzdHJ5VHlwZTtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZ2FsbGVyeU1hbmlmZXN0LnJlbW90ZXMpICYmIGdhbGxlcnlNYW5pZmVzdC5yZW1vdGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHBhY2thZ2VUeXBlID0gUmVnaXN0cnlUeXBlLlJFTU9URTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3QuaW52YWxpZE1hbmlmZXN0JywgXCJJbnZhbGlkIG1hbmlmZXN0OiBleHBlY3RlZCAncGFja2FnZXMnIG9yICdyZW1vdGVzJyB3aXRoIGF0IGxlYXN0IG9uZSBlbnRyeVwiKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb247XG5cdFx0bGV0IGlucHV0czogSU1jcFNlcnZlclZhcmlhYmxlW10gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgbWNwU2VydmVyQ29uZmlndXJhdGlvbiwgbm90aWNlcyB9ID0gdGhpcy5fbWNwTWFuYWdlbWVudFNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChnYWxsZXJ5TWFuaWZlc3QsIHBhY2thZ2VUeXBlKTtcblx0XHRcdGNvbmZpZyA9IG1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnO1xuXHRcdFx0aW5wdXRzID0gbWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM7XG5cblx0XHRcdGlmIChub3RpY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBNQ1AgTWFuYWdlbWVudCBTZXJ2aWNlOiBXYXJuaW5ncyB3aGlsZSBpbnN0YWxsaW5nIHRoZSBNQ1Agc2VydmVyIGZyb20gJHttYW5pZmVzdFVyaS5wYXRofWAsIG5vdGljZXMpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LnBhcnNlRXJyb3InLCBcIkZhaWxlZCB0byBwYXJzZSBtYW5pZmVzdDogezB9XCIsIGUubWVzc2FnZSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFN0ZXAgNDogR2V0IHNlcnZlciBuYW1lIGZyb20gbWFuaWZlc3Qgb3IgcHJvbXB0IHVzZXJcblx0XHRsZXQgbmFtZSA9IGdhbGxlcnlNYW5pZmVzdC5uYW1lO1xuXHRcdGlmICghbmFtZSkge1xuXHRcdFx0bmFtZSA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdtY3AuaW5zdGFsbEZyb21NYW5pZmVzdC5zZXJ2ZXJJZC50aXRsZScsIFwiRW50ZXIgU2VydmVyIElEXCIpLFxuXHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LnNlcnZlcklkLnBsYWNlaG9sZGVyJywgXCJVbmlxdWUgaWRlbnRpZmllciBmb3IgdGhpcyBzZXJ2ZXJcIiksXG5cdFx0XHRcdHZhbHVlOiBiYXNlbmFtZShtYW5pZmVzdFVyaSkucmVwbGFjZSgvXFwuanNvbiQvaSwgJycpLFxuXHRcdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTdGVwIDU6IEluc3RhbGwgdG8gdXNlciBzZXR0aW5nc1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9tY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHsgbmFtZSwgY29uZmlnLCBpbnB1dHMgfSk7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ21jcC5pbnN0YWxsRnJvbU1hbmlmZXN0LnN1Y2Nlc3MnLCBcIk1DUCBzZXJ2ZXIgJ3swfScgaW5zdGFsbGVkIHN1Y2Nlc3NmdWxseVwiLCBuYW1lKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnbWNwLmluc3RhbGxGcm9tTWFuaWZlc3QuaW5zdGFsbEVycm9yJywgXCJGYWlsZWQgdG8gaW5zdGFsbCBNQ1Agc2VydmVyOiB7MH1cIiwgZS5tZXNzYWdlKSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsa0JBQWtCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFC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
