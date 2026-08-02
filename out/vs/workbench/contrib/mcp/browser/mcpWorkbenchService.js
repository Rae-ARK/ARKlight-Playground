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
import { Emitter, Event } from "../../../../base/common/event.js";
import { createCommandUri, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IMcpGalleryService, mcpAccessConfig, McpAccessValue, IAllowedMcpServersService, McpGalleryResolveStatus } from "../../../../platform/mcp/common/mcpManagement.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { McpServerType } from "../../../../platform/mcp/common/mcpPlatformTypes.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { StorageScope } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { MCP_CONFIGURATION_KEY, WORKSPACE_STANDALONE_CONFIGURATIONS } from "../../../services/configuration/common/configuration.js";
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IWorkbenchMcpManagementService, LocalMcpServerScope, REMOTE_USER_CONFIG_ID, USER_CONFIG_ID, WORKSPACE_CONFIG_ID, WORKSPACE_FOLDER_CONFIG_ID_PREFIX } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { mcpConfigurationSection } from "../common/mcpConfiguration.js";
import { HasInstalledMcpServersContext, IMcpService, IMcpWorkbenchService, McpCollectionSortOrder, McpServerEnablementState, McpServerInstallState, McpServersGalleryStatusContext } from "../common/mcpTypes.js";
import { ContributionEnablementState } from "../../chat/common/enablement.js";
import { McpServerEditorInput } from "./mcpServerEditorInput.js";
import { IMcpGalleryManifestService } from "../../../../platform/mcp/common/mcpGalleryManifest.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { autorun, runOnChange } from "../../../../base/common/observable.js";
import Severity from "../../../../base/common/severity.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
let McpWorkbenchServer = class {
  constructor(installStateProvider, runtimeStateProvider, local, gallery, installable, mcpGalleryService, fileService) {
    this.installStateProvider = installStateProvider;
    this.runtimeStateProvider = runtimeStateProvider;
    this.local = local;
    this.gallery = gallery;
    this.installable = installable;
    this.mcpGalleryService = mcpGalleryService;
    this.fileService = fileService;
    this.local = local;
  }
  get id() {
    return this.local?.id ?? this.gallery?.name ?? this.installable?.name ?? this.name;
  }
  get name() {
    return this.gallery?.name ?? this.local?.name ?? this.installable?.name ?? "";
  }
  get label() {
    return this.gallery?.displayName ?? this.local?.displayName ?? this.local?.name ?? this.installable?.name ?? "";
  }
  get icon() {
    return this.gallery?.icon ?? this.local?.icon;
  }
  get installState() {
    return this.installStateProvider(this);
  }
  get codicon() {
    return this.gallery?.codicon ?? this.local?.codicon;
  }
  get publisherDisplayName() {
    return this.gallery?.publisherDisplayName ?? this.local?.publisherDisplayName ?? this.gallery?.publisher ?? this.local?.publisher;
  }
  get publisherUrl() {
    return this.gallery?.publisherDomain?.link;
  }
  get description() {
    return this.gallery?.description ?? this.local?.description ?? "";
  }
  get starsCount() {
    return this.gallery?.starsCount ?? 0;
  }
  get license() {
    return this.gallery?.license;
  }
  get repository() {
    return this.gallery?.repositoryUrl;
  }
  get config() {
    return this.local?.config ?? this.installable?.config;
  }
  get runtimeStatus() {
    return this.runtimeStateProvider(this);
  }
  get readmeUrl() {
    return this.local?.readmeUrl ?? (this.gallery?.readmeUrl ? URI.parse(this.gallery.readmeUrl) : void 0);
  }
  async getReadme(token) {
    if (this.local?.readmeUrl) {
      const content = await this.fileService.readFile(this.local.readmeUrl);
      return content.value.toString();
    }
    if (this.gallery?.readme) {
      return this.gallery.readme;
    }
    if (this.gallery?.readmeUrl) {
      return this.mcpGalleryService.getReadme(this.gallery, token);
    }
    return Promise.reject(new Error("not available"));
  }
  async getManifest(token) {
    if (this.local?.manifest) {
      return this.local.manifest;
    }
    if (this.gallery) {
      return this.gallery.configuration;
    }
    throw new Error("No manifest available");
  }
};
McpWorkbenchServer = __decorateClass([
  __decorateParam(5, IMcpGalleryService),
  __decorateParam(6, IFileService)
], McpWorkbenchServer);
let McpWorkbenchService = class extends Disposable {
  constructor(mcpGalleryManifestService, mcpGalleryService, mcpManagementService, editorService, userDataProfilesService, uriIdentityService, workspaceService, environmentService, labelService, productService, remoteAgentService, configurationService, instantiationService, telemetryService, logService, extensionsWorkbenchService, allowedMcpServersService, mcpService, urlService) {
    super();
    this.mcpGalleryService = mcpGalleryService;
    this.mcpManagementService = mcpManagementService;
    this.editorService = editorService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceService = workspaceService;
    this.environmentService = environmentService;
    this.labelService = labelService;
    this.productService = productService;
    this.remoteAgentService = remoteAgentService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.allowedMcpServersService = allowedMcpServersService;
    this.mcpService = mcpService;
    this.installing = [];
    this.uninstalling = [];
    this._local = [];
    this.registrySyncGeneration = 0;
    this.registryGeneration = 0;
    this.localQueryGeneration = 0;
    this.profileChangeGeneration = 0;
    // Source identity is intentionally trusted only in-process; IPC copies are re-verified.
    this.gallerySourceGenerations = /* @__PURE__ */ new WeakMap();
    this.registrySyncDelayer = this._register(new ThrottledDelayer(0));
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this._onReset = this._register(new Emitter());
    this.onReset = this._onReset.event;
    this._register(this.mcpManagementService.onDidInstallMcpServersInCurrentProfile((e) => this.onDidInstallMcpServers(e)));
    this._register(this.mcpManagementService.onDidUpdateMcpServersInCurrentProfile((e) => this.onDidUpdateMcpServers(e)));
    this._register(this.mcpManagementService.onDidUninstallMcpServerInCurrentProfile((e) => this.onDidUninstallMcpServer(e)));
    this._register(this.mcpManagementService.onDidChangeProfile((e) => this.onDidChangeProfile()));
    this.queryLocal().then(() => {
      if (this._store.isDisposed) {
        return;
      }
      this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifest(() => {
        this.invalidateRegistryVerification();
        this.scheduleRegistrySync();
      }));
      this.scheduleRegistrySync();
    });
    urlService.registerHandler(this);
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(mcpAccessConfig)) {
        this._onChange.fire(void 0);
      }
    }));
    this._register(this.allowedMcpServersService.onDidChangeAllowedMcpServers(() => {
      this._local = this.sort(this._local);
      this._onChange.fire(void 0);
    }));
    this._register(runOnChange(mcpService.servers, () => {
      this._local = this.sort(this._local);
      this._onChange.fire(void 0);
    }));
    this._register(autorun((reader) => {
      for (const server of mcpService.servers.read(reader)) {
        server.enablement.read(reader);
      }
      this._onChange.fire(void 0);
    }));
  }
  get local() {
    return [...this._local];
  }
  async onDidChangeProfile() {
    const profileChangeGeneration = ++this.profileChangeGeneration;
    const generation = ++this.localQueryGeneration;
    this.invalidateRegistryVerification();
    await this.queryLocalForGeneration(generation);
    if (profileChangeGeneration !== this.profileChangeGeneration) {
      return;
    }
    this._onReset.fire();
    this.scheduleRegistrySync();
  }
  invalidateRegistryVerification() {
    this.registryGeneration++;
    this.registrySyncGeneration++;
    for (const server of this._local) {
      server.gallery = void 0;
    }
    this._onChange.fire(void 0);
  }
  areSameMcpServers(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.name === b.name && a.scope === b.scope;
  }
  onDidUninstallMcpServer(e) {
    if (e.error) {
      return;
    }
    const uninstalled = this._local.find((server) => this.areSameMcpServers(server.local, e));
    if (uninstalled) {
      this._local = this._local.filter((server) => server !== uninstalled);
      this._onChange.fire(uninstalled);
    }
  }
  onDidInstallMcpServers(e) {
    let needsRegistrySync = false;
    for (const { local, name, source } of e) {
      let server = this.installing.find((server2) => server2.local && local ? this.areSameMcpServers(server2.local, local) : server2.name === name);
      this.installing = server ? this.installing.filter((e2) => e2 !== server) : this.installing;
      if (local) {
        const trustedGallery = this.getTrustedGallerySource(source) ?? this.getTrustedGallerySource(server?.gallery);
        if (server) {
          server.local = local;
        } else {
          server = this.instantiationService.createInstance(McpWorkbenchServer, (e2) => this.getInstallState(e2), (e2) => this.getRuntimeStatus(e2), local, void 0, void 0);
        }
        server.gallery = trustedGallery?.name === local.name ? trustedGallery : void 0;
        needsRegistrySync = true;
        this._local = this._local.filter((server2) => !this.areSameMcpServers(server2.local, local));
        this.addServer(server);
      }
      this._onChange.fire(server);
    }
    if (needsRegistrySync) {
      this.scheduleRegistrySync();
    }
  }
  onDidUpdateMcpServers(e) {
    let needsRegistrySync = false;
    for (const result of e) {
      if (!result.local) {
        continue;
      }
      const serverIndex = this._local.findIndex((server2) => this.areSameMcpServers(server2.local, result.local));
      let server;
      if (serverIndex !== -1) {
        this._local[serverIndex].local = result.local;
        server = this._local[serverIndex];
      } else {
        server = this.instantiationService.createInstance(McpWorkbenchServer, (e2) => this.getInstallState(e2), (e2) => this.getRuntimeStatus(e2), result.local, void 0, void 0);
        this.addServer(server);
      }
      const trustedGallery = this.getTrustedGallerySource(result.source) ?? this.getTrustedGallerySource(server.gallery);
      server.gallery = trustedGallery?.name === result.local.name ? trustedGallery : void 0;
      needsRegistrySync = true;
      this._onChange.fire(server);
    }
    if (needsRegistrySync) {
      this.scheduleRegistrySync();
    }
  }
  fromGallery(gallery, registryGeneration) {
    this.rememberGallerySource(gallery, registryGeneration);
    for (const local of this._local) {
      if (local.name === gallery.name) {
        return local;
      }
    }
    return void 0;
  }
  scheduleRegistrySync() {
    const generation = ++this.registrySyncGeneration;
    void this.registrySyncDelayer.trigger(() => this.syncInstalledMcpServers(generation)).catch((error) => this.logService.error(error));
  }
  async syncInstalledMcpServers(generation) {
    if (!this.mcpGalleryService.isEnabled()) {
      return;
    }
    const servers = this.local.flatMap((server) => server.local ? [{ server, local: server.local }] : []);
    const infosByName = /* @__PURE__ */ new Map();
    for (const { local } of servers) {
      const existing = infosByName.get(local.name);
      if (!existing || !existing.id && local.galleryId) {
        infosByName.set(local.name, { name: local.name, id: local.galleryId });
      }
    }
    const infos = [...infosByName.values()];
    if (!infos.length) {
      return;
    }
    const resolved = await this.mcpGalleryService.resolveMcpServersFromGallery(infos);
    if (generation !== this.registrySyncGeneration) {
      return;
    }
    this.syncInstalledMcpServersWithGallery(resolved, servers, generation);
  }
  syncInstalledMcpServersWithGallery(resolved, servers, generation) {
    for (const { server: mcpServer, local } of servers) {
      if (generation !== this.registrySyncGeneration || !this._local.includes(mcpServer) || mcpServer.local !== local) {
        continue;
      }
      const result = resolved.get(local.name);
      if (!result || result.status === McpGalleryResolveStatus.Failed) {
        continue;
      }
      if (result.status === McpGalleryResolveStatus.NotFound) {
        if (mcpServer.gallery) {
          mcpServer.gallery = void 0;
          this._onChange.fire(mcpServer);
        }
        continue;
      }
      const gallery = result.server;
      const changed = mcpServer.gallery !== gallery;
      this.rememberGallerySource(gallery);
      mcpServer.gallery = gallery;
      if (changed) {
        this._onChange.fire(mcpServer);
      }
    }
  }
  async queryGallery(options, token) {
    if (!this.mcpGalleryService.isEnabled()) {
      return {
        firstPage: { items: [], hasMore: false },
        getNextPage: async () => ({ items: [], hasMore: false })
      };
    }
    const registryGeneration = this.registryGeneration;
    const pager = await this.mcpGalleryService.query(options, token);
    const mapPage = (page) => ({
      items: page.items.map((gallery) => this.fromGallery(gallery, registryGeneration) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, gallery, void 0)),
      hasMore: page.hasMore
    });
    return {
      firstPage: mapPage(pager.firstPage),
      getNextPage: async (ct) => {
        const nextPage = await pager.getNextPage(ct);
        return mapPage(nextPage);
      }
    };
  }
  async queryLocal() {
    await this.queryLocalForGeneration(++this.localQueryGeneration);
    return [...this.local];
  }
  async queryLocalForGeneration(generation) {
    const installed = await this.mcpManagementService.getInstalled();
    if (generation !== this.localQueryGeneration) {
      return false;
    }
    this._local = this.sort(installed.map((i) => {
      const existing = this._local.find((local2) => local2.id === i.id);
      const local = existing ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, void 0, void 0);
      local.local = i;
      return local;
    }));
    this._onChange.fire(void 0);
    return true;
  }
  rememberGallerySource(gallery, registryGeneration = this.registryGeneration) {
    if (registryGeneration === this.registryGeneration) {
      this.gallerySourceGenerations.set(gallery, registryGeneration);
    }
  }
  getTrustedGallerySource(gallery) {
    return gallery && this.gallerySourceGenerations.get(gallery) === this.registryGeneration ? gallery : void 0;
  }
  addServer(server) {
    this._local.push(server);
    this._local = this.sort(this._local);
  }
  sort(local) {
    return local.sort((a, b) => {
      if (a.name === b.name) {
        if (!a.runtimeStatus || a.runtimeStatus.state === McpServerEnablementState.Enabled) {
          return -1;
        }
        if (!b.runtimeStatus || b.runtimeStatus.state === McpServerEnablementState.Enabled) {
          return 1;
        }
        return 0;
      }
      return a.name.localeCompare(b.name);
    });
  }
  getEnabledLocalMcpServers() {
    const result = /* @__PURE__ */ new Map();
    const userRemote = [];
    const workspace = [];
    for (const server of this.local) {
      const enablementStatus = this.getEnablementStatus(server);
      if (enablementStatus && enablementStatus.state !== McpServerEnablementState.Enabled) {
        continue;
      }
      if (server.local?.scope === LocalMcpServerScope.User) {
        result.set(server.name, server.local);
      } else if (server.local?.scope === LocalMcpServerScope.RemoteUser) {
        userRemote.push(server.local);
      } else if (server.local?.scope === LocalMcpServerScope.Workspace) {
        workspace.push(server.local);
      }
    }
    for (const server of userRemote) {
      const existing = result.get(server.name);
      if (existing) {
        this.logService.warn(localize("overwriting", "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
      }
      result.set(server.name, server);
    }
    for (const server of workspace) {
      const existing = result.get(server.name);
      if (existing) {
        this.logService.warn(localize("overwriting", "Overwriting mcp server '{0}' from {1} with {2}.", server.name, server.mcpResource.path, existing.mcpResource.path));
      }
      result.set(server.name, server);
    }
    return [...result.values()];
  }
  canInstall(mcpServer) {
    if (!(mcpServer instanceof McpWorkbenchServer)) {
      return new MarkdownString().appendText(localize("not an extension", "The provided object is not an mcp server."));
    }
    if (mcpServer.gallery) {
      const result = this.mcpManagementService.canInstall(mcpServer.gallery);
      if (result === true) {
        return true;
      }
      return result;
    }
    if (mcpServer.installable) {
      const result = this.mcpManagementService.canInstall(mcpServer.installable);
      if (result === true) {
        return true;
      }
      return result;
    }
    return new MarkdownString().appendText(localize("cannot be installed", "Cannot install the '{0}' MCP Server because it is not available in this setup.", mcpServer.label));
  }
  async install(server, installOptions) {
    if (!(server instanceof McpWorkbenchServer)) {
      throw new Error("Invalid server instance");
    }
    if (server.installable) {
      const installable = server.installable;
      return this.doInstall(server, () => this.mcpManagementService.install(installable, installOptions));
    }
    if (server.gallery) {
      const gallery = server.gallery;
      return this.doInstall(server, () => this.mcpManagementService.installFromGallery(gallery, installOptions));
    }
    throw new Error("No installable server found");
  }
  async uninstall(server) {
    if (!server.local) {
      throw new Error("Local server is missing");
    }
    await this.mcpManagementService.uninstall(server.local);
  }
  async doInstall(server, installTask) {
    const source = server.gallery ? "gallery" : "local";
    const serverName = server.name;
    const hasInputs = !!(server.installable?.inputs && server.installable.inputs.length > 0);
    this.installing.push(server);
    this._onChange.fire(server);
    try {
      await installTask();
      const result = await this.waitAndGetInstalledMcpServer(server);
      this.telemetryService.publicLog2("mcp/serverInstall", {
        serverName,
        source,
        scope: result.local?.scope ?? "unknown",
        success: true,
        hasInputs
      });
      return result;
    } catch (error) {
      this.telemetryService.publicLog2("mcp/serverInstall", {
        serverName,
        source,
        scope: "unknown",
        success: false,
        error: error instanceof Error ? error.message : String(error),
        hasInputs
      });
      throw error;
    } finally {
      if (this.installing.includes(server)) {
        this.installing.splice(this.installing.indexOf(server), 1);
        this._onChange.fire(server);
      }
    }
  }
  async waitAndGetInstalledMcpServer(server) {
    let installed = this.local.find((local) => local.name === server.name);
    if (!installed) {
      await Event.toPromise(Event.filter(this.onChange, (e) => !!e && this.local.some((local) => local.name === server.name)));
    }
    installed = this.local.find((local) => local.name === server.name);
    if (!installed) {
      throw new Error("Extension should have been installed");
    }
    return installed;
  }
  getMcpConfigPath(arg) {
    if (arg instanceof URI) {
      const mcpResource = arg;
      for (const profile of this.userDataProfilesService.profiles) {
        if (this.uriIdentityService.extUri.isEqual(profile.mcpResource, mcpResource)) {
          return this.getUserMcpConfigPath(mcpResource);
        }
      }
      return this.remoteAgentService.getEnvironment().then((remoteEnvironment) => {
        if (remoteEnvironment && this.uriIdentityService.extUri.isEqual(remoteEnvironment.mcpResource, mcpResource)) {
          return this.getRemoteMcpConfigPath(mcpResource);
        }
        return this.getWorkspaceMcpConfigPath(mcpResource);
      });
    }
    if (arg.scope === LocalMcpServerScope.User) {
      return this.getUserMcpConfigPath(arg.mcpResource);
    }
    if (arg.scope === LocalMcpServerScope.Workspace) {
      return this.getWorkspaceMcpConfigPath(arg.mcpResource);
    }
    if (arg.scope === LocalMcpServerScope.RemoteUser) {
      return this.getRemoteMcpConfigPath(arg.mcpResource);
    }
    return void 0;
  }
  getUserMcpConfigPath(mcpResource) {
    return {
      id: USER_CONFIG_ID,
      key: "userLocalValue",
      target: ConfigurationTarget.USER_LOCAL,
      label: localize("mcp.configuration.userLocalValue", "Global in {0}", this.productService.nameShort),
      scope: StorageScope.PROFILE,
      order: McpCollectionSortOrder.User,
      uri: mcpResource,
      section: []
    };
  }
  getRemoteMcpConfigPath(mcpResource) {
    return {
      id: REMOTE_USER_CONFIG_ID,
      key: "userRemoteValue",
      target: ConfigurationTarget.USER_REMOTE,
      label: this.environmentService.remoteAuthority ? this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority) : "Remote",
      scope: StorageScope.PROFILE,
      order: McpCollectionSortOrder.User + McpCollectionSortOrder.RemoteBoost,
      remoteAuthority: this.environmentService.remoteAuthority,
      uri: mcpResource,
      section: []
    };
  }
  getWorkspaceMcpConfigPath(mcpResource) {
    const workspace = this.workspaceService.getWorkspace();
    if (workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, mcpResource)) {
      return {
        id: WORKSPACE_CONFIG_ID,
        key: "workspaceValue",
        target: ConfigurationTarget.WORKSPACE,
        label: basename(mcpResource),
        scope: StorageScope.WORKSPACE,
        order: McpCollectionSortOrder.Workspace,
        remoteAuthority: this.environmentService.remoteAuthority,
        uri: mcpResource,
        section: ["settings", mcpConfigurationSection]
      };
    }
    const workspaceFolders = workspace.folders;
    for (let index = 0; index < workspaceFolders.length; index++) {
      const workspaceFolder = workspaceFolders[index];
      if (this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.joinPath(workspaceFolder.uri, WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY]), mcpResource)) {
        return {
          id: `${WORKSPACE_FOLDER_CONFIG_ID_PREFIX}${index}`,
          key: "workspaceFolderValue",
          target: ConfigurationTarget.WORKSPACE_FOLDER,
          label: `${workspaceFolder.name}/.vscode/mcp.json`,
          scope: StorageScope.WORKSPACE,
          remoteAuthority: this.environmentService.remoteAuthority,
          order: McpCollectionSortOrder.WorkspaceFolder,
          uri: mcpResource,
          workspaceFolder
        };
      }
    }
    return void 0;
  }
  async handleURL(uri) {
    if (uri.path === "mcp/install") {
      return this.handleMcpInstallUri(uri);
    }
    if (uri.path.startsWith("mcp/by-name/")) {
      const mcpServerName = uri.path.substring("mcp/by-name/".length);
      if (mcpServerName) {
        return this.handleMcpServerByName(mcpServerName);
      }
    }
    if (uri.path.startsWith("mcp/")) {
      const mcpServerUrl = uri.path.substring(4);
      if (mcpServerUrl) {
        return this.handleMcpServerUrl(`${Schemas.https}://${mcpServerUrl}`);
      }
    }
    return false;
  }
  async handleMcpInstallUri(uri) {
    let parsed;
    try {
      parsed = JSON.parse(decodeURIComponent(uri.query));
    } catch (e) {
      return false;
    }
    try {
      const { name, inputs, ...config } = parsed;
      if (config.gallery && this.mcpGalleryService.isEnabled()) {
        try {
          const registryGeneration = this.registryGeneration;
          const [galleryServer] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
          if (galleryServer) {
            this.rememberGallerySource(galleryServer, registryGeneration);
            const local = this.local.find((e) => e.name === galleryServer.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, galleryServer, void 0);
            this.open(local);
            return true;
          }
          this.logService.info(`MCP server '${name}' not found in gallery, installing as local`);
        } catch (e) {
          this.logService.info(`Gallery verification failed for MCP server '${name}', installing as local`);
        }
      }
      if (config.type === void 0) {
        config.type = parsed.command ? McpServerType.LOCAL : McpServerType.REMOTE;
      }
      this.open(this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, void 0, { name, config, inputs }));
    } catch (e) {
    }
    return true;
  }
  async handleMcpServerUrl(url) {
    try {
      const gallery = await this.mcpGalleryService.getMcpServer(url);
      if (!gallery) {
        this.logService.info(`MCP server '${url}' not found`);
        return true;
      }
      const local = this.local.find((e) => e.name === gallery.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, gallery, void 0);
      this.open(local);
    } catch (e) {
      this.logService.error(e);
    }
    return true;
  }
  async handleMcpServerByName(name) {
    try {
      const registryGeneration = this.registryGeneration;
      const [gallery] = await this.mcpGalleryService.getMcpServersFromGallery([{ name }]);
      if (!gallery) {
        this.logService.info(`MCP server '${name}' not found`);
        return true;
      }
      this.rememberGallerySource(gallery, registryGeneration);
      const local = this.local.find((e) => e.name === gallery.name) ?? this.instantiationService.createInstance(McpWorkbenchServer, (e) => this.getInstallState(e), (e) => this.getRuntimeStatus(e), void 0, gallery, void 0);
      this.open(local);
    } catch (e) {
      this.logService.error(e);
    }
    return true;
  }
  async openSearch(searchValue, preserveFocus) {
    await this.extensionsWorkbenchService.openSearch(`@mcp ${searchValue}`, preserveFocus);
  }
  async open(extension, options) {
    const useModal = this.configurationService.getValue("extensions.allowOpenInModalEditor");
    await this.editorService.openEditor(this.instantiationService.createInstance(McpServerEditorInput, extension), options, useModal ? MODAL_GROUP : ACTIVE_GROUP);
  }
  getInstallState(extension) {
    if (this.installing.some((i) => i.name === extension.name)) {
      return McpServerInstallState.Installing;
    }
    if (this.uninstalling.some((e) => e.name === extension.name)) {
      return McpServerInstallState.Uninstalling;
    }
    const local = this.local.find((e) => e === extension);
    return local ? McpServerInstallState.Installed : McpServerInstallState.Uninstalled;
  }
  getRuntimeStatus(mcpServer) {
    const enablementStatus = this.getEnablementStatus(mcpServer);
    if (enablementStatus) {
      return enablementStatus;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === mcpServer.id);
    if (!server) {
      return { state: McpServerEnablementState.Disabled };
    }
    const enablement = server.enablement.get();
    if (enablement === ContributionEnablementState.DisabledProfile) {
      return {
        state: McpServerEnablementState.DisabledProfile,
        message: {
          severity: Severity.Info,
          text: new MarkdownString(localize("disabled globally", "This MCP server is disabled."))
        }
      };
    }
    if (enablement === ContributionEnablementState.DisabledWorkspace) {
      return {
        state: McpServerEnablementState.DisabledWorkspace,
        message: {
          severity: Severity.Info,
          text: new MarkdownString(localize("disabled in workspace", "This MCP server is disabled for this workspace."))
        }
      };
    }
    return void 0;
  }
  getEnablementStatus(mcpServer) {
    if (!mcpServer.local) {
      return void 0;
    }
    const settingsCommandLink = createCommandUri("workbench.action.openSettings", { query: `@id:${mcpAccessConfig}` }).toString();
    const accessValue = this.configurationService.getValue(mcpAccessConfig);
    if (accessValue === McpAccessValue.None) {
      return {
        state: McpServerEnablementState.DisabledByAccess,
        message: {
          severity: Severity.Warning,
          text: new MarkdownString(localize("disabled - all not allowed", "This MCP Server is disabled because MCP servers are configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
        }
      };
    }
    if (accessValue === McpAccessValue.Registry) {
      if (!mcpServer.gallery) {
        return {
          state: McpServerEnablementState.DisabledByAccess,
          message: {
            severity: Severity.Warning,
            text: new MarkdownString(localize("disabled - some not allowed", "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
          }
        };
      }
      const remoteUrl = mcpServer.local.config.type === McpServerType.REMOTE && mcpServer.local.config.url;
      if (remoteUrl && !mcpServer.gallery.configuration.remotes?.some((remote) => remote.url === remoteUrl)) {
        return {
          state: McpServerEnablementState.DisabledByAccess,
          message: {
            severity: Severity.Warning,
            text: new MarkdownString(localize("disabled - some not allowed", "This MCP Server is disabled because it is configured to be disabled in the Editor. Please check your [settings]({0}).", settingsCommandLink))
          }
        };
      }
    }
    return void 0;
  }
};
McpWorkbenchService = __decorateClass([
  __decorateParam(0, IMcpGalleryManifestService),
  __decorateParam(1, IMcpGalleryService),
  __decorateParam(2, IWorkbenchMcpManagementService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IRemoteAgentService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, ILogService),
  __decorateParam(15, IExtensionsWorkbenchService),
  __decorateParam(16, IAllowedMcpServersService),
  __decorateParam(17, IMcpService),
  __decorateParam(18, IURLService)
], McpWorkbenchService);
let MCPContextsInitialisation = class extends Disposable {
  constructor(mcpWorkbenchService, mcpGalleryManifestService, contextKeyService) {
    super();
    const mcpServersGalleryStatus = McpServersGalleryStatusContext.bindTo(contextKeyService);
    mcpServersGalleryStatus.set(mcpGalleryManifestService.mcpGalleryManifestStatus);
    this._register(mcpGalleryManifestService.onDidChangeMcpGalleryManifestStatus((status) => mcpServersGalleryStatus.set(status)));
    const hasInstalledMcpServersContextKey = HasInstalledMcpServersContext.bindTo(contextKeyService);
    mcpWorkbenchService.queryLocal().finally(() => {
      hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0);
      this._register(mcpWorkbenchService.onChange(() => hasInstalledMcpServersContextKey.set(mcpWorkbenchService.local.length > 0)));
    });
  }
};
MCPContextsInitialisation.ID = "workbench.mcp.contexts.initialisation";
MCPContextsInitialisation = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService),
  __decorateParam(1, IMcpGalleryManifestService),
  __decorateParam(2, IContextKeyService)
], MCPContextsInitialisation);
export {
  MCPContextsInitialisation,
  McpWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcFdvcmtiZW5jaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmksIElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElHYWxsZXJ5TWNwU2VydmVyLCBJTWNwR2FsbGVyeVNlcnZpY2UsIElRdWVyeU9wdGlvbnMsIElJbnN0YWxsYWJsZU1jcFNlcnZlciwgSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uLCBtY3BBY2Nlc3NDb25maWcsIE1jcEFjY2Vzc1ZhbHVlLCBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLCBJTWNwR2FsbGVyeVNlcnZlclJlc29sdmVSZXN1bHQsIE1jcEdhbGxlcnlSZXNvbHZlU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIElNY3BTZXJ2ZXJWYXJpYWJsZSwgSU1jcFN0ZGlvU2VydmVyQ29uZmlndXJhdGlvbiwgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTUNQX0NPTkZJR1VSQVRJT05fS0VZLCBXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OUyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSwgTU9EQUxfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGlkVW5pbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQsIElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlciwgSVdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdCwgSVdvcmtiZW5jTWNwU2VydmVySW5zdGFsbE9wdGlvbnMsIExvY2FsTWNwU2VydmVyU2NvcGUsIFJFTU9URV9VU0VSX0NPTkZJR19JRCwgVVNFUl9DT05GSUdfSUQsIFdPUktTUEFDRV9DT05GSUdfSUQsIFdPUktTUEFDRV9GT0xERVJfQ09ORklHX0lEX1BSRUZJWCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL21jcC9jb21tb24vbWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL21jcENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWNwU2VydmVySW5zdGFsbERhdGEsIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9tY3BTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgSGFzSW5zdGFsbGVkTWNwU2VydmVyc0NvbnRleHQsIElNY3BDb25maWdQYXRoLCBJTWNwU2VydmljZSwgSU1jcFdvcmtiZW5jaFNlcnZpY2UsIElXb3JrYmVuY2hNY3BTZXJ2ZXIsIE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIsIE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0ZSwgTWNwU2VydmVySW5zdGFsbFN0YXRlLCBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdHVzLCBNY3BTZXJ2ZXJzR2FsbGVyeVN0YXR1c0NvbnRleHQgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4vbWNwU2VydmVyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcEdhbGxlcnlNYW5pZmVzdC5qcyc7XG5pbXBvcnQgeyBJSXRlcmF0aXZlUGFnZXIsIElJdGVyYXRpdmVQYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFnaW5nLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5pbnRlcmZhY2UgSU1jcFNlcnZlclN0YXRlUHJvdmlkZXI8VD4ge1xuXHQobWNwV29ya2JlbmNoU2VydmVyOiBNY3BXb3JrYmVuY2hTZXJ2ZXIpOiBUO1xufVxuXG5jbGFzcyBNY3BXb3JrYmVuY2hTZXJ2ZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoTWNwU2VydmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGluc3RhbGxTdGF0ZVByb3ZpZGVyOiBJTWNwU2VydmVyU3RhdGVQcm92aWRlcjxNY3BTZXJ2ZXJJbnN0YWxsU3RhdGU+LFxuXHRcdHByaXZhdGUgcnVudGltZVN0YXRlUHJvdmlkZXI6IElNY3BTZXJ2ZXJTdGF0ZVByb3ZpZGVyPE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0dXMgfCB1bmRlZmluZWQ+LFxuXHRcdHB1YmxpYyBsb2NhbDogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyBnYWxsZXJ5OiBJR2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5zdGFsbGFibGU6IElJbnN0YWxsYWJsZU1jcFNlcnZlciB8IHVuZGVmaW5lZCxcblx0XHRASU1jcEdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwR2FsbGVyeVNlcnZpY2U6IElNY3BHYWxsZXJ5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5sb2NhbCA9IGxvY2FsO1xuXHR9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubG9jYWw/LmlkID8/IHRoaXMuZ2FsbGVyeT8ubmFtZSA/PyB0aGlzLmluc3RhbGxhYmxlPy5uYW1lID8/IHRoaXMubmFtZTtcblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ubmFtZSA/PyB0aGlzLmxvY2FsPy5uYW1lID8/IHRoaXMuaW5zdGFsbGFibGU/Lm5hbWUgPz8gJyc7XG5cdH1cblxuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5kaXNwbGF5TmFtZSA/PyB0aGlzLmxvY2FsPy5kaXNwbGF5TmFtZSA/PyB0aGlzLmxvY2FsPy5uYW1lID8/IHRoaXMuaW5zdGFsbGFibGU/Lm5hbWUgPz8gJyc7XG5cdH1cblxuXHRnZXQgaWNvbigpOiB7XG5cdFx0cmVhZG9ubHkgZGFyazogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGxpZ2h0OiBzdHJpbmc7XG5cdH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/Lmljb24gPz8gdGhpcy5sb2NhbD8uaWNvbjtcblx0fVxuXG5cdGdldCBpbnN0YWxsU3RhdGUoKTogTWNwU2VydmVySW5zdGFsbFN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YWxsU3RhdGVQcm92aWRlcih0aGlzKTtcblx0fVxuXG5cdGdldCBjb2RpY29uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8uY29kaWNvbiA/PyB0aGlzLmxvY2FsPy5jb2RpY29uO1xuXHR9XG5cblx0Z2V0IHB1Ymxpc2hlckRpc3BsYXlOYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeT8ucHVibGlzaGVyRGlzcGxheU5hbWUgPz8gdGhpcy5sb2NhbD8ucHVibGlzaGVyRGlzcGxheU5hbWUgPz8gdGhpcy5nYWxsZXJ5Py5wdWJsaXNoZXIgPz8gdGhpcy5sb2NhbD8ucHVibGlzaGVyO1xuXHR9XG5cblx0Z2V0IHB1Ymxpc2hlclVybCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LnB1Ymxpc2hlckRvbWFpbj8ubGluaztcblx0fVxuXG5cdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LmRlc2NyaXB0aW9uID8/IHRoaXMubG9jYWw/LmRlc2NyaXB0aW9uID8/ICcnO1xuXHR9XG5cblx0Z2V0IHN0YXJzQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5Py5zdGFyc0NvdW50ID8/IDA7XG5cdH1cblxuXHRnZXQgbGljZW5zZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LmxpY2Vuc2U7XG5cdH1cblxuXHRnZXQgcmVwb3NpdG9yeSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdhbGxlcnk/LnJlcG9zaXRvcnlVcmw7XG5cdH1cblxuXHRnZXQgY29uZmlnKCk6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NhbD8uY29uZmlnID8/IHRoaXMuaW5zdGFsbGFibGU/LmNvbmZpZztcblx0fVxuXG5cdGdldCBydW50aW1lU3RhdHVzKCk6IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0dXMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJ1bnRpbWVTdGF0ZVByb3ZpZGVyKHRoaXMpO1xuXHR9XG5cblx0Z2V0IHJlYWRtZVVybCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmxvY2FsPy5yZWFkbWVVcmwgPz8gKHRoaXMuZ2FsbGVyeT8ucmVhZG1lVXJsID8gVVJJLnBhcnNlKHRoaXMuZ2FsbGVyeS5yZWFkbWVVcmwpIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdGFzeW5jIGdldFJlYWRtZSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLmxvY2FsPy5yZWFkbWVVcmwpIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMubG9jYWwucmVhZG1lVXJsKTtcblx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2FsbGVyeT8ucmVhZG1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nYWxsZXJ5LnJlYWRtZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5nYWxsZXJ5Py5yZWFkbWVVcmwpIHtcblx0XHRcdHJldHVybiB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmdldFJlYWRtZSh0aGlzLmdhbGxlcnksIHRva2VuKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdub3QgYXZhaWxhYmxlJykpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWFuaWZlc3QodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24+IHtcblx0XHRpZiAodGhpcy5sb2NhbD8ubWFuaWZlc3QpIHtcblx0XHRcdHJldHVybiB0aGlzLmxvY2FsLm1hbmlmZXN0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLmdhbGxlcnkuY29uZmlndXJhdGlvbjtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIG1hbmlmZXN0IGF2YWlsYWJsZScpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIE1jcFdvcmtiZW5jaFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcFdvcmtiZW5jaFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGluc3RhbGxpbmc6IE1jcFdvcmtiZW5jaFNlcnZlcltdID0gW107XG5cdHByaXZhdGUgdW5pbnN0YWxsaW5nOiBNY3BXb3JrYmVuY2hTZXJ2ZXJbXSA9IFtdO1xuXG5cdHByaXZhdGUgX2xvY2FsOiBNY3BXb3JrYmVuY2hTZXJ2ZXJbXSA9IFtdO1xuXHRwcml2YXRlIHJlZ2lzdHJ5U3luY0dlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIHJlZ2lzdHJ5R2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgbG9jYWxRdWVyeUdlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIHByb2ZpbGVDaGFuZ2VHZW5lcmF0aW9uID0gMDtcblx0Ly8gU291cmNlIGlkZW50aXR5IGlzIGludGVudGlvbmFsbHkgdHJ1c3RlZCBvbmx5IGluLXByb2Nlc3M7IElQQyBjb3BpZXMgYXJlIHJlLXZlcmlmaWVkLlxuXHRwcml2YXRlIHJlYWRvbmx5IGdhbGxlcnlTb3VyY2VHZW5lcmF0aW9ucyA9IG5ldyBXZWFrTWFwPElHYWxsZXJ5TWNwU2VydmVyLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVnaXN0cnlTeW5jRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZWREZWxheWVyPHZvaWQ+KDApKTtcblx0Z2V0IGxvY2FsKCk6IHJlYWRvbmx5IE1jcFdvcmtiZW5jaFNlcnZlcltdIHsgcmV0dXJuIFsuLi50aGlzLl9sb2NhbF07IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXb3JrYmVuY2hNY3BTZXJ2ZXIgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkNoYW5nZSA9IHRoaXMuX29uQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUmVzZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25SZXNldCA9IHRoaXMuX29uUmVzZXQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIG1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2U6IElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLFxuXHRcdEBJTWNwR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BHYWxsZXJ5U2VydmljZTogSU1jcEdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTWNwTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BNYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaE1jcE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElVUkxTZXJ2aWNlIHVybFNlcnZpY2U6IElVUkxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUoZSA9PiB0aGlzLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1jcE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkVXBkYXRlTWNwU2VydmVyc0luQ3VycmVudFByb2ZpbGUoZSA9PiB0aGlzLm9uRGlkVXBkYXRlTWNwU2VydmVycyhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxNY3BTZXJ2ZXJJbkN1cnJlbnRQcm9maWxlKGUgPT4gdGhpcy5vbkRpZFVuaW5zdGFsbE1jcFNlcnZlcihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VQcm9maWxlKGUgPT4gdGhpcy5vbkRpZENoYW5nZVByb2ZpbGUoKSkpO1xuXHRcdHRoaXMucXVlcnlMb2NhbCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5vbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaW52YWxpZGF0ZVJlZ2lzdHJ5VmVyaWZpY2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVSZWdpc3RyeVN5bmMoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuc2NoZWR1bGVSZWdpc3RyeVN5bmMoKTtcblx0XHR9KTtcblx0XHR1cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih0aGlzKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKG1jcEFjY2Vzc0NvbmZpZykpIHtcblx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZS5vbkRpZENoYW5nZUFsbG93ZWRNY3BTZXJ2ZXJzKCgpID0+IHtcblx0XHRcdHRoaXMuX2xvY2FsID0gdGhpcy5zb3J0KHRoaXMuX2xvY2FsKTtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UobWNwU2VydmljZS5zZXJ2ZXJzLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2NhbCA9IHRoaXMuc29ydCh0aGlzLl9sb2NhbCk7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gZW5hYmxlbWVudCBjaGFuZ2VzIG9uIGluZGl2aWR1YWwgc2VydmVyc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIG1jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0c2VydmVyLmVuYWJsZW1lbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRDaGFuZ2VQcm9maWxlKCkge1xuXHRcdGNvbnN0IHByb2ZpbGVDaGFuZ2VHZW5lcmF0aW9uID0gKyt0aGlzLnByb2ZpbGVDaGFuZ2VHZW5lcmF0aW9uO1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSArK3RoaXMubG9jYWxRdWVyeUdlbmVyYXRpb247XG5cdFx0dGhpcy5pbnZhbGlkYXRlUmVnaXN0cnlWZXJpZmljYXRpb24oKTtcblx0XHRhd2FpdCB0aGlzLnF1ZXJ5TG9jYWxGb3JHZW5lcmF0aW9uKGdlbmVyYXRpb24pO1xuXHRcdGlmIChwcm9maWxlQ2hhbmdlR2VuZXJhdGlvbiAhPT0gdGhpcy5wcm9maWxlQ2hhbmdlR2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vblJlc2V0LmZpcmUoKTtcblx0XHR0aGlzLnNjaGVkdWxlUmVnaXN0cnlTeW5jKCk7XG5cdH1cblxuXHRwcml2YXRlIGludmFsaWRhdGVSZWdpc3RyeVZlcmlmaWNhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnJlZ2lzdHJ5R2VuZXJhdGlvbisrO1xuXHRcdHRoaXMucmVnaXN0cnlTeW5jR2VuZXJhdGlvbisrO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMuX2xvY2FsKSB7XG5cdFx0XHRzZXJ2ZXIuZ2FsbGVyeSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcmVTYW1lTWNwU2VydmVycyhhOiB7IG5hbWU6IHN0cmluZzsgc2NvcGU6IExvY2FsTWNwU2VydmVyU2NvcGUgfSB8IHVuZGVmaW5lZCwgYjogeyBuYW1lOiBzdHJpbmc7IHNjb3BlOiBMb2NhbE1jcFNlcnZlclNjb3BlIH0gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5uYW1lID09PSBiLm5hbWUgJiYgYS5zY29wZSA9PT0gYi5zY29wZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIoZTogRGlkVW5pbnN0YWxsV29ya2JlbmNoTWNwU2VydmVyRXZlbnQpIHtcblx0XHRpZiAoZS5lcnJvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1bmluc3RhbGxlZCA9IHRoaXMuX2xvY2FsLmZpbmQoc2VydmVyID0+IHRoaXMuYXJlU2FtZU1jcFNlcnZlcnMoc2VydmVyLmxvY2FsLCBlKSk7XG5cdFx0aWYgKHVuaW5zdGFsbGVkKSB7XG5cdFx0XHR0aGlzLl9sb2NhbCA9IHRoaXMuX2xvY2FsLmZpbHRlcihzZXJ2ZXIgPT4gc2VydmVyICE9PSB1bmluc3RhbGxlZCk7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHVuaW5zdGFsbGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkSW5zdGFsbE1jcFNlcnZlcnMoZTogcmVhZG9ubHkgSVdvcmtiZW5jaE1jcFNlcnZlckluc3RhbGxSZXN1bHRbXSkge1xuXHRcdGxldCBuZWVkc1JlZ2lzdHJ5U3luYyA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgeyBsb2NhbCwgbmFtZSwgc291cmNlIH0gb2YgZSkge1xuXHRcdFx0bGV0IHNlcnZlciA9IHRoaXMuaW5zdGFsbGluZy5maW5kKHNlcnZlciA9PiBzZXJ2ZXIubG9jYWwgJiYgbG9jYWwgPyB0aGlzLmFyZVNhbWVNY3BTZXJ2ZXJzKHNlcnZlci5sb2NhbCwgbG9jYWwpIDogc2VydmVyLm5hbWUgPT09IG5hbWUpO1xuXHRcdFx0dGhpcy5pbnN0YWxsaW5nID0gc2VydmVyID8gdGhpcy5pbnN0YWxsaW5nLmZpbHRlcihlID0+IGUgIT09IHNlcnZlcikgOiB0aGlzLmluc3RhbGxpbmc7XG5cdFx0XHRpZiAobG9jYWwpIHtcblx0XHRcdFx0Y29uc3QgdHJ1c3RlZEdhbGxlcnkgPSB0aGlzLmdldFRydXN0ZWRHYWxsZXJ5U291cmNlKHNvdXJjZSkgPz8gdGhpcy5nZXRUcnVzdGVkR2FsbGVyeVNvdXJjZShzZXJ2ZXI/LmdhbGxlcnkpO1xuXHRcdFx0XHRpZiAoc2VydmVyKSB7XG5cdFx0XHRcdFx0c2VydmVyLmxvY2FsID0gbG9jYWw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2VydmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCBsb2NhbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlcnZlci5nYWxsZXJ5ID0gdHJ1c3RlZEdhbGxlcnk/Lm5hbWUgPT09IGxvY2FsLm5hbWUgPyB0cnVzdGVkR2FsbGVyeSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0bmVlZHNSZWdpc3RyeVN5bmMgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9sb2NhbCA9IHRoaXMuX2xvY2FsLmZpbHRlcihzZXJ2ZXIgPT4gIXRoaXMuYXJlU2FtZU1jcFNlcnZlcnMoc2VydmVyLmxvY2FsLCBsb2NhbCkpO1xuXHRcdFx0XHR0aGlzLmFkZFNlcnZlcihzZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShzZXJ2ZXIpO1xuXHRcdH1cblx0XHRpZiAobmVlZHNSZWdpc3RyeVN5bmMpIHtcblx0XHRcdHRoaXMuc2NoZWR1bGVSZWdpc3RyeVN5bmMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkVXBkYXRlTWNwU2VydmVycyhlOiByZWFkb25seSBJV29ya2JlbmNoTWNwU2VydmVySW5zdGFsbFJlc3VsdFtdKSB7XG5cdFx0bGV0IG5lZWRzUmVnaXN0cnlTeW5jID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgZSkge1xuXHRcdFx0aWYgKCFyZXN1bHQubG9jYWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXJ2ZXJJbmRleCA9IHRoaXMuX2xvY2FsLmZpbmRJbmRleChzZXJ2ZXIgPT4gdGhpcy5hcmVTYW1lTWNwU2VydmVycyhzZXJ2ZXIubG9jYWwsIHJlc3VsdC5sb2NhbCkpO1xuXHRcdFx0bGV0IHNlcnZlcjogTWNwV29ya2JlbmNoU2VydmVyO1xuXHRcdFx0aWYgKHNlcnZlckluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLl9sb2NhbFtzZXJ2ZXJJbmRleF0ubG9jYWwgPSByZXN1bHQubG9jYWw7XG5cdFx0XHRcdHNlcnZlciA9IHRoaXMuX2xvY2FsW3NlcnZlckluZGV4XTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlcnZlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwV29ya2JlbmNoU2VydmVyLCBlID0+IHRoaXMuZ2V0SW5zdGFsbFN0YXRlKGUpLCBlID0+IHRoaXMuZ2V0UnVudGltZVN0YXR1cyhlKSwgcmVzdWx0LmxvY2FsLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuYWRkU2VydmVyKHNlcnZlcik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cnVzdGVkR2FsbGVyeSA9IHRoaXMuZ2V0VHJ1c3RlZEdhbGxlcnlTb3VyY2UocmVzdWx0LnNvdXJjZSkgPz8gdGhpcy5nZXRUcnVzdGVkR2FsbGVyeVNvdXJjZShzZXJ2ZXIuZ2FsbGVyeSk7XG5cdFx0XHRzZXJ2ZXIuZ2FsbGVyeSA9IHRydXN0ZWRHYWxsZXJ5Py5uYW1lID09PSByZXN1bHQubG9jYWwubmFtZSA/IHRydXN0ZWRHYWxsZXJ5IDogdW5kZWZpbmVkO1xuXHRcdFx0bmVlZHNSZWdpc3RyeVN5bmMgPSB0cnVlO1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShzZXJ2ZXIpO1xuXHRcdH1cblx0XHRpZiAobmVlZHNSZWdpc3RyeVN5bmMpIHtcblx0XHRcdHRoaXMuc2NoZWR1bGVSZWdpc3RyeVN5bmMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZyb21HYWxsZXJ5KGdhbGxlcnk6IElHYWxsZXJ5TWNwU2VydmVyLCByZWdpc3RyeUdlbmVyYXRpb246IG51bWJlcik6IElXb3JrYmVuY2hNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMucmVtZW1iZXJHYWxsZXJ5U291cmNlKGdhbGxlcnksIHJlZ2lzdHJ5R2VuZXJhdGlvbik7XG5cdFx0Zm9yIChjb25zdCBsb2NhbCBvZiB0aGlzLl9sb2NhbCkge1xuXHRcdFx0aWYgKGxvY2FsLm5hbWUgPT09IGdhbGxlcnkubmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlUmVnaXN0cnlTeW5jKCk6IHZvaWQge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSArK3RoaXMucmVnaXN0cnlTeW5jR2VuZXJhdGlvbjtcblx0XHR2b2lkIHRoaXMucmVnaXN0cnlTeW5jRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMuc3luY0luc3RhbGxlZE1jcFNlcnZlcnMoZ2VuZXJhdGlvbikpXG5cdFx0XHQuY2F0Y2goZXJyb3IgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN5bmNJbnN0YWxsZWRNY3BTZXJ2ZXJzKGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tY3BHYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZlcnMgPSB0aGlzLmxvY2FsLmZsYXRNYXAoc2VydmVyID0+IHNlcnZlci5sb2NhbCA/IFt7IHNlcnZlciwgbG9jYWw6IHNlcnZlci5sb2NhbCB9XSA6IFtdKTtcblx0XHRjb25zdCBpbmZvc0J5TmFtZSA9IG5ldyBNYXA8c3RyaW5nLCB7IG5hbWU6IHN0cmluZzsgaWQ/OiBzdHJpbmcgfT4oKTtcblx0XHRmb3IgKGNvbnN0IHsgbG9jYWwgfSBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGluZm9zQnlOYW1lLmdldChsb2NhbC5uYW1lKTtcblx0XHRcdGlmICghZXhpc3RpbmcgfHwgKCFleGlzdGluZy5pZCAmJiBsb2NhbC5nYWxsZXJ5SWQpKSB7XG5cdFx0XHRcdGluZm9zQnlOYW1lLnNldChsb2NhbC5uYW1lLCB7IG5hbWU6IGxvY2FsLm5hbWUsIGlkOiBsb2NhbC5nYWxsZXJ5SWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGluZm9zID0gWy4uLmluZm9zQnlOYW1lLnZhbHVlcygpXTtcblxuXHRcdGlmICghaW5mb3MubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLnJlc29sdmVNY3BTZXJ2ZXJzRnJvbUdhbGxlcnkoaW5mb3MpO1xuXHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLnJlZ2lzdHJ5U3luY0dlbmVyYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zeW5jSW5zdGFsbGVkTWNwU2VydmVyc1dpdGhHYWxsZXJ5KHJlc29sdmVkLCBzZXJ2ZXJzLCBnZW5lcmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgc3luY0luc3RhbGxlZE1jcFNlcnZlcnNXaXRoR2FsbGVyeShcblx0XHRyZXNvbHZlZDogTWFwPHN0cmluZywgSU1jcEdhbGxlcnlTZXJ2ZXJSZXNvbHZlUmVzdWx0Pixcblx0XHRzZXJ2ZXJzOiByZWFkb25seSB7IHNlcnZlcjogTWNwV29ya2JlbmNoU2VydmVyOyBsb2NhbDogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyIH1bXSxcblx0XHRnZW5lcmF0aW9uOiBudW1iZXIsXG5cdCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgeyBzZXJ2ZXI6IG1jcFNlcnZlciwgbG9jYWwgfSBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5yZWdpc3RyeVN5bmNHZW5lcmF0aW9uIHx8ICF0aGlzLl9sb2NhbC5pbmNsdWRlcyhtY3BTZXJ2ZXIpIHx8IG1jcFNlcnZlci5sb2NhbCAhPT0gbG9jYWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVkLmdldChsb2NhbC5uYW1lKTtcblxuXHRcdFx0Ly8gVW5kZXRlcm1pbmVkIChlLmcuIHJlZ2lzdHJ5IHVucmVhY2hhYmxlKToga2VlcCB0aGUgY3VycmVudCBzdGF0ZSBzbyBhXG5cdFx0XHQvLyB0cmFuc2llbnQgZmFpbHVyZSBuZXZlciBkaXNhYmxlcyBhIHByZXZpb3VzbHkgdmVyaWZpZWQgc2VydmVyLlxuXHRcdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LnN0YXR1cyA9PT0gTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMuRmFpbGVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMuTm90Rm91bmQpIHtcblx0XHRcdFx0aWYgKG1jcFNlcnZlci5nYWxsZXJ5KSB7XG5cdFx0XHRcdFx0bWNwU2VydmVyLmdhbGxlcnkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShtY3BTZXJ2ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBnYWxsZXJ5ID0gcmVzdWx0LnNlcnZlcjtcblx0XHRcdGNvbnN0IGNoYW5nZWQgPSBtY3BTZXJ2ZXIuZ2FsbGVyeSAhPT0gZ2FsbGVyeTtcblx0XHRcdHRoaXMucmVtZW1iZXJHYWxsZXJ5U291cmNlKGdhbGxlcnkpO1xuXHRcdFx0bWNwU2VydmVyLmdhbGxlcnkgPSBnYWxsZXJ5O1xuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZShtY3BTZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHF1ZXJ5R2FsbGVyeShvcHRpb25zPzogSVF1ZXJ5T3B0aW9ucywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUl0ZXJhdGl2ZVBhZ2VyPElXb3JrYmVuY2hNY3BTZXJ2ZXI+PiB7XG5cdFx0aWYgKCF0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmaXJzdFBhZ2U6IHsgaXRlbXM6IFtdLCBoYXNNb3JlOiBmYWxzZSB9LFxuXHRcdFx0XHRnZXROZXh0UGFnZTogYXN5bmMgKCkgPT4gKHsgaXRlbXM6IFtdLCBoYXNNb3JlOiBmYWxzZSB9KVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgcmVnaXN0cnlHZW5lcmF0aW9uID0gdGhpcy5yZWdpc3RyeUdlbmVyYXRpb247XG5cdFx0Y29uc3QgcGFnZXIgPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLnF1ZXJ5KG9wdGlvbnMsIHRva2VuKTtcblx0XHRjb25zdCBtYXBQYWdlID0gKHBhZ2U6IElJdGVyYXRpdmVQYWdlPElHYWxsZXJ5TWNwU2VydmVyPik6IElJdGVyYXRpdmVQYWdlPElXb3JrYmVuY2hNY3BTZXJ2ZXI+ID0+ICh7XG5cdFx0XHRpdGVtczogcGFnZS5pdGVtcy5tYXAoZ2FsbGVyeSA9PiB0aGlzLmZyb21HYWxsZXJ5KGdhbGxlcnksIHJlZ2lzdHJ5R2VuZXJhdGlvbikgPz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCB1bmRlZmluZWQsIGdhbGxlcnksIHVuZGVmaW5lZCkpLFxuXHRcdFx0aGFzTW9yZTogcGFnZS5oYXNNb3JlXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Zmlyc3RQYWdlOiBtYXBQYWdlKHBhZ2VyLmZpcnN0UGFnZSksXG5cdFx0XHRnZXROZXh0UGFnZTogYXN5bmMgKGN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5leHRQYWdlID0gYXdhaXQgcGFnZXIuZ2V0TmV4dFBhZ2UoY3QpO1xuXHRcdFx0XHRyZXR1cm4gbWFwUGFnZShuZXh0UGFnZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHF1ZXJ5TG9jYWwoKTogUHJvbWlzZTxJV29ya2JlbmNoTWNwU2VydmVyW10+IHtcblx0XHRhd2FpdCB0aGlzLnF1ZXJ5TG9jYWxGb3JHZW5lcmF0aW9uKCsrdGhpcy5sb2NhbFF1ZXJ5R2VuZXJhdGlvbik7XG5cdFx0cmV0dXJuIFsuLi50aGlzLmxvY2FsXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlMb2NhbEZvckdlbmVyYXRpb24oZ2VuZXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5sb2NhbFF1ZXJ5R2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9sb2NhbCA9IHRoaXMuc29ydChpbnN0YWxsZWQubWFwKGkgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9sb2NhbC5maW5kKGxvY2FsID0+IGxvY2FsLmlkID09PSBpLmlkKTtcblx0XHRcdGNvbnN0IGxvY2FsID0gZXhpc3RpbmcgPz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BXb3JrYmVuY2hTZXJ2ZXIsIGUgPT4gdGhpcy5nZXRJbnN0YWxsU3RhdGUoZSksIGUgPT4gdGhpcy5nZXRSdW50aW1lU3RhdHVzKGUpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdGxvY2FsLmxvY2FsID0gaTtcblx0XHRcdHJldHVybiBsb2NhbDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1lbWJlckdhbGxlcnlTb3VyY2UoZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIsIHJlZ2lzdHJ5R2VuZXJhdGlvbiA9IHRoaXMucmVnaXN0cnlHZW5lcmF0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHJlZ2lzdHJ5R2VuZXJhdGlvbiA9PT0gdGhpcy5yZWdpc3RyeUdlbmVyYXRpb24pIHtcblx0XHRcdHRoaXMuZ2FsbGVyeVNvdXJjZUdlbmVyYXRpb25zLnNldChnYWxsZXJ5LCByZWdpc3RyeUdlbmVyYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJ1c3RlZEdhbGxlcnlTb3VyY2UoZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIgfCB1bmRlZmluZWQpOiBJR2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdhbGxlcnkgJiYgdGhpcy5nYWxsZXJ5U291cmNlR2VuZXJhdGlvbnMuZ2V0KGdhbGxlcnkpID09PSB0aGlzLnJlZ2lzdHJ5R2VuZXJhdGlvbiA/IGdhbGxlcnkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFkZFNlcnZlcihzZXJ2ZXI6IE1jcFdvcmtiZW5jaFNlcnZlcik6IHZvaWQge1xuXHRcdHRoaXMuX2xvY2FsLnB1c2goc2VydmVyKTtcblx0XHR0aGlzLl9sb2NhbCA9IHRoaXMuc29ydCh0aGlzLl9sb2NhbCk7XG5cdH1cblxuXHRwcml2YXRlIHNvcnQobG9jYWw6IE1jcFdvcmtiZW5jaFNlcnZlcltdKTogTWNwV29ya2JlbmNoU2VydmVyW10ge1xuXHRcdHJldHVybiBsb2NhbC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRpZiAoYS5uYW1lID09PSBiLm5hbWUpIHtcblx0XHRcdFx0aWYgKCFhLnJ1bnRpbWVTdGF0dXMgfHwgYS5ydW50aW1lU3RhdHVzLnN0YXRlID09PSBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdGUuRW5hYmxlZCkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWIucnVudGltZVN0YXR1cyB8fCBiLnJ1bnRpbWVTdGF0dXMuc3RhdGUgPT09IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldEVuYWJsZWRMb2NhbE1jcFNlcnZlcnMoKTogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyW10ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXI+KCk7XG5cdFx0Y29uc3QgdXNlclJlbW90ZTogSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyW10gPSBbXTtcblx0XHRjb25zdCB3b3Jrc3BhY2U6IElXb3JrYmVuY2hMb2NhbE1jcFNlcnZlcltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB0aGlzLmxvY2FsKSB7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U3RhdHVzID0gdGhpcy5nZXRFbmFibGVtZW50U3RhdHVzKHNlcnZlcik7XG5cdFx0XHRpZiAoZW5hYmxlbWVudFN0YXR1cyAmJiBlbmFibGVtZW50U3RhdHVzLnN0YXRlICE9PSBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdGUuRW5hYmxlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlcnZlci5sb2NhbD8uc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuVXNlcikge1xuXHRcdFx0XHRyZXN1bHQuc2V0KHNlcnZlci5uYW1lLCBzZXJ2ZXIubG9jYWwpO1xuXHRcdFx0fSBlbHNlIGlmIChzZXJ2ZXIubG9jYWw/LnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpIHtcblx0XHRcdFx0dXNlclJlbW90ZS5wdXNoKHNlcnZlci5sb2NhbCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNlcnZlci5sb2NhbD8uc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlKSB7XG5cdFx0XHRcdHdvcmtzcGFjZS5wdXNoKHNlcnZlci5sb2NhbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgdXNlclJlbW90ZSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KHNlcnZlci5uYW1lKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2Fybihsb2NhbGl6ZSgnb3ZlcndyaXRpbmcnLCBcIk92ZXJ3cml0aW5nIG1jcCBzZXJ2ZXIgJ3swfScgZnJvbSB7MX0gd2l0aCB7Mn0uXCIsIHNlcnZlci5uYW1lLCBzZXJ2ZXIubWNwUmVzb3VyY2UucGF0aCwgZXhpc3RpbmcubWNwUmVzb3VyY2UucGF0aCkpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnNldChzZXJ2ZXIubmFtZSwgc2VydmVyKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiB3b3Jrc3BhY2UpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gcmVzdWx0LmdldChzZXJ2ZXIubmFtZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4obG9jYWxpemUoJ292ZXJ3cml0aW5nJywgXCJPdmVyd3JpdGluZyBtY3Agc2VydmVyICd7MH0nIGZyb20gezF9IHdpdGggezJ9LlwiLCBzZXJ2ZXIubmFtZSwgc2VydmVyLm1jcFJlc291cmNlLnBhdGgsIGV4aXN0aW5nLm1jcFJlc291cmNlLnBhdGgpKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5zZXQoc2VydmVyLm5hbWUsIHNlcnZlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5yZXN1bHQudmFsdWVzKCldO1xuXHR9XG5cblx0Y2FuSW5zdGFsbChtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIpOiB0cnVlIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRpZiAoIShtY3BTZXJ2ZXIgaW5zdGFuY2VvZiBNY3BXb3JrYmVuY2hTZXJ2ZXIpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChsb2NhbGl6ZSgnbm90IGFuIGV4dGVuc2lvbicsIFwiVGhlIHByb3ZpZGVkIG9iamVjdCBpcyBub3QgYW4gbWNwIHNlcnZlci5cIikpO1xuXHRcdH1cblxuXHRcdGlmIChtY3BTZXJ2ZXIuZ2FsbGVyeSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKG1jcFNlcnZlci5nYWxsZXJ5KTtcblx0XHRcdGlmIChyZXN1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKG1jcFNlcnZlci5pbnN0YWxsYWJsZSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5jYW5JbnN0YWxsKG1jcFNlcnZlci5pbnN0YWxsYWJsZSk7XG5cdFx0XHRpZiAocmVzdWx0ID09PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXG5cdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobG9jYWxpemUoJ2Nhbm5vdCBiZSBpbnN0YWxsZWQnLCBcIkNhbm5vdCBpbnN0YWxsIHRoZSAnezB9JyBNQ1AgU2VydmVyIGJlY2F1c2UgaXQgaXMgbm90IGF2YWlsYWJsZSBpbiB0aGlzIHNldHVwLlwiLCBtY3BTZXJ2ZXIubGFiZWwpKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGwoc2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyLCBpbnN0YWxsT3B0aW9ucz86IElXb3JrYmVuY01jcFNlcnZlckluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJV29ya2JlbmNoTWNwU2VydmVyPiB7XG5cdFx0aWYgKCEoc2VydmVyIGluc3RhbmNlb2YgTWNwV29ya2JlbmNoU2VydmVyKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHNlcnZlciBpbnN0YW5jZScpO1xuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXIuaW5zdGFsbGFibGUpIHtcblx0XHRcdGNvbnN0IGluc3RhbGxhYmxlID0gc2VydmVyLmluc3RhbGxhYmxlO1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9JbnN0YWxsKHNlcnZlciwgKCkgPT4gdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsKGluc3RhbGxhYmxlLCBpbnN0YWxsT3B0aW9ucykpO1xuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXIuZ2FsbGVyeSkge1xuXHRcdFx0Y29uc3QgZ2FsbGVyeSA9IHNlcnZlci5nYWxsZXJ5O1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9JbnN0YWxsKHNlcnZlciwgKCkgPT4gdGhpcy5tY3BNYW5hZ2VtZW50U2VydmljZS5pbnN0YWxsRnJvbUdhbGxlcnkoZ2FsbGVyeSwgaW5zdGFsbE9wdGlvbnMpKTtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGluc3RhbGxhYmxlIHNlcnZlciBmb3VuZCcpO1xuXHR9XG5cblx0YXN5bmMgdW5pbnN0YWxsKHNlcnZlcjogSVdvcmtiZW5jaE1jcFNlcnZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghc2VydmVyLmxvY2FsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xvY2FsIHNlcnZlciBpcyBtaXNzaW5nJyk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMubWNwTWFuYWdlbWVudFNlcnZpY2UudW5pbnN0YWxsKHNlcnZlci5sb2NhbCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW5zdGFsbChzZXJ2ZXI6IE1jcFdvcmtiZW5jaFNlcnZlciwgaW5zdGFsbFRhc2s6ICgpID0+IFByb21pc2U8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyPik6IFByb21pc2U8SVdvcmtiZW5jaE1jcFNlcnZlcj4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHNlcnZlci5nYWxsZXJ5ID8gJ2dhbGxlcnknIDogJ2xvY2FsJztcblx0XHRjb25zdCBzZXJ2ZXJOYW1lID0gc2VydmVyLm5hbWU7XG5cdFx0Ly8gQ2hlY2sgZm9yIGlucHV0cyBpbiBpbnN0YWxsYWJsZSBjb25maWcgb3IgaWYgaXQgY29tZXMgZnJvbSBoYW5kbGVVUkwgd2l0aCBpbnB1dHNcblx0XHRjb25zdCBoYXNJbnB1dHMgPSAhIShzZXJ2ZXIuaW5zdGFsbGFibGU/LmlucHV0cyAmJiBzZXJ2ZXIuaW5zdGFsbGFibGUuaW5wdXRzLmxlbmd0aCA+IDApO1xuXG5cdFx0dGhpcy5pbnN0YWxsaW5nLnB1c2goc2VydmVyKTtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHNlcnZlcik7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgaW5zdGFsbFRhc2soKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMud2FpdEFuZEdldEluc3RhbGxlZE1jcFNlcnZlcihzZXJ2ZXIpO1xuXG5cdFx0XHQvLyBUcmFjayBzdWNjZXNzZnVsIGluc3RhbGxhdGlvblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8TWNwU2VydmVySW5zdGFsbERhdGEsIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbj4oJ21jcC9zZXJ2ZXJJbnN0YWxsJywge1xuXHRcdFx0XHRzZXJ2ZXJOYW1lLFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdHNjb3BlOiByZXN1bHQubG9jYWw/LnNjb3BlID8/ICd1bmtub3duJyxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0aGFzSW5wdXRzXG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gVHJhY2sgZmFpbGVkIGluc3RhbGxhdGlvblxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8TWNwU2VydmVySW5zdGFsbERhdGEsIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbj4oJ21jcC9zZXJ2ZXJJbnN0YWxsJywge1xuXHRcdFx0XHRzZXJ2ZXJOYW1lLFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdHNjb3BlOiAndW5rbm93bicsXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLFxuXHRcdFx0XHRoYXNJbnB1dHNcblx0XHRcdH0pO1xuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuaW5zdGFsbGluZy5pbmNsdWRlcyhzZXJ2ZXIpKSB7XG5cdFx0XHRcdHRoaXMuaW5zdGFsbGluZy5zcGxpY2UodGhpcy5pbnN0YWxsaW5nLmluZGV4T2Yoc2VydmVyKSwgMSk7XG5cdFx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoc2VydmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdhaXRBbmRHZXRJbnN0YWxsZWRNY3BTZXJ2ZXIoc2VydmVyOiBNY3BXb3JrYmVuY2hTZXJ2ZXIpOiBQcm9taXNlPElXb3JrYmVuY2hNY3BTZXJ2ZXI+IHtcblx0XHRsZXQgaW5zdGFsbGVkID0gdGhpcy5sb2NhbC5maW5kKGxvY2FsID0+IGxvY2FsLm5hbWUgPT09IHNlcnZlci5uYW1lKTtcblx0XHRpZiAoIWluc3RhbGxlZCkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcih0aGlzLm9uQ2hhbmdlLCBlID0+ICEhZSAmJiB0aGlzLmxvY2FsLnNvbWUobG9jYWwgPT4gbG9jYWwubmFtZSA9PT0gc2VydmVyLm5hbWUpKSk7XG5cdFx0fVxuXHRcdGluc3RhbGxlZCA9IHRoaXMubG9jYWwuZmluZChsb2NhbCA9PiBsb2NhbC5uYW1lID09PSBzZXJ2ZXIubmFtZSk7XG5cdFx0aWYgKCFpbnN0YWxsZWQpIHtcblx0XHRcdC8vIFRoaXMgc2hvdWxkIG5vdCBoYXBwZW5cblx0XHRcdHRocm93IG5ldyBFcnJvcignRXh0ZW5zaW9uIHNob3VsZCBoYXZlIGJlZW4gaW5zdGFsbGVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiBpbnN0YWxsZWQ7XG5cdH1cblxuXHRnZXRNY3BDb25maWdQYXRoKGxvY2FsTWNwU2VydmVyOiBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXIpOiBJTWNwQ29uZmlnUGF0aCB8IHVuZGVmaW5lZDtcblx0Z2V0TWNwQ29uZmlnUGF0aChtY3BSZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJTWNwQ29uZmlnUGF0aCB8IHVuZGVmaW5lZD47XG5cdGdldE1jcENvbmZpZ1BhdGgoYXJnOiBVUkkgfCBJV29ya2JlbmNoTG9jYWxNY3BTZXJ2ZXIpOiBQcm9taXNlPElNY3BDb25maWdQYXRoIHwgdW5kZWZpbmVkPiB8IElNY3BDb25maWdQYXRoIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoYXJnIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRjb25zdCBtY3BSZXNvdXJjZSA9IGFyZztcblx0XHRcdGZvciAoY29uc3QgcHJvZmlsZSBvZiB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChwcm9maWxlLm1jcFJlc291cmNlLCBtY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRVc2VyTWNwQ29uZmlnUGF0aChtY3BSZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMucmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCkudGhlbihyZW1vdGVFbnZpcm9ubWVudCA9PiB7XG5cdFx0XHRcdGlmIChyZW1vdGVFbnZpcm9ubWVudCAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyZW1vdGVFbnZpcm9ubWVudC5tY3BSZXNvdXJjZSwgbWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0UmVtb3RlTWNwQ29uZmlnUGF0aChtY3BSZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0V29ya3NwYWNlTWNwQ29uZmlnUGF0aChtY3BSZXNvdXJjZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoYXJnLnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFVzZXJNY3BDb25maWdQYXRoKGFyZy5tY3BSZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGFyZy5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFdvcmtzcGFjZU1jcENvbmZpZ1BhdGgoYXJnLm1jcFJlc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAoYXJnLnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFJlbW90ZU1jcENvbmZpZ1BhdGgoYXJnLm1jcFJlc291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVc2VyTWNwQ29uZmlnUGF0aChtY3BSZXNvdXJjZTogVVJJKTogSU1jcENvbmZpZ1BhdGgge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogVVNFUl9DT05GSUdfSUQsXG5cdFx0XHRrZXk6ICd1c2VyTG9jYWxWYWx1ZScsXG5cdFx0XHR0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWNwLmNvbmZpZ3VyYXRpb24udXNlckxvY2FsVmFsdWUnLCAnR2xvYmFsIGluIHswfScsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KSxcblx0XHRcdHNjb3BlOiBTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdG9yZGVyOiBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLlVzZXIsXG5cdFx0XHR1cmk6IG1jcFJlc291cmNlLFxuXHRcdFx0c2VjdGlvbjogW10sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVtb3RlTWNwQ29uZmlnUGF0aChtY3BSZXNvdXJjZTogVVJJKTogSU1jcENvbmZpZ1BhdGgge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogUkVNT1RFX1VTRVJfQ09ORklHX0lELFxuXHRcdFx0a2V5OiAndXNlclJlbW90ZVZhbHVlJyxcblx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSxcblx0XHRcdGxhYmVsOiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPyB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkgOiAnUmVtb3RlJyxcblx0XHRcdHNjb3BlOiBTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdG9yZGVyOiBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLlVzZXIgKyBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLlJlbW90ZUJvb3N0LFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHR1cmk6IG1jcFJlc291cmNlLFxuXHRcdFx0c2VjdGlvbjogW10sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V29ya3NwYWNlTWNwQ29uZmlnUGF0aChtY3BSZXNvdXJjZTogVVJJKTogSU1jcENvbmZpZ1BhdGggfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRpZiAod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24sIG1jcFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IFdPUktTUEFDRV9DT05GSUdfSUQsXG5cdFx0XHRcdGtleTogJ3dvcmtzcGFjZVZhbHVlJyxcblx0XHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSxcblx0XHRcdFx0bGFiZWw6IGJhc2VuYW1lKG1jcFJlc291cmNlKSxcblx0XHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRcdG9yZGVyOiBNY3BDb2xsZWN0aW9uU29ydE9yZGVyLldvcmtzcGFjZSxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdHVyaTogbWNwUmVzb3VyY2UsXG5cdFx0XHRcdHNlY3Rpb246IFsnc2V0dGluZ3MnLCBtY3BDb25maWd1cmF0aW9uU2VjdGlvbl0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB3b3Jrc3BhY2UuZm9sZGVycztcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgd29ya3NwYWNlRm9sZGVycy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHdvcmtzcGFjZUZvbGRlcnNbaW5kZXhdO1xuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5qb2luUGF0aCh3b3Jrc3BhY2VGb2xkZXIudXJpLCBXT1JLU1BBQ0VfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OU1tNQ1BfQ09ORklHVVJBVElPTl9LRVldKSwgbWNwUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IGAke1dPUktTUEFDRV9GT0xERVJfQ09ORklHX0lEX1BSRUZJWH0ke2luZGV4fWAsXG5cdFx0XHRcdFx0a2V5OiAnd29ya3NwYWNlRm9sZGVyVmFsdWUnLFxuXHRcdFx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSLFxuXHRcdFx0XHRcdGxhYmVsOiBgJHt3b3Jrc3BhY2VGb2xkZXIubmFtZX0vLnZzY29kZS9tY3AuanNvbmAsXG5cdFx0XHRcdFx0c2NvcGU6IFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0b3JkZXI6IE1jcENvbGxlY3Rpb25Tb3J0T3JkZXIuV29ya3NwYWNlRm9sZGVyLFxuXHRcdFx0XHRcdHVyaTogbWNwUmVzb3VyY2UsXG5cdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVVUkwodXJpOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodXJpLnBhdGggPT09ICdtY3AvaW5zdGFsbCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmhhbmRsZU1jcEluc3RhbGxVcmkodXJpKTtcblx0XHR9XG5cdFx0aWYgKHVyaS5wYXRoLnN0YXJ0c1dpdGgoJ21jcC9ieS1uYW1lLycpKSB7XG5cdFx0XHRjb25zdCBtY3BTZXJ2ZXJOYW1lID0gdXJpLnBhdGguc3Vic3RyaW5nKCdtY3AvYnktbmFtZS8nLmxlbmd0aCk7XG5cdFx0XHRpZiAobWNwU2VydmVyTmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVNY3BTZXJ2ZXJCeU5hbWUobWNwU2VydmVyTmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh1cmkucGF0aC5zdGFydHNXaXRoKCdtY3AvJykpIHtcblx0XHRcdGNvbnN0IG1jcFNlcnZlclVybCA9IHVyaS5wYXRoLnN1YnN0cmluZyg0KTtcblx0XHRcdGlmIChtY3BTZXJ2ZXJVcmwpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaGFuZGxlTWNwU2VydmVyVXJsKGAke1NjaGVtYXMuaHR0cHN9Oi8vJHttY3BTZXJ2ZXJVcmx9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlTWNwSW5zdGFsbFVyaSh1cmk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCBwYXJzZWQ6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uICYgeyBuYW1lOiBzdHJpbmc7IGlucHV0cz86IElNY3BTZXJ2ZXJWYXJpYWJsZVtdIH07XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IEpTT04ucGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHVyaS5xdWVyeSkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgeyBuYW1lLCBpbnB1dHMsIC4uLmNvbmZpZyB9ID0gcGFyc2VkO1xuXG5cdFx0XHQvLyBXaGVuIGEgZ2FsbGVyeSBmaWVsZCBpcyBwcmVzZW50IGFuZCB0aGUgZ2FsbGVyeSBzZXJ2aWNlIGlzIGF2YWlsYWJsZSxcblx0XHRcdC8vIHZlcmlmeSB0aGUgc2VydmVyIGV4aXN0cyBpbiB0aGUgYWN0aXZlIGdhbGxlcnkgYnkgbmFtZS4gSWYgdmVyaWZpZWQsXG5cdFx0XHQvLyByb3V0ZSB0aHJvdWdoIHRoZSBnYWxsZXJ5LW9ubHkgcGF0aCAobWF0Y2hpbmcgaGFuZGxlTWNwU2VydmVyQnlOYW1lKS5cblx0XHRcdGlmIChjb25maWcuZ2FsbGVyeSAmJiB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVnaXN0cnlHZW5lcmF0aW9uID0gdGhpcy5yZWdpc3RyeUdlbmVyYXRpb247XG5cdFx0XHRcdFx0Ly8gVmVyaWZ5IGJ5IG5hbWUgYWdhaW5zdCB0aGUgYWN0aXZlIGdhbGxlcnkgKG5vdCBieSBVUkwsIHdoaWNoIHdvdWxkXG5cdFx0XHRcdFx0Ly8gbWFrZSBvdXRib3VuZCByZXF1ZXN0cyB0byB1bnRydXN0ZWQgVVJMcyBmcm9tIHRoZSBwcm90b2NvbCBwYXlsb2FkKS5cblx0XHRcdFx0XHRjb25zdCBbZ2FsbGVyeVNlcnZlcl0gPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmdldE1jcFNlcnZlcnNGcm9tR2FsbGVyeShbeyBuYW1lIH1dKTtcblx0XHRcdFx0XHRpZiAoZ2FsbGVyeVNlcnZlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5yZW1lbWJlckdhbGxlcnlTb3VyY2UoZ2FsbGVyeVNlcnZlciwgcmVnaXN0cnlHZW5lcmF0aW9uKTtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2FsID0gdGhpcy5sb2NhbC5maW5kKGUgPT4gZS5uYW1lID09PSBnYWxsZXJ5U2VydmVyLm5hbWUpID8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwV29ya2JlbmNoU2VydmVyLCBlID0+IHRoaXMuZ2V0SW5zdGFsbFN0YXRlKGUpLCBlID0+IHRoaXMuZ2V0UnVudGltZVN0YXR1cyhlKSwgdW5kZWZpbmVkLCBnYWxsZXJ5U2VydmVyLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuKGxvY2FsKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgTUNQIHNlcnZlciAnJHtuYW1lfScgbm90IGZvdW5kIGluIGdhbGxlcnksIGluc3RhbGxpbmcgYXMgbG9jYWxgKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBHYWxsZXJ5IHZlcmlmaWNhdGlvbiBmYWlsZWQgZm9yIE1DUCBzZXJ2ZXIgJyR7bmFtZX0nLCBpbnN0YWxsaW5nIGFzIGxvY2FsYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbmZpZy50eXBlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0KDxNdXRhYmxlPElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uPj5jb25maWcpLnR5cGUgPSAoPElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24+cGFyc2VkKS5jb21tYW5kID8gTWNwU2VydmVyVHlwZS5MT0NBTCA6IE1jcFNlcnZlclR5cGUuUkVNT1RFO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5vcGVuKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwV29ya2JlbmNoU2VydmVyLCBlID0+IHRoaXMuZ2V0SW5zdGFsbFN0YXRlKGUpLCBlID0+IHRoaXMuZ2V0UnVudGltZVN0YXR1cyhlKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgbmFtZSwgY29uZmlnLCBpbnB1dHMgfSkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlTWNwU2VydmVyVXJsKHVybDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGdhbGxlcnkgPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmdldE1jcFNlcnZlcih1cmwpO1xuXHRcdFx0aWYgKCFnYWxsZXJ5KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBNQ1Agc2VydmVyICcke3VybH0nIG5vdCBmb3VuZGApO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxvY2FsID0gdGhpcy5sb2NhbC5maW5kKGUgPT4gZS5uYW1lID09PSBnYWxsZXJ5Lm5hbWUpID8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwV29ya2JlbmNoU2VydmVyLCBlID0+IHRoaXMuZ2V0SW5zdGFsbFN0YXRlKGUpLCBlID0+IHRoaXMuZ2V0UnVudGltZVN0YXR1cyhlKSwgdW5kZWZpbmVkLCBnYWxsZXJ5LCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5vcGVuKGxvY2FsKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZU1jcFNlcnZlckJ5TmFtZShuYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVnaXN0cnlHZW5lcmF0aW9uID0gdGhpcy5yZWdpc3RyeUdlbmVyYXRpb247XG5cdFx0XHRjb25zdCBbZ2FsbGVyeV0gPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlTZXJ2aWNlLmdldE1jcFNlcnZlcnNGcm9tR2FsbGVyeShbeyBuYW1lIH1dKTtcblx0XHRcdGlmICghZ2FsbGVyeSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgTUNQIHNlcnZlciAnJHtuYW1lfScgbm90IGZvdW5kYCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZW1lbWJlckdhbGxlcnlTb3VyY2UoZ2FsbGVyeSwgcmVnaXN0cnlHZW5lcmF0aW9uKTtcblx0XHRcdGNvbnN0IGxvY2FsID0gdGhpcy5sb2NhbC5maW5kKGUgPT4gZS5uYW1lID09PSBnYWxsZXJ5Lm5hbWUpID8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwV29ya2JlbmNoU2VydmVyLCBlID0+IHRoaXMuZ2V0SW5zdGFsbFN0YXRlKGUpLCBlID0+IHRoaXMuZ2V0UnVudGltZVN0YXR1cyhlKSwgdW5kZWZpbmVkLCBnYWxsZXJ5LCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5vcGVuKGxvY2FsKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhc3luYyBvcGVuU2VhcmNoKHNlYXJjaFZhbHVlOiBzdHJpbmcsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAbWNwICR7c2VhcmNoVmFsdWV9YCwgcHJlc2VydmVGb2N1cyk7XG5cdH1cblxuXHRhc3luYyBvcGVuKGV4dGVuc2lvbjogSVdvcmtiZW5jaE1jcFNlcnZlciwgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXNlTW9kYWwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdleHRlbnNpb25zLmFsbG93T3BlbkluTW9kYWxFZGl0b3InKTtcblx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFNlcnZlckVkaXRvcklucHV0LCBleHRlbnNpb24pLCBvcHRpb25zLCB1c2VNb2RhbCA/IE1PREFMX0dST1VQIDogQUNUSVZFX0dST1VQKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5zdGFsbFN0YXRlKGV4dGVuc2lvbjogTWNwV29ya2JlbmNoU2VydmVyKTogTWNwU2VydmVySW5zdGFsbFN0YXRlIHtcblx0XHRpZiAodGhpcy5pbnN0YWxsaW5nLnNvbWUoaSA9PiBpLm5hbWUgPT09IGV4dGVuc2lvbi5uYW1lKSkge1xuXHRcdFx0cmV0dXJuIE1jcFNlcnZlckluc3RhbGxTdGF0ZS5JbnN0YWxsaW5nO1xuXHRcdH1cblx0XHRpZiAodGhpcy51bmluc3RhbGxpbmcuc29tZShlID0+IGUubmFtZSA9PT0gZXh0ZW5zaW9uLm5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gTWNwU2VydmVySW5zdGFsbFN0YXRlLlVuaW5zdGFsbGluZztcblx0XHR9XG5cdFx0Y29uc3QgbG9jYWwgPSB0aGlzLmxvY2FsLmZpbmQoZSA9PiBlID09PSBleHRlbnNpb24pO1xuXHRcdHJldHVybiBsb2NhbCA/IE1jcFNlcnZlckluc3RhbGxTdGF0ZS5JbnN0YWxsZWQgOiBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFJ1bnRpbWVTdGF0dXMobWNwU2VydmVyOiBNY3BXb3JrYmVuY2hTZXJ2ZXIpOiBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbmFibGVtZW50U3RhdHVzID0gdGhpcy5nZXRFbmFibGVtZW50U3RhdHVzKG1jcFNlcnZlcik7XG5cblx0XHRpZiAoZW5hYmxlbWVudFN0YXR1cykge1xuXHRcdFx0cmV0dXJuIGVuYWJsZW1lbnRTdGF0dXM7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gbWNwU2VydmVyLmlkKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHsgc3RhdGU6IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBzZXJ2ZXIuZW5hYmxlbWVudC5nZXQoKTtcblx0XHRpZiAoZW5hYmxlbWVudCA9PT0gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3RhdGU6IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUsXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHR0ZXh0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Rpc2FibGVkIGdsb2JhbGx5JywgXCJUaGlzIE1DUCBzZXJ2ZXIgaXMgZGlzYWJsZWQuXCIpKVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoZW5hYmxlbWVudCA9PT0gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGF0ZTogTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0dGV4dDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkaXNhYmxlZCBpbiB3b3Jrc3BhY2UnLCBcIlRoaXMgTUNQIHNlcnZlciBpcyBkaXNhYmxlZCBmb3IgdGhpcyB3b3Jrc3BhY2UuXCIpKVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEVuYWJsZW1lbnRTdGF0dXMobWNwU2VydmVyOiBNY3BXb3JrYmVuY2hTZXJ2ZXIpOiBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzZXR0aW5nc0NvbW1hbmRMaW5rID0gY3JlYXRlQ29tbWFuZFVyaSgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCB7IHF1ZXJ5OiBgQGlkOiR7bWNwQWNjZXNzQ29uZmlnfWAgfSkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBhY2Nlc3NWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUobWNwQWNjZXNzQ29uZmlnKTtcblxuXHRcdGlmIChhY2Nlc3NWYWx1ZSA9PT0gTWNwQWNjZXNzVmFsdWUuTm9uZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3RhdGU6IE1jcFNlcnZlckVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5QWNjZXNzLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0dGV4dDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdkaXNhYmxlZCAtIGFsbCBub3QgYWxsb3dlZCcsIFwiVGhpcyBNQ1AgU2VydmVyIGlzIGRpc2FibGVkIGJlY2F1c2UgTUNQIHNlcnZlcnMgYXJlIGNvbmZpZ3VyZWQgdG8gYmUgZGlzYWJsZWQgaW4gdGhlIEVkaXRvci4gUGxlYXNlIGNoZWNrIHlvdXIgW3NldHRpbmdzXSh7MH0pLlwiLCBzZXR0aW5nc0NvbW1hbmRMaW5rKSlcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdH1cblxuXHRcdGlmIChhY2Nlc3NWYWx1ZSA9PT0gTWNwQWNjZXNzVmFsdWUuUmVnaXN0cnkpIHtcblx0XHRcdGlmICghbWNwU2VydmVyLmdhbGxlcnkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdGF0ZTogTWNwU2VydmVyRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlBY2Nlc3MsXG5cdFx0XHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0XHR0ZXh0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Rpc2FibGVkIC0gc29tZSBub3QgYWxsb3dlZCcsIFwiVGhpcyBNQ1AgU2VydmVyIGlzIGRpc2FibGVkIGJlY2F1c2UgaXQgaXMgY29uZmlndXJlZCB0byBiZSBkaXNhYmxlZCBpbiB0aGUgRWRpdG9yLiBQbGVhc2UgY2hlY2sgeW91ciBbc2V0dGluZ3NdKHswfSkuXCIsIHNldHRpbmdzQ29tbWFuZExpbmspKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVnaXN0cnkgbWVtYmVyc2hpcCBpcyBuYW1lLWJhc2VkIGZvciBsb2NhbCBjb25maWd1cmF0aW9uczsgcmVtb3RlIFVSTHMgbXVzdCBtYXRjaCBleGFjdGx5LlxuXHRcdFx0Y29uc3QgcmVtb3RlVXJsID0gbWNwU2VydmVyLmxvY2FsLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLlJFTU9URSAmJiBtY3BTZXJ2ZXIubG9jYWwuY29uZmlnLnVybDtcblx0XHRcdGlmIChyZW1vdGVVcmwgJiYgIW1jcFNlcnZlci5nYWxsZXJ5LmNvbmZpZ3VyYXRpb24ucmVtb3Rlcz8uc29tZShyZW1vdGUgPT4gcmVtb3RlLnVybCA9PT0gcmVtb3RlVXJsKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN0YXRlOiBNY3BTZXJ2ZXJFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUFjY2Vzcyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdHRleHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGlzYWJsZWQgLSBzb21lIG5vdCBhbGxvd2VkJywgXCJUaGlzIE1DUCBTZXJ2ZXIgaXMgZGlzYWJsZWQgYmVjYXVzZSBpdCBpcyBjb25maWd1cmVkIHRvIGJlIGRpc2FibGVkIGluIHRoZSBFZGl0b3IuIFBsZWFzZSBjaGVjayB5b3VyIFtzZXR0aW5nc10oezB9KS5cIiwgc2V0dGluZ3NDb21tYW5kTGluaykpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgTUNQQ29udGV4dHNJbml0aWFsaXNhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgSUQgPSAnd29ya2JlbmNoLm1jcC5jb250ZXh0cy5pbml0aWFsaXNhdGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSBtY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBtY3BTZXJ2ZXJzR2FsbGVyeVN0YXR1cyA9IE1jcFNlcnZlcnNHYWxsZXJ5U3RhdHVzQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdG1jcFNlcnZlcnNHYWxsZXJ5U3RhdHVzLnNldChtY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLm1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5vbkRpZENoYW5nZU1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cyhzdGF0dXMgPT4gbWNwU2VydmVyc0dhbGxlcnlTdGF0dXMuc2V0KHN0YXR1cykpKTtcblxuXHRcdGNvbnN0IGhhc0luc3RhbGxlZE1jcFNlcnZlcnNDb250ZXh0S2V5ID0gSGFzSW5zdGFsbGVkTWNwU2VydmVyc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRtY3BXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGhhc0luc3RhbGxlZE1jcFNlcnZlcnNDb250ZXh0S2V5LnNldChtY3BXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmxlbmd0aCA+IDApO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobWNwV29ya2JlbmNoU2VydmljZS5vbkNoYW5nZSgoKSA9PiBoYXNJbnN0YWxsZWRNY3BTZXJ2ZXJzQ29udGV4dEtleS5zZXQobWNwV29ya2JlbmNoU2VydmljZS5sb2NhbC5sZW5ndGggPiAwKSkpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQW1DLHNCQUFzQjtBQUNsRSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUE0QixvQkFBMEYsaUJBQWlCLGdCQUFnQiwyQkFBMkQsK0JBQStCO0FBQ2pQLFNBQVMseUJBQXlCO0FBQ2xDLFNBQW9GLHFCQUFxQjtBQUN6RyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHVCQUF1QiwyQ0FBMkM7QUFDM0UsU0FBUyxjQUFjLGdCQUFnQixtQkFBbUI7QUFDMUQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBd0UsZ0NBQW9HLHFCQUFxQix1QkFBdUIsZ0JBQWdCLHFCQUFxQix5Q0FBeUM7QUFDdFMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUywrQkFBK0MsYUFBYSxzQkFBMkMsd0JBQXdCLDBCQUEwQix1QkFBa0Qsc0NBQXNDO0FBQzFQLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsU0FBUyxtQkFBbUI7QUFDckMsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsd0JBQXdCO0FBTWpDLElBQU0scUJBQU4sTUFBd0Q7QUFBQSxFQUV2RCxZQUNTLHNCQUNBLHNCQUNELE9BQ0EsU0FDUyxhQUNxQixtQkFDTixhQUM5QjtBQVBPO0FBQ0E7QUFDRDtBQUNBO0FBQ1M7QUFDcUI7QUFDTjtBQUUvQixTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFQSxJQUFJLEtBQWE7QUFDaEIsV0FBTyxLQUFLLE9BQU8sTUFBTSxLQUFLLFNBQVMsUUFBUSxLQUFLLGFBQWEsUUFBUSxLQUFLO0FBQUEsRUFDL0U7QUFBQSxFQUVBLElBQUksT0FBZTtBQUNsQixXQUFPLEtBQUssU0FBUyxRQUFRLEtBQUssT0FBTyxRQUFRLEtBQUssYUFBYSxRQUFRO0FBQUEsRUFDNUU7QUFBQSxFQUVBLElBQUksUUFBZ0I7QUFDbkIsV0FBTyxLQUFLLFNBQVMsZUFBZSxLQUFLLE9BQU8sZUFBZSxLQUFLLE9BQU8sUUFBUSxLQUFLLGFBQWEsUUFBUTtBQUFBLEVBQzlHO0FBQUEsRUFFQSxJQUFJLE9BR1U7QUFDYixXQUFPLEtBQUssU0FBUyxRQUFRLEtBQUssT0FBTztBQUFBLEVBQzFDO0FBQUEsRUFFQSxJQUFJLGVBQXNDO0FBQ3pDLFdBQU8sS0FBSyxxQkFBcUIsSUFBSTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxJQUFJLFVBQThCO0FBQ2pDLFdBQU8sS0FBSyxTQUFTLFdBQVcsS0FBSyxPQUFPO0FBQUEsRUFDN0M7QUFBQSxFQUVBLElBQUksdUJBQTJDO0FBQzlDLFdBQU8sS0FBSyxTQUFTLHdCQUF3QixLQUFLLE9BQU8sd0JBQXdCLEtBQUssU0FBUyxhQUFhLEtBQUssT0FBTztBQUFBLEVBQ3pIO0FBQUEsRUFFQSxJQUFJLGVBQW1DO0FBQ3RDLFdBQU8sS0FBSyxTQUFTLGlCQUFpQjtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxJQUFJLGNBQXNCO0FBQ3pCLFdBQU8sS0FBSyxTQUFTLGVBQWUsS0FBSyxPQUFPLGVBQWU7QUFBQSxFQUNoRTtBQUFBLEVBRUEsSUFBSSxhQUFxQjtBQUN4QixXQUFPLEtBQUssU0FBUyxjQUFjO0FBQUEsRUFDcEM7QUFBQSxFQUVBLElBQUksVUFBOEI7QUFDakMsV0FBTyxLQUFLLFNBQVM7QUFBQSxFQUN0QjtBQUFBLEVBRUEsSUFBSSxhQUFpQztBQUNwQyxXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxJQUFJLFNBQThDO0FBQ2pELFdBQU8sS0FBSyxPQUFPLFVBQVUsS0FBSyxhQUFhO0FBQUEsRUFDaEQ7QUFBQSxFQUVBLElBQUksZ0JBQXVEO0FBQzFELFdBQU8sS0FBSyxxQkFBcUIsSUFBSTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxJQUFJLFlBQTZCO0FBQ2hDLFdBQU8sS0FBSyxPQUFPLGNBQWMsS0FBSyxTQUFTLFlBQVksSUFBSSxNQUFNLEtBQUssUUFBUSxTQUFTLElBQUk7QUFBQSxFQUNoRztBQUFBLEVBRUEsTUFBTSxVQUFVLE9BQTJDO0FBQzFELFFBQUksS0FBSyxPQUFPLFdBQVc7QUFDMUIsWUFBTSxVQUFVLE1BQU0sS0FBSyxZQUFZLFNBQVMsS0FBSyxNQUFNLFNBQVM7QUFDcEUsYUFBTyxRQUFRLE1BQU0sU0FBUztBQUFBLElBQy9CO0FBRUEsUUFBSSxLQUFLLFNBQVMsUUFBUTtBQUN6QixhQUFPLEtBQUssUUFBUTtBQUFBLElBQ3JCO0FBRUEsUUFBSSxLQUFLLFNBQVMsV0FBVztBQUM1QixhQUFPLEtBQUssa0JBQWtCLFVBQVUsS0FBSyxTQUFTLEtBQUs7QUFBQSxJQUM1RDtBQUVBLFdBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxlQUFlLENBQUM7QUFBQSxFQUNqRDtBQUFBLEVBRUEsTUFBTSxZQUFZLE9BQW1FO0FBQ3BGLFFBQUksS0FBSyxPQUFPLFVBQVU7QUFDekIsYUFBTyxLQUFLLE1BQU07QUFBQSxJQUNuQjtBQUVBLFFBQUksS0FBSyxTQUFTO0FBQ2pCLGFBQU8sS0FBSyxRQUFRO0FBQUEsSUFDckI7QUFFQSxVQUFNLElBQUksTUFBTSx1QkFBdUI7QUFBQSxFQUN4QztBQUVEO0FBMUdNLHFCQUFOO0FBQUEsRUFRRztBQUFBLEVBQ0E7QUFBQSxHQVRHO0FBNEdDLElBQU0sc0JBQU4sY0FBa0MsV0FBMkM7QUFBQSxFQXVCbkYsWUFDNkIsMkJBQ1MsbUJBQ1ksc0JBQ2hCLGVBQ1UseUJBQ0wsb0JBQ0ssa0JBQ0ksb0JBQ2YsY0FDRSxnQkFDSSxvQkFDRSxzQkFDQSxzQkFDSixrQkFDTixZQUNnQiw0QkFDRiwwQkFDZCxZQUNqQixZQUNaO0FBQ0QsVUFBTTtBQW5CK0I7QUFDWTtBQUNoQjtBQUNVO0FBQ0w7QUFDSztBQUNJO0FBQ2Y7QUFDRTtBQUNJO0FBQ0U7QUFDQTtBQUNKO0FBQ047QUFDZ0I7QUFDRjtBQUNkO0FBckMvQixTQUFRLGFBQW1DLENBQUM7QUFDNUMsU0FBUSxlQUFxQyxDQUFDO0FBRTlDLFNBQVEsU0FBK0IsQ0FBQztBQUN4QyxTQUFRLHlCQUF5QjtBQUNqQyxTQUFRLHFCQUFxQjtBQUM3QixTQUFRLHVCQUF1QjtBQUMvQixTQUFRLDBCQUEwQjtBQUVsQztBQUFBLFNBQWlCLDJCQUEyQixvQkFBSSxRQUFtQztBQUNuRixTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksaUJBQXVCLENBQUMsQ0FBQztBQUduRixTQUFpQixZQUFZLEtBQUssVUFBVSxJQUFJLFFBQXlDLENBQUM7QUFDMUYsU0FBUyxXQUFXLEtBQUssVUFBVTtBQUVuQyxTQUFpQixXQUFXLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM5RCxTQUFTLFVBQVUsS0FBSyxTQUFTO0FBd0JoQyxTQUFLLFVBQVUsS0FBSyxxQkFBcUIsdUNBQXVDLE9BQUssS0FBSyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7QUFDcEgsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHNDQUFzQyxPQUFLLEtBQUssc0JBQXNCLENBQUMsQ0FBQyxDQUFDO0FBQ2xILFNBQUssVUFBVSxLQUFLLHFCQUFxQix3Q0FBd0MsT0FBSyxLQUFLLHdCQUF3QixDQUFDLENBQUMsQ0FBQztBQUN0SCxTQUFLLFVBQVUsS0FBSyxxQkFBcUIsbUJBQW1CLE9BQUssS0FBSyxtQkFBbUIsQ0FBQyxDQUFDO0FBQzNGLFNBQUssV0FBVyxFQUFFLEtBQUssTUFBTTtBQUM1QixVQUFJLEtBQUssT0FBTyxZQUFZO0FBQzNCO0FBQUEsTUFDRDtBQUNBLFdBQUssVUFBVSwwQkFBMEIsOEJBQThCLE1BQU07QUFDNUUsYUFBSywrQkFBK0I7QUFDcEMsYUFBSyxxQkFBcUI7QUFBQSxNQUMzQixDQUFDLENBQUM7QUFDRixXQUFLLHFCQUFxQjtBQUFBLElBQzNCLENBQUM7QUFDRCxlQUFXLGdCQUFnQixJQUFJO0FBQy9CLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsT0FBSztBQUN0RSxVQUFJLEVBQUUscUJBQXFCLGVBQWUsR0FBRztBQUM1QyxhQUFLLFVBQVUsS0FBSyxNQUFTO0FBQUEsTUFDOUI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLHlCQUF5Qiw2QkFBNkIsTUFBTTtBQUMvRSxXQUFLLFNBQVMsS0FBSyxLQUFLLEtBQUssTUFBTTtBQUNuQyxXQUFLLFVBQVUsS0FBSyxNQUFTO0FBQUEsSUFDOUIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLFlBQVksV0FBVyxTQUFTLE1BQU07QUFDcEQsV0FBSyxTQUFTLEtBQUssS0FBSyxLQUFLLE1BQU07QUFDbkMsV0FBSyxVQUFVLEtBQUssTUFBUztBQUFBLElBQzlCLENBQUMsQ0FBQztBQUdGLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsaUJBQVcsVUFBVSxXQUFXLFFBQVEsS0FBSyxNQUFNLEdBQUc7QUFDckQsZUFBTyxXQUFXLEtBQUssTUFBTTtBQUFBLE1BQzlCO0FBQ0EsV0FBSyxVQUFVLEtBQUssTUFBUztBQUFBLElBQzlCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQWxFQSxJQUFJLFFBQXVDO0FBQUUsV0FBTyxDQUFDLEdBQUcsS0FBSyxNQUFNO0FBQUEsRUFBRztBQUFBLEVBb0V0RSxNQUFjLHFCQUFxQjtBQUNsQyxVQUFNLDBCQUEwQixFQUFFLEtBQUs7QUFDdkMsVUFBTSxhQUFhLEVBQUUsS0FBSztBQUMxQixTQUFLLCtCQUErQjtBQUNwQyxVQUFNLEtBQUssd0JBQXdCLFVBQVU7QUFDN0MsUUFBSSw0QkFBNEIsS0FBSyx5QkFBeUI7QUFDN0Q7QUFBQSxJQUNEO0FBQ0EsU0FBSyxTQUFTLEtBQUs7QUFDbkIsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBRVEsaUNBQXVDO0FBQzlDLFNBQUs7QUFDTCxTQUFLO0FBQ0wsZUFBVyxVQUFVLEtBQUssUUFBUTtBQUNqQyxhQUFPLFVBQVU7QUFBQSxJQUNsQjtBQUNBLFNBQUssVUFBVSxLQUFLLE1BQVM7QUFBQSxFQUM5QjtBQUFBLEVBRVEsa0JBQWtCLEdBQTZELEdBQXNFO0FBQzVKLFFBQUksTUFBTSxHQUFHO0FBQ1osYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLENBQUMsS0FBSyxDQUFDLEdBQUc7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRTtBQUFBLEVBQzNDO0FBQUEsRUFFUSx3QkFBd0IsR0FBd0M7QUFDdkUsUUFBSSxFQUFFLE9BQU87QUFDWjtBQUFBLElBQ0Q7QUFDQSxVQUFNLGNBQWMsS0FBSyxPQUFPLEtBQUssWUFBVSxLQUFLLGtCQUFrQixPQUFPLE9BQU8sQ0FBQyxDQUFDO0FBQ3RGLFFBQUksYUFBYTtBQUNoQixXQUFLLFNBQVMsS0FBSyxPQUFPLE9BQU8sWUFBVSxXQUFXLFdBQVc7QUFDakUsV0FBSyxVQUFVLEtBQUssV0FBVztBQUFBLElBQ2hDO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQXVCLEdBQWdEO0FBQzlFLFFBQUksb0JBQW9CO0FBQ3hCLGVBQVcsRUFBRSxPQUFPLE1BQU0sT0FBTyxLQUFLLEdBQUc7QUFDeEMsVUFBSSxTQUFTLEtBQUssV0FBVyxLQUFLLENBQUFBLFlBQVVBLFFBQU8sU0FBUyxRQUFRLEtBQUssa0JBQWtCQSxRQUFPLE9BQU8sS0FBSyxJQUFJQSxRQUFPLFNBQVMsSUFBSTtBQUN0SSxXQUFLLGFBQWEsU0FBUyxLQUFLLFdBQVcsT0FBTyxDQUFBQyxPQUFLQSxPQUFNLE1BQU0sSUFBSSxLQUFLO0FBQzVFLFVBQUksT0FBTztBQUNWLGNBQU0saUJBQWlCLEtBQUssd0JBQXdCLE1BQU0sS0FBSyxLQUFLLHdCQUF3QixRQUFRLE9BQU87QUFDM0csWUFBSSxRQUFRO0FBQ1gsaUJBQU8sUUFBUTtBQUFBLFFBQ2hCLE9BQU87QUFDTixtQkFBUyxLQUFLLHFCQUFxQixlQUFlLG9CQUFvQixDQUFBQSxPQUFLLEtBQUssZ0JBQWdCQSxFQUFDLEdBQUcsQ0FBQUEsT0FBSyxLQUFLLGlCQUFpQkEsRUFBQyxHQUFHLE9BQU8sUUFBVyxNQUFTO0FBQUEsUUFDL0o7QUFDQSxlQUFPLFVBQVUsZ0JBQWdCLFNBQVMsTUFBTSxPQUFPLGlCQUFpQjtBQUN4RSw0QkFBb0I7QUFDcEIsYUFBSyxTQUFTLEtBQUssT0FBTyxPQUFPLENBQUFELFlBQVUsQ0FBQyxLQUFLLGtCQUFrQkEsUUFBTyxPQUFPLEtBQUssQ0FBQztBQUN2RixhQUFLLFVBQVUsTUFBTTtBQUFBLE1BQ3RCO0FBQ0EsV0FBSyxVQUFVLEtBQUssTUFBTTtBQUFBLElBQzNCO0FBQ0EsUUFBSSxtQkFBbUI7QUFDdEIsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixHQUFnRDtBQUM3RSxRQUFJLG9CQUFvQjtBQUN4QixlQUFXLFVBQVUsR0FBRztBQUN2QixVQUFJLENBQUMsT0FBTyxPQUFPO0FBQ2xCO0FBQUEsTUFDRDtBQUNBLFlBQU0sY0FBYyxLQUFLLE9BQU8sVUFBVSxDQUFBQSxZQUFVLEtBQUssa0JBQWtCQSxRQUFPLE9BQU8sT0FBTyxLQUFLLENBQUM7QUFDdEcsVUFBSTtBQUNKLFVBQUksZ0JBQWdCLElBQUk7QUFDdkIsYUFBSyxPQUFPLFdBQVcsRUFBRSxRQUFRLE9BQU87QUFDeEMsaUJBQVMsS0FBSyxPQUFPLFdBQVc7QUFBQSxNQUNqQyxPQUFPO0FBQ04saUJBQVMsS0FBSyxxQkFBcUIsZUFBZSxvQkFBb0IsQ0FBQUMsT0FBSyxLQUFLLGdCQUFnQkEsRUFBQyxHQUFHLENBQUFBLE9BQUssS0FBSyxpQkFBaUJBLEVBQUMsR0FBRyxPQUFPLE9BQU8sUUFBVyxNQUFTO0FBQ3JLLGFBQUssVUFBVSxNQUFNO0FBQUEsTUFDdEI7QUFDQSxZQUFNLGlCQUFpQixLQUFLLHdCQUF3QixPQUFPLE1BQU0sS0FBSyxLQUFLLHdCQUF3QixPQUFPLE9BQU87QUFDakgsYUFBTyxVQUFVLGdCQUFnQixTQUFTLE9BQU8sTUFBTSxPQUFPLGlCQUFpQjtBQUMvRSwwQkFBb0I7QUFDcEIsV0FBSyxVQUFVLEtBQUssTUFBTTtBQUFBLElBQzNCO0FBQ0EsUUFBSSxtQkFBbUI7QUFDdEIsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFlBQVksU0FBNEIsb0JBQTZEO0FBQzVHLFNBQUssc0JBQXNCLFNBQVMsa0JBQWtCO0FBQ3RELGVBQVcsU0FBUyxLQUFLLFFBQVE7QUFDaEMsVUFBSSxNQUFNLFNBQVMsUUFBUSxNQUFNO0FBQ2hDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsVUFBTSxhQUFhLEVBQUUsS0FBSztBQUMxQixTQUFLLEtBQUssb0JBQW9CLFFBQVEsTUFBTSxLQUFLLHdCQUF3QixVQUFVLENBQUMsRUFDbEYsTUFBTSxXQUFTLEtBQUssV0FBVyxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQzlDO0FBQUEsRUFFQSxNQUFjLHdCQUF3QixZQUFtQztBQUN4RSxRQUFJLENBQUMsS0FBSyxrQkFBa0IsVUFBVSxHQUFHO0FBQ3hDO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxLQUFLLE1BQU0sUUFBUSxZQUFVLE9BQU8sUUFBUSxDQUFDLEVBQUUsUUFBUSxPQUFPLE9BQU8sTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2xHLFVBQU0sY0FBYyxvQkFBSSxJQUEyQztBQUNuRSxlQUFXLEVBQUUsTUFBTSxLQUFLLFNBQVM7QUFDaEMsWUFBTSxXQUFXLFlBQVksSUFBSSxNQUFNLElBQUk7QUFDM0MsVUFBSSxDQUFDLFlBQWEsQ0FBQyxTQUFTLE1BQU0sTUFBTSxXQUFZO0FBQ25ELG9CQUFZLElBQUksTUFBTSxNQUFNLEVBQUUsTUFBTSxNQUFNLE1BQU0sSUFBSSxNQUFNLFVBQVUsQ0FBQztBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUSxDQUFDLEdBQUcsWUFBWSxPQUFPLENBQUM7QUFFdEMsUUFBSSxDQUFDLE1BQU0sUUFBUTtBQUNsQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsTUFBTSxLQUFLLGtCQUFrQiw2QkFBNkIsS0FBSztBQUNoRixRQUFJLGVBQWUsS0FBSyx3QkFBd0I7QUFDL0M7QUFBQSxJQUNEO0FBQ0EsU0FBSyxtQ0FBbUMsVUFBVSxTQUFTLFVBQVU7QUFBQSxFQUN0RTtBQUFBLEVBRVEsbUNBQ1AsVUFDQSxTQUNBLFlBQ087QUFDUCxlQUFXLEVBQUUsUUFBUSxXQUFXLE1BQU0sS0FBSyxTQUFTO0FBQ25ELFVBQUksZUFBZSxLQUFLLDBCQUEwQixDQUFDLEtBQUssT0FBTyxTQUFTLFNBQVMsS0FBSyxVQUFVLFVBQVUsT0FBTztBQUNoSDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQVMsU0FBUyxJQUFJLE1BQU0sSUFBSTtBQUl0QyxVQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsd0JBQXdCLFFBQVE7QUFDaEU7QUFBQSxNQUNEO0FBRUEsVUFBSSxPQUFPLFdBQVcsd0JBQXdCLFVBQVU7QUFDdkQsWUFBSSxVQUFVLFNBQVM7QUFDdEIsb0JBQVUsVUFBVTtBQUNwQixlQUFLLFVBQVUsS0FBSyxTQUFTO0FBQUEsUUFDOUI7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFVBQVUsT0FBTztBQUN2QixZQUFNLFVBQVUsVUFBVSxZQUFZO0FBQ3RDLFdBQUssc0JBQXNCLE9BQU87QUFDbEMsZ0JBQVUsVUFBVTtBQUNwQixVQUFJLFNBQVM7QUFDWixhQUFLLFVBQVUsS0FBSyxTQUFTO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxhQUFhLFNBQXlCLE9BQTBFO0FBQ3JILFFBQUksQ0FBQyxLQUFLLGtCQUFrQixVQUFVLEdBQUc7QUFDeEMsYUFBTztBQUFBLFFBQ04sV0FBVyxFQUFFLE9BQU8sQ0FBQyxHQUFHLFNBQVMsTUFBTTtBQUFBLFFBQ3ZDLGFBQWEsYUFBYSxFQUFFLE9BQU8sQ0FBQyxHQUFHLFNBQVMsTUFBTTtBQUFBLE1BQ3ZEO0FBQUEsSUFDRDtBQUNBLFVBQU0scUJBQXFCLEtBQUs7QUFDaEMsVUFBTSxRQUFRLE1BQU0sS0FBSyxrQkFBa0IsTUFBTSxTQUFTLEtBQUs7QUFDL0QsVUFBTSxVQUFVLENBQUMsVUFBa0Y7QUFBQSxNQUNsRyxPQUFPLEtBQUssTUFBTSxJQUFJLGFBQVcsS0FBSyxZQUFZLFNBQVMsa0JBQWtCLEtBQUssS0FBSyxxQkFBcUIsZUFBZSxvQkFBb0IsT0FBSyxLQUFLLGdCQUFnQixDQUFDLEdBQUcsT0FBSyxLQUFLLGlCQUFpQixDQUFDLEdBQUcsUUFBVyxTQUFTLE1BQVMsQ0FBQztBQUFBLE1BQzFPLFNBQVMsS0FBSztBQUFBLElBQ2Y7QUFFQSxXQUFPO0FBQUEsTUFDTixXQUFXLFFBQVEsTUFBTSxTQUFTO0FBQUEsTUFDbEMsYUFBYSxPQUFPLE9BQU87QUFDMUIsY0FBTSxXQUFXLE1BQU0sTUFBTSxZQUFZLEVBQUU7QUFDM0MsZUFBTyxRQUFRLFFBQVE7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGFBQTZDO0FBQ2xELFVBQU0sS0FBSyx3QkFBd0IsRUFBRSxLQUFLLG9CQUFvQjtBQUM5RCxXQUFPLENBQUMsR0FBRyxLQUFLLEtBQUs7QUFBQSxFQUN0QjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsWUFBc0M7QUFDM0UsVUFBTSxZQUFZLE1BQU0sS0FBSyxxQkFBcUIsYUFBYTtBQUMvRCxRQUFJLGVBQWUsS0FBSyxzQkFBc0I7QUFDN0MsYUFBTztBQUFBLElBQ1I7QUFDQSxTQUFLLFNBQVMsS0FBSyxLQUFLLFVBQVUsSUFBSSxPQUFLO0FBQzFDLFlBQU0sV0FBVyxLQUFLLE9BQU8sS0FBSyxDQUFBQyxXQUFTQSxPQUFNLE9BQU8sRUFBRSxFQUFFO0FBQzVELFlBQU0sUUFBUSxZQUFZLEtBQUsscUJBQXFCLGVBQWUsb0JBQW9CLE9BQUssS0FBSyxnQkFBZ0IsQ0FBQyxHQUFHLE9BQUssS0FBSyxpQkFBaUIsQ0FBQyxHQUFHLFFBQVcsUUFBVyxNQUFTO0FBQ25MLFlBQU0sUUFBUTtBQUNkLGFBQU87QUFBQSxJQUNSLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLE1BQVM7QUFDN0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHNCQUFzQixTQUE0QixxQkFBcUIsS0FBSyxvQkFBMEI7QUFDN0csUUFBSSx1QkFBdUIsS0FBSyxvQkFBb0I7QUFDbkQsV0FBSyx5QkFBeUIsSUFBSSxTQUFTLGtCQUFrQjtBQUFBLElBQzlEO0FBQUEsRUFDRDtBQUFBLEVBRVEsd0JBQXdCLFNBQXVFO0FBQ3RHLFdBQU8sV0FBVyxLQUFLLHlCQUF5QixJQUFJLE9BQU8sTUFBTSxLQUFLLHFCQUFxQixVQUFVO0FBQUEsRUFDdEc7QUFBQSxFQUVRLFVBQVUsUUFBa0M7QUFDbkQsU0FBSyxPQUFPLEtBQUssTUFBTTtBQUN2QixTQUFLLFNBQVMsS0FBSyxLQUFLLEtBQUssTUFBTTtBQUFBLEVBQ3BDO0FBQUEsRUFFUSxLQUFLLE9BQW1EO0FBQy9ELFdBQU8sTUFBTSxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQzNCLFVBQUksRUFBRSxTQUFTLEVBQUUsTUFBTTtBQUN0QixZQUFJLENBQUMsRUFBRSxpQkFBaUIsRUFBRSxjQUFjLFVBQVUseUJBQXlCLFNBQVM7QUFDbkYsaUJBQU87QUFBQSxRQUNSO0FBQ0EsWUFBSSxDQUFDLEVBQUUsaUJBQWlCLEVBQUUsY0FBYyxVQUFVLHlCQUF5QixTQUFTO0FBQ25GLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxFQUFFLEtBQUssY0FBYyxFQUFFLElBQUk7QUFBQSxJQUNuQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsNEJBQXdEO0FBQ3ZELFVBQU0sU0FBUyxvQkFBSSxJQUFzQztBQUN6RCxVQUFNLGFBQXlDLENBQUM7QUFDaEQsVUFBTSxZQUF3QyxDQUFDO0FBRS9DLGVBQVcsVUFBVSxLQUFLLE9BQU87QUFDaEMsWUFBTSxtQkFBbUIsS0FBSyxvQkFBb0IsTUFBTTtBQUN4RCxVQUFJLG9CQUFvQixpQkFBaUIsVUFBVSx5QkFBeUIsU0FBUztBQUNwRjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLE9BQU8sT0FBTyxVQUFVLG9CQUFvQixNQUFNO0FBQ3JELGVBQU8sSUFBSSxPQUFPLE1BQU0sT0FBTyxLQUFLO0FBQUEsTUFDckMsV0FBVyxPQUFPLE9BQU8sVUFBVSxvQkFBb0IsWUFBWTtBQUNsRSxtQkFBVyxLQUFLLE9BQU8sS0FBSztBQUFBLE1BQzdCLFdBQVcsT0FBTyxPQUFPLFVBQVUsb0JBQW9CLFdBQVc7QUFDakUsa0JBQVUsS0FBSyxPQUFPLEtBQUs7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFFQSxlQUFXLFVBQVUsWUFBWTtBQUNoQyxZQUFNLFdBQVcsT0FBTyxJQUFJLE9BQU8sSUFBSTtBQUN2QyxVQUFJLFVBQVU7QUFDYixhQUFLLFdBQVcsS0FBSyxTQUFTLGVBQWUsbURBQW1ELE9BQU8sTUFBTSxPQUFPLFlBQVksTUFBTSxTQUFTLFlBQVksSUFBSSxDQUFDO0FBQUEsTUFDaks7QUFDQSxhQUFPLElBQUksT0FBTyxNQUFNLE1BQU07QUFBQSxJQUMvQjtBQUVBLGVBQVcsVUFBVSxXQUFXO0FBQy9CLFlBQU0sV0FBVyxPQUFPLElBQUksT0FBTyxJQUFJO0FBQ3ZDLFVBQUksVUFBVTtBQUNiLGFBQUssV0FBVyxLQUFLLFNBQVMsZUFBZSxtREFBbUQsT0FBTyxNQUFNLE9BQU8sWUFBWSxNQUFNLFNBQVMsWUFBWSxJQUFJLENBQUM7QUFBQSxNQUNqSztBQUNBLGFBQU8sSUFBSSxPQUFPLE1BQU0sTUFBTTtBQUFBLElBQy9CO0FBRUEsV0FBTyxDQUFDLEdBQUcsT0FBTyxPQUFPLENBQUM7QUFBQSxFQUMzQjtBQUFBLEVBRUEsV0FBVyxXQUF3RDtBQUNsRSxRQUFJLEVBQUUscUJBQXFCLHFCQUFxQjtBQUMvQyxhQUFPLElBQUksZUFBZSxFQUFFLFdBQVcsU0FBUyxvQkFBb0IsMkNBQTJDLENBQUM7QUFBQSxJQUNqSDtBQUVBLFFBQUksVUFBVSxTQUFTO0FBQ3RCLFlBQU0sU0FBUyxLQUFLLHFCQUFxQixXQUFXLFVBQVUsT0FBTztBQUNyRSxVQUFJLFdBQVcsTUFBTTtBQUNwQixlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxVQUFVLGFBQWE7QUFDMUIsWUFBTSxTQUFTLEtBQUsscUJBQXFCLFdBQVcsVUFBVSxXQUFXO0FBQ3pFLFVBQUksV0FBVyxNQUFNO0FBQ3BCLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFHQSxXQUFPLElBQUksZUFBZSxFQUFFLFdBQVcsU0FBUyx1QkFBdUIsa0ZBQWtGLFVBQVUsS0FBSyxDQUFDO0FBQUEsRUFDMUs7QUFBQSxFQUVBLE1BQU0sUUFBUSxRQUE2QixnQkFBaUY7QUFDM0gsUUFBSSxFQUFFLGtCQUFrQixxQkFBcUI7QUFDNUMsWUFBTSxJQUFJLE1BQU0seUJBQXlCO0FBQUEsSUFDMUM7QUFFQSxRQUFJLE9BQU8sYUFBYTtBQUN2QixZQUFNLGNBQWMsT0FBTztBQUMzQixhQUFPLEtBQUssVUFBVSxRQUFRLE1BQU0sS0FBSyxxQkFBcUIsUUFBUSxhQUFhLGNBQWMsQ0FBQztBQUFBLElBQ25HO0FBRUEsUUFBSSxPQUFPLFNBQVM7QUFDbkIsWUFBTSxVQUFVLE9BQU87QUFDdkIsYUFBTyxLQUFLLFVBQVUsUUFBUSxNQUFNLEtBQUsscUJBQXFCLG1CQUFtQixTQUFTLGNBQWMsQ0FBQztBQUFBLElBQzFHO0FBRUEsVUFBTSxJQUFJLE1BQU0sNkJBQTZCO0FBQUEsRUFDOUM7QUFBQSxFQUVBLE1BQU0sVUFBVSxRQUE0QztBQUMzRCxRQUFJLENBQUMsT0FBTyxPQUFPO0FBQ2xCLFlBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFBLElBQzFDO0FBQ0EsVUFBTSxLQUFLLHFCQUFxQixVQUFVLE9BQU8sS0FBSztBQUFBLEVBQ3ZEO0FBQUEsRUFFQSxNQUFjLFVBQVUsUUFBNEIsYUFBb0Y7QUFDdkksVUFBTSxTQUFTLE9BQU8sVUFBVSxZQUFZO0FBQzVDLFVBQU0sYUFBYSxPQUFPO0FBRTFCLFVBQU0sWUFBWSxDQUFDLEVBQUUsT0FBTyxhQUFhLFVBQVUsT0FBTyxZQUFZLE9BQU8sU0FBUztBQUV0RixTQUFLLFdBQVcsS0FBSyxNQUFNO0FBQzNCLFNBQUssVUFBVSxLQUFLLE1BQU07QUFFMUIsUUFBSTtBQUNILFlBQU0sWUFBWTtBQUNsQixZQUFNLFNBQVMsTUFBTSxLQUFLLDZCQUE2QixNQUFNO0FBRzdELFdBQUssaUJBQWlCLFdBQWlFLHFCQUFxQjtBQUFBLFFBQzNHO0FBQUEsUUFDQTtBQUFBLFFBQ0EsT0FBTyxPQUFPLE9BQU8sU0FBUztBQUFBLFFBQzlCLFNBQVM7QUFBQSxRQUNUO0FBQUEsTUFDRCxDQUFDO0FBRUQsYUFBTztBQUFBLElBQ1IsU0FBUyxPQUFPO0FBRWYsV0FBSyxpQkFBaUIsV0FBaUUscUJBQXFCO0FBQUEsUUFDM0c7QUFBQSxRQUNBO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxTQUFTO0FBQUEsUUFDVCxPQUFPLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUs7QUFBQSxRQUM1RDtBQUFBLE1BQ0QsQ0FBQztBQUVELFlBQU07QUFBQSxJQUNQLFVBQUU7QUFDRCxVQUFJLEtBQUssV0FBVyxTQUFTLE1BQU0sR0FBRztBQUNyQyxhQUFLLFdBQVcsT0FBTyxLQUFLLFdBQVcsUUFBUSxNQUFNLEdBQUcsQ0FBQztBQUN6RCxhQUFLLFVBQVUsS0FBSyxNQUFNO0FBQUEsTUFDM0I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyw2QkFBNkIsUUFBMEQ7QUFDcEcsUUFBSSxZQUFZLEtBQUssTUFBTSxLQUFLLFdBQVMsTUFBTSxTQUFTLE9BQU8sSUFBSTtBQUNuRSxRQUFJLENBQUMsV0FBVztBQUNmLFlBQU0sTUFBTSxVQUFVLE1BQU0sT0FBTyxLQUFLLFVBQVUsT0FBSyxDQUFDLENBQUMsS0FBSyxLQUFLLE1BQU0sS0FBSyxXQUFTLE1BQU0sU0FBUyxPQUFPLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFDcEg7QUFDQSxnQkFBWSxLQUFLLE1BQU0sS0FBSyxXQUFTLE1BQU0sU0FBUyxPQUFPLElBQUk7QUFDL0QsUUFBSSxDQUFDLFdBQVc7QUFFZixZQUFNLElBQUksTUFBTSxzQ0FBc0M7QUFBQSxJQUN2RDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFJQSxpQkFBaUIsS0FBdUc7QUFDdkgsUUFBSSxlQUFlLEtBQUs7QUFDdkIsWUFBTSxjQUFjO0FBQ3BCLGlCQUFXLFdBQVcsS0FBSyx3QkFBd0IsVUFBVTtBQUM1RCxZQUFJLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxRQUFRLGFBQWEsV0FBVyxHQUFHO0FBQzdFLGlCQUFPLEtBQUsscUJBQXFCLFdBQVc7QUFBQSxRQUM3QztBQUFBLE1BQ0Q7QUFFQSxhQUFPLEtBQUssbUJBQW1CLGVBQWUsRUFBRSxLQUFLLHVCQUFxQjtBQUN6RSxZQUFJLHFCQUFxQixLQUFLLG1CQUFtQixPQUFPLFFBQVEsa0JBQWtCLGFBQWEsV0FBVyxHQUFHO0FBQzVHLGlCQUFPLEtBQUssdUJBQXVCLFdBQVc7QUFBQSxRQUMvQztBQUNBLGVBQU8sS0FBSywwQkFBMEIsV0FBVztBQUFBLE1BQ2xELENBQUM7QUFBQSxJQUNGO0FBRUEsUUFBSSxJQUFJLFVBQVUsb0JBQW9CLE1BQU07QUFDM0MsYUFBTyxLQUFLLHFCQUFxQixJQUFJLFdBQVc7QUFBQSxJQUNqRDtBQUVBLFFBQUksSUFBSSxVQUFVLG9CQUFvQixXQUFXO0FBQ2hELGFBQU8sS0FBSywwQkFBMEIsSUFBSSxXQUFXO0FBQUEsSUFDdEQ7QUFFQSxRQUFJLElBQUksVUFBVSxvQkFBb0IsWUFBWTtBQUNqRCxhQUFPLEtBQUssdUJBQXVCLElBQUksV0FBVztBQUFBLElBQ25EO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHFCQUFxQixhQUFrQztBQUM5RCxXQUFPO0FBQUEsTUFDTixJQUFJO0FBQUEsTUFDSixLQUFLO0FBQUEsTUFDTCxRQUFRLG9CQUFvQjtBQUFBLE1BQzVCLE9BQU8sU0FBUyxvQ0FBb0MsaUJBQWlCLEtBQUssZUFBZSxTQUFTO0FBQUEsTUFDbEcsT0FBTyxhQUFhO0FBQUEsTUFDcEIsT0FBTyx1QkFBdUI7QUFBQSxNQUM5QixLQUFLO0FBQUEsTUFDTCxTQUFTLENBQUM7QUFBQSxJQUNYO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQXVCLGFBQWtDO0FBQ2hFLFdBQU87QUFBQSxNQUNOLElBQUk7QUFBQSxNQUNKLEtBQUs7QUFBQSxNQUNMLFFBQVEsb0JBQW9CO0FBQUEsTUFDNUIsT0FBTyxLQUFLLG1CQUFtQixrQkFBa0IsS0FBSyxhQUFhLGFBQWEsUUFBUSxjQUFjLEtBQUssbUJBQW1CLGVBQWUsSUFBSTtBQUFBLE1BQ2pKLE9BQU8sYUFBYTtBQUFBLE1BQ3BCLE9BQU8sdUJBQXVCLE9BQU8sdUJBQXVCO0FBQUEsTUFDNUQsaUJBQWlCLEtBQUssbUJBQW1CO0FBQUEsTUFDekMsS0FBSztBQUFBLE1BQ0wsU0FBUyxDQUFDO0FBQUEsSUFDWDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDBCQUEwQixhQUE4QztBQUMvRSxVQUFNLFlBQVksS0FBSyxpQkFBaUIsYUFBYTtBQUNyRCxRQUFJLFVBQVUsaUJBQWlCLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxVQUFVLGVBQWUsV0FBVyxHQUFHO0FBQzVHLGFBQU87QUFBQSxRQUNOLElBQUk7QUFBQSxRQUNKLEtBQUs7QUFBQSxRQUNMLFFBQVEsb0JBQW9CO0FBQUEsUUFDNUIsT0FBTyxTQUFTLFdBQVc7QUFBQSxRQUMzQixPQUFPLGFBQWE7QUFBQSxRQUNwQixPQUFPLHVCQUF1QjtBQUFBLFFBQzlCLGlCQUFpQixLQUFLLG1CQUFtQjtBQUFBLFFBQ3pDLEtBQUs7QUFBQSxRQUNMLFNBQVMsQ0FBQyxZQUFZLHVCQUF1QjtBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLFVBQVU7QUFDbkMsYUFBUyxRQUFRLEdBQUcsUUFBUSxpQkFBaUIsUUFBUSxTQUFTO0FBQzdELFlBQU0sa0JBQWtCLGlCQUFpQixLQUFLO0FBQzlDLFVBQUksS0FBSyxtQkFBbUIsT0FBTyxRQUFRLEtBQUssbUJBQW1CLE9BQU8sU0FBUyxnQkFBZ0IsS0FBSyxvQ0FBb0MscUJBQXFCLENBQUMsR0FBRyxXQUFXLEdBQUc7QUFDbEwsZUFBTztBQUFBLFVBQ04sSUFBSSxHQUFHLGlDQUFpQyxHQUFHLEtBQUs7QUFBQSxVQUNoRCxLQUFLO0FBQUEsVUFDTCxRQUFRLG9CQUFvQjtBQUFBLFVBQzVCLE9BQU8sR0FBRyxnQkFBZ0IsSUFBSTtBQUFBLFVBQzlCLE9BQU8sYUFBYTtBQUFBLFVBQ3BCLGlCQUFpQixLQUFLLG1CQUFtQjtBQUFBLFVBQ3pDLE9BQU8sdUJBQXVCO0FBQUEsVUFDOUIsS0FBSztBQUFBLFVBQ0w7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxVQUFVLEtBQTRCO0FBQzNDLFFBQUksSUFBSSxTQUFTLGVBQWU7QUFDL0IsYUFBTyxLQUFLLG9CQUFvQixHQUFHO0FBQUEsSUFDcEM7QUFDQSxRQUFJLElBQUksS0FBSyxXQUFXLGNBQWMsR0FBRztBQUN4QyxZQUFNLGdCQUFnQixJQUFJLEtBQUssVUFBVSxlQUFlLE1BQU07QUFDOUQsVUFBSSxlQUFlO0FBQ2xCLGVBQU8sS0FBSyxzQkFBc0IsYUFBYTtBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUNBLFFBQUksSUFBSSxLQUFLLFdBQVcsTUFBTSxHQUFHO0FBQ2hDLFlBQU0sZUFBZSxJQUFJLEtBQUssVUFBVSxDQUFDO0FBQ3pDLFVBQUksY0FBYztBQUNqQixlQUFPLEtBQUssbUJBQW1CLEdBQUcsUUFBUSxLQUFLLE1BQU0sWUFBWSxFQUFFO0FBQUEsTUFDcEU7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsb0JBQW9CLEtBQTRCO0FBQzdELFFBQUk7QUFDSixRQUFJO0FBQ0gsZUFBUyxLQUFLLE1BQU0sbUJBQW1CLElBQUksS0FBSyxDQUFDO0FBQUEsSUFDbEQsU0FBUyxHQUFHO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJO0FBQ0gsWUFBTSxFQUFFLE1BQU0sUUFBUSxHQUFHLE9BQU8sSUFBSTtBQUtwQyxVQUFJLE9BQU8sV0FBVyxLQUFLLGtCQUFrQixVQUFVLEdBQUc7QUFDekQsWUFBSTtBQUNILGdCQUFNLHFCQUFxQixLQUFLO0FBR2hDLGdCQUFNLENBQUMsYUFBYSxJQUFJLE1BQU0sS0FBSyxrQkFBa0IseUJBQXlCLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUN4RixjQUFJLGVBQWU7QUFDbEIsaUJBQUssc0JBQXNCLGVBQWUsa0JBQWtCO0FBQzVELGtCQUFNLFFBQVEsS0FBSyxNQUFNLEtBQUssT0FBSyxFQUFFLFNBQVMsY0FBYyxJQUFJLEtBQUssS0FBSyxxQkFBcUIsZUFBZSxvQkFBb0IsT0FBSyxLQUFLLGdCQUFnQixDQUFDLEdBQUcsT0FBSyxLQUFLLGlCQUFpQixDQUFDLEdBQUcsUUFBVyxlQUFlLE1BQVM7QUFDbE8saUJBQUssS0FBSyxLQUFLO0FBQ2YsbUJBQU87QUFBQSxVQUNSO0FBQ0EsZUFBSyxXQUFXLEtBQUssZUFBZSxJQUFJLDZDQUE2QztBQUFBLFFBQ3RGLFNBQVMsR0FBRztBQUNYLGVBQUssV0FBVyxLQUFLLCtDQUErQyxJQUFJLHdCQUF3QjtBQUFBLFFBQ2pHO0FBQUEsTUFDRDtBQUVBLFVBQUksT0FBTyxTQUFTLFFBQVc7QUFDOUIsUUFBbUMsT0FBUSxPQUFzQyxPQUFRLFVBQVUsY0FBYyxRQUFRLGNBQWM7QUFBQSxNQUN4STtBQUNBLFdBQUssS0FBSyxLQUFLLHFCQUFxQixlQUFlLG9CQUFvQixPQUFLLEtBQUssZ0JBQWdCLENBQUMsR0FBRyxPQUFLLEtBQUssaUJBQWlCLENBQUMsR0FBRyxRQUFXLFFBQVcsRUFBRSxNQUFNLFFBQVEsT0FBTyxDQUFDLENBQUM7QUFBQSxJQUNwTCxTQUFTLEdBQUc7QUFBQSxJQUVaO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLEtBQStCO0FBQy9ELFFBQUk7QUFDSCxZQUFNLFVBQVUsTUFBTSxLQUFLLGtCQUFrQixhQUFhLEdBQUc7QUFDN0QsVUFBSSxDQUFDLFNBQVM7QUFDYixhQUFLLFdBQVcsS0FBSyxlQUFlLEdBQUcsYUFBYTtBQUNwRCxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sUUFBUSxLQUFLLE1BQU0sS0FBSyxPQUFLLEVBQUUsU0FBUyxRQUFRLElBQUksS0FBSyxLQUFLLHFCQUFxQixlQUFlLG9CQUFvQixPQUFLLEtBQUssZ0JBQWdCLENBQUMsR0FBRyxPQUFLLEtBQUssaUJBQWlCLENBQUMsR0FBRyxRQUFXLFNBQVMsTUFBUztBQUN0TixXQUFLLEtBQUssS0FBSztBQUFBLElBQ2hCLFNBQVMsR0FBRztBQUVYLFdBQUssV0FBVyxNQUFNLENBQUM7QUFBQSxJQUN4QjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLHNCQUFzQixNQUFnQztBQUNuRSxRQUFJO0FBQ0gsWUFBTSxxQkFBcUIsS0FBSztBQUNoQyxZQUFNLENBQUMsT0FBTyxJQUFJLE1BQU0sS0FBSyxrQkFBa0IseUJBQXlCLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztBQUNsRixVQUFJLENBQUMsU0FBUztBQUNiLGFBQUssV0FBVyxLQUFLLGVBQWUsSUFBSSxhQUFhO0FBQ3JELGVBQU87QUFBQSxNQUNSO0FBQ0EsV0FBSyxzQkFBc0IsU0FBUyxrQkFBa0I7QUFDdEQsWUFBTSxRQUFRLEtBQUssTUFBTSxLQUFLLE9BQUssRUFBRSxTQUFTLFFBQVEsSUFBSSxLQUFLLEtBQUsscUJBQXFCLGVBQWUsb0JBQW9CLE9BQUssS0FBSyxnQkFBZ0IsQ0FBQyxHQUFHLE9BQUssS0FBSyxpQkFBaUIsQ0FBQyxHQUFHLFFBQVcsU0FBUyxNQUFTO0FBQ3ROLFdBQUssS0FBSyxLQUFLO0FBQUEsSUFDaEIsU0FBUyxHQUFHO0FBRVgsV0FBSyxXQUFXLE1BQU0sQ0FBQztBQUFBLElBQ3hCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sV0FBVyxhQUFxQixlQUF3QztBQUM3RSxVQUFNLEtBQUssMkJBQTJCLFdBQVcsUUFBUSxXQUFXLElBQUksYUFBYTtBQUFBLEVBQ3RGO0FBQUEsRUFFQSxNQUFNLEtBQUssV0FBZ0MsU0FBeUM7QUFDbkYsVUFBTSxXQUFXLEtBQUsscUJBQXFCLFNBQWtCLG1DQUFtQztBQUNoRyxVQUFNLEtBQUssY0FBYyxXQUFXLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCLFNBQVMsR0FBRyxTQUFTLFdBQVcsY0FBYyxZQUFZO0FBQUEsRUFDOUo7QUFBQSxFQUVRLGdCQUFnQixXQUFzRDtBQUM3RSxRQUFJLEtBQUssV0FBVyxLQUFLLE9BQUssRUFBRSxTQUFTLFVBQVUsSUFBSSxHQUFHO0FBQ3pELGFBQU8sc0JBQXNCO0FBQUEsSUFDOUI7QUFDQSxRQUFJLEtBQUssYUFBYSxLQUFLLE9BQUssRUFBRSxTQUFTLFVBQVUsSUFBSSxHQUFHO0FBQzNELGFBQU8sc0JBQXNCO0FBQUEsSUFDOUI7QUFDQSxVQUFNLFFBQVEsS0FBSyxNQUFNLEtBQUssT0FBSyxNQUFNLFNBQVM7QUFDbEQsV0FBTyxRQUFRLHNCQUFzQixZQUFZLHNCQUFzQjtBQUFBLEVBQ3hFO0FBQUEsRUFFUSxpQkFBaUIsV0FBc0U7QUFDOUYsVUFBTSxtQkFBbUIsS0FBSyxvQkFBb0IsU0FBUztBQUUzRCxRQUFJLGtCQUFrQjtBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxLQUFLLFdBQVcsUUFBUSxJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsV0FBVyxPQUFPLFVBQVUsRUFBRTtBQUN2RixRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU8sRUFBRSxPQUFPLHlCQUF5QixTQUFTO0FBQUEsSUFDbkQ7QUFFQSxVQUFNLGFBQWEsT0FBTyxXQUFXLElBQUk7QUFDekMsUUFBSSxlQUFlLDRCQUE0QixpQkFBaUI7QUFDL0QsYUFBTztBQUFBLFFBQ04sT0FBTyx5QkFBeUI7QUFBQSxRQUNoQyxTQUFTO0FBQUEsVUFDUixVQUFVLFNBQVM7QUFBQSxVQUNuQixNQUFNLElBQUksZUFBZSxTQUFTLHFCQUFxQiw4QkFBOEIsQ0FBQztBQUFBLFFBQ3ZGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLGVBQWUsNEJBQTRCLG1CQUFtQjtBQUNqRSxhQUFPO0FBQUEsUUFDTixPQUFPLHlCQUF5QjtBQUFBLFFBQ2hDLFNBQVM7QUFBQSxVQUNSLFVBQVUsU0FBUztBQUFBLFVBQ25CLE1BQU0sSUFBSSxlQUFlLFNBQVMseUJBQXlCLGlEQUFpRCxDQUFDO0FBQUEsUUFDOUc7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxvQkFBb0IsV0FBc0U7QUFDakcsUUFBSSxDQUFDLFVBQVUsT0FBTztBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sc0JBQXNCLGlCQUFpQixpQ0FBaUMsRUFBRSxPQUFPLE9BQU8sZUFBZSxHQUFHLENBQUMsRUFBRSxTQUFTO0FBQzVILFVBQU0sY0FBYyxLQUFLLHFCQUFxQixTQUFTLGVBQWU7QUFFdEUsUUFBSSxnQkFBZ0IsZUFBZSxNQUFNO0FBQ3hDLGFBQU87QUFBQSxRQUNOLE9BQU8seUJBQXlCO0FBQUEsUUFDaEMsU0FBUztBQUFBLFVBQ1IsVUFBVSxTQUFTO0FBQUEsVUFDbkIsTUFBTSxJQUFJLGVBQWUsU0FBUyw4QkFBOEIsbUlBQW1JLG1CQUFtQixDQUFDO0FBQUEsUUFDeE47QUFBQSxNQUNEO0FBQUEsSUFFRDtBQUVBLFFBQUksZ0JBQWdCLGVBQWUsVUFBVTtBQUM1QyxVQUFJLENBQUMsVUFBVSxTQUFTO0FBQ3ZCLGVBQU87QUFBQSxVQUNOLE9BQU8seUJBQXlCO0FBQUEsVUFDaEMsU0FBUztBQUFBLFlBQ1IsVUFBVSxTQUFTO0FBQUEsWUFDbkIsTUFBTSxJQUFJLGVBQWUsU0FBUywrQkFBK0IseUhBQXlILG1CQUFtQixDQUFDO0FBQUEsVUFDL007QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUdBLFlBQU0sWUFBWSxVQUFVLE1BQU0sT0FBTyxTQUFTLGNBQWMsVUFBVSxVQUFVLE1BQU0sT0FBTztBQUNqRyxVQUFJLGFBQWEsQ0FBQyxVQUFVLFFBQVEsY0FBYyxTQUFTLEtBQUssWUFBVSxPQUFPLFFBQVEsU0FBUyxHQUFHO0FBQ3BHLGVBQU87QUFBQSxVQUNOLE9BQU8seUJBQXlCO0FBQUEsVUFDaEMsU0FBUztBQUFBLFlBQ1IsVUFBVSxTQUFTO0FBQUEsWUFDbkIsTUFBTSxJQUFJLGVBQWUsU0FBUywrQkFBK0IseUhBQXlILG1CQUFtQixDQUFDO0FBQUEsVUFDL007QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUVEO0FBOXZCYSxzQkFBTjtBQUFBLEVBd0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0ExQ1U7QUFnd0JOLElBQU0sNEJBQU4sY0FBd0MsV0FBNkM7QUFBQSxFQUkzRixZQUN1QixxQkFDTSwyQkFDUixtQkFDbkI7QUFDRCxVQUFNO0FBRU4sVUFBTSwwQkFBMEIsK0JBQStCLE9BQU8saUJBQWlCO0FBQ3ZGLDRCQUF3QixJQUFJLDBCQUEwQix3QkFBd0I7QUFDOUUsU0FBSyxVQUFVLDBCQUEwQixvQ0FBb0MsWUFBVSx3QkFBd0IsSUFBSSxNQUFNLENBQUMsQ0FBQztBQUUzSCxVQUFNLG1DQUFtQyw4QkFBOEIsT0FBTyxpQkFBaUI7QUFDL0Ysd0JBQW9CLFdBQVcsRUFBRSxRQUFRLE1BQU07QUFDOUMsdUNBQWlDLElBQUksb0JBQW9CLE1BQU0sU0FBUyxDQUFDO0FBQ3pFLFdBQUssVUFBVSxvQkFBb0IsU0FBUyxNQUFNLGlDQUFpQyxJQUFJLG9CQUFvQixNQUFNLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUM5SCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBckJhLDBCQUVMLEtBQUs7QUFGQSw0QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbInNlcnZlciIsICJlIiwgImxvY2FsIl0KfQo=
