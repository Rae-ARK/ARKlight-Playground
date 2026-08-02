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
import { generateUuid } from "../../../../base/common/uuid.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { IEnvironmentService } from "../../../environment/common/environment.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { ISandboxHelperService } from "../../../sandbox/common/sandboxHelperService.js";
import { TerminalClaimKind } from "../../common/state/protocol/state.js";
import { isZsh } from "../agentHostShellUtils.js";
import { IAgentHostTerminalManager } from "../agentHostTerminalManager.js";
import { createAgentHostSandboxEngine } from "./agentHostSandboxEngine.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { DEFAULT_SHELL_COMMAND_TIMEOUT_MS, executeShellCommand, isMultilineCommand, prefixForHistorySuppression, prepareOutputForModel, shellTypeForExecutable } from "../shared/shellCommandExecution.js";
const ALT_BUFFER_MESSAGE = "The command opened the alternate buffer and is still running in the terminal. It likely launched an interactive terminal UI. Use write_bash/write_powershell to interact with it, or shutdown the shell to stop it.";
let ShellManager = class extends Disposable {
  constructor(_sessionUri, workingDirectory, _terminalManager, _logService, _instantiationService, _environmentService, _productService, _agentConfigurationService, _sandboxHelper) {
    super();
    this._sessionUri = _sessionUri;
    this.workingDirectory = workingDirectory;
    this._terminalManager = _terminalManager;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._agentConfigurationService = _agentConfigurationService;
    this._sandboxHelper = _sandboxHelper;
    this._shells = /* @__PURE__ */ new Map();
    this._toolCallShells = /* @__PURE__ */ new Map();
    /** Set of shell ids currently executing a command and unsafe to share. */
    this._busyShellIds = /* @__PURE__ */ new Set();
    /** Release listeners for shells held after a tool returns while the command is still running. */
    this._heldShellReleaseListeners = /* @__PURE__ */ new Map();
    this._onDidAssociateTerminal = this._register(new Emitter());
    this.onDidAssociateTerminal = this._onDidAssociateTerminal.event;
    this._register(toDisposable(() => {
      for (const store of this._heldShellReleaseListeners.values()) {
        store.dispose();
      }
      this._heldShellReleaseListeners.clear();
      for (const shell of this._shells.values()) {
        if (this._terminalManager.hasTerminal(shell.terminalUri)) {
          this._terminalManager.disposeTerminal(shell.terminalUri);
        }
      }
      this._shells.clear();
      this._toolCallShells.clear();
      this._busyShellIds.clear();
    }));
  }
  /**
   * Resolves the session's shell executable via {@link IAgentHostTerminalManager.getDefaultShell}
   * and caches it so every tool call in the session uses the same binary
   * (keeps `shellType`, sentinel format, and history suppression consistent).
   */
  getResolvedExecutable() {
    if (!this._resolvedExecutable) {
      this._resolvedExecutable = this._terminalManager.getDefaultShell();
    }
    return this._resolvedExecutable;
  }
  /**
   * Lazily constructs the per-session {@link TerminalSandboxEngine}. The engine
   * is registered for disposal alongside the {@link ShellManager}; its temp dir
   * is cleaned up best-effort on dispose.
   */
  getOrCreateSandboxEngine() {
    if (!this._sandboxEngine) {
      const sessionId = this._sessionUri.path.split("/").pop() ?? generateUuid();
      const engine = createAgentHostSandboxEngine(
        this._instantiationService,
        this._environmentService,
        this._productService,
        this._agentConfigurationService,
        this._sandboxHelper,
        sessionId,
        this.workingDirectory
      );
      this._register(engine);
      this._register(toDisposable(() => {
        void engine.cleanupTempDir().catch((err) => this._logService.warn("[ShellManager] Sandbox temp dir cleanup failed", err));
      }));
      this._sandboxEngine = engine;
    }
    return this._sandboxEngine;
  }
  /**
   * Acquire a shell of the given type for executing a single command. The
   * returned reference holds the shell exclusively — its terminal will not
   * be handed out to another concurrent caller until the reference is
   * disposed. If no idle shell of the requested type exists, a new one is
   * created.
   */
  async getOrCreateShell(shellType, turnId, toolCallId, cwd) {
    for (const shell2 of this._shells.values()) {
      if (shell2.shellType !== shellType || !this._terminalManager.hasTerminal(shell2.terminalUri)) {
        continue;
      }
      const exitCode = this._terminalManager.getExitCode(shell2.terminalUri);
      if (exitCode !== void 0) {
        this._shells.delete(shell2.id);
        continue;
      }
      if (this._busyShellIds.has(shell2.id)) {
        continue;
      }
      this._busyShellIds.add(shell2.id);
      this._trackToolCall(toolCallId, shell2.id);
      return this._makeReference(shell2);
    }
    const id = generateUuid();
    const terminalUri = `agenthost-terminal://shell/${id}`;
    const claim = {
      kind: TerminalClaimKind.Session,
      session: this._sessionUri.toString(),
      turnId,
      toolCallId
    };
    const shellDisplayName = shellType === "bash" ? "Bash" : "PowerShell";
    const executable = await this.getResolvedExecutable();
    await this._terminalManager.createTerminal({
      channel: terminalUri,
      claim,
      name: shellDisplayName,
      cwd: cwd ?? this.workingDirectory?.fsPath
    }, { shell: executable, preventShellHistory: true, nonInteractive: true });
    const shell = { id, terminalUri, shellType, executable };
    this._shells.set(id, shell);
    this._busyShellIds.add(id);
    this._trackToolCall(toolCallId, id);
    this._logService.info(`[ShellManager] Created ${shellType} shell ${id} (terminal=${terminalUri},  executable=${executable})`);
    return this._makeReference(shell);
  }
  _makeReference(shell) {
    let disposed = false;
    return {
      object: shell,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        this._busyShellIds.delete(shell.id);
      }
    };
  }
  holdShellUntilCommandFinishes(shell) {
    if (this._heldShellReleaseListeners.has(shell.id)) {
      return;
    }
    const store = new DisposableStore();
    const release = () => {
      this._busyShellIds.delete(shell.id);
      this._heldShellReleaseListeners.delete(shell.id);
      store.dispose();
    };
    store.add(this._terminalManager.onCommandFinished(shell.terminalUri, release));
    store.add(this._terminalManager.onExit(shell.terminalUri, release));
    this._heldShellReleaseListeners.set(shell.id, store);
  }
  _trackToolCall(toolCallId, shellId) {
    this._toolCallShells.set(toolCallId, shellId);
    const shell = this._shells.get(shellId);
    if (shell) {
      const displayName = shell.shellType === "bash" ? "Bash" : "PowerShell";
      this._onDidAssociateTerminal.fire({ toolCallId, terminalUri: shell.terminalUri, displayName });
    }
  }
  getTerminalUriForToolCall(toolCallId) {
    const shellId = this._toolCallShells.get(toolCallId);
    if (!shellId) {
      return void 0;
    }
    return this._shells.get(shellId)?.terminalUri;
  }
  getShell(id) {
    return this._shells.get(id);
  }
  listShells() {
    const result = [];
    for (const shell of this._shells.values()) {
      if (this._terminalManager.hasTerminal(shell.terminalUri)) {
        result.push(shell);
      }
    }
    return result;
  }
  shutdownShell(id) {
    const shell = this._shells.get(id);
    if (!shell) {
      return false;
    }
    this._heldShellReleaseListeners.get(id)?.dispose();
    this._heldShellReleaseListeners.delete(id);
    this._terminalManager.disposeTerminal(shell.terminalUri);
    this._shells.delete(id);
    this._busyShellIds.delete(id);
    this._logService.info(`[ShellManager] Shut down shell ${id}`);
    return true;
  }
};
ShellManager = __decorateClass([
  __decorateParam(2, IAgentHostTerminalManager),
  __decorateParam(3, ILogService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IEnvironmentService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IAgentConfigurationService),
  __decorateParam(8, ISandboxHelperService)
], ShellManager);
function makeSuccessResult(text) {
  return { textResultForLlm: text, resultType: "success" };
}
function makeFailureResult(text, error) {
  return { textResultForLlm: text, resultType: "failure", error };
}
function makeExecutionResult(toolResult, options) {
  return { toolResult, keepShellBusy: options?.keepShellBusy };
}
function shellCommandResultToExecutionResult(result, timeoutMs) {
  switch (result.status) {
    case "completed": {
      const exitCode = result.exitCode ?? 0;
      const text = `Exit code: ${exitCode}
${result.output}`;
      return makeExecutionResult(exitCode === 0 ? makeSuccessResult(text) : makeFailureResult(text));
    }
    case "shellExited":
      return makeExecutionResult(makeFailureResult(`Shell exited with code ${result.exitCode}
${result.output}`));
    case "timeout":
      return makeExecutionResult(makeFailureResult(
        `Command timed out after ${Math.round(timeoutMs / 1e3)}s. Partial output:
${result.output}`,
        "timeout"
      ));
    case "background":
      return makeExecutionResult(
        makeSuccessResult("The user chose to continue this command in the background. The terminal is still running."),
        { keepShellBusy: true }
      );
    case "altBuffer":
      return makeExecutionResult(makeFailureResult(ALT_BUFFER_MESSAGE, "alternateBuffer"), { keepShellBusy: true });
  }
}
async function executeCommandInShell(shell, command, timeoutMs, terminalManager, logService) {
  const result = shellCommandResultToExecutionResult(
    await executeShellCommand(shell, command, timeoutMs, terminalManager, logService),
    timeoutMs
  );
  return {
    ...result,
    toolResult: {
      ...result.toolResult,
      textResultForLlm: `Shell ID: ${shell.id}
${result.toolResult.textResultForLlm}`
    }
  };
}
async function createShellTools(shellManager, terminalManager, logService, confirmUnsandboxedExecution) {
  const executable = await shellManager.getResolvedExecutable();
  const shellType = shellTypeForExecutable(executable);
  const engine = shellManager.getOrCreateSandboxEngine();
  const sandboxEnabled = await engine.isEnabled();
  const networkDomains = sandboxEnabled ? engine.getResolvedNetworkDomains() : void 0;
  const primaryTool = {
    name: shellType,
    description: shellType === "bash" ? isZsh(executable) ? createZshModelDescription(sandboxEnabled, networkDomains) : createBashModelDescription(sandboxEnabled, networkDomains) : createPowerShellModelDescription(shellType, executable, sandboxEnabled, networkDomains),
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 120000)" },
        ...sandboxEnabled ? {
          requestUnsandboxedExecution: {
            type: "boolean",
            description: "Request that this command run outside the sandbox. Only set this after first executing the command in the sandbox and observing that sandboxing caused the failure. The user will be prompted before the command runs unsandboxed."
          },
          requestUnsandboxedExecutionReason: {
            type: "string",
            description: "A short explanation of the sandboxed execution failure or blocked-domain requirement that justifies retrying outside the sandbox. Only provide this when requestUnsandboxedExecution is true."
          }
        } : {}
      },
      required: ["command"]
    },
    overridesBuiltInTool: true,
    handler: async (args, invocation) => {
      const timeoutMs = args.timeout ?? DEFAULT_SHELL_COMMAND_TIMEOUT_MS;
      const ref = await shellManager.getOrCreateShell(
        shellType,
        invocation.toolCallId,
        invocation.toolCallId
      );
      let shouldReleaseShell = true;
      try {
        let commandToRun = args.command;
        if (sandboxEnabled) {
          if (args.requestUnsandboxedExecution && !engine.areUnsandboxedCommandsAllowed()) {
            return makeFailureResult(
              "Unsandboxed execution is disabled by the chat.agent.sandbox.allowUnsandboxedCommands setting.",
              "unsandboxed_disabled"
            );
          }
          const requestUnsandboxedConfirmation = async (blockedDomains) => {
            if (!confirmUnsandboxedExecution) {
              const blocked = blockedDomains?.join(", ") ?? "(unknown)";
              return makeFailureResult(
                `Command requires approval to run outside the sandbox. Blocked domains: ${blocked}. Re-run with requestUnsandboxedExecution=true and requestUnsandboxedExecutionReason explaining why unsandboxed access is required.`,
                "sandbox_blocked"
              );
            }
            const approved = await confirmUnsandboxedExecution({
              toolCallId: invocation.toolCallId,
              toolName: invocation.toolName,
              shellExecutable: executable,
              command: args.command,
              reason: args.requestUnsandboxedExecutionReason,
              blockedDomains
            });
            return approved;
          };
          let wrapped = await engine.wrapCommand(
            args.command,
            args.requestUnsandboxedExecution,
            executable,
            ref.object.shellType === "bash" ? shellManager.workingDirectory : void 0
          );
          if (args.requestUnsandboxedExecution && !wrapped.isSandboxWrapped) {
            const decision = await requestUnsandboxedConfirmation(wrapped.blockedDomains);
            if (typeof decision !== "boolean") {
              return decision;
            }
            if (!decision) {
              const blocked = wrapped.blockedDomains?.join(", ") ?? "(none)";
              return makeFailureResult(
                `User declined to run command outside the sandbox. Blocked domains: ${blocked}.`,
                "sandbox_blocked"
              );
            }
          }
          if (wrapped.requiresUnsandboxConfirmation) {
            const decision = await requestUnsandboxedConfirmation(wrapped.blockedDomains);
            if (typeof decision !== "boolean") {
              return decision;
            }
            if (!decision) {
              const blocked = wrapped.blockedDomains?.join(", ") ?? "(unknown)";
              return makeFailureResult(
                `User declined to run command outside the sandbox. Blocked domains: ${blocked}.`,
                "sandbox_blocked"
              );
            }
            wrapped = await engine.wrapCommand(
              args.command,
              true,
              executable,
              ref.object.shellType === "bash" ? shellManager.workingDirectory : void 0
            );
          }
          commandToRun = wrapped.command;
        }
        const result = await executeCommandInShell(ref.object, commandToRun, timeoutMs, terminalManager, logService);
        if (result.keepShellBusy) {
          shouldReleaseShell = false;
          shellManager.holdShellUntilCommandFinishes(ref.object);
        }
        return result.toolResult;
      } finally {
        if (shouldReleaseShell) {
          ref.dispose();
        }
      }
    }
  };
  const readTool = {
    name: `read_${shellType}`,
    description: `Read the latest output from a running ${shellType} shell.`,
    parameters: {
      type: "object",
      properties: {
        shell_id: { type: "string", description: "Shell ID to read from (optional; uses latest shell if omitted)" }
      }
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: (args) => {
      const shells = shellManager.listShells();
      const shell = args.shell_id ? shellManager.getShell(args.shell_id) : shells[shells.length - 1];
      if (!shell) {
        return makeFailureResult("No active shell found.", "no_shell");
      }
      const content = terminalManager.getContent(shell.terminalUri);
      if (!content) {
        return makeSuccessResult("(no output)");
      }
      return makeSuccessResult(prepareOutputForModel(content));
    }
  };
  const writeTool = {
    name: `write_${shellType}`,
    description: `Send input to a running ${shellType} shell (e.g. answering a prompt, sending Ctrl+C).`,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Text to write to the shell stdin" }
      },
      required: ["command"]
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: async (args) => {
      const shells = shellManager.listShells();
      const shell = shells[shells.length - 1];
      if (!shell) {
        return makeFailureResult("No active shell found.", "no_shell");
      }
      await terminalManager.sendText(shell.terminalUri, args.command, { shouldExecute: false });
      return makeSuccessResult("Input sent to shell.");
    }
  };
  const shutdownTool = {
    name: shellType === "bash" ? "bash_shutdown" : `${shellType}_shutdown`,
    description: `Stop a ${shellType} shell.`,
    parameters: {
      type: "object",
      properties: {
        shell_id: { type: "string", description: "Shell ID to stop (optional; stops latest shell if omitted)" }
      }
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: (args) => {
      if (args.shell_id) {
        const success = shellManager.shutdownShell(args.shell_id);
        return success ? makeSuccessResult("Shell stopped.") : makeFailureResult("Shell not found.", "not_found");
      }
      const shells = shellManager.listShells();
      const shell = shells[shells.length - 1];
      if (!shell) {
        return makeFailureResult("No active shell to stop.", "no_shell");
      }
      shellManager.shutdownShell(shell.id);
      return makeSuccessResult("Shell stopped.");
    }
  };
  const listTool = {
    name: `list_${shellType}`,
    description: `List active ${shellType} shell instances.`,
    parameters: { type: "object", properties: {} },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: () => {
      const shells = shellManager.listShells();
      if (shells.length === 0) {
        return makeSuccessResult("No active shells.");
      }
      const descriptions = shells.map((s) => {
        const exitCode = terminalManager.getExitCode(s.terminalUri);
        const status = exitCode !== void 0 ? `exited (${exitCode})` : "running";
        return `- ${s.id}: ${s.shellType} [${status}]`;
      });
      return makeSuccessResult(descriptions.join("\n"));
    }
  };
  const otherShellType = shellType === "bash" ? "powershell" : "bash";
  const redirectMessage = `This tool is disabled because the configured shell is ${executable}. Use the \`${shellType}\` tool instead.`;
  const redirectTool = {
    name: otherShellType,
    description: redirectMessage,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
        timeout: { type: "number", description: "Timeout in milliseconds (default 120000)" }
      },
      required: ["command"]
    },
    overridesBuiltInTool: true,
    skipPermission: true,
    handler: () => {
      return makeFailureResult(redirectMessage, "wrong_shell");
    }
  };
  return [primaryTool, readTool, writeTool, shutdownTool, listTool, redirectTool];
}
function isWindowsPowerShell(envShell) {
  return envShell.endsWith("System32\\WindowsPowerShell\\v1.0\\powershell.exe");
}
function createPowerShellModelDescription(shellType, shellPath, isSandboxEnabled, networkDomains) {
  const isWinPwsh = isWindowsPowerShell(shellPath);
  const parts = [
    `This tool allows you to execute ${isWinPwsh ? "Windows PowerShell 5.1" : "PowerShell"} commands in a persistent terminal session, preserving environment variables, working directory, and other context across multiple commands.`,
    "",
    "Command Execution:",
    // IMPORTANT: PowerShell 5 does not support `&&` so always re-write them to `;`. Note that
    // the behavior of `&&` differs a little from `;` but in general it's fine
    isWinPwsh ? "- Use semicolons ; to chain commands on one line, NEVER use && even when asked explicitly" : "- Prefer ; when chaining commands on one line",
    "- Prefer pipelines | for object-based data flow",
    '- Never create a sub-shell (eg. powershell -c "command") unless explicitly asked',
    "",
    "Directory Management:",
    "- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected",
    "- By default (mode=sync), shell and cwd are reused by subsequent sync commands",
    "- Use $PWD or Get-Location for current directory",
    "- Use Push-Location/Pop-Location for directory stack",
    "",
    "Program Execution:",
    "- Supports .NET, Python, Node.js, and other executables",
    "- Install modules via Install-Module, Install-Package",
    "- Use Get-Command to verify cmdlet/function availability",
    "",
    "Async Mode:",
    "- For long-running tasks (e.g., servers), use mode=async",
    "- Returns a terminal ID for checking status and runtime later",
    "- Use Start-Job for background PowerShell jobs",
    "",
    `Use write_${shellType} to send commands or input to a terminal session.`
  ];
  if (isSandboxEnabled) {
    parts.push(...createSandboxLines(networkDomains));
  }
  parts.push(
    "",
    "Output Management:",
    "- Output is automatically truncated if longer than 60KB to prevent context overflow",
    "- Use Select-Object, Where-Object, Format-Table to filter output",
    "- Use -First/-Last parameters to limit results",
    "- For pager commands, add | Out-String or | Format-List",
    "",
    "Best Practices:",
    "- Use proper cmdlet names instead of aliases in scripts",
    '- Quote paths with spaces: "C:\\Path With Spaces"',
    "- Prefer PowerShell cmdlets over external commands when available",
    "- Prefer idiomatic PowerShell like Get-ChildItem instead of dir or ls for file listings",
    "- Use Test-Path to check file/directory existence",
    "- Be specific with Select-Object properties to avoid excessive output",
    "- Avoid printing credentials unless absolutely required",
    "",
    "Interactive Input Handling:",
    "- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the ask_user tool to collect the needed values from the user, then send them.",
    `- Send exactly one answer per prompt using write_${shellType}. Never send multiple answers in a single send.`,
    `- After each send, call read_${shellType} to read the next prompt before sending the next answer.`,
    "- Continue one prompt at a time until the command finishes."
  );
  return parts.join("\n");
}
function createSandboxLines(networkDomains) {
  const lines = [
    "",
    "Sandboxing:",
    "- ATTENTION: Terminal sandboxing is enabled, commands run in a sandbox by default",
    "- When executing commands within the sandboxed environment, all operations requiring a temporary directory must utilize the $TMPDIR environment variable. The /tmp directory is not guaranteed to be accessible or writable and must be avoided",
    "- Tools and scripts should respect the TMPDIR environment variable, which is automatically set to an appropriate path within the sandbox",
    "- When a command fails due to sandbox restrictions, immediately re-run it with requestUnsandboxedExecution=true. Do NOT ask the user for permission \u2014 setting this flag automatically shows a confirmation prompt to the user",
    "- Only set requestUnsandboxedExecution=true when there is evidence of failures caused by the sandbox, e.g. 'Operation not permitted' errors, network failures, or file access errors, etc",
    "- Do NOT set requestUnsandboxedExecution=true without first executing the command in sandbox mode. Always try the command in the sandbox first, and only set requestUnsandboxedExecution=true when retrying after that sandboxed execution failed due to sandbox restrictions.",
    "- When setting requestUnsandboxedExecution=true, also provide requestUnsandboxedExecutionReason explaining why the command needs unsandboxed access"
  ];
  if (networkDomains) {
    const deniedSet = new Set(networkDomains.deniedDomains);
    const effectiveAllowed = networkDomains.allowedDomains.filter((d) => !deniedSet.has(d));
    if (effectiveAllowed.length === 0) {
      lines.push("- All network access is blocked in the sandbox");
    } else {
      lines.push(`- Only the following domains are accessible in the sandbox (all other network access is blocked): ${effectiveAllowed.join(", ")}`);
    }
    if (networkDomains.deniedDomains.length > 0) {
      lines.push(`- The following domains are explicitly blocked in the sandbox: ${networkDomains.deniedDomains.join(", ")}`);
    }
  }
  return lines;
}
function createGenericDescription(shellType, isSandboxEnabled, networkDomains) {
  const parts = [`
Command Execution:
- Use && to chain simple commands on one line
- Prefer pipelines | over temporary files for data flow
- Never create a sub-shell (eg. bash -c "command") unless explicitly asked

Directory Management:
- Prefer relative paths when navigating directories, only use absolute when the path is far away or the current cwd is not expected
- By default (mode=sync), shell and cwd are reused by subsequent sync commands
- Use $PWD for current directory references
- Consider using pushd/popd for directory stack management
- Supports directory shortcuts like ~ and -

Program Execution:
- Supports Python, Node.js, and other executables
- Install packages via package managers (brew, apt, etc.)
- Use which or command -v to verify command availability

Async Mode:
- For long-running tasks (e.g., servers), use mode=async
- Returns a terminal ID for checking status and runtime later

Use write_${shellType} to send commands or input to a terminal session.`];
  if (isSandboxEnabled) {
    parts.push(createSandboxLines(networkDomains).join("\n"));
  }
  parts.push(`

Output Management:
- Output is automatically truncated if longer than 60KB to prevent context overflow
- Use head, tail, grep, awk to filter and limit output size
- For pager commands, disable paging: git --no-pager or add | cat
- Use wc -l to count lines before displaying large outputs

Best Practices:
- Quote variables: "$var" instead of $var to handle spaces
- Use find with -exec or xargs for file operations
- Be specific with commands to avoid excessive output
- Avoid printing credentials unless absolutely required
- NEVER run sleep or similar wait commands in a terminal. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input. Do NOT poll for completion.

Interactive Input Handling:
- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the ask_user tool to collect the needed values from the user, then send them.
- Send exactly one answer per prompt using write_${shellType}. Never send multiple answers in a single send.
- After each send, call read_${shellType} to read the next prompt before sending the next answer.
- Continue one prompt at a time until the command finishes.`);
  return parts.join("");
}
function createBashModelDescription(isSandboxEnabled, networkDomains) {
  return [
    "This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription("bash", isSandboxEnabled, networkDomains),
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution",
    "- Use set -e at start of complex commands to exit on errors"
  ].join("\n");
}
function createZshModelDescription(isSandboxEnabled, networkDomains) {
  return [
    "This tool allows you to execute shell commands in a persistent zsh terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription("bash", isSandboxEnabled, networkDomains),
    "- Use type to check command type (builtin, function, alias)",
    "- Use jobs, fg, bg for job control",
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution",
    "- Take advantage of zsh globbing features (**, extended globs). Note: unmatched globs fail by default (zsh: no matches found) - use a glob qualifier like *(N) or quote the glob if it should be literal",
    "",
    "zsh pitfalls - these WILL cause errors or hangs:",
    "- NEVER use bare == or === as separators (e.g. echo === triggers zsh equals expansion). Quote them: echo '==='",
    "- NEVER use status as a variable name (it is read-only in zsh). Use exit_code or ret instead"
  ].join("\n");
}
export {
  ShellManager,
  createShellTools,
  isMultilineCommand,
  prefixForHistorySuppression,
  shellTypeForExecutable
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdFNoZWxsVG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRvb2wsIFRvb2xSZXN1bHRPYmplY3QgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdHlwZSBJUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2FuZGJveEhlbHBlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zYW5kYm94L2NvbW1vbi9zYW5kYm94SGVscGVyU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zIH0gZnJvbSAnLi4vLi4vLi4vc2FuZGJveC9jb21tb24vdGVybWluYWxTYW5kYm94U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFNhbmRib3hFbmdpbmUgfSBmcm9tICcuLi8uLi8uLi9zYW5kYm94L2NvbW1vbi90ZXJtaW5hbFNhbmRib3hFbmdpbmUuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDbGFpbUtpbmQsIHR5cGUgVGVybWluYWxTZXNzaW9uQ2xhaW0gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgaXNac2ggfSBmcm9tICcuLi9hZ2VudEhvc3RTaGVsbFV0aWxzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgfSBmcm9tICcuLi9hZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRIb3N0U2FuZGJveEVuZ2luZSB9IGZyb20gJy4vYWdlbnRIb3N0U2FuZGJveEVuZ2luZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9TSEVMTF9DT01NQU5EX1RJTUVPVVRfTVMsIGV4ZWN1dGVTaGVsbENvbW1hbmQsIGlzTXVsdGlsaW5lQ29tbWFuZCwgcHJlZml4Rm9ySGlzdG9yeVN1cHByZXNzaW9uLCBwcmVwYXJlT3V0cHV0Rm9yTW9kZWwsIHNoZWxsVHlwZUZvckV4ZWN1dGFibGUsIHR5cGUgSVNoZWxsQ29tbWFuZFJlc3VsdCwgdHlwZSBTaGVsbFR5cGUgfSBmcm9tICcuLi9zaGFyZWQvc2hlbGxDb21tYW5kRXhlY3V0aW9uLmpzJztcblxuLy8gUmUtZXhwb3J0ZWQgZm9yIGNvbnN1bWVycyAoYW5kIHRlc3RzKSB0aGF0IGhpc3RvcmljYWxseSBpbXBvcnRlZCB0aGVzZVxuLy8gc2hlbGwgaGVscGVycyBmcm9tIHRoaXMgbW9kdWxlLiBUaGVpciBjYW5vbmljYWwgaG9tZSBpcyB0aGUgc2hhcmVkLFxuLy8gYWdlbnQtYWdub3N0aWMgc2hlbGxDb21tYW5kRXhlY3V0aW9uIG1vZHVsZS5cbmV4cG9ydCB7IGlzTXVsdGlsaW5lQ29tbWFuZCwgcHJlZml4Rm9ySGlzdG9yeVN1cHByZXNzaW9uLCBzaGVsbFR5cGVGb3JFeGVjdXRhYmxlIH07XG5leHBvcnQgdHlwZSB7IFNoZWxsVHlwZSB9O1xuXG4vKipcbiAqIE1lc3NhZ2UgcmV0dXJuZWQgdG8gdGhlIG1vZGVsIHdoZW4gYSBjb21tYW5kIHN3aXRjaGVzIHRvIHRoZSB0ZXJtaW5hbCdzXG4gKiBhbHRlcm5hdGUgYnVmZmVyICh0eXBpY2FsbHkgYW4gaW50ZXJhY3RpdmUgZnVsbC1zY3JlZW4gVUkpLlxuICovXG5jb25zdCBBTFRfQlVGRkVSX01FU1NBR0UgPSAnVGhlIGNvbW1hbmQgb3BlbmVkIHRoZSBhbHRlcm5hdGUgYnVmZmVyIGFuZCBpcyBzdGlsbCBydW5uaW5nIGluIHRoZSB0ZXJtaW5hbC4gSXQgbGlrZWx5IGxhdW5jaGVkIGFuIGludGVyYWN0aXZlIHRlcm1pbmFsIFVJLiBVc2Ugd3JpdGVfYmFzaC93cml0ZV9wb3dlcnNoZWxsIHRvIGludGVyYWN0IHdpdGggaXQsIG9yIHNodXRkb3duIHRoZSBzaGVsbCB0byBzdG9wIGl0Lic7XG5cbi8qKlxuICogVHJhY2tzIGEgc2luZ2xlIHBlcnNpc3RlbnQgc2hlbGwgaW5zdGFuY2UgYmFja2VkIGJ5IGEgbWFuYWdlZCBQVFkgdGVybWluYWwuXG4gKi9cbmludGVyZmFjZSBJTWFuYWdlZFNoZWxsIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdGVybWluYWxVcmk6IHN0cmluZztcblx0cmVhZG9ubHkgc2hlbGxUeXBlOiBTaGVsbFR5cGU7XG5cdHJlYWRvbmx5IGV4ZWN1dGFibGU6IHN0cmluZztcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTaGVsbE1hbmFnZXJcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFBlci1zZXNzaW9uIG1hbmFnZXIgZm9yIHBlcnNpc3RlbnQgc2hlbGwgaW5zdGFuY2VzLiBFYWNoIHNoZWxsIGlzIGJhY2tlZCBieVxuICogYSB7QGxpbmsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcn0gdGVybWluYWwgYW5kIHBhcnRpY2lwYXRlcyBpbiBBSFAgdGVybWluYWxcbiAqIGNsYWltIHNlbWFudGljcy5cbiAqXG4gKiBDcmVhdGVkIHZpYSB7QGxpbmsgSUluc3RhbnRpYXRpb25TZXJ2aWNlfSBvbmNlIHBlciBzZXNzaW9uIGFuZCBkaXNwb3NlZCB3aGVuXG4gKiB0aGUgc2Vzc2lvbiBlbmRzLlxuICovXG5leHBvcnQgY2xhc3MgU2hlbGxNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hlbGxzID0gbmV3IE1hcDxzdHJpbmcsIElNYW5hZ2VkU2hlbGw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xDYWxsU2hlbGxzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfcmVzb2x2ZWRFeGVjdXRhYmxlOiBQcm9taXNlPHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NhbmRib3hFbmdpbmU6IFRlcm1pbmFsU2FuZGJveEVuZ2luZSB8IHVuZGVmaW5lZDtcblx0LyoqIFNldCBvZiBzaGVsbCBpZHMgY3VycmVudGx5IGV4ZWN1dGluZyBhIGNvbW1hbmQgYW5kIHVuc2FmZSB0byBzaGFyZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYnVzeVNoZWxsSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKiBSZWxlYXNlIGxpc3RlbmVycyBmb3Igc2hlbGxzIGhlbGQgYWZ0ZXIgYSB0b29sIHJldHVybnMgd2hpbGUgdGhlIGNvbW1hbmQgaXMgc3RpbGwgcnVubmluZy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaGVsZFNoZWxsUmVsZWFzZUxpc3RlbmVycyA9IG5ldyBNYXA8c3RyaW5nLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBc3NvY2lhdGVUZXJtaW5hbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgdG9vbENhbGxJZDogc3RyaW5nOyB0ZXJtaW5hbFVyaTogc3RyaW5nOyBkaXNwbGF5TmFtZTogc3RyaW5nIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFzc29jaWF0ZVRlcm1pbmFsOiBFdmVudDx7IHRvb2xDYWxsSWQ6IHN0cmluZzsgdGVybWluYWxVcmk6IHN0cmluZzsgZGlzcGxheU5hbWU6IHN0cmluZyB9PiA9IHRoaXMuX29uRGlkQXNzb2NpYXRlVGVybWluYWwuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblVyaTogVVJJLFxuXHRcdHB1YmxpYyByZWFkb25seSB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxNYW5hZ2VyOiBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRDb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTYW5kYm94SGVscGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zYW5kYm94SGVscGVyOiBJU2FuZGJveEhlbHBlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzdG9yZSBvZiB0aGlzLl9oZWxkU2hlbGxSZWxlYXNlTGlzdGVuZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hlbGRTaGVsbFJlbGVhc2VMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3Qgc2hlbGwgb2YgdGhpcy5fc2hlbGxzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbE1hbmFnZXIuaGFzVGVybWluYWwoc2hlbGwudGVybWluYWxVcmkpKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxNYW5hZ2VyLmRpc3Bvc2VUZXJtaW5hbChzaGVsbC50ZXJtaW5hbFVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3NoZWxscy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fdG9vbENhbGxTaGVsbHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2J1c3lTaGVsbElkcy5jbGVhcigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgc2Vzc2lvbidzIHNoZWxsIGV4ZWN1dGFibGUgdmlhIHtAbGluayBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmdldERlZmF1bHRTaGVsbH1cblx0ICogYW5kIGNhY2hlcyBpdCBzbyBldmVyeSB0b29sIGNhbGwgaW4gdGhlIHNlc3Npb24gdXNlcyB0aGUgc2FtZSBiaW5hcnlcblx0ICogKGtlZXBzIGBzaGVsbFR5cGVgLCBzZW50aW5lbCBmb3JtYXQsIGFuZCBoaXN0b3J5IHN1cHByZXNzaW9uIGNvbnNpc3RlbnQpLlxuXHQgKi9cblx0Z2V0UmVzb2x2ZWRFeGVjdXRhYmxlKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKCF0aGlzLl9yZXNvbHZlZEV4ZWN1dGFibGUpIHtcblx0XHRcdHRoaXMuX3Jlc29sdmVkRXhlY3V0YWJsZSA9IHRoaXMuX3Rlcm1pbmFsTWFuYWdlci5nZXREZWZhdWx0U2hlbGwoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVkRXhlY3V0YWJsZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXppbHkgY29uc3RydWN0cyB0aGUgcGVyLXNlc3Npb24ge0BsaW5rIFRlcm1pbmFsU2FuZGJveEVuZ2luZX0uIFRoZSBlbmdpbmVcblx0ICogaXMgcmVnaXN0ZXJlZCBmb3IgZGlzcG9zYWwgYWxvbmdzaWRlIHRoZSB7QGxpbmsgU2hlbGxNYW5hZ2VyfTsgaXRzIHRlbXAgZGlyXG5cdCAqIGlzIGNsZWFuZWQgdXAgYmVzdC1lZmZvcnQgb24gZGlzcG9zZS5cblx0ICovXG5cdGdldE9yQ3JlYXRlU2FuZGJveEVuZ2luZSgpOiBUZXJtaW5hbFNhbmRib3hFbmdpbmUge1xuXHRcdGlmICghdGhpcy5fc2FuZGJveEVuZ2luZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fc2Vzc2lvblVyaS5wYXRoLnNwbGl0KCcvJykucG9wKCkgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRjb25zdCBlbmdpbmUgPSBjcmVhdGVBZ2VudEhvc3RTYW5kYm94RW5naW5lKFxuXHRcdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZSxcblx0XHRcdFx0dGhpcy5fYWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdFx0dGhpcy5fc2FuZGJveEhlbHBlcixcblx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHR0aGlzLndvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZW5naW5lKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHZvaWQgZW5naW5lLmNsZWFudXBUZW1wRGlyKCkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW1NoZWxsTWFuYWdlcl0gU2FuZGJveCB0ZW1wIGRpciBjbGVhbnVwIGZhaWxlZCcsIGVycikpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fc2FuZGJveEVuZ2luZSA9IGVuZ2luZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmRib3hFbmdpbmU7XG5cdH1cblxuXHQvKipcblx0ICogQWNxdWlyZSBhIHNoZWxsIG9mIHRoZSBnaXZlbiB0eXBlIGZvciBleGVjdXRpbmcgYSBzaW5nbGUgY29tbWFuZC4gVGhlXG5cdCAqIHJldHVybmVkIHJlZmVyZW5jZSBob2xkcyB0aGUgc2hlbGwgZXhjbHVzaXZlbHkgXHUyMDE0IGl0cyB0ZXJtaW5hbCB3aWxsIG5vdFxuXHQgKiBiZSBoYW5kZWQgb3V0IHRvIGFub3RoZXIgY29uY3VycmVudCBjYWxsZXIgdW50aWwgdGhlIHJlZmVyZW5jZSBpc1xuXHQgKiBkaXNwb3NlZC4gSWYgbm8gaWRsZSBzaGVsbCBvZiB0aGUgcmVxdWVzdGVkIHR5cGUgZXhpc3RzLCBhIG5ldyBvbmUgaXNcblx0ICogY3JlYXRlZC5cblx0ICovXG5cdGFzeW5jIGdldE9yQ3JlYXRlU2hlbGwoXG5cdFx0c2hlbGxUeXBlOiBTaGVsbFR5cGUsXG5cdFx0dHVybklkOiBzdHJpbmcsXG5cdFx0dG9vbENhbGxJZDogc3RyaW5nLFxuXHRcdGN3ZD86IHN0cmluZyxcblx0KTogUHJvbWlzZTxJUmVmZXJlbmNlPElNYW5hZ2VkU2hlbGw+PiB7XG5cdFx0Zm9yIChjb25zdCBzaGVsbCBvZiB0aGlzLl9zaGVsbHMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChzaGVsbC5zaGVsbFR5cGUgIT09IHNoZWxsVHlwZSB8fCAhdGhpcy5fdGVybWluYWxNYW5hZ2VyLmhhc1Rlcm1pbmFsKHNoZWxsLnRlcm1pbmFsVXJpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gdGhpcy5fdGVybWluYWxNYW5hZ2VyLmdldEV4aXRDb2RlKHNoZWxsLnRlcm1pbmFsVXJpKTtcblx0XHRcdGlmIChleGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3NoZWxscy5kZWxldGUoc2hlbGwuaWQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9idXN5U2hlbGxJZHMuaGFzKHNoZWxsLmlkKSkge1xuXHRcdFx0XHQvLyBTa2lwIFx1MjAxNCBhIGNvbW1hbmQgaXMgYWxyZWFkeSBydW5uaW5nIG9uIHRoaXMgdGVybWluYWwuIFNoYXJpbmdcblx0XHRcdFx0Ly8gaXQgd291bGQgaW50ZXJsZWF2ZSBpbnB1dC9vdXRwdXQgYW5kIGdhcmJsZSBib3RoIGNvbW1hbmRzLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2J1c3lTaGVsbElkcy5hZGQoc2hlbGwuaWQpO1xuXHRcdFx0dGhpcy5fdHJhY2tUb29sQ2FsbCh0b29sQ2FsbElkLCBzaGVsbC5pZCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWFrZVJlZmVyZW5jZShzaGVsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0ZXJtaW5hbFVyaSA9IGBhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC8ke2lkfWA7XG5cblx0XHRjb25zdCBjbGFpbTogVGVybWluYWxTZXNzaW9uQ2xhaW0gPSB7XG5cdFx0XHRraW5kOiBUZXJtaW5hbENsYWltS2luZC5TZXNzaW9uLFxuXHRcdFx0c2Vzc2lvbjogdGhpcy5fc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2hlbGxEaXNwbGF5TmFtZSA9IHNoZWxsVHlwZSA9PT0gJ2Jhc2gnID8gJ0Jhc2gnIDogJ1Bvd2VyU2hlbGwnO1xuXHRcdGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCB0aGlzLmdldFJlc29sdmVkRXhlY3V0YWJsZSgpO1xuXG5cdFx0YXdhaXQgdGhpcy5fdGVybWluYWxNYW5hZ2VyLmNyZWF0ZVRlcm1pbmFsKHtcblx0XHRcdGNoYW5uZWw6IHRlcm1pbmFsVXJpLFxuXHRcdFx0Y2xhaW0sXG5cdFx0XHRuYW1lOiBzaGVsbERpc3BsYXlOYW1lLFxuXHRcdFx0Y3dkOiBjd2QgPz8gdGhpcy53b3JraW5nRGlyZWN0b3J5Py5mc1BhdGgsXG5cdFx0fSwgeyBzaGVsbDogZXhlY3V0YWJsZSwgcHJldmVudFNoZWxsSGlzdG9yeTogdHJ1ZSwgbm9uSW50ZXJhY3RpdmU6IHRydWUgfSk7XG5cblx0XHRjb25zdCBzaGVsbDogSU1hbmFnZWRTaGVsbCA9IHsgaWQsIHRlcm1pbmFsVXJpLCBzaGVsbFR5cGUsIGV4ZWN1dGFibGUgfTtcblx0XHR0aGlzLl9zaGVsbHMuc2V0KGlkLCBzaGVsbCk7XG5cdFx0dGhpcy5fYnVzeVNoZWxsSWRzLmFkZChpZCk7XG5cdFx0dGhpcy5fdHJhY2tUb29sQ2FsbCh0b29sQ2FsbElkLCBpZCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtTaGVsbE1hbmFnZXJdIENyZWF0ZWQgJHtzaGVsbFR5cGV9IHNoZWxsICR7aWR9ICh0ZXJtaW5hbD0ke3Rlcm1pbmFsVXJpfSwgIGV4ZWN1dGFibGU9JHtleGVjdXRhYmxlfSlgKTtcblx0XHRyZXR1cm4gdGhpcy5fbWFrZVJlZmVyZW5jZShzaGVsbCk7XG5cdH1cblxuXHRwcml2YXRlIF9tYWtlUmVmZXJlbmNlKHNoZWxsOiBJTWFuYWdlZFNoZWxsKTogSVJlZmVyZW5jZTxJTWFuYWdlZFNoZWxsPiB7XG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9iamVjdDogc2hlbGwsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2J1c3lTaGVsbElkcy5kZWxldGUoc2hlbGwuaWQpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0aG9sZFNoZWxsVW50aWxDb21tYW5kRmluaXNoZXMoc2hlbGw6IElNYW5hZ2VkU2hlbGwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGVsZFNoZWxsUmVsZWFzZUxpc3RlbmVycy5oYXMoc2hlbGwuaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVsZWFzZSA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2J1c3lTaGVsbElkcy5kZWxldGUoc2hlbGwuaWQpO1xuXHRcdFx0dGhpcy5faGVsZFNoZWxsUmVsZWFzZUxpc3RlbmVycy5kZWxldGUoc2hlbGwuaWQpO1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH07XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsTWFuYWdlci5vbkNvbW1hbmRGaW5pc2hlZChzaGVsbC50ZXJtaW5hbFVyaSwgcmVsZWFzZSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl90ZXJtaW5hbE1hbmFnZXIub25FeGl0KHNoZWxsLnRlcm1pbmFsVXJpLCByZWxlYXNlKSk7XG5cdFx0dGhpcy5faGVsZFNoZWxsUmVsZWFzZUxpc3RlbmVycy5zZXQoc2hlbGwuaWQsIHN0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrVG9vbENhbGwodG9vbENhbGxJZDogc3RyaW5nLCBzaGVsbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl90b29sQ2FsbFNoZWxscy5zZXQodG9vbENhbGxJZCwgc2hlbGxJZCk7XG5cdFx0Y29uc3Qgc2hlbGwgPSB0aGlzLl9zaGVsbHMuZ2V0KHNoZWxsSWQpO1xuXHRcdGlmIChzaGVsbCkge1xuXHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBzaGVsbC5zaGVsbFR5cGUgPT09ICdiYXNoJyA/ICdCYXNoJyA6ICdQb3dlclNoZWxsJztcblx0XHRcdHRoaXMuX29uRGlkQXNzb2NpYXRlVGVybWluYWwuZmlyZSh7IHRvb2xDYWxsSWQsIHRlcm1pbmFsVXJpOiBzaGVsbC50ZXJtaW5hbFVyaSwgZGlzcGxheU5hbWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0VGVybWluYWxVcmlGb3JUb29sQ2FsbCh0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNoZWxsSWQgPSB0aGlzLl90b29sQ2FsbFNoZWxscy5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKCFzaGVsbElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2hlbGxzLmdldChzaGVsbElkKT8udGVybWluYWxVcmk7XG5cdH1cblxuXHRnZXRTaGVsbChpZDogc3RyaW5nKTogSU1hbmFnZWRTaGVsbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NoZWxscy5nZXQoaWQpO1xuXHR9XG5cblx0bGlzdFNoZWxscygpOiBJTWFuYWdlZFNoZWxsW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSU1hbmFnZWRTaGVsbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzaGVsbCBvZiB0aGlzLl9zaGVsbHMudmFsdWVzKCkpIHtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbE1hbmFnZXIuaGFzVGVybWluYWwoc2hlbGwudGVybWluYWxVcmkpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHNoZWxsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHNodXRkb3duU2hlbGwoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNoZWxsID0gdGhpcy5fc2hlbGxzLmdldChpZCk7XG5cdFx0aWYgKCFzaGVsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9oZWxkU2hlbGxSZWxlYXNlTGlzdGVuZXJzLmdldChpZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9oZWxkU2hlbGxSZWxlYXNlTGlzdGVuZXJzLmRlbGV0ZShpZCk7XG5cdFx0dGhpcy5fdGVybWluYWxNYW5hZ2VyLmRpc3Bvc2VUZXJtaW5hbChzaGVsbC50ZXJtaW5hbFVyaSk7XG5cdFx0dGhpcy5fc2hlbGxzLmRlbGV0ZShpZCk7XG5cdFx0dGhpcy5fYnVzeVNoZWxsSWRzLmRlbGV0ZShpZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbU2hlbGxNYW5hZ2VyXSBTaHV0IGRvd24gc2hlbGwgJHtpZH1gKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFRvb2wgaW1wbGVtZW50YXRpb25zXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElTaGVsbEV4ZWN1dGlvblJlc3VsdCB7XG5cdHJlYWRvbmx5IHRvb2xSZXN1bHQ6IFRvb2xSZXN1bHRPYmplY3Q7XG5cdHJlYWRvbmx5IGtlZXBTaGVsbEJ1c3k/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBtYWtlU3VjY2Vzc1Jlc3VsdCh0ZXh0OiBzdHJpbmcpOiBUb29sUmVzdWx0T2JqZWN0IHtcblx0cmV0dXJuIHsgdGV4dFJlc3VsdEZvckxsbTogdGV4dCwgcmVzdWx0VHlwZTogJ3N1Y2Nlc3MnIH07XG59XG5cbmZ1bmN0aW9uIG1ha2VGYWlsdXJlUmVzdWx0KHRleHQ6IHN0cmluZywgZXJyb3I/OiBzdHJpbmcpOiBUb29sUmVzdWx0T2JqZWN0IHtcblx0cmV0dXJuIHsgdGV4dFJlc3VsdEZvckxsbTogdGV4dCwgcmVzdWx0VHlwZTogJ2ZhaWx1cmUnLCBlcnJvciB9O1xufVxuXG5mdW5jdGlvbiBtYWtlRXhlY3V0aW9uUmVzdWx0KHRvb2xSZXN1bHQ6IFRvb2xSZXN1bHRPYmplY3QsIG9wdGlvbnM/OiB7IGtlZXBTaGVsbEJ1c3k/OiBib29sZWFuIH0pOiBJU2hlbGxFeGVjdXRpb25SZXN1bHQge1xuXHRyZXR1cm4geyB0b29sUmVzdWx0LCBrZWVwU2hlbGxCdXN5OiBvcHRpb25zPy5rZWVwU2hlbGxCdXN5IH07XG59XG5cbi8qKlxuICogTWFwcyB0aGUgbmV1dHJhbCB7QGxpbmsgSVNoZWxsQ29tbWFuZFJlc3VsdH0gcHJvZHVjZWQgYnkgdGhlIHNoYXJlZCBzaGVsbFxuICogZXhlY3V0b3IgdG8gdGhlIENvcGlsb3QgU0RLIHtAbGluayBUb29sUmVzdWx0T2JqZWN0fSBzaGFwZSBleHBlY3RlZCBieSB0aGVcbiAqIHNoZWxsIHRvb2xzLlxuICovXG5mdW5jdGlvbiBzaGVsbENvbW1hbmRSZXN1bHRUb0V4ZWN1dGlvblJlc3VsdChyZXN1bHQ6IElTaGVsbENvbW1hbmRSZXN1bHQsIHRpbWVvdXRNczogbnVtYmVyKTogSVNoZWxsRXhlY3V0aW9uUmVzdWx0IHtcblx0c3dpdGNoIChyZXN1bHQuc3RhdHVzKSB7XG5cdFx0Y2FzZSAnY29tcGxldGVkJzoge1xuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSByZXN1bHQuZXhpdENvZGUgPz8gMDtcblx0XHRcdGNvbnN0IHRleHQgPSBgRXhpdCBjb2RlOiAke2V4aXRDb2RlfVxcbiR7cmVzdWx0Lm91dHB1dH1gO1xuXHRcdFx0cmV0dXJuIG1ha2VFeGVjdXRpb25SZXN1bHQoZXhpdENvZGUgPT09IDAgPyBtYWtlU3VjY2Vzc1Jlc3VsdCh0ZXh0KSA6IG1ha2VGYWlsdXJlUmVzdWx0KHRleHQpKTtcblx0XHR9XG5cdFx0Y2FzZSAnc2hlbGxFeGl0ZWQnOlxuXHRcdFx0cmV0dXJuIG1ha2VFeGVjdXRpb25SZXN1bHQobWFrZUZhaWx1cmVSZXN1bHQoYFNoZWxsIGV4aXRlZCB3aXRoIGNvZGUgJHtyZXN1bHQuZXhpdENvZGV9XFxuJHtyZXN1bHQub3V0cHV0fWApKTtcblx0XHRjYXNlICd0aW1lb3V0Jzpcblx0XHRcdHJldHVybiBtYWtlRXhlY3V0aW9uUmVzdWx0KG1ha2VGYWlsdXJlUmVzdWx0KFxuXHRcdFx0XHRgQ29tbWFuZCB0aW1lZCBvdXQgYWZ0ZXIgJHtNYXRoLnJvdW5kKHRpbWVvdXRNcyAvIDEwMDApfXMuIFBhcnRpYWwgb3V0cHV0OlxcbiR7cmVzdWx0Lm91dHB1dH1gLFxuXHRcdFx0XHQndGltZW91dCcsXG5cdFx0XHQpKTtcblx0XHRjYXNlICdiYWNrZ3JvdW5kJzpcblx0XHRcdHJldHVybiBtYWtlRXhlY3V0aW9uUmVzdWx0KFxuXHRcdFx0XHRtYWtlU3VjY2Vzc1Jlc3VsdCgnVGhlIHVzZXIgY2hvc2UgdG8gY29udGludWUgdGhpcyBjb21tYW5kIGluIHRoZSBiYWNrZ3JvdW5kLiBUaGUgdGVybWluYWwgaXMgc3RpbGwgcnVubmluZy4nKSxcblx0XHRcdFx0eyBrZWVwU2hlbGxCdXN5OiB0cnVlIH0sXG5cdFx0XHQpO1xuXHRcdGNhc2UgJ2FsdEJ1ZmZlcic6XG5cdFx0XHRyZXR1cm4gbWFrZUV4ZWN1dGlvblJlc3VsdChtYWtlRmFpbHVyZVJlc3VsdChBTFRfQlVGRkVSX01FU1NBR0UsICdhbHRlcm5hdGVCdWZmZXInKSwgeyBrZWVwU2hlbGxCdXN5OiB0cnVlIH0pO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVDb21tYW5kSW5TaGVsbChcblx0c2hlbGw6IElNYW5hZ2VkU2hlbGwsXG5cdGNvbW1hbmQ6IHN0cmluZyxcblx0dGltZW91dE1zOiBudW1iZXIsXG5cdHRlcm1pbmFsTWFuYWdlcjogSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcixcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG4pOiBQcm9taXNlPElTaGVsbEV4ZWN1dGlvblJlc3VsdD4ge1xuXHRjb25zdCByZXN1bHQgPSBzaGVsbENvbW1hbmRSZXN1bHRUb0V4ZWN1dGlvblJlc3VsdChcblx0XHRhd2FpdCBleGVjdXRlU2hlbGxDb21tYW5kKHNoZWxsLCBjb21tYW5kLCB0aW1lb3V0TXMsIHRlcm1pbmFsTWFuYWdlciwgbG9nU2VydmljZSksXG5cdFx0dGltZW91dE1zLFxuXHQpO1xuXHRyZXR1cm4ge1xuXHRcdC4uLnJlc3VsdCxcblx0XHR0b29sUmVzdWx0OiB7XG5cdFx0XHQuLi5yZXN1bHQudG9vbFJlc3VsdCxcblx0XHRcdHRleHRSZXN1bHRGb3JMbG06IGBTaGVsbCBJRDogJHtzaGVsbC5pZH1cXG4ke3Jlc3VsdC50b29sUmVzdWx0LnRleHRSZXN1bHRGb3JMbG19YCxcblx0XHR9LFxuXHR9O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFB1YmxpYyBmYWN0b3J5XG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIElTaGVsbFRvb2xBcmdzIHtcblx0Y29tbWFuZDogc3RyaW5nO1xuXHR0aW1lb3V0PzogbnVtYmVyO1xuXHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24/OiBib29sZWFuO1xuXHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvblJlcXVlc3Qge1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNoZWxsRXhlY3V0YWJsZTogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlYXNvbj86IHN0cmluZztcblx0cmVhZG9ubHkgYmxvY2tlZERvbWFpbnM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IHR5cGUgVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uSGFuZGxlciA9IChyZXF1ZXN0OiBJVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uUmVxdWVzdCkgPT4gUHJvbWlzZTxib29sZWFuPjtcblxuaW50ZXJmYWNlIElXcml0ZVNoZWxsQXJncyB7XG5cdGNvbW1hbmQ6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElSZWFkU2hlbGxBcmdzIHtcblx0c2hlbGxfaWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJU2h1dGRvd25TaGVsbEFyZ3Mge1xuXHRzaGVsbF9pZD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIFNESyB7QGxpbmsgVG9vbH0gc2V0IHRoYXQgb3ZlcnJpZGVzIHRoZSBDb3BpbG90IFNESydzIHR3b1xuICogYnVpbHQtaW4gc2hlbGxzIChgYmFzaGAgYW5kIGBwb3dlcnNoZWxsYCkgd2l0aCBQVFktYmFja2VkIGltcGxlbWVudGF0aW9ucyxcbiAqIHBsdXMgY29tcGFuaW9uIHRvb2xzIChyZWFkLCB3cml0ZSwgc2h1dGRvd24sIGxpc3QpLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY3JlYXRlU2hlbGxUb29scyhcblx0c2hlbGxNYW5hZ2VyOiBTaGVsbE1hbmFnZXIsXG5cdHRlcm1pbmFsTWFuYWdlcjogSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcixcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdGNvbmZpcm1VbnNhbmRib3hlZEV4ZWN1dGlvbj86IFVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbkhhbmRsZXIsXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG4pOiBQcm9taXNlPFRvb2w8YW55PltdPiB7XG5cdGNvbnN0IGV4ZWN1dGFibGUgPSBhd2FpdCBzaGVsbE1hbmFnZXIuZ2V0UmVzb2x2ZWRFeGVjdXRhYmxlKCk7XG5cdGNvbnN0IHNoZWxsVHlwZSA9IHNoZWxsVHlwZUZvckV4ZWN1dGFibGUoZXhlY3V0YWJsZSk7XG5cdGNvbnN0IGVuZ2luZSA9IHNoZWxsTWFuYWdlci5nZXRPckNyZWF0ZVNhbmRib3hFbmdpbmUoKTtcblx0Y29uc3Qgc2FuZGJveEVuYWJsZWQgPSBhd2FpdCBlbmdpbmUuaXNFbmFibGVkKCk7XG5cdGNvbnN0IG5ldHdvcmtEb21haW5zID0gc2FuZGJveEVuYWJsZWQgPyBlbmdpbmUuZ2V0UmVzb2x2ZWROZXR3b3JrRG9tYWlucygpIDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0IHByaW1hcnlUb29sOiBUb29sPElTaGVsbFRvb2xBcmdzPiA9IHtcblx0XHRuYW1lOiBzaGVsbFR5cGUsXG5cdFx0ZGVzY3JpcHRpb246IHNoZWxsVHlwZSA9PT0gJ2Jhc2gnXG5cdFx0XHQ/IChpc1pzaChleGVjdXRhYmxlKSA/IGNyZWF0ZVpzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveEVuYWJsZWQsIG5ldHdvcmtEb21haW5zKSA6IGNyZWF0ZUJhc2hNb2RlbERlc2NyaXB0aW9uKHNhbmRib3hFbmFibGVkLCBuZXR3b3JrRG9tYWlucykpXG5cdFx0XHQ6IGNyZWF0ZVBvd2VyU2hlbGxNb2RlbERlc2NyaXB0aW9uKHNoZWxsVHlwZSwgZXhlY3V0YWJsZSwgc2FuZGJveEVuYWJsZWQsIG5ldHdvcmtEb21haW5zKSxcblx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Y29tbWFuZDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdUaGUgY29tbWFuZCB0byBleGVjdXRlJyB9LFxuXHRcdFx0XHR0aW1lb3V0OiB7IHR5cGU6ICdudW1iZXInLCBkZXNjcmlwdGlvbjogJ1RpbWVvdXQgaW4gbWlsbGlzZWNvbmRzIChkZWZhdWx0IDEyMDAwMCknIH0sXG5cdFx0XHRcdC4uLihzYW5kYm94RW5hYmxlZCA/IHtcblx0XHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmVxdWVzdCB0aGF0IHRoaXMgY29tbWFuZCBydW4gb3V0c2lkZSB0aGUgc2FuZGJveC4gT25seSBzZXQgdGhpcyBhZnRlciBmaXJzdCBleGVjdXRpbmcgdGhlIGNvbW1hbmQgaW4gdGhlIHNhbmRib3ggYW5kIG9ic2VydmluZyB0aGF0IHNhbmRib3hpbmcgY2F1c2VkIHRoZSBmYWlsdXJlLiBUaGUgdXNlciB3aWxsIGJlIHByb21wdGVkIGJlZm9yZSB0aGUgY29tbWFuZCBydW5zIHVuc2FuZGJveGVkLicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdBIHNob3J0IGV4cGxhbmF0aW9uIG9mIHRoZSBzYW5kYm94ZWQgZXhlY3V0aW9uIGZhaWx1cmUgb3IgYmxvY2tlZC1kb21haW4gcmVxdWlyZW1lbnQgdGhhdCBqdXN0aWZpZXMgcmV0cnlpbmcgb3V0c2lkZSB0aGUgc2FuZGJveC4gT25seSBwcm92aWRlIHRoaXMgd2hlbiByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gaXMgdHJ1ZS4nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCddLFxuXHRcdH0sXG5cdFx0b3ZlcnJpZGVzQnVpbHRJblRvb2w6IHRydWUsXG5cdFx0aGFuZGxlcjogYXN5bmMgKGFyZ3MsIGludm9jYXRpb24pID0+IHtcblx0XHRcdGNvbnN0IHRpbWVvdXRNcyA9IGFyZ3MudGltZW91dCA/PyBERUZBVUxUX1NIRUxMX0NPTU1BTkRfVElNRU9VVF9NUztcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHNoZWxsTWFuYWdlci5nZXRPckNyZWF0ZVNoZWxsKFxuXHRcdFx0XHRzaGVsbFR5cGUsXG5cdFx0XHRcdGludm9jYXRpb24udG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbi50b29sQ2FsbElkLFxuXHRcdFx0KTtcblx0XHRcdGxldCBzaG91bGRSZWxlYXNlU2hlbGwgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGV0IGNvbW1hbmRUb1J1biA9IGFyZ3MuY29tbWFuZDtcblx0XHRcdFx0aWYgKHNhbmRib3hFbmFibGVkKSB7XG5cdFx0XHRcdFx0aWYgKGFyZ3MucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uICYmICFlbmdpbmUuYXJlVW5zYW5kYm94ZWRDb21tYW5kc0FsbG93ZWQoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1ha2VGYWlsdXJlUmVzdWx0KFxuXHRcdFx0XHRcdFx0XHQnVW5zYW5kYm94ZWQgZXhlY3V0aW9uIGlzIGRpc2FibGVkIGJ5IHRoZSBjaGF0LmFnZW50LnNhbmRib3guYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzIHNldHRpbmcuJyxcblx0XHRcdFx0XHRcdFx0J3Vuc2FuZGJveGVkX2Rpc2FibGVkJ1xuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByZXF1ZXN0VW5zYW5kYm94ZWRDb25maXJtYXRpb24gPSBhc3luYyAoYmxvY2tlZERvbWFpbnM/OiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8Ym9vbGVhbiB8IFRvb2xSZXN1bHRPYmplY3Q+ID0+IHtcblx0XHRcdFx0XHRcdGlmICghY29uZmlybVVuc2FuZGJveGVkRXhlY3V0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGJsb2NrZWQgPSBibG9ja2VkRG9tYWlucz8uam9pbignLCAnKSA/PyAnKHVua25vd24pJztcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG1ha2VGYWlsdXJlUmVzdWx0KFxuXHRcdFx0XHRcdFx0XHRcdGBDb21tYW5kIHJlcXVpcmVzIGFwcHJvdmFsIHRvIHJ1biBvdXRzaWRlIHRoZSBzYW5kYm94LiBCbG9ja2VkIGRvbWFpbnM6ICR7YmxvY2tlZH0uIFJlLXJ1biB3aXRoIHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj10cnVlIGFuZCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gZXhwbGFpbmluZyB3aHkgdW5zYW5kYm94ZWQgYWNjZXNzIGlzIHJlcXVpcmVkLmAsXG5cdFx0XHRcdFx0XHRcdFx0J3NhbmRib3hfYmxvY2tlZCdcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgYXBwcm92ZWQgPSBhd2FpdCBjb25maXJtVW5zYW5kYm94ZWRFeGVjdXRpb24oe1xuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBpbnZvY2F0aW9uLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdHRvb2xOYW1lOiBpbnZvY2F0aW9uLnRvb2xOYW1lLFxuXHRcdFx0XHRcdFx0XHRzaGVsbEV4ZWN1dGFibGU6IGV4ZWN1dGFibGUsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0XHRcdFx0cmVhc29uOiBhcmdzLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbixcblx0XHRcdFx0XHRcdFx0YmxvY2tlZERvbWFpbnMsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybiBhcHByb3ZlZDtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0bGV0IHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoXG5cdFx0XHRcdFx0XHRhcmdzLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRhcmdzLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbixcblx0XHRcdFx0XHRcdGV4ZWN1dGFibGUsXG5cdFx0XHRcdFx0XHRyZWYub2JqZWN0LnNoZWxsVHlwZSA9PT0gJ2Jhc2gnID8gc2hlbGxNYW5hZ2VyLndvcmtpbmdEaXJlY3RvcnkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGlmIChhcmdzLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiAmJiAhd3JhcHBlZC5pc1NhbmRib3hXcmFwcGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWNpc2lvbiA9IGF3YWl0IHJlcXVlc3RVbnNhbmRib3hlZENvbmZpcm1hdGlvbih3cmFwcGVkLmJsb2NrZWREb21haW5zKTtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgZGVjaXNpb24gIT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZGVjaXNpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIWRlY2lzaW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGJsb2NrZWQgPSB3cmFwcGVkLmJsb2NrZWREb21haW5zPy5qb2luKCcsICcpID8/ICcobm9uZSknO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbWFrZUZhaWx1cmVSZXN1bHQoXG5cdFx0XHRcdFx0XHRcdFx0YFVzZXIgZGVjbGluZWQgdG8gcnVuIGNvbW1hbmQgb3V0c2lkZSB0aGUgc2FuZGJveC4gQmxvY2tlZCBkb21haW5zOiAke2Jsb2NrZWR9LmAsXG5cdFx0XHRcdFx0XHRcdFx0J3NhbmRib3hfYmxvY2tlZCdcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAod3JhcHBlZC5yZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVjaXNpb24gPSBhd2FpdCByZXF1ZXN0VW5zYW5kYm94ZWRDb25maXJtYXRpb24od3JhcHBlZC5ibG9ja2VkRG9tYWlucyk7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGRlY2lzaW9uICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGRlY2lzaW9uO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKCFkZWNpc2lvbikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBibG9ja2VkID0gd3JhcHBlZC5ibG9ja2VkRG9tYWlucz8uam9pbignLCAnKSA/PyAnKHVua25vd24pJztcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG1ha2VGYWlsdXJlUmVzdWx0KFxuXHRcdFx0XHRcdFx0XHRcdGBVc2VyIGRlY2xpbmVkIHRvIHJ1biBjb21tYW5kIG91dHNpZGUgdGhlIHNhbmRib3guIEJsb2NrZWQgZG9tYWluczogJHtibG9ja2VkfS5gLFxuXHRcdFx0XHRcdFx0XHRcdCdzYW5kYm94X2Jsb2NrZWQnXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHdyYXBwZWQgPSBhd2FpdCBlbmdpbmUud3JhcENvbW1hbmQoXG5cdFx0XHRcdFx0XHRcdGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdFx0ZXhlY3V0YWJsZSxcblx0XHRcdFx0XHRcdFx0cmVmLm9iamVjdC5zaGVsbFR5cGUgPT09ICdiYXNoJyA/IHNoZWxsTWFuYWdlci53b3JraW5nRGlyZWN0b3J5IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29tbWFuZFRvUnVuID0gd3JhcHBlZC5jb21tYW5kO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGV4ZWN1dGVDb21tYW5kSW5TaGVsbChyZWYub2JqZWN0LCBjb21tYW5kVG9SdW4sIHRpbWVvdXRNcywgdGVybWluYWxNYW5hZ2VyLCBsb2dTZXJ2aWNlKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5rZWVwU2hlbGxCdXN5KSB7XG5cdFx0XHRcdFx0c2hvdWxkUmVsZWFzZVNoZWxsID0gZmFsc2U7XG5cdFx0XHRcdFx0c2hlbGxNYW5hZ2VyLmhvbGRTaGVsbFVudGlsQ29tbWFuZEZpbmlzaGVzKHJlZi5vYmplY3QpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQudG9vbFJlc3VsdDtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmIChzaG91bGRSZWxlYXNlU2hlbGwpIHtcblx0XHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0fTtcblxuXHRjb25zdCByZWFkVG9vbDogVG9vbDxJUmVhZFNoZWxsQXJncz4gPSB7XG5cdFx0bmFtZTogYHJlYWRfJHtzaGVsbFR5cGV9YCxcblx0XHRkZXNjcmlwdGlvbjogYFJlYWQgdGhlIGxhdGVzdCBvdXRwdXQgZnJvbSBhIHJ1bm5pbmcgJHtzaGVsbFR5cGV9IHNoZWxsLmAsXG5cdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHNoZWxsX2lkOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1NoZWxsIElEIHRvIHJlYWQgZnJvbSAob3B0aW9uYWw7IHVzZXMgbGF0ZXN0IHNoZWxsIGlmIG9taXR0ZWQpJyB9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdG92ZXJyaWRlc0J1aWx0SW5Ub29sOiB0cnVlLFxuXHRcdHNraXBQZXJtaXNzaW9uOiB0cnVlLFxuXHRcdGhhbmRsZXI6IChhcmdzKSA9PiB7XG5cdFx0XHRjb25zdCBzaGVsbHMgPSBzaGVsbE1hbmFnZXIubGlzdFNoZWxscygpO1xuXHRcdFx0Y29uc3Qgc2hlbGwgPSBhcmdzLnNoZWxsX2lkXG5cdFx0XHRcdD8gc2hlbGxNYW5hZ2VyLmdldFNoZWxsKGFyZ3Muc2hlbGxfaWQpXG5cdFx0XHRcdDogc2hlbGxzW3NoZWxscy5sZW5ndGggLSAxXTtcblx0XHRcdGlmICghc2hlbGwpIHtcblx0XHRcdFx0cmV0dXJuIG1ha2VGYWlsdXJlUmVzdWx0KCdObyBhY3RpdmUgc2hlbGwgZm91bmQuJywgJ25vX3NoZWxsJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZW50ID0gdGVybWluYWxNYW5hZ2VyLmdldENvbnRlbnQoc2hlbGwudGVybWluYWxVcmkpO1xuXHRcdFx0aWYgKCFjb250ZW50KSB7XG5cdFx0XHRcdHJldHVybiBtYWtlU3VjY2Vzc1Jlc3VsdCgnKG5vIG91dHB1dCknKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtYWtlU3VjY2Vzc1Jlc3VsdChwcmVwYXJlT3V0cHV0Rm9yTW9kZWwoY29udGVudCkpO1xuXHRcdH0sXG5cdH07XG5cblx0Y29uc3Qgd3JpdGVUb29sOiBUb29sPElXcml0ZVNoZWxsQXJncz4gPSB7XG5cdFx0bmFtZTogYHdyaXRlXyR7c2hlbGxUeXBlfWAsXG5cdFx0ZGVzY3JpcHRpb246IGBTZW5kIGlucHV0IHRvIGEgcnVubmluZyAke3NoZWxsVHlwZX0gc2hlbGwgKGUuZy4gYW5zd2VyaW5nIGEgcHJvbXB0LCBzZW5kaW5nIEN0cmwrQykuYCxcblx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Y29tbWFuZDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdUZXh0IHRvIHdyaXRlIHRvIHRoZSBzaGVsbCBzdGRpbicgfSxcblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0fSxcblx0XHRvdmVycmlkZXNCdWlsdEluVG9vbDogdHJ1ZSxcblx0XHRza2lwUGVybWlzc2lvbjogdHJ1ZSxcblx0XHRoYW5kbGVyOiBhc3luYyAoYXJncykgPT4ge1xuXHRcdFx0Y29uc3Qgc2hlbGxzID0gc2hlbGxNYW5hZ2VyLmxpc3RTaGVsbHMoKTtcblx0XHRcdGNvbnN0IHNoZWxsID0gc2hlbGxzW3NoZWxscy5sZW5ndGggLSAxXTtcblx0XHRcdGlmICghc2hlbGwpIHtcblx0XHRcdFx0cmV0dXJuIG1ha2VGYWlsdXJlUmVzdWx0KCdObyBhY3RpdmUgc2hlbGwgZm91bmQuJywgJ25vX3NoZWxsJyk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbE1hbmFnZXIuc2VuZFRleHQoc2hlbGwudGVybWluYWxVcmksIGFyZ3MuY29tbWFuZCwgeyBzaG91bGRFeGVjdXRlOiBmYWxzZSB9KTtcblx0XHRcdHJldHVybiBtYWtlU3VjY2Vzc1Jlc3VsdCgnSW5wdXQgc2VudCB0byBzaGVsbC4nKTtcblx0XHR9LFxuXHR9O1xuXG5cdGNvbnN0IHNodXRkb3duVG9vbDogVG9vbDxJU2h1dGRvd25TaGVsbEFyZ3M+ID0ge1xuXHRcdG5hbWU6IHNoZWxsVHlwZSA9PT0gJ2Jhc2gnID8gJ2Jhc2hfc2h1dGRvd24nIDogYCR7c2hlbGxUeXBlfV9zaHV0ZG93bmAsXG5cdFx0ZGVzY3JpcHRpb246IGBTdG9wIGEgJHtzaGVsbFR5cGV9IHNoZWxsLmAsXG5cdFx0cGFyYW1ldGVyczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHNoZWxsX2lkOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogJ1NoZWxsIElEIHRvIHN0b3AgKG9wdGlvbmFsOyBzdG9wcyBsYXRlc3Qgc2hlbGwgaWYgb21pdHRlZCknIH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0b3ZlcnJpZGVzQnVpbHRJblRvb2w6IHRydWUsXG5cdFx0c2tpcFBlcm1pc3Npb246IHRydWUsXG5cdFx0aGFuZGxlcjogKGFyZ3MpID0+IHtcblx0XHRcdGlmIChhcmdzLnNoZWxsX2lkKSB7XG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBzaGVsbE1hbmFnZXIuc2h1dGRvd25TaGVsbChhcmdzLnNoZWxsX2lkKTtcblx0XHRcdFx0cmV0dXJuIHN1Y2Nlc3Ncblx0XHRcdFx0XHQ/IG1ha2VTdWNjZXNzUmVzdWx0KCdTaGVsbCBzdG9wcGVkLicpXG5cdFx0XHRcdFx0OiBtYWtlRmFpbHVyZVJlc3VsdCgnU2hlbGwgbm90IGZvdW5kLicsICdub3RfZm91bmQnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNoZWxscyA9IHNoZWxsTWFuYWdlci5saXN0U2hlbGxzKCk7XG5cdFx0XHRjb25zdCBzaGVsbCA9IHNoZWxsc1tzaGVsbHMubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAoIXNoZWxsKSB7XG5cdFx0XHRcdHJldHVybiBtYWtlRmFpbHVyZVJlc3VsdCgnTm8gYWN0aXZlIHNoZWxsIHRvIHN0b3AuJywgJ25vX3NoZWxsJyk7XG5cdFx0XHR9XG5cdFx0XHRzaGVsbE1hbmFnZXIuc2h1dGRvd25TaGVsbChzaGVsbC5pZCk7XG5cdFx0XHRyZXR1cm4gbWFrZVN1Y2Nlc3NSZXN1bHQoJ1NoZWxsIHN0b3BwZWQuJyk7XG5cdFx0fSxcblx0fTtcblxuXHRjb25zdCBsaXN0VG9vbDogVG9vbDxSZWNvcmQ8c3RyaW5nLCBuZXZlcj4+ID0ge1xuXHRcdG5hbWU6IGBsaXN0XyR7c2hlbGxUeXBlfWAsXG5cdFx0ZGVzY3JpcHRpb246IGBMaXN0IGFjdGl2ZSAke3NoZWxsVHlwZX0gc2hlbGwgaW5zdGFuY2VzLmAsXG5cdFx0cGFyYW1ldGVyczogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRvdmVycmlkZXNCdWlsdEluVG9vbDogdHJ1ZSxcblx0XHRza2lwUGVybWlzc2lvbjogdHJ1ZSxcblx0XHRoYW5kbGVyOiAoKSA9PiB7XG5cdFx0XHRjb25zdCBzaGVsbHMgPSBzaGVsbE1hbmFnZXIubGlzdFNoZWxscygpO1xuXHRcdFx0aWYgKHNoZWxscy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIG1ha2VTdWNjZXNzUmVzdWx0KCdObyBhY3RpdmUgc2hlbGxzLicpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25zID0gc2hlbGxzLm1hcChzID0+IHtcblx0XHRcdFx0Y29uc3QgZXhpdENvZGUgPSB0ZXJtaW5hbE1hbmFnZXIuZ2V0RXhpdENvZGUocy50ZXJtaW5hbFVyaSk7XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IGV4aXRDb2RlICE9PSB1bmRlZmluZWQgPyBgZXhpdGVkICgke2V4aXRDb2RlfSlgIDogJ3J1bm5pbmcnO1xuXHRcdFx0XHRyZXR1cm4gYC0gJHtzLmlkfTogJHtzLnNoZWxsVHlwZX0gWyR7c3RhdHVzfV1gO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gbWFrZVN1Y2Nlc3NSZXN1bHQoZGVzY3JpcHRpb25zLmpvaW4oJ1xcbicpKTtcblx0XHR9LFxuXHR9O1xuXG5cdC8vIFN0dWIgdGhlICpvdGhlciogU0RLIGJ1aWx0LWluIHNvIHRoZSBtb2RlbCBjYW4ndCBieXBhc3Mgb3VyIG92ZXJyaWRlXG5cdC8vIChlLmcuIG9uIFdpbmRvd3Mgc3RpbGwgY2FsbGluZyBgcG93ZXJzaGVsbGAgd2hlbiBHaXQgQmFzaCBpcyBjb25maWd1cmVkKS5cblx0Y29uc3Qgb3RoZXJTaGVsbFR5cGU6IFNoZWxsVHlwZSA9IHNoZWxsVHlwZSA9PT0gJ2Jhc2gnID8gJ3Bvd2Vyc2hlbGwnIDogJ2Jhc2gnO1xuXHRjb25zdCByZWRpcmVjdE1lc3NhZ2UgPSBgVGhpcyB0b29sIGlzIGRpc2FibGVkIGJlY2F1c2UgdGhlIGNvbmZpZ3VyZWQgc2hlbGwgaXMgJHtleGVjdXRhYmxlfS4gVXNlIHRoZSBcXGAke3NoZWxsVHlwZX1cXGAgdG9vbCBpbnN0ZWFkLmA7XG5cdGNvbnN0IHJlZGlyZWN0VG9vbDogVG9vbDxJU2hlbGxUb29sQXJncz4gPSB7XG5cdFx0bmFtZTogb3RoZXJTaGVsbFR5cGUsXG5cdFx0ZGVzY3JpcHRpb246IHJlZGlyZWN0TWVzc2FnZSxcblx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Y29tbWFuZDogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246ICdUaGUgY29tbWFuZCB0byBleGVjdXRlJyB9LFxuXHRcdFx0XHR0aW1lb3V0OiB7IHR5cGU6ICdudW1iZXInLCBkZXNjcmlwdGlvbjogJ1RpbWVvdXQgaW4gbWlsbGlzZWNvbmRzIChkZWZhdWx0IDEyMDAwMCknIH0sXG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCddLFxuXHRcdH0sXG5cdFx0b3ZlcnJpZGVzQnVpbHRJblRvb2w6IHRydWUsXG5cdFx0c2tpcFBlcm1pc3Npb246IHRydWUsXG5cdFx0aGFuZGxlcjogKCkgPT4ge1xuXHRcdFx0cmV0dXJuIG1ha2VGYWlsdXJlUmVzdWx0KHJlZGlyZWN0TWVzc2FnZSwgJ3dyb25nX3NoZWxsJyk7XG5cdFx0fSxcblx0fTtcblxuXHRyZXR1cm4gW3ByaW1hcnlUb29sLCByZWFkVG9vbCwgd3JpdGVUb29sLCBzaHV0ZG93blRvb2wsIGxpc3RUb29sLCByZWRpcmVjdFRvb2xdO1xufVxuXG5mdW5jdGlvbiBpc1dpbmRvd3NQb3dlclNoZWxsKGVudlNoZWxsOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGVudlNoZWxsLmVuZHNXaXRoKCdTeXN0ZW0zMlxcXFxXaW5kb3dzUG93ZXJTaGVsbFxcXFx2MS4wXFxcXHBvd2Vyc2hlbGwuZXhlJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBvd2VyU2hlbGxNb2RlbERlc2NyaXB0aW9uKHNoZWxsVHlwZTogc3RyaW5nLCBzaGVsbFBhdGg6IHN0cmluZywgaXNTYW5kYm94RW5hYmxlZDogYm9vbGVhbiwgbmV0d29ya0RvbWFpbnM/OiBJVGVybWluYWxTYW5kYm94UmVzb2x2ZWROZXR3b3JrRG9tYWlucyk6IHN0cmluZyB7XG5cdGNvbnN0IGlzV2luUHdzaCA9IGlzV2luZG93c1Bvd2VyU2hlbGwoc2hlbGxQYXRoKTtcblx0Y29uc3QgcGFydHMgPSBbXG5cdFx0YFRoaXMgdG9vbCBhbGxvd3MgeW91IHRvIGV4ZWN1dGUgJHtpc1dpblB3c2ggPyAnV2luZG93cyBQb3dlclNoZWxsIDUuMScgOiAnUG93ZXJTaGVsbCd9IGNvbW1hbmRzIGluIGEgcGVyc2lzdGVudCB0ZXJtaW5hbCBzZXNzaW9uLCBwcmVzZXJ2aW5nIGVudmlyb25tZW50IHZhcmlhYmxlcywgd29ya2luZyBkaXJlY3RvcnksIGFuZCBvdGhlciBjb250ZXh0IGFjcm9zcyBtdWx0aXBsZSBjb21tYW5kcy5gLFxuXHRcdCcnLFxuXHRcdCdDb21tYW5kIEV4ZWN1dGlvbjonLFxuXHRcdC8vIElNUE9SVEFOVDogUG93ZXJTaGVsbCA1IGRvZXMgbm90IHN1cHBvcnQgYCYmYCBzbyBhbHdheXMgcmUtd3JpdGUgdGhlbSB0byBgO2AuIE5vdGUgdGhhdFxuXHRcdC8vIHRoZSBiZWhhdmlvciBvZiBgJiZgIGRpZmZlcnMgYSBsaXR0bGUgZnJvbSBgO2AgYnV0IGluIGdlbmVyYWwgaXQncyBmaW5lXG5cdFx0aXNXaW5Qd3NoID8gJy0gVXNlIHNlbWljb2xvbnMgOyB0byBjaGFpbiBjb21tYW5kcyBvbiBvbmUgbGluZSwgTkVWRVIgdXNlICYmIGV2ZW4gd2hlbiBhc2tlZCBleHBsaWNpdGx5JyA6ICctIFByZWZlciA7IHdoZW4gY2hhaW5pbmcgY29tbWFuZHMgb24gb25lIGxpbmUnLFxuXHRcdCctIFByZWZlciBwaXBlbGluZXMgfCBmb3Igb2JqZWN0LWJhc2VkIGRhdGEgZmxvdycsXG5cdFx0Jy0gTmV2ZXIgY3JlYXRlIGEgc3ViLXNoZWxsIChlZy4gcG93ZXJzaGVsbCAtYyBcImNvbW1hbmRcIikgdW5sZXNzIGV4cGxpY2l0bHkgYXNrZWQnLFxuXHRcdCcnLFxuXHRcdCdEaXJlY3RvcnkgTWFuYWdlbWVudDonLFxuXHRcdCctIFByZWZlciByZWxhdGl2ZSBwYXRocyB3aGVuIG5hdmlnYXRpbmcgZGlyZWN0b3JpZXMsIG9ubHkgdXNlIGFic29sdXRlIHdoZW4gdGhlIHBhdGggaXMgZmFyIGF3YXkgb3IgdGhlIGN1cnJlbnQgY3dkIGlzIG5vdCBleHBlY3RlZCcsXG5cdFx0Jy0gQnkgZGVmYXVsdCAobW9kZT1zeW5jKSwgc2hlbGwgYW5kIGN3ZCBhcmUgcmV1c2VkIGJ5IHN1YnNlcXVlbnQgc3luYyBjb21tYW5kcycsXG5cdFx0Jy0gVXNlICRQV0Qgb3IgR2V0LUxvY2F0aW9uIGZvciBjdXJyZW50IGRpcmVjdG9yeScsXG5cdFx0Jy0gVXNlIFB1c2gtTG9jYXRpb24vUG9wLUxvY2F0aW9uIGZvciBkaXJlY3Rvcnkgc3RhY2snLFxuXHRcdCcnLFxuXHRcdCdQcm9ncmFtIEV4ZWN1dGlvbjonLFxuXHRcdCctIFN1cHBvcnRzIC5ORVQsIFB5dGhvbiwgTm9kZS5qcywgYW5kIG90aGVyIGV4ZWN1dGFibGVzJyxcblx0XHQnLSBJbnN0YWxsIG1vZHVsZXMgdmlhIEluc3RhbGwtTW9kdWxlLCBJbnN0YWxsLVBhY2thZ2UnLFxuXHRcdCctIFVzZSBHZXQtQ29tbWFuZCB0byB2ZXJpZnkgY21kbGV0L2Z1bmN0aW9uIGF2YWlsYWJpbGl0eScsXG5cdFx0JycsXG5cdFx0J0FzeW5jIE1vZGU6Jyxcblx0XHQnLSBGb3IgbG9uZy1ydW5uaW5nIHRhc2tzIChlLmcuLCBzZXJ2ZXJzKSwgdXNlIG1vZGU9YXN5bmMnLFxuXHRcdCctIFJldHVybnMgYSB0ZXJtaW5hbCBJRCBmb3IgY2hlY2tpbmcgc3RhdHVzIGFuZCBydW50aW1lIGxhdGVyJyxcblx0XHQnLSBVc2UgU3RhcnQtSm9iIGZvciBiYWNrZ3JvdW5kIFBvd2VyU2hlbGwgam9icycsXG5cdFx0JycsXG5cdFx0YFVzZSB3cml0ZV8ke3NoZWxsVHlwZX0gdG8gc2VuZCBjb21tYW5kcyBvciBpbnB1dCB0byBhIHRlcm1pbmFsIHNlc3Npb24uYCxcblx0XTtcblxuXHRpZiAoaXNTYW5kYm94RW5hYmxlZCkge1xuXHRcdHBhcnRzLnB1c2goLi4uY3JlYXRlU2FuZGJveExpbmVzKG5ldHdvcmtEb21haW5zKSk7XG5cdH1cblxuXHRwYXJ0cy5wdXNoKFxuXHRcdCcnLFxuXHRcdCdPdXRwdXQgTWFuYWdlbWVudDonLFxuXHRcdCctIE91dHB1dCBpcyBhdXRvbWF0aWNhbGx5IHRydW5jYXRlZCBpZiBsb25nZXIgdGhhbiA2MEtCIHRvIHByZXZlbnQgY29udGV4dCBvdmVyZmxvdycsXG5cdFx0Jy0gVXNlIFNlbGVjdC1PYmplY3QsIFdoZXJlLU9iamVjdCwgRm9ybWF0LVRhYmxlIHRvIGZpbHRlciBvdXRwdXQnLFxuXHRcdCctIFVzZSAtRmlyc3QvLUxhc3QgcGFyYW1ldGVycyB0byBsaW1pdCByZXN1bHRzJyxcblx0XHQnLSBGb3IgcGFnZXIgY29tbWFuZHMsIGFkZCB8IE91dC1TdHJpbmcgb3IgfCBGb3JtYXQtTGlzdCcsXG5cdFx0JycsXG5cdFx0J0Jlc3QgUHJhY3RpY2VzOicsXG5cdFx0Jy0gVXNlIHByb3BlciBjbWRsZXQgbmFtZXMgaW5zdGVhZCBvZiBhbGlhc2VzIGluIHNjcmlwdHMnLFxuXHRcdCctIFF1b3RlIHBhdGhzIHdpdGggc3BhY2VzOiBcIkM6XFxcXFBhdGggV2l0aCBTcGFjZXNcIicsXG5cdFx0Jy0gUHJlZmVyIFBvd2VyU2hlbGwgY21kbGV0cyBvdmVyIGV4dGVybmFsIGNvbW1hbmRzIHdoZW4gYXZhaWxhYmxlJyxcblx0XHQnLSBQcmVmZXIgaWRpb21hdGljIFBvd2VyU2hlbGwgbGlrZSBHZXQtQ2hpbGRJdGVtIGluc3RlYWQgb2YgZGlyIG9yIGxzIGZvciBmaWxlIGxpc3RpbmdzJyxcblx0XHQnLSBVc2UgVGVzdC1QYXRoIHRvIGNoZWNrIGZpbGUvZGlyZWN0b3J5IGV4aXN0ZW5jZScsXG5cdFx0Jy0gQmUgc3BlY2lmaWMgd2l0aCBTZWxlY3QtT2JqZWN0IHByb3BlcnRpZXMgdG8gYXZvaWQgZXhjZXNzaXZlIG91dHB1dCcsXG5cdFx0Jy0gQXZvaWQgcHJpbnRpbmcgY3JlZGVudGlhbHMgdW5sZXNzIGFic29sdXRlbHkgcmVxdWlyZWQnLFxuXHRcdCcnLFxuXHRcdCdJbnRlcmFjdGl2ZSBJbnB1dCBIYW5kbGluZzonLFxuXHRcdCctIFdoZW4gYSB0ZXJtaW5hbCBjb21tYW5kIGlzIHdhaXRpbmcgZm9yIGludGVyYWN0aXZlIGlucHV0LCBkbyBOT1Qgc3VnZ2VzdCBhbHRlcm5hdGl2ZXMgb3IgYXNrIHRoZSB1c2VyIHdoZXRoZXIgdG8gcHJvY2VlZC4gSW5zdGVhZCwgdXNlIHRoZSBhc2tfdXNlciB0b29sIHRvIGNvbGxlY3QgdGhlIG5lZWRlZCB2YWx1ZXMgZnJvbSB0aGUgdXNlciwgdGhlbiBzZW5kIHRoZW0uJyxcblx0XHRgLSBTZW5kIGV4YWN0bHkgb25lIGFuc3dlciBwZXIgcHJvbXB0IHVzaW5nIHdyaXRlXyR7c2hlbGxUeXBlfS4gTmV2ZXIgc2VuZCBtdWx0aXBsZSBhbnN3ZXJzIGluIGEgc2luZ2xlIHNlbmQuYCxcblx0XHRgLSBBZnRlciBlYWNoIHNlbmQsIGNhbGwgcmVhZF8ke3NoZWxsVHlwZX0gdG8gcmVhZCB0aGUgbmV4dCBwcm9tcHQgYmVmb3JlIHNlbmRpbmcgdGhlIG5leHQgYW5zd2VyLmAsXG5cdFx0Jy0gQ29udGludWUgb25lIHByb21wdCBhdCBhIHRpbWUgdW50aWwgdGhlIGNvbW1hbmQgZmluaXNoZXMuJyxcblx0KTtcblxuXHRyZXR1cm4gcGFydHMuam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNhbmRib3hMaW5lcyhuZXR3b3JrRG9tYWlucz86IElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zKTogc3RyaW5nW10ge1xuXHRjb25zdCBsaW5lcyA9IFtcblx0XHQnJyxcblx0XHQnU2FuZGJveGluZzonLFxuXHRcdCctIEFUVEVOVElPTjogVGVybWluYWwgc2FuZGJveGluZyBpcyBlbmFibGVkLCBjb21tYW5kcyBydW4gaW4gYSBzYW5kYm94IGJ5IGRlZmF1bHQnLFxuXHRcdCctIFdoZW4gZXhlY3V0aW5nIGNvbW1hbmRzIHdpdGhpbiB0aGUgc2FuZGJveGVkIGVudmlyb25tZW50LCBhbGwgb3BlcmF0aW9ucyByZXF1aXJpbmcgYSB0ZW1wb3JhcnkgZGlyZWN0b3J5IG11c3QgdXRpbGl6ZSB0aGUgJFRNUERJUiBlbnZpcm9ubWVudCB2YXJpYWJsZS4gVGhlIC90bXAgZGlyZWN0b3J5IGlzIG5vdCBndWFyYW50ZWVkIHRvIGJlIGFjY2Vzc2libGUgb3Igd3JpdGFibGUgYW5kIG11c3QgYmUgYXZvaWRlZCcsXG5cdFx0Jy0gVG9vbHMgYW5kIHNjcmlwdHMgc2hvdWxkIHJlc3BlY3QgdGhlIFRNUERJUiBlbnZpcm9ubWVudCB2YXJpYWJsZSwgd2hpY2ggaXMgYXV0b21hdGljYWxseSBzZXQgdG8gYW4gYXBwcm9wcmlhdGUgcGF0aCB3aXRoaW4gdGhlIHNhbmRib3gnLFxuXHRcdCctIFdoZW4gYSBjb21tYW5kIGZhaWxzIGR1ZSB0byBzYW5kYm94IHJlc3RyaWN0aW9ucywgaW1tZWRpYXRlbHkgcmUtcnVuIGl0IHdpdGggcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUuIERvIE5PVCBhc2sgdGhlIHVzZXIgZm9yIHBlcm1pc3Npb24gXHUyMDE0IHNldHRpbmcgdGhpcyBmbGFnIGF1dG9tYXRpY2FsbHkgc2hvd3MgYSBjb25maXJtYXRpb24gcHJvbXB0IHRvIHRoZSB1c2VyJyxcblx0XHQnLSBPbmx5IHNldCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb249dHJ1ZSB3aGVuIHRoZXJlIGlzIGV2aWRlbmNlIG9mIGZhaWx1cmVzIGNhdXNlZCBieSB0aGUgc2FuZGJveCwgZS5nLiBcXCdPcGVyYXRpb24gbm90IHBlcm1pdHRlZFxcJyBlcnJvcnMsIG5ldHdvcmsgZmFpbHVyZXMsIG9yIGZpbGUgYWNjZXNzIGVycm9ycywgZXRjJyxcblx0XHQnLSBEbyBOT1Qgc2V0IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj10cnVlIHdpdGhvdXQgZmlyc3QgZXhlY3V0aW5nIHRoZSBjb21tYW5kIGluIHNhbmRib3ggbW9kZS4gQWx3YXlzIHRyeSB0aGUgY29tbWFuZCBpbiB0aGUgc2FuZGJveCBmaXJzdCwgYW5kIG9ubHkgc2V0IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj10cnVlIHdoZW4gcmV0cnlpbmcgYWZ0ZXIgdGhhdCBzYW5kYm94ZWQgZXhlY3V0aW9uIGZhaWxlZCBkdWUgdG8gc2FuZGJveCByZXN0cmljdGlvbnMuJyxcblx0XHQnLSBXaGVuIHNldHRpbmcgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUsIGFsc28gcHJvdmlkZSByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gZXhwbGFpbmluZyB3aHkgdGhlIGNvbW1hbmQgbmVlZHMgdW5zYW5kYm94ZWQgYWNjZXNzJyxcblx0XTtcblx0aWYgKG5ldHdvcmtEb21haW5zKSB7XG5cdFx0Y29uc3QgZGVuaWVkU2V0ID0gbmV3IFNldChuZXR3b3JrRG9tYWlucy5kZW5pZWREb21haW5zKTtcblx0XHRjb25zdCBlZmZlY3RpdmVBbGxvd2VkID0gbmV0d29ya0RvbWFpbnMuYWxsb3dlZERvbWFpbnMuZmlsdGVyKGQgPT4gIWRlbmllZFNldC5oYXMoZCkpO1xuXHRcdGlmIChlZmZlY3RpdmVBbGxvd2VkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bGluZXMucHVzaCgnLSBBbGwgbmV0d29yayBhY2Nlc3MgaXMgYmxvY2tlZCBpbiB0aGUgc2FuZGJveCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAtIE9ubHkgdGhlIGZvbGxvd2luZyBkb21haW5zIGFyZSBhY2Nlc3NpYmxlIGluIHRoZSBzYW5kYm94IChhbGwgb3RoZXIgbmV0d29yayBhY2Nlc3MgaXMgYmxvY2tlZCk6ICR7ZWZmZWN0aXZlQWxsb3dlZC5qb2luKCcsICcpfWApO1xuXHRcdH1cblx0XHRpZiAobmV0d29ya0RvbWFpbnMuZGVuaWVkRG9tYWlucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAtIFRoZSBmb2xsb3dpbmcgZG9tYWlucyBhcmUgZXhwbGljaXRseSBibG9ja2VkIGluIHRoZSBzYW5kYm94OiAke25ldHdvcmtEb21haW5zLmRlbmllZERvbWFpbnMuam9pbignLCAnKX1gKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGxpbmVzO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVHZW5lcmljRGVzY3JpcHRpb24oc2hlbGxUeXBlOiBzdHJpbmcsIGlzU2FuZGJveEVuYWJsZWQ6IGJvb2xlYW4sIG5ldHdvcmtEb21haW5zPzogSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMpOiBzdHJpbmcge1xuXHRjb25zdCBwYXJ0cyA9IFtgXG5Db21tYW5kIEV4ZWN1dGlvbjpcbi0gVXNlICYmIHRvIGNoYWluIHNpbXBsZSBjb21tYW5kcyBvbiBvbmUgbGluZVxuLSBQcmVmZXIgcGlwZWxpbmVzIHwgb3ZlciB0ZW1wb3JhcnkgZmlsZXMgZm9yIGRhdGEgZmxvd1xuLSBOZXZlciBjcmVhdGUgYSBzdWItc2hlbGwgKGVnLiBiYXNoIC1jIFwiY29tbWFuZFwiKSB1bmxlc3MgZXhwbGljaXRseSBhc2tlZFxuXG5EaXJlY3RvcnkgTWFuYWdlbWVudDpcbi0gUHJlZmVyIHJlbGF0aXZlIHBhdGhzIHdoZW4gbmF2aWdhdGluZyBkaXJlY3Rvcmllcywgb25seSB1c2UgYWJzb2x1dGUgd2hlbiB0aGUgcGF0aCBpcyBmYXIgYXdheSBvciB0aGUgY3VycmVudCBjd2QgaXMgbm90IGV4cGVjdGVkXG4tIEJ5IGRlZmF1bHQgKG1vZGU9c3luYyksIHNoZWxsIGFuZCBjd2QgYXJlIHJldXNlZCBieSBzdWJzZXF1ZW50IHN5bmMgY29tbWFuZHNcbi0gVXNlICRQV0QgZm9yIGN1cnJlbnQgZGlyZWN0b3J5IHJlZmVyZW5jZXNcbi0gQ29uc2lkZXIgdXNpbmcgcHVzaGQvcG9wZCBmb3IgZGlyZWN0b3J5IHN0YWNrIG1hbmFnZW1lbnRcbi0gU3VwcG9ydHMgZGlyZWN0b3J5IHNob3J0Y3V0cyBsaWtlIH4gYW5kIC1cblxuUHJvZ3JhbSBFeGVjdXRpb246XG4tIFN1cHBvcnRzIFB5dGhvbiwgTm9kZS5qcywgYW5kIG90aGVyIGV4ZWN1dGFibGVzXG4tIEluc3RhbGwgcGFja2FnZXMgdmlhIHBhY2thZ2UgbWFuYWdlcnMgKGJyZXcsIGFwdCwgZXRjLilcbi0gVXNlIHdoaWNoIG9yIGNvbW1hbmQgLXYgdG8gdmVyaWZ5IGNvbW1hbmQgYXZhaWxhYmlsaXR5XG5cbkFzeW5jIE1vZGU6XG4tIEZvciBsb25nLXJ1bm5pbmcgdGFza3MgKGUuZy4sIHNlcnZlcnMpLCB1c2UgbW9kZT1hc3luY1xuLSBSZXR1cm5zIGEgdGVybWluYWwgSUQgZm9yIGNoZWNraW5nIHN0YXR1cyBhbmQgcnVudGltZSBsYXRlclxuXG5Vc2Ugd3JpdGVfJHtzaGVsbFR5cGV9IHRvIHNlbmQgY29tbWFuZHMgb3IgaW5wdXQgdG8gYSB0ZXJtaW5hbCBzZXNzaW9uLmBdO1xuXG5cdGlmIChpc1NhbmRib3hFbmFibGVkKSB7XG5cdFx0cGFydHMucHVzaChjcmVhdGVTYW5kYm94TGluZXMobmV0d29ya0RvbWFpbnMpLmpvaW4oJ1xcbicpKTtcblx0fVxuXG5cdHBhcnRzLnB1c2goYFxuXG5PdXRwdXQgTWFuYWdlbWVudDpcbi0gT3V0cHV0IGlzIGF1dG9tYXRpY2FsbHkgdHJ1bmNhdGVkIGlmIGxvbmdlciB0aGFuIDYwS0IgdG8gcHJldmVudCBjb250ZXh0IG92ZXJmbG93XG4tIFVzZSBoZWFkLCB0YWlsLCBncmVwLCBhd2sgdG8gZmlsdGVyIGFuZCBsaW1pdCBvdXRwdXQgc2l6ZVxuLSBGb3IgcGFnZXIgY29tbWFuZHMsIGRpc2FibGUgcGFnaW5nOiBnaXQgLS1uby1wYWdlciBvciBhZGQgfCBjYXRcbi0gVXNlIHdjIC1sIHRvIGNvdW50IGxpbmVzIGJlZm9yZSBkaXNwbGF5aW5nIGxhcmdlIG91dHB1dHNcblxuQmVzdCBQcmFjdGljZXM6XG4tIFF1b3RlIHZhcmlhYmxlczogXCIkdmFyXCIgaW5zdGVhZCBvZiAkdmFyIHRvIGhhbmRsZSBzcGFjZXNcbi0gVXNlIGZpbmQgd2l0aCAtZXhlYyBvciB4YXJncyBmb3IgZmlsZSBvcGVyYXRpb25zXG4tIEJlIHNwZWNpZmljIHdpdGggY29tbWFuZHMgdG8gYXZvaWQgZXhjZXNzaXZlIG91dHB1dFxuLSBBdm9pZCBwcmludGluZyBjcmVkZW50aWFscyB1bmxlc3MgYWJzb2x1dGVseSByZXF1aXJlZFxuLSBORVZFUiBydW4gc2xlZXAgb3Igc2ltaWxhciB3YWl0IGNvbW1hbmRzIGluIGEgdGVybWluYWwuIFlvdSB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgbm90aWZpZWQgb24geW91ciBuZXh0IHR1cm4gd2hlbiBhc3luYyB0ZXJtaW5hbCBjb21tYW5kcyBvciB0aW1lZC1vdXQgc3luYyBjb21tYW5kcyBjb21wbGV0ZSBvciBuZWVkIGlucHV0LiBEbyBOT1QgcG9sbCBmb3IgY29tcGxldGlvbi5cblxuSW50ZXJhY3RpdmUgSW5wdXQgSGFuZGxpbmc6XG4tIFdoZW4gYSB0ZXJtaW5hbCBjb21tYW5kIGlzIHdhaXRpbmcgZm9yIGludGVyYWN0aXZlIGlucHV0LCBkbyBOT1Qgc3VnZ2VzdCBhbHRlcm5hdGl2ZXMgb3IgYXNrIHRoZSB1c2VyIHdoZXRoZXIgdG8gcHJvY2VlZC4gSW5zdGVhZCwgdXNlIHRoZSBhc2tfdXNlciB0b29sIHRvIGNvbGxlY3QgdGhlIG5lZWRlZCB2YWx1ZXMgZnJvbSB0aGUgdXNlciwgdGhlbiBzZW5kIHRoZW0uXG4tIFNlbmQgZXhhY3RseSBvbmUgYW5zd2VyIHBlciBwcm9tcHQgdXNpbmcgd3JpdGVfJHtzaGVsbFR5cGV9LiBOZXZlciBzZW5kIG11bHRpcGxlIGFuc3dlcnMgaW4gYSBzaW5nbGUgc2VuZC5cbi0gQWZ0ZXIgZWFjaCBzZW5kLCBjYWxsIHJlYWRfJHtzaGVsbFR5cGV9IHRvIHJlYWQgdGhlIG5leHQgcHJvbXB0IGJlZm9yZSBzZW5kaW5nIHRoZSBuZXh0IGFuc3dlci5cbi0gQ29udGludWUgb25lIHByb21wdCBhdCBhIHRpbWUgdW50aWwgdGhlIGNvbW1hbmQgZmluaXNoZXMuYCk7XG5cblx0cmV0dXJuIHBhcnRzLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCYXNoTW9kZWxEZXNjcmlwdGlvbihpc1NhbmRib3hFbmFibGVkOiBib29sZWFuLCBuZXR3b3JrRG9tYWlucz86IElUZXJtaW5hbFNhbmRib3hSZXNvbHZlZE5ldHdvcmtEb21haW5zKTogc3RyaW5nIHtcblx0cmV0dXJuIFtcblx0XHQnVGhpcyB0b29sIGFsbG93cyB5b3UgdG8gZXhlY3V0ZSBzaGVsbCBjb21tYW5kcyBpbiBhIHBlcnNpc3RlbnQgYmFzaCB0ZXJtaW5hbCBzZXNzaW9uLCBwcmVzZXJ2aW5nIGVudmlyb25tZW50IHZhcmlhYmxlcywgd29ya2luZyBkaXJlY3RvcnksIGFuZCBvdGhlciBjb250ZXh0IGFjcm9zcyBtdWx0aXBsZSBjb21tYW5kcy4nLFxuXHRcdGNyZWF0ZUdlbmVyaWNEZXNjcmlwdGlvbignYmFzaCcsIGlzU2FuZGJveEVuYWJsZWQsIG5ldHdvcmtEb21haW5zKSxcblx0XHQnLSBVc2UgW1sgXV0gZm9yIGNvbmRpdGlvbmFsIHRlc3RzIGluc3RlYWQgb2YgWyBdJyxcblx0XHQnLSBQcmVmZXIgJCgpIG92ZXIgYmFja3RpY2tzIGZvciBjb21tYW5kIHN1YnN0aXR1dGlvbicsXG5cdFx0Jy0gVXNlIHNldCAtZSBhdCBzdGFydCBvZiBjb21wbGV4IGNvbW1hbmRzIHRvIGV4aXQgb24gZXJyb3JzJ1xuXHRdLmpvaW4oJ1xcbicpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVac2hNb2RlbERlc2NyaXB0aW9uKGlzU2FuZGJveEVuYWJsZWQ6IGJvb2xlYW4sIG5ldHdvcmtEb21haW5zPzogSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnMpOiBzdHJpbmcge1xuXHRyZXR1cm4gW1xuXHRcdCdUaGlzIHRvb2wgYWxsb3dzIHlvdSB0byBleGVjdXRlIHNoZWxsIGNvbW1hbmRzIGluIGEgcGVyc2lzdGVudCB6c2ggdGVybWluYWwgc2Vzc2lvbiwgcHJlc2VydmluZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMsIHdvcmtpbmcgZGlyZWN0b3J5LCBhbmQgb3RoZXIgY29udGV4dCBhY3Jvc3MgbXVsdGlwbGUgY29tbWFuZHMuJyxcblx0XHRjcmVhdGVHZW5lcmljRGVzY3JpcHRpb24oJ2Jhc2gnLCBpc1NhbmRib3hFbmFibGVkLCBuZXR3b3JrRG9tYWlucyksXG5cdFx0Jy0gVXNlIHR5cGUgdG8gY2hlY2sgY29tbWFuZCB0eXBlIChidWlsdGluLCBmdW5jdGlvbiwgYWxpYXMpJyxcblx0XHQnLSBVc2Ugam9icywgZmcsIGJnIGZvciBqb2IgY29udHJvbCcsXG5cdFx0Jy0gVXNlIFtbIF1dIGZvciBjb25kaXRpb25hbCB0ZXN0cyBpbnN0ZWFkIG9mIFsgXScsXG5cdFx0Jy0gUHJlZmVyICQoKSBvdmVyIGJhY2t0aWNrcyBmb3IgY29tbWFuZCBzdWJzdGl0dXRpb24nLFxuXHRcdCctIFRha2UgYWR2YW50YWdlIG9mIHpzaCBnbG9iYmluZyBmZWF0dXJlcyAoKiosIGV4dGVuZGVkIGdsb2JzKS4gTm90ZTogdW5tYXRjaGVkIGdsb2JzIGZhaWwgYnkgZGVmYXVsdCAoenNoOiBubyBtYXRjaGVzIGZvdW5kKSAtIHVzZSBhIGdsb2IgcXVhbGlmaWVyIGxpa2UgKihOKSBvciBxdW90ZSB0aGUgZ2xvYiBpZiBpdCBzaG91bGQgYmUgbGl0ZXJhbCcsXG5cdFx0JycsXG5cdFx0J3pzaCBwaXRmYWxscyAtIHRoZXNlIFdJTEwgY2F1c2UgZXJyb3JzIG9yIGhhbmdzOicsXG5cdFx0Jy0gTkVWRVIgdXNlIGJhcmUgPT0gb3IgPT09IGFzIHNlcGFyYXRvcnMgKGUuZy4gZWNobyA9PT0gdHJpZ2dlcnMgenNoIGVxdWFscyBleHBhbnNpb24pLiBRdW90ZSB0aGVtOiBlY2hvIFxcJz09PVxcJycsXG5cdFx0Jy0gTkVWRVIgdXNlIHN0YXR1cyBhcyBhIHZhcmlhYmxlIG5hbWUgKGl0IGlzIHJlYWQtb25seSBpbiB6c2gpLiBVc2UgZXhpdF9jb2RlIG9yIHJldCBpbnN0ZWFkJyxcblx0XS5qb2luKCdcXG4nKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxZQUFZLGlCQUFrQyxvQkFBb0I7QUFDM0UsU0FBUyxlQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUd0QyxTQUFTLHlCQUFvRDtBQUM3RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxrQ0FBa0MscUJBQXFCLG9CQUFvQiw2QkFBNkIsdUJBQXVCLDhCQUF3RTtBQVloTixNQUFNLHFCQUFxQjtBQXdCcEIsSUFBTSxlQUFOLGNBQTJCLFdBQVc7QUFBQSxFQWM1QyxZQUNrQixhQUNELGtCQUM0QixrQkFDZCxhQUNVLHVCQUNGLHFCQUNKLGlCQUNXLDRCQUNMLGdCQUN2QztBQUNELFVBQU07QUFWVztBQUNEO0FBQzRCO0FBQ2Q7QUFDVTtBQUNGO0FBQ0o7QUFDVztBQUNMO0FBckJ6QyxTQUFpQixVQUFVLG9CQUFJLElBQTJCO0FBQzFELFNBQWlCLGtCQUFrQixvQkFBSSxJQUFvQjtBQUkzRDtBQUFBLFNBQWlCLGdCQUFnQixvQkFBSSxJQUFZO0FBRWpEO0FBQUEsU0FBaUIsNkJBQTZCLG9CQUFJLElBQTZCO0FBRS9FLFNBQWlCLDBCQUEwQixLQUFL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
