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
import { basename } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IAgentService } from "../common/agentService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from "../common/state/sessionProtocol.js";
import { readSessionGitState } from "../common/state/sessionState.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { CopilotApiError, ICopilotApiService } from "./shared/copilotApiService.js";
const MAX_CHANGE_SUMMARY_PROMPT_CHARS = 2e4;
let AgentHostCommitOperationHandler = class {
  constructor(_getSessionState, _onCommitted, _agentService, _gitHubEndpointService, _gitService, _copilotApiService, _logService) {
    this._getSessionState = _getSessionState;
    this._onCommitted = _onCommitted;
    this._agentService = _agentService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._gitService = _gitService;
    this._copilotApiService = _copilotApiService;
    this._logService = _logService;
  }
  async invoke(params, token) {
    const abortController = new AbortController();
    if (token.isCancellationRequested) {
      abortController.abort();
    }
    const cancellationListener = token.onCancellationRequested(() => abortController.abort());
    try {
      return await this._invoke(params, token, abortController.signal);
    } finally {
      cancellationListener.dispose();
    }
  }
  async _invoke(params, token, signal) {
    const parsed = parseChangesetUri(params.channel);
    if (!parsed) {
      throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not an uncommitted changeset URI: ${params.channel}`);
    }
    this._throwIfCancelled(token);
    const sessionUri = parsed.sessionUri;
    const sessionState = this._getSessionState(sessionUri);
    if (!sessionState) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
    }
    const workingDirectoryStr = sessionState.workingDirectories?.[0];
    if (!workingDirectoryStr) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
    }
    const workingDirectory = URI.parse(workingDirectoryStr);
    const gitState = readSessionGitState(sessionState._meta);
    if (!gitState) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session's working directory is not a git repo: ${sessionUri}`);
    }
    const hasUncommitted = await this._gitService.hasUncommittedChanges(workingDirectory);
    if (!hasUncommitted) {
      return { message: { markdown: localize("agentHost.changeset.commit.noChanges", "No uncommitted changes to commit.") } };
    }
    this._throwIfCancelled(token);
    const copilotResource = this._gitHubEndpointService.getCopilotResource();
    const authToken = this._agentService.getAuthToken({
      resource: copilotResource.resource,
      scopes: copilotResource.scopes_supported
    });
    if (!authToken) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        localize("agentHost.changeset.commit.authRequired", "Sign in to GitHub Copilot to generate a commit message."),
        [copilotResource]
      );
    }
    const diffs = await this._gitService.computeSessionFileDiffs(workingDirectory, { sessionUri });
    if (!diffs || diffs.length === 0) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.commit.diffFailed", "Could not compute uncommitted changes to generate a commit message."));
    }
    this._throwIfCancelled(token);
    let message;
    try {
      message = this._cleanCommitMessage(await this._copilotApiService.utilityChatCompletion(authToken, {
        messages: this._buildCommitMessagePrompt(workingDirectory, gitState.branchName, diffs)
      }, { signal }));
    } catch (err) {
      this._throwIfCancelled(token);
      if (this._isAuthFailure(err)) {
        throw new ProtocolError(
          AHP_AUTH_REQUIRED,
          localize("agentHost.changeset.commit.authExpired", "Authentication is required to generate a commit message. Please sign in to GitHub Copilot and try again."),
          [copilotResource]
        );
      }
      throw err;
    }
    if (!message) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.commit.emptyMessage", "Generated commit message was empty."));
    }
    this._throwIfCancelled(token);
    this._logService.info(`[AgentHostCommitOperationHandler] Committing uncommitted changes for session ${sessionUri}`);
    try {
      await this._gitService.commitAll(workingDirectory, message);
    } catch (err) {
      this._throwIfCancelled(token);
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to commit changes: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await this._onCommitted(sessionUri);
    } catch (err) {
      this._logService.warn(`[AgentHostCommitOperationHandler] Post-commit refresh failed for session ${sessionUri}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { message: { markdown: localize("agentHost.changeset.commit.committed", "Committed changes with message: `{0}`", message.split("\n")[0]) } };
  }
  _buildCommitMessagePrompt(workingDirectory, branchName, diffs) {
    const changeSummary = this._summarizeDiffsForPrompt(diffs);
    return [
      {
        role: "system",
        content: [
          "You generate concise Git commit messages.",
          "Return only the commit message text, with no markdown or code fences.",
          "Use imperative mood. Keep the subject line under 72 characters.",
          "Add a body only when it helps explain multiple related changes."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          `Repository: ${basename(workingDirectory)}`,
          `Branch: ${branchName ?? "unknown"}`,
          "Changed files:",
          changeSummary
        ].join("\n")
      }
    ];
  }
  _summarizeDiffsForPrompt(diffs) {
    const lines = [];
    for (const diff of diffs) {
      const before = diff.before?.uri;
      const after = diff.after?.uri;
      const path = after ?? before ?? "(unknown)";
      let kind = "Edit";
      if (!before && after) {
        kind = "Create";
      } else if (before && !after) {
        kind = "Delete";
      } else if (before && after && before !== after) {
        kind = "Rename";
      }
      lines.push(`- ${kind}: ${this._displayUri(path)} (+${diff.diff?.added ?? 0} -${diff.diff?.removed ?? 0})`);
      if (lines.join("\n").length > MAX_CHANGE_SUMMARY_PROMPT_CHARS) {
        lines.push("[file list truncated]");
        break;
      }
    }
    return lines.join("\n");
  }
  _displayUri(uri) {
    try {
      const parsed = URI.parse(uri);
      return parsed.scheme === "file" ? parsed.fsPath : parsed.path || uri;
    } catch {
      return uri;
    }
  }
  _cleanCommitMessage(raw) {
    let text = raw.trim().replace(/\r\n/g, "\n");
    const fenced = /^```(?:text|gitcommit)?\s*([\s\S]*?)\s*```$/i.exec(text);
    if (fenced) {
      text = fenced[1].trim();
    }
    return text;
  }
  _isAuthFailure(err) {
    if (err instanceof CopilotApiError) {
      return err.status === 401 || err.status === 403;
    }
    const message = err instanceof Error ? err.message : String(err);
    return /\b(401|403)\b/.test(message) && /\b(auth|authorization|unauthorized|forbidden|token|copilot endpoint discovery|copilot session token mint)\b/i.test(message);
  }
  _throwIfCancelled(token) {
    if (token.isCancellationRequested) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.commit.cancelled", "Commit operation was cancelled."));
    }
  }
};
AgentHostCommitOperationHandler.OPERATION_COMMIT = "commit";
AgentHostCommitOperationHandler = __decorateClass([
  __decorateParam(2, IAgentService),
  __decorateParam(3, IAgentHostGitHubEndpointService),
  __decorateParam(4, IAgentHostGitService),
  __decorateParam(5, ICopilotApiService),
  __decorateParam(6, ILogService)
], AgentHostCommitOperationHandler);
export {
  AgentHostCommitOperationHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyB0eXBlIElDaGFuZ2VzZXRPcGVyYXRpb25IYW5kbGVyIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25QYXJhbXMsIEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1jaGFuZ2VzZXQvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQUhQX0FVVEhfUkVRVUlSRUQsIEFIUF9TRVNTSU9OX05PVF9GT1VORCwgSnNvblJwY0Vycm9yQ29kZXMsIFByb3RvY29sRXJyb3IgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IHJlYWRTZXNzaW9uR2l0U3RhdGUsIHR5cGUgSVNlc3Npb25GaWxlRGlmZiwgdHlwZSBTZXNzaW9uU3RhdGUgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb3BpbG90QXBpRXJyb3IsIElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcblxuY29uc3QgTUFYX0NIQU5HRV9TVU1NQVJZX1BST01QVF9DSEFSUyA9IDIwXzAwMDtcblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXIgaW1wbGVtZW50cyBJQ2hhbmdlc2V0T3BlcmF0aW9uSGFuZGxlciB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBPUEVSQVRJT05fQ09NTUlUID0gJ2NvbW1pdCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0U2Vzc2lvblN0YXRlOiAoc2Vzc2lvbktleTogc3RyaW5nKSA9PiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25Db21taXR0ZWQ6IChzZXNzaW9uS2V5OiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD4sXG5cdFx0QElBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRTZXJ2aWNlOiBJQWdlbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YkVuZHBvaW50U2VydmljZTogSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpbnZva2UocGFyYW1zOiBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25QYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0YWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNhbmNlbGxhdGlvbkxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gYWJvcnRDb250cm9sbGVyLmFib3J0KCkpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5faW52b2tlKHBhcmFtcywgdG9rZW4sIGFib3J0Q29udHJvbGxlci5zaWduYWwpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxsYXRpb25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW52b2tlKHBhcmFtczogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhbmdlc2V0VXJpKHBhcmFtcy5jaGFubmVsKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcywgYE5vdCBhbiB1bmNvbW1pdHRlZCBjaGFuZ2VzZXQgVVJJOiAke3BhcmFtcy5jaGFubmVsfWApO1xuXHRcdH1cblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBwYXJzZWQuc2Vzc2lvblVyaTtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKCFzZXNzaW9uU3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25Vcml9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeVN0ciA9IHNlc3Npb25TdGF0ZS53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnlTdHIpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGBTZXNzaW9uIGhhcyBubyB3b3JraW5nIGRpcmVjdG9yeTogJHtzZXNzaW9uVXJpfWApO1xuXHRcdH1cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKHdvcmtpbmdEaXJlY3RvcnlTdHIpO1xuXG5cdFx0Y29uc3QgZ2l0U3RhdGUgPSByZWFkU2Vzc2lvbkdpdFN0YXRlKHNlc3Npb25TdGF0ZS5fbWV0YSk7XG5cdFx0aWYgKCFnaXRTdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgYFNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSBpcyBub3QgYSBnaXQgcmVwbzogJHtzZXNzaW9uVXJpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1VuY29tbWl0dGVkID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5oYXNVbmNvbW1pdHRlZENoYW5nZXMod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFoYXNVbmNvbW1pdHRlZCkge1xuXHRcdFx0cmV0dXJuIHsgbWVzc2FnZTogeyBtYXJrZG93bjogbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQuY29tbWl0Lm5vQ2hhbmdlcycsIFwiTm8gdW5jb21taXR0ZWQgY2hhbmdlcyB0byBjb21taXQuXCIpIH0gfTtcblx0XHR9XG5cdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRjb25zdCBjb3BpbG90UmVzb3VyY2UgPSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCk7XG5cdFx0Y29uc3QgYXV0aFRva2VuID0gdGhpcy5fYWdlbnRTZXJ2aWNlLmdldEF1dGhUb2tlbih7XG5cdFx0XHRyZXNvdXJjZTogY29waWxvdFJlc291cmNlLnJlc291cmNlLFxuXHRcdFx0c2NvcGVzOiBjb3BpbG90UmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHR9KTtcblx0XHRpZiAoIWF1dGhUb2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRcdEFIUF9BVVRIX1JFUVVJUkVELFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5jb21taXQuYXV0aFJlcXVpcmVkJywgXCJTaWduIGluIHRvIEdpdEh1YiBDb3BpbG90IHRvIGdlbmVyYXRlIGEgY29tbWl0IG1lc3NhZ2UuXCIpLFxuXHRcdFx0XHRbY29waWxvdFJlc291cmNlXSxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZnMgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKHdvcmtpbmdEaXJlY3RvcnksIHsgc2Vzc2lvblVyaSB9KTtcblx0XHRpZiAoIWRpZmZzIHx8IGRpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQuY29tbWl0LmRpZmZGYWlsZWQnLCBcIkNvdWxkIG5vdCBjb21wdXRlIHVuY29tbWl0dGVkIGNoYW5nZXMgdG8gZ2VuZXJhdGUgYSBjb21taXQgbWVzc2FnZS5cIikpO1xuXHRcdH1cblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0dHJ5IHtcblx0XHRcdG1lc3NhZ2UgPSB0aGlzLl9jbGVhbkNvbW1pdE1lc3NhZ2UoYXdhaXQgdGhpcy5fY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNoYXRDb21wbGV0aW9uKGF1dGhUb2tlbiwge1xuXHRcdFx0XHRtZXNzYWdlczogdGhpcy5fYnVpbGRDb21taXRNZXNzYWdlUHJvbXB0KHdvcmtpbmdEaXJlY3RvcnksIGdpdFN0YXRlLmJyYW5jaE5hbWUsIGRpZmZzKSxcblx0XHRcdH0sIHsgc2lnbmFsIH0pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0aWYgKHRoaXMuX2lzQXV0aEZhaWx1cmUoZXJyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihcblx0XHRcdFx0XHRBSFBfQVVUSF9SRVFVSVJFRCxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5jb21taXQuYXV0aEV4cGlyZWQnLCBcIkF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkIHRvIGdlbmVyYXRlIGEgY29tbWl0IG1lc3NhZ2UuIFBsZWFzZSBzaWduIGluIHRvIEdpdEh1YiBDb3BpbG90IGFuZCB0cnkgYWdhaW4uXCIpLFxuXHRcdFx0XHRcdFtjb3BpbG90UmVzb3VyY2VdLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LmNvbW1pdC5lbXB0eU1lc3NhZ2UnLCBcIkdlbmVyYXRlZCBjb21taXQgbWVzc2FnZSB3YXMgZW1wdHkuXCIpKTtcblx0XHR9XG5cdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyXSBDb21taXR0aW5nIHVuY29tbWl0dGVkIGNoYW5nZXMgZm9yIHNlc3Npb24gJHtzZXNzaW9uVXJpfWApO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbW1pdEFsbCh3b3JraW5nRGlyZWN0b3J5LCBtZXNzYWdlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgYEZhaWxlZCB0byBjb21taXQgY2hhbmdlczogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX29uQ29tbWl0dGVkKHNlc3Npb25VcmkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlcl0gUG9zdC1jb21taXQgcmVmcmVzaCBmYWlsZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uVXJpfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgbWVzc2FnZTogeyBtYXJrZG93bjogbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQuY29tbWl0LmNvbW1pdHRlZCcsIFwiQ29tbWl0dGVkIGNoYW5nZXMgd2l0aCBtZXNzYWdlOiBgezB9YFwiLCBtZXNzYWdlLnNwbGl0KCdcXG4nKVswXSkgfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRDb21taXRNZXNzYWdlUHJvbXB0KHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgYnJhbmNoTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaWZmczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdKTogeyByb2xlOiAnc3lzdGVtJyB8ICd1c2VyJzsgY29udGVudDogc3RyaW5nIH1bXSB7XG5cdFx0Y29uc3QgY2hhbmdlU3VtbWFyeSA9IHRoaXMuX3N1bW1hcml6ZURpZmZzRm9yUHJvbXB0KGRpZmZzKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRyb2xlOiAnc3lzdGVtJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdCdZb3UgZ2VuZXJhdGUgY29uY2lzZSBHaXQgY29tbWl0IG1lc3NhZ2VzLicsXG5cdFx0XHRcdFx0J1JldHVybiBvbmx5IHRoZSBjb21taXQgbWVzc2FnZSB0ZXh0LCB3aXRoIG5vIG1hcmtkb3duIG9yIGNvZGUgZmVuY2VzLicsXG5cdFx0XHRcdFx0J1VzZSBpbXBlcmF0aXZlIG1vb2QuIEtlZXAgdGhlIHN1YmplY3QgbGluZSB1bmRlciA3MiBjaGFyYWN0ZXJzLicsXG5cdFx0XHRcdFx0J0FkZCBhIGJvZHkgb25seSB3aGVuIGl0IGhlbHBzIGV4cGxhaW4gbXVsdGlwbGUgcmVsYXRlZCBjaGFuZ2VzLicsXG5cdFx0XHRcdF0uam9pbignICcpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cm9sZTogJ3VzZXInLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0YFJlcG9zaXRvcnk6ICR7YmFzZW5hbWUod29ya2luZ0RpcmVjdG9yeSl9YCxcblx0XHRcdFx0XHRgQnJhbmNoOiAke2JyYW5jaE5hbWUgPz8gJ3Vua25vd24nfWAsXG5cdFx0XHRcdFx0J0NoYW5nZWQgZmlsZXM6Jyxcblx0XHRcdFx0XHRjaGFuZ2VTdW1tYXJ5LFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3VtbWFyaXplRGlmZnNGb3JQcm9tcHQoZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBkaWZmIG9mIGRpZmZzKSB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBkaWZmLmJlZm9yZT8udXJpO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBkaWZmLmFmdGVyPy51cmk7XG5cdFx0XHRjb25zdCBwYXRoID0gYWZ0ZXIgPz8gYmVmb3JlID8/ICcodW5rbm93biknO1xuXHRcdFx0bGV0IGtpbmQgPSAnRWRpdCc7XG5cdFx0XHRpZiAoIWJlZm9yZSAmJiBhZnRlcikge1xuXHRcdFx0XHRraW5kID0gJ0NyZWF0ZSc7XG5cdFx0XHR9IGVsc2UgaWYgKGJlZm9yZSAmJiAhYWZ0ZXIpIHtcblx0XHRcdFx0a2luZCA9ICdEZWxldGUnO1xuXHRcdFx0fSBlbHNlIGlmIChiZWZvcmUgJiYgYWZ0ZXIgJiYgYmVmb3JlICE9PSBhZnRlcikge1xuXHRcdFx0XHRraW5kID0gJ1JlbmFtZSc7XG5cdFx0XHR9XG5cdFx0XHRsaW5lcy5wdXNoKGAtICR7a2luZH06ICR7dGhpcy5fZGlzcGxheVVyaShwYXRoKX0gKCske2RpZmYuZGlmZj8uYWRkZWQgPz8gMH0gLSR7ZGlmZi5kaWZmPy5yZW1vdmVkID8/IDB9KWApO1xuXHRcdFx0aWYgKGxpbmVzLmpvaW4oJ1xcbicpLmxlbmd0aCA+IE1BWF9DSEFOR0VfU1VNTUFSWV9QUk9NUFRfQ0hBUlMpIHtcblx0XHRcdFx0bGluZXMucHVzaCgnW2ZpbGUgbGlzdCB0cnVuY2F0ZWRdJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwbGF5VXJpKHVyaTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKHVyaSk7XG5cdFx0XHRyZXR1cm4gcGFyc2VkLnNjaGVtZSA9PT0gJ2ZpbGUnID8gcGFyc2VkLmZzUGF0aCA6IHBhcnNlZC5wYXRoIHx8IHVyaTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW5Db21taXRNZXNzYWdlKHJhdzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgdGV4dCA9IHJhdy50cmltKCkucmVwbGFjZSgvXFxyXFxuL2csICdcXG4nKTtcblx0XHRjb25zdCBmZW5jZWQgPSAvXmBgYCg/OnRleHR8Z2l0Y29tbWl0KT9cXHMqKFtcXHNcXFNdKj8pXFxzKmBgYCQvaS5leGVjKHRleHQpO1xuXHRcdGlmIChmZW5jZWQpIHtcblx0XHRcdHRleHQgPSBmZW5jZWRbMV0udHJpbSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdHByaXZhdGUgX2lzQXV0aEZhaWx1cmUoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIENvcGlsb3RBcGlFcnJvcikge1xuXHRcdFx0cmV0dXJuIGVyci5zdGF0dXMgPT09IDQwMSB8fCBlcnIuc3RhdHVzID09PSA0MDM7XG5cdFx0fVxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0cmV0dXJuIC9cXGIoNDAxfDQwMylcXGIvLnRlc3QobWVzc2FnZSlcblx0XHRcdCYmIC9cXGIoYXV0aHxhdXRob3JpemF0aW9ufHVuYXV0aG9yaXplZHxmb3JiaWRkZW58dG9rZW58Y29waWxvdCBlbmRwb2ludCBkaXNjb3Zlcnl8Y29waWxvdCBzZXNzaW9uIHRva2VuIG1pbnQpXFxiL2kudGVzdChtZXNzYWdlKTtcblx0fVxuXG5cdHByaXZhdGUgX3Rocm93SWZDYW5jZWxsZWQodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogdm9pZCB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnRlcm5hbEVycm9yLCBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5jb21taXQuY2FuY2VsbGVk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
