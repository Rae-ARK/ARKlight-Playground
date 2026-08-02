import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { SessionStatus } from "../../common/state/protocol/channels-session/state.js";
import { buildChatUri, buildDefaultChatUri, isSessionStatusArchived, isSessionStatusRead, parseChatUri, readSessionGitState, readSessionGitHubState, ResponsePartKind, ToolCallStatus, TurnState } from "../../common/state/sessionState.js";
import { buildOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from "../../common/openSessionLink.js";
import { SessionServerToolName } from "../../common/serverToolNames.js";
import { generateUuid } from "../../../../base/common/uuid.js";
const maxSessionSpawnDepth = 3;
const maxCreatedSessions = 25;
const maxCreatedChats = 25;
const maxSentMessages = 50;
const sessionConfirmationToolNames = /* @__PURE__ */ new Set([SessionServerToolName.CreateSession, SessionServerToolName.CreateChat, SessionServerToolName.SendMessage, SessionServerToolName.DeleteSession]);
function sessionToolRequiresConfirmation(toolName) {
  return sessionConfirmationToolNames.has(toolName);
}
const listSessionsStatusValues = ["idle", "inProgress", "inputNeeded", "error", "archived"];
const listSessionsInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "Return only the session with this URI or `agent-host-session://` link (a direct lookup that ignores the other filters). Use this to fetch one known session's metadata." },
    status: {
      type: "array",
      items: { type: "string", enum: [...listSessionsStatusValues] },
      description: "Only return sessions whose status matches one of these (e.g. `inputNeeded` for sessions awaiting a reply, `inProgress` for running ones, `archived` for sessions marked Done/completed \u2014 implies `includeArchived`). Omit to return every status."
    },
    workspace: { type: "string", description: "Only return sessions whose working directory is this folder \u2014 an absolute path or a workspace URI." },
    withChanges: { type: "boolean", description: "When true, only return sessions that have pending worktree changes." },
    unread: { type: "boolean", description: "When true, only return sessions with updates the user has not seen yet." },
    withPullRequest: { type: "boolean", description: "When true, only return sessions that have a linked GitHub pull request." },
    includeArchived: { type: "boolean", description: "Whether to include archived sessions. Defaults to false; set true to also return archived sessions." },
    createdAfter: { type: "string", description: "Only return sessions created at or after this time (ISO-8601 timestamp, e.g. `2025-01-31T00:00:00Z`)." },
    createdBefore: { type: "string", description: "Only return sessions created at or before this time (ISO-8601 timestamp)." }
  }
};
const createSessionInputSchema = {
  type: "object",
  properties: {
    workspace: { type: "string", description: "Absolute folder path, workspace URI, or a working directory from an existing session." },
    prompt: { type: "string", description: "Initial prompt to send to the new session." },
    model: { type: "string", description: "Optional model ID or display name." }
  },
  required: ["workspace", "prompt"]
};
const getCurrentSessionInputSchema = {
  type: "object",
  properties: {}
};
const createChatInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "Optional session to add the chat to: a session URI from `list_sessions` or an `agent-host-session://` link. Defaults to the current session when omitted." },
    prompt: { type: "string", description: "Initial prompt to send to the new chat." },
    title: { type: "string", description: "Optional title for the new chat." },
    model: { type: "string", description: "Optional model ID or display name. Defaults to the session's model." }
  },
  required: ["prompt"]
};
const deleteSessionInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "The session to delete: a session URI from `list_sessions` or an `agent-host-session://` link (e.g. from `create_session`)." }
  },
  required: ["session"]
};
const sendMessageInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "The session or chat to message: a session URI from `list_sessions`, or an `agent-host-session://` link (from `create_session`/`create_chat`; a `create_chat` link targets that specific chat)." },
    message: { type: "string", description: "The message to send." }
  },
  required: ["session", "message"]
};
const sessionContextDetailValues = ["summary", "digest", "full"];
const getSessionContextInputSchema = {
  type: "object",
  properties: {
    session: { type: "string", description: "The session or chat to read: a session URI from `list_sessions`, or an `agent-host-session://` link (a `create_chat` link targets that specific chat)." },
    detail: {
      type: "string",
      enum: [...sessionContextDetailValues],
      description: "How much conversation detail to return. `summary` (default): status and a short per-turn gist (the message plus a compact snippet of the reply). `digest`: adds the full assistant reply text and tool-call names. `full`: adds tool-call inputs. Higher levels return more tokens."
    },
    transcriptLimit: { type: "number", description: "Maximum number of most-recent turns to include. Defaults to 10; capped at 50." }
  },
  required: ["session"]
};
const sessionServerToolDefinitions = [
  {
    name: SessionServerToolName.ListSessions,
    title: "List Sessions",
    description: "List sessions and their compact metadata (status, activity, working directory, project, worktree changes, git/GitHub info, timestamps). Pass `session` to fetch a single known session by URI. By default archived sessions are omitted. Optionally filter by `status`, `workspace`, `withChanges`, `unread`, `withPullRequest`, `includeArchived`, `createdAfter`, or `createdBefore`.",
    inputSchema: listSessionsInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: SessionServerToolName.GetCurrentSession,
    title: "Get Current Session",
    description: "Get metadata and the open link for the session this conversation is running in. Use this to reference the current session (for example before adding a chat to it).",
    inputSchema: getCurrentSessionInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: SessionServerToolName.CreateSession,
    title: "Create Session",
    description: 'Create a session in a workspace and start it with an initial prompt. The UI shows a "Session Created" confirmation with a button to open it, so reply with a single short sentence confirming the session was created and do NOT print the session URL or tell the user to click a button.',
    inputSchema: createSessionInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: SessionServerToolName.CreateChat,
    title: "Create Chat",
    description: 'Add a new chat to an existing session and start it with an initial prompt. Omit `session` to add the chat to the current session; otherwise pass a session URI from `list_sessions`. Optionally pass a `model` to use for the chat (defaults to the session\'s model). The UI shows a "Chat Created" confirmation with a button to open the session, so reply with a single short sentence and do NOT print the session URL or tell the user to click a button.',
    inputSchema: createChatInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: SessionServerToolName.SendMessage,
    title: "Send Message",
    description: "Send a message to an existing session or chat, starting a new turn there. Provide a session URI from `list_sessions` or an `agent-host-session://` link (a `create_chat` link targets that specific chat). The message is delivered asynchronously \u2014 this tool does not wait for or return the reply. The UI shows a confirmation with a button to open the target, so reply with a single short sentence and do NOT print the URL or tell the user to click a button.",
    inputSchema: sendMessageInputSchema,
    annotations: { readOnlyHint: false }
  },
  {
    name: SessionServerToolName.GetSessionContext,
    title: "Get Session Context",
    description: 'Read the recent conversation of an existing session or chat: a compacted transcript of its turns (messages, replies, and tool calls). Use this to see what a session you created is doing, or to gather context before sending it a message. Returns a compacted summary by default (`detail: "summary"`); request `digest` or `full` for more detail. For session metadata (status, working directory, changes, \u2026) use `list_sessions` with the `session` argument.',
    inputSchema: getSessionContextInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: SessionServerToolName.DeleteSession,
    title: "Delete Session",
    description: "Permanently delete a session (identified by a session URI from `list_sessions`), including its stored data. This cannot be undone. Refuses to delete the current session.",
    inputSchema: deleteSessionInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true }
  }
];
function currentSessionUri(toolCallChannel) {
  const owning = parseChatUri(toolCallChannel) ?? void 0;
  return URI.parse(owning?.session ?? toolCallChannel);
}
function getRequiredString(value, field, toolName) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
  }
  return value;
}
function getOptionalString(value, field, toolName) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a non-empty string.`);
  }
  return value;
}
function parseWorkspaceUri(workspace) {
  if (/^(\/|[a-zA-Z]:[\\/]|\\\\)/.test(workspace)) {
    return URI.file(workspace);
  }
  try {
    const parsed = URI.parse(workspace, true);
    return parsed.scheme ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function resolveWorkspace(workspace, sessions) {
  for (const session of sessions) {
    const match = session.workingDirectories?.find((d) => d.toString() === workspace || d.fsPath === workspace);
    if (match) {
      return match;
    }
  }
  const parsed = parseWorkspaceUri(workspace);
  if (!parsed) {
    throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: workspace must match a known session workingDirectory, an absolute path, or a valid URI string.`);
  }
  return parsed;
}
function resolveModel(modelName, models) {
  if (modelName === void 0) {
    return void 0;
  }
  const model = models.find((candidate) => candidate.id === modelName || candidate.name === modelName);
  if (!model) {
    throw new Error(`Invalid ${SessionServerToolName.CreateSession} input: model must match an available model id or name.`);
  }
  return model;
}
function getCreateSessionArgs(rawArgs, sessions, models) {
  const args = rawArgs ?? {};
  const workspace = getRequiredString(args.workspace, "workspace", SessionServerToolName.CreateSession);
  const prompt = getRequiredString(args.prompt, "prompt", SessionServerToolName.CreateSession);
  const modelName = getOptionalString(args.model, "model", SessionServerToolName.CreateSession);
  return {
    workspace: resolveWorkspace(workspace, sessions),
    prompt,
    model: resolveModel(modelName, models)
  };
}
function describeSessionStatusBits(status) {
  const names = [];
  if ((status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded) {
    names.push("inputNeeded");
  } else if (status & SessionStatus.InProgress) {
    names.push("inProgress");
  } else if (status & SessionStatus.Idle) {
    names.push("idle");
  }
  if (status & SessionStatus.Error) {
    names.push("error");
  }
  if (status & SessionStatus.IsArchived) {
    names.push("archived");
  }
  return names;
}
function describeSessionStatusNames(session) {
  return session.status !== void 0 ? describeSessionStatusBits(session.status) : [];
}
function describeSessionStatus(session) {
  const names = describeSessionStatusNames(session);
  if (names.length > 0) {
    return names.join(",");
  }
  return session.status !== void 0 ? "unknown" : void 0;
}
function getOptionalBoolean(value, field, toolName) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${toolName} input: ${field} must be a boolean.`);
  }
  return value;
}
function getOptionalTimestamp(value, field, toolName) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "string") {
    throw new Error(`Invalid ${toolName} input: ${field} must be an ISO-8601 timestamp string.`);
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${toolName} input: ${field} must be a valid ISO-8601 timestamp (e.g. 2025-01-31T00:00:00Z).`);
  }
  return parsed;
}
function getListSessionsArgs(rawArgs) {
  const args = rawArgs ?? {};
  let status;
  if (args.status !== void 0) {
    if (!Array.isArray(args.status) || args.status.some((value) => typeof value !== "string")) {
      throw new Error(`Invalid ${SessionServerToolName.ListSessions} input: status must be an array of status names.`);
    }
    const invalid = args.status.filter((value) => !listSessionsStatusValues.includes(value));
    if (invalid.length > 0) {
      throw new Error(`Invalid ${SessionServerToolName.ListSessions} input: unknown status value(s) ${invalid.join(", ")}. Valid values: ${listSessionsStatusValues.join(", ")}.`);
    }
    status = new Set(args.status);
  }
  return {
    session: getOptionalString(args.session, "session", SessionServerToolName.ListSessions),
    status,
    workspace: getOptionalString(args.workspace, "workspace", SessionServerToolName.ListSessions),
    withChanges: getOptionalBoolean(args.withChanges, "withChanges", SessionServerToolName.ListSessions),
    unread: getOptionalBoolean(args.unread, "unread", SessionServerToolName.ListSessions),
    withPullRequest: getOptionalBoolean(args.withPullRequest, "withPullRequest", SessionServerToolName.ListSessions),
    includeArchived: getOptionalBoolean(args.includeArchived, "includeArchived", SessionServerToolName.ListSessions),
    createdAfter: getOptionalTimestamp(args.createdAfter, "createdAfter", SessionServerToolName.ListSessions),
    createdBefore: getOptionalTimestamp(args.createdBefore, "createdBefore", SessionServerToolName.ListSessions)
  };
}
function sessionHasChanges(session) {
  const changes = session.changes;
  return !!changes && ((changes.files ?? 0) > 0 || (changes.additions ?? 0) > 0 || (changes.deletions ?? 0) > 0);
}
function sessionIsArchived(session) {
  return isSessionStatusArchived(session.status);
}
function sessionIsUnread(session) {
  return session.status !== void 0 && !isSessionStatusRead(session.status);
}
function sessionMatchesWorkspace(session, workspace) {
  const dirs = session.workingDirectories;
  if (!dirs || dirs.length === 0) {
    return false;
  }
  const parsed = parseWorkspaceUri(workspace);
  return dirs.some((dir) => dir.toString() === workspace || dir.fsPath === workspace || !!parsed && parsed.toString() === dir.toString());
}
function filterSessions(sessions, args) {
  if (args.session !== void 0) {
    const target = parseOpenSessionLinkUri(args.session)?.toString() ?? args.session;
    return sessions.filter((session) => session.session.toString() === target);
  }
  return sessions.filter((session) => {
    if (args.status) {
      const names = describeSessionStatusNames(session);
      if (!names.some((name) => args.status.has(name))) {
        return false;
      }
    }
    if (args.workspace !== void 0 && !sessionMatchesWorkspace(session, args.workspace)) {
      return false;
    }
    if (args.withChanges && !sessionHasChanges(session)) {
      return false;
    }
    if (args.unread && !sessionIsUnread(session)) {
      return false;
    }
    if (args.withPullRequest && !readSessionGitHubState(session._meta)?.pullRequestUrl) {
      return false;
    }
    if (args.includeArchived !== true && !args.status?.has("archived") && sessionIsArchived(session)) {
      return false;
    }
    if (args.createdAfter !== void 0 && session.startTime < args.createdAfter) {
      return false;
    }
    if (args.createdBefore !== void 0 && session.startTime > args.createdBefore) {
      return false;
    }
    return true;
  });
}
function serializeGitState(session) {
  const git = readSessionGitState(session._meta);
  if (!git) {
    return void 0;
  }
  const result = {};
  if (git.branchName !== void 0) {
    result.branch = git.branchName;
  }
  if (git.baseBranchName !== void 0) {
    result.baseBranch = git.baseBranchName;
  }
  if (git.upstreamBranchName !== void 0) {
    result.upstreamBranch = git.upstreamBranchName;
  }
  if (git.outgoingChanges !== void 0) {
    result.ahead = git.outgoingChanges;
  }
  if (git.incomingChanges !== void 0) {
    result.behind = git.incomingChanges;
  }
  if (git.uncommittedChanges !== void 0) {
    result.uncommittedChanges = git.uncommittedChanges;
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function serializeGitHubState(session) {
  const github = readSessionGitHubState(session._meta);
  if (!github) {
    return void 0;
  }
  const result = {};
  if (github.owner !== void 0) {
    result.owner = github.owner;
  }
  if (github.repo !== void 0) {
    result.repo = github.repo;
  }
  if (github.pullRequestUrl !== void 0) {
    result.pullRequestUrl = github.pullRequestUrl;
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
function serializeSession(session) {
  const git = serializeGitState(session);
  const github = serializeGitHubState(session);
  const status = describeSessionStatus(session);
  return {
    session: session.session.toString(),
    ...session.summary !== void 0 ? { title: session.summary } : {},
    ...status !== void 0 ? { status } : {},
    ...session.activity !== void 0 ? { activity: session.activity } : {},
    ...session.workingDirectories?.[0] !== void 0 ? { workingDirectory: session.workingDirectories[0].toString() } : {},
    ...session.project !== void 0 ? { project: session.project.displayName } : {},
    ...sessionIsUnread(session) ? { unread: true } : {},
    ...session.startTime > 0 ? { createdAt: new Date(session.startTime).toISOString() } : {},
    ...session.modifiedTime > 0 ? { modifiedAt: new Date(session.modifiedTime).toISOString() } : {},
    ...session.changes !== void 0 ? { changes: session.changes } : {},
    ...session.changesets !== void 0 ? {
      changesets: session.changesets.map((changeset) => ({
        label: changeset.label,
        changeKind: changeset.changeKind,
        uriTemplate: changeset.uriTemplate,
        ...changeset.description !== void 0 ? { description: changeset.description } : {}
      }))
    } : {},
    ...git !== void 0 ? { git } : {},
    ...github !== void 0 ? { github } : {}
  };
}
function serializeSessions(sessions) {
  return JSON.stringify({ sessions: sessions.map(serializeSession) });
}
async function applyCreateSessionTool(accessor, rawArgs, currentSession) {
  const parentDepth = currentSession ? accessor.getSessionSpawnDepth(currentSession) : 0;
  if (parentDepth >= maxSessionSpawnDepth) {
    throw new Error(`Refusing to create a session: recursion limit reached (max spawn depth ${maxSessionSpawnDepth}). This session was itself created ${parentDepth} level(s) deep.`);
  }
  const sessions = await accessor.listSessions();
  const args = getCreateSessionArgs(rawArgs, sessions, accessor.getModels());
  const config = {
    workingDirectories: args.workspace ? [args.workspace] : void 0,
    ...args.model !== void 0 ? { provider: args.model.provider, model: { id: args.model.id } } : {}
  };
  const session = await accessor.createSession(config);
  accessor.setSessionSpawnDepth(session, parentDepth + 1);
  const chat = URI.parse(buildDefaultChatUri(session));
  await accessor.startPrompt(session, chat, args.prompt);
  return { session: session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(session) };
}
function formatCreateSessionResult(result) {
  return `Session created (${result.openLink}). Reply with one short sentence confirming the session was created; do not print the URL or mention a button.`;
}
function resolveKnownSession(sessionInput, sessions) {
  const fromLink = parseOpenSessionLinkUri(sessionInput);
  const candidate = fromLink?.toString() ?? sessionInput;
  const match = sessions.find((s) => s.session.toString() === candidate);
  return match?.session;
}
function resolveChatSession(sessionInput, sessions) {
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.CreateChat} input: session must match the URI of a known session (see list_sessions).`);
  }
  return session;
}
function getCreateChatArgs(rawArgs, sessions, models, currentSession) {
  const args = rawArgs ?? {};
  const prompt = getRequiredString(args.prompt, "prompt", SessionServerToolName.CreateChat);
  const title = getOptionalString(args.title, "title", SessionServerToolName.CreateChat);
  const modelName = getOptionalString(args.model, "model", SessionServerToolName.CreateChat);
  const model = resolveModel(modelName, models);
  const sessionInput = getOptionalString(args.session, "session", SessionServerToolName.CreateChat);
  let session;
  if (sessionInput !== void 0) {
    session = resolveChatSession(sessionInput, sessions);
  } else if (currentSession) {
    session = currentSession;
  } else {
    throw new Error(`Invalid ${SessionServerToolName.CreateChat} input: no session provided and the current session could not be determined.`);
  }
  return { session, prompt, ...title !== void 0 ? { title } : {}, ...model !== void 0 ? { model } : {} };
}
async function applyCreateChatTool(accessor, rawArgs, currentSession) {
  const sessions = await accessor.listSessions();
  const args = getCreateChatArgs(rawArgs, sessions, accessor.getModels(), currentSession);
  const chatId = generateUuid();
  const chat = URI.parse(buildChatUri(args.session.toString(), chatId));
  await accessor.createChat(args.session, chat, { title: args.title, model: args.model });
  await accessor.startPrompt(args.session, chat, args.prompt);
  return { session: args.session.toString(), chat: chat.toString(), openLink: buildOpenSessionLinkUri(args.session, chatId) };
}
function formatCreateChatResult(result) {
  return `Chat created (${result.openLink}). Reply with one short sentence confirming the chat was created; do not print the URL or mention a button.`;
}
function getSendMessageArgs(rawArgs, sessions) {
  const args = rawArgs ?? {};
  const message = getRequiredString(args.message, "message", SessionServerToolName.SendMessage);
  const sessionInput = getRequiredString(args.session, "session", SessionServerToolName.SendMessage);
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.SendMessage} input: session must match the URI of a known session (see list_sessions).`);
  }
  const chatId = parseOpenSessionLinkChatId(sessionInput);
  const chat = URI.parse(chatId ? buildChatUri(session.toString(), chatId) : buildDefaultChatUri(session.toString()));
  return { session, chat, message, ...chatId !== void 0 ? { chatId } : {} };
}
async function applySendMessageTool(accessor, rawArgs, currentChannel) {
  const sessions = await accessor.listSessions();
  const { session, chat, chatId, message } = getSendMessageArgs(rawArgs, sessions);
  if (currentChannel && chat.toString() === URI.parse(currentChannel).toString()) {
    throw new Error(`Invalid ${SessionServerToolName.SendMessage} input: refusing to send a message to the current chat.`);
  }
  await accessor.startPrompt(session, chat, message);
  return formatSendMessageResult(buildOpenSessionLinkUri(session, chatId));
}
function formatSendMessageResult(openLink) {
  return `Message sent (${openLink}). Reply with one short sentence confirming the message was sent; do not print the URL or mention a button.`;
}
const defaultTranscriptLimit = 10;
const maxTranscriptLimit = 50;
const contextCaps = {
  // `summary` still carries a short assistant gist per turn so the reader sees
  // what each turn actually did, not just what was asked.
  summary: { user: 160, assistant: 140, toolInput: 0 },
  digest: { user: 300, assistant: 800, toolInput: 0 },
  full: { user: 1e3, assistant: 2e3, toolInput: 200 }
};
function getSessionContextArgs(rawArgs, sessions) {
  const args = rawArgs ?? {};
  const sessionInput = getRequiredString(args.session, "session", SessionServerToolName.GetSessionContext);
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: session must match the URI of a known session (see list_sessions).`);
  }
  let detail = "summary";
  if (args.detail !== void 0) {
    if (typeof args.detail !== "string" || !sessionContextDetailValues.includes(args.detail)) {
      throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: detail must be one of ${sessionContextDetailValues.join(", ")}.`);
    }
    detail = args.detail;
  }
  let transcriptLimit = defaultTranscriptLimit;
  if (args.transcriptLimit !== void 0) {
    if (typeof args.transcriptLimit !== "number" || !Number.isFinite(args.transcriptLimit) || args.transcriptLimit < 1) {
      throw new Error(`Invalid ${SessionServerToolName.GetSessionContext} input: transcriptLimit must be a positive number.`);
    }
    transcriptLimit = Math.min(Math.floor(args.transcriptLimit), maxTranscriptLimit);
  }
  const chatId = parseOpenSessionLinkChatId(sessionInput);
  return { session, detail, transcriptLimit, ...chatId !== void 0 ? { chatId } : {} };
}
function truncateText(text, max) {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return { text: trimmed, truncated: false };
  }
  return { text: `${trimmed.slice(0, Math.max(0, max - 1))}\u2026`, truncated: true };
}
function toolCallsOf(parts) {
  return parts.filter((p) => p.kind === ResponsePartKind.ToolCall).map((p) => p.toolCall);
}
function assistantTextOf(parts) {
  return parts.filter((p) => p.kind === ResponsePartKind.Markdown).map((p) => p.content).join("").trim();
}
function readToolInput(tc) {
  return tc.status === ToolCallStatus.Streaming ? void 0 : tc.toolInput;
}
function describeTurnState(state) {
  switch (state) {
    case TurnState.Complete:
      return "complete";
    case TurnState.Cancelled:
      return "cancelled";
    case TurnState.Error:
      return "error";
    default:
      return "inProgress";
  }
}
function serializeSessionContext(session, chatId, snapshot, detail, transcriptLimit) {
  const caps = contextCaps[detail];
  let truncated = false;
  const trunc = (text, max) => {
    if (max <= 0 || !text) {
      return void 0;
    }
    const result = truncateText(text, max);
    truncated = truncated || result.truncated;
    return result.text || void 0;
  };
  const entries = snapshot.turns.map((t) => ({ message: t.message, parts: t.responseParts, state: t.state }));
  if (snapshot.activeTurn) {
    entries.push({ message: snapshot.activeTurn.message, parts: snapshot.activeTurn.responseParts, state: "inProgress" });
  }
  if (entries.length > transcriptLimit) {
    truncated = true;
  }
  const windowStart = Math.max(0, entries.length - transcriptLimit);
  const windowed = entries.slice(windowStart);
  const transcript = windowed.map((entry, index) => {
    const user = trunc(entry.message.text, caps.user);
    const assistant = trunc(assistantTextOf(entry.parts), caps.assistant);
    const toolCalls = toolCallsOf(entry.parts);
    let serializedToolCalls;
    if (detail !== "summary" && toolCalls.length > 0) {
      serializedToolCalls = toolCalls.map((tc) => {
        if (caps.toolInput > 0) {
          const input = trunc(readToolInput(tc) ?? "", caps.toolInput);
          return input !== void 0 ? { name: tc.toolName, input } : { name: tc.toolName };
        }
        return tc.toolName;
      });
    }
    return {
      turn: windowStart + index + 1,
      state: describeTurnState(entry.state),
      ...user !== void 0 ? { user } : {},
      ...assistant !== void 0 ? { assistant } : {},
      ...serializedToolCalls ? { toolCalls: serializedToolCalls } : {}
    };
  });
  const payload = {
    session: session.toString(),
    openLink: buildOpenSessionLinkUri(session, chatId),
    detail,
    transcript,
    hasMoreHistory: snapshot.hasMoreHistory,
    truncated
  };
  return JSON.stringify(payload);
}
async function applyGetSessionContextTool(accessor, rawArgs) {
  const sessions = await accessor.listSessions();
  const { session, chatId, detail, transcriptLimit } = getSessionContextArgs(rawArgs, sessions);
  const snapshot = accessor.getChatContext(session, chatId);
  if (!snapshot) {
    return JSON.stringify({
      session: session.toString(),
      openLink: buildOpenSessionLinkUri(session, chatId),
      detail,
      transcript: [],
      hasMoreHistory: false,
      truncated: false
    });
  }
  return serializeSessionContext(session, chatId, snapshot, detail, transcriptLimit);
}
function serializeCurrentSession(currentSession, sessions) {
  const meta = sessions.find((s) => s.session.toString() === currentSession.toString());
  return JSON.stringify({
    session: currentSession.toString(),
    openLink: buildOpenSessionLinkUri(currentSession),
    ...meta ? serializeSession(meta) : {}
  });
}
function parseListedSessionCount(resultText) {
  if (!resultText) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(resultText);
    return Array.isArray(parsed.sessions) ? parsed.sessions.length : void 0;
  } catch {
    return void 0;
  }
}
function getDeleteSessionArgs(rawArgs, sessions, currentSession) {
  const args = rawArgs ?? {};
  const sessionInput = getRequiredString(args.session, "session", SessionServerToolName.DeleteSession);
  const session = resolveKnownSession(sessionInput, sessions);
  if (!session) {
    throw new Error(`Invalid ${SessionServerToolName.DeleteSession} input: session must match the URI of a known session (see list_sessions).`);
  }
  if (currentSession && session.toString() === currentSession.toString()) {
    throw new Error(`Invalid ${SessionServerToolName.DeleteSession} input: refusing to delete the current session.`);
  }
  return session;
}
async function applyDeleteSessionTool(accessor, rawArgs, currentSession) {
  const sessions = await accessor.listSessions();
  const session = getDeleteSessionArgs(rawArgs, sessions, currentSession);
  await accessor.deleteSession(session);
  return `Deleted session ${session.toString()}. Reply with one short sentence confirming the session was deleted.`;
}
function getSessionToolDisplay(toolName, _args, result) {
  switch (toolName) {
    case SessionServerToolName.ListSessions: {
      let pastTenseMessage;
      const count = result ? parseListedSessionCount(result.text) : void 0;
      if (count === void 0) {
        pastTenseMessage = localize("toolComplete.listSessions", "Checked sessions");
      } else if (count === 1) {
        pastTenseMessage = localize("toolComplete.listSessions.one", "Checked 1 session");
      } else {
        pastTenseMessage = localize("toolComplete.listSessions.many", "Checked {0} sessions", count);
      }
      return {
        displayName: localize("toolName.listSessions", "List Sessions"),
        invocationMessage: localize("toolInvoke.listSessions", "Checking sessions"),
        pastTenseMessage
      };
    }
    case SessionServerToolName.CreateSession:
      return {
        displayName: localize("toolName.createSession", "Create Session"),
        invocationMessage: localize("toolInvoke.createSession", "Creating session"),
        pastTenseMessage: localize("toolComplete.createSession", "Created session")
      };
    case SessionServerToolName.CreateChat:
      return {
        displayName: localize("toolName.createChat", "Create Chat"),
        invocationMessage: localize("toolInvoke.createChat", "Creating chat"),
        pastTenseMessage: localize("toolComplete.createChat", "Created chat")
      };
    case SessionServerToolName.SendMessage:
      return {
        displayName: localize("toolName.sendMessage", "Send Message"),
        invocationMessage: localize("toolInvoke.sendMessage", "Sending message"),
        pastTenseMessage: localize("toolComplete.sendMessage", "Sent message")
      };
    case SessionServerToolName.GetSessionContext:
      return {
        displayName: localize("toolName.getSessionContext", "Get Session Context"),
        invocationMessage: localize("toolInvoke.getSessionContext", "Reading session context"),
        pastTenseMessage: localize("toolComplete.getSessionContext", "Read session context")
      };
    case SessionServerToolName.GetCurrentSession:
      return {
        displayName: localize("toolName.getCurrentSession", "Get Current Session"),
        invocationMessage: localize("toolInvoke.getCurrentSession", "Checking current session"),
        pastTenseMessage: localize("toolComplete.getCurrentSession", "Checked current session")
      };
    case SessionServerToolName.DeleteSession:
      return {
        displayName: localize("toolName.deleteSession", "Delete Session"),
        invocationMessage: localize("toolInvoke.deleteSession", "Deleting session"),
        pastTenseMessage: localize("toolComplete.deleteSession", "Deleted session")
      };
    default:
      return void 0;
  }
}
function createSessionServerToolGroup(accessor) {
  let createdSessionCount = 0;
  let createdChatCount = 0;
  let sentMessageCount = 0;
  const group = {
    definitions: sessionServerToolDefinitions,
    requiresConfirmation(toolName) {
      return sessionToolRequiresConfirmation(toolName);
    },
    getDisplay(toolName, args, result) {
      return getSessionToolDisplay(toolName, args, result);
    },
    async execute(_stateManager, sessionUri, toolName, rawArgs) {
      if (!accessor) {
        throw new Error(`Session server tool "${toolName}" cannot run: the group was built without a session accessor.`);
      }
      switch (toolName) {
        case SessionServerToolName.ListSessions:
          return serializeSessions(filterSessions(await accessor.listSessions(), getListSessionsArgs(rawArgs)));
        case SessionServerToolName.GetCurrentSession:
          return serializeCurrentSession(currentSessionUri(sessionUri), await accessor.listSessions());
        case SessionServerToolName.CreateSession: {
          if (createdSessionCount >= maxCreatedSessions) {
            throw new Error(`Refusing to create more than ${maxCreatedSessions} sessions from server tools in this process.`);
          }
          const result = await applyCreateSessionTool(accessor, rawArgs, currentSessionUri(sessionUri));
          createdSessionCount++;
          return formatCreateSessionResult(result);
        }
        case SessionServerToolName.CreateChat: {
          if (createdChatCount >= maxCreatedChats) {
            throw new Error(`Refusing to create more than ${maxCreatedChats} chats from server tools in this process.`);
          }
          const result = await applyCreateChatTool(accessor, rawArgs, currentSessionUri(sessionUri));
          createdChatCount++;
          return formatCreateChatResult(result);
        }
        case SessionServerToolName.SendMessage: {
          if (sentMessageCount >= maxSentMessages) {
            throw new Error(`Refusing to send more than ${maxSentMessages} messages from server tools in this process.`);
          }
          const result = await applySendMessageTool(accessor, rawArgs, sessionUri);
          sentMessageCount++;
          return result;
        }
        case SessionServerToolName.GetSessionContext:
          return applyGetSessionContextTool(accessor, rawArgs);
        case SessionServerToolName.DeleteSession:
          return applyDeleteSessionTool(accessor, rawArgs, currentSessionUri(sessionUri));
        default:
          throw new Error(`Unknown session server tool: ${toolName}`);
      }
    }
  };
  return group;
}
export {
  applyCreateChatTool,
  applyCreateSessionTool,
  applyDeleteSessionTool,
  applyGetSessionContextTool,
  applySendMessageTool,
  createSessionServerToolGroup,
  currentSessionUri,
  filterSessions,
  formatCreateChatResult,
  formatCreateSessionResult,
  formatSendMessageResult,
  getCreateChatArgs,
  getCreateSessionArgs,
  getDeleteSessionArgs,
  getListSessionsArgs,
  getSendMessageArgs,
  getSessionContextArgs,
  serializeCurrentSession,
  serializeSessionContext,
  serializeSessions,
  sessionServerToolDefinitions,
  sessionToolRequiresConfirmation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9zZXNzaW9uU2VydmVyVG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHR5cGUgeyBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnLCBJQWdlbnRNb2RlbEluZm8sIElBZ2VudFNlc3Npb25NZXRhZGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgaXNTZXNzaW9uU3RhdHVzQXJjaGl2ZWQsIGlzU2Vzc2lvblN0YXR1c1JlYWQsIHBhcnNlQ2hhdFVyaSwgcmVhZFNlc3Npb25HaXRTdGF0ZSwgcmVhZFNlc3Npb25HaXRIdWJTdGF0ZSwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxTdGF0dXMsIFR1cm5TdGF0ZSwgdHlwZSBNZXNzYWdlLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBUb29sQ2FsbFN0YXRlLCB0eXBlIFRvb2xEZWZpbml0aW9uLCB0eXBlIFN0cmluZ09yTWFya2Rvd24sIHR5cGUgVHVybiwgdHlwZSBVUkkgYXMgUHJvdG9jb2xVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkT3BlblNlc3Npb25MaW5rVXJpLCBwYXJzZU9wZW5TZXNzaW9uTGlua0NoYXRJZCwgcGFyc2VPcGVuU2Vzc2lvbkxpbmtVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vb3BlblNlc3Npb25MaW5rLmpzJztcbmltcG9ydCB7IFNlc3Npb25TZXJ2ZXJUb29sTmFtZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2ZXJUb29sTmFtZXMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXJ2ZXJUb29sRGlzcGxheSwgSVNlcnZlclRvb2xEaXNwbGF5UmVzdWx0LCBJU2VydmVyVG9vbEdyb3VwIH0gZnJvbSAnLi9hZ2VudFNlcnZlclRvb2xIb3N0LmpzJztcblxuLyoqXG4gKiBNYXhpbXVtIGBjcmVhdGVfc2Vzc2lvbmAgcmVjdXJzaW9uIGRlcHRoLiBBIHVzZXIvdG9wLWxldmVsIHNlc3Npb24gaXMgZGVwdGggMDtcbiAqIGEgc2Vzc2lvbiBjcmVhdGVkIGJ5IGBjcmVhdGVfc2Vzc2lvbmAgZnJvbSB3aXRoaW4gYSBkZXB0aC1OIHNlc3Npb24gaXMgZGVwdGhcbiAqIE4rMS4gT25jZSBhIHNlc3Npb24gcmVhY2hlcyB0aGlzIGRlcHRoLCBpdHMgYWdlbnQgbWF5IG5vdCBjcmVhdGUgZnVydGhlclxuICogc2Vzc2lvbnMgXHUyMDE0IHRoaXMgYm91bmRzIHJlY3Vyc2l2ZSBzcGF3biAqY2hhaW5zKiAoQVx1MjE5MkJcdTIxOTJDXHUyMTkyXHUyMDI2KS4gQnJlYWR0aCBpcyBib3VuZGVkXG4gKiBzZXBhcmF0ZWx5IGJ5IHtAbGluayBtYXhDcmVhdGVkU2Vzc2lvbnN9IHBsdXMgdGhlIHBlci1jYWxsIHVzZXIgY29uZmlybWF0aW9uLlxuICovXG5jb25zdCBtYXhTZXNzaW9uU3Bhd25EZXB0aCA9IDM7XG5cbi8qKiBQcm9jZXNzLXdpZGUgYmFja3N0b3AgYWdhaW5zdCBydW5hd2F5IHNwYXduaW5nIChicmVhZHRoKSwgaW5kZXBlbmRlbnQgb2YgZGVwdGguICovXG5jb25zdCBtYXhDcmVhdGVkU2Vzc2lvbnMgPSAyNTtcbmNvbnN0IG1heENyZWF0ZWRDaGF0cyA9IDI1O1xuXG4vKiogUHJvY2Vzcy13aWRlIGJhY2tzdG9wIGFnYWluc3QgcnVuYXdheSBgc2VuZF9tZXNzYWdlYCBmYW4tb3V0LiAqL1xuY29uc3QgbWF4U2VudE1lc3NhZ2VzID0gNTA7XG5cbmNvbnN0IHNlc3Npb25Db25maXJtYXRpb25Ub29sTmFtZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFtTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbiwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZSwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkRlbGV0ZVNlc3Npb25dKTtcblxuLyoqIFdoZXRoZXIgdGhlIGdpdmVuIHNlc3Npb24gc2VydmVyIHRvb2wgcmVxdWlyZXMgdXNlciBjb25maXJtYXRpb24gYmVmb3JlIGl0IHJ1bnMuICovXG5leHBvcnQgZnVuY3Rpb24gc2Vzc2lvblRvb2xSZXF1aXJlc0NvbmZpcm1hdGlvbih0b29sTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBzZXNzaW9uQ29uZmlybWF0aW9uVG9vbE5hbWVzLmhhcyh0b29sTmFtZSk7XG59XG5cbmNvbnN0IGxpc3RTZXNzaW9uc1N0YXR1c1ZhbHVlcyA9IFsnaWRsZScsICdpblByb2dyZXNzJywgJ2lucHV0TmVlZGVkJywgJ2Vycm9yJywgJ2FyY2hpdmVkJ10gYXMgY29uc3Q7XG5cbmNvbnN0IGxpc3RTZXNzaW9uc0lucHV0U2NoZW1hOiBUb29sRGVmaW5pdGlvblsnaW5wdXRTY2hlbWEnXSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRzZXNzaW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1JldHVybiBvbmx5IHRoZSBzZXNzaW9uIHdpdGggdGhpcyBVUkkgb3IgYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluayAoYSBkaXJlY3QgbG9va3VwIHRoYXQgaWdub3JlcyB0aGUgb3RoZXIgZmlsdGVycykuIFVzZSB0aGlzIHRvIGZldGNoIG9uZSBrbm93biBzZXNzaW9uXFwncyBtZXRhZGF0YS4nIH0sXG5cdFx0c3RhdHVzOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IFsuLi5saXN0U2Vzc2lvbnNTdGF0dXNWYWx1ZXNdIH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogJ09ubHkgcmV0dXJuIHNlc3Npb25zIHdob3NlIHN0YXR1cyBtYXRjaGVzIG9uZSBvZiB0aGVzZSAoZS5nLiBgaW5wdXROZWVkZWRgIGZvciBzZXNzaW9ucyBhd2FpdGluZyBhIHJlcGx5LCBgaW5Qcm9ncmVzc2AgZm9yIHJ1bm5pbmcgb25lcywgYGFyY2hpdmVkYCBmb3Igc2Vzc2lvbnMgbWFya2VkIERvbmUvY29tcGxldGVkIFx1MjAxNCBpbXBsaWVzIGBpbmNsdWRlQXJjaGl2ZWRgKS4gT21pdCB0byByZXR1cm4gZXZlcnkgc3RhdHVzLicsXG5cdFx0fSxcblx0XHR3b3Jrc3BhY2U6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnT25seSByZXR1cm4gc2Vzc2lvbnMgd2hvc2Ugd29ya2luZyBkaXJlY3RvcnkgaXMgdGhpcyBmb2xkZXIgXHUyMDE0IGFuIGFic29sdXRlIHBhdGggb3IgYSB3b3Jrc3BhY2UgVVJJLicgfSxcblx0XHR3aXRoQ2hhbmdlczogeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiAnV2hlbiB0cnVlLCBvbmx5IHJldHVybiBzZXNzaW9ucyB0aGF0IGhhdmUgcGVuZGluZyB3b3JrdHJlZSBjaGFuZ2VzLicgfSxcblx0XHR1bnJlYWQ6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogJ1doZW4gdHJ1ZSwgb25seSByZXR1cm4gc2Vzc2lvbnMgd2l0aCB1cGRhdGVzIHRoZSB1c2VyIGhhcyBub3Qgc2VlbiB5ZXQuJyB9LFxuXHRcdHdpdGhQdWxsUmVxdWVzdDogeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiAnV2hlbiB0cnVlLCBvbmx5IHJldHVybiBzZXNzaW9ucyB0aGF0IGhhdmUgYSBsaW5rZWQgR2l0SHViIHB1bGwgcmVxdWVzdC4nIH0sXG5cdFx0aW5jbHVkZUFyY2hpdmVkOiB7IHR5cGU6ICdib29sZWFuJywgZGVzY3JpcHRpb246ICdXaGV0aGVyIHRvIGluY2x1ZGUgYXJjaGl2ZWQgc2Vzc2lvbnMuIERlZmF1bHRzIHRvIGZhbHNlOyBzZXQgdHJ1ZSB0byBhbHNvIHJldHVybiBhcmNoaXZlZCBzZXNzaW9ucy4nIH0sXG5cdFx0Y3JlYXRlZEFmdGVyOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09ubHkgcmV0dXJuIHNlc3Npb25zIGNyZWF0ZWQgYXQgb3IgYWZ0ZXIgdGhpcyB0aW1lIChJU08tODYwMSB0aW1lc3RhbXAsIGUuZy4gYDIwMjUtMDEtMzFUMDA6MDA6MDBaYCkuJyB9LFxuXHRcdGNyZWF0ZWRCZWZvcmU6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnT25seSByZXR1cm4gc2Vzc2lvbnMgY3JlYXRlZCBhdCBvciBiZWZvcmUgdGhpcyB0aW1lIChJU08tODYwMSB0aW1lc3RhbXApLicgfSxcblx0fSxcbn07XG5cbmNvbnN0IGNyZWF0ZVNlc3Npb25JbnB1dFNjaGVtYTogVG9vbERlZmluaXRpb25bJ2lucHV0U2NoZW1hJ10gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0d29ya3NwYWNlOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ0Fic29sdXRlIGZvbGRlciBwYXRoLCB3b3Jrc3BhY2UgVVJJLCBvciBhIHdvcmtpbmcgZGlyZWN0b3J5IGZyb20gYW4gZXhpc3Rpbmcgc2Vzc2lvbi4nIH0sXG5cdFx0cHJvbXB0OiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ0luaXRpYWwgcHJvbXB0IHRvIHNlbmQgdG8gdGhlIG5ldyBzZXNzaW9uLicgfSxcblx0XHRtb2RlbDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdPcHRpb25hbCBtb2RlbCBJRCBvciBkaXNwbGF5IG5hbWUuJyB9LFxuXHR9LFxuXHRyZXF1aXJlZDogWyd3b3Jrc3BhY2UnLCAncHJvbXB0J10sXG59O1xuXG5jb25zdCBnZXRDdXJyZW50U2Vzc2lvbklucHV0U2NoZW1hOiBUb29sRGVmaW5pdGlvblsnaW5wdXRTY2hlbWEnXSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHt9LFxufTtcblxuY29uc3QgY3JlYXRlQ2hhdElucHV0U2NoZW1hOiBUb29sRGVmaW5pdGlvblsnaW5wdXRTY2hlbWEnXSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRzZXNzaW9uOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09wdGlvbmFsIHNlc3Npb24gdG8gYWRkIHRoZSBjaGF0IHRvOiBhIHNlc3Npb24gVVJJIGZyb20gYGxpc3Rfc2Vzc2lvbnNgIG9yIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9gIGxpbmsuIERlZmF1bHRzIHRvIHRoZSBjdXJyZW50IHNlc3Npb24gd2hlbiBvbWl0dGVkLicgfSxcblx0XHRwcm9tcHQ6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnSW5pdGlhbCBwcm9tcHQgdG8gc2VuZCB0byB0aGUgbmV3IGNoYXQuJyB9LFxuXHRcdHRpdGxlOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09wdGlvbmFsIHRpdGxlIGZvciB0aGUgbmV3IGNoYXQuJyB9LFxuXHRcdG1vZGVsOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ09wdGlvbmFsIG1vZGVsIElEIG9yIGRpc3BsYXkgbmFtZS4gRGVmYXVsdHMgdG8gdGhlIHNlc3Npb25cXCdzIG1vZGVsLicgfSxcblx0fSxcblx0cmVxdWlyZWQ6IFsncHJvbXB0J10sXG59O1xuXG5jb25zdCBkZWxldGVTZXNzaW9uSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdHNlc3Npb246IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnVGhlIHNlc3Npb24gdG8gZGVsZXRlOiBhIHNlc3Npb24gVVJJIGZyb20gYGxpc3Rfc2Vzc2lvbnNgIG9yIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9gIGxpbmsgKGUuZy4gZnJvbSBgY3JlYXRlX3Nlc3Npb25gKS4nIH0sXG5cdH0sXG5cdHJlcXVpcmVkOiBbJ3Nlc3Npb24nXSxcbn07XG5cbmNvbnN0IHNlbmRNZXNzYWdlSW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdHNlc3Npb246IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnVGhlIHNlc3Npb24gb3IgY2hhdCB0byBtZXNzYWdlOiBhIHNlc3Npb24gVVJJIGZyb20gYGxpc3Rfc2Vzc2lvbnNgLCBvciBhbiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vYCBsaW5rIChmcm9tIGBjcmVhdGVfc2Vzc2lvbmAvYGNyZWF0ZV9jaGF0YDsgYSBgY3JlYXRlX2NoYXRgIGxpbmsgdGFyZ2V0cyB0aGF0IHNwZWNpZmljIGNoYXQpLicgfSxcblx0XHRtZXNzYWdlOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1RoZSBtZXNzYWdlIHRvIHNlbmQuJyB9LFxuXHR9LFxuXHRyZXF1aXJlZDogWydzZXNzaW9uJywgJ21lc3NhZ2UnXSxcbn07XG5cbmNvbnN0IHNlc3Npb25Db250ZXh0RGV0YWlsVmFsdWVzID0gWydzdW1tYXJ5JywgJ2RpZ2VzdCcsICdmdWxsJ10gYXMgY29uc3Q7XG5cbmNvbnN0IGdldFNlc3Npb25Db250ZXh0SW5wdXRTY2hlbWE6IFRvb2xEZWZpbml0aW9uWydpbnB1dFNjaGVtYSddID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdHNlc3Npb246IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiAnVGhlIHNlc3Npb24gb3IgY2hhdCB0byByZWFkOiBhIHNlc3Npb24gVVJJIGZyb20gYGxpc3Rfc2Vzc2lvbnNgLCBvciBhbiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vYCBsaW5rIChhIGBjcmVhdGVfY2hhdGAgbGluayB0YXJnZXRzIHRoYXQgc3BlY2lmaWMgY2hhdCkuJyB9LFxuXHRcdGRldGFpbDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbLi4uc2Vzc2lvbkNvbnRleHREZXRhaWxWYWx1ZXNdLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdIb3cgbXVjaCBjb252ZXJzYXRpb24gZGV0YWlsIHRvIHJldHVybi4gYHN1bW1hcnlgIChkZWZhdWx0KTogc3RhdHVzIGFuZCBhIHNob3J0IHBlci10dXJuIGdpc3QgKHRoZSBtZXNzYWdlIHBsdXMgYSBjb21wYWN0IHNuaXBwZXQgb2YgdGhlIHJlcGx5KS4gYGRpZ2VzdGA6IGFkZHMgdGhlIGZ1bGwgYXNzaXN0YW50IHJlcGx5IHRleHQgYW5kIHRvb2wtY2FsbCBuYW1lcy4gYGZ1bGxgOiBhZGRzIHRvb2wtY2FsbCBpbnB1dHMuIEhpZ2hlciBsZXZlbHMgcmV0dXJuIG1vcmUgdG9rZW5zLicsXG5cdFx0fSxcblx0XHR0cmFuc2NyaXB0TGltaXQ6IHsgdHlwZTogJ251bWJlcicsIGRlc2NyaXB0aW9uOiAnTWF4aW11bSBudW1iZXIgb2YgbW9zdC1yZWNlbnQgdHVybnMgdG8gaW5jbHVkZS4gRGVmYXVsdHMgdG8gMTA7IGNhcHBlZCBhdCA1MC4nIH0sXG5cdH0sXG5cdHJlcXVpcmVkOiBbJ3Nlc3Npb24nXSxcbn07XG5cbi8qKiBQcm90b2NvbCB0b29sIGRlZmluaXRpb25zIGZvciB0aGUgc2Vzc2lvbi1tYW5hZ2VtZW50IHNlcnZlciB0b29scy4gKi9cbmV4cG9ydCBjb25zdCBzZXNzaW9uU2VydmVyVG9vbERlZmluaXRpb25zOiBUb29sRGVmaW5pdGlvbltdID0gW1xuXHR7XG5cdFx0bmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyxcblx0XHR0aXRsZTogJ0xpc3QgU2Vzc2lvbnMnLFxuXHRcdGRlc2NyaXB0aW9uOiAnTGlzdCBzZXNzaW9ucyBhbmQgdGhlaXIgY29tcGFjdCBtZXRhZGF0YSAoc3RhdHVzLCBhY3Rpdml0eSwgd29ya2luZyBkaXJlY3RvcnksIHByb2plY3QsIHdvcmt0cmVlIGNoYW5nZXMsIGdpdC9HaXRIdWIgaW5mbywgdGltZXN0YW1wcykuIFBhc3MgYHNlc3Npb25gIHRvIGZldGNoIGEgc2luZ2xlIGtub3duIHNlc3Npb24gYnkgVVJJLiBCeSBkZWZhdWx0IGFyY2hpdmVkIHNlc3Npb25zIGFyZSBvbWl0dGVkLiBPcHRpb25hbGx5IGZpbHRlciBieSBgc3RhdHVzYCwgYHdvcmtzcGFjZWAsIGB3aXRoQ2hhbmdlc2AsIGB1bnJlYWRgLCBgd2l0aFB1bGxSZXF1ZXN0YCwgYGluY2x1ZGVBcmNoaXZlZGAsIGBjcmVhdGVkQWZ0ZXJgLCBvciBgY3JlYXRlZEJlZm9yZWAuJyxcblx0XHRpbnB1dFNjaGVtYTogbGlzdFNlc3Npb25zSW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiB0cnVlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0Q3VycmVudFNlc3Npb24sXG5cdFx0dGl0bGU6ICdHZXQgQ3VycmVudCBTZXNzaW9uJyxcblx0XHRkZXNjcmlwdGlvbjogJ0dldCBtZXRhZGF0YSBhbmQgdGhlIG9wZW4gbGluayBmb3IgdGhlIHNlc3Npb24gdGhpcyBjb252ZXJzYXRpb24gaXMgcnVubmluZyBpbi4gVXNlIHRoaXMgdG8gcmVmZXJlbmNlIHRoZSBjdXJyZW50IHNlc3Npb24gKGZvciBleGFtcGxlIGJlZm9yZSBhZGRpbmcgYSBjaGF0IHRvIGl0KS4nLFxuXHRcdGlucHV0U2NoZW1hOiBnZXRDdXJyZW50U2Vzc2lvbklucHV0U2NoZW1hLFxuXHRcdGFubm90YXRpb25zOiB7IHJlYWRPbmx5SGludDogdHJ1ZSB9LFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sXG5cdFx0dGl0bGU6ICdDcmVhdGUgU2Vzc2lvbicsXG5cdFx0ZGVzY3JpcHRpb246ICdDcmVhdGUgYSBzZXNzaW9uIGluIGEgd29ya3NwYWNlIGFuZCBzdGFydCBpdCB3aXRoIGFuIGluaXRpYWwgcHJvbXB0LiBUaGUgVUkgc2hvd3MgYSBcIlNlc3Npb24gQ3JlYXRlZFwiIGNvbmZpcm1hdGlvbiB3aXRoIGEgYnV0dG9uIHRvIG9wZW4gaXQsIHNvIHJlcGx5IHdpdGggYSBzaW5nbGUgc2hvcnQgc2VudGVuY2UgY29uZmlybWluZyB0aGUgc2Vzc2lvbiB3YXMgY3JlYXRlZCBhbmQgZG8gTk9UIHByaW50IHRoZSBzZXNzaW9uIFVSTCBvciB0ZWxsIHRoZSB1c2VyIHRvIGNsaWNrIGEgYnV0dG9uLicsXG5cdFx0aW5wdXRTY2hlbWE6IGNyZWF0ZVNlc3Npb25JbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IGZhbHNlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlQ2hhdCxcblx0XHR0aXRsZTogJ0NyZWF0ZSBDaGF0Jyxcblx0XHRkZXNjcmlwdGlvbjogJ0FkZCBhIG5ldyBjaGF0IHRvIGFuIGV4aXN0aW5nIHNlc3Npb24gYW5kIHN0YXJ0IGl0IHdpdGggYW4gaW5pdGlhbCBwcm9tcHQuIE9taXQgYHNlc3Npb25gIHRvIGFkZCB0aGUgY2hhdCB0byB0aGUgY3VycmVudCBzZXNzaW9uOyBvdGhlcndpc2UgcGFzcyBhIHNlc3Npb24gVVJJIGZyb20gYGxpc3Rfc2Vzc2lvbnNgLiBPcHRpb25hbGx5IHBhc3MgYSBgbW9kZWxgIHRvIHVzZSBmb3IgdGhlIGNoYXQgKGRlZmF1bHRzIHRvIHRoZSBzZXNzaW9uXFwncyBtb2RlbCkuIFRoZSBVSSBzaG93cyBhIFwiQ2hhdCBDcmVhdGVkXCIgY29uZmlybWF0aW9uIHdpdGggYSBidXR0b24gdG8gb3BlbiB0aGUgc2Vzc2lvbiwgc28gcmVwbHkgd2l0aCBhIHNpbmdsZSBzaG9ydCBzZW50ZW5jZSBhbmQgZG8gTk9UIHByaW50IHRoZSBzZXNzaW9uIFVSTCBvciB0ZWxsIHRoZSB1c2VyIHRvIGNsaWNrIGEgYnV0dG9uLicsXG5cdFx0aW5wdXRTY2hlbWE6IGNyZWF0ZUNoYXRJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IGZhbHNlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2UsXG5cdFx0dGl0bGU6ICdTZW5kIE1lc3NhZ2UnLFxuXHRcdGRlc2NyaXB0aW9uOiAnU2VuZCBhIG1lc3NhZ2UgdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbiBvciBjaGF0LCBzdGFydGluZyBhIG5ldyB0dXJuIHRoZXJlLiBQcm92aWRlIGEgc2Vzc2lvbiBVUkkgZnJvbSBgbGlzdF9zZXNzaW9uc2Agb3IgYW4gYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluayAoYSBgY3JlYXRlX2NoYXRgIGxpbmsgdGFyZ2V0cyB0aGF0IHNwZWNpZmljIGNoYXQpLiBUaGUgbWVzc2FnZSBpcyBkZWxpdmVyZWQgYXN5bmNocm9ub3VzbHkgXHUyMDE0IHRoaXMgdG9vbCBkb2VzIG5vdCB3YWl0IGZvciBvciByZXR1cm4gdGhlIHJlcGx5LiBUaGUgVUkgc2hvd3MgYSBjb25maXJtYXRpb24gd2l0aCBhIGJ1dHRvbiB0byBvcGVuIHRoZSB0YXJnZXQsIHNvIHJlcGx5IHdpdGggYSBzaW5nbGUgc2hvcnQgc2VudGVuY2UgYW5kIGRvIE5PVCBwcmludCB0aGUgVVJMIG9yIHRlbGwgdGhlIHVzZXIgdG8gY2xpY2sgYSBidXR0b24uJyxcblx0XHRpbnB1dFNjaGVtYTogc2VuZE1lc3NhZ2VJbnB1dFNjaGVtYSxcblx0XHRhbm5vdGF0aW9uczogeyByZWFkT25seUhpbnQ6IGZhbHNlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuR2V0U2Vzc2lvbkNvbnRleHQsXG5cdFx0dGl0bGU6ICdHZXQgU2Vzc2lvbiBDb250ZXh0Jyxcblx0XHRkZXNjcmlwdGlvbjogJ1JlYWQgdGhlIHJlY2VudCBjb252ZXJzYXRpb24gb2YgYW4gZXhpc3Rpbmcgc2Vzc2lvbiBvciBjaGF0OiBhIGNvbXBhY3RlZCB0cmFuc2NyaXB0IG9mIGl0cyB0dXJucyAobWVzc2FnZXMsIHJlcGxpZXMsIGFuZCB0b29sIGNhbGxzKS4gVXNlIHRoaXMgdG8gc2VlIHdoYXQgYSBzZXNzaW9uIHlvdSBjcmVhdGVkIGlzIGRvaW5nLCBvciB0byBnYXRoZXIgY29udGV4dCBiZWZvcmUgc2VuZGluZyBpdCBhIG1lc3NhZ2UuIFJldHVybnMgYSBjb21wYWN0ZWQgc3VtbWFyeSBieSBkZWZhdWx0IChgZGV0YWlsOiBcInN1bW1hcnlcImApOyByZXF1ZXN0IGBkaWdlc3RgIG9yIGBmdWxsYCBmb3IgbW9yZSBkZXRhaWwuIEZvciBzZXNzaW9uIG1ldGFkYXRhIChzdGF0dXMsIHdvcmtpbmcgZGlyZWN0b3J5LCBjaGFuZ2VzLCBcdTIwMjYpIHVzZSBgbGlzdF9zZXNzaW9uc2Agd2l0aCB0aGUgYHNlc3Npb25gIGFyZ3VtZW50LicsXG5cdFx0aW5wdXRTY2hlbWE6IGdldFNlc3Npb25Db250ZXh0SW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiB0cnVlIH0sXG5cdH0sXG5cdHtcblx0XHRuYW1lOiBTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbixcblx0XHR0aXRsZTogJ0RlbGV0ZSBTZXNzaW9uJyxcblx0XHRkZXNjcmlwdGlvbjogJ1Blcm1hbmVudGx5IGRlbGV0ZSBhIHNlc3Npb24gKGlkZW50aWZpZWQgYnkgYSBzZXNzaW9uIFVSSSBmcm9tIGBsaXN0X3Nlc3Npb25zYCksIGluY2x1ZGluZyBpdHMgc3RvcmVkIGRhdGEuIFRoaXMgY2Fubm90IGJlIHVuZG9uZS4gUmVmdXNlcyB0byBkZWxldGUgdGhlIGN1cnJlbnQgc2Vzc2lvbi4nLFxuXHRcdGlucHV0U2NoZW1hOiBkZWxldGVTZXNzaW9uSW5wdXRTY2hlbWEsXG5cdFx0YW5ub3RhdGlvbnM6IHsgcmVhZE9ubHlIaW50OiBmYWxzZSwgZGVzdHJ1Y3RpdmVIaW50OiB0cnVlIH0sXG5cdH0sXG5dO1xuXG4vKiogUmVzb2x2ZXMgdGhlIG93bmluZyBiYWNrZW5kIHNlc3Npb24gVVJJIGZvciB0aGUgY2hhbm5lbCBhIHRvb2wgY2FsbCBydW5zIG9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGN1cnJlbnRTZXNzaW9uVXJpKHRvb2xDYWxsQ2hhbm5lbDogUHJvdG9jb2xVUkkpOiBVUkkge1xuXHRjb25zdCBvd25pbmcgPSBwYXJzZUNoYXRVcmkodG9vbENhbGxDaGFubmVsKSA/PyB1bmRlZmluZWQ7XG5cdHJldHVybiBVUkkucGFyc2Uob3duaW5nPy5zZXNzaW9uID8/IHRvb2xDYWxsQ2hhbm5lbCk7XG59XG5cbmludGVyZmFjZSBJQ3JlYXRlU2Vzc2lvbkFyZ3Mge1xuXHRyZWFkb25seSB3b3Jrc3BhY2U/OiB1bmtub3duO1xuXHRyZWFkb25seSBwcm9tcHQ/OiB1bmtub3duO1xuXHRyZWFkb25seSBtb2RlbD86IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkQ3JlYXRlU2Vzc2lvbkFyZ3Mge1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IFVSSTtcblx0cmVhZG9ubHkgcHJvbXB0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGVsPzogSUFnZW50TW9kZWxJbmZvO1xufVxuXG4vKiogTWluaW1hbCBkZXBlbmRlbmN5IHN1cmZhY2UgbmVlZGVkIGJ5IHRoZSBzZXNzaW9uIHNlcnZlci10b29sIGdyb3VwLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciB7XG5cdHJlYWRvbmx5IGxpc3RTZXNzaW9uczogKCkgPT4gUHJvbWlzZTxyZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT47XG5cdHJlYWRvbmx5IGNyZWF0ZVNlc3Npb246IChjb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcpID0+IFByb21pc2U8VVJJPjtcblx0cmVhZG9ubHkgZ2V0TW9kZWxzOiAoKSA9PiByZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXTtcblx0cmVhZG9ubHkgc3RhcnRQcm9tcHQ6IChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD47XG5cdHJlYWRvbmx5IGNyZWF0ZUNoYXQ6IChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgb3B0aW9ucz86IHsgdGl0bGU/OiBzdHJpbmc7IG1vZGVsPzogSUFnZW50TW9kZWxJbmZvIH0pID0+IFByb21pc2U8dm9pZD47XG5cdHJlYWRvbmx5IGRlbGV0ZVNlc3Npb246IChzZXNzaW9uOiBVUkkpID0+IFByb21pc2U8dm9pZD47XG5cdC8qKiBSZWFkcyBhIHBvaW50LWluLXRpbWUgc25hcHNob3Qgb2YgYSBzZXNzaW9uJ3MgY2hhdCBjb252ZXJzYXRpb24gKGRlZmF1bHQgY2hhdCwgb3IgYSBzcGVjaWZpYyBjaGF0IGJ5IGlkKS4gKi9cblx0cmVhZG9ubHkgZ2V0Q2hhdENvbnRleHQ6IChzZXNzaW9uOiBVUkksIGNoYXRJZD86IHN0cmluZykgPT4gSUNoYXRDb250ZXh0U25hcHNob3QgfCB1bmRlZmluZWQ7XG5cdC8qKiBUaGUgc3Bhd24gZGVwdGggb2YgYSBzZXNzaW9uICgwIGZvciBhIHVzZXIvdG9wLWxldmVsIHNlc3Npb24sIE4gZm9yIG9uZSBjcmVhdGVkIE4gbGV2ZWxzIGRlZXAgYnkgYGNyZWF0ZV9zZXNzaW9uYCkuICovXG5cdHJlYWRvbmx5IGdldFNlc3Npb25TcGF3bkRlcHRoOiAoc2Vzc2lvbjogVVJJKSA9PiBudW1iZXI7XG5cdC8qKiBSZWNvcmRzIHRoZSBzcGF3biBkZXB0aCBvZiBhIGZyZXNobHktY3JlYXRlZCBzZXNzaW9uIHNvIGl0cyBvd24gYGNyZWF0ZV9zZXNzaW9uYCBjYWxscyBjYW4gZW5mb3JjZSB0aGUgcmVjdXJzaW9uIGxpbWl0LiAqL1xuXHRyZWFkb25seSBzZXRTZXNzaW9uU3Bhd25EZXB0aDogKHNlc3Npb246IFVSSSwgZGVwdGg6IG51bWJlcikgPT4gdm9pZDtcbn1cblxuLyoqIFBvaW50LWluLXRpbWUgc25hcHNob3Qgb2YgYSBjaGF0J3MgY29udmVyc2F0aW9uLCByZWFkIGZyb20gdGhlIGhvc3Qgc3RhdGUuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29udGV4dFNuYXBzaG90IHtcblx0LyoqIENvbXBsZXRlZCB0dXJucywgb2xkZXN0IGZpcnN0LiAqL1xuXHRyZWFkb25seSB0dXJuczogcmVhZG9ubHkgVHVybltdO1xuXHQvKiogVGhlIGluLXByb2dyZXNzIHR1cm4sIGlmIHRoZSBjaGF0IGlzIG1pZC1yZXNwb25zZS4gKi9cblx0cmVhZG9ubHkgYWN0aXZlVHVybj86IFBpY2s8VHVybiwgJ21lc3NhZ2UnIHwgJ3Jlc3BvbnNlUGFydHMnPjtcblx0LyoqIGB0cnVlYCB3aGVuIG9sZGVyIGNvbXBsZXRlZCB0dXJucyBleGlzdCBiZXlvbmQgdGhlIGluLW1lbW9yeSB3aW5kb3cuICovXG5cdHJlYWRvbmx5IGhhc01vcmVIaXN0b3J5OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRHaXRTdGF0ZSB7XG5cdHJlYWRvbmx5IGJyYW5jaD86IHN0cmluZztcblx0cmVhZG9ubHkgYmFzZUJyYW5jaD86IHN0cmluZztcblx0cmVhZG9ubHkgdXBzdHJlYW1CcmFuY2g/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFoZWFkPzogbnVtYmVyO1xuXHRyZWFkb25seSBiZWhpbmQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHVuY29tbWl0dGVkQ2hhbmdlcz86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkR2l0SHViU3RhdGUge1xuXHRyZWFkb25seSBvd25lcj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVwbz86IHN0cmluZztcblx0cmVhZG9ubHkgcHVsbFJlcXVlc3RVcmw/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZFNlc3Npb24ge1xuXHRyZWFkb25seSBzZXNzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdGF0dXM/OiBzdHJpbmc7XG5cdC8qKiBIdW1hbi1yZWFkYWJsZSBkZXNjcmlwdGlvbiBvZiB3aGF0IHRoZSBzZXNzaW9uIGlzIGN1cnJlbnRseSBkb2luZy4gKi9cblx0cmVhZG9ubHkgYWN0aXZpdHk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmc7XG5cdC8qKiBEaXNwbGF5IG5hbWUgb2YgdGhlIHNlc3Npb24ncyBwcm9qZWN0L3dvcmtzcGFjZS4gKi9cblx0cmVhZG9ubHkgcHJvamVjdD86IHN0cmluZztcblx0LyoqIGB0cnVlYCB3aGVuIHRoZSBzZXNzaW9uIGhhcyB1cGRhdGVzIHRoZSB1c2VyIGhhcyBub3QgeWV0IHNlZW4uICovXG5cdHJlYWRvbmx5IHVucmVhZD86IGJvb2xlYW47XG5cdC8qKiBJU08tODYwMSB0aW1lc3RhbXAgb2Ygd2hlbiB0aGUgc2Vzc2lvbiB3YXMgY3JlYXRlZC4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZEF0Pzogc3RyaW5nO1xuXHQvKiogSVNPLTg2MDEgdGltZXN0YW1wIG9mIHRoZSBzZXNzaW9uJ3MgbGFzdCBhY3Rpdml0eS4gKi9cblx0cmVhZG9ubHkgbW9kaWZpZWRBdD86IHN0cmluZztcblx0cmVhZG9ubHkgY2hhbmdlcz86IElBZ2VudFNlc3Npb25NZXRhZGF0YVsnY2hhbmdlcyddO1xuXHRyZWFkb25seSBjaGFuZ2VzZXRzPzogcmVhZG9ubHkge1xuXHRcdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgY2hhbmdlS2luZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHVyaVRlbXBsYXRlOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdH1bXTtcblx0cmVhZG9ubHkgZ2l0PzogSVNlcmlhbGl6ZWRHaXRTdGF0ZTtcblx0cmVhZG9ubHkgZ2l0aHViPzogSVNlcmlhbGl6ZWRHaXRIdWJTdGF0ZTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVxdWlyZWRTdHJpbmcodmFsdWU6IHVua25vd24sIGZpZWxkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyB8fCB2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHt0b29sTmFtZX0gaW5wdXQ6ICR7ZmllbGR9IG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLmApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZ2V0T3B0aW9uYWxTdHJpbmcodmFsdWU6IHVua25vd24sIGZpZWxkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgdmFsdWUubGVuZ3RoID09PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7dG9vbE5hbWV9IGlucHV0OiAke2ZpZWxkfSBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy5gKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHBhcnNlV29ya3NwYWNlVXJpKHdvcmtzcGFjZTogc3RyaW5nKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0Ly8gQWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIChQT1NJWCBgL1x1MjAyNmAgb3IgV2luZG93cyBgQzpcXFx1MjAyNmAgLyBgXFxcXHNoYXJlYCkuXG5cdGlmICgvXihcXC98W2EtekEtWl06W1xcXFwvXXxcXFxcXFxcXCkvLnRlc3Qod29ya3NwYWNlKSkge1xuXHRcdHJldHVybiBVUkkuZmlsZSh3b3Jrc3BhY2UpO1xuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKHdvcmtzcGFjZSwgdHJ1ZSk7XG5cdFx0cmV0dXJuIHBhcnNlZC5zY2hlbWUgPyBwYXJzZWQgOiB1bmRlZmluZWQ7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVdvcmtzcGFjZSh3b3Jrc3BhY2U6IHN0cmluZywgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdKTogVVJJIHtcblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcz8uZmluZChkID0+IGQudG9TdHJpbmcoKSA9PT0gd29ya3NwYWNlIHx8IGQuZnNQYXRoID09PSB3b3Jrc3BhY2UpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0cmV0dXJuIG1hdGNoO1xuXHRcdH1cblx0fVxuXHRjb25zdCBwYXJzZWQgPSBwYXJzZVdvcmtzcGFjZVVyaSh3b3Jrc3BhY2UpO1xuXHRpZiAoIXBhcnNlZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9ufSBpbnB1dDogd29ya3NwYWNlIG11c3QgbWF0Y2ggYSBrbm93biBzZXNzaW9uIHdvcmtpbmdEaXJlY3RvcnksIGFuIGFic29sdXRlIHBhdGgsIG9yIGEgdmFsaWQgVVJJIHN0cmluZy5gKTtcblx0fVxuXHRyZXR1cm4gcGFyc2VkO1xufVxuXG5mdW5jdGlvbiByZXNvbHZlTW9kZWwobW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1vZGVsczogcmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10pOiBJQWdlbnRNb2RlbEluZm8gfCB1bmRlZmluZWQge1xuXHRpZiAobW9kZWxOYW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG1vZGVsID0gbW9kZWxzLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gbW9kZWxOYW1lIHx8IGNhbmRpZGF0ZS5uYW1lID09PSBtb2RlbE5hbWUpO1xuXHRpZiAoIW1vZGVsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb259IGlucHV0OiBtb2RlbCBtdXN0IG1hdGNoIGFuIGF2YWlsYWJsZSBtb2RlbCBpZCBvciBuYW1lLmApO1xuXHR9XG5cdHJldHVybiBtb2RlbDtcbn1cblxuLyoqIFZhbGlkYXRlcyBhbmQgcmVzb2x2ZXMgY3JlYXRlLXNlc3Npb24gYXJndW1lbnRzIGFnYWluc3QgY3VycmVudCBzZXNzaW9ucyBhbmQgbW9kZWxzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENyZWF0ZVNlc3Npb25BcmdzKHJhd0FyZ3M6IHVua25vd24sIHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSwgbW9kZWxzOiByZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXSk6IElSZXNvbHZlZENyZWF0ZVNlc3Npb25BcmdzIHtcblx0Y29uc3QgYXJncyA9IChyYXdBcmdzID8/IHt9KSBhcyBJQ3JlYXRlU2Vzc2lvbkFyZ3M7XG5cdGNvbnN0IHdvcmtzcGFjZSA9IGdldFJlcXVpcmVkU3RyaW5nKGFyZ3Mud29ya3NwYWNlLCAnd29ya3NwYWNlJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24pO1xuXHRjb25zdCBwcm9tcHQgPSBnZXRSZXF1aXJlZFN0cmluZyhhcmdzLnByb21wdCwgJ3Byb21wdCcsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uKTtcblx0Y29uc3QgbW9kZWxOYW1lID0gZ2V0T3B0aW9uYWxTdHJpbmcoYXJncy5tb2RlbCwgJ21vZGVsJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24pO1xuXHRyZXR1cm4ge1xuXHRcdHdvcmtzcGFjZTogcmVzb2x2ZVdvcmtzcGFjZSh3b3Jrc3BhY2UsIHNlc3Npb25zKSxcblx0XHRwcm9tcHQsXG5cdFx0bW9kZWw6IHJlc29sdmVNb2RlbChtb2RlbE5hbWUsIG1vZGVscyksXG5cdH07XG59XG5cbi8qKiBEZWNvZGVzIHRoZSB7QGxpbmsgU2Vzc2lvblN0YXR1c30gYml0LWZsYWdzIGludG8gcmVhZGFibGUgbmFtZXMgZm9yIHRoZSBhZ2VudC4gKi9cbmZ1bmN0aW9uIGRlc2NyaWJlU2Vzc2lvblN0YXR1c0JpdHMoc3RhdHVzOiBTZXNzaW9uU3RhdHVzKTogc3RyaW5nW10ge1xuXHRjb25zdCBuYW1lczogc3RyaW5nW10gPSBbXTtcblx0Ly8gYElucHV0TmVlZGVkYCBpcyBhIHN1cGVyc2V0IG9mIHRoZSBgSW5Qcm9ncmVzc2AgYml0LCBzbyBpdCBtdXN0IGJlIG1hdGNoZWRcblx0Ly8gd2l0aCBhbiBleGFjdC1iaXRzIGNoZWNrIGJlZm9yZSBmYWxsaW5nIGJhY2sgdG8gcGxhaW4gYEluUHJvZ3Jlc3NgLlxuXHRpZiAoKHN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpID09PSBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkKSB7XG5cdFx0bmFtZXMucHVzaCgnaW5wdXROZWVkZWQnKTtcblx0fSBlbHNlIGlmIChzdGF0dXMgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpIHtcblx0XHRuYW1lcy5wdXNoKCdpblByb2dyZXNzJyk7XG5cdH0gZWxzZSBpZiAoc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5JZGxlKSB7XG5cdFx0bmFtZXMucHVzaCgnaWRsZScpO1xuXHR9XG5cdGlmIChzdGF0dXMgJiBTZXNzaW9uU3RhdHVzLkVycm9yKSB7XG5cdFx0bmFtZXMucHVzaCgnZXJyb3InKTtcblx0fVxuXHRpZiAoc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkKSB7XG5cdFx0bmFtZXMucHVzaCgnYXJjaGl2ZWQnKTtcblx0fVxuXHRyZXR1cm4gbmFtZXM7XG59XG5cbi8qKlxuICogRGVjb2RlcyBhIHNlc3Npb24ncyBzdGF0dXMgaW50byByZWFkYWJsZSBuYW1lcywgdXNlZCBieSBib3RoIGZpbHRlcmluZyBhbmRcbiAqIHNlcmlhbGl6YXRpb24gc28gdGhleSBhZ3JlZSBvbiB3aGljaCBzZXNzaW9ucyBhcmUgY29uc2lkZXJlZCBgYXJjaGl2ZWRgLlxuICovXG5mdW5jdGlvbiBkZXNjcmliZVNlc3Npb25TdGF0dXNOYW1lcyhzZXNzaW9uOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBzdHJpbmdbXSB7XG5cdHJldHVybiBzZXNzaW9uLnN0YXR1cyAhPT0gdW5kZWZpbmVkID8gZGVzY3JpYmVTZXNzaW9uU3RhdHVzQml0cyhzZXNzaW9uLnN0YXR1cykgOiBbXTtcbn1cblxuLyoqIFJlbmRlcnMgYSBzZXNzaW9uJ3Mgc3RhdHVzIG5hbWVzIGFzIHRoZSBjb21wYWN0IHN0cmluZyB1c2VkIGluIHRvb2wgcmVzdWx0cy4gKi9cbmZ1bmN0aW9uIGRlc2NyaWJlU2Vzc2lvblN0YXR1cyhzZXNzaW9uOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBuYW1lcyA9IGRlc2NyaWJlU2Vzc2lvblN0YXR1c05hbWVzKHNlc3Npb24pO1xuXHRpZiAobmFtZXMubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiBuYW1lcy5qb2luKCcsJyk7XG5cdH1cblx0cmV0dXJuIHNlc3Npb24uc3RhdHVzICE9PSB1bmRlZmluZWQgPyAndW5rbm93bicgOiB1bmRlZmluZWQ7XG59XG5cblxuLyoqIEZpbHRlcnMgYWNjZXB0ZWQgYnkgYGxpc3Rfc2Vzc2lvbnNgIHRvIG5hcnJvdyB0aGUgcmV0dXJuZWQgc2V0LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTGlzdFNlc3Npb25zQXJncyB7XG5cdC8qKiBEaXJlY3QgbG9va3VwOiByZXR1cm4gb25seSB0aGUgc2Vzc2lvbiB3aXRoIHRoaXMgVVJJIC8gb3BlbiBsaW5rLCBpZ25vcmluZyBhbGwgb3RoZXIgZmlsdGVycy4gKi9cblx0cmVhZG9ubHkgc2Vzc2lvbj86IHN0cmluZztcblx0cmVhZG9ubHkgc3RhdHVzPzogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgd29ya3NwYWNlPzogc3RyaW5nO1xuXHRyZWFkb25seSB3aXRoQ2hhbmdlcz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVucmVhZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdpdGhQdWxsUmVxdWVzdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluY2x1ZGVBcmNoaXZlZD86IGJvb2xlYW47XG5cdC8qKiBMb3dlciBib3VuZCBvbiBzZXNzaW9uIGNyZWF0aW9uIHRpbWUsIGluIGVwb2NoIG1pbGxpc2Vjb25kcy4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZEFmdGVyPzogbnVtYmVyO1xuXHQvKiogVXBwZXIgYm91bmQgb24gc2Vzc2lvbiBjcmVhdGlvbiB0aW1lLCBpbiBlcG9jaCBtaWxsaXNlY29uZHMuICovXG5cdHJlYWRvbmx5IGNyZWF0ZWRCZWZvcmU/OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGdldE9wdGlvbmFsQm9vbGVhbih2YWx1ZTogdW5rbm93biwgZmllbGQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7dG9vbE5hbWV9IGlucHV0OiAke2ZpZWxkfSBtdXN0IGJlIGEgYm9vbGVhbi5gKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIGdldE9wdGlvbmFsVGltZXN0YW1wKHZhbHVlOiB1bmtub3duLCBmaWVsZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7dG9vbE5hbWV9IGlucHV0OiAke2ZpZWxkfSBtdXN0IGJlIGFuIElTTy04NjAxIHRpbWVzdGFtcCBzdHJpbmcuYCk7XG5cdH1cblx0Y29uc3QgcGFyc2VkID0gRGF0ZS5wYXJzZSh2YWx1ZSk7XG5cdGlmIChOdW1iZXIuaXNOYU4ocGFyc2VkKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke3Rvb2xOYW1lfSBpbnB1dDogJHtmaWVsZH0gbXVzdCBiZSBhIHZhbGlkIElTTy04NjAxIHRpbWVzdGFtcCAoZS5nLiAyMDI1LTAxLTMxVDAwOjAwOjAwWikuYCk7XG5cdH1cblx0cmV0dXJuIHBhcnNlZDtcbn1cblxuLyoqIFZhbGlkYXRlcyBhbmQgbm9ybWFsaXplcyB0aGUgb3B0aW9uYWwgYGxpc3Rfc2Vzc2lvbnNgIGZpbHRlciBhcmd1bWVudHMuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGlzdFNlc3Npb25zQXJncyhyYXdBcmdzOiB1bmtub3duKTogSUxpc3RTZXNzaW9uc0FyZ3Mge1xuXHRjb25zdCBhcmdzID0gKHJhd0FyZ3MgPz8ge30pIGFzIHsgc2Vzc2lvbj86IHVua25vd247IHN0YXR1cz86IHVua25vd247IHdvcmtzcGFjZT86IHVua25vd247IHdpdGhDaGFuZ2VzPzogdW5rbm93bjsgdW5yZWFkPzogdW5rbm93bjsgd2l0aFB1bGxSZXF1ZXN0PzogdW5rbm93bjsgaW5jbHVkZUFyY2hpdmVkPzogdW5rbm93bjsgY3JlYXRlZEFmdGVyPzogdW5rbm93bjsgY3JlYXRlZEJlZm9yZT86IHVua25vd24gfTtcblxuXHRsZXQgc3RhdHVzOiBTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0aWYgKGFyZ3Muc3RhdHVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXJncy5zdGF0dXMpIHx8IGFyZ3Muc3RhdHVzLnNvbWUodmFsdWUgPT4gdHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnN9IGlucHV0OiBzdGF0dXMgbXVzdCBiZSBhbiBhcnJheSBvZiBzdGF0dXMgbmFtZXMuYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGludmFsaWQgPSAoYXJncy5zdGF0dXMgYXMgc3RyaW5nW10pLmZpbHRlcih2YWx1ZSA9PiAhKGxpc3RTZXNzaW9uc1N0YXR1c1ZhbHVlcyBhcyByZWFkb25seSBzdHJpbmdbXSkuaW5jbHVkZXModmFsdWUpKTtcblx0XHRpZiAoaW52YWxpZC5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zfSBpbnB1dDogdW5rbm93biBzdGF0dXMgdmFsdWUocykgJHtpbnZhbGlkLmpvaW4oJywgJyl9LiBWYWxpZCB2YWx1ZXM6ICR7bGlzdFNlc3Npb25zU3RhdHVzVmFsdWVzLmpvaW4oJywgJyl9LmApO1xuXHRcdH1cblx0XHRzdGF0dXMgPSBuZXcgU2V0KGFyZ3Muc3RhdHVzIGFzIHN0cmluZ1tdKTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0c2Vzc2lvbjogZ2V0T3B0aW9uYWxTdHJpbmcoYXJncy5zZXNzaW9uLCAnc2Vzc2lvbicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMpLFxuXHRcdHN0YXR1cyxcblx0XHR3b3Jrc3BhY2U6IGdldE9wdGlvbmFsU3RyaW5nKGFyZ3Mud29ya3NwYWNlLCAnd29ya3NwYWNlJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyksXG5cdFx0d2l0aENoYW5nZXM6IGdldE9wdGlvbmFsQm9vbGVhbihhcmdzLndpdGhDaGFuZ2VzLCAnd2l0aENoYW5nZXMnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zKSxcblx0XHR1bnJlYWQ6IGdldE9wdGlvbmFsQm9vbGVhbihhcmdzLnVucmVhZCwgJ3VucmVhZCcsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMpLFxuXHRcdHdpdGhQdWxsUmVxdWVzdDogZ2V0T3B0aW9uYWxCb29sZWFuKGFyZ3Mud2l0aFB1bGxSZXF1ZXN0LCAnd2l0aFB1bGxSZXF1ZXN0JywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyksXG5cdFx0aW5jbHVkZUFyY2hpdmVkOiBnZXRPcHRpb25hbEJvb2xlYW4oYXJncy5pbmNsdWRlQXJjaGl2ZWQsICdpbmNsdWRlQXJjaGl2ZWQnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zKSxcblx0XHRjcmVhdGVkQWZ0ZXI6IGdldE9wdGlvbmFsVGltZXN0YW1wKGFyZ3MuY3JlYXRlZEFmdGVyLCAnY3JlYXRlZEFmdGVyJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkxpc3RTZXNzaW9ucyksXG5cdFx0Y3JlYXRlZEJlZm9yZTogZ2V0T3B0aW9uYWxUaW1lc3RhbXAoYXJncy5jcmVhdGVkQmVmb3JlLCAnY3JlYXRlZEJlZm9yZScsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnMpLFxuXHR9O1xufVxuXG4vKiogV2hldGhlciBhIHNlc3Npb24gaGFzIGFueSBwZW5kaW5nIHdvcmt0cmVlIGNoYW5nZXMgKGluc2VydGlvbnMsIGRlbGV0aW9ucywgb3IgY2hhbmdlZCBmaWxlcykuICovXG5mdW5jdGlvbiBzZXNzaW9uSGFzQ2hhbmdlcyhzZXNzaW9uOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBib29sZWFuIHtcblx0Y29uc3QgY2hhbmdlcyA9IHNlc3Npb24uY2hhbmdlcztcblx0cmV0dXJuICEhY2hhbmdlcyAmJiAoKGNoYW5nZXMuZmlsZXMgPz8gMCkgPiAwIHx8IChjaGFuZ2VzLmFkZGl0aW9ucyA/PyAwKSA+IDAgfHwgKGNoYW5nZXMuZGVsZXRpb25zID8/IDApID4gMCk7XG59XG5cbmZ1bmN0aW9uIHNlc3Npb25Jc0FyY2hpdmVkKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNTZXNzaW9uU3RhdHVzQXJjaGl2ZWQoc2Vzc2lvbi5zdGF0dXMpO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgYSBzZXNzaW9uIGlzICprbm93biogdG8gYmUgdW5yZWFkLiBBIHNlc3Npb24gd2l0aCBubyBzdGF0dXMgaGFzIG5vXG4gKiByZWNvcmRlZCByZWFkIHN0YXRlIFx1MjAxNCBjb2xkIHNlc3Npb25zIGZyb20gYWdlbnRzIHRoYXQgZG9uJ3QgcHJvamVjdCBvbmUsIHN1Y2hcbiAqIGFzIENsYXVkZSBcdTIwMTQgYW5kIG11c3Qgbm90IGJlIHJlcG9ydGVkIGFzIHVucmVhZC5cbiAqL1xuZnVuY3Rpb24gc2Vzc2lvbklzVW5yZWFkKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2Vzc2lvbi5zdGF0dXMgIT09IHVuZGVmaW5lZCAmJiAhaXNTZXNzaW9uU3RhdHVzUmVhZChzZXNzaW9uLnN0YXR1cyk7XG59XG5cbi8qKiBXaGV0aGVyIGFueSBvZiBhIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yaWVzIG1hdGNoZXMgdGhlIGdpdmVuIGZvbGRlciAoYWJzb2x1dGUgcGF0aCBvciBVUkkpLiAqL1xuZnVuY3Rpb24gc2Vzc2lvbk1hdGNoZXNXb3Jrc3BhY2Uoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbk1ldGFkYXRhLCB3b3Jrc3BhY2U6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBkaXJzID0gc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXM7XG5cdGlmICghZGlycyB8fCBkaXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBwYXJzZWQgPSBwYXJzZVdvcmtzcGFjZVVyaSh3b3Jrc3BhY2UpO1xuXHQvLyBBbnktcm9vdCBtZW1iZXJzaGlwOiBhIHNlc3Npb24gbWF0Y2hlcyB3aGVuIHRoZSBmb2xkZXIgaXMgYW55IG9mIGl0c1xuXHQvLyB3b3JraW5nIGRpcmVjdG9yaWVzLCBub3Qgb25seSB0aGUgcHJpbWFyeS5cblx0cmV0dXJuIGRpcnMuc29tZShkaXIgPT5cblx0XHRkaXIudG9TdHJpbmcoKSA9PT0gd29ya3NwYWNlXG5cdFx0fHwgZGlyLmZzUGF0aCA9PT0gd29ya3NwYWNlXG5cdFx0fHwgKCEhcGFyc2VkICYmIHBhcnNlZC50b1N0cmluZygpID09PSBkaXIudG9TdHJpbmcoKSkpO1xufVxuXG4vKiogQXBwbGllcyB0aGUge0BsaW5rIElMaXN0U2Vzc2lvbnNBcmdzfSBmaWx0ZXJzIHRvIGEgc2V0IG9mIHNlc3Npb25zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbHRlclNlc3Npb25zKHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSwgYXJnczogSUxpc3RTZXNzaW9uc0FyZ3MpOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSB7XG5cdC8vIEEgZGlyZWN0IGBzZXNzaW9uYCBsb29rdXAgcmV0dXJucyBqdXN0IHRoYXQgc2Vzc2lvbiwgYnlwYXNzaW5nIHRoZSBvdGhlclxuXHQvLyBmaWx0ZXJzIChpbmNsdWRpbmcgdGhlIGRlZmF1bHQgYXJjaGl2ZWQgZXhjbHVzaW9uKS5cblx0aWYgKGFyZ3Muc2Vzc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcGFyc2VPcGVuU2Vzc2lvbkxpbmtVcmkoYXJncy5zZXNzaW9uKT8udG9TdHJpbmcoKSA/PyBhcmdzLnNlc3Npb247XG5cdFx0cmV0dXJuIHNlc3Npb25zLmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24uc2Vzc2lvbi50b1N0cmluZygpID09PSB0YXJnZXQpO1xuXHR9XG5cdHJldHVybiBzZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiB7XG5cdFx0aWYgKGFyZ3Muc3RhdHVzKSB7XG5cdFx0XHRjb25zdCBuYW1lcyA9IGRlc2NyaWJlU2Vzc2lvblN0YXR1c05hbWVzKHNlc3Npb24pO1xuXHRcdFx0aWYgKCFuYW1lcy5zb21lKG5hbWUgPT4gYXJncy5zdGF0dXMhLmhhcyhuYW1lKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYXJncy53b3Jrc3BhY2UgIT09IHVuZGVmaW5lZCAmJiAhc2Vzc2lvbk1hdGNoZXNXb3Jrc3BhY2Uoc2Vzc2lvbiwgYXJncy53b3Jrc3BhY2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChhcmdzLndpdGhDaGFuZ2VzICYmICFzZXNzaW9uSGFzQ2hhbmdlcyhzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoYXJncy51bnJlYWQgJiYgIXNlc3Npb25Jc1VucmVhZChzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoYXJncy53aXRoUHVsbFJlcXVlc3QgJiYgIXJlYWRTZXNzaW9uR2l0SHViU3RhdGUoc2Vzc2lvbi5fbWV0YSk/LnB1bGxSZXF1ZXN0VXJsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIEFyY2hpdmVkIHNlc3Npb25zIGFyZSBoaWRkZW4gdW5sZXNzIGV4cGxpY2l0bHkgcmVxdWVzdGVkLCBlaXRoZXIgdmlhXG5cdFx0Ly8gYGluY2x1ZGVBcmNoaXZlZGAgb3IgYnkgYXNraW5nIGZvciB0aGUgYGFyY2hpdmVkYCBzdGF0dXMgZGlyZWN0bHkuXG5cdFx0aWYgKGFyZ3MuaW5jbHVkZUFyY2hpdmVkICE9PSB0cnVlICYmICFhcmdzLnN0YXR1cz8uaGFzKCdhcmNoaXZlZCcpICYmIHNlc3Npb25Jc0FyY2hpdmVkKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChhcmdzLmNyZWF0ZWRBZnRlciAhPT0gdW5kZWZpbmVkICYmIHNlc3Npb24uc3RhcnRUaW1lIDwgYXJncy5jcmVhdGVkQWZ0ZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGFyZ3MuY3JlYXRlZEJlZm9yZSAhPT0gdW5kZWZpbmVkICYmIHNlc3Npb24uc3RhcnRUaW1lID4gYXJncy5jcmVhdGVkQmVmb3JlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplR2l0U3RhdGUoc2Vzc2lvbjogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogSVNlcmlhbGl6ZWRHaXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGdpdCA9IHJlYWRTZXNzaW9uR2l0U3RhdGUoc2Vzc2lvbi5fbWV0YSk7XG5cdGlmICghZ2l0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZXN1bHQ6IE11dGFibGU8SVNlcmlhbGl6ZWRHaXRTdGF0ZT4gPSB7fTtcblx0aWYgKGdpdC5icmFuY2hOYW1lICE9PSB1bmRlZmluZWQpIHsgcmVzdWx0LmJyYW5jaCA9IGdpdC5icmFuY2hOYW1lOyB9XG5cdGlmIChnaXQuYmFzZUJyYW5jaE5hbWUgIT09IHVuZGVmaW5lZCkgeyByZXN1bHQuYmFzZUJyYW5jaCA9IGdpdC5iYXNlQnJhbmNoTmFtZTsgfVxuXHRpZiAoZ2l0LnVwc3RyZWFtQnJhbmNoTmFtZSAhPT0gdW5kZWZpbmVkKSB7IHJlc3VsdC51cHN0cmVhbUJyYW5jaCA9IGdpdC51cHN0cmVhbUJyYW5jaE5hbWU7IH1cblx0aWYgKGdpdC5vdXRnb2luZ0NoYW5nZXMgIT09IHVuZGVmaW5lZCkgeyByZXN1bHQuYWhlYWQgPSBnaXQub3V0Z29pbmdDaGFuZ2VzOyB9XG5cdGlmIChnaXQuaW5jb21pbmdDaGFuZ2VzICE9PSB1bmRlZmluZWQpIHsgcmVzdWx0LmJlaGluZCA9IGdpdC5pbmNvbWluZ0NoYW5nZXM7IH1cblx0aWYgKGdpdC51bmNvbW1pdHRlZENoYW5nZXMgIT09IHVuZGVmaW5lZCkgeyByZXN1bHQudW5jb21taXR0ZWRDaGFuZ2VzID0gZ2l0LnVuY29tbWl0dGVkQ2hhbmdlczsgfVxuXHRyZXR1cm4gT2JqZWN0LmtleXMocmVzdWx0KS5sZW5ndGggPiAwID8gcmVzdWx0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVHaXRIdWJTdGF0ZShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEpOiBJU2VyaWFsaXplZEdpdEh1YlN0YXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZ2l0aHViID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShzZXNzaW9uLl9tZXRhKTtcblx0aWYgKCFnaXRodWIpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogTXV0YWJsZTxJU2VyaWFsaXplZEdpdEh1YlN0YXRlPiA9IHt9O1xuXHRpZiAoZ2l0aHViLm93bmVyICE9PSB1bmRlZmluZWQpIHsgcmVzdWx0Lm93bmVyID0gZ2l0aHViLm93bmVyOyB9XG5cdGlmIChnaXRodWIucmVwbyAhPT0gdW5kZWZpbmVkKSB7IHJlc3VsdC5yZXBvID0gZ2l0aHViLnJlcG87IH1cblx0aWYgKGdpdGh1Yi5wdWxsUmVxdWVzdFVybCAhPT0gdW5kZWZpbmVkKSB7IHJlc3VsdC5wdWxsUmVxdWVzdFVybCA9IGdpdGh1Yi5wdWxsUmVxdWVzdFVybDsgfVxuXHRyZXR1cm4gT2JqZWN0LmtleXMocmVzdWx0KS5sZW5ndGggPiAwID8gcmVzdWx0IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVTZXNzaW9uKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IElTZXJpYWxpemVkU2Vzc2lvbiB7XG5cdGNvbnN0IGdpdCA9IHNlcmlhbGl6ZUdpdFN0YXRlKHNlc3Npb24pO1xuXHRjb25zdCBnaXRodWIgPSBzZXJpYWxpemVHaXRIdWJTdGF0ZShzZXNzaW9uKTtcblx0Y29uc3Qgc3RhdHVzID0gZGVzY3JpYmVTZXNzaW9uU3RhdHVzKHNlc3Npb24pO1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb246IHNlc3Npb24uc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdC4uLihzZXNzaW9uLnN1bW1hcnkgIT09IHVuZGVmaW5lZCA/IHsgdGl0bGU6IHNlc3Npb24uc3VtbWFyeSB9IDoge30pLFxuXHRcdC4uLihzdGF0dXMgIT09IHVuZGVmaW5lZCA/IHsgc3RhdHVzIH0gOiB7fSksXG5cdFx0Li4uKHNlc3Npb24uYWN0aXZpdHkgIT09IHVuZGVmaW5lZCA/IHsgYWN0aXZpdHk6IHNlc3Npb24uYWN0aXZpdHkgfSA6IHt9KSxcblx0XHQuLi4oc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXM/LlswXSAhPT0gdW5kZWZpbmVkID8geyB3b3JraW5nRGlyZWN0b3J5OiBzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllc1swXS50b1N0cmluZygpIH0gOiB7fSksXG5cdFx0Li4uKHNlc3Npb24ucHJvamVjdCAhPT0gdW5kZWZpbmVkID8geyBwcm9qZWN0OiBzZXNzaW9uLnByb2plY3QuZGlzcGxheU5hbWUgfSA6IHt9KSxcblx0XHQuLi4oc2Vzc2lvbklzVW5yZWFkKHNlc3Npb24pID8geyB1bnJlYWQ6IHRydWUgfSA6IHt9KSxcblx0XHQuLi4oc2Vzc2lvbi5zdGFydFRpbWUgPiAwID8geyBjcmVhdGVkQXQ6IG5ldyBEYXRlKHNlc3Npb24uc3RhcnRUaW1lKS50b0lTT1N0cmluZygpIH0gOiB7fSksXG5cdFx0Li4uKHNlc3Npb24ubW9kaWZpZWRUaW1lID4gMCA/IHsgbW9kaWZpZWRBdDogbmV3IERhdGUoc2Vzc2lvbi5tb2RpZmllZFRpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHQuLi4oc2Vzc2lvbi5jaGFuZ2VzICE9PSB1bmRlZmluZWQgPyB7IGNoYW5nZXM6IHNlc3Npb24uY2hhbmdlcyB9IDoge30pLFxuXHRcdC4uLihzZXNzaW9uLmNoYW5nZXNldHMgIT09IHVuZGVmaW5lZCA/IHtcblx0XHRcdGNoYW5nZXNldHM6IHNlc3Npb24uY2hhbmdlc2V0cy5tYXAoY2hhbmdlc2V0ID0+ICh7XG5cdFx0XHRcdGxhYmVsOiBjaGFuZ2VzZXQubGFiZWwsXG5cdFx0XHRcdGNoYW5nZUtpbmQ6IGNoYW5nZXNldC5jaGFuZ2VLaW5kLFxuXHRcdFx0XHR1cmlUZW1wbGF0ZTogY2hhbmdlc2V0LnVyaVRlbXBsYXRlLFxuXHRcdFx0XHQuLi4oY2hhbmdlc2V0LmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQgPyB7IGRlc2NyaXB0aW9uOiBjaGFuZ2VzZXQuZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0XHRcdH0pKSxcblx0XHR9IDoge30pLFxuXHRcdC4uLihnaXQgIT09IHVuZGVmaW5lZCA/IHsgZ2l0IH0gOiB7fSksXG5cdFx0Li4uKGdpdGh1YiAhPT0gdW5kZWZpbmVkID8geyBnaXRodWIgfSA6IHt9KSxcblx0fTtcbn1cblxuLyoqIFNlcmlhbGl6ZXMgc2Vzc2lvbiBtZXRhZGF0YSBpbnRvIHRoZSBjb21wYWN0IHRvb2wtcmVzdWx0IEpTT04gcGF5bG9hZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVTZXNzaW9ucyhzZXNzaW9uczogcmVhZG9ubHkgSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10pOiBzdHJpbmcge1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyBzZXNzaW9uczogc2Vzc2lvbnMubWFwKHNlcmlhbGl6ZVNlc3Npb24pIH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDcmVhdGVTZXNzaW9uUmVzdWx0IHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSBjaGF0OiBzdHJpbmc7XG5cdC8qKiBDbGlja2FibGUge0BsaW5rIEFHRU5UX0hPU1RfU0VTU0lPTl9MSU5LX1NDSEVNRX0gVVJJIHRoYXQgb3BlbnMgdGhlIHNlc3Npb24gaW4gdGhlIEFnZW50cyB3aW5kb3cuICovXG5cdHJlYWRvbmx5IG9wZW5MaW5rOiBzdHJpbmc7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIHNlc3Npb24sIHNlbmRzIGl0cyBpbml0aWFsIHByb21wdCwgYW5kIHJldHVybnMgdGhlIGNyZWF0ZWQgY2hhbm5lbHMuXG4gKiBFbmZvcmNlcyB0aGUge0BsaW5rIG1heFNlc3Npb25TcGF3bkRlcHRoIHJlY3Vyc2lvbiBsaW1pdH0gYWdhaW5zdFxuICoge0BsaW5rIGN1cnJlbnRTZXNzaW9ufSAodGhlIHNlc3Npb24gdGhlIHRvb2wgcnVucyBpbikgYW5kIHN0YW1wcyB0aGUgbmV3XG4gKiBzZXNzaW9uIG9uZSBsZXZlbCBkZWVwZXIgc28gaXRzIG93biBgY3JlYXRlX3Nlc3Npb25gIGNhbGxzIGFyZSBib3VuZGVkIHRvby5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5Q3JlYXRlU2Vzc2lvblRvb2woYWNjZXNzb3I6IElTZXNzaW9uU2VydmVyVG9vbEFjY2Vzc29yLCByYXdBcmdzOiB1bmtub3duLCBjdXJyZW50U2Vzc2lvbj86IFVSSSk6IFByb21pc2U8SUNyZWF0ZVNlc3Npb25SZXN1bHQ+IHtcblx0Y29uc3QgcGFyZW50RGVwdGggPSBjdXJyZW50U2Vzc2lvbiA/IGFjY2Vzc29yLmdldFNlc3Npb25TcGF3bkRlcHRoKGN1cnJlbnRTZXNzaW9uKSA6IDA7XG5cdGlmIChwYXJlbnREZXB0aCA+PSBtYXhTZXNzaW9uU3Bhd25EZXB0aCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgUmVmdXNpbmcgdG8gY3JlYXRlIGEgc2Vzc2lvbjogcmVjdXJzaW9uIGxpbWl0IHJlYWNoZWQgKG1heCBzcGF3biBkZXB0aCAke21heFNlc3Npb25TcGF3bkRlcHRofSkuIFRoaXMgc2Vzc2lvbiB3YXMgaXRzZWxmIGNyZWF0ZWQgJHtwYXJlbnREZXB0aH0gbGV2ZWwocykgZGVlcC5gKTtcblx0fVxuXHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IGFjY2Vzc29yLmxpc3RTZXNzaW9ucygpO1xuXHRjb25zdCBhcmdzID0gZ2V0Q3JlYXRlU2Vzc2lvbkFyZ3MocmF3QXJncywgc2Vzc2lvbnMsIGFjY2Vzc29yLmdldE1vZGVscygpKTtcblx0Y29uc3QgY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnID0ge1xuXHRcdHdvcmtpbmdEaXJlY3RvcmllczogYXJncy53b3Jrc3BhY2UgPyBbYXJncy53b3Jrc3BhY2VdIDogdW5kZWZpbmVkLFxuXHRcdC4uLihhcmdzLm1vZGVsICE9PSB1bmRlZmluZWQgPyB7IHByb3ZpZGVyOiBhcmdzLm1vZGVsLnByb3ZpZGVyLCBtb2RlbDogeyBpZDogYXJncy5tb2RlbC5pZCB9IH0gOiB7fSksXG5cdH07XG5cdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBhY2Nlc3Nvci5jcmVhdGVTZXNzaW9uKGNvbmZpZyk7XG5cdGFjY2Vzc29yLnNldFNlc3Npb25TcGF3bkRlcHRoKHNlc3Npb24sIHBhcmVudERlcHRoICsgMSk7XG5cdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdGF3YWl0IGFjY2Vzc29yLnN0YXJ0UHJvbXB0KHNlc3Npb24sIGNoYXQsIGFyZ3MucHJvbXB0KTtcblx0cmV0dXJuIHsgc2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0OiBjaGF0LnRvU3RyaW5nKCksIG9wZW5MaW5rOiBidWlsZE9wZW5TZXNzaW9uTGlua1VyaShzZXNzaW9uKSB9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgbW9kZWwtZmFjaW5nIGBjcmVhdGVfc2Vzc2lvbmAgcmVzdWx0LiBLZWVwcyB0aGUgbWFjaGluZS1yZWFkYWJsZVxuICogYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2AgbGluayAocGFyc2VkIGNsaWVudC1zaWRlIHRvIHJlbmRlciB0aGUgZGV0ZXJtaW5pc3RpY1xuICogXCJTZXNzaW9uIENyZWF0ZWRcIiBjb25maXJtYXRpb24gKyBidXR0b24pIGJ1dCBvbWl0cyB0aGUgcmF3IGJhY2tlbmQgc2Vzc2lvblxuICogVVJJIHNvIHRoZSBtb2RlbCBoYXMgbm90aGluZyB1Z2x5IHRvIGVjaG8sIGFuZCB0ZWxscyBpdCB0byByZXBseSBicmllZmx5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Q3JlYXRlU2Vzc2lvblJlc3VsdChyZXN1bHQ6IElDcmVhdGVTZXNzaW9uUmVzdWx0KTogc3RyaW5nIHtcblx0cmV0dXJuIGBTZXNzaW9uIGNyZWF0ZWQgKCR7cmVzdWx0Lm9wZW5MaW5rfSkuIFJlcGx5IHdpdGggb25lIHNob3J0IHNlbnRlbmNlIGNvbmZpcm1pbmcgdGhlIHNlc3Npb24gd2FzIGNyZWF0ZWQ7IGRvIG5vdCBwcmludCB0aGUgVVJMIG9yIG1lbnRpb24gYSBidXR0b24uYDtcbn1cblxuaW50ZXJmYWNlIElDcmVhdGVDaGF0QXJncyB7XG5cdHJlYWRvbmx5IHNlc3Npb24/OiB1bmtub3duO1xuXHRyZWFkb25seSBwcm9tcHQ/OiB1bmtub3duO1xuXHRyZWFkb25seSB0aXRsZT86IHVua25vd247XG5cdHJlYWRvbmx5IG1vZGVsPzogdW5rbm93bjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3JlYXRlQ2hhdFJlc3VsdCB7XG5cdHJlYWRvbmx5IHNlc3Npb246IHN0cmluZztcblx0cmVhZG9ubHkgY2hhdDogc3RyaW5nO1xuXHQvKiogQ2xpY2thYmxlIHtAbGluayBBR0VOVF9IT1NUX1NFU1NJT05fTElOS19TQ0hFTUV9IFVSSSB0aGF0IG9wZW5zIHRoZSBjcmVhdGVkIGNoYXQuICovXG5cdHJlYWRvbmx5IG9wZW5MaW5rOiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYSBzZXNzaW9uIGlkZW50aWZpZXIgXHUyMDE0IGFjY2VwdGluZyBlaXRoZXIgYSBiYWNrZW5kIHNlc3Npb24gVVJJXG4gKiAoYGNvcGlsb3RjbGk6L1x1MjAyNmAgZnJvbSBgbGlzdF9zZXNzaW9uc2ApIG9yIGFuIGBhZ2VudC1ob3N0LXNlc3Npb246Ly9cdTIwMjZgIG9wZW5cbiAqIGxpbmsgKGFzIHJldHVybmVkIGJ5IGBjcmVhdGVfc2Vzc2lvbmAvYGdldF9jdXJyZW50X3Nlc3Npb25gKSBcdTIwMTQgYWdhaW5zdCB0aGVcbiAqIHNldCBvZiBrbm93biBzZXNzaW9ucy4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIGl0IG1hdGNoZXMgbm8ga25vd24gc2Vzc2lvbi5cbiAqL1xuZnVuY3Rpb24gcmVzb2x2ZUtub3duU2Vzc2lvbihzZXNzaW9uSW5wdXQ6IHN0cmluZywgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0Ly8gTm9ybWFsaXplIGFuIG9wZW4tc2Vzc2lvbiBsaW5rIGJhY2sgdG8gaXRzIGJhY2tlbmQgc2Vzc2lvbiBVUkkuXG5cdGNvbnN0IGZyb21MaW5rID0gcGFyc2VPcGVuU2Vzc2lvbkxpbmtVcmkoc2Vzc2lvbklucHV0KTtcblx0Y29uc3QgY2FuZGlkYXRlID0gZnJvbUxpbms/LnRvU3RyaW5nKCkgPz8gc2Vzc2lvbklucHV0O1xuXHRjb25zdCBtYXRjaCA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnNlc3Npb24udG9TdHJpbmcoKSA9PT0gY2FuZGlkYXRlKTtcblx0cmV0dXJuIG1hdGNoPy5zZXNzaW9uO1xufVxuXG4vKiogUmVzb2x2ZXMgdGhlIHRhcmdldCBzZXNzaW9uIFVSSSBmb3IgYGNyZWF0ZV9jaGF0YCBhZ2FpbnN0IHRoZSBrbm93biBzZXNzaW9ucy4gKi9cbmZ1bmN0aW9uIHJlc29sdmVDaGF0U2Vzc2lvbihzZXNzaW9uSW5wdXQ6IHN0cmluZywgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdKTogVVJJIHtcblx0Y29uc3Qgc2Vzc2lvbiA9IHJlc29sdmVLbm93blNlc3Npb24oc2Vzc2lvbklucHV0LCBzZXNzaW9ucyk7XG5cdGlmICghc2Vzc2lvbikge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0fSBpbnB1dDogc2Vzc2lvbiBtdXN0IG1hdGNoIHRoZSBVUkkgb2YgYSBrbm93biBzZXNzaW9uIChzZWUgbGlzdF9zZXNzaW9ucykuYCk7XG5cdH1cblx0cmV0dXJuIHNlc3Npb247XG59XG5cbi8qKiBWYWxpZGF0ZXMgYW5kIHJlc29sdmVzIGNyZWF0ZS1jaGF0IGFyZ3VtZW50czsgZGVmYXVsdHMgdGhlIHNlc3Npb24gdG8ge0BsaW5rIGN1cnJlbnRTZXNzaW9ufSB3aGVuIG9taXR0ZWQuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3JlYXRlQ2hhdEFyZ3MocmF3QXJnczogdW5rbm93biwgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdLCBtb2RlbHM6IHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdLCBjdXJyZW50U2Vzc2lvbj86IFVSSSk6IHsgc2Vzc2lvbjogVVJJOyBwcm9tcHQ6IHN0cmluZzsgdGl0bGU/OiBzdHJpbmc7IG1vZGVsPzogSUFnZW50TW9kZWxJbmZvIH0ge1xuXHRjb25zdCBhcmdzID0gKHJhd0FyZ3MgPz8ge30pIGFzIElDcmVhdGVDaGF0QXJncztcblx0Y29uc3QgcHJvbXB0ID0gZ2V0UmVxdWlyZWRTdHJpbmcoYXJncy5wcm9tcHQsICdwcm9tcHQnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlQ2hhdCk7XG5cdGNvbnN0IHRpdGxlID0gZ2V0T3B0aW9uYWxTdHJpbmcoYXJncy50aXRsZSwgJ3RpdGxlJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQpO1xuXHRjb25zdCBtb2RlbE5hbWUgPSBnZXRPcHRpb25hbFN0cmluZyhhcmdzLm1vZGVsLCAnbW9kZWwnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlQ2hhdCk7XG5cdGNvbnN0IG1vZGVsID0gcmVzb2x2ZU1vZGVsKG1vZGVsTmFtZSwgbW9kZWxzKTtcblx0Y29uc3Qgc2Vzc2lvbklucHV0ID0gZ2V0T3B0aW9uYWxTdHJpbmcoYXJncy5zZXNzaW9uLCAnc2Vzc2lvbicsIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0KTtcblx0bGV0IHNlc3Npb246IFVSSTtcblx0aWYgKHNlc3Npb25JbnB1dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0c2Vzc2lvbiA9IHJlc29sdmVDaGF0U2Vzc2lvbihzZXNzaW9uSW5wdXQsIHNlc3Npb25zKTtcblx0fSBlbHNlIGlmIChjdXJyZW50U2Vzc2lvbikge1xuXHRcdHNlc3Npb24gPSBjdXJyZW50U2Vzc2lvbjtcblx0fSBlbHNlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlQ2hhdH0gaW5wdXQ6IG5vIHNlc3Npb24gcHJvdmlkZWQgYW5kIHRoZSBjdXJyZW50IHNlc3Npb24gY291bGQgbm90IGJlIGRldGVybWluZWQuYCk7XG5cdH1cblx0cmV0dXJuIHsgc2Vzc2lvbiwgcHJvbXB0LCAuLi4odGl0bGUgIT09IHVuZGVmaW5lZCA/IHsgdGl0bGUgfSA6IHt9KSwgLi4uKG1vZGVsICE9PSB1bmRlZmluZWQgPyB7IG1vZGVsIH0gOiB7fSkgfTtcbn1cblxuLyoqIEFkZHMgYSBjaGF0IHRvIGEgc2Vzc2lvbiwgc2VuZHMgaXRzIGluaXRpYWwgcHJvbXB0LCBhbmQgcmV0dXJucyB0aGUgY3JlYXRlZCBjaGFubmVscy4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhcHBseUNyZWF0ZUNoYXRUb29sKGFjY2Vzc29yOiBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciwgcmF3QXJnczogdW5rbm93biwgY3VycmVudFNlc3Npb24/OiBVUkkpOiBQcm9taXNlPElDcmVhdGVDaGF0UmVzdWx0PiB7XG5cdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYWNjZXNzb3IubGlzdFNlc3Npb25zKCk7XG5cdGNvbnN0IGFyZ3MgPSBnZXRDcmVhdGVDaGF0QXJncyhyYXdBcmdzLCBzZXNzaW9ucywgYWNjZXNzb3IuZ2V0TW9kZWxzKCksIGN1cnJlbnRTZXNzaW9uKTtcblx0Y29uc3QgY2hhdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKGFyZ3Muc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0SWQpKTtcblx0YXdhaXQgYWNjZXNzb3IuY3JlYXRlQ2hhdChhcmdzLnNlc3Npb24sIGNoYXQsIHsgdGl0bGU6IGFyZ3MudGl0bGUsIG1vZGVsOiBhcmdzLm1vZGVsIH0pO1xuXHRhd2FpdCBhY2Nlc3Nvci5zdGFydFByb21wdChhcmdzLnNlc3Npb24sIGNoYXQsIGFyZ3MucHJvbXB0KTtcblx0cmV0dXJuIHsgc2Vzc2lvbjogYXJncy5zZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQ6IGNoYXQudG9TdHJpbmcoKSwgb3Blbkxpbms6IGJ1aWxkT3BlblNlc3Npb25MaW5rVXJpKGFyZ3Muc2Vzc2lvbiwgY2hhdElkKSB9O1xufVxuXG4vKiogQnVpbGRzIHRoZSBtb2RlbC1mYWNpbmcgYGNyZWF0ZV9jaGF0YCByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Q3JlYXRlQ2hhdFJlc3VsdChyZXN1bHQ6IElDcmVhdGVDaGF0UmVzdWx0KTogc3RyaW5nIHtcblx0cmV0dXJuIGBDaGF0IGNyZWF0ZWQgKCR7cmVzdWx0Lm9wZW5MaW5rfSkuIFJlcGx5IHdpdGggb25lIHNob3J0IHNlbnRlbmNlIGNvbmZpcm1pbmcgdGhlIGNoYXQgd2FzIGNyZWF0ZWQ7IGRvIG5vdCBwcmludCB0aGUgVVJMIG9yIG1lbnRpb24gYSBidXR0b24uYDtcbn1cblxuaW50ZXJmYWNlIElTZW5kTWVzc2FnZUFyZ3Mge1xuXHRyZWFkb25seSBzZXNzaW9uPzogdW5rbm93bjtcblx0cmVhZG9ubHkgbWVzc2FnZT86IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkU2VuZE1lc3NhZ2VBcmdzIHtcblx0LyoqIFRoZSBvd25pbmcgYmFja2VuZCBzZXNzaW9uIFVSSSBvZiB0aGUgdGFyZ2V0IGNoYXQuICovXG5cdHJlYWRvbmx5IHNlc3Npb246IFVSSTtcblx0LyoqIFRoZSBjaGF0IGNoYW5uZWwgdG8gZGVsaXZlciB0aGUgbWVzc2FnZSBvbiAoZGVmYXVsdCBjaGF0LCBvciBhIHNwZWNpZmljIGNoYXQgd2hlbiB0aGUgbGluayBjYXJyaWVkIG9uZSkuICovXG5cdHJlYWRvbmx5IGNoYXQ6IFVSSTtcblx0LyoqIFRoZSBjaGF0IGlkIHdoZW4gYSBzcGVjaWZpYyBjaGF0IHdhcyB0YXJnZXRlZCAoZnJvbSBhIGBjcmVhdGVfY2hhdGAgbGluaykuICovXG5cdHJlYWRvbmx5IGNoYXRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFZhbGlkYXRlcyBhbmQgcmVzb2x2ZXMgc2VuZC1tZXNzYWdlIGFyZ3VtZW50cy4gV2hlbiB0aGUgYHNlc3Npb25gIGlucHV0IGlzIGFcbiAqIGBjcmVhdGVfY2hhdGAgb3BlbiBsaW5rIChjYXJyeWluZyBhIGNoYXQgaWQpLCB0aGUgbWVzc2FnZSBpcyB0YXJnZXRlZCBhdCB0aGF0XG4gKiBzcGVjaWZpYyBjaGF0IHJhdGhlciB0aGFuIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2VuZE1lc3NhZ2VBcmdzKHJhd0FyZ3M6IHVua25vd24sIHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSk6IElSZXNvbHZlZFNlbmRNZXNzYWdlQXJncyB7XG5cdGNvbnN0IGFyZ3MgPSAocmF3QXJncyA/PyB7fSkgYXMgSVNlbmRNZXNzYWdlQXJncztcblx0Y29uc3QgbWVzc2FnZSA9IGdldFJlcXVpcmVkU3RyaW5nKGFyZ3MubWVzc2FnZSwgJ21lc3NhZ2UnLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2UpO1xuXHRjb25zdCBzZXNzaW9uSW5wdXQgPSBnZXRSZXF1aXJlZFN0cmluZyhhcmdzLnNlc3Npb24sICdzZXNzaW9uJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IHJlc29sdmVLbm93blNlc3Npb24oc2Vzc2lvbklucHV0LCBzZXNzaW9ucyk7XG5cdGlmICghc2Vzc2lvbikge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZX0gaW5wdXQ6IHNlc3Npb24gbXVzdCBtYXRjaCB0aGUgVVJJIG9mIGEga25vd24gc2Vzc2lvbiAoc2VlIGxpc3Rfc2Vzc2lvbnMpLmApO1xuXHR9XG5cdGNvbnN0IGNoYXRJZCA9IHBhcnNlT3BlblNlc3Npb25MaW5rQ2hhdElkKHNlc3Npb25JbnB1dCk7XG5cdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoY2hhdElkID8gYnVpbGRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdElkKSA6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSk7XG5cdHJldHVybiB7IHNlc3Npb24sIGNoYXQsIG1lc3NhZ2UsIC4uLihjaGF0SWQgIT09IHVuZGVmaW5lZCA/IHsgY2hhdElkIH0gOiB7fSkgfTtcbn1cblxuLyoqXG4gKiBTZW5kcyBhIG1lc3NhZ2UgdG8gYW4gZXhpc3Rpbmcgc2Vzc2lvbi9jaGF0LCBzdGFydGluZyBhIG5ldyB0dXJuIHRoZXJlLlxuICogUmVmdXNlcyB0byB0YXJnZXQge0BsaW5rIGN1cnJlbnRDaGFubmVsfSAodGhlIGNoYXQgY2hhbm5lbCB0aGUgdG9vbCBydW5zIG9uKVxuICogdG8gYXZvaWQgYSBzZXNzaW9uIHRyaXZpYWxseSBtZXNzYWdpbmcgaXRzZWxmIGluIGEgbG9vcC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFwcGx5U2VuZE1lc3NhZ2VUb29sKGFjY2Vzc29yOiBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciwgcmF3QXJnczogdW5rbm93biwgY3VycmVudENoYW5uZWw/OiBQcm90b2NvbFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgYWNjZXNzb3IubGlzdFNlc3Npb25zKCk7XG5cdGNvbnN0IHsgc2Vzc2lvbiwgY2hhdCwgY2hhdElkLCBtZXNzYWdlIH0gPSBnZXRTZW5kTWVzc2FnZUFyZ3MocmF3QXJncywgc2Vzc2lvbnMpO1xuXHRpZiAoY3VycmVudENoYW5uZWwgJiYgY2hhdC50b1N0cmluZygpID09PSBVUkkucGFyc2UoY3VycmVudENoYW5uZWwpLnRvU3RyaW5nKCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuU2VuZE1lc3NhZ2V9IGlucHV0OiByZWZ1c2luZyB0byBzZW5kIGEgbWVzc2FnZSB0byB0aGUgY3VycmVudCBjaGF0LmApO1xuXHR9XG5cdGF3YWl0IGFjY2Vzc29yLnN0YXJ0UHJvbXB0KHNlc3Npb24sIGNoYXQsIG1lc3NhZ2UpO1xuXHRyZXR1cm4gZm9ybWF0U2VuZE1lc3NhZ2VSZXN1bHQoYnVpbGRPcGVuU2Vzc2lvbkxpbmtVcmkoc2Vzc2lvbiwgY2hhdElkKSk7XG59XG5cbi8qKiBCdWlsZHMgdGhlIG1vZGVsLWZhY2luZyBgc2VuZF9tZXNzYWdlYCByZXN1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0U2VuZE1lc3NhZ2VSZXN1bHQob3Blbkxpbms6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgTWVzc2FnZSBzZW50ICgke29wZW5MaW5rfSkuIFJlcGx5IHdpdGggb25lIHNob3J0IHNlbnRlbmNlIGNvbmZpcm1pbmcgdGhlIG1lc3NhZ2Ugd2FzIHNlbnQ7IGRvIG5vdCBwcmludCB0aGUgVVJMIG9yIG1lbnRpb24gYSBidXR0b24uYDtcbn1cblxuLy8gLS0tIGdldF9zZXNzaW9uX2NvbnRleHQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxudHlwZSBTZXNzaW9uQ29udGV4dERldGFpbCA9ICh0eXBlb2Ygc2Vzc2lvbkNvbnRleHREZXRhaWxWYWx1ZXMpW251bWJlcl07XG5cbmNvbnN0IGRlZmF1bHRUcmFuc2NyaXB0TGltaXQgPSAxMDtcbmNvbnN0IG1heFRyYW5zY3JpcHRMaW1pdCA9IDUwO1xuXG4vKiogUGVyLWRldGFpbCB0cnVuY2F0aW9uIGNhcHMgKGNoYXJhY3RlcnMpOyBhIHZhbHVlIG9mIDAgb21pdHMgdGhlIGZpZWxkLiAqL1xuY29uc3QgY29udGV4dENhcHM6IFJlY29yZDxTZXNzaW9uQ29udGV4dERldGFpbCwgeyB1c2VyOiBudW1iZXI7IGFzc2lzdGFudDogbnVtYmVyOyB0b29sSW5wdXQ6IG51bWJlciB9PiA9IHtcblx0Ly8gYHN1bW1hcnlgIHN0aWxsIGNhcnJpZXMgYSBzaG9ydCBhc3Npc3RhbnQgZ2lzdCBwZXIgdHVybiBzbyB0aGUgcmVhZGVyIHNlZXNcblx0Ly8gd2hhdCBlYWNoIHR1cm4gYWN0dWFsbHkgZGlkLCBub3QganVzdCB3aGF0IHdhcyBhc2tlZC5cblx0c3VtbWFyeTogeyB1c2VyOiAxNjAsIGFzc2lzdGFudDogMTQwLCB0b29sSW5wdXQ6IDAgfSxcblx0ZGlnZXN0OiB7IHVzZXI6IDMwMCwgYXNzaXN0YW50OiA4MDAsIHRvb2xJbnB1dDogMCB9LFxuXHRmdWxsOiB7IHVzZXI6IDEwMDAsIGFzc2lzdGFudDogMjAwMCwgdG9vbElucHV0OiAyMDAgfSxcbn07XG5cbmludGVyZmFjZSBJU2Vzc2lvbkNvbnRleHRBcmdzIHtcblx0cmVhZG9ubHkgc2Vzc2lvbj86IHVua25vd247XG5cdHJlYWRvbmx5IGRldGFpbD86IHVua25vd247XG5cdHJlYWRvbmx5IHRyYW5zY3JpcHRMaW1pdD86IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkU2Vzc2lvbkNvbnRleHRBcmdzIHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogVVJJO1xuXHRyZWFkb25seSBjaGF0SWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldGFpbDogU2Vzc2lvbkNvbnRleHREZXRhaWw7XG5cdHJlYWRvbmx5IHRyYW5zY3JpcHRMaW1pdDogbnVtYmVyO1xufVxuXG4vKiogVmFsaWRhdGVzIGFuZCByZXNvbHZlcyBnZXQtc2Vzc2lvbi1jb250ZXh0IGFyZ3VtZW50cyBhZ2FpbnN0IHRoZSBrbm93biBzZXNzaW9ucy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXNzaW9uQ29udGV4dEFyZ3MocmF3QXJnczogdW5rbm93biwgc2Vzc2lvbnM6IHJlYWRvbmx5IElBZ2VudFNlc3Npb25NZXRhZGF0YVtdKTogSVJlc29sdmVkU2Vzc2lvbkNvbnRleHRBcmdzIHtcblx0Y29uc3QgYXJncyA9IChyYXdBcmdzID8/IHt9KSBhcyBJU2Vzc2lvbkNvbnRleHRBcmdzO1xuXHRjb25zdCBzZXNzaW9uSW5wdXQgPSBnZXRSZXF1aXJlZFN0cmluZyhhcmdzLnNlc3Npb24sICdzZXNzaW9uJywgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldFNlc3Npb25Db250ZXh0KTtcblx0Y29uc3Qgc2Vzc2lvbiA9IHJlc29sdmVLbm93blNlc3Npb24oc2Vzc2lvbklucHV0LCBzZXNzaW9ucyk7XG5cdGlmICghc2Vzc2lvbikge1xuXHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCAke1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dH0gaW5wdXQ6IHNlc3Npb24gbXVzdCBtYXRjaCB0aGUgVVJJIG9mIGEga25vd24gc2Vzc2lvbiAoc2VlIGxpc3Rfc2Vzc2lvbnMpLmApO1xuXHR9XG5cdGxldCBkZXRhaWw6IFNlc3Npb25Db250ZXh0RGV0YWlsID0gJ3N1bW1hcnknO1xuXHRpZiAoYXJncy5kZXRhaWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0eXBlb2YgYXJncy5kZXRhaWwgIT09ICdzdHJpbmcnIHx8ICEoc2Vzc2lvbkNvbnRleHREZXRhaWxWYWx1ZXMgYXMgcmVhZG9ubHkgc3RyaW5nW10pLmluY2x1ZGVzKGFyZ3MuZGV0YWlsKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldFNlc3Npb25Db250ZXh0fSBpbnB1dDogZGV0YWlsIG11c3QgYmUgb25lIG9mICR7c2Vzc2lvbkNvbnRleHREZXRhaWxWYWx1ZXMuam9pbignLCAnKX0uYCk7XG5cdFx0fVxuXHRcdGRldGFpbCA9IGFyZ3MuZGV0YWlsIGFzIFNlc3Npb25Db250ZXh0RGV0YWlsO1xuXHR9XG5cdGxldCB0cmFuc2NyaXB0TGltaXQgPSBkZWZhdWx0VHJhbnNjcmlwdExpbWl0O1xuXHRpZiAoYXJncy50cmFuc2NyaXB0TGltaXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0eXBlb2YgYXJncy50cmFuc2NyaXB0TGltaXQgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNGaW5pdGUoYXJncy50cmFuc2NyaXB0TGltaXQpIHx8IGFyZ3MudHJhbnNjcmlwdExpbWl0IDwgMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLkdldFNlc3Npb25Db250ZXh0fSBpbnB1dDogdHJhbnNjcmlwdExpbWl0IG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXIuYCk7XG5cdFx0fVxuXHRcdHRyYW5zY3JpcHRMaW1pdCA9IE1hdGgubWluKE1hdGguZmxvb3IoYXJncy50cmFuc2NyaXB0TGltaXQpLCBtYXhUcmFuc2NyaXB0TGltaXQpO1xuXHR9XG5cdGNvbnN0IGNoYXRJZCA9IHBhcnNlT3BlblNlc3Npb25MaW5rQ2hhdElkKHNlc3Npb25JbnB1dCk7XG5cdHJldHVybiB7IHNlc3Npb24sIGRldGFpbCwgdHJhbnNjcmlwdExpbWl0LCAuLi4oY2hhdElkICE9PSB1bmRlZmluZWQgPyB7IGNoYXRJZCB9IDoge30pIH07XG59XG5cbi8qKiBUcnVuY2F0ZXMge0BsaW5rIHRleHR9IHRvIHtAbGluayBtYXh9IGNoYXJhY3RlcnMsIGFwcGVuZGluZyBhbiBlbGxpcHNpcyB3aGVuIGN1dC4gKi9cbmZ1bmN0aW9uIHRydW5jYXRlVGV4dCh0ZXh0OiBzdHJpbmcsIG1heDogbnVtYmVyKTogeyB0ZXh0OiBzdHJpbmc7IHRydW5jYXRlZDogYm9vbGVhbiB9IHtcblx0Y29uc3QgdHJpbW1lZCA9IHRleHQudHJpbSgpO1xuXHRpZiAodHJpbW1lZC5sZW5ndGggPD0gbWF4KSB7XG5cdFx0cmV0dXJuIHsgdGV4dDogdHJpbW1lZCwgdHJ1bmNhdGVkOiBmYWxzZSB9O1xuXHR9XG5cdHJldHVybiB7IHRleHQ6IGAke3RyaW1tZWQuc2xpY2UoMCwgTWF0aC5tYXgoMCwgbWF4IC0gMSkpfVx1MjAyNmAsIHRydW5jYXRlZDogdHJ1ZSB9O1xufVxuXG4vKiogUmVhZHMgdGhlIHRvb2wtY2FsbCBwYXJ0cyBvZiBhIHR1cm4sIG5ld2VzdC1lbWl0dGVkIGxhc3QuICovXG5mdW5jdGlvbiB0b29sQ2FsbHNPZihwYXJ0czogcmVhZG9ubHkgUmVzcG9uc2VQYXJ0W10pOiBUb29sQ2FsbFN0YXRlW10ge1xuXHRyZXR1cm4gcGFydHMuZmlsdGVyKChwKTogcCBpcyBFeHRyYWN0PFJlc3BvbnNlUGFydCwgeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0+ID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkubWFwKHAgPT4gcC50b29sQ2FsbCk7XG59XG5cbi8qKiBDb25jYXRlbmF0ZWQgbWFya2Rvd24gdGV4dCBvZiBhIHR1cm4ncyByZXNwb25zZSwgaW4gc3RyZWFtIG9yZGVyLiAqL1xuZnVuY3Rpb24gYXNzaXN0YW50VGV4dE9mKHBhcnRzOiByZWFkb25seSBSZXNwb25zZVBhcnRbXSk6IHN0cmluZyB7XG5cdHJldHVybiBwYXJ0cy5maWx0ZXIoKHApOiBwIGlzIEV4dHJhY3Q8UmVzcG9uc2VQYXJ0LCB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gfT4gPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKS5tYXAocCA9PiBwLmNvbnRlbnQpLmpvaW4oJycpLnRyaW0oKTtcbn1cblxuLyoqIFJlYWRzIGEgdG9vbCBjYWxsJ3MgSlNPTiBpbnB1dCBzdHJpbmcsIHdoaWNoIGlzIGFic2VudCB3aGlsZSBzdGlsbCBzdHJlYW1pbmcuICovXG5mdW5jdGlvbiByZWFkVG9vbElucHV0KHRjOiBUb29sQ2FsbFN0YXRlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nID8gdW5kZWZpbmVkIDogdGMudG9vbElucHV0O1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRDb250ZXh0VHVybiB7XG5cdHJlYWRvbmx5IHR1cm46IG51bWJlcjtcblx0cmVhZG9ubHkgc3RhdGU6IHN0cmluZztcblx0cmVhZG9ubHkgdXNlcj86IHN0cmluZztcblx0cmVhZG9ubHkgYXNzaXN0YW50Pzogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sQ2FsbHM/OiByZWFkb25seSAoc3RyaW5nIHwgeyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGlucHV0Pzogc3RyaW5nIH0pW107XG59XG5cbi8qKiBNYXBzIGEge0BsaW5rIFR1cm5TdGF0ZX0gKG9yIHRoZSBpbi1wcm9ncmVzcyBhY3RpdmUgdHVybikgdG8gYSBkaXNwbGF5IHN0cmluZy4gKi9cbmZ1bmN0aW9uIGRlc2NyaWJlVHVyblN0YXRlKHN0YXRlOiBUdXJuU3RhdGUgfCAnaW5Qcm9ncmVzcycpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKHN0YXRlKSB7XG5cdFx0Y2FzZSBUdXJuU3RhdGUuQ29tcGxldGU6IHJldHVybiAnY29tcGxldGUnO1xuXHRcdGNhc2UgVHVyblN0YXRlLkNhbmNlbGxlZDogcmV0dXJuICdjYW5jZWxsZWQnO1xuXHRcdGNhc2UgVHVyblN0YXRlLkVycm9yOiByZXR1cm4gJ2Vycm9yJztcblx0XHRkZWZhdWx0OiByZXR1cm4gJ2luUHJvZ3Jlc3MnO1xuXHR9XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZFNlc3Npb25Db250ZXh0IHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogc3RyaW5nO1xuXHRyZWFkb25seSBvcGVuTGluazogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWw6IFNlc3Npb25Db250ZXh0RGV0YWlsO1xuXHRyZWFkb25seSB0cmFuc2NyaXB0OiByZWFkb25seSBJU2VyaWFsaXplZENvbnRleHRUdXJuW107XG5cdHJlYWRvbmx5IGhhc01vcmVIaXN0b3J5OiBib29sZWFuO1xuXHQvKiogYHRydWVgIHdoZW4gdHVybnMgd2VyZSBkcm9wcGVkIGZyb20gdGhlIHdpbmRvdyBvciBhbnkgZmllbGQgd2FzIHNob3J0ZW5lZC4gKi9cblx0cmVhZG9ubHkgdHJ1bmNhdGVkOiBib29sZWFuO1xufVxuXG4vKiogQnVpbGRzIHRoZSBjb21wYWN0ZWQsIG1vZGVsLWZhY2luZyBzZXNzaW9uLWNvbnRleHQgcGF5bG9hZCBmcm9tIGEgc25hcHNob3QuICovXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplU2Vzc2lvbkNvbnRleHQoc2Vzc2lvbjogVVJJLCBjaGF0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc25hcHNob3Q6IElDaGF0Q29udGV4dFNuYXBzaG90LCBkZXRhaWw6IFNlc3Npb25Db250ZXh0RGV0YWlsLCB0cmFuc2NyaXB0TGltaXQ6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IGNhcHMgPSBjb250ZXh0Q2Fwc1tkZXRhaWxdO1xuXHRsZXQgdHJ1bmNhdGVkID0gZmFsc2U7XG5cdGNvbnN0IHRydW5jID0gKHRleHQ6IHN0cmluZywgbWF4OiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdGlmIChtYXggPD0gMCB8fCAhdGV4dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gdHJ1bmNhdGVUZXh0KHRleHQsIG1heCk7XG5cdFx0dHJ1bmNhdGVkID0gdHJ1bmNhdGVkIHx8IHJlc3VsdC50cnVuY2F0ZWQ7XG5cdFx0cmV0dXJuIHJlc3VsdC50ZXh0IHx8IHVuZGVmaW5lZDtcblx0fTtcblxuXHRjb25zdCBlbnRyaWVzOiB7IG1lc3NhZ2U6IE1lc3NhZ2U7IHBhcnRzOiByZWFkb25seSBSZXNwb25zZVBhcnRbXTsgc3RhdGU6IFR1cm5TdGF0ZSB8ICdpblByb2dyZXNzJyB9W10gPVxuXHRcdHNuYXBzaG90LnR1cm5zLm1hcCh0ID0+ICh7IG1lc3NhZ2U6IHQubWVzc2FnZSwgcGFydHM6IHQucmVzcG9uc2VQYXJ0cywgc3RhdGU6IHQuc3RhdGUgfSkpO1xuXHRpZiAoc25hcHNob3QuYWN0aXZlVHVybikge1xuXHRcdGVudHJpZXMucHVzaCh7IG1lc3NhZ2U6IHNuYXBzaG90LmFjdGl2ZVR1cm4ubWVzc2FnZSwgcGFydHM6IHNuYXBzaG90LmFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0cywgc3RhdGU6ICdpblByb2dyZXNzJyB9KTtcblx0fVxuXHRpZiAoZW50cmllcy5sZW5ndGggPiB0cmFuc2NyaXB0TGltaXQpIHtcblx0XHR0cnVuY2F0ZWQgPSB0cnVlO1xuXHR9XG5cdGNvbnN0IHdpbmRvd1N0YXJ0ID0gTWF0aC5tYXgoMCwgZW50cmllcy5sZW5ndGggLSB0cmFuc2NyaXB0TGltaXQpO1xuXHRjb25zdCB3aW5kb3dlZCA9IGVudHJpZXMuc2xpY2Uod2luZG93U3RhcnQpO1xuXG5cdGNvbnN0IHRyYW5zY3JpcHQ6IElTZXJpYWxpemVkQ29udGV4dFR1cm5bXSA9IHdpbmRvd2VkLm1hcCgoZW50cnksIGluZGV4KTogSVNlcmlhbGl6ZWRDb250ZXh0VHVybiA9PiB7XG5cdFx0Y29uc3QgdXNlciA9IHRydW5jKGVudHJ5Lm1lc3NhZ2UudGV4dCwgY2Fwcy51c2VyKTtcblx0XHRjb25zdCBhc3Npc3RhbnQgPSB0cnVuYyhhc3Npc3RhbnRUZXh0T2YoZW50cnkucGFydHMpLCBjYXBzLmFzc2lzdGFudCk7XG5cdFx0Y29uc3QgdG9vbENhbGxzID0gdG9vbENhbGxzT2YoZW50cnkucGFydHMpO1xuXHRcdGxldCBzZXJpYWxpemVkVG9vbENhbGxzOiAoc3RyaW5nIHwgeyBuYW1lOiBzdHJpbmc7IGlucHV0Pzogc3RyaW5nIH0pW10gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGRldGFpbCAhPT0gJ3N1bW1hcnknICYmIHRvb2xDYWxscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzZXJpYWxpemVkVG9vbENhbGxzID0gdG9vbENhbGxzLm1hcCh0YyA9PiB7XG5cdFx0XHRcdGlmIChjYXBzLnRvb2xJbnB1dCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBpbnB1dCA9IHRydW5jKHJlYWRUb29sSW5wdXQodGMpID8/ICcnLCBjYXBzLnRvb2xJbnB1dCk7XG5cdFx0XHRcdFx0cmV0dXJuIGlucHV0ICE9PSB1bmRlZmluZWQgPyB7IG5hbWU6IHRjLnRvb2xOYW1lLCBpbnB1dCB9IDogeyBuYW1lOiB0Yy50b29sTmFtZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0Yy50b29sTmFtZTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVybjogd2luZG93U3RhcnQgKyBpbmRleCArIDEsXG5cdFx0XHRzdGF0ZTogZGVzY3JpYmVUdXJuU3RhdGUoZW50cnkuc3RhdGUpLFxuXHRcdFx0Li4uKHVzZXIgIT09IHVuZGVmaW5lZCA/IHsgdXNlciB9IDoge30pLFxuXHRcdFx0Li4uKGFzc2lzdGFudCAhPT0gdW5kZWZpbmVkID8geyBhc3Npc3RhbnQgfSA6IHt9KSxcblx0XHRcdC4uLihzZXJpYWxpemVkVG9vbENhbGxzID8geyB0b29sQ2FsbHM6IHNlcmlhbGl6ZWRUb29sQ2FsbHMgfSA6IHt9KSxcblx0XHR9O1xuXHR9KTtcblxuXHRjb25zdCBwYXlsb2FkOiBJU2VyaWFsaXplZFNlc3Npb25Db250ZXh0ID0ge1xuXHRcdHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRvcGVuTGluazogYnVpbGRPcGVuU2Vzc2lvbkxpbmtVcmkoc2Vzc2lvbiwgY2hhdElkKSxcblx0XHRkZXRhaWwsXG5cdFx0dHJhbnNjcmlwdCxcblx0XHRoYXNNb3JlSGlzdG9yeTogc25hcHNob3QuaGFzTW9yZUhpc3RvcnksXG5cdFx0dHJ1bmNhdGVkLFxuXHR9O1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkocGF5bG9hZCk7XG59XG5cbi8qKiBSZWFkcyBhbmQgc2VyaWFsaXplcyB0aGUgY29udGV4dCBvZiBhbiBleGlzdGluZyBzZXNzaW9uL2NoYXQuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlHZXRTZXNzaW9uQ29udGV4dFRvb2woYWNjZXNzb3I6IElTZXNzaW9uU2VydmVyVG9vbEFjY2Vzc29yLCByYXdBcmdzOiB1bmtub3duKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhY2Nlc3Nvci5saXN0U2Vzc2lvbnMoKTtcblx0Y29uc3QgeyBzZXNzaW9uLCBjaGF0SWQsIGRldGFpbCwgdHJhbnNjcmlwdExpbWl0IH0gPSBnZXRTZXNzaW9uQ29udGV4dEFyZ3MocmF3QXJncywgc2Vzc2lvbnMpO1xuXHRjb25zdCBzbmFwc2hvdCA9IGFjY2Vzc29yLmdldENoYXRDb250ZXh0KHNlc3Npb24sIGNoYXRJZCk7XG5cdGlmICghc25hcHNob3QpIHtcblx0XHQvLyBObyBsaXZlIGNvbnZlcnNhdGlvbiBzdGF0ZSAoZS5nLiBhIGNvbGQvdW5zdWJzY3JpYmVkIHNlc3Npb24pOiByZXR1cm4gdGhlXG5cdFx0Ly8gaWRlbnRpdHkgKyBhbiBlbXB0eSB0cmFuc2NyaXB0LiBNZXRhZGF0YSBpcyBhdmFpbGFibGUgdmlhIGxpc3Rfc2Vzc2lvbnMuXG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNlc3Npb246IHNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdG9wZW5MaW5rOiBidWlsZE9wZW5TZXNzaW9uTGlua1VyaShzZXNzaW9uLCBjaGF0SWQpLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0dHJhbnNjcmlwdDogW10sXG5cdFx0XHRoYXNNb3JlSGlzdG9yeTogZmFsc2UsXG5cdFx0XHR0cnVuY2F0ZWQ6IGZhbHNlLFxuXHRcdH0gc2F0aXNmaWVzIElTZXJpYWxpemVkU2Vzc2lvbkNvbnRleHQpO1xuXHR9XG5cdHJldHVybiBzZXJpYWxpemVTZXNzaW9uQ29udGV4dChzZXNzaW9uLCBjaGF0SWQsIHNuYXBzaG90LCBkZXRhaWwsIHRyYW5zY3JpcHRMaW1pdCk7XG59XG5cblxuLyoqIFNlcmlhbGl6ZXMgdGhlIGN1cnJlbnQgc2Vzc2lvbidzIG1ldGFkYXRhICsgb3BlbiBsaW5rIGFzIHRoZSBgZ2V0X2N1cnJlbnRfc2Vzc2lvbmAgcmVzdWx0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZUN1cnJlbnRTZXNzaW9uKGN1cnJlbnRTZXNzaW9uOiBVUkksIHNlc3Npb25zOiByZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSk6IHN0cmluZyB7XG5cdGNvbnN0IG1ldGEgPSBzZXNzaW9ucy5maW5kKHMgPT4gcy5zZXNzaW9uLnRvU3RyaW5nKCkgPT09IGN1cnJlbnRTZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdHNlc3Npb246IGN1cnJlbnRTZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0b3Blbkxpbms6IGJ1aWxkT3BlblNlc3Npb25MaW5rVXJpKGN1cnJlbnRTZXNzaW9uKSxcblx0XHQuLi4obWV0YSA/IHNlcmlhbGl6ZVNlc3Npb24obWV0YSkgOiB7fSksXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBwYXJzZUxpc3RlZFNlc3Npb25Db3VudChyZXN1bHRUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRpZiAoIXJlc3VsdFRleHQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXN1bHRUZXh0KSBhcyB7IHNlc3Npb25zPzogdW5rbm93biB9O1xuXHRcdHJldHVybiBBcnJheS5pc0FycmF5KHBhcnNlZC5zZXNzaW9ucykgPyBwYXJzZWQuc2Vzc2lvbnMubGVuZ3RoIDogdW5kZWZpbmVkO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRGVsZXRlU2Vzc2lvbkFyZ3Mge1xuXHRyZWFkb25seSBzZXNzaW9uPzogdW5rbm93bjtcbn1cblxuLyoqXG4gKiBWYWxpZGF0ZXMgZGVsZXRlLXNlc3Npb24gYXJndW1lbnRzIGFnYWluc3QgY3VycmVudCBzZXNzaW9ucyBhbmQgcmVmdXNlcyB0b1xuICogZGVsZXRlIHtAbGluayBjdXJyZW50U2Vzc2lvbn0gKGRlbGV0aW5nIHRoZSBzZXNzaW9uIHRoZSB0b29sIHJ1bnMgaW4gd291bGRcbiAqIHRlYXIgZG93biBpdHMgb3duIGNvbnZlcnNhdGlvbikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXREZWxldGVTZXNzaW9uQXJncyhyYXdBcmdzOiB1bmtub3duLCBzZXNzaW9uczogcmVhZG9ubHkgSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10sIGN1cnJlbnRTZXNzaW9uPzogVVJJKTogVVJJIHtcblx0Y29uc3QgYXJncyA9IChyYXdBcmdzID8/IHt9KSBhcyBJRGVsZXRlU2Vzc2lvbkFyZ3M7XG5cdGNvbnN0IHNlc3Npb25JbnB1dCA9IGdldFJlcXVpcmVkU3RyaW5nKGFyZ3Muc2Vzc2lvbiwgJ3Nlc3Npb24nLCBTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbik7XG5cdGNvbnN0IHNlc3Npb24gPSByZXNvbHZlS25vd25TZXNzaW9uKHNlc3Npb25JbnB1dCwgc2Vzc2lvbnMpO1xuXHRpZiAoIXNlc3Npb24pIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbn0gaW5wdXQ6IHNlc3Npb24gbXVzdCBtYXRjaCB0aGUgVVJJIG9mIGEga25vd24gc2Vzc2lvbiAoc2VlIGxpc3Rfc2Vzc2lvbnMpLmApO1xuXHR9XG5cdGlmIChjdXJyZW50U2Vzc2lvbiAmJiBzZXNzaW9uLnRvU3RyaW5nKCkgPT09IGN1cnJlbnRTZXNzaW9uLnRvU3RyaW5nKCkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgJHtTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbn0gaW5wdXQ6IHJlZnVzaW5nIHRvIGRlbGV0ZSB0aGUgY3VycmVudCBzZXNzaW9uLmApO1xuXHR9XG5cdHJldHVybiBzZXNzaW9uO1xufVxuXG4vKiogRGVsZXRlcyBhIHNlc3Npb24gYW5kIHJldHVybnMgdGhlIG1vZGVsLWZhY2luZyBjb25maXJtYXRpb24uICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXBwbHlEZWxldGVTZXNzaW9uVG9vbChhY2Nlc3NvcjogSVNlc3Npb25TZXJ2ZXJUb29sQWNjZXNzb3IsIHJhd0FyZ3M6IHVua25vd24sIGN1cnJlbnRTZXNzaW9uPzogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCBhY2Nlc3Nvci5saXN0U2Vzc2lvbnMoKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IGdldERlbGV0ZVNlc3Npb25BcmdzKHJhd0FyZ3MsIHNlc3Npb25zLCBjdXJyZW50U2Vzc2lvbik7XG5cdGF3YWl0IGFjY2Vzc29yLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbik7XG5cdHJldHVybiBgRGVsZXRlZCBzZXNzaW9uICR7c2Vzc2lvbi50b1N0cmluZygpfS4gUmVwbHkgd2l0aCBvbmUgc2hvcnQgc2VudGVuY2UgY29uZmlybWluZyB0aGUgc2Vzc2lvbiB3YXMgZGVsZXRlZC5gO1xufVxuXG5mdW5jdGlvbiBnZXRTZXNzaW9uVG9vbERpc3BsYXkodG9vbE5hbWU6IHN0cmluZywgX2FyZ3M6IHVua25vd24sIHJlc3VsdD86IElTZXJ2ZXJUb29sRGlzcGxheVJlc3VsdCk6IElTZXJ2ZXJUb29sRGlzcGxheSB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAodG9vbE5hbWUpIHtcblx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5MaXN0U2Vzc2lvbnM6IHtcblx0XHRcdGxldCBwYXN0VGVuc2VNZXNzYWdlOiBTdHJpbmdPck1hcmtkb3duO1xuXHRcdFx0Y29uc3QgY291bnQgPSByZXN1bHQgPyBwYXJzZUxpc3RlZFNlc3Npb25Db3VudChyZXN1bHQudGV4dCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY291bnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlID0gbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5saXN0U2Vzc2lvbnMnLCBcIkNoZWNrZWQgc2Vzc2lvbnNcIik7XG5cdFx0XHR9IGVsc2UgaWYgKGNvdW50ID09PSAxKSB7XG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2UgPSBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmxpc3RTZXNzaW9ucy5vbmUnLCBcIkNoZWNrZWQgMSBzZXNzaW9uXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZSA9IGxvY2FsaXplKCd0b29sQ29tcGxldGUubGlzdFNlc3Npb25zLm1hbnknLCBcIkNoZWNrZWQgezB9IHNlc3Npb25zXCIsIGNvdW50KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUubGlzdFNlc3Npb25zJywgXCJMaXN0IFNlc3Npb25zXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UubGlzdFNlc3Npb25zJywgXCJDaGVja2luZyBzZXNzaW9uc1wiKSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb246XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2xOYW1lLmNyZWF0ZVNlc3Npb24nLCBcIkNyZWF0ZSBTZXNzaW9uXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UuY3JlYXRlU2Vzc2lvbicsIFwiQ3JlYXRpbmcgc2Vzc2lvblwiKSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5jcmVhdGVTZXNzaW9uJywgXCJDcmVhdGVkIHNlc3Npb25cIiksXG5cdFx0XHR9O1xuXHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZUNoYXQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2xOYW1lLmNyZWF0ZUNoYXQnLCBcIkNyZWF0ZSBDaGF0XCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2UuY3JlYXRlQ2hhdCcsIFwiQ3JlYXRpbmcgY2hhdFwiKSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5jcmVhdGVDaGF0JywgXCJDcmVhdGVkIGNoYXRcIiksXG5cdFx0XHR9O1xuXHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sTmFtZS5zZW5kTWVzc2FnZScsIFwiU2VuZCBNZXNzYWdlXCIpLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xJbnZva2Uuc2VuZE1lc3NhZ2UnLCBcIlNlbmRpbmcgbWVzc2FnZVwiKSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ3Rvb2xDb21wbGV0ZS5zZW5kTWVzc2FnZScsIFwiU2VudCBtZXNzYWdlXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUuZ2V0U2Vzc2lvbkNvbnRleHQnLCBcIkdldCBTZXNzaW9uIENvbnRleHRcIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbEludm9rZS5nZXRTZXNzaW9uQ29udGV4dCcsIFwiUmVhZGluZyBzZXNzaW9uIGNvbnRleHRcIiksXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCd0b29sQ29tcGxldGUuZ2V0U2Vzc2lvbkNvbnRleHQnLCBcIlJlYWQgc2Vzc2lvbiBjb250ZXh0XCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRDdXJyZW50U2Vzc2lvbjpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUuZ2V0Q3VycmVudFNlc3Npb24nLCBcIkdldCBDdXJyZW50IFNlc3Npb25cIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbEludm9rZS5nZXRDdXJyZW50U2Vzc2lvbicsIFwiQ2hlY2tpbmcgY3VycmVudCBzZXNzaW9uXCIpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmdldEN1cnJlbnRTZXNzaW9uJywgXCJDaGVja2VkIGN1cnJlbnQgc2Vzc2lvblwiKSxcblx0XHRcdH07XG5cdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuRGVsZXRlU2Vzc2lvbjpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbE5hbWUuZGVsZXRlU2Vzc2lvbicsIFwiRGVsZXRlIFNlc3Npb25cIiksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndG9vbEludm9rZS5kZWxldGVTZXNzaW9uJywgXCJEZWxldGluZyBzZXNzaW9uXCIpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgndG9vbENvbXBsZXRlLmRlbGV0ZVNlc3Npb24nLCBcIkRlbGV0ZWQgc2Vzc2lvblwiKSxcblx0XHRcdH07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBDcmVhdGVzIHRoZSBzZXNzaW9uIHNlcnZlci10b29sIGdyb3VwIHdpdGggcHJvY2Vzcy1sb2NhbCByZWN1cnNpb24gcHJvdGVjdGlvbi5cbiAqXG4gKiBUaGUge0BsaW5rIGFjY2Vzc29yfSBpcyBvcHRpb25hbCBzbyB0aGUgZ3JvdXAgY2FuIGFsc28gYmFjayB0aGUgcHVyZSBkaXNwbGF5XG4gKiBwYXRoIChgZ2V0U2VydmVyVG9vbERpc3BsYXlgKSwgd2hpY2ggb25seSBuZWVkcyB7QGxpbmsgSVNlcnZlclRvb2xHcm91cC5kZWZpbml0aW9uc30sXG4gKiB7QGxpbmsgSVNlcnZlclRvb2xHcm91cC5nZXREaXNwbGF5fSBhbmQge0BsaW5rIElTZXJ2ZXJUb29sR3JvdXAucmVxdWlyZXNDb25maXJtYXRpb259XG4gKiBhbmQgbmV2ZXIgaW52b2tlcyB7QGxpbmsgSVNlcnZlclRvb2xHcm91cC5leGVjdXRlfS4gYGV4ZWN1dGVgIHRocm93cyB3aGVuIG5vXG4gKiBhY2Nlc3NvciB3YXMgcHJvdmlkZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uU2VydmVyVG9vbEdyb3VwKGFjY2Vzc29yPzogSVNlc3Npb25TZXJ2ZXJUb29sQWNjZXNzb3IpOiBJU2VydmVyVG9vbEdyb3VwIHtcblx0bGV0IGNyZWF0ZWRTZXNzaW9uQ291bnQgPSAwO1xuXHRsZXQgY3JlYXRlZENoYXRDb3VudCA9IDA7XG5cdGxldCBzZW50TWVzc2FnZUNvdW50ID0gMDtcblx0Y29uc3QgZ3JvdXA6IElTZXJ2ZXJUb29sR3JvdXAgPSB7XG5cdFx0ZGVmaW5pdGlvbnM6IHNlc3Npb25TZXJ2ZXJUb29sRGVmaW5pdGlvbnMsXG5cdFx0cmVxdWlyZXNDb25maXJtYXRpb24odG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25Ub29sUmVxdWlyZXNDb25maXJtYXRpb24odG9vbE5hbWUpO1xuXHRcdH0sXG5cdFx0Z2V0RGlzcGxheSh0b29sTmFtZTogc3RyaW5nLCBhcmdzOiB1bmtub3duLCByZXN1bHQ/OiBJU2VydmVyVG9vbERpc3BsYXlSZXN1bHQpOiBJU2VydmVyVG9vbERpc3BsYXkgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIGdldFNlc3Npb25Ub29sRGlzcGxheSh0b29sTmFtZSwgYXJncywgcmVzdWx0KTtcblx0XHR9LFxuXHRcdGFzeW5jIGV4ZWN1dGUoX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSwgdG9vbE5hbWU6IHN0cmluZywgcmF3QXJnczogdW5rbm93bik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRpZiAoIWFjY2Vzc29yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBzZXJ2ZXIgdG9vbCBcIiR7dG9vbE5hbWV9XCIgY2Fubm90IHJ1bjogdGhlIGdyb3VwIHdhcyBidWlsdCB3aXRob3V0IGEgc2Vzc2lvbiBhY2Nlc3Nvci5gKTtcblx0XHRcdH1cblx0XHRcdHN3aXRjaCAodG9vbE5hbWUpIHtcblx0XHRcdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuTGlzdFNlc3Npb25zOlxuXHRcdFx0XHRcdHJldHVybiBzZXJpYWxpemVTZXNzaW9ucyhmaWx0ZXJTZXNzaW9ucyhhd2FpdCBhY2Nlc3Nvci5saXN0U2Vzc2lvbnMoKSwgZ2V0TGlzdFNlc3Npb25zQXJncyhyYXdBcmdzKSkpO1xuXHRcdFx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRDdXJyZW50U2Vzc2lvbjpcblx0XHRcdFx0XHRyZXR1cm4gc2VyaWFsaXplQ3VycmVudFNlc3Npb24oY3VycmVudFNlc3Npb25Vcmkoc2Vzc2lvblVyaSksIGF3YWl0IGFjY2Vzc29yLmxpc3RTZXNzaW9ucygpKTtcblx0XHRcdFx0Y2FzZSBTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbjoge1xuXHRcdFx0XHRcdGlmIChjcmVhdGVkU2Vzc2lvbkNvdW50ID49IG1heENyZWF0ZWRTZXNzaW9ucykge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZWZ1c2luZyB0byBjcmVhdGUgbW9yZSB0aGFuICR7bWF4Q3JlYXRlZFNlc3Npb25zfSBzZXNzaW9ucyBmcm9tIHNlcnZlciB0b29scyBpbiB0aGlzIHByb2Nlc3MuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFwcGx5Q3JlYXRlU2Vzc2lvblRvb2woYWNjZXNzb3IsIHJhd0FyZ3MsIGN1cnJlbnRTZXNzaW9uVXJpKHNlc3Npb25VcmkpKTtcblx0XHRcdFx0XHRjcmVhdGVkU2Vzc2lvbkNvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIGZvcm1hdENyZWF0ZVNlc3Npb25SZXN1bHQocmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVDaGF0OiB7XG5cdFx0XHRcdFx0aWYgKGNyZWF0ZWRDaGF0Q291bnQgPj0gbWF4Q3JlYXRlZENoYXRzKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlZnVzaW5nIHRvIGNyZWF0ZSBtb3JlIHRoYW4gJHttYXhDcmVhdGVkQ2hhdHN9IGNoYXRzIGZyb20gc2VydmVyIHRvb2xzIGluIHRoaXMgcHJvY2Vzcy5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYXBwbHlDcmVhdGVDaGF0VG9vbChhY2Nlc3NvciwgcmF3QXJncywgY3VycmVudFNlc3Npb25Vcmkoc2Vzc2lvblVyaSkpO1xuXHRcdFx0XHRcdGNyZWF0ZWRDaGF0Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gZm9ybWF0Q3JlYXRlQ2hhdFJlc3VsdChyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlOiB7XG5cdFx0XHRcdFx0aWYgKHNlbnRNZXNzYWdlQ291bnQgPj0gbWF4U2VudE1lc3NhZ2VzKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFJlZnVzaW5nIHRvIHNlbmQgbW9yZSB0aGFuICR7bWF4U2VudE1lc3NhZ2VzfSBtZXNzYWdlcyBmcm9tIHNlcnZlciB0b29scyBpbiB0aGlzIHByb2Nlc3MuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFwcGx5U2VuZE1lc3NhZ2VUb29sKGFjY2Vzc29yLCByYXdBcmdzLCBzZXNzaW9uVXJpKTtcblx0XHRcdFx0XHRzZW50TWVzc2FnZUNvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5HZXRTZXNzaW9uQ29udGV4dDpcblx0XHRcdFx0XHRyZXR1cm4gYXBwbHlHZXRTZXNzaW9uQ29udGV4dFRvb2woYWNjZXNzb3IsIHJhd0FyZ3MpO1xuXHRcdFx0XHRjYXNlIFNlc3Npb25TZXJ2ZXJUb29sTmFtZS5EZWxldGVTZXNzaW9uOlxuXHRcdFx0XHRcdHJldHVybiBhcHBseURlbGV0ZVNlc3Npb25Ub29sKGFjY2Vzc29yLCByYXdBcmdzLCBjdXJyZW50U2Vzc2lvblVyaShzZXNzaW9uVXJpKSk7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHNlc3Npb24gc2VydmVyIHRvb2w6ICR7dG9vbE5hbWV9YCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0fTtcblx0cmV0dXJuIGdyb3VwO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXO0FBRXBCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsY0FBYyxxQkFBcUIseUJBQXlCLHFCQUFxQixjQUFjLHFCQUFxQix3QkFBd0Isa0JBQWtCLGdCQUFnQixpQkFBc0o7QUFDN1UsU0FBUyx5QkFBeUIsNEJBQTRCLCtCQUErQjtBQUM3RixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQVc3QixNQUFNLHVCQUF1QjtBQUc3QixNQUFNLHFCQUFxQjtBQUMzQixNQUFNLGtCQUFrQjtBQUd4QixNQUFNLGtCQUFrQjtBQUV4QixNQUFNLCtCQUFvRCxvQkFBSSxJQUFJLENBQUMsc0JBQXNCLGVBQWUsc0JBQXNCLFlBQVksc0JBQXNCLGFBQWEsc0JBQXNCLGFBQWEsQ0FBQztBQUcxTSxTQUFTLGdDQUFnQyxVQUEyQjtBQUMxRSxTQUFPLDZCQUE2QixJQUFJLFFBQVE7QUFDakQ7QUFFQSxNQUFNLDJCQUEyQixDQUFDLFFBQVEsY0FBYyxlQUFlLFNBQVMsVUFBVTtBQUUxRixNQUFNLDBCQUF5RDtBQUFBLEVBQzlELE1BQU07QUFBQSxFQUNOLFlBQVk7QUFBQSxJQUNYLFNBQVMsRUFBRSxNQUFNLFVBQVUsYUFBYSwwS0FBMks7QUFBQSxJQUNuTixRQUFRO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixPQUFPLEVBQUUsTUFBTSxVQUFVLE1BQU0sQ0FBQyxHQUFHLHdCQUF3QixFQUFFO0FBQUEsTUFDN0QsYUFBYTtBQUFBLElBQ2Q7QUFBQSxJQUNBLFdBQVcsRUFBRSxNQUFNLFVBQVUsYUFBYSwwR0FBcUc7QUFBQSxJQUMvSSxhQUFhLEVBQUUsTUFBTSxXQUFXLGFBQWEsc0VBQXNFO0FBQUEsSUFDbkgsUUFBUSxFQUFFLE1BQU0sV0FBVyxhQUFhLDBFQUEwRTtBQUFBLElBQ2xILGlCQUFpQixFQUFFLE1BQU0sV0FBVyxhQUFhLDBFQUEwRTtBQUFBLElBQzNILGlCQUFpQixFQUFFLE1BQU0sV0FBVyxhQUFhLHNHQUFzRztBQUFBLElBQ3ZKLGNBQWMsRUFBRSxNQUFNLFVBQVUsYUFBYSx3R0FBd0c7QUFBQSxJQUNySixlQUFlLEVBQUUsTUFBTSxVQUFVLGFBQWEsNEVBQTRFO0FBQUEsRUFDM0g7QUFDRDtBQUVBLE1BQU0sMkJBQTBEO0FBQUEsRUFDL0QsTUFBTTtBQUFBLEVBQ04sWUFBWTtBQUFBLElBQ1gsV0FBVyxFQUFFLE1BQU0sVUFBVSxhQUFhLHdGQUF3RjtBQUFBLElBQ2xJLFFBQVEsRUFBRSxNQUFNLFVBQVUsYUFBYSw2Q0FBNkM7QUFBQSxJQUNwRixPQUFPLEVBQUUsTUFBTSxVQUFVLGFBQWEscUNBQXFDO0FBQUEsRUFDNUU7QUFBQSxFQUNBLFVBQVUsQ0FBQyxhQUFhLFFBQVE7QUFDakM7QUFFQSxNQUFNLCtCQUE4RDtBQUFBLEVBQ25FLE1BQU07QUFBQSxFQUNOLFlBQVksQ0FBQztBQUNkO0FBRUEsTUFBTSx3QkFBdUQ7QUFBQSxFQUM1RCxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsSUFDWCxTQUFTLEVBQUUsTUFBTSxVQUFVLGFBQWEsNEpBQTRKO0FBQUEsSUFDcE0sUUFBUSxFQUFFLE1BQU0sVUFBVSxhQUFhLDBDQUEwQztBQUFBLElBQ2pGLE9BQU8sRUFBRSxNQUFNLFVBQVUsYUFBYSxtQ0FBbUM7QUFBQSxJQUN6RSxPQUFPLEVBQUUsTUFBTSxVQUFVLGFBQWEsc0VBQXVFO0FBQUEsRUFDOUc7QUFBQSxFQUNBLFVBQVUsQ0FBQyxRQUFRO0FBQ3BCO0FBRUEsTUFBTSwyQkFBMEQ7QUFBQSxFQUMvRCxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsSUFDWCxTQUFTLEVBQUUsTUFBTSxVQUFVLGFBQWEsNkhBQTZIO0FBQUEsRUFDdEs7QUFBQSxFQUNBLFVBQVUsQ0FBQyxTQUFTO0FBQ3JCO0FBRUEsTUFBTSx5QkFBd0Q7QUFBQSxFQUM3RCxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsSUFDWCxTQUFTLEVBQUUsTUFBTSxVQUFVLGFBQWEsaU1BQWlNO0FBQUEsSUFDek8sU0FBUyxFQUFFLE1BQU0sVUFBVSxhQUFhLHVCQUF1QjtBQUFBLEVBQ2hFO0FBQUEsRUFDQSxVQUFVLENBQUMsV0FBVyxTQUFTO0FBQ2hDO0FBRUEsTUFBTSw2QkFBNkIsQ0FBQyxXQUFXLFVBQVUsTUFBTTtBQUUvRCxNQUFNLCtCQUE4RDtBQUFBLEVBQ25FLE1BQU07QUFBQSxFQUNOLFlBQVk7QUFBQSxJQUNYLFNBQVMsRUFBRSxNQUFNLFVBQVUsYUFBYSx5SkFBeUo7QUFBQSxJQUNqTSxRQUFRO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsR0FBRywwQkFBMEI7QUFBQSxNQUNwQyxhQUFhO0FBQUEsSUFDZDtBQUFBLElBQ0EsaUJBQWlCLEVBQUUsTUFBTSxVQUFVLGFBQWEsZ0ZBQWdGO0FBQUEsRUFDakk7QUFBQSxFQUNBLFVBQVUsQ0FBQyxTQUFTO0FBQ3JCO0FBR08sTUFBTSwrQkFBaUQ7QUFBQSxFQUM3RDtBQUFBLElBQ0MsTUFBTSxzQkFBc0I7QUFBQSxJQUM1QixPQUFPO0FBQUEsSUFDUCxhQUFhO0FBQUEsSUFDYixhQUFhO0FBQUEsSUFDYixhQUFhLEVBQUUsY0FBYyxLQUFLO0FBQUEsRUFDbkM7QUFBQSxFQUNBO0FBQUEsSUFDQyxNQUFNLHNCQUFzQjtBQUFBLElBQzVCLE9BQU87QUFBQSxJQUNQLGFBQWE7QUFBQSxJQUNiLGFBQWE7QUFBQSxJQUNiLGFBQWEsRUFBRSxjQUFjLEtBQUs7QUFBQSxFQUNuQztBQUFBLEVBQ0E7QUFBQSxJQUNDLE1BQU0sc0JBQXNCO0FBQUEsSUFDNUIsT0FBTztBQUFBLElBQ1AsYUFBYTtBQUFBLElBQ2IsYUFBYTtBQUFBLElBQ2IsYUFBYSxFQUFFLGNBQWMsTUFBTTtBQUFBLEVBQ3BDO0FBQUEsRUFDQTtBQUFBLElBQ0MsTUFBTSxzQkFBc0I7QUFBQSxJQUM1QixPQUFPO0FBQUEsSUFDUCxhQUFhO0FBQUEsSUFDYixhQUFhO0FBQUEsSUFDYixhQUFhLEVBQUUsY0FBYyxNQUFNO0FBQUEsRUFDcEM7QUFBQSxFQUNBO0FBQUEsSUFDQyxNQUFNLHNCQUFzQjtBQUFBLElBQzVCLE9BQU87QUFBQSxJQUNQLGFBQWE7QUFBQSxJQUNiLGFBQWE7QUFBQSxJQUNiLGFBQWEsRUFBRSxjQUFjLE1BQU07QUFBQSxFQUNwQztBQUFBLEVBQ0E7QUFBQSxJQUNDLE1BQU0sc0JBQXNCO0FBQUEsSUFDNUIsT0FBTztBQUFBLElBQ1AsYUFBYTtBQUFBLElBQ2IsYUFBYTtBQUFBLElBQ2IsYUFBYSxFQUFFLGNBQWMsS0FBSztBQUFBLEVBQ25DO0FBQUEsRUFDQTtBQUFBLElBQ0MsTUFBTSxzQkFBc0I7QUFBQSxJQUM1QixPQUFPO0FBQUEsSUFDUCxhQUFhO0FBQUEsSUFDYixhQUFhO0FBQUEsSUFDYixhQUFhLEVBQUUsY0FBYyxPQUFPLGlCQUFpQixLQUFLO0FBQUEsRUFDM0Q7QUFDRDtBQUdPLFNBQVMsa0JBQWtCLGlCQUFtQztBQUNwRSxRQUFNLFNBQVMsYUFBYSxlQUFlLEtBQUs7QUFDaEQsU0FBTyxJQUFJLE1BQU0sUUFBUSxXQUFXLGVBQWU7QUFDcEQ7QUFpRkEsU0FBUyxrQkFBa0IsT0FBZ0IsT0FBZSxVQUEwQjtBQUNuRixNQUFJLE9BQU8sVUFBVSxZQUFZLE1BQU0sV0FBVyxHQUFHO0FBQ3BELFVBQU0sSUFBSSxNQUFNLFdBQVcsUUFBUSxXQUFXLEtBQUssOEJBQThCO0FBQUEsRUFDbEY7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLGtCQUFrQixPQUFnQixPQUFlLFVBQXNDO0FBQy9GLE1BQUksVUFBVSxRQUFXO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLFVBQVUsWUFBWSxNQUFNLFdBQVcsR0FBRztBQUNwRCxVQUFNLElBQUksTUFBTSxXQUFXLFFBQVEsV0FBVyxLQUFLLDhCQUE4QjtBQUFBLEVBQ2xGO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxrQkFBa0IsV0FBb0M7QUFFOUQsTUFBSSw0QkFBNEIsS0FBSyxTQUFTLEdBQUc7QUFDaEQsV0FBTyxJQUFJLEtBQUssU0FBUztBQUFBLEVBQzFCO0FBQ0EsTUFBSTtBQUNILFVBQU0sU0FBUyxJQUFJLE1BQU0sV0FBVyxJQUFJO0FBQ3hDLFdBQU8sT0FBTyxTQUFTLFNBQVM7QUFBQSxFQUNqQyxRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMsaUJBQWlCLFdBQW1CLFVBQWlEO0FBQzdGLGFBQVcsV0FBVyxVQUFVO0FBQy9CLFVBQU0sUUFBUSxRQUFRLG9CQUFvQixLQUFLLE9BQUssRUFBRSxTQUFTLE1BQU0sYUFBYSxFQUFFLFdBQVcsU0FBUztBQUN4RyxRQUFJLE9BQU87QUFDVixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxRQUFNLFNBQVMsa0JBQWtCLFNBQVM7QUFDMUMsTUFBSSxDQUFDLFFBQVE7QUFDWixVQUFNLElBQUksTUFBTSxXQUFXLHNCQUFzQixhQUFhLHlHQUF5RztBQUFBLEVBQ3hLO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxhQUFhLFdBQStCLFFBQWlFO0FBQ3JILE1BQUksY0FBYyxRQUFXO0FBQzVCLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxRQUFRLE9BQU8sS0FBSyxlQUFhLFVBQVUsT0FBTyxhQUFhLFVBQVUsU0FBUyxTQUFTO0FBQ2pHLE1BQUksQ0FBQyxPQUFPO0FBQ1gsVUFBTSxJQUFJLE1BQU0sV0FBVyxzQkFBc0IsYUFBYSx5REFBeUQ7QUFBQSxFQUN4SDtBQUNBLFNBQU87QUFDUjtBQUdPLFNBQVMscUJBQXFCLFNBQWtCLFVBQTRDLFFBQWdFO0FBQ2xLLFFBQU0sT0FBUSxXQUFXLENBQUM7QUFDMUIsUUFBTSxZQUFZLGtCQUFrQixLQUFLLFdBQVcsYUFBYSxzQkFBc0IsYUFBYTtBQUNwRyxRQUFNLFNBQVMsa0JBQWtCLEtBQUssUUFBUSxVQUFVLHNCQUFzQixhQUFhO0FBQzNGLFFBQU0sWUFBWSxrQkFBa0IsS0FBSyxPQUFPLFNBQVMsc0JBQXNCLGFBQWE7QUFDNUYsU0FBTztBQUFBLElBQ04sV0FBVyxpQkFBaUIsV0FBVyxRQUFRO0FBQUEsSUFDL0M7QUFBQSxJQUNBLE9BQU8sYUFBYSxXQUFXLE1BQU07QUFBQSxFQUN0QztBQUNEO0FBR0EsU0FBUywwQkFBMEIsUUFBaUM7QUFDbkUsUUFBTSxRQUFrQixDQUFDO0FBR3pCLE9BQUssU0FBUyxjQUFjLGlCQUFpQixjQUFjLGFBQWE7QUFDdkUsVUFBTSxLQUFLLGFBQWE7QUFBQSxFQUN6QixXQUFXLFNBQVMsY0FBYyxZQUFZO0FBQzdDLFVBQU0sS0FBSyxZQUFZO0FBQUEsRUFDeEIsV0FBVyxTQUFTLGNBQWMsTUFBTTtBQUN2QyxVQUFNLEtBQUssTUFBTTtBQUFBLEVBQ2xCO0FBQ0EsTUFBSSxTQUFTLGNBQWMsT0FBTztBQUNqQyxVQUFNLEtBQUssT0FBTztBQUFBLEVBQ25CO0FBQ0EsTUFBSSxTQUFTLGNBQWMsWUFBWTtBQUN0QyxVQUFNLEtBQUssVUFBVTtBQUFBLEVBQ3RCO0FBQ0EsU0FBTztBQUNSO0FBTUEsU0FBUywyQkFBMkIsU0FBMEM7QUFDN0UsU0FBTyxRQUFRLFdBQVcsU0FBWSwwQkFBMEIsUUFBUSxNQUFNLElBQUksQ0FBQztBQUNwRjtBQUdBLFNBQVMsc0JBQXNCLFNBQW9EO0FBQ2xGLFFBQU0sUUFBUSwyQkFBMkIsT0FBTztBQUNoRCxNQUFJLE1BQU0sU0FBUyxHQUFHO0FBQ3JCLFdBQU8sTUFBTSxLQUFLLEdBQUc7QUFBQSxFQUN0QjtBQUNBLFNBQU8sUUFBUSxXQUFXLFNBQVksWUFBWTtBQUNuRDtBQW1CQSxTQUFTLG1CQUFtQixPQUFnQixPQUFlLFVBQXVDO0FBQ2pHLE1BQUksVUFBVSxRQUFXO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLFVBQVUsV0FBVztBQUMvQixVQUFNLElBQUksTUFBTSxXQUFXLFFBQVEsV0FBVyxLQUFLLHFCQUFxQjtBQUFBLEVBQ3pFO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxxQkFBcUIsT0FBZ0IsT0FBZSxVQUFzQztBQUNsRyxNQUFJLFVBQVUsUUFBVztBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsVUFBTSxJQUFJLE1BQU0sV0FBVyxRQUFRLFdBQVcsS0FBSyx3Q0FBd0M7QUFBQSxFQUM1RjtBQUNBLFFBQU0sU0FBUyxLQUFLLE1BQU0sS0FBSztBQUMvQixNQUFJLE9BQU8sTUFBTSxNQUFNLEdBQUc7QUFDekIsVUFBTSxJQUFJLE1BQU0sV0FBVyxRQUFRLFdBQVcsS0FBSyxrRUFBa0U7QUFBQSxFQUN0SDtBQUNBLFNBQU87QUFDUjtBQUdPLFNBQVMsb0JBQW9CLFNBQXFDO0FBQ3hFLFFBQU0sT0FBUSxXQUFXLENBQUM7QUFFMUIsTUFBSTtBQUNKLE1BQUksS0FBSyxXQUFXLFFBQVc7QUFDOUIsUUFBSSxDQUFDLE1BQU0sUUFBUSxLQUFLLE1BQU0sS0FBSyxLQUFLLE9BQU8sS0FBSyxXQUFTLE9BQU8sVUFBVSxRQUFRLEdBQUc7QUFDeEYsWUFBTSxJQUFJLE1BQU0sV0FBVyxzQkFBc0IsWUFBWSxrREFBa0Q7QUFBQSxJQUNoSDtBQUNBLFVBQU0sVUFBVyxLQUFLLE9BQW9CLE9BQU8sV0FBUyxDQUFFLHlCQUErQyxTQUFTLEtBQUssQ0FBQztBQUMxSCxRQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3ZCLFlBQU0sSUFBSSxNQUFNLFdBQVcsc0JBQXNCLFlBQVksbUNBQW1DLFFBQVEsS0FBSyxJQUFJLENBQUMsbUJBQW1CLHlCQUF5QixLQUFLLElBQUksQ0FBQyxHQUFHO0FBQUEsSUFDNUs7QUFDQSxhQUFTLElBQUksSUFBSSxLQUFLLE1BQWtCO0FBQUEsRUFDekM7QUFFQSxTQUFPO0FBQUEsSUFDTixTQUFTLGtCQUFrQixLQUFLLFNBQVMsV0FBVyxzQkFBc0IsWUFBWTtBQUFBLElBQ3RGO0FBQUEsSUFDQSxXQUFXLGtCQUFrQixLQUFLLFdBQVcsYUFBYSxzQkFBc0IsWUFBWTtBQUFBLElBQzVGLGFBQWEsbUJBQW1CLEtBQUssYUFBYSxlQUFlLHNCQUFzQixZQUFZO0FBQUEsSUFDbkcsUUFBUSxtQkFBbUIsS0FBSyxRQUFRLFVBQVUsc0JBQXNCLFlBQVk7QUFBQSxJQUNwRixpQkFBaUIsbUJBQW1CLEtBQUssaUJBQWlCLG1CQUFtQixzQkFBc0IsWUFBWTtBQUFBLElBQy9HLGlCQUFpQixtQkFBbUIsS0FBSyxpQkFBaUIsbUJBQW1CLHNCQUFzQixZQUFZO0FBQUEsSUFDL0csY0FBYyxxQkFBcUIsS0FBSyxjQUFjLGdCQUFnQixzQkFBc0IsWUFBWTtBQUFBLElBQ3hHLGVBQWUscUJBQXFCLEtBQUssZUFBZSxpQkFBaUIsc0JBQXNCLFlBQVk7QUFBQSxFQUM1RztBQUNEO0FBR0EsU0FBUyxrQkFBa0IsU0FBeUM7QUFDbkUsUUFBTSxVQUFVLFFBQVE7QUFDeEIsU0FBTyxDQUFDLENBQUMsYUFBYSxRQUFRLFNBQVMsS0FBSyxNQUFNLFFBQVEsYUFBYSxLQUFLLE1BQU0sUUFBUSxhQUFhLEtBQUs7QUFDN0c7QUFFQSxTQUFTLGtCQUFrQixTQUF5QztBQUNuRSxTQUFPLHdCQUF3QixRQUFRLE1BQU07QUFDOUM7QUFPQSxTQUFTLGdCQUFnQixTQUF5QztBQUNqRSxTQUFPLFFBQVEsV0FBVyxVQUFhLENBQUMsb0JBQW9CLFFBQVEsTUFBTTtBQUMzRTtBQUdBLFNBQVMsd0JBQXdCLFNBQWdDLFdBQTRCO0FBQzVGLFFBQU0sT0FBTyxRQUFRO0FBQ3JCLE1BQUksQ0FBQyxRQUFRLEtBQUssV0FBVyxHQUFHO0FBQy9CLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxTQUFTLGtCQUFrQixTQUFTO0FBRzFDLFNBQU8sS0FBSyxLQUFLLFNBQ2hCLElBQUksU0FBUyxNQUFNLGFBQ2hCLElBQUksV0FBVyxhQUNkLENBQUMsQ0FBQyxVQUFVLE9BQU8sU0FBUyxNQUFNLElBQUksU0FBUyxDQUFFO0FBQ3ZEO0FBR08sU0FBUyxlQUFlLFVBQTRDLE1BQTJEO0FBR3JJLE1BQUksS0FBSyxZQUFZLFFBQVc7QUFDL0IsVUFBTSxTQUFTLHdCQUF3QixLQUFLLE9BQU8sR0FBRyxTQUFTLEtBQUssS0FBSztBQUN6RSxXQUFPLFNBQVMsT0FBTyxhQUFXLFFBQVEsUUFBUSxTQUFTLE1BQU0sTUFBTTtBQUFBLEVBQ3hFO0FBQ0EsU0FBTyxTQUFTLE9BQU8sYUFBVztBQUNqQyxRQUFJLEtBQUssUUFBUTtBQUNoQixZQUFNLFFBQVEsMkJBQTJCLE9BQU87QUFDaEQsVUFBSSxDQUFDLE1BQU0sS0FBSyxVQUFRLEtBQUssT0FBUSxJQUFJLElBQUksQ0FBQyxHQUFHO0FBQ2hELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxjQUFjLFVBQWEsQ0FBQyx3QkFBd0IsU0FBUyxLQUFLLFNBQVMsR0FBRztBQUN0RixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxlQUFlLENBQUMsa0JBQWtCLE9BQU8sR0FBRztBQUNwRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxVQUFVLENBQUMsZ0JBQWdCLE9BQU8sR0FBRztBQUM3QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxtQkFBbUIsQ0FBQyx1QkFBdUIsUUFBUSxLQUFLLEdBQUcsZ0JBQWdCO0FBQ25GLGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxLQUFLLG9CQUFvQixRQUFRLENBQUMsS0FBSyxRQUFRLElBQUksVUFBVSxLQUFLLGtCQUFrQixPQUFPLEdBQUc7QUFDakcsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssaUJBQWlCLFVBQWEsUUFBUSxZQUFZLEtBQUssY0FBYztBQUM3RSxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxrQkFBa0IsVUFBYSxRQUFRLFlBQVksS0FBSyxlQUFlO0FBQy9FLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUNGO0FBRUEsU0FBUyxrQkFBa0IsU0FBaUU7QUFDM0YsUUFBTSxNQUFNLG9CQUFvQixRQUFRLEtBQUs7QUFDN0MsTUFBSSxDQUFDLEtBQUs7QUFDVCxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sU0FBdUMsQ0FBQztBQUM5QyxNQUFJLElBQUksZUFBZSxRQUFXO0FBQUUsV0FBTyxTQUFTLElBQUk7QUFBQSxFQUFZO0FBQ3BFLE1BQUksSUFBSSxtQkFBbUIsUUFBVztBQUFFLFdBQU8sYUFBYSxJQUFJO0FBQUEsRUFBZ0I7QUFDaEYsTUFBSSxJQUFJLHVCQUF1QixRQUFXO0FBQUUsV0FBTyxpQkFBaUIsSUFBSTtBQUFBLEVBQW9CO0FBQzVGLE1BQUksSUFBSSxvQkFBb0IsUUFBVztBQUFFLFdBQU8sUUFBUSxJQUFJO0FBQUEsRUFBaUI7QUFDN0UsTUFBSSxJQUFJLG9CQUFvQixRQUFXO0FBQUUsV0FBTyxTQUFTLElBQUk7QUFBQSxFQUFpQjtBQUM5RSxNQUFJLElBQUksdUJBQXVCLFFBQVc7QUFBRSxXQUFPLHFCQUFxQixJQUFJO0FBQUEsRUFBb0I7QUFDaEcsU0FBTyxPQUFPLEtBQUssTUFBTSxFQUFFLFNBQVMsSUFBSSxTQUFTO0FBQ2xEO0FBRUEsU0FBUyxxQkFBcUIsU0FBb0U7QUFDakcsUUFBTSxTQUFTLHVCQUF1QixRQUFRLEtBQUs7QUFDbkQsTUFBSSxDQUFDLFFBQVE7QUFDWixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sU0FBMEMsQ0FBQztBQUNqRCxNQUFJLE9BQU8sVUFBVSxRQUFXO0FBQUUsV0FBTyxRQUFRLE9BQU87QUFBQSxFQUFPO0FBQy9ELE1BQUksT0FBTyxTQUFTLFFBQVc7QUFBRSxXQUFPLE9BQU8sT0FBTztBQUFBLEVBQU07QUFDNUQsTUFBSSxPQUFPLG1CQUFtQixRQUFXO0FBQUUsV0FBTyxpQkFBaUIsT0FBTztBQUFBLEVBQWdCO0FBQzFGLFNBQU8sT0FBTyxLQUFLLE1BQU0sRUFBRSxTQUFTLElBQUksU0FBUztBQUNsRDtBQUVBLFNBQVMsaUJBQWlCLFNBQW9EO0FBQzdFLFFBQU0sTUFBTSxrQkFBa0IsT0FBTztBQUNyQyxRQUFNLFNBQVMscUJBQXFCLE9BQU87QUFDM0MsUUFBTSxTQUFTLHNCQUFzQixPQUFPO0FBQzVDLFNBQU87QUFBQSxJQUNOLFNBQVMsUUFBUSxRQUFRLFNBQVM7QUFBQSxJQUNsQyxHQUFJLFFBQVEsWUFBWSxTQUFZLEVBQUUsT0FBTyxRQUFRLFFBQVEsSUFBSSxDQUFDO0FBQUEsSUFDbEUsR0FBSSxXQUFXLFNBQVksRUFBRSxPQUFPLElBQUksQ0FBQztBQUFBLElBQ3pDLEdBQUksUUFBUSxhQUFhLFNBQVksRUFBRSxVQUFVLFFBQVEsU0FBUyxJQUFJLENBQUM7QUFBQSxJQUN2RSxHQUFJLFFBQVEscUJBQXFCLENBQUMsTUFBTSxTQUFZLEVBQUUsa0JBQWtCLFFBQVEsbUJBQW1CLENBQUMsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDO0FBQUEsSUFDdEgsR0FBSSxRQUFRLFlBQVksU0FBWSxFQUFFLFNBQVMsUUFBUSxRQUFRLFlBQVksSUFBSSxDQUFDO0FBQUEsSUFDaEYsR0FBSSxnQkFBZ0IsT0FBTyxJQUFJLEVBQUUsUUFBUSxLQUFLLElBQUksQ0FBQztBQUFBLElBQ25ELEdBQUksUUFBUSxZQUFZLElBQUksRUFBRSxXQUFXLElBQUksS0FBSyxRQUFRLFNBQVMsRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDO0FBQUEsSUFDeEYsR0FBSSxRQUFRLGVBQWUsSUFBSSxFQUFFLFlBQVksSUFBSSxLQUFLLFFBQVEsWUFBWSxFQUFFLFlBQVksRUFBRSxJQUFJLENBQUM7QUFBQSxJQUMvRixHQUFJLFFBQVEsWUFBWSxTQUFZLEVBQUUsU0FBUyxRQUFRLFFBQVEsSUFBSSxDQUFDO0FBQUEsSUFDcEUsR0FBSSxRQUFRLGVBQWUsU0FBWTtBQUFBLE1BQ3RDLFlBQVksUUFBUSxXQUFXLElBQUksZ0JBQWM7QUFBQSxRQUNoRCxPQUFPLFVBQVU7QUFBQSxRQUNqQixZQUFZLFVBQVU7QUFBQSxRQUN0QixhQUFhLFVBQVU7QUFBQSxRQUN2QixHQUFJLFVBQVUsZ0JBQWdCLFNBQVksRUFBRSxhQUFhLFVBQVUsWUFBWSxJQUFJLENBQUM7QUFBQSxNQUNyRixFQUFFO0FBQUEsSUFDSCxJQUFJLENBQUM7QUFBQSxJQUNMLEdBQUksUUFBUSxTQUFZLEVBQUUsSUFBSSxJQUFJLENBQUM7QUFBQSxJQUNuQyxHQUFJLFdBQVcsU0FBWSxFQUFFLE9BQU8sSUFBSSxDQUFDO0FBQUEsRUFDMUM7QUFDRDtBQUdPLFNBQVMsa0JBQWtCLFVBQW9EO0FBQ3JGLFNBQU8sS0FBSyxVQUFVLEVBQUUsVUFBVSxTQUFTLElBQUksZ0JBQWdCLEVBQUUsQ0FBQztBQUNuRTtBQWVBLGVBQXNCLHVCQUF1QixVQUFzQyxTQUFrQixnQkFBcUQ7QUFDekosUUFBTSxjQUFjLGlCQUFpQixTQUFTLHFCQUFxQixjQUFjLElBQUk7QUFDckYsTUFBSSxlQUFlLHNCQUFzQjtBQUN4QyxVQUFNLElBQUksTUFBTSwwRUFBMEUsb0JBQW9CLHNDQUFzQyxXQUFXLGlCQUFpQjtBQUFBLEVBQ2pMO0FBQ0EsUUFBTSxXQUFXLE1BQU0sU0FBUyxhQUFhO0FBQzdDLFFBQU0sT0FBTyxxQkFBcUIsU0FBUyxVQUFVLFNBQVMsVUFBVSxDQUFDO0FBQ3pFLFFBQU0sU0FBb0M7QUFBQSxJQUN6QyxvQkFBb0IsS0FBSyxZQUFZLENBQUMsS0FBSyxTQUFTLElBQUk7QUFBQSxJQUN4RCxHQUFJLEtBQUssVUFBVSxTQUFZLEVBQUUsVUFBVSxLQUFLLE1BQU0sVUFBVSxPQUFPLEVBQUUsSUFBSSxLQUFLLE1BQU0sR0FBRyxFQUFFLElBQUksQ0FBQztBQUFBLEVBQ25HO0FBQ0EsUUFBTSxVQUFVLE1BQU0sU0FBUyxjQUFjLE1BQU07QUFDbkQsV0FBUyxxQkFBcUIsU0FBUyxjQUFjLENBQUM7QUFDdEQsUUFBTSxPQUFPLElBQUksTUFBTSxvQkFBb0IsT0FBTyxDQUFDO0FBQ25ELFFBQU0sU0FBUyxZQUFZLFNBQVMsTUFBTSxLQUFLLE1BQU07QUFDckQsU0FBTyxFQUFFLFNBQVMsUUFBUSxTQUFTLEdBQUcsTUFBTSxLQUFLLFNBQVMsR0FBRyxVQUFVLHdCQUF3QixPQUFPLEVBQUU7QUFDekc7QUFRTyxTQUFTLDBCQUEwQixRQUFzQztBQUMvRSxTQUFPLG9CQUFvQixPQUFPLFFBQVE7QUFDM0M7QUFzQkEsU0FBUyxvQkFBb0IsY0FBc0IsVUFBNkQ7QUFFL0csUUFBTSxXQUFXLHdCQUF3QixZQUFZO0FBQ3JELFFBQU0sWUFBWSxVQUFVLFNBQVMsS0FBSztBQUMxQyxRQUFNLFFBQVEsU0FBUyxLQUFLLE9BQUssRUFBRSxRQUFRLFNBQVMsTUFBTSxTQUFTO0FBQ25FLFNBQU8sT0FBTztBQUNmO0FBR0EsU0FBUyxtQkFBbUIsY0FBc0IsVUFBaUQ7QUFDbEcsUUFBTSxVQUFVLG9CQUFvQixjQUFjLFFBQVE7QUFDMUQsTUFBSSxDQUFDLFNBQVM7QUFDYixVQUFNLElBQUksTUFBTSxXQUFXLHNCQUFzQixVQUFVLDRFQUE0RTtBQUFBLEVBQ3hJO0FBQ0EsU0FBTztBQUNSO0FBR08sU0FBUyxrQkFBa0IsU0FBa0IsVUFBNEMsUUFBb0MsZ0JBQWlHO0FBQ3BPLFFBQU0sT0FBUSxXQUFXLENBQUM7QUFDMUIsUUFBTSxTQUFTLGtCQUFrQixLQUFLLFFBQVEsVUFBVSxzQkFBc0IsVUFBVTtBQUN4RixRQUFNLFFBQVEsa0JBQWtCLEtBQUssT0FBTyxTQUFTLHNCQUFzQixVQUFVO0FBQ3JGLFFBQU0sWUFBWSxrQkFBa0IsS0FBSyxPQUFPLFNBQVMsc0JBQXNCLFVBQVU7QUFDekYsUUFBTSxRQUFRLGFBQWEsV0FBVyxNQUFNO0FBQzVDLFFBQU0sZUFBZSxrQkFBa0IsS0FBSyxTQUFTLFdBQVcsc0JBQXNCLFVBQVU7QUFDaEcsTUFBSTtBQUNKLE1BQUksaUJBQWlCLFFBQVc7QUFDL0IsY0FBVSxtQkFBbUIsY0FBYyxRQUFRO0FBQUEsRUFDcEQsV0FBVyxnQkFBZ0I7QUFDMUIsY0FBVTtBQUFBLEVBQ1gsT0FBTztBQUNOLFVBQU0sSUFBSSxNQUFNLFdBQVcsc0JBQXNCLFVBQVUsOEVBQThFO0FBQUEsRUFDMUk7QUFDQSxTQUFPLEVBQUUsU0FBUyxRQUFRLEdBQUksVUFBVSxTQUFZLEVBQUUsTUFBTSxJQUFJLENBQUMsR0FBSSxHQUFJLFVBQVUsU0FBWSxFQUFFLE1BQU0sSUFBSSxDQUFDLEVBQUc7QUFDaEg7QUFHQSxlQUFzQixvQkFBb0IsVUFBc0MsU0FBa0IsZ0JBQWtEO0FBQ25KLFFBQU0sV0FBVyxNQUFNLFNBQVMsYUFBYTtBQUM3QyxRQUFNLE9BQU8sa0JBQWtCLFNBQVMsVUFBVSxTQUFTLFVBQVUsR0FBRyxjQUFjO0FBQ3RGLFFBQU0sU0FBUyxhQUFhO0FBQzVCLFFBQU0sT0FBTyxJQUFJLE1BQU0sYUFBYSxLQUFLLFFBQVEsU0FBUyxHQUFHLE1BQU0sQ0FBQztBQUNwRSxRQUFNLFNBQVMsV0FBVyxLQUFLLFNBQVMsTUFBTSxFQUFFLE9BQU8sS0FBSyxPQUFPLE9BQU8sS0FBSyxNQUFNLENBQUM7QUFDdEYsUUFBTSxTQUFTLFlBQVksS0FBSyxTQUFTLE1BQU0sS0FBSyxNQUFNO0FBQzFELFNBQU8sRUFBRSxTQUFTLEtBQUssUUFBUSxTQUFTLEdBQUcsTUFBTSxLQUFLLFNBQVMsR0FBRyxVQUFVLHdCQUF3QixLQUFLLFNBQVMsTUFBTSxFQUFFO0FBQzNIO0FBR08sU0FBUyx1QkFBdUIsUUFBbUM7QUFDekUsU0FBTyxpQkFBaUIsT0FBTyxRQUFRO0FBQ3hDO0FBc0JPLFNBQVMsbUJBQW1CLFNBQWtCLFVBQXNFO0FBQzFILFFBQU0sT0FBUSxXQUFXLENBQUM7QUFDMUIsUUFBTSxVQUFVLGtCQUFrQixLQUFLLFNBQVMsV0FBVyxzQkFBc0IsV0FBVztBQUM1RixRQUFNLGVBQWUsa0JBQWtCLEtBQUssU0FBUyxXQUFXLHNCQUFzQixXQUFXO0FBQ2pHLFFBQU0sVUFBVSxvQkFBb0IsY0FBYyxRQUFRO0FBQzFELE1BQUksQ0FBQyxTQUFTO0FBQ2IsVUFBTSxJQUFJLE1BQU0sV0FBVyxzQkFBc0IsV0FBVyw0RUFBNEU7QUFBQSxFQUN6STtBQUNBLFFBQU0sU0FBUywyQkFBMkIsWUFBWTtBQUN0RCxRQUFNLE9BQU8sSUFBSSxNQUFNLFNBQVMsYUFBYSxRQUFRLFNBQVMsR0FBRyxNQUFNLElBQUksb0JBQW9CLFFBQVEsU0FBUyxDQUFDLENBQUM7QUFDbEgsU0FBTyxFQUFFLFNBQVMsTUFBTSxTQUFTLEdBQUksV0FBVyxTQUFZLEVBQUUsT0FBTyxJQUFJLENBQUMsRUFBRztBQUM5RTtBQU9BLGVBQXNCLHFCQUFxQixVQUFzQyxTQUFrQixnQkFBK0M7QUFDakosUUFBTSxXQUFXLE1BQU0sU0FBUyxhQUFhO0FBQzdDLFFBQU0sRUFBRSxTQUFTLE1BQU0sUUFBUSxRQUFRLElBQUksbUJBQW1CLFNBQVMsUUFBUTtBQUMvRSxNQUFJLGtCQUFrQixLQUFLLFNBQVMsTUFBTSxJQUFJLE1BQU0sY0FBYyxFQUFFLFNBQVMsR0FBRztBQUMvRSxVQUFNLElBQUksTUFBTSxXQUFXLHNCQUFzQixXQUFXLHlEQUF5RDtBQUFBLEVBQ3RIO0FBQ0EsUUFBTSxTQUFTLFlBQVksU0FBUyxNQUFNLE9BQU87QUFDakQsU0FBTyx3QkFBd0Isd0JBQXdCLFNBQVMsTUFBTSxDQUFDO0FBQ3hFO0FBR08sU0FBUyx3QkFBd0IsVUFBMEI7QUFDakUsU0FBTyxpQkFBaUIsUUFBUTtBQUNqQztBQU1BLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0scUJBQXFCO0FBRzNCLE1BQU0sY0FBb0c7QUFBQTtBQUFBO0FBQUEsRUFHekcsU0FBUyxFQUFFLE1BQU0sS0FBSyxXQUFXLEtBQUssV0FBVyxFQUFFO0FBQUEsRUFDbkQsUUFBUSxFQUFFLE1BQU0sS0FBSyxXQUFXLEtBQUssV0FBVyxFQUFFO0FBQUEsRUFDbEQsTUFBTSxFQUFFLE1BQU0sS0FBTSxXQUFXLEtBQU0sV0FBVyxJQUFJO0FBQ3JEO0FBZ0JPLFNBQVMsc0JBQXNCLFNBQWtCLFVBQXlFO0FBQ2hJLFFBQU0sT0FBUSxXQUFXLENBQUM7QUFDMUIsUUFBTSxlQUFlLGtCQUFrQixLQUFLLFNBQVMsV0FBVyxzQkFBc0IsaUJBQWlCO0FBQ3ZHLFFBQU0sVUFBVSxvQkFBb0IsY0FBYyxRQUFRO0FBQzFELE1BQUksQ0FBQyxTQUFTO0FBQ2IsVUFBTSxJQUFJLE1BQU0sV0FBVyxzQkFBc0IsaUJBQWlCLDRFQUE0RTtBQUFBLEVBQy9JO0FBQ0EsTUFBSSxTQUErQjtBQUNuQyxNQUFJLEtBQUssV0FBVyxRQUFXO0FBQzlCLFFBQUksT0FBTyxLQUFLLFdBQVcsWUFBWSxDQUFFLDJCQUFpRCxTQUFTLEtBQUssTUFBTSxHQUFHO0FBQ2hILFlBQU0sSUFBSSxNQUFNLFdBQVcsc0JBQXNCLGlCQUFpQixpQ0FBaUMsMkJBQTJCLEtBQUssSUFBSSxDQUFDLEdBQUc7QUFBQSxJQUM1STtBQUNBLGFBQVMsS0FBSztBQUFBLEVBQ2Y7QUFDQSxNQUFJLGtCQUFrQjtBQUN0QixNQUFJLEtBQUssb0JBQW9CLFFBQVc7QUFDdkMsUUFBSSxPQUFPLEtBQUssb0JBQW9CLFlBQVksQ0FBQyxPQUFPLFNBQVMsS0FBSyxlQUFlLEtBQUssS0FBSyxrQkFBa0IsR0FBRztBQUNuSCxZQUFNLElBQUksTUFBTSxXQUFXLHNCQUFzQixpQkFBaUIsb0RBQW9EO0FBQUEsSUFDdkg7QUFDQSxzQkFBa0IsS0FBSyxJQUFJLEtBQUssTUFBTSxLQUFLLGVBQWUsR0FBRyxrQkFBa0I7QUFBQSxFQUNoRjtBQUNBLFFBQU0sU0FBUywyQkFBMkIsWUFBWTtBQUN0RCxTQUFPLEVBQUUsU0FBUyxRQUFRLGlCQUFpQixHQUFJLFdBQVcsU0FBWSxFQUFFLE9BQU8sSUFBSSxDQUFDLEVBQUc7QUFDeEY7QUFHQSxTQUFTLGFBQWEsTUFBYyxLQUFtRDtBQUN0RixRQUFNLFVBQVUsS0FBSyxLQUFLO0FBQzFCLE1BQUksUUFBUSxVQUFVLEtBQUs7QUFDMUIsV0FBTyxFQUFFLE1BQU0sU0FBUyxXQUFXLE1BQU07QUFBQSxFQUMxQztBQUNBLFNBQU8sRUFBRSxNQUFNLEdBQUcsUUFBUSxNQUFNLEdBQUcsS0FBSyxJQUFJLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxVQUFLLFdBQVcsS0FBSztBQUM5RTtBQUdBLFNBQVMsWUFBWSxPQUFpRDtBQUNyRSxTQUFPLE1BQU0sT0FBTyxDQUFDLE1BQXVFLEVBQUUsU0FBUyxpQkFBaUIsUUFBUSxFQUFFLElBQUksT0FBSyxFQUFFLFFBQVE7QUFDdEo7QUFHQSxTQUFTLGdCQUFnQixPQUF3QztBQUNoRSxTQUFPLE1BQU0sT0FBTyxDQUFDLE1BQXVFLEVBQUUsU0FBUyxpQkFBaUIsUUFBUSxFQUFFLElBQUksT0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxLQUFLO0FBQ3JLO0FBR0EsU0FBUyxjQUFjLElBQXVDO0FBQzdELFNBQU8sR0FBRyxXQUFXLGVBQWUsWUFBWSxTQUFZLEdBQUc7QUFDaEU7QUFXQSxTQUFTLGtCQUFrQixPQUF5QztBQUNuRSxVQUFRLE9BQU87QUFBQSxJQUNkLEtBQUssVUFBVTtBQUFVLGFBQU87QUFBQSxJQUNoQyxLQUFLLFVBQVU7QUFBVyxhQUFPO0FBQUEsSUFDakMsS0FBSyxVQUFVO0FBQU8sYUFBTztBQUFBLElBQzdCO0FBQVMsYUFBTztBQUFBLEVBQ2pCO0FBQ0Q7QUFhTyxTQUFTLHdCQUF3QixTQUFjLFFBQTRCLFVBQWdDLFFBQThCLGlCQUFpQztBQUNoTCxRQUFNLE9BQU8sWUFBWSxNQUFNO0FBQy9CLE1BQUksWUFBWTtBQUNoQixRQUFNLFFBQVEsQ0FBQyxNQUFjLFFBQW9DO0FBQ2hFLFFBQUksT0FBTyxLQUFLLENBQUMsTUFBTTtBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sU0FBUyxhQUFhLE1BQU0sR0FBRztBQUNyQyxnQkFBWSxhQUFhLE9BQU87QUFDaEMsV0FBTyxPQUFPLFFBQVE7QUFBQSxFQUN2QjtBQUVBLFFBQU0sVUFDTCxTQUFTLE1BQU0sSUFBSSxRQUFNLEVBQUUsU0FBUyxFQUFFLFNBQVMsT0FBTyxFQUFFLGVBQWUsT0FBTyxFQUFFLE1BQU0sRUFBRTtBQUN6RixNQUFJLFNBQVMsWUFBWTtBQUN4QixZQUFRLEtBQUssRUFBRSxTQUFTLFNBQVMsV0FBVyxTQUFTLE9BQU8sU0FBUyxXQUFXLGVBQWUsT0FBTyxhQUFhLENBQUM7QUFBQSxFQUNySDtBQUNBLE1BQUksUUFBUSxTQUFTLGlCQUFpQjtBQUNyQyxnQkFBWTtBQUFBLEVBQ2I7QUFDQSxRQUFNLGNBQWMsS0FBSyxJQUFJLEdBQUcsUUFBUSxTQUFTLGVBQWU7QUFDaEUsUUFBTSxXQUFXLFFBQVEsTUFBTSxXQUFXO0FBRTFDLFFBQU0sYUFBdUMsU0FBUyxJQUFJLENBQUMsT0FBTyxVQUFrQztBQUNuRyxVQUFNLE9BQU8sTUFBTSxNQUFNLFFBQVEsTUFBTSxLQUFLLElBQUk7QUFDaEQsVUFBTSxZQUFZLE1BQU0sZ0JBQWdCLE1BQU0sS0FBSyxHQUFHLEtBQUssU0FBUztBQUNwRSxVQUFNLFlBQVksWUFBWSxNQUFNLEtBQUs7QUFDekMsUUFBSTtBQUNKLFFBQUksV0FBVyxhQUFhLFVBQVUsU0FBUyxHQUFHO0FBQ2pELDRCQUFzQixVQUFVLElBQUksUUFBTTtBQUN6QyxZQUFJLEtBQUssWUFBWSxHQUFHO0FBQ3ZCLGdCQUFNLFFBQVEsTUFBTSxjQUFjLEVBQUUsS0FBSyxJQUFJLEtBQUssU0FBUztBQUMzRCxpQkFBTyxVQUFVLFNBQVksRUFBRSxNQUFNLEdBQUcsVUFBVSxNQUFNLElBQUksRUFBRSxNQUFNLEdBQUcsU0FBUztBQUFBLFFBQ2pGO0FBQ0EsZUFBTyxHQUFHO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRjtBQUNBLFdBQU87QUFBQSxNQUNOLE1BQU0sY0FBYyxRQUFRO0FBQUEsTUFDNUIsT0FBTyxrQkFBa0IsTUFBTSxLQUFLO0FBQUEsTUFDcEMsR0FBSSxTQUFTLFNBQVksRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLE1BQ3JDLEdBQUksY0FBYyxTQUFZLEVBQUUsVUFBVSxJQUFJLENBQUM7QUFBQSxNQUMvQyxHQUFJLHNCQUFzQixFQUFFLFdBQVcsb0JBQW9CLElBQUksQ0FBQztBQUFBLElBQ2pFO0FBQUEsRUFDRCxDQUFDO0FBRUQsUUFBTSxVQUFxQztBQUFBLElBQzFDLFNBQVMsUUFBUSxTQUFTO0FBQUEsSUFDMUIsVUFBVSx3QkFBd0IsU0FBUyxNQUFNO0FBQUEsSUFDakQ7QUFBQSxJQUNBO0FBQUEsSUFDQSxnQkFBZ0IsU0FBUztBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUNBLFNBQU8sS0FBSyxVQUFVLE9BQU87QUFDOUI7QUFHQSxlQUFzQiwyQkFBMkIsVUFBc0MsU0FBbUM7QUFDekgsUUFBTSxXQUFXLE1BQU0sU0FBUyxhQUFhO0FBQzdDLFFBQU0sRUFBRSxTQUFTLFFBQVEsUUFBUSxnQkFBZ0IsSUFBSSxzQkFBc0IsU0FBUyxRQUFRO0FBQzVGLFFBQU0sV0FBVyxTQUFTLGVBQWUsU0FBUyxNQUFNO0FBQ3hELE1BQUksQ0FBQyxVQUFVO0FBR2QsV0FBTyxLQUFLLFVBQVU7QUFBQSxNQUNyQixTQUFTLFFBQVEsU0FBUztBQUFBLE1BQzFCLFVBQVUsd0JBQXdCLFNBQVMsTUFBTTtBQUFBLE1BQ2pEO0FBQUEsTUFDQSxZQUFZLENBQUM7QUFBQSxNQUNiLGdCQUFnQjtBQUFBLE1BQ2hCLFdBQVc7QUFBQSxJQUNaLENBQXFDO0FBQUEsRUFDdEM7QUFDQSxTQUFPLHdCQUF3QixTQUFTLFFBQVEsVUFBVSxRQUFRLGVBQWU7QUFDbEY7QUFJTyxTQUFTLHdCQUF3QixnQkFBcUIsVUFBb0Q7QUFDaEgsUUFBTSxPQUFPLFNBQVMsS0FBSyxPQUFLLEVBQUUsUUFBUSxTQUFTLE1BQU0sZUFBZSxTQUFTLENBQUM7QUFDbEYsU0FBTyxLQUFLLFVBQVU7QUFBQSxJQUNyQixTQUFTLGVBQWUsU0FBUztBQUFBLElBQ2pDLFVBQVUsd0JBQXdCLGNBQWM7QUFBQSxJQUNoRCxHQUFJLE9BQU8saUJBQWlCLElBQUksSUFBSSxDQUFDO0FBQUEsRUFDdEMsQ0FBQztBQUNGO0FBRUEsU0FBUyx3QkFBd0IsWUFBb0Q7QUFDcEYsTUFBSSxDQUFDLFlBQVk7QUFDaEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJO0FBQ0gsVUFBTSxTQUFTLEtBQUssTUFBTSxVQUFVO0FBQ3BDLFdBQU8sTUFBTSxRQUFRLE9BQU8sUUFBUSxJQUFJLE9BQU8sU0FBUyxTQUFTO0FBQUEsRUFDbEUsUUFBUTtBQUNQLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFXTyxTQUFTLHFCQUFxQixTQUFrQixVQUE0QyxnQkFBMkI7QUFDN0gsUUFBTSxPQUFRLFdBQVcsQ0FBQztBQUMxQixRQUFNLGVBQWUsa0JBQWtCLEtBQUssU0FBUyxXQUFXLHNCQUFzQixhQUFhO0FBQ25HLFFBQU0sVUFBVSxvQkFBb0IsY0FBYyxRQUFRO0FBQzFELE1BQUksQ0FBQyxTQUFTO0FBQ2IsVUFBTSxJQUFJLE1BQU0sV0FBVyxzQkFBc0IsYUFBYSw0RUFBNEU7QUFBQSxFQUMzSTtBQUNBLE1BQUksa0JBQWtCLFFBQVEsU0FBUyxNQUFNLGVBQWUsU0FBUyxHQUFHO0FBQ3ZFLFVBQU0sSUFBSSxNQUFNLFdBQVcsc0JBQXNCLGFBQWEsaURBQWlEO0FBQUEsRUFDaEg7QUFDQSxTQUFPO0FBQ1I7QUFHQSxlQUFzQix1QkFBdUIsVUFBc0MsU0FBa0IsZ0JBQXVDO0FBQzNJLFFBQU0sV0FBVyxNQUFNLFNBQVMsYUFBYTtBQUM3QyxRQUFNLFVBQVUscUJBQXFCLFNBQVMsVUFBVSxjQUFjO0FBQ3RFLFFBQU0sU0FBUyxjQUFjLE9BQU87QUFDcEMsU0FBTyxtQkFBbUIsUUFBUSxTQUFTLENBQUM7QUFDN0M7QUFFQSxTQUFTLHNCQUFzQixVQUFrQixPQUFnQixRQUFtRTtBQUNuSSxVQUFRLFVBQVU7QUFBQSxJQUNqQixLQUFLLHNCQUFzQixjQUFjO0FBQ3hDLFVBQUk7QUFDSixZQUFNLFFBQVEsU0FBUyx3QkFBd0IsT0FBTyxJQUFJLElBQUk7QUFDOUQsVUFBSSxVQUFVLFFBQVc7QUFDeEIsMkJBQW1CLFNBQVMsNkJBQTZCLGtCQUFrQjtBQUFBLE1BQzVFLFdBQVcsVUFBVSxHQUFHO0FBQ3ZCLDJCQUFtQixTQUFTLGlDQUFpQyxtQkFBbUI7QUFBQSxNQUNqRixPQUFPO0FBQ04sMkJBQW1CLFNBQVMsa0NBQWtDLHdCQUF3QixLQUFLO0FBQUEsTUFDNUY7QUFDQSxhQUFPO0FBQUEsUUFDTixhQUFhLFNBQVMseUJBQXlCLGVBQWU7QUFBQSxRQUM5RCxtQkFBbUIsU0FBUywyQkFBMkIsbUJBQW1CO0FBQUEsUUFDMUU7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsS0FBSyxzQkFBc0I7QUFDMUIsYUFBTztBQUFBLFFBQ04sYUFBYSxTQUFTLDBCQUEwQixnQkFBZ0I7QUFBQSxRQUNoRSxtQkFBbUIsU0FBUyw0QkFBNEIsa0JBQWtCO0FBQUEsUUFDMUUsa0JBQWtCLFNBQVMsOEJBQThCLGlCQUFpQjtBQUFBLE1BQzNFO0FBQUEsSUFDRCxLQUFLLHNCQUFzQjtBQUMxQixhQUFPO0FBQUEsUUFDTixhQUFhLFNBQVMsdUJBQXVCLGFBQWE7QUFBQSxRQUMxRCxtQkFBbUIsU0FBUyx5QkFBeUIsZUFBZTtBQUFBLFFBQ3BFLGtCQUFrQixTQUFTLDJCQUEyQixjQUFjO0FBQUEsTUFDckU7QUFBQSxJQUNELEtBQUssc0JBQXNCO0FBQzFCLGFBQU87QUFBQSxRQUNOLGFBQWEsU0FBUyx3QkFBd0IsY0FBYztBQUFBLFFBQzVELG1CQUFtQixTQUFTLDBCQUEwQixpQkFBaUI7QUFBQSxRQUN2RSxrQkFBa0IsU0FBUyw0QkFBNEIsY0FBYztBQUFBLE1BQ3RFO0FBQUEsSUFDRCxLQUFLLHNCQUFzQjtBQUMxQixhQUFPO0FBQUEsUUFDTixhQUFhLFNBQVMsOEJBQThCLHFCQUFxQjtBQUFBLFFBQ3pFLG1CQUFtQixTQUFTLGdDQUFnQyx5QkFBeUI7QUFBQSxRQUNyRixrQkFBa0IsU0FBUyxrQ0FBa0Msc0JBQXNCO0FBQUEsTUFDcEY7QUFBQSxJQUNELEtBQUssc0JBQXNCO0FBQzFCLGFBQU87QUFBQSxRQUNOLGFBQWEsU0FBUyw4QkFBOEIscUJBQXFCO0FBQUEsUUFDekUsbUJBQW1CLFNBQVMsZ0NBQWdDLDBCQUEwQjtBQUFBLFFBQ3RGLGtCQUFrQixTQUFTLGtDQUFrQyx5QkFBeUI7QUFBQSxNQUN2RjtBQUFBLElBQ0QsS0FBSyxzQkFBc0I7QUFDMUIsYUFBTztBQUFBLFFBQ04sYUFBYSxTQUFTLDBCQUEwQixnQkFBZ0I7QUFBQSxRQUNoRSxtQkFBbUIsU0FBUyw0QkFBNEIsa0JBQWtCO0FBQUEsUUFDMUUsa0JBQWtCLFNBQVMsOEJBQThCLGlCQUFpQjtBQUFBLE1BQzNFO0FBQUEsSUFDRDtBQUNDLGFBQU87QUFBQSxFQUNUO0FBQ0Q7QUFXTyxTQUFTLDZCQUE2QixVQUF5RDtBQUNyRyxNQUFJLHNCQUFzQjtBQUMxQixNQUFJLG1CQUFtQjtBQUN2QixNQUFJLG1CQUFtQjtBQUN2QixRQUFNLFFBQTBCO0FBQUEsSUFDL0IsYUFBYTtBQUFBLElBQ2IscUJBQXFCLFVBQTJCO0FBQy9DLGFBQU8sZ0NBQWdDLFFBQVE7QUFBQSxJQUNoRDtBQUFBLElBQ0EsV0FBVyxVQUFrQixNQUFlLFFBQW1FO0FBQzlHLGFBQU8sc0JBQXNCLFVBQVUsTUFBTSxNQUFNO0FBQUEsSUFDcEQ7QUFBQSxJQUNBLE1BQU0sUUFBUSxlQUFzQyxZQUF5QixVQUFrQixTQUFtQztBQUNqSSxVQUFJLENBQUMsVUFBVTtBQUNkLGNBQU0sSUFBSSxNQUFNLHdCQUF3QixRQUFRLCtEQUErRDtBQUFBLE1BQ2hIO0FBQ0EsY0FBUSxVQUFVO0FBQUEsUUFDakIsS0FBSyxzQkFBc0I7QUFDMUIsaUJBQU8sa0JBQWtCLGVBQWUsTUFBTSxTQUFTLGFBQWEsR0FBRyxvQkFBb0IsT0FBTyxDQUFDLENBQUM7QUFBQSxRQUNyRyxLQUFLLHNCQUFzQjtBQUMxQixpQkFBTyx3QkFBd0Isa0JBQWtCLFVBQVUsR0FBRyxNQUFNLFNBQVMsYUFBYSxDQUFDO0FBQUEsUUFDNUYsS0FBSyxzQkFBc0IsZUFBZTtBQUN6QyxjQUFJLHVCQUF1QixvQkFBb0I7QUFDOUMsa0JBQU0sSUFBSSxNQUFNLGdDQUFnQyxrQkFBa0IsOENBQThDO0FBQUEsVUFDakg7QUFDQSxnQkFBTSxTQUFTLE1BQU0sdUJBQXVCLFVBQVUsU0FBUyxrQkFBa0IsVUFBVSxDQUFDO0FBQzVGO0FBQ0EsaUJBQU8sMEJBQTBCLE1BQU07QUFBQSxRQUN4QztBQUFBLFFBQ0EsS0FBSyxzQkFBc0IsWUFBWTtBQUN0QyxjQUFJLG9CQUFvQixpQkFBaUI7QUFDeEMsa0JBQU0sSUFBSSxNQUFNLGdDQUFnQyxlQUFlLDJDQUEyQztBQUFBLFVBQzNHO0FBQ0EsZ0JBQU0sU0FBUyxNQUFNLG9CQUFvQixVQUFVLFNBQVMsa0JBQWtCLFVBQVUsQ0FBQztBQUN6RjtBQUNBLGlCQUFPLHVCQUF1QixNQUFNO0FBQUEsUUFDckM7QUFBQSxRQUNBLEtBQUssc0JBQXNCLGFBQWE7QUFDdkMsY0FBSSxvQkFBb0IsaUJBQWlCO0FBQ3hDLGtCQUFNLElBQUksTUFBTSw4QkFBOEIsZUFBZSw4Q0FBOEM7QUFBQSxVQUM1RztBQUNBLGdCQUFNLFNBQVMsTUFBTSxxQkFBcUIsVUFBVSxTQUFTLFVBQVU7QUFDdkU7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxRQUNBLEtBQUssc0JBQXNCO0FBQzFCLGlCQUFPLDJCQUEyQixVQUFVLE9BQU87QUFBQSxRQUNwRCxLQUFLLHNCQUFzQjtBQUMxQixpQkFBTyx1QkFBdUIsVUFBVSxTQUFTLGtCQUFrQixVQUFVLENBQUM7QUFBQSxRQUMvRTtBQUNDLGdCQUFNLElBQUksTUFBTSxnQ0FBZ0MsUUFBUSxFQUFFO0FBQUEsTUFDNUQ7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFtdCn0K
