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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { format2, uppercaseFirstLetter } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { asJson, asText, isSuccess, IRequestService } from "../../request/common/request.js";
import { GalleryMcpServerStatus, McpGalleryResolveStatus, RegistryType, TransportType } from "./mcpManagement.js";
import { IMcpGalleryManifestService, McpGalleryManifestStatus, getMcpGalleryManifestResourceUri, McpGalleryResourceType } from "./mcpGalleryManifest.js";
import { CancellationError, isCancellationError } from "../../../base/common/errors.js";
import { isObject, isString } from "../../../base/common/types.js";
var IconMimeType = /* @__PURE__ */ ((IconMimeType2) => {
  IconMimeType2["PNG"] = "image/png";
  IconMimeType2["JPEG"] = "image/jpeg";
  IconMimeType2["JPG"] = "image/jpg";
  IconMimeType2["SVG"] = "image/svg+xml";
  IconMimeType2["WEBP"] = "image/webp";
  return IconMimeType2;
})(IconMimeType || {});
var IconTheme = /* @__PURE__ */ ((IconTheme2) => {
  IconTheme2["LIGHT"] = "light";
  IconTheme2["DARK"] = "dark";
  return IconTheme2;
})(IconTheme || {});
var McpServerSchemaVersion_v2025_07_09;
((McpServerSchemaVersion_v2025_07_092) => {
  McpServerSchemaVersion_v2025_07_092.VERSION = "v0-2025-07-09";
  McpServerSchemaVersion_v2025_07_092.SCHEMA = `https://static.modelcontextprotocol.io/schemas/2025-07-09/server.schema.json`;
  class Serializer {
    toRawGalleryMcpServerResult(input) {
      if (!input || typeof input !== "object" || !Array.isArray(input.servers)) {
        return void 0;
      }
      const from = input;
      const servers = [];
      for (const server of from.servers) {
        const rawServer = this.toRawGalleryMcpServer(server);
        if (!rawServer) {
          return void 0;
        }
        servers.push(rawServer);
      }
      return {
        metadata: {
          count: from.metadata.count ?? 0,
          nextCursor: from.metadata?.next_cursor
        },
        servers
      };
    }
    toRawGalleryMcpServer(input) {
      if (!input || typeof input !== "object") {
        return void 0;
      }
      const from = input;
      if (!from.name || !isString(from.name) || (!from.description || !isString(from.description)) || (!from.version || !isString(from.version))) {
        return void 0;
      }
      if (from.$schema && from.$schema !== McpServerSchemaVersion_v2025_07_092.SCHEMA) {
        return void 0;
      }
      const registryInfo = from._meta?.["io.modelcontextprotocol.registry/official"];
      function convertServerInput(input2) {
        return {
          ...input2,
          isRequired: input2.is_required,
          isSecret: input2.is_secret
        };
      }
      function convertVariables(variables) {
        const result = {};
        for (const [key, value] of Object.entries(variables)) {
          result[key] = convertServerInput(value);
        }
        return result;
      }
      function convertServerArgument(arg) {
        if (arg.type === "positional") {
          return {
            ...arg,
            valueHint: arg.value_hint,
            isRepeated: arg.is_repeated,
            isRequired: arg.is_required,
            isSecret: arg.is_secret,
            variables: arg.variables ? convertVariables(arg.variables) : void 0
          };
        }
        return {
          ...arg,
          isRepeated: arg.is_repeated,
          isRequired: arg.is_required,
          isSecret: arg.is_secret,
          variables: arg.variables ? convertVariables(arg.variables) : void 0
        };
      }
      function convertKeyValueInput(input2) {
        return {
          ...input2,
          isRequired: input2.is_required,
          isSecret: input2.is_secret,
          variables: input2.variables ? convertVariables(input2.variables) : void 0
        };
      }
      function convertTransport(input2) {
        switch (input2.type) {
          case "stdio":
            return {
              type: TransportType.STDIO
            };
          case "streamable-http":
            return {
              type: TransportType.STREAMABLE_HTTP,
              url: input2.url,
              headers: input2.headers?.map(convertKeyValueInput)
            };
          case "sse":
            return {
              type: TransportType.SSE,
              url: input2.url,
              headers: input2.headers?.map(convertKeyValueInput)
            };
          default:
            return {
              type: TransportType.STDIO
            };
        }
      }
      function convertRegistryType(input2) {
        switch (input2) {
          case "npm":
            return RegistryType.NODE;
          case "docker":
          case "docker-hub":
          case "oci":
            return RegistryType.DOCKER;
          case "pypi":
            return RegistryType.PYTHON;
          case "nuget":
            return RegistryType.NUGET;
          case "mcpb":
            return RegistryType.MCPB;
          default:
            return RegistryType.NODE;
        }
      }
      const gitHubInfo = from._meta["io.modelcontextprotocol.registry/publisher-provided"]?.github;
      return {
        id: registryInfo.id,
        name: from.name,
        description: from.description,
        repository: from.repository ? {
          url: from.repository.url,
          source: from.repository.source,
          id: from.repository.id
        } : void 0,
        readme: from.repository?.readme,
        version: from.version,
        createdAt: from.created_at,
        updatedAt: from.updated_at,
        packages: from.packages?.map((p) => ({
          identifier: p.identifier ?? p.name,
          registryType: convertRegistryType(p.registry_type ?? p.registry_name),
          version: p.version,
          fileSha256: p.file_sha256,
          registryBaseUrl: p.registry_base_url,
          transport: p.transport ? convertTransport(p.transport) : { type: TransportType.STDIO },
          packageArguments: p.package_arguments?.map(convertServerArgument),
          runtimeHint: p.runtime_hint,
          runtimeArguments: p.runtime_arguments?.map(convertServerArgument),
          environmentVariables: p.environment_variables?.map(convertKeyValueInput)
        })),
        remotes: from.remotes?.map((remote) => {
          const type = remote.type ?? remote.transport_type ?? remote.transport;
          return {
            type: type === TransportType.SSE ? TransportType.SSE : TransportType.STREAMABLE_HTTP,
            url: remote.url,
            headers: remote.headers?.map(convertKeyValueInput)
          };
        }),
        registryInfo: {
          isLatest: registryInfo.is_latest,
          publishedAt: registryInfo.published_at,
          updatedAt: registryInfo.updated_at
        },
        githubInfo: gitHubInfo ? {
          name: gitHubInfo.name,
          nameWithOwner: gitHubInfo.name_with_owner,
          displayName: gitHubInfo.display_name,
          isInOrganization: gitHubInfo.is_in_organization,
          license: gitHubInfo.license,
          opengraphImageUrl: gitHubInfo.opengraph_image_url,
          ownerAvatarUrl: gitHubInfo.owner_avatar_url,
          primaryLanguage: gitHubInfo.primary_language,
          primaryLanguageColor: gitHubInfo.primary_language_color,
          pushedAt: gitHubInfo.pushed_at,
          stargazerCount: gitHubInfo.stargazer_count,
          topics: gitHubInfo.topics,
          usesCustomOpengraphImage: gitHubInfo.uses_custom_opengraph_image
        } : void 0
      };
    }
  }
  McpServerSchemaVersion_v2025_07_092.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v2025_07_09 || (McpServerSchemaVersion_v2025_07_09 = {}));
var McpServerSchemaVersion_v0_1;
((McpServerSchemaVersion_v0_12) => {
  McpServerSchemaVersion_v0_12.VERSION = "v0.1";
  class Serializer {
    toRawGalleryMcpServerResult(input) {
      if (!input || typeof input !== "object" || !Array.isArray(input.servers)) {
        return void 0;
      }
      const from = input;
      const servers = [];
      for (const server of from.servers) {
        const rawServer = this.toRawGalleryMcpServer(server);
        if (!rawServer) {
          if (servers.length === 0) {
            return void 0;
          } else {
            continue;
          }
        }
        servers.push(rawServer);
      }
      return {
        metadata: from.metadata,
        servers
      };
    }
    toRawGalleryMcpServer(input) {
      if (!input || typeof input !== "object") {
        return void 0;
      }
      const from = input;
      if (!from.server || !isObject(from.server) || (!from.server.name || !isString(from.server.name)) || (!from.server.description || !isString(from.server.description)) || (!from.server.version || !isString(from.server.version))) {
        return void 0;
      }
      const { "io.modelcontextprotocol.registry/official": registryInfo, ...apicInfo } = from._meta;
      const githubInfo = from.server._meta?.["io.modelcontextprotocol.registry/publisher-provided"]?.github;
      return {
        name: from.server.name,
        description: from.server.description,
        version: from.server.version,
        title: from.server.title,
        repository: from.server.repository ? {
          url: from.server.repository.url,
          source: from.server.repository.source,
          id: from.server.repository.id
        } : void 0,
        readme: githubInfo?.readme,
        icons: from.server.icons,
        websiteUrl: from.server.websiteUrl,
        packages: from.server.packages,
        remotes: from.server.remotes,
        status: registryInfo?.status,
        registryInfo,
        githubInfo,
        apicInfo
      };
    }
  }
  McpServerSchemaVersion_v0_12.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v0_1 || (McpServerSchemaVersion_v0_1 = {}));
var McpServerSchemaVersion_v0;
((McpServerSchemaVersion_v02) => {
  McpServerSchemaVersion_v02.VERSION = "v0";
  class Serializer {
    constructor() {
      this.galleryMcpServerDataSerializers = [];
      this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v0_1.SERIALIZER);
      this.galleryMcpServerDataSerializers.push(McpServerSchemaVersion_v2025_07_09.SERIALIZER);
    }
    toRawGalleryMcpServerResult(input) {
      for (const serializer of this.galleryMcpServerDataSerializers) {
        const result = serializer.toRawGalleryMcpServerResult(input);
        if (result) {
          return result;
        }
      }
      return void 0;
    }
    toRawGalleryMcpServer(input) {
      for (const serializer of this.galleryMcpServerDataSerializers) {
        const result = serializer.toRawGalleryMcpServer(input);
        if (result) {
          return result;
        }
      }
      return void 0;
    }
  }
  McpServerSchemaVersion_v02.SERIALIZER = new Serializer();
})(McpServerSchemaVersion_v0 || (McpServerSchemaVersion_v0 = {}));
const DefaultPageSize = 50;
const DefaultQueryState = {
  pageSize: DefaultPageSize
};
class Query {
  constructor(state = DefaultQueryState) {
    this.state = state;
  }
  get pageSize() {
    return this.state.pageSize;
  }
  get searchText() {
    return this.state.searchText;
  }
  get cursor() {
    return this.state.cursor;
  }
  withPage(cursor, pageSize = this.pageSize) {
    return new Query({ ...this.state, pageSize, cursor });
  }
  withSearchText(searchText) {
    return new Query({ ...this.state, searchText });
  }
}
let McpGalleryService = class extends Disposable {
  constructor(requestService, fileService, logService, mcpGalleryManifestService) {
    super();
    this.requestService = requestService;
    this.fileService = fileService;
    this.logService = logService;
    this.mcpGalleryManifestService = mcpGalleryManifestService;
    this.galleryMcpServerDataSerializers = /* @__PURE__ */ new Map();
    this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0.VERSION, McpServerSchemaVersion_v0.SERIALIZER);
    this.galleryMcpServerDataSerializers.set(McpServerSchemaVersion_v0_1.VERSION, McpServerSchemaVersion_v0_1.SERIALIZER);
  }
  isEnabled() {
    return this.mcpGalleryManifestService.mcpGalleryManifestStatus === McpGalleryManifestStatus.Available;
  }
  async query(options, token = CancellationToken.None) {
    const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    if (!mcpGalleryManifest) {
      return {
        firstPage: { items: [], hasMore: false },
        getNextPage: async () => ({ items: [], hasMore: false })
      };
    }
    let query = new Query();
    if (options?.text) {
      query = query.withSearchText(options.text.trim());
    }
    const { servers, metadata } = await this.queryGalleryMcpServers(query, mcpGalleryManifest, token);
    let currentCursor = metadata.nextCursor;
    return {
      firstPage: { items: servers, hasMore: !!metadata.nextCursor },
      getNextPage: async (ct) => {
        if (ct.isCancellationRequested) {
          throw new CancellationError();
        }
        if (!currentCursor) {
          return { items: [], hasMore: false };
        }
        const { servers: servers2, metadata: nextMetadata } = await this.queryGalleryMcpServers(query.withPage(currentCursor).withSearchText(void 0), mcpGalleryManifest, ct);
        currentCursor = nextMetadata.nextCursor;
        return { items: servers2, hasMore: !!nextMetadata.nextCursor };
      }
    };
  }
  async getMcpServersFromGallery(infos) {
    const resolved = await this.resolveMcpServersFromGallery(infos);
    const mcpServers = [];
    for (const result of resolved.values()) {
      if (result.status === McpGalleryResolveStatus.Found) {
        mcpServers.push(result.server);
      }
    }
    return mcpServers;
  }
  async resolveMcpServersFromGallery(infos) {
    const result = /* @__PURE__ */ new Map();
    const mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    if (!mcpGalleryManifest) {
      for (const info of infos) {
        result.set(info.name, { status: McpGalleryResolveStatus.Failed });
      }
      return result;
    }
    await Promise.all(infos.map(async (info) => {
      try {
        const mcpServer = await this.getMcpServerByName(info, mcpGalleryManifest);
        result.set(info.name, mcpServer ? { status: McpGalleryResolveStatus.Found, server: mcpServer } : { status: McpGalleryResolveStatus.NotFound });
      } catch (error) {
        this.logService.warn(`Failed to resolve MCP server '${info.name}' from gallery: ${error}`);
        result.set(info.name, { status: McpGalleryResolveStatus.Failed });
      }
    }));
    return result;
  }
  async getMcpServerByName({ name, id }, mcpGalleryManifest) {
    const urls = [
      this.getLatestServerVersionUrl(name, mcpGalleryManifest),
      this.getNamedServerUrl(name, mcpGalleryManifest),
      id ? this.getServerIdUrl(id, mcpGalleryManifest) : void 0
    ];
    let attempted = false;
    let lastError;
    for (const url of urls) {
      if (!url) {
        continue;
      }
      attempted = true;
      try {
        const mcpServer = await this.getMcpServer(url);
        if (mcpServer) {
          if (mcpServer.name === name) {
            return mcpServer;
          }
          lastError = new Error(`MCP server lookup for '${name}' returned '${mcpServer.name}'`);
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (!attempted) {
      throw new Error(`Cannot resolve MCP server '${name}': registry manifest has no server lookup endpoint`);
    }
    if (lastError !== void 0) {
      throw lastError;
    }
    return void 0;
  }
  async getReadme(gallery, token) {
    const readmeUrl = gallery.readmeUrl;
    if (!readmeUrl) {
      return Promise.resolve(localize("noReadme", "No README available"));
    }
    const uri = URI.parse(readmeUrl);
    if (uri.scheme === Schemas.file) {
      try {
        const content = await this.fileService.readFile(uri);
        return content.value.toString();
      } catch (error) {
        this.logService.error(`Failed to read file from ${uri}: ${error}`);
      }
    }
    if (uri.authority !== "raw.githubusercontent.com") {
      return new MarkdownString(localize("readme.viewInBrowser", "You can find information about this server [here]({0})", readmeUrl)).value;
    }
    const context = await this.requestService.request({
      type: "GET",
      url: readmeUrl,
      callSite: "mcpGalleryService.getReadme"
    }, token);
    const result = await asText(context);
    if (!result) {
      throw new Error(`Failed to fetch README from ${readmeUrl}`);
    }
    return result;
  }
  toGalleryMcpServer(server, manifest) {
    let publisher = "";
    let displayName = server.title;
    if (server.githubInfo?.name) {
      if (!displayName) {
        displayName = server.githubInfo.name.split("-").map((s) => s.toLowerCase() === "mcp" ? "MCP" : s.toLowerCase() === "github" ? "GitHub" : uppercaseFirstLetter(s)).join(" ");
      }
      publisher = server.githubInfo.nameWithOwner.split("/")[0];
    } else {
      const nameParts = server.name.split("/");
      if (nameParts.length > 0) {
        const domainParts = nameParts[0].split(".");
        if (domainParts.length > 0) {
          publisher = domainParts[domainParts.length - 1];
        }
      }
      if (!displayName) {
        displayName = nameParts[nameParts.length - 1].split("-").map((s) => uppercaseFirstLetter(s)).join(" ");
      }
    }
    if (server.githubInfo?.displayName) {
      displayName = server.githubInfo.displayName;
    }
    let icon;
    if (server.githubInfo?.preferredImage) {
      icon = {
        light: server.githubInfo.preferredImage,
        dark: server.githubInfo.preferredImage
      };
    } else if (server.githubInfo?.ownerAvatarUrl) {
      icon = {
        light: server.githubInfo.ownerAvatarUrl,
        dark: server.githubInfo.ownerAvatarUrl
      };
    } else if (server.apicInfo?.["x-ms-icon"]) {
      icon = {
        light: server.apicInfo["x-ms-icon"],
        dark: server.apicInfo["x-ms-icon"]
      };
    } else if (server.icons && server.icons.length > 0) {
      const lightIcon = server.icons.find((icon2) => icon2.theme === "light") ?? server.icons[0];
      const darkIcon = server.icons.find((icon2) => icon2.theme === "dark") ?? lightIcon;
      icon = {
        light: lightIcon.src,
        dark: darkIcon.src
      };
    }
    const webUrl = manifest ? this.getWebUrl(server.name, manifest) : void 0;
    const publisherUrl = manifest ? this.getPublisherUrl(publisher, manifest) : void 0;
    return {
      id: server.id,
      name: server.name,
      displayName,
      galleryUrl: manifest?.url,
      webUrl,
      description: server.description,
      status: server.status ?? GalleryMcpServerStatus.Active,
      version: server.version,
      isLatest: server.registryInfo?.isLatest ?? true,
      publishDate: server.registryInfo?.publishedAt ? Date.parse(server.registryInfo.publishedAt) : void 0,
      lastUpdated: server.githubInfo?.pushedAt ? Date.parse(server.githubInfo.pushedAt) : server.registryInfo?.updatedAt ? Date.parse(server.registryInfo.updatedAt) : void 0,
      repositoryUrl: server.repository?.url,
      readme: server.readme,
      icon,
      publisher,
      publisherUrl,
      license: server.githubInfo?.license,
      starsCount: server.githubInfo?.stargazerCount,
      topics: server.githubInfo?.topics,
      configuration: {
        packages: server.packages,
        remotes: server.remotes
      }
    };
  }
  async queryGalleryMcpServers(query, mcpGalleryManifest, token) {
    const { servers, metadata } = await this.queryRawGalleryMcpServers(query, mcpGalleryManifest, token);
    return {
      servers: servers.map((item) => this.toGalleryMcpServer(item, mcpGalleryManifest)),
      metadata
    };
  }
  async queryRawGalleryMcpServers(query, mcpGalleryManifest, token) {
    const mcpGalleryUrl = this.getMcpGalleryUrl(mcpGalleryManifest);
    if (!mcpGalleryUrl) {
      return { servers: [], metadata: { count: 0 } };
    }
    const uri = URI.parse(mcpGalleryUrl);
    if (uri.scheme === Schemas.file) {
      try {
        const content = await this.fileService.readFile(uri);
        const data2 = content.value.toString();
        return JSON.parse(data2);
      } catch (error) {
        this.logService.error(`Failed to read file from ${uri}: ${error}`);
      }
    }
    let url = `${mcpGalleryUrl}?limit=${query.pageSize}&version=latest`;
    if (query.cursor) {
      url += `&cursor=${query.cursor}`;
    }
    if (query.searchText) {
      const text = encodeURIComponent(query.searchText);
      url += `&search=${text}`;
    }
    let context;
    try {
      context = await this.requestService.request({
        type: "GET",
        url,
        callSite: "mcpGalleryService.queryMcpServers"
      }, token);
    } catch (error) {
      if (isCancellationError(error)) {
        throw error;
      }
      this.logService.error(`Failed to query MCP gallery: ${error}`);
      return { servers: [], metadata: { count: 0 } };
    }
    if (!isSuccess(context)) {
      this.logService.error(`Failed to query MCP gallery: Server returned ${context.res.statusCode}`);
      return { servers: [], metadata: { count: 0 } };
    }
    const data = await asJson(context);
    if (!data) {
      return { servers: [], metadata: { count: 0 } };
    }
    const result = this.serializeMcpServersResult(data, mcpGalleryManifest);
    if (!result) {
      throw new Error(`Failed to serialize MCP servers result from ${mcpGalleryUrl}`, data);
    }
    return result;
  }
  async getMcpServer(mcpServerUrl, mcpGalleryManifest) {
    const context = await this.requestService.request({
      type: "GET",
      url: mcpServerUrl,
      callSite: "mcpGalleryService.getMcpServer"
    }, CancellationToken.None);
    if (context.res.statusCode === 404) {
      return void 0;
    }
    if (context.res.statusCode && context.res.statusCode >= 400) {
      throw new Error(`Failed to fetch MCP server from ${mcpServerUrl}: server responded with ${context.res.statusCode}`);
    }
    const data = await asJson(context);
    if (!data) {
      throw new Error(`Failed to fetch MCP server from ${mcpServerUrl}: empty response`);
    }
    if (!mcpGalleryManifest) {
      mcpGalleryManifest = await this.mcpGalleryManifestService.getMcpGalleryManifest();
    }
    mcpGalleryManifest = mcpGalleryManifest && mcpServerUrl.startsWith(mcpGalleryManifest.url) ? mcpGalleryManifest : null;
    const server = this.serializeMcpServer(data, mcpGalleryManifest);
    if (!server) {
      throw new Error(`Failed to serialize MCP server from ${mcpServerUrl}`, data);
    }
    return this.toGalleryMcpServer(server, mcpGalleryManifest);
  }
  serializeMcpServer(data, mcpGalleryManifest) {
    return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServer(data);
  }
  serializeMcpServersResult(data, mcpGalleryManifest) {
    return this.getSerializer(mcpGalleryManifest)?.toRawGalleryMcpServerResult(data);
  }
  getSerializer(mcpGalleryManifest) {
    const version = mcpGalleryManifest?.version ?? "v0";
    return this.galleryMcpServerDataSerializers.get(version);
  }
  getNamedServerUrl(name, mcpGalleryManifest) {
    const namedResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerNamedResourceUri);
    if (!namedResourceUriTemplate) {
      return void 0;
    }
    return format2(namedResourceUriTemplate, { name });
  }
  getServerIdUrl(id, mcpGalleryManifest) {
    const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerIdUri);
    if (!resourceUriTemplate) {
      return void 0;
    }
    return format2(resourceUriTemplate, { id });
  }
  getLatestServerVersionUrl(name, mcpGalleryManifest) {
    const latestVersionResourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerLatestVersionUri);
    if (!latestVersionResourceUriTemplate) {
      return void 0;
    }
    return format2(latestVersionResourceUriTemplate, { name: encodeURIComponent(name) });
  }
  getWebUrl(name, mcpGalleryManifest) {
    const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServerWebUri);
    if (!resourceUriTemplate) {
      return void 0;
    }
    return format2(resourceUriTemplate, { name });
  }
  getPublisherUrl(name, mcpGalleryManifest) {
    const resourceUriTemplate = getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.PublisherUriTemplate);
    if (!resourceUriTemplate) {
      return void 0;
    }
    return format2(resourceUriTemplate, { name });
  }
  getMcpGalleryUrl(mcpGalleryManifest) {
    return getMcpGalleryManifestResourceUri(mcpGalleryManifest, McpGalleryResourceType.McpServersQueryService);
  }
};
McpGalleryService = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IMcpGalleryManifestService)
], McpGalleryService);
export {
  McpGalleryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2FsbGVyeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZm9ybWF0MiwgdXBwZXJjYXNlRmlyc3RMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBhc0pzb24sIGFzVGV4dCwgaXNTdWNjZXNzLCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IEdhbGxlcnlNY3BTZXJ2ZXJTdGF0dXMsIElHYWxsZXJ5TWNwU2VydmVyLCBJTWNwR2FsbGVyeVNlcnZlclJlc29sdmVSZXN1bHQsIElNY3BHYWxsZXJ5U2VydmljZSwgSU1jcFNlcnZlckFyZ3VtZW50LCBJTWNwU2VydmVySW5wdXQsIElNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0LCBJTWNwU2VydmVyUGFja2FnZSwgSVF1ZXJ5T3B0aW9ucywgTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMsIFJlZ2lzdHJ5VHlwZSwgU3NlVHJhbnNwb3J0LCBTdHJlYW1hYmxlSHR0cFRyYW5zcG9ydCwgVHJhbnNwb3J0LCBUcmFuc3BvcnRUeXBlIH0gZnJvbSAnLi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLCBNY3BHYWxsZXJ5TWFuaWZlc3RTdGF0dXMsIGdldE1jcEdhbGxlcnlNYW5pZmVzdFJlc291cmNlVXJpLCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLCBJTWNwR2FsbGVyeU1hbmlmZXN0IH0gZnJvbSAnLi9tY3BHYWxsZXJ5TWFuaWZlc3QuanMnO1xuaW1wb3J0IHsgSUl0ZXJhdGl2ZVBhZ2VyLCBJSXRlcmF0aXZlUGFnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmludGVyZmFjZSBJTWNwUmVnaXN0cnlJbmZvIHtcblx0cmVhZG9ubHkgaXNMYXRlc3Q/OiBib29sZWFuO1xuXHRyZWFkb25seSBwdWJsaXNoZWRBdD86IHN0cmluZztcblx0cmVhZG9ubHkgdXBkYXRlZEF0Pzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUdpdEh1YkluZm8ge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWVXaXRoT3duZXI6IHN0cmluZztcblx0cmVhZG9ubHkgZGlzcGxheU5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzSW5Pcmdhbml6YXRpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBsaWNlbnNlPzogc3RyaW5nO1xuXHRyZWFkb25seSBvcGVuZ3JhcGhJbWFnZVVybD86IHN0cmluZztcblx0cmVhZG9ubHkgb3duZXJBdmF0YXJVcmw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByZWZlcnJlZEltYWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSBwcmltYXJ5TGFuZ3VhZ2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByaW1hcnlMYW5ndWFnZUNvbG9yPzogc3RyaW5nO1xuXHRyZWFkb25seSBwdXNoZWRBdD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVhZG1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdGFyZ2F6ZXJDb3VudD86IG51bWJlcjtcblx0cmVhZG9ubHkgdG9waWNzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHVzZXNDdXN0b21PcGVuZ3JhcGhJbWFnZT86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJQXp1cmVBUElDZW50ZXJJbmZvIHtcblx0cmVhZG9ubHkgJ3gtbXMtaWNvbic/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeU1jcFNlcnZlcnNNZXRhZGF0YSB7XG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IG5leHRDdXJzb3I/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQge1xuXHRyZWFkb25seSBtZXRhZGF0YTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzTWV0YWRhdGE7XG5cdHJlYWRvbmx5IHNlcnZlcnM6IHJlYWRvbmx5IElSYXdHYWxsZXJ5TWNwU2VydmVyW107XG59XG5cbmludGVyZmFjZSBJR2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQge1xuXHRyZWFkb25seSBtZXRhZGF0YTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzTWV0YWRhdGE7XG5cdHJlYWRvbmx5IHNlcnZlcnM6IElHYWxsZXJ5TWNwU2VydmVyW107XG59XG5cbmludGVyZmFjZSBJUmF3R2FsbGVyeU1jcFNlcnZlciB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSBpZD86IHN0cmluZztcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcG9zaXRvcnk/OiB7XG5cdFx0cmVhZG9ubHkgc291cmNlOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaWQ/OiBzdHJpbmc7XG5cdH07XG5cdHJlYWRvbmx5IHJlYWRtZT86IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbnM/OiByZWFkb25seSBJUmF3R2FsbGVyeU1jcFNlcnZlckljb25bXTtcblx0cmVhZG9ubHkgc3RhdHVzPzogR2FsbGVyeU1jcFNlcnZlclN0YXR1cztcblx0cmVhZG9ubHkgd2Vic2l0ZVVybD86IHN0cmluZztcblx0cmVhZG9ubHkgY3JlYXRlZEF0Pzogc3RyaW5nO1xuXHRyZWFkb25seSB1cGRhdGVkQXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhY2thZ2VzPzogcmVhZG9ubHkgSU1jcFNlcnZlclBhY2thZ2VbXTtcblx0cmVhZG9ubHkgcmVtb3Rlcz86IFJlYWRvbmx5QXJyYXk8U3NlVHJhbnNwb3J0IHwgU3RyZWFtYWJsZUh0dHBUcmFuc3BvcnQ+O1xuXHRyZWFkb25seSByZWdpc3RyeUluZm8/OiBJTWNwUmVnaXN0cnlJbmZvO1xuXHRyZWFkb25seSBnaXRodWJJbmZvPzogSUdpdEh1YkluZm87XG5cdHJlYWRvbmx5IGFwaWNJbmZvPzogSUF6dXJlQVBJQ2VudGVySW5mbztcbn1cblxuaW50ZXJmYWNlIElHYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXIge1xuXHR0b1Jhd0dhbGxlcnlNY3BTZXJ2ZXJSZXN1bHQoaW5wdXQ6IHVua25vd24pOiBJUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdHRvUmF3R2FsbGVyeU1jcFNlcnZlcihpbnB1dDogdW5rbm93bik6IElSYXdHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSVJhd0dhbGxlcnlNY3BTZXJ2ZXJJY29uIHtcblx0cmVhZG9ubHkgc3JjOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRoZW1lPzogSWNvblRoZW1lO1xuXHRyZWFkb25seSBzaXplcz86IHN0cmluZ1tdO1xuXHRyZWFkb25seSBtaW1lVHlwZT86IEljb25NaW1lVHlwZTtcbn1cblxuY29uc3QgZW51bSBJY29uTWltZVR5cGUge1xuXHRQTkcgPSAnaW1hZ2UvcG5nJyxcblx0SlBFRyA9ICdpbWFnZS9qcGVnJyxcblx0SlBHID0gJ2ltYWdlL2pwZycsXG5cdFNWRyA9ICdpbWFnZS9zdmcreG1sJyxcblx0V0VCUCA9ICdpbWFnZS93ZWJwJyxcbn1cblxuY29uc3QgZW51bSBJY29uVGhlbWUge1xuXHRMSUdIVCA9ICdsaWdodCcsXG5cdERBUksgPSAnZGFyaycsXG59XG5cbm5hbWVzcGFjZSBNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YyMDI1XzA3XzA5IHtcblxuXHRleHBvcnQgY29uc3QgVkVSU0lPTiA9ICd2MC0yMDI1LTA3LTA5Jztcblx0ZXhwb3J0IGNvbnN0IFNDSEVNQSA9IGBodHRwczovL3N0YXRpYy5tb2RlbGNvbnRleHRwcm90b2NvbC5pby9zY2hlbWFzLzIwMjUtMDctMDkvc2VydmVyLnNjaGVtYS5qc29uYDtcblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlcklucHV0IHtcblx0XHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0XHRyZWFkb25seSBpc19yZXF1aXJlZD86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgZm9ybWF0PzogJ3N0cmluZycgfCAnbnVtYmVyJyB8ICdib29sZWFuJyB8ICdmaWxlcGF0aCc7XG5cdFx0cmVhZG9ubHkgdmFsdWU/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaXNfc2VjcmV0PzogYm9vbGVhbjtcblx0XHRyZWFkb25seSBkZWZhdWx0Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGNob2ljZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyVmFyaWFibGVJbnB1dCBleHRlbmRzIFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbnB1dCB7XG5cdFx0cmVhZG9ubHkgdmFyaWFibGVzPzogUmVjb3JkPHN0cmluZywgUmF3R2FsbGVyeU1jcFNlcnZlcklucHV0Pjtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyUG9zaXRpb25hbEFyZ3VtZW50IGV4dGVuZHMgUmF3R2FsbGVyeU1jcFNlcnZlclZhcmlhYmxlSW5wdXQge1xuXHRcdHJlYWRvbmx5IHR5cGU6ICdwb3NpdGlvbmFsJztcblx0XHRyZWFkb25seSB2YWx1ZV9oaW50Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlzX3JlcGVhdGVkPzogYm9vbGVhbjtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyTmFtZWRBcmd1bWVudCBleHRlbmRzIFJhd0dhbGxlcnlNY3BTZXJ2ZXJWYXJpYWJsZUlucHV0IHtcblx0XHRyZWFkb25seSB0eXBlOiAnbmFtZWQnO1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBpc19yZXBlYXRlZD86IGJvb2xlYW47XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQgZXh0ZW5kcyBSYXdHYWxsZXJ5TWNwU2VydmVyVmFyaWFibGVJbnB1dCB7XG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHZhbHVlPzogc3RyaW5nO1xuXHR9XG5cblx0dHlwZSBSYXdHYWxsZXJ5TWNwU2VydmVyQXJndW1lbnQgPSBSYXdHYWxsZXJ5TWNwU2VydmVyUG9zaXRpb25hbEFyZ3VtZW50IHwgUmF3R2FsbGVyeU1jcFNlcnZlck5hbWVkQXJndW1lbnQ7XG5cblx0aW50ZXJmYWNlIE1jcFNlcnZlckRlcHJlY2F0ZWRSZW1vdGUge1xuXHRcdHJlYWRvbmx5IHRyYW5zcG9ydF90eXBlPzogJ3N0cmVhbWFibGUnIHwgJ3NzZSc7XG5cdFx0cmVhZG9ubHkgdHJhbnNwb3J0PzogJ3N0cmVhbWFibGUnIHwgJ3NzZSc7XG5cdFx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaGVhZGVycz86IFJlYWRvbmx5QXJyYXk8UmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQ+O1xuXHR9XG5cblx0dHlwZSBSYXdHYWxsZXJ5TWNwU2VydmVyUmVtb3RlcyA9IFJlYWRvbmx5QXJyYXk8U3NlVHJhbnNwb3J0IHwgU3RyZWFtYWJsZUh0dHBUcmFuc3BvcnQgfCBNY3BTZXJ2ZXJEZXByZWNhdGVkUmVtb3RlPjtcblxuXHR0eXBlIFJhd0dhbGxlcnlUcmFuc3BvcnQgPSBTdGRpb1RyYW5zcG9ydCB8IFN0cmVhbWFibGVIdHRwVHJhbnNwb3J0IHwgU3NlVHJhbnNwb3J0O1xuXG5cdGludGVyZmFjZSBTdGRpb1RyYW5zcG9ydCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogJ3N0ZGlvJztcblx0fVxuXG5cdGludGVyZmFjZSBTdHJlYW1hYmxlSHR0cFRyYW5zcG9ydCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogJ3N0cmVhbWFibGUtaHR0cCcgfCAnc3NlJztcblx0XHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0XHRyZWFkb25seSBoZWFkZXJzPzogUmVhZG9ubHlBcnJheTxSYXdHYWxsZXJ5TWNwU2VydmVyS2V5VmFsdWVJbnB1dD47XG5cdH1cblxuXHRpbnRlcmZhY2UgU3NlVHJhbnNwb3J0IHtcblx0XHRyZWFkb25seSB0eXBlOiAnc3NlJztcblx0XHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0XHRyZWFkb25seSBoZWFkZXJzPzogUmVhZG9ubHlBcnJheTxSYXdHYWxsZXJ5TWNwU2VydmVyS2V5VmFsdWVJbnB1dD47XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlclBhY2thZ2Uge1xuXHRcdHJlYWRvbmx5IHJlZ2lzdHJ5X25hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcmVnaXN0cnlfdHlwZTogJ25wbScgfCAncHlwaScgfCAnZG9ja2VyLWh1YicgfCAnbnVnZXQnIHwgJ3JlbW90ZScgfCAnbWNwYic7XG5cdFx0cmVhZG9ubHkgcmVnaXN0cnlfYmFzZV91cmw/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0XHRyZWFkb25seSBmaWxlX3NoYTI1Nj86IHN0cmluZztcblx0XHRyZWFkb25seSB0cmFuc3BvcnQ/OiBSYXdHYWxsZXJ5VHJhbnNwb3J0O1xuXHRcdHJlYWRvbmx5IHBhY2thZ2VfYXJndW1lbnRzPzogcmVhZG9ubHkgUmF3R2FsbGVyeU1jcFNlcnZlckFyZ3VtZW50W107XG5cdFx0cmVhZG9ubHkgcnVudGltZV9oaW50Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHJ1bnRpbWVfYXJndW1lbnRzPzogcmVhZG9ubHkgUmF3R2FsbGVyeU1jcFNlcnZlckFyZ3VtZW50W107XG5cdFx0cmVhZG9ubHkgZW52aXJvbm1lbnRfdmFyaWFibGVzPzogUmVhZG9ubHlBcnJheTxSYXdHYWxsZXJ5TWNwU2VydmVyS2V5VmFsdWVJbnB1dD47XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlciB7XG5cdFx0cmVhZG9ubHkgJHNjaGVtYTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHN0YXR1cz86ICdhY3RpdmUnIHwgJ2RlcHJlY2F0ZWQnO1xuXHRcdHJlYWRvbmx5IHJlcG9zaXRvcnk/OiB7XG5cdFx0XHRyZWFkb25seSBzb3VyY2U6IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IHVybDogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgaWQ/OiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSByZWFkbWU/OiBzdHJpbmc7XG5cdFx0fTtcblx0XHRyZWFkb25seSB2ZXJzaW9uOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgd2Vic2l0ZV91cmw/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgY3JlYXRlZF9hdDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHVwZGF0ZWRfYXQ6IHN0cmluZztcblx0XHRyZWFkb25seSBwYWNrYWdlcz86IHJlYWRvbmx5IFJhd0dhbGxlcnlNY3BTZXJ2ZXJQYWNrYWdlW107XG5cdFx0cmVhZG9ubHkgcmVtb3Rlcz86IFJhd0dhbGxlcnlNY3BTZXJ2ZXJSZW1vdGVzO1xuXHRcdHJlYWRvbmx5IF9tZXRhOiB7XG5cdFx0XHRyZWFkb25seSAnaW8ubW9kZWxjb250ZXh0cHJvdG9jb2wucmVnaXN0cnkvb2ZmaWNpYWwnOiB7XG5cdFx0XHRcdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IGlzX2xhdGVzdDogYm9vbGVhbjtcblx0XHRcdFx0cmVhZG9ubHkgcHVibGlzaGVkX2F0OiBzdHJpbmc7XG5cdFx0XHRcdHJlYWRvbmx5IHVwZGF0ZWRfYXQ6IHN0cmluZztcblx0XHRcdFx0cmVhZG9ubHkgcmVsZWFzZV9kYXRlPzogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHJlYWRvbmx5ICdpby5tb2RlbGNvbnRleHRwcm90b2NvbC5yZWdpc3RyeS9wdWJsaXNoZXItcHJvdmlkZWQnPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0fTtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVyc1Jlc3VsdCB7XG5cdFx0cmVhZG9ubHkgbWV0YWRhdGE6IHtcblx0XHRcdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdFx0XHRyZWFkb25seSBuZXh0X2N1cnNvcj86IHN0cmluZztcblx0XHR9O1xuXHRcdHJlYWRvbmx5IHNlcnZlcnM6IHJlYWRvbmx5IFJhd0dhbGxlcnlNY3BTZXJ2ZXJbXTtcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHaXRIdWJJbmZvIHtcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgbmFtZV93aXRoX293bmVyOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGlzcGxheV9uYW1lPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlzX2luX29yZ2FuaXphdGlvbj86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgbGljZW5zZT86IHN0cmluZztcblx0XHRyZWFkb25seSBvcGVuZ3JhcGhfaW1hZ2VfdXJsPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG93bmVyX2F2YXRhcl91cmw/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcHJpbWFyeV9sYW5ndWFnZT86IHN0cmluZztcblx0XHRyZWFkb25seSBwcmltYXJ5X2xhbmd1YWdlX2NvbG9yPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHB1c2hlZF9hdD86IHN0cmluZztcblx0XHRyZWFkb25seSBzdGFyZ2F6ZXJfY291bnQ/OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgdG9waWNzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0cmVhZG9ubHkgdXNlc19jdXN0b21fb3BlbmdyYXBoX2ltYWdlPzogYm9vbGVhbjtcblx0fVxuXG5cdGNsYXNzIFNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJR2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVyIHtcblxuXHRcdHB1YmxpYyB0b1Jhd0dhbGxlcnlNY3BTZXJ2ZXJSZXN1bHQoaW5wdXQ6IHVua25vd24pOiBJUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdFx0aWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnIHx8ICFBcnJheS5pc0FycmF5KChpbnB1dCBhcyBSYXdHYWxsZXJ5TWNwU2VydmVyc1Jlc3VsdCkuc2VydmVycykpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZnJvbSA9IDxSYXdHYWxsZXJ5TWNwU2VydmVyc1Jlc3VsdD5pbnB1dDtcblxuXHRcdFx0Y29uc3Qgc2VydmVyczogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgZnJvbS5zZXJ2ZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHJhd1NlcnZlciA9IHRoaXMudG9SYXdHYWxsZXJ5TWNwU2VydmVyKHNlcnZlcik7XG5cdFx0XHRcdGlmICghcmF3U2VydmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXJ2ZXJzLnB1c2gocmF3U2VydmVyKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRjb3VudDogZnJvbS5tZXRhZGF0YS5jb3VudCA/PyAwLFxuXHRcdFx0XHRcdG5leHRDdXJzb3I6IGZyb20ubWV0YWRhdGE/Lm5leHRfY3Vyc29yXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNlcnZlcnNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cHVibGljIHRvUmF3R2FsbGVyeU1jcFNlcnZlcihpbnB1dDogdW5rbm93bik6IElSYXdHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmcm9tID0gPFJhd0dhbGxlcnlNY3BTZXJ2ZXI+aW5wdXQ7XG5cblx0XHRcdGlmIChcblx0XHRcdFx0KCFmcm9tLm5hbWUgfHwgIWlzU3RyaW5nKGZyb20ubmFtZSkpXG5cdFx0XHRcdHx8ICghZnJvbS5kZXNjcmlwdGlvbiB8fCAhaXNTdHJpbmcoZnJvbS5kZXNjcmlwdGlvbikpXG5cdFx0XHRcdHx8ICghZnJvbS52ZXJzaW9uIHx8ICFpc1N0cmluZyhmcm9tLnZlcnNpb24pKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmcm9tLiRzY2hlbWEgJiYgZnJvbS4kc2NoZW1hICE9PSBNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YyMDI1XzA3XzA5LlNDSEVNQSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZWdpc3RyeUluZm8gPSBmcm9tLl9tZXRhPy5bJ2lvLm1vZGVsY29udGV4dHByb3RvY29sLnJlZ2lzdHJ5L29mZmljaWFsJ107XG5cblx0XHRcdGZ1bmN0aW9uIGNvbnZlcnRTZXJ2ZXJJbnB1dChpbnB1dDogUmF3R2FsbGVyeU1jcFNlcnZlcklucHV0KTogSU1jcFNlcnZlcklucHV0IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5pbnB1dCxcblx0XHRcdFx0XHRpc1JlcXVpcmVkOiBpbnB1dC5pc19yZXF1aXJlZCxcblx0XHRcdFx0XHRpc1NlY3JldDogaW5wdXQuaXNfc2VjcmV0LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBjb252ZXJ0VmFyaWFibGVzKHZhcmlhYmxlczogUmVjb3JkPHN0cmluZywgUmF3R2FsbGVyeU1jcFNlcnZlcklucHV0Pik6IFJlY29yZDxzdHJpbmcsIElNY3BTZXJ2ZXJJbnB1dD4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIElNY3BTZXJ2ZXJJbnB1dD4gPSB7fTtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModmFyaWFibGVzKSkge1xuXHRcdFx0XHRcdHJlc3VsdFtrZXldID0gY29udmVydFNlcnZlcklucHV0KHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBjb252ZXJ0U2VydmVyQXJndW1lbnQoYXJnOiBSYXdHYWxsZXJ5TWNwU2VydmVyQXJndW1lbnQpOiBJTWNwU2VydmVyQXJndW1lbnQge1xuXHRcdFx0XHRpZiAoYXJnLnR5cGUgPT09ICdwb3NpdGlvbmFsJykge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5hcmcsXG5cdFx0XHRcdFx0XHR2YWx1ZUhpbnQ6IGFyZy52YWx1ZV9oaW50LFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogYXJnLmlzX3JlcGVhdGVkLFxuXHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogYXJnLmlzX3JlcXVpcmVkLFxuXHRcdFx0XHRcdFx0aXNTZWNyZXQ6IGFyZy5pc19zZWNyZXQsXG5cdFx0XHRcdFx0XHR2YXJpYWJsZXM6IGFyZy52YXJpYWJsZXMgPyBjb252ZXJ0VmFyaWFibGVzKGFyZy52YXJpYWJsZXMpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5hcmcsXG5cdFx0XHRcdFx0aXNSZXBlYXRlZDogYXJnLmlzX3JlcGVhdGVkLFxuXHRcdFx0XHRcdGlzUmVxdWlyZWQ6IGFyZy5pc19yZXF1aXJlZCxcblx0XHRcdFx0XHRpc1NlY3JldDogYXJnLmlzX3NlY3JldCxcblx0XHRcdFx0XHR2YXJpYWJsZXM6IGFyZy52YXJpYWJsZXMgPyBjb252ZXJ0VmFyaWFibGVzKGFyZy52YXJpYWJsZXMpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBjb252ZXJ0S2V5VmFsdWVJbnB1dChpbnB1dDogUmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQpOiBJTWNwU2VydmVyS2V5VmFsdWVJbnB1dCB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uaW5wdXQsXG5cdFx0XHRcdFx0aXNSZXF1aXJlZDogaW5wdXQuaXNfcmVxdWlyZWQsXG5cdFx0XHRcdFx0aXNTZWNyZXQ6IGlucHV0LmlzX3NlY3JldCxcblx0XHRcdFx0XHR2YXJpYWJsZXM6IGlucHV0LnZhcmlhYmxlcyA/IGNvbnZlcnRWYXJpYWJsZXMoaW5wdXQudmFyaWFibGVzKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0ZnVuY3Rpb24gY29udmVydFRyYW5zcG9ydChpbnB1dDogUmF3R2FsbGVyeVRyYW5zcG9ydCk6IFRyYW5zcG9ydCB7XG5cdFx0XHRcdHN3aXRjaCAoaW5wdXQudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgJ3N0ZGlvJzpcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNhc2UgJ3N0cmVhbWFibGUtaHR0cCc6XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUcmFuc3BvcnRUeXBlLlNUUkVBTUFCTEVfSFRUUCxcblx0XHRcdFx0XHRcdFx0dXJsOiBpbnB1dC51cmwsXG5cdFx0XHRcdFx0XHRcdGhlYWRlcnM6IGlucHV0LmhlYWRlcnM/Lm1hcChjb252ZXJ0S2V5VmFsdWVJbnB1dCksXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNhc2UgJ3NzZSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUcmFuc3BvcnRUeXBlLlNTRSxcblx0XHRcdFx0XHRcdFx0dXJsOiBpbnB1dC51cmwsXG5cdFx0XHRcdFx0XHRcdGhlYWRlcnM6IGlucHV0LmhlYWRlcnM/Lm1hcChjb252ZXJ0S2V5VmFsdWVJbnB1dCksXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBjb252ZXJ0UmVnaXN0cnlUeXBlKGlucHV0OiBzdHJpbmcpOiBSZWdpc3RyeVR5cGUge1xuXHRcdFx0XHRzd2l0Y2ggKGlucHV0KSB7XG5cdFx0XHRcdFx0Y2FzZSAnbnBtJzpcblx0XHRcdFx0XHRcdHJldHVybiBSZWdpc3RyeVR5cGUuTk9ERTtcblx0XHRcdFx0XHRjYXNlICdkb2NrZXInOlxuXHRcdFx0XHRcdGNhc2UgJ2RvY2tlci1odWInOlxuXHRcdFx0XHRcdGNhc2UgJ29jaSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gUmVnaXN0cnlUeXBlLkRPQ0tFUjtcblx0XHRcdFx0XHRjYXNlICdweXBpJzpcblx0XHRcdFx0XHRcdHJldHVybiBSZWdpc3RyeVR5cGUuUFlUSE9OO1xuXHRcdFx0XHRcdGNhc2UgJ251Z2V0Jzpcblx0XHRcdFx0XHRcdHJldHVybiBSZWdpc3RyeVR5cGUuTlVHRVQ7XG5cdFx0XHRcdFx0Y2FzZSAnbWNwYic6XG5cdFx0XHRcdFx0XHRyZXR1cm4gUmVnaXN0cnlUeXBlLk1DUEI7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiBSZWdpc3RyeVR5cGUuTk9ERTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBnaXRIdWJJbmZvOiBSYXdHaXRIdWJJbmZvIHwgdW5kZWZpbmVkID0gZnJvbS5fbWV0YVsnaW8ubW9kZWxjb250ZXh0cHJvdG9jb2wucmVnaXN0cnkvcHVibGlzaGVyLXByb3ZpZGVkJ10/LmdpdGh1YiBhcyBSYXdHaXRIdWJJbmZvIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogcmVnaXN0cnlJbmZvLmlkLFxuXHRcdFx0XHRuYW1lOiBmcm9tLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmcm9tLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRyZXBvc2l0b3J5OiBmcm9tLnJlcG9zaXRvcnkgPyB7XG5cdFx0XHRcdFx0dXJsOiBmcm9tLnJlcG9zaXRvcnkudXJsLFxuXHRcdFx0XHRcdHNvdXJjZTogZnJvbS5yZXBvc2l0b3J5LnNvdXJjZSxcblx0XHRcdFx0XHRpZDogZnJvbS5yZXBvc2l0b3J5LmlkLFxuXHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWFkbWU6IGZyb20ucmVwb3NpdG9yeT8ucmVhZG1lLFxuXHRcdFx0XHR2ZXJzaW9uOiBmcm9tLnZlcnNpb24sXG5cdFx0XHRcdGNyZWF0ZWRBdDogZnJvbS5jcmVhdGVkX2F0LFxuXHRcdFx0XHR1cGRhdGVkQXQ6IGZyb20udXBkYXRlZF9hdCxcblx0XHRcdFx0cGFja2FnZXM6IGZyb20ucGFja2FnZXM/Lm1hcDxJTWNwU2VydmVyUGFja2FnZT4ocCA9PiAoe1xuXHRcdFx0XHRcdGlkZW50aWZpZXI6IHAuaWRlbnRpZmllciA/PyBwLm5hbWUsXG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBjb252ZXJ0UmVnaXN0cnlUeXBlKHAucmVnaXN0cnlfdHlwZSA/PyBwLnJlZ2lzdHJ5X25hbWUpLFxuXHRcdFx0XHRcdHZlcnNpb246IHAudmVyc2lvbixcblx0XHRcdFx0XHRmaWxlU2hhMjU2OiBwLmZpbGVfc2hhMjU2LFxuXHRcdFx0XHRcdHJlZ2lzdHJ5QmFzZVVybDogcC5yZWdpc3RyeV9iYXNlX3VybCxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHAudHJhbnNwb3J0ID8gY29udmVydFRyYW5zcG9ydChwLnRyYW5zcG9ydCkgOiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBwLnBhY2thZ2VfYXJndW1lbnRzPy5tYXAoY29udmVydFNlcnZlckFyZ3VtZW50KSxcblx0XHRcdFx0XHRydW50aW1lSGludDogcC5ydW50aW1lX2hpbnQsXG5cdFx0XHRcdFx0cnVudGltZUFyZ3VtZW50czogcC5ydW50aW1lX2FyZ3VtZW50cz8ubWFwKGNvbnZlcnRTZXJ2ZXJBcmd1bWVudCksXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IHAuZW52aXJvbm1lbnRfdmFyaWFibGVzPy5tYXAoY29udmVydEtleVZhbHVlSW5wdXQpLFxuXHRcdFx0XHR9KSksXG5cdFx0XHRcdHJlbW90ZXM6IGZyb20ucmVtb3Rlcz8ubWFwKHJlbW90ZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdHlwZSA9ICg8UmF3R2FsbGVyeVRyYW5zcG9ydD5yZW1vdGUpLnR5cGUgPz8gKDxNY3BTZXJ2ZXJEZXByZWNhdGVkUmVtb3RlPnJlbW90ZSkudHJhbnNwb3J0X3R5cGUgPz8gKDxNY3BTZXJ2ZXJEZXByZWNhdGVkUmVtb3RlPnJlbW90ZSkudHJhbnNwb3J0O1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiB0eXBlID09PSBUcmFuc3BvcnRUeXBlLlNTRSA/IFRyYW5zcG9ydFR5cGUuU1NFIDogVHJhbnNwb3J0VHlwZS5TVFJFQU1BQkxFX0hUVFAsXG5cdFx0XHRcdFx0XHR1cmw6IHJlbW90ZS51cmwsXG5cdFx0XHRcdFx0XHRoZWFkZXJzOiByZW1vdGUuaGVhZGVycz8ubWFwKGNvbnZlcnRLZXlWYWx1ZUlucHV0KVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRyZWdpc3RyeUluZm86IHtcblx0XHRcdFx0XHRpc0xhdGVzdDogcmVnaXN0cnlJbmZvLmlzX2xhdGVzdCxcblx0XHRcdFx0XHRwdWJsaXNoZWRBdDogcmVnaXN0cnlJbmZvLnB1Ymxpc2hlZF9hdCxcblx0XHRcdFx0XHR1cGRhdGVkQXQ6IHJlZ2lzdHJ5SW5mby51cGRhdGVkX2F0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnaXRodWJJbmZvOiBnaXRIdWJJbmZvID8ge1xuXHRcdFx0XHRcdG5hbWU6IGdpdEh1YkluZm8ubmFtZSxcblx0XHRcdFx0XHRuYW1lV2l0aE93bmVyOiBnaXRIdWJJbmZvLm5hbWVfd2l0aF9vd25lcixcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogZ2l0SHViSW5mby5kaXNwbGF5X25hbWUsXG5cdFx0XHRcdFx0aXNJbk9yZ2FuaXphdGlvbjogZ2l0SHViSW5mby5pc19pbl9vcmdhbml6YXRpb24sXG5cdFx0XHRcdFx0bGljZW5zZTogZ2l0SHViSW5mby5saWNlbnNlLFxuXHRcdFx0XHRcdG9wZW5ncmFwaEltYWdlVXJsOiBnaXRIdWJJbmZvLm9wZW5ncmFwaF9pbWFnZV91cmwsXG5cdFx0XHRcdFx0b3duZXJBdmF0YXJVcmw6IGdpdEh1YkluZm8ub3duZXJfYXZhdGFyX3VybCxcblx0XHRcdFx0XHRwcmltYXJ5TGFuZ3VhZ2U6IGdpdEh1YkluZm8ucHJpbWFyeV9sYW5ndWFnZSxcblx0XHRcdFx0XHRwcmltYXJ5TGFuZ3VhZ2VDb2xvcjogZ2l0SHViSW5mby5wcmltYXJ5X2xhbmd1YWdlX2NvbG9yLFxuXHRcdFx0XHRcdHB1c2hlZEF0OiBnaXRIdWJJbmZvLnB1c2hlZF9hdCxcblx0XHRcdFx0XHRzdGFyZ2F6ZXJDb3VudDogZ2l0SHViSW5mby5zdGFyZ2F6ZXJfY291bnQsXG5cdFx0XHRcdFx0dG9waWNzOiBnaXRIdWJJbmZvLnRvcGljcyxcblx0XHRcdFx0XHR1c2VzQ3VzdG9tT3BlbmdyYXBoSW1hZ2U6IGdpdEh1YkluZm8udXNlc19jdXN0b21fb3BlbmdyYXBoX2ltYWdlXG5cdFx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IFNFUklBTElaRVIgPSBuZXcgU2VyaWFsaXplcigpO1xufVxuXG5uYW1lc3BhY2UgTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MF8xIHtcblxuXHRleHBvcnQgY29uc3QgVkVSU0lPTiA9ICd2MC4xJztcblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlcklucHV0IHtcblx0XHRyZWFkb25seSBjaG9pY2VzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0cmVhZG9ubHkgZGVmYXVsdD86IHN0cmluZztcblx0XHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0XHRyZWFkb25seSBmb3JtYXQ/OiAnc3RyaW5nJyB8ICdudW1iZXInIHwgJ2Jvb2xlYW4nIHwgJ2ZpbGVwYXRoJztcblx0XHRyZWFkb25seSBpc1JlcXVpcmVkPzogYm9vbGVhbjtcblx0XHRyZWFkb25seSBpc1NlY3JldD86IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgcGxhY2Vob2xkZXI/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdmFsdWU/OiBzdHJpbmc7XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlclZhcmlhYmxlSW5wdXQgZXh0ZW5kcyBSYXdHYWxsZXJ5TWNwU2VydmVySW5wdXQge1xuXHRcdHJlYWRvbmx5IHZhcmlhYmxlcz86IFJlY29yZDxzdHJpbmcsIFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbnB1dD47XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlclBvc2l0aW9uYWxBcmd1bWVudCBleHRlbmRzIFJhd0dhbGxlcnlNY3BTZXJ2ZXJWYXJpYWJsZUlucHV0IHtcblx0XHRyZWFkb25seSB0eXBlOiAncG9zaXRpb25hbCc7XG5cdFx0cmVhZG9ubHkgdmFsdWVIaW50Pzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlzUmVwZWF0ZWQ/OiBib29sZWFuO1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJOYW1lZEFyZ3VtZW50IGV4dGVuZHMgUmF3R2FsbGVyeU1jcFNlcnZlclZhcmlhYmxlSW5wdXQge1xuXHRcdHJlYWRvbmx5IHR5cGU6ICduYW1lZCc7XG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGlzUmVwZWF0ZWQ/OiBib29sZWFuO1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0IGV4dGVuZHMgUmF3R2FsbGVyeU1jcFNlcnZlclZhcmlhYmxlSW5wdXQge1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0fVxuXG5cdHR5cGUgUmF3R2FsbGVyeU1jcFNlcnZlckFyZ3VtZW50ID0gUmF3R2FsbGVyeU1jcFNlcnZlclBvc2l0aW9uYWxBcmd1bWVudCB8IFJhd0dhbGxlcnlNY3BTZXJ2ZXJOYW1lZEFyZ3VtZW50O1xuXG5cdHR5cGUgUmF3R2FsbGVyeU1jcFNlcnZlclJlbW90ZXMgPSBSZWFkb25seUFycmF5PFNzZVRyYW5zcG9ydCB8IFN0cmVhbWFibGVIdHRwVHJhbnNwb3J0PjtcblxuXHR0eXBlIFJhd0dhbGxlcnlUcmFuc3BvcnQgPSBTdGRpb1RyYW5zcG9ydCB8IFN0cmVhbWFibGVIdHRwVHJhbnNwb3J0IHwgU3NlVHJhbnNwb3J0O1xuXG5cdGludGVyZmFjZSBTdGRpb1RyYW5zcG9ydCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTztcblx0fVxuXG5cdGludGVyZmFjZSBTdHJlYW1hYmxlSHR0cFRyYW5zcG9ydCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogVHJhbnNwb3J0VHlwZS5TVFJFQU1BQkxFX0hUVFA7XG5cdFx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaGVhZGVycz86IFJlYWRvbmx5QXJyYXk8UmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQ+O1xuXHR9XG5cblx0aW50ZXJmYWNlIFNzZVRyYW5zcG9ydCB7XG5cdFx0cmVhZG9ubHkgdHlwZTogVHJhbnNwb3J0VHlwZS5TU0U7XG5cdFx0cmVhZG9ubHkgdXJsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaGVhZGVycz86IFJlYWRvbmx5QXJyYXk8UmF3R2FsbGVyeU1jcFNlcnZlcktleVZhbHVlSW5wdXQ+O1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXJQYWNrYWdlIHtcblx0XHRyZWFkb25seSBpZGVudGlmaWVyOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGU7XG5cdFx0cmVhZG9ubHkgdHJhbnNwb3J0OiBSYXdHYWxsZXJ5VHJhbnNwb3J0O1xuXHRcdHJlYWRvbmx5IGZpbGVTaGEyNTY/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZW52aXJvbm1lbnRWYXJpYWJsZXM/OiBSZWFkb25seUFycmF5PFJhd0dhbGxlcnlNY3BTZXJ2ZXJLZXlWYWx1ZUlucHV0Pjtcblx0XHRyZWFkb25seSBwYWNrYWdlQXJndW1lbnRzPzogcmVhZG9ubHkgUmF3R2FsbGVyeU1jcFNlcnZlckFyZ3VtZW50W107XG5cdFx0cmVhZG9ubHkgcmVnaXN0cnlCYXNlVXJsPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHJ1bnRpbWVBcmd1bWVudHM/OiByZWFkb25seSBSYXdHYWxsZXJ5TWNwU2VydmVyQXJndW1lbnRbXTtcblx0XHRyZWFkb25seSBydW50aW1lSGludD86IHN0cmluZztcblx0XHRyZWFkb25seSB2ZXJzaW9uPzogc3RyaW5nO1xuXHR9XG5cblx0aW50ZXJmYWNlIFJhd0dhbGxlcnlNY3BTZXJ2ZXIge1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHZlcnNpb246IHN0cmluZztcblx0XHRyZWFkb25seSAkc2NoZW1hOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaWNvbnM/OiBJUmF3R2FsbGVyeU1jcFNlcnZlckljb25bXTtcblx0XHRyZWFkb25seSByZXBvc2l0b3J5Pzoge1xuXHRcdFx0cmVhZG9ubHkgc291cmNlOiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSB1cmw6IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IHN1YmZvbGRlcj86IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IGlkPzogc3RyaW5nO1xuXHRcdH07XG5cdFx0cmVhZG9ubHkgd2Vic2l0ZVVybD86IHN0cmluZztcblx0XHRyZWFkb25seSBwYWNrYWdlcz86IHJlYWRvbmx5IFJhd0dhbGxlcnlNY3BTZXJ2ZXJQYWNrYWdlW107XG5cdFx0cmVhZG9ubHkgcmVtb3Rlcz86IFJhd0dhbGxlcnlNY3BTZXJ2ZXJSZW1vdGVzO1xuXHRcdHJlYWRvbmx5IF9tZXRhPzoge1xuXHRcdFx0cmVhZG9ubHkgJ2lvLm1vZGVsY29udGV4dHByb3RvY29sLnJlZ2lzdHJ5L3B1Ymxpc2hlci1wcm92aWRlZCc/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHR9ICYgSUF6dXJlQVBJQ2VudGVySW5mbztcblx0fVxuXG5cdGludGVyZmFjZSBSYXdHYWxsZXJ5TWNwU2VydmVySW5mbyB7XG5cdFx0cmVhZG9ubHkgc2VydmVyOiBSYXdHYWxsZXJ5TWNwU2VydmVyO1xuXHRcdHJlYWRvbmx5IF9tZXRhOiB7XG5cdFx0XHRyZWFkb25seSAnaW8ubW9kZWxjb250ZXh0cHJvdG9jb2wucmVnaXN0cnkvb2ZmaWNpYWwnPzoge1xuXHRcdFx0XHRyZWFkb25seSBzdGF0dXM6IEdhbGxlcnlNY3BTZXJ2ZXJTdGF0dXM7XG5cdFx0XHRcdHJlYWRvbmx5IGlzTGF0ZXN0OiBib29sZWFuO1xuXHRcdFx0XHRyZWFkb25seSBwdWJsaXNoZWRBdDogc3RyaW5nO1xuXHRcdFx0XHRyZWFkb25seSB1cGRhdGVkQXQ/OiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdH07XG5cdH1cblxuXHRpbnRlcmZhY2UgUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQge1xuXHRcdHJlYWRvbmx5IG1ldGFkYXRhOiB7XG5cdFx0XHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHRcdFx0cmVhZG9ubHkgbmV4dEN1cnNvcj86IHN0cmluZztcblx0XHR9O1xuXHRcdHJlYWRvbmx5IHNlcnZlcnM6IHJlYWRvbmx5IFJhd0dhbGxlcnlNY3BTZXJ2ZXJJbmZvW107XG5cdH1cblxuXHRjbGFzcyBTZXJpYWxpemVyIGltcGxlbWVudHMgSUdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplciB7XG5cblx0XHRwdWJsaWMgdG9SYXdHYWxsZXJ5TWNwU2VydmVyUmVzdWx0KGlucHV0OiB1bmtub3duKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0JyB8fCAhQXJyYXkuaXNBcnJheSgoaW5wdXQgYXMgUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQpLnNlcnZlcnMpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyb20gPSA8UmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQ+aW5wdXQ7XG5cblx0XHRcdGNvbnN0IHNlcnZlcnM6IElSYXdHYWxsZXJ5TWNwU2VydmVyW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIGZyb20uc2VydmVycykge1xuXHRcdFx0XHRjb25zdCByYXdTZXJ2ZXIgPSB0aGlzLnRvUmF3R2FsbGVyeU1jcFNlcnZlcihzZXJ2ZXIpO1xuXHRcdFx0XHRpZiAoIXJhd1NlcnZlcikge1xuXHRcdFx0XHRcdGlmIChzZXJ2ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHNlcnZlcnMucHVzaChyYXdTZXJ2ZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtZXRhZGF0YTogZnJvbS5tZXRhZGF0YSxcblx0XHRcdFx0c2VydmVyc1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRwdWJsaWMgdG9SYXdHYWxsZXJ5TWNwU2VydmVyKGlucHV0OiB1bmtub3duKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdFx0aWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyb20gPSA8UmF3R2FsbGVyeU1jcFNlcnZlckluZm8+aW5wdXQ7XG5cblx0XHRcdGlmIChcblx0XHRcdFx0KCFmcm9tLnNlcnZlciB8fCAhaXNPYmplY3QoZnJvbS5zZXJ2ZXIpKVxuXHRcdFx0XHR8fCAoIWZyb20uc2VydmVyLm5hbWUgfHwgIWlzU3RyaW5nKGZyb20uc2VydmVyLm5hbWUpKVxuXHRcdFx0XHR8fCAoIWZyb20uc2VydmVyLmRlc2NyaXB0aW9uIHx8ICFpc1N0cmluZyhmcm9tLnNlcnZlci5kZXNjcmlwdGlvbikpXG5cdFx0XHRcdHx8ICghZnJvbS5zZXJ2ZXIudmVyc2lvbiB8fCAhaXNTdHJpbmcoZnJvbS5zZXJ2ZXIudmVyc2lvbikpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyAnaW8ubW9kZWxjb250ZXh0cHJvdG9jb2wucmVnaXN0cnkvb2ZmaWNpYWwnOiByZWdpc3RyeUluZm8sIC4uLmFwaWNJbmZvIH0gPSBmcm9tLl9tZXRhO1xuXHRcdFx0Y29uc3QgZ2l0aHViSW5mbyA9IGZyb20uc2VydmVyLl9tZXRhPy5bJ2lvLm1vZGVsY29udGV4dHByb3RvY29sLnJlZ2lzdHJ5L3B1Ymxpc2hlci1wcm92aWRlZCddPy5naXRodWIgYXMgSUdpdEh1YkluZm8gfCB1bmRlZmluZWQ7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG5hbWU6IGZyb20uc2VydmVyLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmcm9tLnNlcnZlci5kZXNjcmlwdGlvbixcblx0XHRcdFx0dmVyc2lvbjogZnJvbS5zZXJ2ZXIudmVyc2lvbixcblx0XHRcdFx0dGl0bGU6IGZyb20uc2VydmVyLnRpdGxlLFxuXHRcdFx0XHRyZXBvc2l0b3J5OiBmcm9tLnNlcnZlci5yZXBvc2l0b3J5ID8ge1xuXHRcdFx0XHRcdHVybDogZnJvbS5zZXJ2ZXIucmVwb3NpdG9yeS51cmwsXG5cdFx0XHRcdFx0c291cmNlOiBmcm9tLnNlcnZlci5yZXBvc2l0b3J5LnNvdXJjZSxcblx0XHRcdFx0XHRpZDogZnJvbS5zZXJ2ZXIucmVwb3NpdG9yeS5pZCxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVhZG1lOiBnaXRodWJJbmZvPy5yZWFkbWUsXG5cdFx0XHRcdGljb25zOiBmcm9tLnNlcnZlci5pY29ucyxcblx0XHRcdFx0d2Vic2l0ZVVybDogZnJvbS5zZXJ2ZXIud2Vic2l0ZVVybCxcblx0XHRcdFx0cGFja2FnZXM6IGZyb20uc2VydmVyLnBhY2thZ2VzLFxuXHRcdFx0XHRyZW1vdGVzOiBmcm9tLnNlcnZlci5yZW1vdGVzLFxuXHRcdFx0XHRzdGF0dXM6IHJlZ2lzdHJ5SW5mbz8uc3RhdHVzLFxuXHRcdFx0XHRyZWdpc3RyeUluZm8sXG5cdFx0XHRcdGdpdGh1YkluZm8sXG5cdFx0XHRcdGFwaWNJbmZvXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBTRVJJQUxJWkVSID0gbmV3IFNlcmlhbGl6ZXIoKTtcbn1cblxubmFtZXNwYWNlIE1jcFNlcnZlclNjaGVtYVZlcnNpb25fdjAge1xuXG5cdGV4cG9ydCBjb25zdCBWRVJTSU9OID0gJ3YwJztcblxuXHRjbGFzcyBTZXJpYWxpemVyIGltcGxlbWVudHMgSUdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplciB7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IGdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplcnM6IElHYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJbXSA9IFtdO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHR0aGlzLmdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplcnMucHVzaChNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YwXzEuU0VSSUFMSVpFUik7XG5cdFx0XHR0aGlzLmdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplcnMucHVzaChNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YyMDI1XzA3XzA5LlNFUklBTElaRVIpO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB0b1Jhd0dhbGxlcnlNY3BTZXJ2ZXJSZXN1bHQoaW5wdXQ6IHVua25vd24pOiBJUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdFx0Zm9yIChjb25zdCBzZXJpYWxpemVyIG9mIHRoaXMuZ2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVycykge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBzZXJpYWxpemVyLnRvUmF3R2FsbGVyeU1jcFNlcnZlclJlc3VsdChpbnB1dCk7XG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHB1YmxpYyB0b1Jhd0dhbGxlcnlNY3BTZXJ2ZXIoaW5wdXQ6IHVua25vd24pOiBJUmF3R2FsbGVyeU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlcmlhbGl6ZXIgb2YgdGhpcy5nYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcmlhbGl6ZXIudG9SYXdHYWxsZXJ5TWNwU2VydmVyKGlucHV0KTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IFNFUklBTElaRVIgPSBuZXcgU2VyaWFsaXplcigpO1xufVxuXG5jb25zdCBEZWZhdWx0UGFnZVNpemUgPSA1MDtcblxuaW50ZXJmYWNlIElRdWVyeVN0YXRlIHtcblx0cmVhZG9ubHkgc2VhcmNoVGV4dD86IHN0cmluZztcblx0cmVhZG9ubHkgY3Vyc29yPzogc3RyaW5nO1xuXHRyZWFkb25seSBwYWdlU2l6ZTogbnVtYmVyO1xufVxuXG5jb25zdCBEZWZhdWx0UXVlcnlTdGF0ZTogSVF1ZXJ5U3RhdGUgPSB7XG5cdHBhZ2VTaXplOiBEZWZhdWx0UGFnZVNpemUsXG59O1xuXG5jbGFzcyBRdWVyeSB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBzdGF0ZSA9IERlZmF1bHRRdWVyeVN0YXRlKSB7IH1cblxuXHRnZXQgcGFnZVNpemUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc3RhdGUucGFnZVNpemU7IH1cblx0Z2V0IHNlYXJjaFRleHQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuc3RhdGUuc2VhcmNoVGV4dDsgfVxuXHRnZXQgY3Vyc29yKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnN0YXRlLmN1cnNvcjsgfVxuXG5cdHdpdGhQYWdlKGN1cnNvcjogc3RyaW5nLCBwYWdlU2l6ZTogbnVtYmVyID0gdGhpcy5wYWdlU2l6ZSk6IFF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFF1ZXJ5KHsgLi4udGhpcy5zdGF0ZSwgcGFnZVNpemUsIGN1cnNvciB9KTtcblx0fVxuXG5cdHdpdGhTZWFyY2hUZXh0KHNlYXJjaFRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFF1ZXJ5IHtcblx0XHRyZXR1cm4gbmV3IFF1ZXJ5KHsgLi4udGhpcy5zdGF0ZSwgc2VhcmNoVGV4dCB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwR2FsbGVyeVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1jcEdhbGxlcnlTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBnYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzOiBNYXA8c3RyaW5nLCBJR2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVyPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlOiBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmdhbGxlcnlNY3BTZXJ2ZXJEYXRhU2VyaWFsaXplcnMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5nYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzLnNldChNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YwLlZFUlNJT04sIE1jcFNlcnZlclNjaGVtYVZlcnNpb25fdjAuU0VSSUFMSVpFUik7XG5cdFx0dGhpcy5nYWxsZXJ5TWNwU2VydmVyRGF0YVNlcmlhbGl6ZXJzLnNldChNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YwXzEuVkVSU0lPTiwgTWNwU2VydmVyU2NoZW1hVmVyc2lvbl92MF8xLlNFUklBTElaRVIpO1xuXHR9XG5cblx0aXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UubWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzID09PSBNY3BHYWxsZXJ5TWFuaWZlc3RTdGF0dXMuQXZhaWxhYmxlO1xuXHR9XG5cblx0YXN5bmMgcXVlcnkob3B0aW9ucz86IElRdWVyeU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPElJdGVyYXRpdmVQYWdlcjxJR2FsbGVyeU1jcFNlcnZlcj4+IHtcblx0XHRjb25zdCBtY3BHYWxsZXJ5TWFuaWZlc3QgPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0TWNwR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0aWYgKCFtY3BHYWxsZXJ5TWFuaWZlc3QpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZpcnN0UGFnZTogeyBpdGVtczogW10sIGhhc01vcmU6IGZhbHNlIH0sXG5cdFx0XHRcdGdldE5leHRQYWdlOiBhc3luYyAoKSA9PiAoeyBpdGVtczogW10sIGhhc01vcmU6IGZhbHNlIH0pXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGxldCBxdWVyeSA9IG5ldyBRdWVyeSgpO1xuXHRcdGlmIChvcHRpb25zPy50ZXh0KSB7XG5cdFx0XHRxdWVyeSA9IHF1ZXJ5LndpdGhTZWFyY2hUZXh0KG9wdGlvbnMudGV4dC50cmltKCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc2VydmVycywgbWV0YWRhdGEgfSA9IGF3YWl0IHRoaXMucXVlcnlHYWxsZXJ5TWNwU2VydmVycyhxdWVyeSwgbWNwR2FsbGVyeU1hbmlmZXN0LCB0b2tlbik7XG5cblx0XHRsZXQgY3VycmVudEN1cnNvciA9IG1ldGFkYXRhLm5leHRDdXJzb3I7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZpcnN0UGFnZTogeyBpdGVtczogc2VydmVycywgaGFzTW9yZTogISFtZXRhZGF0YS5uZXh0Q3Vyc29yIH0sXG5cdFx0XHRnZXROZXh0UGFnZTogYXN5bmMgKGN0OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUl0ZXJhdGl2ZVBhZ2U8SUdhbGxlcnlNY3BTZXJ2ZXI+PiA9PiB7XG5cdFx0XHRcdGlmIChjdC5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghY3VycmVudEN1cnNvcikge1xuXHRcdFx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSwgaGFzTW9yZTogZmFsc2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB7IHNlcnZlcnMsIG1ldGFkYXRhOiBuZXh0TWV0YWRhdGEgfSA9IGF3YWl0IHRoaXMucXVlcnlHYWxsZXJ5TWNwU2VydmVycyhxdWVyeS53aXRoUGFnZShjdXJyZW50Q3Vyc29yKS53aXRoU2VhcmNoVGV4dCh1bmRlZmluZWQpLCBtY3BHYWxsZXJ5TWFuaWZlc3QsIGN0KTtcblx0XHRcdFx0Y3VycmVudEN1cnNvciA9IG5leHRNZXRhZGF0YS5uZXh0Q3Vyc29yO1xuXHRcdFx0XHRyZXR1cm4geyBpdGVtczogc2VydmVycywgaGFzTW9yZTogISFuZXh0TWV0YWRhdGEubmV4dEN1cnNvciB9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBnZXRNY3BTZXJ2ZXJzRnJvbUdhbGxlcnkoaW5mb3M6IHsgbmFtZTogc3RyaW5nOyBpZD86IHN0cmluZyB9W10pOiBQcm9taXNlPElHYWxsZXJ5TWNwU2VydmVyW10+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMucmVzb2x2ZU1jcFNlcnZlcnNGcm9tR2FsbGVyeShpbmZvcyk7XG5cdFx0Y29uc3QgbWNwU2VydmVyczogSUdhbGxlcnlNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHJlc29sdmVkLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMuRm91bmQpIHtcblx0XHRcdFx0bWNwU2VydmVycy5wdXNoKHJlc3VsdC5zZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbWNwU2VydmVycztcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVNY3BTZXJ2ZXJzRnJvbUdhbGxlcnkoaW5mb3M6IHsgbmFtZTogc3RyaW5nOyBpZD86IHN0cmluZyB9W10pOiBQcm9taXNlPE1hcDxzdHJpbmcsIElNY3BHYWxsZXJ5U2VydmVyUmVzb2x2ZVJlc3VsdD4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgSU1jcEdhbGxlcnlTZXJ2ZXJSZXNvbHZlUmVzdWx0PigpO1xuXHRcdGNvbnN0IG1jcEdhbGxlcnlNYW5pZmVzdCA9IGF3YWl0IHRoaXMubWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5nZXRNY3BHYWxsZXJ5TWFuaWZlc3QoKTtcblx0XHRpZiAoIW1jcEdhbGxlcnlNYW5pZmVzdCkge1xuXHRcdFx0Ly8gV2l0aG91dCBhIHJlZ2lzdHJ5IG1hbmlmZXN0IHdlIGNhbm5vdCBkZXRlcm1pbmUgbWVtYmVyc2hpcDsgcmVwb3J0IGFzIGZhaWxlZFxuXHRcdFx0Ly8gKHVuZGV0ZXJtaW5lZCkgc28gY2FsbGVycyBkbyBub3QgdHJlYXQgdGhpcyBhcyBhIGRlZmluaXRpdmUgXCJub3QgZm91bmRcIi5cblx0XHRcdGZvciAoY29uc3QgaW5mbyBvZiBpbmZvcykge1xuXHRcdFx0XHRyZXN1bHQuc2V0KGluZm8ubmFtZSwgeyBzdGF0dXM6IE1jcEdhbGxlcnlSZXNvbHZlU3RhdHVzLkZhaWxlZCB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5mb3MubWFwKGFzeW5jIGluZm8gPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWNwU2VydmVyID0gYXdhaXQgdGhpcy5nZXRNY3BTZXJ2ZXJCeU5hbWUoaW5mbywgbWNwR2FsbGVyeU1hbmlmZXN0KTtcblx0XHRcdFx0cmVzdWx0LnNldChpbmZvLm5hbWUsIG1jcFNlcnZlclxuXHRcdFx0XHRcdD8geyBzdGF0dXM6IE1jcEdhbGxlcnlSZXNvbHZlU3RhdHVzLkZvdW5kLCBzZXJ2ZXI6IG1jcFNlcnZlciB9XG5cdFx0XHRcdFx0OiB7IHN0YXR1czogTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMuTm90Rm91bmQgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRmFpbGVkIHRvIHJlc29sdmUgTUNQIHNlcnZlciAnJHtpbmZvLm5hbWV9JyBmcm9tIGdhbGxlcnk6ICR7ZXJyb3J9YCk7XG5cdFx0XHRcdHJlc3VsdC5zZXQoaW5mby5uYW1lLCB7IHN0YXR1czogTWNwR2FsbGVyeVJlc29sdmVTdGF0dXMuRmFpbGVkIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1jcFNlcnZlckJ5TmFtZSh7IG5hbWUsIGlkIH06IHsgbmFtZTogc3RyaW5nOyBpZD86IHN0cmluZyB9LCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QpOiBQcm9taXNlPElHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdXJscyA9IFtcblx0XHRcdHRoaXMuZ2V0TGF0ZXN0U2VydmVyVmVyc2lvblVybChuYW1lLCBtY3BHYWxsZXJ5TWFuaWZlc3QpLFxuXHRcdFx0dGhpcy5nZXROYW1lZFNlcnZlclVybChuYW1lLCBtY3BHYWxsZXJ5TWFuaWZlc3QpLFxuXHRcdFx0aWQgPyB0aGlzLmdldFNlcnZlcklkVXJsKGlkLCBtY3BHYWxsZXJ5TWFuaWZlc3QpIDogdW5kZWZpbmVkLFxuXHRcdF07XG5cblx0XHRsZXQgYXR0ZW1wdGVkID0gZmFsc2U7XG5cdFx0bGV0IGxhc3RFcnJvcjogdW5rbm93bjtcblx0XHRmb3IgKGNvbnN0IHVybCBvZiB1cmxzKSB7XG5cdFx0XHRpZiAoIXVybCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGF0dGVtcHRlZCA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtY3BTZXJ2ZXIgPSBhd2FpdCB0aGlzLmdldE1jcFNlcnZlcih1cmwpO1xuXHRcdFx0XHRpZiAobWNwU2VydmVyKSB7XG5cdFx0XHRcdFx0aWYgKG1jcFNlcnZlci5uYW1lID09PSBuYW1lKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbWNwU2VydmVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYXN0RXJyb3IgPSBuZXcgRXJyb3IoYE1DUCBzZXJ2ZXIgbG9va3VwIGZvciAnJHtuYW1lfScgcmV0dXJuZWQgJyR7bWNwU2VydmVyLm5hbWV9J2ApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBUcmFuc2llbnQvdW5kZXRlcm1pbmVkIGZhaWx1cmUgb24gdGhpcyBlbmRwb2ludDogcmVtZW1iZXIgaXQgYW5kIHN0aWxsXG5cdFx0XHRcdC8vIHRyeSB0aGUgcmVtYWluaW5nIGVuZHBvaW50cyBiZWZvcmUgZ2l2aW5nIHVwLlxuXHRcdFx0XHRsYXN0RXJyb3IgPSBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPbmx5IHJlcG9ydCBhIGRlZmluaXRpdmUgXCJub3QgZm91bmRcIiAodW5kZWZpbmVkKSB3aGVuIGF0IGxlYXN0IG9uZSBlbmRwb2ludFxuXHRcdC8vIHdhcyBxdWVyaWVkIGFuZCBldmVyeSBhdHRlbXB0IHJldHVybmVkIGFuIGF1dGhvcml0YXRpdmUgbmVnYXRpdmUuIElmIG5vXG5cdFx0Ly8gZW5kcG9pbnQgY291bGQgYmUgcXVlcmllZCwgb3IgYW55IGF0dGVtcHQgZmFpbGVkIHRyYW5zaWVudGx5LCBzdXJmYWNlIGFuXG5cdFx0Ly8gZXJyb3Igc28gbWVtYmVyc2hpcCBpcyB0cmVhdGVkIGFzIHVuZGV0ZXJtaW5lZCByYXRoZXIgdGhhbiBhYnNlbnQuXG5cdFx0aWYgKCFhdHRlbXB0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgTUNQIHNlcnZlciAnJHtuYW1lfSc6IHJlZ2lzdHJ5IG1hbmlmZXN0IGhhcyBubyBzZXJ2ZXIgbG9va3VwIGVuZHBvaW50YCk7XG5cdFx0fVxuXHRcdGlmIChsYXN0RXJyb3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbGFzdEVycm9yO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRSZWFkbWUoZ2FsbGVyeTogSUdhbGxlcnlNY3BTZXJ2ZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVhZG1lVXJsID0gZ2FsbGVyeS5yZWFkbWVVcmw7XG5cdFx0aWYgKCFyZWFkbWVVcmwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobG9jYWxpemUoJ25vUmVhZG1lJywgJ05vIFJFQURNRSBhdmFpbGFibGUnKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHJlYWRtZVVybCk7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHJlYWQgZmlsZSBmcm9tICR7dXJpfTogJHtlcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodXJpLmF1dGhvcml0eSAhPT0gJ3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20nKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdyZWFkbWUudmlld0luQnJvd3NlcicsIFwiWW91IGNhbiBmaW5kIGluZm9ybWF0aW9uIGFib3V0IHRoaXMgc2VydmVyIFtoZXJlXSh7MH0pXCIsIHJlYWRtZVVybCkpLnZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHR1cmw6IHJlYWRtZVVybCxcblx0XHRcdGNhbGxTaXRlOiAnbWNwR2FsbGVyeVNlcnZpY2UuZ2V0UmVhZG1lJ1xuXHRcdH0sIHRva2VuKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFzVGV4dChjb250ZXh0KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZmV0Y2ggUkVBRE1FIGZyb20gJHtyZWFkbWVVcmx9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgdG9HYWxsZXJ5TWNwU2VydmVyKHNlcnZlcjogSVJhd0dhbGxlcnlNY3BTZXJ2ZXIsIG1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0IHwgbnVsbCk6IElHYWxsZXJ5TWNwU2VydmVyIHtcblx0XHRsZXQgcHVibGlzaGVyID0gJyc7XG5cdFx0bGV0IGRpc3BsYXlOYW1lID0gc2VydmVyLnRpdGxlO1xuXG5cdFx0aWYgKHNlcnZlci5naXRodWJJbmZvPy5uYW1lKSB7XG5cdFx0XHRpZiAoIWRpc3BsYXlOYW1lKSB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lID0gc2VydmVyLmdpdGh1YkluZm8ubmFtZS5zcGxpdCgnLScpLm1hcChzID0+IHMudG9Mb3dlckNhc2UoKSA9PT0gJ21jcCcgPyAnTUNQJyA6IHMudG9Mb3dlckNhc2UoKSA9PT0gJ2dpdGh1YicgPyAnR2l0SHViJyA6IHVwcGVyY2FzZUZpcnN0TGV0dGVyKHMpKS5qb2luKCcgJyk7XG5cdFx0XHR9XG5cdFx0XHRwdWJsaXNoZXIgPSBzZXJ2ZXIuZ2l0aHViSW5mby5uYW1lV2l0aE93bmVyLnNwbGl0KCcvJylbMF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG5hbWVQYXJ0cyA9IHNlcnZlci5uYW1lLnNwbGl0KCcvJyk7XG5cdFx0XHRpZiAobmFtZVBhcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZG9tYWluUGFydHMgPSBuYW1lUGFydHNbMF0uc3BsaXQoJy4nKTtcblx0XHRcdFx0aWYgKGRvbWFpblBhcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRwdWJsaXNoZXIgPSBkb21haW5QYXJ0c1tkb21haW5QYXJ0cy5sZW5ndGggLSAxXTsgLy8gQWx3YXlzIHRha2UgdGhlIGxhc3QgcGFydCBhcyBvd25lclxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWRpc3BsYXlOYW1lKSB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lID0gbmFtZVBhcnRzW25hbWVQYXJ0cy5sZW5ndGggLSAxXS5zcGxpdCgnLScpLm1hcChzID0+IHVwcGVyY2FzZUZpcnN0TGV0dGVyKHMpKS5qb2luKCcgJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlcnZlci5naXRodWJJbmZvPy5kaXNwbGF5TmFtZSkge1xuXHRcdFx0ZGlzcGxheU5hbWUgPSBzZXJ2ZXIuZ2l0aHViSW5mby5kaXNwbGF5TmFtZTtcblx0XHR9XG5cblx0XHRsZXQgaWNvbjogeyBsaWdodDogc3RyaW5nOyBkYXJrOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzZXJ2ZXIuZ2l0aHViSW5mbz8ucHJlZmVycmVkSW1hZ2UpIHtcblx0XHRcdGljb24gPSB7XG5cdFx0XHRcdGxpZ2h0OiBzZXJ2ZXIuZ2l0aHViSW5mby5wcmVmZXJyZWRJbWFnZSxcblx0XHRcdFx0ZGFyazogc2VydmVyLmdpdGh1YkluZm8ucHJlZmVycmVkSW1hZ2Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoc2VydmVyLmdpdGh1YkluZm8/Lm93bmVyQXZhdGFyVXJsKSB7XG5cdFx0XHRpY29uID0ge1xuXHRcdFx0XHRsaWdodDogc2VydmVyLmdpdGh1YkluZm8ub3duZXJBdmF0YXJVcmwsXG5cdFx0XHRcdGRhcms6IHNlcnZlci5naXRodWJJbmZvLm93bmVyQXZhdGFyVXJsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHNlcnZlci5hcGljSW5mbz8uWyd4LW1zLWljb24nXSkge1xuXHRcdFx0aWNvbiA9IHtcblx0XHRcdFx0bGlnaHQ6IHNlcnZlci5hcGljSW5mb1sneC1tcy1pY29uJ10sXG5cdFx0XHRcdGRhcms6IHNlcnZlci5hcGljSW5mb1sneC1tcy1pY29uJ11cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoc2VydmVyLmljb25zICYmIHNlcnZlci5pY29ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBsaWdodEljb24gPSBzZXJ2ZXIuaWNvbnMuZmluZChpY29uID0+IGljb24udGhlbWUgPT09ICdsaWdodCcpID8/IHNlcnZlci5pY29uc1swXTtcblx0XHRcdGNvbnN0IGRhcmtJY29uID0gc2VydmVyLmljb25zLmZpbmQoaWNvbiA9PiBpY29uLnRoZW1lID09PSAnZGFyaycpID8/IGxpZ2h0SWNvbjtcblx0XHRcdGljb24gPSB7XG5cdFx0XHRcdGxpZ2h0OiBsaWdodEljb24uc3JjLFxuXHRcdFx0XHRkYXJrOiBkYXJrSWNvbi5zcmNcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2ViVXJsID0gbWFuaWZlc3QgPyB0aGlzLmdldFdlYlVybChzZXJ2ZXIubmFtZSwgbWFuaWZlc3QpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHB1Ymxpc2hlclVybCA9IG1hbmlmZXN0ID8gdGhpcy5nZXRQdWJsaXNoZXJVcmwocHVibGlzaGVyLCBtYW5pZmVzdCkgOiB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHNlcnZlci5pZCxcblx0XHRcdG5hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRnYWxsZXJ5VXJsOiBtYW5pZmVzdD8udXJsLFxuXHRcdFx0d2ViVXJsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHNlcnZlci5kZXNjcmlwdGlvbixcblx0XHRcdHN0YXR1czogc2VydmVyLnN0YXR1cyA/PyBHYWxsZXJ5TWNwU2VydmVyU3RhdHVzLkFjdGl2ZSxcblx0XHRcdHZlcnNpb246IHNlcnZlci52ZXJzaW9uLFxuXHRcdFx0aXNMYXRlc3Q6IHNlcnZlci5yZWdpc3RyeUluZm8/LmlzTGF0ZXN0ID8/IHRydWUsXG5cdFx0XHRwdWJsaXNoRGF0ZTogc2VydmVyLnJlZ2lzdHJ5SW5mbz8ucHVibGlzaGVkQXQgPyBEYXRlLnBhcnNlKHNlcnZlci5yZWdpc3RyeUluZm8ucHVibGlzaGVkQXQpIDogdW5kZWZpbmVkLFxuXHRcdFx0bGFzdFVwZGF0ZWQ6IHNlcnZlci5naXRodWJJbmZvPy5wdXNoZWRBdCA/IERhdGUucGFyc2Uoc2VydmVyLmdpdGh1YkluZm8ucHVzaGVkQXQpIDogc2VydmVyLnJlZ2lzdHJ5SW5mbz8udXBkYXRlZEF0ID8gRGF0ZS5wYXJzZShzZXJ2ZXIucmVnaXN0cnlJbmZvLnVwZGF0ZWRBdCkgOiB1bmRlZmluZWQsXG5cdFx0XHRyZXBvc2l0b3J5VXJsOiBzZXJ2ZXIucmVwb3NpdG9yeT8udXJsLFxuXHRcdFx0cmVhZG1lOiBzZXJ2ZXIucmVhZG1lLFxuXHRcdFx0aWNvbixcblx0XHRcdHB1Ymxpc2hlcixcblx0XHRcdHB1Ymxpc2hlclVybCxcblx0XHRcdGxpY2Vuc2U6IHNlcnZlci5naXRodWJJbmZvPy5saWNlbnNlLFxuXHRcdFx0c3RhcnNDb3VudDogc2VydmVyLmdpdGh1YkluZm8/LnN0YXJnYXplckNvdW50LFxuXHRcdFx0dG9waWNzOiBzZXJ2ZXIuZ2l0aHViSW5mbz8udG9waWNzLFxuXHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRwYWNrYWdlczogc2VydmVyLnBhY2thZ2VzLFxuXHRcdFx0XHRyZW1vdGVzOiBzZXJ2ZXIucmVtb3Rlc1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHF1ZXJ5R2FsbGVyeU1jcFNlcnZlcnMocXVlcnk6IFF1ZXJ5LCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUdhbGxlcnlNY3BTZXJ2ZXJzUmVzdWx0PiB7XG5cdFx0Y29uc3QgeyBzZXJ2ZXJzLCBtZXRhZGF0YSB9ID0gYXdhaXQgdGhpcy5xdWVyeVJhd0dhbGxlcnlNY3BTZXJ2ZXJzKHF1ZXJ5LCBtY3BHYWxsZXJ5TWFuaWZlc3QsIHRva2VuKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VydmVyczogc2VydmVycy5tYXAoaXRlbSA9PiB0aGlzLnRvR2FsbGVyeU1jcFNlcnZlcihpdGVtLCBtY3BHYWxsZXJ5TWFuaWZlc3QpKSxcblx0XHRcdG1ldGFkYXRhXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcXVlcnlSYXdHYWxsZXJ5TWNwU2VydmVycyhxdWVyeTogUXVlcnksIG1jcEdhbGxlcnlNYW5pZmVzdDogSU1jcEdhbGxlcnlNYW5pZmVzdCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQ+IHtcblx0XHRjb25zdCBtY3BHYWxsZXJ5VXJsID0gdGhpcy5nZXRNY3BHYWxsZXJ5VXJsKG1jcEdhbGxlcnlNYW5pZmVzdCk7XG5cdFx0aWYgKCFtY3BHYWxsZXJ5VXJsKSB7XG5cdFx0XHRyZXR1cm4geyBzZXJ2ZXJzOiBbXSwgbWV0YWRhdGE6IHsgY291bnQ6IDAgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShtY3BHYWxsZXJ5VXJsKTtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0XHRjb25zdCBkYXRhID0gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShkYXRhKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHJlYWQgZmlsZSBmcm9tICR7dXJpfTogJHtlcnJvcn1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgdXJsID0gYCR7bWNwR2FsbGVyeVVybH0/bGltaXQ9JHtxdWVyeS5wYWdlU2l6ZX0mdmVyc2lvbj1sYXRlc3RgO1xuXHRcdGlmIChxdWVyeS5jdXJzb3IpIHtcblx0XHRcdHVybCArPSBgJmN1cnNvcj0ke3F1ZXJ5LmN1cnNvcn1gO1xuXHRcdH1cblx0XHRpZiAocXVlcnkuc2VhcmNoVGV4dCkge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGVuY29kZVVSSUNvbXBvbmVudChxdWVyeS5zZWFyY2hUZXh0KTtcblx0XHRcdHVybCArPSBgJnNlYXJjaD0ke3RleHR9YDtcblx0XHR9XG5cblx0XHRsZXQgY29udGV4dDtcblx0XHR0cnkge1xuXHRcdFx0Y29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHRcdHR5cGU6ICdHRVQnLFxuXHRcdFx0XHR1cmwsXG5cdFx0XHRcdGNhbGxTaXRlOiAnbWNwR2FsbGVyeVNlcnZpY2UucXVlcnlNY3BTZXJ2ZXJzJ1xuXHRcdFx0fSwgdG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBxdWVyeSBNQ1AgZ2FsbGVyeTogJHtlcnJvcn1gKTtcblx0XHRcdHJldHVybiB7IHNlcnZlcnM6IFtdLCBtZXRhZGF0YTogeyBjb3VudDogMCB9IH07XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHRvIHF1ZXJ5IE1DUCBnYWxsZXJ5OiBTZXJ2ZXIgcmV0dXJuZWQgJHtjb250ZXh0LnJlcy5zdGF0dXNDb2RlfWApO1xuXHRcdFx0cmV0dXJuIHsgc2VydmVyczogW10sIG1ldGFkYXRhOiB7IGNvdW50OiAwIH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gYXdhaXQgYXNKc29uKGNvbnRleHQpO1xuXG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4geyBzZXJ2ZXJzOiBbXSwgbWV0YWRhdGE6IHsgY291bnQ6IDAgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc2VyaWFsaXplTWNwU2VydmVyc1Jlc3VsdChkYXRhLCBtY3BHYWxsZXJ5TWFuaWZlc3QpO1xuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIHNlcmlhbGl6ZSBNQ1Agc2VydmVycyByZXN1bHQgZnJvbSAke21jcEdhbGxlcnlVcmx9YCwgZGF0YSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGdldE1jcFNlcnZlcihtY3BTZXJ2ZXJVcmw6IHN0cmluZywgbWNwR2FsbGVyeU1hbmlmZXN0PzogSU1jcEdhbGxlcnlNYW5pZmVzdCB8IG51bGwpOiBQcm9taXNlPElHYWxsZXJ5TWNwU2VydmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdFNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR0eXBlOiAnR0VUJyxcblx0XHRcdHVybDogbWNwU2VydmVyVXJsLFxuXHRcdFx0Y2FsbFNpdGU6ICdtY3BHYWxsZXJ5U2VydmljZS5nZXRNY3BTZXJ2ZXInXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBBIGRlZmluaXRpdmUgNDA0IG1lYW5zIHRoZSByZWdpc3RyeSBhdXRob3JpdGF0aXZlbHkgZG9lcyBub3QgY29udGFpbiB0aGlzXG5cdFx0Ly8gc2VydmVyLiBBbnkgb3RoZXIgZXJyb3Igc3RhdHVzIChlLmcuIDQwMS80MDMvNDI5LzV4eCkgaXMgdHJhbnNpZW50IG9yXG5cdFx0Ly8gdW5kZXRlcm1pbmVkIGFuZCBtdXN0IHRocm93IHNvIGNhbGxlcnMgZG8gbm90IHRyZWF0IGl0IGFzIGEgXCJub3QgZm91bmRcIi5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDA0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPj0gNDAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBNQ1Agc2VydmVyIGZyb20gJHttY3BTZXJ2ZXJVcmx9OiBzZXJ2ZXIgcmVzcG9uZGVkIHdpdGggJHtjb250ZXh0LnJlcy5zdGF0dXNDb2RlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBhc0pzb24oY29udGV4dCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBmZXRjaCBNQ1Agc2VydmVyIGZyb20gJHttY3BTZXJ2ZXJVcmx9OiBlbXB0eSByZXNwb25zZWApO1xuXHRcdH1cblxuXHRcdGlmICghbWNwR2FsbGVyeU1hbmlmZXN0KSB7XG5cdFx0XHRtY3BHYWxsZXJ5TWFuaWZlc3QgPSBhd2FpdCB0aGlzLm1jcEdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0TWNwR2FsbGVyeU1hbmlmZXN0KCk7XG5cdFx0fVxuXHRcdG1jcEdhbGxlcnlNYW5pZmVzdCA9IG1jcEdhbGxlcnlNYW5pZmVzdCAmJiBtY3BTZXJ2ZXJVcmwuc3RhcnRzV2l0aChtY3BHYWxsZXJ5TWFuaWZlc3QudXJsKSA/IG1jcEdhbGxlcnlNYW5pZmVzdCA6IG51bGw7XG5cblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLnNlcmlhbGl6ZU1jcFNlcnZlcihkYXRhLCBtY3BHYWxsZXJ5TWFuaWZlc3QpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBzZXJpYWxpemUgTUNQIHNlcnZlciBmcm9tICR7bWNwU2VydmVyVXJsfWAsIGRhdGEpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnRvR2FsbGVyeU1jcFNlcnZlcihzZXJ2ZXIsIG1jcEdhbGxlcnlNYW5pZmVzdCk7XG5cdH1cblxuXHRwcml2YXRlIHNlcmlhbGl6ZU1jcFNlcnZlcihkYXRhOiB1bmtub3duLCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QgfCBudWxsKTogSVJhd0dhbGxlcnlNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFNlcmlhbGl6ZXIobWNwR2FsbGVyeU1hbmlmZXN0KT8udG9SYXdHYWxsZXJ5TWNwU2VydmVyKGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXJpYWxpemVNY3BTZXJ2ZXJzUmVzdWx0KGRhdGE6IHVua25vd24sIG1jcEdhbGxlcnlNYW5pZmVzdDogSU1jcEdhbGxlcnlNYW5pZmVzdCB8IG51bGwpOiBJUmF3R2FsbGVyeU1jcFNlcnZlcnNSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFNlcmlhbGl6ZXIobWNwR2FsbGVyeU1hbmlmZXN0KT8udG9SYXdHYWxsZXJ5TWNwU2VydmVyUmVzdWx0KGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJpYWxpemVyKG1jcEdhbGxlcnlNYW5pZmVzdDogSU1jcEdhbGxlcnlNYW5pZmVzdCB8IG51bGwpOiBJR2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2ZXJzaW9uID0gbWNwR2FsbGVyeU1hbmlmZXN0Py52ZXJzaW9uID8/ICd2MCc7XG5cdFx0cmV0dXJuIHRoaXMuZ2FsbGVyeU1jcFNlcnZlckRhdGFTZXJpYWxpemVycy5nZXQodmVyc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIGdldE5hbWVkU2VydmVyVXJsKG5hbWU6IHN0cmluZywgbWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuYW1lZFJlc291cmNlVXJpVGVtcGxhdGUgPSBnZXRNY3BHYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShtY3BHYWxsZXJ5TWFuaWZlc3QsIE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyTmFtZWRSZXNvdXJjZVVyaSk7XG5cdFx0aWYgKCFuYW1lZFJlc291cmNlVXJpVGVtcGxhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmb3JtYXQyKG5hbWVkUmVzb3VyY2VVcmlUZW1wbGF0ZSwgeyBuYW1lIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJ2ZXJJZFVybChpZDogc3RyaW5nLCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc291cmNlVXJpVGVtcGxhdGUgPSBnZXRNY3BHYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShtY3BHYWxsZXJ5TWFuaWZlc3QsIE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVySWRVcmkpO1xuXHRcdGlmICghcmVzb3VyY2VVcmlUZW1wbGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGZvcm1hdDIocmVzb3VyY2VVcmlUZW1wbGF0ZSwgeyBpZCB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGF0ZXN0U2VydmVyVmVyc2lvblVybChuYW1lOiBzdHJpbmcsIG1jcEdhbGxlcnlNYW5pZmVzdDogSU1jcEdhbGxlcnlNYW5pZmVzdCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGF0ZXN0VmVyc2lvblJlc291cmNlVXJpVGVtcGxhdGUgPSBnZXRNY3BHYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShtY3BHYWxsZXJ5TWFuaWZlc3QsIE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyTGF0ZXN0VmVyc2lvblVyaSk7XG5cdFx0aWYgKCFsYXRlc3RWZXJzaW9uUmVzb3VyY2VVcmlUZW1wbGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGZvcm1hdDIobGF0ZXN0VmVyc2lvblJlc291cmNlVXJpVGVtcGxhdGUsIHsgbmFtZTogZW5jb2RlVVJJQ29tcG9uZW50KG5hbWUpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXZWJVcmwobmFtZTogc3RyaW5nLCBtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc291cmNlVXJpVGVtcGxhdGUgPSBnZXRNY3BHYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShtY3BHYWxsZXJ5TWFuaWZlc3QsIE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyV2ViVXJpKTtcblx0XHRpZiAoIXJlc291cmNlVXJpVGVtcGxhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmb3JtYXQyKHJlc291cmNlVXJpVGVtcGxhdGUsIHsgbmFtZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHVibGlzaGVyVXJsKG5hbWU6IHN0cmluZywgbWNwR2FsbGVyeU1hbmlmZXN0OiBJTWNwR2FsbGVyeU1hbmlmZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXNvdXJjZVVyaVRlbXBsYXRlID0gZ2V0TWNwR2FsbGVyeU1hbmlmZXN0UmVzb3VyY2VVcmkobWNwR2FsbGVyeU1hbmlmZXN0LCBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLlB1Ymxpc2hlclVyaVRlbXBsYXRlKTtcblx0XHRpZiAoIXJlc291cmNlVXJpVGVtcGxhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmb3JtYXQyKHJlc291cmNlVXJpVGVtcGxhdGUsIHsgbmFtZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWNwR2FsbGVyeVVybChtY3BHYWxsZXJ5TWFuaWZlc3Q6IElNY3BHYWxsZXJ5TWFuaWZlc3QpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRNY3BHYWxsZXJ5TWFuaWZlc3RSZXNvdXJjZVVyaShtY3BHYWxsZXJ5TWFuaWZlc3QsIE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyc1F1ZXJ5U2VydmljZSk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLDRCQUE0QjtBQUM5QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxRQUFRLFFBQVEsV0FBVyx1QkFBdUI7QUFDM0QsU0FBUyx3QkFBK0wseUJBQXlCLGNBQWdFLHFCQUFxQjtBQUN0VCxTQUFTLDRCQUE0QiwwQkFBMEIsa0NBQWtDLDhCQUFtRDtBQUVwSixTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUyxVQUFVLGdCQUFnQjtBQWlGbkMsSUFBVyxlQUFYLGtCQUFXQSxrQkFBWDtBQUNDLEVBQUFBLGNBQUEsU0FBTTtBQUNOLEVBQUFBLGNBQUEsVUFBTztBQUNQLEVBQUFBLGNBQUEsU0FBTTtBQUNOLEVBQUFBLGNBQUEsU0FBTTtBQUNOLEVBQUFBLGNBQUEsVUFBTztBQUxHLFNBQUFBO0FBQUEsR0FBQTtBQVFYLElBQVcsWUFBWCxrQkFBV0MsZUFBWDtBQUNDLEVBQUFBLFdBQUEsV0FBUTtBQUNSLEVBQUFBLFdBQUEsVUFBTztBQUZHLFNBQUFBO0FBQUEsR0FBQTtBQUtYLElBQVU7QUFBQSxDQUFWLENBQVVDLHdDQUFWO0FBRVEsRUFBTUEsb0NBQUEsVUFBVTtBQUNoQixFQUFNQSxvQ0FBQSxTQUFTO0FBQUEsRUFrSXRCLE1BQU0sV0FBc0Q7QUFBQSxJQUVwRCw0QkFBNEIsT0FBeUQ7QUFDM0YsVUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFlBQVksQ0FBQyxNQUFNLFFBQVMsTUFBcUMsT0FBTyxHQUFHO0FBQ3pHLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxPQUFtQztBQUV6QyxZQUFNLFVBQWtDLENBQUM7QUFDekMsaUJBQVcsVUFBVSxLQUFLLFNBQVM7QUFDbEMsY0FBTSxZQUFZLEtBQUssc0JBQXNCLE1BQU07QUFDbkQsWUFBSSxDQUFDLFdBQVc7QUFDZixpQkFBTztBQUFBLFFBQ1I7QUFDQSxnQkFBUSxLQUFLLFNBQVM7QUFBQSxNQUN2QjtBQUVBLGFBQU87QUFBQSxRQUNOLFVBQVU7QUFBQSxVQUNULE9BQU8sS0FBSyxTQUFTLFNBQVM7QUFBQSxVQUM5QixZQUFZLEtBQUssVUFBVTtBQUFBLFFBQzVCO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFFTyxzQkFBc0IsT0FBa0Q7QUFDOUUsVUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDeEMsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLE9BQTRCO0FBRWxDLFVBQ0UsQ0FBQyxLQUFLLFFBQVEsQ0FBQyxTQUFTLEtBQUssSUFBSSxNQUM5QixDQUFDLEtBQUssZUFBZSxDQUFDLFNBQVMsS0FBSyxXQUFXLE9BQy9DLENBQUMsS0FBSyxXQUFXLENBQUMsU0FBUyxLQUFLLE9BQU8sSUFDMUM7QUFDRCxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksS0FBSyxXQUFXLEtBQUssWUFBWUEsb0NBQW1DLFFBQVE7QUFDL0UsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLGVBQWUsS0FBSyxRQUFRLDJDQUEyQztBQUU3RSxlQUFTLG1CQUFtQkMsUUFBa0Q7QUFDN0UsZUFBTztBQUFBLFVBQ04sR0FBR0E7QUFBQSxVQUNILFlBQVlBLE9BQU07QUFBQSxVQUNsQixVQUFVQSxPQUFNO0FBQUEsUUFDakI7QUFBQSxNQUNEO0FBRUEsZUFBUyxpQkFBaUIsV0FBc0Y7QUFDL0csY0FBTSxTQUEwQyxDQUFDO0FBQ2pELG1CQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssT0FBTyxRQUFRLFNBQVMsR0FBRztBQUNyRCxpQkFBTyxHQUFHLElBQUksbUJBQW1CLEtBQUs7QUFBQSxRQUN2QztBQUNBLGVBQU87QUFBQSxNQUNSO0FBRUEsZUFBUyxzQkFBc0IsS0FBc0Q7QUFDcEYsWUFBSSxJQUFJLFNBQVMsY0FBYztBQUM5QixpQkFBTztBQUFBLFlBQ04sR0FBRztBQUFBLFlBQ0gsV0FBVyxJQUFJO0FBQUEsWUFDZixZQUFZLElBQUk7QUFBQSxZQUNoQixZQUFZLElBQUk7QUFBQSxZQUNoQixVQUFVLElBQUk7QUFBQSxZQUNkLFdBQVcsSUFBSSxZQUFZLGlCQUFpQixJQUFJLFNBQVMsSUFBSTtBQUFBLFVBQzlEO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxVQUNOLEdBQUc7QUFBQSxVQUNILFlBQVksSUFBSTtBQUFBLFVBQ2hCLFlBQVksSUFBSTtBQUFBLFVBQ2hCLFVBQVUsSUFBSTtBQUFBLFVBQ2QsV0FBVyxJQUFJLFlBQVksaUJBQWlCLElBQUksU0FBUyxJQUFJO0FBQUEsUUFDOUQ7QUFBQSxNQUNEO0FBRUEsZUFBUyxxQkFBcUJBLFFBQWtFO0FBQy9GLGVBQU87QUFBQSxVQUNOLEdBQUdBO0FBQUEsVUFDSCxZQUFZQSxPQUFNO0FBQUEsVUFDbEIsVUFBVUEsT0FBTTtBQUFBLFVBQ2hCLFdBQVdBLE9BQU0sWUFBWSxpQkFBaUJBLE9BQU0sU0FBUyxJQUFJO0FBQUEsUUFDbEU7QUFBQSxNQUNEO0FBRUEsZUFBUyxpQkFBaUJBLFFBQXVDO0FBQ2hFLGdCQUFRQSxPQUFNLE1BQU07QUFBQSxVQUNuQixLQUFLO0FBQ0osbUJBQU87QUFBQSxjQUNOLE1BQU0sY0FBYztBQUFBLFlBQ3JCO0FBQUEsVUFDRCxLQUFLO0FBQ0osbUJBQU87QUFBQSxjQUNOLE1BQU0sY0FBYztBQUFBLGNBQ3BCLEtBQUtBLE9BQU07QUFBQSxjQUNYLFNBQVNBLE9BQU0sU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFlBQ2pEO0FBQUEsVUFDRCxLQUFLO0FBQ0osbUJBQU87QUFBQSxjQUNOLE1BQU0sY0FBYztBQUFBLGNBQ3BCLEtBQUtBLE9BQU07QUFBQSxjQUNYLFNBQVNBLE9BQU0sU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFlBQ2pEO0FBQUEsVUFDRDtBQUNDLG1CQUFPO0FBQUEsY0FDTixNQUFNLGNBQWM7QUFBQSxZQUNyQjtBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBRUEsZUFBUyxvQkFBb0JBLFFBQTZCO0FBQ3pELGdCQUFRQSxRQUFPO0FBQUEsVUFDZCxLQUFLO0FBQ0osbUJBQU8sYUFBYTtBQUFBLFVBQ3JCLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFDSixtQkFBTyxhQUFhO0FBQUEsVUFDckIsS0FBSztBQUNKLG1CQUFPLGFBQWE7QUFBQSxVQUNyQixLQUFLO0FBQ0osbUJBQU8sYUFBYTtBQUFBLFVBQ3JCLEtBQUs7QUFDSixtQkFBTyxhQUFhO0FBQUEsVUFDckI7QUFDQyxtQkFBTyxhQUFhO0FBQUEsUUFDdEI7QUFBQSxNQUNEO0FBRUEsWUFBTSxhQUF3QyxLQUFLLE1BQU0scURBQXFELEdBQUc7QUFFakgsYUFBTztBQUFBLFFBQ04sSUFBSSxhQUFhO0FBQUEsUUFDakIsTUFBTSxLQUFLO0FBQUEsUUFDWCxhQUFhLEtBQUs7QUFBQSxRQUNsQixZQUFZLEtBQUssYUFBYTtBQUFBLFVBQzdCLEtBQUssS0FBSyxXQUFXO0FBQUEsVUFDckIsUUFBUSxLQUFLLFdBQVc7QUFBQSxVQUN4QixJQUFJLEtBQUssV0FBVztBQUFBLFFBQ3JCLElBQUk7QUFBQSxRQUNKLFFBQVEsS0FBSyxZQUFZO0FBQUEsUUFDekIsU0FBUyxLQUFLO0FBQUEsUUFDZCxXQUFXLEtBQUs7QUFBQSxRQUNoQixXQUFXLEtBQUs7QUFBQSxRQUNoQixVQUFVLEtBQUssVUFBVSxJQUF1QixRQUFNO0FBQUEsVUFDckQsWUFBWSxFQUFFLGNBQWMsRUFBRTtBQUFBLFVBQzlCLGNBQWMsb0JBQW9CLEVBQUUsaUJBQWlCLEVBQUUsYUFBYTtBQUFBLFVBQ3BFLFNBQVMsRUFBRTtBQUFBLFVBQ1gsWUFBWSxFQUFFO0FBQUEsVUFDZCxpQkFBaUIsRUFBRTtBQUFBLFVBQ25CLFdBQVcsRUFBRSxZQUFZLGlCQUFpQixFQUFFLFNBQVMsSUFBSSxFQUFFLE1BQU0sY0FBYyxNQUFNO0FBQUEsVUFDckYsa0JBQWtCLEVBQUUsbUJBQW1CLElBQUkscUJBQXFCO0FBQUEsVUFDaEUsYUFBYSxFQUFFO0FBQUEsVUFDZixrQkFBa0IsRUFBRSxtQkFBbUIsSUFBSSxxQkFBcUI7QUFBQSxVQUNoRSxzQkFBc0IsRUFBRSx1QkFBdUIsSUFBSSxvQkFBb0I7QUFBQSxRQUN4RSxFQUFFO0FBQUEsUUFDRixTQUFTLEtBQUssU0FBUyxJQUFJLFlBQVU7QUFDcEMsZ0JBQU0sT0FBNkIsT0FBUSxRQUFvQyxPQUFRLGtCQUE4QyxPQUFRO0FBQzdJLGlCQUFPO0FBQUEsWUFDTixNQUFNLFNBQVMsY0FBYyxNQUFNLGNBQWMsTUFBTSxjQUFjO0FBQUEsWUFDckUsS0FBSyxPQUFPO0FBQUEsWUFDWixTQUFTLE9BQU8sU0FBUyxJQUFJLG9CQUFvQjtBQUFBLFVBQ2xEO0FBQUEsUUFDRCxDQUFDO0FBQUEsUUFDRCxjQUFjO0FBQUEsVUFDYixVQUFVLGFBQWE7QUFBQSxVQUN2QixhQUFhLGFBQWE7QUFBQSxVQUMxQixXQUFXLGFBQWE7QUFBQSxRQUN6QjtBQUFBLFFBQ0EsWUFBWSxhQUFhO0FBQUEsVUFDeEIsTUFBTSxXQUFXO0FBQUEsVUFDakIsZUFBZSxXQUFXO0FBQUEsVUFDMUIsYUFBYSxXQUFXO0FBQUEsVUFDeEIsa0JBQWtCLFdBQVc7QUFBQSxVQUM3QixTQUFTLFdBQVc7QUFBQSxVQUNwQixtQkFBbUIsV0FBVztBQUFBLFVBQzlCLGdCQUFnQixXQUFXO0FBQUEsVUFDM0IsaUJBQWlCLFdBQVc7QUFBQSxVQUM1QixzQkFBc0IsV0FBVztBQUFBLFVBQ2pDLFVBQVUsV0FBVztBQUFBLFVBQ3JCLGdCQUFnQixXQUFXO0FBQUEsVUFDM0IsUUFBUSxXQUFXO0FBQUEsVUFDbkIsMEJBQTBCLFdBQVc7QUFBQSxRQUN0QyxJQUFJO0FBQUEsTUFDTDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRU8sRUFBTUQsb0NBQUEsYUFBYSxJQUFJLFdBQVc7QUFBQSxHQXpVaEM7QUE0VVYsSUFBVTtBQUFBLENBQVYsQ0FBVUUsaUNBQVY7QUFFUSxFQUFNQSw2QkFBQSxVQUFVO0FBQUEsRUE2R3ZCLE1BQU0sV0FBc0Q7QUFBQSxJQUVwRCw0QkFBNEIsT0FBeUQ7QUFDM0YsVUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFlBQVksQ0FBQyxNQUFNLFFBQVMsTUFBcUMsT0FBTyxHQUFHO0FBQ3pHLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxPQUFtQztBQUV6QyxZQUFNLFVBQWtDLENBQUM7QUFDekMsaUJBQVcsVUFBVSxLQUFLLFNBQVM7QUFDbEMsY0FBTSxZQUFZLEtBQUssc0JBQXNCLE1BQU07QUFDbkQsWUFBSSxDQUFDLFdBQVc7QUFDZixjQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCLG1CQUFPO0FBQUEsVUFDUixPQUFPO0FBQ047QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLGdCQUFRLEtBQUssU0FBUztBQUFBLE1BQ3ZCO0FBRUEsYUFBTztBQUFBLFFBQ04sVUFBVSxLQUFLO0FBQUEsUUFDZjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFFTyxzQkFBc0IsT0FBa0Q7QUFDOUUsVUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDeEMsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLE9BQWdDO0FBRXRDLFVBQ0UsQ0FBQyxLQUFLLFVBQVUsQ0FBQyxTQUFTLEtBQUssTUFBTSxNQUNsQyxDQUFDLEtBQUssT0FBTyxRQUFRLENBQUMsU0FBUyxLQUFLLE9BQU8sSUFBSSxPQUMvQyxDQUFDLEtBQUssT0FBTyxlQUFlLENBQUMsU0FBUyxLQUFLLE9BQU8sV0FBVyxPQUM3RCxDQUFDLEtBQUssT0FBTyxXQUFXLENBQUMsU0FBUyxLQUFLLE9BQU8sT0FBTyxJQUN4RDtBQUNELGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxFQUFFLDZDQUE2QyxjQUFjLEdBQUcsU0FBUyxJQUFJLEtBQUs7QUFDeEYsWUFBTSxhQUFhLEtBQUssT0FBTyxRQUFRLHFEQUFxRCxHQUFHO0FBRS9GLGFBQU87QUFBQSxRQUNOLE1BQU0sS0FBSyxPQUFPO0FBQUEsUUFDbEIsYUFBYSxLQUFLLE9BQU87QUFBQSxRQUN6QixTQUFTLEtBQUssT0FBTztBQUFBLFFBQ3JCLE9BQU8sS0FBSyxPQUFPO0FBQUEsUUFDbkIsWUFBWSxLQUFLLE9BQU8sYUFBYTtBQUFBLFVBQ3BDLEtBQUssS0FBSyxPQUFPLFdBQVc7QUFBQSxVQUM1QixRQUFRLEtBQUssT0FBTyxXQUFXO0FBQUEsVUFDL0IsSUFBSSxLQUFLLE9BQU8sV0FBVztBQUFBLFFBQzVCLElBQUk7QUFBQSxRQUNKLFFBQVEsWUFBWTtBQUFBLFFBQ3BCLE9BQU8sS0FBSyxPQUFPO0FBQUEsUUFDbkIsWUFBWSxLQUFLLE9BQU87QUFBQSxRQUN4QixVQUFVLEtBQUssT0FBTztBQUFBLFFBQ3RCLFNBQVMsS0FBSyxPQUFPO0FBQUEsUUFDckIsUUFBUSxjQUFjO0FBQUEsUUFDdEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVPLEVBQU1BLDZCQUFBLGFBQWEsSUFBSSxXQUFXO0FBQUEsR0FyTGhDO0FBd0xWLElBQVU7QUFBQSxDQUFWLENBQVVDLCtCQUFWO0FBRVEsRUFBTUEsMkJBQUEsVUFBVTtBQUFBLEVBRXZCLE1BQU0sV0FBc0Q7QUFBQSxJQUkzRCxjQUFjO0FBRmQsV0FBaUIsa0NBQXFFLENBQUM7QUFHdEYsV0FBSyxnQ0FBZ0MsS0FBSyw0QkFBNEIsVUFBVTtBQUNoRixXQUFLLGdDQUFnQyxLQUFLLG1DQUFtQyxVQUFVO0FBQUEsSUFDeEY7QUFBQSxJQUVPLDRCQUE0QixPQUF5RDtBQUMzRixpQkFBVyxjQUFjLEtBQUssaUNBQWlDO0FBQzlELGNBQU0sU0FBUyxXQUFXLDRCQUE0QixLQUFLO0FBQzNELFlBQUksUUFBUTtBQUNYLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUFBLElBRU8sc0JBQXNCLE9BQWtEO0FBQzlFLGlCQUFXLGNBQWMsS0FBSyxpQ0FBaUM7QUFDOUQsY0FBTSxTQUFTLFdBQVcsc0JBQXNCLEtBQUs7QUFDckQsWUFBSSxRQUFRO0FBQ1gsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUVPLEVBQU1BLDJCQUFBLGFBQWEsSUFBSSxXQUFXO0FBQUEsR0FsQ2hDO0FBcUNWLE1BQU0sa0JBQWtCO0FBUXhCLE1BQU0sb0JBQWlDO0FBQUEsRUFDdEMsVUFBVTtBQUNYO0FBRUEsTUFBTSxNQUFNO0FBQUEsRUFFWCxZQUFvQixRQUFRLG1CQUFtQjtBQUEzQjtBQUFBLEVBQTZCO0FBQUEsRUFFakQsSUFBSSxXQUFtQjtBQUFFLFdBQU8sS0FBSyxNQUFNO0FBQUEsRUFBVTtBQUFBLEVBQ3JELElBQUksYUFBaUM7QUFBRSxXQUFPLEtBQUssTUFBTTtBQUFBLEVBQVk7QUFBQSxFQUNyRSxJQUFJLFNBQTZCO0FBQUUsV0FBTyxLQUFLLE1BQU07QUFBQSxFQUFRO0FBQUEsRUFFN0QsU0FBUyxRQUFnQixXQUFtQixLQUFLLFVBQWlCO0FBQ2pFLFdBQU8sSUFBSSxNQUFNLEVBQUUsR0FBRyxLQUFLLE9BQU8sVUFBVSxPQUFPLENBQUM7QUFBQSxFQUNyRDtBQUFBLEVBRUEsZUFBZSxZQUF1QztBQUNyRCxXQUFPLElBQUksTUFBTSxFQUFFLEdBQUcsS0FBSyxPQUFPLFdBQVcsQ0FBQztBQUFBLEVBQy9DO0FBQ0Q7QUFFTyxJQUFNLG9CQUFOLGNBQWdDLFdBQXlDO0FBQUEsRUFNL0UsWUFDbUMsZ0JBQ0gsYUFDRCxZQUNlLDJCQUM1QztBQUNELFVBQU07QUFMNEI7QUFDSDtBQUNEO0FBQ2U7QUFHN0MsU0FBSyxrQ0FBa0Msb0JBQUksSUFBSTtBQUMvQyxTQUFLLGdDQUFnQyxJQUFJLDBCQUEwQixTQUFTLDBCQUEwQixVQUFVO0FBQ2hILFNBQUssZ0NBQWdDLElBQUksNEJBQTRCLFNBQVMsNEJBQTRCLFVBQVU7QUFBQSxFQUNySDtBQUFBLEVBRUEsWUFBcUI7QUFDcEIsV0FBTyxLQUFLLDBCQUEwQiw2QkFBNkIseUJBQXlCO0FBQUEsRUFDN0Y7QUFBQSxFQUVBLE1BQU0sTUFBTSxTQUF5QixRQUEyQixrQkFBa0IsTUFBbUQ7QUFDcEksVUFBTSxxQkFBcUIsTUFBTSxLQUFLLDBCQUEwQixzQkFBc0I7QUFDdEYsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QixhQUFPO0FBQUEsUUFDTixXQUFXLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxNQUFNO0FBQUEsUUFDdkMsYUFBYSxhQUFhLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxNQUFNO0FBQUEsTUFDdkQ7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRLElBQUksTUFBTTtBQUN0QixRQUFJLFNBQVMsTUFBTTtBQUNsQixjQUFRLE1BQU0sZUFBZSxRQUFRLEtBQUssS0FBSyxDQUFDO0FBQUEsSUFDakQ7QUFFQSxVQUFNLEVBQUUsU0FBUyxTQUFTLElBQUksTUFBTSxLQUFLLHVCQUF1QixPQUFPLG9CQUFvQixLQUFLO0FBRWhHLFFBQUksZ0JBQWdCLFNBQVM7QUFDN0IsV0FBTztBQUFBLE1BQ04sV0FBVyxFQUFFLE9BQU8sU0FBUyxTQUFTLENBQUMsQ0FBQyxTQUFTLFdBQVc7QUFBQSxNQUM1RCxhQUFhLE9BQU8sT0FBc0U7QUFDekYsWUFBSSxHQUFHLHlCQUF5QjtBQUMvQixnQkFBTSxJQUFJLGtCQUFrQjtBQUFBLFFBQzdCO0FBQ0EsWUFBSSxDQUFDLGVBQWU7QUFDbkIsaUJBQU8sRUFBRSxPQUFPLENBQUMsR0FBRyxTQUFTLE1BQU07QUFBQSxRQUNwQztBQUNBLGNBQU0sRUFBRSxTQUFBQyxVQUFTLFVBQVUsYUFBYSxJQUFJLE1BQU0sS0FBSyx1QkFBdUIsTUFBTSxTQUFTLGFBQWEsRUFBRSxlQUFlLE1BQVMsR0FBRyxvQkFBb0IsRUFBRTtBQUM3Six3QkFBZ0IsYUFBYTtBQUM3QixlQUFPLEVBQUUsT0FBT0EsVUFBUyxTQUFTLENBQUMsQ0FBQyxhQUFhLFdBQVc7QUFBQSxNQUM3RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLHlCQUF5QixPQUFzRTtBQUNwRyxVQUFNLFdBQVcsTUFBTSxLQUFLLDZCQUE2QixLQUFLO0FBQzlELFVBQU0sYUFBa0MsQ0FBQztBQUN6QyxlQUFXLFVBQVUsU0FBUyxPQUFPLEdBQUc7QUFDdkMsVUFBSSxPQUFPLFdBQVcsd0JBQXdCLE9BQU87QUFDcEQsbUJBQVcsS0FBSyxPQUFPLE1BQU07QUFBQSxNQUM5QjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSw2QkFBNkIsT0FBOEY7QUFDaEksVUFBTSxTQUFTLG9CQUFJLElBQTRDO0FBQy9ELFVBQU0scUJBQXFCLE1BQU0sS0FBSywwQkFBMEIsc0JBQXNCO0FBQ3RGLFFBQUksQ0FBQyxvQkFBb0I7QUFHeEIsaUJBQVcsUUFBUSxPQUFPO0FBQ3pCLGVBQU8sSUFBSSxLQUFLLE1BQU0sRUFBRSxRQUFRLHdCQUF3QixPQUFPLENBQUM7QUFBQSxNQUNqRTtBQUNBLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxRQUFRLElBQUksTUFBTSxJQUFJLE9BQU0sU0FBUTtBQUN6QyxVQUFJO0FBQ0gsY0FBTSxZQUFZLE1BQU0sS0FBSyxtQkFBbUIsTUFBTSxrQkFBa0I7QUFDeEUsZUFBTyxJQUFJLEtBQUssTUFBTSxZQUNuQixFQUFFLFFBQVEsd0JBQXdCLE9BQU8sUUFBUSxVQUFVLElBQzNELEVBQUUsUUFBUSx3QkFBd0IsU0FBUyxDQUFDO0FBQUEsTUFDaEQsU0FBUyxPQUFPO0FBQ2YsYUFBSyxXQUFXLEtBQUssaUNBQWlDLEtBQUssSUFBSSxtQkFBbUIsS0FBSyxFQUFFO0FBQ3pGLGVBQU8sSUFBSSxLQUFLLE1BQU0sRUFBRSxRQUFRLHdCQUF3QixPQUFPLENBQUM7QUFBQSxNQUNqRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLEVBQUUsTUFBTSxHQUFHLEdBQWtDLG9CQUFpRjtBQUM5SixVQUFNLE9BQU87QUFBQSxNQUNaLEtBQUssMEJBQTBCLE1BQU0sa0JBQWtCO0FBQUEsTUFDdkQsS0FBSyxrQkFBa0IsTUFBTSxrQkFBa0I7QUFBQSxNQUMvQyxLQUFLLEtBQUssZUFBZSxJQUFJLGtCQUFrQixJQUFJO0FBQUEsSUFDcEQ7QUFFQSxRQUFJLFlBQVk7QUFDaEIsUUFBSTtBQUNKLGVBQVcsT0FBTyxNQUFNO0FBQ3ZCLFVBQUksQ0FBQyxLQUFLO0FBQ1Q7QUFBQSxNQUNEO0FBQ0Esa0JBQVk7QUFDWixVQUFJO0FBQ0gsY0FBTSxZQUFZLE1BQU0sS0FBSyxhQUFhLEdBQUc7QUFDN0MsWUFBSSxXQUFXO0FBQ2QsY0FBSSxVQUFVLFNBQVMsTUFBTTtBQUM1QixtQkFBTztBQUFBLFVBQ1I7QUFDQSxzQkFBWSxJQUFJLE1BQU0sMEJBQTBCLElBQUksZUFBZSxVQUFVLElBQUksR0FBRztBQUFBLFFBQ3JGO0FBQUEsTUFDRCxTQUFTLE9BQU87QUFHZixvQkFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBTUEsUUFBSSxDQUFDLFdBQVc7QUFDZixZQUFNLElBQUksTUFBTSw4QkFBOEIsSUFBSSxvREFBb0Q7QUFBQSxJQUN2RztBQUNBLFFBQUksY0FBYyxRQUFXO0FBQzVCLFlBQU07QUFBQSxJQUNQO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sVUFBVSxTQUE0QixPQUEyQztBQUN0RixVQUFNLFlBQVksUUFBUTtBQUMxQixRQUFJLENBQUMsV0FBVztBQUNmLGFBQU8sUUFBUSxRQUFRLFNBQVMsWUFBWSxxQkFBcUIsQ0FBQztBQUFBLElBQ25FO0FBRUEsVUFBTSxNQUFNLElBQUksTUFBTSxTQUFTO0FBQy9CLFFBQUksSUFBSSxXQUFXLFFBQVEsTUFBTTtBQUNoQyxVQUFJO0FBQ0gsY0FBTSxVQUFVLE1BQU0sS0FBSyxZQUFZLFNBQVMsR0FBRztBQUNuRCxlQUFPLFFBQVEsTUFBTSxTQUFTO0FBQUEsTUFDL0IsU0FBUyxPQUFPO0FBQ2YsYUFBSyxXQUFXLE1BQU0sNEJBQTRCLEdBQUcsS0FBSyxLQUFLLEVBQUU7QUFBQSxNQUNsRTtBQUFBLElBQ0Q7QUFFQSxRQUFJLElBQUksY0FBYyw2QkFBNkI7QUFDbEQsYUFBTyxJQUFJLGVBQWUsU0FBUyx3QkFBd0IsMERBQTBELFNBQVMsQ0FBQyxFQUFFO0FBQUEsSUFDbEk7QUFFQSxVQUFNLFVBQVUsTUFBTSxLQUFLLGVBQWUsUUFBUTtBQUFBLE1BQ2pELE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxNQUNMLFVBQVU7QUFBQSxJQUNYLEdBQUcsS0FBSztBQUVSLFVBQU0sU0FBUyxNQUFNLE9BQU8sT0FBTztBQUNuQyxRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxNQUFNLCtCQUErQixTQUFTLEVBQUU7QUFBQSxJQUMzRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxtQkFBbUIsUUFBOEIsVUFBeUQ7QUFDakgsUUFBSSxZQUFZO0FBQ2hCLFFBQUksY0FBYyxPQUFPO0FBRXpCLFFBQUksT0FBTyxZQUFZLE1BQU07QUFDNUIsVUFBSSxDQUFDLGFBQWE7QUFDakIsc0JBQWMsT0FBTyxXQUFXLEtBQUssTUFBTSxHQUFHLEVBQUUsSUFBSSxPQUFLLEVBQUUsWUFBWSxNQUFNLFFBQVEsUUFBUSxFQUFFLFlBQVksTUFBTSxXQUFXLFdBQVcscUJBQXFCLENBQUMsQ0FBQyxFQUFFLEtBQUssR0FBRztBQUFBLE1BQ3pLO0FBQ0Esa0JBQVksT0FBTyxXQUFXLGNBQWMsTUFBTSxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQ3pELE9BQU87QUFDTixZQUFNLFlBQVksT0FBTyxLQUFLLE1BQU0sR0FBRztBQUN2QyxVQUFJLFVBQVUsU0FBUyxHQUFHO0FBQ3pCLGNBQU0sY0FBYyxVQUFVLENBQUMsRUFBRSxNQUFNLEdBQUc7QUFDMUMsWUFBSSxZQUFZLFNBQVMsR0FBRztBQUMzQixzQkFBWSxZQUFZLFlBQVksU0FBUyxDQUFDO0FBQUEsUUFDL0M7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLGFBQWE7QUFDakIsc0JBQWMsVUFBVSxVQUFVLFNBQVMsQ0FBQyxFQUFFLE1BQU0sR0FBRyxFQUFFLElBQUksT0FBSyxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHO0FBQUEsTUFDcEc7QUFBQSxJQUNEO0FBRUEsUUFBSSxPQUFPLFlBQVksYUFBYTtBQUNuQyxvQkFBYyxPQUFPLFdBQVc7QUFBQSxJQUNqQztBQUVBLFFBQUk7QUFFSixRQUFJLE9BQU8sWUFBWSxnQkFBZ0I7QUFDdEMsYUFBTztBQUFBLFFBQ04sT0FBTyxPQUFPLFdBQVc7QUFBQSxRQUN6QixNQUFNLE9BQU8sV0FBVztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxXQUVTLE9BQU8sWUFBWSxnQkFBZ0I7QUFDM0MsYUFBTztBQUFBLFFBQ04sT0FBTyxPQUFPLFdBQVc7QUFBQSxRQUN6QixNQUFNLE9BQU8sV0FBVztBQUFBLE1BQ3pCO0FBQUEsSUFDRCxXQUVTLE9BQU8sV0FBVyxXQUFXLEdBQUc7QUFDeEMsYUFBTztBQUFBLFFBQ04sT0FBTyxPQUFPLFNBQVMsV0FBVztBQUFBLFFBQ2xDLE1BQU0sT0FBTyxTQUFTLFdBQVc7QUFBQSxNQUNsQztBQUFBLElBQ0QsV0FFUyxPQUFPLFNBQVMsT0FBTyxNQUFNLFNBQVMsR0FBRztBQUNqRCxZQUFNLFlBQVksT0FBTyxNQUFNLEtBQUssQ0FBQUMsVUFBUUEsTUFBSyxVQUFVLE9BQU8sS0FBSyxPQUFPLE1BQU0sQ0FBQztBQUNyRixZQUFNLFdBQVcsT0FBTyxNQUFNLEtBQUssQ0FBQUEsVUFBUUEsTUFBSyxVQUFVLE1BQU0sS0FBSztBQUNyRSxhQUFPO0FBQUEsUUFDTixPQUFPLFVBQVU7QUFBQSxRQUNqQixNQUFNLFNBQVM7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsV0FBVyxLQUFLLFVBQVUsT0FBTyxNQUFNLFFBQVEsSUFBSTtBQUNsRSxVQUFNLGVBQWUsV0FBVyxLQUFLLGdCQUFnQixXQUFXLFFBQVEsSUFBSTtBQUU1RSxXQUFPO0FBQUEsTUFDTixJQUFJLE9BQU87QUFBQSxNQUNYLE1BQU0sT0FBTztBQUFBLE1BQ2I7QUFBQSxNQUNBLFlBQVksVUFBVTtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxhQUFhLE9BQU87QUFBQSxNQUNwQixRQUFRLE9BQU8sVUFBVSx1QkFBdUI7QUFBQSxNQUNoRCxTQUFTLE9BQU87QUFBQSxNQUNoQixVQUFVLE9BQU8sY0FBYyxZQUFZO0FBQUEsTUFDM0MsYUFBYSxPQUFPLGNBQWMsY0FBYyxLQUFLLE1BQU0sT0FBTyxhQUFhLFdBQVcsSUFBSTtBQUFBLE1BQzlGLGFBQWEsT0FBTyxZQUFZLFdBQVcsS0FBSyxNQUFNLE9BQU8sV0FBVyxRQUFRLElBQUksT0FBTyxjQUFjLFlBQVksS0FBSyxNQUFNLE9BQU8sYUFBYSxTQUFTLElBQUk7QUFBQSxNQUNqSyxlQUFlLE9BQU8sWUFBWTtBQUFBLE1BQ2xDLFFBQVEsT0FBTztBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsU0FBUyxPQUFPLFlBQVk7QUFBQSxNQUM1QixZQUFZLE9BQU8sWUFBWTtBQUFBLE1BQy9CLFFBQVEsT0FBTyxZQUFZO0FBQUEsTUFDM0IsZUFBZTtBQUFBLFFBQ2QsVUFBVSxPQUFPO0FBQUEsUUFDakIsU0FBUyxPQUFPO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyx1QkFBdUIsT0FBYyxvQkFBeUMsT0FBNkQ7QUFDeEosVUFBTSxFQUFFLFNBQVMsU0FBUyxJQUFJLE1BQU0sS0FBSywwQkFBMEIsT0FBTyxvQkFBb0IsS0FBSztBQUNuRyxXQUFPO0FBQUEsTUFDTixTQUFTLFFBQVEsSUFBSSxVQUFRLEtBQUssbUJBQW1CLE1BQU0sa0JBQWtCLENBQUM7QUFBQSxNQUM5RTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixPQUFjLG9CQUF5QyxPQUFnRTtBQUM5SixVQUFNLGdCQUFnQixLQUFLLGlCQUFpQixrQkFBa0I7QUFDOUQsUUFBSSxDQUFDLGVBQWU7QUFDbkIsYUFBTyxFQUFFLFNBQVMsQ0FBQyxHQUFHLFVBQVUsRUFBRSxPQUFPLEVBQUUsRUFBRTtBQUFBLElBQzlDO0FBRUEsVUFBTSxNQUFNLElBQUksTUFBTSxhQUFhO0FBQ25DLFFBQUksSUFBSSxXQUFXLFFBQVEsTUFBTTtBQUNoQyxVQUFJO0FBQ0gsY0FBTSxVQUFVLE1BQU0sS0FBSyxZQUFZLFNBQVMsR0FBRztBQUNuRCxjQUFNQyxRQUFPLFFBQVEsTUFBTSxTQUFTO0FBQ3BDLGVBQU8sS0FBSyxNQUFNQSxLQUFJO0FBQUEsTUFDdkIsU0FBUyxPQUFPO0FBQ2YsYUFBSyxXQUFXLE1BQU0sNEJBQTRCLEdBQUcsS0FBSyxLQUFLLEVBQUU7QUFBQSxNQUNsRTtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sR0FBRyxhQUFhLFVBQVUsTUFBTSxRQUFRO0FBQ2xELFFBQUksTUFBTSxRQUFRO0FBQ2pCLGFBQU8sV0FBVyxNQUFNLE1BQU07QUFBQSxJQUMvQjtBQUNBLFFBQUksTUFBTSxZQUFZO0FBQ3JCLFlBQU0sT0FBTyxtQkFBbUIsTUFBTSxVQUFVO0FBQ2hELGFBQU8sV0FBVyxJQUFJO0FBQUEsSUFDdkI7QUFFQSxRQUFJO0FBQ0osUUFBSTtBQUNILGdCQUFVLE1BQU0sS0FBSyxlQUFlLFFBQVE7QUFBQSxRQUMzQyxNQUFNO0FBQUEsUUFDTjtBQUFBLFFBQ0EsVUFBVTtBQUFBLE1BQ1gsR0FBRyxLQUFLO0FBQUEsSUFDVCxTQUFTLE9BQU87QUFDZixVQUFJLG9CQUFvQixLQUFLLEdBQUc7QUFDL0IsY0FBTTtBQUFBLE1BQ1A7QUFDQSxXQUFLLFdBQVcsTUFBTSxnQ0FBZ0MsS0FBSyxFQUFFO0FBQzdELGFBQU8sRUFBRSxTQUFTLENBQUMsR0FBRyxVQUFVLEVBQUUsT0FBTyxFQUFFLEVBQUU7QUFBQSxJQUM5QztBQUVBLFFBQUksQ0FBQyxVQUFVLE9BQU8sR0FBRztBQUN4QixXQUFLLFdBQVcsTUFBTSxnREFBZ0QsUUFBUSxJQUFJLFVBQVUsRUFBRTtBQUM5RixhQUFPLEVBQUUsU0FBUyxDQUFDLEdBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxFQUFFO0FBQUEsSUFDOUM7QUFFQSxVQUFNLE9BQU8sTUFBTSxPQUFPLE9BQU87QUFFakMsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPLEVBQUUsU0FBUyxDQUFDLEdBQUcsVUFBVSxFQUFFLE9BQU8sRUFBRSxFQUFFO0FBQUEsSUFDOUM7QUFFQSxVQUFNLFNBQVMsS0FBSywwQkFBMEIsTUFBTSxrQkFBa0I7QUFFdEUsUUFBSSxDQUFDLFFBQVE7QUFDWixZQUFNLElBQUksTUFBTSwrQ0FBK0MsYUFBYSxJQUFJLElBQUk7QUFBQSxJQUNyRjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGFBQWEsY0FBc0Isb0JBQXlGO0FBQ2pJLFVBQU0sVUFBVSxNQUFNLEtBQUssZUFBZSxRQUFRO0FBQUEsTUFDakQsTUFBTTtBQUFBLE1BQ04sS0FBSztBQUFBLE1BQ0wsVUFBVTtBQUFBLElBQ1gsR0FBRyxrQkFBa0IsSUFBSTtBQUt6QixRQUFJLFFBQVEsSUFBSSxlQUFlLEtBQUs7QUFDbkMsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFFBQVEsSUFBSSxjQUFjLFFBQVEsSUFBSSxjQUFjLEtBQUs7QUFDNUQsWUFBTSxJQUFJLE1BQU0sbUNBQW1DLFlBQVksMkJBQTJCLFFBQVEsSUFBSSxVQUFVLEVBQUU7QUFBQSxJQUNuSDtBQUVBLFVBQU0sT0FBTyxNQUFNLE9BQU8sT0FBTztBQUNqQyxRQUFJLENBQUMsTUFBTTtBQUNWLFlBQU0sSUFBSSxNQUFNLG1DQUFtQyxZQUFZLGtCQUFrQjtBQUFBLElBQ2xGO0FBRUEsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QiwyQkFBcUIsTUFBTSxLQUFLLDBCQUEwQixzQkFBc0I7QUFBQSxJQUNqRjtBQUNBLHlCQUFxQixzQkFBc0IsYUFBYSxXQUFXLG1CQUFtQixHQUFHLElBQUkscUJBQXFCO0FBRWxILFVBQU0sU0FBUyxLQUFLLG1CQUFtQixNQUFNLGtCQUFrQjtBQUMvRCxRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxNQUFNLHVDQUF1QyxZQUFZLElBQUksSUFBSTtBQUFBLElBQzVFO0FBRUEsV0FBTyxLQUFLLG1CQUFtQixRQUFRLGtCQUFrQjtBQUFBLEVBQzFEO0FBQUEsRUFFUSxtQkFBbUIsTUFBZSxvQkFBa0Y7QUFDM0gsV0FBTyxLQUFLLGNBQWMsa0JBQWtCLEdBQUcsc0JBQXNCLElBQUk7QUFBQSxFQUMxRTtBQUFBLEVBRVEsMEJBQTBCLE1BQWUsb0JBQXlGO0FBQ3pJLFdBQU8sS0FBSyxjQUFjLGtCQUFrQixHQUFHLDRCQUE0QixJQUFJO0FBQUEsRUFDaEY7QUFBQSxFQUVRLGNBQWMsb0JBQTZGO0FBQ2xILFVBQU0sVUFBVSxvQkFBb0IsV0FBVztBQUMvQyxXQUFPLEtBQUssZ0NBQWdDLElBQUksT0FBTztBQUFBLEVBQ3hEO0FBQUEsRUFFUSxrQkFBa0IsTUFBYyxvQkFBNkQ7QUFDcEcsVUFBTSwyQkFBMkIsaUNBQWlDLG9CQUFvQix1QkFBdUIseUJBQXlCO0FBQ3RJLFFBQUksQ0FBQywwQkFBMEI7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLFFBQVEsMEJBQTBCLEVBQUUsS0FBSyxDQUFDO0FBQUEsRUFDbEQ7QUFBQSxFQUVRLGVBQWUsSUFBWSxvQkFBNkQ7QUFDL0YsVUFBTSxzQkFBc0IsaUNBQWlDLG9CQUFvQix1QkFBdUIsY0FBYztBQUN0SCxRQUFJLENBQUMscUJBQXFCO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxRQUFRLHFCQUFxQixFQUFFLEdBQUcsQ0FBQztBQUFBLEVBQzNDO0FBQUEsRUFFUSwwQkFBMEIsTUFBYyxvQkFBNkQ7QUFDNUcsVUFBTSxtQ0FBbUMsaUNBQWlDLG9CQUFvQix1QkFBdUIseUJBQXlCO0FBQzlJLFFBQUksQ0FBQyxrQ0FBa0M7QUFDdEMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLFFBQVEsa0NBQWtDLEVBQUUsTUFBTSxtQkFBbUIsSUFBSSxFQUFFLENBQUM7QUFBQSxFQUNwRjtBQUFBLEVBRVEsVUFBVSxNQUFjLG9CQUE2RDtBQUM1RixVQUFNLHNCQUFzQixpQ0FBaUMsb0JBQW9CLHVCQUF1QixlQUFlO0FBQ3ZILFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLFFBQVEscUJBQXFCLEVBQUUsS0FBSyxDQUFDO0FBQUEsRUFDN0M7QUFBQSxFQUVRLGdCQUFnQixNQUFjLG9CQUE2RDtBQUNsRyxVQUFNLHNCQUFzQixpQ0FBaUMsb0JBQW9CLHVCQUF1QixvQkFBb0I7QUFDNUgsUUFBSSxDQUFDLHFCQUFxQjtBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sUUFBUSxxQkFBcUIsRUFBRSxLQUFLLENBQUM7QUFBQSxFQUM3QztBQUFBLEVBRVEsaUJBQWlCLG9CQUE2RDtBQUNyRixXQUFPLGlDQUFpQyxvQkFBb0IsdUJBQXVCLHNCQUFzQjtBQUFBLEVBQzFHO0FBRUQ7QUFwYWEsb0JBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FWVTsiLAogICJuYW1lcyI6IFsiSWNvbk1pbWVUeXBlIiwgIkljb25UaGVtZSIsICJNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YyMDI1XzA3XzA5IiwgImlucHV0IiwgIk1jcFNlcnZlclNjaGVtYVZlcnNpb25fdjBfMSIsICJNY3BTZXJ2ZXJTY2hlbWFWZXJzaW9uX3YwIiwgInNlcnZlcnMiLCAiaWNvbiIsICJkYXRhIl0KfQo=
