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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRequestService, asJson } from "../../../../platform/request/common/request.js";
import { IAuthenticationService } from "../../../../workbench/services/authentication/common/authentication.js";
const LOG_PREFIX = "[GitHubApiClient]";
const TRACE_PREFIX = "[PR-ICON-TRACE]";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_GRAPHQL_ENDPOINT = `${GITHUB_API_BASE}/graphql`;
class GitHubApiError extends Error {
  constructor(message, statusCode, rateLimitRemaining) {
    super(message);
    this.statusCode = statusCode;
    this.rateLimitRemaining = rateLimitRemaining;
    this.name = "GitHubApiError";
  }
}
let GitHubApiClient = class extends Disposable {
  constructor(_requestService, _authenticationService, _logService) {
    super();
    this._requestService = _requestService;
    this._authenticationService = _authenticationService;
    this._logService = _logService;
  }
  async request(method, path, callSite, options) {
    return this._request(method, `${GITHUB_API_BASE}${path}`, path, "application/vnd.github.v3+json", callSite, options);
  }
  async graphql(query, callSite, variables) {
    const response = await this._request(
      "POST",
      GITHUB_GRAPHQL_ENDPOINT,
      "/graphql",
      "application/vnd.github+json",
      callSite,
      { data: { query, variables } }
    );
    if (response.data?.errors?.length) {
      throw new GitHubApiError(
        response.data.errors.map((error) => error.message).join("; "),
        200,
        void 0
      );
    }
    if (!response.data?.data) {
      throw new GitHubApiError("GitHub GraphQL response did not include data", 200, void 0);
    }
    return response.data.data;
  }
  async _request(method, url, pathForLogging, accept, callSite, options) {
    const token = await this._getAuthToken();
    this._logService.trace(`${LOG_PREFIX} ${method} ${pathForLogging}`);
    this._logService.trace(`${TRACE_PREFIX} [GitHubApiClient] -> ${method} ${pathForLogging} (callSite ${callSite}${options?.etag !== void 0 ? `, ifNoneMatch ${options.etag}` : ""})`);
    const response = await this._requestService.request({
      type: method,
      url,
      headers: {
        "Authorization": `token ${token}`,
        "Accept": accept,
        "User-Agent": "VSCode-Sessions-GitHub",
        ...options?.etag !== void 0 ? { "If-None-Match": options.etag } : {},
        ...options?.data !== void 0 ? { "Content-Type": "application/json" } : {}
      },
      data: options?.data !== void 0 ? JSON.stringify(options.data) : void 0,
      // Bypass the renderer HTTP cache so conditional polling reaches GitHub (see PR_ICON_POLLING.md).
      disableCache: true,
      callSite
    }, CancellationToken.None);
    const rateLimitRemaining = parseRateLimitHeader(response.res.headers?.["x-ratelimit-remaining"]);
    if (rateLimitRemaining !== void 0 && rateLimitRemaining < 100) {
      this._logService.warn(`${LOG_PREFIX} GitHub API rate limit low: ${rateLimitRemaining} remaining`);
    }
    const statusCode = response.res.statusCode ?? 0;
    const responseETag = response.res.headers?.["etag"];
    this._logService.trace(`${TRACE_PREFIX} [GitHubApiClient] <- ${method} ${pathForLogging} status ${statusCode}${responseETag ? `, etag ${responseETag}` : ""}${rateLimitRemaining !== void 0 ? `, rateLimitRemaining ${rateLimitRemaining}` : ""} (callSite ${callSite})`);
    if (statusCode === 204 || statusCode === 304) {
      return { data: void 0, statusCode, etag: responseETag };
    }
    if (statusCode < 200 || statusCode >= 300) {
      const errorBody = await asJson(response).catch(() => void 0);
      throw new GitHubApiError(
        errorBody?.message ?? `GitHub API request failed: ${method} ${pathForLogging} (${statusCode})`,
        statusCode,
        rateLimitRemaining
      );
    }
    const data = await asJson(response);
    if (!data) {
      throw new GitHubApiError(
        `Failed to parse response for ${method} ${pathForLogging}`,
        statusCode,
        rateLimitRemaining
      );
    }
    return { data, statusCode, etag: responseETag };
  }
  async _getAuthToken() {
    let sessions = await this._authenticationService.getSessions("github", [], { silent: true });
    if (!sessions || sessions.length === 0) {
      sessions = await this._authenticationService.getSessions("github", [], { createIfNone: true });
    }
    if (!sessions || sessions.length === 0) {
      throw new Error("No GitHub authentication sessions available");
    }
    const repoScopeSession = sessions.find((session) => session.scopes.includes("repo"));
    return repoScopeSession?.accessToken ?? sessions[0].accessToken ?? "";
  }
};
GitHubApiClient = __decorateClass([
  __decorateParam(0, IRequestService),
  __decorateParam(1, IAuthenticationService),
  __decorateParam(2, ILogService)
], GitHubApiClient);
function parseRateLimitHeader(value) {
  if (value === void 0) {
    return void 0;
  }
  const str = Array.isArray(value) ? value[0] : value;
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? void 0 : parsed;
}
export {
  GitHubApiClient,
  GitHubApiError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL2Jyb3dzZXIvZ2l0aHViQXBpQ2xpZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0U2VydmljZSwgYXNKc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5cbmNvbnN0IExPR19QUkVGSVggPSAnW0dpdEh1YkFwaUNsaWVudF0nO1xuY29uc3QgVFJBQ0VfUFJFRklYID0gJ1tQUi1JQ09OLVRSQUNFXSc7XG5jb25zdCBHSVRIVUJfQVBJX0JBU0UgPSAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbSc7XG5jb25zdCBHSVRIVUJfR1JBUEhRTF9FTkRQT0lOVCA9IGAke0dJVEhVQl9BUElfQkFTRX0vZ3JhcGhxbGA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdpdEh1YkFwaVJlcXVlc3RPcHRpb25zIHtcblx0cmVhZG9ubHkgZGF0YT86IHVua25vd247XG5cdHJlYWRvbmx5IGV0YWc/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdpdEh1YkFwaVJlc3BvbnNlPFQ+IHtcblx0cmVhZG9ubHkgZGF0YTogVCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc3RhdHVzQ29kZTogbnVtYmVyO1xuXHRyZWFkb25seSBldGFnPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUdpdEh1YkdyYXBoUUxFcnJvciB7XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElHaXRIdWJHcmFwaFFMUmVzcG9uc2U8VD4ge1xuXHRyZWFkb25seSBkYXRhPzogVDtcblx0cmVhZG9ubHkgZXJyb3JzPzogcmVhZG9ubHkgSUdpdEh1YkdyYXBoUUxFcnJvcltdO1xufVxuXG5leHBvcnQgY2xhc3MgR2l0SHViQXBpRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1lc3NhZ2U6IHN0cmluZyxcblx0XHRyZWFkb25seSBzdGF0dXNDb2RlOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgcmF0ZUxpbWl0UmVtYWluaW5nOiBudW1iZXIgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHRcdHRoaXMubmFtZSA9ICdHaXRIdWJBcGlFcnJvcic7XG5cdH1cbn1cblxuLyoqXG4gKiBMb3ctbGV2ZWwgR2l0SHViIFJFU1QgQVBJIGNsaWVudC4gSGFuZGxlcyBhdXRoZW50aWNhdGlvbixcbiAqIHJlcXVlc3QgY29uc3RydWN0aW9uLCBhbmQgZXJyb3IgY2xhc3NpZmljYXRpb24uXG4gKlxuICogVGhpcyBjbGFzcyBpcyBzdGF0ZWxlc3Mgd2l0aCByZXNwZWN0IHRvIGRvbWFpbiBkYXRhIFx1MjAxNCBpdCBvbmx5XG4gKiBtYW5hZ2VzIGF1dGggdG9rZW5zIGFuZCByYXcgSFRUUCBjb21tdW5pY2F0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgR2l0SHViQXBpQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyByZXF1ZXN0PFQ+KG1ldGhvZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIGNhbGxTaXRlOiBzdHJpbmcsIG9wdGlvbnM/OiBJR2l0SHViQXBpUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElHaXRIdWJBcGlSZXNwb25zZTxUPj4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXF1ZXN0PFQ+KG1ldGhvZCwgYCR7R0lUSFVCX0FQSV9CQVNFfSR7cGF0aH1gLCBwYXRoLCAnYXBwbGljYXRpb24vdm5kLmdpdGh1Yi52Mytqc29uJywgY2FsbFNpdGUsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgZ3JhcGhxbDxUPihxdWVyeTogc3RyaW5nLCBjYWxsU2l0ZTogc3RyaW5nLCB2YXJpYWJsZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5fcmVxdWVzdDxJR2l0SHViR3JhcGhRTFJlc3BvbnNlPFQ+Pihcblx0XHRcdCdQT1NUJyxcblx0XHRcdEdJVEhVQl9HUkFQSFFMX0VORFBPSU5ULFxuXHRcdFx0Jy9ncmFwaHFsJyxcblx0XHRcdCdhcHBsaWNhdGlvbi92bmQuZ2l0aHViK2pzb24nLFxuXHRcdFx0Y2FsbFNpdGUsXG5cdFx0XHR7IGRhdGE6IHsgcXVlcnksIHZhcmlhYmxlcyB9IH1cblx0XHQpO1xuXG5cdFx0aWYgKHJlc3BvbnNlLmRhdGE/LmVycm9ycz8ubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgR2l0SHViQXBpRXJyb3IoXG5cdFx0XHRcdHJlc3BvbnNlLmRhdGEuZXJyb3JzLm1hcChlcnJvciA9PiBlcnJvci5tZXNzYWdlKS5qb2luKCc7ICcpLFxuXHRcdFx0XHQyMDAsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNwb25zZS5kYXRhPy5kYXRhKSB7XG5cdFx0XHR0aHJvdyBuZXcgR2l0SHViQXBpRXJyb3IoJ0dpdEh1YiBHcmFwaFFMIHJlc3BvbnNlIGRpZCBub3QgaW5jbHVkZSBkYXRhJywgMjAwLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNwb25zZS5kYXRhLmRhdGE7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXF1ZXN0PFQ+KG1ldGhvZDogc3RyaW5nLCB1cmw6IHN0cmluZywgcGF0aEZvckxvZ2dpbmc6IHN0cmluZywgYWNjZXB0OiBzdHJpbmcsIGNhbGxTaXRlOiBzdHJpbmcsIG9wdGlvbnM/OiBJR2l0SHViQXBpUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElHaXRIdWJBcGlSZXNwb25zZTxUPj4ge1xuXHRcdGNvbnN0IHRva2VuID0gYXdhaXQgdGhpcy5fZ2V0QXV0aFRva2VuKCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9ICR7bWV0aG9kfSAke3BhdGhGb3JMb2dnaW5nfWApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7VFJBQ0VfUFJFRklYfSBbR2l0SHViQXBpQ2xpZW50XSAtPiAke21ldGhvZH0gJHtwYXRoRm9yTG9nZ2luZ30gKGNhbGxTaXRlICR7Y2FsbFNpdGV9JHtvcHRpb25zPy5ldGFnICE9PSB1bmRlZmluZWQgPyBgLCBpZk5vbmVNYXRjaCAke29wdGlvbnMuZXRhZ31gIDogJyd9KWApO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHtcblx0XHRcdHR5cGU6IG1ldGhvZCxcblx0XHRcdHVybCxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgdG9rZW4gJHt0b2tlbn1gLFxuXHRcdFx0XHQnQWNjZXB0JzogYWNjZXB0LFxuXHRcdFx0XHQnVXNlci1BZ2VudCc6ICdWU0NvZGUtU2Vzc2lvbnMtR2l0SHViJyxcblx0XHRcdFx0Li4uKG9wdGlvbnM/LmV0YWcgIT09IHVuZGVmaW5lZCA/IHsgJ0lmLU5vbmUtTWF0Y2gnOiBvcHRpb25zLmV0YWcgfSA6IHt9KSxcblx0XHRcdFx0Li4uKG9wdGlvbnM/LmRhdGEgIT09IHVuZGVmaW5lZCA/IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9IDoge30pLFxuXHRcdFx0fSxcblx0XHRcdGRhdGE6IG9wdGlvbnM/LmRhdGEgIT09IHVuZGVmaW5lZCA/IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuZGF0YSkgOiB1bmRlZmluZWQsXG5cdFx0XHQvLyBCeXBhc3MgdGhlIHJlbmRlcmVyIEhUVFAgY2FjaGUgc28gY29uZGl0aW9uYWwgcG9sbGluZyByZWFjaGVzIEdpdEh1YiAoc2VlIFBSX0lDT05fUE9MTElORy5tZCkuXG5cdFx0XHRkaXNhYmxlQ2FjaGU6IHRydWUsXG5cdFx0XHRjYWxsU2l0ZVxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3QgcmF0ZUxpbWl0UmVtYWluaW5nID0gcGFyc2VSYXRlTGltaXRIZWFkZXIocmVzcG9uc2UucmVzLmhlYWRlcnM/LlsneC1yYXRlbGltaXQtcmVtYWluaW5nJ10pO1xuXHRcdGlmIChyYXRlTGltaXRSZW1haW5pbmcgIT09IHVuZGVmaW5lZCAmJiByYXRlTGltaXRSZW1haW5pbmcgPCAxMDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBHaXRIdWIgQVBJIHJhdGUgbGltaXQgbG93OiAke3JhdGVMaW1pdFJlbWFpbmluZ30gcmVtYWluaW5nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdHVzQ29kZSA9IHJlc3BvbnNlLnJlcy5zdGF0dXNDb2RlID8/IDA7XG5cdFx0Y29uc3QgcmVzcG9uc2VFVGFnID0gcmVzcG9uc2UucmVzLmhlYWRlcnM/LlsnZXRhZyddO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtUUkFDRV9QUkVGSVh9IFtHaXRIdWJBcGlDbGllbnRdIDwtICR7bWV0aG9kfSAke3BhdGhGb3JMb2dnaW5nfSBzdGF0dXMgJHtzdGF0dXNDb2RlfSR7cmVzcG9uc2VFVGFnID8gYCwgZXRhZyAke3Jlc3BvbnNlRVRhZ31gIDogJyd9JHtyYXRlTGltaXRSZW1haW5pbmcgIT09IHVuZGVmaW5lZCA/IGAsIHJhdGVMaW1pdFJlbWFpbmluZyAke3JhdGVMaW1pdFJlbWFpbmluZ31gIDogJyd9IChjYWxsU2l0ZSAke2NhbGxTaXRlfSlgKTtcblxuXHRcdGlmIChcblx0XHRcdHN0YXR1c0NvZGUgPT09IDIwNCAvKiBObyBDb250ZW50ICovIHx8XG5cdFx0XHRzdGF0dXNDb2RlID09PSAzMDQgLyogTm90IE1vZGlmaWVkICovXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB1bmRlZmluZWQsIHN0YXR1c0NvZGUsIGV0YWc6IHJlc3BvbnNlRVRhZyB9O1xuXHRcdH1cblxuXHRcdGlmIChzdGF0dXNDb2RlIDwgMjAwIHx8IHN0YXR1c0NvZGUgPj0gMzAwKSB7XG5cdFx0XHRjb25zdCBlcnJvckJvZHkgPSBhd2FpdCBhc0pzb248eyBtZXNzYWdlPzogc3RyaW5nIH0+KHJlc3BvbnNlKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0dGhyb3cgbmV3IEdpdEh1YkFwaUVycm9yKFxuXHRcdFx0XHRlcnJvckJvZHk/Lm1lc3NhZ2UgPz8gYEdpdEh1YiBBUEkgcmVxdWVzdCBmYWlsZWQ6ICR7bWV0aG9kfSAke3BhdGhGb3JMb2dnaW5nfSAoJHtzdGF0dXNDb2RlfSlgLFxuXHRcdFx0XHRzdGF0dXNDb2RlLFxuXHRcdFx0XHRyYXRlTGltaXRSZW1haW5pbmcsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBhc0pzb248VD4ocmVzcG9uc2UpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhyb3cgbmV3IEdpdEh1YkFwaUVycm9yKFxuXHRcdFx0XHRgRmFpbGVkIHRvIHBhcnNlIHJlc3BvbnNlIGZvciAke21ldGhvZH0gJHtwYXRoRm9yTG9nZ2luZ31gLFxuXHRcdFx0XHRzdGF0dXNDb2RlLFxuXHRcdFx0XHRyYXRlTGltaXRSZW1haW5pbmcsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGRhdGEsIHN0YXR1c0NvZGUsIGV0YWc6IHJlc3BvbnNlRVRhZyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0QXV0aFRva2VuKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0bGV0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInLCBbXSwgeyBzaWxlbnQ6IHRydWUgfSk7XG5cdFx0aWYgKCFzZXNzaW9ucyB8fCBzZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHNlc3Npb25zID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKCdnaXRodWInLCBbXSwgeyBjcmVhdGVJZk5vbmU6IHRydWUgfSk7XG5cdFx0fVxuXHRcdGlmICghc2Vzc2lvbnMgfHwgc2Vzc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIEdpdEh1YiBhdXRoZW50aWNhdGlvbiBzZXNzaW9ucyBhdmFpbGFibGUnKTtcblx0XHR9XG5cblx0XHQvLyBQcmVmZXIgYSBzZXNzaW9uIHdpdGggJ3JlcG8nIHNjb3BlLCBidXQgZmFsbCBiYWNrIHRvIHRoZSBmaXJzdCBhdmFpbGFibGUgc2Vzc2lvblxuXHRcdGNvbnN0IHJlcG9TY29wZVNlc3Npb24gPSBzZXNzaW9ucy5maW5kKHNlc3Npb24gPT4gc2Vzc2lvbi5zY29wZXMuaW5jbHVkZXMoJ3JlcG8nKSk7XG5cdFx0cmV0dXJuIHJlcG9TY29wZVNlc3Npb24/LmFjY2Vzc1Rva2VuID8/IHNlc3Npb25zWzBdLmFjY2Vzc1Rva2VuID8/ICcnO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBhcnNlUmF0ZUxpbWl0SGVhZGVyKHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdHIgPSBBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlWzBdIDogdmFsdWU7XG5cdGNvbnN0IHBhcnNlZCA9IHBhcnNlSW50KHN0ciwgMTApO1xuXHRyZXR1cm4gaXNOYU4ocGFyc2VkKSA/IHVuZGVmaW5lZCA6IHBhcnNlZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxp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
