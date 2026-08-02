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
import { CAPIClient, RequestType } from "@vscode/copilot-api";
import { generateUuid } from "../../../../base/common/uuid.js";
import { getDevDeviceId, getMachineId } from "../../../../base/node/id.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { COPILOT_LICENSE_AGREEMENT } from "../../../endpoint/common/licenseAgreement.js";
import { parseCopilotTokenFields } from "../copilot/copilotTokenFields.js";
const COPILOT_API_ERROR_STATUS_STREAMING = 520;
const CAPI_CONTEXT_REFRESH_BUFFER_SECONDS = 5 * 60;
const CAPI_CONTEXT_TTL_SECONDS = 30 * 60;
const USER_API_VERSION = "2025-04-01";
const CAPI_URL_OVERRIDE_ENV = "VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE";
const CAPI_URL_OVERRIDE_SMOKE_TEST_HOST = "vscode-smoke.test";
const CAPI_URL_OVERRIDE_SMOKE_TEST_ENV = "VSCODE_SMOKE_TEST_PROXY_HEADER";
function isLoopbackUrl(url) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}
function isAllowedCapiUrlOverride(url) {
  if (isLoopbackUrl(url)) {
    return true;
  }
  if (!process.env[CAPI_URL_OVERRIDE_SMOKE_TEST_ENV]) {
    return false;
  }
  try {
    return new URL(url).hostname.toLowerCase() === CAPI_URL_OVERRIDE_SMOKE_TEST_HOST;
  } catch {
    return false;
  }
}
const COPILOT_TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60;
const UTILITY_DEFAULT_MODEL_FAMILY = "gpt-4o-mini";
const UTILITY_DEFAULT_TEMPERATURE = 0.1;
const UTILITY_DEFAULT_TOP_P = 1;
const UTILITY_INTENT = "conversation-background";
const INTERNAL_COPILOT_ORGANIZATIONS = /* @__PURE__ */ new Set([
  "4535c7beffc844b46bb1ed4aa04d759a",
  "a5db0bcaae94032fe715fb34a5e4bce2",
  "7184f66dfcee98cb5f08a1cb936d5225",
  "1cb18ac6eedd49b43d74a1c5beb0b955",
  "ea9395b9a9248c05ee6847cbd24355ed"
]);
const VSCODE_COPILOT_ORGANIZATIONS = /* @__PURE__ */ new Set(["551cca60ce19654d894e786220822482"]);
class CopilotApiError extends Error {
  /**
   * @param status HTTP status from the originating CAPI response, or
   *   {@link COPILOT_API_ERROR_STATUS_STREAMING} for mid-stream SSE errors.
   * @param envelope Anthropic-format error envelope. For HTTP errors with a
   *   non-conforming body (plain text, malformed JSON, missing fields) this
   *   is synthesized; for conforming bodies and SSE frames it is the
   *   server's envelope verbatim.
   * @param message Optional override for `Error.message`. Defaults to
   *   `envelope.error.message`. **Never includes auth tokens.**
   */
  constructor(status, envelope, message) {
    super(message ?? envelope.error.message);
    this.status = status;
    this.envelope = envelope;
    this.name = "CopilotApiError";
  }
}
function buildCopilotApiHttpError(status, statusText, bodyText, prefix = "CAPI request failed") {
  let envelope;
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === "object" && parsed.type === "error") {
        const err = parsed.error;
        if (err && typeof err === "object" && typeof err.type === "string" && typeof err.message === "string") {
          envelope = parsed;
        }
      }
    } catch {
    }
  }
  if (!envelope) {
    envelope = {
      type: "error",
      error: {
        type: "api_error",
        message: bodyText || `${status} ${statusText}`
      },
      request_id: null
    };
  }
  return new CopilotApiError(
    status,
    envelope,
    `${prefix}: ${status} ${statusText} \u2014 ${envelope.error.message}`
  );
}
const ICopilotApiService = createDecorator("copilotApiService");
let CopilotApiService = class {
  constructor(fetchFn, _logService, _productService, _gitHubEndpointService) {
    this._logService = _logService;
    this._productService = _productService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._capiBasePromise = null;
    this._clientsByToken = /* @__PURE__ */ new Map();
    this._copilotTokensByGithub = /* @__PURE__ */ new Map();
    this._fetch = fetchFn ?? globalThis.fetch;
  }
  messages(githubToken, request, options) {
    if (request.stream) {
      return this._messagesStreaming(githubToken, request, options);
    }
    return this._messagesNonStreaming(githubToken, request, options);
  }
  async countTokens(_githubToken, _req, _options) {
    throw new Error("countTokens not supported by CAPI");
  }
  async models(githubToken, options) {
    const capiClient = await this._getClientForToken(githubToken);
    this._logService.debug("[CopilotApiService] GET models");
    const response = await capiClient.makeRequest(
      {
        method: "GET",
        headers: {
          ...options?.headers,
          "Authorization": `Bearer ${githubToken}`
        },
        // Opt-in per request — see
        // `ICopilotApiServiceRequestOptions.suppressIntegrationId`.
        suppressIntegrationId: options?.suppressIntegrationId,
        signal: options?.signal
      },
      { type: RequestType.Models }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateClientForToken(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text, "CAPI models request failed");
    }
    const json = await response.json();
    return json.data ?? [];
  }
  async responses(githubToken, body, options) {
    const capiClient = await this._getClientForToken(githubToken);
    const requestId = generateUuid();
    let requestModel = "<unknown>";
    try {
      const parsed = JSON.parse(body);
      requestModel = parsed.model ?? "<none>";
    } catch {
    }
    this._logService.info(`[CopilotApiService] POST responses: requestId=${requestId}, model=${requestModel}`);
    const response = await capiClient.makeRequest(
      {
        method: "POST",
        headers: {
          ...options?.headers,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${githubToken}`,
          "X-Request-Id": requestId,
          "OpenAI-Intent": "conversation"
        },
        // Opt-in per request — see
        // `ICopilotApiServiceRequestOptions.suppressIntegrationId`.
        suppressIntegrationId: options?.suppressIntegrationId,
        body,
        signal: options?.signal
      },
      { type: RequestType.ChatResponses }
    );
    this._logService.info(`[CopilotApiService] responses status=${response.status}, requestId=${requestId}`);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateClientForToken(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text, "CAPI responses request failed");
    }
    return response;
  }
  async utilityChatCompletion(githubToken, request, options) {
    const capiClient = await this._getClientForToken(githubToken);
    const copilotToken = await this._getCopilotToken(githubToken);
    const modelId = await this._resolveUtilityModelId(githubToken, UTILITY_DEFAULT_MODEL_FAMILY);
    const requestId = generateUuid();
    this._logService.debug("[CopilotApiService] POST chat completions", `model=${modelId} requestId=${requestId}`);
    const body = JSON.stringify({
      model: modelId,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      temperature: request.temperature ?? UTILITY_DEFAULT_TEMPERATURE,
      top_p: UTILITY_DEFAULT_TOP_P,
      max_tokens: request.maxTokens
    });
    const response = await capiClient.makeRequest(
      {
        method: "POST",
        headers: {
          ...options?.headers,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${copilotToken}`,
          "X-Request-Id": requestId,
          "OpenAI-Intent": UTILITY_INTENT
        },
        body,
        signal: options?.signal
      },
      { type: RequestType.ChatCompletions }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateCopilotTokenForGithub(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text, "CAPI chat completion request failed");
    }
    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("CAPI chat completion returned no text content");
    }
    return content;
  }
  // #endregion
  // #region Lazy Init
  _getCapiBase() {
    if (!this._capiBasePromise) {
      this._capiBasePromise = this._buildCapiBase().catch((err) => {
        this._capiBasePromise = null;
        throw err;
      });
    }
    return this._capiBasePromise;
  }
  async _buildCapiBase() {
    const [machineId, deviceId] = await Promise.all([
      getMachineId((err) => this._logService.warn("[CopilotApiService] getMachineId failed", err)),
      getDevDeviceId((err) => this._logService.warn("[CopilotApiService] getDevDeviceId failed", err))
    ]);
    const extensionInfo = {
      name: "agent-host",
      sessionId: generateUuid(),
      machineId,
      deviceId,
      vscodeVersion: this._productService.version,
      version: this._productService.version,
      buildType: this._productService.quality === "stable" ? "prod" : "dev"
    };
    const userUrl = `${this._gitHubEndpointService.getApiBaseUri()}/copilot_internal/user`;
    return { extensionInfo, userUrl };
  }
  // #endregion
  // #region Streaming
  async *_messagesStreaming(githubToken, request, options) {
    const response = await this._sendRequest(githubToken, request, true, options);
    if (!response.body) {
      throw new Error("CAPI response has no body");
    }
    yield* this._readSSE(response.body);
  }
  // #endregion
  // #region Non-Streaming
  async _messagesNonStreaming(githubToken, request, options) {
    const response = await this._sendRequest(githubToken, request, false, options);
    return response.json();
  }
  // #endregion
  // #region Shared Request
  async _sendRequest(githubToken, request, stream, options) {
    const capiClient = await this._getClientForToken(githubToken);
    const requestId = generateUuid();
    this._logService.debug("[CopilotApiService] POST messages", `model=${request.model} stream=${stream} requestId=${requestId}`);
    const { system, ...rest } = request;
    const body = JSON.stringify({
      ...rest,
      stream,
      // CAPI requires system as a text-block array, not a raw string
      ...system !== void 0 ? { system: typeof system === "string" ? [{ type: "text", text: system }] : system } : {}
    });
    const response = await capiClient.makeRequest(
      {
        method: "POST",
        headers: {
          ...options?.headers,
          "Content-Type": "application/json",
          "Authorization": `Bearer ${githubToken}`,
          "X-Request-Id": requestId,
          "X-GitHub-Api-Version": "2026-01-09",
          // Should these be parameterized?
          "OpenAI-Intent": "messages-proxy",
          "X-Interaction-Type": "messages-proxy"
          // `X-Initiator` (user|agent) is intentionally omitted: the
          // user-vs-agent turn origin known to `ClaudeAgentSession` is not
          // plumbed across the SDK subprocess to this proxy, so a hardcoded
          // value would mislabel most agent-loop traffic. CAPI accepts the
          // request without it (the `responses()` and `utilityChatCompletion()`
          // paths already omit it). Thread a real per-turn initiator here if
          // that signal ever becomes available at the proxy boundary.
        },
        suppressIntegrationId: options?.suppressIntegrationId,
        body,
        signal: options?.signal
      },
      { type: RequestType.ChatMessages }
    );
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this._invalidateClientForToken(githubToken);
      }
      const text = await response.text().catch(() => "");
      throw buildCopilotApiHttpError(response.status, response.statusText, text);
    }
    return response;
  }
  // #endregion
  // #region Per-Token Client
  /**
   * Resolve a {@link CAPIClient} that has had its domains updated for the
   * supplied user. Concurrent callers for the same token share one
   * `/copilot_internal/user` discovery via the cache map; callers with
   * different tokens get their **own** `CAPIClient` instance, so the
   * `updateDomains` mutation for token A can never affect a request being
   * dispatched for token B.
   */
  _getClientForToken(githubToken) {
    return this._getEntryForToken(githubToken).then((entry) => entry.capiClient);
  }
  /**
   * Resolve this user's restricted-telemetry context. Reads the `rt`/`tid` claims from the minted
   * CAPI Copilot session token (the GitHub token has neither), and resolves the CAPI
   * `endpoints.telemetry` host from the cached `/copilot_internal/user` discovery only when the
   * user is opted in, so public users pay no extra discovery call.
   */
  async resolveRestrictedTelemetryContext(githubToken) {
    const token = await this._getCopilotTokenEntry(githubToken);
    const client = await this._getEntryForToken(githubToken);
    const fields = parseCopilotTokenFields(token.token);
    const restrictedTelemetryEnabled = fields.get("rt") === "1";
    const trackingId = fields.get("tid");
    const telemetryEndpoint = restrictedTelemetryEnabled ? client.telemetryEndpoint : void 0;
    return {
      restrictedTelemetryEnabled,
      trackingId,
      telemetryEndpoint,
      isInternal: token.isInternal,
      userName: client.login,
      isVscodeTeamMember: token.isVscodeTeamMember,
      copilotIgnoreEnabled: client.copilotIgnoreEnabled
    };
  }
  async resolveApiEndpoint(githubToken) {
    return (await this._getEntryForToken(githubToken)).apiEndpoint;
  }
  async resolveUserLogin(githubToken) {
    return (await this._getEntryForToken(githubToken)).login;
  }
  _getEntryForToken(githubToken) {
    const nowSeconds = Date.now() / 1e3;
    const existing = this._clientsByToken.get(githubToken);
    if (existing) {
      return existing.then((entry) => {
        if (entry.expiresAt - nowSeconds > CAPI_CONTEXT_REFRESH_BUFFER_SECONDS) {
          return entry;
        }
        this._clientsByToken.delete(githubToken);
        return this._getEntryForToken(githubToken);
      }).catch((err) => {
        this._clientsByToken.delete(githubToken);
        throw err;
      });
    }
    const pending = this._buildClientForToken(githubToken).catch((err) => {
      this._clientsByToken.delete(githubToken);
      throw err;
    });
    this._clientsByToken.set(githubToken, pending);
    return pending;
  }
  _invalidateClientForToken(githubToken) {
    this._clientsByToken.delete(githubToken);
  }
  async _buildClientForToken(githubToken) {
    const { extensionInfo, userUrl } = await this._getCapiBase();
    const fetch = this._fetch;
    const capiClient = new CAPIClient(extensionInfo, COPILOT_LICENSE_AGREEMENT, {
      fetch: (url, options) => fetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
        signal: options.signal
      })
    });
    this._logService.debug("[CopilotApiService] Discovering CAPI endpoints via /copilot_internal/user");
    const overrideApi = process.env[CAPI_URL_OVERRIDE_ENV];
    if (overrideApi) {
      if (isAllowedCapiUrlOverride(overrideApi)) {
        this._logService.info(`[CopilotApiService] Using CAPI URL override ${overrideApi}; skipping endpoint discovery`);
        capiClient.updateDomains({ endpoints: { api: overrideApi, proxy: overrideApi }, sku: "" }, void 0);
        return {
          capiClient,
          expiresAt: Date.now() / 1e3 + CAPI_CONTEXT_TTL_SECONDS,
          apiEndpoint: overrideApi
        };
      }
      this._logService.warn(`[CopilotApiService] Ignoring non-loopback CAPI URL override ${overrideApi}; falling back to normal endpoint discovery`);
    }
    const response = await this._fetch(userUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "Accept": "application/json",
        "X-GitHub-Api-Version": USER_API_VERSION
      }
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Copilot endpoint discovery failed: ${response.status} ${response.statusText} \u2014 ${text}`);
    }
    const envelope = await response.json();
    capiClient.updateDomains(
      { endpoints: envelope.endpoints ?? {}, sku: envelope.access_type_sku ?? "" },
      // Enterprise base URI (e.g. `https://acme.ghe.com`), or `undefined` for
      // github.com. The package derives the GitHub API host (`api.<host>`) from
      // this for `copilot_internal` endpoints - notably the Copilot session
      // token mint (`/copilot_internal/v2/token`). Omitting it strands the mint
      // on `api.github.com`, which 401s an enterprise token ("Bad credentials").
      this._gitHubEndpointService.getEnterpriseUri()
    );
    this._logService.debug("[CopilotApiService] CAPI endpoint discovered, api=", envelope.endpoints?.api);
    return {
      capiClient,
      expiresAt: Date.now() / 1e3 + CAPI_CONTEXT_TTL_SECONDS,
      login: envelope.login,
      telemetryEndpoint: envelope.endpoints?.telemetry,
      apiEndpoint: envelope.endpoints?.api,
      copilotIgnoreEnabled: envelope.copilotignore_enabled
    };
  }
  // #endregion
  // #region Per-Token Copilot Session Token
  /**
   * Resolve the Copilot session token for a GitHub token, minting and
   * caching one if needed. Concurrent callers for the same GitHub token
   * share a single in-flight mint; the caller's `AbortSignal` is
   * deliberately NOT forwarded so cancelling one caller does not poison
   * the shared mint for the others.
   */
  _getCopilotToken(githubToken) {
    return this._getCopilotTokenEntry(githubToken).then((entry) => entry.token);
  }
  _getCopilotTokenEntry(githubToken) {
    const nowSeconds = Date.now() / 1e3;
    const existing = this._copilotTokensByGithub.get(githubToken);
    if (existing) {
      return existing.then((entry) => {
        if (entry.expiresAt - nowSeconds > COPILOT_TOKEN_REFRESH_BUFFER_SECONDS) {
          return entry;
        }
        if (this._copilotTokensByGithub.get(githubToken) === existing) {
          this._copilotTokensByGithub.delete(githubToken);
        }
        return this._getCopilotTokenEntry(githubToken);
      }).catch((err) => {
        if (this._copilotTokensByGithub.get(githubToken) === existing) {
          this._copilotTokensByGithub.delete(githubToken);
        }
        throw err;
      });
    }
    const pending = this._buildCopilotToken(githubToken).catch((err) => {
      if (this._copilotTokensByGithub.get(githubToken) === pending) {
        this._copilotTokensByGithub.delete(githubToken);
      }
      throw err;
    });
    this._copilotTokensByGithub.set(githubToken, pending);
    return pending;
  }
  _invalidateCopilotTokenForGithub(githubToken) {
    this._copilotTokensByGithub.delete(githubToken);
  }
  async _buildCopilotToken(githubToken) {
    const capiClient = await this._getClientForToken(githubToken);
    this._logService.debug("[CopilotApiService] Minting Copilot session token");
    const response = await capiClient.makeRequest(
      {
        method: "GET",
        headers: {
          "Authorization": `token ${githubToken}`,
          "X-GitHub-Api-Version": USER_API_VERSION
        }
      },
      { type: RequestType.CopilotToken }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Copilot session token mint failed: ${response.status} ${response.statusText} \u2014 ${text}`);
    }
    const envelope = await response.json();
    if (typeof envelope.token !== "string" || typeof envelope.expires_at !== "number") {
      throw new Error("Copilot session token mint returned malformed envelope");
    }
    const nowSeconds = Date.now() / 1e3;
    const refreshIn = typeof envelope.refresh_in === "number" ? envelope.refresh_in : void 0;
    const organizationList = Array.isArray(envelope.organization_list) ? envelope.organization_list.filter((organization) => typeof organization === "string") : [];
    const expiresAt = Math.max(
      refreshIn !== void 0 ? nowSeconds + refreshIn : envelope.expires_at,
      nowSeconds + 60
    );
    return {
      token: envelope.token,
      expiresAt,
      modelIdsByFamily: /* @__PURE__ */ new Map(),
      isInternal: organizationList.some((organization) => INTERNAL_COPILOT_ORGANIZATIONS.has(organization)),
      isVscodeTeamMember: organizationList.some((organization) => VSCODE_COPILOT_ORGANIZATIONS.has(organization))
    };
  }
  /**
   * Resolve the concrete CAPI model id for the supplied family (e.g.
   * `gpt-4o-mini`). Cached per GitHub token + family alongside the
   * Copilot session token so eviction on 401/403 also clears the cached
   * model id.
   */
  async _resolveUtilityModelId(githubToken, modelFamily) {
    const pendingEntry = this._copilotTokensByGithub.get(githubToken);
    const entry = pendingEntry ? await pendingEntry : void 0;
    const cached = entry?.modelIdsByFamily.get(modelFamily);
    if (cached) {
      return cached;
    }
    const models = await this.models(githubToken);
    const match = models.find((m) => m.capabilities?.family === modelFamily);
    if (!match) {
      throw new Error(`No CAPI model available for family '${modelFamily}'`);
    }
    entry?.modelIdsByFamily.set(modelFamily, match.id);
    return match.id;
  }
  // #endregion
  // #region SSE Parsing
  async *_readSSE(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const event = this._parseDataLine(line);
          if (event !== void 0) {
            yield event;
            if (event.type === "message_stop") {
              return;
            }
          }
        }
      }
      if (buffer.trim()) {
        const event = this._parseDataLine(buffer);
        if (event !== void 0) {
          yield event;
          if (event.type === "message_stop") {
            return;
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
      }
      reader.releaseLock();
    }
  }
  /**
   * @returns the parsed stream event, or `undefined` to skip the line.
   * @throws on `error` events from the server.
   */
  _parseDataLine(line) {
    if (!line.startsWith("data: ")) {
      return void 0;
    }
    const data = line.slice("data: ".length).trim();
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      this._logService.warn("[CopilotApiService] Failed to parse SSE data:", data);
      return void 0;
    }
    if (typeof parsed !== "object" || parsed === null) {
      return void 0;
    }
    const record = parsed;
    const type = record.type;
    if (typeof type !== "string") {
      return void 0;
    }
    if (type === "error") {
      const rawError = parsed.error;
      let envelope;
      if (rawError && typeof rawError === "object" && typeof rawError.type === "string" && typeof rawError.message === "string") {
        envelope = parsed;
      } else {
        let errorMessage;
        if (typeof rawError === "string") {
          errorMessage = rawError;
        } else if (typeof rawError?.message === "string") {
          errorMessage = rawError.message;
        } else {
          errorMessage = "Unknown streaming error";
        }
        envelope = {
          type: "error",
          error: { type: "api_error", message: errorMessage },
          request_id: null
        };
      }
      throw new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, envelope);
    }
    if (!KNOWN_SSE_EVENT_TYPES.has(type)) {
      return void 0;
    }
    return parsed;
  }
  // #endregion
};
CopilotApiService = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IAgentHostGitHubEndpointService)
], CopilotApiService);
const KNOWN_SSE_EVENT_TYPES = /* @__PURE__ */ new Set([
  "message_start",
  "message_delta",
  "message_stop",
  "content_block_start",
  "content_block_delta",
  "content_block_stop"
]);
export {
  COPILOT_API_ERROR_STATUS_STREAMING,
  CopilotApiError,
  CopilotApiService,
  ICopilotApiService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgeyBDQVBJQ2xpZW50LCBSZXF1ZXN0VHlwZSwgdHlwZSBDQ0FNb2RlbCwgdHlwZSBJRXh0ZW5zaW9uSW5mb3JtYXRpb24gfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgZ2V0RGV2RGV2aWNlSWQsIGdldE1hY2hpbmVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9pZC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0xJQ0VOU0VfQUdSRUVNRU5UIH0gZnJvbSAnLi4vLi4vLi4vZW5kcG9pbnQvY29tbW9uL2xpY2Vuc2VBZ3JlZW1lbnQuanMnO1xuaW1wb3J0IHsgcGFyc2VDb3BpbG90VG9rZW5GaWVsZHMgfSBmcm9tICcuLi9jb3BpbG90L2NvcGlsb3RUb2tlbkZpZWxkcy5qcyc7XG5cbi8vICNyZWdpb24gVHlwZXNcblxuLyoqXG4gKiBQZXItY2FsbCB0cmFuc3BvcnQgb3B0aW9ucyBmb3IgYWxsIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2V9IG1ldGhvZHMuXG4gKlxuICogYGhlYWRlcnNgIGFyZSBtZXJnZWQgaW50byB0aGUgb3V0Z29pbmcgQ0FQSSByZXF1ZXN0IGJlZm9yZSBzZWN1cml0eS1cbiAqIHNlbnNpdGl2ZSBoZWFkZXJzIChgQXV0aG9yaXphdGlvbmAsIGBDb250ZW50LVR5cGVgLCBgWC1SZXF1ZXN0LUlkYCxcbiAqIGBPcGVuQUktSW50ZW50YCksIHNvIGNhbGxlcnMgY2Fubm90IG92ZXJyaWRlIHRob3NlLlxuICpcbiAqIGBzaWduYWxgIHByb3BhZ2F0ZXMgdG8gdGhlIG91dGdvaW5nIEFQSSByZXF1ZXN0IGJ1dCAqKm5vdCoqIHRvIHRoZVxuICogc2hhcmVkIHRva2VuIG1pbnQuIFRoZSBtaW50IGlzIGRlZHVwZWQgYWNyb3NzIGNvbmN1cnJlbnQgY2FsbGVycywgc29cbiAqIGEgc2luZ2xlIGNhbGxlcidzIGFib3J0IG11c3Qgbm90IGNhbmNlbCBpdCBmb3IgZXZlcnlvbmUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMge1xuXHRyZWFkb25seSBoZWFkZXJzPzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj47XG5cdHJlYWRvbmx5IHNpZ25hbD86IEFib3J0U2lnbmFsO1xuXG5cdC8qKlxuXHQgKiBTdXBwcmVzcyB0aGUgYENvcGlsb3QtSW50ZWdyYXRpb24tSWRgIGhlYWRlciBvbiB0aGlzIHJlcXVlc3QuXG5cdCAqXG5cdCAqIFdoZW4gdW5zZXQsIGBAdnNjb2RlL2NvcGlsb3QtYXBpYCBkZXJpdmVzIHRoZSBpbnRlZ3JhdGlvbiBpZCBmcm9tIHRoZVxuXHQgKiBkaXNjb3ZlcmVkIENvcGlsb3QgU0tVOiBhIGBub19hdXRoX2xpbWl0ZWRfY29waWxvdGAgU0tVIG1hcHMgdG9cblx0ICogYHZzY29kZS1ubGAsIHdoaWNoIHRoZSBDQVBJIGJhY2tlbmQgdHJlYXRzIGFzIHRoZSBsaW1pdGVkL25vLWF1dGhcblx0ICogaW50ZWdyYXRpb24gYW5kIHJlZnVzZXMgcHJlbWl1bSBtb2RlbHMgc3VjaCBhcyBgY2xhdWRlLW9wdXMtNC43YC5cblx0ICogU2V0dGluZyB0aGlzIHRvIGB0cnVlYCBvbWl0cyB0aGUgaGVhZGVyIHNvIENBUEkgYXV0aG9yaXplcyBhZ2FpbnN0IHRoZVxuXHQgKiB0b2tlbidzIHJlYWwgZW50aXRsZW1lbnQuIE1pcnJvcnMgdGhlIENvcGlsb3QgQ2hhdCBleHRlbnNpb24nc1xuXHQgKiBgQ2xhdWRlU3RyZWFtaW5nUGFzc1Rocm91Z2hFbmRwb2ludC5nZXRFbmRwb2ludEZldGNoT3B0aW9ucygpYC5cblx0ICovXG5cdHJlYWRvbmx5IHN1cHByZXNzSW50ZWdyYXRpb25JZD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogT25lIGNoYXQgbWVzc2FnZSBpbiBhIHtAbGluayBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3R9LlxuICogTWlycm9ycyB0aGUgT3BlbkFJIENoYXQgQ29tcGxldGlvbnMgbWVzc2FnZSBzaGFwZSBDQVBJIGFjY2VwdHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RVdGlsaXR5Q2hhdE1lc3NhZ2Uge1xuXHRyZWFkb25seSByb2xlOiAnc3lzdGVtJyB8ICd1c2VyJyB8ICdhc3Npc3RhbnQnO1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG59XG5cbi8qKlxuICogSW5wdXRzIGZvciB7QGxpbmsgSUNvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDaGF0Q29tcGxldGlvbn0uXG4gKlxuICogQ2FsbGVycyBvd24gcHJvbXB0IGNvbnN0cnVjdGlvbiBcdTIwMTQgdHlwaWNhbGx5IGEgYCdzeXN0ZW0nYCBydWxlcyBtZXNzYWdlXG4gKiBmb2xsb3dlZCBieSBvbmUgb3IgbW9yZSBgJ3VzZXInYCBtZXNzYWdlcywgbWF0Y2hpbmcgdGhlIENvcGlsb3QgQ2hhdFxuICogZXh0ZW5zaW9uJ3MgYGNvcGlsb3QtdXRpbGl0eS1zbWFsbGAgcHJvbXB0cyAoc2VlXG4gKiBgR2l0Q29tbWl0TWVzc2FnZVByb21wdGAncyBgU3lzdGVtTWVzc2FnZWAgKyBgVXNlck1lc3NhZ2VgIHBhaXIpLiBUaGlzXG4gKiBzZXJ2aWNlIGZvcndhcmRzIHRoZSBtZXNzYWdlcyBhbmQgcmV0dXJucyB0aGUgYXNzaXN0YW50IHRleHQuXG4gKlxuICogYHRlbXBlcmF0dXJlYCBkZWZhdWx0cyB0byBgMC4xYCAobWF0Y2hpbmcgdGhlIENvcGlsb3QgQ2hhdCBleHRlbnNpb24nc1xuICogZGVmYXVsdCBgSUNvbnZlcnNhdGlvbk9wdGlvbnMudGVtcGVyYXR1cmVgKS4gYHRvcF9wYCBhbmQgdGhlIG1vZGVsIGZhbWlseVxuICogYXJlIGZpeGVkIGRlZmF1bHRzIGluc2lkZSB0aGUgc2VydmljZS4gQ2FsbGVycyBtYXkgc2V0IGBtYXhUb2tlbnNgIHdoZW5cbiAqIHRoZWlyIHV0aWxpdHkgZmxvdyBoYXMgYSBuYXR1cmFsbHkgYm91bmRlZCBvdXRwdXQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0IHtcblx0cmVhZG9ubHkgbWVzc2FnZXM6IHJlYWRvbmx5IElDb3BpbG90VXRpbGl0eUNoYXRNZXNzYWdlW107XG5cdHJlYWRvbmx5IHRlbXBlcmF0dXJlPzogbnVtYmVyO1xuXHRyZWFkb25seSBtYXhUb2tlbnM/OiBudW1iZXI7XG59XG5cbi8qKlxuICogU3Vic2V0IG9mIHRoZSBHaXRIdWIgYGNvcGlsb3RfaW50ZXJuYWwvdXNlcmAgcmVzcG9uc2Ugd2UgY2FyZSBhYm91dC5cbiAqIFRoZSBmdWxsIHBheWxvYWQgY2FycmllcyBlbnRpdGxlbWVudCBpbmZvOyB3ZSBvbmx5IG5lZWQgYGVuZHBvaW50c2AgKGZvclxuICogcm91dGluZyBDQVBJIHJlcXVlc3RzKSBhbmQgYGFjY2Vzc190eXBlX3NrdWAgKHdoaWNoIGBDQVBJQ2xpZW50LnVwZGF0ZURvbWFpbnNgXG4gKiBzdGFtcHMgb250byByZXF1ZXN0cykuXG4gKi9cbmludGVyZmFjZSBJQ29waWxvdFVzZXJSZXNwb25zZSB7XG5cdHJlYWRvbmx5IGxvZ2luPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb3BpbG90aWdub3JlX2VuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBlbmRwb2ludHM/OiB7XG5cdFx0cmVhZG9ubHkgYXBpPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHRlbGVtZXRyeT86IHN0cmluZztcblx0XHRyZWFkb25seSBwcm94eT86IHN0cmluZztcblx0XHRyZWFkb25seSAnb3JpZ2luLXRyYWNrZXInPzogc3RyaW5nO1xuXHR9O1xuXHRyZWFkb25seSBhY2Nlc3NfdHlwZV9za3U/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJQ2FjaGVkQ2xpZW50IHtcblx0cmVhZG9ubHkgY2FwaUNsaWVudDogQ0FQSUNsaWVudDtcblx0cmVhZG9ubHkgZXhwaXJlc0F0OiBudW1iZXI7XG5cdC8qKiBHaXRIdWIgbG9naW4gcmV0dXJuZWQgYnkgYC9jb3BpbG90X2ludGVybmFsL3VzZXJgLCB3aGVuIHByZXNlbnQuICovXG5cdHJlYWRvbmx5IGxvZ2luPzogc3RyaW5nO1xuXHQvKiogVGhlIENBUEkgYGVuZHBvaW50cy50ZWxlbWV0cnlgIGJhc2UgVVJMIGRpc2NvdmVyZWQgZm9yIHRoaXMgdG9rZW4sIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgdGVsZW1ldHJ5RW5kcG9pbnQ/OiBzdHJpbmc7XG5cdC8qKiBUaGUgQ0FQSSBgZW5kcG9pbnRzLmFwaWAgYmFzZSBVUkwgZGlzY292ZXJlZCAob3Igb3ZlcnJpZGRlbikgZm9yIHRoaXMgdG9rZW4sIGlmIGFueS4gKi9cblx0cmVhZG9ubHkgYXBpRW5kcG9pbnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvcGlsb3RJZ25vcmVFbmFibGVkPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBTdWJzZXQgb2YgdGhlIGBSZXF1ZXN0VHlwZS5Db3BpbG90VG9rZW5gIG1pbnQgcmVzcG9uc2Ugd2UgY2FyZSBhYm91dC5cbiAqL1xuaW50ZXJmYWNlIElDb3BpbG90VG9rZW5FbnZlbG9wZSB7XG5cdHJlYWRvbmx5IHRva2VuPzogdW5rbm93bjtcblx0cmVhZG9ubHkgZXhwaXJlc19hdD86IHVua25vd247XG5cdHJlYWRvbmx5IHJlZnJlc2hfaW4/OiB1bmtub3duO1xuXHRyZWFkb25seSBvcmdhbml6YXRpb25fbGlzdD86IHVua25vd247XG59XG5cbi8qKlxuICogUGVyLUdpdEh1Yi10b2tlbiBDb3BpbG90IHNlc3Npb24gdG9rZW4gY2FjaGUgZW50cnksIHBsdXMgYSBwZXItZmFtaWx5XG4gKiByZXNvbHZlZCB1dGlsaXR5IG1vZGVsIGlkLiBUaGUgbW9kZWwgaWQgaXMgYm91bmQgdG8gdGhlIHNhbWUgbGlmZXRpbWUgYXNcbiAqIHRoZSBDb3BpbG90IHRva2VuIHNvIHRoZSBlbnRyeSBjYW4gYmUgZXZpY3RlZCBhdG9taWNhbGx5IG9uIDQwMS80MDMuXG4gKi9cbmludGVyZmFjZSBJQ2FjaGVkQ29waWxvdFRva2VuIHtcblx0cmVhZG9ubHkgdG9rZW46IHN0cmluZztcblx0cmVhZG9ubHkgZXhwaXJlc0F0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1vZGVsSWRzQnlGYW1pbHk6IE1hcDxzdHJpbmcsIHN0cmluZz47XG5cdHJlYWRvbmx5IGlzSW50ZXJuYWw6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVnNjb2RlVGVhbU1lbWJlcjogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBNZW1vaXplZCBwYXJ0cyBvZiBgQ0FQSUNsaWVudGAgY29uc3RydWN0aW9uIHRoYXQgZG9uJ3QgZGVwZW5kIG9uIHRoZSB1c2VyXG4gKiB0b2tlbi4gQnVpbHQgb25jZSBhbmQgcmV1c2VkIGJ5IGV2ZXJ5IHBlci10b2tlbiBjbGllbnQuXG4gKi9cbmludGVyZmFjZSBJQ2FwaUJhc2Uge1xuXHRyZWFkb25seSBleHRlbnNpb25JbmZvOiBJRXh0ZW5zaW9uSW5mb3JtYXRpb247XG5cdHJlYWRvbmx5IHVzZXJVcmw6IHN0cmluZztcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIENvbnN0YW50c1xuXG4vKipcbiAqIFNlbnRpbmVsIHtAbGluayBDb3BpbG90QXBpRXJyb3Iuc3RhdHVzfSB1c2VkIHdoZW4gdGhlIGVycm9yIGNhbWUgZnJvbSBhXG4gKiBtaWQtc3RyZWFtIFNTRSBgZXZlbnQ6IGVycm9yYCBmcmFtZSByYXRoZXIgdGhhbiBhbiBIVFRQIG5vbi0yeHggcmVzcG9uc2UuXG4gKiBUaGUgdXBzdHJlYW0gSFRUUCBzdGF0dXMgd2FzIDIwMCAodGhlIHN0cmVhbSBoYWQgYWxyZWFkeSBzdGFydGVkKTsgdGhlXG4gKiByZWFsIEhUVFAgc3RhdHVzIGlzIG5vIGxvbmdlciBtZWFuaW5nZnVsLCBzbyBjb25zdW1lcnMgdGhhdCBuZWVkIGFuIEhUVFBcbiAqIHN0YXR1cyBjb2RlIChlLmcuIHdoZW4gcmUtZW1pdHRpbmcgYmVmb3JlIGhlYWRlcnMgYXJlIHNlbnQpIHNob3VsZCBub3RcbiAqIHRydXN0IHRoaXMgdmFsdWUuIFVzZSBgZW52ZWxvcGUuZXJyb3IudHlwZWAgaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGNvbnN0IENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkcgPSA1MjA7XG5cbi8qKlxuICogUmUtcmVzb2x2ZSB0aGUgQ0FQSSBlbmRwb2ludCBkaXNjb3ZlcnkgdGhpcyBtYW55IHNlY29uZHMgYmVmb3JlIHRoZSBjYWNoZVxuICogZW50cnkncyBub3Rpb25hbCBleHBpcnkuIFRoZSBgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmAgcmVzcG9uc2UgaXRzZWxmXG4gKiBjYXJyaWVzIG5vIGV4cGlyeSwgc28gd2UgYXBwbHkgYSBmaXhlZCBUVEwgYW5kIHJlZnJlc2ggYWhlYWQgb2YgaXQuXG4gKi9cbmNvbnN0IENBUElfQ09OVEVYVF9SRUZSRVNIX0JVRkZFUl9TRUNPTkRTID0gNSAqIDYwO1xuXG4vKiogQ29uc2VydmF0aXZlIFRUTCBmb3IgdGhlIGAvY29waWxvdF9pbnRlcm5hbC91c2VyYCBkaXNjb3ZlcnkgcmVzdWx0LiAqL1xuY29uc3QgQ0FQSV9DT05URVhUX1RUTF9TRUNPTkRTID0gMzAgKiA2MDtcblxuY29uc3QgVVNFUl9BUElfVkVSU0lPTiA9ICcyMDI1LTA0LTAxJztcblxuLyoqXG4gKiBUZXN0L2RlYnVnIG92ZXJyaWRlIGZvciB0aGUgQ0FQSSBiYXNlIFVSTC4gV2hlbiBzZXQgdG8gYSAqKmxvb3BiYWNrKiogVVJMLFxuICoge0BsaW5rIENvcGlsb3RBcGlTZXJ2aWNlfSBza2lwcyB0aGUgYGFwaS5naXRodWIuY29tL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmBcbiAqIGVuZHBvaW50LWRpc2NvdmVyeSByb3VuZC10cmlwICh3aGljaCByZXF1aXJlcyBhIHJlYWwgR2l0SHViIHRva2VuKSBhbmQgcm91dGVzXG4gKiBldmVyeSBDQVBJIHJlcXVlc3QgXHUyMDE0IGBtb2RlbHNgLCBgcmVzcG9uc2VzYCwgYG1lc3NhZ2VzYCBcdTIwMTQgc3RyYWlnaHQgYXQgdGhpcyBVUkxcbiAqIGluc3RlYWQuIE9ubHkgZXZlciBzZXQgYnkgdGhlIHNtb2tlLXRlc3QgaGFybmVzcyAoc2VlIGBzZXR1cEFnZW50SG9zdFN1aXRlYClcbiAqIHNvIHRoZSBhZ2VudCBob3N0J3Mgc2hhcmVkIENBUEkgY2xpZW50IGNhbiB0YWxrIHRvIHRoZSBtb2NrIExMTSBzZXJ2ZXI7IG5ldmVyXG4gKiBzZXQgaW4gcHJvZHVjdGlvbiwgc28gbm9ybWFsIHBlci10b2tlbiBkaXNjb3ZlcnkgaXMgdW5jaGFuZ2VkLlxuICpcbiAqIFRoZSBvdmVycmlkZSBpcyByZXN0cmljdGVkIHRvIGxvb3BiYWNrIGhvc3RzLCBwbHVzIHRoZSByZXNlcnZlZFxuICogYHZzY29kZS1zbW9rZS50ZXN0YCBob3N0IHdoZW4gdGhlIHNtb2tlIHByb3h5IG1hcmtlciBpcyBwcmVzZW50LiBTdWJzZXF1ZW50XG4gKiBDQVBJIGNhbGxzIGNhcnJ5IHRoZSB1c2VyJ3MgR2l0SHViIGJlYXJlciB0b2tlbiwgc28gZXZlcnkgb3RoZXIgbm9uLWxvb3BiYWNrXG4gKiBvciB1bnBhcnNlYWJsZSB2YWx1ZSBpcyBpZ25vcmVkIHRvIHByZXZlbnQgdG9rZW4gZXhmaWx0cmF0aW9uLlxuICovXG5jb25zdCBDQVBJX1VSTF9PVkVSUklERV9FTlYgPSAnVlNDT0RFX0FHRU5UX0hPU1RfQ0FQSV9VUkxfT1ZFUlJJREUnO1xuY29uc3QgQ0FQSV9VUkxfT1ZFUlJJREVfU01PS0VfVEVTVF9IT1NUID0gJ3ZzY29kZS1zbW9rZS50ZXN0JztcbmNvbnN0IENBUElfVVJMX09WRVJSSURFX1NNT0tFX1RFU1RfRU5WID0gJ1ZTQ09ERV9TTU9LRV9URVNUX1BST1hZX0hFQURFUic7XG5cbi8qKiBUcnVlIGlmZiBgdXJsYCBwYXJzZXMgYW5kIGl0cyBob3N0IGlzIGEgbG9vcGJhY2sgYWRkcmVzcyAobG9jYWxob3N0IC8gMTI3LjAuMC4wLzggLyA6OjEpLiAqL1xuZnVuY3Rpb24gaXNMb29wYmFja1VybCh1cmw6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRsZXQgaG9zdG5hbWU6IHN0cmluZztcblx0dHJ5IHtcblx0XHRob3N0bmFtZSA9IG5ldyBVUkwodXJsKS5ob3N0bmFtZTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdC8vIFN0cmlwIElQdjYgYnJhY2tldHMgaWYgcHJlc2VudCAoZS5nLiBgWzo6MV1gKS5cblx0Y29uc3QgaG9zdCA9IGhvc3RuYW1lLnJlcGxhY2UoL15cXFt8XFxdJC9nLCAnJykudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIGhvc3QgPT09ICdsb2NhbGhvc3QnIHx8IGhvc3QgPT09ICc6OjEnIHx8IC9eMTI3KD86XFwuXFxkezEsM30pezN9JC8udGVzdChob3N0KTtcbn1cblxuZnVuY3Rpb24gaXNBbGxvd2VkQ2FwaVVybE92ZXJyaWRlKHVybDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc0xvb3BiYWNrVXJsKHVybCkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoIXByb2Nlc3MuZW52W0NBUElfVVJMX09WRVJSSURFX1NNT0tFX1RFU1RfRU5WXSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHR0cnkge1xuXHRcdHJldHVybiBuZXcgVVJMKHVybCkuaG9zdG5hbWUudG9Mb3dlckNhc2UoKSA9PT0gQ0FQSV9VUkxfT1ZFUlJJREVfU01PS0VfVEVTVF9IT1NUO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLyoqXG4gKiBSZS1taW50IHRoZSBDb3BpbG90IHNlc3Npb24gdG9rZW4gdGhpcyBtYW55IHNlY29uZHMgYmVmb3JlIGl0c1xuICogc2VydmVyLXJlcG9ydGVkIGBleHBpcmVzX2F0YCwgbWlycm9yaW5nIHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uJ3NcbiAqIGBSZWZyZXNoYWJsZUNvcGlsb3RUb2tlbk1hbmFnZXJgIDUtbWludXRlIHJlZnJlc2ggYnVmZmVyLlxuICovXG5jb25zdCBDT1BJTE9UX1RPS0VOX1JFRlJFU0hfQlVGRkVSX1NFQ09ORFMgPSA1ICogNjA7XG5cbi8qKlxuICogRGVmYXVsdCBDQVBJIG1vZGVsIGZhbWlseSBmb3Ige0BsaW5rIElDb3BpbG90QXBpU2VydmljZS51dGlsaXR5Q2hhdENvbXBsZXRpb259LlxuICogTWF0Y2hlcyB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbidzIGBjb3BpbG90LXV0aWxpdHktc21hbGxgIHJlc29sdmVyXG4gKiAoYENvcGlsb3RVdGlsaXR5U21hbGxDaGF0RW5kcG9pbnQuY2FwaUZhbWlseSA9PT0gQ0hBVF9NT0RFTC5HUFQ0T01JTklgKS5cbiAqL1xuY29uc3QgVVRJTElUWV9ERUZBVUxUX01PREVMX0ZBTUlMWSA9ICdncHQtNG8tbWluaSc7XG5cbi8qKlxuICogRGVmYXVsdCBgdGVtcGVyYXR1cmVgIGZvciB1dGlsaXR5IGNoYXQgY29tcGxldGlvbnMuIE1hdGNoZXMgdGhlIENvcGlsb3RcbiAqIENoYXQgZXh0ZW5zaW9uJ3MgZGVmYXVsdCBgSUNvbnZlcnNhdGlvbk9wdGlvbnMudGVtcGVyYXR1cmVgLlxuICovXG5jb25zdCBVVElMSVRZX0RFRkFVTFRfVEVNUEVSQVRVUkUgPSAwLjE7XG5cbi8qKlxuICogRGVmYXVsdCBgdG9wX3BgIGZvciB1dGlsaXR5IGNoYXQgY29tcGxldGlvbnMuIE1hdGNoZXMgdGhlIENvcGlsb3QgQ2hhdFxuICogZXh0ZW5zaW9uJ3MgZGVmYXVsdCBgSUNvbnZlcnNhdGlvbk9wdGlvbnMudG9wUGAuXG4gKi9cbmNvbnN0IFVUSUxJVFlfREVGQVVMVF9UT1BfUCA9IDE7XG5cbi8qKlxuICogYE9wZW5BSS1JbnRlbnRgIHZhbHVlIGZvciB1dGlsaXR5IGNoYXQgY29tcGxldGlvbnMuIE1hdGNoZXMgdGhlIGV4dGVuc2lvblxuICogdm9jYWJ1bGFyeSBgJ2NvbnZlcnNhdGlvbi1iYWNrZ3JvdW5kJ2AgZm9yIG5vbi11c2VyLWluaXRpYXRlZCB1dGlsaXR5XG4gKiBjYWxscyAoY2hhdCB0aXRsZSBnZW5lcmF0aW9uLCBjb21taXQgbWVzc2FnZXMsIGJyYW5jaCBuYW1lcywgZXRjLikuXG4gKi9cbmNvbnN0IFVUSUxJVFlfSU5URU5UID0gJ2NvbnZlcnNhdGlvbi1iYWNrZ3JvdW5kJztcblxuY29uc3QgSU5URVJOQUxfQ09QSUxPVF9PUkdBTklaQVRJT05TID0gbmV3IFNldChbXG5cdCc0NTM1YzdiZWZmYzg0NGI0NmJiMWVkNGFhMDRkNzU5YScsXG5cdCdhNWRiMGJjYWFlOTQwMzJmZTcxNWZiMzRhNWU0YmNlMicsXG5cdCc3MTg0ZjY2ZGZjZWU5OGNiNWYwOGExY2I5MzZkNTIyNScsXG5cdCcxY2IxOGFjNmVlZGQ0OWI0M2Q3NGExYzViZWIwYjk1NScsXG5cdCdlYTkzOTViOWE5MjQ4YzA1ZWU2ODQ3Y2JkMjQzNTVlZCcsXG5dKTtcbmNvbnN0IFZTQ09ERV9DT1BJTE9UX09SR0FOSVpBVElPTlMgPSBuZXcgU2V0KFsnNTUxY2NhNjBjZTE5NjU0ZDg5NGU3ODYyMjA4MjI0ODInXSk7XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBFcnJvcnNcblxuLyoqXG4gKiBUaHJvd24gYnkge0BsaW5rIElDb3BpbG90QXBpU2VydmljZX0gd2hlbiBDQVBJIHJldHVybnMgYW4gQW50aHJvcGljLWZvcm1hdFxuICogQVBJIGVycm9yIFx1MjAxNCBlaXRoZXIgYXMgYSBub24tMnh4IEhUVFAgcmVzcG9uc2Ugb3IgYXMgYSBtaWQtc3RyZWFtXG4gKiBgZXZlbnQ6IGVycm9yYCBTU0UgZnJhbWUuIENhcnJpZXMgZW5vdWdoIGluZm9ybWF0aW9uIGZvciB0aGUgUGhhc2UgMlxuICogQ2xhdWRlIHByb3h5IHRvIHJlLWVtaXQgdGhlIGVycm9yIHBhc3N0aHJvdWdoIHdpdGhvdXQgcmUtbWFwcGluZy5cbiAqXG4gKiBOZXR3b3JrL3RyYW5zcG9ydCBmYWlsdXJlcyAoY29ubmVjdGlvbiByZXNldCwgRE5TIGZhaWx1cmUsIGV0Yy4pIGFyZVxuICogKipub3QqKiB3cmFwcGVkIGFzIGBDb3BpbG90QXBpRXJyb3JgIFx1MjAxNCB0aGV5IHByb3BhZ2F0ZSBhcyByYXcgYGZldGNoYFxuICogcmVqZWN0aW9ucyBzbyBjb25zdW1lcnMgY2FuIGRpc3Rpbmd1aXNoIEFQSSBlcnJvcnMgZnJvbSB0cmFuc3BvcnQgZXJyb3JzLlxuICovXG5leHBvcnQgY2xhc3MgQ29waWxvdEFwaUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXG5cdC8qKlxuXHQgKiBAcGFyYW0gc3RhdHVzIEhUVFAgc3RhdHVzIGZyb20gdGhlIG9yaWdpbmF0aW5nIENBUEkgcmVzcG9uc2UsIG9yXG5cdCAqICAge0BsaW5rIENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkd9IGZvciBtaWQtc3RyZWFtIFNTRSBlcnJvcnMuXG5cdCAqIEBwYXJhbSBlbnZlbG9wZSBBbnRocm9waWMtZm9ybWF0IGVycm9yIGVudmVsb3BlLiBGb3IgSFRUUCBlcnJvcnMgd2l0aCBhXG5cdCAqICAgbm9uLWNvbmZvcm1pbmcgYm9keSAocGxhaW4gdGV4dCwgbWFsZm9ybWVkIEpTT04sIG1pc3NpbmcgZmllbGRzKSB0aGlzXG5cdCAqICAgaXMgc3ludGhlc2l6ZWQ7IGZvciBjb25mb3JtaW5nIGJvZGllcyBhbmQgU1NFIGZyYW1lcyBpdCBpcyB0aGVcblx0ICogICBzZXJ2ZXIncyBlbnZlbG9wZSB2ZXJiYXRpbS5cblx0ICogQHBhcmFtIG1lc3NhZ2UgT3B0aW9uYWwgb3ZlcnJpZGUgZm9yIGBFcnJvci5tZXNzYWdlYC4gRGVmYXVsdHMgdG9cblx0ICogICBgZW52ZWxvcGUuZXJyb3IubWVzc2FnZWAuICoqTmV2ZXIgaW5jbHVkZXMgYXV0aCB0b2tlbnMuKipcblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHN0YXR1czogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGVudmVsb3BlOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSxcblx0XHRtZXNzYWdlPzogc3RyaW5nLFxuXHQpIHtcblx0XHRzdXBlcihtZXNzYWdlID8/IGVudmVsb3BlLmVycm9yLm1lc3NhZ2UpO1xuXHRcdHRoaXMubmFtZSA9ICdDb3BpbG90QXBpRXJyb3InO1xuXHR9XG59XG5cbi8qKlxuICogQnVpbGQgYSB7QGxpbmsgQ29waWxvdEFwaUVycm9yfSBmcm9tIGEgQ0FQSSBIVFRQIHJlc3BvbnNlIGJvZHkuIElmIHRoZVxuICogYm9keSBwYXJzZXMgYXMgYSBjb25mb3JtaW5nIEFudGhyb3BpYyBlbnZlbG9wZSwgaXQgaXMgdXNlZCB2ZXJiYXRpbTtcbiAqIG90aGVyd2lzZSBhIHN5bnRoZXRpYyBlbnZlbG9wZSBpcyBjb25zdHJ1Y3RlZCB3aXRoIGBlcnJvci50eXBlOlxuICogJ2FwaV9lcnJvcidgIGFuZCB0aGUgcmVzcG9uc2UgYm9keSBhcyBgZXJyb3IubWVzc2FnZWAgKG9yIHN0YXR1cyB0ZXh0XG4gKiB3aGVuIHRoZSBib2R5IGlzIGVtcHR5KS4gVGhlIHJldHVybmVkIGVycm9yJ3MgYG1lc3NhZ2VgIGRlbGliZXJhdGVseVxuICogbWlycm9ycyB0aGUgb3JpZ2luYWwgYFwiPHByZWZpeD46IDxzdGF0dXM+IDxzdGF0dXNUZXh0PlwiYCBmb3JtYXQgc29cbiAqIGV4aXN0aW5nIGxvZy1saW5lIGNvbnN1bWVycyBjb250aW51ZSB0byByZWFkIGlkZW50aWZpYWJseS4gYHByZWZpeGBcbiAqIGRlZmF1bHRzIHRvIGBcIkNBUEkgcmVxdWVzdCBmYWlsZWRcImAgKHRoZSBoaXN0b3JpY2FsIHdvcmRpbmcgZm9yXG4gKiBgbWVzc2FnZXNgKTsgcGFzcyBgXCJDQVBJIG1vZGVscyByZXF1ZXN0IGZhaWxlZFwiYCBmb3IgdGhlIGBtb2RlbHMoKWAgcGF0aC5cbiAqL1xuZnVuY3Rpb24gYnVpbGRDb3BpbG90QXBpSHR0cEVycm9yKHN0YXR1czogbnVtYmVyLCBzdGF0dXNUZXh0OiBzdHJpbmcsIGJvZHlUZXh0OiBzdHJpbmcsIHByZWZpeCA9ICdDQVBJIHJlcXVlc3QgZmFpbGVkJyk6IENvcGlsb3RBcGlFcnJvciB7XG5cdGxldCBlbnZlbG9wZTogQW50aHJvcGljLkVycm9yUmVzcG9uc2UgfCB1bmRlZmluZWQ7XG5cdGlmIChib2R5VGV4dCkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGJvZHlUZXh0KSBhcyB1bmtub3duO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRwYXJzZWQgJiYgdHlwZW9mIHBhcnNlZCA9PT0gJ29iamVjdCdcblx0XHRcdFx0JiYgKHBhcnNlZCBhcyB7IHR5cGU/OiB1bmtub3duIH0pLnR5cGUgPT09ICdlcnJvcidcblx0XHRcdCkge1xuXHRcdFx0XHRjb25zdCBlcnIgPSAocGFyc2VkIGFzIHsgZXJyb3I/OiB1bmtub3duIH0pLmVycm9yO1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0ZXJyICYmIHR5cGVvZiBlcnIgPT09ICdvYmplY3QnXG5cdFx0XHRcdFx0JiYgdHlwZW9mIChlcnIgYXMgeyB0eXBlPzogdW5rbm93biB9KS50eXBlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdCYmIHR5cGVvZiAoZXJyIGFzIHsgbWVzc2FnZT86IHVua25vd24gfSkubWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0ZW52ZWxvcGUgPSBwYXJzZWQgYXMgQW50aHJvcGljLkVycm9yUmVzcG9uc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5vbi1KU09OIGJvZHkgXHUyMDE0IGZhbGwgdGhyb3VnaCB0byBzeW50aGVzaXNcblx0XHR9XG5cdH1cblx0aWYgKCFlbnZlbG9wZSkge1xuXHRcdGVudmVsb3BlID0ge1xuXHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdHR5cGU6ICdhcGlfZXJyb3InLFxuXHRcdFx0XHRtZXNzYWdlOiBib2R5VGV4dCB8fCBgJHtzdGF0dXN9ICR7c3RhdHVzVGV4dH1gLFxuXHRcdFx0fSxcblx0XHRcdHJlcXVlc3RfaWQ6IG51bGwsXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4gbmV3IENvcGlsb3RBcGlFcnJvcihcblx0XHRzdGF0dXMsXG5cdFx0ZW52ZWxvcGUsXG5cdFx0YCR7cHJlZml4fTogJHtzdGF0dXN9ICR7c3RhdHVzVGV4dH0gXFx1MjAxNCAke2VudmVsb3BlLmVycm9yLm1lc3NhZ2V9YCxcblx0KTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG5leHBvcnQgdHlwZSBGZXRjaEZ1bmN0aW9uID0gdHlwZW9mIGdsb2JhbFRoaXMuZmV0Y2g7XG5cbmV4cG9ydCBjb25zdCBJQ29waWxvdEFwaVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUNvcGlsb3RBcGlTZXJ2aWNlPignY29waWxvdEFwaVNlcnZpY2UnKTtcblxuLyoqXG4gKiBGb3VuZGF0aW9uYWwgZ2F0ZXdheSBiZXR3ZWVuIHRoZSBhZ2VudCBob3N0IGFuZCBHaXRIdWIgQ29waWxvdCdzIENBUEkgcHJveHlcbiAqIGZvciBBbnRocm9waWMtc3R5bGUgY2hhdCBjb21wbGV0aW9ucyBhbmQgbW9kZWwgZGlzY292ZXJ5LlxuICpcbiAqICMjIEdvYWxzXG4gKlxuICogMS4gKipTaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBDQVBJIGF1dGguKiogQ2FsbGVycyBwYXNzIGEgcmF3IEdpdEh1YiB0b2tlblxuICogICAgYW5kIG5ldmVyIGRlYWwgd2l0aCBlbmRwb2ludCBkaXNjb3Zlcnkgb3Igcm91dGluZyB0aGVtc2VsdmVzLlxuICogMi4gKipTdGFibGUgc3VyZmFjZSBmb3IgY2hhdCBhZ2VudHMuKiogQSBzbWFsbCwgdHlwZWQgQVBJIHRoYXQgYWJzdHJhY3RzIHRoZVxuICogICAgdW5kZXJseWluZyBgQ0FQSUNsaWVudGAsIFNTRSBmcmFtaW5nLCBhbmQgQW50aHJvcGljIGV2ZW50IHRheG9ub215IHNvXG4gKiAgICBmZWF0dXJlIGNvZGUgY2FuIGZvY3VzIG9uIHByb21wdGluZy5cbiAqIDMuICoqUmVzb3VyY2Utc2FmZSBzdHJlYW1pbmcuKiogQXN5bmMtZ2VuZXJhdG9yIG91dHB1dCB0aGF0IGZ1bGx5IHJlbGVhc2VzXG4gKiAgICB0aGUgdW5kZXJseWluZyBIVFRQIGNvbm5lY3Rpb24gcmVnYXJkbGVzcyBvZiBob3cgdGhlIGNvbnN1bWVyIHRlcm1pbmF0ZXNcbiAqICAgIGl0ZXJhdGlvbiAoZWFybHkgYGJyZWFrYCwgdGhyb3duIGVycm9yLCBhYm9ydCwgb3IgbmF0dXJhbCBlbmQtb2Ytc3RyZWFtKS5cbiAqIDQuICoqU2tldy0gYW5kIHJldm9jYXRpb24tdG9sZXJhbnQgY29udGV4dCBjYWNoZS4qKiBFbmRwb2ludC9za3UgZGlzY292ZXJ5XG4gKiAgICBzdGF5cyBjYWNoZWQgYXMgbG9uZyBhcyBpdCdzIHVzYWJsZSBhbmQgaXMgaW52YWxpZGF0ZWQgaW1tZWRpYXRlbHkgb25cbiAqICAgIGA0MDFgL2A0MDNgIHNvIGNhbGxlcnMgc2VsZi1oZWFsIHdpdGhvdXQgcmVzdGFydGluZyB0aGUgaG9zdC5cbiAqXG4gKiAjIyBBdXRoIHN0cmF0ZWd5XG4gKlxuICogVGhlIEdpdEh1YiB1c2VyIHRva2VuIElTIHRoZSBjcmVkZW50aWFsLiBUaGVyZSBpcyBubyBDb3BpbG90IHNlc3Npb24tdG9rZW5cbiAqIG1pbnQ7IHdlIHNlbmQgYEF1dGhvcml6YXRpb246IEJlYXJlciA8Z2l0aHViLXRva2VuPmAgZGlyZWN0bHkgdG8gQ0FQSSdzXG4gKiBgL3YxL21lc3NhZ2VzYCBhbmQgYC9tb2RlbHNgIGVuZHBvaW50cy4gVGhpcyBtaXJyb3JzIHdoYXQgdGhlXG4gKiBgQGdpdGh1Yi9jb3BpbG90YCBDTEkgZG9lcyAoc2VlIGBmZXRjaENvcGlsb3RVc2VyYCBhbmRcbiAqIGBDb3BpbG90QW50aHJvcGljQ2xpZW50LmNyZWF0ZVdpdGhPQXV0aFRva2VuYCBpbiBgZ2l0aHViL2NvcGlsb3QtYWdlbnQtcnVudGltZWApLlxuICpcbiAqIFRoZSBgZW5kcG9pbnRzLmFwaWAgVVJMIENBUEkgcmVxdWVzdHMgYXJlIHJvdXRlZCB0byBpcyBkaXNjb3ZlcmVkIHBlci10b2tlblxuICogYnkgY2FsbGluZyBgR0VUIC9jb3BpbG90X2ludGVybmFsL3VzZXJgIG9uY2UgYW5kIGNhY2hpbmcgdGhlIHJlc3VsdC4gVGhpc1xuICogd29ya3MgZm9yIGJvdGggY29uc3VtZXIgKGBhcGkuZ2l0aHViY29waWxvdC5jb21gKSBhbmQgRW50ZXJwcmlzZVxuICogKGBhcGkuZW50ZXJwcmlzZS5naXRodWJjb3BpbG90LmNvbWApIGFjY291bnRzIHdpdGhvdXQgY29uZmlndXJhdGlvbi5cbiAqXG4gKiB7QGxpbmsgdXRpbGl0eUNoYXRDb21wbGV0aW9ufSBpcyB0aGUgb25lIGV4Y2VwdGlvbiB0byB0aGVcbiAqIEdpdEh1Yi10b2tlbi1JUy10aGUtY3JlZGVudGlhbCBydWxlOiBDQVBJJ3MgYC9jaGF0L2NvbXBsZXRpb25zYCBlbmRwb2ludFxuICogZXhwZWN0cyBhIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbiAodGhlIHNhbWUgb25lIHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uXG4gKiBtaW50cyB2aWEgYFJlcXVlc3RUeXBlLkNvcGlsb3RUb2tlbmApLiBUaGUgc2VydmljZSBtaW50cyBpdCBpbnRlcm5hbGx5XG4gKiBmcm9tIHRoZSBzdXBwbGllZCBHaXRIdWIgdG9rZW4sIGNhY2hlcyBpdCBwZXItdG9rZW4gYWxvbmdzaWRlIHRoZVxuICogcmVzb2x2ZWQgdXRpbGl0eSBtb2RlbCBpZCwgYW5kIHJlZnJlc2hlcyBhaGVhZCBvZiBleHBpcnkuXG4gKlxuICogIyMgTm9uLWdvYWxzXG4gKlxuICogLSBQZXItY29udmVyc2F0aW9uIGhpc3RvcnksIHJldHJ5L2JhY2tvZmYsIG9yIHJhdGUtbGltaXQgaGFuZGxpbmcuIENhbGxlcnNcbiAqICAgb3duIHJlcXVlc3Qgb3JjaGVzdHJhdGlvbi5cbiAqXG4gKiAjIyBDb25jdXJyZW5jeSBtb2RlbFxuICpcbiAqIC0gRWFjaCBjYWNoZWQgZW50cnkgaXMgYSAqKmRpc3RpbmN0IHtAbGluayBDQVBJQ2xpZW50fSBpbnN0YW5jZSoqIHdpdGggaXRzXG4gKiAgIG93biBkaXNjb3ZlcmVkIGRvbWFpbiBzdGF0ZS4gQ29uY3VycmVudCBpbi1mbGlnaHQgcmVxdWVzdHMgZm9yIHR3b1xuICogICBkaWZmZXJlbnQgR2l0SHViIHRva2VucyBjYW5ub3QgdHJhbXBsZSBlYWNoIG90aGVyJ3MgYGVuZHBvaW50cy5hcGlgIFx1MjAxNFxuICogICB0b2tlbiBBJ3MgcmVxdWVzdCB3aWxsIGFsd2F5cyByb3V0ZSB0aHJvdWdoIHRoZSBjbGllbnQgYnVpbHQgZm9yIEEuXG4gKiAtIE11bHRpcGxlIGluLWZsaWdodCByZXF1ZXN0cyBmb3IgdGhlICoqc2FtZSoqIEdpdEh1YiB0b2tlbiBzaGFyZSBhIHNpbmdsZVxuICogICBlbmRwb2ludC1kaXNjb3ZlcnkgY2FsbCB2aWEgdGhlIHBlci10b2tlbiBjYWNoZSBtYXAgKG5vIHRodW5kZXJpbmcgaGVyZFxuICogICBvbiBjb2xkIHN0YXJ0KS5cbiAqIC0gYEFib3J0U2lnbmFsYCBpcyBmb3J3YXJkZWQgdG8gdGhlIG91dGdvaW5nIEFQSSByZXF1ZXN0IChtZXNzYWdlcywgbW9kZWxzKVxuICogICBidXQgKipub3QqKiB0byB0aGUgc2hhcmVkIGRpc2NvdmVyeSBjYWxsLCBzbyBjYW5jZWxsYXRpb24gcHJvcGFnYXRlcyB0b1xuICogICB0aGUgY2FsbGVyJ3Mgb3duIHJlcXVlc3Qgd2l0aG91dCBhZmZlY3RpbmcgY29uY3VycmVudCBjYWxsZXJzIHNoYXJpbmcgdGhlXG4gKiAgIGRpc2NvdmVyeS5cbiAqXG4gKiAjIyBFcnJvciBzZW1hbnRpY3NcbiAqXG4gKiAtIE5ldHdvcmsvdHJhbnNwb3J0IGVycm9ycyBwcm9wYWdhdGUgYXMgcmF3IGBmZXRjaGAgcmVqZWN0aW9ucyAoZS5nLlxuICogICBjb25uZWN0aW9uIHJlc2V0LCBETlMgZmFpbHVyZSkuIENvbnN1bWVycyBjYW4gZGlzdGluZ3Vpc2ggdGhlbSBmcm9tXG4gKiAgIEFQSSBlcnJvcnMgYnkgYGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yYC5cbiAqIC0gTm9uLTJ4eCByZXNwb25zZXMgZnJvbSBDQVBJJ3MgYG1lc3NhZ2VzYCBhbmQgYG1vZGVsc2AgZW5kcG9pbnRzIHRocm93XG4gKiAgIHtAbGluayBDb3BpbG90QXBpRXJyb3J9IGNhcnJ5aW5nIHRoZSBIVFRQIGBzdGF0dXNgIGFuZCB0aGUgcGFyc2VkXG4gKiAgIEFudGhyb3BpYyBlcnJvciBgZW52ZWxvcGVgIChzeW50aGVzaXplZCBpZiB0aGUgcmVzcG9uc2UgYm9keSBpc24ndCBhXG4gKiAgIGNvbmZvcm1pbmcgZW52ZWxvcGUpLiAqKlRva2VucyBhcmUgbmV2ZXIgZW1iZWRkZWQgaW4gZXJyb3IgbWVzc2FnZXMuKipcbiAqIC0gU3RyZWFtaW5nIGBldmVudDogZXJyb3JgIFNTRSBmcmFtZXMgdGhyb3cge0BsaW5rIENvcGlsb3RBcGlFcnJvcn0gd2l0aFxuICogICBgc3RhdHVzYCBzZXQgdG8ge0BsaW5rIENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkd9ICh0aGUgdXBzdHJlYW1cbiAqICAgSFRUUCBzdGF0dXMgd2FzIDIwMCBhbmQgaXMgbm8gbG9uZ2VyIG1lYW5pbmdmdWwpIGFuZCB0aGUgc2VydmVyLXN1cHBsaWVkXG4gKiAgIGVycm9yIGVudmVsb3BlIHByZXNlcnZlZCB2ZXJiYXRpbS5cbiAqIC0gRmFpbHVyZXMgb2YgdGhlIGAvY29waWxvdF9pbnRlcm5hbC91c2VyYCBkaXNjb3ZlcnkgY2FsbCB0aHJvdyBwbGFpblxuICogICBgRXJyb3JgIChub3QgYENvcGlsb3RBcGlFcnJvcmApIHdpdGggYSBgXCJDb3BpbG90IGVuZHBvaW50IGRpc2NvdmVyeVxuICogICBmYWlsZWQ6IC4uLlwiYCBwcmVmaXggXHUyMDE0IGl0IGlzIGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBvZiB0aGlzIHNlcnZpY2VcbiAqICAgYW5kIGlzIG5vdCBwYXJ0IG9mIHRoZSBBbnRocm9waWMtc2hhcGVkIENBUEkgc3VyZmFjZS5cbiAqIC0gTWFsZm9ybWVkIEpTT04gaW4gYW4gU1NFIGBkYXRhOmAgbGluZSBpcyBsb2dnZWQgYW5kIHNraXBwZWQsIG5vdCB0aHJvd24uXG4gKi9cbi8qKlxuICogUmVzdHJpY3RlZC9lbmhhbmNlZCB0ZWxlbWV0cnkgY29udGV4dCBkZXJpdmVkIGZyb20gYSB1c2VyJ3MgbWludGVkIENBUEkgQ29waWxvdCBzZXNzaW9uIHRva2VuLFxuICogbWlycm9yaW5nIHdoYXQgdGhlIENvcGlsb3QgZXh0ZW5zaW9uIHJlYWRzIG9mZiBpdHMgYENvcGlsb3RUb2tlbmAgKGBydGAgb3B0LWluLCBgdGlkYCB0cmFja2luZyBpZClcbiAqIHBsdXMgdGhlIENBUEkgYGVuZHBvaW50cy50ZWxlbWV0cnlgIGhvc3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0IHtcblx0LyoqIFdoZXRoZXIgdGhlIHRva2VuIG9wdHMgaW50byBlbmhhbmNlZC9yZXN0cmljdGVkIHRlbGVtZXRyeSAodGhlIGBydD0xYCBjbGFpbSkuICovXG5cdHJlYWRvbmx5IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiBib29sZWFuO1xuXHQvKiogVGhlIENvcGlsb3QgdXNlciB0cmFja2luZyBpZCAoYHRpZGAgY2xhaW0pLCBvciBgdW5kZWZpbmVkYCB3aGVuIGFic2VudC4gKi9cblx0cmVhZG9ubHkgdHJhY2tpbmdJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogVGhlIENBUEkgYGVuZHBvaW50cy50ZWxlbWV0cnlgIGJhc2UgVVJMLCByZXNvbHZlZCBvbmx5IHdoZW4gZW5hYmxlZDsgYHVuZGVmaW5lZGAgb3RoZXJ3aXNlLiAqL1xuXHRyZWFkb25seSB0ZWxlbWV0cnlFbmRwb2ludDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciB0aGUgdG9rZW4gYmVsb25ncyB0byBhIEdpdEh1YiBvciBNaWNyb3NvZnQgaW50ZXJuYWwgb3JnYW5pemF0aW9uLiAqL1xuXHRyZWFkb25seSBpc0ludGVybmFsPzogYm9vbGVhbjtcblx0LyoqIEdpdEh1YiBsb2dpbiByZXR1cm5lZCBieSBgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmAuICovXG5cdHJlYWRvbmx5IHVzZXJOYW1lPzogc3RyaW5nO1xuXHQvKiogV2hldGhlciB0aGUgdG9rZW4gaWRlbnRpZmllcyBhIFZTIENvZGUgdGVhbSBtZW1iZXIuICovXG5cdHJlYWRvbmx5IGlzVnNjb2RlVGVhbU1lbWJlcj86IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIGNvbnRlbnQgZXhjbHVzaW9uIGlzIGVuYWJsZWQ7IHVuZGVmaW5lZCB3aGVuIGRpc2NvdmVyeSBjb3VsZCBub3QgZGV0ZXJtaW5lIGl0LiAqL1xuXHRyZWFkb25seSBjb3BpbG90SWdub3JlRW5hYmxlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RBcGlTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFN0cmVhbSBhIGNoYXQgY29tcGxldGlvbiBhcyByYXcgQW50aHJvcGljIHN0cmVhbSBldmVudHMuXG5cdCAqXG5cdCAqIFlpZWxkcyBldmVyeSBgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudGAgaW4gdGhlIG9yZGVyIHRoZSBzZXJ2ZXJcblx0ICogZW1pdHMgdGhlbSwgKippbmNsdWRpbmcgYG1lc3NhZ2Vfc3RvcGAgYXMgdGhlIGxhc3QgZXZlbnQqKiBiZWZvcmUgdGhlXG5cdCAqIGdlbmVyYXRvciByZXR1cm5zLiBQaGFzZSAyIHByb3h5IHJlbGllcyBvbiByZWNlaXZpbmcgYSBjb21wbGV0ZSxcblx0ICogcmVwbGF5YWJsZSBldmVudCBzdHJlYW0uXG5cdCAqXG5cdCAqIEB0aHJvd3Mgb24gbm9uLTJ4eCBzdGF0dXMgb3IgU1NFIGBlcnJvcmAgZXZlbnQuXG5cdCAqL1xuXHRtZXNzYWdlcyhcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cblx0LyoqXG5cdCAqIFNlbmQgYSBjaGF0IGNvbXBsZXRpb24gYW5kIHJldHVybiB0aGUgZnVsbCBhZ2dyZWdhdGVkIHJlc3BvbnNlLlxuXHQgKiBAdGhyb3dzIG9uIG5vbi0yeHggc3RhdHVzLlxuXHQgKi9cblx0bWVzc2FnZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc05vblN0cmVhbWluZyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2U+O1xuXG5cdC8qKlxuXHQgKiBDb3VudCB0b2tlbnMgZm9yIGEgaHlwb3RoZXRpY2FsIHJlcXVlc3QuXG5cdCAqXG5cdCAqIEB0aHJvd3MgYWx3YXlzIFx1MjAxNCBgY291bnRUb2tlbnNgIGlzIG5vdCBzdXBwb3J0ZWQgYnkgQ0FQSSBpbiBQaGFzZSAxLjUuXG5cdCAqIFBoYXNlIDIgcHJveHkgbWFwcyB0aGlzIHRvIEhUVFAgNTAxLlxuXHQgKi9cblx0Y291bnRUb2tlbnMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXE6IEFudGhyb3BpYy5NZXNzYWdlQ291bnRUb2tlbnNQYXJhbXMsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlVG9rZW5zQ291bnQ+O1xuXG5cdC8qKlxuXHQgKiBMaXN0IG1vZGVscyBhdmFpbGFibGUgdG8gdGhlIEdpdEh1YiB1c2VyLlxuXHQgKlxuXHQgKiBFYWNoIHtAbGluayBDQ0FNb2RlbH0gY2FycmllcyBhIGB2ZW5kb3JgIChlLmcuIGAnQW50aHJvcGljJ2ApIGFuZFxuXHQgKiBgc3VwcG9ydGVkX2VuZHBvaW50c2AgKGUuZy4gYFsnL3YxL21lc3NhZ2VzJ11gKS4gQ2FsbGVycyBmaWx0ZXJpbmcgZm9yXG5cdCAqIEFudGhyb3BpYy1mb3JtYXQgbW9kZWxzIHNob3VsZCBtYXRjaCBvbiBib3RoIGZpZWxkcy5cblx0ICpcblx0ICogS25vd24gQ0FQSSB2YWx1ZXMgYXMgb2YgMjAyNi0wNC0zMDpcblx0ICogLSBgdmVuZG9yYDogYCdBbnRocm9waWMnYCAoY2FwaXRhbGl6ZWQpXG5cdCAqIC0gYHN1cHBvcnRlZF9lbmRwb2ludHNgOiBgJy92MS9tZXNzYWdlcydgIGZvciBBbnRocm9waWMgY2hhdCBtb2RlbHNcblx0ICovXG5cdG1vZGVscyhnaXRodWJUb2tlbjogc3RyaW5nLCBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPENDQU1vZGVsW10+O1xuXG5cdC8qKlxuXHQgKiBQYXNzLXRocm91Z2ggdG8gQ0FQSSdzIE9wZW5BSS1zaGFwZWQgUmVzcG9uc2VzIGVuZHBvaW50XG5cdCAqIChge2NhcGlCYXNlVXJsfS9yZXNwb25zZXNgKS4gVXNlZCBieSBgQ29kZXhQcm94eVNlcnZpY2VgIHRvIGZvcndhcmRcblx0ICogYC92MS9yZXNwb25zZXNgIHJlcXVlc3RzIGZyb20gdGhlIENvZGV4IENMSSB3aXRob3V0IGRlc2VyaWFsaXppbmdcblx0ICogdGhlIGJvZHkuIFRoZSBjYWxsZXIgb3ducyB0aGUgcmV0dXJuZWQgYFJlc3BvbnNlYCAoaXRzIGJvZHkgYW5kIGFueVxuXHQgKiBzdHJlYW1pbmcpIGFuZCBpcyByZXNwb25zaWJsZSBmb3IgY29uc3VtaW5nIG9yIGFib3J0aW5nIGl0LlxuXHQgKlxuXHQgKiBAdGhyb3dzIG9uIG5vbi0yeHggdXBzdHJlYW0gcmVzcG9uc2UuXG5cdCAqL1xuXHRyZXNwb25zZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRib2R5OiBzdHJpbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPFJlc3BvbnNlPjtcblxuXHQvKipcblx0ICogU2VuZCBhcmJpdHJhcnkgdXNlciBjaGF0IG1lc3NhZ2VzIHRocm91Z2ggQ0FQSSdzIGAvY2hhdC9jb21wbGV0aW9uc2Bcblx0ICogZW5kcG9pbnQgYW5kIHJldHVybiB0aGUgYXNzaXN0YW50IHRleHQuXG5cdCAqXG5cdCAqIEludGVybmFsbHkgbWludHMgKGFuZCBjYWNoZXMpIGEgQ29waWxvdCBzZXNzaW9uIHRva2VuIGZyb20gdGhlXG5cdCAqIHN1cHBsaWVkIEdpdEh1YiB0b2tlbiBcdTIwMTQgdGhlIHNhbWUgZmxvdyB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvblxuXHQgKiB1c2VzIGZvciBpdHMgYGNvcGlsb3QtdXRpbGl0eS1zbWFsbGAgZW5kcG9pbnQgKFBSIHRpdGxlL2Rlc2NyaXB0aW9uLFxuXHQgKiBjb21taXQgbWVzc2FnZXMsIGJyYW5jaCBuYW1lcywgY2hhdCB0aXRsZXMsIGV0Yy4pLiBVc2VzIHRoZVxuXHQgKiBgZ3B0LTRvLW1pbmlgIG1vZGVsIGZhbWlseSB3aXRoIGB0b3BfcCA9IDFgIGFuZCBgdGVtcGVyYXR1cmUgPSAwLjFgXG5cdCAqIGJ5IGRlZmF1bHQgKG92ZXJyaWRlIHZpYSBgcmVxdWVzdC50ZW1wZXJhdHVyZWApLlxuXHQgKlxuXHQgKiBOb24tc3RyZWFtaW5nLiBDYWxsZXJzIG93biBwcm9tcHQgY29uc3RydWN0aW9uIGFuZCBhbnlcblx0ICogZG9tYWluLXNwZWNpZmljIHBhcnNpbmcgb2YgdGhlIHJldHVybmVkIHRleHQuXG5cdCAqXG5cdCAqIEB0aHJvd3Mge0BsaW5rIENvcGlsb3RBcGlFcnJvcn0gb24gbm9uLTJ4eCBDQVBJIHJlc3BvbnNlLlxuXHQgKiBAdGhyb3dzIHBsYWluIGBFcnJvcmAgd2hlbiBubyBtb2RlbCBpbiB0aGUgcmVxdWVzdGVkIGZhbWlseSBpc1xuXHQgKiBhdmFpbGFibGUgb3Igd2hlbiB0aGUgcmVzcG9uc2UgY29udGFpbnMgbm8gdGV4dCBjb250ZW50LlxuXHQgKi9cblx0dXRpbGl0eUNoYXRDb21wbGV0aW9uKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0LFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxzdHJpbmc+O1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoaXMgdXNlcidzIHJlc3RyaWN0ZWQtdGVsZW1ldHJ5IGNvbnRleHQgZnJvbSB0aGUgbWludGVkIENBUEkgQ29waWxvdCBzZXNzaW9uIHRva2VuIFx1MjAxNFxuXHQgKiB0aGUgYHJ0YCBvcHQtaW4gYW5kIGB0aWRgIHRyYWNraW5nIGlkIFx1MjAxNCBwbHVzIHRoZSBDQVBJIGBlbmRwb2ludHMudGVsZW1ldHJ5YCBob3N0LiBUaGUgR2l0SHViXG5cdCAqIHRva2VuIGl0c2VsZiBjYXJyaWVzIG5vbmUgb2YgdGhlc2UgY2xhaW1zOyB0aGV5IGxpdmUgaW4gdGhlIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbiAobWludGVkIHZpYVxuXHQgKiBgUmVxdWVzdFR5cGUuQ29waWxvdFRva2VuYCksIGV4YWN0bHkgYXMgdGhlIENvcGlsb3QgZXh0ZW5zaW9uIHJlYWRzIHRoZW0gb2ZmIGl0cyBgQ29waWxvdFRva2VuYC5cblx0ICogVGhlIHRlbGVtZXRyeSBlbmRwb2ludCBpcyByZXNvbHZlZCBvbmx5IHdoZW4gZW5hYmxlZCwgc28gcHVibGljIHVzZXJzIGluY3VyIG5vIGV4dHJhIGRpc2NvdmVyeS5cblx0ICovXG5cdHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dChnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ+O1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBDQVBJIGBlbmRwb2ludHMuYXBpYCBiYXNlIFVSTCBkaXNjb3ZlcmVkIGZvciB0aGlzIEdpdEh1YiB0b2tlblxuXHQgKiAob3IgdGhlIGxvb3BiYWNrIHRlc3Qgb3ZlcnJpZGUpLCBvciBgdW5kZWZpbmVkYCB3aGVuIGRpc2NvdmVyeSBoYXNuJ3QgcnVuXG5cdCAqIG9yIGZhaWxlZC4gVGhlIGVmZmVjdGl2ZSBDQVBJIGhvc3QgdmFyaWVzIGJ5IGFjY291bnQgKGNvbnN1bWVyXG5cdCAqIGBhcGkuZ2l0aHViY29waWxvdC5jb21gIHZzLiBFbnRlcnByaXNlIC8gcHJveHkpLCBzbyBjYWxsZXJzIHRoYXQgbmVlZCB0aGVcblx0ICogcmVhbCBob3N0IFx1MjAxNCBlLmcuIHRvIHJlc29sdmUgdGhlIGNvcnJlY3QgcHJveHkgXHUyMDE0IHNob3VsZCBwcmVmZXIgdGhpcyBvdmVyIHRoZVxuXHQgKiBoYXJkY29kZWQgZGVmYXVsdC5cblx0ICovXG5cdHJlc29sdmVBcGlFbmRwb2ludChnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBSZXNvbHZlIHRoZSBHaXRIdWIgbG9naW4gY2FjaGVkIGZyb20gYC9jb3BpbG90X2ludGVybmFsL3VzZXJgLiAqL1xuXHRyZXNvbHZlVXNlckxvZ2luPyhnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgQ29waWxvdEFwaVNlcnZpY2UgaW1wbGVtZW50cyBJQ29waWxvdEFwaVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2NhcGlCYXNlUHJvbWlzZTogUHJvbWlzZTxJQ2FwaUJhc2U+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudHNCeVRva2VuID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SUNhY2hlZENsaWVudD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvcGlsb3RUb2tlbnNCeUdpdGh1YiA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPElDYWNoZWRDb3BpbG90VG9rZW4+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mZXRjaDogRmV0Y2hGdW5jdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRmZXRjaEZuOiBGZXRjaEZ1bmN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0SHViRW5kcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9mZXRjaCA9IGZldGNoRm4gPz8gZ2xvYmFsVGhpcy5mZXRjaDtcblx0fVxuXG5cdC8vICNyZWdpb24gUHVibGljIEFQSVxuXG5cdG1lc3NhZ2VzKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNTdHJlYW1pbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBBc3luY0dlbmVyYXRvcjxBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50Pjtcblx0bWVzc2FnZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc05vblN0cmVhbWluZyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2U+O1xuXHRtZXNzYWdlcyhcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4gfCBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0aWYgKHJlcXVlc3Quc3RyZWFtKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWVzc2FnZXNTdHJlYW1pbmcoZ2l0aHViVG9rZW4sIHJlcXVlc3QsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWVzc2FnZXNOb25TdHJlYW1pbmcoZ2l0aHViVG9rZW4sIHJlcXVlc3QsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgY291bnRUb2tlbnMoXG5cdFx0X2dpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0X3JlcTogQW50aHJvcGljLk1lc3NhZ2VDb3VudFRva2Vuc1BhcmFtcyxcblx0XHRfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlVG9rZW5zQ291bnQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NvdW50VG9rZW5zIG5vdCBzdXBwb3J0ZWQgYnkgQ0FQSScpO1xuXHR9XG5cblx0YXN5bmMgbW9kZWxzKGdpdGh1YlRva2VuOiBzdHJpbmcsIG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8Q0NBTW9kZWxbXT4ge1xuXHRcdGNvbnN0IGNhcGlDbGllbnQgPSBhd2FpdCB0aGlzLl9nZXRDbGllbnRGb3JUb2tlbihnaXRodWJUb2tlbik7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdbQ29waWxvdEFwaVNlcnZpY2VdIEdFVCBtb2RlbHMnKTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2FwaUNsaWVudC5tYWtlUmVxdWVzdDxSZXNwb25zZT4oXG5cdFx0XHR7XG5cdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQuLi5vcHRpb25zPy5oZWFkZXJzLFxuXHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2dpdGh1YlRva2VufWAsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIE9wdC1pbiBwZXIgcmVxdWVzdCBcdTIwMTQgc2VlXG5cdFx0XHRcdC8vIGBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucy5zdXBwcmVzc0ludGVncmF0aW9uSWRgLlxuXHRcdFx0XHRzdXBwcmVzc0ludGVncmF0aW9uSWQ6IG9wdGlvbnM/LnN1cHByZXNzSW50ZWdyYXRpb25JZCxcblx0XHRcdFx0c2lnbmFsOiBvcHRpb25zPy5zaWduYWwsXG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiBSZXF1ZXN0VHlwZS5Nb2RlbHMgfSxcblx0XHQpO1xuXG5cdFx0aWYgKCFyZXNwb25zZS5vaykge1xuXHRcdFx0aWYgKHJlc3BvbnNlLnN0YXR1cyA9PT0gNDAxIHx8IHJlc3BvbnNlLnN0YXR1cyA9PT0gNDAzKSB7XG5cdFx0XHRcdHRoaXMuX2ludmFsaWRhdGVDbGllbnRGb3JUb2tlbihnaXRodWJUb2tlbik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpLmNhdGNoKCgpID0+ICcnKTtcblx0XHRcdHRocm93IGJ1aWxkQ29waWxvdEFwaUh0dHBFcnJvcihyZXNwb25zZS5zdGF0dXMsIHJlc3BvbnNlLnN0YXR1c1RleHQsIHRleHQsICdDQVBJIG1vZGVscyByZXF1ZXN0IGZhaWxlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGpzb24gPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG5cdFx0cmV0dXJuIGpzb24uZGF0YSA/PyBbXTtcblx0fVxuXG5cdGFzeW5jIHJlc3BvbnNlcyhcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdGJvZHk6IHN0cmluZyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8UmVzcG9uc2U+IHtcblx0XHRjb25zdCBjYXBpQ2xpZW50ID0gYXdhaXQgdGhpcy5fZ2V0Q2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0Ly8gUGFyc2UgdGhlIHJlcXVlc3QgYm9keSB0byBsb2cgdGhlIG1vZGVsIGJlaW5nIHNlbnQgKGRlYnVnIGFpZDsgZmFpbHVyZXNcblx0XHQvLyBhcmUgbm9uLWZhdGFsIFx1MjAxNCB0aGUgYm9keSBpcyBmb3J3YXJkZWQgYnl0ZS1mb3ItYnl0ZSByZWdhcmRsZXNzKS5cblx0XHRsZXQgcmVxdWVzdE1vZGVsID0gJzx1bmtub3duPic7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoYm9keSk7XG5cdFx0XHRyZXF1ZXN0TW9kZWwgPSBwYXJzZWQubW9kZWwgPz8gJzxub25lPic7XG5cdFx0fSBjYXRjaCB7IC8qIGlnbm9yZSBwYXJzZSBlcnJvcnMgKi8gfVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RBcGlTZXJ2aWNlXSBQT1NUIHJlc3BvbnNlczogcmVxdWVzdElkPSR7cmVxdWVzdElkfSwgbW9kZWw9JHtyZXF1ZXN0TW9kZWx9YCk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGNhcGlDbGllbnQubWFrZVJlcXVlc3Q8UmVzcG9uc2U+KFxuXHRcdFx0e1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdC4uLm9wdGlvbnM/LmhlYWRlcnMsXG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtnaXRodWJUb2tlbn1gLFxuXHRcdFx0XHRcdCdYLVJlcXVlc3QtSWQnOiByZXF1ZXN0SWQsXG5cdFx0XHRcdFx0J09wZW5BSS1JbnRlbnQnOiAnY29udmVyc2F0aW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gT3B0LWluIHBlciByZXF1ZXN0IFx1MjAxNCBzZWVcblx0XHRcdFx0Ly8gYElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLnN1cHByZXNzSW50ZWdyYXRpb25JZGAuXG5cdFx0XHRcdHN1cHByZXNzSW50ZWdyYXRpb25JZDogb3B0aW9ucz8uc3VwcHJlc3NJbnRlZ3JhdGlvbklkLFxuXHRcdFx0XHRib2R5LFxuXHRcdFx0XHRzaWduYWw6IG9wdGlvbnM/LnNpZ25hbCxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6IFJlcXVlc3RUeXBlLkNoYXRSZXNwb25zZXMgfSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdEFwaVNlcnZpY2VdIHJlc3BvbnNlcyBzdGF0dXM9JHtyZXNwb25zZS5zdGF0dXN9LCByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9YCk7XG5cblx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDEgfHwgcmVzcG9uc2Uuc3RhdHVzID09PSA0MDMpIHtcblx0XHRcdFx0dGhpcy5faW52YWxpZGF0ZUNsaWVudEZvclRva2VuKGdpdGh1YlRva2VuKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCkuY2F0Y2goKCkgPT4gJycpO1xuXHRcdFx0dGhyb3cgYnVpbGRDb3BpbG90QXBpSHR0cEVycm9yKHJlc3BvbnNlLnN0YXR1cywgcmVzcG9uc2Uuc3RhdHVzVGV4dCwgdGV4dCwgJ0NBUEkgcmVzcG9uc2VzIHJlcXVlc3QgZmFpbGVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNwb25zZTtcblx0fVxuXG5cdGFzeW5jIHV0aWxpdHlDaGF0Q29tcGxldGlvbihcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdCxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2FwaUNsaWVudCA9IGF3YWl0IHRoaXMuX2dldENsaWVudEZvclRva2VuKGdpdGh1YlRva2VuKTtcblx0XHRjb25zdCBjb3BpbG90VG9rZW4gPSBhd2FpdCB0aGlzLl9nZXRDb3BpbG90VG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdGNvbnN0IG1vZGVsSWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVXRpbGl0eU1vZGVsSWQoZ2l0aHViVG9rZW4sIFVUSUxJVFlfREVGQVVMVF9NT0RFTF9GQU1JTFkpO1xuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NvcGlsb3RBcGlTZXJ2aWNlXSBQT1NUIGNoYXQgY29tcGxldGlvbnMnLCBgbW9kZWw9JHttb2RlbElkfSByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9YCk7XG5cblx0XHRjb25zdCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bW9kZWw6IG1vZGVsSWQsXG5cdFx0XHRtZXNzYWdlczogcmVxdWVzdC5tZXNzYWdlcy5tYXAobSA9PiAoeyByb2xlOiBtLnJvbGUsIGNvbnRlbnQ6IG0uY29udGVudCB9KSksXG5cdFx0XHRzdHJlYW06IGZhbHNlLFxuXHRcdFx0dGVtcGVyYXR1cmU6IHJlcXVlc3QudGVtcGVyYXR1cmUgPz8gVVRJTElUWV9ERUZBVUxUX1RFTVBFUkFUVVJFLFxuXHRcdFx0dG9wX3A6IFVUSUxJVFlfREVGQVVMVF9UT1BfUCxcblx0XHRcdG1heF90b2tlbnM6IHJlcXVlc3QubWF4VG9rZW5zLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjYXBpQ2xpZW50Lm1ha2VSZXF1ZXN0PFJlc3BvbnNlPihcblx0XHRcdHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHQuLi5vcHRpb25zPy5oZWFkZXJzLFxuXHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7Y29waWxvdFRva2VufWAsXG5cdFx0XHRcdFx0J1gtUmVxdWVzdC1JZCc6IHJlcXVlc3RJZCxcblx0XHRcdFx0XHQnT3BlbkFJLUludGVudCc6IFVUSUxJVFlfSU5URU5ULFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRib2R5LFxuXHRcdFx0XHRzaWduYWw6IG9wdGlvbnM/LnNpZ25hbCxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6IFJlcXVlc3RUeXBlLkNoYXRDb21wbGV0aW9ucyB9LFxuXHRcdCk7XG5cblx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRpZiAocmVzcG9uc2Uuc3RhdHVzID09PSA0MDEgfHwgcmVzcG9uc2Uuc3RhdHVzID09PSA0MDMpIHtcblx0XHRcdFx0dGhpcy5faW52YWxpZGF0ZUNvcGlsb3RUb2tlbkZvckdpdGh1YihnaXRodWJUb2tlbik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpLmNhdGNoKCgpID0+ICcnKTtcblx0XHRcdHRocm93IGJ1aWxkQ29waWxvdEFwaUh0dHBFcnJvcihyZXNwb25zZS5zdGF0dXMsIHJlc3BvbnNlLnN0YXR1c1RleHQsIHRleHQsICdDQVBJIGNoYXQgY29tcGxldGlvbiByZXF1ZXN0IGZhaWxlZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGpzb24gPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgeyBjaG9pY2VzPzogUmVhZG9ubHlBcnJheTx7IG1lc3NhZ2U/OiB7IGNvbnRlbnQ/OiB1bmtub3duIH0gfT4gfTtcblx0XHRjb25zdCBjb250ZW50ID0ganNvbj8uY2hvaWNlcz8uWzBdPy5tZXNzYWdlPy5jb250ZW50O1xuXHRcdGlmICh0eXBlb2YgY29udGVudCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ0FQSSBjaGF0IGNvbXBsZXRpb24gcmV0dXJuZWQgbm8gdGV4dCBjb250ZW50Jyk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZW50O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gTGF6eSBJbml0XG5cblx0cHJpdmF0ZSBfZ2V0Q2FwaUJhc2UoKTogUHJvbWlzZTxJQ2FwaUJhc2U+IHtcblx0XHRpZiAoIXRoaXMuX2NhcGlCYXNlUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5fY2FwaUJhc2VQcm9taXNlID0gdGhpcy5fYnVpbGRDYXBpQmFzZSgpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2NhcGlCYXNlUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2FwaUJhc2VQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYnVpbGRDYXBpQmFzZSgpOiBQcm9taXNlPElDYXBpQmFzZT4ge1xuXHRcdGNvbnN0IFttYWNoaW5lSWQsIGRldmljZUlkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGdldE1hY2hpbmVJZChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdEFwaVNlcnZpY2VdIGdldE1hY2hpbmVJZCBmYWlsZWQnLCBlcnIpKSxcblx0XHRcdGdldERldkRldmljZUlkKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb3BpbG90QXBpU2VydmljZV0gZ2V0RGV2RGV2aWNlSWQgZmFpbGVkJywgZXJyKSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25JbmZvOiBJRXh0ZW5zaW9uSW5mb3JtYXRpb24gPSB7XG5cdFx0XHRuYW1lOiAnYWdlbnQtaG9zdCcsXG5cdFx0XHRzZXNzaW9uSWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0bWFjaGluZUlkLFxuXHRcdFx0ZGV2aWNlSWQsXG5cdFx0XHR2c2NvZGVWZXJzaW9uOiB0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0dmVyc2lvbjogdGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRcdGJ1aWxkVHlwZTogdGhpcy5fcHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScgPyAncHJvZCcgOiAnZGV2Jyxcblx0XHR9O1xuXG5cdFx0Ly8gQ29waWxvdCBlbmRwb2ludCBkaXNjb3Zlcnk6IEdFVCBgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmAgb24gdGhlIEdpdEh1YiBBUElcblx0XHQvLyBob3N0LiBGb3IgR2l0SHViIEVudGVycHJpc2UgdGhlIGhvc3QgaXMgZGVyaXZlZCBmcm9tIGBnaXRodWJFbnRlcnByaXNlVXJpYFxuXHRcdC8vICh2aWEgdGhlIGVuZHBvaW50IHNlcnZpY2UpOyB0aGUgcmVzcG9uc2UncyBgZW5kcG9pbnRzLmFwaWAgdGhlbiBjYXJyaWVzIHRoZVxuXHRcdC8vIGVudGVycHJpc2UgQ0FQSSBiYXNlIHRoYXQgQ0FQSUNsaWVudCByb3V0ZXMgdGhyb3VnaC4gRGVmYXVsdHMgdG9cblx0XHQvLyBhcGkuZ2l0aHViLmNvbSB3aGVuIG5vIGVudGVycHJpc2UgVVJJIGlzIHNldC4gKEdIRSBDbG91ZCBgKi5naGUuY29tYCBpc1xuXHRcdC8vIGhhbmRsZWQ7IEdIRSBTZXJ2ZXIgb24tcHJlbSBgL2NvcGlsb3RfaW50ZXJuYWxgIHJvdXRpbmcgaXMgdW52ZXJpZmllZC4pXG5cdFx0Y29uc3QgdXNlclVybCA9IGAke3RoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRBcGlCYXNlVXJpKCl9L2NvcGlsb3RfaW50ZXJuYWwvdXNlcmA7XG5cblx0XHRyZXR1cm4geyBleHRlbnNpb25JbmZvLCB1c2VyVXJsIH07XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTdHJlYW1pbmdcblxuXHRwcml2YXRlIGFzeW5jICpfbWVzc2FnZXNTdHJlYW1pbmcoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtcyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KGdpdGh1YlRva2VuLCByZXF1ZXN0LCB0cnVlLCBvcHRpb25zKTtcblxuXHRcdGlmICghcmVzcG9uc2UuYm9keSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDQVBJIHJlc3BvbnNlIGhhcyBubyBib2R5Jyk7XG5cdFx0fVxuXG5cdFx0eWllbGQqIHRoaXMuX3JlYWRTU0UocmVzcG9uc2UuYm9keSk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBOb24tU3RyZWFtaW5nXG5cblx0cHJpdmF0ZSBhc3luYyBfbWVzc2FnZXNOb25TdHJlYW1pbmcoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtcyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2U+IHtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3NlbmRSZXF1ZXN0KGdpdGh1YlRva2VuLCByZXF1ZXN0LCBmYWxzZSwgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIHJlc3BvbnNlLmpzb24oKSBhcyBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFNoYXJlZCBSZXF1ZXN0XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZFJlcXVlc3QoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtcyxcblx0XHRzdHJlYW06IGJvb2xlYW4sXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPFJlc3BvbnNlPiB7XG5cdFx0Y29uc3QgY2FwaUNsaWVudCA9IGF3YWl0IHRoaXMuX2dldENsaWVudEZvclRva2VuKGdpdGh1YlRva2VuKTtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1tDb3BpbG90QXBpU2VydmljZV0gUE9TVCBtZXNzYWdlcycsIGBtb2RlbD0ke3JlcXVlc3QubW9kZWx9IHN0cmVhbT0ke3N0cmVhbX0gcmVxdWVzdElkPSR7cmVxdWVzdElkfWApO1xuXG5cdFx0Y29uc3QgeyBzeXN0ZW0sIC4uLnJlc3QgfSA9IHJlcXVlc3Q7XG5cdFx0Y29uc3QgYm9keSA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdC4uLnJlc3QsXG5cdFx0XHRzdHJlYW0sXG5cdFx0XHQvLyBDQVBJIHJlcXVpcmVzIHN5c3RlbSBhcyBhIHRleHQtYmxvY2sgYXJyYXksIG5vdCBhIHJhdyBzdHJpbmdcblx0XHRcdC4uLihzeXN0ZW0gIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IHsgc3lzdGVtOiB0eXBlb2Ygc3lzdGVtID09PSAnc3RyaW5nJyA/IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogc3lzdGVtIH1dIDogc3lzdGVtIH1cblx0XHRcdFx0OiB7fSksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGNhcGlDbGllbnQubWFrZVJlcXVlc3Q8UmVzcG9uc2U+KFxuXHRcdFx0e1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdC4uLm9wdGlvbnM/LmhlYWRlcnMsXG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtnaXRodWJUb2tlbn1gLFxuXHRcdFx0XHRcdCdYLVJlcXVlc3QtSWQnOiByZXF1ZXN0SWQsXG5cdFx0XHRcdFx0J1gtR2l0SHViLUFwaS1WZXJzaW9uJzogJzIwMjYtMDEtMDknLFxuXHRcdFx0XHRcdC8vIFNob3VsZCB0aGVzZSBiZSBwYXJhbWV0ZXJpemVkP1xuXHRcdFx0XHRcdCdPcGVuQUktSW50ZW50JzogJ21lc3NhZ2VzLXByb3h5Jyxcblx0XHRcdFx0XHQnWC1JbnRlcmFjdGlvbi1UeXBlJzogJ21lc3NhZ2VzLXByb3h5Jyxcblx0XHRcdFx0XHQvLyBgWC1Jbml0aWF0b3JgICh1c2VyfGFnZW50KSBpcyBpbnRlbnRpb25hbGx5IG9taXR0ZWQ6IHRoZVxuXHRcdFx0XHRcdC8vIHVzZXItdnMtYWdlbnQgdHVybiBvcmlnaW4ga25vd24gdG8gYENsYXVkZUFnZW50U2Vzc2lvbmAgaXMgbm90XG5cdFx0XHRcdFx0Ly8gcGx1bWJlZCBhY3Jvc3MgdGhlIFNESyBzdWJwcm9jZXNzIHRvIHRoaXMgcHJveHksIHNvIGEgaGFyZGNvZGVkXG5cdFx0XHRcdFx0Ly8gdmFsdWUgd291bGQgbWlzbGFiZWwgbW9zdCBhZ2VudC1sb29wIHRyYWZmaWMuIENBUEkgYWNjZXB0cyB0aGVcblx0XHRcdFx0XHQvLyByZXF1ZXN0IHdpdGhvdXQgaXQgKHRoZSBgcmVzcG9uc2VzKClgIGFuZCBgdXRpbGl0eUNoYXRDb21wbGV0aW9uKClgXG5cdFx0XHRcdFx0Ly8gcGF0aHMgYWxyZWFkeSBvbWl0IGl0KS4gVGhyZWFkIGEgcmVhbCBwZXItdHVybiBpbml0aWF0b3IgaGVyZSBpZlxuXHRcdFx0XHRcdC8vIHRoYXQgc2lnbmFsIGV2ZXIgYmVjb21lcyBhdmFpbGFibGUgYXQgdGhlIHByb3h5IGJvdW5kYXJ5LlxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdXBwcmVzc0ludGVncmF0aW9uSWQ6IG9wdGlvbnM/LnN1cHByZXNzSW50ZWdyYXRpb25JZCxcblx0XHRcdFx0Ym9keSxcblx0XHRcdFx0c2lnbmFsOiBvcHRpb25zPy5zaWduYWwsXG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiBSZXF1ZXN0VHlwZS5DaGF0TWVzc2FnZXMgfSxcblx0XHQpO1xuXHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdGlmIChyZXNwb25zZS5zdGF0dXMgPT09IDQwMSB8fCByZXNwb25zZS5zdGF0dXMgPT09IDQwMykge1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlQ2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKS5jYXRjaCgoKSA9PiAnJyk7XG5cdFx0XHR0aHJvdyBidWlsZENvcGlsb3RBcGlIdHRwRXJyb3IocmVzcG9uc2Uuc3RhdHVzLCByZXNwb25zZS5zdGF0dXNUZXh0LCB0ZXh0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzcG9uc2U7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBQZXItVG9rZW4gQ2xpZW50XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSB7QGxpbmsgQ0FQSUNsaWVudH0gdGhhdCBoYXMgaGFkIGl0cyBkb21haW5zIHVwZGF0ZWQgZm9yIHRoZVxuXHQgKiBzdXBwbGllZCB1c2VyLiBDb25jdXJyZW50IGNhbGxlcnMgZm9yIHRoZSBzYW1lIHRva2VuIHNoYXJlIG9uZVxuXHQgKiBgL2NvcGlsb3RfaW50ZXJuYWwvdXNlcmAgZGlzY292ZXJ5IHZpYSB0aGUgY2FjaGUgbWFwOyBjYWxsZXJzIHdpdGhcblx0ICogZGlmZmVyZW50IHRva2VucyBnZXQgdGhlaXIgKipvd24qKiBgQ0FQSUNsaWVudGAgaW5zdGFuY2UsIHNvIHRoZVxuXHQgKiBgdXBkYXRlRG9tYWluc2AgbXV0YXRpb24gZm9yIHRva2VuIEEgY2FuIG5ldmVyIGFmZmVjdCBhIHJlcXVlc3QgYmVpbmdcblx0ICogZGlzcGF0Y2hlZCBmb3IgdG9rZW4gQi5cblx0ICovXG5cdHByaXZhdGUgX2dldENsaWVudEZvclRva2VuKGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPENBUElDbGllbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0RW50cnlGb3JUb2tlbihnaXRodWJUb2tlbikudGhlbihlbnRyeSA9PiBlbnRyeS5jYXBpQ2xpZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoaXMgdXNlcidzIHJlc3RyaWN0ZWQtdGVsZW1ldHJ5IGNvbnRleHQuIFJlYWRzIHRoZSBgcnRgL2B0aWRgIGNsYWltcyBmcm9tIHRoZSBtaW50ZWRcblx0ICogQ0FQSSBDb3BpbG90IHNlc3Npb24gdG9rZW4gKHRoZSBHaXRIdWIgdG9rZW4gaGFzIG5laXRoZXIpLCBhbmQgcmVzb2x2ZXMgdGhlIENBUElcblx0ICogYGVuZHBvaW50cy50ZWxlbWV0cnlgIGhvc3QgZnJvbSB0aGUgY2FjaGVkIGAvY29waWxvdF9pbnRlcm5hbC91c2VyYCBkaXNjb3Zlcnkgb25seSB3aGVuIHRoZVxuXHQgKiB1c2VyIGlzIG9wdGVkIGluLCBzbyBwdWJsaWMgdXNlcnMgcGF5IG5vIGV4dHJhIGRpc2NvdmVyeSBjYWxsLlxuXHQgKi9cblx0YXN5bmMgcmVzb2x2ZVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0KGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dD4ge1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgdGhpcy5fZ2V0Q29waWxvdFRva2VuRW50cnkoZ2l0aHViVG9rZW4pO1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2dldEVudHJ5Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdGNvbnN0IGZpZWxkcyA9IHBhcnNlQ29waWxvdFRva2VuRmllbGRzKHRva2VuLnRva2VuKTtcblx0XHRjb25zdCByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCA9IGZpZWxkcy5nZXQoJ3J0JykgPT09ICcxJztcblx0XHRjb25zdCB0cmFja2luZ0lkID0gZmllbGRzLmdldCgndGlkJyk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5RW5kcG9pbnQgPSByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZFxuXHRcdFx0PyBjbGllbnQudGVsZW1ldHJ5RW5kcG9pbnRcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCxcblx0XHRcdHRyYWNraW5nSWQsXG5cdFx0XHR0ZWxlbWV0cnlFbmRwb2ludCxcblx0XHRcdGlzSW50ZXJuYWw6IHRva2VuLmlzSW50ZXJuYWwsXG5cdFx0XHR1c2VyTmFtZTogY2xpZW50LmxvZ2luLFxuXHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiB0b2tlbi5pc1ZzY29kZVRlYW1NZW1iZXIsXG5cdFx0XHRjb3BpbG90SWdub3JlRW5hYmxlZDogY2xpZW50LmNvcGlsb3RJZ25vcmVFbmFibGVkLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9nZXRFbnRyeUZvclRva2VuKGdpdGh1YlRva2VuKSkuYXBpRW5kcG9pbnQ7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlVXNlckxvZ2luKGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZ2V0RW50cnlGb3JUb2tlbihnaXRodWJUb2tlbikpLmxvZ2luO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RW50cnlGb3JUb2tlbihnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJQ2FjaGVkQ2xpZW50PiB7XG5cdFx0Y29uc3Qgbm93U2Vjb25kcyA9IERhdGUubm93KCkgLyAxMDAwO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2xpZW50c0J5VG9rZW4uZ2V0KGdpdGh1YlRva2VuKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZy50aGVuKGVudHJ5ID0+IHtcblx0XHRcdFx0aWYgKGVudHJ5LmV4cGlyZXNBdCAtIG5vd1NlY29uZHMgPiBDQVBJX0NPTlRFWFRfUkVGUkVTSF9CVUZGRVJfU0VDT05EUykge1xuXHRcdFx0XHRcdHJldHVybiBlbnRyeTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTdGFsZSBcdTIwMTQgZXZpY3QgYW5kIHJlY3Vyc2UgdG8gYnVpbGQgYSBmcmVzaCBlbnRyeS5cblx0XHRcdFx0dGhpcy5fY2xpZW50c0J5VG9rZW4uZGVsZXRlKGdpdGh1YlRva2VuKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldEVudHJ5Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXHRcdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0Ly8gQSBwcmV2aW91cyBmYWlsZWQgYnVpbGQgbGVha2VkIGludG8gdGhlIGNhY2hlOyBldmljdCBhbmQgcmVidWlsZC5cblx0XHRcdFx0dGhpcy5fY2xpZW50c0J5VG9rZW4uZGVsZXRlKGdpdGh1YlRva2VuKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gT21pdCB0aGUgY2FsbGVyJ3Mgc2lnbmFsIGhlcmU6IGEgZGVkdXBlZCBidWlsZCBpcyBzaGFyZWQgYWNyb3NzXG5cdFx0Ly8gY29uY3VycmVudCBjYWxsZXJzLCBzbyBhYm9ydGluZyBvbmUgbXVzdCBub3QgY2FuY2VsIGl0IGZvciB0aGVcblx0XHQvLyBvdGhlcnMuIEVhY2ggY2FsbGVyIHN0aWxsIGZvcndhcmRzIGl0cyBzaWduYWwgdG8gdGhlIEFQSSBjYWxsLlxuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9idWlsZENsaWVudEZvclRva2VuKGdpdGh1YlRva2VuKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fY2xpZW50c0J5VG9rZW4uZGVsZXRlKGdpdGh1YlRva2VuKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9KTtcblx0XHR0aGlzLl9jbGllbnRzQnlUb2tlbi5zZXQoZ2l0aHViVG9rZW4sIHBlbmRpbmcpO1xuXHRcdHJldHVybiBwZW5kaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZUNsaWVudEZvclRva2VuKGdpdGh1YlRva2VuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGllbnRzQnlUb2tlbi5kZWxldGUoZ2l0aHViVG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYnVpbGRDbGllbnRGb3JUb2tlbihnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxJQ2FjaGVkQ2xpZW50PiB7XG5cdFx0Y29uc3QgeyBleHRlbnNpb25JbmZvLCB1c2VyVXJsIH0gPSBhd2FpdCB0aGlzLl9nZXRDYXBpQmFzZSgpO1xuXHRcdGNvbnN0IGZldGNoID0gdGhpcy5fZmV0Y2g7XG5cdFx0Y29uc3QgY2FwaUNsaWVudCA9IG5ldyBDQVBJQ2xpZW50KGV4dGVuc2lvbkluZm8sIENPUElMT1RfTElDRU5TRV9BR1JFRU1FTlQsIHtcblx0XHRcdGZldGNoOiAodXJsLCBvcHRpb25zKSA9PiBmZXRjaCh1cmwsIHtcblx0XHRcdFx0bWV0aG9kOiBvcHRpb25zLm1ldGhvZCA/PyAnR0VUJyxcblx0XHRcdFx0aGVhZGVyczogb3B0aW9ucy5oZWFkZXJzLFxuXHRcdFx0XHRib2R5OiBvcHRpb25zLmJvZHksXG5cdFx0XHRcdHNpZ25hbDogb3B0aW9ucy5zaWduYWwgYXMgQWJvcnRTaWduYWwgfCB1bmRlZmluZWQsXG5cdFx0XHR9KSxcblx0XHR9KTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1tDb3BpbG90QXBpU2VydmljZV0gRGlzY292ZXJpbmcgQ0FQSSBlbmRwb2ludHMgdmlhIC9jb3BpbG90X2ludGVybmFsL3VzZXInKTtcblxuXHRcdC8vIFRlc3QvZGVidWcgb3ZlcnJpZGU6IHNraXAgYXBpLmdpdGh1Yi5jb20gZGlzY292ZXJ5IGZvciBhbiBhbGxvd2VkIGxvY2FsXG5cdFx0Ly8gb3Igc21va2UtcHJveHkgVVJMLiBFdmVyeSBvdGhlciBub24tbG9vcGJhY2sgdmFsdWUgaXMgaWdub3JlZCBiZWNhdXNlXG5cdFx0Ly8gc3Vic2VxdWVudCBDQVBJIGNhbGxzIGNhcnJ5IHRoZSBHaXRIdWIgYmVhcmVyIHRva2VuLlxuXHRcdGNvbnN0IG92ZXJyaWRlQXBpID0gcHJvY2Vzcy5lbnZbQ0FQSV9VUkxfT1ZFUlJJREVfRU5WXTtcblx0XHRpZiAob3ZlcnJpZGVBcGkpIHtcblx0XHRcdGlmIChpc0FsbG93ZWRDYXBpVXJsT3ZlcnJpZGUob3ZlcnJpZGVBcGkpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RBcGlTZXJ2aWNlXSBVc2luZyBDQVBJIFVSTCBvdmVycmlkZSAke292ZXJyaWRlQXBpfTsgc2tpcHBpbmcgZW5kcG9pbnQgZGlzY292ZXJ5YCk7XG5cdFx0XHRcdGNhcGlDbGllbnQudXBkYXRlRG9tYWlucyh7IGVuZHBvaW50czogeyBhcGk6IG92ZXJyaWRlQXBpLCBwcm94eTogb3ZlcnJpZGVBcGkgfSwgc2t1OiAnJyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNhcGlDbGllbnQsXG5cdFx0XHRcdFx0ZXhwaXJlc0F0OiBEYXRlLm5vdygpIC8gMTAwMCArIENBUElfQ09OVEVYVF9UVExfU0VDT05EUyxcblx0XHRcdFx0XHRhcGlFbmRwb2ludDogb3ZlcnJpZGVBcGksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90QXBpU2VydmljZV0gSWdub3Jpbmcgbm9uLWxvb3BiYWNrIENBUEkgVVJMIG92ZXJyaWRlICR7b3ZlcnJpZGVBcGl9OyBmYWxsaW5nIGJhY2sgdG8gbm9ybWFsIGVuZHBvaW50IGRpc2NvdmVyeWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fZmV0Y2godXNlclVybCwge1xuXHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7Z2l0aHViVG9rZW59YCxcblx0XHRcdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J1gtR2l0SHViLUFwaS1WZXJzaW9uJzogVVNFUl9BUElfVkVSU0lPTixcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc3BvbnNlLm9rKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpLmNhdGNoKCgpID0+ICcnKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29waWxvdCBlbmRwb2ludCBkaXNjb3ZlcnkgZmFpbGVkOiAke3Jlc3BvbnNlLnN0YXR1c30gJHtyZXNwb25zZS5zdGF0dXNUZXh0fSBcdTIwMTQgJHt0ZXh0fWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudmVsb3BlOiBJQ29waWxvdFVzZXJSZXNwb25zZSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcblxuXHRcdGNhcGlDbGllbnQudXBkYXRlRG9tYWlucyhcblx0XHRcdHsgZW5kcG9pbnRzOiBlbnZlbG9wZS5lbmRwb2ludHMgPz8ge30sIHNrdTogZW52ZWxvcGUuYWNjZXNzX3R5cGVfc2t1ID8/ICcnIH0sXG5cdFx0XHQvLyBFbnRlcnByaXNlIGJhc2UgVVJJIChlLmcuIGBodHRwczovL2FjbWUuZ2hlLmNvbWApLCBvciBgdW5kZWZpbmVkYCBmb3Jcblx0XHRcdC8vIGdpdGh1Yi5jb20uIFRoZSBwYWNrYWdlIGRlcml2ZXMgdGhlIEdpdEh1YiBBUEkgaG9zdCAoYGFwaS48aG9zdD5gKSBmcm9tXG5cdFx0XHQvLyB0aGlzIGZvciBgY29waWxvdF9pbnRlcm5hbGAgZW5kcG9pbnRzIC0gbm90YWJseSB0aGUgQ29waWxvdCBzZXNzaW9uXG5cdFx0XHQvLyB0b2tlbiBtaW50IChgL2NvcGlsb3RfaW50ZXJuYWwvdjIvdG9rZW5gKS4gT21pdHRpbmcgaXQgc3RyYW5kcyB0aGUgbWludFxuXHRcdFx0Ly8gb24gYGFwaS5naXRodWIuY29tYCwgd2hpY2ggNDAxcyBhbiBlbnRlcnByaXNlIHRva2VuIChcIkJhZCBjcmVkZW50aWFsc1wiKS5cblx0XHRcdHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRFbnRlcnByaXNlVXJpKCksXG5cdFx0KTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1tDb3BpbG90QXBpU2VydmljZV0gQ0FQSSBlbmRwb2ludCBkaXNjb3ZlcmVkLCBhcGk9JywgZW52ZWxvcGUuZW5kcG9pbnRzPy5hcGkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNhcGlDbGllbnQsXG5cdFx0XHRleHBpcmVzQXQ6IERhdGUubm93KCkgLyAxMDAwICsgQ0FQSV9DT05URVhUX1RUTF9TRUNPTkRTLFxuXHRcdFx0bG9naW46IGVudmVsb3BlLmxvZ2luLFxuXHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6IGVudmVsb3BlLmVuZHBvaW50cz8udGVsZW1ldHJ5LFxuXHRcdFx0YXBpRW5kcG9pbnQ6IGVudmVsb3BlLmVuZHBvaW50cz8uYXBpLFxuXHRcdFx0Y29waWxvdElnbm9yZUVuYWJsZWQ6IGVudmVsb3BlLmNvcGlsb3RpZ25vcmVfZW5hYmxlZCxcblx0XHR9O1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGVyLVRva2VuIENvcGlsb3QgU2Vzc2lvbiBUb2tlblxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBDb3BpbG90IHNlc3Npb24gdG9rZW4gZm9yIGEgR2l0SHViIHRva2VuLCBtaW50aW5nIGFuZFxuXHQgKiBjYWNoaW5nIG9uZSBpZiBuZWVkZWQuIENvbmN1cnJlbnQgY2FsbGVycyBmb3IgdGhlIHNhbWUgR2l0SHViIHRva2VuXG5cdCAqIHNoYXJlIGEgc2luZ2xlIGluLWZsaWdodCBtaW50OyB0aGUgY2FsbGVyJ3MgYEFib3J0U2lnbmFsYCBpc1xuXHQgKiBkZWxpYmVyYXRlbHkgTk9UIGZvcndhcmRlZCBzbyBjYW5jZWxsaW5nIG9uZSBjYWxsZXIgZG9lcyBub3QgcG9pc29uXG5cdCAqIHRoZSBzaGFyZWQgbWludCBmb3IgdGhlIG90aGVycy5cblx0ICovXG5cdHByaXZhdGUgX2dldENvcGlsb3RUb2tlbihnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29waWxvdFRva2VuRW50cnkoZ2l0aHViVG9rZW4pLnRoZW4oZW50cnkgPT4gZW50cnkudG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29waWxvdFRva2VuRW50cnkoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8SUNhY2hlZENvcGlsb3RUb2tlbj4ge1xuXHRcdGNvbnN0IG5vd1NlY29uZHMgPSBEYXRlLm5vdygpIC8gMTAwMDtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NvcGlsb3RUb2tlbnNCeUdpdGh1Yi5nZXQoZ2l0aHViVG9rZW4pO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnRoZW4oZW50cnkgPT4ge1xuXHRcdFx0XHRpZiAoZW50cnkuZXhwaXJlc0F0IC0gbm93U2Vjb25kcyA+IENPUElMT1RfVE9LRU5fUkVGUkVTSF9CVUZGRVJfU0VDT05EUykge1xuXHRcdFx0XHRcdHJldHVybiBlbnRyeTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTdGFsZSBcdTIwMTQgZXZpY3Qgb25seSBpZiB0aGUgbWFwIHN0aWxsIHBvaW50cyBhdCB0aGlzXG5cdFx0XHRcdC8vIHByb21pc2UuIEEgY29uY3VycmVudCBjYWxsZXIgbWF5IGFscmVhZHkgaGF2ZSByYWNlZCBhaGVhZFxuXHRcdFx0XHQvLyBhbmQgbWludGVkIGEgZnJlc2ggdG9rZW47IGRlbGV0aW5nIHVuY29uZGl0aW9uYWxseSB3b3VsZFxuXHRcdFx0XHQvLyBldmljdCB0aGF0IG5ld2VyIGVudHJ5IGFuZCBjYXVzZSBhIHJlZHVuZGFudCByZS1taW50LlxuXHRcdFx0XHRpZiAodGhpcy5fY29waWxvdFRva2Vuc0J5R2l0aHViLmdldChnaXRodWJUb2tlbikgPT09IGV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29waWxvdFRva2Vuc0J5R2l0aHViLmRlbGV0ZShnaXRodWJUb2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldENvcGlsb3RUb2tlbkVudHJ5KGdpdGh1YlRva2VuKTtcblx0XHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9jb3BpbG90VG9rZW5zQnlHaXRodWIuZ2V0KGdpdGh1YlRva2VuKSA9PT0gZXhpc3RpbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9jb3BpbG90VG9rZW5zQnlHaXRodWIuZGVsZXRlKGdpdGh1YlRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nOiBQcm9taXNlPElDYWNoZWRDb3BpbG90VG9rZW4+ID0gdGhpcy5fYnVpbGRDb3BpbG90VG9rZW4oZ2l0aHViVG9rZW4pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29waWxvdFRva2Vuc0J5R2l0aHViLmdldChnaXRodWJUb2tlbikgPT09IHBlbmRpbmcpIHtcblx0XHRcdFx0dGhpcy5fY29waWxvdFRva2Vuc0J5R2l0aHViLmRlbGV0ZShnaXRodWJUb2tlbik7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSk7XG5cdFx0dGhpcy5fY29waWxvdFRva2Vuc0J5R2l0aHViLnNldChnaXRodWJUb2tlbiwgcGVuZGluZyk7XG5cdFx0cmV0dXJuIHBlbmRpbmc7XG5cdH1cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlQ29waWxvdFRva2VuRm9yR2l0aHViKGdpdGh1YlRva2VuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3BpbG90VG9rZW5zQnlHaXRodWIuZGVsZXRlKGdpdGh1YlRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2J1aWxkQ29waWxvdFRva2VuKGdpdGh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElDYWNoZWRDb3BpbG90VG9rZW4+IHtcblx0XHRjb25zdCBjYXBpQ2xpZW50ID0gYXdhaXQgdGhpcy5fZ2V0Q2xpZW50Rm9yVG9rZW4oZ2l0aHViVG9rZW4pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NvcGlsb3RBcGlTZXJ2aWNlXSBNaW50aW5nIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbicpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjYXBpQ2xpZW50Lm1ha2VSZXF1ZXN0PFJlc3BvbnNlPihcblx0XHRcdHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYHRva2VuICR7Z2l0aHViVG9rZW59YCxcblx0XHRcdFx0XHQnWC1HaXRIdWItQXBpLVZlcnNpb24nOiBVU0VSX0FQSV9WRVJTSU9OLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogUmVxdWVzdFR5cGUuQ29waWxvdFRva2VuIH0sXG5cdFx0KTtcblxuXHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCkuY2F0Y2goKCkgPT4gJycpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb3BpbG90IHNlc3Npb24gdG9rZW4gbWludCBmYWlsZWQ6ICR7cmVzcG9uc2Uuc3RhdHVzfSAke3Jlc3BvbnNlLnN0YXR1c1RleHR9IFxcdTIwMTQgJHt0ZXh0fWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudmVsb3BlID0gYXdhaXQgcmVzcG9uc2UuanNvbigpIGFzIElDb3BpbG90VG9rZW5FbnZlbG9wZTtcblx0XHRpZiAodHlwZW9mIGVudmVsb3BlLnRva2VuICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgZW52ZWxvcGUuZXhwaXJlc19hdCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29waWxvdCBzZXNzaW9uIHRva2VuIG1pbnQgcmV0dXJuZWQgbWFsZm9ybWVkIGVudmVsb3BlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJlZmVyIGBub3cgKyByZWZyZXNoX2luYCBvdmVyIHRoZSBzZXJ2ZXItcmVwb3J0ZWQgYGV4cGlyZXNfYXRgOlxuXHRcdC8vIHVzZXJzIHdpdGggYSBmYXN0IGxvY2FsIGNsb2NrIGNhbiBzZWUgYGV4cGlyZXNfYXRgIGFscmVhZHkgaW4gdGhlXG5cdFx0Ly8gcGFzdCwgd2hpY2ggd291bGQgY2F1c2UgdXMgdG8gcmUtbWludCBvbiBldmVyeSBjYWxsLiBNaXJyb3Igd2hhdFxuXHRcdC8vIHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uJ3MgYFJlZnJlc2hhYmxlQ29waWxvdFRva2VuTWFuYWdlcmBcblx0XHQvLyBkb2VzLiBGbG9vciBhdCBgbm93ICsgNjBzYCBzbyBhIG1hbGZvcm1lZC9zaG9ydCBgcmVmcmVzaF9pbmBcblx0XHQvLyBjYW4ndCB0cmlnZ2VyIGEgdGlnaHQgcmUtbWludCBsb29wLlxuXHRcdGNvbnN0IG5vd1NlY29uZHMgPSBEYXRlLm5vdygpIC8gMTAwMDtcblx0XHRjb25zdCByZWZyZXNoSW4gPSB0eXBlb2YgZW52ZWxvcGUucmVmcmVzaF9pbiA9PT0gJ251bWJlcicgPyBlbnZlbG9wZS5yZWZyZXNoX2luIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9yZ2FuaXphdGlvbkxpc3QgPSBBcnJheS5pc0FycmF5KGVudmVsb3BlLm9yZ2FuaXphdGlvbl9saXN0KVxuXHRcdFx0PyBlbnZlbG9wZS5vcmdhbml6YXRpb25fbGlzdC5maWx0ZXIoKG9yZ2FuaXphdGlvbik6IG9yZ2FuaXphdGlvbiBpcyBzdHJpbmcgPT4gdHlwZW9mIG9yZ2FuaXphdGlvbiA9PT0gJ3N0cmluZycpXG5cdFx0XHQ6IFtdO1xuXHRcdGNvbnN0IGV4cGlyZXNBdCA9IE1hdGgubWF4KFxuXHRcdFx0cmVmcmVzaEluICE9PSB1bmRlZmluZWQgPyBub3dTZWNvbmRzICsgcmVmcmVzaEluIDogZW52ZWxvcGUuZXhwaXJlc19hdCxcblx0XHRcdG5vd1NlY29uZHMgKyA2MCxcblx0XHQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRva2VuOiBlbnZlbG9wZS50b2tlbixcblx0XHRcdGV4cGlyZXNBdCxcblx0XHRcdG1vZGVsSWRzQnlGYW1pbHk6IG5ldyBNYXAoKSxcblx0XHRcdGlzSW50ZXJuYWw6IG9yZ2FuaXphdGlvbkxpc3Quc29tZShvcmdhbml6YXRpb24gPT4gSU5URVJOQUxfQ09QSUxPVF9PUkdBTklaQVRJT05TLmhhcyhvcmdhbml6YXRpb24pKSxcblx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogb3JnYW5pemF0aW9uTGlzdC5zb21lKG9yZ2FuaXphdGlvbiA9PiBWU0NPREVfQ09QSUxPVF9PUkdBTklaQVRJT05TLmhhcyhvcmdhbml6YXRpb24pKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIGNvbmNyZXRlIENBUEkgbW9kZWwgaWQgZm9yIHRoZSBzdXBwbGllZCBmYW1pbHkgKGUuZy5cblx0ICogYGdwdC00by1taW5pYCkuIENhY2hlZCBwZXIgR2l0SHViIHRva2VuICsgZmFtaWx5IGFsb25nc2lkZSB0aGVcblx0ICogQ29waWxvdCBzZXNzaW9uIHRva2VuIHNvIGV2aWN0aW9uIG9uIDQwMS80MDMgYWxzbyBjbGVhcnMgdGhlIGNhY2hlZFxuXHQgKiBtb2RlbCBpZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVVdGlsaXR5TW9kZWxJZChnaXRodWJUb2tlbjogc3RyaW5nLCBtb2RlbEZhbWlseTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBwZW5kaW5nRW50cnkgPSB0aGlzLl9jb3BpbG90VG9rZW5zQnlHaXRodWIuZ2V0KGdpdGh1YlRva2VuKTtcblx0XHRjb25zdCBlbnRyeSA9IHBlbmRpbmdFbnRyeSA/IGF3YWl0IHBlbmRpbmdFbnRyeSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjYWNoZWQgPSBlbnRyeT8ubW9kZWxJZHNCeUZhbWlseS5nZXQobW9kZWxGYW1pbHkpO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5tb2RlbHMoZ2l0aHViVG9rZW4pO1xuXHRcdGNvbnN0IG1hdGNoID0gbW9kZWxzLmZpbmQobSA9PiBtLmNhcGFiaWxpdGllcz8uZmFtaWx5ID09PSBtb2RlbEZhbWlseSk7XG5cdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBDQVBJIG1vZGVsIGF2YWlsYWJsZSBmb3IgZmFtaWx5ICcke21vZGVsRmFtaWx5fSdgKTtcblx0XHR9XG5cblx0XHRlbnRyeT8ubW9kZWxJZHNCeUZhbWlseS5zZXQobW9kZWxGYW1pbHksIG1hdGNoLmlkKTtcblx0XHRyZXR1cm4gbWF0Y2guaWQ7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTU0UgUGFyc2luZ1xuXG5cdHByaXZhdGUgYXN5bmMgKl9yZWFkU1NFKGJvZHk6IFJlYWRhYmxlU3RyZWFtPFVpbnQ4QXJyYXk+KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4ge1xuXHRcdGNvbnN0IHJlYWRlciA9IGJvZHkuZ2V0UmVhZGVyKCk7XG5cdFx0Y29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuXHRcdGxldCBidWZmZXIgPSAnJztcblxuXHRcdHRyeSB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCB7IGRvbmUsIHZhbHVlIH0gPSBhd2FpdCByZWFkZXIucmVhZCgpO1xuXHRcdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YnVmZmVyICs9IGRlY29kZXIuZGVjb2RlKHZhbHVlLCB7IHN0cmVhbTogdHJ1ZSB9KTtcblx0XHRcdFx0Y29uc3QgbGluZXMgPSBidWZmZXIuc3BsaXQoJ1xcbicpO1xuXHRcdFx0XHRidWZmZXIgPSBsaW5lcy5wb3AoKSA/PyAnJztcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdFx0XHRjb25zdCBldmVudCA9IHRoaXMuX3BhcnNlRGF0YUxpbmUobGluZSk7XG5cdFx0XHRcdFx0aWYgKGV2ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHlpZWxkIGV2ZW50O1xuXHRcdFx0XHRcdFx0aWYgKGV2ZW50LnR5cGUgPT09ICdtZXNzYWdlX3N0b3AnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGJ1ZmZlci50cmltKCkpIHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSB0aGlzLl9wYXJzZURhdGFMaW5lKGJ1ZmZlcik7XG5cdFx0XHRcdGlmIChldmVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0eWllbGQgZXZlbnQ7XG5cdFx0XHRcdFx0aWYgKGV2ZW50LnR5cGUgPT09ICdtZXNzYWdlX3N0b3AnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIENhbmNlbCB0aGUgdW5kZXJseWluZyBzdHJlYW0gc28gdGhlIEhUVFAgY29ubmVjdGlvbiBpcyByZWxlYXNlZFxuXHRcdFx0Ly8gZXZlbiB3aGVuIHRoZSBjb25zdW1lciBhYmFuZG9ucyB0aGUgZ2VuZXJhdG9yIGVhcmx5IChicmVhaywgdGhyb3csXG5cdFx0XHQvLyBhYm9ydCkgb3IgdGhlIHN0cmVhbSBlbmRlZCBvbiBgbWVzc2FnZV9zdG9wYCB3aXRoIGJ5dGVzIHN0aWxsIGluXG5cdFx0XHQvLyBmbGlnaHQuIGByZWxlYXNlTG9ja2AgYWxvbmUgbGVhdmVzIHRoZSBib2R5IGhhbGYtcmVhZC5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJlYWRlci5jYW5jZWwoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgXHUyMDE0IGNhbmNlbGxhdGlvbiBpcyBiZXN0LWVmZm9ydCBjbGVhbnVwXG5cdFx0XHR9XG5cdFx0XHRyZWFkZXIucmVsZWFzZUxvY2soKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgdGhlIHBhcnNlZCBzdHJlYW0gZXZlbnQsIG9yIGB1bmRlZmluZWRgIHRvIHNraXAgdGhlIGxpbmUuXG5cdCAqIEB0aHJvd3Mgb24gYGVycm9yYCBldmVudHMgZnJvbSB0aGUgc2VydmVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGFyc2VEYXRhTGluZShsaW5lOiBzdHJpbmcpOiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWxpbmUuc3RhcnRzV2l0aCgnZGF0YTogJykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IGxpbmUuc2xpY2UoJ2RhdGE6ICcubGVuZ3RoKS50cmltKCk7XG5cblx0XHRsZXQgcGFyc2VkOiB1bmtub3duO1xuXHRcdHRyeSB7XG5cdFx0XHRwYXJzZWQgPSBKU09OLnBhcnNlKGRhdGEpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdEFwaVNlcnZpY2VdIEZhaWxlZCB0byBwYXJzZSBTU0UgZGF0YTonLCBkYXRhKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBwYXJzZWQgIT09ICdvYmplY3QnIHx8IHBhcnNlZCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZWNvcmQgPSBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0Y29uc3QgdHlwZSA9IHJlY29yZC50eXBlO1xuXHRcdGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGUgPT09ICdlcnJvcicpIHtcblx0XHRcdC8vIFByZXNlcnZlIHRoZSB1cHN0cmVhbSBlbnZlbG9wZSB2ZXJiYXRpbSB3aGVuIGl0IGNvbmZvcm1zIHRvIHRoZVxuXHRcdFx0Ly8gQW50aHJvcGljIHNoYXBlIChzbyBhbnkgZXh0cmEgZmllbGRzIHByb3BhZ2F0ZSB0byBQaGFzZSAyJ3Ncblx0XHRcdC8vIHBhc3N0aHJvdWdoIHByb3h5KS4gRmFsbCBiYWNrIHRvIGEgY2xlYW4gYXBpX2Vycm9yIHN5bnRoZXNpc1xuXHRcdFx0Ly8gd2hlbiBmaWVsZHMgYXJlIG1pc3Npbmcgb3IgYGVycm9yYCBpcyB1bnN0cnVjdHVyZWQuXG5cdFx0XHRjb25zdCByYXdFcnJvciA9IChwYXJzZWQgYXMgeyBlcnJvcj86IHVua25vd24gfSkuZXJyb3I7XG5cdFx0XHRsZXQgZW52ZWxvcGU6IEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRyYXdFcnJvciAmJiB0eXBlb2YgcmF3RXJyb3IgPT09ICdvYmplY3QnXG5cdFx0XHRcdCYmIHR5cGVvZiAocmF3RXJyb3IgYXMgeyB0eXBlPzogdW5rbm93biB9KS50eXBlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQmJiB0eXBlb2YgKHJhd0Vycm9yIGFzIHsgbWVzc2FnZT86IHVua25vd24gfSkubWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdCkge1xuXHRcdFx0XHRlbnZlbG9wZSA9IHBhcnNlZCBhcyBBbnRocm9waWMuRXJyb3JSZXNwb25zZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBlcnJvck1lc3NhZ2U6IHN0cmluZztcblx0XHRcdFx0aWYgKHR5cGVvZiByYXdFcnJvciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2UgPSByYXdFcnJvcjtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgKHJhd0Vycm9yIGFzIHsgbWVzc2FnZT86IHVua25vd24gfSB8IHVuZGVmaW5lZCk/Lm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0ZXJyb3JNZXNzYWdlID0gKHJhd0Vycm9yIGFzIHsgbWVzc2FnZTogc3RyaW5nIH0pLm1lc3NhZ2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZXJyb3JNZXNzYWdlID0gJ1Vua25vd24gc3RyZWFtaW5nIGVycm9yJztcblx0XHRcdFx0fVxuXHRcdFx0XHRlbnZlbG9wZSA9IHtcblx0XHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiBlcnJvck1lc3NhZ2UgfSxcblx0XHRcdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IENvcGlsb3RBcGlFcnJvcihDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HLCBlbnZlbG9wZSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFLTk9XTl9TU0VfRVZFTlRfVFlQRVMuaGFzKHR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJzZWQgYXMgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudDtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cbn1cblxuY29uc3QgS05PV05fU1NFX0VWRU5UX1RZUEVTID0gbmV3IFNldChbXG5cdCdtZXNzYWdlX3N0YXJ0JywgJ21lc3NhZ2VfZGVsdGEnLCAnbWVzc2FnZV9zdG9wJyxcblx0J2NvbnRlbnRfYmxvY2tfc3RhcnQnLCAnY29udGVudF9ibG9ja19kZWx0YScsICdjb250ZW50X2Jsb2NrX3N0b3AnLFxuXSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsWUFBWSxtQkFBOEQ7QUFDbkYsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0Isb0JBQW9CO0FBQzdDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBd0lqQyxNQUFNLHFDQUFxQztBQU9sRCxNQUFNLHNDQUFzQyxJQUFJO0FBR2hELE1BQU0sMkJBQTJCLEtBQUs7QUFFdEMsTUFBTSxtQkFBbUI7QUFnQnpCLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sb0NBQW9DO0FBQzFDLE1BQU0sbUNBQW1DO0FBR3pDLFNBQVMsY0FBYyxLQUFzQjtBQUM1QyxNQUFJO0FBQ0osTUFBSTtBQUNILGVBQVcsSUFBSSxJQUFJLEdBQUcsRUFBRTtBQUFBLEVBQ3pCLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sT0FBTyxTQUFTLFFBQVEsWUFBWSxFQUFFLEVBQUUsWUFBWTtBQUMxRCxTQUFPLFNBQVMsZUFBZSxTQUFTLFNBQVMsd0JBQXdCLEtBQUssSUFBSTtBQUNuRjtBQUVBLFNBQVMseUJBQXlCLEtBQXNCO0FBQ3ZELE1BQUksY0FBYyxHQUFHLEdBQUc7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLENBQUMsUUFBUSxJQUFJLGdDQUFnQyxHQUFHO0FBQ25ELFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSTtBQUNILFdBQU8sSUFBSSxJQUFJLEdBQUcsRUFBRSxTQUFTLFlBQVksTUFBTTtBQUFBLEVBQ2hELFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBT0EsTUFBTSx1Q0FBdUMsSUFBSTtBQU9qRCxNQUFNLCtCQUErQjtBQU1yQyxNQUFNLDhCQUE4QjtBQU1wQyxNQUFNLHdCQUF3QjtBQU85QixNQUFNLGlCQUFpQjtBQUV2QixNQUFNLGlDQUFpQyxvQkFBSSxJQUFJO0FBQUEsRUFDOUM7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0QsQ0FBQztBQUNELE1BQU0sK0JBQStCLG9CQUFJLElBQUksQ0FBQyxrQ0FBa0MsQ0FBQztBQWdCMUUsTUFBTSx3QkFBd0IsTUFBTTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZMUMsWUFDVSxRQUNBLFVBQ1QsU0FDQztBQUNELFVBQU0sV0FBVyxTQUFTLE1BQU0sT0FBTztBQUo5QjtBQUNBO0FBSVQsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUNEO0FBYUEsU0FBUyx5QkFBeUIsUUFBZ0IsWUFBb0IsVUFBa0IsU0FBUyx1QkFBd0M7QUFDeEksTUFBSTtBQUNKLE1BQUksVUFBVTtBQUNiLFFBQUk7QUFDSCxZQUFNLFNBQVMsS0FBSyxNQUFNLFFBQVE7QUFDbEMsVUFDQyxVQUFVLE9BQU8sV0FBVyxZQUN4QixPQUE4QixTQUFTLFNBQzFDO0FBQ0QsY0FBTSxNQUFPLE9BQStCO0FBQzVDLFlBQ0MsT0FBTyxPQUFPLFFBQVEsWUFDbkIsT0FBUSxJQUEyQixTQUFTLFlBQzVDLE9BQVEsSUFBOEIsWUFBWSxVQUNwRDtBQUNELHFCQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUVSO0FBQUEsRUFDRDtBQUNBLE1BQUksQ0FBQyxVQUFVO0FBQ2QsZUFBVztBQUFBLE1BQ1YsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sU0FBUyxZQUFZLEdBQUcsTUFBTSxJQUFJLFVBQVU7QUFBQSxNQUM3QztBQUFBLE1BQ0EsWUFBWTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQ0EsU0FBTyxJQUFJO0FBQUEsSUFDVjtBQUFBLElBQ0E7QUFBQSxJQUNBLEdBQUcsTUFBTSxLQUFLLE1BQU0sSUFBSSxVQUFVLFdBQVcsU0FBUyxNQUFNLE9BQU87QUFBQSxFQUNwRTtBQUNEO0FBTU8sTUFBTSxxQkFBcUIsZ0JBQW9DLG1CQUFtQjtBQXlObEYsSUFBTSxvQkFBTixNQUFzRDtBQUFBLEVBUzVELFlBQ0MsU0FDOEIsYUFDSSxpQkFDZ0Isd0JBQ2pEO0FBSDZCO0FBQ0k7QUFDZ0I7QUFUbkQsU0FBUSxtQkFBOEM7QUFDdEQsU0FBaUIsa0JBQWtCLG9CQUFJLElBQW9DO0FBQzNFLFNBQWlCLHlCQUF5QixvQkFBSSxJQUEwQztBQVN2RixTQUFLLFNBQVMsV0FBVyxXQUFXO0FBQUEsRUFDckM7QUFBQSxFQWNBLFNBQ0MsYUFDQSxTQUNBLFNBQzRFO0FBQzVFLFFBQUksUUFBUSxRQUFRO0FBQ25CLGFBQU8sS0FBSyxtQkFBbUIsYUFBYSxTQUFTLE9BQU87QUFBQSxJQUM3RDtBQUNBLFdBQU8sS0FBSyxzQkFBc0IsYUFBYSxTQUFTLE9BQU87QUFBQSxFQUNoRTtBQUFBLEVBRUEsTUFBTSxZQUNMLGNBQ0EsTUFDQSxVQUN3QztBQUN4QyxVQUFNLElBQUksTUFBTSxtQ0FBbUM7QUFBQSxFQUNwRDtBQUFBLEVBRUEsTUFBTSxPQUFPLGFBQXFCLFNBQWlFO0FBQ2xHLFVBQU0sYUFBYSxNQUFNLEtBQUssbUJBQW1CLFdBQVc7QUFFNUQsU0FBSyxZQUFZLE1BQU0sZ0NBQWdDO0FBRXZELFVBQU0sV0FBVyxNQUFNLFdBQVc7QUFBQSxNQUNqQztBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1IsR0FBRyxTQUFTO0FBQUEsVUFDWixpQkFBaUIsVUFBVSxXQUFXO0FBQUEsUUFDdkM7QUFBQTtBQUFBO0FBQUEsUUFHQSx1QkFBdUIsU0FBUztBQUFBLFFBQ2hDLFFBQVEsU0FBUztBQUFBLE1BQ2xCO0FBQUEsTUFDQSxFQUFFLE1BQU0sWUFBWSxPQUFPO0FBQUEsSUFDNUI7QUFFQSxRQUFJLENBQUMsU0FBUyxJQUFJO0FBQ2pCLFVBQUksU0FBUyxXQUFXLE9BQU8sU0FBUyxXQUFXLEtBQUs7QUFDdkQsYUFBSywwQkFBMEIsV0FBVztBQUFBLE1BQzNDO0FBQ0EsWUFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLLEVBQUUsTUFBTSxNQUFNLEVBQUU7QUFDakQsWUFBTSx5QkFBeUIsU0FBUyxRQUFRLFNBQVMsWUFBWSxNQUFNLDRCQUE0QjtBQUFBLElBQ3hHO0FBRUEsVUFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLO0FBQ2pDLFdBQU8sS0FBSyxRQUFRLENBQUM7QUFBQSxFQUN0QjtBQUFBLEVBRUEsTUFBTSxVQUNMLGFBQ0EsTUFDQSxTQUNvQjtBQUNwQixVQUFNLGFBQWEsTUFBTSxLQUFLLG1CQUFtQixXQUFXO0FBQzVELFVBQU0sWUFBWSxhQUFhO0FBSS9CLFFBQUksZUFBZTtBQUNuQixRQUFJO0FBQ0gsWUFBTSxTQUFTLEtBQUssTUFBTSxJQUFJO0FBQzlCLHFCQUFlLE9BQU8sU0FBUztBQUFBLElBQ2hDLFFBQVE7QUFBQSxJQUE0QjtBQUNwQyxTQUFLLFlBQVksS0FBSyxpREFBaUQsU0FBUyxXQUFXLFlBQVksRUFBRTtBQUV6RyxVQUFNLFdBQVcsTUFBTSxXQUFXO0FBQUEsTUFDakM7QUFBQSxRQUNDLFFBQVE7QUFBQSxRQUNSLFNBQVM7QUFBQSxVQUNSLEdBQUcsU0FBUztBQUFBLFVBQ1osZ0JBQWdCO0FBQUEsVUFDaEIsaUJBQWlCLFVBQVUsV0FBVztBQUFBLFVBQ3RDLGdCQUFnQjtBQUFBLFVBQ2hCLGlCQUFpQjtBQUFBLFFBQ2xCO0FBQUE7QUFBQTtBQUFBLFFBR0EsdUJBQXVCLFNBQVM7QUFBQSxRQUNoQztBQUFBLFFBQ0EsUUFBUSxTQUFTO0FBQUEsTUFDbEI7QUFBQSxNQUNBLEVBQUUsTUFBTSxZQUFZLGNBQWM7QUFBQSxJQUNuQztBQUVBLFNBQUssWUFBWSxLQUFLLHdDQUF3QyxTQUFTLE1BQU0sZUFBZSxTQUFTLEVBQUU7QUFFdkcsUUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNqQixVQUFJLFNBQVMsV0FBVyxPQUFPLFNBQVMsV0FBVyxLQUFLO0FBQ3ZELGFBQUssMEJBQTBCLFdBQVc7QUFBQSxNQUMzQztBQUNBLFlBQU0sT0FBTyxNQUFNLFNBQVMsS0FBSyxFQUFFLE1BQU0sTUFBTSxFQUFFO0FBQ2pELFlBQU0seUJBQXlCLFNBQVMsUUFBUSxTQUFTLFlBQVksTUFBTSwrQkFBK0I7QUFBQSxJQUMzRztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLHNCQUNMLGFBQ0EsU0FDQSxTQUNrQjtBQUNsQixVQUFNLGFBQWEsTUFBTSxLQUFLLG1CQUFtQixXQUFXO0FBQzVELFVBQU0sZUFBZSxNQUFNLEtBQUssaUJBQWlCLFdBQVc7QUFDNUQsVUFBTSxVQUFVLE1BQU0sS0FBSyx1QkFBdUIsYUFBYSw0QkFBNEI7QUFDM0YsVUFBTSxZQUFZLGFBQWE7QUFFL0IsU0FBSyxZQUFZLE1BQU0sNkNBQTZDLFNBQVMsT0FBTyxjQUFjLFNBQVMsRUFBRTtBQUU3RyxVQUFNLE9BQU8sS0FBSyxVQUFVO0FBQUEsTUFDM0IsT0FBTztBQUFBLE1BQ1AsVUFBVSxRQUFRLFNBQVMsSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sU0FBUyxFQUFFLFFBQVEsRUFBRTtBQUFBLE1BQzFFLFFBQVE7QUFBQSxNQUNSLGFBQWEsUUFBUSxlQUFlO0FBQUEsTUFDcEMsT0FBTztBQUFBLE1BQ1AsWUFBWSxRQUFRO0FBQUEsSUFDckIsQ0FBQztBQUVELFVBQU0sV0FBVyxNQUFNLFdBQVc7QUFBQSxNQUNqQztBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1IsR0FBRyxTQUFTO0FBQUEsVUFDWixnQkFBZ0I7QUFBQSxVQUNoQixpQkFBaUIsVUFBVSxZQUFZO0FBQUEsVUFDdkMsZ0JBQWdCO0FBQUEsVUFDaEIsaUJBQWlCO0FBQUEsUUFDbEI7QUFBQSxRQUNBO0FBQUEsUUFDQSxRQUFRLFNBQVM7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsRUFBRSxNQUFNLFlBQVksZ0JBQWdCO0FBQUEsSUFDckM7QUFFQSxRQUFJLENBQUMsU0FBUyxJQUFJO0FBQ2pCLFVBQUksU0FBUyxXQUFXLE9BQU8sU0FBUyxXQUFXLEtBQUs7QUFDdkQsYUFBSyxpQ0FBaUMsV0FBVztBQUFBLE1BQ2xEO0FBQ0EsWUFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLLEVBQUUsTUFBTSxNQUFNLEVBQUU7QUFDakQsWUFBTSx5QkFBeUIsU0FBUyxRQUFRLFNBQVMsWUFBWSxNQUFNLHFDQUFxQztBQUFBLElBQ2pIO0FBRUEsVUFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLO0FBQ2pDLFVBQU0sVUFBVSxNQUFNLFVBQVUsQ0FBQyxHQUFHLFNBQVM7QUFDN0MsUUFBSSxPQUFPLFlBQVksVUFBVTtBQUNoQyxZQUFNLElBQUksTUFBTSwrQ0FBK0M7QUFBQSxJQUNoRTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBLEVBTVEsZUFBbUM7QUFDMUMsUUFBSSxDQUFDLEtBQUssa0JBQWtCO0FBQzNCLFdBQUssbUJBQW1CLEtBQUssZUFBZSxFQUFFLE1BQU0sU0FBTztBQUMxRCxhQUFLLG1CQUFtQjtBQUN4QixjQUFNO0FBQUEsTUFDUCxDQUFDO0FBQUEsSUFDRjtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWMsaUJBQXFDO0FBQ2xELFVBQU0sQ0FBQyxXQUFXLFFBQVEsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLE1BQy9DLGFBQWEsU0FBTyxLQUFLLFlBQVksS0FBSywyQ0FBMkMsR0FBRyxDQUFDO0FBQUEsTUFDekYsZUFBZSxTQUFPLEtBQUssWUFBWSxLQUFLLDZDQUE2QyxHQUFHLENBQUM7QUFBQSxJQUM5RixDQUFDO0FBRUQsVUFBTSxnQkFBdUM7QUFBQSxNQUM1QyxNQUFNO0FBQUEsTUFDTixXQUFXLGFBQWE7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBLGVBQWUsS0FBSyxnQkFBZ0I7QUFBQSxNQUNwQyxTQUFTLEtBQUssZ0JBQWdCO0FBQUEsTUFDOUIsV0FBVyxLQUFLLGdCQUFnQixZQUFZLFdBQVcsU0FBUztBQUFBLElBQ2pFO0FBUUEsVUFBTSxVQUFVLEdBQUcsS0FBSyx1QkFBdUIsY0FBYyxDQUFDO0FBRTlELFdBQU8sRUFBRSxlQUFlLFFBQVE7QUFBQSxFQUNqQztBQUFBO0FBQUE7QUFBQSxFQU1BLE9BQWUsbUJBQ2QsYUFDQSxTQUNBLFNBQytDO0FBQy9DLFVBQU0sV0FBVyxNQUFNLEtBQUssYUFBYSxhQUFhLFNBQVMsTUFBTSxPQUFPO0FBRTVFLFFBQUksQ0FBQyxTQUFTLE1BQU07QUFDbkIsWUFBTSxJQUFJLE1BQU0sMkJBQTJCO0FBQUEsSUFDNUM7QUFFQSxXQUFPLEtBQUssU0FBUyxTQUFTLElBQUk7QUFBQSxFQUNuQztBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsc0JBQ2IsYUFDQSxTQUNBLFNBQzZCO0FBQzdCLFVBQU0sV0FBVyxNQUFNLEtBQUssYUFBYSxhQUFhLFNBQVMsT0FBTyxPQUFPO0FBQzdFLFdBQU8sU0FBUyxLQUFLO0FBQUEsRUFDdEI7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFjLGFBQ2IsYUFDQSxTQUNBLFFBQ0EsU0FDb0I7QUFDcEIsVUFBTSxhQUFhLE1BQU0sS0FBSyxtQkFBbUIsV0FBVztBQUM1RCxVQUFNLFlBQVksYUFBYTtBQUUvQixTQUFLLFlBQVksTUFBTSxxQ0FBcUMsU0FBUyxRQUFRLEtBQUssV0FBVyxNQUFNLGNBQWMsU0FBUyxFQUFFO0FBRTVILFVBQU0sRUFBRSxRQUFRLEdBQUcsS0FBSyxJQUFJO0FBQzVCLFVBQU0sT0FBTyxLQUFLLFVBQVU7QUFBQSxNQUMzQixHQUFHO0FBQUEsTUFDSDtBQUFBO0FBQUEsTUFFQSxHQUFJLFdBQVcsU0FDWixFQUFFLFFBQVEsT0FBTyxXQUFXLFdBQVcsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNLE9BQU8sQ0FBQyxJQUFJLE9BQU8sSUFDakYsQ0FBQztBQUFBLElBQ0wsQ0FBQztBQUVELFVBQU0sV0FBVyxNQUFNLFdBQVc7QUFBQSxNQUNqQztBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1IsR0FBRyxTQUFTO0FBQUEsVUFDWixnQkFBZ0I7QUFBQSxVQUNoQixpQkFBaUIsVUFBVSxXQUFXO0FBQUEsVUFDdEMsZ0JBQWdCO0FBQUEsVUFDaEIsd0JBQXdCO0FBQUE7QUFBQSxVQUV4QixpQkFBaUI7QUFBQSxVQUNqQixzQkFBc0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBUXZCO0FBQUEsUUFDQSx1QkFBdUIsU0FBUztBQUFBLFFBQ2hDO0FBQUEsUUFDQSxRQUFRLFNBQVM7QUFBQSxNQUNsQjtBQUFBLE1BQ0EsRUFBRSxNQUFNLFlBQVksYUFBYTtBQUFBLElBQ2xDO0FBQ0EsUUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNqQixVQUFJLFNBQVMsV0FBVyxPQUFPLFNBQVMsV0FBVyxLQUFLO0FBQ3ZELGFBQUssMEJBQTBCLFdBQVc7QUFBQSxNQUMzQztBQUNBLFlBQU0sT0FBTyxNQUFNLFNBQVMsS0FBSyxFQUFFLE1BQU0sTUFBTSxFQUFFO0FBQ2pELFlBQU0seUJBQXlCLFNBQVMsUUFBUSxTQUFTLFlBQVksSUFBSTtBQUFBLElBQzFFO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY1EsbUJBQW1CLGFBQTBDO0FBQ3BFLFdBQU8sS0FBSyxrQkFBa0IsV0FBVyxFQUFFLEtBQUssV0FBUyxNQUFNLFVBQVU7QUFBQSxFQUMxRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBTSxrQ0FBa0MsYUFBMkQ7QUFDbEcsVUFBTSxRQUFRLE1BQU0sS0FBSyxzQkFBc0IsV0FBVztBQUMxRCxVQUFNLFNBQVMsTUFBTSxLQUFLLGtCQUFrQixXQUFXO0FBQ3ZELFVBQU0sU0FBUyx3QkFBd0IsTUFBTSxLQUFLO0FBQ2xELFVBQU0sNkJBQTZCLE9BQU8sSUFBSSxJQUFJLE1BQU07QUFDeEQsVUFBTSxhQUFhLE9BQU8sSUFBSSxLQUFLO0FBQ25DLFVBQU0sb0JBQW9CLDZCQUN2QixPQUFPLG9CQUNQO0FBQ0gsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsWUFBWSxNQUFNO0FBQUEsTUFDbEIsVUFBVSxPQUFPO0FBQUEsTUFDakIsb0JBQW9CLE1BQU07QUFBQSxNQUMxQixzQkFBc0IsT0FBTztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxtQkFBbUIsYUFBa0Q7QUFDMUUsWUFBUSxNQUFNLEtBQUssa0JBQWtCLFdBQVcsR0FBRztBQUFBLEVBQ3BEO0FBQUEsRUFFQSxNQUFNLGlCQUFpQixhQUFrRDtBQUN4RSxZQUFRLE1BQU0sS0FBSyxrQkFBa0IsV0FBVyxHQUFHO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLGtCQUFrQixhQUE2QztBQUN0RSxVQUFNLGFBQWEsS0FBSyxJQUFJLElBQUk7QUFDaEMsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLElBQUksV0FBVztBQUNyRCxRQUFJLFVBQVU7QUFDYixhQUFPLFNBQVMsS0FBSyxXQUFTO0FBQzdCLFlBQUksTUFBTSxZQUFZLGFBQWEscUNBQXFDO0FBQ3ZFLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGFBQUssZ0JBQWdCLE9BQU8sV0FBVztBQUN2QyxlQUFPLEtBQUssa0JBQWtCLFdBQVc7QUFBQSxNQUMxQyxDQUFDLEVBQUUsTUFBTSxTQUFPO0FBRWYsYUFBSyxnQkFBZ0IsT0FBTyxXQUFXO0FBQ3ZDLGNBQU07QUFBQSxNQUNQLENBQUM7QUFBQSxJQUNGO0FBS0EsVUFBTSxVQUFVLEtBQUsscUJBQXFCLFdBQVcsRUFBRSxNQUFNLFNBQU87QUFDbkUsV0FBSyxnQkFBZ0IsT0FBTyxXQUFXO0FBQ3ZDLFlBQU07QUFBQSxJQUNQLENBQUM7QUFDRCxTQUFLLGdCQUFnQixJQUFJLGFBQWEsT0FBTztBQUM3QyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMEJBQTBCLGFBQTJCO0FBQzVELFNBQUssZ0JBQWdCLE9BQU8sV0FBVztBQUFBLEVBQ3hDO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixhQUE2QztBQUMvRSxVQUFNLEVBQUUsZUFBZSxRQUFRLElBQUksTUFBTSxLQUFLLGFBQWE7QUFDM0QsVUFBTSxRQUFRLEtBQUs7QUFDbkIsVUFBTSxhQUFhLElBQUksV0FBVyxlQUFlLDJCQUEyQjtBQUFBLE1BQzNFLE9BQU8sQ0FBQyxLQUFLLFlBQVksTUFBTSxLQUFLO0FBQUEsUUFDbkMsUUFBUSxRQUFRLFVBQVU7QUFBQSxRQUMxQixTQUFTLFFBQVE7QUFBQSxRQUNqQixNQUFNLFFBQVE7QUFBQSxRQUNkLFFBQVEsUUFBUTtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLFlBQVksTUFBTSwyRUFBMkU7QUFLbEcsVUFBTSxjQUFjLFFBQVEsSUFBSSxxQkFBcUI7QUFDckQsUUFBSSxhQUFhO0FBQ2hCLFVBQUkseUJBQXlCLFdBQVcsR0FBRztBQUMxQyxhQUFLLFlBQVksS0FBSywrQ0FBK0MsV0FBVywrQkFBK0I7QUFDL0csbUJBQVcsY0FBYyxFQUFFLFdBQVcsRUFBRSxLQUFLLGFBQWEsT0FBTyxZQUFZLEdBQUcsS0FBSyxHQUFHLEdBQUcsTUFBUztBQUNwRyxlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0EsV0FBVyxLQUFLLElBQUksSUFBSSxNQUFPO0FBQUEsVUFDL0IsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxNQUNEO0FBQ0EsV0FBSyxZQUFZLEtBQUssK0RBQStELFdBQVcsNkNBQTZDO0FBQUEsSUFDOUk7QUFFQSxVQUFNLFdBQVcsTUFBTSxLQUFLLE9BQU8sU0FBUztBQUFBLE1BQzNDLFFBQVE7QUFBQSxNQUNSLFNBQVM7QUFBQSxRQUNSLGlCQUFpQixVQUFVLFdBQVc7QUFBQSxRQUN0QyxVQUFVO0FBQUEsUUFDVix3QkFBd0I7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksQ0FBQyxTQUFTLElBQUk7QUFDakIsWUFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLLEVBQUUsTUFBTSxNQUFNLEVBQUU7QUFDakQsWUFBTSxJQUFJLE1BQU0sc0NBQXNDLFNBQVMsTUFBTSxJQUFJLFNBQVMsVUFBVSxXQUFNLElBQUksRUFBRTtBQUFBLElBQ3pHO0FBRUEsVUFBTSxXQUFpQyxNQUFNLFNBQVMsS0FBSztBQUUzRCxlQUFXO0FBQUEsTUFDVixFQUFFLFdBQVcsU0FBUyxhQUFhLENBQUMsR0FBRyxLQUFLLFNBQVMsbUJBQW1CLEdBQUc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFNM0UsS0FBSyx1QkFBdUIsaUJBQWlCO0FBQUEsSUFDOUM7QUFFQSxTQUFLLFlBQVksTUFBTSxzREFBc0QsU0FBUyxXQUFXLEdBQUc7QUFFcEcsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLFdBQVcsS0FBSyxJQUFJLElBQUksTUFBTztBQUFBLE1BQy9CLE9BQU8sU0FBUztBQUFBLE1BQ2hCLG1CQUFtQixTQUFTLFdBQVc7QUFBQSxNQUN2QyxhQUFhLFNBQVMsV0FBVztBQUFBLE1BQ2pDLHNCQUFzQixTQUFTO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhUSxpQkFBaUIsYUFBc0M7QUFDOUQsV0FBTyxLQUFLLHNCQUFzQixXQUFXLEVBQUUsS0FBSyxXQUFTLE1BQU0sS0FBSztBQUFBLEVBQ3pFO0FBQUEsRUFFUSxzQkFBc0IsYUFBbUQ7QUFDaEYsVUFBTSxhQUFhLEtBQUssSUFBSSxJQUFJO0FBQ2hDLFVBQU0sV0FBVyxLQUFLLHVCQUF1QixJQUFJLFdBQVc7QUFDNUQsUUFBSSxVQUFVO0FBQ2IsYUFBTyxTQUFTLEtBQUssV0FBUztBQUM3QixZQUFJLE1BQU0sWUFBWSxhQUFhLHNDQUFzQztBQUN4RSxpQkFBTztBQUFBLFFBQ1I7QUFLQSxZQUFJLEtBQUssdUJBQXVCLElBQUksV0FBVyxNQUFNLFVBQVU7QUFDOUQsZUFBSyx1QkFBdUIsT0FBTyxXQUFXO0FBQUEsUUFDL0M7QUFDQSxlQUFPLEtBQUssc0JBQXNCLFdBQVc7QUFBQSxNQUM5QyxDQUFDLEVBQUUsTUFBTSxTQUFPO0FBQ2YsWUFBSSxLQUFLLHVCQUF1QixJQUFJLFdBQVcsTUFBTSxVQUFVO0FBQzlELGVBQUssdUJBQXVCLE9BQU8sV0FBVztBQUFBLFFBQy9DO0FBQ0EsY0FBTTtBQUFBLE1BQ1AsQ0FBQztBQUFBLElBQ0Y7QUFFQSxVQUFNLFVBQXdDLEtBQUssbUJBQW1CLFdBQVcsRUFBRSxNQUFNLFNBQU87QUFDL0YsVUFBSSxLQUFLLHVCQUF1QixJQUFJLFdBQVcsTUFBTSxTQUFTO0FBQzdELGFBQUssdUJBQXVCLE9BQU8sV0FBVztBQUFBLE1BQy9DO0FBQ0EsWUFBTTtBQUFBLElBQ1AsQ0FBQztBQUNELFNBQUssdUJBQXVCLElBQUksYUFBYSxPQUFPO0FBQ3BELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxpQ0FBaUMsYUFBMkI7QUFDbkUsU0FBSyx1QkFBdUIsT0FBTyxXQUFXO0FBQUEsRUFDL0M7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLGFBQW1EO0FBQ25GLFVBQU0sYUFBYSxNQUFNLEtBQUssbUJBQW1CLFdBQVc7QUFFNUQsU0FBSyxZQUFZLE1BQU0sbURBQW1EO0FBRTFFLFVBQU0sV0FBVyxNQUFNLFdBQVc7QUFBQSxNQUNqQztBQUFBLFFBQ0MsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFVBQ1IsaUJBQWlCLFNBQVMsV0FBVztBQUFBLFVBQ3JDLHdCQUF3QjtBQUFBLFFBQ3pCO0FBQUEsTUFDRDtBQUFBLE1BQ0EsRUFBRSxNQUFNLFlBQVksYUFBYTtBQUFBLElBQ2xDO0FBRUEsUUFBSSxDQUFDLFNBQVMsSUFBSTtBQUNqQixZQUFNLE9BQU8sTUFBTSxTQUFTLEtBQUssRUFBRSxNQUFNLE1BQU0sRUFBRTtBQUNqRCxZQUFNLElBQUksTUFBTSxzQ0FBc0MsU0FBUyxNQUFNLElBQUksU0FBUyxVQUFVLFdBQVcsSUFBSSxFQUFFO0FBQUEsSUFDOUc7QUFFQSxVQUFNLFdBQVcsTUFBTSxTQUFTLEtBQUs7QUFDckMsUUFBSSxPQUFPLFNBQVMsVUFBVSxZQUFZLE9BQU8sU0FBUyxlQUFlLFVBQVU7QUFDbEYsWUFBTSxJQUFJLE1BQU0sd0RBQXdEO0FBQUEsSUFDekU7QUFRQSxVQUFNLGFBQWEsS0FBSyxJQUFJLElBQUk7QUFDaEMsVUFBTSxZQUFZLE9BQU8sU0FBUyxlQUFlLFdBQVcsU0FBUyxhQUFhO0FBQ2xGLFVBQU0sbUJBQW1CLE1BQU0sUUFBUSxTQUFTLGlCQUFpQixJQUM5RCxTQUFTLGtCQUFrQixPQUFPLENBQUMsaUJBQXlDLE9BQU8saUJBQWlCLFFBQVEsSUFDNUcsQ0FBQztBQUNKLFVBQU0sWUFBWSxLQUFLO0FBQUEsTUFDdEIsY0FBYyxTQUFZLGFBQWEsWUFBWSxTQUFTO0FBQUEsTUFDNUQsYUFBYTtBQUFBLElBQ2Q7QUFFQSxXQUFPO0FBQUEsTUFDTixPQUFPLFNBQVM7QUFBQSxNQUNoQjtBQUFBLE1BQ0Esa0JBQWtCLG9CQUFJLElBQUk7QUFBQSxNQUMxQixZQUFZLGlCQUFpQixLQUFLLGtCQUFnQiwrQkFBK0IsSUFBSSxZQUFZLENBQUM7QUFBQSxNQUNsRyxvQkFBb0IsaUJBQWlCLEtBQUssa0JBQWdCLDZCQUE2QixJQUFJLFlBQVksQ0FBQztBQUFBLElBQ3pHO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYyx1QkFBdUIsYUFBcUIsYUFBc0M7QUFDL0YsVUFBTSxlQUFlLEtBQUssdUJBQXVCLElBQUksV0FBVztBQUNoRSxVQUFNLFFBQVEsZUFBZSxNQUFNLGVBQWU7QUFDbEQsVUFBTSxTQUFTLE9BQU8saUJBQWlCLElBQUksV0FBVztBQUN0RCxRQUFJLFFBQVE7QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBUyxNQUFNLEtBQUssT0FBTyxXQUFXO0FBQzVDLFVBQU0sUUFBUSxPQUFPLEtBQUssT0FBSyxFQUFFLGNBQWMsV0FBVyxXQUFXO0FBQ3JFLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sdUNBQXVDLFdBQVcsR0FBRztBQUFBLElBQ3RFO0FBRUEsV0FBTyxpQkFBaUIsSUFBSSxhQUFhLE1BQU0sRUFBRTtBQUNqRCxXQUFPLE1BQU07QUFBQSxFQUNkO0FBQUE7QUFBQTtBQUFBLEVBTUEsT0FBZSxTQUFTLE1BQWdGO0FBQ3ZHLFVBQU0sU0FBUyxLQUFLLFVBQVU7QUFDOUIsVUFBTSxVQUFVLElBQUksWUFBWTtBQUNoQyxRQUFJLFNBQVM7QUFFYixRQUFJO0FBQ0gsYUFBTyxNQUFNO0FBQ1osY0FBTSxFQUFFLE1BQU0sTUFBTSxJQUFJLE1BQU0sT0FBTyxLQUFLO0FBQzFDLFlBQUksTUFBTTtBQUNUO0FBQUEsUUFDRDtBQUVBLGtCQUFVLFFBQVEsT0FBTyxPQUFPLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFDaEQsY0FBTSxRQUFRLE9BQU8sTUFBTSxJQUFJO0FBQy9CLGlCQUFTLE1BQU0sSUFBSSxLQUFLO0FBRXhCLG1CQUFXLFFBQVEsT0FBTztBQUN6QixnQkFBTSxRQUFRLEtBQUssZUFBZSxJQUFJO0FBQ3RDLGNBQUksVUFBVSxRQUFXO0FBQ3hCLGtCQUFNO0FBQ04sZ0JBQUksTUFBTSxTQUFTLGdCQUFnQjtBQUNsQztBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLE9BQU8sS0FBSyxHQUFHO0FBQ2xCLGNBQU0sUUFBUSxLQUFLLGVBQWUsTUFBTTtBQUN4QyxZQUFJLFVBQVUsUUFBVztBQUN4QixnQkFBTTtBQUNOLGNBQUksTUFBTSxTQUFTLGdCQUFnQjtBQUNsQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsVUFBRTtBQUtELFVBQUk7QUFDSCxjQUFNLE9BQU8sT0FBTztBQUFBLE1BQ3JCLFFBQVE7QUFBQSxNQUVSO0FBQ0EsYUFBTyxZQUFZO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLGVBQWUsTUFBd0Q7QUFDOUUsUUFBSSxDQUFDLEtBQUssV0FBVyxRQUFRLEdBQUc7QUFDL0IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLE9BQU8sS0FBSyxNQUFNLFNBQVMsTUFBTSxFQUFFLEtBQUs7QUFFOUMsUUFBSTtBQUNKLFFBQUk7QUFDSCxlQUFTLEtBQUssTUFBTSxJQUFJO0FBQUEsSUFDekIsUUFBUTtBQUNQLFdBQUssWUFBWSxLQUFLLGlEQUFpRCxJQUFJO0FBQzNFLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxPQUFPLFdBQVcsWUFBWSxXQUFXLE1BQU07QUFDbEQsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQVM7QUFDZixVQUFNLE9BQU8sT0FBTztBQUNwQixRQUFJLE9BQU8sU0FBUyxVQUFVO0FBQzdCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxTQUFTLFNBQVM7QUFLckIsWUFBTSxXQUFZLE9BQStCO0FBQ2pELFVBQUk7QUFDSixVQUNDLFlBQVksT0FBTyxhQUFhLFlBQzdCLE9BQVEsU0FBZ0MsU0FBUyxZQUNqRCxPQUFRLFNBQW1DLFlBQVksVUFDekQ7QUFDRCxtQkFBVztBQUFBLE1BQ1osT0FBTztBQUNOLFlBQUk7QUFDSixZQUFJLE9BQU8sYUFBYSxVQUFVO0FBQ2pDLHlCQUFlO0FBQUEsUUFDaEIsV0FBVyxPQUFRLFVBQWdELFlBQVksVUFBVTtBQUN4Rix5QkFBZ0IsU0FBaUM7QUFBQSxRQUNsRCxPQUFPO0FBQ04seUJBQWU7QUFBQSxRQUNoQjtBQUNBLG1CQUFXO0FBQUEsVUFDVixNQUFNO0FBQUEsVUFDTixPQUFPLEVBQUUsTUFBTSxhQUFhLFNBQVMsYUFBYTtBQUFBLFVBQ2xELFlBQVk7QUFBQSxRQUNiO0FBQUEsTUFDRDtBQUNBLFlBQU0sSUFBSSxnQkFBZ0Isb0NBQW9DLFFBQVE7QUFBQSxJQUN2RTtBQUVBLFFBQUksQ0FBQyxzQkFBc0IsSUFBSSxJQUFJLEdBQUc7QUFDckMsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBR0Q7QUE5c0JhLG9CQUFOO0FBQUEsRUFXSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FiVTtBQWd0QmIsTUFBTSx3QkFBd0Isb0JBQUksSUFBSTtBQUFBLEVBQ3JDO0FBQUEsRUFBaUI7QUFBQSxFQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFBdUI7QUFBQSxFQUF1QjtBQUMvQyxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
