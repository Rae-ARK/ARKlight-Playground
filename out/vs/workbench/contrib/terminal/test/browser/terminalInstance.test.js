import { deepStrictEqual, strictEqual } from "assert";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { isWindows, OperatingSystem } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ResultKind } from "../../../../../platform/keybinding/common/keybindingResolver.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCapabilityStore } from "../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { GeneralShellType, PosixShellType, TitleEventSource } from "../../../../../platform/terminal/common/terminal.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { ITerminalConfigurationService, ITerminalInstanceService, ITerminalService } from "../../browser/terminal.js";
import { TerminalConfigurationService } from "../../browser/terminalConfigurationService.js";
import { parseExitResult, TerminalInstance, TerminalLabelComputer } from "../../browser/terminalInstance.js";
import { IEnvironmentVariableService } from "../../common/environmentVariable.js";
import { EnvironmentVariableService } from "../../common/environmentVariableService.js";
import { ITerminalProfileResolverService, ProcessState, DEFAULT_COMMANDS_TO_SKIP_SHELL } from "../../common/terminal.js";
import { TestViewDescriptorService } from "./xterm/xtermTerminal.test.js";
import { fixPath } from "../../../../services/search/test/browser/queryBuilder.test.js";
import { TestTerminalProfileResolverService, workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
const root1 = "/foo/root1";
const ROOT_1 = fixPath(root1);
const root2 = "/foo/root2";
const ROOT_2 = fixPath(root2);
class MockTerminalProfileResolverService extends TestTerminalProfileResolverService {
  async getDefaultProfile() {
    return {
      profileName: "my-sh",
      path: "/usr/bin/zsh",
      env: {
        TEST: "TEST"
      },
      isDefault: true,
      isUnsafePath: false,
      isFromPath: true,
      icon: {
        id: "terminal-linux"
      },
      color: "terminal.ansiYellow"
    };
  }
}
const terminalShellTypeContextKey = {
  set: () => {
  },
  reset: () => {
  },
  get: () => void 0
};
class TestTerminalChildProcess extends Disposable {
  constructor(shouldPersist) {
    super();
    this.shouldPersist = shouldPersist;
    this.id = 0;
    this.onDidChangeProperty = Event.None;
    this.onProcessData = Event.None;
    this.onProcessExit = Event.None;
    this.onProcessReady = Event.None;
    this.onProcessTitleChanged = Event.None;
    this.onProcessShellTypeChanged = Event.None;
  }
  get capabilities() {
    return [];
  }
  updateProperty(property, value) {
    throw new Error("Method not implemented.");
  }
  async start() {
    return void 0;
  }
  shutdown(immediate) {
  }
  input(data) {
  }
  sendSignal(signal) {
  }
  resize(cols, rows) {
  }
  clearBuffer() {
  }
  acknowledgeDataEvent(charCount) {
  }
  async setUnicodeVersion(version) {
  }
  async getInitialCwd() {
    return "";
  }
  async getCwd() {
    return "";
  }
  async processBinary(data) {
  }
  refreshProperty(property) {
    return Promise.resolve("");
  }
}
class TestTerminalInstanceService extends Disposable {
  async getBackend() {
    return {
      onPtyHostExit: Event.None,
      onPtyHostUnresponsive: Event.None,
      onPtyHostResponsive: Event.None,
      onPtyHostRestart: Event.None,
      onDidMoveWindowInstance: Event.None,
      onDidRequestDetach: Event.None,
      createProcess: async (shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) => this._register(new TestTerminalChildProcess(shouldPersist)),
      getLatency: () => Promise.resolve([])
    };
  }
}
suite("Workbench - TerminalInstance", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("TerminalInstance", () => {
    let terminalInstance;
    async function createTerminalInstance() {
      const instantiationService = workbenchInstantiationService({
        configurationService: () => new TestConfigurationService({
          files: {},
          terminal: {
            integrated: {
              fontFamily: "monospace",
              scrollback: 1e3,
              fastScrollSensitivity: 2,
              mouseWheelScrollSensitivity: 1,
              unicodeVersion: "6",
              commandsToSkipShell: [],
              shellIntegration: {
                enabled: true
              }
            }
          }
        })
      }, store);
      instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
      instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
      instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
      instantiationService.stub(ITerminalInstanceService, store.add(new TestTerminalInstanceService()));
      instantiationService.stub(ITerminalService, { setNextCommandId: async () => {
      } });
      const instance = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {}));
      await instance.xtermReadyPromise;
      return instance;
    }
    test("should create an instance of TerminalInstance with env from default profile", async () => {
      terminalInstance = await createTerminalInstance();
      await new Promise((resolve) => setTimeout(resolve, 100));
      deepStrictEqual(terminalInstance.shellLaunchConfig.env, { TEST: "TEST" });
    });
    test("should preserve title for task terminals", async () => {
      const instantiationService = workbenchInstantiationService({
        configurationService: () => new TestConfigurationService({
          files: {},
          terminal: {
            integrated: {
              fontFamily: "monospace",
              scrollback: 1e3,
              fastScrollSensitivity: 2,
              mouseWheelScrollSensitivity: 1,
              unicodeVersion: "6",
              shellIntegration: {
                enabled: true
              }
            }
          }
        })
      }, store);
      instantiationService.set(ITerminalProfileResolverService, new MockTerminalProfileResolverService());
      instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
      instantiationService.stub(IEnvironmentVariableService, store.add(instantiationService.createInstance(EnvironmentVariableService)));
      instantiationService.stub(ITerminalInstanceService, store.add(new TestTerminalInstanceService()));
      instantiationService.stub(ITerminalService, { setNextCommandId: async () => {
      } });
      const taskTerminal = store.add(instantiationService.createInstance(TerminalInstance, terminalShellTypeContextKey, {
        type: "Task",
        name: "Test Task Name"
      }));
      await taskTerminal.rename("Test Task Name");
      strictEqual(taskTerminal.title, "Test Task Name");
      await taskTerminal.rename("some-process-name", TitleEventSource.Process);
      strictEqual(taskTerminal.title, "Test Task Name", "Task terminal should preserve API-set title");
    });
    test("should preserve agent shell type detected from sequence until the parent shell returns", async () => {
      const instance = await createTerminalInstance();
      const onTitleChange = (title) => instance["_onTitleChange"](title);
      const handleShellTypeChange = (shellType) => instance["_handleShellTypeChange"](shellType);
      strictEqual(instance.shellType, void 0);
      onTitleChange("Claude Code");
      strictEqual(instance.shellType, GeneralShellType.Claude);
      handleShellTypeChange(GeneralShellType.Node);
      strictEqual(instance.shellType, GeneralShellType.Claude);
      handleShellTypeChange(void 0);
      strictEqual(instance.shellType, GeneralShellType.Claude);
      handleShellTypeChange(PosixShellType.Zsh);
      strictEqual(instance.shellType, PosixShellType.Zsh);
    });
    test("should detect Command Code agent shell type from its OSC title", async () => {
      const instance = await createTerminalInstance();
      const onTitleChange = (title) => instance["_onTitleChange"](title);
      strictEqual(instance.shellType, void 0);
      onTitleChange("\u2733 Command Code \xB7 my-project");
      strictEqual(instance.shellType, GeneralShellType.CommandCode);
    });
    test("should fire onWillDispose before xterm disposal and onDisposed after xterm disposal", async () => {
      const instance = await createTerminalInstance();
      const xterm = await instance.xtermReadyPromise;
      const disposalOrder = [];
      store.add(instance.onWillDispose(() => disposalOrder.push("onWillDispose")));
      store.add(xterm.onDidDispose(() => disposalOrder.push("xterm")));
      store.add(instance.onDisposed(() => disposalOrder.push("onDisposed")));
      instance.dispose();
      deepStrictEqual(disposalOrder, ["onWillDispose", "xterm", "onDisposed"]);
    });
    test("should dispose contribution-owned xterm addons before xterm disposal", async () => {
      const instance = await createTerminalInstance();
      const xterm = await instance.xtermReadyPromise;
      const disposalOrder = [];
      let addonDisposeCount = 0;
      const addon = {
        activate: () => {
        },
        dispose: () => {
          addonDisposeCount++;
          disposalOrder.push("addon");
        }
      };
      xterm.raw.loadAddon(addon);
      store.add(instance.onWillDispose(() => {
        disposalOrder.push("onWillDispose");
        addon.dispose();
      }));
      store.add(xterm.onDidDispose(() => disposalOrder.push("xterm")));
      store.add(instance.onDisposed(() => disposalOrder.push("onDisposed")));
      instance.dispose();
      deepStrictEqual(
        { disposalOrder, addonDisposeCount },
        { disposalOrder: ["onWillDispose", "addon", "xterm", "onDisposed"], addonDisposeCount: 1 }
      );
    });
    test("custom key event handler should handle commands in DEFAULT_COMMANDS_TO_SKIP_SHELL in VS Code and not xterm when sendKeybindingsToShell is disabled", async () => {
      const instance = await createTerminalInstance();
      const keybindingService = instance["_keybindingService"];
      const originalSoftDispatch = keybindingService.softDispatch;
      keybindingService.softDispatch = () => ({ kind: ResultKind.KbFound, commandId: "workbench.action.zoomIn", commandArgs: void 0, isBubble: false });
      let capturedHandler;
      instance.xterm.raw.attachCustomKeyEventHandler = (handler) => {
        capturedHandler = handler;
      };
      const container = document.createElement("div");
      document.body.appendChild(container);
      instance.attachToElement(container);
      instance.setVisible(true);
      const event = new KeyboardEvent("keydown", { key: "=", cancelable: true });
      try {
        deepStrictEqual(
          { result: capturedHandler?.(event), defaultPrevented: event.defaultPrevented },
          { result: false, defaultPrevented: true }
        );
      } finally {
        keybindingService.softDispatch = originalSoftDispatch;
        container.remove();
      }
    });
    test("custom key event handler should intercept Meta-modified keys that resolve to a command when sendKeybindingsToShell is disabled", async () => {
      const instance = await createTerminalInstance();
      const keybindingService = instance["_keybindingService"];
      const originalSoftDispatch = keybindingService.softDispatch;
      strictEqual(DEFAULT_COMMANDS_TO_SKIP_SHELL.includes("test.metaKeyInterceptCommand"), false);
      keybindingService.softDispatch = () => ({ kind: ResultKind.KbFound, commandId: "test.metaKeyInterceptCommand", commandArgs: void 0, isBubble: false });
      let capturedHandler;
      instance.xterm.raw.attachCustomKeyEventHandler = (handler) => {
        capturedHandler = handler;
      };
      const container = document.createElement("div");
      document.body.appendChild(container);
      instance.attachToElement(container);
      instance.setVisible(true);
      const event = new KeyboardEvent("keydown", { key: "=", metaKey: true, cancelable: true });
      try {
        deepStrictEqual(
          { result: capturedHandler?.(event), defaultPrevented: event.defaultPrevented },
          { result: false, defaultPrevented: true }
        );
      } finally {
        keybindingService.softDispatch = originalSoftDispatch;
        container.remove();
      }
    });
  });
  suite("DEFAULT_COMMANDS_TO_SKIP_SHELL", () => {
    test("should include zoom commands so they are not consumed by kitty keyboard protocol", () => {
      deepStrictEqual(
        ["workbench.action.zoomIn", "workbench.action.zoomOut", "workbench.action.zoomReset"].every(
          (cmd) => DEFAULT_COMMANDS_TO_SKIP_SHELL.includes(cmd)
        ),
        true
      );
    });
  });
  suite("parseExitResult", () => {
    test("should return no message for exit code = undefined", () => {
      deepStrictEqual(
        parseExitResult(void 0, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: void 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(void 0, {}, ProcessState.KilledByUser, void 0),
        { code: void 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(void 0, {}, ProcessState.KilledByProcess, void 0),
        { code: void 0, message: void 0 }
      );
    });
    test("should return no message for exit code = 0", () => {
      deepStrictEqual(
        parseExitResult(0, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(0, {}, ProcessState.KilledByUser, void 0),
        { code: 0, message: void 0 }
      );
      deepStrictEqual(
        parseExitResult(0, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 0, message: void 0 }
      );
    });
    test("should return friendly message when executable is specified for non-zero exit codes", () => {
      deepStrictEqual(
        parseExitResult(1, { executable: "foo" }, ProcessState.KilledDuringLaunch, void 0),
        { code: 1, message: 'The terminal process "foo" failed to launch (exit code: 1).' }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo" }, ProcessState.KilledByUser, void 0),
        { code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo" }, ProcessState.KilledByProcess, void 0),
        { code: 1, message: 'The terminal process "foo" terminated with exit code: 1.' }
      );
    });
    test("should return friendly message when executable and args are specified for non-zero exit codes", () => {
      deepStrictEqual(
        parseExitResult(1, { executable: "foo", args: ["bar", "baz"] }, ProcessState.KilledDuringLaunch, void 0),
        { code: 1, message: `The terminal process "foo 'bar', 'baz'" failed to launch (exit code: 1).` }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo", args: ["bar", "baz"] }, ProcessState.KilledByUser, void 0),
        { code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
      );
      deepStrictEqual(
        parseExitResult(1, { executable: "foo", args: ["bar", "baz"] }, ProcessState.KilledByProcess, void 0),
        { code: 1, message: `The terminal process "foo 'bar', 'baz'" terminated with exit code: 1.` }
      );
    });
    test("should return friendly message when executable and arguments are omitted for non-zero exit codes", () => {
      deepStrictEqual(
        parseExitResult(1, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 1, message: `The terminal process failed to launch (exit code: 1).` }
      );
      deepStrictEqual(
        parseExitResult(1, {}, ProcessState.KilledByUser, void 0),
        { code: 1, message: `The terminal process terminated with exit code: 1.` }
      );
      deepStrictEqual(
        parseExitResult(1, {}, ProcessState.KilledByProcess, void 0),
        { code: 1, message: `The terminal process terminated with exit code: 1.` }
      );
    });
    test("should ignore pty host-related errors", () => {
      deepStrictEqual(
        parseExitResult({ message: "Could not find pty with id 16" }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: void 0, message: void 0 }
      );
    });
    test("should format conpty failure code 5", () => {
      deepStrictEqual(
        parseExitResult({ code: 5, message: "A native exception occurred during launch (Cannot create process, error code: 5)" }, { executable: "foo" }, ProcessState.KilledDuringLaunch, void 0),
        { code: 5, message: `The terminal process failed to launch: Access was denied to the path containing your executable "foo". Manage and change your permissions to get this to work.` }
      );
    });
    test("should format conpty failure code 267", () => {
      deepStrictEqual(
        parseExitResult({ code: 267, message: "A native exception occurred during launch (Cannot create process, error code: 267)" }, {}, ProcessState.KilledDuringLaunch, "/foo"),
        { code: 267, message: `The terminal process failed to launch: Invalid starting directory "/foo", review your terminal.integrated.cwd setting.` }
      );
    });
    test("should format conpty failure code 1260", () => {
      deepStrictEqual(
        parseExitResult({ code: 1260, message: "A native exception occurred during launch (Cannot create process, error code: 1260)" }, { executable: "foo" }, ProcessState.KilledDuringLaunch, void 0),
        { code: 1260, message: `The terminal process failed to launch: Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator.` }
      );
    });
    test("should format conpty launch failure", () => {
      deepStrictEqual(
        parseExitResult({ message: "A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support for more details. You can also try enabling the `terminal.integrated.windowsUseConptyDll` setting." }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: void 0, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot launch conpty). Winpty has been removed, see https://code.visualstudio.com/updates/v1_109#_removal-of-winpty-support for more details. You can also try enabling the \`terminal.integrated.windowsUseConptyDll\` setting..` }
      );
    });
    test("should format generic failures", () => {
      deepStrictEqual(
        parseExitResult({ code: 123, message: "A native exception occurred during launch (Cannot create process, error code: 123)" }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 123, message: `The terminal process failed to launch: A native exception occurred during launch (Cannot create process, error code: 123).` }
      );
      deepStrictEqual(
        parseExitResult({ code: 123, message: "foo" }, {}, ProcessState.KilledDuringLaunch, void 0),
        { code: 123, message: `The terminal process failed to launch: foo.` }
      );
    });
  });
  suite("TerminalLabelComputer", () => {
    let instantiationService;
    let capabilities;
    function createInstance(partial) {
      const capabilities2 = store.add(new TerminalCapabilityStore());
      if (!isWindows) {
        capabilities2.add(TerminalCapability.NaiveCwdDetection, null);
      }
      return {
        shellLaunchConfig: {},
        shellType: GeneralShellType.PowerShell,
        cwd: "cwd",
        initialCwd: void 0,
        processName: "",
        sequence: void 0,
        workspaceFolder: void 0,
        staticTitle: void 0,
        capabilities: capabilities2,
        title: "",
        description: "",
        userHome: "/home/user",
        os: OperatingSystem.Linux,
        ...partial
      };
    }
    setup(async () => {
      instantiationService = workbenchInstantiationService(void 0, store);
      capabilities = store.add(new TerminalCapabilityStore());
      if (!isWindows) {
        capabilities.add(TerminalCapability.NaiveCwdDetection, null);
      }
    });
    function createLabelComputer(configuration) {
      instantiationService.set(IConfigurationService, new TestConfigurationService(configuration));
      instantiationService.set(ITerminalConfigurationService, store.add(instantiationService.createInstance(TerminalConfigurationService)));
      return store.add(instantiationService.createInstance(TerminalLabelComputer));
    }
    test('should resolve to "" when the template variables are empty', () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "", description: "" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "" }));
      strictEqual(terminalLabelComputer.title, "");
      strictEqual(terminalLabelComputer.description, "");
    });
    test("should resolve cwd when outside of userHome", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: ROOT_1 }));
      strictEqual(terminalLabelComputer.title, ROOT_1);
      strictEqual(terminalLabelComputer.description, ROOT_1);
    });
    test("should resolve cwd when under userHome", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: "/home/user/foo/bar" }));
      strictEqual(terminalLabelComputer.title, "~/foo/bar");
      strictEqual(terminalLabelComputer.description, "~/foo/bar");
    });
    test("should resolve cwd when exactly at userHome", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: "/home/user" }));
      strictEqual(terminalLabelComputer.title, "~");
      strictEqual(terminalLabelComputer.description, "~");
    });
    test("should not shorten cwd on Windows", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${cwd}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, cwd: "C:\\Users\\user", userHome: "C:\\Users\\user", os: OperatingSystem.Windows }));
      strictEqual(terminalLabelComputer.title, "C:\\Users\\user");
      strictEqual(terminalLabelComputer.description, "C:\\Users\\user");
    });
    test("should resolve workspaceFolder", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${workspaceFolder}", description: "${workspaceFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: "folder" }) } }));
      strictEqual(terminalLabelComputer.title, "folder");
      strictEqual(terminalLabelComputer.description, "folder");
    });
    test("should resolve local", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${local}", description: "${local}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", shellLaunchConfig: { type: "Local" } }));
      strictEqual(terminalLabelComputer.title, "Local");
      strictEqual(terminalLabelComputer.description, "Local");
    });
    test("should resolve process", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${process}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh" }));
      strictEqual(terminalLabelComputer.title, "zsh");
      strictEqual(terminalLabelComputer.description, "zsh");
    });
    test("should resolve sequence", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${sequence}", description: "${sequence}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: "sequence" }));
      strictEqual(terminalLabelComputer.title, "sequence");
      strictEqual(terminalLabelComputer.description, "sequence");
    });
    test("should resolve empty sequence to process name", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${sequence}${separator}${process}", description: "${sequence}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", sequence: "" }));
      strictEqual(terminalLabelComputer.title, "zsh");
      strictEqual(terminalLabelComputer.description, "");
    });
    test("should resolve task", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${task}", description: "${task}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", shellLaunchConfig: { type: "Task" } }));
      strictEqual(terminalLabelComputer.title, "zsh ~ Task");
      strictEqual(terminalLabelComputer.description, "Task");
    });
    test("should resolve separator", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${separator}", description: "${separator}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "zsh", shellLaunchConfig: { type: "Task" } }));
      strictEqual(terminalLabelComputer.title, "zsh");
      strictEqual(terminalLabelComputer.description, "");
    });
    test("should always return static title when specified", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}", description: "${workspaceFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: "folder" }) }, staticTitle: "my-title" }));
      strictEqual(terminalLabelComputer.title, "my-title");
      strictEqual(terminalLabelComputer.description, "folder");
    });
    test("should use shellLaunchConfig.titleTemplate as template when set", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, sequence: "my-sequence", processName: "zsh", shellLaunchConfig: { titleTemplate: "${sequence}" } }));
      strictEqual(terminalLabelComputer.title, "my-sequence");
      strictEqual(terminalLabelComputer.description, "cwd");
    });
    test("should use ${sequence} for agent CLI shell types", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Copilot, sequence: "Copilot Agent", processName: "copilot" }));
      strictEqual(terminalLabelComputer.title, "Copilot Agent");
    });
    test("should use ${sequence} for Gemini agent CLI shell type", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Gemini, sequence: "Gemini - my-project", processName: "node" }));
      strictEqual(terminalLabelComputer.title, "Gemini - my-project");
    });
    test("should use ${sequence} for Command Code agent CLI shell type", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.CommandCode, sequence: "Fix Parser Bug", processName: "node" }));
      strictEqual(terminalLabelComputer.title, "Fix Parser Bug");
    });
    test("should prefer shellLaunchConfig.titleTemplate over agent CLI shell type override", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: true } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Copilot, sequence: "Copilot Agent", processName: "copilot", shellLaunchConfig: { titleTemplate: "${process}" } }));
      strictEqual(terminalLabelComputer.title, "copilot");
    });
    test("should fall back to configured title when allowAgentCliTitle is disabled", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " - ", title: "${process}", description: "${cwd}", allowAgentCliTitle: false } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, shellType: GeneralShellType.Copilot, sequence: "Copilot Agent", processName: "copilot" }));
      strictEqual(terminalLabelComputer.title, "copilot");
    });
    test("should provide cwdFolder for all cwds only when in multi-root", () => {
      const terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${cwdFolder}", description: "${cwdFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_1 }));
      strictEqual(terminalLabelComputer.title, "process");
      strictEqual(terminalLabelComputer.description, "");
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_2 }));
      if (isWindows) {
        strictEqual(terminalLabelComputer.title, "process");
        strictEqual(terminalLabelComputer.description, "");
      } else {
        strictEqual(terminalLabelComputer.title, "process ~ root2");
        strictEqual(terminalLabelComputer.description, "root2");
      }
    });
    test("should hide cwdFolder in single folder workspaces when cwd matches the workspace's default cwd even when slashes differ", async () => {
      let terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${cwdFolder}", description: "${cwdFolder}" } } } });
      terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_1 }));
      strictEqual(terminalLabelComputer.title, "process");
      strictEqual(terminalLabelComputer.description, "");
      if (!isWindows) {
        terminalLabelComputer = createLabelComputer({ terminal: { integrated: { tabs: { separator: " ~ ", title: "${process}${separator}${cwdFolder}", description: "${cwdFolder}" } } } });
        terminalLabelComputer.refreshLabel(createInstance({ capabilities, processName: "process", workspaceFolder: { uri: URI.from({ scheme: Schemas.file, path: ROOT_1 }) }, cwd: ROOT_2 }));
        strictEqual(terminalLabelComputer.title, "process ~ root2");
        strictEqual(terminalLabelComputer.description, "root2");
      }
    });
  });
  suite("getCwdResource", () => {
    let mockFileService;
    let mockPathService;
    function createMockTerminalInstance(options) {
      const capabilities = store.add(new TerminalCapabilityStore());
      if (options.cwd) {
        const mockCwdDetection = {
          getCwd: () => options.cwd
        };
        capabilities.add(TerminalCapability.CwdDetection, mockCwdDetection);
      }
      mockFileService = {
        canHandleResource: async (_resource) => options.fileServiceCanHandle !== false,
        exists: async (resource) => options.fileExists !== false
      };
      mockPathService = {
        fileURI: async (path) => {
          if (options.remoteAuthority) {
            return URI.parse(`vscode-remote://${options.remoteAuthority}${path}`);
          }
          return URI.file(path);
        }
      };
      return {
        capabilities,
        remoteAuthority: options.remoteAuthority,
        async getCwdResource() {
          const cwd = this.capabilities.get(TerminalCapability.CwdDetection)?.getCwd();
          if (!cwd) {
            return void 0;
          }
          let resource;
          if (this.remoteAuthority) {
            resource = await mockPathService.fileURI(cwd);
          } else {
            resource = URI.file(cwd);
          }
          if (!await mockFileService.canHandleResource(resource)) {
            return void 0;
          }
          if (await mockFileService.exists(resource)) {
            return resource;
          }
          return void 0;
        }
      };
    }
    test("should return undefined when no CwdDetection capability", async () => {
      const instance = createMockTerminalInstance({});
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should return undefined when CwdDetection capability returns no cwd", async () => {
      const instance = createMockTerminalInstance({ cwd: void 0 });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should return URI.file for local terminal when file exists", async () => {
      const testCwd = "/test/path";
      const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });
      const result = await instance.getCwdResource();
      strictEqual(result?.scheme, "file");
      strictEqual(result?.path, testCwd);
    });
    test("should return undefined when file does not exist", async () => {
      const testCwd = "/test/nonexistent";
      const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: false });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should use pathService.fileURI for remote terminal", async () => {
      const testCwd = "/test/remote/path";
      const instance = createMockTerminalInstance({
        cwd: testCwd,
        remoteAuthority: "test-remote",
        fileExists: true
      });
      const result = await instance.getCwdResource();
      strictEqual(result?.scheme, "vscode-remote");
      strictEqual(result?.authority, "test-remote");
      strictEqual(result?.path, testCwd);
    });
    test("should handle Windows paths correctly", async () => {
      const testCwd = isWindows ? "C:\\test\\path" : "/test/path";
      const instance = createMockTerminalInstance({ cwd: testCwd, fileExists: true });
      const result = await instance.getCwdResource();
      strictEqual(result?.scheme, "file");
      if (isWindows) {
        strictEqual(result?.path, "/C:/test/path");
      } else {
        strictEqual(result?.path, testCwd);
      }
    });
    test("should handle empty cwd string", async () => {
      const instance = createMockTerminalInstance({ cwd: "" });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
    test("should return undefined when fileService cannot handle the resource (VS Code web ENOPRO scenario)", async () => {
      const testCwd = "/workspace/my-project";
      const instance = createMockTerminalInstance({
        cwd: testCwd,
        fileExists: true,
        fileServiceCanHandle: false
        // file:// provider absent
      });
      const result = await instance.getCwdResource();
      strictEqual(result, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL3Rlc3QvYnJvd3Nlci90ZXJtaW5hbEluc3RhbmNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSwgdHlwZSBJUHJvY2Vzc0Vudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSwgdHlwZSBJQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBHZW5lcmFsU2hlbGxUeXBlLCBJVGVybWluYWxDaGlsZFByb2Nlc3MsIElUZXJtaW5hbFByb2ZpbGUsIFBvc2l4U2hlbGxUeXBlLCBUaXRsZUV2ZW50U291cmNlLCB0eXBlIElTaGVsbExhdW5jaENvbmZpZywgdHlwZSBJVGVybWluYWxCYWNrZW5kLCB0eXBlIElUZXJtaW5hbFByb2Nlc3NPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlRXhpdFJlc3VsdCwgVGVybWluYWxJbnN0YW5jZSwgVGVybWluYWxMYWJlbENvbXB1dGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbEluc3RhbmNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IEVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIFByb2Nlc3NTdGF0ZSwgREVGQVVMVF9DT01NQU5EU19UT19TS0lQX1NIRUxMIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuL3h0ZXJtL3h0ZXJtVGVybWluYWwudGVzdC5qcyc7XG5pbXBvcnQgeyBmaXhQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL3Rlc3QvYnJvd3Nlci9xdWVyeUJ1aWxkZXIudGVzdC5qcyc7XG5pbXBvcnQgeyBUZXN0VGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG5jb25zdCByb290MSA9ICcvZm9vL3Jvb3QxJztcbmNvbnN0IFJPT1RfMSA9IGZpeFBhdGgocm9vdDEpO1xuY29uc3Qgcm9vdDIgPSAnL2Zvby9yb290Mic7XG5jb25zdCBST09UXzIgPSBmaXhQYXRoKHJvb3QyKTtcblxuY2xhc3MgTW9ja1Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBleHRlbmRzIFRlc3RUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2Uge1xuXHRvdmVycmlkZSBhc3luYyBnZXREZWZhdWx0UHJvZmlsZSgpOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGU+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvZmlsZU5hbWU6ICdteS1zaCcsXG5cdFx0XHRwYXRoOiAnL3Vzci9iaW4venNoJyxcblx0XHRcdGVudjoge1xuXHRcdFx0XHRURVNUOiAnVEVTVCcsXG5cdFx0XHR9LFxuXHRcdFx0aXNEZWZhdWx0OiB0cnVlLFxuXHRcdFx0aXNVbnNhZmVQYXRoOiBmYWxzZSxcblx0XHRcdGlzRnJvbVBhdGg6IHRydWUsXG5cdFx0XHRpY29uOiB7XG5cdFx0XHRcdGlkOiAndGVybWluYWwtbGludXgnLFxuXHRcdFx0fSxcblx0XHRcdGNvbG9yOiAndGVybWluYWwuYW5zaVllbGxvdycsXG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCB0ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXkgPSB7XG5cdHNldDogKCkgPT4geyB9LFxuXHRyZXNldDogKCkgPT4geyB9LFxuXHRnZXQ6ICgpID0+IHVuZGVmaW5lZFxufTtcblxuY2xhc3MgVGVzdFRlcm1pbmFsQ2hpbGRQcm9jZXNzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbENoaWxkUHJvY2VzcyB7XG5cdGlkOiBudW1iZXIgPSAwO1xuXHRnZXQgY2FwYWJpbGl0aWVzKCkgeyByZXR1cm4gW107IH1cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc2hvdWxkUGVyc2lzdDogYm9vbGVhblxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cdHVwZGF0ZVByb3BlcnR5KHByb3BlcnR5OiBhbnksIHZhbHVlOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblxuXHRyZWFkb25seSBvblByb2Nlc3NPdmVycmlkZURpbWVuc2lvbnM/OiBFdmVudDxhbnk+IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZXNvbHZlZFNoZWxsTGF1bmNoQ29uZmlnPzogRXZlbnQ8YW55PiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3Nlcz86IEV2ZW50PGFueT4gfCB1bmRlZmluZWQ7XG5cblx0b25EaWRDaGFuZ2VQcm9wZXJ0eSA9IEV2ZW50Lk5vbmU7XG5cdG9uUHJvY2Vzc0RhdGEgPSBFdmVudC5Ob25lO1xuXHRvblByb2Nlc3NFeGl0ID0gRXZlbnQuTm9uZTtcblx0b25Qcm9jZXNzUmVhZHkgPSBFdmVudC5Ob25lO1xuXHRvblByb2Nlc3NUaXRsZUNoYW5nZWQgPSBFdmVudC5Ob25lO1xuXHRvblByb2Nlc3NTaGVsbFR5cGVDaGFuZ2VkID0gRXZlbnQuTm9uZTtcblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRzaHV0ZG93bihpbW1lZGlhdGU6IGJvb2xlYW4pOiB2b2lkIHsgfVxuXHRpbnB1dChkYXRhOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRzZW5kU2lnbmFsKHNpZ25hbDogc3RyaW5nKTogdm9pZCB7IH1cblx0cmVzaXplKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogdm9pZCB7IH1cblx0Y2xlYXJCdWZmZXIoKTogdm9pZCB7IH1cblx0YWNrbm93bGVkZ2VEYXRhRXZlbnQoY2hhckNvdW50OiBudW1iZXIpOiB2b2lkIHsgfVxuXHRhc3luYyBzZXRVbmljb2RlVmVyc2lvbih2ZXJzaW9uOiAnNicgfCAnMTEnKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZ2V0SW5pdGlhbEN3ZCgpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0YXN5bmMgZ2V0Q3dkKCk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiAnJzsgfVxuXHRhc3luYyBwcm9jZXNzQmluYXJ5KGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdHJlZnJlc2hQcm9wZXJ0eShwcm9wZXJ0eTogYW55KTogUHJvbWlzZTxhbnk+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgnJyk7IH1cbn1cblxuY2xhc3MgVGVzdFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIFBhcnRpYWw8SVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlPiB7XG5cdGFzeW5jIGdldEJhY2tlbmQoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uUHR5SG9zdEV4aXQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvblB0eUhvc3RVbnJlc3BvbnNpdmU6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvblB0eUhvc3RSZXNwb25zaXZlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25QdHlIb3N0UmVzdGFydDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkTW92ZVdpbmRvd0luc3RhbmNlOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRSZXF1ZXN0RGV0YWNoOiBFdmVudC5Ob25lLFxuXHRcdFx0Y3JlYXRlUHJvY2VzczogYXN5bmMgKFxuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdFx0XHRjd2Q6IHN0cmluZyxcblx0XHRcdFx0Y29sczogbnVtYmVyLFxuXHRcdFx0XHRyb3dzOiBudW1iZXIsXG5cdFx0XHRcdHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnLFxuXHRcdFx0XHRlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0XHRcdG9wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLFxuXHRcdFx0XHRzaG91bGRQZXJzaXN0OiBib29sZWFuXG5cdFx0XHQpID0+IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXN0VGVybWluYWxDaGlsZFByb2Nlc3Moc2hvdWxkUGVyc2lzdCkpLFxuXHRcdFx0Z2V0TGF0ZW5jeTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFtdKVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxCYWNrZW5kO1xuXHR9XG59XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBUZXJtaW5hbEluc3RhbmNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdUZXJtaW5hbEluc3RhbmNlJywgKCkgPT4ge1xuXHRcdGxldCB0ZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVRlcm1pbmFsSW5zdGFuY2UoKTogUHJvbWlzZTxUZXJtaW5hbEluc3RhbmNlPiB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRcdGZpbGVzOiB7fSxcblx0XHRcdFx0XHR0ZXJtaW5hbDoge1xuXHRcdFx0XHRcdFx0aW50ZWdyYXRlZDoge1xuXHRcdFx0XHRcdFx0XHRmb250RmFtaWx5OiAnbW9ub3NwYWNlJyxcblx0XHRcdFx0XHRcdFx0c2Nyb2xsYmFjazogMTAwMCxcblx0XHRcdFx0XHRcdFx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiAyLFxuXHRcdFx0XHRcdFx0XHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6IDEsXG5cdFx0XHRcdFx0XHRcdHVuaWNvZGVWZXJzaW9uOiAnNicsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmRzVG9Ta2lwU2hlbGw6IFtdLFxuXHRcdFx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSlcblx0XHRcdH0sIHN0b3JlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBuZXcgTW9ja1Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgbmV3IFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlKSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgVGVzdFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2VydmljZSwgeyBzZXROZXh0Q29tbWFuZElkOiBhc3luYyAoKSA9PiB7IH0gfSBhcyBQYXJ0aWFsPElUZXJtaW5hbFNlcnZpY2U+KTtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsSW5zdGFuY2UsIHRlcm1pbmFsU2hlbGxUeXBlQ29udGV4dEtleSwge30pKTtcblx0XHRcdGF3YWl0IGluc3RhbmNlLnh0ZXJtUmVhZHlQcm9taXNlO1xuXHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBjcmVhdGUgYW4gaW5zdGFuY2Ugb2YgVGVybWluYWxJbnN0YW5jZSB3aXRoIGVudiBmcm9tIGRlZmF1bHQgcHJvZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHRlcm1pbmFsSW5zdGFuY2UgPSBhd2FpdCBjcmVhdGVUZXJtaW5hbEluc3RhbmNlKCk7XG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgdGVybWluYWwgaW5zdGFuY2UgdG8gcmVzb2x2ZSBzaGVsbCBsYXVuY2ggY29uZmlnIGVudi5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh0ZXJtaW5hbEluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmVudiwgeyBURVNUOiAnVEVTVCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgdGl0bGUgZm9yIHRhc2sgdGVybWluYWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0XHRmaWxlczoge30sXG5cdFx0XHRcdFx0dGVybWluYWw6IHtcblx0XHRcdFx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0XHRcdFx0Zm9udEZhbWlseTogJ21vbm9zcGFjZScsXG5cdFx0XHRcdFx0XHRcdHNjcm9sbGJhY2s6IDEwMDAsXG5cdFx0XHRcdFx0XHRcdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogMixcblx0XHRcdFx0XHRcdFx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiAxLFxuXHRcdFx0XHRcdFx0XHR1bmljb2RlVmVyc2lvbjogJzYnLFxuXHRcdFx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSlcblx0XHRcdH0sIHN0b3JlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLCBuZXcgTW9ja1Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgbmV3IFRlc3RWaWV3RGVzY3JpcHRvclNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFZhcmlhYmxlU2VydmljZSwgc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlKSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgVGVzdFRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlKCkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsU2VydmljZSwgeyBzZXROZXh0Q29tbWFuZElkOiBhc3luYyAoKSA9PiB7IH0gfSBhcyBQYXJ0aWFsPElUZXJtaW5hbFNlcnZpY2U+KTtcblxuXHRcdFx0Y29uc3QgdGFza1Rlcm1pbmFsID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsSW5zdGFuY2UsIHRlcm1pbmFsU2hlbGxUeXBlQ29udGV4dEtleSwge1xuXHRcdFx0XHR0eXBlOiAnVGFzaycsXG5cdFx0XHRcdG5hbWU6ICdUZXN0IFRhc2sgTmFtZSdcblx0XHRcdH0pKTtcblxuXG5cdFx0XHQvLyBTaW11bGF0ZSBzZXR0aW5nIHRoZSB0aXRsZSB2aWEgQVBJIChhcyB0aGUgdGFzayBzeXN0ZW0gd291bGQgZG8pXG5cdFx0XHRhd2FpdCB0YXNrVGVybWluYWwucmVuYW1lKCdUZXN0IFRhc2sgTmFtZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGFza1Rlcm1pbmFsLnRpdGxlLCAnVGVzdCBUYXNrIE5hbWUnKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgYSBwcm9jZXNzIHRpdGxlIGNoYW5nZSAod2hpY2ggaGFwcGVucyB3aGVuIHRhc2sgY29tcGxldGVzKVxuXHRcdFx0YXdhaXQgdGFza1Rlcm1pbmFsLnJlbmFtZSgnc29tZS1wcm9jZXNzLW5hbWUnLCBUaXRsZUV2ZW50U291cmNlLlByb2Nlc3MpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdGhhdCB0aGUgdGFzayBuYW1lIGlzIHByZXNlcnZlZFxuXHRcdFx0c3RyaWN0RXF1YWwodGFza1Rlcm1pbmFsLnRpdGxlLCAnVGVzdCBUYXNrIE5hbWUnLCAnVGFzayB0ZXJtaW5hbCBzaG91bGQgcHJlc2VydmUgQVBJLXNldCB0aXRsZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIGFnZW50IHNoZWxsIHR5cGUgZGV0ZWN0ZWQgZnJvbSBzZXF1ZW5jZSB1bnRpbCB0aGUgcGFyZW50IHNoZWxsIHJldHVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGNyZWF0ZVRlcm1pbmFsSW5zdGFuY2UoKSBhcyBUZXJtaW5hbEluc3RhbmNlO1xuXHRcdFx0Y29uc3Qgb25UaXRsZUNoYW5nZSA9ICh0aXRsZTogc3RyaW5nKSA9PiAoaW5zdGFuY2UgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCAodmFsdWU6IHN0cmluZykgPT4gdm9pZD4pWydfb25UaXRsZUNoYW5nZSddKHRpdGxlKTtcblx0XHRcdGNvbnN0IGhhbmRsZVNoZWxsVHlwZUNoYW5nZSA9IChzaGVsbFR5cGU6IEdlbmVyYWxTaGVsbFR5cGUgfCBQb3NpeFNoZWxsVHlwZSB8IHVuZGVmaW5lZCkgPT4gKGluc3RhbmNlIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgKHZhbHVlOiBHZW5lcmFsU2hlbGxUeXBlIHwgUG9zaXhTaGVsbFR5cGUgfCB1bmRlZmluZWQpID0+IHZvaWQ+KVsnX2hhbmRsZVNoZWxsVHlwZUNoYW5nZSddKHNoZWxsVHlwZSk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGluc3RhbmNlLnNoZWxsVHlwZSwgdW5kZWZpbmVkKTtcblx0XHRcdG9uVGl0bGVDaGFuZ2UoJ0NsYXVkZSBDb2RlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChpbnN0YW5jZS5zaGVsbFR5cGUsIEdlbmVyYWxTaGVsbFR5cGUuQ2xhdWRlKTtcblxuXHRcdFx0aGFuZGxlU2hlbGxUeXBlQ2hhbmdlKEdlbmVyYWxTaGVsbFR5cGUuTm9kZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChpbnN0YW5jZS5zaGVsbFR5cGUsIEdlbmVyYWxTaGVsbFR5cGUuQ2xhdWRlKTtcblxuXHRcdFx0aGFuZGxlU2hlbGxUeXBlQ2hhbmdlKHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChpbnN0YW5jZS5zaGVsbFR5cGUsIEdlbmVyYWxTaGVsbFR5cGUuQ2xhdWRlKTtcblxuXHRcdFx0aGFuZGxlU2hlbGxUeXBlQ2hhbmdlKFBvc2l4U2hlbGxUeXBlLlpzaCk7XG5cdFx0XHRzdHJpY3RFcXVhbChpbnN0YW5jZS5zaGVsbFR5cGUsIFBvc2l4U2hlbGxUeXBlLlpzaCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IENvbW1hbmQgQ29kZSBhZ2VudCBzaGVsbCB0eXBlIGZyb20gaXRzIE9TQyB0aXRsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSgpIGFzIFRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0XHRjb25zdCBvblRpdGxlQ2hhbmdlID0gKHRpdGxlOiBzdHJpbmcpID0+IChpbnN0YW5jZSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsICh2YWx1ZTogc3RyaW5nKSA9PiB2b2lkPilbJ19vblRpdGxlQ2hhbmdlJ10odGl0bGUpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChpbnN0YW5jZS5zaGVsbFR5cGUsIHVuZGVmaW5lZCk7XG5cdFx0XHRvblRpdGxlQ2hhbmdlKCdcXHUyNzMzIENvbW1hbmQgQ29kZSBcXHUwMGI3IG15LXByb2plY3QnKTtcblx0XHRcdHN0cmljdEVxdWFsKGluc3RhbmNlLnNoZWxsVHlwZSwgR2VuZXJhbFNoZWxsVHlwZS5Db21tYW5kQ29kZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZmlyZSBvbldpbGxEaXNwb3NlIGJlZm9yZSB4dGVybSBkaXNwb3NhbCBhbmQgb25EaXNwb3NlZCBhZnRlciB4dGVybSBkaXNwb3NhbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgY3JlYXRlVGVybWluYWxJbnN0YW5jZSgpO1xuXHRcdFx0Y29uc3QgeHRlcm0gPSBhd2FpdCBpbnN0YW5jZS54dGVybVJlYWR5UHJvbWlzZTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FsT3JkZXI6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdHN0b3JlLmFkZChpbnN0YW5jZS5vbldpbGxEaXNwb3NlKCgpID0+IGRpc3Bvc2FsT3JkZXIucHVzaCgnb25XaWxsRGlzcG9zZScpKSk7XG5cdFx0XHRzdG9yZS5hZGQoeHRlcm0hLm9uRGlkRGlzcG9zZSgoKSA9PiBkaXNwb3NhbE9yZGVyLnB1c2goJ3h0ZXJtJykpKTtcblx0XHRcdHN0b3JlLmFkZChpbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IGRpc3Bvc2FsT3JkZXIucHVzaCgnb25EaXNwb3NlZCcpKSk7XG5cblx0XHRcdGluc3RhbmNlLmRpc3Bvc2UoKTtcblxuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGRpc3Bvc2FsT3JkZXIsIFsnb25XaWxsRGlzcG9zZScsICd4dGVybScsICdvbkRpc3Bvc2VkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRpc3Bvc2UgY29udHJpYnV0aW9uLW93bmVkIHh0ZXJtIGFkZG9ucyBiZWZvcmUgeHRlcm0gZGlzcG9zYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGNyZWF0ZVRlcm1pbmFsSW5zdGFuY2UoKTtcblx0XHRcdGNvbnN0IHh0ZXJtID0gYXdhaXQgaW5zdGFuY2UueHRlcm1SZWFkeVByb21pc2U7XG5cdFx0XHRjb25zdCBkaXNwb3NhbE9yZGVyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0bGV0IGFkZG9uRGlzcG9zZUNvdW50ID0gMDtcblxuXHRcdFx0Y29uc3QgYWRkb24gPSB7XG5cdFx0XHRcdGFjdGl2YXRlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRhZGRvbkRpc3Bvc2VDb3VudCsrO1xuXHRcdFx0XHRcdGRpc3Bvc2FsT3JkZXIucHVzaCgnYWRkb24nKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHh0ZXJtIS5yYXcubG9hZEFkZG9uKGFkZG9uKTtcblx0XHRcdHN0b3JlLmFkZChpbnN0YW5jZS5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWxPcmRlci5wdXNoKCdvbldpbGxEaXNwb3NlJyk7XG5cdFx0XHRcdGFkZG9uLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZCh4dGVybSEub25EaWREaXNwb3NlKCgpID0+IGRpc3Bvc2FsT3JkZXIucHVzaCgneHRlcm0nKSkpO1xuXHRcdFx0c3RvcmUuYWRkKGluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4gZGlzcG9zYWxPcmRlci5wdXNoKCdvbkRpc3Bvc2VkJykpKTtcblxuXHRcdFx0aW5zdGFuY2UuZGlzcG9zZSgpO1xuXG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgZGlzcG9zYWxPcmRlciwgYWRkb25EaXNwb3NlQ291bnQgfSxcblx0XHRcdFx0eyBkaXNwb3NhbE9yZGVyOiBbJ29uV2lsbERpc3Bvc2UnLCAnYWRkb24nLCAneHRlcm0nLCAnb25EaXNwb3NlZCddLCBhZGRvbkRpc3Bvc2VDb3VudDogMSB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3VzdG9tIGtleSBldmVudCBoYW5kbGVyIHNob3VsZCBoYW5kbGUgY29tbWFuZHMgaW4gREVGQVVMVF9DT01NQU5EU19UT19TS0lQX1NIRUxMIGluIFZTIENvZGUgYW5kIG5vdCB4dGVybSB3aGVuIHNlbmRLZXliaW5kaW5nc1RvU2hlbGwgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGNyZWF0ZVRlcm1pbmFsSW5zdGFuY2UoKTtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gaW5zdGFuY2VbJ19rZXliaW5kaW5nU2VydmljZSddO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTb2Z0RGlzcGF0Y2ggPSBrZXliaW5kaW5nU2VydmljZS5zb2Z0RGlzcGF0Y2g7XG5cdFx0XHRrZXliaW5kaW5nU2VydmljZS5zb2Z0RGlzcGF0Y2ggPSAoKSA9PiAoeyBraW5kOiBSZXN1bHRLaW5kLktiRm91bmQsIGNvbW1hbmRJZDogJ3dvcmtiZW5jaC5hY3Rpb24uem9vbUluJywgY29tbWFuZEFyZ3M6IHVuZGVmaW5lZCwgaXNCdWJibGU6IGZhbHNlIH0pO1xuXG5cdFx0XHRsZXQgY2FwdHVyZWRIYW5kbGVyOiAoKGU6IEtleWJvYXJkRXZlbnQpID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkO1xuXHRcdFx0aW5zdGFuY2UueHRlcm0hLnJhdy5hdHRhY2hDdXN0b21LZXlFdmVudEhhbmRsZXIgPSBoYW5kbGVyID0+IHsgY2FwdHVyZWRIYW5kbGVyID0gaGFuZGxlcjsgfTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdFx0aW5zdGFuY2UuYXR0YWNoVG9FbGVtZW50KGNvbnRhaW5lcik7XG5cdFx0XHRpbnN0YW5jZS5zZXRWaXNpYmxlKHRydWUpO1xuXG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICc9JywgY2FuY2VsYWJsZTogdHJ1ZSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHJlc3VsdDogY2FwdHVyZWRIYW5kbGVyPy4oZXZlbnQpLCBkZWZhdWx0UHJldmVudGVkOiBldmVudC5kZWZhdWx0UHJldmVudGVkIH0sXG5cdFx0XHRcdFx0eyByZXN1bHQ6IGZhbHNlLCBkZWZhdWx0UHJldmVudGVkOiB0cnVlIH1cblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaCA9IG9yaWdpbmFsU29mdERpc3BhdGNoO1xuXHRcdFx0XHRjb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjdXN0b20ga2V5IGV2ZW50IGhhbmRsZXIgc2hvdWxkIGludGVyY2VwdCBNZXRhLW1vZGlmaWVkIGtleXMgdGhhdCByZXNvbHZlIHRvIGEgY29tbWFuZCB3aGVuIHNlbmRLZXliaW5kaW5nc1RvU2hlbGwgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IGNyZWF0ZVRlcm1pbmFsSW5zdGFuY2UoKTtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gaW5zdGFuY2VbJ19rZXliaW5kaW5nU2VydmljZSddO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxTb2Z0RGlzcGF0Y2ggPSBrZXliaW5kaW5nU2VydmljZS5zb2Z0RGlzcGF0Y2g7XG5cdFx0XHRzdHJpY3RFcXVhbChERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTEwuaW5jbHVkZXMoJ3Rlc3QubWV0YUtleUludGVyY2VwdENvbW1hbmQnKSwgZmFsc2UpO1xuXHRcdFx0a2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoID0gKCkgPT4gKHsga2luZDogUmVzdWx0S2luZC5LYkZvdW5kLCBjb21tYW5kSWQ6ICd0ZXN0Lm1ldGFLZXlJbnRlcmNlcHRDb21tYW5kJywgY29tbWFuZEFyZ3M6IHVuZGVmaW5lZCwgaXNCdWJibGU6IGZhbHNlIH0pO1xuXG5cdFx0XHRsZXQgY2FwdHVyZWRIYW5kbGVyOiAoKGU6IEtleWJvYXJkRXZlbnQpID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkO1xuXHRcdFx0aW5zdGFuY2UueHRlcm0hLnJhdy5hdHRhY2hDdXN0b21LZXlFdmVudEhhbmRsZXIgPSBoYW5kbGVyID0+IHsgY2FwdHVyZWRIYW5kbGVyID0gaGFuZGxlcjsgfTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdFx0aW5zdGFuY2UuYXR0YWNoVG9FbGVtZW50KGNvbnRhaW5lcik7XG5cdFx0XHRpbnN0YW5jZS5zZXRWaXNpYmxlKHRydWUpO1xuXG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBrZXk6ICc9JywgbWV0YUtleTogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHJlc3VsdDogY2FwdHVyZWRIYW5kbGVyPy4oZXZlbnQpLCBkZWZhdWx0UHJldmVudGVkOiBldmVudC5kZWZhdWx0UHJldmVudGVkIH0sXG5cdFx0XHRcdFx0eyByZXN1bHQ6IGZhbHNlLCBkZWZhdWx0UHJldmVudGVkOiB0cnVlIH1cblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaCA9IG9yaWdpbmFsU29mdERpc3BhdGNoO1xuXHRcdFx0XHRjb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnREVGQVVMVF9DT01NQU5EU19UT19TS0lQX1NIRUxMJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHpvb20gY29tbWFuZHMgc28gdGhleSBhcmUgbm90IGNvbnN1bWVkIGJ5IGtpdHR5IGtleWJvYXJkIHByb3RvY29sJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbJ3dvcmtiZW5jaC5hY3Rpb24uem9vbUluJywgJ3dvcmtiZW5jaC5hY3Rpb24uem9vbU91dCcsICd3b3JrYmVuY2guYWN0aW9uLnpvb21SZXNldCddLmV2ZXJ5KFxuXHRcdFx0XHRcdGNtZCA9PiBERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTEwuaW5jbHVkZXMoY21kKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ3BhcnNlRXhpdFJlc3VsdCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIG5vIG1lc3NhZ2UgZm9yIGV4aXQgY29kZSA9IHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHVuZGVmaW5lZCwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogdW5kZWZpbmVkLCBtZXNzYWdlOiB1bmRlZmluZWQgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHVuZGVmaW5lZCwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVVzZXIsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogdW5kZWZpbmVkLCBtZXNzYWdlOiB1bmRlZmluZWQgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHVuZGVmaW5lZCwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVByb2Nlc3MsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogdW5kZWZpbmVkLCBtZXNzYWdlOiB1bmRlZmluZWQgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIG5vIG1lc3NhZ2UgZm9yIGV4aXQgY29kZSA9IDAnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCgwLCB7fSwgUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAwLCBtZXNzYWdlOiB1bmRlZmluZWQgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDAsIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkQnlVc2VyLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDAsIG1lc3NhZ2U6IHVuZGVmaW5lZCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoMCwge30sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMCwgbWVzc2FnZTogdW5kZWZpbmVkIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmcmllbmRseSBtZXNzYWdlIHdoZW4gZXhlY3V0YWJsZSBpcyBzcGVjaWZpZWQgZm9yIG5vbi16ZXJvIGV4aXQgY29kZXMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCgxLCB7IGV4ZWN1dGFibGU6ICdmb28nIH0sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogJ1RoZSB0ZXJtaW5hbCBwcm9jZXNzIFwiZm9vXCIgZmFpbGVkIHRvIGxhdW5jaCAoZXhpdCBjb2RlOiAxKS4nIH1cblx0XHRcdCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCgxLCB7IGV4ZWN1dGFibGU6ICdmb28nIH0sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVVzZXIsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogJ1RoZSB0ZXJtaW5hbCBwcm9jZXNzIFwiZm9vXCIgdGVybWluYXRlZCB3aXRoIGV4aXQgY29kZTogMS4nIH1cblx0XHRcdCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCgxLCB7IGV4ZWN1dGFibGU6ICdmb28nIH0sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVByb2Nlc3MsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogJ1RoZSB0ZXJtaW5hbCBwcm9jZXNzIFwiZm9vXCIgdGVybWluYXRlZCB3aXRoIGV4aXQgY29kZTogMS4nIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBmcmllbmRseSBtZXNzYWdlIHdoZW4gZXhlY3V0YWJsZSBhbmQgYXJncyBhcmUgc3BlY2lmaWVkIGZvciBub24temVybyBleGl0IGNvZGVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoMSwgeyBleGVjdXRhYmxlOiAnZm9vJywgYXJnczogWydiYXInLCAnYmF6J10gfSwgUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCwgdW5kZWZpbmVkKSxcblx0XHRcdFx0eyBjb2RlOiAxLCBtZXNzYWdlOiBgVGhlIHRlcm1pbmFsIHByb2Nlc3MgXCJmb28gJ2JhcicsICdiYXonXCIgZmFpbGVkIHRvIGxhdW5jaCAoZXhpdCBjb2RlOiAxKS5gIH1cblx0XHRcdCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCgxLCB7IGV4ZWN1dGFibGU6ICdmb28nLCBhcmdzOiBbJ2JhcicsICdiYXonXSB9LCBQcm9jZXNzU3RhdGUuS2lsbGVkQnlVc2VyLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDEsIG1lc3NhZ2U6IGBUaGUgdGVybWluYWwgcHJvY2VzcyBcImZvbyAnYmFyJywgJ2JheidcIiB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlOiAxLmAgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHsgZXhlY3V0YWJsZTogJ2ZvbycsIGFyZ3M6IFsnYmFyJywgJ2JheiddIH0sIFByb2Nlc3NTdGF0ZS5LaWxsZWRCeVByb2Nlc3MsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMSwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIFwiZm9vICdiYXInLCAnYmF6J1wiIHRlcm1pbmF0ZWQgd2l0aCBleGl0IGNvZGU6IDEuYCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZnJpZW5kbHkgbWVzc2FnZSB3aGVuIGV4ZWN1dGFibGUgYW5kIGFyZ3VtZW50cyBhcmUgb21pdHRlZCBmb3Igbm9uLXplcm8gZXhpdCBjb2RlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDEsIG1lc3NhZ2U6IGBUaGUgdGVybWluYWwgcHJvY2VzcyBmYWlsZWQgdG8gbGF1bmNoIChleGl0IGNvZGU6IDEpLmAgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkQnlVc2VyLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDEsIG1lc3NhZ2U6IGBUaGUgdGVybWluYWwgcHJvY2VzcyB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlOiAxLmAgfVxuXHRcdFx0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KDEsIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkQnlQcm9jZXNzLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDEsIG1lc3NhZ2U6IGBUaGUgdGVybWluYWwgcHJvY2VzcyB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlOiAxLmAgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgaWdub3JlIHB0eSBob3N0LXJlbGF0ZWQgZXJyb3JzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoeyBtZXNzYWdlOiAnQ291bGQgbm90IGZpbmQgcHR5IHdpdGggaWQgMTYnIH0sIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IHVuZGVmaW5lZCwgbWVzc2FnZTogdW5kZWZpbmVkIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGZvcm1hdCBjb25wdHkgZmFpbHVyZSBjb2RlIDUnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCh7IGNvZGU6IDUsIG1lc3NhZ2U6ICdBIG5hdGl2ZSBleGNlcHRpb24gb2NjdXJyZWQgZHVyaW5nIGxhdW5jaCAoQ2Fubm90IGNyZWF0ZSBwcm9jZXNzLCBlcnJvciBjb2RlOiA1KScgfSwgeyBleGVjdXRhYmxlOiAnZm9vJyB9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDUsIG1lc3NhZ2U6IGBUaGUgdGVybWluYWwgcHJvY2VzcyBmYWlsZWQgdG8gbGF1bmNoOiBBY2Nlc3Mgd2FzIGRlbmllZCB0byB0aGUgcGF0aCBjb250YWluaW5nIHlvdXIgZXhlY3V0YWJsZSBcImZvb1wiLiBNYW5hZ2UgYW5kIGNoYW5nZSB5b3VyIHBlcm1pc3Npb25zIHRvIGdldCB0aGlzIHRvIHdvcmsuYCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBmb3JtYXQgY29ucHR5IGZhaWx1cmUgY29kZSAyNjcnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCh7IGNvZGU6IDI2NywgbWVzc2FnZTogJ0EgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgY3JlYXRlIHByb2Nlc3MsIGVycm9yIGNvZGU6IDI2NyknIH0sIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCAnL2ZvbycpLFxuXHRcdFx0XHR7IGNvZGU6IDI2NywgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGZhaWxlZCB0byBsYXVuY2g6IEludmFsaWQgc3RhcnRpbmcgZGlyZWN0b3J5IFwiL2Zvb1wiLCByZXZpZXcgeW91ciB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN3ZCBzZXR0aW5nLmAgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZm9ybWF0IGNvbnB0eSBmYWlsdXJlIGNvZGUgMTI2MCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHsgY29kZTogMTI2MCwgbWVzc2FnZTogJ0EgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgY3JlYXRlIHByb2Nlc3MsIGVycm9yIGNvZGU6IDEyNjApJyB9LCB7IGV4ZWN1dGFibGU6ICdmb28nIH0sIFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2gsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHsgY29kZTogMTI2MCwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGZhaWxlZCB0byBsYXVuY2g6IFdpbmRvd3MgY2Fubm90IG9wZW4gdGhpcyBwcm9ncmFtIGJlY2F1c2UgaXQgaGFzIGJlZW4gcHJldmVudGVkIGJ5IGEgc29mdHdhcmUgcmVzdHJpY3Rpb24gcG9saWN5LiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgb3BlbiBFdmVudCBWaWV3ZXIgb3IgY29udGFjdCB5b3VyIHN5c3RlbSBBZG1pbmlzdHJhdG9yLmAgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZm9ybWF0IGNvbnB0eSBsYXVuY2ggZmFpbHVyZScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0cGFyc2VFeGl0UmVzdWx0KHsgbWVzc2FnZTogJ0EgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgbGF1bmNoIGNvbnB0eSkuIFdpbnB0eSBoYXMgYmVlbiByZW1vdmVkLCBzZWUgaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vdXBkYXRlcy92MV8xMDkjX3JlbW92YWwtb2Ytd2lucHR5LXN1cHBvcnQgZm9yIG1vcmUgZGV0YWlscy4gWW91IGNhbiBhbHNvIHRyeSBlbmFibGluZyB0aGUgYHRlcm1pbmFsLmludGVncmF0ZWQud2luZG93c1VzZUNvbnB0eURsbGAgc2V0dGluZy4nIH0sIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IHVuZGVmaW5lZCwgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGZhaWxlZCB0byBsYXVuY2g6IEEgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgbGF1bmNoIGNvbnB0eSkuIFdpbnB0eSBoYXMgYmVlbiByZW1vdmVkLCBzZWUgaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vdXBkYXRlcy92MV8xMDkjX3JlbW92YWwtb2Ytd2lucHR5LXN1cHBvcnQgZm9yIG1vcmUgZGV0YWlscy4gWW91IGNhbiBhbHNvIHRyeSBlbmFibGluZyB0aGUgXFxgdGVybWluYWwuaW50ZWdyYXRlZC53aW5kb3dzVXNlQ29ucHR5RGxsXFxgIHNldHRpbmcuLmAgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZm9ybWF0IGdlbmVyaWMgZmFpbHVyZXMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHBhcnNlRXhpdFJlc3VsdCh7IGNvZGU6IDEyMywgbWVzc2FnZTogJ0EgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgY3JlYXRlIHByb2Nlc3MsIGVycm9yIGNvZGU6IDEyMyknIH0sIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDEyMywgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGZhaWxlZCB0byBsYXVuY2g6IEEgbmF0aXZlIGV4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgbGF1bmNoIChDYW5ub3QgY3JlYXRlIHByb2Nlc3MsIGVycm9yIGNvZGU6IDEyMykuYCB9XG5cdFx0XHQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRwYXJzZUV4aXRSZXN1bHQoeyBjb2RlOiAxMjMsIG1lc3NhZ2U6ICdmb28nIH0sIHt9LCBQcm9jZXNzU3RhdGUuS2lsbGVkRHVyaW5nTGF1bmNoLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR7IGNvZGU6IDEyMywgbWVzc2FnZTogYFRoZSB0ZXJtaW5hbCBwcm9jZXNzIGZhaWxlZCB0byBsYXVuY2g6IGZvby5gIH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnVGVybWluYWxMYWJlbENvbXB1dGVyJywgKCkgPT4ge1xuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCBjYXBhYmlsaXRpZXM6IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlSW5zdGFuY2UocGFydGlhbD86IFBhcnRpYWw8SVRlcm1pbmFsSW5zdGFuY2U+KTogUGljazxJVGVybWluYWxJbnN0YW5jZSwgJ3NoZWxsTGF1bmNoQ29uZmlnJyB8ICdzaGVsbFR5cGUnIHwgJ3VzZXJIb21lJyB8ICdjd2QnIHwgJ2luaXRpYWxDd2QnIHwgJ3Byb2Nlc3NOYW1lJyB8ICdzZXF1ZW5jZScgfCAnd29ya3NwYWNlRm9sZGVyJyB8ICdzdGF0aWNUaXRsZScgfCAnY2FwYWJpbGl0aWVzJyB8ICd0aXRsZScgfCAnZGVzY3JpcHRpb24nIHwgJ29zJz4ge1xuXHRcdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0XHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRcdGNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5Lk5haXZlQ3dkRGV0ZWN0aW9uLCBudWxsISk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZzoge30sXG5cdFx0XHRcdHNoZWxsVHlwZTogR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsLFxuXHRcdFx0XHRjd2Q6ICdjd2QnLFxuXHRcdFx0XHRpbml0aWFsQ3dkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb2Nlc3NOYW1lOiAnJyxcblx0XHRcdFx0c2VxdWVuY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0d29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0YXRpY1RpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNhcGFiaWxpdGllcyxcblx0XHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdHVzZXJIb21lOiAnL2hvbWUvdXNlcicsXG5cdFx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXgsXG5cdFx0XHRcdC4uLnBhcnRpYWxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRcdGNhcGFiaWxpdGllcyA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSk7XG5cdFx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5OYWl2ZUN3ZERldGVjdGlvbiwgbnVsbCEpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTGFiZWxDb21wdXRlcihjb25maWd1cmF0aW9uOiBhbnkpIHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoY29uZmlndXJhdGlvbikpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSkpKTtcblx0XHRcdHJldHVybiBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMYWJlbENvbXB1dGVyKSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgdG8gXCJcIiB3aGVuIHRoZSB0ZW1wbGF0ZSB2YXJpYWJsZXMgYXJlIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJycsIGRlc2NyaXB0aW9uOiAnJyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHByb2Nlc3NOYW1lOiAnJyB9KSk7XG5cdFx0XHQvLyBUT0RPOlxuXHRcdFx0Ly8gdGVybWluYWxMYWJlbENvbXB1dGVyLm9uTGFiZWxDaGFuZ2VkKGUgPT4ge1xuXHRcdFx0Ly8gXHRzdHJpY3RFcXVhbChlLnRpdGxlLCAnJyk7XG5cdFx0XHQvLyBcdHN0cmljdEVxdWFsKGUuZGVzY3JpcHRpb24sICcnKTtcblx0XHRcdC8vIH0pO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICcnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBjd2Qgd2hlbiBvdXRzaWRlIG9mIHVzZXJIb21lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7Y3dkfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIGN3ZDogUk9PVF8xIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgUk9PVF8xKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgUk9PVF8xKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBjd2Qgd2hlbiB1bmRlciB1c2VySG9tZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke2N3ZH0nLCBkZXNjcmlwdGlvbjogJyR7Y3dkfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBjd2Q6ICcvaG9tZS91c2VyL2Zvby9iYXInIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ34vZm9vL2JhcicpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnfi9mb28vYmFyJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgY3dkIHdoZW4gZXhhY3RseSBhdCB1c2VySG9tZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke2N3ZH0nLCBkZXNjcmlwdGlvbjogJyR7Y3dkfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBjd2Q6ICcvaG9tZS91c2VyJyB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICd+Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICd+Jyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBzaG9ydGVuIGN3ZCBvbiBXaW5kb3dzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7Y3dkfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIGN3ZDogJ0M6XFxcXFVzZXJzXFxcXHVzZXInLCB1c2VySG9tZTogJ0M6XFxcXFVzZXJzXFxcXHVzZXInLCBvczogT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnQzpcXFxcVXNlcnNcXFxcdXNlcicpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnQzpcXFxcVXNlcnNcXFxcdXNlcicpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIHdvcmtzcGFjZUZvbGRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke3dvcmtzcGFjZUZvbGRlcn0nLCBkZXNjcmlwdGlvbjogJyR7d29ya3NwYWNlRm9sZGVyfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3pzaCcsIHdvcmtzcGFjZUZvbGRlcjogeyB1cmk6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICdmb2xkZXInIH0pIH0gYXMgSVdvcmtzcGFjZUZvbGRlciB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdmb2xkZXInKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgJ2ZvbGRlcicpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIGxvY2FsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7bG9jYWx9JywgZGVzY3JpcHRpb246ICcke2xvY2FsfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3pzaCcsIHNoZWxsTGF1bmNoQ29uZmlnOiB7IHR5cGU6ICdMb2NhbCcgfSB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdMb2NhbCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnTG9jYWwnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBwcm9jZXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7cHJvY2Vzc30nLCBkZXNjcmlwdGlvbjogJyR7cHJvY2Vzc30nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgcHJvY2Vzc05hbWU6ICd6c2gnIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3pzaCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnenNoJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgc2VxdWVuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtzZXF1ZW5jZX0nLCBkZXNjcmlwdGlvbjogJyR7c2VxdWVuY2V9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHNlcXVlbmNlOiAnc2VxdWVuY2UnIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3NlcXVlbmNlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIuZGVzY3JpcHRpb24sICdzZXF1ZW5jZScpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXNvbHZlIGVtcHR5IHNlcXVlbmNlIHRvIHByb2Nlc3MgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke3NlcXVlbmNlfSR7c2VwYXJhdG9yfSR7cHJvY2Vzc30nLCBkZXNjcmlwdGlvbjogJyR7c2VxdWVuY2V9JyB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHByb2Nlc3NOYW1lOiAnenNoJywgc2VxdWVuY2U6ICcnIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3pzaCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgdGFzaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIH4gJywgdGl0bGU6ICcke3Byb2Nlc3N9JHtzZXBhcmF0b3J9JHt0YXNrfScsIGRlc2NyaXB0aW9uOiAnJHt0YXNrfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3pzaCcsIHNoZWxsTGF1bmNoQ29uZmlnOiB7IHR5cGU6ICdUYXNrJyB9IH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3pzaCB+IFRhc2snKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgJ1Rhc2snKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSBzZXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyB+ICcsIHRpdGxlOiAnJHtzZXBhcmF0b3J9JywgZGVzY3JpcHRpb246ICcke3NlcGFyYXRvcn0nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgcHJvY2Vzc05hbWU6ICd6c2gnLCBzaGVsbExhdW5jaENvbmZpZzogeyB0eXBlOiAnVGFzaycgfSB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICd6c2gnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgJycpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBhbHdheXMgcmV0dXJuIHN0YXRpYyB0aXRsZSB3aGVuIHNwZWNpZmllZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIH4gJywgdGl0bGU6ICcke3Byb2Nlc3N9JywgZGVzY3JpcHRpb246ICcke3dvcmtzcGFjZUZvbGRlcn0nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgcHJvY2Vzc05hbWU6ICdwcm9jZXNzJywgd29ya3NwYWNlRm9sZGVyOiB7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2ZvbGRlcicgfSkgfSBhcyBJV29ya3NwYWNlRm9sZGVyLCBzdGF0aWNUaXRsZTogJ215LXRpdGxlJyB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdteS10aXRsZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnZm9sZGVyJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBzaGVsbExhdW5jaENvbmZpZy50aXRsZVRlbXBsYXRlIGFzIHRlbXBsYXRlIHdoZW4gc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7cHJvY2Vzc30nLCBkZXNjcmlwdGlvbjogJyR7Y3dkfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBzZXF1ZW5jZTogJ215LXNlcXVlbmNlJywgcHJvY2Vzc05hbWU6ICd6c2gnLCBzaGVsbExhdW5jaENvbmZpZzogeyB0aXRsZVRlbXBsYXRlOiAnJHtzZXF1ZW5jZX0nIH0gfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnbXktc2VxdWVuY2UnKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci5kZXNjcmlwdGlvbiwgJ2N3ZCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgJHtzZXF1ZW5jZX0gZm9yIGFnZW50IENMSSBzaGVsbCB0eXBlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke3Byb2Nlc3N9JywgZGVzY3JpcHRpb246ICcke2N3ZH0nLCBhbGxvd0FnZW50Q2xpVGl0bGU6IHRydWUgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBzaGVsbFR5cGU6IEdlbmVyYWxTaGVsbFR5cGUuQ29waWxvdCwgc2VxdWVuY2U6ICdDb3BpbG90IEFnZW50JywgcHJvY2Vzc05hbWU6ICdjb3BpbG90JyB9KSk7XG5cdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdDb3BpbG90IEFnZW50Jyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHVzZSAke3NlcXVlbmNlfSBmb3IgR2VtaW5pIGFnZW50IENMSSBzaGVsbCB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgLSAnLCB0aXRsZTogJyR7cHJvY2Vzc30nLCBkZXNjcmlwdGlvbjogJyR7Y3dkfScsIGFsbG93QWdlbnRDbGlUaXRsZTogdHJ1ZSB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHNoZWxsVHlwZTogR2VuZXJhbFNoZWxsVHlwZS5HZW1pbmksIHNlcXVlbmNlOiAnR2VtaW5pIC0gbXktcHJvamVjdCcsIHByb2Nlc3NOYW1lOiAnbm9kZScgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAnR2VtaW5pIC0gbXktcHJvamVjdCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgJHtzZXF1ZW5jZX0gZm9yIENvbW1hbmQgQ29kZSBhZ2VudCBDTEkgc2hlbGwgdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIC0gJywgdGl0bGU6ICcke3Byb2Nlc3N9JywgZGVzY3JpcHRpb246ICcke2N3ZH0nLCBhbGxvd0FnZW50Q2xpVGl0bGU6IHRydWUgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBzaGVsbFR5cGU6IEdlbmVyYWxTaGVsbFR5cGUuQ29tbWFuZENvZGUsIHNlcXVlbmNlOiAnRml4IFBhcnNlciBCdWcnLCBwcm9jZXNzTmFtZTogJ25vZGUnIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ0ZpeCBQYXJzZXIgQnVnJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHByZWZlciBzaGVsbExhdW5jaENvbmZpZy50aXRsZVRlbXBsYXRlIG92ZXIgYWdlbnQgQ0xJIHNoZWxsIHR5cGUgb3ZlcnJpZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtwcm9jZXNzfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JywgYWxsb3dBZ2VudENsaVRpdGxlOiB0cnVlIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgc2hlbGxUeXBlOiBHZW5lcmFsU2hlbGxUeXBlLkNvcGlsb3QsIHNlcXVlbmNlOiAnQ29waWxvdCBBZ2VudCcsIHByb2Nlc3NOYW1lOiAnY29waWxvdCcsIHNoZWxsTGF1bmNoQ29uZmlnOiB7IHRpdGxlVGVtcGxhdGU6ICcke3Byb2Nlc3N9JyB9IH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ2NvcGlsb3QnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZmFsbCBiYWNrIHRvIGNvbmZpZ3VyZWQgdGl0bGUgd2hlbiBhbGxvd0FnZW50Q2xpVGl0bGUgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyAtICcsIHRpdGxlOiAnJHtwcm9jZXNzfScsIGRlc2NyaXB0aW9uOiAnJHtjd2R9JywgYWxsb3dBZ2VudENsaVRpdGxlOiBmYWxzZSB9IH0gfSB9KTtcblx0XHRcdHRlcm1pbmFsTGFiZWxDb21wdXRlci5yZWZyZXNoTGFiZWwoY3JlYXRlSW5zdGFuY2UoeyBjYXBhYmlsaXRpZXMsIHNoZWxsVHlwZTogR2VuZXJhbFNoZWxsVHlwZS5Db3BpbG90LCBzZXF1ZW5jZTogJ0NvcGlsb3QgQWdlbnQnLCBwcm9jZXNzTmFtZTogJ2NvcGlsb3QnIH0pKTtcblx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ2NvcGlsb3QnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcHJvdmlkZSBjd2RGb2xkZXIgZm9yIGFsbCBjd2RzIG9ubHkgd2hlbiBpbiBtdWx0aS1yb290JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWxMYWJlbENvbXB1dGVyID0gY3JlYXRlTGFiZWxDb21wdXRlcih7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHsgdGFiczogeyBzZXBhcmF0b3I6ICcgfiAnLCB0aXRsZTogJyR7cHJvY2Vzc30ke3NlcGFyYXRvcn0ke2N3ZEZvbGRlcn0nLCBkZXNjcmlwdGlvbjogJyR7Y3dkRm9sZGVyfScgfSB9IH0gfSk7XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3Byb2Nlc3MnLCB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiBST09UXzEgfSkgfSBhcyBJV29ya3NwYWNlRm9sZGVyLCBjd2Q6IFJPT1RfMSB9KSk7XG5cdFx0XHQvLyBzaW5nbGUtcm9vdCwgY3dkIGlzIHNhbWUgYXMgcm9vdFxuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAncHJvY2VzcycpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnJyk7XG5cdFx0XHQvLyBtdWx0aS1yb290XG5cdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIucmVmcmVzaExhYmVsKGNyZWF0ZUluc3RhbmNlKHsgY2FwYWJpbGl0aWVzLCBwcm9jZXNzTmFtZTogJ3Byb2Nlc3MnLCB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiBST09UXzEgfSkgfSBhcyBJV29ya3NwYWNlRm9sZGVyLCBjd2Q6IFJPT1RfMiB9KSk7XG5cdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHRlcm1pbmFsTGFiZWxDb21wdXRlci50aXRsZSwgJ3Byb2Nlc3MnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdwcm9jZXNzIH4gcm9vdDInKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAncm9vdDInKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgaGlkZSBjd2RGb2xkZXIgaW4gc2luZ2xlIGZvbGRlciB3b3Jrc3BhY2VzIHdoZW4gY3dkIG1hdGNoZXMgdGhlIHdvcmtzcGFjZVxcJ3MgZGVmYXVsdCBjd2QgZXZlbiB3aGVuIHNsYXNoZXMgZGlmZmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHRlcm1pbmFsTGFiZWxDb21wdXRlciA9IGNyZWF0ZUxhYmVsQ29tcHV0ZXIoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiB7IHRhYnM6IHsgc2VwYXJhdG9yOiAnIH4gJywgdGl0bGU6ICcke3Byb2Nlc3N9JHtzZXBhcmF0b3J9JHtjd2RGb2xkZXJ9JywgZGVzY3JpcHRpb246ICcke2N3ZEZvbGRlcn0nIH0gfSB9IH0pO1xuXHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgcHJvY2Vzc05hbWU6ICdwcm9jZXNzJywgd29ya3NwYWNlRm9sZGVyOiB7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogUk9PVF8xIH0pIH0gYXMgSVdvcmtzcGFjZUZvbGRlciwgY3dkOiBST09UXzEgfSkpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLnRpdGxlLCAncHJvY2VzcycpO1xuXHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAnJyk7XG5cdFx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0XHR0ZXJtaW5hbExhYmVsQ29tcHV0ZXIgPSBjcmVhdGVMYWJlbENvbXB1dGVyKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogeyB0YWJzOiB7IHNlcGFyYXRvcjogJyB+ICcsIHRpdGxlOiAnJHtwcm9jZXNzfSR7c2VwYXJhdG9yfSR7Y3dkRm9sZGVyfScsIGRlc2NyaXB0aW9uOiAnJHtjd2RGb2xkZXJ9JyB9IH0gfSB9KTtcblx0XHRcdFx0dGVybWluYWxMYWJlbENvbXB1dGVyLnJlZnJlc2hMYWJlbChjcmVhdGVJbnN0YW5jZSh7IGNhcGFiaWxpdGllcywgcHJvY2Vzc05hbWU6ICdwcm9jZXNzJywgd29ya3NwYWNlRm9sZGVyOiB7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogUk9PVF8xIH0pIH0gYXMgSVdvcmtzcGFjZUZvbGRlciwgY3dkOiBST09UXzIgfSkpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbCh0ZXJtaW5hbExhYmVsQ29tcHV0ZXIudGl0bGUsICdwcm9jZXNzIH4gcm9vdDInKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwodGVybWluYWxMYWJlbENvbXB1dGVyLmRlc2NyaXB0aW9uLCAncm9vdDInKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldEN3ZFJlc291cmNlJywgKCkgPT4ge1xuXHRcdGxldCBtb2NrRmlsZVNlcnZpY2U6IGFueTtcblx0XHRsZXQgbW9ja1BhdGhTZXJ2aWNlOiBhbnk7XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVNb2NrVGVybWluYWxJbnN0YW5jZShvcHRpb25zOiB7XG5cdFx0XHRjd2Q/OiBzdHJpbmc7XG5cdFx0XHRyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmc7XG5cdFx0XHRmaWxlRXhpc3RzPzogYm9vbGVhbjtcblx0XHRcdGZpbGVTZXJ2aWNlQ2FuSGFuZGxlPzogYm9vbGVhbjtcblx0XHR9KTogUGljazxJVGVybWluYWxJbnN0YW5jZSwgJ2dldEN3ZFJlc291cmNlJyB8ICdjYXBhYmlsaXRpZXMnIHwgJ3JlbW90ZUF1dGhvcml0eSc+IHtcblx0XHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSk7XG5cblx0XHRcdGlmIChvcHRpb25zLmN3ZCkge1xuXHRcdFx0XHRjb25zdCBtb2NrQ3dkRGV0ZWN0aW9uID0ge1xuXHRcdFx0XHRcdGdldEN3ZDogKCkgPT4gb3B0aW9ucy5jd2Rcblx0XHRcdFx0fTtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uLCBtb2NrQ3dkRGV0ZWN0aW9uIGFzIHVua25vd24gYXMgSUN3ZERldGVjdGlvbkNhcGFiaWxpdHkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb2NrIGZpbGUgc2VydmljZVxuXHRcdFx0bW9ja0ZpbGVTZXJ2aWNlID0ge1xuXHRcdFx0XHRjYW5IYW5kbGVSZXNvdXJjZTogYXN5bmMgKF9yZXNvdXJjZTogVVJJKSA9PiBvcHRpb25zLmZpbGVTZXJ2aWNlQ2FuSGFuZGxlICE9PSBmYWxzZSxcblx0XHRcdFx0ZXhpc3RzOiBhc3luYyAocmVzb3VyY2U6IFVSSSkgPT4gb3B0aW9ucy5maWxlRXhpc3RzICE9PSBmYWxzZVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gTW9jayBwYXRoIHNlcnZpY2Vcblx0XHRcdG1vY2tQYXRoU2VydmljZSA9IHtcblx0XHRcdFx0ZmlsZVVSSTogYXN5bmMgKHBhdGg6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFVSSS5wYXJzZShgdnNjb2RlLXJlbW90ZTovLyR7b3B0aW9ucy5yZW1vdGVBdXRob3JpdHl9JHtwYXRofWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gVVJJLmZpbGUocGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNhcGFiaWxpdGllcyxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiBvcHRpb25zLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0YXN5bmMgZ2V0Q3dkUmVzb3VyY2UoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0XHRjb25zdCBjd2QgPSB0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkN3ZERldGVjdGlvbik/LmdldEN3ZCgpO1xuXHRcdFx0XHRcdGlmICghY3dkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgcmVzb3VyY2U6IFVSSTtcblx0XHRcdFx0XHRpZiAodGhpcy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlID0gYXdhaXQgbW9ja1BhdGhTZXJ2aWNlLmZpbGVVUkkoY3dkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2UgPSBVUkkuZmlsZShjd2QpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWF3YWl0IG1vY2tGaWxlU2VydmljZS5jYW5IYW5kbGVSZXNvdXJjZShyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChhd2FpdCBtb2NrRmlsZVNlcnZpY2UuZXhpc3RzKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gbm8gQ3dkRGV0ZWN0aW9uIGNhcGFiaWxpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGNyZWF0ZU1vY2tUZXJtaW5hbEluc3RhbmNlKHt9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gQ3dkRGV0ZWN0aW9uIGNhcGFiaWxpdHkgcmV0dXJucyBubyBjd2QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGNyZWF0ZU1vY2tUZXJtaW5hbEluc3RhbmNlKHsgY3dkOiB1bmRlZmluZWQgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbmNlLmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIFVSSS5maWxlIGZvciBsb2NhbCB0ZXJtaW5hbCB3aGVuIGZpbGUgZXhpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdEN3ZCA9ICcvdGVzdC9wYXRoJztcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja1Rlcm1pbmFsSW5zdGFuY2UoeyBjd2Q6IHRlc3RDd2QsIGZpbGVFeGlzdHM6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbmNlLmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8ucGF0aCwgdGVzdEN3ZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIGZpbGUgZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0Q3dkID0gJy90ZXN0L25vbmV4aXN0ZW50Jztcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja1Rlcm1pbmFsSW5zdGFuY2UoeyBjd2Q6IHRlc3RDd2QsIGZpbGVFeGlzdHM6IGZhbHNlIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbnN0YW5jZS5nZXRDd2RSZXNvdXJjZSgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBwYXRoU2VydmljZS5maWxlVVJJIGZvciByZW1vdGUgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXN0Q3dkID0gJy90ZXN0L3JlbW90ZS9wYXRoJztcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gY3JlYXRlTW9ja1Rlcm1pbmFsSW5zdGFuY2Uoe1xuXHRcdFx0XHRjd2Q6IHRlc3RDd2QsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogJ3Rlc3QtcmVtb3RlJyxcblx0XHRcdFx0ZmlsZUV4aXN0czogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbmNlLmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LnNjaGVtZSwgJ3ZzY29kZS1yZW1vdGUnKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uYXV0aG9yaXR5LCAndGVzdC1yZW1vdGUnKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8ucGF0aCwgdGVzdEN3ZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIFdpbmRvd3MgcGF0aHMgY29ycmVjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdEN3ZCA9IGlzV2luZG93cyA/ICdDOlxcXFx0ZXN0XFxcXHBhdGgnIDogJy90ZXN0L3BhdGgnO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrVGVybWluYWxJbnN0YW5jZSh7IGN3ZDogdGVzdEN3ZCwgZmlsZUV4aXN0czogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uc2NoZW1lLCAnZmlsZScpO1xuXHRcdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LnBhdGgsICcvQzovdGVzdC9wYXRoJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LnBhdGgsIHRlc3RDd2QpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBjd2Qgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBjcmVhdGVNb2NrVGVybWluYWxJbnN0YW5jZSh7IGN3ZDogJycgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbmNlLmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIGZpbGVTZXJ2aWNlIGNhbm5vdCBoYW5kbGUgdGhlIHJlc291cmNlIChWUyBDb2RlIHdlYiBFTk9QUk8gc2NlbmFyaW8pJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGVzIHNlcnZlci1saW51eC14NjQtd2ViIHdoZXJlIHJlbW90ZUF1dGhvcml0eSBpcyBmYWxzeSBmcm9tIHRoZVxuXHRcdFx0Ly8gdGVybWluYWwncyBwZXJzcGVjdGl2ZSwgc28gVVJJLmZpbGUoKSBpcyBwcm9kdWNlZCBidXQgdGhlIGJyb3dzZXJcblx0XHRcdC8vIEZpbGVTZXJ2aWNlIGhhcyBubyBmaWxlOi8vIHByb3ZpZGVyIHJlZ2lzdGVyZWQuXG5cdFx0XHRjb25zdCB0ZXN0Q3dkID0gJy93b3Jrc3BhY2UvbXktcHJvamVjdCc7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGNyZWF0ZU1vY2tUZXJtaW5hbEluc3RhbmNlKHtcblx0XHRcdFx0Y3dkOiB0ZXN0Q3dkLFxuXHRcdFx0XHRmaWxlRXhpc3RzOiB0cnVlLFxuXHRcdFx0XHRmaWxlU2VydmljZUNhbkhhbmRsZTogZmFsc2UgIC8vIGZpbGU6Ly8gcHJvdmlkZXIgYWJzZW50XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUM3QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVyx1QkFBaUQ7QUFDckUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMEJBQXdEO0FBQ2pFLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0JBQTJELGdCQUFnQix3QkFBc0c7QUFFMUwsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBa0QsMEJBQTBCLHdCQUF3QjtBQUM3RyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGlCQUFpQixrQkFBa0IsNkJBQTZCO0FBQ3pFLFNB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
