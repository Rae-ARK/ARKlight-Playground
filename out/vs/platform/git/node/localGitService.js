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
import * as cp from "child_process";
import { CancellationError } from "../../../base/common/errors.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILogService } from "../../log/common/log.js";
let LocalGitService = class {
  constructor(_logService, _execFile = cp.execFile) {
    this._logService = _logService;
    this._execFile = _execFile;
    this._runningProcesses = /* @__PURE__ */ new Map();
  }
  _exec(operationId, args, cwd) {
    return new Promise((resolve, reject) => {
      this._logService.trace(`[LocalGitService] git ${args.join(" ")}${cwd ? ` (cwd: ${cwd})` : ""}`);
      const proc = this._execFile("git", args, { cwd, encoding: "utf8" }, (err, stdout, stderr) => {
        if (!this._runningProcesses.delete(operationId)) {
          reject(new CancellationError());
          return;
        }
        if (err) {
          this._logService.error(`[LocalGitService] git ${args[0]} failed:`, err.message, stderr);
          reject(err);
          return;
        }
        resolve(stdout);
      });
      this._runningProcesses.set(operationId, proc);
    });
  }
  async clone(operationId, cloneUrl, targetPath, ref) {
    const args = ["clone"];
    if (ref) {
      args.push("--branch", ref);
    }
    args.push("--", cloneUrl, targetPath);
    await this._exec(operationId, args);
  }
  async pull(operationId, repoPath, options) {
    const before = (await this._exec(operationId, ["rev-parse", "HEAD"], repoPath)).trim();
    try {
      await this._exec(operationId, ["pull", "--ff-only"], repoPath);
    } catch (err) {
      if (!this._isFastForwardPullFailure(err)) {
        throw err;
      }
      const error = err;
      this._logService.warn(`[LocalGitService] Fast-forward pull failed for ${repoPath}: ${error?.message ?? String(err)}. Retrying after fetch.`);
      await this._exec(operationId, ["fetch", "--prune"], repoPath);
      try {
        await this._exec(operationId, ["pull", "--ff-only"], repoPath);
      } catch (retryErr) {
        if (!this._isFastForwardPullFailure(retryErr)) {
          throw retryErr;
        }
        if (!options?.allowHardResetOnDivergence) {
          throw retryErr;
        }
        const upstream = await this._getSafeHardResetTarget(operationId, repoPath);
        if (!upstream) {
          throw retryErr;
        }
        this._logService.warn(`[LocalGitService] Pull retries exhausted for ${repoPath}. Performing hard reset to ${upstream}.`);
        await this._exec(operationId, ["reset", "--hard", upstream], repoPath);
      }
    }
    const after = (await this._exec(operationId, ["rev-parse", "HEAD"], repoPath)).trim();
    return before !== after;
  }
  _isFastForwardPullFailure(err) {
    const error = err;
    if (error?.code !== 128) {
      return false;
    }
    const details = `${error.stderr ?? ""}
${error.message ?? ""}`;
    return /not possible to fast-forward|non-fast-forward/i.test(details);
  }
  async _getSafeHardResetTarget(operationId, repoPath) {
    const status = (await this._exec(operationId, ["status", "--porcelain"], repoPath)).trim();
    if (status.length > 0) {
      return void 0;
    }
    let upstream;
    try {
      upstream = (await this._exec(operationId, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], repoPath)).trim();
    } catch {
      return void 0;
    }
    const behind = await this._revListCount(operationId, repoPath, "HEAD", "@{u}");
    const ahead = await this._revListCount(operationId, repoPath, "@{u}", "HEAD");
    if (ahead === void 0 || behind === void 0 || ahead <= 0 || behind <= 0) {
      return void 0;
    }
    return upstream;
  }
  async _revListCount(operationId, repoPath, fromRef, toRef) {
    const result = await this._exec(operationId, ["rev-list", "--count", `${fromRef}..${toRef}`], repoPath);
    const parsed = Number(result.trim());
    if (!Number.isFinite(parsed)) {
      this._logService.warn(`[LocalGitService] Failed to parse rev-list count for ${fromRef}..${toRef} in ${repoPath}: ${result}`);
      return void 0;
    }
    return parsed;
  }
  async checkout(operationId, repoPath, treeish, detached) {
    const args = detached ? ["checkout", "--detach", treeish] : ["checkout", treeish];
    await this._exec(operationId, args, repoPath);
  }
  async revParse(repoPath, ref) {
    return (await this._exec(generateUuid(), ["rev-parse", ref], repoPath)).trim();
  }
  async fetch(operationId, repoPath) {
    await this._exec(operationId, ["fetch"], repoPath);
  }
  async revListCount(repoPath, fromRef, toRef) {
    const result = await this._exec(generateUuid(), ["rev-list", "--count", `${fromRef}..${toRef}`], repoPath);
    return Number(result.trim()) || 0;
  }
  async cancel(operationId) {
    const proc = this._runningProcesses.get(operationId);
    if (proc) {
      this._runningProcesses.delete(operationId);
      proc.kill();
    }
  }
};
LocalGitService = __decorateClass([
  __decorateParam(0, ILogService)
], LocalGitService);
export {
  LocalGitService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2dpdC9ub2RlL2xvY2FsR2l0U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJR2l0UHVsbE9wdGlvbnMsIElMb2NhbEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbG9jYWxHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY2xhc3MgTG9jYWxHaXRTZXJ2aWNlIGltcGxlbWVudHMgSUxvY2FsR2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3J1bm5pbmdQcm9jZXNzZXMgPSBuZXcgTWFwPHN0cmluZywgY3AuQ2hpbGRQcm9jZXNzPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leGVjRmlsZTogdHlwZW9mIGNwLmV4ZWNGaWxlID0gY3AuZXhlY0ZpbGUsXG5cdCkgeyB9XG5cblx0cHJpdmF0ZSBfZXhlYyhvcGVyYXRpb25JZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgY3dkPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0xvY2FsR2l0U2VydmljZV0gZ2l0ICR7YXJncy5qb2luKCcgJyl9JHtjd2QgPyBgIChjd2Q6ICR7Y3dkfSlgIDogJyd9YCk7XG5cdFx0XHRjb25zdCBwcm9jID0gdGhpcy5fZXhlY0ZpbGUoJ2dpdCcsIGFyZ3MsIHsgY3dkLCBlbmNvZGluZzogJ3V0ZjgnIH0sIChlcnIsIHN0ZG91dCwgc3RkZXJyKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fcnVubmluZ1Byb2Nlc3Nlcy5kZWxldGUob3BlcmF0aW9uSWQpKSB7XG5cdFx0XHRcdFx0cmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtMb2NhbEdpdFNlcnZpY2VdIGdpdCAke2FyZ3NbMF19IGZhaWxlZDpgLCBlcnIubWVzc2FnZSwgc3RkZXJyKTtcblx0XHRcdFx0XHRyZWplY3QoZXJyKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX3J1bm5pbmdQcm9jZXNzZXMuc2V0KG9wZXJhdGlvbklkLCBwcm9jKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGNsb25lKG9wZXJhdGlvbklkOiBzdHJpbmcsIGNsb25lVXJsOiBzdHJpbmcsIHRhcmdldFBhdGg6IHN0cmluZywgcmVmPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXJncyA9IFsnY2xvbmUnXTtcblx0XHRpZiAocmVmKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tYnJhbmNoJywgcmVmKTtcblx0XHR9XG5cdFx0YXJncy5wdXNoKCctLScsIGNsb25lVXJsLCB0YXJnZXRQYXRoKTtcblx0XHRhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBhcmdzKTtcblx0fVxuXG5cdGFzeW5jIHB1bGwob3BlcmF0aW9uSWQ6IHN0cmluZywgcmVwb1BhdGg6IHN0cmluZywgb3B0aW9ucz86IElHaXRQdWxsT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGJlZm9yZSA9IChhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHJlcG9QYXRoKSkudHJpbSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2V4ZWMob3BlcmF0aW9uSWQsIFsncHVsbCcsICctLWZmLW9ubHknXSwgcmVwb1BhdGgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKCF0aGlzLl9pc0Zhc3RGb3J3YXJkUHVsbEZhaWx1cmUoZXJyKSkge1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVycm9yID0gZXJyIGFzIHsgbWVzc2FnZT86IHN0cmluZyB9O1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTG9jYWxHaXRTZXJ2aWNlXSBGYXN0LWZvcndhcmQgcHVsbCBmYWlsZWQgZm9yICR7cmVwb1BhdGh9OiAke2Vycm9yPy5tZXNzYWdlID8/IFN0cmluZyhlcnIpfS4gUmV0cnlpbmcgYWZ0ZXIgZmV0Y2guYCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ2ZldGNoJywgJy0tcHJ1bmUnXSwgcmVwb1BhdGgpO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIHJlcG9QYXRoKTtcblx0XHRcdH0gY2F0Y2ggKHJldHJ5RXJyKSB7XG5cdFx0XHRcdGlmICghdGhpcy5faXNGYXN0Rm9yd2FyZFB1bGxGYWlsdXJlKHJldHJ5RXJyKSkge1xuXHRcdFx0XHRcdHRocm93IHJldHJ5RXJyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFvcHRpb25zPy5hbGxvd0hhcmRSZXNldE9uRGl2ZXJnZW5jZSkge1xuXHRcdFx0XHRcdHRocm93IHJldHJ5RXJyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdXBzdHJlYW0gPSBhd2FpdCB0aGlzLl9nZXRTYWZlSGFyZFJlc2V0VGFyZ2V0KG9wZXJhdGlvbklkLCByZXBvUGF0aCk7XG5cdFx0XHRcdGlmICghdXBzdHJlYW0pIHtcblx0XHRcdFx0XHR0aHJvdyByZXRyeUVycjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xvY2FsR2l0U2VydmljZV0gUHVsbCByZXRyaWVzIGV4aGF1c3RlZCBmb3IgJHtyZXBvUGF0aH0uIFBlcmZvcm1pbmcgaGFyZCByZXNldCB0byAke3Vwc3RyZWFtfS5gKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZXhlYyhvcGVyYXRpb25JZCwgWydyZXNldCcsICctLWhhcmQnLCB1cHN0cmVhbV0sIHJlcG9QYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhZnRlciA9IChhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHJlcG9QYXRoKSkudHJpbSgpO1xuXHRcdHJldHVybiBiZWZvcmUgIT09IGFmdGVyO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNGYXN0Rm9yd2FyZFB1bGxGYWlsdXJlKGVycjogdW5rbm93bik6IGVyciBpcyBjcC5FeGVjRmlsZUV4Y2VwdGlvbiAmIHsgc3RkZXJyPzogc3RyaW5nIH0ge1xuXHRcdGNvbnN0IGVycm9yID0gZXJyIGFzIChjcC5FeGVjRmlsZUV4Y2VwdGlvbiAmIHsgc3RkZXJyPzogc3RyaW5nOyBtZXNzYWdlPzogc3RyaW5nIH0pIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChlcnJvcj8uY29kZSAhPT0gMTI4KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGV0YWlscyA9IGAke2Vycm9yLnN0ZGVyciA/PyAnJ31cXG4ke2Vycm9yLm1lc3NhZ2UgPz8gJyd9YDtcblx0XHRyZXR1cm4gL25vdCBwb3NzaWJsZSB0byBmYXN0LWZvcndhcmR8bm9uLWZhc3QtZm9yd2FyZC9pLnRlc3QoZGV0YWlscyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRTYWZlSGFyZFJlc2V0VGFyZ2V0KG9wZXJhdGlvbklkOiBzdHJpbmcsIHJlcG9QYXRoOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHN0YXR1cyA9IChhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ3N0YXR1cycsICctLXBvcmNlbGFpbiddLCByZXBvUGF0aCkpLnRyaW0oKTtcblx0XHRpZiAoc3RhdHVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHVwc3RyZWFtOiBzdHJpbmc7XG5cdFx0dHJ5IHtcblx0XHRcdHVwc3RyZWFtID0gKGF3YWl0IHRoaXMuX2V4ZWMob3BlcmF0aW9uSWQsIFsncmV2LXBhcnNlJywgJy0tYWJicmV2LXJlZicsICctLXN5bWJvbGljLWZ1bGwtbmFtZScsICdAe3V9J10sIHJlcG9QYXRoKSkudHJpbSgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBiZWhpbmQgPSBhd2FpdCB0aGlzLl9yZXZMaXN0Q291bnQob3BlcmF0aW9uSWQsIHJlcG9QYXRoLCAnSEVBRCcsICdAe3V9Jyk7XG5cdFx0Y29uc3QgYWhlYWQgPSBhd2FpdCB0aGlzLl9yZXZMaXN0Q291bnQob3BlcmF0aW9uSWQsIHJlcG9QYXRoLCAnQHt1fScsICdIRUFEJyk7XG5cdFx0aWYgKGFoZWFkID09PSB1bmRlZmluZWQgfHwgYmVoaW5kID09PSB1bmRlZmluZWQgfHwgYWhlYWQgPD0gMCB8fCBiZWhpbmQgPD0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdXBzdHJlYW07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXZMaXN0Q291bnQob3BlcmF0aW9uSWQ6IHN0cmluZywgcmVwb1BhdGg6IHN0cmluZywgZnJvbVJlZjogc3RyaW5nLCB0b1JlZjogc3RyaW5nKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBbJ3Jldi1saXN0JywgJy0tY291bnQnLCBgJHtmcm9tUmVmfS4uJHt0b1JlZn1gXSwgcmVwb1BhdGgpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IE51bWJlcihyZXN1bHQudHJpbSgpKTtcblx0XHRpZiAoIU51bWJlci5pc0Zpbml0ZShwYXJzZWQpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMb2NhbEdpdFNlcnZpY2VdIEZhaWxlZCB0byBwYXJzZSByZXYtbGlzdCBjb3VudCBmb3IgJHtmcm9tUmVmfS4uJHt0b1JlZn0gaW4gJHtyZXBvUGF0aH06ICR7cmVzdWx0fWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyc2VkO1xuXHR9XG5cblx0YXN5bmMgY2hlY2tvdXQob3BlcmF0aW9uSWQ6IHN0cmluZywgcmVwb1BhdGg6IHN0cmluZywgdHJlZWlzaDogc3RyaW5nLCBkZXRhY2hlZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhcmdzID0gZGV0YWNoZWRcblx0XHRcdD8gWydjaGVja291dCcsICctLWRldGFjaCcsIHRyZWVpc2hdXG5cdFx0XHQ6IFsnY2hlY2tvdXQnLCB0cmVlaXNoXTtcblx0XHRhd2FpdCB0aGlzLl9leGVjKG9wZXJhdGlvbklkLCBhcmdzLCByZXBvUGF0aCk7XG5cdH1cblxuXHRhc3luYyByZXZQYXJzZShyZXBvUGF0aDogc3RyaW5nLCByZWY6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9leGVjKGdlbmVyYXRlVXVpZCgpLCBbJ3Jldi1wYXJzZScsIHJlZl0sIHJlcG9QYXRoKSkudHJpbSgpO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2gob3BlcmF0aW9uSWQ6IHN0cmluZywgcmVwb1BhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2V4ZWMob3BlcmF0aW9uSWQsIFsnZmV0Y2gnXSwgcmVwb1BhdGgpO1xuXHR9XG5cblx0YXN5bmMgcmV2TGlzdENvdW50KHJlcG9QYXRoOiBzdHJpbmcsIGZyb21SZWY6IHN0cmluZywgdG9SZWY6IHN0cmluZyk6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZXhlYyhnZW5lcmF0ZVV1aWQoKSwgWydyZXYtbGlzdCcsICctLWNvdW50JywgYCR7ZnJvbVJlZn0uLiR7dG9SZWZ9YF0sIHJlcG9QYXRoKTtcblx0XHRyZXR1cm4gTnVtYmVyKHJlc3VsdC50cmltKCkpIHx8IDA7XG5cdH1cblxuXHRhc3luYyBjYW5jZWwob3BlcmF0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb2MgPSB0aGlzLl9ydW5uaW5nUHJvY2Vzc2VzLmdldChvcGVyYXRpb25JZCk7XG5cdFx0aWYgKHByb2MpIHtcblx0XHRcdHRoaXMuX3J1bm5pbmdQcm9jZXNzZXMuZGVsZXRlKG9wZXJhdGlvbklkKTtcblx0XHRcdHByb2Mua2lsbCgpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxtQkFBbUI7QUFFckIsSUFBTSxrQkFBTixNQUFrRDtBQUFBLEVBS3hELFlBQytCLGFBQ2IsWUFBZ0MsR0FBRyxVQUNuRDtBQUY2QjtBQUNiO0FBSmxCLFNBQVEsb0JBQW9CLG9CQUFJLElBQTZCO0FBQUEsRUFLekQ7QUFBQSxFQUVJLE1BQU0sYUFBcUIsTUFBZ0IsS0FBK0I7QUFDakYsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsV0FBSyxZQUFZLE1BQU0seUJBQXlCLEtBQUssS0FBSyxHQUFHLENBQUMsR0FBRyxNQUFNLFVBQVUsR0FBRyxNQUFNLEVBQUUsRUFBRTtBQUM5RixZQUFNLE9BQU8sS0FBSyxVQUFVLE9BQU8sTUFBTSxFQUFFLEtBQUssVUFBVSxPQUFPLEdBQUcsQ0FBQyxLQUFLLFFBQVEsV0FBVztBQUM1RixZQUFJLENBQUMsS0FBSyxrQkFBa0IsT0FBTyxXQUFXLEdBQUc7QUFDaEQsaUJBQU8sSUFBSSxrQkFBa0IsQ0FBQztBQUM5QjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLEtBQUs7QUFDUixlQUFLLFlBQVksTUFBTSx5QkFBeUIsS0FBSyxDQUFDLENBQUMsWUFBWSxJQUFJLFNBQVMsTUFBTTtBQUN0RixpQkFBTyxHQUFHO0FBQ1Y7QUFBQSxRQUNEO0FBQ0EsZ0JBQVEsTUFBTTtBQUFBLE1BQ2YsQ0FBQztBQUVELFdBQUssa0JBQWtCLElBQUksYUFBYSxJQUFJO0FBQUEsSUFDN0MsQ0FBQztBQUFB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
