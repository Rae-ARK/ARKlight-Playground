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
import { RunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { equals } from "../../../base/common/objects.js";
import { isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ConfigurationTarget } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { IMcpGalleryService, RegistryType, IAllowedMcpServersService } from "./mcpManagement.js";
import { McpServerVariableType, McpServerType } from "./mcpPlatformTypes.js";
import { IMcpResourceScannerService } from "./mcpResourceScannerService.js";
let AbstractCommonMcpManagementService = class extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
  }
  getMcpServerConfigurationFromManifest(manifest, packageType) {
    if (packageType === RegistryType.REMOTE && manifest.remotes?.length) {
      const url = manifest.remotes[0].url;
      const headers = manifest.remotes[0].headers ?? [];
      const { inputs: inputs2, variables } = this.processKeyValueInputs(url.startsWith("https://api.githubcopilot.com/mcp") ? headers.filter((h) => h.name.toLowerCase() !== "authorization") : headers);
      return {
        mcpServerConfiguration: {
          config: {
            type: McpServerType.REMOTE,
            url: manifest.remotes[0].url,
            headers: Object.keys(inputs2).length ? inputs2 : void 0
          },
          inputs: variables.length ? variables : void 0
        },
        notices: []
      };
    }
    const serverPackage = manifest.packages?.find((p) => p.registryType === packageType) ?? manifest.packages?.[0];
    if (!serverPackage) {
      throw new Error(`No server package found`);
    }
    const args = [];
    const inputs = [];
    const env = {};
    const notices = [];
    if (serverPackage.registryType === RegistryType.DOCKER) {
      args.push("run");
      args.push("-i");
      args.push("--rm");
    }
    if (serverPackage.runtimeArguments?.length) {
      const result = this.processArguments(serverPackage.runtimeArguments ?? []);
      args.push(...result.args);
      inputs.push(...result.variables);
      notices.push(...result.notices);
    }
    if (serverPackage.environmentVariables?.length) {
      const { inputs: envInputs, variables: envVariables, notices: envNotices } = this.processKeyValueInputs(serverPackage.environmentVariables ?? []);
      inputs.push(...envVariables);
      notices.push(...envNotices);
      for (const [name, value] of Object.entries(envInputs)) {
        env[name] = value;
        if (serverPackage.registryType === RegistryType.DOCKER) {
          args.push("-e");
          args.push(name);
        }
      }
    }
    switch (serverPackage.registryType) {
      case RegistryType.NODE:
        if (serverPackage.registryBaseUrl) {
          args.push("--registry", serverPackage.registryBaseUrl);
        }
        args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
        break;
      case RegistryType.PYTHON:
        if (serverPackage.registryBaseUrl) {
          args.push("--index-url", serverPackage.registryBaseUrl);
        }
        args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
        break;
      case RegistryType.DOCKER: {
        const dockerIdentifier = serverPackage.registryBaseUrl ? `${serverPackage.registryBaseUrl}/${serverPackage.identifier}` : serverPackage.identifier;
        args.push(serverPackage.version ? `${dockerIdentifier}:${serverPackage.version}` : dockerIdentifier);
        break;
      }
      case RegistryType.NUGET:
        args.push(serverPackage.version ? `${serverPackage.identifier}@${serverPackage.version}` : serverPackage.identifier);
        args.push("--yes");
        if (serverPackage.registryBaseUrl) {
          args.push("--source", serverPackage.registryBaseUrl);
        }
        if (serverPackage.packageArguments?.length) {
          args.push("--");
        }
        break;
    }
    if (serverPackage.packageArguments?.length) {
      const result = this.processArguments(serverPackage.packageArguments);
      args.push(...result.args);
      inputs.push(...result.variables);
      notices.push(...result.notices);
    }
    return {
      notices,
      mcpServerConfiguration: {
        config: {
          type: McpServerType.LOCAL,
          command: this.getCommandName(serverPackage.registryType),
          args: args.length ? args : void 0,
          env: Object.keys(env).length ? env : void 0
        },
        inputs: inputs.length ? inputs : void 0
      }
    };
  }
  getCommandName(packageType) {
    switch (packageType) {
      case RegistryType.NODE:
        return "npx";
      case RegistryType.DOCKER:
        return "docker";
      case RegistryType.PYTHON:
        return "uvx";
      case RegistryType.NUGET:
        return "dnx";
    }
    return packageType;
  }
  getVariables(variableInputs) {
    const variables = [];
    for (const [key, value] of Object.entries(variableInputs)) {
      variables.push({
        id: key,
        type: value.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
        description: value.description ?? "",
        password: !!value.isSecret,
        default: value.default,
        options: value.choices
      });
    }
    return variables;
  }
  processKeyValueInputs(keyValueInputs) {
    const notices = [];
    const inputs = {};
    const variables = [];
    for (const input of keyValueInputs) {
      const inputVariables = input.variables ? this.getVariables(input.variables) : [];
      let value = input.value || "";
      if (inputVariables.length) {
        for (const variable of inputVariables) {
          value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
        }
        variables.push(...inputVariables);
      } else if (!value && (input.description || input.choices || input.default !== void 0)) {
        variables.push({
          id: input.name,
          type: input.choices ? McpServerVariableType.PICK : McpServerVariableType.PROMPT,
          description: input.description ?? "",
          password: !!input.isSecret,
          default: input.default,
          options: input.choices
        });
        value = `\${input:${input.name}}`;
      }
      inputs[input.name] = value;
    }
    return { inputs, variables, notices };
  }
  processArguments(argumentsList) {
    const args = [];
    const variables = [];
    const notices = [];
    for (const arg of argumentsList) {
      const argVariables = arg.variables ? this.getVariables(arg.variables) : [];
      if (arg.type === "positional") {
        let value = arg.value;
        if (value) {
          for (const variable of argVariables) {
            value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
          }
          args.push(value);
          if (argVariables.length) {
            variables.push(...argVariables);
          }
        } else if (arg.valueHint && (arg.description || arg.default !== void 0)) {
          variables.push({
            id: arg.valueHint,
            type: McpServerVariableType.PROMPT,
            description: arg.description ?? "",
            password: false,
            default: arg.default
          });
          args.push(`\${input:${arg.valueHint}}`);
        } else {
          args.push(arg.valueHint ?? "");
        }
      } else if (arg.type === "named") {
        if (!arg.name) {
          notices.push(`Named argument is missing a name. ${JSON.stringify(arg)}`);
          continue;
        }
        args.push(arg.name);
        if (arg.value) {
          let value = arg.value;
          for (const variable of argVariables) {
            value = value.replace(`{${variable.id}}`, `\${input:${variable.id}}`);
          }
          args.push(value);
          if (argVariables.length) {
            variables.push(...argVariables);
          }
        } else if (arg.description || arg.default !== void 0) {
          const variableId = arg.name.replace(/^--?/, "");
          variables.push({
            id: variableId,
            type: McpServerVariableType.PROMPT,
            description: arg.description ?? "",
            password: false,
            default: arg.default
          });
          args.push(`\${input:${variableId}}`);
        }
      }
    }
    return { args, variables, notices };
  }
};
AbstractCommonMcpManagementService = __decorateClass([
  __decorateParam(0, ILogService)
], AbstractCommonMcpManagementService);
let AbstractMcpResourceManagementService = class extends AbstractCommonMcpManagementService {
  constructor(mcpResource, target, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService) {
    super(logService);
    this.mcpResource = mcpResource;
    this.target = target;
    this.mcpGalleryService = mcpGalleryService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.mcpResourceScannerService = mcpResourceScannerService;
    this.allowedMcpServersService = allowedMcpServersService;
    this.local = /* @__PURE__ */ new Map();
    this._onInstallMcpServer = this._register(new Emitter());
    this.onInstallMcpServer = this._onInstallMcpServer.event;
    this._onDidInstallMcpServers = this._register(new Emitter());
    this._onDidUpdateMcpServers = this._register(new Emitter());
    this._onUninstallMcpServer = this._register(new Emitter());
    this._onDidUninstallMcpServer = this._register(new Emitter());
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.updateLocal(), 50));
  }
  get onDidInstallMcpServers() {
    return this._onDidInstallMcpServers.event;
  }
  get onDidUpdateMcpServers() {
    return this._onDidUpdateMcpServers.event;
  }
  get onUninstallMcpServer() {
    return this._onUninstallMcpServer.event;
  }
  get onDidUninstallMcpServer() {
    return this._onDidUninstallMcpServer.event;
  }
  /**
   * Enforces the enterprise allow/deny policy at the point of persistence. Called by every
   * install path (installable and each gallery override) against the fully resolved server
   * configuration, so a caller that goes straight to the management API cannot bypass the
   * `canInstall` UI check, and a gallery entry cannot slip through if its resolved command/URL
   * differs from the pre-resolution metadata.
   */
  ensureServerAllowed(server) {
    const result = this.allowedMcpServersService.isAllowed(server);
    if (result !== true) {
      throw new Error(result.value);
    }
  }
  initialize() {
    if (!this.initializePromise) {
      this.initializePromise = (async () => {
        try {
          this.local = await this.populateLocalServers();
        } finally {
          this.startWatching();
        }
      })();
    }
    return this.initializePromise;
  }
  async populateLocalServers() {
    this.logService.trace("AbstractMcpResourceManagementService#populateLocalServers", this.mcpResource.toString());
    const local = /* @__PURE__ */ new Map();
    try {
      const scannedMcpServers = await this.mcpResourceScannerService.scanMcpServers(this.mcpResource, this.target);
      if (scannedMcpServers.servers) {
        await Promise.allSettled(Object.entries(scannedMcpServers.servers).map(async ([name, scannedServer]) => {
          const server = await this.scanLocalServer(name, scannedServer, scannedMcpServers.sandbox);
          local.set(name, server);
        }));
      }
    } catch (error) {
      this.logService.debug("Could not read user MCP servers:", error);
      throw error;
    }
    return local;
  }
  startWatching() {
    this._register(this.fileService.watch(this.mcpResource));
    this._register(this.fileService.onDidFilesChange((e) => {
      if (e.affects(this.mcpResource)) {
        this.reloadConfigurationScheduler.schedule();
      }
    }));
  }
  async updateLocal(source) {
    try {
      const current = await this.populateLocalServers();
      const added = [];
      const updated = [];
      const removed = [...this.local.keys()].filter((name) => !current.has(name));
      for (const server of removed) {
        this.local.delete(server);
      }
      for (const [name, server] of current) {
        const previous = this.local.get(name);
        if (previous) {
          if (!equals(previous, server)) {
            updated.push(server);
            this.local.set(name, server);
          }
        } else {
          added.push(server);
          this.local.set(name, server);
        }
      }
      for (const server of removed) {
        this.local.delete(server);
        this._onDidUninstallMcpServer.fire({ name: server, mcpResource: this.mcpResource });
      }
      if (updated.length) {
        this._onDidUpdateMcpServers.fire(updated.map((server) => ({ name: server.name, local: server, source: source?.name === server.name ? source : void 0, mcpResource: this.mcpResource })));
      }
      if (added.length) {
        this._onDidInstallMcpServers.fire(added.map((server) => ({ name: server.name, local: server, source: source?.name === server.name ? source : void 0, mcpResource: this.mcpResource })));
      }
    } catch (error) {
      this.logService.error("Failed to load installed MCP servers:", error);
    }
  }
  async getInstalled() {
    await this.initialize();
    return Array.from(this.local.values());
  }
  async scanLocalServer(name, config, rootSandbox) {
    let mcpServerInfo = await this.getLocalServerInfo(name, config);
    if (!mcpServerInfo) {
      mcpServerInfo = { name, version: config.version, galleryUrl: isString(config.gallery) ? config.gallery : void 0 };
    }
    return {
      name,
      config,
      rootSandbox,
      mcpResource: this.mcpResource,
      version: mcpServerInfo.version,
      location: mcpServerInfo.location,
      displayName: mcpServerInfo.displayName,
      description: mcpServerInfo.description,
      publisher: mcpServerInfo.publisher,
      publisherDisplayName: mcpServerInfo.publisherDisplayName,
      galleryUrl: mcpServerInfo.galleryUrl,
      galleryId: mcpServerInfo.galleryId,
      repositoryUrl: mcpServerInfo.repositoryUrl,
      readmeUrl: mcpServerInfo.readmeUrl,
      icon: mcpServerInfo.icon,
      codicon: mcpServerInfo.codicon,
      manifest: mcpServerInfo.manifest,
      source: config.gallery ? "gallery" : "local"
    };
  }
  async install(server, options) {
    this.logService.trace("MCP Management Service: install", server.name);
    this.ensureServerAllowed(server);
    this._onInstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
    try {
      await this.mcpResourceScannerService.addMcpServers([server], this.mcpResource, this.target);
      await this.updateLocal();
      const local = this.local.get(server.name);
      if (!local) {
        throw new Error(`Failed to install MCP server: ${server.name}`);
      }
      return local;
    } catch (e) {
      this._onDidInstallMcpServers.fire([{ name: server.name, error: e, mcpResource: this.mcpResource }]);
      throw e;
    }
  }
  async uninstall(server, options) {
    this.logService.trace("MCP Management Service: uninstall", server.name);
    this._onUninstallMcpServer.fire({ name: server.name, mcpResource: this.mcpResource });
    try {
      const currentServers = await this.mcpResourceScannerService.scanMcpServers(this.mcpResource, this.target);
      if (!currentServers.servers) {
        return;
      }
      await this.mcpResourceScannerService.removeMcpServers([server.name], this.mcpResource, this.target);
      if (server.location) {
        await this.fileService.del(URI.revive(server.location), { recursive: true });
      }
      await this.updateLocal();
    } catch (e) {
      this._onDidUninstallMcpServer.fire({ name: server.name, error: e, mcpResource: this.mcpResource });
      throw e;
    }
  }
};
AbstractMcpResourceManagementService = __decorateClass([
  __decorateParam(2, IMcpGalleryService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IMcpResourceScannerService),
  __decorateParam(7, IAllowedMcpServersService)
], AbstractMcpResourceManagementService);
let McpUserResourceManagementService = class extends AbstractMcpResourceManagementService {
  constructor(mcpResource, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService, environmentService) {
    super(mcpResource, ConfigurationTarget.USER, mcpGalleryService, fileService, uriIdentityService, logService, mcpResourceScannerService, allowedMcpServersService);
    this.mcpLocation = uriIdentityService.extUri.joinPath(environmentService.userRoamingDataHome, "mcp");
  }
  async installFromGallery(server, options) {
    throw new Error("Not supported");
  }
  async updateMetadata(local, gallery) {
    await this.updateMetadataFromGallery(gallery);
    await this.updateLocal(gallery);
    const updatedLocal = (await this.getInstalled()).find((s) => s.name === local.name);
    if (!updatedLocal) {
      throw new Error(`Failed to find MCP server: ${local.name}`);
    }
    return updatedLocal;
  }
  async updateMetadataFromGallery(gallery) {
    const manifest = gallery.configuration;
    const location = this.getLocation(gallery.name, gallery.version);
    const manifestPath = this.uriIdentityService.extUri.joinPath(location, "manifest.json");
    const local = {
      galleryUrl: gallery.galleryUrl,
      galleryId: gallery.id,
      name: gallery.name,
      displayName: gallery.displayName,
      description: gallery.description,
      version: gallery.version,
      publisher: gallery.publisher,
      publisherDisplayName: gallery.publisherDisplayName,
      repositoryUrl: gallery.repositoryUrl,
      licenseUrl: gallery.license,
      icon: gallery.icon,
      codicon: gallery.codicon,
      manifest
    };
    await this.fileService.writeFile(manifestPath, VSBuffer.fromString(JSON.stringify(local)));
    if (gallery.readmeUrl || gallery.readme) {
      const readme = gallery.readme ? gallery.readme : await this.mcpGalleryService.getReadme(gallery, CancellationToken.None);
      await this.fileService.writeFile(this.uriIdentityService.extUri.joinPath(location, "README.md"), VSBuffer.fromString(readme));
    }
    return manifest;
  }
  async getLocalServerInfo(name, mcpServerConfig) {
    let storedMcpServerInfo;
    let location;
    let readmeUrl;
    if (mcpServerConfig.gallery) {
      location = this.getLocation(name, mcpServerConfig.version);
      const manifestLocation = this.uriIdentityService.extUri.joinPath(location, "manifest.json");
      try {
        const content = await this.fileService.readFile(manifestLocation);
        storedMcpServerInfo = JSON.parse(content.value.toString());
        if (storedMcpServerInfo.galleryUrl?.includes("/v0/")) {
          storedMcpServerInfo.galleryUrl = storedMcpServerInfo.galleryUrl.substring(0, storedMcpServerInfo.galleryUrl.indexOf("/v0/"));
          await this.fileService.writeFile(manifestLocation, VSBuffer.fromString(JSON.stringify(storedMcpServerInfo)));
        }
        storedMcpServerInfo.location = location;
        readmeUrl = this.uriIdentityService.extUri.joinPath(location, "README.md");
        if (!await this.fileService.exists(readmeUrl)) {
          readmeUrl = void 0;
        }
        storedMcpServerInfo.readmeUrl = readmeUrl;
      } catch (e) {
        this.logService.error("MCP Management Service: failed to read manifest", location.toString(), e);
      }
    }
    return storedMcpServerInfo;
  }
  getLocation(name, version) {
    name = name.replace("/", ".");
    return this.uriIdentityService.extUri.joinPath(this.mcpLocation, version ? `${name}-${version}` : name);
  }
  installFromUri(uri, options) {
    throw new Error("Method not supported.");
  }
  canInstall() {
    throw new Error("Not supported");
  }
};
McpUserResourceManagementService = __decorateClass([
  __decorateParam(1, IMcpGalleryService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IMcpResourceScannerService),
  __decorateParam(6, IAllowedMcpServersService),
  __decorateParam(7, IEnvironmentService)
], McpUserResourceManagementService);
let AbstractMcpManagementService = class extends AbstractCommonMcpManagementService {
  constructor(allowedMcpServersService, logService) {
    super(logService);
    this.allowedMcpServersService = allowedMcpServersService;
  }
  canInstall(server) {
    const allowedToInstall = this.allowedMcpServersService.isAllowed(server);
    if (allowedToInstall !== true) {
      return new MarkdownString(localize("not allowed to install", "This mcp server cannot be installed because {0}", allowedToInstall.value));
    }
    return true;
  }
};
AbstractMcpManagementService = __decorateClass([
  __decorateParam(0, IAllowedMcpServersService),
  __decorateParam(1, ILogService)
], AbstractMcpManagementService);
let McpManagementService = class extends AbstractMcpManagementService {
  constructor(allowedMcpServersService, logService, userDataProfilesService, instantiationService) {
    super(allowedMcpServersService, logService);
    this.userDataProfilesService = userDataProfilesService;
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
    this.mcpResourceManagementServices = new ResourceMap();
  }
  getMcpResourceManagementService(mcpResource) {
    let mcpResourceManagementService = this.mcpResourceManagementServices.get(mcpResource);
    if (!mcpResourceManagementService) {
      const disposables = new DisposableStore();
      const service = disposables.add(this.createMcpResourceManagementService(mcpResource));
      disposables.add(service.onInstallMcpServer((e) => this._onInstallMcpServer.fire(e)));
      disposables.add(service.onDidInstallMcpServers((e) => this._onDidInstallMcpServers.fire(e)));
      disposables.add(service.onDidUpdateMcpServers((e) => this._onDidUpdateMcpServers.fire(e)));
      disposables.add(service.onUninstallMcpServer((e) => this._onUninstallMcpServer.fire(e)));
      disposables.add(service.onDidUninstallMcpServer((e) => this._onDidUninstallMcpServer.fire(e)));
      this.mcpResourceManagementServices.set(mcpResource, mcpResourceManagementService = { service, dispose: () => disposables.dispose() });
    }
    return mcpResourceManagementService.service;
  }
  async getInstalled(mcpResource) {
    const mcpResourceUri = mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).getInstalled();
  }
  async install(server, options) {
    const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).install(server, options);
  }
  async uninstall(server, options) {
    const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).uninstall(server, options);
  }
  async installFromGallery(server, options) {
    const mcpResourceUri = options?.mcpResource || this.userDataProfilesService.defaultProfile.mcpResource;
    return this.getMcpResourceManagementService(mcpResourceUri).installFromGallery(server, options);
  }
  async updateMetadata(local, gallery, mcpResource) {
    return this.getMcpResourceManagementService(mcpResource || this.userDataProfilesService.defaultProfile.mcpResource).updateMetadata(local, gallery);
  }
  dispose() {
    this.mcpResourceManagementServices.forEach((service) => service.dispose());
    this.mcpResourceManagementServices.clear();
    super.dispose();
  }
  createMcpResourceManagementService(mcpResource) {
    return this.instantiationService.createInstance(McpUserResourceManagementService, mcpResource);
  }
};
McpManagementService = __decorateClass([
  __decorateParam(0, IAllowedMcpServersService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IUserDataProfilesService),
  __decorateParam(3, IInstantiationService)
], McpManagementService);
export {
  AbstractCommonMcpManagementService,
  AbstractMcpManagementService,
  AbstractMcpResourceManagementService,
  McpManagementService,
  McpUserResourceManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50LCBJR2FsbGVyeU1jcFNlcnZlciwgSUxvY2FsTWNwU2VydmVyLCBJTWNwR2FsbGVyeVNlcnZpY2UsIElNY3BNYW5hZ2VtZW50U2VydmljZSwgSU1jcFNlcnZlcklucHV0LCBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIEluc3RhbGxNY3BTZXJ2ZXJFdmVudCwgSW5zdGFsbE1jcFNlcnZlclJlc3VsdCwgUmVnaXN0cnlUeXBlLCBVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudCwgSW5zdGFsbE9wdGlvbnMsIFVuaW5zdGFsbE9wdGlvbnMsIElJbnN0YWxsYWJsZU1jcFNlcnZlciwgSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSwgSU1jcFNlcnZlckFyZ3VtZW50LCBJTWNwU2VydmVyS2V5VmFsdWVJbnB1dCwgTWNwU2VydmVyQ29uZmlndXJhdGlvblBhcnNlUmVzdWx0IH0gZnJvbSAnLi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiwgSU1jcFNlcnZlclZhcmlhYmxlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUsIElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uLCBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLCBNY3BSZXNvdXJjZVRhcmdldCB9IGZyb20gJy4vbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvY2FsTWNwU2VydmVySW5mbyB7XG5cdG5hbWU6IHN0cmluZztcblx0dmVyc2lvbj86IHN0cmluZztcblx0ZGlzcGxheU5hbWU/OiBzdHJpbmc7XG5cdGdhbGxlcnlJZD86IHN0cmluZztcblx0Z2FsbGVyeVVybD86IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlcG9zaXRvcnlVcmw/OiBzdHJpbmc7XG5cdHB1Ymxpc2hlcj86IHN0cmluZztcblx0cHVibGlzaGVyRGlzcGxheU5hbWU/OiBzdHJpbmc7XG5cdGljb24/OiB7XG5cdFx0ZGFyazogc3RyaW5nO1xuXHRcdGxpZ2h0OiBzdHJpbmc7XG5cdH07XG5cdGNvZGljb24/OiBzdHJpbmc7XG5cdG1hbmlmZXN0PzogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uO1xuXHRyZWFkbWVVcmw/OiBVUkk7XG5cdGxvY2F0aW9uPzogVVJJO1xuXHRsaWNlbnNlVXJsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDb21tb25NY3BNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRhYnN0cmFjdCBvbkluc3RhbGxNY3BTZXJ2ZXI6IEV2ZW50PEluc3RhbGxNY3BTZXJ2ZXJFdmVudD47XG5cdGFic3RyYWN0IG9uRGlkSW5zdGFsbE1jcFNlcnZlcnM6IEV2ZW50PHJlYWRvbmx5IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT47XG5cdGFic3RyYWN0IG9uRGlkVXBkYXRlTWNwU2VydmVyczogRXZlbnQ8cmVhZG9ubHkgSW5zdGFsbE1jcFNlcnZlclJlc3VsdFtdPjtcblx0YWJzdHJhY3Qgb25Vbmluc3RhbGxNY3BTZXJ2ZXI6IEV2ZW50PFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50Pjtcblx0YWJzdHJhY3Qgb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXI6IEV2ZW50PERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50PjtcblxuXHRhYnN0cmFjdCBnZXRJbnN0YWxsZWQobWNwUmVzb3VyY2U/OiBVUkkpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcltdPjtcblx0YWJzdHJhY3QgaW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+O1xuXHRhYnN0cmFjdCBpbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+O1xuXHRhYnN0cmFjdCB1cGRhdGVNZXRhZGF0YShsb2NhbDogSUxvY2FsTWNwU2VydmVyLCBzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBwcm9maWxlTG9jYXRpb24/OiBVUkkpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj47XG5cdGFic3RyYWN0IHVuaW5zdGFsbChzZXJ2ZXI6IElMb2NhbE1jcFNlcnZlciwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBjYW5JbnN0YWxsKHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIgfCBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIpOiB0cnVlIHwgSU1hcmtkb3duU3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiwgcGFja2FnZVR5cGU6IFJlZ2lzdHJ5VHlwZSk6IE1jcFNlcnZlckNvbmZpZ3VyYXRpb25QYXJzZVJlc3VsdCB7XG5cblx0XHQvLyByZW1vdGVcblx0XHRpZiAocGFja2FnZVR5cGUgPT09IFJlZ2lzdHJ5VHlwZS5SRU1PVEUgJiYgbWFuaWZlc3QucmVtb3Rlcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB1cmwgPSBtYW5pZmVzdC5yZW1vdGVzWzBdLnVybDtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBtYW5pZmVzdC5yZW1vdGVzWzBdLmhlYWRlcnMgPz8gW107XG5cdFx0XHRjb25zdCB7IGlucHV0cywgdmFyaWFibGVzIH0gPSB0aGlzLnByb2Nlc3NLZXlWYWx1ZUlucHV0cyh1cmwuc3RhcnRzV2l0aCgnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwJykgPyBoZWFkZXJzLmZpbHRlcihoID0+IGgubmFtZS50b0xvd2VyQ2FzZSgpICE9PSAnYXV0aG9yaXphdGlvbicpIDogaGVhZGVycyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtY3BTZXJ2ZXJDb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSxcblx0XHRcdFx0XHRcdHVybDogbWFuaWZlc3QucmVtb3Rlc1swXS51cmwsXG5cdFx0XHRcdFx0XHRoZWFkZXJzOiBPYmplY3Qua2V5cyhpbnB1dHMpLmxlbmd0aCA/IGlucHV0cyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGlucHV0czogdmFyaWFibGVzLmxlbmd0aCA/IHZhcmlhYmxlcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0bm90aWNlczogW10sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIGxvY2FsXG5cdFx0Y29uc3Qgc2VydmVyUGFja2FnZSA9IG1hbmlmZXN0LnBhY2thZ2VzPy5maW5kKHAgPT4gcC5yZWdpc3RyeVR5cGUgPT09IHBhY2thZ2VUeXBlKSA/PyBtYW5pZmVzdC5wYWNrYWdlcz8uWzBdO1xuXHRcdGlmICghc2VydmVyUGFja2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBzZXJ2ZXIgcGFja2FnZSBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyZ3M6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaW5wdXRzOiBJTWNwU2VydmVyVmFyaWFibGVbXSA9IFtdO1xuXHRcdGNvbnN0IGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGNvbnN0IG5vdGljZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAoc2VydmVyUGFja2FnZS5yZWdpc3RyeVR5cGUgPT09IFJlZ2lzdHJ5VHlwZS5ET0NLRVIpIHtcblx0XHRcdGFyZ3MucHVzaCgncnVuJyk7XG5cdFx0XHRhcmdzLnB1c2goJy1pJyk7XG5cdFx0XHRhcmdzLnB1c2goJy0tcm0nKTtcblx0XHR9XG5cblx0XHRpZiAoc2VydmVyUGFja2FnZS5ydW50aW1lQXJndW1lbnRzPy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMucHJvY2Vzc0FyZ3VtZW50cyhzZXJ2ZXJQYWNrYWdlLnJ1bnRpbWVBcmd1bWVudHMgPz8gW10pO1xuXHRcdFx0YXJncy5wdXNoKC4uLnJlc3VsdC5hcmdzKTtcblx0XHRcdGlucHV0cy5wdXNoKC4uLnJlc3VsdC52YXJpYWJsZXMpO1xuXHRcdFx0bm90aWNlcy5wdXNoKC4uLnJlc3VsdC5ub3RpY2VzKTtcblx0XHR9XG5cblx0XHRpZiAoc2VydmVyUGFja2FnZS5lbnZpcm9ubWVudFZhcmlhYmxlcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB7IGlucHV0czogZW52SW5wdXRzLCB2YXJpYWJsZXM6IGVudlZhcmlhYmxlcywgbm90aWNlczogZW52Tm90aWNlcyB9ID0gdGhpcy5wcm9jZXNzS2V5VmFsdWVJbnB1dHMoc2VydmVyUGFja2FnZS5lbnZpcm9ubWVudFZhcmlhYmxlcyA/PyBbXSk7XG5cdFx0XHRpbnB1dHMucHVzaCguLi5lbnZWYXJpYWJsZXMpO1xuXHRcdFx0bm90aWNlcy5wdXNoKC4uLmVudk5vdGljZXMpO1xuXHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGVudklucHV0cykpIHtcblx0XHRcdFx0ZW52W25hbWVdID0gdmFsdWU7XG5cdFx0XHRcdGlmIChzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5VHlwZSA9PT0gUmVnaXN0cnlUeXBlLkRPQ0tFUikge1xuXHRcdFx0XHRcdGFyZ3MucHVzaCgnLWUnKTtcblx0XHRcdFx0XHRhcmdzLnB1c2gobmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRzd2l0Y2ggKHNlcnZlclBhY2thZ2UucmVnaXN0cnlUeXBlKSB7XG5cdFx0XHRjYXNlIFJlZ2lzdHJ5VHlwZS5OT0RFOlxuXHRcdFx0XHRpZiAoc2VydmVyUGFja2FnZS5yZWdpc3RyeUJhc2VVcmwpIHtcblx0XHRcdFx0XHRhcmdzLnB1c2goJy0tcmVnaXN0cnknLCBzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXJncy5wdXNoKHNlcnZlclBhY2thZ2UudmVyc2lvbiA/IGAke3NlcnZlclBhY2thZ2UuaWRlbnRpZmllcn1AJHtzZXJ2ZXJQYWNrYWdlLnZlcnNpb259YCA6IHNlcnZlclBhY2thZ2UuaWRlbnRpZmllcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSZWdpc3RyeVR5cGUuUFlUSE9OOlxuXHRcdFx0XHRpZiAoc2VydmVyUGFja2FnZS5yZWdpc3RyeUJhc2VVcmwpIHtcblx0XHRcdFx0XHRhcmdzLnB1c2goJy0taW5kZXgtdXJsJywgc2VydmVyUGFja2FnZS5yZWdpc3RyeUJhc2VVcmwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFyZ3MucHVzaChzZXJ2ZXJQYWNrYWdlLnZlcnNpb24gPyBgJHtzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXJ9QCR7c2VydmVyUGFja2FnZS52ZXJzaW9ufWAgOiBzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmVnaXN0cnlUeXBlLkRPQ0tFUjpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IGRvY2tlcklkZW50aWZpZXIgPSBzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybFxuXHRcdFx0XHRcdFx0PyBgJHtzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybH0vJHtzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXJ9YFxuXHRcdFx0XHRcdFx0OiBzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXI7XG5cdFx0XHRcdFx0YXJncy5wdXNoKHNlcnZlclBhY2thZ2UudmVyc2lvbiA/IGAke2RvY2tlcklkZW50aWZpZXJ9OiR7c2VydmVyUGFja2FnZS52ZXJzaW9ufWAgOiBkb2NrZXJJZGVudGlmaWVyKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBSZWdpc3RyeVR5cGUuTlVHRVQ6XG5cdFx0XHRcdGFyZ3MucHVzaChzZXJ2ZXJQYWNrYWdlLnZlcnNpb24gPyBgJHtzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXJ9QCR7c2VydmVyUGFja2FnZS52ZXJzaW9ufWAgOiBzZXJ2ZXJQYWNrYWdlLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRhcmdzLnB1c2goJy0teWVzJyk7IC8vIGluc3RhbGxhdGlvbiBpcyBjb25maXJtZWQgYnkgdGhlIFVJLCBzbyAtLXllcyBpcyBhcHByb3ByaWF0ZSBoZXJlXG5cdFx0XHRcdGlmIChzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybCkge1xuXHRcdFx0XHRcdGFyZ3MucHVzaCgnLS1zb3VyY2UnLCBzZXJ2ZXJQYWNrYWdlLnJlZ2lzdHJ5QmFzZVVybCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHNlcnZlclBhY2thZ2UucGFja2FnZUFyZ3VtZW50cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0YXJncy5wdXNoKCctLScpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChzZXJ2ZXJQYWNrYWdlLnBhY2thZ2VBcmd1bWVudHM/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5wcm9jZXNzQXJndW1lbnRzKHNlcnZlclBhY2thZ2UucGFja2FnZUFyZ3VtZW50cyk7XG5cdFx0XHRhcmdzLnB1c2goLi4ucmVzdWx0LmFyZ3MpO1xuXHRcdFx0aW5wdXRzLnB1c2goLi4ucmVzdWx0LnZhcmlhYmxlcyk7XG5cdFx0XHRub3RpY2VzLnB1c2goLi4ucmVzdWx0Lm5vdGljZXMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRub3RpY2VzLFxuXHRcdFx0bWNwU2VydmVyQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRjb25maWc6IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHRoaXMuZ2V0Q29tbWFuZE5hbWUoc2VydmVyUGFja2FnZS5yZWdpc3RyeVR5cGUpLFxuXHRcdFx0XHRcdGFyZ3M6IGFyZ3MubGVuZ3RoID8gYXJncyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlbnY6IE9iamVjdC5rZXlzKGVudikubGVuZ3RoID8gZW52IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnB1dHM6IGlucHV0cy5sZW5ndGggPyBpbnB1dHMgOiB1bmRlZmluZWQsXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDb21tYW5kTmFtZShwYWNrYWdlVHlwZTogUmVnaXN0cnlUeXBlKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHBhY2thZ2VUeXBlKSB7XG5cdFx0XHRjYXNlIFJlZ2lzdHJ5VHlwZS5OT0RFOiByZXR1cm4gJ25weCc7XG5cdFx0XHRjYXNlIFJlZ2lzdHJ5VHlwZS5ET0NLRVI6IHJldHVybiAnZG9ja2VyJztcblx0XHRcdGNhc2UgUmVnaXN0cnlUeXBlLlBZVEhPTjogcmV0dXJuICd1dngnO1xuXHRcdFx0Y2FzZSBSZWdpc3RyeVR5cGUuTlVHRVQ6IHJldHVybiAnZG54Jztcblx0XHR9XG5cdFx0cmV0dXJuIHBhY2thZ2VUeXBlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFZhcmlhYmxlcyh2YXJpYWJsZUlucHV0czogUmVjb3JkPHN0cmluZywgSU1jcFNlcnZlcklucHV0Pik6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdIHtcblx0XHRjb25zdCB2YXJpYWJsZXM6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModmFyaWFibGVJbnB1dHMpKSB7XG5cdFx0XHR2YXJpYWJsZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBrZXksXG5cdFx0XHRcdHR5cGU6IHZhbHVlLmNob2ljZXMgPyBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUElDSyA6IE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB2YWx1ZS5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0cGFzc3dvcmQ6ICEhdmFsdWUuaXNTZWNyZXQsXG5cdFx0XHRcdGRlZmF1bHQ6IHZhbHVlLmRlZmF1bHQsXG5cdFx0XHRcdG9wdGlvbnM6IHZhbHVlLmNob2ljZXMsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhcmlhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc0tleVZhbHVlSW5wdXRzKGtleVZhbHVlSW5wdXRzOiBSZWFkb25seUFycmF5PElNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0Pik6IHsgaW5wdXRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+OyB2YXJpYWJsZXM6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdOyBub3RpY2VzOiBzdHJpbmdbXSB9IHtcblx0XHRjb25zdCBub3RpY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGlucHV0czogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGNvbnN0IHZhcmlhYmxlczogSU1jcFNlcnZlclZhcmlhYmxlW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaW5wdXQgb2Yga2V5VmFsdWVJbnB1dHMpIHtcblx0XHRcdGNvbnN0IGlucHV0VmFyaWFibGVzID0gaW5wdXQudmFyaWFibGVzID8gdGhpcy5nZXRWYXJpYWJsZXMoaW5wdXQudmFyaWFibGVzKSA6IFtdO1xuXHRcdFx0bGV0IHZhbHVlID0gaW5wdXQudmFsdWUgfHwgJyc7XG5cblx0XHRcdC8vIElmIGV4cGxpY2l0IHZhcmlhYmxlcyBleGlzdCwgdXNlIHRoZW0gcmVnYXJkbGVzcyBvZiB2YWx1ZVxuXHRcdFx0aWYgKGlucHV0VmFyaWFibGVzLmxlbmd0aCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGlucHV0VmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKGB7JHt2YXJpYWJsZS5pZH19YCwgYFxcJHtpbnB1dDoke3ZhcmlhYmxlLmlkfX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2YXJpYWJsZXMucHVzaCguLi5pbnB1dFZhcmlhYmxlcyk7XG5cdFx0XHR9IGVsc2UgaWYgKCF2YWx1ZSAmJiAoaW5wdXQuZGVzY3JpcHRpb24gfHwgaW5wdXQuY2hvaWNlcyB8fCBpbnB1dC5kZWZhdWx0ICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdC8vIE9ubHkgY3JlYXRlIGF1dG8tZ2VuZXJhdGVkIGlucHV0IHZhcmlhYmxlIGlmIG5vIGV4cGxpY2l0IHZhcmlhYmxlcyBhbmQgbm8gdmFsdWVcblx0XHRcdFx0dmFyaWFibGVzLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBpbnB1dC5uYW1lLFxuXHRcdFx0XHRcdHR5cGU6IGlucHV0LmNob2ljZXMgPyBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUElDSyA6IE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGlucHV0LmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHRcdHBhc3N3b3JkOiAhIWlucHV0LmlzU2VjcmV0LFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGlucHV0LmRlZmF1bHQsXG5cdFx0XHRcdFx0b3B0aW9uczogaW5wdXQuY2hvaWNlcyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHZhbHVlID0gYFxcJHtpbnB1dDoke2lucHV0Lm5hbWV9fWA7XG5cdFx0XHR9XG5cblx0XHRcdGlucHV0c1tpbnB1dC5uYW1lXSA9IHZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGlucHV0cywgdmFyaWFibGVzLCBub3RpY2VzIH07XG5cdH1cblxuXHRwcml2YXRlIHByb2Nlc3NBcmd1bWVudHMoYXJndW1lbnRzTGlzdDogcmVhZG9ubHkgSU1jcFNlcnZlckFyZ3VtZW50W10pOiB7IGFyZ3M6IHN0cmluZ1tdOyB2YXJpYWJsZXM6IElNY3BTZXJ2ZXJWYXJpYWJsZVtdOyBub3RpY2VzOiBzdHJpbmdbXSB9IHtcblx0XHRjb25zdCBhcmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHZhcmlhYmxlczogSU1jcFNlcnZlclZhcmlhYmxlW10gPSBbXTtcblx0XHRjb25zdCBub3RpY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYXJnIG9mIGFyZ3VtZW50c0xpc3QpIHtcblx0XHRcdGNvbnN0IGFyZ1ZhcmlhYmxlcyA9IGFyZy52YXJpYWJsZXMgPyB0aGlzLmdldFZhcmlhYmxlcyhhcmcudmFyaWFibGVzKSA6IFtdO1xuXG5cdFx0XHRpZiAoYXJnLnR5cGUgPT09ICdwb3NpdGlvbmFsJykge1xuXHRcdFx0XHRsZXQgdmFsdWUgPSBhcmcudmFsdWU7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgYXJnVmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoYHske3ZhcmlhYmxlLmlkfX1gLCBgXFwke2lucHV0OiR7dmFyaWFibGUuaWR9fWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhcmdzLnB1c2godmFsdWUpO1xuXHRcdFx0XHRcdGlmIChhcmdWYXJpYWJsZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHR2YXJpYWJsZXMucHVzaCguLi5hcmdWYXJpYWJsZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChhcmcudmFsdWVIaW50ICYmIChhcmcuZGVzY3JpcHRpb24gfHwgYXJnLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHQvLyBDcmVhdGUgaW5wdXQgdmFyaWFibGUgZm9yIHBvc2l0aW9uYWwgYXJndW1lbnQgd2l0aG91dCB2YWx1ZVxuXHRcdFx0XHRcdHZhcmlhYmxlcy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiBhcmcudmFsdWVIaW50LFxuXHRcdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVmFyaWFibGVUeXBlLlBST01QVCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBhcmcuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0XHRwYXNzd29yZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBhcmcuZGVmYXVsdCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhcmdzLnB1c2goYFxcJHtpbnB1dDoke2FyZy52YWx1ZUhpbnR9fWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEZhbGxiYWNrIHRvIHZhbHVlX2hpbnQgYXMgbGl0ZXJhbFxuXHRcdFx0XHRcdGFyZ3MucHVzaChhcmcudmFsdWVIaW50ID8/ICcnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChhcmcudHlwZSA9PT0gJ25hbWVkJykge1xuXHRcdFx0XHRpZiAoIWFyZy5uYW1lKSB7XG5cdFx0XHRcdFx0bm90aWNlcy5wdXNoKGBOYW1lZCBhcmd1bWVudCBpcyBtaXNzaW5nIGEgbmFtZS4gJHtKU09OLnN0cmluZ2lmeShhcmcpfWApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFyZ3MucHVzaChhcmcubmFtZSk7XG5cdFx0XHRcdGlmIChhcmcudmFsdWUpIHtcblx0XHRcdFx0XHRsZXQgdmFsdWUgPSBhcmcudmFsdWU7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiBhcmdWYXJpYWJsZXMpIHtcblx0XHRcdFx0XHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZShgeyR7dmFyaWFibGUuaWR9fWAsIGBcXCR7aW5wdXQ6JHt2YXJpYWJsZS5pZH19YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFyZ3MucHVzaCh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKGFyZ1ZhcmlhYmxlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHZhcmlhYmxlcy5wdXNoKC4uLmFyZ1ZhcmlhYmxlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGFyZy5kZXNjcmlwdGlvbiB8fCBhcmcuZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGlucHV0IHZhcmlhYmxlIGZvciBuYW1lZCBhcmd1bWVudCB3aXRob3V0IHZhbHVlXG5cdFx0XHRcdFx0Y29uc3QgdmFyaWFibGVJZCA9IGFyZy5uYW1lLnJlcGxhY2UoL14tLT8vLCAnJyk7XG5cdFx0XHRcdFx0dmFyaWFibGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IHZhcmlhYmxlSWQsXG5cdFx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBULFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFyZy5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdHBhc3N3b3JkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IGFyZy5kZWZhdWx0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFyZ3MucHVzaChgXFwke2lucHV0OiR7dmFyaWFibGVJZH19YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgYXJncywgdmFyaWFibGVzLCBub3RpY2VzIH07XG5cdH1cblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RDb21tb25NY3BNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSByZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIGxvY2FsID0gbmV3IE1hcDxzdHJpbmcsIElMb2NhbE1jcFNlcnZlcj4oKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uSW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uSW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX29uSW5zdGFsbE1jcFNlcnZlci5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsTWNwU2VydmVyUmVzdWx0W10+KCkpO1xuXHRnZXQgb25EaWRJbnN0YWxsTWNwU2VydmVycygpIHsgcmV0dXJuIHRoaXMuX29uRGlkSW5zdGFsbE1jcFNlcnZlcnMuZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkVXBkYXRlTWNwU2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT4oKSk7XG5cdGdldCBvbkRpZFVwZGF0ZU1jcFNlcnZlcnMoKSB7IHJldHVybiB0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uVW5pbnN0YWxsTWNwU2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VW5pbnN0YWxsTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRnZXQgb25Vbmluc3RhbGxNY3BTZXJ2ZXIoKSB7IHJldHVybiB0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5ldmVudDsgfVxuXG5cdHByb3RlY3RlZCBfb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxNY3BTZXJ2ZXJFdmVudD4oKSk7XG5cdGdldCBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlcigpIHsgcmV0dXJuIHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG1jcFJlc291cmNlOiBVUkksXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHRhcmdldDogTWNwUmVzb3VyY2VUYXJnZXQsXG5cdFx0QElNY3BHYWxsZXJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbWNwR2FsbGVyeVNlcnZpY2U6IElNY3BHYWxsZXJ5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZTogSU1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobG9nU2VydmljZSk7XG5cdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy51cGRhdGVMb2NhbCgpLCA1MCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuZm9yY2VzIHRoZSBlbnRlcnByaXNlIGFsbG93L2RlbnkgcG9saWN5IGF0IHRoZSBwb2ludCBvZiBwZXJzaXN0ZW5jZS4gQ2FsbGVkIGJ5IGV2ZXJ5XG5cdCAqIGluc3RhbGwgcGF0aCAoaW5zdGFsbGFibGUgYW5kIGVhY2ggZ2FsbGVyeSBvdmVycmlkZSkgYWdhaW5zdCB0aGUgZnVsbHkgcmVzb2x2ZWQgc2VydmVyXG5cdCAqIGNvbmZpZ3VyYXRpb24sIHNvIGEgY2FsbGVyIHRoYXQgZ29lcyBzdHJhaWdodCB0byB0aGUgbWFuYWdlbWVudCBBUEkgY2Fubm90IGJ5cGFzcyB0aGVcblx0ICogYGNhbkluc3RhbGxgIFVJIGNoZWNrLCBhbmQgYSBnYWxsZXJ5IGVudHJ5IGNhbm5vdCBzbGlwIHRocm91Z2ggaWYgaXRzIHJlc29sdmVkIGNvbW1hbmQvVVJMXG5cdCAqIGRpZmZlcnMgZnJvbSB0aGUgcHJlLXJlc29sdXRpb24gbWV0YWRhdGEuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZW5zdXJlU2VydmVyQWxsb3dlZChzZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyIHwgSUluc3RhbGxhYmxlTWNwU2VydmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5hbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UuaXNBbGxvd2VkKHNlcnZlcik7XG5cdFx0aWYgKHJlc3VsdCAhPT0gdHJ1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHJlc3VsdC52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXplUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpcy5sb2NhbCA9IGF3YWl0IHRoaXMucG9wdWxhdGVMb2NhbFNlcnZlcnMoKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLnN0YXJ0V2F0Y2hpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuaW5pdGlhbGl6ZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBvcHVsYXRlTG9jYWxTZXJ2ZXJzKCk6IFByb21pc2U8TWFwPHN0cmluZywgSUxvY2FsTWNwU2VydmVyPj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQWJzdHJhY3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlI3BvcHVsYXRlTG9jYWxTZXJ2ZXJzJywgdGhpcy5tY3BSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBsb2NhbCA9IG5ldyBNYXA8c3RyaW5nLCBJTG9jYWxNY3BTZXJ2ZXI+KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNjYW5uZWRNY3BTZXJ2ZXJzID0gYXdhaXQgdGhpcy5tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLnNjYW5NY3BTZXJ2ZXJzKHRoaXMubWNwUmVzb3VyY2UsIHRoaXMudGFyZ2V0KTtcblx0XHRcdGlmIChzY2FubmVkTWNwU2VydmVycy5zZXJ2ZXJzKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChPYmplY3QuZW50cmllcyhzY2FubmVkTWNwU2VydmVycy5zZXJ2ZXJzKS5tYXAoYXN5bmMgKFtuYW1lLCBzY2FubmVkU2VydmVyXSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IHRoaXMuc2NhbkxvY2FsU2VydmVyKG5hbWUsIHNjYW5uZWRTZXJ2ZXIsIHNjYW5uZWRNY3BTZXJ2ZXJzLnNhbmRib3gpO1xuXHRcdFx0XHRcdGxvY2FsLnNldChuYW1lLCBzZXJ2ZXIpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnQ291bGQgbm90IHJlYWQgdXNlciBNQ1Agc2VydmVyczonLCBlcnJvcik7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGFydFdhdGNoaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godGhpcy5tY3BSZXNvdXJjZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHModGhpcy5tY3BSZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5yZWxvYWRDb25maWd1cmF0aW9uU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHVwZGF0ZUxvY2FsKHNvdXJjZT86IElHYWxsZXJ5TWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBhd2FpdCB0aGlzLnBvcHVsYXRlTG9jYWxTZXJ2ZXJzKCk7XG5cblx0XHRcdGNvbnN0IGFkZGVkOiBJTG9jYWxNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgdXBkYXRlZDogSUxvY2FsTWNwU2VydmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBbLi4udGhpcy5sb2NhbC5rZXlzKCldLmZpbHRlcihuYW1lID0+ICFjdXJyZW50LmhhcyhuYW1lKSk7XG5cblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2NhbC5kZWxldGUoc2VydmVyKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgc2VydmVyXSBvZiBjdXJyZW50KSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5sb2NhbC5nZXQobmFtZSk7XG5cdFx0XHRcdGlmIChwcmV2aW91cykge1xuXHRcdFx0XHRcdGlmICghZXF1YWxzKHByZXZpb3VzLCBzZXJ2ZXIpKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkLnB1c2goc2VydmVyKTtcblx0XHRcdFx0XHRcdHRoaXMubG9jYWwuc2V0KG5hbWUsIHNlcnZlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFkZGVkLnB1c2goc2VydmVyKTtcblx0XHRcdFx0XHR0aGlzLmxvY2FsLnNldChuYW1lLCBzZXJ2ZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2NhbC5kZWxldGUoc2VydmVyKTtcblx0XHRcdFx0dGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7IG5hbWU6IHNlcnZlciwgbWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1cGRhdGVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFVwZGF0ZU1jcFNlcnZlcnMuZmlyZSh1cGRhdGVkLm1hcChzZXJ2ZXIgPT4gKHsgbmFtZTogc2VydmVyLm5hbWUsIGxvY2FsOiBzZXJ2ZXIsIHNvdXJjZTogc291cmNlPy5uYW1lID09PSBzZXJ2ZXIubmFtZSA/IHNvdXJjZSA6IHVuZGVmaW5lZCwgbWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UgfSkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFkZGVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLmZpcmUoYWRkZWQubWFwKHNlcnZlciA9PiAoeyBuYW1lOiBzZXJ2ZXIubmFtZSwgbG9jYWw6IHNlcnZlciwgc291cmNlOiBzb3VyY2U/Lm5hbWUgPT09IHNlcnZlci5uYW1lID8gc291cmNlIDogdW5kZWZpbmVkLCBtY3BSZXNvdXJjZTogdGhpcy5tY3BSZXNvdXJjZSB9KSkpO1xuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGxvYWQgaW5zdGFsbGVkIE1DUCBzZXJ2ZXJzOicsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRJbnN0YWxsZWQoKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXJbXT4ge1xuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMubG9jYWwudmFsdWVzKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHNjYW5Mb2NhbFNlcnZlcihuYW1lOiBzdHJpbmcsIGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIHJvb3RTYW5kYm94PzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRsZXQgbWNwU2VydmVySW5mbyA9IGF3YWl0IHRoaXMuZ2V0TG9jYWxTZXJ2ZXJJbmZvKG5hbWUsIGNvbmZpZyk7XG5cdFx0aWYgKCFtY3BTZXJ2ZXJJbmZvKSB7XG5cdFx0XHRtY3BTZXJ2ZXJJbmZvID0geyBuYW1lLCB2ZXJzaW9uOiBjb25maWcudmVyc2lvbiwgZ2FsbGVyeVVybDogaXNTdHJpbmcoY29uZmlnLmdhbGxlcnkpID8gY29uZmlnLmdhbGxlcnkgOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdGNvbmZpZyxcblx0XHRcdHJvb3RTYW5kYm94LFxuXHRcdFx0bWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UsXG5cdFx0XHR2ZXJzaW9uOiBtY3BTZXJ2ZXJJbmZvLnZlcnNpb24sXG5cdFx0XHRsb2NhdGlvbjogbWNwU2VydmVySW5mby5sb2NhdGlvbixcblx0XHRcdGRpc3BsYXlOYW1lOiBtY3BTZXJ2ZXJJbmZvLmRpc3BsYXlOYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IG1jcFNlcnZlckluZm8uZGVzY3JpcHRpb24sXG5cdFx0XHRwdWJsaXNoZXI6IG1jcFNlcnZlckluZm8ucHVibGlzaGVyLFxuXHRcdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6IG1jcFNlcnZlckluZm8ucHVibGlzaGVyRGlzcGxheU5hbWUsXG5cdFx0XHRnYWxsZXJ5VXJsOiBtY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmwsXG5cdFx0XHRnYWxsZXJ5SWQ6IG1jcFNlcnZlckluZm8uZ2FsbGVyeUlkLFxuXHRcdFx0cmVwb3NpdG9yeVVybDogbWNwU2VydmVySW5mby5yZXBvc2l0b3J5VXJsLFxuXHRcdFx0cmVhZG1lVXJsOiBtY3BTZXJ2ZXJJbmZvLnJlYWRtZVVybCxcblx0XHRcdGljb246IG1jcFNlcnZlckluZm8uaWNvbixcblx0XHRcdGNvZGljb246IG1jcFNlcnZlckluZm8uY29kaWNvbixcblx0XHRcdG1hbmlmZXN0OiBtY3BTZXJ2ZXJJbmZvLm1hbmlmZXN0LFxuXHRcdFx0c291cmNlOiBjb25maWcuZ2FsbGVyeSA/ICdnYWxsZXJ5JyA6ICdsb2NhbCdcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbChzZXJ2ZXI6IElJbnN0YWxsYWJsZU1jcFNlcnZlciwgb3B0aW9ucz86IE9taXQ8SW5zdGFsbE9wdGlvbnMsICdtY3BSZXNvdXJjZSc+KTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ01DUCBNYW5hZ2VtZW50IFNlcnZpY2U6IGluc3RhbGwnLCBzZXJ2ZXIubmFtZSk7XG5cdFx0dGhpcy5lbnN1cmVTZXJ2ZXJBbGxvd2VkKHNlcnZlcik7XG5cblx0XHR0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7IG5hbWU6IHNlcnZlci5uYW1lLCBtY3BSZXNvdXJjZTogdGhpcy5tY3BSZXNvdXJjZSB9KTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLmFkZE1jcFNlcnZlcnMoW3NlcnZlcl0sIHRoaXMubWNwUmVzb3VyY2UsIHRoaXMudGFyZ2V0KTtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlTG9jYWwoKTtcblx0XHRcdGNvbnN0IGxvY2FsID0gdGhpcy5sb2NhbC5nZXQoc2VydmVyLm5hbWUpO1xuXHRcdFx0aWYgKCFsb2NhbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBpbnN0YWxsIE1DUCBzZXJ2ZXI6ICR7c2VydmVyLm5hbWV9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbG9jYWw7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fb25EaWRJbnN0YWxsTWNwU2VydmVycy5maXJlKFt7IG5hbWU6IHNlcnZlci5uYW1lLCBlcnJvcjogZSwgbWNwUmVzb3VyY2U6IHRoaXMubWNwUmVzb3VyY2UgfV0pO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB1bmluc3RhbGwoc2VydmVyOiBJTG9jYWxNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBPbWl0PFVuaW5zdGFsbE9wdGlvbnMsICdtY3BSZXNvdXJjZSc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdNQ1AgTWFuYWdlbWVudCBTZXJ2aWNlOiB1bmluc3RhbGwnLCBzZXJ2ZXIubmFtZSk7XG5cdFx0dGhpcy5fb25Vbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZSh7IG5hbWU6IHNlcnZlci5uYW1lLCBtY3BSZXNvdXJjZTogdGhpcy5tY3BSZXNvdXJjZSB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2VydmVycyA9IGF3YWl0IHRoaXMubWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5zY2FuTWNwU2VydmVycyh0aGlzLm1jcFJlc291cmNlLCB0aGlzLnRhcmdldCk7XG5cdFx0XHRpZiAoIWN1cnJlbnRTZXJ2ZXJzLnNlcnZlcnMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLnJlbW92ZU1jcFNlcnZlcnMoW3NlcnZlci5uYW1lXSwgdGhpcy5tY3BSZXNvdXJjZSwgdGhpcy50YXJnZXQpO1xuXHRcdFx0aWYgKHNlcnZlci5sb2NhdGlvbikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChVUkkucmV2aXZlKHNlcnZlci5sb2NhdGlvbiksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbCgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoeyBuYW1lOiBzZXJ2ZXIubmFtZSwgZXJyb3I6IGUsIG1jcFJlc291cmNlOiB0aGlzLm1jcFJlc291cmNlIH0pO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0TG9jYWxTZXJ2ZXJJbmZvKG5hbWU6IHN0cmluZywgbWNwU2VydmVyQ29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbik6IFByb21pc2U8SUxvY2FsTWNwU2VydmVySW5mbyB8IHVuZGVmaW5lZD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBpbnN0YWxsRnJvbVVyaSh1cmk6IFVSSSwgb3B0aW9ucz86IE9taXQ8SW5zdGFsbE9wdGlvbnMsICdtY3BSZXNvdXJjZSc+KTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+O1xufVxuXG5leHBvcnQgY2xhc3MgTWNwVXNlclJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBtY3BMb2NhdGlvbjogVVJJO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1jcFJlc291cmNlOiBVUkksXG5cdFx0QElNY3BHYWxsZXJ5U2VydmljZSBtY3BHYWxsZXJ5U2VydmljZTogSU1jcEdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSBtY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlOiBJTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSxcblx0XHRASUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG1jcFJlc291cmNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsIG1jcEdhbGxlcnlTZXJ2aWNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBtY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLCBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UpO1xuXHRcdHRoaXMubWNwTG9jYXRpb24gPSB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCAnbWNwJyk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZU1ldGFkYXRhKGxvY2FsOiBJTG9jYWxNY3BTZXJ2ZXIsIGdhbGxlcnk6IElHYWxsZXJ5TWNwU2VydmVyKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZU1ldGFkYXRhRnJvbUdhbGxlcnkoZ2FsbGVyeSk7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVMb2NhbChnYWxsZXJ5KTtcblx0XHRjb25zdCB1cGRhdGVkTG9jYWwgPSAoYXdhaXQgdGhpcy5nZXRJbnN0YWxsZWQoKSkuZmluZChzID0+IHMubmFtZSA9PT0gbG9jYWwubmFtZSk7XG5cdFx0aWYgKCF1cGRhdGVkTG9jYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGZpbmQgTUNQIHNlcnZlcjogJHtsb2NhbC5uYW1lfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdXBkYXRlZExvY2FsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHVwZGF0ZU1ldGFkYXRhRnJvbUdhbGxlcnkoZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIpOiBQcm9taXNlPElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbj4ge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gZ2FsbGVyeS5jb25maWd1cmF0aW9uO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5nZXRMb2NhdGlvbihnYWxsZXJ5Lm5hbWUsIGdhbGxlcnkudmVyc2lvbik7XG5cdFx0Y29uc3QgbWFuaWZlc3RQYXRoID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGxvY2F0aW9uLCAnbWFuaWZlc3QuanNvbicpO1xuXHRcdGNvbnN0IGxvY2FsOiBJTG9jYWxNY3BTZXJ2ZXJJbmZvID0ge1xuXHRcdFx0Z2FsbGVyeVVybDogZ2FsbGVyeS5nYWxsZXJ5VXJsLFxuXHRcdFx0Z2FsbGVyeUlkOiBnYWxsZXJ5LmlkLFxuXHRcdFx0bmFtZTogZ2FsbGVyeS5uYW1lLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGdhbGxlcnkuZGlzcGxheU5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZ2FsbGVyeS5kZXNjcmlwdGlvbixcblx0XHRcdHZlcnNpb246IGdhbGxlcnkudmVyc2lvbixcblx0XHRcdHB1Ymxpc2hlcjogZ2FsbGVyeS5wdWJsaXNoZXIsXG5cdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZ2FsbGVyeS5wdWJsaXNoZXJEaXNwbGF5TmFtZSxcblx0XHRcdHJlcG9zaXRvcnlVcmw6IGdhbGxlcnkucmVwb3NpdG9yeVVybCxcblx0XHRcdGxpY2Vuc2VVcmw6IGdhbGxlcnkubGljZW5zZSxcblx0XHRcdGljb246IGdhbGxlcnkuaWNvbixcblx0XHRcdGNvZGljb246IGdhbGxlcnkuY29kaWNvbixcblx0XHRcdG1hbmlmZXN0LFxuXHRcdH07XG5cdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUobWFuaWZlc3RQYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGxvY2FsKSkpO1xuXG5cdFx0aWYgKGdhbGxlcnkucmVhZG1lVXJsIHx8IGdhbGxlcnkucmVhZG1lKSB7XG5cdFx0XHRjb25zdCByZWFkbWUgPSBnYWxsZXJ5LnJlYWRtZSA/IGdhbGxlcnkucmVhZG1lIDogYXdhaXQgdGhpcy5tY3BHYWxsZXJ5U2VydmljZS5nZXRSZWFkbWUoZ2FsbGVyeSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZSh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgobG9jYXRpb24sICdSRUFETUUubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhyZWFkbWUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWFuaWZlc3Q7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0TG9jYWxTZXJ2ZXJJbmZvKG5hbWU6IHN0cmluZywgbWNwU2VydmVyQ29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbik6IFByb21pc2U8SUxvY2FsTWNwU2VydmVySW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBzdG9yZWRNY3BTZXJ2ZXJJbmZvOiBJTG9jYWxNY3BTZXJ2ZXJJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZWFkbWVVcmw6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAobWNwU2VydmVyQ29uZmlnLmdhbGxlcnkpIHtcblx0XHRcdGxvY2F0aW9uID0gdGhpcy5nZXRMb2NhdGlvbihuYW1lLCBtY3BTZXJ2ZXJDb25maWcudmVyc2lvbik7XG5cdFx0XHRjb25zdCBtYW5pZmVzdExvY2F0aW9uID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGxvY2F0aW9uLCAnbWFuaWZlc3QuanNvbicpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUobWFuaWZlc3RMb2NhdGlvbik7XG5cdFx0XHRcdHN0b3JlZE1jcFNlcnZlckluZm8gPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSkgYXMgSUxvY2FsTWNwU2VydmVySW5mbztcblxuXHRcdFx0XHQvLyBtaWdyYXRlXG5cdFx0XHRcdGlmIChzdG9yZWRNY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmw/LmluY2x1ZGVzKCcvdjAvJykpIHtcblx0XHRcdFx0XHRzdG9yZWRNY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmwgPSBzdG9yZWRNY3BTZXJ2ZXJJbmZvLmdhbGxlcnlVcmwuc3Vic3RyaW5nKDAsIHN0b3JlZE1jcFNlcnZlckluZm8uZ2FsbGVyeVVybC5pbmRleE9mKCcvdjAvJykpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1hbmlmZXN0TG9jYXRpb24sIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoc3RvcmVkTWNwU2VydmVySW5mbykpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHN0b3JlZE1jcFNlcnZlckluZm8ubG9jYXRpb24gPSBsb2NhdGlvbjtcblx0XHRcdFx0cmVhZG1lVXJsID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGxvY2F0aW9uLCAnUkVBRE1FLm1kJyk7XG5cdFx0XHRcdGlmICghYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocmVhZG1lVXJsKSkge1xuXHRcdFx0XHRcdHJlYWRtZVVybCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdG9yZWRNY3BTZXJ2ZXJJbmZvLnJlYWRtZVVybCA9IHJlYWRtZVVybDtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdNQ1AgTWFuYWdlbWVudCBTZXJ2aWNlOiBmYWlsZWQgdG8gcmVhZCBtYW5pZmVzdCcsIGxvY2F0aW9uLnRvU3RyaW5nKCksIGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc3RvcmVkTWNwU2VydmVySW5mbztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRMb2NhdGlvbihuYW1lOiBzdHJpbmcsIHZlcnNpb24/OiBzdHJpbmcpOiBVUkkge1xuXHRcdG5hbWUgPSBuYW1lLnJlcGxhY2UoJy8nLCAnLicpO1xuXHRcdHJldHVybiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuam9pblBhdGgodGhpcy5tY3BMb2NhdGlvbiwgdmVyc2lvbiA/IGAke25hbWV9LSR7dmVyc2lvbn1gIDogbmFtZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaW5zdGFsbEZyb21VcmkodXJpOiBVUkksIG9wdGlvbnM/OiBPbWl0PEluc3RhbGxPcHRpb25zLCAnbWNwUmVzb3VyY2UnPik6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IHN1cHBvcnRlZC4nKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbkluc3RhbGwoKTogdHJ1ZSB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RNY3BNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIEFic3RyYWN0Q29tbW9uTWNwTWFuYWdlbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJTWNwTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2U6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdGNhbkluc3RhbGwoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciB8IElJbnN0YWxsYWJsZU1jcFNlcnZlcik6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdGNvbnN0IGFsbG93ZWRUb0luc3RhbGwgPSB0aGlzLmFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZS5pc0FsbG93ZWQoc2VydmVyKTtcblx0XHRpZiAoYWxsb3dlZFRvSW5zdGFsbCAhPT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnbm90IGFsbG93ZWQgdG8gaW5zdGFsbCcsIFwiVGhpcyBtY3Agc2VydmVyIGNhbm5vdCBiZSBpbnN0YWxsZWQgYmVjYXVzZSB7MH1cIiwgYWxsb3dlZFRvSW5zdGFsbC52YWx1ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdE1jcE1hbmFnZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSU1jcE1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbnN0YWxsTWNwU2VydmVyRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9vbkluc3RhbGxNY3BTZXJ2ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnN0YWxsTWNwU2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSW5zdGFsbE1jcFNlcnZlcnMgPSB0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVXBkYXRlTWNwU2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IEluc3RhbGxNY3BTZXJ2ZXJSZXN1bHRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlTWNwU2VydmVycyA9IHRoaXMuX29uRGlkVXBkYXRlTWNwU2VydmVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblVuaW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Vbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9vblVuaW5zdGFsbE1jcFNlcnZlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpZFVuaW5zdGFsbE1jcFNlcnZlckV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIgPSB0aGlzLl9vbkRpZFVuaW5zdGFsbE1jcFNlcnZlci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2VzID0gbmV3IFJlc291cmNlTWFwPHsgc2VydmljZTogTWNwVXNlclJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgfSAmIElEaXNwb3NhYmxlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlIGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShtY3BSZXNvdXJjZTogVVJJKTogTWNwVXNlclJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdGxldCBtY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlID0gdGhpcy5tY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlcy5nZXQobWNwUmVzb3VyY2UpO1xuXHRcdGlmICghbWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZSkge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuY3JlYXRlTWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShtY3BSZXNvdXJjZSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25JbnN0YWxsTWNwU2VydmVyKGUgPT4gdGhpcy5fb25JbnN0YWxsTWNwU2VydmVyLmZpcmUoZSkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkSW5zdGFsbE1jcFNlcnZlcnMoZSA9PiB0aGlzLl9vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzLmZpcmUoZSkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkVXBkYXRlTWNwU2VydmVycyhlID0+IHRoaXMuX29uRGlkVXBkYXRlTWNwU2VydmVycy5maXJlKGUpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vblVuaW5zdGFsbE1jcFNlcnZlcihlID0+IHRoaXMuX29uVW5pbnN0YWxsTWNwU2VydmVyLmZpcmUoZSkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkVW5pbnN0YWxsTWNwU2VydmVyKGUgPT4gdGhpcy5fb25EaWRVbmluc3RhbGxNY3BTZXJ2ZXIuZmlyZShlKSkpO1xuXHRcdFx0dGhpcy5tY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlcy5zZXQobWNwUmVzb3VyY2UsIG1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgPSB7IHNlcnZpY2UsIGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uuc2VydmljZTtcblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbGxlZChtY3BSZXNvdXJjZT86IFVSSSk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyW10+IHtcblx0XHRjb25zdCBtY3BSZXNvdXJjZVVyaSA9IG1jcFJlc291cmNlIHx8IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2U7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShtY3BSZXNvdXJjZVVyaSkuZ2V0SW5zdGFsbGVkKCk7XG5cdH1cblxuXHRhc3luYyBpbnN0YWxsKHNlcnZlcjogSUluc3RhbGxhYmxlTWNwU2VydmVyLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdGNvbnN0IG1jcFJlc291cmNlVXJpID0gb3B0aW9ucz8ubWNwUmVzb3VyY2UgfHwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRyZXR1cm4gdGhpcy5nZXRNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKG1jcFJlc291cmNlVXJpKS5pbnN0YWxsKHNlcnZlciwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyB1bmluc3RhbGwoc2VydmVyOiBJTG9jYWxNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBVbmluc3RhbGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWNwUmVzb3VyY2VVcmkgPSBvcHRpb25zPy5tY3BSZXNvdXJjZSB8fCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdHJldHVybiB0aGlzLmdldE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UobWNwUmVzb3VyY2VVcmkpLnVuaW5zdGFsbChzZXJ2ZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgaW5zdGFsbEZyb21HYWxsZXJ5KHNlcnZlcjogSUdhbGxlcnlNY3BTZXJ2ZXIsIG9wdGlvbnM/OiBJbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0Y29uc3QgbWNwUmVzb3VyY2VVcmkgPSBvcHRpb25zPy5tY3BSZXNvdXJjZSB8fCB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLm1jcFJlc291cmNlO1xuXHRcdHJldHVybiB0aGlzLmdldE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UobWNwUmVzb3VyY2VVcmkpLmluc3RhbGxGcm9tR2FsbGVyeShzZXJ2ZXIsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTWV0YWRhdGEobG9jYWw6IElMb2NhbE1jcFNlcnZlciwgZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIsIG1jcFJlc291cmNlPzogVVJJKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKG1jcFJlc291cmNlIHx8IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUubWNwUmVzb3VyY2UpLnVwZGF0ZU1ldGFkYXRhKGxvY2FsLCBnYWxsZXJ5KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5tY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlcy5mb3JFYWNoKHNlcnZpY2UgPT4gc2VydmljZS5kaXNwb3NlKCkpO1xuXHRcdHRoaXMubWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZXMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZShtY3BSZXNvdXJjZTogVVJJKTogTWNwVXNlclJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFVzZXJSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlLCBtY3BSZXNvdXJjZSk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FB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dUIsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUN2RixrQkFBWSxJQUFJLFFBQVEscUJBQXFCLE9BQUssS0FBSyxzQkFBc0IsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNyRixrQkFBWSxJQUFJLFFBQVEsd0JBQXdCLE9BQUssS0FBSyx5QkFBeUIsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUMzRixXQUFLLDhCQUE4QixJQUFJLGFBQWEsK0JBQStCLEVBQUUsU0FBUyxTQUFTLE1BQU0sWUFBWSxRQUFRLEVBQUUsQ0FBQztBQUFBLElBQ3JJO0FBQ0EsV0FBTyw2QkFBNkI7QUFBQSxFQUNyQztBQUFBLEVBRUEsTUFBTSxhQUFhLGFBQStDO0FBQ2pFLFVBQU0saUJBQWlCLGVBQWUsS0FBSyx3QkFBd0IsZUFBZTtBQUNsRixXQUFPLEtBQUssZ0NBQWdDLGNBQWMsRUFBRSxhQUFhO0FBQUEsRUFDMUU7QUFBQSxFQUVBLE1BQU0sUUFBUSxRQUErQixTQUFvRDtBQUNoRyxVQUFNLGlCQUFpQixTQUFTLGVBQWUsS0FBSyx3QkFBd0IsZUFBZTtBQUMzRixXQUFPLEtBQUssZ0NBQWdDLGNBQWMsRUFBRSxRQUFRLFFBQVEsT0FBTztBQUFBLEVBQ3BGO0FBQUEsRUFFQSxNQUFNLFVBQVUsUUFBeUIsU0FBMkM7QUFDbkYsVUFBTSxpQkFBaUIsU0FBUyxlQUFlLEtBQUssd0JBQXdCLGVBQWU7QUFDM0YsV0FBTyxLQUFLLGdDQUFnQyxjQUFjLEVBQUUsVUFBVSxRQUFRLE9BQU87QUFBQSxFQUN0RjtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsUUFBMkIsU0FBb0Q7QUFDdkcsVUFBTSxpQkFBaUIsU0FBUyxlQUFlLEtBQUssd0JBQXdCLGVBQWU7QUFDM0YsV0FBTyxLQUFLLGdDQUFnQyxjQUFjLEVBQUUsbUJBQW1CLFFBQVEsT0FBTztBQUFBLEVBQy9GO0FBQUEsRUFFQSxNQUFNLGVBQWUsT0FBd0IsU0FBNEIsYUFBNkM7QUFDckgsV0FBTyxLQUFLLGdDQUFnQyxlQUFlLEtBQUssd0JBQXdCLGVBQWUsV0FBVyxFQUFFLGVBQWUsT0FBTyxPQUFPO0FBQUEsRUFDbEo7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssOEJBQThCLFFBQVEsYUFBVyxRQUFRLFFBQVEsQ0FBQztBQUN2RSxTQUFLLDhCQUE4QixNQUFNO0FBQ3pDLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVVLG1DQUFtQyxhQUFvRDtBQUNoRyxXQUFPLEtBQUsscUJBQXFCLGVBQWUsa0NBQWtDLFdBQVc7QUFBQSxFQUM5RjtBQUVEO0FBN0VhLHVCQUFOO0FBQUEsRUFvQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZCVTsiLAogICJuYW1lcyI6IFsiaW5wdXRzIl0KfQo=
