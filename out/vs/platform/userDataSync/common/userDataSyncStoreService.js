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
import { createCancelablePromise, timeout } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { getErrorMessage, isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { Mimes } from "../../../base/common/mime.js";
import { isWeb } from "../../../base/common/platform.js";
import { joinPath, relativePath } from "../../../base/common/resources.js";
import { isObject, isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { IProductService } from "../../product/common/productService.js";
import { asJson, asText, asTextOrError, hasNoContent, IRequestService, isSuccess, isSuccess as isSuccessContext } from "../../request/common/request.js";
import { getServiceMachineId } from "../../externalServices/common/serviceMachineId.js";
import { IStorageService, StorageScope, StorageTarget } from "../../storage/common/storage.js";
import { HEADER_EXECUTION_ID, HEADER_OPERATION_ID, IUserDataSyncLogService, IUserDataSyncStoreManagementService, SYNC_SERVICE_URL_TYPE, UserDataSyncErrorCode, UserDataSyncStoreError } from "./userDataSync.js";
const CONFIGURATION_SYNC_STORE_KEY = "configurationSync.store";
const SYNC_PREVIOUS_STORE = "sync.previous.store";
const DONOT_MAKE_REQUESTS_UNTIL_KEY = "sync.donot-make-requests-until";
const USER_SESSION_ID_KEY = "sync.user-session-id";
const MACHINE_SESSION_ID_KEY = "sync.machine-session-id";
const REQUEST_SESSION_LIMIT = 100;
const REQUEST_SESSION_INTERVAL = 1e3 * 60 * 5;
let AbstractUserDataSyncStoreManagementService = class extends Disposable {
  constructor(productService, configurationService, storageService) {
    super();
    this.productService = productService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this._onDidChangeUserDataSyncStore = this._register(new Emitter());
    this.onDidChangeUserDataSyncStore = this._onDidChangeUserDataSyncStore.event;
    this.updateUserDataSyncStore();
    const disposable = this._register(new DisposableStore());
    this._register(Event.filter(storageService.onDidChangeValue(StorageScope.APPLICATION, SYNC_SERVICE_URL_TYPE, disposable), () => this.userDataSyncStoreType !== this.userDataSyncStore?.type, disposable)(() => this.updateUserDataSyncStore()));
  }
  get userDataSyncStore() {
    return this._userDataSyncStore;
  }
  get userDataSyncStoreType() {
    return this.storageService.get(SYNC_SERVICE_URL_TYPE, StorageScope.APPLICATION);
  }
  set userDataSyncStoreType(type) {
    this.storageService.store(SYNC_SERVICE_URL_TYPE, type, StorageScope.APPLICATION, isWeb ? StorageTarget.USER : StorageTarget.MACHINE);
  }
  updateUserDataSyncStore() {
    this._userDataSyncStore = this.toUserDataSyncStore(this.productService[CONFIGURATION_SYNC_STORE_KEY]);
    this._onDidChangeUserDataSyncStore.fire();
  }
  toUserDataSyncStore(configurationSyncStore) {
    if (!configurationSyncStore) {
      return void 0;
    }
    configurationSyncStore = isWeb && configurationSyncStore.web ? { ...configurationSyncStore, ...configurationSyncStore.web } : configurationSyncStore;
    if (isString(configurationSyncStore.url) && isObject(configurationSyncStore.authenticationProviders) && Object.keys(configurationSyncStore.authenticationProviders).every((authenticationProviderId) => Array.isArray(configurationSyncStore.authenticationProviders[authenticationProviderId].scopes))) {
      const syncStore = configurationSyncStore;
      const canSwitch = !!syncStore.canSwitch;
      const defaultType = syncStore.url === syncStore.insidersUrl ? "insiders" : "stable";
      const type = (canSwitch ? this.userDataSyncStoreType : void 0) || defaultType;
      const url = type === "insiders" ? syncStore.insidersUrl : type === "stable" ? syncStore.stableUrl : syncStore.url;
      return {
        url: URI.parse(url),
        type,
        defaultType,
        defaultUrl: URI.parse(syncStore.url),
        stableUrl: URI.parse(syncStore.stableUrl),
        insidersUrl: URI.parse(syncStore.insidersUrl),
        canSwitch,
        authenticationProviders: Object.keys(syncStore.authenticationProviders).reduce((result, id) => {
          result.push({ id, scopes: syncStore.authenticationProviders[id].scopes });
          return result;
        }, [])
      };
    }
    return void 0;
  }
};
AbstractUserDataSyncStoreManagementService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService)
], AbstractUserDataSyncStoreManagementService);
let UserDataSyncStoreManagementService = class extends AbstractUserDataSyncStoreManagementService {
  constructor(productService, configurationService, storageService) {
    super(productService, configurationService, storageService);
    const previousConfigurationSyncStore = this.storageService.get(SYNC_PREVIOUS_STORE, StorageScope.APPLICATION);
    if (previousConfigurationSyncStore) {
      this.previousConfigurationSyncStore = JSON.parse(previousConfigurationSyncStore);
    }
    const syncStore = this.productService[CONFIGURATION_SYNC_STORE_KEY];
    if (syncStore) {
      this.storageService.store(SYNC_PREVIOUS_STORE, JSON.stringify(syncStore), StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(SYNC_PREVIOUS_STORE, StorageScope.APPLICATION);
    }
  }
  async switch(type) {
    if (type !== this.userDataSyncStoreType) {
      this.userDataSyncStoreType = type;
      this.updateUserDataSyncStore();
    }
  }
  async getPreviousUserDataSyncStore() {
    return this.toUserDataSyncStore(this.previousConfigurationSyncStore);
  }
};
UserDataSyncStoreManagementService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService)
], UserDataSyncStoreManagementService);
let UserDataSyncStoreClient = class extends Disposable {
  constructor(userDataSyncStoreUrl, productService, requestService, logService, environmentService, fileService, storageService) {
    super();
    this.requestService = requestService;
    this.logService = logService;
    this.storageService = storageService;
    this._onTokenFailed = this._register(new Emitter());
    this.onTokenFailed = this._onTokenFailed.event;
    this._onTokenSucceed = this._register(new Emitter());
    this.onTokenSucceed = this._onTokenSucceed.event;
    this._donotMakeRequestsUntil = void 0;
    this._onDidChangeDonotMakeRequestsUntil = this._register(new Emitter());
    this.onDidChangeDonotMakeRequestsUntil = this._onDidChangeDonotMakeRequestsUntil.event;
    this.resetDonotMakeRequestsUntilPromise = void 0;
    this.updateUserDataSyncStoreUrl(userDataSyncStoreUrl);
    this.commonHeadersPromise = getServiceMachineId(environmentService, fileService, storageService).then((uuid) => {
      const headers = {
        "X-Client-Name": `${productService.applicationName}${isWeb ? "-web" : ""}`,
        "X-Client-Version": productService.version
      };
      if (productService.commit) {
        headers["X-Client-Commit"] = productService.commit;
      }
      return headers;
    });
    this.session = new RequestsSession(REQUEST_SESSION_LIMIT, REQUEST_SESSION_INTERVAL, this.requestService, this.logService);
    this.initDonotMakeRequestsUntil();
    this._register(toDisposable(() => {
      if (this.resetDonotMakeRequestsUntilPromise) {
        this.resetDonotMakeRequestsUntilPromise.cancel();
        this.resetDonotMakeRequestsUntilPromise = void 0;
      }
    }));
  }
  get donotMakeRequestsUntil() {
    return this._donotMakeRequestsUntil;
  }
  setAuthToken(token, type) {
    this.authToken = { token, type };
  }
  updateUserDataSyncStoreUrl(userDataSyncStoreUrl) {
    this.userDataSyncStoreUrl = userDataSyncStoreUrl ? joinPath(userDataSyncStoreUrl, "v1") : void 0;
  }
  initDonotMakeRequestsUntil() {
    const donotMakeRequestsUntil = this.storageService.getNumber(DONOT_MAKE_REQUESTS_UNTIL_KEY, StorageScope.APPLICATION);
    if (donotMakeRequestsUntil && Date.now() < donotMakeRequestsUntil) {
      this.setDonotMakeRequestsUntil(new Date(donotMakeRequestsUntil));
    }
  }
  setDonotMakeRequestsUntil(donotMakeRequestsUntil) {
    if (this._donotMakeRequestsUntil?.getTime() !== donotMakeRequestsUntil?.getTime()) {
      this._donotMakeRequestsUntil = donotMakeRequestsUntil;
      if (this.resetDonotMakeRequestsUntilPromise) {
        this.resetDonotMakeRequestsUntilPromise.cancel();
        this.resetDonotMakeRequestsUntilPromise = void 0;
      }
      if (this._donotMakeRequestsUntil) {
        this.storageService.store(DONOT_MAKE_REQUESTS_UNTIL_KEY, this._donotMakeRequestsUntil.getTime(), StorageScope.APPLICATION, StorageTarget.MACHINE);
        this.resetDonotMakeRequestsUntilPromise = createCancelablePromise((token) => timeout(this._donotMakeRequestsUntil.getTime() - Date.now(), token).then(() => this.setDonotMakeRequestsUntil(void 0)));
        this.resetDonotMakeRequestsUntilPromise.then(
          null,
          (e) => null
          /* ignore error */
        );
      } else {
        this.storageService.remove(DONOT_MAKE_REQUESTS_UNTIL_KEY, StorageScope.APPLICATION);
      }
      this._onDidChangeDonotMakeRequestsUntil.fire();
    }
  }
  // #region Collection
  async getAllCollections(headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "collection").toString();
    headers = { ...headers };
    headers["Content-Type"] = "application/json";
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.getAllCollections" }, [], CancellationToken.None);
    return (await asJson(context))?.map(({ id }) => id) || [];
  }
  async createCollection(headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "collection").toString();
    headers = { ...headers };
    headers["Content-Type"] = Mimes.text;
    const context = await this.request(url, { type: "POST", headers, callSite: "userDataSync.createCollection" }, [], CancellationToken.None);
    const collectionId = await asTextOrError(context);
    if (!collectionId) {
      throw new UserDataSyncStoreError("Server did not return the collection id", url, UserDataSyncErrorCode.NoCollection, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    return collectionId;
  }
  async deleteCollection(collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = collection ? joinPath(this.userDataSyncStoreUrl, "collection", collection).toString() : joinPath(this.userDataSyncStoreUrl, "collection").toString();
    headers = { ...headers };
    await this.request(url, { type: "DELETE", headers, callSite: "userDataSync.deleteCollection" }, [], CancellationToken.None);
  }
  // #endregion
  // #region Resource
  async getAllResourceRefs(resource, collection) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const uri = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource);
    const headers = {};
    const context = await this.request(uri.toString(), { type: "GET", headers, callSite: "userDataSync.getAllResourceRefs" }, [], CancellationToken.None);
    const result = await asJson(context) || [];
    return result.map(({ url, created }) => ({
      ref: relativePath(uri, uri.with({ path: url })),
      created: created * 1e3
      /* Server returns in seconds */
    }));
  }
  async resolveResourceContent(resource, ref, collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString();
    headers = { ...headers };
    headers["Cache-Control"] = "no-cache";
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.resolveResourceContent" }, [], CancellationToken.None);
    const content = await asTextOrError(context);
    return content;
  }
  async deleteResource(resource, ref, collection) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = ref !== null ? joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), ref).toString() : this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
    const headers = {};
    await this.request(url, { type: "DELETE", headers, callSite: "userDataSync.deleteResource" }, [], CancellationToken.None);
  }
  async deleteResources() {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "resource").toString();
    const headers = { "Content-Type": Mimes.text };
    await this.request(url, { type: "DELETE", headers, callSite: "userDataSync.deleteResources" }, [], CancellationToken.None);
  }
  async readResource(resource, oldValue, collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource), "latest").toString();
    headers = { ...headers };
    headers["Cache-Control"] = "no-cache";
    if (oldValue) {
      headers["If-None-Match"] = oldValue.ref;
    }
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.readResource" }, [304], CancellationToken.None);
    let userData = null;
    if (context.res.statusCode === 304) {
      userData = oldValue;
    }
    if (userData === null) {
      const ref = context.res.headers["etag"];
      if (!ref) {
        throw new UserDataSyncStoreError("Server did not return the ref", url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      const content = await asTextOrError(context);
      if (!content && context.res.statusCode === 304) {
        throw new UserDataSyncStoreError("Empty response", url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      userData = { ref, content };
    }
    return userData;
  }
  async writeResource(resource, data, ref, collection, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = this.getResourceUrl(this.userDataSyncStoreUrl, collection, resource).toString();
    headers = { ...headers };
    headers["Content-Type"] = Mimes.text;
    if (ref) {
      headers["If-Match"] = ref;
    }
    const context = await this.request(url, { type: "POST", data, headers, callSite: "userDataSync.writeResource" }, [], CancellationToken.None);
    const newRef = context.res.headers["etag"];
    if (!newRef) {
      throw new UserDataSyncStoreError("Server did not return the ref", url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    return newRef;
  }
  // #endregion
  async manifest(oldValue, headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "manifest").toString();
    headers = { ...headers };
    headers["Content-Type"] = "application/json";
    if (oldValue) {
      headers["If-None-Match"] = oldValue.ref;
    }
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.manifest" }, [304], CancellationToken.None);
    let manifest = null;
    if (context.res.statusCode === 304) {
      manifest = oldValue;
    }
    if (!manifest) {
      const ref = context.res.headers["etag"];
      if (!ref) {
        throw new UserDataSyncStoreError("Server did not return the ref", url, UserDataSyncErrorCode.NoRef, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      const content = await asTextOrError(context);
      if (!content && context.res.statusCode === 304) {
        throw new UserDataSyncStoreError("Empty response", url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
      }
      if (content) {
        manifest = { ...JSON.parse(content), ref };
      }
    }
    const currentSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
    if (currentSessionId && manifest && currentSessionId !== manifest.session) {
      this.clearSession();
    }
    if (manifest === null && currentSessionId) {
      this.clearSession();
    }
    if (manifest) {
      this.storageService.store(USER_SESSION_ID_KEY, manifest.session, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return manifest;
  }
  async clear() {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    await this.deleteCollection();
    await this.deleteResources();
    this.clearSession();
  }
  async getLatestData(headers = {}) {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "download", "latest").toString();
    headers = { ...headers };
    headers["Content-Type"] = "application/json";
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.getLatestData" }, [], CancellationToken.None);
    if (!isSuccess(context)) {
      throw new UserDataSyncStoreError("Server returned " + context.res.statusCode, url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    const serverData = await asJson(context);
    if (!serverData) {
      return null;
    }
    const result = {};
    if (serverData.resources) {
      result.resources = {};
      for (const resource in serverData.resources) {
        const [resourceData] = serverData.resources[resource];
        result.resources[resource] = {
          content: resourceData.content,
          ref: resourceData.ref
        };
      }
    }
    if (serverData.collections) {
      result.collections = {};
      for (const collection in serverData.collections) {
        const resources = {};
        result.collections[collection] = { resources };
        for (const resource in serverData.collections[collection].resources) {
          const [resourceData] = serverData.collections[collection].resources[resource];
          resources[resource] = {
            content: resourceData.content,
            ref: resourceData.ref
          };
        }
      }
    }
    return result;
  }
  async getActivityData() {
    if (!this.userDataSyncStoreUrl) {
      throw new Error("No settings sync store url configured.");
    }
    const url = joinPath(this.userDataSyncStoreUrl, "download").toString();
    const headers = {};
    const context = await this.request(url, { type: "GET", headers, callSite: "userDataSync.getActivityData" }, [], CancellationToken.None);
    if (!isSuccess(context)) {
      throw new UserDataSyncStoreError("Server returned " + context.res.statusCode, url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    if (hasNoContent(context)) {
      throw new UserDataSyncStoreError("Empty response", url, UserDataSyncErrorCode.EmptyResponse, context.res.statusCode, context.res.headers[HEADER_OPERATION_ID]);
    }
    return context.stream;
  }
  getResourceUrl(userDataSyncStoreUrl, collection, resource) {
    return collection ? joinPath(userDataSyncStoreUrl, "collection", collection, "resource", resource) : joinPath(userDataSyncStoreUrl, "resource", resource);
  }
  clearSession() {
    this.storageService.remove(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
    this.storageService.remove(MACHINE_SESSION_ID_KEY, StorageScope.APPLICATION);
  }
  async request(url, options, successCodes, token) {
    if (!this.authToken) {
      throw new UserDataSyncStoreError("No Auth Token Available", url, UserDataSyncErrorCode.Unauthorized, void 0, void 0);
    }
    if (this._donotMakeRequestsUntil && Date.now() < this._donotMakeRequestsUntil.getTime()) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter, void 0, void 0);
    }
    this.setDonotMakeRequestsUntil(void 0);
    const commonHeaders = await this.commonHeadersPromise;
    options.headers = {
      ...options.headers || {},
      ...commonHeaders,
      "X-Account-Type": this.authToken.type,
      "authorization": `Bearer ${this.authToken.token}`
    };
    this.addSessionHeaders(options.headers);
    this.logService.trace("Sending request to server", { url, type: options.type, headers: { ...options.headers, ...{ authorization: void 0 } } });
    let context;
    try {
      context = await this.session.request(url, options, token);
    } catch (e) {
      if (!(e instanceof UserDataSyncStoreError)) {
        let code = UserDataSyncErrorCode.RequestFailed;
        const errorMessage = getErrorMessage(e).toLowerCase();
        if (errorMessage.includes("xhr timeout")) {
          code = UserDataSyncErrorCode.RequestTimeout;
        } else if (errorMessage.includes("protocol") && errorMessage.includes("not supported")) {
          code = UserDataSyncErrorCode.RequestProtocolNotSupported;
        } else if (errorMessage.includes("request path contains unescaped characters")) {
          code = UserDataSyncErrorCode.RequestPathNotEscaped;
        } else if (errorMessage.includes("headers must be an object")) {
          code = UserDataSyncErrorCode.RequestHeadersNotObject;
        } else if (isCancellationError(e)) {
          code = UserDataSyncErrorCode.RequestCanceled;
        }
        e = new UserDataSyncStoreError(`Connection refused for the request '${url}'.`, url, code, void 0, void 0);
      }
      this.logService.info("Request failed", url);
      throw e;
    }
    const operationId = context.res.headers[HEADER_OPERATION_ID];
    const requestInfo = { url, status: context.res.statusCode, "execution-id": options.headers[HEADER_EXECUTION_ID], "operation-id": operationId };
    const isSuccess2 = isSuccessContext(context) || context.res.statusCode && successCodes.includes(context.res.statusCode);
    let failureMessage = "";
    if (isSuccess2) {
      this.logService.trace("Request succeeded", requestInfo);
    } else {
      failureMessage = await asText(context) || "";
      this.logService.info("Request failed", requestInfo, failureMessage);
    }
    if (context.res.statusCode === 401 || context.res.statusCode === 403) {
      this.authToken = void 0;
      if (context.res.statusCode === 401) {
        this._onTokenFailed.fire(UserDataSyncErrorCode.Unauthorized);
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Unauthorized (401).`, url, UserDataSyncErrorCode.Unauthorized, context.res.statusCode, operationId);
      }
      if (context.res.statusCode === 403) {
        this._onTokenFailed.fire(UserDataSyncErrorCode.Forbidden);
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the access is forbidden (403).`, url, UserDataSyncErrorCode.Forbidden, context.res.statusCode, operationId);
      }
    }
    this._onTokenSucceed.fire();
    if (context.res.statusCode === 404) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not found (404).`, url, UserDataSyncErrorCode.NotFound, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 405) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested endpoint is not found (405). ${failureMessage}`, url, UserDataSyncErrorCode.MethodNotFound, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 409) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Conflict (409). There is new data for this resource. Make the request again with latest data.`, url, UserDataSyncErrorCode.Conflict, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 410) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because the requested resource is not longer available (410).`, url, UserDataSyncErrorCode.Gone, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 412) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of Precondition Failed (412). There is new data for this resource. Make the request again with latest data.`, url, UserDataSyncErrorCode.PreconditionFailed, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 413) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too large payload (413).`, url, UserDataSyncErrorCode.TooLarge, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 426) {
      throw new UserDataSyncStoreError(`${options.type} request '${url}' failed with status Upgrade Required (426). Please upgrade the client and try again.`, url, UserDataSyncErrorCode.UpgradeRequired, context.res.statusCode, operationId);
    }
    if (context.res.statusCode === 429) {
      const retryAfter = context.res.headers["retry-after"];
      if (retryAfter) {
        this.setDonotMakeRequestsUntil(new Date(Date.now() + parseInt(retryAfter) * 1e3));
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequestsAndRetryAfter, context.res.statusCode, operationId);
      } else {
        throw new UserDataSyncStoreError(`${options.type} request '${url}' failed because of too many requests (429).`, url, UserDataSyncErrorCode.TooManyRequests, context.res.statusCode, operationId);
      }
    }
    if (!isSuccess2) {
      throw new UserDataSyncStoreError("Server returned " + context.res.statusCode, url, UserDataSyncErrorCode.Unknown, context.res.statusCode, operationId);
    }
    return context;
  }
  addSessionHeaders(headers) {
    let machineSessionId = this.storageService.get(MACHINE_SESSION_ID_KEY, StorageScope.APPLICATION);
    if (machineSessionId === void 0) {
      machineSessionId = generateUuid();
      this.storageService.store(MACHINE_SESSION_ID_KEY, machineSessionId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    headers["X-Machine-Session-Id"] = machineSessionId;
    const userSessionId = this.storageService.get(USER_SESSION_ID_KEY, StorageScope.APPLICATION);
    if (userSessionId !== void 0) {
      headers["X-User-Session-Id"] = userSessionId;
    }
  }
};
UserDataSyncStoreClient = __decorateClass([
  __decorateParam(1, IProductService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IStorageService)
], UserDataSyncStoreClient);
let UserDataSyncStoreService = class extends UserDataSyncStoreClient {
  constructor(userDataSyncStoreManagementService, productService, requestService, logService, environmentService, fileService, storageService) {
    super(userDataSyncStoreManagementService.userDataSyncStore?.url, productService, requestService, logService, environmentService, fileService, storageService);
    this._register(userDataSyncStoreManagementService.onDidChangeUserDataSyncStore(() => this.updateUserDataSyncStoreUrl(userDataSyncStoreManagementService.userDataSyncStore?.url)));
  }
};
UserDataSyncStoreService = __decorateClass([
  __decorateParam(0, IUserDataSyncStoreManagementService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IStorageService)
], UserDataSyncStoreService);
class RequestsSession {
  constructor(limit, interval, requestService, logService) {
    this.limit = limit;
    this.interval = interval;
    this.requestService = requestService;
    this.logService = logService;
    this.requests = [];
    this.startTime = void 0;
  }
  request(url, options, token) {
    if (this.isExpired()) {
      this.reset();
    }
    options.url = url;
    if (this.requests.length >= this.limit) {
      this.logService.info("Too many requests", ...this.requests);
      throw new UserDataSyncStoreError(`Too many requests. Only ${this.limit} requests allowed in ${this.interval / (1e3 * 60)} minutes.`, url, UserDataSyncErrorCode.LocalTooManyRequests, void 0, void 0);
    }
    this.startTime = this.startTime || /* @__PURE__ */ new Date();
    this.requests.push(url);
    return this.requestService.request(options, token);
  }
  isExpired() {
    return this.startTime !== void 0 && (/* @__PURE__ */ new Date()).getTime() - this.startTime.getTime() > this.interval;
  }
  reset() {
    this.requests = [];
    this.startTime = void 0;
  }
}
export {
  AbstractUserDataSyncStoreManagementService,
  RequestsSession,
  UserDataSyncStoreClient,
  UserDataSyncStoreManagementService,
  UserDataSyncStoreService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jU3RvcmVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblN5bmNTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgam9pblBhdGgsIHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJSGVhZGVycywgSVJlcXVlc3RDb250ZXh0LCBJUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhc0pzb24sIGFzVGV4dCwgYXNUZXh0T3JFcnJvciwgaGFzTm9Db250ZW50LCBJUmVxdWVzdFNlcnZpY2UsIGlzU3VjY2VzcywgaXNTdWNjZXNzIGFzIGlzU3VjY2Vzc0NvbnRleHQgfSBmcm9tICcuLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IGdldFNlcnZpY2VNYWNoaW5lSWQgfSBmcm9tICcuLi8uLi9leHRlcm5hbFNlcnZpY2VzL2NvbW1vbi9zZXJ2aWNlTWFjaGluZUlkLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBIRUFERVJfRVhFQ1VUSU9OX0lELCBIRUFERVJfT1BFUkFUSU9OX0lELCBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgSVJlc291cmNlUmVmSGFuZGxlLCBJVXNlckRhdGEsIElVc2VyRGF0YU1hbmlmZXN0LCBJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSwgSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZSwgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTdG9yZVNlcnZpY2UsIFNlcnZlclJlc291cmNlLCBTWU5DX1NFUlZJQ0VfVVJMX1RZUEUsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgVXNlckRhdGFTeW5jU3RvcmVFcnJvciwgVXNlckRhdGFTeW5jU3RvcmVUeXBlIH0gZnJvbSAnLi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcblxudHlwZSBJRG93bmxvYWRMYXRlc3REYXRhVHlwZSA9IHtcblx0cmVzb3VyY2VzPzoge1xuXHRcdFtyZXNvdXJjZUlkOiBzdHJpbmddOiBbSVVzZXJEYXRhXTtcblx0fTtcblx0Y29sbGVjdGlvbnM/OiB7XG5cdFx0W2NvbGxlY3Rpb25JZDogc3RyaW5nXToge1xuXHRcdFx0cmVzb3VyY2VzPzoge1xuXHRcdFx0XHRbcmVzb3VyY2VJZDogc3RyaW5nXTogW0lVc2VyRGF0YV07XG5cdFx0XHR9IHwgdW5kZWZpbmVkO1xuXHRcdH07XG5cdH07XG59O1xuXG5jb25zdCBDT05GSUdVUkFUSU9OX1NZTkNfU1RPUkVfS0VZID0gJ2NvbmZpZ3VyYXRpb25TeW5jLnN0b3JlJztcbmNvbnN0IFNZTkNfUFJFVklPVVNfU1RPUkUgPSAnc3luYy5wcmV2aW91cy5zdG9yZSc7XG5jb25zdCBET05PVF9NQUtFX1JFUVVFU1RTX1VOVElMX0tFWSA9ICdzeW5jLmRvbm90LW1ha2UtcmVxdWVzdHMtdW50aWwnO1xuY29uc3QgVVNFUl9TRVNTSU9OX0lEX0tFWSA9ICdzeW5jLnVzZXItc2Vzc2lvbi1pZCc7XG5jb25zdCBNQUNISU5FX1NFU1NJT05fSURfS0VZID0gJ3N5bmMubWFjaGluZS1zZXNzaW9uLWlkJztcbmNvbnN0IFJFUVVFU1RfU0VTU0lPTl9MSU1JVCA9IDEwMDtcbmNvbnN0IFJFUVVFU1RfU0VTU0lPTl9JTlRFUlZBTCA9IDEwMDAgKiA2MCAqIDU7IC8qIDUgbWludXRlcyAqL1xuXG50eXBlIFVzZXJEYXRhU3luY1N0b3JlID0gSVVzZXJEYXRhU3luY1N0b3JlICYgeyBkZWZhdWx0VHlwZTogVXNlckRhdGFTeW5jU3RvcmVUeXBlIH07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVVzZXJEYXRhU3luY1N0b3JlTWFuYWdlbWVudFNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVVzZXJEYXRhU3luY1N0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVXNlckRhdGFTeW5jU3RvcmUgPSB0aGlzLl9vbkRpZENoYW5nZVVzZXJEYXRhU3luY1N0b3JlLmV2ZW50O1xuXHRwcml2YXRlIF91c2VyRGF0YVN5bmNTdG9yZTogVXNlckRhdGFTeW5jU3RvcmUgfCB1bmRlZmluZWQ7XG5cdGdldCB1c2VyRGF0YVN5bmNTdG9yZSgpOiBVc2VyRGF0YVN5bmNTdG9yZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl91c2VyRGF0YVN5bmNTdG9yZTsgfVxuXG5cdHByb3RlY3RlZCBnZXQgdXNlckRhdGFTeW5jU3RvcmVUeXBlKCk6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNZTkNfU0VSVklDRV9VUkxfVFlQRSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSBhcyBVc2VyRGF0YVN5bmNTdG9yZVR5cGU7XG5cdH1cblx0cHJvdGVjdGVkIHNldCB1c2VyRGF0YVN5bmNTdG9yZVR5cGUodHlwZTogVXNlckRhdGFTeW5jU3RvcmVUeXBlIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTWU5DX1NFUlZJQ0VfVVJMX1RZUEUsIHR5cGUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgaXNXZWIgPyBTdG9yYWdlVGFyZ2V0LlVTRVIgLyogc3luYyBpbiB3ZWIgKi8gOiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy51cGRhdGVVc2VyRGF0YVN5bmNTdG9yZSgpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcihzdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU1lOQ19TRVJWSUNFX1VSTF9UWVBFLCBkaXNwb3NhYmxlKSwgKCkgPT4gdGhpcy51c2VyRGF0YVN5bmNTdG9yZVR5cGUgIT09IHRoaXMudXNlckRhdGFTeW5jU3RvcmU/LnR5cGUsIGRpc3Bvc2FibGUpKCgpID0+IHRoaXMudXBkYXRlVXNlckRhdGFTeW5jU3RvcmUoKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVVzZXJEYXRhU3luY1N0b3JlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3VzZXJEYXRhU3luY1N0b3JlID0gdGhpcy50b1VzZXJEYXRhU3luY1N0b3JlKHRoaXMucHJvZHVjdFNlcnZpY2VbQ09ORklHVVJBVElPTl9TWU5DX1NUT1JFX0tFWV0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVXNlckRhdGFTeW5jU3RvcmUuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHRvVXNlckRhdGFTeW5jU3RvcmUoY29uZmlndXJhdGlvblN5bmNTdG9yZTogQ29uZmlndXJhdGlvblN5bmNTdG9yZSAmIHsgd2ViPzogQ29uZmlndXJhdGlvblN5bmNTdG9yZSB9IHwgdW5kZWZpbmVkKTogVXNlckRhdGFTeW5jU3RvcmUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghY29uZmlndXJhdGlvblN5bmNTdG9yZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gQ2hlY2sgZm9yIHdlYiBvdmVycmlkZXMgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgd2hpbGUgcmVhZGluZyBwcmV2aW91cyBzdG9yZVxuXHRcdGNvbmZpZ3VyYXRpb25TeW5jU3RvcmUgPSBpc1dlYiAmJiBjb25maWd1cmF0aW9uU3luY1N0b3JlLndlYiA/IHsgLi4uY29uZmlndXJhdGlvblN5bmNTdG9yZSwgLi4uY29uZmlndXJhdGlvblN5bmNTdG9yZS53ZWIgfSA6IGNvbmZpZ3VyYXRpb25TeW5jU3RvcmU7XG5cdFx0aWYgKGlzU3RyaW5nKGNvbmZpZ3VyYXRpb25TeW5jU3RvcmUudXJsKVxuXHRcdFx0JiYgaXNPYmplY3QoY29uZmlndXJhdGlvblN5bmNTdG9yZS5hdXRoZW50aWNhdGlvblByb3ZpZGVycylcblx0XHRcdCYmIE9iamVjdC5rZXlzKGNvbmZpZ3VyYXRpb25TeW5jU3RvcmUuYXV0aGVudGljYXRpb25Qcm92aWRlcnMpLmV2ZXJ5KGF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCA9PiBBcnJheS5pc0FycmF5KGNvbmZpZ3VyYXRpb25TeW5jU3RvcmUuYXV0aGVudGljYXRpb25Qcm92aWRlcnNbYXV0aGVudGljYXRpb25Qcm92aWRlcklkXS5zY29wZXMpKVxuXHRcdCkge1xuXHRcdFx0Y29uc3Qgc3luY1N0b3JlID0gY29uZmlndXJhdGlvblN5bmNTdG9yZSBhcyBDb25maWd1cmF0aW9uU3luY1N0b3JlO1xuXHRcdFx0Y29uc3QgY2FuU3dpdGNoID0gISFzeW5jU3RvcmUuY2FuU3dpdGNoO1xuXHRcdFx0Y29uc3QgZGVmYXVsdFR5cGU6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSA9IHN5bmNTdG9yZS51cmwgPT09IHN5bmNTdG9yZS5pbnNpZGVyc1VybCA/ICdpbnNpZGVycycgOiAnc3RhYmxlJztcblx0XHRcdGNvbnN0IHR5cGU6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSA9IChjYW5Td2l0Y2ggPyB0aGlzLnVzZXJEYXRhU3luY1N0b3JlVHlwZSA6IHVuZGVmaW5lZCkgfHwgZGVmYXVsdFR5cGU7XG5cdFx0XHRjb25zdCB1cmwgPSB0eXBlID09PSAnaW5zaWRlcnMnID8gc3luY1N0b3JlLmluc2lkZXJzVXJsXG5cdFx0XHRcdDogdHlwZSA9PT0gJ3N0YWJsZScgPyBzeW5jU3RvcmUuc3RhYmxlVXJsXG5cdFx0XHRcdFx0OiBzeW5jU3RvcmUudXJsO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJsOiBVUkkucGFyc2UodXJsKSxcblx0XHRcdFx0dHlwZSxcblx0XHRcdFx0ZGVmYXVsdFR5cGUsXG5cdFx0XHRcdGRlZmF1bHRVcmw6IFVSSS5wYXJzZShzeW5jU3RvcmUudXJsKSxcblx0XHRcdFx0c3RhYmxlVXJsOiBVUkkucGFyc2Uoc3luY1N0b3JlLnN0YWJsZVVybCksXG5cdFx0XHRcdGluc2lkZXJzVXJsOiBVUkkucGFyc2Uoc3luY1N0b3JlLmluc2lkZXJzVXJsKSxcblx0XHRcdFx0Y2FuU3dpdGNoLFxuXHRcdFx0XHRhdXRoZW50aWNhdGlvblByb3ZpZGVyczogT2JqZWN0LmtleXMoc3luY1N0b3JlLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzKS5yZWR1Y2U8SUF1dGhlbnRpY2F0aW9uUHJvdmlkZXJbXT4oKHJlc3VsdCwgaWQpID0+IHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7IGlkLCBzY29wZXM6IHN5bmNTdG9yZS5hdXRoZW50aWNhdGlvblByb3ZpZGVyc1tpZF0uc2NvcGVzIH0pO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0sIFtdKVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFic3RyYWN0IHN3aXRjaCh0eXBlOiBVc2VyRGF0YVN5bmNTdG9yZVR5cGUpOiBQcm9taXNlPHZvaWQ+O1xuXHRhYnN0cmFjdCBnZXRQcmV2aW91c1VzZXJEYXRhU3luY1N0b3JlKCk6IFByb21pc2U8SVVzZXJEYXRhU3luY1N0b3JlIHwgdW5kZWZpbmVkPjtcblxufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIEFic3RyYWN0VXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSBpbXBsZW1lbnRzIElVc2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpb3VzQ29uZmlndXJhdGlvblN5bmNTdG9yZTogQ29uZmlndXJhdGlvblN5bmNTdG9yZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBwcmV2aW91c0NvbmZpZ3VyYXRpb25TeW5jU3RvcmUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTWU5DX1BSRVZJT1VTX1NUT1JFLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmIChwcmV2aW91c0NvbmZpZ3VyYXRpb25TeW5jU3RvcmUpIHtcblx0XHRcdHRoaXMucHJldmlvdXNDb25maWd1cmF0aW9uU3luY1N0b3JlID0gSlNPTi5wYXJzZShwcmV2aW91c0NvbmZpZ3VyYXRpb25TeW5jU3RvcmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN5bmNTdG9yZSA9IHRoaXMucHJvZHVjdFNlcnZpY2VbQ09ORklHVVJBVElPTl9TWU5DX1NUT1JFX0tFWV07XG5cdFx0aWYgKHN5bmNTdG9yZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTWU5DX1BSRVZJT1VTX1NUT1JFLCBKU09OLnN0cmluZ2lmeShzeW5jU3RvcmUpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFNZTkNfUFJFVklPVVNfU1RPUkUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3dpdGNoKHR5cGU6IFVzZXJEYXRhU3luY1N0b3JlVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0eXBlICE9PSB0aGlzLnVzZXJEYXRhU3luY1N0b3JlVHlwZSkge1xuXHRcdFx0dGhpcy51c2VyRGF0YVN5bmNTdG9yZVR5cGUgPSB0eXBlO1xuXHRcdFx0dGhpcy51cGRhdGVVc2VyRGF0YVN5bmNTdG9yZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldFByZXZpb3VzVXNlckRhdGFTeW5jU3RvcmUoKTogUHJvbWlzZTxJVXNlckRhdGFTeW5jU3RvcmUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy50b1VzZXJEYXRhU3luY1N0b3JlKHRoaXMucHJldmlvdXNDb25maWd1cmF0aW9uU3luY1N0b3JlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVXNlckRhdGFTeW5jU3RvcmVDbGllbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHVzZXJEYXRhU3luY1N0b3JlVXJsOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBhdXRoVG9rZW46IHsgdG9rZW46IHN0cmluZzsgdHlwZTogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tbW9uSGVhZGVyc1Byb21pc2U6IFByb21pc2U8SUhlYWRlcnM+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb246IFJlcXVlc3RzU2Vzc2lvbjtcblxuXHRwcml2YXRlIF9vblRva2VuRmFpbGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VXNlckRhdGFTeW5jRXJyb3JDb2RlPigpKTtcblx0cmVhZG9ubHkgb25Ub2tlbkZhaWxlZCA9IHRoaXMuX29uVG9rZW5GYWlsZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25Ub2tlblN1Y2NlZWQ6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25Ub2tlblN1Y2NlZWQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25Ub2tlblN1Y2NlZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZG9ub3RNYWtlUmVxdWVzdHNVbnRpbDogRGF0ZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IGRvbm90TWFrZVJlcXVlc3RzVW50aWwoKSB7IHJldHVybiB0aGlzLl9kb25vdE1ha2VSZXF1ZXN0c1VudGlsOyB9XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlRG9ub3RNYWtlUmVxdWVzdHNVbnRpbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZURvbm90TWFrZVJlcXVlc3RzVW50aWwgPSB0aGlzLl9vbkRpZENoYW5nZURvbm90TWFrZVJlcXVlc3RzVW50aWwuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlckRhdGFTeW5jU3RvcmVVcmw6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlcXVlc3RTZXJ2aWNlOiBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnVwZGF0ZVVzZXJEYXRhU3luY1N0b3JlVXJsKHVzZXJEYXRhU3luY1N0b3JlVXJsKTtcblx0XHR0aGlzLmNvbW1vbkhlYWRlcnNQcm9taXNlID0gZ2V0U2VydmljZU1hY2hpbmVJZChlbnZpcm9ubWVudFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSlcblx0XHRcdC50aGVuKHV1aWQgPT4ge1xuXHRcdFx0XHRjb25zdCBoZWFkZXJzOiBJSGVhZGVycyA9IHtcblx0XHRcdFx0XHQnWC1DbGllbnQtTmFtZSc6IGAke3Byb2R1Y3RTZXJ2aWNlLmFwcGxpY2F0aW9uTmFtZX0ke2lzV2ViID8gJy13ZWInIDogJyd9YCxcblx0XHRcdFx0XHQnWC1DbGllbnQtVmVyc2lvbic6IHByb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChwcm9kdWN0U2VydmljZS5jb21taXQpIHtcblx0XHRcdFx0XHRoZWFkZXJzWydYLUNsaWVudC1Db21taXQnXSA9IHByb2R1Y3RTZXJ2aWNlLmNvbW1pdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaGVhZGVycztcblx0XHRcdH0pO1xuXG5cdFx0LyogQSByZXF1ZXN0cyBzZXNzaW9uIHRoYXQgbGltaXRzIHJlcXVlc3RzIHBlciBzZXNzaW9ucyAqL1xuXHRcdHRoaXMuc2Vzc2lvbiA9IG5ldyBSZXF1ZXN0c1Nlc3Npb24oUkVRVUVTVF9TRVNTSU9OX0xJTUlULCBSRVFVRVNUX1NFU1NJT05fSU5URVJWQUwsIHRoaXMucmVxdWVzdFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0dGhpcy5pbml0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5yZXNldERvbm90TWFrZVJlcXVlc3RzVW50aWxQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMucmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5yZXNldERvbm90TWFrZVJlcXVlc3RzVW50aWxQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHNldEF1dGhUb2tlbih0b2tlbjogc3RyaW5nLCB0eXBlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmF1dGhUb2tlbiA9IHsgdG9rZW4sIHR5cGUgfTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVVc2VyRGF0YVN5bmNTdG9yZVVybCh1c2VyRGF0YVN5bmNTdG9yZVVybDogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCA9IHVzZXJEYXRhU3luY1N0b3JlVXJsID8gam9pblBhdGgodXNlckRhdGFTeW5jU3RvcmVVcmwsICd2MScpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbCgpOiB2b2lkIHtcblx0XHRjb25zdCBkb25vdE1ha2VSZXF1ZXN0c1VudGlsID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoRE9OT1RfTUFLRV9SRVFVRVNUU19VTlRJTF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKGRvbm90TWFrZVJlcXVlc3RzVW50aWwgJiYgRGF0ZS5ub3coKSA8IGRvbm90TWFrZVJlcXVlc3RzVW50aWwpIHtcblx0XHRcdHRoaXMuc2V0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbChuZXcgRGF0ZShkb25vdE1ha2VSZXF1ZXN0c1VudGlsKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXNldERvbm90TWFrZVJlcXVlc3RzVW50aWxQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsKGRvbm90TWFrZVJlcXVlc3RzVW50aWw6IERhdGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZG9ub3RNYWtlUmVxdWVzdHNVbnRpbD8uZ2V0VGltZSgpICE9PSBkb25vdE1ha2VSZXF1ZXN0c1VudGlsPy5nZXRUaW1lKCkpIHtcblx0XHRcdHRoaXMuX2Rvbm90TWFrZVJlcXVlc3RzVW50aWwgPSBkb25vdE1ha2VSZXF1ZXN0c1VudGlsO1xuXG5cdFx0XHRpZiAodGhpcy5yZXNldERvbm90TWFrZVJlcXVlc3RzVW50aWxQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMucmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5yZXNldERvbm90TWFrZVJlcXVlc3RzVW50aWxQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fZG9ub3RNYWtlUmVxdWVzdHNVbnRpbCkge1xuXHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKERPTk9UX01BS0VfUkVRVUVTVFNfVU5USUxfS0VZLCB0aGlzLl9kb25vdE1ha2VSZXF1ZXN0c1VudGlsLmdldFRpbWUoKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHR0aGlzLnJlc2V0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbFByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB0aW1lb3V0KHRoaXMuX2Rvbm90TWFrZVJlcXVlc3RzVW50aWwhLmdldFRpbWUoKSAtIERhdGUubm93KCksIHRva2VuKS50aGVuKCgpID0+IHRoaXMuc2V0RG9ub3RNYWtlUmVxdWVzdHNVbnRpbCh1bmRlZmluZWQpKSk7XG5cdFx0XHRcdHRoaXMucmVzZXREb25vdE1ha2VSZXF1ZXN0c1VudGlsUHJvbWlzZS50aGVuKG51bGwsIGUgPT4gbnVsbCAvKiBpZ25vcmUgZXJyb3IgKi8pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoRE9OT1RfTUFLRV9SRVFVRVNUU19VTlRJTF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRG9ub3RNYWtlUmVxdWVzdHNVbnRpbC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gI3JlZ2lvbiBDb2xsZWN0aW9uXG5cblx0YXN5bmMgZ2V0QWxsQ29sbGVjdGlvbnMoaGVhZGVyczogSUhlYWRlcnMgPSB7fSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCAnY29sbGVjdGlvbicpLnRvU3RyaW5nKCk7XG5cdFx0aGVhZGVycyA9IHsgLi4uaGVhZGVycyB9O1xuXHRcdGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddID0gJ2FwcGxpY2F0aW9uL2pzb24nO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0dFVCcsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLmdldEFsbENvbGxlY3Rpb25zJyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRyZXR1cm4gKGF3YWl0IGFzSnNvbjx7IGlkOiBzdHJpbmcgfVtdPihjb250ZXh0KSk/Lm1hcCgoeyBpZCB9KSA9PiBpZCkgfHwgW107XG5cdH1cblxuXHRhc3luYyBjcmVhdGVDb2xsZWN0aW9uKGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBzZXR0aW5ncyBzeW5jIHN0b3JlIHVybCBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVybCA9IGpvaW5QYXRoKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsICdjb2xsZWN0aW9uJykudG9TdHJpbmcoKTtcblx0XHRoZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cdFx0aGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSBNaW1lcy50ZXh0O1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ1BPU1QnLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VzZXJEYXRhU3luYy5jcmVhdGVDb2xsZWN0aW9uJyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgY29sbGVjdGlvbklkID0gYXdhaXQgYXNUZXh0T3JFcnJvcihjb250ZXh0KTtcblx0XHRpZiAoIWNvbGxlY3Rpb25JZCkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoJ1NlcnZlciBkaWQgbm90IHJldHVybiB0aGUgY29sbGVjdGlvbiBpZCcsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLk5vQ29sbGVjdGlvbiwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgY29udGV4dC5yZXMuaGVhZGVyc1tIRUFERVJfT1BFUkFUSU9OX0lEXSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb2xsZWN0aW9uSWQ7XG5cdH1cblxuXHRhc3luYyBkZWxldGVDb2xsZWN0aW9uKGNvbGxlY3Rpb24/OiBzdHJpbmcsIGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBjb2xsZWN0aW9uID8gam9pblBhdGgodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgJ2NvbGxlY3Rpb24nLCBjb2xsZWN0aW9uKS50b1N0cmluZygpIDogam9pblBhdGgodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgJ2NvbGxlY3Rpb24nKS50b1N0cmluZygpO1xuXHRcdGhlYWRlcnMgPSB7IC4uLmhlYWRlcnMgfTtcblxuXHRcdGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0RFTEVURScsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLmRlbGV0ZUNvbGxlY3Rpb24nIH0sIFtdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFJlc291cmNlXG5cblx0YXN5bmMgZ2V0QWxsUmVzb3VyY2VSZWZzKHJlc291cmNlOiBTZXJ2ZXJSZXNvdXJjZSwgY29sbGVjdGlvbj86IHN0cmluZyk6IFByb21pc2U8SVJlc291cmNlUmVmSGFuZGxlW10+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmkgPSB0aGlzLmdldFJlc291cmNlVXJsKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsIGNvbGxlY3Rpb24sIHJlc291cmNlKTtcblx0XHRjb25zdCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9O1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmkudG9TdHJpbmcoKSwgeyB0eXBlOiAnR0VUJywgaGVhZGVycywgY2FsbFNpdGU6ICd1c2VyRGF0YVN5bmMuZ2V0QWxsUmVzb3VyY2VSZWZzJyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhc0pzb248eyB1cmw6IHN0cmluZzsgY3JlYXRlZDogbnVtYmVyIH1bXT4oY29udGV4dCkgfHwgW107XG5cdFx0cmV0dXJuIHJlc3VsdC5tYXAoKHsgdXJsLCBjcmVhdGVkIH0pID0+ICh7IHJlZjogcmVsYXRpdmVQYXRoKHVyaSwgdXJpLndpdGgoeyBwYXRoOiB1cmwgfSkpISwgY3JlYXRlZDogY3JlYXRlZCAqIDEwMDAgLyogU2VydmVyIHJldHVybnMgaW4gc2Vjb25kcyAqLyB9KSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlUmVzb3VyY2VDb250ZW50KHJlc291cmNlOiBTZXJ2ZXJSZXNvdXJjZSwgcmVmOiBzdHJpbmcsIGNvbGxlY3Rpb24/OiBzdHJpbmcsIGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aCh0aGlzLmdldFJlc291cmNlVXJsKHRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwsIGNvbGxlY3Rpb24sIHJlc291cmNlKSwgcmVmKS50b1N0cmluZygpO1xuXHRcdGhlYWRlcnMgPSB7IC4uLmhlYWRlcnMgfTtcblx0XHRoZWFkZXJzWydDYWNoZS1Db250cm9sJ10gPSAnbm8tY2FjaGUnO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0dFVCcsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLnJlc29sdmVSZXNvdXJjZUNvbnRlbnQnIH0sIFtdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgYXNUZXh0T3JFcnJvcihjb250ZXh0KTtcblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVJlc291cmNlKHJlc291cmNlOiBTZXJ2ZXJSZXNvdXJjZSwgcmVmOiBzdHJpbmcgfCBudWxsLCBjb2xsZWN0aW9uPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gcmVmICE9PSBudWxsID8gam9pblBhdGgodGhpcy5nZXRSZXNvdXJjZVVybCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCBjb2xsZWN0aW9uLCByZXNvdXJjZSksIHJlZikudG9TdHJpbmcoKSA6IHRoaXMuZ2V0UmVzb3VyY2VVcmwodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgY29sbGVjdGlvbiwgcmVzb3VyY2UpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgaGVhZGVyczogSUhlYWRlcnMgPSB7fTtcblxuXHRcdGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0RFTEVURScsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLmRlbGV0ZVJlc291cmNlJyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRhc3luYyBkZWxldGVSZXNvdXJjZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gam9pblBhdGgodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgJ3Jlc291cmNlJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBoZWFkZXJzOiBJSGVhZGVycyA9IHsgJ0NvbnRlbnQtVHlwZSc6IE1pbWVzLnRleHQgfTtcblxuXHRcdGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ0RFTEVURScsIGhlYWRlcnMsIGNhbGxTaXRlOiAndXNlckRhdGFTeW5jLmRlbGV0ZVJlc291cmNlcycgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0YXN5bmMgcmVhZFJlc291cmNlKHJlc291cmNlOiBTZXJ2ZXJSZXNvdXJjZSwgb2xkVmFsdWU6IElVc2VyRGF0YSB8IG51bGwsIGNvbGxlY3Rpb24/OiBzdHJpbmcsIGhlYWRlcnM6IElIZWFkZXJzID0ge30pOiBQcm9taXNlPElVc2VyRGF0YT4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBzZXR0aW5ncyBzeW5jIHN0b3JlIHVybCBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVybCA9IGpvaW5QYXRoKHRoaXMuZ2V0UmVzb3VyY2VVcmwodGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCwgY29sbGVjdGlvbiwgcmVzb3VyY2UpLCAnbGF0ZXN0JykudG9TdHJpbmcoKTtcblx0XHRoZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cdFx0Ly8gRGlzYWJsZSBjYWNoaW5nIGFzIHRoZXkgYXJlIGNhY2hlZCBieSBzeW5jaHJvbmlzZXJzXG5cdFx0aGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ25vLWNhY2hlJztcblx0XHRpZiAob2xkVmFsdWUpIHtcblx0XHRcdGhlYWRlcnNbJ0lmLU5vbmUtTWF0Y2gnXSA9IG9sZFZhbHVlLnJlZjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0KHVybCwgeyB0eXBlOiAnR0VUJywgaGVhZGVycywgY2FsbFNpdGU6ICd1c2VyRGF0YVN5bmMucmVhZFJlc291cmNlJyB9LCBbMzA0XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRsZXQgdXNlckRhdGE6IElVc2VyRGF0YSB8IG51bGwgPSBudWxsO1xuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSAzMDQpIHtcblx0XHRcdHVzZXJEYXRhID0gb2xkVmFsdWU7XG5cdFx0fVxuXG5cdFx0aWYgKHVzZXJEYXRhID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCByZWYgPSBjb250ZXh0LnJlcy5oZWFkZXJzWydldGFnJ107XG5cdFx0XHRpZiAoIXJlZikge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcignU2VydmVyIGRpZCBub3QgcmV0dXJuIHRoZSByZWYnLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ob1JlZiwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgY29udGV4dC5yZXMuaGVhZGVyc1tIRUFERVJfT1BFUkFUSU9OX0lEXSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBhc1RleHRPckVycm9yKGNvbnRleHQpO1xuXHRcdFx0aWYgKCFjb250ZW50ICYmIGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDMwNCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcignRW1wdHkgcmVzcG9uc2UnLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5FbXB0eVJlc3BvbnNlLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBjb250ZXh0LnJlcy5oZWFkZXJzW0hFQURFUl9PUEVSQVRJT05fSURdKTtcblx0XHRcdH1cblxuXHRcdFx0dXNlckRhdGEgPSB7IHJlZiwgY29udGVudCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1c2VyRGF0YTtcblx0fVxuXG5cdGFzeW5jIHdyaXRlUmVzb3VyY2UocmVzb3VyY2U6IFNlcnZlclJlc291cmNlLCBkYXRhOiBzdHJpbmcsIHJlZjogc3RyaW5nIHwgbnVsbCwgY29sbGVjdGlvbj86IHN0cmluZywgaGVhZGVyczogSUhlYWRlcnMgPSB7fSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKCF0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHNldHRpbmdzIHN5bmMgc3RvcmUgdXJsIGNvbmZpZ3VyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXJsID0gdGhpcy5nZXRSZXNvdXJjZVVybCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCBjb2xsZWN0aW9uLCByZXNvdXJjZSkudG9TdHJpbmcoKTtcblx0XHRoZWFkZXJzID0geyAuLi5oZWFkZXJzIH07XG5cdFx0aGVhZGVyc1snQ29udGVudC1UeXBlJ10gPSBNaW1lcy50ZXh0O1xuXHRcdGlmIChyZWYpIHtcblx0XHRcdGhlYWRlcnNbJ0lmLU1hdGNoJ10gPSByZWY7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMucmVxdWVzdCh1cmwsIHsgdHlwZTogJ1BPU1QnLCBkYXRhLCBoZWFkZXJzLCBjYWxsU2l0ZTogJ3VzZXJEYXRhU3luYy53cml0ZVJlc291cmNlJyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRjb25zdCBuZXdSZWYgPSBjb250ZXh0LnJlcy5oZWFkZXJzWydldGFnJ107XG5cdFx0aWYgKCFuZXdSZWYpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdTZXJ2ZXIgZGlkIG5vdCByZXR1cm4gdGhlIHJlZicsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLk5vUmVmLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBjb250ZXh0LnJlcy5oZWFkZXJzW0hFQURFUl9PUEVSQVRJT05fSURdKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ld1JlZjtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHRhc3luYyBtYW5pZmVzdChvbGRWYWx1ZTogSVVzZXJEYXRhTWFuaWZlc3QgfCBudWxsLCBoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTxJVXNlckRhdGFNYW5pZmVzdCB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCAnbWFuaWZlc3QnKS50b1N0cmluZygpO1xuXHRcdGhlYWRlcnMgPSB7IC4uLmhlYWRlcnMgfTtcblx0XHRoZWFkZXJzWydDb250ZW50LVR5cGUnXSA9ICdhcHBsaWNhdGlvbi9qc29uJztcblx0XHRpZiAob2xkVmFsdWUpIHtcblx0XHRcdGhlYWRlcnNbJ0lmLU5vbmUtTWF0Y2gnXSA9IG9sZFZhbHVlLnJlZjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0KHVybCwgeyB0eXBlOiAnR0VUJywgaGVhZGVycywgY2FsbFNpdGU6ICd1c2VyRGF0YVN5bmMubWFuaWZlc3QnIH0sIFszMDRdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGxldCBtYW5pZmVzdDogSVVzZXJEYXRhTWFuaWZlc3QgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMzA0KSB7XG5cdFx0XHRtYW5pZmVzdCA9IG9sZFZhbHVlO1xuXHRcdH1cblxuXHRcdGlmICghbWFuaWZlc3QpIHtcblx0XHRcdGNvbnN0IHJlZiA9IGNvbnRleHQucmVzLmhlYWRlcnNbJ2V0YWcnXTtcblx0XHRcdGlmICghcmVmKSB7XG5cdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdTZXJ2ZXIgZGlkIG5vdCByZXR1cm4gdGhlIHJlZicsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLk5vUmVmLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBjb250ZXh0LnJlcy5oZWFkZXJzW0hFQURFUl9PUEVSQVRJT05fSURdKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHRpZiAoIWNvbnRlbnQgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMzA0KSB7XG5cdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdFbXB0eSByZXNwb25zZScsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkVtcHR5UmVzcG9uc2UsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIGNvbnRleHQucmVzLmhlYWRlcnNbSEVBREVSX09QRVJBVElPTl9JRF0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRtYW5pZmVzdCA9IHsgLi4uSlNPTi5wYXJzZShjb250ZW50KSwgcmVmIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFNlc3Npb25JZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFVTRVJfU0VTU0lPTl9JRF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cblx0XHRpZiAoY3VycmVudFNlc3Npb25JZCAmJiBtYW5pZmVzdCAmJiBjdXJyZW50U2Vzc2lvbklkICE9PSBtYW5pZmVzdC5zZXNzaW9uKSB7XG5cdFx0XHQvLyBTZXJ2ZXIgc2Vzc2lvbiBpcyBkaWZmZXJlbnQgZnJvbSBjbGllbnQgc2Vzc2lvbiBzbyBjbGVhciBjYWNoZWQgc2Vzc2lvbi5cblx0XHRcdHRoaXMuY2xlYXJTZXNzaW9uKCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1hbmlmZXN0ID09PSBudWxsICYmIGN1cnJlbnRTZXNzaW9uSWQpIHtcblx0XHRcdC8vIHNlcnZlciBzZXNzaW9uIGlzIGNsZWFyZWQgc28gY2xlYXIgY2FjaGVkIHNlc3Npb24uXG5cdFx0XHR0aGlzLmNsZWFyU2Vzc2lvbigpO1xuXHRcdH1cblxuXHRcdGlmIChtYW5pZmVzdCkge1xuXHRcdFx0Ly8gdXBkYXRlIHNlc3Npb25cblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVVNFUl9TRVNTSU9OX0lEX0tFWSwgbWFuaWZlc3Quc2Vzc2lvbiwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtYW5pZmVzdDtcblx0fVxuXG5cdGFzeW5jIGNsZWFyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVN5bmNTdG9yZVVybCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBzZXR0aW5ncyBzeW5jIHN0b3JlIHVybCBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZGVsZXRlQ29sbGVjdGlvbigpO1xuXHRcdGF3YWl0IHRoaXMuZGVsZXRlUmVzb3VyY2VzKCk7XG5cblx0XHQvLyBjbGVhciBjYWNoZWQgc2Vzc2lvbi5cblx0XHR0aGlzLmNsZWFyU2Vzc2lvbigpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TGF0ZXN0RGF0YShoZWFkZXJzOiBJSGVhZGVycyA9IHt9KTogUHJvbWlzZTxJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSB8IG51bGw+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCAnZG93bmxvYWQnLCAnbGF0ZXN0JykudG9TdHJpbmcoKTtcblxuXHRcdGhlYWRlcnMgPSB7IC4uLmhlYWRlcnMgfTtcblx0XHRoZWFkZXJzWydDb250ZW50LVR5cGUnXSA9ICdhcHBsaWNhdGlvbi9qc29uJztcblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0KHVybCwgeyB0eXBlOiAnR0VUJywgaGVhZGVycywgY2FsbFNpdGU6ICd1c2VyRGF0YVN5bmMuZ2V0TGF0ZXN0RGF0YScgfSwgW10sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0aWYgKCFpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdTZXJ2ZXIgcmV0dXJuZWQgJyArIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLkVtcHR5UmVzcG9uc2UsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIGNvbnRleHQucmVzLmhlYWRlcnNbSEVBREVSX09QRVJBVElPTl9JRF0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlcnZlckRhdGEgPSBhd2FpdCBhc0pzb248SURvd25sb2FkTGF0ZXN0RGF0YVR5cGU+KGNvbnRleHQpO1xuXHRcdGlmICghc2VydmVyRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJVXNlckRhdGFTeW5jTGF0ZXN0RGF0YSA9IHt9O1xuXHRcdGlmIChzZXJ2ZXJEYXRhLnJlc291cmNlcykge1xuXHRcdFx0cmVzdWx0LnJlc291cmNlcyA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBpbiBzZXJ2ZXJEYXRhLnJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCBbcmVzb3VyY2VEYXRhXSA9IHNlcnZlckRhdGEucmVzb3VyY2VzW3Jlc291cmNlXTtcblx0XHRcdFx0cmVzdWx0LnJlc291cmNlc1tyZXNvdXJjZV0gPSB7XG5cdFx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VEYXRhLmNvbnRlbnQsXG5cdFx0XHRcdFx0cmVmOiByZXNvdXJjZURhdGEucmVmXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNlcnZlckRhdGEuY29sbGVjdGlvbnMpIHtcblx0XHRcdHJlc3VsdC5jb2xsZWN0aW9ucyA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBjb2xsZWN0aW9uIGluIHNlcnZlckRhdGEuY29sbGVjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VzOiBJU3RyaW5nRGljdGlvbmFyeTxJVXNlckRhdGE+ID0ge307XG5cdFx0XHRcdHJlc3VsdC5jb2xsZWN0aW9uc1tjb2xsZWN0aW9uXSA9IHsgcmVzb3VyY2VzIH07XG5cdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2UgaW4gc2VydmVyRGF0YS5jb2xsZWN0aW9uc1tjb2xsZWN0aW9uXS5yZXNvdXJjZXMpIHtcblx0XHRcdFx0XHRjb25zdCBbcmVzb3VyY2VEYXRhXSA9IHNlcnZlckRhdGEuY29sbGVjdGlvbnNbY29sbGVjdGlvbl0ucmVzb3VyY2VzW3Jlc291cmNlXTtcblx0XHRcdFx0XHRyZXNvdXJjZXNbcmVzb3VyY2VdID0ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogcmVzb3VyY2VEYXRhLmNvbnRlbnQsXG5cdFx0XHRcdFx0XHRyZWY6IHJlc291cmNlRGF0YS5yZWZcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGdldEFjdGl2aXR5RGF0YSgpOiBQcm9taXNlPFZTQnVmZmVyUmVhZGFibGVTdHJlYW0+IHtcblx0XHRpZiAoIXRoaXMudXNlckRhdGFTeW5jU3RvcmVVcmwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2V0dGluZ3Mgc3luYyBzdG9yZSB1cmwgY29uZmlndXJlZC4nKTtcblx0XHR9XG5cblx0XHRjb25zdCB1cmwgPSBqb2luUGF0aCh0aGlzLnVzZXJEYXRhU3luY1N0b3JlVXJsLCAnZG93bmxvYWQnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGhlYWRlcnM6IElIZWFkZXJzID0ge307XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0KHVybCwgeyB0eXBlOiAnR0VUJywgaGVhZGVycywgY2FsbFNpdGU6ICd1c2VyRGF0YVN5bmMuZ2V0QWN0aXZpdHlEYXRhJyB9LCBbXSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRpZiAoIWlzU3VjY2Vzcyhjb250ZXh0KSkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoJ1NlcnZlciByZXR1cm5lZCAnICsgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRW1wdHlSZXNwb25zZSwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgY29udGV4dC5yZXMuaGVhZGVyc1tIRUFERVJfT1BFUkFUSU9OX0lEXSk7XG5cdFx0fVxuXG5cdFx0aWYgKGhhc05vQ29udGVudChjb250ZXh0KSkge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoJ0VtcHR5IHJlc3BvbnNlJywgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuRW1wdHlSZXNwb25zZSwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgY29udGV4dC5yZXMuaGVhZGVyc1tIRUFERVJfT1BFUkFUSU9OX0lEXSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRleHQuc3RyZWFtO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXNvdXJjZVVybCh1c2VyRGF0YVN5bmNTdG9yZVVybDogVVJJLCBjb2xsZWN0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlc291cmNlOiBTZXJ2ZXJSZXNvdXJjZSk6IFVSSSB7XG5cdFx0cmV0dXJuIGNvbGxlY3Rpb24gPyBqb2luUGF0aCh1c2VyRGF0YVN5bmNTdG9yZVVybCwgJ2NvbGxlY3Rpb24nLCBjb2xsZWN0aW9uLCAncmVzb3VyY2UnLCByZXNvdXJjZSkgOiBqb2luUGF0aCh1c2VyRGF0YVN5bmNTdG9yZVVybCwgJ3Jlc291cmNlJywgcmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclNlc3Npb24oKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoVVNFUl9TRVNTSU9OX0lEX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShNQUNISU5FX1NFU1NJT05fSURfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXF1ZXN0KHVybDogc3RyaW5nLCBvcHRpb25zOiBJUmVxdWVzdE9wdGlvbnMsIHN1Y2Nlc3NDb2RlczogbnVtYmVyW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0aWYgKCF0aGlzLmF1dGhUb2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoJ05vIEF1dGggVG9rZW4gQXZhaWxhYmxlJywgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVW5hdXRob3JpemVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2Rvbm90TWFrZVJlcXVlc3RzVW50aWwgJiYgRGF0ZS5ub3coKSA8IHRoaXMuX2Rvbm90TWFrZVJlcXVlc3RzVW50aWwuZ2V0VGltZSgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2Ugb2YgdG9vIG1hbnkgcmVxdWVzdHMgKDQyOSkuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTWFueVJlcXVlc3RzQW5kUmV0cnlBZnRlciwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLnNldERvbm90TWFrZVJlcXVlc3RzVW50aWwodW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGNvbW1vbkhlYWRlcnMgPSBhd2FpdCB0aGlzLmNvbW1vbkhlYWRlcnNQcm9taXNlO1xuXHRcdG9wdGlvbnMuaGVhZGVycyA9IHtcblx0XHRcdC4uLihvcHRpb25zLmhlYWRlcnMgfHwge30pLFxuXHRcdFx0Li4uY29tbW9uSGVhZGVycyxcblx0XHRcdCdYLUFjY291bnQtVHlwZSc6IHRoaXMuYXV0aFRva2VuLnR5cGUsXG5cdFx0XHQnYXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHt0aGlzLmF1dGhUb2tlbi50b2tlbn1gLFxuXHRcdH07XG5cblx0XHQvLyBBZGQgc2Vzc2lvbiBoZWFkZXJzXG5cdFx0dGhpcy5hZGRTZXNzaW9uSGVhZGVycyhvcHRpb25zLmhlYWRlcnMpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdTZW5kaW5nIHJlcXVlc3QgdG8gc2VydmVyJywgeyB1cmwsIHR5cGU6IG9wdGlvbnMudHlwZSwgaGVhZGVyczogeyAuLi5vcHRpb25zLmhlYWRlcnMsIC4uLnsgYXV0aG9yaXphdGlvbjogdW5kZWZpbmVkIH0gfSB9KTtcblxuXHRcdGxldCBjb250ZXh0O1xuXHRcdHRyeSB7XG5cdFx0XHRjb250ZXh0ID0gYXdhaXQgdGhpcy5zZXNzaW9uLnJlcXVlc3QodXJsLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKCEoZSBpbnN0YW5jZW9mIFVzZXJEYXRhU3luY1N0b3JlRXJyb3IpKSB7XG5cdFx0XHRcdGxldCBjb2RlID0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlJlcXVlc3RGYWlsZWQ7XG5cdFx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGdldEVycm9yTWVzc2FnZShlKS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHRcdC8vIFJlcXVlc3QgdGltZWQgb3V0XG5cdFx0XHRcdGlmIChlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ3hociB0aW1lb3V0JykpIHtcblx0XHRcdFx0XHRjb2RlID0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlJlcXVlc3RUaW1lb3V0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVxdWVzdCBwcm90b2NvbCBub3Qgc3VwcG9ydGVkXG5cdFx0XHRcdGVsc2UgaWYgKGVycm9yTWVzc2FnZS5pbmNsdWRlcygncHJvdG9jb2wnKSAmJiBlcnJvck1lc3NhZ2UuaW5jbHVkZXMoJ25vdCBzdXBwb3J0ZWQnKSkge1xuXHRcdFx0XHRcdGNvZGUgPSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuUmVxdWVzdFByb3RvY29sTm90U3VwcG9ydGVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVxdWVzdCBwYXRoIG5vdCBlc2NhcGVkXG5cdFx0XHRcdGVsc2UgaWYgKGVycm9yTWVzc2FnZS5pbmNsdWRlcygncmVxdWVzdCBwYXRoIGNvbnRhaW5zIHVuZXNjYXBlZCBjaGFyYWN0ZXJzJykpIHtcblx0XHRcdFx0XHRjb2RlID0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlJlcXVlc3RQYXRoTm90RXNjYXBlZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlcXVlc3QgaGVhZGVyIG5vdCBhbiBvYmplY3Rcblx0XHRcdFx0ZWxzZSBpZiAoZXJyb3JNZXNzYWdlLmluY2x1ZGVzKCdoZWFkZXJzIG11c3QgYmUgYW4gb2JqZWN0JykpIHtcblx0XHRcdFx0XHRjb2RlID0gVXNlckRhdGFTeW5jRXJyb3JDb2RlLlJlcXVlc3RIZWFkZXJzTm90T2JqZWN0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVxdWVzdCBjYW5jZWxlZFxuXHRcdFx0XHRlbHNlIGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0Y29kZSA9IFVzZXJEYXRhU3luY0Vycm9yQ29kZS5SZXF1ZXN0Q2FuY2VsZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlID0gbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYENvbm5lY3Rpb24gcmVmdXNlZCBmb3IgdGhlIHJlcXVlc3QgJyR7dXJsfScuYCwgdXJsLCBjb2RlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnUmVxdWVzdCBmYWlsZWQnLCB1cmwpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVyYXRpb25JZCA9IGNvbnRleHQucmVzLmhlYWRlcnNbSEVBREVSX09QRVJBVElPTl9JRF07XG5cdFx0Y29uc3QgcmVxdWVzdEluZm8gPSB7IHVybCwgc3RhdHVzOiBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCAnZXhlY3V0aW9uLWlkJzogb3B0aW9ucy5oZWFkZXJzW0hFQURFUl9FWEVDVVRJT05fSURdLCAnb3BlcmF0aW9uLWlkJzogb3BlcmF0aW9uSWQgfTtcblx0XHRjb25zdCBpc1N1Y2Nlc3MgPSBpc1N1Y2Nlc3NDb250ZXh0KGNvbnRleHQpIHx8IChjb250ZXh0LnJlcy5zdGF0dXNDb2RlICYmIHN1Y2Nlc3NDb2Rlcy5pbmNsdWRlcyhjb250ZXh0LnJlcy5zdGF0dXNDb2RlKSk7XG5cdFx0bGV0IGZhaWx1cmVNZXNzYWdlID0gJyc7XG5cdFx0aWYgKGlzU3VjY2Vzcykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdSZXF1ZXN0IHN1Y2NlZWRlZCcsIHJlcXVlc3RJbmZvKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZmFpbHVyZU1lc3NhZ2UgPSBhd2FpdCBhc1RleHQoY29udGV4dCkgfHwgJyc7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnUmVxdWVzdCBmYWlsZWQnLCByZXF1ZXN0SW5mbywgZmFpbHVyZU1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MDEgfHwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDAzKSB7XG5cdFx0XHR0aGlzLmF1dGhUb2tlbiA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSA0MDEpIHtcblx0XHRcdFx0dGhpcy5fb25Ub2tlbkZhaWxlZC5maXJlKFVzZXJEYXRhU3luY0Vycm9yQ29kZS5VbmF1dGhvcml6ZWQpO1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2Ugb2YgVW5hdXRob3JpemVkICg0MDEpLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlVuYXV0aG9yaXplZCwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSwgb3BlcmF0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQwMykge1xuXHRcdFx0XHR0aGlzLl9vblRva2VuRmFpbGVkLmZpcmUoVXNlckRhdGFTeW5jRXJyb3JDb2RlLkZvcmJpZGRlbik7XG5cdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKGAke29wdGlvbnMudHlwZX0gcmVxdWVzdCAnJHt1cmx9JyBmYWlsZWQgYmVjYXVzZSB0aGUgYWNjZXNzIGlzIGZvcmJpZGRlbiAoNDAzKS5gLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Gb3JiaWRkZW4sIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIG9wZXJhdGlvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vblRva2VuU3VjY2VlZC5maXJlKCk7XG5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDA0KSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2UgdGhlIHJlcXVlc3RlZCByZXNvdXJjZSBpcyBub3QgZm91bmQgKDQwNCkuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTm90Rm91bmQsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIG9wZXJhdGlvbklkKTtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDA1KSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2UgdGhlIHJlcXVlc3RlZCBlbmRwb2ludCBpcyBub3QgZm91bmQgKDQwNSkuICR7ZmFpbHVyZU1lc3NhZ2V9YCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTWV0aG9kTm90Rm91bmQsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIG9wZXJhdGlvbklkKTtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDA5KSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2Ugb2YgQ29uZmxpY3QgKDQwOSkuIFRoZXJlIGlzIG5ldyBkYXRhIGZvciB0aGlzIHJlc291cmNlLiBNYWtlIHRoZSByZXF1ZXN0IGFnYWluIHdpdGggbGF0ZXN0IGRhdGEuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuQ29uZmxpY3QsIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIG9wZXJhdGlvbklkKTtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gNDEwKSB7XG5cdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2UgdGhlIHJlcXVlc3RlZCByZXNvdXJjZSBpcyBub3QgbG9uZ2VyIGF2YWlsYWJsZSAoNDEwKS5gLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Hb25lLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQxMikge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIG9mIFByZWNvbmRpdGlvbiBGYWlsZWQgKDQxMikuIFRoZXJlIGlzIG5ldyBkYXRhIGZvciB0aGlzIHJlc291cmNlLiBNYWtlIHRoZSByZXF1ZXN0IGFnYWluIHdpdGggbGF0ZXN0IGRhdGEuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuUHJlY29uZGl0aW9uRmFpbGVkLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQxMykge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCBiZWNhdXNlIG9mIHRvbyBsYXJnZSBwYXlsb2FkICg0MTMpLmAsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlRvb0xhcmdlLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQyNikge1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYCR7b3B0aW9ucy50eXBlfSByZXF1ZXN0ICcke3VybH0nIGZhaWxlZCB3aXRoIHN0YXR1cyBVcGdyYWRlIFJlcXVpcmVkICg0MjYpLiBQbGVhc2UgdXBncmFkZSB0aGUgY2xpZW50IGFuZCB0cnkgYWdhaW4uYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVXBncmFkZVJlcXVpcmVkLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgPT09IDQyOSkge1xuXHRcdFx0Y29uc3QgcmV0cnlBZnRlciA9IGNvbnRleHQucmVzLmhlYWRlcnNbJ3JldHJ5LWFmdGVyJ107XG5cdFx0XHRpZiAocmV0cnlBZnRlcikge1xuXHRcdFx0XHR0aGlzLnNldERvbm90TWFrZVJlcXVlc3RzVW50aWwobmV3IERhdGUoRGF0ZS5ub3coKSArIChwYXJzZUludChyZXRyeUFmdGVyKSAqIDEwMDApKSk7XG5cdFx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKGAke29wdGlvbnMudHlwZX0gcmVxdWVzdCAnJHt1cmx9JyBmYWlsZWQgYmVjYXVzZSBvZiB0b28gbWFueSByZXF1ZXN0cyAoNDI5KS5gLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29NYW55UmVxdWVzdHNBbmRSZXRyeUFmdGVyLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgVXNlckRhdGFTeW5jU3RvcmVFcnJvcihgJHtvcHRpb25zLnR5cGV9IHJlcXVlc3QgJyR7dXJsfScgZmFpbGVkIGJlY2F1c2Ugb2YgdG9vIG1hbnkgcmVxdWVzdHMgKDQyOSkuYCwgdXJsLCBVc2VyRGF0YVN5bmNFcnJvckNvZGUuVG9vTWFueVJlcXVlc3RzLCBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLCBvcGVyYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1N1Y2Nlc3MpIHtcblx0XHRcdHRocm93IG5ldyBVc2VyRGF0YVN5bmNTdG9yZUVycm9yKCdTZXJ2ZXIgcmV0dXJuZWQgJyArIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIHVybCwgVXNlckRhdGFTeW5jRXJyb3JDb2RlLlVua25vd24sIGNvbnRleHQucmVzLnN0YXR1c0NvZGUsIG9wZXJhdGlvbklkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29udGV4dDtcblx0fVxuXG5cdHByaXZhdGUgYWRkU2Vzc2lvbkhlYWRlcnMoaGVhZGVyczogSUhlYWRlcnMpOiB2b2lkIHtcblx0XHRsZXQgbWFjaGluZVNlc3Npb25JZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KE1BQ0hJTkVfU0VTU0lPTl9JRF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKG1hY2hpbmVTZXNzaW9uSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bWFjaGluZVNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShNQUNISU5FX1NFU1NJT05fSURfS0VZLCBtYWNoaW5lU2Vzc2lvbklkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHRcdGhlYWRlcnNbJ1gtTWFjaGluZS1TZXNzaW9uLUlkJ10gPSBtYWNoaW5lU2Vzc2lvbklkO1xuXG5cdFx0Y29uc3QgdXNlclNlc3Npb25JZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFVTRVJfU0VTU0lPTl9JRF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKHVzZXJTZXNzaW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aGVhZGVyc1snWC1Vc2VyLVNlc3Npb24tSWQnXSA9IHVzZXJTZXNzaW9uSWQ7XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJEYXRhU3luY1N0b3JlU2VydmljZSBleHRlbmRzIFVzZXJEYXRhU3luY1N0b3JlQ2xpZW50IGltcGxlbWVudHMgSVVzZXJEYXRhU3luY1N0b3JlU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSB1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodXNlckRhdGFTeW5jU3RvcmVNYW5hZ2VtZW50U2VydmljZS51c2VyRGF0YVN5bmNTdG9yZT8udXJsLCBwcm9kdWN0U2VydmljZSwgcmVxdWVzdFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgZmlsZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVXNlckRhdGFTeW5jU3RvcmUoKCkgPT4gdGhpcy51cGRhdGVVc2VyRGF0YVN5bmNTdG9yZVVybCh1c2VyRGF0YVN5bmNTdG9yZU1hbmFnZW1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY1N0b3JlPy51cmwpKSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgUmVxdWVzdHNTZXNzaW9uIHtcblxuXHRwcml2YXRlIHJlcXVlc3RzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHN0YXJ0VGltZTogRGF0ZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpbWl0OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnRlcnZhbDogbnVtYmVyLCAvKiBpbiBtcyAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlcXVlc3QodXJsOiBzdHJpbmcsIG9wdGlvbnM6IElSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmVxdWVzdENvbnRleHQ+IHtcblx0XHRpZiAodGhpcy5pc0V4cGlyZWQoKSkge1xuXHRcdFx0dGhpcy5yZXNldCgpO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMudXJsID0gdXJsO1xuXG5cdFx0aWYgKHRoaXMucmVxdWVzdHMubGVuZ3RoID49IHRoaXMubGltaXQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdUb28gbWFueSByZXF1ZXN0cycsIC4uLnRoaXMucmVxdWVzdHMpO1xuXHRcdFx0dGhyb3cgbmV3IFVzZXJEYXRhU3luY1N0b3JlRXJyb3IoYFRvbyBtYW55IHJlcXVlc3RzLiBPbmx5ICR7dGhpcy5saW1pdH0gcmVxdWVzdHMgYWxsb3dlZCBpbiAke3RoaXMuaW50ZXJ2YWwgLyAoMTAwMCAqIDYwKX0gbWludXRlcy5gLCB1cmwsIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Mb2NhbFRvb01hbnlSZXF1ZXN0cywgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhcnRUaW1lID0gdGhpcy5zdGFydFRpbWUgfHwgbmV3IERhdGUoKTtcblx0XHR0aGlzLnJlcXVlc3RzLnB1c2godXJsKTtcblxuXHRcdHJldHVybiB0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qob3B0aW9ucywgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0V4cGlyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhcnRUaW1lICE9PSB1bmRlZmluZWQgJiYgbmV3IERhdGUoKS5nZXRUaW1lKCkgLSB0aGlzLnN0YXJ0VGltZS5nZXRUaW1lKCkgPiB0aGlzLmludGVydmFsO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLnJlcXVlc3RzID0gW107XG5cdFx0dGhpcy5zdGFydFRpbWUgPSB1bmRlZmluZWQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUE0Qix5QkFBeUIsZUFBZTtBQUNwRSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQiwyQkFBMkI7QUFDckQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUV0QixTQUFTLFVBQVUsb0JBQW9CO0FBQ3ZDLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsUUFBUSxRQUFRLGVBQWUsY0FBYyxpQkFBaUIsV0FBVyxhQUFhLHdCQUF3QjtBQUN2SCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHFCQUFxQixxQkFBeUgseUJBQTZDLHFDQUFnRix1QkFBdUIsdUJBQXVCLDhCQUFxRDtBQWlCdlgsTUFBTSwrQkFBK0I7QUFDckMsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSx3QkFBd0I7QUFDOUIsTUFBTSwyQkFBMkIsTUFBTyxLQUFLO0FBSXRDLElBQWUsNkNBQWYsY0FBa0UsV0FBMEQ7QUFBQSxFQWdCbEksWUFDcUMsZ0JBQ00sc0JBQ04sZ0JBQ25DO0FBQ0QsVUFBTTtBQUo4QjtBQUNNO0FBQ047QUFmckMsU0FBaUIsZ0NBQWdDLEtBQUssVUFBVSxJ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
