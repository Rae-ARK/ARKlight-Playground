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
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import {
  CLOUD_SANDBOX_AGENT_SLUG,
  CloudSandboxAuthenticationRequiredError,
  CloudSandboxRequestError
} from "../../../../../platform/agentHost/common/cloudSandboxAgentHost.js";
import { GITHUB_DOT_COM_COPILOT_API_BASE_URI } from "../../../../../platform/agentHost/common/githubEndpoints.js";
import { COPILOT_INTEGRATION_ID } from "../../../../../platform/endpoint/common/licenseAgreement.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { asText, IRequestService } from "../../../../../platform/request/common/request.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { ICloudSandboxTelemetryService, requestOutcomeForStatus } from "./cloudSandboxTelemetry.js";
const LOG_PREFIX = "[CloudSandboxCredentials]";
const REQUEST_TIMEOUT_MS = 1e4;
const DISCOVERY_TIMEOUT_MS = 3e4;
const DEFAULT_WAKING_RETRY_AFTER_SECONDS = 5;
const DISCOVERY_TASK_SCAN_LIMIT = 100;
const FALLBACK_SCOPES = ["read:user", "user:email", "repo", "workflow"];
let CloudSandboxCredentialsService = class extends Disposable {
  constructor(_requestService, _authenticationService, _productService, _logService, _telemetry) {
    super();
    this._requestService = _requestService;
    this._authenticationService = _authenticationService;
    this._productService = _productService;
    this._logService = _logService;
    this._telemetry = _telemetry;
  }
  async connect(request, token) {
    return this._connectRequest("connect", request.environmentId, token, {
      ...request.sessionId && { session_id: request.sessionId }
    });
  }
  async reconnect(request, clientId, token) {
    return this._connectRequest("reconnect", request.environmentId, token, {
      client_id: clientId,
      ...request.sessionId && { session_id: request.sessionId }
    });
  }
  async getEnvironment(environmentId, token) {
    const context = await this._sendEnvironment("get", environmentId, token);
    if (!isSuccess(context)) {
      await this._throwForStatus("get", context);
    }
    const environment = await this._readJson(context);
    if (!environment?.status) {
      throw new Error("Mission Control get returned an incomplete environment response");
    }
    return environment;
  }
  /**
   * Enumerate sandbox-backed cloud sessions by scanning recent tasks and resolving each one's
   * Mission Control environment binding.
   *
   * The result distinguishes a full scan from a partial or failed one: a caller that reconciles
   * against this list would otherwise treat a transient request failure as "these sessions no
   * longer exist" and tear down live providers.
   */
  async listSessions(token) {
    let tasks;
    try {
      const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks?per_page=${DISCOVERY_TASK_SCAN_LIMIT}`, "list", token);
      const response = await this._readJson(context);
      if (!response?.tasks) {
        return { kind: "failed", reason: `listTasks returned no 'tasks' array` };
      }
      tasks = response.tasks;
    } catch (error) {
      return { kind: "failed", reason: `listTasks failed: ${toErrorMessage(error)}` };
    }
    const sandboxTasks = tasks.filter((task) => !task.archived_at && isCloudSandboxTask(task));
    let unresolved = 0;
    const discovered = await Promise.all(sandboxTasks.map(async (task) => {
      try {
        const context = await this._sendTask(`${this._tasksBaseUrl()}/tasks/${encodeURIComponent(task.id)}`, "get", token);
        const full = await this._readJson(context);
        if (!full) {
          unresolved++;
          return void 0;
        }
        const binding = getTaskEnvironmentBinding(full);
        if (!binding) {
          return void 0;
        }
        const repo = parseRepoFromTaskUrl(full.html_url);
        return {
          environmentId: binding.environmentId,
          sessionId: binding.sessionId,
          name: full.name ?? task.name ?? `Sandbox ${task.id}`,
          repoName: repo ? `${repo.owner}/${repo.name}` : void 0,
          updatedAt: full.updated_at ?? task.updated_at
        };
      } catch (error) {
        this._logService.warn(`${LOG_PREFIX} Discovery getTask ${task.id} failed: ${toErrorMessage(error)}`);
        unresolved++;
        return void 0;
      }
    }));
    const sessions = discovered.filter((session) => session !== void 0);
    this._logService.info(`${LOG_PREFIX} Discovery found ${sessions.length} sandbox session(s) from ${sandboxTasks.length} sandbox task(s) out of ${tasks.length} scanned${unresolved > 0 ? `; ${unresolved} unresolved` : ""}.`);
    return { kind: unresolved > 0 ? "partial" : "complete", sessions };
  }
  /** Shared handler for the `connect`/`reconnect` endpoints (200 token or 202 waking). */
  async _connectRequest(action, environmentId, token, searchParams) {
    const context = await this._sendEnvironment(action, environmentId, token, searchParams);
    if (context.res.statusCode === 202) {
      const retryAfterSeconds = parseRetryAfter(context.res.headers?.["retry-after"]);
      this._logService.debug(`${LOG_PREFIX} ${action}: environment waking, retry after ${retryAfterSeconds}s`);
      return { kind: "waking", waking: { retryAfterSeconds } };
    }
    if (!isSuccess(context)) {
      await this._throwForStatus(action, context);
    }
    const clientToken = await this._readJson(context);
    if (!clientToken?.access_token || !clientToken?.wps_endpoint || !clientToken?.client_id || !clientToken?.groups) {
      throw new Error(`Mission Control ${action} returned an incomplete token response`);
    }
    return { kind: "token", token: clientToken };
  }
  /**
   * Issue an agent-environment request and return the raw response. The caller owns status
   * handling, since the meaning of a status is endpoint-specific (notably HTTP 202 = "waking",
   * which is neither an error nor a result).
   */
  async _sendEnvironment(action, environmentId, token, searchParams) {
    const path = action === "get" ? "" : `/${action}`;
    const url = `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents/environments/${encodeURIComponent(environmentId)}${path}${toQuery(searchParams)}`;
    return this._request(url, `mc.environmentClient.${action}`, action === "get" ? "getEnvironment" : action, {
      "Copilot-Integration-Id": COPILOT_INTEGRATION_ID
    }, token);
  }
  /** Issue a task API request, throwing on a non-success status. */
  async _sendTask(url, action, token) {
    const context = await this._request(url, `mc.taskClient.${action}`, action === "list" ? "listTasks" : "getTask", {
      "Accept": "application/json",
      "Copilot-Integration-Id": COPILOT_INTEGRATION_ID
    }, token, DISCOVERY_TIMEOUT_MS);
    if (!isSuccess(context)) {
      await this._throwForStatus(`task ${action}`, context);
    }
    return context;
  }
  async _request(url, callSite, action, headers, token, timeout = REQUEST_TIMEOUT_MS) {
    const accessToken = await this._resolveGitHubToken();
    if (!accessToken) {
      throw new CloudSandboxAuthenticationRequiredError();
    }
    try {
      const context = await this._requestService.request({
        type: "GET",
        url,
        headers: { ...headers, ["Authorization"]: `Bearer ${accessToken}` },
        timeout,
        callSite
      }, token);
      this._telemetry.reportRequest(action, requestOutcomeForStatus(context.res.statusCode));
      return context;
    } catch (error) {
      if (!isCancellationError(error) && !token.isCancellationRequested) {
        this._telemetry.reportRequest(action, "networkError");
      }
      this._logService.error(`${LOG_PREFIX} GET ${url} failed: ${toErrorMessage(error)}`);
      throw error;
    }
  }
  /**
   * Mission Control task API base. Uses the Copilot API host: `api.github.com/agents/*` omits
   * CORS headers on authenticated responses, so a renderer `fetch` receives the reply and discards it.
   */
  _tasksBaseUrl() {
    return `${GITHUB_DOT_COM_COPILOT_API_BASE_URI}/agents`;
  }
  async _readJson(context) {
    const body = await asText(context);
    if (!body) {
      return void 0;
    }
    try {
      return JSON.parse(body);
    } catch {
      return void 0;
    }
  }
  /** Throw a diagnosable error for a non-success response, including the body when readable. */
  async _throwForStatus(action, context) {
    const body = await asText(context).catch(() => "");
    const status = context.res.statusCode;
    throw new CloudSandboxRequestError(
      status,
      `Mission Control ${action} failed: HTTP ${status ?? "unknown"} - ${(body ?? "").slice(0, 200)}`
    );
  }
  /** A GitHub session carrying at least the configured chat provider scopes. */
  async _resolveGitHubToken() {
    const providerId = this._productService.defaultChatAgent?.provider?.default?.id ?? "github";
    const scopes = this._productService.defaultChatAgent?.providerScopes?.[0] ?? FALLBACK_SCOPES;
    let exact;
    try {
      exact = await this._authenticationService.getSessions(providerId, [...scopes], void 0, true);
    } catch (error) {
      this._logService.warn(`${LOG_PREFIX} getSessions('${providerId}') failed: ${toErrorMessage(error)}`);
      return void 0;
    }
    if (exact.length > 0) {
      return exact[0].accessToken;
    }
    const all = await this._authenticationService.getSessions(providerId, void 0, void 0, true);
    const required = new Set(scopes);
    let best;
    for (const session of all) {
      const granted = new Set(session.scopes);
      if ([...required].every((scope) => granted.has(scope))) {
        const extra = granted.size - required.size;
        if (!best || extra < best.extra) {
          best = { token: session.accessToken, extra };
        }
      }
    }
    if (!best) {
      this._logService.warn(`${LOG_PREFIX} No '${providerId}' session with scopes [${scopes.join(", ")}]`);
    }
    return best?.token;
  }
};
CloudSandboxCredentialsService = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, IAuthenticationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ICloudSandboxTelemetryService)
], CloudSandboxCredentialsService);
function isSuccess(context) {
  const status = context.res.statusCode ?? 0;
  return status >= 200 && status < 300;
}
function toQuery(searchParams) {
  if (!searchParams) {
    return "";
  }
  const search = new URLSearchParams(searchParams).toString();
  return search ? `?${search}` : "";
}
function parseRetryAfter(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw) {
    const seconds = Number.parseInt(raw, 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return DEFAULT_WAKING_RETRY_AFTER_SECONDS;
}
function isCloudSandboxTask(task) {
  const isCloudCodingAgent = task.agent_collaborators?.some((c) => c.slug === CLOUD_SANDBOX_AGENT_SLUG) ?? false;
  return isCloudCodingAgent && task.compute?.provider === "sandboxes";
}
function getTaskEnvironmentBinding(task) {
  for (const session of task.sessions ?? []) {
    if (session.environment_id && session.environment_id.length > 0 && session.id.length > 0) {
      return { environmentId: session.environment_id, sessionId: session.id };
    }
  }
  return void 0;
}
function parseRepoFromTaskUrl(htmlUrl) {
  if (!htmlUrl) {
    return void 0;
  }
  try {
    const match = new URL(htmlUrl).pathname.match(/^\/([^/]+)\/([^/]+)\//);
    if (match) {
      return { owner: match[1], name: match[2] };
    }
  } catch {
  }
  return void 0;
}
export {
  CloudSandboxCredentialsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL3JlbW90ZUFnZW50SG9zdC9icm93c2VyL2Nsb3VkU2FuZGJveENyZWRlbnRpYWxzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQge1xuXHRDTE9VRF9TQU5EQk9YX0FHRU5UX1NMVUcsXG5cdENsb3VkU2FuZGJveEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRFcnJvcixcblx0Q2xvdWRTYW5kYm94Q29ubmVjdFJlc3VsdCxcblx0Q2xvdWRTYW5kYm94UmVxdWVzdEVycm9yLFxuXHRJQ2xvdWRTYW5kYm94Q2xpZW50VG9rZW4sXG5cdElDbG91ZFNhbmRib3hDb25uZWN0aW9uUmVxdWVzdCxcblx0SUNsb3VkU2FuZGJveENyZWRlbnRpYWxzU2VydmljZSxcblx0SUNsb3VkU2FuZGJveERpc2NvdmVyZWRTZXNzaW9uLFxuXHRJQ2xvdWRTYW5kYm94RGlzY292ZXJ5UmVzdWx0LFxuXHRJQ2xvdWRTYW5kYm94RW52aXJvbm1lbnQsXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY2xvdWRTYW5kYm94QWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IEdJVEhVQl9ET1RfQ09NX0NPUElMT1RfQVBJX0JBU0VfVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9naXRodWJFbmRwb2ludHMuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9JTlRFR1JBVElPTl9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VuZHBvaW50L2NvbW1vbi9saWNlbnNlQWdyZWVtZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IGFzVGV4dCwgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDbG91ZFNhbmRib3hUZWxlbWV0cnlTZXJ2aWNlLCByZXF1ZXN0T3V0Y29tZUZvclN0YXR1cywgdHlwZSBDbG91ZFNhbmRib3hSZXF1ZXN0QWN0aW9uIH0gZnJvbSAnLi9jbG91ZFNhbmRib3hUZWxlbWV0cnkuanMnO1xuXG4vKiogVGhlIGFnZW50LWVudmlyb25tZW50IGVuZHBvaW50cyBNaXNzaW9uIENvbnRyb2wgZXhwb3Nlcy4gKi9cbnR5cGUgQ2xvdWRTYW5kYm94RW52aXJvbm1lbnRBY3Rpb24gPSAnZ2V0JyB8ICdjb25uZWN0JyB8ICdyZWNvbm5lY3QnO1xuXG4vKiogVGhlIHN1YnNldCBvZiBhIE1pc3Npb24gQ29udHJvbCB0YXNrIHRoZSBzYW5kYm94IGRpc2NvdmVyeSBwYXRoIHJlYWRzLiAqL1xuaW50ZXJmYWNlIElUYXNrU3VtbWFyeSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGh0bWxfdXJsPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcmNoaXZlZF9hdD86IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IHVwZGF0ZWRfYXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50X2NvbGxhYm9yYXRvcnM/OiByZWFkb25seSB7IHJlYWRvbmx5IHNsdWc/OiBzdHJpbmcgfVtdO1xuXHRyZWFkb25seSBjb21wdXRlPzogeyByZWFkb25seSBwcm92aWRlcj86IHN0cmluZyB9O1xufVxuXG4vKiogQSBmdWxsIHRhc2ssIHdoaWNoIGFkZGl0aW9uYWxseSBjYXJyaWVzIHRoZSBzZXNzaW9ucyBib3VuZCB0byBzYW5kYm94IGVudmlyb25tZW50cy4gKi9cbmludGVyZmFjZSBJVGFza0RldGFpbCBleHRlbmRzIElUYXNrU3VtbWFyeSB7XG5cdHJlYWRvbmx5IHNlc3Npb25zPzogcmVhZG9ubHkgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBlbnZpcm9ubWVudF9pZD86IHN0cmluZyB9W107XG59XG5cbmNvbnN0IExPR19QUkVGSVggPSAnW0Nsb3VkU2FuZGJveENyZWRlbnRpYWxzXSc7XG5cbi8qKiBQZXItcmVxdWVzdCB0aW1lb3V0IChtcykgZm9yIGNyZWRlbnRpYWwgYW5kIGVudmlyb25tZW50IGNhbGxzLiAqL1xuY29uc3QgUkVRVUVTVF9USU1FT1VUX01TID0gMTBfMDAwO1xuXG4vKiogUGVyLXJlcXVlc3QgdGltZW91dCAobXMpIGZvciBkaXNjb3ZlcnksIHdob3NlIHRhc2sgbGlzdCBpcyBmYXIgbGFyZ2VyIHRoYW4gYSBjcmVkZW50aWFsIG1pbnQuICovXG5jb25zdCBESVNDT1ZFUllfVElNRU9VVF9NUyA9IDMwXzAwMDtcblxuLyoqIERlZmF1bHQgUmV0cnktQWZ0ZXIgKHNlY29uZHMpIHdoZW4gYSAyMDIgXCJ3YWtpbmdcIiByZXNwb25zZSBvbWl0cyB0aGUgaGVhZGVyLiAqL1xuY29uc3QgREVGQVVMVF9XQUtJTkdfUkVUUllfQUZURVJfU0VDT05EUyA9IDU7XG5cbi8qKiBIb3cgbWFueSByZWNlbnQgdGFza3MgdG8gc2NhbiBmb3Igc2FuZGJveCBzZXNzaW9ucyBkdXJpbmcgZGlzY292ZXJ5LiAqL1xuY29uc3QgRElTQ09WRVJZX1RBU0tfU0NBTl9MSU1JVCA9IDEwMDtcblxuLyoqIEZhbGxiYWNrIHNjb3BlcyB3aGVuIHRoZSBwcm9kdWN0IGRvZXMgbm90IGNvbmZpZ3VyZSBgZGVmYXVsdENoYXRBZ2VudC5wcm92aWRlclNjb3Blc2AuICovXG5jb25zdCBGQUxMQkFDS19TQ09QRVMgPSBbJ3JlYWQ6dXNlcicsICd1c2VyOmVtYWlsJywgJ3JlcG8nLCAnd29ya2Zsb3cnXTtcblxuLyoqXG4gKiBNaXNzaW9uIENvbnRyb2wgY2xpZW50IGZvciBjbG91ZCBzYW5kYm94IHNlc3Npb25zOiBtaW50cyAoYGNvbm5lY3RgKSBhbmQgcmVmcmVzaGVzIChgcmVjb25uZWN0YClcbiAqIFdlYiBQdWJTdWIgY3JlZGVudGlhbHMsIHJlYWRzIGFuIGVudmlyb25tZW50J3Mgc3RhdHVzLCBhbmQgZGlzY292ZXJzIHNhbmRib3gtYmFja2VkIHNlc3Npb25zLlxuICpcbiAqIFJ1bnMgaW4gdGhlIHJlbmRlcmVyIHNvIHRoZSBzYW5kYm94IHBhdGggd29ya3MgaW4gVlMgQ29kZSBXZWIsIHdoZXJlIG5vIENvcGlsb3QgZXh0ZW5zaW9uIGhvc3QgaXNcbiAqIGF2YWlsYWJsZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENsb3VkU2FuZGJveENyZWRlbnRpYWxzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2xvdWRTYW5kYm94Q3JlZGVudGlhbHNTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2xvdWRTYW5kYm94VGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnk6IElDbG91ZFNhbmRib3hUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdChyZXF1ZXN0OiBJQ2xvdWRTYW5kYm94Q29ubmVjdGlvblJlcXVlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Q2xvdWRTYW5kYm94Q29ubmVjdFJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25uZWN0UmVxdWVzdCgnY29ubmVjdCcsIHJlcXVlc3QuZW52aXJvbm1lbnRJZCwgdG9rZW4sIHtcblx0XHRcdC4uLihyZXF1ZXN0LnNlc3Npb25JZCAmJiB7IHNlc3Npb25faWQ6IHJlcXVlc3Quc2Vzc2lvbklkIH0pLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcmVjb25uZWN0KHJlcXVlc3Q6IElDbG91ZFNhbmRib3hDb25uZWN0aW9uUmVxdWVzdCwgY2xpZW50SWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDbG91ZFNhbmRib3hDb25uZWN0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Nvbm5lY3RSZXF1ZXN0KCdyZWNvbm5lY3QnLCByZXF1ZXN0LmVudmlyb25tZW50SWQsIHRva2VuLCB7XG5cdFx0XHRjbGllbnRfaWQ6IGNsaWVudElkLFxuXHRcdFx0Li4uKHJlcXVlc3Quc2Vzc2lvbklkICYmIHsgc2Vzc2lvbl9pZDogcmVxdWVzdC5zZXNzaW9uSWQgfSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRFbnZpcm9ubWVudChlbnZpcm9ubWVudElkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNsb3VkU2FuZGJveEVudmlyb25tZW50PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3NlbmRFbnZpcm9ubWVudCgnZ2V0JywgZW52aXJvbm1lbnRJZCwgdG9rZW4pO1xuXHRcdGlmICghaXNTdWNjZXNzKGNvbnRleHQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90aHJvd0ZvclN0YXR1cygnZ2V0JywgY29udGV4dCk7XG5cdFx0fVxuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gYXdhaXQgdGhpcy5fcmVhZEpzb248SUNsb3VkU2FuZGJveEVudmlyb25tZW50Pihjb250ZXh0KTtcblx0XHRpZiAoIWVudmlyb25tZW50Py5zdGF0dXMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWlzc2lvbiBDb250cm9sIGdldCByZXR1cm5lZCBhbiBpbmNvbXBsZXRlIGVudmlyb25tZW50IHJlc3BvbnNlJyk7XG5cdFx0fVxuXHRcdHJldHVybiBlbnZpcm9ubWVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnVtZXJhdGUgc2FuZGJveC1iYWNrZWQgY2xvdWQgc2Vzc2lvbnMgYnkgc2Nhbm5pbmcgcmVjZW50IHRhc2tzIGFuZCByZXNvbHZpbmcgZWFjaCBvbmUnc1xuXHQgKiBNaXNzaW9uIENvbnRyb2wgZW52aXJvbm1lbnQgYmluZGluZy5cblx0ICpcblx0ICogVGhlIHJlc3VsdCBkaXN0aW5ndWlzaGVzIGEgZnVsbCBzY2FuIGZyb20gYSBwYXJ0aWFsIG9yIGZhaWxlZCBvbmU6IGEgY2FsbGVyIHRoYXQgcmVjb25jaWxlc1xuXHQgKiBhZ2FpbnN0IHRoaXMgbGlzdCB3b3VsZCBvdGhlcndpc2UgdHJlYXQgYSB0cmFuc2llbnQgcmVxdWVzdCBmYWlsdXJlIGFzIFwidGhlc2Ugc2Vzc2lvbnMgbm9cblx0ICogbG9uZ2VyIGV4aXN0XCIgYW5kIHRlYXIgZG93biBsaXZlIHByb3ZpZGVycy5cblx0ICovXG5cdGFzeW5jIGxpc3RTZXNzaW9ucyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDbG91ZFNhbmRib3hEaXNjb3ZlcnlSZXN1bHQ+IHtcblx0XHRsZXQgdGFza3M6IHJlYWRvbmx5IElUYXNrU3VtbWFyeVtdO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5fc2VuZFRhc2soYCR7dGhpcy5fdGFza3NCYXNlVXJsKCl9L3Rhc2tzP3Blcl9wYWdlPSR7RElTQ09WRVJZX1RBU0tfU0NBTl9MSU1JVH1gLCAnbGlzdCcsIHRva2VuKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fcmVhZEpzb248eyB0YXNrcz86IHJlYWRvbmx5IElUYXNrU3VtbWFyeVtdIH0+KGNvbnRleHQpO1xuXHRcdFx0aWYgKCFyZXNwb25zZT8udGFza3MpIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2ZhaWxlZCcsIHJlYXNvbjogYGxpc3RUYXNrcyByZXR1cm5lZCBubyAndGFza3MnIGFycmF5YCB9O1xuXHRcdFx0fVxuXHRcdFx0dGFza3MgPSByZXNwb25zZS50YXNrcztcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ2ZhaWxlZCcsIHJlYXNvbjogYGxpc3RUYXNrcyBmYWlsZWQ6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfWAgfTtcblx0XHR9XG5cblx0XHRjb25zdCBzYW5kYm94VGFza3MgPSB0YXNrcy5maWx0ZXIodGFzayA9PiAhdGFzay5hcmNoaXZlZF9hdCAmJiBpc0Nsb3VkU2FuZGJveFRhc2sodGFzaykpO1xuXHRcdGxldCB1bnJlc29sdmVkID0gMDtcblx0XHRjb25zdCBkaXNjb3ZlcmVkID0gYXdhaXQgUHJvbWlzZS5hbGwoc2FuZGJveFRhc2tzLm1hcChhc3luYyAodGFzayk6IFByb21pc2U8SUNsb3VkU2FuZGJveERpc2NvdmVyZWRTZXNzaW9uIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5fc2VuZFRhc2soYCR7dGhpcy5fdGFza3NCYXNlVXJsKCl9L3Rhc2tzLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHRhc2suaWQpfWAsICdnZXQnLCB0b2tlbik7XG5cdFx0XHRcdGNvbnN0IGZ1bGwgPSBhd2FpdCB0aGlzLl9yZWFkSnNvbjxJVGFza0RldGFpbD4oY29udGV4dCk7XG5cdFx0XHRcdGlmICghZnVsbCkge1xuXHRcdFx0XHRcdHVucmVzb2x2ZWQrKztcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJpbmRpbmcgPSBnZXRUYXNrRW52aXJvbm1lbnRCaW5kaW5nKGZ1bGwpO1xuXHRcdFx0XHRpZiAoIWJpbmRpbmcpIHtcblx0XHRcdFx0XHQvLyBObyBlbnZpcm9ubWVudCBib3VuZCB5ZXQgXHUyMDE0IGEgcmVhbCBzdGF0ZSwgbm90IGEgZmFpbHVyZSB0byByZXNvbHZlLlxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVwbyA9IHBhcnNlUmVwb0Zyb21UYXNrVXJsKGZ1bGwuaHRtbF91cmwpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGVudmlyb25tZW50SWQ6IGJpbmRpbmcuZW52aXJvbm1lbnRJZCxcblx0XHRcdFx0XHRzZXNzaW9uSWQ6IGJpbmRpbmcuc2Vzc2lvbklkLFxuXHRcdFx0XHRcdG5hbWU6IGZ1bGwubmFtZSA/PyB0YXNrLm5hbWUgPz8gYFNhbmRib3ggJHt0YXNrLmlkfWAsXG5cdFx0XHRcdFx0cmVwb05hbWU6IHJlcG8gPyBgJHtyZXBvLm93bmVyfS8ke3JlcG8ubmFtZX1gIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVwZGF0ZWRBdDogZnVsbC51cGRhdGVkX2F0ID8/IHRhc2sudXBkYXRlZF9hdCxcblx0XHRcdFx0fTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBEaXNjb3ZlcnkgZ2V0VGFzayAke3Rhc2suaWR9IGZhaWxlZDogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHRcdHVucmVzb2x2ZWQrKztcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IGRpc2NvdmVyZWQuZmlsdGVyKChzZXNzaW9uKTogc2Vzc2lvbiBpcyBJQ2xvdWRTYW5kYm94RGlzY292ZXJlZFNlc3Npb24gPT4gc2Vzc2lvbiAhPT0gdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gRGlzY292ZXJ5IGZvdW5kICR7c2Vzc2lvbnMubGVuZ3RofSBzYW5kYm94IHNlc3Npb24ocykgZnJvbSAke3NhbmRib3hUYXNrcy5sZW5ndGh9IHNhbmRib3ggdGFzayhzKSBvdXQgb2YgJHt0YXNrcy5sZW5ndGh9IHNjYW5uZWQke3VucmVzb2x2ZWQgPiAwID8gYDsgJHt1bnJlc29sdmVkfSB1bnJlc29sdmVkYCA6ICcnfS5gKTtcblx0XHRyZXR1cm4geyBraW5kOiB1bnJlc29sdmVkID4gMCA/ICdwYXJ0aWFsJyA6ICdjb21wbGV0ZScsIHNlc3Npb25zIH07XG5cdH1cblxuXHQvKiogU2hhcmVkIGhhbmRsZXIgZm9yIHRoZSBgY29ubmVjdGAvYHJlY29ubmVjdGAgZW5kcG9pbnRzICgyMDAgdG9rZW4gb3IgMjAyIHdha2luZykuICovXG5cdHByaXZhdGUgYXN5bmMgX2Nvbm5lY3RSZXF1ZXN0KFxuXHRcdGFjdGlvbjogQ2xvdWRTYW5kYm94RW52aXJvbm1lbnRBY3Rpb24sXG5cdFx0ZW52aXJvbm1lbnRJZDogc3RyaW5nLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRzZWFyY2hQYXJhbXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG5cdCk6IFByb21pc2U8Q2xvdWRTYW5kYm94Q29ubmVjdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLl9zZW5kRW52aXJvbm1lbnQoYWN0aW9uLCBlbnZpcm9ubWVudElkLCB0b2tlbiwgc2VhcmNoUGFyYW1zKTtcblxuXHRcdGlmIChjb250ZXh0LnJlcy5zdGF0dXNDb2RlID09PSAyMDIpIHtcblx0XHRcdGNvbnN0IHJldHJ5QWZ0ZXJTZWNvbmRzID0gcGFyc2VSZXRyeUFmdGVyKGNvbnRleHQucmVzLmhlYWRlcnM/LlsncmV0cnktYWZ0ZXInXSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGAke0xPR19QUkVGSVh9ICR7YWN0aW9ufTogZW52aXJvbm1lbnQgd2FraW5nLCByZXRyeSBhZnRlciAke3JldHJ5QWZ0ZXJTZWNvbmRzfXNgKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICd3YWtpbmcnLCB3YWtpbmc6IHsgcmV0cnlBZnRlclNlY29uZHMgfSB9O1xuXHRcdH1cblx0XHRpZiAoIWlzU3VjY2Vzcyhjb250ZXh0KSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fdGhyb3dGb3JTdGF0dXMoYWN0aW9uLCBjb250ZXh0KTtcblx0XHR9XG5cdFx0Y29uc3QgY2xpZW50VG9rZW4gPSBhd2FpdCB0aGlzLl9yZWFkSnNvbjxJQ2xvdWRTYW5kYm94Q2xpZW50VG9rZW4+KGNvbnRleHQpO1xuXHRcdGlmICghY2xpZW50VG9rZW4/LmFjY2Vzc190b2tlbiB8fCAhY2xpZW50VG9rZW4/Lndwc19lbmRwb2ludCB8fCAhY2xpZW50VG9rZW4/LmNsaWVudF9pZCB8fCAhY2xpZW50VG9rZW4/Lmdyb3Vwcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNaXNzaW9uIENvbnRyb2wgJHthY3Rpb259IHJldHVybmVkIGFuIGluY29tcGxldGUgdG9rZW4gcmVzcG9uc2VgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogJ3Rva2VuJywgdG9rZW46IGNsaWVudFRva2VuIH07XG5cdH1cblxuXHQvKipcblx0ICogSXNzdWUgYW4gYWdlbnQtZW52aXJvbm1lbnQgcmVxdWVzdCBhbmQgcmV0dXJuIHRoZSByYXcgcmVzcG9uc2UuIFRoZSBjYWxsZXIgb3ducyBzdGF0dXNcblx0ICogaGFuZGxpbmcsIHNpbmNlIHRoZSBtZWFuaW5nIG9mIGEgc3RhdHVzIGlzIGVuZHBvaW50LXNwZWNpZmljIChub3RhYmx5IEhUVFAgMjAyID0gXCJ3YWtpbmdcIixcblx0ICogd2hpY2ggaXMgbmVpdGhlciBhbiBlcnJvciBub3IgYSByZXN1bHQpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZEVudmlyb25tZW50KFxuXHRcdGFjdGlvbjogQ2xvdWRTYW5kYm94RW52aXJvbm1lbnRBY3Rpb24sXG5cdFx0ZW52aXJvbm1lbnRJZDogc3RyaW5nLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRzZWFyY2hQYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuXHQpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGNvbnN0IHBhdGggPSBhY3Rpb24gPT09ICdnZXQnID8gJycgOiBgLyR7YWN0aW9ufWA7XG5cdFx0Y29uc3QgdXJsID0gYCR7R0lUSFVCX0RPVF9DT01fQ09QSUxPVF9BUElfQkFTRV9VUkl9L2FnZW50cy9lbnZpcm9ubWVudHMvJHtlbmNvZGVVUklDb21wb25lbnQoZW52aXJvbm1lbnRJZCl9JHtwYXRofSR7dG9RdWVyeShzZWFyY2hQYXJhbXMpfWA7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVlc3QodXJsLCBgbWMuZW52aXJvbm1lbnRDbGllbnQuJHthY3Rpb259YCwgYWN0aW9uID09PSAnZ2V0JyA/ICdnZXRFbnZpcm9ubWVudCcgOiBhY3Rpb24sIHtcblx0XHRcdCdDb3BpbG90LUludGVncmF0aW9uLUlkJzogQ09QSUxPVF9JTlRFR1JBVElPTl9JRCxcblx0XHR9LCB0b2tlbik7XG5cdH1cblxuXHQvKiogSXNzdWUgYSB0YXNrIEFQSSByZXF1ZXN0LCB0aHJvd2luZyBvbiBhIG5vbi1zdWNjZXNzIHN0YXR1cy4gKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZFRhc2sodXJsOiBzdHJpbmcsIGFjdGlvbjogJ2xpc3QnIHwgJ2dldCcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVJlcXVlc3RDb250ZXh0PiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX3JlcXVlc3QodXJsLCBgbWMudGFza0NsaWVudC4ke2FjdGlvbn1gLCBhY3Rpb24gPT09ICdsaXN0JyA/ICdsaXN0VGFza3MnIDogJ2dldFRhc2snLCB7XG5cdFx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0J0NvcGlsb3QtSW50ZWdyYXRpb24tSWQnOiBDT1BJTE9UX0lOVEVHUkFUSU9OX0lELFxuXHRcdH0sIHRva2VuLCBESVNDT1ZFUllfVElNRU9VVF9NUyk7XG5cdFx0aWYgKCFpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Rocm93Rm9yU3RhdHVzKGB0YXNrICR7YWN0aW9ufWAsIGNvbnRleHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGV4dDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlcXVlc3QodXJsOiBzdHJpbmcsIGNhbGxTaXRlOiBzdHJpbmcsIGFjdGlvbjogQ2xvdWRTYW5kYm94UmVxdWVzdEFjdGlvbiwgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCB0aW1lb3V0OiBudW1iZXIgPSBSRVFVRVNUX1RJTUVPVVRfTVMpOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdGNvbnN0IGFjY2Vzc1Rva2VuID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUdpdEh1YlRva2VuKCk7XG5cdFx0aWYgKCFhY2Nlc3NUb2tlbikge1xuXHRcdFx0Ly8gTm8gcmVxdWVzdCBpcyBpc3N1ZWQsIHNvIHRoZXJlIGlzIG5vIHJlcXVlc3Qgb3V0Y29tZSB0byBjb3VudC5cblx0XHRcdHRocm93IG5ldyBDbG91ZFNhbmRib3hBdXRoZW50aWNhdGlvblJlcXVpcmVkRXJyb3IoKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBhd2FpdCB0aGlzLl9yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHtcblx0XHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHRcdHVybCxcblx0XHRcdFx0aGVhZGVyczogeyAuLi5oZWFkZXJzLCBbJ0F1dGhvcml6YXRpb24nXTogYEJlYXJlciAke2FjY2Vzc1Rva2VufWAgfSxcblx0XHRcdFx0dGltZW91dCxcblx0XHRcdFx0Y2FsbFNpdGUsXG5cdFx0XHR9LCB0b2tlbik7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnkucmVwb3J0UmVxdWVzdChhY3Rpb24sIHJlcXVlc3RPdXRjb21lRm9yU3RhdHVzKGNvbnRleHQucmVzLnN0YXR1c0NvZGUpKTtcblx0XHRcdHJldHVybiBjb250ZXh0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBBIGNhbmNlbGxlZCByZXF1ZXN0IHdhcyBuZXZlciBhbnN3ZXJlZCwgc28gaXQgaXMgbm90IGEgZmFpbHVyZSB3b3J0aCBjb3VudGluZy5cblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeS5yZXBvcnRSZXF1ZXN0KGFjdGlvbiwgJ25ldHdvcmtFcnJvcicpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtMT0dfUFJFRklYfSBHRVQgJHt1cmx9IGZhaWxlZDogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTWlzc2lvbiBDb250cm9sIHRhc2sgQVBJIGJhc2UuIFVzZXMgdGhlIENvcGlsb3QgQVBJIGhvc3Q6IGBhcGkuZ2l0aHViLmNvbS9hZ2VudHMvKmAgb21pdHNcblx0ICogQ09SUyBoZWFkZXJzIG9uIGF1dGhlbnRpY2F0ZWQgcmVzcG9uc2VzLCBzbyBhIHJlbmRlcmVyIGBmZXRjaGAgcmVjZWl2ZXMgdGhlIHJlcGx5IGFuZCBkaXNjYXJkcyBpdC5cblx0ICovXG5cdHByaXZhdGUgX3Rhc2tzQmFzZVVybCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtHSVRIVUJfRE9UX0NPTV9DT1BJTE9UX0FQSV9CQVNFX1VSSX0vYWdlbnRzYDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRKc29uPFQ+KGNvbnRleHQ6IElSZXF1ZXN0Q29udGV4dCk6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGJvZHkgPSBhd2FpdCBhc1RleHQoY29udGV4dCk7XG5cdFx0aWYgKCFib2R5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoYm9keSkgYXMgVDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFRocm93IGEgZGlhZ25vc2FibGUgZXJyb3IgZm9yIGEgbm9uLXN1Y2Nlc3MgcmVzcG9uc2UsIGluY2x1ZGluZyB0aGUgYm9keSB3aGVuIHJlYWRhYmxlLiAqL1xuXHRwcml2YXRlIGFzeW5jIF90aHJvd0ZvclN0YXR1cyhhY3Rpb246IHN0cmluZywgY29udGV4dDogSVJlcXVlc3RDb250ZXh0KTogUHJvbWlzZTxuZXZlcj4ge1xuXHRcdGNvbnN0IGJvZHkgPSBhd2FpdCBhc1RleHQoY29udGV4dCkuY2F0Y2goKCkgPT4gJycpO1xuXHRcdGNvbnN0IHN0YXR1cyA9IGNvbnRleHQucmVzLnN0YXR1c0NvZGU7XG5cdFx0dGhyb3cgbmV3IENsb3VkU2FuZGJveFJlcXVlc3RFcnJvcihcblx0XHRcdHN0YXR1cyxcblx0XHRcdGBNaXNzaW9uIENvbnRyb2wgJHthY3Rpb259IGZhaWxlZDogSFRUUCAke3N0YXR1cyA/PyAndW5rbm93bid9IC0gJHsoYm9keSA/PyAnJykuc2xpY2UoMCwgMjAwKX1gLFxuXHRcdCk7XG5cdH1cblxuXHQvKiogQSBHaXRIdWIgc2Vzc2lvbiBjYXJyeWluZyBhdCBsZWFzdCB0aGUgY29uZmlndXJlZCBjaGF0IHByb3ZpZGVyIHNjb3Blcy4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUdpdEh1YlRva2VuKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyPy5kZWZhdWx0Py5pZCA/PyAnZ2l0aHViJztcblx0XHRjb25zdCBzY29wZXMgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5wcm92aWRlclNjb3Blcz8uWzBdID8/IEZBTExCQUNLX1NDT1BFUztcblxuXHRcdGxldCBleGFjdDogcmVhZG9ubHkgQXV0aGVudGljYXRpb25TZXNzaW9uW107XG5cdFx0dHJ5IHtcblx0XHRcdGV4YWN0ID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQsIFsuLi5zY29wZXNdLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBUaHJvd3Mgd2hlbiB0aGUgYXV0aCBwcm92aWRlciBleHRlbnNpb24gaGFzIG5vdCByZWdpc3RlcmVkIHlldC5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBnZXRTZXNzaW9ucygnJHtwcm92aWRlcklkfScpIGZhaWxlZDogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoZXhhY3QubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGV4YWN0WzBdLmFjY2Vzc1Rva2VuO1xuXHRcdH1cblxuXHRcdC8vIEZhbGwgYmFjayB0byB0aGUgbmFycm93ZXN0IHNlc3Npb24gd2hvc2Ugc2NvcGVzIGFyZSBhIHN1cGVyc2V0IG9mIHdoYXQgd2UgbmVlZC5cblx0XHRjb25zdCBhbGwgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbnMocHJvdmlkZXJJZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGNvbnN0IHJlcXVpcmVkID0gbmV3IFNldChzY29wZXMpO1xuXHRcdGxldCBiZXN0OiB7IHRva2VuOiBzdHJpbmc7IGV4dHJhOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgYWxsKSB7XG5cdFx0XHRjb25zdCBncmFudGVkID0gbmV3IFNldChzZXNzaW9uLnNjb3Blcyk7XG5cdFx0XHRpZiAoWy4uLnJlcXVpcmVkXS5ldmVyeShzY29wZSA9PiBncmFudGVkLmhhcyhzY29wZSkpKSB7XG5cdFx0XHRcdGNvbnN0IGV4dHJhID0gZ3JhbnRlZC5zaXplIC0gcmVxdWlyZWQuc2l6ZTtcblx0XHRcdFx0aWYgKCFiZXN0IHx8IGV4dHJhIDwgYmVzdC5leHRyYSkge1xuXHRcdFx0XHRcdGJlc3QgPSB7IHRva2VuOiBzZXNzaW9uLmFjY2Vzc1Rva2VuLCBleHRyYSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghYmVzdCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IE5vICcke3Byb3ZpZGVySWR9JyBzZXNzaW9uIHdpdGggc2NvcGVzIFske3Njb3Blcy5qb2luKCcsICcpfV1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGJlc3Q/LnRva2VuO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU3VjY2Vzcyhjb250ZXh0OiBJUmVxdWVzdENvbnRleHQpOiBib29sZWFuIHtcblx0Y29uc3Qgc3RhdHVzID0gY29udGV4dC5yZXMuc3RhdHVzQ29kZSA/PyAwO1xuXHRyZXR1cm4gc3RhdHVzID49IDIwMCAmJiBzdGF0dXMgPCAzMDA7XG59XG5cbmZ1bmN0aW9uIHRvUXVlcnkoc2VhcmNoUGFyYW1zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKCFzZWFyY2hQYXJhbXMpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3Qgc2VhcmNoID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhzZWFyY2hQYXJhbXMpLnRvU3RyaW5nKCk7XG5cdHJldHVybiBzZWFyY2ggPyBgPyR7c2VhcmNofWAgOiAnJztcbn1cblxuLyoqIFBhcnNlIGEgYFJldHJ5LUFmdGVyYCBoZWFkZXIgKGRlbHRhLXNlY29uZHMpOyBmYWxsIGJhY2sgdG8gYSBzbWFsbCBkZWZhdWx0LiAqL1xuZnVuY3Rpb24gcGFyc2VSZXRyeUFmdGVyKHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdGNvbnN0IHJhdyA9IEFycmF5LmlzQXJyYXkodmFsdWUpID8gdmFsdWVbMF0gOiB2YWx1ZTtcblx0aWYgKHJhdykge1xuXHRcdGNvbnN0IHNlY29uZHMgPSBOdW1iZXIucGFyc2VJbnQocmF3LCAxMCk7XG5cdFx0aWYgKE51bWJlci5pc0Zpbml0ZShzZWNvbmRzKSAmJiBzZWNvbmRzID4gMCkge1xuXHRcdFx0cmV0dXJuIHNlY29uZHM7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBERUZBVUxUX1dBS0lOR19SRVRSWV9BRlRFUl9TRUNPTkRTO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgYSB0YXNrIGlzIGEgY2xvdWQgc2FuZGJveCB0YXNrOiBvd25lZCBieSB7QGxpbmsgQ0xPVURfU0FOREJPWF9BR0VOVF9TTFVHfSBhbmQgcnVubmluZyBvblxuICogdGhlIGBzYW5kYm94ZXNgIGNvbXB1dGUgcHJvdmlkZXIuIFJlYWRzIGxpc3QtbGV2ZWwgZmllbGRzIG9ubHkuXG4gKi9cbmZ1bmN0aW9uIGlzQ2xvdWRTYW5kYm94VGFzayh0YXNrOiBJVGFza1N1bW1hcnkpOiBib29sZWFuIHtcblx0Y29uc3QgaXNDbG91ZENvZGluZ0FnZW50ID0gdGFzay5hZ2VudF9jb2xsYWJvcmF0b3JzPy5zb21lKGMgPT4gYy5zbHVnID09PSBDTE9VRF9TQU5EQk9YX0FHRU5UX1NMVUcpID8/IGZhbHNlO1xuXHRyZXR1cm4gaXNDbG91ZENvZGluZ0FnZW50ICYmIHRhc2suY29tcHV0ZT8ucHJvdmlkZXIgPT09ICdzYW5kYm94ZXMnO1xufVxuXG4vKipcbiAqIFRoZSBNaXNzaW9uIENvbnRyb2wgZW52aXJvbm1lbnQgYSBzYW5kYm94IHRhc2sgcnVucyBpbiwgcmVhZCBmcm9tIHRoZSBmdWxsIHRhc2sncyBuZXN0ZWRcbiAqIGBzZXNzaW9uc1tdYC4gVW5kZWZpbmVkIHdoZW4gbm8gc2Vzc2lvbiBpcyBib3VuZCB0byBhbiBlbnZpcm9ubWVudCB5ZXQuXG4gKi9cbmZ1bmN0aW9uIGdldFRhc2tFbnZpcm9ubWVudEJpbmRpbmcodGFzazogSVRhc2tEZXRhaWwpOiB7IGVudmlyb25tZW50SWQ6IHN0cmluZzsgc2Vzc2lvbklkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0YXNrLnNlc3Npb25zID8/IFtdKSB7XG5cdFx0aWYgKHNlc3Npb24uZW52aXJvbm1lbnRfaWQgJiYgc2Vzc2lvbi5lbnZpcm9ubWVudF9pZC5sZW5ndGggPiAwICYmIHNlc3Npb24uaWQubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHsgZW52aXJvbm1lbnRJZDogc2Vzc2lvbi5lbnZpcm9ubWVudF9pZCwgc2Vzc2lvbklkOiBzZXNzaW9uLmlkIH07XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKiBUaGUgYG93bmVyL25hbWVgIHJlcG9zaXRvcnkgZW5jb2RlZCBpbiBhIHRhc2sncyBgaHRtbF91cmxgLCB3aGVuIHBhcnNlYWJsZS4gKi9cbmZ1bmN0aW9uIHBhcnNlUmVwb0Zyb21UYXNrVXJsKGh0bWxVcmw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgb3duZXI6IHN0cmluZzsgbmFtZTogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRpZiAoIWh0bWxVcmwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBuZXcgVVJMKGh0bWxVcmwpLnBhdGhuYW1lLm1hdGNoKC9eXFwvKFteL10rKVxcLyhbXi9dKylcXC8vKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdHJldHVybiB7IG93bmVyOiBtYXRjaFsxXSwgbmFtZTogbWF0Y2hbMl0gfTtcblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIG5vdCBhIHBhcnNlYWJsZSBVUkxcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFFQTtBQUFBLE9BT007QUFDUCxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLFFBQVEsdUJBQXVCO0FBQ3hDLFNBQWdDLDhCQUE4QjtBQUM5RCxTQUFTLCtCQUErQiwrQkFBK0Q7QUFxQnZHLE1BQU0sYUFBYTtBQUduQixNQUFNLHFCQUFxQjtBQUczQixNQUFNLHVCQUF1QjtBQUc3QixNQUFNLHFDQUFxQztBQUczQyxNQUFNLDRCQUE0QjtBQUdsQyxNQUFNLGtCQUFrQixDQUFDLGFBQWEsY0FBYyxRQUFRLFVBQVU7QUFTL0QsSUFBTSxpQ0FBTixjQUE2QyxXQUFzRDtBQUFBLEVBR3pHLFlBQ21DLGlCQUNPLHdCQUNQLGlCQUNKLGFBQ2tCLFlBQy9DO0FBQ0QsVUFBTTtBQU40QjtBQUNPO0FBQ1A7QUFDSjtBQUNrQjtBQUFBLEVBR2pEO0FBQUEsRUFFQSxNQUFNLFFBQVEsU0FBeUMsT0FBOEQ7QUFDcEgsV0FBTyxLQUFLLGdCQUFnQixXQUFXLFFBQVEsZUFBZSxPQUFPO0FBQUEsTUFDcEUsR0FBSSxRQUFRLGFBQWEsRUFBRSxZQUFZLFFBQVEsVUFBVTtBQUFBLElBQzFELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLFVBQVUsU0FBeUMsVUFBa0IsT0FBOEQ7QUFDeEksV0FBTyxLQUFLLGdCQUFnQixhQUFhLFFBQVEsZUFBZSxPQUFPO0FBQUEs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
