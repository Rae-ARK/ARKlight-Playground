import assert from "assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { ChatSourceKind, CompletionItemKind } from "../../../../common/state/protocol/commands.js";
import {
  buildChatUri,
  buildDefaultChatUri,
  ChatOriginKind,
  isAhpChatChannel,
  MessageAttachmentKind,
  MessageKind,
  parseRequiredSessionUriFromChatUri,
  ResponsePartKind,
  ROOT_STATE_URI,
  SessionStatus,
  ToolCallConfirmationReason
} from "../../../../common/state/sessionState.js";
import { assertToolCallCompleteText, createRealSession } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest, providerHostOnlyTest } from "./e2eTestContext.js";
function defineMultiChatTests(context) {
  const { config, createdSessions, tempDirs } = context;
  const PREFER_FILE_TOOLS = " Use your file tools; do not run a shell command.";
  async function createSession(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-multichat-${prefix}-`));
    tempDirs.push(workspace);
    const sessionUri = await createRealSession(
      context.client,
      config,
      `${prefix}-${config.provider}`,
      createdSessions,
      URI.file(workspace)
    );
    return { sessionUri, defaultChatUri: buildDefaultChatUri(sessionUri), workspace };
  }
  async function createPeer(sessionUri, id, source) {
    const chat = buildChatUri(sessionUri, id);
    await context.client.call("createChat", {
      channel: sessionUri,
      chat,
      ...source ? { source } : {}
    }, 3e4);
    return chat;
  }
  async function sessionState(sessionUri) {
    const result = await context.client.call("subscribe", { channel: sessionUri });
    return result.snapshot.state;
  }
  async function chatState(chatUri) {
    const result = await context.client.call("subscribe", { channel: chatUri });
    return result.snapshot.state;
  }
  async function rename(channel, title, clientSeq = 1) {
    context.client.clearReceived();
    context.client.dispatch({
      channel,
      clientSeq,
      action: { type: ActionType.SessionTitleChanged, title }
    });
    if (isAhpChatChannel(channel)) {
      const session = parseRequiredSessionUriFromChatUri(channel);
      await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "session/chatUpdated") || getActionEnvelope(n).channel !== session) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        return action.chat === channel && action.changes.title === title;
      });
    } else {
      await context.client.waitForNotification(
        (n) => isActionNotification(n, "session/titleChanged") && getActionEnvelope(n).channel === channel
      );
    }
  }
  function providerTest(title, run, enabled = config.supportsMultipleChats) {
    if (context.tier !== "parity") {
      return;
    }
    (enabled ? test : test.skip)(title, function() {
      this.timeout(18e4);
      return run.call(this);
    });
  }
  function fileReadToolNames(provider) {
    switch (provider) {
      case "claude":
        return ["Read"];
      case "copilotcli":
        return ["view"];
      default:
        return ["Read", "view", "shell"];
    }
  }
  function observedModelMessages(body) {
    const request = JSON.parse(body);
    if (!isRecord(request) || !Array.isArray(request.messages)) {
      return [];
    }
    return request.messages.flatMap((message) => {
      if (!isRecord(message) || typeof message.role !== "string") {
        return [];
      }
      return [{ role: message.role, content: modelContentText(message.content) }];
    });
  }
  function modelContentText(value) {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(modelContentText).join("");
    }
    if (isRecord(value)) {
      if (typeof value.text === "string") {
        return value.text;
      }
      return modelContentText(value.content);
    }
    return "";
  }
  function isRecord(value) {
    return typeof value === "object" && value !== null;
  }
  function forkProviderTest(title, run) {
    if (context.tier !== "parity") {
      return;
    }
    (config.supportsChatForkE2E ? test : test.skip)(title, function() {
      this.timeout(18e4);
      return run.call(this);
    });
  }
  async function driveTurn(chatUri, turnId, text, clientSeq, attachments) {
    context.client.clearReceived();
    context.client.dispatch({
      channel: chatUri,
      clientSeq,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text, origin: { kind: MessageKind.User }, ...attachments ? { attachments: [...attachments] } : {} }
      }
    });
    const seen = /* @__PURE__ */ new Set();
    let nextClientSeq = clientSeq + 1;
    while (true) {
      const notification = await context.client.waitForNotification((n) => {
        if (seen.has(n) || !isActionNotification(n, "chat/toolCallReady") && !isActionNotification(n, "chat/turnComplete") && !isActionNotification(n, "chat/error")) {
          return false;
        }
        if (getActionEnvelope(n).channel !== chatUri) {
          return false;
        }
        return getActionEnvelope(n).action.turnId === turnId;
      }, 9e4);
      seen.add(notification);
      if (isActionNotification(notification, "chat/error")) {
        const action2 = getActionEnvelope(notification).action;
        throw new Error(`Peer chat error during ${turnId}: ${JSON.stringify(action2.error)}`);
      }
      if (isActionNotification(notification, "chat/turnComplete")) {
        break;
      }
      const action = getActionEnvelope(notification).action;
      if (!action.confirmed) {
        context.client.dispatch({
          channel: chatUri,
          clientSeq: nextClientSeq++,
          action: {
            type: ActionType.ChatToolCallConfirmed,
            turnId,
            toolCallId: action.toolCallId,
            approved: true,
            confirmed: ToolCallConfirmationReason.UserAction
          }
        });
      }
    }
    const markdownPartIds = /* @__PURE__ */ new Set();
    const pieces = [];
    for (const notification of context.client.receivedNotifications(
      (n) => (isActionNotification(n, "chat/responsePart") || isActionNotification(n, "chat/delta")) && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId
    )) {
      const action = getActionEnvelope(notification).action;
      if (action.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown) {
        markdownPartIds.add(action.part.id);
        pieces.push(action.part.content);
      } else if (action.type === ActionType.ChatDelta && markdownPartIds.has(action.partId)) {
        pieces.push(action.content);
      }
    }
    return pieces.join("");
  }
  providerHostOnlyTest(context, "agent advertises its multiple chat capability", async function() {
    await createSession("capability");
    const root = await context.client.call("subscribe", { channel: ROOT_STATE_URI });
    const agent = root.snapshot.state.agents.find((agent2) => agent2.provider === config.provider);
    assert.deepStrictEqual({
      multipleChats: !!agent?.capabilities?.multipleChats,
      fork: agent?.capabilities?.multipleChats?.fork ?? false,
      sideChat: agent?.capabilities?.multipleChats?.sideChat ?? false
    }, {
      multipleChats: config.supportsMultipleChats,
      fork: config.supportsChatFork,
      sideChat: config.supportsSideChats ?? false
    });
  });
  providerHostOnlyTest(context, "provider without multiple chat capability rejects peer creation", async function() {
    const { sessionUri } = await createSession("unsupported");
    await assert.rejects(
      () => createPeer(sessionUri, "unsupported-peer"),
      /does not support multiple chats/i
    );
  }, !config.supportsMultipleChats);
  conformanceTest(context, "creating a peer chat adds it to the session catalog", async function() {
    const { sessionUri } = await createSession("catalog-add");
    const peer = await createPeer(sessionUri, "peer");
    assert.ok((await sessionState(sessionUri)).chats.some((chat) => chat.resource === peer));
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer chat subscription starts empty and idle", async function() {
    const { sessionUri } = await createSession("empty-peer");
    const peer = await createPeer(sessionUri, "peer");
    const state = await chatState(peer);
    assert.deepStrictEqual({ turns: state.turns, activeTurn: state.activeTurn, status: state.status }, {
      turns: [],
      activeTurn: void 0,
      status: SessionStatus.Idle
    });
  }, config.supportsMultipleChats);
  conformanceTest(context, "creating the same peer chat twice is idempotent", async function() {
    const { sessionUri } = await createSession("idempotent");
    const peer = await createPeer(sessionUri, "peer");
    await createPeer(sessionUri, "peer");
    assert.strictEqual((await sessionState(sessionUri)).chats.filter((chat) => chat.resource === peer).length, 1);
  }, config.supportsMultipleChats);
  conformanceTest(context, "creating two peer chats preserves both catalog entries", async function() {
    const { sessionUri } = await createSession("two-peers");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    const peers = (await sessionState(sessionUri)).chats.map((chat) => chat.resource);
    assert.ok(peers.includes(first) && peers.includes(second));
  }, config.supportsMultipleChats);
  conformanceTest(context, "disposing a peer chat removes its catalog entry", async function() {
    const { sessionUri } = await createSession("dispose");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    assert.strictEqual((await sessionState(sessionUri)).chats.some((chat) => chat.resource === peer), false);
  }, config.supportsMultipleChats);
  conformanceTest(context, "disposing one peer chat preserves its sibling", async function() {
    const { sessionUri } = await createSession("dispose-one");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    await context.client.call("disposeChat", { channel: first }, 3e4);
    const peers = (await sessionState(sessionUri)).chats.map((chat) => chat.resource);
    assert.ok(!peers.includes(first) && peers.includes(second));
  }, config.supportsMultipleChats);
  conformanceTest(context, "recreating a disposed peer chat starts empty", async function() {
    const { sessionUri } = await createSession("recreate");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    await createPeer(sessionUri, "peer");
    assert.deepStrictEqual((await chatState(peer)).turns, []);
  }, config.supportsMultipleChats);
  conformanceTest(context, "renaming a peer chat updates its catalog title", async function() {
    const { sessionUri } = await createSession("rename-peer");
    const peer = await createPeer(sessionUri, "peer");
    await rename(peer, "Peer Title");
    assert.strictEqual((await sessionState(sessionUri)).chats.find((chat) => chat.resource === peer)?.title, "Peer Title");
  }, config.supportsMultipleChats);
  conformanceTest(context, "renaming a peer chat leaves the session title unchanged", async function() {
    const { sessionUri } = await createSession("rename-isolated");
    await rename(sessionUri, "Session Title");
    const peer = await createPeer(sessionUri, "peer");
    await rename(peer, "Peer Title", 2);
    assert.strictEqual((await sessionState(sessionUri)).title, "Session Title");
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer chat survives unsubscribe and resubscribe", async function() {
    const { sessionUri } = await createSession("resubscribe");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    context.client.notify("unsubscribe", { channel: peer });
    assert.strictEqual((await chatState(peer)).resource, peer);
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer creation does not leak a provider backing as a top-level session", async function() {
    const { sessionUri } = await createSession("session-list");
    const before = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    await createPeer(sessionUri, "peer");
    const after = await context.client.call("listSessions", { channel: ROOT_STATE_URI });
    const beforeResources = new Set(before.items.map((item) => item.resource));
    const unexpected = after.items.map((item) => item.resource).filter((resource) => !beforeResources.has(resource) && resource !== sessionUri);
    assert.deepStrictEqual(unexpected, []);
  }, config.supportsMultipleChats);
  conformanceTest(context, "peer file completion uses the parent workspace", async function() {
    const { sessionUri, workspace } = await createSession("completion");
    writeFileSync(join(workspace, "peer-target.txt"), "target");
    const peer = await createPeer(sessionUri, "peer");
    const completions = await context.client.call("completions", {
      channel: peer,
      kind: CompletionItemKind.UserMessage,
      text: "@peer-t",
      offset: "@peer-t".length
    });
    assert.deepStrictEqual(completions.items.map((item) => item.insertText), ["@peer-target.txt"]);
  }, config.supportsMultipleChats);
  conformanceTest(context, "first peer chat snapshots the session title onto the default chat", async function() {
    const { sessionUri, defaultChatUri } = await createSession("default-title");
    await rename(sessionUri, "Original Session");
    await createPeer(sessionUri, "peer");
    assert.strictEqual((await sessionState(sessionUri)).chats.find((chat) => chat.resource === defaultChatUri)?.title, "Original Session");
  }, config.supportsMultipleChats);
  conformanceTest(context, "session rename after peer creation preserves the default chat title", async function() {
    const { sessionUri, defaultChatUri } = await createSession("independent-title");
    await rename(sessionUri, "Original Session");
    await createPeer(sessionUri, "peer");
    await rename(sessionUri, "Renamed Session", 2);
    assert.strictEqual((await sessionState(sessionUri)).chats.find((chat) => chat.resource === defaultChatUri)?.title, "Original Session");
  }, config.supportsMultipleChats);
  conformanceTest(context, "forking an unknown turn creates a fresh empty peer chat", async function() {
    const { sessionUri, defaultChatUri } = await createSession("unknown-fork");
    const peer = await createPeer(sessionUri, "fork", { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: "missing-turn" });
    assert.deepStrictEqual((await chatState(peer)).turns, []);
  }, config.supportsMultipleChats);
  providerTest("peer chat completes a simple turn", async function() {
    const { sessionUri } = await createSession("peer-turn");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-turn", 'Reply exactly "PEER_OK".', 1);
    assert.match(response, /PEER_OK/);
  });
  providerTest("peer chat retains context across consecutive turns", async function() {
    const { sessionUri } = await createSession("peer-context");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const firstResponse = await driveTurn(peer, "peer-context-1", 'Remember the code word PEAR. Reply exactly "ready".', 1);
    const response = await driveTurn(peer, "peer-context-2", "What code word did I ask you to remember? Reply with only the code word.", 2);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    const priorAssistantResponse = firstResponse.trim();
    assert.deepStrictEqual({
      priorAssistantResponseIsNonEmpty: priorAssistantResponse.length > 0,
      responseHasCodeWord: /PEAR/i.test(response),
      requestHasPriorUserMessage: messages.some((message) => message.role === "user" && message.content.includes("Remember the code word PEAR")),
      requestHasPriorAssistantMessage: messages.some((message) => message.role === "assistant" && message.content.includes(priorAssistantResponse))
    }, {
      priorAssistantResponseIsNonEmpty: true,
      responseHasCodeWord: true,
      requestHasPriorUserMessage: true,
      requestHasPriorAssistantMessage: true
    });
  });
  forkProviderTest("forked peer chat inherits source history through the provider", async function() {
    const { sessionUri, defaultChatUri } = await createSession("fork-history");
    const sourceResponse = await driveTurn(defaultChatUri, "fork-source", 'Remember the code word FORKCODE. Reply exactly "ready".', 1);
    const peer = await createPeer(sessionUri, "fork", { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: "fork-source" });
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "fork-turn", "What code word did I ask you to remember? Reply with only the code word.", 2);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    const priorAssistantResponse = sourceResponse.trim();
    assert.deepStrictEqual({
      seededMessages: (await chatState(peer)).turns.map((turn) => turn.message.text),
      priorAssistantResponseIsNonEmpty: priorAssistantResponse.length > 0,
      responseHasCodeWord: /FORKCODE/i.test(response),
      requestHasPriorUserMessage: messages.some((message) => message.role === "user" && message.content.includes("Remember the code word FORKCODE")),
      requestHasPriorAssistantMessage: messages.some((message) => message.role === "assistant" && message.content.includes(priorAssistantResponse))
    }, {
      seededMessages: [
        'Remember the code word FORKCODE. Reply exactly "ready".',
        "What code word did I ask you to remember? Reply with only the code word."
      ],
      priorAssistantResponseIsNonEmpty: true,
      responseHasCodeWord: true,
      requestHasPriorUserMessage: true,
      requestHasPriorAssistantMessage: true
    });
  });
  providerTest("disposing a peer after a completed turn removes it from the catalog", async function() {
    const { sessionUri } = await createSession("dispose-after-turn");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-turn", 'Reply exactly "DONE".', 1);
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    assert.strictEqual((await sessionState(sessionUri)).chats.some((chat) => chat.resource === peer), false);
  });
  conformanceTest(context, "peer rename command updates the peer title and records a local turn", async function() {
    const { sessionUri } = await createSession("local-rename");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-rename", "/rename Renamed Peer", 1);
    const state = await chatState(peer);
    assert.deepStrictEqual({
      title: state.title,
      messages: state.turns.map((turn) => turn.message.text)
    }, {
      title: "Renamed Peer",
      messages: ["/rename Renamed Peer"]
    });
  }, config.supportsMultipleChats);
  conformanceTest(context, "empty peer rename command leaves the peer title unchanged", async function() {
    const { sessionUri } = await createSession("local-empty-rename");
    const peer = await createPeer(sessionUri, "peer");
    await rename(peer, "Original Peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-empty-rename", "/rename", 2);
    assert.strictEqual((await chatState(peer)).title, "Original Peer");
  }, config.supportsMultipleChats);
  conformanceTest(context, "failing peer bang command records a failed terminal tool call", async function() {
    const { sessionUri } = await createSession("local-bang-failure");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-bang-failure", '!node -e "process.exit(7)"', 1);
    const toolCalls = (await chatState(peer)).turns.flatMap((turn) => turn.responseParts).filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => part.toolCall);
    assert.ok(toolCalls.some((toolCall) => toolCall.status === "completed" && !toolCall.success));
  }, config.supportsMultipleChats);
  providerTest("peer chat reads a file from the parent workspace", async function() {
    const { sessionUri, workspace } = await createSession("read-file");
    const file = join(workspace, "peer-note.txt");
    writeFileSync(file, "PEER_FILE_VALUE");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-read", `Read the file at ${file} and reply with its exact contents only.`, 1);
    assert.match(response, /PEER_FILE_VALUE/);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-read",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/PEER_FILE_VALUE/],
      success: true
    });
  });
  providerTest("peer chat reads a file from a nested directory", async function() {
    const { sessionUri, workspace } = await createSession("read-nested-file");
    mkdirSync(join(workspace, "nested"));
    const file = join(workspace, "nested", "peer.txt");
    writeFileSync(file, "PEER_NESTED_READ");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-read-nested", `Read the file at ${file} and reply with its exact contents only.`, 1);
    assert.match(response, /PEER_NESTED_READ/);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-read-nested",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/PEER_NESTED_READ/],
      success: true
    });
  });
  providerTest("peer chat creates a file in the parent workspace", async function() {
    const { sessionUri, workspace } = await createSession("create-file");
    const file = join(workspace, "peer-created.txt");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-create", `Create the file at ${file} containing exactly PEER_CREATED.`, 1);
    assert.strictEqual(readFileSync(file, "utf8"), "PEER_CREATED");
  });
  providerTest("peer chat edits an existing workspace file", async function() {
    const { sessionUri, workspace } = await createSession("edit-file");
    const file = join(workspace, "peer-edit.txt");
    writeFileSync(file, "BEFORE_PEER");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-edit", `Replace the complete contents of ${file} with AFTER_PEER.${PREFER_FILE_TOOLS}`, 1);
    assert.strictEqual(readFileSync(file, "utf8").trim(), "AFTER_PEER");
  }, config.supportsMultipleChats);
  providerTest("peer chat creates a file in a nested directory", async function() {
    const { sessionUri, workspace } = await createSession("nested-create");
    const file = join(workspace, "peer-output", "report.txt");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const peerNestedCommand = `node -e "const fs=require('fs');fs.mkdirSync('peer-output',{recursive:true});fs.writeFileSync('peer-output/report.txt','PEER_NESTED')"`;
    await driveTurn(peer, "peer-nested-create", `Run exactly this shell command, with no modifications: \`${peerNestedCommand}\`. Then reply with exactly "created".`, 1);
    assert.strictEqual(readFileSync(file, "utf8"), "PEER_NESTED");
  }, config.supportsMultipleChats);
  providerTest("peer chat handles a missing workspace file without an error", async function() {
    const { sessionUri, workspace } = await createSession("missing-file");
    const file = join(workspace, "peer-missing.txt");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-missing", `Try to read ${file}. If it does not exist, reply exactly "missing".${PREFER_FILE_TOOLS}`, 1);
    assert.match(response, /missing/i);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-missing",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/does not exist/],
      success: false
    });
  });
  providerTest("peer chat reads a filename containing spaces", async function() {
    const { sessionUri, workspace } = await createSession("spaces");
    const file = join(workspace, "peer file.txt");
    writeFileSync(file, "PEER_SPACED");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const response = await driveTurn(peer, "peer-spaces", `Read the file at ${file} and reply with its exact contents only.`, 1);
    assert.match(response, /PEER_SPACED/);
    assertToolCallCompleteText(context.client, {
      channel: peer,
      turnId: "peer-spaces",
      toolNames: fileReadToolNames(config.provider),
      workspace,
      expected: [/PEER_SPACED/],
      success: true
    });
  });
  providerTest("two peer chats write distinct workspace files", async function() {
    const { sessionUri, workspace } = await createSession("two-writers");
    const firstFile = join(workspace, "first-peer.txt");
    const secondFile = join(workspace, "second-peer.txt");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    await context.client.call("subscribe", { channel: first });
    await context.client.call("subscribe", { channel: second });
    await driveTurn(first, "first-write", `Create the file at ${firstFile} containing exactly FIRST_PEER.`, 1);
    await driveTurn(second, "second-write", `Create the file at ${secondFile} containing exactly SECOND_PEER.`, 10);
    assert.deepStrictEqual({
      first: readFileSync(firstFile, "utf8"),
      second: readFileSync(secondFile, "utf8")
    }, {
      first: "FIRST_PEER",
      second: "SECOND_PEER"
    });
  });
  providerTest("fresh peer chat does not inherit default chat context", async function() {
    const { sessionUri, defaultChatUri } = await createSession("fresh-context");
    await driveTurn(defaultChatUri, "default-secret", 'Remember the code word DEFAULTSECRET. Reply exactly "ready".', 1);
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-fresh-context", 'Reply exactly "fresh".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.strictEqual(messages.some((message) => message.content.includes("DEFAULTSECRET")), false);
  }, config.supportsMultipleChats);
  providerTest("side chat receives bounded source context without copied history", async function() {
    const { sessionUri, defaultChatUri } = await createSession("side-context");
    await driveTurn(defaultChatUri, "turn-source", 'Remember the exact token SIDECHAT42 for a later question. Reply with exactly "ready".', 1);
    const selection = { text: "MOONVALE99", responsePartId: "response-part-source-1" };
    const sideChatUri = await createPeer(sessionUri, "side", {
      kind: ChatSourceKind.SideChat,
      chat: defaultChatUri,
      turnId: "turn-source",
      selection
    });
    await context.client.call("subscribe", { channel: sideChatUri });
    const question = "Reply with the exact remembered token, then a space, then the exact selected text given to you as context \u2014 nothing else.";
    const response = await driveTurn(sideChatUri, "turn-side", question, 2);
    const [sourceState, sideState, session] = await Promise.all([
      chatState(defaultChatUri),
      chatState(sideChatUri),
      sessionState(sessionUri)
    ]);
    assert.deepStrictEqual({
      responseIncludesRememberedToken: /SIDECHAT42/i.test(response),
      responseIncludesSelectedText: /MOONVALE99/i.test(response),
      sourceTurnCount: sourceState.turns.length,
      sideTurnCount: sideState.turns.length,
      origin: session.chats.find((chat) => chat.resource === sideChatUri)?.origin,
      firstMessage: sideState.turns[0]?.message.text,
      firstAttachments: sideState.turns[0]?.message.attachments ?? []
    }, {
      responseIncludesRememberedToken: true,
      responseIncludesSelectedText: true,
      sourceTurnCount: 1,
      sideTurnCount: 1,
      origin: { kind: ChatOriginKind.SideChat, chat: defaultChatUri, turnId: "turn-source", selection },
      firstMessage: question,
      firstAttachments: []
    });
  }, config.supportsMultipleChats && !!config.supportsSideChats);
  providerTest("two peer chats keep independent provider contexts", async function() {
    const { sessionUri } = await createSession("two-contexts");
    const first = await createPeer(sessionUri, "first");
    const second = await createPeer(sessionUri, "second");
    await context.client.call("subscribe", { channel: first });
    await context.client.call("subscribe", { channel: second });
    await driveTurn(first, "first-context", 'Remember the code word ALPHA_PEER. Reply exactly "ready".', 1);
    await driveTurn(second, "second-context", 'Remember the code word BETA_PEER. Reply exactly "ready".', 10);
    await driveTurn(first, "first-followup", 'Reply exactly "first".', 20);
    const firstMessages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    await driveTurn(second, "second-followup", 'Reply exactly "second".', 30);
    const secondMessages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.deepStrictEqual({
      firstHasAlpha: firstMessages.some((message) => message.content.includes("ALPHA_PEER")),
      firstHasBeta: firstMessages.some((message) => message.content.includes("BETA_PEER")),
      secondHasBeta: secondMessages.some((message) => message.content.includes("BETA_PEER")),
      secondHasAlpha: secondMessages.some((message) => message.content.includes("ALPHA_PEER"))
    }, {
      firstHasAlpha: true,
      firstHasBeta: false,
      secondHasBeta: true,
      secondHasAlpha: false
    });
  });
  providerTest("peer provider context survives unsubscribe and resubscribe", async function() {
    const { sessionUri } = await createSession("resume-context");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-resume-1", 'Remember the code word RESUME_PEER. Reply exactly "ready".', 1);
    context.client.notify("unsubscribe", { channel: peer });
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-resume-2", 'Reply exactly "resumed".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.ok(messages.some((message) => message.content.includes("RESUME_PEER")));
  });
  providerTest("recreated peer chat starts with fresh provider context", async function() {
    const { sessionUri } = await createSession("reset-context");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-old-context", 'Remember the code word OLD_PEER. Reply exactly "ready".', 1);
    await context.client.call("disposeChat", { channel: peer }, 3e4);
    await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "peer-new-context", 'Reply exactly "new".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.strictEqual(messages.some((message) => message.content.includes("OLD_PEER")), false);
  });
  forkProviderTest("unknown-turn fork does not inherit source provider context", async function() {
    const { sessionUri, defaultChatUri } = await createSession("unknown-fork-context");
    await driveTurn(defaultChatUri, "source-secret", 'Remember the code word SOURCE_SECRET. Reply exactly "ready".', 1);
    const peer = await createPeer(sessionUri, "fork", { kind: ChatSourceKind.Fork, chat: defaultChatUri, turnId: "missing-turn" });
    await context.client.call("subscribe", { channel: peer });
    await driveTurn(peer, "fresh-fork-turn", 'Reply exactly "fresh".', 10);
    const messages = observedModelMessages(context.observedModelRequestBodies.at(-1) ?? "");
    assert.strictEqual(messages.some((message) => message.content.includes("SOURCE_SECRET")), false);
  });
  providerTest("peer simple attachment reaches the provider request", async function() {
    const { sessionUri } = await createSession("simple-attachment");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Simple,
      label: "peer-note.txt",
      displayKind: "document",
      modelRepresentation: "PEER_SIMPLE_ATTACHMENT"
    }];
    await driveTurn(peer, "peer-simple-attachment", 'Reply exactly "attachment".', 1, attachments);
    assert.ok((context.observedModelRequestBodies.at(-1) ?? "").includes("PEER_SIMPLE_ATTACHMENT"));
  });
  providerTest("peer simple attachment without a model representation is omitted from the provider request", async function() {
    const { sessionUri } = await createSession("simple-attachment-omitted");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Simple,
      label: "PEER_OMITTED_ATTACHMENT"
    }];
    await driveTurn(peer, "peer-simple-attachment-omitted", 'Reply exactly "attachment".', 1, attachments);
    assert.strictEqual((context.observedModelRequestBodies.at(-1) ?? "").includes("PEER_OMITTED_ATTACHMENT"), false);
  });
  providerTest("peer multiple simple attachments reach the provider request", async function() {
    const { sessionUri } = await createSession("multiple-attachments");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [
      {
        type: MessageAttachmentKind.Simple,
        label: "first",
        modelRepresentation: "PEER_FIRST_ATTACHMENT"
      },
      {
        type: MessageAttachmentKind.Simple,
        label: "second",
        modelRepresentation: "PEER_SECOND_ATTACHMENT"
      }
    ];
    await driveTurn(peer, "peer-multiple-attachments", 'Reply exactly "attachments".', 1, attachments);
    const request = context.observedModelRequestBodies.at(-1) ?? "";
    assert.ok(request.includes("PEER_FIRST_ATTACHMENT") && request.includes("PEER_SECOND_ATTACHMENT"));
  });
  providerTest("peer resource attachment reaches the provider request", async function() {
    const { sessionUri, workspace } = await createSession("resource-attachment");
    const file = join(workspace, "peer-resource.txt");
    writeFileSync(file, "PEER_RESOURCE_ATTACHMENT");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Resource,
      uri: URI.file(file).toString(),
      label: "peer-resource.txt",
      displayKind: "document"
    }];
    await driveTurn(peer, "peer-resource-attachment", 'Reply exactly "attachment".', 1, attachments);
    assert.ok((context.observedModelRequestBodies.at(-1) ?? "").includes("peer-resource.txt"));
  });
  providerTest("peer resource selection attachment includes its line reference", async function() {
    const { sessionUri, workspace } = await createSession("resource-selection");
    const file = join(workspace, "peer-selection.txt");
    writeFileSync(file, "first\nsecond\nthird");
    const peer = await createPeer(sessionUri, "peer");
    await context.client.call("subscribe", { channel: peer });
    const attachments = [{
      type: MessageAttachmentKind.Resource,
      uri: URI.file(file).toString(),
      label: "peer-selection.txt",
      displayKind: "selection",
      selection: {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 6 }
        }
      }
    }];
    await driveTurn(peer, "peer-resource-selection", 'Reply exactly "selection".', 1, attachments);
    const request = context.observedModelRequestBodies.at(-1) ?? "";
    assert.ok(request.includes("peer-selection.txt") && (request.includes("peer-selection.txt:2") || request.includes("(line 2)")));
  });
}
export {
  defineMultiChatTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvZTJlL3N1aXRlcy9tdWx0aUNoYXRTdWl0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCB0eXBlIENoYXRFcnJvckFjdGlvbiwgdHlwZSBDaGF0VG9vbENhbGxSZWFkeUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0U291cmNlS2luZCwgQ29tcGxldGlvbkl0ZW1LaW5kLCB0eXBlIENvbXBsZXRpb25zUmVzdWx0LCB0eXBlIExpc3RTZXNzaW9uc1Jlc3VsdCwgdHlwZSBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHtcblx0YnVpbGRDaGF0VXJpLFxuXHRidWlsZERlZmF1bHRDaGF0VXJpLFxuXHRDaGF0T3JpZ2luS2luZCxcblx0aXNBaHBDaGF0Q2hhbm5lbCxcblx0TWVzc2FnZUF0dGFjaG1lbnRLaW5kLFxuXHRNZXNzYWdlS2luZCxcblx0cGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSxcblx0UmVzcG9uc2VQYXJ0S2luZCxcblx0Uk9PVF9TVEFURV9VUkksXG5cdFNlc3Npb25TdGF0dXMsXG5cdFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLFxuXHR0eXBlIENoYXRTdGF0ZSxcblx0dHlwZSBNZXNzYWdlQXR0YWNobWVudCxcblx0dHlwZSBSb290U3RhdGUsXG5cdHR5cGUgU2Vzc2lvblN0YXRlLFxufSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGFzc2VydFRvb2xDYWxsQ29tcGxldGVUZXh0LCBjcmVhdGVSZWFsU2Vzc2lvbiB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBjb25mb3JtYW5jZVRlc3QsIHByb3ZpZGVySG9zdE9ubHlUZXN0LCB0eXBlIElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCB9IGZyb20gJy4vZTJlVGVzdENvbnRleHQuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lTXVsdGlDaGF0VGVzdHMoY29udGV4dDogSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0KTogdm9pZCB7XG5cdGNvbnN0IHsgY29uZmlnLCBjcmVhdGVkU2Vzc2lvbnMsIHRlbXBEaXJzIH0gPSBjb250ZXh0O1xuXHQvKiogU2VlIHRoZSBzYW1lIGNvbnN0YW50IGluIGBmaWxlT3BlcmF0aW9uc1N1aXRlYC4gKi9cblx0Y29uc3QgUFJFRkVSX0ZJTEVfVE9PTFMgPSAnIFVzZSB5b3VyIGZpbGUgdG9vbHM7IGRvIG5vdCBydW4gYSBzaGVsbCBjb21tYW5kLic7XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihwcmVmaXg6IHN0cmluZyk6IFByb21pc2U8eyBzZXNzaW9uVXJpOiBzdHJpbmc7IGRlZmF1bHRDaGF0VXJpOiBzdHJpbmc7IHdvcmtzcGFjZTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCBgYWhwLW11bHRpY2hhdC0ke3ByZWZpeH0tYCkpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya3NwYWNlKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oXG5cdFx0XHRjb250ZXh0LmNsaWVudCxcblx0XHRcdGNvbmZpZyxcblx0XHRcdGAke3ByZWZpeH0tJHtjb25maWcucHJvdmlkZXJ9YCxcblx0XHRcdGNyZWF0ZWRTZXNzaW9ucyxcblx0XHRcdFVSSS5maWxlKHdvcmtzcGFjZSksXG5cdFx0KTtcblx0XHRyZXR1cm4geyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaTogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSwgd29ya3NwYWNlIH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjcmVhdGVQZWVyKHNlc3Npb25Vcmk6IHN0cmluZywgaWQ6IHN0cmluZywgc291cmNlPzogeyBjaGF0OiBzdHJpbmc7IHR1cm5JZDogc3RyaW5nOyBraW5kOiBDaGF0U291cmNlS2luZDsgc2VsZWN0aW9uPzogeyB0ZXh0OiBzdHJpbmc7IHJlc3BvbnNlUGFydElkPzogc3RyaW5nIH0gfSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBpZCk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlQ2hhdCcsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRjaGF0LFxuXHRcdFx0Li4uKHNvdXJjZSA/IHsgc291cmNlIH0gOiB7fSksXG5cdFx0fSwgMzBfMDAwKTtcblx0XHRyZXR1cm4gY2hhdDtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpOiBzdHJpbmcpOiBQcm9taXNlPFNlc3Npb25TdGF0ZT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdHJldHVybiByZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIFNlc3Npb25TdGF0ZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNoYXRTdGF0ZShjaGF0VXJpOiBzdHJpbmcpOiBQcm9taXNlPENoYXRTdGF0ZT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0VXJpIH0pO1xuXHRcdHJldHVybiByZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIENoYXRTdGF0ZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlbmFtZShjaGFubmVsOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcsIGNsaWVudFNlcSA9IDEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbCxcblx0XHRcdGNsaWVudFNlcSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlIH0sXG5cdFx0fSk7XG5cdFx0aWYgKGlzQWhwQ2hhdENoYW5uZWwoY2hhbm5lbCkpIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYW5uZWwpO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi9jaGF0VXBkYXRlZCcpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHNlc3Npb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgY2hhdDogc3RyaW5nOyBjaGFuZ2VzOiB7IHRpdGxlPzogc3RyaW5nIH0gfTtcblx0XHRcdFx0cmV0dXJuIGFjdGlvbi5jaGF0ID09PSBjaGFubmVsICYmIGFjdGlvbi5jaGFuZ2VzLnRpdGxlID09PSB0aXRsZTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vdGl0bGVDaGFuZ2VkJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbm5lbCxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gcHJvdmlkZXJUZXN0KHRpdGxlOiBzdHJpbmcsIHJ1bjogTW9jaGEuQXN5bmNGdW5jLCBlbmFibGVkID0gY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk6IHZvaWQge1xuXHRcdGlmIChjb250ZXh0LnRpZXIgIT09ICdwYXJpdHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdChlbmFibGVkID8gdGVzdCA6IHRlc3Quc2tpcCkodGl0bGUsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRcdHJldHVybiBydW4uY2FsbCh0aGlzKTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZpbGVSZWFkVG9vbE5hbWVzKHByb3ZpZGVyOiBzdHJpbmcpOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0c3dpdGNoIChwcm92aWRlcikge1xuXHRcdFx0Y2FzZSAnY2xhdWRlJzpcblx0XHRcdFx0cmV0dXJuIFsnUmVhZCddO1xuXHRcdFx0Y2FzZSAnY29waWxvdGNsaSc6XG5cdFx0XHRcdHJldHVybiBbJ3ZpZXcnXTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBbJ1JlYWQnLCAndmlldycsICdzaGVsbCddO1xuXHRcdH1cblx0fVxuXG5cdGludGVyZmFjZSBJT2JzZXJ2ZWRNb2RlbE1lc3NhZ2Uge1xuXHRcdHJlYWRvbmx5IHJvbGU6IHN0cmluZztcblx0XHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdH1cblxuXHRmdW5jdGlvbiBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoYm9keTogc3RyaW5nKTogcmVhZG9ubHkgSU9ic2VydmVkTW9kZWxNZXNzYWdlW10ge1xuXHRcdGNvbnN0IHJlcXVlc3Q6IHVua25vd24gPSBKU09OLnBhcnNlKGJvZHkpO1xuXHRcdGlmICghaXNSZWNvcmQocmVxdWVzdCkgfHwgIUFycmF5LmlzQXJyYXkocmVxdWVzdC5tZXNzYWdlcykpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcXVlc3QubWVzc2FnZXMuZmxhdE1hcChtZXNzYWdlID0+IHtcblx0XHRcdGlmICghaXNSZWNvcmQobWVzc2FnZSkgfHwgdHlwZW9mIG1lc3NhZ2Uucm9sZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFt7IHJvbGU6IG1lc3NhZ2Uucm9sZSwgY29udGVudDogbW9kZWxDb250ZW50VGV4dChtZXNzYWdlLmNvbnRlbnQpIH1dO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gbW9kZWxDb250ZW50VGV4dCh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKG1vZGVsQ29udGVudFRleHQpLmpvaW4oJycpO1xuXHRcdH1cblx0XHRpZiAoaXNSZWNvcmQodmFsdWUpKSB7XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlLnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZS50ZXh0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1vZGVsQ29udGVudFRleHQodmFsdWUuY29udGVudCk7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGZ1bmN0aW9uIGlzUmVjb3JkKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsO1xuXHR9XG5cblx0ZnVuY3Rpb24gZm9ya1Byb3ZpZGVyVGVzdCh0aXRsZTogc3RyaW5nLCBydW46IE1vY2hhLkFzeW5jRnVuYyk6IHZvaWQge1xuXHRcdGlmIChjb250ZXh0LnRpZXIgIT09ICdwYXJpdHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdChjb25maWcuc3VwcG9ydHNDaGF0Rm9ya0UyRSA/IHRlc3QgOiB0ZXN0LnNraXApKHRpdGxlLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0XHRyZXR1cm4gcnVuLmNhbGwodGhpcyk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBkcml2ZVR1cm4oXG5cdFx0Y2hhdFVyaTogc3RyaW5nLFxuXHRcdHR1cm5JZDogc3RyaW5nLFxuXHRcdHRleHQ6IHN0cmluZyxcblx0XHRjbGllbnRTZXE6IG51bWJlcixcblx0XHRhdHRhY2htZW50cz86IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sXG5cdCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdGNoYW5uZWw6IGNoYXRVcmksXG5cdFx0XHRjbGllbnRTZXEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0LCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCAuLi4oYXR0YWNobWVudHMgPyB7IGF0dGFjaG1lbnRzOiBbLi4uYXR0YWNobWVudHNdIH0gOiB7fSkgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8b2JqZWN0PigpO1xuXHRcdGxldCBuZXh0Q2xpZW50U2VxID0gY2xpZW50U2VxICsgMTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0aWYgKHNlZW4uaGFzKG4gYXMgb2JqZWN0KVxuXHRcdFx0XHRcdHx8ICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpXG5cdFx0XHRcdFx0XHQmJiAhaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdFx0XHRcdCYmICFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9lcnJvcicpKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYXRVcmkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09IHR1cm5JZDtcblx0XHRcdH0sIDkwXzAwMCk7XG5cdFx0XHRzZWVuLmFkZChub3RpZmljYXRpb24gYXMgb2JqZWN0KTtcblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihub3RpZmljYXRpb24sICdjaGF0L2Vycm9yJykpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobm90aWZpY2F0aW9uKS5hY3Rpb24gYXMgQ2hhdEVycm9yQWN0aW9uO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFBlZXIgY2hhdCBlcnJvciBkdXJpbmcgJHt0dXJuSWR9OiAke0pTT04uc3RyaW5naWZ5KGFjdGlvbi5lcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obm90aWZpY2F0aW9uLCAnY2hhdC90dXJuQ29tcGxldGUnKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG5vdGlmaWNhdGlvbikuYWN0aW9uIGFzIENoYXRUb29sQ2FsbFJlYWR5QWN0aW9uO1xuXHRcdFx0aWYgKCFhY3Rpb24uY29uZmlybWVkKSB7XG5cdFx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRjaGFubmVsOiBjaGF0VXJpLFxuXHRcdFx0XHRcdGNsaWVudFNlcTogbmV4dENsaWVudFNlcSsrLFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtkb3duUGFydElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IHBpZWNlczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG5vdGlmaWNhdGlvbiBvZiBjb250ZXh0LmNsaWVudC5yZWNlaXZlZE5vdGlmaWNhdGlvbnMobiA9PlxuXHRcdFx0KGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Jlc3BvbnNlUGFydCcpIHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2RlbHRhJykpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWRcblx0XHQpKSB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmFjdGlvbjtcblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0ICYmIGFjdGlvbi5wYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pIHtcblx0XHRcdFx0bWFya2Rvd25QYXJ0SWRzLmFkZChhY3Rpb24ucGFydC5pZCk7XG5cdFx0XHRcdHBpZWNlcy5wdXNoKGFjdGlvbi5wYXJ0LmNvbnRlbnQpO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RGVsdGEgJiYgbWFya2Rvd25QYXJ0SWRzLmhhcyhhY3Rpb24ucGFydElkKSkge1xuXHRcdFx0XHRwaWVjZXMucHVzaChhY3Rpb24uY29udGVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBwaWVjZXMuam9pbignJyk7XG5cdH1cblxuXHRwcm92aWRlckhvc3RPbmx5VGVzdChjb250ZXh0LCAnYWdlbnQgYWR2ZXJ0aXNlcyBpdHMgbXVsdGlwbGUgY2hhdCBjYXBhYmlsaXR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NhcGFiaWxpdHknKTtcblx0XHRjb25zdCByb290ID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnN0IGFnZW50ID0gKHJvb3Quc25hcHNob3QhLnN0YXRlIGFzIFJvb3RTdGF0ZSkuYWdlbnRzLmZpbmQoYWdlbnQgPT4gYWdlbnQucHJvdmlkZXIgPT09IGNvbmZpZy5wcm92aWRlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG11bHRpcGxlQ2hhdHM6ICEhYWdlbnQ/LmNhcGFiaWxpdGllcz8ubXVsdGlwbGVDaGF0cyxcblx0XHRcdGZvcms6IGFnZW50Py5jYXBhYmlsaXRpZXM/Lm11bHRpcGxlQ2hhdHM/LmZvcmsgPz8gZmFsc2UsXG5cdFx0XHRzaWRlQ2hhdDogYWdlbnQ/LmNhcGFiaWxpdGllcz8ubXVsdGlwbGVDaGF0cz8uc2lkZUNoYXQgPz8gZmFsc2UsXG5cdFx0fSwge1xuXHRcdFx0bXVsdGlwbGVDaGF0czogY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyxcblx0XHRcdGZvcms6IGNvbmZpZy5zdXBwb3J0c0NoYXRGb3JrLFxuXHRcdFx0c2lkZUNoYXQ6IGNvbmZpZy5zdXBwb3J0c1NpZGVDaGF0cyA/PyBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0cHJvdmlkZXJIb3N0T25seVRlc3QoY29udGV4dCwgJ3Byb3ZpZGVyIHdpdGhvdXQgbXVsdGlwbGUgY2hhdCBjYXBhYmlsaXR5IHJlamVjdHMgcGVlciBjcmVhdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Vuc3VwcG9ydGVkJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3Vuc3VwcG9ydGVkLXBlZXInKSxcblx0XHRcdC9kb2VzIG5vdCBzdXBwb3J0IG11bHRpcGxlIGNoYXRzL2ksXG5cdFx0KTtcblx0fSwgIWNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY3JlYXRpbmcgYSBwZWVyIGNoYXQgYWRkcyBpdCB0byB0aGUgc2Vzc2lvbiBjYXRhbG9nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignY2F0YWxvZy1hZGQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLnNvbWUoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBwZWVyKSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncGVlciBjaGF0IHN1YnNjcmlwdGlvbiBzdGFydHMgZW1wdHkgYW5kIGlkbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdlbXB0eS1wZWVyJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhdFN0YXRlKHBlZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHR1cm5zOiBzdGF0ZS50dXJucywgYWN0aXZlVHVybjogc3RhdGUuYWN0aXZlVHVybiwgc3RhdHVzOiBzdGF0ZS5zdGF0dXMgfSwge1xuXHRcdFx0dHVybnM6IFtdLFxuXHRcdFx0YWN0aXZlVHVybjogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0fSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY3JlYXRpbmcgdGhlIHNhbWUgcGVlciBjaGF0IHR3aWNlIGlzIGlkZW1wb3RlbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdpZGVtcG90ZW50Jyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5jaGF0cy5maWx0ZXIoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBwZWVyKS5sZW5ndGgsIDEpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NyZWF0aW5nIHR3byBwZWVyIGNoYXRzIHByZXNlcnZlcyBib3RoIGNhdGFsb2cgZW50cmllcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3R3by1wZWVycycpO1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAnZmlyc3QnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdzZWNvbmQnKTtcblxuXHRcdGNvbnN0IHBlZXJzID0gKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuY2hhdHMubWFwKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQub2socGVlcnMuaW5jbHVkZXMoZmlyc3QpICYmIHBlZXJzLmluY2x1ZGVzKHNlY29uZCkpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2Rpc3Bvc2luZyBhIHBlZXIgY2hhdCByZW1vdmVzIGl0cyBjYXRhbG9nIGVudHJ5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZGlzcG9zZScpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsKCdkaXNwb3NlQ2hhdCcsIHsgY2hhbm5lbDogcGVlciB9LCAzMF8wMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLnNvbWUoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBwZWVyKSwgZmFsc2UpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2Rpc3Bvc2luZyBvbmUgcGVlciBjaGF0IHByZXNlcnZlcyBpdHMgc2libGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2Rpc3Bvc2Utb25lJyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3NlY29uZCcpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZUNoYXQnLCB7IGNoYW5uZWw6IGZpcnN0IH0sIDMwXzAwMCk7XG5cblx0XHRjb25zdCBwZWVycyA9IChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5vayghcGVlcnMuaW5jbHVkZXMoZmlyc3QpICYmIHBlZXJzLmluY2x1ZGVzKHNlY29uZCkpO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3JlY3JlYXRpbmcgYSBkaXNwb3NlZCBwZWVyIGNoYXQgc3RhcnRzIGVtcHR5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVjcmVhdGUnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGwoJ2Rpc3Bvc2VDaGF0JywgeyBjaGFubmVsOiBwZWVyIH0sIDMwXzAwMCk7XG5cblx0XHRhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUocGVlcikpLnR1cm5zLCBbXSk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVuYW1pbmcgYSBwZWVyIGNoYXQgdXBkYXRlcyBpdHMgY2F0YWxvZyB0aXRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3JlbmFtZS1wZWVyJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGF3YWl0IHJlbmFtZShwZWVyLCAnUGVlciBUaXRsZScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNoYXRzLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBwZWVyKT8udGl0bGUsICdQZWVyIFRpdGxlJyk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncmVuYW1pbmcgYSBwZWVyIGNoYXQgbGVhdmVzIHRoZSBzZXNzaW9uIHRpdGxlIHVuY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3JlbmFtZS1pc29sYXRlZCcpO1xuXHRcdGF3YWl0IHJlbmFtZShzZXNzaW9uVXJpLCAnU2Vzc2lvbiBUaXRsZScpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cblx0XHRhd2FpdCByZW5hbWUocGVlciwgJ1BlZXIgVGl0bGUnLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS50aXRsZSwgJ1Nlc3Npb24gVGl0bGUnKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwZWVyIGNoYXQgc3Vydml2ZXMgdW5zdWJzY3JpYmUgYW5kIHJlc3Vic2NyaWJlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVzdWJzY3JpYmUnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0Y29udGV4dC5jbGllbnQubm90aWZ5KCd1bnN1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKHBlZXIpKS5yZXNvdXJjZSwgcGVlcik7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAncGVlciBjcmVhdGlvbiBkb2VzIG5vdCBsZWFrIGEgcHJvdmlkZXIgYmFja2luZyBhcyBhIHRvcC1sZXZlbCBzZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignc2Vzc2lvbi1saXN0Jyk7XG5cdFx0Y29uc3QgYmVmb3JlID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXG5cdFx0YXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0Y29uc3QgYWZ0ZXIgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPExpc3RTZXNzaW9uc1Jlc3VsdD4oJ2xpc3RTZXNzaW9ucycsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0Y29uc3QgYmVmb3JlUmVzb3VyY2VzID0gbmV3IFNldChiZWZvcmUuaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5yZXNvdXJjZSkpO1xuXHRcdGNvbnN0IHVuZXhwZWN0ZWQgPSBhZnRlci5pdGVtc1xuXHRcdFx0Lm1hcChpdGVtID0+IGl0ZW0ucmVzb3VyY2UpXG5cdFx0XHQuZmlsdGVyKHJlc291cmNlID0+ICFiZWZvcmVSZXNvdXJjZXMuaGFzKHJlc291cmNlKSAmJiByZXNvdXJjZSAhPT0gc2Vzc2lvblVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVuZXhwZWN0ZWQsIFtdKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwZWVyIGZpbGUgY29tcGxldGlvbiB1c2VzIHRoZSBwYXJlbnQgd29ya3NwYWNlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjb21wbGV0aW9uJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKHdvcmtzcGFjZSwgJ3BlZXItdGFyZ2V0LnR4dCcpLCAndGFyZ2V0Jyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxDb21wbGV0aW9uc1Jlc3VsdD4oJ2NvbXBsZXRpb25zJywge1xuXHRcdFx0Y2hhbm5lbDogcGVlcixcblx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Vc2VyTWVzc2FnZSxcblx0XHRcdHRleHQ6ICdAcGVlci10Jyxcblx0XHRcdG9mZnNldDogJ0BwZWVyLXQnLmxlbmd0aCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGlvbnMuaXRlbXMubWFwKGl0ZW0gPT4gaXRlbS5pbnNlcnRUZXh0KSwgWydAcGVlci10YXJnZXQudHh0J10pO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2ZpcnN0IHBlZXIgY2hhdCBzbmFwc2hvdHMgdGhlIHNlc3Npb24gdGl0bGUgb250byB0aGUgZGVmYXVsdCBjaGF0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgZGVmYXVsdENoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2RlZmF1bHQtdGl0bGUnKTtcblx0XHRhd2FpdCByZW5hbWUoc2Vzc2lvblVyaSwgJ09yaWdpbmFsIFNlc3Npb24nKTtcblxuXHRcdGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5jaGF0cy5maW5kKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSA9PT0gZGVmYXVsdENoYXRVcmkpPy50aXRsZSwgJ09yaWdpbmFsIFNlc3Npb24nKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdzZXNzaW9uIHJlbmFtZSBhZnRlciBwZWVyIGNyZWF0aW9uIHByZXNlcnZlcyB0aGUgZGVmYXVsdCBjaGF0IHRpdGxlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgZGVmYXVsdENoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2luZGVwZW5kZW50LXRpdGxlJyk7XG5cdFx0YXdhaXQgcmVuYW1lKHNlc3Npb25VcmksICdPcmlnaW5hbCBTZXNzaW9uJyk7XG5cdFx0YXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXG5cdFx0YXdhaXQgcmVuYW1lKHNlc3Npb25VcmksICdSZW5hbWVkIFNlc3Npb24nLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5jaGF0cy5maW5kKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSA9PT0gZGVmYXVsdENoYXRVcmkpPy50aXRsZSwgJ09yaWdpbmFsIFNlc3Npb24nKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdmb3JraW5nIGFuIHVua25vd24gdHVybiBjcmVhdGVzIGEgZnJlc2ggZW1wdHkgcGVlciBjaGF0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgZGVmYXVsdENoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3Vua25vd24tZm9yaycpO1xuXG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ2ZvcmsnLCB7IGtpbmQ6IENoYXRTb3VyY2VLaW5kLkZvcmssIGNoYXQ6IGRlZmF1bHRDaGF0VXJpLCB0dXJuSWQ6ICdtaXNzaW5nLXR1cm4nIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKHBlZXIpKS50dXJucywgW10pO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgY2hhdCBjb21wbGV0ZXMgYSBzaW1wbGUgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3BlZXItdHVybicpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci10dXJuJywgJ1JlcGx5IGV4YWN0bHkgXCJQRUVSX09LXCIuJywgMSk7XG5cblx0XHRhc3NlcnQubWF0Y2gocmVzcG9uc2UsIC9QRUVSX09LLyk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciBjaGF0IHJldGFpbnMgY29udGV4dCBhY3Jvc3MgY29uc2VjdXRpdmUgdHVybnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdwZWVyLWNvbnRleHQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0Y29uc3QgZmlyc3RSZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1jb250ZXh0LTEnLCAnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBQRUFSLiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAxKTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1jb250ZXh0LTInLCAnV2hhdCBjb2RlIHdvcmQgZGlkIEkgYXNrIHlvdSB0byByZW1lbWJlcj8gUmVwbHkgd2l0aCBvbmx5IHRoZSBjb2RlIHdvcmQuJywgMik7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpO1xuXHRcdGNvbnN0IHByaW9yQXNzaXN0YW50UmVzcG9uc2UgPSBmaXJzdFJlc3BvbnNlLnRyaW0oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJpb3JBc3Npc3RhbnRSZXNwb25zZUlzTm9uRW1wdHk6IHByaW9yQXNzaXN0YW50UmVzcG9uc2UubGVuZ3RoID4gMCxcblx0XHRcdHJlc3BvbnNlSGFzQ29kZVdvcmQ6IC9QRUFSL2kudGVzdChyZXNwb25zZSksXG5cdFx0XHRyZXF1ZXN0SGFzUHJpb3JVc2VyTWVzc2FnZTogbWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInICYmIG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBQRUFSJykpLFxuXHRcdFx0cmVxdWVzdEhhc1ByaW9yQXNzaXN0YW50TWVzc2FnZTogbWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ2Fzc2lzdGFudCcgJiYgbWVzc2FnZS5jb250ZW50LmluY2x1ZGVzKHByaW9yQXNzaXN0YW50UmVzcG9uc2UpKSxcblx0XHR9LCB7XG5cdFx0XHRwcmlvckFzc2lzdGFudFJlc3BvbnNlSXNOb25FbXB0eTogdHJ1ZSxcblx0XHRcdHJlc3BvbnNlSGFzQ29kZVdvcmQ6IHRydWUsXG5cdFx0XHRyZXF1ZXN0SGFzUHJpb3JVc2VyTWVzc2FnZTogdHJ1ZSxcblx0XHRcdHJlcXVlc3RIYXNQcmlvckFzc2lzdGFudE1lc3NhZ2U6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZvcmtQcm92aWRlclRlc3QoJ2ZvcmtlZCBwZWVyIGNoYXQgaW5oZXJpdHMgc291cmNlIGhpc3RvcnkgdGhyb3VnaCB0aGUgcHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZm9yay1oaXN0b3J5Jyk7XG5cdFx0Y29uc3Qgc291cmNlUmVzcG9uc2UgPSBhd2FpdCBkcml2ZVR1cm4oZGVmYXVsdENoYXRVcmksICdmb3JrLXNvdXJjZScsICdSZW1lbWJlciB0aGUgY29kZSB3b3JkIEZPUktDT0RFLiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAxKTtcblxuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdmb3JrJywgeyBraW5kOiBDaGF0U291cmNlS2luZC5Gb3JrLCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdHVybklkOiAnZm9yay1zb3VyY2UnIH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHJpdmVUdXJuKHBlZXIsICdmb3JrLXR1cm4nLCAnV2hhdCBjb2RlIHdvcmQgZGlkIEkgYXNrIHlvdSB0byByZW1lbWJlcj8gUmVwbHkgd2l0aCBvbmx5IHRoZSBjb2RlIHdvcmQuJywgMik7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpO1xuXHRcdGNvbnN0IHByaW9yQXNzaXN0YW50UmVzcG9uc2UgPSBzb3VyY2VSZXNwb25zZS50cmltKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlZWRlZE1lc3NhZ2VzOiAoYXdhaXQgY2hhdFN0YXRlKHBlZXIpKS50dXJucy5tYXAodHVybiA9PiB0dXJuLm1lc3NhZ2UudGV4dCksXG5cdFx0XHRwcmlvckFzc2lzdGFudFJlc3BvbnNlSXNOb25FbXB0eTogcHJpb3JBc3Npc3RhbnRSZXNwb25zZS5sZW5ndGggPiAwLFxuXHRcdFx0cmVzcG9uc2VIYXNDb2RlV29yZDogL0ZPUktDT0RFL2kudGVzdChyZXNwb25zZSksXG5cdFx0XHRyZXF1ZXN0SGFzUHJpb3JVc2VyTWVzc2FnZTogbWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2Uucm9sZSA9PT0gJ3VzZXInICYmIG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBGT1JLQ09ERScpKSxcblx0XHRcdHJlcXVlc3RIYXNQcmlvckFzc2lzdGFudE1lc3NhZ2U6IG1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLnJvbGUgPT09ICdhc3Npc3RhbnQnICYmIG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcyhwcmlvckFzc2lzdGFudFJlc3BvbnNlKSksXG5cdFx0fSwge1xuXHRcdFx0c2VlZGVkTWVzc2FnZXM6IFtcblx0XHRcdFx0J1JlbWVtYmVyIHRoZSBjb2RlIHdvcmQgRk9SS0NPREUuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsXG5cdFx0XHRcdCdXaGF0IGNvZGUgd29yZCBkaWQgSSBhc2sgeW91IHRvIHJlbWVtYmVyPyBSZXBseSB3aXRoIG9ubHkgdGhlIGNvZGUgd29yZC4nLFxuXHRcdFx0XSxcblx0XHRcdHByaW9yQXNzaXN0YW50UmVzcG9uc2VJc05vbkVtcHR5OiB0cnVlLFxuXHRcdFx0cmVzcG9uc2VIYXNDb2RlV29yZDogdHJ1ZSxcblx0XHRcdHJlcXVlc3RIYXNQcmlvclVzZXJNZXNzYWdlOiB0cnVlLFxuXHRcdFx0cmVxdWVzdEhhc1ByaW9yQXNzaXN0YW50TWVzc2FnZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdkaXNwb3NpbmcgYSBwZWVyIGFmdGVyIGEgY29tcGxldGVkIHR1cm4gcmVtb3ZlcyBpdCBmcm9tIHRoZSBjYXRhbG9nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZGlzcG9zZS1hZnRlci10dXJuJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItdHVybicsICdSZXBseSBleGFjdGx5IFwiRE9ORVwiLicsIDEpO1xuXG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZUNoYXQnLCB7IGNoYW5uZWw6IHBlZXIgfSwgMzBfMDAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5jaGF0cy5zb21lKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSA9PT0gcGVlciksIGZhbHNlKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdwZWVyIHJlbmFtZSBjb21tYW5kIHVwZGF0ZXMgdGhlIHBlZXIgdGl0bGUgYW5kIHJlY29yZHMgYSBsb2NhbCB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbG9jYWwtcmVuYW1lJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1yZW5hbWUnLCAnL3JlbmFtZSBSZW5hbWVkIFBlZXInLCAxKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhdFN0YXRlKHBlZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGl0bGU6IHN0YXRlLnRpdGxlLFxuXHRcdFx0bWVzc2FnZXM6IHN0YXRlLnR1cm5zLm1hcCh0dXJuID0+IHR1cm4ubWVzc2FnZS50ZXh0KSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ1JlbmFtZWQgUGVlcicsXG5cdFx0XHRtZXNzYWdlczogWycvcmVuYW1lIFJlbmFtZWQgUGVlciddLFxuXHRcdH0pO1xuXHR9LCBjb25maWcuc3VwcG9ydHNNdWx0aXBsZUNoYXRzKTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2VtcHR5IHBlZXIgcmVuYW1lIGNvbW1hbmQgbGVhdmVzIHRoZSBwZWVyIHRpdGxlIHVuY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2xvY2FsLWVtcHR5LXJlbmFtZScpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgcmVuYW1lKHBlZXIsICdPcmlnaW5hbCBQZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItZW1wdHktcmVuYW1lJywgJy9yZW5hbWUnLCAyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKHBlZXIpKS50aXRsZSwgJ09yaWdpbmFsIFBlZXInKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdmYWlsaW5nIHBlZXIgYmFuZyBjb21tYW5kIHJlY29yZHMgYSBmYWlsZWQgdGVybWluYWwgdG9vbCBjYWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignbG9jYWwtYmFuZy1mYWlsdXJlJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1iYW5nLWZhaWx1cmUnLCAnIW5vZGUgLWUgXCJwcm9jZXNzLmV4aXQoNylcIicsIDEpO1xuXG5cdFx0Y29uc3QgdG9vbENhbGxzID0gKGF3YWl0IGNoYXRTdGF0ZShwZWVyKSkudHVybnMuZmxhdE1hcCh0dXJuID0+IHR1cm4ucmVzcG9uc2VQYXJ0cylcblx0XHRcdC5maWx0ZXIocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpXG5cdFx0XHQubWFwKHBhcnQgPT4gcGFydC50b29sQ2FsbCk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xDYWxscy5zb21lKHRvb2xDYWxsID0+IHRvb2xDYWxsLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgJiYgIXRvb2xDYWxsLnN1Y2Nlc3MpKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgcmVhZHMgYSBmaWxlIGZyb20gdGhlIHBhcmVudCB3b3Jrc3BhY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3JlYWQtZmlsZScpO1xuXHRcdGNvbnN0IGZpbGUgPSBqb2luKHdvcmtzcGFjZSwgJ3BlZXItbm90ZS50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGZpbGUsICdQRUVSX0ZJTEVfVkFMVUUnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItcmVhZCcsIGBSZWFkIHRoZSBmaWxlIGF0ICR7ZmlsZX0gYW5kIHJlcGx5IHdpdGggaXRzIGV4YWN0IGNvbnRlbnRzIG9ubHkuYCwgMSk7XG5cblx0XHRhc3NlcnQubWF0Y2gocmVzcG9uc2UsIC9QRUVSX0ZJTEVfVkFMVUUvKTtcblx0XHRhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dChjb250ZXh0LmNsaWVudCwge1xuXHRcdFx0Y2hhbm5lbDogcGVlcixcblx0XHRcdHR1cm5JZDogJ3BlZXItcmVhZCcsXG5cdFx0XHR0b29sTmFtZXM6IGZpbGVSZWFkVG9vbE5hbWVzKGNvbmZpZy5wcm92aWRlciksXG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRleHBlY3RlZDogWy9QRUVSX0ZJTEVfVkFMVUUvXSxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciBjaGF0IHJlYWRzIGEgZmlsZSBmcm9tIGEgbmVzdGVkIGRpcmVjdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVhZC1uZXN0ZWQtZmlsZScpO1xuXHRcdG1rZGlyU3luYyhqb2luKHdvcmtzcGFjZSwgJ25lc3RlZCcpKTtcblx0XHRjb25zdCBmaWxlID0gam9pbih3b3Jrc3BhY2UsICduZXN0ZWQnLCAncGVlci50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGZpbGUsICdQRUVSX05FU1RFRF9SRUFEJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXJlYWQtbmVzdGVkJywgYFJlYWQgdGhlIGZpbGUgYXQgJHtmaWxlfSBhbmQgcmVwbHkgd2l0aCBpdHMgZXhhY3QgY29udGVudHMgb25seS5gLCAxKTtcblxuXHRcdGFzc2VydC5tYXRjaChyZXNwb25zZSwgL1BFRVJfTkVTVEVEX1JFQUQvKTtcblx0XHRhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dChjb250ZXh0LmNsaWVudCwge1xuXHRcdFx0Y2hhbm5lbDogcGVlcixcblx0XHRcdHR1cm5JZDogJ3BlZXItcmVhZC1uZXN0ZWQnLFxuXHRcdFx0dG9vbE5hbWVzOiBmaWxlUmVhZFRvb2xOYW1lcyhjb25maWcucHJvdmlkZXIpLFxuXHRcdFx0d29ya3NwYWNlLFxuXHRcdFx0ZXhwZWN0ZWQ6IFsvUEVFUl9ORVNURURfUkVBRC9dLFxuXHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgY3JlYXRlcyBhIGZpbGUgaW4gdGhlIHBhcmVudCB3b3Jrc3BhY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NyZWF0ZS1maWxlJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlci1jcmVhdGVkLnR4dCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItY3JlYXRlJywgYENyZWF0ZSB0aGUgZmlsZSBhdCAke2ZpbGV9IGNvbnRhaW5pbmcgZXhhY3RseSBQRUVSX0NSRUFURUQuYCwgMSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZEZpbGVTeW5jKGZpbGUsICd1dGY4JyksICdQRUVSX0NSRUFURUQnKTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgZWRpdHMgYW4gZXhpc3Rpbmcgd29ya3NwYWNlIGZpbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2VkaXQtZmlsZScpO1xuXHRcdGNvbnN0IGZpbGUgPSBqb2luKHdvcmtzcGFjZSwgJ3BlZXItZWRpdC50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGZpbGUsICdCRUZPUkVfUEVFUicpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItZWRpdCcsIGBSZXBsYWNlIHRoZSBjb21wbGV0ZSBjb250ZW50cyBvZiAke2ZpbGV9IHdpdGggQUZURVJfUEVFUi4ke1BSRUZFUl9GSUxFX1RPT0xTfWAsIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRGaWxlU3luYyhmaWxlLCAndXRmOCcpLnRyaW0oKSwgJ0FGVEVSX1BFRVInKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIGNoYXQgY3JlYXRlcyBhIGZpbGUgaW4gYSBuZXN0ZWQgZGlyZWN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCduZXN0ZWQtY3JlYXRlJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlci1vdXRwdXQnLCAncmVwb3J0LnR4dCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHQvLyBQaW5uZWQgZm9yIHRoZSBzYW1lIHJlYXNvbiBhcyBgY3JlYXRlcyBhIGZpbGUgaW4gYSBuZXcgbmVzdGVkIGRpcmVjdG9yeWBcblx0XHQvLyBpbiBmaWxlT3BlcmF0aW9uc1N1aXRlOiBkaXJlY3RvcnkgY3JlYXRpb24gaGFzIG5vIGZpbGUgdG9vbC4gUmVsYXRpdmUgdG9cblx0XHQvLyB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3J5IHNvIHRoZSBjb21tYW5kIGNhcnJpZXMgbm8gYWJzb2x1dGUgcGF0aCxcblx0XHQvLyB3aGljaCB3b3VsZCBuZWVkIGVzY2FwaW5nIG9uIFdpbmRvd3MuXG5cdFx0Y29uc3QgcGVlck5lc3RlZENvbW1hbmQgPSBgbm9kZSAtZSBcImNvbnN0IGZzPXJlcXVpcmUoJ2ZzJyk7ZnMubWtkaXJTeW5jKCdwZWVyLW91dHB1dCcse3JlY3Vyc2l2ZTp0cnVlfSk7ZnMud3JpdGVGaWxlU3luYygncGVlci1vdXRwdXQvcmVwb3J0LnR4dCcsJ1BFRVJfTkVTVEVEJylcImA7XG5cdFx0YXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLW5lc3RlZC1jcmVhdGUnLCBgUnVuIGV4YWN0bHkgdGhpcyBzaGVsbCBjb21tYW5kLCB3aXRoIG5vIG1vZGlmaWNhdGlvbnM6IFxcYCR7cGVlck5lc3RlZENvbW1hbmR9XFxgLiBUaGVuIHJlcGx5IHdpdGggZXhhY3RseSBcImNyZWF0ZWRcIi5gLCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRmlsZVN5bmMoZmlsZSwgJ3V0ZjgnKSwgJ1BFRVJfTkVTVEVEJyk7XG5cdH0sIGNvbmZpZy5zdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciBjaGF0IGhhbmRsZXMgYSBtaXNzaW5nIHdvcmtzcGFjZSBmaWxlIHdpdGhvdXQgYW4gZXJyb3InLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ21pc3NpbmctZmlsZScpO1xuXHRcdGNvbnN0IGZpbGUgPSBqb2luKHdvcmtzcGFjZSwgJ3BlZXItbWlzc2luZy50eHQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItbWlzc2luZycsIGBUcnkgdG8gcmVhZCAke2ZpbGV9LiBJZiBpdCBkb2VzIG5vdCBleGlzdCwgcmVwbHkgZXhhY3RseSBcIm1pc3NpbmdcIi4ke1BSRUZFUl9GSUxFX1RPT0xTfWAsIDEpO1xuXG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3BvbnNlLCAvbWlzc2luZy9pKTtcblx0XHRhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dChjb250ZXh0LmNsaWVudCwge1xuXHRcdFx0Y2hhbm5lbDogcGVlcixcblx0XHRcdHR1cm5JZDogJ3BlZXItbWlzc2luZycsXG5cdFx0XHR0b29sTmFtZXM6IGZpbGVSZWFkVG9vbE5hbWVzKGNvbmZpZy5wcm92aWRlciksXG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRleHBlY3RlZDogWy9kb2VzIG5vdCBleGlzdC9dLFxuXHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHByb3ZpZGVyVGVzdCgncGVlciBjaGF0IHJlYWRzIGEgZmlsZW5hbWUgY29udGFpbmluZyBzcGFjZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCB3b3Jrc3BhY2UgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3NwYWNlcycpO1xuXHRcdGNvbnN0IGZpbGUgPSBqb2luKHdvcmtzcGFjZSwgJ3BlZXIgZmlsZS50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGZpbGUsICdQRUVSX1NQQUNFRCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1zcGFjZXMnLCBgUmVhZCB0aGUgZmlsZSBhdCAke2ZpbGV9IGFuZCByZXBseSB3aXRoIGl0cyBleGFjdCBjb250ZW50cyBvbmx5LmAsIDEpO1xuXG5cdFx0YXNzZXJ0Lm1hdGNoKHJlc3BvbnNlLCAvUEVFUl9TUEFDRUQvKTtcblx0XHRhc3NlcnRUb29sQ2FsbENvbXBsZXRlVGV4dChjb250ZXh0LmNsaWVudCwge1xuXHRcdFx0Y2hhbm5lbDogcGVlcixcblx0XHRcdHR1cm5JZDogJ3BlZXItc3BhY2VzJyxcblx0XHRcdHRvb2xOYW1lczogZmlsZVJlYWRUb29sTmFtZXMoY29uZmlnLnByb3ZpZGVyKSxcblx0XHRcdHdvcmtzcGFjZSxcblx0XHRcdGV4cGVjdGVkOiBbL1BFRVJfU1BBQ0VEL10sXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3R3byBwZWVyIGNoYXRzIHdyaXRlIGRpc3RpbmN0IHdvcmtzcGFjZSBmaWxlcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigndHdvLXdyaXRlcnMnKTtcblx0XHRjb25zdCBmaXJzdEZpbGUgPSBqb2luKHdvcmtzcGFjZSwgJ2ZpcnN0LXBlZXIudHh0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kRmlsZSA9IGpvaW4od29ya3NwYWNlLCAnc2Vjb25kLXBlZXIudHh0Jyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3NlY29uZCcpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBmaXJzdCB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vjb25kIH0pO1xuXG5cdFx0YXdhaXQgZHJpdmVUdXJuKGZpcnN0LCAnZmlyc3Qtd3JpdGUnLCBgQ3JlYXRlIHRoZSBmaWxlIGF0ICR7Zmlyc3RGaWxlfSBjb250YWluaW5nIGV4YWN0bHkgRklSU1RfUEVFUi5gLCAxKTtcblx0XHRhd2FpdCBkcml2ZVR1cm4oc2Vjb25kLCAnc2Vjb25kLXdyaXRlJywgYENyZWF0ZSB0aGUgZmlsZSBhdCAke3NlY29uZEZpbGV9IGNvbnRhaW5pbmcgZXhhY3RseSBTRUNPTkRfUEVFUi5gLCAxMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0OiByZWFkRmlsZVN5bmMoZmlyc3RGaWxlLCAndXRmOCcpLFxuXHRcdFx0c2Vjb25kOiByZWFkRmlsZVN5bmMoc2Vjb25kRmlsZSwgJ3V0ZjgnKSxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdDogJ0ZJUlNUX1BFRVInLFxuXHRcdFx0c2Vjb25kOiAnU0VDT05EX1BFRVInLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ2ZyZXNoIHBlZXIgY2hhdCBkb2VzIG5vdCBpbmhlcml0IGRlZmF1bHQgY2hhdCBjb250ZXh0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgZGVmYXVsdENoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2ZyZXNoLWNvbnRleHQnKTtcblx0XHRhd2FpdCBkcml2ZVR1cm4oZGVmYXVsdENoYXRVcmksICdkZWZhdWx0LXNlY3JldCcsICdSZW1lbWJlciB0aGUgY29kZSB3b3JkIERFRkFVTFRTRUNSRVQuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItZnJlc2gtY29udGV4dCcsICdSZXBseSBleGFjdGx5IFwiZnJlc2hcIi4nLCAxMCk7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ0RFRkFVTFRTRUNSRVQnKSksIGZhbHNlKTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyk7XG5cblx0cHJvdmlkZXJUZXN0KCdzaWRlIGNoYXQgcmVjZWl2ZXMgYm91bmRlZCBzb3VyY2UgY29udGV4dCB3aXRob3V0IGNvcGllZCBoaXN0b3J5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgZGVmYXVsdENoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3NpZGUtY29udGV4dCcpO1xuXHRcdGF3YWl0IGRyaXZlVHVybihkZWZhdWx0Q2hhdFVyaSwgJ3R1cm4tc291cmNlJywgJ1JlbWVtYmVyIHRoZSBleGFjdCB0b2tlbiBTSURFQ0hBVDQyIGZvciBhIGxhdGVyIHF1ZXN0aW9uLiBSZXBseSB3aXRoIGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0geyB0ZXh0OiAnTU9PTlZBTEU5OScsIHJlc3BvbnNlUGFydElkOiAncmVzcG9uc2UtcGFydC1zb3VyY2UtMScgfTtcblx0XHRjb25zdCBzaWRlQ2hhdFVyaSA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3NpZGUnLCB7XG5cdFx0XHRraW5kOiBDaGF0U291cmNlS2luZC5TaWRlQ2hhdCxcblx0XHRcdGNoYXQ6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0dHVybklkOiAndHVybi1zb3VyY2UnLFxuXHRcdFx0c2VsZWN0aW9uLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzaWRlQ2hhdFVyaSB9KTtcblxuXHRcdGNvbnN0IHF1ZXN0aW9uID0gJ1JlcGx5IHdpdGggdGhlIGV4YWN0IHJlbWVtYmVyZWQgdG9rZW4sIHRoZW4gYSBzcGFjZSwgdGhlbiB0aGUgZXhhY3Qgc2VsZWN0ZWQgdGV4dCBnaXZlbiB0byB5b3UgYXMgY29udGV4dCBcdTIwMTQgbm90aGluZyBlbHNlLic7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBkcml2ZVR1cm4oc2lkZUNoYXRVcmksICd0dXJuLXNpZGUnLCBxdWVzdGlvbiwgMik7XG5cdFx0Y29uc3QgW3NvdXJjZVN0YXRlLCBzaWRlU3RhdGUsIHNlc3Npb25dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0Y2hhdFN0YXRlKGRlZmF1bHRDaGF0VXJpKSxcblx0XHRcdGNoYXRTdGF0ZShzaWRlQ2hhdFVyaSksXG5cdFx0XHRzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3BvbnNlSW5jbHVkZXNSZW1lbWJlcmVkVG9rZW46IC9TSURFQ0hBVDQyL2kudGVzdChyZXNwb25zZSksXG5cdFx0XHRyZXNwb25zZUluY2x1ZGVzU2VsZWN0ZWRUZXh0OiAvTU9PTlZBTEU5OS9pLnRlc3QocmVzcG9uc2UpLFxuXHRcdFx0c291cmNlVHVybkNvdW50OiBzb3VyY2VTdGF0ZS50dXJucy5sZW5ndGgsXG5cdFx0XHRzaWRlVHVybkNvdW50OiBzaWRlU3RhdGUudHVybnMubGVuZ3RoLFxuXHRcdFx0b3JpZ2luOiBzZXNzaW9uLmNoYXRzLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBzaWRlQ2hhdFVyaSk/Lm9yaWdpbixcblx0XHRcdGZpcnN0TWVzc2FnZTogc2lkZVN0YXRlLnR1cm5zWzBdPy5tZXNzYWdlLnRleHQsXG5cdFx0XHRmaXJzdEF0dGFjaG1lbnRzOiBzaWRlU3RhdGUudHVybnNbMF0/Lm1lc3NhZ2UuYXR0YWNobWVudHMgPz8gW10sXG5cdFx0fSwge1xuXHRcdFx0cmVzcG9uc2VJbmNsdWRlc1JlbWVtYmVyZWRUb2tlbjogdHJ1ZSxcblx0XHRcdHJlc3BvbnNlSW5jbHVkZXNTZWxlY3RlZFRleHQ6IHRydWUsXG5cdFx0XHRzb3VyY2VUdXJuQ291bnQ6IDEsXG5cdFx0XHRzaWRlVHVybkNvdW50OiAxLFxuXHRcdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0LCBjaGF0OiBkZWZhdWx0Q2hhdFVyaSwgdHVybklkOiAndHVybi1zb3VyY2UnLCBzZWxlY3Rpb24gfSxcblx0XHRcdGZpcnN0TWVzc2FnZTogcXVlc3Rpb24sXG5cdFx0XHRmaXJzdEF0dGFjaG1lbnRzOiBbXSxcblx0XHR9KTtcblx0fSwgY29uZmlnLnN1cHBvcnRzTXVsdGlwbGVDaGF0cyAmJiAhIWNvbmZpZy5zdXBwb3J0c1NpZGVDaGF0cyk7XG5cblx0cHJvdmlkZXJUZXN0KCd0d28gcGVlciBjaGF0cyBrZWVwIGluZGVwZW5kZW50IHByb3ZpZGVyIGNvbnRleHRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigndHdvLWNvbnRleHRzJyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3NlY29uZCcpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBmaXJzdCB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vjb25kIH0pO1xuXHRcdGF3YWl0IGRyaXZlVHVybihmaXJzdCwgJ2ZpcnN0LWNvbnRleHQnLCAnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBBTFBIQV9QRUVSLiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAxKTtcblx0XHRhd2FpdCBkcml2ZVR1cm4oc2Vjb25kLCAnc2Vjb25kLWNvbnRleHQnLCAnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBCRVRBX1BFRVIuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEwKTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihmaXJzdCwgJ2ZpcnN0LWZvbGxvd3VwJywgJ1JlcGx5IGV4YWN0bHkgXCJmaXJzdFwiLicsIDIwKTtcblx0XHRjb25zdCBmaXJzdE1lc3NhZ2VzID0gb2JzZXJ2ZWRNb2RlbE1lc3NhZ2VzKGNvbnRleHQub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMuYXQoLTEpID8/ICcnKTtcblx0XHRhd2FpdCBkcml2ZVR1cm4oc2Vjb25kLCAnc2Vjb25kLWZvbGxvd3VwJywgJ1JlcGx5IGV4YWN0bHkgXCJzZWNvbmRcIi4nLCAzMCk7XG5cdFx0Y29uc3Qgc2Vjb25kTWVzc2FnZXMgPSBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaXJzdEhhc0FscGhhOiBmaXJzdE1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ0FMUEhBX1BFRVInKSksXG5cdFx0XHRmaXJzdEhhc0JldGE6IGZpcnN0TWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnQkVUQV9QRUVSJykpLFxuXHRcdFx0c2Vjb25kSGFzQmV0YTogc2Vjb25kTWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnQkVUQV9QRUVSJykpLFxuXHRcdFx0c2Vjb25kSGFzQWxwaGE6IHNlY29uZE1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ0FMUEhBX1BFRVInKSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RIYXNBbHBoYTogdHJ1ZSxcblx0XHRcdGZpcnN0SGFzQmV0YTogZmFsc2UsXG5cdFx0XHRzZWNvbmRIYXNCZXRhOiB0cnVlLFxuXHRcdFx0c2Vjb25kSGFzQWxwaGE6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgcHJvdmlkZXIgY29udGV4dCBzdXJ2aXZlcyB1bnN1YnNjcmliZSBhbmQgcmVzdWJzY3JpYmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZXN1bWUtY29udGV4dCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cdFx0YXdhaXQgZHJpdmVUdXJuKHBlZXIsICdwZWVyLXJlc3VtZS0xJywgJ1JlbWVtYmVyIHRoZSBjb2RlIHdvcmQgUkVTVU1FX1BFRVIuIFJlcGx5IGV4YWN0bHkgXCJyZWFkeVwiLicsIDEpO1xuXHRcdGNvbnRleHQuY2xpZW50Lm5vdGlmeSgndW5zdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItcmVzdW1lLTInLCAnUmVwbHkgZXhhY3RseSBcInJlc3VtZWRcIi4nLCAxMCk7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpO1xuXG5cdFx0YXNzZXJ0Lm9rKG1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ1JFU1VNRV9QRUVSJykpKTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdyZWNyZWF0ZWQgcGVlciBjaGF0IHN0YXJ0cyB3aXRoIGZyZXNoIHByb3ZpZGVyIGNvbnRleHQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZXNldC1jb250ZXh0Jyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItb2xkLWNvbnRleHQnLCAnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBPTERfUEVFUi4gUmVwbHkgZXhhY3RseSBcInJlYWR5XCIuJywgMSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZUNoYXQnLCB7IGNoYW5uZWw6IHBlZXIgfSwgMzBfMDAwKTtcblx0XHRhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItbmV3LWNvbnRleHQnLCAnUmVwbHkgZXhhY3RseSBcIm5ld1wiLicsIDEwKTtcblx0XHRjb25zdCBtZXNzYWdlcyA9IG9ic2VydmVkTW9kZWxNZXNzYWdlcyhjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnT0xEX1BFRVInKSksIGZhbHNlKTtcblx0fSk7XG5cblx0Zm9ya1Byb3ZpZGVyVGVzdCgndW5rbm93bi10dXJuIGZvcmsgZG9lcyBub3QgaW5oZXJpdCBzb3VyY2UgcHJvdmlkZXIgY29udGV4dCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIGRlZmF1bHRDaGF0VXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCd1bmtub3duLWZvcmstY29udGV4dCcpO1xuXHRcdGF3YWl0IGRyaXZlVHVybihkZWZhdWx0Q2hhdFVyaSwgJ3NvdXJjZS1zZWNyZXQnLCAnUmVtZW1iZXIgdGhlIGNvZGUgd29yZCBTT1VSQ0VfU0VDUkVULiBSZXBseSBleGFjdGx5IFwicmVhZHlcIi4nLCAxKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAnZm9yaycsIHsga2luZDogQ2hhdFNvdXJjZUtpbmQuRm9yaywgY2hhdDogZGVmYXVsdENoYXRVcmksIHR1cm5JZDogJ21pc3NpbmctdHVybicgfSk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ2ZyZXNoLWZvcmstdHVybicsICdSZXBseSBleGFjdGx5IFwiZnJlc2hcIi4nLCAxMCk7XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBvYnNlcnZlZE1vZGVsTWVzc2FnZXMoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmNvbnRlbnQuaW5jbHVkZXMoJ1NPVVJDRV9TRUNSRVQnKSksIGZhbHNlKTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIHNpbXBsZSBhdHRhY2htZW50IHJlYWNoZXMgdGhlIHByb3ZpZGVyIHJlcXVlc3QnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdzaW1wbGUtYXR0YWNobWVudCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdGxhYmVsOiAncGVlci1ub3RlLnR4dCcsXG5cdFx0XHRkaXNwbGF5S2luZDogJ2RvY3VtZW50Jyxcblx0XHRcdG1vZGVsUmVwcmVzZW50YXRpb246ICdQRUVSX1NJTVBMRV9BVFRBQ0hNRU5UJyxcblx0XHR9XTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1zaW1wbGUtYXR0YWNobWVudCcsICdSZXBseSBleGFjdGx5IFwiYXR0YWNobWVudFwiLicsIDEsIGF0dGFjaG1lbnRzKTtcblxuXHRcdGFzc2VydC5vaygoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpLmluY2x1ZGVzKCdQRUVSX1NJTVBMRV9BVFRBQ0hNRU5UJykpO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgc2ltcGxlIGF0dGFjaG1lbnQgd2l0aG91dCBhIG1vZGVsIHJlcHJlc2VudGF0aW9uIGlzIG9taXR0ZWQgZnJvbSB0aGUgcHJvdmlkZXIgcmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3NpbXBsZS1hdHRhY2htZW50LW9taXR0ZWQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzOiBNZXNzYWdlQXR0YWNobWVudFtdID0gW3tcblx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRsYWJlbDogJ1BFRVJfT01JVFRFRF9BVFRBQ0hNRU5UJyxcblx0XHR9XTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1zaW1wbGUtYXR0YWNobWVudC1vbWl0dGVkJywgJ1JlcGx5IGV4YWN0bHkgXCJhdHRhY2htZW50XCIuJywgMSwgYXR0YWNobWVudHMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJykuaW5jbHVkZXMoJ1BFRVJfT01JVFRFRF9BVFRBQ0hNRU5UJyksIGZhbHNlKTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIG11bHRpcGxlIHNpbXBsZSBhdHRhY2htZW50cyByZWFjaCB0aGUgcHJvdmlkZXIgcmVxdWVzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ211bHRpcGxlLWF0dGFjaG1lbnRzJyk7XG5cdFx0Y29uc3QgcGVlciA9IGF3YWl0IGNyZWF0ZVBlZXIoc2Vzc2lvblVyaSwgJ3BlZXInKTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogcGVlciB9KTtcblx0XHRjb25zdCBhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0bGFiZWw6ICdmaXJzdCcsXG5cdFx0XHRcdG1vZGVsUmVwcmVzZW50YXRpb246ICdQRUVSX0ZJUlNUX0FUVEFDSE1FTlQnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0bGFiZWw6ICdzZWNvbmQnLFxuXHRcdFx0XHRtb2RlbFJlcHJlc2VudGF0aW9uOiAnUEVFUl9TRUNPTkRfQVRUQUNITUVOVCcsXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItbXVsdGlwbGUtYXR0YWNobWVudHMnLCAnUmVwbHkgZXhhY3RseSBcImF0dGFjaG1lbnRzXCIuJywgMSwgYXR0YWNobWVudHMpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IGNvbnRleHQub2JzZXJ2ZWRNb2RlbFJlcXVlc3RCb2RpZXMuYXQoLTEpID8/ICcnO1xuXHRcdGFzc2VydC5vayhyZXF1ZXN0LmluY2x1ZGVzKCdQRUVSX0ZJUlNUX0FUVEFDSE1FTlQnKSAmJiByZXF1ZXN0LmluY2x1ZGVzKCdQRUVSX1NFQ09ORF9BVFRBQ0hNRU5UJykpO1xuXHR9KTtcblxuXHRwcm92aWRlclRlc3QoJ3BlZXIgcmVzb3VyY2UgYXR0YWNobWVudCByZWFjaGVzIHRoZSBwcm92aWRlciByZXF1ZXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZXNvdXJjZS1hdHRhY2htZW50Jyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlci1yZXNvdXJjZS50eHQnKTtcblx0XHR3cml0ZUZpbGVTeW5jKGZpbGUsICdQRUVSX1JFU09VUkNFX0FUVEFDSE1FTlQnKTtcblx0XHRjb25zdCBwZWVyID0gYXdhaXQgY3JlYXRlUGVlcihzZXNzaW9uVXJpLCAncGVlcicpO1xuXHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBwZWVyIH0pO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzOiBNZXNzYWdlQXR0YWNobWVudFtdID0gW3tcblx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdHVyaTogVVJJLmZpbGUoZmlsZSkudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsOiAncGVlci1yZXNvdXJjZS50eHQnLFxuXHRcdFx0ZGlzcGxheUtpbmQ6ICdkb2N1bWVudCcsXG5cdFx0fV07XG5cblx0XHRhd2FpdCBkcml2ZVR1cm4ocGVlciwgJ3BlZXItcmVzb3VyY2UtYXR0YWNobWVudCcsICdSZXBseSBleGFjdGx5IFwiYXR0YWNobWVudFwiLicsIDEsIGF0dGFjaG1lbnRzKTtcblxuXHRcdGFzc2VydC5vaygoY29udGV4dC5vYnNlcnZlZE1vZGVsUmVxdWVzdEJvZGllcy5hdCgtMSkgPz8gJycpLmluY2x1ZGVzKCdwZWVyLXJlc291cmNlLnR4dCcpKTtcblx0fSk7XG5cblx0cHJvdmlkZXJUZXN0KCdwZWVyIHJlc291cmNlIHNlbGVjdGlvbiBhdHRhY2htZW50IGluY2x1ZGVzIGl0cyBsaW5lIHJlZmVyZW5jZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIHdvcmtzcGFjZSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVzb3VyY2Utc2VsZWN0aW9uJyk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW4od29ya3NwYWNlLCAncGVlci1zZWxlY3Rpb24udHh0Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhmaWxlLCAnZmlyc3RcXG5zZWNvbmRcXG50aGlyZCcpO1xuXHRcdGNvbnN0IHBlZXIgPSBhd2FpdCBjcmVhdGVQZWVyKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHBlZXIgfSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudHM6IE1lc3NhZ2VBdHRhY2htZW50W10gPSBbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlLFxuXHRcdFx0dXJpOiBVUkkuZmlsZShmaWxlKS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6ICdwZWVyLXNlbGVjdGlvbi50eHQnLFxuXHRcdFx0ZGlzcGxheUtpbmQ6ICdzZWxlY3Rpb24nLFxuXHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnQ6IHsgbGluZTogMSwgY2hhcmFjdGVyOiAwIH0sXG5cdFx0XHRcdFx0ZW5kOiB7IGxpbmU6IDEsIGNoYXJhY3RlcjogNiB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9XTtcblxuXHRcdGF3YWl0IGRyaXZlVHVybihwZWVyLCAncGVlci1yZXNvdXJjZS1zZWxlY3Rpb24nLCAnUmVwbHkgZXhhY3RseSBcInNlbGVjdGlvblwiLicsIDEsIGF0dGFjaG1lbnRzKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBjb250ZXh0Lm9ic2VydmVkTW9kZWxSZXF1ZXN0Qm9kaWVzLmF0KC0xKSA/PyAnJztcblx0XHRhc3NlcnQub2socmVxdWVzdC5pbmNsdWRlcygncGVlci1zZWxlY3Rpb24udHh0JykgJiYgKHJlcXVlc3QuaW5jbHVkZXMoJ3BlZXItc2VsZWN0aW9uLnR4dDoyJykgfHwgcmVxdWVzdC5pbmNsdWRlcygnKGxpbmUgMiknKSkpO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVcsYUFBYSxjQUFjLHFCQUFxQjtBQUNwRSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLGtCQUFzRTtBQUMvRSxTQUFTLGdCQUFnQiwwQkFBaUc7QUFDMUg7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BS007QUFDUCxTQUFTLDRCQUE0Qix5QkFBeUI7QUFDOUQsU0FBUyxtQkFBbUIsNEJBQTRCO0FBQ3hELFNBQVMsaUJBQWlCLDRCQUEyRDtBQUU5RSxTQUFTLHFCQUFxQixTQUF5QztBQUM3RSxRQUFNLEVBQUUsUUFBUSxpQkFBaUIsU0FBUyxJQUFJO0FBRTlDLFFBQU0sb0JBQW9CO0FBRTFCLGlCQUFlLGNBQWMsUUFBNEY7QUFDeEgsVUFBTSxZQUFZLFlBQVksS0FBSyxPQUFPLEdBQUcsaUJB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LFFBQVEsU0FBUyx3QkFBd0IsQ0FBQztBQUFBLEVBQ2xHLENBQUM7QUFFRCxlQUFhLHlEQUF5RCxpQkFBa0I7QUFDdkYsVUFBTSxFQUFFLFlBQVksVUFBVSxJQUFJLE1BQU0sY0FBYyxxQkFBcUI7QUFDM0UsVUFBTSxPQUFPLEtBQUssV0FBVyxtQkFBbUI7QUFDaEQsa0JBQWMsTUFBTSwwQkFBMEI7QUFDOUMsVUFBTSxPQUFPLE1BQU0sV0FBVyxZQUFZLE1BQU07QUFDaEQsVUFBTSxRQUFRLE9BQU8sS0FBc0IsYUFBYSxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQ3pFLFVBQU0sY0FBbUMsQ0FBQztBQUFBLE1BQ3pDLE1BQU0sc0JBQXNCO0FBQUEsTUFDNUIsS0FBSyxJQUFJLEtBQUssSUFBSSxFQUFFLFNBQVM7QUFBQSxNQUM3QixPQUFPO0FBQUEsTUFDUCxhQUFhO0FBQUEsSUFDZCxDQUFDO0FBRUQsVUFBTSxVQUFVLE1BQU0sNEJBQTRCLCtCQUErQixHQUFHLFdBQVc7QUFFL0YsV0FBTyxJQUFJLFFBQVEsMkJBQTJCLEdBQUcsRUFBRSxLQUFLLElBQUksU0FBUyxtQkFBbUIsQ0FBQztBQUFBLEVBQzFGLENBQUM7QUFFRCxlQUFhLGtFQUFrRSxpQkFBa0I7QUFDaEcsVUFBTSxFQUFFLFlBQVksVUFBVSxJQUFJLE1BQU0sY0FBYyxvQkFBb0I7QUFDMUUsVUFBTSxPQUFPLEtBQUssV0FBVyxvQkFBb0I7QUFDakQsa0JBQWMsTUFBTSxzQkFBc0I7QUFDMUMsVUFBTSxPQUFPLE1BQU0sV0FBVyxZQUFZLE1BQU07QUFDaEQsVUFBTSxRQUFRLE9BQU8sS0FBc0IsYUFBYSxFQUFFLFNBQVMsS0FBSyxDQUFDO0FBQ3pFLFVBQU0sY0FBbUMsQ0FBQztBQUFBLE1BQ3pDLE1BQU0sc0JBQXNCO0FBQUEsTUFDNUIsS0FBSyxJQUFJLEtBQUssSUFBSSxFQUFFLFNBQVM7QUFBQSxNQUM3QixPQUFPO0FBQUEsTUFDUCxhQUFhO0FBQUEsTUFDYixXQUFXO0FBQUEsUUFDVixPQUFPO0FBQUEsVUFDTixPQUFPLEVBQUUsTUFBTSxHQUFHLFdBQVcsRUFBRTtBQUFBLFVBQy9CLEtBQUssRUFBRSxNQUFNLEdBQUcsV0FBVyxFQUFFO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxVQUFVLE1BQU0sMkJBQTJCLDhCQUE4QixHQUFHLFdBQVc7QUFFN0YsVUFBTSxVQUFVLFFBQVEsMkJBQTJCLEdBQUcsRUFBRSxLQUFLO0FBQzdELFdBQU8sR0FBRyxRQUFRLFNBQVMsb0JBQW9CLE1BQU0sUUFBUSxTQUFTLHNCQUFzQixLQUFLLFFBQVEsU0FBUyxVQUFVLEVBQUU7QUFBQSxFQUMvSCxDQUFDO0FBQ0Y7IiwKICAibmFtZXMiOiBbImFjdGlvbiIsICJhZ2VudCJdCn0K
