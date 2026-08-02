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
import { realpath as fsRealpath } from "fs";
import { homedir } from "os";
import { promisify } from "util";
import { firstParallel } from "../../../base/common/async.js";
import { match as globMatch } from "../../../base/common/glob.js";
import { untildify } from "../../../base/common/labels.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import * as path from "../../../base/common/path.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase, normalizePath } from "../../../base/common/resources.js";
import { isDefined } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ILogService } from "../../log/common/log.js";
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, platformRootSchema, platformSessionSchema } from "../common/agentHostSchema.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { ConfirmationOptionKind } from "../common/state/protocol/state.js";
import { ActionType } from "../common/state/sessionActions.js";
import {
  isAhpChatChannel,
  parseRequiredSessionUriFromChatUri,
  ResponsePartKind,
  ToolCallConfirmationReason
} from "../common/state/sessionState.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { CommandAutoApprover } from "./commandAutoApprover.js";
const ALLOW_SESSION_OPTION_ID = "allow-session";
const ALLOW_ONCE_OPTION = { id: "allow-once", label: localize("sessionPermissions.allowOnce", "Allow Once"), kind: ConfirmationOptionKind.Approve };
const SKIP_OPTION = { id: "skip", label: localize("sessionPermissions.skip", "Skip"), kind: ConfirmationOptionKind.Deny, group: 2 };
const CONFIRMATION_OPTIONS = [
  { id: ALLOW_SESSION_OPTION_ID, label: localize("sessionPermissions.allowSession", "Allow in this Session"), kind: ConfirmationOptionKind.Approve, group: 1 },
  ALLOW_ONCE_OPTION,
  SKIP_OPTION
];
const MANAGED_CONFIRMATION_OPTIONS = [ALLOW_ONCE_OPTION, SKIP_OPTION];
const DEFAULT_EDIT_AUTO_APPROVE_PATTERNS = {
  "**/*": true,
  "**/.vscode/*.json": false,
  "**/.git/**": false,
  "**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env}": false,
  "**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props}": false,
  "**/*.lock": false,
  "**/*-lock.{yaml,json}": false,
  // Files that can register lifecycle hooks running arbitrary shell commands.
  // Writing them must never be auto-approved. Keep in sync with the hook and
  // agent source locations in `promptFileLocations.ts`.
  "**/.github/agents/**": false,
  "**/.github/hooks/**": false,
  "**/.claude/agents/**": false,
  "**/.claude/settings.json": false,
  "**/.claude/settings.local.json": false
};
const HOME_DIR = URI.file(homedir());
const PLATFORM_RESTRICTED_DIRS = (isWindows ? [process.env.APPDATA, process.env.LOCALAPPDATA] : isMacintosh ? [homedir() + "/Library"] : []).filter(isDefined);
const realpath = promisify(fsRealpath);
function assertPathIsSafe(fsPath, _isWindows = isWindows) {
  if (fsPath.includes("\0")) {
    throw new Error(`Path contains null bytes: ${fsPath}`);
  }
  if (!_isWindows) {
    return;
  }
  const colonIndex = fsPath.indexOf(":", 2);
  if (colonIndex !== -1) {
    throw new Error(`Path contains invalid characters (alternate data stream): ${fsPath}`);
  }
  const invalidChars = /[<>"|?*]/;
  const pathAfterDrive = fsPath.length > 2 ? fsPath.substring(2) : fsPath;
  if (invalidChars.test(pathAfterDrive)) {
    throw new Error(`Path contains invalid characters: ${fsPath}`);
  }
  if (fsPath.startsWith("\\\\.") || fsPath.startsWith("\\\\?")) {
    throw new Error(`Path is a reserved device path: ${fsPath}`);
  }
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
  const parts = fsPath.split("\\");
  for (const part of parts) {
    if (part.length === 0) {
      continue;
    }
    if (reserved.test(part)) {
      throw new Error(`Reserved device name in path: ${fsPath}`);
    }
    if (part.endsWith(".") || part.endsWith(" ")) {
      throw new Error(`Path contains invalid trailing characters: ${fsPath}`);
    }
    const tildeIndex = part.indexOf("~");
    if (tildeIndex !== -1) {
      const afterTilde = part.substring(tildeIndex + 1);
      if (afterTilde.length > 0 && /^\d/.test(afterTilde)) {
        throw new Error(`Path appears to use short filename format (8.3 names): ${fsPath}. Please use the full path.`);
      }
    }
  }
}
async function resolveRealPathForNonexistent(resource, realpath2) {
  const fsPath = resource.fsPath;
  try {
    return URI.file(await realpath2(fsPath));
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }
  const tail = [path.basename(fsPath)];
  let current = path.dirname(fsPath);
  while (true) {
    const parent = path.dirname(current);
    if (parent === current) {
      return resource;
    }
    try {
      const resolved = await realpath2(current);
      return URI.file(path.join(resolved, ...tail));
    } catch (e) {
      const code = e.code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        throw e;
      }
    }
    tail.unshift(path.basename(current));
    current = parent;
  }
}
let SessionPermissionManager = class extends Disposable {
  constructor(_stateManager, options, _configService, _logService) {
    super();
    this._stateManager = _stateManager;
    this._configService = _configService;
    this._logService = _logService;
    this._realpath = options?.realpath ?? realpath;
    this._commandAutoApprover = this._register(new CommandAutoApprover(this._logService));
  }
  /**
   * Initializes async resources (tree-sitter WASM) used for shell command
   * auto-approval. Await this before any session events can arrive so that
   * shell command parsing within {@link getAutoApproval} is synchronous.
   */
  initialize() {
    return this._commandAutoApprover.initialize();
  }
  // ---- Auto-approval (analogous to getPreConfirmAction) -------------------
  /**
   * Checks whether a `tool_ready` event should be auto-approved. Returns a
   * {@link ToolCallConfirmationReason} when the tool call should proceed
   * without user interaction, or `undefined` when user confirmation is
   * required.
   *
   * Checks are evaluated in order:
   * 1. Global auto-approve setting (`chat.tools.global.autoApprove`)
   * 2. Session-level bypass (`autoApprove` config)
   * 3. Per-tool session permissions (`permissions.allow`)
   * 4. Read path rules (within working directory)
   * 5. Write path rules (within working directory + glob patterns)
   * 6. Shell command rules (tree-sitter parsed, default allow/deny)
   */
  async getAutoApproval(e, sessionKey) {
    const workDirs = this._configService.getEffectiveWorkingDirectories(sessionKey);
    const workingDirectories = workDirs?.map((d) => URI.parse(d));
    if (e.requestSandboxBypass) {
      return void 0;
    }
    if (this.isGlobalAutoApproveEnabled()) {
      return ToolCallConfirmationReason.Setting;
    }
    if (this.isSessionAutoApproveEnabled(sessionKey)) {
      return ToolCallConfirmationReason.Setting;
    }
    if (this._isToolAllowedByPermissions(sessionKey, e.toolCallId)) {
      return ToolCallConfirmationReason.Setting;
    }
    if (e.permissionKind === "read" && e.permissionPath) {
      if (await this._isReadAutoApproved(URI.file(e.permissionPath), workingDirectories)) {
        this._logService.trace(`[SessionPermissionManager] Auto-approving read of ${e.permissionPath}`);
        return ToolCallConfirmationReason.NotNeeded;
      }
      return void 0;
    }
    if (e.permissionKind === "write" && e.permissionPath) {
      if (await this._isEditAutoApproved(URI.file(e.permissionPath), workingDirectories)) {
        this._logService.trace(`[SessionPermissionManager] Auto-approving write to ${e.permissionPath}`);
        return ToolCallConfirmationReason.NotNeeded;
      }
      return void 0;
    }
    if (e.permissionKind === "shell" && e.toolInput) {
      if (!e.shellLanguage) {
        this._logService.trace("[SessionPermissionManager] Shell language is missing, requiring confirmation");
        return void 0;
      }
      if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
        return void 0;
      }
      const result = this._commandAutoApprover.shouldAutoApprove(e.toolInput, {
        autoApproveRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveRulesConfigKey),
        isWriteDestApproved: (dest) => this._isShellWriteDestApproved(dest, workingDirectories),
        language: e.shellLanguage
      });
      if (result === "approved") {
        this._logService.trace("[SessionPermissionManager] Auto-approving shell command");
        return ToolCallConfirmationReason.NotNeeded;
      }
      if (result === "denied") {
        this._logService.trace("[SessionPermissionManager] Shell command denied by rule");
      }
      return void 0;
    }
    return void 0;
  }
  /** Whether adding a persistent terminal auto-approve rule can suppress future prompts for this shell event. */
  isAutoApproveRuleResolvable(e, sessionKey) {
    if (e.permissionKind !== "shell" || !e.toolInput || e.requestSandboxBypass || !e.shellLanguage) {
      return false;
    }
    if (this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveEnabledConfigKey) === false) {
      return false;
    }
    const workDirs = this._configService.getEffectiveWorkingDirectories(sessionKey);
    const workingDirectories = workDirs?.map((d) => URI.parse(d));
    return this._commandAutoApprover.evaluate(e.toolInput, {
      autoApproveRules: this._configService.getRootValue(platformRootSchema, AgentHostTerminalAutoApproveRulesConfigKey),
      isWriteDestApproved: (dest) => this._isShellWriteDestApproved(dest, workingDirectories),
      language: e.shellLanguage
    }).autoApproveRuleResolvable;
  }
  /**
   * Returns whether VS Code's global auto-approve setting (`chat.tools.global.autoApprove`) is enabled.
   * When enabled, every tool call is auto-approved without changing the session's approval level in the permissions picker.
   */
  isGlobalAutoApproveEnabled() {
    return this._configService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true;
  }
  getEffectiveApprovalLevel(sessionKey) {
    return this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove) ?? "default";
  }
  isSessionAutoApproveEnabled(sessionKey) {
    return this.getEffectiveApprovalLevel(sessionKey) === "autoApprove";
  }
  // ---- Action construction (analogous to getPreConfirmActions) -------------
  /**
   * Constructs a `ChatToolCallReady` action from an agent
   * `pending_confirmation` signal. When the tool needs user confirmation
   * (the protocol state carries `confirmationTitle`), the standard
   * confirmation options are baked in so clients can render them directly.
   */
  createToolReadyAction(e, _sessionKey, turnId) {
    const state = e.state;
    if (state.confirmationTitle) {
      return {
        type: ActionType.ChatToolCallReady,
        turnId,
        toolCallId: state.toolCallId,
        ...state.contributor ? { contributor: state.contributor } : {},
        ...state.intention !== void 0 ? { intention: state.intention } : {},
        invocationMessage: state.invocationMessage,
        toolInput: state.toolInput,
        confirmationTitle: state.confirmationTitle,
        riskAssessment: state.riskAssessment,
        edits: state.edits,
        editable: state.editable,
        ...state._meta ? { _meta: state._meta } : {},
        // Managed asks are one-time only. Other agents can supply tool-specific
        // buttons (e.g. ExitPlanMode's `Approve`/`Deny`) via `state.options`;
        // otherwise the standard session/once/skip set is used.
        options: e.managedApprovalRequired ? MANAGED_CONFIRMATION_OPTIONS.slice() : state.options ? state.options.slice() : CONFIRMATION_OPTIONS.slice()
      };
    }
    return {
      type: ActionType.ChatToolCallReady,
      turnId,
      toolCallId: state.toolCallId,
      ...state.contributor ? { contributor: state.contributor } : {},
      ...state.intention !== void 0 ? { intention: state.intention } : {},
      invocationMessage: state.invocationMessage,
      toolInput: state.toolInput,
      confirmed: ToolCallConfirmationReason.NotNeeded,
      ...state._meta ? { _meta: state._meta } : {}
    };
  }
  // ---- Post-confirmation side effects -------------------------------------
  /**
   * Handles the side effect of a `ChatToolCallConfirmed` action when the
   * user selected "Allow in this Session". Adds the tool to the session's
   * permission allow list so future calls are auto-approved.
   */
  handleToolCallConfirmed(chatChannel, toolCallId, selectedOptionId) {
    if (!isAhpChatChannel(chatChannel)) {
      throw new Error(`Tool call confirmations must be handled on an AHP chat channel: ${chatChannel}`);
    }
    const sessionKey = parseRequiredSessionUriFromChatUri(chatChannel);
    if (selectedOptionId === ALLOW_SESSION_OPTION_ID) {
      const toolName = this._getToolNameForToolCall(chatChannel, toolCallId);
      if (toolName) {
        this._addToolToSessionPermissions(sessionKey, toolName);
      }
    }
  }
  // ---- Internal helpers ---------------------------------------------------
  /**
   * Whether a read of `resource` auto-approves against the session's working
   * directories: it must be contained by **at least one** root. The read's
   * symlink-resolved real path is compared too, so a symlink that crosses
   * from one root into another is *not* auto-approved (fail-closed). With a
   * single root this is identical to the previous behaviour.
   */
  async _isReadAutoApproved(resource, workingDirectories) {
    if (!workingDirectories || workingDirectories.length === 0) {
      return false;
    }
    const resourcesToCheck = this._resolveResourcesForApproval(resource);
    const match = await firstParallel(
      workingDirectories.map((directory) => this._isReadContainedByRoot(resourcesToCheck, directory)),
      (approved) => approved
    );
    return match === true;
  }
  /** Whether every resolved read candidate is contained by `workingDirectory` (or its real path). */
  async _isReadContainedByRoot(resourcesToCheckPromise, workingDirectory) {
    const [resourcesToCheck, workingDirectories] = await Promise.all([resourcesToCheckPromise, this._resolveResourcesForApproval(workingDirectory)]);
    return resourcesToCheck !== void 0 && workingDirectories !== void 0 && resourcesToCheck.every((candidate) => workingDirectories.some((directory) => this._isResourceInDirectory(candidate, directory)));
  }
  _isResourceInWorkingDirectory(resource, workingDirectory) {
    return workingDirectory !== void 0 && this._isResourceInDirectory(resource, workingDirectory);
  }
  _isResourceInDirectory(resource, directory) {
    return extUriBiasedIgnorePathCase.isEqualOrParent(normalizePath(resource), normalizePath(directory));
  }
  /**
   * Checks whether a shell write-redirection destination (e.g. the `out.txt`
   * in `echo hi > out.txt`) should be auto-approved by reusing the same
   * rules that govern write tool calls: the destination must resolve to a
   * path inside the working directory and must not match a denied glob.
   */
  _isShellWriteDestApproved(dest, workingDirectories) {
    const resource = this._resolveShellRedirectResource(dest, workingDirectories?.[0]);
    if (!resource) {
      return false;
    }
    return (workingDirectories ?? []).some((workingDirectory) => this._checkWriteResource(resource, workingDirectory));
  }
  /**
   * Resolves the raw text of a shell redirect destination to an absolute
   * filesystem path. `~` is expanded to the user's home directory; the
   * downstream working-directory check rejects paths that end up outside
   * the workspace. Returns `undefined` when resolution would require a
   * working directory that isn't configured, or when the destination expands
   * at runtime and therefore cannot be resolved from its text alone.
   */
  _resolveShellRedirectResource(dest, workingDirectory) {
    const trimmed = untildify(dest.trim(), homedir());
    if (!trimmed) {
      return void 0;
    }
    if (SessionPermissionManager._dynamicRedirectDestRegex.test(trimmed)) {
      this._logService.trace(`[SessionPermissionManager] Redirect destination expands at runtime, requiring confirmation: ${dest}`);
      return void 0;
    }
    if (path.isAbsolute(trimmed)) {
      return URI.file(trimmed);
    }
    if (!workingDirectory) {
      return void 0;
    }
    return URI.file(path.resolve(workingDirectory.fsPath, trimmed));
  }
  /**
   * Determines whether a write to `resource` can be auto-approved. Mirrors the
   * checks performed by the workbench edit-confirmation pipeline:
   *
   * 1. The path is resolved through any symlinks (following ancestors that do
   *    not yet exist) so a link can't redirect an edit outside the working
   *    directory. Both the literal and resolved paths must pass every check.
   * 2. The path must be free of suspicious characters (see {@link assertPathIsSafe}).
   * 3. The path must live inside the working directory.
   * 4. The path must not target a platform-restricted location (home dotfiles,
   *    `~/Library`, `%APPDATA%`, ...).
   * 5. The path must match the edit auto-approve glob rules.
   */
  async _isEditAutoApproved(resource, workingDirectories) {
    if (!workingDirectories || workingDirectories.length === 0) {
      return false;
    }
    const resourcesToCheck = await this._resolveResourcesForApproval(resource);
    if (resourcesToCheck === void 0) {
      return false;
    }
    return workingDirectories.some((workingDirectory) => resourcesToCheck.every((candidate) => this._checkWriteResource(candidate, workingDirectory)));
  }
  /**
   * Returns the literal path plus, for absolute paths, the symlink-resolved
   * real path. Returns `undefined` when the path cannot be resolved due to
   * missing permissions, signalling that confirmation is required.
   */
  async _resolveResourcesForApproval(resource) {
    const resourcesToCheck = [resource];
    if (resource.scheme !== Schemas.file) {
      return resourcesToCheck;
    }
    try {
      const resolved = await resolveRealPathForNonexistent(resource, this._realpath);
      if (!extUriBiasedIgnorePathCase.isEqual(resolved, resource)) {
        resourcesToCheck.push(resolved);
      }
    } catch (e) {
      const code = e.code;
      if (code === "EPERM" || code === "EACCES") {
        return void 0;
      }
    }
    return resourcesToCheck;
  }
  /** Runs the write checks for a single (already symlink-resolved) resource. */
  _checkWriteResource(resource, workingDirectory) {
    try {
      assertPathIsSafe(resource.fsPath);
    } catch {
      return false;
    }
    if (!this._isResourceInWorkingDirectory(resource, workingDirectory)) {
      return false;
    }
    if (this._isPlatformRestrictedResource(resource, workingDirectory)) {
      return false;
    }
    return this._matchesEditAutoApprovePatterns(resource.fsPath);
  }
  /**
   * Returns whether `resource` targets a platform-restricted location that
   * should always require confirmation. Edits within home-directory dotfiles
   * are never auto-approved. Edits within platform config directories are
   * allowed only when the working directory itself lives inside them.
   */
  _isPlatformRestrictedResource(resource, workingDirectory) {
    const relativeToHome = extUriBiasedIgnorePathCase.relativePath(HOME_DIR, resource);
    const topLevelName = relativeToHome?.split("/")[0];
    if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, HOME_DIR) && topLevelName?.startsWith(".")) {
      return true;
    }
    for (const restricted of PLATFORM_RESTRICTED_DIRS) {
      const parentURI = URI.file(restricted);
      if (extUriBiasedIgnorePathCase.isEqualOrParent(resource, parentURI)) {
        return !(workingDirectory && extUriBiasedIgnorePathCase.isEqualOrParent(workingDirectory, parentURI));
      }
    }
    return false;
  }
  _matchesEditAutoApprovePatterns(filePath) {
    let approved = true;
    for (const [pattern, isApproved] of Object.entries(DEFAULT_EDIT_AUTO_APPROVE_PATTERNS)) {
      if (isApproved !== approved && globMatch(pattern, filePath)) {
        approved = isApproved;
      }
    }
    return approved;
  }
  _isToolAllowedByPermissions(sessionKey, toolCallId) {
    const toolName = this._getToolNameForToolCall(sessionKey, toolCallId);
    if (!toolName) {
      return false;
    }
    const permissions = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Permissions);
    const allowed = permissions?.allow.includes(toolName) ?? false;
    if (allowed) {
      this._logService.trace(`[SessionPermissionManager] Auto-approving "${toolName}" via permissions`);
    }
    return allowed;
  }
  _getToolNameForToolCall(sessionKey, toolCallId) {
    const sessionState = this._stateManager.getSessionState(sessionKey);
    const parts = sessionState?.activeTurn?.responseParts;
    if (!parts) {
      return void 0;
    }
    for (const rp of parts) {
      if (rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId) {
        return rp.toolCall.toolName;
      }
    }
    return void 0;
  }
  _addToolToSessionPermissions(sessionKey, toolName) {
    const permissions = this._configService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Permissions) ?? { allow: [], deny: [] };
    if (permissions.allow.includes(toolName)) {
      return;
    }
    this._configService.updateSessionConfig(sessionKey, {
      [SessionConfigKey.Permissions]: {
        allow: [...permissions.allow, toolName],
        deny: [...permissions.deny]
      }
    });
    this._logService.info(`[SessionPermissionManager] Added "${toolName}" to session permissions for ${sessionKey}`);
  }
};
/**
 * Matches redirect destinations whose final path is decided by the shell
 * rather than by the text: variable expansions (`$HOME/x`, `$env:TEMP/x`,
 * `%APPDATA%\x`), command substitutions (`$(pwd)/x`, `` `pwd`/x ``), brace
 * expansions, and `~` in a position {@link untildify} does not handle.
 * Mirrors the workbench's file-write analyzer guard.
 *
 * See https://github.com/microsoft/vscode/issues/274166 and
 * https://github.com/microsoft/vscode/issues/274167
 */
