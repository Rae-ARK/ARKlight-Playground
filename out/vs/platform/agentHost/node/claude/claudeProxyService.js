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
import { once } from "events";
import { Emitter } from "../../../../base/common/event.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import {
  COPILOT_API_ERROR_STATUS_STREAMING,
  CopilotApiError,
  ICopilotApiService
} from "../shared/copilotApiService.js";
import { buildForwardedChatError, encodeForwardedChatError } from "../shared/forwardedChatError.js";
import {
  LoopbackProxyServer,
  readProxyRequestBody
} from "../shared/loopbackProxyServer.js";
import { filterSupportedBetas } from "./anthropicBetas.js";
import {
  buildErrorEnvelope,
  formatSseErrorFrame,
  writeJsonError,
  writeUpstreamJsonError
} from "./anthropicErrors.js";
import { tryParseClaudeModelId } from "./claudeModelId.js";
import { parseProxyBearer } from "./claudeProxyAuth.js";
const IClaudeProxyService = createDecorator("claudeProxyService");
const KNOWN_CLAUDE_VENDORS = /* @__PURE__ */ new Set(["anthropic"]);
const ANTHROPIC_MESSAGES_ENDPOINT = "/v1/messages";
const PROXY_USER_FACING_NAME = "ClaudeProxyService";
const USER_AGENT_PREFIX = "vscode_claude_code";
function readCopilotUsageNanoAiu(event) {
  const value = event?.copilot_usage?.total_nano_aiu;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
let ClaudeProxyService = class extends LoopbackProxyServer {
  constructor(logService, _copilotApiService) {
    super(PROXY_USER_FACING_NAME, logService);
    this._copilotApiService = _copilotApiService;
    this._onDidReportCredits = new Emitter();
    this.onDidReportCredits = this._onDidReportCredits.event;
  }
  createState(githubToken) {
    return { githubToken };
  }
  async start(githubToken) {
    const { runtime, release } = await this.acquire(githubToken);
    runtime.state.githubToken = githubToken;
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      dispose: release
    };
  }
  dispose() {
    super.dispose();
    this._onDidReportCredits.dispose();
  }
  writeInternalError(res) {
    writeJsonError(res, 500, "api_error", "Internal proxy error");
  }
  /**
   * Fire {@link onDidReportCredits} for a completed request. No-op when
   * the request carried no credits (`copilot_usage` absent) or the
   * Bearer token lacked a session id (shouldn't happen post-auth).
   */
  _reportCredits(sessionId, totalNanoAiu) {
    if (sessionId === void 0 || totalNanoAiu === void 0) {
      return;
    }
    this._logService.trace(`[${PROXY_USER_FACING_NAME}] credits: session=${sessionId} totalNanoAiu=${totalNanoAiu}`);
    this._onDidReportCredits.fire({ sessionId, totalNanoAiu });
  }
  // #region Dispatch
  async handleRequest(req, res, runtime) {
    const method = req.method ?? "GET";
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    this._logService.trace(`[${PROXY_USER_FACING_NAME}] ${method} ${pathname}`);
    if (method === "GET" && pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    const auth = parseProxyBearer(req.headers, runtime.nonce);
    if (!auth.valid) {
      writeJsonError(res, 401, "authentication_error", "Invalid authentication");
      return;
    }
    if (method === "GET" && pathname === "/v1/models") {
      await this._handleModels(req, res, runtime);
      return;
    }
    if (method === "POST" && pathname === "/v1/messages") {
      await this._handleMessages(req, res, runtime, auth.sessionId);
      return;
    }
    if (method === "POST" && pathname === "/v1/messages/count_tokens") {
      writeJsonError(res, 501, "api_error", "count_tokens not supported by CAPI");
      return;
    }
    writeJsonError(res, 404, "not_found_error", `No route for ${method} ${pathname}`);
  }
  // #endregion
  // #region GET /v1/models
  async _handleModels(req, res, runtime) {
    const headers = buildOutboundHeaders(req.headers);
    let models;
    try {
      models = await this._copilotApiService.models(runtime.state.githubToken, { headers, suppressIntegrationId: true });
    } catch (err) {
      this._writeUpstreamErrorResponse(res, err);
      return;
    }
    const data = [];
    for (const m of models) {
      if (!isAnthropicMessagesModel(m)) {
        continue;
      }
      const parsed = tryParseClaudeModelId(m.id);
      const sdkId = parsed ? parsed.toSdkModelId() : m.id;
      data.push({
        id: sdkId,
        type: "model",
        display_name: m.name || sdkId,
        created_at: "1970-01-01T00:00:00Z",
        capabilities: null,
        max_input_tokens: null,
        max_tokens: null
      });
    }
    const body = {
      data,
      has_more: false,
      first_id: data.length > 0 ? data[0].id : null,
      last_id: data.length > 0 ? data[data.length - 1].id : null
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
  // #endregion
  // #region POST /v1/messages
  async _handleMessages(req, res, runtime, sessionId) {
    let bodyString;
    try {
      bodyString = await readProxyRequestBody(req);
    } catch (err) {
      writeJsonError(res, 400, "invalid_request_error", `Failed to read request body: ${stringifyError(err)}`);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(bodyString);
    } catch {
      writeJsonError(res, 400, "invalid_request_error", "Request body is not valid JSON");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      writeJsonError(res, 400, "invalid_request_error", "Request body must be a JSON object");
      return;
    }
    const body = parsed;
    const sdkModelId = body.model;
    if (typeof sdkModelId !== "string" || sdkModelId.length === 0) {
      writeJsonError(res, 400, "invalid_request_error", "Missing required field: model");
      return;
    }
    if (!Array.isArray(body.messages)) {
      writeJsonError(res, 400, "invalid_request_error", "Missing required field: messages");
      return;
    }
    const parsedModel = tryParseClaudeModelId(sdkModelId);
    if (!parsedModel) {
      writeJsonError(res, 404, "not_found_error", `Unknown model: ${sdkModelId}`);
      return;
    }
    const endpointModelId = parsedModel.toEndpointModelId();
    body.model = endpointModelId;
    const stream = body.stream === true;
    const headers = buildOutboundHeaders(req.headers);
    const entry = {
      ac: new AbortController(),
      res,
      clientGone: false
    };
    runtime.inFlight.add(entry);
    const onClose = () => {
      entry.clientGone = true;
      entry.ac.abort();
    };
    res.on("close", onClose);
    try {
      if (stream) {
        await this._streamMessages(
          body,
          headers,
          res,
          entry,
          runtime,
          sdkModelId,
          sessionId
        );
      } else {
        await this._sendNonStreamingMessage(
          body,
          headers,
          res,
          entry,
          runtime,
          sdkModelId,
          sessionId
        );
      }
    } finally {
      res.removeListener("close", onClose);
      runtime.inFlight.delete(entry);
    }
  }
  async _sendNonStreamingMessage(body, headers, res, entry, runtime, originalSdkModelId, sessionId) {
    const options = { headers, signal: entry.ac.signal, suppressIntegrationId: true };
    let message;
    try {
      message = await this._copilotApiService.messages(runtime.state.githubToken, body, options);
    } catch (err) {
      if (entry.ac.signal.aborted) {
        if (!entry.clientGone && !res.writableEnded) {
          res.destroy();
        }
        return;
      }
      this._writeUpstreamErrorResponse(res, err, true);
      return;
    }
    this._reportCredits(sessionId, readCopilotUsageNanoAiu(message));
    const outboundModel = rewriteModelToSdk(message.model, this._logService) ?? originalSdkModelId;
    const responseBody = { ...message, model: outboundModel };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(responseBody));
  }
  async _streamMessages(body, headers, res, entry, runtime, _originalSdkModelId, sessionId) {
    const options = { headers, signal: entry.ac.signal, suppressIntegrationId: true };
    let stream;
    try {
      stream = this._copilotApiService.messages(runtime.state.githubToken, body, options);
    } catch (err) {
      if (entry.ac.signal.aborted) {
        if (!entry.clientGone && !res.writableEnded) {
          res.destroy();
        }
        return;
      }
      this._writeUpstreamErrorResponse(res, err, true);
      return;
    }
    let first;
    try {
      first = await stream.next();
    } catch (err) {
      if (entry.ac.signal.aborted) {
        if (!entry.clientGone && !res.writableEnded) {
          res.destroy();
        }
        return;
      }
      this._writeUpstreamErrorResponse(res, err, true);
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.flushHeaders();
    req_setNoDelay(res);
    const writeFrame = async (event) => {
      const transformed = rewriteEventModel(event, this._logService);
      const frame = `event: ${transformed.type}
data: ${JSON.stringify(transformed)}

`;
      const ok = res.write(frame);
      if (!ok) {
        try {
          await once(res, "drain", { signal: entry.ac.signal });
        } catch {
          return false;
        }
      }
      return true;
    };
    let reportedNanoAiu;
    try {
      if (!first.done) {
        reportedNanoAiu = readCopilotUsageNanoAiu(first.value) ?? reportedNanoAiu;
        const ok = await writeFrame(first.value);
        if (!ok) {
          return;
        }
      }
      while (true) {
        let next;
        try {
          next = await stream.next();
        } catch (err) {
          if (entry.ac.signal.aborted) {
            if (!entry.clientGone && !res.writableEnded) {
              res.destroy();
            }
            return;
          }
          const envelope = err instanceof CopilotApiError ? embedForwardedChatError(err) : buildErrorEnvelope("api_error", stringifyError(err));
          if (!res.writableEnded) {
            try {
              res.write(formatSseErrorFrame(envelope));
            } catch {
            }
            try {
              res.end();
            } catch {
            }
          }
          return;
        }
        if (next.done) {
          break;
        }
        reportedNanoAiu = readCopilotUsageNanoAiu(next.value) ?? reportedNanoAiu;
        const ok = await writeFrame(next.value);
        if (!ok) {
          return;
        }
      }
      if (!res.writableEnded) {
        res.end();
      }
      this._reportCredits(sessionId, reportedNanoAiu);
    } catch (err) {
      this._logService.warn(`[${PROXY_USER_FACING_NAME}] stream loop unexpected error: ${stringifyError(err)}`);
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {
        }
      }
    }
  }
  // #endregion
  // #region Error helpers
  /**
   * Writes an upstream error as a JSON response. When `embedChatError` is set
   * (the `/v1/messages` paths), a `VSCODE_PROXY_ERROR` marker is appended to
   * the envelope message so the structured CAPI error round-trips back through
   * the SDK subprocess to the agent host (which decodes it into `_meta` and
   * strips the marker). The `/v1/models` path does not round-trip, so it
   * re-emits the envelope verbatim.
   */
  _writeUpstreamErrorResponse(res, err, embedChatError = false) {
    if (res.headersSent) {
      this._logService.warn(`[${PROXY_USER_FACING_NAME}] cannot write upstream error after headers sent: ${stringifyError(err)}`);
      if (!res.writableEnded) {
        try {
          res.end();
        } catch {
        }
      }
      return;
    }
    if (err instanceof CopilotApiError) {
      const status = err.status === COPILOT_API_ERROR_STATUS_STREAMING ? 502 : err.status;
      writeUpstreamJsonError(res, status, embedChatError ? embedForwardedChatError(err) : err.envelope);
      return;
    }
    writeJsonError(res, 502, "api_error", err instanceof Error ? err.message : String(err));
  }
  // #endregion
};
ClaudeProxyService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService)
], ClaudeProxyService);
function isAnthropicMessagesModel(m) {
  if (!KNOWN_CLAUDE_VENDORS.has(m.vendor.toLowerCase())) {
    return false;
  }
  return Array.isArray(m.supported_endpoints) && m.supported_endpoints.includes(ANTHROPIC_MESSAGES_ENDPOINT);
}
function rewriteModelToSdk(modelId, logService) {
  const parsed = tryParseClaudeModelId(modelId);
  if (!parsed) {
    logService.warn(`[${PROXY_USER_FACING_NAME}] outbound model ID could not be parsed for SDK rewrite: ${modelId}`);
    return void 0;
  }
  return parsed.toSdkModelId();
}
function rewriteEventModel(event, logService) {
  if (event.type !== "message_start") {
    return event;
  }
  const sdkModel = rewriteModelToSdk(event.message.model, logService);
  if (sdkModel === void 0 || sdkModel === event.message.model) {
    return event;
  }
  return {
    ...event,
    message: { ...event.message, model: sdkModel }
  };
}
function buildOutboundHeaders(inbound) {
  const out = {};
  const version = inbound["anthropic-version"];
  if (typeof version === "string" && version.length > 0) {
    out["anthropic-version"] = version;
  }
  const beta = inbound["anthropic-beta"];
  if (typeof beta === "string" && beta.length > 0) {
    const filtered = filterSupportedBetas(beta);
    if (filtered !== void 0) {
      out["anthropic-beta"] = filtered;
    }
  }
  const userAgent = inbound["user-agent"];
  if (typeof userAgent === "string" && userAgent.length > 0) {
    out["User-Agent"] = transformUserAgent(userAgent);
  }
  return out;
}
function transformUserAgent(userAgent) {
  const slashIndex = userAgent.indexOf("/");
  if (slashIndex === -1) {
    return `${USER_AGENT_PREFIX}/${userAgent}`;
  }
  return `${USER_AGENT_PREFIX}${userAgent.substring(slashIndex)}`;
}
function req_setNoDelay(res) {
  const socket = res.socket;
  if (socket && typeof socket.setNoDelay === "function") {
    try {
      socket.setNoDelay(true);
    } catch {
    }
  }
}
function stringifyError(err) {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
function embedForwardedChatError(err) {
  const marker = encodeForwardedChatError(buildForwardedChatError(err));
  return {
    ...err.envelope,
    error: {
      ...err.envelope.error,
      message: `${err.envelope.error.message} ${marker}`
    }
  };
}
export {
  ClaudeProxyService,
  IClaudeProxyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jbGF1ZGVQcm94eVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0IHsgb25jZSB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HLFxuXHRDb3BpbG90QXBpRXJyb3IsXG5cdElDb3BpbG90QXBpU2VydmljZSxcblx0dHlwZSBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcbn0gZnJvbSAnLi4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yLCBlbmNvZGVGb3J3YXJkZWRDaGF0RXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvZm9yd2FyZGVkQ2hhdEVycm9yLmpzJztcbmltcG9ydCB7XG5cdElQcm94eUluRmxpZ2h0LFxuXHRJTG9vcGJhY2tQcm94eUhhbmRsZSxcblx0SUxvb3BiYWNrUHJveHlSdW50aW1lLFxuXHRMb29wYmFja1Byb3h5U2VydmVyLFxuXHRyZWFkUHJveHlSZXF1ZXN0Qm9keSxcbn0gZnJvbSAnLi4vc2hhcmVkL2xvb3BiYWNrUHJveHlTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgZmlsdGVyU3VwcG9ydGVkQmV0YXMgfSBmcm9tICcuL2FudGhyb3BpY0JldGFzLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkRXJyb3JFbnZlbG9wZSxcblx0Zm9ybWF0U3NlRXJyb3JGcmFtZSxcblx0d3JpdGVKc29uRXJyb3IsXG5cdHdyaXRlVXBzdHJlYW1Kc29uRXJyb3IsXG59IGZyb20gJy4vYW50aHJvcGljRXJyb3JzLmpzJztcbmltcG9ydCB7IHRyeVBhcnNlQ2xhdWRlTW9kZWxJZCB9IGZyb20gJy4vY2xhdWRlTW9kZWxJZC5qcyc7XG5pbXBvcnQgeyBwYXJzZVByb3h5QmVhcmVyIH0gZnJvbSAnLi9jbGF1ZGVQcm94eUF1dGguanMnO1xuXG4vLyAjcmVnaW9uIFB1YmxpYyB0eXBlc1xuXG4vKipcbiAqIEhhbmRsZSByZXR1cm5lZCBieSB7QGxpbmsgSUNsYXVkZVByb3h5U2VydmljZS5zdGFydH0uIFJlZmNvdW50cyB0aGVcbiAqIHVuZGVybHlpbmcgc2VydmVyOiB3aGVuIGV2ZXJ5IGhhbmRsZSBpcyBkaXNwb3NlZCwgdGhlIGxpc3RlbmVyIGNsb3NlcyxcbiAqIHRoZSB0b2tlbiBzbG90IGNsZWFycywgYW5kIHRoZSBub25jZSBpcyBkZXN0cm95ZWQuIFRoZSBuZXh0IGBzdGFydCgpYFxuICogY2FsbCByZWJpbmRzIHdpdGggYSBuZXcgcG9ydCBhbmQgYSBmcmVzaCBub25jZS5cbiAqXG4gKiAqKlN1YnByb2Nlc3Mgb3duZXJzaGlwIGludmFyaWFudC4qKiBDYWxsZXJzIHRoYXQgaGFuZCBgYmFzZVVybGAgL1xuICogYG5vbmNlYCB0byBhIENsYXVkZSBTREsgc3VicHJvY2VzcyBNVVNUIGtpbGwgdGhhdCBzdWJwcm9jZXNzIGJlZm9yZVxuICogY2FsbGluZyBgZGlzcG9zZSgpYC4gVGhlIHN1YnByb2Nlc3MgY2Fubm90IG91dGxpdmUgdGhlIGhhbmRsZSBcdTIwMTRcbiAqIGFmdGVyIGBkaXNwb3NlKClgIHRoZSBwcm94eSBtYXkgcmViaW5kIG9uIGEgZGlmZmVyZW50IHBvcnQgYW5kIHRoZVxuICogc3VicHJvY2VzcyB3b3VsZCBzaWxlbnRseSBsb3NlIGl0cyBlbmRwb2ludC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2xhdWRlUHJveHlIYW5kbGUgZXh0ZW5kcyBJTG9vcGJhY2tQcm94eUhhbmRsZSB7XG5cdC8qKiBlLmcuIGBodHRwOi8vMTI3LjAuMC4xOjU0MzIxYCBcdTIwMTQgbm8gdHJhaWxpbmcgc2xhc2guICovXG5cdHJlYWRvbmx5IGJhc2VVcmw6IHN0cmluZztcblx0LyoqIDI1Ni1iaXQgaGV4IHN0cmluZy4gQ29tYmluZSB3aXRoIGEgc2Vzc2lvbiBpZCBhcyBgQmVhcmVyIDxub25jZT4uPHNlc3Npb25JZD5gLiAqL1xuXHRyZWFkb25seSBub25jZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIEhvdyB0aGUgQ2xhdWRlIHByb3ZpZGVyIHJlYWNoZXMgQW50aHJvcGljLCByZXNvbHZlZCBvbmNlIHBlciBzZXNzaW9uIGF0XG4gKiBtYXRlcmlhbGl6ZSB0aW1lIGFuZCB0aHJlYWRlZCBhcyBkYXRhIHRocm91Z2ggYElNYXRlcmlhbGl6ZUNvbnRleHRgIGludG9cbiAqIGBidWlsZE9wdGlvbnNgIC8gYGJ1aWxkU3VicHJvY2Vzc0VudmAuXG4gKlxuICogLSBgcHJveHlgOiBDb3BpbG90LXJvdXRlZCBDbGF1ZGUgKHRoZSBkZWZhdWx0KS4gQWxsIGBtZXNzYWdlc2AgdHJhZmZpYyBnb2VzXG4gKiAgIHRocm91Z2ggdGhlIGxvY2FsIHtAbGluayBJQ2xhdWRlUHJveHlIYW5kbGV9IFx1MjE5MiBDb3BpbG90IENBUEkuXG4gKiAtIGBuYXRpdmVgOiBCWU8tQW50aHJvcGljIChQaGFzZSAxOSkuIFRoZSBTREsgdGFsa3MgdG8gQW50aHJvcGljIGRpcmVjdGx5IG9uXG4gKiAgIHRoZSB1c2VyJ3Mgb3duIGNyZWRlbnRpYWxzIChgQU5USFJPUElDX0FQSV9LRVlgLCBvciBhIHN1YnNjcmlwdGlvbiBPQXV0aFxuICogICB0b2tlbiBpbiBgQ0xBVURFX0NPREVfT0FVVEhfVE9LRU5gIGZyb20gYGNsYXVkZSBzZXR1cC10b2tlbmApOyBubyBwcm94eSBpc1xuICogICBpbnZvbHZlZC4gVGhlIFNESydzIGJ1bmRsZWQgYGNsYXVkZWAgQ0xJIHJ1bnMgdGhlIHR1cm4uXG4gKi9cbmV4cG9ydCB0eXBlIENsYXVkZVRyYW5zcG9ydCA9XG5cdHwgeyByZWFkb25seSBraW5kOiAncHJveHknOyByZWFkb25seSBoYW5kbGU6IElDbGF1ZGVQcm94eUhhbmRsZSB9XG5cdHwgeyByZWFkb25seSBraW5kOiAnbmF0aXZlJyB9O1xuXG4vKipcbiAqIEEgcGVyLXJlcXVlc3QgY3JlZGl0cyByZXBvcnQuIENBUEkgcmV0dXJucyB0aGUgYWN0dWFsIGJpbGxlZCBjcmVkaXRzXG4gKiBmb3IgYSBgL3YxL21lc3NhZ2VzYCByZXF1ZXN0IGFzIGBjb3BpbG90X3VzYWdlLnRvdGFsX25hbm9fYWl1YCBvbiB0aGVcbiAqIEFudGhyb3BpYyBTU0Ugc3RyZWFtLiBUaGUgQ2xhdWRlIFNESyBzdWJwcm9jZXNzIHN0cmlwcyB0aGlzIGZpZWxkIGZyb21cbiAqIGl0cyBgcmVzdWx0YCBtZXNzYWdlLCBzbyB0aGUgcHJveHkgXHUyMDE0IHdoaWNoIHNlZXMgdGhlIHJhdyBDQVBJIHJlc3BvbnNlIFx1MjAxNFxuICogaXMgdGhlIG9ubHkgcGxhY2UgdGhlIHJlYWwgYmlsbGVkIGFtb3VudCBzdXJ2aXZlcy4gYHNlc3Npb25JZGAgaXNcbiAqIGRlY29kZWQgZnJvbSB0aGUgcHJveHkgQmVhcmVyIHRva2VuIChgPG5vbmNlPi48c2Vzc2lvbklkPmApIHNvIGNvbnN1bWVyc1xuICogY2FuIGF0dHJpYnV0ZSBjcmVkaXRzIHRvIHRoZSBvcmlnaW5hdGluZyBzZXNzaW9uL3R1cm4uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNsYXVkZVByb3h5Q3JlZGl0c1JlcG9ydCB7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHQvKiogQmlsbGVkIGNyZWRpdHMgZm9yIHRoZSByZXF1ZXN0LCBpbiBuYW5vLUFJVSAoMSBjcmVkaXQgPSAxZTkgbmFuby1BSVUpLiAqL1xuXHRyZWFkb25seSB0b3RhbE5hbm9BaXU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2xhdWRlUHJveHlTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBGaXJlcyBvbmNlIHBlciBjb21wbGV0ZWQgQ0FQSSBgL3YxL21lc3NhZ2VzYCByZXF1ZXN0IHRoYXQgcmVwb3J0ZWRcblx0ICogYGNvcGlsb3RfdXNhZ2UudG90YWxfbmFub19haXVgLiBDb25zdW1lcnMgYWNjdW11bGF0ZSBwZXIgdHVybiB0b1xuXHQgKiBzdXJmYWNlIHJlYWwgcGVyLXR1cm4gQ29waWxvdCBjcmVkaXRzICh0aGUgU0RLLWNvbXB1dGVkXG5cdCAqIGB0b3RhbF9jb3N0X3VzZGAgaXMgYW4gQW50aHJvcGljLWxpc3QtcHJpY2UgZXN0aW1hdGUsIG5vdCB0aGVcblx0ICogYW1vdW50IENBUEkgYWN0dWFsbHkgYmlsbHMpLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZXBvcnRDcmVkaXRzOiBFdmVudDxJQ2xhdWRlUHJveHlDcmVkaXRzUmVwb3J0PjtcblxuXHQvKipcblx0ICogU3RhcnQgdGhlIHByb3h5IChpZiBub3QgYWxyZWFkeSBydW5uaW5nKSBhbmQgcmV0dXJuIGEgcmVmY291bnRlZFxuXHQgKiBoYW5kbGUuIFRoZSBzdXBwbGllZCBgZ2l0aHViVG9rZW5gIGJlY29tZXMgdGhlIGFjdGl2ZSB0b2tlbiBmb3Jcblx0ICogb3V0Ym91bmQgQ0FQSSByZXF1ZXN0czsgaWYgbXVsdGlwbGUgY2FsbGVycyBob2xkIGhhbmRsZXNcblx0ICogY29uY3VycmVudGx5LCB0aGUgbW9zdCByZWNlbnQgdG9rZW4gd2lucyAoc2luZ2xlLXRlbmFudCBhc3N1bXB0aW9uLFxuXHQgKiBzZWUgcm9hZG1hcCBzZWN0aW9uIDYpLlxuXHQgKi9cblx0c3RhcnQoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8SUNsYXVkZVByb3h5SGFuZGxlPjtcblxuXHQvKipcblx0ICogRm9yY2UtY2xvc2UgdGhlIHByb3h5IHJlZ2FyZGxlc3Mgb2YgcmVmY291bnQgYW5kIGFib3J0IGFueVxuXHQgKiBpbi1mbGlnaHQgcmVxdWVzdHMuIElkZW1wb3RlbnQuIFN1YnNlcXVlbnQgYHN0YXJ0KClgIGNhbGxzIHJlYmluZC5cblx0ICovXG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNvbnN0IElDbGF1ZGVQcm94eVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUNsYXVkZVByb3h5U2VydmljZT4oJ2NsYXVkZVByb3h5U2VydmljZScpO1xuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gSW50ZXJuYWwgc3RhdGVcblxuLyoqIFN1YmNsYXNzLW93bmVkIHBlci1iaW5kIG11dGFibGUgc3RhdGU6IHRoZSBhY3RpdmUgb3V0Ym91bmQgQ0FQSSB0b2tlbi4gKi9cbmludGVyZmFjZSBJQ2xhdWRlUHJveHlTdGF0ZSB7XG5cdGdpdGh1YlRva2VuOiBzdHJpbmc7XG59XG5cbnR5cGUgSUNsYXVkZVByb3h5UnVudGltZSA9IElMb29wYmFja1Byb3h5UnVudGltZTxJQ2xhdWRlUHJveHlTdGF0ZT47XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBJbXBsZW1lbnRhdGlvblxuXG5jb25zdCBLTk9XTl9DTEFVREVfVkVORE9SUyA9IG5ldyBTZXQoWydhbnRocm9waWMnXSk7XG5jb25zdCBBTlRIUk9QSUNfTUVTU0FHRVNfRU5EUE9JTlQgPSAnL3YxL21lc3NhZ2VzJztcbmNvbnN0IFBST1hZX1VTRVJfRkFDSU5HX05BTUUgPSAnQ2xhdWRlUHJveHlTZXJ2aWNlJztcbmNvbnN0IFVTRVJfQUdFTlRfUFJFRklYID0gJ3ZzY29kZV9jbGF1ZGVfY29kZSc7XG5cbi8qKlxuICogQ0FQSSBhdWdtZW50cyB0aGUgQW50aHJvcGljIGAvdjEvbWVzc2FnZXNgIHJlc3BvbnNlIHdpdGggdGhlIHJlcXVlc3Qnc1xuICogYmlsbGVkIGNyZWRpdHMgdW5kZXIgYGNvcGlsb3RfdXNhZ2UudG90YWxfbmFub19haXVgLiBUaGUgcHVibGlzaGVkXG4gKiBBbnRocm9waWMgU0RLIHR5cGVzIGRvbid0IGRlY2xhcmUgaXQsIHNvIG5hcnJvdyB0aHJvdWdoIHRoaXMgc2hhcGVcbiAqIChtaXJyb3JzIGBtZXNzYWdlc0FwaS50c2AgaW4gdGhlIENvcGlsb3QgZXh0ZW5zaW9uKS5cbiAqL1xuaW50ZXJmYWNlIElDb3BpbG90VXNhZ2VFbnZlbG9wZSB7XG5cdHJlYWRvbmx5IGNvcGlsb3RfdXNhZ2U/OiB7IHJlYWRvbmx5IHRvdGFsX25hbm9fYWl1PzogbnVtYmVyIH07XG59XG5cbi8qKlxuICogUmVhZCBgY29waWxvdF91c2FnZS50b3RhbF9uYW5vX2FpdWAgb2ZmIGFuIEFudGhyb3BpYyBzdHJlYW0gZXZlbnQgb3JcbiAqIG1lc3NhZ2UsIHJldHVybmluZyBgdW5kZWZpbmVkYCB1bmxlc3MgaXQgaXMgYSBmaW5pdGUsIG5vbi1uZWdhdGl2ZVxuICogbnVtYmVyLlxuICovXG5mdW5jdGlvbiByZWFkQ29waWxvdFVzYWdlTmFub0FpdShldmVudDogdW5rbm93bik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHZhbHVlID0gKGV2ZW50IGFzIElDb3BpbG90VXNhZ2VFbnZlbG9wZSB8IHVuZGVmaW5lZCk/LmNvcGlsb3RfdXNhZ2U/LnRvdGFsX25hbm9fYWl1O1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpICYmIHZhbHVlID49IDAgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBMb2NhbCBIVFRQIHByb3h5IHRoYXQgc3BlYWtzIHRoZSBBbnRocm9waWMgTWVzc2FnZXMgQVBJIG9uIHRoZSBpbmJvdW5kXG4gKiBzaWRlIGFuZCB7QGxpbmsgSUNvcGlsb3RBcGlTZXJ2aWNlfSBvbiB0aGUgb3V0Ym91bmQgc2lkZS4gVGhlIENsYXVkZVxuICogQWdlbnQgU0RLIGNvbm5lY3RzIHZpYSBgQU5USFJPUElDX0JBU0VfVVJMYCArIGBBTlRIUk9QSUNfQVVUSF9UT0tFTmBcbiAqIGFuZCBzZWVzIHRoaXMgYXMgYSByZWFsIEFudGhyb3BpYyBlbmRwb2ludC5cbiAqXG4gKiBMaWZlY3ljbGUgaXMgcmVmY291bnRlZCB2aWEge0BsaW5rIElDbGF1ZGVQcm94eUhhbmRsZX07IHNlZVxuICoge0BsaW5rIElDbGF1ZGVQcm94eVNlcnZpY2Uuc3RhcnR9IGFuZCB0aGUgc3VicHJvY2Vzcy1vd25lcnNoaXBcbiAqIGludmFyaWFudCBvbiBgSUNsYXVkZVByb3h5SGFuZGxlYC5cbiAqL1xuZXhwb3J0IGNsYXNzIENsYXVkZVByb3h5U2VydmljZSBleHRlbmRzIExvb3BiYWNrUHJveHlTZXJ2ZXI8SUNsYXVkZVByb3h5U3RhdGUsIHN0cmluZz4gaW1wbGVtZW50cyBJQ2xhdWRlUHJveHlTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcG9ydENyZWRpdHMgPSBuZXcgRW1pdHRlcjxJQ2xhdWRlUHJveHlDcmVkaXRzUmVwb3J0PigpO1xuXHRyZWFkb25seSBvbkRpZFJlcG9ydENyZWRpdHM6IEV2ZW50PElDbGF1ZGVQcm94eUNyZWRpdHNSZXBvcnQ+ID0gdGhpcy5fb25EaWRSZXBvcnRDcmVkaXRzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvcGlsb3RBcGlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvcGlsb3RBcGlTZXJ2aWNlOiBJQ29waWxvdEFwaVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFBST1hZX1VTRVJfRkFDSU5HX05BTUUsIGxvZ1NlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVN0YXRlKGdpdGh1YlRva2VuOiBzdHJpbmcpOiBJQ2xhdWRlUHJveHlTdGF0ZSB7XG5cdFx0cmV0dXJuIHsgZ2l0aHViVG9rZW4gfTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElDbGF1ZGVQcm94eUhhbmRsZT4ge1xuXHRcdGNvbnN0IHsgcnVudGltZSwgcmVsZWFzZSB9ID0gYXdhaXQgdGhpcy5hY3F1aXJlKGdpdGh1YlRva2VuKTtcblx0XHQvLyBMYXRlLWJpbmRpbmcgdG9rZW4gdXBkYXRlIGNvdmVycyB0aGUgY2FzZSB3aGVyZSBtdWx0aXBsZVxuXHRcdC8vIGNvbmN1cnJlbnQgY2FsbGVycyBhd2FpdGVkIHRoZSBzYW1lIGJpbmQgXHUyMDE0IGxhc3QgY2FsbGVyJ3MgdG9rZW5cblx0XHQvLyB3aW5zLCBtYXRjaGluZyB0aGUgc2luZ2xlLXRlbmFudCBjb250cmFjdC5cblx0XHRydW50aW1lLnN0YXRlLmdpdGh1YlRva2VuID0gZ2l0aHViVG9rZW47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJhc2VVcmw6IHJ1bnRpbWUuYmFzZVVybCxcblx0XHRcdG5vbmNlOiBydW50aW1lLm5vbmNlLFxuXHRcdFx0ZGlzcG9zZTogcmVsZWFzZSxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSZXBvcnRDcmVkaXRzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB3cml0ZUludGVybmFsRXJyb3IocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0d3JpdGVKc29uRXJyb3IocmVzLCA1MDAsICdhcGlfZXJyb3InLCAnSW50ZXJuYWwgcHJveHkgZXJyb3InKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlIHtAbGluayBvbkRpZFJlcG9ydENyZWRpdHN9IGZvciBhIGNvbXBsZXRlZCByZXF1ZXN0LiBOby1vcCB3aGVuXG5cdCAqIHRoZSByZXF1ZXN0IGNhcnJpZWQgbm8gY3JlZGl0cyAoYGNvcGlsb3RfdXNhZ2VgIGFic2VudCkgb3IgdGhlXG5cdCAqIEJlYXJlciB0b2tlbiBsYWNrZWQgYSBzZXNzaW9uIGlkIChzaG91bGRuJ3QgaGFwcGVuIHBvc3QtYXV0aCkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXBvcnRDcmVkaXRzKHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b3RhbE5hbm9BaXU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChzZXNzaW9uSWQgPT09IHVuZGVmaW5lZCB8fCB0b3RhbE5hbm9BaXUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gY3JlZGl0czogc2Vzc2lvbj0ke3Nlc3Npb25JZH0gdG90YWxOYW5vQWl1PSR7dG90YWxOYW5vQWl1fWApO1xuXHRcdHRoaXMuX29uRGlkUmVwb3J0Q3JlZGl0cy5maXJlKHsgc2Vzc2lvbklkLCB0b3RhbE5hbm9BaXUgfSk7XG5cdH1cblxuXHQvLyAjcmVnaW9uIERpc3BhdGNoXG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGhhbmRsZVJlcXVlc3QoXG5cdFx0cmVxOiBodHRwLkluY29taW5nTWVzc2FnZSxcblx0XHRyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsXG5cdFx0cnVudGltZTogSUNsYXVkZVByb3h5UnVudGltZSxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWV0aG9kID0gcmVxLm1ldGhvZCA/PyAnR0VUJztcblx0XHRjb25zdCBwYXRobmFtZSA9IG5ldyBVUkwocmVxLnVybCA/PyAnLycsICdodHRwOi8vMTI3LjAuMC4xJykucGF0aG5hbWU7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dICR7bWV0aG9kfSAke3BhdGhuYW1lfWApO1xuXG5cdFx0Ly8gSGVhbHRoIGNoZWNrIGlzIHRoZSBvbmx5IHVuYXV0aGVudGljYXRlZCByb3V0ZS5cblx0XHRpZiAobWV0aG9kID09PSAnR0VUJyAmJiBwYXRobmFtZSA9PT0gJy8nKSB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuXHRcdFx0cmVzLmVuZCgnb2snKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdXRoID0gcGFyc2VQcm94eUJlYXJlcihyZXEuaGVhZGVycywgcnVudGltZS5ub25jZSk7XG5cdFx0aWYgKCFhdXRoLnZhbGlkKSB7XG5cdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDQwMSwgJ2F1dGhlbnRpY2F0aW9uX2Vycm9yJywgJ0ludmFsaWQgYXV0aGVudGljYXRpb24nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobWV0aG9kID09PSAnR0VUJyAmJiBwYXRobmFtZSA9PT0gJy92MS9tb2RlbHMnKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9oYW5kbGVNb2RlbHMocmVxLCByZXMsIHJ1bnRpbWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtZXRob2QgPT09ICdQT1NUJyAmJiBwYXRobmFtZSA9PT0gJy92MS9tZXNzYWdlcycpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZU1lc3NhZ2VzKHJlcSwgcmVzLCBydW50aW1lLCBhdXRoLnNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1ldGhvZCA9PT0gJ1BPU1QnICYmIHBhdGhuYW1lID09PSAnL3YxL21lc3NhZ2VzL2NvdW50X3Rva2VucycpIHtcblx0XHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNTAxLCAnYXBpX2Vycm9yJywgJ2NvdW50X3Rva2VucyBub3Qgc3VwcG9ydGVkIGJ5IENBUEknKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDQwNCwgJ25vdF9mb3VuZF9lcnJvcicsIGBObyByb3V0ZSBmb3IgJHttZXRob2R9ICR7cGF0aG5hbWV9YCk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBHRVQgL3YxL21vZGVsc1xuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZU1vZGVscyhyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIHJ1bnRpbWU6IElDbGF1ZGVQcm94eVJ1bnRpbWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoZWFkZXJzID0gYnVpbGRPdXRib3VuZEhlYWRlcnMocmVxLmhlYWRlcnMpO1xuXHRcdGxldCBtb2RlbHM6IENDQU1vZGVsW107XG5cdFx0dHJ5IHtcblx0XHRcdG1vZGVscyA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLm1vZGVscyhydW50aW1lLnN0YXRlLmdpdGh1YlRva2VuLCB7IGhlYWRlcnMsIHN1cHByZXNzSW50ZWdyYXRpb25JZDogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3dyaXRlVXBzdHJlYW1FcnJvclJlc3BvbnNlKHJlcywgZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhOiBBbnRocm9waWMuTW9kZWxJbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG0gb2YgbW9kZWxzKSB7XG5cdFx0XHRpZiAoIWlzQW50aHJvcGljTWVzc2FnZXNNb2RlbChtKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnNlZCA9IHRyeVBhcnNlQ2xhdWRlTW9kZWxJZChtLmlkKTtcblx0XHRcdGNvbnN0IHNka0lkID0gcGFyc2VkID8gcGFyc2VkLnRvU2RrTW9kZWxJZCgpIDogbS5pZDtcblx0XHRcdGRhdGEucHVzaCh7XG5cdFx0XHRcdGlkOiBzZGtJZCxcblx0XHRcdFx0dHlwZTogJ21vZGVsJyxcblx0XHRcdFx0ZGlzcGxheV9uYW1lOiBtLm5hbWUgfHwgc2RrSWQsXG5cdFx0XHRcdGNyZWF0ZWRfYXQ6ICcxOTcwLTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogbnVsbCxcblx0XHRcdFx0bWF4X2lucHV0X3Rva2VuczogbnVsbCxcblx0XHRcdFx0bWF4X3Rva2VuczogbnVsbCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJvZHkgPSB7XG5cdFx0XHRkYXRhLFxuXHRcdFx0aGFzX21vcmU6IGZhbHNlLFxuXHRcdFx0Zmlyc3RfaWQ6IGRhdGEubGVuZ3RoID4gMCA/IGRhdGFbMF0uaWQgOiBudWxsLFxuXHRcdFx0bGFzdF9pZDogZGF0YS5sZW5ndGggPiAwID8gZGF0YVtkYXRhLmxlbmd0aCAtIDFdLmlkIDogbnVsbCxcblx0XHR9O1xuXHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG5cdFx0cmVzLmVuZChKU09OLnN0cmluZ2lmeShib2R5KSk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBQT1NUIC92MS9tZXNzYWdlc1xuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZU1lc3NhZ2VzKFxuXHRcdHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsXG5cdFx0cmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLFxuXHRcdHJ1bnRpbWU6IElDbGF1ZGVQcm94eVJ1bnRpbWUsXG5cdFx0c2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBib2R5U3RyaW5nOiBzdHJpbmc7XG5cdFx0dHJ5IHtcblx0XHRcdGJvZHlTdHJpbmcgPSBhd2FpdCByZWFkUHJveHlSZXF1ZXN0Qm9keShyZXEpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDAsICdpbnZhbGlkX3JlcXVlc3RfZXJyb3InLCBgRmFpbGVkIHRvIHJlYWQgcmVxdWVzdCBib2R5OiAke3N0cmluZ2lmeUVycm9yKGVycil9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHBhcnNlZDogdW5rbm93bjtcblx0XHR0cnkge1xuXHRcdFx0cGFyc2VkID0gSlNPTi5wYXJzZShib2R5U3RyaW5nKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNDAwLCAnaW52YWxpZF9yZXF1ZXN0X2Vycm9yJywgJ1JlcXVlc3QgYm9keSBpcyBub3QgdmFsaWQgSlNPTicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDAsICdpbnZhbGlkX3JlcXVlc3RfZXJyb3InLCAnUmVxdWVzdCBib2R5IG11c3QgYmUgYSBKU09OIG9iamVjdCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJvZHkgPSBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0Y29uc3Qgc2RrTW9kZWxJZCA9IGJvZHkubW9kZWw7XG5cdFx0aWYgKHR5cGVvZiBzZGtNb2RlbElkICE9PSAnc3RyaW5nJyB8fCBzZGtNb2RlbElkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDAsICdpbnZhbGlkX3JlcXVlc3RfZXJyb3InLCAnTWlzc2luZyByZXF1aXJlZCBmaWVsZDogbW9kZWwnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGJvZHkubWVzc2FnZXMpKSB7XG5cdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDQwMCwgJ2ludmFsaWRfcmVxdWVzdF9lcnJvcicsICdNaXNzaW5nIHJlcXVpcmVkIGZpZWxkOiBtZXNzYWdlcycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlZE1vZGVsID0gdHJ5UGFyc2VDbGF1ZGVNb2RlbElkKHNka01vZGVsSWQpO1xuXHRcdGlmICghcGFyc2VkTW9kZWwpIHtcblx0XHRcdHdyaXRlSnNvbkVycm9yKHJlcywgNDA0LCAnbm90X2ZvdW5kX2Vycm9yJywgYFVua25vd24gbW9kZWw6ICR7c2RrTW9kZWxJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhlIFNESy9DTEkgc2VuZHMgdGhlIG1vZGVsIGluIFNESyBmb3JtYXQgKGRhc2hlZCwgYGNsYXVkZS1oYWlrdS00LTVgKTtcblx0XHQvLyBDQVBJJ3MgYC92MS9tZXNzYWdlc2AgZXhwZWN0cyB0aGUgZW5kcG9pbnQgZm9ybWF0IChkb3R0ZWQsXG5cdFx0Ly8gYGNsYXVkZS1oYWlrdS00LjVgKS4gUmV3cml0ZSBvbiB0aGUgd2F5IG91dC5cblx0XHRjb25zdCBlbmRwb2ludE1vZGVsSWQgPSBwYXJzZWRNb2RlbC50b0VuZHBvaW50TW9kZWxJZCgpO1xuXHRcdGJvZHkubW9kZWwgPSBlbmRwb2ludE1vZGVsSWQ7XG5cblx0XHRjb25zdCBzdHJlYW0gPSBib2R5LnN0cmVhbSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBoZWFkZXJzID0gYnVpbGRPdXRib3VuZEhlYWRlcnMocmVxLmhlYWRlcnMpO1xuXG5cdFx0Y29uc3QgZW50cnk6IElQcm94eUluRmxpZ2h0ID0ge1xuXHRcdFx0YWM6IG5ldyBBYm9ydENvbnRyb2xsZXIoKSxcblx0XHRcdHJlcyxcblx0XHRcdGNsaWVudEdvbmU6IGZhbHNlLFxuXHRcdH07XG5cdFx0cnVudGltZS5pbkZsaWdodC5hZGQoZW50cnkpO1xuXHRcdGNvbnN0IG9uQ2xvc2UgPSAoKSA9PiB7XG5cdFx0XHRlbnRyeS5jbGllbnRHb25lID0gdHJ1ZTtcblx0XHRcdGVudHJ5LmFjLmFib3J0KCk7XG5cdFx0fTtcblx0XHRyZXMub24oJ2Nsb3NlJywgb25DbG9zZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKHN0cmVhbSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zdHJlYW1NZXNzYWdlcyhcblx0XHRcdFx0XHRib2R5IGFzIHVua25vd24gYXMgQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNTdHJlYW1pbmcsXG5cdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0XHRyZXMsXG5cdFx0XHRcdFx0ZW50cnksXG5cdFx0XHRcdFx0cnVudGltZSxcblx0XHRcdFx0XHRzZGtNb2RlbElkLFxuXHRcdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3NlbmROb25TdHJlYW1pbmdNZXNzYWdlKFxuXHRcdFx0XHRcdGJvZHkgYXMgdW5rbm93biBhcyBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc05vblN0cmVhbWluZyxcblx0XHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRcdHJlcyxcblx0XHRcdFx0XHRlbnRyeSxcblx0XHRcdFx0XHRydW50aW1lLFxuXHRcdFx0XHRcdHNka01vZGVsSWQsXG5cdFx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXMucmVtb3ZlTGlzdGVuZXIoJ2Nsb3NlJywgb25DbG9zZSk7XG5cdFx0XHRydW50aW1lLmluRmxpZ2h0LmRlbGV0ZShlbnRyeSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZE5vblN0cmVhbWluZ01lc3NhZ2UoXG5cdFx0Ym9keTogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsXG5cdFx0aGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPixcblx0XHRyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsXG5cdFx0ZW50cnk6IElQcm94eUluRmxpZ2h0LFxuXHRcdHJ1bnRpbWU6IElDbGF1ZGVQcm94eVJ1bnRpbWUsXG5cdFx0b3JpZ2luYWxTZGtNb2RlbElkOiBzdHJpbmcsXG5cdFx0c2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wdGlvbnM6IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zID0geyBoZWFkZXJzLCBzaWduYWw6IGVudHJ5LmFjLnNpZ25hbCwgc3VwcHJlc3NJbnRlZ3JhdGlvbklkOiB0cnVlIH07XG5cdFx0bGV0IG1lc3NhZ2U6IEFudGhyb3BpYy5NZXNzYWdlO1xuXHRcdHRyeSB7XG5cdFx0XHRtZXNzYWdlID0gYXdhaXQgdGhpcy5fY29waWxvdEFwaVNlcnZpY2UubWVzc2FnZXMocnVudGltZS5zdGF0ZS5naXRodWJUb2tlbiwgYm9keSwgb3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZW50cnkuYWMuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdFx0aWYgKCFlbnRyeS5jbGllbnRHb25lICYmICFyZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdFx0XHRcdHJlcy5kZXN0cm95KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fd3JpdGVVcHN0cmVhbUVycm9yUmVzcG9uc2UocmVzLCBlcnIsIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcG9ydENyZWRpdHMoc2Vzc2lvbklkLCByZWFkQ29waWxvdFVzYWdlTmFub0FpdShtZXNzYWdlKSk7XG5cblx0XHQvLyBSZXdyaXRlIG91dGJvdW5kIGBtb2RlbGAgdG8gU0RLIGZvcm1hdC4gRmFpbHVyZSB0byByZS1wYXJzZVxuXHRcdC8vIHNob3VsZG4ndCBub3JtYWxseSBoYXBwZW4gYmVjYXVzZSB3ZSBqdXN0IHRyYW5zbGF0ZWQgaXQgb25cblx0XHQvLyB0aGUgd2F5IGluLCBidXQgbG9nICsgcGFzc3Rocm91Z2ggcmF0aGVyIHRoYW4gZHJvcHBpbmcuXG5cdFx0Y29uc3Qgb3V0Ym91bmRNb2RlbCA9IHJld3JpdGVNb2RlbFRvU2RrKG1lc3NhZ2UubW9kZWwsIHRoaXMuX2xvZ1NlcnZpY2UpID8/IG9yaWdpbmFsU2RrTW9kZWxJZDtcblx0XHRjb25zdCByZXNwb25zZUJvZHk6IEFudGhyb3BpYy5NZXNzYWdlID0geyAuLi5tZXNzYWdlLCBtb2RlbDogb3V0Ym91bmRNb2RlbCB9O1xuXG5cdFx0cmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcblx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlQm9keSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RyZWFtTWVzc2FnZXMoXG5cdFx0Ym9keTogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNTdHJlYW1pbmcsXG5cdFx0aGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPixcblx0XHRyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsXG5cdFx0ZW50cnk6IElQcm94eUluRmxpZ2h0LFxuXHRcdHJ1bnRpbWU6IElDbGF1ZGVQcm94eVJ1bnRpbWUsXG5cdFx0X29yaWdpbmFsU2RrTW9kZWxJZDogc3RyaW5nLFxuXHRcdHNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcHRpb25zOiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyA9IHsgaGVhZGVycywgc2lnbmFsOiBlbnRyeS5hYy5zaWduYWwsIHN1cHByZXNzSW50ZWdyYXRpb25JZDogdHJ1ZSB9O1xuXHRcdGxldCBzdHJlYW06IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+O1xuXHRcdHRyeSB7XG5cdFx0XHRzdHJlYW0gPSB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5tZXNzYWdlcyhydW50aW1lLnN0YXRlLmdpdGh1YlRva2VuLCBib2R5LCBvcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFN5bmNocm9ub3VzIHRocm93cyBmcm9tIHRoZSBnZW5lcmF0b3IgZmFjdG9yeSAocmFyZSBcdTIwMTRcblx0XHRcdC8vIENBUEkgZXJyb3JzIGNvbWUgZnJvbSB0aGUgZmlyc3QgaXRlcmF0aW9uKS5cblx0XHRcdGlmIChlbnRyeS5hYy5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRpZiAoIWVudHJ5LmNsaWVudEdvbmUgJiYgIXJlcy53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdFx0cmVzLmRlc3Ryb3koKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93cml0ZVVwc3RyZWFtRXJyb3JSZXNwb25zZShyZXMsIGVyciwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUHVsbCB0aGUgZmlyc3QgZXZlbnQgYmVmb3JlIGNvbW1pdHRpbmcgdG8gYSAyMDAgcmVzcG9uc2Ugc29cblx0XHQvLyB3ZSBjYW4gc3VyZmFjZSBhIHByZS1zdHJlYW0gZXJyb3IgYXMgYSByZWd1bGFyIEpTT04gZXJyb3IuXG5cdFx0bGV0IGZpcnN0OiBJdGVyYXRvclJlc3VsdDxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50Pjtcblx0XHR0cnkge1xuXHRcdFx0Zmlyc3QgPSBhd2FpdCBzdHJlYW0ubmV4dCgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVudHJ5LmFjLnNpZ25hbC5hYm9ydGVkKSB7XG5cdFx0XHRcdGlmICghZW50cnkuY2xpZW50R29uZSAmJiAhcmVzLndyaXRhYmxlRW5kZWQpIHtcblx0XHRcdFx0XHRyZXMuZGVzdHJveSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3dyaXRlVXBzdHJlYW1FcnJvclJlc3BvbnNlKHJlcywgZXJyLCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb21taXQgdG8gc3RyZWFtaW5nIHJlc3BvbnNlIG5vdy5cblx0XHRyZXMud3JpdGVIZWFkKDIwMCwge1xuXHRcdFx0J0NvbnRlbnQtVHlwZSc6ICd0ZXh0L2V2ZW50LXN0cmVhbScsXG5cdFx0XHQnQ2FjaGUtQ29udHJvbCc6ICduby1jYWNoZScsXG5cdFx0XHQnQ29ubmVjdGlvbic6ICdrZWVwLWFsaXZlJyxcblx0XHR9KTtcblx0XHRyZXMuZmx1c2hIZWFkZXJzKCk7XG5cdFx0cmVxX3NldE5vRGVsYXkocmVzKTtcblxuXHRcdGNvbnN0IHdyaXRlRnJhbWUgPSBhc3luYyAoZXZlbnQ6IEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybWVkID0gcmV3cml0ZUV2ZW50TW9kZWwoZXZlbnQsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZnJhbWUgPSBgZXZlbnQ6ICR7dHJhbnNmb3JtZWQudHlwZX1cXG5kYXRhOiAke0pTT04uc3RyaW5naWZ5KHRyYW5zZm9ybWVkKX1cXG5cXG5gO1xuXHRcdFx0Y29uc3Qgb2sgPSByZXMud3JpdGUoZnJhbWUpO1xuXHRcdFx0aWYgKCFvaykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IG9uY2UocmVzLCAnZHJhaW4nLCB7IHNpZ25hbDogZW50cnkuYWMuc2lnbmFsIH0pO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBzaWduYWwgYWJvcnRlZCB3aGlsZSB3YWl0aW5nIG9uIGRyYWluIFx1MjAxNCBiYWlsIG91dFxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblxuXHRcdC8vIFRyYWNrcyB0aGUgbGF0ZXN0IGBjb3BpbG90X3VzYWdlLnRvdGFsX25hbm9fYWl1YCBzZWVuIG9uIHRoZVxuXHRcdC8vIHN0cmVhbTsgQ0FQSSBzZW5kcyB0aGUgcmVxdWVzdCdzIHJ1bm5pbmcgdG90YWwgb24gYG1lc3NhZ2VfZGVsdGFgXG5cdFx0Ly8gKGFzc2lnbi1sYXN0LXdpbnMpLiBSZXBvcnRlZCBvbmNlIG9uIGNsZWFuIHN0cmVhbSBlbmQuXG5cdFx0bGV0IHJlcG9ydGVkTmFub0FpdTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmICghZmlyc3QuZG9uZSkge1xuXHRcdFx0XHRyZXBvcnRlZE5hbm9BaXUgPSByZWFkQ29waWxvdFVzYWdlTmFub0FpdShmaXJzdC52YWx1ZSkgPz8gcmVwb3J0ZWROYW5vQWl1O1xuXHRcdFx0XHRjb25zdCBvayA9IGF3YWl0IHdyaXRlRnJhbWUoZmlyc3QudmFsdWUpO1xuXHRcdFx0XHRpZiAoIW9rKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRsZXQgbmV4dDogSXRlcmF0b3JSZXN1bHQ8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bmV4dCA9IGF3YWl0IHN0cmVhbS5uZXh0KCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGlmIChlbnRyeS5hYy5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHRcdFx0aWYgKCFlbnRyeS5jbGllbnRHb25lICYmICFyZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXMuZGVzdHJveSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBNaWQtc3RyZWFtIGVycm9yOiBlbWl0IEFudGhyb3BpYyBTU0UgZXJyb3IgZnJhbWUsIHRoZW4gZW5kLlxuXHRcdFx0XHRcdGNvbnN0IGVudmVsb3BlID0gZXJyIGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yXG5cdFx0XHRcdFx0XHQ/IGVtYmVkRm9yd2FyZGVkQ2hhdEVycm9yKGVycilcblx0XHRcdFx0XHRcdDogYnVpbGRFcnJvckVudmVsb3BlKCdhcGlfZXJyb3InLCBzdHJpbmdpZnlFcnJvcihlcnIpKTtcblx0XHRcdFx0XHRpZiAoIXJlcy53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRyZXMud3JpdGUoZm9ybWF0U3NlRXJyb3JGcmFtZShlbnZlbG9wZSkpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCB7IC8qIHNvY2tldCBtYXkgaGF2ZSBkaWVkICovIH1cblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG5leHQuZG9uZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlcG9ydGVkTmFub0FpdSA9IHJlYWRDb3BpbG90VXNhZ2VOYW5vQWl1KG5leHQudmFsdWUpID8/IHJlcG9ydGVkTmFub0FpdTtcblx0XHRcdFx0Y29uc3Qgb2sgPSBhd2FpdCB3cml0ZUZyYW1lKG5leHQudmFsdWUpO1xuXHRcdFx0XHRpZiAoIW9rKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlcy53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdH1cblx0XHRcdC8vIENBUEkgcmVwb3J0cyB0aGUgcmVxdWVzdCdzIGJpbGxlZCBjcmVkaXRzIGFzIHRoZSBsYXN0XG5cdFx0XHQvLyBgY29waWxvdF91c2FnZS50b3RhbF9uYW5vX2FpdWAgc2VlbiBvbiB0aGUgc3RyZWFtXG5cdFx0XHQvLyAoYXNzaWduLWxhc3Qtd2lucywgbWF0Y2hpbmcgdGhlIENvcGlsb3QgbWVzc2FnZXMgY2xpZW50KS5cblx0XHRcdC8vIEZpcmUgb25seSBhZnRlciBhIGNsZWFuIGVuZCBzbyB3ZSBuZXZlciBhdHRyaWJ1dGUgY3JlZGl0c1xuXHRcdFx0Ly8gZm9yIGEgcmVxdWVzdCB0aGUgY2xpZW50IGFiYW5kb25lZCBtaWQtc3RyZWFtLlxuXHRcdFx0dGhpcy5fcmVwb3J0Q3JlZGl0cyhzZXNzaW9uSWQsIHJlcG9ydGVkTmFub0FpdSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBEZWZlbnNlIGluIGRlcHRoIFx1MjAxNCBzaG91bGQgbm90IGJlIHJlYWNoZWQuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSBzdHJlYW0gbG9vcCB1bmV4cGVjdGVkIGVycm9yOiAke3N0cmluZ2lmeUVycm9yKGVycil9YCk7XG5cdFx0XHRpZiAoIXJlcy53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdHRyeSB7IHJlcy5lbmQoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gRXJyb3IgaGVscGVyc1xuXG5cdC8qKlxuXHQgKiBXcml0ZXMgYW4gdXBzdHJlYW0gZXJyb3IgYXMgYSBKU09OIHJlc3BvbnNlLiBXaGVuIGBlbWJlZENoYXRFcnJvcmAgaXMgc2V0XG5cdCAqICh0aGUgYC92MS9tZXNzYWdlc2AgcGF0aHMpLCBhIGBWU0NPREVfUFJPWFlfRVJST1JgIG1hcmtlciBpcyBhcHBlbmRlZCB0b1xuXHQgKiB0aGUgZW52ZWxvcGUgbWVzc2FnZSBzbyB0aGUgc3RydWN0dXJlZCBDQVBJIGVycm9yIHJvdW5kLXRyaXBzIGJhY2sgdGhyb3VnaFxuXHQgKiB0aGUgU0RLIHN1YnByb2Nlc3MgdG8gdGhlIGFnZW50IGhvc3QgKHdoaWNoIGRlY29kZXMgaXQgaW50byBgX21ldGFgIGFuZFxuXHQgKiBzdHJpcHMgdGhlIG1hcmtlcikuIFRoZSBgL3YxL21vZGVsc2AgcGF0aCBkb2VzIG5vdCByb3VuZC10cmlwLCBzbyBpdFxuXHQgKiByZS1lbWl0cyB0aGUgZW52ZWxvcGUgdmVyYmF0aW0uXG5cdCAqL1xuXHRwcml2YXRlIF93cml0ZVVwc3RyZWFtRXJyb3JSZXNwb25zZShyZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UsIGVycjogdW5rbm93biwgZW1iZWRDaGF0RXJyb3IgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmIChyZXMuaGVhZGVyc1NlbnQpIHtcblx0XHRcdC8vIEhlYWRlcnMgYXJlIGFscmVhZHkgc2VudCBcdTIwMTQgY2FsbGVyIHNob3VsZCBoYXZlIHJvdXRlZCB0b1xuXHRcdFx0Ly8gdGhlIFNTRSBlcnJvciBwYXRoLiBUaGlzIGlzIGEgZGVmZW5zaXZlIGxvZy5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIGNhbm5vdCB3cml0ZSB1cHN0cmVhbSBlcnJvciBhZnRlciBoZWFkZXJzIHNlbnQ6ICR7c3RyaW5naWZ5RXJyb3IoZXJyKX1gKTtcblx0XHRcdGlmICghcmVzLndyaXRhYmxlRW5kZWQpIHtcblx0XHRcdFx0dHJ5IHsgcmVzLmVuZCgpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIENvcGlsb3RBcGlFcnJvcikge1xuXHRcdFx0Ly8gTWlkLXN0cmVhbSBzZW50aW5lbCBkb2Vzbid0IG1hcCB0byBhIG1lYW5pbmdmdWwgSFRUUFxuXHRcdFx0Ly8gc3RhdHVzIGJlZm9yZSBoZWFkZXJzIGFyZSBzZW50LiBDb2VyY2UgdG8gNTAyIHNvIHdlXG5cdFx0XHQvLyBkb24ndCBzaGlwIGEgNTIwIHdpdGggYSBKU09OIGJvZHkgdGhhdCB2aW9sYXRlcyBIVFRQXG5cdFx0XHQvLyBzZW1hbnRpY3MgZm9yIHRoZSBjb25zdW1lci5cblx0XHRcdGNvbnN0IHN0YXR1cyA9IGVyci5zdGF0dXMgPT09IENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkcgPyA1MDIgOiBlcnIuc3RhdHVzO1xuXHRcdFx0d3JpdGVVcHN0cmVhbUpzb25FcnJvcihyZXMsIHN0YXR1cywgZW1iZWRDaGF0RXJyb3IgPyBlbWJlZEZvcndhcmRlZENoYXRFcnJvcihlcnIpIDogZXJyLmVudmVsb3BlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d3JpdGVKc29uRXJyb3IocmVzLCA1MDIsICdhcGlfZXJyb3InLCBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gSGVscGVyc1xuXG5mdW5jdGlvbiBpc0FudGhyb3BpY01lc3NhZ2VzTW9kZWwobTogQ0NBTW9kZWwpOiBib29sZWFuIHtcblx0aWYgKCFLTk9XTl9DTEFVREVfVkVORE9SUy5oYXMobS52ZW5kb3IudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIEFycmF5LmlzQXJyYXkobS5zdXBwb3J0ZWRfZW5kcG9pbnRzKSAmJiBtLnN1cHBvcnRlZF9lbmRwb2ludHMuaW5jbHVkZXMoQU5USFJPUElDX01FU1NBR0VTX0VORFBPSU5UKTtcbn1cblxuZnVuY3Rpb24gcmV3cml0ZU1vZGVsVG9TZGsobW9kZWxJZDogc3RyaW5nLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHBhcnNlZCA9IHRyeVBhcnNlQ2xhdWRlTW9kZWxJZChtb2RlbElkKTtcblx0aWYgKCFwYXJzZWQpIHtcblx0XHRsb2dTZXJ2aWNlLndhcm4oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSBvdXRib3VuZCBtb2RlbCBJRCBjb3VsZCBub3QgYmUgcGFyc2VkIGZvciBTREsgcmV3cml0ZTogJHttb2RlbElkfWApO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHBhcnNlZC50b1Nka01vZGVsSWQoKTtcbn1cblxuLyoqXG4gKiBQdXJlLWZ1bmN0aW9uIHJld3JpdGUgb2YgYG1vZGVsYCBmaWVsZHMgb24gYEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnRgXG4gKiBvYmplY3RzIGZyb20gQ0FQSSAoZW5kcG9pbnQgZm9ybWF0KSB0byBTREsgKGh5cGhlbmF0ZWQpIGZvcm1hdC4gT25seVxuICogYG1lc3NhZ2Vfc3RhcnQubWVzc2FnZS5tb2RlbGAgY2FycmllcyBhIG1vZGVsIElEIGluIHRoZSBzdHJlYW1pbmdcbiAqIHRheG9ub215OyBvdGhlciBldmVudCB0eXBlcyBwYXNzIHRocm91Z2ggdW5jaGFuZ2VkLlxuICovXG5mdW5jdGlvbiByZXdyaXRlRXZlbnRNb2RlbChcblx0ZXZlbnQ6IEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuKTogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudCB7XG5cdGlmIChldmVudC50eXBlICE9PSAnbWVzc2FnZV9zdGFydCcpIHtcblx0XHRyZXR1cm4gZXZlbnQ7XG5cdH1cblx0Y29uc3Qgc2RrTW9kZWwgPSByZXdyaXRlTW9kZWxUb1NkayhldmVudC5tZXNzYWdlLm1vZGVsLCBsb2dTZXJ2aWNlKTtcblx0aWYgKHNka01vZGVsID09PSB1bmRlZmluZWQgfHwgc2RrTW9kZWwgPT09IGV2ZW50Lm1lc3NhZ2UubW9kZWwpIHtcblx0XHRyZXR1cm4gZXZlbnQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHQuLi5ldmVudCxcblx0XHRtZXNzYWdlOiB7IC4uLmV2ZW50Lm1lc3NhZ2UsIG1vZGVsOiBzZGtNb2RlbCB9LFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSBoZWFkZXJzIHdlIGZvcndhcmQgdG8ge0BsaW5rIElDb3BpbG90QXBpU2VydmljZS5tZXNzYWdlc31cbiAqIGZyb20gdGhlIGluYm91bmQgcmVxdWVzdC4gRm9yd2FyZHMgYGFudGhyb3BpYy12ZXJzaW9uYCAodmVyYmF0aW0pLFxuICogYGFudGhyb3BpYy1iZXRhYCAoZmlsdGVyZWQgdGhyb3VnaCB7QGxpbmsgZmlsdGVyU3VwcG9ydGVkQmV0YXN9KSwgYW5kXG4gKiBgdXNlci1hZ2VudGAgKHRyYW5zZm9ybWVkIHZpYSB7QGxpbmsgdHJhbnNmb3JtVXNlckFnZW50fSkuXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkT3V0Ym91bmRIZWFkZXJzKGluYm91bmQ6IGh0dHAuSW5jb21pbmdIdHRwSGVhZGVycyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuXHRjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0Y29uc3QgdmVyc2lvbiA9IGluYm91bmRbJ2FudGhyb3BpYy12ZXJzaW9uJ107XG5cdGlmICh0eXBlb2YgdmVyc2lvbiA9PT0gJ3N0cmluZycgJiYgdmVyc2lvbi5sZW5ndGggPiAwKSB7XG5cdFx0b3V0WydhbnRocm9waWMtdmVyc2lvbiddID0gdmVyc2lvbjtcblx0fVxuXHRjb25zdCBiZXRhID0gaW5ib3VuZFsnYW50aHJvcGljLWJldGEnXTtcblx0aWYgKHR5cGVvZiBiZXRhID09PSAnc3RyaW5nJyAmJiBiZXRhLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IGZpbHRlclN1cHBvcnRlZEJldGFzKGJldGEpO1xuXHRcdGlmIChmaWx0ZXJlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRvdXRbJ2FudGhyb3BpYy1iZXRhJ10gPSBmaWx0ZXJlZDtcblx0XHR9XG5cdH1cblx0Y29uc3QgdXNlckFnZW50ID0gaW5ib3VuZFsndXNlci1hZ2VudCddO1xuXHRpZiAodHlwZW9mIHVzZXJBZ2VudCA9PT0gJ3N0cmluZycgJiYgdXNlckFnZW50Lmxlbmd0aCA+IDApIHtcblx0XHRvdXRbJ1VzZXItQWdlbnQnXSA9IHRyYW5zZm9ybVVzZXJBZ2VudCh1c2VyQWdlbnQpO1xuXHR9XG5cdHJldHVybiBvdXQ7XG59XG5cbi8qKlxuICogVHJhbnNmb3JtIGFuIGluY29taW5nIHVzZXItYWdlbnQgc3RyaW5nIGJ5IHJlcGxhY2luZyB0aGUgY2xpZW50IG5hbWVcbiAqIHBvcnRpb24gKGJlZm9yZSB0aGUgZmlyc3QgYC9gKSB3aXRoIHtAbGluayBVU0VSX0FHRU5UX1BSRUZJWH0uIFRoaXNcbiAqIG1pcnJvcnMgdGhlIHBhdHRlcm4gdXNlZCBieSBgY2xhdWRlTGFuZ3VhZ2VNb2RlbFNlcnZlci50c2AgaW4gdGhlXG4gKiBleHRlbnNpb24sIGVuc3VyaW5nIGFsbCBDbGF1ZGUgcmVxdWVzdHMgYXJlIHRhZ2dlZCB3aXRoIGEgY29uc2lzdGVudFxuICogcHJlZml4IGZvciBzZXJ2ZXItc2lkZSBpZGVudGlmaWNhdGlvbi5cbiAqXG4gKiBFeGFtcGxlczpcbiAqIC0gYGNsYXVkZS1jb2RlLzEuMi4zYCBcdTIxOTIgYHZzY29kZV9jbGF1ZGVfY29kZS8xLjIuM2BcbiAqIC0gYEFudGhyb3BpYy9QeXRob24vMS4wYCBcdTIxOTIgYHZzY29kZV9jbGF1ZGVfY29kZS9QeXRob24vMS4wYFxuICogLSBgdW5rbm93bmAgXHUyMTkyIGB2c2NvZGVfY2xhdWRlX2NvZGUvdW5rbm93bmBcbiAqL1xuZnVuY3Rpb24gdHJhbnNmb3JtVXNlckFnZW50KHVzZXJBZ2VudDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgc2xhc2hJbmRleCA9IHVzZXJBZ2VudC5pbmRleE9mKCcvJyk7XG5cdGlmIChzbGFzaEluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiBgJHtVU0VSX0FHRU5UX1BSRUZJWH0vJHt1c2VyQWdlbnR9YDtcblx0fVxuXHRyZXR1cm4gYCR7VVNFUl9BR0VOVF9QUkVGSVh9JHt1c2VyQWdlbnQuc3Vic3RyaW5nKHNsYXNoSW5kZXgpfWA7XG59XG5cbmZ1bmN0aW9uIHJlcV9zZXROb0RlbGF5KHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IHZvaWQge1xuXHRjb25zdCBzb2NrZXQgPSByZXMuc29ja2V0O1xuXHRpZiAoc29ja2V0ICYmIHR5cGVvZiBzb2NrZXQuc2V0Tm9EZWxheSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdHRyeSB7XG5cdFx0XHRzb2NrZXQuc2V0Tm9EZWxheSh0cnVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5vdCBhbGwgc29ja2V0IGltcGxlbWVudGF0aW9ucyBzdXBwb3J0IGl0IChtb2NrcyBldGMuKVxuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBzdHJpbmdpZnlFcnJvcihlcnI6IHVua25vd24pOiBzdHJpbmcge1xuXHRpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRyZXR1cm4gZXJyLm1lc3NhZ2U7XG5cdH1cblx0cmV0dXJuIFN0cmluZyhlcnIpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBjb3B5IG9mIGEge0BsaW5rIENvcGlsb3RBcGlFcnJvcn0ncyBBbnRocm9waWMgZW52ZWxvcGUgd2l0aCBhXG4gKiBgVlNDT0RFX1BST1hZX0VSUk9SOjxiYXNlNjQ+YCBtYXJrZXIgYXBwZW5kZWQgdG8gdGhlIGVycm9yIG1lc3NhZ2UuIFRoZVxuICogbWFya2VyIGNhcnJpZXMgdGhlIHN0cnVjdHVyZWQgY2hhdCBmZXRjaCBlcnJvciBzbyB0aGUgYWdlbnQgaG9zdCBjYW5cbiAqIGZvcndhcmQgcmljaCwgbG9jYWxpemVkIGVycm9yIG1lc3NhZ2luZyB0byBjb3JlIG9uY2UgdGhlIFNESyBzdWJwcm9jZXNzXG4gKiBlY2hvZXMgdGhlIHRleHQgYmFjay4gVGhlIG9yaWdpbmFsIG1lc3NhZ2UgaXMgcHJlc2VydmVkICh0aGUgZGVjb2RlciBzdG9wc1xuICogYXQgdGhlIGZpcnN0IHdoaXRlc3BhY2UpLCBzbyBub24tY29yZSBjb25zdW1lcnMgc3RpbGwgcmVhZCBpdCB2ZXJiYXRpbS5cbiAqL1xuZnVuY3Rpb24gZW1iZWRGb3J3YXJkZWRDaGF0RXJyb3IoZXJyOiBDb3BpbG90QXBpRXJyb3IpOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSB7XG5cdGNvbnN0IG1hcmtlciA9IGVuY29kZUZvcndhcmRlZENoYXRFcnJvcihidWlsZEZvcndhcmRlZENoYXRFcnJvcihlcnIpKTtcblx0cmV0dXJuIHtcblx0XHQuLi5lcnIuZW52ZWxvcGUsXG5cdFx0ZXJyb3I6IHtcblx0XHRcdC4uLmVyci5lbnZlbG9wZS5lcnJvcixcblx0XHRcdG1lc3NhZ2U6IGAke2Vyci5lbnZlbG9wZS5lcnJvci5tZXNzYWdlfSAke21hcmtlcn1gLFxuXHRcdH0sXG5cdH07XG59XG5cbi8vICNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBUUEsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUI7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUVNO0FBQ1AsU0FBUyx5QkFBeUIsZ0NBQWdDO0FBQ2xFO0FBQUEsRUFJQztBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsU0FBUyw0QkFBNEI7QUFDckM7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUNQLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBa0YxQixNQUFNLHNCQUFzQixnQkFBcUMsb0JBQW9CO0FBaUI1RixNQUFNLHVCQUF1QixvQkFBSSxJQUFJLENBQUMsV0FBVyxDQUFDO0FBQ2xELE1BQU0sOEJBQThCO0FBQ3BDLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0sb0JBQW9CO0FBaUIxQixTQUFTLHdCQUF3QixPQUFvQztBQUNwRSxRQUFNLFFBQVMsT0FBNkMsZUFBZTtBQUMzRSxTQUFPLE9BQU8sVUFBVSxZQUFZLE9BQU8sU0FBUyxLQUFLLEtBQUssU0FBUyxJQUFJLFFBQVE7QUFDcEY7QUFZTyxJQUFNLHFCQUFOLGNBQWlDLG9CQUE4RTtBQUFBLEVBT3JILFlBQ2MsWUFDd0Isb0JBQ3BDO0FBQ0QsVUFBTSx3QkFBd0IsVUFBVTtBQUZIO0FBTHRDLFNBQWlCLHNCQUFzQixJQUFJLFFBQW1DO0FBQzlFLFNBQVMscUJBQXVELEtBQUssb0JBQW9CO0FBQUEsRUFPekY7QUFBQSxFQUVVLFlBQVksYUFBd0M7QUFDN0QsV0FBTyxFQUFFLFlBQVk7QUFBQSxFQUN0QjtBQUFBLEVBRUEsTUFBTSxNQUFNLGFBQWtEO0FBQzdELFVBQU0sRUFBRSxTQUFTLFFBQVEsSUFBSSxNQUFNLEtBQUssUUFBUSxXQUFXO0FBSTNELFlBQVEsTUFBTSxjQUFjO0FBQzVCLFdBQU87QUFBQSxNQUNOLFNBQVMsUUFBUTtBQUFBLE1BQ2pCLE9BQU8sUUFBUTtBQUFBLE1BQ2YsU0FBUztBQUFBLElBQ1Y7QUFBQSxFQUNEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFDZCxTQUFLLG9CQUFvQixRQUFRO0FBQUEsRUFDbEM7QUFBQSxFQUVtQixtQkFBbUIsS0FBZ0M7QUFDckUsbUJBQWUsS0FBSyxLQUFLLGFBQWEsc0JBQXNCO0FBQUEsRUFDN0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxlQUFlLFdBQStCLGNBQXdDO0FBQzdGLFFBQUksY0FBYyxVQUFhLGlCQUFpQixRQUFXO0FBQzFEO0FBQUEsSUFDRDtBQUNBLFNBQUssWUFBWSxNQUFNLElBQUksc0JBQXNCLHNCQUFzQixTQUFTLGlCQUFpQixZQUFZLEVBQUU7QUFDL0csU0FBSyxvQkFBb0IsS0FBSyxFQUFFLFdBQVcsYUFBYSxDQUFDO0FBQUEsRUFDMUQ7QUFBQTtBQUFBLEVBSUEsTUFBeUIsY0FDeEIsS0FDQSxLQUNBLFNBQ2dCO0FBQ2hCLFVBQU0sU0FBUyxJQUFJLFVBQVU7QUFDN0IsVUFBTSxXQUFXLElBQUksSUFBSSxJQUFJLE9BQU8sS0FBSyxrQkFBa0IsRUFBRTtBQUM3RCxTQUFLLFlBQVksTUFBTSxJQUFJLHNCQUFzQixLQUFLLE1BQU0sSUFBSSxRQUFRLEVBQUU7QUFHMUUsUUFBSSxXQUFXLFNBQVMsYUFBYSxLQUFLO0FBQ3pDLFVBQUksVUFBVSxLQUFLLEVBQUUsZ0JBQWdCLGFBQWEsQ0FBQztBQUNuRCxVQUFJLElBQUksSUFBSTtBQUNaO0FBQUEsSUFDRDtBQUVBLFVBQU0sT0FBTyxpQkFBaUIsSUFBSSxTQUFTLFFBQVEsS0FBSztBQUN4RCxRQUFJLENBQUMsS0FBSyxPQUFPO0FBQ2hCLHFCQUFlLEtBQUssS0FBSyx3QkFBd0Isd0JBQXdCO0FBQ3pFO0FBQUEsSUFDRDtBQUVBLFFBQUksV0FBVyxTQUFTLGFBQWEsY0FBYztBQUNsRCxZQUFNLEtBQUssY0FBYyxLQUFLLEtBQUssT0FBTztBQUMxQztBQUFBLElBQ0Q7QUFFQSxRQUFJLFdBQVcsVUFBVSxhQUFhLGdCQUFnQjtBQUNyRCxZQUFNLEtBQUssZ0JBQWdCLEtBQUssS0FBSyxTQUFTLEtBQUssU0FBUztBQUM1RDtBQUFBLElBQ0Q7QUFFQSxRQUFJLFdBQVcsVUFBVSxhQUFhLDZCQUE2QjtBQUNsRSxxQkFBZSxLQUFLLEtBQUssYUFBYSxvQ0FBb0M7QUFDMUU7QUFBQSxJQUNEO0FBRUEsbUJBQWUsS0FBSyxLQUFLLG1CQUFtQixnQkFBZ0IsTUFBTSxJQUFJLFFBQVEsRUFBRTtBQUFBLEVBQ2pGO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYyxjQUFjLEtBQTJCLEtBQTBCLFNBQTZDO0FBQzdILFVBQU0sVUFBVSxxQkFBcUIsSUFBSSxPQUFPO0FBQ2hELFFBQUk7QUFDSixRQUFJO0FBQ0gsZUFBUyxNQUFNLEtBQUssbUJBQW1CLE9BQU8sUUFBUSxNQUFNLGFBQWEsRUFBRSxTQUFTLHVCQUF1QixLQUFLLENBQUM7QUFBQSxJQUNsSCxTQUFTLEtBQUs7QUFDYixXQUFLLDRCQUE0QixLQUFLLEdBQUc7QUFDekM7QUFBQSxJQUNEO0FBRUEsVUFBTSxPQUE4QixDQUFDO0FBQ3JDLGVBQVcsS0FBSyxRQUFRO0FBQ3ZCLFVBQUksQ0FBQyx5QkFBeUIsQ0FBQyxHQUFHO0FBQ2pDO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxzQkFBc0IsRUFBRSxFQUFFO0FBQ3pDLFlBQU0sUUFBUSxTQUFTLE9BQU8sYUFBYSxJQUFJLEVBQUU7QUFDakQsV0FBSyxLQUFLO0FBQUEsUUFDVCxJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixjQUFjLEVBQUUsUUFBUTtBQUFBLFFBQ3hCLFlBQVk7QUFBQSxRQUNaLGNBQWM7QUFBQSxRQUNkLGtCQUFrQjtBQUFBLFFBQ2xCLFlBQVk7QUFBQSxNQUNiLENBQUM7QUFBQSxJQUNGO0FBRUEsVUFBTSxPQUFPO0FBQUEsTUFDWjtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQ1YsVUFBVSxLQUFLLFNBQVMsSUFBSSxLQUFLLENBQUMsRUFBRSxLQUFLO0FBQUEsTUFDekMsU0FBUyxLQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUssU0FBUyxDQUFDLEVBQUUsS0FBSztBQUFBLElBQ3ZEO0FBQ0EsUUFBSSxVQUFVLEtBQUssRUFBRSxnQkFBZ0IsbUJBQW1CLENBQUM7QUFDekQsUUFBSSxJQUFJLEtBQUssVUFBVSxJQUFJLENBQUM7QUFBQSxFQUM3QjtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsZ0JBQ2IsS0FDQSxLQUNBLFNBQ0EsV0FDZ0I7QUFDaEIsUUFBSTtBQUNKLFFBQUk7QUFDSCxtQkFBYSxNQUFNLHFCQUFxQixHQUFHO0FBQUEsSUFDNUMsU0FBUyxLQUFLO0FBQ2IscUJBQWUsS0FBSyxLQUFLLHlCQUF5QixnQ0FBZ0MsZUFBZSxHQUFHLENBQUMsRUFBRTtBQUN2RztBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0osUUFBSTtBQUNILGVBQVMsS0FBSyxNQUFNLFVBQVU7QUFBQSxJQUMvQixRQUFRO0FBQ1AscUJBQWUsS0FBSyxLQUFLLHlCQUF5QixnQ0FBZ0M7QUFDbEY7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDMUMscUJBQWUsS0FBSyxLQUFLLHlCQUF5QixvQ0FBb0M7QUFDdEY7QUFBQSxJQUNEO0FBRUEsVUFBTSxPQUFPO0FBQ2IsVUFBTSxhQUFhLEtBQUs7QUFDeEIsUUFBSSxPQUFPLGVBQWUsWUFBWSxXQUFXLFdBQVcsR0FBRztBQUM5RCxxQkFBZSxLQUFLLEtBQUsseUJBQXlCLCtCQUErQjtBQUNqRjtBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsTUFBTSxRQUFRLEtBQUssUUFBUSxHQUFHO0FBQ2xDLHFCQUFlLEtBQUssS0FBSyx5QkFBeUIsa0NBQWtDO0FBQ3BGO0FBQUEsSUFDRDtBQUVBLFVBQU0sY0FBYyxzQkFBc0IsVUFBVTtBQUNwRCxRQUFJLENBQUMsYUFBYTtBQUNqQixxQkFBZSxLQUFLLEtBQUssbUJBQW1CLGtCQUFrQixVQUFVLEVBQUU7QUFDMUU7QUFBQSxJQUNEO0FBSUEsVUFBTSxrQkFBa0IsWUFBWSxrQkFBa0I7QUFDdEQsU0FBSyxRQUFRO0FBRWIsVUFBTSxTQUFTLEtBQUssV0FBVztBQUMvQixVQUFNLFVBQVUscUJBQXFCLElBQUksT0FBTztBQUVoRCxVQUFNLFFBQXdCO0FBQUEsTUFDN0IsSUFBSSxJQUFJLGdCQUFnQjtBQUFBLE1BQ3hCO0FBQUEsTUFDQSxZQUFZO0FBQUEsSUFDYjtBQUNBLFlBQVEsU0FBUyxJQUFJLEtBQUs7QUFDMUIsVUFBTSxVQUFVLE1BQU07QUFDckIsWUFBTSxhQUFhO0FBQ25CLFlBQU0sR0FBRyxNQUFNO0FBQUEsSUFDaEI7QUFDQSxRQUFJLEdBQUcsU0FBUyxPQUFPO0FBRXZCLFFBQUk7QUFDSCxVQUFJLFFBQVE7QUFDWCxjQUFNLEtBQUs7QUFBQSxVQUNWO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsT0FBTztBQUNOLGNBQU0sS0FBSztBQUFBLFVBQ1Y7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsVUFBRTtBQUNELFVBQUksZUFBZSxTQUFTLE9BQU87QUFDbkMsY0FBUSxTQUFTLE9BQU8sS0FBSztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyx5QkFDYixNQUNBLFNBQ0EsS0FDQSxPQUNBLFNBQ0Esb0JBQ0EsV0FDZ0I7QUFDaEIsVUFBTSxVQUE0QyxFQUFFLFNBQVMsUUFBUSxNQUFNLEdBQUcsUUFBUSx1QkFBdUIsS0FBSztBQUNsSCxRQUFJO0FBQ0osUUFBSTtBQUNILGdCQUFVLE1BQU0sS0FBSyxtQkFBbUIsU0FBUyxRQUFRLE1BQU0sYUFBYSxNQUFNLE9BQU87QUFBQSxJQUMxRixTQUFTLEtBQUs7QUFDYixVQUFJLE1BQU0sR0FBRyxPQUFPLFNBQVM7QUFDNUIsWUFBSSxDQUFDLE1BQU0sY0FBYyxDQUFDLElBQUksZUFBZTtBQUM1QyxjQUFJLFFBQVE7QUFBQSxRQUNiO0FBQ0E7QUFBQSxNQUNEO0FBQ0EsV0FBSyw0QkFBNEIsS0FBSyxLQUFLLElBQUk7QUFDL0M7QUFBQSxJQUNEO0FBRUEsU0FBSyxlQUFlLFdBQVcsd0JBQXdCLE9BQU8sQ0FBQztBQUsvRCxVQUFNLGdCQUFnQixrQkFBa0IsUUFBUSxPQUFPLEtBQUssV0FBVyxLQUFLO0FBQzVFLFVBQU0sZUFBa0MsRUFBRSxHQUFHLFNBQVMsT0FBTyxjQUFjO0FBRTNFLFFBQUksVUFBVSxLQUFLLEVBQUUsZ0JBQWdCLG1CQUFtQixDQUFDO0FBQ3pELFFBQUksSUFBSSxLQUFLLFVBQVUsWUFBWSxDQUFDO0FBQUEsRUFDckM7QUFBQSxFQUVBLE1BQWMsZ0JBQ2IsTUFDQSxTQUNBLEtBQ0EsT0FDQSxTQUNBLHFCQUNBLFdBQ2dCO0FBQ2hCLFVBQU0sVUFBNEMsRUFBRSxTQUFTLFFBQVEsTUFBTSxHQUFHLFFBQVEsdUJBQXVCLEtBQUs7QUFDbEgsUUFBSTtBQUNKLFFBQUk7QUFDSCxlQUFTLEtBQUssbUJBQW1CLFNBQVMsUUFBUSxNQUFNLGFBQWEsTUFBTSxPQUFPO0FBQUEsSUFDbkYsU0FBUyxLQUFLO0FBR2IsVUFBSSxNQUFNLEdBQUcsT0FBTyxTQUFTO0FBQzVCLFlBQUksQ0FBQyxNQUFNLGNBQWMsQ0FBQyxJQUFJLGVBQWU7QUFDNUMsY0FBSSxRQUFRO0FBQUEsUUFDYjtBQUNBO0FBQUEsTUFDRDtBQUNBLFdBQUssNEJBQTRCLEtBQUssS0FBSyxJQUFJO0FBQy9DO0FBQUEsSUFDRDtBQUlBLFFBQUk7QUFDSixRQUFJO0FBQ0gsY0FBUSxNQUFNLE9BQU8sS0FBSztBQUFBLElBQzNCLFNBQVMsS0FBSztBQUNiLFVBQUksTUFBTSxHQUFHLE9BQU8sU0FBUztBQUM1QixZQUFJLENBQUMsTUFBTSxjQUFjLENBQUMsSUFBSSxlQUFlO0FBQzVDLGNBQUksUUFBUTtBQUFBLFFBQ2I7QUFDQTtBQUFBLE1BQ0Q7QUFDQSxXQUFLLDRCQUE0QixLQUFLLEtBQUssSUFBSTtBQUMvQztBQUFBLElBQ0Q7QUFHQSxRQUFJLFVBQVUsS0FBSztBQUFBLE1BQ2xCLGdCQUFnQjtBQUFBLE1BQ2hCLGlCQUFpQjtBQUFBLE1BQ2pCLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFDRCxRQUFJLGFBQWE7QUFDakIsbUJBQWUsR0FBRztBQUVsQixVQUFNLGFBQWEsT0FBTyxVQUEwRDtBQUNuRixZQUFNLGNBQWMsa0JBQWtCLE9BQU8sS0FBSyxXQUFXO0FBQzdELFlBQU0sUUFBUSxVQUFVLFlBQVksSUFBSTtBQUFBLFFBQVcsS0FBSyxVQUFVLFdBQVcsQ0FBQztBQUFBO0FBQUE7QUFDOUUsWUFBTSxLQUFLLElBQUksTUFBTSxLQUFLO0FBQzFCLFVBQUksQ0FBQyxJQUFJO0FBQ1IsWUFBSTtBQUNILGdCQUFNLEtBQUssS0FBSyxTQUFTLEVBQUUsUUFBUSxNQUFNLEdBQUcsT0FBTyxDQUFDO0FBQUEsUUFDckQsUUFBUTtBQUVQLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUtBLFFBQUk7QUFFSixRQUFJO0FBQ0gsVUFBSSxDQUFDLE1BQU0sTUFBTTtBQUNoQiwwQkFBa0Isd0JBQXdCLE1BQU0sS0FBSyxLQUFLO0FBQzFELGNBQU0sS0FBSyxNQUFNLFdBQVcsTUFBTSxLQUFLO0FBQ3ZDLFlBQUksQ0FBQyxJQUFJO0FBQ1I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLGFBQU8sTUFBTTtBQUNaLFlBQUk7QUFDSixZQUFJO0FBQ0gsaUJBQU8sTUFBTSxPQUFPLEtBQUs7QUFBQSxRQUMxQixTQUFTLEtBQUs7QUFDYixjQUFJLE1BQU0sR0FBRyxPQUFPLFNBQVM7QUFDNUIsZ0JBQUksQ0FBQyxNQUFNLGNBQWMsQ0FBQyxJQUFJLGVBQWU7QUFDNUMsa0JBQUksUUFBUTtBQUFBLFlBQ2I7QUFDQTtBQUFBLFVBQ0Q7QUFFQSxnQkFBTSxXQUFXLGVBQWUsa0JBQzdCLHdCQUF3QixHQUFHLElBQzNCLG1CQUFtQixhQUFhLGVBQWUsR0FBRyxDQUFDO0FBQ3RELGNBQUksQ0FBQyxJQUFJLGVBQWU7QUFDdkIsZ0JBQUk7QUFDSCxrQkFBSSxNQUFNLG9CQUFvQixRQUFRLENBQUM7QUFBQSxZQUN4QyxRQUFRO0FBQUEsWUFBNkI7QUFDckMsZ0JBQUk7QUFDSCxrQkFBSSxJQUFJO0FBQUEsWUFDVCxRQUFRO0FBQUEsWUFBZTtBQUFBLFVBQ3hCO0FBQ0E7QUFBQSxRQUNEO0FBQ0EsWUFBSSxLQUFLLE1BQU07QUFDZDtBQUFBLFFBQ0Q7QUFDQSwwQkFBa0Isd0JBQXdCLEtBQUssS0FBSyxLQUFLO0FBQ3pELGNBQU0sS0FBSyxNQUFNLFdBQVcsS0FBSyxLQUFLO0FBQ3RDLFlBQUksQ0FBQyxJQUFJO0FBQ1I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxJQUFJLGVBQWU7QUFDdkIsWUFBSSxJQUFJO0FBQUEsTUFDVDtBQU1BLFdBQUssZUFBZSxXQUFXLGVBQWU7QUFBQSxJQUMvQyxTQUFTLEtBQUs7QUFFYixXQUFLLFlBQVksS0FBSyxJQUFJLHNCQUFzQixtQ0FBbUMsZUFBZSxHQUFHLENBQUMsRUFBRTtBQUN4RyxVQUFJLENBQUMsSUFBSSxlQUFlO0FBQ3ZCLFlBQUk7QUFBRSxjQUFJLElBQUk7QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFlO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFjUSw0QkFBNEIsS0FBMEIsS0FBYyxpQkFBaUIsT0FBYTtBQUN6RyxRQUFJLElBQUksYUFBYTtBQUdwQixXQUFLLFlBQVksS0FBSyxJQUFJLHNCQUFzQixxREFBcUQsZUFBZSxHQUFHLENBQUMsRUFBRTtBQUMxSCxVQUFJLENBQUMsSUFBSSxlQUFlO0FBQ3ZCLFlBQUk7QUFBRSxjQUFJLElBQUk7QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFlO0FBQUEsTUFDekM7QUFDQTtBQUFBLElBQ0Q7QUFDQSxRQUFJLGVBQWUsaUJBQWlCO0FBS25DLFlBQU0sU0FBUyxJQUFJLFdBQVcscUNBQXFDLE1BQU0sSUFBSTtBQUM3RSw2QkFBdUIsS0FBSyxRQUFRLGlCQUFpQix3QkFBd0IsR0FBRyxJQUFJLElBQUksUUFBUTtBQUNoRztBQUFBLElBQ0Q7QUFDQSxtQkFBZSxLQUFLLEtBQUssYUFBYSxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDO0FBQUEsRUFDdkY7QUFBQTtBQUdEO0FBbGJhLHFCQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxHQVRVO0FBd2JiLFNBQVMseUJBQXlCLEdBQXNCO0FBQ3ZELE1BQUksQ0FBQyxxQkFBcUIsSUFBSSxFQUFFLE9BQU8sWUFBWSxDQUFDLEdBQUc7QUFDdEQsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLE1BQU0sUUFBUSxFQUFFLG1CQUFtQixLQUFLLEVBQUUsb0JBQW9CLFNBQVMsMkJBQTJCO0FBQzFHO0FBRUEsU0FBUyxrQkFBa0IsU0FBaUIsWUFBNkM7QUFDeEYsUUFBTSxTQUFTLHNCQUFzQixPQUFPO0FBQzVDLE1BQUksQ0FBQyxRQUFRO0FBQ1osZUFBVyxLQUFLLElBQUksc0JBQXNCLDREQUE0RCxPQUFPLEVBQUU7QUFDL0csV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLE9BQU8sYUFBYTtBQUM1QjtBQVFBLFNBQVMsa0JBQ1IsT0FDQSxZQUMrQjtBQUMvQixNQUFJLE1BQU0sU0FBUyxpQkFBaUI7QUFDbkMsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFdBQVcsa0JBQWtCLE1BQU0sUUFBUSxPQUFPLFVBQVU7QUFDbEUsTUFBSSxhQUFhLFVBQWEsYUFBYSxNQUFNLFFBQVEsT0FBTztBQUMvRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU87QUFBQSxJQUNOLEdBQUc7QUFBQSxJQUNILFNBQVMsRUFBRSxHQUFHLE1BQU0sU0FBUyxPQUFPLFNBQVM7QUFBQSxFQUM5QztBQUNEO0FBUUEsU0FBUyxxQkFBcUIsU0FBMkQ7QUFDeEYsUUFBTSxNQUE4QixDQUFDO0FBQ3JDLFFBQU0sVUFBVSxRQUFRLG1CQUFtQjtBQUMzQyxNQUFJLE9BQU8sWUFBWSxZQUFZLFFBQVEsU0FBUyxHQUFHO0FBQ3RELFFBQUksbUJBQW1CLElBQUk7QUFBQSxFQUM1QjtBQUNBLFFBQU0sT0FBTyxRQUFRLGdCQUFnQjtBQUNyQyxNQUFJLE9BQU8sU0FBUyxZQUFZLEtBQUssU0FBUyxHQUFHO0FBQ2hELFVBQU0sV0FBVyxxQkFBcUIsSUFBSTtBQUMxQyxRQUFJLGFBQWEsUUFBVztBQUMzQixVQUFJLGdCQUFnQixJQUFJO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQ0EsUUFBTSxZQUFZLFFBQVEsWUFBWTtBQUN0QyxNQUFJLE9BQU8sY0FBYyxZQUFZLFVBQVUsU0FBUyxHQUFHO0FBQzFELFFBQUksWUFBWSxJQUFJLG1CQUFtQixTQUFTO0FBQUEsRUFDakQ7QUFDQSxTQUFPO0FBQ1I7QUFjQSxTQUFTLG1CQUFtQixXQUEyQjtBQUN0RCxRQUFNLGFBQWEsVUFBVSxRQUFRLEdBQUc7QUFDeEMsTUFBSSxlQUFlLElBQUk7QUFDdEIsV0FBTyxHQUFHLGlCQUFpQixJQUFJLFNBQVM7QUFBQSxFQUN6QztBQUNBLFNBQU8sR0FBRyxpQkFBaUIsR0FBRyxVQUFVLFVBQVUsVUFBVSxDQUFDO0FBQzlEO0FBRUEsU0FBUyxlQUFlLEtBQWdDO0FBQ3ZELFFBQU0sU0FBUyxJQUFJO0FBQ25CLE1BQUksVUFBVSxPQUFPLE9BQU8sZUFBZSxZQUFZO0FBQ3RELFFBQUk7QUFDSCxhQUFPLFdBQVcsSUFBSTtBQUFBLElBQ3ZCLFFBQVE7QUFBQSxJQUVSO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxlQUFlLEtBQXNCO0FBQzdDLE1BQUksZUFBZSxPQUFPO0FBQ3pCLFdBQU8sSUFBSTtBQUFBLEVBQ1o7QUFDQSxTQUFPLE9BQU8sR0FBRztBQUNsQjtBQVVBLFNBQVMsd0JBQXdCLEtBQStDO0FBQy9FLFFBQU0sU0FBUyx5QkFBeUIsd0JBQXdCLEdBQUcsQ0FBQztBQUNwRSxTQUFPO0FBQUEsSUFDTixHQUFHLElBQUk7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNOLEdBQUcsSUFBSSxTQUFTO0FBQUEsTUFDaEIsU0FBUyxHQUFHLElBQUksU0FBUyxNQUFNLE9BQU8sSUFBSSxNQUFNO0FBQUEsSUFDakQ7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
