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
import { mkdir } from "fs/promises";
import { dirname, join } from "../../../../base/common/path.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { ILogService } from "../../../log/common/log.js";
import { startLocalOtlpHttpReceiver } from "../../../otel/node/otlp/localOtlpReceiver.js";
import {
  CompositeForwarder,
  ConsoleForwarder,
  FileForwarder,
  OtlpHttpForwarder
} from "../../../otel/node/otlp/outboundForwarder.js";
import { GenAiAttr } from "../../../otel/common/genAiAttributes.js";
import { SpanStatusCode } from "../../../otel/common/spanData.js";
import { OTelSqliteStore } from "../../../otel/node/sqlite/otelSqliteStore.js";
import { AgentHostOTelSpansDbSubPath } from "../../common/agentService.js";
import { AgentHostSessionTitleAttribute, AgentHostSessionTitleSpanName, AgentHostSessionUriAttribute } from "../../common/otel/agentHostOTelService.js";
const SPANS_DB_SUBPATH = AgentHostOTelSpansDbSubPath;
function isTruthy(v) {
  if (!v) {
    return false;
  }
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}
function parseOtlpHeaders(raw) {
  if (!raw) {
    return void 0;
  }
  const out = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key) {
      out[key] = value;
    }
  }
  return Object.keys(out).length ? out : void 0;
}
function parseResourceAttributes(raw, serviceName) {
  const attributes = {};
  for (const pair of raw?.split(",") ?? []) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key) {
      try {
        attributes[key] = decodeURIComponent(value);
      } catch {
        attributes[key] = value;
      }
    }
  }
  if (serviceName) {
    attributes["service.name"] = serviceName;
  }
  return attributes;
}
function readAgentHostOTelEnv(env) {
  const dbSpanExporter = isTruthy(env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED);
  const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? env.COPILOT_OTEL_ENDPOINT;
  const filePath = env.COPILOT_OTEL_FILE_EXPORTER_PATH;
  const explicitlyEnabled = isTruthy(env.COPILOT_OTEL_ENABLED);
  const enabled = explicitlyEnabled || dbSpanExporter || !!otlpEndpoint || !!filePath;
  const rawType = (env.COPILOT_OTEL_EXPORTER_TYPE ?? "").trim().toLowerCase();
  const protocol = (env.OTEL_EXPORTER_OTLP_PROTOCOL ?? env.COPILOT_OTEL_PROTOCOL ?? "").trim().toLowerCase();
  let exporterType = "otlp-http";
  if (rawType === "console" || rawType === "file" || rawType === "otlp-grpc" || rawType === "otlp-http") {
    exporterType = rawType;
  } else if (filePath) {
    exporterType = "file";
  }
  if (protocol === "grpc" || protocol === "http/grpc") {
    exporterType = "otlp-grpc";
  }
  return {
    enabled,
    dbSpanExporter,
    exporterType,
    otlpEndpoint,
    filePath,
    sourceName: env.COPILOT_OTEL_SOURCE_NAME,
    captureContent: env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT === void 0 ? void 0 : isTruthy(env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT),
    headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
    otlpProtocol: protocol,
    resourceAttributes: parseResourceAttributes(env.OTEL_RESOURCE_ATTRIBUTES, env.OTEL_SERVICE_NAME)
  };
}
let AgentHostOTelService = class extends Disposable {
  constructor(_fetchFn, _logService, environmentService) {
    super();
    this._fetchFn = _fetchFn;
    this._logService = _logService;
    this._titleExportQueue = Promise.resolve();
    this._config = readAgentHostOTelEnv(process.env);
    this._spansDbPath = join(environmentService.userDataPath, SPANS_DB_SUBPATH);
  }
  async getSdkTelemetryConfig() {
    if (!this._config.enabled) {
      return void 0;
    }
    if (this._config.dbSpanExporter) {
      await this._ensureStarted();
      if (!this._receiver) {
        if (!this._config.otlpEndpoint && this._config.exporterType !== "console" && !this._config.filePath) {
          return void 0;
        }
      } else {
        return this._buildLoopbackConfig();
      }
    }
    return this._buildPassthroughConfig();
  }
  getSpansDbPath() {
    return this._config.dbSpanExporter ? URI.file(this._spansDbPath) : void 0;
  }
  emitSessionTitleChanged(conversationId, sessionUri, title) {
    if (!this._config.enabled || this._config.captureContent !== true || !conversationId || !title) {
      return;
    }
    if (!this._config.dbSpanExporter && !this._canForwardSyntheticSpan()) {
      return;
    }
    const boundedTitle = title.slice(0, 200);
    this._titleExportQueue = this._titleExportQueue.then(() => this._emitSessionTitleSpan(conversationId, sessionUri, boundedTitle)).catch((err) => this._logService.warn("[agentHost.otel] failed to emit session title span", err));
  }
  async flush() {
    await this._titleExportQueue;
    await this._startPromise;
    if (this._forwarder) {
      await this._forwarder.flush();
    }
  }
  _buildLoopbackConfig() {
    return {
      exporterType: "otlp-http",
      otlpEndpoint: this._receiver.baseUrl,
      sourceName: this._config.sourceName,
      captureContent: this._config.captureContent
    };
  }
  _buildPassthroughConfig() {
    return {
      exporterType: this._config.exporterType,
      otlpEndpoint: this._config.otlpEndpoint,
      filePath: this._config.filePath,
      sourceName: this._config.sourceName,
      captureContent: this._config.captureContent
    };
  }
  _ensureStarted() {
    if (!this._startPromise) {
      this._startPromise = this._start().catch((err) => {
        this._logService.error("[agentHost.otel] failed to start loopback OTel pipeline", err);
        this._receiver = void 0;
        this._forwarder = void 0;
      });
    }
    return this._startPromise;
  }
  async _start() {
    await mkdir(dirname(this._spansDbPath), { recursive: true });
    const store = new OTelSqliteStore(this._spansDbPath);
    this._spanStore = store;
    this._register(toDisposable(() => {
      store.close();
      this._spanStore = void 0;
    }));
    this._forwarder = this._buildOutboundForwarder();
    const receiver = await startLocalOtlpHttpReceiver(
      {
        onSpans: (result) => {
          for (const span of result.spans) {
            try {
              store.insertSpan(span);
            } catch (err) {
              this._logService.warn("[agentHost.otel] failed to insert span", err);
            }
          }
          this._forwarder?.forwardSpans?.(result);
        },
        onForward: this._forwarder ? (body, contentType) => {
          this._forwarder.forwardRaw?.(body, contentType);
        } : void 0
      },
      this._logService
    );
    this._receiver = receiver;
    this._register(receiver);
    if (this._forwarder) {
      this._register(this._forwarder);
    }
    this._logService.info(`[agentHost.otel] loopback receiver at ${receiver.baseUrl}, db ${this._spansDbPath}`);
  }
  async _emitSessionTitleSpan(conversationId, sessionUri, title) {
    if (this._config.dbSpanExporter) {
      await this._ensureStarted();
    } else if (!this._forwarder) {
      this._forwarder = this._buildOutboundForwarder();
      if (this._forwarder) {
        this._register(this._forwarder);
      }
    }
    const now = Date.now();
    const traceId = generateUuid().replaceAll("-", "");
    const span = {
      name: AgentHostSessionTitleSpanName,
      traceId,
      spanId: generateUuid().replaceAll("-", "").slice(0, 16),
      startTime: now,
      endTime: now,
      status: { code: SpanStatusCode.OK },
      attributes: {
        ...this._config.resourceAttributes,
        [GenAiAttr.CONVERSATION_ID]: conversationId,
        [AgentHostSessionTitleAttribute]: title,
        [AgentHostSessionUriAttribute]: sessionUri
      },
      events: []
    };
    try {
      this._spanStore?.insertSpan(span);
    } catch (err) {
      this._logService.warn("[agentHost.otel] failed to persist session title span", err);
    }
    const result = { spans: [span], rejected: 0, errors: [] };
    this._forwarder?.forwardSpans?.(result);
    if (this._canForwardSyntheticSpan()) {
      this._forwarder?.forwardRaw?.(this._encodeOtlpSpan(span), "application/json");
    }
  }
  _canForwardSyntheticSpan() {
    return this._config.exporterType === "file" || this._config.exporterType === "console" || this._config.exporterType === "otlp-http" && this._config.otlpProtocol !== "http/protobuf";
  }
  _encodeOtlpSpan(span) {
    const resourceAttributeKeys = new Set(Object.keys(this._config.resourceAttributes));
    const attributes = Object.entries(span.attributes).filter(([key]) => !resourceAttributeKeys.has(key) || key === GenAiAttr.CONVERSATION_ID || key.startsWith("vscode.agent_host.")).map(([key, value]) => ({
      key,
      value: typeof value === "string" ? { stringValue: value } : typeof value === "number" ? { doubleValue: value } : typeof value === "boolean" ? { boolValue: value } : { arrayValue: { values: value.map((item) => ({ stringValue: item })) } }
    }));
    const resourceAttributes = Object.entries(this._config.resourceAttributes).map(([key, value]) => ({ key, value: { stringValue: value } }));
    return Buffer.from(JSON.stringify({
      resourceSpans: [{
        ...resourceAttributes.length ? { resource: { attributes: resourceAttributes } } : {},
        scopeSpans: [{
          scope: { name: this._config.sourceName ?? "vscode.agent-host" },
          spans: [{
            traceId: span.traceId,
            spanId: span.spanId,
            name: span.name,
            kind: 1,
            startTimeUnixNano: `${span.startTime}000000`,
            endTimeUnixNano: `${span.endTime}000000`,
            attributes,
            status: { code: 1 }
          }]
        }]
      }]
    }), "utf8");
  }
  _buildOutboundForwarder() {
    const children = [];
    switch (this._config.exporterType) {
      case "otlp-http":
      case "otlp-grpc":
        if (this._config.otlpEndpoint) {
          children.push(new OtlpHttpForwarder(
            {
              endpoint: this._config.otlpEndpoint,
              headers: this._config.headers
            },
            this._logService,
            this._fetchFn
          ));
        }
        break;
      case "file":
        if (this._config.filePath) {
          children.push(new FileForwarder({ filePath: this._config.filePath }, this._logService));
        }
        break;
      case "console":
        children.push(new ConsoleForwarder(this._logService));
        break;
    }
    if (!children.length) {
      return void 0;
    }
    return children.length === 1 ? children[0] : new CompositeForwarder(children);
  }
};
AgentHostOTelService = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, INativeEnvironmentService)
], AgentHostOTelService);
export {
  AgentHostOTelService,
  readAgentHostOTelEnv
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL290ZWwvYWdlbnRIb3N0T1RlbFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBta2RpciB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB0eXBlIHsgVGVsZW1ldHJ5Q29uZmlnIH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyLCB0eXBlIElMb2NhbE90bHBIdHRwUmVjZWl2ZXIgfSBmcm9tICcuLi8uLi8uLi9vdGVsL25vZGUvb3RscC9sb2NhbE90bHBSZWNlaXZlci5qcyc7XG5pbXBvcnQge1xuXHRDb21wb3NpdGVGb3J3YXJkZXIsXG5cdENvbnNvbGVGb3J3YXJkZXIsXG5cdEZpbGVGb3J3YXJkZXIsXG5cdE90bHBIdHRwRm9yd2FyZGVyLFxuXHR0eXBlIElPdXRib3VuZEZvcndhcmRlcixcbn0gZnJvbSAnLi4vLi4vLi4vb3RlbC9ub2RlL290bHAvb3V0Ym91bmRGb3J3YXJkZXIuanMnO1xuaW1wb3J0IHsgR2VuQWlBdHRyIH0gZnJvbSAnLi4vLi4vLi4vb3RlbC9jb21tb24vZ2VuQWlBdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElDb21wbGV0ZWRTcGFuRGF0YSwgU3BhblN0YXR1c0NvZGUgfSBmcm9tICcuLi8uLi8uLi9vdGVsL2NvbW1vbi9zcGFuRGF0YS5qcyc7XG5pbXBvcnQgeyBPVGVsU3FsaXRlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9vdGVsL25vZGUvc3FsaXRlL290ZWxTcWxpdGVTdG9yZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPVGVsU3BhbnNEYlN1YlBhdGggfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25UaXRsZUF0dHJpYnV0ZSwgQWdlbnRIb3N0U2Vzc2lvblRpdGxlU3Bhbk5hbWUsIEFnZW50SG9zdFNlc3Npb25VcmlBdHRyaWJ1dGUsIElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcblxuLyoqIFN1Yi1wYXRoIHVuZGVyIHRoZSB1c2VyIGRhdGEgZGlyZWN0b3J5IHdoZXJlIHRoZSBzcGFuIERCIGxpdmVzLiAqL1xuY29uc3QgU1BBTlNfREJfU1VCUEFUSCA9IEFnZW50SG9zdE9UZWxTcGFuc0RiU3ViUGF0aDtcblxuLyoqXG4gKiBFZmZlY3RpdmUgT1RlbCBjb25maWd1cmF0aW9uIHJlc29sdmVkIGZyb20gYHByb2Nlc3MuZW52YC4gU2V0dGluZ3MgXHUyMTkyIGVudiBjb252ZXJzaW9uXG4gKiBoYXBwZW5zIGluIHRoZSB3b3JrYmVuY2gtc2lkZSBhZ2VudC1ob3N0IHN0YXJ0ZXIgKHNlZSBgbm9kZUFnZW50SG9zdFN0YXJ0ZXIudHNgKTtcbiAqIHRoaXMgc2VydmljZSBvbmx5IGNvbnN1bWVzIGVudiBzbyBpdCBjYW4gc3RheSBkZWNvdXBsZWQgZnJvbSBjb25maWd1cmF0aW9uIHBsdW1iaW5nLlxuICovXG5pbnRlcmZhY2UgUmVzb2x2ZWRDb25maWcge1xuXHQvKiogVGVsZW1ldHJ5IGVuYWJsZWQgYXQgYWxsPyAqL1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHQvKiogREIgbW9kZSAobG9vcGJhY2sgKyBTUUxpdGUpIHJlcXVlc3RlZD8gKi9cblx0cmVhZG9ubHkgZGJTcGFuRXhwb3J0ZXI6IGJvb2xlYW47XG5cdC8qKiBQYXNzLXRocm91Z2ggZXhwb3J0ZXIgdHlwZS4gKi9cblx0cmVhZG9ubHkgZXhwb3J0ZXJUeXBlOiAnb3RscC1odHRwJyB8ICdvdGxwLWdycGMnIHwgJ2NvbnNvbGUnIHwgJ2ZpbGUnO1xuXHQvKiogUGFzcy10aHJvdWdoIE9UTFAgZW5kcG9pbnQuICovXG5cdHJlYWRvbmx5IG90bHBFbmRwb2ludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogUGFzcy10aHJvdWdoIGZpbGUgcGF0aCAoZmlsZSBleHBvcnRlcikuICovXG5cdHJlYWRvbmx5IGZpbGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBJbnN0cnVtZW50YXRpb24gc291cmNlL3NlcnZpY2UgbmFtZS4gKi9cblx0cmVhZG9ubHkgc291cmNlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogQ2FwdHVyZSBwcm9tcHQvcmVzcG9uc2UgY29udGVudCBpbiBzcGFucy4gKi9cblx0cmVhZG9ubHkgY2FwdHVyZUNvbnRlbnQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdC8qKiBQYXJzZWQgT1RFTF9FWFBPUlRFUl9PVExQX0hFQURFUlMgZm9yIG91dGJvdW5kIGZvcndhcmRpbmcuICovXG5cdHJlYWRvbmx5IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdC8qKiBFZmZlY3RpdmUgT1RMUCBwcm90b2NvbCBjb25maWd1cmVkIGZvciB0aGUgU0RLIHJ1bnRpbWUuICovXG5cdHJlYWRvbmx5IG90bHBQcm90b2NvbDogc3RyaW5nO1xuXHQvKiogUmVzb3VyY2UgYXR0cmlidXRlcyBhcHBsaWVkIHRvIGhvc3QtcHJvZHVjZWQgbWV0YWRhdGEgc3BhbnMuICovXG5cdHJlYWRvbmx5IHJlc291cmNlQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbn1cblxuZnVuY3Rpb24gaXNUcnV0aHkodjogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmICghdikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzID0gdi50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIHMgPT09ICd0cnVlJyB8fCBzID09PSAnMScgfHwgcyA9PT0gJ3llcycgfHwgcyA9PT0gJ29uJztcbn1cblxuZnVuY3Rpb24gcGFyc2VPdGxwSGVhZGVycyhyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJhdykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdGZvciAoY29uc3QgcGFpciBvZiByYXcuc3BsaXQoJywnKSkge1xuXHRcdGNvbnN0IGVxID0gcGFpci5pbmRleE9mKCc9Jyk7XG5cdFx0aWYgKGVxIDw9IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSBwYWlyLnNsaWNlKDAsIGVxKS50cmltKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBwYWlyLnNsaWNlKGVxICsgMSkudHJpbSgpO1xuXHRcdGlmIChrZXkpIHtcblx0XHRcdG91dFtrZXldID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhvdXQpLmxlbmd0aCA/IG91dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcGFyc2VSZXNvdXJjZUF0dHJpYnV0ZXMocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlcnZpY2VOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0Y29uc3QgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRmb3IgKGNvbnN0IHBhaXIgb2YgcmF3Py5zcGxpdCgnLCcpID8/IFtdKSB7XG5cdFx0Y29uc3QgZXEgPSBwYWlyLmluZGV4T2YoJz0nKTtcblx0XHRpZiAoZXEgPD0gMCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGtleSA9IHBhaXIuc2xpY2UoMCwgZXEpLnRyaW0oKTtcblx0XHRjb25zdCB2YWx1ZSA9IHBhaXIuc2xpY2UoZXEgKyAxKS50cmltKCk7XG5cdFx0aWYgKGtleSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXR0cmlidXRlc1trZXldID0gZGVjb2RlVVJJQ29tcG9uZW50KHZhbHVlKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRhdHRyaWJ1dGVzW2tleV0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0aWYgKHNlcnZpY2VOYW1lKSB7XG5cdFx0YXR0cmlidXRlc1snc2VydmljZS5uYW1lJ10gPSBzZXJ2aWNlTmFtZTtcblx0fVxuXHRyZXR1cm4gYXR0cmlidXRlcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlYWRBZ2VudEhvc3RPVGVsRW52KGVudjogTm9kZUpTLlByb2Nlc3NFbnYpOiBSZXNvbHZlZENvbmZpZyB7XG5cdGNvbnN0IGRiU3BhbkV4cG9ydGVyID0gaXNUcnV0aHkoZW52LkNPUElMT1RfT1RFTF9EQl9TUEFOX0VYUE9SVEVSX0VOQUJMRUQpO1xuXHRjb25zdCBvdGxwRW5kcG9pbnQgPSBlbnYuT1RFTF9FWFBPUlRFUl9PVExQX0VORFBPSU5UID8/IGVudi5DT1BJTE9UX09URUxfRU5EUE9JTlQ7XG5cdGNvbnN0IGZpbGVQYXRoID0gZW52LkNPUElMT1RfT1RFTF9GSUxFX0VYUE9SVEVSX1BBVEg7XG5cdGNvbnN0IGV4cGxpY2l0bHlFbmFibGVkID0gaXNUcnV0aHkoZW52LkNPUElMT1RfT1RFTF9FTkFCTEVEKTtcblx0Y29uc3QgZW5hYmxlZCA9IGV4cGxpY2l0bHlFbmFibGVkIHx8IGRiU3BhbkV4cG9ydGVyIHx8ICEhb3RscEVuZHBvaW50IHx8ICEhZmlsZVBhdGg7XG5cblx0Ly8gTWFwIHRoZSBPVExQIHByb3RvY29sIGVudiB2YXIgb250byBvdXIgZm91ciB1c2VyLXZpc2libGUgZXhwb3J0ZXIgdHlwZXMuXG5cdGNvbnN0IHJhd1R5cGUgPSAoZW52LkNPUElMT1RfT1RFTF9FWFBPUlRFUl9UWVBFID8/ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0Y29uc3QgcHJvdG9jb2wgPSAoZW52Lk9URUxfRVhQT1JURVJfT1RMUF9QUk9UT0NPTCA/PyBlbnYuQ09QSUxPVF9PVEVMX1BST1RPQ09MID8/ICcnKS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0bGV0IGV4cG9ydGVyVHlwZTogUmVzb2x2ZWRDb25maWdbJ2V4cG9ydGVyVHlwZSddID0gJ290bHAtaHR0cCc7XG5cdGlmIChyYXdUeXBlID09PSAnY29uc29sZScgfHwgcmF3VHlwZSA9PT0gJ2ZpbGUnIHx8IHJhd1R5cGUgPT09ICdvdGxwLWdycGMnIHx8IHJhd1R5cGUgPT09ICdvdGxwLWh0dHAnKSB7XG5cdFx0ZXhwb3J0ZXJUeXBlID0gcmF3VHlwZTtcblx0fSBlbHNlIGlmIChmaWxlUGF0aCkge1xuXHRcdGV4cG9ydGVyVHlwZSA9ICdmaWxlJztcblx0fVxuXHRpZiAocHJvdG9jb2wgPT09ICdncnBjJyB8fCBwcm90b2NvbCA9PT0gJ2h0dHAvZ3JwYycpIHtcblx0XHRleHBvcnRlclR5cGUgPSAnb3RscC1ncnBjJztcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0ZW5hYmxlZCxcblx0XHRkYlNwYW5FeHBvcnRlcixcblx0XHRleHBvcnRlclR5cGUsXG5cdFx0b3RscEVuZHBvaW50LFxuXHRcdGZpbGVQYXRoLFxuXHRcdHNvdXJjZU5hbWU6IGVudi5DT1BJTE9UX09URUxfU09VUkNFX05BTUUsXG5cdFx0Y2FwdHVyZUNvbnRlbnQ6IGVudi5PVEVMX0lOU1RSVU1FTlRBVElPTl9HRU5BSV9DQVBUVVJFX01FU1NBR0VfQ09OVEVOVCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0OiBpc1RydXRoeShlbnYuT1RFTF9JTlNUUlVNRU5UQVRJT05fR0VOQUlfQ0FQVFVSRV9NRVNTQUdFX0NPTlRFTlQpLFxuXHRcdGhlYWRlcnM6IHBhcnNlT3RscEhlYWRlcnMoZW52Lk9URUxfRVhQT1JURVJfT1RMUF9IRUFERVJTKSxcblx0XHRvdGxwUHJvdG9jb2w6IHByb3RvY29sLFxuXHRcdHJlc291cmNlQXR0cmlidXRlczogcGFyc2VSZXNvdXJjZUF0dHJpYnV0ZXMoZW52Lk9URUxfUkVTT1VSQ0VfQVRUUklCVVRFUywgZW52Lk9URUxfU0VSVklDRV9OQU1FKSxcblx0fTtcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdE9UZWxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RPVGVsU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlnOiBSZXNvbHZlZENvbmZpZztcblx0cHJpdmF0ZSByZWFkb25seSBfc3BhbnNEYlBhdGg6IHN0cmluZztcblxuXHRwcml2YXRlIF9yZWNlaXZlcjogSUxvY2FsT3RscEh0dHBSZWNlaXZlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3BhblN0b3JlOiBPVGVsU3FsaXRlU3RvcmUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZvcndhcmRlcjogSU91dGJvdW5kRm9yd2FyZGVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGFydFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RpdGxlRXhwb3J0UXVldWUgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mZXRjaEZuOiB0eXBlb2YgZ2xvYmFsVGhpcy5mZXRjaCB8IHVuZGVmaW5lZCxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbmZpZyA9IHJlYWRBZ2VudEhvc3RPVGVsRW52KHByb2Nlc3MuZW52KTtcblx0XHR0aGlzLl9zcGFuc0RiUGF0aCA9IGpvaW4oZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgU1BBTlNfREJfU1VCUEFUSCk7XG5cdH1cblxuXHRhc3luYyBnZXRTZGtUZWxlbWV0cnlDb25maWcoKTogUHJvbWlzZTxUZWxlbWV0cnlDb25maWcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb25maWcuZGJTcGFuRXhwb3J0ZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Vuc3VyZVN0YXJ0ZWQoKTtcblx0XHRcdGlmICghdGhpcy5fcmVjZWl2ZXIpIHtcblx0XHRcdFx0Ly8gU3RhcnQgZmFpbGVkOyB3ZSBhbHJlYWR5IGxvZ2dlZC4gRmFsbCB0aHJvdWdoIHRvIHBhc3MtdGhyb3VnaCBpZlxuXHRcdFx0XHQvLyB0aGUgdXNlciBhbHNvIGhhcyBhbiBleHRlcm5hbCBlbmRwb2ludCBjb25maWd1cmVkLlxuXHRcdFx0XHRpZiAoIXRoaXMuX2NvbmZpZy5vdGxwRW5kcG9pbnQgJiYgdGhpcy5fY29uZmlnLmV4cG9ydGVyVHlwZSAhPT0gJ2NvbnNvbGUnICYmICF0aGlzLl9jb25maWcuZmlsZVBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fYnVpbGRMb29wYmFja0NvbmZpZygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9idWlsZFBhc3N0aHJvdWdoQ29uZmlnKCk7XG5cdH1cblxuXHRnZXRTcGFuc0RiUGF0aCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWcuZGJTcGFuRXhwb3J0ZXIgPyBVUkkuZmlsZSh0aGlzLl9zcGFuc0RiUGF0aCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRlbWl0U2Vzc2lvblRpdGxlQ2hhbmdlZChjb252ZXJzYXRpb25JZDogc3RyaW5nLCBzZXNzaW9uVXJpOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZy5lbmFibGVkIHx8IHRoaXMuX2NvbmZpZy5jYXB0dXJlQ29udGVudCAhPT0gdHJ1ZSB8fCAhY29udmVyc2F0aW9uSWQgfHwgIXRpdGxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY29uZmlnLmRiU3BhbkV4cG9ydGVyICYmICF0aGlzLl9jYW5Gb3J3YXJkU3ludGhldGljU3BhbigpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm91bmRlZFRpdGxlID0gdGl0bGUuc2xpY2UoMCwgMjAwKTtcblx0XHR0aGlzLl90aXRsZUV4cG9ydFF1ZXVlID0gdGhpcy5fdGl0bGVFeHBvcnRRdWV1ZVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5fZW1pdFNlc3Npb25UaXRsZVNwYW4oY29udmVyc2F0aW9uSWQsIHNlc3Npb25VcmksIGJvdW5kZWRUaXRsZSkpXG5cdFx0XHQuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW2FnZW50SG9zdC5vdGVsXSBmYWlsZWQgdG8gZW1pdCBzZXNzaW9uIHRpdGxlIHNwYW4nLCBlcnIpKTtcblx0fVxuXG5cdGFzeW5jIGZsdXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3RpdGxlRXhwb3J0UXVldWU7XG5cdFx0YXdhaXQgdGhpcy5fc3RhcnRQcm9taXNlO1xuXHRcdGlmICh0aGlzLl9mb3J3YXJkZXIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZvcndhcmRlci5mbHVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkTG9vcGJhY2tDb25maWcoKTogVGVsZW1ldHJ5Q29uZmlnIHtcblx0XHQvLyBJbiBEQiBtb2RlIHdlIGFsd2F5cyBwb2ludCB0aGUgU0RLIGF0IG91ciBsb29wYmFjayBPVExQL0hUVFAgZW5kcG9pbnRcblx0XHQvLyByZWdhcmRsZXNzIG9mIHdoYXQgdGhlIHVzZXIgY29uZmlndXJlZCBleHRlcm5hbGx5IFx1MjAxNCB0aGUgdXNlcidzIGV4dGVybmFsXG5cdFx0Ly8gc2luayBpcyBmZWQgYnkgb3VyIG91dGJvdW5kIGZvcndhcmRlciBpbnN0ZWFkLiBUaGlzIGd1YXJhbnRlZXMgd2UgZ2V0IGFcblx0XHQvLyBTUUxpdGUgbWlycm9yIG9mIGV2ZXJ5IHNwYW4gdGhlIGFnZW50IGVtaXRzLlxuXHRcdHJldHVybiB7XG5cdFx0XHRleHBvcnRlclR5cGU6ICdvdGxwLWh0dHAnLFxuXHRcdFx0b3RscEVuZHBvaW50OiB0aGlzLl9yZWNlaXZlciEuYmFzZVVybCxcblx0XHRcdHNvdXJjZU5hbWU6IHRoaXMuX2NvbmZpZy5zb3VyY2VOYW1lLFxuXHRcdFx0Y2FwdHVyZUNvbnRlbnQ6IHRoaXMuX2NvbmZpZy5jYXB0dXJlQ29udGVudCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRQYXNzdGhyb3VnaENvbmZpZygpOiBUZWxlbWV0cnlDb25maWcge1xuXHRcdHJldHVybiB7XG5cdFx0XHRleHBvcnRlclR5cGU6IHRoaXMuX2NvbmZpZy5leHBvcnRlclR5cGUsXG5cdFx0XHRvdGxwRW5kcG9pbnQ6IHRoaXMuX2NvbmZpZy5vdGxwRW5kcG9pbnQsXG5cdFx0XHRmaWxlUGF0aDogdGhpcy5fY29uZmlnLmZpbGVQYXRoLFxuXHRcdFx0c291cmNlTmFtZTogdGhpcy5fY29uZmlnLnNvdXJjZU5hbWUsXG5cdFx0XHRjYXB0dXJlQ29udGVudDogdGhpcy5fY29uZmlnLmNhcHR1cmVDb250ZW50LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVTdGFydGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fc3RhcnRQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9zdGFydFByb21pc2UgPSB0aGlzLl9zdGFydCgpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1thZ2VudEhvc3Qub3RlbF0gZmFpbGVkIHRvIHN0YXJ0IGxvb3BiYWNrIE9UZWwgcGlwZWxpbmUnLCBlcnIpO1xuXHRcdFx0XHQvLyBEcm9wIHRoZSByZWNlaXZlci9zdG9yZS9mb3J3YXJkZXIgc28gZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnIGZhbGxzIGJhY2tcblx0XHRcdFx0Ly8gdG8gcGFzcy10aHJvdWdoIChvciB1bmRlZmluZWQpIG9uIHN1YnNlcXVlbnQgY2FsbHMuXG5cdFx0XHRcdHRoaXMuX3JlY2VpdmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9mb3J3YXJkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXJ0UHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIDEuIFBlcnNpc3RlbnQgU1FMaXRlIHN0b3JlLlxuXHRcdGF3YWl0IG1rZGlyKGRpcm5hbWUodGhpcy5fc3BhbnNEYlBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBPVGVsU3FsaXRlU3RvcmUodGhpcy5fc3BhbnNEYlBhdGgpO1xuXHRcdHRoaXMuX3NwYW5TdG9yZSA9IHN0b3JlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRzdG9yZS5jbG9zZSgpO1xuXHRcdFx0dGhpcy5fc3BhblN0b3JlID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdC8vIDIuIE9wdGlvbmFsIG91dGJvdW5kIGZvcndhcmRlciB3aGVuIHRoZSB1c2VyICphbHNvKiB3YW50cyBhbiBleHRlcm5hbCBzaW5rLlxuXHRcdHRoaXMuX2ZvcndhcmRlciA9IHRoaXMuX2J1aWxkT3V0Ym91bmRGb3J3YXJkZXIoKTtcblxuXHRcdC8vIDMuIExvb3BiYWNrIE9UTFAvSFRUUCByZWNlaXZlci5cblx0XHRjb25zdCByZWNlaXZlciA9IGF3YWl0IHN0YXJ0TG9jYWxPdGxwSHR0cFJlY2VpdmVyKFxuXHRcdFx0e1xuXHRcdFx0XHRvblNwYW5zOiByZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc3BhbiBvZiByZXN1bHQuc3BhbnMpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmluc2VydFNwYW4oc3Bhbik7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbYWdlbnRIb3N0Lm90ZWxdIGZhaWxlZCB0byBpbnNlcnQgc3BhbicsIGVycik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEFsc28gZmVlZCBkZWNvZGVkIHNwYW5zIHRvIGZvcndhcmRlcnMgdGhhdCBjb25zdW1lIElEZWNvZGVSZXN1bHRcblx0XHRcdFx0XHQvLyAoRmlsZUZvcndhcmRlciAvIENvbnNvbGVGb3J3YXJkZXIpLiBPVExQLXN0eWxlIGZvcndhcmRlcnMgY29uc3VtZVxuXHRcdFx0XHRcdC8vIHRoZSByYXcgYm9keSB2aWEgb25Gb3J3YXJkIGJlbG93LlxuXHRcdFx0XHRcdHRoaXMuX2ZvcndhcmRlcj8uZm9yd2FyZFNwYW5zPy4ocmVzdWx0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25Gb3J3YXJkOiB0aGlzLl9mb3J3YXJkZXIgPyAoYm9keSwgY29udGVudFR5cGUpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9mb3J3YXJkZXIhLmZvcndhcmRSYXc/Lihib2R5LCBjb250ZW50VHlwZSk7XG5cdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHQpO1xuXHRcdHRoaXMuX3JlY2VpdmVyID0gcmVjZWl2ZXI7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVjZWl2ZXIpO1xuXHRcdGlmICh0aGlzLl9mb3J3YXJkZXIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZvcndhcmRlcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbYWdlbnRIb3N0Lm90ZWxdIGxvb3BiYWNrIHJlY2VpdmVyIGF0ICR7cmVjZWl2ZXIuYmFzZVVybH0sIGRiICR7dGhpcy5fc3BhbnNEYlBhdGh9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbWl0U2Vzc2lvblRpdGxlU3Bhbihjb252ZXJzYXRpb25JZDogc3RyaW5nLCBzZXNzaW9uVXJpOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fY29uZmlnLmRiU3BhbkV4cG9ydGVyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lbnN1cmVTdGFydGVkKCk7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5fZm9yd2FyZGVyKSB7XG5cdFx0XHR0aGlzLl9mb3J3YXJkZXIgPSB0aGlzLl9idWlsZE91dGJvdW5kRm9yd2FyZGVyKCk7XG5cdFx0XHRpZiAodGhpcy5fZm9yd2FyZGVyKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZvcndhcmRlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCB0cmFjZUlkID0gZ2VuZXJhdGVVdWlkKCkucmVwbGFjZUFsbCgnLScsICcnKTtcblx0XHRjb25zdCBzcGFuOiBJQ29tcGxldGVkU3BhbkRhdGEgPSB7XG5cdFx0XHRuYW1lOiBBZ2VudEhvc3RTZXNzaW9uVGl0bGVTcGFuTmFtZSxcblx0XHRcdHRyYWNlSWQsXG5cdFx0XHRzcGFuSWQ6IGdlbmVyYXRlVXVpZCgpLnJlcGxhY2VBbGwoJy0nLCAnJykuc2xpY2UoMCwgMTYpLFxuXHRcdFx0c3RhcnRUaW1lOiBub3csXG5cdFx0XHRlbmRUaW1lOiBub3csXG5cdFx0XHRzdGF0dXM6IHsgY29kZTogU3BhblN0YXR1c0NvZGUuT0sgfSxcblx0XHRcdGF0dHJpYnV0ZXM6IHtcblx0XHRcdFx0Li4udGhpcy5fY29uZmlnLnJlc291cmNlQXR0cmlidXRlcyxcblx0XHRcdFx0W0dlbkFpQXR0ci5DT05WRVJTQVRJT05fSURdOiBjb252ZXJzYXRpb25JZCxcblx0XHRcdFx0W0FnZW50SG9zdFNlc3Npb25UaXRsZUF0dHJpYnV0ZV06IHRpdGxlLFxuXHRcdFx0XHRbQWdlbnRIb3N0U2Vzc2lvblVyaUF0dHJpYnV0ZV06IHNlc3Npb25VcmksXG5cdFx0XHR9LFxuXHRcdFx0ZXZlbnRzOiBbXSxcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX3NwYW5TdG9yZT8uaW5zZXJ0U3BhbihzcGFuKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW2FnZW50SG9zdC5vdGVsXSBmYWlsZWQgdG8gcGVyc2lzdCBzZXNzaW9uIHRpdGxlIHNwYW4nLCBlcnIpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSB7IHNwYW5zOiBbc3Bhbl0sIHJlamVjdGVkOiAwLCBlcnJvcnM6IFtdIH07XG5cdFx0dGhpcy5fZm9yd2FyZGVyPy5mb3J3YXJkU3BhbnM/LihyZXN1bHQpO1xuXHRcdGlmICh0aGlzLl9jYW5Gb3J3YXJkU3ludGhldGljU3BhbigpKSB7XG5cdFx0XHR0aGlzLl9mb3J3YXJkZXI/LmZvcndhcmRSYXc/Lih0aGlzLl9lbmNvZGVPdGxwU3BhbihzcGFuKSwgJ2FwcGxpY2F0aW9uL2pzb24nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYW5Gb3J3YXJkU3ludGhldGljU3BhbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnLmV4cG9ydGVyVHlwZSA9PT0gJ2ZpbGUnXG5cdFx0XHR8fCB0aGlzLl9jb25maWcuZXhwb3J0ZXJUeXBlID09PSAnY29uc29sZSdcblx0XHRcdHx8ICh0aGlzLl9jb25maWcuZXhwb3J0ZXJUeXBlID09PSAnb3RscC1odHRwJyAmJiB0aGlzLl9jb25maWcub3RscFByb3RvY29sICE9PSAnaHR0cC9wcm90b2J1ZicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5jb2RlT3RscFNwYW4oc3BhbjogSUNvbXBsZXRlZFNwYW5EYXRhKTogQnVmZmVyIHtcblx0XHRjb25zdCByZXNvdXJjZUF0dHJpYnV0ZUtleXMgPSBuZXcgU2V0KE9iamVjdC5rZXlzKHRoaXMuX2NvbmZpZy5yZXNvdXJjZUF0dHJpYnV0ZXMpKTtcblx0XHRjb25zdCBhdHRyaWJ1dGVzID0gT2JqZWN0LmVudHJpZXMoc3Bhbi5hdHRyaWJ1dGVzKVxuXHRcdFx0LmZpbHRlcigoW2tleV0pID0+ICFyZXNvdXJjZUF0dHJpYnV0ZUtleXMuaGFzKGtleSkgfHwga2V5ID09PSBHZW5BaUF0dHIuQ09OVkVSU0FUSU9OX0lEIHx8IGtleS5zdGFydHNXaXRoKCd2c2NvZGUuYWdlbnRfaG9zdC4nKSlcblx0XHRcdC5tYXAoKFtrZXksIHZhbHVlXSkgPT4gKHtcblx0XHRcdFx0a2V5LFxuXHRcdFx0XHR2YWx1ZTogdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHsgc3RyaW5nVmFsdWU6IHZhbHVlIH1cblx0XHRcdFx0XHQ6IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgPyB7IGRvdWJsZVZhbHVlOiB2YWx1ZSB9XG5cdFx0XHRcdFx0XHQ6IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nID8geyBib29sVmFsdWU6IHZhbHVlIH1cblx0XHRcdFx0XHRcdFx0OiB7IGFycmF5VmFsdWU6IHsgdmFsdWVzOiB2YWx1ZS5tYXAoaXRlbSA9PiAoeyBzdHJpbmdWYWx1ZTogaXRlbSB9KSkgfSB9LFxuXHRcdFx0fSkpO1xuXHRcdGNvbnN0IHJlc291cmNlQXR0cmlidXRlcyA9IE9iamVjdC5lbnRyaWVzKHRoaXMuX2NvbmZpZy5yZXNvdXJjZUF0dHJpYnV0ZXMpLm1hcCgoW2tleSwgdmFsdWVdKSA9PiAoeyBrZXksIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiB2YWx1ZSB9IH0pKTtcblx0XHRyZXR1cm4gQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0cmVzb3VyY2VTcGFuczogW3tcblx0XHRcdFx0Li4uKHJlc291cmNlQXR0cmlidXRlcy5sZW5ndGggPyB7IHJlc291cmNlOiB7IGF0dHJpYnV0ZXM6IHJlc291cmNlQXR0cmlidXRlcyB9IH0gOiB7fSksXG5cdFx0XHRcdHNjb3BlU3BhbnM6IFt7XG5cdFx0XHRcdFx0c2NvcGU6IHsgbmFtZTogdGhpcy5fY29uZmlnLnNvdXJjZU5hbWUgPz8gJ3ZzY29kZS5hZ2VudC1ob3N0JyB9LFxuXHRcdFx0XHRcdHNwYW5zOiBbe1xuXHRcdFx0XHRcdFx0dHJhY2VJZDogc3Bhbi50cmFjZUlkLFxuXHRcdFx0XHRcdFx0c3BhbklkOiBzcGFuLnNwYW5JZCxcblx0XHRcdFx0XHRcdG5hbWU6IHNwYW4ubmFtZSxcblx0XHRcdFx0XHRcdGtpbmQ6IDEsXG5cdFx0XHRcdFx0XHRzdGFydFRpbWVVbml4TmFubzogYCR7c3Bhbi5zdGFydFRpbWV9MDAwMDAwYCxcblx0XHRcdFx0XHRcdGVuZFRpbWVVbml4TmFubzogYCR7c3Bhbi5lbmRUaW1lfTAwMDAwMGAsXG5cdFx0XHRcdFx0XHRhdHRyaWJ1dGVzLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiB7IGNvZGU6IDEgfSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9XSxcblx0XHR9KSwgJ3V0ZjgnKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkT3V0Ym91bmRGb3J3YXJkZXIoKTogSU91dGJvdW5kRm9yd2FyZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjaGlsZHJlbjogSU91dGJvdW5kRm9yd2FyZGVyW10gPSBbXTtcblx0XHRzd2l0Y2ggKHRoaXMuX2NvbmZpZy5leHBvcnRlclR5cGUpIHtcblx0XHRcdGNhc2UgJ290bHAtaHR0cCc6XG5cdFx0XHRjYXNlICdvdGxwLWdycGMnOlxuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlnLm90bHBFbmRwb2ludCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2gobmV3IE90bHBIdHRwRm9yd2FyZGVyKFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRlbmRwb2ludDogdGhpcy5fY29uZmlnLm90bHBFbmRwb2ludCxcblx0XHRcdFx0XHRcdFx0aGVhZGVyczogdGhpcy5fY29uZmlnLmhlYWRlcnMsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMuX2ZldGNoRm4sXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdmaWxlJzpcblx0XHRcdFx0aWYgKHRoaXMuX2NvbmZpZy5maWxlUGF0aCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuLnB1c2gobmV3IEZpbGVGb3J3YXJkZXIoeyBmaWxlUGF0aDogdGhpcy5fY29uZmlnLmZpbGVQYXRoIH0sIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2NvbnNvbGUnOlxuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKG5ldyBDb25zb2xlRm9yd2FyZGVyKHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGlmICghY2hpbGRyZW4ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hpbGRyZW4ubGVuZ3RoID09PSAxID8gY2hpbGRyZW5bMF0gOiBuZXcgQ29tcG9zaXRlRm9yd2FyZGVyKGNoaWxkcmVuKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLFlBQVk7QUFFOUIsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBK0Q7QUFDeEU7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FFTTtBQUNQLFNBQVMsaUJBQWlCO0FBQzFCLFNBQTZCLHNCQUFzQjtBQUNuRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGdDQUFnQywrQkFBK0Isb0NBQTJEO0FBR25JLE1BQU0sbUJBQW1CO0FBOEJ6QixTQUFTLFNBQVMsR0FB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
