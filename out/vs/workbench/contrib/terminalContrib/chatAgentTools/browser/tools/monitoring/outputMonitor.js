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
import { timeout } from "../../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../../nls.js";
import { ITaskService } from "../../../../../tasks/common/taskService.js";
import { OutputMonitorState, PollingConsts } from "./types.js";
import { ITerminalLogService } from "../../../../../../../platform/terminal/common/terminal.js";
function getLastLine(output) {
  if (!output) {
    return "";
  }
  const trimmedOutput = output.replace(/[\r\n]+$/, "");
  if (!trimmedOutput) {
    return "";
  }
  const lastLineFeed = trimmedOutput.lastIndexOf("\n");
  const lastLine = lastLineFeed === -1 ? trimmedOutput : trimmedOutput.slice(lastLineFeed + 1);
  const lastCarriageReturn = lastLine.lastIndexOf("\r");
  return lastCarriageReturn === -1 ? lastLine : lastLine.slice(lastCarriageReturn + 1);
}
let OutputMonitor = class extends Disposable {
  constructor(_execution, _pollFn, invocationContext, token, command, _taskService, _logService) {
    super();
    this._execution = _execution;
    this._pollFn = _pollFn;
    this._taskService = _taskService;
    this._logService = _logService;
    this._state = OutputMonitorState.PollingForIdle;
    /**
     * Flag to track if user has inputted since idle was detected.
     * This is used to skip showing prompts if the user already provided input.
     */
    this._userInputtedSinceIdleDetected = false;
    this._userInputListener = this._register(new MutableDisposable());
    this._outputMonitorTelemetryCounters = {
      inputToolManualAcceptCount: 0,
      inputToolManualRejectCount: 0,
      inputToolManualChars: 0,
      inputToolAutoAcceptCount: 0,
      inputToolAutoChars: 0,
      inputToolManualShownCount: 0,
      inputToolFreeFormInputShownCount: 0,
      inputToolFreeFormInputCount: 0
    };
    this._onDidFinishCommand = this._register(new Emitter());
    this.onDidFinishCommand = this._onDidFinishCommand.event;
    this._onDidDetectInputNeeded = this._register(new Emitter());
    this.onDidDetectInputNeeded = this._onDidDetectInputNeeded.event;
    this._onDidDetectSensitiveInputNeeded = this._register(new Emitter());
    this.onDidDetectSensitiveInputNeeded = this._onDidDetectSensitiveInputNeeded.event;
    this._asyncMode = false;
    this._command = "";
    /**
     * Tracks whether onDidFinishCommand has fired so the event is delivered at
     * most once. The event must fire synchronously during dispose so consumers
     * awaiting `Event.toPromise(onDidFinishCommand)` are unblocked before the
     * underlying emitter is torn down by super.dispose().
     */
    this._didFinish = false;
    this._command = command;
    this._invocationContext = invocationContext;
    const cts = new CancellationTokenSource(token);
    this._currentMonitoringCts = cts;
    this._register(toDisposable(() => {
      this._currentMonitoringCts?.cancel();
      this._currentMonitoringCts?.dispose();
    }));
    timeout(0).then(() => {
      if (this._currentMonitoringCts !== cts) {
        return;
      }
      this._startMonitoring(command, invocationContext, cts.token);
    });
  }
  get state() {
    return this._state;
  }
  _formatLastLineForLog(output) {
    if (!output) {
      return "<empty>";
    }
    const lastLine = getLastLine(output).trimEnd();
    if (!lastLine) {
      return "<empty>";
    }
    if (this._isSensitivePrompt(lastLine)) {
      return "<redacted>";
    }
    return lastLine.length > 200 ? lastLine.slice(0, 200) + "\u2026" : lastLine;
  }
  get pollingResult() {
    return this._pollingResult;
  }
  get outputMonitorTelemetryCounters() {
    return this._outputMonitorTelemetryCounters;
  }
  _fireFinishedOnce() {
    if (this._didFinish) {
      return;
    }
    this._didFinish = true;
    this._onDidFinishCommand.fire();
  }
  dispose() {
    if (!this._didFinish) {
      this._pollingResult ??= {
        state: OutputMonitorState.Cancelled,
        output: this._execution.getOutput(),
        pollDurationMs: 0,
        resources: void 0
      };
    }
    this._fireFinishedOnce();
    super.dispose();
  }
  async _startMonitoring(command, invocationContext, token) {
    const pollStartTime = Date.now();
    let resources;
    let output;
    let extended = false;
    try {
      while (!token.isCancellationRequested) {
        switch (this._state) {
          case OutputMonitorState.PollingForIdle: {
            this._logService.trace(`OutputMonitor: Entering PollingForIdle (extended=${extended})`);
            this._state = await this._waitForIdle(this._execution, extended, token);
            this._logService.trace(`OutputMonitor: PollingForIdle completed -> state=${OutputMonitorState[this._state]}`);
            continue;
          }
          case OutputMonitorState.Timeout: {
            this._logService.trace(`OutputMonitor: Entering Timeout state (extended=${extended})`);
            const shouldContinuePolling = await this._handleTimeoutState(command, invocationContext, extended, token);
            if (shouldContinuePolling) {
              extended = true;
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else if (this._asyncMode) {
              this._logService.trace("OutputMonitor: Async mode - timeout reached, waiting for new terminal data");
              extended = false;
              await this._waitForNewData(token);
              if (token.isCancellationRequested) {
                break;
              }
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else {
              break;
            }
          }
          case OutputMonitorState.Cancelled:
            break;
          case OutputMonitorState.Idle: {
            this._logService.trace("OutputMonitor: Entering Idle handler");
            const idleResult = await this._handleIdleState(token);
            if (idleResult.shouldContinuePolling) {
              this._logService.trace("OutputMonitor: Idle handler -> continue polling");
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else if (this._asyncMode) {
              this._logService.trace("OutputMonitor: Async mode - waiting for new terminal data before next monitoring cycle");
              await this._waitForNewData(token);
              if (token.isCancellationRequested) {
                break;
              }
              this._state = OutputMonitorState.PollingForIdle;
              continue;
            } else {
              this._logService.trace(`OutputMonitor: Idle handler -> stop polling (hasResources=${!!idleResult.resources}, outputLen=${idleResult.output?.length ?? 0})`);
              resources = idleResult.resources;
              output = idleResult.output;
            }
            break;
          }
        }
        if (this._state === OutputMonitorState.Idle || this._state === OutputMonitorState.Cancelled || this._state === OutputMonitorState.Timeout) {
          break;
        }
      }
      if (token.isCancellationRequested) {
        this._state = OutputMonitorState.Cancelled;
      }
    } finally {
      this._logService.trace(`OutputMonitor: Monitoring finished (state=${OutputMonitorState[this._state]}, duration=${Date.now() - pollStartTime}ms)`);
      this._pollingResult = {
        state: this._state,
        output: output ?? this._execution.getOutput(),
        pollDurationMs: Date.now() - pollStartTime,
        resources
      };
      this._userInputListener.clear();
      this._fireFinishedOnce();
    }
  }
  /**
   * Continues monitoring in background mode with a new cancellation token.
   * In background mode, the monitor re-polls for idle and handles prompts
   * whenever new terminal data arrives, rather than stopping after the first
   * idle detection. Resource cost is bounded because the monitor only wakes
   * on new terminal data (via {@link _waitForNewData}) and each idle cycle
   * is capped by the standard polling timeouts.
   */
  continueMonitoringAsync(token) {
    this._asyncMode = true;
    const currentMonitoringCts = this._currentMonitoringCts;
    currentMonitoringCts?.cancel();
    currentMonitoringCts?.dispose();
    this._currentMonitoringCts = new CancellationTokenSource(token);
    this._state = OutputMonitorState.PollingForIdle;
    this._startMonitoring(this._command, this._invocationContext, this._currentMonitoringCts.token);
  }
  /**
   * Waits for new terminal data or cancellation. Used in background mode
   * to avoid polling and LLM calls while the terminal is quiet.
   */
  _waitForNewData(token) {
    return new Promise((resolve) => {
      if (token.isCancellationRequested) {
        resolve();
        return;
      }
      const cleanup = () => {
        dataListener.dispose();
        tokenListener.dispose();
        disposedListener.dispose();
      };
      const dataListener = this._execution.instance.onData(() => {
        cleanup();
        resolve();
      });
      const tokenListener = token.onCancellationRequested(() => {
        cleanup();
        resolve();
      });
      const disposedListener = this._execution.instance.onDisposed(() => {
        cleanup();
        resolve();
      });
    });
  }
  async _handleIdleState(token) {
    const output = this._execution.getOutput();
    const outputTail = output.slice(-1e3);
    const outputLastLine = getLastLine(outputTail);
    this._logService.trace(`OutputMonitor: Idle output summary: len=${output.length}, lastLine=${this._formatLastLineForLog(outputTail)}`);
    if (detectsNonInteractiveHelpPattern(outputLastLine)) {
      this._logService.trace("OutputMonitor: Idle -> non-interactive help pattern detected, stopping");
      return { shouldContinuePolling: false, output };
    }
    const isTask = this._execution.task !== void 0;
    if (isTask && detectsVSCodeTaskFinishMessage(outputTail)) {
      this._logService.trace("OutputMonitor: Idle -> VS Code task finish message detected, stopping");
      return { shouldContinuePolling: false, output };
    }
    if (!isTask && detectsGenericPressAnyKeyPattern(outputTail)) {
      this._logService.trace('OutputMonitor: Idle -> generic "press any key" detected, signaling agent');
      this._onDidDetectInputNeeded.fire();
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: false, output };
    }
    if (this._userInputtedSinceIdleDetected) {
      this._logService.trace("OutputMonitor: User input detected since idle; skipping prompt and continuing polling");
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: true };
    }
    let shouldFireInputNeeded = detectsInputRequiredPattern(outputLastLine);
    if (!shouldFireInputNeeded && detectsLikelyInputRequiredPattern(outputLastLine)) {
      const isActive = this._execution.isActive ? await this._execution.isActive() : void 0;
      if (isActive === true) {
        shouldFireInputNeeded = true;
      }
    }
    if (shouldFireInputNeeded && this._userInputtedSinceIdleDetected) {
      this._logService.trace("OutputMonitor: User input detected during isActive await; skipping prompt and continuing polling");
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: true };
    }
    if (this._asyncMode) {
      if (shouldFireInputNeeded) {
        if (this._isSensitivePrompt(outputLastLine)) {
          this._logService.trace("OutputMonitor: Async mode - sensitive input prompt detected, signaling sensitive UI");
          this._onDidDetectSensitiveInputNeeded.fire();
        } else {
          this._logService.trace("OutputMonitor: Async mode - input-required pattern detected, signaling agent");
          this._onDidDetectInputNeeded.fire();
        }
      }
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: false, output };
    }
    if (shouldFireInputNeeded) {
      if (this._isSensitivePrompt(outputLastLine)) {
        this._logService.trace("OutputMonitor: Sensitive input prompt detected, signaling sensitive UI");
        this._onDidDetectSensitiveInputNeeded.fire();
      } else {
        this._logService.trace("OutputMonitor: Input-required pattern detected, signaling agent");
        this._onDidDetectInputNeeded.fire();
      }
      this._cleanupIdleInputListener();
      return { shouldContinuePolling: false, output };
    }
    this._cleanupIdleInputListener();
    const custom = await this._pollFn?.(this._execution, token, this._taskService);
    this._logService.trace(`OutputMonitor: Custom poller result: ${custom ? "provided" : "none"}`);
    const resources = custom?.resources;
    return { resources, shouldContinuePolling: false, output: custom?.output ?? output };
  }
  async _handleTimeoutState(_command, _invocationContext, _extended, _token) {
    if (_extended) {
      this._logService.info("OutputMonitor: Extended polling timeout reached after 2 minutes, signaling potential input needed");
      this._onDidDetectInputNeeded.fire();
      this._state = OutputMonitorState.Cancelled;
      return false;
    }
    return true;
  }
  /**
   * Single bounded polling pass that returns when:
   *  - terminal becomes inactive/idle, or
   *  - timeout window elapses.
   */
  async _waitForIdle(execution, extendedPolling, token) {
    const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
    const maxInterval = PollingConsts.MaxPollingIntervalDuration;
    let currentInterval = PollingConsts.MinPollingDuration;
    let waited = 0;
    let consecutiveIdleEvents = 0;
    let hasReceivedData = false;
    const onDataDisposable = execution.instance.onData((_data) => {
      hasReceivedData = true;
    });
    try {
      while (!token.isCancellationRequested && waited < maxWaitMs) {
        const waitTime = Math.min(currentInterval, maxWaitMs - waited);
        try {
          await timeout(waitTime, token);
        } catch (err) {
          if (token.isCancellationRequested) {
            return OutputMonitorState.Cancelled;
          }
          throw err;
        }
        waited += waitTime;
        currentInterval = Math.min(currentInterval * 2, maxInterval);
        const currentOutput = execution.getOutput();
        const currentTail = currentOutput.slice(-1e3);
        const currentLastLine = getLastLine(currentTail);
        if (detectsNonInteractiveHelpPattern(currentLastLine)) {
          this._logService.trace(`OutputMonitor: waitForIdle -> non-interactive help detected (waited=${waited}ms)`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
        const promptResult = detectsHighConfidenceInputPattern(currentLastLine);
        if (promptResult) {
          this._logService.trace(`OutputMonitor: waitForIdle -> high-confidence input pattern detected (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
        if (hasReceivedData) {
          consecutiveIdleEvents = 0;
          hasReceivedData = false;
        } else {
          consecutiveIdleEvents++;
        }
        const recentlyIdle = consecutiveIdleEvents >= PollingConsts.MinIdleEvents;
        const isActive = execution.isActive ? await execution.isActive() : void 0;
        this._logService.trace(`OutputMonitor: waitForIdle check: waited=${waited}ms, recentlyIdle=${recentlyIdle}, isActive=${isActive}`);
        if (recentlyIdle && isActive !== true) {
          this._logService.trace(`OutputMonitor: waitForIdle -> recentlyIdle && !active (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
        if (recentlyIdle && isActive === true && detectsLikelyInputRequiredPattern(currentLastLine)) {
          this._logService.trace(`OutputMonitor: waitForIdle -> broad input pattern detected while active+idle (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
          this._state = OutputMonitorState.Idle;
          this._setupIdleInputListener();
          return this._state;
        }
      }
    } finally {
      onDataDisposable.dispose();
    }
    if (token.isCancellationRequested) {
      return OutputMonitorState.Cancelled;
    }
    return OutputMonitorState.Timeout;
  }
  /**
   * Sets up a listener for user input that triggers immediately when idle is detected.
   * This ensures we catch any input that happens between idle detection and prompt creation.
   */
  _setupIdleInputListener() {
    if (this._store.isDisposed) {
      return;
    }
    this._userInputtedSinceIdleDetected = false;
    this._logService.trace("OutputMonitor: Setting up idle input listener");
    this._userInputListener.value = this._execution.instance.onDidInputData(() => {
      this._userInputtedSinceIdleDetected = true;
      this._logService.trace("OutputMonitor: Detected user terminal input while idle");
    });
  }
  /**
   * Cleans up the idle input listener and resets the flag.
   */
  _cleanupIdleInputListener() {
    this._userInputtedSinceIdleDetected = false;
    this._userInputListener.clear();
  }
  _isSensitivePrompt(prompt) {
    if (isCanonicalSudoSPrompt(this._command, prompt)) {
      return false;
    }
    return detectsSensitiveInputPrompt(prompt);
  }
};
OutputMonitor = __decorateClass([
  __decorateParam(5, ITaskService),
  __decorateParam(6, ITerminalLogService)
], OutputMonitor);
function isCanonicalSudoSPrompt(command, prompt) {
  return /(?:^|\s)sudo\s+-S(?:\s|$)/.test(command) && /^\[sudo\]\s+password for .+:\s*$/i.test(prompt);
}
function detectsSensitiveInputPrompt(cursorLine) {
  return /(password|passphrase|token|api\s*key|secret|verification code|otp\b|one[\s-]?time (?:code|password)|2fa|mfa|pin\s*(?:code|number)?[: ]?\s*$|authentication code)/i.test(cursorLine);
}
function matchTerminalPromptOption(options, suggestedOption) {
  const normalize = (value) => value.replace(/['"`]/g, "").trim().replace(/[.,:;]+$/, "");
  const normalizedSuggestion = normalize(suggestedOption);
  if (!normalizedSuggestion) {
    return { option: void 0, index: -1 };
  }
  const candidates = [normalizedSuggestion];
  const firstWhitespaceToken = normalizedSuggestion.split(/\s+/)[0];
  if (firstWhitespaceToken && firstWhitespaceToken !== normalizedSuggestion) {
    candidates.push(firstWhitespaceToken);
  }
  const firstAlphaNum = normalizedSuggestion.match(/[A-Za-z0-9]+/);
  if (firstAlphaNum?.[0] && firstAlphaNum[0] !== normalizedSuggestion && firstAlphaNum[0] !== firstWhitespaceToken) {
    candidates.push(firstAlphaNum[0]);
  }
  for (const candidate of candidates) {
    const exactIndex = options.findIndex((opt) => normalize(opt) === candidate);
    if (exactIndex !== -1) {
      return { option: options[exactIndex], index: exactIndex };
    }
    const lowerCandidate = candidate.toLowerCase();
    const ciIndex = options.findIndex((opt) => normalize(opt).toLowerCase() === lowerCandidate);
    if (ciIndex !== -1) {
      return { option: options[ciIndex], index: ciIndex };
    }
  }
  return { option: void 0, index: -1 };
}
function detectsHighConfidenceInputPattern(cursorLine) {
  return [
    // PowerShell-style multi-option line (supports [?] Help and optional default suffix) ending
    // in whitespace.  Uses [^\[]* to match each label (everything up to the next bracket),
    // ensuring linear-time matching with no nested quantifiers that could cause ReDoS.
    /\s*(?:\[[^\]]\][^\[]*)+(?:\(default is\s+"[^"]+"\):)?\s+$/,
    // Bracketed/parenthesized yes/no pairs at end of line: (y/n), [Y/n], (yes/no), [no/yes]
    /(?:\(|\[)\s*(?:y(?:es)?\s*\/\s*n(?:o)?|n(?:o)?\s*\/\s*y(?:es)?)\s*(?:\]|\))\s+$/i,
    // Same as above but allows a preceding '?' or ':' and optional wrappers e.g.
    // "Continue? (y/n)" or "Overwrite: [yes/no]"
    /[?:]\s*(?:\(|\[)?\s*y(?:es)?\s*\/\s*n(?:o)?\s*(?:\]|\))?\s+$/i,
    // Confirmation prompts ending with (y) followed by trailing space, e.g. "Ok to proceed? (y) "
    // The trailing space indicates the cursor is positioned after the prompt awaiting input, as
    // opposed to normal command output that happens to contain "(y)" followed by a newline.
    /\(y\) +$/i,
    // Prompt with parenthesized default value e.g. "package name: (test) " or "version: (1.0.0) ".
    // REQUIRES at least one space between the colon and the opening paren (`\s+`, not `\s*`)
    // so this rule does not match git-aware shell prompts like
    // allow-any-unicode-next-line
    //   "➜  myrepo git:(main) "                    (oh-my-zsh / robbyrussell)
    //   "[user@host ~/myrepo (main)]$ "
    // where the colon abuts the paren with no separator. npm-init / yarn-init style
    // prompts always render at least one space after the colon, so this stays specific
    // without dropping the intended matches.
    /:\s+\([^)]*\) +$/,
    // Line contains (END) which is common in pagers
    /\(END\)$/,
    // Password prompt. Requires a trailing colon (e.g. "Password:", "[sudo] password for user:")
    // and tolerates zero or more trailing spaces — xterm's `translateToString(trimRight=true)`
    // strips trailing whitespace from non-wrapped buffer lines, so a real `Password: ` prompt
    // is captured from the buffer as `Password:` with no trailing space.
    /password(?: for [^:]+)?:\s*$/i,
    // "Press a key" or "Press any key"
    /press a(?:ny)? key/i,
    // Interactive prompt libraries (prompts, enquirer, inquirer) prefix the prompt with
    // '? ' at the start of the line and end with a distinctive chevron character
    // followed by optional trailing whitespace where the cursor is awaiting input.
    // Anchoring the '?' to the start of the line (after optional whitespace/ANSI
    // escapes) avoids false positives from normal output that contains both a '?'
    // allow-any-unicode-next-line
    // and a chevron (e.g. "What happened? ›").
    // Examples:
    //   "? Do you want to install jsdom? <chevron>"  (prompts)
    //   "? Pick a color <chevron> "                  (enquirer)
    // allow-any-unicode-next-line
    /^(?:\s|\x1b\[[0-9;]*m)*\?.*[›❯▸▶]\s*$/
  ].some((e) => e.test(cursorLine));
}
function detectsInputRequiredPattern(cursorLine) {
  return detectsHighConfidenceInputPattern(cursorLine);
}
function detectsLikelyInputRequiredPattern(cursorLine) {
  if (detectsHighConfidenceInputPattern(cursorLine)) {
    return true;
  }
  return [
    // Line ends with ':' followed by at least one space. The trailing space indicates a
    // waiting prompt (cursor positioned after the colon). A bare ':\n' at end of buffer is
    // usually non-prompt output (e.g. a header or log line) and must not match.
    // NOTE: This is a broad pattern — only use when the caller has independent evidence
    // (e.g. `isActive === true`) that the command is still consuming stdin. On a finished
    // command, log output like `Last Command: ` is indistinguishable from a real prompt.
    /: +$/,
    // Line ends with '?' followed by at least one space (optionally followed by a
    // parenthesized hint like "Continue? (yes/no) "). Requiring trailing space avoids
    // matching arbitrary command output where a line happens to end with '?'.
    // NOTE: This is a broad pattern — same caller-side guard required as above.
    /\? *(?:\([a-z\s]+\))? +$/i
  ].some((e) => e.test(cursorLine));
}
function detectsNonInteractiveHelpPattern(cursorLine) {
  return [
    /press [h?]\s*(?:\+\s*enter)?\s*to (?:show|open|display|get|see)\s*(?:available )?(?:help|commands|options)/i,
    /press h\s*(?:or\s*\?)?\s*(?:\+\s*enter)?\s*for (?:help|commands|options)/i,
    /press \?\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:help|commands|options|list)/i,
    /type\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
    /hit\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
    /press o\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:open|launch)(?:\s*(?:the )?(?:app|application|browser)|\s+in\s+(?:the\s+)?browser)?/i,
    /press r\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:restart|reload|refresh)(?:\s*(?:the )?(?:server|dev server|service))?/i,
    /press q\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:quit|exit|stop)(?:\s*(?:the )?(?:server|app|process))?/i,
    /press u\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:show|print|display)\s*(?:the )?(?:server )?urls?/i
  ].some((e) => e.test(cursorLine));
}
const taskFinishMessages = [
  // "Terminal will be reused by tasks, press any key to close it."
  localize("closeTerminal", "Terminal will be reused by tasks, press any key to close it."),
  localize("reuseTerminal", "Terminal will be reused by tasks, press any key to close it."),
  // "Press any key to close the terminal." (with exit code placeholder removed for matching)
  localize("exitCode.closeTerminal", "Press any key to close the terminal."),
  localize("exitCode.reuseTerminal", "Press any key to close the terminal."),
  // Punctuation variant: "The terminal will be reused by tasks. Press any key to close."
  localize("reuseTerminal.pressClose", "The terminal will be reused by tasks. Press any key to close.")
];
const normalizedTaskFinishMessages = taskFinishMessages.map(
  (msg) => msg.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, "").toLowerCase()
);
function detectsVSCodeTaskFinishMessage(cursorLine) {
  const compact = cursorLine.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, "").toLowerCase();
  return normalizedTaskFinishMessages.some((msg) => compact.includes(msg));
}
function detectsGenericPressAnyKeyPattern(cursorLine) {
  if (detectsVSCodeTaskFinishMessage(cursorLine)) {
    return false;
  }
  return /press a(?:ny)? key/i.test(cursorLine);
}
export {
  OutputMonitor,
  detectsGenericPressAnyKeyPattern,
  detectsHighConfidenceInputPattern,
  detectsInputRequiredPattern,
  detectsLikelyInputRequiredPattern,
  detectsNonInteractiveHelpPattern,
  detectsSensitiveInputPrompt,
  detectsVSCodeTaskFinishMessage,
  getLastLine,
  matchTerminalPromptOption
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL21vbml0b3Jpbmcvb3V0cHV0TW9uaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCB0eXBlIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElUb29sSW52b2NhdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUYXNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlua0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vdGFza0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgSUV4ZWN1dGlvbiwgSVBvbGxpbmdSZXN1bHQsIE91dHB1dE1vbml0b3JTdGF0ZSwgUG9sbGluZ0NvbnN0cyB9IGZyb20gJy4vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU91dHB1dE1vbml0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgcG9sbGluZ1Jlc3VsdDogSVBvbGxpbmdSZXN1bHQgJiB7IHBvbGxEdXJhdGlvbk1zOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzOiBJT3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzO1xuXG5cdHJlYWRvbmx5IG9uRGlkRmluaXNoQ29tbWFuZDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkRGV0ZWN0SW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+O1xuXHQvKipcblx0ICogRmlyZXMgd2hlbiB0aGUgdGVybWluYWwgaXMgZGV0ZWN0ZWQgdG8gYmUgd2FpdGluZyBmb3Igc2Vuc2l0aXZlIGlucHV0XG5cdCAqIChlLmcuIGEgcGFzc3dvcmQsIHBhc3NwaHJhc2UsIHRva2VuLCBzZWNyZXQgb3IgdmVyaWZpY2F0aW9uIGNvZGUpLiBUaGlzXG5cdCAqIGlzIGZpcmVkICppbnN0ZWFkIG9mKiB7QGxpbmsgb25EaWREZXRlY3RJbnB1dE5lZWRlZH0gc28gY2FsbGVycyBjYW4gc2hvd1xuXHQgKiBVSSB0aGF0IGZvY3VzZXMgdGhlIHRlcm1pbmFsIHJhdGhlciB0aGFuIHJvdXRpbmcgdGhlIHByb21wdCB0aHJvdWdoIHRoZVxuXHQgKiBhZ2VudC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQ6IEV2ZW50PHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnMge1xuXHRpbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudDogbnVtYmVyO1xuXHRpbnB1dFRvb2xNYW51YWxSZWplY3RDb3VudDogbnVtYmVyO1xuXHRpbnB1dFRvb2xNYW51YWxDaGFyczogbnVtYmVyO1xuXHRpbnB1dFRvb2xBdXRvQWNjZXB0Q291bnQ6IG51bWJlcjtcblx0aW5wdXRUb29sQXV0b0NoYXJzOiBudW1iZXI7XG5cdGlucHV0VG9vbE1hbnVhbFNob3duQ291bnQ6IG51bWJlcjtcblx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dFNob3duQ291bnQ6IG51bWJlcjtcblx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50OiBudW1iZXI7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbGFzdCB2aXNpYmxlIGxpbmUgZnJvbSB0ZXJtaW5hbCBvdXRwdXQgYWZ0ZXIgdHJpbW1pbmcgdHJhaWxpbmcgbGluZSBicmVha3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXN0TGluZShvdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghb3V0cHV0KSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IHRyaW1tZWRPdXRwdXQgPSBvdXRwdXQucmVwbGFjZSgvW1xcclxcbl0rJC8sICcnKTtcblx0aWYgKCF0cmltbWVkT3V0cHV0KSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IGxhc3RMaW5lRmVlZCA9IHRyaW1tZWRPdXRwdXQubGFzdEluZGV4T2YoJ1xcbicpO1xuXHRjb25zdCBsYXN0TGluZSA9IGxhc3RMaW5lRmVlZCA9PT0gLTEgPyB0cmltbWVkT3V0cHV0IDogdHJpbW1lZE91dHB1dC5zbGljZShsYXN0TGluZUZlZWQgKyAxKTtcblx0Y29uc3QgbGFzdENhcnJpYWdlUmV0dXJuID0gbGFzdExpbmUubGFzdEluZGV4T2YoJ1xccicpO1xuXHRyZXR1cm4gbGFzdENhcnJpYWdlUmV0dXJuID09PSAtMSA/IGxhc3RMaW5lIDogbGFzdExpbmUuc2xpY2UobGFzdENhcnJpYWdlUmV0dXJuICsgMSk7XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRwdXRNb25pdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPdXRwdXRNb25pdG9yIHtcblx0cHJpdmF0ZSBfc3RhdGU6IE91dHB1dE1vbml0b3JTdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5Qb2xsaW5nRm9ySWRsZTtcblx0Z2V0IHN0YXRlKCk6IE91dHB1dE1vbml0b3JTdGF0ZSB7IHJldHVybiB0aGlzLl9zdGF0ZTsgfVxuXG5cdHByaXZhdGUgX2Zvcm1hdExhc3RMaW5lRm9yTG9nKG91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoIW91dHB1dCkge1xuXHRcdFx0cmV0dXJuICc8ZW1wdHk+Jztcblx0XHR9XG5cdFx0Y29uc3QgbGFzdExpbmUgPSBnZXRMYXN0TGluZShvdXRwdXQpLnRyaW1FbmQoKTtcblx0XHRpZiAoIWxhc3RMaW5lKSB7XG5cdFx0XHRyZXR1cm4gJzxlbXB0eT4nO1xuXHRcdH1cblx0XHQvLyBBdm9pZCBsb2dnaW5nIHBvdGVudGlhbGx5IHNlbnNpdGl2ZSB2YWx1ZXMgZnJvbSBjb21tb24gc2VjcmV0IHByb21wdHMuXG5cdFx0aWYgKHRoaXMuX2lzU2Vuc2l0aXZlUHJvbXB0KGxhc3RMaW5lKSkge1xuXHRcdFx0cmV0dXJuICc8cmVkYWN0ZWQ+Jztcblx0XHR9XG5cdFx0Ly8gS2VlcCBsb2dzIGJvdW5kZWQuXG5cdFx0cmV0dXJuIGxhc3RMaW5lLmxlbmd0aCA+IDIwMCA/IGxhc3RMaW5lLnNsaWNlKDAsIDIwMCkgKyAnXHUyMDI2JyA6IGxhc3RMaW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBfcG9sbGluZ1Jlc3VsdDogSVBvbGxpbmdSZXN1bHQgJiB7IHBvbGxEdXJhdGlvbk1zOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0Z2V0IHBvbGxpbmdSZXN1bHQoKTogSVBvbGxpbmdSZXN1bHQgJiB7IHBvbGxEdXJhdGlvbk1zOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wb2xsaW5nUmVzdWx0OyB9XG5cblx0LyoqXG5cdCAqIEZsYWcgdG8gdHJhY2sgaWYgdXNlciBoYXMgaW5wdXR0ZWQgc2luY2UgaWRsZSB3YXMgZGV0ZWN0ZWQuXG5cdCAqIFRoaXMgaXMgdXNlZCB0byBza2lwIHNob3dpbmcgcHJvbXB0cyBpZiB0aGUgdXNlciBhbHJlYWR5IHByb3ZpZGVkIGlucHV0LlxuXHQgKi9cblx0cHJpdmF0ZSBfdXNlcklucHV0dGVkU2luY2VJZGxlRGV0ZWN0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNlcklucHV0TGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX291dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVyczogSU91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVycyA9IHtcblx0XHRpbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudDogMCxcblx0XHRpbnB1dFRvb2xNYW51YWxSZWplY3RDb3VudDogMCxcblx0XHRpbnB1dFRvb2xNYW51YWxDaGFyczogMCxcblx0XHRpbnB1dFRvb2xBdXRvQWNjZXB0Q291bnQ6IDAsXG5cdFx0aW5wdXRUb29sQXV0b0NoYXJzOiAwLFxuXHRcdGlucHV0VG9vbE1hbnVhbFNob3duQ291bnQ6IDAsXG5cdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dFNob3duQ291bnQ6IDAsXG5cdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50OiAwLFxuXHR9O1xuXHRnZXQgb3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzKCk6IFJlYWRvbmx5PElPdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM+IHsgcmV0dXJuIHRoaXMuX291dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVyczsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRmluaXNoQ29tbWFuZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZpbmlzaENvbW1hbmQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRGaW5pc2hDb21tYW5kLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGV0ZWN0SW5wdXROZWVkZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREZXRlY3RJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERldGVjdElucHV0TmVlZGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREZXRlY3RTZW5zaXRpdmVJbnB1dE5lZWRlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgX2FzeW5jTW9kZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9jb21tYW5kID0gJyc7XG5cdHByaXZhdGUgX2ludm9jYXRpb25Db250ZXh0OiBJVG9vbEludm9jYXRpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50TW9uaXRvcmluZ0N0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBUcmFja3Mgd2hldGhlciBvbkRpZEZpbmlzaENvbW1hbmQgaGFzIGZpcmVkIHNvIHRoZSBldmVudCBpcyBkZWxpdmVyZWQgYXRcblx0ICogbW9zdCBvbmNlLiBUaGUgZXZlbnQgbXVzdCBmaXJlIHN5bmNocm9ub3VzbHkgZHVyaW5nIGRpc3Bvc2Ugc28gY29uc3VtZXJzXG5cdCAqIGF3YWl0aW5nIGBFdmVudC50b1Byb21pc2Uob25EaWRGaW5pc2hDb21tYW5kKWAgYXJlIHVuYmxvY2tlZCBiZWZvcmUgdGhlXG5cdCAqIHVuZGVybHlpbmcgZW1pdHRlciBpcyB0b3JuIGRvd24gYnkgc3VwZXIuZGlzcG9zZSgpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGlkRmluaXNoID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfZmlyZUZpbmlzaGVkT25jZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlkRmluaXNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RpZEZpbmlzaCA9IHRydWU7XG5cdFx0dGhpcy5fb25EaWRGaW5pc2hDb21tYW5kLmZpcmUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gRGVsaXZlciBvbkRpZEZpbmlzaENvbW1hbmQgdG8gY29uc3VtZXJzIEJFRk9SRSBzdXBlci5kaXNwb3NlKCkgdGVhcnNcblx0XHQvLyBkb3duIHRoZSBlbWl0dGVyLiBGaWVsZC1pbml0aWFsaXplZCBkaXNwb3NhYmxlcyAoaW5jbHVkaW5nXG5cdFx0Ly8gX29uRGlkRmluaXNoQ29tbWFuZCkgYXJlIHJlZ2lzdGVyZWQgYmVmb3JlIGFueSBkaXNwb3NhYmxlIGFkZGVkIGluXG5cdFx0Ly8gdGhlIGNvbnN0cnVjdG9yIGJvZHkgYW5kIGFyZSBkaXNwb3NlZCBmaXJzdCBieSBEaXNwb3NhYmxlU3RvcmUgaW5cblx0XHQvLyBpbnNlcnRpb24gb3JkZXIuIFdpdGhvdXQgdGhpcyBvdmVycmlkZSwgY29uc3VtZXJzIGF3YWl0aW5nXG5cdFx0Ly8gYEV2ZW50LnRvUHJvbWlzZShvbkRpZEZpbmlzaENvbW1hbmQpYCB3b3VsZCByYWNlIHdpdGggZW1pdHRlclxuXHRcdC8vIHRlYXJkb3duIGFuZCBoYW5nIHdoZW4gZGlzcG9zZSBsYW5kcyB3aGlsZSBfc3RhcnRNb25pdG9yaW5nIGlzIHN0aWxsXG5cdFx0Ly8gaW4gZmxpZ2h0LlxuXHRcdGlmICghdGhpcy5fZGlkRmluaXNoKSB7XG5cdFx0XHQvLyBTeW50aGVzaXplIGEgQ2FuY2VsbGVkIHBvbGxpbmdSZXN1bHQgc28gY29uc3VtZXJzIHRoYXQgcmVhZFxuXHRcdFx0Ly8gYG1vbml0b3IucG9sbGluZ1Jlc3VsdGAgYWZ0ZXIgYXdhaXRpbmcgb25EaWRGaW5pc2hDb21tYW5kIGFsd2F5c1xuXHRcdFx0Ly8gc2VlIGEgZGVmaW5lZCB2YWx1ZSB3aXRoIHRoZSBvdXRwdXQgY29sbGVjdGVkIHNvIGZhci5cblx0XHRcdHRoaXMuX3BvbGxpbmdSZXN1bHQgPz89IHtcblx0XHRcdFx0c3RhdGU6IE91dHB1dE1vbml0b3JTdGF0ZS5DYW5jZWxsZWQsXG5cdFx0XHRcdG91dHB1dDogdGhpcy5fZXhlY3V0aW9uLmdldE91dHB1dCgpLFxuXHRcdFx0XHRwb2xsRHVyYXRpb25NczogMCxcblx0XHRcdFx0cmVzb3VyY2VzOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0aGlzLl9maXJlRmluaXNoZWRPbmNlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXhlY3V0aW9uOiBJRXhlY3V0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BvbGxGbjogKChleGVjdXRpb246IElFeGVjdXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgdGFza1NlcnZpY2U6IElUYXNrU2VydmljZSkgPT4gUHJvbWlzZTxJUG9sbGluZ1Jlc3VsdCB8IHVuZGVmaW5lZD4pIHwgdW5kZWZpbmVkLFxuXHRcdGludm9jYXRpb25Db250ZXh0OiBJVG9vbEludm9jYXRpb25Db250ZXh0IHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRjb21tYW5kOiBzdHJpbmcsXG5cdFx0QElUYXNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb21tYW5kID0gY29tbWFuZDtcblx0XHR0aGlzLl9pbnZvY2F0aW9uQ29udGV4dCA9IGludm9jYXRpb25Db250ZXh0O1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBDVFMgc3luY2hyb25vdXNseSBzbyBpdCBpcyBhdmFpbGFibGUgZm9yIGNhbmNlbGxhdGlvbiBpZiB0aGVcblx0XHQvLyBPdXRwdXRNb25pdG9yIGlzIGRpc3Bvc2VkIGJlZm9yZSB0aGUgZGVmZXJyZWQgX3N0YXJ0TW9uaXRvcmluZyBmaXJlcy5cblx0XHQvLyBUaGUgcmVnaXN0ZXJlZCBkaXNwb3NhYmxlIG11c3QgY2FuY2VsIChub3QganVzdCBkaXNwb3NlKSB0aGUgQ1RTIHNvIHRoYXRcblx0XHQvLyB0aGUgYXN5bmMgbW9uaXRvcmluZyBsb29wJ3MgdG9rZW4gYmVjb21lcyBpc0NhbmNlbGxhdGlvblJlcXVlc3RlZD10cnVlIGFuZFxuXHRcdC8vIHRoZSBsb29wIGV4aXRzIHByb21wdGx5IFx1MjAxNCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCkgYWxvbmUgZG9lc1xuXHRcdC8vIG5vdCBzZXQgaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHR0aGlzLl9jdXJyZW50TW9uaXRvcmluZ0N0cyA9IGN0cztcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY3VycmVudE1vbml0b3JpbmdDdHM/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudE1vbml0b3JpbmdDdHM/LmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTdGFydCBhc3luYyB0byBlbnN1cmUgbGlzdGVuZXJzIGFyZSBzZXQgdXAuXG5cdFx0Ly8gQ2FwdHVyZSBgY3RzYCBsb2NhbGx5IHNvIHRoYXQgaWYgY29udGludWVNb25pdG9yaW5nQXN5bmMgcmVwbGFjZXNcblx0XHQvLyBfY3VycmVudE1vbml0b3JpbmdDdHMgYmVmb3JlIHRoaXMgZmlyZXMsIHdlIGRldGVjdCB0aGUgcmVwbGFjZW1lbnRcblx0XHQvLyBhbmQgYXZvaWQgc3RhcnRpbmcgYSBkdXBsaWNhdGUgbW9uaXRvcmluZyBsb29wLiBfc3RhcnRNb25pdG9yaW5nXG5cdFx0Ly8gaGFuZGxlcyBhIGNhbmNlbGxlZCB0b2tlbiBjb3JyZWN0bHkgYnkgZmlyaW5nIG9uRGlkRmluaXNoQ29tbWFuZCBpblxuXHRcdC8vIGl0cyBmaW5hbGx5IGJsb2NrLCBzbyB3ZSBhbHdheXMgY2FsbCBpdCB3aGVuIHdlJ3JlIHN0aWxsIHRoZSBjdXJyZW50XG5cdFx0Ly8gQ1RTIChldmVuIGlmIHRoZSB0b2tlbiBoYXMgc2luY2UgYmVlbiBjYW5jZWxsZWQpLlxuXHRcdHRpbWVvdXQoMCkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudE1vbml0b3JpbmdDdHMgIT09IGN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGFydE1vbml0b3JpbmcoY29tbWFuZCwgaW52b2NhdGlvbkNvbnRleHQsIGN0cy50b2tlbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydE1vbml0b3JpbmcoXG5cdFx0Y29tbWFuZDogc3RyaW5nLFxuXHRcdGludm9jYXRpb25Db250ZXh0OiBJVG9vbEludm9jYXRpb25Db250ZXh0IHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwb2xsU3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblxuXHRcdGxldCByZXNvdXJjZXM7XG5cdFx0bGV0IG91dHB1dDtcblxuXHRcdGxldCBleHRlbmRlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHR3aGlsZSAoIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHN3aXRjaCAodGhpcy5fc3RhdGUpIHtcblx0XHRcdFx0XHRjYXNlIE91dHB1dE1vbml0b3JTdGF0ZS5Qb2xsaW5nRm9ySWRsZToge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogRW50ZXJpbmcgUG9sbGluZ0ZvcklkbGUgKGV4dGVuZGVkPSR7ZXh0ZW5kZWR9KWApO1xuXHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBhd2FpdCB0aGlzLl93YWl0Rm9ySWRsZSh0aGlzLl9leGVjdXRpb24sIGV4dGVuZGVkLCB0b2tlbik7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiBQb2xsaW5nRm9ySWRsZSBjb21wbGV0ZWQgLT4gc3RhdGU9JHtPdXRwdXRNb25pdG9yU3RhdGVbdGhpcy5fc3RhdGVdfWApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgT3V0cHV0TW9uaXRvclN0YXRlLlRpbWVvdXQ6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IEVudGVyaW5nIFRpbWVvdXQgc3RhdGUgKGV4dGVuZGVkPSR7ZXh0ZW5kZWR9KWApO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2hvdWxkQ29udGludWVQb2xsaW5nID0gYXdhaXQgdGhpcy5faGFuZGxlVGltZW91dFN0YXRlKGNvbW1hbmQsIGludm9jYXRpb25Db250ZXh0LCBleHRlbmRlZCwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0aWYgKHNob3VsZENvbnRpbnVlUG9sbGluZykge1xuXHRcdFx0XHRcdFx0XHRleHRlbmRlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0YXRlID0gT3V0cHV0TW9uaXRvclN0YXRlLlBvbGxpbmdGb3JJZGxlO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fYXN5bmNNb2RlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEluIGFzeW5jIG1vZGUsIHdhaXQgZm9yIG5ldyBkYXRhIGluc3RlYWQgb2Ygc3RvcHBpbmcgb24gdGltZW91dFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBBc3luYyBtb2RlIC0gdGltZW91dCByZWFjaGVkLCB3YWl0aW5nIGZvciBuZXcgdGVybWluYWwgZGF0YScpO1xuXHRcdFx0XHRcdFx0XHRleHRlbmRlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl93YWl0Rm9yTmV3RGF0YSh0b2tlbik7XG5cdFx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0YXRlID0gT3V0cHV0TW9uaXRvclN0YXRlLlBvbGxpbmdGb3JJZGxlO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlIE91dHB1dE1vbml0b3JTdGF0ZS5DYW5jZWxsZWQ6XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlOiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBFbnRlcmluZyBJZGxlIGhhbmRsZXInKTtcblx0XHRcdFx0XHRcdGNvbnN0IGlkbGVSZXN1bHQgPSBhd2FpdCB0aGlzLl9oYW5kbGVJZGxlU3RhdGUodG9rZW4pO1xuXHRcdFx0XHRcdFx0aWYgKGlkbGVSZXN1bHQuc2hvdWxkQ29udGludWVQb2xsaW5nKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IElkbGUgaGFuZGxlciAtPiBjb250aW51ZSBwb2xsaW5nJyk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0YXRlID0gT3V0cHV0TW9uaXRvclN0YXRlLlBvbGxpbmdGb3JJZGxlO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fYXN5bmNNb2RlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIEluIGFzeW5jIG1vZGUsIHdhaXQgZm9yIG5ldyB0ZXJtaW5hbCBkYXRhIGJlZm9yZSBtb25pdG9yaW5nIGFnYWluLlxuXHRcdFx0XHRcdFx0XHQvLyBUaGlzIGF2b2lkcyBleHBlbnNpdmUgTExNIGNhbGxzIHdoaWxlIHRoZSB0ZXJtaW5hbCBzaXRzIGlkbGUuXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IEFzeW5jIG1vZGUgLSB3YWl0aW5nIGZvciBuZXcgdGVybWluYWwgZGF0YSBiZWZvcmUgbmV4dCBtb25pdG9yaW5nIGN5Y2xlJyk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JOZXdEYXRhKHRva2VuKTtcblx0XHRcdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuUG9sbGluZ0ZvcklkbGU7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogSWRsZSBoYW5kbGVyIC0+IHN0b3AgcG9sbGluZyAoaGFzUmVzb3VyY2VzPSR7ISFpZGxlUmVzdWx0LnJlc291cmNlc30sIG91dHB1dExlbj0ke2lkbGVSZXN1bHQub3V0cHV0Py5sZW5ndGggPz8gMH0pYCk7XG5cdFx0XHRcdFx0XHRcdHJlc291cmNlcyA9IGlkbGVSZXN1bHQucmVzb3VyY2VzO1xuXHRcdFx0XHRcdFx0XHRvdXRwdXQgPSBpZGxlUmVzdWx0Lm91dHB1dDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUgPT09IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlIHx8IHRoaXMuX3N0YXRlID09PSBPdXRwdXRNb25pdG9yU3RhdGUuQ2FuY2VsbGVkIHx8IHRoaXMuX3N0YXRlID09PSBPdXRwdXRNb25pdG9yU3RhdGUuVGltZW91dCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5DYW5jZWxsZWQ7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IE1vbml0b3JpbmcgZmluaXNoZWQgKHN0YXRlPSR7T3V0cHV0TW9uaXRvclN0YXRlW3RoaXMuX3N0YXRlXX0sIGR1cmF0aW9uPSR7RGF0ZS5ub3coKSAtIHBvbGxTdGFydFRpbWV9bXMpYCk7XG5cdFx0XHR0aGlzLl9wb2xsaW5nUmVzdWx0ID0ge1xuXHRcdFx0XHRzdGF0ZTogdGhpcy5fc3RhdGUsXG5cdFx0XHRcdG91dHB1dDogb3V0cHV0ID8/IHRoaXMuX2V4ZWN1dGlvbi5nZXRPdXRwdXQoKSxcblx0XHRcdFx0cG9sbER1cmF0aW9uTXM6IERhdGUubm93KCkgLSBwb2xsU3RhcnRUaW1lLFxuXHRcdFx0XHRyZXNvdXJjZXNcblx0XHRcdH07XG5cdFx0XHQvLyBDbGVhbiB1cCBpZGxlIGlucHV0IGxpc3RlbmVyIGlmIHN0aWxsIGFjdGl2ZVxuXHRcdFx0dGhpcy5fdXNlcklucHV0TGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdC8vIEZpcmUgYXQgbW9zdCBvbmNlLiBJZiBkaXNwb3NlKCkgYWxyZWFkeSBmaXJlZCB0aGUgZXZlbnQgc3luY2hyb25vdXNseVxuXHRcdFx0Ly8gKGUuZy4gdGhlIG1vbml0b3Igd2FzIHRvcm4gZG93biBiZWZvcmUgdGhpcyBhc3luYyBsb29wIHJlYWNoZWQgaXRzXG5cdFx0XHQvLyBmaW5hbGx5KSwgc2tpcCBmaXJpbmcgb24gYSBwb3RlbnRpYWxseSBkaXNwb3NlZCBlbWl0dGVyLlxuXHRcdFx0dGhpcy5fZmlyZUZpbmlzaGVkT25jZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb250aW51ZXMgbW9uaXRvcmluZyBpbiBiYWNrZ3JvdW5kIG1vZGUgd2l0aCBhIG5ldyBjYW5jZWxsYXRpb24gdG9rZW4uXG5cdCAqIEluIGJhY2tncm91bmQgbW9kZSwgdGhlIG1vbml0b3IgcmUtcG9sbHMgZm9yIGlkbGUgYW5kIGhhbmRsZXMgcHJvbXB0c1xuXHQgKiB3aGVuZXZlciBuZXcgdGVybWluYWwgZGF0YSBhcnJpdmVzLCByYXRoZXIgdGhhbiBzdG9wcGluZyBhZnRlciB0aGUgZmlyc3Rcblx0ICogaWRsZSBkZXRlY3Rpb24uIFJlc291cmNlIGNvc3QgaXMgYm91bmRlZCBiZWNhdXNlIHRoZSBtb25pdG9yIG9ubHkgd2FrZXNcblx0ICogb24gbmV3IHRlcm1pbmFsIGRhdGEgKHZpYSB7QGxpbmsgX3dhaXRGb3JOZXdEYXRhfSkgYW5kIGVhY2ggaWRsZSBjeWNsZVxuXHQgKiBpcyBjYXBwZWQgYnkgdGhlIHN0YW5kYXJkIHBvbGxpbmcgdGltZW91dHMuXG5cdCAqL1xuXHRjb250aW51ZU1vbml0b3JpbmdBc3luYyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hc3luY01vZGUgPSB0cnVlO1xuXHRcdC8vIENhbmNlbCBhbmQgZGlzcG9zZSBhbnkgaW4tcHJvZ3Jlc3MgbW9uaXRvcmluZyBydW4gdG8gYXZvaWQgdHdvIGNvbmN1cnJlbnQgbG9vcHMuXG5cdFx0Ly8gQ2FuY2VsIGJlZm9yZSBkaXNwb3NlIHNvIHRoYXQgb25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQgaGFuZGxlcnMgZmlyZSBhbmQgcGVuZGluZ1xuXHRcdC8vIHByb21pc2VzIChlLmcuIF93YWl0Rm9yTmV3RGF0YSkgcmVzb2x2ZSBwcm9wZXJseS5cblx0XHRjb25zdCBjdXJyZW50TW9uaXRvcmluZ0N0cyA9IHRoaXMuX2N1cnJlbnRNb25pdG9yaW5nQ3RzO1xuXHRcdGN1cnJlbnRNb25pdG9yaW5nQ3RzPy5jYW5jZWwoKTtcblx0XHRjdXJyZW50TW9uaXRvcmluZ0N0cz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2N1cnJlbnRNb25pdG9yaW5nQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHR0aGlzLl9zdGF0ZSA9IE91dHB1dE1vbml0b3JTdGF0ZS5Qb2xsaW5nRm9ySWRsZTtcblx0XHR0aGlzLl9zdGFydE1vbml0b3JpbmcodGhpcy5fY29tbWFuZCwgdGhpcy5faW52b2NhdGlvbkNvbnRleHQsIHRoaXMuX2N1cnJlbnRNb25pdG9yaW5nQ3RzLnRva2VuKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXYWl0cyBmb3IgbmV3IHRlcm1pbmFsIGRhdGEgb3IgY2FuY2VsbGF0aW9uLiBVc2VkIGluIGJhY2tncm91bmQgbW9kZVxuXHQgKiB0byBhdm9pZCBwb2xsaW5nIGFuZCBMTE0gY2FsbHMgd2hpbGUgdGhlIHRlcm1pbmFsIGlzIHF1aWV0LlxuXHQgKi9cblx0cHJpdmF0ZSBfd2FpdEZvck5ld0RhdGEodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2xlYW51cCA9ICgpID0+IHtcblx0XHRcdFx0ZGF0YUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dG9rZW5MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdGRpc3Bvc2VkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGRhdGFMaXN0ZW5lciA9IHRoaXMuX2V4ZWN1dGlvbi5pbnN0YW5jZS5vbkRhdGEoKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgdG9rZW5MaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KTtcblx0XHRcdC8vIFJlc29sdmUgd2hlbiB0aGUgdGVybWluYWwgaW5zdGFuY2UgaXMgZGlzcG9zZWQgdG8gYXZvaWQgd2FpdGluZyBmb3JldmVyXG5cdFx0XHRjb25zdCBkaXNwb3NlZExpc3RlbmVyID0gdGhpcy5fZXhlY3V0aW9uLmluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVJZGxlU3RhdGUodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IHJlc291cmNlcz86IElMaW5rTG9jYXRpb25bXTsgc2hvdWxkQ29udGludWVQb2xsaW5nOiBib29sZWFuOyBvdXRwdXQ/OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IHRoaXMuX2V4ZWN1dGlvbi5nZXRPdXRwdXQoKTtcblxuXHRcdC8vIFVzZSBvbmx5IHRoZSB0YWlsIG9mIHRoZSBvdXRwdXQgZm9yIGxvZ2dpbmcgYW5kIHRhc2stZmluaXNoIGRldGVjdGlvbixcblx0XHQvLyBidXQga2VlcCBsaW5lLW9yaWVudGVkIHByb21wdCBkZXRlY3RvcnMgc2NvcGVkIHRvIHRoZSBsYXN0IGxpbmUuXG5cdFx0Y29uc3Qgb3V0cHV0VGFpbCA9IG91dHB1dC5zbGljZSgtMTAwMCk7XG5cdFx0Y29uc3Qgb3V0cHV0TGFzdExpbmUgPSBnZXRMYXN0TGluZShvdXRwdXRUYWlsKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiBJZGxlIG91dHB1dCBzdW1tYXJ5OiBsZW49JHtvdXRwdXQubGVuZ3RofSwgbGFzdExpbmU9JHt0aGlzLl9mb3JtYXRMYXN0TGluZUZvckxvZyhvdXRwdXRUYWlsKX1gKTtcblxuXHRcdGlmIChkZXRlY3RzTm9uSW50ZXJhY3RpdmVIZWxwUGF0dGVybihvdXRwdXRMYXN0TGluZSkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IElkbGUgLT4gbm9uLWludGVyYWN0aXZlIGhlbHAgcGF0dGVybiBkZXRlY3RlZCwgc3RvcHBpbmcnKTtcblx0XHRcdHJldHVybiB7IHNob3VsZENvbnRpbnVlUG9sbGluZzogZmFsc2UsIG91dHB1dCB9O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBWUyBDb2RlJ3MgdGFzayBmaW5pc2ggbWVzc2FnZXMgKGxpa2UgXCJwcmVzcyBhbnkga2V5IHRvIGNsb3NlIHRoZSB0ZXJtaW5hbFwiKS5cblx0XHQvLyBJZiB0aGUgZXhlY3V0aW9uIGlzIGEgdGFzayBhbmQgdGhlIG91dHB1dCBjb250YWlucyBhIFZTIENvZGUgdGFzayBmaW5pc2ggbWVzc2FnZSxcblx0XHQvLyBhbHdheXMgdHJlYXQgaXQgYXMgYSBzdG9wIHNpZ25hbCByZWdhcmRsZXNzIG9mIHRhc2sgYWN0aXZlIHN0YXRlICh3aGljaCBjYW4gYmUgc3RhbGUpLlxuXHRcdGNvbnN0IGlzVGFzayA9IHRoaXMuX2V4ZWN1dGlvbi50YXNrICE9PSB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzVGFzayAmJiBkZXRlY3RzVlNDb2RlVGFza0ZpbmlzaE1lc3NhZ2Uob3V0cHV0VGFpbCkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IElkbGUgLT4gVlMgQ29kZSB0YXNrIGZpbmlzaCBtZXNzYWdlIGRldGVjdGVkLCBzdG9wcGluZycpO1xuXHRcdFx0Ly8gVGFzayBpcyBmaW5pc2hlZCwgaWdub3JlIHRoZSBcInByZXNzIGFueSBrZXkgdG8gY2xvc2VcIiBtZXNzYWdlXG5cdFx0XHRyZXR1cm4geyBzaG91bGRDb250aW51ZVBvbGxpbmc6IGZhbHNlLCBvdXRwdXQgfTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3IgZ2VuZXJpYyBcInByZXNzIGFueSBrZXlcIiBwcm9tcHRzIGZyb20gc2NyaXB0cy5cblx0XHQvLyBPbmx5IHNob3duIGZvciBub24tdGFzayBleGVjdXRpb25zIHNpbmNlIHRhc2sgZmluaXNoIG1lc3NhZ2VzIGFyZSBoYW5kbGVkIGFib3ZlLlxuXHRcdGlmICghaXNUYXNrICYmIGRldGVjdHNHZW5lcmljUHJlc3NBbnlLZXlQYXR0ZXJuKG91dHB1dFRhaWwpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBJZGxlIC0+IGdlbmVyaWMgXCJwcmVzcyBhbnkga2V5XCIgZGV0ZWN0ZWQsIHNpZ25hbGluZyBhZ2VudCcpO1xuXHRcdFx0dGhpcy5fb25EaWREZXRlY3RJbnB1dE5lZWRlZC5maXJlKCk7XG5cdFx0XHR0aGlzLl9jbGVhbnVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblx0XHRcdHJldHVybiB7IHNob3VsZENvbnRpbnVlUG9sbGluZzogZmFsc2UsIG91dHB1dCB9O1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHVzZXIgYWxyZWFkeSBpbnB1dHRlZCBzaW5jZSBpZGxlIHdhcyBkZXRlY3RlZCAoYmVmb3JlIHdlIGV2ZW4gZ290IGhlcmUpXG5cdFx0aWYgKHRoaXMuX3VzZXJJbnB1dHRlZFNpbmNlSWRsZURldGVjdGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBVc2VyIGlucHV0IGRldGVjdGVkIHNpbmNlIGlkbGU7IHNraXBwaW5nIHByb21wdCBhbmQgY29udGludWluZyBwb2xsaW5nJyk7XG5cdFx0XHR0aGlzLl9jbGVhbnVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblx0XHRcdHJldHVybiB7IHNob3VsZENvbnRpbnVlUG9sbGluZzogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdC8vIERlY2lkZSB3aGV0aGVyIHRoZSBjdXJyZW50IGxhc3QgbGluZSBzaG91bGQgZmlyZSBhbiBpbnB1dC1uZWVkZWQgc2lnbmFsLlxuXHRcdC8vIFR3byBhY2NlcHRhYmxlIGNvbmRpdGlvbnM6XG5cdFx0Ly8gICAxLiBTdHJpY3QgaGlnaC1jb25maWRlbmNlIHByb21wdCAoeS9uLCBwYXNzd29yZCwgXCIoRU5EKVwiLCBldGMuKSBcdTIwMTQgc2FmZSByZWdhcmRsZXNzXG5cdFx0Ly8gICAgICBvZiBleGVjdXRpb24tYWN0aXZlIHN0YXRlLlxuXHRcdC8vICAgMi4gQnJvYWQgZmFsbGJhY2sgcGF0dGVybiAoYmFyZSBcIjpcIiAvIFwiP1wiIHRyYWlsZXJzKSBcdTIwMTQgb25seSBzYWZlIHdoZW5cblx0XHQvLyAgICAgIGBleGVjdXRpb24uaXNBY3RpdmUoKSA9PT0gdHJ1ZWAsIHdoaWNoIHByb3ZpZGVzIGluZGVwZW5kZW50IGV2aWRlbmNlIHRoZVxuXHRcdC8vICAgICAgY29tbWFuZCBpcyBzdGlsbCBjb25zdW1pbmcgc3RkaW4uIFdpdGhvdXQgdGhhdCBndWFyZCB0aGUgYnJvYWQgcGF0dGVyblxuXHRcdC8vICAgICAgcHJvZHVjZXMgZmFsc2UgcG9zaXRpdmVzIG9uIGZpbmlzaGVkIGNvbW1hbmRzIChpc3N1ZSAjMzE1NDc2KS4gVGhlIHNhbWVcblx0XHQvLyAgICAgIGBpc0FjdGl2ZSA9PT0gdHJ1ZWAgZ3VhcmQgaXMgZW5mb3JjZWQgaW4gYF93YWl0Rm9ySWRsZWAsIGJ1dCB3ZSByZS1jaGVja1xuXHRcdC8vICAgICAgaGVyZSBiZWNhdXNlIChhKSBhY3Rpdml0eSBjYW4gZmxpcCBiZXR3ZWVuIGBfd2FpdEZvcklkbGVgIHJldHVybmluZyBhbmRcblx0XHQvLyAgICAgIGBfaGFuZGxlSWRsZVN0YXRlYCBydW5uaW5nIGFuZCAoYikgYF9oYW5kbGVJZGxlU3RhdGVgIGlzIHJlYWNoYWJsZSB2aWFcblx0XHQvLyAgICAgIHBhdGhzIHRoYXQgZGlkIG5vdCBlbnRlciB0aHJvdWdoIHRoZSBicm9hZCBicmFuY2guXG5cdFx0bGV0IHNob3VsZEZpcmVJbnB1dE5lZWRlZCA9IGRldGVjdHNJbnB1dFJlcXVpcmVkUGF0dGVybihvdXRwdXRMYXN0TGluZSk7XG5cdFx0aWYgKCFzaG91bGRGaXJlSW5wdXROZWVkZWQgJiYgZGV0ZWN0c0xpa2VseUlucHV0UmVxdWlyZWRQYXR0ZXJuKG91dHB1dExhc3RMaW5lKSkge1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSB0aGlzLl9leGVjdXRpb24uaXNBY3RpdmUgPyBhd2FpdCB0aGlzLl9leGVjdXRpb24uaXNBY3RpdmUoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc0FjdGl2ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRzaG91bGRGaXJlSW5wdXROZWVkZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlLWNoZWNrIHRoZSB1c2VyLWlucHV0IGd1YXJkIGFmdGVyIGFueSBhd2FpdHMgYWJvdmUuIFRoZSBlYXJsaWVyIGNoZWNrIGF0XG5cdFx0Ly8gdGhlIHRvcCBvZiB0aGlzIG1ldGhvZCBydW5zIGJlZm9yZSBgYXdhaXQgdGhpcy5fZXhlY3V0aW9uLmlzQWN0aXZlKClgOyBpZlxuXHRcdC8vIHRoZSB1c2VyIHR5cGVzIGR1cmluZyB0aGF0IGF3YWl0IHRoZSBmbGFnIGZsaXBzIHRvIHRydWUgYnV0IHdlIHdvdWxkIHN0aWxsXG5cdFx0Ly8gZmFsbCB0aHJvdWdoIGFuZCBmaXJlIGBvbkRpZERldGVjdElucHV0TmVlZGVkYCwgdW5kZXJtaW5pbmcgdGhlIGd1YXJkIGFuZFxuXHRcdC8vIHBvdGVudGlhbGx5IHJlLXBhdXNpbmcgdGhlIGFnZW50IGxvb3AgYWZ0ZXIgaW5wdXQgd2FzIGFscmVhZHkgcHJvdmlkZWQuXG5cdFx0aWYgKHNob3VsZEZpcmVJbnB1dE5lZWRlZCAmJiB0aGlzLl91c2VySW5wdXR0ZWRTaW5jZUlkbGVEZXRlY3RlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogVXNlciBpbnB1dCBkZXRlY3RlZCBkdXJpbmcgaXNBY3RpdmUgYXdhaXQ7IHNraXBwaW5nIHByb21wdCBhbmQgY29udGludWluZyBwb2xsaW5nJyk7XG5cdFx0XHR0aGlzLl9jbGVhbnVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblx0XHRcdHJldHVybiB7IHNob3VsZENvbnRpbnVlUG9sbGluZzogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdC8vIEluIGFzeW5jIG1vZGUsIHNpZ25hbCB0aGUgYWdlbnQgc28gaXQgY2FuIGRyaXZlIHNlbmRfdG9fdGVybWluYWwuXG5cdFx0aWYgKHRoaXMuX2FzeW5jTW9kZSkge1xuXHRcdFx0aWYgKHNob3VsZEZpcmVJbnB1dE5lZWRlZCkge1xuXHRcdFx0XHRpZiAodGhpcy5faXNTZW5zaXRpdmVQcm9tcHQob3V0cHV0TGFzdExpbmUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogQXN5bmMgbW9kZSAtIHNlbnNpdGl2ZSBpbnB1dCBwcm9tcHQgZGV0ZWN0ZWQsIHNpZ25hbGluZyBzZW5zaXRpdmUgVUknKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZERldGVjdFNlbnNpdGl2ZUlucHV0TmVlZGVkLmZpcmUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBBc3luYyBtb2RlIC0gaW5wdXQtcmVxdWlyZWQgcGF0dGVybiBkZXRlY3RlZCwgc2lnbmFsaW5nIGFnZW50Jyk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWREZXRlY3RJbnB1dE5lZWRlZC5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2NsZWFudXBJZGxlSW5wdXRMaXN0ZW5lcigpO1xuXHRcdFx0cmV0dXJuIHsgc2hvdWxkQ29udGludWVQb2xsaW5nOiBmYWxzZSwgb3V0cHV0IH07XG5cdFx0fVxuXG5cdFx0Ly8gSW4gZm9yZWdyb3VuZCBtb2RlLCBmaXJlIHRoZSBldmVudCBzbyB0aGUgcmFjZSBpbiBydW5JblRlcm1pbmFsVG9vbCBjYW4gcGljayBpdFxuXHRcdC8vIHVwIGFuZCByZXR1cm4gY29udHJvbCB0byB0aGUgYWdlbnQgKHdoaWNoIHVzZXMgc2VuZF90b190ZXJtaW5hbCB0byBwcm92aWRlIGlucHV0KS5cblx0XHQvLyBGb3Igc2Vuc2l0aXZlIHByb21wdHMgKHBhc3N3b3Jkcywgc2VjcmV0cywgT1RQcywgXHUyMDI2KSB3ZSBpbnN0ZWFkIGZpcmUgYSBzZXBhcmF0ZVxuXHRcdC8vIGV2ZW50IHNvIHRoZSB0b29sIGNhbiBzaG93IGEgY29uZmlybWF0aW9uIGRpYWxvZyB0aGF0IGZvY3VzZXMgdGhlIHRlcm1pbmFsIFx1MjAxNFxuXHRcdC8vIHRoZSBzZWNyZXQgbXVzdCBuZXZlciBiZSByb3V0ZWQgdGhyb3VnaCB0aGUgbW9kZWwuXG5cdFx0aWYgKHNob3VsZEZpcmVJbnB1dE5lZWRlZCkge1xuXHRcdFx0aWYgKHRoaXMuX2lzU2Vuc2l0aXZlUHJvbXB0KG91dHB1dExhc3RMaW5lKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBTZW5zaXRpdmUgaW5wdXQgcHJvbXB0IGRldGVjdGVkLCBzaWduYWxpbmcgc2Vuc2l0aXZlIFVJJyk7XG5cdFx0XHRcdHRoaXMuX29uRGlkRGV0ZWN0U2Vuc2l0aXZlSW5wdXROZWVkZWQuZmlyZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnT3V0cHV0TW9uaXRvcjogSW5wdXQtcmVxdWlyZWQgcGF0dGVybiBkZXRlY3RlZCwgc2lnbmFsaW5nIGFnZW50Jyk7XG5cdFx0XHRcdHRoaXMuX29uRGlkRGV0ZWN0SW5wdXROZWVkZWQuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2xlYW51cElkbGVJbnB1dExpc3RlbmVyKCk7XG5cdFx0XHRyZXR1cm4geyBzaG91bGRDb250aW51ZVBvbGxpbmc6IGZhbHNlLCBvdXRwdXQgfTtcblx0XHR9XG5cblx0XHQvLyBDbGVhbiB1cCBpbnB1dCBsaXN0ZW5lciBiZWZvcmUgY3VzdG9tIHBvbGxcblx0XHR0aGlzLl9jbGVhbnVwSWRsZUlucHV0TGlzdGVuZXIoKTtcblxuXHRcdC8vIExldCBjdXN0b20gcG9sbGVyIG92ZXJyaWRlIGlmIHByb3ZpZGVkXG5cdFx0Y29uc3QgY3VzdG9tID0gYXdhaXQgdGhpcy5fcG9sbEZuPy4odGhpcy5fZXhlY3V0aW9uLCB0b2tlbiwgdGhpcy5fdGFza1NlcnZpY2UpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IEN1c3RvbSBwb2xsZXIgcmVzdWx0OiAke2N1c3RvbSA/ICdwcm92aWRlZCcgOiAnbm9uZSd9YCk7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gY3VzdG9tPy5yZXNvdXJjZXM7XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2VzLCBzaG91bGRDb250aW51ZVBvbGxpbmc6IGZhbHNlLCBvdXRwdXQ6IGN1c3RvbT8ub3V0cHV0ID8/IG91dHB1dCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVGltZW91dFN0YXRlKF9jb21tYW5kOiBzdHJpbmcsIF9pbnZvY2F0aW9uQ29udGV4dDogSVRvb2xJbnZvY2F0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCwgX2V4dGVuZGVkOiBib29sZWFuLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKF9leHRlbmRlZCkge1xuXHRcdFx0Ly8gRXh0ZW5kZWQgcG9sbGluZyAoMiBtaW51dGVzKSBleHBpcmVkIHdoaWxlIHRoZSBwcm9jZXNzIHdhcyBzdGlsbFxuXHRcdFx0Ly8gcnVubmluZy4gUmF0aGVyIHRoYW4gc2lsZW50bHkgY2FuY2VsbGluZywgc2lnbmFsIHRoYXQgaW5wdXQgbWF5IGJlXG5cdFx0XHQvLyBuZWVkZWQgc28gdGhlIGFnZW50IHNlZXMgdGhlIGN1cnJlbnQgb3V0cHV0IGFuZCBjYW4gZGVjaWRlIGhvdyB0b1xuXHRcdFx0Ly8gcHJvY2VlZCAoZS5nLiBhbnN3ZXIgYW4gdW5yZWNvZ25pc2VkIGludGVyYWN0aXZlIHByb21wdCkuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ091dHB1dE1vbml0b3I6IEV4dGVuZGVkIHBvbGxpbmcgdGltZW91dCByZWFjaGVkIGFmdGVyIDIgbWludXRlcywgc2lnbmFsaW5nIHBvdGVudGlhbCBpbnB1dCBuZWVkZWQnKTtcblx0XHRcdHRoaXMuX29uRGlkRGV0ZWN0SW5wdXROZWVkZWQuZmlyZSgpO1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBDb250aW51ZSBwb2xsaW5nIHdpdGggZXhwb25lbnRpYWwgYmFja29mZlxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNpbmdsZSBib3VuZGVkIHBvbGxpbmcgcGFzcyB0aGF0IHJldHVybnMgd2hlbjpcblx0ICogIC0gdGVybWluYWwgYmVjb21lcyBpbmFjdGl2ZS9pZGxlLCBvclxuXHQgKiAgLSB0aW1lb3V0IHdpbmRvdyBlbGFwc2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvcklkbGUoXG5cdFx0ZXhlY3V0aW9uOiBJRXhlY3V0aW9uLFxuXHRcdGV4dGVuZGVkUG9sbGluZzogYm9vbGVhbixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8T3V0cHV0TW9uaXRvclN0YXRlPiB7XG5cblx0XHRjb25zdCBtYXhXYWl0TXMgPSBleHRlbmRlZFBvbGxpbmcgPyBQb2xsaW5nQ29uc3RzLkV4dGVuZGVkUG9sbGluZ01heER1cmF0aW9uIDogUG9sbGluZ0NvbnN0cy5GaXJzdFBvbGxpbmdNYXhEdXJhdGlvbjtcblx0XHRjb25zdCBtYXhJbnRlcnZhbCA9IFBvbGxpbmdDb25zdHMuTWF4UG9sbGluZ0ludGVydmFsRHVyYXRpb247XG5cdFx0bGV0IGN1cnJlbnRJbnRlcnZhbCA9IFBvbGxpbmdDb25zdHMuTWluUG9sbGluZ0R1cmF0aW9uO1xuXHRcdGxldCB3YWl0ZWQgPSAwO1xuXHRcdGxldCBjb25zZWN1dGl2ZUlkbGVFdmVudHMgPSAwO1xuXHRcdGxldCBoYXNSZWNlaXZlZERhdGEgPSBmYWxzZTtcblx0XHRjb25zdCBvbkRhdGFEaXNwb3NhYmxlID0gZXhlY3V0aW9uLmluc3RhbmNlLm9uRGF0YSgoX2RhdGEpID0+IHtcblx0XHRcdGhhc1JlY2VpdmVkRGF0YSA9IHRydWU7XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0d2hpbGUgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiB3YWl0ZWQgPCBtYXhXYWl0TXMpIHtcblx0XHRcdFx0Y29uc3Qgd2FpdFRpbWUgPSBNYXRoLm1pbihjdXJyZW50SW50ZXJ2YWwsIG1heFdhaXRNcyAtIHdhaXRlZCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCh3YWl0VGltZSwgdG9rZW4pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBPdXRwdXRNb25pdG9yU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2FpdGVkICs9IHdhaXRUaW1lO1xuXHRcdFx0XHRjdXJyZW50SW50ZXJ2YWwgPSBNYXRoLm1pbihjdXJyZW50SW50ZXJ2YWwgKiAyLCBtYXhJbnRlcnZhbCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRPdXRwdXQgPSBleGVjdXRpb24uZ2V0T3V0cHV0KCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRUYWlsID0gY3VycmVudE91dHB1dC5zbGljZSgtMTAwMCk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRMYXN0TGluZSA9IGdldExhc3RMaW5lKGN1cnJlbnRUYWlsKTtcblxuXHRcdFx0XHRpZiAoZGV0ZWN0c05vbkludGVyYWN0aXZlSGVscFBhdHRlcm4oY3VycmVudExhc3RMaW5lKSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYE91dHB1dE1vbml0b3I6IHdhaXRGb3JJZGxlIC0+IG5vbi1pbnRlcmFjdGl2ZSBoZWxwIGRldGVjdGVkICh3YWl0ZWQ9JHt3YWl0ZWR9bXMpYCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuSWRsZTtcblx0XHRcdFx0XHR0aGlzLl9zZXR1cElkbGVJbnB1dExpc3RlbmVyKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT25seSBmYXN0LXBhdGggb24gaGlnaC1jb25maWRlbmNlIHBhdHRlcm5zICh5L24sIHBhc3N3b3JkLCAoRU5EKSwgZXRjLikuXG5cdFx0XHRcdC8vIEJyb2FkIHBhdHRlcm5zIGxpa2UgYmFyZSBcIjpcIiBvciBcIj9cIiBhcmUgY2hlY2tlZCBsYXRlciBpbiBfaGFuZGxlSWRsZVN0YXRlXG5cdFx0XHRcdC8vIGFmdGVyIHRoZSB0ZXJtaW5hbCBoYXMgbmF0dXJhbGx5IGdvbmUgaWRsZSwgYXZvaWRpbmcgZmFsc2UgcG9zaXRpdmVzIG9uXG5cdFx0XHRcdC8vIG5vcm1hbCBjb21tYW5kIG91dHB1dCB0aGF0IGhhcHBlbnMgdG8gZW5kIHdpdGggdGhvc2UgY2hhcmFjdGVycy5cblx0XHRcdFx0Y29uc3QgcHJvbXB0UmVzdWx0ID0gZGV0ZWN0c0hpZ2hDb25maWRlbmNlSW5wdXRQYXR0ZXJuKGN1cnJlbnRMYXN0TGluZSk7XG5cdFx0XHRcdGlmIChwcm9tcHRSZXN1bHQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiB3YWl0Rm9ySWRsZSAtPiBoaWdoLWNvbmZpZGVuY2UgaW5wdXQgcGF0dGVybiBkZXRlY3RlZCAod2FpdGVkPSR7d2FpdGVkfW1zLCBsYXN0TGluZT0ke3RoaXMuX2Zvcm1hdExhc3RMaW5lRm9yTG9nKGN1cnJlbnRUYWlsKX0pYCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuSWRsZTtcblx0XHRcdFx0XHR0aGlzLl9zZXR1cElkbGVJbnB1dExpc3RlbmVyKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGhhc1JlY2VpdmVkRGF0YSkge1xuXHRcdFx0XHRcdGNvbnNlY3V0aXZlSWRsZUV2ZW50cyA9IDA7XG5cdFx0XHRcdFx0aGFzUmVjZWl2ZWREYXRhID0gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc2VjdXRpdmVJZGxlRXZlbnRzKys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZWNlbnRseUlkbGUgPSBjb25zZWN1dGl2ZUlkbGVFdmVudHMgPj0gUG9sbGluZ0NvbnN0cy5NaW5JZGxlRXZlbnRzO1xuXHRcdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGV4ZWN1dGlvbi5pc0FjdGl2ZSA/IGF3YWl0IGV4ZWN1dGlvbi5pc0FjdGl2ZSgpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBPdXRwdXRNb25pdG9yOiB3YWl0Rm9ySWRsZSBjaGVjazogd2FpdGVkPSR7d2FpdGVkfW1zLCByZWNlbnRseUlkbGU9JHtyZWNlbnRseUlkbGV9LCBpc0FjdGl2ZT0ke2lzQWN0aXZlfWApO1xuXHRcdFx0XHRpZiAocmVjZW50bHlJZGxlICYmIGlzQWN0aXZlICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogd2FpdEZvcklkbGUgLT4gcmVjZW50bHlJZGxlICYmICFhY3RpdmUgKHdhaXRlZD0ke3dhaXRlZH1tcywgbGFzdExpbmU9JHt0aGlzLl9mb3JtYXRMYXN0TGluZUZvckxvZyhjdXJyZW50VGFpbCl9KWApO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlID0gT3V0cHV0TW9uaXRvclN0YXRlLklkbGU7XG5cdFx0XHRcdFx0dGhpcy5fc2V0dXBJZGxlSW5wdXRMaXN0ZW5lcigpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9zdGF0ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdoZW4gdGhlIHRlcm1pbmFsIGhhcyBiZWVuIGlkbGUgKG5vIG5ldyBkYXRhKSBidXQgdGhlIGV4ZWN1dGlvbiBpc1xuXHRcdFx0XHQvLyBzdGlsbCByZXBvcnRlZCBhcyBhY3RpdmUgKGUuZy4gdGFzay1iYWNrZWQgZXhlY3V0aW9ucyksIGNoZWNrIHRoZVxuXHRcdFx0XHQvLyBicm9hZGVyIGlucHV0LXJlcXVpcmVkIGhldXJpc3RpY3MuIFRoZSBgaXNBY3RpdmUgPT09IHRydWVgIGd1YXJkIGlzXG5cdFx0XHRcdC8vIGxvYWQtYmVhcmluZzogaXQgcHJvdmlkZXMgaW5kZXBlbmRlbnQgZXZpZGVuY2UgdGhlIGNvbW1hbmQgaXMgc3RpbGxcblx0XHRcdFx0Ly8gY29uc3VtaW5nIHN0ZGluLCB3aGljaCBpcyB0aGUgb25seSBzaWduYWwgdGhhdCBkaXNhbWJpZ3VhdGVzIGEgcmVhbFxuXHRcdFx0XHQvLyBwcm9tcHQgbGlrZSBgRW50ZXIgeW91ciBuYW1lOiBgIGZyb20gbG9nIG91dHB1dCBsaWtlIGBMYXN0IENvbW1hbmQ6IGBcblx0XHRcdFx0Ly8gb24gYSBzaW5nbGUgY3Vyc29yIGxpbmUuIFdpdGhvdXQgdGhhdCBndWFyZCB0aGUgYnJvYWQgcGF0dGVybnNcblx0XHRcdFx0Ly8gcHJvZHVjZSBmYWxzZSBwb3NpdGl2ZXMgb24gZmluaXNoZWQgY29tbWFuZHMgKGlzc3VlICMzMTU0NzYpLlxuXHRcdFx0XHRpZiAocmVjZW50bHlJZGxlICYmIGlzQWN0aXZlID09PSB0cnVlICYmIGRldGVjdHNMaWtlbHlJbnB1dFJlcXVpcmVkUGF0dGVybihjdXJyZW50TGFzdExpbmUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgT3V0cHV0TW9uaXRvcjogd2FpdEZvcklkbGUgLT4gYnJvYWQgaW5wdXQgcGF0dGVybiBkZXRlY3RlZCB3aGlsZSBhY3RpdmUraWRsZSAod2FpdGVkPSR7d2FpdGVkfW1zLCBsYXN0TGluZT0ke3RoaXMuX2Zvcm1hdExhc3RMaW5lRm9yTG9nKGN1cnJlbnRUYWlsKX0pYCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGUgPSBPdXRwdXRNb25pdG9yU3RhdGUuSWRsZTtcblx0XHRcdFx0XHR0aGlzLl9zZXR1cElkbGVJbnB1dExpc3RlbmVyKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG9uRGF0YURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIE91dHB1dE1vbml0b3JTdGF0ZS5DYW5jZWxsZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE91dHB1dE1vbml0b3JTdGF0ZS5UaW1lb3V0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdXAgYSBsaXN0ZW5lciBmb3IgdXNlciBpbnB1dCB0aGF0IHRyaWdnZXJzIGltbWVkaWF0ZWx5IHdoZW4gaWRsZSBpcyBkZXRlY3RlZC5cblx0ICogVGhpcyBlbnN1cmVzIHdlIGNhdGNoIGFueSBpbnB1dCB0aGF0IGhhcHBlbnMgYmV0d2VlbiBpZGxlIGRldGVjdGlvbiBhbmQgcHJvbXB0IGNyZWF0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0dXBJZGxlSW5wdXRMaXN0ZW5lcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl91c2VySW5wdXR0ZWRTaW5jZUlkbGVEZXRlY3RlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ091dHB1dE1vbml0b3I6IFNldHRpbmcgdXAgaWRsZSBpbnB1dCBsaXN0ZW5lcicpO1xuXG5cdFx0Ly8gU2V0IHVwIG5ldyBsaXN0ZW5lciAoTXV0YWJsZURpc3Bvc2FibGUgYXV0by1kaXNwb3NlcyBwcmV2aW91cylcblx0XHR0aGlzLl91c2VySW5wdXRMaXN0ZW5lci52YWx1ZSA9IHRoaXMuX2V4ZWN1dGlvbi5pbnN0YW5jZS5vbkRpZElucHV0RGF0YSgoKSA9PiB7XG5cdFx0XHR0aGlzLl91c2VySW5wdXR0ZWRTaW5jZUlkbGVEZXRlY3RlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdPdXRwdXRNb25pdG9yOiBEZXRlY3RlZCB1c2VyIHRlcm1pbmFsIGlucHV0IHdoaWxlIGlkbGUnKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhbnMgdXAgdGhlIGlkbGUgaW5wdXQgbGlzdGVuZXIgYW5kIHJlc2V0cyB0aGUgZmxhZy5cblx0ICovXG5cdHByaXZhdGUgX2NsZWFudXBJZGxlSW5wdXRMaXN0ZW5lcigpOiB2b2lkIHtcblx0XHR0aGlzLl91c2VySW5wdXR0ZWRTaW5jZUlkbGVEZXRlY3RlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3VzZXJJbnB1dExpc3RlbmVyLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NlbnNpdGl2ZVByb21wdChwcm9tcHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc0Nhbm9uaWNhbFN1ZG9TUHJvbXB0KHRoaXMuX2NvbW1hbmQsIHByb21wdCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGV0ZWN0c1NlbnNpdGl2ZUlucHV0UHJvbXB0KHByb21wdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNDYW5vbmljYWxTdWRvU1Byb21wdChjb21tYW5kOiBzdHJpbmcsIHByb21wdDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvKD86XnxcXHMpc3Vkb1xccystUyg/Olxcc3wkKS8udGVzdChjb21tYW5kKSAmJiAvXlxcW3N1ZG9cXF1cXHMrcGFzc3dvcmQgZm9yIC4rOlxccyokL2kudGVzdChwcm9tcHQpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSB3aGVuIHRoZSB0ZXJtaW5hbCdzIGxhc3QgdmlzaWJsZSBsaW5lIGxvb2tzIGxpa2UgYSBwcm9tcHQgZm9yXG4gKiBhIHNlbnNpdGl2ZSBzZWNyZXQgKHBhc3N3b3JkLCBwYXNzcGhyYXNlLCB0b2tlbiwgQVBJIGtleSwgT1RQLCBldGMuKS4gVXNlZFxuICogdG8gc2hvcnQtY2lyY3VpdCB0aGUgbm9ybWFsIFwiaW5wdXQgbmVlZGVkIFx1MjE5MiByZXR1cm4gdG8gYWdlbnRcIiBmbG93IHNvIHRoYXRcbiAqIHRoZSBzZWNyZXQgaXMgbmV2ZXIgcm91dGVkIHRocm91Z2ggdGhlIG1vZGVsIFx1MjAxNCBpbnN0ZWFkIHRoZSB1c2VyIGlzIGFza2VkXG4gKiB2aWEgVUkgdG8gZm9jdXMgdGhlIHRlcm1pbmFsIGFuZCB0eXBlIHRoZSBzZWNyZXQgZGlyZWN0bHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RzU2Vuc2l0aXZlSW5wdXRQcm9tcHQoY3Vyc29yTGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvKHBhc3N3b3JkfHBhc3NwaHJhc2V8dG9rZW58YXBpXFxzKmtleXxzZWNyZXR8dmVyaWZpY2F0aW9uIGNvZGV8b3RwXFxifG9uZVtcXHMtXT90aW1lICg/OmNvZGV8cGFzc3dvcmQpfDJmYXxtZmF8cGluXFxzKig/OmNvZGV8bnVtYmVyKT9bOiBdP1xccyokfGF1dGhlbnRpY2F0aW9uIGNvZGUpL2kudGVzdChjdXJzb3JMaW5lKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoVGVybWluYWxQcm9tcHRPcHRpb24ob3B0aW9uczogcmVhZG9ubHkgc3RyaW5nW10sIHN1Z2dlc3RlZE9wdGlvbjogc3RyaW5nKTogeyBvcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDsgaW5kZXg6IG51bWJlciB9IHtcblx0Y29uc3Qgbm9ybWFsaXplID0gKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlLnJlcGxhY2UoL1snXCJgXS9nLCAnJykudHJpbSgpLnJlcGxhY2UoL1suLDo7XSskLywgJycpO1xuXG5cdGNvbnN0IG5vcm1hbGl6ZWRTdWdnZXN0aW9uID0gbm9ybWFsaXplKHN1Z2dlc3RlZE9wdGlvbik7XG5cdGlmICghbm9ybWFsaXplZFN1Z2dlc3Rpb24pIHtcblx0XHRyZXR1cm4geyBvcHRpb246IHVuZGVmaW5lZCwgaW5kZXg6IC0xIH07XG5cdH1cblxuXHRjb25zdCBjYW5kaWRhdGVzOiBzdHJpbmdbXSA9IFtub3JtYWxpemVkU3VnZ2VzdGlvbl07XG5cdGNvbnN0IGZpcnN0V2hpdGVzcGFjZVRva2VuID0gbm9ybWFsaXplZFN1Z2dlc3Rpb24uc3BsaXQoL1xccysvKVswXTtcblx0aWYgKGZpcnN0V2hpdGVzcGFjZVRva2VuICYmIGZpcnN0V2hpdGVzcGFjZVRva2VuICE9PSBub3JtYWxpemVkU3VnZ2VzdGlvbikge1xuXHRcdGNhbmRpZGF0ZXMucHVzaChmaXJzdFdoaXRlc3BhY2VUb2tlbik7XG5cdH1cblx0Y29uc3QgZmlyc3RBbHBoYU51bSA9IG5vcm1hbGl6ZWRTdWdnZXN0aW9uLm1hdGNoKC9bQS1aYS16MC05XSsvKTtcblx0aWYgKGZpcnN0QWxwaGFOdW0/LlswXSAmJiBmaXJzdEFscGhhTnVtWzBdICE9PSBub3JtYWxpemVkU3VnZ2VzdGlvbiAmJiBmaXJzdEFscGhhTnVtWzBdICE9PSBmaXJzdFdoaXRlc3BhY2VUb2tlbikge1xuXHRcdGNhbmRpZGF0ZXMucHVzaChmaXJzdEFscGhhTnVtWzBdKTtcblx0fVxuXG5cdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRjb25zdCBleGFjdEluZGV4ID0gb3B0aW9ucy5maW5kSW5kZXgob3B0ID0+IG5vcm1hbGl6ZShvcHQpID09PSBjYW5kaWRhdGUpO1xuXHRcdGlmIChleGFjdEluZGV4ICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuIHsgb3B0aW9uOiBvcHRpb25zW2V4YWN0SW5kZXhdLCBpbmRleDogZXhhY3RJbmRleCB9O1xuXHRcdH1cblx0XHRjb25zdCBsb3dlckNhbmRpZGF0ZSA9IGNhbmRpZGF0ZS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGNpSW5kZXggPSBvcHRpb25zLmZpbmRJbmRleChvcHQgPT4gbm9ybWFsaXplKG9wdCkudG9Mb3dlckNhc2UoKSA9PT0gbG93ZXJDYW5kaWRhdGUpO1xuXHRcdGlmIChjaUluZGV4ICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuIHsgb3B0aW9uOiBvcHRpb25zW2NpSW5kZXhdLCBpbmRleDogY2lJbmRleCB9O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7IG9wdGlvbjogdW5kZWZpbmVkLCBpbmRleDogLTEgfTtcbn1cblxuLyoqXG4gKiBIaWdoLWNvbmZpZGVuY2UgcGF0dGVybnMgdGhhdCByZWxpYWJseSBpbmRpY2F0ZSB0aGUgdGVybWluYWwgaXMgd2FpdGluZyBmb3JcbiAqIGlucHV0LiBUaGVzZSBhcmUgc2FmZSB0byB1c2UgYXMgYSBmYXN0LXBhdGggaW4gYF93YWl0Rm9ySWRsZWAgdG8gc2tpcCBub3JtYWxcbiAqIGlkbGUgZGV0ZWN0aW9uLCBiZWNhdXNlIHRoZXkgYXJlIHNwZWNpZmljIGVub3VnaCB0byBhdm9pZCBmYWxzZSBwb3NpdGl2ZXMgb25cbiAqIG5vcm1hbCBjb21tYW5kIG91dHB1dCAoYnVpbGQgbG9ncywgaGVhZGVycywgZXRjLikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RzSGlnaENvbmZpZGVuY2VJbnB1dFBhdHRlcm4oY3Vyc29yTGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBbXG5cdFx0Ly8gUG93ZXJTaGVsbC1zdHlsZSBtdWx0aS1vcHRpb24gbGluZSAoc3VwcG9ydHMgWz9dIEhlbHAgYW5kIG9wdGlvbmFsIGRlZmF1bHQgc3VmZml4KSBlbmRpbmdcblx0XHQvLyBpbiB3aGl0ZXNwYWNlLiAgVXNlcyBbXlxcW10qIHRvIG1hdGNoIGVhY2ggbGFiZWwgKGV2ZXJ5dGhpbmcgdXAgdG8gdGhlIG5leHQgYnJhY2tldCksXG5cdFx0Ly8gZW5zdXJpbmcgbGluZWFyLXRpbWUgbWF0Y2hpbmcgd2l0aCBubyBuZXN0ZWQgcXVhbnRpZmllcnMgdGhhdCBjb3VsZCBjYXVzZSBSZURvUy5cblx0XHQvXFxzKig/OlxcW1teXFxdXVxcXVteXFxbXSopKyg/OlxcKGRlZmF1bHQgaXNcXHMrXCJbXlwiXStcIlxcKTopP1xccyskLyxcblx0XHQvLyBCcmFja2V0ZWQvcGFyZW50aGVzaXplZCB5ZXMvbm8gcGFpcnMgYXQgZW5kIG9mIGxpbmU6ICh5L24pLCBbWS9uXSwgKHllcy9ubyksIFtuby95ZXNdXG5cdFx0Lyg/OlxcKHxcXFspXFxzKig/OnkoPzplcyk/XFxzKlxcL1xccypuKD86byk/fG4oPzpvKT9cXHMqXFwvXFxzKnkoPzplcyk/KVxccyooPzpcXF18XFwpKVxccyskL2ksXG5cdFx0Ly8gU2FtZSBhcyBhYm92ZSBidXQgYWxsb3dzIGEgcHJlY2VkaW5nICc/JyBvciAnOicgYW5kIG9wdGlvbmFsIHdyYXBwZXJzIGUuZy5cblx0XHQvLyBcIkNvbnRpbnVlPyAoeS9uKVwiIG9yIFwiT3ZlcndyaXRlOiBbeWVzL25vXVwiXG5cdFx0L1s/Ol1cXHMqKD86XFwofFxcWyk/XFxzKnkoPzplcyk/XFxzKlxcL1xccypuKD86byk/XFxzKig/OlxcXXxcXCkpP1xccyskL2ksXG5cdFx0Ly8gQ29uZmlybWF0aW9uIHByb21wdHMgZW5kaW5nIHdpdGggKHkpIGZvbGxvd2VkIGJ5IHRyYWlsaW5nIHNwYWNlLCBlLmcuIFwiT2sgdG8gcHJvY2VlZD8gKHkpIFwiXG5cdFx0Ly8gVGhlIHRyYWlsaW5nIHNwYWNlIGluZGljYXRlcyB0aGUgY3Vyc29yIGlzIHBvc2l0aW9uZWQgYWZ0ZXIgdGhlIHByb21wdCBhd2FpdGluZyBpbnB1dCwgYXNcblx0XHQvLyBvcHBvc2VkIHRvIG5vcm1hbCBjb21tYW5kIG91dHB1dCB0aGF0IGhhcHBlbnMgdG8gY29udGFpbiBcIih5KVwiIGZvbGxvd2VkIGJ5IGEgbmV3bGluZS5cblx0XHQvXFwoeVxcKSArJC9pLFxuXHRcdC8vIFByb21wdCB3aXRoIHBhcmVudGhlc2l6ZWQgZGVmYXVsdCB2YWx1ZSBlLmcuIFwicGFja2FnZSBuYW1lOiAodGVzdCkgXCIgb3IgXCJ2ZXJzaW9uOiAoMS4wLjApIFwiLlxuXHRcdC8vIFJFUVVJUkVTIGF0IGxlYXN0IG9uZSBzcGFjZSBiZXR3ZWVuIHRoZSBjb2xvbiBhbmQgdGhlIG9wZW5pbmcgcGFyZW4gKGBcXHMrYCwgbm90IGBcXHMqYClcblx0XHQvLyBzbyB0aGlzIHJ1bGUgZG9lcyBub3QgbWF0Y2ggZ2l0LWF3YXJlIHNoZWxsIHByb21wdHMgbGlrZVxuXHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdC8vICAgXCJcdTI3OUMgIG15cmVwbyBnaXQ6KG1haW4pIFwiICAgICAgICAgICAgICAgICAgICAob2gtbXktenNoIC8gcm9iYnlydXNzZWxsKVxuXHRcdC8vICAgXCJbdXNlckBob3N0IH4vbXlyZXBvIChtYWluKV0kIFwiXG5cdFx0Ly8gd2hlcmUgdGhlIGNvbG9uIGFidXRzIHRoZSBwYXJlbiB3aXRoIG5vIHNlcGFyYXRvci4gbnBtLWluaXQgLyB5YXJuLWluaXQgc3R5bGVcblx0XHQvLyBwcm9tcHRzIGFsd2F5cyByZW5kZXIgYXQgbGVhc3Qgb25lIHNwYWNlIGFmdGVyIHRoZSBjb2xvbiwgc28gdGhpcyBzdGF5cyBzcGVjaWZpY1xuXHRcdC8vIHdpdGhvdXQgZHJvcHBpbmcgdGhlIGludGVuZGVkIG1hdGNoZXMuXG5cdFx0LzpcXHMrXFwoW14pXSpcXCkgKyQvLFxuXHRcdC8vIExpbmUgY29udGFpbnMgKEVORCkgd2hpY2ggaXMgY29tbW9uIGluIHBhZ2Vyc1xuXHRcdC9cXChFTkRcXCkkLyxcblx0XHQvLyBQYXNzd29yZCBwcm9tcHQuIFJlcXVpcmVzIGEgdHJhaWxpbmcgY29sb24gKGUuZy4gXCJQYXNzd29yZDpcIiwgXCJbc3Vkb10gcGFzc3dvcmQgZm9yIHVzZXI6XCIpXG5cdFx0Ly8gYW5kIHRvbGVyYXRlcyB6ZXJvIG9yIG1vcmUgdHJhaWxpbmcgc3BhY2VzIFx1MjAxNCB4dGVybSdzIGB0cmFuc2xhdGVUb1N0cmluZyh0cmltUmlnaHQ9dHJ1ZSlgXG5cdFx0Ly8gc3RyaXBzIHRyYWlsaW5nIHdoaXRlc3BhY2UgZnJvbSBub24td3JhcHBlZCBidWZmZXIgbGluZXMsIHNvIGEgcmVhbCBgUGFzc3dvcmQ6IGAgcHJvbXB0XG5cdFx0Ly8gaXMgY2FwdHVyZWQgZnJvbSB0aGUgYnVmZmVyIGFzIGBQYXNzd29yZDpgIHdpdGggbm8gdHJhaWxpbmcgc3BhY2UuXG5cdFx0L3Bhc3N3b3JkKD86IGZvciBbXjpdKyk/OlxccyokL2ksXG5cdFx0Ly8gXCJQcmVzcyBhIGtleVwiIG9yIFwiUHJlc3MgYW55IGtleVwiXG5cdFx0L3ByZXNzIGEoPzpueSk/IGtleS9pLFxuXHRcdC8vIEludGVyYWN0aXZlIHByb21wdCBsaWJyYXJpZXMgKHByb21wdHMsIGVucXVpcmVyLCBpbnF1aXJlcikgcHJlZml4IHRoZSBwcm9tcHQgd2l0aFxuXHRcdC8vICc/ICcgYXQgdGhlIHN0YXJ0IG9mIHRoZSBsaW5lIGFuZCBlbmQgd2l0aCBhIGRpc3RpbmN0aXZlIGNoZXZyb24gY2hhcmFjdGVyXG5cdFx0Ly8gZm9sbG93ZWQgYnkgb3B0aW9uYWwgdHJhaWxpbmcgd2hpdGVzcGFjZSB3aGVyZSB0aGUgY3Vyc29yIGlzIGF3YWl0aW5nIGlucHV0LlxuXHRcdC8vIEFuY2hvcmluZyB0aGUgJz8nIHRvIHRoZSBzdGFydCBvZiB0aGUgbGluZSAoYWZ0ZXIgb3B0aW9uYWwgd2hpdGVzcGFjZS9BTlNJXG5cdFx0Ly8gZXNjYXBlcykgYXZvaWRzIGZhbHNlIHBvc2l0aXZlcyBmcm9tIG5vcm1hbCBvdXRwdXQgdGhhdCBjb250YWlucyBib3RoIGEgJz8nXG5cdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0Ly8gYW5kIGEgY2hldnJvbiAoZS5nLiBcIldoYXQgaGFwcGVuZWQ/IFx1MjAzQVwiKS5cblx0XHQvLyBFeGFtcGxlczpcblx0XHQvLyAgIFwiPyBEbyB5b3Ugd2FudCB0byBpbnN0YWxsIGpzZG9tPyA8Y2hldnJvbj5cIiAgKHByb21wdHMpXG5cdFx0Ly8gICBcIj8gUGljayBhIGNvbG9yIDxjaGV2cm9uPiBcIiAgICAgICAgICAgICAgICAgIChlbnF1aXJlcilcblx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHQvXig/Olxcc3xcXHgxYlxcW1swLTk7XSptKSpcXD8uKltcdTIwM0FcdTI3NkZcdTI1QjhcdTI1QjZdXFxzKiQvLFxuXHRdLnNvbWUoZSA9PiBlLnRlc3QoY3Vyc29yTGluZSkpO1xufVxuXG4vKipcbiAqIFN0cmljdCBpbnB1dC1yZXF1aXJlZCBkZXRlY3Rpb24uIFJldHVybnMgdHJ1ZSBvbmx5IGZvciBwYXR0ZXJucyB0aGF0IGFyZVxuICogc3BlY2lmaWMgZW5vdWdoIHRvIGF2b2lkIGZhbHNlIHBvc2l0aXZlcyBvbiBub3JtYWwgY29tbWFuZCBvdXRwdXQgKGJ1aWxkXG4gKiBsb2dzLCBzdGF0dXMgbGluZXMsIGVycm9yIG1lc3NhZ2VzKS4gU2FmZSB0byBjYWxsIGZyb20gYW55IGNvZGUgcGF0aCxcbiAqIGluY2x1ZGluZyB1bmNvbmRpdGlvbmFsbHkgb24gdGhlIGxhc3QgbGluZSBvZiBhIGZpbmlzaGVkIGNvbW1hbmQuXG4gKlxuICogRm9yIHRoZSBicm9hZGVyIGhldXJpc3RpY3MgKGJhcmUgYDpgIC8gYD9gIHdpdGggdHJhaWxpbmcgc3BhY2UpLCB1c2VcbiAqIHtAbGluayBkZXRlY3RzTGlrZWx5SW5wdXRSZXF1aXJlZFBhdHRlcm59IFx1MjAxNCBidXQgb25seSBmcm9tIGEgY2FsbCBzaXRlIHRoYXRcbiAqIGhhcyBpbmRlcGVuZGVudCBldmlkZW5jZSB0aGUgY29tbWFuZCBpcyBzdGlsbCBydW5uaW5nIGFuZCBjb25zdW1pbmcgc3RkaW5cbiAqIChlLmcuIGBleGVjdXRpb24uaXNBY3RpdmUoKSA9PT0gdHJ1ZWApLiBUaG9zZSBicm9hZCBwYXR0ZXJucyBjYW5ub3RcbiAqIHJlbGlhYmx5IGRpc3Rpbmd1aXNoIGEgcmVhbCBwcm9tcHQgbGlrZSBgRW50ZXIgeW91ciBuYW1lOiBgIGZyb20gbG9nXG4gKiBvdXRwdXQgbGlrZSBgTGFzdCBDb21tYW5kOiBgIG9uIGEgc2luZ2xlIGxpbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RzSW5wdXRSZXF1aXJlZFBhdHRlcm4oY3Vyc29yTGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBkZXRlY3RzSGlnaENvbmZpZGVuY2VJbnB1dFBhdHRlcm4oY3Vyc29yTGluZSk7XG59XG5cbi8qKlxuICogU3RyaWN0IHBhdHRlcm5zIHBsdXMgYnJvYWRlciBoZXVyaXN0aWNzIChiYXJlIGA6YCBhbmQgYD9gIHdpdGggdHJhaWxpbmdcbiAqIHNwYWNlKS4gVGhlc2UgYnJvYWQgcGF0dGVybnMgbWF5IHByb2R1Y2UgZmFsc2UgcG9zaXRpdmVzIG9uIG5vcm1hbCBjb21tYW5kXG4gKiBvdXRwdXQgdGhhdCBoYXBwZW5zIHRvIGVuZCB3aXRoIHRob3NlIGNoYXJhY3RlcnMgKGUuZy4gYExhc3QgQ29tbWFuZDogYCxcbiAqIGBbSU5GT10gU3RhcnRpbmc6IGAsIGBmaW5kOiAvdG1wL3g6IE5vIHN1Y2ggZmlsZTogYCkuIFRoZXkgYXJlXG4gKiBzeW50YWN0aWNhbGx5IGluZGlzdGluZ3Vpc2hhYmxlIGZyb20gcmVhbCBwcm9tcHRzIGxpa2UgYEVudGVyIHlvdXIgbmFtZTogYFxuICogb24gYSBzaW5nbGUgY3Vyc29yIGxpbmUuXG4gKlxuICogVGhlcmVmb3JlIHRoaXMgZnVuY3Rpb24gaXMgb25seSBzYWZlIHRvIGNhbGwgd2hlbiB0aGUgY2FsbGVyIGhhc1xuICogaW5kZXBlbmRlbnQgZXZpZGVuY2UgdGhhdCB0aGUgdGVybWluYWwgaXMgY3VycmVudGx5IGNvbnN1bWluZyBzdGRpbiBcdTIwMTRcbiAqIHNwZWNpZmljYWxseSwgYGV4ZWN1dGlvbi5pc0FjdGl2ZSgpID09PSB0cnVlYCBhdCBhIG1vbWVudCB3aGVuIHRoZSBvdXRwdXRcbiAqIHN0cmVhbSBoYXMgYmVlbiBxdWlldCAoaWRsZSkgZm9yIHNldmVyYWwgcG9sbCBpbnRlcnZhbHMuIGBfd2FpdEZvcklkbGVgXG4gKiBhcHBsaWVzIHRoYXQgZ2F0ZTsgbmV3IGNhbGwgc2l0ZXMgc2hvdWxkIHByZXNlcnZlIGl0LlxuICpcbiAqIEZvciB1bmNvbmRpdGlvbmFsIGNoZWNrcyAoZS5nLiBvbiB0aGUgbGFzdCBsaW5lIG9mIGEgZmluaXNoZWQgY29tbWFuZCksXG4gKiB1c2Uge0BsaW5rIGRldGVjdHNJbnB1dFJlcXVpcmVkUGF0dGVybn0gaW5zdGVhZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdHNMaWtlbHlJbnB1dFJlcXVpcmVkUGF0dGVybihjdXJzb3JMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGRldGVjdHNIaWdoQ29uZmlkZW5jZUlucHV0UGF0dGVybihjdXJzb3JMaW5lKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBbXG5cdFx0Ly8gTGluZSBlbmRzIHdpdGggJzonIGZvbGxvd2VkIGJ5IGF0IGxlYXN0IG9uZSBzcGFjZS4gVGhlIHRyYWlsaW5nIHNwYWNlIGluZGljYXRlcyBhXG5cdFx0Ly8gd2FpdGluZyBwcm9tcHQgKGN1cnNvciBwb3NpdGlvbmVkIGFmdGVyIHRoZSBjb2xvbikuIEEgYmFyZSAnOlxcbicgYXQgZW5kIG9mIGJ1ZmZlciBpc1xuXHRcdC8vIHVzdWFsbHkgbm9uLXByb21wdCBvdXRwdXQgKGUuZy4gYSBoZWFkZXIgb3IgbG9nIGxpbmUpIGFuZCBtdXN0IG5vdCBtYXRjaC5cblx0XHQvLyBOT1RFOiBUaGlzIGlzIGEgYnJvYWQgcGF0dGVybiBcdTIwMTQgb25seSB1c2Ugd2hlbiB0aGUgY2FsbGVyIGhhcyBpbmRlcGVuZGVudCBldmlkZW5jZVxuXHRcdC8vIChlLmcuIGBpc0FjdGl2ZSA9PT0gdHJ1ZWApIHRoYXQgdGhlIGNvbW1hbmQgaXMgc3RpbGwgY29uc3VtaW5nIHN0ZGluLiBPbiBhIGZpbmlzaGVkXG5cdFx0Ly8gY29tbWFuZCwgbG9nIG91dHB1dCBsaWtlIGBMYXN0IENvbW1hbmQ6IGAgaXMgaW5kaXN0aW5ndWlzaGFibGUgZnJvbSBhIHJlYWwgcHJvbXB0LlxuXHRcdC86ICskLyxcblx0XHQvLyBMaW5lIGVuZHMgd2l0aCAnPycgZm9sbG93ZWQgYnkgYXQgbGVhc3Qgb25lIHNwYWNlIChvcHRpb25hbGx5IGZvbGxvd2VkIGJ5IGFcblx0XHQvLyBwYXJlbnRoZXNpemVkIGhpbnQgbGlrZSBcIkNvbnRpbnVlPyAoeWVzL25vKSBcIikuIFJlcXVpcmluZyB0cmFpbGluZyBzcGFjZSBhdm9pZHNcblx0XHQvLyBtYXRjaGluZyBhcmJpdHJhcnkgY29tbWFuZCBvdXRwdXQgd2hlcmUgYSBsaW5lIGhhcHBlbnMgdG8gZW5kIHdpdGggJz8nLlxuXHRcdC8vIE5PVEU6IFRoaXMgaXMgYSBicm9hZCBwYXR0ZXJuIFx1MjAxNCBzYW1lIGNhbGxlci1zaWRlIGd1YXJkIHJlcXVpcmVkIGFzIGFib3ZlLlxuXHRcdC9cXD8gKig/OlxcKFthLXpcXHNdK1xcKSk/ICskL2ksXG5cdF0uc29tZShlID0+IGUudGVzdChjdXJzb3JMaW5lKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXRlY3RzTm9uSW50ZXJhY3RpdmVIZWxwUGF0dGVybihjdXJzb3JMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIFtcblx0XHQvcHJlc3MgW2g/XVxccyooPzpcXCtcXHMqZW50ZXIpP1xccyp0byAoPzpzaG93fG9wZW58ZGlzcGxheXxnZXR8c2VlKVxccyooPzphdmFpbGFibGUgKT8oPzpoZWxwfGNvbW1hbmRzfG9wdGlvbnMpL2ksXG5cdFx0L3ByZXNzIGhcXHMqKD86b3JcXHMqXFw/KT9cXHMqKD86XFwrXFxzKmVudGVyKT9cXHMqZm9yICg/OmhlbHB8Y29tbWFuZHN8b3B0aW9ucykvaSxcblx0XHQvcHJlc3MgXFw/XFxzKig/OlxcK1xccyplbnRlcik/XFxzKig/OnRvfGZvcik/XFxzKig/OmhlbHB8Y29tbWFuZHN8b3B0aW9uc3xsaXN0KS9pLFxuXHRcdC90eXBlXFxzKltoP11cXHMqKD86XFwrXFxzKmVudGVyKT9cXHMqKD86Zm9yfHRvIHNlZXx0byBzaG93KVxccyooPzpoZWxwfGNvbW1hbmRzfG9wdGlvbnMpL2ksXG5cdFx0L2hpdFxccypbaD9dXFxzKig/OlxcK1xccyplbnRlcik/XFxzKig/OmZvcnx0byBzZWV8dG8gc2hvdylcXHMqKD86aGVscHxjb21tYW5kc3xvcHRpb25zKS9pLFxuXHRcdC9wcmVzcyBvXFxzKig/OlxcK1xccyplbnRlcik/XFxzKig/OnRvfGZvcik/XFxzKig/Om9wZW58bGF1bmNoKSg/OlxccyooPzp0aGUgKT8oPzphcHB8YXBwbGljYXRpb258YnJvd3Nlcil8XFxzK2luXFxzKyg/OnRoZVxccyspP2Jyb3dzZXIpPy9pLFxuXHRcdC9wcmVzcyByXFxzKig/OlxcK1xccyplbnRlcik/XFxzKig/OnRvfGZvcik/XFxzKig/OnJlc3RhcnR8cmVsb2FkfHJlZnJlc2gpKD86XFxzKig/OnRoZSApPyg/OnNlcnZlcnxkZXYgc2VydmVyfHNlcnZpY2UpKT8vaSxcblx0XHQvcHJlc3MgcVxccyooPzpcXCtcXHMqZW50ZXIpP1xccyooPzp0b3xmb3IpP1xccyooPzpxdWl0fGV4aXR8c3RvcCkoPzpcXHMqKD86dGhlICk/KD86c2VydmVyfGFwcHxwcm9jZXNzKSk/L2ksXG5cdFx0L3ByZXNzIHVcXHMqKD86XFwrXFxzKmVudGVyKT9cXHMqKD86dG98Zm9yKT9cXHMqKD86c2hvd3xwcmludHxkaXNwbGF5KVxccyooPzp0aGUgKT8oPzpzZXJ2ZXIgKT91cmxzPy9pXG5cdF0uc29tZShlID0+IGUudGVzdChjdXJzb3JMaW5lKSk7XG59XG5cbi8qKlxuICogTG9jYWxpemVkIHRhc2sgZmluaXNoIG1lc3NhZ2VzIGZyb20gVlMgQ29kZSdzIHRlcm1pbmFsVGFza1N5c3RlbS5cbiAqIFRoZXNlIGFyZSB0aGUgc2FtZSBzdHJpbmdzIHVzZWQgd2hlbiB0YXNrcyBjb21wbGV0ZS5cbiAqL1xuY29uc3QgdGFza0ZpbmlzaE1lc3NhZ2VzID0gW1xuXHQvLyBcIlRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0LlwiXG5cdGxvY2FsaXplKCdjbG9zZVRlcm1pbmFsJywgXCJUZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcywgcHJlc3MgYW55IGtleSB0byBjbG9zZSBpdC5cIiksXG5cdGxvY2FsaXplKCdyZXVzZVRlcm1pbmFsJywgXCJUZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcywgcHJlc3MgYW55IGtleSB0byBjbG9zZSBpdC5cIiksXG5cdC8vIFwiUHJlc3MgYW55IGtleSB0byBjbG9zZSB0aGUgdGVybWluYWwuXCIgKHdpdGggZXhpdCBjb2RlIHBsYWNlaG9sZGVyIHJlbW92ZWQgZm9yIG1hdGNoaW5nKVxuXHRsb2NhbGl6ZSgnZXhpdENvZGUuY2xvc2VUZXJtaW5hbCcsIFwiUHJlc3MgYW55IGtleSB0byBjbG9zZSB0aGUgdGVybWluYWwuXCIpLFxuXHRsb2NhbGl6ZSgnZXhpdENvZGUucmV1c2VUZXJtaW5hbCcsIFwiUHJlc3MgYW55IGtleSB0byBjbG9zZSB0aGUgdGVybWluYWwuXCIpLFxuXHQvLyBQdW5jdHVhdGlvbiB2YXJpYW50OiBcIlRoZSB0ZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcy4gUHJlc3MgYW55IGtleSB0byBjbG9zZS5cIlxuXHRsb2NhbGl6ZSgncmV1c2VUZXJtaW5hbC5wcmVzc0Nsb3NlJywgXCJUaGUgdGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MuIFByZXNzIGFueSBrZXkgdG8gY2xvc2UuXCIpLFxuXTtcblxuY29uc3Qgbm9ybWFsaXplZFRhc2tGaW5pc2hNZXNzYWdlcyA9IHRhc2tGaW5pc2hNZXNzYWdlcy5tYXAobXNnID0+XG5cdG1zZy5yZXBsYWNlKC9bXFxzLiw6OyE/XCInYCgpW1xcXXt9PD5cXC1fL1xcXFxdKy9nLCAnJykudG9Mb3dlckNhc2UoKVxuKTtcblxuLyoqXG4gKiBEZXRlY3RzIFZTIENvZGUncyBzcGVjaWZpYyB0YXNrIGNvbXBsZXRpb24gbWVzc2FnZXMgbGlrZTpcbiAqIC0gXCJQcmVzcyBhbnkga2V5IHRvIGNsb3NlIHRoZSB0ZXJtaW5hbC5cIlxuICogLSBcIlRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0LlwiXG4gKiBUaGVzZSBhcHBlYXIgd2hlbiBhIHRhc2sgZmluaXNoZXMgYW5kIHNob3VsZCBiZSBpZ25vcmVkIGlmIHRoZSB0YXNrIGlzIGRvbmUuXG4gKiBOb3RlOiBUaGVzZSBtZXNzYWdlcyBtYXkgYmUgcHJlZml4ZWQgd2l0aCBcIiAqIFwiIGJ5IFZTIENvZGUgYW5kIG1heSBoYXZlIGxpbmUgd3JhcHBpbmdcbiAqIHRoYXQgY2FuIHNwbGl0IHdvcmRzIGFjcm9zcyBsaW5lcyAoZS5nLiwgXCJ0XFxub1wiIGluc3RlYWQgb2YgXCJ0b1wiKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdHNWU0NvZGVUYXNrRmluaXNoTWVzc2FnZShjdXJzb3JMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Ly8gQmUgdG9sZXJhbnQgdG8gd2hpdGVzcGFjZSwgcHVuY3R1YXRpb24sIGFuZCBsaW5lIHdyYXBwaW5nIHRoYXQgY2FuIHNwbGl0IHdvcmRzIG1pZC13b3JkLlxuXHRjb25zdCBjb21wYWN0ID0gY3Vyc29yTGluZS5yZXBsYWNlKC9bXFxzLiw6OyE/XCInYCgpW1xcXXt9PD5cXC1fL1xcXFxdKy9nLCAnJykudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIG5vcm1hbGl6ZWRUYXNrRmluaXNoTWVzc2FnZXMuc29tZShtc2cgPT4gY29tcGFjdC5pbmNsdWRlcyhtc2cpKTtcbn1cblxuLyoqXG4gKiBEZXRlY3RzIGdlbmVyaWMgXCJwcmVzcyBhbnkga2V5XCIgcHJvbXB0cyBmcm9tIHNjcmlwdHMgKG5vdCBWUyBDb2RlIHRhc2sgbWVzc2FnZXMpLlxuICogVGhlc2Ugc2hvdWxkIHByb21wdCB0aGUgdXNlciB0byBpbnRlcmFjdCB3aXRoIHRoZSB0ZXJtaW5hbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdHNHZW5lcmljUHJlc3NBbnlLZXlQYXR0ZXJuKGN1cnNvckxpbmU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHQvLyBNYXRjaCBcInByZXNzIGFueSBrZXlcIiBidXQgZXhjbHVkZSBWUyBDb2RlIHRhc2stc3BlY2lmaWMgbWVzc2FnZXNcblx0aWYgKGRldGVjdHNWU0NvZGVUYXNrRmluaXNoTWVzc2FnZShjdXJzb3JMaW5lKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gL3ByZXNzIGEoPzpueSk/IGtleS9pLnRlc3QoY3Vyc29yTGluZSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksbUJBQW1CLG9CQUFzQztBQUM5RSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG9CQUFvQjtBQUU3QixTQUFxQyxvQkFBb0IscUJBQXFCO0FBQzlFLFNBQVMsMkJBQTJCO0FBZ0M3QixTQUFTLFlBQVksUUFBb0M7QUFDL0QsTUFBSSxDQUFDLFFBQVE7QUFDWixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sZ0JBQWdCLE9BQU8sUUFBUSxZQUFZLEVBQUU7QUFDbkQsTUFBSSxDQUFDLGVBQWU7QUFDbkIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLGVBQWUsY0FBYyxZQUFZLElBQUk7QUFDbkQsUUFBTSxXQUFXLGlCQUFpQixLQUFLLGdCQUFnQixjQUFjLE1BQU0sZUFBZSxDQUFDO0FBQzNGLFFBQU0scUJBQXFCLFNBQVMsWUFBWSxJQUFJO0FBQ3BELFNBQU8sdUJBQXVCLEtBQUssV0FBVyxTQUFTLE1BQU0scUJBQXFCLENBQUM7QUFDcEY7QUFFTyxJQUFNLGdCQUFOLGNBQTRCLFdBQXFDO0FBQUEsRUErRnZFLFlBQ2tCLFlBQ0EsU0FDakIsbUJBQ0EsT0FDQSxTQUMrQixjQUNPLGFBQ3JDO0FBQ0QsVUFBTTtBQVJXO0FBQ0E7QUFJYztBQUNPO0FBckd2QyxTQUFRLFNBQTZCLG1CQUFtQjtBQTBCeEQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLGlDQUFpQztBQUN6QyxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksa0JBQStCLENBQUM7QUFFekYsU0FBaUIsa0NBQW1FO0FBQUEsTUFDbkYsNEJBQTRCO0FBQUEsTUFDNUIsNEJBQTRCO0FBQUEsTUFDNUIsc0JBQXNCO0FBQUEs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
