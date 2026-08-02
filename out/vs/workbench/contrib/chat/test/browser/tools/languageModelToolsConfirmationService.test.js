import * as assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { LanguageModelToolsConfirmationService } from "../../../browser/tools/languageModelToolsConfirmationService.js";
import { ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { computeCombinationKey } from "../../../common/tools/languageModelToolsConfirmationService.js";
import { ToolDataSource } from "../../../common/tools/languageModelToolsService.js";
suite("LanguageModelToolsConfirmationService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let service;
  let instantiationService;
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
    service = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
  });
  function createToolRef(toolId, source = ToolDataSource.Internal, parameters = {}) {
    return { toolId, source, parameters };
  }
  function createMcpToolRef(toolId, definitionId, serverLabel, parameters = {}) {
    return {
      toolId,
      source: {
        type: "mcp",
        label: serverLabel,
        serverLabel,
        instructions: void 0,
        collectionId: "testCollection",
        definitionId
      },
      parameters
    };
  }
  async function createCombinationRef(toolId, parameters, combinationLabel, combinationArgs) {
    return {
      ...createToolRef(toolId, ToolDataSource.Internal, parameters),
      combination: {
        label: combinationLabel,
        key: await computeCombinationKey(toolId, parameters),
        arguments: combinationArgs
      }
    };
  }
  test("getPreConfirmAction returns undefined by default", () => {
    const ref = createToolRef("testTool");
    const result = service.getPreConfirmAction(ref);
    assert.strictEqual(result, void 0);
  });
  test("getPostConfirmAction returns undefined by default", () => {
    const ref = createToolRef("testTool");
    const result = service.getPostConfirmAction(ref);
    assert.strictEqual(result, void 0);
  });
  test("getPreConfirmActions returns default tool-level actions", () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    assert.ok(actions.length >= 3);
    assert.ok(actions.some((a) => a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Always Allow")));
  });
  test("getPostConfirmActions returns default tool-level actions", () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    assert.ok(actions.length >= 3);
    assert.ok(actions.some((a) => a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Always Allow")));
  });
  test("getPreConfirmActions includes server-level actions for MCP tools", () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Always Allow")));
  });
  test("getPostConfirmActions includes server-level actions for MCP tools", () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPostConfirmActions(ref);
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Session")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Workspace")));
    assert.ok(actions.some((a) => a.label.includes("Test Server") && a.label.includes("Always Allow")));
  });
  test("pre-execution session confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const sessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("pre-execution workspace confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const workspaceAction = actions.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(workspaceAction);
    await workspaceAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("pre-execution profile confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const profileAction = actions.find((a) => a.label.includes("Always Allow") && !a.label.includes("Server"));
    assert.ok(profileAction);
    await profileAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "profile" });
  });
  test("post-execution session confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    const sessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("post-execution workspace confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    const workspaceAction = actions.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(workspaceAction);
    await workspaceAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("post-execution profile confirmation works", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPostConfirmActions(ref);
    const profileAction = actions.find((a) => a.label.includes("Always Allow") && !a.label.includes("Server"));
    assert.ok(profileAction);
    await profileAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "profile" });
  });
  test("MCP server-level pre-execution session confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("MCP server-level pre-execution workspace confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Workspace"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("MCP server-level pre-execution profile confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Always Allow"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "profile" });
  });
  test("MCP server-level post-execution session confirmation works", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions = service.getPostConfirmActions(ref);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const result = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("MCP server-level confirmation applies to all tools from that server", async () => {
    const ref1 = createMcpToolRef("mcpTool1", "serverId", "Test Server");
    const ref2 = createMcpToolRef("mcpTool2", "serverId", "Test Server");
    const actions = service.getPreConfirmActions(ref1);
    const serverAction = actions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const result1 = service.getPreConfirmAction(ref1);
    const result2 = service.getPreConfirmAction(ref2);
    assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("tool-level confirmation takes precedence over server-level confirmation", async () => {
    const ref = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const serverActions = service.getPreConfirmActions(ref);
    const serverAction = serverActions.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    const toolActions = service.getPreConfirmActions(ref);
    const toolAction = toolActions.find((a) => !a.label.includes("Test Server") && a.label.includes("Workspace"));
    assert.ok(toolAction);
    await toolAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("registerConfirmationContribution allows custom pre-confirm actions", () => {
    const contribution = {
      getPreConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const result = service.getPreConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
  });
  test("registerConfirmationContribution allows custom post-confirm actions", () => {
    const contribution = {
      getPostConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const result = service.getPostConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
  });
  test("registerConfirmationContribution allows custom pre-confirm action list", () => {
    const customActions = [
      {
        label: "Custom Action 1",
        select: async () => true
      },
      {
        label: "Custom Action 2",
        select: async () => true
      }
    ];
    const contribution = {
      getPreConfirmActions: (ref2) => customActions
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const actions = service.getPreConfirmActions(ref);
    assert.ok(actions.some((a) => a.label === "Custom Action 1"));
    assert.ok(actions.some((a) => a.label === "Custom Action 2"));
    assert.ok(actions.some((a) => a.label.includes("Session")));
  });
  test("registerConfirmationContribution with canUseDefaultApprovals=false only shows custom actions", () => {
    const customActions = [
      {
        label: "Custom Action Only",
        select: async () => true
      }
    ];
    const contribution = {
      canUseDefaultApprovals: false,
      getPreConfirmActions: (ref2) => customActions
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const actions = service.getPreConfirmActions(ref);
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].label, "Custom Action Only");
  });
  test("contribution getPreConfirmAction takes precedence over default stores", () => {
    const contribution = {
      getPreConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const result = service.getPreConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
  });
  test("contribution with canUseDefaultApprovals=false prevents default store checks", () => {
    const contribution = {
      canUseDefaultApprovals: false,
      getPreConfirmAction: () => void 0
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    const ref = createToolRef("customTool");
    const actions = service.getPreConfirmActions(ref);
    assert.strictEqual(actions.length, 0);
  });
  test("resetToolAutoConfirmation clears all confirmations", async () => {
    const ref1 = createToolRef("tool1");
    const ref2 = createMcpToolRef("mcpTool", "serverId", "Test Server");
    const actions1 = service.getPreConfirmActions(ref1);
    const sessionAction1 = actions1.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction1);
    await sessionAction1.select();
    const actions2 = service.getPreConfirmActions(ref2);
    const serverAction = actions2.find((a) => a.label.includes("Test Server") && a.label.includes("Session"));
    assert.ok(serverAction);
    await serverAction.select();
    assert.ok(service.getPreConfirmAction(ref1));
    assert.ok(service.getPreConfirmAction(ref2));
    service.resetToolAutoConfirmation();
    assert.strictEqual(service.getPreConfirmAction(ref1), void 0);
    assert.strictEqual(service.getPreConfirmAction(ref2), void 0);
  });
  test("resetToolAutoConfirmation calls contribution reset", () => {
    let resetCalled = false;
    const contribution = {
      reset: () => {
        resetCalled = true;
      }
    };
    store.add(service.registerConfirmationContribution("customTool", contribution));
    service.resetToolAutoConfirmation();
    assert.strictEqual(resetCalled, true);
  });
  test("disposing contribution registration removes it", () => {
    const contribution = {
      getPreConfirmAction: (ref2) => {
        return { type: ToolConfirmKind.UserAction };
      }
    };
    const disposable = service.registerConfirmationContribution("customTool", contribution);
    const ref = createToolRef("customTool");
    let result = service.getPreConfirmAction(ref);
    assert.ok(result);
    assert.strictEqual(result.type, ToolConfirmKind.UserAction);
    disposable.dispose();
    result = service.getPreConfirmAction(ref);
    assert.strictEqual(result, void 0);
  });
  test("different tools have independent confirmations", async () => {
    const ref1 = createToolRef("tool1");
    const ref2 = createToolRef("tool2");
    const actions1 = service.getPreConfirmActions(ref1);
    const sessionAction = actions1.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const actions2 = service.getPreConfirmActions(ref2);
    const workspaceAction = actions2.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(workspaceAction);
    await workspaceAction.select();
    const result1 = service.getPreConfirmAction(ref1);
    const result2 = service.getPreConfirmAction(ref2);
    assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("pre and post execution confirmations are independent", async () => {
    const ref = createToolRef("testTool");
    const preActions = service.getPreConfirmActions(ref);
    const preSessionAction = preActions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(preSessionAction);
    await preSessionAction.select();
    const postActions = service.getPostConfirmActions(ref);
    const postWorkspaceAction = postActions.find((a) => a.label.includes("Workspace") && !a.label.includes("Server"));
    assert.ok(postWorkspaceAction);
    await postWorkspaceAction.select();
    const preResult = service.getPreConfirmAction(ref);
    const postResult = service.getPostConfirmAction(ref);
    assert.deepStrictEqual(preResult, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(postResult, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("different MCP servers have independent confirmations", async () => {
    const ref1 = createMcpToolRef("tool1", "server1", "Server 1");
    const ref2 = createMcpToolRef("tool2", "server2", "Server 2");
    const actions1 = service.getPreConfirmActions(ref1);
    const serverAction1 = actions1.find((a) => a.label.includes("Server 1") && a.label.includes("Session"));
    assert.ok(serverAction1);
    await serverAction1.select();
    const actions2 = service.getPreConfirmActions(ref2);
    const serverAction2 = actions2.find((a) => a.label.includes("Server 2") && a.label.includes("Workspace"));
    assert.ok(serverAction2);
    await serverAction2.select();
    const result1 = service.getPreConfirmAction(ref1);
    const result2 = service.getPreConfirmAction(ref2);
    assert.deepStrictEqual(result1, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    assert.deepStrictEqual(result2, { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("actions return true when select is called", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    for (const action of actions) {
      const result = await action.select();
      assert.strictEqual(result, true);
    }
  });
  test("session confirmations are stored in memory only", async () => {
    const ref = createToolRef("testTool");
    const actions = service.getPreConfirmActions(ref);
    const sessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("Server"));
    assert.ok(sessionAction);
    await sessionAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const newResult = newService.getPreConfirmAction(ref);
    assert.strictEqual(newResult, void 0);
  });
  test("combination actions are only offered when combinationLabel is set", async () => {
    const refWithout = createToolRef("testTool", ToolDataSource.Internal, { file: "foo.txt" });
    const actionsWithout = service.getPreConfirmActions(refWithout);
    assert.ok(!actionsWithout.some((a) => a.label.includes("foo.txt")));
    const refWith = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actionsWith = service.getPreConfirmActions(refWith);
    assert.ok(actionsWith.some((a) => a.label.includes('Allow reading "foo.txt"')));
  });
  test("combination actions include session, workspace, and profile scopes", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationActions = actions.filter((a) => a.label.includes('Allow reading "foo.txt"'));
    assert.strictEqual(combinationActions.length, 3);
    assert.ok(combinationActions.some((a) => a.scope === "session"));
    assert.ok(combinationActions.some((a) => a.scope === "workspace"));
    assert.ok(combinationActions.some((a) => a.scope === "profile"));
  });
  test("selecting a combination session action auto-confirms the same parameters", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    assert.strictEqual(service.getPreConfirmAction(ref), void 0);
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("selecting a combination workspace action stores at workspace scope", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "workspace");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("combination approval does not apply to different parameters", async () => {
    const refFoo = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const refBar = await createCombinationRef("testTool", { file: "bar.txt" }, 'Allow reading "bar.txt"');
    const actions = service.getPreConfirmActions(refFoo);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.ok(service.getPreConfirmAction(refFoo));
    assert.strictEqual(service.getPreConfirmAction(refBar), void 0);
  });
  test("tool-level approval takes precedence over combination approval", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const toolSessionAction = actions.find((a) => a.label.includes("Session") && !a.label.includes("foo.txt") && !a.label.includes("Server"));
    assert.ok(toolSessionAction);
    await toolSessionAction.select();
    const result = service.getPreConfirmAction(ref);
    assert.deepStrictEqual(result, { type: ToolConfirmKind.LmServicePerTool, scope: "session" });
  });
  test("combination approvals are cleared on reset", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.ok(service.getPreConfirmAction(ref));
    service.resetToolAutoConfirmation();
    assert.strictEqual(service.getPreConfirmAction(ref), void 0);
  });
  test("combination session approvals do not persist across service instances", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "session");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.ok(service.getPreConfirmAction(ref));
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    assert.strictEqual(newService.getPreConfirmAction(ref), void 0);
  });
  test("legacy string[] storage format is read correctly", () => {
    const storageService = instantiationService.get(IStorageService);
    storageService.store("chat/autoconfirm", JSON.stringify(["tool1", "tool2"]), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const ref1 = createToolRef("tool1");
    const ref2 = createToolRef("tool2");
    const ref3 = createToolRef("tool3");
    assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
    assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
    assert.strictEqual(newService.getPreConfirmAction(ref3), void 0);
  });
  test("new Record storage format preserves labels", () => {
    const storageService = instantiationService.get(IStorageService);
    const data = {
      "tool1:combination:12345": "Allow reading foo.txt",
      "tool2": true
    };
    storageService.store("chat/autoconfirm", JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const ref2 = createToolRef("tool2");
    assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("object storage format with arguments round-trips across restart", () => {
    const storageService = instantiationService.get(IStorageService);
    const data = {
      "tool1:combination:12345": { label: "Allow reading foo.txt", arguments: '["foo.txt"]' },
      "tool2:combination:67890": { label: "Allow command with args" }
    };
    storageService.store("chat/autoconfirm-combination", JSON.stringify(data), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    const newService = store.add(instantiationService.createInstance(LanguageModelToolsConfirmationService));
    const ref1 = {
      ...createToolRef("tool1"),
      combination: { label: "Allow reading foo.txt", key: "tool1:combination:12345", arguments: '["foo.txt"]' }
    };
    const ref2 = {
      ...createToolRef("tool2"),
      combination: { label: "Allow command with args", key: "tool2:combination:67890" }
    };
    assert.deepStrictEqual(newService.getPreConfirmAction(ref1), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
    assert.deepStrictEqual(newService.getPreConfirmAction(ref2), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
  test("combination approval with arguments persists via workspace scope", async () => {
    const ref = await createCombinationRef("testTool", { file: "foo.txt" }, 'Allow reading "foo.txt"', '{"file":"foo.txt"}');
    const actions = service.getPreConfirmActions(ref);
    const combinationAction = actions.find((a) => a.label.includes('Allow reading "foo.txt"') && a.scope === "workspace");
    assert.ok(combinationAction);
    await combinationAction.select();
    assert.deepStrictEqual(service.getPreConfirmAction(ref), { type: ToolConfirmKind.LmServicePerTool, scope: "workspace" });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUNvbWJpbmF0aW9uS2V5LCBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zLCBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24sIElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvblJlZiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgc2VydmljZTogTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cblx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlVG9vbFJlZih0b29sSWQ6IHN0cmluZywgc291cmNlOiBUb29sRGF0YVNvdXJjZSA9IFRvb2xEYXRhU291cmNlLkludGVybmFsLCBwYXJhbWV0ZXJzOiB1bmtub3duID0ge30pOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25SZWYge1xuXHRcdHJldHVybiB7IHRvb2xJZCwgc291cmNlLCBwYXJhbWV0ZXJzIH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNY3BUb29sUmVmKHRvb2xJZDogc3RyaW5nLCBkZWZpbml0aW9uSWQ6IHN0cmluZywgc2VydmVyTGFiZWw6IHN0cmluZywgcGFyYW1ldGVyczogdW5rbm93biA9IHt9KTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9vbElkLFxuXHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdHR5cGU6ICdtY3AnLFxuXHRcdFx0XHRsYWJlbDogc2VydmVyTGFiZWwsXG5cdFx0XHRcdHNlcnZlckxhYmVsLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29sbGVjdGlvbklkOiAndGVzdENvbGxlY3Rpb24nLFxuXHRcdFx0XHRkZWZpbml0aW9uSWRcblx0XHRcdH0sXG5cdFx0XHRwYXJhbWV0ZXJzXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUNvbWJpbmF0aW9uUmVmKHRvb2xJZDogc3RyaW5nLCBwYXJhbWV0ZXJzOiB1bmtub3duLCBjb21iaW5hdGlvbkxhYmVsOiBzdHJpbmcsIGNvbWJpbmF0aW9uQXJncz86IHN0cmluZyk6IFByb21pc2U8SUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNyZWF0ZVRvb2xSZWYodG9vbElkLCBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgcGFyYW1ldGVycyksXG5cdFx0XHRjb21iaW5hdGlvbjoge1xuXHRcdFx0XHRsYWJlbDogY29tYmluYXRpb25MYWJlbCxcblx0XHRcdFx0a2V5OiBhd2FpdCBjb21wdXRlQ29tYmluYXRpb25LZXkodG9vbElkLCBwYXJhbWV0ZXJzKSxcblx0XHRcdFx0YXJndW1lbnRzOiBjb21iaW5hdGlvbkFyZ3MsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdnZXRQcmVDb25maXJtQWN0aW9uIHJldHVybnMgdW5kZWZpbmVkIGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQb3N0Q29uZmlybUFjdGlvbiByZXR1cm5zIHVuZGVmaW5lZCBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFByZUNvbmZpcm1BY3Rpb25zIHJldHVybnMgZGVmYXVsdCB0b29sLWxldmVsIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMubGVuZ3RoID49IDMpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnV29ya3NwYWNlJykpKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWx3YXlzIEFsbG93JykpKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UG9zdENvbmZpcm1BY3Rpb25zIHJldHVybnMgZGVmYXVsdCB0b29sLWxldmVsIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmKTtcblxuXHRcdGFzc2VydC5vayhhY3Rpb25zLmxlbmd0aCA+PSAzKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1dvcmtzcGFjZScpKSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdycpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFByZUNvbmZpcm1BY3Rpb25zIGluY2x1ZGVzIHNlcnZlci1sZXZlbCBhY3Rpb25zIGZvciBNQ1AgdG9vbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbCcsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpKTtcblx0XHRhc3NlcnQub2soYWN0aW9ucy5zb21lKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSkpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdUZXN0IFNlcnZlcicpICYmIGEubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdycpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFBvc3RDb25maXJtQWN0aW9ucyBpbmNsdWRlcyBzZXJ2ZXItbGV2ZWwgYWN0aW9ucyBmb3IgTUNQIHRvb2xzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZU1jcFRvb2xSZWYoJ21jcFRvb2wnLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmKTtcblxuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdUZXN0IFNlcnZlcicpICYmIGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSkpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdUZXN0IFNlcnZlcicpICYmIGEubGFiZWwuaW5jbHVkZXMoJ1dvcmtzcGFjZScpKSk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnMuc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnQWx3YXlzIEFsbG93JykpKTtcblx0fSk7XG5cblx0dGVzdCgncHJlLWV4ZWN1dGlvbiBzZXNzaW9uIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgc2Vzc2lvbkFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb25BY3Rpb24pO1xuXHRcdGF3YWl0IHNlc3Npb25BY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlLWV4ZWN1dGlvbiB3b3Jrc3BhY2UgY29uZmlybWF0aW9uIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZUFjdGlvbik7XG5cdFx0YXdhaXQgd29ya3NwYWNlQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlLWV4ZWN1dGlvbiBwcm9maWxlIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgcHJvZmlsZUFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ0Fsd2F5cyBBbGxvdycpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cblx0XHRhc3NlcnQub2socHJvZmlsZUFjdGlvbik7XG5cdFx0YXdhaXQgcHJvZmlsZUFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3Byb2ZpbGUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3N0LWV4ZWN1dGlvbiBzZXNzaW9uIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHNlc3Npb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblxuXHRcdGFzc2VydC5vayhzZXNzaW9uQWN0aW9uKTtcblx0XHRhd2FpdCBzZXNzaW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3Nlc3Npb24nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3N0LWV4ZWN1dGlvbiB3b3Jrc3BhY2UgY29uZmlybWF0aW9uIHdvcmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnV29ya3NwYWNlJykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblxuXHRcdGFzc2VydC5vayh3b3Jrc3BhY2VBY3Rpb24pO1xuXHRcdGF3YWl0IHdvcmtzcGFjZUFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3N0LWV4ZWN1dGlvbiBwcm9maWxlIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHByb2ZpbGVBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cnKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHByb2ZpbGVBY3Rpb24pO1xuXHRcdGF3YWl0IHByb2ZpbGVBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAncHJvZmlsZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ01DUCBzZXJ2ZXItbGV2ZWwgcHJlLWV4ZWN1dGlvbiBzZXNzaW9uIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVNY3BUb29sUmVmKCdtY3BUb29sJywgJ3NlcnZlcklkJywgJ1Rlc3QgU2VydmVyJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBzZXJ2ZXJBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdUZXN0IFNlcnZlcicpICYmIGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSk7XG5cblx0XHRhc3NlcnQub2soc2VydmVyQWN0aW9uKTtcblx0XHRhd2FpdCBzZXJ2ZXJBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnTUNQIHNlcnZlci1sZXZlbCBwcmUtZXhlY3V0aW9uIHdvcmtzcGFjZSBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbCcsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgc2VydmVyQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSk7XG5cblx0XHRhc3NlcnQub2soc2VydmVyQWN0aW9uKTtcblx0XHRhd2FpdCBzZXJ2ZXJBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNQ1Agc2VydmVyLWxldmVsIHByZS1leGVjdXRpb24gcHJvZmlsZSBjb25maXJtYXRpb24gd29ya3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbCcsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgc2VydmVyQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cnKSk7XG5cblx0XHRhc3NlcnQub2soc2VydmVyQWN0aW9uKTtcblx0XHRhd2FpdCBzZXJ2ZXJBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdwcm9maWxlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnTUNQIHNlcnZlci1sZXZlbCBwb3N0LWV4ZWN1dGlvbiBzZXNzaW9uIGNvbmZpcm1hdGlvbiB3b3JrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVNY3BUb29sUmVmKCdtY3BUb29sJywgJ3NlcnZlcklkJywgJ1Rlc3QgU2VydmVyJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UG9zdENvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgc2VydmVyQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZlckFjdGlvbik7XG5cdFx0YXdhaXQgc2VydmVyQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3Nlc3Npb24nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNQ1Agc2VydmVyLWxldmVsIGNvbmZpcm1hdGlvbiBhcHBsaWVzIHRvIGFsbCB0b29scyBmcm9tIHRoYXQgc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZjEgPSBjcmVhdGVNY3BUb29sUmVmKCdtY3BUb29sMScsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXHRcdGNvbnN0IHJlZjIgPSBjcmVhdGVNY3BUb29sUmVmKCdtY3BUb29sMicsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmMSk7XG5cdFx0Y29uc3Qgc2VydmVyQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZlckFjdGlvbik7XG5cdFx0YXdhaXQgc2VydmVyQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0MSA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYxKTtcblx0XHRjb25zdCByZXN1bHQyID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQxLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3Nlc3Npb24nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0fSk7XG5cblx0dGVzdCgndG9vbC1sZXZlbCBjb25maXJtYXRpb24gdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHNlcnZlci1sZXZlbCBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlTWNwVG9vbFJlZignbWNwVG9vbCcsICdzZXJ2ZXJJZCcsICdUZXN0IFNlcnZlcicpO1xuXG5cdFx0Ly8gU2V0IHNlcnZlci1sZXZlbCBjb25maXJtYXRpb25cblx0XHRjb25zdCBzZXJ2ZXJBY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHNlcnZlckFjdGlvbiA9IHNlcnZlckFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Rlc3QgU2VydmVyJykgJiYgYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpKTtcblx0XHRhc3NlcnQub2soc2VydmVyQWN0aW9uKTtcblx0XHRhd2FpdCBzZXJ2ZXJBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHQvLyBTZXQgdG9vbC1sZXZlbCBjb25maXJtYXRpb24gdG8gYSBkaWZmZXJlbnQgc2NvcGVcblx0XHRjb25zdCB0b29sQWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCB0b29sQWN0aW9uID0gdG9vbEFjdGlvbnMuZmluZChhID0+ICFhLmxhYmVsLmluY2x1ZGVzKCdUZXN0IFNlcnZlcicpICYmIGEubGFiZWwuaW5jbHVkZXMoJ1dvcmtzcGFjZScpKTtcblx0XHRhc3NlcnQub2sodG9vbEFjdGlvbik7XG5cdFx0YXdhaXQgdG9vbEFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdC8vIFRvb2wtbGV2ZWwgc2hvdWxkIHRha2UgcHJlY2VkZW5jZVxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uIGFsbG93cyBjdXN0b20gcHJlLWNvbmZpcm0gYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdGdldFByZUNvbmZpcm1BY3Rpb246IChyZWYpID0+IHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24oJ2N1c3RvbVRvb2wnLCBjb250cmlidXRpb24pKTtcblxuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ2N1c3RvbVRvb2wnKTtcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiBhbGxvd3MgY3VzdG9tIHBvc3QtY29uZmlybSBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uID0ge1xuXHRcdFx0Z2V0UG9zdENvbmZpcm1BY3Rpb246IChyZWYpID0+IHtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24oJ2N1c3RvbVRvb2wnLCBjb250cmlidXRpb24pKTtcblxuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ2N1c3RvbVRvb2wnKTtcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9uKHJlZik7XG5cblx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnR5cGUsIFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uKTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24gYWxsb3dzIGN1c3RvbSBwcmUtY29uZmlybSBhY3Rpb24gbGlzdCcsICgpID0+IHtcblx0XHRjb25zdCBjdXN0b21BY3Rpb25zOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25BY3Rpb25zW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQ3VzdG9tIEFjdGlvbiAxJyxcblx0XHRcdFx0c2VsZWN0OiBhc3luYyAoKSA9PiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N1c3RvbSBBY3Rpb24gMicsXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4gdHJ1ZVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdGdldFByZUNvbmZpcm1BY3Rpb25zOiAocmVmKSA9PiBjdXN0b21BY3Rpb25zXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uKCdjdXN0b21Ub29sJywgY29udHJpYnV0aW9uKSk7XG5cblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCdjdXN0b21Ub29sJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblxuXHRcdC8vIFNob3VsZCBpbmNsdWRlIGJvdGggY3VzdG9tIGFjdGlvbnMgYW5kIGRlZmF1bHQgYWN0aW9uc1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsID09PSAnQ3VzdG9tIEFjdGlvbiAxJykpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsID09PSAnQ3VzdG9tIEFjdGlvbiAyJykpO1xuXHRcdGFzc2VydC5vayhhY3Rpb25zLnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpKTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24gd2l0aCBjYW5Vc2VEZWZhdWx0QXBwcm92YWxzPWZhbHNlIG9ubHkgc2hvd3MgY3VzdG9tIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY3VzdG9tQWN0aW9uczogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQWN0aW9uc1tdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ0N1c3RvbSBBY3Rpb24gT25seScsXG5cdFx0XHRcdHNlbGVjdDogYXN5bmMgKCkgPT4gdHJ1ZVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRjb25zdCBjb250cmlidXRpb246IElMYW5ndWFnZU1vZGVsVG9vbENvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbiA9IHtcblx0XHRcdGNhblVzZURlZmF1bHRBcHByb3ZhbHM6IGZhbHNlLFxuXHRcdFx0Z2V0UHJlQ29uZmlybUFjdGlvbnM6IChyZWYpID0+IGN1c3RvbUFjdGlvbnNcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24oJ2N1c3RvbVRvb2wnLCBjb250cmlidXRpb24pKTtcblxuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ2N1c3RvbVRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS5sYWJlbCwgJ0N1c3RvbSBBY3Rpb24gT25seScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250cmlidXRpb24gZ2V0UHJlQ29uZmlybUFjdGlvbiB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgZGVmYXVsdCBzdG9yZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uOiBJTGFuZ3VhZ2VNb2RlbFRvb2xDb25maXJtYXRpb25Db250cmlidXRpb24gPSB7XG5cdFx0XHRnZXRQcmVDb25maXJtQWN0aW9uOiAocmVmKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uKCdjdXN0b21Ub29sJywgY29udHJpYnV0aW9uKSk7XG5cblx0XHQvLyBDb250cmlidXRpb24gc2hvdWxkIHRha2UgcHJlY2VkZW5jZSBldmVuIHdpdGhvdXQgc2V0dGluZyBkZWZhdWx0XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZignY3VzdG9tVG9vbCcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250cmlidXRpb24gd2l0aCBjYW5Vc2VEZWZhdWx0QXBwcm92YWxzPWZhbHNlIHByZXZlbnRzIGRlZmF1bHQgc3RvcmUgY2hlY2tzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uID0ge1xuXHRcdFx0Y2FuVXNlRGVmYXVsdEFwcHJvdmFsczogZmFsc2UsXG5cdFx0XHRnZXRQcmVDb25maXJtQWN0aW9uOiAoKSA9PiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJDb25maXJtYXRpb25Db250cmlidXRpb24oJ2N1c3RvbVRvb2wnLCBjb250cmlidXRpb24pKTtcblxuXHRcdGNvbnN0IHJlZiA9IGNyZWF0ZVRvb2xSZWYoJ2N1c3RvbVRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgbm8gYWN0aW9ucyBzaW5jZSBjYW5Vc2VEZWZhdWx0QXBwcm92YWxzIGlzIGZhbHNlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXRUb29sQXV0b0NvbmZpcm1hdGlvbiBjbGVhcnMgYWxsIGNvbmZpcm1hdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmMSA9IGNyZWF0ZVRvb2xSZWYoJ3Rvb2wxJyk7XG5cdFx0Y29uc3QgcmVmMiA9IGNyZWF0ZU1jcFRvb2xSZWYoJ21jcFRvb2wnLCAnc2VydmVySWQnLCAnVGVzdCBTZXJ2ZXInKTtcblxuXHRcdC8vIFNldCBzb21lIGNvbmZpcm1hdGlvbnNcblx0XHRjb25zdCBhY3Rpb25zMSA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmMSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkFjdGlvbjEgPSBhY3Rpb25zMS5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb25BY3Rpb24xKTtcblx0XHRhd2FpdCBzZXNzaW9uQWN0aW9uMS5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMyID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYyKTtcblx0XHRjb25zdCBzZXJ2ZXJBY3Rpb24gPSBhY3Rpb25zMi5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnVGVzdCBTZXJ2ZXInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpO1xuXHRcdGFzc2VydC5vayhzZXJ2ZXJBY3Rpb24pO1xuXHRcdGF3YWl0IHNlcnZlckFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdC8vIFZlcmlmeSB0aGV5J3JlIHNldFxuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMSkpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMikpO1xuXG5cdFx0Ly8gUmVzZXRcblx0XHRzZXJ2aWNlLnJlc2V0VG9vbEF1dG9Db25maXJtYXRpb24oKTtcblxuXHRcdC8vIFZlcmlmeSB0aGV5J3JlIGNsZWFyZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjEpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2V0VG9vbEF1dG9Db25maXJtYXRpb24gY2FsbHMgY29udHJpYnV0aW9uIHJlc2V0JywgKCkgPT4ge1xuXHRcdGxldCByZXNldENhbGxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uID0ge1xuXHRcdFx0cmVzZXQ6ICgpID0+IHtcblx0XHRcdFx0cmVzZXRDYWxsZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbignY3VzdG9tVG9vbCcsIGNvbnRyaWJ1dGlvbikpO1xuXG5cdFx0c2VydmljZS5yZXNldFRvb2xBdXRvQ29uZmlybWF0aW9uKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzZXRDYWxsZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgY29udHJpYnV0aW9uIHJlZ2lzdHJhdGlvbiByZW1vdmVzIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uQ29udHJpYnV0aW9uID0ge1xuXHRcdFx0Z2V0UHJlQ29uZmlybUFjdGlvbjogKHJlZikgPT4ge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2VydmljZS5yZWdpc3RlckNvbmZpcm1hdGlvbkNvbnRyaWJ1dGlvbignY3VzdG9tVG9vbCcsIGNvbnRyaWJ1dGlvbik7XG5cblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCdjdXN0b21Ub29sJyk7XG5cdFx0bGV0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24pO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRyZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgdG9vbHMgaGF2ZSBpbmRlcGVuZGVudCBjb25maXJtYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZjEgPSBjcmVhdGVUb29sUmVmKCd0b29sMScpO1xuXHRcdGNvbnN0IHJlZjIgPSBjcmVhdGVUb29sUmVmKCd0b29sMicpO1xuXG5cdFx0Ly8gU2V0IHNlc3Npb24gZm9yIHRvb2wxXG5cdFx0Y29uc3QgYWN0aW9uczEgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjEpO1xuXHRcdGNvbnN0IHNlc3Npb25BY3Rpb24gPSBhY3Rpb25zMS5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb25BY3Rpb24pO1xuXHRcdGF3YWl0IHNlc3Npb25BY3Rpb24uc2VsZWN0KCk7XG5cblx0XHQvLyBTZXQgd29ya3NwYWNlIGZvciB0b29sMlxuXHRcdGNvbnN0IGFjdGlvbnMyID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYyKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VBY3Rpb24gPSBhY3Rpb25zMi5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnV29ya3NwYWNlJykgJiYgIWEubGFiZWwuaW5jbHVkZXMoJ1NlcnZlcicpKTtcblx0XHRhc3NlcnQub2sod29ya3NwYWNlQWN0aW9uKTtcblx0XHRhd2FpdCB3b3Jrc3BhY2VBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHQvLyBWZXJpZnkgdGhleSdyZSBpbmRlcGVuZGVudFxuXHRcdGNvbnN0IHJlc3VsdDEgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMSk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlIGFuZCBwb3N0IGV4ZWN1dGlvbiBjb25maXJtYXRpb25zIGFyZSBpbmRlcGVuZGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXG5cdFx0Ly8gU2V0IHByZS1leGVjdXRpb24gdG8gc2Vzc2lvblxuXHRcdGNvbnN0IHByZUFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgcHJlU2Vzc2lvbkFjdGlvbiA9IHByZUFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXHRcdGFzc2VydC5vayhwcmVTZXNzaW9uQWN0aW9uKTtcblx0XHRhd2FpdCBwcmVTZXNzaW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0Ly8gU2V0IHBvc3QtZXhlY3V0aW9uIHRvIHdvcmtzcGFjZVxuXHRcdGNvbnN0IHBvc3RBY3Rpb25zID0gc2VydmljZS5nZXRQb3N0Q29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBwb3N0V29ya3NwYWNlQWN0aW9uID0gcG9zdEFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1dvcmtzcGFjZScpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cdFx0YXNzZXJ0Lm9rKHBvc3RXb3Jrc3BhY2VBY3Rpb24pO1xuXHRcdGF3YWl0IHBvc3RXb3Jrc3BhY2VBY3Rpb24uc2VsZWN0KCk7XG5cblx0XHQvLyBWZXJpZnkgdGhleSdyZSBpbmRlcGVuZGVudFxuXHRcdGNvbnN0IHByZVJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGNvbnN0IHBvc3RSZXN1bHQgPSBzZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9uKHJlZik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZVJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBvc3RSZXN1bHQsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZmVyZW50IE1DUCBzZXJ2ZXJzIGhhdmUgaW5kZXBlbmRlbnQgY29uZmlybWF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYxID0gY3JlYXRlTWNwVG9vbFJlZigndG9vbDEnLCAnc2VydmVyMScsICdTZXJ2ZXIgMScpO1xuXHRcdGNvbnN0IHJlZjIgPSBjcmVhdGVNY3BUb29sUmVmKCd0b29sMicsICdzZXJ2ZXIyJywgJ1NlcnZlciAyJyk7XG5cblx0XHQvLyBTZXQgc2VydmVyMSB0byBzZXNzaW9uXG5cdFx0Y29uc3QgYWN0aW9uczEgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjEpO1xuXHRcdGNvbnN0IHNlcnZlckFjdGlvbjEgPSBhY3Rpb25zMS5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyIDEnKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdTZXNzaW9uJykpO1xuXHRcdGFzc2VydC5vayhzZXJ2ZXJBY3Rpb24xKTtcblx0XHRhd2FpdCBzZXJ2ZXJBY3Rpb24xLnNlbGVjdCgpO1xuXG5cdFx0Ly8gU2V0IHNlcnZlcjIgdG8gd29ya3NwYWNlXG5cdFx0Y29uc3QgYWN0aW9uczIgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZjIpO1xuXHRcdGNvbnN0IHNlcnZlckFjdGlvbjIgPSBhY3Rpb25zMi5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyIDInKSAmJiBhLmxhYmVsLmluY2x1ZGVzKCdXb3Jrc3BhY2UnKSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZlckFjdGlvbjIpO1xuXHRcdGF3YWl0IHNlcnZlckFjdGlvbjIuc2VsZWN0KCk7XG5cblx0XHQvLyBWZXJpZnkgdGhleSdyZSBpbmRlcGVuZGVudFxuXHRcdGNvbnN0IHJlc3VsdDEgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMSk7XG5cdFx0Y29uc3QgcmVzdWx0MiA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0MSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aW9ucyByZXR1cm4gdHJ1ZSB3aGVuIHNlbGVjdCBpcyBjYWxsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gY3JlYXRlVG9vbFJlZigndGVzdFRvb2wnKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWN0aW9uLnNlbGVjdCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIGNvbmZpcm1hdGlvbnMgYXJlIHN0b3JlZCBpbiBtZW1vcnkgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBjcmVhdGVUb29sUmVmKCd0ZXN0VG9vbCcpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3Qgc2Vzc2lvbkFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ1Nlc3Npb24nKSAmJiAhYS5sYWJlbC5pbmNsdWRlcygnU2VydmVyJykpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb25BY3Rpb24pO1xuXHRcdGF3YWl0IHNlc3Npb25BY3Rpb24uc2VsZWN0KCk7XG5cblx0XHQvLyBWZXJpZnkgaXQncyBzZXRcblx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICdzZXNzaW9uJyB9KTtcblxuXHRcdC8vIENyZWF0ZSBuZXcgc2VydmljZSBpbnN0YW5jZSAoc2ltdWxhdGluZyByZXN0YXJ0KVxuXHRcdGNvbnN0IG5ld1NlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSkpO1xuXG5cdFx0Ly8gU2Vzc2lvbiBjb25maXJtYXRpb24gc2hvdWxkIG5vdCBwZXJzaXN0XG5cdFx0Y29uc3QgbmV3UmVzdWx0ID0gbmV3U2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld1Jlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY29tYmluYXRpb24gYWN0aW9ucyBhcmUgb25seSBvZmZlcmVkIHdoZW4gY29tYmluYXRpb25MYWJlbCBpcyBzZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmV2l0aG91dCA9IGNyZWF0ZVRvb2xSZWYoJ3Rlc3RUb29sJywgVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsIHsgZmlsZTogJ2Zvby50eHQnIH0pO1xuXHRcdGNvbnN0IGFjdGlvbnNXaXRob3V0ID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWZXaXRob3V0KTtcblx0XHRhc3NlcnQub2soIWFjdGlvbnNXaXRob3V0LnNvbWUoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdmb28udHh0JykpKTtcblxuXHRcdGNvbnN0IHJlZldpdGggPSBhd2FpdCBjcmVhdGVDb21iaW5hdGlvblJlZigndGVzdFRvb2wnLCB7IGZpbGU6ICdmb28udHh0JyB9LCAnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpO1xuXHRcdGNvbnN0IGFjdGlvbnNXaXRoID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWZXaXRoKTtcblx0XHRhc3NlcnQub2soYWN0aW9uc1dpdGguc29tZShhID0+IGEubGFiZWwuaW5jbHVkZXMoJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21iaW5hdGlvbiBhY3Rpb25zIGluY2x1ZGUgc2Vzc2lvbiwgd29ya3NwYWNlLCBhbmQgcHJvZmlsZSBzY29wZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgY3JlYXRlQ29tYmluYXRpb25SZWYoJ3Rlc3RUb29sJywgeyBmaWxlOiAnZm9vLnR4dCcgfSwgJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKTtcblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IGNvbWJpbmF0aW9uQWN0aW9ucyA9IGFjdGlvbnMuZmlsdGVyKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tYmluYXRpb25BY3Rpb25zLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbWJpbmF0aW9uQWN0aW9ucy5zb21lKGEgPT4gYS5zY29wZSA9PT0gJ3Nlc3Npb24nKSk7XG5cdFx0YXNzZXJ0Lm9rKGNvbWJpbmF0aW9uQWN0aW9ucy5zb21lKGEgPT4gYS5zY29wZSA9PT0gJ3dvcmtzcGFjZScpKTtcblx0XHRhc3NlcnQub2soY29tYmluYXRpb25BY3Rpb25zLnNvbWUoYSA9PiBhLnNjb3BlID09PSAncHJvZmlsZScpKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0aW5nIGEgY29tYmluYXRpb24gc2Vzc2lvbiBhY3Rpb24gYXV0by1jb25maXJtcyB0aGUgc2FtZSBwYXJhbWV0ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Zvby50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZiksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IGNvbWJpbmF0aW9uQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpICYmIGEuc2NvcGUgPT09ICdzZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbWJpbmF0aW9uQWN0aW9uKTtcblx0XHRhd2FpdCBjb21iaW5hdGlvbkFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3Nlc3Npb24nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3RpbmcgYSBjb21iaW5hdGlvbiB3b3Jrc3BhY2UgYWN0aW9uIHN0b3JlcyBhdCB3b3Jrc3BhY2Ugc2NvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgY3JlYXRlQ29tYmluYXRpb25SZWYoJ3Rlc3RUb29sJywgeyBmaWxlOiAnZm9vLnR4dCcgfSwgJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgY29tYmluYXRpb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJykgJiYgYS5zY29wZSA9PT0gJ3dvcmtzcGFjZScpO1xuXHRcdGFzc2VydC5vayhjb21iaW5hdGlvbkFjdGlvbik7XG5cdFx0YXdhaXQgY29tYmluYXRpb25BY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbWJpbmF0aW9uIGFwcHJvdmFsIGRvZXMgbm90IGFwcGx5IHRvIGRpZmZlcmVudCBwYXJhbWV0ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZkZvbyA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Zvby50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJyk7XG5cdFx0Y29uc3QgcmVmQmFyID0gYXdhaXQgY3JlYXRlQ29tYmluYXRpb25SZWYoJ3Rlc3RUb29sJywgeyBmaWxlOiAnYmFyLnR4dCcgfSwgJ0FsbG93IHJlYWRpbmcgXCJiYXIudHh0XCInKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZkZvbyk7XG5cdFx0Y29uc3QgY29tYmluYXRpb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJykgJiYgYS5zY29wZSA9PT0gJ3Nlc3Npb24nKTtcblx0XHRhc3NlcnQub2soY29tYmluYXRpb25BY3Rpb24pO1xuXHRcdGF3YWl0IGNvbWJpbmF0aW9uQWN0aW9uLnNlbGVjdCgpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWZGb28pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZkJhciksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rvb2wtbGV2ZWwgYXBwcm92YWwgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGNvbWJpbmF0aW9uIGFwcHJvdmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Zvby50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJyk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9ucyhyZWYpO1xuXHRcdGNvbnN0IHRvb2xTZXNzaW9uQWN0aW9uID0gYWN0aW9ucy5maW5kKGEgPT4gYS5sYWJlbC5pbmNsdWRlcygnU2Vzc2lvbicpXG5cdFx0XHQmJiAhYS5sYWJlbC5pbmNsdWRlcygnZm9vLnR4dCcpICYmICFhLmxhYmVsLmluY2x1ZGVzKCdTZXJ2ZXInKSk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xTZXNzaW9uQWN0aW9uKTtcblx0XHRhd2FpdCB0b29sU2Vzc2lvbkFjdGlvbi5zZWxlY3QoKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3Nlc3Npb24nIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21iaW5hdGlvbiBhcHByb3ZhbHMgYXJlIGNsZWFyZWQgb24gcmVzZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgY3JlYXRlQ29tYmluYXRpb25SZWYoJ3Rlc3RUb29sJywgeyBmaWxlOiAnZm9vLnR4dCcgfSwgJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgY29tYmluYXRpb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJykgJiYgYS5zY29wZSA9PT0gJ3Nlc3Npb24nKTtcblx0XHRhc3NlcnQub2soY29tYmluYXRpb25BY3Rpb24pO1xuXHRcdGF3YWl0IGNvbWJpbmF0aW9uQWN0aW9uLnNlbGVjdCgpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKSk7XG5cblx0XHRzZXJ2aWNlLnJlc2V0VG9vbEF1dG9Db25maXJtYXRpb24oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbWJpbmF0aW9uIHNlc3Npb24gYXBwcm92YWxzIGRvIG5vdCBwZXJzaXN0IGFjcm9zcyBzZXJ2aWNlIGluc3RhbmNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCBjcmVhdGVDb21iaW5hdGlvblJlZigndGVzdFRvb2wnLCB7IGZpbGU6ICdmb28udHh0JyB9LCAnQWxsb3cgcmVhZGluZyBcImZvby50eHRcIicpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbnMocmVmKTtcblx0XHRjb25zdCBjb21iaW5hdGlvbkFjdGlvbiA9IGFjdGlvbnMuZmluZChhID0+IGEubGFiZWwuaW5jbHVkZXMoJ0FsbG93IHJlYWRpbmcgXCJmb28udHh0XCInKSAmJiBhLnNjb3BlID09PSAnc2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhjb21iaW5hdGlvbkFjdGlvbik7XG5cdFx0YXdhaXQgY29tYmluYXRpb25BY3Rpb24uc2VsZWN0KCk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpKTtcblxuXHRcdGNvbnN0IG5ld1NlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdTZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnbGVnYWN5IHN0cmluZ1tdIHN0b3JhZ2UgZm9ybWF0IGlzIHJlYWQgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdC8vIFByZS1zZWVkIHN0b3JhZ2Ugd2l0aCB0aGUgbGVnYWN5IHN0cmluZ1tdIGZvcm1hdFxuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQvYXV0b2NvbmZpcm0nLCBKU09OLnN0cmluZ2lmeShbJ3Rvb2wxJywgJ3Rvb2wyJ10pLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IHNlcnZpY2UgaW5zdGFuY2UgdGhhdCByZWFkcyB0aGUgbGVnYWN5IGRhdGFcblx0XHRjb25zdCBuZXdTZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHJlZjEgPSBjcmVhdGVUb29sUmVmKCd0b29sMScpO1xuXHRcdGNvbnN0IHJlZjIgPSBjcmVhdGVUb29sUmVmKCd0b29sMicpO1xuXHRcdGNvbnN0IHJlZjMgPSBjcmVhdGVUb29sUmVmKCd0b29sMycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdTZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMSksIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1NlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYyKSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChuZXdTZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBSZWNvcmQgc3RvcmFnZSBmb3JtYXQgcHJlc2VydmVzIGxhYmVscycsICgpID0+IHtcblx0XHQvLyBQcmUtc2VlZCBzdG9yYWdlIHdpdGggdGhlIG5ldyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuPiBmb3JtYXRcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW4+ID0ge1xuXHRcdFx0J3Rvb2wxOmNvbWJpbmF0aW9uOjEyMzQ1JzogJ0FsbG93IHJlYWRpbmcgZm9vLnR4dCcsXG5cdFx0XHQndG9vbDInOiB0cnVlLFxuXHRcdH07XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2NoYXQvYXV0b2NvbmZpcm0nLCBKU09OLnN0cmluZ2lmeShkYXRhKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IG5ld1NlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSkpO1xuXG5cdFx0Ly8gdG9vbDIgc2hvdWxkIGJlIGF1dG8tY29uZmlybWVkIChib29sZWFuIHRydWUsIG5vIGxhYmVsKVxuXHRcdGNvbnN0IHJlZjIgPSBjcmVhdGVUb29sUmVmKCd0b29sMicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3U2VydmljZS5nZXRQcmVDb25maXJtQWN0aW9uKHJlZjIpLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29iamVjdCBzdG9yYWdlIGZvcm1hdCB3aXRoIGFyZ3VtZW50cyByb3VuZC10cmlwcyBhY3Jvc3MgcmVzdGFydCcsICgpID0+IHtcblx0XHQvLyBQcmUtc2VlZCBzdG9yYWdlIHdpdGggdGhlIG5ldyBvYmplY3QgZm9ybWF0IGNvbnRhaW5pbmcgYXJndW1lbnRzXG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBib29sZWFuIHwgeyBsYWJlbD86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nIH0+ID0ge1xuXHRcdFx0J3Rvb2wxOmNvbWJpbmF0aW9uOjEyMzQ1JzogeyBsYWJlbDogJ0FsbG93IHJlYWRpbmcgZm9vLnR4dCcsIGFyZ3VtZW50czogJ1tcImZvby50eHRcIl0nIH0sXG5cdFx0XHQndG9vbDI6Y29tYmluYXRpb246Njc4OTAnOiB7IGxhYmVsOiAnQWxsb3cgY29tbWFuZCB3aXRoIGFyZ3MnIH0sXG5cdFx0fTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2hhdC9hdXRvY29uZmlybS1jb21iaW5hdGlvbicsIEpTT04uc3RyaW5naWZ5KGRhdGEpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Y29uc3QgbmV3U2VydmljZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKSk7XG5cblx0XHQvLyBCb3RoIGNvbWJpbmF0aW9uIGtleXMgc2hvdWxkIGJlIGF1dG8tY29uZmlybWVkXG5cdFx0Y29uc3QgcmVmMTogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmID0ge1xuXHRcdFx0Li4uY3JlYXRlVG9vbFJlZigndG9vbDEnKSxcblx0XHRcdGNvbWJpbmF0aW9uOiB7IGxhYmVsOiAnQWxsb3cgcmVhZGluZyBmb28udHh0Jywga2V5OiAndG9vbDE6Y29tYmluYXRpb246MTIzNDUnLCBhcmd1bWVudHM6ICdbXCJmb28udHh0XCJdJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmVmMjogSUxhbmd1YWdlTW9kZWxUb29sQ29uZmlybWF0aW9uUmVmID0ge1xuXHRcdFx0Li4uY3JlYXRlVG9vbFJlZigndG9vbDInKSxcblx0XHRcdGNvbWJpbmF0aW9uOiB7IGxhYmVsOiAnQWxsb3cgY29tbWFuZCB3aXRoIGFyZ3MnLCBrZXk6ICd0b29sMjpjb21iaW5hdGlvbjo2Nzg5MCcgfSxcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdTZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb24ocmVmMSksIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkxtU2VydmljZVBlclRvb2wsIHNjb3BlOiAnd29ya3NwYWNlJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1NlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYyKSwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuTG1TZXJ2aWNlUGVyVG9vbCwgc2NvcGU6ICd3b3Jrc3BhY2UnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21iaW5hdGlvbiBhcHByb3ZhbCB3aXRoIGFyZ3VtZW50cyBwZXJzaXN0cyB2aWEgd29ya3NwYWNlIHNjb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IGNyZWF0ZUNvbWJpbmF0aW9uUmVmKCd0ZXN0VG9vbCcsIHsgZmlsZTogJ2Zvby50eHQnIH0sICdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJywgJ3tcImZpbGVcIjpcImZvby50eHRcIn0nKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBzZXJ2aWNlLmdldFByZUNvbmZpcm1BY3Rpb25zKHJlZik7XG5cdFx0Y29uc3QgY29tYmluYXRpb25BY3Rpb24gPSBhY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsLmluY2x1ZGVzKCdBbGxvdyByZWFkaW5nIFwiZm9vLnR4dFwiJykgJiYgYS5zY29wZSA9PT0gJ3dvcmtzcGFjZScpO1xuXHRcdGFzc2VydC5vayhjb21iaW5hdGlvbkFjdGlvbik7XG5cdFx0YXdhaXQgY29tYmluYXRpb25BY3Rpb24uc2VsZWN0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0UHJlQ29uZmlybUFjdGlvbihyZWYpLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sLCBzY29wZTogJ3dvcmtzcGFjZScgfSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxpQkFBaUIsd0JBQXdCLGNBQWMscUJBQXFCO0FBQ3JGLFNBQVMsNkNBQTZDO0FBQ3RELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQW1KO0FBQzVKLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0seUNBQXlDLE1BQU07QUFDcEQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLDJC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
