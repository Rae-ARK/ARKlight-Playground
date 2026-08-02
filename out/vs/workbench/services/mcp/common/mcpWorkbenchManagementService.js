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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IMcpManagementService, IMcpGalleryService, IAllowedMcpServersService, RegistryType } from "../../../../platform/mcp/common/mcpManagement.js";
import { IInstantiationService, refineServiceDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { Emitter } from "../../../../base/common/event.js";
import { IMcpResourceScannerService } from "../../../../platform/mcp/common/mcpResourceScannerService.js";
import { isWorkspaceFolder, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from "../../configuration/common/configuration.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { McpManagementChannelClient } from "../../../../platform/mcp/common/mcpManagementIpc.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IRemoteUserDataProfilesService } from "../../userDataProfile/common/remoteUserDataProfiles.js";
import { AbstractMcpManagementService, AbstractMcpResourceManagementService } from "../../../../platform/mcp/common/mcpManagementService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ResourceMap } from "../../../../base/common/map.js";
const USER_CONFIG_ID = "usrlocal";
const REMOTE_USER_CONFIG_ID = "usrremote";
const WORKSPACE_CONFIG_ID = "workspace";
const WORKSPACE_FOLDER_CONFIG_ID_PREFIX = "ws";
var LocalMcpServerScope = /* @__PURE__ */ ((LocalMcpServerScope2) => {
  LocalMcpServerScope2["User"] = "user";
  LocalMcpServerScope2["RemoteUser"] = "remoteUser";
  LocalMcpServerScope2["Workspace"] = "workspace";
  return LocalMcpServerScope2;
})(LocalMcpServerScope || {});
const IWorkbenchMcpManagementService = refineServiceDecorator(IMcpManagementService);
let WorkbenchMcpManagementService = class extends AbstractMcpManagementService {
  constructor(mcpManagementService, allowedMcpServersService, logService, userDataProfileService, uriIdentityService, workspaceContextService, remoteAgentService, userDataProfilesService, remoteUserDataProfilesService, instantiationService) {
    super(allowedMcpServersService, logService);
    this.mcpManagementService = mcpManagementService;
    this.userDataProfileService = userDataProfileService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceContextService = workspaceContextService;
    this.userDataProfilesService = userDataProfilesService;
    this.remoteUserDataProfilesService = remoteUserDataProfilesService;
    this._onInstallMcpServer = this._register(new Emitter());
    this.onInstallMcpServer = this._onInstallMcpServer.event;
    this._onDidInstallMcpServers = this._register(new Emitter());
    this.onDidInstallMcpServers = this._onDidInstallMcpServers.event;
    this._onDidUpdateMcpServers = this._register(new Emitter());
    this.onDidUpdateMcpServers = this._onDidUpdateMcpServers.event;
    this._onUninstallMcpServer = this._register(new Emitter());
    this.onUninstallMcpServer = this._onUninstallMcpServer.event;
    this._onDidUninstallMcpServer = this._register(new Emitter());
    this.onDidUninstallMcpServer = this._onDidUninstallMcpServer.event;
    this._onInstallMcpServerInCurrentProfile = this._register(new Emitter());
    this.onInstallMcpServerInCurrentProfile = this._onInstallMcpServerInCurrentProfile.event;
    this._onDidInstallMcpServersInCurrentProfile = this._register(new Emitter());
    this.onDidInstallMcpServersInCurrentProfile = this._onDidInstallMcpServersInCurrentProfile.event;
    this._onDidUpdateMcpServersInCurrentProfile = this._register(new Emitter());
    this.onDidUpdateMcpServersInCurrentProfile = this._onDidUpdateMcpServersInCurrentProfile.event;
    this._onUninstallMcpServerInCurrentProfile = this._register(new Emitter());
    this.onUninstallMcpServerInCurrentProfile = this._onUninstallMcpServerInCurrentProfile.event;
    this._onDidUninstallMcpServerInCurrentProfile = this._register(new Emitter());
    this.onDidUninstallMcpServerInCurrentProfile = this._onDidUninstallMcpServerInCurrentProfile.event;
    this._onDidChangeProfile = this._register(new Emitter());
    this.onDidChangeProfile = this._onDidChangeProfile.event;
    this.workspaceMcpManagementService = this._register(instantiationService.createInstance(WorkspaceMcpManagementService));
    const remoteAgentConnection = remoteAgentService.getConnection();
    if (remoteAgentConnection) {
      this.remoteMcpManagementService = this._register(instantiationService.createInstance(McpManagementChannelClient, remoteAgentConnection.getChannel("mcpManagement")));
    }
    this._register(this.mcpManagementService.onInstallMcpServer((e) => {
      this._onInstallMcpServer.fire(e);
      if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* User */ });
      }
    }));
    this._register(this.mcpManagementService.onDidInstallMcpServers((e) => {
      const { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile } = this.createInstallMcpServerResultsFromEvent(e, "user" /* User */);
      this._onDidInstallMcpServers.fire(mcpServerInstallResult);
      if (mcpServerInstallResultInCurrentProfile.length) {
        this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
      }
    }));
    this._register(this.mcpManagementService.onDidUpdateMcpServers((e) => {
      const { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile } = this.createInstallMcpServerResultsFromEvent(e, "user" /* User */);
      this._onDidUpdateMcpServers.fire(mcpServerInstallResult);
      if (mcpServerInstallResultInCurrentProfile.length) {
        this._onDidUpdateMcpServersInCurrentProfile.fire(mcpServerInstallResultInCurrentProfile);
      }
    }));
    this._register(this.mcpManagementService.onUninstallMcpServer((e) => {
      this._onUninstallMcpServer.fire(e);
      if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* User */ });
      }
    }));
    this._register(this.mcpManagementService.onDidUninstallMcpServer((e) => {
      this._onDidUninstallMcpServer.fire(e);
      if (uriIdentityService.extUri.isEqual(e.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "user" /* User */ });
      }
    }));
    this._register(this.workspaceMcpManagementService.onInstallMcpServer(async (e) => {
      this._onInstallMcpServer.fire(e);
      this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* Workspace */ });
    }));
    this._register(this.workspaceMcpManagementService.onDidInstallMcpServers(async (e) => {
      const { mcpServerInstallResult } = this.createInstallMcpServerResultsFromEvent(e, "workspace" /* Workspace */);
      this._onDidInstallMcpServers.fire(mcpServerInstallResult);
      this._onDidInstallMcpServersInCurrentProfile.fire(mcpServerInstallResult);
    }));
    this._register(this.workspaceMcpManagementService.onUninstallMcpServer(async (e) => {
      this._onUninstallMcpServer.fire(e);
      this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* Workspace */ });
    }));
    this._register(this.workspaceMcpManagementService.onDidUninstallMcpServer(async (e) => {
      this._onDidUninstallMcpServer.fire(e);
      this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "workspace" /* Workspace */ });
    }));
    this._register(this.workspaceMcpManagementService.onDidUpdateMcpServers((e) => {
      const { mcpServerInstallResult } = this.createInstallMcpServerResultsFromEvent(e, "workspace" /* Workspace */);
      this._onDidUpdateMcpServers.fire(mcpServerInstallResult);
      this._onDidUpdateMcpServersInCurrentProfile.fire(mcpServerInstallResult);
    }));
    if (this.remoteMcpManagementService) {
      this._register(this.remoteMcpManagementService.onInstallMcpServer(async (e) => {
        this._onInstallMcpServer.fire(e);
        const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
        if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
          this._onInstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* RemoteUser */ });
        }
      }));
      this._register(this.remoteMcpManagementService.onDidInstallMcpServers((e) => this.handleRemoteInstallMcpServerResultsFromEvent(e, this._onDidInstallMcpServers, this._onDidInstallMcpServersInCurrentProfile)));
      this._register(this.remoteMcpManagementService.onDidUpdateMcpServers((e) => this.handleRemoteInstallMcpServerResultsFromEvent(e, this._onDidInstallMcpServers, this._onDidInstallMcpServersInCurrentProfile)));
      this._register(this.remoteMcpManagementService.onUninstallMcpServer(async (e) => {
        this._onUninstallMcpServer.fire(e);
        const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
        if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
          this._onUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* RemoteUser */ });
        }
      }));
      this._register(this.remoteMcpManagementService.onDidUninstallMcpServer(async (e) => {
        this._onDidUninstallMcpServer.fire(e);
        const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
        if (remoteMcpResource ? uriIdentityService.extUri.isEqual(e.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
          this._onDidUninstallMcpServerInCurrentProfile.fire({ ...e, scope: "remoteUser" /* RemoteUser */ });
        }
      }));
    }
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      if (!this.uriIdentityService.extUri.isEqual(e.previous.mcpResource, e.profile.mcpResource)) {
        this._onDidChangeProfile.fire();
      }
    }));
  }
  createInstallMcpServerResultsFromEvent(e, scope) {
    const mcpServerInstallResult = [];
    const mcpServerInstallResultInCurrentProfile = [];
    for (const result of e) {
      const workbenchResult = {
        ...result,
        local: result.local ? this.toWorkspaceMcpServer(result.local, scope) : void 0
      };
      mcpServerInstallResult.push(workbenchResult);
      if (this.uriIdentityService.extUri.isEqual(result.mcpResource, this.userDataProfileService.currentProfile.mcpResource)) {
        mcpServerInstallResultInCurrentProfile.push(workbenchResult);
      }
    }
    return { mcpServerInstallResult, mcpServerInstallResultInCurrentProfile };
  }
  async handleRemoteInstallMcpServerResultsFromEvent(e, emitter, currentProfileEmitter) {
    const mcpServerInstallResult = [];
    const mcpServerInstallResultInCurrentProfile = [];
    const remoteMcpResource = await this.getRemoteMcpResource(this.userDataProfileService.currentProfile.mcpResource);
    for (const result of e) {
      const workbenchResult = {
        ...result,
        local: result.local ? this.toWorkspaceMcpServer(result.local, "remoteUser" /* RemoteUser */) : void 0
      };
      mcpServerInstallResult.push(workbenchResult);
      if (remoteMcpResource ? this.uriIdentityService.extUri.isEqual(result.mcpResource, remoteMcpResource) : this.userDataProfileService.currentProfile.isDefault) {
        mcpServerInstallResultInCurrentProfile.push(workbenchResult);
      }
    }
    emitter.fire(mcpServerInstallResult);
    if (mcpServerInstallResultInCurrentProfile.length) {
      currentProfileEmitter.fire(mcpServerInstallResultInCurrentProfile);
    }
  }
  async getInstalled() {
    const installed = [];
    const [userServers, remoteServers, workspaceServers] = await Promise.all([
      this.mcpManagementService.getInstalled(this.userDataProfileService.currentProfile.mcpResource),
      this.remoteMcpManagementService?.getInstalled(await this.getRemoteMcpResource()) ?? Promise.resolve([]),
      this.workspaceMcpManagementService?.getInstalled() ?? Promise.resolve([])
    ]);
    for (const server of userServers) {
      installed.push(this.toWorkspaceMcpServer(server, "user" /* User */));
    }
    for (const server of remoteServers) {
      installed.push(this.toWorkspaceMcpServer(server, "remoteUser" /* RemoteUser */));
    }
    for (const server of workspaceServers) {
      installed.push(this.toWorkspaceMcpServer(server, "workspace" /* Workspace */));
    }
    return installed;
  }
  toWorkspaceMcpServer(server, scope) {
    return { ...server, id: `mcp.config.${this.getConfigId(server, scope)}.${server.name}`, scope };
  }
  getConfigId(server, scope) {
    if (scope === "user" /* User */) {
      return USER_CONFIG_ID;
    }
    if (scope === "remoteUser" /* RemoteUser */) {
      return REMOTE_USER_CONFIG_ID;
    }
    if (scope === "workspace" /* Workspace */) {
      const workspace = this.workspaceContextService.getWorkspace();
      if (workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, server.mcpResource)) {
        return WORKSPACE_CONFIG_ID;
      }
      const workspaceFolders = workspace.folders;
      for (let index = 0; index < workspaceFolders.length; index++) {
        const workspaceFolder = workspaceFolders[index];
        if (this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), server.mcpResource)) {
          return `${WORKSPACE_FOLDER_CONFIG_ID_PREFIX}${index}`;
        }
      }
    }
    return "unknown";
  }
  async install(server, options) {
    options = options ?? {};
    if (options.target === ConfigurationTarget.WORKSPACE || isWorkspaceFolder(options.target)) {
      const mcpResource = options.target === ConfigurationTarget.WORKSPACE ? this.workspaceContextService.getWorkspace().configuration : options.target.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
      if (!mcpResource) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = mcpResource;
      const result2 = await this.workspaceMcpManagementService.install(server, options);
      return this.toWorkspaceMcpServer(result2, "workspace" /* Workspace */);
    }
    if (options.target === ConfigurationTarget.USER_REMOTE) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = await this.getRemoteMcpResource(options.mcpResource);
      const result2 = await this.remoteMcpManagementService.install(server, options);
      return this.toWorkspaceMcpServer(result2, "remoteUser" /* RemoteUser */);
    }
    if (options.target && options.target !== ConfigurationTarget.USER && options.target !== ConfigurationTarget.USER_LOCAL) {
      throw new Error(`Illegal target: ${options.target}`);
    }
    options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
    const result = await this.mcpManagementService.install(server, options);
    return this.toWorkspaceMcpServer(result, "user" /* User */);
  }
  async installFromGallery(server, options) {
    options = options ?? {};
    if (options.target === ConfigurationTarget.WORKSPACE || isWorkspaceFolder(options.target)) {
      const mcpResource = options.target === ConfigurationTarget.WORKSPACE ? this.workspaceContextService.getWorkspace().configuration : options.target.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]);
      if (!mcpResource) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = mcpResource;
      const result2 = await this.workspaceMcpManagementService.installFromGallery(server, options);
      return this.toWorkspaceMcpServer(result2, "workspace" /* Workspace */);
    }
    if (options.target === ConfigurationTarget.USER_REMOTE) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${options.target}`);
      }
      options.mcpResource = await this.getRemoteMcpResource(options.mcpResource);
      const result2 = await this.remoteMcpManagementService.installFromGallery(server, options);
      return this.toWorkspaceMcpServer(result2, "remoteUser" /* RemoteUser */);
    }
    if (options.target && options.target !== ConfigurationTarget.USER && options.target !== ConfigurationTarget.USER_LOCAL) {
      throw new Error(`Illegal target: ${options.target}`);
    }
    if (!options.mcpResource) {
      options.mcpResource = this.userDataProfileService.currentProfile.mcpResource;
    }
    const result = await this.mcpManagementService.installFromGallery(server, options);
    return this.toWorkspaceMcpServer(result, "user" /* User */);
  }
  async updateMetadata(local, server, profileLocation) {
    if (local.scope === "workspace" /* Workspace */) {
      const result2 = await this.workspaceMcpManagementService.updateMetadata(local, server, profileLocation);
      return this.toWorkspaceMcpServer(result2, "workspace" /* Workspace */);
    }
    if (local.scope === "remoteUser" /* RemoteUser */) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${local.scope}`);
      }
      const result2 = await this.remoteMcpManagementService.updateMetadata(local, server, profileLocation);
      return this.toWorkspaceMcpServer(result2, "remoteUser" /* RemoteUser */);
    }
    const result = await this.mcpManagementService.updateMetadata(local, server, profileLocation);
    return this.toWorkspaceMcpServer(result, "user" /* User */);
  }
  async uninstall(server) {
    if (server.scope === "workspace" /* Workspace */) {
      return this.workspaceMcpManagementService.uninstall(server);
    }
    if (server.scope === "remoteUser" /* RemoteUser */) {
      if (!this.remoteMcpManagementService) {
        throw new Error(`Illegal target: ${server.scope}`);
      }
      return this.remoteMcpManagementService.uninstall(server);
    }
    return this.mcpManagementService.uninstall(server, { mcpResource: this.userDataProfileService.currentProfile.mcpResource });
  }
  async getRemoteMcpResource(mcpResource) {
    if (!mcpResource && this.userDataProfileService.currentProfile.isDefault) {
      return void 0;
    }
    mcpResource = mcpResource ?? this.userDataProfileService.currentProfile.mcpResource;
    let profile = this.userDataProfilesService.profiles.find((p) => this.uriIdentityService.extUri.isEqual(p.mcpResource, mcpResource));
    if (profile) {
      profile = await this.remoteUserDataProfilesService.getRemoteProfile(profile);
    } else {
      profile = (await this.remoteUserDataProfilesService.getRemoteProfiles()).find((p) => this.uriIdentityService.extUri.isEqual(p.mcpResource, mcpResource));
    }
    return profile?.mcpResource;
  }
};
WorkbenchMcpManagementService = __decorateClass([
  __decorateParam(1, IAllowedMcpServersService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IRemoteAgentService),
  __decorateParam(7, IUserDataProfilesService),
  __decorateParam(8, IRemoteUserDataProfilesService),
  __decorateParam(9, IInstantiationService)
], WorkbenchMcpManagementService);
let WorkspaceMcpResourceManagementService = class extends AbstractMcpResourceManagementService {
  constructor(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService) {
    super(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService);
  }
  async installFromGallery(server, options) {
    this.logService.trace("MCP Management Service: installGallery", server.name, server.galleryUrl);
    this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
    try {
      const packageType = options?.packageType ?? server.configuration.packages?.[0]?.registryType ?? RegistryType.REMOTE;
      const { mcpServerConfiguration, notices } = this.getMcpServerConfigurationFromManifest(server.configuration, packageType);
      if (notices.length > 0) {
        this.logService.warn(`MCP Management Service: Warnings while installing ${server.name}`, notices);
      }
      const installable = {
        name: server.name,
        config: {
          ...mcpServerConfiguration.config,
          gallery: server.galleryUrl ?? true,
          version: server.version
        },
        inputs: mcpServerConfiguration.inputs
      };
      this.ensureServerAllowed(installable);
      await this.mcpResourceScannerService.addMcpServers([installable], this.mcpResource, this.target);
      await this.updateLocal(server);
      const local = (await this.getInstalled()).find((s) => s.name === server.name);
      if (!local) {
        throw new Error(`Failed to install MCP server: ${server.name}`);
      }
      return local;
    } catch (e) {
      this._onDidInstallMcpServers.fire([{ name: server.name, source: server, error: e, mcpResource: this.mcpResource }]);
      throw e;
    }
  }
  updateMetadata() {
    throw new Error("Not supported");
  }
  installFromUri() {
    throw new Error("Not supported");
  }
  async getLocalServerInfo(name, mcpServerConfig) {
    if (!mcpServerConfig.gallery) {
      return void 0;
    }
    const [mcpServer] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
    if (!mcpServer) {
      return void 0;
    }
    return {
      name: mcpServer.name,
      version: mcpServerConfig.version,
      displayName: mcpServer.displayName,
      description: mcpServer.description,
      galleryUrl: mcpServer.galleryUrl,
      manifest: mcpServer.configuration,
      publisher: mcpServer.publisher,
      publisherDisplayName: mcpServer.publisherDisplayName,
      repositoryUrl: mcpServer.repositoryUrl,
      icon: mcpServer.icon
    };
  }
  canInstall(server) {
    throw new Error("Not supported");
  }
};
WorkspaceMcpResourceManagementService = __decorateClass([
  __decorateParam(2, IMcpGalleryService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IMcpResourceScannerService),
  __decorateParam(7, IAllowedMcpServersService)
], WorkspaceMcpResourceManagementService);
let WorkspaceMcpManagementService = class extends AbstractMcpManagementService {
  constructor(allowedMcpServersService, uriIdentityService, logService, workspaceContextService, instantiationService) {
    super(allowedMcpServersService, logService);
    this.uriIdentityService = uriIdentityService;
    this.workspaceContextService = workspaceContextService;
    this.instantiationService = instantiationService;
    this._onInstallMcpServer = this._register(new Emitter());
    this.onInstallMcpServer = this._onInstallMcpServer.event;
    this._onDidInstallMcpServers = this._register(new Emitter());
    this.onDidInstallMcpServers = this._onDidInstallMcpServers.event;
    this._onDidUpdateMcpServers = this._register(new Emitter());
    this.onDidUpdateMcpServers = this._onDidUpdateMcpServers.event;
    this._onUninstallMcpServer = this._register(new Emitter());
    this.onUninstallMcpServer = this._onUninstallMcpServer.event;
    this._onDidUninstallMcpServer = this._register(new Emitter());
    this.onDidUninstallMcpServer = this._onDidUninstallMcpServer.event;
    this.allMcpServers = [];
    this.workspaceMcpManagementServices = new ResourceMap();
    this.initialize();
  }
  async initialize() {
    try {
      await this.onDidChangeWorkbenchState();
      await this.onDidChangeWorkspaceFolders({ added: this.workspaceContextService.getWorkspace().folders, removed: [], changed: [] });
      this._register(this.workspaceContextService.onDidChangeWorkspaceFolders((e) => this.onDidChangeWorkspaceFolders(e)));
      this._register(this.workspaceContextService.onDidChangeWorkbenchState((e) => this.onDidChangeWorkbenchState()));
    } catch (error) {
      this.logService.error("Failed to initialize workspace folders", error);
    }
  }
  async onDidChangeWorkbenchState() {
    if (this.workspaceConfiguration) {
      await this.removeWorkspaceService(this.workspaceConfiguration);
    }
    this.workspaceConfiguration = this.workspaceContextService.getWorkspace().configuration;
    if (this.workspaceConfiguration) {
      await this.addWorkspaceService(this.workspaceConfiguration, ConfigurationTarget.WORKSPACE);
    }
  }
  async onDidChangeWorkspaceFolders(e) {
    try {
      await Promise.allSettled(e.removed.map((folder) => this.removeWorkspaceService(folder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]))));
    } catch (error) {
      this.logService.error(error);
    }
    try {
      await Promise.allSettled(e.added.map((folder) => this.addWorkspaceService(folder.toResource(WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), ConfigurationTarget.WORKSPACE_FOLDER)));
    } catch (error) {
      this.logService.error(error);
    }
  }
  async addWorkspaceService(mcpResource, target) {
    if (this.workspaceMcpManagementServices.has(mcpResource)) {
      return;
    }
    const disposables = new DisposableStore();
    const service = disposables.add(this.instantiationService.createInstance(WorkspaceMcpResourceManagementService, mcpResource, target));
    try {
      const installedServers = await service.getInstalled();
      this.allMcpServers.push(...installedServers);
      if (installedServers.length > 0) {
        const installResults = installedServers.map((server) => ({
          name: server.name,
          local: server,
          mcpResource: server.mcpResource
        }));
        this._onDidInstallMcpServers.fire(installResults);
      }
    } catch (error) {
      this.logService.warn("Failed to get installed servers from", mcpResource.toString(), error);
    }
    disposables.add(service.onInstallMcpServer((e) => this._onInstallMcpServer.fire(e)));
    disposables.add(service.onDidInstallMcpServers((e) => {
      for (const { local } of e) {
        if (local) {
          this.allMcpServers.push(local);
        }
      }
      this._onDidInstallMcpServers.fire(e);
    }));
    disposables.add(service.onDidUpdateMcpServers((e) => {
      for (const { local, mcpResource: mcpResource2 } of e) {
        if (local) {
          const index = this.allMcpServers.findIndex((server) => this.uriIdentityService.extUri.isEqual(server.mcpResource, mcpResource2) && server.name === local.name);
          if (index !== -1) {
            this.allMcpServers.splice(index, 1, local);
          }
        }
      }
      this._onDidUpdateMcpServers.fire(e);
    }));
    disposables.add(service.onUninstallMcpServer((e) => this._onUninstallMcpServer.fire(e)));
    disposables.add(service.onDidUninstallMcpServer((e) => {
      const index = this.allMcpServers.findIndex((server) => this.uriIdentityService.extUri.isEqual(server.mcpResource, e.mcpResource) && server.name === e.name);
      if (index !== -1) {
        this.allMcpServers.splice(index, 1);
        this._onDidUninstallMcpServer.fire(e);
      }
    }));
    this.workspaceMcpManagementServices.set(mcpResource, { service, dispose: () => disposables.dispose() });
  }
  async removeWorkspaceService(mcpResource) {
    const serviceItem = this.workspaceMcpManagementServices.get(mcpResource);
    if (serviceItem) {
      try {
        const installedServers = await serviceItem.service.getInstalled();
        this.allMcpServers = this.allMcpServers.filter((server) => !installedServers.some((uninstalled) => this.uriIdentityService.extUri.isEqual(uninstalled.mcpResource, server.mcpResource)));
        for (const server of installedServers) {
          this._onDidUninstallMcpServer.fire({
            name: server.name,
            mcpResource: server.mcpResource
          });
        }
      } catch (error) {
        this.logService.warn("Failed to get installed servers from", mcpResource.toString(), error);
      }
      this.workspaceMcpManagementServices.delete(mcpResource);
      serviceItem.dispose();
    }
  }
  async getInstalled() {
    return this.allMcpServers;
  }
  async install(server, options) {
    if (!options?.mcpResource) {
      throw new Error("MCP resource is required");
    }
    const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(options?.mcpResource);
    if (!mcpManagementServiceItem) {
      throw new Error(`No MCP management service found for resource: ${options?.mcpResource.toString()}`);
    }
    return mcpManagementServiceItem.service.install(server, options);
  }
  async uninstall(server, options) {
    const mcpResource = server.mcpResource;
    const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(mcpResource);
    if (!mcpManagementServiceItem) {
      throw new Error(`No MCP management service found for resource: ${mcpResource.toString()}`);
    }
    return mcpManagementServiceItem.service.uninstall(server, options);
  }
  installFromGallery(gallery, options) {
    if (!options?.mcpResource) {
      throw new Error("MCP resource is required");
    }
    const mcpManagementServiceItem = this.workspaceMcpManagementServices.get(options?.mcpResource);
    if (!mcpManagementServiceItem) {
      throw new Error(`No MCP management service found for resource: ${options?.mcpResource.toString()}`);
    }
    return mcpManagementServiceItem.service.installFromGallery(gallery, options);
  }
  updateMetadata() {
    throw new Error("Not supported");
  }
  dispose() {
    this.workspaceMcpManagementServices.forEach((service) => service.dispose());
    this.workspaceMcpManagementServices.clear();
    super.dispose();
  }
};
WorkspaceMcpManagementService = __decorateClass([
  __decorateParam(0, IAllowedMcpServersService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IInstantiationService)
], WorkspaceMcpManagementService);
export {
  IWorkbenchMcpManagementService,
  LocalMcpServerScope,
  REMOTE_USER_CONFIG_ID,
  USER_CONFIG_ID,
  WORKSPACE_CONFIG_ID,
  WORKSPACE_FOLDER_CONFIG_ID_PREFIX,
  WorkbenchMcpManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9tY3AvY29tbW9uL21jcFdvcmtiZW5jaE1hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9jYWxNY3BTZXJ2ZXIsIElNY3BNYW5hZ2VtZW50U2VydmljZSwgSUdhbGxlcnlNY3BTZXJ2ZXIsIEluc3RhbGxPcHRpb25zLCBJbnN0YWxsTWNwU2VydmVyRXZlbnQsIFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50LCBEaWRVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudCwgSW5zdGFsbE1jcFNlcnZlclJlc3VsdCwgSUluc3RhbGxhYmxlTWNwU2VydmVyLCBJTWNwR2FsbGVyeVNlcnZpY2UsIFVuaW5zdGFsbE9wdGlvbnMsIElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsIFJlZ2lzdHJ5VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHJlZmluZVNlcnZpY2VEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSwgTWNwUmVzb3VyY2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgTUNQX0NPTkZJR1VSQVRJT05fS0VZLCBXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OUyB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBNY3BNYW5hZ2VtZW50Q2hhbm5lbENsaWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudElwYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3JlbW90ZVVzZXJEYXRhUHJvZmlsZXMuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RNY3BNYW5hZ2VtZW50U2VydmljZSwgQWJzdHJhY3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlLCBJTG9jYWxNY3BTZXJ2ZXJJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuXG5leHBvcnQgY29uc3QgVVNFUl9DT05GSUdfSUQgPSAndXNybG9jYWwnO1xuZXhwb3J0IGNvbnN0IFJFTU9URV9VU0VSX0NPTkZJR19JRCA9ICd1c3JyZW1vdGUnO1xuZXhwb3J0IGNvbnN0IFdPUktTUEFDRV9DT05GSUdfSUQgPSAnd29ya3NwYWNlJztcbmV4cG9ydCBjb25zdCBXT1JLU1BBQ0VfRk9MREVSX0NPTkZJR19JRF9QUkVGSVggPSAnd3MnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY01jcFNlcnZlckluc3RhbGxPcHRpb25zIGV4dGVuZHMgSW5zdGFsbE9wdGlvbnMge1xuXHR0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgSVdvcmtzcGFjZUZvbGRlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gTG9jYWxNY3BTZXJ2ZXJTY29wZSB7XG5cdFVzZXIgPSAndXNlcicsXG5cdFJlbW90ZVVzZXIgPSAncmVtb3RlVXNlcicsXG5cdFdvcmtzcGFjZSA9ICd3b3Jrc3BhY2UnLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlciBleHRlbmRzIElMb2NhbE1jcFNlcnZlciB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudCBleHRlbmRzIEluc3RhbGxNY3BTZXJ2ZXJFdmVudCB7XG5cdHJlYWRvbmx5IHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0IGV4dGVuZHMgSW5zdGFsbE1jcFNlcnZlclJlc3VsdCB7XG5cdHJlYWRvbmx5IGxvY2FsPzogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVuaW5zdGFsbFdvcmtiZW5jaE1jcFNlcnZlckV2ZW50IGV4dGVuZHMgVW5pbnN0YWxsTWNwU2VydmVyRXZlbnQge1xuXHRyZWFkb25seSBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWRVbmluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudCBleHRlbmRzIERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50IHtcblx0cmVhZG9ubHkgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGU7XG59XG5cbmV4cG9ydCBjb25zdCBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UgPSByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yPElNY3BNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlPihJTWNwTWFuYWdlbWVudFNlcnZpY2UpO1xuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBJTWNwTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25JbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZTogRXZlbnQ8SW5zdGFsbFdvcmtiZW5jaE1jcFNlcnZlckV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRJbnN0YWxsTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGU6IEV2ZW50PHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10+O1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZU1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlOiBFdmVudDxyZWFkb25seSBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdPjtcblx0cmVhZG9ubHkgb25Vbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlOiBFdmVudDxVbmluc3RhbGxXb3JrYmVuY2hNY3BTZXJ2ZXJFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZTogRXZlbnQ8RGlkVW5pbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb2ZpbGU6IEV2ZW50PHZvaWQ+O1xuXG5cdGdldEluc3RhbGxlZCgpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdPjtcblx0aW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciB8IFVSSSwgb3B0aW9ucz86IElXb3JrYmVuY01jcFNlcnZlckluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+O1xuXHRpbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+O1xuXHR1cGRhdGVNZXRhZGF0YShsb2NhbDogSUxvY2FsTWNwU2VydmVyLCBzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBwcm9maWxlTG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcj47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hNY3BNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIEFic3RyYWN0TWNwTWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdHByaXZhdGUgX29uSW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uSW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlci5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSW5zdGFsbE1jcFNlcnZlclJlc3VsdFtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRJbnN0YWxsTWNwU2VydmVycyA9IHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRVcGRhdGVNY3BTZXJ2ZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSW5zdGFsbE1jcFNlcnZlclJlc3VsdFtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVNY3BTZXJ2ZXJzID0gdGhpcy5fb25EaWRVcGRhdGVNY3BTZXJ2ZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VW5pbnN0YWxsTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblVuaW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX29uVW5pbnN0YWxsTWNwU2VydmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkVW5pbnN0YWxsTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uSW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlID0gdGhpcy5fb25JbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZSA9IHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZSA9IHRoaXMuX29uRGlkVXBkYXRlTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Vbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VW5pbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSB0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkVW5pbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUgPSB0aGlzLl9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcm9maWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvZmlsZSA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvZmlsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlOiBJTWNwTWFuYWdlbWVudFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2U6IElNY3BNYW5hZ2VtZW50U2VydmljZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1jcE1hbmFnZW1lbnRTZXJ2aWNlOiBJTWNwTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UgYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlOiBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElSZW1vdGVVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJUmVtb3RlVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVtb3RlQWdlbnRDb25uZWN0aW9uID0gcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAocmVtb3RlQWdlbnRDb25uZWN0aW9uKSB7XG5cdFx0XHR0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwTWFuYWdlbWVudENoYW5uZWxDbGllbnQsIHJlbW90ZUFnZW50Q29ubmVjdGlvbi5nZXRDaGFubmVsPElDaGFubmVsPignbWNwTWFuYWdlbWVudCcpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5vbkluc3RhbGxNY3BTZXJ2ZXIoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdGlmICh1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5tY3BSZXNvdXJjZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlLmZpcmUoeyAuLi5lLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsTWNwU2VydmVycyhlID0+IHtcblx0XHRcdGNvbnN0IHsgbWNwU2VydmVySW5zdGFsbFJlc3VsdCwgbWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGUgfSA9IHRoaXMuY3JlYXRlSW5zdGFsbE1jcFNlcnZlclJlc3VsdHNGcm9tRXZlbnQoZSwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKTtcblx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMuZmlyZShtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0KTtcblx0XHRcdGlmIChtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0SW5DdXJyZW50UHJvZmlsZS5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUuZmlyZShtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0SW5DdXJyZW50UHJvZmlsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZFVwZGF0ZU1jcFNlcnZlcnMoZSA9PiB7XG5cdFx0XHRjb25zdCB7IG1jcFNlcnZlckluc3RhbGxSZXN1bHQsIG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlIH0gPSB0aGlzLmNyZWF0ZUluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRzRnJvbUV2ZW50KGUsIExvY2FsTWNwU2VydmVyU2NvcGUuVXNlcik7XG5cdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZmlyZShtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0KTtcblx0XHRcdGlmIChtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0SW5DdXJyZW50UHJvZmlsZS5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRVcGRhdGVNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZS5maXJlKG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uVW5pbnN0YWxsTWNwU2VydmVyKGUgPT4ge1xuXHRcdFx0dGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdGlmICh1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5tY3BSZXNvdXJjZSwgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZmlyZSh7IC4uLmUsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbE1jcFNlcnZlcihlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoZSk7XG5cdFx0XHRpZiAodXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUubWNwUmVzb3VyY2UsIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlLmZpcmUoeyAuLi5lLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2Uub25JbnN0YWxsTWNwU2VydmVyKGFzeW5jIGUgPT4ge1xuXHRcdFx0dGhpcy5fb25JbnN0YWxsTWNwU2VydmVyLmZpcmUoZSk7XG5cdFx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlLmZpcmUoeyAuLi5lLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgeyBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0IH0gPSB0aGlzLmNyZWF0ZUluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRzRnJvbUV2ZW50KGUsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKTtcblx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMuZmlyZShtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0KTtcblx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnNJbkN1cnJlbnRQcm9maWxlLmZpcmUobWNwU2VydmVySW5zdGFsbFJlc3VsdCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZS5vblVuaW5zdGFsbE1jcFNlcnZlcihhc3luYyBlID0+IHtcblx0XHRcdHRoaXMuX29uVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoZSk7XG5cdFx0XHR0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZmlyZSh7IC4uLmUsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVW5pbnN0YWxsTWNwU2VydmVyKGFzeW5jIGUgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5maXJlKHsgLi4uZSwgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVcGRhdGVNY3BTZXJ2ZXJzKGUgPT4ge1xuXHRcdFx0Y29uc3QgeyBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0IH0gPSB0aGlzLmNyZWF0ZUluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRzRnJvbUV2ZW50KGUsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKTtcblx0XHRcdHRoaXMuX29uRGlkVXBkYXRlTWNwU2VydmVycy5maXJlKG1jcFNlcnZlckluc3RhbGxSZXN1bHQpO1xuXHRcdFx0dGhpcy5fb25EaWRVcGRhdGVNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZS5maXJlKG1jcFNlcnZlckluc3RhbGxSZXN1bHQpO1xuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uSW5zdGFsbE1jcFNlcnZlcihhc3luYyBlID0+IHtcblx0XHRcdFx0dGhpcy5fb25JbnN0YWxsTWNwU2VydmVyLmZpcmUoZSk7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZU1jcFJlc291cmNlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVNY3BSZXNvdXJjZSh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAocmVtb3RlTWNwUmVzb3VyY2UgPyB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5tY3BSZXNvdXJjZSwgcmVtb3RlTWNwUmVzb3VyY2UpIDogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlckluQ3VycmVudFByb2ZpbGUuZmlyZSh7IC4uLmUsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzKGUgPT4gdGhpcy5oYW5kbGVSZW1vdGVJbnN0YWxsTWNwU2VydmVyUmVzdWx0c0Zyb21FdmVudChlLCB0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLCB0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVcGRhdGVNY3BTZXJ2ZXJzKGUgPT4gdGhpcy5oYW5kbGVSZW1vdGVJbnN0YWxsTWNwU2VydmVyUmVzdWx0c0Zyb21FdmVudChlLCB0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLCB0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzSW5DdXJyZW50UHJvZmlsZSkpKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZS5vblVuaW5zdGFsbE1jcFNlcnZlcihhc3luYyBlID0+IHtcblx0XHRcdFx0dGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdFx0Y29uc3QgcmVtb3RlTWNwUmVzb3VyY2UgPSBhd2FpdCB0aGlzLmdldFJlbW90ZU1jcFJlc291cmNlKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChyZW1vdGVNY3BSZXNvdXJjZSA/IHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlLm1jcFJlc291cmNlLCByZW1vdGVNY3BSZXNvdXJjZSkgOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlLmZpcmUoeyAuLi5lLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIoYXN5bmMgZSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoZSk7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZU1jcFJlc291cmNlID0gYXdhaXQgdGhpcy5nZXRSZW1vdGVNY3BSZXNvdXJjZSh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAocmVtb3RlTWNwUmVzb3VyY2UgPyB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5tY3BSZXNvdXJjZSwgcmVtb3RlTWNwUmVzb3VyY2UpIDogdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVySW5DdXJyZW50UHJvZmlsZS5maXJlKHsgLi4uZSwgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IHtcblx0XHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZS5wcmV2aW91cy5tY3BSZXNvdXJjZSwgZS5wcm9maWxlLm1jcFJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVByb2ZpbGUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSW5zdGFsbE1jcFNlcnZlclJlc3VsdHNGcm9tRXZlbnQoZTogcmVhZG9ubHkgSW5zdGFsbE1jcFNlcnZlclJlc3VsdFtdLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZSk6IHsgbWNwU2VydmVySW5zdGFsbFJlc3VsdDogSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXTsgbWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGU6IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10gfSB7XG5cdFx0Y29uc3QgbWNwU2VydmVySW5zdGFsbFJlc3VsdDogSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXSA9IFtdO1xuXHRcdGNvbnN0IG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlOiBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgZSkge1xuXHRcdFx0Y29uc3Qgd29ya2JlbmNoUmVzdWx0ID0ge1xuXHRcdFx0XHQuLi5yZXN1bHQsXG5cdFx0XHRcdGxvY2FsOiByZXN1bHQubG9jYWwgPyB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdC5sb2NhbCwgc2NvcGUpIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0bWNwU2VydmVySW5zdGFsbFJlc3VsdC5wdXNoKHdvcmtiZW5jaFJlc3VsdCk7XG5cdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocmVzdWx0Lm1jcFJlc291cmNlLCB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlLnB1c2god29ya2JlbmNoUmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0LCBtY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0SW5DdXJyZW50UHJvZmlsZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVSZW1vdGVJbnN0YWxsTWNwU2VydmVyUmVzdWx0c0Zyb21FdmVudChlOiByZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10sIGVtaXR0ZXI6IEVtaXR0ZXI8cmVhZG9ubHkgSW5zdGFsbE1jcFNlcnZlclJlc3VsdFtdPiwgY3VycmVudFByb2ZpbGVFbWl0dGVyOiBFbWl0dGVyPHJlYWRvbmx5IElXb3JrYmVuY2hNY3BTZXJ2ZXJJbnN0YWxsUmVzdWx0W10+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWNwU2VydmVySW5zdGFsbFJlc3VsdDogSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXSA9IFtdO1xuXHRcdGNvbnN0IG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlOiBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdID0gW107XG5cdFx0Y29uc3QgcmVtb3RlTWNwUmVzb3VyY2UgPSBhd2FpdCB0aGlzLmdldFJlbW90ZU1jcFJlc291cmNlKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSk7XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgZSkge1xuXHRcdFx0Y29uc3Qgd29ya2JlbmNoUmVzdWx0ID0ge1xuXHRcdFx0XHQuLi5yZXN1bHQsXG5cdFx0XHRcdGxvY2FsOiByZXN1bHQubG9jYWwgPyB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdC5sb2NhbCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKSA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHRcdG1jcFNlcnZlckluc3RhbGxSZXN1bHQucHVzaCh3b3JrYmVuY2hSZXN1bHQpO1xuXHRcdFx0aWYgKHJlbW90ZU1jcFJlc291cmNlID8gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocmVzdWx0Lm1jcFJlc291cmNlLCByZW1vdGVNY3BSZXNvdXJjZSkgOiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlLnB1c2god29ya2JlbmNoUmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRlbWl0dGVyLmZpcmUobWNwU2VydmVySW5zdGFsbFJlc3VsdCk7XG5cdFx0aWYgKG1jcFNlcnZlckluc3RhbGxSZXN1bHRJbkN1cnJlbnRQcm9maWxlLmxlbmd0aCkge1xuXHRcdFx0Y3VycmVudFByb2ZpbGVFbWl0dGVyLmZpcmUobWNwU2VydmVySW5zdGFsbFJlc3VsdEluQ3VycmVudFByb2ZpbGUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxlZCgpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRcdGNvbnN0IFt1c2VyU2VydmVycywgcmVtb3RlU2VydmVycywgd29ya3NwYWNlU2VydmVyc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UpLFxuXHRcdFx0dGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZT8uZ2V0SW5zdGFsbGVkKGF3YWl0IHRoaXMuZ2V0UmVtb3RlTWNwUmVzb3VyY2UoKSkgPz8gUHJvbWlzZS5yZXNvbHZlPElMb2NhbE1jcFNlcnZlcltdPihbXSksXG5cdFx0XHR0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlPy5nZXRJbnN0YWxsZWQoKSA/PyBQcm9taXNlLnJlc29sdmU8SUxvY2FsTWNwU2VydmVyW10+KFtdKSxcblx0XHRdKTtcblxuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHVzZXJTZXJ2ZXJzKSB7XG5cdFx0XHRpbnN0YWxsZWQucHVzaCh0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHNlcnZlciwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHJlbW90ZVNlcnZlcnMpIHtcblx0XHRcdGluc3RhbGxlZC5wdXNoKHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIoc2VydmVyLCBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygd29ya3NwYWNlU2VydmVycykge1xuXHRcdFx0aW5zdGFsbGVkLnB1c2godGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihzZXJ2ZXIsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluc3RhbGxlZDtcblx0fVxuXG5cdHByaXZhdGUgdG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIoc2VydmVyOiBJTG9jYWxNY3BTZXJ2ZXIsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlKTogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyIHtcblx0XHRyZXR1cm4geyAuLi5zZXJ2ZXIsIGlkOiBgbWNwLmNvbmZpZy4ke3RoaXMuZ2V0Q29uZmlnSWQoc2VydmVyLCBzY29wZSl9LiR7c2VydmVyLm5hbWV9YCwgc2NvcGUgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlnSWQoc2VydmVyOiBJTG9jYWxNY3BTZXJ2ZXIsIHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlKTogc3RyaW5nIHtcblx0XHRpZiAoc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuVXNlcikge1xuXHRcdFx0cmV0dXJuIFVTRVJfQ09ORklHX0lEO1xuXHRcdH1cblxuXHRcdGlmIChzY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKSB7XG5cdFx0XHRyZXR1cm4gUkVNT1RFX1VTRVJfQ09ORklHX0lEO1xuXHRcdH1cblxuXHRcdGlmIChzY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0XHRpZiAod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24sIHNlcnZlci5tY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIFdPUktTUEFDRV9DT05GSUdfSUQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB3b3Jrc3BhY2UuZm9sZGVycztcblx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB3b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB3b3Jrc3BhY2VGb2xkZXJzW2luZGV4XTtcblx0XHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh3b3Jrc3BhY2VGb2xkZXIudXJpLCBXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OU1tNQ1BfQ09ORklHVVJBVElPTl9LRVldKSwgc2VydmVyLm1jcFJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiBgJHtXT1JLU1BBQ0VfRk9MREVSX0NPTkZJR19JRF9QUkVGSVh9JHtpbmRleH1gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiAndW5rbm93bic7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsKHNlcnZlcjogSUluc3RhbGxhYmxlTWNwU2VydmVyLCBvcHRpb25zPzogSVdvcmtiZW5jTWNwU2VydmVySW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zID8/IHt9O1xuXG5cdFx0aWYgKG9wdGlvbnMudGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSB8fCBpc1dvcmtzcGFjZUZvbGRlcihvcHRpb25zLnRhcmdldCkpIHtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gb3B0aW9ucy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFID8gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uIDogb3B0aW9ucy50YXJnZXQudG9SZXNvdXJjZShXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OU1tNQ1BfQ09ORklHVVJBVElPTl9LRVldKTtcblx0XHRcdGlmICghbWNwUmVzb3VyY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbGxlZ2FsIHRhcmdldDogJHtvcHRpb25zLnRhcmdldH1gKTtcblx0XHRcdH1cblx0XHRcdG9wdGlvbnMubWNwUmVzb3VyY2UgPSBtY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbChzZXJ2ZXIsIG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIocmVzdWx0LCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMudGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFKSB7XG5cdFx0XHRpZiAoIXRoaXMucmVtb3RlTWNwTWFuYWdlbWVudFNlcnZpY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbGxlZ2FsIHRhcmdldDogJHtvcHRpb25zLnRhcmdldH1gKTtcblx0XHRcdH1cblx0XHRcdG9wdGlvbnMubWNwUmVzb3VyY2UgPSBhd2FpdCB0aGlzLmdldFJlbW90ZU1jcFJlc291cmNlKG9wdGlvbnMubWNwUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKHNlcnZlciwgb3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihyZXN1bHQsIExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcik7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMudGFyZ2V0ICYmIG9wdGlvbnMudGFyZ2V0ICE9PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIgJiYgb3B0aW9ucy50YXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbGxlZ2FsIHRhcmdldDogJHtvcHRpb25zLnRhcmdldH1gKTtcblx0XHR9XG5cblx0XHRvcHRpb25zLm1jcFJlc291cmNlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbChzZXJ2ZXIsIG9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxGcm9tR2FsbGVyeShzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBvcHRpb25zPzogSVdvcmtiZW5jTWNwU2VydmVySW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zID8/IHt9O1xuXG5cdFx0aWYgKG9wdGlvbnMudGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSB8fCBpc1dvcmtzcGFjZUZvbGRlcihvcHRpb25zLnRhcmdldCkpIHtcblx0XHRcdGNvbnN0IG1jcFJlc291cmNlID0gb3B0aW9ucy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFID8gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uIDogb3B0aW9ucy50YXJnZXQudG9SZXNvdXJjZShXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OU1tNQ1BfQ09ORklHVVJBVElPTl9LRVldKTtcblx0XHRcdGlmICghbWNwUmVzb3VyY2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbGxlZ2FsIHRhcmdldDogJHtvcHRpb25zLnRhcmdldH1gKTtcblx0XHRcdH1cblx0XHRcdG9wdGlvbnMubWNwUmVzb3VyY2UgPSBtY3BSZXNvdXJjZTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KHNlcnZlciwgb3B0aW9ucyk7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihyZXN1bHQsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy50YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpIHtcblx0XHRcdGlmICghdGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYElsbGVnYWwgdGFyZ2V0OiAke29wdGlvbnMudGFyZ2V0fWApO1xuXHRcdFx0fVxuXHRcdFx0b3B0aW9ucy5tY3BSZXNvdXJjZSA9IGF3YWl0IHRoaXMuZ2V0UmVtb3RlTWNwUmVzb3VyY2Uob3B0aW9ucy5tY3BSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShzZXJ2ZXIsIG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHRoaXMudG9Xb3Jrc3BhY2VNY3BTZXJ2ZXIocmVzdWx0LCBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnRhcmdldCAmJiBvcHRpb25zLnRhcmdldCAhPT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSICYmIG9wdGlvbnMudGFyZ2V0ICE9PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSWxsZWdhbCB0YXJnZXQ6ICR7b3B0aW9ucy50YXJnZXR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFvcHRpb25zLm1jcFJlc291cmNlKSB7XG5cdFx0XHRvcHRpb25zLm1jcFJlc291cmNlID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShzZXJ2ZXIsIG9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXIsIHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIsIHByb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRpZiAobG9jYWwuc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGxvY2FsLCBzZXJ2ZXIsIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihyZXN1bHQsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKTtcblx0XHR9XG5cblx0XHRpZiAobG9jYWwuc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikge1xuXHRcdFx0aWYgKCF0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSWxsZWdhbCB0YXJnZXQ6ICR7bG9jYWwuc2NvcGV9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLnVwZGF0ZU1ldGFkYXRhKGxvY2FsLCBzZXJ2ZXIsIHByb2ZpbGVMb2NhdGlvbik7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1dvcmtzcGFjZU1jcFNlcnZlcihyZXN1bHQsIExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS51cGRhdGVNZXRhZGF0YShsb2NhbCwgc2VydmVyLCBwcm9maWxlTG9jYXRpb24pO1xuXHRcdHJldHVybiB0aGlzLnRvV29ya3NwYWNlTWNwU2VydmVyKHJlc3VsdCwgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyKTtcblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbChzZXJ2ZXI6IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXJ2ZXIuc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZS51bmluc3RhbGwoc2VydmVyKTtcblx0XHR9XG5cblx0XHRpZiAoc2VydmVyLnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpIHtcblx0XHRcdGlmICghdGhpcy5yZW1vdGVNY3BNYW5hZ2VtZW50U2VydmljZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYElsbGVnYWwgdGFyZ2V0OiAke3NlcnZlci5zY29wZX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnJlbW90ZU1jcE1hbmFnZW1lbnRTZXJ2aWNlLnVuaW5zdGFsbChzZXJ2ZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLnVuaW5zdGFsbChzZXJ2ZXIsIHsgbWNwUmVzb3VyY2U6IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UmVtb3RlTWNwUmVzb3VyY2UobWNwUmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghbWNwUmVzb3VyY2UgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bWNwUmVzb3VyY2UgPSBtY3BSZXNvdXJjZSA/PyB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0bGV0IHByb2ZpbGUgPSB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbmQocCA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChwLm1jcFJlc291cmNlLCBtY3BSZXNvdXJjZSkpO1xuXHRcdGlmIChwcm9maWxlKSB7XG5cdFx0XHRwcm9maWxlID0gYXdhaXQgdGhpcy5yZW1vdGVVc2VyRGF0YVByb2ZpbGVzU2VydmljZS5nZXRSZW1vdGVQcm9maWxlKHByb2ZpbGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcm9maWxlID0gKGF3YWl0IHRoaXMucmVtb3RlVXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZ2V0UmVtb3RlUHJvZmlsZXMoKSkuZmluZChwID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHAubWNwUmVzb3VyY2UsIG1jcFJlc291cmNlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9maWxlPy5tY3BSZXNvdXJjZTtcblx0fVxufVxuXG5jbGFzcyBXb3Jrc3BhY2VNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtY3BSZXNvdXJjZTogVVJJLFxuXHRcdHRhcmdldDogTWNwUmVzb3VyY2VUYXJnZXQsXG5cdFx0QElNY3BHYWxsZXJ5U2VydmljZSBtY3BHYWxsZXJ5U2VydmljZTogSU1jcEdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSBtY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlOiBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSxcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG1jcFJlc291cmNlLCB0YXJnZXQsIG1jcEdhbGxlcnlTZXJ2aWNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBtY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLCBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgaW5zdGFsbEZyb21HYWxsZXJ5KHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNQ1AgTWFuYWdlbWVudCBTZXJ2aWNlOiBpbnN0YWxsR2FsbGVyeScsIHNlcnZlci5uYW1lLCBzZXJ2ZXIuZ2FsbGVyeVVybCk7XG5cblx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7IG5hbWU6IHNlcnZlci5uYW1lLCBtY3BSZXNvdXJjZTogdGhpcy5tY3BSZXNvdXJjZSB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYWNrYWdlVHlwZSA9IG9wdGlvbnM/LnBhY2thZ2VUeXBlID8/IHNlcnZlci5jb25maWd1cmF0aW9uLnBhY2thZ2VzPy5bMF0/LnJlZ2lzdHJ5VHlwZSA/PyBSZWdpc3RyeVR5cGUuUkVNT1RFO1xuXG5cdFx0XHRjb25zdCB7IG1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIG5vdGljZXMgfSA9IHRoaXMuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChzZXJ2ZXIuY29uZmlndXJhdGlvbiwgcGFja2FnZVR5cGUpO1xuXG5cdFx0XHRpZiAobm90aWNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBNQ1AgTWFuYWdlbWVudCBTZXJ2aWNlOiBXYXJuaW5ncyB3aGlsZSBpbnN0YWxsaW5nICR7c2VydmVyLm5hbWV9YCwgbm90aWNlcyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluc3RhbGxhYmxlOiBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIgPSB7XG5cdFx0XHRcdG5hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHQuLi5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZyxcblx0XHRcdFx0XHRnYWxsZXJ5OiBzZXJ2ZXIuZ2FsbGVyeVVybCA/PyB0cnVlLFxuXHRcdFx0XHRcdHZlcnNpb246IHNlcnZlci52ZXJzaW9uXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlucHV0czogbWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHNcblx0XHRcdH07XG5cblx0XHRcdHRoaXMuZW5zdXJlU2VydmVyQWxsb3dlZChpbnN0YWxsYWJsZSk7XG5cblx0XHRcdGF3YWl0IHRoaXMubWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5hZGRNY3BTZXJ2ZXJzKFtpbnN0YWxsYWJsZV0sIHRoaXMubWNwUmVzb3VyY2UsIHRoaXMudGFyZ2V0KTtcblxuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbChzZXJ2ZXIpO1xuXHRcdFx0Y29uc3QgbG9jYWwgPSAoYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoKSkuZmluZChzID0+IHMubmFtZSA9PT0gc2VydmVyLm5hbWUpO1xuXHRcdFx0aWYgKCFsb2NhbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBpbnN0YWxsIE1DUCBzZXJ2ZXI6ICR7c2VydmVyLm5hbWV9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWw7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKFt7IG5hbWU6IHNlcnZlci5uYW1lLCBzb3VyY2U6IHNlcnZlciwgZXJyb3I6IGUsIG1jcFJlc291cmNlOiB0aGlzLm1jcFJlc291cmNlIH1dKTtcblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlTWV0YWRhdGEoKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbnN0YWxsRnJvbVVyaSgpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGdldExvY2FsU2VydmVySW5mbyhuYW1lOiBzdHJpbmcsIG1jcFNlcnZlckNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlckluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIW1jcFNlcnZlckNvbmZpZy5nYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IFttY3BTZXJ2ZXJdID0gYXdhaXQgdGhpcy5tY3BHYWxsZXJ5U2VydmljZS5nZXRNY3BTZXJ2ZXJzRnJvbUdhbGxlcnkoW3sgbmFtZSB9XSk7XG5cdFx0aWYgKCFtY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IG1jcFNlcnZlci5uYW1lLFxuXHRcdFx0dmVyc2lvbjogbWNwU2VydmVyQ29uZmlnLnZlcnNpb24sXG5cdFx0XHRkaXNwbGF5TmFtZTogbWNwU2VydmVyLmRpc3BsYXlOYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IG1jcFNlcnZlci5kZXNjcmlwdGlvbixcblx0XHRcdGdhbGxlcnlVcmw6IG1jcFNlcnZlci5nYWxsZXJ5VXJsLFxuXHRcdFx0bWFuaWZlc3Q6IG1jcFNlcnZlci5jb25maWd1cmF0aW9uLFxuXHRcdFx0cHVibGlzaGVyOiBtY3BTZXJ2ZXIucHVibGlzaGVyLFxuXHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IG1jcFNlcnZlci5wdWJsaXNoZXJEaXNwbGF5TmFtZSxcblx0XHRcdHJlcG9zaXRvcnlVcmw6IG1jcFNlcnZlci5yZXBvc2l0b3J5VXJsLFxuXHRcdFx0aWNvbjogbWNwU2VydmVyLmljb24sXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbkluc3RhbGwoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciB8IElJbnN0YWxsYWJsZU1jcFNlcnZlcik6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG59XG5cbmNsYXNzIFdvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RNY3BNYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElNY3BNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25JbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5zdGFsbE1jcFNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25JbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25JbnN0YWxsTWNwU2VydmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzID0gdGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZU1jcFNlcnZlcnMgPSB0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Vbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBhbGxNY3BTZXJ2ZXJzOiBJTG9jYWxNY3BTZXJ2ZXJbXSA9IFtdO1xuXG5cdHByaXZhdGUgd29ya3NwYWNlQ29uZmlndXJhdGlvbj86IFVSSSB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2VzID0gbmV3IFJlc291cmNlTWFwPHsgc2VydmljZTogV29ya3NwYWNlTWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZSB9ICYgSURpc3Bvc2FibGU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UgYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlOiBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLmluaXRpYWxpemUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCk7XG5cdFx0XHRhd2FpdCB0aGlzLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyh7IGFkZGVkOiB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMsIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGUgPT4gdGhpcy5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZShlID0+IHRoaXMub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgpKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGluaXRpYWxpemUgd29ya3NwYWNlIGZvbGRlcnMnLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlV29ya3NwYWNlU2VydmljZSh0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb247XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbikge1xuXHRcdFx0YXdhaXQgdGhpcy5hZGRXb3Jrc3BhY2VTZXJ2aWNlKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbiwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGU6IElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKGUucmVtb3ZlZC5tYXAoZm9sZGVyID0+IHRoaXMucmVtb3ZlV29ya3NwYWNlU2VydmljZShmb2xkZXIudG9SZXNvdXJjZShXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OU1tNQ1BfQ09ORklHVVJBVElPTl9LRVldKSkpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChlLmFkZGVkLm1hcChmb2xkZXIgPT4gdGhpcy5hZGRXb3Jrc3BhY2VTZXJ2aWNlKGZvbGRlci50b1Jlc291cmNlKFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TW01DUF9DT05GSUdVUkFUSU9OX0tFWV0pLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpKSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRXb3Jrc3BhY2VTZXJ2aWNlKG1jcFJlc291cmNlOiBVUkksIHRhcmdldDogTWNwUmVzb3VyY2VUYXJnZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZXMuaGFzKG1jcFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlLCBtY3BSZXNvdXJjZSwgdGFyZ2V0KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkU2VydmVycyA9IGF3YWl0IHNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0XHR0aGlzLmFsbE1jcFNlcnZlcnMucHVzaCguLi5pbnN0YWxsZWRTZXJ2ZXJzKTtcblx0XHRcdGlmIChpbnN0YWxsZWRTZXJ2ZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFsbFJlc3VsdHM6IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXSA9IGluc3RhbGxlZFNlcnZlcnMubWFwKHNlcnZlciA9PiAoe1xuXHRcdFx0XHRcdG5hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0XHRcdGxvY2FsOiBzZXJ2ZXIsXG5cdFx0XHRcdFx0bWNwUmVzb3VyY2U6IHNlcnZlci5tY3BSZXNvdXJjZVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMuZmlyZShpbnN0YWxsUmVzdWx0cyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gZ2V0IGluc3RhbGxlZCBzZXJ2ZXJzIGZyb20nLCBtY3BSZXNvdXJjZS50b1N0cmluZygpLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25JbnN0YWxsTWNwU2VydmVyKGUgPT4gdGhpcy5fb25JbnN0YWxsTWNwU2VydmVyLmZpcmUoZSkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB7IGxvY2FsIH0gb2YgZSkge1xuXHRcdFx0XHRpZiAobG9jYWwpIHtcblx0XHRcdFx0XHR0aGlzLmFsbE1jcFNlcnZlcnMucHVzaChsb2NhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMuZmlyZShlKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRVcGRhdGVNY3BTZXJ2ZXJzKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB7IGxvY2FsLCBtY3BSZXNvdXJjZSB9IG9mIGUpIHtcblx0XHRcdFx0aWYgKGxvY2FsKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmFsbE1jcFNlcnZlcnMuZmluZEluZGV4KHNlcnZlciA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzZXJ2ZXIubWNwUmVzb3VyY2UsIG1jcFJlc291cmNlKSAmJiBzZXJ2ZXIubmFtZSA9PT0gbG9jYWwubmFtZSk7XG5cdFx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0dGhpcy5hbGxNY3BTZXJ2ZXJzLnNwbGljZShpbmRleCwgMSwgbG9jYWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRVcGRhdGVNY3BTZXJ2ZXJzLmZpcmUoZSk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uVW5pbnN0YWxsTWNwU2VydmVyKGUgPT4gdGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkVW5pbnN0YWxsTWNwU2VydmVyKGUgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmFsbE1jcFNlcnZlcnMuZmluZEluZGV4KHNlcnZlciA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzZXJ2ZXIubWNwUmVzb3VyY2UsIGUubWNwUmVzb3VyY2UpICYmIHNlcnZlci5uYW1lID09PSBlLm5hbWUpO1xuXHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLmFsbE1jcFNlcnZlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZXMuc2V0KG1jcFJlc291cmNlLCB7IHNlcnZpY2UsIGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVtb3ZlV29ya3NwYWNlU2VydmljZShtY3BSZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmljZUl0ZW0gPSB0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlcy5nZXQobWNwUmVzb3VyY2UpO1xuXHRcdGlmIChzZXJ2aWNlSXRlbSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFsbGVkU2VydmVycyA9IGF3YWl0IHNlcnZpY2VJdGVtLnNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0XHRcdHRoaXMuYWxsTWNwU2VydmVycyA9IHRoaXMuYWxsTWNwU2VydmVycy5maWx0ZXIoc2VydmVyID0+ICFpbnN0YWxsZWRTZXJ2ZXJzLnNvbWUodW5pbnN0YWxsZWQgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodW5pbnN0YWxsZWQubWNwUmVzb3VyY2UsIHNlcnZlci5tY3BSZXNvdXJjZSkpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgaW5zdGFsbGVkU2VydmVycykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoe1xuXHRcdFx0XHRcdFx0bmFtZTogc2VydmVyLm5hbWUsXG5cdFx0XHRcdFx0XHRtY3BSZXNvdXJjZTogc2VydmVyLm1jcFJlc291cmNlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gZ2V0IGluc3RhbGxlZCBzZXJ2ZXJzIGZyb20nLCBtY3BSZXNvdXJjZS50b1N0cmluZygpLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlcy5kZWxldGUobWNwUmVzb3VyY2UpO1xuXHRcdFx0c2VydmljZUl0ZW0uZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxlZCgpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuYWxsTWNwU2VydmVycztcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwoc2VydmVyOiBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0aWYgKCFvcHRpb25zPy5tY3BSZXNvdXJjZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNQ1AgcmVzb3VyY2UgaXMgcmVxdWlyZWQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBtY3BNYW5hZ2VtZW50U2VydmljZUl0ZW0gPSB0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlcy5nZXQob3B0aW9ucz8ubWNwUmVzb3VyY2UpO1xuXHRcdGlmICghbWNwTWFuYWdlbWVudFNlcnZpY2VJdGVtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIE1DUCBtYW5hZ2VtZW50IHNlcnZpY2UgZm91bmQgZm9yIHJlc291cmNlOiAke29wdGlvbnM/Lm1jcFJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1jcE1hbmFnZW1lbnRTZXJ2aWNlSXRlbS5zZXJ2aWNlLmluc3RhbGwoc2VydmVyLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHVuaW5zdGFsbChzZXJ2ZXI6IElMb2NhbE1jcFNlcnZlciwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IHNlcnZlci5tY3BSZXNvdXJjZTtcblxuXHRcdGNvbnN0IG1jcE1hbmFnZW1lbnRTZXJ2aWNlSXRlbSA9IHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2VzLmdldChtY3BSZXNvdXJjZSk7XG5cdFx0aWYgKCFtY3BNYW5hZ2VtZW50U2VydmljZUl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gTUNQIG1hbmFnZW1lbnQgc2VydmljZSBmb3VuZCBmb3IgcmVzb3VyY2U6ICR7bWNwUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWNwTWFuYWdlbWVudFNlcnZpY2VJdGVtLnNlcnZpY2UudW5pbnN0YWxsKHNlcnZlciwgb3B0aW9ucyk7XG5cdH1cblxuXHRpbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0aWYgKCFvcHRpb25zPy5tY3BSZXNvdXJjZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNQ1AgcmVzb3VyY2UgaXMgcmVxdWlyZWQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBtY3BNYW5hZ2VtZW50U2VydmljZUl0ZW0gPSB0aGlzLndvcmtzcGFjZU1jcE1hbmFnZW1lbnRTZXJ2aWNlcy5nZXQob3B0aW9ucz8ubWNwUmVzb3VyY2UpO1xuXHRcdGlmICghbWNwTWFuYWdlbWVudFNlcnZpY2VJdGVtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIE1DUCBtYW5hZ2VtZW50IHNlcnZpY2UgZm91bmQgZm9yIHJlc291cmNlOiAke29wdGlvbnM/Lm1jcFJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1jcE1hbmFnZW1lbnRTZXJ2aWNlSXRlbS5zZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5LCBvcHRpb25zKTtcblx0fVxuXG5cdHVwZGF0ZU1ldGFkYXRhKCk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMud29ya3NwYWNlTWNwTWFuYWdlbWVudFNlcnZpY2VzLmZvckVhY2goc2VydmljZSA9PiBzZXJ2aWNlLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy53b3Jrc3BhY2VNY3BNYW5hZ2VtZW50U2VydmljZXMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBb0M7QUFDN0MsU0FBMEIsdUJBQXFMLG9CQUFzQywyQkFBMkIsb0JBQW9CO0FBQ3BTLFNBQVMsdUJBQXVCLDhCQUE4QjtBQUM5RCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0NBQXFEO0FBQzlELFNBQVMsbUJBQW1CLGdDQUFnRjtBQUM1RyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QiwyQ0FBMkM7QUFDM0UsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFFcEMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyw4QkFBOEIsNENBQWlFO0FBQ3hHLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBSXJCLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sb0NBQW9DO0FBTTFDLElBQVcsc0JBQVgsa0JBQVdBLHlCQUFYO0FBQ04sRUFBQUEscUJBQUEsVUFBTztBQUNQLEVBQUFBLHFCQUFBLGdC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
