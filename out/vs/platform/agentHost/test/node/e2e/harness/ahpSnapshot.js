import { createRequire } from "module";
import { readFileSync, realpathSync, writeFileSync } from "fs";
import { FileAccess } from "../../../../../../base/common/network.js";
import { dirname, win32 } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { scrubUserName } from "./userNameScrub.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, buildDefaultChatUri } from "../../../../common/state/sessionState.js";
const nodeRequire = createRequire(import.meta.url);
const yamlModule = nodeRequire("js-yaml");
const PLACEHOLDER_RE = /^\$\{(?<kind>[a-zA-Z]+)_(?<index>\d+)\}$/;
const AgentHostUpdateAhpSnapshotsEnvVar = "AGENT_HOST_UPDATE_AHP_SNAPSHOTS";
const AgentHostUpdateSnapshotsEnvVar = "AGENT_HOST_UPDATE_SNAPSHOTS";
const UPDATE_AHP_SNAPSHOTS = process.env[AgentHostUpdateAhpSnapshotsEnvVar] === "1";
const UPDATE_ALL_SNAPSHOTS = process.env[AgentHostUpdateSnapshotsEnvVar] === "1";
class AhpSnapshotRecorder {
  constructor() {
    this._messages = [];
    this._roundStarts = [];
  }
  setNormalization(normalization) {
    this._normalization = normalization;
  }
  record(direction, message) {
    this._messages.push({ direction, message });
  }
  beginRound() {
    this._roundStarts.push(this._messages.length);
  }
  clear() {
    this._messages.length = 0;
    this._roundStarts.length = 0;
  }
  serialize(options = {}) {
    const profile = options.profile ?? "protocol";
    const clientRequests = /* @__PURE__ */ new Map();
    const serverRequests = /* @__PURE__ */ new Map();
    const channels = /* @__PURE__ */ new Map();
    const channelCounts = /* @__PURE__ */ new Map();
    const turns = /* @__PURE__ */ new Map();
    const toolCalls = /* @__PURE__ */ new Map();
    const responseParts = /* @__PURE__ */ new Map();
    const roundStarts = this._roundStarts.length > 0 ? this._roundStarts : [0];
    const rounds = roundStarts.map(() => ({ clientToServer: [], serverToClient: [] }));
    let roundIndex = 0;
    for (let messageIndex = 0; messageIndex < this._messages.length; messageIndex++) {
      while (roundIndex + 1 < roundStarts.length && messageIndex >= roundStarts[roundIndex + 1]) {
        roundIndex++;
      }
      const { direction, message } = this._messages[messageIndex];
      let projected;
      if (isMethodMessage(message)) {
        if (message.id !== void 0) {
          (direction === "c2s" ? clientRequests : serverRequests).set(message.id, message.method);
        }
        if (message.method === "root/sessionSummaryChanged" || message.method === "notifications/tools/list_changed") {
          continue;
        }
        if (message.method === "dispatchAction" || message.method === "action") {
          const params = asRecord(message.params);
          const action = params?.action;
          if (action) {
            if (options.ignoredActionTypes?.includes(action.type)) {
              continue;
            }
            if (action.type === ActionType.SessionCustomizationUpdated) {
              continue;
            }
            if (profile === "behavior" && isBehaviorSnapshotNoise(action.type)) {
              continue;
            }
            const channel = typeof params?.channel === "string" ? params.channel : "";
            const projectedAction = projectAction(action, turns, toolCalls, responseParts, channel, profile);
            if (!projectedAction) {
              continue;
            }
            projected = {
              channel: normalizeChannel(params?.channel, channels, channelCounts),
              action: projectedAction
            };
          } else {
            projected = { method: message.method };
          }
        } else {
          projected = { method: message.method };
        }
      } else if (isResponseMessage(message)) {
        const requests = direction === "c2s" ? serverRequests : clientRequests;
        projected = {
          responseTo: requests.get(message.id) ?? `request-${message.id}`,
          ...message.error ? { error: { code: message.error.code, message: message.error.message } } : { result: "success" }
        };
      } else {
        projected = { message: "unparsed" };
      }
      (direction === "c2s" ? rounds[roundIndex].clientToServer : rounds[roundIndex].serverToClient).push(projected);
    }
    for (const round of rounds) {
      round.serverToClient = dropReasoning(round.serverToClient);
      normalizeSnapshotObjects(round.clientToServer, this._normalization);
      normalizeSnapshotObjects(round.serverToClient, this._normalization);
    }
    return serializeFixture({ version: 1, rounds });
  }
}
async function assertRecordedAhpSnapshot(test, client, options) {
  const actual = client.serializeAhpSnapshot(options);
  if (UPDATE_AHP_SNAPSHOTS || UPDATE_ALL_SNAPSHOTS) {
    writeFileSync(snapshotPathForTest(test), actual);
    return;
  }
  await assertSnapshot(actual, { name: "traffic", extension: "ahp.yaml" });
}
class AhpSnapshotScenario {
  constructor(_fixturePath, _fixture) {
    this._fixturePath = _fixturePath;
    this._fixture = _fixture;
  }
  static load(test) {
    const fixturePath = snapshotPathForTest(test);
    return new AhpSnapshotScenario(fixturePath, parseFixture(yamlModule.load(readFileSync(fixturePath, "utf8")), fixturePath));
  }
  get clientId() {
    for (const round of this._fixture.rounds) {
      for (const entry of round.clientToServer) {
        if (entry.action?.type === ActionType.SessionActiveClientSet) {
          return readString(readRecord(entry.action.activeClient, "activeClient"), "clientId");
        }
      }
    }
    throw new Error("[ahp-snapshot] scenario must set an active client so its client id can initialize the session");
  }
  async run(client, sessionUri, options) {
    const bindings = /* @__PURE__ */ new Map([
      ["${session_0}", sessionUri],
      ["${chat_0}", buildDefaultChatUri(sessionUri)]
    ]);
    const seenPrerequisites = /* @__PURE__ */ new Set();
    let clientSeq = 1;
    for (const round of this._fixture.rounds) {
      const notificationsBeforeRound = new Set(client.receivedNotifications());
      client.beginAhpSnapshotRound();
      for (const entry of round.clientToServer) {
        if (!entry.channel || !entry.action) {
          throw new Error("[ahp-snapshot] clientToServer entries must be dispatch actions");
        }
        await bindPrerequisites(client, entry.action, bindings, seenPrerequisites);
        bindGeneratedIdentifiers(entry.action, bindings);
        client.dispatch({
          channel: resolvePlaceholder(entry.channel, bindings),
          clientSeq: clientSeq++,
          action: parseClientAction(resolvePlaceholders(entry.action, bindings))
        });
      }
      await waitForFinalServerMessage(client, round.serverToClient, notificationsBeforeRound, bindings);
    }
    const actual = client.serializeAhpSnapshot(options);
    if (UPDATE_AHP_SNAPSHOTS || UPDATE_ALL_SNAPSHOTS) {
      const actualFixture = parseFixture(yamlModule.load(actual), "recorded AHP traffic");
      if (actualFixture.rounds.length !== this._fixture.rounds.length) {
        throw new Error(`[ahp-snapshot] expected ${this._fixture.rounds.length} recorded rounds, got ${actualFixture.rounds.length}`);
      }
      writeFileSync(this._fixturePath, serializeFixture({
        version: 1,
        rounds: this._fixture.rounds.map((round, index) => ({
          clientToServer: round.clientToServer,
          serverToClient: actualFixture.rounds[index].serverToClient
        }))
      }));
    } else {
      await assertSnapshot(actual, { name: "traffic", extension: "ahp.yaml" });
    }
  }
}
function isMethodMessage(message) {
  return "method" in message && typeof message.method === "string";
}
function isResponseMessage(message) {
  return "id" in message && typeof message.id === "number" && !("method" in message);
}
function asRecord(value) {
  return value !== null && typeof value === "object" ? value : void 0;
}
function normalizeChannel(value, channels, channelCounts) {
  if (typeof value !== "string") {
    return "${channel}";
  }
  const existing = channels.get(value);
  if (existing) {
    return existing;
  }
  let kind = "channel";
  try {
    const scheme = URI.parse(value).scheme;
    if (scheme === "agenthost") {
      return value;
    }
    kind = scheme === "ahp-chat" ? "chat" : scheme.includes("terminal") ? "terminal" : "session";
  } catch {
  }
  const index = channelCounts.get(kind) ?? 0;
  channelCounts.set(kind, index + 1);
  const normalized = `\${${kind}_${index}}`;
  channels.set(value, normalized);
  return normalized;
}
function projectAction(action, turns, toolCalls, responseParts, channel, profile) {
  switch (action.type) {
    case ActionType.SessionActiveClientSet:
      return {
        type: action.type,
        activeClient: {
          clientId: action.activeClient.clientId,
          displayName: action.activeClient.displayName,
          tools: action.activeClient.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
          }))
        }
      };
    case ActionType.ChatTurnStarted:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        message: {
          text: action.message.text,
          origin: { kind: action.message.origin.kind },
          ...action.message.model ? { model: { id: action.message.model.id } } : {}
        }
      };
    case ActionType.ChatResponsePart: {
      if (action.part.kind === ResponsePartKind.Markdown || action.part.kind === ResponsePartKind.Reasoning) {
        const part = { kind: action.part.kind, content: action.part.content };
        responseParts.set(responsePartKey(channel, action.part.id), part);
        return {
          type: action.type,
          turnId: normalizeIdentifier(action.turnId, "turn", turns),
          part
        };
      }
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        part: { kind: action.part.kind }
      };
    }
    case ActionType.ChatDelta: {
      const part = responseParts.get(responsePartKey(channel, action.partId));
      if (part) {
        part.content += action.content;
        return void 0;
      }
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        content: action.content
      };
    }
    case ActionType.ChatToolCallStart:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        toolName: normalizeShellToolName(action.toolName),
        ...profile === "protocol" ? {
          displayName: action.displayName,
          contributor: projectContributor(action.contributor)
        } : {}
      };
    case ActionType.ChatToolCallReady:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        invocationMessage: projectStringOrMarkdown(action.invocationMessage),
        toolInput: action.toolInput,
        confirmed: action.confirmed
      };
    case ActionType.ChatToolCallConfirmed:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        approved: action.approved,
        ...action.approved ? { confirmed: action.confirmed } : { reason: action.reason }
      };
    case ActionType.ChatToolCallComplete:
      return {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        toolCallId: normalizeIdentifier(action.toolCallId, "toolCall", toolCalls),
        result: {
          success: action.result.success,
          ...profile === "protocol" ? {
            pastTenseMessage: projectStringOrMarkdown(action.result.pastTenseMessage),
            content: action.result.content?.map((content) => content.type === ToolResultContentType.Text ? { type: content.type, text: content.text } : { type: content.type })
          } : {}
        }
      };
    case ActionType.ChatError:
      return profile === "behavior" ? {
        type: action.type,
        turnId: normalizeIdentifier(action.turnId, "turn", turns),
        error: {
          errorType: action.error.errorType,
          message: action.error.message
        }
      } : { type: action.type };
    case ActionType.ChatUsage:
    case ActionType.ChatTurnComplete:
      return { type: action.type, turnId: normalizeIdentifier(action.turnId, "turn", turns) };
    default:
      return { type: action.type };
  }
}
function dropReasoning(actions) {
  return actions.filter((entry) => {
    const action = entry.action;
    return action?.type !== ActionType.ChatReasoning && !(action?.type === ActionType.ChatResponsePart && action.part?.kind === ResponsePartKind.Reasoning);
  });
}
function normalizeShellToolName(toolName) {
  const shellToolPlaceholders = {
    bash: "${shell}",
    powershell: "${shell}",
    read_bash: "${read_shell}",
    read_powershell: "${read_shell}",
    write_bash: "${write_shell}",
    write_powershell: "${write_shell}",
    stop_bash: "${stop_shell}",
    stop_powershell: "${stop_shell}",
    bash_shutdown: "${shell_shutdown}",
    powershell_shutdown: "${shell_shutdown}",
    list_bash: "${list_shell}",
    list_powershell: "${list_shell}"
  };
  return shellToolPlaceholders[toolName] ?? toolName;
}
function isBehaviorSnapshotNoise(type) {
  switch (type) {
    case ActionType.SessionChatUpdated:
    case ActionType.SessionServerToolsChanged:
    case ActionType.SessionInputNeededSet:
    case ActionType.SessionInputNeededRemoved:
    case ActionType.SessionCustomizationsChanged:
    case ActionType.SessionChangesetsChanged:
    case ActionType.SessionMetaChanged:
    case ActionType.SessionActivityChanged:
    case ActionType.ChatActivityChanged:
    case ActionType.ChatUsage:
    case ActionType.ChatToolCallDelta:
    case ActionType.ChatToolCallReady:
    case ActionType.ChatToolCallConfirmed:
    case ActionType.ChatToolCallContentChanged:
      return true;
    default:
      return false;
  }
}
function responsePartKey(channel, partId) {
  return `${channel}\0${partId}`;
}
function normalizeIdentifier(value, kind, identifiers) {
  let normalized = identifiers.get(value);
  if (!normalized) {
    normalized = `\${${kind}_${identifiers.size}}`;
    identifiers.set(value, normalized);
  }
  return normalized;
}
function projectContributor(contributor) {
  if (!contributor) {
    return void 0;
  }
  return contributor.kind === ToolCallContributorKind.Client ? { kind: contributor.kind, clientId: contributor.clientId } : { kind: contributor.kind, customizationId: contributor.customizationId };
}
function projectStringOrMarkdown(value) {
  return typeof value === "string" ? value : value.markdown;
}
function normalizeSnapshotObjects(values, normalization) {
  if (!normalization) {
    return;
  }
  for (let index = 0; index < values.length; index++) {
    values[index] = normalizeSnapshotObject(values[index], normalization);
  }
}
function normalizeSnapshotObject(value, normalization) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSnapshotValue(item, normalization));
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = normalizeSnapshotValue(item, normalization);
  }
  return result;
}
function normalizeSnapshotValue(value, normalization) {
  if (typeof value === "string") {
    return normalizeSnapshotText(value, normalization);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSnapshotValue(item, normalization));
  }
  if (value && typeof value === "object") {
    return normalizeSnapshotObject(value, normalization);
  }
  return value;
}
function normalizeSnapshotText(value, normalization) {
  const workDirs = /* @__PURE__ */ new Set([normalization.workingDirectory]);
  try {
    workDirs.add(realpathSync.native(normalization.workingDirectory));
  } catch {
  }
  let normalized = value;
  normalized = normalized.replaceAll("\r\n", "\n").replaceAll("\\r\\n", "\\n");
  for (const workDir of [...workDirs].sort((a, b) => b.length - a.length)) {
    normalized = normalized.replaceAll(JSON.stringify(workDir).slice(1, -1), "${workdir}").replaceAll(workDir, "${workdir}").replaceAll(URI.file(workDir).toString(), "${workdir}");
  }
  normalized = normalized.replaceAll("/private${workdir}", "${workdir}");
  const tempRoots = new Set([...workDirs].flatMap((workDir) => [dirname(workDir), win32.dirname(workDir)]).filter((root) => root !== "."));
  for (const tempRoot of tempRoots) {
    const win32FileUri = win32.isAbsolute(tempRoot) ? `file:///${tempRoot.replaceAll("\\", "/")}` : void 0;
    const rootVariants = /* @__PURE__ */ new Set([
      tempRoot,
      JSON.stringify(tempRoot).slice(1, -1),
      URI.file(tempRoot).toString(),
      ...win32FileUri ? [win32FileUri] : []
    ]);
    for (const rootVariant of [...rootVariants].sort((a, b) => b.length - a.length)) {
      const escapedRoot = escapeRegExpCharacters(rootVariant);
      normalized = normalized.replace(new RegExp(`${escapedRoot}(?:/|\\\\|\\\\\\\\)ahp-coverage-[^\\s\`"')]*`, "g"), "${workdir}");
    }
  }
  normalized = normalized.replaceAll(normalization.homeDirectory, "${homedir}").replaceAll(URI.file(normalization.homeDirectory).toString(), "${homedir}");
  normalized = scrubUserName(normalized, normalization.userName);
  if (!normalized.includes("${temp}")) {
    normalized = normalized.replace(/ahp-coverage-([a-z-]+)-[A-Za-z0-9]{6}/g, "ahp-coverage-$1-${temp}");
  }
  normalized = normalized.replace(/<shellId: \d+/g, "<shellId: ${shellId}");
  return normalized.replace(/^[dlcbps-][rwxStTs-]{9}[+@.]?\s+\d+\s+\S+\s+\S+\s+\d+\s+\w{3}\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4})\s+/gm, "${listing} ");
}
function escapeRegExpCharacters(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function snapshotPathForTest(test) {
  if (!test.file) {
    throw new Error("[ahp-snapshot] current test file is not set");
  }
  const src = URI.joinPath(FileAccess.asFileUri(""), "../src");
  const parts = test.file.split(/[/\\]/g);
  const snapshotsDir = URI.joinPath(src, ...parts.slice(0, -1), "__snapshots__");
  const fileName = `${sanitizeName(test.fullTitle())}.traffic.ahp.yaml`;
  return URI.joinPath(snapshotsDir, fileName).fsPath;
}
function sanitizeName(name) {
  return name.replace(/[^a-z0-9_-]/gi, "_");
}
function parseFixture(value, fixturePath) {
  const fixture = readRecord(value, "fixture");
  if (fixture.version !== 1) {
    throw new Error(`[ahp-snapshot] unsupported fixture version in ${fixturePath}`);
  }
  if (!Array.isArray(fixture.rounds) || fixture.rounds.length === 0) {
    throw new Error(`[ahp-snapshot] rounds must be a non-empty array in ${fixturePath}`);
  }
  return {
    version: 1,
    rounds: fixture.rounds.map((value2, index) => {
      const round = readRecord(value2, `rounds[${index}]`);
      return {
        clientToServer: readEntries(round.clientToServer, `rounds[${index}].clientToServer`),
        serverToClient: readEntries(round.serverToClient, `rounds[${index}].serverToClient`)
      };
    })
  };
}
function serializeFixture(fixture) {
  return yamlModule.dump(fixture, { lineWidth: -1, noRefs: true });
}
function readEntries(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`[ahp-snapshot] ${name} must be an array`);
  }
  return value.map((item, index) => {
    const entry = readRecord(item, `${name}[${index}]`);
    return {
      channel: readOptionalString(entry, "channel"),
      action: entry.action === void 0 ? void 0 : readRecord(entry.action, `${name}[${index}].action`),
      method: readOptionalString(entry, "method")
    };
  });
}
async function bindPrerequisites(client, action, bindings, seenNotifications) {
  const actionType = readString(action, "type");
  if (actionType !== ActionType.ChatToolCallConfirmed) {
    return;
  }
  const notification = await client.waitForNotification((candidate) => {
    if (seenNotifications.has(candidate) || candidate.method !== "action") {
      return false;
    }
    const action2 = candidate.params.action;
    return action2.type === ActionType.ChatToolCallReady || action2.type === ActionType.ChatError;
  }, 9e4);
  seenNotifications.add(notification);
  const readyAction = notification.params.action;
  if (readyAction.type === ActionType.ChatError) {
    const replayError = client.takeReplayError();
    if (replayError) {
      throw replayError;
    }
    throw new Error(`[ahp-snapshot] turn failed before chat/toolCallReady: ${readyAction.error.errorType}: ${readyAction.error.message}`);
  }
  if (readyAction.type !== ActionType.ChatToolCallReady) {
    throw new Error("[ahp-snapshot] expected chat/toolCallReady prerequisite");
  }
  bindFieldPlaceholder(action, "toolCallId", readyAction.toolCallId, bindings);
}
function bindFieldPlaceholder(record, key, actual, bindings) {
  const expected = readString(record, key);
  if (!PLACEHOLDER_RE.test(expected)) {
    if (expected !== actual) {
      throw new Error(`[ahp-snapshot] expected ${key} ${expected}, got ${actual}`);
    }
    return;
  }
  const existing = bindings.get(expected);
  if (existing !== void 0 && existing !== actual) {
    throw new Error(`[ahp-snapshot] ${expected} was already bound to ${existing}, got ${actual}`);
  }
  bindings.set(expected, actual);
}
function bindGeneratedIdentifiers(value, bindings) {
  if (typeof value === "string") {
    const match = PLACEHOLDER_RE.exec(value);
    if (match?.groups?.kind === "turn" && !bindings.has(value)) {
      bindings.set(value, generateUuid());
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      bindGeneratedIdentifiers(item, bindings);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      bindGeneratedIdentifiers(item, bindings);
    }
  }
}
function resolvePlaceholders(value, bindings) {
  if (typeof value === "string") {
    return resolvePlaceholder(value, bindings);
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolvePlaceholders(item, bindings));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolvePlaceholders(item, bindings)]));
  }
  return value;
}
function resolvePlaceholder(value, bindings) {
  if (!PLACEHOLDER_RE.test(value)) {
    return value;
  }
  const resolved = bindings.get(value);
  if (resolved === void 0) {
    throw new Error(`[ahp-snapshot] no value is bound for ${value}`);
  }
  return resolved;
}
function parseClientAction(value) {
  const action = readRecord(value, "action");
  switch (readString(action, "type")) {
    case ActionType.SessionActiveClientSet: {
      const activeClient = readRecord(action.activeClient, "activeClient");
      return {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: readString(activeClient, "clientId"),
          displayName: readOptionalString(activeClient, "displayName"),
          tools: readTools(activeClient.tools)
        }
      };
    }
    case ActionType.ChatTurnStarted: {
      const message = readRecord(action.message, "message");
      const origin = readRecord(message.origin, "message.origin");
      const model = message.model === void 0 ? void 0 : readRecord(message.model, "message.model");
      const originKind = readString(origin, "kind");
      if (originKind !== MessageKind.User) {
        throw new Error(`[ahp-snapshot] client turn origin must be ${MessageKind.User}`);
      }
      return {
        type: ActionType.ChatTurnStarted,
        turnId: readString(action, "turnId"),
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        message: {
          text: readString(message, "text"),
          origin: { kind: MessageKind.User },
          ...model ? { model: { id: readString(model, "id") } } : {}
        }
      };
    }
    case ActionType.ChatToolCallConfirmed:
      if (action.approved !== true || action.confirmed !== ToolCallConfirmationReason.UserAction) {
        throw new Error("[ahp-snapshot] executable tool confirmations currently require user approval");
      }
      return {
        type: ActionType.ChatToolCallConfirmed,
        turnId: readString(action, "turnId"),
        toolCallId: readString(action, "toolCallId"),
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction
      };
    case ActionType.ChatToolCallComplete: {
      const result = readRecord(action.result, "result");
      return {
        type: ActionType.ChatToolCallComplete,
        turnId: readString(action, "turnId"),
        toolCallId: readString(action, "toolCallId"),
        result: {
          success: readBoolean(result, "success"),
          pastTenseMessage: readString(result, "pastTenseMessage"),
          content: readToolResultContent(result.content)
        }
      };
    }
    default:
      throw new Error(`[ahp-snapshot] unsupported executable client action: ${readString(action, "type")}`);
  }
}
function readTools(value) {
  if (!Array.isArray(value)) {
    throw new Error("[ahp-snapshot] activeClient.tools must be an array");
  }
  return value.map((item, index) => {
    const tool = readRecord(item, `tools[${index}]`);
    const inputSchema = tool.inputSchema === void 0 ? void 0 : readRecord(tool.inputSchema, `tools[${index}].inputSchema`);
    if (inputSchema && inputSchema.type !== "object") {
      throw new Error(`[ahp-snapshot] tools[${index}].inputSchema.type must be object`);
    }
    const properties = inputSchema?.properties === void 0 ? void 0 : readObjectProperties(inputSchema.properties, `tools[${index}].inputSchema.properties`);
    const required = inputSchema?.required === void 0 ? void 0 : readStringArray(inputSchema.required, `tools[${index}].inputSchema.required`);
    return {
      name: readString(tool, "name"),
      description: readOptionalString(tool, "description"),
      ...inputSchema ? { inputSchema: { type: "object", properties, required } } : {}
    };
  });
}
function readToolResultContent(value) {
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    throw new Error("[ahp-snapshot] tool result content must be an array");
  }
  return value.map((item, index) => {
    const content = readRecord(item, `result.content[${index}]`);
    if (content.type !== ToolResultContentType.Text) {
      throw new Error(`[ahp-snapshot] unsupported executable tool result content: ${String(content.type)}`);
    }
    return { type: ToolResultContentType.Text, text: readString(content, "text") };
  });
}
function readObjectProperties(value, name) {
  const properties = readRecord(value, name);
  for (const [key, property] of Object.entries(properties)) {
    if (!property || typeof property !== "object") {
      throw new Error(`[ahp-snapshot] ${name}.${key} must be an object`);
    }
  }
  return properties;
}
function readStringArray(value, name) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`[ahp-snapshot] ${name} must be a string array`);
  }
  return value;
}
async function waitForFinalServerMessage(client, entries, seenNotifications, bindings) {
  const finalEntry = entries.at(-1);
  if (!finalEntry) {
    throw new Error("[ahp-snapshot] serverToClient must not be empty");
  }
  const finalActionType = finalEntry.action ? readString(finalEntry.action, "type") : void 0;
  const finalChannel = finalEntry.channel ? resolvePlaceholder(finalEntry.channel, bindings) : void 0;
  const finalTurnIdPlaceholder = finalEntry.action ? readOptionalString(finalEntry.action, "turnId") : void 0;
  const finalTurnId = finalTurnIdPlaceholder ? resolvePlaceholder(finalTurnIdPlaceholder, bindings) : void 0;
  const notification = await client.waitForNotification((candidate) => {
    if (seenNotifications.has(candidate)) {
      return false;
    }
    if (candidate.method === "action") {
      const envelope = candidate.params;
      if (finalChannel && envelope.channel !== finalChannel) {
        return false;
      }
      const action = envelope.action;
      if (action.type === ActionType.ChatError) {
        return finalTurnId === void 0 || action.turnId === finalTurnId;
      }
      return action.type === finalActionType && (finalTurnId === void 0 || action.turnId === finalTurnId);
    }
    return candidate.method === finalEntry.method;
  }, 9e4);
  seenNotifications.add(notification);
  if (notification.method === "action") {
    const action = notification.params.action;
    if (action.type === ActionType.ChatError && finalActionType !== ActionType.ChatError) {
      const replayError = client.takeReplayError();
      if (replayError) {
        throw replayError;
      }
      throw new Error(`[ahp-snapshot] round failed before ${finalActionType}: ${action.error.errorType}: ${action.error.message}`);
    }
  }
}
function readRecord(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`[ahp-snapshot] ${name} must be an object`);
  }
  return value;
}
function readString(record, key) {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`[ahp-snapshot] ${key} must be a string`);
  }
  return value;
}
function readOptionalString(record, key) {
  const value = record[key];
  if (value !== void 0 && typeof value !== "string") {
    throw new Error(`[ahp-snapshot] ${key} must be a string`);
  }
  return value;
}
function readBoolean(record, key) {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`[ahp-snapshot] ${key} must be a boolean`);
  }
  return value;
}
export {
  AgentHostUpdateAhpSnapshotsEnvVar,
  AgentHostUpdateSnapshotsEnvVar,
  AhpSnapshotRecorder,
  AhpSnapshotScenario,
  assertRecordedAhpSnapshot
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL2hhcm5lc3MvYWhwU25hcHNob3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVSZXF1aXJlIH0gZnJvbSAnbW9kdWxlJztcbmltcG9ydCB7IHJlYWRGaWxlU3luYywgcmVhbHBhdGhTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgd2luMzIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBzY3J1YlVzZXJOYW1lIH0gZnJvbSAnLi91c2VyTmFtZVNjcnViLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3NuYXBzaG90LmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUsIHR5cGUgU3RhdGVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBEaXNwYXRjaEFjdGlvblBhcmFtcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFocE5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBidWlsZERlZmF1bHRDaGF0VXJpLCB0eXBlIFN0cmluZ09yTWFya2Rvd24sIHR5cGUgVG9vbENhbGxDb250cmlidXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuXG5jb25zdCBub2RlUmVxdWlyZSA9IGNyZWF0ZVJlcXVpcmUoaW1wb3J0Lm1ldGEudXJsKTtcbmNvbnN0IHlhbWxNb2R1bGUgPSBub2RlUmVxdWlyZSgnanMteWFtbCcpIGFzIHsgbG9hZChpbnB1dDogc3RyaW5nKTogdW5rbm93bjsgZHVtcChvYmo6IHVua25vd24sIG9wdHM/OiB7IGxpbmVXaWR0aD86IG51bWJlcjsgbm9SZWZzPzogYm9vbGVhbiB9KTogc3RyaW5nIH07XG5jb25zdCBQTEFDRUhPTERFUl9SRSA9IC9eXFwkXFx7KD88a2luZD5bYS16QS1aXSspXyg/PGluZGV4PlxcZCspXFx9JC87XG5cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RVcGRhdGVBaHBTbmFwc2hvdHNFbnZWYXIgPSAnQUdFTlRfSE9TVF9VUERBVEVfQUhQX1NOQVBTSE9UUyc7XG5leHBvcnQgY29uc3QgQWdlbnRIb3N0VXBkYXRlU25hcHNob3RzRW52VmFyID0gJ0FHRU5UX0hPU1RfVVBEQVRFX1NOQVBTSE9UUyc7XG5cbmNvbnN0IFVQREFURV9BSFBfU05BUFNIT1RTID0gcHJvY2Vzcy5lbnZbQWdlbnRIb3N0VXBkYXRlQWhwU25hcHNob3RzRW52VmFyXSA9PT0gJzEnO1xuY29uc3QgVVBEQVRFX0FMTF9TTkFQU0hPVFMgPSBwcm9jZXNzLmVudltBZ2VudEhvc3RVcGRhdGVTbmFwc2hvdHNFbnZWYXJdID09PSAnMSc7XG5cbnR5cGUgQWhwU25hcHNob3REaXJlY3Rpb24gPSAnYzJzJyB8ICdzMmMnO1xuXG5pbnRlcmZhY2UgSUNhcHR1cmVkQWhwTWVzc2FnZSB7XG5cdHJlYWRvbmx5IGRpcmVjdGlvbjogQWhwU25hcHNob3REaXJlY3Rpb247XG5cdHJlYWRvbmx5IG1lc3NhZ2U6IG9iamVjdDtcbn1cblxuaW50ZXJmYWNlIElNZXRob2RNZXNzYWdlIHtcblx0cmVhZG9ubHkgbWV0aG9kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlkPzogbnVtYmVyO1xuXHRyZWFkb25seSBwYXJhbXM/OiB1bmtub3duO1xufVxuXG5pbnRlcmZhY2UgSVJlc3BvbnNlTWVzc2FnZSB7XG5cdHJlYWRvbmx5IGlkOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlc3VsdD86IHVua25vd247XG5cdHJlYWRvbmx5IGVycm9yPzoge1xuXHRcdHJlYWRvbmx5IGNvZGU6IG51bWJlcjtcblx0XHRyZWFkb25seSBtZXNzYWdlOiBzdHJpbmc7XG5cdH07XG59XG5cbmludGVyZmFjZSBJQWhwU25hcHNob3RFbnRyeSB7XG5cdHJlYWRvbmx5IGNoYW5uZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFjdGlvbj86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRyZWFkb25seSBtZXRob2Q/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJQWhwU25hcHNob3RSb3VuZCB7XG5cdHJlYWRvbmx5IGNsaWVudFRvU2VydmVyOiByZWFkb25seSBJQWhwU25hcHNob3RFbnRyeVtdO1xuXHRyZWFkb25seSBzZXJ2ZXJUb0NsaWVudDogcmVhZG9ubHkgSUFocFNuYXBzaG90RW50cnlbXTtcbn1cblxuaW50ZXJmYWNlIElBaHBTbmFwc2hvdEZpeHR1cmUge1xuXHRyZWFkb25seSB2ZXJzaW9uOiAxO1xuXHRyZWFkb25seSByb3VuZHM6IHJlYWRvbmx5IElBaHBTbmFwc2hvdFJvdW5kW107XG59XG5cbmludGVyZmFjZSBJQWhwU25hcHNob3RDbGllbnQge1xuXHRiZWdpbkFocFNuYXBzaG90Um91bmQoKTogdm9pZDtcblx0ZGlzcGF0Y2gocGFyYW1zOiBEaXNwYXRjaEFjdGlvblBhcmFtcyk6IHZvaWQ7XG5cdHJlY2VpdmVkTm90aWZpY2F0aW9ucygpOiBBaHBOb3RpZmljYXRpb25bXTtcblx0d2FpdEZvck5vdGlmaWNhdGlvbihwcmVkaWNhdGU6IChub3RpZmljYXRpb246IEFocE5vdGlmaWNhdGlvbikgPT4gYm9vbGVhbiwgdGltZW91dE1zPzogbnVtYmVyKTogUHJvbWlzZTxBaHBOb3RpZmljYXRpb24+O1xuXHRzZXJpYWxpemVBaHBTbmFwc2hvdChvcHRpb25zPzogSUFocFNuYXBzaG90T3B0aW9ucyk6IHN0cmluZztcblx0dGFrZVJlcGxheUVycm9yKCk6IEVycm9yIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBaHBTbmFwc2hvdE9wdGlvbnMge1xuXHRyZWFkb25seSBwcm9maWxlPzogJ3Byb3RvY29sJyB8ICdiZWhhdmlvcic7XG5cdHJlYWRvbmx5IGlnbm9yZWRBY3Rpb25UeXBlcz86IHJlYWRvbmx5IEFjdGlvblR5cGVbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWhwU25hcHNob3ROb3JtYWxpemF0aW9uIHtcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogc3RyaW5nO1xuXHRyZWFkb25seSBob21lRGlyZWN0b3J5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVzZXJOYW1lOiBzdHJpbmc7XG59XG5cbi8qKiBDYXB0dXJlcyBBSFAgd2lyZSBtZXNzYWdlcyBhbmQgc2VyaWFsaXplcyBhIHN0YWJsZSBzZW1hbnRpYyBwcm9qZWN0aW9uIGZvciBzbmFwc2hvdHMuICovXG5leHBvcnQgY2xhc3MgQWhwU25hcHNob3RSZWNvcmRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VzOiBJQ2FwdHVyZWRBaHBNZXNzYWdlW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfcm91bmRTdGFydHM6IG51bWJlcltdID0gW107XG5cdHByaXZhdGUgX25vcm1hbGl6YXRpb246IElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24gfCB1bmRlZmluZWQ7XG5cblx0c2V0Tm9ybWFsaXphdGlvbihub3JtYWxpemF0aW9uOiBJQWhwU25hcHNob3ROb3JtYWxpemF0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fbm9ybWFsaXphdGlvbiA9IG5vcm1hbGl6YXRpb247XG5cdH1cblxuXHRyZWNvcmQoZGlyZWN0aW9uOiBBaHBTbmFwc2hvdERpcmVjdGlvbiwgbWVzc2FnZTogb2JqZWN0KTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZXMucHVzaCh7IGRpcmVjdGlvbiwgbWVzc2FnZSB9KTtcblx0fVxuXG5cdGJlZ2luUm91bmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm91bmRTdGFydHMucHVzaCh0aGlzLl9tZXNzYWdlcy5sZW5ndGgpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVzc2FnZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9yb3VuZFN0YXJ0cy5sZW5ndGggPSAwO1xuXHR9XG5cblx0c2VyaWFsaXplKG9wdGlvbnM6IElBaHBTbmFwc2hvdE9wdGlvbnMgPSB7fSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcHJvZmlsZSA9IG9wdGlvbnMucHJvZmlsZSA/PyAncHJvdG9jb2wnO1xuXHRcdGNvbnN0IGNsaWVudFJlcXVlc3RzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblx0XHRjb25zdCBzZXJ2ZXJSZXF1ZXN0cyA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cdFx0Y29uc3QgY2hhbm5lbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IGNoYW5uZWxDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdGNvbnN0IHR1cm5zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCB0b29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGNvbnN0IHJlc3BvbnNlUGFydHMgPSBuZXcgTWFwPHN0cmluZywgeyBjb250ZW50OiBzdHJpbmcgfT4oKTtcblx0XHRjb25zdCByb3VuZFN0YXJ0cyA9IHRoaXMuX3JvdW5kU3RhcnRzLmxlbmd0aCA+IDAgPyB0aGlzLl9yb3VuZFN0YXJ0cyA6IFswXTtcblx0XHRjb25zdCByb3VuZHMgPSByb3VuZFN0YXJ0cy5tYXAoKCkgPT4gKHsgY2xpZW50VG9TZXJ2ZXI6IFtdIGFzIG9iamVjdFtdLCBzZXJ2ZXJUb0NsaWVudDogW10gYXMgb2JqZWN0W10gfSkpO1xuXHRcdGxldCByb3VuZEluZGV4ID0gMDtcblxuXHRcdGZvciAobGV0IG1lc3NhZ2VJbmRleCA9IDA7IG1lc3NhZ2VJbmRleCA8IHRoaXMuX21lc3NhZ2VzLmxlbmd0aDsgbWVzc2FnZUluZGV4KyspIHtcblx0XHRcdHdoaWxlIChyb3VuZEluZGV4ICsgMSA8IHJvdW5kU3RhcnRzLmxlbmd0aCAmJiBtZXNzYWdlSW5kZXggPj0gcm91bmRTdGFydHNbcm91bmRJbmRleCArIDFdKSB7XG5cdFx0XHRcdHJvdW5kSW5kZXgrKztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgZGlyZWN0aW9uLCBtZXNzYWdlIH0gPSB0aGlzLl9tZXNzYWdlc1ttZXNzYWdlSW5kZXhdO1xuXHRcdFx0bGV0IHByb2plY3RlZDogb2JqZWN0O1xuXHRcdFx0aWYgKGlzTWV0aG9kTWVzc2FnZShtZXNzYWdlKSkge1xuXHRcdFx0XHRpZiAobWVzc2FnZS5pZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0KGRpcmVjdGlvbiA9PT0gJ2MycycgPyBjbGllbnRSZXF1ZXN0cyA6IHNlcnZlclJlcXVlc3RzKS5zZXQobWVzc2FnZS5pZCwgbWVzc2FnZS5tZXRob2QpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIG5vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkIGlzIGxlZ2l0aW1hdGUgYmVoYXZpb3IgKENvcGlsb3QgPj0gMS4wLjcyXG5cdFx0XHRcdC8vIGVtaXRzIHNlc3Npb24udG9vbHNfdXBkYXRlZCksIGJ1dCBpdCBpcyBvbmx5IGZvcndhcmRlZCBmb3IgTUNQIHNlcnZlcnNcblx0XHRcdFx0Ly8gaW4gdGhlIFJlYWR5IHN0YXRlLiBUaGUgaGFybmVzcyBydW5zIGFnYWluc3QgdGhlIHJlYWwgaG9tZWRpciwgc28gdGhlXG5cdFx0XHRcdC8vIG5vdGlmaWNhdGlvbiBhcHBlYXJzIHdoZW4gdGhlIGRldmVsb3BlcidzIH4vLmNvcGlsb3QgY29uZmlndXJlcyBNQ1Bcblx0XHRcdFx0Ly8gc2VydmVycyBhbmQgaXMgYWJzZW50IG9uIGNsZWFuIENJIHJ1bm5lcnMgXHUyMDE0IGl0IGNhbm5vdCBsaXZlIGluIGFcblx0XHRcdFx0Ly8gbWFjaGluZS1pbmRlcGVuZGVudCBzbmFwc2hvdC5cblx0XHRcdFx0aWYgKG1lc3NhZ2UubWV0aG9kID09PSAncm9vdC9zZXNzaW9uU3VtbWFyeUNoYW5nZWQnIHx8IG1lc3NhZ2UubWV0aG9kID09PSAnbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWQnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1lc3NhZ2UubWV0aG9kID09PSAnZGlzcGF0Y2hBY3Rpb24nIHx8IG1lc3NhZ2UubWV0aG9kID09PSAnYWN0aW9uJykge1xuXHRcdFx0XHRcdGNvbnN0IHBhcmFtcyA9IGFzUmVjb3JkKG1lc3NhZ2UucGFyYW1zKTtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBwYXJhbXM/LmFjdGlvbiBhcyBTdGF0ZUFjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRpZiAob3B0aW9ucy5pZ25vcmVkQWN0aW9uVHlwZXM/LmluY2x1ZGVzKGFjdGlvbi50eXBlKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAocHJvZmlsZSA9PT0gJ2JlaGF2aW9yJyAmJiBpc0JlaGF2aW9yU25hcHNob3ROb2lzZShhY3Rpb24udHlwZSkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBjaGFubmVsID0gdHlwZW9mIHBhcmFtcz8uY2hhbm5lbCA9PT0gJ3N0cmluZycgPyBwYXJhbXMuY2hhbm5lbCA6ICcnO1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvamVjdGVkQWN0aW9uID0gcHJvamVjdEFjdGlvbihhY3Rpb24sIHR1cm5zLCB0b29sQ2FsbHMsIHJlc3BvbnNlUGFydHMsIGNoYW5uZWwsIHByb2ZpbGUpO1xuXHRcdFx0XHRcdFx0aWYgKCFwcm9qZWN0ZWRBY3Rpb24pIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwcm9qZWN0ZWQgPSB7XG5cdFx0XHRcdFx0XHRcdGNoYW5uZWw6IG5vcm1hbGl6ZUNoYW5uZWwocGFyYW1zPy5jaGFubmVsLCBjaGFubmVscywgY2hhbm5lbENvdW50cyksXG5cdFx0XHRcdFx0XHRcdGFjdGlvbjogcHJvamVjdGVkQWN0aW9uLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cHJvamVjdGVkID0geyBtZXRob2Q6IG1lc3NhZ2UubWV0aG9kIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb2plY3RlZCA9IHsgbWV0aG9kOiBtZXNzYWdlLm1ldGhvZCB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGlzUmVzcG9uc2VNZXNzYWdlKG1lc3NhZ2UpKSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RzID0gZGlyZWN0aW9uID09PSAnYzJzJyA/IHNlcnZlclJlcXVlc3RzIDogY2xpZW50UmVxdWVzdHM7XG5cdFx0XHRcdHByb2plY3RlZCA9IHtcblx0XHRcdFx0XHRyZXNwb25zZVRvOiByZXF1ZXN0cy5nZXQobWVzc2FnZS5pZCkgPz8gYHJlcXVlc3QtJHttZXNzYWdlLmlkfWAsXG5cdFx0XHRcdFx0Li4uKG1lc3NhZ2UuZXJyb3IgPyB7IGVycm9yOiB7IGNvZGU6IG1lc3NhZ2UuZXJyb3IuY29kZSwgbWVzc2FnZTogbWVzc2FnZS5lcnJvci5tZXNzYWdlIH0gfSA6IHsgcmVzdWx0OiAnc3VjY2VzcycgfSksXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm9qZWN0ZWQgPSB7IG1lc3NhZ2U6ICd1bnBhcnNlZCcgfTtcblx0XHRcdH1cblxuXHRcdFx0KGRpcmVjdGlvbiA9PT0gJ2MycycgPyByb3VuZHNbcm91bmRJbmRleF0uY2xpZW50VG9TZXJ2ZXIgOiByb3VuZHNbcm91bmRJbmRleF0uc2VydmVyVG9DbGllbnQpLnB1c2gocHJvamVjdGVkKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHJvdW5kIG9mIHJvdW5kcykge1xuXHRcdFx0cm91bmQuc2VydmVyVG9DbGllbnQgPSBkcm9wUmVhc29uaW5nKHJvdW5kLnNlcnZlclRvQ2xpZW50KTtcblx0XHRcdG5vcm1hbGl6ZVNuYXBzaG90T2JqZWN0cyhyb3VuZC5jbGllbnRUb1NlcnZlciwgdGhpcy5fbm9ybWFsaXphdGlvbik7XG5cdFx0XHRub3JtYWxpemVTbmFwc2hvdE9iamVjdHMocm91bmQuc2VydmVyVG9DbGllbnQsIHRoaXMuX25vcm1hbGl6YXRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gc2VyaWFsaXplRml4dHVyZSh7IHZlcnNpb246IDEsIHJvdW5kcyB9KTtcblx0fVxufVxuXG4vKiogUmVjb3JkcyBjb2RlLWRyaXZlbiBBSFAgdHJhZmZpYyBkdXJpbmcgc25hcHNob3QgdXBkYXRlcyBhbmQgYXNzZXJ0cyBpdCBkdXJpbmcgcmVwbGF5LiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFzc2VydFJlY29yZGVkQWhwU25hcHNob3QodGVzdDogTW9jaGEuUnVubmFibGUsIGNsaWVudDogSUFocFNuYXBzaG90Q2xpZW50LCBvcHRpb25zPzogSUFocFNuYXBzaG90T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBhY3R1YWwgPSBjbGllbnQuc2VyaWFsaXplQWhwU25hcHNob3Qob3B0aW9ucyk7XG5cdGlmIChVUERBVEVfQUhQX1NOQVBTSE9UUyB8fCBVUERBVEVfQUxMX1NOQVBTSE9UUykge1xuXHRcdHdyaXRlRmlsZVN5bmMoc25hcHNob3RQYXRoRm9yVGVzdCh0ZXN0KSwgYWN0dWFsKTtcblx0XHRyZXR1cm47XG5cdH1cblx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLCB7IG5hbWU6ICd0cmFmZmljJywgZXh0ZW5zaW9uOiAnYWhwLnlhbWwnIH0pO1xufVxuXG4vKiogTG9hZHMgY2xpZW50IGFjdGlvbnMgZnJvbSBhbiBBSFAgc25hcHNob3QsIGRpc3BhdGNoZXMgdGhlbSwgYW5kIGFzc2VydHMgdGhlIHJlc3VsdGluZyB0cmFmZmljLiAqL1xuZXhwb3J0IGNsYXNzIEFocFNuYXBzaG90U2NlbmFyaW8ge1xuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZpeHR1cmVQYXRoOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZml4dHVyZTogSUFocFNuYXBzaG90Rml4dHVyZSxcblx0KSB7IH1cblxuXHRzdGF0aWMgbG9hZCh0ZXN0OiBNb2NoYS5SdW5uYWJsZSk6IEFocFNuYXBzaG90U2NlbmFyaW8ge1xuXHRcdGNvbnN0IGZpeHR1cmVQYXRoID0gc25hcHNob3RQYXRoRm9yVGVzdCh0ZXN0KTtcblx0XHRyZXR1cm4gbmV3IEFocFNuYXBzaG90U2NlbmFyaW8oZml4dHVyZVBhdGgsIHBhcnNlRml4dHVyZSh5YW1sTW9kdWxlLmxvYWQocmVhZEZpbGVTeW5jKGZpeHR1cmVQYXRoLCAndXRmOCcpKSwgZml4dHVyZVBhdGgpKTtcblx0fVxuXG5cdGdldCBjbGllbnRJZCgpOiBzdHJpbmcge1xuXHRcdGZvciAoY29uc3Qgcm91bmQgb2YgdGhpcy5fZml4dHVyZS5yb3VuZHMpIHtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2Ygcm91bmQuY2xpZW50VG9TZXJ2ZXIpIHtcblx0XHRcdFx0aWYgKGVudHJ5LmFjdGlvbj8udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlYWRTdHJpbmcocmVhZFJlY29yZChlbnRyeS5hY3Rpb24uYWN0aXZlQ2xpZW50LCAnYWN0aXZlQ2xpZW50JyksICdjbGllbnRJZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignW2FocC1zbmFwc2hvdF0gc2NlbmFyaW8gbXVzdCBzZXQgYW4gYWN0aXZlIGNsaWVudCBzbyBpdHMgY2xpZW50IGlkIGNhbiBpbml0aWFsaXplIHRoZSBzZXNzaW9uJyk7XG5cdH1cblxuXHRhc3luYyBydW4oY2xpZW50OiBJQWhwU25hcHNob3RDbGllbnQsIHNlc3Npb25Vcmk6IHN0cmluZywgb3B0aW9ucz86IElBaHBTbmFwc2hvdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBiaW5kaW5ncyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KFtcblx0XHRcdFsnJHtzZXNzaW9uXzB9Jywgc2Vzc2lvblVyaV0sXG5cdFx0XHRbJyR7Y2hhdF8wfScsIGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSldLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNlZW5QcmVyZXF1aXNpdGVzID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IGNsaWVudFNlcSA9IDE7XG5cblx0XHRmb3IgKGNvbnN0IHJvdW5kIG9mIHRoaXMuX2ZpeHR1cmUucm91bmRzKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zQmVmb3JlUm91bmQgPSBuZXcgU2V0PG9iamVjdD4oY2xpZW50LnJlY2VpdmVkTm90aWZpY2F0aW9ucygpKTtcblx0XHRcdGNsaWVudC5iZWdpbkFocFNuYXBzaG90Um91bmQoKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2Ygcm91bmQuY2xpZW50VG9TZXJ2ZXIpIHtcblx0XHRcdFx0aWYgKCFlbnRyeS5jaGFubmVsIHx8ICFlbnRyeS5hY3Rpb24pIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thaHAtc25hcHNob3RdIGNsaWVudFRvU2VydmVyIGVudHJpZXMgbXVzdCBiZSBkaXNwYXRjaCBhY3Rpb25zJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCBiaW5kUHJlcmVxdWlzaXRlcyhjbGllbnQsIGVudHJ5LmFjdGlvbiwgYmluZGluZ3MsIHNlZW5QcmVyZXF1aXNpdGVzKTtcblx0XHRcdFx0YmluZEdlbmVyYXRlZElkZW50aWZpZXJzKGVudHJ5LmFjdGlvbiwgYmluZGluZ3MpO1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdGNoYW5uZWw6IHJlc29sdmVQbGFjZWhvbGRlcihlbnRyeS5jaGFubmVsLCBiaW5kaW5ncyksXG5cdFx0XHRcdFx0Y2xpZW50U2VxOiBjbGllbnRTZXErKyxcblx0XHRcdFx0XHRhY3Rpb246IHBhcnNlQ2xpZW50QWN0aW9uKHJlc29sdmVQbGFjZWhvbGRlcnMoZW50cnkuYWN0aW9uLCBiaW5kaW5ncykpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHdhaXRGb3JGaW5hbFNlcnZlck1lc3NhZ2UoY2xpZW50LCByb3VuZC5zZXJ2ZXJUb0NsaWVudCwgbm90aWZpY2F0aW9uc0JlZm9yZVJvdW5kLCBiaW5kaW5ncyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0dWFsID0gY2xpZW50LnNlcmlhbGl6ZUFocFNuYXBzaG90KG9wdGlvbnMpO1xuXHRcdGlmIChVUERBVEVfQUhQX1NOQVBTSE9UUyB8fCBVUERBVEVfQUxMX1NOQVBTSE9UUykge1xuXHRcdFx0Y29uc3QgYWN0dWFsRml4dHVyZSA9IHBhcnNlRml4dHVyZSh5YW1sTW9kdWxlLmxvYWQoYWN0dWFsKSwgJ3JlY29yZGVkIEFIUCB0cmFmZmljJyk7XG5cdFx0XHRpZiAoYWN0dWFsRml4dHVyZS5yb3VuZHMubGVuZ3RoICE9PSB0aGlzLl9maXh0dXJlLnJvdW5kcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSBleHBlY3RlZCAke3RoaXMuX2ZpeHR1cmUucm91bmRzLmxlbmd0aH0gcmVjb3JkZWQgcm91bmRzLCBnb3QgJHthY3R1YWxGaXh0dXJlLnJvdW5kcy5sZW5ndGh9YCk7XG5cdFx0XHR9XG5cdFx0XHR3cml0ZUZpbGVTeW5jKHRoaXMuX2ZpeHR1cmVQYXRoLCBzZXJpYWxpemVGaXh0dXJlKHtcblx0XHRcdFx0dmVyc2lvbjogMSxcblx0XHRcdFx0cm91bmRzOiB0aGlzLl9maXh0dXJlLnJvdW5kcy5tYXAoKHJvdW5kLCBpbmRleCkgPT4gKHtcblx0XHRcdFx0XHRjbGllbnRUb1NlcnZlcjogcm91bmQuY2xpZW50VG9TZXJ2ZXIsXG5cdFx0XHRcdFx0c2VydmVyVG9DbGllbnQ6IGFjdHVhbEZpeHR1cmUucm91bmRzW2luZGV4XS5zZXJ2ZXJUb0NsaWVudCxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwsIHsgbmFtZTogJ3RyYWZmaWMnLCBleHRlbnNpb246ICdhaHAueWFtbCcgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzTWV0aG9kTWVzc2FnZShtZXNzYWdlOiBvYmplY3QpOiBtZXNzYWdlIGlzIElNZXRob2RNZXNzYWdlIHtcblx0cmV0dXJuICdtZXRob2QnIGluIG1lc3NhZ2UgJiYgdHlwZW9mIG1lc3NhZ2UubWV0aG9kID09PSAnc3RyaW5nJztcbn1cblxuZnVuY3Rpb24gaXNSZXNwb25zZU1lc3NhZ2UobWVzc2FnZTogb2JqZWN0KTogbWVzc2FnZSBpcyBJUmVzcG9uc2VNZXNzYWdlIHtcblx0cmV0dXJuICdpZCcgaW4gbWVzc2FnZSAmJiB0eXBlb2YgbWVzc2FnZS5pZCA9PT0gJ251bWJlcicgJiYgISgnbWV0aG9kJyBpbiBtZXNzYWdlKTtcbn1cblxuZnVuY3Rpb24gYXNSZWNvcmQodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnID8gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNoYW5uZWwodmFsdWU6IHVua25vd24sIGNoYW5uZWxzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBjaGFubmVsQ291bnRzOiBNYXA8c3RyaW5nLCBudW1iZXI+KTogc3RyaW5nIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gJyR7Y2hhbm5lbH0nO1xuXHR9XG5cblx0Y29uc3QgZXhpc3RpbmcgPSBjaGFubmVscy5nZXQodmFsdWUpO1xuXHRpZiAoZXhpc3RpbmcpIHtcblx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdH1cblxuXHRsZXQga2luZCA9ICdjaGFubmVsJztcblx0dHJ5IHtcblx0XHRjb25zdCBzY2hlbWUgPSBVUkkucGFyc2UodmFsdWUpLnNjaGVtZTtcblx0XHRpZiAoc2NoZW1lID09PSAnYWdlbnRob3N0Jykge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRraW5kID0gc2NoZW1lID09PSAnYWhwLWNoYXQnID8gJ2NoYXQnIDogc2NoZW1lLmluY2x1ZGVzKCd0ZXJtaW5hbCcpID8gJ3Rlcm1pbmFsJyA6ICdzZXNzaW9uJztcblx0fSBjYXRjaCB7XG5cdFx0Ly8gS2VlcCB0aGUgZ2VuZXJpYyBjaGFubmVsIGtpbmQgZm9yIG5vbi1VUkkgdmFsdWVzLlxuXHR9XG5cblx0Y29uc3QgaW5kZXggPSBjaGFubmVsQ291bnRzLmdldChraW5kKSA/PyAwO1xuXHRjaGFubmVsQ291bnRzLnNldChraW5kLCBpbmRleCArIDEpO1xuXHRjb25zdCBub3JtYWxpemVkID0gYFxcJHske2tpbmR9XyR7aW5kZXh9fWA7XG5cdGNoYW5uZWxzLnNldCh2YWx1ZSwgbm9ybWFsaXplZCk7XG5cdHJldHVybiBub3JtYWxpemVkO1xufVxuXG5mdW5jdGlvbiBwcm9qZWN0QWN0aW9uKFxuXHRhY3Rpb246IFN0YXRlQWN0aW9uLFxuXHR0dXJuczogTWFwPHN0cmluZywgc3RyaW5nPixcblx0dG9vbENhbGxzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LFxuXHRyZXNwb25zZVBhcnRzOiBNYXA8c3RyaW5nLCB7IGNvbnRlbnQ6IHN0cmluZyB9Pixcblx0Y2hhbm5lbDogc3RyaW5nLFxuXHRwcm9maWxlOiBOb25OdWxsYWJsZTxJQWhwU25hcHNob3RPcHRpb25zWydwcm9maWxlJ10+LFxuKTogb2JqZWN0IHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDoge1xuXHRcdFx0XHRcdGNsaWVudElkOiBhY3Rpb24uYWN0aXZlQ2xpZW50LmNsaWVudElkLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBhY3Rpb24uYWN0aXZlQ2xpZW50LmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdHRvb2xzOiBhY3Rpb24uYWN0aXZlQ2xpZW50LnRvb2xzLm1hcCh0b29sID0+ICh7XG5cdFx0XHRcdFx0XHRuYW1lOiB0b29sLm5hbWUsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdG9vbC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB0b29sLmlucHV0U2NoZW1hLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IGFjdGlvbi50eXBlLFxuXHRcdFx0XHR0dXJuSWQ6IG5vcm1hbGl6ZUlkZW50aWZpZXIoYWN0aW9uLnR1cm5JZCwgJ3R1cm4nLCB0dXJucyksXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiBhY3Rpb24ubWVzc2FnZS50ZXh0LFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBhY3Rpb24ubWVzc2FnZS5vcmlnaW4ua2luZCB9LFxuXHRcdFx0XHRcdC4uLihhY3Rpb24ubWVzc2FnZS5tb2RlbCA/IHsgbW9kZWw6IHsgaWQ6IGFjdGlvbi5tZXNzYWdlLm1vZGVsLmlkIH0gfSA6IHt9KSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQ6IHtcblx0XHRcdGlmIChhY3Rpb24ucGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duIHx8IGFjdGlvbi5wYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSB7IGtpbmQ6IGFjdGlvbi5wYXJ0LmtpbmQsIGNvbnRlbnQ6IGFjdGlvbi5wYXJ0LmNvbnRlbnQgfTtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0cy5zZXQocmVzcG9uc2VQYXJ0S2V5KGNoYW5uZWwsIGFjdGlvbi5wYXJ0LmlkKSwgcGFydCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHRcdHBhcnQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHRwYXJ0OiB7IGtpbmQ6IGFjdGlvbi5wYXJ0LmtpbmQgfSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0RGVsdGE6IHtcblx0XHRcdGNvbnN0IHBhcnQgPSByZXNwb25zZVBhcnRzLmdldChyZXNwb25zZVBhcnRLZXkoY2hhbm5lbCwgYWN0aW9uLnBhcnRJZCkpO1xuXHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0cGFydC5jb250ZW50ICs9IGFjdGlvbi5jb250ZW50O1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdHR1cm5JZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udHVybklkLCAndHVybicsIHR1cm5zKSxcblx0XHRcdFx0Y29udGVudDogYWN0aW9uLmNvbnRlbnQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0dHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50b29sQ2FsbElkLCAndG9vbENhbGwnLCB0b29sQ2FsbHMpLFxuXHRcdFx0XHR0b29sTmFtZTogbm9ybWFsaXplU2hlbGxUb29sTmFtZShhY3Rpb24udG9vbE5hbWUpLFxuXHRcdFx0XHQuLi4ocHJvZmlsZSA9PT0gJ3Byb3RvY29sJyA/IHtcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogYWN0aW9uLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiBwcm9qZWN0Q29udHJpYnV0b3IoYWN0aW9uLmNvbnRyaWJ1dG9yKSxcblx0XHRcdFx0fSA6IHt9KSxcblx0XHRcdH07XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdHR1cm5JZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udHVybklkLCAndHVybicsIHR1cm5zKSxcblx0XHRcdFx0dG9vbENhbGxJZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udG9vbENhbGxJZCwgJ3Rvb2xDYWxsJywgdG9vbENhbGxzKSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHByb2plY3RTdHJpbmdPck1hcmtkb3duKGFjdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSksXG5cdFx0XHRcdHRvb2xJbnB1dDogYWN0aW9uLnRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWVkOiBhY3Rpb24uY29uZmlybWVkLFxuXHRcdFx0fTtcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdHR1cm5JZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udHVybklkLCAndHVybicsIHR1cm5zKSxcblx0XHRcdFx0dG9vbENhbGxJZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udG9vbENhbGxJZCwgJ3Rvb2xDYWxsJywgdG9vbENhbGxzKSxcblx0XHRcdFx0YXBwcm92ZWQ6IGFjdGlvbi5hcHByb3ZlZCxcblx0XHRcdFx0Li4uKGFjdGlvbi5hcHByb3ZlZCA/IHsgY29uZmlybWVkOiBhY3Rpb24uY29uZmlybWVkIH0gOiB7IHJlYXNvbjogYWN0aW9uLnJlYXNvbiB9KSxcblx0XHRcdH07XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdHR1cm5JZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udHVybklkLCAndHVybicsIHR1cm5zKSxcblx0XHRcdFx0dG9vbENhbGxJZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udG9vbENhbGxJZCwgJ3Rvb2xDYWxsJywgdG9vbENhbGxzKSxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogYWN0aW9uLnJlc3VsdC5zdWNjZXNzLFxuXHRcdFx0XHRcdC4uLihwcm9maWxlID09PSAncHJvdG9jb2wnID8ge1xuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcHJvamVjdFN0cmluZ09yTWFya2Rvd24oYWN0aW9uLnJlc3VsdC5wYXN0VGVuc2VNZXNzYWdlKSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IGFjdGlvbi5yZXN1bHQuY29udGVudD8ubWFwKGNvbnRlbnQgPT4gY29udGVudC50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dFxuXHRcdFx0XHRcdFx0XHQ/IHsgdHlwZTogY29udGVudC50eXBlLCB0ZXh0OiBjb250ZW50LnRleHQgfVxuXHRcdFx0XHRcdFx0XHQ6IHsgdHlwZTogY29udGVudC50eXBlIH0pLFxuXHRcdFx0XHRcdH0gOiB7fSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0RXJyb3I6XG5cdFx0XHRyZXR1cm4gcHJvZmlsZSA9PT0gJ2JlaGF2aW9yJyA/IHtcblx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdHR1cm5JZDogbm9ybWFsaXplSWRlbnRpZmllcihhY3Rpb24udHVybklkLCAndHVybicsIHR1cm5zKSxcblx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRlcnJvclR5cGU6IGFjdGlvbi5lcnJvci5lcnJvclR5cGUsXG5cdFx0XHRcdFx0bWVzc2FnZTogYWN0aW9uLmVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9IDogeyB0eXBlOiBhY3Rpb24udHlwZSB9O1xuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VXNhZ2U6XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGU6XG5cdFx0XHRyZXR1cm4geyB0eXBlOiBhY3Rpb24udHlwZSwgdHVybklkOiBub3JtYWxpemVJZGVudGlmaWVyKGFjdGlvbi50dXJuSWQsICd0dXJuJywgdHVybnMpIH07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB7IHR5cGU6IGFjdGlvbi50eXBlIH07XG5cdH1cbn1cblxuLyoqXG4gKiBEcm9wcyByZWFzb25pbmcgdHJhZmZpYyBmcm9tIHRoZSBzbmFwc2hvdC5cbiAqXG4gKiBSZWFzb25pbmcgY2Fubm90IHN1cnZpdmUgdGhlIGNhcHR1cmUgcm91bmQtdHJpcDogYGNhcGlXaXJlQ29kZWNgIGRyb3BzXG4gKiByZWFzb25pbmcgaXRlbXMgd2hlbiBhZ2dyZWdhdGluZyBhIHJlc3BvbnNlLCBiZWNhdXNlIHRoZWlyIGNvbnRlbnQgaXMgb3BhcXVlXG4gKiBhbmQgcHJvdmlkZXItZW5jcnlwdGVkLiBSZXBsYXkgdGhlcmVmb3JlIHJlYnVpbGRzIHRoZSBzdHJlYW0gZnJvbSBhIGZpeHR1cmVcbiAqIHRoYXQgaGFzIG5vIHJlYXNvbmluZyBpbiBpdCwgYW5kIGFueSByZWFzb25pbmcgdGhlIGxpdmUgcmVjb3JkaW5nIG9ic2VydmVkIFx1MjAxNFxuICogd2hldGhlciBhbiBlbXB0eSBwYXJ0IHRoZSBwcm92aWRlciBvcGVuZWQgYW5kIGNsb3NlZCB3aXRob3V0IGEgZGVsdGEsIG9yIGFcbiAqIHBhcnRpYWwgb25lIGNhcnJ5aW5nIGEgZmV3IGNoYXJhY3RlcnMgXHUyMDE0IGNhbiBuZXZlciBiZSByZXByb2R1Y2VkLlxuICpcbiAqIEtlZXBpbmcgaXQgd291bGQgbWFrZSBhIHNuYXBzaG90IHBlcm1hbmVudGx5IHVucmVwbGF5YWJsZSBkZXBlbmRpbmcgb25cbiAqIHdoZXRoZXIgdGhlIHByb3ZpZGVyIGhhcHBlbmVkIHRvIGVtaXQgcmVhc29uaW5nIGR1cmluZyB0aGUgcmVjb3JkaW5nLCB3aGljaFxuICogc2F5cyBub3RoaW5nIGFib3V0IHRoZSBiZWhhdmlvciB1bmRlciB0ZXN0LlxuICpcbiAqIFJ1bnMgYWZ0ZXIgcHJvamVjdGlvbiBiZWNhdXNlIGBDaGF0RGVsdGFgIGZpbGxzIGluIGEgcGFydCdzIGNvbnRlbnQgYnlcbiAqIG11dGF0aW5nIHRoZSBvYmplY3QgcmVjb3JkZWQgaGVyZSwgc28gdGhlIGZpbmFsIGNvbnRlbnQgaXMgb25seSBrbm93biBvbmNlXG4gKiBldmVyeSBtZXNzYWdlIGhhcyBiZWVuIHByb2plY3RlZC5cbiAqL1xuZnVuY3Rpb24gZHJvcFJlYXNvbmluZyhhY3Rpb25zOiBvYmplY3RbXSk6IG9iamVjdFtdIHtcblx0cmV0dXJuIGFjdGlvbnMuZmlsdGVyKGVudHJ5ID0+IHtcblx0XHRjb25zdCBhY3Rpb24gPSAoZW50cnkgYXMgeyBhY3Rpb24/OiB7IHR5cGU/OiBzdHJpbmc7IHBhcnQ/OiB7IGtpbmQ/OiBzdHJpbmcgfSB9IH0pLmFjdGlvbjtcblx0XHRyZXR1cm4gYWN0aW9uPy50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmdcblx0XHRcdCYmICEoYWN0aW9uPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQgJiYgYWN0aW9uLnBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nKTtcblx0fSk7XG59XG5cbi8qKlxuICogQ29sbGFwc2VzIHRoZSBwbGF0Zm9ybS1zcGVjaWZpYyBDb3BpbG90IHNoZWxsIHRvb2wgbmFtZXMgdG8gc3RhYmxlXG4gKiBwbGFjZWhvbGRlcnMuXG4gKlxuICogVGhlIENvcGlsb3QgQ0xJIG5hbWVzIGl0cyBzaGVsbCB0b29scyBhZnRlciB0aGUgc2hlbGwgaXQgcnVuczogYGJhc2hgIGFuZFxuICogZnJpZW5kcyBvbiBQT1NJWCwgYHBvd2Vyc2hlbGxgIGFuZCBmcmllbmRzIG9uIFdpbmRvd3MuIFRoYXQgbmFtZSByZWFjaGVzIHRoZVxuICogY2xpZW50IHZlcmJhdGltIGluIGBjaGF0L3Rvb2xDYWxsU3RhcnRgLCBzbyBhIHNuYXBzaG90IHJlY29yZGVkIG9uIG1hY09TIG9yXG4gKiBMaW51eCBjYW4gbmV2ZXIgbWF0Y2ggdGhlIHNhbWUgYmVoYXZpb3Igb24gV2luZG93cyBldmVuIHdoZW4gdGhlIHJlY29yZGVkXG4gKiBjb21tYW5kIGl0c2VsZiBpcyBwb3J0YWJsZS5cbiAqXG4gKiBPbmx5IHRoZSBuYW1lcyB0aGF0IGFjdHVhbGx5IHZhcnkgYnkgcGxhdGZvcm0gYXJlIG1hcHBlZC4gQ2xhdWRlJ3MgYEJhc2hgIGFuZFxuICogQ29kZXgncyBgc2hlbGxgIGFyZSBmaXhlZCBzdHJpbmdzIHRoZWlyIFNES3MgdXNlIGV2ZXJ5d2hlcmUsIHNvIHRoZXkgYXJlIGxlZnRcbiAqIGFsb25lIFx1MjAxNCByZXdyaXRpbmcgdGhlbSB3b3VsZCBoaWRlIGEgZ2VudWluZSBwcm92aWRlciBjaGFuZ2UuXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZVNoZWxsVG9vbE5hbWUodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNoZWxsVG9vbFBsYWNlaG9sZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRiYXNoOiAnJHtzaGVsbH0nLCBwb3dlcnNoZWxsOiAnJHtzaGVsbH0nLFxuXHRcdHJlYWRfYmFzaDogJyR7cmVhZF9zaGVsbH0nLCByZWFkX3Bvd2Vyc2hlbGw6ICcke3JlYWRfc2hlbGx9Jyxcblx0XHR3cml0ZV9iYXNoOiAnJHt3cml0ZV9zaGVsbH0nLCB3cml0ZV9wb3dlcnNoZWxsOiAnJHt3cml0ZV9zaGVsbH0nLFxuXHRcdHN0b3BfYmFzaDogJyR7c3RvcF9zaGVsbH0nLCBzdG9wX3Bvd2Vyc2hlbGw6ICcke3N0b3Bfc2hlbGx9Jyxcblx0XHRiYXNoX3NodXRkb3duOiAnJHtzaGVsbF9zaHV0ZG93bn0nLCBwb3dlcnNoZWxsX3NodXRkb3duOiAnJHtzaGVsbF9zaHV0ZG93bn0nLFxuXHRcdGxpc3RfYmFzaDogJyR7bGlzdF9zaGVsbH0nLCBsaXN0X3Bvd2Vyc2hlbGw6ICcke2xpc3Rfc2hlbGx9Jyxcblx0fTtcblx0cmV0dXJuIHNoZWxsVG9vbFBsYWNlaG9sZGVyc1t0b29sTmFtZV0gPz8gdG9vbE5hbWU7XG59XG5cbmZ1bmN0aW9uIGlzQmVoYXZpb3JTbmFwc2hvdE5vaXNlKHR5cGU6IEFjdGlvblR5cGUpOiBib29sZWFuIHtcblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0VXBkYXRlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvblNlcnZlclRvb2xzQ2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbklucHV0TmVlZGVkU2V0OlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRSZW1vdmVkOlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkOlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uQ2hhbmdlc2V0c0NoYW5nZWQ6XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2aXR5Q2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdEFjdGl2aXR5Q2hhbmdlZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFVzYWdlOlxuXHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YTpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHk6XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZDpcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQ6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlc3BvbnNlUGFydEtleShjaGFubmVsOiBzdHJpbmcsIHBhcnRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke2NoYW5uZWx9XFwwJHtwYXJ0SWR9YDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplSWRlbnRpZmllcih2YWx1ZTogc3RyaW5nLCBraW5kOiBzdHJpbmcsIGlkZW50aWZpZXJzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogc3RyaW5nIHtcblx0bGV0IG5vcm1hbGl6ZWQgPSBpZGVudGlmaWVycy5nZXQodmFsdWUpO1xuXHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRub3JtYWxpemVkID0gYFxcJHske2tpbmR9XyR7aWRlbnRpZmllcnMuc2l6ZX19YDtcblx0XHRpZGVudGlmaWVycy5zZXQodmFsdWUsIG5vcm1hbGl6ZWQpO1xuXHR9XG5cdHJldHVybiBub3JtYWxpemVkO1xufVxuXG5mdW5jdGlvbiBwcm9qZWN0Q29udHJpYnV0b3IoY29udHJpYnV0b3I6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQpOiBvYmplY3QgfCB1bmRlZmluZWQge1xuXHRpZiAoIWNvbnRyaWJ1dG9yKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gY29udHJpYnV0b3Iua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50XG5cdFx0PyB7IGtpbmQ6IGNvbnRyaWJ1dG9yLmtpbmQsIGNsaWVudElkOiBjb250cmlidXRvci5jbGllbnRJZCB9XG5cdFx0OiB7IGtpbmQ6IGNvbnRyaWJ1dG9yLmtpbmQsIGN1c3RvbWl6YXRpb25JZDogY29udHJpYnV0b3IuY3VzdG9taXphdGlvbklkIH07XG59XG5cbmZ1bmN0aW9uIHByb2plY3RTdHJpbmdPck1hcmtkb3duKHZhbHVlOiBTdHJpbmdPck1hcmtkb3duKTogc3RyaW5nIHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IHZhbHVlLm1hcmtkb3duO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVTbmFwc2hvdE9iamVjdHModmFsdWVzOiBvYmplY3RbXSwgbm9ybWFsaXphdGlvbjogSUFocFNuYXBzaG90Tm9ybWFsaXphdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRpZiAoIW5vcm1hbGl6YXRpb24pIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHZhbHVlcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHR2YWx1ZXNbaW5kZXhdID0gbm9ybWFsaXplU25hcHNob3RPYmplY3QodmFsdWVzW2luZGV4XSwgbm9ybWFsaXphdGlvbik7XG5cdH1cbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU25hcHNob3RPYmplY3QodmFsdWU6IG9iamVjdCwgbm9ybWFsaXphdGlvbjogSUFocFNuYXBzaG90Tm9ybWFsaXphdGlvbik6IG9iamVjdCB7XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZS5tYXAoaXRlbSA9PiBub3JtYWxpemVTbmFwc2hvdFZhbHVlKGl0ZW0sIG5vcm1hbGl6YXRpb24pKTtcblx0fVxuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdGZvciAoY29uc3QgW2tleSwgaXRlbV0gb2YgT2JqZWN0LmVudHJpZXModmFsdWUpKSB7XG5cdFx0cmVzdWx0W2tleV0gPSBub3JtYWxpemVTbmFwc2hvdFZhbHVlKGl0ZW0sIG5vcm1hbGl6YXRpb24pO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVNuYXBzaG90VmFsdWUodmFsdWU6IHVua25vd24sIG5vcm1hbGl6YXRpb246IElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24pOiB1bmtub3duIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplU25hcHNob3RUZXh0KHZhbHVlLCBub3JtYWxpemF0aW9uKTtcblx0fVxuXHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWUubWFwKGl0ZW0gPT4gbm9ybWFsaXplU25hcHNob3RWYWx1ZShpdGVtLCBub3JtYWxpemF0aW9uKSk7XG5cdH1cblx0aWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplU25hcHNob3RPYmplY3QodmFsdWUsIG5vcm1hbGl6YXRpb24pO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplU25hcHNob3RUZXh0KHZhbHVlOiBzdHJpbmcsIG5vcm1hbGl6YXRpb246IElBaHBTbmFwc2hvdE5vcm1hbGl6YXRpb24pOiBzdHJpbmcge1xuXHRjb25zdCB3b3JrRGlycyA9IG5ldyBTZXQoW25vcm1hbGl6YXRpb24ud29ya2luZ0RpcmVjdG9yeV0pO1xuXHR0cnkge1xuXHRcdHdvcmtEaXJzLmFkZChyZWFscGF0aFN5bmMubmF0aXZlKG5vcm1hbGl6YXRpb24ud29ya2luZ0RpcmVjdG9yeSkpO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBUaGUgd29ya3NwYWNlIGNhbiBiZSBkZWxldGVkIGR1cmluZyB0ZWFyZG93biBhZnRlciB0aGUgdHJhZmZpYyB3YXMgY2FwdHVyZWQuXG5cdH1cblx0bGV0IG5vcm1hbGl6ZWQgPSB2YWx1ZTtcblx0Ly8gTGluZSBlbmRpbmdzIGZpcnN0LCBzbyBldmVyeSBsaW5lLWFuY2hvcmVkIHBhdHRlcm4gYmVsb3cgc2VlcyBMRi1vbmx5XG5cdC8vIHRleHQuIFdpbmRvd3MgcHJvZHVjZXMgQ1JMRiBmb3IgdGhlIHNhbWUgYmVoYXZpb3IgYSBQT1NJWCBob3N0IHJlcG9ydHNcblx0Ly8gd2l0aCBMRiwgd2hpY2ggd291bGQgb3RoZXJ3aXNlIGZhaWwgYSBzbmFwc2hvdCByZWNvcmRlZCBvbiBtYWNPUy9MaW51eFxuXHQvLyBmb3IgYSByZWFzb24gdW5yZWxhdGVkIHRvIHRoZSBiZWhhdmlvciB1bmRlciB0ZXN0LiBUaGUgZXNjYXBlZCBmb3JtIGlzXG5cdC8vIG5vcm1hbGl6ZWQgdG9vIGJlY2F1c2UgdG9vbCBpbnB1dHMgYXJlIG9mdGVuIGVtYmVkZGVkIEpTT04sIHdoZXJlIHRoZVxuXHQvLyBjYXJyaWFnZSByZXR1cm4gc3Vydml2ZXMgYXMgYSBsaXRlcmFsIGBcXHJgIGVzY2FwZSByYXRoZXIgdGhhbiBhIGNvbnRyb2xcblx0Ly8gY2hhcmFjdGVyLlxuXHRub3JtYWxpemVkID0gbm9ybWFsaXplZC5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxuJykucmVwbGFjZUFsbCgnXFxcXHJcXFxcbicsICdcXFxcbicpO1xuXHRmb3IgKGNvbnN0IHdvcmtEaXIgb2YgWy4uLndvcmtEaXJzXS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuXHRcdG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkXG5cdFx0XHQucmVwbGFjZUFsbChKU09OLnN0cmluZ2lmeSh3b3JrRGlyKS5zbGljZSgxLCAtMSksICcke3dvcmtkaXJ9Jylcblx0XHRcdC5yZXBsYWNlQWxsKHdvcmtEaXIsICcke3dvcmtkaXJ9Jylcblx0XHRcdC5yZXBsYWNlQWxsKFVSSS5maWxlKHdvcmtEaXIpLnRvU3RyaW5nKCksICcke3dvcmtkaXJ9Jyk7XG5cdH1cblx0bm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQucmVwbGFjZUFsbCgnL3ByaXZhdGUke3dvcmtkaXJ9JywgJyR7d29ya2Rpcn0nKTtcblx0Y29uc3QgdGVtcFJvb3RzID0gbmV3IFNldChbLi4ud29ya0RpcnNdLmZsYXRNYXAod29ya0RpciA9PiBbZGlybmFtZSh3b3JrRGlyKSwgd2luMzIuZGlybmFtZSh3b3JrRGlyKV0pLmZpbHRlcihyb290ID0+IHJvb3QgIT09ICcuJykpO1xuXHRmb3IgKGNvbnN0IHRlbXBSb290IG9mIHRlbXBSb290cykge1xuXHRcdGNvbnN0IHdpbjMyRmlsZVVyaSA9IHdpbjMyLmlzQWJzb2x1dGUodGVtcFJvb3QpID8gYGZpbGU6Ly8vJHt0ZW1wUm9vdC5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKX1gIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJvb3RWYXJpYW50cyA9IG5ldyBTZXQoW1xuXHRcdFx0dGVtcFJvb3QsXG5cdFx0XHRKU09OLnN0cmluZ2lmeSh0ZW1wUm9vdCkuc2xpY2UoMSwgLTEpLFxuXHRcdFx0VVJJLmZpbGUodGVtcFJvb3QpLnRvU3RyaW5nKCksXG5cdFx0XHQuLi4od2luMzJGaWxlVXJpID8gW3dpbjMyRmlsZVVyaV0gOiBbXSksXG5cdFx0XSk7XG5cdFx0Zm9yIChjb25zdCByb290VmFyaWFudCBvZiBbLi4ucm9vdFZhcmlhbnRzXS5zb3J0KChhLCBiKSA9PiBiLmxlbmd0aCAtIGEubGVuZ3RoKSkge1xuXHRcdFx0Y29uc3QgZXNjYXBlZFJvb3QgPSBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHJvb3RWYXJpYW50KTtcblx0XHRcdG5vcm1hbGl6ZWQgPSBub3JtYWxpemVkLnJlcGxhY2UobmV3IFJlZ0V4cChgJHtlc2NhcGVkUm9vdH0oPzovfFxcXFxcXFxcfFxcXFxcXFxcXFxcXFxcXFwpYWhwLWNvdmVyYWdlLVteXFxcXHNcXGBcIicpXSpgLCAnZycpLCAnJHt3b3JrZGlyfScpO1xuXHRcdH1cblx0fVxuXHRub3JtYWxpemVkID0gbm9ybWFsaXplZFxuXHRcdC5yZXBsYWNlQWxsKG5vcm1hbGl6YXRpb24uaG9tZURpcmVjdG9yeSwgJyR7aG9tZWRpcn0nKVxuXHRcdC5yZXBsYWNlQWxsKFVSSS5maWxlKG5vcm1hbGl6YXRpb24uaG9tZURpcmVjdG9yeSkudG9TdHJpbmcoKSwgJyR7aG9tZWRpcn0nKTtcblx0bm9ybWFsaXplZCA9IHNjcnViVXNlck5hbWUobm9ybWFsaXplZCwgbm9ybWFsaXphdGlvbi51c2VyTmFtZSk7XG5cdGlmICghbm9ybWFsaXplZC5pbmNsdWRlcygnJHt0ZW1wfScpKSB7XG5cdFx0bm9ybWFsaXplZCA9IG5vcm1hbGl6ZWQucmVwbGFjZSgvYWhwLWNvdmVyYWdlLShbYS16LV0rKS1bQS1aYS16MC05XXs2fS9nLCAnYWhwLWNvdmVyYWdlLSQxLSR7dGVtcH0nKTtcblx0fVxuXHRub3JtYWxpemVkID0gbm9ybWFsaXplZC5yZXBsYWNlKC88c2hlbGxJZDogXFxkKy9nLCAnPHNoZWxsSWQ6ICR7c2hlbGxJZH0nKTtcblx0cmV0dXJuIG5vcm1hbGl6ZWQucmVwbGFjZSgvXltkbGNicHMtXVtyd3hTdFRzLV17OX1bK0AuXT9cXHMrXFxkK1xccytcXFMrXFxzK1xcUytcXHMrXFxkK1xccytcXHd7M31cXHMrXFxkezEsMn1cXHMrKD86XFxkezJ9OlxcZHsyfXxcXGR7NH0pXFxzKy9nbSwgJyR7bGlzdGluZ30gJyk7XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVJlZ0V4cENoYXJhY3RlcnModmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpO1xufVxuXG5mdW5jdGlvbiBzbmFwc2hvdFBhdGhGb3JUZXN0KHRlc3Q6IE1vY2hhLlJ1bm5hYmxlKTogc3RyaW5nIHtcblx0aWYgKCF0ZXN0LmZpbGUpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thaHAtc25hcHNob3RdIGN1cnJlbnQgdGVzdCBmaWxlIGlzIG5vdCBzZXQnKTtcblx0fVxuXHRjb25zdCBzcmMgPSBVUkkuam9pblBhdGgoRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLCAnLi4vc3JjJyk7XG5cdGNvbnN0IHBhcnRzID0gdGVzdC5maWxlLnNwbGl0KC9bL1xcXFxdL2cpO1xuXHRjb25zdCBzbmFwc2hvdHNEaXIgPSBVUkkuam9pblBhdGgoc3JjLCAuLi5wYXJ0cy5zbGljZSgwLCAtMSksICdfX3NuYXBzaG90c19fJyk7XG5cdGNvbnN0IGZpbGVOYW1lID0gYCR7c2FuaXRpemVOYW1lKHRlc3QuZnVsbFRpdGxlKCkpfS50cmFmZmljLmFocC55YW1sYDtcblx0cmV0dXJuIFVSSS5qb2luUGF0aChzbmFwc2hvdHNEaXIsIGZpbGVOYW1lKS5mc1BhdGg7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gbmFtZS5yZXBsYWNlKC9bXmEtejAtOV8tXS9naSwgJ18nKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VGaXh0dXJlKHZhbHVlOiB1bmtub3duLCBmaXh0dXJlUGF0aDogc3RyaW5nKTogSUFocFNuYXBzaG90Rml4dHVyZSB7XG5cdGNvbnN0IGZpeHR1cmUgPSByZWFkUmVjb3JkKHZhbHVlLCAnZml4dHVyZScpO1xuXHRpZiAoZml4dHVyZS52ZXJzaW9uICE9PSAxKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSB1bnN1cHBvcnRlZCBmaXh0dXJlIHZlcnNpb24gaW4gJHtmaXh0dXJlUGF0aH1gKTtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkoZml4dHVyZS5yb3VuZHMpIHx8IGZpeHR1cmUucm91bmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gcm91bmRzIG11c3QgYmUgYSBub24tZW1wdHkgYXJyYXkgaW4gJHtmaXh0dXJlUGF0aH1gKTtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHZlcnNpb246IDEsXG5cdFx0cm91bmRzOiBmaXh0dXJlLnJvdW5kcy5tYXAoKHZhbHVlLCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3Qgcm91bmQgPSByZWFkUmVjb3JkKHZhbHVlLCBgcm91bmRzWyR7aW5kZXh9XWApO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2xpZW50VG9TZXJ2ZXI6IHJlYWRFbnRyaWVzKHJvdW5kLmNsaWVudFRvU2VydmVyLCBgcm91bmRzWyR7aW5kZXh9XS5jbGllbnRUb1NlcnZlcmApLFxuXHRcdFx0XHRzZXJ2ZXJUb0NsaWVudDogcmVhZEVudHJpZXMocm91bmQuc2VydmVyVG9DbGllbnQsIGByb3VuZHNbJHtpbmRleH1dLnNlcnZlclRvQ2xpZW50YCksXG5cdFx0XHR9O1xuXHRcdH0pLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVGaXh0dXJlKGZpeHR1cmU6IElBaHBTbmFwc2hvdEZpeHR1cmUpOiBzdHJpbmcge1xuXHRyZXR1cm4geWFtbE1vZHVsZS5kdW1wKGZpeHR1cmUsIHsgbGluZVdpZHRoOiAtMSwgbm9SZWZzOiB0cnVlIH0pO1xufVxuXG5mdW5jdGlvbiByZWFkRW50cmllcyh2YWx1ZTogdW5rbm93biwgbmFtZTogc3RyaW5nKTogSUFocFNuYXBzaG90RW50cnlbXSB7XG5cdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdICR7bmFtZX0gbXVzdCBiZSBhbiBhcnJheWApO1xuXHR9XG5cdHJldHVybiB2YWx1ZS5tYXAoKGl0ZW0sIGluZGV4KSA9PiB7XG5cdFx0Y29uc3QgZW50cnkgPSByZWFkUmVjb3JkKGl0ZW0sIGAke25hbWV9WyR7aW5kZXh9XWApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjaGFubmVsOiByZWFkT3B0aW9uYWxTdHJpbmcoZW50cnksICdjaGFubmVsJyksXG5cdFx0XHRhY3Rpb246IGVudHJ5LmFjdGlvbiA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogcmVhZFJlY29yZChlbnRyeS5hY3Rpb24sIGAke25hbWV9WyR7aW5kZXh9XS5hY3Rpb25gKSxcblx0XHRcdG1ldGhvZDogcmVhZE9wdGlvbmFsU3RyaW5nKGVudHJ5LCAnbWV0aG9kJyksXG5cdFx0fTtcblx0fSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGJpbmRQcmVyZXF1aXNpdGVzKFxuXHRjbGllbnQ6IElBaHBTbmFwc2hvdENsaWVudCxcblx0YWN0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPixcblx0YmluZGluZ3M6IE1hcDxzdHJpbmcsIHN0cmluZz4sXG5cdHNlZW5Ob3RpZmljYXRpb25zOiBTZXQ8b2JqZWN0Pixcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBhY3Rpb25UeXBlID0gcmVhZFN0cmluZyhhY3Rpb24sICd0eXBlJyk7XG5cdGlmIChhY3Rpb25UeXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKGNhbmRpZGF0ZSA9PiB7XG5cdFx0aWYgKHNlZW5Ob3RpZmljYXRpb25zLmhhcyhjYW5kaWRhdGUgYXMgb2JqZWN0KSB8fCBjYW5kaWRhdGUubWV0aG9kICE9PSAnYWN0aW9uJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBhY3Rpb24gPSAoY2FuZGlkYXRlLnBhcmFtcyBhcyBBY3Rpb25FbnZlbG9wZSkuYWN0aW9uO1xuXHRcdHJldHVybiBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSB8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RXJyb3I7XG5cdH0sIDkwXzAwMCk7XG5cdHNlZW5Ob3RpZmljYXRpb25zLmFkZChub3RpZmljYXRpb24gYXMgb2JqZWN0KTtcblxuXHRjb25zdCByZWFkeUFjdGlvbiA9IChub3RpZmljYXRpb24ucGFyYW1zIGFzIEFjdGlvbkVudmVsb3BlKS5hY3Rpb247XG5cdGlmIChyZWFkeUFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvcikge1xuXHRcdGNvbnN0IHJlcGxheUVycm9yID0gY2xpZW50LnRha2VSZXBsYXlFcnJvcigpO1xuXHRcdGlmIChyZXBsYXlFcnJvcikge1xuXHRcdFx0dGhyb3cgcmVwbGF5RXJyb3I7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gdHVybiBmYWlsZWQgYmVmb3JlIGNoYXQvdG9vbENhbGxSZWFkeTogJHtyZWFkeUFjdGlvbi5lcnJvci5lcnJvclR5cGV9OiAke3JlYWR5QWN0aW9uLmVycm9yLm1lc3NhZ2V9YCk7XG5cdH1cblx0aWYgKHJlYWR5QWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thaHAtc25hcHNob3RdIGV4cGVjdGVkIGNoYXQvdG9vbENhbGxSZWFkeSBwcmVyZXF1aXNpdGUnKTtcblx0fVxuXHRiaW5kRmllbGRQbGFjZWhvbGRlcihhY3Rpb24sICd0b29sQ2FsbElkJywgcmVhZHlBY3Rpb24udG9vbENhbGxJZCwgYmluZGluZ3MpO1xufVxuXG5mdW5jdGlvbiBiaW5kRmllbGRQbGFjZWhvbGRlcihyZWNvcmQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBrZXk6IHN0cmluZywgYWN0dWFsOiBzdHJpbmcsIGJpbmRpbmdzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogdm9pZCB7XG5cdGNvbnN0IGV4cGVjdGVkID0gcmVhZFN0cmluZyhyZWNvcmQsIGtleSk7XG5cdGlmICghUExBQ0VIT0xERVJfUkUudGVzdChleHBlY3RlZCkpIHtcblx0XHRpZiAoZXhwZWN0ZWQgIT09IGFjdHVhbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSBleHBlY3RlZCAke2tleX0gJHtleHBlY3RlZH0sIGdvdCAke2FjdHVhbH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IGV4aXN0aW5nID0gYmluZGluZ3MuZ2V0KGV4cGVjdGVkKTtcblx0aWYgKGV4aXN0aW5nICE9PSB1bmRlZmluZWQgJiYgZXhpc3RpbmcgIT09IGFjdHVhbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gJHtleHBlY3RlZH0gd2FzIGFscmVhZHkgYm91bmQgdG8gJHtleGlzdGluZ30sIGdvdCAke2FjdHVhbH1gKTtcblx0fVxuXHRiaW5kaW5ncy5zZXQoZXhwZWN0ZWQsIGFjdHVhbCk7XG59XG5cbmZ1bmN0aW9uIGJpbmRHZW5lcmF0ZWRJZGVudGlmaWVycyh2YWx1ZTogdW5rbm93biwgYmluZGluZ3M6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiB2b2lkIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRjb25zdCBtYXRjaCA9IFBMQUNFSE9MREVSX1JFLmV4ZWModmFsdWUpO1xuXHRcdGlmIChtYXRjaD8uZ3JvdXBzPy5raW5kID09PSAndHVybicgJiYgIWJpbmRpbmdzLmhhcyh2YWx1ZSkpIHtcblx0XHRcdGJpbmRpbmdzLnNldCh2YWx1ZSwgZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHZhbHVlKSB7XG5cdFx0XHRiaW5kR2VuZXJhdGVkSWRlbnRpZmllcnMoaXRlbSwgYmluZGluZ3MpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgT2JqZWN0LnZhbHVlcyh2YWx1ZSkpIHtcblx0XHRcdGJpbmRHZW5lcmF0ZWRJZGVudGlmaWVycyhpdGVtLCBiaW5kaW5ncyk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVQbGFjZWhvbGRlcnModmFsdWU6IHVua25vd24sIGJpbmRpbmdzOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogdW5rbm93biB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHJlc29sdmVQbGFjZWhvbGRlcih2YWx1ZSwgYmluZGluZ3MpO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB2YWx1ZS5tYXAoaXRlbSA9PiByZXNvbHZlUGxhY2Vob2xkZXJzKGl0ZW0sIGJpbmRpbmdzKSk7XG5cdH1cblx0aWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKHZhbHVlKS5tYXAoKFtrZXksIGl0ZW1dKSA9PiBba2V5LCByZXNvbHZlUGxhY2Vob2xkZXJzKGl0ZW0sIGJpbmRpbmdzKV0pKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVQbGFjZWhvbGRlcih2YWx1ZTogc3RyaW5nLCBiaW5kaW5nczogTWFwPHN0cmluZywgc3RyaW5nPik6IHN0cmluZyB7XG5cdGlmICghUExBQ0VIT0xERVJfUkUudGVzdCh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblx0Y29uc3QgcmVzb2x2ZWQgPSBiaW5kaW5ncy5nZXQodmFsdWUpO1xuXHRpZiAocmVzb2x2ZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gbm8gdmFsdWUgaXMgYm91bmQgZm9yICR7dmFsdWV9YCk7XG5cdH1cblx0cmV0dXJuIHJlc29sdmVkO1xufVxuXG5mdW5jdGlvbiBwYXJzZUNsaWVudEFjdGlvbih2YWx1ZTogdW5rbm93bik6IFN0YXRlQWN0aW9uIHtcblx0Y29uc3QgYWN0aW9uID0gcmVhZFJlY29yZCh2YWx1ZSwgJ2FjdGlvbicpO1xuXHRzd2l0Y2ggKHJlYWRTdHJpbmcoYWN0aW9uLCAndHlwZScpKSB7XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQ6IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHJlYWRSZWNvcmQoYWN0aW9uLmFjdGl2ZUNsaWVudCwgJ2FjdGl2ZUNsaWVudCcpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRhY3RpdmVDbGllbnQ6IHtcblx0XHRcdFx0XHRjbGllbnRJZDogcmVhZFN0cmluZyhhY3RpdmVDbGllbnQsICdjbGllbnRJZCcpLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiByZWFkT3B0aW9uYWxTdHJpbmcoYWN0aXZlQ2xpZW50LCAnZGlzcGxheU5hbWUnKSxcblx0XHRcdFx0XHR0b29sczogcmVhZFRvb2xzKGFjdGl2ZUNsaWVudC50b29scyksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkOiB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gcmVhZFJlY29yZChhY3Rpb24ubWVzc2FnZSwgJ21lc3NhZ2UnKTtcblx0XHRcdGNvbnN0IG9yaWdpbiA9IHJlYWRSZWNvcmQobWVzc2FnZS5vcmlnaW4sICdtZXNzYWdlLm9yaWdpbicpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtZXNzYWdlLm1vZGVsID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiByZWFkUmVjb3JkKG1lc3NhZ2UubW9kZWwsICdtZXNzYWdlLm1vZGVsJyk7XG5cdFx0XHRjb25zdCBvcmlnaW5LaW5kID0gcmVhZFN0cmluZyhvcmlnaW4sICdraW5kJyk7XG5cdFx0XHRpZiAob3JpZ2luS2luZCAhPT0gTWVzc2FnZUtpbmQuVXNlcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdIGNsaWVudCB0dXJuIG9yaWdpbiBtdXN0IGJlICR7TWVzc2FnZUtpbmQuVXNlcn1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6IHJlYWRTdHJpbmcoYWN0aW9uLCAndHVybklkJyksXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogcmVhZFN0cmluZyhtZXNzYWdlLCAndGV4dCcpLFxuXHRcdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdFx0Li4uKG1vZGVsID8geyBtb2RlbDogeyBpZDogcmVhZFN0cmluZyhtb2RlbCwgJ2lkJykgfSB9IDoge30pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZDpcblx0XHRcdGlmIChhY3Rpb24uYXBwcm92ZWQgIT09IHRydWUgfHwgYWN0aW9uLmNvbmZpcm1lZCAhPT0gVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thaHAtc25hcHNob3RdIGV4ZWN1dGFibGUgdG9vbCBjb25maXJtYXRpb25zIGN1cnJlbnRseSByZXF1aXJlIHVzZXIgYXBwcm92YWwnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHR0dXJuSWQ6IHJlYWRTdHJpbmcoYWN0aW9uLCAndHVybklkJyksXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IHJlYWRTdHJpbmcoYWN0aW9uLCAndG9vbENhbGxJZCcpLFxuXHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0fTtcblx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGU6IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlYWRSZWNvcmQoYWN0aW9uLnJlc3VsdCwgJ3Jlc3VsdCcpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiByZWFkU3RyaW5nKGFjdGlvbiwgJ3R1cm5JZCcpLFxuXHRcdFx0XHR0b29sQ2FsbElkOiByZWFkU3RyaW5nKGFjdGlvbiwgJ3Rvb2xDYWxsSWQnKSxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogcmVhZEJvb2xlYW4ocmVzdWx0LCAnc3VjY2VzcycpLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHJlYWRTdHJpbmcocmVzdWx0LCAncGFzdFRlbnNlTWVzc2FnZScpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IHJlYWRUb29sUmVzdWx0Q29udGVudChyZXN1bHQuY29udGVudCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSB1bnN1cHBvcnRlZCBleGVjdXRhYmxlIGNsaWVudCBhY3Rpb246ICR7cmVhZFN0cmluZyhhY3Rpb24sICd0eXBlJyl9YCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVhZFRvb2xzKHZhbHVlOiB1bmtub3duKTogeyBuYW1lOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyBpbnB1dFNjaGVtYT86IHsgdHlwZTogJ29iamVjdCc7IHByb3BlcnRpZXM/OiBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+OyByZXF1aXJlZD86IHN0cmluZ1tdIH0gfVtdIHtcblx0aWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignW2FocC1zbmFwc2hvdF0gYWN0aXZlQ2xpZW50LnRvb2xzIG11c3QgYmUgYW4gYXJyYXknKTtcblx0fVxuXHRyZXR1cm4gdmFsdWUubWFwKChpdGVtLCBpbmRleCkgPT4ge1xuXHRcdGNvbnN0IHRvb2wgPSByZWFkUmVjb3JkKGl0ZW0sIGB0b29sc1ske2luZGV4fV1gKTtcblx0XHRjb25zdCBpbnB1dFNjaGVtYSA9IHRvb2wuaW5wdXRTY2hlbWEgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHJlYWRSZWNvcmQodG9vbC5pbnB1dFNjaGVtYSwgYHRvb2xzWyR7aW5kZXh9XS5pbnB1dFNjaGVtYWApO1xuXHRcdGlmIChpbnB1dFNjaGVtYSAmJiBpbnB1dFNjaGVtYS50eXBlICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSB0b29sc1ske2luZGV4fV0uaW5wdXRTY2hlbWEudHlwZSBtdXN0IGJlIG9iamVjdGApO1xuXHRcdH1cblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gaW5wdXRTY2hlbWE/LnByb3BlcnRpZXMgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHJlYWRPYmplY3RQcm9wZXJ0aWVzKGlucHV0U2NoZW1hLnByb3BlcnRpZXMsIGB0b29sc1ske2luZGV4fV0uaW5wdXRTY2hlbWEucHJvcGVydGllc2ApO1xuXHRcdGNvbnN0IHJlcXVpcmVkID0gaW5wdXRTY2hlbWE/LnJlcXVpcmVkID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiByZWFkU3RyaW5nQXJyYXkoaW5wdXRTY2hlbWEucmVxdWlyZWQsIGB0b29sc1ske2luZGV4fV0uaW5wdXRTY2hlbWEucmVxdWlyZWRgKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogcmVhZFN0cmluZyh0b29sLCAnbmFtZScpLFxuXHRcdFx0ZGVzY3JpcHRpb246IHJlYWRPcHRpb25hbFN0cmluZyh0b29sLCAnZGVzY3JpcHRpb24nKSxcblx0XHRcdC4uLihpbnB1dFNjaGVtYSA/IHsgaW5wdXRTY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXMsIHJlcXVpcmVkIH0gfSA6IHt9KSxcblx0XHR9O1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVhZFRvb2xSZXN1bHRDb250ZW50KHZhbHVlOiB1bmtub3duKTogeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDsgdGV4dDogc3RyaW5nIH1bXSB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdbYWhwLXNuYXBzaG90XSB0b29sIHJlc3VsdCBjb250ZW50IG11c3QgYmUgYW4gYXJyYXknKTtcblx0fVxuXHRyZXR1cm4gdmFsdWUubWFwKChpdGVtLCBpbmRleCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSByZWFkUmVjb3JkKGl0ZW0sIGByZXN1bHQuY29udGVudFske2luZGV4fV1gKTtcblx0XHRpZiAoY29udGVudC50eXBlICE9PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSB1bnN1cHBvcnRlZCBleGVjdXRhYmxlIHRvb2wgcmVzdWx0IGNvbnRlbnQ6ICR7U3RyaW5nKGNvbnRlbnQudHlwZSl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiByZWFkU3RyaW5nKGNvbnRlbnQsICd0ZXh0JykgfTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlYWRPYmplY3RQcm9wZXJ0aWVzKHZhbHVlOiB1bmtub3duLCBuYW1lOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+IHtcblx0Y29uc3QgcHJvcGVydGllcyA9IHJlYWRSZWNvcmQodmFsdWUsIG5hbWUpO1xuXHRmb3IgKGNvbnN0IFtrZXksIHByb3BlcnR5XSBvZiBPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKSkge1xuXHRcdGlmICghcHJvcGVydHkgfHwgdHlwZW9mIHByb3BlcnR5ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSAke25hbWV9LiR7a2V5fSBtdXN0IGJlIGFuIG9iamVjdGApO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcHJvcGVydGllcyBhcyBSZWNvcmQ8c3RyaW5nLCBvYmplY3Q+O1xufVxuXG5mdW5jdGlvbiByZWFkU3RyaW5nQXJyYXkodmFsdWU6IHVua25vd24sIG5hbWU6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0aWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSB8fCAhdmFsdWUuZXZlcnkoaXRlbSA9PiB0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSAke25hbWV9IG11c3QgYmUgYSBzdHJpbmcgYXJyYXlgKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JGaW5hbFNlcnZlck1lc3NhZ2UoY2xpZW50OiBJQWhwU25hcHNob3RDbGllbnQsIGVudHJpZXM6IHJlYWRvbmx5IElBaHBTbmFwc2hvdEVudHJ5W10sIHNlZW5Ob3RpZmljYXRpb25zOiBTZXQ8b2JqZWN0PiwgYmluZGluZ3M6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgZmluYWxFbnRyeSA9IGVudHJpZXMuYXQoLTEpO1xuXHRpZiAoIWZpbmFsRW50cnkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1thaHAtc25hcHNob3RdIHNlcnZlclRvQ2xpZW50IG11c3Qgbm90IGJlIGVtcHR5Jyk7XG5cdH1cblx0Y29uc3QgZmluYWxBY3Rpb25UeXBlID0gZmluYWxFbnRyeS5hY3Rpb24gPyByZWFkU3RyaW5nKGZpbmFsRW50cnkuYWN0aW9uLCAndHlwZScpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBmaW5hbENoYW5uZWwgPSBmaW5hbEVudHJ5LmNoYW5uZWwgPyByZXNvbHZlUGxhY2Vob2xkZXIoZmluYWxFbnRyeS5jaGFubmVsLCBiaW5kaW5ncykgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGZpbmFsVHVybklkUGxhY2Vob2xkZXIgPSBmaW5hbEVudHJ5LmFjdGlvbiA/IHJlYWRPcHRpb25hbFN0cmluZyhmaW5hbEVudHJ5LmFjdGlvbiwgJ3R1cm5JZCcpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBmaW5hbFR1cm5JZCA9IGZpbmFsVHVybklkUGxhY2Vob2xkZXIgPyByZXNvbHZlUGxhY2Vob2xkZXIoZmluYWxUdXJuSWRQbGFjZWhvbGRlciwgYmluZGluZ3MpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBub3RpZmljYXRpb24gPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihjYW5kaWRhdGUgPT4ge1xuXHRcdGlmIChzZWVuTm90aWZpY2F0aW9ucy5oYXMoY2FuZGlkYXRlIGFzIG9iamVjdCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNhbmRpZGF0ZS5tZXRob2QgPT09ICdhY3Rpb24nKSB7XG5cdFx0XHRjb25zdCBlbnZlbG9wZSA9IGNhbmRpZGF0ZS5wYXJhbXMgYXMgQWN0aW9uRW52ZWxvcGU7XG5cdFx0XHRpZiAoZmluYWxDaGFubmVsICYmIGVudmVsb3BlLmNoYW5uZWwgIT09IGZpbmFsQ2hhbm5lbCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb247XG5cdFx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBmaW5hbFR1cm5JZCA9PT0gdW5kZWZpbmVkIHx8IGFjdGlvbi50dXJuSWQgPT09IGZpbmFsVHVybklkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFjdGlvbi50eXBlID09PSBmaW5hbEFjdGlvblR5cGVcblx0XHRcdFx0JiYgKGZpbmFsVHVybklkID09PSB1bmRlZmluZWQgfHwgKGFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZyB9KS50dXJuSWQgPT09IGZpbmFsVHVybklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZS5tZXRob2QgPT09IGZpbmFsRW50cnkubWV0aG9kO1xuXHR9LCA5MF8wMDApO1xuXHRzZWVuTm90aWZpY2F0aW9ucy5hZGQobm90aWZpY2F0aW9uIGFzIG9iamVjdCk7XG5cdGlmIChub3RpZmljYXRpb24ubWV0aG9kID09PSAnYWN0aW9uJykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IChub3RpZmljYXRpb24ucGFyYW1zIGFzIEFjdGlvbkVudmVsb3BlKS5hY3Rpb247XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvciAmJiBmaW5hbEFjdGlvblR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSB7XG5cdFx0XHRjb25zdCByZXBsYXlFcnJvciA9IGNsaWVudC50YWtlUmVwbGF5RXJyb3IoKTtcblx0XHRcdGlmIChyZXBsYXlFcnJvcikge1xuXHRcdFx0XHR0aHJvdyByZXBsYXlFcnJvcjtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgW2FocC1zbmFwc2hvdF0gcm91bmQgZmFpbGVkIGJlZm9yZSAke2ZpbmFsQWN0aW9uVHlwZX06ICR7YWN0aW9uLmVycm9yLmVycm9yVHlwZX06ICR7YWN0aW9uLmVycm9yLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHJlYWRSZWNvcmQodmFsdWU6IHVua25vd24sIG5hbWU6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSAke25hbWV9IG11c3QgYmUgYW4gb2JqZWN0YCk7XG5cdH1cblx0cmV0dXJuIHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufVxuXG5mdW5jdGlvbiByZWFkU3RyaW5nKHJlY29yZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGtleTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgdmFsdWUgPSByZWNvcmRba2V5XTtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFthaHAtc25hcHNob3RdICR7a2V5fSBtdXN0IGJlIGEgc3RyaW5nYCk7XG5cdH1cblx0cmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiByZWFkT3B0aW9uYWxTdHJpbmcocmVjb3JkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2YWx1ZSA9IHJlY29yZFtrZXldO1xuXHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSAke2tleX0gbXVzdCBiZSBhIHN0cmluZ2ApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gcmVhZEJvb2xlYW4ocmVjb3JkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwga2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgdmFsdWUgPSByZWNvcmRba2V5XTtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBbYWhwLXNuYXBzaG90XSAke2tleX0gbXVzdCBiZSBhIGJvb2xlYW5gKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG4iXSwKICAibWFw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
