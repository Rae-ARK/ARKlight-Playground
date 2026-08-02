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
import * as fs from "fs";
import { join } from "../../../../base/common/path.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { CopilotApiError, ICopilotApiService } from "../shared/copilotApiService.js";
import { buildForwardedChatError, encodeForwardedChatError } from "../shared/forwardedChatError.js";
import {
  LoopbackProxyServer,
  readProxyRequestBody
} from "../shared/loopbackProxyServer.js";
const ICodexProxyService = createDecorator("codexProxyService");
const CODEX_AUTO_REVIEW_MODEL = "codex-auto-review";
const PROXY_USER_FACING_NAME = "CodexProxyService";
const USER_AGENT_PREFIX = "vscode_codex";
const DEBUG_DUMP_DIR_ENV = "VSCODE_CODEX_PROXY_DUMP_DIR";
let _dumpSeq = 0;
function nextDumpSeq() {
  return String(++_dumpSeq).padStart(4, "0");
}
function getDumpDir() {
  const dir = process.env[DEBUG_DUMP_DIR_ENV];
  if (!dir) {
    return void 0;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return void 0;
  }
}
function writeJsonError(res, status, type, message) {
  if (res.headersSent || res.writableEnded) {
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { type, message } }));
}
let CodexProxyService = class extends LoopbackProxyServer {
  constructor(logService, _copilotApiService) {
    super(PROXY_USER_FACING_NAME, logService);
    this._copilotApiService = _copilotApiService;
  }
  createState(githubToken) {
    return { githubToken, lastPrimaryModel: void 0 };
  }
  async start(githubToken) {
    const { runtime, release } = await this.acquire(githubToken);
    runtime.state.githubToken = githubToken;
    let disposed = false;
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      setToken: (newToken) => {
        if (disposed) {
          return;
        }
        runtime.state.githubToken = newToken;
      },
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        release();
      }
    };
  }
  async handleRequest(req, res, runtime) {
    const method = req.method ?? "GET";
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const incomingHeaders = Object.keys(req.headers).join(", ");
    this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> ${method} ${pathname} (headers: ${incomingHeaders})`);
    if (method === "GET" && pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    const authHeader = req.headers["authorization"];
    const expected = `Bearer ${runtime.nonce}`;
    if (typeof authHeader !== "string" || authHeader !== expected) {
      writeJsonError(res, 401, "authentication_error", "Invalid authentication");
      return;
    }
    if (method === "GET" && pathname === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ models: [] }));
      return;
    }
    if (method === "POST" && (pathname === "/v1/responses" || pathname === "/responses" || pathname === "//responses")) {
      await this._handleResponses(req, res, runtime);
      return;
    }
    writeJsonError(res, 404, "not_found_error", `No route for ${method} ${pathname}`);
  }
  async _handleResponses(req, res, runtime) {
    let body;
    try {
      body = await readProxyRequestBody(req);
    } catch (err) {
      writeJsonError(res, 400, "invalid_request_error", `Failed to read request body: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    const remap = remapCodexReviewerModel(body, runtime.state);
    if (remap.remappedFrom) {
      this._logService.info(`[${PROXY_USER_FACING_NAME}] remapped unsupported reviewer model '${remap.remappedFrom}' -> '${remap.remappedTo}'`);
    }
    body = remap.body;
    const dumpDir = getDumpDir();
    const dumpSeq = dumpDir ? nextDumpSeq() : void 0;
    if (dumpDir && dumpSeq) {
      const reqFile = join(dumpDir, `req-${dumpSeq}-${Date.now()}.json`);
      try {
        fs.writeFileSync(reqFile, body);
        this._logService.info(`[${PROXY_USER_FACING_NAME}] dumped request body to ${reqFile}`);
      } catch (err) {
        this._logService.warn(`[${PROXY_USER_FACING_NAME}] failed to dump request body: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    try {
      const parsed = JSON.parse(body);
      this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> /responses body: model=${parsed.model ?? "<none>"}, previous_response_id=${parsed.previous_response_id ?? "<none>"}, stream=${parsed.stream ?? "<none>"}, input_items=${Array.isArray(parsed.input) ? parsed.input.length : "<not-array>"}`);
      if (Array.isArray(parsed.input)) {
        for (let i = 0; i < parsed.input.length; i++) {
          const item = parsed.input[i];
          const type = item?.type ?? "<none>";
          const keys = item && typeof item === "object" ? Object.keys(item).join(",") : typeof item;
          let detail = "";
          if (type === "message") {
            const text = item?.content?.[0]?.text ?? "";
            detail = `role=${item?.role ?? "?"} chars=${text.length}`;
          } else if (type === "function_call") {
            detail = `name=${item?.name ?? "?"} call_id=${item?.call_id ?? "?"}`;
          } else if (type === "function_call_output") {
            const output = item?.output ?? "";
            detail = `call_id=${item?.call_id ?? "?"} output_chars=${typeof output === "string" ? output.length : 0}`;
          } else if (type === "reasoning") {
            const summary = item?.summary ?? item?.content ?? "";
            detail = `summary_chars=${typeof summary === "string" ? summary.length : JSON.stringify(summary).length} encrypted=${typeof item?.encrypted_content === "string"}`;
          } else {
            detail = JSON.stringify(item).slice(0, 120);
          }
          this._logService.info(`[${PROXY_USER_FACING_NAME}]   input[${i}] type=${type} keys=[${keys}] ${detail}`);
        }
      }
      const topLevelKeys = Object.keys(parsed).filter((k) => k !== "input").sort();
      this._logService.info(`[${PROXY_USER_FACING_NAME}]   top-level keys (excl. input)=[${topLevelKeys.join(", ")}]`);
      for (const k of topLevelKeys) {
        if (k === "instructions" || k === "tools") {
          const v2 = parsed[k];
          const size = typeof v2 === "string" ? v2.length : JSON.stringify(v2).length;
          this._logService.info(`[${PROXY_USER_FACING_NAME}]     ${k}=<${size} chars elided>`);
          continue;
        }
        const v = parsed[k];
        const preview = typeof v === "object" ? JSON.stringify(v).slice(0, 300) : String(v);
        this._logService.info(`[${PROXY_USER_FACING_NAME}]     ${k}=${preview}`);
      }
    } catch {
      this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> /responses body (unparseable): ${body.slice(0, 200)}`);
    }
    const entry = { ac: new AbortController(), res, clientGone: false };
    runtime.inFlight.add(entry);
    const onClose = () => {
      entry.clientGone = true;
      entry.ac.abort();
    };
    res.on("close", onClose);
    const dispatchedToken = runtime.state.githubToken;
    const headers = buildOutboundHeaders(req.headers);
    try {
      this._logService.info(`[${PROXY_USER_FACING_NAME}] forwarding to CAPI responses...`);
      const upstream = await this._copilotApiService.responses(dispatchedToken, body, { headers, signal: entry.ac.signal, suppressIntegrationId: true });
      const contentType = upstream.headers.get("content-type") ?? "application/json";
      const upstreamHeaders = [...upstream.headers.entries()].map(([k, v]) => `${k}: ${v}`).join(", ");
      this._logService.info(`[${PROXY_USER_FACING_NAME}] <<< CAPI response: status=${upstream.status}, contentType=${contentType}, headers=[${upstreamHeaders}]`);
      res.writeHead(upstream.status, { "Content-Type": contentType });
      if (!upstream.body) {
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      const resDumpStream = dumpDir && dumpSeq ? fs.createWriteStream(join(dumpDir, `res-${dumpSeq}-${Date.now()}.txt`)) : void 0;
      let sseBuf = "";
      const eventCounts = {};
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (entry.clientGone) {
            break;
          }
          if (value && value.byteLength > 0) {
            const buf = Buffer.from(value);
            res.write(buf);
            if (resDumpStream) {
              resDumpStream.write(buf);
            }
            sseBuf += buf.toString("utf8");
            let nl;
            while ((nl = sseBuf.indexOf("\n")) >= 0) {
              const line = sseBuf.slice(0, nl).trimEnd();
              sseBuf = sseBuf.slice(nl + 1);
              if (line.startsWith("event:")) {
                const ev = line.slice("event:".length).trim();
                eventCounts[ev] = (eventCounts[ev] ?? 0) + 1;
              }
            }
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
        }
        resDumpStream?.end();
      }
      if (Object.keys(eventCounts).length) {
        const summary = Object.entries(eventCounts).map(([k, v]) => `${k}=${v}`).join(", ");
        this._logService.info(`[${PROXY_USER_FACING_NAME}] <<< SSE event counts: ${summary}`);
      }
      res.end();
    } catch (err) {
      if (entry.clientGone) {
        this._logService.info(`[${PROXY_USER_FACING_NAME}] client disconnected during upstream call`);
        return;
      }
      if (err instanceof CopilotApiError) {
        this._logService.error(`[${PROXY_USER_FACING_NAME}] CAPI error: status=${err.status}, message=${err.message}`);
        const marker = encodeForwardedChatError(buildForwardedChatError(err));
        writeJsonError(res, err.status, "api_error", `${err.message} ${marker}`);
        return;
      }
      this._logService.error(`[${PROXY_USER_FACING_NAME}] upstream error: ${err instanceof Error ? err.message : String(err)}`);
      writeJsonError(res, 502, "api_error", err instanceof Error ? err.message : String(err));
    } finally {
      res.removeListener("close", onClose);
      runtime.inFlight.delete(entry);
    }
  }
};
CodexProxyService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService)
], CodexProxyService);
function remapCodexReviewerModel(body, state) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { body };
  }
  const model = typeof parsed.model === "string" ? parsed.model : void 0;
  if (!model) {
    return { body };
  }
  if (model !== CODEX_AUTO_REVIEW_MODEL) {
    state.lastPrimaryModel = model;
    return { body };
  }
  const target = state.lastPrimaryModel;
  if (!target) {
    return { body };
  }
  parsed.model = target;
  return { body: JSON.stringify(parsed), remappedFrom: model, remappedTo: target };
}
function buildOutboundHeaders(inbound) {
  const out = {};
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
export {
  CodexProxyService,
  ICodexProxyService,
  remapCodexReviewerModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvZGV4L2NvZGV4UHJveHlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyBodHRwIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENvcGlsb3RBcGlFcnJvciwgSUNvcGlsb3RBcGlTZXJ2aWNlIH0gZnJvbSAnLi4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yLCBlbmNvZGVGb3J3YXJkZWRDaGF0RXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvZm9yd2FyZGVkQ2hhdEVycm9yLmpzJztcbmltcG9ydCB7XG5cdElMb29wYmFja1Byb3h5SGFuZGxlLFxuXHRJTG9vcGJhY2tQcm94eVJ1bnRpbWUsXG5cdElQcm94eUluRmxpZ2h0LFxuXHRMb29wYmFja1Byb3h5U2VydmVyLFxuXHRyZWFkUHJveHlSZXF1ZXN0Qm9keSxcbn0gZnJvbSAnLi4vc2hhcmVkL2xvb3BiYWNrUHJveHlTZXJ2ZXIuanMnO1xuXG4vKipcbiAqIFJlZmNvdW50ZWQgaGFuZGxlIHRvIHRoZSBsb2NhbCBPcGVuQUktUmVzcG9uc2VzIFx1MjE5MiBDQVBJIHByb3h5LlxuICpcbiAqIFRoZSBoYW5kbGUgb3ducyBhIG5vbmNlIHRoYXQgdGhlIGNvZGV4IENMSSBwYXNzZXMgYXMgYEJlYXJlciA8bm9uY2U+YCBvblxuICogZXZlcnkgcmVxdWVzdC4gVGhlIHByb3h5IHZhbGlkYXRlcyB0aGF0IG5vbmNlLCB0aGVuIHJlLWlzc3VlcyB0aGUgcmVxdWVzdFxuICogdG8gQ0FQSSB1c2luZyB0aGUgKipjdXJyZW50KiogR2l0SHViIENvcGlsb3QgdG9rZW4gXHUyMDE0IHdoaWNoIGNhbiByb3RhdGVcbiAqIHVuZGVybmVhdGggdGhlIGNvZGV4IHByb2Nlc3Mgd2l0aG91dCBhZmZlY3RpbmcgaXQuIENhbGxcbiAqIHtAbGluayBzZXRUb2tlbn0gd2hlbiB0aGUgdXBzdHJlYW0gdG9rZW4gY2hhbmdlczsgaW4tZmxpZ2h0IHJlcXVlc3RzIGtlZXBcbiAqIHVzaW5nIHRoZSB2YWx1ZSB0aGV5IGNhcHR1cmVkIGF0IGRpc3BhdGNoIHRpbWUsIG5ldyByZXF1ZXN0cyBwaWNrIHVwIHRoZVxuICogZnJlc2ggdmFsdWUuXG4gKlxuICogU3VicHJvY2Vzcy1vd25lcnNoaXAgaW52YXJpYW50OiBhbnkgc3VicHJvY2VzcyBnaXZlbiBgYmFzZVVybGAgLyBgbm9uY2VgXG4gKiBNVVNUIGJlIGtpbGxlZCBiZWZvcmUgdGhpcyBoYW5kbGUgaXMgZGlzcG9zZWQ7IG90aGVyd2lzZSB0aGUgcHJveHkgbWF5XG4gKiByZWJpbmQgb24gYSBkaWZmZXJlbnQgcG9ydCBvbiBuZXh0IGBzdGFydCgpYCBhbmQgdGhlIHN1YnByb2Nlc3Mgc2lsZW50bHlcbiAqIGxvc2VzIGl0cyBlbmRwb2ludC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29kZXhQcm94eUhhbmRsZSBleHRlbmRzIElMb29wYmFja1Byb3h5SGFuZGxlIHtcblx0LyoqIGUuZy4gYGh0dHA6Ly8xMjcuMC4wLjE6NTQzMjFgIFx1MjAxNCBubyB0cmFpbGluZyBzbGFzaC4gKi9cblx0cmVhZG9ubHkgYmFzZVVybDogc3RyaW5nO1xuXHQvKiogUmFuZG9tIHBlci1wcm9jZXNzIG5vbmNlIHVzZWQgYXMgYEJlYXJlciA8bm9uY2U+YCBieSB0aGUgY29kZXggQ0xJLiAqL1xuXHRyZWFkb25seSBub25jZTogc3RyaW5nO1xuXHQvKipcblx0ICogUmVwbGFjZSB0aGUgR2l0SHViIENvcGlsb3QgdG9rZW4gdXNlZCBmb3Igb3V0Ym91bmQgQ0FQSSBjYWxscy4gVGhlXG5cdCAqIGNvZGV4IHByb2Nlc3MgYW5kIGl0cyBub25jZSBhcmUgdW5jaGFuZ2VkLlxuXHQgKi9cblx0c2V0VG9rZW4oZ2l0aHViVG9rZW46IHN0cmluZyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4UHJveHlTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTdGFydCB0aGUgcHJveHkgKGlmIG5vdCBhbHJlYWR5IHJ1bm5pbmcpIGFuZCByZXR1cm4gYSByZWZjb3VudGVkXG5cdCAqIGhhbmRsZS4gVGhlIHByb3ZpZGVkIHRva2VuIGlzIHRoZSBpbml0aWFsIHZhbHVlOyByb3RhdGUgdmlhXG5cdCAqIHtAbGluayBJQ29kZXhQcm94eUhhbmRsZS5zZXRUb2tlbn0uXG5cdCAqL1xuXHRzdGFydChnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJQ29kZXhQcm94eUhhbmRsZT47XG5cblx0LyoqIEZvcmNlLWNsb3NlIHRoZSBwcm94eSByZWdhcmRsZXNzIG9mIHJlZmNvdW50LiBJZGVtcG90ZW50LiAqL1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjb25zdCBJQ29kZXhQcm94eVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUNvZGV4UHJveHlTZXJ2aWNlPignY29kZXhQcm94eVNlcnZpY2UnKTtcblxuLyoqIFN1YmNsYXNzLW93bmVkIHBlci1iaW5kIG11dGFibGUgc3RhdGU6IHRoZSBhY3RpdmUgb3V0Ym91bmQgQ0FQSSB0b2tlbi4gKi9cbmludGVyZmFjZSBJQ29kZXhQcm94eVN0YXRlIHtcblx0LyoqIFRva2VuIGNlbGwgXHUyMDE0IHJlYWQgZnJlc2ggb24gZWFjaCBvdXRib3VuZCByZXF1ZXN0LiAqL1xuXHRnaXRodWJUb2tlbjogc3RyaW5nO1xuXHQvKipcblx0ICogTW9zdCByZWNlbnQgKnByaW1hcnkqIChub24tcmV2aWV3ZXIpIG1vZGVsIGlkIGZvcndhcmRlZCBvbiB0aGlzIGJpbmQsXG5cdCAqIG9ic2VydmVkIGZyb20gbm9ybWFsIHR1cm4gcmVxdWVzdHMuIFVzZWQgdG8gcmVtYXAgdGhlIHVuc3VwcG9ydGVkXG5cdCAqIGF1dG8tcmV2aWV3IHJldmlld2VyIG1vZGVsIChzZWUge0BsaW5rIENPREVYX0FVVE9fUkVWSUVXX01PREVMfSkgb250byBhXG5cdCAqIG1vZGVsIHRoYXQgaXMga25vd24gdG8gYmUgc3VwcG9ydGVkIGJ5IHRoZSBDb3BpbG90IENBUEkuIGB1bmRlZmluZWRgXG5cdCAqIHVudGlsIHRoZSBmaXJzdCBwcmltYXJ5IHJlcXVlc3QgaXMgc2Vlbi5cblx0ICpcblx0ICogQmluZC1nbG9iYWwsIG5vdCBwZXItc2Vzc2lvbjogdGhlIHByb3h5IGlzIGEgc2luZ2xlIHJlZmNvdW50ZWQgYmluZFxuXHQgKiBzaGFyZWQgYnkgZXZlcnkgY29uY3VycmVudCBDb2RleCBzZXNzaW9uIGFuZCByZXZpZXdlciByZXF1ZXN0cyBjYXJyeSBub1xuXHQgKiBzZXNzaW9uIGlkZW50aXR5LCBzbyB0aGlzIHRyYWNrcyB0aGUgbGFzdCBwcmltYXJ5IG1vZGVsIHNlZW4gYWNyb3NzIGFsbFxuXHQgKiBzZXNzaW9ucy4gVW5kZXIgdGhlIGRvY3VtZW50ZWQgc2luZ2xlLXRlbmFudCBhc3N1bXB0aW9uIChvbmUgYWN0aXZlIG1vZGVsXG5cdCAqIGF0IGEgdGltZSkgdGhhdCBpcyBjb3JyZWN0OyB3aXRoIHR3byBjb25jdXJyZW50IHNlc3Npb25zIG9uICpkaWZmZXJlbnQqXG5cdCAqIG1vZGVscyB3aGVyZSBvbmUgdXNlcyBBdXRvLXJldmlldywgdGhlIHJldmlld2VyIG1heSBydW4gb24gdGhlIG90aGVyXG5cdCAqIHNlc3Npb24ncyBtb2RlbC4gVGhhdCBvbmx5IGFmZmVjdHMgcmV2aWV3ZXIgbW9kZWwgY2hvaWNlLCBuZXZlclxuXHQgKiBjb3JyZWN0bmVzcyBvZiB0aGUgcHJpbWFyeSB0dXJucyAod2hpY2ggYXJlIGZvcndhcmRlZCB2ZXJiYXRpbSkuXG5cdCAqL1xuXHRsYXN0UHJpbWFyeU1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogTW9kZWwgaWQgdGhlIENvZGV4IGFwcC1zZXJ2ZXIgdXNlcyBmb3IgaXRzIGJ1aWx0LWluIGF1dG8tcmV2aWV3IHJldmlld2VyXG4gKiAodGhlIFwiQXV0by1yZXZpZXdcIiBwZXJtaXNzaW9ucyBwcmVzZXQgcm91dGVzIGVsaWdpYmxlIGFwcHJvdmFscyB0aHJvdWdoIGl0KS5cbiAqXG4gKiBUaGlzIGlzIGEgc3BlY2lhbGl6ZWQgT3BlbkFJIG1vZGVsIHRoYXQgaXMgKipub3QqKiBwYXJ0IG9mIHRoZSBHaXRIdWJcbiAqIENvcGlsb3QgQ0FQSSBjYXRhbG9nLCBzbyBmb3J3YXJkaW5nIGl0IHZlcmJhdGltIHlpZWxkcyBhIDQwMFxuICogYG1vZGVsX25vdF9zdXBwb3J0ZWRgLiBUaGUgYXBwLXNlcnZlciB0cmVhdHMgdGhhdCBhcyB0aGUgcmV2aWV3IGhhdmluZ1xuICogKmZhaWxlZCogYW5kIHJlamVjdHMgdGhlIGFjdGlvbiBpbmxpbmUgKFwiQXV0b21hdGljIGFwcHJvdmFsIHJldmlldyBmYWlsZWRcIilcbiAqIHdpdGhvdXQgZXZlciBlbWl0dGluZyBhbiBgaXRlbS9hdXRvQXBwcm92YWxSZXZpZXcvY29tcGxldGVkYCBub3RpZmljYXRpb24gXHUyMDE0XG4gKiB3aGljaCBicmVha3MgdGhlIGVudGlyZSBBdXRvLXJldmlldyBwcmVzZXQuIFdlIHRyYW5zcGFyZW50bHkgcmVtYXAgaXQgb250b1xuICogdGhlIHNlc3Npb24ncyBwcmltYXJ5IG1vZGVsIChzZWUge0BsaW5rIElDb2RleFByb3h5U3RhdGUubGFzdFByaW1hcnlNb2RlbH0pXG4gKiBzbyB0aGUgcmV2aWV3ZXIgcnVucyBvbiBhIHN1cHBvcnRlZCBtb2RlbDsgb25seSB0aGUgdW5kZXJseWluZyBtb2RlbFxuICogZGlmZmVycywgdGhlIGFwcC1zZXJ2ZXIncyByZXZpZXcgaW5zdHJ1Y3Rpb25zIGFyZSB1bmNoYW5nZWQuXG4gKi9cbmNvbnN0IENPREVYX0FVVE9fUkVWSUVXX01PREVMID0gJ2NvZGV4LWF1dG8tcmV2aWV3JztcblxudHlwZSBJQ29kZXhQcm94eVJ1bnRpbWUgPSBJTG9vcGJhY2tQcm94eVJ1bnRpbWU8SUNvZGV4UHJveHlTdGF0ZT47XG5cbmNvbnN0IFBST1hZX1VTRVJfRkFDSU5HX05BTUUgPSAnQ29kZXhQcm94eVNlcnZpY2UnO1xuXG4vKipcbiAqIFVzZXItYWdlbnQgcHJlZml4IGFwcGxpZWQgdG8gb3V0Ym91bmQgQ0FQSSByZXF1ZXN0cyBzbyB0aGUgY29kZXggcHJveHknc1xuICogdHJhZmZpYyBpcyBpZGVudGlmaWFibGUgc2VydmVyLXNpZGUuIE1pcnJvcnMgYG9haUxhbmd1YWdlTW9kZWxTZXJ2ZXIudHNgXG4gKiBpbiB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbiwgd2hpY2ggdGFncyBDb2RleCByZXF1ZXN0cyB3aXRoIHRoZSBzYW1lXG4gKiBwcmVmaXguXG4gKi9cbmNvbnN0IFVTRVJfQUdFTlRfUFJFRklYID0gJ3ZzY29kZV9jb2RleCc7XG5cbi8qKlxuICogV2hlbiBzZXQgdG8gYW4gYWJzb2x1dGUgZGlyZWN0b3J5IHBhdGgsIGV2ZXJ5IGAvdjEvcmVzcG9uc2VzYCByZXF1ZXN0IGJvZHlcbiAqIGFuZCBpdHMgZnVsbCB1cHN0cmVhbSByZXNwb25zZSBzdHJlYW0gYXJlIHdyaXR0ZW4gdG8gdGhhdCBkaXJlY3RvcnkgYXNcbiAqIGByZXEtTk5OLTx0cz4uanNvbmAgYW5kIGByZXMtTk5OLTx0cz4udHh0YCBzbyB3ZSBjYW4gZGlmZiBib2RpZXMgLyBkZWNvZGVcbiAqIFNTRSB3aXRob3V0IGZsb29kaW5nIHRoZSBsb2cgY2hhbm5lbC4gT2ZmIGJ5IGRlZmF1bHQuXG4gKi9cbmNvbnN0IERFQlVHX0RVTVBfRElSX0VOViA9ICdWU0NPREVfQ09ERVhfUFJPWFlfRFVNUF9ESVInO1xuXG5sZXQgX2R1bXBTZXEgPSAwO1xuZnVuY3Rpb24gbmV4dER1bXBTZXEoKTogc3RyaW5nIHtcblx0cmV0dXJuIFN0cmluZygrK19kdW1wU2VxKS5wYWRTdGFydCg0LCAnMCcpO1xufVxuXG5mdW5jdGlvbiBnZXREdW1wRGlyKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGRpciA9IHByb2Nlc3MuZW52W0RFQlVHX0RVTVBfRElSX0VOVl07XG5cdGlmICghZGlyKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGZzLm1rZGlyU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdHJldHVybiBkaXI7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gd3JpdGVKc29uRXJyb3IocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBzdGF0dXM6IG51bWJlciwgdHlwZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0aWYgKHJlcy5oZWFkZXJzU2VudCB8fCByZXMud3JpdGFibGVFbmRlZCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRyZXMud3JpdGVIZWFkKHN0YXR1cywgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6IHsgdHlwZSwgbWVzc2FnZSB9IH0pKTtcbn1cblxuLyoqXG4gKiBMb2NhbCBIVFRQIHNlcnZlciB0aGF0IHNwZWFrcyB0aGUgT3BlbkFJIFJlc3BvbnNlcyBBUEkgb24gaXRzIGluYm91bmRcbiAqIHNpZGUgYW5kIGZvcndhcmRzIHRvIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2UucmVzcG9uc2VzfSBvbiB0aGVcbiAqIG91dGJvdW5kIHNpZGUuIFRoZSBjb2RleCBhcHAtc2VydmVyIGNvbm5lY3RzIHZpYSBlbnYgLyBgLS1jb25maWdcbiAqIG9wZW5haV9iYXNlX3VybD08YmFzZVVybD4vdjFgICsgQmVhcmVyIGA8bm9uY2U+YCBhbmQgc2VlcyB0aGlzIGFzIGFcbiAqIHJlYWwgT3BlbkFJIGVuZHBvaW50LlxuICpcbiAqIExpZmVjeWNsZTogcmVmY291bnRlZCBoYW5kbGVzLCBzaW5nbGUgc2hhcmVkIGJpbmQsIGluLWZsaWdodCByZXF1ZXN0c1xuICogYWJvcnRlZCBvbiB0ZWFyZG93bi5cbiAqL1xuZXhwb3J0IGNsYXNzIENvZGV4UHJveHlTZXJ2aWNlIGV4dGVuZHMgTG9vcGJhY2tQcm94eVNlcnZlcjxJQ29kZXhQcm94eVN0YXRlLCBzdHJpbmc+IGltcGxlbWVudHMgSUNvZGV4UHJveHlTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVTdGF0ZShnaXRodWJUb2tlbjogc3RyaW5nKTogSUNvZGV4UHJveHlTdGF0ZSB7XG5cdFx0cmV0dXJuIHsgZ2l0aHViVG9rZW4sIGxhc3RQcmltYXJ5TW9kZWw6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0YXN5bmMgc3RhcnQoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8SUNvZGV4UHJveHlIYW5kbGU+IHtcblx0XHRjb25zdCB7IHJ1bnRpbWUsIHJlbGVhc2UgfSA9IGF3YWl0IHRoaXMuYWNxdWlyZShnaXRodWJUb2tlbik7XG5cdFx0Ly8gTW9zdCByZWNlbnQgdG9rZW4gd2lucyBmb3IgdGhlIHJ1bnRpbWUgXHUyMDE0IHNpbmdsZS10ZW5hbnQgYXNzdW1wdGlvbi5cblx0XHQvLyBDb3ZlcnMgY29uY3VycmVudCBjYWxsZXJzIHRoYXQgYXdhaXRlZCB0aGUgc2FtZSBiaW5kLlxuXHRcdHJ1bnRpbWUuc3RhdGUuZ2l0aHViVG9rZW4gPSBnaXRodWJUb2tlbjtcblxuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRiYXNlVXJsOiBydW50aW1lLmJhc2VVcmwsXG5cdFx0XHRub25jZTogcnVudGltZS5ub25jZSxcblx0XHRcdHNldFRva2VuOiAobmV3VG9rZW46IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBzaGFyZWQgcnVudGltZSdzIHRva2VuIGNlbGwuIEluLWZsaWdodCByZXF1ZXN0c1xuXHRcdFx0XHQvLyBrZWVwIHRoZSB2YWx1ZSB0aGV5IGNhcHR1cmVkIGF0IGRpc3BhdGNoOyBuZXcgcmVxdWVzdHNcblx0XHRcdFx0Ly8gcGljayB1cCB0aGUgZnJlc2ggdmFsdWUgb24gYF9oYW5kbGVSZXNwb25zZXNgLlxuXHRcdFx0XHRydW50aW1lLnN0YXRlLmdpdGh1YlRva2VuID0gbmV3VG9rZW47XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRyZWxlYXNlKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgaGFuZGxlUmVxdWVzdChcblx0XHRyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLFxuXHRcdHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcblx0XHRydW50aW1lOiBJQ29kZXhQcm94eVJ1bnRpbWUsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1ldGhvZCA9IHJlcS5tZXRob2QgPz8gJ0dFVCc7XG5cdFx0Y29uc3QgcGF0aG5hbWUgPSBuZXcgVVJMKHJlcS51cmwgPz8gJy8nLCAnaHR0cDovLzEyNy4wLjAuMScpLnBhdGhuYW1lO1xuXHRcdGNvbnN0IGluY29taW5nSGVhZGVycyA9IE9iamVjdC5rZXlzKHJlcS5oZWFkZXJzKS5qb2luKCcsICcpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dID4+PiAke21ldGhvZH0gJHtwYXRobmFtZX0gKGhlYWRlcnM6ICR7aW5jb21pbmdIZWFkZXJzfSlgKTtcblxuXHRcdGlmIChtZXRob2QgPT09ICdHRVQnICYmIHBhdGhuYW1lID09PSAnLycpIHtcblx0XHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0XHRyZXMuZW5kKCdvaycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvZGV4IENMSSBzZW5kcyBgQmVhcmVyIDxub25jZT5gIFx1MjAxNCBwbGFpbiBub25jZSwgbm8gc2Vzc2lvbklkIHN1ZmZpeC5cblx0XHRjb25zdCBhdXRoSGVhZGVyID0gcmVxLmhlYWRlcnNbJ2F1dGhvcml6YXRpb24nXTtcblx0XHRjb25zdCBleHBlY3RlZCA9IGBCZWFyZXIgJHtydW50aW1lLm5vbmNlfWA7XG5cdFx0aWYgKHR5cGVvZiBhdXRoSGVhZGVyICE9PSAnc3RyaW5nJyB8fCBhdXRoSGVhZGVyICE9PSBleHBlY3RlZCkge1xuXHRcdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDEsICdhdXRoZW50aWNhdGlvbl9lcnJvcicsICdJbnZhbGlkIGF1dGhlbnRpY2F0aW9uJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1ldGhvZCA9PT0gJ0dFVCcgJiYgcGF0aG5hbWUgPT09ICcvdjEvbW9kZWxzJykge1xuXHRcdFx0Ly8gVGhlIENvZGV4IGVuZHBvaW50IGV4cGVjdHMgaXRzIG93biByaWNoIGBNb2RlbHNSZXNwb25zZWAgc2NoZW1hLCBub3Rcblx0XHRcdC8vIENBUEkncyBtb2RlbCBzaGFwZS4gVlMgQ29kZSBhbHJlYWR5IG93bnMgQ0FQSSBtb2RlbCBkaXNjb3ZlcnkgYW5kXG5cdFx0XHQvLyBzdXBwbGllcyB0aGUgc2VsZWN0ZWQgbW9kZWwgd2hlbiBzdGFydGluZyBhIHR1cm4sIHNvIGFuIGVtcHR5IHJlbW90ZVxuXHRcdFx0Ly8gY2F0YWxvZyBrZWVwcyBDb2RleCdzIGJ1bmRsZWQgbW9kZWwgbWV0YWRhdGEgd2hpbGUgYXZvaWRpbmcgYSBub2lzeVxuXHRcdFx0Ly8gcmVmcmVzaCBmYWlsdXJlIG9uIGV2ZXJ5IHByb3h5LWJhY2tlZCBydW50aW1lIHN0YXJ0LlxuXHRcdFx0cmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcblx0XHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBtb2RlbHM6IFtdIH0pKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb2RleCBzZW5kcyBgL3YxL3Jlc3BvbnNlc2AsIGAvL3Jlc3BvbnNlc2AgKHdoZW4gYmFzZV91cmwgZW5kcyBpbiBgL2ApLFxuXHRcdC8vIG9yIHBsYWluIGAvcmVzcG9uc2VzYC4gQWNjZXB0IGFsbCB0aHJlZS5cblx0XHRpZiAobWV0aG9kID09PSAnUE9TVCcgJiYgKHBhdGhuYW1lID09PSAnL3YxL3Jlc3BvbnNlcycgfHwgcGF0aG5hbWUgPT09ICcvcmVzcG9uc2VzJyB8fCBwYXRobmFtZSA9PT0gJy8vcmVzcG9uc2VzJykpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZVJlc3BvbnNlcyhyZXEsIHJlcywgcnVudGltZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0d3JpdGVKc29uRXJyb3IocmVzLCA0MDQsICdub3RfZm91bmRfZXJyb3InLCBgTm8gcm91dGUgZm9yICR7bWV0aG9kfSAke3BhdGhuYW1lfWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUmVzcG9uc2VzKFxuXHRcdHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsXG5cdFx0cmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLFxuXHRcdHJ1bnRpbWU6IElDb2RleFByb3h5UnVudGltZSxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGJvZHk6IHN0cmluZztcblx0XHR0cnkge1xuXHRcdFx0Ym9keSA9IGF3YWl0IHJlYWRQcm94eVJlcXVlc3RCb2R5KHJlcSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDQwMCwgJ2ludmFsaWRfcmVxdWVzdF9lcnJvcicsIGBGYWlsZWQgdG8gcmVhZCByZXF1ZXN0IGJvZHk6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbWFwIHRoZSB1bnN1cHBvcnRlZCBhdXRvLXJldmlldyByZXZpZXdlciBtb2RlbCBvbnRvIHRoZSBzZXNzaW9uJ3Ncblx0XHQvLyBwcmltYXJ5IG1vZGVsIGJlZm9yZSBmb3J3YXJkaW5nLCBzbyB0aGUgXCJBdXRvLXJldmlld1wiIHByZXNldCB3b3Jrc1xuXHRcdC8vIGFnYWluc3QgdGhlIENvcGlsb3QgQ0FQSSAod2hpY2ggZG9lcyBub3QgZXhwb3NlIGBjb2RleC1hdXRvLXJldmlld2ApLlxuXHRcdC8vIEFsbCBkb3duc3RyZWFtIGhhbmRsaW5nIChkdW1wLCBsb2dnaW5nLCBmb3J3YXJkKSB1c2VzIHRoZSBvdXRib3VuZFxuXHRcdC8vIGJvZHkgc28gbG9ncyByZWZsZWN0IGV4YWN0bHkgd2hhdCBpcyBzZW50IHVwc3RyZWFtLlxuXHRcdGNvbnN0IHJlbWFwID0gcmVtYXBDb2RleFJldmlld2VyTW9kZWwoYm9keSwgcnVudGltZS5zdGF0ZSk7XG5cdFx0aWYgKHJlbWFwLnJlbWFwcGVkRnJvbSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gcmVtYXBwZWQgdW5zdXBwb3J0ZWQgcmV2aWV3ZXIgbW9kZWwgJyR7cmVtYXAucmVtYXBwZWRGcm9tfScgLT4gJyR7cmVtYXAucmVtYXBwZWRUb30nYCk7XG5cdFx0fVxuXHRcdGJvZHkgPSByZW1hcC5ib2R5O1xuXG5cdFx0Y29uc3QgZHVtcERpciA9IGdldER1bXBEaXIoKTtcblx0XHRjb25zdCBkdW1wU2VxID0gZHVtcERpciA/IG5leHREdW1wU2VxKCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGR1bXBEaXIgJiYgZHVtcFNlcSkge1xuXHRcdFx0Y29uc3QgcmVxRmlsZSA9IGpvaW4oZHVtcERpciwgYHJlcS0ke2R1bXBTZXF9LSR7RGF0ZS5ub3coKX0uanNvbmApO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZnMud3JpdGVGaWxlU3luYyhyZXFGaWxlLCBib2R5KTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gZHVtcGVkIHJlcXVlc3QgYm9keSB0byAke3JlcUZpbGV9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gZmFpbGVkIHRvIGR1bXAgcmVxdWVzdCBib2R5OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoYm9keSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSA+Pj4gL3Jlc3BvbnNlcyBib2R5OiBtb2RlbD0ke3BhcnNlZC5tb2RlbCA/PyAnPG5vbmU+J30sIHByZXZpb3VzX3Jlc3BvbnNlX2lkPSR7cGFyc2VkLnByZXZpb3VzX3Jlc3BvbnNlX2lkID8/ICc8bm9uZT4nfSwgc3RyZWFtPSR7cGFyc2VkLnN0cmVhbSA/PyAnPG5vbmU+J30sIGlucHV0X2l0ZW1zPSR7QXJyYXkuaXNBcnJheShwYXJzZWQuaW5wdXQpID8gcGFyc2VkLmlucHV0Lmxlbmd0aCA6ICc8bm90LWFycmF5Pid9YCk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWQuaW5wdXQpKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGFyc2VkLmlucHV0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IHBhcnNlZC5pbnB1dFtpXTtcblx0XHRcdFx0XHRjb25zdCB0eXBlID0gaXRlbT8udHlwZSA/PyAnPG5vbmU+Jztcblx0XHRcdFx0XHRjb25zdCBrZXlzID0gaXRlbSAmJiB0eXBlb2YgaXRlbSA9PT0gJ29iamVjdCcgPyBPYmplY3Qua2V5cyhpdGVtKS5qb2luKCcsJykgOiB0eXBlb2YgaXRlbTtcblx0XHRcdFx0XHRsZXQgZGV0YWlsID0gJyc7XG5cdFx0XHRcdFx0aWYgKHR5cGUgPT09ICdtZXNzYWdlJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGV4dDogc3RyaW5nID0gaXRlbT8uY29udGVudD8uWzBdPy50ZXh0ID8/ICcnO1xuXHRcdFx0XHRcdFx0ZGV0YWlsID0gYHJvbGU9JHtpdGVtPy5yb2xlID8/ICc/J30gY2hhcnM9JHt0ZXh0Lmxlbmd0aH1gO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gJ2Z1bmN0aW9uX2NhbGwnKSB7XG5cdFx0XHRcdFx0XHRkZXRhaWwgPSBgbmFtZT0ke2l0ZW0/Lm5hbWUgPz8gJz8nfSBjYWxsX2lkPSR7aXRlbT8uY2FsbF9pZCA/PyAnPyd9YDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09ICdmdW5jdGlvbl9jYWxsX291dHB1dCcpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG91dHB1dCA9IGl0ZW0/Lm91dHB1dCA/PyAnJztcblx0XHRcdFx0XHRcdGRldGFpbCA9IGBjYWxsX2lkPSR7aXRlbT8uY2FsbF9pZCA/PyAnPyd9IG91dHB1dF9jaGFycz0ke3R5cGVvZiBvdXRwdXQgPT09ICdzdHJpbmcnID8gb3V0cHV0Lmxlbmd0aCA6IDB9YDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09ICdyZWFzb25pbmcnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzdW1tYXJ5ID0gaXRlbT8uc3VtbWFyeSA/PyBpdGVtPy5jb250ZW50ID8/ICcnO1xuXHRcdFx0XHRcdFx0ZGV0YWlsID0gYHN1bW1hcnlfY2hhcnM9JHt0eXBlb2Ygc3VtbWFyeSA9PT0gJ3N0cmluZycgPyBzdW1tYXJ5Lmxlbmd0aCA6IEpTT04uc3RyaW5naWZ5KHN1bW1hcnkpLmxlbmd0aH0gZW5jcnlwdGVkPSR7dHlwZW9mIGl0ZW0/LmVuY3J5cHRlZF9jb250ZW50ID09PSAnc3RyaW5nJ31gO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkZXRhaWwgPSBKU09OLnN0cmluZ2lmeShpdGVtKS5zbGljZSgwLCAxMjApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSAgIGlucHV0WyR7aX1dIHR5cGU9JHt0eXBlfSBrZXlzPVske2tleXN9XSAke2RldGFpbH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9wTGV2ZWxLZXlzID0gT2JqZWN0LmtleXMocGFyc2VkKS5maWx0ZXIoayA9PiBrICE9PSAnaW5wdXQnKS5zb3J0KCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSAgIHRvcC1sZXZlbCBrZXlzIChleGNsLiBpbnB1dCk9WyR7dG9wTGV2ZWxLZXlzLmpvaW4oJywgJyl9XWApO1xuXHRcdFx0Zm9yIChjb25zdCBrIG9mIHRvcExldmVsS2V5cykge1xuXHRcdFx0XHRpZiAoayA9PT0gJ2luc3RydWN0aW9ucycgfHwgayA9PT0gJ3Rvb2xzJykge1xuXHRcdFx0XHRcdGNvbnN0IHYgPSBwYXJzZWRba107XG5cdFx0XHRcdFx0Y29uc3Qgc2l6ZSA9IHR5cGVvZiB2ID09PSAnc3RyaW5nJyA/IHYubGVuZ3RoIDogSlNPTi5zdHJpbmdpZnkodikubGVuZ3RoO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dICAgICAke2t9PTwke3NpemV9IGNoYXJzIGVsaWRlZD5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB2ID0gcGFyc2VkW2tdO1xuXHRcdFx0XHRjb25zdCBwcmV2aWV3ID0gdHlwZW9mIHYgPT09ICdvYmplY3QnID8gSlNPTi5zdHJpbmdpZnkodikuc2xpY2UoMCwgMzAwKSA6IFN0cmluZyh2KTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gICAgICR7a309JHtwcmV2aWV3fWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gPj4+IC9yZXNwb25zZXMgYm9keSAodW5wYXJzZWFibGUpOiAke2JvZHkuc2xpY2UoMCwgMjAwKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyeTogSVByb3h5SW5GbGlnaHQgPSB7IGFjOiBuZXcgQWJvcnRDb250cm9sbGVyKCksIHJlcywgY2xpZW50R29uZTogZmFsc2UgfTtcblx0XHRydW50aW1lLmluRmxpZ2h0LmFkZChlbnRyeSk7XG5cdFx0Y29uc3Qgb25DbG9zZSA9ICgpID0+IHtcblx0XHRcdGVudHJ5LmNsaWVudEdvbmUgPSB0cnVlO1xuXHRcdFx0ZW50cnkuYWMuYWJvcnQoKTtcblx0XHR9O1xuXHRcdHJlcy5vbignY2xvc2UnLCBvbkNsb3NlKTtcblxuXHRcdC8vIFNuYXBzaG90IHRoZSB0b2tlbiBhdCBkaXNwYXRjaCB0aW1lIHNvIGFuIGluLWZsaWdodCByZXF1ZXN0IGtlZXBzXG5cdFx0Ly8gdXNpbmcgdGhlIHZhbHVlIGl0IHN0YXJ0ZWQgd2l0aDsgc3Vic2VxdWVudCByZXF1ZXN0cyB3aWxsIHBpY2sgdXBcblx0XHQvLyB3aGF0ZXZlciBgcnVudGltZS5zdGF0ZS5naXRodWJUb2tlbmAgaGFzIGJlZW4gcm90YXRlZCB0by5cblx0XHRjb25zdCBkaXNwYXRjaGVkVG9rZW4gPSBydW50aW1lLnN0YXRlLmdpdGh1YlRva2VuO1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IGJ1aWxkT3V0Ym91bmRIZWFkZXJzKHJlcS5oZWFkZXJzKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSBmb3J3YXJkaW5nIHRvIENBUEkgcmVzcG9uc2VzLi4uYCk7XG5cdFx0XHRjb25zdCB1cHN0cmVhbSA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc3BvbnNlcyhkaXNwYXRjaGVkVG9rZW4sIGJvZHksIHsgaGVhZGVycywgc2lnbmFsOiBlbnRyeS5hYy5zaWduYWwsIHN1cHByZXNzSW50ZWdyYXRpb25JZDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IGNvbnRlbnRUeXBlID0gdXBzdHJlYW0uaGVhZGVycy5nZXQoJ2NvbnRlbnQtdHlwZScpID8/ICdhcHBsaWNhdGlvbi9qc29uJztcblx0XHRcdGNvbnN0IHVwc3RyZWFtSGVhZGVycyA9IFsuLi51cHN0cmVhbS5oZWFkZXJzLmVudHJpZXMoKV0ubWFwKChbaywgdl0pID0+IGAke2t9OiAke3Z9YCkuam9pbignLCAnKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIDw8PCBDQVBJIHJlc3BvbnNlOiBzdGF0dXM9JHt1cHN0cmVhbS5zdGF0dXN9LCBjb250ZW50VHlwZT0ke2NvbnRlbnRUeXBlfSwgaGVhZGVycz1bJHt1cHN0cmVhbUhlYWRlcnN9XWApO1xuXHRcdFx0cmVzLndyaXRlSGVhZCh1cHN0cmVhbS5zdGF0dXMsIHsgJ0NvbnRlbnQtVHlwZSc6IGNvbnRlbnRUeXBlIH0pO1xuXHRcdFx0aWYgKCF1cHN0cmVhbS5ib2R5KSB7XG5cdFx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVhZGVyID0gdXBzdHJlYW0uYm9keS5nZXRSZWFkZXIoKTtcblx0XHRcdGNvbnN0IHJlc0R1bXBTdHJlYW0gPSBkdW1wRGlyICYmIGR1bXBTZXFcblx0XHRcdFx0PyBmcy5jcmVhdGVXcml0ZVN0cmVhbShqb2luKGR1bXBEaXIsIGByZXMtJHtkdW1wU2VxfS0ke0RhdGUubm93KCl9LnR4dGApKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGxldCBzc2VCdWYgPSAnJztcblx0XHRcdGNvbnN0IGV2ZW50Q291bnRzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRcdGNvbnN0IHsgZG9uZSwgdmFsdWUgfSA9IGF3YWl0IHJlYWRlci5yZWFkKCk7XG5cdFx0XHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW50cnkuY2xpZW50R29uZSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh2YWx1ZSAmJiB2YWx1ZS5ieXRlTGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYnVmID0gQnVmZmVyLmZyb20odmFsdWUpO1xuXHRcdFx0XHRcdFx0cmVzLndyaXRlKGJ1Zik7XG5cdFx0XHRcdFx0XHRpZiAocmVzRHVtcFN0cmVhbSkge1xuXHRcdFx0XHRcdFx0XHRyZXNEdW1wU3RyZWFtLndyaXRlKGJ1Zik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzc2VCdWYgKz0gYnVmLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0XHRcdFx0XHRsZXQgbmw6IG51bWJlcjtcblx0XHRcdFx0XHRcdHdoaWxlICgobmwgPSBzc2VCdWYuaW5kZXhPZignXFxuJykpID49IDApIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGluZSA9IHNzZUJ1Zi5zbGljZSgwLCBubCkudHJpbUVuZCgpO1xuXHRcdFx0XHRcdFx0XHRzc2VCdWYgPSBzc2VCdWYuc2xpY2UobmwgKyAxKTtcblx0XHRcdFx0XHRcdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnZXZlbnQ6JykpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBldiA9IGxpbmUuc2xpY2UoJ2V2ZW50OicubGVuZ3RoKS50cmltKCk7XG5cdFx0XHRcdFx0XHRcdFx0ZXZlbnRDb3VudHNbZXZdID0gKGV2ZW50Q291bnRzW2V2XSA/PyAwKSArIDE7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRyeSB7IHJlYWRlci5yZWxlYXNlTG9jaygpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0cmVzRHVtcFN0cmVhbT8uZW5kKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMoZXZlbnRDb3VudHMpLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBzdW1tYXJ5ID0gT2JqZWN0LmVudHJpZXMoZXZlbnRDb3VudHMpLm1hcCgoW2ssIHZdKSA9PiBgJHtrfT0ke3Z9YCkuam9pbignLCAnKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gPDw8IFNTRSBldmVudCBjb3VudHM6ICR7c3VtbWFyeX1gKTtcblx0XHRcdH1cblx0XHRcdHJlcy5lbmQoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlbnRyeS5jbGllbnRHb25lKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7UFJPWFlfVVNFUl9GQUNJTkdfTkFNRX1dIGNsaWVudCBkaXNjb25uZWN0ZWQgZHVyaW5nIHVwc3RyZWFtIGNhbGxgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIENvcGlsb3RBcGlFcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbJHtQUk9YWV9VU0VSX0ZBQ0lOR19OQU1FfV0gQ0FQSSBlcnJvcjogc3RhdHVzPSR7ZXJyLnN0YXR1c30sIG1lc3NhZ2U9JHtlcnIubWVzc2FnZX1gKTtcblx0XHRcdFx0Y29uc3QgbWFya2VyID0gZW5jb2RlRm9yd2FyZGVkQ2hhdEVycm9yKGJ1aWxkRm9yd2FyZGVkQ2hhdEVycm9yKGVycikpO1xuXHRcdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIGVyci5zdGF0dXMsICdhcGlfZXJyb3InLCBgJHtlcnIubWVzc2FnZX0gJHttYXJrZXJ9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFske1BST1hZX1VTRVJfRkFDSU5HX05BTUV9XSB1cHN0cmVhbSBlcnJvcjogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR3cml0ZUpzb25FcnJvcihyZXMsIDUwMiwgJ2FwaV9lcnJvcicsIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlcy5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbkNsb3NlKTtcblx0XHRcdHJ1bnRpbWUuaW5GbGlnaHQuZGVsZXRlKGVudHJ5KTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBDb21wdXRlIHRoZSBvdXRib3VuZCBgL3YxL3Jlc3BvbnNlc2AgYm9keSwgdHJhbnNwYXJlbnRseSByZW1hcHBpbmcgdGhlXG4gKiB1bnN1cHBvcnRlZCBDb2RleCBhdXRvLXJldmlldyByZXZpZXdlciBtb2RlbCAoc2VlXG4gKiB7QGxpbmsgQ09ERVhfQVVUT19SRVZJRVdfTU9ERUx9KSBvbnRvIHRoZSBsYXN0LXNlZW4gcHJpbWFyeSBtb2RlbC4gUmVjb3Jkc1xuICogdGhlIHByaW1hcnkgbW9kZWwgb24gYHN0YXRlYCBhcyBhIHNpZGUgZWZmZWN0IHNvIGEgbGF0ZXIgcmV2aWV3ZXIgcmVxdWVzdFxuICogY2FuIGJlIHJlbWFwcGVkLlxuICpcbiAqIFJldHVybnMgdGhlIG9yaWdpbmFsIGJvZHkgdW50b3VjaGVkIFx1MjAxNCBhbmQgZm9yd2FyZHMgdmVyYmF0aW0sIGV4YWN0bHkgYXNcbiAqIGJlZm9yZSBcdTIwMTQgd2hlbiBpdCBpcyB1bnBhcnNlYWJsZSwgY2FycmllcyBubyBgbW9kZWxgLCBhbHJlYWR5IHVzZXMgYSBwcmltYXJ5XG4gKiBtb2RlbCwgb3Igd2hlbiBubyBwcmltYXJ5IG1vZGVsIGhhcyBiZWVuIG9ic2VydmVkIHlldCAoZ3JhY2VmdWxcbiAqIGRlZ3JhZGF0aW9uOiB0aGUgcmV2aWV3ZXIgcmVxdWVzdCBzdGlsbCA0MDBzLCBpLmUuIG5vIHdvcnNlIHRoYW4gbm90XG4gKiByZW1hcHBpbmcgYXQgYWxsKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbWFwQ29kZXhSZXZpZXdlck1vZGVsKFxuXHRib2R5OiBzdHJpbmcsXG5cdHN0YXRlOiB7IGxhc3RQcmltYXJ5TW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZCB9LFxuKTogeyByZWFkb25seSBib2R5OiBzdHJpbmc7IHJlYWRvbmx5IHJlbWFwcGVkRnJvbT86IHN0cmluZzsgcmVhZG9ubHkgcmVtYXBwZWRUbz86IHN0cmluZyB9IHtcblx0bGV0IHBhcnNlZDogeyBtb2RlbD86IHVua25vd24gfTtcblx0dHJ5IHtcblx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKGJvZHkpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4geyBib2R5IH07XG5cdH1cblx0Y29uc3QgbW9kZWwgPSB0eXBlb2YgcGFyc2VkLm1vZGVsID09PSAnc3RyaW5nJyA/IHBhcnNlZC5tb2RlbCA6IHVuZGVmaW5lZDtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybiB7IGJvZHkgfTtcblx0fVxuXHRpZiAobW9kZWwgIT09IENPREVYX0FVVE9fUkVWSUVXX01PREVMKSB7XG5cdFx0Ly8gQSBub3JtYWwgdHVybiByZXF1ZXN0IFx1MjAxNCByZW1lbWJlciBpdHMgbW9kZWwgc28gd2UgY2FuIHN1YnN0aXR1dGUgaXRcblx0XHQvLyBmb3IgYSBzdWJzZXF1ZW50IHJldmlld2VyIHJlcXVlc3QuXG5cdFx0c3RhdGUubGFzdFByaW1hcnlNb2RlbCA9IG1vZGVsO1xuXHRcdHJldHVybiB7IGJvZHkgfTtcblx0fVxuXHRjb25zdCB0YXJnZXQgPSBzdGF0ZS5sYXN0UHJpbWFyeU1vZGVsO1xuXHRpZiAoIXRhcmdldCkge1xuXHRcdHJldHVybiB7IGJvZHkgfTtcblx0fVxuXHQocGFyc2VkIGFzIHsgbW9kZWw6IHN0cmluZyB9KS5tb2RlbCA9IHRhcmdldDtcblx0cmV0dXJuIHsgYm9keTogSlNPTi5zdHJpbmdpZnkocGFyc2VkKSwgcmVtYXBwZWRGcm9tOiBtb2RlbCwgcmVtYXBwZWRUbzogdGFyZ2V0IH07XG59XG5cblxuZnVuY3Rpb24gYnVpbGRPdXRib3VuZEhlYWRlcnMoaW5ib3VuZDogaHR0cC5JbmNvbWluZ0h0dHBIZWFkZXJzKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG5cdGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRjb25zdCB1c2VyQWdlbnQgPSBpbmJvdW5kWyd1c2VyLWFnZW50J107XG5cdGlmICh0eXBlb2YgdXNlckFnZW50ID09PSAnc3RyaW5nJyAmJiB1c2VyQWdlbnQubGVuZ3RoID4gMCkge1xuXHRcdG91dFsnVXNlci1BZ2VudCddID0gdHJhbnNmb3JtVXNlckFnZW50KHVzZXJBZ2VudCk7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuLyoqXG4gKiBUcmFuc2Zvcm0gYW4gaW5jb21pbmcgdXNlci1hZ2VudCBzdHJpbmcgYnkgcmVwbGFjaW5nIHRoZSBjbGllbnQgbmFtZSBwb3J0aW9uXG4gKiAoYmVmb3JlIHRoZSBmaXJzdCBgL2ApIHdpdGgge0BsaW5rIFVTRVJfQUdFTlRfUFJFRklYfS4gVGhpcyBtaXJyb3JzIHRoZVxuICogdHJhbnNmb3JtIGluIGBvYWlMYW5ndWFnZU1vZGVsU2VydmVyLnRzYCBpbiB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbixcbiAqIGVuc3VyaW5nIGFsbCBDb2RleCByZXF1ZXN0cyBhcmUgdGFnZ2VkIHdpdGggYSBjb25zaXN0ZW50IHByZWZpeCBmb3JcbiAqIHNlcnZlci1zaWRlIGlkZW50aWZpY2F0aW9uLlxuICpcbiAqIEV4YW1wbGVzOlxuICogLSBgY29kZXgvMS4yLjNgIFx1MjE5MiBgdnNjb2RlX2NvZGV4LzEuMi4zYFxuICogLSBgT3BlbkFJL1B5dGhvbi8xLjBgIFx1MjE5MiBgdnNjb2RlX2NvZGV4L1B5dGhvbi8xLjBgXG4gKiAtIGB1bmtub3duYCBcdTIxOTIgYHZzY29kZV9jb2RleC91bmtub3duYFxuICovXG5mdW5jdGlvbiB0cmFuc2Zvcm1Vc2VyQWdlbnQodXNlckFnZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzbGFzaEluZGV4ID0gdXNlckFnZW50LmluZGV4T2YoJy8nKTtcblx0aWYgKHNsYXNoSW5kZXggPT09IC0xKSB7XG5cdFx0cmV0dXJuIGAke1VTRVJfQUdFTlRfUFJFRklYfS8ke3VzZXJBZ2VudH1gO1xuXHR9XG5cdHJldHVybiBgJHtVU0VSX0FHRU5UX1BSRUZJWH0ke3VzZXJBZ2VudC5zdWJzdHJpbmcoc2xhc2hJbmRleCl9YDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQiwwQkFBMEI7QUFDcEQsU0FBUyx5QkFBeUIsZ0NBQWdDO0FBQ2xFO0FBQUEsRUFJQztBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBNENBLE1BQU0scUJBQXFCLGdCQUFvQyxtQkFBbUI7QUF1Q3pGLE1BQU0sMEJBQTBCO0FBSWhDLE1BQU0seUJBQXlCO0FBUS9CLE1BQU0sb0JBQW9CO0FBUTFCLE1BQU0scUJBQXFCO0FBRTNCLElBQUksV0FBVztBQUNmLFNBQVMsY0FBc0I7QUFDOUIsU0FBTyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQzFDO0FBRUEsU0FBUyxhQUFpQztBQUN6QyxRQUFNLE1BQU0sUUFBUSxJQUFJLGtCQUFrQjtBQUMxQyxNQUFJLENBQUMsS0FBSztBQUNULFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSTtBQUNILE9BQUcsVUFBVSxLQUFLLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDckMsV0FBTztBQUFBLEVBQ1IsUUFBUTtBQUNQLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLGVBQWUsS0FBMEIsUUFBZ0Is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
