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
import { createReadStream, promises } from "fs";
import * as url from "url";
import * as cookie from "cookie";
import * as crypto from "crypto";
import { isEqualOrParent } from "../../base/common/extpath.js";
import { getMediaMime } from "../../base/common/mime.js";
import { isLinux } from "../../base/common/platform.js";
import { ILogService, LogLevel } from "../../platform/log/common/log.js";
import { IServerEnvironmentService } from "./serverEnvironmentService.js";
import { extname, dirname, join, normalize, posix, resolve } from "../../base/common/path.js";
import { FileAccess, connectionTokenCookieName, connectionTokenQueryName, Schemas, builtinExtensionsPath } from "../../base/common/network.js";
import { generateUuid } from "../../base/common/uuid.js";
import { IProductService } from "../../platform/product/common/productService.js";
import { ServerConnectionTokenType } from "./serverConnectionToken.js";
import { asTextOrError, IRequestService } from "../../platform/request/common/request.js";
import { CancellationToken } from "../../base/common/cancellation.js";
import { URI } from "../../base/common/uri.js";
import { streamToBuffer } from "../../base/common/buffer.js";
import { isString } from "../../base/common/types.js";
import { CharCode } from "../../base/common/charCode.js";
import { ICSSDevelopmentService } from "../../platform/cssDev/node/cssDevService.js";
const textMimeType = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".svg": "image/svg+xml"
};
async function serveError(req, res, errorCode, errorMessage) {
  res.writeHead(errorCode, { "Content-Type": "text/plain" });
  res.end(errorMessage);
}
var CacheControl = /* @__PURE__ */ ((CacheControl2) => {
  CacheControl2[CacheControl2["NO_CACHING"] = 0] = "NO_CACHING";
  CacheControl2[CacheControl2["ETAG"] = 1] = "ETAG";
  CacheControl2[CacheControl2["NO_EXPIRY"] = 2] = "NO_EXPIRY";
  return CacheControl2;
})(CacheControl || {});
async function serveFile(filePath, cacheControl, logService, req, res, responseHeaders) {
  try {
    const stat = await promises.stat(filePath);
    if (cacheControl === 1 /* ETAG */) {
      const etag = `W/"${[stat.ino, stat.size, stat.mtime.getTime()].join("-")}"`;
      if (req.headers["if-none-match"] === etag) {
        res.writeHead(304);
        return void res.end();
      }
      responseHeaders["Etag"] = etag;
    } else if (cacheControl === 2 /* NO_EXPIRY */) {
      responseHeaders["Cache-Control"] = "public, max-age=31536000";
    } else if (cacheControl === 0 /* NO_CACHING */) {
      responseHeaders["Cache-Control"] = "no-store";
    }
    responseHeaders["Content-Type"] = textMimeType[extname(filePath)] || getMediaMime(filePath) || "text/plain";
    const fileStream = createReadStream(filePath);
    await new Promise((resolve2, reject) => {
      fileStream.on("error", reject);
      fileStream.on("open", () => {
        res.writeHead(200, responseHeaders);
        fileStream.pipe(res);
        res.once("close", () => fileStream.destroy());
        fileStream.on("end", resolve2);
        fileStream.removeAllListeners("error");
        fileStream.on("error", (error) => {
          logService.error(error);
          console.error(error.toString());
          res.destroy();
        });
      });
    });
  } catch (error) {
    if (error.code !== "ENOENT") {
      logService.error(error);
      console.error(error.toString());
    } else {
      console.error(`File not found: ${filePath}`);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    return void res.end("Not found");
  }
}
const APP_ROOT = dirname(FileAccess.asFileUri("").fsPath);
const STATIC_PATH = `/static`;
const CALLBACK_PATH = `/callback`;
const WEB_EXTENSION_PATH = `/web-extension-resource`;
let WebClientServer = class {
  constructor(_connectionToken, _basePath, _productPath, _environmentService, _logService, _requestService, _productService, _cssDevService) {
    this._connectionToken = _connectionToken;
    this._basePath = _basePath;
    this._productPath = _productPath;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._requestService = _requestService;
    this._productService = _productService;
    this._cssDevService = _cssDevService;
    this._webExtensionResourceUrlTemplate = this._productService.extensionsGallery?.resourceUrlTemplate ? URI.parse(this._productService.extensionsGallery.resourceUrlTemplate) : void 0;
  }
  /**
   * Handle web resources (i.e. only needed by the web client).
   * **NOTE**: This method is only invoked when the server has web bits.
   * **NOTE**: This method is only invoked after the connection token has been validated.
   * @param parsedUrl The URL to handle, including base and product path
   * @param pathname The pathname of the URL, without base and product path
   */
  async handle(req, res, parsedUrl, pathname) {
    try {
      if (pathname.startsWith(STATIC_PATH) && pathname.charCodeAt(STATIC_PATH.length) === CharCode.Slash) {
        return this._handleStatic(req, res, pathname.substring(STATIC_PATH.length));
      }
      if (pathname === "/") {
        return this._handleRoot(req, res, parsedUrl);
      }
      if (pathname === CALLBACK_PATH) {
        return this._handleCallback(res);
      }
      if (pathname.startsWith(WEB_EXTENSION_PATH) && pathname.charCodeAt(WEB_EXTENSION_PATH.length) === CharCode.Slash) {
        return this._handleWebExtensionResource(req, res, pathname.substring(WEB_EXTENSION_PATH.length));
      }
      return serveError(req, res, 404, "Not found.");
    } catch (error) {
      this._logService.error(error);
      console.error(error.toString());
      return serveError(req, res, 500, "Internal Server Error.");
    }
  }
  /**
   * Handle HTTP requests for /static/*
   * @param resourcePath The path after /static/
   */
  async _handleStatic(req, res, resourcePath) {
    const headers = /* @__PURE__ */ Object.create(null);
    const normalizedPathname = decodeURIComponent(resourcePath);
    const filePath = join(APP_ROOT, normalizedPathname);
    if (!isEqualOrParent(filePath, APP_ROOT, !isLinux)) {
      return serveError(req, res, 400, `Bad request.`);
    }
    return serveFile(filePath, this._environmentService.isBuilt ? 2 /* NO_EXPIRY */ : 1 /* ETAG */, this._logService, req, res, headers);
  }
  _getResourceURLTemplateAuthority(uri) {
    const index = uri.authority.indexOf(".");
    return index !== -1 ? uri.authority.substring(index + 1) : void 0;
  }
  /**
   * Handle extension resources
   * @param resourcePath The path after /web-extension-resource/
   */
  async _handleWebExtensionResource(req, res, resourcePath) {
    if (!this._webExtensionResourceUrlTemplate) {
      return serveError(req, res, 500, "No extension gallery service configured.");
    }
    const normalizedPathname = decodeURIComponent(resourcePath);
    const path = normalize(normalizedPathname);
    const uri = URI.parse(path).with({
      scheme: this._webExtensionResourceUrlTemplate.scheme,
      authority: path.substring(0, path.indexOf("/")),
      path: path.substring(path.indexOf("/") + 1)
    });
    if (this._getResourceURLTemplateAuthority(this._webExtensionResourceUrlTemplate) !== this._getResourceURLTemplateAuthority(uri)) {
      return serveError(req, res, 403, "Request Forbidden");
    }
    const headers = {};
    const setRequestHeader = (header) => {
      const value = req.headers[header];
      if (value && (isString(value) || value[0])) {
        headers[header] = isString(value) ? value : value[0];
      } else if (header !== header.toLowerCase()) {
        setRequestHeader(header.toLowerCase());
      }
    };
    setRequestHeader("X-Client-Name");
    setRequestHeader("X-Client-Version");
    setRequestHeader("X-Machine-Id");
    setRequestHeader("X-Client-Commit");
    const context = await this._requestService.request({
      type: "GET",
      url: uri.toString(true),
      headers,
      callSite: "webClientServer.fetchAndWriteFile"
    }, CancellationToken.None);
    const status = context.res.statusCode || 500;
    if (status !== 200) {
      let text = null;
      try {
        text = await asTextOrError(context);
      } catch (error) {
      }
      return serveError(req, res, status, text || `Request failed with status ${status}`);
    }
    const responseHeaders = /* @__PURE__ */ Object.create(null);
    const setResponseHeader = (header) => {
      const value = context.res.headers[header];
      if (value) {
        responseHeaders[header] = value;
      } else if (header !== header.toLowerCase()) {
        setResponseHeader(header.toLowerCase());
      }
    };
    setResponseHeader("Cache-Control");
    setResponseHeader("Content-Type");
    res.writeHead(200, responseHeaders);
    const buffer = await streamToBuffer(context.stream);
    return void res.end(buffer.buffer);
  }
  /**
   * Handle HTTP requests for /
   */
  async _handleRoot(req, res, parsedUrl) {
    const getFirstHeader = (headerName) => {
      const val = req.headers[headerName];
      return Array.isArray(val) ? val[0] : val;
    };
    const basePath = getFirstHeader("x-forwarded-prefix") || this._basePath;
    const queryConnectionToken = parsedUrl.query[connectionTokenQueryName];
    if (typeof queryConnectionToken === "string") {
      const responseHeaders = /* @__PURE__ */ Object.create(null);
      responseHeaders["Set-Cookie"] = cookie.serialize(
        connectionTokenCookieName,
        queryConnectionToken,
        {
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7
          /* 1 week */
        }
      );
      const newQuery = /* @__PURE__ */ Object.create(null);
      for (const key in parsedUrl.query) {
        if (key !== connectionTokenQueryName) {
          newQuery[key] = parsedUrl.query[key];
        }
      }
      const newLocation = url.format({ pathname: basePath, query: newQuery });
      responseHeaders["Location"] = newLocation;
      res.writeHead(302, responseHeaders);
      return void res.end();
    }
    const replacePort = (host, port) => {
      const index = host?.indexOf(":");
      if (index !== -1) {
        host = host?.substring(0, index);
      }
      host += `:${port}`;
      return host;
    };
    const useTestResolver = !this._environmentService.isBuilt && this._environmentService.args["use-test-resolver"];
    let remoteAuthority = useTestResolver ? "test+test" : getFirstHeader("x-original-host") || getFirstHeader("x-forwarded-host") || req.headers.host;
    if (!remoteAuthority) {
      return serveError(req, res, 400, `Bad request.`);
    }
    const forwardedPort = getFirstHeader("x-forwarded-port");
    if (forwardedPort) {
      remoteAuthority = replacePort(remoteAuthority, forwardedPort);
    }
    function asJSON(value) {
      return JSON.stringify(value).replace(/"/g, "&quot;");
    }
    let _wrapWebWorkerExtHostInIframe = void 0;
    if (this._environmentService.args["enable-smoke-test-driver"]) {
      _wrapWebWorkerExtHostInIframe = false;
    }
    if (this._logService.getLevel() === LogLevel.Trace) {
      ["x-original-host", "x-forwarded-host", "x-forwarded-port", "host"].forEach((header) => {
        const value = getFirstHeader(header);
        if (value) {
          this._logService.trace(`[WebClientServer] ${header}: ${value}`);
        }
      });
      this._logService.trace(`[WebClientServer] Request URL: ${req.url}, basePath: ${basePath}, remoteAuthority: ${remoteAuthority}`);
    }
    const staticRoute = posix.join(basePath, this._productPath, STATIC_PATH);
    const callbackRoute = posix.join(basePath, this._productPath, CALLBACK_PATH);
    const webExtensionRoute = posix.join(basePath, this._productPath, WEB_EXTENSION_PATH);
    const resolveWorkspaceURI = (defaultLocation) => defaultLocation && URI.file(resolve(defaultLocation)).with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority });
    const filePath = FileAccess.asFileUri(`vs/code/browser/workbench/workbench${this._environmentService.isBuilt ? "" : "-dev"}.html`).fsPath;
    const authSessionInfo = !this._environmentService.isBuilt && this._environmentService.args["github-auth"] ? {
      id: generateUuid(),
      providerId: "github",
      accessToken: this._environmentService.args["github-auth"],
      scopes: [["user:email"], ["repo"]]
    } : void 0;
    const productConfiguration = {
      embedderIdentifier: "server-distro",
      voiceWsUrl: this._productService.voiceWsUrl,
      extensionsGallery: this._webExtensionResourceUrlTemplate && this._productService.extensionsGallery ? {
        ...this._productService.extensionsGallery,
        resourceUrlTemplate: this._webExtensionResourceUrlTemplate.with({
          scheme: "http",
          authority: remoteAuthority,
          path: `${webExtensionRoute}/${this._webExtensionResourceUrlTemplate.authority}${this._webExtensionResourceUrlTemplate.path}`
        }).toString(true)
      } : void 0
    };
    if (!this._environmentService.isBuilt) {
      try {
        const productOverrides = JSON.parse((await promises.readFile(join(APP_ROOT, "product.overrides.json"))).toString());
        Object.assign(productConfiguration, productOverrides);
      } catch (err) {
      }
    }
    const workbenchWebConfiguration = {
      remoteAuthority,
      serverBasePath: basePath,
      _wrapWebWorkerExtHostInIframe,
      developmentOptions: { enableSmokeTestDriver: this._environmentService.args["enable-smoke-test-driver"] ? true : void 0, logLevel: this._logService.getLevel() },
      settingsSyncOptions: !this._environmentService.isBuilt && this._environmentService.args["enable-sync"] ? { enabled: true } : void 0,
      enableWorkspaceTrust: !this._environmentService.args["disable-workspace-trust"],
      enabledExtensionProposedApi: this._environmentService.args["enable-proposed-api"],
      folderUri: resolveWorkspaceURI(this._environmentService.args["default-folder"]),
      workspaceUri: resolveWorkspaceURI(this._environmentService.args["default-workspace"]),
      productConfiguration,
      callbackRoute
    };
    const cookies = cookie.parse(req.headers.cookie || "");
    const locale = cookies["vscode.nls.locale"] || req.headers["accept-language"]?.split(",")[0]?.toLowerCase() || "en";
    let WORKBENCH_NLS_BASE_URL;
    let WORKBENCH_NLS_URL;
    if (!locale.startsWith("en") && this._productService.nlsCoreBaseUrl) {
      WORKBENCH_NLS_BASE_URL = this._productService.nlsCoreBaseUrl;
      WORKBENCH_NLS_URL = `${WORKBENCH_NLS_BASE_URL}${this._productService.commit}/${this._productService.version}/${locale}/nls.messages.js`;
    } else {
      WORKBENCH_NLS_URL = "";
    }
    const values = {
      WORKBENCH_WEB_CONFIGURATION: asJSON(workbenchWebConfiguration),
      WORKBENCH_AUTH_SESSION: authSessionInfo ? asJSON(authSessionInfo) : "",
      WORKBENCH_WEB_BASE_URL: staticRoute,
      WORKBENCH_NLS_URL,
      WORKBENCH_NLS_FALLBACK_URL: `${staticRoute}/out/nls.messages.js`
    };
    if (this._cssDevService.isEnabled) {
      const cssModules = await this._cssDevService.getCssModules();
      values["WORKBENCH_DEV_CSS_MODULES"] = JSON.stringify(cssModules);
    }
    if (useTestResolver) {
      const bundledExtensions = [];
      for (const extensionPath of ["vscode-test-resolver", "github-authentication"]) {
        const packageJSON = JSON.parse((await promises.readFile(FileAccess.asFileUri(`${builtinExtensionsPath}/${extensionPath}/package.json`).fsPath)).toString());
        bundledExtensions.push({ extensionPath, packageJSON });
      }
      values["WORKBENCH_BUILTIN_EXTENSIONS"] = asJSON(bundledExtensions);
    }
    let data;
    try {
      const workbenchTemplate = (await promises.readFile(filePath)).toString();
      data = workbenchTemplate.replace(/\{\{([^}]+)\}\}/g, (_, key) => values[key] ?? "undefined");
    } catch (e) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return void res.end("Not found");
    }
    const webWorkerExtensionHostIframeScriptSHA = "sha256-daEgfo2VIXpx2Np71KqCCbkeQwv+68vPrx54XRcbdcs=";
    const cspDirectives = [
      "default-src 'self';",
      "img-src 'self' https: data: blob:;",
      "media-src 'self';",
      `script-src 'self' 'unsafe-eval' ${WORKBENCH_NLS_BASE_URL ?? ""} blob: 'nonce-1nline-m4p' ${this._getScriptCspHashes(data).join(" ")} '${webWorkerExtensionHostIframeScriptSHA}' 'sha256-/r7rqQ+yrxt57sxLuQ6AMYcy/lUpvAIzHjIJt/OeLWU=' ${useTestResolver ? "" : `http://${remoteAuthority}`};`,
      // the sha is the same as in src/vs/workbench/services/extensions/worker/webWorkerExtensionHostIframe.html
      "child-src 'self';",
      `frame-src 'self' https://*.vscode-cdn.net data:;`,
      "worker-src 'self' data: blob:;",
      "style-src 'self' 'unsafe-inline';",
      "connect-src 'self' ws: wss: https:;",
      "font-src 'self' blob:;",
      "manifest-src 'self';"
    ].join(" ");
    const headers = {
      "Content-Type": "text/html",
      "Content-Security-Policy": cspDirectives
    };
    if (this._connectionToken.type !== ServerConnectionTokenType.None) {
      headers["Set-Cookie"] = cookie.serialize(
        connectionTokenCookieName,
        this._connectionToken.value,
        {
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7
          /* 1 week */
        }
      );
    }
    res.writeHead(200, headers);
    return void res.end(data);
  }
  _getScriptCspHashes(content) {
    const regex = /<script>([\s\S]+?)<\/script>/img;
    const result = [];
    let match;
    while (match = regex.exec(content)) {
      const hasher = crypto.createHash("sha256");
      const script = match[1].replace(/\r\n/g, "\n");
      const hash = hasher.update(Buffer.from(script)).digest().toString("base64");
      result.push(`'sha256-${hash}'`);
    }
    return result;
  }
  /**
   * Handle HTTP requests for /callback
   */
  async _handleCallback(res) {
    const filePath = FileAccess.asFileUri("vs/code/browser/workbench/callback.html").fsPath;
    const data = (await promises.readFile(filePath)).toString();
    const cspDirectives = [
      "default-src 'self';",
      "img-src 'self' https: data: blob:;",
      "media-src 'none';",
      `script-src 'self' ${this._getScriptCspHashes(data).join(" ")};`,
      "style-src 'self' 'unsafe-inline';",
      "font-src 'self' blob:;"
    ].join(" ");
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Security-Policy": cspDirectives
    });
    return void res.end(data);
  }
};
WebClientServer = __decorateClass([
  __decorateParam(3, IServerEnvironmentService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IRequestService),
  __decorateParam(6, IProductService),
  __decorateParam(7, ICSSDevelopmentService)
], WebClientServer);
export {
  CacheControl,
  WebClientServer,
  serveError,
  serveFile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3NlcnZlci9ub2RlL3dlYkNsaWVudFNlcnZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZVJlYWRTdHJlYW0sIHByb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgdXJsIGZyb20gJ3VybCc7XG5pbXBvcnQgKiBhcyBjb29raWUgZnJvbSAnY29va2llJztcbmltcG9ydCAqIGFzIGNyeXB0byBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHsgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBnZXRNZWRpYU1pbWUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IGlzTGludXggfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU2VydmVyRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0bmFtZSwgZGlybmFtZSwgam9pbiwgbm9ybWFsaXplLCBwb3NpeCwgcmVzb2x2ZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgY29ubmVjdGlvblRva2VuQ29va2llTmFtZSwgY29ubmVjdGlvblRva2VuUXVlcnlOYW1lLCBTY2hlbWFzLCBidWlsdGluRXh0ZW5zaW9uc1BhdGggfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmVyQ29ubmVjdGlvblRva2VuLCBTZXJ2ZXJDb25uZWN0aW9uVG9rZW5UeXBlIH0gZnJvbSAnLi9zZXJ2ZXJDb25uZWN0aW9uVG9rZW4uanMnO1xuaW1wb3J0IHsgYXNUZXh0T3JFcnJvciwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJSGVhZGVycyB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgc3RyZWFtVG9CdWZmZXIgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZywgTXV0YWJsZSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vY3NzRGV2L25vZGUvY3NzRGV2U2VydmljZS5qcyc7XG5cbmNvbnN0IHRleHRNaW1lVHlwZTogeyBbZXh0OiBzdHJpbmddOiBzdHJpbmcgfCB1bmRlZmluZWQgfSA9IHtcblx0Jy5odG1sJzogJ3RleHQvaHRtbCcsXG5cdCcuanMnOiAndGV4dC9qYXZhc2NyaXB0Jyxcblx0Jy5qc29uJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHQnLmNzcyc6ICd0ZXh0L2NzcycsXG5cdCcuc3ZnJzogJ2ltYWdlL3N2Zyt4bWwnLFxufTtcblxuLyoqXG4gKiBSZXR1cm4gYW4gZXJyb3IgdG8gdGhlIGNsaWVudC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlcnZlRXJyb3IocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBlcnJvckNvZGU6IG51bWJlciwgZXJyb3JNZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0cmVzLndyaXRlSGVhZChlcnJvckNvZGUsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJyB9KTtcblx0cmVzLmVuZChlcnJvck1lc3NhZ2UpO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDYWNoZUNvbnRyb2wge1xuXHROT19DQUNISU5HLCBFVEFHLCBOT19FWFBJUllcbn1cblxuLyoqXG4gKiBTZXJ2ZSBhIGZpbGUgYXQgYSBnaXZlbiBwYXRoIG9yIDQwNCBpZiB0aGUgZmlsZSBpcyBtaXNzaW5nLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VydmVGaWxlKGZpbGVQYXRoOiBzdHJpbmcsIGNhY2hlQ29udHJvbDogQ2FjaGVDb250cm9sLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgcmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCByZXNwb25zZUhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0dHJ5IHtcblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvbWlzZXMuc3RhdChmaWxlUGF0aCk7IC8vIHRocm93cyBhbiBlcnJvciBpZiBmaWxlIGRvZXNuJ3QgZXhpc3Rcblx0XHRpZiAoY2FjaGVDb250cm9sID09PSBDYWNoZUNvbnRyb2wuRVRBRykge1xuXG5cdFx0XHQvLyBDaGVjayBpZiBmaWxlIG1vZGlmaWVkIHNpbmNlXG5cdFx0XHRjb25zdCBldGFnID0gYFcvXCIke1tzdGF0Lmlubywgc3RhdC5zaXplLCBzdGF0Lm10aW1lLmdldFRpbWUoKV0uam9pbignLScpfVwiYDsgLy8gd2VhayB2YWxpZGF0b3IgKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0hUVFAvSGVhZGVycy9FVGFnKVxuXHRcdFx0aWYgKHJlcS5oZWFkZXJzWydpZi1ub25lLW1hdGNoJ10gPT09IGV0YWcpIHtcblx0XHRcdFx0cmVzLndyaXRlSGVhZCgzMDQpO1xuXHRcdFx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3BvbnNlSGVhZGVyc1snRXRhZyddID0gZXRhZztcblx0XHR9IGVsc2UgaWYgKGNhY2hlQ29udHJvbCA9PT0gQ2FjaGVDb250cm9sLk5PX0VYUElSWSkge1xuXHRcdFx0cmVzcG9uc2VIZWFkZXJzWydDYWNoZS1Db250cm9sJ10gPSAncHVibGljLCBtYXgtYWdlPTMxNTM2MDAwJztcblx0XHR9IGVsc2UgaWYgKGNhY2hlQ29udHJvbCA9PT0gQ2FjaGVDb250cm9sLk5PX0NBQ0hJTkcpIHtcblx0XHRcdHJlc3BvbnNlSGVhZGVyc1snQ2FjaGUtQ29udHJvbCddID0gJ25vLXN0b3JlJztcblx0XHR9XG5cblx0XHRyZXNwb25zZUhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddID0gdGV4dE1pbWVUeXBlW2V4dG5hbWUoZmlsZVBhdGgpXSB8fCBnZXRNZWRpYU1pbWUoZmlsZVBhdGgpIHx8ICd0ZXh0L3BsYWluJztcblxuXHRcdC8vIENyZWF0ZSB0aGUgc3RyZWFtIGZpcnN0IGFuZCB3YWl0IGZvciBpdCB0byBvcGVuIGJlZm9yZSBzZW5kaW5nXG5cdFx0Ly8gaGVhZGVycyBzbyB0aGF0IGVycm9ycyAoZS5nLiBFTk9FTlQgcmFjZSkgY2FuIHN0aWxsIHByb2R1Y2UgYVxuXHRcdC8vIHByb3BlciA0MDQgcmVzcG9uc2UgaW5zdGVhZCBvZiBhYm9ydGluZyBhIGhhbGYtc2VudCAyMDAuXG5cdFx0Y29uc3QgZmlsZVN0cmVhbSA9IGNyZWF0ZVJlYWRTdHJlYW0oZmlsZVBhdGgpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGZpbGVTdHJlYW0ub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdGZpbGVTdHJlYW0ub24oJ29wZW4nLCAoKSA9PiB7XG5cdFx0XHRcdC8vIEZpbGUgb3BlbmVkIHN1Y2Nlc3NmdWxseSAtIHNlbmQgaGVhZGVycyBhbmQgcGlwZVxuXHRcdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgcmVzcG9uc2VIZWFkZXJzKTtcblx0XHRcdFx0ZmlsZVN0cmVhbS5waXBlKHJlcyk7XG5cdFx0XHRcdC8vIERlc3Ryb3kgdGhlIHJlYWQgc3RyZWFtIGlmIHRoZSByZXNwb25zZSBpcyBjbG9zZWQgcHJlbWF0dXJlbHlcblx0XHRcdFx0Ly8gKGUuZy4gY2xpZW50IGRpc2Nvbm5lY3QpIHRvIGF2b2lkIGxlYWtpbmcgdGhlIGZpbGUgZGVzY3JpcHRvci5cblx0XHRcdFx0cmVzLm9uY2UoJ2Nsb3NlJywgKCkgPT4gZmlsZVN0cmVhbS5kZXN0cm95KCkpO1xuXHRcdFx0XHRmaWxlU3RyZWFtLm9uKCdlbmQnLCByZXNvbHZlKTtcblx0XHRcdFx0Ly8gUmVwbGFjZSB0aGUgaW5pdGlhbCBlcnJvciBoYW5kbGVyIG5vdyB0aGF0IGhlYWRlcnMgYXJlIHNlbnRcblx0XHRcdFx0ZmlsZVN0cmVhbS5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2Vycm9yJyk7XG5cdFx0XHRcdGZpbGVTdHJlYW0ub24oJ2Vycm9yJywgZXJyb3IgPT4ge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0cmVzLmRlc3Ryb3koKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRpZiAoZXJyb3IuY29kZSAhPT0gJ0VOT0VOVCcpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnJvci50b1N0cmluZygpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5lcnJvcihgRmlsZSBub3QgZm91bmQ6ICR7ZmlsZVBhdGh9YCk7XG5cdFx0fVxuXG5cdFx0cmVzLndyaXRlSGVhZCg0MDQsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJyB9KTtcblx0XHRyZXR1cm4gdm9pZCByZXMuZW5kKCdOb3QgZm91bmQnKTtcblx0fVxufVxuXG5jb25zdCBBUFBfUk9PVCA9IGRpcm5hbWUoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLmZzUGF0aCk7XG5cbmNvbnN0IFNUQVRJQ19QQVRIID0gYC9zdGF0aWNgO1xuY29uc3QgQ0FMTEJBQ0tfUEFUSCA9IGAvY2FsbGJhY2tgO1xuY29uc3QgV0VCX0VYVEVOU0lPTl9QQVRIID0gYC93ZWItZXh0ZW5zaW9uLXJlc291cmNlYDtcblxuZXhwb3J0IGNsYXNzIFdlYkNsaWVudFNlcnZlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2ViRXh0ZW5zaW9uUmVzb3VyY2VVcmxUZW1wbGF0ZTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25Ub2tlbjogU2VydmVyQ29ubmVjdGlvblRva2VuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Jhc2VQYXRoOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFBhdGg6IHN0cmluZyxcblx0XHRASVNlcnZlckVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDU1NEZXZlbG9wbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3NzRGV2U2VydmljZTogSUNTU0RldmVsb3BtZW50U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl93ZWJFeHRlbnNpb25SZXNvdXJjZVVybFRlbXBsYXRlID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnk/LnJlc291cmNlVXJsVGVtcGxhdGUgPyBVUkkucGFyc2UodGhpcy5fcHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uc0dhbGxlcnkucmVzb3VyY2VVcmxUZW1wbGF0ZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIHdlYiByZXNvdXJjZXMgKGkuZS4gb25seSBuZWVkZWQgYnkgdGhlIHdlYiBjbGllbnQpLlxuXHQgKiAqKk5PVEUqKjogVGhpcyBtZXRob2QgaXMgb25seSBpbnZva2VkIHdoZW4gdGhlIHNlcnZlciBoYXMgd2ViIGJpdHMuXG5cdCAqICoqTk9URSoqOiBUaGlzIG1ldGhvZCBpcyBvbmx5IGludm9rZWQgYWZ0ZXIgdGhlIGNvbm5lY3Rpb24gdG9rZW4gaGFzIGJlZW4gdmFsaWRhdGVkLlxuXHQgKiBAcGFyYW0gcGFyc2VkVXJsIFRoZSBVUkwgdG8gaGFuZGxlLCBpbmNsdWRpbmcgYmFzZSBhbmQgcHJvZHVjdCBwYXRoXG5cdCAqIEBwYXJhbSBwYXRobmFtZSBUaGUgcGF0aG5hbWUgb2YgdGhlIFVSTCwgd2l0aG91dCBiYXNlIGFuZCBwcm9kdWN0IHBhdGhcblx0ICovXG5cdGFzeW5jIGhhbmRsZShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIHBhcnNlZFVybDogdXJsLlVybFdpdGhQYXJzZWRRdWVyeSwgcGF0aG5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAocGF0aG5hbWUuc3RhcnRzV2l0aChTVEFUSUNfUEFUSCkgJiYgcGF0aG5hbWUuY2hhckNvZGVBdChTVEFUSUNfUEFUSC5sZW5ndGgpID09PSBDaGFyQ29kZS5TbGFzaCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlU3RhdGljKHJlcSwgcmVzLCBwYXRobmFtZS5zdWJzdHJpbmcoU1RBVElDX1BBVEgubGVuZ3RoKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGF0aG5hbWUgPT09ICcvJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlUm9vdChyZXEsIHJlcywgcGFyc2VkVXJsKTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXRobmFtZSA9PT0gQ0FMTEJBQ0tfUEFUSCkge1xuXHRcdFx0XHQvLyBjYWxsYmFjayBzdXBwb3J0XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oYW5kbGVDYWxsYmFjayhyZXMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhdGhuYW1lLnN0YXJ0c1dpdGgoV0VCX0VYVEVOU0lPTl9QQVRIKSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KFdFQl9FWFRFTlNJT05fUEFUSC5sZW5ndGgpID09PSBDaGFyQ29kZS5TbGFzaCkge1xuXHRcdFx0XHQvLyBleHRlbnNpb24gcmVzb3VyY2Ugc3VwcG9ydFxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlV2ViRXh0ZW5zaW9uUmVzb3VyY2UocmVxLCByZXMsIHBhdGhuYW1lLnN1YnN0cmluZyhXRUJfRVhURU5TSU9OX1BBVEgubGVuZ3RoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDQsICdOb3QgZm91bmQuJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnJvci50b1N0cmluZygpKTtcblxuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDUwMCwgJ0ludGVybmFsIFNlcnZlciBFcnJvci4nKTtcblx0XHR9XG5cdH1cblx0LyoqXG5cdCAqIEhhbmRsZSBIVFRQIHJlcXVlc3RzIGZvciAvc3RhdGljLypcblx0ICogQHBhcmFtIHJlc291cmNlUGF0aCBUaGUgcGF0aCBhZnRlciAvc3RhdGljL1xuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlU3RhdGljKHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSwgcmVzb3VyY2VQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdC8vIFN0cmlwIHRoZSB0aGlzLl9zdGF0aWNSb3V0ZSBmcm9tIHRoZSBwYXRoXG5cdFx0Y29uc3Qgbm9ybWFsaXplZFBhdGhuYW1lID0gZGVjb2RlVVJJQ29tcG9uZW50KHJlc291cmNlUGF0aCk7IC8vIHN1cHBvcnQgcGF0aHMgdGhhdCBhcmUgdXJpLWVuY29kZWQgKGUuZy4gc3BhY2VzID0+ICUyMClcblxuXHRcdGNvbnN0IGZpbGVQYXRoID0gam9pbihBUFBfUk9PVCwgbm9ybWFsaXplZFBhdGhuYW1lKTsgLy8gam9pbiBhbHNvIG5vcm1hbGl6ZXMgdGhlIHBhdGhcblx0XHRpZiAoIWlzRXF1YWxPclBhcmVudChmaWxlUGF0aCwgQVBQX1JPT1QsICFpc0xpbnV4KSkge1xuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMCwgYEJhZCByZXF1ZXN0LmApO1xuXHRcdH1cblxuXHRcdHJldHVybiBzZXJ2ZUZpbGUoZmlsZVBhdGgsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ID8gQ2FjaGVDb250cm9sLk5PX0VYUElSWSA6IENhY2hlQ29udHJvbC5FVEFHLCB0aGlzLl9sb2dTZXJ2aWNlLCByZXEsIHJlcywgaGVhZGVycyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZXNvdXJjZVVSTFRlbXBsYXRlQXV0aG9yaXR5KHVyaTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmRleCA9IHVyaS5hdXRob3JpdHkuaW5kZXhPZignLicpO1xuXHRcdHJldHVybiBpbmRleCAhPT0gLTEgPyB1cmkuYXV0aG9yaXR5LnN1YnN0cmluZyhpbmRleCArIDEpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBleHRlbnNpb24gcmVzb3VyY2VzXG5cdCAqIEBwYXJhbSByZXNvdXJjZVBhdGggVGhlIHBhdGggYWZ0ZXIgL3dlYi1leHRlbnNpb24tcmVzb3VyY2UvXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVXZWJFeHRlbnNpb25SZXNvdXJjZShyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIHJlc291cmNlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl93ZWJFeHRlbnNpb25SZXNvdXJjZVVybFRlbXBsYXRlKSB7XG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgNTAwLCAnTm8gZXh0ZW5zaW9uIGdhbGxlcnkgc2VydmljZSBjb25maWd1cmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vcm1hbGl6ZWRQYXRobmFtZSA9IGRlY29kZVVSSUNvbXBvbmVudChyZXNvdXJjZVBhdGgpOyAvLyBzdXBwb3J0IHBhdGhzIHRoYXQgYXJlIHVyaS1lbmNvZGVkIChlLmcuIHNwYWNlcyA9PiAlMjApXG5cdFx0Y29uc3QgcGF0aCA9IG5vcm1hbGl6ZShub3JtYWxpemVkUGF0aG5hbWUpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShwYXRoKS53aXRoKHtcblx0XHRcdHNjaGVtZTogdGhpcy5fd2ViRXh0ZW5zaW9uUmVzb3VyY2VVcmxUZW1wbGF0ZS5zY2hlbWUsXG5cdFx0XHRhdXRob3JpdHk6IHBhdGguc3Vic3RyaW5nKDAsIHBhdGguaW5kZXhPZignLycpKSxcblx0XHRcdHBhdGg6IHBhdGguc3Vic3RyaW5nKHBhdGguaW5kZXhPZignLycpICsgMSlcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9nZXRSZXNvdXJjZVVSTFRlbXBsYXRlQXV0aG9yaXR5KHRoaXMuX3dlYkV4dGVuc2lvblJlc291cmNlVXJsVGVtcGxhdGUpICE9PSB0aGlzLl9nZXRSZXNvdXJjZVVSTFRlbXBsYXRlQXV0aG9yaXR5KHVyaSkpIHtcblx0XHRcdHJldHVybiBzZXJ2ZUVycm9yKHJlcSwgcmVzLCA0MDMsICdSZXF1ZXN0IEZvcmJpZGRlbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnM6IElIZWFkZXJzID0ge307XG5cdFx0Y29uc3Qgc2V0UmVxdWVzdEhlYWRlciA9IChoZWFkZXI6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZXEuaGVhZGVyc1toZWFkZXJdO1xuXHRcdFx0aWYgKHZhbHVlICYmIChpc1N0cmluZyh2YWx1ZSkgfHwgdmFsdWVbMF0pKSB7XG5cdFx0XHRcdGhlYWRlcnNbaGVhZGVyXSA9IGlzU3RyaW5nKHZhbHVlKSA/IHZhbHVlIDogdmFsdWVbMF07XG5cdFx0XHR9IGVsc2UgaWYgKGhlYWRlciAhPT0gaGVhZGVyLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0c2V0UmVxdWVzdEhlYWRlcihoZWFkZXIudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRzZXRSZXF1ZXN0SGVhZGVyKCdYLUNsaWVudC1OYW1lJyk7XG5cdFx0c2V0UmVxdWVzdEhlYWRlcignWC1DbGllbnQtVmVyc2lvbicpO1xuXHRcdHNldFJlcXVlc3RIZWFkZXIoJ1gtTWFjaGluZS1JZCcpO1xuXHRcdHNldFJlcXVlc3RIZWFkZXIoJ1gtQ2xpZW50LUNvbW1pdCcpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3JlcXVlc3RTZXJ2aWNlLnJlcXVlc3Qoe1xuXHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHR1cmw6IHVyaS50b1N0cmluZyh0cnVlKSxcblx0XHRcdGhlYWRlcnMsXG5cdFx0XHRjYWxsU2l0ZTogJ3dlYkNsaWVudFNlcnZlci5mZXRjaEFuZFdyaXRlRmlsZSdcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IHN0YXR1cyA9IGNvbnRleHQucmVzLnN0YXR1c0NvZGUgfHwgNTAwO1xuXHRcdGlmIChzdGF0dXMgIT09IDIwMCkge1xuXHRcdFx0bGV0IHRleHQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGV4dCA9IGF3YWl0IGFzVGV4dE9yRXJyb3IoY29udGV4dCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgey8qIElnbm9yZSAqLyB9XG5cdFx0XHRyZXR1cm4gc2VydmVFcnJvcihyZXEsIHJlcywgc3RhdHVzLCB0ZXh0IHx8IGBSZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1cyAke3N0YXR1c31gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZUhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHN0cmluZ1tdPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Y29uc3Qgc2V0UmVzcG9uc2VIZWFkZXIgPSAoaGVhZGVyOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gY29udGV4dC5yZXMuaGVhZGVyc1toZWFkZXJdO1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHJlc3BvbnNlSGVhZGVyc1toZWFkZXJdID0gdmFsdWU7XG5cdFx0XHR9IGVsc2UgaWYgKGhlYWRlciAhPT0gaGVhZGVyLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0c2V0UmVzcG9uc2VIZWFkZXIoaGVhZGVyLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0c2V0UmVzcG9uc2VIZWFkZXIoJ0NhY2hlLUNvbnRyb2wnKTtcblx0XHRzZXRSZXNwb25zZUhlYWRlcignQ29udGVudC1UeXBlJyk7XG5cdFx0cmVzLndyaXRlSGVhZCgyMDAsIHJlc3BvbnNlSGVhZGVycyk7XG5cdFx0Y29uc3QgYnVmZmVyID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoY29udGV4dC5zdHJlYW0pO1xuXHRcdHJldHVybiB2b2lkIHJlcy5lbmQoYnVmZmVyLmJ1ZmZlcik7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIEhUVFAgcmVxdWVzdHMgZm9yIC9cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVJvb3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBwYXJzZWRVcmw6IHVybC5VcmxXaXRoUGFyc2VkUXVlcnkpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGdldEZpcnN0SGVhZGVyID0gKGhlYWRlck5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgdmFsID0gcmVxLmhlYWRlcnNbaGVhZGVyTmFtZV07XG5cdFx0XHRyZXR1cm4gQXJyYXkuaXNBcnJheSh2YWwpID8gdmFsWzBdIDogdmFsO1xuXHRcdH07XG5cblx0XHQvLyBQcmVmaXggcm91dGVzIHdpdGggYmFzZVBhdGggZm9yIGNsaWVudHNcblx0XHRjb25zdCBiYXNlUGF0aCA9IGdldEZpcnN0SGVhZGVyKCd4LWZvcndhcmRlZC1wcmVmaXgnKSB8fCB0aGlzLl9iYXNlUGF0aDtcblxuXHRcdGNvbnN0IHF1ZXJ5Q29ubmVjdGlvblRva2VuID0gcGFyc2VkVXJsLnF1ZXJ5W2Nvbm5lY3Rpb25Ub2tlblF1ZXJ5TmFtZV07XG5cdFx0aWYgKHR5cGVvZiBxdWVyeUNvbm5lY3Rpb25Ub2tlbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdC8vIFdlIGdvdCBhIGNvbm5lY3Rpb24gdG9rZW4gYXMgYSBxdWVyeSBwYXJhbWV0ZXIuXG5cdFx0XHQvLyBXZSB3YW50IHRvIGhhdmUgYSBjbGVhbiBVUkwsIHNvIHdlIHN0cmlwIGl0XG5cdFx0XHRjb25zdCByZXNwb25zZUhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0cmVzcG9uc2VIZWFkZXJzWydTZXQtQ29va2llJ10gPSBjb29raWUuc2VyaWFsaXplKFxuXHRcdFx0XHRjb25uZWN0aW9uVG9rZW5Db29raWVOYW1lLFxuXHRcdFx0XHRxdWVyeUNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVTaXRlOiAnbGF4Jyxcblx0XHRcdFx0XHRtYXhBZ2U6IDYwICogNjAgKiAyNCAqIDcgLyogMSB3ZWVrICovXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IG5ld1F1ZXJ5ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIHBhcnNlZFVybC5xdWVyeSkge1xuXHRcdFx0XHRpZiAoa2V5ICE9PSBjb25uZWN0aW9uVG9rZW5RdWVyeU5hbWUpIHtcblx0XHRcdFx0XHRuZXdRdWVyeVtrZXldID0gcGFyc2VkVXJsLnF1ZXJ5W2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld0xvY2F0aW9uID0gdXJsLmZvcm1hdCh7IHBhdGhuYW1lOiBiYXNlUGF0aCwgcXVlcnk6IG5ld1F1ZXJ5IH0pO1xuXHRcdFx0cmVzcG9uc2VIZWFkZXJzWydMb2NhdGlvbiddID0gbmV3TG9jYXRpb247XG5cblx0XHRcdHJlcy53cml0ZUhlYWQoMzAyLCByZXNwb25zZUhlYWRlcnMpO1xuXHRcdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcGxhY2VQb3J0ID0gKGhvc3Q6IHN0cmluZywgcG9ydDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IGhvc3Q/LmluZGV4T2YoJzonKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0aG9zdCA9IGhvc3Q/LnN1YnN0cmluZygwLCBpbmRleCk7XG5cdFx0XHR9XG5cdFx0XHRob3N0ICs9IGA6JHtwb3J0fWA7XG5cdFx0XHRyZXR1cm4gaG9zdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXNlVGVzdFJlc29sdmVyID0gKCF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCAmJiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1sndXNlLXRlc3QtcmVzb2x2ZXInXSk7XG5cdFx0bGV0IHJlbW90ZUF1dGhvcml0eSA9IChcblx0XHRcdHVzZVRlc3RSZXNvbHZlclxuXHRcdFx0XHQ/ICd0ZXN0K3Rlc3QnXG5cdFx0XHRcdDogKGdldEZpcnN0SGVhZGVyKCd4LW9yaWdpbmFsLWhvc3QnKSB8fCBnZXRGaXJzdEhlYWRlcigneC1mb3J3YXJkZWQtaG9zdCcpIHx8IHJlcS5oZWFkZXJzLmhvc3QpXG5cdFx0KTtcblx0XHRpZiAoIXJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIHNlcnZlRXJyb3IocmVxLCByZXMsIDQwMCwgYEJhZCByZXF1ZXN0LmApO1xuXHRcdH1cblx0XHRjb25zdCBmb3J3YXJkZWRQb3J0ID0gZ2V0Rmlyc3RIZWFkZXIoJ3gtZm9yd2FyZGVkLXBvcnQnKTtcblx0XHRpZiAoZm9yd2FyZGVkUG9ydCkge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5ID0gcmVwbGFjZVBvcnQocmVtb3RlQXV0aG9yaXR5LCBmb3J3YXJkZWRQb3J0KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBhc0pTT04odmFsdWU6IHVua25vd24pOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9cIi9nLCAnJnF1b3Q7Jyk7XG5cdFx0fVxuXG5cdFx0bGV0IF93cmFwV2ViV29ya2VyRXh0SG9zdEluSWZyYW1lOiB1bmRlZmluZWQgfCBmYWxzZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2VuYWJsZS1zbW9rZS10ZXN0LWRyaXZlciddKSB7XG5cdFx0XHQvLyBpbnRlZ3JhdGlvbiB0ZXN0cyBydW4gYXQgYSB0aW1lIHdoZW4gdGhlIGJ1aWx0IG91dHB1dCBpcyBub3QgeWV0IHB1Ymxpc2hlZCB0byB0aGUgQ0ROXG5cdFx0XHQvLyBzbyB3ZSBtdXN0IGRpc2FibGUgdGhlIGlmcmFtZSB3cmFwcGluZyBiZWNhdXNlIHRoZSBpZnJhbWUgVVJMIHdpbGwgZ2l2ZSBhIDQwNFxuXHRcdFx0X3dyYXBXZWJXb3JrZXJFeHRIb3N0SW5JZnJhbWUgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0Wyd4LW9yaWdpbmFsLWhvc3QnLCAneC1mb3J3YXJkZWQtaG9zdCcsICd4LWZvcndhcmRlZC1wb3J0JywgJ2hvc3QnXS5mb3JFYWNoKGhlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gZ2V0Rmlyc3RIZWFkZXIoaGVhZGVyKTtcblx0XHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1dlYkNsaWVudFNlcnZlcl0gJHtoZWFkZXJ9OiAke3ZhbHVlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtXZWJDbGllbnRTZXJ2ZXJdIFJlcXVlc3QgVVJMOiAke3JlcS51cmx9LCBiYXNlUGF0aDogJHtiYXNlUGF0aH0sIHJlbW90ZUF1dGhvcml0eTogJHtyZW1vdGVBdXRob3JpdHl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGljUm91dGUgPSBwb3NpeC5qb2luKGJhc2VQYXRoLCB0aGlzLl9wcm9kdWN0UGF0aCwgU1RBVElDX1BBVEgpO1xuXHRcdGNvbnN0IGNhbGxiYWNrUm91dGUgPSBwb3NpeC5qb2luKGJhc2VQYXRoLCB0aGlzLl9wcm9kdWN0UGF0aCwgQ0FMTEJBQ0tfUEFUSCk7XG5cdFx0Y29uc3Qgd2ViRXh0ZW5zaW9uUm91dGUgPSBwb3NpeC5qb2luKGJhc2VQYXRoLCB0aGlzLl9wcm9kdWN0UGF0aCwgV0VCX0VYVEVOU0lPTl9QQVRIKTtcblxuXHRcdGNvbnN0IHJlc29sdmVXb3Jrc3BhY2VVUkkgPSAoZGVmYXVsdExvY2F0aW9uPzogc3RyaW5nKSA9PiBkZWZhdWx0TG9jYXRpb24gJiYgVVJJLmZpbGUocmVzb2x2ZShkZWZhdWx0TG9jYXRpb24pKS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSwgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHkgfSk7XG5cblx0XHRjb25zdCBmaWxlUGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKGB2cy9jb2RlL2Jyb3dzZXIvd29ya2JlbmNoL3dvcmtiZW5jaCR7dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgPyAnJyA6ICctZGV2J30uaHRtbGApLmZzUGF0aDtcblx0XHRjb25zdCBhdXRoU2Vzc2lvbkluZm8gPSAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2dpdGh1Yi1hdXRoJ10gPyB7XG5cdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRwcm92aWRlcklkOiAnZ2l0aHViJyxcblx0XHRcdGFjY2Vzc1Rva2VuOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZ2l0aHViLWF1dGgnXSxcblx0XHRcdHNjb3BlczogW1sndXNlcjplbWFpbCddLCBbJ3JlcG8nXV1cblx0XHR9IDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcHJvZHVjdENvbmZpZ3VyYXRpb246IFBhcnRpYWw8TXV0YWJsZTxJUHJvZHVjdENvbmZpZ3VyYXRpb24+PiA9IHtcblx0XHRcdGVtYmVkZGVySWRlbnRpZmllcjogJ3NlcnZlci1kaXN0cm8nLFxuXHRcdFx0dm9pY2VXc1VybDogdGhpcy5fcHJvZHVjdFNlcnZpY2Uudm9pY2VXc1VybCxcblx0XHRcdGV4dGVuc2lvbnNHYWxsZXJ5OiB0aGlzLl93ZWJFeHRlbnNpb25SZXNvdXJjZVVybFRlbXBsYXRlICYmIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbnNHYWxsZXJ5ID8ge1xuXHRcdFx0XHQuLi50aGlzLl9wcm9kdWN0U2VydmljZS5leHRlbnNpb25zR2FsbGVyeSxcblx0XHRcdFx0cmVzb3VyY2VVcmxUZW1wbGF0ZTogdGhpcy5fd2ViRXh0ZW5zaW9uUmVzb3VyY2VVcmxUZW1wbGF0ZS53aXRoKHtcblx0XHRcdFx0XHRzY2hlbWU6ICdodHRwJyxcblx0XHRcdFx0XHRhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRwYXRoOiBgJHt3ZWJFeHRlbnNpb25Sb3V0ZX0vJHt0aGlzLl93ZWJFeHRlbnNpb25SZXNvdXJjZVVybFRlbXBsYXRlLmF1dGhvcml0eX0ke3RoaXMuX3dlYkV4dGVuc2lvblJlc291cmNlVXJsVGVtcGxhdGUucGF0aH1gXG5cdFx0XHRcdH0pLnRvU3RyaW5nKHRydWUpXG5cdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdGlmICghdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RPdmVycmlkZXMgPSBKU09OLnBhcnNlKChhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShqb2luKEFQUF9ST09ULCAncHJvZHVjdC5vdmVycmlkZXMuanNvbicpKSkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdE9iamVjdC5hc3NpZ24ocHJvZHVjdENvbmZpZ3VyYXRpb24sIHByb2R1Y3RPdmVycmlkZXMpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7LyogSWdub3JlIEVycm9yICovIH1cblx0XHR9XG5cblx0XHRjb25zdCB3b3JrYmVuY2hXZWJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5LFxuXHRcdFx0c2VydmVyQmFzZVBhdGg6IGJhc2VQYXRoLFxuXHRcdFx0X3dyYXBXZWJXb3JrZXJFeHRIb3N0SW5JZnJhbWUsXG5cdFx0XHRkZXZlbG9wbWVudE9wdGlvbnM6IHsgZW5hYmxlU21va2VUZXN0RHJpdmVyOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZW5hYmxlLXNtb2tlLXRlc3QtZHJpdmVyJ10gPyB0cnVlIDogdW5kZWZpbmVkLCBsb2dMZXZlbDogdGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpIH0sXG5cdFx0XHRzZXR0aW5nc1N5bmNPcHRpb25zOiAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgJiYgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2VuYWJsZS1zeW5jJ10gPyB7IGVuYWJsZWQ6IHRydWUgfSA6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZVdvcmtzcGFjZVRydXN0OiAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2Rpc2FibGUtd29ya3NwYWNlLXRydXN0J10sXG5cdFx0XHRlbmFibGVkRXh0ZW5zaW9uUHJvcG9zZWRBcGk6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydlbmFibGUtcHJvcG9zZWQtYXBpJ10sXG5cdFx0XHRmb2xkZXJVcmk6IHJlc29sdmVXb3Jrc3BhY2VVUkkodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ2RlZmF1bHQtZm9sZGVyJ10pLFxuXHRcdFx0d29ya3NwYWNlVXJpOiByZXNvbHZlV29ya3NwYWNlVVJJKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydkZWZhdWx0LXdvcmtzcGFjZSddKSxcblx0XHRcdHByb2R1Y3RDb25maWd1cmF0aW9uLFxuXHRcdFx0Y2FsbGJhY2tSb3V0ZTogY2FsbGJhY2tSb3V0ZVxuXHRcdH07XG5cblx0XHRjb25zdCBjb29raWVzID0gY29va2llLnBhcnNlKHJlcS5oZWFkZXJzLmNvb2tpZSB8fCAnJyk7XG5cdFx0Y29uc3QgbG9jYWxlID0gY29va2llc1sndnNjb2RlLm5scy5sb2NhbGUnXSB8fCByZXEuaGVhZGVyc1snYWNjZXB0LWxhbmd1YWdlJ10/LnNwbGl0KCcsJylbMF0/LnRvTG93ZXJDYXNlKCkgfHwgJ2VuJztcblx0XHRsZXQgV09SS0JFTkNIX05MU19CQVNFX1VSTDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBXT1JLQkVOQ0hfTkxTX1VSTDogc3RyaW5nO1xuXHRcdGlmICghbG9jYWxlLnN0YXJ0c1dpdGgoJ2VuJykgJiYgdGhpcy5fcHJvZHVjdFNlcnZpY2UubmxzQ29yZUJhc2VVcmwpIHtcblx0XHRcdFdPUktCRU5DSF9OTFNfQkFTRV9VUkwgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5ubHNDb3JlQmFzZVVybDtcblx0XHRcdFdPUktCRU5DSF9OTFNfVVJMID0gYCR7V09SS0JFTkNIX05MU19CQVNFX1VSTH0ke3RoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdH0vJHt0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9ufS8ke2xvY2FsZX0vbmxzLm1lc3NhZ2VzLmpzYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0V09SS0JFTkNIX05MU19VUkwgPSAnJzsgLy8gZmFsbGJhY2sgd2lsbCBhcHBseVxuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcblx0XHRcdFdPUktCRU5DSF9XRUJfQ09ORklHVVJBVElPTjogYXNKU09OKHdvcmtiZW5jaFdlYkNvbmZpZ3VyYXRpb24pLFxuXHRcdFx0V09SS0JFTkNIX0FVVEhfU0VTU0lPTjogYXV0aFNlc3Npb25JbmZvID8gYXNKU09OKGF1dGhTZXNzaW9uSW5mbykgOiAnJyxcblx0XHRcdFdPUktCRU5DSF9XRUJfQkFTRV9VUkw6IHN0YXRpY1JvdXRlLFxuXHRcdFx0V09SS0JFTkNIX05MU19VUkwsXG5cdFx0XHRXT1JLQkVOQ0hfTkxTX0ZBTExCQUNLX1VSTDogYCR7c3RhdGljUm91dGV9L291dC9ubHMubWVzc2FnZXMuanNgXG5cdFx0fTtcblxuXHRcdC8vIERFViAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHQvLyBERVY6IFRoaXMgaXMgZm9yIGRldmVsb3BtZW50IGFuZCBlbmFibGVzIGxvYWRpbmcgQ1NTIHZpYSBpbXBvcnQtc3RhdGVtZW50cyB2aWEgaW1wb3J0LW1hcHMuXG5cdFx0Ly8gREVWOiBUaGUgc2VydmVyIG5lZWRzIHRvIHNlbmQgYWxvbmcgYWxsIENTUyBtb2R1bGVzIHNvIHRoYXQgdGhlIGNsaWVudCBjYW4gY29uc3RydWN0IHRoZVxuXHRcdC8vIERFVjogaW1wb3J0LW1hcC5cblx0XHQvLyBERVYgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0aWYgKHRoaXMuX2Nzc0RldlNlcnZpY2UuaXNFbmFibGVkKSB7XG5cdFx0XHRjb25zdCBjc3NNb2R1bGVzID0gYXdhaXQgdGhpcy5fY3NzRGV2U2VydmljZS5nZXRDc3NNb2R1bGVzKCk7XG5cdFx0XHR2YWx1ZXNbJ1dPUktCRU5DSF9ERVZfQ1NTX01PRFVMRVMnXSA9IEpTT04uc3RyaW5naWZ5KGNzc01vZHVsZXMpO1xuXHRcdH1cblxuXHRcdGlmICh1c2VUZXN0UmVzb2x2ZXIpIHtcblx0XHRcdGNvbnN0IGJ1bmRsZWRFeHRlbnNpb25zOiB7IGV4dGVuc2lvblBhdGg6IHN0cmluZzsgcGFja2FnZUpTT046IElFeHRlbnNpb25NYW5pZmVzdCB9W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uUGF0aCBvZiBbJ3ZzY29kZS10ZXN0LXJlc29sdmVyJywgJ2dpdGh1Yi1hdXRoZW50aWNhdGlvbiddKSB7XG5cdFx0XHRcdGNvbnN0IHBhY2thZ2VKU09OID0gSlNPTi5wYXJzZSgoYXdhaXQgcHJvbWlzZXMucmVhZEZpbGUoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoYCR7YnVpbHRpbkV4dGVuc2lvbnNQYXRofS8ke2V4dGVuc2lvblBhdGh9L3BhY2thZ2UuanNvbmApLmZzUGF0aCkpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRidW5kbGVkRXh0ZW5zaW9ucy5wdXNoKHsgZXh0ZW5zaW9uUGF0aCwgcGFja2FnZUpTT04gfSk7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZXNbJ1dPUktCRU5DSF9CVUlMVElOX0VYVEVOU0lPTlMnXSA9IGFzSlNPTihidW5kbGVkRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXG5cdFx0bGV0IGRhdGE7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcmtiZW5jaFRlbXBsYXRlID0gKGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKGZpbGVQYXRoKSkudG9TdHJpbmcoKTtcblx0XHRcdGRhdGEgPSB3b3JrYmVuY2hUZW1wbGF0ZS5yZXBsYWNlKC9cXHtcXHsoW159XSspXFx9XFx9L2csIChfLCBrZXkpID0+IHZhbHVlc1trZXldID8/ICd1bmRlZmluZWQnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDQwNCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuXHRcdFx0cmV0dXJuIHZvaWQgcmVzLmVuZCgnTm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2ViV29ya2VyRXh0ZW5zaW9uSG9zdElmcmFtZVNjcmlwdFNIQSA9ICdzaGEyNTYtZGFFZ2ZvMlZJWHB4Mk5wNzFLcUNDYmtlUXd2KzY4dlByeDU0WFJjYmRjcz0nO1xuXG5cdFx0Y29uc3QgY3NwRGlyZWN0aXZlcyA9IFtcblx0XHRcdCdkZWZhdWx0LXNyYyBcXCdzZWxmXFwnOycsXG5cdFx0XHQnaW1nLXNyYyBcXCdzZWxmXFwnIGh0dHBzOiBkYXRhOiBibG9iOjsnLFxuXHRcdFx0J21lZGlhLXNyYyBcXCdzZWxmXFwnOycsXG5cdFx0XHRgc2NyaXB0LXNyYyAnc2VsZicgJ3Vuc2FmZS1ldmFsJyAke1dPUktCRU5DSF9OTFNfQkFTRV9VUkwgPz8gJyd9IGJsb2I6ICdub25jZS0xbmxpbmUtbTRwJyAke3RoaXMuX2dldFNjcmlwdENzcEhhc2hlcyhkYXRhKS5qb2luKCcgJyl9ICcke3dlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWVTY3JpcHRTSEF9JyAnc2hhMjU2LS9yN3JxUSt5cnh0NTdzeEx1UTZBTVljeS9sVXB2QUl6SGpJSnQvT2VMV1U9JyAke3VzZVRlc3RSZXNvbHZlciA/ICcnIDogYGh0dHA6Ly8ke3JlbW90ZUF1dGhvcml0eX1gfTtgLCAgLy8gdGhlIHNoYSBpcyB0aGUgc2FtZSBhcyBpbiBzcmMvdnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbnMvd29ya2VyL3dlYldvcmtlckV4dGVuc2lvbkhvc3RJZnJhbWUuaHRtbFxuXHRcdFx0J2NoaWxkLXNyYyBcXCdzZWxmXFwnOycsXG5cdFx0XHRgZnJhbWUtc3JjICdzZWxmJyBodHRwczovLyoudnNjb2RlLWNkbi5uZXQgZGF0YTo7YCxcblx0XHRcdCd3b3JrZXItc3JjIFxcJ3NlbGZcXCcgZGF0YTogYmxvYjo7Jyxcblx0XHRcdCdzdHlsZS1zcmMgXFwnc2VsZlxcJyBcXCd1bnNhZmUtaW5saW5lXFwnOycsXG5cdFx0XHQnY29ubmVjdC1zcmMgXFwnc2VsZlxcJyB3czogd3NzOiBodHRwczo7Jyxcblx0XHRcdCdmb250LXNyYyBcXCdzZWxmXFwnIGJsb2I6OycsXG5cdFx0XHQnbWFuaWZlc3Qtc3JjIFxcJ3NlbGZcXCc7J1xuXHRcdF0uam9pbignICcpO1xuXG5cdFx0Y29uc3QgaGVhZGVyczogaHR0cC5PdXRnb2luZ0h0dHBIZWFkZXJzID0ge1xuXHRcdFx0J0NvbnRlbnQtVHlwZSc6ICd0ZXh0L2h0bWwnLFxuXHRcdFx0J0NvbnRlbnQtU2VjdXJpdHktUG9saWN5JzogY3NwRGlyZWN0aXZlc1xuXHRcdH07XG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25Ub2tlbi50eXBlICE9PSBTZXJ2ZXJDb25uZWN0aW9uVG9rZW5UeXBlLk5vbmUpIHtcblx0XHRcdC8vIEF0IHRoaXMgcG9pbnQgd2Uga25vdyB0aGUgY2xpZW50IGhhcyBhIHZhbGlkIGNvb2tpZVxuXHRcdFx0Ly8gYW5kIHdlIHdhbnQgdG8gc2V0IGl0IHByb2xvbmcgaXQgdG8gZW5zdXJlIHRoYXQgdGhpc1xuXHRcdFx0Ly8gY2xpZW50IGlzIHZhbGlkIGZvciBhbm90aGVyIDEgd2VlayBhdCBsZWFzdFxuXHRcdFx0aGVhZGVyc1snU2V0LUNvb2tpZSddID0gY29va2llLnNlcmlhbGl6ZShcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuQ29va2llTmFtZSxcblx0XHRcdFx0dGhpcy5fY29ubmVjdGlvblRva2VuLnZhbHVlLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c2FtZVNpdGU6ICdsYXgnLFxuXHRcdFx0XHRcdG1heEFnZTogNjAgKiA2MCAqIDI0ICogNyAvKiAxIHdlZWsgKi9cblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRyZXMud3JpdGVIZWFkKDIwMCwgaGVhZGVycyk7XG5cdFx0cmV0dXJuIHZvaWQgcmVzLmVuZChkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNjcmlwdENzcEhhc2hlcyhjb250ZW50OiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdFx0Ly8gQ29tcHV0ZSB0aGUgQ1NQIGhhc2hlcyBmb3IgbGluZSBzY3JpcHRzLiBVc2VzIHJlZ2V4XG5cdFx0Ly8gd2hpY2ggbWVhbnMgaXQgaXNuJ3QgMTAwJSBnb29kLlxuXHRcdGNvbnN0IHJlZ2V4ID0gLzxzY3JpcHQ+KFtcXHNcXFNdKz8pPFxcL3NjcmlwdD4vaW1nO1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0d2hpbGUgKG1hdGNoID0gcmVnZXguZXhlYyhjb250ZW50KSkge1xuXHRcdFx0Y29uc3QgaGFzaGVyID0gY3J5cHRvLmNyZWF0ZUhhc2goJ3NoYTI1NicpO1xuXHRcdFx0Ly8gVGhpcyBvbmx5IHdvcmtzIG9uIFdpbmRvd3MgaWYgd2Ugc3RyaXAgYFxccmAgZnJvbSBgXFxyXFxuYC5cblx0XHRcdGNvbnN0IHNjcmlwdCA9IG1hdGNoWzFdLnJlcGxhY2UoL1xcclxcbi9nLCAnXFxuJyk7XG5cdFx0XHRjb25zdCBoYXNoID0gaGFzaGVyXG5cdFx0XHRcdC51cGRhdGUoQnVmZmVyLmZyb20oc2NyaXB0KSlcblx0XHRcdFx0LmRpZ2VzdCgpLnRvU3RyaW5nKCdiYXNlNjQnKTtcblxuXHRcdFx0cmVzdWx0LnB1c2goYCdzaGEyNTYtJHtoYXNofSdgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGUgSFRUUCByZXF1ZXN0cyBmb3IgL2NhbGxiYWNrXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVDYWxsYmFjayhyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlUGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy9jb2RlL2Jyb3dzZXIvd29ya2JlbmNoL2NhbGxiYWNrLmh0bWwnKS5mc1BhdGg7XG5cdFx0Y29uc3QgZGF0YSA9IChhd2FpdCBwcm9taXNlcy5yZWFkRmlsZShmaWxlUGF0aCkpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY3NwRGlyZWN0aXZlcyA9IFtcblx0XHRcdCdkZWZhdWx0LXNyYyBcXCdzZWxmXFwnOycsXG5cdFx0XHQnaW1nLXNyYyBcXCdzZWxmXFwnIGh0dHBzOiBkYXRhOiBibG9iOjsnLFxuXHRcdFx0J21lZGlhLXNyYyBcXCdub25lXFwnOycsXG5cdFx0XHRgc2NyaXB0LXNyYyAnc2VsZicgJHt0aGlzLl9nZXRTY3JpcHRDc3BIYXNoZXMoZGF0YSkuam9pbignICcpfTtgLFxuXHRcdFx0J3N0eWxlLXNyYyBcXCdzZWxmXFwnIFxcJ3Vuc2FmZS1pbmxpbmVcXCc7Jyxcblx0XHRcdCdmb250LXNyYyBcXCdzZWxmXFwnIGJsb2I6Oydcblx0XHRdLmpvaW4oJyAnKTtcblxuXHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7XG5cdFx0XHQnQ29udGVudC1UeXBlJzogJ3RleHQvaHRtbCcsXG5cdFx0XHQnQ29udGVudC1TZWN1cml0eS1Qb2xpY3knOiBjc3BEaXJlY3RpdmVzXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHZvaWQgcmVzLmVuZChkYXRhKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQixnQkFBZ0I7QUFFM0MsWUFBWSxTQUFTO0FBQ3JCLFlBQVksWUFBWTtBQUN4QixZQUFZLFlBQVk7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYSxnQkFBZ0I7QUFDdEMsU0FB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QUE7QUFBQTtBQUFBLEVBS0EsTUFBYyxnQkFBZ0IsS0FBeUM7QUFDdEUsVUFBTSxXQUFXLFdBQVcsVUFBVSx5Q0FBeUMsRUFBRTtBQUNqRixVQUFNLFFBQVEsTUFBTSxTQUFTLFNBQVMsUUFBUSxHQUFHLFNBQVM7QUFDMUQsVUFBTSxnQkFBZ0I7QUFBQSxNQUNyQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxxQkFBcUIsS0FBSyxvQkFBb0IsSUFBSSxFQUFFLEtBQUssR0FBRyxDQUFDO0FBQUEsTUFDN0Q7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssR0FBRztBQUVWLFFBQUksVUFBVSxLQUFLO0FBQUEsTUFDbEIsZ0JBQWdCO0FBQUEsTUFDaEIsMkJBQTJCO0FBQUEsSUFDNUIsQ0FBQztBQUNELFdBQU8sS0FBSyxJQUFJLElBQUksSUFBSTtBQUFBLEVBQ3pCO0FBQ0Q7QUE1WWEsa0JBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWlU7IiwKICAibmFtZXMiOiBbIkNhY2hlQ29udHJvbCIsICJyZXNvbHZlIl0KfQo=
