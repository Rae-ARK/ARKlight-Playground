import { Barrier } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ProcessPropertyType } from "../../../../platform/terminal/common/terminal.js";
import { AGENT_HOST_SCHEME, fromAgentHostUri } from "../../../../platform/agentHost/common/agentHostUri.js";
import { ActionType } from "../../../../platform/agentHost/common/state/sessionActions.js";
import { TerminalClaimKind } from "../../../../platform/agentHost/common/state/protocol/state.js";
import { StateComponents } from "../../../../platform/agentHost/common/state/sessionState.js";
import { BasePty } from "../common/basePty.js";
var AhpCommandMarkKind = /* @__PURE__ */ ((AhpCommandMarkKind2) => {
  AhpCommandMarkKind2["Executed"] = "s";
  AhpCommandMarkKind2["End"] = "e";
  return AhpCommandMarkKind2;
})(AhpCommandMarkKind || {});
function getAhpCommandMarkId(commandId, kind) {
  return `ahp-${commandId}-${kind}`;
}
function getAhpCommandMarkCode(commandId, kind) {
  return `\x1B]633;SetMark;Id=${getAhpCommandMarkId(commandId, kind)};Hidden\x07`;
}
const COPILOT_SENTINEL_PREFIX = "<<<COPILOT_SENTINEL_";
function isCopilotSentinelCommand(commandLine) {
  return commandLine.includes(COPILOT_SENTINEL_PREFIX);
}
class AgentHostPty extends BasePty {
  constructor(id, _connection, _terminalUri, _options) {
    super(
      id,
      /* shouldPersist */
      false
    );
    this._connection = _connection;
    this._terminalUri = _terminalUri;
    this._options = _options;
    this._startBarrier = new Barrier();
    this._subscriptionDisposables = this._register(new DisposableStore());
    this._initialCwd = "";
    this._onCommandExecuted = this._register(new Emitter());
    this.onCommandExecuted = this._onCommandExecuted.event;
    this._onCommandFinished = this._register(new Emitter());
    this.onCommandFinished = this._onCommandFinished.event;
    this._onSupportsCommandDetection = this._register(new Emitter());
    this.onSupportsCommandDetection = this._onSupportsCommandDetection.event;
    this._supportsCommandDetection = false;
    /**
     * Command IDs for sentinel commands that should be suppressed from shell
     * integration events. When the copilot shell tools fall back to sentinel-
     * based exit code detection, shell integration may also detect the sentinel
     * echo as a real command — we filter those out here.
     */
    this._suppressedCommandIds = /* @__PURE__ */ new Set();
  }
  get supportsCommandDetection() {
    return this._supportsCommandDetection;
  }
  async start() {
    try {
      if (!this._options?.attachOnly) {
        await this._connection.createTerminal({
          channel: this._terminalUri.toString(),
          claim: { kind: TerminalClaimKind.Client, clientId: this._connection.clientId },
          name: this._options?.name,
          cwd: this._resolveCwdForProtocol(this._options?.cwd),
          cols: this._lastDimensions.cols > 0 ? this._lastDimensions.cols : void 0,
          rows: this._lastDimensions.rows > 0 ? this._lastDimensions.rows : void 0
        });
      }
      this._subscriptionRef = this._connection.getSubscription(StateComponents.Terminal, this._terminalUri, "AgentHostPty");
      const subscription = this._subscriptionRef.object;
      if (subscription.value === void 0) {
        await new Promise((resolve) => {
          const listener = subscription.onDidChange(() => {
            listener.dispose();
            resolve();
          });
          this._subscriptionDisposables.add(listener);
        });
      }
      const state = subscription.value;
      if (state.supportsCommandDetection) {
        this._supportsCommandDetection = true;
        this._onSupportsCommandDetection.fire();
      }
      this._replayContent(state.content);
      this._initialCwd = state.cwd?.toString() ?? "";
      this._properties.cwd = this._initialCwd;
      this._properties.initialCwd = this._initialCwd;
      if (state.title) {
        this._properties.title = state.title;
      }
      this._subscriptionDisposables.add(subscription.onDidApplyAction((envelope) => {
        this._handleAction(envelope);
      }));
      this._startBarrier.open();
      this.handleReady({ pid: -1, cwd: this._initialCwd, windowsPty: void 0 });
      return void 0;
    } catch (err) {
      this._startBarrier.open();
      return { message: err instanceof Error ? err.message : String(err) };
    }
  }
  _handleAction(envelope) {
    const action = envelope.action;
    switch (action.type) {
      case ActionType.TerminalData:
        this.handleData(action.data);
        break;
      case ActionType.TerminalExited:
        this.handleExit(action.exitCode);
        break;
      case ActionType.TerminalCwdChanged:
        this._properties.cwd = action.cwd.toString();
        this.handleDidChangeProperty({ type: ProcessPropertyType.Cwd, value: action.cwd.toString() });
        break;
      case ActionType.TerminalTitleChanged:
        this._properties.title = action.title;
        this.handleDidChangeProperty({ type: ProcessPropertyType.Title, value: action.title });
        break;
      case ActionType.TerminalResized:
        if (envelope.origin?.clientId !== this._connection.clientId) {
          this.handleDidChangeProperty({
            type: ProcessPropertyType.OverrideDimensions,
            value: { cols: action.cols, rows: action.rows }
          });
        }
        break;
      case ActionType.TerminalCommandDetectionAvailable:
        if (!this._supportsCommandDetection) {
          this._supportsCommandDetection = true;
          this._onSupportsCommandDetection.fire();
        }
        break;
      case ActionType.TerminalCommandExecuted:
        if (isCopilotSentinelCommand(action.commandLine)) {
          this._suppressedCommandIds.add(action.commandId);
          break;
        }
        this.handleData(getAhpCommandMarkCode(action.commandId, "s" /* Executed */));
        this._onCommandExecuted.fire({
          commandId: action.commandId,
          commandLine: action.commandLine,
          timestamp: action.timestamp
        });
        break;
      case ActionType.TerminalCommandFinished:
        if (this._suppressedCommandIds.delete(action.commandId)) {
          break;
        }
        this.handleData(getAhpCommandMarkCode(action.commandId, "e" /* End */));
        this._onCommandFinished.fire({
          commandId: action.commandId,
          exitCode: action.exitCode,
          durationMs: action.durationMs
        });
        break;
    }
  }
  /**
   * Replays structured terminal content parts from the initial state snapshot.
   * Emits command lifecycle events for command parts so that consumers
   * (e.g. {@link AhpTerminalCommandSource}) can reconstruct command history.
   */
  _replayContent(content) {
    for (const part of content) {
      if (part.type === "unclassified") {
        if (part.value) {
          this.handleData(part.value);
        }
      } else if (part.type === "command") {
        if (isCopilotSentinelCommand(part.commandLine)) {
          continue;
        }
        this.handleData(getAhpCommandMarkCode(part.commandId, "s" /* Executed */));
        this._onCommandExecuted.fire({
          commandId: part.commandId,
          commandLine: part.commandLine,
          timestamp: part.timestamp,
          storedOutput: part.output
        });
        if (part.output) {
          this.handleData(part.output);
        }
        if (part.isComplete) {
          this.handleData(getAhpCommandMarkCode(part.commandId, "e" /* End */));
          this._onCommandFinished.fire({
            commandId: part.commandId,
            exitCode: part.exitCode,
            durationMs: part.durationMs
          });
        }
      }
    }
  }
  /**
   * Resolves a cwd URI for sending over the protocol. Agent-host URIs
   * are unwrapped to their original URI via {@link fromAgentHostUri}.
   */
  _resolveCwdForProtocol(cwd) {
    if (!cwd) {
      return void 0;
    }
    if (cwd.scheme === AGENT_HOST_SCHEME) {
      return fromAgentHostUri(cwd).toString();
    }
    return cwd.toString();
  }
  input(data) {
    if (this._inReplay) {
      return;
    }
    this._startBarrier.wait().then(() => {
      this._connection.dispatch(
        this._terminalUri.toString(),
        { type: ActionType.TerminalInput, data }
      );
    });
  }
  resize(cols, rows) {
    if (this._inReplay || this._lastDimensions.cols === cols && this._lastDimensions.rows === rows) {
      return;
    }
    this._lastDimensions.cols = cols;
    this._lastDimensions.rows = rows;
    this._startBarrier.wait().then(() => {
      this._connection.dispatch(
        this._terminalUri.toString(),
        { type: ActionType.TerminalResized, cols, rows }
      );
    });
  }
  shutdown(_immediate) {
    this._startBarrier.wait().then(() => {
      if (!this._options?.attachOnly) {
        this._connection.disposeTerminal(this._terminalUri);
      }
      this._subscriptionRef?.dispose();
      this._subscriptionRef = void 0;
      this._subscriptionDisposables.clear();
      this.handleExit(void 0);
    });
  }
  async getInitialCwd() {
    return this._initialCwd;
  }
  async getCwd() {
    return this._properties.cwd || this._initialCwd;
  }
  async clearBuffer() {
    this._connection.dispatch(
      this._terminalUri.toString(),
      { type: ActionType.TerminalCleared }
    );
  }
  acknowledgeDataEvent(_charCount) {
  }
  async setUnicodeVersion(_version) {
  }
  processBinary(_data) {
    return Promise.resolve();
  }
  sendSignal(_signal) {
  }
  async refreshProperty(type) {
    return this._properties[type];
  }
  async updateProperty(_type, _value) {
  }
  /**
   * Reconnect this pty to a new agent host connection. Tears down the
   * old subscription and re-subscribes with the new connection, replaying
   * content from the server-side snapshot. Terminal output during the
   * disconnect gap is a stream (not state), so some loss is expected.
   *
   * @returns `true` if reconnection succeeded, `false` otherwise.
   */
  async reconnect(newConnection) {
    this._subscriptionDisposables.clear();
    this._subscriptionRef?.dispose();
    this._subscriptionRef = void 0;
    this._connection = newConnection;
    try {
      this._subscriptionRef = this._connection.getSubscription(StateComponents.Terminal, this._terminalUri, "AgentHostPty");
      const subscription = this._subscriptionRef.object;
      if (subscription.value === void 0) {
        const RECONNECT_HYDRATE_TIMEOUT_MS = 1e4;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            listener.dispose();
            reject(new Error("Reconnect hydration timed out"));
          }, RECONNECT_HYDRATE_TIMEOUT_MS);
          const listener = subscription.onDidChange(() => {
            clearTimeout(timer);
            listener.dispose();
            resolve();
          });
          this._subscriptionDisposables.add(listener);
        });
      }
      const state = subscription.value;
      if (state.supportsCommandDetection && !this._supportsCommandDetection) {
        this._supportsCommandDetection = true;
        this._onSupportsCommandDetection.fire();
      }
      this.handleData("\x1B[2J\x1B[3J\x1B[H");
      this._replayContent(state.content);
      if (state.cwd) {
        this._properties.cwd = state.cwd.toString();
      }
      if (state.title) {
        this._properties.title = state.title;
      }
      this._subscriptionDisposables.add(subscription.onDidApplyAction((envelope) => {
        this._handleAction(envelope);
      }));
      return true;
    } catch (err) {
      console.warn("[AgentHostPty] Reconnection failed:", err instanceof Error ? err.message : String(err));
      return false;
    }
  }
  /** The terminal URI this pty is subscribed to. */
  get terminalUri() {
    return this._terminalUri;
  }
  dispose() {
    this._subscriptionRef?.dispose();
    this._subscriptionRef = void 0;
    super.dispose();
  }
}
export {
  AgentHostPty,
  AhpCommandMarkKind,
  getAhpCommandMarkId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvYWdlbnRIb3N0UHR5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQmFycmllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBJVGVybWluYWxDaGlsZFByb2Nlc3MsIElUZXJtaW5hbExhdW5jaEVycm9yLCBJVGVybWluYWxMYXVuY2hSZXN1bHQsIFByb2Nlc3NQcm9wZXJ0eVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfU0NIRU1FLCBmcm9tQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgQWN0aW9uRW52ZWxvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2xhaW1LaW5kLCB0eXBlIFRlcm1pbmFsQ29udGVudFBhcnQsIHR5cGUgVGVybWluYWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50U3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBTdGF0ZUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBCYXNlUHR5IH0gZnJvbSAnLi4vY29tbW9uL2Jhc2VQdHkuanMnO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIGNyZWF0aW5nIGEgbmV3IHRlcm1pbmFsIG9uIGFuIGFnZW50IGhvc3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFB0eU9wdGlvbnMge1xuXHQvKiogSHVtYW4tcmVhZGFibGUgdGVybWluYWwgbmFtZS4gKi9cblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0LyoqIEluaXRpYWwgd29ya2luZyBkaXJlY3RvcnkgVVJJLiAqL1xuXHRyZWFkb25seSBjd2Q/OiBVUkk7XG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIGF0dGFjaCB0byBhbiBleGlzdGluZyB0ZXJtaW5hbCBvbiB0aGUgYWdlbnQgaG9zdCBpbnN0ZWFkIG9mXG5cdCAqIGNyZWF0aW5nIGEgbmV3IG9uZS4gVGhlIHRlcm1pbmFsIG11c3QgYWxyZWFkeSBleGlzdCBzZXJ2ZXItc2lkZSAoZS5nLlxuXHQgKiBjcmVhdGVkIGJ5IGEgdG9vbCkuIFRoZSBwdHkgd2lsbCBzdWJzY3JpYmUgdG8gaXRzIHN0YXRlIGFuZCByZXBsYXlcblx0ICogY29udGVudCB3aXRob3V0IGNhbGxpbmcgYGNyZWF0ZVRlcm1pbmFsYC5cblx0ICovXG5cdHJlYWRvbmx5IGF0dGFjaE9ubHk/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RQdHlDb21tYW5kRXhlY3V0ZWRFdmVudCB7XG5cdHJlYWRvbmx5IGNvbW1hbmRJZDogc3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kTGluZTogc3RyaW5nO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0LyoqIFRoZSBzdG9yZWQgVlQgb3V0cHV0IGZvciB0aGlzIGNvbW1hbmQgKHByZXNlbnQgZHVyaW5nIGNvbnRlbnQgcmVwbGF5KS4gKi9cblx0cmVhZG9ubHkgc3RvcmVkT3V0cHV0Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RQdHlDb21tYW5kRmluaXNoZWRFdmVudCB7XG5cdHJlYWRvbmx5IGNvbW1hbmRJZDogc3RyaW5nO1xuXHRyZWFkb25seSBleGl0Q29kZT86IG51bWJlcjtcblx0cmVhZG9ubHkgZHVyYXRpb25Ncz86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWhwQ29tbWFuZE1hcmtLaW5kIHtcblx0RXhlY3V0ZWQgPSAncycsXG5cdEVuZCA9ICdlJ1xufVxuXG5cbi8qKlxuICogR2VuZXJhdGVzIHRoZSBtYXJrIElEIHVzZWQgdG8gY29ycmVsYXRlIFNldE1hcmsgVlQgY29kZXMgd2l0aCB4dGVybSBtYXJrZXJzXG4gKiB2aWEge0BsaW5rIElCdWZmZXJNYXJrQ2FwYWJpbGl0eS5nZXRNYXJrfS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFocENvbW1hbmRNYXJrSWQoY29tbWFuZElkOiBzdHJpbmcsIGtpbmQ6IEFocENvbW1hbmRNYXJrS2luZCk6IHN0cmluZyB7XG5cdHJldHVybiBgYWhwLSR7Y29tbWFuZElkfS0ke2tpbmR9YDtcbn1cblxuLyoqIEdlbmVyYXRlcyBhbiBPU0MgNjMzIFNldE1hcmsgc2VxdWVuY2UgZm9yIGFuIEFIUCBjb21tYW5kIGJvdW5kYXJ5LiAqL1xuZnVuY3Rpb24gZ2V0QWhwQ29tbWFuZE1hcmtDb2RlKGNvbW1hbmRJZDogc3RyaW5nLCBraW5kOiBBaHBDb21tYW5kTWFya0tpbmQpOiBzdHJpbmcge1xuXHRyZXR1cm4gYFxceDFiXTYzMztTZXRNYXJrO0lkPSR7Z2V0QWhwQ29tbWFuZE1hcmtJZChjb21tYW5kSWQsIGtpbmQpfTtIaWRkZW5cXHgwN2A7XG59XG5cbi8qKlxuICogVGhlIHNlbnRpbmVsIHByZWZpeCB1c2VkIGJ5IGNvcGlsb3Qgc2hlbGwgdG9vbHMgZm9yIGV4aXQgY29kZSBkZXRlY3Rpb24uXG4gKiBXaGVuIHNoZWxsIGludGVncmF0aW9uIGlzIGFjdGl2ZSwgdGhlc2UgaW50ZXJuYWwgc2VudGluZWwgZWNobyBjb21tYW5kc1xuICogZ2V0IGRldGVjdGVkIGFzIHJlYWwgY29tbWFuZHMgXHUyMDE0IHdlIHN1cHByZXNzIHRoZW0gZnJvbSBjb21tYW5kIGV2ZW50cy5cbiAqL1xuY29uc3QgQ09QSUxPVF9TRU5USU5FTF9QUkVGSVggPSAnPDw8Q09QSUxPVF9TRU5USU5FTF8nO1xuXG4vKiogUmV0dXJucyB3aGV0aGVyIGEgY29tbWFuZCBsaW5lIGlzIGEgY29waWxvdCBzZW50aW5lbCBlY2hvLCBub3QgYSByZWFsIHVzZXIgY29tbWFuZC4gKi9cbmZ1bmN0aW9uIGlzQ29waWxvdFNlbnRpbmVsQ29tbWFuZChjb21tYW5kTGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBjb21tYW5kTGluZS5pbmNsdWRlcyhDT1BJTE9UX1NFTlRJTkVMX1BSRUZJWCk7XG59XG5cbi8qKlxuICogQSBwc2V1ZG8tdGVybWluYWwgYmFja2VkIGJ5IGFuIEFnZW50IEhvc3QgUHJvdG9jb2wgdGVybWluYWwgc3Vic2NyaXB0aW9uLlxuICpcbiAqIFVzZXMgYGN1c3RvbVB0eUltcGxlbWVudGF0aW9uYCBvbiBgSVNoZWxsTGF1bmNoQ29uZmlnYCBzbyB0aGVcbiAqIGBUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyYCBieXBhc3NlcyB0aGUgcHR5IGhvc3QgYmFja2VuZCBlbnRpcmVseS5cbiAqXG4gKiBEYXRhIGZsb3c6XG4gKiAgIHRlcm1pbmFsL2RhdGEgICBcdTIxOTIgIG9uUHJvY2Vzc0RhdGFcbiAqICAgdGVybWluYWwvZXhpdGVkIFx1MjE5MiAgb25Qcm9jZXNzRXhpdFxuICogICBpbnB1dChkYXRhKSAgICAgXHUyMTkyICBkaXNwYXRjaCB0ZXJtaW5hbC9pbnB1dFxuICogICByZXNpemUoYyxyKSAgICAgXHUyMTkyICBkaXNwYXRjaCB0ZXJtaW5hbC9yZXNpemVkXG4gKiAgIHNodXRkb3duKCkgICAgICBcdTIxOTIgIGRpc3Bvc2VUZXJtaW5hbCBjb21tYW5kXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RQdHkgZXh0ZW5kcyBCYXNlUHR5IGltcGxlbWVudHMgSVRlcm1pbmFsQ2hpbGRQcm9jZXNzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydEJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJzY3JpcHRpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3N1YnNjcmlwdGlvblJlZjogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248VGVybWluYWxTdGF0ZT4+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbml0aWFsQ3dkID0gJyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Db21tYW5kRXhlY3V0ZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRIb3N0UHR5Q29tbWFuZEV4ZWN1dGVkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkNvbW1hbmRFeGVjdXRlZDogRXZlbnQ8SUFnZW50SG9zdFB0eUNvbW1hbmRFeGVjdXRlZEV2ZW50PiA9IHRoaXMuX29uQ29tbWFuZEV4ZWN1dGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29tbWFuZEZpbmlzaGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50SG9zdFB0eUNvbW1hbmRGaW5pc2hlZEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25Db21tYW5kRmluaXNoZWQ6IEV2ZW50PElBZ2VudEhvc3RQdHlDb21tYW5kRmluaXNoZWRFdmVudD4gPSB0aGlzLl9vbkNvbW1hbmRGaW5pc2hlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblN1cHBvcnRzQ29tbWFuZERldGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblN1cHBvcnRzQ29tbWFuZERldGVjdGlvbjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblN1cHBvcnRzQ29tbWFuZERldGVjdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIF9zdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24gPSBmYWxzZTtcblx0Z2V0IHN1cHBvcnRzQ29tbWFuZERldGVjdGlvbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3N1cHBvcnRzQ29tbWFuZERldGVjdGlvbjsgfVxuXG5cdC8qKlxuXHQgKiBDb21tYW5kIElEcyBmb3Igc2VudGluZWwgY29tbWFuZHMgdGhhdCBzaG91bGQgYmUgc3VwcHJlc3NlZCBmcm9tIHNoZWxsXG5cdCAqIGludGVncmF0aW9uIGV2ZW50cy4gV2hlbiB0aGUgY29waWxvdCBzaGVsbCB0b29scyBmYWxsIGJhY2sgdG8gc2VudGluZWwtXG5cdCAqIGJhc2VkIGV4aXQgY29kZSBkZXRlY3Rpb24sIHNoZWxsIGludGVncmF0aW9uIG1heSBhbHNvIGRldGVjdCB0aGUgc2VudGluZWxcblx0ICogZWNobyBhcyBhIHJlYWwgY29tbWFuZCBcdTIwMTQgd2UgZmlsdGVyIHRob3NlIG91dCBoZXJlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3VwcHJlc3NlZENvbW1hbmRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogbnVtYmVyLFxuXHRcdHByaXZhdGUgX2Nvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxVcmk6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zPzogSUFnZW50SG9zdFB0eU9wdGlvbnMsXG5cdCkge1xuXHRcdHN1cGVyKGlkLCAvKiBzaG91bGRQZXJzaXN0ICovIGZhbHNlKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gMS4gQ3JlYXRlIHRoZSB0ZXJtaW5hbCBvbiB0aGUgYWdlbnQgaG9zdCAoc2tpcCBmb3IgYXR0YWNoLW9ubHkgbW9kZVxuXHRcdFx0Ly8gICAgd2hlcmUgdGhlIHRlcm1pbmFsIGFscmVhZHkgZXhpc3RzLCBlLmcuIGNyZWF0ZWQgYnkgYSB0b29sKVxuXHRcdFx0aWYgKCF0aGlzLl9vcHRpb25zPy5hdHRhY2hPbmx5KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3Rpb24uY3JlYXRlVGVybWluYWwoe1xuXHRcdFx0XHRcdGNoYW5uZWw6IHRoaXMuX3Rlcm1pbmFsVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogdGhpcy5fY29ubmVjdGlvbi5jbGllbnRJZCB9LFxuXHRcdFx0XHRcdG5hbWU6IHRoaXMuX29wdGlvbnM/Lm5hbWUsXG5cdFx0XHRcdFx0Y3dkOiB0aGlzLl9yZXNvbHZlQ3dkRm9yUHJvdG9jb2wodGhpcy5fb3B0aW9ucz8uY3dkKSxcblx0XHRcdFx0XHRjb2xzOiB0aGlzLl9sYXN0RGltZW5zaW9ucy5jb2xzID4gMCA/IHRoaXMuX2xhc3REaW1lbnNpb25zLmNvbHMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cm93czogdGhpcy5fbGFzdERpbWVuc2lvbnMucm93cyA+IDAgPyB0aGlzLl9sYXN0RGltZW5zaW9ucy5yb3dzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gMi4gR2V0IGEgc3Vic2NyaXB0aW9uIGZvciB0aGUgdGVybWluYWwgVVJJIChhdXRvLXN1YnNjcmliZXMpXG5cdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25SZWYgPSB0aGlzLl9jb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuVGVybWluYWwsIHRoaXMuX3Rlcm1pbmFsVXJpLCAnQWdlbnRIb3N0UHR5Jyk7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSB0aGlzLl9zdWJzY3JpcHRpb25SZWYub2JqZWN0O1xuXG5cdFx0XHQvLyAzLiBXYWl0IGZvciBoeWRyYXRpb24gdmlhIG9uRGlkQ2hhbmdlLCB0aGVuIHJlcGxheSBzbmFwc2hvdFxuXHRcdFx0aWYgKHN1YnNjcmlwdGlvbi52YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gc3Vic2NyaXB0aW9uLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25EaXNwb3NhYmxlcy5hZGQobGlzdGVuZXIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdWJzY3JpcHRpb24udmFsdWUgYXMgVGVybWluYWxTdGF0ZTtcblxuXHRcdFx0Ly8gNC4gUmVwbGF5IGFueSBleGlzdGluZyBjb250ZW50IGZyb20gdGhlIHNuYXBzaG90XG5cdFx0XHRpZiAoc3RhdGUuc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3N1cHBvcnRzQ29tbWFuZERldGVjdGlvbiA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uU3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uLmZpcmUoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlcGxheUNvbnRlbnQoc3RhdGUuY29udGVudCk7XG5cblx0XHRcdC8vIDUuIFRyYWNrIGluaXRpYWwgY3dkXG5cdFx0XHR0aGlzLl9pbml0aWFsQ3dkID0gc3RhdGUuY3dkPy50b1N0cmluZygpID8/ICcnO1xuXHRcdFx0dGhpcy5fcHJvcGVydGllcy5jd2QgPSB0aGlzLl9pbml0aWFsQ3dkO1xuXHRcdFx0dGhpcy5fcHJvcGVydGllcy5pbml0aWFsQ3dkID0gdGhpcy5faW5pdGlhbEN3ZDtcblx0XHRcdGlmIChzdGF0ZS50aXRsZSkge1xuXHRcdFx0XHR0aGlzLl9wcm9wZXJ0aWVzLnRpdGxlID0gc3RhdGUudGl0bGU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIDYuIFdpcmUgdXAgYWN0aW9uIGxpc3RlbmVyIGZvciBzdHJlYW1pbmcgdXBkYXRlcyB2aWEgdGhlIHN1YnNjcmlwdGlvblxuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uRGlzcG9zYWJsZXMuYWRkKHN1YnNjcmlwdGlvbi5vbkRpZEFwcGx5QWN0aW9uKGVudmVsb3BlID0+IHtcblx0XHRcdFx0dGhpcy5faGFuZGxlQWN0aW9uKGVudmVsb3BlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gNy4gU2lnbmFsIHRoYXQgdGhlIHByb2Nlc3MgaXMgcmVhZHlcblx0XHRcdHRoaXMuX3N0YXJ0QmFycmllci5vcGVuKCk7XG5cdFx0XHR0aGlzLmhhbmRsZVJlYWR5KHsgcGlkOiAtMSwgY3dkOiB0aGlzLl9pbml0aWFsQ3dkLCB3aW5kb3dzUHR5OiB1bmRlZmluZWQgfSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fc3RhcnRCYXJyaWVyLm9wZW4oKTtcblx0XHRcdHJldHVybiB7IG1lc3NhZ2U6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUFjdGlvbihlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb24gPSBlbnZlbG9wZS5hY3Rpb247XG5cdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YTpcblx0XHRcdFx0dGhpcy5oYW5kbGVEYXRhKGFjdGlvbi5kYXRhKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxFeGl0ZWQ6XG5cdFx0XHRcdHRoaXMuaGFuZGxlRXhpdChhY3Rpb24uZXhpdENvZGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbEN3ZENoYW5nZWQ6XG5cdFx0XHRcdHRoaXMuX3Byb3BlcnRpZXMuY3dkID0gYWN0aW9uLmN3ZC50b1N0cmluZygpO1xuXHRcdFx0XHR0aGlzLmhhbmRsZURpZENoYW5nZVByb3BlcnR5KHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5Dd2QsIHZhbHVlOiBhY3Rpb24uY3dkLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsVGl0bGVDaGFuZ2VkOlxuXHRcdFx0XHR0aGlzLl9wcm9wZXJ0aWVzLnRpdGxlID0gYWN0aW9uLnRpdGxlO1xuXHRcdFx0XHR0aGlzLmhhbmRsZURpZENoYW5nZVByb3BlcnR5KHsgdHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5UaXRsZSwgdmFsdWU6IGFjdGlvbi50aXRsZSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxSZXNpemVkOlxuXHRcdFx0XHQvLyBPbmx5IGFwcGx5IHJlc2l6ZSBmcm9tIG90aGVyIGNsaWVudHMgXHUyMDE0IHRoaXMgY2xpZW50IG93bnNcblx0XHRcdFx0Ly8gaXRzIG93biBkaW1lbnNpb25zIGFuZCBlY2hvaW5nIGJhY2sgb3VyIG93biByZXNpemUgd291bGRcblx0XHRcdFx0Ly8gY2F1c2UgYSBmZWVkYmFjayBsb29wLlxuXHRcdFx0XHRpZiAoZW52ZWxvcGUub3JpZ2luPy5jbGllbnRJZCAhPT0gdGhpcy5fY29ubmVjdGlvbi5jbGllbnRJZCkge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlRGlkQ2hhbmdlUHJvcGVydHkoe1xuXHRcdFx0XHRcdFx0dHlwZTogUHJvY2Vzc1Byb3BlcnR5VHlwZS5PdmVycmlkZURpbWVuc2lvbnMsXG5cdFx0XHRcdFx0XHR2YWx1ZTogeyBjb2xzOiBhY3Rpb24uY29scywgcm93czogYWN0aW9uLnJvd3MgfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmREZXRlY3Rpb25BdmFpbGFibGU6XG5cdFx0XHRcdGlmICghdGhpcy5fc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9vblN1cHBvcnRzQ29tbWFuZERldGVjdGlvbi5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQ6XG5cdFx0XHRcdGlmIChpc0NvcGlsb3RTZW50aW5lbENvbW1hbmQoYWN0aW9uLmNvbW1hbmRMaW5lKSkge1xuXHRcdFx0XHRcdHRoaXMuX3N1cHByZXNzZWRDb21tYW5kSWRzLmFkZChhY3Rpb24uY29tbWFuZElkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmhhbmRsZURhdGEoZ2V0QWhwQ29tbWFuZE1hcmtDb2RlKGFjdGlvbi5jb21tYW5kSWQsIEFocENvbW1hbmRNYXJrS2luZC5FeGVjdXRlZCkpO1xuXHRcdFx0XHR0aGlzLl9vbkNvbW1hbmRFeGVjdXRlZC5maXJlKHtcblx0XHRcdFx0XHRjb21tYW5kSWQ6IGFjdGlvbi5jb21tYW5kSWQsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IGFjdGlvbi5jb21tYW5kTGluZSxcblx0XHRcdFx0XHR0aW1lc3RhbXA6IGFjdGlvbi50aW1lc3RhbXAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRGaW5pc2hlZDpcblx0XHRcdFx0aWYgKHRoaXMuX3N1cHByZXNzZWRDb21tYW5kSWRzLmRlbGV0ZShhY3Rpb24uY29tbWFuZElkKSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuaGFuZGxlRGF0YShnZXRBaHBDb21tYW5kTWFya0NvZGUoYWN0aW9uLmNvbW1hbmRJZCwgQWhwQ29tbWFuZE1hcmtLaW5kLkVuZCkpO1xuXHRcdFx0XHR0aGlzLl9vbkNvbW1hbmRGaW5pc2hlZC5maXJlKHtcblx0XHRcdFx0XHRjb21tYW5kSWQ6IGFjdGlvbi5jb21tYW5kSWQsXG5cdFx0XHRcdFx0ZXhpdENvZGU6IGFjdGlvbi5leGl0Q29kZSxcblx0XHRcdFx0XHRkdXJhdGlvbk1zOiBhY3Rpb24uZHVyYXRpb25Ncyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBsYXlzIHN0cnVjdHVyZWQgdGVybWluYWwgY29udGVudCBwYXJ0cyBmcm9tIHRoZSBpbml0aWFsIHN0YXRlIHNuYXBzaG90LlxuXHQgKiBFbWl0cyBjb21tYW5kIGxpZmVjeWNsZSBldmVudHMgZm9yIGNvbW1hbmQgcGFydHMgc28gdGhhdCBjb25zdW1lcnNcblx0ICogKGUuZy4ge0BsaW5rIEFocFRlcm1pbmFsQ29tbWFuZFNvdXJjZX0pIGNhbiByZWNvbnN0cnVjdCBjb21tYW5kIGhpc3RvcnkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXBsYXlDb250ZW50KGNvbnRlbnQ6IFRlcm1pbmFsQ29udGVudFBhcnRbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiBjb250ZW50KSB7XG5cdFx0XHRpZiAocGFydC50eXBlID09PSAndW5jbGFzc2lmaWVkJykge1xuXHRcdFx0XHRpZiAocGFydC52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlRGF0YShwYXJ0LnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICdjb21tYW5kJykge1xuXHRcdFx0XHRpZiAoaXNDb3BpbG90U2VudGluZWxDb21tYW5kKHBhcnQuY29tbWFuZExpbmUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5oYW5kbGVEYXRhKGdldEFocENvbW1hbmRNYXJrQ29kZShwYXJ0LmNvbW1hbmRJZCwgQWhwQ29tbWFuZE1hcmtLaW5kLkV4ZWN1dGVkKSk7XG5cdFx0XHRcdHRoaXMuX29uQ29tbWFuZEV4ZWN1dGVkLmZpcmUoe1xuXHRcdFx0XHRcdGNvbW1hbmRJZDogcGFydC5jb21tYW5kSWQsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmU6IHBhcnQuY29tbWFuZExpbmUsXG5cdFx0XHRcdFx0dGltZXN0YW1wOiBwYXJ0LnRpbWVzdGFtcCxcblx0XHRcdFx0XHRzdG9yZWRPdXRwdXQ6IHBhcnQub3V0cHV0LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKHBhcnQub3V0cHV0KSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVEYXRhKHBhcnQub3V0cHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGFydC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVEYXRhKGdldEFocENvbW1hbmRNYXJrQ29kZShwYXJ0LmNvbW1hbmRJZCwgQWhwQ29tbWFuZE1hcmtLaW5kLkVuZCkpO1xuXHRcdFx0XHRcdHRoaXMuX29uQ29tbWFuZEZpbmlzaGVkLmZpcmUoe1xuXHRcdFx0XHRcdFx0Y29tbWFuZElkOiBwYXJ0LmNvbW1hbmRJZCxcblx0XHRcdFx0XHRcdGV4aXRDb2RlOiBwYXJ0LmV4aXRDb2RlLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb25NczogcGFydC5kdXJhdGlvbk1zLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgY3dkIFVSSSBmb3Igc2VuZGluZyBvdmVyIHRoZSBwcm90b2NvbC4gQWdlbnQtaG9zdCBVUklzXG5cdCAqIGFyZSB1bndyYXBwZWQgdG8gdGhlaXIgb3JpZ2luYWwgVVJJIHZpYSB7QGxpbmsgZnJvbUFnZW50SG9zdFVyaX0uXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQ3dkRm9yUHJvdG9jb2woY3dkOiBVUkkgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghY3dkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoY3dkLnNjaGVtZSA9PT0gQUdFTlRfSE9TVF9TQ0hFTUUpIHtcblx0XHRcdHJldHVybiBmcm9tQWdlbnRIb3N0VXJpKGN3ZCkudG9TdHJpbmcoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGN3ZC50b1N0cmluZygpO1xuXHR9XG5cblx0aW5wdXQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luUmVwbGF5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXJ0QmFycmllci53YWl0KCkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uLmRpc3BhdGNoKFxuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxJbnB1dCwgZGF0YSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHJlc2l6ZShjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pblJlcGxheSB8fCAodGhpcy5fbGFzdERpbWVuc2lvbnMuY29scyA9PT0gY29scyAmJiB0aGlzLl9sYXN0RGltZW5zaW9ucy5yb3dzID09PSByb3dzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0RGltZW5zaW9ucy5jb2xzID0gY29scztcblx0XHR0aGlzLl9sYXN0RGltZW5zaW9ucy5yb3dzID0gcm93cztcblx0XHR0aGlzLl9zdGFydEJhcnJpZXIud2FpdCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29ubmVjdGlvbi5kaXNwYXRjaChcblx0XHRcdFx0dGhpcy5fdGVybWluYWxVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsUmVzaXplZCwgY29scywgcm93cyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHNodXRkb3duKF9pbW1lZGlhdGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zdGFydEJhcnJpZXIud2FpdCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Ly8gSW4gYXR0YWNoLW9ubHkgbW9kZSwgZG9uJ3QgZGlzcG9zZSB0aGUgc2VydmVyLXNpZGUgdGVybWluYWwgXHUyMDE0XG5cdFx0XHQvLyBpdCdzIG93bmVkIGJ5IHRoZSB0b29sL3Nlc3Npb24sIG5vdCBieSB0aGlzIGNsaWVudC5cblx0XHRcdGlmICghdGhpcy5fb3B0aW9ucz8uYXR0YWNoT25seSkge1xuXHRcdFx0XHR0aGlzLl9jb25uZWN0aW9uLmRpc3Bvc2VUZXJtaW5hbCh0aGlzLl90ZXJtaW5hbFVyaSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25SZWY/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmhhbmRsZUV4aXQodW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbEN3ZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGdldEN3ZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzLmN3ZCB8fCB0aGlzLl9pbml0aWFsQ3dkO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJCdWZmZXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gU2VuZCBhIGNsZWFyIGFjdGlvbiB0byB0aGUgYWdlbnQgaG9zdFxuXHRcdHRoaXMuX2Nvbm5lY3Rpb24uZGlzcGF0Y2goXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFVyaS50b1N0cmluZygpLFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ2xlYXJlZCB9LFxuXHRcdCk7XG5cdH1cblxuXHRhY2tub3dsZWRnZURhdGFFdmVudChfY2hhckNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBObyBmbG93IGNvbnRyb2wgbmVlZGVkIGZvciBBSFAgdGVybWluYWxzXG5cdH1cblxuXHRhc3luYyBzZXRVbmljb2RlVmVyc2lvbihfdmVyc2lvbjogJzYnIHwgJzExJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE5vdCBhcHBsaWNhYmxlXG5cdH1cblxuXHRwcm9jZXNzQmluYXJ5KF9kYXRhOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBOb3QgYXBwbGljYWJsZVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHNlbmRTaWduYWwoX3NpZ25hbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gTm90IGFwcGxpY2FibGVcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2hQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4odHlwZTogVCk6IFByb21pc2U8SVByb2Nlc3NQcm9wZXJ0eU1hcFtUXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzW3R5cGVdO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KF90eXBlOiBULCBfdmFsdWU6IElQcm9jZXNzUHJvcGVydHlNYXBbVF0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBOb3QgYXBwbGljYWJsZVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29ubmVjdCB0aGlzIHB0eSB0byBhIG5ldyBhZ2VudCBob3N0IGNvbm5lY3Rpb24uIFRlYXJzIGRvd24gdGhlXG5cdCAqIG9sZCBzdWJzY3JpcHRpb24gYW5kIHJlLXN1YnNjcmliZXMgd2l0aCB0aGUgbmV3IGNvbm5lY3Rpb24sIHJlcGxheWluZ1xuXHQgKiBjb250ZW50IGZyb20gdGhlIHNlcnZlci1zaWRlIHNuYXBzaG90LiBUZXJtaW5hbCBvdXRwdXQgZHVyaW5nIHRoZVxuXHQgKiBkaXNjb25uZWN0IGdhcCBpcyBhIHN0cmVhbSAobm90IHN0YXRlKSwgc28gc29tZSBsb3NzIGlzIGV4cGVjdGVkLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBgdHJ1ZWAgaWYgcmVjb25uZWN0aW9uIHN1Y2NlZWRlZCwgYGZhbHNlYCBvdGhlcndpc2UuXG5cdCAqL1xuXHRhc3luYyByZWNvbm5lY3QobmV3Q29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIENsZWFuIHVwIG9sZCBzdWJzY3JpcHRpb25cblx0XHR0aGlzLl9zdWJzY3JpcHRpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZiA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFN3YXAgY29ubmVjdGlvblxuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSBuZXdDb25uZWN0aW9uO1xuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIFJlLXN1YnNjcmliZSB0byB0aGUgdGVybWluYWwgc3RhdGVcblx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZiA9IHRoaXMuX2Nvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5UZXJtaW5hbCwgdGhpcy5fdGVybWluYWxVcmksICdBZ2VudEhvc3RQdHknKTtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHRoaXMuX3N1YnNjcmlwdGlvblJlZi5vYmplY3Q7XG5cblx0XHRcdC8vIFdhaXQgZm9yIGh5ZHJhdGlvbiB3aXRoIGEgdGltZW91dCBcdTIwMTQgdGhlIHRlcm1pbmFsIG1heSBubyBsb25nZXJcblx0XHRcdC8vIGV4aXN0IG9uIHRoZSBzZXJ2ZXIgKGUuZy4gYWdlbnQgcHJvY2VzcyByZXN0YXJ0ZWQpLlxuXHRcdFx0aWYgKHN1YnNjcmlwdGlvbi52YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IFJFQ09OTkVDVF9IWURSQVRFX1RJTUVPVVRfTVMgPSAxMF8wMDA7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignUmVjb25uZWN0IGh5ZHJhdGlvbiB0aW1lZCBvdXQnKSk7XG5cdFx0XHRcdFx0fSwgUkVDT05ORUNUX0hZRFJBVEVfVElNRU9VVF9NUyk7XG5cdFx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBzdWJzY3JpcHRpb24ub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25EaXNwb3NhYmxlcy5hZGQobGlzdGVuZXIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdWJzY3JpcHRpb24udmFsdWUgYXMgVGVybWluYWxTdGF0ZTtcblxuXHRcdFx0aWYgKHN0YXRlLnN1cHBvcnRzQ29tbWFuZERldGVjdGlvbiAmJiAhdGhpcy5fc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3N1cHBvcnRzQ29tbWFuZERldGVjdGlvbiA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX29uU3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uLmZpcmUoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYXIgdGhlIHRlcm1pbmFsIGJ1ZmZlciBiZWZvcmUgcmVwbGF5aW5nIHRvIGF2b2lkIGR1cGxpY2F0ZVxuXHRcdFx0Ly8gY29udGVudC4gRVNDWzJKIGNsZWFycyB0aGUgc2NyZWVuLCBFU0NbM0ogY2xlYXJzIHNjcm9sbGJhY2ssXG5cdFx0XHQvLyBFU0NbSCBtb3ZlcyBjdXJzb3IgdG8gaG9tZSBwb3NpdGlvbi5cblx0XHRcdHRoaXMuaGFuZGxlRGF0YSgnXFx4MWJbMkpcXHgxYlszSlxceDFiW0gnKTtcblx0XHRcdHRoaXMuX3JlcGxheUNvbnRlbnQoc3RhdGUuY29udGVudCk7XG5cblx0XHRcdC8vIFVwZGF0ZSBjd2QvdGl0bGUgaWYgdGhleSBjaGFuZ2VkXG5cdFx0XHRpZiAoc3RhdGUuY3dkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3BlcnRpZXMuY3dkID0gc3RhdGUuY3dkLnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUudGl0bGUpIHtcblx0XHRcdFx0dGhpcy5fcHJvcGVydGllcy50aXRsZSA9IHN0YXRlLnRpdGxlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaXJlIHVwIGFjdGlvbiBsaXN0ZW5lciBmb3Igc3RyZWFtaW5nIHVwZGF0ZXNcblx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvbkRpc3Bvc2FibGVzLmFkZChzdWJzY3JpcHRpb24ub25EaWRBcHBseUFjdGlvbihlbnZlbG9wZSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUFjdGlvbihlbnZlbG9wZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS53YXJuKCdbQWdlbnRIb3N0UHR5XSBSZWNvbm5lY3Rpb24gZmFpbGVkOicsIGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFRoZSB0ZXJtaW5hbCBVUkkgdGhpcyBwdHkgaXMgc3Vic2NyaWJlZCB0by4gKi9cblx0Z2V0IHRlcm1pbmFsVXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsVXJpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb25SZWY/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb25SZWYgPSB1bmRlZmluZWQ7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVCQUFtQztBQUU1QyxTQUFrRywyQkFBMkI7QUFFN0gsU0FBUyxtQkFBbUIsd0JBQXdCO0FBQ3BELFNBQVMsa0JBQWtDO0FBQzNDLFNBQVMseUJBQXVFO0FBRWhGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQWlDakIsSUFBVyxxQkFBWCxrQkFBV0Esd0JBQVg7QUFDTixFQUFBQSxvQkFBQSxjQUFXO0FBQ1gsRUFBQUEsb0JBQUEsU0FBTTtBQUZXLFNBQUFBO0FBQUEsR0FBQTtBQVVYLFNBQVMsb0JBQW9CLFdBQW1CLE1BQWtDO0FBQ3hGLFNBQU8sT0FBTyxTQUFTLElBQUksSUFBSTtBQUNoQztBQUdBLFNBQVMsc0JBQXNCLFdBQW1CLE1BQWtDO0FBQ25GLFNBQU8sdUJBQXVCLG9CQUFvQixXQUFXLElBQUksQ0FBQztBQUNuRTtBQU9BLE1BQU0sMEJBQTBCO0FBR2hDLFNBQVMseUJBQXlCLGFBQThCO0FBQy9ELFNBQU8sWUFBWSxTQUFTLHVCQUF1QjtBQUNwRDtBQWVPLE1BQU0scUJBQXFCLFFBQXlDO0FBQUEsRUEyQjFFLFlBQ0MsSUFDUSxhQUNTLGNBQ0EsVUFDaEI7QUFDRDtBQUFBLE1BQU07QUFBQTtBQUFBLE1BQXdCO0FBQUEsSUFBSztBQUozQjtBQUNTO0FBQ0E7QUE3QmxCLFNBQWlCLGdCQUFnQixJQUFJLFFBQVE7QUFDN0MsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRWhGLFNBQVEsY0FBYztBQUV0QixTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBMkMsQ0FBQztBQUNyRyxTQUFTLG9CQUE4RCxLQUFLLG1CQUFtQjtBQUUvRixTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBMkMsQ0FBQztBQUNyRyxT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
