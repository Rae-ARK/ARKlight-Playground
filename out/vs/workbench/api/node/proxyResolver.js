import { URI } from "../../../base/common/uri.js";
import { LogLevel as LogServiceLevel } from "../../../platform/log/common/log.js";
import { LogLevel, createHttpPatch, createProxyAuthorizationLookup, createProxyResolver, createTlsPatch, createNetPatch, loadSystemCertificates } from "@vscode/proxy-agent";
import { systemCertificatesNodeDefault } from "../../../platform/request/common/request.js";
import { createRequire } from "node:module";
import { lookupKerberosAuthorization } from "../../../platform/request/node/requestService.js";
import * as proxyAgent from "@vscode/proxy-agent";
const require2 = createRequire(import.meta.url);
const http = require2("http");
const https = require2("https");
const tls = require2("tls");
const net = require2("net");
const systemCertificatesV2Default = false;
const useElectronFetchDefault = false;
function connectProxyResolver(extHostWorkspace, configProvider, extensionService, extHostLogService, mainThreadTelemetry, initData, disposables) {
  const isRemote = initData.remote.isRemote;
  const useHostProxyDefault = initData.environment.useHostProxy ?? !isRemote;
  const fallbackToLocalKerberos = useHostProxyDefault;
  const loadLocalCertificates = useHostProxyDefault;
  const isUseHostProxyEnabled = () => !isRemote || configProvider.getConfiguration("http").get("useLocalProxyConfiguration", useHostProxyDefault);
  const timedResolveProxy = createTimedResolveProxy(extHostWorkspace, mainThreadTelemetry);
  const params = {
    resolveProxy: timedResolveProxy,
    lookupProxyAuthorization: createProxyAuthorizationLookup({
      log: extHostLogService,
      lookupKerberosAuthorization: async (proxyURL) => {
        try {
          const spnConfig = getExtHostConfigValue(configProvider, isRemote, "http.proxyKerberosServicePrincipal");
          const response = await lookupKerberosAuthorization(proxyURL, spnConfig, extHostLogService, "ProxyResolver#lookupProxyAuthorization");
          return "Negotiate " + response;
        } catch (err) {
          extHostLogService.debug("ProxyResolver#lookupProxyAuthorization Kerberos authentication failed", err);
        }
        if (isRemote && fallbackToLocalKerberos) {
          extHostLogService.debug("ProxyResolver#lookupProxyAuthorization Kerberos authentication lookup on host", `proxyURL:${proxyURL}`);
          const auth = await extHostWorkspace.lookupKerberosAuthorization(proxyURL);
          if (auth) {
            return auth;
          }
        }
        return void 0;
      },
      lookupAuthorization: (authInfo) => extHostWorkspace.lookupAuthorization(authInfo),
      onDidRequestAuthentication: (authenticate) => sendTelemetry(mainThreadTelemetry, authenticate, isRemote)
    }),
    getProxyURL: () => getExtHostConfigValue(configProvider, isRemote, "http.proxy"),
    getProxySupport: () => getExtHostConfigValue(configProvider, isRemote, "http.proxySupport") || "off",
    getNoProxyConfig: () => getExtHostConfigValue(configProvider, isRemote, "http.noProxy") || [],
    isAdditionalFetchSupportEnabled: () => getExtHostConfigValue(configProvider, isRemote, "http.fetchAdditionalSupport", true),
    isWebSocketPatchEnabled: () => getExtHostConfigValue(configProvider, isRemote, "http.webSocketAdditionalSupport", true),
    addCertificatesV1: () => certSettingV1(configProvider, isRemote),
    addCertificatesV2: () => certSettingV2(configProvider, isRemote),
    loadSystemCertificatesFromNode: () => getExtHostConfigValue(configProvider, isRemote, "http.systemCertificatesNode", systemCertificatesNodeDefault),
    log: extHostLogService,
    getLogLevel: () => {
      const level = extHostLogService.getLevel();
      switch (level) {
        case LogServiceLevel.Trace:
          return LogLevel.Trace;
        case LogServiceLevel.Debug:
          return LogLevel.Debug;
        case LogServiceLevel.Info:
          return LogLevel.Info;
        case LogServiceLevel.Warning:
          return LogLevel.Warning;
        case LogServiceLevel.Error:
          return LogLevel.Error;
        case LogServiceLevel.Off:
          return LogLevel.Off;
        default:
          return never(level);
      }
      function never(level2) {
        extHostLogService.error("Unknown log level", level2);
        return LogLevel.Debug;
      }
    },
    proxyResolveTelemetry: () => {
    },
    isUseHostProxyEnabled,
    getNetworkInterfaceCheckInterval: () => {
      const intervalSeconds = getExtHostConfigValue(configProvider, isRemote, "http.experimental.networkInterfaceCheckInterval", 300);
      return intervalSeconds * 1e3;
    },
    loadAdditionalCertificates: async () => {
      const useNodeSystemCerts = getExtHostConfigValue(configProvider, isRemote, "http.systemCertificatesNode", systemCertificatesNodeDefault);
      const promises = [];
      if (isRemote) {
        promises.push(loadSystemCertificates({
          loadSystemCertificatesFromNode: () => useNodeSystemCerts,
          log: extHostLogService
        }));
      }
      if (loadLocalCertificates) {
        if (!isRemote && useNodeSystemCerts) {
          promises.push(loadSystemCertificates({
            loadSystemCertificatesFromNode: () => useNodeSystemCerts,
            log: extHostLogService
          }));
        } else {
          extHostLogService.trace("ProxyResolver#loadAdditionalCertificates: Loading certificates from main process");
          const certs = extHostWorkspace.loadCertificates();
          certs.then((certs2) => extHostLogService.trace("ProxyResolver#loadAdditionalCertificates: Loaded certificates from main process", certs2.length));
          promises.push(certs);
        }
      }
      const result = (await Promise.all(promises)).flat();
      mainThreadTelemetry.$publicLog2("additionalCertificates", {
        count: result.length,
        isRemote,
        loadLocalCertificates,
        useNodeSystemCerts
      });
      return result;
    },
    env: process.env
  };
  const { resolveProxyWithRequest, resolveProxyURL, resolveProxyByURL } = createProxyResolver(params);
  const target = proxyAgent.default || proxyAgent;
  target.resolveProxyURL = resolveProxyURL;
  target.resolveProxyByURL = resolveProxyByURL;
  patchGlobalFetch(params, configProvider, mainThreadTelemetry, initData, resolveProxyURL, disposables);
  patchGlobalWebSocket(params, resolveProxyURL);
  const lookup = createPatchedModules(params, resolveProxyWithRequest);
  return configureModuleLoading(extensionService, lookup);
}
const unsafeHeaders = [
  "content-length",
  "host",
  "trailer",
  "te",
  "upgrade",
  "cookie2",
  "keep-alive",
  "transfer-encoding",
  "set-cookie"
];
function patchGlobalFetch(params, configProvider, mainThreadTelemetry, initData, resolveProxyURL, disposables) {
  if (!globalThis.__vscodeOriginalFetch) {
    const originalFetch = globalThis.fetch;
    globalThis.__vscodeOriginalFetch = originalFetch;
    const createPatchedFetch = (options) => proxyAgent.createFetchPatch(params, originalFetch, resolveProxyURL, options);
    const patchedFetch = createPatchedFetch();
    globalThis.__vscodePatchedFetch = patchedFetch;
    globalThis.__vscodeCreateFetchPatch = createPatchedFetch;
    let useElectronFetch = false;
    if (!initData.remote.isRemote) {
      useElectronFetch = configProvider.getConfiguration("http").get("electronFetch", useElectronFetchDefault);
      disposables.add(configProvider.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("http.electronFetch")) {
          useElectronFetch = configProvider.getConfiguration("http").get("electronFetch", useElectronFetchDefault);
        }
      }));
    }
    globalThis.fetch = async function fetch(input, init) {
      function getRequestProperty(name) {
        return init && name in init ? init[name] : typeof input === "object" && "cache" in input ? input[name] : void 0;
      }
      const urlString = typeof input === "string" ? input : "cache" in input ? input.url : input.toString();
      const isDataUrl = urlString.startsWith("data:");
      if (isDataUrl) {
        recordFetchFeatureUse(mainThreadTelemetry, "data");
      }
      const isBlobUrl = urlString.startsWith("blob:");
      if (isBlobUrl) {
        recordFetchFeatureUse(mainThreadTelemetry, "blob");
      }
      const isManualRedirect = getRequestProperty("redirect") === "manual";
      if (isManualRedirect) {
        recordFetchFeatureUse(mainThreadTelemetry, "manualRedirect");
      }
      const integrity = getRequestProperty("integrity");
      if (integrity) {
        recordFetchFeatureUse(mainThreadTelemetry, "integrity");
      }
      if (!useElectronFetch || isDataUrl || isBlobUrl || isManualRedirect || integrity) {
        const response2 = await patchedFetch(input, init);
        monitorResponseProperties(mainThreadTelemetry, response2, urlString);
        return response2;
      }
      if (init?.headers) {
        const headers = new Headers(init.headers);
        for (const header of unsafeHeaders) {
          headers.delete(header);
        }
        init = { ...init, headers };
      }
      const electronInput = input instanceof URL ? input.toString() : input;
      const electron = require2("electron");
      const response = await electron.net.fetch(electronInput, init);
      monitorResponseProperties(mainThreadTelemetry, response, urlString);
      return response;
    };
  }
}
function patchGlobalWebSocket(params, resolveProxyURL) {
  if (!globalThis.__vscodeOriginalWebSocket) {
    const originalWebSocket = globalThis.WebSocket;
    globalThis.__vscodeOriginalWebSocket = originalWebSocket;
    globalThis.WebSocket = proxyAgent.createWebSocketPatch(params, originalWebSocket, resolveProxyURL);
  }
}
function monitorResponseProperties(mainThreadTelemetry, response, urlString) {
  const originalUrl = response.url;
  Object.defineProperty(response, "url", {
    get() {
      recordFetchFeatureUse(mainThreadTelemetry, "url");
      return originalUrl || urlString;
    }
  });
  const originalType = response.type;
  Object.defineProperty(response, "type", {
    get() {
      recordFetchFeatureUse(mainThreadTelemetry, "typeProperty");
      return originalType !== "default" ? originalType : "basic";
    }
  });
}
const fetchFeatureUse = {
  url: 0,
  typeProperty: 0,
  data: 0,
  blob: 0,
  integrity: 0,
  manualRedirect: 0
};
let timer;
const enableFeatureUseTelemetry = false;
function recordFetchFeatureUse(mainThreadTelemetry, feature) {
  if (enableFeatureUseTelemetry && !fetchFeatureUse[feature]++) {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      mainThreadTelemetry.$publicLog2("fetchFeatureUse", fetchFeatureUse);
    }, 1e4);
    timer.unref?.();
  }
}
const proxyResolveStats = {
  count: 0,
  totalDuration: 0,
  minDuration: Number.MAX_SAFE_INTEGER,
  maxDuration: 0,
  types: /* @__PURE__ */ new Set(),
  lastSentTime: 0
};
const telemetryInterval = 60 * 60 * 1e3;
function proxyResolveType(proxy) {
  const type = proxy ? String(proxy).trim().split(/\s+/, 1)[0] : "EMPTY";
  if (["DIRECT", "PROXY", "HTTPS", "SOCKS", "EMPTY"].indexOf(type) === -1) {
    return "UNKNOWN";
  }
  return type;
}
function sendProxyResolveStats(mainThreadTelemetry) {
  if (proxyResolveStats.count > 0) {
    const avgDuration = proxyResolveStats.totalDuration / proxyResolveStats.count;
    mainThreadTelemetry.$publicLog2("proxyResolveStats", {
      count: proxyResolveStats.count,
      totalDuration: proxyResolveStats.totalDuration,
      minDuration: proxyResolveStats.minDuration,
      maxDuration: proxyResolveStats.maxDuration,
      avgDuration,
      type: [...proxyResolveStats.types].sort().join(",")
    });
    proxyResolveStats.count = 0;
    proxyResolveStats.totalDuration = 0;
    proxyResolveStats.minDuration = Number.MAX_SAFE_INTEGER;
    proxyResolveStats.maxDuration = 0;
    proxyResolveStats.types.clear();
  }
  proxyResolveStats.lastSentTime = Date.now();
}
function createTimedResolveProxy(extHostWorkspace, mainThreadTelemetry) {
  return async (url) => {
    const startTime = performance.now();
    let proxy;
    try {
      proxy = await extHostWorkspace.resolveProxy(url);
      return proxy;
    } finally {
      const duration = performance.now() - startTime;
      proxyResolveStats.count++;
      proxyResolveStats.totalDuration += duration;
      proxyResolveStats.minDuration = Math.min(proxyResolveStats.minDuration, duration);
      proxyResolveStats.maxDuration = Math.max(proxyResolveStats.maxDuration, duration);
      proxyResolveStats.types.add(proxyResolveType(proxy));
      const now = Date.now();
      if (now - proxyResolveStats.lastSentTime >= telemetryInterval) {
        sendProxyResolveStats(mainThreadTelemetry);
      }
    }
  };
}
function createPatchedModules(params, resolveProxy) {
  function mergeModules(module, patch) {
    const target = module.default || module;
    target.__vscodeOriginal = Object.assign({}, target);
    return Object.assign(target, patch);
  }
  return {
    http: mergeModules(http, createHttpPatch(params, http, resolveProxy)),
    https: mergeModules(https, createHttpPatch(params, https, resolveProxy)),
    net: mergeModules(net, createNetPatch(params, net)),
    tls: mergeModules(tls, createTlsPatch(params, tls))
  };
}
function certSettingV1(configProvider, isRemote) {
  return !getExtHostConfigValue(configProvider, isRemote, "http.experimental.systemCertificatesV2", systemCertificatesV2Default) && !!getExtHostConfigValue(configProvider, isRemote, "http.systemCertificates");
}
function certSettingV2(configProvider, isRemote) {
  return !!getExtHostConfigValue(configProvider, isRemote, "http.experimental.systemCertificatesV2", systemCertificatesV2Default) && !!getExtHostConfigValue(configProvider, isRemote, "http.systemCertificates");
}
const modulesCache = /* @__PURE__ */ new Map();
function configureModuleLoading(extensionService, lookup) {
  return extensionService.getExtensionPathIndex().then((extensionPaths) => {
    const node_module = require2("module");
    const original = node_module._load;
    node_module._load = function load(request, parent, isMain) {
      if (request === "net") {
        return lookup.net;
      }
      if (request === "tls") {
        return lookup.tls;
      }
      if (request !== "http" && request !== "https" && request !== "undici") {
        return original.apply(this, arguments);
      }
      const ext = extensionPaths.findSubstr(URI.file(parent.filename));
      let cache = modulesCache.get(ext);
      if (!cache) {
        modulesCache.set(ext, cache = {});
      }
      if (!cache[request]) {
        if (request === "undici") {
          const undici = original.apply(this, arguments);
          proxyAgent.patchUndici(undici);
          cache[request] = undici;
        } else {
          const mod = lookup[request];
          cache[request] = { ...mod };
        }
      }
      return cache[request];
    };
  });
}
let telemetrySent = false;
const enableProxyAuthenticationTelemetry = false;
function sendTelemetry(mainThreadTelemetry, authenticate, isRemote) {
  if (!enableProxyAuthenticationTelemetry || telemetrySent || !authenticate.length) {
    return;
  }
  telemetrySent = true;
  mainThreadTelemetry.$publicLog2("proxyAuthenticationRequest", {
    authenticationType: authenticate.map((a) => a.split(" ")[0]).join(","),
    extensionHostType: isRemote ? "remote" : "local"
  });
}
function getExtHostConfigValue(configProvider, isRemote, key, fallback) {
  if (isRemote) {
    return configProvider.getConfiguration().get(key) ?? fallback;
  }
  const values = configProvider.getConfiguration().inspect(key);
  return values?.globalLocalValue ?? values?.defaultValue ?? fallback;
}
export {
  connectProxyResolver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvbm9kZS9wcm94eVJlc29sdmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlciB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25JbnNwZWN0LCBFeHRIb3N0Q29uZmlnUHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RJbml0RGF0YSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbkhvc3RQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEV4dGVuc2lvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCBhcyBMb2dTZXJ2aWNlTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IExvZ0xldmVsLCBjcmVhdGVIdHRwUGF0Y2gsIGNyZWF0ZVByb3h5QXV0aG9yaXphdGlvbkxvb2t1cCwgY3JlYXRlUHJveHlSZXNvbHZlciwgY3JlYXRlVGxzUGF0Y2gsIFByb3h5U3VwcG9ydFNldHRpbmcsIFByb3h5QWdlbnRQYXJhbXMsIGNyZWF0ZU5ldFBhdGNoLCBsb2FkU3lzdGVtQ2VydGlmaWNhdGVzLCBSZXNvbHZlUHJveHlXaXRoUmVxdWVzdCB9IGZyb20gJ0B2c2NvZGUvcHJveHktYWdlbnQnO1xuaW1wb3J0IHsgc3lzdGVtQ2VydGlmaWNhdGVzTm9kZURlZmF1bHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbm9kZTptb2R1bGUnO1xuaW1wb3J0IHR5cGUgKiBhcyB1bmRpY2lUeXBlIGZyb20gJ3VuZGljaS10eXBlcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHRsc1R5cGUgZnJvbSAndGxzJztcbmltcG9ydCB7IGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3Qvbm9kZS9yZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBwcm94eUFnZW50IGZyb20gJ0B2c2NvZGUvcHJveHktYWdlbnQnO1xuXG5jb25zdCByZXF1aXJlID0gY3JlYXRlUmVxdWlyZShpbXBvcnQubWV0YS51cmwpO1xuY29uc3QgaHR0cCA9IHJlcXVpcmUoJ2h0dHAnKTtcbmNvbnN0IGh0dHBzID0gcmVxdWlyZSgnaHR0cHMnKTtcbmNvbnN0IHRsczogdHlwZW9mIHRsc1R5cGUgPSByZXF1aXJlKCd0bHMnKTtcbmNvbnN0IG5ldCA9IHJlcXVpcmUoJ25ldCcpO1xuXG5jb25zdCBzeXN0ZW1DZXJ0aWZpY2F0ZXNWMkRlZmF1bHQgPSBmYWxzZTtcbmNvbnN0IHVzZUVsZWN0cm9uRmV0Y2hEZWZhdWx0ID0gZmFsc2U7XG5cbmV4cG9ydCBmdW5jdGlvbiBjb25uZWN0UHJveHlSZXNvbHZlcihcblx0ZXh0SG9zdFdvcmtzcGFjZTogSUV4dEhvc3RXb3Jrc3BhY2VQcm92aWRlcixcblx0Y29uZmlnUHJvdmlkZXI6IEV4dEhvc3RDb25maWdQcm92aWRlcixcblx0ZXh0ZW5zaW9uU2VydmljZTogRXh0SG9zdEV4dGVuc2lvblNlcnZpY2UsXG5cdGV4dEhvc3RMb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0bWFpblRocmVhZFRlbGVtZXRyeTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLFxuXHRpbml0RGF0YTogSUV4dGVuc2lvbkhvc3RJbml0RGF0YSxcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcbikge1xuXG5cdGNvbnN0IGlzUmVtb3RlID0gaW5pdERhdGEucmVtb3RlLmlzUmVtb3RlO1xuXHRjb25zdCB1c2VIb3N0UHJveHlEZWZhdWx0ID0gaW5pdERhdGEuZW52aXJvbm1lbnQudXNlSG9zdFByb3h5ID8/ICFpc1JlbW90ZTtcblx0Y29uc3QgZmFsbGJhY2tUb0xvY2FsS2VyYmVyb3MgPSB1c2VIb3N0UHJveHlEZWZhdWx0O1xuXHRjb25zdCBsb2FkTG9jYWxDZXJ0aWZpY2F0ZXMgPSB1c2VIb3N0UHJveHlEZWZhdWx0O1xuXHRjb25zdCBpc1VzZUhvc3RQcm94eUVuYWJsZWQgPSAoKSA9PiAhaXNSZW1vdGUgfHwgY29uZmlnUHJvdmlkZXIuZ2V0Q29uZmlndXJhdGlvbignaHR0cCcpLmdldDxib29sZWFuPigndXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24nLCB1c2VIb3N0UHJveHlEZWZhdWx0KTtcblx0Y29uc3QgdGltZWRSZXNvbHZlUHJveHkgPSBjcmVhdGVUaW1lZFJlc29sdmVQcm94eShleHRIb3N0V29ya3NwYWNlLCBtYWluVGhyZWFkVGVsZW1ldHJ5KTtcblx0Y29uc3QgcGFyYW1zOiBQcm94eUFnZW50UGFyYW1zID0ge1xuXHRcdHJlc29sdmVQcm94eTogdGltZWRSZXNvbHZlUHJveHksXG5cdFx0bG9va3VwUHJveHlBdXRob3JpemF0aW9uOiBjcmVhdGVQcm94eUF1dGhvcml6YXRpb25Mb29rdXAoe1xuXHRcdFx0bG9nOiBleHRIb3N0TG9nU2VydmljZSxcblx0XHRcdGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbjogYXN5bmMgcHJveHlVUkwgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHNwbkNvbmZpZyA9IGdldEV4dEhvc3RDb25maWdWYWx1ZTxzdHJpbmc+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAucHJveHlLZXJiZXJvc1NlcnZpY2VQcmluY2lwYWwnKTtcblx0XHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbihwcm94eVVSTCwgc3BuQ29uZmlnLCBleHRIb3N0TG9nU2VydmljZSwgJ1Byb3h5UmVzb2x2ZXIjbG9va3VwUHJveHlBdXRob3JpemF0aW9uJyk7XG5cdFx0XHRcdFx0cmV0dXJuICdOZWdvdGlhdGUgJyArIHJlc3BvbnNlO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRleHRIb3N0TG9nU2VydmljZS5kZWJ1ZygnUHJveHlSZXNvbHZlciNsb29rdXBQcm94eUF1dGhvcml6YXRpb24gS2VyYmVyb3MgYXV0aGVudGljYXRpb24gZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc1JlbW90ZSAmJiBmYWxsYmFja1RvTG9jYWxLZXJiZXJvcykge1xuXHRcdFx0XHRcdGV4dEhvc3RMb2dTZXJ2aWNlLmRlYnVnKCdQcm94eVJlc29sdmVyI2xvb2t1cFByb3h5QXV0aG9yaXphdGlvbiBLZXJiZXJvcyBhdXRoZW50aWNhdGlvbiBsb29rdXAgb24gaG9zdCcsIGBwcm94eVVSTDoke3Byb3h5VVJMfWApO1xuXHRcdFx0XHRcdGNvbnN0IGF1dGggPSBhd2FpdCBleHRIb3N0V29ya3NwYWNlLmxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbihwcm94eVVSTCk7XG5cdFx0XHRcdFx0aWYgKGF1dGgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhdXRoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGxvb2t1cEF1dGhvcml6YXRpb246IGF1dGhJbmZvID0+IGV4dEhvc3RXb3Jrc3BhY2UubG9va3VwQXV0aG9yaXphdGlvbihhdXRoSW5mbyksXG5cdFx0XHRvbkRpZFJlcXVlc3RBdXRoZW50aWNhdGlvbjogYXV0aGVudGljYXRlID0+IHNlbmRUZWxlbWV0cnkobWFpblRocmVhZFRlbGVtZXRyeSwgYXV0aGVudGljYXRlLCBpc1JlbW90ZSksXG5cdFx0fSksXG5cdFx0Z2V0UHJveHlVUkw6ICgpID0+IGdldEV4dEhvc3RDb25maWdWYWx1ZTxzdHJpbmc+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAucHJveHknKSxcblx0XHRnZXRQcm94eVN1cHBvcnQ6ICgpID0+IGdldEV4dEhvc3RDb25maWdWYWx1ZTxQcm94eVN1cHBvcnRTZXR0aW5nPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLnByb3h5U3VwcG9ydCcpIHx8ICdvZmYnLFxuXHRcdGdldE5vUHJveHlDb25maWc6ICgpID0+IGdldEV4dEhvc3RDb25maWdWYWx1ZTxzdHJpbmdbXT4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC5ub1Byb3h5JykgfHwgW10sXG5cdFx0aXNBZGRpdGlvbmFsRmV0Y2hTdXBwb3J0RW5hYmxlZDogKCkgPT4gZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPGJvb2xlYW4+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAuZmV0Y2hBZGRpdGlvbmFsU3VwcG9ydCcsIHRydWUpLFxuXHRcdGlzV2ViU29ja2V0UGF0Y2hFbmFibGVkOiAoKSA9PiBnZXRFeHRIb3N0Q29uZmlnVmFsdWU8Ym9vbGVhbj4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC53ZWJTb2NrZXRBZGRpdGlvbmFsU3VwcG9ydCcsIHRydWUpLFxuXHRcdGFkZENlcnRpZmljYXRlc1YxOiAoKSA9PiBjZXJ0U2V0dGluZ1YxKGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSksXG5cdFx0YWRkQ2VydGlmaWNhdGVzVjI6ICgpID0+IGNlcnRTZXR0aW5nVjIoY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlKSxcblx0XHRsb2FkU3lzdGVtQ2VydGlmaWNhdGVzRnJvbU5vZGU6ICgpID0+IGdldEV4dEhvc3RDb25maWdWYWx1ZTxib29sZWFuPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLnN5c3RlbUNlcnRpZmljYXRlc05vZGUnLCBzeXN0ZW1DZXJ0aWZpY2F0ZXNOb2RlRGVmYXVsdCksXG5cdFx0bG9nOiBleHRIb3N0TG9nU2VydmljZSxcblx0XHRnZXRMb2dMZXZlbDogKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGV2ZWwgPSBleHRIb3N0TG9nU2VydmljZS5nZXRMZXZlbCgpO1xuXHRcdFx0c3dpdGNoIChsZXZlbCkge1xuXHRcdFx0XHRjYXNlIExvZ1NlcnZpY2VMZXZlbC5UcmFjZTogcmV0dXJuIExvZ0xldmVsLlRyYWNlO1xuXHRcdFx0XHRjYXNlIExvZ1NlcnZpY2VMZXZlbC5EZWJ1ZzogcmV0dXJuIExvZ0xldmVsLkRlYnVnO1xuXHRcdFx0XHRjYXNlIExvZ1NlcnZpY2VMZXZlbC5JbmZvOiByZXR1cm4gTG9nTGV2ZWwuSW5mbztcblx0XHRcdFx0Y2FzZSBMb2dTZXJ2aWNlTGV2ZWwuV2FybmluZzogcmV0dXJuIExvZ0xldmVsLldhcm5pbmc7XG5cdFx0XHRcdGNhc2UgTG9nU2VydmljZUxldmVsLkVycm9yOiByZXR1cm4gTG9nTGV2ZWwuRXJyb3I7XG5cdFx0XHRcdGNhc2UgTG9nU2VydmljZUxldmVsLk9mZjogcmV0dXJuIExvZ0xldmVsLk9mZjtcblx0XHRcdFx0ZGVmYXVsdDogcmV0dXJuIG5ldmVyKGxldmVsKTtcblx0XHRcdH1cblx0XHRcdGZ1bmN0aW9uIG5ldmVyKGxldmVsOiBuZXZlcikge1xuXHRcdFx0XHRleHRIb3N0TG9nU2VydmljZS5lcnJvcignVW5rbm93biBsb2cgbGV2ZWwnLCBsZXZlbCk7XG5cdFx0XHRcdHJldHVybiBMb2dMZXZlbC5EZWJ1Zztcblx0XHRcdH1cblx0XHR9LFxuXHRcdHByb3h5UmVzb2x2ZVRlbGVtZXRyeTogKCkgPT4geyB9LFxuXHRcdGlzVXNlSG9zdFByb3h5RW5hYmxlZCxcblx0XHRnZXROZXR3b3JrSW50ZXJmYWNlQ2hlY2tJbnRlcnZhbDogKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW50ZXJ2YWxTZWNvbmRzID0gZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPG51bWJlcj4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC5leHBlcmltZW50YWwubmV0d29ya0ludGVyZmFjZUNoZWNrSW50ZXJ2YWwnLCAzMDApO1xuXHRcdFx0cmV0dXJuIGludGVydmFsU2Vjb25kcyAqIDEwMDA7XG5cdFx0fSxcblx0XHRsb2FkQWRkaXRpb25hbENlcnRpZmljYXRlczogYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXNlTm9kZVN5c3RlbUNlcnRzID0gZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPGJvb2xlYW4+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzTm9kZScsIHN5c3RlbUNlcnRpZmljYXRlc05vZGVEZWZhdWx0KTtcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPHN0cmluZ1tdPltdID0gW107XG5cdFx0XHRpZiAoaXNSZW1vdGUpIHtcblx0XHRcdFx0cHJvbWlzZXMucHVzaChsb2FkU3lzdGVtQ2VydGlmaWNhdGVzKHtcblx0XHRcdFx0XHRsb2FkU3lzdGVtQ2VydGlmaWNhdGVzRnJvbU5vZGU6ICgpID0+IHVzZU5vZGVTeXN0ZW1DZXJ0cyxcblx0XHRcdFx0XHRsb2c6IGV4dEhvc3RMb2dTZXJ2aWNlLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobG9hZExvY2FsQ2VydGlmaWNhdGVzKSB7XG5cdFx0XHRcdGlmICghaXNSZW1vdGUgJiYgdXNlTm9kZVN5c3RlbUNlcnRzKSB7XG5cdFx0XHRcdFx0cHJvbWlzZXMucHVzaChsb2FkU3lzdGVtQ2VydGlmaWNhdGVzKHtcblx0XHRcdFx0XHRcdGxvYWRTeXN0ZW1DZXJ0aWZpY2F0ZXNGcm9tTm9kZTogKCkgPT4gdXNlTm9kZVN5c3RlbUNlcnRzLFxuXHRcdFx0XHRcdFx0bG9nOiBleHRIb3N0TG9nU2VydmljZSxcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXh0SG9zdExvZ1NlcnZpY2UudHJhY2UoJ1Byb3h5UmVzb2x2ZXIjbG9hZEFkZGl0aW9uYWxDZXJ0aWZpY2F0ZXM6IExvYWRpbmcgY2VydGlmaWNhdGVzIGZyb20gbWFpbiBwcm9jZXNzJyk7XG5cdFx0XHRcdFx0Y29uc3QgY2VydHMgPSBleHRIb3N0V29ya3NwYWNlLmxvYWRDZXJ0aWZpY2F0ZXMoKTsgLy8gTG9hZGluZyBmcm9tIG1haW4gcHJvY2VzcyB0byBzaGFyZSBjYWNoZS5cblx0XHRcdFx0XHRjZXJ0cy50aGVuKGNlcnRzID0+IGV4dEhvc3RMb2dTZXJ2aWNlLnRyYWNlKCdQcm94eVJlc29sdmVyI2xvYWRBZGRpdGlvbmFsQ2VydGlmaWNhdGVzOiBMb2FkZWQgY2VydGlmaWNhdGVzIGZyb20gbWFpbiBwcm9jZXNzJywgY2VydHMubGVuZ3RoKSk7XG5cdFx0XHRcdFx0cHJvbWlzZXMucHVzaChjZXJ0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcykpLmZsYXQoKTtcblx0XHRcdG1haW5UaHJlYWRUZWxlbWV0cnkuJHB1YmxpY0xvZzI8QWRkaXRpb25hbENlcnRpZmljYXRlc0V2ZW50LCBBZGRpdGlvbmFsQ2VydGlmaWNhdGVzQ2xhc3NpZmljYXRpb24+KCdhZGRpdGlvbmFsQ2VydGlmaWNhdGVzJywge1xuXHRcdFx0XHRjb3VudDogcmVzdWx0Lmxlbmd0aCxcblx0XHRcdFx0aXNSZW1vdGUsXG5cdFx0XHRcdGxvYWRMb2NhbENlcnRpZmljYXRlcyxcblx0XHRcdFx0dXNlTm9kZVN5c3RlbUNlcnRzLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sXG5cdFx0ZW52OiBwcm9jZXNzLmVudixcblx0fTtcblx0Y29uc3QgeyByZXNvbHZlUHJveHlXaXRoUmVxdWVzdCwgcmVzb2x2ZVByb3h5VVJMLCByZXNvbHZlUHJveHlCeVVSTCB9ID0gY3JlYXRlUHJveHlSZXNvbHZlcihwYXJhbXMpO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0Y29uc3QgdGFyZ2V0ID0gKHByb3h5QWdlbnQgYXMgYW55KS5kZWZhdWx0IHx8IHByb3h5QWdlbnQ7XG5cdHRhcmdldC5yZXNvbHZlUHJveHlVUkwgPSByZXNvbHZlUHJveHlVUkw7XG5cdHRhcmdldC5yZXNvbHZlUHJveHlCeVVSTCA9IHJlc29sdmVQcm94eUJ5VVJMO1xuXG5cdHBhdGNoR2xvYmFsRmV0Y2gocGFyYW1zLCBjb25maWdQcm92aWRlciwgbWFpblRocmVhZFRlbGVtZXRyeSwgaW5pdERhdGEsIHJlc29sdmVQcm94eVVSTCwgZGlzcG9zYWJsZXMpO1xuXHRwYXRjaEdsb2JhbFdlYlNvY2tldChwYXJhbXMsIHJlc29sdmVQcm94eVVSTCk7XG5cblx0Y29uc3QgbG9va3VwID0gY3JlYXRlUGF0Y2hlZE1vZHVsZXMocGFyYW1zLCByZXNvbHZlUHJveHlXaXRoUmVxdWVzdCk7XG5cdHJldHVybiBjb25maWd1cmVNb2R1bGVMb2FkaW5nKGV4dGVuc2lvblNlcnZpY2UsIGxvb2t1cCk7XG59XG5cbmNvbnN0IHVuc2FmZUhlYWRlcnMgPSBbXG5cdCdjb250ZW50LWxlbmd0aCcsXG5cdCdob3N0Jyxcblx0J3RyYWlsZXInLFxuXHQndGUnLFxuXHQndXBncmFkZScsXG5cdCdjb29raWUyJyxcblx0J2tlZXAtYWxpdmUnLFxuXHQndHJhbnNmZXItZW5jb2RpbmcnLFxuXHQnc2V0LWNvb2tpZScsXG5dO1xuXG5mdW5jdGlvbiBwYXRjaEdsb2JhbEZldGNoKHBhcmFtczogUHJveHlBZ2VudFBhcmFtcywgY29uZmlnUHJvdmlkZXI6IEV4dEhvc3RDb25maWdQcm92aWRlciwgbWFpblRocmVhZFRlbGVtZXRyeTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLCBpbml0RGF0YTogSUV4dGVuc2lvbkhvc3RJbml0RGF0YSwgcmVzb2x2ZVByb3h5VVJMOiAodXJsOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0aWYgKCEoZ2xvYmFsVGhpcyBhcyBhbnkpLl9fdnNjb2RlT3JpZ2luYWxGZXRjaCkge1xuXHRcdGNvbnN0IG9yaWdpbmFsRmV0Y2ggPSBnbG9iYWxUaGlzLmZldGNoO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdChnbG9iYWxUaGlzIGFzIGFueSkuX192c2NvZGVPcmlnaW5hbEZldGNoID0gb3JpZ2luYWxGZXRjaDtcblx0XHRjb25zdCBjcmVhdGVQYXRjaGVkRmV0Y2ggPSAob3B0aW9ucz86IHByb3h5QWdlbnQuQ3JlYXRlRmV0Y2hQYXRjaE9wdGlvbnMpID0+IHByb3h5QWdlbnQuY3JlYXRlRmV0Y2hQYXRjaChwYXJhbXMsIG9yaWdpbmFsRmV0Y2gsIHJlc29sdmVQcm94eVVSTCwgb3B0aW9ucyk7XG5cdFx0Y29uc3QgcGF0Y2hlZEZldGNoID0gY3JlYXRlUGF0Y2hlZEZldGNoKCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0KGdsb2JhbFRoaXMgYXMgYW55KS5fX3ZzY29kZVBhdGNoZWRGZXRjaCA9IHBhdGNoZWRGZXRjaDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHQoZ2xvYmFsVGhpcyBhcyBhbnkpLl9fdnNjb2RlQ3JlYXRlRmV0Y2hQYXRjaCA9IGNyZWF0ZVBhdGNoZWRGZXRjaDtcblx0XHRsZXQgdXNlRWxlY3Ryb25GZXRjaCA9IGZhbHNlO1xuXHRcdGlmICghaW5pdERhdGEucmVtb3RlLmlzUmVtb3RlKSB7XG5cdFx0XHR1c2VFbGVjdHJvbkZldGNoID0gY29uZmlnUHJvdmlkZXIuZ2V0Q29uZmlndXJhdGlvbignaHR0cCcpLmdldDxib29sZWFuPignZWxlY3Ryb25GZXRjaCcsIHVzZUVsZWN0cm9uRmV0Y2hEZWZhdWx0KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjb25maWdQcm92aWRlci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdodHRwLmVsZWN0cm9uRmV0Y2gnKSkge1xuXHRcdFx0XHRcdHVzZUVsZWN0cm9uRmV0Y2ggPSBjb25maWdQcm92aWRlci5nZXRDb25maWd1cmF0aW9uKCdodHRwJykuZ2V0PGJvb2xlYW4+KCdlbGVjdHJvbkZldGNoJywgdXNlRWxlY3Ryb25GZXRjaERlZmF1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9GZXRjaF9BUElcblx0XHRnbG9iYWxUaGlzLmZldGNoID0gYXN5bmMgZnVuY3Rpb24gZmV0Y2goaW5wdXQ6IHN0cmluZyB8IFVSTCB8IFJlcXVlc3QsIGluaXQ/OiBSZXF1ZXN0SW5pdCkge1xuXHRcdFx0ZnVuY3Rpb24gZ2V0UmVxdWVzdFByb3BlcnR5KG5hbWU6IGtleW9mIFJlcXVlc3QgJiBrZXlvZiBSZXF1ZXN0SW5pdCkge1xuXHRcdFx0XHRyZXR1cm4gaW5pdCAmJiBuYW1lIGluIGluaXQgPyBpbml0W25hbWVdIDogdHlwZW9mIGlucHV0ID09PSAnb2JqZWN0JyAmJiAnY2FjaGUnIGluIGlucHV0ID8gaW5wdXRbbmFtZV0gOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBMaW1pdGF0aW9uczogaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uL2VsZWN0cm9uL3B1bGwvMzY3MzMjaXNzdWVjb21tZW50LTE0MDU2MTU0OTRcblx0XHRcdC8vIG5ldC5mZXRjaCBmYWlscyBvbiBtYW51YWwgcmVkaXJlY3Q6IGh0dHBzOi8vZ2l0aHViLmNvbS9lbGVjdHJvbi9lbGVjdHJvbi9pc3N1ZXMvNDM3MTVcblx0XHRcdGNvbnN0IHVybFN0cmluZyA9IHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgPyBpbnB1dCA6ICdjYWNoZScgaW4gaW5wdXQgPyBpbnB1dC51cmwgOiBpbnB1dC50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgaXNEYXRhVXJsID0gdXJsU3RyaW5nLnN0YXJ0c1dpdGgoJ2RhdGE6Jyk7XG5cdFx0XHRpZiAoaXNEYXRhVXJsKSB7XG5cdFx0XHRcdHJlY29yZEZldGNoRmVhdHVyZVVzZShtYWluVGhyZWFkVGVsZW1ldHJ5LCAnZGF0YScpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNCbG9iVXJsID0gdXJsU3RyaW5nLnN0YXJ0c1dpdGgoJ2Jsb2I6Jyk7XG5cdFx0XHRpZiAoaXNCbG9iVXJsKSB7XG5cdFx0XHRcdHJlY29yZEZldGNoRmVhdHVyZVVzZShtYWluVGhyZWFkVGVsZW1ldHJ5LCAnYmxvYicpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNNYW51YWxSZWRpcmVjdCA9IGdldFJlcXVlc3RQcm9wZXJ0eSgncmVkaXJlY3QnKSA9PT0gJ21hbnVhbCc7XG5cdFx0XHRpZiAoaXNNYW51YWxSZWRpcmVjdCkge1xuXHRcdFx0XHRyZWNvcmRGZXRjaEZlYXR1cmVVc2UobWFpblRocmVhZFRlbGVtZXRyeSwgJ21hbnVhbFJlZGlyZWN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnRlZ3JpdHkgPSBnZXRSZXF1ZXN0UHJvcGVydHkoJ2ludGVncml0eScpO1xuXHRcdFx0aWYgKGludGVncml0eSkge1xuXHRcdFx0XHRyZWNvcmRGZXRjaEZlYXR1cmVVc2UobWFpblRocmVhZFRlbGVtZXRyeSwgJ2ludGVncml0eScpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF1c2VFbGVjdHJvbkZldGNoIHx8IGlzRGF0YVVybCB8fCBpc0Jsb2JVcmwgfHwgaXNNYW51YWxSZWRpcmVjdCB8fCBpbnRlZ3JpdHkpIHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBwYXRjaGVkRmV0Y2goaW5wdXQsIGluaXQpO1xuXHRcdFx0XHRtb25pdG9yUmVzcG9uc2VQcm9wZXJ0aWVzKG1haW5UaHJlYWRUZWxlbWV0cnksIHJlc3BvbnNlLCB1cmxTdHJpbmcpO1xuXHRcdFx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdFx0XHR9XG5cdFx0XHQvLyBVbnN1cHBvcnRlZCBoZWFkZXJzOiBodHRwczovL3NvdXJjZS5jaHJvbWl1bS5vcmcvY2hyb21pdW0vY2hyb21pdW0vc3JjLysvbWFpbjpzZXJ2aWNlcy9uZXR3b3JrL3B1YmxpYy9jcHAvaGVhZGVyX3V0aWwuY2M7bD0zMjtkcmM9ZWU3Mjk5Zjg5NjFhMWIwNWEzNTU0ZWZjYzQ5NmI2ZGFhMGQ3ZjZlMVxuXHRcdFx0aWYgKGluaXQ/LmhlYWRlcnMpIHtcblx0XHRcdFx0Y29uc3QgaGVhZGVycyA9IG5ldyBIZWFkZXJzKGluaXQuaGVhZGVycyk7XG5cdFx0XHRcdGZvciAoY29uc3QgaGVhZGVyIG9mIHVuc2FmZUhlYWRlcnMpIHtcblx0XHRcdFx0XHRoZWFkZXJzLmRlbGV0ZShoZWFkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluaXQgPSB7IC4uLmluaXQsIGhlYWRlcnMgfTtcblx0XHRcdH1cblx0XHRcdC8vIFN1cHBvcnQgZm9yIFVSTDogaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uL2VsZWN0cm9uL2lzc3Vlcy80MzcxMlxuXHRcdFx0Y29uc3QgZWxlY3Ryb25JbnB1dCA9IGlucHV0IGluc3RhbmNlb2YgVVJMID8gaW5wdXQudG9TdHJpbmcoKSA6IGlucHV0O1xuXHRcdFx0Y29uc3QgZWxlY3Ryb24gPSByZXF1aXJlKCdlbGVjdHJvbicpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBlbGVjdHJvbi5uZXQuZmV0Y2goZWxlY3Ryb25JbnB1dCwgaW5pdCk7XG5cdFx0XHRtb25pdG9yUmVzcG9uc2VQcm9wZXJ0aWVzKG1haW5UaHJlYWRUZWxlbWV0cnksIHJlc3BvbnNlLCB1cmxTdHJpbmcpO1xuXHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gcGF0Y2hHbG9iYWxXZWJTb2NrZXQocGFyYW1zOiBQcm94eUFnZW50UGFyYW1zLCByZXNvbHZlUHJveHlVUkw6ICh1cmw6IHN0cmluZykgPT4gUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KSB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRpZiAoIShnbG9iYWxUaGlzIGFzIGFueSkuX192c2NvZGVPcmlnaW5hbFdlYlNvY2tldCkge1xuXHRcdGNvbnN0IG9yaWdpbmFsV2ViU29ja2V0ID0gZ2xvYmFsVGhpcy5XZWJTb2NrZXQ7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0KGdsb2JhbFRoaXMgYXMgYW55KS5fX3ZzY29kZU9yaWdpbmFsV2ViU29ja2V0ID0gb3JpZ2luYWxXZWJTb2NrZXQ7XG5cdFx0Z2xvYmFsVGhpcy5XZWJTb2NrZXQgPSBwcm94eUFnZW50LmNyZWF0ZVdlYlNvY2tldFBhdGNoKHBhcmFtcywgb3JpZ2luYWxXZWJTb2NrZXQsIHJlc29sdmVQcm94eVVSTCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW9uaXRvclJlc3BvbnNlUHJvcGVydGllcyhtYWluVGhyZWFkVGVsZW1ldHJ5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGUsIHJlc3BvbnNlOiBSZXNwb25zZSwgdXJsU3RyaW5nOiBzdHJpbmcpIHtcblx0Y29uc3Qgb3JpZ2luYWxVcmwgPSByZXNwb25zZS51cmw7XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShyZXNwb25zZSwgJ3VybCcsIHtcblx0XHRnZXQoKSB7XG5cdFx0XHRyZWNvcmRGZXRjaEZlYXR1cmVVc2UobWFpblRocmVhZFRlbGVtZXRyeSwgJ3VybCcpO1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsVXJsIHx8IHVybFN0cmluZztcblx0XHR9XG5cdH0pO1xuXHRjb25zdCBvcmlnaW5hbFR5cGUgPSByZXNwb25zZS50eXBlO1xuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkocmVzcG9uc2UsICd0eXBlJywge1xuXHRcdGdldCgpIHtcblx0XHRcdHJlY29yZEZldGNoRmVhdHVyZVVzZShtYWluVGhyZWFkVGVsZW1ldHJ5LCAndHlwZVByb3BlcnR5Jyk7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWxUeXBlICE9PSAnZGVmYXVsdCcgPyBvcmlnaW5hbFR5cGUgOiAnYmFzaWMnO1xuXHRcdH1cblx0fSk7XG59XG5cbnR5cGUgRmV0Y2hGZWF0dXJlVXNlQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnY2hybWFydGknO1xuXHRjb21tZW50OiAnRGF0YSBhYm91dCBmZXRjaCBBUEkgdXNlJztcblx0dXJsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdXJsIHByb3BlcnR5IHdhcyB1c2VkLicgfTtcblx0dHlwZVByb3BlcnR5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdHlwZSBwcm9wZXJ0eSB3YXMgdXNlZC4nIH07XG5cdGRhdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGEgZGF0YSBVUkwgd2FzIHVzZWQuJyB9O1xuXHRibG9iOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhIGJsb2IgVVJMIHdhcyB1c2VkLicgfTtcblx0aW50ZWdyaXR5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgaW50ZWdyaXR5IHByb3BlcnR5IHdhcyB1c2VkLicgfTtcblx0bWFudWFsUmVkaXJlY3Q6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGEgbWFudWFsIHJlZGlyZWN0IHdhcyB1c2VkLicgfTtcbn07XG5cbnR5cGUgRmV0Y2hGZWF0dXJlVXNlRXZlbnQgPSB7XG5cdHVybDogbnVtYmVyO1xuXHR0eXBlUHJvcGVydHk6IG51bWJlcjtcblx0ZGF0YTogbnVtYmVyO1xuXHRibG9iOiBudW1iZXI7XG5cdGludGVncml0eTogbnVtYmVyO1xuXHRtYW51YWxSZWRpcmVjdDogbnVtYmVyO1xufTtcblxuY29uc3QgZmV0Y2hGZWF0dXJlVXNlOiBGZXRjaEZlYXR1cmVVc2VFdmVudCA9IHtcblx0dXJsOiAwLFxuXHR0eXBlUHJvcGVydHk6IDAsXG5cdGRhdGE6IDAsXG5cdGJsb2I6IDAsXG5cdGludGVncml0eTogMCxcblx0bWFudWFsUmVkaXJlY3Q6IDAsXG59O1xuXG5sZXQgdGltZXI6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5jb25zdCBlbmFibGVGZWF0dXJlVXNlVGVsZW1ldHJ5ID0gZmFsc2U7XG5mdW5jdGlvbiByZWNvcmRGZXRjaEZlYXR1cmVVc2UobWFpblRocmVhZFRlbGVtZXRyeTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLCBmZWF0dXJlOiBrZXlvZiB0eXBlb2YgZmV0Y2hGZWF0dXJlVXNlKSB7XG5cdGlmIChlbmFibGVGZWF0dXJlVXNlVGVsZW1ldHJ5ICYmICFmZXRjaEZlYXR1cmVVc2VbZmVhdHVyZV0rKykge1xuXHRcdGlmICh0aW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHR9XG5cdFx0dGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdG1haW5UaHJlYWRUZWxlbWV0cnkuJHB1YmxpY0xvZzI8RmV0Y2hGZWF0dXJlVXNlRXZlbnQsIEZldGNoRmVhdHVyZVVzZUNsYXNzaWZpY2F0aW9uPignZmV0Y2hGZWF0dXJlVXNlJywgZmV0Y2hGZWF0dXJlVXNlKTtcblx0XHR9LCAxMDAwMCk7IC8vIGNvbGxlY3QgYWRkaXRpb25hbCBmZWF0dXJlcyBmb3IgMTAgc2Vjb25kc1xuXHRcdCh0aW1lciBhcyB1bmtub3duIGFzIE5vZGVKUy5UaW1lb3V0KS51bnJlZj8uKCk7XG5cdH1cbn1cblxudHlwZSBBZGRpdGlvbmFsQ2VydGlmaWNhdGVzQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnY2hybWFydGknO1xuXHRjb21tZW50OiAnVHJhY2tzIHRoZSBudW1iZXIgb2YgYWRkaXRpb25hbCBjZXJ0aWZpY2F0ZXMgbG9hZGVkIGZvciBUTFMgY29ubmVjdGlvbnMnO1xuXHRjb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBhZGRpdGlvbmFsIGNlcnRpZmljYXRlcyBsb2FkZWQnIH07XG5cdGlzUmVtb3RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGlzIGlzIGEgcmVtb3RlIGV4dGVuc2lvbiBob3N0JyB9O1xuXHRsb2FkTG9jYWxDZXJ0aWZpY2F0ZXM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIGxvY2FsIGNlcnRpZmljYXRlcyBhcmUgbG9hZGVkJyB9O1xuXHR1c2VOb2RlU3lzdGVtQ2VydHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIE5vZGUuanMgc3lzdGVtIGNlcnRpZmljYXRlcyBhcmUgdXNlZCcgfTtcbn07XG5cbnR5cGUgQWRkaXRpb25hbENlcnRpZmljYXRlc0V2ZW50ID0ge1xuXHRjb3VudDogbnVtYmVyO1xuXHRpc1JlbW90ZTogYm9vbGVhbjtcblx0bG9hZExvY2FsQ2VydGlmaWNhdGVzOiBib29sZWFuO1xuXHR1c2VOb2RlU3lzdGVtQ2VydHM6IGJvb2xlYW47XG59O1xuXG50eXBlIFByb3h5UmVzb2x2ZVN0YXRzQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnY2hybWFydGknO1xuXHRjb21tZW50OiAnUGVyZm9ybWFuY2Ugc3RhdGlzdGljcyBmb3IgcHJveHkgcmVzb2x1dGlvbic7XG5cdGNvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnTnVtYmVyIG9mIHByb3h5IHJlc29sdXRpb24gY2FsbHMnIH07XG5cdHRvdGFsRHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUb3RhbCB0aW1lIHNwZW50IGluIHByb3h5IHJlc29sdXRpb24gKG1zKScgfTtcblx0bWluRHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdNaW5pbXVtIHJlc29sdXRpb24gdGltZSAobXMpJyB9O1xuXHRtYXhEdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ01heGltdW0gcmVzb2x1dGlvbiB0aW1lIChtcyknIH07XG5cdGF2Z0R1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnQXZlcmFnZSByZXNvbHV0aW9uIHRpbWUgKG1zKScgfTtcblx0dHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1NvcnRlZCwgY29tbWEtc2VwYXJhdGVkIGxpc3Qgb2YgcmVzb2x2ZWQgcHJveHkgdHlwZXMgc2VlbiBkdXJpbmcgdGhlIGludGVydmFsIChlLmcuIERJUkVDVCwgUFJPWFksIEhUVFBTLCBTT0NLUywgRU1QVFksIFVOS05PV04pJyB9O1xufTtcblxudHlwZSBQcm94eVJlc29sdmVTdGF0c0V2ZW50ID0ge1xuXHRjb3VudDogbnVtYmVyO1xuXHR0b3RhbER1cmF0aW9uOiBudW1iZXI7XG5cdG1pbkR1cmF0aW9uOiBudW1iZXI7XG5cdG1heER1cmF0aW9uOiBudW1iZXI7XG5cdGF2Z0R1cmF0aW9uOiBudW1iZXI7XG5cdHR5cGU6IHN0cmluZztcbn07XG5cbmNvbnN0IHByb3h5UmVzb2x2ZVN0YXRzID0ge1xuXHRjb3VudDogMCxcblx0dG90YWxEdXJhdGlvbjogMCxcblx0bWluRHVyYXRpb246IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLFxuXHRtYXhEdXJhdGlvbjogMCxcblx0dHlwZXM6IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRsYXN0U2VudFRpbWU6IDAsXG59O1xuXG5jb25zdCB0ZWxlbWV0cnlJbnRlcnZhbCA9IDYwICogNjAgKiAxMDAwOyAvLyAxIGhvdXJcblxuZnVuY3Rpb24gcHJveHlSZXNvbHZlVHlwZShwcm94eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0Y29uc3QgdHlwZSA9IHByb3h5ID8gU3RyaW5nKHByb3h5KS50cmltKCkuc3BsaXQoL1xccysvLCAxKVswXSA6ICdFTVBUWSc7XG5cdGlmIChbJ0RJUkVDVCcsICdQUk9YWScsICdIVFRQUycsICdTT0NLUycsICdFTVBUWSddLmluZGV4T2YodHlwZSkgPT09IC0xKSB7XG5cdFx0cmV0dXJuICdVTktOT1dOJztcblx0fVxuXHRyZXR1cm4gdHlwZTtcbn1cblxuZnVuY3Rpb24gc2VuZFByb3h5UmVzb2x2ZVN0YXRzKG1haW5UaHJlYWRUZWxlbWV0cnk6IE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSkge1xuXHRpZiAocHJveHlSZXNvbHZlU3RhdHMuY291bnQgPiAwKSB7XG5cdFx0Y29uc3QgYXZnRHVyYXRpb24gPSBwcm94eVJlc29sdmVTdGF0cy50b3RhbER1cmF0aW9uIC8gcHJveHlSZXNvbHZlU3RhdHMuY291bnQ7XG5cdFx0bWFpblRocmVhZFRlbGVtZXRyeS4kcHVibGljTG9nMjxQcm94eVJlc29sdmVTdGF0c0V2ZW50LCBQcm94eVJlc29sdmVTdGF0c0NsYXNzaWZpY2F0aW9uPigncHJveHlSZXNvbHZlU3RhdHMnLCB7XG5cdFx0XHRjb3VudDogcHJveHlSZXNvbHZlU3RhdHMuY291bnQsXG5cdFx0XHR0b3RhbER1cmF0aW9uOiBwcm94eVJlc29sdmVTdGF0cy50b3RhbER1cmF0aW9uLFxuXHRcdFx0bWluRHVyYXRpb246IHByb3h5UmVzb2x2ZVN0YXRzLm1pbkR1cmF0aW9uLFxuXHRcdFx0bWF4RHVyYXRpb246IHByb3h5UmVzb2x2ZVN0YXRzLm1heER1cmF0aW9uLFxuXHRcdFx0YXZnRHVyYXRpb24sXG5cdFx0XHR0eXBlOiBbLi4ucHJveHlSZXNvbHZlU3RhdHMudHlwZXNdLnNvcnQoKS5qb2luKCcsJyksXG5cdFx0fSk7XG5cdFx0Ly8gUmVzZXQgc3RhdHMgYWZ0ZXIgc2VuZGluZ1xuXHRcdHByb3h5UmVzb2x2ZVN0YXRzLmNvdW50ID0gMDtcblx0XHRwcm94eVJlc29sdmVTdGF0cy50b3RhbER1cmF0aW9uID0gMDtcblx0XHRwcm94eVJlc29sdmVTdGF0cy5taW5EdXJhdGlvbiA9IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRcdHByb3h5UmVzb2x2ZVN0YXRzLm1heER1cmF0aW9uID0gMDtcblx0XHRwcm94eVJlc29sdmVTdGF0cy50eXBlcy5jbGVhcigpO1xuXHR9XG5cdHByb3h5UmVzb2x2ZVN0YXRzLmxhc3RTZW50VGltZSA9IERhdGUubm93KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRpbWVkUmVzb2x2ZVByb3h5KGV4dEhvc3RXb3Jrc3BhY2U6IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIsIG1haW5UaHJlYWRUZWxlbWV0cnk6IE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSkge1xuXHRyZXR1cm4gYXN5bmMgKHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRjb25zdCBzdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHRsZXQgcHJveHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0cHJveHkgPSBhd2FpdCBleHRIb3N0V29ya3NwYWNlLnJlc29sdmVQcm94eSh1cmwpO1xuXHRcdFx0cmV0dXJuIHByb3h5O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb25zdCBkdXJhdGlvbiA9IHBlcmZvcm1hbmNlLm5vdygpIC0gc3RhcnRUaW1lO1xuXHRcdFx0cHJveHlSZXNvbHZlU3RhdHMuY291bnQrKztcblx0XHRcdHByb3h5UmVzb2x2ZVN0YXRzLnRvdGFsRHVyYXRpb24gKz0gZHVyYXRpb247XG5cdFx0XHRwcm94eVJlc29sdmVTdGF0cy5taW5EdXJhdGlvbiA9IE1hdGgubWluKHByb3h5UmVzb2x2ZVN0YXRzLm1pbkR1cmF0aW9uLCBkdXJhdGlvbik7XG5cdFx0XHRwcm94eVJlc29sdmVTdGF0cy5tYXhEdXJhdGlvbiA9IE1hdGgubWF4KHByb3h5UmVzb2x2ZVN0YXRzLm1heER1cmF0aW9uLCBkdXJhdGlvbik7XG5cdFx0XHRwcm94eVJlc29sdmVTdGF0cy50eXBlcy5hZGQocHJveHlSZXNvbHZlVHlwZShwcm94eSkpO1xuXG5cdFx0XHQvLyBTZW5kIHRlbGVtZXRyeSBpZiBhdCBsZWFzdCBhbiBob3VyIGhhcyBwYXNzZWQgc2luY2UgbGFzdCBzZW5kXG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0aWYgKG5vdyAtIHByb3h5UmVzb2x2ZVN0YXRzLmxhc3RTZW50VGltZSA+PSB0ZWxlbWV0cnlJbnRlcnZhbCkge1xuXHRcdFx0XHRzZW5kUHJveHlSZXNvbHZlU3RhdHMobWFpblRocmVhZFRlbGVtZXRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQYXRjaGVkTW9kdWxlcyhwYXJhbXM6IFByb3h5QWdlbnRQYXJhbXMsIHJlc29sdmVQcm94eTogUmVzb2x2ZVByb3h5V2l0aFJlcXVlc3QpIHtcblxuXHRmdW5jdGlvbiBtZXJnZU1vZHVsZXMobW9kdWxlOiBhbnksIHBhdGNoOiBhbnkpIHtcblx0XHRjb25zdCB0YXJnZXQgPSBtb2R1bGUuZGVmYXVsdCB8fCBtb2R1bGU7XG5cdFx0dGFyZ2V0Ll9fdnNjb2RlT3JpZ2luYWwgPSBPYmplY3QuYXNzaWduKHt9LCB0YXJnZXQpO1xuXHRcdHJldHVybiBPYmplY3QuYXNzaWduKHRhcmdldCwgcGF0Y2gpO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRodHRwOiBtZXJnZU1vZHVsZXMoaHR0cCwgY3JlYXRlSHR0cFBhdGNoKHBhcmFtcywgaHR0cCwgcmVzb2x2ZVByb3h5KSksXG5cdFx0aHR0cHM6IG1lcmdlTW9kdWxlcyhodHRwcywgY3JlYXRlSHR0cFBhdGNoKHBhcmFtcywgaHR0cHMsIHJlc29sdmVQcm94eSkpLFxuXHRcdG5ldDogbWVyZ2VNb2R1bGVzKG5ldCwgY3JlYXRlTmV0UGF0Y2gocGFyYW1zLCBuZXQpKSxcblx0XHR0bHM6IG1lcmdlTW9kdWxlcyh0bHMsIGNyZWF0ZVRsc1BhdGNoKHBhcmFtcywgdGxzKSlcblx0fTtcbn1cblxuZnVuY3Rpb24gY2VydFNldHRpbmdWMShjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZTogYm9vbGVhbikge1xuXHRyZXR1cm4gIWdldEV4dEhvc3RDb25maWdWYWx1ZTxib29sZWFuPihjb25maWdQcm92aWRlciwgaXNSZW1vdGUsICdodHRwLmV4cGVyaW1lbnRhbC5zeXN0ZW1DZXJ0aWZpY2F0ZXNWMicsIHN5c3RlbUNlcnRpZmljYXRlc1YyRGVmYXVsdCkgJiYgISFnZXRFeHRIb3N0Q29uZmlnVmFsdWU8Ym9vbGVhbj4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC5zeXN0ZW1DZXJ0aWZpY2F0ZXMnKTtcbn1cblxuZnVuY3Rpb24gY2VydFNldHRpbmdWMihjb25maWdQcm92aWRlcjogRXh0SG9zdENvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZTogYm9vbGVhbikge1xuXHRyZXR1cm4gISFnZXRFeHRIb3N0Q29uZmlnVmFsdWU8Ym9vbGVhbj4oY29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlLCAnaHR0cC5leHBlcmltZW50YWwuc3lzdGVtQ2VydGlmaWNhdGVzVjInLCBzeXN0ZW1DZXJ0aWZpY2F0ZXNWMkRlZmF1bHQpICYmICEhZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPGJvb2xlYW4+KGNvbmZpZ1Byb3ZpZGVyLCBpc1JlbW90ZSwgJ2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzJyk7XG59XG5cbmNvbnN0IG1vZHVsZXNDYWNoZSA9IG5ldyBNYXA8SUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkLCB7IGh0dHA/OiB0eXBlb2YgaHR0cDsgaHR0cHM/OiB0eXBlb2YgaHR0cHM7IHVuZGljaT86IHR5cGVvZiB1bmRpY2lUeXBlIH0+KCk7XG5mdW5jdGlvbiBjb25maWd1cmVNb2R1bGVMb2FkaW5nKGV4dGVuc2lvblNlcnZpY2U6IEV4dEhvc3RFeHRlbnNpb25TZXJ2aWNlLCBsb29rdXA6IFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVBhdGNoZWRNb2R1bGVzPik6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25QYXRoSW5kZXgoKVxuXHRcdC50aGVuKGV4dGVuc2lvblBhdGhzID0+IHtcblx0XHRcdGNvbnN0IG5vZGVfbW9kdWxlID0gcmVxdWlyZSgnbW9kdWxlJyk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IG5vZGVfbW9kdWxlLl9sb2FkO1xuXHRcdFx0bm9kZV9tb2R1bGUuX2xvYWQgPSBmdW5jdGlvbiBsb2FkKHJlcXVlc3Q6IHN0cmluZywgcGFyZW50OiB7IGZpbGVuYW1lOiBzdHJpbmcgfSwgaXNNYWluOiBib29sZWFuKSB7XG5cdFx0XHRcdGlmIChyZXF1ZXN0ID09PSAnbmV0Jykge1xuXHRcdFx0XHRcdHJldHVybiBsb29rdXAubmV0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlcXVlc3QgPT09ICd0bHMnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvb2t1cC50bHM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVxdWVzdCAhPT0gJ2h0dHAnICYmIHJlcXVlc3QgIT09ICdodHRwcycgJiYgcmVxdWVzdCAhPT0gJ3VuZGljaScpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3JpZ2luYWwuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4dCA9IGV4dGVuc2lvblBhdGhzLmZpbmRTdWJzdHIoVVJJLmZpbGUocGFyZW50LmZpbGVuYW1lKSk7XG5cdFx0XHRcdGxldCBjYWNoZSA9IG1vZHVsZXNDYWNoZS5nZXQoZXh0KTtcblx0XHRcdFx0aWYgKCFjYWNoZSkge1xuXHRcdFx0XHRcdG1vZHVsZXNDYWNoZS5zZXQoZXh0LCBjYWNoZSA9IHt9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWNhY2hlW3JlcXVlc3RdKSB7XG5cdFx0XHRcdFx0aWYgKHJlcXVlc3QgPT09ICd1bmRpY2knKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1bmRpY2kgPSBvcmlnaW5hbC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdFx0XHRcdFx0cHJveHlBZ2VudC5wYXRjaFVuZGljaSh1bmRpY2kpO1xuXHRcdFx0XHRcdFx0Y2FjaGVbcmVxdWVzdF0gPSB1bmRpY2k7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZCA9IGxvb2t1cFtyZXF1ZXN0XTtcblx0XHRcdFx0XHRcdGNhY2hlW3JlcXVlc3RdID0geyAuLi5tb2QgfTsgLy8gQ29weSB0byB3b3JrIGFyb3VuZCAjOTMxNjcuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjYWNoZVtyZXF1ZXN0XTtcblx0XHRcdH07XG5cdFx0fSk7XG59XG5cbnR5cGUgUHJveHlBdXRoZW50aWNhdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2Nocm1hcnRpJztcblx0Y29tbWVudDogJ0RhdGEgYWJvdXQgcHJveHkgYXV0aGVudGljYXRpb24gcmVxdWVzdHMnO1xuXHRhdXRoZW50aWNhdGlvblR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVHlwZSBvZiB0aGUgYXV0aGVudGljYXRpb24gcmVxdWVzdGVkJyB9O1xuXHRleHRlbnNpb25Ib3N0VHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1R5cGUgb2YgdGhlIGV4dGVuc2lvbiBob3N0JyB9O1xufTtcblxudHlwZSBQcm94eUF1dGhlbnRpY2F0aW9uRXZlbnQgPSB7XG5cdGF1dGhlbnRpY2F0aW9uVHlwZTogc3RyaW5nO1xuXHRleHRlbnNpb25Ib3N0VHlwZTogc3RyaW5nO1xufTtcblxubGV0IHRlbGVtZXRyeVNlbnQgPSBmYWxzZTtcbmNvbnN0IGVuYWJsZVByb3h5QXV0aGVudGljYXRpb25UZWxlbWV0cnkgPSBmYWxzZTtcbmZ1bmN0aW9uIHNlbmRUZWxlbWV0cnkobWFpblRocmVhZFRlbGVtZXRyeTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlLCBhdXRoZW50aWNhdGU6IHN0cmluZ1tdLCBpc1JlbW90ZTogYm9vbGVhbikge1xuXHRpZiAoIWVuYWJsZVByb3h5QXV0aGVudGljYXRpb25UZWxlbWV0cnkgfHwgdGVsZW1ldHJ5U2VudCB8fCAhYXV0aGVudGljYXRlLmxlbmd0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXHR0ZWxlbWV0cnlTZW50ID0gdHJ1ZTtcblxuXHRtYWluVGhyZWFkVGVsZW1ldHJ5LiRwdWJsaWNMb2cyPFByb3h5QXV0aGVudGljYXRpb25FdmVudCwgUHJveHlBdXRoZW50aWNhdGlvbkNsYXNzaWZpY2F0aW9uPigncHJveHlBdXRoZW50aWNhdGlvblJlcXVlc3QnLCB7XG5cdFx0YXV0aGVudGljYXRpb25UeXBlOiBhdXRoZW50aWNhdGUubWFwKGEgPT4gYS5zcGxpdCgnICcpWzBdKS5qb2luKCcsJyksXG5cdFx0ZXh0ZW5zaW9uSG9zdFR5cGU6IGlzUmVtb3RlID8gJ3JlbW90ZScgOiAnbG9jYWwnLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPFQ+KGNvbmZpZ1Byb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlOiBib29sZWFuLCBrZXk6IHN0cmluZywgZmFsbGJhY2s6IFQpOiBUO1xuZnVuY3Rpb24gZ2V0RXh0SG9zdENvbmZpZ1ZhbHVlPFQ+KGNvbmZpZ1Byb3ZpZGVyOiBFeHRIb3N0Q29uZmlnUHJvdmlkZXIsIGlzUmVtb3RlOiBib29sZWFuLCBrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQ7XG5mdW5jdGlvbiBnZXRFeHRIb3N0Q29uZmlnVmFsdWU8VD4oY29uZmlnUHJvdmlkZXI6IEV4dEhvc3RDb25maWdQcm92aWRlciwgaXNSZW1vdGU6IGJvb2xlYW4sIGtleTogc3RyaW5nLCBmYWxsYmFjaz86IFQpOiBUIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzUmVtb3RlKSB7XG5cdFx0cmV0dXJuIGNvbmZpZ1Byb3ZpZGVyLmdldENvbmZpZ3VyYXRpb24oKS5nZXQ8VD4oa2V5KSA/PyBmYWxsYmFjaztcblx0fVxuXHRjb25zdCB2YWx1ZXM6IENvbmZpZ3VyYXRpb25JbnNwZWN0PFQ+IHwgdW5kZWZpbmVkID0gY29uZmlnUHJvdmlkZXIuZ2V0Q29uZmlndXJhdGlvbigpLmluc3BlY3Q8VD4oa2V5KTtcblx0cmV0dXJuIHZhbHVlcz8uZ2xvYmFsTG9jYWxWYWx1ZSA/PyB2YWx1ZXM/LmRlZmF1bHRWYWx1ZSA/PyBmYWxsYmFjaztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQVVBLFNBQVMsV0FB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
