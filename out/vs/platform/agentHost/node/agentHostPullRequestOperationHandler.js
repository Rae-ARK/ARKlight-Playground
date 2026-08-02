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
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IAgentService } from "../common/agentService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from "../common/state/sessionProtocol.js";
import { readSessionGitHubState, readSessionGitState } from "../common/state/sessionState.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { IAgentHostOctoKitService } from "./shared/agentHostOctoKitService.js";
import { ICopilotApiService } from "./shared/copilotApiService.js";
import { buildConversationContext } from "../common/agentHostConversationContext.js";
const MAX_PR_CONVERSATION_CONTEXT_CHARS = 12e3;
const MAX_PR_CHANGE_SUMMARY_CHARS = 4e3;
function parseUpstreamBranchName(upstreamBranchName) {
  const separatorIndex = upstreamBranchName?.indexOf("/") ?? -1;
  if (!upstreamBranchName || separatorIndex <= 0 || separatorIndex === upstreamBranchName.length - 1) {
    return void 0;
  }
  return {
    remote: upstreamBranchName.substring(0, separatorIndex),
    branch: upstreamBranchName.substring(separatorIndex + 1)
  };
}
let AgentHostPullRequestOperationHandler = class {
  constructor(_draft, _autoMergeMethod, _getSessionState, _onPullRequestCreated, _agentService, _gitService, _octoKitService, _gitHubEndpointService, _copilotApiService, _logService) {
    this._draft = _draft;
    this._autoMergeMethod = _autoMergeMethod;
    this._getSessionState = _getSessionState;
    this._onPullRequestCreated = _onPullRequestCreated;
    this._agentService = _agentService;
    this._gitService = _gitService;
    this._octoKitService = _octoKitService;
    this._gitHubEndpointService = _gitHubEndpointService;
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
      throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a changeset URI: ${params.channel}`);
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
    const gitHubState = readSessionGitHubState(sessionState._meta);
    if (!gitHubState?.owner || !gitHubState?.repo) {
      throw new ProtocolError(
        JsonRpcErrorCodes.InternalError,
        `Session's working directory is not a GitHub-backed git repo: ${sessionUri}`
      );
    }
    const workingDirectory = URI.parse(workingDirectoryStr);
    const gitState = await this._gitService.getSessionGitState(workingDirectory) ?? readSessionGitState(sessionState._meta);
    const branchName = gitState?.branchName ?? await this._gitService.getCurrentBranch(workingDirectory);
    if (!branchName) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine current branch for ${workingDirectory}`);
    }
    const baseBranchName = gitState?.baseBranchName ?? (await this._gitService.getDefaultBranch(workingDirectory))?.name;
    if (!baseBranchName) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine base branch for ${workingDirectory}`);
    }
    const base = baseBranchName;
    const repoResource = this._gitHubEndpointService.getRepoResource();
    const authToken = this._agentService.getAuthToken({
      resource: repoResource.resource,
      scopes: repoResource.scopes_supported
    });
    if (!authToken) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        localize("agentHost.changeset.pr.authRequired", "Sign in to GitHub with repository access to create a pull request."),
        [repoResource]
      );
    }
    const hasUncommitted = await this._gitService.hasUncommittedChanges(workingDirectory);
    if (hasUncommitted) {
      this._throwIfCancelled(token);
      this._logService.info(`[AgentHostPullRequestOperationHandler] Committing uncommitted changes for session ${sessionUri}`);
      try {
        await this._gitService.commitAll(workingDirectory, this._formatCommitMessage(branchName));
      } catch (err) {
        this._throwIfCancelled(token);
        throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to commit changes before creating a pull request: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this._throwIfCancelled(token);
    const branchChanges = await this._gitService.computeSessionFileDiffs(workingDirectory, { sessionUri, baseBranch: base });
    if (branchChanges === void 0) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.pr.computeChangesFailed", "Could not compute branch changes to create a pull request."));
    }
    if (branchChanges !== void 0 && branchChanges.length === 0) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.pr.noChanges", "There are no branch changes to create a pull request for."));
    }
    this._throwIfCancelled(token);
    const githubHeadOwner = gitState?.githubHeadOwner;
    const upstreamBranch = githubHeadOwner ? parseUpstreamBranchName(gitState.upstreamBranchName) : void 0;
    const headOwner = upstreamBranch && githubHeadOwner ? githubHeadOwner : gitHubState.owner;
    const headBranch = upstreamBranch?.branch ?? branchName;
    const pushRef = headBranch === branchName ? branchName : `${branchName}:${headBranch}`;
    const createHead = headOwner === gitHubState.owner ? headBranch : `${headOwner}:${headBranch}`;
    this._logService.info(`[AgentHostPullRequestOperationHandler] Pushing branch ${branchName} to ${upstreamBranch?.remote ?? "origin"} for session ${sessionUri}`);
    const upstreamPresent = await this._gitService.hasUpstream(workingDirectory, branchName);
    this._throwIfCancelled(token);
    try {
      await this._gitService.push(workingDirectory, { remote: upstreamBranch?.remote, ref: pushRef, setUpstream: !upstreamPresent });
    } catch (err) {
      this._throwIfCancelled(token);
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to push branch '${branchName}': ${err instanceof Error ? err.message : String(err)}`);
    }
    this._throwIfCancelled(token);
    const existing = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, headBranch, authToken, signal, headOwner);
    if (existing) {
      this._throwIfCancelled(token);
      return await this._finalize(existing, true, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token);
    }
    this._throwIfCancelled(token);
    const generated = await this._generateTitleAndDescription(sessionState, branchName, base, branchChanges, signal, token);
    this._throwIfCancelled(token);
    const title = generated?.title ?? this._formatTitle(branchName);
    const body = generated?.description ?? this._formatBody(branchName, base);
    this._logService.info(`[AgentHostPullRequestOperationHandler] Creating ${this._draft ? "draft " : ""}PR ${gitHubState.owner}/${gitHubState.repo} ${createHead} -> ${base}`);
    let created;
    try {
      created = await this._octoKitService.createPullRequest(
        gitHubState.owner,
        gitHubState.repo,
        title,
        body,
        createHead,
        base,
        this._draft,
        authToken,
        signal
      );
    } catch (err) {
      this._throwIfCancelled(token);
      let foundAfterFailure;
      try {
        foundAfterFailure = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, headBranch, authToken, signal, headOwner);
      } catch {
        this._throwIfCancelled(token);
        throw err;
      }
      if (foundAfterFailure) {
        this._throwIfCancelled(token);
        return await this._finalize(foundAfterFailure, true, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token);
      }
      throw err;
    }
    this._throwIfCancelled(token);
    return await this._finalize(created, false, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token);
  }
  /**
   * Notifies listeners that the pull request now exists, optionally enables
   * auto-merge with the configured {@link AutoMergeMethod} (best-effort: a
   * failure to enable auto-merge does not fail the operation), and builds the
   * result message describing what happened.
   */
  async _finalize(pr, isExisting, sessionUri, owner, repo, branchName, authToken, signal, token) {
    if (!this._autoMergeMethod) {
      this._onPullRequestCreated({ sessionKey: sessionUri, pullRequestUrl: pr.url, branchName });
      return this._createResult(pr, this._buildMessage(pr, isExisting, "none", void 0));
    }
    let autoMergeError;
    let autoMergeOutcome = "none";
    if (pr.nodeId) {
      try {
        await this._octoKitService.enablePullRequestAutoMerge(pr.nodeId, this._autoMergeMethod, authToken, signal);
        autoMergeOutcome = "enabled";
      } catch (err) {
        this._throwIfCancelled(token);
        autoMergeError = err instanceof Error ? err.message : String(err);
        autoMergeOutcome = "failed";
        this._logService.warn(`[AgentHostPullRequestOperationHandler] Failed to enable auto-merge for ${owner}/${repo}#${pr.number}: ${autoMergeError}`);
      }
    } else {
      autoMergeError = localize("agentHost.changeset.pr.autoMerge.noNodeId", "the pull request identifier was not returned by GitHub.");
      autoMergeOutcome = "failed";
      this._logService.warn(`[AgentHostPullRequestOperationHandler] Cannot enable auto-merge for ${owner}/${repo}#${pr.number}: missing pull request node id`);
    }
    this._onPullRequestCreated({ sessionKey: sessionUri, pullRequestUrl: pr.url, branchName });
    return this._createResult(pr, this._buildMessage(pr, isExisting, autoMergeOutcome, autoMergeError));
  }
  _buildMessage(pr, isExisting, autoMergeOutcome, autoMergeError) {
    let mergeMethodLabel;
    switch (this._autoMergeMethod) {
      case "SQUASH":
        mergeMethodLabel = localize("agentHost.changeset.pr.autoMerge.squash", "squash");
        break;
      case "REBASE":
        mergeMethodLabel = localize("agentHost.changeset.pr.autoMerge.rebase", "rebase");
        break;
      default:
        mergeMethodLabel = localize("agentHost.changeset.pr.autoMerge.merge", "merge");
        break;
    }
    if (isExisting) {
      switch (autoMergeOutcome) {
        case "enabled":
          return localize("agentHost.changeset.pr.existing.autoMerge", "Pull request [#{0}]({1}) already exists; enabled auto-merge ({2}).", pr.number, pr.url, mergeMethodLabel);
        case "failed":
          return localize("agentHost.changeset.pr.existing.autoMergeFailed", "Pull request [#{0}]({1}) already exists, but auto-merge could not be enabled: {2}", pr.number, pr.url, autoMergeError ?? "");
        default:
          return localize("agentHost.changeset.pr.existing", "Pull request [#{0}]({1}) already exists.", pr.number, pr.url);
      }
    }
    switch (autoMergeOutcome) {
      case "enabled":
        return localize("agentHost.changeset.pr.created.autoMerge", "Created pull request [#{0}]({1}) with auto-merge ({2}) enabled.", pr.number, pr.url, mergeMethodLabel);
      case "failed":
        return localize("agentHost.changeset.pr.created.autoMergeFailed", "Created pull request [#{0}]({1}), but auto-merge could not be enabled: {2}", pr.number, pr.url, autoMergeError ?? "");
      default:
        return this._draft ? localize("agentHost.changeset.pr.createdDraft", "Created draft pull request [#{0}]({1}).", pr.number, pr.url) : localize("agentHost.changeset.pr.created", "Created pull request [#{0}]({1}).", pr.number, pr.url);
    }
  }
  _throwIfCancelled(token) {
    if (token.isCancellationRequested) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.pr.cancelled", "Pull request operation was cancelled."));
    }
  }
  _formatTitle(branchName) {
    const idx = branchName.indexOf("/");
    if (idx > 0 && idx < branchName.length - 1) {
      const prefix = branchName.substring(0, idx);
      const rest = branchName.substring(idx + 1).replace(/[-_]+/g, " ");
      return `${prefix}: ${rest}`;
    }
    return branchName.replace(/[-_]+/g, " ");
  }
  _formatCommitMessage(branchName) {
    return localize("agentHost.changeset.pr.commitMessage", "Agent Host changes for {0}", branchName);
  }
  _formatBody(branchName, baseBranchName) {
    return localize("agentHost.changeset.pr.body", "Created from `{0}` targeting `{1}`.", branchName, baseBranchName);
  }
  /**
   * Best-effort generation of a PR title and description using the utility
   * model. The model is given the main session conversation (only the
   * markdown text of user requests and agent responses — tool calls,
   * subagents, and reasoning are excluded and the text is character-bounded)
   * along with a summary of the changed files. Returns `undefined` when no
   * Copilot token is available or generation fails, so the caller can fall
   * back to the branch-name based title/description. PR creation must never
   * fail just because the model is unavailable.
   */
  async _generateTitleAndDescription(sessionState, branchName, base, branchChanges, signal, token) {
    const copilotResource = this._gitHubEndpointService.getCopilotResource();
    const copilotToken = this._agentService.getAuthToken({
      resource: copilotResource.resource,
      scopes: copilotResource.scopes_supported
    });
    if (!copilotToken) {
      return void 0;
    }
    const conversation = buildConversationContext(sessionState.turns, { maxChars: MAX_PR_CONVERSATION_CONTEXT_CHARS });
    const changeSummary = this._summarizeDiffsForPrompt(branchChanges);
    if (!conversation && !changeSummary) {
      return void 0;
    }
    try {
      const raw = await this._copilotApiService.utilityChatCompletion(copilotToken, {
        messages: this._buildTitleAndDescriptionPrompt(branchName, base, conversation, changeSummary)
      }, { signal });
      this._throwIfCancelled(token);
      return this._parseTitleAndDescription(raw);
    } catch (err) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      this._logService.warn(`[AgentHostPullRequestOperationHandler] Failed to generate PR title and description: ${err instanceof Error ? err.message : String(err)}`);
      return void 0;
    }
  }
  _buildTitleAndDescriptionPrompt(branchName, base, conversation, changeSummary) {
    const userSections = [
      `Branch: ${branchName}`,
      `Base branch: ${base}`
    ];
    if (changeSummary) {
      userSections.push(`Changed files:
${changeSummary}`);
    }
    if (conversation) {
      userSections.push(`Conversation (the request that produced these changes):
${conversation}`);
    }
    return [
      {
        role: "system",
        content: [
          "You write clear, concise GitHub pull request titles and descriptions.",
          'The first line of your reply is the PR title: a short imperative summary under 72 characters, with no "Title:" prefix, no surrounding quotes, and no markdown heading.',
          "After the title, add one blank line, then write the PR description in GitHub-flavored markdown.",
          "Summarize what changed and why, grounded in the conversation and changed files. Use a short paragraph and/or bullet points.",
          "Do not invent changes that are not supported by the provided context, and do not wrap the whole reply in code fences."
        ].join(" ")
      },
      {
        role: "user",
        content: userSections.join("\n\n")
      }
    ];
  }
  _summarizeDiffsForPrompt(diffs) {
    const lines = [];
    let length = 0;
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
      const line = `- ${kind}: ${this._displayUri(path)} (+${diff.diff?.added ?? 0} -${diff.diff?.removed ?? 0})`;
      lines.push(line);
      length += line.length + (lines.length > 1 ? 1 : 0);
      if (length > MAX_PR_CHANGE_SUMMARY_CHARS) {
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
  _parseTitleAndDescription(raw) {
    let text = raw.trim().replace(/\r\n/g, "\n");
    const fenced = /^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i.exec(text);
    if (fenced) {
      text = fenced[1].trim();
    }
    if (!text) {
      return void 0;
    }
    const lines = text.split("\n");
    let i = 0;
    while (i < lines.length && lines[i].trim().length === 0) {
      i++;
    }
    if (i >= lines.length) {
      return void 0;
    }
    const title = lines[i].trim().replace(/^#+\s*/, "").replace(/^title:\s*/i, "").trim().replace(/^"(?<inner>.+)"$/, (_match, inner) => inner).trim();
    if (!title) {
      return void 0;
    }
    const description = lines.slice(i + 1).join("\n").trim().replace(/^description:\s*/i, "").trim();
    return { title, description };
  }
  _createResult(created, message) {
    const followUp = {
      content: { uri: created.url, contentType: "text/html" },
      external: true
    };
    return { message: { markdown: message }, followUp };
  }
};
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR = "create-pr";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR = "create-draft-pr";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE = "create-pr-auto-merge";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH = "create-pr-auto-squash";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE = "create-pr-auto-rebase";
AgentHostPullRequestOperationHandler = __decorateClass([
  __decorateParam(4, IAgentService),
  __decorateParam(5, IAgentHostGitService),
  __decorateParam(6, IAgentHostOctoKitService),
  __decorateParam(7, IAgentHostGitHubEndpointService),
  __decorateParam(8, ICopilotApiService),
  __decorateParam(9, ILogService)
], AgentHostPullRequestOperationHandler);
export {
  AgentHostPullRequestOperationHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcGFyc2VDaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IEFIUF9BVVRIX1JFUVVJUkVELCBBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIEpzb25ScGNFcnJvckNvZGVzLCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlLCByZWFkU2Vzc2lvbkdpdFN0YXRlLCB0eXBlIENoYW5nZXNldE9wZXJhdGlvbkZvbGxvd1VwLCB0eXBlIElTZXNzaW9uRmlsZURpZmYsIHR5cGUgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElDaGFuZ2VzZXRPcGVyYXRpb25IYW5kbGVyIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBBdXRvTWVyZ2VNZXRob2QsIHR5cGUgQ3JlYXRlZFB1bGxSZXF1ZXN0LCBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UgfSBmcm9tICcuL3NoYXJlZC9hZ2VudEhvc3RPY3RvS2l0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcywgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYW5nZXNldC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UsIHR5cGUgSUNvcGlsb3RVdGlsaXR5Q2hhdE1lc3NhZ2UgfSBmcm9tICcuL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZENvbnZlcnNhdGlvbkNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q29udmVyc2F0aW9uQ29udGV4dC5qcyc7XG5cbi8qKlxuICogU29mdCB1cHBlciBib3VuZCwgaW4gY2hhcmFjdGVycywgZm9yIHRoZSBjb252ZXJzYXRpb24gY29udGV4dCBmZWQgdG8gdGhlXG4gKiB1dGlsaXR5IG1vZGVsIHdoZW4gZ2VuZXJhdGluZyBhIFBSIHRpdGxlIGFuZCBkZXNjcmlwdGlvbi4gU2l6ZWQgdG8gc3RheVxuICogd2l0aGluIHRoZSBzbWFsbCBtb2RlbCdzIGNvbnRleHQgd2luZG93IHdoaWxlIGxlYXZpbmcgcm9vbSBmb3IgdGhlIGNoYW5nZWRcbiAqIGZpbGUgc3VtbWFyeSBhbmQgcHJvbXB0IHNjYWZmb2xkaW5nLlxuICovXG5jb25zdCBNQVhfUFJfQ09OVkVSU0FUSU9OX0NPTlRFWFRfQ0hBUlMgPSAxMl8wMDA7XG5cbi8qKlxuICogU29mdCB1cHBlciBib3VuZCwgaW4gY2hhcmFjdGVycywgZm9yIHRoZSBjaGFuZ2VkLWZpbGUgc3VtbWFyeSBmZWQgdG8gdGhlXG4gKiB1dGlsaXR5IG1vZGVsIHdoZW4gZ2VuZXJhdGluZyBhIFBSIHRpdGxlIGFuZCBkZXNjcmlwdGlvbi5cbiAqL1xuY29uc3QgTUFYX1BSX0NIQU5HRV9TVU1NQVJZX0NIQVJTID0gNF8wMDA7XG5cbmZ1bmN0aW9uIHBhcnNlVXBzdHJlYW1CcmFuY2hOYW1lKHVwc3RyZWFtQnJhbmNoTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyByZW1vdGU6IHN0cmluZzsgYnJhbmNoOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHNlcGFyYXRvckluZGV4ID0gdXBzdHJlYW1CcmFuY2hOYW1lPy5pbmRleE9mKCcvJykgPz8gLTE7XG5cdGlmICghdXBzdHJlYW1CcmFuY2hOYW1lIHx8IHNlcGFyYXRvckluZGV4IDw9IDAgfHwgc2VwYXJhdG9ySW5kZXggPT09IHVwc3RyZWFtQnJhbmNoTmFtZS5sZW5ndGggLSAxKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHJlbW90ZTogdXBzdHJlYW1CcmFuY2hOYW1lLnN1YnN0cmluZygwLCBzZXBhcmF0b3JJbmRleCksXG5cdFx0YnJhbmNoOiB1cHN0cmVhbUJyYW5jaE5hbWUuc3Vic3RyaW5nKHNlcGFyYXRvckluZGV4ICsgMSksXG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHVsbFJlcXVlc3RDcmVhdGVkRXZlbnQge1xuXHRyZWFkb25seSBzZXNzaW9uS2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHB1bGxSZXF1ZXN0VXJsOiBzdHJpbmc7XG5cdC8qKiBUaGUgaGVhZCBicmFuY2ggdGhlIHB1bGwgcmVxdWVzdCB3YXMgY3JlYXRlZCAob3IgZm91bmQpIGZvci4gKi9cblx0cmVhZG9ubHkgYnJhbmNoTmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFNlcnZlci1zaWRlIGhhbmRsZXIgZm9yIHRoZSBgY3JlYXRlLXByYCBhbmQgYGNyZWF0ZS1kcmFmdC1wcmAgY2hhbmdlc2V0XG4gKiBvcGVyYXRpb25zIGFkdmVydGlzZWQgb24gZ2l0LWJhY2tlZCBzZXNzaW9ucyB3aG9zZSB3b3JraW5nIGRpcmVjdG9yeSBoYXNcbiAqIGEgR2l0SHViIHJlbW90ZS4gT3BlcmF0aW9uIGF2YWlsYWJpbGl0eSBpcyByZWNvbXB1dGVkIGJ5XG4gKiBgQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS51cGRhdGVPcGVyYXRpb25zYC5cbiAqXG4gKiBUaGUgZmxvdyBtaXJyb3JzIHRoZSBDb3BpbG90IENMSSBleHRlbnNpb24ncyBgY3JlYXRlUHVsbFJlcXVlc3RgIGhlbHBlclxuICogKGBleHRlbnNpb25zL2NvcGlsb3Qvc3JjL2V4dGVuc2lvbi9jaGF0U2Vzc2lvbnMvdnNjb2RlLW5vZGUvY29waWxvdENMSUNoYXRTZXNzaW9uc0NvbnRyaWJ1dGlvbi50c2ApOlxuICpcbiAqIDEuIFJlc29sdmUgc2Vzc2lvbiBcdTIxOTIgd29ya2luZyBkaXJlY3RvcnkgKyBjdXJyZW50L2Jhc2UgYnJhbmNoIGZyb21cbiAqICAgIHtAbGluayBJU2Vzc2lvbkdpdFN0YXRlfS5cbiAqIDIuIENvbW1pdCBhbnkgdW5jb21taXR0ZWQgd29ya2luZy10cmVlIGNoYW5nZXMuXG4gKiAzLiBQdXNoIHRoZSBjdXJyZW50IGJyYW5jaCB0byBpdHMgR2l0SHViIHVwc3RyZWFtIHJlbW90ZSAod2l0aCBgLS1zZXQtdXBzdHJlYW1gIHdoZW4gbWlzc2luZykuXG4gKiA0LiBSZXNvbHZlIGBvd25lcmAgLyBgcmVwb2AgZnJvbSB7QGxpbmsgSVNlc3Npb25HaXRTdGF0ZS5naXRodWJPd25lcn1cbiAqICAgIC8ge0BsaW5rIElTZXNzaW9uR2l0U3RhdGUuZ2l0aHViUmVwb30gKHBvcHVsYXRlZCBieSB0aGUgZ2l0IHByb2JlKS5cbiAqIDUuIFJldXNlIGFuIGV4aXN0aW5nIFBSIGZvciB0aGUgYnJhbmNoLCBvciBQT1NUIGAvcmVwb3Mve293bmVyfS97cmVwb30vcHVsbHNgXG4gKiAgICB2aWEge0BsaW5rIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZX0uXG4gKiA2LiBSZXR1cm4gdGhlIFBSIFVSTCBhcyBhbiB7QGxpbmsgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0LmZvbGxvd1VwfS5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlciBpbXBsZW1lbnRzIElDaGFuZ2VzZXRPcGVyYXRpb25IYW5kbGVyIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IE9QRVJBVElPTl9DUkVBVEVfUFIgPSAnY3JlYXRlLXByJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBPUEVSQVRJT05fQ1JFQVRFX0RSQUZUX1BSID0gJ2NyZWF0ZS1kcmFmdC1wcic7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgT1BFUkFUSU9OX0NSRUFURV9QUl9BVVRPX01FUkdFID0gJ2NyZWF0ZS1wci1hdXRvLW1lcmdlJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBPUEVSQVRJT05fQ1JFQVRFX1BSX0FVVE9fU1FVQVNIID0gJ2NyZWF0ZS1wci1hdXRvLXNxdWFzaCc7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgT1BFUkFUSU9OX0NSRUFURV9QUl9BVVRPX1JFQkFTRSA9ICdjcmVhdGUtcHItYXV0by1yZWJhc2UnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RyYWZ0OiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9NZXJnZU1ldGhvZDogQXV0b01lcmdlTWV0aG9kIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFNlc3Npb25TdGF0ZTogKHNlc3Npb25LZXk6IHN0cmluZykgPT4gSVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25QdWxsUmVxdWVzdENyZWF0ZWQ6IChldmVudDogUHVsbFJlcXVlc3RDcmVhdGVkRXZlbnQpID0+IHZvaWQsXG5cdFx0QElBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRTZXJ2aWNlOiBJQWdlbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0XHRASUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29jdG9LaXRTZXJ2aWNlOiBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0SHViRW5kcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgaW52b2tlKHBhcmFtczogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGFib3J0Q29udHJvbGxlci5hYm9ydCgpO1xuXHRcdH1cblx0XHRjb25zdCBjYW5jZWxsYXRpb25MaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGFib3J0Q29udHJvbGxlci5hYm9ydCgpKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2ludm9rZShwYXJhbXMsIHRva2VuLCBhYm9ydENvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2FuY2VsbGF0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ludm9rZShwYXJhbXM6IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUNoYW5nZXNldFVyaShwYXJhbXMuY2hhbm5lbCk7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBOb3QgYSBjaGFuZ2VzZXQgVVJJOiAke3BhcmFtcy5jaGFubmVsfWApO1xuXHRcdH1cblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gcGFyc2VkLnNlc3Npb25Vcmk7XG5cblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKCFzZXNzaW9uU3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25Vcml9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeVN0ciA9IHNlc3Npb25TdGF0ZS53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnlTdHIpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGBTZXNzaW9uIGhhcyBubyB3b3JraW5nIGRpcmVjdG9yeTogJHtzZXNzaW9uVXJpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdpdEh1YlN0YXRlID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShzZXNzaW9uU3RhdGUuX21ldGEpO1xuXHRcdGlmICghZ2l0SHViU3RhdGU/Lm93bmVyIHx8ICFnaXRIdWJTdGF0ZT8ucmVwbykge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRcdEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsXG5cdFx0XHRcdGBTZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3RvcnkgaXMgbm90IGEgR2l0SHViLWJhY2tlZCBnaXQgcmVwbzogJHtzZXNzaW9uVXJpfWAsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yeVN0cik7XG5cdFx0Y29uc3QgZ2l0U3RhdGUgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldFNlc3Npb25HaXRTdGF0ZSh3b3JraW5nRGlyZWN0b3J5KSA/PyByZWFkU2Vzc2lvbkdpdFN0YXRlKHNlc3Npb25TdGF0ZS5fbWV0YSk7XG5cdFx0Y29uc3QgYnJhbmNoTmFtZSA9IGdpdFN0YXRlPy5icmFuY2hOYW1lID8/IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIWJyYW5jaE5hbWUpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGBDb3VsZCBub3QgZGV0ZXJtaW5lIGN1cnJlbnQgYnJhbmNoIGZvciAke3dvcmtpbmdEaXJlY3Rvcnl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFzZUJyYW5jaE5hbWUgPSBnaXRTdGF0ZT8uYmFzZUJyYW5jaE5hbWUgPz8gKGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0RGVmYXVsdEJyYW5jaCh3b3JraW5nRGlyZWN0b3J5KSk/Lm5hbWU7XG5cdFx0aWYgKCFiYXNlQnJhbmNoTmFtZSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgYENvdWxkIG5vdCBkZXRlcm1pbmUgYmFzZSBicmFuY2ggZm9yICR7d29ya2luZ0RpcmVjdG9yeX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgYmFzZSA9IGJhc2VCcmFuY2hOYW1lO1xuXG5cdFx0Y29uc3QgcmVwb1Jlc291cmNlID0gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldFJlcG9SZXNvdXJjZSgpO1xuXHRcdGNvbnN0IGF1dGhUb2tlbiA9IHRoaXMuX2FnZW50U2VydmljZS5nZXRBdXRoVG9rZW4oe1xuXHRcdFx0cmVzb3VyY2U6IHJlcG9SZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdHNjb3BlczogcmVwb1Jlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQsXG5cdFx0fSk7XG5cdFx0aWYgKCFhdXRoVG9rZW4pIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKFxuXHRcdFx0XHRBSFBfQVVUSF9SRVFVSVJFRCxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuYXV0aFJlcXVpcmVkJywgXCJTaWduIGluIHRvIEdpdEh1YiB3aXRoIHJlcG9zaXRvcnkgYWNjZXNzIHRvIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdC5cIiksXG5cdFx0XHRcdFtyZXBvUmVzb3VyY2VdLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNVbmNvbW1pdHRlZCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuaGFzVW5jb21taXR0ZWRDaGFuZ2VzKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmIChoYXNVbmNvbW1pdHRlZCkge1xuXHRcdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXJdIENvbW1pdHRpbmcgdW5jb21taXR0ZWQgY2hhbmdlcyBmb3Igc2Vzc2lvbiAke3Nlc3Npb25Vcml9YCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbW1pdEFsbCh3b3JraW5nRGlyZWN0b3J5LCB0aGlzLl9mb3JtYXRDb21taXRNZXNzYWdlKGJyYW5jaE5hbWUpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgYEZhaWxlZCB0byBjb21taXQgY2hhbmdlcyBiZWZvcmUgY3JlYXRpbmcgYSBwdWxsIHJlcXVlc3Q6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IGJyYW5jaENoYW5nZXMgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKHdvcmtpbmdEaXJlY3RvcnksIHsgc2Vzc2lvblVyaSwgYmFzZUJyYW5jaDogYmFzZSB9KTtcblx0XHRpZiAoYnJhbmNoQ2hhbmdlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnRlcm5hbEVycm9yLCBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5jb21wdXRlQ2hhbmdlc0ZhaWxlZCcsIFwiQ291bGQgbm90IGNvbXB1dGUgYnJhbmNoIGNoYW5nZXMgdG8gY3JlYXRlIGEgcHVsbCByZXF1ZXN0LlwiKSk7XG5cdFx0fVxuXHRcdGlmIChicmFuY2hDaGFuZ2VzICE9PSB1bmRlZmluZWQgJiYgYnJhbmNoQ2hhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLm5vQ2hhbmdlcycsIFwiVGhlcmUgYXJlIG5vIGJyYW5jaCBjaGFuZ2VzIHRvIGNyZWF0ZSBhIHB1bGwgcmVxdWVzdCBmb3IuXCIpKTtcblx0XHR9XG5cdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRjb25zdCBnaXRodWJIZWFkT3duZXIgPSBnaXRTdGF0ZT8uZ2l0aHViSGVhZE93bmVyO1xuXHRcdGNvbnN0IHVwc3RyZWFtQnJhbmNoID0gZ2l0aHViSGVhZE93bmVyID8gcGFyc2VVcHN0cmVhbUJyYW5jaE5hbWUoZ2l0U3RhdGUudXBzdHJlYW1CcmFuY2hOYW1lKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoZWFkT3duZXIgPSB1cHN0cmVhbUJyYW5jaCAmJiBnaXRodWJIZWFkT3duZXIgPyBnaXRodWJIZWFkT3duZXIgOiBnaXRIdWJTdGF0ZS5vd25lcjtcblx0XHRjb25zdCBoZWFkQnJhbmNoID0gdXBzdHJlYW1CcmFuY2g/LmJyYW5jaCA/PyBicmFuY2hOYW1lO1xuXHRcdGNvbnN0IHB1c2hSZWYgPSBoZWFkQnJhbmNoID09PSBicmFuY2hOYW1lID8gYnJhbmNoTmFtZSA6IGAke2JyYW5jaE5hbWV9OiR7aGVhZEJyYW5jaH1gO1xuXHRcdGNvbnN0IGNyZWF0ZUhlYWQgPSBoZWFkT3duZXIgPT09IGdpdEh1YlN0YXRlLm93bmVyID8gaGVhZEJyYW5jaCA6IGAke2hlYWRPd25lcn06JHtoZWFkQnJhbmNofWA7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXJdIFB1c2hpbmcgYnJhbmNoICR7YnJhbmNoTmFtZX0gdG8gJHt1cHN0cmVhbUJyYW5jaD8ucmVtb3RlID8/ICdvcmlnaW4nfSBmb3Igc2Vzc2lvbiAke3Nlc3Npb25Vcml9YCk7XG5cdFx0Y29uc3QgdXBzdHJlYW1QcmVzZW50ID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5oYXNVcHN0cmVhbSh3b3JraW5nRGlyZWN0b3J5LCBicmFuY2hOYW1lKTtcblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZ2l0U2VydmljZS5wdXNoKHdvcmtpbmdEaXJlY3RvcnksIHsgcmVtb3RlOiB1cHN0cmVhbUJyYW5jaD8ucmVtb3RlLCByZWY6IHB1c2hSZWYsIHNldFVwc3RyZWFtOiAhdXBzdHJlYW1QcmVzZW50IH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnRlcm5hbEVycm9yLCBgRmFpbGVkIHRvIHB1c2ggYnJhbmNoICcke2JyYW5jaE5hbWV9JzogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCB0aGlzLl9vY3RvS2l0U2VydmljZS5maW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2goZ2l0SHViU3RhdGUub3duZXIsIGdpdEh1YlN0YXRlLnJlcG8sIGhlYWRCcmFuY2gsIGF1dGhUb2tlbiwgc2lnbmFsLCBoZWFkT3duZXIpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZmluYWxpemUoZXhpc3RpbmcsIHRydWUsIHNlc3Npb25VcmksIGdpdEh1YlN0YXRlLm93bmVyLCBnaXRIdWJTdGF0ZS5yZXBvLCBicmFuY2hOYW1lLCBhdXRoVG9rZW4sIHNpZ25hbCwgdG9rZW4pO1xuXHRcdH1cblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IGdlbmVyYXRlZCA9IGF3YWl0IHRoaXMuX2dlbmVyYXRlVGl0bGVBbmREZXNjcmlwdGlvbihzZXNzaW9uU3RhdGUsIGJyYW5jaE5hbWUsIGJhc2UsIGJyYW5jaENoYW5nZXMsIHNpZ25hbCwgdG9rZW4pO1xuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdGNvbnN0IHRpdGxlID0gZ2VuZXJhdGVkPy50aXRsZSA/PyB0aGlzLl9mb3JtYXRUaXRsZShicmFuY2hOYW1lKTtcblx0XHRjb25zdCBib2R5ID0gZ2VuZXJhdGVkPy5kZXNjcmlwdGlvbiA/PyB0aGlzLl9mb3JtYXRCb2R5KGJyYW5jaE5hbWUsIGJhc2UpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyXSBDcmVhdGluZyAke3RoaXMuX2RyYWZ0ID8gJ2RyYWZ0ICcgOiAnJ31QUiAke2dpdEh1YlN0YXRlLm93bmVyfS8ke2dpdEh1YlN0YXRlLnJlcG99ICR7Y3JlYXRlSGVhZH0gLT4gJHtiYXNlfWApO1xuXHRcdGxldCBjcmVhdGVkOiBDcmVhdGVkUHVsbFJlcXVlc3Q7XG5cdFx0dHJ5IHtcblx0XHRcdGNyZWF0ZWQgPSBhd2FpdCB0aGlzLl9vY3RvS2l0U2VydmljZS5jcmVhdGVQdWxsUmVxdWVzdChcblx0XHRcdFx0Z2l0SHViU3RhdGUub3duZXIsXG5cdFx0XHRcdGdpdEh1YlN0YXRlLnJlcG8sXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRib2R5LFxuXHRcdFx0XHRjcmVhdGVIZWFkLFxuXHRcdFx0XHRiYXNlLFxuXHRcdFx0XHR0aGlzLl9kcmFmdCxcblx0XHRcdFx0YXV0aFRva2VuLFxuXHRcdFx0XHRzaWduYWwsXG5cdFx0XHQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0XHRsZXQgZm91bmRBZnRlckZhaWx1cmU6IENyZWF0ZWRQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvdW5kQWZ0ZXJGYWlsdXJlID0gYXdhaXQgdGhpcy5fb2N0b0tpdFNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKGdpdEh1YlN0YXRlLm93bmVyLCBnaXRIdWJTdGF0ZS5yZXBvLCBoZWFkQnJhbmNoLCBhdXRoVG9rZW4sIHNpZ25hbCwgaGVhZE93bmVyKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZvdW5kQWZ0ZXJGYWlsdXJlKSB7XG5cdFx0XHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZmluYWxpemUoZm91bmRBZnRlckZhaWx1cmUsIHRydWUsIHNlc3Npb25VcmksIGdpdEh1YlN0YXRlLm93bmVyLCBnaXRIdWJTdGF0ZS5yZXBvLCBicmFuY2hOYW1lLCBhdXRoVG9rZW4sIHNpZ25hbCwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZmluYWxpemUoY3JlYXRlZCwgZmFsc2UsIHNlc3Npb25VcmksIGdpdEh1YlN0YXRlLm93bmVyLCBnaXRIdWJTdGF0ZS5yZXBvLCBicmFuY2hOYW1lLCBhdXRoVG9rZW4sIHNpZ25hbCwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5vdGlmaWVzIGxpc3RlbmVycyB0aGF0IHRoZSBwdWxsIHJlcXVlc3Qgbm93IGV4aXN0cywgb3B0aW9uYWxseSBlbmFibGVzXG5cdCAqIGF1dG8tbWVyZ2Ugd2l0aCB0aGUgY29uZmlndXJlZCB7QGxpbmsgQXV0b01lcmdlTWV0aG9kfSAoYmVzdC1lZmZvcnQ6IGFcblx0ICogZmFpbHVyZSB0byBlbmFibGUgYXV0by1tZXJnZSBkb2VzIG5vdCBmYWlsIHRoZSBvcGVyYXRpb24pLCBhbmQgYnVpbGRzIHRoZVxuXHQgKiByZXN1bHQgbWVzc2FnZSBkZXNjcmliaW5nIHdoYXQgaGFwcGVuZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9maW5hbGl6ZShcblx0XHRwcjogQ3JlYXRlZFB1bGxSZXF1ZXN0LFxuXHRcdGlzRXhpc3Rpbmc6IGJvb2xlYW4sXG5cdFx0c2Vzc2lvblVyaTogc3RyaW5nLFxuXHRcdG93bmVyOiBzdHJpbmcsXG5cdFx0cmVwbzogc3RyaW5nLFxuXHRcdGJyYW5jaE5hbWU6IHN0cmluZyxcblx0XHRhdXRoVG9rZW46IHN0cmluZyxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQ+IHtcblx0XHRpZiAoIXRoaXMuX2F1dG9NZXJnZU1ldGhvZCkge1xuXHRcdFx0Ly8gTm8gYXV0by1tZXJnZSBjb25maWd1cmVkXG5cdFx0XHR0aGlzLl9vblB1bGxSZXF1ZXN0Q3JlYXRlZCh7IHNlc3Npb25LZXk6IHNlc3Npb25VcmksIHB1bGxSZXF1ZXN0VXJsOiBwci51cmwsIGJyYW5jaE5hbWUgfSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlUmVzdWx0KHByLCB0aGlzLl9idWlsZE1lc3NhZ2UocHIsIGlzRXhpc3RpbmcsICdub25lJywgdW5kZWZpbmVkKSk7XG5cdFx0fVxuXG5cdFx0bGV0IGF1dG9NZXJnZUVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF1dG9NZXJnZU91dGNvbWU6ICdub25lJyB8ICdlbmFibGVkJyB8ICdmYWlsZWQnID0gJ25vbmUnO1xuXG5cdFx0aWYgKHByLm5vZGVJZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fb2N0b0tpdFNlcnZpY2UuZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2UocHIubm9kZUlkLCB0aGlzLl9hdXRvTWVyZ2VNZXRob2QsIGF1dGhUb2tlbiwgc2lnbmFsKTtcblx0XHRcdFx0YXV0b01lcmdlT3V0Y29tZSA9ICdlbmFibGVkJztcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdFx0YXV0b01lcmdlRXJyb3IgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHRcdGF1dG9NZXJnZU91dGNvbWUgPSAnZmFpbGVkJztcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyXSBGYWlsZWQgdG8gZW5hYmxlIGF1dG8tbWVyZ2UgZm9yICR7b3duZXJ9LyR7cmVwb30jJHtwci5udW1iZXJ9OiAke2F1dG9NZXJnZUVycm9yfWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhdXRvTWVyZ2VFcnJvciA9IGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmF1dG9NZXJnZS5ub05vZGVJZCcsIFwidGhlIHB1bGwgcmVxdWVzdCBpZGVudGlmaWVyIHdhcyBub3QgcmV0dXJuZWQgYnkgR2l0SHViLlwiKTtcblx0XHRcdGF1dG9NZXJnZU91dGNvbWUgPSAnZmFpbGVkJztcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlcl0gQ2Fubm90IGVuYWJsZSBhdXRvLW1lcmdlIGZvciAke293bmVyfS8ke3JlcG99IyR7cHIubnVtYmVyfTogbWlzc2luZyBwdWxsIHJlcXVlc3Qgbm9kZSBpZGApO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uUHVsbFJlcXVlc3RDcmVhdGVkKHsgc2Vzc2lvbktleTogc2Vzc2lvblVyaSwgcHVsbFJlcXVlc3RVcmw6IHByLnVybCwgYnJhbmNoTmFtZSB9KTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlUmVzdWx0KHByLCB0aGlzLl9idWlsZE1lc3NhZ2UocHIsIGlzRXhpc3RpbmcsIGF1dG9NZXJnZU91dGNvbWUsIGF1dG9NZXJnZUVycm9yKSk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZE1lc3NhZ2UocHI6IENyZWF0ZWRQdWxsUmVxdWVzdCwgaXNFeGlzdGluZzogYm9vbGVhbiwgYXV0b01lcmdlT3V0Y29tZTogJ25vbmUnIHwgJ2VuYWJsZWQnIHwgJ2ZhaWxlZCcsIGF1dG9NZXJnZUVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGxldCBtZXJnZU1ldGhvZExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoICh0aGlzLl9hdXRvTWVyZ2VNZXRob2QpIHtcblx0XHRcdGNhc2UgJ1NRVUFTSCc6XG5cdFx0XHRcdG1lcmdlTWV0aG9kTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5hdXRvTWVyZ2Uuc3F1YXNoJywgXCJzcXVhc2hcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnUkVCQVNFJzpcblx0XHRcdFx0bWVyZ2VNZXRob2RMYWJlbCA9IGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmF1dG9NZXJnZS5yZWJhc2UnLCBcInJlYmFzZVwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRtZXJnZU1ldGhvZExhYmVsID0gbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuYXV0b01lcmdlLm1lcmdlJywgXCJtZXJnZVwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRXhpc3RpbmcpIHtcblx0XHRcdHN3aXRjaCAoYXV0b01lcmdlT3V0Y29tZSkge1xuXHRcdFx0XHRjYXNlICdlbmFibGVkJzpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuZXhpc3RpbmcuYXV0b01lcmdlJywgXCJQdWxsIHJlcXVlc3QgWyN7MH1dKHsxfSkgYWxyZWFkeSBleGlzdHM7IGVuYWJsZWQgYXV0by1tZXJnZSAoezJ9KS5cIiwgcHIubnVtYmVyLCBwci51cmwsIG1lcmdlTWV0aG9kTGFiZWwpO1xuXHRcdFx0XHRjYXNlICdmYWlsZWQnOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5leGlzdGluZy5hdXRvTWVyZ2VGYWlsZWQnLCBcIlB1bGwgcmVxdWVzdCBbI3swfV0oezF9KSBhbHJlYWR5IGV4aXN0cywgYnV0IGF1dG8tbWVyZ2UgY291bGQgbm90IGJlIGVuYWJsZWQ6IHsyfVwiLCBwci5udW1iZXIsIHByLnVybCwgYXV0b01lcmdlRXJyb3IgPz8gJycpO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5leGlzdGluZycsIFwiUHVsbCByZXF1ZXN0IFsjezB9XSh7MX0pIGFscmVhZHkgZXhpc3RzLlwiLCBwci5udW1iZXIsIHByLnVybCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChhdXRvTWVyZ2VPdXRjb21lKSB7XG5cdFx0XHRjYXNlICdlbmFibGVkJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmNyZWF0ZWQuYXV0b01lcmdlJywgXCJDcmVhdGVkIHB1bGwgcmVxdWVzdCBbI3swfV0oezF9KSB3aXRoIGF1dG8tbWVyZ2UgKHsyfSkgZW5hYmxlZC5cIiwgcHIubnVtYmVyLCBwci51cmwsIG1lcmdlTWV0aG9kTGFiZWwpO1xuXHRcdFx0Y2FzZSAnZmFpbGVkJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmNyZWF0ZWQuYXV0b01lcmdlRmFpbGVkJywgXCJDcmVhdGVkIHB1bGwgcmVxdWVzdCBbI3swfV0oezF9KSwgYnV0IGF1dG8tbWVyZ2UgY291bGQgbm90IGJlIGVuYWJsZWQ6IHsyfVwiLCBwci5udW1iZXIsIHByLnVybCwgYXV0b01lcmdlRXJyb3IgPz8gJycpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RyYWZ0XG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5jcmVhdGVkRHJhZnQnLCBcIkNyZWF0ZWQgZHJhZnQgcHVsbCByZXF1ZXN0IFsjezB9XSh7MX0pLlwiLCBwci5udW1iZXIsIHByLnVybClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmNyZWF0ZWQnLCBcIkNyZWF0ZWQgcHVsbCByZXF1ZXN0IFsjezB9XSh7MX0pLlwiLCBwci5udW1iZXIsIHByLnVybCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdGhyb3dJZkNhbmNlbGxlZCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiB2b2lkIHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmNhbmNlbGxlZCcsIFwiUHVsbCByZXF1ZXN0IG9wZXJhdGlvbiB3YXMgY2FuY2VsbGVkLlwiKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0VGl0bGUoYnJhbmNoTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBCZWF1dGlmeSBhIGJyYW5jaCBuYW1lIGxpa2UgYGZlYXQvZm9vLWJhcmAgaW50byBgZmVhdDogZm9vIGJhcmAuXG5cdFx0Y29uc3QgaWR4ID0gYnJhbmNoTmFtZS5pbmRleE9mKCcvJyk7XG5cdFx0aWYgKGlkeCA+IDAgJiYgaWR4IDwgYnJhbmNoTmFtZS5sZW5ndGggLSAxKSB7XG5cdFx0XHRjb25zdCBwcmVmaXggPSBicmFuY2hOYW1lLnN1YnN0cmluZygwLCBpZHgpO1xuXHRcdFx0Y29uc3QgcmVzdCA9IGJyYW5jaE5hbWUuc3Vic3RyaW5nKGlkeCArIDEpLnJlcGxhY2UoL1stX10rL2csICcgJyk7XG5cdFx0XHRyZXR1cm4gYCR7cHJlZml4fTogJHtyZXN0fWA7XG5cdFx0fVxuXHRcdHJldHVybiBicmFuY2hOYW1lLnJlcGxhY2UoL1stX10rL2csICcgJyk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRDb21taXRNZXNzYWdlKGJyYW5jaE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmNvbW1pdE1lc3NhZ2UnLCBcIkFnZW50IEhvc3QgY2hhbmdlcyBmb3IgezB9XCIsIGJyYW5jaE5hbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0Qm9keShicmFuY2hOYW1lOiBzdHJpbmcsIGJhc2VCcmFuY2hOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5ib2R5JywgXCJDcmVhdGVkIGZyb20gYHswfWAgdGFyZ2V0aW5nIGB7MX1gLlwiLCBicmFuY2hOYW1lLCBiYXNlQnJhbmNoTmFtZSk7XG5cdH1cblxuXHQvKipcblx0ICogQmVzdC1lZmZvcnQgZ2VuZXJhdGlvbiBvZiBhIFBSIHRpdGxlIGFuZCBkZXNjcmlwdGlvbiB1c2luZyB0aGUgdXRpbGl0eVxuXHQgKiBtb2RlbC4gVGhlIG1vZGVsIGlzIGdpdmVuIHRoZSBtYWluIHNlc3Npb24gY29udmVyc2F0aW9uIChvbmx5IHRoZVxuXHQgKiBtYXJrZG93biB0ZXh0IG9mIHVzZXIgcmVxdWVzdHMgYW5kIGFnZW50IHJlc3BvbnNlcyBcdTIwMTQgdG9vbCBjYWxscyxcblx0ICogc3ViYWdlbnRzLCBhbmQgcmVhc29uaW5nIGFyZSBleGNsdWRlZCBhbmQgdGhlIHRleHQgaXMgY2hhcmFjdGVyLWJvdW5kZWQpXG5cdCAqIGFsb25nIHdpdGggYSBzdW1tYXJ5IG9mIHRoZSBjaGFuZ2VkIGZpbGVzLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm9cblx0ICogQ29waWxvdCB0b2tlbiBpcyBhdmFpbGFibGUgb3IgZ2VuZXJhdGlvbiBmYWlscywgc28gdGhlIGNhbGxlciBjYW4gZmFsbFxuXHQgKiBiYWNrIHRvIHRoZSBicmFuY2gtbmFtZSBiYXNlZCB0aXRsZS9kZXNjcmlwdGlvbi4gUFIgY3JlYXRpb24gbXVzdCBuZXZlclxuXHQgKiBmYWlsIGp1c3QgYmVjYXVzZSB0aGUgbW9kZWwgaXMgdW5hdmFpbGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9nZW5lcmF0ZVRpdGxlQW5kRGVzY3JpcHRpb24oXG5cdFx0c2Vzc2lvblN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCxcblx0XHRicmFuY2hOYW1lOiBzdHJpbmcsXG5cdFx0YmFzZTogc3RyaW5nLFxuXHRcdGJyYW5jaENoYW5nZXM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSxcblx0XHRzaWduYWw6IEFib3J0U2lnbmFsLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx7IHRpdGxlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvcGlsb3RSZXNvdXJjZSA9IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKTtcblx0XHRjb25zdCBjb3BpbG90VG9rZW4gPSB0aGlzLl9hZ2VudFNlcnZpY2UuZ2V0QXV0aFRva2VuKHtcblx0XHRcdHJlc291cmNlOiBjb3BpbG90UmVzb3VyY2UucmVzb3VyY2UsXG5cdFx0XHRzY29wZXM6IGNvcGlsb3RSZXNvdXJjZS5zY29wZXNfc3VwcG9ydGVkLFxuXHRcdH0pO1xuXHRcdGlmICghY29waWxvdFRva2VuKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnZlcnNhdGlvbiA9IGJ1aWxkQ29udmVyc2F0aW9uQ29udGV4dChzZXNzaW9uU3RhdGUudHVybnMsIHsgbWF4Q2hhcnM6IE1BWF9QUl9DT05WRVJTQVRJT05fQ09OVEVYVF9DSEFSUyB9KTtcblx0XHRjb25zdCBjaGFuZ2VTdW1tYXJ5ID0gdGhpcy5fc3VtbWFyaXplRGlmZnNGb3JQcm9tcHQoYnJhbmNoQ2hhbmdlcyk7XG5cdFx0aWYgKCFjb252ZXJzYXRpb24gJiYgIWNoYW5nZVN1bW1hcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnV0aWxpdHlDaGF0Q29tcGxldGlvbihjb3BpbG90VG9rZW4sIHtcblx0XHRcdFx0bWVzc2FnZXM6IHRoaXMuX2J1aWxkVGl0bGVBbmREZXNjcmlwdGlvblByb21wdChicmFuY2hOYW1lLCBiYXNlLCBjb252ZXJzYXRpb24sIGNoYW5nZVN1bW1hcnkpLFxuXHRcdFx0fSwgeyBzaWduYWwgfSk7XG5cdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdHJldHVybiB0aGlzLl9wYXJzZVRpdGxlQW5kRGVzY3JpcHRpb24ocmF3KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyXSBGYWlsZWQgdG8gZ2VuZXJhdGUgUFIgdGl0bGUgYW5kIGRlc2NyaXB0aW9uOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRUaXRsZUFuZERlc2NyaXB0aW9uUHJvbXB0KGJyYW5jaE5hbWU6IHN0cmluZywgYmFzZTogc3RyaW5nLCBjb252ZXJzYXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCwgY2hhbmdlU3VtbWFyeTogc3RyaW5nKTogSUNvcGlsb3RVdGlsaXR5Q2hhdE1lc3NhZ2VbXSB7XG5cdFx0Y29uc3QgdXNlclNlY3Rpb25zOiBzdHJpbmdbXSA9IFtcblx0XHRcdGBCcmFuY2g6ICR7YnJhbmNoTmFtZX1gLFxuXHRcdFx0YEJhc2UgYnJhbmNoOiAke2Jhc2V9YCxcblx0XHRdO1xuXHRcdGlmIChjaGFuZ2VTdW1tYXJ5KSB7XG5cdFx0XHR1c2VyU2VjdGlvbnMucHVzaChgQ2hhbmdlZCBmaWxlczpcXG4ke2NoYW5nZVN1bW1hcnl9YCk7XG5cdFx0fVxuXHRcdGlmIChjb252ZXJzYXRpb24pIHtcblx0XHRcdHVzZXJTZWN0aW9ucy5wdXNoKGBDb252ZXJzYXRpb24gKHRoZSByZXF1ZXN0IHRoYXQgcHJvZHVjZWQgdGhlc2UgY2hhbmdlcyk6XFxuJHtjb252ZXJzYXRpb259YCk7XG5cdFx0fVxuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICdzeXN0ZW0nLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0J1lvdSB3cml0ZSBjbGVhciwgY29uY2lzZSBHaXRIdWIgcHVsbCByZXF1ZXN0IHRpdGxlcyBhbmQgZGVzY3JpcHRpb25zLicsXG5cdFx0XHRcdFx0J1RoZSBmaXJzdCBsaW5lIG9mIHlvdXIgcmVwbHkgaXMgdGhlIFBSIHRpdGxlOiBhIHNob3J0IGltcGVyYXRpdmUgc3VtbWFyeSB1bmRlciA3MiBjaGFyYWN0ZXJzLCB3aXRoIG5vIFwiVGl0bGU6XCIgcHJlZml4LCBubyBzdXJyb3VuZGluZyBxdW90ZXMsIGFuZCBubyBtYXJrZG93biBoZWFkaW5nLicsXG5cdFx0XHRcdFx0J0FmdGVyIHRoZSB0aXRsZSwgYWRkIG9uZSBibGFuayBsaW5lLCB0aGVuIHdyaXRlIHRoZSBQUiBkZXNjcmlwdGlvbiBpbiBHaXRIdWItZmxhdm9yZWQgbWFya2Rvd24uJyxcblx0XHRcdFx0XHQnU3VtbWFyaXplIHdoYXQgY2hhbmdlZCBhbmQgd2h5LCBncm91bmRlZCBpbiB0aGUgY29udmVyc2F0aW9uIGFuZCBjaGFuZ2VkIGZpbGVzLiBVc2UgYSBzaG9ydCBwYXJhZ3JhcGggYW5kL29yIGJ1bGxldCBwb2ludHMuJyxcblx0XHRcdFx0XHQnRG8gbm90IGludmVudCBjaGFuZ2VzIHRoYXQgYXJlIG5vdCBzdXBwb3J0ZWQgYnkgdGhlIHByb3ZpZGVkIGNvbnRleHQsIGFuZCBkbyBub3Qgd3JhcCB0aGUgd2hvbGUgcmVwbHkgaW4gY29kZSBmZW5jZXMuJyxcblx0XHRcdFx0XS5qb2luKCcgJyksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyb2xlOiAndXNlcicsXG5cdFx0XHRcdGNvbnRlbnQ6IHVzZXJTZWN0aW9ucy5qb2luKCdcXG5cXG4nKSxcblx0XHRcdH0sXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgX3N1bW1hcml6ZURpZmZzRm9yUHJvbXB0KGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBsZW5ndGggPSAwO1xuXHRcdGZvciAoY29uc3QgZGlmZiBvZiBkaWZmcykge1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gZGlmZi5iZWZvcmU/LnVyaTtcblx0XHRcdGNvbnN0IGFmdGVyID0gZGlmZi5hZnRlcj8udXJpO1xuXHRcdFx0Y29uc3QgcGF0aCA9IGFmdGVyID8/IGJlZm9yZSA/PyAnKHVua25vd24pJztcblx0XHRcdGxldCBraW5kID0gJ0VkaXQnO1xuXHRcdFx0aWYgKCFiZWZvcmUgJiYgYWZ0ZXIpIHtcblx0XHRcdFx0a2luZCA9ICdDcmVhdGUnO1xuXHRcdFx0fSBlbHNlIGlmIChiZWZvcmUgJiYgIWFmdGVyKSB7XG5cdFx0XHRcdGtpbmQgPSAnRGVsZXRlJztcblx0XHRcdH0gZWxzZSBpZiAoYmVmb3JlICYmIGFmdGVyICYmIGJlZm9yZSAhPT0gYWZ0ZXIpIHtcblx0XHRcdFx0a2luZCA9ICdSZW5hbWUnO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZSA9IGAtICR7a2luZH06ICR7dGhpcy5fZGlzcGxheVVyaShwYXRoKX0gKCske2RpZmYuZGlmZj8uYWRkZWQgPz8gMH0gLSR7ZGlmZi5kaWZmPy5yZW1vdmVkID8/IDB9KWA7XG5cdFx0XHRsaW5lcy5wdXNoKGxpbmUpO1xuXHRcdFx0Ly8gYCsgMWAgYWNjb3VudHMgZm9yIHRoZSBuZXdsaW5lIHRoYXQgam9pbnMgdGhpcyBsaW5lIHRvIHRoZSBwcmV2aW91cyBvbmUuXG5cdFx0XHRsZW5ndGggKz0gbGluZS5sZW5ndGggKyAobGluZXMubGVuZ3RoID4gMSA/IDEgOiAwKTtcblx0XHRcdGlmIChsZW5ndGggPiBNQVhfUFJfQ0hBTkdFX1NVTU1BUllfQ0hBUlMpIHtcblx0XHRcdFx0bGluZXMucHVzaCgnW2ZpbGUgbGlzdCB0cnVuY2F0ZWRdJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwbGF5VXJpKHVyaTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKHVyaSk7XG5cdFx0XHRyZXR1cm4gcGFyc2VkLnNjaGVtZSA9PT0gJ2ZpbGUnID8gcGFyc2VkLmZzUGF0aCA6IHBhcnNlZC5wYXRoIHx8IHVyaTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VUaXRsZUFuZERlc2NyaXB0aW9uKHJhdzogc3RyaW5nKTogeyB0aXRsZTogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGxldCB0ZXh0ID0gcmF3LnRyaW0oKS5yZXBsYWNlKC9cXHJcXG4vZywgJ1xcbicpO1xuXHRcdGNvbnN0IGZlbmNlZCA9IC9eYGBgKD86bWFya2Rvd258bWR8dGV4dCk/XFxzKihbXFxzXFxTXSo/KVxccypgYGAkL2kuZXhlYyh0ZXh0KTtcblx0XHRpZiAoZmVuY2VkKSB7XG5cdFx0XHR0ZXh0ID0gZmVuY2VkWzFdLnRyaW0oKTtcblx0XHR9XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVzID0gdGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0bGV0IGkgPSAwO1xuXHRcdHdoaWxlIChpIDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2ldLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdGkrKztcblx0XHR9XG5cdFx0aWYgKGkgPj0gbGluZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpdGxlID0gbGluZXNbaV0udHJpbSgpXG5cdFx0XHQucmVwbGFjZSgvXiMrXFxzKi8sICcnKVxuXHRcdFx0LnJlcGxhY2UoL150aXRsZTpcXHMqL2ksICcnKVxuXHRcdFx0LnRyaW0oKVxuXHRcdFx0LnJlcGxhY2UoL15cIig/PGlubmVyPi4rKVwiJC8sIChfbWF0Y2gsIGlubmVyKSA9PiBpbm5lcilcblx0XHRcdC50cmltKCk7XG5cdFx0aWYgKCF0aXRsZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGxpbmVzLnNsaWNlKGkgKyAxKS5qb2luKCdcXG4nKS50cmltKCkucmVwbGFjZSgvXmRlc2NyaXB0aW9uOlxccyovaSwgJycpLnRyaW0oKTtcblx0XHRyZXR1cm4geyB0aXRsZSwgZGVzY3JpcHRpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJlc3VsdChjcmVhdGVkOiB7IHJlYWRvbmx5IHVybDogc3RyaW5nOyByZWFkb25seSBudW1iZXI6IG51bWJlciB9LCBtZXNzYWdlOiBzdHJpbmcpOiBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IGZvbGxvd1VwOiBDaGFuZ2VzZXRPcGVyYXRpb25Gb2xsb3dVcCA9IHtcblx0XHRcdGNvbnRlbnQ6IHsgdXJpOiBjcmVhdGVkLnVybCwgY29udGVudFR5cGU6ICd0ZXh0L2h0bWwnIH0sXG5cdFx0XHRleHRlcm5hbDogdHJ1ZSxcblx0XHR9O1xuXHRcdHJldHVybiB7IG1lc3NhZ2U6IHsgbWFya2Rvd246IG1lc3NhZ2UgfSwgZm9sbG93VXAgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxT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