SessionPermissionManager._dynamicRedirectDestRegex = /[$(){}`~%]/;
SessionPermissionManager = __decorateClass([
  __decorateParam(2, IAgentConfigurationService),
  __decorateParam(3, ILogService)
], SessionPermissionManager);
export {
  SessionPermissionManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3Nlc3Npb25QZXJtaXNzaW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlYWxwYXRoIGFzIGZzUmVhbHBhdGggfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBob21lZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgcHJvbWlzaWZ5IH0gZnJvbSAndXRpbCc7XG5pbXBvcnQgeyBmaXJzdFBhcmFsbGVsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgbWF0Y2ggYXMgZ2xvYk1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyB1bnRpbGRpZnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLCBub3JtYWxpemVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWF0aW9uT3B0aW9uS2luZCwgdHlwZSBDb25maXJtYXRpb25PcHRpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBJVG9vbENhbGxSZWFkeUFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRpc0FocENoYXRDaGFubmVsLFxuXHRwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpLFxuXHRSZXNwb25zZVBhcnRLaW5kLFxuXHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbixcblx0dHlwZSBVUkkgYXMgUHJvdG9jb2xVUkksXG59IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZEF1dG9BcHByb3ZlciB9IGZyb20gJy4vY29tbWFuZEF1dG9BcHByb3Zlci5qcyc7XG5cbi8qKlxuICogRXZlbnQgZmllbGRzIG5lZWRlZCBmb3IgYXV0by1hcHByb3ZhbCBkZWNpc2lvbnMuXG4gKiBNYXRjaGVzIHRoZSBzdWJzZXQgb2Yge0BsaW5rIElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsfSB1c2VkIGJ5IHRoZVxuICogYXBwcm92YWwgcGlwZWxpbmUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVRvb2xBcHByb3ZhbEV2ZW50IHtcblx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uOiBVUkk7XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25LaW5kPzogSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWxbJ3Blcm1pc3Npb25LaW5kJ107XG5cdHJlYWRvbmx5IHBlcm1pc3Npb25QYXRoPzogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sSW5wdXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcXVlc3RTYW5kYm94QnlwYXNzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hlbGxMYW5ndWFnZT86IElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsWydzaGVsbExhbmd1YWdlJ107XG59XG5cbi8qKiBTdGFuZGFyZCBwZXItdG9vbCBjb25maXJtYXRpb24gb3B0aW9ucyBwcmVzZW50ZWQgdG8gdGhlIHVzZXIuICovXG5jb25zdCBBTExPV19TRVNTSU9OX09QVElPTl9JRCA9ICdhbGxvdy1zZXNzaW9uJztcbmNvbnN0IEFMTE9XX09OQ0VfT1BUSU9OOiBDb25maXJtYXRpb25PcHRpb24gPSB7IGlkOiAnYWxsb3ctb25jZScsIGxhYmVsOiBsb2NhbGl6ZSgnc2Vzc2lvblBlcm1pc3Npb25zLmFsbG93T25jZScsIFwiQWxsb3cgT25jZVwiKSwga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5BcHByb3ZlIH07XG5jb25zdCBTS0lQX09QVElPTjogQ29uZmlybWF0aW9uT3B0aW9uID0geyBpZDogJ3NraXAnLCBsYWJlbDogbG9jYWxpemUoJ3Nlc3Npb25QZXJtaXNzaW9ucy5za2lwJywgXCJTa2lwXCIpLCBraW5kOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkRlbnksIGdyb3VwOiAyIH07XG5jb25zdCBDT05GSVJNQVRJT05fT1BUSU9OUzogcmVhZG9ubHkgQ29uZmlybWF0aW9uT3B0aW9uW10gPSBbXG5cdHsgaWQ6IEFMTE9XX1NFU1NJT05fT1BUSU9OX0lELCBsYWJlbDogbG9jYWxpemUoJ3Nlc3Npb25QZXJtaXNzaW9ucy5hbGxvd1Nlc3Npb24nLCBcIkFsbG93IGluIHRoaXMgU2Vzc2lvblwiKSwga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5BcHByb3ZlLCBncm91cDogMSB9LFxuXHRBTExPV19PTkNFX09QVElPTixcblx0U0tJUF9PUFRJT04sXG5dO1xuY29uc3QgTUFOQUdFRF9DT05GSVJNQVRJT05fT1BUSU9OUzogcmVhZG9ubHkgQ29uZmlybWF0aW9uT3B0aW9uW10gPSBbQUxMT1dfT05DRV9PUFRJT04sIFNLSVBfT1BUSU9OXTtcblxuLyoqIERlZmF1bHQgd3JpdGUtcGF0aCBnbG9iIHJ1bGVzIGFwcGxpZWQgdG8gYXV0by1hcHByb3ZlZCBlZGl0cy4gKi9cbmNvbnN0IERFRkFVTFRfRURJVF9BVVRPX0FQUFJPVkVfUEFUVEVSTlM6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PiA9IHtcblx0JyoqLyonOiB0cnVlLFxuXHQnKiovLnZzY29kZS8qLmpzb24nOiBmYWxzZSxcblx0JyoqLy5naXQvKionOiBmYWxzZSxcblx0JyoqL3twYWNrYWdlLmpzb24sc2VydmVyLnhtbCxidWlsZC5ycyx3ZWIuY29uZmlnLC5naXRhdHRyaWJ1dGVzLC5lbnZ9JzogZmFsc2UsXG5cdCcqKi8qLntjb2RlLXdvcmtzcGFjZSxjc3Byb2osZnNwcm9qLHZicHJvaix2Y3hwcm9qLHByb2osdGFyZ2V0cyxwcm9wc30nOiBmYWxzZSxcblx0JyoqLyoubG9jayc6IGZhbHNlLFxuXHQnKiovKi1sb2NrLnt5YW1sLGpzb259JzogZmFsc2UsXG5cdC8vIEZpbGVzIHRoYXQgY2FuIHJlZ2lzdGVyIGxpZmVjeWNsZSBob29rcyBydW5uaW5nIGFyYml0cmFyeSBzaGVsbCBjb21tYW5kcy5cblx0Ly8gV3JpdGluZyB0aGVtIG11c3QgbmV2ZXIgYmUgYXV0by1hcHByb3ZlZC4gS2VlcCBpbiBzeW5jIHdpdGggdGhlIGhvb2sgYW5kXG5cdC8vIGFnZW50IHNvdXJjZSBsb2NhdGlvbnMgaW4gYHByb21wdEZpbGVMb2NhdGlvbnMudHNgLlxuXHQnKiovLmdpdGh1Yi9hZ2VudHMvKionOiBmYWxzZSxcblx0JyoqLy5naXRodWIvaG9va3MvKionOiBmYWxzZSxcblx0JyoqLy5jbGF1ZGUvYWdlbnRzLyoqJzogZmFsc2UsXG5cdCcqKi8uY2xhdWRlL3NldHRpbmdzLmpzb24nOiBmYWxzZSxcblx0JyoqLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbic6IGZhbHNlLFxufTtcblxuY29uc3QgSE9NRV9ESVIgPSBVUkkuZmlsZShob21lZGlyKCkpO1xuXG4vKipcbiAqIEFic29sdXRlIGRpcmVjdG9yeSBwcmVmaXhlcyB3aG9zZSBjb250ZW50cyBhcmUgcGxhdGZvcm0gY29uZmlndXJhdGlvbiBkYXRhXG4gKiAoZS5nLiBgfi9MaWJyYXJ5YCwgYCVBUFBEQVRBJWApLiBXcml0ZXMgdW5kZXIgdGhlc2UgcmVxdWlyZSBjb25maXJtYXRpb25cbiAqIHVubGVzcyB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXRzZWxmIGxpdmVzIGluc2lkZSB0aGUgcmVzdHJpY3RlZCBkaXJlY3RvcnkuXG4gKi9cbmNvbnN0IFBMQVRGT1JNX1JFU1RSSUNURURfRElSUzogcmVhZG9ubHkgc3RyaW5nW10gPSAoXG5cdGlzV2luZG93c1xuXHRcdD8gW3Byb2Nlc3MuZW52LkFQUERBVEEsIHByb2Nlc3MuZW52LkxPQ0FMQVBQREFUQV1cblx0XHQ6IGlzTWFjaW50b3NoXG5cdFx0XHQ/IFtob21lZGlyKCkgKyAnL0xpYnJhcnknXVxuXHRcdFx0OiBbXVxuKS5maWx0ZXIoaXNEZWZpbmVkKTtcblxuY29uc3QgcmVhbHBhdGggPSBwcm9taXNpZnkoZnNSZWFscGF0aCk7XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoYXQgYSBwYXRoIGRvZXNuJ3QgY29udGFpbiBzdXNwaWNpb3VzIGNoYXJhY3RlcnMgdGhhdCBjb3VsZCBiZVxuICogdXNlZCB0byBieXBhc3Mgc2VjdXJpdHkgY2hlY2tzIG9uIFdpbmRvd3MgKGUuZy4gTlRGUyBBbHRlcm5hdGUgRGF0YSBTdHJlYW1zLFxuICogaW52YWxpZCBjaGFyYWN0ZXJzLCByZXNlcnZlZCBkZXZpY2UgbmFtZXMpLiBUaHJvd3MgaWYgdGhlIHBhdGggaXMgc3VzcGljaW91cy5cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0UGF0aElzU2FmZShmc1BhdGg6IHN0cmluZywgX2lzV2luZG93cyA9IGlzV2luZG93cyk6IHZvaWQge1xuXHRpZiAoZnNQYXRoLmluY2x1ZGVzKCdcXDAnKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgUGF0aCBjb250YWlucyBudWxsIGJ5dGVzOiAke2ZzUGF0aH1gKTtcblx0fVxuXG5cdGlmICghX2lzV2luZG93cykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIENoZWNrIGZvciBOVEZTIEFsdGVybmF0ZSBEYXRhIFN0cmVhbXMgKEFEUylcblx0Y29uc3QgY29sb25JbmRleCA9IGZzUGF0aC5pbmRleE9mKCc6JywgMik7XG5cdGlmIChjb2xvbkluZGV4ICE9PSAtMSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgUGF0aCBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMgKGFsdGVybmF0ZSBkYXRhIHN0cmVhbSk6ICR7ZnNQYXRofWApO1xuXHR9XG5cblx0Ly8gQ2hlY2sgZm9yIGludmFsaWQgV2luZG93cyBmaWxlbmFtZSBjaGFyYWN0ZXJzXG5cdGNvbnN0IGludmFsaWRDaGFycyA9IC9bPD5cInw/Kl0vO1xuXHRjb25zdCBwYXRoQWZ0ZXJEcml2ZSA9IGZzUGF0aC5sZW5ndGggPiAyID8gZnNQYXRoLnN1YnN0cmluZygyKSA6IGZzUGF0aDtcblx0aWYgKGludmFsaWRDaGFycy50ZXN0KHBhdGhBZnRlckRyaXZlKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgUGF0aCBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnM6ICR7ZnNQYXRofWApO1xuXHR9XG5cblx0Ly8gQ2hlY2sgZm9yIG5hbWVkIHBpcGVzIG9yIGRldmljZSBwYXRoc1xuXHRpZiAoZnNQYXRoLnN0YXJ0c1dpdGgoJ1xcXFxcXFxcLicpIHx8IGZzUGF0aC5zdGFydHNXaXRoKCdcXFxcXFxcXD8nKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgUGF0aCBpcyBhIHJlc2VydmVkIGRldmljZSBwYXRoOiAke2ZzUGF0aH1gKTtcblx0fVxuXG5cdGNvbnN0IHJlc2VydmVkID0gL14oQ09OfFBSTnxBVVh8TlVMfENPTVsxLTldfExQVFsxLTldKShcXC58JCkvaTtcblxuXHQvLyBDaGVjayBmb3IgdHJhaWxpbmcgZG90cyBhbmQgc3BhY2VzIG9uIHBhdGggY29tcG9uZW50cyAoV2luZG93cyBxdWlyaylcblx0Y29uc3QgcGFydHMgPSBmc1BhdGguc3BsaXQoJ1xcXFwnKTtcblx0Zm9yIChjb25zdCBwYXJ0IG9mIHBhcnRzKSB7XG5cdFx0aWYgKHBhcnQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAocmVzZXJ2ZWQudGVzdChwYXJ0KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZXNlcnZlZCBkZXZpY2UgbmFtZSBpbiBwYXRoOiAke2ZzUGF0aH1gKTtcblx0XHR9XG5cblx0XHRpZiAocGFydC5lbmRzV2l0aCgnLicpIHx8IHBhcnQuZW5kc1dpdGgoJyAnKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQYXRoIGNvbnRhaW5zIGludmFsaWQgdHJhaWxpbmcgY2hhcmFjdGVyczogJHtmc1BhdGh9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGlsZGVJbmRleCA9IHBhcnQuaW5kZXhPZignficpO1xuXHRcdGlmICh0aWxkZUluZGV4ICE9PSAtMSkge1xuXHRcdFx0Y29uc3QgYWZ0ZXJUaWxkZSA9IHBhcnQuc3Vic3RyaW5nKHRpbGRlSW5kZXggKyAxKTtcblx0XHRcdGlmIChhZnRlclRpbGRlLmxlbmd0aCA+IDAgJiYgL15cXGQvLnRlc3QoYWZ0ZXJUaWxkZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQYXRoIGFwcGVhcnMgdG8gdXNlIHNob3J0IGZpbGVuYW1lIGZvcm1hdCAoOC4zIG5hbWVzKTogJHtmc1BhdGh9LiBQbGVhc2UgdXNlIHRoZSBmdWxsIHBhdGguYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHJlYWwgcGF0aCBvZiBgcmVzb3VyY2VgLCB3YWxraW5nIHVwIHRoZSBwYXJlbnQgY2hhaW4gd2hlbiB0aGUgcGF0aFxuICogKG9yIGl0cyBhbmNlc3RvcnMpIGRvZXMgbm90IHlldCBleGlzdCBvbiBkaXNrLiBUaGlzIGVuc3VyZXMgYSBzeW1saW5rIGF0IGFueVxuICogYW5jZXN0b3IgaXMgZm9sbG93ZWQgZXZlbiBmb3IgZmlsZXMgdGhhdCBhcmUgYWJvdXQgdG8gYmUgY3JlYXRlZC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVJlYWxQYXRoRm9yTm9uZXhpc3RlbnQocmVzb3VyY2U6IFVSSSwgcmVhbHBhdGg6IChmc1BhdGg6IHN0cmluZykgPT4gUHJvbWlzZTxzdHJpbmc+KTogUHJvbWlzZTxVUkk+IHtcblx0Y29uc3QgZnNQYXRoID0gcmVzb3VyY2UuZnNQYXRoO1xuXHR0cnkge1xuXHRcdHJldHVybiBVUkkuZmlsZShhd2FpdCByZWFscGF0aChmc1BhdGgpKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGlmICgoZSBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGUgIT09ICdFTk9FTlQnKSB7XG5cdFx0XHR0aHJvdyBlO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHRhaWw6IHN0cmluZ1tdID0gW3BhdGguYmFzZW5hbWUoZnNQYXRoKV07XG5cdGxldCBjdXJyZW50ID0gcGF0aC5kaXJuYW1lKGZzUGF0aCk7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0Y29uc3QgcGFyZW50ID0gcGF0aC5kaXJuYW1lKGN1cnJlbnQpO1xuXHRcdGlmIChwYXJlbnQgPT09IGN1cnJlbnQpIHtcblx0XHRcdC8vIFJlYWNoZWQgdGhlIGZpbGVzeXN0ZW0gcm9vdCB3aXRob3V0IGZpbmRpbmcgYW4gZXhpc3RpbmcgYW5jZXN0b3IuXG5cdFx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHJlYWxwYXRoKGN1cnJlbnQpO1xuXHRcdFx0cmV0dXJuIFVSSS5maWxlKHBhdGguam9pbihyZXNvbHZlZCwgLi4udGFpbCkpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IGNvZGUgPSAoZSBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGU7XG5cdFx0XHRpZiAoY29kZSAhPT0gJ0VOT0VOVCcgJiYgY29kZSAhPT0gJ0VOT1RESVInKSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRhaWwudW5zaGlmdChwYXRoLmJhc2VuYW1lKGN1cnJlbnQpKTtcblx0XHRjdXJyZW50ID0gcGFyZW50O1xuXHR9XG59XG5cbi8qKlxuICogU2luZ2xlIGVudHJ5IHBvaW50IGZvciBhbGwgdG9vbC1jYWxsIGFwcHJvdmFsIGxvZ2ljIGluIHRoZSBhZ2VudCBob3N0LlxuICpcbiAqIE1vZGVsZWQgYWZ0ZXIge0BsaW5rIElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlfSBpbiB0aGVcbiAqIHdvcmtiZW5jaCBsYXllciwgdGhpcyBtYW5hZ2VyIG93bnM6XG4gKlxuICogLSAqKkF1dG8tYXBwcm92YWwqKiAoYGdldEF1dG9BcHByb3ZhbGApIFx1MjAxNCBjaGVja3Mgc2Vzc2lvbi1sZXZlbCBjb25maWcsXG4gKiAgIHBlci10b29sIHNlc3Npb24gcGVybWlzc2lvbnMsIHJlYWQvd3JpdGUgcGF0aCBydWxlcywgYW5kIHNoZWxsXG4gKiAgIGNvbW1hbmQgcnVsZXMuIFJldHVybnMgYSB7QGxpbmsgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb259IHdoZW5cbiAqICAgdGhlIHRvb2wgc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQsIG9yIGB1bmRlZmluZWRgIHdoZW4gdXNlclxuICogICBjb25maXJtYXRpb24gaXMgbmVlZGVkLlxuICpcbiAqIC0gKipDb25maXJtYXRpb24gb3B0aW9ucyoqIChgY3JlYXRlVG9vbFJlYWR5QWN0aW9uYCkgXHUyMDE0IGNvbnN0cnVjdHMgdGhlXG4gKiAgIHByb3RvY29sIGFjdGlvbiB3aXRoIHRoZSBzdGFuZGFyZCBcIkFsbG93IE9uY2UgLyBBbGxvdyBpbiB0aGlzXG4gKiAgIFNlc3Npb24gLyBTa2lwXCIgb3B0aW9ucyBiYWtlZCBpbi5cbiAqXG4gKiAtICoqUG9zdC1jb25maXJtYXRpb24gc2lkZSBlZmZlY3RzKiogKGBoYW5kbGVUb29sQ2FsbENvbmZpcm1lZGApIFx1MjAxNFxuICogICBwZXJzaXN0cyB0aGUgdXNlcidzIGNob2ljZSAoZS5nLiBhZGRpbmcgYSB0b29sIHRvIHRoZSBzZXNzaW9uXG4gKiAgIHBlcm1pc3Npb25zIGxpc3QpLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Ly8gLS0tLSBFZGl0IGF1dG8tYXBwcm92ZSBwYXR0ZXJucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRBdXRvQXBwcm92ZXI6IENvbW1hbmRBdXRvQXBwcm92ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWxwYXRoOiAoZnNQYXRoOiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRvcHRpb25zOiB7IHJlYWxwYXRoPzogKGZzUGF0aDogc3RyaW5nKSA9PiBQcm9taXNlPHN0cmluZz4gfSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlnU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlYWxwYXRoID0gb3B0aW9ucz8ucmVhbHBhdGggPz8gcmVhbHBhdGg7XG5cdFx0dGhpcy5fY29tbWFuZEF1dG9BcHByb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb21tYW5kQXV0b0FwcHJvdmVyKHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbml0aWFsaXplcyBhc3luYyByZXNvdXJjZXMgKHRyZWUtc2l0dGVyIFdBU00pIHVzZWQgZm9yIHNoZWxsIGNvbW1hbmRcblx0ICogYXV0by1hcHByb3ZhbC4gQXdhaXQgdGhpcyBiZWZvcmUgYW55IHNlc3Npb24gZXZlbnRzIGNhbiBhcnJpdmUgc28gdGhhdFxuXHQgKiBzaGVsbCBjb21tYW5kIHBhcnNpbmcgd2l0aGluIHtAbGluayBnZXRBdXRvQXBwcm92YWx9IGlzIHN5bmNocm9ub3VzLlxuXHQgKi9cblx0aW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZEF1dG9BcHByb3Zlci5pbml0aWFsaXplKCk7XG5cdH1cblxuXHQvLyAtLS0tIEF1dG8tYXBwcm92YWwgKGFuYWxvZ291cyB0byBnZXRQcmVDb25maXJtQWN0aW9uKSAtLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIENoZWNrcyB3aGV0aGVyIGEgYHRvb2xfcmVhZHlgIGV2ZW50IHNob3VsZCBiZSBhdXRvLWFwcHJvdmVkLiBSZXR1cm5zIGFcblx0ICoge0BsaW5rIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29ufSB3aGVuIHRoZSB0b29sIGNhbGwgc2hvdWxkIHByb2NlZWRcblx0ICogd2l0aG91dCB1c2VyIGludGVyYWN0aW9uLCBvciBgdW5kZWZpbmVkYCB3aGVuIHVzZXIgY29uZmlybWF0aW9uIGlzXG5cdCAqIHJlcXVpcmVkLlxuXHQgKlxuXHQgKiBDaGVja3MgYXJlIGV2YWx1YXRlZCBpbiBvcmRlcjpcblx0ICogMS4gR2xvYmFsIGF1dG8tYXBwcm92ZSBzZXR0aW5nIChgY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmVgKVxuXHQgKiAyLiBTZXNzaW9uLWxldmVsIGJ5cGFzcyAoYGF1dG9BcHByb3ZlYCBjb25maWcpXG5cdCAqIDMuIFBlci10b29sIHNlc3Npb24gcGVybWlzc2lvbnMgKGBwZXJtaXNzaW9ucy5hbGxvd2ApXG5cdCAqIDQuIFJlYWQgcGF0aCBydWxlcyAod2l0aGluIHdvcmtpbmcgZGlyZWN0b3J5KVxuXHQgKiA1LiBXcml0ZSBwYXRoIHJ1bGVzICh3aXRoaW4gd29ya2luZyBkaXJlY3RvcnkgKyBnbG9iIHBhdHRlcm5zKVxuXHQgKiA2LiBTaGVsbCBjb21tYW5kIHJ1bGVzICh0cmVlLXNpdHRlciBwYXJzZWQsIGRlZmF1bHQgYWxsb3cvZGVueSlcblx0ICovXG5cdGFzeW5jIGdldEF1dG9BcHByb3ZhbChlOiBJVG9vbEFwcHJvdmFsRXZlbnQsIHNlc3Npb25LZXk6IFByb3RvY29sVVJJKTogUHJvbWlzZTxUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIGBzZXNzaW9uS2V5YCBpcyB0aGUgY2hhdCBjaGFubmVsIFVSSSAoc2VlIGBfaGFuZGxlVG9vbFJlYWR5YCksIHNvIHRoZVxuXHRcdC8vIHN0YXRlIG1hbmFnZXIgcmV0dXJucyB0aGF0IGNoYXQncyAqZWZmZWN0aXZlKiB3b3JraW5nLWRpcmVjdG9yeSBzZXRcblx0XHQvLyAoaXRzIG93biBzdWJzZXQgb3ZlcnJpZGUgd2hlbiBwcmVzZW50LCBlbHNlIHRoZSBzZXNzaW9uJ3MgZnVsbCBzZXQgXHUyMDE0XG5cdFx0Ly8gcGVlciBjaGF0cyBpbmhlcml0KS4gQSByZWFkL3dyaXRlL3NoZWxsIGRlc3RpbmF0aW9uIGF1dG8tYXBwcm92ZXMgd2hlblxuXHRcdC8vIGNvbnRhaW5lZCBieSAqYW55KiByb290LiBUb2RheSB0aGUgc2V0IGhhcyBleGFjdGx5IG9uZSBlbnRyeSAodGhlXG5cdFx0Ly8gY3JlYXRlLXRpbWUgbGVuZ3RoIGd1YXJkKSwgc28gdGhpcyBpcyBiZWhhdmlvdXItaWRlbnRpY2FsIHRvIHRoZVxuXHRcdC8vIHByZXZpb3VzIHNpbmdsZS1kaXJlY3RvcnkgbG9naWMuXG5cdFx0Y29uc3Qgd29ya0RpcnMgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uS2V5KTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB3b3JrRGlycz8ubWFwKGQgPT4gVVJJLnBhcnNlKGQpKTtcblxuXHRcdC8vIDAuIFNhbmRib3ggYnlwYXNzOiBhIHNoZWxsIGNvbW1hbmQgdGhhdCBvcHRlZCBvdXQgb2YgdGhlXG5cdFx0Ly8gc2FuZGJveCAoYHJlcXVlc3RTYW5kYm94QnlwYXNzYCkgZXNjYXBlcyB0aGUgc2FuZGJveCdzXG5cdFx0Ly8gY29udGFpbm1lbnQuXG5cdFx0aWYgKGUucmVxdWVzdFNhbmRib3hCeXBhc3MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gMS4gR2xvYmFsIGF1dG8tYXBwcm92ZSBzZXR0aW5nXG5cdFx0aWYgKHRoaXMuaXNHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gMi4gU2Vzc2lvbi1sZXZlbCBhdXRvLWFwcHJvdmVcblx0XHRpZiAodGhpcy5pc1Nlc3Npb25BdXRvQXBwcm92ZUVuYWJsZWQoc2Vzc2lvbktleSkpIHtcblx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nO1xuXHRcdH1cblxuXHRcdC8vIDMuIFBlci10b29sIHNlc3Npb24gcGVybWlzc2lvbnNcblx0XHRpZiAodGhpcy5faXNUb29sQWxsb3dlZEJ5UGVybWlzc2lvbnMoc2Vzc2lvbktleSwgZS50b29sQ2FsbElkKSkge1xuXHRcdFx0cmV0dXJuIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gNC4gUmVhZCBhdXRvLWFwcHJvdmFsXG5cdFx0aWYgKGUucGVybWlzc2lvbktpbmQgPT09ICdyZWFkJyAmJiBlLnBlcm1pc3Npb25QYXRoKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5faXNSZWFkQXV0b0FwcHJvdmVkKFVSSS5maWxlKGUucGVybWlzc2lvblBhdGgpLCB3b3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXJdIEF1dG8tYXBwcm92aW5nIHJlYWQgb2YgJHtlLnBlcm1pc3Npb25QYXRofWApO1xuXHRcdFx0XHRyZXR1cm4gVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyA1LiBXcml0ZSBhdXRvLWFwcHJvdmFsXG5cdFx0aWYgKGUucGVybWlzc2lvbktpbmQgPT09ICd3cml0ZScgJiYgZS5wZXJtaXNzaW9uUGF0aCkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX2lzRWRpdEF1dG9BcHByb3ZlZChVUkkuZmlsZShlLnBlcm1pc3Npb25QYXRoKSwgd29ya2luZ0RpcmVjdG9yaWVzKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBBdXRvLWFwcHJvdmluZyB3cml0ZSB0byAke2UucGVybWlzc2lvblBhdGh9YCk7XG5cdFx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIDYuIFNoZWxsIGF1dG8tYXBwcm92YWxcblx0XHRpZiAoZS5wZXJtaXNzaW9uS2luZCA9PT0gJ3NoZWxsJyAmJiBlLnRvb2xJbnB1dCkge1xuXHRcdFx0Ly8gVGVybWluYWwtcnVsZSBhbmFseXNpcyBuZWVkcyBhbiBleHBsaWNpdCBzaGVsbCBkaWFsZWN0LiBQcm9kdWNlcnNcblx0XHRcdC8vIHRoYXQgb21pdCBgc2hlbGxMYW5ndWFnZWAgKG9yIGZhaWwgdG8gY29ycmVsYXRlIG9uZSkgbXVzdCBwcm9tcHQuXG5cdFx0XHRpZiAoIWUuc2hlbGxMYW5ndWFnZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBTaGVsbCBsYW5ndWFnZSBpcyBtaXNzaW5nLCByZXF1aXJpbmcgY29uZmlybWF0aW9uJyk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29uZmlnU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jb21tYW5kQXV0b0FwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKGUudG9vbElucHV0LCB7XG5cdFx0XHRcdGF1dG9BcHByb3ZlUnVsZXM6IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5KSxcblx0XHRcdFx0aXNXcml0ZURlc3RBcHByb3ZlZDogZGVzdCA9PiB0aGlzLl9pc1NoZWxsV3JpdGVEZXN0QXBwcm92ZWQoZGVzdCwgd29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdFx0bGFuZ3VhZ2U6IGUuc2hlbGxMYW5ndWFnZSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gJ2FwcHJvdmVkJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBBdXRvLWFwcHJvdmluZyBzaGVsbCBjb21tYW5kJyk7XG5cdFx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSAnZGVuaWVkJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyXSBTaGVsbCBjb21tYW5kIGRlbmllZCBieSBydWxlJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogV2hldGhlciBhZGRpbmcgYSBwZXJzaXN0ZW50IHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlIGNhbiBzdXBwcmVzcyBmdXR1cmUgcHJvbXB0cyBmb3IgdGhpcyBzaGVsbCBldmVudC4gKi9cblx0aXNBdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlKGU6IElUb29sQXBwcm92YWxFdmVudCwgc2Vzc2lvbktleTogUHJvdG9jb2xVUkkpOiBib29sZWFuIHtcblx0XHRpZiAoZS5wZXJtaXNzaW9uS2luZCAhPT0gJ3NoZWxsJyB8fCAhZS50b29sSW5wdXQgfHwgZS5yZXF1ZXN0U2FuZGJveEJ5cGFzcyB8fCAhZS5zaGVsbExhbmd1YWdlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25maWdTZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5KSA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya0RpcnMgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uS2V5KTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB3b3JrRGlycz8ubWFwKGQgPT4gVVJJLnBhcnNlKGQpKTtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZEF1dG9BcHByb3Zlci5ldmFsdWF0ZShlLnRvb2xJbnB1dCwge1xuXHRcdFx0YXV0b0FwcHJvdmVSdWxlczogdGhpcy5fY29uZmlnU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXkpLFxuXHRcdFx0aXNXcml0ZURlc3RBcHByb3ZlZDogZGVzdCA9PiB0aGlzLl9pc1NoZWxsV3JpdGVEZXN0QXBwcm92ZWQoZGVzdCwgd29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdGxhbmd1YWdlOiBlLnNoZWxsTGFuZ3VhZ2UsXG5cdFx0fSkuYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgVlMgQ29kZSdzIGdsb2JhbCBhdXRvLWFwcHJvdmUgc2V0dGluZyAoYGNoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlYCkgaXMgZW5hYmxlZC5cblx0ICogV2hlbiBlbmFibGVkLCBldmVyeSB0b29sIGNhbGwgaXMgYXV0by1hcHByb3ZlZCB3aXRob3V0IGNoYW5naW5nIHRoZSBzZXNzaW9uJ3MgYXBwcm92YWwgbGV2ZWwgaW4gdGhlIHBlcm1pc3Npb25zIHBpY2tlci5cblx0ICovXG5cdGlzR2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWdTZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWU7XG5cdH1cblxuXHRnZXRFZmZlY3RpdmVBcHByb3ZhbExldmVsKHNlc3Npb25LZXk6IFByb3RvY29sVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnU2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZShzZXNzaW9uS2V5LCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpID8/ICdkZWZhdWx0Jztcblx0fVxuXG5cdGlzU2Vzc2lvbkF1dG9BcHByb3ZlRW5hYmxlZChzZXNzaW9uS2V5OiBQcm90b2NvbFVSSSk6IGJvb2xlYW4ge1xuXHRcdC8vIGBhdXRvQXBwcm92ZWAgKEFsbG93IEFsbCkgYXV0by1hcHByb3ZlcyBldmVyeSB0b29sIGNhbGwuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0RWZmZWN0aXZlQXBwcm92YWxMZXZlbChzZXNzaW9uS2V5KSA9PT0gJ2F1dG9BcHByb3ZlJztcblx0fVxuXG5cdC8vIC0tLS0gQWN0aW9uIGNvbnN0cnVjdGlvbiAoYW5hbG9nb3VzIHRvIGdldFByZUNvbmZpcm1BY3Rpb25zKSAtLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIENvbnN0cnVjdHMgYSBgQ2hhdFRvb2xDYWxsUmVhZHlgIGFjdGlvbiBmcm9tIGFuIGFnZW50XG5cdCAqIGBwZW5kaW5nX2NvbmZpcm1hdGlvbmAgc2lnbmFsLiBXaGVuIHRoZSB0b29sIG5lZWRzIHVzZXIgY29uZmlybWF0aW9uXG5cdCAqICh0aGUgcHJvdG9jb2wgc3RhdGUgY2FycmllcyBgY29uZmlybWF0aW9uVGl0bGVgKSwgdGhlIHN0YW5kYXJkXG5cdCAqIGNvbmZpcm1hdGlvbiBvcHRpb25zIGFyZSBiYWtlZCBpbiBzbyBjbGllbnRzIGNhbiByZW5kZXIgdGhlbSBkaXJlY3RseS5cblx0ICovXG5cdGNyZWF0ZVRvb2xSZWFkeUFjdGlvbihlOiBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbCwgX3Nlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyk6IElUb29sQ2FsbFJlYWR5QWN0aW9uIHtcblx0XHRjb25zdCBzdGF0ZSA9IGUuc3RhdGU7XG5cdFx0aWYgKHN0YXRlLmNvbmZpcm1hdGlvblRpdGxlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHN0YXRlLnRvb2xDYWxsSWQsXG5cdFx0XHRcdC4uLihzdGF0ZS5jb250cmlidXRvciA/IHsgY29udHJpYnV0b3I6IHN0YXRlLmNvbnRyaWJ1dG9yIH0gOiB7fSksXG5cdFx0XHRcdC4uLihzdGF0ZS5pbnRlbnRpb24gIT09IHVuZGVmaW5lZCA/IHsgaW50ZW50aW9uOiBzdGF0ZS5pbnRlbnRpb24gfSA6IHt9KSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHN0YXRlLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHN0YXRlLnRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6IHN0YXRlLmNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHRyaXNrQXNzZXNzbWVudDogc3RhdGUucmlza0Fzc2Vzc21lbnQsXG5cdFx0XHRcdGVkaXRzOiBzdGF0ZS5lZGl0cyxcblx0XHRcdFx0ZWRpdGFibGU6IHN0YXRlLmVkaXRhYmxlLFxuXHRcdFx0XHQuLi4oc3RhdGUuX21ldGEgPyB7IF9tZXRhOiBzdGF0ZS5fbWV0YSB9IDoge30pLFxuXHRcdFx0XHQvLyBNYW5hZ2VkIGFza3MgYXJlIG9uZS10aW1lIG9ubHkuIE90aGVyIGFnZW50cyBjYW4gc3VwcGx5IHRvb2wtc3BlY2lmaWNcblx0XHRcdFx0Ly8gYnV0dG9ucyAoZS5nLiBFeGl0UGxhbk1vZGUncyBgQXBwcm92ZWAvYERlbnlgKSB2aWEgYHN0YXRlLm9wdGlvbnNgO1xuXHRcdFx0XHQvLyBvdGhlcndpc2UgdGhlIHN0YW5kYXJkIHNlc3Npb24vb25jZS9za2lwIHNldCBpcyB1c2VkLlxuXHRcdFx0XHRvcHRpb25zOiBlLm1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkXG5cdFx0XHRcdFx0PyBNQU5BR0VEX0NPTkZJUk1BVElPTl9PUFRJT05TLnNsaWNlKClcblx0XHRcdFx0XHQ6IHN0YXRlLm9wdGlvbnNcblx0XHRcdFx0XHRcdD8gc3RhdGUub3B0aW9ucy5zbGljZSgpXG5cdFx0XHRcdFx0XHQ6IENPTkZJUk1BVElPTl9PUFRJT05TLnNsaWNlKCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQ6IHN0YXRlLnRvb2xDYWxsSWQsXG5cdFx0XHQuLi4oc3RhdGUuY29udHJpYnV0b3IgPyB7IGNvbnRyaWJ1dG9yOiBzdGF0ZS5jb250cmlidXRvciB9IDoge30pLFxuXHRcdFx0Li4uKHN0YXRlLmludGVudGlvbiAhPT0gdW5kZWZpbmVkID8geyBpbnRlbnRpb246IHN0YXRlLmludGVudGlvbiB9IDoge30pLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHN0YXRlLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0dG9vbElucHV0OiBzdGF0ZS50b29sSW5wdXQsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdC4uLihzdGF0ZS5fbWV0YSA/IHsgX21ldGE6IHN0YXRlLl9tZXRhIH0gOiB7fSksXG5cdFx0fTtcblx0fVxuXG5cdC8vIC0tLS0gUG9zdC1jb25maXJtYXRpb24gc2lkZSBlZmZlY3RzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogSGFuZGxlcyB0aGUgc2lkZSBlZmZlY3Qgb2YgYSBgQ2hhdFRvb2xDYWxsQ29uZmlybWVkYCBhY3Rpb24gd2hlbiB0aGVcblx0ICogdXNlciBzZWxlY3RlZCBcIkFsbG93IGluIHRoaXMgU2Vzc2lvblwiLiBBZGRzIHRoZSB0b29sIHRvIHRoZSBzZXNzaW9uJ3Ncblx0ICogcGVybWlzc2lvbiBhbGxvdyBsaXN0IHNvIGZ1dHVyZSBjYWxscyBhcmUgYXV0by1hcHByb3ZlZC5cblx0ICovXG5cdGhhbmRsZVRvb2xDYWxsQ29uZmlybWVkKGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCBzZWxlY3RlZE9wdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWlzQWhwQ2hhdENoYW5uZWwoY2hhdENoYW5uZWwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRvb2wgY2FsbCBjb25maXJtYXRpb25zIG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYXRDaGFubmVsfWApO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0Q2hhbm5lbCk7XG5cdFx0aWYgKHNlbGVjdGVkT3B0aW9uSWQgPT09IEFMTE9XX1NFU1NJT05fT1BUSU9OX0lEKSB7XG5cdFx0XHRjb25zdCB0b29sTmFtZSA9IHRoaXMuX2dldFRvb2xOYW1lRm9yVG9vbENhbGwoY2hhdENoYW5uZWwsIHRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHRvb2xOYW1lKSB7XG5cdFx0XHRcdHRoaXMuX2FkZFRvb2xUb1Nlc3Npb25QZXJtaXNzaW9ucyhzZXNzaW9uS2V5LCB0b29sTmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBJbnRlcm5hbCBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgcmVhZCBvZiBgcmVzb3VyY2VgIGF1dG8tYXBwcm92ZXMgYWdhaW5zdCB0aGUgc2Vzc2lvbidzIHdvcmtpbmdcblx0ICogZGlyZWN0b3JpZXM6IGl0IG11c3QgYmUgY29udGFpbmVkIGJ5ICoqYXQgbGVhc3Qgb25lKiogcm9vdC4gVGhlIHJlYWQnc1xuXHQgKiBzeW1saW5rLXJlc29sdmVkIHJlYWwgcGF0aCBpcyBjb21wYXJlZCB0b28sIHNvIGEgc3ltbGluayB0aGF0IGNyb3NzZXNcblx0ICogZnJvbSBvbmUgcm9vdCBpbnRvIGFub3RoZXIgaXMgKm5vdCogYXV0by1hcHByb3ZlZCAoZmFpbC1jbG9zZWQpLiBXaXRoIGFcblx0ICogc2luZ2xlIHJvb3QgdGhpcyBpcyBpZGVudGljYWwgdG8gdGhlIHByZXZpb3VzIGJlaGF2aW91ci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2lzUmVhZEF1dG9BcHByb3ZlZChyZXNvdXJjZTogVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3JpZXMgfHwgd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBSZXNvbHZlIHRoZSByZWFkIHRhcmdldCBvbmNlIChsaXRlcmFsICsgc3ltbGluayByZWFsIHBhdGgpOyBhIGRlbmllZFxuXHRcdC8vIHJlc29sdXRpb24gcmVxdWlyZXMgY29uZmlybWF0aW9uLlxuXHRcdGNvbnN0IHJlc291cmNlc1RvQ2hlY2sgPSB0aGlzLl9yZXNvbHZlUmVzb3VyY2VzRm9yQXBwcm92YWwocmVzb3VyY2UpO1xuXHRcdC8vIFJlc29sdmUgZWFjaCByb290J3MgcmVhbCBwYXRoIGluIHBhcmFsbGVsIGFuZCBzdG9wIGF0IHRoZSBmaXJzdCByb290XG5cdFx0Ly8gdGhhdCBjb250YWlucyB0aGUgdGFyZ2V0LlxuXHRcdGNvbnN0IG1hdGNoID0gYXdhaXQgZmlyc3RQYXJhbGxlbChcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllcy5tYXAoZGlyZWN0b3J5ID0+IHRoaXMuX2lzUmVhZENvbnRhaW5lZEJ5Um9vdChyZXNvdXJjZXNUb0NoZWNrLCBkaXJlY3RvcnkpKSxcblx0XHRcdGFwcHJvdmVkID0+IGFwcHJvdmVkLFxuXHRcdCk7XG5cdFx0cmV0dXJuIG1hdGNoID09PSB0cnVlO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgZXZlcnkgcmVzb2x2ZWQgcmVhZCBjYW5kaWRhdGUgaXMgY29udGFpbmVkIGJ5IGB3b3JraW5nRGlyZWN0b3J5YCAob3IgaXRzIHJlYWwgcGF0aCkuICovXG5cdHByaXZhdGUgYXN5bmMgX2lzUmVhZENvbnRhaW5lZEJ5Um9vdChyZXNvdXJjZXNUb0NoZWNrUHJvbWlzZTogUHJvbWlzZTxyZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZD4sIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IFtyZXNvdXJjZXNUb0NoZWNrLCB3b3JraW5nRGlyZWN0b3JpZXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3Jlc291cmNlc1RvQ2hlY2tQcm9taXNlLCB0aGlzLl9yZXNvbHZlUmVzb3VyY2VzRm9yQXBwcm92YWwod29ya2luZ0RpcmVjdG9yeSldKTtcblx0XHRyZXR1cm4gcmVzb3VyY2VzVG9DaGVjayAhPT0gdW5kZWZpbmVkXG5cdFx0XHQmJiB3b3JraW5nRGlyZWN0b3JpZXMgIT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgcmVzb3VyY2VzVG9DaGVjay5ldmVyeShjYW5kaWRhdGUgPT4gd29ya2luZ0RpcmVjdG9yaWVzLnNvbWUoZGlyZWN0b3J5ID0+IHRoaXMuX2lzUmVzb3VyY2VJbkRpcmVjdG9yeShjYW5kaWRhdGUsIGRpcmVjdG9yeSkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzUmVzb3VyY2VJbldvcmtpbmdEaXJlY3RvcnkocmVzb3VyY2U6IFVSSSwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHdvcmtpbmdEaXJlY3RvcnkgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9pc1Jlc291cmNlSW5EaXJlY3RvcnkocmVzb3VyY2UsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNSZXNvdXJjZUluRGlyZWN0b3J5KHJlc291cmNlOiBVUkksIGRpcmVjdG9yeTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChub3JtYWxpemVQYXRoKHJlc291cmNlKSwgbm9ybWFsaXplUGF0aChkaXJlY3RvcnkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3Mgd2hldGhlciBhIHNoZWxsIHdyaXRlLXJlZGlyZWN0aW9uIGRlc3RpbmF0aW9uIChlLmcuIHRoZSBgb3V0LnR4dGBcblx0ICogaW4gYGVjaG8gaGkgPiBvdXQudHh0YCkgc2hvdWxkIGJlIGF1dG8tYXBwcm92ZWQgYnkgcmV1c2luZyB0aGUgc2FtZVxuXHQgKiBydWxlcyB0aGF0IGdvdmVybiB3cml0ZSB0b29sIGNhbGxzOiB0aGUgZGVzdGluYXRpb24gbXVzdCByZXNvbHZlIHRvIGFcblx0ICogcGF0aCBpbnNpZGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGFuZCBtdXN0IG5vdCBtYXRjaCBhIGRlbmllZCBnbG9iLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNTaGVsbFdyaXRlRGVzdEFwcHJvdmVkKGRlc3Q6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdC8vIEEgc2hlbGwgY29tbWFuZCBydW5zIGluIGV4YWN0bHkgb25lIHByb2Nlc3MgY3dkID0gdGhlIHByaW1hcnkgcm9vdFxuXHRcdC8vIChpbmRleCAwKSwgc28gYSAqcmVsYXRpdmUqIHJlZGlyZWN0IGNhbiBvbmx5IHJlc29sdmUgYWdhaW5zdCB0aGF0IGN3ZC5cblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX3Jlc29sdmVTaGVsbFJlZGlyZWN0UmVzb3VyY2UoZGVzdCwgd29ya2luZ0RpcmVjdG9yaWVzPy5bMF0pO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gVGhlIHJlc29sdmVkIChhYnNvbHV0ZSkgZGVzdGluYXRpb24gYXV0by1hcHByb3ZlcyB3aGVuIGNvbnRhaW5lZCBieVxuXHRcdC8vIGFueSByb290IFx1MjAxNCB0aGUgc2FtZSBcImFueSByb290XCIgcnVsZSBhcyByZWFkL3dyaXRlLiBVbmxpa2UgcmVhZC93cml0ZSxcblx0XHQvLyB0aGlzIHBhdGggaXMgc3luY2hyb25vdXMgYW5kIGRvZXMgbm90IHJlc29sdmUgc3ltbGlua3Mgb24gdGhlXG5cdFx0Ly8gZGVzdGluYXRpb24gKHByZS1leGlzdGluZyBiZWhhdmlvdXIsIHVuY2hhbmdlZCBoZXJlKS5cblx0XHRyZXR1cm4gKHdvcmtpbmdEaXJlY3RvcmllcyA/PyBbXSkuc29tZSh3b3JraW5nRGlyZWN0b3J5ID0+IHRoaXMuX2NoZWNrV3JpdGVSZXNvdXJjZShyZXNvdXJjZSwgd29ya2luZ0RpcmVjdG9yeSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hdGNoZXMgcmVkaXJlY3QgZGVzdGluYXRpb25zIHdob3NlIGZpbmFsIHBhdGggaXMgZGVjaWRlZCBieSB0aGUgc2hlbGxcblx0ICogcmF0aGVyIHRoYW4gYnkgdGhlIHRleHQ6IHZhcmlhYmxlIGV4cGFuc2lvbnMgKGAkSE9NRS94YCwgYCRlbnY6VEVNUC94YCxcblx0ICogYCVBUFBEQVRBJVxceGApLCBjb21tYW5kIHN1YnN0aXR1dGlvbnMgKGAkKHB3ZCkveGAsIGBgIGBwd2RgL3ggYGApLCBicmFjZVxuXHQgKiBleHBhbnNpb25zLCBhbmQgYH5gIGluIGEgcG9zaXRpb24ge0BsaW5rIHVudGlsZGlmeX0gZG9lcyBub3QgaGFuZGxlLlxuXHQgKiBNaXJyb3JzIHRoZSB3b3JrYmVuY2gncyBmaWxlLXdyaXRlIGFuYWx5emVyIGd1YXJkLlxuXHQgKlxuXHQgKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3NDE2NiBhbmRcblx0ICogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3NDE2N1xuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2R5bmFtaWNSZWRpcmVjdERlc3RSZWdleCA9IC9bJCgpe31gfiVdLztcblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIHJhdyB0ZXh0IG9mIGEgc2hlbGwgcmVkaXJlY3QgZGVzdGluYXRpb24gdG8gYW4gYWJzb2x1dGVcblx0ICogZmlsZXN5c3RlbSBwYXRoLiBgfmAgaXMgZXhwYW5kZWQgdG8gdGhlIHVzZXIncyBob21lIGRpcmVjdG9yeTsgdGhlXG5cdCAqIGRvd25zdHJlYW0gd29ya2luZy1kaXJlY3RvcnkgY2hlY2sgcmVqZWN0cyBwYXRocyB0aGF0IGVuZCB1cCBvdXRzaWRlXG5cdCAqIHRoZSB3b3Jrc3BhY2UuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiByZXNvbHV0aW9uIHdvdWxkIHJlcXVpcmUgYVxuXHQgKiB3b3JraW5nIGRpcmVjdG9yeSB0aGF0IGlzbid0IGNvbmZpZ3VyZWQsIG9yIHdoZW4gdGhlIGRlc3RpbmF0aW9uIGV4cGFuZHNcblx0ICogYXQgcnVudGltZSBhbmQgdGhlcmVmb3JlIGNhbm5vdCBiZSByZXNvbHZlZCBmcm9tIGl0cyB0ZXh0IGFsb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVNoZWxsUmVkaXJlY3RSZXNvdXJjZShkZXN0OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdHJpbW1lZCA9IHVudGlsZGlmeShkZXN0LnRyaW0oKSwgaG9tZWRpcigpKTtcblx0XHRpZiAoIXRyaW1tZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIEEgZGVzdGluYXRpb24gdGhlIHNoZWxsIGV4cGFuZHMgKGUuZy4gYCRIT01FL3gudHh0YCkgd291bGQgb3RoZXJ3aXNlIGJlXG5cdFx0Ly8gdHJlYXRlZCBhcyBhIGxpdGVyYWwgcmVsYXRpdmUgcGF0aCBhbmQgcmVzb2x2ZSAqaW5zaWRlKiB0aGUgd29ya2luZ1xuXHRcdC8vIGRpcmVjdG9yeSwgYXV0by1hcHByb3ZpbmcgYSB3cml0ZSB0aGF0IGFjdHVhbGx5IGxhbmRzIGVsc2V3aGVyZS5cblx0XHRpZiAoU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyLl9keW5hbWljUmVkaXJlY3REZXN0UmVnZXgudGVzdCh0cmltbWVkKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1Nlc3Npb25QZXJtaXNzaW9uTWFuYWdlcl0gUmVkaXJlY3QgZGVzdGluYXRpb24gZXhwYW5kcyBhdCBydW50aW1lLCByZXF1aXJpbmcgY29uZmlybWF0aW9uOiAke2Rlc3R9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAocGF0aC5pc0Fic29sdXRlKHRyaW1tZWQpKSB7XG5cdFx0XHRyZXR1cm4gVVJJLmZpbGUodHJpbW1lZCk7XG5cdFx0fVxuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIFVSSS5maWxlKHBhdGgucmVzb2x2ZSh3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgdHJpbW1lZCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERldGVybWluZXMgd2hldGhlciBhIHdyaXRlIHRvIGByZXNvdXJjZWAgY2FuIGJlIGF1dG8tYXBwcm92ZWQuIE1pcnJvcnMgdGhlXG5cdCAqIGNoZWNrcyBwZXJmb3JtZWQgYnkgdGhlIHdvcmtiZW5jaCBlZGl0LWNvbmZpcm1hdGlvbiBwaXBlbGluZTpcblx0ICpcblx0ICogMS4gVGhlIHBhdGggaXMgcmVzb2x2ZWQgdGhyb3VnaCBhbnkgc3ltbGlua3MgKGZvbGxvd2luZyBhbmNlc3RvcnMgdGhhdCBkb1xuXHQgKiAgICBub3QgeWV0IGV4aXN0KSBzbyBhIGxpbmsgY2FuJ3QgcmVkaXJlY3QgYW4gZWRpdCBvdXRzaWRlIHRoZSB3b3JraW5nXG5cdCAqICAgIGRpcmVjdG9yeS4gQm90aCB0aGUgbGl0ZXJhbCBhbmQgcmVzb2x2ZWQgcGF0aHMgbXVzdCBwYXNzIGV2ZXJ5IGNoZWNrLlxuXHQgKiAyLiBUaGUgcGF0aCBtdXN0IGJlIGZyZWUgb2Ygc3VzcGljaW91cyBjaGFyYWN0ZXJzIChzZWUge0BsaW5rIGFzc2VydFBhdGhJc1NhZmV9KS5cblx0ICogMy4gVGhlIHBhdGggbXVzdCBsaXZlIGluc2lkZSB0aGUgd29ya2luZyBkaXJlY3RvcnkuXG5cdCAqIDQuIFRoZSBwYXRoIG11c3Qgbm90IHRhcmdldCBhIHBsYXRmb3JtLXJlc3RyaWN0ZWQgbG9jYXRpb24gKGhvbWUgZG90ZmlsZXMsXG5cdCAqICAgIGB+L0xpYnJhcnlgLCBgJUFQUERBVEElYCwgLi4uKS5cblx0ICogNS4gVGhlIHBhdGggbXVzdCBtYXRjaCB0aGUgZWRpdCBhdXRvLWFwcHJvdmUgZ2xvYiBydWxlcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2lzRWRpdEF1dG9BcHByb3ZlZChyZXNvdXJjZTogVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3JpZXMgfHwgd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gQSB3cml0ZSBpcyBuZXZlciBhdXRvLWFwcHJvdmVkIHdpdGhvdXQgYSB3b3JraW5nIGRpcmVjdG9yeSB0b1xuXHRcdFx0Ly8gY29udGFpbiBpdCAobWF0Y2hlcyB0aGUgcHJldmlvdXMgYmVoYXZpb3VyKS5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgd3JpdGUgdGFyZ2V0IG9uY2UgKGxpdGVyYWwgKyBzeW1saW5rIHJlYWwgcGF0aCk7IGEgZGVuaWVkXG5cdFx0Ly8gcmVzb2x1dGlvbiByZXF1aXJlcyBjb25maXJtYXRpb24uXG5cdFx0Y29uc3QgcmVzb3VyY2VzVG9DaGVjayA9IGF3YWl0IHRoaXMuX3Jlc29sdmVSZXNvdXJjZXNGb3JBcHByb3ZhbChyZXNvdXJjZSk7XG5cdFx0aWYgKHJlc291cmNlc1RvQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBBcHByb3ZlIGlmIEFOWSByb290IGNsZWFycyB0aGUgd3JpdGUgY2hlY2tzIGZvciBldmVyeSByZXNvdXJjZVxuXHRcdC8vIGNhbmRpZGF0ZS4gYF9jaGVja1dyaXRlUmVzb3VyY2VgIGlzIHN5bmNocm9ub3VzLCBzbyBhIHBsYWluIGAuc29tZWBcblx0XHQvLyBhbHJlYWR5IHNob3J0LWNpcmN1aXRzIFx1MjAxNCB0aGVyZSBpcyBubyBwZXItcm9vdCBhc3luYyB3b3JrIHRvIHBhcmFsbGVsaXplLlxuXHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3JpZXMuc29tZSh3b3JraW5nRGlyZWN0b3J5ID0+IHJlc291cmNlc1RvQ2hlY2suZXZlcnkoY2FuZGlkYXRlID0+IHRoaXMuX2NoZWNrV3JpdGVSZXNvdXJjZShjYW5kaWRhdGUsIHdvcmtpbmdEaXJlY3RvcnkpKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbGl0ZXJhbCBwYXRoIHBsdXMsIGZvciBhYnNvbHV0ZSBwYXRocywgdGhlIHN5bWxpbmstcmVzb2x2ZWRcblx0ICogcmVhbCBwYXRoLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIHBhdGggY2Fubm90IGJlIHJlc29sdmVkIGR1ZSB0b1xuXHQgKiBtaXNzaW5nIHBlcm1pc3Npb25zLCBzaWduYWxsaW5nIHRoYXQgY29uZmlybWF0aW9uIGlzIHJlcXVpcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVJlc291cmNlc0ZvckFwcHJvdmFsKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSSVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2VzVG9DaGVjayA9IFtyZXNvdXJjZV07XG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VzVG9DaGVjaztcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgcmVzb2x2ZVJlYWxQYXRoRm9yTm9uZXhpc3RlbnQocmVzb3VyY2UsIHRoaXMuX3JlYWxwYXRoKTtcblx0XHRcdGlmICghZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChyZXNvbHZlZCwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJlc291cmNlc1RvQ2hlY2sucHVzaChyZXNvbHZlZCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgY29kZSA9IChlIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbikuY29kZTtcblx0XHRcdGlmIChjb2RlID09PSAnRVBFUk0nIHx8IGNvZGUgPT09ICdFQUNDRVMnKSB7XG5cdFx0XHRcdC8vIE5vIHBlcm1pc3Npb24gdG8gcmVzb2x2ZSB0aGUgcGF0aCBcdTIwMTQgcmVxdWlyZSBjb25maXJtYXRpb24uXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBPdGhlcndpc2UgZmFsbCBiYWNrIHRvIGNoZWNraW5nIHRoZSBsaXRlcmFsIHJlc291cmNlIG9ubHkuXG5cdFx0fVxuXHRcdHJldHVybiByZXNvdXJjZXNUb0NoZWNrO1xuXHR9XG5cblx0LyoqIFJ1bnMgdGhlIHdyaXRlIGNoZWNrcyBmb3IgYSBzaW5nbGUgKGFscmVhZHkgc3ltbGluay1yZXNvbHZlZCkgcmVzb3VyY2UuICovXG5cdHByaXZhdGUgX2NoZWNrV3JpdGVSZXNvdXJjZShyZXNvdXJjZTogVVJJLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0UGF0aElzU2FmZShyZXNvdXJjZS5mc1BhdGgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzUmVzb3VyY2VJbldvcmtpbmdEaXJlY3RvcnkocmVzb3VyY2UsIHdvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc1BsYXRmb3JtUmVzdHJpY3RlZFJlc291cmNlKHJlc291cmNlLCB3b3JraW5nRGlyZWN0b3J5KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hlc0VkaXRBdXRvQXBwcm92ZVBhdHRlcm5zKHJlc291cmNlLmZzUGF0aCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIGByZXNvdXJjZWAgdGFyZ2V0cyBhIHBsYXRmb3JtLXJlc3RyaWN0ZWQgbG9jYXRpb24gdGhhdFxuXHQgKiBzaG91bGQgYWx3YXlzIHJlcXVpcmUgY29uZmlybWF0aW9uLiBFZGl0cyB3aXRoaW4gaG9tZS1kaXJlY3RvcnkgZG90ZmlsZXNcblx0ICogYXJlIG5ldmVyIGF1dG8tYXBwcm92ZWQuIEVkaXRzIHdpdGhpbiBwbGF0Zm9ybSBjb25maWcgZGlyZWN0b3JpZXMgYXJlXG5cdCAqIGFsbG93ZWQgb25seSB3aGVuIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpdHNlbGYgbGl2ZXMgaW5zaWRlIHRoZW0uXG5cdCAqL1xuXHRwcml2YXRlIF9pc1BsYXRmb3JtUmVzdHJpY3RlZFJlc291cmNlKHJlc291cmNlOiBVUkksIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlbGF0aXZlVG9Ib21lID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UucmVsYXRpdmVQYXRoKEhPTUVfRElSLCByZXNvdXJjZSk7XG5cdFx0Y29uc3QgdG9wTGV2ZWxOYW1lID0gcmVsYXRpdmVUb0hvbWU/LnNwbGl0KCcvJylbMF07XG5cdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgSE9NRV9ESVIpICYmIHRvcExldmVsTmFtZT8uc3RhcnRzV2l0aCgnLicpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHJlc3RyaWN0ZWQgb2YgUExBVEZPUk1fUkVTVFJJQ1RFRF9ESVJTKSB7XG5cdFx0XHRjb25zdCBwYXJlbnRVUkkgPSBVUkkuZmlsZShyZXN0cmljdGVkKTtcblx0XHRcdGlmIChleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHBhcmVudFVSSSkpIHtcblx0XHRcdFx0Ly8gQWxsb3cgZWRpdHMgd2hlbiB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMgb3BlbmVkIGluc2lkZSB0aGUgcmVzdHJpY3RlZCBhcmVhLlxuXHRcdFx0XHRyZXR1cm4gISh3b3JraW5nRGlyZWN0b3J5ICYmIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudCh3b3JraW5nRGlyZWN0b3J5LCBwYXJlbnRVUkkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hlc0VkaXRBdXRvQXBwcm92ZVBhdHRlcm5zKGZpbGVQYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRsZXQgYXBwcm92ZWQgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgW3BhdHRlcm4sIGlzQXBwcm92ZWRdIG9mIE9iamVjdC5lbnRyaWVzKERFRkFVTFRfRURJVF9BVVRPX0FQUFJPVkVfUEFUVEVSTlMpKSB7XG5cdFx0XHRpZiAoaXNBcHByb3ZlZCAhPT0gYXBwcm92ZWQgJiYgZ2xvYk1hdGNoKHBhdHRlcm4sIGZpbGVQYXRoKSkge1xuXHRcdFx0XHRhcHByb3ZlZCA9IGlzQXBwcm92ZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhcHByb3ZlZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzVG9vbEFsbG93ZWRCeVBlcm1pc3Npb25zKHNlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCB0b29sTmFtZSA9IHRoaXMuX2dldFRvb2xOYW1lRm9yVG9vbENhbGwoc2Vzc2lvbktleSwgdG9vbENhbGxJZCk7XG5cdFx0aWYgKCF0b29sTmFtZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBgZ2V0RWZmZWN0aXZlVmFsdWVgIHdhbGtzIHNlc3Npb24gXHUyMTkyIHBhcmVudCBcdTIxOTIgaG9zdCwgc28gc2Vzc2lvbnNcblx0XHQvLyB0aGF0IGhhdmVuJ3QgbWF0ZXJpYWxpemVkIHRoZWlyIG93biBgcGVybWlzc2lvbnNgIHlldCB0cmFuc3BhcmVudGx5XG5cdFx0Ly8gaW5oZXJpdCBmcm9tIHRoZSBob3N0LWxldmVsIGFsbG93L2RlbnkgbGlzdHMuXG5cdFx0Y29uc3QgcGVybWlzc2lvbnMgPSB0aGlzLl9jb25maWdTZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHNlc3Npb25LZXksIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucyk7XG5cdFx0Y29uc3QgYWxsb3dlZCA9IHBlcm1pc3Npb25zPy5hbGxvdy5pbmNsdWRlcyh0b29sTmFtZSkgPz8gZmFsc2U7XG5cdFx0aWYgKGFsbG93ZWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXJdIEF1dG8tYXBwcm92aW5nIFwiJHt0b29sTmFtZX1cIiB2aWEgcGVybWlzc2lvbnNgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbG93ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb29sTmFtZUZvclRvb2xDYWxsKHNlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk7XG5cdFx0Y29uc3QgcGFydHMgPSBzZXNzaW9uU3RhdGU/LmFjdGl2ZVR1cm4/LnJlc3BvbnNlUGFydHM7XG5cdFx0aWYgKCFwYXJ0cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBycCBvZiBwYXJ0cykge1xuXHRcdFx0aWYgKHJwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcnAudG9vbENhbGwudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZCkge1xuXHRcdFx0XHRyZXR1cm4gcnAudG9vbENhbGwudG9vbE5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRUb29sVG9TZXNzaW9uUGVybWlzc2lvbnMoc2Vzc2lvbktleTogUHJvdG9jb2xVUkksIHRvb2xOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwZXJtaXNzaW9ucyA9IHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUoc2Vzc2lvbktleSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zKVxuXHRcdFx0Pz8geyBhbGxvdzogW10sIGRlbnk6IFtdIH07XG5cdFx0aWYgKHBlcm1pc3Npb25zLmFsbG93LmluY2x1ZGVzKHRvb2xOYW1lKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb25maWdTZXJ2aWNlLnVwZGF0ZVNlc3Npb25Db25maWcoc2Vzc2lvbktleSwge1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdOiB7XG5cdFx0XHRcdGFsbG93OiBbLi4ucGVybWlzc2lvbnMuYWxsb3csIHRvb2xOYW1lXSxcblx0XHRcdFx0ZGVueTogWy4uLnBlcm1pc3Npb25zLmRlbnldLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXJdIEFkZGVkIFwiJHt0b29sTmFtZX1cIiB0byBzZXNz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
