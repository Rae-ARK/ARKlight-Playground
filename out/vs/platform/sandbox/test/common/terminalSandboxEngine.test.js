import { deepStrictEqual, ok, strictEqual } from "assert";
import { Emitter } from "../../../../base/common/event.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { arch } from "../../../../base/common/process.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { IFileService } from "../../../files/common/files.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { AgentNetworkDomainSettingId } from "../../../networkFilter/common/settings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../common/settings.js";
import { TerminalSandboxEngine } from "../../common/terminalSandboxEngine.js";
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from "../../common/terminalSandboxMxcRuntime.js";
import { TerminalSandboxPrerequisiteCheck, TerminalSandboxPreCheckRemediation } from "../../common/terminalSandboxService.js";
suite("TerminalSandboxEngine", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let sandboxSettings;
  let sandboxSettingsEmitter;
  let fileService;
  let createdFiles;
  let createFileCount;
  let createdFolders;
  function setSandboxSetting(key, value) {
    sandboxSettings.set(key, value);
    sandboxSettingsEmitter.fire();
  }
  class MockFileService {
    constructor() {
      this._realpaths = /* @__PURE__ */ new Map();
    }
    setRealpath(path, realpath) {
      this._realpaths.set(path, realpath);
    }
    async realpath(uri) {
      const realpath = this._realpaths.get(uri.path);
      return realpath ? uri.with({ path: realpath }) : void 0;
    }
    async createFile(uri, content) {
      createFileCount++;
      const contentString = content.toString();
      createdFiles.set(uri.path, contentString);
      createdFiles.set(uri.fsPath, contentString);
      if (/^\/[a-zA-Z]:/.test(uri.path)) {
        createdFiles.set(uri.path.slice(1).replace(/\//g, "\\"), contentString);
      }
      return {};
    }
    async createFolder(uri) {
      createdFolders.push(uri.path);
      return {};
    }
    async del(_uri) {
    }
  }
  function buildMockWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName = "vscode-terminal-sandbox", containment = "process") {
    const clearPolicy = policy.filesystem?.clearPolicyOnExit ?? true;
    const network = {
      defaultPolicy: policy.network?.allowOutbound ? "allow" : "block",
      ...policy.network?.allowLocalNetwork !== void 0 ? { allowLocalNetwork: policy.network.allowLocalNetwork } : {},
      ...policy.network ? { enforcementMode: "capabilities" } : {}
    };
    return {
      version: policy.version,
      containerId: containerName,
      containment,
      lifecycle: {
        destroyOnExit: true,
        preservePolicy: !clearPolicy
      },
      process: {
        commandLine,
        cwd: workingDirectory,
        timeout: policy.timeoutMs ?? 0
      },
      processContainer: {
        leastPrivilege: false,
        capabilities: policy.network?.allowOutbound ? ["internetClient"] : [],
        ui: {
          isolation: "container",
          desktopSystemControl: false,
          systemSettings: "none",
          ime: false
        }
      },
      filesystem: {
        readwritePaths: [...policy.filesystem?.readwritePaths ?? []],
        readonlyPaths: [...policy.filesystem?.readonlyPaths ?? []],
        deniedPaths: [...policy.filesystem?.deniedPaths ?? []]
      },
      network,
      ui: {
        disable: !(policy.ui?.allowWindows ?? false),
        clipboard: policy.ui?.clipboard ?? "none",
        injection: policy.ui?.allowInputInjection ?? false
      }
    };
  }
  function createHost(overrides = {}) {
    const rootsEmitter = new Emitter();
    const defaultRuntime = {
      appRoot: "/app",
      execPath: "/app/node",
      runAsNode: false
    };
    const host = {
      getOS: () => Promise.resolve(OperatingSystem.Linux),
      getRuntimeInfo: () => Promise.resolve(defaultRuntime),
      getUserHome: () => Promise.resolve(URI.file("/home/user")),
      getSandboxTempDir: () => Promise.resolve(URI.file("/home/user/.test-data/tmp")),
      getWorkspaceStorageReadRoot: () => Promise.resolve(void 0),
      getWriteRoots: () => [URI.file("/workspace")],
      onDidChangeRoots: rootsEmitter.event,
      checkSandboxDependencies: () => Promise.resolve({ bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true }),
      getWindowsMxcFilesystemPolicy: () => Promise.resolve(void 0),
      getWindowsMxcEnvironment: () => Promise.resolve(void 0),
      buildWindowsMxcSandboxPayload: (commandLine, policy, workingDirectory, containerName, containment) => Promise.resolve(buildMockWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment)),
      getSandboxSetting: (settingId) => sandboxSettings.has(settingId) ? sandboxSettings.get(settingId) : void 0,
      onDidChangeSandboxSettings: sandboxSettingsEmitter.event,
      ...overrides
    };
    return Object.assign(host, { rootsEmitter });
  }
  function createWindowsHost(overrides = {}) {
    return createHost({
      getOS: () => Promise.resolve(OperatingSystem.Windows),
      getRuntimeInfo: () => Promise.resolve({ appRoot: "C:\\app", arch: "x64" }),
      getUserHome: () => Promise.resolve(URI.from({ scheme: "file", path: "/c:/Users/user" })),
      getSandboxTempDir: () => Promise.resolve(URI.from({ scheme: "file", path: "/c:/Users/user/.test-data/tmp" })),
      getWorkspaceStorageReadRoot: () => Promise.resolve(URI.from({ scheme: "file", path: "/c:/Users/user/workspaceStorage/workspace-id" })),
      getWriteRoots: () => [URI.from({ scheme: "file", path: "/c:/workspace" })],
      getWindowsMxcFilesystemPolicy: () => Promise.resolve({ readonlyPaths: ["C:\\tools\\node", "C:\\tools\\python", "C:\\Users\\user\\AppData\\Local\\Programs\\Git"], readwritePaths: ["C:\\Users\\user\\AppData\\Local\\Temp"] }),
      getWindowsMxcEnvironment: () => Promise.resolve([
        "SystemRoot=C:\\Windows",
        "PATH=C:\\tools\\node;C:\\Windows\\System32",
        "ComSpec=C:\\Windows\\System32\\cmd.exe",
        "PATHEXT=.COM;.EXE;.BAT;.CMD;.PS1",
        "PSModulePath=C:\\Users\\user\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules",
        "USERPROFILE=C:\\Users\\user",
        "APPDATA=C:\\Users\\user\\AppData\\Roaming",
        "LOCALAPPDATA=C:\\Users\\user\\AppData\\Local",
        "PSHOME=C:\\Program Files\\PowerShell\\7"
      ]),
      ...overrides
    });
  }
  function normalizeWindowsPathForAssert(path) {
    return path.replace(/\\/g, "/").toLowerCase();
  }
  function enableWindowsSandbox() {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxEnabledValue.On);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
  }
  setup(() => {
    createdFiles = /* @__PURE__ */ new Map();
    createFileCount = 0;
    createdFolders = [];
    instantiationService = store.add(new TestInstantiationService());
    sandboxSettings = /* @__PURE__ */ new Map();
    sandboxSettingsEmitter = store.add(new Emitter());
    fileService = new MockFileService();
    sandboxSettings.set(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.On);
    sandboxSettings.set(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
  });
  test("runAsNode=true prefixes the wrapped command with ELECTRON_RUN_AS_NODE=1", async () => {
    const host = createHost({
      getRuntimeInfo: () => Promise.resolve({ appRoot: "/app", execPath: "/app/electron", runAsNode: true })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("echo hi");
    strictEqual(wrapped.isSandboxWrapped, true);
    ok(wrapped.command.startsWith("ELECTRON_RUN_AS_NODE=1 "), `Expected ELECTRON_RUN_AS_NODE=1 prefix. Actual: ${wrapped.command}`);
  });
  test("runAsNode=false omits the ELECTRON_RUN_AS_NODE=1 prefix", async () => {
    const host = createHost({
      getRuntimeInfo: () => Promise.resolve({ appRoot: "/app", execPath: "/app/node", runAsNode: false })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("echo hi");
    strictEqual(wrapped.isSandboxWrapped, true);
    ok(!wrapped.command.startsWith("ELECTRON_RUN_AS_NODE="), `Did not expect ELECTRON_RUN_AS_NODE prefix. Actual: ${wrapped.command}`);
  });
  test("wrapCommand adds ripgrep-universal platform-arch bin directory to PATH", async () => {
    const host = createHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("echo hi");
    ok(wrapped.command.includes(`/app/node_modules/@vscode/ripgrep-universal/bin/linux-${arch}`), `Expected ripgrep-universal platform-arch path in command. Actual: ${wrapped.command}`);
  });
  test("sandbox config enables PTY access by default on macOS", async () => {
    const host = createHost({ getOS: () => Promise.resolve(OperatingSystem.Macintosh) });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(config.allowPty, true);
  });
  test("sandbox config does not enable PTY access by default on Linux", async () => {
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(Object.prototype.hasOwnProperty.call(config, "allowPty"), false);
  });
  test("sandbox config respects explicitly disabled PTY access on macOS", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, { allowPty: false });
    const host = createHost({ getOS: () => Promise.resolve(OperatingSystem.Macintosh) });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(config.allowPty, false);
  });
  test("sandbox config preserves advanced runtime network settings when allowNetwork is enabled", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, {
      network: {
        allowAllUnixSockets: true,
        enabled: true
      }
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(config.network, {
      allowedDomains: [],
      deniedDomains: [],
      enabled: false,
      allowAllUnixSockets: true
    });
  });
  test("requestAllowNetwork keeps the command sandboxed and refreshes its network config", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const wrapped = await engine.wrapCommand("curl https://example.com", false, "bash", void 0, void 0, true);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const unrestrictedConfig = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
    deepStrictEqual(unrestrictedConfig.network, { allowedDomains: [], deniedDomains: [], enabled: false });
    await engine.wrapCommand("echo restricted again");
    const restrictedConfig = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(restrictedConfig.network, { allowedDomains: [], deniedDomains: [] });
  });
  test("requestAllowNetwork does not relax network access when per-command requests are disabled", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, false);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const wrapped = await engine.wrapCommand("curl https://example.com", false, "bash", void 0, void 0, true);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    strictEqual(wrapped.requiresAllowNetworkConfirmation, void 0);
    deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [] });
  });
  test("unsandboxed retry preserves the original working directory on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands, true);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    await engine.getSandboxConfigPath();
    const wrapped = await engine.wrapCommand("pwd", true, "bash", URI.file("/workspace/with spaces"));
    strictEqual(wrapped.isSandboxWrapped, false);
    ok(wrapped.command.includes(`/workspace/with spaces`), `Expected the unsandboxed command to include cwd. Actual: ${wrapped.command}`);
    ok(wrapped.command.includes(`&& pwd`), `Expected the unsandboxed command to change to cwd before execution. Actual: ${wrapped.command}`);
  });
  test("blocked domains request sandboxed network access before execution when enabled", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests, true);
    setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ["example.com"]);
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const wrapped = await engine.wrapCommand("curl https://example.com", false, "bash");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    strictEqual(wrapped.requiresAllowNetworkConfirmation, true);
    deepStrictEqual(wrapped.blockedDomains, ["example.com"]);
    deepStrictEqual(wrapped.deniedDomains, ["example.com"]);
    deepStrictEqual(config.network, { allowedDomains: [], deniedDomains: [], enabled: false });
  });
  test("onDidChangeRoots triggers a sandbox config rewrite on the next wrap", async () => {
    let writeRoots = [URI.file("/workspace-a")];
    const host = createHost({
      getWriteRoots: () => writeRoots
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.getSandboxConfigPath();
    await engine.wrapCommand("echo a");
    const initialWriteCount = createFileCount;
    writeRoots = [URI.file("/workspace-b")];
    host.rootsEmitter.fire();
    await engine.wrapCommand("echo b");
    ok(createFileCount > initialWriteCount, `Expected sandbox config to be rewritten after onDidChangeRoots (initial=${initialWriteCount}, after=${createFileCount})`);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.allowWrite.includes("/workspace-b"), "Refreshed config should include the new write root");
    ok(!config.filesystem.allowWrite.includes("/workspace-a"), "Refreshed config should drop the old write root");
  });
  test("always denies reads of the sandbox config file on Linux and macOS", async () => {
    for (const os of [OperatingSystem.Linux, OperatingSystem.Macintosh]) {
      const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({
        getOS: () => Promise.resolve(os)
      })));
      const configPath = await engine.getSandboxConfigPath();
      ok(configPath, "Config path should be defined");
      const tempDirPath = engine.getTempDir()?.path;
      ok(tempDirPath, "Temp dir path should be defined");
      const config = JSON.parse(createdFiles.get(configPath));
      deepStrictEqual({
        denyRead: config.filesystem.denyRead.includes(configPath),
        configAllowWrite: config.filesystem.allowWrite.includes(configPath),
        tempDirAllowWrite: config.filesystem.allowWrite.includes(tempDirPath)
      }, {
        denyRead: true,
        configAllowWrite: false,
        tempDirAllowWrite: true
      });
    }
  });
  test("preserves filesystem symlink paths and resolves their targets on Linux when writing the config", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowRead: ["~/read-link"],
      allowWrite: ["/write-link"],
      denyRead: ["~/deny-read-link"],
      denyWrite: ["/deny-write-link"]
    });
    fileService.setRealpath("/workspace-link", "/real/workspace");
    fileService.setRealpath("/write-link", "/real/write");
    fileService.setRealpath("/home/user/read-link", "/real/read");
    fileService.setRealpath("/home/user/deny-read-link", "/real/deny-read");
    fileService.setRealpath("/deny-write-link", "/real/deny-write");
    fileService.setRealpath("/home/user/.gnupg", "/real/gnupg");
    const host = createHost({
      getWriteRoots: () => [URI.file("/workspace-link")]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("git commit -S", false, void 0, void 0, [{ keyword: "git", args: ["commit", "-S"] }]);
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.allowWrite.includes("/workspace-link"), "Workspace write root symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/real/workspace"), "Workspace write root symlink target should be included");
    ok(config.filesystem.allowWrite.includes("/write-link"), "Configured allowWrite symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/real/write"), "Configured allowWrite symlink target should be included");
    ok(config.filesystem.allowRead.includes("/home/user/read-link"), "Configured allowRead should expand ~ and preserve the symlink");
    ok(config.filesystem.allowRead.includes("/real/read"), "Configured allowRead symlink target should be included");
    ok(config.filesystem.allowRead.includes("/home/user/.gnupg"), "Command runtime allowRead symlink should be preserved");
    ok(config.filesystem.allowRead.includes("/real/gnupg"), "Command runtime allowRead symlink target should be included");
    ok(config.filesystem.allowWrite.includes("/home/user/.gnupg"), "Command runtime allowWrite symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/real/gnupg"), "Command runtime allowWrite symlink target should be included");
    ok(config.filesystem.denyRead.includes("/home/user/deny-read-link"), "Configured denyRead should expand ~ and preserve the symlink");
    ok(config.filesystem.denyRead.includes("/real/deny-read"), "Configured denyRead symlink target should be included");
    ok(config.filesystem.denyWrite.includes("/deny-write-link"), "Configured denyWrite symlink should be preserved");
    ok(config.filesystem.denyWrite.includes("/real/deny-write"), "Configured denyWrite symlink target should be included");
  });
  test("keeps filesystem paths without symlinks when writing the config", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowRead: ["~/read-plain"],
      allowWrite: ["/write-plain"],
      denyRead: ["~/deny-read-plain"],
      denyWrite: ["/deny-write-plain"]
    });
    const host = createHost({
      getWriteRoots: () => [URI.file("/workspace-plain")]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.allowWrite.includes("/workspace-plain"), "Workspace write root without symlink should be preserved");
    ok(config.filesystem.allowWrite.includes("/write-plain"), "Configured allowWrite without symlink should be preserved");
    ok(config.filesystem.allowRead.includes("/home/user/read-plain"), "Configured allowRead without symlink should expand ~ and be preserved");
    ok(config.filesystem.denyRead.includes("/home/user/deny-read-plain"), "Configured denyRead without symlink should expand ~ and be preserved");
    ok(config.filesystem.denyWrite.includes("/deny-write-plain"), "Configured denyWrite without symlink should be preserved");
  });
  test("checkFileAccess validates write paths against allowWrite and denyWrite on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowWrite: ["/configured/write", "/glob/**/*.ts"],
      denyWrite: ["/workspace/blocked"]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const result = await engine.checkFileAccess("write", [
      "/workspace/file.txt",
      "/configured/write/file.txt",
      "/glob/nested/file.ts",
      "/outside/file.txt",
      "/workspace/blocked/file.txt"
    ]);
    deepStrictEqual(result, {
      allowed: false,
      denied: ["/outside/file.txt", "/workspace/blocked/file.txt"]
    });
  });
  test("checkFileAccess validates read paths against denyRead and allowRead on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowRead: ["~/.allowed-read"],
      allowWrite: ["~/.allowed-write"]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    const result = await engine.checkFileAccess("read", [
      "/home/user/private.txt",
      "/home/user/.allowed-read/config.json",
      "/home/user/.allowed-write/file.txt",
      "/etc/hosts"
    ]);
    deepStrictEqual(result, {
      allowed: false,
      denied: ["/home/user/private.txt"]
    });
  });
  test("checkFileAccess preserves symlink source and target permissions on Linux", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxLinuxFileSystem, {
      allowWrite: ["/write-link"]
    });
    fileService.setRealpath("/write-link", "/real/write");
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    deepStrictEqual(await engine.checkFileAccess("write", ["/write-link/file.txt", "/real/write/file.txt"]), {
      allowed: true,
      denied: []
    });
  });
  test("cleanupTempDir is a no-op when no temp dir was ever created", async () => {
    const host = createHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
    strictEqual(engine.getTempDir(), void 0);
    await engine.cleanupTempDir();
  });
  test("precheck inputs can disable sandboxing when default approval permission is disabled", async () => {
    const host = createHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: true }), true);
    strictEqual(await engine.isEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
    strictEqual(await engine.isSandboxAllowNetworkEnabled({ isDefaultApprovalPermissionEnabled: false }), false);
    strictEqual(await engine.getSandboxConfigPath(false, { isDefaultApprovalPermissionEnabled: false }), void 0);
    deepStrictEqual(await engine.checkForSandboxingPrereqs(false, { isDefaultApprovalPermissionEnabled: false }), {
      enabled: false,
      sandboxConfigPath: void 0,
      failedCheck: void 0
    });
    strictEqual(createFileCount, 0, "Disabled sandbox precheck should not create sandbox config files");
  });
  test("isEnabled returns false on Windows when Windows sandbox setting is disabled by default", async () => {
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled(), false);
    strictEqual(await engine.isSandboxAllowNetworkEnabled(), false);
    strictEqual(await engine.getSandboxConfigPath(), void 0);
  });
  test("isEnabled returns true on Windows when Windows sandbox setting is enabled even if global sandboxing is off", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
    enableWindowsSandbox();
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled(), true);
    strictEqual(await engine.isSandboxAllowNetworkEnabled(), true);
  });
  test("enabledWindows on value does not enable allowNetwork on Windows", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxEnabled, AgentSandboxEnabledValue.Off);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxEnabledValue.On);
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    strictEqual(await engine.isEnabled(), true);
    strictEqual(await engine.isSandboxAllowNetworkEnabled(), false);
  });
  test("wrapCommand uses MXC executable and writes MXC config on Windows", async () => {
    enableWindowsSandbox();
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const wrapped = await engine.wrapCommand("echo hello", false, "C:\\Program Files\\PowerShell\\7\\pwsh.exe", URI.from({ scheme: "file", path: "/c:/workspace" }));
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.isSandboxWrapped, true);
    ok(wrapped.command.startsWith(`& 'C:\\app\\node_modules\\@microsoft\\mxc-sdk\\bin\\x64\\wxc-exec.exe'`), `Expected MXC executable. Actual: ${wrapped.command}`);
    ok(wrapped.command.includes(` '${configPath}'`), `Expected wrapped command to pass the MXC config path. Actual: ${wrapped.command}`);
    strictEqual(config.version, "0.6.0-alpha");
    strictEqual(config.containment, "process");
    strictEqual(config.process.commandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "echo hello"');
    strictEqual(normalizeWindowsPathForAssert(config.process.cwd), "c:/workspace");
    strictEqual(config.ui.disable, false);
    ok(config.process.env.includes("SystemRoot=C:\\Windows"), "SystemRoot should be injected into the MXC process env");
    ok(config.process.env.includes("PATH=C:\\tools\\node;C:\\Windows\\System32"), "PATH should be injected into the MXC process env");
    ok(config.process.env.includes("ComSpec=C:\\Windows\\System32\\cmd.exe"), "ComSpec should be injected into the MXC process env");
    ok(config.process.env.includes("PATHEXT=.COM;.EXE;.BAT;.CMD;.PS1"), "PATHEXT should be injected into the MXC process env");
    ok(config.process.env.includes("PSModulePath=C:\\Users\\user\\Documents\\PowerShell\\Modules;C:\\Program Files\\PowerShell\\Modules"), "PSModulePath should be injected into the MXC process env");
    ok(config.process.env.includes("USERPROFILE=C:\\Users\\user"), "USERPROFILE should be injected into the MXC process env");
    ok(config.process.env.includes("APPDATA=C:\\Users\\user\\AppData\\Roaming"), "APPDATA should be injected into the MXC process env");
    ok(config.process.env.includes("LOCALAPPDATA=C:\\Users\\user\\AppData\\Local"), "LOCALAPPDATA should be injected into the MXC process env");
    ok(config.process.env.includes("PSHOME=C:\\Program Files\\PowerShell\\7"), "PSHOME should be injected into the MXC process env");
    deepStrictEqual(config.network, { defaultPolicy: "allow", enforcementMode: "capabilities" });
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/workspace"), "Workspace should be writable");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path).endsWith("/.test-data/tmp")), "Sandbox temp dir should be writable");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user/appdata/local/temp"), "MXC temporary files policy should add host temp path to writable paths");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path).endsWith("/.test-data/tmp")), "Sandbox temp dir should be readable through readonly paths");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/tools/node"), "MXC available tools policy should add tool paths to readonly paths");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/program files/powershell/7"), "Resolved PowerShell executable directory should be readable");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user/appdata/local/programs/git"), "MXC user profile policy should add user profile paths to readonly paths");
    ok(!config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user"), "User home should not be denied by default on Windows");
  });
  test("wrapCommand applies Windows filesystem setting to MXC config", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
      allowWrite: ["C:/configured/write"],
      allowRead: ["C:/configured/read"],
      denyRead: ["C:/configured/secret"]
    });
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const serializedConfig = createdFiles.get(configPath);
    const config = JSON.parse(serializedConfig);
    ok(serializedConfig.includes("C:\\\\configured\\\\write"), "Configured Windows allowWrite path should be escaped in the serialized MXC config");
    ok(serializedConfig.includes("C:\\\\configured\\\\read"), "Configured Windows allowRead path should be escaped in the serialized MXC config");
    ok(serializedConfig.includes("C:\\\\configured\\\\secret"), "Configured Windows denyRead path should be escaped in the serialized MXC config");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/write"), "Configured Windows allowWrite path should be writable");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/read"), "Configured Windows allowRead path should be readonly");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user/appdata/local/temp"), "Host temp path from Windows policy should be writable");
    ok(config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/secret"), "Configured Windows denyRead path should be denied");
    ok(!config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/users/user"), "User home should not be denied by default on Windows");
  });
  test("deduplicates Windows filesystem paths regardless of case or separator", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
      allowWrite: ["C:/configured/write"],
      allowRead: ["C:\\configured\\read"],
      denyRead: ["C:/configured/secret", "c:\\configured\\secret"]
    });
    const host = createWindowsHost({
      getWindowsMxcFilesystemPolicy: () => Promise.resolve({
        readwritePaths: ["c:\\configured\\write"],
        readonlyPaths: ["c:/configured/read"]
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    const matchingPaths = (paths, expectedPath) => paths.filter((path) => normalizeWindowsPathForAssert(path) === expectedPath);
    deepStrictEqual({
      readwrite: matchingPaths(config.filesystem.readwritePaths, "c:/configured/write"),
      readonly: matchingPaths(config.filesystem.readonlyPaths, "c:/configured/read"),
      denied: matchingPaths(config.filesystem.deniedPaths, "c:/configured/secret")
    }, {
      readwrite: ["C:\\configured\\write"],
      readonly: ["C:\\configured\\read"],
      denied: ["C:\\configured\\secret"]
    });
  });
  test("deduplicates resolved Windows paths regardless of case or separator", async () => {
    enableWindowsSandbox();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createWindowsHost()));
    await engine.getOS();
    const resolveFileSystemPaths = engine._resolveFileSystemPaths.bind(engine);
    deepStrictEqual(await resolveFileSystemPaths([
      "C:/configured/path",
      "c:\\configured\\path",
      "C:\\configured\\other-path"
    ]), [
      "C:/configured/path",
      "C:\\configured\\other-path"
    ]);
  });
  test("wrapCommand applies configured Windows MXC schema version", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsSchemaVersion, "0.5.0-alpha");
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createWindowsHost()));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(config.version, "0.5.0-alpha");
  });
  test("preserves Windows filesystem symlink paths and resolves their targets when writing MXC config", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsFileSystem, {
      allowWrite: ["C:\\configured\\write-link"],
      allowRead: ["C:\\configured\\read-link"],
      denyRead: ["C:\\configured\\secret-link"]
    });
    fileService.setRealpath("/c:/workspace-link", "/c:/real/workspace");
    fileService.setRealpath("/c:/configured/write-link", "/c:/real/configured-write");
    fileService.setRealpath("/c:/configured/read-link", "/c:/real/configured-read");
    fileService.setRealpath("/c:/configured/secret-link", "/c:/real/configured-secret");
    fileService.setRealpath("/c:/tools/node", "/c:/real/tools-node");
    const host = createWindowsHost({
      getWriteRoots: () => [URI.from({ scheme: "file", path: "/c:/workspace-link" })]
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/workspace-link"), "Workspace write root symlink should be preserved on Windows");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/workspace"), "Workspace write root symlink target should be included on Windows");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/write-link"), "Configured Windows allowWrite symlink should be preserved");
    ok(config.filesystem.readwritePaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/configured-write"), "Configured Windows allowWrite symlink target should be included");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/read-link"), "Configured Windows allowRead symlink should be preserved");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/configured-read"), "Configured Windows allowRead symlink target should be included");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/tools/node"), "Windows policy readonly symlink should be preserved");
    ok(config.filesystem.readonlyPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/tools-node"), "Windows policy readonly symlink target should be included");
    ok(config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/configured/secret-link"), "Configured Windows denyRead symlink should be preserved");
    ok(config.filesystem.deniedPaths.some((path) => normalizeWindowsPathForAssert(path) === "c:/real/configured-secret"), "Configured Windows denyRead symlink target should be included");
  });
  test("wrapCommand uses arm64 MXC executable on Windows arm64", async () => {
    enableWindowsSandbox();
    const host = createWindowsHost({
      getRuntimeInfo: () => Promise.resolve({ appRoot: "C:\\app", arch: "arm64" })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const wrapped = await engine.wrapCommand("echo hello", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(wrapped.command, `& 'C:\\app\\node_modules\\@microsoft\\mxc-sdk\\bin\\arm64\\wxc-exec.exe' '${configPath}'`);
    strictEqual(normalizeWindowsPathForAssert(config.process.cwd), "c:/workspace");
  });
  test("wrapCommand rewrites MXC config when Windows command changes", async () => {
    enableWindowsSandbox();
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("echo first", false, "C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    let configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const firstCommandLine = JSON.parse(createdFiles.get(configPath)).process.commandLine;
    strictEqual(firstCommandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "echo first"');
    await engine.wrapCommand("echo second", false, "C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const secondCommandLine = JSON.parse(createdFiles.get(configPath)).process.commandLine;
    strictEqual(secondCommandLine, '"C:\\Program Files\\PowerShell\\7\\pwsh.exe" -NoProfile -Command "echo second"');
  });
  test("allowNetwork maps to MXC allow network config on Windows", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxWindowsEnabled, AgentSandboxEnabledValue.On);
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAllowNetwork, true);
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("curl https://example.com", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(config.network, { defaultPolicy: "allow", enforcementMode: "capabilities" });
  });
  test("Windows MXC config ignores unsupported network host lists", async () => {
    enableWindowsSandbox();
    setSandboxSetting(AgentNetworkDomainSettingId.AllowedNetworkDomains, ["example.com"]);
    setSandboxSetting(AgentNetworkDomainSettingId.DeniedNetworkDomains, ["blocked.example.com"]);
    const host = createWindowsHost();
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    await engine.wrapCommand("curl https://example.com", false, "pwsh");
    const configPath = await engine.getSandboxConfigPath();
    ok(configPath, "Config path should be defined");
    const config = JSON.parse(createdFiles.get(configPath));
    deepStrictEqual(config.network, { defaultPolicy: "allow", enforcementMode: "capabilities" });
  });
  test("uses OS-specific filesystem absolute path detection", async () => {
    const linuxEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost()));
    await linuxEngine.getOS();
    const isLinuxAbsolutePath = linuxEngine._isAbsoluteFileSystemPath.bind(linuxEngine);
    strictEqual(isLinuxAbsolutePath("/home/user"), true);
    strictEqual(isLinuxAbsolutePath("relative/path"), false);
    strictEqual(isLinuxAbsolutePath("C:\\Users\\user"), false);
    const windowsEngine = store.add(instantiationService.createInstance(TerminalSandboxEngine, createHost({ getOS: () => Promise.resolve(OperatingSystem.Windows) })));
    await windowsEngine.getOS();
    const isWindowsAbsolutePath = windowsEngine._isAbsoluteFileSystemPath.bind(windowsEngine);
    strictEqual(isWindowsAbsolutePath("/Users/user"), true);
    strictEqual(isWindowsAbsolutePath("C:\\Users\\user"), true);
    strictEqual(isWindowsAbsolutePath("C:/Users/user"), true);
    strictEqual(isWindowsAbsolutePath("\\\\server\\share"), true);
    strictEqual(isWindowsAbsolutePath("relative\\path"), false);
  });
  test("checkForSandboxingPrereqs reports missing dependencies", async () => {
    let status = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true, dependencyInstallCommand: "sudo pacman -S --needed --noconfirm" };
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve(status)
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const result = await engine.checkForSandboxingPrereqs();
    strictEqual(result.enabled, true);
    strictEqual(result.failedCheck, "dependencies");
    strictEqual(result.missingDependencies?.[0], "bubblewrap");
    strictEqual(result.canInstallMissingDependencies, true);
    status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
    const result2 = await engine.checkForSandboxingPrereqs(true);
    strictEqual(result2.failedCheck, void 0);
  });
  test("checkForSandboxingPrereqs caches missing dependencies until force refresh", async () => {
    let callCount = 0;
    let status = { bubblewrapInstalled: false, bubblewrapUsable: false, socatInstalled: true };
    const host = createHost({
      checkSandboxDependencies: () => {
        callCount++;
        return Promise.resolve(status);
      }
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const first = await engine.checkForSandboxingPrereqs();
    const second = await engine.checkForSandboxingPrereqs();
    strictEqual(first.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
    strictEqual(second.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies);
    strictEqual(callCount, 1, "Missing dependencies should be checked once and cached");
    status = { bubblewrapInstalled: true, bubblewrapUsable: true, socatInstalled: true };
    const cached = await engine.checkForSandboxingPrereqs();
    strictEqual(cached.failedCheck, TerminalSandboxPrerequisiteCheck.Dependencies, "Non-forced checks should keep using the cached missing status");
    strictEqual(callCount, 1);
    const refreshed = await engine.checkForSandboxingPrereqs(true);
    strictEqual(refreshed.failedCheck, void 0);
    strictEqual(callCount, 2, "Force refresh should re-check dependencies after install or repair");
  });
  test("checkForSandboxingPrereqs reports remediation when bubblewrap is unusable", async () => {
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve({
        bubblewrapInstalled: true,
        bubblewrapUsable: false,
        bubblewrapError: "Creating new namespace failed",
        socatInstalled: true,
        apparmorRestrictsUnprivilegedUserNamespaces: true
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const result = await engine.checkForSandboxingPrereqs();
    strictEqual(result.failedCheck, TerminalSandboxPrerequisiteCheck.Bubblewrap);
    deepStrictEqual(result.remediations, [TerminalSandboxPreCheckRemediation.DisableUnprivilagedusernamespaceRestriction]);
    strictEqual(result.detail, "Creating new namespace failed");
    strictEqual(result.missingDependencies, void 0);
  });
  test("checkForSandboxingPrereqs enables weaker nested sandbox when AppArmor is not restricting user namespaces", async () => {
    setSandboxSetting(AgentSandboxSettingId.AgentSandboxAdvancedRuntime, { allowPty: false });
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve({
        bubblewrapInstalled: true,
        bubblewrapUsable: false,
        socatInstalled: true,
        apparmorRestrictsUnprivilegedUserNamespaces: false
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const result = await engine.checkForSandboxingPrereqs();
    const configPath = await engine.getSandboxConfigPath();
    const config = JSON.parse(createdFiles.get(configPath));
    strictEqual(result.failedCheck, void 0);
    strictEqual(config.enableWeakerNestedSandbox, true);
    strictEqual(config.allowPty, false);
  });
  test("checkForSandboxingPrereqs enables weaker nested sandbox after AppArmor remediation does not fix bubblewrap", async () => {
    const host = createHost({
      checkSandboxDependencies: () => Promise.resolve({
        bubblewrapInstalled: true,
        bubblewrapUsable: false,
        socatInstalled: true,
        apparmorRestrictsUnprivilegedUserNamespaces: true
      })
    });
    const engine = store.add(instantiationService.createInstance(TerminalSandboxEngine, host));
    const beforeRemediation = await engine.checkForSandboxingPrereqs();
    const afterRemediation = await engine.checkForSandboxingPrereqs(true);
    const config = JSON.parse(createdFiles.get(afterRemediation.sandboxConfigPath));
    strictEqual(beforeRemediation.failedCheck, TerminalSandboxPrerequisiteCheck.Bubblewrap);
    strictEqual(afterRemediation.failedCheck, void 0);
    strictEqual(config.enableWeakerNestedSandbox, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NhbmRib3gvdGVzdC9jb21tb24vdGVybWluYWxTYW5kYm94RW5naW5lLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYXJjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uL25ldHdvcmtGaWx0ZXIvY29tbW9uL3NldHRpbmdzLmpzJztcbmltcG9ydCB0eXBlIHsgSVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzLCBJV2luZG93c014Y0NvbmZpZywgSVdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5LCBJV2luZG93c014Y1BvbGljeUNvbnRhaW5tZW50LCBJV2luZG93c014Y1NhbmRib3hQb2xpY3kgfSBmcm9tICcuLi8uLi9jb21tb24vc2FuZGJveEhlbHBlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLCBBZ2VudFNhbmRib3hTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2FuZGJveEVuZ2luZUhvc3QsIElUZXJtaW5hbFNhbmRib3hSdW50aW1lSW5mbywgVGVybWluYWxTYW5kYm94RW5naW5lIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsU2FuZGJveEVuZ2luZS5qcyc7XG5pbXBvcnQgeyBJV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUsIFdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsU2FuZGJveE14Y1J1bnRpbWUuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2ssIFRlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxTYW5kYm94U2VydmljZS5qcyc7XG5cbnN1aXRlKCdUZXJtaW5hbFNhbmRib3hFbmdpbmUnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBzYW5kYm94U2V0dGluZ3M6IE1hcDxzdHJpbmcsIHVua25vd24+O1xuXHRsZXQgc2FuZGJveFNldHRpbmdzRW1pdHRlcjogRW1pdHRlcjx2b2lkPjtcblx0bGV0IGZpbGVTZXJ2aWNlOiBNb2NrRmlsZVNlcnZpY2U7XG5cdGxldCBjcmVhdGVkRmlsZXM6IE1hcDxzdHJpbmcsIHN0cmluZz47XG5cdGxldCBjcmVhdGVGaWxlQ291bnQ6IG51bWJlcjtcblx0bGV0IGNyZWF0ZWRGb2xkZXJzOiBzdHJpbmdbXTtcblxuXHRmdW5jdGlvbiBzZXRTYW5kYm94U2V0dGluZyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkIHtcblx0XHRzYW5kYm94U2V0dGluZ3Muc2V0KGtleSwgdmFsdWUpO1xuXHRcdHNhbmRib3hTZXR0aW5nc0VtaXR0ZXIuZmlyZSgpO1xuXHR9XG5cblx0Y2xhc3MgTW9ja0ZpbGVTZXJ2aWNlIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZWFscGF0aHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdFx0c2V0UmVhbHBhdGgocGF0aDogc3RyaW5nLCByZWFscGF0aDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHR0aGlzLl9yZWFscGF0aHMuc2V0KHBhdGgsIHJlYWxwYXRoKTtcblx0XHR9XG5cblx0XHRhc3luYyByZWFscGF0aCh1cmk6IFVSSSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRjb25zdCByZWFscGF0aCA9IHRoaXMuX3JlYWxwYXRocy5nZXQodXJpLnBhdGgpO1xuXHRcdFx0cmV0dXJuIHJlYWxwYXRoID8gdXJpLndpdGgoeyBwYXRoOiByZWFscGF0aCB9KSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhc3luYyBjcmVhdGVGaWxlKHVyaTogVVJJLCBjb250ZW50OiBWU0J1ZmZlcik6IFByb21pc2U8YW55PiB7XG5cdFx0XHRjcmVhdGVGaWxlQ291bnQrKztcblx0XHRcdGNvbnN0IGNvbnRlbnRTdHJpbmcgPSBjb250ZW50LnRvU3RyaW5nKCk7XG5cdFx0XHRjcmVhdGVkRmlsZXMuc2V0KHVyaS5wYXRoLCBjb250ZW50U3RyaW5nKTtcblx0XHRcdGNyZWF0ZWRGaWxlcy5zZXQodXJpLmZzUGF0aCwgY29udGVudFN0cmluZyk7XG5cdFx0XHRpZiAoL15cXC9bYS16QS1aXTovLnRlc3QodXJpLnBhdGgpKSB7XG5cdFx0XHRcdGNyZWF0ZWRGaWxlcy5zZXQodXJpLnBhdGguc2xpY2UoMSkucmVwbGFjZSgvXFwvL2csICdcXFxcJyksIGNvbnRlbnRTdHJpbmcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRhc3luYyBjcmVhdGVGb2xkZXIodXJpOiBVUkkpOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0Y3JlYXRlZEZvbGRlcnMucHVzaCh1cmkucGF0aCk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGFzeW5jIGRlbChfdXJpOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHR9XG5cblx0ZnVuY3Rpb24gYnVpbGRNb2NrV2luZG93c014Y1NhbmRib3hQYXlsb2FkKGNvbW1hbmRMaW5lOiBzdHJpbmcsIHBvbGljeTogSVdpbmRvd3NNeGNTYW5kYm94UG9saWN5LCB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nLCBjb250YWluZXJOYW1lOiBzdHJpbmcgPSAndnNjb2RlLXRlcm1pbmFsLXNhbmRib3gnLCBjb250YWlubWVudDogSVdpbmRvd3NNeGNQb2xpY3lDb250YWlubWVudCA9ICdwcm9jZXNzJyk6IElXaW5kb3dzTXhjQ29uZmlnIHtcblx0XHRjb25zdCBjbGVhclBvbGljeSA9IHBvbGljeS5maWxlc3lzdGVtPy5jbGVhclBvbGljeU9uRXhpdCA/PyB0cnVlO1xuXHRcdGNvbnN0IG5ldHdvcmsgPSB7XG5cdFx0XHRkZWZhdWx0UG9saWN5OiBwb2xpY3kubmV0d29yaz8uYWxsb3dPdXRib3VuZCA/ICdhbGxvdycgOiAnYmxvY2snIGFzICdhbGxvdycgfCAnYmxvY2snLFxuXHRcdFx0Li4uKHBvbGljeS5uZXR3b3JrPy5hbGxvd0xvY2FsTmV0d29yayAhPT0gdW5kZWZpbmVkID8geyBhbGxvd0xvY2FsTmV0d29yazogcG9saWN5Lm5ldHdvcmsuYWxsb3dMb2NhbE5ldHdvcmsgfSA6IHt9KSxcblx0XHRcdC4uLihwb2xpY3kubmV0d29yayA/IHsgZW5mb3JjZW1lbnRNb2RlOiAnY2FwYWJpbGl0aWVzJyBhcyBjb25zdCB9IDoge30pLFxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHZlcnNpb246IHBvbGljeS52ZXJzaW9uLFxuXHRcdFx0Y29udGFpbmVySWQ6IGNvbnRhaW5lck5hbWUsXG5cdFx0XHRjb250YWlubWVudCxcblx0XHRcdGxpZmVjeWNsZToge1xuXHRcdFx0XHRkZXN0cm95T25FeGl0OiB0cnVlLFxuXHRcdFx0XHRwcmVzZXJ2ZVBvbGljeTogIWNsZWFyUG9saWN5LFxuXHRcdFx0fSxcblx0XHRcdHByb2Nlc3M6IHtcblx0XHRcdFx0Y29tbWFuZExpbmUsXG5cdFx0XHRcdGN3ZDogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0dGltZW91dDogcG9saWN5LnRpbWVvdXRNcyA/PyAwLFxuXHRcdFx0fSxcblx0XHRcdHByb2Nlc3NDb250YWluZXI6IHtcblx0XHRcdFx0bGVhc3RQcml2aWxlZ2U6IGZhbHNlLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHBvbGljeS5uZXR3b3JrPy5hbGxvd091dGJvdW5kID8gWydpbnRlcm5ldENsaWVudCddIDogW10sXG5cdFx0XHRcdHVpOiB7XG5cdFx0XHRcdFx0aXNvbGF0aW9uOiAnY29udGFpbmVyJyxcblx0XHRcdFx0XHRkZXNrdG9wU3lzdGVtQ29udHJvbDogZmFsc2UsXG5cdFx0XHRcdFx0c3lzdGVtU2V0dGluZ3M6ICdub25lJyxcblx0XHRcdFx0XHRpbWU6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGZpbGVzeXN0ZW06IHtcblx0XHRcdFx0cmVhZHdyaXRlUGF0aHM6IFsuLi4ocG9saWN5LmZpbGVzeXN0ZW0/LnJlYWR3cml0ZVBhdGhzID8/IFtdKV0sXG5cdFx0XHRcdHJlYWRvbmx5UGF0aHM6IFsuLi4ocG9saWN5LmZpbGVzeXN0ZW0/LnJlYWRvbmx5UGF0aHMgPz8gW10pXSxcblx0XHRcdFx0ZGVuaWVkUGF0aHM6IFsuLi4ocG9saWN5LmZpbGVzeXN0ZW0/LmRlbmllZFBhdGhzID8/IFtdKV0sXG5cdFx0XHR9LFxuXHRcdFx0bmV0d29yayxcblx0XHRcdHVpOiB7XG5cdFx0XHRcdGRpc2FibGU6ICEocG9saWN5LnVpPy5hbGxvd1dpbmRvd3MgPz8gZmFsc2UpLFxuXHRcdFx0XHRjbGlwYm9hcmQ6IHBvbGljeS51aT8uY2xpcGJvYXJkID8/ICdub25lJyxcblx0XHRcdFx0aW5qZWN0aW9uOiBwb2xpY3kudWk/LmFsbG93SW5wdXRJbmplY3Rpb24gPz8gZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVIb3N0KG92ZXJyaWRlczogUGFydGlhbDxJVGVybWluYWxTYW5kYm94RW5naW5lSG9zdD4gPSB7fSk6IElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0ICYgeyByb290c0VtaXR0ZXI6IEVtaXR0ZXI8dm9pZD4gfSB7XG5cdFx0Y29uc3Qgcm9vdHNFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRjb25zdCBkZWZhdWx0UnVudGltZTogSVRlcm1pbmFsU2FuZGJveFJ1bnRpbWVJbmZvID0ge1xuXHRcdFx0YXBwUm9vdDogJy9hcHAnLFxuXHRcdFx0ZXhlY1BhdGg6ICcvYXBwL25vZGUnLFxuXHRcdFx0cnVuQXNOb2RlOiBmYWxzZSxcblx0XHR9O1xuXHRcdGNvbnN0IGhvc3Q6IElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0ID0ge1xuXHRcdFx0Z2V0T1M6ICgpID0+IFByb21pc2UucmVzb2x2ZShPcGVyYXRpbmdTeXN0ZW0uTGludXgpLFxuXHRcdFx0Z2V0UnVudGltZUluZm86ICgpID0+IFByb21pc2UucmVzb2x2ZShkZWZhdWx0UnVudGltZSksXG5cdFx0XHRnZXRVc2VySG9tZTogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFVSSS5maWxlKCcvaG9tZS91c2VyJykpLFxuXHRcdFx0Z2V0U2FuZGJveFRlbXBEaXI6ICgpID0+IFByb21pc2UucmVzb2x2ZShVUkkuZmlsZSgnL2hvbWUvdXNlci8udGVzdC1kYXRhL3RtcCcpKSxcblx0XHRcdGdldFdvcmtzcGFjZVN0b3JhZ2VSZWFkUm9vdDogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCksXG5cdFx0XHRnZXRXcml0ZVJvb3RzOiAoKSA9PiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UnKV0sXG5cdFx0XHRvbkRpZENoYW5nZVJvb3RzOiByb290c0VtaXR0ZXIuZXZlbnQsXG5cdFx0XHRjaGVja1NhbmRib3hEZXBlbmRlbmNpZXM6ICgpOiBQcm9taXNlPElTYW5kYm94RGVwZW5kZW5jeVN0YXR1cyB8IHVuZGVmaW5lZD4gPT4gUHJvbWlzZS5yZXNvbHZlKHsgYnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSwgYnViYmxld3JhcFVzYWJsZTogdHJ1ZSwgc29jYXRJbnN0YWxsZWQ6IHRydWUgfSksXG5cdFx0XHRnZXRXaW5kb3dzTXhjRmlsZXN5c3RlbVBvbGljeTogKCk6IFByb21pc2U8SVdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5IHwgdW5kZWZpbmVkPiA9PiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKSxcblx0XHRcdGdldFdpbmRvd3NNeGNFbnZpcm9ubWVudDogKCk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+ID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpLFxuXHRcdFx0YnVpbGRXaW5kb3dzTXhjU2FuZGJveFBheWxvYWQ6IChjb21tYW5kTGluZSwgcG9saWN5LCB3b3JraW5nRGlyZWN0b3J5LCBjb250YWluZXJOYW1lLCBjb250YWlubWVudCk6IFByb21pc2U8SVdpbmRvd3NNeGNDb25maWcgfCB1bmRlZmluZWQ+ID0+IFByb21pc2UucmVzb2x2ZShidWlsZE1vY2tXaW5kb3dzTXhjU2FuZGJveFBheWxvYWQoY29tbWFuZExpbmUsIHBvbGljeSwgd29ya2luZ0RpcmVjdG9yeSwgY29udGFpbmVyTmFtZSwgY29udGFpbm1lbnQpKSxcblx0XHRcdGdldFNhbmRib3hTZXR0aW5nOiA8VD4oc2V0dGluZ0lkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkID0+IHNhbmRib3hTZXR0aW5ncy5oYXMoc2V0dGluZ0lkKSA/IHNhbmRib3hTZXR0aW5ncy5nZXQoc2V0dGluZ0lkKSBhcyBUIDogdW5kZWZpbmVkLFxuXHRcdFx0b25EaWRDaGFuZ2VTYW5kYm94U2V0dGluZ3M6IHNhbmRib3hTZXR0aW5nc0VtaXR0ZXIuZXZlbnQsXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fTtcblx0XHRyZXR1cm4gT2JqZWN0LmFzc2lnbihob3N0LCB7IHJvb3RzRW1pdHRlciB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdpbmRvd3NIb3N0KG92ZXJyaWRlczogUGFydGlhbDxJVGVybWluYWxTYW5kYm94RW5naW5lSG9zdD4gPSB7fSk6IElUZXJtaW5hbFNhbmRib3hFbmdpbmVIb3N0ICYgeyByb290c0VtaXR0ZXI6IEVtaXR0ZXI8dm9pZD4gfSB7XG5cdFx0cmV0dXJuIGNyZWF0ZUhvc3Qoe1xuXHRcdFx0Z2V0T1M6ICgpID0+IFByb21pc2UucmVzb2x2ZShPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksXG5cdFx0XHRnZXRSdW50aW1lSW5mbzogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHsgYXBwUm9vdDogJ0M6XFxcXGFwcCcsIGFyY2g6ICd4NjQnIH0pLFxuXHRcdFx0Z2V0VXNlckhvbWU6ICgpID0+IFByb21pc2UucmVzb2x2ZShVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL2M6L1VzZXJzL3VzZXInIH0pKSxcblx0XHRcdGdldFNhbmRib3hUZW1wRGlyOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy9jOi9Vc2Vycy91c2VyLy50ZXN0LWRhdGEvdG1wJyB9KSksXG5cdFx0XHRnZXRXb3Jrc3BhY2VTdG9yYWdlUmVhZFJvb3Q6ICgpID0+IFByb21pc2UucmVzb2x2ZShVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL2M6L1VzZXJzL3VzZXIvd29ya3NwYWNlU3RvcmFnZS93b3Jrc3BhY2UtaWQnIH0pKSxcblx0XHRcdGdldFdyaXRlUm9vdHM6ICgpID0+IFtVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL2M6L3dvcmtzcGFjZScgfSldLFxuXHRcdFx0Z2V0V2luZG93c014Y0ZpbGVzeXN0ZW1Qb2xpY3k6ICgpID0+IFByb21pc2UucmVzb2x2ZSh7IHJlYWRvbmx5UGF0aHM6IFsnQzpcXFxcdG9vbHNcXFxcbm9kZScsICdDOlxcXFx0b29sc1xcXFxweXRob24nLCAnQzpcXFxcVXNlcnNcXFxcdXNlclxcXFxBcHBEYXRhXFxcXExvY2FsXFxcXFByb2dyYW1zXFxcXEdpdCddLCByZWFkd3JpdGVQYXRoczogWydDOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXEFwcERhdGFcXFxcTG9jYWxcXFxcVGVtcCddIH0pLFxuXHRcdFx0Z2V0V2luZG93c014Y0Vudmlyb25tZW50OiAoKSA9PiBQcm9taXNlLnJlc29sdmUoW1xuXHRcdFx0XHQnU3lzdGVtUm9vdD1DOlxcXFxXaW5kb3dzJyxcblx0XHRcdFx0J1BBVEg9QzpcXFxcdG9vbHNcXFxcbm9kZTtDOlxcXFxXaW5kb3dzXFxcXFN5c3RlbTMyJyxcblx0XHRcdFx0J0NvbVNwZWM9QzpcXFxcV2luZG93c1xcXFxTeXN0ZW0zMlxcXFxjbWQuZXhlJyxcblx0XHRcdFx0J1BBVEhFWFQ9LkNPTTsuRVhFOy5CQVQ7LkNNRDsuUFMxJyxcblx0XHRcdFx0J1BTTW9kdWxlUGF0aD1DOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXERvY3VtZW50c1xcXFxQb3dlclNoZWxsXFxcXE1vZHVsZXM7QzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXE1vZHVsZXMnLFxuXHRcdFx0XHQnVVNFUlBST0ZJTEU9QzpcXFxcVXNlcnNcXFxcdXNlcicsXG5cdFx0XHRcdCdBUFBEQVRBPUM6XFxcXFVzZXJzXFxcXHVzZXJcXFxcQXBwRGF0YVxcXFxSb2FtaW5nJyxcblx0XHRcdFx0J0xPQ0FMQVBQREFUQT1DOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXEFwcERhdGFcXFxcTG9jYWwnLFxuXHRcdFx0XHQnUFNIT01FPUM6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3J1xuXHRcdFx0XSksXG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBwYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKS50b0xvd2VyQ2FzZSgpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZW5hYmxlV2luZG93c1NhbmRib3goKTogdm9pZCB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT24pO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmssIHRydWUpO1xuXHR9XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNyZWF0ZWRGaWxlcyA9IG5ldyBNYXAoKTtcblx0XHRjcmVhdGVGaWxlQ291bnQgPSAwO1xuXHRcdGNyZWF0ZWRGb2xkZXJzID0gW107XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRzYW5kYm94U2V0dGluZ3MgPSBuZXcgTWFwKCk7XG5cdFx0c2FuZGJveFNldHRpbmdzRW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRmaWxlU2VydmljZSA9IG5ldyBNb2NrRmlsZVNlcnZpY2UoKTtcblxuXHRcdHNhbmRib3hTZXR0aW5ncy5zZXQoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQsIEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbik7XG5cdFx0c2FuZGJveFNldHRpbmdzLnNldChBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsIHRydWUpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bkFzTm9kZT10cnVlIHByZWZpeGVzIHRoZSB3cmFwcGVkIGNvbW1hbmQgd2l0aCBFTEVDVFJPTl9SVU5fQVNfTk9ERT0xJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGdldFJ1bnRpbWVJbmZvOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoeyBhcHBSb290OiAnL2FwcCcsIGV4ZWNQYXRoOiAnL2FwcC9lbGVjdHJvbicsIHJ1bkFzTm9kZTogdHJ1ZSB9KSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cdFx0YXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cblx0XHRjb25zdCB3cmFwcGVkID0gYXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIGhpJyk7XG5cblx0XHRzdHJpY3RFcXVhbCh3cmFwcGVkLmlzU2FuZGJveFdyYXBwZWQsIHRydWUpO1xuXHRcdG9rKHdyYXBwZWQuY29tbWFuZC5zdGFydHNXaXRoKCdFTEVDVFJPTl9SVU5fQVNfTk9ERT0xICcpLCBgRXhwZWN0ZWQgRUxFQ1RST05fUlVOX0FTX05PREU9MSBwcmVmaXguIEFjdHVhbDogJHt3cmFwcGVkLmNvbW1hbmR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bkFzTm9kZT1mYWxzZSBvbWl0cyB0aGUgRUxFQ1RST05fUlVOX0FTX05PREU9MSBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0Z2V0UnVudGltZUluZm86ICgpID0+IFByb21pc2UucmVzb2x2ZSh7IGFwcFJvb3Q6ICcvYXBwJywgZXhlY1BhdGg6ICcvYXBwL25vZGUnLCBydW5Bc05vZGU6IGZhbHNlIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblx0XHRhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGknKTtcblxuXHRcdHN0cmljdEVxdWFsKHdyYXBwZWQuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0b2soIXdyYXBwZWQuY29tbWFuZC5zdGFydHNXaXRoKCdFTEVDVFJPTl9SVU5fQVNfTk9ERT0nKSwgYERpZCBub3QgZXhwZWN0IEVMRUNUUk9OX1JVTl9BU19OT0RFIHByZWZpeC4gQWN0dWFsOiAke3dyYXBwZWQuY29tbWFuZH1gKTtcblx0fSk7XG5cblx0dGVzdCgnd3JhcENvbW1hbmQgYWRkcyByaXBncmVwLXVuaXZlcnNhbCBwbGF0Zm9ybS1hcmNoIGJpbiBkaXJlY3RvcnkgdG8gUEFUSCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblx0XHRhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGknKTtcblxuXHRcdG9rKHdyYXBwZWQuY29tbWFuZC5pbmNsdWRlcyhgL2FwcC9ub2RlX21vZHVsZXMvQHZzY29kZS9yaXBncmVwLXVuaXZlcnNhbC9iaW4vbGludXgtJHthcmNofWApLCBgRXhwZWN0ZWQgcmlwZ3JlcC11bml2ZXJzYWwgcGxhdGZvcm0tYXJjaCBwYXRoIGluIGNvbW1hbmQuIEFjdHVhbDogJHt3cmFwcGVkLmNvbW1hbmR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NhbmRib3ggY29uZmlnIGVuYWJsZXMgUFRZIGFjY2VzcyBieSBkZWZhdWx0IG9uIG1hY09TJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgZ2V0T1M6ICgpID0+IFByb21pc2UucmVzb2x2ZShPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRzdHJpY3RFcXVhbChjb25maWcuYWxsb3dQdHksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW5kYm94IGNvbmZpZyBkb2VzIG5vdCBlbmFibGUgUFRZIGFjY2VzcyBieSBkZWZhdWx0IG9uIExpbnV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3QoKSkpO1xuXG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0c3RyaWN0RXF1YWwoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGNvbmZpZywgJ2FsbG93UHR5JyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2FuZGJveCBjb25maWcgcmVzcGVjdHMgZXhwbGljaXRseSBkaXNhYmxlZCBQVFkgYWNjZXNzIG9uIG1hY09TJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBZHZhbmNlZFJ1bnRpbWUsIHsgYWxsb3dQdHk6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgZ2V0T1M6ICgpID0+IFByb21pc2UucmVzb2x2ZShPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRzdHJpY3RFcXVhbChjb25maWcuYWxsb3dQdHksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2FuZGJveCBjb25maWcgcHJlc2VydmVzIGFkdmFuY2VkIHJ1bnRpbWUgbmV0d29yayBzZXR0aW5ncyB3aGVuIGFsbG93TmV0d29yayBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmssIHRydWUpO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBZHZhbmNlZFJ1bnRpbWUsIHtcblx0XHRcdG5ldHdvcms6IHtcblx0XHRcdFx0YWxsb3dBbGxVbml4U29ja2V0czogdHJ1ZSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlSG9zdCgpKSk7XG5cblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoY29uZmlnLm5ldHdvcmssIHtcblx0XHRcdGFsbG93ZWREb21haW5zOiBbXSxcblx0XHRcdGRlbmllZERvbWFpbnM6IFtdLFxuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRhbGxvd0FsbFVuaXhTb2NrZXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0QWxsb3dOZXR3b3JrIGtlZXBzIHRoZSBjb21tYW5kIHNhbmRib3hlZCBhbmQgcmVmcmVzaGVzIGl0cyBuZXR3b3JrIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsIHRydWUpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3QoKSkpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnY3VybCBodHRwczovL2V4YW1wbGUuY29tJywgZmFsc2UsICdiYXNoJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCB1bnJlc3RyaWN0ZWRDb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdHN0cmljdEVxdWFsKHdyYXBwZWQuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5yZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbiwgdHJ1ZSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHVucmVzdHJpY3RlZENvbmZpZy5uZXR3b3JrLCB7IGFsbG93ZWREb21haW5zOiBbXSwgZGVuaWVkRG9tYWluczogW10sIGVuYWJsZWQ6IGZhbHNlIH0pO1xuXG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIHJlc3RyaWN0ZWQgYWdhaW4nKTtcblx0XHRjb25zdCByZXN0cmljdGVkQ29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3RyaWN0ZWRDb25maWcubmV0d29yaywgeyBhbGxvd2VkRG9tYWluczogW10sIGRlbmllZERvbWFpbnM6IFtdIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0QWxsb3dOZXR3b3JrIGRvZXMgbm90IHJlbGF4IG5ldHdvcmsgYWNjZXNzIHdoZW4gcGVyLWNvbW1hbmQgcmVxdWVzdHMgYXJlIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cywgZmFsc2UpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGNyZWF0ZUhvc3QoKSkpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnY3VybCBodHRwczovL2V4YW1wbGUuY29tJywgZmFsc2UsICdiYXNoJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdHN0cmljdEVxdWFsKHdyYXBwZWQuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5yZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwoY29uZmlnLm5ldHdvcmssIHsgYWxsb3dlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSB9KTtcblx0fSk7XG5cblx0dGVzdCgndW5zYW5kYm94ZWQgcmV0cnkgcHJlc2VydmVzIHRoZSBvcmlnaW5hbCB3b3JraW5nIGRpcmVjdG9yeSBvbiBMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLCB0cnVlKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KCkpKTtcblx0XHRhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ3B3ZCcsIHRydWUsICdiYXNoJywgVVJJLmZpbGUoJy93b3Jrc3BhY2Uvd2l0aCBzcGFjZXMnKSk7XG5cblx0XHRzdHJpY3RFcXVhbCh3cmFwcGVkLmlzU2FuZGJveFdyYXBwZWQsIGZhbHNlKTtcblx0XHRvayh3cmFwcGVkLmNvbW1hbmQuaW5jbHVkZXMoYC93b3Jrc3BhY2Uvd2l0aCBzcGFjZXNgKSwgYEV4cGVjdGVkIHRoZSB1bnNhbmRib3hlZCBjb21tYW5kIHRvIGluY2x1ZGUgY3dkLiBBY3R1YWw6ICR7d3JhcHBlZC5jb21tYW5kfWApO1xuXHRcdG9rKHdyYXBwZWQuY29tbWFuZC5pbmNsdWRlcyhgJiYgcHdkYCksIGBFeHBlY3RlZCB0aGUgdW5zYW5kYm94ZWQgY29tbWFuZCB0byBjaGFuZ2UgdG8gY3dkIGJlZm9yZSBleGVjdXRpb24uIEFjdHVhbDogJHt3cmFwcGVkLmNvbW1hbmR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jsb2NrZWQgZG9tYWlucyByZXF1ZXN0IHNhbmRib3hlZCBuZXR3b3JrIGFjY2VzcyBiZWZvcmUgZXhlY3V0aW9uIHdoZW4gZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsIHRydWUpO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5EZW5pZWROZXR3b3JrRG9tYWlucywgWydleGFtcGxlLmNvbSddKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KCkpKTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2N1cmwgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGZhbHNlLCAnYmFzaCcpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdHN0cmljdEVxdWFsKHdyYXBwZWQuaXNTYW5kYm94V3JhcHBlZCwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5yZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbiwgdHJ1ZSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHdyYXBwZWQuYmxvY2tlZERvbWFpbnMsIFsnZXhhbXBsZS5jb20nXSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHdyYXBwZWQuZGVuaWVkRG9tYWlucywgWydleGFtcGxlLmNvbSddKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwoY29uZmlnLm5ldHdvcmssIHsgYWxsb3dlZERvbWFpbnM6IFtdLCBkZW5pZWREb21haW5zOiBbXSwgZW5hYmxlZDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlUm9vdHMgdHJpZ2dlcnMgYSBzYW5kYm94IGNvbmZpZyByZXdyaXRlIG9uIHRoZSBuZXh0IHdyYXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHdyaXRlUm9vdHM6IFVSSVtdID0gW1VSSS5maWxlKCcvd29ya3NwYWNlLWEnKV07XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0Z2V0V3JpdGVSb290czogKCkgPT4gd3JpdGVSb290cyxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cdFx0YXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIGEnKTtcblx0XHRjb25zdCBpbml0aWFsV3JpdGVDb3VudCA9IGNyZWF0ZUZpbGVDb3VudDtcblxuXHRcdHdyaXRlUm9vdHMgPSBbVVJJLmZpbGUoJy93b3Jrc3BhY2UtYicpXTtcblx0XHRob3N0LnJvb3RzRW1pdHRlci5maXJlKCk7XG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIGInKTtcblxuXHRcdG9rKGNyZWF0ZUZpbGVDb3VudCA+IGluaXRpYWxXcml0ZUNvdW50LCBgRXhwZWN0ZWQgc2FuZGJveCBjb25maWcgdG8gYmUgcmV3cml0dGVuIGFmdGVyIG9uRGlkQ2hhbmdlUm9vdHMgKGluaXRpYWw9JHtpbml0aWFsV3JpdGVDb3VudH0sIGFmdGVyPSR7Y3JlYXRlRmlsZUNvdW50fSlgKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGghKSEpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXMoJy93b3Jrc3BhY2UtYicpLCAnUmVmcmVzaGVkIGNvbmZpZyBzaG91bGQgaW5jbHVkZSB0aGUgbmV3IHdyaXRlIHJvb3QnKTtcblx0XHRvayghY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL3dvcmtzcGFjZS1hJyksICdSZWZyZXNoZWQgY29uZmlnIHNob3VsZCBkcm9wIHRoZSBvbGQgd3JpdGUgcm9vdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbHdheXMgZGVuaWVzIHJlYWRzIG9mIHRoZSBzYW5kYm94IGNvbmZpZyBmaWxlIG9uIExpbnV4IGFuZCBtYWNPUycsIGFzeW5jICgpID0+IHtcblx0XHRmb3IgKGNvbnN0IG9zIG9mIFtPcGVyYXRpbmdTeXN0ZW0uTGludXgsIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2hdKSB7XG5cdFx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KHtcblx0XHRcdFx0Z2V0T1M6ICgpID0+IFByb21pc2UucmVzb2x2ZShvcyksXG5cdFx0XHR9KSkpO1xuXG5cdFx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRcdGNvbnN0IHRlbXBEaXJQYXRoID0gZW5naW5lLmdldFRlbXBEaXIoKT8ucGF0aDtcblx0XHRcdG9rKHRlbXBEaXJQYXRoLCAnVGVtcCBkaXIgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGRlbnlSZWFkOiBjb25maWcuZmlsZXN5c3RlbS5kZW55UmVhZC5pbmNsdWRlcyhjb25maWdQYXRoKSxcblx0XHRcdFx0Y29uZmlnQWxsb3dXcml0ZTogY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcyhjb25maWdQYXRoKSxcblx0XHRcdFx0dGVtcERpckFsbG93V3JpdGU6IGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXModGVtcERpclBhdGgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRkZW55UmVhZDogdHJ1ZSxcblx0XHRcdFx0Y29uZmlnQWxsb3dXcml0ZTogZmFsc2UsXG5cdFx0XHRcdHRlbXBEaXJBbGxvd1dyaXRlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgZmlsZXN5c3RlbSBzeW1saW5rIHBhdGhzIGFuZCByZXNvbHZlcyB0aGVpciB0YXJnZXRzIG9uIExpbnV4IHdoZW4gd3JpdGluZyB0aGUgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hMaW51eEZpbGVTeXN0ZW0sIHtcblx0XHRcdGFsbG93UmVhZDogWyd+L3JlYWQtbGluayddLFxuXHRcdFx0YWxsb3dXcml0ZTogWycvd3JpdGUtbGluayddLFxuXHRcdFx0ZGVueVJlYWQ6IFsnfi9kZW55LXJlYWQtbGluayddLFxuXHRcdFx0ZGVueVdyaXRlOiBbJy9kZW55LXdyaXRlLWxpbmsnXSxcblx0XHR9KTtcblx0XHRmaWxlU2VydmljZS5zZXRSZWFscGF0aCgnL3dvcmtzcGFjZS1saW5rJywgJy9yZWFsL3dvcmtzcGFjZScpO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvd3JpdGUtbGluaycsICcvcmVhbC93cml0ZScpO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvaG9tZS91c2VyL3JlYWQtbGluaycsICcvcmVhbC9yZWFkJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy9ob21lL3VzZXIvZGVueS1yZWFkLWxpbmsnLCAnL3JlYWwvZGVueS1yZWFkJyk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy9kZW55LXdyaXRlLWxpbmsnLCAnL3JlYWwvZGVueS13cml0ZScpO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvaG9tZS91c2VyLy5nbnVwZycsICcvcmVhbC9nbnVwZycpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGdldFdyaXRlUm9vdHM6ICgpID0+IFtVUkkuZmlsZSgnL3dvcmtzcGFjZS1saW5rJyldLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZ2l0IGNvbW1pdCAtUycsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgW3sga2V5d29yZDogJ2dpdCcsIGFyZ3M6IFsnY29tbWl0JywgJy1TJ10gfV0pO1xuXG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXMoJy93b3Jrc3BhY2UtbGluaycpLCAnV29ya3NwYWNlIHdyaXRlIHJvb3Qgc3ltbGluayBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL3JlYWwvd29ya3NwYWNlJyksICdXb3Jrc3BhY2Ugd3JpdGUgcm9vdCBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1dyaXRlLmluY2x1ZGVzKCcvd3JpdGUtbGluaycpLCAnQ29uZmlndXJlZCBhbGxvd1dyaXRlIHN5bWxpbmsgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXMoJy9yZWFsL3dyaXRlJyksICdDb25maWd1cmVkIGFsbG93V3JpdGUgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dSZWFkLmluY2x1ZGVzKCcvaG9tZS91c2VyL3JlYWQtbGluaycpLCAnQ29uZmlndXJlZCBhbGxvd1JlYWQgc2hvdWxkIGV4cGFuZCB+IGFuZCBwcmVzZXJ2ZSB0aGUgc3ltbGluaycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93UmVhZC5pbmNsdWRlcygnL3JlYWwvcmVhZCcpLCAnQ29uZmlndXJlZCBhbGxvd1JlYWQgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dSZWFkLmluY2x1ZGVzKCcvaG9tZS91c2VyLy5nbnVwZycpLCAnQ29tbWFuZCBydW50aW1lIGFsbG93UmVhZCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1JlYWQuaW5jbHVkZXMoJy9yZWFsL2dudXBnJyksICdDb21tYW5kIHJ1bnRpbWUgYWxsb3dSZWFkIHN5bWxpbmsgdGFyZ2V0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXMoJy9ob21lL3VzZXIvLmdudXBnJyksICdDb21tYW5kIHJ1bnRpbWUgYWxsb3dXcml0ZSBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1dyaXRlLmluY2x1ZGVzKCcvcmVhbC9nbnVwZycpLCAnQ29tbWFuZCBydW50aW1lIGFsbG93V3JpdGUgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uZGVueVJlYWQuaW5jbHVkZXMoJy9ob21lL3VzZXIvZGVueS1yZWFkLWxpbmsnKSwgJ0NvbmZpZ3VyZWQgZGVueVJlYWQgc2hvdWxkIGV4cGFuZCB+IGFuZCBwcmVzZXJ2ZSB0aGUgc3ltbGluaycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmRlbnlSZWFkLmluY2x1ZGVzKCcvcmVhbC9kZW55LXJlYWQnKSwgJ0NvbmZpZ3VyZWQgZGVueVJlYWQgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uZGVueVdyaXRlLmluY2x1ZGVzKCcvZGVueS13cml0ZS1saW5rJyksICdDb25maWd1cmVkIGRlbnlXcml0ZSBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5kZW55V3JpdGUuaW5jbHVkZXMoJy9yZWFsL2Rlbnktd3JpdGUnKSwgJ0NvbmZpZ3VyZWQgZGVueVdyaXRlIHN5bWxpbmsgdGFyZ2V0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBmaWxlc3lzdGVtIHBhdGhzIHdpdGhvdXQgc3ltbGlua3Mgd2hlbiB3cml0aW5nIHRoZSBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveExpbnV4RmlsZVN5c3RlbSwge1xuXHRcdFx0YWxsb3dSZWFkOiBbJ34vcmVhZC1wbGFpbiddLFxuXHRcdFx0YWxsb3dXcml0ZTogWycvd3JpdGUtcGxhaW4nXSxcblx0XHRcdGRlbnlSZWFkOiBbJ34vZGVueS1yZWFkLXBsYWluJ10sXG5cdFx0XHRkZW55V3JpdGU6IFsnL2Rlbnktd3JpdGUtcGxhaW4nXSxcblx0XHR9KTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7XG5cdFx0XHRnZXRXcml0ZVJvb3RzOiAoKSA9PiBbVVJJLmZpbGUoJy93b3Jrc3BhY2UtcGxhaW4nKV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmFsbG93V3JpdGUuaW5jbHVkZXMoJy93b3Jrc3BhY2UtcGxhaW4nKSwgJ1dvcmtzcGFjZSB3cml0ZSByb290IHdpdGhvdXQgc3ltbGluayBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uYWxsb3dXcml0ZS5pbmNsdWRlcygnL3dyaXRlLXBsYWluJyksICdDb25maWd1cmVkIGFsbG93V3JpdGUgd2l0aG91dCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5hbGxvd1JlYWQuaW5jbHVkZXMoJy9ob21lL3VzZXIvcmVhZC1wbGFpbicpLCAnQ29uZmlndXJlZCBhbGxvd1JlYWQgd2l0aG91dCBzeW1saW5rIHNob3VsZCBleHBhbmQgfiBhbmQgYmUgcHJlc2VydmVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uZGVueVJlYWQuaW5jbHVkZXMoJy9ob21lL3VzZXIvZGVueS1yZWFkLXBsYWluJyksICdDb25maWd1cmVkIGRlbnlSZWFkIHdpdGhvdXQgc3ltbGluayBzaG91bGQgZXhwYW5kIH4gYW5kIGJlIHByZXNlcnZlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmRlbnlXcml0ZS5pbmNsdWRlcygnL2Rlbnktd3JpdGUtcGxhaW4nKSwgJ0NvbmZpZ3VyZWQgZGVueVdyaXRlIHdpdGhvdXQgc3ltbGluayBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrRmlsZUFjY2VzcyB2YWxpZGF0ZXMgd3JpdGUgcGF0aHMgYWdhaW5zdCBhbGxvd1dyaXRlIGFuZCBkZW55V3JpdGUgb24gTGludXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveExpbnV4RmlsZVN5c3RlbSwge1xuXHRcdFx0YWxsb3dXcml0ZTogWycvY29uZmlndXJlZC93cml0ZScsICcvZ2xvYi8qKi8qLnRzJ10sXG5cdFx0XHRkZW55V3JpdGU6IFsnL3dvcmtzcGFjZS9ibG9ja2VkJ10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlSG9zdCgpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBlbmdpbmUuY2hlY2tGaWxlQWNjZXNzKCd3cml0ZScsIFtcblx0XHRcdCcvd29ya3NwYWNlL2ZpbGUudHh0Jyxcblx0XHRcdCcvY29uZmlndXJlZC93cml0ZS9maWxlLnR4dCcsXG5cdFx0XHQnL2dsb2IvbmVzdGVkL2ZpbGUudHMnLFxuXHRcdFx0Jy9vdXRzaWRlL2ZpbGUudHh0Jyxcblx0XHRcdCcvd29ya3NwYWNlL2Jsb2NrZWQvZmlsZS50eHQnLFxuXHRcdF0pO1xuXG5cdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0YWxsb3dlZDogZmFsc2UsXG5cdFx0XHRkZW5pZWQ6IFsnL291dHNpZGUvZmlsZS50eHQnLCAnL3dvcmtzcGFjZS9ibG9ja2VkL2ZpbGUudHh0J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrRmlsZUFjY2VzcyB2YWxpZGF0ZXMgcmVhZCBwYXRocyBhZ2FpbnN0IGRlbnlSZWFkIGFuZCBhbGxvd1JlYWQgb24gTGludXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveExpbnV4RmlsZVN5c3RlbSwge1xuXHRcdFx0YWxsb3dSZWFkOiBbJ34vLmFsbG93ZWQtcmVhZCddLFxuXHRcdFx0YWxsb3dXcml0ZTogWyd+Ly5hbGxvd2VkLXdyaXRlJ10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlSG9zdCgpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBlbmdpbmUuY2hlY2tGaWxlQWNjZXNzKCdyZWFkJywgW1xuXHRcdFx0Jy9ob21lL3VzZXIvcHJpdmF0ZS50eHQnLFxuXHRcdFx0Jy9ob21lL3VzZXIvLmFsbG93ZWQtcmVhZC9jb25maWcuanNvbicsXG5cdFx0XHQnL2hvbWUvdXNlci8uYWxsb3dlZC13cml0ZS9maWxlLnR4dCcsXG5cdFx0XHQnL2V0Yy9ob3N0cycsXG5cdFx0XSk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRhbGxvd2VkOiBmYWxzZSxcblx0XHRcdGRlbmllZDogWycvaG9tZS91c2VyL3ByaXZhdGUudHh0J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrRmlsZUFjY2VzcyBwcmVzZXJ2ZXMgc3ltbGluayBzb3VyY2UgYW5kIHRhcmdldCBwZXJtaXNzaW9ucyBvbiBMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94TGludXhGaWxlU3lzdGVtLCB7XG5cdFx0XHRhbGxvd1dyaXRlOiBbJy93cml0ZS1saW5rJ10sXG5cdFx0fSk7XG5cdFx0ZmlsZVNlcnZpY2Uuc2V0UmVhbHBhdGgoJy93cml0ZS1saW5rJywgJy9yZWFsL3dyaXRlJyk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlSG9zdCgpKSk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmNoZWNrRmlsZUFjY2Vzcygnd3JpdGUnLCBbJy93cml0ZS1saW5rL2ZpbGUudHh0JywgJy9yZWFsL3dyaXRlL2ZpbGUudHh0J10pLCB7XG5cdFx0XHRhbGxvd2VkOiB0cnVlLFxuXHRcdFx0ZGVuaWVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYW51cFRlbXBEaXIgaXMgYSBuby1vcCB3aGVuIG5vIHRlbXAgZGlyIHdhcyBldmVyIGNyZWF0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHQvLyBEaXNhYmxlIHRoZSBzYW5kYm94IHNvIHRoZSBlbmdpbmUgbmV2ZXIgY3JlYXRlcyBhIHRlbXAgZGlyLlxuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmKTtcblxuXHRcdHN0cmljdEVxdWFsKGVuZ2luZS5nZXRUZW1wRGlyKCksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgZW5naW5lLmNsZWFudXBUZW1wRGlyKCk7IC8vIG11c3Qgbm90IHRocm93XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWNoZWNrIGlucHV0cyBjYW4gZGlzYWJsZSBzYW5kYm94aW5nIHdoZW4gZGVmYXVsdCBhcHByb3ZhbCBwZXJtaXNzaW9uIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KCk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0c3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmlzRW5hYmxlZCh7IGlzRGVmYXVsdEFwcHJvdmFsUGVybWlzc2lvbkVuYWJsZWQ6IHRydWUgfSksIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc0VuYWJsZWQoeyBpc0RlZmF1bHRBcHByb3ZhbFBlcm1pc3Npb25FbmFibGVkOiBmYWxzZSB9KSwgZmFsc2UpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkKHsgaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZDogZmFsc2UgfSksIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoZmFsc2UsIHsgaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZDogZmFsc2UgfSksIHVuZGVmaW5lZCk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoYXdhaXQgZW5naW5lLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMoZmFsc2UsIHsgaXNEZWZhdWx0QXBwcm92YWxQZXJtaXNzaW9uRW5hYmxlZDogZmFsc2UgfSksIHtcblx0XHRcdGVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0c2FuZGJveENvbmZpZ1BhdGg6IHVuZGVmaW5lZCxcblx0XHRcdGZhaWxlZENoZWNrOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRzdHJpY3RFcXVhbChjcmVhdGVGaWxlQ291bnQsIDAsICdEaXNhYmxlZCBzYW5kYm94IHByZWNoZWNrIHNob3VsZCBub3QgY3JlYXRlIHNhbmRib3ggY29uZmlnIGZpbGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzRW5hYmxlZCByZXR1cm5zIGZhbHNlIG9uIFdpbmRvd3Mgd2hlbiBXaW5kb3dzIHNhbmRib3ggc2V0dGluZyBpcyBkaXNhYmxlZCBieSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaW5kb3dzSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc0VuYWJsZWQoKSwgZmFsc2UpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkKCksIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaXNFbmFibGVkIHJldHVybnMgdHJ1ZSBvbiBXaW5kb3dzIHdoZW4gV2luZG93cyBzYW5kYm94IHNldHRpbmcgaXMgZW5hYmxlZCBldmVuIGlmIGdsb2JhbCBzYW5kYm94aW5nIGlzIG9mZicsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZCwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZik7XG5cdFx0ZW5hYmxlV2luZG93c1NhbmRib3goKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3QoKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRzdHJpY3RFcXVhbChhd2FpdCBlbmdpbmUuaXNFbmFibGVkKCksIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkKCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmFibGVkV2luZG93cyBvbiB2YWx1ZSBkb2VzIG5vdCBlbmFibGUgYWxsb3dOZXR3b3JrIG9uIFdpbmRvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQsIEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYpO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzRW5hYmxlZCwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3QoKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRzdHJpY3RFcXVhbChhd2FpdCBlbmdpbmUuaXNFbmFibGVkKCksIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGF3YWl0IGVuZ2luZS5pc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkKCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnd3JhcENvbW1hbmQgdXNlcyBNWEMgZXhlY3V0YWJsZSBhbmQgd3JpdGVzIE1YQyBjb25maWcgb24gV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRlbmFibGVXaW5kb3dzU2FuZGJveCgpO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaW5kb3dzSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGVsbG8nLCBmYWxzZSwgJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJywgVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy9jOi93b3Jrc3BhY2UnIH0pKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRzdHJpY3RFcXVhbCh3cmFwcGVkLmlzU2FuZGJveFdyYXBwZWQsIHRydWUpO1xuXHRcdG9rKHdyYXBwZWQuY29tbWFuZC5zdGFydHNXaXRoKGAmICdDOlxcXFxhcHBcXFxcbm9kZV9tb2R1bGVzXFxcXEBtaWNyb3NvZnRcXFxcbXhjLXNka1xcXFxiaW5cXFxceDY0XFxcXHd4Yy1leGVjLmV4ZSdgKSwgYEV4cGVjdGVkIE1YQyBleGVjdXRhYmxlLiBBY3R1YWw6ICR7d3JhcHBlZC5jb21tYW5kfWApO1xuXHRcdG9rKHdyYXBwZWQuY29tbWFuZC5pbmNsdWRlcyhgICcke2NvbmZpZ1BhdGh9J2ApLCBgRXhwZWN0ZWQgd3JhcHBlZCBjb21tYW5kIHRvIHBhc3MgdGhlIE1YQyBjb25maWcgcGF0aC4gQWN0dWFsOiAke3dyYXBwZWQuY29tbWFuZH1gKTtcblx0XHRzdHJpY3RFcXVhbChjb25maWcudmVyc2lvbiwgJzAuNi4wLWFscGhhJyk7XG5cdFx0c3RyaWN0RXF1YWwoY29uZmlnLmNvbnRhaW5tZW50LCAncHJvY2VzcycpO1xuXHRcdHN0cmljdEVxdWFsKGNvbmZpZy5wcm9jZXNzLmNvbW1hbmRMaW5lLCAnXCJDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZVwiIC1Ob1Byb2ZpbGUgLUNvbW1hbmQgXCJlY2hvIGhlbGxvXCInKTtcblx0XHRzdHJpY3RFcXVhbChub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChjb25maWcucHJvY2Vzcy5jd2QpLCAnYzovd29ya3NwYWNlJyk7XG5cdFx0c3RyaWN0RXF1YWwoY29uZmlnLnVpLmRpc2FibGUsIGZhbHNlKTtcblx0XHRvayhjb25maWcucHJvY2Vzcy5lbnYuaW5jbHVkZXMoJ1N5c3RlbVJvb3Q9QzpcXFxcV2luZG93cycpLCAnU3lzdGVtUm9vdCBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdQQVRIPUM6XFxcXHRvb2xzXFxcXG5vZGU7QzpcXFxcV2luZG93c1xcXFxTeXN0ZW0zMicpLCAnUEFUSCBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdDb21TcGVjPUM6XFxcXFdpbmRvd3NcXFxcU3lzdGVtMzJcXFxcY21kLmV4ZScpLCAnQ29tU3BlYyBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdQQVRIRVhUPS5DT007LkVYRTsuQkFUOy5DTUQ7LlBTMScpLCAnUEFUSEVYVCBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdQU01vZHVsZVBhdGg9QzpcXFxcVXNlcnNcXFxcdXNlclxcXFxEb2N1bWVudHNcXFxcUG93ZXJTaGVsbFxcXFxNb2R1bGVzO0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFxNb2R1bGVzJyksICdQU01vZHVsZVBhdGggc2hvdWxkIGJlIGluamVjdGVkIGludG8gdGhlIE1YQyBwcm9jZXNzIGVudicpO1xuXHRcdG9rKGNvbmZpZy5wcm9jZXNzLmVudi5pbmNsdWRlcygnVVNFUlBST0ZJTEU9QzpcXFxcVXNlcnNcXFxcdXNlcicpLCAnVVNFUlBST0ZJTEUgc2hvdWxkIGJlIGluamVjdGVkIGludG8gdGhlIE1YQyBwcm9jZXNzIGVudicpO1xuXHRcdG9rKGNvbmZpZy5wcm9jZXNzLmVudi5pbmNsdWRlcygnQVBQREFUQT1DOlxcXFxVc2Vyc1xcXFx1c2VyXFxcXEFwcERhdGFcXFxcUm9hbWluZycpLCAnQVBQREFUQSBzaG91bGQgYmUgaW5qZWN0ZWQgaW50byB0aGUgTVhDIHByb2Nlc3MgZW52Jyk7XG5cdFx0b2soY29uZmlnLnByb2Nlc3MuZW52LmluY2x1ZGVzKCdMT0NBTEFQUERBVEE9QzpcXFxcVXNlcnNcXFxcdXNlclxcXFxBcHBEYXRhXFxcXExvY2FsJyksICdMT0NBTEFQUERBVEEgc2hvdWxkIGJlIGluamVjdGVkIGludG8gdGhlIE1YQyBwcm9jZXNzIGVudicpO1xuXHRcdG9rKGNvbmZpZy5wcm9jZXNzLmVudi5pbmNsdWRlcygnUFNIT01FPUM6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3JyksICdQU0hPTUUgc2hvdWxkIGJlIGluamVjdGVkIGludG8gdGhlIE1YQyBwcm9jZXNzIGVudicpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjb25maWcubmV0d29yaywgeyBkZWZhdWx0UG9saWN5OiAnYWxsb3cnLCBlbmZvcmNlbWVudE1vZGU6ICdjYXBhYmlsaXRpZXMnIH0pO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi93b3Jrc3BhY2UnKSwgJ1dvcmtzcGFjZSBzaG91bGQgYmUgd3JpdGFibGUnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkd3JpdGVQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpLmVuZHNXaXRoKCcvLnRlc3QtZGF0YS90bXAnKSksICdTYW5kYm94IHRlbXAgZGlyIHNob3VsZCBiZSB3cml0YWJsZScpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi91c2Vycy91c2VyL2FwcGRhdGEvbG9jYWwvdGVtcCcpLCAnTVhDIHRlbXBvcmFyeSBmaWxlcyBwb2xpY3kgc2hvdWxkIGFkZCBob3N0IHRlbXAgcGF0aCB0byB3cml0YWJsZSBwYXRocycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKS5lbmRzV2l0aCgnLy50ZXN0LWRhdGEvdG1wJykpLCAnU2FuZGJveCB0ZW1wIGRpciBzaG91bGQgYmUgcmVhZGFibGUgdGhyb3VnaCByZWFkb25seSBwYXRocycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3Rvb2xzL25vZGUnKSwgJ01YQyBhdmFpbGFibGUgdG9vbHMgcG9saWN5IHNob3VsZCBhZGQgdG9vbCBwYXRocyB0byByZWFkb25seSBwYXRocycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3Byb2dyYW0gZmlsZXMvcG93ZXJzaGVsbC83JyksICdSZXNvbHZlZCBQb3dlclNoZWxsIGV4ZWN1dGFibGUgZGlyZWN0b3J5IHNob3VsZCBiZSByZWFkYWJsZScpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3VzZXJzL3VzZXIvYXBwZGF0YS9sb2NhbC9wcm9ncmFtcy9naXQnKSwgJ01YQyB1c2VyIHByb2ZpbGUgcG9saWN5IHNob3VsZCBhZGQgdXNlciBwcm9maWxlIHBhdGhzIHRvIHJlYWRvbmx5IHBhdGhzJyk7XG5cdFx0b2soIWNvbmZpZy5maWxlc3lzdGVtLmRlbmllZFBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi91c2Vycy91c2VyJyksICdVc2VyIGhvbWUgc2hvdWxkIG5vdCBiZSBkZW5pZWQgYnkgZGVmYXVsdCBvbiBXaW5kb3dzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyYXBDb21tYW5kIGFwcGxpZXMgV2luZG93cyBmaWxlc3lzdGVtIHNldHRpbmcgdG8gTVhDIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRlbmFibGVXaW5kb3dzU2FuZGJveCgpO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzRmlsZVN5c3RlbSwge1xuXHRcdFx0YWxsb3dXcml0ZTogWydDOi9jb25maWd1cmVkL3dyaXRlJ10sXG5cdFx0XHRhbGxvd1JlYWQ6IFsnQzovY29uZmlndXJlZC9yZWFkJ10sXG5cdFx0XHRkZW55UmVhZDogWydDOi9jb25maWd1cmVkL3NlY3JldCddLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVXaW5kb3dzSG9zdCgpO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZWNobyBoZWxsbycsIGZhbHNlLCAncHdzaCcpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBzZXJpYWxpemVkQ29uZmlnID0gY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSE7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShzZXJpYWxpemVkQ29uZmlnKTtcblxuXHRcdG9rKHNlcmlhbGl6ZWRDb25maWcuaW5jbHVkZXMoJ0M6XFxcXFxcXFxjb25maWd1cmVkXFxcXFxcXFx3cml0ZScpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGFsbG93V3JpdGUgcGF0aCBzaG91bGQgYmUgZXNjYXBlZCBpbiB0aGUgc2VyaWFsaXplZCBNWEMgY29uZmlnJyk7XG5cdFx0b2soc2VyaWFsaXplZENvbmZpZy5pbmNsdWRlcygnQzpcXFxcXFxcXGNvbmZpZ3VyZWRcXFxcXFxcXHJlYWQnKSwgJ0NvbmZpZ3VyZWQgV2luZG93cyBhbGxvd1JlYWQgcGF0aCBzaG91bGQgYmUgZXNjYXBlZCBpbiB0aGUgc2VyaWFsaXplZCBNWEMgY29uZmlnJyk7XG5cdFx0b2soc2VyaWFsaXplZENvbmZpZy5pbmNsdWRlcygnQzpcXFxcXFxcXGNvbmZpZ3VyZWRcXFxcXFxcXHNlY3JldCcpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGRlbnlSZWFkIHBhdGggc2hvdWxkIGJlIGVzY2FwZWQgaW4gdGhlIHNlcmlhbGl6ZWQgTVhDIGNvbmZpZycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9jb25maWd1cmVkL3dyaXRlJyksICdDb25maWd1cmVkIFdpbmRvd3MgYWxsb3dXcml0ZSBwYXRoIHNob3VsZCBiZSB3cml0YWJsZScpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWRvbmx5UGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L2NvbmZpZ3VyZWQvcmVhZCcpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGFsbG93UmVhZCBwYXRoIHNob3VsZCBiZSByZWFkb25seScpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi91c2Vycy91c2VyL2FwcGRhdGEvbG9jYWwvdGVtcCcpLCAnSG9zdCB0ZW1wIHBhdGggZnJvbSBXaW5kb3dzIHBvbGljeSBzaG91bGQgYmUgd3JpdGFibGUnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5kZW5pZWRQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovY29uZmlndXJlZC9zZWNyZXQnKSwgJ0NvbmZpZ3VyZWQgV2luZG93cyBkZW55UmVhZCBwYXRoIHNob3VsZCBiZSBkZW5pZWQnKTtcblx0XHRvayghY29uZmlnLmZpbGVzeXN0ZW0uZGVuaWVkUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3VzZXJzL3VzZXInKSwgJ1VzZXIgaG9tZSBzaG91bGQgbm90IGJlIGRlbmllZCBieSBkZWZhdWx0IG9uIFdpbmRvd3MnKTtcblx0fSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIFdpbmRvd3MgZmlsZXN5c3RlbSBwYXRocyByZWdhcmRsZXNzIG9mIGNhc2Ugb3Igc2VwYXJhdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGVuYWJsZVdpbmRvd3NTYW5kYm94KCk7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NGaWxlU3lzdGVtLCB7XG5cdFx0XHRhbGxvd1dyaXRlOiBbJ0M6L2NvbmZpZ3VyZWQvd3JpdGUnXSxcblx0XHRcdGFsbG93UmVhZDogWydDOlxcXFxjb25maWd1cmVkXFxcXHJlYWQnXSxcblx0XHRcdGRlbnlSZWFkOiBbJ0M6L2NvbmZpZ3VyZWQvc2VjcmV0JywgJ2M6XFxcXGNvbmZpZ3VyZWRcXFxcc2VjcmV0J10sXG5cdFx0fSk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZVdpbmRvd3NIb3N0KHtcblx0XHRcdGdldFdpbmRvd3NNeGNGaWxlc3lzdGVtUG9saWN5OiAoKSA9PiBQcm9taXNlLnJlc29sdmUoe1xuXHRcdFx0XHRyZWFkd3JpdGVQYXRoczogWydjOlxcXFxjb25maWd1cmVkXFxcXHdyaXRlJ10sXG5cdFx0XHRcdHJlYWRvbmx5UGF0aHM6IFsnYzovY29uZmlndXJlZC9yZWFkJ10sXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gaGVsbG8nLCBmYWxzZSwgJ3B3c2gnKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cdFx0Y29uc3QgbWF0Y2hpbmdQYXRocyA9IChwYXRoczogc3RyaW5nW10sIGV4cGVjdGVkUGF0aDogc3RyaW5nKSA9PiBwYXRocy5maWx0ZXIocGF0aCA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gZXhwZWN0ZWRQYXRoKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWFkd3JpdGU6IG1hdGNoaW5nUGF0aHMoY29uZmlnLmZpbGVzeXN0ZW0ucmVhZHdyaXRlUGF0aHMsICdjOi9jb25maWd1cmVkL3dyaXRlJyksXG5cdFx0XHRyZWFkb25seTogbWF0Y2hpbmdQYXRocyhjb25maWcuZmlsZXN5c3RlbS5yZWFkb25seVBhdGhzLCAnYzovY29uZmlndXJlZC9yZWFkJyksXG5cdFx0XHRkZW5pZWQ6IG1hdGNoaW5nUGF0aHMoY29uZmlnLmZpbGVzeXN0ZW0uZGVuaWVkUGF0aHMsICdjOi9jb25maWd1cmVkL3NlY3JldCcpLFxuXHRcdH0sIHtcblx0XHRcdHJlYWR3cml0ZTogWydDOlxcXFxjb25maWd1cmVkXFxcXHdyaXRlJ10sXG5cdFx0XHRyZWFkb25seTogWydDOlxcXFxjb25maWd1cmVkXFxcXHJlYWQnXSxcblx0XHRcdGRlbmllZDogWydDOlxcXFxjb25maWd1cmVkXFxcXHNlY3JldCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWR1cGxpY2F0ZXMgcmVzb2x2ZWQgV2luZG93cyBwYXRocyByZWdhcmRsZXNzIG9mIGNhc2Ugb3Igc2VwYXJhdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGVuYWJsZVdpbmRvd3NTYW5kYm94KCk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlV2luZG93c0hvc3QoKSkpO1xuXHRcdGF3YWl0IGVuZ2luZS5nZXRPUygpO1xuXHRcdGNvbnN0IHJlc29sdmVGaWxlU3lzdGVtUGF0aHMgPSAoZW5naW5lIGFzIHVua25vd24gYXMgeyBfcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhwYXRoczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB9KS5fcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocy5iaW5kKGVuZ2luZSk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZUZpbGVTeXN0ZW1QYXRocyhbXG5cdFx0XHQnQzovY29uZmlndXJlZC9wYXRoJyxcblx0XHRcdCdjOlxcXFxjb25maWd1cmVkXFxcXHBhdGgnLFxuXHRcdFx0J0M6XFxcXGNvbmZpZ3VyZWRcXFxcb3RoZXItcGF0aCcsXG5cdFx0XSksIFtcblx0XHRcdCdDOi9jb25maWd1cmVkL3BhdGgnLFxuXHRcdFx0J0M6XFxcXGNvbmZpZ3VyZWRcXFxcb3RoZXItcGF0aCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyYXBDb21tYW5kIGFwcGxpZXMgY29uZmlndXJlZCBXaW5kb3dzIE1YQyBzY2hlbWEgdmVyc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRlbmFibGVXaW5kb3dzU2FuZGJveCgpO1xuXHRcdHNldFNhbmRib3hTZXR0aW5nKEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hXaW5kb3dzU2NoZW1hVmVyc2lvbiwgJzAuNS4wLWFscGhhJyk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgY3JlYXRlV2luZG93c0hvc3QoKSkpO1xuXG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIGhlbGxvJywgZmFsc2UsICdwd3NoJyk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0c3RyaWN0RXF1YWwoY29uZmlnLnZlcnNpb24sICcwLjUuMC1hbHBoYScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgV2luZG93cyBmaWxlc3lzdGVtIHN5bWxpbmsgcGF0aHMgYW5kIHJlc29sdmVzIHRoZWlyIHRhcmdldHMgd2hlbiB3cml0aW5nIE1YQyBjb25maWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZW5hYmxlV2luZG93c1NhbmRib3goKTtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0ZpbGVTeXN0ZW0sIHtcblx0XHRcdGFsbG93V3JpdGU6IFsnQzpcXFxcY29uZmlndXJlZFxcXFx3cml0ZS1saW5rJ10sXG5cdFx0XHRhbGxvd1JlYWQ6IFsnQzpcXFxcY29uZmlndXJlZFxcXFxyZWFkLWxpbmsnXSxcblx0XHRcdGRlbnlSZWFkOiBbJ0M6XFxcXGNvbmZpZ3VyZWRcXFxcc2VjcmV0LWxpbmsnXSxcblx0XHR9KTtcblx0XHRmaWxlU2VydmljZS5zZXRSZWFscGF0aCgnL2M6L3dvcmtzcGFjZS1saW5rJywgJy9jOi9yZWFsL3dvcmtzcGFjZScpO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvYzovY29uZmlndXJlZC93cml0ZS1saW5rJywgJy9jOi9yZWFsL2NvbmZpZ3VyZWQtd3JpdGUnKTtcblx0XHRmaWxlU2VydmljZS5zZXRSZWFscGF0aCgnL2M6L2NvbmZpZ3VyZWQvcmVhZC1saW5rJywgJy9jOi9yZWFsL2NvbmZpZ3VyZWQtcmVhZCcpO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvYzovY29uZmlndXJlZC9zZWNyZXQtbGluaycsICcvYzovcmVhbC9jb25maWd1cmVkLXNlY3JldCcpO1xuXHRcdGZpbGVTZXJ2aWNlLnNldFJlYWxwYXRoKCcvYzovdG9vbHMvbm9kZScsICcvYzovcmVhbC90b29scy1ub2RlJyk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZVdpbmRvd3NIb3N0KHtcblx0XHRcdGdldFdyaXRlUm9vdHM6ICgpID0+IFtVUkkuZnJvbSh7IHNjaGVtZTogJ2ZpbGUnLCBwYXRoOiAnL2M6L3dvcmtzcGFjZS1saW5rJyB9KV0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIGhlbGxvJywgZmFsc2UsICdwd3NoJyk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0ucmVhZHdyaXRlUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3dvcmtzcGFjZS1saW5rJyksICdXb3Jrc3BhY2Ugd3JpdGUgcm9vdCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQgb24gV2luZG93cycpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLnJlYWR3cml0ZVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9yZWFsL3dvcmtzcGFjZScpLCAnV29ya3NwYWNlIHdyaXRlIHJvb3Qgc3ltbGluayB0YXJnZXQgc2hvdWxkIGJlIGluY2x1ZGVkIG9uIFdpbmRvd3MnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkd3JpdGVQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovY29uZmlndXJlZC93cml0ZS1saW5rJyksICdDb25maWd1cmVkIFdpbmRvd3MgYWxsb3dXcml0ZSBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkd3JpdGVQYXRocy5zb21lKChwYXRoOiBzdHJpbmcpID0+IG5vcm1hbGl6ZVdpbmRvd3NQYXRoRm9yQXNzZXJ0KHBhdGgpID09PSAnYzovcmVhbC9jb25maWd1cmVkLXdyaXRlJyksICdDb25maWd1cmVkIFdpbmRvd3MgYWxsb3dXcml0ZSBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkb25seVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9jb25maWd1cmVkL3JlYWQtbGluaycpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGFsbG93UmVhZCBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkb25seVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9yZWFsL2NvbmZpZ3VyZWQtcmVhZCcpLCAnQ29uZmlndXJlZCBXaW5kb3dzIGFsbG93UmVhZCBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkb25seVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi90b29scy9ub2RlJyksICdXaW5kb3dzIHBvbGljeSByZWFkb25seSBzeW1saW5rIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRvayhjb25maWcuZmlsZXN5c3RlbS5yZWFkb25seVBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9yZWFsL3Rvb2xzLW5vZGUnKSwgJ1dpbmRvd3MgcG9saWN5IHJlYWRvbmx5IHN5bWxpbmsgdGFyZ2V0IHNob3VsZCBiZSBpbmNsdWRlZCcpO1xuXHRcdG9rKGNvbmZpZy5maWxlc3lzdGVtLmRlbmllZFBhdGhzLnNvbWUoKHBhdGg6IHN0cmluZykgPT4gbm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQocGF0aCkgPT09ICdjOi9jb25maWd1cmVkL3NlY3JldC1saW5rJyksICdDb25maWd1cmVkIFdpbmRvd3MgZGVueVJlYWQgc3ltbGluayBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdFx0b2soY29uZmlnLmZpbGVzeXN0ZW0uZGVuaWVkUGF0aHMuc29tZSgocGF0aDogc3RyaW5nKSA9PiBub3JtYWxpemVXaW5kb3dzUGF0aEZvckFzc2VydChwYXRoKSA9PT0gJ2M6L3JlYWwvY29uZmlndXJlZC1zZWNyZXQnKSwgJ0NvbmZpZ3VyZWQgV2luZG93cyBkZW55UmVhZCBzeW1saW5rIHRhcmdldCBzaG91bGQgYmUgaW5jbHVkZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnd3JhcENvbW1hbmQgdXNlcyBhcm02NCBNWEMgZXhlY3V0YWJsZSBvbiBXaW5kb3dzIGFybTY0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGVuYWJsZVdpbmRvd3NTYW5kYm94KCk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZVdpbmRvd3NIb3N0KHtcblx0XHRcdGdldFJ1bnRpbWVJbmZvOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoeyBhcHBSb290OiAnQzpcXFxcYXBwJywgYXJjaDogJ2FybTY0JyB9KSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCB3cmFwcGVkID0gYXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdlY2hvIGhlbGxvJywgZmFsc2UsICdwd3NoJyk7XG5cdFx0Y29uc3QgY29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IEpTT04ucGFyc2UoY3JlYXRlZEZpbGVzLmdldChjb25maWdQYXRoKSEpO1xuXG5cdFx0c3RyaWN0RXF1YWwod3JhcHBlZC5jb21tYW5kLCBgJiAnQzpcXFxcYXBwXFxcXG5vZGVfbW9kdWxlc1xcXFxAbWljcm9zb2Z0XFxcXG14Yy1zZGtcXFxcYmluXFxcXGFybTY0XFxcXHd4Yy1leGVjLmV4ZScgJyR7Y29uZmlnUGF0aH0nYCk7XG5cdFx0c3RyaWN0RXF1YWwobm9ybWFsaXplV2luZG93c1BhdGhGb3JBc3NlcnQoY29uZmlnLnByb2Nlc3MuY3dkKSwgJ2M6L3dvcmtzcGFjZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd3cmFwQ29tbWFuZCByZXdyaXRlcyBNWEMgY29uZmlnIHdoZW4gV2luZG93cyBjb21tYW5kIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0ZW5hYmxlV2luZG93c1NhbmRib3goKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3QoKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2VjaG8gZmlyc3QnLCBmYWxzZSwgJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJyk7XG5cdFx0bGV0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBmaXJzdENvbW1hbmRMaW5lID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISkucHJvY2Vzcy5jb21tYW5kTGluZTtcblx0XHRzdHJpY3RFcXVhbChmaXJzdENvbW1hbmRMaW5lLCAnXCJDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZVwiIC1Ob1Byb2ZpbGUgLUNvbW1hbmQgXCJlY2hvIGZpcnN0XCInKTtcblxuXHRcdGF3YWl0IGVuZ2luZS53cmFwQ29tbWFuZCgnZWNobyBzZWNvbmQnLCBmYWxzZSwgJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJyk7XG5cdFx0Y29uZmlnUGF0aCA9IGF3YWl0IGVuZ2luZS5nZXRTYW5kYm94Q29uZmlnUGF0aCgpO1xuXHRcdG9rKGNvbmZpZ1BhdGgsICdDb25maWcgcGF0aCBzaG91bGQgYmUgZGVmaW5lZCcpO1xuXHRcdGNvbnN0IHNlY29uZENvbW1hbmRMaW5lID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISkucHJvY2Vzcy5jb21tYW5kTGluZTtcblx0XHRzdHJpY3RFcXVhbChzZWNvbmRDb21tYW5kTGluZSwgJ1wiQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGVcIiAtTm9Qcm9maWxlIC1Db21tYW5kIFwiZWNobyBzZWNvbmRcIicpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbGxvd05ldHdvcmsgbWFwcyB0byBNWEMgYWxsb3cgbmV0d29yayBjb25maWcgb24gV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0VuYWJsZWQsIEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5Pbik7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29yaywgdHJ1ZSk7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZVdpbmRvd3NIb3N0KCk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0YXdhaXQgZW5naW5lLndyYXBDb21tYW5kKCdjdXJsIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBmYWxzZSwgJ3B3c2gnKTtcblx0XHRjb25zdCBjb25maWdQYXRoID0gYXdhaXQgZW5naW5lLmdldFNhbmRib3hDb25maWdQYXRoKCk7XG5cdFx0b2soY29uZmlnUGF0aCwgJ0NvbmZpZyBwYXRoIHNob3VsZCBiZSBkZWZpbmVkJyk7XG5cdFx0Y29uc3QgY29uZmlnID0gSlNPTi5wYXJzZShjcmVhdGVkRmlsZXMuZ2V0KGNvbmZpZ1BhdGgpISk7XG5cblx0XHRkZWVwU3RyaWN0RXF1YWwoY29uZmlnLm5ldHdvcmssIHsgZGVmYXVsdFBvbGljeTogJ2FsbG93JywgZW5mb3JjZW1lbnRNb2RlOiAnY2FwYWJpbGl0aWVzJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnV2luZG93cyBNWEMgY29uZmlnIGlnbm9yZXMgdW5zdXBwb3J0ZWQgbmV0d29yayBob3N0IGxpc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGVuYWJsZVdpbmRvd3NTYW5kYm94KCk7XG5cdFx0c2V0U2FuZGJveFNldHRpbmcoQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkFsbG93ZWROZXR3b3JrRG9tYWlucywgWydleGFtcGxlLmNvbSddKTtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuRGVuaWVkTmV0d29ya0RvbWFpbnMsIFsnYmxvY2tlZC5leGFtcGxlLmNvbSddKTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlV2luZG93c0hvc3QoKTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoJ2N1cmwgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGZhbHNlLCAncHdzaCcpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRvayhjb25maWdQYXRoLCAnQ29uZmlnIHBhdGggc2hvdWxkIGJlIGRlZmluZWQnKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCkhKTtcblxuXHRcdGRlZXBTdHJpY3RFcXVhbChjb25maWcubmV0d29yaywgeyBkZWZhdWx0UG9saWN5OiAnYWxsb3cnLCBlbmZvcmNlbWVudE1vZGU6ICdjYXBhYmlsaXRpZXMnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIE9TLXNwZWNpZmljIGZpbGVzeXN0ZW0gYWJzb2x1dGUgcGF0aCBkZXRlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGludXhFbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KCkpKTtcblx0XHRhd2FpdCBsaW51eEVuZ2luZS5nZXRPUygpO1xuXHRcdGNvbnN0IGlzTGludXhBYnNvbHV0ZVBhdGggPSAobGludXhFbmdpbmUgYXMgdW5rbm93biBhcyB7IF9pc0Fic29sdXRlRmlsZVN5c3RlbVBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB9KS5faXNBYnNvbHV0ZUZpbGVTeXN0ZW1QYXRoLmJpbmQobGludXhFbmdpbmUpO1xuXG5cdFx0c3RyaWN0RXF1YWwoaXNMaW51eEFic29sdXRlUGF0aCgnL2hvbWUvdXNlcicpLCB0cnVlKTtcblx0XHRzdHJpY3RFcXVhbChpc0xpbnV4QWJzb2x1dGVQYXRoKCdyZWxhdGl2ZS9wYXRoJyksIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChpc0xpbnV4QWJzb2x1dGVQYXRoKCdDOlxcXFxVc2Vyc1xcXFx1c2VyJyksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHdpbmRvd3NFbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBjcmVhdGVIb3N0KHsgZ2V0T1M6ICgpID0+IFByb21pc2UucmVzb2x2ZShPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykgfSkpKTtcblx0XHRhd2FpdCB3aW5kb3dzRW5naW5lLmdldE9TKCk7XG5cdFx0Y29uc3QgaXNXaW5kb3dzQWJzb2x1dGVQYXRoID0gKHdpbmRvd3NFbmdpbmUgYXMgdW5rbm93biBhcyB7IF9pc0Fic29sdXRlRmlsZVN5c3RlbVBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB9KS5faXNBYnNvbHV0ZUZpbGVTeXN0ZW1QYXRoLmJpbmQod2luZG93c0VuZ2luZSk7XG5cblx0XHRzdHJpY3RFcXVhbChpc1dpbmRvd3NBYnNvbHV0ZVBhdGgoJy9Vc2Vycy91c2VyJyksIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGlzV2luZG93c0Fic29sdXRlUGF0aCgnQzpcXFxcVXNlcnNcXFxcdXNlcicpLCB0cnVlKTtcblx0XHRzdHJpY3RFcXVhbChpc1dpbmRvd3NBYnNvbHV0ZVBhdGgoJ0M6L1VzZXJzL3VzZXInKSwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwoaXNXaW5kb3dzQWJzb2x1dGVQYXRoKCdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZScpLCB0cnVlKTtcblx0XHRzdHJpY3RFcXVhbChpc1dpbmRvd3NBYnNvbHV0ZVBhdGgoJ3JlbGF0aXZlXFxcXHBhdGgnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzIHJlcG9ydHMgbWlzc2luZyBkZXBlbmRlbmNpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHN0YXR1czogSVNhbmRib3hEZXBlbmRlbmN5U3RhdHVzID0geyBidWJibGV3cmFwSW5zdGFsbGVkOiBmYWxzZSwgYnViYmxld3JhcFVzYWJsZTogZmFsc2UsIHNvY2F0SW5zdGFsbGVkOiB0cnVlLCBkZXBlbmRlbmN5SW5zdGFsbENvbW1hbmQ6ICdzdWRvIHBhY21hbiAtUyAtLW5lZWRlZCAtLW5vY29uZmlybScgfTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7XG5cdFx0XHRjaGVja1NhbmRib3hEZXBlbmRlbmNpZXM6ICgpID0+IFByb21pc2UucmVzb2x2ZShzdGF0dXMpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVuZ2luZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFNhbmRib3hFbmdpbmUsIGhvc3QpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGVuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmVuYWJsZWQsIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5mYWlsZWRDaGVjaywgJ2RlcGVuZGVuY2llcycpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5taXNzaW5nRGVwZW5kZW5jaWVzPy5bMF0sICdidWJibGV3cmFwJyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzLCB0cnVlKTtcblxuXHRcdHN0YXR1cyA9IHsgYnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSwgYnViYmxld3JhcFVzYWJsZTogdHJ1ZSwgc29jYXRJbnN0YWxsZWQ6IHRydWUgfTtcblx0XHRjb25zdCByZXN1bHQyID0gYXdhaXQgZW5naW5lLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXModHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Mi5mYWlsZWRDaGVjaywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyBjYWNoZXMgbWlzc2luZyBkZXBlbmRlbmNpZXMgdW50aWwgZm9yY2UgcmVmcmVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRsZXQgc3RhdHVzOiBJU2FuZGJveERlcGVuZGVuY3lTdGF0dXMgPSB7IGJ1YmJsZXdyYXBJbnN0YWxsZWQ6IGZhbHNlLCBidWJibGV3cmFwVXNhYmxlOiBmYWxzZSwgc29jYXRJbnN0YWxsZWQ6IHRydWUgfTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7XG5cdFx0XHRjaGVja1NhbmRib3hEZXBlbmRlbmNpZXM6ICgpID0+IHtcblx0XHRcdFx0Y2FsbENvdW50Kys7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoc3RhdHVzKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcygpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IGVuZ2luZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKCk7XG5cblx0XHRzdHJpY3RFcXVhbChmaXJzdC5mYWlsZWRDaGVjaywgVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suRGVwZW5kZW5jaWVzKTtcblx0XHRzdHJpY3RFcXVhbChzZWNvbmQuZmFpbGVkQ2hlY2ssIFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkRlcGVuZGVuY2llcyk7XG5cdFx0c3RyaWN0RXF1YWwoY2FsbENvdW50LCAxLCAnTWlzc2luZyBkZXBlbmRlbmNpZXMgc2hvdWxkIGJlIGNoZWNrZWQgb25jZSBhbmQgY2FjaGVkJyk7XG5cblx0XHRzdGF0dXMgPSB7IGJ1YmJsZXdyYXBJbnN0YWxsZWQ6IHRydWUsIGJ1YmJsZXdyYXBVc2FibGU6IHRydWUsIHNvY2F0SW5zdGFsbGVkOiB0cnVlIH07XG5cdFx0Y29uc3QgY2FjaGVkID0gYXdhaXQgZW5naW5lLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXMoKTtcblx0XHRzdHJpY3RFcXVhbChjYWNoZWQuZmFpbGVkQ2hlY2ssIFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkRlcGVuZGVuY2llcywgJ05vbi1mb3JjZWQgY2hlY2tzIHNob3VsZCBrZWVwIHVzaW5nIHRoZSBjYWNoZWQgbWlzc2luZyBzdGF0dXMnKTtcblx0XHRzdHJpY3RFcXVhbChjYWxsQ291bnQsIDEpO1xuXG5cdFx0Y29uc3QgcmVmcmVzaGVkID0gYXdhaXQgZW5naW5lLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXModHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwocmVmcmVzaGVkLmZhaWxlZENoZWNrLCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKGNhbGxDb3VudCwgMiwgJ0ZvcmNlIHJlZnJlc2ggc2hvdWxkIHJlLWNoZWNrIGRlcGVuZGVuY2llcyBhZnRlciBpbnN0YWxsIG9yIHJlcGFpcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzIHJlcG9ydHMgcmVtZWRpYXRpb24gd2hlbiBidWJibGV3cmFwIGlzIHVudXNhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGNoZWNrU2FuZGJveERlcGVuZGVuY2llczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0YnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdFx0YnViYmxld3JhcFVzYWJsZTogZmFsc2UsXG5cdFx0XHRcdGJ1YmJsZXdyYXBFcnJvcjogJ0NyZWF0aW5nIG5ldyBuYW1lc3BhY2UgZmFpbGVkJyxcblx0XHRcdFx0c29jYXRJbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHRcdGFwcGFybW9yUmVzdHJpY3RzVW5wcml2aWxlZ2VkVXNlck5hbWVzcGFjZXM6IHRydWUsXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcygpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmZhaWxlZENoZWNrLCBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0LnJlbWVkaWF0aW9ucywgW1Rlcm1pbmFsU2FuZGJveFByZUNoZWNrUmVtZWRpYXRpb24uRGlzYWJsZVVucHJpdmlsYWdlZHVzZXJuYW1lc3BhY2VSZXN0cmljdGlvbl0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5kZXRhaWwsICdDcmVhdGluZyBuZXcgbmFtZXNwYWNlIGZhaWxlZCcpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5taXNzaW5nRGVwZW5kZW5jaWVzLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzIGVuYWJsZXMgd2Vha2VyIG5lc3RlZCBzYW5kYm94IHdoZW4gQXBwQXJtb3IgaXMgbm90IHJlc3RyaWN0aW5nIHVzZXIgbmFtZXNwYWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRzZXRTYW5kYm94U2V0dGluZyhBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWR2YW5jZWRSdW50aW1lLCB7IGFsbG93UHR5OiBmYWxzZSB9KTtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7XG5cdFx0XHRjaGVja1NhbmRib3hEZXBlbmRlbmNpZXM6ICgpID0+IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdGJ1YmJsZXdyYXBJbnN0YWxsZWQ6IHRydWUsXG5cdFx0XHRcdGJ1YmJsZXdyYXBVc2FibGU6IGZhbHNlLFxuXHRcdFx0XHRzb2NhdEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdFx0YXBwYXJtb3JSZXN0cmljdHNVbnByaXZpbGVnZWRVc2VyTmFtZXNwYWNlczogZmFsc2UsXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0XHRjb25zdCBlbmdpbmUgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxTYW5kYm94RW5naW5lLCBob3N0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcygpO1xuXHRcdGNvbnN0IGNvbmZpZ1BhdGggPSBhd2FpdCBlbmdpbmUuZ2V0U2FuZGJveENvbmZpZ1BhdGgoKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoY29uZmlnUGF0aCEpISk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuZmFpbGVkQ2hlY2ssIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwoY29uZmlnLmVuYWJsZVdlYWtlck5lc3RlZFNhbmRib3gsIHRydWUpO1xuXHRcdHN0cmljdEVxdWFsKGNvbmZpZy5hbGxvd1B0eSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzIGVuYWJsZXMgd2Vha2VyIG5lc3RlZCBzYW5kYm94IGFmdGVyIEFwcEFybW9yIHJlbWVkaWF0aW9uIGRvZXMgbm90IGZpeCBidWJibGV3cmFwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdGNoZWNrU2FuZGJveERlcGVuZGVuY2llczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0YnViYmxld3JhcEluc3RhbGxlZDogdHJ1ZSxcblx0XHRcdFx0YnViYmxld3JhcFVzYWJsZTogZmFsc2UsXG5cdFx0XHRcdHNvY2F0SW5zdGFsbGVkOiB0cnVlLFxuXHRcdFx0XHRhcHBhcm1vclJlc3RyaWN0c1VucHJpdmlsZWdlZFVzZXJOYW1lc3BhY2VzOiB0cnVlLFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5naW5lID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU2FuZGJveEVuZ2luZSwgaG9zdCkpO1xuXG5cdFx0Y29uc3QgYmVmb3JlUmVtZWRpYXRpb24gPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcygpO1xuXHRcdGNvbnN0IGFmdGVyUmVtZWRpYXRpb24gPSBhd2FpdCBlbmdpbmUuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyh0cnVlKTtcblx0XHRjb25zdCBjb25maWcgPSBKU09OLnBhcnNlKGNyZWF0ZWRGaWxlcy5nZXQoYWZ0ZXJSZW1lZGlhdGlvbi5zYW5kYm94Q29uZmlnUGF0aCEpISk7XG5cblx0XHRzdHJpY3RFcXVhbChiZWZvcmVSZW1lZGlhdGlvbi5mYWlsZWRDaGVjaywgVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suQnViYmxld3JhcCk7XG5cdFx0c3RyaWN0RXF1YWwoYWZ0ZXJSZW1lZGlhdGlvbi5mYWlsZWRDaGVjaywgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChjb25maWcuZW5hYmxlV2Vha2VyTmVzdGVkU2FuZGJveCwgdHJ1ZSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLElBQUksbUJBQW1CO0FBRWpELFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNB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
