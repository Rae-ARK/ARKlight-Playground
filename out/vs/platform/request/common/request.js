import { streamToBuffer } from "../../../base/common/buffer.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { Registry } from "../../registry/common/platform.js";
const IRequestService = createDecorator("requestService");
const NO_FETCH_TELEMETRY = "NO_FETCH_TELEMETRY";
class LoggableHeaders {
  constructor(original) {
    this.original = original;
  }
  toJSON() {
    if (!this.headers) {
      const headers = /* @__PURE__ */ Object.create(null);
      for (const key in this.original) {
        if (key.toLowerCase() === "authorization" || key.toLowerCase() === "proxy-authorization") {
          headers[key] = "*****";
        } else {
          headers[key] = this.original[key];
        }
      }
      this.headers = headers;
    }
    return this.headers;
  }
}
class AbstractRequestService extends Disposable {
  constructor(logService) {
    super();
    this.logService = logService;
    this.counter = 0;
    this._onDidCompleteRequest = this._register(new Emitter());
    this.onDidCompleteRequest = this._onDidCompleteRequest.event;
  }
  async logAndRequest(options, request) {
    const prefix = `#${++this.counter}: ${options.url}`;
    this.logService.trace(`${prefix} - begin`, options.type, new LoggableHeaders(options.headers ?? {}));
    const startTime = Date.now();
    try {
      const result = await request();
      this.logService.trace(`${prefix} - end`, options.type, result.res.statusCode, result.res.headers);
      this._onDidCompleteRequest.fire({
        callSite: options.callSite,
        latency: Date.now() - startTime,
        statusCode: result.res.statusCode
      });
      return result;
    } catch (error) {
      this.logService.error(`${prefix} - error`, options.type, getErrorMessage(error));
      throw error;
    }
  }
}
function isSuccess(context) {
  return context.res.statusCode && context.res.statusCode >= 200 && context.res.statusCode < 300 || context.res.statusCode === 1223;
}
function isClientError(context) {
  return !!context.res.statusCode && context.res.statusCode >= 400 && context.res.statusCode < 500;
}
function isServerError(context) {
  return !!context.res.statusCode && context.res.statusCode >= 500 && context.res.statusCode < 600;
}
function readHeader(headers, name) {
  if (!headers) {
    return void 0;
  }
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
function retryAfterFromHeaders(headers) {
  const value = readHeader(headers, "retry-after");
  if (!value) {
    return void 0;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : void 0;
}
function hasNoContent(context) {
  return context.res.statusCode === 204;
}
async function asText(context) {
  if (hasNoContent(context)) {
    return null;
  }
  const buffer = await streamToBuffer(context.stream);
  return buffer.toString();
}
async function asTextOrError(context) {
  if (!isSuccess(context)) {
    throw new Error("Server returned " + context.res.statusCode);
  }
  return asText(context);
}
async function asJson(context) {
  if (!isSuccess(context)) {
    throw new Error("Server returned " + context.res.statusCode);
  }
  if (hasNoContent(context)) {
    return null;
  }
  const buffer = await streamToBuffer(context.stream);
  const str = buffer.toString();
  try {
    return JSON.parse(str);
  } catch (err) {
    err.message += ":\n" + str;
    throw err;
  }
}
function updateProxyConfigurationsScope(useHostProxy, useHostProxyDefault) {
  registerProxyConfigurations(useHostProxy, useHostProxyDefault);
}
const USER_LOCAL_AND_REMOTE_SETTINGS = [
  "http.proxy",
  "http.proxyStrictSSL",
  "http.proxyKerberosServicePrincipal",
  "http.noProxy",
  "http.proxyAuthorization",
  "http.proxySupport",
  "http.systemCertificates",
  "http.systemCertificatesNode",
  "http.experimental.systemCertificatesV2",
  "http.fetchAdditionalSupport",
  "http.experimental.networkInterfaceCheckInterval"
];
const systemCertificatesNodeDefault = false;
let proxyConfiguration = [];
let previousUseHostProxy = void 0;
let previousUseHostProxyDefault = void 0;
function registerProxyConfigurations(useHostProxy = true, useHostProxyDefault = true) {
  if (previousUseHostProxy === useHostProxy && previousUseHostProxyDefault === useHostProxyDefault) {
    return;
  }
  previousUseHostProxy = useHostProxy;
  previousUseHostProxyDefault = useHostProxyDefault;
  const configurationRegistry = Registry.as(Extensions.Configuration);
  const oldProxyConfiguration = proxyConfiguration;
  proxyConfiguration = [
    {
      id: "http",
      order: 15,
      title: localize("httpConfigurationTitle", "HTTP"),
      type: "object",
      scope: ConfigurationScope.MACHINE,
      properties: {
        "http.useLocalProxyConfiguration": {
          type: "boolean",
          default: useHostProxyDefault,
          markdownDescription: localize("useLocalProxy", "Controls whether in the remote extension host the local proxy configuration should be used. This setting only applies as a remote setting during [remote development](https://aka.ms/vscode-remote)."),
          restricted: true
        }
      }
    },
    {
      id: "http",
      order: 15,
      title: localize("httpConfigurationTitle", "HTTP"),
      type: "object",
      scope: ConfigurationScope.APPLICATION,
      properties: {
        "http.electronFetch": {
          type: "boolean",
          default: false,
          description: localize("electronFetch", "Controls whether use of Electron's fetch implementation instead of Node.js' should be enabled. All local extensions will get Electron's fetch implementation for the global fetch API."),
          restricted: true
        }
      }
    },
    {
      id: "http",
      order: 15,
      title: localize("httpConfigurationTitle", "HTTP"),
      type: "object",
      scope: useHostProxy ? ConfigurationScope.APPLICATION : ConfigurationScope.MACHINE,
      properties: {
        "http.proxy": {
          type: "string",
          pattern: "^(https?|socks|socks4a?|socks5h?)://([^:]*(:[^@]*)?@)?([^:]+|\\[[:0-9a-fA-F]+\\])(:\\d+)?/?$|^$",
          markdownDescription: localize("proxy", "The proxy setting to use. If not set, will be inherited from the `http_proxy` and `https_proxy` environment variables. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxyStrictSSL": {
          type: "boolean",
          default: true,
          markdownDescription: localize("strictSSL", "Controls whether the proxy server certificate should be verified against the list of supplied CAs. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxyKerberosServicePrincipal": {
          type: "string",
          markdownDescription: localize("proxyKerberosServicePrincipal", "Overrides the principal service name for Kerberos authentication with the HTTP proxy. A default based on the proxy hostname is used when this is not set. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.noProxy": {
          type: "array",
          items: { type: "string" },
          markdownDescription: localize("noProxy", "Specifies domain names for which proxy settings should be ignored for HTTP/HTTPS requests. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxyAuthorization": {
          type: ["null", "string"],
          default: null,
          markdownDescription: localize("proxyAuthorization", "The value to send as the `Proxy-Authorization` header for every network request. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.proxySupport": {
          type: "string",
          enum: ["off", "on", "fallback", "override"],
          enumDescriptions: [
            localize("proxySupportOff", "Disable proxy support for extensions."),
            localize("proxySupportOn", "Enable proxy support for extensions."),
            localize("proxySupportFallback", "Enable proxy support for extensions, fall back to request options, when no proxy found."),
            localize("proxySupportOverride", "Enable proxy support for extensions, override request options.")
          ],
          default: "override",
          markdownDescription: localize("proxySupport", "Use the proxy support for extensions. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.systemCertificates": {
          type: "boolean",
          default: true,
          markdownDescription: localize("systemCertificates", "Controls whether CA certificates should be loaded from the OS. On Windows and macOS, a reload of the window is required after turning this off. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.systemCertificatesNode": {
          type: "boolean",
          tags: ["experimental"],
          default: systemCertificatesNodeDefault,
          markdownDescription: localize("systemCertificatesNode", "Controls whether system certificates should be loaded using Node.js built-in support. Reload the window after changing this setting. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true,
          experiment: {
            mode: "auto"
          }
        },
        "http.experimental.systemCertificatesV2": {
          type: "boolean",
          tags: ["experimental"],
          default: false,
          markdownDescription: localize("systemCertificatesV2", "Controls whether experimental loading of CA certificates from the OS should be enabled. This uses a more general approach than the default implementation. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true
        },
        "http.fetchAdditionalSupport": {
          type: "boolean",
          default: true,
          markdownDescription: localize("fetchAdditionalSupport", "Controls whether Node.js' fetch implementation should be extended with additional support. Currently proxy support ({1}) and system certificates ({2}) are added when the corresponding settings are enabled. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`", "`#http.proxySupport#`", "`#http.systemCertificates#`"),
          restricted: true
        },
        "http.webSocketAdditionalSupport": {
          type: "boolean",
          default: true,
          markdownDescription: localize("webSocketAdditionalSupport", "Controls whether the built-in WebSocket implementation should be extended with additional support. Currently proxy support ({1}) and system certificates ({2}) are added when the corresponding settings are enabled. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`", "`#http.proxySupport#`", "`#http.systemCertificates#`"),
          restricted: true
        },
        "http.experimental.networkInterfaceCheckInterval": {
          type: "number",
          default: 300,
          minimum: -1,
          tags: ["experimental"],
          markdownDescription: localize("networkInterfaceCheckInterval", "Controls the interval in seconds for checking network interface changes to invalidate the proxy cache. Set to -1 to disable. When during [remote development](https://aka.ms/vscode-remote) the {0} setting is disabled this setting can be configured in the local and the remote settings separately.", "`#http.useLocalProxyConfiguration#`"),
          restricted: true,
          experiment: {
            mode: "auto"
          }
        }
      }
    }
  ];
  configurationRegistry.updateConfigurations({ add: proxyConfiguration, remove: oldProxyConfiguration });
}
registerProxyConfigurations();
export {
  AbstractRequestService,
  IRequestService,
  NO_FETCH_TELEMETRY,
  USER_LOCAL_AND_REMOTE_SETTINGS,
  asJson,
  asText,
  asTextOrError,
  hasNoContent,
  isClientError,
  isServerError,
  isSuccess,
  readHeader,
  retryAfterFromHeaders,
  systemCertificatesNodeDefault,
  updateProxyConfigurationsScope
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzdHJlYW1Ub0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElIZWFkZXJzLCBJUmVxdWVzdENvbnRleHQsIElSZXF1ZXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTm9kZSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5leHBvcnQgY29uc3QgSVJlcXVlc3RTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElSZXF1ZXN0U2VydmljZT4oJ3JlcXVlc3RTZXJ2aWNlJyk7XG5cbi8qKlxuICogVXNlIGFzIHRoZSB7QGxpbmsgSVJlcXVlc3RPcHRpb25zLmNhbGxTaXRlfSB2YWx1ZSB0byBwcmV2ZW50XG4gKiByZXF1ZXN0IHRlbGVtZXRyeSBmcm9tIGJlaW5nIGVtaXR0ZWQuIFRoaXMgaXMgbmVlZGVkIGZvclxuICogY2FsbGVycyBzdWNoIGFzIHRoZSB0ZWxlbWV0cnkgc2VuZGVyIHRvIGF2b2lkIGN5Y2xpY2FsIGNhbGxzLlxuICovXG5leHBvcnQgY29uc3QgTk9fRkVUQ0hfVEVMRU1FVFJZID0gJ05PX0ZFVENIX1RFTEVNRVRSWSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlcXVlc3RDb21wbGV0ZUV2ZW50IHtcblx0cmVhZG9ubHkgY2FsbFNpdGU6IHN0cmluZztcblx0cmVhZG9ubHkgbGF0ZW5jeTogbnVtYmVyO1xuXHRyZWFkb25seSBzdGF0dXNDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXV0aEluZm8ge1xuXHRpc1Byb3h5OiBib29sZWFuO1xuXHRzY2hlbWU6IHN0cmluZztcblx0aG9zdDogc3RyaW5nO1xuXHRwb3J0OiBudW1iZXI7XG5cdHJlYWxtOiBzdHJpbmc7XG5cdGF0dGVtcHQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDcmVkZW50aWFscyB7XG5cdHVzZXJuYW1lOiBzdHJpbmc7XG5cdHBhc3N3b3JkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlcXVlc3RTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIGEgcmVxdWVzdCBjb21wbGV0ZXMgKHN1Y2Nlc3NmdWxseSBvciB3aXRoIGFuIGVycm9yIHJlc3BvbnNlKS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ29tcGxldGVSZXF1ZXN0OiBFdmVudDxJUmVxdWVzdENvbXBsZXRlRXZlbnQ+O1xuXG5cdHJlcXVlc3Qob3B0aW9uczogSVJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD47XG5cblx0cmVzb2x2ZVByb3h5KHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRsb29rdXBBdXRob3JpemF0aW9uKGF1dGhJbmZvOiBBdXRoSW5mbyk6IFByb21pc2U8Q3JlZGVudGlhbHMgfCB1bmRlZmluZWQ+O1xuXHRsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24odXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdGxvYWRDZXJ0aWZpY2F0ZXMoKTogUHJvbWlzZTxzdHJpbmdbXT47XG59XG5cbmNsYXNzIExvZ2dhYmxlSGVhZGVycyB7XG5cblx0cHJpdmF0ZSBoZWFkZXJzOiBJSGVhZGVycyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9yaWdpbmFsOiBJSGVhZGVycykgeyB9XG5cblx0dG9KU09OKCk6IGFueSB7XG5cdFx0aWYgKCF0aGlzLmhlYWRlcnMpIHtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gdGhpcy5vcmlnaW5hbCkge1xuXHRcdFx0XHRpZiAoa2V5LnRvTG93ZXJDYXNlKCkgPT09ICdhdXRob3JpemF0aW9uJyB8fCBrZXkudG9Mb3dlckNhc2UoKSA9PT0gJ3Byb3h5LWF1dGhvcml6YXRpb24nKSB7XG5cdFx0XHRcdFx0aGVhZGVyc1trZXldID0gJyoqKioqJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRoZWFkZXJzW2tleV0gPSB0aGlzLm9yaWdpbmFsW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuaGVhZGVycyA9IGhlYWRlcnM7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmhlYWRlcnM7XG5cdH1cblxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RSZXF1ZXN0U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUmVxdWVzdFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY291bnRlciA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb21wbGV0ZVJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVxdWVzdENvbXBsZXRlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENvbXBsZXRlUmVxdWVzdCA9IHRoaXMuX29uRGlkQ29tcGxldGVSZXF1ZXN0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgbG9nQW5kUmVxdWVzdChvcHRpb25zOiBJUmVxdWVzdE9wdGlvbnMsIHJlcXVlc3Q6ICgpID0+IFByb21pc2U8SVJlcXVlc3RDb250ZXh0Pik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0Y29uc3QgcHJlZml4ID0gYCMkeysrdGhpcy5jb3VudGVyfTogJHtvcHRpb25zLnVybH1gO1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgJHtwcmVmaXh9IC0gYmVnaW5gLCBvcHRpb25zLnR5cGUsIG5ldyBMb2dnYWJsZUhlYWRlcnMob3B0aW9ucy5oZWFkZXJzID8/IHt9KSk7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVxdWVzdCgpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGAke3ByZWZpeH0gLSBlbmRgLCBvcHRpb25zLnR5cGUsIHJlc3VsdC5yZXMuc3RhdHVzQ29kZSwgcmVzdWx0LnJlcy5oZWFkZXJzKTtcblx0XHRcdHRoaXMuX29uRGlkQ29tcGxldGVSZXF1ZXN0LmZpcmUoe1xuXHRcdFx0XHRjYWxsU2l0ZTogb3B0aW9ucy5jYWxsU2l0ZSxcblx0XHRcdFx0bGF0ZW5jeTogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcblx0XHRcdFx0c3RhdHVzQ29kZTogcmVzdWx0LnJlcy5zdGF0dXNDb2RlLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYCR7cHJlZml4fSAtIGVycm9yYCwgb3B0aW9ucy50eXBlLCBnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFic3RyYWN0IHJlcXVlc3Qob3B0aW9uczogSVJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD47XG5cdGFic3RyYWN0IHJlc29sdmVQcm94eSh1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0YWJzdHJhY3QgbG9va3VwQXV0aG9yaXphdGlvbihhdXRoSW5mbzogQXV0aEluZm8pOiBQcm9taXNlPENyZWRlbnRpYWxzIHwgdW5kZWZpbmVkPjtcblx0YWJzdHJhY3QgbG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uKHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRhYnN0cmFjdCBsb2FkQ2VydGlmaWNhdGVzKCk6IFByb21pc2U8c3RyaW5nW10+O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTdWNjZXNzKGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGNvbnRleHQucmVzLnN0YXR1c0NvZGUgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA+PSAyMDAgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA8IDMwMCkgfHwgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMTIyMztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2xpZW50RXJyb3IoY29udGV4dDogSVJlcXVlc3RDb250ZXh0KTogYm9vbGVhbiB7XG5cdHJldHVybiAhIWNvbnRleHQucmVzLnN0YXR1c0NvZGUgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA+PSA0MDAgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA8IDUwMDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2VydmVyRXJyb3IoY29udGV4dDogSVJlcXVlc3RDb250ZXh0KTogYm9vbGVhbiB7XG5cdHJldHVybiAhIWNvbnRleHQucmVzLnN0YXR1c0NvZGUgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA+PSA1MDAgJiYgY29udGV4dC5yZXMuc3RhdHVzQ29kZSA8IDYwMDtcbn1cblxuLyoqXG4gKiBSZWFkcyBhIGhlYWRlciB2YWx1ZSBmcm9tIGFuIHtAbGluayBJSGVhZGVyc30gbWFwLCB0b2xlcmF0aW5nIGFycmF5LXNoYXBlZFxuICogdmFsdWVzIGFuZCBjYXNlLWluc2Vuc2l0aXZlIGxvb2t1cHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkSGVhZGVyKGhlYWRlcnM6IElIZWFkZXJzIHwgdW5kZWZpbmVkLCBuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIWhlYWRlcnMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHZhbHVlID0gaGVhZGVyc1tuYW1lXSA/PyBoZWFkZXJzW25hbWUudG9Mb3dlckNhc2UoKV07XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZVswXTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbi8qKlxuICogUGFyc2VzIHRoZSBgUmV0cnktQWZ0ZXJgIGhlYWRlciBhcyBhIG51bWJlciBvZiBzZWNvbmRzLiBSZXR1cm5zIGB1bmRlZmluZWRgXG4gKiBpZiBhYnNlbnQgb3Igbm90IGEgZmluaXRlIHBvc2l0aXZlIG51bWJlci4gVGhlIEhUVFAtZGF0ZSBmb3JtIGlzIG5vdCBwYXJzZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXRyeUFmdGVyRnJvbUhlYWRlcnMoaGVhZGVyczogSUhlYWRlcnMgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2YWx1ZSA9IHJlYWRIZWFkZXIoaGVhZGVycywgJ3JldHJ5LWFmdGVyJyk7XG5cdGlmICghdmFsdWUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlSW50KHZhbHVlLCAxMCk7XG5cdHJldHVybiBOdW1iZXIuaXNGaW5pdGUocGFyc2VkKSAmJiBwYXJzZWQgPiAwID8gcGFyc2VkIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzTm9Db250ZW50KGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY29udGV4dC5yZXMuc3RhdHVzQ29kZSA9PT0gMjA0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXNUZXh0KGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRpZiAoaGFzTm9Db250ZW50KGNvbnRleHQpKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0Y29uc3QgYnVmZmVyID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoY29udGV4dC5zdHJlYW0pO1xuXHRyZXR1cm4gYnVmZmVyLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhc1RleHRPckVycm9yKGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IFByb21pc2U8c3RyaW5nIHwgbnVsbD4ge1xuXHRpZiAoIWlzU3VjY2Vzcyhjb250ZXh0KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2VydmVyIHJldHVybmVkICcgKyBjb250ZXh0LnJlcy5zdGF0dXNDb2RlKTtcblx0fVxuXHRyZXR1cm4gYXNUZXh0KGNvbnRleHQpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXNKc29uPFQgPSB7fT4oY29udGV4dDogSVJlcXVlc3RDb250ZXh0KTogUHJvbWlzZTxUIHwgbnVsbD4ge1xuXHRpZiAoIWlzU3VjY2Vzcyhjb250ZXh0KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2VydmVyIHJldHVybmVkICcgKyBjb250ZXh0LnJlcy5zdGF0dXNDb2RlKTtcblx0fVxuXHRpZiAoaGFzTm9Db250ZW50KGNvbnRleHQpKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0Y29uc3QgYnVmZmVyID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIoY29udGV4dC5zdHJlYW0pO1xuXHRjb25zdCBzdHIgPSBidWZmZXIudG9TdHJpbmcoKTtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShzdHIpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRlcnIubWVzc2FnZSArPSAnOlxcbicgKyBzdHI7XG5cdFx0dGhyb3cgZXJyO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVQcm94eUNvbmZpZ3VyYXRpb25zU2NvcGUodXNlSG9zdFByb3h5OiBib29sZWFuLCB1c2VIb3N0UHJveHlEZWZhdWx0OiBib29sZWFuKTogdm9pZCB7XG5cdHJlZ2lzdGVyUHJveHlDb25maWd1cmF0aW9ucyh1c2VIb3N0UHJveHksIHVzZUhvc3RQcm94eURlZmF1bHQpO1xufVxuXG5leHBvcnQgY29uc3QgVVNFUl9MT0NBTF9BTkRfUkVNT1RFX1NFVFRJTkdTID0gW1xuXHQnaHR0cC5wcm94eScsXG5cdCdodHRwLnByb3h5U3RyaWN0U1NMJyxcblx0J2h0dHAucHJveHlLZXJiZXJvc1NlcnZpY2VQcmluY2lwYWwnLFxuXHQnaHR0cC5ub1Byb3h5Jyxcblx0J2h0dHAucHJveHlBdXRob3JpemF0aW9uJyxcblx0J2h0dHAucHJveHlTdXBwb3J0Jyxcblx0J2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzJyxcblx0J2h0dHAuc3lzdGVtQ2VydGlmaWNhdGVzTm9kZScsXG5cdCdodHRwLmV4cGVyaW1lbnRhbC5zeXN0ZW1DZXJ0aWZpY2F0ZXNWMicsXG5cdCdodHRwLmZldGNoQWRkaXRpb25hbFN1cHBvcnQnLFxuXHQnaHR0cC5leHBlcmltZW50YWwubmV0d29ya0ludGVyZmFjZUNoZWNrSW50ZXJ2YWwnLFxuXTtcblxuZXhwb3J0IGNvbnN0IHN5c3RlbUNlcnRpZmljYXRlc05vZGVEZWZhdWx0ID0gZmFsc2U7XG5cbmxldCBwcm94eUNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZVtdID0gW107XG5sZXQgcHJldmlvdXNVc2VIb3N0UHJveHk6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5sZXQgcHJldmlvdXNVc2VIb3N0UHJveHlEZWZhdWx0OiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuZnVuY3Rpb24gcmVnaXN0ZXJQcm94eUNvbmZpZ3VyYXRpb25zKHVzZUhvc3RQcm94eSA9IHRydWUsIHVzZUhvc3RQcm94eURlZmF1bHQgPSB0cnVlKTogdm9pZCB7XG5cdGlmIChwcmV2aW91c1VzZUhvc3RQcm94eSA9PT0gdXNlSG9zdFByb3h5ICYmIHByZXZpb3VzVXNlSG9zdFByb3h5RGVmYXVsdCA9PT0gdXNlSG9zdFByb3h5RGVmYXVsdCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHByZXZpb3VzVXNlSG9zdFByb3h5ID0gdXNlSG9zdFByb3h5O1xuXHRwcmV2aW91c1VzZUhvc3RQcm94eURlZmF1bHQgPSB1c2VIb3N0UHJveHlEZWZhdWx0O1xuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdGNvbnN0IG9sZFByb3h5Q29uZmlndXJhdGlvbiA9IHByb3h5Q29uZmlndXJhdGlvbjtcblx0cHJveHlDb25maWd1cmF0aW9uID0gW1xuXHRcdHtcblx0XHRcdGlkOiAnaHR0cCcsXG5cdFx0XHRvcmRlcjogMTUsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2h0dHBDb25maWd1cmF0aW9uVGl0bGUnLCBcIkhUVFBcIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHVzZUhvc3RQcm94eURlZmF1bHQsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VzZUxvY2FsUHJveHknLCBcIkNvbnRyb2xzIHdoZXRoZXIgaW4gdGhlIHJlbW90ZSBleHRlbnNpb24gaG9zdCB0aGUgbG9jYWwgcHJveHkgY29uZmlndXJhdGlvbiBzaG91bGQgYmUgdXNlZC4gVGhpcyBzZXR0aW5nIG9ubHkgYXBwbGllcyBhcyBhIHJlbW90ZSBzZXR0aW5nIGR1cmluZyBbcmVtb3RlIGRldmVsb3BtZW50XShodHRwczovL2FrYS5tcy92c2NvZGUtcmVtb3RlKS5cIiksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6ICdodHRwJyxcblx0XHRcdG9yZGVyOiAxNSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnaHR0cENvbmZpZ3VyYXRpb25UaXRsZScsIFwiSFRUUFwiKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J2h0dHAuZWxlY3Ryb25GZXRjaCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlbGVjdHJvbkZldGNoJywgXCJDb250cm9scyB3aGV0aGVyIHVzZSBvZiBFbGVjdHJvbidzIGZldGNoIGltcGxlbWVudGF0aW9uIGluc3RlYWQgb2YgTm9kZS5qcycgc2hvdWxkIGJlIGVuYWJsZWQuIEFsbCBsb2NhbCBleHRlbnNpb25zIHdpbGwgZ2V0IEVsZWN0cm9uJ3MgZmV0Y2ggaW1wbGVtZW50YXRpb24gZm9yIHRoZSBnbG9iYWwgZmV0Y2ggQVBJLlwiKSxcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogJ2h0dHAnLFxuXHRcdFx0b3JkZXI6IDE1LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdodHRwQ29uZmlndXJhdGlvblRpdGxlJywgXCJIVFRQXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRzY29wZTogdXNlSG9zdFByb3h5ID8gQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OIDogQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkUsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdodHRwLnByb3h5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdHBhdHRlcm46ICdeKGh0dHBzP3xzb2Nrc3xzb2NrczRhP3xzb2NrczVoPyk6Ly8oW146XSooOlteQF0qKT9AKT8oW146XSt8XFxcXFtbOjAtOWEtZkEtRl0rXFxcXF0pKDpcXFxcZCspPy8/JHxeJCcsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb3h5JywgXCJUaGUgcHJveHkgc2V0dGluZyB0byB1c2UuIElmIG5vdCBzZXQsIHdpbGwgYmUgaW5oZXJpdGVkIGZyb20gdGhlIGBodHRwX3Byb3h5YCBhbmQgYGh0dHBzX3Byb3h5YCBlbnZpcm9ubWVudCB2YXJpYWJsZXMuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAucHJveHlTdHJpY3RTU0wnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N0cmljdFNTTCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgcHJveHkgc2VydmVyIGNlcnRpZmljYXRlIHNob3VsZCBiZSB2ZXJpZmllZCBhZ2FpbnN0IHRoZSBsaXN0IG9mIHN1cHBsaWVkIENBcy4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5wcm94eUtlcmJlcm9zU2VydmljZVByaW5jaXBhbCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJveHlLZXJiZXJvc1NlcnZpY2VQcmluY2lwYWwnLCBcIk92ZXJyaWRlcyB0aGUgcHJpbmNpcGFsIHNlcnZpY2UgbmFtZSBmb3IgS2VyYmVyb3MgYXV0aGVudGljYXRpb24gd2l0aCB0aGUgSFRUUCBwcm94eS4gQSBkZWZhdWx0IGJhc2VkIG9uIHRoZSBwcm94eSBob3N0bmFtZSBpcyB1c2VkIHdoZW4gdGhpcyBpcyBub3Qgc2V0LiBXaGVuIGR1cmluZyBbcmVtb3RlIGRldmVsb3BtZW50XShodHRwczovL2FrYS5tcy92c2NvZGUtcmVtb3RlKSB0aGUgezB9IHNldHRpbmcgaXMgZGlzYWJsZWQgdGhpcyBzZXR0aW5nIGNhbiBiZSBjb25maWd1cmVkIGluIHRoZSBsb2NhbCBhbmQgdGhlIHJlbW90ZSBzZXR0aW5ncyBzZXBhcmF0ZWx5LlwiLCAnYCNodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uI2AnKSxcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdodHRwLm5vUHJveHknOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdub1Byb3h5JywgXCJTcGVjaWZpZXMgZG9tYWluIG5hbWVzIGZvciB3aGljaCBwcm94eSBzZXR0aW5ncyBzaG91bGQgYmUgaWdub3JlZCBmb3IgSFRUUC9IVFRQUyByZXF1ZXN0cy4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5wcm94eUF1dGhvcml6YXRpb24nOiB7XG5cdFx0XHRcdFx0dHlwZTogWydudWxsJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb3h5QXV0aG9yaXphdGlvbicsIFwiVGhlIHZhbHVlIHRvIHNlbmQgYXMgdGhlIGBQcm94eS1BdXRob3JpemF0aW9uYCBoZWFkZXIgZm9yIGV2ZXJ5IG5ldHdvcmsgcmVxdWVzdC4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5wcm94eVN1cHBvcnQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydvZmYnLCAnb24nLCAnZmFsbGJhY2snLCAnb3ZlcnJpZGUnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgncHJveHlTdXBwb3J0T2ZmJywgXCJEaXNhYmxlIHByb3h5IHN1cHBvcnQgZm9yIGV4dGVuc2lvbnMuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Byb3h5U3VwcG9ydE9uJywgXCJFbmFibGUgcHJveHkgc3VwcG9ydCBmb3IgZXh0ZW5zaW9ucy5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgncHJveHlTdXBwb3J0RmFsbGJhY2snLCBcIkVuYWJsZSBwcm94eSBzdXBwb3J0IGZvciBleHRlbnNpb25zLCBmYWxsIGJhY2sgdG8gcmVxdWVzdCBvcHRpb25zLCB3aGVuIG5vIHByb3h5IGZvdW5kLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdwcm94eVN1cHBvcnRPdmVycmlkZScsIFwiRW5hYmxlIHByb3h5IHN1cHBvcnQgZm9yIGV4dGVuc2lvbnMsIG92ZXJyaWRlIHJlcXVlc3Qgb3B0aW9ucy5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnb3ZlcnJpZGUnLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm94eVN1cHBvcnQnLCBcIlVzZSB0aGUgcHJveHkgc3VwcG9ydCBmb3IgZXh0ZW5zaW9ucy4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5zeXN0ZW1DZXJ0aWZpY2F0ZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N5c3RlbUNlcnRpZmljYXRlcycsIFwiQ29udHJvbHMgd2hldGhlciBDQSBjZXJ0aWZpY2F0ZXMgc2hvdWxkIGJlIGxvYWRlZCBmcm9tIHRoZSBPUy4gT24gV2luZG93cyBhbmQgbWFjT1MsIGEgcmVsb2FkIG9mIHRoZSB3aW5kb3cgaXMgcmVxdWlyZWQgYWZ0ZXIgdHVybmluZyB0aGlzIG9mZi4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5zeXN0ZW1DZXJ0aWZpY2F0ZXNOb2RlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHN5c3RlbUNlcnRpZmljYXRlc05vZGVEZWZhdWx0LFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzeXN0ZW1DZXJ0aWZpY2F0ZXNOb2RlJywgXCJDb250cm9scyB3aGV0aGVyIHN5c3RlbSBjZXJ0aWZpY2F0ZXMgc2hvdWxkIGJlIGxvYWRlZCB1c2luZyBOb2RlLmpzIGJ1aWx0LWluIHN1cHBvcnQuIFJlbG9hZCB0aGUgd2luZG93IGFmdGVyIGNoYW5naW5nIHRoaXMgc2V0dGluZy4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdodHRwLmV4cGVyaW1lbnRhbC5zeXN0ZW1DZXJ0aWZpY2F0ZXNWMic6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3lzdGVtQ2VydGlmaWNhdGVzVjInLCBcIkNvbnRyb2xzIHdoZXRoZXIgZXhwZXJpbWVudGFsIGxvYWRpbmcgb2YgQ0EgY2VydGlmaWNhdGVzIGZyb20gdGhlIE9TIHNob3VsZCBiZSBlbmFibGVkLiBUaGlzIHVzZXMgYSBtb3JlIGdlbmVyYWwgYXBwcm9hY2ggdGhhbiB0aGUgZGVmYXVsdCBpbXBsZW1lbnRhdGlvbi4gV2hlbiBkdXJpbmcgW3JlbW90ZSBkZXZlbG9wbWVudF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXJlbW90ZSkgdGhlIHswfSBzZXR0aW5nIGlzIGRpc2FibGVkIHRoaXMgc2V0dGluZyBjYW4gYmUgY29uZmlndXJlZCBpbiB0aGUgbG9jYWwgYW5kIHRoZSByZW1vdGUgc2V0dGluZ3Mgc2VwYXJhdGVseS5cIiwgJ2AjaHR0cC51c2VMb2NhbFByb3h5Q29uZmlndXJhdGlvbiNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC5mZXRjaEFkZGl0aW9uYWxTdXBwb3J0Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdmZXRjaEFkZGl0aW9uYWxTdXBwb3J0JywgXCJDb250cm9scyB3aGV0aGVyIE5vZGUuanMnIGZldGNoIGltcGxlbWVudGF0aW9uIHNob3VsZCBiZSBleHRlbmRlZCB3aXRoIGFkZGl0aW9uYWwgc3VwcG9ydC4gQ3VycmVudGx5IHByb3h5IHN1cHBvcnQgKHsxfSkgYW5kIHN5c3RlbSBjZXJ0aWZpY2F0ZXMgKHsyfSkgYXJlIGFkZGVkIHdoZW4gdGhlIGNvcnJlc3BvbmRpbmcgc2V0dGluZ3MgYXJlIGVuYWJsZWQuIFdoZW4gZHVyaW5nIFtyZW1vdGUgZGV2ZWxvcG1lbnRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUpIHRoZSB7MH0gc2V0dGluZyBpcyBkaXNhYmxlZCB0aGlzIHNldHRpbmcgY2FuIGJlIGNvbmZpZ3VyZWQgaW4gdGhlIGxvY2FsIGFuZCB0aGUgcmVtb3RlIHNldHRpbmdzIHNlcGFyYXRlbHkuXCIsICdgI2h0dHAudXNlTG9jYWxQcm94eUNvbmZpZ3VyYXRpb24jYCcsICdgI2h0dHAucHJveHlTdXBwb3J0I2AnLCAnYCNodHRwLnN5c3RlbUNlcnRpZmljYXRlcyNgJyksXG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnaHR0cC53ZWJTb2NrZXRBZGRpdGlvbmFsU3VwcG9ydCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd2ViU29ja2V0QWRkaXRpb25hbFN1cHBvcnQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGJ1aWx0LWluIFdlYlNvY2tldCBpbXBsZW1lbnRhdGlvbiBzaG91bGQgYmUgZXh0ZW5kZWQgd2l0aCBhZGRpdGlvbmFsIHN1cHBvcnQuIEN1cnJlbnRseSBwcm94eSBzdXBwb3J0ICh7MX0pIGFuZCBzeXN0ZW0gY2VydGlmaWNhdGVzICh7Mn0pIGFyZSBhZGRlZCB3aGVuIHRoZSBjb3JyZXNwb25kaW5nIHNldHRpbmdzIGFyZSBlbmFibGVkLiBXaGVuIGR1cmluZyBbcmVtb3RlIGRldmVsb3BtZW50XShodHRwczovL2FrYS5tcy92c2NvZGUtcmVtb3RlKSB0aGUgezB9IHNldHRpbmcgaXMgZGlzYWJsZWQgdGhpcyBzZXR0aW5nIGNhbiBiZSBjb25maWd1cmVkIGluIHRoZSBsb2NhbCBhbmQgdGhlIHJlbW90ZSBzZXR0aW5ncyBzZXBhcmF0ZWx5LlwiLCAnYCNodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uI2AnLCAnYCNodHRwLnByb3h5U3VwcG9ydCNgJywgJ2AjaHR0cC5zeXN0ZW1DZXJ0aWZpY2F0ZXMjYCcpLFxuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0J2h0dHAuZXhwZXJpbWVudGFsLm5ldHdvcmtJbnRlcmZhY2VDaGVja0ludGVydmFsJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IDMwMCxcblx0XHRcdFx0XHRtaW5pbXVtOiAtMSxcblx0XHRcdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCduZXR3b3JrSW50ZXJmYWNlQ2hlY2tJbnRlcnZhbCcsIFwiQ29udHJvbHMgdGhlIGludGVydmFsIGluIHNlY29uZHMgZm9yIGNoZWNraW5nIG5ldHdvcmsgaW50ZXJmYWNlIGNoYW5nZXMgdG8gaW52YWxpZGF0ZSB0aGUgcHJveHkgY2FjaGUuIFNldCB0byAtMSB0byBkaXNhYmxlLiBXaGVuIGR1cmluZyBbcmVtb3RlIGRldmVsb3BtZW50XShodHRwczovL2FrYS5tcy92c2NvZGUtcmVtb3RlKSB0aGUgezB9IHNldHRpbmcgaXMgZGlzYWJsZWQgdGhpcyBzZXR0aW5nIGNhbiBiZSBjb25maWd1cmVkIGluIHRoZSBsb2NhbCBhbmQgdGhlIHJlbW90ZSBzZXR0aW5ncyBzZXBhcmF0ZWx5LlwiLCAnYCNodHRwLnVzZUxvY2FsUHJveHlDb25maWd1cmF0aW9uI2AnKSxcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XTtcblx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnVwZGF0ZUNvbmZpZ3VyYXRpb25zKHsgYWRkOiBwcm94eUNvbmZpZ3VyYXRpb24sIHJlbW92ZTogb2xkUHJveHlDb25maWd1cmF0aW9uIH0pO1xufVxuXG5yZWdpc3RlclByb3h5Q29uZmlndXJhdGlvbnMoKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0Isa0JBQThEO0FBQzNGLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsZ0JBQWdCO0FBRWxCLE1BQU0sa0JBQWtCLGdCQUFpQyxnQkFBZ0I7QUFP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
