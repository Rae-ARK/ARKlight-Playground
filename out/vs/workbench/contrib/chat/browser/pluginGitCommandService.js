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
import { CancellationError } from "../../../../base/common/errors.js";
import { getComparisonKey } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import {
  GitHubAuthRequiredError,
  GitHubRateLimitError,
  fetchAndExtractGitHubRepo,
  parseGitHubCloneUrl,
  resolveGitHubRefToSha
} from "./githubRepoFetcher.js";
const BROWSER_CACHE_STORAGE_KEY = "chat.plugins.browserCache.v1";
let BrowserPluginGitCommandService = class {
  constructor(_fileService, _logService, _requestService, _storageService, _authenticationService) {
    this._fileService = _fileService;
    this._logService = _logService;
    this._requestService = _requestService;
    this._storageService = _storageService;
    this._authenticationService = _authenticationService;
  }
  async cloneRepository(cloneUrl, targetDir, ref, token) {
    const repo = this._parseOrThrow(cloneUrl);
    const cancel = token ?? CancellationToken.None;
    const cloneWithToken = async (authToken) => {
      const sha = await resolveGitHubRefToSha(this._requestService, repo, ref, authToken, cancel);
      await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, sha, targetDir, authToken, cancel);
      this._setCacheEntry(targetDir, { owner: repo.owner, repo: repo.repo, ref, sha, fetchedAt: Date.now() });
    };
    const initialAuthToken = await this._lookupGitHubToken();
    const attempts = [
      async () => initialAuthToken
    ];
    if (initialAuthToken) {
      attempts.push(async () => void 0);
    }
    attempts.push(() => this._requestGitHubToken(repo));
    let lastErr;
    for (const getToken of attempts) {
      if (cancel.isCancellationRequested) {
        throw new CancellationError();
      }
      try {
        await cloneWithToken(await getToken());
        return;
      } catch (err) {
        lastErr = err;
        this._maybeLogTransientError(err, repo);
        if (!(err instanceof GitHubAuthRequiredError)) {
          throw err;
        }
      }
    }
    if (lastErr instanceof GitHubAuthRequiredError) {
      throw new Error(localize(
        "pluginsBrowserGitHubAccessRequired",
        "GitHub authentication is required to install '{0}'. Sign in with an account that has access to this repository, then try again.",
        `${repo.owner}/${repo.repo}`
      ));
    }
    throw lastErr;
  }
  async pull(repoDir, token) {
    const entry = this._getCacheEntry(repoDir);
    if (!entry) {
      throw new Error(`Cannot pull plugin: no cached metadata for ${repoDir.toString()}`);
    }
    const cancel = token ?? CancellationToken.None;
    const authToken = await this._lookupGitHubToken();
    const repo = { owner: entry.owner, repo: entry.repo };
    try {
      const newSha = await resolveGitHubRefToSha(this._requestService, repo, entry.ref, authToken, cancel);
      if (newSha === entry.sha) {
        return false;
      }
      await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, newSha, repoDir, authToken, cancel);
      this._setCacheEntry(repoDir, { ...entry, sha: newSha, fetchedAt: Date.now() });
      return true;
    } catch (err) {
      this._maybeLogTransientError(err, repo);
      throw err;
    }
  }
  async checkout(repoDir, treeish, _detached, token) {
    const entry = this._getCacheEntry(repoDir);
    if (!entry) {
      throw new Error(`Cannot checkout plugin: no cached metadata for ${repoDir.toString()}`);
    }
    const cancel = token ?? CancellationToken.None;
    const authToken = await this._lookupGitHubToken();
    const repo = { owner: entry.owner, repo: entry.repo };
    const requestedRef = treeish.trim();
    const isFullSha = /^[0-9a-f]{40}$/i.test(requestedRef);
    const requestedSha = isFullSha ? requestedRef.toLowerCase() : await resolveGitHubRefToSha(this._requestService, repo, requestedRef, authToken, cancel);
    if (requestedSha === entry.sha.toLowerCase()) {
      return;
    }
    try {
      await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, requestedSha, repoDir, authToken, cancel);
      this._setCacheEntry(repoDir, {
        ...entry,
        ref: isFullSha ? entry.ref : requestedRef,
        sha: requestedSha,
        fetchedAt: Date.now()
      });
    } catch (err) {
      this._maybeLogTransientError(err, repo);
      throw err;
    }
  }
  async revParse(repoDir, ref) {
    const entry = this._getCacheEntry(repoDir);
    if (!entry) {
      throw new Error(`Cannot resolve ref: no cached metadata for ${repoDir.toString()}`);
    }
    const trimmed = ref.trim();
    const isFullSha = /^[0-9a-f]{40}$/i.test(trimmed);
    if (isFullSha && trimmed.toLowerCase() !== entry.sha.toLowerCase()) {
      throw new Error(`Cannot resolve ref '${ref}' in tree-cached plugin: only HEAD/${entry.sha} is materialised`);
    }
    return entry.sha;
  }
  async fetch(_repoDir, _token) {
  }
  async fetchRepository(_repoDir, _token) {
  }
  async revListCount(_repoDir, _fromRef, _toRef) {
    return 0;
  }
  // -- helpers --------------------------------------------------------------
  _parseOrThrow(cloneUrl) {
    const parsed = parseGitHubCloneUrl(cloneUrl);
    if (!parsed) {
      throw new Error(localize(
        "pluginsBrowserUnsupportedHost",
        "Agent plugins in the browser can only be installed from GitHub HTTPS URLs. To install '{0}', use the desktop application or connect to a remote agent host.",
        cloneUrl
      ));
    }
    return parsed;
  }
  _maybeLogTransientError(err, repo) {
    if (err instanceof GitHubAuthRequiredError) {
      this._logService.warn(`[BrowserPluginGitCommandService] GitHub auth required for ${repo.owner}/${repo.repo}: ${err.message}`);
    } else if (err instanceof GitHubRateLimitError) {
      const wait = err.retryAfterSeconds !== void 0 ? ` (retry after ${err.retryAfterSeconds}s)` : "";
      this._logService.warn(`[BrowserPluginGitCommandService] GitHub rate limit hit for ${repo.owner}/${repo.repo}${wait}: ${err.message}`);
    } else if (err instanceof Error) {
      const cause = err.cause instanceof Error ? ` (cause: ${err.cause.name}: ${err.cause.message})` : "";
      this._logService.error(`[BrowserPluginGitCommandService] Clone failed for ${repo.owner}/${repo.repo}: ${err.message}${cause}`);
    }
  }
  /**
   * Best-effort silent lookup of an existing GitHub session token. Returns
   * `undefined` when no session is available; callers fall back to anonymous,
   * which still works for public repos. Prefers a `repo`-scoped session when
   * multiple are present (e.g. EMU + personal).
   */
  async _lookupGitHubToken() {
    try {
      const sessions = await this._authenticationService.getSessions("github", [], { silent: true });
      if (sessions.length === 0) {
        return void 0;
      }
      const repoScopeSession = sessions.find((session) => session.scopes.includes("repo"));
      return repoScopeSession?.accessToken ?? sessions[0].accessToken;
    } catch (err) {
      this._logService.trace("[BrowserPluginGitCommandService] Silent GitHub session lookup failed:", err);
      return void 0;
    }
  }
  async _requestGitHubToken(repo) {
    try {
      const session = await this._authenticationService.createSession("github", ["repo"], { activateImmediate: true });
      return session.accessToken;
    } catch (err) {
      this._logService.trace("[BrowserPluginGitCommandService] GitHub session request failed:", err);
      throw new Error(localize(
        "pluginsBrowserGitHubSignInRequired",
        "Sign in to GitHub with an account that has access to '{0}' to install this plugin.",
        `${repo.owner}/${repo.repo}`
      ));
    }
  }
  // -- metadata cache (IStorageService) -------------------------------------
  _cacheKey(targetDir) {
    return getComparisonKey(targetDir, true);
  }
  async _pruneStaleEntries(cache, knownDirs) {
    const removed = [];
    await Promise.all(Array.from(knownDirs, async ([key, uri]) => {
      try {
        if (!await this._fileService.exists(uri)) {
          removed.push(key);
        }
      } catch {
      }
    }));
    if (removed.length === 0) {
      return;
    }
    for (const key of removed) {
      cache.delete(key);
    }
    this._logService.trace(`[BrowserPluginGitCommandService] Pruned ${removed.length} stale cache entries`);
    this._persistCache();
  }
  _ensureCacheLoaded() {
    if (this._cache) {
      return this._cache;
    }
    const cache = /* @__PURE__ */ new Map();
    const stored = this._storageService.getObject(BROWSER_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
    const knownDirs = /* @__PURE__ */ new Map();
    if (stored) {
      for (const [key, entry] of Object.entries(stored)) {
        if (entry && typeof entry.sha === "string" && typeof entry.owner === "string" && typeof entry.repo === "string") {
          cache.set(key, {
            owner: entry.owner,
            repo: entry.repo,
            ref: typeof entry.ref === "string" ? entry.ref : void 0,
            sha: entry.sha,
            fetchedAt: typeof entry.fetchedAt === "number" ? entry.fetchedAt : 0
          });
          try {
            knownDirs.set(key, URI.parse(key));
          } catch {
            cache.delete(key);
          }
        }
      }
    }
    this._cache = cache;
    if (knownDirs.size > 0) {
      this._pruneStaleEntries(cache, knownDirs).catch((err) => {
        this._logService.trace("[BrowserPluginGitCommandService] Cache prune failed:", err);
      });
    }
    return cache;
  }
  _getCacheEntry(targetDir) {
    return this._ensureCacheLoaded().get(this._cacheKey(targetDir));
  }
  _setCacheEntry(targetDir, entry) {
    const cache = this._ensureCacheLoaded();
    cache.set(this._cacheKey(targetDir), entry);
    this._persistCache();
  }
  _persistCache() {
    if (!this._cache) {
      return;
    }
    const serialized = {};
    for (const [key, entry] of this._cache) {
      serialized[key] = entry;
    }
    if (Object.keys(serialized).length === 0) {
      this._storageService.remove(BROWSER_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
      return;
    }
    this._storageService.store(BROWSER_CACHE_STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
};
BrowserPluginGitCommandService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IRequestService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IAuthenticationService)
], BrowserPluginGitCommandService);
export {
  BrowserPluginGitCommandService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wbHVnaW5HaXRDb21tYW5kU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGdldENvbXBhcmlzb25LZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVBsdWdpbkdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5HaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdEdpdEh1YkF1dGhSZXF1aXJlZEVycm9yLFxuXHRHaXRIdWJSYXRlTGltaXRFcnJvcixcblx0SUdpdEh1YlJlcG9SZWYsXG5cdGZldGNoQW5kRXh0cmFjdEdpdEh1YlJlcG8sXG5cdHBhcnNlR2l0SHViQ2xvbmVVcmwsXG5cdHJlc29sdmVHaXRIdWJSZWZUb1NoYSxcbn0gZnJvbSAnLi9naXRodWJSZXBvRmV0Y2hlci5qcyc7XG5cbi8qKiBTdG9yYWdlIGtleSBmb3IgdGhlIHBlci10YXJnZXQgbWV0YWRhdGEgaW5kZXggdXNlZCBieSB0aGlzIHNlcnZpY2UuICovXG5jb25zdCBCUk9XU0VSX0NBQ0hFX1NUT1JBR0VfS0VZID0gJ2NoYXQucGx1Z2lucy5icm93c2VyQ2FjaGUudjEnO1xuXG4vKipcbiAqIFBlci10YXJnZXQgbWV0YWRhdGEgcGVyc2lzdGVkIHZpYSB7QGxpbmsgSVN0b3JhZ2VTZXJ2aWNlfS4gS2V5ZWQgYnkgdGhlXG4gKiBgdGFyZ2V0RGlyLnRvU3RyaW5nKClgIG9mIHRoZSBjbG9uZWQgcmVwb3NpdG9yeSBzbyB3ZSBjYW4gYW5zd2VyXG4gKiBgcmV2UGFyc2UoJ0hFQUQnKWAgYW5kIGRldGVjdCBcImlzIHRoZSBjYWNoZWQgc25hcHNob3Qgc3RpbGwgY3VycmVudD9cIiBvblxuICogYHB1bGwoKWAgd2l0aG91dCBhbiBleHRyYSBHaXRIdWIgcm91bmQtdHJpcC5cbiAqL1xuaW50ZXJmYWNlIElCcm93c2VyUGx1Z2luQ2FjaGVFbnRyeSB7XG5cdHJlYWRvbmx5IG93bmVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcG86IHN0cmluZztcblx0cmVhZG9ubHkgcmVmPzogc3RyaW5nO1xuXHRyZWFkb25seSBzaGE6IHN0cmluZztcblx0cmVhZG9ubHkgZmV0Y2hlZEF0OiBudW1iZXI7XG59XG5cbnR5cGUgSVN0b3JlZEJyb3dzZXJQbHVnaW5DYWNoZSA9IFJlY29yZDxzdHJpbmcsIElCcm93c2VyUGx1Z2luQ2FjaGVFbnRyeT47XG5cbi8qKlxuICogQnJvd3NlciBpbXBsZW1lbnRhdGlvbiBvZiB7QGxpbmsgSVBsdWdpbkdpdFNlcnZpY2V9LlxuICpcbiAqIGBnaXRgIGlzIG5vdCBhdmFpbGFibGUgaW4gdGhlIGJyb3dzZXIsIHNvIHBsdWdpbiBjb250ZW50cyBhcmUgcmVjb25zdHJ1Y3RlZFxuICogZnJvbSB0aGUgR2l0SHViIFJFU1QgQVBJOiBgL2dpdC90cmVlcy97c2hhfT9yZWN1cnNpdmU9MWAgZm9yIHRoZSBsaXN0aW5nIGFuZFxuICogYC9naXQvYmxvYnMve2Jsb2Jfc2hhfWAgZm9yIGVhY2ggZmlsZSdzIGJ5dGVzLiBCb3RoIGxpdmUgb24gYGFwaS5naXRodWIuY29tYCxcbiAqIHdoaWNoIGlzIHRoZSBvbmx5IEdpdEh1YiBob3N0IHRoYXQgaGFuZGxlcyBDT1JTIHdpdGggYXV0aCBoZWFkZXJzIFx1MjAxNCB0aGVcbiAqIGAvdGFyYmFsbC9gIGVuZHBvaW50IHJlZGlyZWN0cyB0byBgY29kZWxvYWQuZ2l0aHViLmNvbWAgKG5vIENPUlMpIGFuZFxuICogYHJhdy5naXRodWJ1c2VyY29udGVudC5jb21gIHJlamVjdHMgdGhlIE9QVElPTlMgcHJlZmxpZ2h0IGZvcmNlZCBieVxuICogYEF1dGhvcml6YXRpb246IEJlYXJlcmAuXG4gKlxuICogT25seSBIVFRQUyBHaXRIdWIgY2xvbmUgVVJMcyBhcmUgc3VwcG9ydGVkOyBldmVyeXRoaW5nIGVsc2UgdGhyb3dzIGFuXG4gKiBhY3Rpb25hYmxlIGxvY2FsaXplZCBlcnJvciBwb2ludGluZyBhdCBkZXNrdG9wIG9yIGEgcmVtb3RlIGFnZW50IGhvc3QuXG4gKlxuICogUGVyLXRhcmdldCBtZXRhZGF0YSBpcyBwZXJzaXN0ZWQgdmlhIHtAbGluayBJU3RvcmFnZVNlcnZpY2V9IHNvIGByZXZQYXJzZWBcbiAqIGFuc3dlcnMgbG9jYWxseSwgYHB1bGwoKWAgc2tpcHMgdGhlIHJlLWRvd25sb2FkIHdoZW4gdGhlIHVwc3RyZWFtIFNIQSBoYXNcbiAqIG5vdCBtb3ZlZCwgYW5kIHRoZSBwZXJzaXN0ZWQgU0hBIGZlZWRzIGBDdXN0b21pemF0aW9uUmVmLm5vbmNlYCBmb3IgQUhQXG4gKiBkZWR1cGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UgaW1wbGVtZW50cyBJUGx1Z2luR2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2NhY2hlOiBNYXA8c3RyaW5nLCBJQnJvd3NlclBsdWdpbkNhY2hlRW50cnk+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgY2xvbmVSZXBvc2l0b3J5KGNsb25lVXJsOiBzdHJpbmcsIHRhcmdldERpcjogVVJJLCByZWY/OiBzdHJpbmcsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvID0gdGhpcy5fcGFyc2VPclRocm93KGNsb25lVXJsKTtcblx0XHRjb25zdCBjYW5jZWwgPSB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lO1xuXHRcdGNvbnN0IGNsb25lV2l0aFRva2VuID0gYXN5bmMgKGF1dGhUb2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRjb25zdCBzaGEgPSBhd2FpdCByZXNvbHZlR2l0SHViUmVmVG9TaGEodGhpcy5fcmVxdWVzdFNlcnZpY2UsIHJlcG8sIHJlZiwgYXV0aFRva2VuLCBjYW5jZWwpO1xuXHRcdFx0YXdhaXQgZmV0Y2hBbmRFeHRyYWN0R2l0SHViUmVwbyh0aGlzLl9yZXF1ZXN0U2VydmljZSwgdGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UsIHJlcG8sIHNoYSwgdGFyZ2V0RGlyLCBhdXRoVG9rZW4sIGNhbmNlbCk7XG5cdFx0XHR0aGlzLl9zZXRDYWNoZUVudHJ5KHRhcmdldERpciwgeyBvd25lcjogcmVwby5vd25lciwgcmVwbzogcmVwby5yZXBvLCByZWYsIHNoYSwgZmV0Y2hlZEF0OiBEYXRlLm5vdygpIH0pO1xuXHRcdH07XG5cblx0XHQvLyBBdXRoIGxhZGRlcjogc2lnbmVkLWluIHRva2VuIFx1MjE5MiBhbm9ueW1vdXMgXHUyMTkyIGZyZXNobHktcmVxdWVzdGVkIHJlcG8gc2Vzc2lvbi5cblx0XHQvLyBFYWNoIHJ1bmcgb25seSBydW5zIHdoZW4gdGhlIHByZXZpb3VzIG9uZSBmYWlsZWQgd2l0aCBhIDQwMS80MDMgKHRoZVxuXHRcdC8vIGBHaXRIdWJBdXRoUmVxdWlyZWRFcnJvcmApOyBvdGhlciBlcnJvcnMgcHJvcGFnYXRlIGltbWVkaWF0ZWx5LlxuXHRcdGNvbnN0IGluaXRpYWxBdXRoVG9rZW4gPSBhd2FpdCB0aGlzLl9sb29rdXBHaXRIdWJUb2tlbigpO1xuXHRcdGNvbnN0IGF0dGVtcHRzOiBBcnJheTwoKSA9PiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4+ID0gW1xuXHRcdFx0YXN5bmMgKCkgPT4gaW5pdGlhbEF1dGhUb2tlbixcblx0XHRdO1xuXHRcdGlmIChpbml0aWFsQXV0aFRva2VuKSB7XG5cdFx0XHRhdHRlbXB0cy5wdXNoKGFzeW5jICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGF0dGVtcHRzLnB1c2goKCkgPT4gdGhpcy5fcmVxdWVzdEdpdEh1YlRva2VuKHJlcG8pKTtcblxuXHRcdGxldCBsYXN0RXJyOiB1bmtub3duO1xuXHRcdGZvciAoY29uc3QgZ2V0VG9rZW4gb2YgYXR0ZW1wdHMpIHtcblx0XHRcdGlmIChjYW5jZWwuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBjbG9uZVdpdGhUb2tlbihhd2FpdCBnZXRUb2tlbigpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxhc3RFcnIgPSBlcnI7XG5cdFx0XHRcdHRoaXMuX21heWJlTG9nVHJhbnNpZW50RXJyb3IoZXJyLCByZXBvKTtcblx0XHRcdFx0aWYgKCEoZXJyIGluc3RhbmNlb2YgR2l0SHViQXV0aFJlcXVpcmVkRXJyb3IpKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RFcnIgaW5zdGFuY2VvZiBHaXRIdWJBdXRoUmVxdWlyZWRFcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKFxuXHRcdFx0XHQncGx1Z2luc0Jyb3dzZXJHaXRIdWJBY2Nlc3NSZXF1aXJlZCcsXG5cdFx0XHRcdFwiR2l0SHViIGF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkIHRvIGluc3RhbGwgJ3swfScuIFNpZ24gaW4gd2l0aCBhbiBhY2NvdW50IHRoYXQgaGFzIGFjY2VzcyB0byB0aGlzIHJlcG9zaXRvcnksIHRoZW4gdHJ5IGFnYWluLlwiLFxuXHRcdFx0XHRgJHtyZXBvLm93bmVyfS8ke3JlcG8ucmVwb31gLFxuXHRcdFx0KSk7XG5cdFx0fVxuXHRcdHRocm93IGxhc3RFcnI7XG5cdH1cblxuXHRhc3luYyBwdWxsKHJlcG9EaXI6IFVSSSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZ2V0Q2FjaGVFbnRyeShyZXBvRGlyKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBwdWxsIHBsdWdpbjogbm8gY2FjaGVkIG1ldGFkYXRhIGZvciAke3JlcG9EaXIudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgY2FuY2VsID0gdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZTtcblx0XHRjb25zdCBhdXRoVG9rZW4gPSBhd2FpdCB0aGlzLl9sb29rdXBHaXRIdWJUb2tlbigpO1xuXHRcdGNvbnN0IHJlcG86IElHaXRIdWJSZXBvUmVmID0geyBvd25lcjogZW50cnkub3duZXIsIHJlcG86IGVudHJ5LnJlcG8gfTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbmV3U2hhID0gYXdhaXQgcmVzb2x2ZUdpdEh1YlJlZlRvU2hhKHRoaXMuX3JlcXVlc3RTZXJ2aWNlLCByZXBvLCBlbnRyeS5yZWYsIGF1dGhUb2tlbiwgY2FuY2VsKTtcblx0XHRcdGlmIChuZXdTaGEgPT09IGVudHJ5LnNoYSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBmZXRjaEFuZEV4dHJhY3RHaXRIdWJSZXBvKHRoaXMuX3JlcXVlc3RTZXJ2aWNlLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgcmVwbywgbmV3U2hhLCByZXBvRGlyLCBhdXRoVG9rZW4sIGNhbmNlbCk7XG5cdFx0XHR0aGlzLl9zZXRDYWNoZUVudHJ5KHJlcG9EaXIsIHsgLi4uZW50cnksIHNoYTogbmV3U2hhLCBmZXRjaGVkQXQ6IERhdGUubm93KCkgfSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX21heWJlTG9nVHJhbnNpZW50RXJyb3IoZXJyLCByZXBvKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjaGVja291dChyZXBvRGlyOiBVUkksIHRyZWVpc2g6IHN0cmluZywgX2RldGFjaGVkPzogYm9vbGVhbiwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZ2V0Q2FjaGVFbnRyeShyZXBvRGlyKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjaGVja291dCBwbHVnaW46IG5vIGNhY2hlZCBtZXRhZGF0YSBmb3IgJHtyZXBvRGlyLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FuY2VsID0gdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZTtcblx0XHRjb25zdCBhdXRoVG9rZW4gPSBhd2FpdCB0aGlzLl9sb29rdXBHaXRIdWJUb2tlbigpO1xuXHRcdGNvbnN0IHJlcG86IElHaXRIdWJSZXBvUmVmID0geyBvd25lcjogZW50cnkub3duZXIsIHJlcG86IGVudHJ5LnJlcG8gfTtcblx0XHRjb25zdCByZXF1ZXN0ZWRSZWYgPSB0cmVlaXNoLnRyaW0oKTtcblxuXHRcdC8vIDQwLWhleCBTSEEgcmVmcyBza2lwIHRoZSByZXNvbHZlU2hhIHJvdW5kLXRyaXAgKGNsb25lIHBpbnMgdG8gdGhlIFNIQSBhbHJlYWR5KS5cblx0XHRjb25zdCBpc0Z1bGxTaGEgPSAvXlswLTlhLWZdezQwfSQvaS50ZXN0KHJlcXVlc3RlZFJlZik7XG5cdFx0Y29uc3QgcmVxdWVzdGVkU2hhID0gaXNGdWxsU2hhXG5cdFx0XHQ/IHJlcXVlc3RlZFJlZi50b0xvd2VyQ2FzZSgpXG5cdFx0XHQ6IGF3YWl0IHJlc29sdmVHaXRIdWJSZWZUb1NoYSh0aGlzLl9yZXF1ZXN0U2VydmljZSwgcmVwbywgcmVxdWVzdGVkUmVmLCBhdXRoVG9rZW4sIGNhbmNlbCk7XG5cblx0XHRpZiAocmVxdWVzdGVkU2hhID09PSBlbnRyeS5zaGEudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmZXRjaEFuZEV4dHJhY3RHaXRIdWJSZXBvKHRoaXMuX3JlcXVlc3RTZXJ2aWNlLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgcmVwbywgcmVxdWVzdGVkU2hhLCByZXBvRGlyLCBhdXRoVG9rZW4sIGNhbmNlbCk7XG5cdFx0XHR0aGlzLl9zZXRDYWNoZUVudHJ5KHJlcG9EaXIsIHtcblx0XHRcdFx0Li4uZW50cnksXG5cdFx0XHRcdHJlZjogaXNGdWxsU2hhID8gZW50cnkucmVmIDogcmVxdWVzdGVkUmVmLFxuXHRcdFx0XHRzaGE6IHJlcXVlc3RlZFNoYSxcblx0XHRcdFx0ZmV0Y2hlZEF0OiBEYXRlLm5vdygpLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9tYXliZUxvZ1RyYW5zaWVudEVycm9yKGVyciwgcmVwbyk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmV2UGFyc2UocmVwb0RpcjogVVJJLCByZWY6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9nZXRDYWNoZUVudHJ5KHJlcG9EaXIpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgcmVmOiBubyBjYWNoZWQgbWV0YWRhdGEgZm9yICR7cmVwb0Rpci50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHQvLyBSZWplY3QgdW5yZWxhdGVkIFNIQXMgc28gY2FsbGVycyBub3RpY2UgdGhleSBnb3QgYSBjYWNoZSBoaXQgaW5zdGVhZCBvZiBgZ2l0IHJldi1wYXJzZWAuXG5cdFx0Y29uc3QgdHJpbW1lZCA9IHJlZi50cmltKCk7XG5cdFx0Y29uc3QgaXNGdWxsU2hhID0gL15bMC05YS1mXXs0MH0kL2kudGVzdCh0cmltbWVkKTtcblx0XHRpZiAoaXNGdWxsU2hhICYmIHRyaW1tZWQudG9Mb3dlckNhc2UoKSAhPT0gZW50cnkuc2hhLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlc29sdmUgcmVmICcke3JlZn0nIGluIHRyZWUtY2FjaGVkIHBsdWdpbjogb25seSBIRUFELyR7ZW50cnkuc2hhfSBpcyBtYXRlcmlhbGlzZWRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJ5LnNoYTtcblx0fVxuXG5cdGFzeW5jIGZldGNoKF9yZXBvRGlyOiBVUkksIF90b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTm8tb3A6IHRoZXJlIGlzIG5vIGxvY2FsIGdpdCBkYXRhYmFzZS4gYHB1bGwoKWAgcmUtZmV0Y2hlcyB3aGVuIG5lZWRlZC5cblx0fVxuXG5cdGFzeW5jIGZldGNoUmVwb3NpdG9yeShfcmVwb0RpcjogVVJJLCBfdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE5vLW9wIGZvciB0aGUgc2FtZSByZWFzb24gYXMgYGZldGNoKClgLlxuXHR9XG5cblx0YXN5bmMgcmV2TGlzdENvdW50KF9yZXBvRGlyOiBVUkksIF9mcm9tUmVmOiBzdHJpbmcsIF90b1JlZjogc3RyaW5nKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHQvLyBObyBjb21taXQgaGlzdG9yeSBhdmFpbGFibGUgaW4gdGhlIGNhY2hlOyAwIG1lYW5zIFwidXAgdG8gZGF0ZVwiIHRvXG5cdFx0Ly8gdGhlIHNpbGVudC1mZXRjaCBjYWxsZXIgaW4gYEFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuZmV0Y2hSZXBvc2l0b3J5YC5cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdC8vIC0tIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9wYXJzZU9yVGhyb3coY2xvbmVVcmw6IHN0cmluZyk6IElHaXRIdWJSZXBvUmVmIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUdpdEh1YkNsb25lVXJsKGNsb25lVXJsKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKFxuXHRcdFx0XHQncGx1Z2luc0Jyb3dzZXJVbnN1cHBvcnRlZEhvc3QnLFxuXHRcdFx0XHRcIkFnZW50IHBsdWdpbnMgaW4gdGhlIGJyb3dzZXIgY2FuIG9ubHkgYmUgaW5zdGFsbGVkIGZyb20gR2l0SHViIEhUVFBTIFVSTHMuIFRvIGluc3RhbGwgJ3swfScsIHVzZSB0aGUgZGVza3RvcCBhcHBsaWNhdGlvbiBvciBjb25uZWN0IHRvIGEgcmVtb3RlIGFnZW50IGhvc3QuXCIsXG5cdFx0XHRcdGNsb25lVXJsLFxuXHRcdFx0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9tYXliZUxvZ1RyYW5zaWVudEVycm9yKGVycjogdW5rbm93biwgcmVwbzogSUdpdEh1YlJlcG9SZWYpOiB2b2lkIHtcblx0XHRpZiAoZXJyIGluc3RhbmNlb2YgR2l0SHViQXV0aFJlcXVpcmVkRXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0Jyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZV0gR2l0SHViIGF1dGggcmVxdWlyZWQgZm9yICR7cmVwby5vd25lcn0vJHtyZXBvLnJlcG99OiAke2Vyci5tZXNzYWdlfWApO1xuXHRcdH0gZWxzZSBpZiAoZXJyIGluc3RhbmNlb2YgR2l0SHViUmF0ZUxpbWl0RXJyb3IpIHtcblx0XHRcdGNvbnN0IHdhaXQgPSBlcnIucmV0cnlBZnRlclNlY29uZHMgIT09IHVuZGVmaW5lZCA/IGAgKHJldHJ5IGFmdGVyICR7ZXJyLnJldHJ5QWZ0ZXJTZWNvbmRzfXMpYCA6ICcnO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlXSBHaXRIdWIgcmF0ZSBsaW1pdCBoaXQgZm9yICR7cmVwby5vd25lcn0vJHtyZXBvLnJlcG99JHt3YWl0fTogJHtlcnIubWVzc2FnZX1gKTtcblx0XHR9IGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHQvLyBTdXJmYWNlIHRoZSBVUkwgKyBjYXVzZSBzbyBvcGFxdWUgYFR5cGVFcnJvcjogRmFpbGVkIHRvIGZldGNoYCBlcnJvcnNcblx0XHRcdC8vIChDT1JTLCBETlMsIG9mZmxpbmUpIGRvbid0IHJlYWNoIHRoZSB1c2VyIHdpdGhvdXQgY29udGV4dC5cblx0XHRcdGNvbnN0IGNhdXNlID0gZXJyLmNhdXNlIGluc3RhbmNlb2YgRXJyb3IgPyBgIChjYXVzZTogJHtlcnIuY2F1c2UubmFtZX06ICR7ZXJyLmNhdXNlLm1lc3NhZ2V9KWAgOiAnJztcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2VdIENsb25lIGZhaWxlZCBmb3IgJHtyZXBvLm93bmVyfS8ke3JlcG8ucmVwb306ICR7ZXJyLm1lc3NhZ2V9JHtjYXVzZX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQmVzdC1lZmZvcnQgc2lsZW50IGxvb2t1cCBvZiBhbiBleGlzdGluZyBHaXRIdWIgc2Vzc2lvbiB0b2tlbi4gUmV0dXJuc1xuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIG5vIHNlc3Npb24gaXMgYXZhaWxhYmxlOyBjYWxsZXJzIGZhbGwgYmFjayB0byBhbm9ueW1vdXMsXG5cdCAqIHdoaWNoIHN0aWxsIHdvcmtzIGZvciBwdWJsaWMgcmVwb3MuIFByZWZlcnMgYSBgcmVwb2Atc2NvcGVkIHNlc3Npb24gd2hlblxuXHQgKiBtdWx0aXBsZSBhcmUgcHJlc2VudCAoZS5nLiBFTVUgKyBwZXJzb25hbCkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9sb29rdXBHaXRIdWJUb2tlbigpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucygnZ2l0aHViJywgW10sIHsgc2lsZW50OiB0cnVlIH0pO1xuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVwb1Njb3BlU2Vzc2lvbiA9IHNlc3Npb25zLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLnNjb3Blcy5pbmNsdWRlcygncmVwbycpKTtcblx0XHRcdHJldHVybiByZXBvU2NvcGVTZXNzaW9uPy5hY2Nlc3NUb2tlbiA/PyBzZXNzaW9uc1swXS5hY2Nlc3NUb2tlbjtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2VdIFNpbGVudCBHaXRIdWIgc2Vzc2lvbiBsb29rdXAgZmFpbGVkOicsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlcXVlc3RHaXRIdWJUb2tlbihyZXBvOiBJR2l0SHViUmVwb1JlZik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuY3JlYXRlU2Vzc2lvbignZ2l0aHViJywgWydyZXBvJ10sIHsgYWN0aXZhdGVJbW1lZGlhdGU6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbi5hY2Nlc3NUb2tlbjtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2VdIEdpdEh1YiBzZXNzaW9uIHJlcXVlc3QgZmFpbGVkOicsIGVycik7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoXG5cdFx0XHRcdCdwbHVnaW5zQnJvd3NlckdpdEh1YlNpZ25JblJlcXVpcmVkJyxcblx0XHRcdFx0XCJTaWduIGluIHRvIEdpdEh1YiB3aXRoIGFuIGFjY291bnQgdGhhdCBoYXMgYWNjZXNzIHRvICd7MH0nIHRvIGluc3RhbGwgdGhpcyBwbHVnaW4uXCIsXG5cdFx0XHRcdGAke3JlcG8ub3duZXJ9LyR7cmVwby5yZXBvfWAsXG5cdFx0XHQpKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBtZXRhZGF0YSBjYWNoZSAoSVN0b3JhZ2VTZXJ2aWNlKSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfY2FjaGVLZXkodGFyZ2V0RGlyOiBVUkkpOiBzdHJpbmcge1xuXHRcdC8vIE5vcm1hbGlzZSB0cmFpbGluZyBzbGFzaGVzIC8gcGVyY2VudC1lbmNvZGluZyBjYXNlIHNvIHNlbWFudGljYWxseS1lcXVpdmFsZW50IFVSSXMgaGl0IHRoZSBzYW1lIGVudHJ5LlxuXHRcdHJldHVybiBnZXRDb21wYXJpc29uS2V5KHRhcmdldERpciwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wcnVuZVN0YWxlRW50cmllcyhjYWNoZTogTWFwPHN0cmluZywgSUJyb3dzZXJQbHVnaW5DYWNoZUVudHJ5Piwga25vd25EaXJzOiBSZWFkb25seU1hcDxzdHJpbmcsIFVSST4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBCZXN0LWVmZm9ydCBiYWNrZ3JvdW5kIHN3ZWVwIG9mIGNhY2hlIGVudHJpZXMgd2hvc2UgdGFyZ2V0IGRpciBub1xuXHRcdC8vIGxvbmdlciBleGlzdHM7IHRoZSBuZXh0IHJlYWQgZm9yIGEgcmVtb3ZlZCBrZXkgd291bGQgcmUtY2xvbmUgYW55d2F5LlxuXHRcdGNvbnN0IHJlbW92ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbShrbm93bkRpcnMsIGFzeW5jIChba2V5LCB1cmldKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoIShhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHModXJpKSkpIHtcblx0XHRcdFx0XHRyZW1vdmVkLnB1c2goa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSAtLSB0cmVhdCBhcyBzdGlsbC1wcmVzZW50IHJhdGhlciB0aGFuIHJpc2sgYSBmYWxzZS1wb3NpdGl2ZSByZW1vdmFsXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmIChyZW1vdmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGtleSBvZiByZW1vdmVkKSB7XG5cdFx0XHRjYWNoZS5kZWxldGUoa2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0Jyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZV0gUHJ1bmVkICR7cmVtb3ZlZC5sZW5ndGh9IHN0YWxlIGNhY2hlIGVudHJpZXNgKTtcblx0XHR0aGlzLl9wZXJzaXN0Q2FjaGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUNhY2hlTG9hZGVkKCk6IE1hcDxzdHJpbmcsIElCcm93c2VyUGx1Z2luQ2FjaGVFbnRyeT4ge1xuXHRcdGlmICh0aGlzLl9jYWNoZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NhY2hlO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBJQnJvd3NlclBsdWdpbkNhY2hlRW50cnk+KCk7XG5cdFx0Y29uc3Qgc3RvcmVkID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0PElTdG9yZWRCcm93c2VyUGx1Z2luQ2FjaGU+KEJST1dTRVJfQ0FDSEVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0Y29uc3Qga25vd25EaXJzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0XHRpZiAoc3RvcmVkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiBPYmplY3QuZW50cmllcyhzdG9yZWQpKSB7XG5cdFx0XHRcdGlmIChlbnRyeSAmJiB0eXBlb2YgZW50cnkuc2hhID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgZW50cnkub3duZXIgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBlbnRyeS5yZXBvID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNhY2hlLnNldChrZXksIHtcblx0XHRcdFx0XHRcdG93bmVyOiBlbnRyeS5vd25lcixcblx0XHRcdFx0XHRcdHJlcG86IGVudHJ5LnJlcG8sXG5cdFx0XHRcdFx0XHRyZWY6IHR5cGVvZiBlbnRyeS5yZWYgPT09ICdzdHJpbmcnID8gZW50cnkucmVmIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0c2hhOiBlbnRyeS5zaGEsXG5cdFx0XHRcdFx0XHRmZXRjaGVkQXQ6IHR5cGVvZiBlbnRyeS5mZXRjaGVkQXQgPT09ICdudW1iZXInID8gZW50cnkuZmV0Y2hlZEF0IDogMCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0a25vd25EaXJzLnNldChrZXksIFVSSS5wYXJzZShrZXkpKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIGludmFsaWQgc3RvcmVkIGtleSAtLSBkcm9wIGl0IG9uIHRoZSBmbG9vciBhdCBuZXh0IHBlcnNpc3Rcblx0XHRcdFx0XHRcdGNhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jYWNoZSA9IGNhY2hlO1xuXHRcdC8vIEZpcmUtYW5kLWZvcmdldCBwcnVuZSBvZiBkaXJzIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IG9uIGRpc2suXG5cdFx0aWYgKGtub3duRGlycy5zaXplID4gMCkge1xuXHRcdFx0dGhpcy5fcHJ1bmVTdGFsZUVudHJpZXMoY2FjaGUsIGtub3duRGlycykuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0Jyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZV0gQ2FjaGUgcHJ1bmUgZmFpbGVkOicsIGVycik7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGNhY2hlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q2FjaGVFbnRyeSh0YXJnZXREaXI6IFVSSSk6IElCcm93c2VyUGx1Z2luQ2FjaGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZUNhY2hlTG9hZGVkKCkuZ2V0KHRoaXMuX2NhY2hlS2V5KHRhcmdldERpcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q2FjaGVFbnRyeSh0YXJnZXREaXI6IFVSSSwgZW50cnk6IElCcm93c2VyUGx1Z2luQ2FjaGVFbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IGNhY2hlID0gdGhpcy5fZW5zdXJlQ2FjaGVMb2FkZWQoKTtcblx0XHRjYWNoZS5zZXQodGhpcy5fY2FjaGVLZXkodGFyZ2V0RGlyKSwgZW50cnkpO1xuXHRcdHRoaXMuX3BlcnNpc3RDYWNoZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdENhY2hlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY2FjaGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VyaWFsaXplZDogSVN0b3JlZEJyb3dzZXJQbHVnaW5DYWNoZSA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIHRoaXMuX2NhY2hlKSB7XG5cdFx0XHRzZXJpYWxpemVkW2tleV0gPSBlbnRyeTtcblx0XHR9XG5cdFx0aWYgKE9iamVjdC5rZXlzKHNlcmlhbGl6ZWQpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEJST1dTRVJfQ0FDSEVfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKEJST1dTRVJfQ0FDSEVfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWQpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsOEJBQThCO0FBRXZDO0FBQUEsRUFD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
