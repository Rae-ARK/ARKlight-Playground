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
import { DeferredPromise, RunOnceScheduler, timeout } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { appendEscapedMarkdownInlineCode, escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { getMediaMime } from "../../../../../../base/common/mime.js";
import { basename, posix, win32 } from "../../../../../../base/common/path.js";
import { OperatingSystem, OS } from "../../../../../../base/common/platform.js";
import { count } from "../../../../../../base/common/strings.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { ConfirmationOptionKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { AgentSandboxSettingId } from "../../../../../../platform/sandbox/common/settings.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { ITerminalLogService, TerminalExitReason } from "../../../../../../platform/terminal/common/terminal.js";
import { IRemoteAgentService } from "../../../../../services/remote/common/remoteAgentService.js";
import { TerminalToolConfirmationStorageKeys } from "../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js";
import { IChatService, ChatRequestQueueKind, ElicitationState } from "../../../../chat/common/chatService/chatService.js";
import { autorun, constObservable } from "../../../../../../base/common/observable.js";
import { ChatModel } from "../../../../chat/common/model/chatModel.js";
import { ChatConfiguration, isAutoApproveLevel } from "../../../../chat/common/constants.js";
import { ILanguageModelToolsService, ToolDataSource, ToolInvocationPresentation } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { ITerminalProfileResolverService } from "../../../../terminal/common/terminal.js";
import { DEFAULT_IDLE_SILENCE_TIMEOUT_MS, TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
import { getRecommendedToolsOverRunInTerminal } from "../alternativeRecommendation.js";
import { BasicExecuteStrategy } from "../executeStrategy/basicExecuteStrategy.js";
import { NoneExecuteStrategy } from "../executeStrategy/noneExecuteStrategy.js";
import { RichExecuteStrategy } from "../executeStrategy/richExecuteStrategy.js";
import { getOutput } from "../outputHelpers.js";
import { LargeOutputFileWriter } from "../largeOutputFileWriter.js";
import { buildCommandDisplayText, extractCdPrefix, isFish, isPowerShell, isWindowsPowerShell, isZsh, normalizeTerminalCommandForDisplay } from "../runInTerminalHelpers.js";
import { NodeCommandLinePresenter } from "./commandLinePresenter/nodeCommandLinePresenter.js";
import { PythonCommandLinePresenter } from "./commandLinePresenter/pythonCommandLinePresenter.js";
import { RubyCommandLinePresenter } from "./commandLinePresenter/rubyCommandLinePresenter.js";
import { SandboxedCommandLinePresenter } from "./commandLinePresenter/sandboxedCommandLinePresenter.js";
import { RunInTerminalToolTelemetry } from "../runInTerminalToolTelemetry.js";
import { ShellIntegrationQuality, ToolTerminalCreator } from "../toolTerminalCreator.js";
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from "../treeSitterCommandParser.js";
import { CommandLineAutoApproveAnalyzer } from "./commandLineAnalyzer/commandLineAutoApproveAnalyzer.js";
import { CommandLineFileWriteAnalyzer } from "./commandLineAnalyzer/commandLineFileWriteAnalyzer.js";
import { CommandLineSandboxAnalyzer } from "./commandLineAnalyzer/commandLineSandboxAnalyzer.js";
import { OutputMonitor } from "./monitoring/outputMonitor.js";
import { OutputMonitorState } from "./monitoring/types.js";
import { ChatQuestionCarouselData } from "../../../../chat/common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { chatSessionResourceToId, LocalChatSessionUri } from "../../../../chat/common/model/chatUri.js";
import { TerminalToolId } from "./toolIds.js";
import { URI } from "../../../../../../base/common/uri.js";
import { CommandLineCdPrefixRewriter } from "./commandLineRewriter/commandLineCdPrefixRewriter.js";
import { CommandLinePreventHistoryRewriter } from "./commandLineRewriter/commandLinePreventHistoryRewriter.js";
import { CommandLinePwshChainOperatorRewriter } from "./commandLineRewriter/commandLinePwshChainOperatorRewriter.js";
import { CommandLineBackgroundDetachRewriter } from "./commandLineRewriter/commandLineBackgroundDetachRewriter.js";
import { CommandLineSandboxRewriter } from "./commandLineRewriter/commandLineSandboxRewriter.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IHistoryService } from "../../../../../services/history/common/history.js";
import { ILifecycleService } from "../../../../../services/lifecycle/common/lifecycle.js";
import { TerminalCommandArtifactCollector } from "./terminalCommandArtifactCollector.js";
import { isNumber, isString } from "../../../../../../base/common/types.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { TerminalChatCommandId } from "../../../chat/browser/terminalChat.js";
import { clamp } from "../../../../../../base/common/numbers.js";
import { SandboxOutputAnalyzer, outputLooksSandboxBlocked, outputLooksSandboxNetworkBlocked } from "./sandboxOutputAnalyzer.js";
import { IAgentSessionsService } from "../../../../chat/browser/agentSessions/agentSessionsService.js";
import { ITerminalSandboxService, TerminalSandboxPrerequisiteCheck } from "../../common/terminalSandboxService.js";
import { LanguageModelPartAudience } from "../../../../chat/common/languageModels.js";
import { isSessionAutoApproveLevel, isTerminalAutoApproveAllowed, isToolEligibleForTerminalAutoApproval } from "./terminalToolAutoApprove.js";
import { ChatElicitationRequestPart } from "../../../../chat/common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { getSandboxPrecheckInputsForToolInvocation } from "../../../../chat/browser/tools/toolHelpers.js";
import { compact } from "./consoleCompactor/consoleCompactor.js";
const TERMINAL_SANDBOX_DOCUMENTATION_URL = "https://aka.ms/vscode-sandboxing";
const TOOL_REFERENCE_NAME = "runInTerminal";
const LEGACY_TOOL_REFERENCE_FULL_NAMES = ["runCommands/runInTerminal"];
const INPUT_NEEDED_NOTIFICATION_THROTTLE_MS = 5e3;
function createPowerShellModelDescription(shell, sandboxingOptions, includeElevationGuidance) {
  const isWinPwsh = isWindowsPowerShell(shell);
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
    "Execution Mode:",
    "- For ALL one-shot commands (builds, tests, installs, compilation, linting, downloads, scripts), use mode=sync and omit timeout. The tool waits for the command to complete and returns full output inline. This is the default and strongly preferred mode.",
    `- Use mode=async ONLY for processes that must keep running indefinitely while you do other work (servers, watchers, dev daemons). Async waits for an initial idle/output signal, then returns a terminal ID and output snapshot while the process continues running.`,
    `- In sync mode, the full output is returned when the command completes \u2014 you do NOT need to call ${TerminalToolId.GetTerminalOutput} afterward. Only use ${TerminalToolId.GetTerminalOutput} if the tool result explicitly says the command was moved to background, timed out, or needs input.`,
    "- Returns a terminal ID for checking status and runtime later",
    "- Use Start-Job for background PowerShell jobs",
    "",
    `Use ${TerminalToolId.SendToTerminal} to send commands or input to a terminal session.`
  ];
  if (sandboxingOptions.sandboxMode !== "off") {
    parts.push(...createSandboxLines(sandboxingOptions));
  }
  parts.push(
    "",
    "Output Management:",
    "- Output exceeding 20KB is saved to a temp file; the result includes the file path so you can read the full output with readFile or search it with grep",
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
    ...includeElevationGuidance ? [
      "- Avoid commands that trigger an interactive elevation prompt, such as Start-Process -Verb RunAs or runas.exe. They block on a UAC/password prompt that cannot be answered in this mode, and secrets must never be routed through the model. If elevated privileges are required, tell the user to run the command themselves and stop \u2014 do NOT retry the command with variations."
    ] : [],
    `- NEVER run Start-Sleep or similar wait commands. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input. Do NOT poll for completion.`,
    "- NEVER pipe interactive commands through Select-Object, Where-Object, or other filters \u2014 this hides prompts and prevents the terminal from detecting when input is needed. Run interactive commands without pipes.",
    "",
    "Interactive Input Handling:",
    "- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the vscode_askQuestions tool to collect the needed values from the user, then send them.",
    `- NEVER use vscode_askQuestions to request sensitive input such as passwords, passphrases, API keys, tokens, or other secrets \u2014 answers to that tool are sent through the model. If the prompt requires a secret, tell the user to type it directly into the terminal and stop; do not call vscode_askQuestions or ${TerminalToolId.SendToTerminal} for that prompt.`,
    `- Send exactly one answer per prompt using ${TerminalToolId.SendToTerminal}. Never send multiple answers in a single send.`,
    `- After each send, call ${TerminalToolId.GetTerminalOutput} to read the next prompt before sending the next answer.`,
    "- Continue one prompt at a time until the command finishes."
  );
  return parts.join("\n");
}
function createSandboxLines(sandboxingOptions) {
  const isNetworkAvailable = sandboxingOptions.sandboxMode === "on-network-available";
  const lines = [
    "",
    "Sandboxing:",
    isNetworkAvailable ? "- Commands run inside a sandbox by default. The sandbox keeps the filesystem mostly read-only." : "- Commands run inside a sandbox by default. The sandbox restricts two things independently: the filesystem and the network.",
    "- Filesystem: read-only outside the workspace and $TMPDIR, which stay read-write. Parts of $HOME are hidden for privacy, but common developer tools (git, package managers, language toolchains) still work because their $HOME config and cache paths are automatically made readable.",
    "- Use $TMPDIR for temporary files; /tmp may not be writable. On macOS and Linux the TMPDIR env var is set to a writable path.",
    "- If a command needs sandboxed write access to specific file paths outside workspace, pass requestFileValidationCheck with those paths. VS Code checks sandbox access before execution and returns Access Denied without running the command when access is unavailable."
  ];
  if (!isNetworkAvailable) {
    const deniedDomains = sandboxingOptions.networkDomains?.deniedDomains ?? [];
    const allowedDomains = sandboxingOptions.networkDomains?.allowedDomains ?? [];
    const deniedSet = new Set(deniedDomains);
    const effectiveAllowed = allowedDomains.filter((d) => !deniedSet.has(d));
    const retrySuffix = sandboxingOptions.retryWithAllowNetworkRequests ? " unless requestAllowNetwork=true is set" : "";
    if (effectiveAllowed.length === 0) {
      lines.push(`- Network: blocked in the sandbox; commands that need the network fail${retrySuffix}.`);
    } else {
      lines.push(`- Network: only these domains are reachable in the sandbox: ${effectiveAllowed.join(", ")}. Other domains fail${retrySuffix}.`);
    }
    if (deniedDomains.length > 0) {
      lines.push(`- These domains are explicitly blocked in the sandbox: ${deniedDomains.join(", ")}`);
    }
  }
  if (sandboxingOptions.retryWithAllowNetworkRequests || sandboxingOptions.allowToRunUnsandboxedCommands) {
    lines.push("- To get more access (each prompts the user \u2014 never ask the user for permission yourself):");
    if (sandboxingOptions.retryWithAllowNetworkRequests) {
      lines.push(
        "  - Need a blocked domain? Set requestAllowNetwork=true and provide requestAllowNetworkReason. This keeps the filesystem sandbox in place and only relaxes the network, so prefer it for network-only needs. Do this proactively when network use is obvious (git fetch/pull/push/clone; npm/yarn/pnpm/pip/cargo/go/brew installs; curl; wget), or reactively after a network failure (e.g. 'Network request failed', HTTP code 403)."
      );
    }
    if (sandboxingOptions.allowToRunUnsandboxedCommands) {
      const removesAllClause = sandboxingOptions.retryWithAllowNetworkRequests ? "This grants full filesystem AND network access by removing all sandbox protection, so for network-only needs prefer requestAllowNetwork and use this only when filesystem (or other non-network) access is also blocked." : "This grants full filesystem and network access by removing all sandbox protection, so use it only when the command truly needs it.";
      lines.push(
        `  - Need filesystem or other access the sandbox blocks? Set requestUnsandboxedExecution=true and provide requestUnsandboxedExecutionReason. ${removesAllClause} Do this proactively when it clearly needs it (writing/deleting files outside the workspace and $TMPDIR like $HOME, /usr, /etc; installing to system locations; elevated privileges), or reactively after a sandbox failure (e.g. 'Operation not permitted').`
      );
    }
  }
  if (!sandboxingOptions.allowToRunUnsandboxedCommands) {
    lines.push("- Running commands outside the sandbox is disabled by chat.agent.sandbox.allowUnsandboxedCommands. Do not set requestUnsandboxedExecution=true.");
  }
  return lines;
}
function createSandboxProperties(sandboxingOptions) {
  const isNetworkAvailable = sandboxingOptions.sandboxMode === "on-network-available";
  return {
    ...sandboxingOptions.allowToRunUnsandboxedCommands ? {
      requestUnsandboxedExecution: {
        type: "boolean",
        description: "Request that this command run outside the terminal sandbox. Only set this when the command clearly needs unsandboxed access. The user will be prompted before the command runs unsandboxed."
      },
      requestUnsandboxedExecutionReason: {
        type: "string",
        description: "A short explanation of why this command must run outside the terminal sandbox. Only provide this when requestUnsandboxedExecution is true."
      }
    } : {},
    ...isNetworkAvailable || !sandboxingOptions.retryWithAllowNetworkRequests ? {} : {
      requestAllowNetwork: {
        type: "boolean",
        description: "Request that this command remain in the terminal sandbox but run with unrestricted network access. Only set this when the command clearly needs network access but the required network access was blocked. The user will be prompted before network restrictions are relaxed."
      },
      requestAllowNetworkReason: {
        type: "string",
        description: "A short explanation of why this sandboxed command needs unrestricted network access. Only provide this when requestAllowNetwork is true."
      }
    },
    requestFileValidationCheck: {
      type: "array",
      description: "Sandbox write access checks to perform before running the command. Provide the file paths that the command needs to write.",
      items: {
        type: "string"
      }
    },
    requestFileValidationCheckReason: {
      type: "string",
      description: "A short explanation of why this sandboxed command needs these file paths. Only provide this when requestFileValidationCheck is not empty."
    }
  };
}
function createGenericDescription(sandboxingOptions, includeElevationGuidance) {
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

Execution Mode:
- For ALL one-shot commands (builds, tests, installs, compilation, linting, downloads, scripts), use mode='sync' and omit timeout. The tool waits for the command to complete and returns full output inline. This is the default and strongly preferred mode.
- Use mode='async' ONLY for processes that must keep running indefinitely while you do other work (servers, watchers, dev daemons). Async waits for an initial idle/output signal, then returns a terminal ID and output snapshot while the process continues running.
- In sync mode, the full output is returned when the command completes \u2014 you do NOT need to call ${TerminalToolId.GetTerminalOutput} afterward. Only use ${TerminalToolId.GetTerminalOutput} if the tool result explicitly says the command was moved to background, timed out, or needs input.

Use ${TerminalToolId.SendToTerminal} to send commands or input to a terminal session.`];
  if (sandboxingOptions.sandboxMode !== "off") {
    parts.push(createSandboxLines(sandboxingOptions).join("\n"));
  }
  parts.push(`

Output Management:
- Output exceeding 20KB is saved to a temp file; the result includes the file path so you can read the full output with readFile or search it with grep
- Use head, tail, grep, awk to filter and limit output size
- For pager commands, disable paging: git --no-pager or add | cat
- Use wc -l to count lines before displaying large outputs

Best Practices:
- Quote variables: "$var" instead of $var to handle spaces
- Use find with -exec or xargs for file operations
- Be specific with commands to avoid excessive output
- Avoid printing credentials unless absolutely required
${includeElevationGuidance ? "- Avoid commands that require interactive privilege escalation, such as sudo/su/doas without a non-interactive flag (e.g. sudo -n). They block on a password prompt that cannot be answered in this mode, and secrets must never be routed through the model. If a command needs elevated privileges, tell the user to run it themselves in the terminal and stop \u2014 do NOT retry the command with variations.\n" : ""}- NEVER run sleep or similar wait commands in a terminal. You will be automatically notified on your next turn when async terminal commands or timed-out sync commands complete or need input. Do NOT poll for completion.
- NEVER pipe interactive commands through tail, head, grep, or other filters \u2014 this hides prompts and prevents the terminal from detecting when input is needed. Run interactive commands without pipes.

Interactive Input Handling:
- When a terminal command is waiting for interactive input, do NOT suggest alternatives or ask the user whether to proceed. Instead, use the vscode_askQuestions tool to collect the needed values from the user, then send them.
- NEVER use vscode_askQuestions to request sensitive input such as passwords, passphrases, API keys, tokens, or other secrets \u2014 answers to that tool are sent through the model. If the prompt requires a secret, tell the user to type it directly into the terminal and stop; do not call vscode_askQuestions or send_to_terminal for that prompt.
- Send exactly one answer per prompt using ${TerminalToolId.SendToTerminal}. Never send multiple answers in a single send.
- After each send, call ${TerminalToolId.GetTerminalOutput} to read the next prompt before sending the next answer.
- Continue one prompt at a time until the command finishes.`);
  return parts.join("");
}
function createBashModelDescription(sandboxingOptions, includeElevationGuidance) {
  return [
    "This tool allows you to execute shell commands in a persistent bash terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription(sandboxingOptions, includeElevationGuidance),
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution"
  ].join("\n");
}
function createZshModelDescription(sandboxingOptions, includeElevationGuidance) {
  return [
    "This tool allows you to execute shell commands in a persistent zsh terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription(sandboxingOptions, includeElevationGuidance),
    "- Use type to check command type (builtin, function, alias)",
    "- Use jobs, fg, bg for job control",
    "- Use [[ ]] for conditional tests instead of [ ]",
    "- Prefer $() over backticks for command substitution",
    "- Take advantage of zsh globbing features (**, extended globs). Note: unmatched globs fail by default (zsh: no matches found) \u2014 use a glob qualifier like *(N) or quote the glob if it should be literal",
    "",
    "zsh pitfalls \u2014 these WILL cause errors or hangs:",
    "- NEVER use bare == or === as separators (e.g. echo === triggers zsh equals expansion). Quote them: echo '==='",
    "- NEVER use status as a variable name (it is read-only in zsh). Use exit_code or ret instead"
  ].join("\n");
}
function createFishModelDescription(sandboxingOptions, includeElevationGuidance) {
  return [
    "This tool allows you to execute shell commands in a persistent fish terminal session, preserving environment variables, working directory, and other context across multiple commands.",
    createGenericDescription(sandboxingOptions, includeElevationGuidance),
    "- Use type to check command type (builtin, function, alias)",
    "- Use jobs, fg, bg for job control",
    "- Use test expressions for conditionals (no [[ ]] syntax)",
    "- Prefer command substitution with () syntax",
    "- Variables are arrays by default, use $var[1] for first element",
    "- Take advantage of fish's autosuggestions and completions"
  ].join("\n");
}
async function createRunInTerminalToolData(accessor) {
  const instantiationService = accessor.get(IInstantiationService);
  const terminalSandboxService = accessor.get(ITerminalSandboxService);
  const configurationService = accessor.get(IConfigurationService);
  const allowToRunUnsandboxedCommands = configurationService.getValue(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
  const retryWithAllowNetworkRequestsSetting = configurationService.getValue(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
  const defaultPermissionLevel = configurationService.getValue(ChatConfiguration.DefaultPermissionLevel);
  const includeElevationGuidance = configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true || configurationService.getValue(ChatConfiguration.GlobalAutoApprove) === true || isAutoApproveLevel(defaultPermissionLevel);
  const profileFetcher = instantiationService.createInstance(TerminalProfileFetcher);
  const [shell, os, isSandboxEnabled, isSandboxAllowNetworkEnabled] = await Promise.all([
    profileFetcher.getCopilotShell(),
    profileFetcher.osBackend,
    terminalSandboxService.isEnabled(),
    terminalSandboxService.isSandboxAllowNetworkEnabled()
  ]);
  const sandboxingOptions = isSandboxEnabled ? isSandboxAllowNetworkEnabled ? {
    sandboxMode: "on-network-available",
    allowToRunUnsandboxedCommands,
    retryWithAllowNetworkRequests: false,
    networkDomains: void 0
  } : {
    sandboxMode: "on-network-restricted",
    allowToRunUnsandboxedCommands,
    retryWithAllowNetworkRequests: retryWithAllowNetworkRequestsSetting,
    networkDomains: terminalSandboxService.getResolvedNetworkDomains()
  } : {
    sandboxMode: "off"
  };
  let modelDescription;
  if (shell && os && isPowerShell(shell, os)) {
    modelDescription = createPowerShellModelDescription(shell, sandboxingOptions, includeElevationGuidance);
  } else if (shell && os && isZsh(shell, os)) {
    modelDescription = createZshModelDescription(sandboxingOptions, includeElevationGuidance);
  } else if (shell && os && isFish(shell, os)) {
    modelDescription = createFishModelDescription(sandboxingOptions, includeElevationGuidance);
  } else {
    modelDescription = createBashModelDescription(sandboxingOptions, includeElevationGuidance);
  }
  const sharedProperties = {
    command: {
      type: "string",
      description: "The command to run in the terminal."
    },
    explanation: {
      type: "string",
      description: "A one-sentence description of what the command does. This will be shown to the user before the command is run."
    },
    goal: {
      type: "string",
      description: 'A short description of the goal or purpose of the command (e.g., "Install dependencies", "Start development server").'
    }
  };
  const sandboxProperties = sandboxingOptions.sandboxMode === "off" ? {} : createSandboxProperties(sandboxingOptions);
  return {
    id: TerminalToolId.RunInTerminal,
    toolReferenceName: TOOL_REFERENCE_NAME,
    legacyToolReferenceFullNames: LEGACY_TOOL_REFERENCE_FULL_NAMES,
    displayName: localize("runInTerminalTool.displayName", "Run in Terminal"),
    modelDescription: `${modelDescription}

Execution mode:
- mode='sync' (strongly preferred): waits for the command to complete and returns full output inline. Use for ALL one-shot commands (builds, tests, installs, compilation, scripts). Omit timeout to let the command run to completion \u2014 the tool handles idle detection and input prompts automatically.
- mode='async': waits for an initial idle/output signal from the command, then returns a terminal ID and output snapshot while the process continues running. Use ONLY for processes that must keep running indefinitely (servers, watchers, daemons). Timeout caps how long to wait for the initial idle/output signal.

Timeout parameter: Usually omit timeout entirely for sync commands \u2014 the tool returns automatically on completion, input-needed, or cancellation. Only set a timeout as a safety net for commands you suspect might hang. Use 0 to explicitly indicate no timeout.

Sync output is final: When a sync command completes, the full output is returned inline \u2014 do NOT call ${TerminalToolId.GetTerminalOutput} afterward. Only use ${TerminalToolId.GetTerminalOutput} if the tool result explicitly indicates the command was moved to background, timed out, or needs input. Do NOT tell the user to check the terminal panel \u2014 all command output is already included in the tool result.

Terminal notifications: When an async command finishes or a sync command times out, you will be automatically notified on your next turn with the exit code and terminal output. You will also be notified if the terminal needs input. Do NOT poll or sleep to wait for completion.`,
    userDescription: localize("runInTerminalTool.userDescription", "Run commands in the terminal"),
    source: ToolDataSource.Internal,
    icon: Codicon.terminal,
    inputSchema: {
      type: "object",
      properties: {
        ...sharedProperties,
        ...sandboxProperties,
        mode: {
          type: "string",
          enum: ["sync", "async"],
          enumDescriptions: [
            "Wait for command completion and return full output inline. Strongly preferred for all one-shot commands (builds, tests, installs, scripts).",
            "Wait for an initial idle/output signal, then return a terminal ID and output snapshot while the process continues running. Timeout caps how long to wait for the initial signal. Use ONLY for processes that must keep running indefinitely (servers, watchers, daemons)."
          ],
          description: "Execution mode for this command. Use sync (default) for nearly all commands."
        },
        isBackground: {
          type: "boolean",
          description: 'Legacy execution mode flag. Deprecated in favor of "mode". If true, equivalent to mode=async. If false, equivalent to mode=sync.'
        },
        timeout: {
          type: "number",
          description: "Optional. Usually omit entirely for sync commands \u2014 the tool waits for completion automatically. Only set a timeout (in milliseconds) as a safety net if you suspect the command might hang. If the timeout elapses, the command continues in the background and you get a terminal ID to check output later. Use 0 to explicitly indicate no timeout."
        }
      },
      required: ["command", "explanation", "goal", "mode"]
    }
  };
}
var TerminalToolStorageKeysInternal = /* @__PURE__ */ ((TerminalToolStorageKeysInternal2) => {
  TerminalToolStorageKeysInternal2["TerminalSession"] = "chat.terminalSessions";
  return TerminalToolStorageKeysInternal2;
})(TerminalToolStorageKeysInternal || {});
function shouldAutomaticallyRetrySandbox(options) {
  return options.retryAllowed && options.didSandboxWrapCommand && options.retryAlreadyRequested !== true && !options.isPersistentSession && !options.isBackgroundExecution && !options.didTimeout && options.exitCode !== 0 && options.outputLooksRetryable(options.output);
}
function shouldAutomaticallyRetryUnsandboxed(options) {
  return shouldAutomaticallyRetrySandbox({
    retryAllowed: options.allowUnsandboxedCommands,
    retryAlreadyRequested: options.requestUnsandboxedExecution,
    didSandboxWrapCommand: options.didSandboxWrapCommand,
    isPersistentSession: options.isPersistentSession,
    isBackgroundExecution: options.isBackgroundExecution,
    didTimeout: options.didTimeout,
    exitCode: options.exitCode,
    output: options.output,
    // Network failures are handled by shouldAutomaticallyRetryAllowNetworkInSandboxed; do not automatically leave the sandbox for them.
    outputLooksRetryable: (output) => outputLooksSandboxBlocked(output) && !outputLooksSandboxNetworkBlocked(output)
  });
}
function shouldAutomaticallyRetryAllowNetworkInSandboxed(options) {
  return shouldAutomaticallyRetrySandbox({
    retryAllowed: options.retryWithAllowNetworkRequests,
    retryAlreadyRequested: options.requestUnsandboxedExecution || options.requestAllowNetwork,
    didSandboxWrapCommand: options.didSandboxWrapCommand,
    isPersistentSession: options.isPersistentSession,
    isBackgroundExecution: options.isBackgroundExecution,
    didTimeout: options.didTimeout,
    exitCode: options.exitCode,
    output: options.output,
    outputLooksRetryable: outputLooksSandboxNetworkBlocked
  });
}
function outputLooksBubblewrapHostRestricted(output) {
  return /bwrap:\s*No permissions to create new namespace/i.test(output.replace(/\s+/g, " "));
}
const telemetryIgnoredSequences = [
  "\x1B[I",
  // Focus in
  "\x1B[O"
  // Focus out
];
const altBufferMessage = "\n" + localize("runInTerminalTool.altBufferMessage", "The command opened the alternate buffer.");
function buildCompletionNotificationCommand(command) {
  const firstNewline = command.search(/\r|\n/);
  const hasMoreLines = firstNewline !== -1;
  const firstLine = hasMoreLines ? command.substring(0, firstNewline) : command;
  const normalized = normalizeTerminalCommandForDisplay(firstLine);
  if (normalized.length > 80) {
    return normalized.substring(0, 79) + "\u2026";
  }
  return hasMoreLines ? normalized + "\u2026" : normalized;
}
let RunInTerminalTool = class extends Disposable {
  constructor(_chatService, _configurationService, _fileService, _historyService, _instantiationService, _labelService, _languageModelToolsService, _remoteAgentService, _storageService, _terminalChatService, _logService, _terminalService, _terminalSandboxService, _workspaceContextService, _chatWidgetService, _agentSessionsService, lifecycleService) {
    super();
    this._chatService = _chatService;
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._historyService = _historyService;
    this._instantiationService = _instantiationService;
    this._labelService = _labelService;
    this._languageModelToolsService = _languageModelToolsService;
    this._remoteAgentService = _remoteAgentService;
    this._storageService = _storageService;
    this._terminalChatService = _terminalChatService;
    this._logService = _logService;
    this._terminalService = _terminalService;
    this._terminalSandboxService = _terminalSandboxService;
    this._workspaceContextService = _workspaceContextService;
    this._chatWidgetService = _chatWidgetService;
    this._agentSessionsService = _agentSessionsService;
    this._archivedSessionListener = this._register(new MutableDisposable());
    this._sessionTerminalAssociations = new ResourceMap();
    this._sessionTerminalInstances = new ResourceMap();
    this._terminalsBeingDisposedBySessionCleanup = /* @__PURE__ */ new Set();
    /**
     * Tracks active background completion notifications per terminal instance ID.
     * When a new notification is registered for a terminal that already has one,
     * the previous notification (and its OutputMonitor) is disposed first to
     * prevent listener accumulation on the terminal's onDidInputData emitter.
     *
     * Keyed by `ITerminalInstance.instanceId` (stable per terminal) rather than
     * the per-invocation `termId` so that reusing the same foreground terminal
     * after an `inputNeeded` race disposes the prior OutputMonitor.
     */
    this._backgroundNotifications = this._register(new DisposableMap());
    /**
     * Set when VS Code is shutting down. Suppresses "terminal exited"
     * notifications that would otherwise be generated when background
     * terminals are disposed during shutdown and then persist as
     * undeliverable steering messages after restart.
     */
    this._isShuttingDown = false;
    /**
     * Per-instance disposables that unregister `_activeExecutions` entries from the
     * `ITerminalChatService` execution-id map. Keyed by the same `termId` as `_activeExecutions`
     * so registrations and active executions share a lifecycle.
     */
    this._executionRegistrations = this._register(new DisposableMap());
    this._register(lifecycleService.onWillShutdown(() => {
      this._isShuttingDown = true;
    }));
    this._osBackend = this._remoteAgentService.getEnvironment().then((remoteEnv) => remoteEnv?.os ?? OS);
    this._terminalToolCreator = this._instantiationService.createInstance(ToolTerminalCreator);
    this._treeSitterCommandParser = this._register(this._instantiationService.createInstance(TreeSitterCommandParser));
    this._telemetry = this._instantiationService.createInstance(RunInTerminalToolTelemetry);
    this._commandArtifactCollector = this._instantiationService.createInstance(TerminalCommandArtifactCollector);
    this._profileFetcher = this._instantiationService.createInstance(TerminalProfileFetcher);
    this._largeOutputFileWriter = this._register(this._instantiationService.createInstance(LargeOutputFileWriter));
    this._commandLineRewriters = [
      this._register(this._instantiationService.createInstance(CommandLineCdPrefixRewriter)),
      this._register(this._instantiationService.createInstance(CommandLinePwshChainOperatorRewriter, this._treeSitterCommandParser))
    ];
    if (this._enableCommandLineSandboxRewriting) {
      this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLineSandboxRewriter, this._treeSitterCommandParser)));
    }
    this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLineBackgroundDetachRewriter)));
    this._commandLineRewriters.push(this._register(this._instantiationService.createInstance(CommandLinePreventHistoryRewriter)));
    this._commandLineAnalyzers = [
      this._register(this._instantiationService.createInstance(CommandLineFileWriteAnalyzer, this._treeSitterCommandParser, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineFileWriteAnalyzer: ${message}`, args))),
      this._register(this._instantiationService.createInstance(CommandLineAutoApproveAnalyzer, this._treeSitterCommandParser, this._telemetry, (message, args) => this._logService.info(`RunInTerminalTool#CommandLineAutoApproveAnalyzer: ${message}`, args)))
    ];
    if (this._enableCommandLineSandboxRewriting) {
      this._commandLineAnalyzers.push(this._register(this._instantiationService.createInstance(CommandLineSandboxAnalyzer)));
    }
    this._commandLinePresenters = [
      this._instantiationService.createInstance(SandboxedCommandLinePresenter),
      new NodeCommandLinePresenter(),
      new PythonCommandLinePresenter(),
      new RubyCommandLinePresenter()
    ];
    this._outputAnalyzers = [
      this._register(this._instantiationService.createInstance(SandboxOutputAnalyzer))
    ];
    this._register(Event.runAndSubscribe(this._configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration(TerminalChatAgentToolsSettingId.EnableAutoApprove)) {
        if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) !== true) {
          this._storageService.remove(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION);
        }
      }
    }));
    this._restoreTerminalAssociations();
    this._register(this._terminalService.onDidDisposeInstance((e) => {
      this._removeTerminalAssociations(e);
    }));
    this._register(this._chatService.onDidDisposeSession((e) => {
      for (const resource of e.sessionResources) {
        this._cleanupSessionTerminals(resource);
      }
      this._largeOutputFileWriter.cleanup();
    }));
  }
  _setActiveExecution(termId, execution) {
    RunInTerminalTool._activeExecutions.set(termId, execution);
    this._executionRegistrations.set(termId, this._terminalChatService.registerTerminalInstanceWithExecutionId(termId, execution.instance));
  }
  _deleteActiveExecution(termId) {
    this._executionRegistrations.deleteAndDispose(termId);
    return RunInTerminalTool._activeExecutions.delete(termId);
  }
  static getBackgroundOutput(id) {
    const execution = RunInTerminalTool._activeExecutions.get(id);
    if (!execution) {
      throw new Error("Invalid terminal ID");
    }
    return execution.getOutput();
  }
  /**
   * Gets an active terminal execution by ID. Returns undefined if not found.
   * Can be used to await the completion of a background terminal command.
   */
  static getExecution(id) {
    return RunInTerminalTool._activeExecutions.get(id);
  }
  /**
   * Removes an active terminal execution by ID and disposes it.
   * @returns true if the execution was found and removed, false otherwise.
   */
  static removeExecution(id) {
    const execution = RunInTerminalTool._activeExecutions.get(id);
    if (!execution) {
      return false;
    }
    execution.dispose();
    RunInTerminalTool._activeExecutions.delete(id);
    return true;
  }
  /**
   * Marks a terminal ID as being killed by the `kill_terminal` tool so that
   * the `onDisposed` handler in `_registerCompletionNotification` skips the
   * redundant steering message.
   */
  static markKilledByTool(id) {
    RunInTerminalTool._killedByTool.add(id);
  }
  _resolveExecutionOptions(args) {
    const mode = args.mode ?? (args.isBackground ? "async" : "sync");
    switch (mode) {
      case "async":
        return { mode: "async", persistentSession: true, waitStrategy: "idle" };
      case "sync":
      default:
        return { mode: "sync", persistentSession: false, waitStrategy: "completion" };
    }
  }
  get _allowUnsandboxedCommands() {
    return this._configurationService.getValue(AgentSandboxSettingId.AgentSandboxAllowUnsandboxedCommands) === true;
  }
  get _retryWithAllowNetworkRequests() {
    return this._configurationService.getValue(AgentSandboxSettingId.AgentSandboxRetryWithAllowNetworkRequests) === true;
  }
  get _allowSandboxAutoApprove() {
    return this._configurationService.getValue(AgentSandboxSettingId.AgentSandboxAllowAutoApprove) === true;
  }
  _getAllowToRunUnsandboxedCommands(args) {
    return (args.allowToRunUnsandboxedCommands ?? this._allowUnsandboxedCommands) === true && this._allowUnsandboxedCommands;
  }
  _shouldRejectUnsandboxedExecutionRequest(isSandboxEnabled, allowUnsandboxedCommands, args) {
    return isSandboxEnabled && args.requestUnsandboxedExecution === true && !allowUnsandboxedCommands;
  }
  _shouldRejectAllowNetworkRequest(isSandboxEnabled, isSandboxAllowNetworkEnabled, args) {
    return isSandboxEnabled && !isSandboxAllowNetworkEnabled && args.requestAllowNetwork === true && !this._retryWithAllowNetworkRequests;
  }
  _getUnsandboxedExecutionDisabledMessage() {
    return localize(
      "runInTerminal.unsandboxed.disabled.result",
      "The command was not executed because it requested to run outside the terminal sandbox, but running commands outside the sandbox is disabled by chat.agent.sandbox.allowUnsandboxedCommands. Run the command in the sandbox instead, or enable the setting to allow unsandboxed execution."
    );
  }
  _getAllowNetworkRequestDisabledMessage() {
    return localize(
      "runInTerminal.allowNetwork.disabled.result",
      "The command was not executed because it requested unrestricted network access in the terminal sandbox, but per-command network access is disabled by chat.agent.sandbox.retryWithAllowNetworkRequests. Run the command with restricted network access instead, or enable the setting to allow network access requests."
    );
  }
  async _getDeniedSandboxFileAccess(paths, sandboxPrecheckInputs) {
    if (!paths?.length) {
      return [];
    }
    const result = await this._terminalSandboxService.checkFileAccess("write", paths, sandboxPrecheckInputs);
    return result.denied;
  }
  _buildSandboxFileAccessDeniedMessage(deniedPaths) {
    const deniedPathsMessage = deniedPaths.map((path) => `write: ${path}`).join("\n");
    return localize(
      "runInTerminal.sandbox.fileAccessDenied",
      "Access Denied: The command was not executed because the terminal sandbox does not allow access to the requested file paths:\n{0}",
      deniedPathsMessage
    );
  }
  /**
   * Controls whether this tool wires up sandbox-specific command-line
   * behavior, including both the {@link CommandLineSandboxRewriter} and the
   * {@link CommandLineSandboxAnalyzer}. This is separate from
   * ITerminalSandboxService.isEnabled(), which reports the current terminal
   * sandboxing enablement for the running window.
   */
  get _enableCommandLineSandboxRewriting() {
    return true;
  }
  async handleToolStream(context, _token) {
    const partialInput = context.rawInput;
    if (partialInput && typeof partialInput === "object" && partialInput.command) {
      const truncatedCommand = buildCommandDisplayText(partialInput.command);
      const invocationMessage = new MarkdownString(localize("runInTerminal.streaming", "Running `{0}`", escapeMarkdownSyntaxTokens(truncatedCommand)));
      return { invocationMessage };
    }
    return { invocationMessage: localize("runInTerminal.streaming.default", "Running command") };
  }
  async prepareToolInvocation(context, token) {
    const args = context.parameters;
    const executionOptions = this._resolveExecutionOptions(args);
    const chatSessionResource = context.chatSessionResource;
    const sandboxPrecheckInputs = this._getSandboxPrecheckInputs(chatSessionResource, context.chatRequestId);
    let instance;
    if (chatSessionResource) {
      const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
      if (toolTerminal && !toolTerminal.isBackground) {
        instance = toolTerminal.instance;
      }
    }
    const [os, shell, cwd, sandboxPrereqs] = await Promise.all([
      this._osBackend,
      this._profileFetcher.getCopilotShell(),
      (async () => {
        let cwd2 = await instance?.getCwdResource();
        if (!cwd2) {
          const sessionModel = chatSessionResource ? this._chatService.getSession(chatSessionResource) : void 0;
          if (sessionModel?.workingDirectory) {
            cwd2 = sessionModel.workingDirectory;
          } else {
            const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
            const workspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
            cwd2 = workspaceFolder?.uri;
          }
        }
        return cwd2;
      })(),
      this._terminalSandboxService.checkForSandboxingPrereqs(false, sandboxPrecheckInputs)
    ]);
    const language = os === OperatingSystem.Windows ? "pwsh" : "sh";
    const isSandboxEnabled = sandboxPrereqs.enabled;
    const isSandboxAllowNetworkEnabled = isSandboxEnabled && await this._terminalSandboxService.isSandboxAllowNetworkEnabled();
    const allowUnsandboxedCommands = this._getAllowToRunUnsandboxedCommands(args);
    const explicitUnsandboxRequest = isSandboxEnabled && allowUnsandboxedCommands && args.requestUnsandboxedExecution === true;
    const explicitAllowNetworkRequest = isSandboxEnabled && !isSandboxAllowNetworkEnabled && this._retryWithAllowNetworkRequests && !explicitUnsandboxRequest && args.requestAllowNetwork === true;
    let requiresUnsandboxConfirmation = explicitUnsandboxRequest;
    let requestUnsandboxedExecutionReason = explicitUnsandboxRequest ? args.requestUnsandboxedExecutionReason : void 0;
    let requiresAllowNetworkConfirmation = explicitAllowNetworkRequest;
    let requestAllowNetworkReason = explicitAllowNetworkRequest ? args.requestAllowNetworkReason : void 0;
    const missingDependencies = sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Dependencies && sandboxPrereqs.missingDependencies?.length ? sandboxPrereqs.missingDependencies : void 0;
    const canInstallMissingDependencies = !!missingDependencies && sandboxPrereqs.canInstallMissingDependencies === true;
    const sandboxRemediations = sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap && sandboxPrereqs.remediations?.length ? [...sandboxPrereqs.remediations] : void 0;
    const sandboxPrerequisiteFailure = sandboxPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap && !sandboxRemediations ? localize("runInTerminal.bubblewrap.unusable", "Bubblewrap is installed but cannot create the required sandbox namespace on this system. The command was not executed.") : missingDependencies && !canInstallMissingDependencies ? localize("runInTerminal.missingDeps.unsupportedInstaller", "The following dependencies required for sandboxed execution are not installed: {0}. Install them using your system package manager, then run the command again.", missingDependencies.join(", ")) : void 0;
    const terminalToolSessionId = generateUuid();
    const terminalCommandId = `tool-${generateUuid()}`;
    if (this._shouldRejectUnsandboxedExecutionRequest(isSandboxEnabled, allowUnsandboxedCommands, args)) {
      const commandToDisplay2 = normalizeTerminalCommandForDisplay(args.command);
      return {
        invocationMessage: new MarkdownString(localize("runInTerminal.unsandboxed.disabled.invocation", "Not running `{0}` because unsandboxed execution is disabled", escapeMarkdownSyntaxTokens(buildCommandDisplayText(commandToDisplay2)))),
        icon: Codicon.error,
        confirmationMessages: void 0,
        toolSpecificData: {
          kind: "terminal",
          terminalToolSessionId,
          terminalCommandId,
          commandLine: {
            original: args.command,
            forDisplay: commandToDisplay2
          },
          cwd,
          language,
          isBackground: executionOptions.persistentSession,
          requestUnsandboxedExecution: false,
          requestUnsandboxedExecutionReason: void 0
        }
      };
    }
    if (this._shouldRejectAllowNetworkRequest(isSandboxEnabled, isSandboxAllowNetworkEnabled, args)) {
      const commandToDisplay2 = normalizeTerminalCommandForDisplay(args.command);
      return {
        invocationMessage: new MarkdownString(localize("runInTerminal.allowNetwork.disabled.invocation", "Not running `{0}` because unrestricted network access in the sandbox is disabled", escapeMarkdownSyntaxTokens(buildCommandDisplayText(commandToDisplay2)))),
        icon: Codicon.error,
        confirmationMessages: void 0,
        toolSpecificData: {
          kind: "terminal",
          terminalToolSessionId,
          terminalCommandId,
          commandLine: {
            original: args.command,
            forDisplay: commandToDisplay2
          },
          cwd,
          language,
          isBackground: executionOptions.persistentSession,
          requestAllowNetwork: false,
          requestAllowNetworkReason: void 0
        }
      };
    }
    const rewriteResult = await this._rewriteCommandLine(args.command, {
      cwd,
      shell,
      os,
      isBackground: executionOptions.persistentSession,
      requestUnsandboxedExecution: allowUnsandboxedCommands ? requiresUnsandboxConfirmation : false,
      requestUnsandboxedExecutionReason,
      requestAllowNetwork: explicitAllowNetworkRequest,
      requestAllowNetworkReason,
      sandboxPrecheckInputs
    });
    const rewrittenCommand = rewriteResult.rewrittenCommand;
    const forDisplayCommand = rewriteResult.forDisplayCommand;
    const isSandboxWrapped = rewriteResult.isSandboxWrapped;
    requiresUnsandboxConfirmation = rewriteResult.requiresUnsandboxConfirmation;
    requestUnsandboxedExecutionReason = rewriteResult.requestUnsandboxedExecutionReason;
    requiresAllowNetworkConfirmation = rewriteResult.requiresAllowNetworkConfirmation;
    requestAllowNetworkReason = rewriteResult.requestAllowNetworkReason;
    const blockedDomains = rewriteResult.blockedDomains;
    const toolSpecificData = {
      kind: "terminal",
      terminalToolSessionId,
      terminalCommandId,
      commandLine: {
        original: args.command,
        toolEdited: rewrittenCommand === args.command ? void 0 : rewrittenCommand,
        forDisplay: forDisplayCommand ?? normalizeTerminalCommandForDisplay(rewrittenCommand ?? args.command),
        isSandboxWrapped
      },
      cwd,
      language,
      isBackground: executionOptions.persistentSession,
      requestUnsandboxedExecution: requiresUnsandboxConfirmation,
      requestUnsandboxedExecutionReason,
      requestAllowNetwork: requiresAllowNetworkConfirmation,
      requestAllowNetworkReason,
      missingSandboxDependencies: missingDependencies,
      sandboxRemediations,
      sandboxPrerequisiteFailure
    };
    let sandboxPrerequisiteConfirmation = void 0;
    if (missingDependencies && canInstallMissingDependencies) {
      const depsList = missingDependencies.join(", ");
      sandboxPrerequisiteConfirmation = {
        title: localize("runInTerminal.missingDeps.title", "Missing Sandbox Dependencies"),
        message: new MarkdownString(localize(
          "runInTerminal.missingDeps.message",
          "The following dependencies required for sandboxed execution are not installed: {0}. Would you like to install them?",
          depsList
        )),
        customOptions: [
          { id: "install", label: localize("runInTerminal.missingDeps.install", "Install"), kind: ConfirmationOptionKind.Approve },
          { id: "cancel", label: localize("runInTerminal.missingDeps.cancel", "Cancel"), kind: ConfirmationOptionKind.Deny }
        ]
      };
    }
    const alternativeRecommendation = getRecommendedToolsOverRunInTerminal(args.command, this._languageModelToolsService);
    if (alternativeRecommendation) {
      toolSpecificData.alternativeRecommendation = alternativeRecommendation;
      return {
        confirmationMessages: void 0,
        presentation: ToolInvocationPresentation.Hidden,
        toolSpecificData
      };
    }
    const commandLine = forDisplayCommand ?? rewrittenCommand ?? args.command;
    const isEligibleForAutoApproval = () => isToolEligibleForTerminalAutoApproval(TOOL_REFERENCE_NAME, this._configurationService, LEGACY_TOOL_REFERENCE_FULL_NAMES);
    const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
    const isAutoApproveAllowed = isTerminalAutoApproveAllowed(TOOL_REFERENCE_NAME, this._configurationService, this._storageService, LEGACY_TOOL_REFERENCE_FULL_NAMES);
    const commandLineAnalyzerOptions = {
      commandLine,
      cwd,
      os,
      shell,
      treeSitterLanguage: isPowerShell(shell, os) ? TreeSitterCommandParserLanguage.PowerShell : TreeSitterCommandParserLanguage.Bash,
      terminalToolSessionId,
      chatSessionResource,
      requiresUnsandboxConfirmation,
      requiresAllowNetworkConfirmation,
      hasSessionAutoApproval: !!chatSessionResource && this._terminalChatService.hasChatSessionAutoApproval(chatSessionResource)
    };
    const isSessionAutoApproved = chatSessionResource && isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);
    const commandLineAnalyzers = isSessionAutoApproved ? this._commandLineAnalyzers.filter((e) => !(e instanceof CommandLineAutoApproveAnalyzer)) : this._commandLineAnalyzers;
    const commandLineAnalyzerResults = await Promise.all(commandLineAnalyzers.map((e) => e.analyze(commandLineAnalyzerOptions)));
    const disclaimersRaw = commandLineAnalyzerResults.map((e) => e.disclaimers).filter((e) => !!e).flatMap((e) => e);
    let disclaimer;
    if (disclaimersRaw.length > 0) {
      const disclaimerTexts = disclaimersRaw.map((d) => typeof d === "string" ? d : d.value);
      const hasMarkdownDisclaimer = disclaimersRaw.some((d) => typeof d !== "string");
      const mdOptions = hasMarkdownDisclaimer ? { supportThemeIcons: true, isTrusted: { enabledCommands: [TerminalChatCommandId.OpenTerminalSettingsLink] } } : { supportThemeIcons: true };
      disclaimer = new MarkdownString(`$(${Codicon.info.id}) ` + disclaimerTexts.join(" "), mdOptions);
    }
    const analyzersIsAutoApproveAllowed = commandLineAnalyzerResults.every((e) => e.isAutoApproveAllowed);
    const customActions = isEligibleForAutoApproval() && analyzersIsAutoApproveAllowed ? commandLineAnalyzerResults.map((e) => e.customActions ?? []).flat() : void 0;
    let shellType = basename(shell, ".exe");
    if (shellType === "powershell") {
      shellType = "pwsh";
    }
    const wouldBeAutoApproved = (
      // Does at least one analyzer auto approve
      commandLineAnalyzerResults.some((e) => e.isAutoApproved) && // No analyzer denies auto approval
      commandLineAnalyzerResults.every((e) => e.isAutoApproved !== false) && // All analyzers allow auto approval
      analyzersIsAutoApproveAllowed
    );
    const isAutoApprovedByRules = (
      // Is the setting enabled and the user has opted-in
      isAutoApproveAllowed && // Would be auto-approved based on rules
      wouldBeAutoApproved
    );
    const isSandboxAutoApproved = isSandboxEnabled && toolSpecificData.commandLine.isSandboxWrapped === true && !requiresAllowNetworkConfirmation && this._allowSandboxAutoApprove;
    const isFinalAutoApproved = isSandboxAutoApproved || isAutoApprovedByRules || commandLineAnalyzerResults.some((e) => e.forceAutoApproval);
    if (isFinalAutoApproved || isAutoApproveEnabled && commandLineAnalyzerResults.some((e) => e.autoApproveInfo)) {
      toolSpecificData.autoApproveInfo = commandLineAnalyzerResults.find((e) => e.autoApproveInfo)?.autoApproveInfo;
    }
    const commandToDisplay = (toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original).trimStart();
    const extractedCd = extractCdPrefix(commandToDisplay, shell, os);
    let confirmationTitle;
    if (extractedCd && cwd) {
      const isAbsolutePath = os === OperatingSystem.Windows ? win32.isAbsolute(extractedCd.directory) : posix.isAbsolute(extractedCd.directory);
      const directoryUri = isAbsolutePath ? URI.from({ scheme: cwd.scheme, authority: cwd.authority, path: extractedCd.directory }) : URI.joinPath(cwd, extractedCd.directory);
      const directoryLabel = this._labelService.getUriLabel(directoryUri);
      const cdPrefix = commandToDisplay.substring(0, commandToDisplay.length - extractedCd.command.length);
      toolSpecificData.confirmation = {
        commandLine: extractedCd.command,
        cwdLabel: directoryLabel,
        cdPrefix
      };
      confirmationTitle = localize("runInTerminal.inDirectory", "Run `{0}` command within `{1}`?", shellType, directoryLabel);
    } else {
      toolSpecificData.confirmation = {
        commandLine: commandToDisplay
      };
      confirmationTitle = localize("runInTerminal", "Run `{0}` command?", shellType);
    }
    const commandForPresenter = extractedCd?.command ?? commandToDisplay;
    let presenterInput = commandForPresenter;
    for (const presenter of this._commandLinePresenters) {
      const presenterResult = await presenter.present({ commandLine: { original: args.command, forDisplay: presenterInput }, shell, os });
      if (presenterResult) {
        toolSpecificData.presentationOverrides = {
          commandLine: presenterResult.commandLine,
          language: presenterResult.language ?? void 0
        };
        if (extractedCd && toolSpecificData.confirmation?.cwdLabel) {
          if (presenterResult.languageDisplayName) {
            confirmationTitle = localize("runInTerminal.presentationOverride.inDirectory", "Run `{0}` command in `{1}` within `{2}`?", presenterResult.languageDisplayName, shellType, toolSpecificData.confirmation.cwdLabel);
          } else {
            confirmationTitle = localize("runInTerminal.presentationOverride.inDirectory.withoutLanguage", "Run command in `{0}` within `{1}`?", shellType, toolSpecificData.confirmation.cwdLabel);
          }
        } else {
          if (presenterResult.languageDisplayName) {
            confirmationTitle = localize("runInTerminal.presentationOverride", "Run `{0}` command in `{1}`?", presenterResult.languageDisplayName, shellType);
          } else {
            confirmationTitle = localize("runInTerminal.presentationOverride.withoutLanguage", "Run command in `{0}`?", shellType);
          }
        }
        if (!presenterResult.processOtherPresenters) {
          break;
        }
        presenterInput = presenterResult.commandLine;
      }
    }
    if (requiresUnsandboxConfirmation) {
      confirmationTitle = blockedDomains?.length ? localize("runInTerminal.unsandboxed.domain", "Run `{0}` command outside the [sandbox]({1}) to access {2}?", shellType, TERMINAL_SANDBOX_DOCUMENTATION_URL, this._formatBlockedDomainsForTitle(blockedDomains)) : localize("runInTerminal.unsandboxed", "Run `{0}` command outside the [sandbox]({1})?", shellType, TERMINAL_SANDBOX_DOCUMENTATION_URL);
    } else if (requiresAllowNetworkConfirmation) {
      confirmationTitle = localize("runInTerminal.allowNetwork", "Allow {0} command to access the network?", shellType);
    }
    const shouldShowConfirmation = !isFinalAutoApproved && (!isSessionAutoApproved || requiresAllowNetworkConfirmation) || context.forceConfirmationReason !== void 0;
    const explanation = args.explanation || localize("runInTerminal.defaultExplanation", "No explanation provided");
    const goal = args.goal || localize("runInTerminal.defaultGoal", "No goal provided");
    const confirmationMessage = requiresUnsandboxConfirmation ? new MarkdownString(localize(
      "runInTerminal.unsandboxed.confirmationMessage",
      "Explanation: {0}\n\nGoal: {1}\n\nReason for leaving the sandbox: {2}",
      explanation,
      goal,
      requestUnsandboxedExecutionReason || localize("runInTerminal.unsandboxed.confirmationMessage.defaultReason", "The model indicated that this command needs unsandboxed access.")
    )) : requiresAllowNetworkConfirmation ? new MarkdownString(localize(
      "runInTerminal.allowNetwork.confirmationMessage",
      "Explanation: {0}\n\nGoal: {1}\n\nReason for allowing unrestricted network access in the sandbox: {2}",
      explanation,
      goal,
      requestAllowNetworkReason || localize("runInTerminal.allowNetwork.confirmationMessage.defaultReason", "The model indicated that this sandboxed command needs unrestricted network access.")
    )) : new MarkdownString(localize("runInTerminal.confirmationMessage", "Explanation: {0}\n\nGoal: {1}", explanation, goal));
    const confirmationMessages = shouldShowConfirmation ? {
      title: confirmationTitle,
      message: confirmationMessage,
      disclaimer,
      allowAutoConfirm: void 0,
      terminalCustomActions: customActions
    } : void 0;
    const rawDisplayCommand = toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original;
    const displayCommand = rawDisplayCommand.length > 80 ? rawDisplayCommand.substring(0, 77) + "..." : rawDisplayCommand;
    const invocationMessage = toolSpecificData.commandLine.isSandboxWrapped ? new MarkdownString(localize("runInTerminal.invocation.sandbox", "Running `{0}` in sandbox", escapeMarkdownSyntaxTokens(displayCommand))) : new MarkdownString(localize("runInTerminal.invocation", "Running `{0}`", escapeMarkdownSyntaxTokens(displayCommand)));
    return {
      invocationMessage,
      icon: toolSpecificData.commandLine.isSandboxWrapped ? Codicon.terminalSecure : Codicon.terminal,
      confirmationMessages: sandboxPrerequisiteConfirmation ?? confirmationMessages,
      toolSpecificData
    };
  }
  _formatBlockedDomainsForTitle(blockedDomains) {
    if (blockedDomains.length === 1) {
      return `\`${blockedDomains[0]}\``;
    }
    return localize("runInTerminal.unsandboxed.domain.summary", "`{0}` and {1} more domains", blockedDomains[0], blockedDomains.length - 1);
  }
  _getBlockedDomainReason(blockedDomains, deniedDomains = []) {
    if (deniedDomains.length === blockedDomains.length && deniedDomains.length > 0) {
      if (blockedDomains.length === 1) {
        return localize("runInTerminal.unsandboxed.domain.reason.denied.single", "This command accesses {0}, which is blocked by chat.agent.deniedNetworkDomains.", blockedDomains[0]);
      }
      return localize("runInTerminal.unsandboxed.domain.reason.denied.multi", "This command accesses {0} and {1} more domains that are blocked by chat.agent.deniedNetworkDomains.", blockedDomains[0], blockedDomains.length - 1);
    }
    if (deniedDomains.length > 0) {
      if (blockedDomains.length === 1) {
        return localize("runInTerminal.unsandboxed.domain.reason.mixed.single", "This command accesses {0}, which is blocked by chat.agent.deniedNetworkDomains or not added to chat.agent.allowedNetworkDomains.", blockedDomains[0]);
      }
      return localize("runInTerminal.unsandboxed.domain.reason.mixed.multi", "This command accesses {0} and {1} more domains that are blocked by chat.agent.deniedNetworkDomains or not added to chat.agent.allowedNetworkDomains.", blockedDomains[0], blockedDomains.length - 1);
    }
    if (blockedDomains.length === 1) {
      return localize("runInTerminal.unsandboxed.domain.reason.single", "This command accesses {0}, which is not permitted by the current chat.agent.sandbox configuration.", blockedDomains[0]);
    }
    return localize("runInTerminal.unsandboxed.domain.reason.multi", "This command accesses {0} and {1} more domains that are not permitted by the current chat.agent.sandbox configuration.", blockedDomains[0], blockedDomains.length - 1);
  }
  async _rewriteCommandLine(commandLine, options) {
    let rewrittenCommand = commandLine;
    let forDisplayCommand = void 0;
    let isSandboxWrapped = false;
    let requiresUnsandboxConfirmation = options.requestUnsandboxedExecution;
    let requestUnsandboxedExecutionReason = options.requestUnsandboxedExecution ? options.requestUnsandboxedExecutionReason : void 0;
    let requiresAllowNetworkConfirmation = false;
    let requestAllowNetworkReason = options.requestAllowNetwork ? options.requestAllowNetworkReason : void 0;
    let blockedDomains;
    for (const rewriter of this._commandLineRewriters) {
      const rewriteResult = await rewriter.rewrite({
        commandLine: rewrittenCommand,
        cwd: options.cwd,
        shell: options.shell,
        os: options.os,
        isBackground: options.isBackground,
        requestUnsandboxedExecution: requiresUnsandboxConfirmation,
        requestAllowNetwork: options.requestAllowNetwork,
        sandboxPrecheckInputs: options.sandboxPrecheckInputs
      });
      if (rewriteResult) {
        rewrittenCommand = rewriteResult.rewritten;
        forDisplayCommand = forDisplayCommand ?? rewriteResult.forDisplay;
        if (rewriteResult.isSandboxWrapped) {
          isSandboxWrapped = true;
        } else if (rewriteResult.isSandboxWrapped === false) {
          isSandboxWrapped = false;
        }
        if (rewriteResult.requiresUnsandboxConfirmation) {
          requiresUnsandboxConfirmation = true;
        }
        if (rewriteResult.requiresAllowNetworkConfirmation) {
          requiresAllowNetworkConfirmation = true;
        }
        if (rewriteResult.blockedDomains?.length) {
          blockedDomains = rewriteResult.blockedDomains;
          const blockedDomainReason = this._getBlockedDomainReason(rewriteResult.blockedDomains, rewriteResult.deniedDomains);
          if (rewriteResult.requiresAllowNetworkConfirmation) {
            requestAllowNetworkReason = blockedDomainReason;
          } else {
            requestUnsandboxedExecutionReason = blockedDomainReason;
          }
        }
        this._logService.info(`RunInTerminalTool: Command rewritten by ${rewriter.constructor.name}: ${rewriteResult.reasoning}`);
      }
    }
    return {
      rewrittenCommand,
      forDisplayCommand,
      isSandboxWrapped,
      requiresUnsandboxConfirmation,
      requestUnsandboxedExecutionReason,
      requiresAllowNetworkConfirmation,
      requestAllowNetworkReason: requiresAllowNetworkConfirmation ? requestAllowNetworkReason : void 0,
      blockedDomains
    };
  }
  _getSandboxPrecheckInputs(chatSessionResource, chatRequestId) {
    return getSandboxPrecheckInputsForToolInvocation(chatSessionResource, chatRequestId, this._chatWidgetService, this._chatService);
  }
  async _confirmAutomaticSandboxRetry(retryKind, sessionResource, command, shell, blockedDomains, riskAssessment, token) {
    const chatModel = sessionResource && this._chatService.getSession(sessionResource);
    if (!(chatModel instanceof ChatModel)) {
      return false;
    }
    if (sessionResource && isSessionAutoApproveLevel(sessionResource, this._configurationService, this._chatWidgetService, this._chatService)) {
      return true;
    }
    const request = chatModel.getRequests().at(-1);
    if (!request) {
      return false;
    }
    let shellType = basename(shell, ".exe");
    if (shellType === "powershell") {
      shellType = "pwsh";
    }
    const store = new DisposableStore();
    return new Promise((resolve) => {
      let resolved = false;
      const resolveOnce = (value) => {
        if (resolved) {
          return;
        }
        resolved = true;
        store.dispose();
        resolve(value);
      };
      const confirmationMessage = retryKind === "allowNetwork" ? new MarkdownString(localize(
        "runInTerminal.allowNetwork.autoRetry.confirmationMessage",
        "`{0}`",
        escapeMarkdownSyntaxTokens(buildCommandDisplayText(command))
      )) : new MarkdownString(localize(
        "runInTerminal.unsandboxed.autoRetry.confirmationMessage",
        "`{0}`",
        escapeMarkdownSyntaxTokens(buildCommandDisplayText(command))
      ));
      const part = new ChatElicitationRequestPart(
        this._getAutomaticSandboxRetryTitle(retryKind, shellType, blockedDomains),
        confirmationMessage,
        "",
        localize("allow", "Allow"),
        localize("skip", "Skip"),
        async () => {
          resolveOnce(true);
          part.hide();
          return ElicitationState.Accepted;
        },
        async () => {
          resolveOnce(false);
          part.hide();
          return ElicitationState.Rejected;
        },
        void 0,
        void 0,
        () => resolveOnce(false),
        riskAssessment
      );
      chatModel.acceptResponseProgress(request, part);
      store.add(token.onCancellationRequested(() => resolveOnce(false)));
      store.add({ dispose: () => part.hide() });
    });
  }
  _getAutomaticSandboxRetryTitle(retryKind, shellType, blockedDomains) {
    if (retryKind === "allowNetwork") {
      return blockedDomains?.length ? new MarkdownString(localize("runInTerminal.allowNetwork.autoRetry.domain", "Retry `{0}` command in the sandbox by allowing network access to {1}?", shellType, this._formatBlockedDomainsForTitle(blockedDomains))) : new MarkdownString(localize("runInTerminal.allowNetwork.autoRetry", "Retry `{0}` command in the sandbox by allowing network access?", shellType));
    }
    return blockedDomains?.length ? new MarkdownString(localize("runInTerminal.unsandboxed.autoRetry.domain", "Run `{0}` command outside the sandbox to access {1}?", shellType, this._formatBlockedDomainsForTitle(blockedDomains))) : new MarkdownString(localize("runInTerminal.unsandboxed.autoRetry", "Run `{0}` command outside the sandbox?", shellType));
  }
  /**
   * Surface a confirmation dialog when the terminal is detected to be waiting
   * for sensitive input (password, passphrase, OTP, …). Sensitive prompts must
   * never be routed through the model — the user types the secret directly
   * into the terminal. The "Focus terminal" action reveals and focuses the
   * terminal; the "Cancel" action cancels the running command.
   *
   * Returns a disposable that hides any pending elicitation. The handler
   * itself dedupes concurrent elicitations so repeated polling cycles don't
   * spam the chat session.
   */
  _registerSensitiveInputElicitation(chatSessionResource, terminalInstance, outputMonitor, cancelExecution, onAutoCancelled) {
    const store = new DisposableStore();
    let pending;
    let autoCancelled = false;
    store.add(outputMonitor.onDidDetectSensitiveInputNeeded(() => {
      if (pending || autoCancelled) {
        return;
      }
      const isAutoApproved = chatSessionResource && isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);
      const chatModel = chatSessionResource && this._chatService.getSession(chatSessionResource);
      if (isAutoApproved) {
        autoCancelled = true;
        if (chatModel instanceof ChatModel) {
          const request2 = chatModel.getRequests().at(-1);
          if (request2) {
            const infoPart = new ChatElicitationRequestPart(
              new MarkdownString(localize("runInTerminal.sensitiveInput.autoCancelTitle", "Terminal command cancelled \u2014 sensitive input required")),
              new MarkdownString(localize("runInTerminal.sensitiveInput.autoCancelMessage", "The terminal command was prompting for a password or other secret. Auto-approve / autopilot mode cannot safely supply secrets, so the command was cancelled. Run the command interactively if you want to provide the secret.")),
              "",
              localize("runInTerminal.sensitiveInput.dismiss", "Dismiss"),
              "",
              async () => {
                infoPart.hide();
                return ElicitationState.Accepted;
              },
              async () => {
                infoPart.hide();
                return ElicitationState.Rejected;
              },
              void 0,
              void 0,
              void 0,
              void 0
            );
            chatModel.acceptResponseProgress(request2, infoPart);
          }
        }
        onAutoCancelled?.();
        cancelExecution();
        return;
      }
      if (!(chatModel instanceof ChatModel)) {
        this._terminalService.setActiveInstance(terminalInstance);
        this._terminalService.revealTerminal(terminalInstance, true).catch(() => {
        });
        terminalInstance.focus();
        return;
      }
      const request = chatModel.getRequests().at(-1);
      if (!request) {
        return;
      }
      const part = new ChatElicitationRequestPart(
        new MarkdownString(localize("runInTerminal.sensitiveInput.title", "Terminal is waiting for sensitive input")),
        new MarkdownString(localize("runInTerminal.sensitiveInput.message", "The terminal command appears to be prompting for a password or other sensitive value. Focus the terminal to type it directly \u2014 secrets must not be sent through chat.")),
        "",
        localize("runInTerminal.sensitiveInput.focus", "Focus Terminal"),
        localize("runInTerminal.sensitiveInput.cancel", "Cancel Command"),
        async () => {
          pending = void 0;
          part.hide();
          try {
            this._terminalService.setActiveInstance(terminalInstance);
            await this._terminalService.revealTerminal(terminalInstance, true);
            terminalInstance.focus();
          } catch (err) {
            this._logService.warn(`RunInTerminalTool: failed to reveal terminal for sensitive input`, err);
          }
          return ElicitationState.Accepted;
        },
        async () => {
          pending = void 0;
          part.hide();
          cancelExecution();
          return ElicitationState.Rejected;
        },
        void 0,
        void 0,
        () => {
          pending = void 0;
        },
        void 0
      );
      pending = part;
      chatModel.acceptResponseProgress(request, part);
    }));
    return store;
  }
  _acceptAutomaticSandboxRetryToolInvocationUpdate(retryKind, sessionResource, toolCallId, toolSpecificData, isComplete, toolResultMessage) {
    const chatModel = sessionResource && this._chatService.getSession(sessionResource);
    if (!(chatModel instanceof ChatModel)) {
      return;
    }
    const request = chatModel.getRequests().at(-1);
    if (!request) {
      return;
    }
    const displayCommand = buildCommandDisplayText(toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original);
    const progress = {
      kind: "externalToolInvocationUpdate",
      toolCallId,
      toolName: localize("runInTerminalTool.displayName", "Run in Terminal"),
      isComplete,
      invocationMessage: retryKind === "allowNetwork" ? new MarkdownString(localize("runInTerminal.allowNetwork.autoRetry.invocation", "Running `{0}` in the sandbox with unrestricted network access", escapeMarkdownSyntaxTokens(displayCommand))) : new MarkdownString(localize("runInTerminal.unsandboxed.autoRetry.invocation", "Running `{0}` outside the sandbox", escapeMarkdownSyntaxTokens(displayCommand))),
      pastTenseMessage: toolResultMessage,
      toolSpecificData
    };
    chatModel.acceptResponseProgress(request, progress);
  }
  async _runAutomaticSandboxRetry(options) {
    const requestAllowNetwork = options.retryKind === "allowNetwork";
    const requestUnsandboxedExecution = options.retryKind === "unsandboxed" && options.allowUnsandboxedCommands;
    const [os, shell] = await Promise.all([
      this._osBackend,
      this._profileFetcher.getCopilotShell()
    ]);
    const retryRewriteResult = await this._rewriteCommandLine(options.args.command, {
      cwd: options.toolSpecificData.cwd ? URI.revive(options.toolSpecificData.cwd) : void 0,
      shell,
      os,
      isBackground: options.isBackground,
      requestUnsandboxedExecution,
      requestUnsandboxedExecutionReason: requestUnsandboxedExecution ? options.retryReason : void 0,
      requestAllowNetwork,
      requestAllowNetworkReason: requestAllowNetwork ? options.retryReason : void 0
    });
    const rewrittenRetryReason = (requestAllowNetwork ? retryRewriteResult.requestAllowNetworkReason : retryRewriteResult.requestUnsandboxedExecutionReason) ?? options.retryReason;
    const retryParameters = {
      ...options.args,
      command: options.args.command,
      allowToRunUnsandboxedCommands: options.allowUnsandboxedCommands,
      requestUnsandboxedExecution,
      requestUnsandboxedExecutionReason: requestUnsandboxedExecution ? rewrittenRetryReason : void 0,
      requestAllowNetwork,
      requestAllowNetworkReason: requestAllowNetwork ? rewrittenRetryReason : void 0
    };
    const retryRiskAssessment = {
      toolId: TerminalToolId.RunInTerminal,
      parameters: {
        ...retryParameters,
        command: retryRewriteResult.rewrittenCommand
      }
    };
    const retryConfirmationCommand = options.toolSpecificData.presentationOverrides?.commandLine ?? options.command;
    const shouldRetry = await this._confirmAutomaticSandboxRetry(options.retryKind, options.invocation.context?.sessionResource, retryConfirmationCommand, shell, retryRewriteResult.blockedDomains, retryRiskAssessment, options.token);
    if (!shouldRetry) {
      return void 0;
    }
    const retryToolSpecificData = {
      ...options.toolSpecificData,
      terminalCommandId: `tool-${generateUuid()}`,
      commandLine: {
        original: options.args.command,
        toolEdited: retryRewriteResult.rewrittenCommand === options.args.command ? void 0 : retryRewriteResult.rewrittenCommand,
        forDisplay: retryRewriteResult.forDisplayCommand ?? normalizeTerminalCommandForDisplay(retryRewriteResult.rewrittenCommand ?? options.args.command),
        isSandboxWrapped: retryRewriteResult.isSandboxWrapped
      },
      requestUnsandboxedExecution: requestUnsandboxedExecution || (requestAllowNetwork ? false : void 0),
      requestUnsandboxedExecutionReason: requestUnsandboxedExecution ? rewrittenRetryReason : void 0,
      requestAllowNetwork: requestAllowNetwork || void 0,
      requestAllowNetworkReason: requestAllowNetwork ? rewrittenRetryReason : void 0,
      terminalCommandUri: void 0,
      terminalCommandOutput: void 0,
      terminalTheme: void 0,
      terminalCommandState: void 0,
      didContinueInBackground: void 0
    };
    const retryToolCallId = `automatic-${options.retryKind === "allowNetwork" ? "allow-network" : "unsandbox"}-retry-${generateUuid()}`;
    this._acceptAutomaticSandboxRetryToolInvocationUpdate(options.retryKind, options.invocation.context?.sessionResource, retryToolCallId, retryToolSpecificData, false);
    return await this.invoke({
      ...options.invocation,
      parameters: retryParameters,
      toolSpecificData: retryToolSpecificData
    }, options.countTokens, options.progress, options.token);
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const toolSpecificData = invocation.toolSpecificData;
    if (!toolSpecificData) {
      throw new Error("toolSpecificData must be provided for this tool");
    }
    if (!invocation.context) {
      throw new Error("Invocation context must be provided for this tool");
    }
    const commandId = toolSpecificData.terminalCommandId;
    if (toolSpecificData.alternativeRecommendation) {
      return {
        content: [{
          kind: "text",
          value: toolSpecificData.alternativeRecommendation
        }]
      };
    }
    const args = invocation.parameters;
    const allowUnsandboxedCommands = this._getAllowToRunUnsandboxedCommands(args);
    const sandboxPrecheckInputs = this._getSandboxPrecheckInputs(invocation.context.sessionResource, invocation.chatRequestId);
    const isSandboxEnabled = await this._terminalSandboxService.isEnabled(sandboxPrecheckInputs);
    if (this._shouldRejectUnsandboxedExecutionRequest(isSandboxEnabled, allowUnsandboxedCommands, args)) {
      const message = this._getUnsandboxedExecutionDisabledMessage();
      return {
        toolResultError: message,
        toolResultDetails: {
          input: args.command,
          output: [{ type: "embed", isText: true, value: message }],
          isError: true
        },
        content: [{
          kind: "text",
          value: message
        }]
      };
    }
    const sandboxPrerequisiteTerminalOptions = {
      createTerminal: async () => this._terminalService.createTerminal({}),
      focusTerminal: async (terminal) => {
        this._terminalService.setActiveInstance(terminal);
        await this._terminalService.revealTerminal(terminal, true);
        terminal.focus();
      }
    };
    if (toolSpecificData.sandboxPrerequisiteFailure) {
      return {
        content: [{ kind: "text", value: toolSpecificData.sandboxPrerequisiteFailure }]
      };
    }
    const isSandboxAllowNetworkEnabled = isSandboxEnabled && await this._terminalSandboxService.isSandboxAllowNetworkEnabled();
    if (this._shouldRejectAllowNetworkRequest(isSandboxEnabled, isSandboxAllowNetworkEnabled, args)) {
      const message = this._getAllowNetworkRequestDisabledMessage();
      return {
        toolResultError: message,
        toolResultDetails: {
          input: args.command,
          output: [{ type: "embed", isText: true, value: message }],
          isError: true
        },
        content: [{
          kind: "text",
          value: message
        }]
      };
    }
    if (toolSpecificData.missingSandboxDependencies?.length) {
      if (invocation.selectedCustomButton === "install") {
        const sessionResource = invocation.context.sessionResource;
        const { exitCode: exitCode2 } = await this._terminalSandboxService.installMissingSandboxDependencies(toolSpecificData.missingSandboxDependencies, sessionResource, token, sandboxPrerequisiteTerminalOptions);
        if (exitCode2 !== void 0 && exitCode2 !== 0) {
          return {
            content: [{
              kind: "text",
              value: localize(
                "runInTerminal.missingDeps.failed",
                "Sandbox dependency installation failed (exit code {0}). The command was not executed.",
                exitCode2
              )
            }]
          };
        }
        if (exitCode2 === void 0) {
          return {
            content: [{
              kind: "text",
              value: localize(
                "runInTerminal.missingDeps.unknown",
                "Could not determine whether sandbox dependency installation succeeded. The command was not executed."
              )
            }]
          };
        }
        const refreshedPrereqs = await this._terminalSandboxService.checkForSandboxingPrereqs(true, sandboxPrecheckInputs);
        if (refreshedPrereqs.failedCheck !== void 0) {
          return {
            content: [{
              kind: "text",
              value: refreshedPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap && refreshedPrereqs.remediations?.length ? localize("runInTerminal.missingDeps.bubblewrapFailed", "Sandbox dependencies were installed, but bubblewrap cannot create the required sandbox namespace. Run the command again to choose an available repair option.") : refreshedPrereqs.failedCheck === TerminalSandboxPrerequisiteCheck.Bubblewrap ? localize("runInTerminal.missingDeps.bubblewrapFailedNoRepair", "Sandbox dependencies were installed, but bubblewrap cannot create the required sandbox namespace on this system. The command was not executed.") : localize("runInTerminal.missingDeps.recheckFailed", "Sandbox prerequisites are still not satisfied after installation. The command was not executed.")
            }]
          };
        }
        this._logService.info("RunInTerminalTool: Sandbox dependency installation succeeded");
        return {
          content: [{
            kind: "text",
            value: localize(
              "runInTerminal.missingDeps.installed",
              "Sandbox dependencies were installed successfully. If the issue persists, reload the window and try running the command again."
            )
          }]
        };
      } else {
        this._logService.info("RunInTerminalTool: User cancelled sandbox dependency installation");
        return {
          content: [{
            kind: "text",
            value: localize(
              "runInTerminal.missingDeps.cancelled",
              "Sandbox dependency installation was cancelled by the user."
            )
          }]
        };
      }
    }
    if (toolSpecificData.sandboxRemediations?.length) {
      const selectedRemediation = toolSpecificData.sandboxRemediations[0];
      const { exitCode: exitCode2 } = await this._terminalSandboxService.runSandboxRemediation(selectedRemediation, invocation.context.sessionResource, token, sandboxPrerequisiteTerminalOptions);
      if (exitCode2 !== 0) {
        return this._getBubblewrapUnsupportedResult();
      }
      const refreshedPrereqs = await this._terminalSandboxService.checkForSandboxingPrereqs(true, sandboxPrecheckInputs);
      if (refreshedPrereqs.failedCheck !== void 0) {
        return this._getBubblewrapUnsupportedResult();
      }
      this._logService.info("RunInTerminalTool: Bubblewrap remediation and capability recheck succeeded, proceeding with command execution");
    }
    const executionOptions = this._resolveExecutionOptions(args);
    this._logService.debug(`RunInTerminalTool: Invoking with options ${JSON.stringify(args)}`);
    let toolResultMessage;
    if (args.timeout !== void 0 && (Number.isNaN(args.timeout) || args.timeout < 0)) {
      return {
        content: [{
          kind: "text",
          value: "Error: timeout must be a non-negative number of milliseconds (use 0 for no timeout)."
        }]
      };
    }
    if (executionOptions.mode === "sync" && args.timeout === void 0) {
      args.timeout = 0;
    }
    const chatSessionResource = invocation.context.sessionResource;
    const shouldSendNotifications = !invocation.subAgentInvocationId;
    const command = toolSpecificData.commandLine.userEdited ?? toolSpecificData.commandLine.toolEdited ?? toolSpecificData.commandLine.original;
    const didUserEditCommand = toolSpecificData.commandLine.userEdited !== void 0 && toolSpecificData.commandLine.userEdited !== toolSpecificData.commandLine.original;
    const didToolEditCommand = !didUserEditCommand && toolSpecificData.commandLine.toolEdited !== void 0 && toolSpecificData.commandLine.toolEdited !== toolSpecificData.commandLine.original && // Only consider it a meaningful edit if the display form also differs from the
    // original. Cosmetic rewrites like prepending a space to prevent shell history
    // should not trigger the "tool simplified the command" note.
    normalizeTerminalCommandForDisplay(toolSpecificData.commandLine.toolEdited).trim() !== normalizeTerminalCommandForDisplay(toolSpecificData.commandLine.original).trim();
    const didSandboxWrapCommand = toolSpecificData.commandLine.isSandboxWrapped === true;
    const commandLineForMetadata = isSandboxEnabled ? toolSpecificData.commandLine.forDisplay ?? toolSpecificData.commandLine.original : void 0;
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (didSandboxWrapCommand) {
      const deniedAccess = await this._getDeniedSandboxFileAccess(args.requestFileValidationCheck, sandboxPrecheckInputs);
      if (deniedAccess.length > 0) {
        const message = this._buildSandboxFileAccessDeniedMessage(deniedAccess);
        return {
          toolResultError: message,
          toolResultDetails: {
            input: args.command,
            output: [{ type: "embed", isText: true, value: message }],
            isError: true
          },
          content: [{
            kind: "text",
            value: message
          }]
        };
      }
    }
    let error;
    const automaticUnsandboxRetryReason = localize("runInTerminal.unsandboxed.autoRetry.reason", "The sandboxed execution output indicated the sandbox blocked the command.");
    const automaticAllowNetworkRetryReason = localize("runInTerminal.allowNetwork.autoRetry.reason", "The sandboxed execution output indicated the sandbox blocked required network access.");
    const isNewSession = !executionOptions.persistentSession && !this._sessionTerminalAssociations.has(chatSessionResource);
    const timingStart = Date.now();
    const termId = generateUuid();
    const terminalToolSessionId = toolSpecificData.terminalToolSessionId;
    const store = new DisposableStore();
    this._logService.debug(`RunInTerminalTool: Creating ${executionOptions.persistentSession ? "background" : "foreground"} terminal. termId=${termId}, chatSessionResource=${chatSessionResource}`);
    const toolTerminal = await this._initTerminal(chatSessionResource, termId, terminalToolSessionId, executionOptions.persistentSession, token);
    this._handleTerminalVisibility(toolTerminal, chatSessionResource);
    const timingConnectMs = Date.now() - timingStart;
    const xterm = await toolTerminal.instance.xtermReadyPromise;
    if (!xterm) {
      throw new Error("Instance was disposed before xterm.js was ready");
    }
    const commandDetection = toolTerminal.instance.capabilities.get(TerminalCapability.CommandDetection);
    let inputUserChars = 0;
    let inputUserSigint = false;
    store.add(xterm.raw.onData((data) => {
      if (!telemetryIgnoredSequences.includes(data)) {
        inputUserChars += data.length;
      }
      inputUserSigint ||= data === "";
    }));
    let terminalResult = "";
    let outputLineCount = -1;
    let exitCode;
    let altBufferResult;
    let didTimeout = false;
    let didIdleSilence = false;
    let didInputNeeded = false;
    let didSensitiveAutoCancelled = false;
    let isBackgroundExecution = executionOptions.persistentSession;
    let timeoutPromise;
    let timeoutRacePromise;
    let outputMonitor;
    let pollingResult;
    const executeCancellation = store.add(new CancellationTokenSource(token));
    const timeoutValue = args.timeout !== void 0 ? clamp(args.timeout, 0, Number.MAX_SAFE_INTEGER) : void 0;
    if (timeoutValue !== void 0 && timeoutValue > 0) {
      const shouldEnforceTimeout = executionOptions.waitStrategy === "idle" || this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnforceTimeoutFromModel) === true;
      if (shouldEnforceTimeout) {
        timeoutPromise = timeout(timeoutValue);
        timeoutRacePromise = timeoutPromise.then(
          () => ({ type: "timeout" })
        ).catch(() => ({ type: "timeout" }));
      }
    }
    let continueInBackgroundResolve;
    const continueInBackgroundPromise = new Promise((resolve) => {
      continueInBackgroundResolve = resolve;
    });
    if (terminalToolSessionId) {
      store.add(this._terminalChatService.onDidContinueInBackground((sessionId) => {
        if (sessionId === terminalToolSessionId) {
          const execution = RunInTerminalTool._activeExecutions.get(termId);
          execution?.setBackground?.();
          isBackgroundExecution = true;
          continueInBackgroundResolve?.();
        }
      }));
    }
    let executionPromise;
    try {
      const execution = this._instantiationService.createInstance(
        ActiveTerminalExecution,
        chatSessionResource,
        termId,
        toolTerminal,
        commandDetection,
        executionOptions.persistentSession
      );
      this._logService.info(`RunInTerminalTool: Using \`${execution.strategy.type}\` execute strategy for command \`${command}\``);
      store.add(execution);
      this._setActiveExecution(termId, execution);
      const startMarkerPromise = Event.toPromise(execution.strategy.onDidCreateStartMarker);
      const outputMonitorPollFn = executionOptions.persistentSession ? async (executionForPoll) => ({
        output: executionForPoll.getOutput(),
        state: OutputMonitorState.Idle
      }) : void 0;
      store.add(execution.strategy.onDidCreateStartMarker((startMarker) => {
        if (!outputMonitor) {
          outputMonitor = this._instantiationService.createInstance(
            OutputMonitor,
            {
              instance: toolTerminal.instance,
              sessionResource: chatSessionResource,
              getOutput: (marker) => execution.getOutput(marker ?? startMarker)
            },
            outputMonitorPollFn,
            invocation.context,
            token,
            command
          );
        }
      }));
      executionPromise = execution.start(command, executeCancellation.token, commandId, commandLineForMetadata);
      if (executionOptions.waitStrategy === "idle") {
        this._logService.debug(`RunInTerminalTool: Starting persistent execution with idle wait strategy \`${command}\``);
        await startMarkerPromise;
        let idleTimedOut = false;
        if (outputMonitor) {
          if (timeoutRacePromise) {
            const idleRace = await Promise.race([
              Event.toPromise(outputMonitor.onDidFinishCommand).then(() => ({ type: "idle" })),
              timeoutRacePromise
            ]);
            if (idleRace.type === "timeout") {
              idleTimedOut = true;
              this._logService.debug(`RunInTerminalTool: Timeout reached waiting for idle signal, returning output collected so far`);
            } else {
              pollingResult = outputMonitor.pollingResult;
            }
          } else {
            await Event.toPromise(outputMonitor.onDidFinishCommand);
            pollingResult = outputMonitor.pollingResult;
          }
        }
        await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
        if (token.isCancellationRequested) {
          throw new CancellationError();
        }
        const state = toolSpecificData.terminalCommandState ?? {};
        state.timestamp = state.timestamp ?? timingStart;
        toolSpecificData.terminalCommandState = state;
        let resultText2 = didSandboxWrapCommand ? `Command is now running in terminal with ID=${termId}` : didUserEditCommand ? `Note: The user manually edited the command to \`${command}\`, and that command is now running in terminal with ID=${termId}` : didToolEditCommand ? `Note: The tool simplified the command to \`${command}\`, and that command is now running in terminal with ID=${termId}` : `Command is running in terminal with ID=${termId}`;
        const backgroundOutput = pollingResult?.output ?? (idleTimedOut ? execution.getOutput() : void 0);
        const outputAnalyzerMessage2 = backgroundOutput ? await this._getOutputAnalyzerMessage(void 0, backgroundOutput, command, didSandboxWrapCommand) : void 0;
        if (idleTimedOut) {
          resultText2 += `
 Timed out waiting for the command to become idle. The command is still running, with output:
`;
          if (outputAnalyzerMessage2) {
            resultText2 += `${outputAnalyzerMessage2}
`;
          }
          resultText2 += backgroundOutput ?? "";
        } else if (pollingResult && pollingResult.state === OutputMonitorState.Idle) {
          resultText2 += `
 The command became idle with output:
`;
          if (outputAnalyzerMessage2) {
            resultText2 += `${outputAnalyzerMessage2}
`;
          }
          resultText2 += pollingResult.output;
          resultText2 += `
${this._buildInputNeededSteeringText(chatSessionResource, termId, "none")}`;
        } else if (pollingResult) {
          resultText2 += `
 The command is still running, with output:
`;
          if (outputAnalyzerMessage2) {
            resultText2 += `${outputAnalyzerMessage2}
`;
          }
          resultText2 += pollingResult.output;
        }
        const endCwd2 = await toolTerminal.instance.getCwdResource();
        return {
          toolMetadata: {
            exitCode: void 0,
            id: termId,
            terminalId: toolTerminal.instance.instanceId,
            cwd: endCwd2?.toString()
          },
          content: [{
            kind: "text",
            value: resultText2
          }]
        };
      } else {
        const raceCleanup = new DisposableStore();
        startMarkerPromise.then(() => {
          if (outputMonitor && !raceCleanup.isDisposed) {
            raceCleanup.add(this._registerSensitiveInputElicitation(
              chatSessionResource,
              toolTerminal.instance,
              outputMonitor,
              () => executeCancellation.cancel(),
              () => {
                didSensitiveAutoCancelled = true;
              }
            ));
          }
        });
        const raceCandidates = [
          executionPromise.then((result) => ({ type: "completed", result })),
          continueInBackgroundPromise.then(() => ({ type: "background" })),
          new Promise((resolve) => {
            startMarkerPromise.then(() => {
              if (outputMonitor && !raceCleanup.isDisposed) {
                raceCleanup.add(outputMonitor.onDidDetectInputNeeded(() => resolve({ type: "inputNeeded" })));
              }
            });
          })
        ];
        if (timeoutRacePromise) {
          raceCandidates.push(timeoutRacePromise);
        }
        const idleSilenceMs = this._configurationService.getValue(TerminalChatAgentToolsSettingId.IdleSilenceTimeoutMs) ?? DEFAULT_IDLE_SILENCE_TIMEOUT_MS;
        if (idleSilenceMs > 0) {
          const idleSilenceDeferred = new DeferredPromise();
          const idleSilenceScheduler = raceCleanup.add(new RunOnceScheduler(() => idleSilenceDeferred.complete({ type: "idleSilence" }), idleSilenceMs));
          raceCleanup.add(toolTerminal.instance.onData(() => idleSilenceScheduler.schedule()));
          idleSilenceScheduler.schedule();
          raceCandidates.push(idleSilenceDeferred.p);
        }
        let raceResult;
        try {
          raceResult = await Promise.race(raceCandidates);
        } finally {
          raceCleanup.dispose();
        }
        if (raceResult.type === "inputNeeded") {
          this._logService.debug(`RunInTerminalTool: Output monitor detected input needed in foreground terminal, returning output to agent`);
          error = "inputNeeded";
          didInputNeeded = true;
          const idleOutput = execution.getOutput();
          outputLineCount = idleOutput ? count(idleOutput.trim(), "\n") + 1 : 0;
          terminalResult = idleOutput ?? "";
        } else if (raceResult.type === "background") {
          this._logService.debug(`RunInTerminalTool: Continue in background triggered, returning output collected so far`);
          error = "continueInBackground";
          const backgroundOutput = execution.getOutput();
          outputLineCount = backgroundOutput ? count(backgroundOutput.trim(), "\n") + 1 : 0;
          terminalResult = backgroundOutput;
        } else if (raceResult.type === "timeout") {
          this._logService.debug(`RunInTerminalTool: Timeout reached, returning output collected so far`);
          error = "timeout";
          didTimeout = true;
          isBackgroundExecution = true;
          toolTerminal.isBackground = true;
          toolSpecificData.didContinueInBackground = true;
          this._sessionTerminalAssociations.delete(chatSessionResource);
          await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, true);
          const timeoutOutput = execution.getOutput();
          outputLineCount = timeoutOutput ? count(timeoutOutput.trim(), "\n") + 1 : 0;
          terminalResult = timeoutOutput ?? "";
        } else if (raceResult.type === "idleSilence") {
          this._logService.debug(`RunInTerminalTool: Idle silence reached (${idleSilenceMs}ms), promoting to background`);
          error = "idleSilence";
          didIdleSilence = true;
          isBackgroundExecution = true;
          toolTerminal.isBackground = true;
          toolSpecificData.didContinueInBackground = true;
          this._sessionTerminalAssociations.delete(chatSessionResource);
          await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, true);
          const idleSilenceOutput = execution.getOutput();
          outputLineCount = idleSilenceOutput ? count(idleSilenceOutput.trim(), "\n") + 1 : 0;
          terminalResult = idleSilenceOutput ?? "";
        } else {
          const executeResult = raceResult.result;
          toolTerminal.receivedUserInput = false;
          if (token.isCancellationRequested) {
            throw new CancellationError();
          }
          if (executeResult.didEnterAltBuffer) {
            const state = toolSpecificData.terminalCommandState ?? {};
            state.timestamp = state.timestamp ?? timingStart;
            toolSpecificData.terminalCommandState = state;
            toolResultMessage = altBufferMessage;
            outputLineCount = 0;
            error = executeResult.error ?? "alternateBuffer";
            const altBufferCwd = await toolTerminal.instance.getCwdResource();
            altBufferResult = {
              toolResultMessage,
              toolMetadata: {
                exitCode: void 0,
                id: termId,
                terminalId: toolTerminal.instance.instanceId,
                cwd: altBufferCwd?.toString()
              },
              content: [{
                kind: "text",
                value: altBufferMessage
              }]
            };
          } else {
            await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
            {
              const state = toolSpecificData.terminalCommandState ?? {};
              state.timestamp = state.timestamp ?? timingStart;
              if (executeResult.exitCode !== void 0) {
                state.exitCode = executeResult.exitCode;
                if (state.timestamp !== void 0) {
                  state.duration = state.duration ?? Math.max(0, Date.now() - state.timestamp);
                }
              }
              toolSpecificData.terminalCommandState = state;
            }
            this._logService.info(`RunInTerminalTool: Finished \`${execution.strategy.type}\` execute strategy with exitCode \`${executeResult.exitCode}\`, result.length \`${executeResult.output?.length}\`, error \`${executeResult.error}\``);
            outputLineCount = executeResult.output === void 0 ? 0 : count(executeResult.output.trim(), "\n") + 1;
            exitCode = executeResult.exitCode;
            error = executeResult.error;
            const resultArr = [];
            if (executeResult.output !== void 0) {
              resultArr.push(executeResult.output);
            }
            if (executeResult.additionalInformation) {
              resultArr.push(executeResult.additionalInformation);
            }
            terminalResult = resultArr.join("\n\n");
          }
        }
      }
    } catch (e) {
      if (didTimeout && e instanceof CancellationError) {
        this._logService.debug(`RunInTerminalTool: Timeout reached, returning output collected so far`);
        error = "timeout";
        isBackgroundExecution = true;
        toolTerminal.isBackground = true;
        toolSpecificData.didContinueInBackground = true;
        this._sessionTerminalAssociations.delete(chatSessionResource);
        const timeoutOutput = getOutput(toolTerminal.instance, void 0);
        outputLineCount = timeoutOutput ? count(timeoutOutput.trim(), "\n") + 1 : 0;
        terminalResult = timeoutOutput ?? "";
      } else {
        this._logService.debug(`RunInTerminalTool: Threw exception`);
        if (e instanceof CancellationError) {
          await this._commandArtifactCollector.capture(toolSpecificData, toolTerminal.instance, commandId);
          const state = toolSpecificData.terminalCommandState ?? {};
          if (state.exitCode === void 0) {
            state.exitCode = -1;
            state.timestamp = state.timestamp ?? timingStart;
            state.duration = state.duration ?? Math.max(0, Date.now() - state.timestamp);
          }
          toolSpecificData.terminalCommandState = state;
        }
        RunInTerminalTool._activeExecutions.get(termId)?.dispose();
        this._deleteActiveExecution(termId);
        toolTerminal.instance.dispose();
        error = e instanceof CancellationError ? "canceled" : "unexpectedException";
        throw e;
      }
    } finally {
      timeoutPromise?.cancel();
      if ((isBackgroundExecution || didInputNeeded) && executionPromise) {
        executionPromise.catch((e) => {
          if (!(e instanceof CancellationError)) {
            this._logService.error(`RunInTerminalTool: Background execution error`, e);
          }
        });
        if (shouldSendNotifications) {
          const alreadyNotifiedInputNeededOutput = didInputNeeded ? terminalResult : void 0;
          this._registerCompletionNotification(toolTerminal.instance, termId, chatSessionResource, command, toolSpecificData, outputMonitor, alreadyNotifiedInputNeededOutput);
        } else {
          outputMonitor?.dispose();
        }
      } else {
        RunInTerminalTool._activeExecutions.get(termId)?.dispose();
        this._deleteActiveExecution(termId);
        outputMonitor?.dispose();
      }
      store.dispose();
      const timingExecuteMs = Date.now() - timingStart;
      this._telemetry.logInvoke(toolTerminal.instance, {
        terminalToolSessionId: toolSpecificData.terminalToolSessionId,
        didUserEditCommand,
        didToolEditCommand,
        isBackground: executionOptions.persistentSession,
        isSandboxWrapped: toolSpecificData.commandLine.isSandboxWrapped === true,
        requestUnsandboxedExecutionReason: args.requestUnsandboxedExecutionReason,
        shellIntegrationQuality: toolTerminal.shellIntegrationQuality,
        error,
        isNewSession,
        outputLineCount,
        exitCode,
        timingExecuteMs,
        timingConnectMs,
        inputUserChars,
        inputUserSigint,
        terminalExecutionIdleBeforeTimeout: pollingResult?.state === OutputMonitorState.Idle,
        pollDurationMs: pollingResult?.pollDurationMs,
        inputToolManualAcceptCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualAcceptCount,
        inputToolManualRejectCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualRejectCount,
        inputToolManualChars: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualChars,
        inputToolAutoAcceptCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolAutoAcceptCount,
        inputToolAutoChars: outputMonitor?.outputMonitorTelemetryCounters?.inputToolAutoChars,
        inputToolManualShownCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolManualShownCount,
        inputToolFreeFormInputCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolFreeFormInputCount,
        inputToolFreeFormInputShownCount: outputMonitor?.outputMonitorTelemetryCounters?.inputToolFreeFormInputShownCount
      });
    }
    if (altBufferResult) {
      return altBufferResult;
    }
    if (didSandboxWrapCommand && outputLooksBubblewrapHostRestricted(terminalResult)) {
      return this._getBubblewrapHostRestrictedResult();
    }
    const shouldAutoRetryUnsandboxed = shouldAutomaticallyRetryUnsandboxed({
      allowUnsandboxedCommands,
      didSandboxWrapCommand,
      requestUnsandboxedExecution: args.requestUnsandboxedExecution === true,
      isPersistentSession: executionOptions.persistentSession,
      isBackgroundExecution: isBackgroundExecution || didInputNeeded,
      didTimeout,
      exitCode,
      output: terminalResult
    });
    const shouldAutoRetryAllowNetwork = shouldAutomaticallyRetryAllowNetworkInSandboxed({
      retryWithAllowNetworkRequests: isSandboxEnabled && !isSandboxAllowNetworkEnabled && this._retryWithAllowNetworkRequests,
      didSandboxWrapCommand,
      requestUnsandboxedExecution: args.requestUnsandboxedExecution === true,
      requestAllowNetwork: args.requestAllowNetwork === true,
      isPersistentSession: executionOptions.persistentSession,
      isBackgroundExecution: isBackgroundExecution || didInputNeeded,
      didTimeout,
      exitCode,
      output: terminalResult
    });
    const automaticSandboxRetry = shouldAutoRetryAllowNetwork ? { retryKind: "allowNetwork", retryReason: automaticAllowNetworkRetryReason } : shouldAutoRetryUnsandboxed ? { retryKind: "unsandboxed", retryReason: automaticUnsandboxRetryReason } : void 0;
    if (automaticSandboxRetry) {
      const retryResult = await this._runAutomaticSandboxRetry({
        ...automaticSandboxRetry,
        invocation,
        countTokens: _countTokens,
        progress: _progress,
        token,
        args,
        toolSpecificData,
        command,
        allowUnsandboxedCommands,
        isBackground: executionOptions.persistentSession
      });
      if (retryResult) {
        return retryResult;
      }
    }
    this._terminalToolCreator.refreshShellIntegrationQuality(toolTerminal);
    this._logService.info(`RunInTerminalTool: shellIntegrationQuality=${toolTerminal.shellIntegrationQuality} at banner decision time`);
    if (!toolResultMessage && toolTerminal.shellIntegrationQuality === ShellIntegrationQuality.None) {
      toolResultMessage = "$(info) Enable [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) to improve command detection";
    }
    const resultText = [];
    if (!didSandboxWrapCommand) {
      if (didUserEditCommand) {
        resultText.push(`Note: The user manually edited the command to \`${command}\` (terminal ID=${termId}), and this is the output of running that command instead:
`);
      } else if (didToolEditCommand) {
        const wasDetachedToBackground = /(^|\s)nohup\s|Start-Process\b/.test(command);
        const stdinHint = wasDetachedToBackground ? ' Note that stdin is closed for detached background processes; do not try to send input via send_to_terminal \u2014 re-run with mode="sync" instead if interactive input is required.' : "";
        resultText.push(`Note: The tool simplified the command to \`${command}\` (terminal ID=${termId}).${stdinHint} This is the output of running that command instead:
`);
      }
      if (isBackgroundExecution && !executionOptions.persistentSession) {
        resultText.push(`Note: This terminal execution was moved to the background using the ID ${termId}
`);
      }
    }
    if (didSensitiveAutoCancelled) {
      resultText.push(`Note: The command in terminal ID ${termId} was prompting for a password, passphrase, or other secret. The user is unavailable (auto-approve / autopilot mode is on, so no human can focus the terminal to type a secret) and the command has been cancelled. Stop, do NOT retry the command, do NOT call ${TerminalToolId.SendToTerminal}, and do NOT call vscode_askQuestions for the secret. Tell the user to run the command interactively when they are available.

`);
    } else if (didInputNeeded) {
      resultText.push(`Note: The command is running in terminal ID ${termId} and may be waiting for input.
${this._buildInputNeededSteeringText(chatSessionResource, termId, "none")}

`);
    } else if (didTimeout && timeoutValue !== void 0 && timeoutValue > 0) {
      const notificationHint = shouldSendNotifications ? " You will be automatically notified on your next turn when it completes." : "";
      resultText.push(`Note: Command timed out after ${timeoutValue}ms. The command may still be running in terminal ID ${termId}.${notificationHint}
${this._buildInputNeededSteeringText(chatSessionResource, termId, "timeout")}

`);
    } else if (didIdleSilence) {
      const notificationHint = shouldSendNotifications ? " You will be automatically notified on your next turn when it completes." : "";
      resultText.push(`Note: The command produced no new output for an extended period and was moved to background terminal ID ${termId}; the process is still running and has not been killed.${notificationHint}
${this._buildInputNeededSteeringText(chatSessionResource, termId, "idleSilence")}

`);
    }
    const outputAnalyzerMessage = await this._getOutputAnalyzerMessage(exitCode, terminalResult, command, didSandboxWrapCommand);
    if (outputAnalyzerMessage) {
      resultText.push(`${outputAnalyzerMessage}
`);
    }
    let outputForResult = terminalResult;
    if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputCompaction) === true) {
      try {
        const commandForCompaction = toolSpecificData.commandLine.forDisplay ?? command;
        const report = compact(commandForCompaction, terminalResult);
        this._telemetry.logCompaction(report);
        if (report.applied) {
          outputForResult = report.compactedOutput;
        }
      } catch {
        this._telemetry.logCompactionFailed();
      }
    }
    const processedOutput = await this._largeOutputFileWriter.processOutput(outputForResult);
    resultText.push(processedOutput);
    const isError = exitCode !== void 0 && exitCode !== 0;
    const endCwd = await toolTerminal.instance.getCwdResource();
    const imageContent = await this._extractImagesFromOutput(terminalResult, endCwd);
    return {
      toolResultMessage,
      toolMetadata: {
        exitCode,
        id: termId,
        terminalId: toolTerminal.instance.instanceId,
        cwd: endCwd?.toString(),
        timedOut: didTimeout || void 0,
        timeoutMs: didTimeout ? timeoutValue : void 0,
        inputNeeded: didInputNeeded || void 0
      },
      toolResultDetails: isError ? {
        input: command,
        output: [{ type: "embed", isText: true, value: outputForResult }],
        isError: true
      } : void 0,
      content: [
        {
          kind: "text",
          value: resultText.join("")
        },
        ...imageContent
      ]
    };
  }
  _getBubblewrapUnsupportedResult() {
    const settingId = AgentSandboxSettingId.AgentSandboxEnabled;
    const message = localize(
      "runInTerminal.bubblewrap.unsupportedEnvironment",
      "Sandboxing is not supported in this environment. To disable sandboxing, set `{0}` to `off`. The command was not executed.",
      settingId
    );
    const settingsCommandArgs = encodeURIComponent(JSON.stringify([`@id:${settingId}`]));
    const toolResultMessage = new MarkdownString(localize(
      "runInTerminal.bubblewrap.unsupportedEnvironmentWithSettingsLink",
      'Sandboxing is not supported in this environment. [Open the `{0}` setting](command:workbench.action.openSettings?{1} "Open Settings") and set it to `off`. The command was not executed.',
      settingId,
      settingsCommandArgs
    ), { isTrusted: { enabledCommands: ["workbench.action.openSettings"] } });
    return {
      content: [{ kind: "text", value: message }],
      toolResultMessage
    };
  }
  _getBubblewrapHostRestrictedResult() {
    const settingId = AgentSandboxSettingId.AgentSandboxEnabled;
    const message = localize(
      "runInTerminal.bubblewrap.hostRestriction",
      "Sandbox creation failed due to host restrictions. Sandboxing can be disabled by setting `{0}` to `off`.",
      settingId
    );
    return {
      content: [{ kind: "text", value: message }],
      toolResultMessage: message
    };
  }
  /**
   * Builds the steering text the model sees when the terminal tool suspects
   * the command may be waiting for input. The heuristic that triggers this
   * note can false-positive on long-running compute commands or shells sitting
   * on a secondary prompt (e.g. heredoc continuation `> `), so the text
   * explicitly:
   *   1. Tells the model this note is NOT a signal to end the turn.
   *   2. In auto-approve mode, leads with `send_to_terminal` for non-secret
   *      prompts to minimize round-trips, with a `get_terminal_output` fallback.
   *   3. In default mode, leads with `get_terminal_output` as the safe
   *      recovery action and offers `vscode_askQuestions` only for real
   *      non-secret prompts. Secret prompts (passwords, passphrases,
   *      tokens) must never be routed through `vscode_askQuestions`
   *      because answers to that tool are sent through the model — the
   *      user is told to type those values directly into the terminal.
   * `kill_terminal` is only advertised when the command may be hung
   * (`'timeout'` or `'idleSilence'`) — suggesting it in the general case
   * leads the model to terminate valid interactive sessions (e.g.
   * `npm init`) instead of driving them.
   */
  _buildInputNeededSteeringText(chatSessionResource, termId, hungHint) {
    const isAutoApproved = isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService);
    const lines = [];
    lines.push(`This note is not a signal to end the turn \u2014 pick one of the actions below and continue.`);
    if (isAutoApproved) {
      lines.push(`  1. If the output clearly ends with a non-secret input prompt (Continue? (y/n), Enter selection, etc. \u2014 a normal shell prompt like \`$\` or \`#\` does NOT count), determine the answer and immediately call ${TerminalToolId.SendToTerminal} with id="${termId}" (which returns the next few lines of output). Repeat one prompt at a time. Never guess passwords, passphrases, tokens, or other secrets \u2014 if the prompt requires a secret you do not have, inform the user and stop.`);
      lines.push(`  2. If the command may still be producing output or the shell prompt has not returned, call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling.`);
    } else {
      lines.push(`  1. If the command may still be producing output or the shell prompt has not returned, call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling. This is the default and safest action when unsure.`);
      lines.push(`  2. Only if the output clearly ends with a real non-secret input prompt (Continue? (y/n), Enter selection, etc. \u2014 a normal shell prompt like \`$\` or \`#\` does NOT count), call the vscode_askQuestions tool to ask the user, then send each answer using ${TerminalToolId.SendToTerminal} with id="${termId}" (which returns the next few lines of output). Repeat one prompt at a time. NEVER route secret prompts (passwords, passphrases, tokens, API keys, etc.) through vscode_askQuestions \u2014 answers to that tool are sent through the model. For secret prompts, tell the user to type the value directly into the terminal and stop.`);
    }
    if (hungHint === "timeout") {
      lines.push(`  3. A timeout does not mean the command failed \u2014 call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling. Only call ${TerminalToolId.KillTerminal} if the command is genuinely hung and you need to retry with a different approach.`);
    } else if (hungHint === "idleSilence") {
      lines.push(`  3. Producing no output for an extended period does not mean the command failed \u2014 call ${TerminalToolId.GetTerminalOutput} with id="${termId}" to continue polling. Only call ${TerminalToolId.KillTerminal} if the command is genuinely hung and you need to retry with a different approach.`);
    }
    return lines.join("\n");
  }
  async _getOutputAnalyzerMessage(exitCode, exitResult, commandLine, isSandboxWrapped) {
    for (const analyzer of this._outputAnalyzers) {
      const message = await analyzer.analyze({ exitCode, exitResult, commandLine, isSandboxWrapped });
      if (message) {
        return message;
      }
    }
    return void 0;
  }
  /**
   * Scans terminal output for file paths that point to images and reads them.
   * Returns data content parts for any found images that exist on disk.
   */
  async _extractImagesFromOutput(output, cwd) {
    const pathPattern = /[^\s/\\]*(?:[/\\][^\s/\\]*)+\.(?:png|jpe?g|gif|webp|bmp)/gi;
    const matches = /* @__PURE__ */ new Set();
    for (const line of output.split(/\r?\n/)) {
      if (line.length > 1e4) {
        continue;
      }
      for (const match of line.matchAll(pathPattern)) {
        matches.add(match[0]);
      }
    }
    if (matches.size === 0) {
      return [];
    }
    const results = [];
    for (const filePath of matches) {
      try {
        const mimeType = getMediaMime(filePath);
        if (!mimeType || !mimeType.startsWith("image/")) {
          continue;
        }
        let fileUri;
        if (/^\/|^[A-Za-z]:[\\\/]/.test(filePath)) {
          fileUri = URI.file(filePath);
        } else if (cwd) {
          fileUri = URI.joinPath(cwd, filePath);
        } else {
          continue;
        }
        const stat = await this._fileService.stat(fileUri).catch(() => void 0);
        if (!stat || stat.isDirectory || stat.size > RunInTerminalTool._maxImageFileSize) {
          continue;
        }
        const fileContent = await this._fileService.readFile(fileUri);
        results.push({
          kind: "data",
          value: {
            mimeType,
            data: fileContent.value
          },
          audience: [LanguageModelPartAudience.User]
        });
      } catch {
      }
    }
    return results;
  }
  _handleTerminalVisibility(toolTerminal, chatSessionResource) {
    const chatSessionOpenInWidget = !!this._chatWidgetService.getWidgetBySessionResource(chatSessionResource);
    if (this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputLocation) === "terminal" && chatSessionOpenInWidget) {
      this._terminalService.setActiveInstance(toolTerminal.instance);
      this._terminalService.revealTerminal(toolTerminal.instance, true);
    }
  }
  // #region Terminal init
  /**
   * Initializes a terminal for command execution. For foreground mode, reuses existing cached
   * terminal from the session. For background mode, always creates a new terminal to allow
   * parallel execution.
   */
  async _initTerminal(chatSessionResource, termId, terminalToolSessionId, isBackground, token) {
    if (!isBackground) {
      const cachedTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
      if (cachedTerminal && !cachedTerminal.isBackground && !cachedTerminal.instance.isDisposed) {
        if (cachedTerminal.instance.exitCode !== void 0) {
          this._logService.info(`RunInTerminalTool: Cached terminal shell has exited (code=${cachedTerminal.instance.exitCode}), creating a new terminal`);
          this._sessionTerminalAssociations.delete(chatSessionResource);
        } else {
          this._logService.debug(`RunInTerminalTool: Using cached terminal with session resource \`${chatSessionResource}\``);
          this._terminalToolCreator.refreshShellIntegrationQuality(cachedTerminal);
          this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, cachedTerminal.instance);
          this._backgroundNotifications.deleteAndDispose(cachedTerminal.instance.instanceId);
          return cachedTerminal;
        }
      }
    }
    this._logService.debug(`RunInTerminalTool: Creating ${isBackground ? "background" : "foreground"} terminal with ID=${termId}`);
    const profile = await this._profileFetcher.getCopilotProfile();
    const os = await this._osBackend;
    const toolTerminal = await this._terminalToolCreator.createTerminal(profile, os, token);
    toolTerminal.isBackground = isBackground;
    this._terminalChatService.registerTerminalInstanceWithToolSession(terminalToolSessionId, toolTerminal.instance);
    this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionResource, toolTerminal.instance);
    this._registerInputListener(toolTerminal);
    this._addSessionTerminalAssociation(chatSessionResource, toolTerminal);
    if (token.isCancellationRequested) {
      toolTerminal.instance.dispose();
      throw new CancellationError();
    }
    await this._setupProcessIdAssociation(toolTerminal, chatSessionResource, termId, isBackground);
    return toolTerminal;
  }
  _registerInputListener(toolTerminal) {
    const disposable = toolTerminal.instance.onData((data) => {
      if (!telemetryIgnoredSequences.includes(data)) {
        toolTerminal.receivedUserInput = data.length > 0;
      }
    });
    Event.once(toolTerminal.instance.onDisposed)(() => disposable.dispose());
  }
  // #endregion
  // #region Session management
  _restoreTerminalAssociations() {
    const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalSession */, StorageScope.WORKSPACE, "{}");
    try {
      const associations = JSON.parse(storedAssociations);
      for (const instance of this._terminalService.instances) {
        if (instance.processId) {
          const association = associations[instance.processId];
          if (association) {
            const chatSessionResource = LocalChatSessionUri.forSession(association.sessionId);
            this._logService.debug(`RunInTerminalTool: Restored terminal association for PID ${instance.processId}, session ${association.sessionId}`);
            const toolTerminal = {
              instance,
              shellIntegrationQuality: association.shellIntegrationQuality,
              isBackground: association.isBackground
            };
            this._addSessionTerminalAssociation(chatSessionResource, toolTerminal);
            this._terminalChatService.registerTerminalInstanceWithChatSession(chatSessionResource, instance);
            if (association.id) {
              this._setActiveExecution(association.id, this._register(new RestoredTerminalExecution(instance)));
            }
            Event.once(instance.onDisposed)(() => {
              this._removeProcessIdAssociation(instance.processId);
              this._removeExecutionAssociations(instance);
            });
          }
        }
      }
    } catch (error) {
      this._logService.debug(`RunInTerminalTool: Failed to restore terminal associations: ${error}`);
    }
  }
  async _setupProcessIdAssociation(toolTerminal, chatSessionResource, termId, isBackground) {
    await this._associateProcessIdWithSession(toolTerminal.instance, chatSessionResource, termId, toolTerminal.shellIntegrationQuality, isBackground);
    Event.once(toolTerminal.instance.onDisposed)(() => {
      if (toolTerminal.instance.processId) {
        this._removeProcessIdAssociation(toolTerminal.instance.processId);
      }
    });
  }
  async _associateProcessIdWithSession(terminal, chatSessionResource, id, shellIntegrationQuality, isBackground) {
    try {
      const pid = await Promise.race([
        terminal.processReady.then(() => terminal.processId),
        timeout(5e3).then(() => {
          throw new Error("Timeout");
        })
      ]);
      if (isNumber(pid)) {
        const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalSession */, StorageScope.WORKSPACE, "{}");
        const associations = JSON.parse(storedAssociations);
        const sessionId = chatSessionResourceToId(chatSessionResource);
        const existingAssociation = associations[pid] || {};
        associations[pid] = {
          ...existingAssociation,
          sessionId,
          shellIntegrationQuality,
          id,
          isBackground
        };
        this._storageService.store("chat.terminalSessions" /* TerminalSession */, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
        this._logService.debug(`RunInTerminalTool: Associated terminal PID ${pid} with session ${sessionId}`);
      }
    } catch (error) {
      this._logService.debug(`RunInTerminalTool: Failed to associate terminal with session: ${error}`);
    }
  }
  async _removeProcessIdAssociation(pid) {
    try {
      const storedAssociations = this._storageService.get("chat.terminalSessions" /* TerminalSession */, StorageScope.WORKSPACE, "{}");
      const associations = JSON.parse(storedAssociations);
      if (associations[pid]) {
        delete associations[pid];
        this._storageService.store("chat.terminalSessions" /* TerminalSession */, JSON.stringify(associations), StorageScope.WORKSPACE, StorageTarget.USER);
        this._logService.debug(`RunInTerminalTool: Removed terminal association for PID ${pid}`);
      }
    } catch (error) {
      this._logService.debug(`RunInTerminalTool: Failed to remove terminal association: ${error}`);
    }
  }
  _cleanupSessionTerminals(chatSessionResource) {
    const sessionTerminals = this._sessionTerminalInstances.get(chatSessionResource);
    const toolTerminal = this._sessionTerminalAssociations.get(chatSessionResource);
    const terminalsToDispose = sessionTerminals ?? (toolTerminal ? /* @__PURE__ */ new Set([toolTerminal.instance]) : void 0);
    if (!terminalsToDispose || terminalsToDispose.size === 0) {
      return;
    }
    const shouldPreserveTerminalsForOutputLocation = this._configurationService.getValue(TerminalChatAgentToolsSettingId.OutputLocation) === "terminal";
    this._logService.debug(`RunInTerminalTool: Cleaning up ${terminalsToDispose.size} terminal(s) for ended chat session ${chatSessionResource}`);
    this._sessionTerminalAssociations.delete(chatSessionResource);
    this._sessionTerminalInstances.delete(chatSessionResource);
    for (const terminal of terminalsToDispose) {
      if (this._terminalService.foregroundInstances.includes(terminal) || shouldPreserveTerminalsForOutputLocation) {
        this._logService.debug(`RunInTerminalTool: Skipping disposal of preserved terminal ${terminal.instanceId} for session ${chatSessionResource}`);
        continue;
      }
      this._terminalsBeingDisposedBySessionCleanup.add(terminal);
      terminal.dispose();
    }
    const terminalToRemove = [];
    for (const [termId, execution] of RunInTerminalTool._activeExecutions.entries()) {
      if (terminalsToDispose.has(execution.instance)) {
        if (this._terminalService.foregroundInstances.includes(execution.instance) || shouldPreserveTerminalsForOutputLocation) {
          continue;
        }
        execution.dispose();
        terminalToRemove.push(termId);
      }
    }
    for (const termId of terminalToRemove) {
      this._deleteActiveExecution(termId);
    }
  }
  _addSessionTerminalAssociation(chatSessionResource, toolTerminal) {
    this._ensureArchivedSessionListener();
    let sessionTerminals = this._sessionTerminalInstances.get(chatSessionResource);
    if (!sessionTerminals) {
      sessionTerminals = /* @__PURE__ */ new Set();
      this._sessionTerminalInstances.set(chatSessionResource, sessionTerminals);
    }
    sessionTerminals.add(toolTerminal.instance);
    if (!toolTerminal.isBackground) {
      this._sessionTerminalAssociations.set(chatSessionResource, toolTerminal);
    }
  }
  _ensureArchivedSessionListener() {
    if (this._archivedSessionListener.value) {
      return;
    }
    this._archivedSessionListener.value = this._agentSessionsService.onDidChangeSessionArchivedState((session) => {
      if (session.isArchived()) {
        this._cleanupSessionTerminals(session.resource);
      }
    });
  }
  _removeTerminalAssociations(terminal) {
    if (this._terminalsBeingDisposedBySessionCleanup.delete(terminal)) {
      this._removeExecutionAssociations(terminal);
      return;
    }
    for (const [sessionResource, toolTerminal] of this._sessionTerminalAssociations.entries()) {
      if (terminal === toolTerminal.instance) {
        this._sessionTerminalAssociations.delete(sessionResource);
      }
    }
    for (const [sessionResource, sessionTerminals] of this._sessionTerminalInstances.entries()) {
      if (!sessionTerminals.delete(terminal)) {
        continue;
      }
      if (sessionTerminals.size === 0) {
        this._sessionTerminalInstances.delete(sessionResource);
      }
    }
    this._removeExecutionAssociations(terminal);
  }
  _removeExecutionAssociations(terminal) {
    const executionIdsToRemove = [];
    for (const [termId, execution] of RunInTerminalTool._activeExecutions.entries()) {
      if (execution.instance === terminal) {
        execution.dispose();
        executionIdsToRemove.push(termId);
      }
    }
    for (const termId of executionIdsToRemove) {
      this._deleteActiveExecution(termId);
    }
  }
  /**
   * Registers a listener for command completion on a background terminal.
   * When a command finishes, sends a steering message to the chat session
   * so the agent is notified on its next turn.
   *
   * If an output monitor is provided, it is continued in background mode
   * to detect prompts-for-input while the terminal runs in the background.
   * The output monitor is cancelled and disposed when a command finishes.
   */
  _registerCompletionNotification(terminalInstance, termId, chatSessionResource, commandName, toolSpecificData, outputMonitor, alreadyNotifiedInputNeededOutput) {
    const notificationKey = terminalInstance.instanceId;
    this._backgroundNotifications.deleteAndDispose(notificationKey);
    const commandDetection = terminalInstance.capabilities.get(TerminalCapability.CommandDetection);
    if (!commandDetection) {
      outputMonitor?.dispose();
      return;
    }
    const commandDisplay = appendEscapedMarkdownInlineCode(buildCompletionNotificationCommand(commandName));
    const sessionRef = this._chatService.acquireExistingSession(chatSessionResource, "RunInTerminalTool#completionNotification");
    if (!sessionRef) {
      this._logService.warn(`RunInTerminalTool: Cannot register completion notification for terminal ${termId} - session already disposed`);
      outputMonitor?.dispose();
      return;
    }
    const lastRequest = sessionRef.object.lastRequest;
    const sendOptions = {};
    if (lastRequest) {
      sendOptions.userSelectedModelId = lastRequest.modelId;
      sendOptions.modeInfo = lastRequest.modeInfo;
      sendOptions.agentIdSilent = lastRequest.response?.agent?.id;
      if (lastRequest.userSelectedTools) {
        sendOptions.userSelectedTools = constObservable(lastRequest.userSelectedTools);
      }
    }
    const store = new DisposableStore();
    let userIsReplyingDirectly = false;
    const disposeNotification = () => this._backgroundNotifications.deleteAndDispose(notificationKey);
    const handleSessionCancelled = () => {
      if (sessionRef.object.lastRequest?.response?.isCanceled) {
        disposeNotification();
        return true;
      }
      return false;
    };
    store.add(autorun((reader) => {
      const request = sessionRef.object.lastRequestObs.read(reader);
      if (!request?.response) {
        return;
      }
      reader.store.add(request.response.onDidChange((ev) => {
        if (ev.reason === "completedRequest" && request.response.isCanceled) {
          disposeNotification();
        }
      }));
    }));
    if (outputMonitor) {
      let lastInputNeededOutput = alreadyNotifiedInputNeededOutput ?? "";
      let lastInputNeededNotificationTime = alreadyNotifiedInputNeededOutput !== void 0 ? Date.now() : 0;
      const bgCts = new CancellationTokenSource();
      store.add(toDisposable(() => {
        bgCts.cancel();
        bgCts.dispose();
      }));
      store.add(outputMonitor);
      outputMonitor.continueMonitoringAsync(bgCts.token);
      store.add(this._registerSensitiveInputElicitation(
        chatSessionResource,
        terminalInstance,
        outputMonitor,
        () => {
          const execution = RunInTerminalTool._activeExecutions.get(termId);
          execution?.dispose();
        }
      ));
      store.add(outputMonitor.onDidDetectInputNeeded(() => {
        if (userIsReplyingDirectly) {
          this._logService.debug(`RunInTerminalTool: Suppressing input-needed notification for terminal ${termId} because user is replying directly`);
          return;
        }
        if (terminalInstance.isDisposed) {
          this._logService.debug(`RunInTerminalTool: Suppressing input-needed notification for terminal ${termId} because the terminal is disposed`);
          return;
        }
        if (handleSessionCancelled()) {
          return;
        }
        const execution = RunInTerminalTool._activeExecutions.get(termId);
        if (!execution) {
          return;
        }
        const currentOutput = execution.getOutput();
        const now = Date.now();
        const isDuplicate = currentOutput === lastInputNeededOutput && now - lastInputNeededNotificationTime < INPUT_NEEDED_NOTIFICATION_THROTTLE_MS;
        if (isDuplicate) {
          return;
        }
        lastInputNeededOutput = currentOutput;
        lastInputNeededNotificationTime = now;
        const inputAction = this._buildInputNeededSteeringText(chatSessionResource, termId, "none");
        const message = `[Terminal ${termId} notification: command may be waiting for input \u2014 assess the output below.]
${inputAction}
Terminal output:
${currentOutput}`;
        this._logService.debug(`RunInTerminalTool: Input needed in background terminal ${termId}, notifying chat session`);
        this._chatService.sendRequest(chatSessionResource, message, {
          ...sendOptions,
          queue: ChatRequestQueueKind.Steering,
          isSystemInitiated: true,
          systemInitiatedLabel: localize("terminalAssessingOutput", "{0} may need input", commandDisplay),
          terminalExecutionId: termId
        }).catch((e) => {
          this._logService.warn(`RunInTerminalTool: Failed to send input-needed notification for terminal ${termId}`, e);
        });
      }));
    }
    store.add(terminalInstance.onDidInputData(() => {
      if (userIsReplyingDirectly) {
        return;
      }
      userIsReplyingDirectly = true;
      this._dismissPendingCarouselsForTerminal(chatSessionResource, termId);
    }));
    store.add(sessionRef);
    store.add(commandDetection.onCommandFinished((command) => {
      const execution = RunInTerminalTool._activeExecutions.get(termId);
      if (!execution) {
        disposeNotification();
        return;
      }
      if (handleSessionCancelled()) {
        return;
      }
      disposeNotification();
      const exitCode = command.exitCode;
      const exitCodeText = exitCode !== void 0 && exitCode !== 0 ? ` with exit code ${exitCode}` : "";
      const currentOutput = execution.getOutput();
      const isUserVisible = this._terminalService.foregroundInstances.includes(terminalInstance);
      const message = isUserVisible ? `[Terminal ${termId} notification: command completed${exitCodeText}. Use send_to_terminal to send another command or kill_terminal to stop it.]
Terminal output:
${currentOutput}` : `[Terminal ${termId} notification: command completed${exitCodeText}. The terminal has been cleaned up.]
Terminal output:
${currentOutput}`;
      this._logService.debug(`RunInTerminalTool: Command completed in background terminal ${termId}, notifying chat session`);
      this._chatService.sendRequest(chatSessionResource, message, {
        ...sendOptions,
        queue: ChatRequestQueueKind.Steering,
        isSystemInitiated: true,
        systemInitiatedLabel: localize("terminalCommandCompleted", "{0} completed", commandDisplay),
        terminalExecutionId: termId
      }).catch((e) => {
        this._logService.warn(`RunInTerminalTool: Failed to send completion notification for terminal ${termId}`, e);
      });
      this._commandArtifactCollector.capture(toolSpecificData, terminalInstance, command.id).then(() => {
        if (this._terminalService.foregroundInstances.includes(terminalInstance)) {
          this._logService.debug(`RunInTerminalTool: Background terminal ${termId} was revealed by user, skipping disposal`);
          return;
        }
        this._logService.debug(`RunInTerminalTool: Disposing finished background terminal ${termId}`);
        RunInTerminalTool._killedByTool.add(termId);
        execution.dispose();
        this._deleteActiveExecution(termId);
        terminalInstance.dispose();
      });
    }));
    const executionForDisposal = RunInTerminalTool._activeExecutions.get(termId);
    store.add(terminalInstance.onDisposed(() => {
      if (RunInTerminalTool._killedByTool.has(termId)) {
        disposeNotification();
        return;
      }
      if (this._isShuttingDown) {
        disposeNotification();
        return;
      }
      if (terminalInstance.exitReason === TerminalExitReason.User) {
        this._logService.debug(`RunInTerminalTool: Background terminal ${termId} closed by user, suppressing steering message`);
        disposeNotification();
        return;
      }
      if (handleSessionCancelled()) {
        return;
      }
      const currentOutput = executionForDisposal?.getOutput() ?? "";
      const exitCode = terminalInstance.exitCode;
      const exitCodeText = exitCode !== void 0 && exitCode !== 0 ? ` with exit code ${exitCode}` : "";
      disposeNotification();
      const message = `[Terminal ${termId} notification: terminal exited${exitCodeText}. The terminal process ended before the command could complete normally; further commands cannot be sent to this terminal ID.]
Terminal output:
${currentOutput}`;
      this._logService.debug(`RunInTerminalTool: Background terminal ${termId} disposed${exitCodeText}, notifying chat session`);
      this._chatService.sendRequest(chatSessionResource, message, {
        ...sendOptions,
        queue: ChatRequestQueueKind.Steering,
        isSystemInitiated: true,
        systemInitiatedLabel: localize("terminalProcessExited", "{0} terminal exited", commandDisplay),
        terminalExecutionId: termId
      }).catch((e) => {
        this._logService.warn(`RunInTerminalTool: Failed to send terminal-exited notification for terminal ${termId}`, e);
      });
    }));
    store.add(sessionRef.object.onDidChange((e) => {
      if (e.kind === "removeRequest") {
        this._logService.debug(`RunInTerminalTool: Request removed from session, cleaning up background terminal ${termId}`);
        RunInTerminalTool._activeExecutions.get(termId)?.dispose();
        this._deleteActiveExecution(termId);
        disposeNotification();
        terminalInstance.dispose();
      }
    }));
    this._backgroundNotifications.set(notificationKey, store);
  }
  /**
   * Find and dismiss any pending (not yet answered) question carousels that
   * are associated with the given terminal. This is called when the user
   * types directly into the terminal, bypassing the carousel UI.
   */
  _dismissPendingCarouselsForTerminal(chatSessionResource, termId) {
    const model = this._chatService.getSession(chatSessionResource);
    if (!model) {
      return;
    }
    const requests = model.getRequests();
    for (let i = requests.length - 1; i >= 0; i--) {
      const response = requests[i].response;
      if (!response) {
        continue;
      }
      const parts = response.response.value;
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];
        if (part instanceof ChatQuestionCarouselData && part.terminalId === termId && !part.isUsed) {
          this._logService.debug(`RunInTerminalTool: Dismissing pending carousel for terminal ${termId} because user typed directly in terminal`);
          part.data = {};
          part.isUsed = true;
          part.dismissedByTerminalInput = true;
          part.completion.complete({ answers: void 0 });
          return;
        }
      }
    }
  }
  // #endregion
};
RunInTerminalTool._activeExecutions = /* @__PURE__ */ new Map();
/**
 * Terminal IDs being programmatically disposed (by `kill_terminal` or
 * automatic background-terminal cleanup). Used to suppress the redundant
 * "terminal exited" steering message in `_registerCompletionNotification`'s
 * `onDisposed` handler.
 */
RunInTerminalTool._killedByTool = /* @__PURE__ */ new Set();
RunInTerminalTool._maxImageFileSize = 5 * 1024 * 1024;
RunInTerminalTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IHistoryService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILanguageModelToolsService),
  __decorateParam(7, IRemoteAgentService),
  __decorateParam(8, IStorageService),
  __decorateParam(9, ITerminalChatService),
  __decorateParam(10, ITerminalLogService),
  __decorateParam(11, ITerminalService),
  __decorateParam(12, ITerminalSandboxService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IChatWidgetService),
  __decorateParam(15, IAgentSessionsService),
  __decorateParam(16, ILifecycleService)
], RunInTerminalTool);
let ActiveTerminalExecution = class extends Disposable {
  constructor(sessionResource, termId, toolTerminal, commandDetection, isBackground, _instantiationService) {
    super();
    this.sessionResource = sessionResource;
    this.termId = termId;
    this._instantiationService = _instantiationService;
    this._toolTerminal = toolTerminal;
    this._isBackground = isBackground;
    this._completionDeferred = new DeferredPromise();
    this.strategy = this._register(this._createStrategy(commandDetection));
    this._register(this.strategy.onDidCreateStartMarker((marker) => {
      if (marker) {
        this._startMarker = marker;
      }
    }));
  }
  /**
   * The promise that resolves when the execute strategy completes. Can be awaited to get the
   * full result with exit code.
   */
  get completionPromise() {
    return this._completionDeferred.p;
  }
  get isBackground() {
    return this._isBackground;
  }
  get startMarker() {
    return this._startMarker;
  }
  get instance() {
    return this._toolTerminal.instance;
  }
  _createStrategy(commandDetection) {
    const isSyncMode = !this._isBackground;
    switch (this._toolTerminal.shellIntegrationQuality) {
      case ShellIntegrationQuality.None:
        return this._instantiationService.createInstance(NoneExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false);
      case ShellIntegrationQuality.Basic:
        return this._instantiationService.createInstance(BasicExecuteStrategy, this._toolTerminal.instance, () => this._toolTerminal.receivedUserInput ?? false, commandDetection);
      case ShellIntegrationQuality.Rich:
        return this._instantiationService.createInstance(RichExecuteStrategy, this._toolTerminal.instance, commandDetection, isSyncMode);
    }
  }
  /**
   * Starts the command execution using the execute strategy.
   * @param commandLine The command to execute
   * @param token Cancellation token
   * @param commandId Optional command ID for linking
   * @returns The execution result
   */
  async start(commandLine, token, commandId, commandLineForMetadata) {
    try {
      const result = await this.strategy.execute(commandLine, token, commandId, commandLineForMetadata);
      this._completionDeferred.complete(result);
      return result;
    } catch (e) {
      this._completionDeferred.error(e);
      throw e;
    }
  }
  /**
   * Switches this execution to foreground mode, meaning callers will await its completion.
   */
  setForeground() {
    this._isBackground = false;
  }
  /**
   * Switches this execution to background mode.
   */
  setBackground() {
    this._isBackground = true;
  }
  /**
   * Gets the current output from the terminal.
   */
  getOutput(marker) {
    return getOutput(this.instance, marker ?? this._startMarker);
  }
};
ActiveTerminalExecution = __decorateClass([
  __decorateParam(5, IInstantiationService)
], ActiveTerminalExecution);
class RestoredTerminalExecution extends Disposable {
  constructor(instance) {
    super();
    this.instance = instance;
    this.completionPromise = Promise.resolve({ output: void 0, error: "restoredTerminalExecutionNotAwaitable" });
  }
  getOutput(marker) {
    return getOutput(this.instance, marker);
  }
}
let TerminalProfileFetcher = class {
  constructor(_configurationService, _terminalProfileResolverService, _remoteAgentService, _fileService, _logService) {
    this._configurationService = _configurationService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._remoteAgentService = _remoteAgentService;
    this._fileService = _fileService;
    this._logService = _logService;
    this.osBackend = this._remoteAgentService.getEnvironment().then((remoteEnv) => remoteEnv?.os ?? OS);
  }
  async getCopilotProfile() {
    const os = await this.osBackend;
    const customChatAgentProfile = this._getChatTerminalProfile(os);
    if (customChatAgentProfile) {
      return customChatAgentProfile;
    }
    const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({
      os,
      remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority
    });
    if (basename(defaultProfile.path) === "cmd.exe") {
      return {
        ...defaultProfile,
        path: "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        profileName: "PowerShell"
      };
    }
    if (defaultProfile.path === "/bin/sh") {
      return {
        ...defaultProfile,
        path: "/bin/bash",
        profileName: "bash"
      };
    }
    if (os !== OperatingSystem.Windows) {
      const shellExists = await this._shellExists(defaultProfile.path);
      if (!shellExists) {
        const fallbackPath = await this._findFallbackShell();
        if (fallbackPath) {
          this._logService.warn(`TerminalProfileFetcher: resolved shell "${defaultProfile.path}" does not exist, falling back to "${fallbackPath}"`);
          return {
            ...defaultProfile,
            path: fallbackPath,
            profileName: basename(fallbackPath),
            icon: void 0
          };
        }
      }
    }
    return { ...defaultProfile, icon: void 0 };
  }
  async _shellExists(shellPath) {
    try {
      const remoteAuthority = this._remoteAgentService.getConnection()?.remoteAuthority;
      const resource = remoteAuthority ? URI.file(shellPath).with({ scheme: "vscode-remote", authority: remoteAuthority }) : URI.file(shellPath);
      return await this._fileService.exists(resource);
    } catch {
      return false;
    }
  }
  async _findFallbackShell() {
    for (const candidate of TerminalProfileFetcher._posixShellFallbacks) {
      if (await this._shellExists(candidate)) {
        return candidate;
      }
    }
    return void 0;
  }
  async getCopilotShell() {
    return (await this.getCopilotProfile()).path;
  }
  _getChatTerminalProfile(os) {
    let profileSetting;
    switch (os) {
      case OperatingSystem.Windows:
        profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileWindows;
        break;
      case OperatingSystem.Macintosh:
        profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileMacOs;
        break;
      case OperatingSystem.Linux:
      default:
        profileSetting = TerminalChatAgentToolsSettingId.TerminalProfileLinux;
        break;
    }
    const profile = this._configurationService.getValue(profileSetting);
    if (this._isValidChatAgentTerminalProfile(profile)) {
      return profile;
    }
    return void 0;
  }
  _isValidChatAgentTerminalProfile(profile) {
    if (profile === null || profile === void 0 || typeof profile !== "object") {
      return false;
    }
    if ("path" in profile && isString(profile.path)) {
      return true;
    }
    return false;
  }
};
TerminalProfileFetcher._posixShellFallbacks = ["/bin/bash", "/usr/bin/bash", "/bin/sh"];
TerminalProfileFetcher = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ITerminalProfileResolverService),
  __decorateParam(2, IRemoteAgentService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ITerminalLogService)
], TerminalProfileFetcher);
export {
  RunInTerminalTool,
  TerminalProfileFetcher,
  buildCompletionNotificationCommand,
  createRunInTerminalToolData,
  createSandboxLines,
  createSandboxProperties,
  outputLooksBubblewrapHostRestricted,
  shouldAutomaticallyRetryAllowNetworkInSandboxed,
  shouldAutomaticallyRetryUnsandboxed
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL3J1bkluVGVybWluYWxUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBJTWFya2VyIGFzIElYdGVybU1hcmtlciB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFJ1bk9uY2VTY2hlZHVsZXIsIHRpbWVvdXQsIHR5cGUgQ2FuY2VsYWJsZVByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMsIE1hcmtkb3duU3RyaW5nLCB0eXBlIElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZ2V0TWVkaWFNaW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgcG9zaXgsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWF0aW9uT3B0aW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCB0eXBlIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEFnZW50U2FuZGJveFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSwgSVRlcm1pbmFsUHJvZmlsZSwgVGVybWluYWxFeGl0UmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQsIEVsaWNpdGF0aW9uU3RhdGUsIHR5cGUgSUNoYXRFeHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlLCB0eXBlIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIHR5cGUgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCwgdHlwZSBJQ2hhdFJlcXVlc3RNb2RlSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdFBlcm1pc3Npb25MZXZlbCwgaXNBdXRvQXBwcm92ZUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgVXNlclNlbGVjdGVkVG9vbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIElUb29sQ29uZmlybWF0aW9uTWVzc2FnZXMsIElTdHJlYW1lZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sSW52b2NhdGlvblN0cmVhbUNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24sIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIElUZXJtaW5hbFNlcnZpY2UsIHR5cGUgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9JRExFX1NJTEVOQ0VfVElNRU9VVF9NUywgVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRSZWNvbW1lbmRlZFRvb2xzT3ZlclJ1bkluVGVybWluYWwgfSBmcm9tICcuLi9hbHRlcm5hdGl2ZVJlY29tbWVuZGF0aW9uLmpzJztcbmltcG9ydCB7IEJhc2ljRXhlY3V0ZVN0cmF0ZWd5IH0gZnJvbSAnLi4vZXhlY3V0ZVN0cmF0ZWd5L2Jhc2ljRXhlY3V0ZVN0cmF0ZWd5LmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5LCBJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQgfSBmcm9tICcuLi9leGVjdXRlU3RyYXRlZ3kvZXhlY3V0ZVN0cmF0ZWd5LmpzJztcbmltcG9ydCB7IE5vbmVFeGVjdXRlU3RyYXRlZ3kgfSBmcm9tICcuLi9leGVjdXRlU3RyYXRlZ3kvbm9uZUV4ZWN1dGVTdHJhdGVneS5qcyc7XG5pbXBvcnQgeyBSaWNoRXhlY3V0ZVN0cmF0ZWd5IH0gZnJvbSAnLi4vZXhlY3V0ZVN0cmF0ZWd5L3JpY2hFeGVjdXRlU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHsgZ2V0T3V0cHV0IH0gZnJvbSAnLi4vb3V0cHV0SGVscGVycy5qcyc7XG5pbXBvcnQgeyBMYXJnZU91dHB1dEZpbGVXcml0ZXIgfSBmcm9tICcuLi9sYXJnZU91dHB1dEZpbGVXcml0ZXIuanMnO1xuaW1wb3J0IHsgYnVpbGRDb21tYW5kRGlzcGxheVRleHQsIGV4dHJhY3RDZFByZWZpeCwgaXNGaXNoLCBpc1Bvd2VyU2hlbGwsIGlzV2luZG93c1Bvd2VyU2hlbGwsIGlzWnNoLCBub3JtYWxpemVUZXJtaW5hbENvbW1hbmRGb3JEaXNwbGF5IH0gZnJvbSAnLi4vcnVuSW5UZXJtaW5hbEhlbHBlcnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZExpbmVQcmVzZW50ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lUHJlc2VudGVyL2NvbW1hbmRMaW5lUHJlc2VudGVyLmpzJztcbmltcG9ydCB7IE5vZGVDb21tYW5kTGluZVByZXNlbnRlciB9IGZyb20gJy4vY29tbWFuZExpbmVQcmVzZW50ZXIvbm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyLmpzJztcbmltcG9ydCB7IFB5dGhvbkNvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVByZXNlbnRlci9weXRob25Db21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBSdWJ5Q29tbWFuZExpbmVQcmVzZW50ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lUHJlc2VudGVyL3J1YnlDb21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBTYW5kYm94ZWRDb21tYW5kTGluZVByZXNlbnRlciB9IGZyb20gJy4vY29tbWFuZExpbmVQcmVzZW50ZXIvc2FuZGJveGVkQ29tbWFuZExpbmVQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgUnVuSW5UZXJtaW5hbFRvb2xUZWxlbWV0cnkgfSBmcm9tICcuLi9ydW5JblRlcm1pbmFsVG9vbFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBTaGVsbEludGVncmF0aW9uUXVhbGl0eSwgVG9vbFRlcm1pbmFsQ3JlYXRvciwgdHlwZSBJVG9vbFRlcm1pbmFsIH0gZnJvbSAnLi4vdG9vbFRlcm1pbmFsQ3JlYXRvci5qcyc7XG5pbXBvcnQgeyBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlciwgVHJlZVNpdHRlckNvbW1hbmRQYXJzZXJMYW5ndWFnZSB9IGZyb20gJy4uL3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLmpzJztcbmltcG9ydCB7IHR5cGUgSUNvbW1hbmRMaW5lQW5hbHl6ZXIsIHR5cGUgSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zIH0gZnJvbSAnLi9jb21tYW5kTGluZUFuYWx5emVyL2NvbW1hbmRMaW5lQW5hbHl6ZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyIH0gZnJvbSAnLi9jb21tYW5kTGluZUFuYWx5emVyL2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVBbmFseXplci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kTGluZUZpbGVXcml0ZUFuYWx5emVyIH0gZnJvbSAnLi9jb21tYW5kTGluZUFuYWx5emVyL2NvbW1hbmRMaW5lRmlsZVdyaXRlQW5hbHl6ZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVTYW5kYm94QW5hbHl6ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVTYW5kYm94QW5hbHl6ZXIuanMnO1xuaW1wb3J0IHsgT3V0cHV0TW9uaXRvciB9IGZyb20gJy4vbW9uaXRvcmluZy9vdXRwdXRNb25pdG9yLmpzJztcbmltcG9ydCB7IElQb2xsaW5nUmVzdWx0LCBPdXRwdXRNb25pdG9yU3RhdGUgfSBmcm9tICcuL21vbml0b3JpbmcvdHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4vdG9vbElkcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZExpbmVSZXdyaXRlciB9IGZyb20gJy4vY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZVJld3JpdGVyLmpzJztcbmltcG9ydCB7IENvbW1hbmRMaW5lQ2RQcmVmaXhSZXdyaXRlciB9IGZyb20gJy4vY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZUNkUHJlZml4UmV3cml0ZXIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVQcmV2ZW50SGlzdG9yeVJld3JpdGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVJld3JpdGVyL2NvbW1hbmRMaW5lUHJldmVudEhpc3RvcnlSZXdyaXRlci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kTGluZVB3c2hDaGFpbk9wZXJhdG9yUmV3cml0ZXIgfSBmcm9tICcuL2NvbW1hbmRMaW5lUmV3cml0ZXIvY29tbWFuZExpbmVQd3NoQ2hhaW5PcGVyYXRvclJld3JpdGVyLmpzJztcbmltcG9ydCB7IENvbW1hbmRMaW5lQmFja2dyb3VuZERldGFjaFJld3JpdGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVJld3JpdGVyL2NvbW1hbmRMaW5lQmFja2dyb3VuZERldGFjaFJld3JpdGVyLmpzJztcbmltcG9ydCB7IENvbW1hbmRMaW5lU2FuZGJveFJld3JpdGVyIH0gZnJvbSAnLi9jb21tYW5kTGluZVJld3JpdGVyL2NvbW1hbmRMaW5lU2FuZGJveFJld3JpdGVyLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbW1hbmRBcnRpZmFjdENvbGxlY3RvciB9IGZyb20gJy4vdGVybWluYWxDb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3IuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9icm93c2VyL3Rlcm1pbmFsQ2hhdC5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgSU91dHB1dEFuYWx5emVyIH0gZnJvbSAnLi9vdXRwdXRBbmFseXplci5qcyc7XG5pbXBvcnQgeyBTYW5kYm94T3V0cHV0QW5hbHl6ZXIsIG91dHB1dExvb2tzU2FuZGJveEJsb2NrZWQsIG91dHB1dExvb2tzU2FuZGJveE5ldHdvcmtCbG9ja2VkIH0gZnJvbSAnLi9zYW5kYm94T3V0cHV0QW5hbHl6ZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsIFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLCBUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uLCB0eXBlIElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cywgdHlwZSBJVGVybWluYWxTYW5kYm94UmVzb2x2ZWROZXR3b3JrRG9tYWlucyB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBpc1Nlc3Npb25BdXRvQXBwcm92ZUxldmVsLCBpc1Rlcm1pbmFsQXV0b0FwcHJvdmVBbGxvd2VkLCBpc1Rvb2xFbGlnaWJsZUZvclRlcm1pbmFsQXV0b0FwcHJvdmFsIH0gZnJvbSAnLi90ZXJtaW5hbFRvb2xBdXRvQXBwcm92ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBDaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0LmpzJztcbmltcG9ydCB7IGdldFNhbmRib3hQcmVjaGVja0lucHV0c0ZvclRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL3Rvb2xzL3Rvb2xIZWxwZXJzLmpzJztcbmltcG9ydCB7IGNvbXBhY3QgfSBmcm9tICcuL2NvbnNvbGVDb21wYWN0b3IvY29uc29sZUNvbXBhY3Rvci5qcyc7XG5cbi8vICNyZWdpb24gVG9vbCBkYXRhXG5cbmNvbnN0IFRFUk1JTkFMX1NBTkRCT1hfRE9DVU1FTlRBVElPTl9VUkwgPSAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXNhbmRib3hpbmcnO1xuY29uc3QgVE9PTF9SRUZFUkVOQ0VfTkFNRSA9ICdydW5JblRlcm1pbmFsJztcbmNvbnN0IExFR0FDWV9UT09MX1JFRkVSRU5DRV9GVUxMX05BTUVTID0gWydydW5Db21tYW5kcy9ydW5JblRlcm1pbmFsJ107XG5jb25zdCBJTlBVVF9ORUVERURfTk9USUZJQ0FUSU9OX1RIUk9UVExFX01TID0gNTAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBJU2FuZGJveGluZ09uTmV0d29ya1Jlc3RyaWN0ZWRPcHRpb25zIHtcblx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnO1xuXHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogYm9vbGVhbjtcblx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGJvb2xlYW47XG5cdG5ldHdvcmtEb21haW5zPzogSVRlcm1pbmFsU2FuZGJveFJlc29sdmVkTmV0d29ya0RvbWFpbnM7XG59XG5leHBvcnQgaW50ZXJmYWNlIElTYW5kYm94aW5nT25OZXR3b3JrQXZhaWxhYmxlT3B0aW9ucyB7XG5cdHNhbmRib3hNb2RlOiAnb24tbmV0d29yay1hdmFpbGFibGUnO1xuXHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogYm9vbGVhbjtcblx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IGZhbHNlO1xuXHRuZXR3b3JrRG9tYWluczogdW5kZWZpbmVkO1xufVxuZXhwb3J0IHR5cGUgSVNhbmRib3hpbmdPbk9wdGlvbnMgPSBJU2FuZGJveGluZ09uTmV0d29ya1Jlc3RyaWN0ZWRPcHRpb25zIHwgSVNhbmRib3hpbmdPbk5ldHdvcmtBdmFpbGFibGVPcHRpb25zO1xuZXhwb3J0IGludGVyZmFjZSBJU2FuZGJveGluZ0Rpc2FibGVkT3B0aW9ucyB7XG5cdHNhbmRib3hNb2RlOiAnb2ZmJztcbn1cbmV4cG9ydCB0eXBlIElTYW5kYm94aW5nT3B0aW9ucyA9IElTYW5kYm94aW5nT25PcHRpb25zIHwgSVNhbmRib3hpbmdEaXNhYmxlZE9wdGlvbnM7XG5cbmZ1bmN0aW9uIGNyZWF0ZVBvd2VyU2hlbGxNb2RlbERlc2NyaXB0aW9uKHNoZWxsOiBzdHJpbmcsIHNhbmRib3hpbmdPcHRpb25zOiBJU2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IGlzV2luUHdzaCA9IGlzV2luZG93c1Bvd2VyU2hlbGwoc2hlbGwpO1xuXHRjb25zdCBwYXJ0cyA9IFtcblx0XHRgVGhpcyB0b29sIGFsbG93cyB5b3UgdG8gZXhlY3V0ZSAke2lzV2luUHdzaCA/ICdXaW5kb3dzIFBvd2VyU2hlbGwgNS4xJyA6ICdQb3dlclNoZWxsJ30gY29tbWFuZHMgaW4gYSBwZXJzaXN0ZW50IHRlcm1pbmFsIHNlc3Npb24sIHByZXNlcnZpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzLCB3b3JraW5nIGRpcmVjdG9yeSwgYW5kIG90aGVyIGNvbnRleHQgYWNyb3NzIG11bHRpcGxlIGNvbW1hbmRzLmAsXG5cdFx0JycsXG5cdFx0J0NvbW1hbmQgRXhlY3V0aW9uOicsXG5cdFx0Ly8gSU1QT1JUQU5UOiBQb3dlclNoZWxsIDUgZG9lcyBub3Qgc3VwcG9ydCBgJiZgIHNvIGFsd2F5cyByZS13cml0ZSB0aGVtIHRvIGA7YC4gTm90ZSB0aGF0XG5cdFx0Ly8gdGhlIGJlaGF2aW9yIG9mIGAmJmAgZGlmZmVycyBhIGxpdHRsZSBmcm9tIGA7YCBidXQgaW4gZ2VuZXJhbCBpdCdzIGZpbmVcblx0XHRpc1dpblB3c2ggPyAnLSBVc2Ugc2VtaWNvbG9ucyA7IHRvIGNoYWluIGNvbW1hbmRzIG9uIG9uZSBsaW5lLCBORVZFUiB1c2UgJiYgZXZlbiB3aGVuIGFza2VkIGV4cGxpY2l0bHknIDogJy0gUHJlZmVyIDsgd2hlbiBjaGFpbmluZyBjb21tYW5kcyBvbiBvbmUgbGluZScsXG5cdFx0Jy0gUHJlZmVyIHBpcGVsaW5lcyB8IGZvciBvYmplY3QtYmFzZWQgZGF0YSBmbG93Jyxcblx0XHQnLSBOZXZlciBjcmVhdGUgYSBzdWItc2hlbGwgKGVnLiBwb3dlcnNoZWxsIC1jIFwiY29tbWFuZFwiKSB1bmxlc3MgZXhwbGljaXRseSBhc2tlZCcsXG5cdFx0JycsXG5cdFx0J0RpcmVjdG9yeSBNYW5hZ2VtZW50OicsXG5cdFx0Jy0gUHJlZmVyIHJlbGF0aXZlIHBhdGhzIHdoZW4gbmF2aWdhdGluZyBkaXJlY3Rvcmllcywgb25seSB1c2UgYWJzb2x1dGUgd2hlbiB0aGUgcGF0aCBpcyBmYXIgYXdheSBvciB0aGUgY3VycmVudCBjd2QgaXMgbm90IGV4cGVjdGVkJyxcblx0XHQnLSBCeSBkZWZhdWx0IChtb2RlPXN5bmMpLCBzaGVsbCBhbmQgY3dkIGFyZSByZXVzZWQgYnkgc3Vic2VxdWVudCBzeW5jIGNvbW1hbmRzJyxcblx0XHQnLSBVc2UgJFBXRCBvciBHZXQtTG9jYXRpb24gZm9yIGN1cnJlbnQgZGlyZWN0b3J5Jyxcblx0XHQnLSBVc2UgUHVzaC1Mb2NhdGlvbi9Qb3AtTG9jYXRpb24gZm9yIGRpcmVjdG9yeSBzdGFjaycsXG5cdFx0JycsXG5cdFx0J1Byb2dyYW0gRXhlY3V0aW9uOicsXG5cdFx0Jy0gU3VwcG9ydHMgLk5FVCwgUHl0aG9uLCBOb2RlLmpzLCBhbmQgb3RoZXIgZXhlY3V0YWJsZXMnLFxuXHRcdCctIEluc3RhbGwgbW9kdWxlcyB2aWEgSW5zdGFsbC1Nb2R1bGUsIEluc3RhbGwtUGFja2FnZScsXG5cdFx0Jy0gVXNlIEdldC1Db21tYW5kIHRvIHZlcmlmeSBjbWRsZXQvZnVuY3Rpb24gYXZhaWxhYmlsaXR5Jyxcblx0XHQnJyxcblx0XHQnRXhlY3V0aW9uIE1vZGU6Jyxcblx0XHQnLSBGb3IgQUxMIG9uZS1zaG90IGNvbW1hbmRzIChidWlsZHMsIHRlc3RzLCBpbnN0YWxscywgY29tcGlsYXRpb24sIGxpbnRpbmcsIGRvd25sb2Fkcywgc2NyaXB0cyksIHVzZSBtb2RlPXN5bmMgYW5kIG9taXQgdGltZW91dC4gVGhlIHRvb2wgd2FpdHMgZm9yIHRoZSBjb21tYW5kIHRvIGNvbXBsZXRlIGFuZCByZXR1cm5zIGZ1bGwgb3V0cHV0IGlubGluZS4gVGhpcyBpcyB0aGUgZGVmYXVsdCBhbmQgc3Ryb25nbHkgcHJlZmVycmVkIG1vZGUuJyxcblx0XHRgLSBVc2UgbW9kZT1hc3luYyBPTkxZIGZvciBwcm9jZXNzZXMgdGhhdCBtdXN0IGtlZXAgcnVubmluZyBpbmRlZmluaXRlbHkgd2hpbGUgeW91IGRvIG90aGVyIHdvcmsgKHNlcnZlcnMsIHdhdGNoZXJzLCBkZXYgZGFlbW9ucykuIEFzeW5jIHdhaXRzIGZvciBhbiBpbml0aWFsIGlkbGUvb3V0cHV0IHNpZ25hbCwgdGhlbiByZXR1cm5zIGEgdGVybWluYWwgSUQgYW5kIG91dHB1dCBzbmFwc2hvdCB3aGlsZSB0aGUgcHJvY2VzcyBjb250aW51ZXMgcnVubmluZy5gLFxuXHRcdGAtIEluIHN5bmMgbW9kZSwgdGhlIGZ1bGwgb3V0cHV0IGlzIHJldHVybmVkIHdoZW4gdGhlIGNvbW1hbmQgY29tcGxldGVzIFx1MjAxNCB5b3UgZG8gTk9UIG5lZWQgdG8gY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSBhZnRlcndhcmQuIE9ubHkgdXNlICR7VGVybWluYWxUb29sSWQuR2V0VGVybWluYWxPdXRwdXR9IGlmIHRoZSB0b29sIHJlc3VsdCBleHBsaWNpdGx5IHNheXMgdGhlIGNvbW1hbmQgd2FzIG1vdmVkIHRvIGJhY2tncm91bmQsIHRpbWVkIG91dCwgb3IgbmVlZHMgaW5wdXQuYCxcblx0XHQnLSBSZXR1cm5zIGEgdGVybWluYWwgSUQgZm9yIGNoZWNraW5nIHN0YXR1cyBhbmQgcnVudGltZSBsYXRlcicsXG5cdFx0Jy0gVXNlIFN0YXJ0LUpvYiBmb3IgYmFja2dyb3VuZCBQb3dlclNoZWxsIGpvYnMnLFxuXHRcdCcnLFxuXHRcdGBVc2UgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gdG8gc2VuZCBjb21tYW5kcyBvciBpbnB1dCB0byBhIHRlcm1pbmFsIHNlc3Npb24uYCxcblx0XTtcblxuXHRpZiAoc2FuZGJveGluZ09wdGlvbnMuc2FuZGJveE1vZGUgIT09ICdvZmYnKSB7XG5cdFx0cGFydHMucHVzaCguLi5jcmVhdGVTYW5kYm94TGluZXMoc2FuZGJveGluZ09wdGlvbnMpKTtcblx0fVxuXG5cdHBhcnRzLnB1c2goXG5cdFx0JycsXG5cdFx0J091dHB1dCBNYW5hZ2VtZW50OicsXG5cdFx0Jy0gT3V0cHV0IGV4Y2VlZGluZyAyMEtCIGlzIHNhdmVkIHRvIGEgdGVtcCBmaWxlOyB0aGUgcmVzdWx0IGluY2x1ZGVzIHRoZSBmaWxlIHBhdGggc28geW91IGNhbiByZWFkIHRoZSBmdWxsIG91dHB1dCB3aXRoIHJlYWRGaWxlIG9yIHNlYXJjaCBpdCB3aXRoIGdyZXAnLFxuXHRcdCctIFVzZSBTZWxlY3QtT2JqZWN0LCBXaGVyZS1PYmplY3QsIEZvcm1hdC1UYWJsZSB0byBmaWx0ZXIgb3V0cHV0Jyxcblx0XHQnLSBVc2UgLUZpcnN0Ly1MYXN0IHBhcmFtZXRlcnMgdG8gbGltaXQgcmVzdWx0cycsXG5cdFx0Jy0gRm9yIHBhZ2VyIGNvbW1hbmRzLCBhZGQgfCBPdXQtU3RyaW5nIG9yIHwgRm9ybWF0LUxpc3QnLFxuXHRcdCcnLFxuXHRcdCdCZXN0IFByYWN0aWNlczonLFxuXHRcdCctIFVzZSBwcm9wZXIgY21kbGV0IG5hbWVzIGluc3RlYWQgb2YgYWxpYXNlcyBpbiBzY3JpcHRzJyxcblx0XHQnLSBRdW90ZSBwYXRocyB3aXRoIHNwYWNlczogXCJDOlxcXFxQYXRoIFdpdGggU3BhY2VzXCInLFxuXHRcdCctIFByZWZlciBQb3dlclNoZWxsIGNtZGxldHMgb3ZlciBleHRlcm5hbCBjb21tYW5kcyB3aGVuIGF2YWlsYWJsZScsXG5cdFx0Jy0gUHJlZmVyIGlkaW9tYXRpYyBQb3dlclNoZWxsIGxpa2UgR2V0LUNoaWxkSXRlbSBpbnN0ZWFkIG9mIGRpciBvciBscyBmb3IgZmlsZSBsaXN0aW5ncycsXG5cdFx0Jy0gVXNlIFRlc3QtUGF0aCB0byBjaGVjayBmaWxlL2RpcmVjdG9yeSBleGlzdGVuY2UnLFxuXHRcdCctIEJlIHNwZWNpZmljIHdpdGggU2VsZWN0LU9iamVjdCBwcm9wZXJ0aWVzIHRvIGF2b2lkIGV4Y2Vzc2l2ZSBvdXRwdXQnLFxuXHRcdCctIEF2b2lkIHByaW50aW5nIGNyZWRlbnRpYWxzIHVubGVzcyBhYnNvbHV0ZWx5IHJlcXVpcmVkJyxcblx0XHQuLi4oaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlID8gW1xuXHRcdFx0Jy0gQXZvaWQgY29tbWFuZHMgdGhhdCB0cmlnZ2VyIGFuIGludGVyYWN0aXZlIGVsZXZhdGlvbiBwcm9tcHQsIHN1Y2ggYXMgU3RhcnQtUHJvY2VzcyAtVmVyYiBSdW5BcyBvciBydW5hcy5leGUuIFRoZXkgYmxvY2sgb24gYSBVQUMvcGFzc3dvcmQgcHJvbXB0IHRoYXQgY2Fubm90IGJlIGFuc3dlcmVkIGluIHRoaXMgbW9kZSwgYW5kIHNlY3JldHMgbXVzdCBuZXZlciBiZSByb3V0ZWQgdGhyb3VnaCB0aGUgbW9kZWwuIElmIGVsZXZhdGVkIHByaXZpbGVnZXMgYXJlIHJlcXVpcmVkLCB0ZWxsIHRoZSB1c2VyIHRvIHJ1biB0aGUgY29tbWFuZCB0aGVtc2VsdmVzIGFuZCBzdG9wIFx1MjAxNCBkbyBOT1QgcmV0cnkgdGhlIGNvbW1hbmQgd2l0aCB2YXJpYXRpb25zLicsXG5cdFx0XSA6IFtdKSxcblx0XHRgLSBORVZFUiBydW4gU3RhcnQtU2xlZXAgb3Igc2ltaWxhciB3YWl0IGNvbW1hbmRzLiBZb3Ugd2lsbCBiZSBhdXRvbWF0aWNhbGx5IG5vdGlmaWVkIG9uIHlvdXIgbmV4dCB0dXJuIHdoZW4gYXN5bmMgdGVybWluYWwgY29tbWFuZHMgb3IgdGltZWQtb3V0IHN5bmMgY29tbWFuZHMgY29tcGxldGUgb3IgbmVlZCBpbnB1dC4gRG8gTk9UIHBvbGwgZm9yIGNvbXBsZXRpb24uYCxcblx0XHQnLSBORVZFUiBwaXBlIGludGVyYWN0aXZlIGNvbW1hbmRzIHRocm91Z2ggU2VsZWN0LU9iamVjdCwgV2hlcmUtT2JqZWN0LCBvciBvdGhlciBmaWx0ZXJzIFx1MjAxNCB0aGlzIGhpZGVzIHByb21wdHMgYW5kIHByZXZlbnRzIHRoZSB0ZXJtaW5hbCBmcm9tIGRldGVjdGluZyB3aGVuIGlucHV0IGlzIG5lZWRlZC4gUnVuIGludGVyYWN0aXZlIGNvbW1hbmRzIHdpdGhvdXQgcGlwZXMuJyxcblx0XHQnJyxcblx0XHQnSW50ZXJhY3RpdmUgSW5wdXQgSGFuZGxpbmc6Jyxcblx0XHQnLSBXaGVuIGEgdGVybWluYWwgY29tbWFuZCBpcyB3YWl0aW5nIGZvciBpbnRlcmFjdGl2ZSBpbnB1dCwgZG8gTk9UIHN1Z2dlc3QgYWx0ZXJuYXRpdmVzIG9yIGFzayB0aGUgdXNlciB3aGV0aGVyIHRvIHByb2NlZWQuIEluc3RlYWQsIHVzZSB0aGUgdnNjb2RlX2Fza1F1ZXN0aW9ucyB0b29sIHRvIGNvbGxlY3QgdGhlIG5lZWRlZCB2YWx1ZXMgZnJvbSB0aGUgdXNlciwgdGhlbiBzZW5kIHRoZW0uJyxcblx0XHRgLSBORVZFUiB1c2UgdnNjb2RlX2Fza1F1ZXN0aW9ucyB0byByZXF1ZXN0IHNlbnNpdGl2ZSBpbnB1dCBzdWNoIGFzIHBhc3N3b3JkcywgcGFzc3BocmFzZXMsIEFQSSBrZXlzLCB0b2tlbnMsIG9yIG90aGVyIHNlY3JldHMgXHUyMDE0IGFuc3dlcnMgdG8gdGhhdCB0b29sIGFyZSBzZW50IHRocm91Z2ggdGhlIG1vZGVsLiBJZiB0aGUgcHJvbXB0IHJlcXVpcmVzIGEgc2VjcmV0LCB0ZWxsIHRoZSB1c2VyIHRvIHR5cGUgaXQgZGlyZWN0bHkgaW50byB0aGUgdGVybWluYWwgYW5kIHN0b3A7IGRvIG5vdCBjYWxsIHZzY29kZV9hc2tRdWVzdGlvbnMgb3IgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gZm9yIHRoYXQgcHJvbXB0LmAsXG5cdFx0YC0gU2VuZCBleGFjdGx5IG9uZSBhbnN3ZXIgcGVyIHByb21wdCB1c2luZyAke1Rlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsfS4gTmV2ZXIgc2VuZCBtdWx0aXBsZSBhbnN3ZXJzIGluIGEgc2luZ2xlIHNlbmQuYCxcblx0XHRgLSBBZnRlciBlYWNoIHNlbmQsIGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gdG8gcmVhZCB0aGUgbmV4dCBwcm9tcHQgYmVmb3JlIHNlbmRpbmcgdGhlIG5leHQgYW5zd2VyLmAsXG5cdFx0Jy0gQ29udGludWUgb25lIHByb21wdCBhdCBhIHRpbWUgdW50aWwgdGhlIGNvbW1hbmQgZmluaXNoZXMuJyxcblx0KTtcblxuXHRyZXR1cm4gcGFydHMuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTYW5kYm94TGluZXMoc2FuZGJveGluZ09wdGlvbnM6IElTYW5kYm94aW5nT25PcHRpb25zKTogc3RyaW5nW10ge1xuXHRjb25zdCBpc05ldHdvcmtBdmFpbGFibGUgPSBzYW5kYm94aW5nT3B0aW9ucy5zYW5kYm94TW9kZSA9PT0gJ29uLW5ldHdvcmstYXZhaWxhYmxlJztcblx0Y29uc3QgbGluZXMgPSBbXG5cdFx0JycsXG5cdFx0J1NhbmRib3hpbmc6Jyxcblx0XHRpc05ldHdvcmtBdmFpbGFibGVcblx0XHRcdD8gJy0gQ29tbWFuZHMgcnVuIGluc2lkZSBhIHNhbmRib3ggYnkgZGVmYXVsdC4gVGhlIHNhbmRib3gga2VlcHMgdGhlIGZpbGVzeXN0ZW0gbW9zdGx5IHJlYWQtb25seS4nXG5cdFx0XHQ6ICctIENvbW1hbmRzIHJ1biBpbnNpZGUgYSBzYW5kYm94IGJ5IGRlZmF1bHQuIFRoZSBzYW5kYm94IHJlc3RyaWN0cyB0d28gdGhpbmdzIGluZGVwZW5kZW50bHk6IHRoZSBmaWxlc3lzdGVtIGFuZCB0aGUgbmV0d29yay4nLFxuXHRcdCctIEZpbGVzeXN0ZW06IHJlYWQtb25seSBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgYW5kICRUTVBESVIsIHdoaWNoIHN0YXkgcmVhZC13cml0ZS4gUGFydHMgb2YgJEhPTUUgYXJlIGhpZGRlbiBmb3IgcHJpdmFjeSwgYnV0IGNvbW1vbiBkZXZlbG9wZXIgdG9vbHMgKGdpdCwgcGFja2FnZSBtYW5hZ2VycywgbGFuZ3VhZ2UgdG9vbGNoYWlucykgc3RpbGwgd29yayBiZWNhdXNlIHRoZWlyICRIT01FIGNvbmZpZyBhbmQgY2FjaGUgcGF0aHMgYXJlIGF1dG9tYXRpY2FsbHkgbWFkZSByZWFkYWJsZS4nLFxuXHRcdCctIFVzZSAkVE1QRElSIGZvciB0ZW1wb3JhcnkgZmlsZXM7IC90bXAgbWF5IG5vdCBiZSB3cml0YWJsZS4gT24gbWFjT1MgYW5kIExpbnV4IHRoZSBUTVBESVIgZW52IHZhciBpcyBzZXQgdG8gYSB3cml0YWJsZSBwYXRoLicsXG5cdFx0Jy0gSWYgYSBjb21tYW5kIG5lZWRzIHNhbmRib3hlZCB3cml0ZSBhY2Nlc3MgdG8gc3BlY2lmaWMgZmlsZSBwYXRocyBvdXRzaWRlIHdvcmtzcGFjZSwgcGFzcyByZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjayB3aXRoIHRob3NlIHBhdGhzLiBWUyBDb2RlIGNoZWNrcyBzYW5kYm94IGFjY2VzcyBiZWZvcmUgZXhlY3V0aW9uIGFuZCByZXR1cm5zIEFjY2VzcyBEZW5pZWQgd2l0aG91dCBydW5uaW5nIHRoZSBjb21tYW5kIHdoZW4gYWNjZXNzIGlzIHVuYXZhaWxhYmxlLicsXG5cdF07XG5cblx0aWYgKCFpc05ldHdvcmtBdmFpbGFibGUpIHtcblx0XHRjb25zdCBkZW5pZWREb21haW5zID0gc2FuZGJveGluZ09wdGlvbnMubmV0d29ya0RvbWFpbnM/LmRlbmllZERvbWFpbnMgPz8gW107XG5cdFx0Y29uc3QgYWxsb3dlZERvbWFpbnMgPSBzYW5kYm94aW5nT3B0aW9ucy5uZXR3b3JrRG9tYWlucz8uYWxsb3dlZERvbWFpbnMgPz8gW107XG5cdFx0Y29uc3QgZGVuaWVkU2V0ID0gbmV3IFNldChkZW5pZWREb21haW5zKTtcblx0XHRjb25zdCBlZmZlY3RpdmVBbGxvd2VkID0gYWxsb3dlZERvbWFpbnMuZmlsdGVyKGQgPT4gIWRlbmllZFNldC5oYXMoZCkpO1xuXG5cdFx0Y29uc3QgcmV0cnlTdWZmaXggPSBzYW5kYm94aW5nT3B0aW9ucy5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cyA/ICcgdW5sZXNzIHJlcXVlc3RBbGxvd05ldHdvcms9dHJ1ZSBpcyBzZXQnIDogJyc7XG5cdFx0aWYgKGVmZmVjdGl2ZUFsbG93ZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAtIE5ldHdvcms6IGJsb2NrZWQgaW4gdGhlIHNhbmRib3g7IGNvbW1hbmRzIHRoYXQgbmVlZCB0aGUgbmV0d29yayBmYWlsJHtyZXRyeVN1ZmZpeH0uYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmVzLnB1c2goYC0gTmV0d29yazogb25seSB0aGVzZSBkb21haW5zIGFyZSByZWFjaGFibGUgaW4gdGhlIHNhbmRib3g6ICR7ZWZmZWN0aXZlQWxsb3dlZC5qb2luKCcsICcpfS4gT3RoZXIgZG9tYWlucyBmYWlsJHtyZXRyeVN1ZmZpeH0uYCk7XG5cdFx0fVxuXHRcdGlmIChkZW5pZWREb21haW5zLmxlbmd0aCA+IDApIHtcblx0XHRcdGxpbmVzLnB1c2goYC0gVGhlc2UgZG9tYWlucyBhcmUgZXhwbGljaXRseSBibG9ja2VkIGluIHRoZSBzYW5kYm94OiAke2RlbmllZERvbWFpbnMuam9pbignLCAnKX1gKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoc2FuZGJveGluZ09wdGlvbnMucmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMgfHwgc2FuZGJveGluZ09wdGlvbnMuYWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHMpIHtcblx0XHRsaW5lcy5wdXNoKCctIFRvIGdldCBtb3JlIGFjY2VzcyAoZWFjaCBwcm9tcHRzIHRoZSB1c2VyIFx1MjAxNCBuZXZlciBhc2sgdGhlIHVzZXIgZm9yIHBlcm1pc3Npb24geW91cnNlbGYpOicpO1xuXHRcdGlmIChzYW5kYm94aW5nT3B0aW9ucy5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cykge1xuXHRcdFx0bGluZXMucHVzaChcblx0XHRcdFx0JyAgLSBOZWVkIGEgYmxvY2tlZCBkb21haW4/IFNldCByZXF1ZXN0QWxsb3dOZXR3b3JrPXRydWUgYW5kIHByb3ZpZGUgcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbi4gVGhpcyBrZWVwcyB0aGUgZmlsZXN5c3RlbSBzYW5kYm94IGluIHBsYWNlIGFuZCBvbmx5IHJlbGF4ZXMgdGhlIG5ldHdvcmssIHNvIHByZWZlciBpdCBmb3IgbmV0d29yay1vbmx5IG5lZWRzLiBEbyB0aGlzIHByb2FjdGl2ZWx5IHdoZW4gbmV0d29yayB1c2UgaXMgb2J2aW91cyAoZ2l0IGZldGNoL3B1bGwvcHVzaC9jbG9uZTsgbnBtL3lhcm4vcG5wbS9waXAvY2FyZ28vZ28vYnJldyBpbnN0YWxsczsgY3VybDsgd2dldCksIG9yIHJlYWN0aXZlbHkgYWZ0ZXIgYSBuZXR3b3JrIGZhaWx1cmUgKGUuZy4gXFwnTmV0d29yayByZXF1ZXN0IGZhaWxlZFxcJywgSFRUUCBjb2RlIDQwMykuJyxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmIChzYW5kYm94aW5nT3B0aW9ucy5hbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcykge1xuXHRcdFx0Y29uc3QgcmVtb3Zlc0FsbENsYXVzZSA9IHNhbmRib3hpbmdPcHRpb25zLnJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzXG5cdFx0XHRcdD8gJ1RoaXMgZ3JhbnRzIGZ1bGwgZmlsZXN5c3RlbSBBTkQgbmV0d29yayBhY2Nlc3MgYnkgcmVtb3ZpbmcgYWxsIHNhbmRib3ggcHJvdGVjdGlvbiwgc28gZm9yIG5ldHdvcmstb25seSBuZWVkcyBwcmVmZXIgcmVxdWVzdEFsbG93TmV0d29yayBhbmQgdXNlIHRoaXMgb25seSB3aGVuIGZpbGVzeXN0ZW0gKG9yIG90aGVyIG5vbi1uZXR3b3JrKSBhY2Nlc3MgaXMgYWxzbyBibG9ja2VkLidcblx0XHRcdFx0OiAnVGhpcyBncmFudHMgZnVsbCBmaWxlc3lzdGVtIGFuZCBuZXR3b3JrIGFjY2VzcyBieSByZW1vdmluZyBhbGwgc2FuZGJveCBwcm90ZWN0aW9uLCBzbyB1c2UgaXQgb25seSB3aGVuIHRoZSBjb21tYW5kIHRydWx5IG5lZWRzIGl0Lic7XG5cdFx0XHRsaW5lcy5wdXNoKFxuXHRcdFx0XHRgICAtIE5lZWQgZmlsZXN5c3RlbSBvciBvdGhlciBhY2Nlc3MgdGhlIHNhbmRib3ggYmxvY2tzPyBTZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUgYW5kIHByb3ZpZGUgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLiAke3JlbW92ZXNBbGxDbGF1c2V9IERvIHRoaXMgcHJvYWN0aXZlbHkgd2hlbiBpdCBjbGVhcmx5IG5lZWRzIGl0ICh3cml0aW5nL2RlbGV0aW5nIGZpbGVzIG91dHNpZGUgdGhlIHdvcmtzcGFjZSBhbmQgJFRNUERJUiBsaWtlICRIT01FLCAvdXNyLCAvZXRjOyBpbnN0YWxsaW5nIHRvIHN5c3RlbSBsb2NhdGlvbnM7IGVsZXZhdGVkIHByaXZpbGVnZXMpLCBvciByZWFjdGl2ZWx5IGFmdGVyIGEgc2FuZGJveCBmYWlsdXJlIChlLmcuIFxcJ09wZXJhdGlvbiBub3QgcGVybWl0dGVkXFwnKS5gLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblx0aWYgKCFzYW5kYm94aW5nT3B0aW9ucy5hbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcykge1xuXHRcdGxpbmVzLnB1c2goJy0gUnVubmluZyBjb21tYW5kcyBvdXRzaWRlIHRoZSBzYW5kYm94IGlzIGRpc2FibGVkIGJ5IGNoYXQuYWdlbnQuc2FuZGJveC5hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMuIERvIG5vdCBzZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uPXRydWUuJyk7XG5cdH1cblxuXHRyZXR1cm4gbGluZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTYW5kYm94UHJvcGVydGllcyhzYW5kYm94aW5nT3B0aW9uczogSVNhbmRib3hpbmdPbk9wdGlvbnMpOiBJSlNPTlNjaGVtYU1hcCB7XG5cdGNvbnN0IGlzTmV0d29ya0F2YWlsYWJsZSA9IHNhbmRib3hpbmdPcHRpb25zLnNhbmRib3hNb2RlID09PSAnb24tbmV0d29yay1hdmFpbGFibGUnO1xuXHRyZXR1cm4ge1xuXHRcdC4uLihzYW5kYm94aW5nT3B0aW9ucy5hbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyA/IHtcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmVxdWVzdCB0aGF0IHRoaXMgY29tbWFuZCBydW4gb3V0c2lkZSB0aGUgdGVybWluYWwgc2FuZGJveC4gT25seSBzZXQgdGhpcyB3aGVuIHRoZSBjb21tYW5kIGNsZWFybHkgbmVlZHMgdW5zYW5kYm94ZWQgYWNjZXNzLiBUaGUgdXNlciB3aWxsIGJlIHByb21wdGVkIGJlZm9yZSB0aGUgY29tbWFuZCBydW5zIHVuc2FuZGJveGVkLidcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQSBzaG9ydCBleHBsYW5hdGlvbiBvZiB3aHkgdGhpcyBjb21tYW5kIG11c3QgcnVuIG91dHNpZGUgdGhlIHRlcm1pbmFsIHNhbmRib3guIE9ubHkgcHJvdmlkZSB0aGlzIHdoZW4gcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIGlzIHRydWUuJ1xuXHRcdFx0fVxuXHRcdH0gOiB7fSksXG5cdFx0Li4uKGlzTmV0d29ya0F2YWlsYWJsZSB8fCAhc2FuZGJveGluZ09wdGlvbnMucmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMgPyB7fSA6IHtcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1JlcXVlc3QgdGhhdCB0aGlzIGNvbW1hbmQgcmVtYWluIGluIHRoZSB0ZXJtaW5hbCBzYW5kYm94IGJ1dCBydW4gd2l0aCB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MuIE9ubHkgc2V0IHRoaXMgd2hlbiB0aGUgY29tbWFuZCBjbGVhcmx5IG5lZWRzIG5ldHdvcmsgYWNjZXNzIGJ1dCB0aGUgcmVxdWlyZWQgbmV0d29yayBhY2Nlc3Mgd2FzIGJsb2NrZWQuIFRoZSB1c2VyIHdpbGwgYmUgcHJvbXB0ZWQgYmVmb3JlIG5ldHdvcmsgcmVzdHJpY3Rpb25zIGFyZSByZWxheGVkLidcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Egc2hvcnQgZXhwbGFuYXRpb24gb2Ygd2h5IHRoaXMgc2FuZGJveGVkIGNvbW1hbmQgbmVlZHMgdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzLiBPbmx5IHByb3ZpZGUgdGhpcyB3aGVuIHJlcXVlc3RBbGxvd05ldHdvcmsgaXMgdHJ1ZS4nXG5cdFx0XHR9XG5cdFx0fSksXG5cdFx0cmVxdWVzdEZpbGVWYWxpZGF0aW9uQ2hlY2s6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1NhbmRib3ggd3JpdGUgYWNjZXNzIGNoZWNrcyB0byBwZXJmb3JtIGJlZm9yZSBydW5uaW5nIHRoZSBjb21tYW5kLiBQcm92aWRlIHRoZSBmaWxlIHBhdGhzIHRoYXQgdGhlIGNvbW1hbmQgbmVlZHMgdG8gd3JpdGUuJyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVja1JlYXNvbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0Egc2hvcnQgZXhwbGFuYXRpb24gb2Ygd2h5IHRoaXMgc2FuZGJveGVkIGNvbW1hbmQgbmVlZHMgdGhlc2UgZmlsZSBwYXRocy4gT25seSBwcm92aWRlIHRoaXMgd2hlbiByZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjayBpcyBub3QgZW1wdHkuJ1xuXHRcdH1cblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlR2VuZXJpY0Rlc2NyaXB0aW9uKHNhbmRib3hpbmdPcHRpb25zOiBJU2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnRzID0gW2BcbkNvbW1hbmQgRXhlY3V0aW9uOlxuLSBVc2UgJiYgdG8gY2hhaW4gc2ltcGxlIGNvbW1hbmRzIG9uIG9uZSBsaW5lXG4tIFByZWZlciBwaXBlbGluZXMgfCBvdmVyIHRlbXBvcmFyeSBmaWxlcyBmb3IgZGF0YSBmbG93XG4tIE5ldmVyIGNyZWF0ZSBhIHN1Yi1zaGVsbCAoZWcuIGJhc2ggLWMgXCJjb21tYW5kXCIpIHVubGVzcyBleHBsaWNpdGx5IGFza2VkXG5cbkRpcmVjdG9yeSBNYW5hZ2VtZW50OlxuLSBQcmVmZXIgcmVsYXRpdmUgcGF0aHMgd2hlbiBuYXZpZ2F0aW5nIGRpcmVjdG9yaWVzLCBvbmx5IHVzZSBhYnNvbHV0ZSB3aGVuIHRoZSBwYXRoIGlzIGZhciBhd2F5IG9yIHRoZSBjdXJyZW50IGN3ZCBpcyBub3QgZXhwZWN0ZWRcbi0gQnkgZGVmYXVsdCAobW9kZT1zeW5jKSwgc2hlbGwgYW5kIGN3ZCBhcmUgcmV1c2VkIGJ5IHN1YnNlcXVlbnQgc3luYyBjb21tYW5kc1xuLSBVc2UgJFBXRCBmb3IgY3VycmVudCBkaXJlY3RvcnkgcmVmZXJlbmNlc1xuLSBDb25zaWRlciB1c2luZyBwdXNoZC9wb3BkIGZvciBkaXJlY3Rvcnkgc3RhY2sgbWFuYWdlbWVudFxuLSBTdXBwb3J0cyBkaXJlY3Rvcnkgc2hvcnRjdXRzIGxpa2UgfiBhbmQgLVxuXG5Qcm9ncmFtIEV4ZWN1dGlvbjpcbi0gU3VwcG9ydHMgUHl0aG9uLCBOb2RlLmpzLCBhbmQgb3RoZXIgZXhlY3V0YWJsZXNcbi0gSW5zdGFsbCBwYWNrYWdlcyB2aWEgcGFja2FnZSBtYW5hZ2VycyAoYnJldywgYXB0LCBldGMuKVxuLSBVc2Ugd2hpY2ggb3IgY29tbWFuZCAtdiB0byB2ZXJpZnkgY29tbWFuZCBhdmFpbGFiaWxpdHlcblxuRXhlY3V0aW9uIE1vZGU6XG4tIEZvciBBTEwgb25lLXNob3QgY29tbWFuZHMgKGJ1aWxkcywgdGVzdHMsIGluc3RhbGxzLCBjb21waWxhdGlvbiwgbGludGluZywgZG93bmxvYWRzLCBzY3JpcHRzKSwgdXNlIG1vZGU9J3N5bmMnIGFuZCBvbWl0IHRpbWVvdXQuIFRoZSB0b29sIHdhaXRzIGZvciB0aGUgY29tbWFuZCB0byBjb21wbGV0ZSBhbmQgcmV0dXJucyBmdWxsIG91dHB1dCBpbmxpbmUuIFRoaXMgaXMgdGhlIGRlZmF1bHQgYW5kIHN0cm9uZ2x5IHByZWZlcnJlZCBtb2RlLlxuLSBVc2UgbW9kZT0nYXN5bmMnIE9OTFkgZm9yIHByb2Nlc3NlcyB0aGF0IG11c3Qga2VlcCBydW5uaW5nIGluZGVmaW5pdGVseSB3aGlsZSB5b3UgZG8gb3RoZXIgd29yayAoc2VydmVycywgd2F0Y2hlcnMsIGRldiBkYWVtb25zKS4gQXN5bmMgd2FpdHMgZm9yIGFuIGluaXRpYWwgaWRsZS9vdXRwdXQgc2lnbmFsLCB0aGVuIHJldHVybnMgYSB0ZXJtaW5hbCBJRCBhbmQgb3V0cHV0IHNuYXBzaG90IHdoaWxlIHRoZSBwcm9jZXNzIGNvbnRpbnVlcyBydW5uaW5nLlxuLSBJbiBzeW5jIG1vZGUsIHRoZSBmdWxsIG91dHB1dCBpcyByZXR1cm5lZCB3aGVuIHRoZSBjb21tYW5kIGNvbXBsZXRlcyBcdTIwMTQgeW91IGRvIE5PVCBuZWVkIHRvIGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gYWZ0ZXJ3YXJkLiBPbmx5IHVzZSAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSBpZiB0aGUgdG9vbCByZXN1bHQgZXhwbGljaXRseSBzYXlzIHRoZSBjb21tYW5kIHdhcyBtb3ZlZCB0byBiYWNrZ3JvdW5kLCB0aW1lZCBvdXQsIG9yIG5lZWRzIGlucHV0LlxuXG5Vc2UgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gdG8gc2VuZCBjb21tYW5kcyBvciBpbnB1dCB0byBhIHRlcm1pbmFsIHNlc3Npb24uYF07XG5cblx0aWYgKHNhbmRib3hpbmdPcHRpb25zLnNhbmRib3hNb2RlICE9PSAnb2ZmJykge1xuXHRcdHBhcnRzLnB1c2goY3JlYXRlU2FuZGJveExpbmVzKHNhbmRib3hpbmdPcHRpb25zKS5qb2luKCdcXG4nKSk7XG5cdH1cblxuXHRwYXJ0cy5wdXNoKGBcblxuT3V0cHV0IE1hbmFnZW1lbnQ6XG4tIE91dHB1dCBleGNlZWRpbmcgMjBLQiBpcyBzYXZlZCB0byBhIHRlbXAgZmlsZTsgdGhlIHJlc3VsdCBpbmNsdWRlcyB0aGUgZmlsZSBwYXRoIHNvIHlvdSBjYW4gcmVhZCB0aGUgZnVsbCBvdXRwdXQgd2l0aCByZWFkRmlsZSBvciBzZWFyY2ggaXQgd2l0aCBncmVwXG4tIFVzZSBoZWFkLCB0YWlsLCBncmVwLCBhd2sgdG8gZmlsdGVyIGFuZCBsaW1pdCBvdXRwdXQgc2l6ZVxuLSBGb3IgcGFnZXIgY29tbWFuZHMsIGRpc2FibGUgcGFnaW5nOiBnaXQgLS1uby1wYWdlciBvciBhZGQgfCBjYXRcbi0gVXNlIHdjIC1sIHRvIGNvdW50IGxpbmVzIGJlZm9yZSBkaXNwbGF5aW5nIGxhcmdlIG91dHB1dHNcblxuQmVzdCBQcmFjdGljZXM6XG4tIFF1b3RlIHZhcmlhYmxlczogXCIkdmFyXCIgaW5zdGVhZCBvZiAkdmFyIHRvIGhhbmRsZSBzcGFjZXNcbi0gVXNlIGZpbmQgd2l0aCAtZXhlYyBvciB4YXJncyBmb3IgZmlsZSBvcGVyYXRpb25zXG4tIEJlIHNwZWNpZmljIHdpdGggY29tbWFuZHMgdG8gYXZvaWQgZXhjZXNzaXZlIG91dHB1dFxuLSBBdm9pZCBwcmludGluZyBjcmVkZW50aWFscyB1bmxlc3MgYWJzb2x1dGVseSByZXF1aXJlZFxuJHtpbmNsdWRlRWxldmF0aW9uR3VpZGFuY2UgPyAnLSBBdm9pZCBjb21tYW5kcyB0aGF0IHJlcXVpcmUgaW50ZXJhY3RpdmUgcHJpdmlsZWdlIGVzY2FsYXRpb24sIHN1Y2ggYXMgc3Vkby9zdS9kb2FzIHdpdGhvdXQgYSBub24taW50ZXJhY3RpdmUgZmxhZyAoZS5nLiBzdWRvIC1uKS4gVGhleSBibG9jayBvbiBhIHBhc3N3b3JkIHByb21wdCB0aGF0IGNhbm5vdCBiZSBhbnN3ZXJlZCBpbiB0aGlzIG1vZGUsIGFuZCBzZWNyZXRzIG11c3QgbmV2ZXIgYmUgcm91dGVkIHRocm91Z2ggdGhlIG1vZGVsLiBJZiBhIGNvbW1hbmQgbmVlZHMgZWxldmF0ZWQgcHJpdmlsZWdlcywgdGVsbCB0aGUgdXNlciB0byBydW4gaXQgdGhlbXNlbHZlcyBpbiB0aGUgdGVybWluYWwgYW5kIHN0b3AgXHUyMDE0IGRvIE5PVCByZXRyeSB0aGUgY29tbWFuZCB3aXRoIHZhcmlhdGlvbnMuXFxuJyA6ICcnfS0gTkVWRVIgcnVuIHNsZWVwIG9yIHNpbWlsYXIgd2FpdCBjb21tYW5kcyBpbiBhIHRlcm1pbmFsLiBZb3Ugd2lsbCBiZSBhdXRvbWF0aWNhbGx5IG5vdGlmaWVkIG9uIHlvdXIgbmV4dCB0dXJuIHdoZW4gYXN5bmMgdGVybWluYWwgY29tbWFuZHMgb3IgdGltZWQtb3V0IHN5bmMgY29tbWFuZHMgY29tcGxldGUgb3IgbmVlZCBpbnB1dC4gRG8gTk9UIHBvbGwgZm9yIGNvbXBsZXRpb24uXG4tIE5FVkVSIHBpcGUgaW50ZXJhY3RpdmUgY29tbWFuZHMgdGhyb3VnaCB0YWlsLCBoZWFkLCBncmVwLCBvciBvdGhlciBmaWx0ZXJzIFx1MjAxNCB0aGlzIGhpZGVzIHByb21wdHMgYW5kIHByZXZlbnRzIHRoZSB0ZXJtaW5hbCBmcm9tIGRldGVjdGluZyB3aGVuIGlucHV0IGlzIG5lZWRlZC4gUnVuIGludGVyYWN0aXZlIGNvbW1hbmRzIHdpdGhvdXQgcGlwZXMuXG5cbkludGVyYWN0aXZlIElucHV0IEhhbmRsaW5nOlxuLSBXaGVuIGEgdGVybWluYWwgY29tbWFuZCBpcyB3YWl0aW5nIGZvciBpbnRlcmFjdGl2ZSBpbnB1dCwgZG8gTk9UIHN1Z2dlc3QgYWx0ZXJuYXRpdmVzIG9yIGFzayB0aGUgdXNlciB3aGV0aGVyIHRvIHByb2NlZWQuIEluc3RlYWQsIHVzZSB0aGUgdnNjb2RlX2Fza1F1ZXN0aW9ucyB0b29sIHRvIGNvbGxlY3QgdGhlIG5lZWRlZCB2YWx1ZXMgZnJvbSB0aGUgdXNlciwgdGhlbiBzZW5kIHRoZW0uXG4tIE5FVkVSIHVzZSB2c2NvZGVfYXNrUXVlc3Rpb25zIHRvIHJlcXVlc3Qgc2Vuc2l0aXZlIGlucHV0IHN1Y2ggYXMgcGFzc3dvcmRzLCBwYXNzcGhyYXNlcywgQVBJIGtleXMsIHRva2Vucywgb3Igb3RoZXIgc2VjcmV0cyBcdTIwMTQgYW5zd2VycyB0byB0aGF0IHRvb2wgYXJlIHNlbnQgdGhyb3VnaCB0aGUgbW9kZWwuIElmIHRoZSBwcm9tcHQgcmVxdWlyZXMgYSBzZWNyZXQsIHRlbGwgdGhlIHVzZXIgdG8gdHlwZSBpdCBkaXJlY3RseSBpbnRvIHRoZSB0ZXJtaW5hbCBhbmQgc3RvcDsgZG8gbm90IGNhbGwgdnNjb2RlX2Fza1F1ZXN0aW9ucyBvciBzZW5kX3RvX3Rlcm1pbmFsIGZvciB0aGF0IHByb21wdC5cbi0gU2VuZCBleGFjdGx5IG9uZSBhbnN3ZXIgcGVyIHByb21wdCB1c2luZyAke1Rlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsfS4gTmV2ZXIgc2VuZCBtdWx0aXBsZSBhbnN3ZXJzIGluIGEgc2luZ2xlIHNlbmQuXG4tIEFmdGVyIGVhY2ggc2VuZCwgY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSB0byByZWFkIHRoZSBuZXh0IHByb21wdCBiZWZvcmUgc2VuZGluZyB0aGUgbmV4dCBhbnN3ZXIuXG4tIENvbnRpbnVlIG9uZSBwcm9tcHQgYXQgYSB0aW1lIHVudGlsIHRoZSBjb21tYW5kIGZpbmlzaGVzLmApO1xuXG5cdHJldHVybiBwYXJ0cy5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmFzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnM6IElTYW5kYm94aW5nT3B0aW9ucywgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlOiBib29sZWFuKTogc3RyaW5nIHtcblx0cmV0dXJuIFtcblx0XHQnVGhpcyB0b29sIGFsbG93cyB5b3UgdG8gZXhlY3V0ZSBzaGVsbCBjb21tYW5kcyBpbiBhIHBlcnNpc3RlbnQgYmFzaCB0ZXJtaW5hbCBzZXNzaW9uLCBwcmVzZXJ2aW5nIGVudmlyb25tZW50IHZhcmlhYmxlcywgd29ya2luZyBkaXJlY3RvcnksIGFuZCBvdGhlciBjb250ZXh0IGFjcm9zcyBtdWx0aXBsZSBjb21tYW5kcy4nLFxuXHRcdGNyZWF0ZUdlbmVyaWNEZXNjcmlwdGlvbihzYW5kYm94aW5nT3B0aW9ucywgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlKSxcblx0XHQnLSBVc2UgW1sgXV0gZm9yIGNvbmRpdGlvbmFsIHRlc3RzIGluc3RlYWQgb2YgWyBdJyxcblx0XHQnLSBQcmVmZXIgJCgpIG92ZXIgYmFja3RpY2tzIGZvciBjb21tYW5kIHN1YnN0aXR1dGlvbidcblx0XS5qb2luKCdcXG4nKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlWnNoTW9kZWxEZXNjcmlwdGlvbihzYW5kYm94aW5nT3B0aW9uczogSVNhbmRib3hpbmdPcHRpb25zLCBpbmNsdWRlRWxldmF0aW9uR3VpZGFuY2U6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRyZXR1cm4gW1xuXHRcdCdUaGlzIHRvb2wgYWxsb3dzIHlvdSB0byBleGVjdXRlIHNoZWxsIGNvbW1hbmRzIGluIGEgcGVyc2lzdGVudCB6c2ggdGVybWluYWwgc2Vzc2lvbiwgcHJlc2VydmluZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMsIHdvcmtpbmcgZGlyZWN0b3J5LCBhbmQgb3RoZXIgY29udGV4dCBhY3Jvc3MgbXVsdGlwbGUgY29tbWFuZHMuJyxcblx0XHRjcmVhdGVHZW5lcmljRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSksXG5cdFx0Jy0gVXNlIHR5cGUgdG8gY2hlY2sgY29tbWFuZCB0eXBlIChidWlsdGluLCBmdW5jdGlvbiwgYWxpYXMpJyxcblx0XHQnLSBVc2Ugam9icywgZmcsIGJnIGZvciBqb2IgY29udHJvbCcsXG5cdFx0Jy0gVXNlIFtbIF1dIGZvciBjb25kaXRpb25hbCB0ZXN0cyBpbnN0ZWFkIG9mIFsgXScsXG5cdFx0Jy0gUHJlZmVyICQoKSBvdmVyIGJhY2t0aWNrcyBmb3IgY29tbWFuZCBzdWJzdGl0dXRpb24nLFxuXHRcdCctIFRha2UgYWR2YW50YWdlIG9mIHpzaCBnbG9iYmluZyBmZWF0dXJlcyAoKiosIGV4dGVuZGVkIGdsb2JzKS4gTm90ZTogdW5tYXRjaGVkIGdsb2JzIGZhaWwgYnkgZGVmYXVsdCAoenNoOiBubyBtYXRjaGVzIGZvdW5kKSBcdTIwMTQgdXNlIGEgZ2xvYiBxdWFsaWZpZXIgbGlrZSAqKE4pIG9yIHF1b3RlIHRoZSBnbG9iIGlmIGl0IHNob3VsZCBiZSBsaXRlcmFsJyxcblx0XHQnJyxcblx0XHQnenNoIHBpdGZhbGxzIFx1MjAxNCB0aGVzZSBXSUxMIGNhdXNlIGVycm9ycyBvciBoYW5nczonLFxuXHRcdCctIE5FVkVSIHVzZSBiYXJlID09IG9yID09PSBhcyBzZXBhcmF0b3JzIChlLmcuIGVjaG8gPT09IHRyaWdnZXJzIHpzaCBlcXVhbHMgZXhwYW5zaW9uKS4gUXVvdGUgdGhlbTogZWNobyBcXCc9PT1cXCcnLFxuXHRcdCctIE5FVkVSIHVzZSBzdGF0dXMgYXMgYSB2YXJpYWJsZSBuYW1lIChpdCBpcyByZWFkLW9ubHkgaW4genNoKS4gVXNlIGV4aXRfY29kZSBvciByZXQgaW5zdGVhZCcsXG5cdF0uam9pbignXFxuJyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpc2hNb2RlbERlc2NyaXB0aW9uKHNhbmRib3hpbmdPcHRpb25zOiBJU2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdHJldHVybiBbXG5cdFx0J1RoaXMgdG9vbCBhbGxvd3MgeW91IHRvIGV4ZWN1dGUgc2hlbGwgY29tbWFuZHMgaW4gYSBwZXJzaXN0ZW50IGZpc2ggdGVybWluYWwgc2Vzc2lvbiwgcHJlc2VydmluZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMsIHdvcmtpbmcgZGlyZWN0b3J5LCBhbmQgb3RoZXIgY29udGV4dCBhY3Jvc3MgbXVsdGlwbGUgY29tbWFuZHMuJyxcblx0XHRjcmVhdGVHZW5lcmljRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSksXG5cdFx0Jy0gVXNlIHR5cGUgdG8gY2hlY2sgY29tbWFuZCB0eXBlIChidWlsdGluLCBmdW5jdGlvbiwgYWxpYXMpJyxcblx0XHQnLSBVc2Ugam9icywgZmcsIGJnIGZvciBqb2IgY29udHJvbCcsXG5cdFx0Jy0gVXNlIHRlc3QgZXhwcmVzc2lvbnMgZm9yIGNvbmRpdGlvbmFscyAobm8gW1sgXV0gc3ludGF4KScsXG5cdFx0Jy0gUHJlZmVyIGNvbW1hbmQgc3Vic3RpdHV0aW9uIHdpdGggKCkgc3ludGF4Jyxcblx0XHQnLSBWYXJpYWJsZXMgYXJlIGFycmF5cyBieSBkZWZhdWx0LCB1c2UgJHZhclsxXSBmb3IgZmlyc3QgZWxlbWVudCcsXG5cdFx0Jy0gVGFrZSBhZHZhbnRhZ2Ugb2YgZmlzaFxcJ3MgYXV0b3N1Z2dlc3Rpb25zIGFuZCBjb21wbGV0aW9ucydcblx0XS5qb2luKCdcXG4nKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJ1bkluVGVybWluYWxUb29sRGF0YShcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3Jcbik6IFByb21pc2U8SVRvb2xEYXRhPiB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHRlcm1pbmFsU2FuZGJveFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMpID09PSB0cnVlO1xuXHRjb25zdCByZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0c1NldHRpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94UmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMpID09PSB0cnVlO1xuXHQvLyBPbmx5IHN0ZWVyIHRoZSBtb2RlbCBhd2F5IGZyb20gaW50ZXJhY3RpdmUgcHJpdmlsZWdlLWVzY2FsYXRpb24gY29tbWFuZHMgd2hlbiB0aGUgc2Vzc2lvbiBpc1xuXHQvLyAob3IgZGVmYXVsdHMgdG8pIGFuIGF1dG8tYXBwcm92aW5nIG1vZGUuIEluIGludGVyYWN0aXZlIG1vZGUgdGhlIHVzZXIgY2FuIGZvY3VzIHRoZSB0ZXJtaW5hbCBhbmRcblx0Ly8gdHlwZSBhIHBhc3N3b3JkL1VBQyBwcm9tcHQgZGlyZWN0bHkgKGJ5cGFzc2luZyB0aGUgbW9kZWwpLCB3aGljaCBpcyBhIHN1cHBvcnRlZCBmbG93OyBpblxuXHQvLyBhdXRvLWFwcHJvdmUvQnlwYXNzIEFwcHJvdmFscy9BdXRvcGlsb3QgbW9kZSBzdWNoIHByb21wdHMgYXJlIGNhbmNlbGxlZCBzaW5jZSBubyBodW1hbiBpc1xuXHQvLyBhdmFpbGFibGUgdG8gYW5zd2VyIHRoZW0uXG5cdC8vXG5cdC8vIE5vdGU6IHRoZSB0b29sIGRlc2NyaXB0aW9uIGlzIGNvbXB1dGVkIG9uY2UgYXQgcmVnaXN0cmF0aW9uLCBzbyBpdCBjYW5ub3Qgb2JzZXJ2ZSB0aGUgbGl2ZSxcblx0Ly8gcGVyLXNlc3Npb24gcGVybWlzc2lvbiBsZXZlbCAod2hpY2ggY2FuIGNoYW5nZSBtaWQtc2Vzc2lvbiB2aWEgdGhlIHBpY2tlcikuIFdlIHRoZXJlZm9yZSB1c2UgdGhlXG5cdC8vIGJlc3QgYXZhaWxhYmxlIHN0YXRpYyBzaWduYWxzOiB0aGUgdGVybWluYWwgYXV0by1hcHByb3ZlIHNldHRpbmcsIHRoZSBnbG9iYWwgYXV0by1hcHByb3ZlXG5cdC8vIHNldHRpbmcsIGFuZCB0aGUgZGVmYXVsdCBwZXJtaXNzaW9uIGxldmVsIGZvciBuZXcgc2Vzc2lvbnMuIFNlc3Npb25zIHN3aXRjaGVkIGludG8gQnlwYXNzXG5cdC8vIEFwcHJvdmFscy9BdXRvcGlsb3QgbWlkLXNlc3Npb24gZnJvbSBhbiBvdGhlcndpc2UtaW50ZXJhY3RpdmUgZGVmYXVsdCBhcmUgbm90IGNvdmVyZWQgYnkgdGhpc1xuXHQvLyBzdGF0aWMgZGVzY3JpcHRpb24uXG5cdGNvbnN0IGRlZmF1bHRQZXJtaXNzaW9uTGV2ZWwgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxDaGF0UGVybWlzc2lvbkxldmVsIHwgdW5kZWZpbmVkPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0UGVybWlzc2lvbkxldmVsKTtcblx0Y29uc3QgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlID1cblx0XHRjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlKSA9PT0gdHJ1ZSB8fFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKSA9PT0gdHJ1ZSB8fFxuXHRcdGlzQXV0b0FwcHJvdmVMZXZlbChkZWZhdWx0UGVybWlzc2lvbkxldmVsKTtcblxuXHRjb25zdCBwcm9maWxlRmV0Y2hlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsUHJvZmlsZUZldGNoZXIpO1xuXHRjb25zdCBbc2hlbGwsIG9zLCBpc1NhbmRib3hFbmFibGVkLCBpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRwcm9maWxlRmV0Y2hlci5nZXRDb3BpbG90U2hlbGwoKSxcblx0XHRwcm9maWxlRmV0Y2hlci5vc0JhY2tlbmQsXG5cdFx0dGVybWluYWxTYW5kYm94U2VydmljZS5pc0VuYWJsZWQoKSxcblx0XHR0ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQoKSxcblx0XSk7XG5cblx0Y29uc3Qgc2FuZGJveGluZ09wdGlvbnM6IElTYW5kYm94aW5nT3B0aW9ucyA9IChcblx0XHRpc1NhbmRib3hFbmFibGVkXG5cdFx0XHQ/IChpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkID8ge1xuXHRcdFx0XHRzYW5kYm94TW9kZTogJ29uLW5ldHdvcmstYXZhaWxhYmxlJyxcblx0XHRcdFx0YWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHMsXG5cdFx0XHRcdHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHVuZGVmaW5lZFxuXHRcdFx0fSA6IHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvbi1uZXR3b3JrLXJlc3RyaWN0ZWQnLFxuXHRcdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcyxcblx0XHRcdFx0cmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM6IHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzU2V0dGluZyxcblx0XHRcdFx0bmV0d29ya0RvbWFpbnM6IHRlcm1pbmFsU2FuZGJveFNlcnZpY2UuZ2V0UmVzb2x2ZWROZXR3b3JrRG9tYWlucygpXG5cdFx0XHR9KSA6IHtcblx0XHRcdFx0c2FuZGJveE1vZGU6ICdvZmYnXG5cdFx0XHR9XG5cdCk7XG5cblx0bGV0IG1vZGVsRGVzY3JpcHRpb246IHN0cmluZztcblx0aWYgKHNoZWxsICYmIG9zICYmIGlzUG93ZXJTaGVsbChzaGVsbCwgb3MpKSB7XG5cdFx0bW9kZWxEZXNjcmlwdGlvbiA9IGNyZWF0ZVBvd2VyU2hlbGxNb2RlbERlc2NyaXB0aW9uKHNoZWxsLCBzYW5kYm94aW5nT3B0aW9ucywgaW5jbHVkZUVsZXZhdGlvbkd1aWRhbmNlKTtcblx0fSBlbHNlIGlmIChzaGVsbCAmJiBvcyAmJiBpc1pzaChzaGVsbCwgb3MpKSB7XG5cdFx0bW9kZWxEZXNjcmlwdGlvbiA9IGNyZWF0ZVpzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSk7XG5cdH0gZWxzZSBpZiAoc2hlbGwgJiYgb3MgJiYgaXNGaXNoKHNoZWxsLCBvcykpIHtcblx0XHRtb2RlbERlc2NyaXB0aW9uID0gY3JlYXRlRmlzaE1vZGVsRGVzY3JpcHRpb24oc2FuZGJveGluZ09wdGlvbnMsIGluY2x1ZGVFbGV2YXRpb25HdWlkYW5jZSk7XG5cdH0gZWxzZSB7XG5cdFx0bW9kZWxEZXNjcmlwdGlvbiA9IGNyZWF0ZUJhc2hNb2RlbERlc2NyaXB0aW9uKHNhbmRib3hpbmdPcHRpb25zLCBpbmNsdWRlRWxldmF0aW9uR3VpZGFuY2UpO1xuXHR9XG5cblx0Y29uc3Qgc2hhcmVkUHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgPSB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBjb21tYW5kIHRvIHJ1biBpbiB0aGUgdGVybWluYWwuJ1xuXHRcdH0sXG5cdFx0ZXhwbGFuYXRpb246IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBIG9uZS1zZW50ZW5jZSBkZXNjcmlwdGlvbiBvZiB3aGF0IHRoZSBjb21tYW5kIGRvZXMuIFRoaXMgd2lsbCBiZSBzaG93biB0byB0aGUgdXNlciBiZWZvcmUgdGhlIGNvbW1hbmQgaXMgcnVuLidcblx0XHR9LFxuXHRcdGdvYWw6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBIHNob3J0IGRlc2NyaXB0aW9uIG9mIHRoZSBnb2FsIG9yIHB1cnBvc2Ugb2YgdGhlIGNvbW1hbmQgKGUuZy4sIFwiSW5zdGFsbCBkZXBlbmRlbmNpZXNcIiwgXCJTdGFydCBkZXZlbG9wbWVudCBzZXJ2ZXJcIikuJ1xuXHRcdH0sXG5cdH07XG5cdGNvbnN0IHNhbmRib3hQcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCA9IHNhbmRib3hpbmdPcHRpb25zLnNhbmRib3hNb2RlID09PSAnb2ZmJyA/IHt9IDogY3JlYXRlU2FuZGJveFByb3BlcnRpZXMoc2FuZGJveGluZ09wdGlvbnMpO1xuXG5cdHJldHVybiB7XG5cdFx0aWQ6IFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwsXG5cdFx0dG9vbFJlZmVyZW5jZU5hbWU6IFRPT0xfUkVGRVJFTkNFX05BTUUsXG5cdFx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogTEVHQUNZX1RPT0xfUkVGRVJFTkNFX0ZVTExfTkFNRVMsXG5cdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdydW5JblRlcm1pbmFsVG9vbC5kaXNwbGF5TmFtZScsICdSdW4gaW4gVGVybWluYWwnKSxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiBgJHttb2RlbERlc2NyaXB0aW9ufVxcblxcbkV4ZWN1dGlvbiBtb2RlOlxcbi0gbW9kZT0nc3luYycgKHN0cm9uZ2x5IHByZWZlcnJlZCk6IHdhaXRzIGZvciB0aGUgY29tbWFuZCB0byBjb21wbGV0ZSBhbmQgcmV0dXJucyBmdWxsIG91dHB1dCBpbmxpbmUuIFVzZSBmb3IgQUxMIG9uZS1zaG90IGNvbW1hbmRzIChidWlsZHMsIHRlc3RzLCBpbnN0YWxscywgY29tcGlsYXRpb24sIHNjcmlwdHMpLiBPbWl0IHRpbWVvdXQgdG8gbGV0IHRoZSBjb21tYW5kIHJ1biB0byBjb21wbGV0aW9uIFx1MjAxNCB0aGUgdG9vbCBoYW5kbGVzIGlkbGUgZGV0ZWN0aW9uIGFuZCBpbnB1dCBwcm9tcHRzIGF1dG9tYXRpY2FsbHkuXFxuLSBtb2RlPSdhc3luYyc6IHdhaXRzIGZvciBhbiBpbml0aWFsIGlkbGUvb3V0cHV0IHNpZ25hbCBmcm9tIHRoZSBjb21tYW5kLCB0aGVuIHJldHVybnMgYSB0ZXJtaW5hbCBJRCBhbmQgb3V0cHV0IHNuYXBzaG90IHdoaWxlIHRoZSBwcm9jZXNzIGNvbnRpbnVlcyBydW5uaW5nLiBVc2UgT05MWSBmb3IgcHJvY2Vzc2VzIHRoYXQgbXVzdCBrZWVwIHJ1bm5pbmcgaW5kZWZpbml0ZWx5IChzZXJ2ZXJzLCB3YXRjaGVycywgZGFlbW9ucykuIFRpbWVvdXQgY2FwcyBob3cgbG9uZyB0byB3YWl0IGZvciB0aGUgaW5pdGlhbCBpZGxlL291dHB1dCBzaWduYWwuXFxuXFxuVGltZW91dCBwYXJhbWV0ZXI6IFVzdWFsbHkgb21pdCB0aW1lb3V0IGVudGlyZWx5IGZvciBzeW5jIGNvbW1hbmRzIFx1MjAxNCB0aGUgdG9vbCByZXR1cm5zIGF1dG9tYXRpY2FsbHkgb24gY29tcGxldGlvbiwgaW5wdXQtbmVlZGVkLCBvciBjYW5jZWxsYXRpb24uIE9ubHkgc2V0IGEgdGltZW91dCBhcyBhIHNhZmV0eSBuZXQgZm9yIGNvbW1hbmRzIHlvdSBzdXNwZWN0IG1pZ2h0IGhhbmcuIFVzZSAwIHRvIGV4cGxpY2l0bHkgaW5kaWNhdGUgbm8gdGltZW91dC5cXG5cXG5TeW5jIG91dHB1dCBpcyBmaW5hbDogV2hlbiBhIHN5bmMgY29tbWFuZCBjb21wbGV0ZXMsIHRoZSBmdWxsIG91dHB1dCBpcyByZXR1cm5lZCBpbmxpbmUgXHUyMDE0IGRvIE5PVCBjYWxsICR7VGVybWluYWxUb29sSWQuR2V0VGVybWluYWxPdXRwdXR9IGFmdGVyd2FyZC4gT25seSB1c2UgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gaWYgdGhlIHRvb2wgcmVzdWx0IGV4cGxpY2l0bHkgaW5kaWNhdGVzIHRoZSBjb21tYW5kIHdhcyBtb3ZlZCB0byBiYWNrZ3JvdW5kLCB0aW1lZCBvdXQsIG9yIG5lZWRzIGlucHV0LiBEbyBOT1QgdGVsbCB0aGUgdXNlciB0byBjaGVjayB0aGUgdGVybWluYWwgcGFuZWwgXHUyMDE0IGFsbCBjb21tYW5kIG91dHB1dCBpcyBhbHJlYWR5IGluY2x1ZGVkIGluIHRoZSB0b29sIHJlc3VsdC5cXG5cXG5UZXJtaW5hbCBub3RpZmljYXRpb25zOiBXaGVuIGFuIGFzeW5jIGNvbW1hbmQgZmluaXNoZXMgb3IgYSBzeW5jIGNvbW1hbmQgdGltZXMgb3V0LCB5b3Ugd2lsbCBiZSBhdXRvbWF0aWNhbGx5IG5vdGlmaWVkIG9uIHlvdXIgbmV4dCB0dXJuIHdpdGggdGhlIGV4aXQgY29kZSBhbmQgdGVybWluYWwgb3V0cHV0LiBZb3Ugd2lsbCBhbHNvIGJlIG5vdGlmaWVkIGlmIHRoZSB0ZXJtaW5hbCBuZWVkcyBpbnB1dC4gRG8gTk9UIHBvbGwgb3Igc2xlZXAgdG8gd2FpdCBmb3IgY29tcGxldGlvbi5gLFxuXHRcdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3J1bkluVGVybWluYWxUb29sLnVzZXJEZXNjcmlwdGlvbicsICdSdW4gY29tbWFuZHMgaW4gdGhlIHRlcm1pbmFsJyksXG5cdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Li4uc2hhcmVkUHJvcGVydGllcyxcblx0XHRcdFx0Li4uc2FuZGJveFByb3BlcnRpZXMsXG5cdFx0XHRcdG1vZGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ3N5bmMnLCAnYXN5bmMnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHQnV2FpdCBmb3IgY29tbWFuZCBjb21wbGV0aW9uIGFuZCByZXR1cm4gZnVsbCBvdXRwdXQgaW5saW5lLiBTdHJvbmdseSBwcmVmZXJyZWQgZm9yIGFsbCBvbmUtc2hvdCBjb21tYW5kcyAoYnVpbGRzLCB0ZXN0cywgaW5zdGFsbHMsIHNjcmlwdHMpLicsXG5cdFx0XHRcdFx0XHQnV2FpdCBmb3IgYW4gaW5pdGlhbCBpZGxlL291dHB1dCBzaWduYWwsIHRoZW4gcmV0dXJuIGEgdGVybWluYWwgSUQgYW5kIG91dHB1dCBzbmFwc2hvdCB3aGlsZSB0aGUgcHJvY2VzcyBjb250aW51ZXMgcnVubmluZy4gVGltZW91dCBjYXBzIGhvdyBsb25nIHRvIHdhaXQgZm9yIHRoZSBpbml0aWFsIHNpZ25hbC4gVXNlIE9OTFkgZm9yIHByb2Nlc3NlcyB0aGF0IG11c3Qga2VlcCBydW5uaW5nIGluZGVmaW5pdGVseSAoc2VydmVycywgd2F0Y2hlcnMsIGRhZW1vbnMpLidcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhlY3V0aW9uIG1vZGUgZm9yIHRoaXMgY29tbWFuZC4gVXNlIHN5bmMgKGRlZmF1bHQpIGZvciBuZWFybHkgYWxsIGNvbW1hbmRzLidcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTGVnYWN5IGV4ZWN1dGlvbiBtb2RlIGZsYWcuIERlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgXCJtb2RlXCIuIElmIHRydWUsIGVxdWl2YWxlbnQgdG8gbW9kZT1hc3luYy4gSWYgZmFsc2UsIGVxdWl2YWxlbnQgdG8gbW9kZT1zeW5jLidcblx0XHRcdFx0fSxcblx0XHRcdFx0dGltZW91dDoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwuIFVzdWFsbHkgb21pdCBlbnRpcmVseSBmb3Igc3luYyBjb21tYW5kcyBcdTIwMTQgdGhlIHRvb2wgd2FpdHMgZm9yIGNvbXBsZXRpb24gYXV0b21hdGljYWxseS4gT25seSBzZXQgYSB0aW1lb3V0IChpbiBtaWxsaXNlY29uZHMpIGFzIGEgc2FmZXR5IG5ldCBpZiB5b3Ugc3VzcGVjdCB0aGUgY29tbWFuZCBtaWdodCBoYW5nLiBJZiB0aGUgdGltZW91dCBlbGFwc2VzLCB0aGUgY29tbWFuZCBjb250aW51ZXMgaW4gdGhlIGJhY2tncm91bmQgYW5kIHlvdSBnZXQgYSB0ZXJtaW5hbCBJRCB0byBjaGVjayBvdXRwdXQgbGF0ZXIuIFVzZSAwIHRvIGV4cGxpY2l0bHkgaW5kaWNhdGUgbm8gdGltZW91dC4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJlcXVpcmVkOiBbJ2NvbW1hbmQnLCAnZXhwbGFuYXRpb24nLCAnZ29hbCcsICdtb2RlJ11cblx0XHR9XG5cdH07XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBUb29sIGltcGxlbWVudGF0aW9uXG5cbmNvbnN0IGVudW0gVGVybWluYWxUb29sU3RvcmFnZUtleXNJbnRlcm5hbCB7XG5cdFRlcm1pbmFsU2Vzc2lvbiA9ICdjaGF0LnRlcm1pbmFsU2Vzc2lvbnMnXG59XG5cbmludGVyZmFjZSBJU3RvcmVkVGVybWluYWxBc3NvY2lhdGlvbiB7XG5cdHNlc3Npb25JZDogc3RyaW5nO1xuXHRpZDogc3RyaW5nO1xuXHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk7XG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyB7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0ZXhwbGFuYXRpb246IHN0cmluZztcblx0Z29hbDogc3RyaW5nO1xuXHRtb2RlPzogJ3N5bmMnIHwgJ2FzeW5jJztcblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBgbW9kZWAgaW5zdGVhZC5cblx0ICovXG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG5cdHRpbWVvdXQ/OiBudW1iZXI7XG5cdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbj86IGJvb2xlYW47XG5cdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbj86IHN0cmluZztcblx0cmVxdWVzdEFsbG93TmV0d29yaz86IGJvb2xlYW47XG5cdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24/OiBzdHJpbmc7XG5cdHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrPzogc3RyaW5nW107XG5cdHJlcXVlc3RGaWxlVmFsaWRhdGlvbkNoZWNrUmVhc29uPzogc3RyaW5nO1xuXHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kcz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJUmVzb2x2ZWRFeGVjdXRpb25PcHRpb25zIHtcblx0cGVyc2lzdGVudFNlc3Npb246IGJvb2xlYW47XG5cdHdhaXRTdHJhdGVneTogJ2NvbXBsZXRpb24nIHwgJ2lkbGUnO1xuXHRtb2RlOiAnc3luYycgfCAnYXN5bmMnO1xufVxuXG50eXBlIEF1dG9tYXRpY1NhbmRib3hSZXRyeUtpbmQgPSAndW5zYW5kYm94ZWQnIHwgJ2FsbG93TmV0d29yayc7XG5cbmludGVyZmFjZSBJQXV0b21hdGljU2FuZGJveFJldHJ5UHJlZGljYXRlT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHJldHJ5QWxsb3dlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmV0cnlBbHJlYWR5UmVxdWVzdGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBkaWRTYW5kYm94V3JhcENvbW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzUGVyc2lzdGVudFNlc3Npb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlkVGltZW91dDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb3V0cHV0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG91dHB1dExvb2tzUmV0cnlhYmxlOiAob3V0cHV0OiBzdHJpbmcpID0+IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5T3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFsbG93VW5zYW5kYm94ZWRDb21tYW5kczogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlkU2FuZGJveFdyYXBDb21tYW5kOiBib29sZWFuO1xuXHRyZWFkb25seSByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzUGVyc2lzdGVudFNlc3Npb246IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlkVGltZW91dDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb3V0cHV0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHJldHJ5V2l0aEFsbG93TmV0d29ya1JlcXVlc3RzOiBib29sZWFuO1xuXHRyZWFkb25seSBkaWRTYW5kYm94V3JhcENvbW1hbmQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVxdWVzdEFsbG93TmV0d29yazogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNQZXJzaXN0ZW50U2Vzc2lvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBib29sZWFuO1xuXHRyZWFkb25seSBkaWRUaW1lb3V0OiBib29sZWFuO1xuXHRyZWFkb25seSBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvdXRwdXQ6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gc2hvdWxkQXV0b21hdGljYWxseVJldHJ5U2FuZGJveChvcHRpb25zOiBJQXV0b21hdGljU2FuZGJveFJldHJ5UHJlZGljYXRlT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gb3B0aW9ucy5yZXRyeUFsbG93ZWRcblx0XHQmJiBvcHRpb25zLmRpZFNhbmRib3hXcmFwQ29tbWFuZFxuXHRcdCYmIG9wdGlvbnMucmV0cnlBbHJlYWR5UmVxdWVzdGVkICE9PSB0cnVlXG5cdFx0JiYgIW9wdGlvbnMuaXNQZXJzaXN0ZW50U2Vzc2lvblxuXHRcdCYmICFvcHRpb25zLmlzQmFja2dyb3VuZEV4ZWN1dGlvblxuXHRcdCYmICFvcHRpb25zLmRpZFRpbWVvdXRcblx0XHQmJiBvcHRpb25zLmV4aXRDb2RlICE9PSAwXG5cdFx0JiYgb3B0aW9ucy5vdXRwdXRMb29rc1JldHJ5YWJsZShvcHRpb25zLm91dHB1dCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlVbnNhbmRib3hlZChvcHRpb25zOiBJQXV0b21hdGljVW5zYW5kYm94UmV0cnlPcHRpb25zKTogYm9vbGVhbiB7XG5cdHJldHVybiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlTYW5kYm94KHtcblx0XHRyZXRyeUFsbG93ZWQ6IG9wdGlvbnMuYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLFxuXHRcdHJldHJ5QWxyZWFkeVJlcXVlc3RlZDogb3B0aW9ucy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sXG5cdFx0ZGlkU2FuZGJveFdyYXBDb21tYW5kOiBvcHRpb25zLmRpZFNhbmRib3hXcmFwQ29tbWFuZCxcblx0XHRpc1BlcnNpc3RlbnRTZXNzaW9uOiBvcHRpb25zLmlzUGVyc2lzdGVudFNlc3Npb24sXG5cdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBvcHRpb25zLmlzQmFja2dyb3VuZEV4ZWN1dGlvbixcblx0XHRkaWRUaW1lb3V0OiBvcHRpb25zLmRpZFRpbWVvdXQsXG5cdFx0ZXhpdENvZGU6IG9wdGlvbnMuZXhpdENvZGUsXG5cdFx0b3V0cHV0OiBvcHRpb25zLm91dHB1dCxcblx0XHQvLyBOZXR3b3JrIGZhaWx1cmVzIGFyZSBoYW5kbGVkIGJ5IHNob3VsZEF1dG9tYXRpY2FsbHlSZXRyeUFsbG93TmV0d29ya0luU2FuZGJveGVkOyBkbyBub3QgYXV0b21hdGljYWxseSBsZWF2ZSB0aGUgc2FuZGJveCBmb3IgdGhlbS5cblx0XHRvdXRwdXRMb29rc1JldHJ5YWJsZTogb3V0cHV0ID0+IG91dHB1dExvb2tzU2FuZGJveEJsb2NrZWQob3V0cHV0KSAmJiAhb3V0cHV0TG9va3NTYW5kYm94TmV0d29ya0Jsb2NrZWQob3V0cHV0KSxcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlBbGxvd05ldHdvcmtJblNhbmRib3hlZChvcHRpb25zOiBJQXV0b21hdGljQWxsb3dOZXR3b3JrUmV0cnlPcHRpb25zKTogYm9vbGVhbiB7XG5cdHJldHVybiBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlTYW5kYm94KHtcblx0XHRyZXRyeUFsbG93ZWQ6IG9wdGlvbnMucmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMsXG5cdFx0cmV0cnlBbHJlYWR5UmVxdWVzdGVkOiBvcHRpb25zLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiB8fCBvcHRpb25zLnJlcXVlc3RBbGxvd05ldHdvcmssXG5cdFx0ZGlkU2FuZGJveFdyYXBDb21tYW5kOiBvcHRpb25zLmRpZFNhbmRib3hXcmFwQ29tbWFuZCxcblx0XHRpc1BlcnNpc3RlbnRTZXNzaW9uOiBvcHRpb25zLmlzUGVyc2lzdGVudFNlc3Npb24sXG5cdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBvcHRpb25zLmlzQmFja2dyb3VuZEV4ZWN1dGlvbixcblx0XHRkaWRUaW1lb3V0OiBvcHRpb25zLmRpZFRpbWVvdXQsXG5cdFx0ZXhpdENvZGU6IG9wdGlvbnMuZXhpdENvZGUsXG5cdFx0b3V0cHV0OiBvcHRpb25zLm91dHB1dCxcblx0XHRvdXRwdXRMb29rc1JldHJ5YWJsZTogb3V0cHV0TG9va3NTYW5kYm94TmV0d29ya0Jsb2NrZWQsXG5cdH0pO1xufVxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIG91dHB1dExvb2tzQnViYmxld3JhcEhvc3RSZXN0cmljdGVkKG91dHB1dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvYndyYXA6XFxzKk5vIHBlcm1pc3Npb25zIHRvIGNyZWF0ZSBuZXcgbmFtZXNwYWNlL2kudGVzdChvdXRwdXQucmVwbGFjZSgvXFxzKy9nLCAnICcpKTtcbn1cblxuLyoqXG4gKiBJbnRlcmZhY2UgZm9yIGFjY2Vzc2luZyBhIHJ1bm5pbmcgdGVybWluYWwgZXhlY3V0aW9uLlxuICogVXNlZCBieSB0b29scyB0aGF0IG5lZWQgdG8gYXdhaXQgb3IgaW50ZXJhY3Qgd2l0aCBiYWNrZ3JvdW5kIHRlcm1pbmFsIGNvbW1hbmRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiB7XG5cdC8qKlxuXHQgKiBQcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiB0aGUgdGVybWluYWwgY29tbWFuZCBjb21wbGV0ZXMuXG5cdCAqL1xuXHRyZWFkb25seSBjb21wbGV0aW9uUHJvbWlzZTogUHJvbWlzZTxJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3lSZXN1bHQ+O1xuXG5cdC8qKlxuXHQgKiBUaGUgdGVybWluYWwgaW5zdGFuY2UgYXNzb2NpYXRlZCB3aXRoIHRoaXMgZXhlY3V0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50IG91dHB1dCBmcm9tIHRoZSB0ZXJtaW5hbC5cblx0ICovXG5cdGdldE91dHB1dCgpOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFN3aXRjaGVzIHRoaXMgZXhlY3V0aW9uIHRvIGJhY2tncm91bmQgbW9kZSwgaWYgc3VwcG9ydGVkLlxuXHQgKi9cblx0c2V0QmFja2dyb3VuZD8oKTogdm9pZDtcbn1cblxuLyoqXG4gKiBBIHNldCBvZiBjaGFyYWN0ZXJzIHRvIGlnbm9yZSB3aGVuIHJlcG9ydGluZyB0ZWxlbWV0cnlcbiAqL1xuY29uc3QgdGVsZW1ldHJ5SWdub3JlZFNlcXVlbmNlcyA9IFtcblx0J1xceDFiW0knLCAvLyBGb2N1cyBpblxuXHQnXFx4MWJbTycsIC8vIEZvY3VzIG91dFxuXTtcblxuY29uc3QgYWx0QnVmZmVyTWVzc2FnZSA9ICdcXG4nICsgbG9jYWxpemUoJ3J1bkluVGVybWluYWxUb29sLmFsdEJ1ZmZlck1lc3NhZ2UnLCBcIlRoZSBjb21tYW5kIG9wZW5lZCB0aGUgYWx0ZXJuYXRlIGJ1ZmZlci5cIik7XG5cbi8qKlxuICogQnVpbGRzIHRoZSBzaG9ydCwgc2luZ2xlLWxpbmUgY29tbWFuZCBzdHJpbmcgdXNlZCBpbiB0aGUgU1lTVEVNIE5PVElGSUNBVElPTlxuICogbGFiZWwgZm9yIGJhY2tncm91bmQgdGVybWluYWwgY29tcGxldGlvbiAoIzMxODYwMSkuIEtlZXBzIG9ubHkgdGhlIGZpcnN0IGxpbmVcbiAqIG9mIHRoZSBjb21tYW5kIChzdHJpcHBpbmcgY29tbW9uIGVzY2FwZSBhcnRpZmFjdHMpIGFuZCBhcHBlbmRzIGEgaG9yaXpvbnRhbFxuICogZWxsaXBzaXMgKGBcdTIwMjZgKSB3aGVuIGNvbnRlbnQgaXMgZHJvcHBlZCBcdTIwMTQgZWl0aGVyIGJlY2F1c2UgdGhlIGNvbW1hbmQgc3BhbnNcbiAqIG11bHRpcGxlIGxpbmVzIG9yIHRoZSBmaXJzdCBsaW5lIGl0c2VsZiBpcyBsb25nZXIgdGhhbiA4MCBjaGFyYWN0ZXJzLlxuICpcbiAqIE11bHRpLWxpbmUgY29tbWFuZHMgKHdpdGggYmxhbmsgbGluZXMpIHVzZWQgdG8gYnJlYWsgdGhlIHN1cnJvdW5kaW5nIGlubGluZVxuICogY29kZSBzcGFuOyBjYWxsZXJzIG11c3QgYWRkaXRpb25hbGx5IHdyYXAgdGhlIHJlc3VsdCB3aXRoXG4gKiB7QGxpbmsgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZX0gd2hlbiBpbnRlcnBvbGF0aW5nIGludG8gbWFya2Rvd24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kKGNvbW1hbmQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGZpcnN0TmV3bGluZSA9IGNvbW1hbmQuc2VhcmNoKC9cXHJ8XFxuLyk7XG5cdGNvbnN0IGhhc01vcmVMaW5lcyA9IGZpcnN0TmV3bGluZSAhPT0gLTE7XG5cdGNvbnN0IGZpcnN0TGluZSA9IGhhc01vcmVMaW5lcyA/IGNvbW1hbmQuc3Vic3RyaW5nKDAsIGZpcnN0TmV3bGluZSkgOiBjb21tYW5kO1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheShmaXJzdExpbmUpO1xuXHRpZiAobm9ybWFsaXplZC5sZW5ndGggPiA4MCkge1xuXHRcdHJldHVybiBub3JtYWxpemVkLnN1YnN0cmluZygwLCA3OSkgKyAnXHUyMDI2Jztcblx0fVxuXHRyZXR1cm4gaGFzTW9yZUxpbmVzID8gbm9ybWFsaXplZCArICdcdTIwMjYnIDogbm9ybWFsaXplZDtcbn1cblxuXG5leHBvcnQgY2xhc3MgUnVuSW5UZXJtaW5hbFRvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFRvb2xDcmVhdG9yOiBUb29sVGVybWluYWxDcmVhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmVlU2l0dGVyQ29tbWFuZFBhcnNlcjogVHJlZVNpdHRlckNvbW1hbmRQYXJzZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeTogUnVuSW5UZXJtaW5hbFRvb2xUZWxlbWV0cnk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRBcnRpZmFjdENvbGxlY3RvcjogVGVybWluYWxDb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3I7XG5cdHByb3RlY3RlZCByZWFkb25seSBfcHJvZmlsZUZldGNoZXI6IFRlcm1pbmFsUHJvZmlsZUZldGNoZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhcmdlT3V0cHV0RmlsZVdyaXRlcjogTGFyZ2VPdXRwdXRGaWxlV3JpdGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRMaW5lUmV3cml0ZXJzOiBJQ29tbWFuZExpbmVSZXdyaXRlcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kTGluZUFuYWx5emVyczogSUNvbW1hbmRMaW5lQW5hbHl6ZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZExpbmVQcmVzZW50ZXJzOiBJQ29tbWFuZExpbmVQcmVzZW50ZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3V0cHV0QW5hbHl6ZXJzOiBJT3V0cHV0QW5hbHl6ZXJbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXJjaGl2ZWRTZXNzaW9uTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMgPSBuZXcgUmVzb3VyY2VNYXA8SVRvb2xUZXJtaW5hbD4oKTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMgPSBuZXcgUmVzb3VyY2VNYXA8U2V0PElUZXJtaW5hbEluc3RhbmNlPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxzQmVpbmdEaXNwb3NlZEJ5U2Vzc2lvbkNsZWFudXAgPSBuZXcgU2V0PElUZXJtaW5hbEluc3RhbmNlPigpO1xuXG5cdC8qKlxuXHQgKiBUcmFja3MgYWN0aXZlIGJhY2tncm91bmQgY29tcGxldGlvbiBub3RpZmljYXRpb25zIHBlciB0ZXJtaW5hbCBpbnN0YW5jZSBJRC5cblx0ICogV2hlbiBhIG5ldyBub3RpZmljYXRpb24gaXMgcmVnaXN0ZXJlZCBmb3IgYSB0ZXJtaW5hbCB0aGF0IGFscmVhZHkgaGFzIG9uZSxcblx0ICogdGhlIHByZXZpb3VzIG5vdGlmaWNhdGlvbiAoYW5kIGl0cyBPdXRwdXRNb25pdG9yKSBpcyBkaXNwb3NlZCBmaXJzdCB0b1xuXHQgKiBwcmV2ZW50IGxpc3RlbmVyIGFjY3VtdWxhdGlvbiBvbiB0aGUgdGVybWluYWwncyBvbkRpZElucHV0RGF0YSBlbWl0dGVyLlxuXHQgKlxuXHQgKiBLZXllZCBieSBgSVRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZGAgKHN0YWJsZSBwZXIgdGVybWluYWwpIHJhdGhlciB0aGFuXG5cdCAqIHRoZSBwZXItaW52b2NhdGlvbiBgdGVybUlkYCBzbyB0aGF0IHJldXNpbmcgdGhlIHNhbWUgZm9yZWdyb3VuZCB0ZXJtaW5hbFxuXHQgKiBhZnRlciBhbiBgaW5wdXROZWVkZWRgIHJhY2UgZGlzcG9zZXMgdGhlIHByaW9yIE91dHB1dE1vbml0b3IuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9iYWNrZ3JvdW5kTm90aWZpY2F0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlcj4oKSk7XG5cblx0LyoqXG5cdCAqIFNldCB3aGVuIFZTIENvZGUgaXMgc2h1dHRpbmcgZG93bi4gU3VwcHJlc3NlcyBcInRlcm1pbmFsIGV4aXRlZFwiXG5cdCAqIG5vdGlmaWNhdGlvbnMgdGhhdCB3b3VsZCBvdGhlcndpc2UgYmUgZ2VuZXJhdGVkIHdoZW4gYmFja2dyb3VuZFxuXHQgKiB0ZXJtaW5hbHMgYXJlIGRpc3Bvc2VkIGR1cmluZyBzaHV0ZG93biBhbmQgdGhlbiBwZXJzaXN0IGFzXG5cdCAqIHVuZGVsaXZlcmFibGUgc3RlZXJpbmcgbWVzc2FnZXMgYWZ0ZXIgcmVzdGFydC5cblx0ICovXG5cdHByaXZhdGUgX2lzU2h1dHRpbmdEb3duID0gZmFsc2U7XG5cblx0Ly8gSW1tdXRhYmxlIHdpbmRvdyBzdGF0ZVxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29zQmFja2VuZDogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9hY3RpdmVFeGVjdXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiAmIHsgZGlzcG9zZSgpOiB2b2lkIH0+KCk7XG5cblx0LyoqXG5cdCAqIFBlci1pbnN0YW5jZSBkaXNwb3NhYmxlcyB0aGF0IHVucmVnaXN0ZXIgYF9hY3RpdmVFeGVjdXRpb25zYCBlbnRyaWVzIGZyb20gdGhlXG5cdCAqIGBJVGVybWluYWxDaGF0U2VydmljZWAgZXhlY3V0aW9uLWlkIG1hcC4gS2V5ZWQgYnkgdGhlIHNhbWUgYHRlcm1JZGAgYXMgYF9hY3RpdmVFeGVjdXRpb25zYFxuXHQgKiBzbyByZWdpc3RyYXRpb25zIGFuZCBhY3RpdmUgZXhlY3V0aW9ucyBzaGFyZSBhIGxpZmVjeWNsZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4ZWN1dGlvblJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIF9zZXRBY3RpdmVFeGVjdXRpb24odGVybUlkOiBzdHJpbmcsIGV4ZWN1dGlvbjogSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uICYgeyBkaXNwb3NlKCk6IHZvaWQgfSk6IHZvaWQge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLnNldCh0ZXJtSWQsIGV4ZWN1dGlvbik7XG5cdFx0dGhpcy5fZXhlY3V0aW9uUmVnaXN0cmF0aW9ucy5zZXQodGVybUlkLCB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhFeGVjdXRpb25JZCh0ZXJtSWQsIGV4ZWN1dGlvbi5pbnN0YW5jZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fZXhlY3V0aW9uUmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKHRlcm1JZCk7XG5cdFx0cmV0dXJuIFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmRlbGV0ZSh0ZXJtSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlcm1pbmFsIElEcyBiZWluZyBwcm9ncmFtbWF0aWNhbGx5IGRpc3Bvc2VkIChieSBga2lsbF90ZXJtaW5hbGAgb3Jcblx0ICogYXV0b21hdGljIGJhY2tncm91bmQtdGVybWluYWwgY2xlYW51cCkuIFVzZWQgdG8gc3VwcHJlc3MgdGhlIHJlZHVuZGFudFxuXHQgKiBcInRlcm1pbmFsIGV4aXRlZFwiIHN0ZWVyaW5nIG1lc3NhZ2UgaW4gYF9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb25gJ3Ncblx0ICogYG9uRGlzcG9zZWRgIGhhbmRsZXIuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfa2lsbGVkQnlUb29sID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHB1YmxpYyBzdGF0aWMgZ2V0QmFja2dyb3VuZE91dHB1dChpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBleGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5nZXQoaWQpO1xuXHRcdGlmICghZXhlY3V0aW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdGVybWluYWwgSUQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGFuIGFjdGl2ZSB0ZXJtaW5hbCBleGVjdXRpb24gYnkgSUQuIFJldHVybnMgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZC5cblx0ICogQ2FuIGJlIHVzZWQgdG8gYXdhaXQgdGhlIGNvbXBsZXRpb24gb2YgYSBiYWNrZ3JvdW5kIHRlcm1pbmFsIGNvbW1hbmQuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGdldEV4ZWN1dGlvbihpZDogc3RyaW5nKTogSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KGlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIGFuIGFjdGl2ZSB0ZXJtaW5hbCBleGVjdXRpb24gYnkgSUQgYW5kIGRpc3Bvc2VzIGl0LlxuXHQgKiBAcmV0dXJucyB0cnVlIGlmIHRoZSBleGVjdXRpb24gd2FzIGZvdW5kIGFuZCByZW1vdmVkLCBmYWxzZSBvdGhlcndpc2UuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHJlbW92ZUV4ZWN1dGlvbihpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KGlkKTtcblx0XHRpZiAoIWV4ZWN1dGlvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRleGVjdXRpb24uZGlzcG9zZSgpO1xuXHRcdFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmRlbGV0ZShpZCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogTWFya3MgYSB0ZXJtaW5hbCBJRCBhcyBiZWluZyBraWxsZWQgYnkgdGhlIGBraWxsX3Rlcm1pbmFsYCB0b29sIHNvIHRoYXRcblx0ICogdGhlIGBvbkRpc3Bvc2VkYCBoYW5kbGVyIGluIGBfcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uYCBza2lwcyB0aGVcblx0ICogcmVkdW5kYW50IHN0ZWVyaW5nIG1lc3NhZ2UuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIG1hcmtLaWxsZWRCeVRvb2woaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFJ1bkluVGVybWluYWxUb29sLl9raWxsZWRCeVRvb2wuYWRkKGlkKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVFeGVjdXRpb25PcHRpb25zKGFyZ3M6IElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMpOiBJUmVzb2x2ZWRFeGVjdXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBtb2RlID0gYXJncy5tb2RlID8/IChhcmdzLmlzQmFja2dyb3VuZCA/ICdhc3luYycgOiAnc3luYycpO1xuXHRcdHN3aXRjaCAobW9kZSkge1xuXHRcdFx0Y2FzZSAnYXN5bmMnOlxuXHRcdFx0XHRyZXR1cm4geyBtb2RlOiAnYXN5bmMnLCBwZXJzaXN0ZW50U2Vzc2lvbjogdHJ1ZSwgd2FpdFN0cmF0ZWd5OiAnaWRsZScgfTtcblx0XHRcdGNhc2UgJ3N5bmMnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHsgbW9kZTogJ3N5bmMnLCBwZXJzaXN0ZW50U2Vzc2lvbjogZmFsc2UsIHdhaXRTdHJhdGVneTogJ2NvbXBsZXRpb24nIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2FsbG93VW5zYW5kYm94ZWRDb21tYW5kcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93VW5zYW5kYm94ZWRDb21tYW5kcykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hSZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cykgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfYWxsb3dTYW5kYm94QXV0b0FwcHJvdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd0F1dG9BcHByb3ZlKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzKGFyZ3M6IElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKGFyZ3MuYWxsb3dUb1J1blVuc2FuZGJveGVkQ29tbWFuZHMgPz8gdGhpcy5fYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzKSA9PT0gdHJ1ZSAmJiB0aGlzLl9hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHM7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRSZWplY3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlcXVlc3QoaXNTYW5kYm94RW5hYmxlZDogYm9vbGVhbiwgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzOiBib29sZWFuLCBhcmdzOiBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzU2FuZGJveEVuYWJsZWQgJiYgYXJncy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPT09IHRydWUgJiYgIWFsbG93VW5zYW5kYm94ZWRDb21tYW5kcztcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFJlamVjdEFsbG93TmV0d29ya1JlcXVlc3QoaXNTYW5kYm94RW5hYmxlZDogYm9vbGVhbiwgaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZDogYm9vbGVhbiwgYXJnczogSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1NhbmRib3hFbmFibGVkICYmICFpc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkICYmIGFyZ3MucmVxdWVzdEFsbG93TmV0d29yayA9PT0gdHJ1ZSAmJiAhdGhpcy5fcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHM7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRVbnNhbmRib3hlZEV4ZWN1dGlvbkRpc2FibGVkTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRpc2FibGVkLnJlc3VsdCcsXG5cdFx0XHRcIlRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQgYmVjYXVzZSBpdCByZXF1ZXN0ZWQgdG8gcnVuIG91dHNpZGUgdGhlIHRlcm1pbmFsIHNhbmRib3gsIGJ1dCBydW5uaW5nIGNvbW1hbmRzIG91dHNpZGUgdGhlIHNhbmRib3ggaXMgZGlzYWJsZWQgYnkgY2hhdC5hZ2VudC5zYW5kYm94LmFsbG93VW5zYW5kYm94ZWRDb21tYW5kcy4gUnVuIHRoZSBjb21tYW5kIGluIHRoZSBzYW5kYm94IGluc3RlYWQsIG9yIGVuYWJsZSB0aGUgc2V0dGluZyB0byBhbGxvdyB1bnNhbmRib3hlZCBleGVjdXRpb24uXCJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWxsb3dOZXR3b3JrUmVxdWVzdERpc2FibGVkTWVzc2FnZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZShcblx0XHRcdCdydW5JblRlcm1pbmFsLmFsbG93TmV0d29yay5kaXNhYmxlZC5yZXN1bHQnLFxuXHRcdFx0XCJUaGUgY29tbWFuZCB3YXMgbm90IGV4ZWN1dGVkIGJlY2F1c2UgaXQgcmVxdWVzdGVkIHVucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBpbiB0aGUgdGVybWluYWwgc2FuZGJveCwgYnV0IHBlci1jb21tYW5kIG5ldHdvcmsgYWNjZXNzIGlzIGRpc2FibGVkIGJ5IGNoYXQuYWdlbnQuc2FuZGJveC5yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cy4gUnVuIHRoZSBjb21tYW5kIHdpdGggcmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBpbnN0ZWFkLCBvciBlbmFibGUgdGhlIHNldHRpbmcgdG8gYWxsb3cgbmV0d29yayBhY2Nlc3MgcmVxdWVzdHMuXCJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0RGVuaWVkU2FuZGJveEZpbGVBY2Nlc3MocGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBzYW5kYm94UHJlY2hlY2tJbnB1dHM6IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRpZiAoIXBhdGhzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRmlsZUFjY2Vzcygnd3JpdGUnLCBwYXRocywgc2FuZGJveFByZWNoZWNrSW5wdXRzKTtcblx0XHRyZXR1cm4gcmVzdWx0LmRlbmllZDtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkU2FuZGJveEZpbGVBY2Nlc3NEZW5pZWRNZXNzYWdlKGRlbmllZFBhdGhzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVuaWVkUGF0aHNNZXNzYWdlID0gZGVuaWVkUGF0aHMubWFwKHBhdGggPT4gYHdyaXRlOiAke3BhdGh9YCkuam9pbignXFxuJyk7XG5cdFx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdFx0J3J1bkluVGVybWluYWwuc2FuZGJveC5maWxlQWNjZXNzRGVuaWVkJyxcblx0XHRcdFwiQWNjZXNzIERlbmllZDogVGhlIGNvbW1hbmQgd2FzIG5vdCBleGVjdXRlZCBiZWNhdXNlIHRoZSB0ZXJtaW5hbCBzYW5kYm94IGRvZXMgbm90IGFsbG93IGFjY2VzcyB0byB0aGUgcmVxdWVzdGVkIGZpbGUgcGF0aHM6XFxuezB9XCIsXG5cdFx0XHRkZW5pZWRQYXRoc01lc3NhZ2Vcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhpcyB0b29sIHdpcmVzIHVwIHNhbmRib3gtc3BlY2lmaWMgY29tbWFuZC1saW5lXG5cdCAqIGJlaGF2aW9yLCBpbmNsdWRpbmcgYm90aCB0aGUge0BsaW5rIENvbW1hbmRMaW5lU2FuZGJveFJld3JpdGVyfSBhbmQgdGhlXG5cdCAqIHtAbGluayBDb21tYW5kTGluZVNhbmRib3hBbmFseXplcn0uIFRoaXMgaXMgc2VwYXJhdGUgZnJvbVxuXHQgKiBJVGVybWluYWxTYW5kYm94U2VydmljZS5pc0VuYWJsZWQoKSwgd2hpY2ggcmVwb3J0cyB0aGUgY3VycmVudCB0ZXJtaW5hbFxuXHQgKiBzYW5kYm94aW5nIGVuYWJsZW1lbnQgZm9yIHRoZSBydW5uaW5nIHdpbmRvdy5cblx0ICovXG5cdHByb3RlY3RlZCBnZXQgX2VuYWJsZUNvbW1hbmRMaW5lU2FuZGJveFJld3JpdGluZygpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSGlzdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENoYXRTZXJ2aWNlOiBJVGVybWluYWxDaGF0U2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2FuZGJveFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTYW5kYm94U2VydmljZTogSVRlcm1pbmFsU2FuZGJveFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bigoKSA9PiB7XG5cdFx0XHR0aGlzLl9pc1NodXR0aW5nRG93biA9IHRydWU7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fb3NCYWNrZW5kID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCkudGhlbihyZW1vdGVFbnYgPT4gcmVtb3RlRW52Py5vcyA/PyBPUyk7XG5cblx0XHR0aGlzLl90ZXJtaW5hbFRvb2xDcmVhdG9yID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9vbFRlcm1pbmFsQ3JlYXRvcik7XG5cdFx0dGhpcy5fdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlU2l0dGVyQ29tbWFuZFBhcnNlcikpO1xuXHRcdHRoaXMuX3RlbGVtZXRyeSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJ1bkluVGVybWluYWxUb29sVGVsZW1ldHJ5KTtcblx0XHR0aGlzLl9jb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3IgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbENvbW1hbmRBcnRpZmFjdENvbGxlY3Rvcik7XG5cdFx0dGhpcy5fcHJvZmlsZUZldGNoZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFByb2ZpbGVGZXRjaGVyKTtcblx0XHR0aGlzLl9sYXJnZU91dHB1dEZpbGVXcml0ZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYXJnZU91dHB1dEZpbGVXcml0ZXIpKTtcblxuXHRcdHRoaXMuX2NvbW1hbmRMaW5lUmV3cml0ZXJzID0gW1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZExpbmVDZFByZWZpeFJld3JpdGVyKSksXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZVB3c2hDaGFpbk9wZXJhdG9yUmV3cml0ZXIsIHRoaXMuX3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyKSksXG5cdFx0XTtcblx0XHRpZiAodGhpcy5fZW5hYmxlQ29tbWFuZExpbmVTYW5kYm94UmV3cml0aW5nKSB7XG5cdFx0XHR0aGlzLl9jb21tYW5kTGluZVJld3JpdGVycy5wdXNoKHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lU2FuZGJveFJld3JpdGVyLCB0aGlzLl90cmVlU2l0dGVyQ29tbWFuZFBhcnNlcikpKTtcblx0XHR9XG5cdFx0Ly8gQmFja2dyb3VuZERldGFjaFJld3JpdGVyIG11c3QgY29tZSBhZnRlciBTYW5kYm94UmV3cml0ZXIgc28gdGhhdCBub2h1cC9TdGFydC1Qcm9jZXNzXG5cdFx0Ly8gd3JhcHMgdGhlIGVudGlyZSBzYW5kYm94IHJ1bnRpbWUsIGtlZXBpbmcgYm90aCB0aGUgc2FuZGJveCBhbmQgdGhlIGNoaWxkIHByb2Nlc3MgYWxpdmVcblx0XHQvLyB0aHJvdWdoIFZTIENvZGUgc2h1dGRvd24uXG5cdFx0dGhpcy5fY29tbWFuZExpbmVSZXdyaXRlcnMucHVzaCh0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZUJhY2tncm91bmREZXRhY2hSZXdyaXRlcikpKTtcblx0XHQvLyBQcmV2ZW50SGlzdG9yeVJld3JpdGVyIG11c3QgYmUgbGFzdCBzbyB0aGUgbGVhZGluZyBzcGFjZSBpcyBhcHBsaWVkIHRvIHRoZSBmaW5hbFxuXHRcdC8vIGNvbW1hbmQsIGluY2x1ZGluZyBhbnkgc2FuZGJveCB3cmFwcGluZy5cblx0XHR0aGlzLl9jb21tYW5kTGluZVJld3JpdGVycy5wdXNoKHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lUHJldmVudEhpc3RvcnlSZXdyaXRlcikpKTtcblx0XHR0aGlzLl9jb21tYW5kTGluZUFuYWx5emVycyA9IFtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lRmlsZVdyaXRlQW5hbHl6ZXIsIHRoaXMuX3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLCAobWVzc2FnZSwgYXJncykgPT4gdGhpcy5fbG9nU2VydmljZS5pbmZvKGBSdW5JblRlcm1pbmFsVG9vbCNDb21tYW5kTGluZUZpbGVXcml0ZUFuYWx5emVyOiAke21lc3NhZ2V9YCwgYXJncykpKSxcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lQXV0b0FwcHJvdmVBbmFseXplciwgdGhpcy5fdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIsIHRoaXMuX3RlbGVtZXRyeSwgKG1lc3NhZ2UsIGFyZ3MpID0+IHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUnVuSW5UZXJtaW5hbFRvb2wjQ29tbWFuZExpbmVBdXRvQXBwcm92ZUFuYWx5emVyOiAke21lc3NhZ2V9YCwgYXJncykpKSxcblx0XHRdO1xuXHRcdGlmICh0aGlzLl9lbmFibGVDb21tYW5kTGluZVNhbmRib3hSZXdyaXRpbmcpIHtcblx0XHRcdHRoaXMuX2NvbW1hbmRMaW5lQW5hbHl6ZXJzLnB1c2godGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZExpbmVTYW5kYm94QW5hbHl6ZXIpKSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1hbmRMaW5lUHJlc2VudGVycyA9IFtcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNhbmRib3hlZENvbW1hbmRMaW5lUHJlc2VudGVyKSxcblx0XHRcdG5ldyBOb2RlQ29tbWFuZExpbmVQcmVzZW50ZXIoKSxcblx0XHRcdG5ldyBQeXRob25Db21tYW5kTGluZVByZXNlbnRlcigpLFxuXHRcdFx0bmV3IFJ1YnlDb21tYW5kTGluZVByZXNlbnRlcigpLFxuXHRcdF07XG5cdFx0dGhpcy5fb3V0cHV0QW5hbHl6ZXJzID0gW1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2FuZGJveE91dHB1dEFuYWx5emVyKSksXG5cdFx0XTtcblxuXHRcdC8vIENsZWFyIG91dCB3YXJuaW5nIGFjY2VwdGVkIHN0YXRlIGlmIHRoZSBzZXR0aW5nIGlzIGRpc2FibGVkXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiB7XG5cdFx0XHRpZiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSkgIT09IHRydWUpIHtcblx0XHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMuVGVybWluYWxBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlc3RvcmUgdGVybWluYWwgYXNzb2NpYXRpb25zIGZyb20gc3RvcmFnZVxuXHRcdHRoaXMuX3Jlc3RvcmVUZXJtaW5hbEFzc29jaWF0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZERpc3Bvc2VJbnN0YW5jZShlID0+IHtcblx0XHRcdHRoaXMuX3JlbW92ZVRlcm1pbmFsQXNzb2NpYXRpb25zKGUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgY2hhdCBzZXNzaW9uIGRpc3Bvc2FsIHRvIGNsZWFuIHVwIGFzc29jaWF0ZWQgdGVybWluYWxzIGFuZCB0ZW1wIGZpbGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZS5zZXNzaW9uUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFudXBTZXNzaW9uVGVybWluYWxzKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xhcmdlT3V0cHV0RmlsZVdyaXRlci5jbGVhbnVwKCk7XG5cdFx0fSkpO1xuXG5cdH1cblxuXHRhc3luYyBoYW5kbGVUb29sU3RyZWFtKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblN0cmVhbUNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTdHJlYW1lZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFydGlhbElucHV0ID0gY29udGV4dC5yYXdJbnB1dCBhcyBQYXJ0aWFsPElSdW5JblRlcm1pbmFsSW5wdXRQYXJhbXM+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwYXJ0aWFsSW5wdXQgJiYgdHlwZW9mIHBhcnRpYWxJbnB1dCA9PT0gJ29iamVjdCcgJiYgcGFydGlhbElucHV0LmNvbW1hbmQpIHtcblx0XHRcdGNvbnN0IHRydW5jYXRlZENvbW1hbmQgPSBidWlsZENvbW1hbmREaXNwbGF5VGV4dChwYXJ0aWFsSW5wdXQuY29tbWFuZCk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5zdHJlYW1pbmcnLCBcIlJ1bm5pbmcgYHswfWBcIiwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnModHJ1bmNhdGVkQ29tbWFuZCkpKTtcblx0XHRcdHJldHVybiB7IGludm9jYXRpb25NZXNzYWdlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5zdHJlYW1pbmcuZGVmYXVsdCcsIFwiUnVubmluZyBjb21tYW5kXCIpIH07XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXJncyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbk9wdGlvbnMgPSB0aGlzLl9yZXNvbHZlRXhlY3V0aW9uT3B0aW9ucyhhcmdzKTtcblxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uUmVzb3VyY2UgPSBjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3Qgc2FuZGJveFByZWNoZWNrSW5wdXRzID0gdGhpcy5fZ2V0U2FuZGJveFByZWNoZWNrSW5wdXRzKGNoYXRTZXNzaW9uUmVzb3VyY2UsIGNvbnRleHQuY2hhdFJlcXVlc3RJZCk7XG5cdFx0bGV0IGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgdG9vbFRlcm1pbmFsID0gdGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmdldChjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICh0b29sVGVybWluYWwgJiYgIXRvb2xUZXJtaW5hbC5pc0JhY2tncm91bmQpIHtcblx0XHRcdFx0aW5zdGFuY2UgPSB0b29sVGVybWluYWwuaW5zdGFuY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IFtvcywgc2hlbGwsIGN3ZCwgc2FuZGJveFByZXJlcXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fb3NCYWNrZW5kLFxuXHRcdFx0dGhpcy5fcHJvZmlsZUZldGNoZXIuZ2V0Q29waWxvdFNoZWxsKCksXG5cdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsZXQgY3dkID0gYXdhaXQgaW5zdGFuY2U/LmdldEN3ZFJlc291cmNlKCk7XG5cdFx0XHRcdGlmICghY3dkKSB7XG5cdFx0XHRcdFx0Ly8gUHJlZmVyIHRoZSBzZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3RvcnkgKGFnZW50cyB3aW5kb3cpIG92ZXIgdGhlXG5cdFx0XHRcdFx0Ly8gbGFzdCBhY3RpdmUgd29ya3NwYWNlIHJvb3QsIHdoaWNoIG1heSBwb2ludCB0byBhIGRpZmZlcmVudCBzZXNzaW9uJ3MgZm9sZGVyLlxuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25Nb2RlbCA9IGNoYXRTZXNzaW9uUmVzb3VyY2UgPyB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uTW9kZWw/LndvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRcdGN3ZCA9IHNlc3Npb25Nb2RlbC53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVXb3Jrc3BhY2VSb290VXJpID0gdGhpcy5faGlzdG9yeVNlcnZpY2UuZ2V0TGFzdEFjdGl2ZVdvcmtzcGFjZVJvb3QoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkgPyB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoYWN0aXZlV29ya3NwYWNlUm9vdFVyaSkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0Y3dkID0gd29ya3NwYWNlRm9sZGVyPy51cmk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjd2Q7XG5cdFx0XHR9KSgpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxTYW5kYm94U2VydmljZS5jaGVja0ZvclNhbmRib3hpbmdQcmVyZXFzKGZhbHNlLCBzYW5kYm94UHJlY2hlY2tJbnB1dHMpXG5cdFx0XSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyAncHdzaCcgOiAnc2gnO1xuXHRcdGNvbnN0IGlzU2FuZGJveEVuYWJsZWQgPSBzYW5kYm94UHJlcmVxcy5lbmFibGVkO1xuXHRcdGNvbnN0IGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQgPSBpc1NhbmRib3hFbmFibGVkICYmIGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZCgpO1xuXHRcdGNvbnN0IGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyA9IHRoaXMuX2dldEFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzKGFyZ3MpO1xuXHRcdGNvbnN0IGV4cGxpY2l0VW5zYW5kYm94UmVxdWVzdCA9IGlzU2FuZGJveEVuYWJsZWQgJiYgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzICYmIGFyZ3MucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uID09PSB0cnVlO1xuXHRcdGNvbnN0IGV4cGxpY2l0QWxsb3dOZXR3b3JrUmVxdWVzdCA9IGlzU2FuZGJveEVuYWJsZWQgJiYgIWlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQgJiYgdGhpcy5fcmV0cnlXaXRoQWxsb3dOZXR3b3JrUmVxdWVzdHMgJiYgIWV4cGxpY2l0VW5zYW5kYm94UmVxdWVzdCAmJiBhcmdzLnJlcXVlc3RBbGxvd05ldHdvcmsgPT09IHRydWU7XG5cdFx0bGV0IHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uID0gZXhwbGljaXRVbnNhbmRib3hSZXF1ZXN0O1xuXHRcdGxldCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gPSBleHBsaWNpdFVuc2FuZGJveFJlcXVlc3QgPyBhcmdzLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiA6IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24gPSBleHBsaWNpdEFsbG93TmV0d29ya1JlcXVlc3Q7XG5cdFx0bGV0IHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gPSBleHBsaWNpdEFsbG93TmV0d29ya1JlcXVlc3QgPyBhcmdzLnJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb24gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBtaXNzaW5nRGVwZW5kZW5jaWVzID0gc2FuZGJveFByZXJlcXMuZmFpbGVkQ2hlY2sgPT09IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkRlcGVuZGVuY2llcyAmJiBzYW5kYm94UHJlcmVxcy5taXNzaW5nRGVwZW5kZW5jaWVzPy5sZW5ndGhcblx0XHRcdD8gc2FuZGJveFByZXJlcXMubWlzc2luZ0RlcGVuZGVuY2llc1xuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXMgPSAhIW1pc3NpbmdEZXBlbmRlbmNpZXMgJiYgc2FuZGJveFByZXJlcXMuY2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXMgPT09IHRydWU7XG5cdFx0Y29uc3Qgc2FuZGJveFJlbWVkaWF0aW9ucyA9IHNhbmRib3hQcmVyZXFzLmZhaWxlZENoZWNrID09PSBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwICYmIHNhbmRib3hQcmVyZXFzLnJlbWVkaWF0aW9ucz8ubGVuZ3RoXG5cdFx0XHQ/IFsuLi5zYW5kYm94UHJlcmVxcy5yZW1lZGlhdGlvbnNdXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzYW5kYm94UHJlcmVxdWlzaXRlRmFpbHVyZSA9IHNhbmRib3hQcmVyZXFzLmZhaWxlZENoZWNrID09PSBUZXJtaW5hbFNhbmRib3hQcmVyZXF1aXNpdGVDaGVjay5CdWJibGV3cmFwICYmICFzYW5kYm94UmVtZWRpYXRpb25zXG5cdFx0XHQ/IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmJ1YmJsZXdyYXAudW51c2FibGUnLCBcIkJ1YmJsZXdyYXAgaXMgaW5zdGFsbGVkIGJ1dCBjYW5ub3QgY3JlYXRlIHRoZSByZXF1aXJlZCBzYW5kYm94IG5hbWVzcGFjZSBvbiB0aGlzIHN5c3RlbS4gVGhlIGNvbW1hbmQgd2FzIG5vdCBleGVjdXRlZC5cIilcblx0XHRcdDogbWlzc2luZ0RlcGVuZGVuY2llcyAmJiAhY2FuSW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXNcblx0XHRcdFx0PyBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5taXNzaW5nRGVwcy51bnN1cHBvcnRlZEluc3RhbGxlcicsIFwiVGhlIGZvbGxvd2luZyBkZXBlbmRlbmNpZXMgcmVxdWlyZWQgZm9yIHNhbmRib3hlZCBleGVjdXRpb24gYXJlIG5vdCBpbnN0YWxsZWQ6IHswfS4gSW5zdGFsbCB0aGVtIHVzaW5nIHlvdXIgc3lzdGVtIHBhY2thZ2UgbWFuYWdlciwgdGhlbiBydW4gdGhlIGNvbW1hbmQgYWdhaW4uXCIsIG1pc3NpbmdEZXBlbmRlbmNpZXMuam9pbignLCAnKSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHQvLyBHZW5lcmF0ZSBhIGN1c3RvbSBjb21tYW5kIElEIHRvIGxpbmsgdGhlIGNvbW1hbmQgYmV0d2VlbiByZW5kZXJlciBhbmQgcHR5IGhvc3Rcblx0XHRjb25zdCB0ZXJtaW5hbENvbW1hbmRJZCA9IGB0b29sLSR7Z2VuZXJhdGVVdWlkKCl9YDtcblxuXHRcdGlmICh0aGlzLl9zaG91bGRSZWplY3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlcXVlc3QoaXNTYW5kYm94RW5hYmxlZCwgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLCBhcmdzKSkge1xuXHRcdFx0Y29uc3QgY29tbWFuZFRvRGlzcGxheSA9IG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXkoYXJncy5jb21tYW5kKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQuZGlzYWJsZWQuaW52b2NhdGlvbicsIFwiTm90IHJ1bm5pbmcgYHswfWAgYmVjYXVzZSB1bnNhbmRib3hlZCBleGVjdXRpb24gaXMgZGlzYWJsZWRcIiwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoYnVpbGRDb21tYW5kRGlzcGxheVRleHQoY29tbWFuZFRvRGlzcGxheSkpKSksXG5cdFx0XHRcdGljb246IENvZGljb24uZXJyb3IsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZCxcblx0XHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRJZCxcblx0XHRcdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0XHRcdGZvckRpc3BsYXk6IGNvbW1hbmRUb0Rpc3BsYXksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjd2QsXG5cdFx0XHRcdFx0bGFuZ3VhZ2UsXG5cdFx0XHRcdFx0aXNCYWNrZ3JvdW5kOiBleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uLFxuXHRcdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogZmFsc2UsXG5cdFx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zaG91bGRSZWplY3RBbGxvd05ldHdvcmtSZXF1ZXN0KGlzU2FuZGJveEVuYWJsZWQsIGlzU2FuZGJveEFsbG93TmV0d29ya0VuYWJsZWQsIGFyZ3MpKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kVG9EaXNwbGF5ID0gbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheShhcmdzLmNvbW1hbmQpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5hbGxvd05ldHdvcmsuZGlzYWJsZWQuaW52b2NhdGlvbicsIFwiTm90IHJ1bm5pbmcgYHswfWAgYmVjYXVzZSB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MgaW4gdGhlIHNhbmRib3ggaXMgZGlzYWJsZWRcIiwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoYnVpbGRDb21tYW5kRGlzcGxheVRleHQoY29tbWFuZFRvRGlzcGxheSkpKSksXG5cdFx0XHRcdGljb246IENvZGljb24uZXJyb3IsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZCxcblx0XHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRJZCxcblx0XHRcdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0XHRcdGZvckRpc3BsYXk6IGNvbW1hbmRUb0Rpc3BsYXksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjd2QsXG5cdFx0XHRcdFx0bGFuZ3VhZ2UsXG5cdFx0XHRcdFx0aXNCYWNrZ3JvdW5kOiBleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uLFxuXHRcdFx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IGZhbHNlLFxuXHRcdFx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmV3cml0ZVJlc3VsdCA9IGF3YWl0IHRoaXMuX3Jld3JpdGVDb21tYW5kTGluZShhcmdzLmNvbW1hbmQsIHtcblx0XHRcdGN3ZCxcblx0XHRcdHNoZWxsLFxuXHRcdFx0b3MsXG5cdFx0XHRpc0JhY2tncm91bmQ6IGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24sXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyA/IHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uIDogZmFsc2UsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24sXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrOiBleHBsaWNpdEFsbG93TmV0d29ya1JlcXVlc3QsXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uLFxuXHRcdFx0c2FuZGJveFByZWNoZWNrSW5wdXRzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJld3JpdHRlbkNvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHJld3JpdGVSZXN1bHQucmV3cml0dGVuQ29tbWFuZDtcblx0XHRjb25zdCBmb3JEaXNwbGF5Q29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gcmV3cml0ZVJlc3VsdC5mb3JEaXNwbGF5Q29tbWFuZDtcblx0XHRjb25zdCBpc1NhbmRib3hXcmFwcGVkID0gcmV3cml0ZVJlc3VsdC5pc1NhbmRib3hXcmFwcGVkO1xuXHRcdHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uID0gcmV3cml0ZVJlc3VsdC5yZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbjtcblx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24gPSByZXdyaXRlUmVzdWx0LnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbjtcblx0XHRyZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbiA9IHJld3JpdGVSZXN1bHQucmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb247XG5cdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiA9IHJld3JpdGVSZXN1bHQucmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbjtcblx0XHRjb25zdCBibG9ja2VkRG9tYWlucyA9IHJld3JpdGVSZXN1bHQuYmxvY2tlZERvbWFpbnM7XG5cblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZCxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZElkLFxuXHRcdFx0Y29tbWFuZExpbmU6IHtcblx0XHRcdFx0b3JpZ2luYWw6IGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0dG9vbEVkaXRlZDogcmV3cml0dGVuQ29tbWFuZCA9PT0gYXJncy5jb21tYW5kID8gdW5kZWZpbmVkIDogcmV3cml0dGVuQ29tbWFuZCxcblx0XHRcdFx0Zm9yRGlzcGxheTogZm9yRGlzcGxheUNvbW1hbmQgPz8gbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheShyZXdyaXR0ZW5Db21tYW5kID8/IGFyZ3MuY29tbWFuZCksXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQsXG5cdFx0XHR9LFxuXHRcdFx0Y3dkLFxuXHRcdFx0bGFuZ3VhZ2UsXG5cdFx0XHRpc0JhY2tncm91bmQ6IGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24sXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29yazogcmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24sXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uLFxuXHRcdFx0bWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXM6IG1pc3NpbmdEZXBlbmRlbmNpZXMsXG5cdFx0XHRzYW5kYm94UmVtZWRpYXRpb25zLFxuXHRcdFx0c2FuZGJveFByZXJlcXVpc2l0ZUZhaWx1cmUsXG5cdFx0fTtcblxuXHRcdGxldCBzYW5kYm94UHJlcmVxdWlzaXRlQ29uZmlybWF0aW9uOiBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdC8vIElmIHNhbmRib3ggZGVwZW5kZW5jaWVzIGFyZSBtaXNzaW5nLCBzaG93IGEgY29uZmlybWF0aW9uIGFza2luZyB0aGUgdXNlciB0byBpbnN0YWxsIHRoZW0uXG5cdFx0Ly8gVGhpcyBpcyBoYW5kbGVkIGJlZm9yZSB0aGUgdG9vbCBpcyBpbnZva2VkIHNvIHRoZSBtb2RlbCBuZXZlciBzZWVzIHRoZSBkZXBlbmRlbmN5IGVycm9yLlxuXHRcdGlmIChtaXNzaW5nRGVwZW5kZW5jaWVzICYmIGNhbkluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRjb25zdCBkZXBzTGlzdCA9IG1pc3NpbmdEZXBlbmRlbmNpZXMuam9pbignLCAnKTtcblx0XHRcdHNhbmRib3hQcmVyZXF1aXNpdGVDb25maXJtYXRpb24gPSB7XG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5taXNzaW5nRGVwcy50aXRsZScsIFwiTWlzc2luZyBTYW5kYm94IERlcGVuZGVuY2llc1wiKSxcblx0XHRcdFx0bWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKFxuXHRcdFx0XHRcdCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLm1lc3NhZ2UnLFxuXHRcdFx0XHRcdFwiVGhlIGZvbGxvd2luZyBkZXBlbmRlbmNpZXMgcmVxdWlyZWQgZm9yIHNhbmRib3hlZCBleGVjdXRpb24gYXJlIG5vdCBpbnN0YWxsZWQ6IHswfS4gV291bGQgeW91IGxpa2UgdG8gaW5zdGFsbCB0aGVtP1wiLFxuXHRcdFx0XHRcdGRlcHNMaXN0XG5cdFx0XHRcdCkpLFxuXHRcdFx0XHRjdXN0b21PcHRpb25zOiBbXG5cdFx0XHRcdFx0eyBpZDogJ2luc3RhbGwnLCBsYWJlbDogbG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMuaW5zdGFsbCcsIFwiSW5zdGFsbFwiKSwga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5BcHByb3ZlIH0sXG5cdFx0XHRcdFx0eyBpZDogJ2NhbmNlbCcsIGxhYmVsOiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5taXNzaW5nRGVwcy5jYW5jZWwnLCBcIkNhbmNlbFwiKSwga2luZDogQ29uZmlybWF0aW9uT3B0aW9uS2luZC5EZW55IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEhBQ0s6IEV4aXQgZWFybHkgaWYgdGhlcmUncyBhbiBhbHRlcm5hdGl2ZSByZWNvbW1lbmRhdGlvbiwgdGhpcyBpcyBhIGxpdHRsZSBoYWNreSBidXRcblx0XHQvLyBpdCdzIHRoZSBjdXJyZW50IG1lY2hhbmlzbSBmb3IgcmUtcm91dGluZyB0ZXJtaW5hbCB0b29sIGNhbGxzIHRvIHNvbWV0aGluZyBlbHNlLlxuXHRcdGNvbnN0IGFsdGVybmF0aXZlUmVjb21tZW5kYXRpb24gPSBnZXRSZWNvbW1lbmRlZFRvb2xzT3ZlclJ1bkluVGVybWluYWwoYXJncy5jb21tYW5kLCB0aGlzLl9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTtcblx0XHRpZiAoYWx0ZXJuYXRpdmVSZWNvbW1lbmRhdGlvbikge1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YS5hbHRlcm5hdGl2ZVJlY29tbWVuZGF0aW9uID0gYWx0ZXJuYXRpdmVSZWNvbW1lbmRhdGlvbjtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Ly8gRGV0ZXJtaW5lIGF1dG8gYXBwcm92YWwsIHRoaXMgaGFwcGVucyBldmVuIHdoZW4gYXV0byBhcHByb3ZlIGlzIG9mZiB0byB0aGF0IHJlYXNvbmluZ1xuXHRcdC8vIGNhbiBiZSByZXZpZXdlZCBpbiB0aGUgdGVybWluYWwgY2hhbm5lbC4gSXQgYWxzbyBhbGxvd3MgZ2F1Z2luZyB0aGUgZWZmZWN0aXZlIHNldCBvZlxuXHRcdC8vIGNvbW1hbmRzIHRoYXQgd291bGQgYmUgYXV0byBhcHByb3ZlZCBpZiBpdCB3ZXJlIGVuYWJsZWQuXG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSBmb3JEaXNwbGF5Q29tbWFuZCA/PyByZXdyaXR0ZW5Db21tYW5kID8/IGFyZ3MuY29tbWFuZDtcblxuXHRcdGNvbnN0IGlzRWxpZ2libGVGb3JBdXRvQXBwcm92YWwgPSAoKSA9PiBpc1Rvb2xFbGlnaWJsZUZvclRlcm1pbmFsQXV0b0FwcHJvdmFsKFRPT0xfUkVGRVJFTkNFX05BTUUsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBMRUdBQ1lfVE9PTF9SRUZFUkVOQ0VfRlVMTF9OQU1FUyk7XG5cdFx0Y29uc3QgaXNBdXRvQXBwcm92ZUVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlKSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBpc0F1dG9BcHByb3ZlQWxsb3dlZCA9IGlzVGVybWluYWxBdXRvQXBwcm92ZUFsbG93ZWQoVE9PTF9SRUZFUkVOQ0VfTkFNRSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLCBMRUdBQ1lfVE9PTF9SRUZFUkVOQ0VfRlVMTF9OQU1FUyk7XG5cblx0XHRjb25zdCBjb21tYW5kTGluZUFuYWx5emVyT3B0aW9uczogSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zID0ge1xuXHRcdFx0Y29tbWFuZExpbmUsXG5cdFx0XHRjd2QsXG5cdFx0XHRvcyxcblx0XHRcdHNoZWxsLFxuXHRcdFx0dHJlZVNpdHRlckxhbmd1YWdlOiBpc1Bvd2VyU2hlbGwoc2hlbGwsIG9zKSA/IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UuUG93ZXJTaGVsbCA6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UuQmFzaCxcblx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZCxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRyZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbixcblx0XHRcdHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uLFxuXHRcdFx0aGFzU2Vzc2lvbkF1dG9BcHByb3ZhbDogISFjaGF0U2Vzc2lvblJlc291cmNlICYmIHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuaGFzQ2hhdFNlc3Npb25BdXRvQXBwcm92YWwoY2hhdFNlc3Npb25SZXNvdXJjZSksXG5cdFx0fTtcblxuXHRcdC8vIEluIEF1dG9waWxvdC9CeXBhc3MgQXBwcm92YWxzIG1vZGVzLCBkbyBub3QgaW50ZXJhY3Qgd2l0aCB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMuXG5cdFx0Ly8gQ29tbWFuZHMgc2hvdWxkIGZsb3cgdGhyb3VnaCBkaXJlY3RseSBiYXNlZCBvbiB0aGUgY2hhdCBwZXJtaXNzaW9uIGxldmVsLlxuXHRcdGNvbnN0IGlzU2Vzc2lvbkF1dG9BcHByb3ZlZCA9IGNoYXRTZXNzaW9uUmVzb3VyY2UgJiYgaXNTZXNzaW9uQXV0b0FwcHJvdmVMZXZlbChjaGF0U2Vzc2lvblJlc291cmNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UsIHRoaXMuX2NoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kTGluZUFuYWx5emVycyA9IGlzU2Vzc2lvbkF1dG9BcHByb3ZlZFxuXHRcdFx0PyB0aGlzLl9jb21tYW5kTGluZUFuYWx5emVycy5maWx0ZXIoZSA9PiAhKGUgaW5zdGFuY2VvZiBDb21tYW5kTGluZUF1dG9BcHByb3ZlQW5hbHl6ZXIpKVxuXHRcdFx0OiB0aGlzLl9jb21tYW5kTGluZUFuYWx5emVycztcblx0XHRjb25zdCBjb21tYW5kTGluZUFuYWx5emVyUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKGNvbW1hbmRMaW5lQW5hbHl6ZXJzLm1hcChlID0+IGUuYW5hbHl6ZShjb21tYW5kTGluZUFuYWx5emVyT3B0aW9ucykpKTtcblxuXHRcdGNvbnN0IGRpc2NsYWltZXJzUmF3ID0gY29tbWFuZExpbmVBbmFseXplclJlc3VsdHMubWFwKGUgPT4gZS5kaXNjbGFpbWVycykuZmlsdGVyKGUgPT4gISFlKS5mbGF0TWFwKGUgPT4gZSk7XG5cdFx0bGV0IGRpc2NsYWltZXI6IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZGlzY2xhaW1lcnNSYXcubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZGlzY2xhaW1lclRleHRzID0gZGlzY2xhaW1lcnNSYXcubWFwKGQgPT4gdHlwZW9mIGQgPT09ICdzdHJpbmcnID8gZCA6IGQudmFsdWUpO1xuXHRcdFx0Y29uc3QgaGFzTWFya2Rvd25EaXNjbGFpbWVyID0gZGlzY2xhaW1lcnNSYXcuc29tZShkID0+IHR5cGVvZiBkICE9PSAnc3RyaW5nJyk7XG5cdFx0XHRjb25zdCBtZE9wdGlvbnMgPSBoYXNNYXJrZG93bkRpc2NsYWltZXJcblx0XHRcdFx0PyB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLCBpc1RydXN0ZWQ6IHsgZW5hYmxlZENvbW1hbmRzOiBbVGVybWluYWxDaGF0Q29tbWFuZElkLk9wZW5UZXJtaW5hbFNldHRpbmdzTGlua10gfSB9XG5cdFx0XHRcdDogeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9O1xuXHRcdFx0ZGlzY2xhaW1lciA9IG5ldyBNYXJrZG93blN0cmluZyhgJCgke0NvZGljb24uaW5mby5pZH0pIGAgKyBkaXNjbGFpbWVyVGV4dHMuam9pbignICcpLCBtZE9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFuYWx5emVyc0lzQXV0b0FwcHJvdmVBbGxvd2VkID0gY29tbWFuZExpbmVBbmFseXplclJlc3VsdHMuZXZlcnkoZSA9PiBlLmlzQXV0b0FwcHJvdmVBbGxvd2VkKTtcblx0XHRjb25zdCBjdXN0b21BY3Rpb25zID0gaXNFbGlnaWJsZUZvckF1dG9BcHByb3ZhbCgpICYmIGFuYWx5emVyc0lzQXV0b0FwcHJvdmVBbGxvd2VkID8gY29tbWFuZExpbmVBbmFseXplclJlc3VsdHMubWFwKGUgPT4gZS5jdXN0b21BY3Rpb25zID8/IFtdKS5mbGF0KCkgOiB1bmRlZmluZWQ7XG5cblx0XHRsZXQgc2hlbGxUeXBlID0gYmFzZW5hbWUoc2hlbGwsICcuZXhlJyk7XG5cdFx0aWYgKHNoZWxsVHlwZSA9PT0gJ3Bvd2Vyc2hlbGwnKSB7XG5cdFx0XHRzaGVsbFR5cGUgPSAncHdzaCc7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGNvbW1hbmQgd291bGQgYmUgYXV0by1hcHByb3ZlZCBiYXNlZCBvbiBydWxlcyAoaWdub3Jpbmcgd2FybmluZyBzdGF0ZSlcblx0XHRjb25zdCB3b3VsZEJlQXV0b0FwcHJvdmVkID0gKFxuXHRcdFx0Ly8gRG9lcyBhdCBsZWFzdCBvbmUgYW5hbHl6ZXIgYXV0byBhcHByb3ZlXG5cdFx0XHRjb21tYW5kTGluZUFuYWx5emVyUmVzdWx0cy5zb21lKGUgPT4gZS5pc0F1dG9BcHByb3ZlZCkgJiZcblx0XHRcdC8vIE5vIGFuYWx5emVyIGRlbmllcyBhdXRvIGFwcHJvdmFsXG5cdFx0XHRjb21tYW5kTGluZUFuYWx5emVyUmVzdWx0cy5ldmVyeShlID0+IGUuaXNBdXRvQXBwcm92ZWQgIT09IGZhbHNlKSAmJlxuXHRcdFx0Ly8gQWxsIGFuYWx5emVycyBhbGxvdyBhdXRvIGFwcHJvdmFsXG5cdFx0XHRhbmFseXplcnNJc0F1dG9BcHByb3ZlQWxsb3dlZFxuXHRcdCk7XG5cblx0XHRjb25zdCBpc0F1dG9BcHByb3ZlZEJ5UnVsZXMgPSAoXG5cdFx0XHQvLyBJcyB0aGUgc2V0dGluZyBlbmFibGVkIGFuZCB0aGUgdXNlciBoYXMgb3B0ZWQtaW5cblx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkICYmXG5cdFx0XHQvLyBXb3VsZCBiZSBhdXRvLWFwcHJvdmVkIGJhc2VkIG9uIHJ1bGVzXG5cdFx0XHR3b3VsZEJlQXV0b0FwcHJvdmVkXG5cdFx0KTtcblx0XHRjb25zdCBpc1NhbmRib3hBdXRvQXBwcm92ZWQgPSBpc1NhbmRib3hFbmFibGVkICYmIHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCA9PT0gdHJ1ZSAmJiAhcmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24gJiYgdGhpcy5fYWxsb3dTYW5kYm94QXV0b0FwcHJvdmU7XG5cdFx0Y29uc3QgaXNGaW5hbEF1dG9BcHByb3ZlZCA9IGlzU2FuZGJveEF1dG9BcHByb3ZlZCB8fCBpc0F1dG9BcHByb3ZlZEJ5UnVsZXMgfHwgY29tbWFuZExpbmVBbmFseXplclJlc3VsdHMuc29tZShlID0+IGUuZm9yY2VBdXRvQXBwcm92YWwpO1xuXG5cdFx0Ly8gUGFzcyBhdXRvIGFwcHJvdmUgaW5mbyBpZiB0aGUgY29tbWFuZDpcblx0XHQvLyAtIFdhcyBhdXRvIGFwcHJvdmVkXG5cdFx0Ly8gLSBXb3VsZCBoYXZlIGJlIGF1dG8gYXBwcm92ZWQsIGJ1dCB0aGUgb3B0LWluIHdhcm5pbmcgd2FzIG5vdCBhY2NlcHRlZFxuXHRcdC8vIC0gV2FzIGRlbmllZCBleHBsaWNpdGx5IGJ5IGEgcnVsZVxuXHRcdC8vXG5cdFx0Ly8gVGhpcyBhbGxvd3Mgc3VyZmFjaW5nIHRoaXMgaW5mb3JtYXRpb24gdG8gdGhlIHVzZXIuXG5cdFx0aWYgKGlzRmluYWxBdXRvQXBwcm92ZWQgfHwgKGlzQXV0b0FwcHJvdmVFbmFibGVkICYmIGNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHRzLnNvbWUoZSA9PiBlLmF1dG9BcHByb3ZlSW5mbykpKSB7XG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmF1dG9BcHByb3ZlSW5mbyA9IGNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHRzLmZpbmQoZSA9PiBlLmF1dG9BcHByb3ZlSW5mbyk/LmF1dG9BcHByb3ZlSW5mbztcblx0XHR9XG5cblx0XHQvLyBFeHRyYWN0IGNkIHByZWZpeCBmb3IgZGlzcGxheSAtIHNob3cgZGlyZWN0b3J5IGluIHRpdGxlLCBjb21tYW5kIHN1ZmZpeCBpbiBlZGl0b3Jcblx0XHRjb25zdCBjb21tYW5kVG9EaXNwbGF5ID0gKHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUuZm9yRGlzcGxheSA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnVzZXJFZGl0ZWQgPz8gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkID8/IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUub3JpZ2luYWwpLnRyaW1TdGFydCgpO1xuXHRcdGNvbnN0IGV4dHJhY3RlZENkID0gZXh0cmFjdENkUHJlZml4KGNvbW1hbmRUb0Rpc3BsYXksIHNoZWxsLCBvcyk7XG5cdFx0bGV0IGNvbmZpcm1hdGlvblRpdGxlOiBzdHJpbmc7XG5cdFx0aWYgKGV4dHJhY3RlZENkICYmIGN3ZCkge1xuXHRcdFx0Ly8gQ29uc3RydWN0IHRoZSBmdWxsIGRpcmVjdG9yeSBwYXRoIHVzaW5nIHRoZSBjd2QncyBzY2hlbWUvYXV0aG9yaXR5XG5cdFx0XHRjb25zdCBpc0Fic29sdXRlUGF0aCA9IG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93c1xuXHRcdFx0XHQ/IHdpbjMyLmlzQWJzb2x1dGUoZXh0cmFjdGVkQ2QuZGlyZWN0b3J5KVxuXHRcdFx0XHQ6IHBvc2l4LmlzQWJzb2x1dGUoZXh0cmFjdGVkQ2QuZGlyZWN0b3J5KTtcblx0XHRcdGNvbnN0IGRpcmVjdG9yeVVyaSA9IGlzQWJzb2x1dGVQYXRoXG5cdFx0XHRcdD8gVVJJLmZyb20oeyBzY2hlbWU6IGN3ZC5zY2hlbWUsIGF1dGhvcml0eTogY3dkLmF1dGhvcml0eSwgcGF0aDogZXh0cmFjdGVkQ2QuZGlyZWN0b3J5IH0pXG5cdFx0XHRcdDogVVJJLmpvaW5QYXRoKGN3ZCwgZXh0cmFjdGVkQ2QuZGlyZWN0b3J5KTtcblx0XHRcdGNvbnN0IGRpcmVjdG9yeUxhYmVsID0gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcmVjdG9yeVVyaSk7XG5cdFx0XHRjb25zdCBjZFByZWZpeCA9IGNvbW1hbmRUb0Rpc3BsYXkuc3Vic3RyaW5nKDAsIGNvbW1hbmRUb0Rpc3BsYXkubGVuZ3RoIC0gZXh0cmFjdGVkQ2QuY29tbWFuZC5sZW5ndGgpO1xuXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmNvbmZpcm1hdGlvbiA9IHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IGV4dHJhY3RlZENkLmNvbW1hbmQsXG5cdFx0XHRcdGN3ZExhYmVsOiBkaXJlY3RvcnlMYWJlbCxcblx0XHRcdFx0Y2RQcmVmaXgsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25maXJtYXRpb25UaXRsZSA9IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmluRGlyZWN0b3J5JywgXCJSdW4gYHswfWAgY29tbWFuZCB3aXRoaW4gYHsxfWA/XCIsIHNoZWxsVHlwZSwgZGlyZWN0b3J5TGFiZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmNvbmZpcm1hdGlvbiA9IHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IGNvbW1hbmRUb0Rpc3BsYXksXG5cdFx0XHR9O1xuXHRcdFx0Y29uZmlybWF0aW9uVGl0bGUgPSBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbCcsIFwiUnVuIGB7MH1gIGNvbW1hbmQ/XCIsIHNoZWxsVHlwZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIHByZXNlbnRhdGlvbiBvdmVycmlkZXMgKGUuZy4sIFB5dGhvbiAtYyBjb21tYW5kIGV4dHJhY3Rpb24pXG5cdFx0Ly8gVXNlIHRoZSBjb21tYW5kIGFmdGVyIGNkIHByZWZpeCBleHRyYWN0aW9uIGlmIGF2YWlsYWJsZSwgc2luY2UgdGhhdCdzIHdoYXQncyBkaXNwbGF5ZWQgaW4gdGhlIGVkaXRvclxuXHRcdGNvbnN0IGNvbW1hbmRGb3JQcmVzZW50ZXIgPSBleHRyYWN0ZWRDZD8uY29tbWFuZCA/PyBjb21tYW5kVG9EaXNwbGF5O1xuXHRcdGxldCBwcmVzZW50ZXJJbnB1dCA9IGNvbW1hbmRGb3JQcmVzZW50ZXI7XG5cdFx0Zm9yIChjb25zdCBwcmVzZW50ZXIgb2YgdGhpcy5fY29tbWFuZExpbmVQcmVzZW50ZXJzKSB7XG5cdFx0XHRjb25zdCBwcmVzZW50ZXJSZXN1bHQgPSBhd2FpdCBwcmVzZW50ZXIucHJlc2VudCh7IGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiBhcmdzLmNvbW1hbmQsIGZvckRpc3BsYXk6IHByZXNlbnRlcklucHV0IH0sIHNoZWxsLCBvcyB9KTtcblx0XHRcdGlmIChwcmVzZW50ZXJSZXN1bHQpIHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXMgPSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IHByZXNlbnRlclJlc3VsdC5jb21tYW5kTGluZSxcblx0XHRcdFx0XHRsYW5ndWFnZTogcHJlc2VudGVyUmVzdWx0Lmxhbmd1YWdlID8/IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKGV4dHJhY3RlZENkICYmIHRvb2xTcGVjaWZpY0RhdGEuY29uZmlybWF0aW9uPy5jd2RMYWJlbCkge1xuXHRcdFx0XHRcdGlmIChwcmVzZW50ZXJSZXN1bHQubGFuZ3VhZ2VEaXNwbGF5TmFtZSkge1xuXHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUgPSBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5wcmVzZW50YXRpb25PdmVycmlkZS5pbkRpcmVjdG9yeScsIFwiUnVuIGB7MH1gIGNvbW1hbmQgaW4gYHsxfWAgd2l0aGluIGB7Mn1gP1wiLCBwcmVzZW50ZXJSZXN1bHQubGFuZ3VhZ2VEaXNwbGF5TmFtZSwgc2hlbGxUeXBlLCB0b29sU3BlY2lmaWNEYXRhLmNvbmZpcm1hdGlvbi5jd2RMYWJlbCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwucHJlc2VudGF0aW9uT3ZlcnJpZGUuaW5EaXJlY3Rvcnkud2l0aG91dExhbmd1YWdlJywgXCJSdW4gY29tbWFuZCBpbiBgezB9YCB3aXRoaW4gYHsxfWA/XCIsIHNoZWxsVHlwZSwgdG9vbFNwZWNpZmljRGF0YS5jb25maXJtYXRpb24uY3dkTGFiZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAocHJlc2VudGVyUmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUpIHtcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwucHJlc2VudGF0aW9uT3ZlcnJpZGUnLCBcIlJ1biBgezB9YCBjb21tYW5kIGluIGB7MX1gP1wiLCBwcmVzZW50ZXJSZXN1bHQubGFuZ3VhZ2VEaXNwbGF5TmFtZSwgc2hlbGxUeXBlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUgPSBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5wcmVzZW50YXRpb25PdmVycmlkZS53aXRob3V0TGFuZ3VhZ2UnLCBcIlJ1biBjb21tYW5kIGluIGB7MH1gP1wiLCBzaGVsbFR5cGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXByZXNlbnRlclJlc3VsdC5wcm9jZXNzT3RoZXJQcmVzZW50ZXJzKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJlc2VudGVySW5wdXQgPSBwcmVzZW50ZXJSZXN1bHQuY29tbWFuZExpbmU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25maXJtYXRpb25UaXRsZSA9IGJsb2NrZWREb21haW5zPy5sZW5ndGhcblx0XHRcdFx0PyBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5kb21haW4nLCBcIlJ1biBgezB9YCBjb21tYW5kIG91dHNpZGUgdGhlIFtzYW5kYm94XSh7MX0pIHRvIGFjY2VzcyB7Mn0/XCIsIHNoZWxsVHlwZSwgVEVSTUlOQUxfU0FOREJPWF9ET0NVTUVOVEFUSU9OX1VSTCwgdGhpcy5fZm9ybWF0QmxvY2tlZERvbWFpbnNGb3JUaXRsZShibG9ja2VkRG9tYWlucykpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQnLCBcIlJ1biBgezB9YCBjb21tYW5kIG91dHNpZGUgdGhlIFtzYW5kYm94XSh7MX0pP1wiLCBzaGVsbFR5cGUsIFRFUk1JTkFMX1NBTkRCT1hfRE9DVU1FTlRBVElPTl9VUkwpO1xuXHRcdH0gZWxzZSBpZiAocmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24pIHtcblx0XHRcdGNvbmZpcm1hdGlvblRpdGxlID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrJywgXCJBbGxvdyB7MH0gY29tbWFuZCB0byBhY2Nlc3MgdGhlIG5ldHdvcms/XCIsIHNoZWxsVHlwZSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgZm9yY2VDb25maXJtYXRpb25SZWFzb24gaXMgc2V0LCBhbHdheXMgc2hvdyBjb25maXJtYXRpb24gcmVnYXJkbGVzcyBvZiBhdXRvLWFwcHJvdmFsXG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0NvbmZpcm1hdGlvbiA9ICghaXNGaW5hbEF1dG9BcHByb3ZlZCAmJiAoIWlzU2Vzc2lvbkF1dG9BcHByb3ZlZCB8fCByZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbikpIHx8IGNvbnRleHQuZm9yY2VDb25maXJtYXRpb25SZWFzb24gIT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCBleHBsYW5hdGlvbiA9IGFyZ3MuZXhwbGFuYXRpb24gfHwgbG9jYWxpemUoJ3J1bkluVGVybWluYWwuZGVmYXVsdEV4cGxhbmF0aW9uJywgXCJObyBleHBsYW5hdGlvbiBwcm92aWRlZFwiKTtcblx0XHRjb25zdCBnb2FsID0gYXJncy5nb2FsIHx8IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmRlZmF1bHRHb2FsJywgXCJObyBnb2FsIHByb3ZpZGVkXCIpO1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbk1lc3NhZ2UgPSByZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvblxuXHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoXG5cdFx0XHRcdCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmNvbmZpcm1hdGlvbk1lc3NhZ2UnLFxuXHRcdFx0XHRcIkV4cGxhbmF0aW9uOiB7MH1cXG5cXG5Hb2FsOiB7MX1cXG5cXG5SZWFzb24gZm9yIGxlYXZpbmcgdGhlIHNhbmRib3g6IHsyfVwiLFxuXHRcdFx0XHRleHBsYW5hdGlvbixcblx0XHRcdFx0Z29hbCxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uIHx8IGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmNvbmZpcm1hdGlvbk1lc3NhZ2UuZGVmYXVsdFJlYXNvbicsIFwiVGhlIG1vZGVsIGluZGljYXRlZCB0aGF0IHRoaXMgY29tbWFuZCBuZWVkcyB1bnNhbmRib3hlZCBhY2Nlc3MuXCIpXG5cdFx0XHQpKVxuXHRcdFx0OiByZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvblxuXHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0XHQncnVuSW5UZXJtaW5hbC5hbGxvd05ldHdvcmsuY29uZmlybWF0aW9uTWVzc2FnZScsXG5cdFx0XHRcdFx0XCJFeHBsYW5hdGlvbjogezB9XFxuXFxuR29hbDogezF9XFxuXFxuUmVhc29uIGZvciBhbGxvd2luZyB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MgaW4gdGhlIHNhbmRib3g6IHsyfVwiLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uLFxuXHRcdFx0XHRcdGdvYWwsXG5cdFx0XHRcdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiB8fCBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5hbGxvd05ldHdvcmsuY29uZmlybWF0aW9uTWVzc2FnZS5kZWZhdWx0UmVhc29uJywgXCJUaGUgbW9kZWwgaW5kaWNhdGVkIHRoYXQgdGhpcyBzYW5kYm94ZWQgY29tbWFuZCBuZWVkcyB1bnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3MuXCIpXG5cdFx0XHRcdCkpXG5cdFx0XHRcdDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmNvbmZpcm1hdGlvbk1lc3NhZ2UnLCBcIkV4cGxhbmF0aW9uOiB7MH1cXG5cXG5Hb2FsOiB7MX1cIiwgZXhwbGFuYXRpb24sIGdvYWwpKTtcblx0XHRjb25zdCBjb25maXJtYXRpb25NZXNzYWdlcyA9IHNob3VsZFNob3dDb25maXJtYXRpb24gPyB7XG5cdFx0XHR0aXRsZTogY29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRtZXNzYWdlOiBjb25maXJtYXRpb25NZXNzYWdlLFxuXHRcdFx0ZGlzY2xhaW1lcixcblx0XHRcdGFsbG93QXV0b0NvbmZpcm06IHVuZGVmaW5lZCxcblx0XHRcdHRlcm1pbmFsQ3VzdG9tQWN0aW9uczogY3VzdG9tQWN0aW9ucyxcblx0XHR9IDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgcmF3RGlzcGxheUNvbW1hbmQgPSB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLmZvckRpc3BsYXkgPz8gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkID8/IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUub3JpZ2luYWw7XG5cdFx0Y29uc3QgZGlzcGxheUNvbW1hbmQgPSByYXdEaXNwbGF5Q29tbWFuZC5sZW5ndGggPiA4MFxuXHRcdFx0PyByYXdEaXNwbGF5Q29tbWFuZC5zdWJzdHJpbmcoMCwgNzcpICsgJy4uLidcblx0XHRcdDogcmF3RGlzcGxheUNvbW1hbmQ7XG5cdFx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLmlzU2FuZGJveFdyYXBwZWRcblx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLmludm9jYXRpb24uc2FuZGJveCcsIFwiUnVubmluZyBgezB9YCBpbiBzYW5kYm94XCIsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGRpc3BsYXlDb21tYW5kKSkpXG5cdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5pbnZvY2F0aW9uJywgXCJSdW5uaW5nIGB7MH1gXCIsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGRpc3BsYXlDb21tYW5kKSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0aWNvbjogdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5pc1NhbmRib3hXcmFwcGVkID8gQ29kaWNvbi50ZXJtaW5hbFNlY3VyZSA6IENvZGljb24udGVybWluYWwsXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogc2FuZGJveFByZXJlcXVpc2l0ZUNvbmZpcm1hdGlvbiA/PyBjb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdEJsb2NrZWREb21haW5zRm9yVGl0bGUoYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRpZiAoYmxvY2tlZERvbWFpbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gYFxcYCR7YmxvY2tlZERvbWFpbnNbMF19XFxgYDtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRvbWFpbi5zdW1tYXJ5JywgXCJgezB9YCBhbmQgezF9IG1vcmUgZG9tYWluc1wiLCBibG9ja2VkRG9tYWluc1swXSwgYmxvY2tlZERvbWFpbnMubGVuZ3RoIC0gMSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRCbG9ja2VkRG9tYWluUmVhc29uKGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSwgZGVuaWVkRG9tYWluczogc3RyaW5nW10gPSBbXSk6IHN0cmluZyB7XG5cdFx0aWYgKGRlbmllZERvbWFpbnMubGVuZ3RoID09PSBibG9ja2VkRG9tYWlucy5sZW5ndGggJiYgZGVuaWVkRG9tYWlucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoYmxvY2tlZERvbWFpbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5kb21haW4ucmVhc29uLmRlbmllZC5zaW5nbGUnLCBcIlRoaXMgY29tbWFuZCBhY2Nlc3NlcyB7MH0sIHdoaWNoIGlzIGJsb2NrZWQgYnkgY2hhdC5hZ2VudC5kZW5pZWROZXR3b3JrRG9tYWlucy5cIiwgYmxvY2tlZERvbWFpbnNbMF0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRvbWFpbi5yZWFzb24uZGVuaWVkLm11bHRpJywgXCJUaGlzIGNvbW1hbmQgYWNjZXNzZXMgezB9IGFuZCB7MX0gbW9yZSBkb21haW5zIHRoYXQgYXJlIGJsb2NrZWQgYnkgY2hhdC5hZ2VudC5kZW5pZWROZXR3b3JrRG9tYWlucy5cIiwgYmxvY2tlZERvbWFpbnNbMF0sIGJsb2NrZWREb21haW5zLmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0XHRpZiAoZGVuaWVkRG9tYWlucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoYmxvY2tlZERvbWFpbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5kb21haW4ucmVhc29uLm1peGVkLnNpbmdsZScsIFwiVGhpcyBjb21tYW5kIGFjY2Vzc2VzIHswfSwgd2hpY2ggaXMgYmxvY2tlZCBieSBjaGF0LmFnZW50LmRlbmllZE5ldHdvcmtEb21haW5zIG9yIG5vdCBhZGRlZCB0byBjaGF0LmFnZW50LmFsbG93ZWROZXR3b3JrRG9tYWlucy5cIiwgYmxvY2tlZERvbWFpbnNbMF0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRvbWFpbi5yZWFzb24ubWl4ZWQubXVsdGknLCBcIlRoaXMgY29tbWFuZCBhY2Nlc3NlcyB7MH0gYW5kIHsxfSBtb3JlIGRvbWFpbnMgdGhhdCBhcmUgYmxvY2tlZCBieSBjaGF0LmFnZW50LmRlbmllZE5ldHdvcmtEb21haW5zIG9yIG5vdCBhZGRlZCB0byBjaGF0LmFnZW50LmFsbG93ZWROZXR3b3JrRG9tYWlucy5cIiwgYmxvY2tlZERvbWFpbnNbMF0sIGJsb2NrZWREb21haW5zLmxlbmd0aCAtIDEpO1xuXHRcdH1cblx0XHRpZiAoYmxvY2tlZERvbWFpbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQuZG9tYWluLnJlYXNvbi5zaW5nbGUnLCBcIlRoaXMgY29tbWFuZCBhY2Nlc3NlcyB7MH0sIHdoaWNoIGlzIG5vdCBwZXJtaXR0ZWQgYnkgdGhlIGN1cnJlbnQgY2hhdC5hZ2VudC5zYW5kYm94IGNvbmZpZ3VyYXRpb24uXCIsIGJsb2NrZWREb21haW5zWzBdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmRvbWFpbi5yZWFzb24ubXVsdGknLCBcIlRoaXMgY29tbWFuZCBhY2Nlc3NlcyB7MH0gYW5kIHsxfSBtb3JlIGRvbWFpbnMgdGhhdCBhcmUgbm90IHBlcm1pdHRlZCBieSB0aGUgY3VycmVudCBjaGF0LmFnZW50LnNhbmRib3ggY29uZmlndXJhdGlvbi5cIiwgYmxvY2tlZERvbWFpbnNbMF0sIGJsb2NrZWREb21haW5zLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmV3cml0ZUNvbW1hbmRMaW5lKGNvbW1hbmRMaW5lOiBzdHJpbmcsIG9wdGlvbnM6IHtcblx0XHRjd2Q6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRzaGVsbDogc3RyaW5nO1xuXHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW07XG5cdFx0aXNCYWNrZ3JvdW5kOiBib29sZWFuO1xuXHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogYm9vbGVhbjtcblx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24/OiBzdHJpbmc7XG5cdFx0cmVxdWVzdEFsbG93TmV0d29yazogYm9vbGVhbjtcblx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uPzogc3RyaW5nO1xuXHRcdHNhbmRib3hQcmVjaGVja0lucHV0cz86IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cztcblx0fSk6IFByb21pc2U8e1xuXHRcdHJld3JpdHRlbkNvbW1hbmQ6IHN0cmluZztcblx0XHRmb3JEaXNwbGF5Q29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlzU2FuZGJveFdyYXBwZWQ6IGJvb2xlYW47XG5cdFx0cmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb246IGJvb2xlYW47XG5cdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0cmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb246IGJvb2xlYW47XG5cdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGJsb2NrZWREb21haW5zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0fT4ge1xuXHRcdGxldCByZXdyaXR0ZW5Db21tYW5kID0gY29tbWFuZExpbmU7XG5cdFx0bGV0IGZvckRpc3BsYXlDb21tYW5kOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGlzU2FuZGJveFdyYXBwZWQgPSBmYWxzZTtcblx0XHRsZXQgcmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb24gPSBvcHRpb25zLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjtcblx0XHRsZXQgcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uID0gb3B0aW9ucy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPyBvcHRpb25zLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiA6IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24gPSBmYWxzZTtcblx0XHRsZXQgcmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiA9IG9wdGlvbnMucmVxdWVzdEFsbG93TmV0d29yayA/IG9wdGlvbnMucmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiA6IHVuZGVmaW5lZDtcblx0XHRsZXQgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCByZXdyaXRlciBvZiB0aGlzLl9jb21tYW5kTGluZVJld3JpdGVycykge1xuXHRcdFx0Y29uc3QgcmV3cml0ZVJlc3VsdCA9IGF3YWl0IHJld3JpdGVyLnJld3JpdGUoe1xuXHRcdFx0XHRjb21tYW5kTGluZTogcmV3cml0dGVuQ29tbWFuZCxcblx0XHRcdFx0Y3dkOiBvcHRpb25zLmN3ZCxcblx0XHRcdFx0c2hlbGw6IG9wdGlvbnMuc2hlbGwsXG5cdFx0XHRcdG9zOiBvcHRpb25zLm9zLFxuXHRcdFx0XHRpc0JhY2tncm91bmQ6IG9wdGlvbnMuaXNCYWNrZ3JvdW5kLFxuXHRcdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uLFxuXHRcdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrOiBvcHRpb25zLnJlcXVlc3RBbGxvd05ldHdvcmssXG5cdFx0XHRcdHNhbmRib3hQcmVjaGVja0lucHV0czogb3B0aW9ucy5zYW5kYm94UHJlY2hlY2tJbnB1dHMsXG5cdFx0XHR9KTtcblx0XHRcdGlmIChyZXdyaXRlUmVzdWx0KSB7XG5cdFx0XHRcdHJld3JpdHRlbkNvbW1hbmQgPSByZXdyaXRlUmVzdWx0LnJld3JpdHRlbjtcblx0XHRcdFx0Zm9yRGlzcGxheUNvbW1hbmQgPSBmb3JEaXNwbGF5Q29tbWFuZCA/PyByZXdyaXRlUmVzdWx0LmZvckRpc3BsYXk7XG5cdFx0XHRcdGlmIChyZXdyaXRlUmVzdWx0LmlzU2FuZGJveFdyYXBwZWQpIHtcblx0XHRcdFx0XHRpc1NhbmRib3hXcmFwcGVkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXdyaXRlUmVzdWx0LmlzU2FuZGJveFdyYXBwZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0aXNTYW5kYm94V3JhcHBlZCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZXdyaXRlUmVzdWx0LnJlcXVpcmVzVW5zYW5kYm94Q29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0cmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZXdyaXRlUmVzdWx0LnJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0cmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZXdyaXRlUmVzdWx0LmJsb2NrZWREb21haW5zPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRibG9ja2VkRG9tYWlucyA9IHJld3JpdGVSZXN1bHQuYmxvY2tlZERvbWFpbnM7XG5cdFx0XHRcdFx0Y29uc3QgYmxvY2tlZERvbWFpblJlYXNvbiA9IHRoaXMuX2dldEJsb2NrZWREb21haW5SZWFzb24ocmV3cml0ZVJlc3VsdC5ibG9ja2VkRG9tYWlucywgcmV3cml0ZVJlc3VsdC5kZW5pZWREb21haW5zKTtcblx0XHRcdFx0XHRpZiAocmV3cml0ZVJlc3VsdC5yZXF1aXJlc0FsbG93TmV0d29ya0NvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiA9IGJsb2NrZWREb21haW5SZWFzb247XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbiA9IGJsb2NrZWREb21haW5SZWFzb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUnVuSW5UZXJtaW5hbFRvb2w6IENvbW1hbmQgcmV3cml0dGVuIGJ5ICR7cmV3cml0ZXIuY29uc3RydWN0b3IubmFtZX06ICR7cmV3cml0ZVJlc3VsdC5yZWFzb25pbmd9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJld3JpdHRlbkNvbW1hbmQsXG5cdFx0XHRmb3JEaXNwbGF5Q29tbWFuZCxcblx0XHRcdGlzU2FuZGJveFdyYXBwZWQsXG5cdFx0XHRyZXF1aXJlc1Vuc2FuZGJveENvbmZpcm1hdGlvbixcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbixcblx0XHRcdHJlcXVpcmVzQWxsb3dOZXR3b3JrQ29uZmlybWF0aW9uLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbjogcmVxdWlyZXNBbGxvd05ldHdvcmtDb25maXJtYXRpb24gPyByZXF1ZXN0QWxsb3dOZXR3b3JrUmVhc29uIDogdW5kZWZpbmVkLFxuXHRcdFx0YmxvY2tlZERvbWFpbnMsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNhbmRib3hQcmVjaGVja0lucHV0cyhjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNoYXRSZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElUZXJtaW5hbFNhbmRib3hQcmVjaGVja0lucHV0cyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldFNhbmRib3hQcmVjaGVja0lucHV0c0ZvclRvb2xJbnZvY2F0aW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UsIGNoYXRSZXF1ZXN0SWQsIHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLCB0aGlzLl9jaGF0U2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25maXJtQXV0b21hdGljU2FuZGJveFJldHJ5KHJldHJ5S2luZDogQXV0b21hdGljU2FuZGJveFJldHJ5S2luZCwgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGNvbW1hbmQ6IHN0cmluZywgc2hlbGw6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCByaXNrQXNzZXNzbWVudDogeyB0b29sSWQ6IHN0cmluZzsgcGFyYW1ldGVyczogdW5rbm93biB9IHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBzZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghKGNoYXRNb2RlbCBpbnN0YW5jZW9mIENoYXRNb2RlbCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gSW4gQXV0b3BpbG90L0J5cGFzcyBBcHByb3ZhbHMgbW9kZXMsIGZvbGxvdyB0aGUgcGlja2VyXG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBpc1Nlc3Npb25BdXRvQXBwcm92ZUxldmVsKHNlc3Npb25SZXNvdXJjZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLCB0aGlzLl9jaGF0U2VydmljZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCByZXF1ZXN0ID0gY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBzaGVsbFR5cGUgPSBiYXNlbmFtZShzaGVsbCwgJy5leGUnKTtcblx0XHRpZiAoc2hlbGxUeXBlID09PSAncG93ZXJzaGVsbCcpIHtcblx0XHRcdHNoZWxsVHlwZSA9ICdwd3NoJztcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0bGV0IHJlc29sdmVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCByZXNvbHZlT25jZSA9ICh2YWx1ZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlc29sdmUodmFsdWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZSA9IHJldHJ5S2luZCA9PT0gJ2FsbG93TmV0d29yaydcblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoXG5cdFx0XHRcdFx0J3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmF1dG9SZXRyeS5jb25maXJtYXRpb25NZXNzYWdlJyxcblx0XHRcdFx0XHRcImB7MH1gXCIsXG5cdFx0XHRcdFx0ZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoYnVpbGRDb21tYW5kRGlzcGxheVRleHQoY29tbWFuZCkpXG5cdFx0XHRcdCkpXG5cdFx0XHRcdDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKFxuXHRcdFx0XHRcdCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmF1dG9SZXRyeS5jb25maXJtYXRpb25NZXNzYWdlJyxcblx0XHRcdFx0XHRcImB7MH1gXCIsXG5cdFx0XHRcdFx0ZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoYnVpbGRDb21tYW5kRGlzcGxheVRleHQoY29tbWFuZCkpXG5cdFx0XHRcdCkpO1xuXHRcdFx0Y29uc3QgcGFydCA9IG5ldyBDaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydChcblx0XHRcdFx0dGhpcy5fZ2V0QXV0b21hdGljU2FuZGJveFJldHJ5VGl0bGUocmV0cnlLaW5kLCBzaGVsbFR5cGUsIGJsb2NrZWREb21haW5zKSxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZSxcblx0XHRcdFx0JycsXG5cdFx0XHRcdGxvY2FsaXplKCdhbGxvdycsICdBbGxvdycpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2tpcCcsICdTa2lwJyksXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlT25jZSh0cnVlKTtcblx0XHRcdFx0XHRwYXJ0LmhpZGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmVPbmNlKGZhbHNlKTtcblx0XHRcdFx0XHRwYXJ0LmhpZGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHJlc29sdmVPbmNlKGZhbHNlKSxcblx0XHRcdFx0cmlza0Fzc2Vzc21lbnQsXG5cdFx0XHQpO1xuXG5cdFx0XHRjaGF0TW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBwYXJ0KTtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiByZXNvbHZlT25jZShmYWxzZSkpKTtcblx0XHRcdHN0b3JlLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHBhcnQuaGlkZSgpIH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXV0b21hdGljU2FuZGJveFJldHJ5VGl0bGUocmV0cnlLaW5kOiBBdXRvbWF0aWNTYW5kYm94UmV0cnlLaW5kLCBzaGVsbFR5cGU6IHN0cmluZywgYmxvY2tlZERvbWFpbnM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogTWFya2Rvd25TdHJpbmcge1xuXHRcdGlmIChyZXRyeUtpbmQgPT09ICdhbGxvd05ldHdvcmsnKSB7XG5cdFx0XHRyZXR1cm4gYmxvY2tlZERvbWFpbnM/Lmxlbmd0aFxuXHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5hbGxvd05ldHdvcmsuYXV0b1JldHJ5LmRvbWFpbicsIFwiUmV0cnkgYHswfWAgY29tbWFuZCBpbiB0aGUgc2FuZGJveCBieSBhbGxvd2luZyBuZXR3b3JrIGFjY2VzcyB0byB7MX0/XCIsIHNoZWxsVHlwZSwgdGhpcy5fZm9ybWF0QmxvY2tlZERvbWFpbnNGb3JUaXRsZShibG9ja2VkRG9tYWlucykpKVxuXHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5hbGxvd05ldHdvcmsuYXV0b1JldHJ5JywgXCJSZXRyeSBgezB9YCBjb21tYW5kIGluIHRoZSBzYW5kYm94IGJ5IGFsbG93aW5nIG5ldHdvcmsgYWNjZXNzP1wiLCBzaGVsbFR5cGUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGJsb2NrZWREb21haW5zPy5sZW5ndGhcblx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmF1dG9SZXRyeS5kb21haW4nLCBcIlJ1biBgezB9YCBjb21tYW5kIG91dHNpZGUgdGhlIHNhbmRib3ggdG8gYWNjZXNzIHsxfT9cIiwgc2hlbGxUeXBlLCB0aGlzLl9mb3JtYXRCbG9ja2VkRG9tYWluc0ZvclRpdGxlKGJsb2NrZWREb21haW5zKSkpXG5cdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC51bnNhbmRib3hlZC5hdXRvUmV0cnknLCBcIlJ1biBgezB9YCBjb21tYW5kIG91dHNpZGUgdGhlIHNhbmRib3g/XCIsIHNoZWxsVHlwZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN1cmZhY2UgYSBjb25maXJtYXRpb24gZGlhbG9nIHdoZW4gdGhlIHRlcm1pbmFsIGlzIGRldGVjdGVkIHRvIGJlIHdhaXRpbmdcblx0ICogZm9yIHNlbnNpdGl2ZSBpbnB1dCAocGFzc3dvcmQsIHBhc3NwaHJhc2UsIE9UUCwgXHUyMDI2KS4gU2Vuc2l0aXZlIHByb21wdHMgbXVzdFxuXHQgKiBuZXZlciBiZSByb3V0ZWQgdGhyb3VnaCB0aGUgbW9kZWwgXHUyMDE0IHRoZSB1c2VyIHR5cGVzIHRoZSBzZWNyZXQgZGlyZWN0bHlcblx0ICogaW50byB0aGUgdGVybWluYWwuIFRoZSBcIkZvY3VzIHRlcm1pbmFsXCIgYWN0aW9uIHJldmVhbHMgYW5kIGZvY3VzZXMgdGhlXG5cdCAqIHRlcm1pbmFsOyB0aGUgXCJDYW5jZWxcIiBhY3Rpb24gY2FuY2VscyB0aGUgcnVubmluZyBjb21tYW5kLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGEgZGlzcG9zYWJsZSB0aGF0IGhpZGVzIGFueSBwZW5kaW5nIGVsaWNpdGF0aW9uLiBUaGUgaGFuZGxlclxuXHQgKiBpdHNlbGYgZGVkdXBlcyBjb25jdXJyZW50IGVsaWNpdGF0aW9ucyBzbyByZXBlYXRlZCBwb2xsaW5nIGN5Y2xlcyBkb24ndFxuXHQgKiBzcGFtIHRoZSBjaGF0IHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlclNlbnNpdGl2ZUlucHV0RWxpY2l0YXRpb24oXG5cdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHRlcm1pbmFsSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLFxuXHRcdG91dHB1dE1vbml0b3I6IHsgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD4gfSxcblx0XHRjYW5jZWxFeGVjdXRpb246ICgpID0+IHZvaWQsXG5cdFx0b25BdXRvQ2FuY2VsbGVkPzogKCkgPT4gdm9pZCxcblx0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCBwZW5kaW5nOiB7IGhpZGU6ICgpID0+IHZvaWQgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYXV0b0NhbmNlbGxlZCA9IGZhbHNlO1xuXG5cdFx0c3RvcmUuYWRkKG91dHB1dE1vbml0b3Iub25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZCgoKSA9PiB7XG5cdFx0XHRpZiAocGVuZGluZyB8fCBhdXRvQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVkID0gY2hhdFNlc3Npb25SZXNvdXJjZSAmJiBpc1Nlc3Npb25BdXRvQXBwcm92ZUxldmVsKGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSwgdGhpcy5fY2hhdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gY2hhdFNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGlzQXV0b0FwcHJvdmVkKSB7XG5cdFx0XHRcdC8vIEF1dG9waWxvdCAvIGF1dG8tYXBwcm92ZTogbm8gaHVtYW4gaXMgaW4gdGhlIGxvb3AgdG8gdHlwZSB0aGVcblx0XHRcdFx0Ly8gc2VjcmV0LCBhbmQgdGhlIHRlcm1pbmFsIGNhbid0IHJlbGlhYmx5IGJlIGZvY3VzZWQgYWZ0ZXIgdGhlXG5cdFx0XHRcdC8vIHRvb2wgcmV0dXJucy4gQ2FuY2VsIHRoZSBjb21tYW5kIGFuZCBsZXQgdGhlIGNhbGxlciBlbWl0IGFcblx0XHRcdFx0Ly8gc3RlZXJpbmcgbm90ZSB0aGF0IHRlbGxzIHRoZSBhZ2VudCB0aGUgdXNlciBpcyB1bmF2YWlsYWJsZS5cblx0XHRcdFx0Ly8gV2UgYWxzbyBzdXJmYWNlIGEgc21hbGwgZGlzbWlzcy1vbmx5IGNoYXQgcGFydCBzbyB0aGUgdXNlclxuXHRcdFx0XHQvLyBjYW4gc2VlIHdoYXQgaGFwcGVuZWQgZXZlbiBpZiB0aGUgYWdlbnQgZG9lc24ndCBmb2xsb3cgdXBcblx0XHRcdFx0Ly8gd2l0aCBhIG1lc3NhZ2Ugb2YgaXRzIG93bi5cblx0XHRcdFx0YXV0b0NhbmNlbGxlZCA9IHRydWU7XG5cdFx0XHRcdGlmIChjaGF0TW9kZWwgaW5zdGFuY2VvZiBDaGF0TW9kZWwpIHtcblx0XHRcdFx0XHRjb25zdCByZXF1ZXN0ID0gY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0XHRcdGlmIChyZXF1ZXN0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmZvUGFydCA9IG5ldyBDaGF0RWxpY2l0YXRpb25SZXF1ZXN0UGFydChcblx0XHRcdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnNlbnNpdGl2ZUlucHV0LmF1dG9DYW5jZWxUaXRsZScsIFwiVGVybWluYWwgY29tbWFuZCBjYW5jZWxsZWQgXHUyMDE0IHNlbnNpdGl2ZSBpbnB1dCByZXF1aXJlZFwiKSksXG5cdFx0XHRcdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5zZW5zaXRpdmVJbnB1dC5hdXRvQ2FuY2VsTWVzc2FnZScsIFwiVGhlIHRlcm1pbmFsIGNvbW1hbmQgd2FzIHByb21wdGluZyBmb3IgYSBwYXNzd29yZCBvciBvdGhlciBzZWNyZXQuIEF1dG8tYXBwcm92ZSAvIGF1dG9waWxvdCBtb2RlIGNhbm5vdCBzYWZlbHkgc3VwcGx5IHNlY3JldHMsIHNvIHRoZSBjb21tYW5kIHdhcyBjYW5jZWxsZWQuIFJ1biB0aGUgY29tbWFuZCBpbnRlcmFjdGl2ZWx5IGlmIHlvdSB3YW50IHRvIHByb3ZpZGUgdGhlIHNlY3JldC5cIikpLFxuXHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3J1bkluVGVybWluYWwuc2Vuc2l0aXZlSW5wdXQuZGlzbWlzcycsIFwiRGlzbWlzc1wiKSxcblx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdGFzeW5jICgpID0+IHsgaW5mb1BhcnQuaGlkZSgpOyByZXR1cm4gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZDsgfSxcblx0XHRcdFx0XHRcdFx0YXN5bmMgKCkgPT4geyBpbmZvUGFydC5oaWRlKCk7IHJldHVybiBFbGljaXRhdGlvblN0YXRlLlJlamVjdGVkOyB9LFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0Y2hhdE1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgaW5mb1BhcnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRvbkF1dG9DYW5jZWxsZWQ/LigpO1xuXHRcdFx0XHRjYW5jZWxFeGVjdXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEoY2hhdE1vZGVsIGluc3RhbmNlb2YgQ2hhdE1vZGVsKSkge1xuXHRcdFx0XHQvLyBObyBjaGF0IHN1cmZhY2UgdG8gYXR0YWNoIHRvIFx1MjAxNCBmYWxsIGJhY2sgdG8gZm9jdXNpbmcgdGhlXG5cdFx0XHRcdC8vIHRlcm1pbmFsIGRpcmVjdGx5IHNvIHRoZSB1c2VyIGlzIGF0IGxlYXN0IG5vdCBsZWZ0IGJsb2NrZWQuXG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnJldmVhbFRlcm1pbmFsKHRlcm1pbmFsSW5zdGFuY2UsIHRydWUpLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2UuZm9jdXMoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQoXG5cdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5zZW5zaXRpdmVJbnB1dC50aXRsZScsIFwiVGVybWluYWwgaXMgd2FpdGluZyBmb3Igc2Vuc2l0aXZlIGlucHV0XCIpKSxcblx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnNlbnNpdGl2ZUlucHV0Lm1lc3NhZ2UnLCBcIlRoZSB0ZXJtaW5hbCBjb21tYW5kIGFwcGVhcnMgdG8gYmUgcHJvbXB0aW5nIGZvciBhIHBhc3N3b3JkIG9yIG90aGVyIHNlbnNpdGl2ZSB2YWx1ZS4gRm9jdXMgdGhlIHRlcm1pbmFsIHRvIHR5cGUgaXQgZGlyZWN0bHkgXHUyMDE0IHNlY3JldHMgbXVzdCBub3QgYmUgc2VudCB0aHJvdWdoIGNoYXQuXCIpKSxcblx0XHRcdFx0JycsXG5cdFx0XHRcdGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnNlbnNpdGl2ZUlucHV0LmZvY3VzJywgXCJGb2N1cyBUZXJtaW5hbFwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3J1bkluVGVybWluYWwuc2Vuc2l0aXZlSW5wdXQuY2FuY2VsJywgXCJDYW5jZWwgQ29tbWFuZFwiKSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHBlbmRpbmcgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cGFydC5oaWRlKCk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5yZXZlYWxUZXJtaW5hbCh0ZXJtaW5hbEluc3RhbmNlLCB0cnVlKTtcblx0XHRcdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2UuZm9jdXMoKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgUnVuSW5UZXJtaW5hbFRvb2w6IGZhaWxlZCB0byByZXZlYWwgdGVybWluYWwgZm9yIHNlbnNpdGl2ZSBpbnB1dGAsIGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBFbGljaXRhdGlvblN0YXRlLkFjY2VwdGVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cGVuZGluZyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRwYXJ0LmhpZGUoKTtcblx0XHRcdFx0XHRjYW5jZWxFeGVjdXRpb24oKTtcblx0XHRcdFx0XHRyZXR1cm4gRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCgpID0+IHsgcGVuZGluZyA9IHVuZGVmaW5lZDsgfSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0KTtcblxuXHRcdFx0cGVuZGluZyA9IHBhcnQ7XG5cdFx0XHRjaGF0TW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBwYXJ0KTtcblx0XHRcdC8vIEludGVudGlvbmFsbHkgZG8gTk9UIHJlZ2lzdGVyIGEgZGlzcG9zYWJsZSB0aGF0IGhpZGVzIHRoZSBwYXJ0IG9uIHN0b3JlXG5cdFx0XHQvLyBkaXNwb3NlOiB0aGUgZWxpY2l0YXRpb24gbXVzdCBwZXJzaXN0IHBhc3QgdGhlIHRvb2wgY2FsbCByZXR1cm5pbmcgc28gdGhlXG5cdFx0XHQvLyB1c2VyIGNhbiBzdGlsbCBmb2N1cyB0aGUgdGVybWluYWwgKGFuZCB0eXBlIHRoZWlyIHNlY3JldCkgYWZ0ZXIgdGhlXG5cdFx0XHQvLyBhZ2VudCBoYXMgc3VycmVuZGVyZWQgaXRzIHR1cm4uIFRoZSBwYXJ0IGhpZGVzIGl0c2VsZiBvbiBhY2NlcHQvcmVqZWN0LlxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzdG9yZTtcblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdEF1dG9tYXRpY1NhbmRib3hSZXRyeVRvb2xJbnZvY2F0aW9uVXBkYXRlKHJldHJ5S2luZDogQXV0b21hdGljU2FuZGJveFJldHJ5S2luZCwgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHRvb2xDYWxsSWQ6IHN0cmluZywgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgaXNDb21wbGV0ZTogYm9vbGVhbiwgdG9vbFJlc3VsdE1lc3NhZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBzZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghKGNoYXRNb2RlbCBpbnN0YW5jZW9mIENoYXRNb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3BsYXlDb21tYW5kID0gYnVpbGRDb21tYW5kRGlzcGxheVRleHQodG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5mb3JEaXNwbGF5ID8/IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsKTtcblx0XHRjb25zdCBwcm9ncmVzczogSUNoYXRFeHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlID0ge1xuXHRcdFx0a2luZDogJ2V4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUnLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHRvb2xOYW1lOiBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbFRvb2wuZGlzcGxheU5hbWUnLCAnUnVuIGluIFRlcm1pbmFsJyksXG5cdFx0XHRpc0NvbXBsZXRlLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHJldHJ5S2luZCA9PT0gJ2FsbG93TmV0d29yaydcblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3J1bkluVGVybWluYWwuYWxsb3dOZXR3b3JrLmF1dG9SZXRyeS5pbnZvY2F0aW9uJywgXCJSdW5uaW5nIGB7MH1gIGluIHRoZSBzYW5kYm94IHdpdGggdW5yZXN0cmljdGVkIG5ldHdvcmsgYWNjZXNzXCIsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGRpc3BsYXlDb21tYW5kKSkpXG5cdFx0XHRcdDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdydW5JblRlcm1pbmFsLnVuc2FuZGJveGVkLmF1dG9SZXRyeS5pbnZvY2F0aW9uJywgXCJSdW5uaW5nIGB7MH1gIG91dHNpZGUgdGhlIHNhbmRib3hcIiwgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoZGlzcGxheUNvbW1hbmQpKSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB0b29sUmVzdWx0TWVzc2FnZSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0fTtcblx0XHRjaGF0TW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBwcm9ncmVzcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5BdXRvbWF0aWNTYW5kYm94UmV0cnkob3B0aW9uczoge1xuXHRcdHJldHJ5S2luZDogQXV0b21hdGljU2FuZGJveFJldHJ5S2luZDtcblx0XHRpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb247XG5cdFx0Y291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2s7XG5cdFx0cHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcztcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW47XG5cdFx0YXJnczogSVJ1bkluVGVybWluYWxJbnB1dFBhcmFtcztcblx0XHR0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXHRcdGNvbW1hbmQ6IHN0cmluZztcblx0XHRhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHM6IGJvb2xlYW47XG5cdFx0aXNCYWNrZ3JvdW5kOiBib29sZWFuO1xuXHRcdHJldHJ5UmVhc29uOiBzdHJpbmc7XG5cdH0pOiBQcm9taXNlPElUb29sUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVxdWVzdEFsbG93TmV0d29yayA9IG9wdGlvbnMucmV0cnlLaW5kID09PSAnYWxsb3dOZXR3b3JrJztcblx0XHRjb25zdCByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPSBvcHRpb25zLnJldHJ5S2luZCA9PT0gJ3Vuc2FuZGJveGVkJyAmJiBvcHRpb25zLmFsbG93VW5zYW5kYm94ZWRDb21tYW5kcztcblx0XHRjb25zdCBbb3MsIHNoZWxsXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX29zQmFja2VuZCxcblx0XHRcdHRoaXMuX3Byb2ZpbGVGZXRjaGVyLmdldENvcGlsb3RTaGVsbCgpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJldHJ5UmV3cml0ZVJlc3VsdCA9IGF3YWl0IHRoaXMuX3Jld3JpdGVDb21tYW5kTGluZShvcHRpb25zLmFyZ3MuY29tbWFuZCwge1xuXHRcdFx0Y3dkOiBvcHRpb25zLnRvb2xTcGVjaWZpY0RhdGEuY3dkID8gVVJJLnJldml2ZShvcHRpb25zLnRvb2xTcGVjaWZpY0RhdGEuY3dkKSA6IHVuZGVmaW5lZCxcblx0XHRcdHNoZWxsLFxuXHRcdFx0b3MsXG5cdFx0XHRpc0JhY2tncm91bmQ6IG9wdGlvbnMuaXNCYWNrZ3JvdW5kLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPyBvcHRpb25zLnJldHJ5UmVhc29uIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29yayxcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246IHJlcXVlc3RBbGxvd05ldHdvcmsgPyBvcHRpb25zLnJldHJ5UmVhc29uIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJld3JpdHRlblJldHJ5UmVhc29uID0gKHJlcXVlc3RBbGxvd05ldHdvcmsgPyByZXRyeVJld3JpdGVSZXN1bHQucmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiA6IHJldHJ5UmV3cml0ZVJlc3VsdC5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24pID8/IG9wdGlvbnMucmV0cnlSZWFzb247XG5cdFx0Y29uc3QgcmV0cnlQYXJhbWV0ZXJzOiBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zID0ge1xuXHRcdFx0Li4ub3B0aW9ucy5hcmdzLFxuXHRcdFx0Y29tbWFuZDogb3B0aW9ucy5hcmdzLmNvbW1hbmQsXG5cdFx0XHRhbGxvd1RvUnVuVW5zYW5kYm94ZWRDb21tYW5kczogb3B0aW9ucy5hbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24sXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb246IHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbiA/IHJld3JpdHRlblJldHJ5UmVhc29uIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29yayxcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcmtSZWFzb246IHJlcXVlc3RBbGxvd05ldHdvcmsgPyByZXdyaXR0ZW5SZXRyeVJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IHJldHJ5Umlza0Fzc2Vzc21lbnQgPSB7XG5cdFx0XHR0b29sSWQ6IFRlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWwsXG5cdFx0XHRwYXJhbWV0ZXJzOiB7XG5cdFx0XHRcdC4uLnJldHJ5UGFyYW1ldGVycyxcblx0XHRcdFx0Y29tbWFuZDogcmV0cnlSZXdyaXRlUmVzdWx0LnJld3JpdHRlbkNvbW1hbmQsXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgcmV0cnlDb25maXJtYXRpb25Db21tYW5kID0gb3B0aW9ucy50b29sU3BlY2lmaWNEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcz8uY29tbWFuZExpbmUgPz8gb3B0aW9ucy5jb21tYW5kO1xuXHRcdGNvbnN0IHNob3VsZFJldHJ5ID0gYXdhaXQgdGhpcy5fY29uZmlybUF1dG9tYXRpY1NhbmRib3hSZXRyeShvcHRpb25zLnJldHJ5S2luZCwgb3B0aW9ucy5pbnZvY2F0aW9uLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZSwgcmV0cnlDb25maXJtYXRpb25Db21tYW5kLCBzaGVsbCwgcmV0cnlSZXdyaXRlUmVzdWx0LmJsb2NrZWREb21haW5zLCByZXRyeVJpc2tBc3Nlc3NtZW50LCBvcHRpb25zLnRva2VuKTtcblx0XHRpZiAoIXNob3VsZFJldHJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJldHJ5VG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSA9IHtcblx0XHRcdC4uLm9wdGlvbnMudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZElkOiBgdG9vbC0ke2dlbmVyYXRlVXVpZCgpfWAsXG5cdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRvcmlnaW5hbDogb3B0aW9ucy5hcmdzLmNvbW1hbmQsXG5cdFx0XHRcdHRvb2xFZGl0ZWQ6IHJldHJ5UmV3cml0ZVJlc3VsdC5yZXdyaXR0ZW5Db21tYW5kID09PSBvcHRpb25zLmFyZ3MuY29tbWFuZCA/IHVuZGVmaW5lZCA6IHJldHJ5UmV3cml0ZVJlc3VsdC5yZXdyaXR0ZW5Db21tYW5kLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiByZXRyeVJld3JpdGVSZXN1bHQuZm9yRGlzcGxheUNvbW1hbmQgPz8gbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheShyZXRyeVJld3JpdGVSZXN1bHQucmV3cml0dGVuQ29tbWFuZCA/PyBvcHRpb25zLmFyZ3MuY29tbWFuZCksXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHJldHJ5UmV3cml0ZVJlc3VsdC5pc1NhbmRib3hXcmFwcGVkLFxuXHRcdFx0fSxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogcmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uIHx8IChyZXF1ZXN0QWxsb3dOZXR3b3JrID8gZmFsc2UgOiB1bmRlZmluZWQpLFxuXHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiByZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPyByZXdyaXR0ZW5SZXRyeVJlYXNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RBbGxvd05ldHdvcms6IHJlcXVlc3RBbGxvd05ldHdvcmsgfHwgdW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbjogcmVxdWVzdEFsbG93TmV0d29yayA/IHJld3JpdHRlblJldHJ5UmVhc29uIDogdW5kZWZpbmVkLFxuXHRcdFx0dGVybWluYWxDb21tYW5kVXJpOiB1bmRlZmluZWQsXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmRPdXRwdXQ6IHVuZGVmaW5lZCxcblx0XHRcdHRlcm1pbmFsVGhlbWU6IHVuZGVmaW5lZCxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHRkaWRDb250aW51ZUluQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgcmV0cnlUb29sQ2FsbElkID0gYGF1dG9tYXRpYy0ke29wdGlvbnMucmV0cnlLaW5kID09PSAnYWxsb3dOZXR3b3JrJyA/ICdhbGxvdy1uZXR3b3JrJyA6ICd1bnNhbmRib3gnfS1yZXRyeS0ke2dlbmVyYXRlVXVpZCgpfWA7XG5cdFx0dGhpcy5fYWNjZXB0QXV0b21hdGljU2FuZGJveFJldHJ5VG9vbEludm9jYXRpb25VcGRhdGUob3B0aW9ucy5yZXRyeUtpbmQsIG9wdGlvbnMuaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UsIHJldHJ5VG9vbENhbGxJZCwgcmV0cnlUb29sU3BlY2lmaWNEYXRhLCBmYWxzZSk7XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5pbnZva2Uoe1xuXHRcdFx0Li4ub3B0aW9ucy5pbnZvY2F0aW9uLFxuXHRcdFx0cGFyYW1ldGVyczogcmV0cnlQYXJhbWV0ZXJzLFxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YTogcmV0cnlUb29sU3BlY2lmaWNEYXRhLFxuXHRcdH0sIG9wdGlvbnMuY291bnRUb2tlbnMsIG9wdGlvbnMucHJvZ3Jlc3MsIG9wdGlvbnMudG9rZW4pO1xuXHR9XG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0b29sU3BlY2lmaWNEYXRhKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Rvb2xTcGVjaWZpY0RhdGEgbXVzdCBiZSBwcm92aWRlZCBmb3IgdGhpcyB0b29sJyk7XG5cdFx0fVxuXHRcdGlmICghaW52b2NhdGlvbi5jb250ZXh0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludm9jYXRpb24gY29udGV4dCBtdXN0IGJlIHByb3ZpZGVkIGZvciB0aGlzIHRvb2wnKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kSWQgPSB0b29sU3BlY2lmaWNEYXRhLnRlcm1pbmFsQ29tbWFuZElkO1xuXHRcdGlmICh0b29sU3BlY2lmaWNEYXRhLmFsdGVybmF0aXZlUmVjb21tZW5kYXRpb24pIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiB0b29sU3BlY2lmaWNEYXRhLmFsdGVybmF0aXZlUmVjb21tZW5kYXRpb25cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXJncyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJUnVuSW5UZXJtaW5hbElucHV0UGFyYW1zO1xuXHRcdGNvbnN0IGFsbG93VW5zYW5kYm94ZWRDb21tYW5kcyA9IHRoaXMuX2dldEFsbG93VG9SdW5VbnNhbmRib3hlZENvbW1hbmRzKGFyZ3MpO1xuXHRcdGNvbnN0IHNhbmRib3hQcmVjaGVja0lucHV0cyA9IHRoaXMuX2dldFNhbmRib3hQcmVjaGVja0lucHV0cyhpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlLCBpbnZvY2F0aW9uLmNoYXRSZXF1ZXN0SWQpO1xuXHRcdGNvbnN0IGlzU2FuZGJveEVuYWJsZWQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmlzRW5hYmxlZChzYW5kYm94UHJlY2hlY2tJbnB1dHMpO1xuXHRcdGlmICh0aGlzLl9zaG91bGRSZWplY3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlcXVlc3QoaXNTYW5kYm94RW5hYmxlZCwgYWxsb3dVbnNhbmRib3hlZENvbW1hbmRzLCBhcmdzKSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMuX2dldFVuc2FuZGJveGVkRXhlY3V0aW9uRGlzYWJsZWRNZXNzYWdlKCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IG1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdFx0aW5wdXQ6IGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IG1lc3NhZ2UgfV0sXG5cdFx0XHRcdFx0aXNFcnJvcjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IG1lc3NhZ2UsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBzYW5kYm94UHJlcmVxdWlzaXRlVGVybWluYWxPcHRpb25zID0ge1xuXHRcdFx0Y3JlYXRlVGVybWluYWw6IGFzeW5jICgpID0+IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7fSksXG5cdFx0XHRmb2N1c1Rlcm1pbmFsOiBhc3luYyAodGVybWluYWw6IHsgZm9jdXMoKTogdm9pZCB9KSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0ZXJtaW5hbCBhcyBJVGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5yZXZlYWxUZXJtaW5hbCh0ZXJtaW5hbCBhcyBJVGVybWluYWxJbnN0YW5jZSwgdHJ1ZSk7XG5cdFx0XHRcdHRlcm1pbmFsLmZvY3VzKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5zYW5kYm94UHJlcmVxdWlzaXRlRmFpbHVyZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogdG9vbFNwZWNpZmljRGF0YS5zYW5kYm94UHJlcmVxdWlzaXRlRmFpbHVyZSB9XSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZCA9IGlzU2FuZGJveEVuYWJsZWQgJiYgYXdhaXQgdGhpcy5fdGVybWluYWxTYW5kYm94U2VydmljZS5pc1NhbmRib3hBbGxvd05ldHdvcmtFbmFibGVkKCk7XG5cdFx0aWYgKHRoaXMuX3Nob3VsZFJlamVjdEFsbG93TmV0d29ya1JlcXVlc3QoaXNTYW5kYm94RW5hYmxlZCwgaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZCwgYXJncykpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLl9nZXRBbGxvd05ldHdvcmtSZXF1ZXN0RGlzYWJsZWRNZXNzYWdlKCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IG1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdFx0aW5wdXQ6IGFyZ3MuY29tbWFuZCxcblx0XHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IG1lc3NhZ2UgfV0sXG5cdFx0XHRcdFx0aXNFcnJvcjogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IG1lc3NhZ2UsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgbWlzc2luZyBzYW5kYm94IGRlcGVuZGVuY2llcyBpbnN0YWxsIGZsb3cuXG5cdFx0Ly8gVGhlIHVzZXIgd2FzIHNob3duIGEgY29uZmlybWF0aW9uIHdpbmRvdyBpbiBwcmVwYXJlVG9vbEludm9jYXRpb24uXG5cdFx0aWYgKHRvb2xTcGVjaWZpY0RhdGEubWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXM/Lmxlbmd0aCkge1xuXHRcdFx0aWYgKGludm9jYXRpb24uc2VsZWN0ZWRDdXN0b21CdXR0b24gPT09ICdpbnN0YWxsJykge1xuXHRcdFx0XHQvLyBJbnN0YWxsIGRlcGVuZGVuY2llcywgZm9jdXMgdGVybWluYWwgZm9yIHN1ZG8gcGFzc3dvcmQsIHdhaXQgZm9yIGNvbXBsZXRpb25cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gaW52b2NhdGlvbi5jb250ZXh0LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0Y29uc3QgeyBleGl0Q29kZSB9ID0gYXdhaXQgdGhpcy5fdGVybWluYWxTYW5kYm94U2VydmljZS5pbnN0YWxsTWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXModG9vbFNwZWNpZmljRGF0YS5taXNzaW5nU2FuZGJveERlcGVuZGVuY2llcywgc2Vzc2lvblJlc291cmNlLCB0b2tlbiwgc2FuZGJveFByZXJlcXVpc2l0ZVRlcm1pbmFsT3B0aW9ucyk7XG5cdFx0XHRcdGlmIChleGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmIGV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLmZhaWxlZCcsXG5cdFx0XHRcdFx0XHRcdFx0XCJTYW5kYm94IGRlcGVuZGVuY3kgaW5zdGFsbGF0aW9uIGZhaWxlZCAoZXhpdCBjb2RlIHswfSkuIFRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQuXCIsXG5cdFx0XHRcdFx0XHRcdFx0ZXhpdENvZGVcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4aXRDb2RlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMudW5rbm93bicsXG5cdFx0XHRcdFx0XHRcdFx0XCJDb3VsZCBub3QgZGV0ZXJtaW5lIHdoZXRoZXIgc2FuZGJveCBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbiBzdWNjZWVkZWQuIFRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQuXCJcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVmcmVzaGVkUHJlcmVxcyA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2FuZGJveFNlcnZpY2UuY2hlY2tGb3JTYW5kYm94aW5nUHJlcmVxcyh0cnVlLCBzYW5kYm94UHJlY2hlY2tJbnB1dHMpO1xuXHRcdFx0XHRpZiAocmVmcmVzaGVkUHJlcmVxcy5mYWlsZWRDaGVjayAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHJlZnJlc2hlZFByZXJlcXMuZmFpbGVkQ2hlY2sgPT09IFRlcm1pbmFsU2FuZGJveFByZXJlcXVpc2l0ZUNoZWNrLkJ1YmJsZXdyYXAgJiYgcmVmcmVzaGVkUHJlcmVxcy5yZW1lZGlhdGlvbnM/Lmxlbmd0aFxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMuYnViYmxld3JhcEZhaWxlZCcsIFwiU2FuZGJveCBkZXBlbmRlbmNpZXMgd2VyZSBpbnN0YWxsZWQsIGJ1dCBidWJibGV3cmFwIGNhbm5vdCBjcmVhdGUgdGhlIHJlcXVpcmVkIHNhbmRib3ggbmFtZXNwYWNlLiBSdW4gdGhlIGNvbW1hbmQgYWdhaW4gdG8gY2hvb3NlIGFuIGF2YWlsYWJsZSByZXBhaXIgb3B0aW9uLlwiKVxuXHRcdFx0XHRcdFx0XHRcdDogcmVmcmVzaGVkUHJlcmVxcy5mYWlsZWRDaGVjayA9PT0gVGVybWluYWxTYW5kYm94UHJlcmVxdWlzaXRlQ2hlY2suQnViYmxld3JhcFxuXHRcdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5taXNzaW5nRGVwcy5idWJibGV3cmFwRmFpbGVkTm9SZXBhaXInLCBcIlNhbmRib3ggZGVwZW5kZW5jaWVzIHdlcmUgaW5zdGFsbGVkLCBidXQgYnViYmxld3JhcCBjYW5ub3QgY3JlYXRlIHRoZSByZXF1aXJlZCBzYW5kYm94IG5hbWVzcGFjZSBvbiB0aGlzIHN5c3RlbS4gVGhlIGNvbW1hbmQgd2FzIG5vdCBleGVjdXRlZC5cIilcblx0XHRcdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMucmVjaGVja0ZhaWxlZCcsIFwiU2FuZGJveCBwcmVyZXF1aXNpdGVzIGFyZSBzdGlsbCBub3Qgc2F0aXNmaWVkIGFmdGVyIGluc3RhbGxhdGlvbi4gVGhlIGNvbW1hbmQgd2FzIG5vdCBleGVjdXRlZC5cIiksXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnUnVuSW5UZXJtaW5hbFRvb2w6IFNhbmRib3ggZGVwZW5kZW5jeSBpbnN0YWxsYXRpb24gc3VjY2VlZGVkJyk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0J3J1bkluVGVybWluYWwubWlzc2luZ0RlcHMuaW5zdGFsbGVkJyxcblx0XHRcdFx0XHRcdFx0XCJTYW5kYm94IGRlcGVuZGVuY2llcyB3ZXJlIGluc3RhbGxlZCBzdWNjZXNzZnVsbHkuIElmIHRoZSBpc3N1ZSBwZXJzaXN0cywgcmVsb2FkIHRoZSB3aW5kb3cgYW5kIHRyeSBydW5uaW5nIHRoZSBjb21tYW5kIGFnYWluLlwiXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVXNlciBjaG9zZSB0byBjYW5jZWwgXHUyMDE0IGRvIG5vdCBydW4gdGhlIGNvbW1hbmRcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdSdW5JblRlcm1pbmFsVG9vbDogVXNlciBjYW5jZWxsZWQgc2FuZGJveCBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbicpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCdydW5JblRlcm1pbmFsLm1pc3NpbmdEZXBzLmNhbmNlbGxlZCcsXG5cdFx0XHRcdFx0XHRcdFwiU2FuZGJveCBkZXBlbmRlbmN5IGluc3RhbGxhdGlvbiB3YXMgY2FuY2VsbGVkIGJ5IHRoZSB1c2VyLlwiXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0b29sU3BlY2lmaWNEYXRhLnNhbmRib3hSZW1lZGlhdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRSZW1lZGlhdGlvbiA9IHRvb2xTcGVjaWZpY0RhdGEuc2FuZGJveFJlbWVkaWF0aW9uc1swXSBhcyBUZXJtaW5hbFNhbmRib3hQcmVDaGVja1JlbWVkaWF0aW9uO1xuXHRcdFx0Y29uc3QgeyBleGl0Q29kZSB9ID0gYXdhaXQgdGhpcy5fdGVybWluYWxTYW5kYm94U2VydmljZS5ydW5TYW5kYm94UmVtZWRpYXRpb24oc2VsZWN0ZWRSZW1lZGlhdGlvbiwgaW52b2NhdGlvbi5jb250ZXh0LnNlc3Npb25SZXNvdXJjZSwgdG9rZW4sIHNhbmRib3hQcmVyZXF1aXNpdGVUZXJtaW5hbE9wdGlvbnMpO1xuXHRcdFx0aWYgKGV4aXRDb2RlICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRCdWJibGV3cmFwVW5zdXBwb3J0ZWRSZXN1bHQoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlZnJlc2hlZFByZXJlcXMgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmNoZWNrRm9yU2FuZGJveGluZ1ByZXJlcXModHJ1ZSwgc2FuZGJveFByZWNoZWNrSW5wdXRzKTtcblx0XHRcdGlmIChyZWZyZXNoZWRQcmVyZXFzLmZhaWxlZENoZWNrICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldEJ1YmJsZXdyYXBVbnN1cHBvcnRlZFJlc3VsdCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdSdW5JblRlcm1pbmFsVG9vbDogQnViYmxld3JhcCByZW1lZGlhdGlvbiBhbmQgY2FwYWJpbGl0eSByZWNoZWNrIHN1Y2NlZWRlZCwgcHJvY2VlZGluZyB3aXRoIGNvbW1hbmQgZXhlY3V0aW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhlY3V0aW9uT3B0aW9ucyA9IHRoaXMuX3Jlc29sdmVFeGVjdXRpb25PcHRpb25zKGFyZ3MpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBJbnZva2luZyB3aXRoIG9wdGlvbnMgJHtKU09OLnN0cmluZ2lmeShhcmdzKX1gKTtcblx0XHRsZXQgdG9vbFJlc3VsdE1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYXJncy50aW1lb3V0ICE9PSB1bmRlZmluZWQgJiYgKE51bWJlci5pc05hTihhcmdzLnRpbWVvdXQpIHx8IGFyZ3MudGltZW91dCA8IDApKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ0Vycm9yOiB0aW1lb3V0IG11c3QgYmUgYSBub24tbmVnYXRpdmUgbnVtYmVyIG9mIG1pbGxpc2Vjb25kcyAodXNlIDAgZm9yIG5vIHRpbWVvdXQpLidcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChleGVjdXRpb25PcHRpb25zLm1vZGUgPT09ICdzeW5jJyAmJiBhcmdzLnRpbWVvdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gVGltZW91dCBpcyBvcHRpb25hbCBmb3IgbW9kZT1zeW5jOiB3aGVuIG9taXR0ZWQsIHRoZSB0b29sIHdhaXRzIGZvclxuXHRcdFx0Ly8gdGhlIGNvbW1hbmQgdG8gY29tcGxldGUgd2l0aCBubyBoYXJkIGNhcC4gTW9kZWxzIGZyZXF1ZW50bHkgcGlja1xuXHRcdFx0Ly8gdGltZW91dHMgdGhhdCBhcmUgdG9vIHNob3J0IGZvciBwYWNrYWdlIGluc3RhbGxzLCBidWlsZHMsIGFuZFxuXHRcdFx0Ly8gbG9uZy1ydW5uaW5nIHNjcmlwdHMsIHdoaWNoIGNhdXNlcyB0aGUgY29tbWFuZCB0byBiZSBtb3ZlZCB0byB0aGVcblx0XHRcdC8vIGJhY2tncm91bmQgdW5uZWNlc3NhcmlseS5cblx0XHRcdGFyZ3MudGltZW91dCA9IDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFNlc3Npb25SZXNvdXJjZSA9IGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Ly8gU3ViYWdlbnQtaW5pdGlhdGVkIHRlcm1pbmFscyBjYW5ub3QgcmVjZWl2ZSBzdGVlcmluZyBtZXNzYWdlczsgdGhlIHN1YmFnZW50XG5cdFx0Ly8gcnVucyBpbiBpdHMgb3duIHRvb2wtY2FsbGluZyBsb29wIGFuZCBzaG91bGQgcG9sbCB3aXRoIGdldF90ZXJtaW5hbF9vdXRwdXQuXG5cdFx0Y29uc3Qgc2hvdWxkU2VuZE5vdGlmaWNhdGlvbnMgPSAhaW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZDtcblx0XHRjb25zdCBjb21tYW5kID0gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS51c2VyRWRpdGVkID8/IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsO1xuXHRcdGNvbnN0IGRpZFVzZXJFZGl0Q29tbWFuZCA9IChcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUudXNlckVkaXRlZCAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnVzZXJFZGl0ZWQgIT09IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUub3JpZ2luYWxcblx0XHQpO1xuXHRcdGNvbnN0IGRpZFRvb2xFZGl0Q29tbWFuZCA9IChcblx0XHRcdCFkaWRVc2VyRWRpdENvbW1hbmQgJiZcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQgIT09IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUub3JpZ2luYWwgJiZcblx0XHRcdC8vIE9ubHkgY29uc2lkZXIgaXQgYSBtZWFuaW5nZnVsIGVkaXQgaWYgdGhlIGRpc3BsYXkgZm9ybSBhbHNvIGRpZmZlcnMgZnJvbSB0aGVcblx0XHRcdC8vIG9yaWdpbmFsLiBDb3NtZXRpYyByZXdyaXRlcyBsaWtlIHByZXBlbmRpbmcgYSBzcGFjZSB0byBwcmV2ZW50IHNoZWxsIGhpc3Rvcnlcblx0XHRcdC8vIHNob3VsZCBub3QgdHJpZ2dlciB0aGUgXCJ0b29sIHNpbXBsaWZpZWQgdGhlIGNvbW1hbmRcIiBub3RlLlxuXHRcdFx0bm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheSh0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQpLnRyaW0oKSAhPT0gbm9ybWFsaXplVGVybWluYWxDb21tYW5kRm9yRGlzcGxheSh0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsKS50cmltKClcblx0XHQpO1xuXG5cdFx0Y29uc3QgZGlkU2FuZGJveFdyYXBDb21tYW5kID0gdG9vbFNwZWNpZmljRGF0YS5jb21tYW5kTGluZS5pc1NhbmRib3hXcmFwcGVkID09PSB0cnVlO1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lRm9yTWV0YWRhdGEgPSBpc1NhbmRib3hFbmFibGVkXG5cdFx0XHQ/IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUuZm9yRGlzcGxheSA/PyB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRpZFNhbmRib3hXcmFwQ29tbWFuZCkge1xuXHRcdFx0Y29uc3QgZGVuaWVkQWNjZXNzID0gYXdhaXQgdGhpcy5fZ2V0RGVuaWVkU2FuZGJveEZpbGVBY2Nlc3MoYXJncy5yZXF1ZXN0RmlsZVZhbGlkYXRpb25DaGVjaywgc2FuZGJveFByZWNoZWNrSW5wdXRzKTtcblx0XHRcdGlmIChkZW5pZWRBY2Nlc3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5fYnVpbGRTYW5kYm94RmlsZUFjY2Vzc0RlbmllZE1lc3NhZ2UoZGVuaWVkQWNjZXNzKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IG1lc3NhZ2UsXG5cdFx0XHRcdFx0dG9vbFJlc3VsdERldGFpbHM6IHtcblx0XHRcdFx0XHRcdGlucHV0OiBhcmdzLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IG1lc3NhZ2UgfV0sXG5cdFx0XHRcdFx0XHRpc0Vycm9yOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBtZXNzYWdlLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBlcnJvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5UmVhc29uID0gbG9jYWxpemUoJ3J1bkluVGVybWluYWwudW5zYW5kYm94ZWQuYXV0b1JldHJ5LnJlYXNvbicsICdUaGUgc2FuZGJveGVkIGV4ZWN1dGlvbiBvdXRwdXQgaW5kaWNhdGVkIHRoZSBzYW5kYm94IGJsb2NrZWQgdGhlIGNvbW1hbmQuJyk7XG5cdFx0Y29uc3QgYXV0b21hdGljQWxsb3dOZXR3b3JrUmV0cnlSZWFzb24gPSBsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5hbGxvd05ldHdvcmsuYXV0b1JldHJ5LnJlYXNvbicsICdUaGUgc2FuZGJveGVkIGV4ZWN1dGlvbiBvdXRwdXQgaW5kaWNhdGVkIHRoZSBzYW5kYm94IGJsb2NrZWQgcmVxdWlyZWQgbmV0d29yayBhY2Nlc3MuJyk7XG5cdFx0Y29uc3QgaXNOZXdTZXNzaW9uID0gIWV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24gJiYgIXRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5oYXMoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRjb25zdCB0aW1pbmdTdGFydCA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgdGVybUlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdGVybWluYWxUb29sU2Vzc2lvbklkID0gKHRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSkudGVybWluYWxUb29sU2Vzc2lvbklkO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBVbmlmaWVkIHRlcm1pbmFsIGluaXRpYWxpemF0aW9uXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IENyZWF0aW5nICR7ZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbiA/ICdiYWNrZ3JvdW5kJyA6ICdmb3JlZ3JvdW5kJ30gdGVybWluYWwuIHRlcm1JZD0ke3Rlcm1JZH0sIGNoYXRTZXNzaW9uUmVzb3VyY2U9JHtjaGF0U2Vzc2lvblJlc291cmNlfWApO1xuXHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IGF3YWl0IHRoaXMuX2luaXRUZXJtaW5hbChjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsIHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbiwgdG9rZW4pO1xuXG5cdFx0dGhpcy5faGFuZGxlVGVybWluYWxWaXNpYmlsaXR5KHRvb2xUZXJtaW5hbCwgY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRjb25zdCB0aW1pbmdDb25uZWN0TXMgPSBEYXRlLm5vdygpIC0gdGltaW5nU3RhcnQ7XG5cblx0XHRjb25zdCB4dGVybSA9IGF3YWl0IHRvb2xUZXJtaW5hbC5pbnN0YW5jZS54dGVybVJlYWR5UHJvbWlzZTtcblx0XHRpZiAoIXh0ZXJtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0luc3RhbmNlIHdhcyBkaXNwb3NlZCBiZWZvcmUgeHRlcm0uanMgd2FzIHJlYWR5Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHRvb2xUZXJtaW5hbC5pbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblxuXHRcdGxldCBpbnB1dFVzZXJDaGFycyA9IDA7XG5cdFx0bGV0IGlucHV0VXNlclNpZ2ludCA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZCh4dGVybS5yYXcub25EYXRhKGRhdGEgPT4ge1xuXHRcdFx0aWYgKCF0ZWxlbWV0cnlJZ25vcmVkU2VxdWVuY2VzLmluY2x1ZGVzKGRhdGEpKSB7XG5cdFx0XHRcdGlucHV0VXNlckNoYXJzICs9IGRhdGEubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0aW5wdXRVc2VyU2lnaW50IHx8PSBkYXRhID09PSAnXFx4MDMnO1xuXHRcdH0pKTtcblxuXHRcdC8vIFVuaWZpZWQgZXhlY3V0aW9uOiBhbHdheXMgdXNlIGV4ZWN1dGUgc3RyYXRlZ3kgZm9yIGJvdGggYmFja2dyb3VuZCBhbmQgZm9yZWdyb3VuZFxuXHRcdGxldCB0ZXJtaW5hbFJlc3VsdCA9ICcnO1xuXHRcdGxldCBvdXRwdXRMaW5lQ291bnQgPSAtMTtcblx0XHRsZXQgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWx0QnVmZmVyUmVzdWx0OiBJVG9vbFJlc3VsdCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlkVGltZW91dCA9IGZhbHNlO1xuXHRcdGxldCBkaWRJZGxlU2lsZW5jZSA9IGZhbHNlO1xuXHRcdGxldCBkaWRJbnB1dE5lZWRlZCA9IGZhbHNlO1xuXHRcdGxldCBkaWRTZW5zaXRpdmVBdXRvQ2FuY2VsbGVkID0gZmFsc2U7XG5cdFx0Ly8gQ292ZXJzIGJvdGggdGVybWluYWxzIHRoYXQgc3RhcnQgYXMgYmFja2dyb3VuZCAocGVyc2lzdGVudFNlc3Npb24pIGFuZFxuXHRcdC8vIGZvcmVncm91bmQgdGVybWluYWxzIHRoYXQgbGF0ZXIgbW92ZSB0byBiYWNrZ3JvdW5kICh0aW1lb3V0L2NvbnRpbnVlLWluLWJnKS5cblx0XHRsZXQgaXNCYWNrZ3JvdW5kRXhlY3V0aW9uID0gZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbjtcblx0XHRsZXQgdGltZW91dFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCB0aW1lb3V0UmFjZVByb21pc2U6IFByb21pc2U8eyB0eXBlOiAndGltZW91dCcgfT4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG91dHB1dE1vbml0b3I6IE91dHB1dE1vbml0b3IgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHBvbGxpbmdSZXN1bHQ6IElQb2xsaW5nUmVzdWx0ICYgeyBwb2xsRHVyYXRpb25NczogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZXhlY3V0ZUNhbmNlbGxhdGlvbiA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pKTtcblxuXHRcdC8vIFNldCB1cCB0aW1lb3V0IGZvciBib3RoIHN5bmMgKGNvbXBsZXRpb24pIGFuZCBhc3luYyAoaWRsZSkgd2FpdCBzdHJhdGVnaWVzLlxuXHRcdGNvbnN0IHRpbWVvdXRWYWx1ZSA9IGFyZ3MudGltZW91dCAhPT0gdW5kZWZpbmVkID8gY2xhbXAoYXJncy50aW1lb3V0LCAwLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRpbWVvdXRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHRpbWVvdXRWYWx1ZSA+IDApIHtcblx0XHRcdGNvbnN0IHNob3VsZEVuZm9yY2VUaW1lb3V0ID0gZXhlY3V0aW9uT3B0aW9ucy53YWl0U3RyYXRlZ3kgPT09ICdpZGxlJyB8fCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkVuZm9yY2VUaW1lb3V0RnJvbU1vZGVsKSA9PT0gdHJ1ZTtcblx0XHRcdGlmIChzaG91bGRFbmZvcmNlVGltZW91dCkge1xuXHRcdFx0XHR0aW1lb3V0UHJvbWlzZSA9IHRpbWVvdXQodGltZW91dFZhbHVlKTtcblx0XHRcdFx0dGltZW91dFJhY2VQcm9taXNlID0gdGltZW91dFByb21pc2UudGhlbihcblx0XHRcdFx0XHQoKSA9PiAoeyB0eXBlOiAndGltZW91dCcgYXMgY29uc3QgfSlcblx0XHRcdFx0KS5jYXRjaCgoKSA9PiAoeyB0eXBlOiAndGltZW91dCcgYXMgY29uc3QgfSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNldCB1cCBjb250aW51ZSBpbiBiYWNrZ3JvdW5kIGxpc3RlbmVyIC0gdXNlcyBhIHJhY2UgcHJvbWlzZSBpbnN0ZWFkIG9mIGNhbmNlbGxhdGlvblxuXHRcdC8vIHRvIGFsbG93IHRoZSBleGVjdXRpb24gc3RyYXRlZ3kgdG8gY29udGludWUgcnVubmluZyBhbmQgcHJlc2VydmUgaXRzIG1hcmtlclxuXHRcdGxldCBjb250aW51ZUluQmFja2dyb3VuZFJlc29sdmU6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb250aW51ZUluQmFja2dyb3VuZFByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnRpbnVlSW5CYWNrZ3JvdW5kUmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0fSk7XG5cdFx0aWYgKHRlcm1pbmFsVG9vbFNlc3Npb25JZCkge1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2Uub25EaWRDb250aW51ZUluQmFja2dyb3VuZChzZXNzaW9uSWQgPT4ge1xuXHRcdFx0XHRpZiAoc2Vzc2lvbklkID09PSB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdFx0XHRjb25zdCBleGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5nZXQodGVybUlkKTtcblx0XHRcdFx0XHRleGVjdXRpb24/LnNldEJhY2tncm91bmQ/LigpO1xuXHRcdFx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0Ly8gUmVzb2x2ZSB0aGUgcmFjZSBwcm9taXNlIGluc3RlYWQgb2YgY2FuY2VsbGluZyAtIHRoaXMgYWxsb3dzIHRoZSBleGVjdXRpb25cblx0XHRcdFx0XHQvLyB0byBjb250aW51ZSBydW5uaW5nIHNvIGl0IGNhbiBiZSBhd2FpdGVkIGxhdGVyXG5cdFx0XHRcdFx0Y29udGludWVJbkJhY2tncm91bmRSZXNvbHZlPy4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGxldCBleGVjdXRpb25Qcm9taXNlOiBQcm9taXNlPElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdD4gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIENyZWF0ZSB1bmlmaWVkIEFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIChjcmVhdGVzIGFuZCBvd25zIHRoZSBzdHJhdGVneSlcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbixcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0dGVybUlkLFxuXHRcdFx0XHR0b29sVGVybWluYWwsXG5cdFx0XHRcdGNvbW1hbmREZXRlY3Rpb24hLFxuXHRcdFx0XHRleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBSdW5JblRlcm1pbmFsVG9vbDogVXNpbmcgXFxgJHtleGVjdXRpb24uc3RyYXRlZ3kudHlwZX1cXGAgZXhlY3V0ZSBzdHJhdGVneSBmb3IgY29tbWFuZCBcXGAke2NvbW1hbmR9XFxgYCk7XG5cdFx0XHRzdG9yZS5hZGQoZXhlY3V0aW9uKTtcblx0XHRcdHRoaXMuX3NldEFjdGl2ZUV4ZWN1dGlvbih0ZXJtSWQsIGV4ZWN1dGlvbik7XG5cblx0XHRcdC8vIFNldCB1cCBPdXRwdXRNb25pdG9yIHdoZW4gc3RhcnQgbWFya2VyIGlzIGNyZWF0ZWRcblx0XHRcdGNvbnN0IHN0YXJ0TWFya2VyUHJvbWlzZSA9IEV2ZW50LnRvUHJvbWlzZShleGVjdXRpb24uc3RyYXRlZ3kub25EaWRDcmVhdGVTdGFydE1hcmtlcik7XG5cdFx0XHRjb25zdCBvdXRwdXRNb25pdG9yUG9sbEZuID0gZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvblxuXHRcdFx0XHQ/IGFzeW5jIChleGVjdXRpb25Gb3JQb2xsOiB7IGdldE91dHB1dDogKCkgPT4gc3RyaW5nIH0pOiBQcm9taXNlPElQb2xsaW5nUmVzdWx0IHwgdW5kZWZpbmVkPiA9PiAoe1xuXHRcdFx0XHRcdG91dHB1dDogZXhlY3V0aW9uRm9yUG9sbC5nZXRPdXRwdXQoKSxcblx0XHRcdFx0XHRzdGF0ZTogT3V0cHV0TW9uaXRvclN0YXRlLklkbGUsXG5cdFx0XHRcdH0pXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0c3RvcmUuYWRkKGV4ZWN1dGlvbi5zdHJhdGVneS5vbkRpZENyZWF0ZVN0YXJ0TWFya2VyKHN0YXJ0TWFya2VyID0+IHtcblx0XHRcdFx0aWYgKCFvdXRwdXRNb25pdG9yKSB7XG5cdFx0XHRcdFx0b3V0cHV0TW9uaXRvciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0T3V0cHV0TW9uaXRvcixcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0aW5zdGFuY2U6IHRvb2xUZXJtaW5hbC5pbnN0YW5jZSxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBjaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRnZXRPdXRwdXQ6IChtYXJrZXI/OiBJWHRlcm1NYXJrZXIpID0+IGV4ZWN1dGlvbi5nZXRPdXRwdXQobWFya2VyID8/IHN0YXJ0TWFya2VyKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG91dHB1dE1vbml0b3JQb2xsRm4sXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uLmNvbnRleHQsXG5cdFx0XHRcdFx0XHR0b2tlbixcblx0XHRcdFx0XHRcdGNvbW1hbmRcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFN0YXJ0IGV4ZWN1dGlvbiAobm9uLWJsb2NraW5nIC0gcnVucyBpbiBiYWNrZ3JvdW5kKVxuXHRcdFx0ZXhlY3V0aW9uUHJvbWlzZSA9IGV4ZWN1dGlvbi5zdGFydChjb21tYW5kLCBleGVjdXRlQ2FuY2VsbGF0aW9uLnRva2VuLCBjb21tYW5kSWQsIGNvbW1hbmRMaW5lRm9yTWV0YWRhdGEpO1xuXG5cdFx0XHRpZiAoZXhlY3V0aW9uT3B0aW9ucy53YWl0U3RyYXRlZ3kgPT09ICdpZGxlJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogU3RhcnRpbmcgcGVyc2lzdGVudCBleGVjdXRpb24gd2l0aCBpZGxlIHdhaXQgc3RyYXRlZ3kgXFxgJHtjb21tYW5kfVxcYGApO1xuXHRcdFx0XHRhd2FpdCBzdGFydE1hcmtlclByb21pc2U7XG5cdFx0XHRcdGxldCBpZGxlVGltZWRPdXQgPSBmYWxzZTtcblx0XHRcdFx0aWYgKG91dHB1dE1vbml0b3IpIHtcblx0XHRcdFx0XHRpZiAodGltZW91dFJhY2VQcm9taXNlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpZGxlUmFjZSA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdFx0XHRcdEV2ZW50LnRvUHJvbWlzZShvdXRwdXRNb25pdG9yLm9uRGlkRmluaXNoQ29tbWFuZCkudGhlbigoKSA9PiAoeyB0eXBlOiAnaWRsZScgYXMgY29uc3QgfSkpLFxuXHRcdFx0XHRcdFx0XHR0aW1lb3V0UmFjZVByb21pc2Vcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0aWYgKGlkbGVSYWNlLnR5cGUgPT09ICd0aW1lb3V0Jykge1xuXHRcdFx0XHRcdFx0XHRpZGxlVGltZWRPdXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogVGltZW91dCByZWFjaGVkIHdhaXRpbmcgZm9yIGlkbGUgc2lnbmFsLCByZXR1cm5pbmcgb3V0cHV0IGNvbGxlY3RlZCBzbyBmYXJgKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHBvbGxpbmdSZXN1bHQgPSBvdXRwdXRNb25pdG9yLnBvbGxpbmdSZXN1bHQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShvdXRwdXRNb25pdG9yLm9uRGlkRmluaXNoQ29tbWFuZCk7XG5cdFx0XHRcdFx0XHRwb2xsaW5nUmVzdWx0ID0gb3V0cHV0TW9uaXRvci5wb2xsaW5nUmVzdWx0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRBcnRpZmFjdENvbGxlY3Rvci5jYXB0dXJlKHRvb2xTcGVjaWZpY0RhdGEsIHRvb2xUZXJtaW5hbC5pbnN0YW5jZSwgY29tbWFuZElkKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sU3BlY2lmaWNEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlID8/IHt9O1xuXHRcdFx0XHRzdGF0ZS50aW1lc3RhbXAgPSBzdGF0ZS50aW1lc3RhbXAgPz8gdGltaW5nU3RhcnQ7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPSBzdGF0ZTtcblxuXHRcdFx0XHRsZXQgcmVzdWx0VGV4dCA9IChcblx0XHRcdFx0XHRkaWRTYW5kYm94V3JhcENvbW1hbmQgPyBgQ29tbWFuZCBpcyBub3cgcnVubmluZyBpbiB0ZXJtaW5hbCB3aXRoIElEPSR7dGVybUlkfWBcblx0XHRcdFx0XHRcdDogZGlkVXNlckVkaXRDb21tYW5kXG5cdFx0XHRcdFx0XHRcdD8gYE5vdGU6IFRoZSB1c2VyIG1hbnVhbGx5IGVkaXRlZCB0aGUgY29tbWFuZCB0byBcXGAke2NvbW1hbmR9XFxgLCBhbmQgdGhhdCBjb21tYW5kIGlzIG5vdyBydW5uaW5nIGluIHRlcm1pbmFsIHdpdGggSUQ9JHt0ZXJtSWR9YFxuXHRcdFx0XHRcdFx0XHQ6IGRpZFRvb2xFZGl0Q29tbWFuZFxuXHRcdFx0XHRcdFx0XHRcdD8gYE5vdGU6IFRoZSB0b29sIHNpbXBsaWZpZWQgdGhlIGNvbW1hbmQgdG8gXFxgJHtjb21tYW5kfVxcYCwgYW5kIHRoYXQgY29tbWFuZCBpcyBub3cgcnVubmluZyBpbiB0ZXJtaW5hbCB3aXRoIElEPSR7dGVybUlkfWBcblx0XHRcdFx0XHRcdFx0XHQ6IGBDb21tYW5kIGlzIHJ1bm5pbmcgaW4gdGVybWluYWwgd2l0aCBJRD0ke3Rlcm1JZH1gXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IGJhY2tncm91bmRPdXRwdXQgPSBwb2xsaW5nUmVzdWx0Py5vdXRwdXQgPz8gKGlkbGVUaW1lZE91dCA/IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IG91dHB1dEFuYWx5emVyTWVzc2FnZSA9IGJhY2tncm91bmRPdXRwdXRcblx0XHRcdFx0XHQ/IGF3YWl0IHRoaXMuX2dldE91dHB1dEFuYWx5emVyTWVzc2FnZSh1bmRlZmluZWQsIGJhY2tncm91bmRPdXRwdXQsIGNvbW1hbmQsIGRpZFNhbmRib3hXcmFwQ29tbWFuZClcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGlkbGVUaW1lZE91dCkge1xuXHRcdFx0XHRcdHJlc3VsdFRleHQgKz0gYFxcbiBUaW1lZCBvdXQgd2FpdGluZyBmb3IgdGhlIGNvbW1hbmQgdG8gYmVjb21lIGlkbGUuIFRoZSBjb21tYW5kIGlzIHN0aWxsIHJ1bm5pbmcsIHdpdGggb3V0cHV0OlxcbmA7XG5cdFx0XHRcdFx0aWYgKG91dHB1dEFuYWx5emVyTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBgJHtvdXRwdXRBbmFseXplck1lc3NhZ2V9XFxuYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBiYWNrZ3JvdW5kT3V0cHV0ID8/ICcnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHBvbGxpbmdSZXN1bHQgJiYgcG9sbGluZ1Jlc3VsdC5zdGF0ZSA9PT0gT3V0cHV0TW9uaXRvclN0YXRlLklkbGUpIHtcblx0XHRcdFx0XHRyZXN1bHRUZXh0ICs9IGBcXG4gVGhlIGNvbW1hbmQgYmVjYW1lIGlkbGUgd2l0aCBvdXRwdXQ6XFxuYDtcblx0XHRcdFx0XHRpZiAob3V0cHV0QW5hbHl6ZXJNZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHRUZXh0ICs9IGAke291dHB1dEFuYWx5emVyTWVzc2FnZX1cXG5gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXN1bHRUZXh0ICs9IHBvbGxpbmdSZXN1bHQub3V0cHV0O1xuXHRcdFx0XHRcdHJlc3VsdFRleHQgKz0gYFxcbiR7dGhpcy5fYnVpbGRJbnB1dE5lZWRlZFN0ZWVyaW5nVGV4dChjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsICdub25lJyl9YDtcblx0XHRcdFx0fSBlbHNlIGlmIChwb2xsaW5nUmVzdWx0KSB7XG5cdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBgXFxuIFRoZSBjb21tYW5kIGlzIHN0aWxsIHJ1bm5pbmcsIHdpdGggb3V0cHV0OlxcbmA7XG5cdFx0XHRcdFx0aWYgKG91dHB1dEFuYWx5emVyTWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBgJHtvdXRwdXRBbmFseXplck1lc3NhZ2V9XFxuYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0VGV4dCArPSBwb2xsaW5nUmVzdWx0Lm91dHB1dDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbmRDd2QgPSBhd2FpdCB0b29sVGVybWluYWwuaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0b29sTWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGV4aXRDb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRpZDogdGVybUlkLFxuXHRcdFx0XHRcdFx0dGVybWluYWxJZDogdG9vbFRlcm1pbmFsLmluc3RhbmNlLmluc3RhbmNlSWQsXG5cdFx0XHRcdFx0XHRjd2Q6IGVuZEN3ZD8udG9TdHJpbmcoKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcmVzdWx0VGV4dCxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEZvcmVncm91bmQgbW9kZTogcmFjZSBleGVjdXRpb24gY29tcGxldGlvbiBhZ2FpbnN0IGNvbnRpbnVlIGluIGJhY2tncm91bmQuXG5cdFx0XHRcdC8vIEFsc28gcmFjZSBvbiBvdXRwdXQgbW9uaXRvciBpbnB1dC1uZWVkZWQgc28gdGhhdCBpbnRlcmFjdGl2ZSBwcm9tcHRzXG5cdFx0XHRcdC8vIHJldHVybiBvdXRwdXQgdG8gdGhlIGFnZW50IGVhcmx5IGluc3RlYWQgb2Ygd2FpdGluZyBmb3IgdGltZW91dC5cblx0XHRcdFx0Y29uc3QgcmFjZUNsZWFudXAgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdC8vIFNlbnNpdGl2ZSBwcm9tcHRzIChwYXNzd29yZHMsIE9UUHMsIFx1MjAyNikgbXVzdCBuZXZlciByZWFjaCB0aGUgbW9kZWwuXG5cdFx0XHRcdC8vIFNob3cgYSBjb25maXJtYXRpb24gZGlhbG9nIHRoYXQgZm9jdXNlcyB0aGUgdGVybWluYWwgc28gdGhlIHVzZXJcblx0XHRcdFx0Ly8gdHlwZXMgdGhlIHNlY3JldCBkaXJlY3RseS4gVGhlIHJhY2UgaXMgKm5vdCogcmVzb2x2ZWQgYnkgc2Vuc2l0aXZlXG5cdFx0XHRcdC8vIHByb21wdHMgXHUyMDE0IHRoZSBydW5uaW5nIGNvbW1hbmQga2VlcHMgd2FpdGluZyBmb3IgdXNlciBpbnB1dCB1bnRpbFxuXHRcdFx0XHQvLyBlaXRoZXIgaXQgY29tcGxldGVzIChleGVjdXRpb25Qcm9taXNlIHdpbnMpIG9yIHRoZSB1c2VyIGNhbmNlbHNcblx0XHRcdFx0Ly8gaXQgZnJvbSB0aGUgZGlhbG9nICh3aGljaCBjYW5jZWxzIGV4ZWN1dGlvbiBhbmQgYWxzbyBtYWtlc1xuXHRcdFx0XHQvLyBleGVjdXRpb25Qcm9taXNlIHJlc29sdmUpLiBUaGlzIG1lYW5zIHdlIG5ldmVyIGhhbmQgYSBzZWNyZXRcblx0XHRcdFx0Ly8gcHJvbXB0IGJhY2sgdG8gdGhlIG1vZGVsOyB0aGUgdXNlciBpcyBhbHdheXMgaW4gY29udHJvbC5cblx0XHRcdFx0Ly9cblx0XHRcdFx0Ly8gb3V0cHV0TW9uaXRvciBpcyBjcmVhdGVkIGxhdGVyIGluc2lkZSBgb25EaWRDcmVhdGVTdGFydE1hcmtlcmAsXG5cdFx0XHRcdC8vIHNvIHdlIG11c3Qgd2FpdCBvbiBgc3RhcnRNYXJrZXJQcm9taXNlYCBiZWZvcmUgcmVnaXN0ZXJpbmcgdGhlXG5cdFx0XHRcdC8vIGxpc3RlbmVyIFx1MjAxNCBvdGhlcndpc2Ugb3V0cHV0TW9uaXRvciBpcyBzdGlsbCB1bmRlZmluZWQgaGVyZSBhbmRcblx0XHRcdFx0Ly8gdGhlIHNlbnNpdGl2ZSBldmVudCBuZXZlciByZWFjaGVzIHVzLlxuXHRcdFx0XHRzdGFydE1hcmtlclByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKG91dHB1dE1vbml0b3IgJiYgIXJhY2VDbGVhbnVwLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHJhY2VDbGVhbnVwLmFkZCh0aGlzLl9yZWdpc3RlclNlbnNpdGl2ZUlucHV0RWxpY2l0YXRpb24oXG5cdFx0XHRcdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdHRvb2xUZXJtaW5hbC5pbnN0YW5jZSxcblx0XHRcdFx0XHRcdFx0b3V0cHV0TW9uaXRvcixcblx0XHRcdFx0XHRcdFx0KCkgPT4gZXhlY3V0ZUNhbmNlbGxhdGlvbi5jYW5jZWwoKSxcblx0XHRcdFx0XHRcdFx0KCkgPT4geyBkaWRTZW5zaXRpdmVBdXRvQ2FuY2VsbGVkID0gdHJ1ZTsgfSxcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHJhY2VDYW5kaWRhdGVzOiBQcm9taXNlPHsgdHlwZTogJ2NvbXBsZXRlZCc7IHJlc3VsdDogSVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0IH0gfCB7IHR5cGU6ICdiYWNrZ3JvdW5kJyB9IHwgeyB0eXBlOiAndGltZW91dCcgfSB8IHsgdHlwZTogJ2lucHV0TmVlZGVkJyB9IHwgeyB0eXBlOiAnaWRsZVNpbGVuY2UnIH0+W10gPSBbXG5cdFx0XHRcdFx0ZXhlY3V0aW9uUHJvbWlzZS50aGVuKHJlc3VsdCA9PiAoeyB0eXBlOiAnY29tcGxldGVkJyBhcyBjb25zdCwgcmVzdWx0IH0pKSxcblx0XHRcdFx0XHRjb250aW51ZUluQmFja2dyb3VuZFByb21pc2UudGhlbigoKSA9PiAoeyB0eXBlOiAnYmFja2dyb3VuZCcgYXMgY29uc3QgfSkpLFxuXHRcdFx0XHRcdG5ldyBQcm9taXNlPHsgdHlwZTogJ2lucHV0TmVlZGVkJyB9PihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdHN0YXJ0TWFya2VyUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKG91dHB1dE1vbml0b3IgJiYgIXJhY2VDbGVhbnVwLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRyYWNlQ2xlYW51cC5hZGQob3V0cHV0TW9uaXRvci5vbkRpZERldGVjdElucHV0TmVlZGVkKCgpID0+IHJlc29sdmUoeyB0eXBlOiAnaW5wdXROZWVkZWQnIGFzIGNvbnN0IH0pKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdF07XG5cdFx0XHRcdGlmICh0aW1lb3V0UmFjZVByb21pc2UpIHtcblx0XHRcdFx0XHRyYWNlQ2FuZGlkYXRlcy5wdXNoKHRpbWVvdXRSYWNlUHJvbWlzZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSWRsZS1zaWxlbmNlIHByb21vdGlvbjogaWYgbm8gdGVybWluYWwgb3V0cHV0IGFycml2ZXMgZm9yIE4gbXMsXG5cdFx0XHRcdC8vIGhhbmQgY29udHJvbCBiYWNrIHRvIHRoZSBtb2RlbCB3aXRoIHRoZSB0ZXJtaW5hbCBJRCArIG91dHB1dFxuXHRcdFx0XHQvLyBjb2xsZWN0ZWQgc28gZmFyLiBUaGUgcHJvY2VzcyBrZWVwcyBydW5uaW5nIFx1MjAxNCBtb2RlbCBjYW4gcG9sbCxcblx0XHRcdFx0Ly8gc2VuZCBpbnB1dCwgb3Iga2lsbCBpdC4gRGVmYXVsdCA1IG1pbjsgMCBkaXNhYmxlcy5cblx0XHRcdFx0Y29uc3QgaWRsZVNpbGVuY2VNcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5JZGxlU2lsZW5jZVRpbWVvdXRNcykgPz8gREVGQVVMVF9JRExFX1NJTEVOQ0VfVElNRU9VVF9NUztcblx0XHRcdFx0aWYgKGlkbGVTaWxlbmNlTXMgPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWRsZVNpbGVuY2VEZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8eyB0eXBlOiAnaWRsZVNpbGVuY2UnIH0+KCk7XG5cdFx0XHRcdFx0Y29uc3QgaWRsZVNpbGVuY2VTY2hlZHVsZXIgPSByYWNlQ2xlYW51cC5hZGQobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gaWRsZVNpbGVuY2VEZWZlcnJlZC5jb21wbGV0ZSh7IHR5cGU6ICdpZGxlU2lsZW5jZScgYXMgY29uc3QgfSksIGlkbGVTaWxlbmNlTXMpKTtcblx0XHRcdFx0XHRyYWNlQ2xlYW51cC5hZGQodG9vbFRlcm1pbmFsLmluc3RhbmNlLm9uRGF0YSgoKSA9PiBpZGxlU2lsZW5jZVNjaGVkdWxlci5zY2hlZHVsZSgpKSk7XG5cdFx0XHRcdFx0aWRsZVNpbGVuY2VTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdFx0XHRyYWNlQ2FuZGlkYXRlcy5wdXNoKGlkbGVTaWxlbmNlRGVmZXJyZWQucCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IHJhY2VSZXN1bHQ6IHsgdHlwZTogJ2NvbXBsZXRlZCc7IHJlc3VsdDogSVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0IH0gfCB7IHR5cGU6ICdiYWNrZ3JvdW5kJyB9IHwgeyB0eXBlOiAndGltZW91dCcgfSB8IHsgdHlwZTogJ2lucHV0TmVlZGVkJyB9IHwgeyB0eXBlOiAnaWRsZVNpbGVuY2UnIH07XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmFjZVJlc3VsdCA9IGF3YWl0IFByb21pc2UucmFjZShyYWNlQ2FuZGlkYXRlcyk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0cmFjZUNsZWFudXAuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJhY2VSZXN1bHQudHlwZSA9PT0gJ2lucHV0TmVlZGVkJykge1xuXHRcdFx0XHRcdC8vIE91dHB1dCBtb25pdG9yIGRldGVjdGVkIHRoZSB0ZXJtaW5hbCBpcyB3YWl0aW5nIGZvciBpbnB1dC5cblx0XHRcdFx0XHQvLyBSZXR1cm4gb3V0cHV0IHRvIHRoZSBhZ2VudCBzbyBpdCBjYW4gcHJvdmlkZSBpbnB1dCB2aWFcblx0XHRcdFx0XHQvLyBzZW5kX3RvX3Rlcm1pbmFsLiBUaGUgdGVybWluYWwgc3RheXMgZm9yZWdyb3VuZCBzbyBpdCBpc1xuXHRcdFx0XHRcdC8vIHJldXNlZCBieSBzdWJzZXF1ZW50IHJ1bl9pbl90ZXJtaW5hbCBjYWxscyBpbiB0aGlzIHNlc3Npb24uXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IE91dHB1dCBtb25pdG9yIGRldGVjdGVkIGlucHV0IG5lZWRlZCBpbiBmb3JlZ3JvdW5kIHRlcm1pbmFsLCByZXR1cm5pbmcgb3V0cHV0IHRvIGFnZW50YCk7XG5cdFx0XHRcdFx0ZXJyb3IgPSAnaW5wdXROZWVkZWQnO1xuXHRcdFx0XHRcdGRpZElucHV0TmVlZGVkID0gdHJ1ZTtcblx0XHRcdFx0XHQvLyBSZWFkIG91dHB1dCBkaXJlY3RseSBmcm9tIHRoZSBleGVjdXRpb24gcmF0aGVyIHRoYW4gZnJvbSBwb2xsaW5nUmVzdWx0LFxuXHRcdFx0XHRcdC8vIGJlY2F1c2UgdGhlIG91dHB1dCBtb25pdG9yIG1heSBub3QgaGF2ZSBzZXQgcG9sbGluZ1Jlc3VsdCB5ZXQgYXQgdGhpcyBwb2ludFxuXHRcdFx0XHRcdC8vIChpdCBpcyB3cml0dGVuIGluIHRoZSBmaW5hbGx5IGJsb2NrIGFmdGVyIG9uRGlkRmluaXNoQ29tbWFuZCkuXG5cdFx0XHRcdFx0Y29uc3QgaWRsZU91dHB1dCA9IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0XHRcdFx0XHRvdXRwdXRMaW5lQ291bnQgPSBpZGxlT3V0cHV0ID8gY291bnQoaWRsZU91dHB1dC50cmltKCksICdcXG4nKSArIDEgOiAwO1xuXHRcdFx0XHRcdHRlcm1pbmFsUmVzdWx0ID0gaWRsZU91dHB1dCA/PyAnJztcblx0XHRcdFx0fSBlbHNlIGlmIChyYWNlUmVzdWx0LnR5cGUgPT09ICdiYWNrZ3JvdW5kJykge1xuXHRcdFx0XHRcdC8vIE1vdmVkIHRvIGJhY2tncm91bmQgLSBleGVjdXRpb24gY29udGludWVzIHJ1bm5pbmcsIGp1c3QgcmV0dXJuIGN1cnJlbnQgb3V0cHV0XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IENvbnRpbnVlIGluIGJhY2tncm91bmQgdHJpZ2dlcmVkLCByZXR1cm5pbmcgb3V0cHV0IGNvbGxlY3RlZCBzbyBmYXJgKTtcblx0XHRcdFx0XHRlcnJvciA9ICdjb250aW51ZUluQmFja2dyb3VuZCc7XG5cdFx0XHRcdFx0Y29uc3QgYmFja2dyb3VuZE91dHB1dCA9IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0XHRcdFx0XHRvdXRwdXRMaW5lQ291bnQgPSBiYWNrZ3JvdW5kT3V0cHV0ID8gY291bnQoYmFja2dyb3VuZE91dHB1dC50cmltKCksICdcXG4nKSArIDEgOiAwO1xuXHRcdFx0XHRcdHRlcm1pbmFsUmVzdWx0ID0gYmFja2dyb3VuZE91dHB1dDtcblx0XHRcdFx0fSBlbHNlIGlmIChyYWNlUmVzdWx0LnR5cGUgPT09ICd0aW1lb3V0Jykge1xuXHRcdFx0XHRcdC8vIFRpbWVvdXQgcmVhY2hlZCAtIHJldHVybiBwYXJ0aWFsIG91dHB1dCBhbmQga2VlcCB0ZXJtaW5hbCBhbGl2ZSBhcyBiYWNrZ3JvdW5kLlxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBUaW1lb3V0IHJlYWNoZWQsIHJldHVybmluZyBvdXRwdXQgY29sbGVjdGVkIHNvIGZhcmApO1xuXHRcdFx0XHRcdGVycm9yID0gJ3RpbWVvdXQnO1xuXHRcdFx0XHRcdGRpZFRpbWVvdXQgPSB0cnVlO1xuXHRcdFx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0dG9vbFRlcm1pbmFsLmlzQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS5kaWRDb250aW51ZUluQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmRlbGV0ZShjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hc3NvY2lhdGVQcm9jZXNzSWRXaXRoU2Vzc2lvbih0b29sVGVybWluYWwuaW5zdGFuY2UsIGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRlcm1JZCwgdG9vbFRlcm1pbmFsLnNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LCB0cnVlKTtcblx0XHRcdFx0XHRjb25zdCB0aW1lb3V0T3V0cHV0ID0gZXhlY3V0aW9uLmdldE91dHB1dCgpO1xuXHRcdFx0XHRcdG91dHB1dExpbmVDb3VudCA9IHRpbWVvdXRPdXRwdXQgPyBjb3VudCh0aW1lb3V0T3V0cHV0LnRyaW0oKSwgJ1xcbicpICsgMSA6IDA7XG5cdFx0XHRcdFx0dGVybWluYWxSZXN1bHQgPSB0aW1lb3V0T3V0cHV0ID8/ICcnO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJhY2VSZXN1bHQudHlwZSA9PT0gJ2lkbGVTaWxlbmNlJykge1xuXHRcdFx0XHRcdC8vIE5vIG91dHB1dCBmb3IgTiBtcyAtIHByb21vdGUgdG8gYmFja2dyb3VuZCBhbmQgaGFuZCBiYWNrIHRvIG1vZGVsLiBQcm9jZXNzIGtlZXBzIHJ1bm5pbmcuXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IElkbGUgc2lsZW5jZSByZWFjaGVkICgke2lkbGVTaWxlbmNlTXN9bXMpLCBwcm9tb3RpbmcgdG8gYmFja2dyb3VuZGApO1xuXHRcdFx0XHRcdGVycm9yID0gJ2lkbGVTaWxlbmNlJztcblx0XHRcdFx0XHRkaWRJZGxlU2lsZW5jZSA9IHRydWU7XG5cdFx0XHRcdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR0b29sVGVybWluYWwuaXNCYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLmRpZENvbnRpbnVlSW5CYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZGVsZXRlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2Fzc29jaWF0ZVByb2Nlc3NJZFdpdGhTZXNzaW9uKHRvb2xUZXJtaW5hbC5pbnN0YW5jZSwgY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCB0b29sVGVybWluYWwuc2hlbGxJbnRlZ3JhdGlvblF1YWxpdHksIHRydWUpO1xuXHRcdFx0XHRcdGNvbnN0IGlkbGVTaWxlbmNlT3V0cHV0ID0gZXhlY3V0aW9uLmdldE91dHB1dCgpO1xuXHRcdFx0XHRcdG91dHB1dExpbmVDb3VudCA9IGlkbGVTaWxlbmNlT3V0cHV0ID8gY291bnQoaWRsZVNpbGVuY2VPdXRwdXQudHJpbSgpLCAnXFxuJykgKyAxIDogMDtcblx0XHRcdFx0XHR0ZXJtaW5hbFJlc3VsdCA9IGlkbGVTaWxlbmNlT3V0cHV0ID8/ICcnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGV4ZWN1dGVSZXN1bHQgPSByYWNlUmVzdWx0LnJlc3VsdDtcblx0XHRcdFx0XHQvLyBSZXNldCB1c2VyIGlucHV0IHN0YXRlIGFmdGVyIGNvbW1hbmQgZXhlY3V0aW9uIGNvbXBsZXRlc1xuXHRcdFx0XHRcdHRvb2xUZXJtaW5hbC5yZWNlaXZlZFVzZXJJbnB1dCA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGV4ZWN1dGVSZXN1bHQuZGlkRW50ZXJBbHRCdWZmZXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA/PyB7fTtcblx0XHRcdFx0XHRcdHN0YXRlLnRpbWVzdGFtcCA9IHN0YXRlLnRpbWVzdGFtcCA/PyB0aW1pbmdTdGFydDtcblx0XHRcdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEudGVybWluYWxDb21tYW5kU3RhdGUgPSBzdGF0ZTtcblx0XHRcdFx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlID0gYWx0QnVmZmVyTWVzc2FnZTtcblx0XHRcdFx0XHRcdG91dHB1dExpbmVDb3VudCA9IDA7XG5cdFx0XHRcdFx0XHRlcnJvciA9IGV4ZWN1dGVSZXN1bHQuZXJyb3IgPz8gJ2FsdGVybmF0ZUJ1ZmZlcic7XG5cdFx0XHRcdFx0XHRjb25zdCBhbHRCdWZmZXJDd2QgPSBhd2FpdCB0b29sVGVybWluYWwuaW5zdGFuY2UuZ2V0Q3dkUmVzb3VyY2UoKTtcblx0XHRcdFx0XHRcdGFsdEJ1ZmZlclJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRcdHRvb2xNZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdGV4aXRDb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0aWQ6IHRlcm1JZCxcblx0XHRcdFx0XHRcdFx0XHR0ZXJtaW5hbElkOiB0b29sVGVybWluYWwuaW5zdGFuY2UuaW5zdGFuY2VJZCxcblx0XHRcdFx0XHRcdFx0XHRjd2Q6IGFsdEJ1ZmZlckN3ZD8udG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6IGFsdEJ1ZmZlck1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3IuY2FwdHVyZSh0b29sU3BlY2lmaWNEYXRhLCB0b29sVGVybWluYWwuaW5zdGFuY2UsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA/PyB7fTtcblx0XHRcdFx0XHRcdFx0c3RhdGUudGltZXN0YW1wID0gc3RhdGUudGltZXN0YW1wID8/IHRpbWluZ1N0YXJ0O1xuXHRcdFx0XHRcdFx0XHRpZiAoZXhlY3V0ZVJlc3VsdC5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0c3RhdGUuZXhpdENvZGUgPSBleGVjdXRlUmVzdWx0LmV4aXRDb2RlO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChzdGF0ZS50aW1lc3RhbXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RhdGUuZHVyYXRpb24gPSBzdGF0ZS5kdXJhdGlvbiA/PyBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc3RhdGUudGltZXN0YW1wKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFJ1bkluVGVybWluYWxUb29sOiBGaW5pc2hlZCBcXGAke2V4ZWN1dGlvbi5zdHJhdGVneS50eXBlfVxcYCBleGVjdXRlIHN0cmF0ZWd5IHdpdGggZXhpdENvZGUgXFxgJHtleGVjdXRlUmVzdWx0LmV4aXRDb2RlfVxcYCwgcmVzdWx0Lmxlbmd0aCBcXGAke2V4ZWN1dGVSZXN1bHQub3V0cHV0Py5sZW5ndGh9XFxgLCBlcnJvciBcXGAke2V4ZWN1dGVSZXN1bHQuZXJyb3J9XFxgYCk7XG5cdFx0XHRcdFx0XHRvdXRwdXRMaW5lQ291bnQgPSBleGVjdXRlUmVzdWx0Lm91dHB1dCA9PT0gdW5kZWZpbmVkID8gMCA6IGNvdW50KGV4ZWN1dGVSZXN1bHQub3V0cHV0LnRyaW0oKSwgJ1xcbicpICsgMTtcblx0XHRcdFx0XHRcdGV4aXRDb2RlID0gZXhlY3V0ZVJlc3VsdC5leGl0Q29kZTtcblx0XHRcdFx0XHRcdGVycm9yID0gZXhlY3V0ZVJlc3VsdC5lcnJvcjtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0QXJyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdFx0aWYgKGV4ZWN1dGVSZXN1bHQub3V0cHV0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0QXJyLnB1c2goZXhlY3V0ZVJlc3VsdC5vdXRwdXQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGV4ZWN1dGVSZXN1bHQuYWRkaXRpb25hbEluZm9ybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdEFyci5wdXNoKGV4ZWN1dGVSZXN1bHQuYWRkaXRpb25hbEluZm9ybWF0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRlcm1pbmFsUmVzdWx0ID0gcmVzdWx0QXJyLmpvaW4oJ1xcblxcbicpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdC8vIEhhbmRsZSB0aW1lb3V0IGNhc2UgLSBnZXQgb3V0cHV0IGNvbGxlY3RlZCBzbyBmYXIgYW5kIHJldHVybiBpdFxuXHRcdFx0aWYgKGRpZFRpbWVvdXQgJiYgZSBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBUaW1lb3V0IHJlYWNoZWQsIHJldHVybmluZyBvdXRwdXQgY29sbGVjdGVkIHNvIGZhcmApO1xuXHRcdFx0XHRlcnJvciA9ICd0aW1lb3V0Jztcblx0XHRcdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uID0gdHJ1ZTtcblx0XHRcdFx0dG9vbFRlcm1pbmFsLmlzQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEuZGlkQ29udGludWVJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZGVsZXRlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCB0aW1lb3V0T3V0cHV0ID0gZ2V0T3V0cHV0KHRvb2xUZXJtaW5hbC5pbnN0YW5jZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0b3V0cHV0TGluZUNvdW50ID0gdGltZW91dE91dHB1dCA/IGNvdW50KHRpbWVvdXRPdXRwdXQudHJpbSgpLCAnXFxuJykgKyAxIDogMDtcblx0XHRcdFx0dGVybWluYWxSZXN1bHQgPSB0aW1lb3V0T3V0cHV0ID8/ICcnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFRocmV3IGV4Y2VwdGlvbmApO1xuXHRcdFx0XHQvLyBDYXB0dXJlIG91dHB1dCBzbmFwc2hvdCBiZWZvcmUgZGlzcG9zaW5nIG9uIGNhbmNlbGxhdGlvblxuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fY29tbWFuZEFydGlmYWN0Q29sbGVjdG9yLmNhcHR1cmUodG9vbFNwZWNpZmljRGF0YSwgdG9vbFRlcm1pbmFsLmluc3RhbmNlLCBjb21tYW5kSWQpO1xuXHRcdFx0XHRcdC8vIE1hcmsgdGhlIGNvbW1hbmQgYXMgY2FuY2VsbGVkIGlmIGl0IGhhc24ndCBmaW5pc2hlZCB5ZXRcblx0XHRcdFx0XHQvLyBUaGlzIGVuc3VyZXMgdGhlIGRlY29yYXRpb24gc2hvd3MgYSBmYWlsdXJlIGljb24gaW5zdGVhZCBvZiBydW5uaW5nXG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sU3BlY2lmaWNEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlID8/IHt9O1xuXHRcdFx0XHRcdGlmIChzdGF0ZS5leGl0Q29kZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRzdGF0ZS5leGl0Q29kZSA9IC0xO1xuXHRcdFx0XHRcdFx0c3RhdGUudGltZXN0YW1wID0gc3RhdGUudGltZXN0YW1wID8/IHRpbWluZ1N0YXJ0O1xuXHRcdFx0XHRcdFx0c3RhdGUuZHVyYXRpb24gPSBzdGF0ZS5kdXJhdGlvbiA/PyBNYXRoLm1heCgwLCBEYXRlLm5vdygpIC0gc3RhdGUudGltZXN0YW1wKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIENsZWFuIHVwIHRoZSBleGVjdXRpb24gb24gZXJyb3Jcblx0XHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KHRlcm1JZCk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZCk7XG5cdFx0XHRcdHRvb2xUZXJtaW5hbC5pbnN0YW5jZS5kaXNwb3NlKCk7XG5cdFx0XHRcdGVycm9yID0gZSBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yID8gJ2NhbmNlbGVkJyA6ICd1bmV4cGVjdGVkRXhjZXB0aW9uJztcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGltZW91dFByb21pc2U/LmNhbmNlbCgpO1xuXHRcdFx0aWYgKChpc0JhY2tncm91bmRFeGVjdXRpb24gfHwgZGlkSW5wdXROZWVkZWQpICYmIGV4ZWN1dGlvblByb21pc2UpIHtcblx0XHRcdFx0Ly8gQmFja2dyb3VuZCB0ZXJtaW5hbCAoc3RhcnRlZCBhcyBiZyBvciBtb3ZlZCB0byBiZykgb3IgZm9yZWdyb3VuZFxuXHRcdFx0XHQvLyB0ZXJtaW5hbCB3YWl0aW5nIGZvciBpbnB1dCAtIGF0dGFjaCBlcnJvciBoYW5kbGVyIHNpbmNlIHdlIHdvbid0IGF3YWl0IGl0LlxuXHRcdFx0XHRleGVjdXRpb25Qcm9taXNlLmNhdGNoKChlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCEoZSBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgUnVuSW5UZXJtaW5hbFRvb2w6IEJhY2tncm91bmQgZXhlY3V0aW9uIGVycm9yYCwgZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gUmVnaXN0ZXIgYSBsaXN0ZW5lciB0byBub3RpZnkgdGhlIGFnZW50IHdoZW4gY29tbWFuZHMgY29tcGxldGUgaW4gdGhpc1xuXHRcdFx0XHQvLyBiYWNrZ3JvdW5kIHRlcm1pbmFsLCBhbmQgY29udGludWUgdGhlIG91dHB1dCBtb25pdG9yIGZvciBwcm9tcHQtZm9yLWlucHV0IGRldGVjdGlvbi5cblx0XHRcdFx0aWYgKHNob3VsZFNlbmROb3RpZmljYXRpb25zKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlIGZvcmVncm91bmQgdG9vbCBqdXN0IHJldHVybmVkIHZpYSB0aGUgaW5wdXROZWVkZWQgcmFjZSwgdGhlXG5cdFx0XHRcdFx0Ly8gYWdlbnQgaGFzIGFscmVhZHkgcmVjZWl2ZWQgYHRlcm1pbmFsUmVzdWx0YCBhcyB0aGUgdG9vbCByZXN1bHQuIFNlZWRcblx0XHRcdFx0XHQvLyB0aGUgQkcgZGVkdXAgc28gdGhlIE91dHB1dE1vbml0b3IncyBpbW1lZGlhdGUgcmUtZGV0ZWN0aW9uIG9mIHRoZVxuXHRcdFx0XHRcdC8vIHNhbWUgcHJvbXB0IGRvZXMgbm90IHNlbmQgYSByZWR1bmRhbnQgc3RlZXJpbmcgbWVzc2FnZSB0aGF0IHdvdWxkXG5cdFx0XHRcdFx0Ly8geWllbGQgdGhlIGFnZW50J3MgaW4tZmxpZ2h0IGBzZW5kX3RvX3Rlcm1pbmFsYCByZXNwb25zZS5cblx0XHRcdFx0XHRjb25zdCBhbHJlYWR5Tm90aWZpZWRJbnB1dE5lZWRlZE91dHB1dCA9IGRpZElucHV0TmVlZGVkID8gdGVybWluYWxSZXN1bHQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJDb21wbGV0aW9uTm90aWZpY2F0aW9uKHRvb2xUZXJtaW5hbC5pbnN0YW5jZSwgdGVybUlkLCBjaGF0U2Vzc2lvblJlc291cmNlLCBjb21tYW5kLCB0b29sU3BlY2lmaWNEYXRhLCBvdXRwdXRNb25pdG9yLCBhbHJlYWR5Tm90aWZpZWRJbnB1dE5lZWRlZE91dHB1dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b3V0cHV0TW9uaXRvcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBGb3JlZ3JvdW5kIGNvbXBsZXRlZCBvciBlcnJvciAtIGNsZWFuIHVwIGV4ZWN1dGlvbiBhbmQgb3V0cHV0IG1vbml0b3Jcblx0XHRcdFx0UnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KHRlcm1JZCk/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZCk7XG5cdFx0XHRcdG91dHB1dE1vbml0b3I/LmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdGNvbnN0IHRpbWluZ0V4ZWN1dGVNcyA9IERhdGUubm93KCkgLSB0aW1pbmdTdGFydDtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeS5sb2dJbnZva2UodG9vbFRlcm1pbmFsLmluc3RhbmNlLCB7XG5cdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogdG9vbFNwZWNpZmljRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0XHRcdGRpZFVzZXJFZGl0Q29tbWFuZCxcblx0XHRcdFx0ZGlkVG9vbEVkaXRDb21tYW5kLFxuXHRcdFx0XHRpc0JhY2tncm91bmQ6IGV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24sXG5cdFx0XHRcdGlzU2FuZGJveFdyYXBwZWQ6IHRvb2xTcGVjaWZpY0RhdGEuY29tbWFuZExpbmUuaXNTYW5kYm94V3JhcHBlZCA9PT0gdHJ1ZSxcblx0XHRcdFx0cmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uOiBhcmdzLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvblJlYXNvbixcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IHRvb2xUZXJtaW5hbC5zaGVsbEludGVncmF0aW9uUXVhbGl0eSxcblx0XHRcdFx0ZXJyb3IsXG5cdFx0XHRcdGlzTmV3U2Vzc2lvbixcblx0XHRcdFx0b3V0cHV0TGluZUNvdW50LFxuXHRcdFx0XHRleGl0Q29kZSxcblx0XHRcdFx0dGltaW5nRXhlY3V0ZU1zLFxuXHRcdFx0XHR0aW1pbmdDb25uZWN0TXMsXG5cdFx0XHRcdGlucHV0VXNlckNoYXJzLFxuXHRcdFx0XHRpbnB1dFVzZXJTaWdpbnQsXG5cdFx0XHRcdHRlcm1pbmFsRXhlY3V0aW9uSWRsZUJlZm9yZVRpbWVvdXQ6IHBvbGxpbmdSZXN1bHQ/LnN0YXRlID09PSBPdXRwdXRNb25pdG9yU3RhdGUuSWRsZSxcblx0XHRcdFx0cG9sbER1cmF0aW9uTXM6IHBvbGxpbmdSZXN1bHQ/LnBvbGxEdXJhdGlvbk1zLFxuXHRcdFx0XHRpbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudDogb3V0cHV0TW9uaXRvcj8ub3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzPy5pbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudCxcblx0XHRcdFx0aW5wdXRUb29sTWFudWFsUmVqZWN0Q291bnQ6IG91dHB1dE1vbml0b3I/Lm91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycz8uaW5wdXRUb29sTWFudWFsUmVqZWN0Q291bnQsXG5cdFx0XHRcdGlucHV0VG9vbE1hbnVhbENoYXJzOiBvdXRwdXRNb25pdG9yPy5vdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM/LmlucHV0VG9vbE1hbnVhbENoYXJzLFxuXHRcdFx0XHRpbnB1dFRvb2xBdXRvQWNjZXB0Q291bnQ6IG91dHB1dE1vbml0b3I/Lm91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycz8uaW5wdXRUb29sQXV0b0FjY2VwdENvdW50LFxuXHRcdFx0XHRpbnB1dFRvb2xBdXRvQ2hhcnM6IG91dHB1dE1vbml0b3I/Lm91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycz8uaW5wdXRUb29sQXV0b0NoYXJzLFxuXHRcdFx0XHRpbnB1dFRvb2xNYW51YWxTaG93bkNvdW50OiBvdXRwdXRNb25pdG9yPy5vdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM/LmlucHV0VG9vbE1hbnVhbFNob3duQ291bnQsXG5cdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRDb3VudDogb3V0cHV0TW9uaXRvcj8ub3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzPy5pbnB1dFRvb2xGcmVlRm9ybUlucHV0Q291bnQsXG5cdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50OiBvdXRwdXRNb25pdG9yPy5vdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM/LmlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoYWx0QnVmZmVyUmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gYWx0QnVmZmVyUmVzdWx0O1xuXHRcdH1cblxuXHRcdGlmIChkaWRTYW5kYm94V3JhcENvbW1hbmQgJiYgb3V0cHV0TG9va3NCdWJibGV3cmFwSG9zdFJlc3RyaWN0ZWQodGVybWluYWxSZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0QnViYmxld3JhcEhvc3RSZXN0cmljdGVkUmVzdWx0KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvdWxkQXV0b1JldHJ5VW5zYW5kYm94ZWQgPSBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlVbnNhbmRib3hlZCh7XG5cdFx0XHRhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsXG5cdFx0XHRkaWRTYW5kYm94V3JhcENvbW1hbmQsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IGFyZ3MucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uID09PSB0cnVlLFxuXHRcdFx0aXNQZXJzaXN0ZW50U2Vzc2lvbjogZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbixcblx0XHRcdGlzQmFja2dyb3VuZEV4ZWN1dGlvbjogaXNCYWNrZ3JvdW5kRXhlY3V0aW9uIHx8IGRpZElucHV0TmVlZGVkLFxuXHRcdFx0ZGlkVGltZW91dCxcblx0XHRcdGV4aXRDb2RlLFxuXHRcdFx0b3V0cHV0OiB0ZXJtaW5hbFJlc3VsdCxcblx0XHR9KTtcblx0XHRjb25zdCBzaG91bGRBdXRvUmV0cnlBbGxvd05ldHdvcmsgPSBzaG91bGRBdXRvbWF0aWNhbGx5UmV0cnlBbGxvd05ldHdvcmtJblNhbmRib3hlZCh7XG5cdFx0XHRyZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0czogaXNTYW5kYm94RW5hYmxlZCAmJiAhaXNTYW5kYm94QWxsb3dOZXR3b3JrRW5hYmxlZCAmJiB0aGlzLl9yZXRyeVdpdGhBbGxvd05ldHdvcmtSZXF1ZXN0cyxcblx0XHRcdGRpZFNhbmRib3hXcmFwQ29tbWFuZCxcblx0XHRcdHJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbjogYXJncy5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb24gPT09IHRydWUsXG5cdFx0XHRyZXF1ZXN0QWxsb3dOZXR3b3JrOiBhcmdzLnJlcXVlc3RBbGxvd05ldHdvcmsgPT09IHRydWUsXG5cdFx0XHRpc1BlcnNpc3RlbnRTZXNzaW9uOiBleGVjdXRpb25PcHRpb25zLnBlcnNpc3RlbnRTZXNzaW9uLFxuXHRcdFx0aXNCYWNrZ3JvdW5kRXhlY3V0aW9uOiBpc0JhY2tncm91bmRFeGVjdXRpb24gfHwgZGlkSW5wdXROZWVkZWQsXG5cdFx0XHRkaWRUaW1lb3V0LFxuXHRcdFx0ZXhpdENvZGUsXG5cdFx0XHRvdXRwdXQ6IHRlcm1pbmFsUmVzdWx0LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYXV0b21hdGljU2FuZGJveFJldHJ5ID0gc2hvdWxkQXV0b1JldHJ5QWxsb3dOZXR3b3JrXG5cdFx0XHQ/IHsgcmV0cnlLaW5kOiAnYWxsb3dOZXR3b3JrJyBhcyBjb25zdCwgcmV0cnlSZWFzb246IGF1dG9tYXRpY0FsbG93TmV0d29ya1JldHJ5UmVhc29uIH1cblx0XHRcdDogc2hvdWxkQXV0b1JldHJ5VW5zYW5kYm94ZWRcblx0XHRcdFx0PyB7IHJldHJ5S2luZDogJ3Vuc2FuZGJveGVkJyBhcyBjb25zdCwgcmV0cnlSZWFzb246IGF1dG9tYXRpY1Vuc2FuZGJveFJldHJ5UmVhc29uIH1cblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGF1dG9tYXRpY1NhbmRib3hSZXRyeSkge1xuXHRcdFx0Y29uc3QgcmV0cnlSZXN1bHQgPSBhd2FpdCB0aGlzLl9ydW5BdXRvbWF0aWNTYW5kYm94UmV0cnkoe1xuXHRcdFx0XHQuLi5hdXRvbWF0aWNTYW5kYm94UmV0cnksXG5cdFx0XHRcdGludm9jYXRpb24sXG5cdFx0XHRcdGNvdW50VG9rZW5zOiBfY291bnRUb2tlbnMsXG5cdFx0XHRcdHByb2dyZXNzOiBfcHJvZ3Jlc3MsXG5cdFx0XHRcdHRva2VuLFxuXHRcdFx0XHRhcmdzLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRjb21tYW5kLFxuXHRcdFx0XHRhbGxvd1Vuc2FuZGJveGVkQ29tbWFuZHMsXG5cdFx0XHRcdGlzQmFja2dyb3VuZDogZXhlY3V0aW9uT3B0aW9ucy5wZXJzaXN0ZW50U2Vzc2lvbixcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHJldHJ5UmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXRyeVJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZS1jaGVjayBzaGVsbCBpbnRlZ3JhdGlvbiBxdWFsaXR5IG5vdyB0aGF0IGNvbW1hbmQgZXhlY3V0aW9uIGhhcyBjb21wbGV0ZWQuXG5cdFx0Ly8gT25seSBzZXQgdGhlIGJhbm5lciBpZiB0b29sUmVzdWx0TWVzc2FnZSBoYXNuJ3QgYWxyZWFkeSBiZWVuIHNldCAoZS5nLiBieSB0aGUgYWx0LWJ1ZmZlciBwYXRoKS5cblx0XHR0aGlzLl90ZXJtaW5hbFRvb2xDcmVhdG9yLnJlZnJlc2hTaGVsbEludGVncmF0aW9uUXVhbGl0eSh0b29sVGVybWluYWwpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgUnVuSW5UZXJtaW5hbFRvb2w6IHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5PSR7dG9vbFRlcm1pbmFsLnNoZWxsSW50ZWdyYXRpb25RdWFsaXR5fSBhdCBiYW5uZXIgZGVjaXNpb24gdGltZWApO1xuXHRcdGlmICghdG9vbFJlc3VsdE1lc3NhZ2UgJiYgdG9vbFRlcm1pbmFsLnNoZWxsSW50ZWdyYXRpb25RdWFsaXR5ID09PSBTaGVsbEludGVncmF0aW9uUXVhbGl0eS5Ob25lKSB7XG5cdFx0XHR0b29sUmVzdWx0TWVzc2FnZSA9ICckKGluZm8pIEVuYWJsZSBbc2hlbGwgaW50ZWdyYXRpb25dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvdGVybWluYWwvc2hlbGwtaW50ZWdyYXRpb24pIHRvIGltcHJvdmUgY29tbWFuZCBkZXRlY3Rpb24nO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdFRleHQ6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKCFkaWRTYW5kYm94V3JhcENvbW1hbmQpIHtcblx0XHRcdGlmIChkaWRVc2VyRWRpdENvbW1hbmQpIHtcblx0XHRcdFx0cmVzdWx0VGV4dC5wdXNoKGBOb3RlOiBUaGUgdXNlciBtYW51YWxseSBlZGl0ZWQgdGhlIGNvbW1hbmQgdG8gXFxgJHtjb21tYW5kfVxcYCAodGVybWluYWwgSUQ9JHt0ZXJtSWR9KSwgYW5kIHRoaXMgaXMgdGhlIG91dHB1dCBvZiBydW5uaW5nIHRoYXQgY29tbWFuZCBpbnN0ZWFkOlxcbmApO1xuXHRcdFx0fSBlbHNlIGlmIChkaWRUb29sRWRpdENvbW1hbmQpIHtcblx0XHRcdFx0Ly8gSWYgdGhlIHRvb2wgd3JhcHBlZCB0aGUgY29tbWFuZCB3aXRoIGBub2h1cGAgKFBPU0lYKSBvciBgU3RhcnQtUHJvY2Vzc2Bcblx0XHRcdFx0Ly8gKFdpbmRvd3MpIHRvIGRldGFjaCBhIGJhY2tncm91bmQgcHJvY2Vzcywgc3RkaW4gaXMgbm8gbG9uZ2VyIGNvbm5lY3RlZC5cblx0XHRcdFx0Ly8gVGVsbCB0aGUgbW9kZWwgc28gaXQgZG9lcyBub3QgdHJ5IHRvIGRyaXZlIGludGVyYWN0aXZlIHByb2dyYW1zIHRocm91Z2ggaXQuXG5cdFx0XHRcdGNvbnN0IHdhc0RldGFjaGVkVG9CYWNrZ3JvdW5kID0gLyhefFxccylub2h1cFxcc3xTdGFydC1Qcm9jZXNzXFxiLy50ZXN0KGNvbW1hbmQpO1xuXHRcdFx0XHRjb25zdCBzdGRpbkhpbnQgPSB3YXNEZXRhY2hlZFRvQmFja2dyb3VuZFxuXHRcdFx0XHRcdD8gJyBOb3RlIHRoYXQgc3RkaW4gaXMgY2xvc2VkIGZvciBkZXRhY2hlZCBiYWNrZ3JvdW5kIHByb2Nlc3NlczsgZG8gbm90IHRyeSB0byBzZW5kIGlucHV0IHZpYSBzZW5kX3RvX3Rlcm1pbmFsIFx1MjAxNCByZS1ydW4gd2l0aCBtb2RlPVwic3luY1wiIGluc3RlYWQgaWYgaW50ZXJhY3RpdmUgaW5wdXQgaXMgcmVxdWlyZWQuJ1xuXHRcdFx0XHRcdDogJyc7XG5cdFx0XHRcdHJlc3VsdFRleHQucHVzaChgTm90ZTogVGhlIHRvb2wgc2ltcGxpZmllZCB0aGUgY29tbWFuZCB0byBcXGAke2NvbW1hbmR9XFxgICh0ZXJtaW5hbCBJRD0ke3Rlcm1JZH0pLiR7c3RkaW5IaW50fSBUaGlzIGlzIHRoZSBvdXRwdXQgb2YgcnVubmluZyB0aGF0IGNvbW1hbmQgaW5zdGVhZDpcXG5gKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0JhY2tncm91bmRFeGVjdXRpb24gJiYgIWV4ZWN1dGlvbk9wdGlvbnMucGVyc2lzdGVudFNlc3Npb24pIHtcblx0XHRcdFx0cmVzdWx0VGV4dC5wdXNoKGBOb3RlOiBUaGlzIHRlcm1pbmFsIGV4ZWN1dGlvbiB3YXMgbW92ZWQgdG8gdGhlIGJhY2tncm91bmQgdXNpbmcgdGhlIElEICR7dGVybUlkfVxcbmApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZGlkU2Vuc2l0aXZlQXV0b0NhbmNlbGxlZCkge1xuXHRcdFx0cmVzdWx0VGV4dC5wdXNoKGBOb3RlOiBUaGUgY29tbWFuZCBpbiB0ZXJtaW5hbCBJRCAke3Rlcm1JZH0gd2FzIHByb21wdGluZyBmb3IgYSBwYXNzd29yZCwgcGFzc3BocmFzZSwgb3Igb3RoZXIgc2VjcmV0LiBUaGUgdXNlciBpcyB1bmF2YWlsYWJsZSAoYXV0by1hcHByb3ZlIC8gYXV0b3BpbG90IG1vZGUgaXMgb24sIHNvIG5vIGh1bWFuIGNhbiBmb2N1cyB0aGUgdGVybWluYWwgdG8gdHlwZSBhIHNlY3JldCkgYW5kIHRoZSBjb21tYW5kIGhhcyBiZWVuIGNhbmNlbGxlZC4gU3RvcCwgZG8gTk9UIHJldHJ5IHRoZSBjb21tYW5kLCBkbyBOT1QgY2FsbCAke1Rlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsfSwgYW5kIGRvIE5PVCBjYWxsIHZzY29kZV9hc2tRdWVzdGlvbnMgZm9yIHRoZSBzZWNyZXQuIFRlbGwgdGhlIHVzZXIgdG8gcnVuIHRoZSBjb21tYW5kIGludGVyYWN0aXZlbHkgd2hlbiB0aGV5IGFyZSBhdmFpbGFibGUuXFxuXFxuYCk7XG5cdFx0fSBlbHNlIGlmIChkaWRJbnB1dE5lZWRlZCkge1xuXHRcdFx0cmVzdWx0VGV4dC5wdXNoKGBOb3RlOiBUaGUgY29tbWFuZCBpcyBydW5uaW5nIGluIHRlcm1pbmFsIElEICR7dGVybUlkfSBhbmQgbWF5IGJlIHdhaXRpbmcgZm9yIGlucHV0LlxcbiR7dGhpcy5fYnVpbGRJbnB1dE5lZWRlZFN0ZWVyaW5nVGV4dChjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsICdub25lJyl9XFxuXFxuYCk7XG5cdFx0fSBlbHNlIGlmIChkaWRUaW1lb3V0ICYmIHRpbWVvdXRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmIHRpbWVvdXRWYWx1ZSA+IDApIHtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbkhpbnQgPSBzaG91bGRTZW5kTm90aWZpY2F0aW9uc1xuXHRcdFx0XHQ/ICcgWW91IHdpbGwgYmUgYXV0b21hdGljYWxseSBub3RpZmllZCBvbiB5b3VyIG5leHQgdHVybiB3aGVuIGl0IGNvbXBsZXRlcy4nXG5cdFx0XHRcdDogJyc7XG5cdFx0XHRyZXN1bHRUZXh0LnB1c2goYE5vdGU6IENvbW1hbmQgdGltZWQgb3V0IGFmdGVyICR7dGltZW91dFZhbHVlfW1zLiBUaGUgY29tbWFuZCBtYXkgc3RpbGwgYmUgcnVubmluZyBpbiB0ZXJtaW5hbCBJRCAke3Rlcm1JZH0uJHtub3RpZmljYXRpb25IaW50fVxcbiR7dGhpcy5fYnVpbGRJbnB1dE5lZWRlZFN0ZWVyaW5nVGV4dChjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsICd0aW1lb3V0Jyl9XFxuXFxuYCk7XG5cdFx0fSBlbHNlIGlmIChkaWRJZGxlU2lsZW5jZSkge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uSGludCA9IHNob3VsZFNlbmROb3RpZmljYXRpb25zXG5cdFx0XHRcdD8gJyBZb3Ugd2lsbCBiZSBhdXRvbWF0aWNhbGx5IG5vdGlmaWVkIG9uIHlvdXIgbmV4dCB0dXJuIHdoZW4gaXQgY29tcGxldGVzLidcblx0XHRcdFx0OiAnJztcblx0XHRcdHJlc3VsdFRleHQucHVzaChgTm90ZTogVGhlIGNvbW1hbmQgcHJvZHVjZWQgbm8gbmV3IG91dHB1dCBmb3IgYW4gZXh0ZW5kZWQgcGVyaW9kIGFuZCB3YXMgbW92ZWQgdG8gYmFja2dyb3VuZCB0ZXJtaW5hbCBJRCAke3Rlcm1JZH07IHRoZSBwcm9jZXNzIGlzIHN0aWxsIHJ1bm5pbmcgYW5kIGhhcyBub3QgYmVlbiBraWxsZWQuJHtub3RpZmljYXRpb25IaW50fVxcbiR7dGhpcy5fYnVpbGRJbnB1dE5lZWRlZFN0ZWVyaW5nVGV4dChjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsICdpZGxlU2lsZW5jZScpfVxcblxcbmApO1xuXHRcdH1cblx0XHRjb25zdCBvdXRwdXRBbmFseXplck1lc3NhZ2UgPSBhd2FpdCB0aGlzLl9nZXRPdXRwdXRBbmFseXplck1lc3NhZ2UoZXhpdENvZGUsIHRlcm1pbmFsUmVzdWx0LCBjb21tYW5kLCBkaWRTYW5kYm94V3JhcENvbW1hbmQpO1xuXHRcdGlmIChvdXRwdXRBbmFseXplck1lc3NhZ2UpIHtcblx0XHRcdHJlc3VsdFRleHQucHVzaChgJHtvdXRwdXRBbmFseXplck1lc3NhZ2V9XFxuYCk7XG5cdFx0fVxuXHRcdGxldCBvdXRwdXRGb3JSZXN1bHQgPSB0ZXJtaW5hbFJlc3VsdDtcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXRDb21wYWN0aW9uKSA9PT0gdHJ1ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZEZvckNvbXBhY3Rpb24gPSB0b29sU3BlY2lmaWNEYXRhLmNvbW1hbmRMaW5lLmZvckRpc3BsYXkgPz8gY29tbWFuZDtcblx0XHRcdFx0Y29uc3QgcmVwb3J0ID0gY29tcGFjdChjb21tYW5kRm9yQ29tcGFjdGlvbiwgdGVybWluYWxSZXN1bHQpO1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnkubG9nQ29tcGFjdGlvbihyZXBvcnQpO1xuXHRcdFx0XHRpZiAocmVwb3J0LmFwcGxpZWQpIHtcblx0XHRcdFx0XHRvdXRwdXRGb3JSZXN1bHQgPSByZXBvcnQuY29tcGFjdGVkT3V0cHV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5LmxvZ0NvbXBhY3Rpb25GYWlsZWQoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gUHJvY2VzcyBsYXJnZSBvdXRwdXQ6IHdyaXRlIHRvIGZpbGUgaWYgbmVlZGVkLCB0aGVuIHRydW5jYXRlIHdpdGggZmlsZSBwYXRoXG5cdFx0Y29uc3QgcHJvY2Vzc2VkT3V0cHV0ID0gYXdhaXQgdGhpcy5fbGFyZ2VPdXRwdXRGaWxlV3JpdGVyLnByb2Nlc3NPdXRwdXQob3V0cHV0Rm9yUmVzdWx0KTtcblx0XHRyZXN1bHRUZXh0LnB1c2gocHJvY2Vzc2VkT3V0cHV0KTtcblxuXHRcdGNvbnN0IGlzRXJyb3IgPSBleGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmIGV4aXRDb2RlICE9PSAwO1xuXHRcdGNvbnN0IGVuZEN3ZCA9IGF3YWl0IHRvb2xUZXJtaW5hbC5pbnN0YW5jZS5nZXRDd2RSZXNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgaW1hZ2VDb250ZW50ID0gYXdhaXQgdGhpcy5fZXh0cmFjdEltYWdlc0Zyb21PdXRwdXQodGVybWluYWxSZXN1bHQsIGVuZEN3ZCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2UsXG5cdFx0XHR0b29sTWV0YWRhdGE6IHtcblx0XHRcdFx0ZXhpdENvZGU6IGV4aXRDb2RlLFxuXHRcdFx0XHRpZDogdGVybUlkLFxuXHRcdFx0XHR0ZXJtaW5hbElkOiB0b29sVGVybWluYWwuaW5zdGFuY2UuaW5zdGFuY2VJZCxcblx0XHRcdFx0Y3dkOiBlbmRDd2Q/LnRvU3RyaW5nKCksXG5cdFx0XHRcdHRpbWVkT3V0OiBkaWRUaW1lb3V0IHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0dGltZW91dE1zOiBkaWRUaW1lb3V0ID8gdGltZW91dFZhbHVlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnB1dE5lZWRlZDogZGlkSW5wdXROZWVkZWQgfHwgdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiBpc0Vycm9yID8ge1xuXHRcdFx0XHRpbnB1dDogY29tbWFuZCxcblx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCBpc1RleHQ6IHRydWUsIHZhbHVlOiBvdXRwdXRGb3JSZXN1bHQgfV0sXG5cdFx0XHRcdGlzRXJyb3I6IHRydWVcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IHJlc3VsdFRleHQuam9pbignJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC4uLmltYWdlQ29udGVudCxcblx0XHRcdF1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QnViYmxld3JhcFVuc3VwcG9ydGVkUmVzdWx0KCk6IElUb29sUmVzdWx0IHtcblx0XHRjb25zdCBzZXR0aW5nSWQgPSBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZDtcblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoXG5cdFx0XHQncnVuSW5UZXJtaW5hbC5idWJibGV3cmFwLnVuc3VwcG9ydGVkRW52aXJvbm1lbnQnLFxuXHRcdFx0XCJTYW5kYm94aW5nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBlbnZpcm9ubWVudC4gVG8gZGlzYWJsZSBzYW5kYm94aW5nLCBzZXQgYHswfWAgdG8gYG9mZmAuIFRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQuXCIsXG5cdFx0XHRzZXR0aW5nSWQsXG5cdFx0KTtcblx0XHRjb25zdCBzZXR0aW5nc0NvbW1hbmRBcmdzID0gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KFtgQGlkOiR7c2V0dGluZ0lkfWBdKSk7XG5cdFx0Y29uc3QgdG9vbFJlc3VsdE1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoXG5cdFx0XHQncnVuSW5UZXJtaW5hbC5idWJibGV3cmFwLnVuc3VwcG9ydGVkRW52aXJvbm1lbnRXaXRoU2V0dGluZ3NMaW5rJyxcblx0XHRcdFwiU2FuZGJveGluZyBpcyBub3Qgc3VwcG9ydGVkIGluIHRoaXMgZW52aXJvbm1lbnQuIFtPcGVuIHRoZSBgezB9YCBzZXR0aW5nXShjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzP3sxfSBcXFwiT3BlbiBTZXR0aW5nc1xcXCIpIGFuZCBzZXQgaXQgdG8gYG9mZmAuIFRoZSBjb21tYW5kIHdhcyBub3QgZXhlY3V0ZWQuXCIsXG5cdFx0XHRzZXR0aW5nSWQsXG5cdFx0XHRzZXR0aW5nc0NvbW1hbmRBcmdzLFxuXHRcdCksIHsgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyddIH0gfSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IG1lc3NhZ2UgfV0sXG5cdFx0XHR0b29sUmVzdWx0TWVzc2FnZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QnViYmxld3JhcEhvc3RSZXN0cmljdGVkUmVzdWx0KCk6IElUb29sUmVzdWx0IHtcblx0XHRjb25zdCBzZXR0aW5nSWQgPSBBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZDtcblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoXG5cdFx0XHQncnVuSW5UZXJtaW5hbC5idWJibGV3cmFwLmhvc3RSZXN0cmljdGlvbicsXG5cdFx0XHRcIlNhbmRib3ggY3JlYXRpb24gZmFpbGVkIGR1ZSB0byBob3N0IHJlc3RyaWN0aW9ucy4gU2FuZGJveGluZyBjYW4gYmUgZGlzYWJsZWQgYnkgc2V0dGluZyBgezB9YCB0byBgb2ZmYC5cIixcblx0XHRcdHNldHRpbmdJZCxcblx0XHQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBtZXNzYWdlIH1dLFxuXHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2U6IG1lc3NhZ2UsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIHN0ZWVyaW5nIHRleHQgdGhlIG1vZGVsIHNlZXMgd2hlbiB0aGUgdGVybWluYWwgdG9vbCBzdXNwZWN0c1xuXHQgKiB0aGUgY29tbWFuZCBtYXkgYmUgd2FpdGluZyBmb3IgaW5wdXQuIFRoZSBoZXVyaXN0aWMgdGhhdCB0cmlnZ2VycyB0aGlzXG5cdCAqIG5vdGUgY2FuIGZhbHNlLXBvc2l0aXZlIG9uIGxvbmctcnVubmluZyBjb21wdXRlIGNvbW1hbmRzIG9yIHNoZWxscyBzaXR0aW5nXG5cdCAqIG9uIGEgc2Vjb25kYXJ5IHByb21wdCAoZS5nLiBoZXJlZG9jIGNvbnRpbnVhdGlvbiBgPiBgKSwgc28gdGhlIHRleHRcblx0ICogZXhwbGljaXRseTpcblx0ICogICAxLiBUZWxscyB0aGUgbW9kZWwgdGhpcyBub3RlIGlzIE5PVCBhIHNpZ25hbCB0byBlbmQgdGhlIHR1cm4uXG5cdCAqICAgMi4gSW4gYXV0by1hcHByb3ZlIG1vZGUsIGxlYWRzIHdpdGggYHNlbmRfdG9fdGVybWluYWxgIGZvciBub24tc2VjcmV0XG5cdCAqICAgICAgcHJvbXB0cyB0byBtaW5pbWl6ZSByb3VuZC10cmlwcywgd2l0aCBhIGBnZXRfdGVybWluYWxfb3V0cHV0YCBmYWxsYmFjay5cblx0ICogICAzLiBJbiBkZWZhdWx0IG1vZGUsIGxlYWRzIHdpdGggYGdldF90ZXJtaW5hbF9vdXRwdXRgIGFzIHRoZSBzYWZlXG5cdCAqICAgICAgcmVjb3ZlcnkgYWN0aW9uIGFuZCBvZmZlcnMgYHZzY29kZV9hc2tRdWVzdGlvbnNgIG9ubHkgZm9yIHJlYWxcblx0ICogICAgICBub24tc2VjcmV0IHByb21wdHMuIFNlY3JldCBwcm9tcHRzIChwYXNzd29yZHMsIHBhc3NwaHJhc2VzLFxuXHQgKiAgICAgIHRva2VucykgbXVzdCBuZXZlciBiZSByb3V0ZWQgdGhyb3VnaCBgdnNjb2RlX2Fza1F1ZXN0aW9uc2Bcblx0ICogICAgICBiZWNhdXNlIGFuc3dlcnMgdG8gdGhhdCB0b29sIGFyZSBzZW50IHRocm91Z2ggdGhlIG1vZGVsIFx1MjAxNCB0aGVcblx0ICogICAgICB1c2VyIGlzIHRvbGQgdG8gdHlwZSB0aG9zZSB2YWx1ZXMgZGlyZWN0bHkgaW50byB0aGUgdGVybWluYWwuXG5cdCAqIGBraWxsX3Rlcm1pbmFsYCBpcyBvbmx5IGFkdmVydGlzZWQgd2hlbiB0aGUgY29tbWFuZCBtYXkgYmUgaHVuZ1xuXHQgKiAoYCd0aW1lb3V0J2Agb3IgYCdpZGxlU2lsZW5jZSdgKSBcdTIwMTQgc3VnZ2VzdGluZyBpdCBpbiB0aGUgZ2VuZXJhbCBjYXNlXG5cdCAqIGxlYWRzIHRoZSBtb2RlbCB0byB0ZXJtaW5hdGUgdmFsaWQgaW50ZXJhY3RpdmUgc2Vzc2lvbnMgKGUuZy5cblx0ICogYG5wbSBpbml0YCkgaW5zdGVhZCBvZiBkcml2aW5nIHRoZW0uXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZElucHV0TmVlZGVkU3RlZXJpbmdUZXh0KGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGVybUlkOiBzdHJpbmcsIGh1bmdIaW50OiAnbm9uZScgfCAndGltZW91dCcgfCAnaWRsZVNpbGVuY2UnKTogc3RyaW5nIHtcblx0XHRjb25zdCBpc0F1dG9BcHByb3ZlZCA9IGlzU2Vzc2lvbkF1dG9BcHByb3ZlTGV2ZWwoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLCB0aGlzLl9jaGF0U2VydmljZSk7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGluZXMucHVzaChgVGhpcyBub3RlIGlzIG5vdCBhIHNpZ25hbCB0byBlbmQgdGhlIHR1cm4gXHUyMDE0IHBpY2sgb25lIG9mIHRoZSBhY3Rpb25zIGJlbG93IGFuZCBjb250aW51ZS5gKTtcblx0XHRpZiAoaXNBdXRvQXBwcm92ZWQpIHtcblx0XHRcdC8vIEluIGF1dG8tYXBwcm92ZSBtb2RlLCBwcmlvcml0aXplIGRpcmVjdCBhY3Rpb24gdG8gbWluaW1pemUgcm91bmQtdHJpcHMuXG5cdFx0XHQvLyBhc2tRdWVzdGlvbnMgYXV0by1yZXNwb25kcyBpbiBhdXRvcGlsb3QsIHNvIHNlY3JldCBwcm9tcHRzIHNob3VsZCBub3QgYmVcblx0XHRcdC8vIHJvdXRlZCB0aGVyZSBcdTIwMTQgdGhlIG1vZGVsIHNob3VsZCBza2lwIHNlY3JldHMgaXQgY2Fubm90IGFuc3dlci5cblx0XHRcdGxpbmVzLnB1c2goYCAgMS4gSWYgdGhlIG91dHB1dCBjbGVhcmx5IGVuZHMgd2l0aCBhIG5vbi1zZWNyZXQgaW5wdXQgcHJvbXB0IChDb250aW51ZT8gKHkvbiksIEVudGVyIHNlbGVjdGlvbiwgZXRjLiBcdTIwMTQgYSBub3JtYWwgc2hlbGwgcHJvbXB0IGxpa2UgXFxgJFxcYCBvciBcXGAjXFxgIGRvZXMgTk9UIGNvdW50KSwgZGV0ZXJtaW5lIHRoZSBhbnN3ZXIgYW5kIGltbWVkaWF0ZWx5IGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5TZW5kVG9UZXJtaW5hbH0gd2l0aCBpZD1cIiR7dGVybUlkfVwiICh3aGljaCByZXR1cm5zIHRoZSBuZXh0IGZldyBsaW5lcyBvZiBvdXRwdXQpLiBSZXBlYXQgb25lIHByb21wdCBhdCBhIHRpbWUuIE5ldmVyIGd1ZXNzIHBhc3N3b3JkcywgcGFzc3BocmFzZXMsIHRva2Vucywgb3Igb3RoZXIgc2VjcmV0cyBcdTIwMTQgaWYgdGhlIHByb21wdCByZXF1aXJlcyBhIHNlY3JldCB5b3UgZG8gbm90IGhhdmUsIGluZm9ybSB0aGUgdXNlciBhbmQgc3RvcC5gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgMi4gSWYgdGhlIGNvbW1hbmQgbWF5IHN0aWxsIGJlIHByb2R1Y2luZyBvdXRwdXQgb3IgdGhlIHNoZWxsIHByb21wdCBoYXMgbm90IHJldHVybmVkLCBjYWxsICR7VGVybWluYWxUb29sSWQuR2V0VGVybWluYWxPdXRwdXR9IHdpdGggaWQ9XCIke3Rlcm1JZH1cIiB0byBjb250aW51ZSBwb2xsaW5nLmApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIDEuIElmIHRoZSBjb21tYW5kIG1heSBzdGlsbCBiZSBwcm9kdWNpbmcgb3V0cHV0IG9yIHRoZSBzaGVsbCBwcm9tcHQgaGFzIG5vdCByZXR1cm5lZCwgY2FsbCAke1Rlcm1pbmFsVG9vbElkLkdldFRlcm1pbmFsT3V0cHV0fSB3aXRoIGlkPVwiJHt0ZXJtSWR9XCIgdG8gY29udGludWUgcG9sbGluZy4gVGhpcyBpcyB0aGUgZGVmYXVsdCBhbmQgc2FmZXN0IGFjdGlvbiB3aGVuIHVuc3VyZS5gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgMi4gT25seSBpZiB0aGUgb3V0cHV0IGNsZWFybHkgZW5kcyB3aXRoIGEgcmVhbCBub24tc2VjcmV0IGlucHV0IHByb21wdCAoQ29udGludWU/ICh5L24pLCBFbnRlciBzZWxlY3Rpb24sIGV0Yy4gXHUyMDE0IGEgbm9ybWFsIHNoZWxsIHByb21wdCBsaWtlIFxcYCRcXGAgb3IgXFxgI1xcYCBkb2VzIE5PVCBjb3VudCksIGNhbGwgdGhlIHZzY29kZV9hc2tRdWVzdGlvbnMgdG9vbCB0byBhc2sgdGhlIHVzZXIsIHRoZW4gc2VuZCBlYWNoIGFuc3dlciB1c2luZyAke1Rlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsfSB3aXRoIGlkPVwiJHt0ZXJtSWR9XCIgKHdoaWNoIHJldHVybnMgdGhlIG5leHQgZmV3IGxpbmVzIG9mIG91dHB1dCkuIFJlcGVhdCBvbmUgcHJvbXB0IGF0IGEgdGltZS4gTkVWRVIgcm91dGUgc2VjcmV0IHByb21wdHMgKHBhc3N3b3JkcywgcGFzc3BocmFzZXMsIHRva2VucywgQVBJIGtleXMsIGV0Yy4pIHRocm91Z2ggdnNjb2RlX2Fza1F1ZXN0aW9ucyBcdTIwMTQgYW5zd2VycyB0byB0aGF0IHRvb2wgYXJlIHNlbnQgdGhyb3VnaCB0aGUgbW9kZWwuIEZvciBzZWNyZXQgcHJvbXB0cywgdGVsbCB0aGUgdXNlciB0byB0eXBlIHRoZSB2YWx1ZSBkaXJlY3RseSBpbnRvIHRoZSB0ZXJtaW5hbCBhbmQgc3RvcC5gKTtcblx0XHR9XG5cdFx0aWYgKGh1bmdIaW50ID09PSAndGltZW91dCcpIHtcblx0XHRcdGxpbmVzLnB1c2goYCAgMy4gQSB0aW1lb3V0IGRvZXMgbm90IG1lYW4gdGhlIGNvbW1hbmQgZmFpbGVkIFx1MjAxNCBjYWxsICR7VGVybWluYWxUb29sSWQuR2V0VGVybWluYWxPdXRwdXR9IHdpdGggaWQ9XCIke3Rlcm1JZH1cIiB0byBjb250aW51ZSBwb2xsaW5nLiBPbmx5IGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5LaWxsVGVybWluYWx9IGlmIHRoZSBjb21tYW5kIGlzIGdlbnVpbmVseSBodW5nIGFuZCB5b3UgbmVlZCB0byByZXRyeSB3aXRoIGEgZGlmZmVyZW50IGFwcHJvYWNoLmApO1xuXHRcdH0gZWxzZSBpZiAoaHVuZ0hpbnQgPT09ICdpZGxlU2lsZW5jZScpIHtcblx0XHRcdGxpbmVzLnB1c2goYCAgMy4gUHJvZHVjaW5nIG5vIG91dHB1dCBmb3IgYW4gZXh0ZW5kZWQgcGVyaW9kIGRvZXMgbm90IG1lYW4gdGhlIGNvbW1hbmQgZmFpbGVkIFx1MjAxNCBjYWxsICR7VGVybWluYWxUb29sSWQuR2V0VGVybWluYWxPdXRwdXR9IHdpdGggaWQ9XCIke3Rlcm1JZH1cIiB0byBjb250aW51ZSBwb2xsaW5nLiBPbmx5IGNhbGwgJHtUZXJtaW5hbFRvb2xJZC5LaWxsVGVybWluYWx9IGlmIHRoZSBjb21tYW5kIGlzIGdlbnVpbmVseSBodW5nIGFuZCB5b3UgbmVlZCB0byByZXRyeSB3aXRoIGEgZGlmZmVyZW50IGFwcHJvYWNoLmApO1xuXHRcdH1cblx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRPdXRwdXRBbmFseXplck1lc3NhZ2UoZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCwgZXhpdFJlc3VsdDogc3RyaW5nLCBjb21tYW5kTGluZTogc3RyaW5nLCBpc1NhbmRib3hXcmFwcGVkOiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IGFuYWx5emVyIG9mIHRoaXMuX291dHB1dEFuYWx5emVycykge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGF3YWl0IGFuYWx5emVyLmFuYWx5emUoeyBleGl0Q29kZSwgZXhpdFJlc3VsdCwgY29tbWFuZExpbmUsIGlzU2FuZGJveFdyYXBwZWQgfSk7XG5cdFx0XHRpZiAobWVzc2FnZSkge1xuXHRcdFx0XHRyZXR1cm4gbWVzc2FnZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX21heEltYWdlRmlsZVNpemUgPSA1ICogMTAyNCAqIDEwMjQ7XG5cblx0LyoqXG5cdCAqIFNjYW5zIHRlcm1pbmFsIG91dHB1dCBmb3IgZmlsZSBwYXRocyB0aGF0IHBvaW50IHRvIGltYWdlcyBhbmQgcmVhZHMgdGhlbS5cblx0ICogUmV0dXJucyBkYXRhIGNvbnRlbnQgcGFydHMgZm9yIGFueSBmb3VuZCBpbWFnZXMgdGhhdCBleGlzdCBvbiBkaXNrLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZXh0cmFjdEltYWdlc0Zyb21PdXRwdXQob3V0cHV0OiBzdHJpbmcsIGN3ZDogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJVG9vbFJlc3VsdFsnY29udGVudCddPiB7XG5cdFx0Ly8gTWF0Y2ggcGF0aHMgY29udGFpbmluZyBhdCBsZWFzdCBvbmUgLyBvciBcXCBhbmQgZW5kaW5nIHdpdGggYW4gaW1hZ2Vcblx0XHQvLyBleHRlbnNpb24uIEVhY2ggYXRvbSB1c2VzIFteXFxzL1xcXFxdKiBzbyBpdCBjYW5ub3QgY29uc3VtZSBzZXBhcmF0b3JzLFxuXHRcdC8vIHdoaWNoIGtlZXBzIHRoZSBbL1xcXFxdIHRva2VucyB1bmFtYmlndW91cyBhbmQgcHJldmVudHMgY2F0YXN0cm9waGljXG5cdFx0Ly8gYmFja3RyYWNraW5nIG9uIGxvbmcgc3RyaW5ncy5cblx0XHRjb25zdCBwYXRoUGF0dGVybiA9IC9bXlxccy9cXFxcXSooPzpbL1xcXFxdW15cXHMvXFxcXF0qKStcXC4oPzpwbmd8anBlP2d8Z2lmfHdlYnB8Ym1wKS9naTtcblxuXHRcdGNvbnN0IG1hdGNoZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KC9cXHI/XFxuLykpIHtcblx0XHRcdGlmIChsaW5lLmxlbmd0aCA+IDEwXzAwMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgbGluZS5tYXRjaEFsbChwYXRoUGF0dGVybikpIHtcblx0XHRcdFx0bWF0Y2hlcy5hZGQobWF0Y2hbMF0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChtYXRjaGVzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHRzOiBJVG9vbFJlc3VsdFsnY29udGVudCddID0gW107XG5cdFx0Zm9yIChjb25zdCBmaWxlUGF0aCBvZiBtYXRjaGVzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtaW1lVHlwZSA9IGdldE1lZGlhTWltZShmaWxlUGF0aCk7XG5cdFx0XHRcdGlmICghbWltZVR5cGUgfHwgIW1pbWVUeXBlLnN0YXJ0c1dpdGgoJ2ltYWdlLycpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXNvbHZlIHRoZSBVUkkgLSBjaGVjayBmb3IgYWJzb2x1dGUgcGF0aCAoVW5peCAvIG9yIFdpbmRvd3MgZHJpdmUgbGV0dGVyKVxuXHRcdFx0XHRsZXQgZmlsZVVyaTogVVJJO1xuXHRcdFx0XHRpZiAoL15cXC98XltBLVphLXpdOltcXFxcXFwvXS8udGVzdChmaWxlUGF0aCkpIHtcblx0XHRcdFx0XHRmaWxlVXJpID0gVVJJLmZpbGUoZmlsZVBhdGgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN3ZCkge1xuXHRcdFx0XHRcdGZpbGVVcmkgPSBVUkkuam9pblBhdGgoY3dkLCBmaWxlUGF0aCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdChmaWxlVXJpKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0XHRpZiAoIXN0YXQgfHwgc3RhdC5pc0RpcmVjdG9yeSB8fCBzdGF0LnNpemUgPiBSdW5JblRlcm1pbmFsVG9vbC5fbWF4SW1hZ2VGaWxlU2l6ZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShmaWxlVXJpKTtcblx0XHRcdFx0cmVzdWx0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZGF0YScsXG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdG1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0ZGF0YTogZmlsZUNvbnRlbnQudmFsdWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhdWRpZW5jZTogW0xhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2UuVXNlcl0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIElnbm9yZSBmaWxlcyB0aGF0IGNhbid0IGJlIHJlYWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0cztcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVRlcm1pbmFsVmlzaWJpbGl0eSh0b29sVGVybWluYWw6IElUb29sVGVybWluYWwsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSkge1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uT3BlbkluV2lkZ2V0ID0gISF0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5PdXRwdXRMb2NhdGlvbikgPT09ICd0ZXJtaW5hbCcgJiYgY2hhdFNlc3Npb25PcGVuSW5XaWRnZXQpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh0b29sVGVybWluYWwuaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnJldmVhbFRlcm1pbmFsKHRvb2xUZXJtaW5hbC5pbnN0YW5jZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gI3JlZ2lvbiBUZXJtaW5hbCBpbml0XG5cblx0LyoqXG5cdCAqIEluaXRpYWxpemVzIGEgdGVybWluYWwgZm9yIGNvbW1hbmQgZXhlY3V0aW9uLiBGb3IgZm9yZWdyb3VuZCBtb2RlLCByZXVzZXMgZXhpc3RpbmcgY2FjaGVkXG5cdCAqIHRlcm1pbmFsIGZyb20gdGhlIHNlc3Npb24uIEZvciBiYWNrZ3JvdW5kIG1vZGUsIGFsd2F5cyBjcmVhdGVzIGEgbmV3IHRlcm1pbmFsIHRvIGFsbG93XG5cdCAqIHBhcmFsbGVsIGV4ZWN1dGlvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2luaXRUZXJtaW5hbChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIHRlcm1JZDogc3RyaW5nLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgaXNCYWNrZ3JvdW5kOiBib29sZWFuLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sVGVybWluYWw+IHtcblx0XHQvLyBGb3IgZm9yZWdyb3VuZCBtb2RlLCB0cnkgdG8gcmV1c2UgY2FjaGVkIHRlcm1pbmFsIChidXQgbm90IGlmIGl0IHdhcyBhIGJhY2tncm91bmQgdGVybWluYWwpXG5cdFx0aWYgKCFpc0JhY2tncm91bmQpIHtcblx0XHRcdGNvbnN0IGNhY2hlZFRlcm1pbmFsID0gdGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmdldChjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChjYWNoZWRUZXJtaW5hbCAmJiAhY2FjaGVkVGVybWluYWwuaXNCYWNrZ3JvdW5kICYmICFjYWNoZWRUZXJtaW5hbC5pbnN0YW5jZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdC8vIFdoZW4gdGhlIHNoZWxsIHByb2Nlc3MgaGFzIGFscmVhZHkgZXhpdGVkIChlLmcuIGBzZXQgLWVgIGtpbGxlZCB0aGVcblx0XHRcdFx0Ly8gbG9naW4gc2hlbGwgb24gYSBwcmV2aW91cyBjb21tYW5kIGZhaWx1cmUpLCByZXVzaW5nIHRoZSB0ZXJtaW5hbCB3b3VsZFxuXHRcdFx0XHQvLyBjYXVzZSB0aGUgZXhlY3V0ZSBzdHJhdGVneSB0byBoaXQgaXRzIGVhcmx5LW91dCBjaGVjayBhbmQgcmV0dXJuIHRoZVxuXHRcdFx0XHQvLyBzdGFsZSBleGl0IGNvZGUgaW5zdGVhZCBvZiBydW5uaW5nIHRoZSBuZXcgY29tbWFuZC4gRGlzY2FyZCB0aGUgZGVhZFxuXHRcdFx0XHQvLyB0ZXJtaW5hbCBhbmQgY3JlYXRlIGEgZnJlc2ggb25lIHNvIHRoZSBuZXh0IGNvbW1hbmQgc3RhcnRzIGluIGEgbGl2ZVxuXHRcdFx0XHQvLyBzaGVsbC5cblx0XHRcdFx0aWYgKGNhY2hlZFRlcm1pbmFsLmluc3RhbmNlLmV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFJ1bkluVGVybWluYWxUb29sOiBDYWNoZWQgdGVybWluYWwgc2hlbGwgaGFzIGV4aXRlZCAoY29kZT0ke2NhY2hlZFRlcm1pbmFsLmluc3RhbmNlLmV4aXRDb2RlfSksIGNyZWF0aW5nIGEgbmV3IHRlcm1pbmFsYCk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb25zLmRlbGV0ZShjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogVXNpbmcgY2FjaGVkIHRlcm1pbmFsIHdpdGggc2Vzc2lvbiByZXNvdXJjZSBcXGAke2NoYXRTZXNzaW9uUmVzb3VyY2V9XFxgYCk7XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxUb29sQ3JlYXRvci5yZWZyZXNoU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkoY2FjaGVkVGVybWluYWwpO1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UucmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aFRvb2xTZXNzaW9uKHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgY2FjaGVkVGVybWluYWwuaW5zdGFuY2UpO1xuXHRcdFx0XHRcdC8vIERpc3Bvc2UgYW55IHByZXZpb3VzIGJhY2tncm91bmQgbm90aWZpY2F0aW9uIChlLmcuIGZyb20gYW4gZWFybGllclxuXHRcdFx0XHRcdC8vIGBpbnB1dE5lZWRlZGAgcmFjZSB0aGF0IGxlZnQgYW4gT3V0cHV0TW9uaXRvciBhdHRhY2hlZCkgYmVmb3JlIHJldXNpbmdcblx0XHRcdFx0XHQvLyB0aGlzIHRlcm1pbmFsLCBzbyBpdHMgbGlzdGVuZXJzIGRvbid0IGFjY3VtdWxhdGUgYWNyb3NzIGludm9jYXRpb25zLlxuXHRcdFx0XHRcdHRoaXMuX2JhY2tncm91bmROb3RpZmljYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UoY2FjaGVkVGVybWluYWwuaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0XHRcdFx0cmV0dXJuIGNhY2hlZFRlcm1pbmFsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IENyZWF0aW5nICR7aXNCYWNrZ3JvdW5kID8gJ2JhY2tncm91bmQnIDogJ2ZvcmVncm91bmQnfSB0ZXJtaW5hbCB3aXRoIElEPSR7dGVybUlkfWApO1xuXHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCB0aGlzLl9wcm9maWxlRmV0Y2hlci5nZXRDb3BpbG90UHJvZmlsZSgpO1xuXHRcdGNvbnN0IG9zID0gYXdhaXQgdGhpcy5fb3NCYWNrZW5kO1xuXHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsVG9vbENyZWF0b3IuY3JlYXRlVGVybWluYWwocHJvZmlsZSwgb3MsIHRva2VuKTtcblx0XHR0b29sVGVybWluYWwuaXNCYWNrZ3JvdW5kID0gaXNCYWNrZ3JvdW5kO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UucmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aFRvb2xTZXNzaW9uKHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgdG9vbFRlcm1pbmFsLmluc3RhbmNlKTtcblx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLnJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhDaGF0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlLCB0b29sVGVybWluYWwuaW5zdGFuY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVySW5wdXRMaXN0ZW5lcih0b29sVGVybWluYWwpO1xuXHRcdHRoaXMuX2FkZFNlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRvb2xUZXJtaW5hbCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0b29sVGVybWluYWwuaW5zdGFuY2UuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3NldHVwUHJvY2Vzc0lkQXNzb2NpYXRpb24odG9vbFRlcm1pbmFsLCBjaGF0U2Vzc2lvblJlc291cmNlLCB0ZXJtSWQsIGlzQmFja2dyb3VuZCk7XG5cdFx0cmV0dXJuIHRvb2xUZXJtaW5hbDtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVySW5wdXRMaXN0ZW5lcih0b29sVGVybWluYWw6IElUb29sVGVybWluYWwpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdG9vbFRlcm1pbmFsLmluc3RhbmNlLm9uRGF0YShkYXRhID0+IHtcblx0XHRcdGlmICghdGVsZW1ldHJ5SWdub3JlZFNlcXVlbmNlcy5pbmNsdWRlcyhkYXRhKSkge1xuXHRcdFx0XHR0b29sVGVybWluYWwucmVjZWl2ZWRVc2VySW5wdXQgPSBkYXRhLmxlbmd0aCA+IDA7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0RXZlbnQub25jZSh0b29sVGVybWluYWwuaW5zdGFuY2Uub25EaXNwb3NlZCkoKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHR9XG5cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTZXNzaW9uIG1hbmFnZW1lbnRcblxuXHRwcml2YXRlIF9yZXN0b3JlVGVybWluYWxBc3NvY2lhdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmVkQXNzb2NpYXRpb25zID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFRlcm1pbmFsVG9vbFN0b3JhZ2VLZXlzSW50ZXJuYWwuVGVybWluYWxTZXNzaW9uLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCAne30nKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXNzb2NpYXRpb25zOiBSZWNvcmQ8bnVtYmVyLCBJU3RvcmVkVGVybWluYWxBc3NvY2lhdGlvbj4gPSBKU09OLnBhcnNlKHN0b3JlZEFzc29jaWF0aW9ucyk7XG5cblx0XHRcdC8vIEZpbmQgZXhpc3RpbmcgdGVybWluYWxzIGFuZCBhc3NvY2lhdGUgdGhlbSB3aXRoIHNlc3Npb25zXG5cdFx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdFx0aWYgKGluc3RhbmNlLnByb2Nlc3NJZCkge1xuXHRcdFx0XHRcdGNvbnN0IGFzc29jaWF0aW9uID0gYXNzb2NpYXRpb25zW2luc3RhbmNlLnByb2Nlc3NJZF07XG5cdFx0XHRcdFx0aWYgKGFzc29jaWF0aW9uKSB7XG5cdFx0XHRcdFx0XHQvLyBDb252ZXJ0IHN0b3JlZCBzdHJpbmcgSUQgdG8gVVJJIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5XG5cdFx0XHRcdFx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKGFzc29jaWF0aW9uLnNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogUmVzdG9yZWQgdGVybWluYWwgYXNzb2NpYXRpb24gZm9yIFBJRCAke2luc3RhbmNlLnByb2Nlc3NJZH0sIHNlc3Npb24gJHthc3NvY2lhdGlvbi5zZXNzaW9uSWR9YCk7XG5cdFx0XHRcdFx0XHRjb25zdCB0b29sVGVybWluYWw6IElUb29sVGVybWluYWwgPSB7XG5cdFx0XHRcdFx0XHRcdGluc3RhbmNlLFxuXHRcdFx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uUXVhbGl0eTogYXNzb2NpYXRpb24uc2hlbGxJbnRlZ3JhdGlvblF1YWxpdHksXG5cdFx0XHRcdFx0XHRcdGlzQmFja2dyb3VuZDogYXNzb2NpYXRpb24uaXNCYWNrZ3JvdW5kXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dGhpcy5fYWRkU2Vzc2lvblRlcm1pbmFsQXNzb2NpYXRpb24oY2hhdFNlc3Npb25SZXNvdXJjZSwgdG9vbFRlcm1pbmFsKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UucmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aENoYXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UsIGluc3RhbmNlKTtcblx0XHRcdFx0XHRcdGlmIChhc3NvY2lhdGlvbi5pZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zZXRBY3RpdmVFeGVjdXRpb24oYXNzb2NpYXRpb24uaWQsIHRoaXMuX3JlZ2lzdGVyKG5ldyBSZXN0b3JlZFRlcm1pbmFsRXhlY3V0aW9uKGluc3RhbmNlKSkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBMaXN0ZW4gZm9yIHRlcm1pbmFsIGRpc3Bvc2FsIHRvIGNsZWFuIHVwIHN0b3JhZ2Vcblx0XHRcdFx0XHRcdEV2ZW50Lm9uY2UoaW5zdGFuY2Uub25EaXNwb3NlZCkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9yZW1vdmVQcm9jZXNzSWRBc3NvY2lhdGlvbihpbnN0YW5jZS5wcm9jZXNzSWQhKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcmVtb3ZlRXhlY3V0aW9uQXNzb2NpYXRpb25zKGluc3RhbmNlKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogRmFpbGVkIHRvIHJlc3RvcmUgdGVybWluYWwgYXNzb2NpYXRpb25zOiAke2Vycm9yfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NldHVwUHJvY2Vzc0lkQXNzb2NpYXRpb24odG9vbFRlcm1pbmFsOiBJVG9vbFRlcm1pbmFsLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIHRlcm1JZDogc3RyaW5nLCBpc0JhY2tncm91bmQ6IGJvb2xlYW4pIHtcblx0XHRhd2FpdCB0aGlzLl9hc3NvY2lhdGVQcm9jZXNzSWRXaXRoU2Vzc2lvbih0b29sVGVybWluYWwuaW5zdGFuY2UsIGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRlcm1JZCwgdG9vbFRlcm1pbmFsLnNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LCBpc0JhY2tncm91bmQpO1xuXHRcdEV2ZW50Lm9uY2UodG9vbFRlcm1pbmFsLmluc3RhbmNlLm9uRGlzcG9zZWQpKCgpID0+IHtcblx0XHRcdGlmICh0b29sVGVybWluYWwhLmluc3RhbmNlLnByb2Nlc3NJZCkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVQcm9jZXNzSWRBc3NvY2lhdGlvbih0b29sVGVybWluYWwhLmluc3RhbmNlLnByb2Nlc3NJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hc3NvY2lhdGVQcm9jZXNzSWRXaXRoU2Vzc2lvbih0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UsIGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSwgaWQ6IHN0cmluZywgc2hlbGxJbnRlZ3JhdGlvblF1YWxpdHk6IFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LCBpc0JhY2tncm91bmQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFdhaXQgZm9yIHByb2Nlc3MgSUQgd2l0aCB0aW1lb3V0XG5cdFx0XHRjb25zdCBwaWQgPSBhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHR0ZXJtaW5hbC5wcm9jZXNzUmVhZHkudGhlbigoKSA9PiB0ZXJtaW5hbC5wcm9jZXNzSWQpLFxuXHRcdFx0XHR0aW1lb3V0KDUwMDApLnRoZW4oKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1RpbWVvdXQnKTsgfSlcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAoaXNOdW1iZXIocGlkKSkge1xuXHRcdFx0XHRjb25zdCBzdG9yZWRBc3NvY2lhdGlvbnMgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoVGVybWluYWxUb29sU3RvcmFnZUtleXNJbnRlcm5hbC5UZXJtaW5hbFNlc3Npb24sIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICd7fScpO1xuXHRcdFx0XHRjb25zdCBhc3NvY2lhdGlvbnM6IFJlY29yZDxudW1iZXIsIElTdG9yZWRUZXJtaW5hbEFzc29jaWF0aW9uPiA9IEpTT04ucGFyc2Uoc3RvcmVkQXNzb2NpYXRpb25zKTtcblxuXHRcdFx0XHQvLyBDb252ZXJ0IFVSSSB0byBzdHJpbmcgSUQgZm9yIHN0b3JhZ2UgKGJhY2t3YXJkIGNvbXBhdGliaWxpdHkpXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ0Fzc29jaWF0aW9uID0gYXNzb2NpYXRpb25zW3BpZF0gfHwge307XG5cdFx0XHRcdGFzc29jaWF0aW9uc1twaWRdID0ge1xuXHRcdFx0XHRcdC4uLmV4aXN0aW5nQXNzb2NpYXRpb24sXG5cdFx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHRcdHNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LFxuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdGlzQmFja2dyb3VuZFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRlcm1pbmFsVG9vbFN0b3JhZ2VLZXlzSW50ZXJuYWwuVGVybWluYWxTZXNzaW9uLCBKU09OLnN0cmluZ2lmeShhc3NvY2lhdGlvbnMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogQXNzb2NpYXRlZCB0ZXJtaW5hbCBQSUQgJHtwaWR9IHdpdGggc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IEZhaWxlZCB0byBhc3NvY2lhdGUgdGVybWluYWwgd2l0aCBzZXNzaW9uOiAke2Vycm9yfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlbW92ZVByb2Nlc3NJZEFzc29jaWF0aW9uKHBpZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0b3JlZEFzc29jaWF0aW9ucyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChUZXJtaW5hbFRvb2xTdG9yYWdlS2V5c0ludGVybmFsLlRlcm1pbmFsU2Vzc2lvbiwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ3t9Jyk7XG5cdFx0XHRjb25zdCBhc3NvY2lhdGlvbnM6IFJlY29yZDxudW1iZXIsIElTdG9yZWRUZXJtaW5hbEFzc29jaWF0aW9uPiA9IEpTT04ucGFyc2Uoc3RvcmVkQXNzb2NpYXRpb25zKTtcblxuXHRcdFx0aWYgKGFzc29jaWF0aW9uc1twaWRdKSB7XG5cdFx0XHRcdGRlbGV0ZSBhc3NvY2lhdGlvbnNbcGlkXTtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVGVybWluYWxUb29sU3RvcmFnZUtleXNJbnRlcm5hbC5UZXJtaW5hbFNlc3Npb24sIEpTT04uc3RyaW5naWZ5KGFzc29jaWF0aW9ucyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBSZW1vdmVkIHRlcm1pbmFsIGFzc29jaWF0aW9uIGZvciBQSUQgJHtwaWR9YCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBGYWlsZWQgdG8gcmVtb3ZlIHRlcm1pbmFsIGFzc29jaWF0aW9uOiAke2Vycm9yfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFudXBTZXNzaW9uVGVybWluYWxzKGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25UZXJtaW5hbHMgPSB0aGlzLl9zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuZ2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHRvb2xUZXJtaW5hbCA9IHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5nZXQoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgdGVybWluYWxzVG9EaXNwb3NlID0gc2Vzc2lvblRlcm1pbmFscyA/PyAodG9vbFRlcm1pbmFsID8gbmV3IFNldChbdG9vbFRlcm1pbmFsLmluc3RhbmNlXSkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghdGVybWluYWxzVG9EaXNwb3NlIHx8IHRlcm1pbmFsc1RvRGlzcG9zZS5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNob3VsZFByZXNlcnZlVGVybWluYWxzRm9yT3V0cHV0TG9jYXRpb24gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLk91dHB1dExvY2F0aW9uKSA9PT0gJ3Rlcm1pbmFsJztcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBDbGVhbmluZyB1cCAke3Rlcm1pbmFsc1RvRGlzcG9zZS5zaXplfSB0ZXJtaW5hbChzKSBmb3IgZW5kZWQgY2hhdCBzZXNzaW9uICR7Y2hhdFNlc3Npb25SZXNvdXJjZX1gKTtcblxuXHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5kZWxldGUoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmRlbGV0ZShjaGF0U2Vzc2lvblJlc291cmNlKTtcblxuXHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgdGVybWluYWxzVG9EaXNwb3NlKSB7XG5cdFx0XHQvLyBPbmx5IGRpc3Bvc2UgaWYgdGhlIHRlcm1pbmFsIGlzIHN0aWxsIGhpZGRlbiBmcm9tIHRoZSB1c2VyLiBPbmNlXG5cdFx0XHQvLyB0aGUgdXNlciByZXZlYWxzIGl0ICh2aWEgdGhlIHRlcm1pbmFsIHBhbmVsIG9yIHRoZSBvdXRwdXRMb2NhdGlvblxuXHRcdFx0Ly8gc2V0dGluZyksIGl0IGpvaW5zIGZvcmVncm91bmRJbnN0YW5jZXMgYW5kIHNob3VsZCBwZXJzaXN0IHNvIHRoZXlcblx0XHRcdC8vIGNhbiBpbnNwZWN0L2ludGVyYWN0IHdpdGggaXQuIEFsc28gcHJlc2VydmUgdGVybWluYWxzIHdoZW4gdGhlIHVzZXJcblx0XHRcdC8vIGV4cGxpY2l0bHkgY29uZmlndXJlZCBvdXRwdXRMb2NhdGlvbj10ZXJtaW5hbCwgc2luY2UgdGhlc2UgYXJlXG5cdFx0XHQvLyBpbnRlbmRlZCB0byByZW1haW4gYXZhaWxhYmxlIG91dHNpZGUgb2YgY2hhdCBzZXNzaW9uIGxpZmV0aW1lLlxuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5mb3JlZ3JvdW5kSW5zdGFuY2VzLmluY2x1ZGVzKHRlcm1pbmFsKSB8fCBzaG91bGRQcmVzZXJ2ZVRlcm1pbmFsc0Zvck91dHB1dExvY2F0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBTa2lwcGluZyBkaXNwb3NhbCBvZiBwcmVzZXJ2ZWQgdGVybWluYWwgJHt0ZXJtaW5hbC5pbnN0YW5jZUlkfSBmb3Igc2Vzc2lvbiAke2NoYXRTZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2tpcCByZWR1bmRhbnQgbWFwIHdhbGtzIGluIG9uRGlkRGlzcG9zZSBzaW5jZSB0aGlzIHNlc3Npb24gaGFzIGFscmVhZHkgYmVlbiByZW1vdmVkLlxuXHRcdFx0dGhpcy5fdGVybWluYWxzQmVpbmdEaXNwb3NlZEJ5U2Vzc2lvbkNsZWFudXAuYWRkKHRlcm1pbmFsKTtcblx0XHRcdHRlcm1pbmFsLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBDbGVhbiB1cCBhbnkgYWN0aXZlIGV4ZWN1dGlvbnMgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2Vzc2lvblxuXHRcdGNvbnN0IHRlcm1pbmFsVG9SZW1vdmU6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbdGVybUlkLCBleGVjdXRpb25dIG9mIFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKHRlcm1pbmFsc1RvRGlzcG9zZS5oYXMoZXhlY3V0aW9uLmluc3RhbmNlKSkge1xuXHRcdFx0XHQvLyBTa2lwIGFjdGl2ZSBleGVjdXRpb25zIGZvciB0ZXJtaW5hbHMgdGhhdCB3ZXJlIHByZXNlcnZlZCBhYm92ZS5cblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5mb3JlZ3JvdW5kSW5zdGFuY2VzLmluY2x1ZGVzKGV4ZWN1dGlvbi5pbnN0YW5jZSkgfHwgc2hvdWxkUHJlc2VydmVUZXJtaW5hbHNGb3JPdXRwdXRMb2NhdGlvbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4ZWN1dGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdHRlcm1pbmFsVG9SZW1vdmUucHVzaCh0ZXJtSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRlcm1JZCBvZiB0ZXJtaW5hbFRvUmVtb3ZlKSB7XG5cdFx0XHR0aGlzLl9kZWxldGVBY3RpdmVFeGVjdXRpb24odGVybUlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRTZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbihjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIHRvb2xUZXJtaW5hbDogSVRvb2xUZXJtaW5hbCk6IHZvaWQge1xuXHRcdHRoaXMuX2Vuc3VyZUFyY2hpdmVkU2Vzc2lvbkxpc3RlbmVyKCk7XG5cblx0XHRsZXQgc2Vzc2lvblRlcm1pbmFscyA9IHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5nZXQoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uVGVybWluYWxzKSB7XG5cdFx0XHRzZXNzaW9uVGVybWluYWxzID0gbmV3IFNldDxJVGVybWluYWxJbnN0YW5jZT4oKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEluc3RhbmNlcy5zZXQoY2hhdFNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblRlcm1pbmFscyk7XG5cdFx0fVxuXHRcdHNlc3Npb25UZXJtaW5hbHMuYWRkKHRvb2xUZXJtaW5hbC5pbnN0YW5jZSk7XG5cblx0XHRpZiAoIXRvb2xUZXJtaW5hbC5pc0JhY2tncm91bmQpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25UZXJtaW5hbEFzc29jaWF0aW9ucy5zZXQoY2hhdFNlc3Npb25SZXNvdXJjZSwgdG9vbFRlcm1pbmFsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVBcmNoaXZlZFNlc3Npb25MaXN0ZW5lcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYXJjaGl2ZWRTZXNzaW9uTGlzdGVuZXIudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBcmNoaXZpbmcgYSBzZXNzaW9uIGRvZXMgbm90IGZpcmUgb25EaWREaXNwb3NlU2Vzc2lvbiwgYnV0IHdlIHN0aWxsIG5lZWQgdG8gZGlzcG9zZVxuXHRcdC8vIGFueSB0ZXJtaW5hbHMgYXNzb2NpYXRlZCB3aXRoIHRoZSBhcmNoaXZlZCBzZXNzaW9uIHRvIGF2b2lkIHByb2Nlc3MgYWNjdW11bGF0aW9uLlxuXHRcdHRoaXMuX2FyY2hpdmVkU2Vzc2lvbkxpc3RlbmVyLnZhbHVlID0gdGhpcy5fYWdlbnRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZShzZXNzaW9uID0+IHtcblx0XHRcdGlmIChzZXNzaW9uLmlzQXJjaGl2ZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9jbGVhbnVwU2Vzc2lvblRlcm1pbmFscyhzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZVRlcm1pbmFsQXNzb2NpYXRpb25zKHRlcm1pbmFsOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbHNCZWluZ0Rpc3Bvc2VkQnlTZXNzaW9uQ2xlYW51cC5kZWxldGUodGVybWluYWwpKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVFeGVjdXRpb25Bc3NvY2lhdGlvbnModGVybWluYWwpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25SZXNvdXJjZSwgdG9vbFRlcm1pbmFsXSBvZiB0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZW50cmllcygpKSB7XG5cdFx0XHRpZiAodGVybWluYWwgPT09IHRvb2xUZXJtaW5hbC5pbnN0YW5jZSkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uVGVybWluYWxBc3NvY2lhdGlvbnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uVGVybWluYWxzXSBvZiB0aGlzLl9zZXNzaW9uVGVybWluYWxJbnN0YW5jZXMuZW50cmllcygpKSB7XG5cdFx0XHRpZiAoIXNlc3Npb25UZXJtaW5hbHMuZGVsZXRlKHRlcm1pbmFsKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChzZXNzaW9uVGVybWluYWxzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3JlbW92ZUV4ZWN1dGlvbkFzc29jaWF0aW9ucyh0ZXJtaW5hbCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVFeGVjdXRpb25Bc3NvY2lhdGlvbnModGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhlY3V0aW9uSWRzVG9SZW1vdmU6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbdGVybUlkLCBleGVjdXRpb25dIG9mIFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmVudHJpZXMoKSkge1xuXHRcdFx0aWYgKGV4ZWN1dGlvbi5pbnN0YW5jZSA9PT0gdGVybWluYWwpIHtcblx0XHRcdFx0ZXhlY3V0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0ZXhlY3V0aW9uSWRzVG9SZW1vdmUucHVzaCh0ZXJtSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRlcm1JZCBvZiBleGVjdXRpb25JZHNUb1JlbW92ZSkge1xuXHRcdFx0dGhpcy5fZGVsZXRlQWN0aXZlRXhlY3V0aW9uKHRlcm1JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIGxpc3RlbmVyIGZvciBjb21tYW5kIGNvbXBsZXRpb24gb24gYSBiYWNrZ3JvdW5kIHRlcm1pbmFsLlxuXHQgKiBXaGVuIGEgY29tbWFuZCBmaW5pc2hlcywgc2VuZHMgYSBzdGVlcmluZyBtZXNzYWdlIHRvIHRoZSBjaGF0IHNlc3Npb25cblx0ICogc28gdGhlIGFnZW50IGlzIG5vdGlmaWVkIG9uIGl0cyBuZXh0IHR1cm4uXG5cdCAqXG5cdCAqIElmIGFuIG91dHB1dCBtb25pdG9yIGlzIHByb3ZpZGVkLCBpdCBpcyBjb250aW51ZWQgaW4gYmFja2dyb3VuZCBtb2RlXG5cdCAqIHRvIGRldGVjdCBwcm9tcHRzLWZvci1pbnB1dCB3aGlsZSB0aGUgdGVybWluYWwgcnVucyBpbiB0aGUgYmFja2dyb3VuZC5cblx0ICogVGhlIG91dHB1dCBtb25pdG9yIGlzIGNhbmNlbGxlZCBhbmQgZGlzcG9zZWQgd2hlbiBhIGNvbW1hbmQgZmluaXNoZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlckNvbXBsZXRpb25Ob3RpZmljYXRpb24odGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIHRlcm1JZDogc3RyaW5nLCBjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIGNvbW1hbmROYW1lOiBzdHJpbmcsIHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIG91dHB1dE1vbml0b3I/OiBPdXRwdXRNb25pdG9yLCBhbHJlYWR5Tm90aWZpZWRJbnB1dE5lZWRlZE91dHB1dD86IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIERpc3Bvc2UgYW55IHByZXZpb3VzIGJhY2tncm91bmQgbm90aWZpY2F0aW9uIGZvciB0aGlzIHRlcm1pbmFsIGluc3RhbmNlIHRvIHByZXZlbnRcblx0XHQvLyBsaXN0ZW5lciBhY2N1bXVsYXRpb24gKGUuZy4gbXVsdGlwbGUgb25EaWRJbnB1dERhdGEgc3Vic2NyaXB0aW9ucykgd2hlbiB0aGUgc2FtZVxuXHRcdC8vIGZvcmVncm91bmQgdGVybWluYWwgaXMgcmV1c2VkIGFjcm9zcyBydW5faW5fdGVybWluYWwgaW52b2NhdGlvbnMuXG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uS2V5ID0gdGVybWluYWxJbnN0YW5jZS5pbnN0YW5jZUlkO1xuXHRcdHRoaXMuX2JhY2tncm91bmROb3RpZmljYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uobm90aWZpY2F0aW9uS2V5KTtcblxuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB0ZXJtaW5hbEluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdGlmICghY29tbWFuZERldGVjdGlvbikge1xuXHRcdFx0b3V0cHV0TW9uaXRvcj8uZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIGEgc2luZ2xlLWxpbmUsIHNhZmVseS1mZW5jZWQgaW5saW5lIGNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlXG5cdFx0Ly8gY29tbWFuZCBmb3IgdXNlIGluIHRoZSBzeXN0ZW0gbm90aWZpY2F0aW9uIGxhYmVsICgjMzE4NjAxKS5cblx0XHRjb25zdCBjb21tYW5kRGlzcGxheSA9IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZChjb21tYW5kTmFtZSkpO1xuXG5cdFx0Ly8gQWNxdWlyZSBhIHJlZmVyZW5jZSB0byB0aGUgQ2hhdE1vZGVsIHNvIGl0IHN0YXlzIGFsaXZlIHdoaWxlIHdlIHdhaXRcblx0XHQvLyBmb3IgdGhlIGJhY2tncm91bmQgdGVybWluYWwgdG8gY29tcGxldGUuIFdpdGhvdXQgdGhpcywgdGhlIG1vZGVsIGNhblxuXHRcdC8vIGJlIGRpc3Bvc2VkIGlmIHRoZSB1c2VyIG5hdmlnYXRlcyBhd2F5LCBhbmQgc2VuZFJlcXVlc3Qgd291bGQgdGhyb3cuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlZiA9IHRoaXMuX2NoYXRTZXJ2aWNlLmFjcXVpcmVFeGlzdGluZ1Nlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZSwgJ1J1bkluVGVybWluYWxUb29sI2NvbXBsZXRpb25Ob3RpZmljYXRpb24nKTtcblx0XHRpZiAoIXNlc3Npb25SZWYpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgUnVuSW5UZXJtaW5hbFRvb2w6IENhbm5vdCByZWdpc3RlciBjb21wbGV0aW9uIG5vdGlmaWNhdGlvbiBmb3IgdGVybWluYWwgJHt0ZXJtSWR9IC0gc2Vzc2lvbiBhbHJlYWR5IGRpc3Bvc2VkYCk7XG5cdFx0XHRvdXRwdXRNb25pdG9yPy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2FwdHVyZSBhZ2VudC9tb2RlbC9tb2RlL3Rvb2xzIHNvIHRoZSBub3RpZmljYXRpb24gcmVzdW1lcyB0aGUgc2FtZVxuXHRcdC8vIGFnZW50IGNvbnRleHQgdGhhdCBzdGFydGVkIHRoZSBiYWNrZ3JvdW5kIHRlcm1pbmFsIGNvbW1hbmQuIFRoZVxuXHRcdC8vIG5vdGlmaWNhdGlvbiBtZXNzYWdlIHN0YXJ0cyBhIGZ1bGwgYWdlbnQgdHVybiwgc28gaXQgbXVzdCBydW4gb24gYVxuXHRcdC8vIHJlYWwgY29udmVyc2F0aW9uIG1vZGVsIFx1MjAxNCBhIHdlYWtlciB1dGlsaXR5IG1vZGVsIGNhbm5vdCByZWxpYWJseVxuXHRcdC8vIGFzc2VzcyB0aGUgY29tbWFuZCBvdXRwdXQgb3IgY29udGludWUgdGhlIGFnZW50aWMgdG9vbCBsb29wLCB3aGljaFxuXHRcdC8vIGxlZnQgdGhlIGFnZW50IHNpbGVudCBhZnRlciBhIGJhY2tncm91bmRlZCBjb21tYW5kIGZpbmlzaGVkLlxuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gc2Vzc2lvblJlZi5vYmplY3QubGFzdFJlcXVlc3Q7XG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnM6IHsgdXNlclNlbGVjdGVkTW9kZWxJZD86IHN0cmluZzsgbW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbzsgdXNlclNlbGVjdGVkVG9vbHM/OiBJT2JzZXJ2YWJsZTxVc2VyU2VsZWN0ZWRUb29scz47IGFnZW50SWRTaWxlbnQ/OiBzdHJpbmcgfSA9IHt9O1xuXHRcdGlmIChsYXN0UmVxdWVzdCkge1xuXHRcdFx0c2VuZE9wdGlvbnMudXNlclNlbGVjdGVkTW9kZWxJZCA9IGxhc3RSZXF1ZXN0Lm1vZGVsSWQ7XG5cdFx0XHRzZW5kT3B0aW9ucy5tb2RlSW5mbyA9IGxhc3RSZXF1ZXN0Lm1vZGVJbmZvO1xuXHRcdFx0c2VuZE9wdGlvbnMuYWdlbnRJZFNpbGVudCA9IGxhc3RSZXF1ZXN0LnJlc3BvbnNlPy5hZ2VudD8uaWQ7XG5cdFx0XHRpZiAobGFzdFJlcXVlc3QudXNlclNlbGVjdGVkVG9vbHMpIHtcblx0XHRcdFx0c2VuZE9wdGlvbnMudXNlclNlbGVjdGVkVG9vbHMgPSBjb25zdE9ic2VydmFibGUobGFzdFJlcXVlc3QudXNlclNlbGVjdGVkVG9vbHMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbnRpbnVlIHRoZSBvdXRwdXQgbW9uaXRvciBpbiBiYWNrZ3JvdW5kIG1vZGUgZm9yIHByb21wdC1mb3ItaW5wdXQgZGV0ZWN0aW9uLlxuXHRcdC8vIFRoZSBtb25pdG9yIHdha2VzIG9ubHkgb24gbmV3IHRlcm1pbmFsIGRhdGEgKG5vdCBvbiBhIGZpeGVkIGludGVydmFsKSwgc29cblx0XHQvLyByZXNvdXJjZSBjb3N0IGlzIHByb3BvcnRpb25hbCB0byBhY3R1YWwgdGVybWluYWwgYWN0aXZpdHkuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBUcmFjayB3aGV0aGVyIHRoZSB1c2VyIGhhcyBzdGFydGVkIHJlcGx5aW5nIHRvIHRlcm1pbmFsIHByb21wdHMgZGlyZWN0bHkuXG5cdFx0Ly8gT25jZSBzZXQsIGFsbCBmdXR1cmUgaW5wdXQtbmVlZGVkIG5vdGlmaWNhdGlvbnMgYXJlIHN1cHByZXNzZWQgc28gdGhlIGFnZW50XG5cdFx0Ly8gc3RvcHMgYXNraW5nIHF1ZXN0aW9ucyBhbmQgbGV0cyB0aGUgdXNlciBmaW5pc2ggaW50ZXJhY3Rpbmcgd2l0aCB0aGUgdGVybWluYWwuXG5cdFx0bGV0IHVzZXJJc1JlcGx5aW5nRGlyZWN0bHkgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGRpc3Bvc2VOb3RpZmljYXRpb24gPSAoKSA9PiB0aGlzLl9iYWNrZ3JvdW5kTm90aWZpY2F0aW9ucy5kZWxldGVBbmREaXNwb3NlKG5vdGlmaWNhdGlvbktleSk7XG5cblx0XHQvLyBJZiB0aGUgdXNlciBtYW51YWxseSBzdG9wcGVkIHRoZSBhZ2VudCwgc3VwcHJlc3MgYmFja2dyb3VuZFxuXHRcdC8vIHN0ZWVyaW5nIHJlcXVlc3RzIGFuZCB0ZWFyIGRvd24gdGhlIG5vdGlmaWNhdGlvbiBsaXN0ZW5lcnMuXG5cdFx0Y29uc3QgaGFuZGxlU2Vzc2lvbkNhbmNlbGxlZCA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdGlmIChzZXNzaW9uUmVmLm9iamVjdC5sYXN0UmVxdWVzdD8ucmVzcG9uc2U/LmlzQ2FuY2VsZWQpIHtcblx0XHRcdFx0ZGlzcG9zZU5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0Ly8gUHJvYWN0aXZlbHkgZGV0ZWN0IHNlc3Npb24gY2FuY2VsbGF0aW9uIHNvIHRoYXQgYWxsIGJhY2tncm91bmRcblx0XHQvLyBsaXN0ZW5lcnMgYXJlIHRvcm4gZG93biBpbW1lZGlhdGVseSwgcmF0aGVyIHRoYW4gd2FpdGluZyBmb3IgdGhlXG5cdFx0Ly8gbmV4dCB0ZXJtaW5hbCBldmVudCB0byBmaXJlIGFuZCBkaXNjb3ZlciB0aGUgY2FuY2VsbGVkIHN0YXRlLlxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gc2Vzc2lvblJlZi5vYmplY3QubGFzdFJlcXVlc3RPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFyZXF1ZXN0Py5yZXNwb25zZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlcXVlc3QucmVzcG9uc2Uub25EaWRDaGFuZ2UoZXYgPT4ge1xuXHRcdFx0XHRpZiAoZXYucmVhc29uID09PSAnY29tcGxldGVkUmVxdWVzdCcgJiYgcmVxdWVzdC5yZXNwb25zZSEuaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRcdGRpc3Bvc2VOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdGlmIChvdXRwdXRNb25pdG9yKSB7XG5cdFx0XHQvLyBTZWVkIGRlZHVwIHN0YXRlIHNvIHRoYXQgaWYgdGhpcyBCRyBtb25pdG9yIHdhcyBzdGFydGVkIHJpZ2h0IGFmdGVyIHRoZVxuXHRcdFx0Ly8gZm9yZWdyb3VuZCB0b29sIHJldHVybmVkIHZpYSB0aGUgYGlucHV0TmVlZGVkYCByYWNlLCB0aGUgaW1tZWRpYXRlXG5cdFx0XHQvLyByZS1kZXRlY3Rpb24gb2YgdGhlIHNhbWUgcHJvbXB0IGRvZXMgbm90IHByb2R1Y2UgYSByZWR1bmRhbnQgc3RlZXJpbmdcblx0XHRcdC8vIG1lc3NhZ2UuIFRoZSBhZ2VudCBoYXMgYWxyZWFkeSByZWNlaXZlZCB0aGF0IG91dHB1dCBhcyB0aGUgdG9vbCByZXN1bHRcblx0XHRcdC8vIGFuZCBpcyBpbiB0aGUgbWlkZGxlIG9mIHByb2R1Y2luZyBhIGBzZW5kX3RvX3Rlcm1pbmFsYCByZXNwb25zZSBcdTIwMTRcblx0XHRcdC8vIGZpcmluZyBhIHN0ZWVyaW5nIG1lc3NhZ2UgaGVyZSB3b3VsZCBzZXQgYHlpZWxkUmVxdWVzdGVkYCBhbmQgYWJvcnRcblx0XHRcdC8vIHRoYXQgaW4tZmxpZ2h0IHJlc3BvbnNlLCBsZWF2aW5nIHRoZSB0ZXJtaW5hbCBodW5nIGF0IHRoZSBwcm9tcHQuXG5cdFx0XHQvLyBTdWJzZXF1ZW50IGZpcmluZ3MgcmVxdWlyZSBuZXcgdGVybWluYWwgZGF0YSBhbmQgdGhlcmVmb3JlIGEgZGlmZmVyZW50XG5cdFx0XHQvLyBgY3VycmVudE91dHB1dGAsIHNvIHRoZXkgd2lsbCBwYXNzIHRoZSBkZWR1cCBjaGVjayBub3JtYWxseS5cblx0XHRcdGxldCBsYXN0SW5wdXROZWVkZWRPdXRwdXQgPSBhbHJlYWR5Tm90aWZpZWRJbnB1dE5lZWRlZE91dHB1dCA/PyAnJztcblx0XHRcdGxldCBsYXN0SW5wdXROZWVkZWROb3RpZmljYXRpb25UaW1lID0gYWxyZWFkeU5vdGlmaWVkSW5wdXROZWVkZWRPdXRwdXQgIT09IHVuZGVmaW5lZCA/IERhdGUubm93KCkgOiAwO1xuXHRcdFx0Y29uc3QgYmdDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHQvLyBDYW5jZWwgYmVmb3JlIGRpc3Bvc2Ugc28gdGhhdCBvbkNhbmNlbGxhdGlvblJlcXVlc3RlZCBoYW5kbGVycyBmaXJlXG5cdFx0XHRcdC8vIGFuZCBwZW5kaW5nIHByb21pc2VzIChlLmcuIF93YWl0Rm9yTmV3RGF0YSkgcmVzb2x2ZSBwcm9wZXJseS5cblx0XHRcdFx0YmdDdHMuY2FuY2VsKCk7XG5cdFx0XHRcdGJnQ3RzLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChvdXRwdXRNb25pdG9yKTtcblx0XHRcdG91dHB1dE1vbml0b3IuY29udGludWVNb25pdG9yaW5nQXN5bmMoYmdDdHMudG9rZW4pO1xuXG5cdFx0XHQvLyBTZW5zaXRpdmUgcHJvbXB0cyAocGFzc3dvcmRzLCBPVFBzLCBcdTIwMjYpIGRldGVjdGVkIHdoaWxlIHRoZSBjb21tYW5kIHJ1bnNcblx0XHRcdC8vIGluIHRoZSBiYWNrZ3JvdW5kIG11c3Qgbm90IGdlbmVyYXRlIGEgc3RlZXJpbmcgbWVzc2FnZSBcdTIwMTQgdGhlIHNlY3JldFxuXHRcdFx0Ly8gbXVzdCBuZXZlciByZWFjaCB0aGUgbW9kZWwuIFNob3cgYSBjb25maXJtYXRpb24gZGlhbG9nIHRoYXQgZm9jdXNlc1xuXHRcdFx0Ly8gdGhlIHRlcm1pbmFsIHNvIHRoZSB1c2VyIGNhbiB0eXBlIHRoZSBzZWNyZXQgZGlyZWN0bHkuXG5cdFx0XHRzdG9yZS5hZGQodGhpcy5fcmVnaXN0ZXJTZW5zaXRpdmVJbnB1dEVsaWNpdGF0aW9uKFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlLFxuXHRcdFx0XHRvdXRwdXRNb25pdG9yLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KHRlcm1JZCk7XG5cdFx0XHRcdFx0ZXhlY3V0aW9uPy5kaXNwb3NlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHQpKTtcblxuXHRcdFx0Ly8gV2hlbiB0aGUgb3V0cHV0IG1vbml0b3IgZGV0ZWN0cyB0aGUgdGVybWluYWwgaXMgd2FpdGluZyBmb3IgaW5wdXQsXG5cdFx0XHQvLyBzZW5kIGEgc3RlZXJpbmcgbWVzc2FnZSBzbyB0aGUgYWdlbnQgaGFuZGxlcyBpdCB2aWEgc2VuZF90b190ZXJtaW5hbC5cblx0XHRcdHN0b3JlLmFkZChvdXRwdXRNb25pdG9yLm9uRGlkRGV0ZWN0SW5wdXROZWVkZWQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodXNlcklzUmVwbHlpbmdEaXJlY3RseSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBTdXBwcmVzc2luZyBpbnB1dC1uZWVkZWQgbm90aWZpY2F0aW9uIGZvciB0ZXJtaW5hbCAke3Rlcm1JZH0gYmVjYXVzZSB1c2VyIGlzIHJlcGx5aW5nIGRpcmVjdGx5YCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHRlcm1pbmFsIGhhcyBiZWVuIGRpc3Bvc2VkIChlLmcuIHRoZSB1c2VyIGNsb3NlZCBpdCksIHRoZVxuXHRcdFx0XHQvLyBidWZmZXJlZCBvdXRwdXQgbWF5IHN0aWxsIG1hdGNoIGFuIGlucHV0LXJlcXVpcmVkIHBhdHRlcm4gKGZvclxuXHRcdFx0XHQvLyBleGFtcGxlLCBhIHBhZ2VyIHByb21wdCBsZWZ0IGluIHRoZSBzY3JvbGxiYWNrKS4gU2VuZGluZyBhblxuXHRcdFx0XHQvLyBpbnB1dC1uZWVkZWQgc3RlZXJpbmcgbWVzc2FnZSBpbiB0aGF0IGNhc2UgcHJvZHVjZXMgYSBzcHVyaW91c1xuXHRcdFx0XHQvLyBjaGF0L3Rvb2wgdHVybiBldmVuIHRob3VnaCB0aGVyZSdzIG5vIGxpdmUgdGVybWluYWwgdG8gc2VuZFxuXHRcdFx0XHQvLyBpbnB1dCB0byBcdTIwMTQgdGhlIGFnZW50IHdpbGwgYmUgbm90aWZpZWQgc2VwYXJhdGVseSB2aWEgdGhlXG5cdFx0XHRcdC8vIGBvbkRpc3Bvc2VkYCBsaXN0ZW5lciBiZWxvdy5cblx0XHRcdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBTdXBwcmVzc2luZyBpbnB1dC1uZWVkZWQgbm90aWZpY2F0aW9uIGZvciB0ZXJtaW5hbCAke3Rlcm1JZH0gYmVjYXVzZSB0aGUgdGVybWluYWwgaXMgZGlzcG9zZWRgKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaGFuZGxlU2Vzc2lvbkNhbmNlbGxlZCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gUnVuSW5UZXJtaW5hbFRvb2wuX2FjdGl2ZUV4ZWN1dGlvbnMuZ2V0KHRlcm1JZCk7XG5cdFx0XHRcdGlmICghZXhlY3V0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3VycmVudE91dHB1dCA9IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblx0XHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0Y29uc3QgaXNEdXBsaWNhdGUgPSBjdXJyZW50T3V0cHV0ID09PSBsYXN0SW5wdXROZWVkZWRPdXRwdXQgJiYgbm93IC0gbGFzdElucHV0TmVlZGVkTm90aWZpY2F0aW9uVGltZSA8IElOUFVUX05FRURFRF9OT1RJRklDQVRJT05fVEhST1RUTEVfTVM7XG5cdFx0XHRcdGlmIChpc0R1cGxpY2F0ZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0SW5wdXROZWVkZWRPdXRwdXQgPSBjdXJyZW50T3V0cHV0O1xuXHRcdFx0XHRsYXN0SW5wdXROZWVkZWROb3RpZmljYXRpb25UaW1lID0gbm93O1xuXHRcdFx0XHRjb25zdCBpbnB1dEFjdGlvbiA9IHRoaXMuX2J1aWxkSW5wdXROZWVkZWRTdGVlcmluZ1RleHQoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkLCAnbm9uZScpO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gYFtUZXJtaW5hbCAke3Rlcm1JZH0gbm90aWZpY2F0aW9uOiBjb21tYW5kIG1heSBiZSB3YWl0aW5nIGZvciBpbnB1dCBcdTIwMTQgYXNzZXNzIHRoZSBvdXRwdXQgYmVsb3cuXVxcbiR7aW5wdXRBY3Rpb259XFxuVGVybWluYWwgb3V0cHV0OlxcbiR7Y3VycmVudE91dHB1dH1gO1xuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBJbnB1dCBuZWVkZWQgaW4gYmFja2dyb3VuZCB0ZXJtaW5hbCAke3Rlcm1JZH0sIG5vdGlmeWluZyBjaGF0IHNlc3Npb25gKTtcblxuXHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0U2Vzc2lvblJlc291cmNlLCBtZXNzYWdlLCB7XG5cdFx0XHRcdFx0Li4uc2VuZE9wdGlvbnMsXG5cdFx0XHRcdFx0cXVldWU6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiBsb2NhbGl6ZSgndGVybWluYWxBc3Nlc3NpbmdPdXRwdXQnLCBcInswfSBtYXkgbmVlZCBpbnB1dFwiLCBjb21tYW5kRGlzcGxheSksXG5cdFx0XHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogdGVybUlkLFxuXHRcdFx0XHR9KS5jYXRjaChlID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFJ1bkluVGVybWluYWxUb29sOiBGYWlsZWQgdG8gc2VuZCBpbnB1dC1uZWVkZWQgbm90aWZpY2F0aW9uIGZvciB0ZXJtaW5hbCAke3Rlcm1JZH1gLCBlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB0aGUgdXNlciB0eXBlcyBkaXJlY3RseSBpbiB0aGUgdGVybWluYWwsIGRpc21pc3MgYW55IHBlbmRpbmdcblx0XHQvLyBxdWVzdGlvbiBjYXJvdXNlbCBmb3IgdGhpcyB0ZXJtaW5hbCBzbyB0aGUgdG9vbCBpbnZvY2F0aW9uIGlzXG5cdFx0Ly8gdW5ibG9ja2VkIGFuZCB0aGUgY2Fyb3VzZWwgZG9lc24ndCBsaW5nZXIuIEFsc28gc3VwcHJlc3MgZnV0dXJlXG5cdFx0Ly8gaW5wdXQtbmVlZGVkIG5vdGlmaWNhdGlvbnMgc2luY2UgdGhlIHVzZXIgaXMgaGFuZGxpbmcgcHJvbXB0cy5cblx0XHRzdG9yZS5hZGQodGVybWluYWxJbnN0YW5jZS5vbkRpZElucHV0RGF0YSgoKSA9PiB7XG5cdFx0XHRpZiAodXNlcklzUmVwbHlpbmdEaXJlY3RseSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR1c2VySXNSZXBseWluZ0RpcmVjdGx5ID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2Rpc21pc3NQZW5kaW5nQ2Fyb3VzZWxzRm9yVGVybWluYWwoY2hhdFNlc3Npb25SZXNvdXJjZSwgdGVybUlkKTtcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoc2Vzc2lvblJlZik7XG5cblx0XHRzdG9yZS5hZGQoY29tbWFuZERldGVjdGlvbi5vbkNvbW1hbmRGaW5pc2hlZChjb21tYW5kID0+IHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmdldCh0ZXJtSWQpO1xuXHRcdFx0aWYgKCFleGVjdXRpb24pIHtcblx0XHRcdFx0ZGlzcG9zZU5vdGlmaWNhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChoYW5kbGVTZXNzaW9uQ2FuY2VsbGVkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaXNwb3NlIGFmdGVyIGZpcnN0IG5vdGlmaWNhdGlvbiB0byBhdm9pZCBjaGF0dHkgcmVwZWF0ZWQgbWVzc2FnZXNcblx0XHRcdC8vIGlmIHRoZSB1c2VyIHJ1bnMgYWRkaXRpb25hbCBjb21tYW5kcyB2aWEgc2VuZF90b190ZXJtaW5hbC5cblx0XHRcdGRpc3Bvc2VOb3RpZmljYXRpb24oKTtcblxuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSBjb21tYW5kLmV4aXRDb2RlO1xuXHRcdFx0Ly8gQSBzdWNjZXNzZnVsIGNvbXBsZXRpb24gaXMgYWxyZWFkeSBjb252ZXllZCBieSBcImNvbW1hbmQgY29tcGxldGVkXCI7XG5cdFx0XHQvLyBvbmx5IHN1cmZhY2UgYW4gZXhpdCBjb2RlIGluIGNoYXQgd2hlbiBpdCBwcm92aWRlcyBmYWlsdXJlIGNvbnRleHQuXG5cdFx0XHRjb25zdCBleGl0Q29kZVRleHQgPSBleGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmIGV4aXRDb2RlICE9PSAwID8gYCB3aXRoIGV4aXQgY29kZSAke2V4aXRDb2RlfWAgOiAnJztcblx0XHRcdGNvbnN0IGN1cnJlbnRPdXRwdXQgPSBleGVjdXRpb24uZ2V0T3V0cHV0KCk7XG5cdFx0XHQvLyBPbmx5IGRpc3Bvc2UgaWYgdGhlIHRlcm1pbmFsIGlzIHN0aWxsIGhpZGRlbiBmcm9tIHRoZSB1c2VyLiBPbmNlIHRoZVxuXHRcdFx0Ly8gdXNlciByZXZlYWxzIGl0ICh2aWEgdGhlIFwiU2hvd1wiIGxpbmspLCBpdCBqb2lucyBgZm9yZWdyb3VuZEluc3RhbmNlc2Bcblx0XHRcdC8vIGFuZCBzaG91bGQgcGVyc2lzdCBzbyB0aGV5IGNhbiBpbnNwZWN0L2ludGVyYWN0IHdpdGggaXQuXG5cdFx0XHRjb25zdCBpc1VzZXJWaXNpYmxlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmZvcmVncm91bmRJbnN0YW5jZXMuaW5jbHVkZXModGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gaXNVc2VyVmlzaWJsZVxuXHRcdFx0XHQ/IGBbVGVybWluYWwgJHt0ZXJtSWR9IG5vdGlmaWNhdGlvbjogY29tbWFuZCBjb21wbGV0ZWQke2V4aXRDb2RlVGV4dH0uIFVzZSBzZW5kX3RvX3Rlcm1pbmFsIHRvIHNlbmQgYW5vdGhlciBjb21tYW5kIG9yIGtpbGxfdGVybWluYWwgdG8gc3RvcCBpdC5dXFxuVGVybWluYWwgb3V0cHV0OlxcbiR7Y3VycmVudE91dHB1dH1gXG5cdFx0XHRcdDogYFtUZXJtaW5hbCAke3Rlcm1JZH0gbm90aWZpY2F0aW9uOiBjb21tYW5kIGNvbXBsZXRlZCR7ZXhpdENvZGVUZXh0fS4gVGhlIHRlcm1pbmFsIGhhcyBiZWVuIGNsZWFuZWQgdXAuXVxcblRlcm1pbmFsIG91dHB1dDpcXG4ke2N1cnJlbnRPdXRwdXR9YDtcblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IENvbW1hbmQgY29tcGxldGVkIGluIGJhY2tncm91bmQgdGVybWluYWwgJHt0ZXJtSWR9LCBub3RpZnlpbmcgY2hhdCBzZXNzaW9uYCk7XG5cblx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KGNoYXRTZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2UsIHtcblx0XHRcdFx0Li4uc2VuZE9wdGlvbnMsXG5cdFx0XHRcdHF1ZXVlOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyxcblx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IHRydWUsXG5cdFx0XHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiBsb2NhbGl6ZSgndGVybWluYWxDb21tYW5kQ29tcGxldGVkJywgXCJ7MH0gY29tcGxldGVkXCIsIGNvbW1hbmREaXNwbGF5KSxcblx0XHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogdGVybUlkLFxuXHRcdFx0fSkuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgUnVuSW5UZXJtaW5hbFRvb2w6IEZhaWxlZCB0byBzZW5kIGNvbXBsZXRpb24gbm90aWZpY2F0aW9uIGZvciB0ZXJtaW5hbCAke3Rlcm1JZH1gLCBlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBCYWNrZ3JvdW5kIHRlcm1pbmFscyBhcmUgbm90IHJldXNlZCwgc28gZGlzcG9zZSB0aGVtIG9uY2UgdGhlaXJcblx0XHRcdC8vIGNvbW1hbmQgY29tcGxldGVzIHRvIHByZXZlbnQgdGVybWluYWwgYWNjdW11bGF0aW9uIGFjcm9zcyB0dXJucy5cblx0XHRcdC8vIE9ubHkgZGlzcG9zZSBpZiB0aGUgdXNlciBoYXNuJ3QgcmV2ZWFsZWQgdGhlIHRlcm1pbmFsIFx1MjAxNCBvbmNlIHJldmVhbGVkXG5cdFx0XHQvLyBpdCBqb2lucyBgZm9yZWdyb3VuZEluc3RhbmNlc2AgYW5kIHRoZXkgbWF5IHdhbnQgdG8gaW5zcGVjdCBpdHNcblx0XHRcdC8vIG91dHB1dCBvciBpbnRlcmFjdCB3aXRoIGl0LlxuXHRcdFx0Ly8gQ2FwdHVyZSB0aGUgb3V0cHV0IHNuYXBzaG90IGZpcnN0IHNvIHRoZSBwcm9ncmVzcyBwYXJ0IGNhbiBzdGlsbFxuXHRcdFx0Ly8gZGlzcGxheSBvdXRwdXQgYWZ0ZXIgdGhlIHRlcm1pbmFsIGluc3RhbmNlIGlzIGdvbmUuXG5cdFx0XHQvLyBSZS1jaGVjayBmb3JlZ3JvdW5kSW5zdGFuY2VzIGluc2lkZSB0aGUgY2FsbGJhY2sgYmVjYXVzZSB0aGUgdXNlclxuXHRcdFx0Ly8gbWF5IGNsaWNrIHRoZSBcIlNob3dcIiBsaW5rIHdoaWxlIGNhcHR1cmUgaXMgaW4gcHJvZ3Jlc3MuXG5cdFx0XHR0aGlzLl9jb21tYW5kQXJ0aWZhY3RDb2xsZWN0b3IuY2FwdHVyZSh0b29sU3BlY2lmaWNEYXRhLCB0ZXJtaW5hbEluc3RhbmNlLCBjb21tYW5kLmlkKS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5mb3JlZ3JvdW5kSW5zdGFuY2VzLmluY2x1ZGVzKHRlcm1pbmFsSW5zdGFuY2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IEJhY2tncm91bmQgdGVybWluYWwgJHt0ZXJtSWR9IHdhcyByZXZlYWxlZCBieSB1c2VyLCBza2lwcGluZyBkaXNwb3NhbGApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBSdW5JblRlcm1pbmFsVG9vbDogRGlzcG9zaW5nIGZpbmlzaGVkIGJhY2tncm91bmQgdGVybWluYWwgJHt0ZXJtSWR9YCk7XG5cdFx0XHRcdC8vIE1hcmsgYXMga2lsbGVkIHNvIHRoZSBvbkRpc3Bvc2VkIGhhbmRsZXIgYmVsb3cgZG9lcyBub3Rcblx0XHRcdFx0Ly8gc2VuZCBhIHJlZHVuZGFudCBcInRlcm1pbmFsIGV4aXRlZFwiIHN0ZWVyaW5nIG1lc3NhZ2UuXG5cdFx0XHRcdFJ1bkluVGVybWluYWxUb29sLl9raWxsZWRCeVRvb2wuYWRkKHRlcm1JZCk7XG5cdFx0XHRcdGV4ZWN1dGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2RlbGV0ZUFjdGl2ZUV4ZWN1dGlvbih0ZXJtSWQpO1xuXHRcdFx0XHR0ZXJtaW5hbEluc3RhbmNlLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsZWFuIHVwIGFsbCBiYWNrZ3JvdW5kIHJlc291cmNlcyB3aGVuIHRoZSB0ZXJtaW5hbCBpcyBkaXNwb3NlZFxuXHRcdC8vIChlLmcuIHVzZXIgY2xvc2VzIHRoZSB0ZXJtaW5hbCkuIFNlbmQgYSBjb21wbGV0aW9uIG5vdGlmaWNhdGlvbiBzb1xuXHRcdC8vIHRoZSBhZ2VudCBpc24ndCBsZWZ0IHdhaXRpbmcgZm9yIGFuIGBvbkNvbW1hbmRGaW5pc2hlZGAgZXZlbnQgdGhhdFxuXHRcdC8vIHdpbGwgbmV2ZXIgZmlyZSBcdTIwMTQgdGhlIHB0eSBleGl0ZWQgYmVmb3JlIHNoZWxsIGludGVncmF0aW9uIGNvdWxkXG5cdFx0Ly8gZW1pdCB0aGUgZW5kIG1hcmtlci4gT3V0cHV0IGNhcHR1cmVkIGhlcmUgaXMgd2hhdGV2ZXIgd2FzIGJ1ZmZlcmVkXG5cdFx0Ly8gdXAgdW50aWwgZGlzcG9zYWwuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgZXhlY3V0aW9uIHJlZmVyZW5jZSBub3cgXHUyMDE0IGJ5IHRoZSB0aW1lIG9uRGlzcG9zZWQgZmlyZXMsXG5cdFx0Ly8gb25EaWREaXNwb3NlSW5zdGFuY2UgbGlzdGVuZXJzIG1heSBoYXZlIGFscmVhZHkgcmVtb3ZlZCBpdCBmcm9tXG5cdFx0Ly8gX2FjdGl2ZUV4ZWN1dGlvbnMuXG5cdFx0Y29uc3QgZXhlY3V0aW9uRm9yRGlzcG9zYWwgPSBSdW5JblRlcm1pbmFsVG9vbC5fYWN0aXZlRXhlY3V0aW9ucy5nZXQodGVybUlkKTtcblx0XHRzdG9yZS5hZGQodGVybWluYWxJbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdC8vIElmIGtpbGxfdGVybWluYWwgaXMgZGlzcG9zaW5nIHRoaXMgdGVybWluYWwsIHRoZSBhZ2VudCB3aWxsXG5cdFx0XHQvLyByZWNlaXZlIHRoZSBvdXRwdXQgdGhyb3VnaCB0aGUgbm9ybWFsIHRvb2wtcmVzdWx0IGZsb3cgXHUyMDE0XG5cdFx0XHQvLyBza2lwIHRoZSByZWR1bmRhbnQgc3RlZXJpbmcgbWVzc2FnZS5cblx0XHRcdGlmIChSdW5JblRlcm1pbmFsVG9vbC5fa2lsbGVkQnlUb29sLmhhcyh0ZXJtSWQpKSB7XG5cdFx0XHRcdGRpc3Bvc2VOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRHVyaW5nIFZTIENvZGUgc2h1dGRvd24sIHRlcm1pbmFscyBhcmUgZGlzcG9zZWQgYXMgcGFydCBvZlxuXHRcdFx0Ly8gbm9ybWFsIGNsZWFudXAuIFN1cHByZXNzIG5vdGlmaWNhdGlvbnMgc28gdGhleSBkb24ndCBwZXJzaXN0XG5cdFx0XHQvLyBhcyB1bmRlbGl2ZXJhYmxlIHN0ZWVyaW5nIG1lc3NhZ2VzIGFmdGVyIHJlc3RhcnQgKCMzMTQ3OTEpLlxuXHRcdFx0aWYgKHRoaXMuX2lzU2h1dHRpbmdEb3duKSB7XG5cdFx0XHRcdGRpc3Bvc2VOb3RpZmljYXRpb24oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU2tpcCBzdGVlcmluZyBtZXNzYWdlIHdoZW4gdXNlciBtYW51YWxseSBjbG9zZWQgdGhlIHRlcm1pbmFsICgjMzE3MDU5KS5cblx0XHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlLmV4aXRSZWFzb24gPT09IFRlcm1pbmFsRXhpdFJlYXNvbi5Vc2VyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFJ1bkluVGVybWluYWxUb29sOiBCYWNrZ3JvdW5kIHRlcm1pbmFsICR7dGVybUlkfSBjbG9zZWQgYnkgdXNlciwgc3VwcHJlc3Npbmcgc3RlZXJpbmcgbWVzc2FnZWApO1xuXHRcdFx0XHRkaXNwb3NlTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChoYW5kbGVTZXNzaW9uQ2FuY2VsbGVkKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VycmVudE91dHB1dCA9IGV4ZWN1dGlvbkZvckRpc3Bvc2FsPy5nZXRPdXRwdXQoKSA/PyAnJztcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gdGVybWluYWxJbnN0YW5jZS5leGl0Q29kZTtcblx0XHRcdC8vIEF2b2lkIHJlcG9ydGluZyBhIHN1Y2Nlc3NmdWwgZXhpdCBjb2RlIGFzIGRpYWdub3N0aWMgaW5mb3JtYXRpb24gaW4gY2hhdC5cblx0XHRcdGNvbnN0IGV4aXRDb2RlVGV4dCA9IGV4aXRDb2RlICE9PSB1bmRlZmluZWQgJiYgZXhpdENvZGUgIT09IDAgPyBgIHdpdGggZXhpdCBjb2RlICR7ZXhpdENvZGV9YCA6ICcnO1xuXHRcdFx0ZGlzcG9zZU5vdGlmaWNhdGlvbigpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBbVGVybWluYWwgJHt0ZXJtSWR9IG5vdGlmaWNhdGlvbjogdGVybWluYWwgZXhpdGVkJHtleGl0Q29kZVRleHR9LiBUaGUgdGVybWluYWwgcHJvY2VzcyBlbmRlZCBiZWZvcmUgdGhlIGNvbW1hbmQgY291bGQgY29tcGxldGUgbm9ybWFsbHk7IGZ1cnRoZXIgY29tbWFuZHMgY2Fubm90IGJlIHNlbnQgdG8gdGhpcyB0ZXJtaW5hbCBJRC5dXFxuVGVybWluYWwgb3V0cHV0OlxcbiR7Y3VycmVudE91dHB1dH1gO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IEJhY2tncm91bmQgdGVybWluYWwgJHt0ZXJtSWR9IGRpc3Bvc2VkJHtleGl0Q29kZVRleHR9LCBub3RpZnlpbmcgY2hhdCBzZXNzaW9uYCk7XG5cdFx0XHR0aGlzLl9jaGF0U2VydmljZS5zZW5kUmVxdWVzdChjaGF0U2Vzc2lvblJlc291cmNlLCBtZXNzYWdlLCB7XG5cdFx0XHRcdC4uLnNlbmRPcHRpb25zLFxuXHRcdFx0XHRxdWV1ZTogQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0XHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbDogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvY2Vzc0V4aXRlZCcsIFwiezB9IHRlcm1pbmFsIGV4aXRlZFwiLCBjb21tYW5kRGlzcGxheSksXG5cdFx0XHRcdHRlcm1pbmFsRXhlY3V0aW9uSWQ6IHRlcm1JZCxcblx0XHRcdH0pLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFJ1bkluVGVybWluYWxUb29sOiBGYWlsZWQgdG8gc2VuZCB0ZXJtaW5hbC1leGl0ZWQgbm90aWZpY2F0aW9uIGZvciB0ZXJtaW5hbCAke3Rlcm1JZH1gLCBlKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gYSBjaGVja3BvaW50IGlzIHJlc3RvcmVkLCByZXF1ZXN0cyBhcmUgcmVtb3ZlZCBmcm9tIHRoZSBtb2RlbC5cblx0XHQvLyBDYW5jZWwgdGhlIGJhY2tncm91bmQgbm90aWZpY2F0aW9uIGFuZCBkaXNwb3NlIHRoZSB0ZXJtaW5hbCBzbyB0aGF0XG5cdFx0Ly8gYmFja2dyb3VuZCBwcm9jZXNzZXMgZG9uJ3Qgb3V0bGl2ZSB0aGUgcm9sbGVkLWJhY2sgc2Vzc2lvbiBzdGF0ZS5cblx0XHRzdG9yZS5hZGQoc2Vzc2lvblJlZi5vYmplY3Qub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSAncmVtb3ZlUmVxdWVzdCcpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IFJlcXVlc3QgcmVtb3ZlZCBmcm9tIHNlc3Npb24sIGNsZWFuaW5nIHVwIGJhY2tncm91bmQgdGVybWluYWwgJHt0ZXJtSWR9YCk7XG5cdFx0XHRcdFJ1bkluVGVybWluYWxUb29sLl9hY3RpdmVFeGVjdXRpb25zLmdldCh0ZXJtSWQpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2RlbGV0ZUFjdGl2ZUV4ZWN1dGlvbih0ZXJtSWQpO1xuXHRcdFx0XHRkaXNwb3NlTm90aWZpY2F0aW9uKCk7XG5cdFx0XHRcdHRlcm1pbmFsSW5zdGFuY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2JhY2tncm91bmROb3RpZmljYXRpb25zLnNldChub3RpZmljYXRpb25LZXksIHN0b3JlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIGFuZCBkaXNtaXNzIGFueSBwZW5kaW5nIChub3QgeWV0IGFuc3dlcmVkKSBxdWVzdGlvbiBjYXJvdXNlbHMgdGhhdFxuXHQgKiBhcmUgYXNzb2NpYXRlZCB3aXRoIHRoZSBnaXZlbiB0ZXJtaW5hbC4gVGhpcyBpcyBjYWxsZWQgd2hlbiB0aGUgdXNlclxuXHQgKiB0eXBlcyBkaXJlY3RseSBpbnRvIHRoZSB0ZXJtaW5hbCwgYnlwYXNzaW5nIHRoZSBjYXJvdXNlbCBVSS5cblx0ICovXG5cdHByaXZhdGUgX2Rpc21pc3NQZW5kaW5nQ2Fyb3VzZWxzRm9yVGVybWluYWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLCB0ZXJtSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2FsayBpbiByZXZlcnNlIFx1MjAxNCB0aGVyZSBzaG91bGQgYmUgYXQgbW9zdCBvbmUgcGVuZGluZyBjYXJvdXNlbCBwZXIgdGVybWluYWwuXG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGZvciAobGV0IGkgPSByZXF1ZXN0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSByZXF1ZXN0c1tpXS5yZXNwb25zZTtcblx0XHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJ0cyA9IHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlO1xuXHRcdFx0Zm9yIChsZXQgaiA9IHBhcnRzLmxlbmd0aCAtIDE7IGogPj0gMDsgai0tKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSBwYXJ0c1tqXTtcblx0XHRcdFx0aWYgKHBhcnQgaW5zdGFuY2VvZiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgJiYgcGFydC50ZXJtaW5hbElkID09PSB0ZXJtSWQgJiYgIXBhcnQuaXNVc2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgUnVuSW5UZXJtaW5hbFRvb2w6IERpc21pc3NpbmcgcGVuZGluZyBjYXJvdXNlbCBmb3IgdGVybWluYWwgJHt0ZXJtSWR9IGJlY2F1c2UgdXNlciB0eXBlZCBkaXJlY3RseSBpbiB0ZXJtaW5hbGApO1xuXHRcdFx0XHRcdHBhcnQuZGF0YSA9IHt9O1xuXHRcdFx0XHRcdHBhcnQuaXNVc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRwYXJ0LmRpc21pc3NlZEJ5VGVybWluYWxJbnB1dCA9IHRydWU7XG5cdFx0XHRcdFx0cGFydC5jb21wbGV0aW9uLmNvbXBsZXRlKHsgYW5zd2VyczogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHQvLyAjZW5kcmVnaW9uXG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBhY3RpdmUgdGVybWluYWwgY29tbWFuZCBleGVjdXRpb24gdGhhdCBjYW4gcnVuIGluIGVpdGhlciBmb3JlZ3JvdW5kIG9yIGJhY2tncm91bmRcbiAqIG1vZGUuIFRoaXMgdW5pZmllZCBjbGFzcyByZXBsYWNlcyB0aGUgcHJldmlvdXMgc3BsaXQgYmV0d2VlbiBmb3JlZ3JvdW5kIHN0cmF0ZWd5IGV4ZWN1dGlvbiBhbmRcbiAqIEJhY2tncm91bmRUZXJtaW5hbEV4ZWN1dGlvbiwgYWxsb3dpbmcgc2VhbWxlc3Mgc3dpdGNoaW5nIGJldHdlZW4gbW9kZXMuXG4gKi9cbmNsYXNzIEFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBY3RpdmVUZXJtaW5hbEV4ZWN1dGlvbiB7XG5cdHByaXZhdGUgX3N0YXJ0TWFya2VyOiBJWHRlcm1NYXJrZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzQmFja2dyb3VuZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGlvbkRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8SVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0PjtcblxuXHQvKipcblx0ICogVGhlIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBleGVjdXRlIHN0cmF0ZWd5IGNvbXBsZXRlcy4gQ2FuIGJlIGF3YWl0ZWQgdG8gZ2V0IHRoZVxuXHQgKiBmdWxsIHJlc3VsdCB3aXRoIGV4aXQgY29kZS5cblx0ICovXG5cdGdldCBjb21wbGV0aW9uUHJvbWlzZSgpOiBQcm9taXNlPElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0aW9uRGVmZXJyZWQucDtcblx0fVxuXG5cdGdldCBpc0JhY2tncm91bmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzQmFja2dyb3VuZDtcblx0fVxuXG5cdGdldCBzdGFydE1hcmtlcigpOiBJWHRlcm1NYXJrZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydE1hcmtlcjtcblx0fVxuXG5cdHJlYWRvbmx5IHN0cmF0ZWd5OiBJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3k7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xUZXJtaW5hbDogSVRvb2xUZXJtaW5hbDtcblxuXHRnZXQgaW5zdGFuY2UoKTogSVRlcm1pbmFsSW5zdGFuY2Uge1xuXHRcdHJldHVybiB0aGlzLl90b29sVGVybWluYWwuaW5zdGFuY2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSB0ZXJtSWQ6IHN0cmluZyxcblx0XHR0b29sVGVybWluYWw6IElUb29sVGVybWluYWwsXG5cdFx0Y29tbWFuZERldGVjdGlvbjogSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LFxuXHRcdGlzQmFja2dyb3VuZDogYm9vbGVhbixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdG9vbFRlcm1pbmFsID0gdG9vbFRlcm1pbmFsO1xuXHRcdHRoaXMuX2lzQmFja2dyb3VuZCA9IGlzQmFja2dyb3VuZDtcblx0XHR0aGlzLl9jb21wbGV0aW9uRGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPElUZXJtaW5hbEV4ZWN1dGVTdHJhdGVneVJlc3VsdD4oKTtcblxuXHRcdC8vIENyZWF0ZSBhbmQgcmVnaXN0ZXIgdGhlIHN0cmF0ZWd5IGZvciBkaXNwb3NhbCB0byBjbGVhbiB1cCBpdHMgaW50ZXJuYWwgcmVzb3VyY2VzXG5cdFx0dGhpcy5zdHJhdGVneSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NyZWF0ZVN0cmF0ZWd5KGNvbW1hbmREZXRlY3Rpb24pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RyYXRlZ3kub25EaWRDcmVhdGVTdGFydE1hcmtlcihtYXJrZXIgPT4ge1xuXHRcdFx0aWYgKG1hcmtlcikge1xuXHRcdFx0XHQvLyBEb24ndCByZWdpc3RlciBtYXJrZXIgLSBzdHJhdGVneSBhbHJlYWR5IG1hbmFnZXMgaXRzIGxpZmVjeWNsZVxuXHRcdFx0XHR0aGlzLl9zdGFydE1hcmtlciA9IG1hcmtlcjtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVTdHJhdGVneShjb21tYW5kRGV0ZWN0aW9uOiBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkpOiBJVGVybWluYWxFeGVjdXRlU3RyYXRlZ3kge1xuXHRcdGNvbnN0IGlzU3luY01vZGUgPSAhdGhpcy5faXNCYWNrZ3JvdW5kO1xuXHRcdHN3aXRjaCAodGhpcy5fdG9vbFRlcm1pbmFsLnNoZWxsSW50ZWdyYXRpb25RdWFsaXR5KSB7XG5cdFx0XHRjYXNlIFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5Lk5vbmU6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb25lRXhlY3V0ZVN0cmF0ZWd5LCB0aGlzLl90b29sVGVybWluYWwuaW5zdGFuY2UsICgpID0+IHRoaXMuX3Rvb2xUZXJtaW5hbC5yZWNlaXZlZFVzZXJJbnB1dCA/PyBmYWxzZSk7XG5cdFx0XHRjYXNlIFNoZWxsSW50ZWdyYXRpb25RdWFsaXR5LkJhc2ljOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmFzaWNFeGVjdXRlU3RyYXRlZ3ksIHRoaXMuX3Rvb2xUZXJtaW5hbC5pbnN0YW5jZSwgKCkgPT4gdGhpcy5fdG9vbFRlcm1pbmFsLnJlY2VpdmVkVXNlcklucHV0ID8/IGZhbHNlLCBjb21tYW5kRGV0ZWN0aW9uKTtcblx0XHRcdGNhc2UgU2hlbGxJbnRlZ3JhdGlvblF1YWxpdHkuUmljaDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJpY2hFeGVjdXRlU3RyYXRlZ3ksIHRoaXMuX3Rvb2xUZXJtaW5hbC5pbnN0YW5jZSwgY29tbWFuZERldGVjdGlvbiwgaXNTeW5jTW9kZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0cyB0aGUgY29tbWFuZCBleGVjdXRpb24gdXNpbmcgdGhlIGV4ZWN1dGUgc3RyYXRlZ3kuXG5cdCAqIEBwYXJhbSBjb21tYW5kTGluZSBUaGUgY29tbWFuZCB0byBleGVjdXRlXG5cdCAqIEBwYXJhbSB0b2tlbiBDYW5jZWxsYXRpb24gdG9rZW5cblx0ICogQHBhcmFtIGNvbW1hbmRJZCBPcHRpb25hbCBjb21tYW5kIElEIGZvciBsaW5raW5nXG5cdCAqIEByZXR1cm5zIFRoZSBleGVjdXRpb24gcmVzdWx0XG5cdCAqL1xuXHRhc3luYyBzdGFydChjb21tYW5kTGluZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbW1hbmRJZD86IHN0cmluZywgY29tbWFuZExpbmVGb3JNZXRhZGF0YT86IHN0cmluZyk6IFByb21pc2U8SVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc3RyYXRlZ3kuZXhlY3V0ZShjb21tYW5kTGluZSwgdG9rZW4sIGNvbW1hbmRJZCwgY29tbWFuZExpbmVGb3JNZXRhZGF0YSk7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uRGVmZXJyZWQuY29tcGxldGUocmVzdWx0KTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fY29tcGxldGlvbkRlZmVycmVkLmVycm9yKGUpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3dpdGNoZXMgdGhpcyBleGVjdXRpb24gdG8gZm9yZWdyb3VuZCBtb2RlLCBtZWFuaW5nIGNhbGxlcnMgd2lsbCBhd2FpdCBpdHMgY29tcGxldGlvbi5cblx0ICovXG5cdHNldEZvcmVncm91bmQoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNCYWNrZ3JvdW5kID0gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogU3dpdGNoZXMgdGhpcyBleGVjdXRpb24gdG8gYmFja2dyb3VuZCBtb2RlLlxuXHQgKi9cblx0c2V0QmFja2dyb3VuZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0JhY2tncm91bmQgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGN1cnJlbnQgb3V0cHV0IGZyb20gdGhlIHRlcm1pbmFsLlxuXHQgKi9cblx0Z2V0T3V0cHV0KG1hcmtlcj86IElYdGVybU1hcmtlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGdldE91dHB1dCh0aGlzLmluc3RhbmNlLCBtYXJrZXIgPz8gdGhpcy5fc3RhcnRNYXJrZXIpO1xuXHR9XG59XG5cbmNsYXNzIFJlc3RvcmVkVGVybWluYWxFeGVjdXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFjdGl2ZVRlcm1pbmFsRXhlY3V0aW9uIHtcblx0cmVhZG9ubHkgY29tcGxldGlvblByb21pc2U6IFByb21pc2U8SVRlcm1pbmFsRXhlY3V0ZVN0cmF0ZWd5UmVzdWx0PiA9IFByb21pc2UucmVzb2x2ZSh7IG91dHB1dDogdW5kZWZpbmVkLCBlcnJvcjogJ3Jlc3RvcmVkVGVybWluYWxFeGVjdXRpb25Ob3RBd2FpdGFibGUnIH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldE91dHB1dChtYXJrZXI/OiBJWHRlcm1NYXJrZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiBnZXRPdXRwdXQodGhpcy5pbnN0YW5jZSwgbWFya2VyKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxQcm9maWxlRmV0Y2hlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3Bvc2l4U2hlbGxGYWxsYmFja3MgPSBbJy9iaW4vYmFzaCcsICcvdXNyL2Jpbi9iYXNoJywgJy9iaW4vc2gnXTtcblxuXHRyZWFkb25seSBvc0JhY2tlbmQ6IFByb21pc2U8T3BlcmF0aW5nU3lzdGVtPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5vc0JhY2tlbmQgPSB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKHJlbW90ZUVudiA9PiByZW1vdGVFbnY/Lm9zID8/IE9TKTtcblx0fVxuXG5cdGFzeW5jIGdldENvcGlsb3RQcm9maWxlKCk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT4ge1xuXHRcdGNvbnN0IG9zID0gYXdhaXQgdGhpcy5vc0JhY2tlbmQ7XG5cblx0XHQvLyBDaGVjayBmb3IgY2hhdCBhZ2VudCB0ZXJtaW5hbCBwcm9maWxlIGZpcnN0XG5cdFx0Y29uc3QgY3VzdG9tQ2hhdEFnZW50UHJvZmlsZSA9IHRoaXMuX2dldENoYXRUZXJtaW5hbFByb2ZpbGUob3MpO1xuXHRcdGlmIChjdXN0b21DaGF0QWdlbnRQcm9maWxlKSB7XG5cdFx0XHRyZXR1cm4gY3VzdG9tQ2hhdEFnZW50UHJvZmlsZTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHNldHRpbmcgaXMgbnVsbCwgdXNlIHRoZSBwcmV2aW91cyBiZWhhdmlvclxuXHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlID0gYXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlKHtcblx0XHRcdG9zLFxuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHlcblx0XHR9KTtcblxuXHRcdC8vIEZvcmNlIHB3c2ggb3ZlciBjbWQgYXMgY21kIGRvZXNuJ3QgaGF2ZSBzaGVsbCBpbnRlZ3JhdGlvblxuXHRcdGlmIChiYXNlbmFtZShkZWZhdWx0UHJvZmlsZS5wYXRoKSA9PT0gJ2NtZC5leGUnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5kZWZhdWx0UHJvZmlsZSxcblx0XHRcdFx0cGF0aDogJ0M6XFxcXFdJTkRPV1NcXFxcU3lzdGVtMzJcXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZScsXG5cdFx0XHRcdHByb2ZpbGVOYW1lOiAnUG93ZXJTaGVsbCdcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gRm9yY2UgYmFzaCBvdmVyIHNoIGFzIHNoIGRvZXNuJ3QgaGF2ZSBzaGVsbCBpbnRlZ3JhdGlvblxuXHRcdGlmIChkZWZhdWx0UHJvZmlsZS5wYXRoID09PSAnL2Jpbi9zaCcpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmRlZmF1bHRQcm9maWxlLFxuXHRcdFx0XHRwYXRoOiAnL2Jpbi9iYXNoJyxcblx0XHRcdFx0cHJvZmlsZU5hbWU6ICdiYXNoJyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgdGhlIHJlc29sdmVkIHNoZWxsIGV4aXN0cyBvbiBkaXNrOyBmYWxsIGJhY2sgdG8gYSBrbm93blxuXHRcdC8vIFBPU0lYIHNoZWxsIHdoZW4gaXQgZG9lc24ndCAoZS5nLiBwcm9maWxlIHJlc29sdmVzIHRvIHpzaCBvbiBhXG5cdFx0Ly8gTGludXggc3lzdGVtIHdoZXJlIHpzaCBpcyBub3QgaW5zdGFsbGVkKS5cblx0XHRpZiAob3MgIT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBzaGVsbEV4aXN0cyA9IGF3YWl0IHRoaXMuX3NoZWxsRXhpc3RzKGRlZmF1bHRQcm9maWxlLnBhdGgpO1xuXHRcdFx0aWYgKCFzaGVsbEV4aXN0cykge1xuXHRcdFx0XHRjb25zdCBmYWxsYmFja1BhdGggPSBhd2FpdCB0aGlzLl9maW5kRmFsbGJhY2tTaGVsbCgpO1xuXHRcdFx0XHRpZiAoZmFsbGJhY2tQYXRoKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBUZXJtaW5hbFByb2ZpbGVGZXRjaGVyOiByZXNvbHZlZCBzaGVsbCBcIiR7ZGVmYXVsdFByb2ZpbGUucGF0aH1cIiBkb2VzIG5vdCBleGlzdCwgZmFsbGluZyBiYWNrIHRvIFwiJHtmYWxsYmFja1BhdGh9XCJgKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4uZGVmYXVsdFByb2ZpbGUsXG5cdFx0XHRcdFx0XHRwYXRoOiBmYWxsYmFja1BhdGgsXG5cdFx0XHRcdFx0XHRwcm9maWxlTmFtZTogYmFzZW5hbWUoZmFsbGJhY2tQYXRoKSxcblx0XHRcdFx0XHRcdGljb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2V0dGluZyBpY29uOiB1bmRlZmluZWQgYWxsb3dzIHRoZSBzeXN0ZW0gdG8gdXNlIHRoZSBkZWZhdWx0IEFJIHRlcm1pbmFsIGljb24gKG5vdCBvdmVycmlkZGVuIG9yIHJlbW92ZWQpXG5cdFx0cmV0dXJuIHsgLi4uZGVmYXVsdFByb2ZpbGUsIGljb246IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hlbGxFeGlzdHMoc2hlbGxQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKT8ucmVtb3RlQXV0aG9yaXR5O1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSByZW1vdGVBdXRob3JpdHlcblx0XHRcdFx0PyBVUkkuZmlsZShzaGVsbFBhdGgpLndpdGgoeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHkgfSlcblx0XHRcdFx0OiBVUkkuZmlsZShzaGVsbFBhdGgpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhyZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluZEZhbGxiYWNrU2hlbGwoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBUZXJtaW5hbFByb2ZpbGVGZXRjaGVyLl9wb3NpeFNoZWxsRmFsbGJhY2tzKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fc2hlbGxFeGlzdHMoY2FuZGlkYXRlKSkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q29waWxvdFNoZWxsKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLmdldENvcGlsb3RQcm9maWxlKCkpLnBhdGg7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGF0VGVybWluYWxQcm9maWxlKG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBJVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcHJvZmlsZVNldHRpbmc6IHN0cmluZztcblx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzOlxuXHRcdFx0XHRwcm9maWxlU2V0dGluZyA9IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuVGVybWluYWxQcm9maWxlV2luZG93cztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdHByb2ZpbGVTZXR0aW5nID0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5UZXJtaW5hbFByb2ZpbGVNYWNPcztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHByb2ZpbGVTZXR0aW5nID0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5UZXJtaW5hbFByb2ZpbGVMaW51eDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHByb2ZpbGVTZXR0aW5nKTtcblx0XHRpZiAodGhpcy5faXNWYWxpZENoYXRBZ2VudFRlcm1pbmFsUHJvZmlsZShwcm9maWxlKSkge1xuXHRcdFx0cmV0dXJuIHByb2ZpbGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzVmFsaWRDaGF0QWdlbnRUZXJtaW5hbFByb2ZpbGUocHJvZmlsZTogdW5rbm93bik6IHByb2ZpbGUgaXMgSVRlcm1pbmFsUHJvZmlsZSB7XG5cdFx0aWYgKHByb2ZpbGUgPT09IG51bGwgfHwgcHJvZmlsZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBwcm9maWxlICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoJ3BhdGgnIGluIHByb2ZpbGUgJiYgaXNTdHJpbmcoKHByb2ZpbGUgYXMgeyBwYXRoOiB1bmtub3duIH0pLnBhdGgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxpQkFBaUIsa0JBQWtCLGVBQXVDO0FBQ25GLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUNBQWlDLDRCQUE0QixzQkFBNEM7QUFDbEgsU0FBUyxZQUFZLGVBQWUsaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDekcsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxVQUFVLE9BQU8sYUFBYTtBQUN2QyxTQUFTLGlCQUFpQixVQUFVO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUFvRDtBQUM3RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQywwQkFBMEI7QUFD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QUFBQSxFQUM3QztBQUFBLEVBRUEsTUFBYyxhQUFhLFdBQXFDO0FBQy9ELFFBQUk7QUFDSCxZQUFNLGtCQUFrQixLQUFLLG9CQUFvQixjQUFjLEdBQUc7QUFDbEUsWUFBTSxXQUFXLGtCQUNkLElBQUksS0FBSyxTQUFTLEVBQUUsS0FBSyxFQUFFLFFBQVEsaUJBQWlCLFdBQVcsZ0JBQWdCLENBQUMsSUFDaEYsSUFBSSxLQUFLLFNBQVM7QUFDckIsYUFBTyxNQUFNLEtBQUssYUFBYSxPQUFPLFFBQVE7QUFBQSxJQUMvQyxRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLHFCQUFrRDtBQUMvRCxlQUFXLGFBQWEsdUJBQXVCLHNCQUFzQjtBQUNwRSxVQUFJLE1BQU0sS0FBSyxhQUFhLFNBQVMsR0FBRztBQUN2QyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxrQkFBbUM7QUFDeEMsWUFBUSxNQUFNLEtBQUssa0JBQWtCLEdBQUc7QUFBQSxFQUN6QztBQUFBLEVBRVEsd0JBQXdCLElBQW1EO0FBQ2xGLFFBQUk7QUFDSixZQUFRLElBQUk7QUFBQSxNQUNYLEtBQUssZ0JBQWdCO0FBQ3BCLHlCQUFpQixnQ0FBZ0M7QUFDakQ7QUFBQSxNQUNELEtBQUssZ0JBQWdCO0FBQ3BCLHlCQUFpQixnQ0FBZ0M7QUFDakQ7QUFBQSxNQUNELEtBQUssZ0JBQWdCO0FBQUEsTUFDckI7QUFDQyx5QkFBaUIsZ0NBQWdDO0FBQ2pEO0FBQUEsSUFDRjtBQUVBLFVBQU0sVUFBVSxLQUFLLHNCQUFzQixTQUFTLGNBQWM7QUFDbEUsUUFBSSxLQUFLLGlDQUFpQyxPQUFPLEdBQUc7QUFDbkQsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUNBQWlDLFNBQStDO0FBQ3ZGLFFBQUksWUFBWSxRQUFRLFlBQVksVUFBYSxPQUFPLFlBQVksVUFBVTtBQUM3RSxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksVUFBVSxXQUFXLFNBQVUsUUFBOEIsSUFBSSxHQUFHO0FBQ3ZFLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWpJYSx1QkFFWSx1QkFBdUIsQ0FBQyxhQUFhLGlCQUFpQixTQUFTO0FBRjNFLHlCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhVOyIsCiAgIm5hbWVzIjogWyJUZXJtaW5hbFRvb2xTdG9yYWdlS2V5c0ludGVybmFsIiwgImN3ZCIsICJjb21tYW5kVG9EaXNwbGF5IiwgInJlcXVlc3QiLCAiZXhpdENvZGUiLCAicmVzdWx0VGV4dCIsICJvdXRwdXRBbmFseXplck1lc3NhZ2UiLCAiZW5kQ3dkIl0KfQo=
