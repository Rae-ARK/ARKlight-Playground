import { bufferToStream, VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IConfigurationService } from "../../../configuration/common/configuration.js";
import { ConfigurationService } from "../../../configuration/common/configurationService.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { GlobalExtensionEnablementService } from "../../../extensionManagement/common/extensionEnablementService.js";
import { IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../extensionManagement/common/extensionManagement.js";
import { IFileService } from "../../../files/common/files.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import product from "../../../product/common/product.js";
import { IProductService } from "../../../product/common/productService.js";
import { IRequestService } from "../../../request/common/request.js";
import { InMemoryStorageService, IStorageService } from "../../../storage/common/storage.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { IUriIdentityService } from "../../../uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
import { ExtensionStorageService, IExtensionStorageService } from "../../../extensionManagement/common/extensionStorage.js";
import { IgnoredExtensionsManagementService, IIgnoredExtensionsManagementService } from "../../common/ignoredExtensions.js";
import { ALL_SYNC_RESOURCES, getDefaultIgnoredSettings, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService, registerConfiguration, SyncResource, USER_DATA_SYNC_SCHEME } from "../../common/userDataSync.js";
import { IUserDataSyncAccountService, UserDataSyncAccountService } from "../../common/userDataSyncAccount.js";
import { UserDataSyncLocalStoreService } from "../../common/userDataSyncLocalStoreService.js";
import { IUserDataSyncMachinesService, UserDataSyncMachinesService } from "../../common/userDataSyncMachines.js";
import { UserDataSyncEnablementService } from "../../common/userDataSyncEnablementService.js";
import { UserDataSyncService } from "../../common/userDataSyncService.js";
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from "../../common/userDataSyncStoreService.js";
import { InMemoryUserDataProfilesService, IUserDataProfilesService } from "../../../userDataProfile/common/userDataProfile.js";
import { NullPolicyService } from "../../../policy/common/policy.js";
import { IUserDataProfileStorageService } from "../../../userDataProfile/common/userDataProfileStorageService.js";
import { TestUserDataProfileStorageService } from "../../../userDataProfile/test/common/userDataProfileStorageService.test.js";
import { IMeteredConnectionService } from "../../../meteredConnection/common/meteredConnection.js";
class UserDataSyncClient extends Disposable {
  constructor(testServer = new UserDataSyncTestServer()) {
    super();
    this.testServer = testServer;
    this.instantiationService = this._register(new TestInstantiationService());
  }
  async setUp(empty = false) {
    this._register(registerConfiguration());
    const logService = this.instantiationService.stub(ILogService, new NullLogService());
    const userRoamingDataHome = URI.file("userdata").with({ scheme: Schemas.inMemory });
    const userDataSyncHome = joinPath(userRoamingDataHome, ".sync");
    const environmentService = this.instantiationService.stub(IEnvironmentService, {
      userDataSyncHome,
      userRoamingDataHome,
      cacheHome: joinPath(userRoamingDataHome, "cache"),
      argvResource: joinPath(userRoamingDataHome, "argv.json"),
      sync: "on"
    });
    this.instantiationService.stub(IProductService, {
      _serviceBrand: void 0,
      ...product,
      ...{
        "configurationSync.store": {
          url: this.testServer.url,
          stableUrl: this.testServer.url,
          insidersUrl: this.testServer.url,
          canSwitch: false,
          authenticationProviders: { "test": { scopes: [] } }
        }
      }
    });
    const fileService = this._register(new FileService(logService));
    this._register(fileService.registerProvider(Schemas.inMemory, this._register(new InMemoryFileSystemProvider())));
    this._register(fileService.registerProvider(USER_DATA_SYNC_SCHEME, this._register(new InMemoryFileSystemProvider())));
    this.instantiationService.stub(IFileService, fileService);
    const uriIdentityService = this._register(this.instantiationService.createInstance(UriIdentityService));
    this.instantiationService.stub(IUriIdentityService, uriIdentityService);
    const userDataProfilesService = this._register(new InMemoryUserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
    this.instantiationService.stub(IUserDataProfilesService, userDataProfilesService);
    const storageService = this._register(new TestStorageService(userDataProfilesService.defaultProfile));
    this.instantiationService.stub(IStorageService, this._register(storageService));
    this.instantiationService.stub(IUserDataProfileStorageService, this._register(new TestUserDataProfileStorageService(false, storageService)));
    const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, new NullPolicyService(), logService));
    await configurationService.initialize();
    this.instantiationService.stub(IConfigurationService, configurationService);
    this.instantiationService.stub(IMeteredConnectionService, { isConnectionMetered: false, onDidChangeIsConnectionMetered: new Emitter().event });
    this.instantiationService.stub(IRequestService, this.testServer);
    this.instantiationService.stub(IUserDataSyncLogService, logService);
    this.instantiationService.stub(ITelemetryService, NullTelemetryService);
    this.instantiationService.stub(IUserDataSyncStoreManagementService, this._register(this.instantiationService.createInstance(UserDataSyncStoreManagementService)));
    this.instantiationService.stub(IUserDataSyncStoreService, this._register(this.instantiationService.createInstance(UserDataSyncStoreService)));
    const userDataSyncAccountService = this._register(this.instantiationService.createInstance(UserDataSyncAccountService));
    await userDataSyncAccountService.updateAccount({ authenticationProviderId: "authenticationProviderId", token: "token" });
    this.instantiationService.stub(IUserDataSyncAccountService, userDataSyncAccountService);
    this.instantiationService.stub(IUserDataSyncMachinesService, this._register(this.instantiationService.createInstance(UserDataSyncMachinesService)));
    this.instantiationService.stub(IUserDataSyncLocalStoreService, this._register(this.instantiationService.createInstance(UserDataSyncLocalStoreService)));
    this.instantiationService.stub(IUserDataSyncUtilService, new TestUserDataSyncUtilService());
    this.instantiationService.stub(IUserDataSyncEnablementService, this._register(this.instantiationService.createInstance(UserDataSyncEnablementService)));
    this.instantiationService.stub(IExtensionManagementService, {
      async getInstalled() {
        return [];
      },
      onDidInstallExtensions: new Emitter().event,
      onDidUninstallExtension: new Emitter().event
    });
    this.instantiationService.stub(IGlobalExtensionEnablementService, this._register(this.instantiationService.createInstance(GlobalExtensionEnablementService)));
    this.instantiationService.stub(IExtensionStorageService, this._register(this.instantiationService.createInstance(ExtensionStorageService)));
    this.instantiationService.stub(IIgnoredExtensionsManagementService, this.instantiationService.createInstance(IgnoredExtensionsManagementService));
    this.instantiationService.stub(IExtensionGalleryService, {
      isEnabled() {
        return true;
      },
      async getCompatibleExtension() {
        return null;
      }
    });
    this.instantiationService.stub(IUserDataSyncService, this._register(this.instantiationService.createInstance(UserDataSyncService)));
    if (!empty) {
      await fileService.writeFile(userDataProfilesService.defaultProfile.settingsResource, VSBuffer.fromString(JSON.stringify({})));
      await fileService.writeFile(userDataProfilesService.defaultProfile.keybindingsResource, VSBuffer.fromString(JSON.stringify([])));
      await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.snippetsHome, "c.json"), VSBuffer.fromString(`{}`));
      await fileService.writeFile(joinPath(userDataProfilesService.defaultProfile.promptsHome, "c.prompt.md"), VSBuffer.fromString(" "));
      await fileService.writeFile(userDataProfilesService.defaultProfile.tasksResource, VSBuffer.fromString(`{}`));
      await fileService.writeFile(environmentService.argvResource, VSBuffer.fromString(JSON.stringify({ "locale": "en" })));
    }
    await configurationService.reloadConfiguration();
    this.instantiationService.get(IUserDataSyncEnablementService).setResourceEnablement(SyncResource.Prompts, true);
  }
  async sync() {
    await (await this.instantiationService.get(IUserDataSyncService).createSyncTask(null)).run();
  }
  read(resource, collection) {
    return this.instantiationService.get(IUserDataSyncStoreService).readResource(resource, null, collection);
  }
  async getLatestRef(resource) {
    const manifest = await this._getResourceManifest();
    return manifest?.[resource] ?? null;
  }
  async _getResourceManifest() {
    const manifest = await this.instantiationService.get(IUserDataSyncStoreService).manifest(null);
    return manifest?.latest ?? null;
  }
  getSynchronizer(source) {
    return this.instantiationService.get(IUserDataSyncService).getOrCreateActiveProfileSynchronizer(this.instantiationService.get(IUserDataProfilesService).defaultProfile, void 0).enabled.find((s) => s.resource === source);
  }
}
const ALL_SERVER_RESOURCES = [...ALL_SYNC_RESOURCES, "machines"];
class UserDataSyncTestServer {
  constructor(rateLimit = Number.MAX_SAFE_INTEGER, retryAfter) {
    this.rateLimit = rateLimit;
    this.retryAfter = retryAfter;
    this.onDidCompleteRequest = Event.None;
    this.url = "http://host:3000";
    this.session = null;
    this.collections = /* @__PURE__ */ new Map();
    this.data = /* @__PURE__ */ new Map();
    this._requests = [];
    this._requestsWithAllHeaders = [];
    this._responses = [];
    this.manifestRef = 0;
    this.collectionCounter = 0;
  }
  get requests() {
    return this._requests;
  }
  get requestsWithAllHeaders() {
    return this._requestsWithAllHeaders;
  }
  get responses() {
    return this._responses;
  }
  reset() {
    this._requests = [];
    this._responses = [];
    this._requestsWithAllHeaders = [];
  }
  async resolveProxy(url) {
    return url;
  }
  async lookupAuthorization(authInfo) {
    return void 0;
  }
  async lookupKerberosAuthorization(url) {
    return void 0;
  }
  async loadCertificates() {
    return [];
  }
  async request(options, token) {
    if (this._requests.length === this.rateLimit) {
      return this.toResponse(429, this.retryAfter ? { "retry-after": `${this.retryAfter}` } : void 0);
    }
    const headers = {};
    if (options.headers) {
      if (options.headers["If-None-Match"]) {
        headers["If-None-Match"] = options.headers["If-None-Match"];
      }
      if (options.headers["If-Match"]) {
        headers["If-Match"] = options.headers["If-Match"];
      }
    }
    this._requests.push({ url: options.url, type: options.type, headers });
    this._requestsWithAllHeaders.push({ url: options.url, type: options.type, headers: options.headers });
    const requestContext = await this.doRequest(options);
    this._responses.push({ status: requestContext.res.statusCode });
    return requestContext;
  }
  async doRequest(options) {
    const versionUrl = `${this.url}/v1/`;
    const relativePath = options.url.indexOf(versionUrl) === 0 ? options.url.substring(versionUrl.length) : void 0;
    const segments = relativePath ? relativePath.split("/") : [];
    if (options.type === "GET" && segments.length === 1 && segments[0] === "manifest") {
      return this.getManifest(options.headers);
    }
    if (options.type === "GET" && segments.length === 3 && segments[0] === "resource") {
      return this.getResourceData(void 0, segments[1], segments[2] === "latest" ? void 0 : segments[2], options.headers);
    }
    if (options.type === "POST" && segments.length === 2 && segments[0] === "resource") {
      return this.writeData(void 0, segments[1], options.data, options.headers);
    }
    if (options.type === "GET" && segments.length === 5 && segments[0] === "collection" && segments[2] === "resource") {
      return this.getResourceData(segments[1], segments[3], segments[4] === "latest" ? void 0 : segments[4], options.headers);
    }
    if (options.type === "POST" && segments.length === 4 && segments[0] === "collection" && segments[2] === "resource") {
      return this.writeData(segments[1], segments[3], options.data, options.headers);
    }
    if (options.type === "DELETE" && segments.length === 2 && segments[0] === "resource") {
      return this.deleteResourceData(void 0, segments[1]);
    }
    if (options.type === "DELETE" && segments.length === 1 && segments[0] === "resource") {
      return this.clear(options.headers);
    }
    if (options.type === "DELETE" && segments[0] === "collection") {
      return this.toResponse(204);
    }
    if (options.type === "POST" && segments.length === 1 && segments[0] === "collection") {
      return this.createCollection();
    }
    return this.toResponse(501);
  }
  async getManifest(headers) {
    if (this.session) {
      const latest = /* @__PURE__ */ Object.create({});
      this.data.forEach((value, key) => latest[key] = value.ref);
      let collections = void 0;
      if (this.collectionCounter) {
        collections = {};
        for (let collectionId = 1; collectionId <= this.collectionCounter; collectionId++) {
          const collectionData = this.collections.get(`${collectionId}`);
          if (collectionData) {
            const latest2 = /* @__PURE__ */ Object.create({});
            collectionData.forEach((value, key) => latest2[key] = value.ref);
            collections[`${collectionId}`] = { latest: latest2 };
          }
        }
      }
      const manifest = { session: this.session, latest, collections, ref: "1" };
      return this.toResponse(200, { "Content-Type": "application/json", etag: `${this.manifestRef++}` }, JSON.stringify(manifest));
    }
    return this.toResponse(204, { etag: `${this.manifestRef++}` });
  }
  async getResourceData(collection, resource, ref, headers = {}) {
    const collectionData = collection ? this.collections.get(collection) : this.data;
    if (!collectionData) {
      return this.toResponse(501);
    }
    const resourceKey = ALL_SERVER_RESOURCES.find((key) => key === resource);
    if (resourceKey) {
      const data = collectionData.get(resourceKey);
      if (ref && data?.ref !== ref) {
        return this.toResponse(404);
      }
      if (!data) {
        return this.toResponse(204, { etag: "0" });
      }
      if (headers["If-None-Match"] === data.ref) {
        return this.toResponse(304);
      }
      return this.toResponse(200, { etag: data.ref }, data.content || "");
    }
    return this.toResponse(204);
  }
  async writeData(collection, resource, content = "", headers = {}) {
    if (!this.session) {
      this.session = generateUuid();
    }
    const collectionData = collection ? this.collections.get(collection) : this.data;
    if (!collectionData) {
      return this.toResponse(501);
    }
    const resourceKey = ALL_SERVER_RESOURCES.find((key) => key === resource);
    if (resourceKey) {
      const data = collectionData.get(resourceKey);
      if (headers["If-Match"] !== void 0 && headers["If-Match"] !== (data ? data.ref : "0")) {
        return this.toResponse(412);
      }
      const ref = `${parseInt(data?.ref || "0") + 1}`;
      collectionData.set(resourceKey, { ref, content });
      return this.toResponse(200, { etag: ref });
    }
    return this.toResponse(204);
  }
  async deleteResourceData(collection, resource, headers = {}) {
    const collectionData = collection ? this.collections.get(collection) : this.data;
    if (!collectionData) {
      return this.toResponse(501);
    }
    const resourceKey = ALL_SERVER_RESOURCES.find((key) => key === resource);
    if (resourceKey) {
      collectionData.delete(resourceKey);
      return this.toResponse(200);
    }
    return this.toResponse(404);
  }
  async createCollection() {
    const collectionId = `${++this.collectionCounter}`;
    this.collections.set(collectionId, /* @__PURE__ */ new Map());
    return this.toResponse(200, {}, collectionId);
  }
  async clear(headers) {
    this.collections.clear();
    this.data.clear();
    this.session = null;
    this.collectionCounter = 0;
    return this.toResponse(204);
  }
  toResponse(statusCode, headers, data) {
    return {
      res: {
        headers: headers || {},
        statusCode
      },
      stream: bufferToStream(VSBuffer.fromString(data || ""))
    };
  }
}
class TestUserDataSyncUtilService {
  async resolveDefaultCoreIgnoredSettings() {
    return getDefaultIgnoredSettings();
  }
  async resolveUserBindings(userbindings) {
    const keys = {};
    for (const keybinding of userbindings) {
      keys[keybinding] = keybinding;
    }
    return keys;
  }
  async resolveFormattingOptions(file) {
    return { eol: "\n", insertSpaces: false, tabSize: 4 };
  }
}
class TestStorageService extends InMemoryStorageService {
  constructor(profileStorageProfile) {
    super();
    this.profileStorageProfile = profileStorageProfile;
  }
  hasScope(profile) {
    return this.profileStorageProfile.id === profile.id;
  }
}
export {
  TestUserDataSyncUtilService,
  UserDataSyncClient,
  UserDataSyncTestServer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy90ZXN0L2NvbW1vbi91c2VyRGF0YVN5bmNDbGllbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZvcm1hdHRpbmdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElIZWFkZXJzLCBJUmVxdWVzdENvbnRleHQsIElSZXF1ZXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRoSW5mbywgQ3JlZGVudGlhbHMsIElSZXF1ZXN0Q29tcGxldGVFdmVudCwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25TdG9yYWdlU2VydmljZSwgSUV4dGVuc2lvblN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uU3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBJSWdub3JlZEV4dGVuc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9pZ25vcmVkRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBTExfU1lOQ19SRVNPVVJDRVMsIGdldERlZmF1bHRJZ25vcmVkU2V0dGluZ3MsIElVc2VyRGF0YSwgSVVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLCBJVXNlckRhdGFTeW5jTG9nU2VydmljZSwgSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLCBJVXNlckRhdGFTeW5jU2VydmljZSwgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIElVc2VyRGF0YVN5bmNVdGlsU2VydmljZSwgcmVnaXN0ZXJDb25maWd1cmF0aW9uLCBTZXJ2ZXJSZXNvdXJjZSwgU3luY1Jlc291cmNlLCBJVXNlckRhdGFTeW5jaHJvbmlzZXIsIElVc2VyRGF0YVJlc291cmNlTWFuaWZlc3QsIElVc2VyRGF0YUNvbGxlY3Rpb25NYW5pZmVzdCwgVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCBJVXNlckRhdGFNYW5pZmVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLCBVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmNBY2NvdW50LmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luY0xvY2FsU3RvcmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UsIFVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmNNYWNoaW5lcy5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi91c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSwgVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VzZXJEYXRhU3luY1N0b3JlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCBJVXNlckRhdGFQcm9maWxlLCBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBOdWxsUG9saWN5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BvbGljeS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFVzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdXNlckRhdGFQcm9maWxlL3Rlc3QvY29tbW9uL3VzZXJEYXRhUHJvZmlsZVN0b3JhZ2VTZXJ2aWNlLnRlc3QuanMnO1xuaW1wb3J0IHsgSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL21ldGVyZWRDb25uZWN0aW9uL2NvbW1vbi9tZXRlcmVkQ29ubmVjdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNDbGllbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHRlc3RTZXJ2ZXI6IFVzZXJEYXRhU3luY1Rlc3RTZXJ2ZXIgPSBuZXcgVXNlckRhdGFTeW5jVGVzdFNlcnZlcigpKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0fVxuXG5cdGFzeW5jIHNldFVwKGVtcHR5OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckNvbmZpZ3VyYXRpb24oKSk7XG5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCB1c2VyUm9hbWluZ0RhdGFIb21lID0gVVJJLmZpbGUoJ3VzZXJkYXRhJykud2l0aCh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSB9KTtcblx0XHRjb25zdCB1c2VyRGF0YVN5bmNIb21lID0gam9pblBhdGgodXNlclJvYW1pbmdEYXRhSG9tZSwgJy5zeW5jJyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIHtcblx0XHRcdHVzZXJEYXRhU3luY0hvbWUsXG5cdFx0XHR1c2VyUm9hbWluZ0RhdGFIb21lLFxuXHRcdFx0Y2FjaGVIb21lOiBqb2luUGF0aCh1c2VyUm9hbWluZ0RhdGFIb21lLCAnY2FjaGUnKSxcblx0XHRcdGFyZ3ZSZXNvdXJjZTogam9pblBhdGgodXNlclJvYW1pbmdEYXRhSG9tZSwgJ2FyZ3YuanNvbicpLFxuXHRcdFx0c3luYzogJ29uJ1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9kdWN0U2VydmljZSwge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0LCAuLi57XG5cdFx0XHRcdCdjb25maWd1cmF0aW9uU3luYy5zdG9yZSc6IHtcblx0XHRcdFx0XHR1cmw6IHRoaXMudGVzdFNlcnZlci51cmwsXG5cdFx0XHRcdFx0c3RhYmxlVXJsOiB0aGlzLnRlc3RTZXJ2ZXIudXJsLFxuXHRcdFx0XHRcdGluc2lkZXJzVXJsOiB0aGlzLnRlc3RTZXJ2ZXIudXJsLFxuXHRcdFx0XHRcdGNhblN3aXRjaDogZmFsc2UsXG5cdFx0XHRcdFx0YXV0aGVudGljYXRpb25Qcm92aWRlcnM6IHsgJ3Rlc3QnOiB7IHNjb3BlczogW10gfSB9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIHRoaXMuX3JlZ2lzdGVyKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoVVNFUl9EQVRBX1NZTkNfU0NIRU1FLCB0aGlzLl9yZWdpc3RlcihuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVyaUlkZW50aXR5U2VydmljZSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW5NZW1vcnlVc2VyRGF0YVByb2ZpbGVzU2VydmljZShlbnZpcm9ubWVudFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB1c2VyRGF0YVByb2ZpbGVzU2VydmljZSk7XG5cblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCB0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UsIHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXN0VXNlckRhdGFQcm9maWxlU3RvcmFnZVNlcnZpY2UoZmFsc2UsIHN0b3JhZ2VTZXJ2aWNlKSkpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29uZmlndXJhdGlvblNlcnZpY2UodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsUG9saWN5U2VydmljZSgpLCBsb2dTZXJ2aWNlKSk7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UuaW5pdGlhbGl6ZSgpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLCB7IGlzQ29ubmVjdGlvbk1ldGVyZWQ6IGZhbHNlLCBvbkRpZENoYW5nZUlzQ29ubmVjdGlvbk1ldGVyZWQ6IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkuZXZlbnQgfSk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlcXVlc3RTZXJ2aWNlLCB0aGlzLnRlc3RTZXJ2ZXIpO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSkpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSwgdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UpKSk7XG5cblx0XHRjb25zdCB1c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZTogSVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSkpO1xuXHRcdGF3YWl0IHVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLnVwZGF0ZUFjY291bnQoeyBhdXRoZW50aWNhdGlvblByb3ZpZGVySWQ6ICdhdXRoZW50aWNhdGlvblByb3ZpZGVySWQnLCB0b2tlbjogJ3Rva2VuJyB9KTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLCB1c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhU3luY01hY2hpbmVzU2VydmljZSwgdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNNYWNoaW5lc1NlcnZpY2UpKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSwgdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSkpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlLCBuZXcgVGVzdFVzZXJEYXRhU3luY1V0aWxTZXJ2aWNlKCkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UpKSk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCB7XG5cdFx0XHRhc3luYyBnZXRJbnN0YWxsZWQoKSB7IHJldHVybiBbXTsgfSxcblx0XHRcdG9uRGlkSW5zdGFsbEV4dGVuc2lvbnM6IG5ldyBFbWl0dGVyPHJlYWRvbmx5IEluc3RhbGxFeHRlbnNpb25SZXN1bHRbXT4oKS5ldmVudCxcblx0XHRcdG9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uOiBuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudD4oKS5ldmVudCxcblx0XHR9KTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKSkpO1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UsIHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uU3RvcmFnZVNlcnZpY2UpKSk7XG5cdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJZ25vcmVkRXh0ZW5zaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElnbm9yZWRFeHRlbnNpb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCB7XG5cdFx0XHRpc0VuYWJsZWQoKSB7IHJldHVybiB0cnVlOyB9LFxuXHRcdFx0YXN5bmMgZ2V0Q29tcGF0aWJsZUV4dGVuc2lvbigpIHsgcmV0dXJuIG51bGw7IH1cblx0XHR9KTtcblxuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXNlckRhdGFTeW5jU2VydmljZSwgdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVc2VyRGF0YVN5bmNTZXJ2aWNlKSkpO1xuXG5cdFx0aWYgKCFlbXB0eSkge1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoe30pKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShbXSkpKTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zbmlwcGV0c0hvbWUsICdjLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhge31gKSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoam9pblBhdGgodXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUucHJvbXB0c0hvbWUsICdjLnByb21wdC5tZCcpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcgJykpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLnRhc2tzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoYHt9YCkpO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGVudmlyb25tZW50U2VydmljZS5hcmd2UmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyAnbG9jYWxlJzogJ2VuJyB9KSkpO1xuXHRcdH1cblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5yZWxvYWRDb25maWd1cmF0aW9uKCk7XG5cblx0XHQvLyBgcHJvbXB0c2AgcmVzb3VyY2UgaXMgZGlzYWJsZWQgYnkgZGVmYXVsdCwgc28gZW5hYmxlIGl0IGZvciB0ZXN0c1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2Vcblx0XHRcdC5nZXQoSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlKVxuXHRcdFx0LnNldFJlc291cmNlRW5hYmxlbWVudChTeW5jUmVzb3VyY2UuUHJvbXB0cywgdHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBzeW5jKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IChhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU2VydmljZSkuY3JlYXRlU3luY1Rhc2sobnVsbCkpLnJ1bigpO1xuXHR9XG5cblx0cmVhZChyZXNvdXJjZTogU3luY1Jlc291cmNlLCBjb2xsZWN0aW9uPzogc3RyaW5nKTogUHJvbWlzZTxJVXNlckRhdGE+IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSkucmVhZFJlc291cmNlKHJlc291cmNlLCBudWxsLCBjb2xsZWN0aW9uKTtcblx0fVxuXG5cdGFzeW5jIGdldExhdGVzdFJlZihyZXNvdXJjZTogU3luY1Jlc291cmNlKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLl9nZXRSZXNvdXJjZU1hbmlmZXN0KCk7XG5cdFx0cmV0dXJuIG1hbmlmZXN0Py5bcmVzb3VyY2VdID8/IG51bGw7XG5cdH1cblxuXHRhc3luYyBfZ2V0UmVzb3VyY2VNYW5pZmVzdCgpOiBQcm9taXNlPElVc2VyRGF0YVJlc291cmNlTWFuaWZlc3QgfCBudWxsPiB7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlKS5tYW5pZmVzdChudWxsKTtcblx0XHRyZXR1cm4gbWFuaWZlc3Q/LmxhdGVzdCA/PyBudWxsO1xuXHR9XG5cblx0Z2V0U3luY2hyb25pemVyKHNvdXJjZTogU3luY1Jlc291cmNlKTogSVVzZXJEYXRhU3luY2hyb25pc2VyIHtcblx0XHRyZXR1cm4gKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElVc2VyRGF0YVN5bmNTZXJ2aWNlKSBhcyBVc2VyRGF0YVN5bmNTZXJ2aWNlKS5nZXRPckNyZWF0ZUFjdGl2ZVByb2ZpbGVTeW5jaHJvbml6ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlKS5kZWZhdWx0UHJvZmlsZSwgdW5kZWZpbmVkKS5lbmFibGVkLmZpbmQocyA9PiBzLnJlc291cmNlID09PSBzb3VyY2UpITtcblx0fVxuXG59XG5cbmNvbnN0IEFMTF9TRVJWRVJfUkVTT1VSQ0VTOiBTZXJ2ZXJSZXNvdXJjZVtdID0gWy4uLkFMTF9TWU5DX1JFU09VUkNFUywgJ21hY2hpbmVzJ107XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNUZXN0U2VydmVyIGltcGxlbWVudHMgSVJlcXVlc3RTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDb21wbGV0ZVJlcXVlc3QgPSBFdmVudC5Ob25lIGFzIEV2ZW50PElSZXF1ZXN0Q29tcGxldGVFdmVudD47XG5cblx0cmVhZG9ubHkgdXJsOiBzdHJpbmcgPSAnaHR0cDovL2hvc3Q6MzAwMCc7XG5cdHByaXZhdGUgc2Vzc2lvbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29sbGVjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgTWFwPFNlcnZlclJlc291cmNlLCBJVXNlckRhdGE+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRhdGEgPSBuZXcgTWFwPFNlcnZlclJlc291cmNlLCBJVXNlckRhdGE+KCk7XG5cblx0cHJpdmF0ZSBfcmVxdWVzdHM6IHsgdXJsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgaGVhZGVycz86IElIZWFkZXJzIH1bXSA9IFtdO1xuXHRnZXQgcmVxdWVzdHMoKTogeyB1cmw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBoZWFkZXJzPzogSUhlYWRlcnMgfVtdIHsgcmV0dXJuIHRoaXMuX3JlcXVlc3RzOyB9XG5cblx0cHJpdmF0ZSBfcmVxdWVzdHNXaXRoQWxsSGVhZGVyczogeyB1cmw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBoZWFkZXJzPzogSUhlYWRlcnMgfVtdID0gW107XG5cdGdldCByZXF1ZXN0c1dpdGhBbGxIZWFkZXJzKCk6IHsgdXJsOiBzdHJpbmc7IHR5cGU6IHN0cmluZzsgaGVhZGVycz86IElIZWFkZXJzIH1bXSB7IHJldHVybiB0aGlzLl9yZXF1ZXN0c1dpdGhBbGxIZWFkZXJzOyB9XG5cblx0cHJpdmF0ZSBfcmVzcG9uc2VzOiB7IHN0YXR1czogbnVtYmVyIH1bXSA9IFtdO1xuXHRnZXQgcmVzcG9uc2VzKCk6IHsgc3RhdHVzOiBudW1iZXIgfVtdIHsgcmV0dXJuIHRoaXMuX3Jlc3BvbnNlczsgfVxuXHRyZXNldCgpOiB2b2lkIHsgdGhpcy5fcmVxdWVzdHMgPSBbXTsgdGhpcy5fcmVzcG9uc2VzID0gW107IHRoaXMuX3JlcXVlc3RzV2l0aEFsbEhlYWRlcnMgPSBbXTsgfVxuXG5cdHByaXZhdGUgbWFuaWZlc3RSZWYgPSAwO1xuXHRwcml2YXRlIGNvbGxlY3Rpb25Db3VudGVyID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHJhdGVMaW1pdCA9IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCBwcml2YXRlIHJlYWRvbmx5IHJldHJ5QWZ0ZXI/OiBudW1iZXIpIHsgfVxuXG5cdGFzeW5jIHJlc29sdmVQcm94eSh1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1cmw7IH1cblx0YXN5bmMgbG9va3VwQXV0aG9yaXphdGlvbihhdXRoSW5mbzogQXV0aEluZm8pOiBQcm9taXNlPENyZWRlbnRpYWxzIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgbG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uKHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBsb2FkQ2VydGlmaWNhdGVzKCk6IFByb21pc2U8c3RyaW5nW10+IHsgcmV0dXJuIFtdOyB9XG5cblx0YXN5bmMgcmVxdWVzdChvcHRpb25zOiBJUmVxdWVzdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0aWYgKHRoaXMuX3JlcXVlc3RzLmxlbmd0aCA9PT0gdGhpcy5yYXRlTGltaXQpIHtcblx0XHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoNDI5LCB0aGlzLnJldHJ5QWZ0ZXIgPyB7ICdyZXRyeS1hZnRlcic6IGAke3RoaXMucmV0cnlBZnRlcn1gIH0gOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRjb25zdCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9O1xuXHRcdGlmIChvcHRpb25zLmhlYWRlcnMpIHtcblx0XHRcdGlmIChvcHRpb25zLmhlYWRlcnNbJ0lmLU5vbmUtTWF0Y2gnXSkge1xuXHRcdFx0XHRoZWFkZXJzWydJZi1Ob25lLU1hdGNoJ10gPSBvcHRpb25zLmhlYWRlcnNbJ0lmLU5vbmUtTWF0Y2gnXTtcblx0XHRcdH1cblx0XHRcdGlmIChvcHRpb25zLmhlYWRlcnNbJ0lmLU1hdGNoJ10pIHtcblx0XHRcdFx0aGVhZGVyc1snSWYtTWF0Y2gnXSA9IG9wdGlvbnMuaGVhZGVyc1snSWYtTWF0Y2gnXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcmVxdWVzdHMucHVzaCh7IHVybDogb3B0aW9ucy51cmwhLCB0eXBlOiBvcHRpb25zLnR5cGUhLCBoZWFkZXJzIH0pO1xuXHRcdHRoaXMuX3JlcXVlc3RzV2l0aEFsbEhlYWRlcnMucHVzaCh7IHVybDogb3B0aW9ucy51cmwhLCB0eXBlOiBvcHRpb25zLnR5cGUhLCBoZWFkZXJzOiBvcHRpb25zLmhlYWRlcnMgfSk7XG5cdFx0Y29uc3QgcmVxdWVzdENvbnRleHQgPSBhd2FpdCB0aGlzLmRvUmVxdWVzdChvcHRpb25zKTtcblx0XHR0aGlzLl9yZXNwb25zZXMucHVzaCh7IHN0YXR1czogcmVxdWVzdENvbnRleHQucmVzLnN0YXR1c0NvZGUhIH0pO1xuXHRcdHJldHVybiByZXF1ZXN0Q29udGV4dDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXF1ZXN0KG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0Y29uc3QgdmVyc2lvblVybCA9IGAke3RoaXMudXJsfS92MS9gO1xuXHRcdGNvbnN0IHJlbGF0aXZlUGF0aCA9IG9wdGlvbnMudXJsIS5pbmRleE9mKHZlcnNpb25VcmwpID09PSAwID8gb3B0aW9ucy51cmwhLnN1YnN0cmluZyh2ZXJzaW9uVXJsLmxlbmd0aCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2VnbWVudHMgPSByZWxhdGl2ZVBhdGggPyByZWxhdGl2ZVBhdGguc3BsaXQoJy8nKSA6IFtdO1xuXHRcdGlmIChvcHRpb25zLnR5cGUgPT09ICdHRVQnICYmIHNlZ21lbnRzLmxlbmd0aCA9PT0gMSAmJiBzZWdtZW50c1swXSA9PT0gJ21hbmlmZXN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0TWFuaWZlc3Qob3B0aW9ucy5oZWFkZXJzKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gJ0dFVCcgJiYgc2VnbWVudHMubGVuZ3RoID09PSAzICYmIHNlZ21lbnRzWzBdID09PSAncmVzb3VyY2UnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRSZXNvdXJjZURhdGEodW5kZWZpbmVkLCBzZWdtZW50c1sxXSwgc2VnbWVudHNbMl0gPT09ICdsYXRlc3QnID8gdW5kZWZpbmVkIDogc2VnbWVudHNbMl0sIG9wdGlvbnMuaGVhZGVycyk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnR5cGUgPT09ICdQT1NUJyAmJiBzZWdtZW50cy5sZW5ndGggPT09IDIgJiYgc2VnbWVudHNbMF0gPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdHJldHVybiB0aGlzLndyaXRlRGF0YSh1bmRlZmluZWQsIHNlZ21lbnRzWzFdLCBvcHRpb25zLmRhdGEsIG9wdGlvbnMuaGVhZGVycyk7XG5cdFx0fVxuXHRcdC8vIHJlc291cmNlcyBpbiBjb2xsZWN0aW9uXG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gJ0dFVCcgJiYgc2VnbWVudHMubGVuZ3RoID09PSA1ICYmIHNlZ21lbnRzWzBdID09PSAnY29sbGVjdGlvbicgJiYgc2VnbWVudHNbMl0gPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFJlc291cmNlRGF0YShzZWdtZW50c1sxXSwgc2VnbWVudHNbM10sIHNlZ21lbnRzWzRdID09PSAnbGF0ZXN0JyA/IHVuZGVmaW5lZCA6IHNlZ21lbnRzWzRdLCBvcHRpb25zLmhlYWRlcnMpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy50eXBlID09PSAnUE9TVCcgJiYgc2VnbWVudHMubGVuZ3RoID09PSA0ICYmIHNlZ21lbnRzWzBdID09PSAnY29sbGVjdGlvbicgJiYgc2VnbWVudHNbMl0gPT09ICdyZXNvdXJjZScpIHtcblx0XHRcdHJldHVybiB0aGlzLndyaXRlRGF0YShzZWdtZW50c1sxXSwgc2VnbWVudHNbM10sIG9wdGlvbnMuZGF0YSwgb3B0aW9ucy5oZWFkZXJzKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gJ0RFTEVURScgJiYgc2VnbWVudHMubGVuZ3RoID09PSAyICYmIHNlZ21lbnRzWzBdID09PSAncmVzb3VyY2UnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWxldGVSZXNvdXJjZURhdGEodW5kZWZpbmVkLCBzZWdtZW50c1sxXSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnR5cGUgPT09ICdERUxFVEUnICYmIHNlZ21lbnRzLmxlbmd0aCA9PT0gMSAmJiBzZWdtZW50c1swXSA9PT0gJ3Jlc291cmNlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2xlYXIob3B0aW9ucy5oZWFkZXJzKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gJ0RFTEVURScgJiYgc2VnbWVudHNbMF0gPT09ICdjb2xsZWN0aW9uJykge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgyMDQpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy50eXBlID09PSAnUE9TVCcgJiYgc2VnbWVudHMubGVuZ3RoID09PSAxICYmIHNlZ21lbnRzWzBdID09PSAnY29sbGVjdGlvbicpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUNvbGxlY3Rpb24oKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSg1MDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRNYW5pZmVzdChoZWFkZXJzPzogSUhlYWRlcnMpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGlmICh0aGlzLnNlc3Npb24pIHtcblx0XHRcdGNvbnN0IGxhdGVzdDogUmVjb3JkPFNlcnZlclJlc291cmNlLCBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZSh7fSk7XG5cdFx0XHR0aGlzLmRhdGEuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4gbGF0ZXN0W2tleV0gPSB2YWx1ZS5yZWYpO1xuXHRcdFx0bGV0IGNvbGxlY3Rpb25zOiBJVXNlckRhdGFDb2xsZWN0aW9uTWFuaWZlc3QgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5jb2xsZWN0aW9uQ291bnRlcikge1xuXHRcdFx0XHRjb2xsZWN0aW9ucyA9IHt9O1xuXHRcdFx0XHRmb3IgKGxldCBjb2xsZWN0aW9uSWQgPSAxOyBjb2xsZWN0aW9uSWQgPD0gdGhpcy5jb2xsZWN0aW9uQ291bnRlcjsgY29sbGVjdGlvbklkKyspIHtcblx0XHRcdFx0XHRjb25zdCBjb2xsZWN0aW9uRGF0YSA9IHRoaXMuY29sbGVjdGlvbnMuZ2V0KGAke2NvbGxlY3Rpb25JZH1gKTtcblx0XHRcdFx0XHRpZiAoY29sbGVjdGlvbkRhdGEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdGVzdDogUmVjb3JkPFNlcnZlclJlc291cmNlLCBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZSh7fSk7XG5cdFx0XHRcdFx0XHRjb2xsZWN0aW9uRGF0YS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiBsYXRlc3Rba2V5XSA9IHZhbHVlLnJlZik7XG5cdFx0XHRcdFx0XHRjb2xsZWN0aW9uc1tgJHtjb2xsZWN0aW9uSWR9YF0gPSB7IGxhdGVzdCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElVc2VyRGF0YU1hbmlmZXN0ID0geyBzZXNzaW9uOiB0aGlzLnNlc3Npb24sIGxhdGVzdCwgY29sbGVjdGlvbnMsIHJlZjogJzEnIH07XG5cdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCBldGFnOiBgJHt0aGlzLm1hbmlmZXN0UmVmKyt9YCB9LCBKU09OLnN0cmluZ2lmeShtYW5pZmVzdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwNCwgeyBldGFnOiBgJHt0aGlzLm1hbmlmZXN0UmVmKyt9YCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UmVzb3VyY2VEYXRhKGNvbGxlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzb3VyY2U6IHN0cmluZywgcmVmPzogc3RyaW5nLCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRjb25zdCBjb2xsZWN0aW9uRGF0YSA9IGNvbGxlY3Rpb24gPyB0aGlzLmNvbGxlY3Rpb25zLmdldChjb2xsZWN0aW9uKSA6IHRoaXMuZGF0YTtcblx0XHRpZiAoIWNvbGxlY3Rpb25EYXRhKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDUwMSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb3VyY2VLZXkgPSBBTExfU0VSVkVSX1JFU09VUkNFUy5maW5kKGtleSA9PiBrZXkgPT09IHJlc291cmNlKTtcblx0XHRpZiAocmVzb3VyY2VLZXkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSBjb2xsZWN0aW9uRGF0YS5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdFx0aWYgKHJlZiAmJiBkYXRhPy5yZWYgIT09IHJlZikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDQwNCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgyMDQsIHsgZXRhZzogJzAnIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhlYWRlcnNbJ0lmLU5vbmUtTWF0Y2gnXSA9PT0gZGF0YS5yZWYpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgzMDQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgyMDAsIHsgZXRhZzogZGF0YS5yZWYgfSwgZGF0YS5jb250ZW50IHx8ICcnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgyMDQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3cml0ZURhdGEoY29sbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNvdXJjZTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcgPSAnJywgaGVhZGVyczogSUhlYWRlcnMgPSB7fSk6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0aWYgKCF0aGlzLnNlc3Npb24pIHtcblx0XHRcdHRoaXMuc2Vzc2lvbiA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdH1cblx0XHRjb25zdCBjb2xsZWN0aW9uRGF0YSA9IGNvbGxlY3Rpb24gPyB0aGlzLmNvbGxlY3Rpb25zLmdldChjb2xsZWN0aW9uKSA6IHRoaXMuZGF0YTtcblx0XHRpZiAoIWNvbGxlY3Rpb25EYXRhKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDUwMSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlS2V5ID0gQUxMX1NFUlZFUl9SRVNPVVJDRVMuZmluZChrZXkgPT4ga2V5ID09PSByZXNvdXJjZSk7XG5cdFx0aWYgKHJlc291cmNlS2V5KSB7XG5cdFx0XHRjb25zdCBkYXRhID0gY29sbGVjdGlvbkRhdGEuZ2V0KHJlc291cmNlS2V5KTtcblx0XHRcdGlmIChoZWFkZXJzWydJZi1NYXRjaCddICE9PSB1bmRlZmluZWQgJiYgaGVhZGVyc1snSWYtTWF0Y2gnXSAhPT0gKGRhdGEgPyBkYXRhLnJlZiA6ICcwJykpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSg0MTIpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVmID0gYCR7cGFyc2VJbnQoZGF0YT8ucmVmIHx8ICcwJykgKyAxfWA7XG5cdFx0XHRjb2xsZWN0aW9uRGF0YS5zZXQocmVzb3VyY2VLZXksIHsgcmVmLCBjb250ZW50IH0pO1xuXHRcdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgyMDAsIHsgZXRhZzogcmVmIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwNCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRlbGV0ZVJlc291cmNlRGF0YShjb2xsZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc291cmNlOiBzdHJpbmcsIGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGNvbnN0IGNvbGxlY3Rpb25EYXRhID0gY29sbGVjdGlvbiA/IHRoaXMuY29sbGVjdGlvbnMuZ2V0KGNvbGxlY3Rpb24pIDogdGhpcy5kYXRhO1xuXHRcdGlmICghY29sbGVjdGlvbkRhdGEpIHtcblx0XHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoNTAxKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZUtleSA9IEFMTF9TRVJWRVJfUkVTT1VSQ0VTLmZpbmQoa2V5ID0+IGtleSA9PT0gcmVzb3VyY2UpO1xuXHRcdGlmIChyZXNvdXJjZUtleSkge1xuXHRcdFx0Y29sbGVjdGlvbkRhdGEuZGVsZXRlKHJlc291cmNlS2V5KTtcblx0XHRcdHJldHVybiB0aGlzLnRvUmVzcG9uc2UoMjAwKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDQwNCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUNvbGxlY3Rpb24oKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRjb25zdCBjb2xsZWN0aW9uSWQgPSBgJHsrK3RoaXMuY29sbGVjdGlvbkNvdW50ZXJ9YDtcblx0XHR0aGlzLmNvbGxlY3Rpb25zLnNldChjb2xsZWN0aW9uSWQsIG5ldyBNYXAoKSk7XG5cdFx0cmV0dXJuIHRoaXMudG9SZXNwb25zZSgyMDAsIHt9LCBjb2xsZWN0aW9uSWQpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXIoaGVhZGVycz86IElIZWFkZXJzKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHR0aGlzLmNvbGxlY3Rpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5kYXRhLmNsZWFyKCk7XG5cdFx0dGhpcy5zZXNzaW9uID0gbnVsbDtcblx0XHR0aGlzLmNvbGxlY3Rpb25Db3VudGVyID0gMDtcblx0XHRyZXR1cm4gdGhpcy50b1Jlc3BvbnNlKDIwNCk7XG5cdH1cblxuXHRwcml2YXRlIHRvUmVzcG9uc2Uoc3RhdHVzQ29kZTogbnVtYmVyLCBoZWFkZXJzPzogSUhlYWRlcnMsIGRhdGE/OiBzdHJpbmcpOiBJUmVxdWVzdENvbnRleHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXM6IHtcblx0XHRcdFx0aGVhZGVyczogaGVhZGVycyB8fCB7fSxcblx0XHRcdFx0c3RhdHVzQ29kZVxuXHRcdFx0fSxcblx0XHRcdHN0cmVhbTogYnVmZmVyVG9TdHJlYW0oVlNCdWZmZXIuZnJvbVN0cmluZyhkYXRhIHx8ICcnKSlcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0VXNlckRhdGFTeW5jVXRpbFNlcnZpY2UgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jVXRpbFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRhc3luYyByZXNvbHZlRGVmYXVsdENvcmVJZ25vcmVkU2V0dGluZ3MoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiBnZXREZWZhdWx0SWdub3JlZFNldHRpbmdzKCk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlVXNlckJpbmRpbmdzKHVzZXJiaW5kaW5nczogc3RyaW5nW10pOiBQcm9taXNlPElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz4+IHtcblx0XHRjb25zdCBrZXlzOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXliaW5kaW5nIG9mIHVzZXJiaW5kaW5ncykge1xuXHRcdFx0a2V5c1trZXliaW5kaW5nXSA9IGtleWJpbmRpbmc7XG5cdFx0fVxuXHRcdHJldHVybiBrZXlzO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUZvcm1hdHRpbmdPcHRpb25zKGZpbGU/OiBVUkkpOiBQcm9taXNlPEZvcm1hdHRpbmdPcHRpb25zPiB7XG5cdFx0cmV0dXJuIHsgZW9sOiAnXFxuJywgaW5zZXJ0U3BhY2VzOiBmYWxzZSwgdGFiU2l6ZTogNCB9O1xuXHR9XG5cbn1cblxuY2xhc3MgVGVzdFN0b3JhZ2VTZXJ2aWNlIGV4dGVuZHMgSW5NZW1vcnlTdG9yYWdlU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcHJvZmlsZVN0b3JhZ2VQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXHRvdmVycmlkZSBoYXNTY29wZShwcm9maWxlOiBJVXNlckRhdGFQcm9maWxlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucHJvZmlsZVN0b3JhZ2VQcm9maWxlLmlkID09PSBwcm9maWxlLmlkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQixnQkFBZ0I7QUFHekMsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFxQywwQkFBMEIsNkJBQTZCLHlDQUFpRTtBQUM3SixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLE9BQU8sYUFBYTtBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUF1RCx1QkFBdUI7QUFDOUUsU0FBUyx3QkFBd0IsdUJBQXVCO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCLGdDQUFnQztBQUNsRSxTQUFTLG9DQUFvQywyQ0FBMkM7QUFDeEYsU0FBUyxvQkFBb0IsMkJBQXNDLGdDQUFnQyx5QkFBeUIsZ0NBQWdDLHNCQUFzQixxQ0FBcUMsMkJBQTJCLDBCQUEwQix1QkFBdUMsY0FBNkYsNkJBQWdEO0FBQ2hjLFNBQVMsNkJBQTZCLGtDQUFrQztBQUN4RSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDhCQUE4QixtQ0FBbUM7QUFDMUUsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQ0FBb0MsZ0NBQWdDO0FBQzdFLFNBQVMsaUNBQW1ELGdDQUFnQztBQUM1RixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGlDQUFpQztBQUVuQyxNQUFNLDJCQUEyQixXQUFXO0FBQUEsRUFJbEQsWUFBcUIsYUFBcUMsSUFBSSx1QkFBdUIsR0FBRztBQUN2RixVQUFNO0FBRGM7QUFFcEIsU0FBSyx1QkFBdUIsS0FBSyxVQUFVLElBQUkseUJBQXlCLENBQUM7QUFBQSxFQUMxRTtBQUFBLEVBRUEsTUFBTSxNQUFNLFFBQWlCLE9BQXNCO0FBQ2xELFNBQUssVUFBVSxzQkFBc0IsQ0FBQztBQUV0QyxVQUFNLGFBQWEsS0FBSyxxQkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBRW5GLFVBQU0sc0JBQXNCLElBQUksS0FBSyxVQUFVLEVBQUUsS0FBSyxFQUFFLFFBQVEsUUFBUSxTQUFTLENBQUM7QUFDbEYsVUFBTSxtQkFBbUIsU0FBUyxxQkFBcUIsT0FBTztBQUM5RCxVQUFNLHFCQUFxQixLQUFLLHFCQUFxQixLQUFLLHFCQUFxQjtBQUFBLE1BQzlFO0FBQUEsTUFDQTtBQUFBLE1BQ0EsV0FBVyxTQUFTLHFCQUFxQixPQUFPO0FBQUEsTUFDaEQsY0FBYyxTQUFTLHFCQUFxQixXQUFXO0FBQUEsTUFDdkQsTUFBTTtBQUFBLElBQ1AsQ0FBQztBQUVELFNBQUsscUJBQXFCLEtBQUssaUJBQWlCO0FBQUEsTUFDL0MsZUFBZTtBQUFBLE1BQVcsR0FBRztBQUFBLE1BQVMsR0FBRztBQUFBLFFBQ3hDLDJCQUEyQjtBQUFBLFVBQzFCLEtBQUssS0FBSyxXQUFXO0FBQUEsVUFDckIsV0FBVyxLQUFLLFdBQVc7QUFBQSxVQUMzQixhQUFhLEtBQUssV0FBVztBQUFBLFVBQzdCLFdBQVc7QUFBQSxVQUNYLHlCQUF5QixFQUFFLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRSxFQUFFO0FBQUEsUUFDbkQ7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxjQUFjLEtBQUssVUFBVSxJQUFJLFlBQVksVUFBVSxDQUFDO0FBQzlELFNBQUssVUFBVSxZQUFZLGlCQUFpQixRQUFRLFVBQVUsS0FBSyxVQUFVLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBQy9HLFNBQUssVUFBVSxZQUFZLGlCQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBQ3BILFNBQUsscUJBQXFCLEtBQUssY0FBYyxXQUFXO0FBRXhELFVBQU0scUJBQXFCLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLGtCQUFrQixDQUFDO0FBQ3RHLFNBQUsscUJBQXFCLEtBQUsscUJBQXFCLGtCQUFrQjtBQUV0RSxVQUFNLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxnQ0FBZ0Msb0JBQW9CLGFBQWEsb0JBQW9CLFVBQVUsQ0FBQztBQUNuSixTQUFLLHFCQUFxQixLQUFLLDBCQUEwQix1QkFBdUI7QUFFaEYsVUFBTSxpQkFBaUIsS0FBSyxVQUFVLElBQUksbUJBQW1CLHdCQUF3QixjQUFjLENBQUM7QUFDcEcsU0FBSyxxQkFBcUIsS0FBSyxpQkFBaUIsS0FBSyxVQUFVLGNBQWMsQ0FBQztBQUM5RSxTQUFLLHFCQUFxQixLQUFLLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxrQ0FBa0MsT0FBTyxjQUFjLENBQUMsQ0FBQztBQUUzSSxVQUFNLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxxQkFBcUIsd0JBQXdCLGVBQWUsa0JBQWtCLGFBQWEsSUFBSSxrQkFBa0IsR0FBRyxVQUFVLENBQUM7QUFDL0ssVUFBTSxxQkFBcUIsV0FBVztBQUN0QyxTQUFLLHFCQUFxQixLQUFLLHVCQUF1QixvQkFBb0I7QUFFMUUsU0FBSyxxQkFBcUIsS0FBSywyQkFBMkIsRUFBRSxxQkFBcUIsT0FBTyxnQ0FBZ0MsSUFBSSxRQUFpQixFQUFFLE1BQU0sQ0FBQztBQUV0SixTQUFLLHFCQUFxQixLQUFLLGlCQUFpQixLQUFLLFVBQVU7QUFFL0QsU0FBSyxxQkFBcUIsS0FBSyx5QkFBeUIsVUFBVTtBQUNsRSxTQUFLLHFCQUFxQixLQUFLLG1CQUFtQixvQkFBb0I7QUFDdEUsU0FBSyxxQkFBcUIsS0FBSyxxQ0FBcUMsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsa0NBQWtDLENBQUMsQ0FBQztBQUNoSyxTQUFLLHFCQUFxQixLQUFLLDJCQUEyQixLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSx3QkFBd0IsQ0FBQyxDQUFDO0FBRTVJLFVBQU0sNkJBQTBELEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLDBCQUEwQixDQUFDO0FBQ25KLFVBQU0sMkJBQTJCLGNBQWMsRUFBRSwwQkFBMEIsNEJBQTRCLE9BQU8sUUFBUSxDQUFDO0FBQ3ZILFNBQUsscUJBQXFCLEtBQUssNkJBQTZCLDBCQUEwQjtBQUV0RixTQUFLLHFCQUFxQixLQUFLLDhCQUE4QixLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSwyQkFBMkIsQ0FBQyxDQUFDO0FBQ2xKLFNBQUsscUJBQXFCLEtBQUssZ0NBQWdDLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLDZCQUE2QixDQUFDLENBQUM7QUFDdEosU0FBSyxxQkFBcUIsS0FBSywwQkFBMEIsSUFBSSw0QkFBNEIsQ0FBQztBQUMxRixTQUFLLHFCQUFxQixLQUFLLGdDQUFnQyxLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSw2QkFBNkIsQ0FBQyxDQUFDO0FBRXRKLFNBQUsscUJBQXFCLEtBQUssNkJBQTZCO0FBQUEsTUFDM0QsTUFBTSxlQUFlO0FBQUUsZUFBTyxDQUFDO0FBQUEsTUFBRztBQUFBLE1BQ2xDLHdCQUF3QixJQUFJLFFBQTJDLEVBQUU7QUFBQSxNQUN6RSx5QkFBeUIsSUFBSSxRQUFvQyxFQUFFO0FBQUEsSUFDcEUsQ0FBQztBQUNELFNBQUsscUJBQXFCLEtBQUssbUNBQW1DLEtBQUssVUFBVSxLQUFLLHFCQUFxQixlQUFlLGdDQUFnQyxDQUFDLENBQUM7QUFDNUosU0FBSyxxQkFBcUIsS0FBSywwQkFBMEIsS0FBSyxVQUFVLEtBQUsscUJBQXFCLGVBQWUsdUJBQXVCLENBQUMsQ0FBQztBQUMxSSxTQUFLLHFCQUFxQixLQUFLLHFDQUFxQyxLQUFLLHFCQUFxQixlQUFlLGtDQUFrQyxDQUFDO0FBQ2hKLFNBQUsscUJBQXFCLEtBQUssMEJBQTBCO0FBQUEsTUFDeEQsWUFBWTtBQUFFLGVBQU87QUFBQSxNQUFNO0FBQUEsTUFDM0IsTUFBTSx5QkFBeUI7QUFBRSxlQUFPO0FBQUEsTUFBTTtBQUFBLElBQy9DLENBQUM7QUFFRCxTQUFLLHFCQUFxQixLQUFLLHNCQUFzQixLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSxtQkFBbUIsQ0FBQyxDQUFDO0FBRWxJLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxZQUFZLFVBQVUsd0JBQXdCLGVBQWUsa0JBQWtCLFNBQVMsV0FBVyxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUM1SCxZQUFNLFlBQVksVUFBVSx3QkFBd0IsZUFBZSxxQkFBcUIsU0FBUyxXQUFXLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQy9ILFlBQU0sWUFBWSxVQUFVLFNBQVMsd0JBQXdCLGVBQWUsY0FBYyxRQUFRLEdBQUcsU0FBUyxXQUFXLElBQUksQ0FBQztBQUM5SCxZQUFNLFlBQVksVUFBVSxTQUFTLHdCQUF3QixlQUFlLGFBQWEsYUFBYSxHQUFHLFNBQVMsV0FBVyxHQUFHLENBQUM7QUFDakksWUFBTSxZQUFZLFVBQVUsd0JBQXdCLGVBQWUsZUFBZSxTQUFTLFdBQVcsSUFBSSxDQUFDO0FBQzNHLFlBQU0sWUFBWSxVQUFVLG1CQUFtQixjQUFjLFNBQVMsV0FBVyxLQUFLLFVBQVUsRUFBRSxVQUFVLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUNySDtBQUNBLFVBQU0scUJBQXFCLG9CQUFvQjtBQUcvQyxTQUFLLHFCQUNILElBQUksOEJBQThCLEVBQ2xDLHNCQUFzQixhQUFhLFNBQVMsSUFBSTtBQUFBLEVBQ25EO0FBQUEsRUFFQSxNQUFNLE9BQXNCO0FBQzNCLFdBQU8sTUFBTSxLQUFLLHFCQUFxQixJQUFJLG9CQUFvQixFQUFFLGVBQWUsSUFBSSxHQUFHLElBQUk7QUFBQSxFQUM1RjtBQUFBLEVBRUEsS0FBSyxVQUF3QixZQUF5QztBQUNyRSxXQUFPLEtBQUsscUJBQXFCLElBQUkseUJBQXlCLEVBQUUsYUFBYSxVQUFVLE1BQU0sVUFBVTtBQUFBLEVBQ3hHO0FBQUEsRUFFQSxNQUFNLGFBQWEsVUFBZ0Q7QUFDbEUsVUFBTSxXQUFXLE1BQU0sS0FBSyxxQkFBcUI7QUFDakQsV0FBTyxXQUFXLFFBQVEsS0FBSztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFNLHVCQUFrRTtBQUN2RSxVQUFNLFdBQVcsTUFBTSxLQUFLLHFCQUFxQixJQUFJLHlCQUF5QixFQUFFLFNBQVMsSUFBSTtBQUM3RixXQUFPLFVBQVUsVUFBVTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxnQkFBZ0IsUUFBNkM7QUFDNUQsV0FBUSxLQUFLLHFCQUFxQixJQUFJLG9CQUFvQixFQUEwQixxQ0FBcUMsS0FBSyxxQkFBcUIsSUFBSSx3QkFBd0IsRUFBRSxnQkFBZ0IsTUFBUyxFQUFFLFFBQVEsS0FBSyxPQUFLLEVBQUUsYUFBYSxNQUFNO0FBQUEsRUFDcFA7QUFFRDtBQUVBLE1BQU0sdUJBQXlDLENBQUMsR0FBRyxvQkFBb0IsVUFBVTtBQUUxRSxNQUFNLHVCQUFrRDtBQUFBLEVBd0I5RCxZQUE2QixZQUFZLE9BQU8sa0JBQW1DLFlBQXFCO0FBQTNFO0FBQXNEO0FBcEJuRixTQUFTLHVCQUF1QixNQUFNO0FBRXRDLFNBQVMsTUFBYztBQUN2QixTQUFRLFVBQXlCO0FBQ2pDLFNBQWlCLGNBQWMsb0JBQUksSUFBNEM7QUFDL0UsU0FBaUIsT0FBTyxvQkFBSSxJQUErQjtBQUUzRCxTQUFRLFlBQWlFLENBQUM7QUFHMUUsU0FBUSwwQkFBK0UsQ0FBQztBQUd4RixTQUFRLGFBQW1DLENBQUM7QUFJNUMsU0FBUSxjQUFjO0FBQ3RCLFNBQVEsb0JBQW9CO0FBQUEsRUFFOEU7QUFBQSxFQVoxRyxJQUFJLFdBQWdFO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBVztBQUFBLEVBRzdGLElBQUkseUJBQThFO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBeUI7QUFBQSxFQUd6SCxJQUFJLFlBQWtDO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBWTtBQUFBLEVBQ2hFLFFBQWM7QUFBRSxTQUFLLFlBQVksQ0FBQztBQUFHLFNBQUssYUFBYSxDQUFDO0FBQUcsU0FBSywwQkFBMEIsQ0FBQztBQUFBLEVBQUc7QUFBQSxFQU85RixNQUFNLGFBQWEsS0FBMEM7QUFBRSxXQUFPO0FBQUEsRUFBSztBQUFBLEVBQzNFLE1BQU0sb0JBQW9CLFVBQXNEO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFBQSxFQUNwRyxNQUFNLDRCQUE0QixLQUEwQztBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDaEcsTUFBTSxtQkFBc0M7QUFBRSxXQUFPLENBQUM7QUFBQSxFQUFHO0FBQUEsRUFFekQsTUFBTSxRQUFRLFNBQTBCLE9BQW9EO0FBQzNGLFFBQUksS0FBSyxVQUFVLFdBQVcsS0FBSyxXQUFXO0FBQzdDLGFBQU8sS0FBSyxXQUFXLEtBQUssS0FBSyxhQUFhLEVBQUUsZUFBZSxHQUFHLEtBQUssVUFBVSxHQUFHLElBQUksTUFBUztBQUFBLElBQ2xHO0FBQ0EsVUFBTSxVQUFvQixDQUFDO0FBQzNCLFFBQUksUUFBUSxTQUFTO0FBQ3BCLFVBQUksUUFBUSxRQUFRLGVBQWUsR0FBRztBQUNyQyxnQkFBUSxlQUFlLElBQUksUUFBUSxRQUFRLGVBQWU7QUFBQSxNQUMzRDtBQUNBLFVBQUksUUFBUSxRQUFRLFVBQVUsR0FBRztBQUNoQyxnQkFBUSxVQUFVLElBQUksUUFBUSxRQUFRLFVBQVU7QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFDQSxTQUFLLFVBQVUsS0FBSyxFQUFFLEtBQUssUUFBUSxLQUFNLE1BQU0sUUFBUSxNQUFPLFFBQVEsQ0FBQztBQUN2RSxTQUFLLHdCQUF3QixLQUFLLEVBQUUsS0FBSyxRQUFRLEtBQU0sTUFBTSxRQUFRLE1BQU8sU0FBUyxRQUFRLFFBQVEsQ0FBQztBQUN0RyxVQUFNLGlCQUFpQixNQUFNLEtBQUssVUFBVSxPQUFPO0FBQ25ELFNBQUssV0FBVyxLQUFLLEVBQUUsUUFBUSxlQUFlLElBQUksV0FBWSxDQUFDO0FBQy9ELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLFVBQVUsU0FBb0Q7QUFDM0UsVUFBTSxhQUFhLEdBQUcsS0FBSyxHQUFHO0FBQzlCLFVBQU0sZUFBZSxRQUFRLElBQUssUUFBUSxVQUFVLE1BQU0sSUFBSSxRQUFRLElBQUssVUFBVSxXQUFXLE1BQU0sSUFBSTtBQUMxRyxVQUFNLFdBQVcsZUFBZSxhQUFhLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFDM0QsUUFBSSxRQUFRLFNBQVMsU0FBUyxTQUFTLFdBQVcsS0FBSyxTQUFTLENBQUMsTUFBTSxZQUFZO0FBQ2xGLGFBQU8sS0FBSyxZQUFZLFFBQVEsT0FBTztBQUFBLElBQ3hDO0FBQ0EsUUFBSSxRQUFRLFNBQVMsU0FBUyxTQUFTLFdBQVcsS0FBSyxTQUFTLENBQUMsTUFBTSxZQUFZO0FBQ2xGLGFBQU8sS0FBSyxnQkFBZ0IsUUFBVyxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUMsTUFBTSxXQUFXLFNBQVksU0FBUyxDQUFDLEdBQUcsUUFBUSxPQUFPO0FBQUEsSUFDeEg7QUFDQSxRQUFJLFFBQVEsU0FBUyxVQUFVLFNBQVMsV0FBVyxLQUFLLFNBQVMsQ0FBQyxNQUFNLFlBQVk7QUFDbkYsYUFBTyxLQUFLLFVBQVUsUUFBVyxTQUFTLENBQUMsR0FBRyxRQUFRLE1BQU0sUUFBUSxPQUFPO0FBQUEsSUFDNUU7QUFFQSxRQUFJLFFBQVEsU0FBUyxTQUFTLFNBQVMsV0FBVyxLQUFLLFNBQVMsQ0FBQyxNQUFNLGdCQUFnQixTQUFTLENBQUMsTUFBTSxZQUFZO0FBQ2xILGFBQU8sS0FBSyxnQkFBZ0IsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sV0FBVyxTQUFZLFNBQVMsQ0FBQyxHQUFHLFFBQVEsT0FBTztBQUFBLElBQzFIO0FBQ0EsUUFBSSxRQUFRLFNBQVMsVUFBVSxTQUFTLFdBQVcsS0FBSyxTQUFTLENBQUMsTUFBTSxnQkFBZ0IsU0FBUyxDQUFDLE1BQU0sWUFBWTtBQUNuSCxhQUFPLEtBQUssVUFBVSxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxRQUFRLE1BQU0sUUFBUSxPQUFPO0FBQUEsSUFDOUU7QUFDQSxRQUFJLFFBQVEsU0FBUyxZQUFZLFNBQVMsV0FBVyxLQUFLLFNBQVMsQ0FBQyxNQUFNLFlBQVk7QUFDckYsYUFBTyxLQUFLLG1CQUFtQixRQUFXLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDdEQ7QUFDQSxRQUFJLFFBQVEsU0FBUyxZQUFZLFNBQVMsV0FBVyxLQUFLLFNBQVMsQ0FBQyxNQUFNLFlBQVk7QUFDckYsYUFBTyxLQUFLLE1BQU0sUUFBUSxPQUFPO0FBQUEsSUFDbEM7QUFDQSxRQUFJLFFBQVEsU0FBUyxZQUFZLFNBQVMsQ0FBQyxNQUFNLGNBQWM7QUFDOUQsYUFBTyxLQUFLLFdBQVcsR0FBRztBQUFBLElBQzNCO0FBQ0EsUUFBSSxRQUFRLFNBQVMsVUFBVSxTQUFTLFdBQVcsS0FBSyxTQUFTLENBQUMsTUFBTSxjQUFjO0FBQ3JGLGFBQU8sS0FBSyxpQkFBaUI7QUFBQSxJQUM5QjtBQUNBLFdBQU8sS0FBSyxXQUFXLEdBQUc7QUFBQSxFQUMzQjtBQUFBLEVBRUEsTUFBYyxZQUFZLFNBQThDO0FBQ3ZFLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFlBQU0sU0FBeUMsdUJBQU8sT0FBTyxDQUFDLENBQUM7QUFDL0QsV0FBSyxLQUFLLFFBQVEsQ0FBQyxPQUFPLFFBQVEsT0FBTyxHQUFHLElBQUksTUFBTSxHQUFHO0FBQ3pELFVBQUksY0FBdUQ7QUFDM0QsVUFBSSxLQUFLLG1CQUFtQjtBQUMzQixzQkFBYyxDQUFDO0FBQ2YsaUJBQVMsZUFBZSxHQUFHLGdCQUFnQixLQUFLLG1CQUFtQixnQkFBZ0I7QUFDbEYsZ0JBQU0saUJBQWlCLEtBQUssWUFBWSxJQUFJLEdBQUcsWUFBWSxFQUFFO0FBQzdELGNBQUksZ0JBQWdCO0FBQ25CLGtCQUFNQSxVQUF5Qyx1QkFBTyxPQUFPLENBQUMsQ0FBQztBQUMvRCwyQkFBZSxRQUFRLENBQUMsT0FBTyxRQUFRQSxRQUFPLEdBQUcsSUFBSSxNQUFNLEdBQUc7QUFDOUQsd0JBQVksR0FBRyxZQUFZLEVBQUUsSUFBSSxFQUFFLFFBQUFBLFFBQU87QUFBQSxVQUMzQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsWUFBTSxXQUE4QixFQUFFLFNBQVMsS0FBSyxTQUFTLFFBQVEsYUFBYSxLQUFLLElBQUk7QUFDM0YsYUFBTyxLQUFLLFdBQVcsS0FBSyxFQUFFLGdCQUFnQixvQkFBb0IsTUFBTSxHQUFHLEtBQUssYUFBYSxHQUFHLEdBQUcsS0FBSyxVQUFVLFFBQVEsQ0FBQztBQUFBLElBQzVIO0FBQ0EsV0FBTyxLQUFLLFdBQVcsS0FBSyxFQUFFLE1BQU0sR0FBRyxLQUFLLGFBQWEsR0FBRyxDQUFDO0FBQUEsRUFDOUQ7QUFBQSxFQUVBLE1BQWMsZ0JBQWdCLFlBQWdDLFVBQWtCLEtBQWMsVUFBb0IsQ0FBQyxHQUE2QjtBQUMvSSxVQUFNLGlCQUFpQixhQUFhLEtBQUssWUFBWSxJQUFJLFVBQVUsSUFBSSxLQUFLO0FBQzVFLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsYUFBTyxLQUFLLFdBQVcsR0FBRztBQUFBLElBQzNCO0FBRUEsVUFBTSxjQUFjLHFCQUFxQixLQUFLLFNBQU8sUUFBUSxRQUFRO0FBQ3JFLFFBQUksYUFBYTtBQUNoQixZQUFNLE9BQU8sZUFBZSxJQUFJLFdBQVc7QUFDM0MsVUFBSSxPQUFPLE1BQU0sUUFBUSxLQUFLO0FBQzdCLGVBQU8sS0FBSyxXQUFXLEdBQUc7QUFBQSxNQUMzQjtBQUNBLFVBQUksQ0FBQyxNQUFNO0FBQ1YsZUFBTyxLQUFLLFdBQVcsS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDMUM7QUFDQSxVQUFJLFFBQVEsZUFBZSxNQUFNLEtBQUssS0FBSztBQUMxQyxlQUFPLEtBQUssV0FBVyxHQUFHO0FBQUEsTUFDM0I7QUFDQSxhQUFPLEtBQUssV0FBVyxLQUFLLEVBQUUsTUFBTSxLQUFLLElBQUksR0FBRyxLQUFLLFdBQVcsRUFBRTtBQUFBLElBQ25FO0FBQ0EsV0FBTyxLQUFLLFdBQVcsR0FBRztBQUFBLEVBQzNCO0FBQUEsRUFFQSxNQUFjLFVBQVUsWUFBZ0MsVUFBa0IsVUFBa0IsSUFBSSxVQUFvQixDQUFDLEdBQTZCO0FBQ2pKLFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsV0FBSyxVQUFVLGFBQWE7QUFBQSxJQUM3QjtBQUNBLFVBQU0saUJBQWlCLGFBQWEsS0FBSyxZQUFZLElBQUksVUFBVSxJQUFJLEtBQUs7QUFDNUUsUUFBSSxDQUFDLGdCQUFnQjtBQUNwQixhQUFPLEtBQUssV0FBVyxHQUFHO0FBQUEsSUFDM0I7QUFDQSxVQUFNLGNBQWMscUJBQXFCLEtBQUssU0FBTyxRQUFRLFFBQVE7QUFDckUsUUFBSSxhQUFhO0FBQ2hCLFlBQU0sT0FBTyxlQUFlLElBQUksV0FBVztBQUMzQyxVQUFJLFFBQVEsVUFBVSxNQUFNLFVBQWEsUUFBUSxVQUFVLE9BQU8sT0FBTyxLQUFLLE1BQU0sTUFBTTtBQUN6RixlQUFPLEtBQUssV0FBVyxHQUFHO0FBQUEsTUFDM0I7QUFDQSxZQUFNLE1BQU0sR0FBRyxTQUFTLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQztBQUM3QyxxQkFBZSxJQUFJLGFBQWEsRUFBRSxLQUFLLFFBQVEsQ0FBQztBQUNoRCxhQUFPLEtBQUssV0FBVyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxJQUMxQztBQUNBLFdBQU8sS0FBSyxXQUFXLEdBQUc7QUFBQSxFQUMzQjtBQUFBLEVBRUEsTUFBYyxtQkFBbUIsWUFBZ0MsVUFBa0IsVUFBb0IsQ0FBQyxHQUE2QjtBQUNwSSxVQUFNLGlCQUFpQixhQUFhLEtBQUssWUFBWSxJQUFJLFVBQVUsSUFBSSxLQUFLO0FBQzVFLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsYUFBTyxLQUFLLFdBQVcsR0FBRztBQUFBLElBQzNCO0FBRUEsVUFBTSxjQUFjLHFCQUFxQixLQUFLLFNBQU8sUUFBUSxRQUFRO0FBQ3JFLFFBQUksYUFBYTtBQUNoQixxQkFBZSxPQUFPLFdBQVc7QUFDakMsYUFBTyxLQUFLLFdBQVcsR0FBRztBQUFBLElBQzNCO0FBRUEsV0FBTyxLQUFLLFdBQVcsR0FBRztBQUFBLEVBQzNCO0FBQUEsRUFFQSxNQUFjLG1CQUE2QztBQUMxRCxVQUFNLGVBQWUsR0FBRyxFQUFFLEtBQUssaUJBQWlCO0FBQ2hELFNBQUssWUFBWSxJQUFJLGNBQWMsb0JBQUksSUFBSSxDQUFDO0FBQzVDLFdBQU8sS0FBSyxXQUFXLEtBQUssQ0FBQyxHQUFHLFlBQVk7QUFBQSxFQUM3QztBQUFBLEVBRUEsTUFBTSxNQUFNLFNBQThDO0FBQ3pELFNBQUssWUFBWSxNQUFNO0FBQ3ZCLFNBQUssS0FBSyxNQUFNO0FBQ2hCLFNBQUssVUFBVTtBQUNmLFNBQUssb0JBQW9CO0FBQ3pCLFdBQU8sS0FBSyxXQUFXLEdBQUc7QUFBQSxFQUMzQjtBQUFBLEVBRVEsV0FBVyxZQUFvQixTQUFvQixNQUFnQztBQUMxRixXQUFPO0FBQUEsTUFDTixLQUFLO0FBQUEsUUFDSixTQUFTLFdBQVcsQ0FBQztBQUFBLFFBQ3JCO0FBQUEsTUFDRDtBQUFBLE1BQ0EsUUFBUSxlQUFlLFNBQVMsV0FBVyxRQUFRLEVBQUUsQ0FBQztBQUFBLElBQ3ZEO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSw0QkFBZ0U7QUFBQSxFQUk1RSxNQUFNLG9DQUF1RDtBQUM1RCxXQUFPLDBCQUEwQjtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxNQUFNLG9CQUFvQixjQUE0RDtBQUNyRixVQUFNLE9BQWtDLENBQUM7QUFDekMsZUFBVyxjQUFjLGNBQWM7QUFDdEMsV0FBSyxVQUFVLElBQUk7QUFBQSxJQUNwQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLHlCQUF5QixNQUF3QztBQUN0RSxXQUFPLEVBQUUsS0FBSyxNQUFNLGNBQWMsT0FBTyxTQUFTLEVBQUU7QUFBQSxFQUNyRDtBQUVEO0FBRUEsTUFBTSwyQkFBMkIsdUJBQXVCO0FBQUEsRUFDdkQsWUFBNkIsdUJBQXlDO0FBQ3JFLFVBQU07QUFEc0I7QUFBQSxFQUU3QjtBQUFBLEVBQ1MsU0FBUyxTQUFvQztBQUNyRCxXQUFPLEtBQUssc0JBQXNCLE9BQU8sUUFBUTtBQUFBLEVBQ2xEO0FBQ0Q7IiwKICAibmFtZXMiOiBbImxhdGVzdCJdCn0K
