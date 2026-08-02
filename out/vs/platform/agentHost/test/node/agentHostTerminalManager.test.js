import assert from "assert";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/protocol/actions.js";
import { TerminalClaimKind } from "../../common/state/protocol/state.js";
import { AgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentHostTerminalManager, formatTerminalText, removeTerminalQueriesSuppressedFromClient } from "../../node/agentHostTerminalManager.js";
import { Osc633EventType, Osc633Parser } from "../../node/osc633Parser.js";
class TestTerminalDataHandler {
  constructor(uri, tracker) {
    this.uri = uri;
    this.tracker = tracker;
    this.dispatched = [];
    this.content = [];
    this.cwd = "/home/user";
    this._terminalQueryFilterState = { pendingData: "" };
  }
  /** Simulates AgentHostTerminalManager._handlePtyData */
  handlePtyData(rawData) {
    let cleanedForClient = "";
    let pendingClientData = "";
    const flushClientData = () => {
      if (pendingClientData.length === 0) {
        return;
      }
      this.dispatched.push({
        type: ActionType.TerminalData,
        data: pendingClientData
      });
      cleanedForClient += pendingClientData;
      pendingClientData = "";
    };
    for (const segment of this.tracker.parser.parseSegments(rawData)) {
      if (segment.kind === "event") {
        flushClientData();
        this._handleOsc633Event(segment.event);
        continue;
      }
      const cleanedData = removeTerminalQueriesSuppressedFromClient(segment.data, this._terminalQueryFilterState);
      if (cleanedData.length > 0) {
        this._appendToContent(cleanedData);
        pendingClientData += cleanedData;
      }
    }
    flushClientData();
    return cleanedForClient;
  }
  _handleOsc633Event(event) {
    if (!this.tracker.detectionAvailableEmitted) {
      this.tracker.detectionAvailableEmitted = true;
      this.dispatched.push({
        type: ActionType.TerminalCommandDetectionAvailable
      });
    }
    switch (event.type) {
      case Osc633EventType.CommandLine: {
        if (event.nonce === this.tracker.nonce) {
          this.tracker.pendingCommandLine = event.commandLine;
        }
        break;
      }
      case Osc633EventType.CommandExecuted: {
        const commandId = `cmd-${++this.tracker.commandCounter}`;
        const commandLine = this.tracker.pendingCommandLine ?? "";
        const timestamp = Date.now();
        this.tracker.pendingCommandLine = void 0;
        this.tracker.activeCommandId = commandId;
        this.tracker.activeCommandTimestamp = timestamp;
        this.content.push({
          type: "command",
          commandId,
          commandLine,
          output: "",
          timestamp,
          isComplete: false
        });
        this.dispatched.push({
          type: ActionType.TerminalCommandExecuted,
          commandId,
          commandLine,
          timestamp
        });
        break;
      }
      case Osc633EventType.CommandFinished: {
        const finishedCommandId = this.tracker.activeCommandId;
        if (!finishedCommandId) {
          break;
        }
        const durationMs = this.tracker.activeCommandTimestamp !== void 0 ? Date.now() - this.tracker.activeCommandTimestamp : void 0;
        for (const part of this.content) {
          if (part.type === "command" && part.commandId === finishedCommandId) {
            part.isComplete = true;
            part.exitCode = event.exitCode;
            part.durationMs = durationMs;
            break;
          }
        }
        this.tracker.activeCommandId = void 0;
        this.tracker.activeCommandTimestamp = void 0;
        this.dispatched.push({
          type: ActionType.TerminalCommandFinished,
          commandId: finishedCommandId,
          exitCode: event.exitCode,
          durationMs
        });
        break;
      }
      case Osc633EventType.Property: {
        if (event.key === "Cwd") {
          this.cwd = event.value;
          this.dispatched.push({
            type: ActionType.TerminalCwdChanged,
            cwd: event.value
          });
        }
        break;
      }
    }
  }
  _appendToContent(data) {
    const tail = this.content.length > 0 ? this.content[this.content.length - 1] : void 0;
    if (tail && tail.type === "command" && !tail.isComplete) {
      tail.output += data;
    } else if (tail && tail.type === "unclassified") {
      tail.value += data;
    } else {
      this.content.push({ type: "unclassified", value: data });
    }
  }
}
class TestPty {
  constructor() {
    this.pid = 1;
    this.cols = 80;
    this.rows = 24;
    this.process = "test-shell";
    this.handleFlowControl = false;
    this.writes = [];
    this.dataListenerRegistered = new DeferredPromise();
    this._onData = new Emitter();
    this.onData = (listener) => {
      this.dataListenerRegistered.complete();
      return this._onData.event((data) => listener(data));
    };
    this._onExit = new Emitter();
    this.onExit = (listener) => this._onExit.event((data) => listener(data));
  }
  fireData(data) {
    this._onData.fire(data);
  }
  resize(columns, rows) {
    this.cols = columns;
    this.rows = rows;
  }
  clear() {
  }
  write(data) {
    this.writes.push(typeof data === "string" ? data : data.toString());
  }
  kill() {
  }
  pause() {
  }
  resume() {
  }
}
class TestAgentHostTerminalManager extends AgentHostTerminalManager {
  constructor(stateManager, logService, productService, configurationService, _pty) {
    super(stateManager, logService, productService, configurationService);
    this._pty = _pty;
  }
  async _spawnPty(_file, _args, options) {
    this.spawnOptions = options;
    this._pty.cols = options.cols ?? this._pty.cols;
    this._pty.rows = options.rows ?? this._pty.rows;
    return this._pty;
  }
}
function osc633(payload) {
  return `\x1B]633;${payload}\x07`;
}
function createHandler(nonce = "test-nonce") {
  return new TestTerminalDataHandler("terminal://test", {
    parser: new Osc633Parser(),
    nonce,
    commandCounter: 0,
    detectionAvailableEmitted: false
  });
}
async function waitForWrites(pty, count) {
  for (let i = 0; i < 20; i++) {
    if (pty.writes.length >= count) {
      return;
    }
    await timeout(10);
  }
}
suite("AgentHostTerminalManager \u2013 command detection integration", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("formats command input with terminal enter semantics", () => {
    assert.strictEqual(formatTerminalText("echo first\necho second", { shouldExecute: true }), "echo first\recho second\r");
    assert.strictEqual(formatTerminalText("echo first\r\necho second", { shouldExecute: true }), "echo first\recho second\r");
    assert.strictEqual(formatTerminalText("echo first\r", { shouldExecute: true }), "echo first\r");
    assert.strictEqual(formatTerminalText("answer\n", { shouldExecute: false }), "answer\r");
    assert.strictEqual(formatTerminalText("/tmp/foo\npwd", { shouldExecute: true }), "/tmp/foo\rpwd\r");
    assert.strictEqual(formatTerminalText("echo first\necho second", { shouldExecute: true, forceBracketedPasteMode: true }), "\x1B[200~echo first\recho second\x1B[201~\r");
    assert.strictEqual(formatTerminalText("answer\n", { shouldExecute: false, forceBracketedPasteMode: true }), "\x1B[200~answer\r\x1B[201~");
  });
  test("writes formatted command input to the PTY", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/command-input",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    await manager.sendText("agenthost-terminal://test/command-input", "echo first\necho second", { shouldExecute: true });
    assert.deepStrictEqual(pty.writes, ["echo first\recho second\r"]);
  });
  test("writes bracketed paste command input when enabled by the terminal", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/bracketed-paste",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("\x1B[?2004h");
    await createTerminal;
    await manager.sendText("agenthost-terminal://test/bracketed-paste", "echo first\necho second", { shouldExecute: true, bracketedPasteMode: true });
    assert.deepStrictEqual(pty.writes, ["\x1B[200~echo first\recho second\x1B[201~\r"]);
  });
  test("does not write bracketed paste command input when disabled by the terminal", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/bracketed-paste-disabled",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    await manager.sendText("agenthost-terminal://test/bracketed-paste-disabled", "echo first\necho second", { shouldExecute: true, bracketedPasteMode: true });
    assert.deepStrictEqual(pty.writes, ["echo first\recho second\r"]);
  });
  test("sets zsh agent fixups only for session zsh terminals", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    async function createTestTerminal(id, shell, claim, options) {
      const pty = new TestPty();
      const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
      const createTerminal = manager.createTerminal({
        channel: `agenthost-terminal://test/${id}`,
        claim,
        cwd: process.cwd(),
        cols: 80,
        rows: 24
      }, { shell, ...options });
      await pty.dataListenerRegistered.p;
      pty.fireData("prompt");
      await createTerminal;
      return manager;
    }
    const zshSessionManager = await createTestTerminal("zsh-session-fixups", "/bin/zsh", {
      kind: TerminalClaimKind.Session,
      session: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-1"
    }, { preventShellHistory: true });
    assert.strictEqual(zshSessionManager.spawnOptions?.env?.VSCODE_AGENT_ZSH_FIXUPS, "1");
    assert.strictEqual(zshSessionManager.spawnOptions?.env?.VSCODE_PREVENT_SHELL_HISTORY, "1");
    const zshClientManager = await createTestTerminal("zsh-client", "/bin/zsh", {
      kind: TerminalClaimKind.Client,
      clientId: "test-client"
    });
    assert.strictEqual(zshClientManager.spawnOptions?.env?.VSCODE_AGENT_ZSH_FIXUPS, void 0);
    const bashSessionManager = await createTestTerminal("bash-session-history", "/bin/bash", {
      kind: TerminalClaimKind.Session,
      session: "copilot:/session-1",
      turnId: "turn-1",
      toolCallId: "tool-2"
    }, { preventShellHistory: true, nonInteractive: true });
    assert.strictEqual(bashSessionManager.spawnOptions?.env?.VSCODE_AGENT_ZSH_FIXUPS, void 0);
    assert.strictEqual(bashSessionManager.spawnOptions?.env?.VSCODE_PREVENT_SHELL_HISTORY, "1");
  });
  test("writes headless DSR responses back to the PTY", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const createTerminal = manager.createTerminal({
      channel: "agenthost-terminal://test/dsr",
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("abc\x1B[6n");
    await createTerminal;
    await waitForWrites(pty, 1);
    assert.deepStrictEqual(pty.writes, ["\x1B[1;4R"]);
  });
  test("swallows OSC color queries while preserving headless CPR responses", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/color-query";
    const clientData = [];
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    disposables.add(manager.onData(uri, (data) => clientData.push(data)));
    pty.fireData("before\x1B]10;?\x1B\\\x1B[6nmid\x1B]11;?\x07\x1B[6nafter");
    await createTerminal;
    await waitForWrites(pty, 2);
    assert.deepStrictEqual({
      clientData,
      ptyWrites: pty.writes
    }, {
      clientData: ["beforemidafter"],
      ptyWrites: ["\x1B[1;7R", "\x1B[1;10R"]
    });
  });
  test("resolves alt-buffer promise from headless terminal data", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/alt-buffer";
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    const altBufferStore = disposables.add(new DisposableStore());
    const altBufferPromise = manager.createAltBufferPromise(uri, altBufferStore);
    pty.fireData("\x1B[?1049h");
    await altBufferPromise;
  });
  test("disposed alt-buffer promise listener does not resolve", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/alt-buffer-disposed";
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData("prompt");
    await createTerminal;
    const altBufferStore = new DisposableStore();
    const altBufferPromise = manager.createAltBufferPromise(uri, altBufferStore);
    let didEnterAltBuffer = false;
    void altBufferPromise.then(() => didEnterAltBuffer = true);
    altBufferStore.dispose();
    pty.fireData("\x1B[?1049h");
    await timeout(10);
    assert.strictEqual(didEnterAltBuffer, false);
  });
  test("client-suppressed terminal queries are stripped from client-facing data", () => {
    function filter(data) {
      return removeTerminalQueriesSuppressedFromClient(data, { pendingData: "" });
    }
    assert.strictEqual(filter("before \x1B[6n after"), "before  after");
    assert.strictEqual(filter("before \x1B[?6n after"), "before  after");
    assert.strictEqual(filter("before \x1B]10;?\x1B\\ after"), "before  after");
    assert.strictEqual(filter("before \x1B]10;?\x07 after"), "before  after");
    assert.strictEqual(filter("before \x1B]11;?\x1B\\ after"), "before  after");
    assert.strictEqual(filter("before \x1B]11;?\x07 after"), "before  after");
    assert.strictEqual(filter("\x1B[5n\x1B[c\x1B[0c\x1B[>c\x1B[>0c"), "\x1B[5n\x1B[c\x1B[0c\x1B[>c\x1B[>0c");
    assert.strictEqual(filter("\x1B]10;#ffffff\x1B\\\x1B]11;rgb:0000/0000/0000\x07"), "\x1B]10;#ffffff\x1B\\\x1B]11;rgb:0000/0000/0000\x07");
    assert.strictEqual(filter("\x1B]10;?;#ffffff\x1B\\\x1B]12;?\x1B\\\x1B]4;0;?\x1B\\"), "\x1B]10;?;#ffffff\x1B\\\x1B]12;?\x1B\\\x1B]4;0;?\x1B\\");
    assert.strictEqual(filter("normal output\r\n"), "normal output\r\n");
  });
  test("client-suppressed terminal queries are stripped across data chunks", () => {
    let state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B[", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("6n after", state), " after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B[?", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("6n after", state), " after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B[", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("K after", state), "\x1B[K after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B]10;", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("?\x1B", state), "");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("\\ after", state), " after");
    state = { pendingData: "" };
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("before \x1B]11;", state), "before ");
    assert.strictEqual(removeTerminalQueriesSuppressedFromClient("?\x07 after", state), " after");
  });
  test("manager data path strips CPR queries while preserving surrounding output", () => {
    const handler = createHandler();
    const cleaned = handler.handlePtyData(`before${osc633("A")}\x1B[6nmid\x1B[?6nafter`);
    assert.strictEqual(cleaned, "beforemidafter");
    assert.deepStrictEqual(handler.content, [{ type: "unclassified", value: "beforemidafter" }]);
    assert.deepStrictEqual(handler.dispatched, [
      { type: ActionType.TerminalData, data: "before" },
      { type: ActionType.TerminalCommandDetectionAvailable },
      { type: ActionType.TerminalData, data: "midafter" }
    ]);
  });
  test("TerminalCommandDetectionAvailable is dispatched on first OSC 633", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("A"));
    assert.strictEqual(handler.dispatched.length, 1);
    assert.strictEqual(handler.dispatched[0].type, ActionType.TerminalCommandDetectionAvailable);
  });
  test("TerminalCommandDetectionAvailable is dispatched only once", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("A"));
    handler.handlePtyData(osc633("B"));
    handler.handlePtyData(osc633("A"));
    const detectionActions = handler.dispatched.filter(
      (a) => a.type === ActionType.TerminalCommandDetectionAvailable
    );
    assert.strictEqual(detectionActions.length, 1);
  });
  test("full command lifecycle dispatches correct actions", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("A")}$ ${osc633("B")}`);
    handler.handlePtyData(`${osc633("E;echo\\x20hello;test-nonce")}${osc633("C")}`);
    handler.handlePtyData("hello\r\n");
    handler.handlePtyData(osc633("D;0"));
    const actions = handler.dispatched;
    assert.strictEqual(actions[0].type, ActionType.TerminalCommandDetectionAvailable);
    const executed = actions.find((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.ok(executed);
    assert.strictEqual(executed.commandId, "cmd-1");
    assert.strictEqual(executed.commandLine, "echo hello");
    const finished = actions.find((a) => a.type === ActionType.TerminalCommandFinished);
    assert.ok(finished);
    assert.strictEqual(finished.commandId, "cmd-1");
    assert.strictEqual(finished.exitCode, 0);
  });
  test("content parts are structured correctly after command lifecycle", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("A")}user@host:~ $ ${osc633("B")}`);
    handler.handlePtyData(`${osc633("E;ls;test-nonce")}${osc633("C")}`);
    handler.handlePtyData("file1\nfile2\n");
    handler.handlePtyData(osc633("D;0"));
    handler.handlePtyData(`${osc633("A")}user@host:~ $ `);
    assert.deepStrictEqual(handler.content.map((p) => ({
      type: p.type,
      ...p.type === "unclassified" ? { value: p.value } : {
        commandId: p.commandId,
        commandLine: p.commandLine,
        output: p.output,
        isComplete: p.isComplete,
        exitCode: p.exitCode
      }
    })), [
      { type: "unclassified", value: "user@host:~ $ " },
      {
        type: "command",
        commandId: "cmd-1",
        commandLine: "ls",
        output: "file1\nfile2\n",
        isComplete: true,
        exitCode: 0
      },
      { type: "unclassified", value: "user@host:~ $ " }
    ]);
  });
  test("nonce validation rejects untrusted command lines", () => {
    const handler = createHandler("my-secret-nonce");
    handler.handlePtyData(osc633("E;rm\\x20-rf\\x20/;wrong-nonce"));
    handler.handlePtyData(osc633("C"));
    const executed = handler.dispatched.find((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.ok(executed);
    assert.strictEqual(executed.commandLine, "");
  });
  test("nonce validation accepts trusted command lines", () => {
    const handler = createHandler("my-secret-nonce");
    handler.handlePtyData(osc633("E;echo\\x20safe;my-secret-nonce"));
    handler.handlePtyData(osc633("C"));
    const executed = handler.dispatched.find((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.ok(executed);
    assert.strictEqual(executed.commandLine, "echo safe");
  });
  test("multiple sequential commands get sequential IDs", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("E;cmd1;test-nonce")}${osc633("C")}`);
    handler.handlePtyData(osc633("D;0"));
    handler.handlePtyData(`${osc633("E;cmd2;test-nonce")}${osc633("C")}`);
    handler.handlePtyData(osc633("D;1"));
    const executed = handler.dispatched.filter((a) => a.type === ActionType.TerminalCommandExecuted);
    assert.strictEqual(executed.length, 2);
    assert.strictEqual(executed[0].commandId, "cmd-1");
    assert.strictEqual(executed[0].commandLine, "cmd1");
    assert.strictEqual(executed[1].commandId, "cmd-2");
    assert.strictEqual(executed[1].commandLine, "cmd2");
    const finished = handler.dispatched.filter((a) => a.type === ActionType.TerminalCommandFinished);
    assert.strictEqual(finished.length, 2);
    assert.strictEqual(finished[0].commandId, "cmd-1");
    assert.strictEqual(finished[0].exitCode, 0);
    assert.strictEqual(finished[1].commandId, "cmd-2");
    assert.strictEqual(finished[1].exitCode, 1);
  });
  test("CWD property dispatches TerminalCwdChanged", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("P;Cwd=/new/working/dir"));
    const cwdAction = handler.dispatched.find((a) => a.type === ActionType.TerminalCwdChanged);
    assert.ok(cwdAction);
    assert.strictEqual(cwdAction.cwd, "/new/working/dir");
    assert.strictEqual(handler.cwd, "/new/working/dir");
  });
  test("OSC 633 sequences are stripped from cleaned output", () => {
    const handler = createHandler();
    const cleaned = handler.handlePtyData(
      `before${osc633("A")}prompt${osc633("B")}${osc633("E;ls;test-nonce")}${osc633("C")}output${osc633("D;0")}after`
    );
    assert.strictEqual(cleaned, "beforepromptoutputafter");
  });
  test("data without shell integration passes through unmodified", () => {
    const handler = new TestTerminalDataHandler("terminal://test", {
      parser: new Osc633Parser(),
      nonce: "nonce",
      commandCounter: 0,
      detectionAvailableEmitted: false
    });
    const data = "regular terminal output with \x1B[31mcolors\x1B[0m";
    const cleaned = handler.handlePtyData(data);
    assert.strictEqual(cleaned, data);
    assert.deepStrictEqual(handler.content, [
      { type: "unclassified", value: data }
    ]);
    assert.deepStrictEqual(handler.dispatched, [
      { type: ActionType.TerminalData, data }
    ]);
  });
  test("CommandFinished without active command is ignored", () => {
    const handler = createHandler();
    handler.handlePtyData(osc633("A"));
    handler.handlePtyData(osc633("D;0"));
    const finished = handler.dispatched.filter((a) => a.type === ActionType.TerminalCommandFinished);
    assert.strictEqual(finished.length, 0);
  });
  test("command output is accumulated in the command content part", () => {
    const handler = createHandler();
    handler.handlePtyData(`${osc633("E;test;test-nonce")}${osc633("C")}`);
    handler.handlePtyData("line1\r\n");
    handler.handlePtyData("line2\r\n");
    handler.handlePtyData("line3\r\n");
    handler.handlePtyData(osc633("D;0"));
    const cmdParts = handler.content.filter((p) => p.type === "command");
    assert.strictEqual(cmdParts.length, 1);
    assert.strictEqual(cmdParts[0].type === "command" && cmdParts[0].output, "line1\r\nline2\r\nline3\r\n");
  });
  test("output and CommandFinished arriving in one PTY read are attributed to the command", async () => {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const pty = new TestPty();
    const manager = disposables.add(new TestAgentHostTerminalManager(stateManager, logService, productService, configurationService, pty));
    const uri = "agenthost-terminal://test/coalesced-command-finished";
    const createTerminal = manager.createTerminal({
      channel: uri,
      claim: { kind: TerminalClaimKind.Client, clientId: "test-client" },
      cwd: process.cwd(),
      cols: 80,
      rows: 24
    }, { shell: process.platform === "win32" ? "pwsh.exe" : "/bin/bash" });
    await pty.dataListenerRegistered.p;
    pty.fireData(osc633("A"));
    await createTerminal;
    const completions = [];
    disposables.add(manager.onCommandFinished(uri, (event) => completions.push({
      exitCode: event.exitCode,
      output: event.output
    })));
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      const action = envelope.action;
      if (action.type === ActionType.TerminalCommandExecuted || action.type === ActionType.TerminalCommandFinished) {
        dispatched.push({ type: action.type });
      } else if (action.type === ActionType.TerminalData) {
        dispatched.push({ type: action.type, data: action.data });
      }
    }));
    pty.fireData(`${osc633("C")}hi\r
${osc633("D;0")}`);
    assert.deepStrictEqual(completions, [{ exitCode: 0, output: "hi\r\n" }]);
    assert.deepStrictEqual(dispatched, [
      { type: ActionType.TerminalCommandExecuted },
      { type: ActionType.TerminalData, data: "hi\r\n" },
      { type: ActionType.TerminalCommandFinished }
    ]);
  });
});
suite("AgentHostTerminalManager \u2013 output-only terminals", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createManager() {
    const logService = new NullLogService();
    const stateManager = disposables.add(new AgentHostStateManager(logService));
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const productService = { _serviceBrand: void 0, applicationName: "vscode" };
    const manager = disposables.add(new AgentHostTerminalManager(stateManager, logService, productService, configurationService));
    return { manager, stateManager };
  }
  test("streams appended data, snapshots state with isPty false, and records the exit", () => {
    const { manager, stateManager } = createManager();
    const uri = "agenthost-terminal://shell/copilotNonPtyShells/tc-1";
    const claim = { kind: TerminalClaimKind.Session, session: "agent-session://copilot/s1", toolCallId: "tc-1" };
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === uri) {
        dispatched.push(envelope.action);
      }
    }));
    manager.createOutputTerminal(uri, { title: "Run Shell Command", claim });
    manager.appendOutputTerminalData(uri, "tick 1\n");
    manager.appendOutputTerminalData(uri, "tick 2\n");
    manager.finalizeOutputTerminal(uri, 0);
    manager.finalizeOutputTerminal(uri, 1);
    assert.deepStrictEqual(manager.getTerminalState(uri), {
      title: "Run Shell Command",
      content: [{ type: "unclassified", value: "tick 1\ntick 2\n" }],
      exitCode: 0,
      claim,
      isPty: false
    });
    assert.deepStrictEqual(dispatched, [
      { type: ActionType.TerminalData, data: "tick 1\n" },
      { type: ActionType.TerminalData, data: "tick 2\n" },
      { type: ActionType.TerminalExited, exitCode: 0 }
    ]);
    assert.strictEqual(manager.hasTerminal(uri), false);
    assert.deepStrictEqual(manager.getTerminalInfos(), []);
  });
  test("reset clears content and dispose removes the channel", () => {
    const { manager, stateManager } = createManager();
    const uri = "agenthost-terminal://shell/copilotNonPtyShells/tc-2";
    const dispatched = [];
    disposables.add(stateManager.onDidEmitEnvelope((envelope) => {
      if (envelope.channel === uri) {
        dispatched.push(envelope.action);
      }
    }));
    manager.createOutputTerminal(uri, { title: "Bash", claim: { kind: TerminalClaimKind.Session, session: "agent-session://copilot/s1" } });
    manager.appendOutputTerminalData(uri, "old output");
    manager.resetOutputTerminal(uri);
    manager.appendOutputTerminalData(uri, "fresh output");
    assert.deepStrictEqual(manager.getTerminalState(uri)?.content, [{ type: "unclassified", value: "fresh output" }]);
    assert.deepStrictEqual(dispatched.map((action) => action.type), [ActionType.TerminalData, ActionType.TerminalCleared, ActionType.TerminalData]);
    manager.disposeTerminal(uri);
    assert.strictEqual(manager.hasTerminal(uri), false);
    assert.strictEqual(manager.getTerminalState(uri), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSB7IElQdHksIElQdHlGb3JrT3B0aW9ucywgSVdpbmRvd3NQdHlGb3JrT3B0aW9ucyB9IGZyb20gJ25vZGUtcHR5JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIFN0YXRlQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDbGFpbUtpbmQsIFRlcm1pbmFsQ29udGVudFBhcnQsIHR5cGUgVGVybWluYWxDbGFpbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgZm9ybWF0VGVybWluYWxUZXh0LCByZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudCwgdHlwZSBJVGVybWluYWxRdWVyeUZpbHRlclN0YXRlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgT3NjNjMzRXZlbnQsIE9zYzYzM0V2ZW50VHlwZSwgT3NjNjMzUGFyc2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9vc2M2MzNQYXJzZXIuanMnO1xuXG4vKipcbiAqIFRlc3RzIGZvciB0aGUgY29tbWFuZCBkZXRlY3Rpb24gaW50ZWdyYXRpb24gaW4gQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLlxuICpcbiAqIFNpbmNlIEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5jcmVhdGVUZXJtaW5hbCByZXF1aXJlcyBub2RlLXB0eSwgdGhlc2UgdGVzdHNcbiAqIGV4ZXJjaXNlIHRoZSBkYXRhLWhhbmRsaW5nIGxvZ2ljIChPU0MgcGFyc2luZyBcdTIxOTIgYWN0aW9uIGRpc3BhdGNoIFx1MjE5MiBjb250ZW50XG4gKiB0cmFja2luZykgaW4gaXNvbGF0aW9uIGJ5IHNpbXVsYXRpbmcgdGhlIGludGVybmFsIGZsb3cuXG4gKi9cblxuLy8gXHUyNTAwXHUyNTAwIEhlbHBlcnMgdG8gc2ltdWxhdGUgdGhlIHRlcm1pbmFsIG1hbmFnZXIncyBkYXRhIHBpcGVsaW5lIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG4vKiogTWluaW1hbCBjb21tYW5kIHRyYWNrZXIgbWlycm9yaW5nIEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcidzIElDb21tYW5kVHJhY2tlci4gKi9cbmludGVyZmFjZSBJVGVzdENvbW1hbmRUcmFja2VyIHtcblx0cmVhZG9ubHkgcGFyc2VyOiBPc2M2MzNQYXJzZXI7XG5cdHJlYWRvbmx5IG5vbmNlOiBzdHJpbmc7XG5cdGNvbW1hbmRDb3VudGVyOiBudW1iZXI7XG5cdGRldGVjdGlvbkF2YWlsYWJsZUVtaXR0ZWQ6IGJvb2xlYW47XG5cdHBlbmRpbmdDb21tYW5kTGluZT86IHN0cmluZztcblx0YWN0aXZlQ29tbWFuZElkPzogc3RyaW5nO1xuXHRhY3RpdmVDb21tYW5kVGltZXN0YW1wPzogbnVtYmVyO1xufVxuXG4vKipcbiAqIFNpbXBsaWZpZWQgdmVyc2lvbiBvZiBBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIncyBkYXRhIGhhbmRsaW5nIHBpcGVsaW5lXG4gKiB0aGF0IGNhbiBiZSB0ZXN0ZWQgd2l0aG91dCBub2RlLXB0eSBvciBhIHJlYWwgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLlxuICovXG5jbGFzcyBUZXN0VGVybWluYWxEYXRhSGFuZGxlciB7XG5cdHJlYWRvbmx5IGRpc3BhdGNoZWQ6IFN0YXRlQWN0aW9uW10gPSBbXTtcblx0Y29udGVudDogVGVybWluYWxDb250ZW50UGFydFtdID0gW107XG5cdGN3ZCA9ICcvaG9tZS91c2VyJztcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxRdWVyeUZpbHRlclN0YXRlOiBJVGVybWluYWxRdWVyeUZpbHRlclN0YXRlID0geyBwZW5kaW5nRGF0YTogJycgfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB1cmk6IHN0cmluZyxcblx0XHRyZWFkb25seSB0cmFja2VyOiBJVGVzdENvbW1hbmRUcmFja2VyLFxuXHQpIHsgfVxuXG5cdC8qKiBTaW11bGF0ZXMgQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLl9oYW5kbGVQdHlEYXRhICovXG5cdGhhbmRsZVB0eURhdGEocmF3RGF0YTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQgY2xlYW5lZEZvckNsaWVudCA9ICcnO1xuXG5cdFx0Ly8gRGF0YSBpcyBkaXNwYXRjaGVkIGluIHN0cmVhbSBvcmRlciByZWxhdGl2ZSB0byBjb21tYW5kIGV2ZW50czogZmx1c2hcblx0XHQvLyBwZW5kaW5nIGRhdGEgYmVmb3JlIGhhbmRsaW5nIGVhY2ggZXZlbnQgc28gc3Vic2NyaWJlcnMgb2JzZXJ2ZVxuXHRcdC8vIENvbW1hbmRFeGVjdXRlZCAtPiBkYXRhIC0+IENvbW1hbmRGaW5pc2hlZCBleGFjdGx5IGxpa2UgdGhlIHJhd1xuXHRcdC8vIHN0cmVhbSBcdTIwMTQgc2VlIF9oYW5kbGVQdHlEYXRhLlxuXHRcdGxldCBwZW5kaW5nQ2xpZW50RGF0YSA9ICcnO1xuXHRcdGNvbnN0IGZsdXNoQ2xpZW50RGF0YSA9ICgpOiB2b2lkID0+IHtcblx0XHRcdGlmIChwZW5kaW5nQ2xpZW50RGF0YS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kaXNwYXRjaGVkLnB1c2goe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSxcblx0XHRcdFx0ZGF0YTogcGVuZGluZ0NsaWVudERhdGEsXG5cdFx0XHR9KTtcblx0XHRcdGNsZWFuZWRGb3JDbGllbnQgKz0gcGVuZGluZ0NsaWVudERhdGE7XG5cdFx0XHRwZW5kaW5nQ2xpZW50RGF0YSA9ICcnO1xuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IHNlZ21lbnQgb2YgdGhpcy50cmFja2VyLnBhcnNlci5wYXJzZVNlZ21lbnRzKHJhd0RhdGEpKSB7XG5cdFx0XHRpZiAoc2VnbWVudC5raW5kID09PSAnZXZlbnQnKSB7XG5cdFx0XHRcdGZsdXNoQ2xpZW50RGF0YSgpO1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVPc2M2MzNFdmVudChzZWdtZW50LmV2ZW50KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsZWFuZWREYXRhID0gcmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoc2VnbWVudC5kYXRhLCB0aGlzLl90ZXJtaW5hbFF1ZXJ5RmlsdGVyU3RhdGUpO1xuXHRcdFx0aWYgKGNsZWFuZWREYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fYXBwZW5kVG9Db250ZW50KGNsZWFuZWREYXRhKTtcblx0XHRcdFx0cGVuZGluZ0NsaWVudERhdGEgKz0gY2xlYW5lZERhdGE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zmx1c2hDbGllbnREYXRhKCk7XG5cblx0XHRyZXR1cm4gY2xlYW5lZEZvckNsaWVudDtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU9zYzYzM0V2ZW50KGV2ZW50OiBPc2M2MzNFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmFja2VyLmRldGVjdGlvbkF2YWlsYWJsZUVtaXR0ZWQpIHtcblx0XHRcdHRoaXMudHJhY2tlci5kZXRlY3Rpb25BdmFpbGFibGVFbWl0dGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuZGlzcGF0Y2hlZC5wdXNoKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmREZXRlY3Rpb25BdmFpbGFibGUsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKGV2ZW50LnR5cGUpIHtcblx0XHRcdGNhc2UgT3NjNjMzRXZlbnRUeXBlLkNvbW1hbmRMaW5lOiB7XG5cdFx0XHRcdGlmIChldmVudC5ub25jZSA9PT0gdGhpcy50cmFja2VyLm5vbmNlKSB7XG5cdFx0XHRcdFx0dGhpcy50cmFja2VyLnBlbmRpbmdDb21tYW5kTGluZSA9IGV2ZW50LmNvbW1hbmRMaW5lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBPc2M2MzNFdmVudFR5cGUuQ29tbWFuZEV4ZWN1dGVkOiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGBjbWQtJHsrK3RoaXMudHJhY2tlci5jb21tYW5kQ291bnRlcn1gO1xuXHRcdFx0XHRjb25zdCBjb21tYW5kTGluZSA9IHRoaXMudHJhY2tlci5wZW5kaW5nQ29tbWFuZExpbmUgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IERhdGUubm93KCk7XG5cdFx0XHRcdHRoaXMudHJhY2tlci5wZW5kaW5nQ29tbWFuZExpbmUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMudHJhY2tlci5hY3RpdmVDb21tYW5kSWQgPSBjb21tYW5kSWQ7XG5cdFx0XHRcdHRoaXMudHJhY2tlci5hY3RpdmVDb21tYW5kVGltZXN0YW1wID0gdGltZXN0YW1wO1xuXG5cdFx0XHRcdHRoaXMuY29udGVudC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZElkLFxuXHRcdFx0XHRcdGNvbW1hbmRMaW5lLFxuXHRcdFx0XHRcdG91dHB1dDogJycsXG5cdFx0XHRcdFx0dGltZXN0YW1wLFxuXHRcdFx0XHRcdGlzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLmRpc3BhdGNoZWQucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRFeGVjdXRlZCxcblx0XHRcdFx0XHRjb21tYW5kSWQsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmUsXG5cdFx0XHRcdFx0dGltZXN0YW1wLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE9zYzYzM0V2ZW50VHlwZS5Db21tYW5kRmluaXNoZWQ6IHtcblx0XHRcdFx0Y29uc3QgZmluaXNoZWRDb21tYW5kSWQgPSB0aGlzLnRyYWNrZXIuYWN0aXZlQ29tbWFuZElkO1xuXHRcdFx0XHRpZiAoIWZpbmlzaGVkQ29tbWFuZElkKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZHVyYXRpb25NcyA9IHRoaXMudHJhY2tlci5hY3RpdmVDb21tYW5kVGltZXN0YW1wICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IERhdGUubm93KCkgLSB0aGlzLnRyYWNrZXIuYWN0aXZlQ29tbWFuZFRpbWVzdGFtcFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLmNvbnRlbnQpIHtcblx0XHRcdFx0XHRpZiAocGFydC50eXBlID09PSAnY29tbWFuZCcgJiYgcGFydC5jb21tYW5kSWQgPT09IGZpbmlzaGVkQ29tbWFuZElkKSB7XG5cdFx0XHRcdFx0XHRwYXJ0LmlzQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cGFydC5leGl0Q29kZSA9IGV2ZW50LmV4aXRDb2RlO1xuXHRcdFx0XHRcdFx0cGFydC5kdXJhdGlvbk1zID0gZHVyYXRpb25Ncztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudHJhY2tlci5hY3RpdmVDb21tYW5kSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMudHJhY2tlci5hY3RpdmVDb21tYW5kVGltZXN0YW1wID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRcdHRoaXMuZGlzcGF0Y2hlZC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEZpbmlzaGVkLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogZmluaXNoZWRDb21tYW5kSWQsXG5cdFx0XHRcdFx0ZXhpdENvZGU6IGV2ZW50LmV4aXRDb2RlLFxuXHRcdFx0XHRcdGR1cmF0aW9uTXMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgT3NjNjMzRXZlbnRUeXBlLlByb3BlcnR5OiB7XG5cdFx0XHRcdGlmIChldmVudC5rZXkgPT09ICdDd2QnKSB7XG5cdFx0XHRcdFx0dGhpcy5jd2QgPSBldmVudC52YWx1ZTtcblx0XHRcdFx0XHR0aGlzLmRpc3BhdGNoZWQucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ3dkQ2hhbmdlZCxcblx0XHRcdFx0XHRcdGN3ZDogZXZlbnQudmFsdWUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwZW5kVG9Db250ZW50KGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHRhaWwgPSB0aGlzLmNvbnRlbnQubGVuZ3RoID4gMCA/IHRoaXMuY29udGVudFt0aGlzLmNvbnRlbnQubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRhaWwgJiYgdGFpbC50eXBlID09PSAnY29tbWFuZCcgJiYgIXRhaWwuaXNDb21wbGV0ZSkge1xuXHRcdFx0dGFpbC5vdXRwdXQgKz0gZGF0YTtcblx0XHR9IGVsc2UgaWYgKHRhaWwgJiYgdGFpbC50eXBlID09PSAndW5jbGFzc2lmaWVkJykge1xuXHRcdFx0dGFpbC52YWx1ZSArPSBkYXRhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbnRlbnQucHVzaCh7IHR5cGU6ICd1bmNsYXNzaWZpZWQnLCB2YWx1ZTogZGF0YSB9KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGVzdFB0eSBpbXBsZW1lbnRzIElQdHkge1xuXHRyZWFkb25seSBwaWQgPSAxO1xuXHRjb2xzID0gODA7XG5cdHJvd3MgPSAyNDtcblx0cHJvY2VzcyA9ICd0ZXN0LXNoZWxsJztcblx0aGFuZGxlRmxvd0NvbnRyb2wgPSBmYWxzZTtcblx0cmVhZG9ubHkgd3JpdGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSBkYXRhTGlzdGVuZXJSZWdpc3RlcmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGF0YSA9IG5ldyBFbWl0dGVyPHN0cmluZz4oKTtcblx0cmVhZG9ubHkgb25EYXRhOiBJUHR5WydvbkRhdGEnXSA9IGxpc3RlbmVyID0+IHtcblx0XHR0aGlzLmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQuY29tcGxldGUoKTtcblx0XHRyZXR1cm4gdGhpcy5fb25EYXRhLmV2ZW50KGRhdGEgPT4gbGlzdGVuZXIoZGF0YSkpO1xuXHR9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRXhpdCA9IG5ldyBFbWl0dGVyPHsgZXhpdENvZGU6IG51bWJlcjsgc2lnbmFsPzogbnVtYmVyIH0+KCk7XG5cdHJlYWRvbmx5IG9uRXhpdDogSVB0eVsnb25FeGl0J10gPSBsaXN0ZW5lciA9PiB0aGlzLl9vbkV4aXQuZXZlbnQoZGF0YSA9PiBsaXN0ZW5lcihkYXRhKSk7XG5cblx0ZmlyZURhdGEoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EYXRhLmZpcmUoZGF0YSk7XG5cdH1cblxuXHRyZXNpemUoY29sdW1uczogbnVtYmVyLCByb3dzOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbHMgPSBjb2x1bW5zO1xuXHRcdHRoaXMucm93cyA9IHJvd3M7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHsgfVxuXG5cdHdyaXRlKGRhdGE6IHN0cmluZyB8IEJ1ZmZlcik6IHZvaWQge1xuXHRcdHRoaXMud3JpdGVzLnB1c2godHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnID8gZGF0YSA6IGRhdGEudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRraWxsKCk6IHZvaWQgeyB9XG5cdHBhdXNlKCk6IHZvaWQgeyB9XG5cdHJlc3VtZSgpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIGV4dGVuZHMgQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIHtcblx0c3Bhd25PcHRpb25zOiBJUHR5Rm9ya09wdGlvbnMgfCBJV2luZG93c1B0eUZvcmtPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdGxvZ1NlcnZpY2U6IE51bGxMb2dTZXJ2aWNlLFxuXHRcdHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHR5OiBUZXN0UHR5LFxuXHQpIHtcblx0XHRzdXBlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX3NwYXduUHR5KF9maWxlOiBzdHJpbmcsIF9hcmdzOiBzdHJpbmdbXSwgb3B0aW9uczogSVB0eUZvcmtPcHRpb25zIHwgSVdpbmRvd3NQdHlGb3JrT3B0aW9ucyk6IFByb21pc2U8SVB0eT4ge1xuXHRcdHRoaXMuc3Bhd25PcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl9wdHkuY29scyA9IG9wdGlvbnMuY29scyA/PyB0aGlzLl9wdHkuY29scztcblx0XHR0aGlzLl9wdHkucm93cyA9IG9wdGlvbnMucm93cyA/PyB0aGlzLl9wdHkucm93cztcblx0XHRyZXR1cm4gdGhpcy5fcHR5O1xuXHR9XG59XG5cbmZ1bmN0aW9uIG9zYzYzMyhwYXlsb2FkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYFxceDFiXTYzMzske3BheWxvYWR9XFx4MDdgO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVIYW5kbGVyKG5vbmNlID0gJ3Rlc3Qtbm9uY2UnKTogVGVzdFRlcm1pbmFsRGF0YUhhbmRsZXIge1xuXHRyZXR1cm4gbmV3IFRlc3RUZXJtaW5hbERhdGFIYW5kbGVyKCd0ZXJtaW5hbDovL3Rlc3QnLCB7XG5cdFx0cGFyc2VyOiBuZXcgT3NjNjMzUGFyc2VyKCksXG5cdFx0bm9uY2UsXG5cdFx0Y29tbWFuZENvdW50ZXI6IDAsXG5cdFx0ZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZDogZmFsc2UsXG5cdH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yV3JpdGVzKHB0eTogVGVzdFB0eSwgY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRpZiAocHR5LndyaXRlcy5sZW5ndGggPj0gY291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdFRlcm1pbmFsTWFuYWdlciBcdTIwMTMgY29tbWFuZCBkZXRlY3Rpb24gaW50ZWdyYXRpb24nLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmb3JtYXRzIGNvbW1hbmQgaW5wdXQgd2l0aCB0ZXJtaW5hbCBlbnRlciBzZW1hbnRpY3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRlcm1pbmFsVGV4dCgnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgeyBzaG91bGRFeGVjdXRlOiB0cnVlIH0pLCAnZWNobyBmaXJzdFxccmVjaG8gc2Vjb25kXFxyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRlcm1pbmFsVGV4dCgnZWNobyBmaXJzdFxcclxcbmVjaG8gc2Vjb25kJywgeyBzaG91bGRFeGVjdXRlOiB0cnVlIH0pLCAnZWNobyBmaXJzdFxccmVjaG8gc2Vjb25kXFxyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRlcm1pbmFsVGV4dCgnZWNobyBmaXJzdFxccicsIHsgc2hvdWxkRXhlY3V0ZTogdHJ1ZSB9KSwgJ2VjaG8gZmlyc3RcXHInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0VGVybWluYWxUZXh0KCdhbnN3ZXJcXG4nLCB7IHNob3VsZEV4ZWN1dGU6IGZhbHNlIH0pLCAnYW5zd2VyXFxyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFRlcm1pbmFsVGV4dCgnL3RtcC9mb29cXG5wd2QnLCB7IHNob3VsZEV4ZWN1dGU6IHRydWUgfSksICcvdG1wL2Zvb1xccnB3ZFxccicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRUZXJtaW5hbFRleHQoJ2VjaG8gZmlyc3RcXG5lY2hvIHNlY29uZCcsIHsgc2hvdWxkRXhlY3V0ZTogdHJ1ZSwgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU6IHRydWUgfSksICdcXHgxYlsyMDB+ZWNobyBmaXJzdFxccmVjaG8gc2Vjb25kXFx4MWJbMjAxflxccicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRUZXJtaW5hbFRleHQoJ2Fuc3dlclxcbicsIHsgc2hvdWxkRXhlY3V0ZTogZmFsc2UsIGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlOiB0cnVlIH0pLCAnXFx4MWJbMjAwfmFuc3dlclxcclxceDFiWzIwMX4nKTtcblx0fSk7XG5cblx0dGVzdCgnd3JpdGVzIGZvcm1hdHRlZCBjb21tYW5kIGlucHV0IHRvIHRoZSBQVFknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBhcHBsaWNhdGlvbk5hbWU6ICd2c2NvZGUnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXHRcdGNvbnN0IHB0eSA9IG5ldyBUZXN0UHR5KCk7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHR5KSk7XG5cblx0XHRjb25zdCBjcmVhdGVUZXJtaW5hbCA9IG1hbmFnZXIuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y2hhbm5lbDogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3Rlc3QvY29tbWFuZC1pbnB1dCcsXG5cdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRjd2Q6IHByb2Nlc3MuY3dkKCksXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDI0LFxuXHRcdH0sIHsgc2hlbGw6ICcvYmluL2Jhc2gnIH0pO1xuXG5cdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRwdHkuZmlyZURhdGEoJ3Byb21wdCcpO1xuXHRcdGF3YWl0IGNyZWF0ZVRlcm1pbmFsO1xuXG5cdFx0YXdhaXQgbWFuYWdlci5zZW5kVGV4dCgnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9jb21tYW5kLWlucHV0JywgJ2VjaG8gZmlyc3RcXG5lY2hvIHNlY29uZCcsIHsgc2hvdWxkRXhlY3V0ZTogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHR5LndyaXRlcywgWydlY2hvIGZpcnN0XFxyZWNobyBzZWNvbmRcXHInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlcyBicmFja2V0ZWQgcGFzdGUgY29tbWFuZCBpbnB1dCB3aGVuIGVuYWJsZWQgYnkgdGhlIHRlcm1pbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcblx0XHRjb25zdCBwdHkgPSBuZXcgVGVzdFB0eSgpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHB0eSkpO1xuXG5cdFx0Y29uc3QgY3JlYXRlVGVybWluYWwgPSBtYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNoYW5uZWw6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2JyYWNrZXRlZC1wYXN0ZScsXG5cdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRjd2Q6IHByb2Nlc3MuY3dkKCksXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDI0LFxuXHRcdH0sIHsgc2hlbGw6ICcvYmluL2Jhc2gnIH0pO1xuXG5cdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRwdHkuZmlyZURhdGEoJ1xceDFiWz8yMDA0aCcpO1xuXHRcdGF3YWl0IGNyZWF0ZVRlcm1pbmFsO1xuXG5cdFx0YXdhaXQgbWFuYWdlci5zZW5kVGV4dCgnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9icmFja2V0ZWQtcGFzdGUnLCAnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgeyBzaG91bGRFeGVjdXRlOiB0cnVlLCBicmFja2V0ZWRQYXN0ZU1vZGU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHB0eS53cml0ZXMsIFsnXFx4MWJbMjAwfmVjaG8gZmlyc3RcXHJlY2hvIHNlY29uZFxceDFiWzIwMX5cXHInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHdyaXRlIGJyYWNrZXRlZCBwYXN0ZSBjb21tYW5kIGlucHV0IHdoZW4gZGlzYWJsZWQgYnkgdGhlIHRlcm1pbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcblx0XHRjb25zdCBwdHkgPSBuZXcgVGVzdFB0eSgpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHB0eSkpO1xuXG5cdFx0Y29uc3QgY3JlYXRlVGVybWluYWwgPSBtYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNoYW5uZWw6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2JyYWNrZXRlZC1wYXN0ZS1kaXNhYmxlZCcsXG5cdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRjd2Q6IHByb2Nlc3MuY3dkKCksXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDI0LFxuXHRcdH0sIHsgc2hlbGw6ICcvYmluL2Jhc2gnIH0pO1xuXG5cdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRwdHkuZmlyZURhdGEoJ3Byb21wdCcpO1xuXHRcdGF3YWl0IGNyZWF0ZVRlcm1pbmFsO1xuXG5cdFx0YXdhaXQgbWFuYWdlci5zZW5kVGV4dCgnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9icmFja2V0ZWQtcGFzdGUtZGlzYWJsZWQnLCAnZWNobyBmaXJzdFxcbmVjaG8gc2Vjb25kJywgeyBzaG91bGRFeGVjdXRlOiB0cnVlLCBicmFja2V0ZWRQYXN0ZU1vZGU6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHB0eS53cml0ZXMsIFsnZWNobyBmaXJzdFxccmVjaG8gc2Vjb25kXFxyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRzIHpzaCBhZ2VudCBmaXh1cHMgb25seSBmb3Igc2Vzc2lvbiB6c2ggdGVybWluYWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVRlc3RUZXJtaW5hbChcblx0XHRcdGlkOiBzdHJpbmcsXG5cdFx0XHRzaGVsbDogc3RyaW5nLFxuXHRcdFx0Y2xhaW06IFRlcm1pbmFsQ2xhaW0sXG5cdFx0XHRvcHRpb25zPzogeyBwcmV2ZW50U2hlbGxIaXN0b3J5PzogYm9vbGVhbjsgbm9uSW50ZXJhY3RpdmU/OiBib29sZWFuIH1cblx0XHQpOiBQcm9taXNlPFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXI+IHtcblx0XHRcdGNvbnN0IHB0eSA9IG5ldyBUZXN0UHR5KCk7XG5cdFx0XHRjb25zdCBtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwdHkpKTtcblx0XHRcdGNvbnN0IGNyZWF0ZVRlcm1pbmFsID0gbWFuYWdlci5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdGNoYW5uZWw6IGBhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0LyR7aWR9YCxcblx0XHRcdFx0Y2xhaW0sXG5cdFx0XHRcdGN3ZDogcHJvY2Vzcy5jd2QoKSxcblx0XHRcdFx0Y29sczogODAsXG5cdFx0XHRcdHJvd3M6IDI0LFxuXHRcdFx0fSwgeyBzaGVsbCwgLi4ub3B0aW9ucyB9KTtcblx0XHRcdGF3YWl0IHB0eS5kYXRhTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0XHRwdHkuZmlyZURhdGEoJ3Byb21wdCcpO1xuXHRcdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cdFx0XHRyZXR1cm4gbWFuYWdlcjtcblx0XHR9XG5cblx0XHRjb25zdCB6c2hTZXNzaW9uTWFuYWdlciA9IGF3YWl0IGNyZWF0ZVRlc3RUZXJtaW5hbCgnenNoLXNlc3Npb24tZml4dXBzJywgJy9iaW4venNoJywge1xuXHRcdFx0a2luZDogVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbixcblx0XHRcdHNlc3Npb246ICdjb3BpbG90Oi9zZXNzaW9uLTEnLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0b29sLTEnLFxuXHRcdH0sIHsgcHJldmVudFNoZWxsSGlzdG9yeTogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoenNoU2Vzc2lvbk1hbmFnZXIuc3Bhd25PcHRpb25zPy5lbnY/LlZTQ09ERV9BR0VOVF9aU0hfRklYVVBTLCAnMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6c2hTZXNzaW9uTWFuYWdlci5zcGF3bk9wdGlvbnM/LmVudj8uVlNDT0RFX1BSRVZFTlRfU0hFTExfSElTVE9SWSwgJzEnKTtcblxuXHRcdGNvbnN0IHpzaENsaWVudE1hbmFnZXIgPSBhd2FpdCBjcmVhdGVUZXN0VGVybWluYWwoJ3pzaC1jbGllbnQnLCAnL2Jpbi96c2gnLCB7XG5cdFx0XHRraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsXG5cdFx0XHRjbGllbnRJZDogJ3Rlc3QtY2xpZW50Jyxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoenNoQ2xpZW50TWFuYWdlci5zcGF3bk9wdGlvbnM/LmVudj8uVlNDT0RFX0FHRU5UX1pTSF9GSVhVUFMsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBiYXNoU2Vzc2lvbk1hbmFnZXIgPSBhd2FpdCBjcmVhdGVUZXN0VGVybWluYWwoJ2Jhc2gtc2Vzc2lvbi1oaXN0b3J5JywgJy9iaW4vYmFzaCcsIHtcblx0XHRcdGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLlNlc3Npb24sXG5cdFx0XHRzZXNzaW9uOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHR0b29sQ2FsbElkOiAndG9vbC0yJyxcblx0XHR9LCB7IHByZXZlbnRTaGVsbEhpc3Rvcnk6IHRydWUsIG5vbkludGVyYWN0aXZlOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNoU2Vzc2lvbk1hbmFnZXIuc3Bhd25PcHRpb25zPy5lbnY/LlZTQ09ERV9BR0VOVF9aU0hfRklYVVBTLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiYXNoU2Vzc2lvbk1hbmFnZXIuc3Bhd25PcHRpb25zPy5lbnY/LlZTQ09ERV9QUkVWRU5UX1NIRUxMX0hJU1RPUlksICcxJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlcyBoZWFkbGVzcyBEU1IgcmVzcG9uc2VzIGJhY2sgdG8gdGhlIFBUWScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGFwcGxpY2F0aW9uTmFtZTogJ3ZzY29kZScgfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgcHR5ID0gbmV3IFRlc3RQdHkoKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwdHkpKTtcblxuXHRcdGNvbnN0IGNyZWF0ZVRlcm1pbmFsID0gbWFuYWdlci5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjaGFubmVsOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9kc3InLFxuXHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0Y3dkOiBwcm9jZXNzLmN3ZCgpLFxuXHRcdFx0Y29sczogODAsXG5cdFx0XHRyb3dzOiAyNCxcblx0XHR9LCB7IHNoZWxsOiAnL2Jpbi9iYXNoJyB9KTtcblxuXHRcdGF3YWl0IHB0eS5kYXRhTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0cHR5LmZpcmVEYXRhKCdhYmNcXHgxYls2bicpO1xuXHRcdGF3YWl0IGNyZWF0ZVRlcm1pbmFsO1xuXHRcdGF3YWl0IHdhaXRGb3JXcml0ZXMocHR5LCAxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHR5LndyaXRlcywgWydcXHgxYlsxOzRSJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzd2FsbG93cyBPU0MgY29sb3IgcXVlcmllcyB3aGlsZSBwcmVzZXJ2aW5nIGhlYWRsZXNzIENQUiByZXNwb25zZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBhcHBsaWNhdGlvbk5hbWU6ICd2c2NvZGUnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXHRcdGNvbnN0IHB0eSA9IG5ldyBUZXN0UHR5KCk7XG5cdFx0Y29uc3QgbWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHR5KSk7XG5cdFx0Y29uc3QgdXJpID0gJ2FnZW50aG9zdC10ZXJtaW5hbDovL3Rlc3QvY29sb3ItcXVlcnknO1xuXHRcdGNvbnN0IGNsaWVudERhdGE6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBjcmVhdGVUZXJtaW5hbCA9IG1hbmFnZXIuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y2hhbm5lbDogdXJpLFxuXHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0Y3dkOiBwcm9jZXNzLmN3ZCgpLFxuXHRcdFx0Y29sczogODAsXG5cdFx0XHRyb3dzOiAyNCxcblx0XHR9LCB7IHNoZWxsOiAnL2Jpbi9iYXNoJyB9KTtcblxuXHRcdGF3YWl0IHB0eS5kYXRhTGlzdGVuZXJSZWdpc3RlcmVkLnA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EYXRhKHVyaSwgZGF0YSA9PiBjbGllbnREYXRhLnB1c2goZGF0YSkpKTtcblx0XHRwdHkuZmlyZURhdGEoJ2JlZm9yZVxceDFiXTEwOz9cXHgxYlxcXFxcXHgxYls2bm1pZFxceDFiXTExOz9cXHgwN1xceDFiWzZuYWZ0ZXInKTtcblx0XHRhd2FpdCBjcmVhdGVUZXJtaW5hbDtcblx0XHRhd2FpdCB3YWl0Rm9yV3JpdGVzKHB0eSwgMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNsaWVudERhdGEsXG5cdFx0XHRwdHlXcml0ZXM6IHB0eS53cml0ZXMsXG5cdFx0fSwge1xuXHRcdFx0Y2xpZW50RGF0YTogWydiZWZvcmVtaWRhZnRlciddLFxuXHRcdFx0cHR5V3JpdGVzOiBbJ1xceDFiWzE7N1InLCAnXFx4MWJbMTsxMFInXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgYWx0LWJ1ZmZlciBwcm9taXNlIGZyb20gaGVhZGxlc3MgdGVybWluYWwgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGFwcGxpY2F0aW9uTmFtZTogJ3ZzY29kZScgfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgcHR5ID0gbmV3IFRlc3RQdHkoKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwdHkpKTtcblx0XHRjb25zdCB1cmkgPSAnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9hbHQtYnVmZmVyJztcblxuXHRcdGNvbnN0IGNyZWF0ZVRlcm1pbmFsID0gbWFuYWdlci5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRjaGFubmVsOiB1cmksXG5cdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiAndGVzdC1jbGllbnQnIH0sXG5cdFx0XHRjd2Q6IHByb2Nlc3MuY3dkKCksXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDI0LFxuXHRcdH0sIHsgc2hlbGw6ICcvYmluL2Jhc2gnIH0pO1xuXG5cdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRwdHkuZmlyZURhdGEoJ3Byb21wdCcpO1xuXHRcdGF3YWl0IGNyZWF0ZVRlcm1pbmFsO1xuXG5cdFx0Y29uc3QgYWx0QnVmZmVyU3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBhbHRCdWZmZXJQcm9taXNlID0gbWFuYWdlci5jcmVhdGVBbHRCdWZmZXJQcm9taXNlKHVyaSwgYWx0QnVmZmVyU3RvcmUpO1xuXG5cdFx0cHR5LmZpcmVEYXRhKCdcXHgxYls/MTA0OWgnKTtcblxuXHRcdGF3YWl0IGFsdEJ1ZmZlclByb21pc2U7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VkIGFsdC1idWZmZXIgcHJvbWlzZSBsaXN0ZW5lciBkb2VzIG5vdCByZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcblx0XHRjb25zdCBwdHkgPSBuZXcgVGVzdFB0eSgpO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHB0eSkpO1xuXHRcdGNvbnN0IHVyaSA9ICdhZ2VudGhvc3QtdGVybWluYWw6Ly90ZXN0L2FsdC1idWZmZXItZGlzcG9zZWQnO1xuXG5cdFx0Y29uc3QgY3JlYXRlVGVybWluYWwgPSBtYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNoYW5uZWw6IHVyaSxcblx0XHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQ6ICd0ZXN0LWNsaWVudCcgfSxcblx0XHRcdGN3ZDogcHJvY2Vzcy5jd2QoKSxcblx0XHRcdGNvbHM6IDgwLFxuXHRcdFx0cm93czogMjQsXG5cdFx0fSwgeyBzaGVsbDogJy9iaW4vYmFzaCcgfSk7XG5cblx0XHRhd2FpdCBwdHkuZGF0YUxpc3RlbmVyUmVnaXN0ZXJlZC5wO1xuXHRcdHB0eS5maXJlRGF0YSgncHJvbXB0Jyk7XG5cdFx0YXdhaXQgY3JlYXRlVGVybWluYWw7XG5cblx0XHRjb25zdCBhbHRCdWZmZXJTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBhbHRCdWZmZXJQcm9taXNlID0gbWFuYWdlci5jcmVhdGVBbHRCdWZmZXJQcm9taXNlKHVyaSwgYWx0QnVmZmVyU3RvcmUpO1xuXHRcdGxldCBkaWRFbnRlckFsdEJ1ZmZlciA9IGZhbHNlO1xuXHRcdHZvaWQgYWx0QnVmZmVyUHJvbWlzZS50aGVuKCgpID0+IGRpZEVudGVyQWx0QnVmZmVyID0gdHJ1ZSk7XG5cdFx0YWx0QnVmZmVyU3RvcmUuZGlzcG9zZSgpO1xuXHRcdHB0eS5maXJlRGF0YSgnXFx4MWJbPzEwNDloJyk7XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkRW50ZXJBbHRCdWZmZXIsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50LXN1cHByZXNzZWQgdGVybWluYWwgcXVlcmllcyBhcmUgc3RyaXBwZWQgZnJvbSBjbGllbnQtZmFjaW5nIGRhdGEnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gZmlsdGVyKGRhdGE6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gcmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoZGF0YSwgeyBwZW5kaW5nRGF0YTogJycgfSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignYmVmb3JlIFxceDFiWzZuIGFmdGVyJyksICdiZWZvcmUgIGFmdGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignYmVmb3JlIFxceDFiWz82biBhZnRlcicpLCAnYmVmb3JlICBhZnRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIoJ2JlZm9yZSBcXHgxYl0xMDs/XFx4MWJcXFxcIGFmdGVyJyksICdiZWZvcmUgIGFmdGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignYmVmb3JlIFxceDFiXTEwOz9cXHgwNyBhZnRlcicpLCAnYmVmb3JlICBhZnRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIoJ2JlZm9yZSBcXHgxYl0xMTs/XFx4MWJcXFxcIGFmdGVyJyksICdiZWZvcmUgIGFmdGVyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignYmVmb3JlIFxceDFiXTExOz9cXHgwNyBhZnRlcicpLCAnYmVmb3JlICBhZnRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIoJ1xceDFiWzVuXFx4MWJbY1xceDFiWzBjXFx4MWJbPmNcXHgxYls+MGMnKSwgJ1xceDFiWzVuXFx4MWJbY1xceDFiWzBjXFx4MWJbPmNcXHgxYls+MGMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsdGVyKCdcXHgxYl0xMDsjZmZmZmZmXFx4MWJcXFxcXFx4MWJdMTE7cmdiOjAwMDAvMDAwMC8wMDAwXFx4MDcnKSwgJ1xceDFiXTEwOyNmZmZmZmZcXHgxYlxcXFxcXHgxYl0xMTtyZ2I6MDAwMC8wMDAwLzAwMDBcXHgwNycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWx0ZXIoJ1xceDFiXTEwOz87I2ZmZmZmZlxceDFiXFxcXFxceDFiXTEyOz9cXHgxYlxcXFxcXHgxYl00OzA7P1xceDFiXFxcXCcpLCAnXFx4MWJdMTA7PzsjZmZmZmZmXFx4MWJcXFxcXFx4MWJdMTI7P1xceDFiXFxcXFxceDFiXTQ7MDs/XFx4MWJcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbHRlcignbm9ybWFsIG91dHB1dFxcclxcbicpLCAnbm9ybWFsIG91dHB1dFxcclxcbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQtc3VwcHJlc3NlZCB0ZXJtaW5hbCBxdWVyaWVzIGFyZSBzdHJpcHBlZCBhY3Jvc3MgZGF0YSBjaHVua3MnLCAoKSA9PiB7XG5cdFx0bGV0IHN0YXRlOiBJVGVybWluYWxRdWVyeUZpbHRlclN0YXRlID0geyBwZW5kaW5nRGF0YTogJycgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoJ2JlZm9yZSBcXHgxYlsnLCBzdGF0ZSksICdiZWZvcmUgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCc2biBhZnRlcicsIHN0YXRlKSwgJyBhZnRlcicpO1xuXG5cdFx0c3RhdGUgPSB7IHBlbmRpbmdEYXRhOiAnJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudCgnYmVmb3JlIFxceDFiWz8nLCBzdGF0ZSksICdiZWZvcmUgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCc2biBhZnRlcicsIHN0YXRlKSwgJyBhZnRlcicpO1xuXG5cdFx0c3RhdGUgPSB7IHBlbmRpbmdEYXRhOiAnJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudCgnYmVmb3JlIFxceDFiWycsIHN0YXRlKSwgJ2JlZm9yZSAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlVGVybWluYWxRdWVyaWVzU3VwcHJlc3NlZEZyb21DbGllbnQoJ0sgYWZ0ZXInLCBzdGF0ZSksICdcXHgxYltLIGFmdGVyJyk7XG5cblx0XHRzdGF0ZSA9IHsgcGVuZGluZ0RhdGE6ICcnIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCdiZWZvcmUgXFx4MWJdMTA7Jywgc3RhdGUpLCAnYmVmb3JlICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudCgnP1xceDFiJywgc3RhdGUpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCdcXFxcIGFmdGVyJywgc3RhdGUpLCAnIGFmdGVyJyk7XG5cblx0XHRzdGF0ZSA9IHsgcGVuZGluZ0RhdGE6ICcnIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW92ZVRlcm1pbmFsUXVlcmllc1N1cHByZXNzZWRGcm9tQ2xpZW50KCdiZWZvcmUgXFx4MWJdMTE7Jywgc3RhdGUpLCAnYmVmb3JlICcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdmVUZXJtaW5hbFF1ZXJpZXNTdXBwcmVzc2VkRnJvbUNsaWVudCgnP1xceDA3IGFmdGVyJywgc3RhdGUpLCAnIGFmdGVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hbmFnZXIgZGF0YSBwYXRoIHN0cmlwcyBDUFIgcXVlcmllcyB3aGlsZSBwcmVzZXJ2aW5nIHN1cnJvdW5kaW5nIG91dHB1dCcsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0Y29uc3QgY2xlYW5lZCA9IGhhbmRsZXIuaGFuZGxlUHR5RGF0YShgYmVmb3JlJHtvc2M2MzMoJ0EnKX1cXHgxYls2bm1pZFxceDFiWz82bmFmdGVyYCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5lZCwgJ2JlZm9yZW1pZGFmdGVyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5kbGVyLmNvbnRlbnQsIFt7IHR5cGU6ICd1bmNsYXNzaWZpZWQnLCB2YWx1ZTogJ2JlZm9yZW1pZGFmdGVyJyB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5kbGVyLmRpc3BhdGNoZWQsIFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIGRhdGE6ICdiZWZvcmUnIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRGV0ZWN0aW9uQXZhaWxhYmxlIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxEYXRhLCBkYXRhOiAnbWlkYWZ0ZXInIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZSBpcyBkaXNwYXRjaGVkIG9uIGZpcnN0IE9TQyA2MzMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoKTtcblxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0EnKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlci5kaXNwYXRjaGVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZXIuZGlzcGF0Y2hlZFswXS50eXBlLCBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZSBpcyBkaXNwYXRjaGVkIG9ubHkgb25jZScsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnQScpKTtcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdCJykpO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0EnKSk7XG5cblx0XHRjb25zdCBkZXRlY3Rpb25BY3Rpb25zID0gaGFuZGxlci5kaXNwYXRjaGVkLmZpbHRlcihcblx0XHRcdGEgPT4gYS50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZVxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGVjdGlvbkFjdGlvbnMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZnVsbCBjb21tYW5kIGxpZmVjeWNsZSBkaXNwYXRjaGVzIGNvcnJlY3QgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0Ly8gU2hlbGwgcHJvbXB0XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnQScpfSQgJHtvc2M2MzMoJ0InKX1gKTtcblx0XHQvLyBDb21tYW5kIGVudGVyZWQsIHNoZWxsIHJlcG9ydHMgY29tbWFuZCBsaW5lIGFuZCBleGVjdXRlc1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShgJHtvc2M2MzMoJ0U7ZWNob1xcXFx4MjBoZWxsbzt0ZXN0LW5vbmNlJyl9JHtvc2M2MzMoJ0MnKX1gKTtcblx0XHQvLyBDb21tYW5kIG91dHB1dFxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YSgnaGVsbG9cXHJcXG4nKTtcblx0XHQvLyBDb21tYW5kIGZpbmlzaGVzXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnRDswJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGhhbmRsZXIuZGlzcGF0Y2hlZDtcblx0XHQvLyBFeHBlY3Q6IERldGVjdGlvbkF2YWlsYWJsZSwgQ29tbWFuZEV4ZWN1dGVkLCBDb21tYW5kRmluaXNoZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50eXBlLCBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZSk7XG5cblx0XHRjb25zdCBleGVjdXRlZCA9IGFjdGlvbnMuZmluZChhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRFeGVjdXRlZCk7XG5cdFx0YXNzZXJ0Lm9rKGV4ZWN1dGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZWQuY29tbWFuZElkLCAnY21kLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZWQuY29tbWFuZExpbmUsICdlY2hvIGhlbGxvJyk7XG5cblx0XHRjb25zdCBmaW5pc2hlZCA9IGFjdGlvbnMuZmluZChhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRGaW5pc2hlZCk7XG5cdFx0YXNzZXJ0Lm9rKGZpbmlzaGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluaXNoZWQuY29tbWFuZElkLCAnY21kLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluaXNoZWQuZXhpdENvZGUsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250ZW50IHBhcnRzIGFyZSBzdHJ1Y3R1cmVkIGNvcnJlY3RseSBhZnRlciBjb21tYW5kIGxpZmVjeWNsZScsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0Ly8gUHJvbXB0IG91dHB1dCAoYmVmb3JlIGNvbW1hbmQpXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnQScpfXVzZXJAaG9zdDp+ICQgJHtvc2M2MzMoJ0InKX1gKTtcblx0XHQvLyBDb21tYW5kIGxpbmUgKyBleGVjdXRlXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKGAke29zYzYzMygnRTtsczt0ZXN0LW5vbmNlJyl9JHtvc2M2MzMoJ0MnKX1gKTtcblx0XHQvLyBDb21tYW5kIG91dHB1dFxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YSgnZmlsZTFcXG5maWxlMlxcbicpO1xuXHRcdC8vIENvbW1hbmQgZmluaXNoZXNcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdEOzAnKSk7XG5cdFx0Ly8gTmV3IHByb21wdFxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShgJHtvc2M2MzMoJ0EnKX11c2VyQGhvc3Q6fiAkIGApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5kbGVyLmNvbnRlbnQubWFwKHAgPT4gKHtcblx0XHRcdHR5cGU6IHAudHlwZSxcblx0XHRcdC4uLihwLnR5cGUgPT09ICd1bmNsYXNzaWZpZWQnID8geyB2YWx1ZTogcC52YWx1ZSB9IDoge1xuXHRcdFx0XHRjb21tYW5kSWQ6IHAuY29tbWFuZElkLFxuXHRcdFx0XHRjb21tYW5kTGluZTogcC5jb21tYW5kTGluZSxcblx0XHRcdFx0b3V0cHV0OiBwLm91dHB1dCxcblx0XHRcdFx0aXNDb21wbGV0ZTogcC5pc0NvbXBsZXRlLFxuXHRcdFx0XHRleGl0Q29kZTogcC5leGl0Q29kZSxcblx0XHRcdH0pLFxuXHRcdH0pKSwgW1xuXHRcdFx0eyB0eXBlOiAndW5jbGFzc2lmaWVkJywgdmFsdWU6ICd1c2VyQGhvc3Q6fiAkICcgfSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kSWQ6ICdjbWQtMScsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiAnbHMnLFxuXHRcdFx0XHRvdXRwdXQ6ICdmaWxlMVxcbmZpbGUyXFxuJyxcblx0XHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiAndW5jbGFzc2lmaWVkJywgdmFsdWU6ICd1c2VyQGhvc3Q6fiAkICcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbm9uY2UgdmFsaWRhdGlvbiByZWplY3RzIHVudHJ1c3RlZCBjb21tYW5kIGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCdteS1zZWNyZXQtbm9uY2UnKTtcblxuXHRcdC8vIE1hbGljaW91cyBvdXRwdXQgY29udGFpbmluZyBhIGZha2UgY29tbWFuZCBsaW5lIHdpdGggd3Jvbmcgbm9uY2Vcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdFO3JtXFxcXHgyMC1yZlxcXFx4MjAvO3dyb25nLW5vbmNlJykpO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0MnKSk7XG5cblx0XHRjb25zdCBleGVjdXRlZCA9IGhhbmRsZXIuZGlzcGF0Y2hlZC5maW5kKGEgPT4gYS50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkKTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWQpO1xuXHRcdC8vIENvbW1hbmQgbGluZSBzaG91bGQgYmUgZW1wdHkgYmVjYXVzZSB0aGUgbm9uY2UgZGlkbid0IG1hdGNoXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZWN1dGVkLmNvbW1hbmRMaW5lLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vbmNlIHZhbGlkYXRpb24gYWNjZXB0cyB0cnVzdGVkIGNvbW1hbmQgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoJ215LXNlY3JldC1ub25jZScpO1xuXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnRTtlY2hvXFxcXHgyMHNhZmU7bXktc2VjcmV0LW5vbmNlJykpO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShvc2M2MzMoJ0MnKSk7XG5cblx0XHRjb25zdCBleGVjdXRlZCA9IGhhbmRsZXIuZGlzcGF0Y2hlZC5maW5kKGEgPT4gYS50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEV4ZWN1dGVkKTtcblx0XHRhc3NlcnQub2soZXhlY3V0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZC5jb21tYW5kTGluZSwgJ2VjaG8gc2FmZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBzZXF1ZW50aWFsIGNvbW1hbmRzIGdldCBzZXF1ZW50aWFsIElEcycsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0Ly8gRmlyc3QgY29tbWFuZFxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShgJHtvc2M2MzMoJ0U7Y21kMTt0ZXN0LW5vbmNlJyl9JHtvc2M2MzMoJ0MnKX1gKTtcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdEOzAnKSk7XG5cblx0XHQvLyBTZWNvbmQgY29tbWFuZFxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShgJHtvc2M2MzMoJ0U7Y21kMjt0ZXN0LW5vbmNlJyl9JHtvc2M2MzMoJ0MnKX1gKTtcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdEOzEnKSk7XG5cblx0XHRjb25zdCBleGVjdXRlZCA9IGhhbmRsZXIuZGlzcGF0Y2hlZC5maWx0ZXIoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZFswXS5jb21tYW5kSWQsICdjbWQtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGVjdXRlZFswXS5jb21tYW5kTGluZSwgJ2NtZDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZWRbMV0uY29tbWFuZElkLCAnY21kLTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlY3V0ZWRbMV0uY29tbWFuZExpbmUsICdjbWQyJyk7XG5cblx0XHRjb25zdCBmaW5pc2hlZCA9IGhhbmRsZXIuZGlzcGF0Y2hlZC5maWx0ZXIoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRmluaXNoZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5pc2hlZC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5pc2hlZFswXS5jb21tYW5kSWQsICdjbWQtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5pc2hlZFswXS5leGl0Q29kZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmlzaGVkWzFdLmNvbW1hbmRJZCwgJ2NtZC0yJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmlzaGVkWzFdLmV4aXRDb2RlLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnQ1dEIHByb3BlcnR5IGRpc3BhdGNoZXMgVGVybWluYWxDd2RDaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdQO0N3ZD0vbmV3L3dvcmtpbmcvZGlyJykpO1xuXG5cdFx0Y29uc3QgY3dkQWN0aW9uID0gaGFuZGxlci5kaXNwYXRjaGVkLmZpbmQoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDd2RDaGFuZ2VkKTtcblx0XHRhc3NlcnQub2soY3dkQWN0aW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3dkQWN0aW9uLmN3ZCwgJy9uZXcvd29ya2luZy9kaXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlci5jd2QsICcvbmV3L3dvcmtpbmcvZGlyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ09TQyA2MzMgc2VxdWVuY2VzIGFyZSBzdHJpcHBlZCBmcm9tIGNsZWFuZWQgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBjcmVhdGVIYW5kbGVyKCk7XG5cblx0XHRjb25zdCBjbGVhbmVkID0gaGFuZGxlci5oYW5kbGVQdHlEYXRhKFxuXHRcdFx0YGJlZm9yZSR7b3NjNjMzKCdBJyl9cHJvbXB0JHtvc2M2MzMoJ0InKX0ke29zYzYzMygnRTtsczt0ZXN0LW5vbmNlJyl9JHtvc2M2MzMoJ0MnKX1vdXRwdXQke29zYzYzMygnRDswJyl9YWZ0ZXJgXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhbmVkLCAnYmVmb3JlcHJvbXB0b3V0cHV0YWZ0ZXInKTtcblx0fSk7XG5cblx0dGVzdCgnZGF0YSB3aXRob3V0IHNoZWxsIGludGVncmF0aW9uIHBhc3NlcyB0aHJvdWdoIHVubW9kaWZpZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IG5ldyBUZXN0VGVybWluYWxEYXRhSGFuZGxlcigndGVybWluYWw6Ly90ZXN0Jywge1xuXHRcdFx0cGFyc2VyOiBuZXcgT3NjNjMzUGFyc2VyKCksXG5cdFx0XHRub25jZTogJ25vbmNlJyxcblx0XHRcdGNvbW1hbmRDb3VudGVyOiAwLFxuXHRcdFx0ZGV0ZWN0aW9uQXZhaWxhYmxlRW1pdHRlZDogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkYXRhID0gJ3JlZ3VsYXIgdGVybWluYWwgb3V0cHV0IHdpdGggXFx4MWJbMzFtY29sb3JzXFx4MWJbMG0nO1xuXHRcdGNvbnN0IGNsZWFuZWQgPSBoYW5kbGVyLmhhbmRsZVB0eURhdGEoZGF0YSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYW5lZCwgZGF0YSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5kbGVyLmNvbnRlbnQsIFtcblx0XHRcdHsgdHlwZTogJ3VuY2xhc3NpZmllZCcsIHZhbHVlOiBkYXRhIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoYW5kbGVyLmRpc3BhdGNoZWQsIFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIGRhdGEgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnQ29tbWFuZEZpbmlzaGVkIHdpdGhvdXQgYWN0aXZlIGNvbW1hbmQgaXMgaWdub3JlZCcsICgpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyID0gY3JlYXRlSGFuZGxlcigpO1xuXG5cdFx0Ly8gRW1pdCBhIFByb21wdFN0YXJ0IHRvIHRyaWdnZXIgZGV0ZWN0aW9uIGF2YWlsYWJsZSwgdGhlbiBmaW5pc2ggd2l0aG91dCBleGVjdXRlXG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKG9zYzYzMygnQScpKTtcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdEOzAnKSk7XG5cblx0XHRjb25zdCBmaW5pc2hlZCA9IGhhbmRsZXIuZGlzcGF0Y2hlZC5maWx0ZXIoYSA9PiBhLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRmluaXNoZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5pc2hlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21tYW5kIG91dHB1dCBpcyBhY2N1bXVsYXRlZCBpbiB0aGUgY29tbWFuZCBjb250ZW50IHBhcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IGNyZWF0ZUhhbmRsZXIoKTtcblxuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YShgJHtvc2M2MzMoJ0U7dGVzdDt0ZXN0LW5vbmNlJyl9JHtvc2M2MzMoJ0MnKX1gKTtcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEoJ2xpbmUxXFxyXFxuJyk7XG5cdFx0aGFuZGxlci5oYW5kbGVQdHlEYXRhKCdsaW5lMlxcclxcbicpO1xuXHRcdGhhbmRsZXIuaGFuZGxlUHR5RGF0YSgnbGluZTNcXHJcXG4nKTtcblx0XHRoYW5kbGVyLmhhbmRsZVB0eURhdGEob3NjNjMzKCdEOzAnKSk7XG5cblx0XHRjb25zdCBjbWRQYXJ0cyA9IGhhbmRsZXIuY29udGVudC5maWx0ZXIocCA9PiBwLnR5cGUgPT09ICdjb21tYW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNtZFBhcnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNtZFBhcnRzWzBdLnR5cGUgPT09ICdjb21tYW5kJyAmJiBjbWRQYXJ0c1swXS5vdXRwdXQsICdsaW5lMVxcclxcbmxpbmUyXFxyXFxubGluZTNcXHJcXG4nKTtcblx0fSk7XG5cblx0dGVzdCgnb3V0cHV0IGFuZCBDb21tYW5kRmluaXNoZWQgYXJyaXZpbmcgaW4gb25lIFBUWSByZWFkIGFyZSBhdHRyaWJ1dGVkIHRvIHRoZSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgZmFzdCBjb21tYW5kIChlLmcuIGBlY2hvYCkgZnJlcXVlbnRseSBlbWl0cyBpdHMgb3V0cHV0IGFuZCB0aGVcblx0XHQvLyBDb21tYW5kRXhlY3V0ZWQvQ29tbWFuZEZpbmlzaGVkIG1hcmtlcnMgaW4gYSBzaW5nbGUgUFRZIHJlYWQuIFRoZVxuXHRcdC8vIG91dHB1dCB0aGF0IHByZWNlZGVzIHRoZSBDb21tYW5kRmluaXNoZWQgbWFya2VyIG11c3QgYmUgYXR0cmlidXRlZCB0b1xuXHRcdC8vIHRoZSBjb21tYW5kIGJlZm9yZSB0aGUgZmluaXNoZWQgZXZlbnQgc25hcHNob3RzIGl0LCBvdGhlcndpc2UgaXQgaXNcblx0XHQvLyBsb3N0IGZyb20gdGhlIGNvbW1hbmQgcmVzdWx0IChyZWdyZXNzaW9uIGZvciB0aGUgZmxha3kgYWdlbnQtaG9zdFxuXHRcdC8vIHNhbmRib3ggc21va2UgdGVzdCwgd2hlcmUgdGhlIHNoZWxsIHRvb2wgcmV0dXJuZWQgYW4gZW1wdHkgb3V0cHV0KS5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGFwcGxpY2F0aW9uTmFtZTogJ3ZzY29kZScgfSBhcyBJUHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgcHR5ID0gbmV3IFRlc3RQdHkoKTtcblx0XHRjb25zdCBtYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0QWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyKHN0YXRlTWFuYWdlciwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwdHkpKTtcblx0XHRjb25zdCB1cmkgPSAnYWdlbnRob3N0LXRlcm1pbmFsOi8vdGVzdC9jb2FsZXNjZWQtY29tbWFuZC1maW5pc2hlZCc7XG5cblx0XHRjb25zdCBjcmVhdGVUZXJtaW5hbCA9IG1hbmFnZXIuY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0Y2hhbm5lbDogdXJpLFxuXHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3Rlc3QtY2xpZW50JyB9LFxuXHRcdFx0Y3dkOiBwcm9jZXNzLmN3ZCgpLFxuXHRcdFx0Y29sczogODAsXG5cdFx0XHRyb3dzOiAyNCxcblx0XHR9LCB7IHNoZWxsOiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ3B3c2guZXhlJyA6ICcvYmluL2Jhc2gnIH0pO1xuXG5cdFx0YXdhaXQgcHR5LmRhdGFMaXN0ZW5lclJlZ2lzdGVyZWQucDtcblx0XHRwdHkuZmlyZURhdGEob3NjNjMzKCdBJykpO1xuXHRcdGF3YWl0IGNyZWF0ZVRlcm1pbmFsO1xuXG5cdFx0Y29uc3QgY29tcGxldGlvbnM6IHsgcmVhZG9ubHkgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDsgcmVhZG9ubHkgb3V0cHV0OiBzdHJpbmcgfVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25Db21tYW5kRmluaXNoZWQodXJpLCBldmVudCA9PiBjb21wbGV0aW9ucy5wdXNoKHtcblx0XHRcdGV4aXRDb2RlOiBldmVudC5leGl0Q29kZSxcblx0XHRcdG91dHB1dDogZXZlbnQub3V0cHV0LFxuXHRcdH0pKSk7XG5cblx0XHQvLyBDbGllbnRzIHJlYnVpbGQgcGVyLWNvbW1hbmQgb3V0cHV0IGZyb20gdGhlIGFjdGlvbiBzdHJlYW0sIHNvIHRoZVxuXHRcdC8vIGRhdGEgbXVzdCBhbHNvIGJlIERJU1BBVENIRUQgYmV0d2VlbiB0aGUgZXhlY3V0ZWQgYW5kIGZpbmlzaGVkXG5cdFx0Ly8gYWN0aW9ucywgbm90IGFmdGVyIHRoZSB3aG9sZSBjaHVuay5cblx0XHRjb25zdCBkaXNwYXRjaGVkOiB7IHR5cGU6IHN0cmluZzsgZGF0YT86IHN0cmluZyB9W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRFeGVjdXRlZCB8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRGaW5pc2hlZCkge1xuXHRcdFx0XHRkaXNwYXRjaGVkLnB1c2goeyB0eXBlOiBhY3Rpb24udHlwZSB9KTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxEYXRhKSB7XG5cdFx0XHRcdGRpc3BhdGNoZWQucHVzaCh7IHR5cGU6IGFjdGlvbi50eXBlLCBkYXRhOiBhY3Rpb24uZGF0YSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRwdHkuZmlyZURhdGEoYCR7b3NjNjMzKCdDJyl9aGlcXHJcXG4ke29zYzYzMygnRDswJyl9YCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRpb25zLCBbeyBleGl0Q29kZTogMCwgb3V0cHV0OiAnaGlcXHJcXG4nIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpc3BhdGNoZWQsIFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRFeGVjdXRlZCB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ2hpXFxyXFxuJyB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEZpbmlzaGVkIH0sXG5cdFx0XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgXHUyMDEzIG91dHB1dC1vbmx5IHRlcm1pbmFscycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1hbmFnZXIoKSB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBhcHBsaWNhdGlvbk5hbWU6ICd2c2NvZGUnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcihzdGF0ZU1hbmFnZXIsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdHJldHVybiB7IG1hbmFnZXIsIHN0YXRlTWFuYWdlciB9O1xuXHR9XG5cblx0dGVzdCgnc3RyZWFtcyBhcHBlbmRlZCBkYXRhLCBzbmFwc2hvdHMgc3RhdGUgd2l0aCBpc1B0eSBmYWxzZSwgYW5kIHJlY29yZHMgdGhlIGV4aXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBtYW5hZ2VyLCBzdGF0ZU1hbmFnZXIgfSA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCB1cmkgPSAnYWdlbnRob3N0LXRlcm1pbmFsOi8vc2hlbGwvY29waWxvdE5vblB0eVNoZWxscy90Yy0xJztcblx0XHRjb25zdCBjbGFpbTogVGVybWluYWxDbGFpbSA9IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbiwgc2Vzc2lvbjogJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgdG9vbENhbGxJZDogJ3RjLTEnIH07XG5cdFx0Y29uc3QgZGlzcGF0Y2hlZDogU3RhdGVBY3Rpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0aWYgKGVudmVsb3BlLmNoYW5uZWwgPT09IHVyaSkge1xuXHRcdFx0XHRkaXNwYXRjaGVkLnB1c2goZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRtYW5hZ2VyLmNyZWF0ZU91dHB1dFRlcm1pbmFsKHVyaSwgeyB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgY2xhaW0gfSk7XG5cdFx0bWFuYWdlci5hcHBlbmRPdXRwdXRUZXJtaW5hbERhdGEodXJpLCAndGljayAxXFxuJyk7XG5cdFx0bWFuYWdlci5hcHBlbmRPdXRwdXRUZXJtaW5hbERhdGEodXJpLCAndGljayAyXFxuJyk7XG5cdFx0bWFuYWdlci5maW5hbGl6ZU91dHB1dFRlcm1pbmFsKHVyaSwgMCk7XG5cdFx0bWFuYWdlci5maW5hbGl6ZU91dHB1dFRlcm1pbmFsKHVyaSwgMSk7IC8vIHJlY29yZGVkIGV4aXQgaXMgaW1tdXRhYmxlXG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0VGVybWluYWxTdGF0ZSh1cmkpLCB7XG5cdFx0XHR0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJyxcblx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6ICd1bmNsYXNzaWZpZWQnLCB2YWx1ZTogJ3RpY2sgMVxcbnRpY2sgMlxcbicgfV0sXG5cdFx0XHRleGl0Q29kZTogMCxcblx0XHRcdGNsYWltLFxuXHRcdFx0aXNQdHk6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcGF0Y2hlZCwgW1xuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ3RpY2sgMVxcbicgfSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbERhdGEsIGRhdGE6ICd0aWNrIDJcXG4nIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxFeGl0ZWQsIGV4aXRDb2RlOiAwIH0sXG5cdFx0XSk7XG5cdFx0Ly8gT3V0cHV0IGNoYW5uZWxzIGFyZSBkaXNjb3ZlcmVkIHRocm91Z2ggdG9vbCByZXN1bHQgY29udGVudCwgbm90IGdlbmVyaWMgUFRZIHRlcm1pbmFsIEFQSXMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGFzVGVybWluYWwodXJpKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlci5nZXRUZXJtaW5hbEluZm9zKCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzZXQgY2xlYXJzIGNvbnRlbnQgYW5kIGRpc3Bvc2UgcmVtb3ZlcyB0aGUgY2hhbm5lbCcsICgpID0+IHtcblx0XHRjb25zdCB7IG1hbmFnZXIsIHN0YXRlTWFuYWdlciB9ID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVyaSA9ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTInO1xuXHRcdGNvbnN0IGRpc3BhdGNoZWQ6IFN0YXRlQWN0aW9uW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGVudmVsb3BlID0+IHtcblx0XHRcdGlmIChlbnZlbG9wZS5jaGFubmVsID09PSB1cmkpIHtcblx0XHRcdFx0ZGlzcGF0Y2hlZC5wdXNoKGVudmVsb3BlLmFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bWFuYWdlci5jcmVhdGVPdXRwdXRUZXJtaW5hbCh1cmksIHsgdGl0bGU6ICdCYXNoJywgY2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbiwgc2Vzc2lvbjogJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJyB9IH0pO1xuXHRcdG1hbmFnZXIuYXBwZW5kT3V0cHV0VGVybWluYWxEYXRhKHVyaSwgJ29sZCBvdXRwdXQnKTtcblx0XHRtYW5hZ2VyLnJlc2V0T3V0cHV0VGVybWluYWwodXJpKTtcblx0XHRtYW5hZ2VyLmFwcGVuZE91dHB1dFRlcm1pbmFsRGF0YSh1cmksICdmcmVzaCBvdXRwdXQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlci5nZXRUZXJtaW5hbFN0YXRlKHVyaSk/LmNvbnRlbnQsIFt7IHR5cGU6ICd1bmNsYXNzaWZpZWQnLCB2YWx1ZTogJ2ZyZXNoIG91dHB1dCcgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcGF0Y2hlZC5tYXAoYWN0aW9uID0+IGFjdGlvbi50eXBlKSwgW0FjdGlvblR5cGUuVGVybWluYWxEYXRhLCBBY3Rpb25UeXBlLlRlcm1pbmFsQ2xlYXJlZCwgQWN0aW9uVHlwZS5UZXJtaW5hbERhdGFdKTtcblxuXHRcdG1hbmFnZXIuZGlzcG9zZVRlcm1pbmFsKHVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuaGFzVGVybWluYWwodXJpKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldFRlcm1pbmFsU3RhdGUodXJpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLHlCQUFrRTtBQUMzRSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQixvQkFBb0IsaURBQWlGO0FBQ3hJLFNBQXNCLGlCQUFpQixv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
