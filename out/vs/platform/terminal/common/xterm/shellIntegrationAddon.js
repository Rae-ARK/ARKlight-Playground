import { ShellIntegrationStatus } from "../terminal.js";
import { Disposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { TerminalCapabilityStore } from "../capabilities/terminalCapabilityStore.js";
import { CommandDetectionCapability } from "../capabilities/commandDetectionCapability.js";
import { CwdDetectionCapability } from "../capabilities/cwdDetectionCapability.js";
import { TerminalCapability } from "../capabilities/capabilities.js";
import { PartialCommandDetectionCapability } from "../capabilities/partialCommandDetectionCapability.js";
import { Emitter } from "../../../../base/common/event.js";
import { BufferMarkCapability } from "../capabilities/bufferMarkCapability.js";
import { URI } from "../../../../base/common/uri.js";
import { sanitizeCwd } from "../terminalEnvironment.js";
import { removeAnsiEscapeCodesFromPrompt } from "../../../../base/common/strings.js";
import { ShellEnvDetectionCapability } from "../capabilities/shellEnvDetectionCapability.js";
import { PromptTypeDetectionCapability } from "../capabilities/promptTypeDetectionCapability.js";
var ShellIntegrationOscPs = /* @__PURE__ */ ((ShellIntegrationOscPs2) => {
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["FinalTerm"] = 133] = "FinalTerm";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["VSCode"] = 633] = "VSCode";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["ITerm"] = 1337] = "ITerm";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["SetCwd"] = 7] = "SetCwd";
  ShellIntegrationOscPs2[ShellIntegrationOscPs2["SetWindowsFriendlyCwd"] = 9] = "SetWindowsFriendlyCwd";
  return ShellIntegrationOscPs2;
})(ShellIntegrationOscPs || {});
var FinalTermOscPt = /* @__PURE__ */ ((FinalTermOscPt2) => {
  FinalTermOscPt2["PromptStart"] = "A";
  FinalTermOscPt2["CommandStart"] = "B";
  FinalTermOscPt2["CommandExecuted"] = "C";
  FinalTermOscPt2["CommandFinished"] = "D";
  return FinalTermOscPt2;
})(FinalTermOscPt || {});
var VSCodeOscPt = /* @__PURE__ */ ((VSCodeOscPt2) => {
  VSCodeOscPt2["PromptStart"] = "A";
  VSCodeOscPt2["CommandStart"] = "B";
  VSCodeOscPt2["CommandExecuted"] = "C";
  VSCodeOscPt2["CommandFinished"] = "D";
  VSCodeOscPt2["CommandLine"] = "E";
  VSCodeOscPt2["ContinuationStart"] = "F";
  VSCodeOscPt2["ContinuationEnd"] = "G";
  VSCodeOscPt2["RightPromptStart"] = "H";
  VSCodeOscPt2["RightPromptEnd"] = "I";
  VSCodeOscPt2["Property"] = "P";
  VSCodeOscPt2["SetMark"] = "SetMark";
  VSCodeOscPt2["EnvJson"] = "EnvJson";
  VSCodeOscPt2["EnvSingleDelete"] = "EnvSingleDelete";
  VSCodeOscPt2["EnvSingleStart"] = "EnvSingleStart";
  VSCodeOscPt2["EnvSingleEntry"] = "EnvSingleEntry";
  VSCodeOscPt2["EnvSingleEnd"] = "EnvSingleEnd";
  return VSCodeOscPt2;
})(VSCodeOscPt || {});
var ITermOscPt = /* @__PURE__ */ ((ITermOscPt2) => {
  ITermOscPt2["SetMark"] = "SetMark";
  ITermOscPt2["CurrentDir"] = "CurrentDir";
  return ITermOscPt2;
})(ITermOscPt || {});
class ShellIntegrationAddon extends Disposable {
  constructor(_nonce, _disableTelemetry, _onDidExecuteText, _telemetryService, _logService) {
    super();
    this._nonce = _nonce;
    this._disableTelemetry = _disableTelemetry;
    this._onDidExecuteText = _onDidExecuteText;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this.capabilities = this._register(new TerminalCapabilityStore());
    this._hasUpdatedTelemetry = false;
    this._commonProtocolDisposables = [];
    this._seenSequences = /* @__PURE__ */ new Set();
    this._status = ShellIntegrationStatus.Off;
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this._onDidChangeSeenSequences = this._register(new Emitter());
    this.onDidChangeSeenSequences = this._onDidChangeSeenSequences.event;
    this._register(toDisposable(() => {
      this._clearActivationTimeout();
      this._disposeCommonProtocol();
    }));
  }
  get seenSequences() {
    return this._seenSequences;
  }
  get status() {
    return this._status;
  }
  _disposeCommonProtocol() {
    dispose(this._commonProtocolDisposables);
    this._commonProtocolDisposables.length = 0;
  }
  activate(xterm) {
    this._terminal = xterm;
    this.capabilities.add(TerminalCapability.PartialCommandDetection, this._register(new PartialCommandDetectionCapability(this._terminal, this._onDidExecuteText)));
    this._register(xterm.parser.registerOscHandler(633 /* VSCode */, (data) => this._handleVSCodeSequence(data)));
    this._register(xterm.parser.registerOscHandler(1337 /* ITerm */, (data) => this._doHandleITermSequence(data)));
    this._commonProtocolDisposables.push(
      xterm.parser.registerOscHandler(133 /* FinalTerm */, (data) => this._handleFinalTermSequence(data))
    );
    this._register(xterm.parser.registerOscHandler(7 /* SetCwd */, (data) => this._doHandleSetCwd(data)));
    this._register(xterm.parser.registerOscHandler(9 /* SetWindowsFriendlyCwd */, (data) => this._doHandleSetWindowsFriendlyCwd(data)));
    this._ensureCapabilitiesOrAddFailureTelemetry();
  }
  getMarkerId(terminal, vscodeMarkerId) {
    this._createOrGetBufferMarkDetection(terminal).getMark(vscodeMarkerId);
  }
  setNextCommandId(command, commandId) {
    if (this._terminal) {
      this._createOrGetCommandDetection(this._terminal).setNextCommandId(command, commandId);
    }
  }
  _markSequenceSeen(sequence) {
    if (!this._seenSequences.has(sequence)) {
      this._seenSequences.add(sequence);
      this._onDidChangeSeenSequences.fire(this._seenSequences);
    }
  }
  _handleFinalTermSequence(data) {
    const didHandle = this._doHandleFinalTermSequence(data);
    if (this._status === ShellIntegrationStatus.Off) {
      this._status = ShellIntegrationStatus.FinalTerm;
      this._onDidChangeStatus.fire(this._status);
    }
    return didHandle;
  }
  _doHandleFinalTermSequence(data) {
    if (!this._terminal) {
      return false;
    }
    const [command, ...args] = data.split(";");
    this._logService.trace(`ShellIntegrationAddon#_doHandleFinalTermSequence: received sequence ${command}`);
    this._markSequenceSeen(command);
    switch (command) {
      case "A" /* PromptStart */:
        this._createOrGetCommandDetection(this._terminal).handlePromptStart();
        return true;
      case "B" /* CommandStart */:
        this._createOrGetCommandDetection(this._terminal).handleCommandStart({ ignoreCommandLine: true });
        return true;
      case "C" /* CommandExecuted */:
        this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
        return true;
      case "D" /* CommandFinished */: {
        const exitCode = args.length === 1 ? parseInt(args[0]) : void 0;
        this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
        return true;
      }
    }
    return false;
  }
  _handleVSCodeSequence(data) {
    const didHandle = this._doHandleVSCodeSequence(data);
    if (!this._hasUpdatedTelemetry && didHandle) {
      this._telemetryService?.publicLog2("terminal/shellIntegrationActivationSucceeded");
      this._hasUpdatedTelemetry = true;
      this._clearActivationTimeout();
    }
    if (this._status !== ShellIntegrationStatus.VSCode) {
      this._status = ShellIntegrationStatus.VSCode;
      this._onDidChangeStatus.fire(this._status);
    }
    return didHandle;
  }
  async _ensureCapabilitiesOrAddFailureTelemetry() {
    if (!this._telemetryService || this._disableTelemetry) {
      return;
    }
    this._activationTimeout = setTimeout(() => {
      if (!this.capabilities.get(TerminalCapability.CommandDetection) && !this.capabilities.get(TerminalCapability.CwdDetection)) {
        this._telemetryService?.publicLog2("terminal/shellIntegrationActivationTimeout");
        this._logService.warn("Shell integration failed to add capabilities within 10 seconds");
      }
      this._hasUpdatedTelemetry = true;
    }, 1e4);
  }
  _clearActivationTimeout() {
    if (this._activationTimeout !== void 0) {
      clearTimeout(this._activationTimeout);
      this._activationTimeout = void 0;
    }
  }
  _doHandleVSCodeSequence(data) {
    if (!this._terminal) {
      return false;
    }
    const argsIndex = data.indexOf(";");
    const command = argsIndex === -1 ? data : data.substring(0, argsIndex);
    this._logService.trace(`ShellIntegrationAddon#_doHandleVSCodeSequence: received sequence ${command}`);
    this._markSequenceSeen(command);
    const args = argsIndex === -1 ? [] : data.substring(argsIndex + 1).split(";");
    switch (command) {
      case "A" /* PromptStart */:
        this._createOrGetCommandDetection(this._terminal).handlePromptStart();
        return true;
      case "B" /* CommandStart */:
        this._createOrGetCommandDetection(this._terminal).handleCommandStart();
        return true;
      case "C" /* CommandExecuted */:
        this._createOrGetCommandDetection(this._terminal).handleCommandExecuted();
        return true;
      case "D" /* CommandFinished */: {
        const arg0 = args[0];
        const exitCode = arg0 !== void 0 ? parseInt(arg0) : void 0;
        this._createOrGetCommandDetection(this._terminal).handleCommandFinished(exitCode);
        return true;
      }
      case "E" /* CommandLine */: {
        const arg0 = args[0];
        const arg1 = args[1];
        let commandLine;
        if (arg0 !== void 0) {
          commandLine = deserializeVSCodeOscMessage(arg0);
        } else {
          commandLine = "";
        }
        this._createOrGetCommandDetection(this._terminal).setCommandLine(commandLine, arg1 === this._nonce);
        return true;
      }
      case "F" /* ContinuationStart */: {
        this._createOrGetCommandDetection(this._terminal).handleContinuationStart();
        return true;
      }
      case "G" /* ContinuationEnd */: {
        this._createOrGetCommandDetection(this._terminal).handleContinuationEnd();
        return true;
      }
      case "EnvJson" /* EnvJson */: {
        const arg0 = args[0];
        const arg1 = args[1];
        if (arg0 !== void 0) {
          try {
            const env = JSON.parse(deserializeVSCodeOscMessage(arg0));
            this._createOrGetShellEnvDetection().setEnvironment(env, arg1 === this._nonce);
          } catch (e) {
            this._logService.warn("Failed to parse environment from shell integration sequence", arg0);
          }
        }
        return true;
      }
      case "EnvSingleStart" /* EnvSingleStart */: {
        this._createOrGetShellEnvDetection().startEnvironmentSingleVar(args[0] === "1", args[1] === this._nonce);
        return true;
      }
      case "EnvSingleDelete" /* EnvSingleDelete */: {
        const arg0 = args[0];
        const arg1 = args[1];
        const arg2 = args[2];
        if (arg0 !== void 0 && arg1 !== void 0) {
          const env = deserializeVSCodeOscMessage(arg1);
          this._createOrGetShellEnvDetection().deleteEnvironmentSingleVar(arg0, env, arg2 === this._nonce);
        }
        return true;
      }
      case "EnvSingleEntry" /* EnvSingleEntry */: {
        const arg0 = args[0];
        const arg1 = args[1];
        const arg2 = args[2];
        if (arg0 !== void 0 && arg1 !== void 0) {
          const env = deserializeVSCodeOscMessage(arg1);
          this._createOrGetShellEnvDetection().setEnvironmentSingleVar(arg0, env, arg2 === this._nonce);
        }
        return true;
      }
      case "EnvSingleEnd" /* EnvSingleEnd */: {
        this._createOrGetShellEnvDetection().endEnvironmentSingleVar(args[0] === this._nonce);
        return true;
      }
      case "H" /* RightPromptStart */: {
        this._createOrGetCommandDetection(this._terminal).handleRightPromptStart();
        return true;
      }
      case "I" /* RightPromptEnd */: {
        this._createOrGetCommandDetection(this._terminal).handleRightPromptEnd();
        return true;
      }
      case "P" /* Property */: {
        const arg0 = args[0];
        const deserialized = arg0 !== void 0 ? deserializeVSCodeOscMessage(arg0) : "";
        const { key, value } = parseKeyValueAssignment(deserialized);
        if (value === void 0) {
          return true;
        }
        switch (key) {
          case "ContinuationPrompt": {
            this._updateContinuationPrompt(removeAnsiEscapeCodesFromPrompt(value));
            return true;
          }
          case "Cwd": {
            const nonce = args[1];
            this._updateCwd(value, nonce !== void 0 && nonce === this._nonce);
            return true;
          }
          case "IsWindows": {
            this._createOrGetCommandDetection(this._terminal).setIsWindowsPty(value === "True" ? true : false);
            return true;
          }
          case "HasRichCommandDetection": {
            this._createOrGetCommandDetection(this._terminal).setHasRichCommandDetection(value === "True" ? true : false);
            return true;
          }
          case "Prompt": {
            const sanitizedValue = value.replace(/\x1b\[[0-9;]*m/g, "");
            this._updatePromptTerminator(sanitizedValue);
            return true;
          }
          case "PromptType": {
            this._createOrGetPromptTypeDetection().setPromptType(value);
            return true;
          }
          case "Task": {
            this._createOrGetBufferMarkDetection(this._terminal);
            this.capabilities.get(TerminalCapability.CommandDetection)?.setIsCommandStorageDisabled();
            return true;
          }
        }
      }
      case "SetMark" /* SetMark */: {
        this._createOrGetBufferMarkDetection(this._terminal).addMark(parseMarkSequence(args));
        return true;
      }
    }
    return false;
  }
  _updateContinuationPrompt(value) {
    if (!this._terminal) {
      return;
    }
    this._createOrGetCommandDetection(this._terminal).setContinuationPrompt(value);
  }
  _updatePromptTerminator(prompt) {
    if (!this._terminal) {
      return;
    }
    const lastPromptLine = prompt.substring(prompt.lastIndexOf("\n") + 1);
    const lastPromptLineTrimmed = lastPromptLine.trim();
    const promptTerminator = lastPromptLineTrimmed.length === 1 ? lastPromptLine : lastPromptLine.substring(lastPromptLine.lastIndexOf(" "));
    if (promptTerminator) {
      this._createOrGetCommandDetection(this._terminal).setPromptTerminator(promptTerminator, lastPromptLine);
    }
  }
  _updateCwd(value, isTrusted = true) {
    value = sanitizeCwd(value);
    this._createOrGetCwdDetection().updateCwd(value, isTrusted);
    const commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
    commandDetection?.setCwd(value);
  }
  _doHandleITermSequence(data) {
    if (!this._terminal) {
      return false;
    }
    const [command] = data.split(";");
    this._markSequenceSeen(`${1337 /* ITerm */};${command}`);
    switch (command) {
      case "SetMark" /* SetMark */: {
        this._createOrGetBufferMarkDetection(this._terminal).addMark();
      }
      default: {
        const { key, value } = parseKeyValueAssignment(command);
        if (value === void 0) {
          return true;
        }
        switch (key) {
          case "CurrentDir" /* CurrentDir */:
            this._updateCwd(value, false);
            return true;
        }
      }
    }
    return false;
  }
  _doHandleSetWindowsFriendlyCwd(data) {
    if (!this._terminal) {
      return false;
    }
    const [command, ...args] = data.split(";");
    this._markSequenceSeen(`${9 /* SetWindowsFriendlyCwd */};${command}`);
    switch (command) {
      case "9":
        if (args.length) {
          this._updateCwd(args[0], false);
        }
        return true;
    }
    return false;
  }
  /**
   * Handles the sequence: `OSC 7 ; scheme://cwd ST`
   */
  _doHandleSetCwd(data) {
    if (!this._terminal) {
      return false;
    }
    const [command] = data.split(";");
    this._markSequenceSeen(`${7 /* SetCwd */};${command}`);
    if (command.match(/^file:\/\/.*\//)) {
      const uri = URI.parse(command);
      if (uri.path && uri.path.length > 0) {
        this._updateCwd(uri.path, false);
        return true;
      }
    }
    return false;
  }
  serialize() {
    if (!this._terminal || !this.capabilities.has(TerminalCapability.CommandDetection)) {
      return {
        isWindowsPty: false,
        hasRichCommandDetection: false,
        commands: [],
        promptInputModel: void 0
      };
    }
    const result = this._createOrGetCommandDetection(this._terminal).serialize();
    return result;
  }
  deserialize(serialized) {
    if (!this._terminal) {
      throw new Error("Cannot restore commands before addon is activated");
    }
    const commandDetection = this._createOrGetCommandDetection(this._terminal);
    commandDetection.deserialize(serialized);
    if (commandDetection.cwd) {
      this._updateCwd(commandDetection.cwd, false);
    }
  }
  _createOrGetCwdDetection() {
    let cwdDetection = this.capabilities.get(TerminalCapability.CwdDetection);
    if (!cwdDetection) {
      cwdDetection = this._register(new CwdDetectionCapability());
      this.capabilities.add(TerminalCapability.CwdDetection, cwdDetection);
    }
    return cwdDetection;
  }
  _createOrGetCommandDetection(terminal) {
    let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
    if (!commandDetection) {
      commandDetection = this._register(new CommandDetectionCapability(terminal, this._logService));
      this.capabilities.add(TerminalCapability.CommandDetection, commandDetection);
    }
    return commandDetection;
  }
  _createOrGetBufferMarkDetection(terminal) {
    let bufferMarkDetection = this.capabilities.get(TerminalCapability.BufferMarkDetection);
    if (!bufferMarkDetection) {
      bufferMarkDetection = this._register(new BufferMarkCapability(terminal));
      this.capabilities.add(TerminalCapability.BufferMarkDetection, bufferMarkDetection);
    }
    return bufferMarkDetection;
  }
  _createOrGetShellEnvDetection() {
    let shellEnvDetection = this.capabilities.get(TerminalCapability.ShellEnvDetection);
    if (!shellEnvDetection) {
      shellEnvDetection = this._register(new ShellEnvDetectionCapability());
      this.capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
    }
    return shellEnvDetection;
  }
  _createOrGetPromptTypeDetection() {
    let promptTypeDetection = this.capabilities.get(TerminalCapability.PromptTypeDetection);
    if (!promptTypeDetection) {
      promptTypeDetection = this._register(new PromptTypeDetectionCapability());
      this.capabilities.add(TerminalCapability.PromptTypeDetection, promptTypeDetection);
    }
    return promptTypeDetection;
  }
}
function deserializeVSCodeOscMessage(message) {
  return message.replaceAll(
    // Backslash ('\') followed by an escape operator: either another '\', or 'x' and two hex chars.
    /\\(\\|x([0-9a-f]{2}))/gi,
    // If it's a hex value, parse it to a character.
    // Otherwise the operator is '\', which we return literally, now unescaped.
    (_match, op, hex) => hex ? String.fromCharCode(parseInt(hex, 16)) : op
  );
}
function serializeVSCodeOscMessage(message) {
  return message.replace(
    // Match backslash ('\'), semicolon (';'), or characters 0x20 and below
    /[\\;\x00-\x20]/g,
    (char) => {
      if (char === "\\") {
        return "\\\\";
      }
      const charCode = char.charCodeAt(0);
      return `\\x${charCode.toString(16).padStart(2, "0")}`;
    }
  );
}
function parseKeyValueAssignment(message) {
  const separatorIndex = message.indexOf("=");
  if (separatorIndex === -1) {
    return { key: message, value: void 0 };
  }
  return {
    key: message.substring(0, separatorIndex),
    value: message.substring(1 + separatorIndex)
  };
}
function parseMarkSequence(sequence) {
  let id = void 0;
  let hidden = false;
  for (const property of sequence) {
    if (property === void 0) {
      continue;
    }
    if (property === "Hidden") {
      hidden = true;
    }
    if (property.startsWith("Id=")) {
      id = property.substring(3);
    }
  }
  return { id, hidden };
}
export {
  ShellIntegrationAddon,
  ShellIntegrationOscPs,
  deserializeVSCodeOscMessage,
  parseKeyValueAssignment,
  parseMarkSequence,
  serializeVSCodeOscMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi94dGVybS9zaGVsbEludGVncmF0aW9uQWRkb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJU2hlbGxJbnRlZ3JhdGlvbiwgU2hlbGxJbnRlZ3JhdGlvblN0YXR1cyB9IGZyb20gJy4uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMnO1xuaW1wb3J0IHsgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uL2NhcGFiaWxpdGllcy9jd2REZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IElCdWZmZXJNYXJrQ2FwYWJpbGl0eSwgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCBJQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgSVByb21wdFR5cGVEZXRlY3Rpb25DYXBhYmlsaXR5LCBJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCBJU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5LCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IFBhcnRpYWxDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uL2NhcGFiaWxpdGllcy9wYXJ0aWFsQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQnVmZmVyTWFya0NhcGFiaWxpdHkgfSBmcm9tICcuLi9jYXBhYmlsaXRpZXMvYnVmZmVyTWFya0NhcGFiaWxpdHkuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxBZGRvbiwgVGVybWluYWwgfSBmcm9tICdAeHRlcm0vaGVhZGxlc3MnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHNhbml0aXplQ3dkIH0gZnJvbSAnLi4vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyByZW1vdmVBbnNpRXNjYXBlQ29kZXNGcm9tUHJvbXB0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBTaGVsbEVudkRldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi9jYXBhYmlsaXRpZXMvc2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IFByb21wdFR5cGVEZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vY2FwYWJpbGl0aWVzL3Byb21wdFR5cGVEZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcblxuLy8gU2hlbGwgaW50ZWdyYXRpb24gaXMgYSBmZWF0dXJlIHRoYXQgZW5oYW5jZXMgdGhlIHRlcm1pbmFsJ3MgdW5kZXJzdGFuZGluZyBvZiB3aGF0J3MgaGFwcGVuaW5nXG4vLyBpbiB0aGUgc2hlbGwgYnkgaW5qZWN0aW5nIHNwZWNpYWwgc2VxdWVuY2VzIGludG8gdGhlIHNoZWxsJ3MgcHJvbXB0IHVzaW5nIHRoZSBcIlNldCBUZXh0XG4vLyBQYXJhbWV0ZXJzXCIgc2VxdWVuY2UgKGBPU0MgUHMgOyBQdCBTVGApLlxuLy9cbi8vIERlZmluaXRpb25zOlxuLy8gLSBPU0M6IGBcXHgxYl1gXG4vLyAtIFBzOiAgQSBzaW5nbGUgKHVzdWFsbHkgb3B0aW9uYWwpIG51bWVyaWMgcGFyYW1ldGVyLCBjb21wb3NlZCBvZiBvbmUgb3IgbW9yZSBkaWdpdHMuXG4vLyAtIFB0OiAgQSB0ZXh0IHBhcmFtZXRlciBjb21wb3NlZCBvZiBwcmludGFibGUgY2hhcmFjdGVycy5cbi8vIC0gU1Q6IGBcXHg3YFxuLy9cbi8vIFRoaXMgaXMgaW5zcGlyZWQgYnkgYSBmZWF0dXJlIG9mIHRoZSBzYW1lIG5hbWUgaW4gdGhlIEZpbmFsVGVybSwgaVRlcm0yIGFuZCBraXR0eSB0ZXJtaW5hbHMuXG5cbi8qKlxuICogVGhlIGlkZW50aWZpZXIgZm9yIHRoZSBmaXJzdCBudW1lcmljIHBhcmFtZXRlciAoYFBzYCkgZm9yIE9TQyBjb21tYW5kcyB1c2VkIGJ5IHNoZWxsIGludGVncmF0aW9uLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBTaGVsbEludGVncmF0aW9uT3NjUHMge1xuXHQvKipcblx0ICogU2VxdWVuY2VzIHBpb25lZXJlZCBieSBGaW5hbFRlcm0uXG5cdCAqL1xuXHRGaW5hbFRlcm0gPSAxMzMsXG5cdC8qKlxuXHQgKiBTZXF1ZW5jZXMgcGlvbmVlcmVkIGJ5IFZTIENvZGUuIFRoZSBudW1iZXIgaXMgZGVyaXZlZCBmcm9tIHRoZSBsZWFzdCBzaWduaWZpY2FudCBkaWdpdCBvZlxuXHQgKiBcIlZTQ1wiIHdoZW4gZW5jb2RlZCBpbiBoZXggKFwiVlNDXCIgPSAweDU2LCAweDUzLCAweDQzKS5cblx0ICovXG5cdFZTQ29kZSA9IDYzMyxcblx0LyoqXG5cdCAqIFNlcXVlbmNlcyBwaW9uZWVyZWQgYnkgaVRlcm0uXG5cdCAqL1xuXHRJVGVybSA9IDEzMzcsXG5cdFNldEN3ZCA9IDcsXG5cdFNldFdpbmRvd3NGcmllbmRseUN3ZCA9IDlcbn1cblxuLyoqXG4gKiBTZXF1ZW5jZXMgcGlvbmVlcmVkIGJ5IEZpbmFsVGVybS5cbiAqL1xuY29uc3QgZW51bSBGaW5hbFRlcm1Pc2NQdCB7XG5cdC8qKlxuXHQgKiBUaGUgc3RhcnQgb2YgdGhlIHByb21wdCwgdGhpcyBpcyBleHBlY3RlZCB0byBhbHdheXMgYXBwZWFyIGF0IHRoZSBzdGFydCBvZiBhIGxpbmUuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyAxMzMgOyBBIFNUYFxuXHQgKi9cblx0UHJvbXB0U3RhcnQgPSAnQScsXG5cblx0LyoqXG5cdCAqIFRoZSBzdGFydCBvZiBhIGNvbW1hbmQsIGllLiB3aGVyZSB0aGUgdXNlciBpbnB1dHMgdGhlaXIgY29tbWFuZC5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDEzMyA7IEIgU1RgXG5cdCAqL1xuXHRDb21tYW5kU3RhcnQgPSAnQicsXG5cblx0LyoqXG5cdCAqIFNlbnQganVzdCBiZWZvcmUgdGhlIGNvbW1hbmQgb3V0cHV0IGJlZ2lucy5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDEzMyA7IEMgU1RgXG5cdCAqL1xuXHRDb21tYW5kRXhlY3V0ZWQgPSAnQycsXG5cblx0LyoqXG5cdCAqIFNlbnQganVzdCBhZnRlciBhIGNvbW1hbmQgaGFzIGZpbmlzaGVkLiBUaGUgZXhpdCBjb2RlIGlzIG9wdGlvbmFsLCB3aGVuIG5vdCBzcGVjaWZpZWQgaXRcblx0ICogbWVhbnMgbm8gY29tbWFuZCB3YXMgcnVuIChpZS4gZW50ZXIgb24gZW1wdHkgcHJvbXB0IG9yIGN0cmwrYykuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyAxMzMgOyBEIFs7IDxFeGl0Q29kZT5dIFNUYFxuXHQgKi9cblx0Q29tbWFuZEZpbmlzaGVkID0gJ0QnLFxufVxuXG4vKipcbiAqIFZTIENvZGUtc3BlY2lmaWMgc2hlbGwgaW50ZWdyYXRpb24gc2VxdWVuY2VzLiBTb21lIG9mIHRoZXNlIGFyZSBiYXNlZCBvbiBtb3JlIGNvbW1vbiBhbHRlcm5hdGl2ZXNcbiAqIGxpa2UgdGhvc2UgcGlvbmVlcmVkIGluIHtAbGluayBGaW5hbFRlcm1Pc2NQdCBGaW5hbFRlcm19LiBUaGUgZGVjaXNpb24gdG8gbW92ZSB0byBlbnRpcmVseSBjdXN0b21cbiAqIHNlcXVlbmNlcyB3YXMgdG8gdHJ5IHRvIGltcHJvdmUgcmVsaWFiaWxpdHkgYW5kIHByZXZlbnQgdGhlIHBvc3NpYmlsaXR5IG9mIGFwcGxpY2F0aW9ucyBjb25mdXNpbmdcbiAqIHRoZSB0ZXJtaW5hbC4gSWYgbXVsdGlwbGUgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0cyBydW4sIFZTIENvZGUgd2lsbCBwcmlvcml0aXplIHRoZSBWU1xuICogQ29kZS1zcGVjaWZpYyBvbmVzLlxuICpcbiAqIEl0J3MgcmVjb21tZW5kZWQgdGhhdCBhdXRob3JzIG9mIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdHMgdXNlIHRoZSBjb21tb24gc2VxdWVuY2VzIChgMTMzYClcbiAqIHdoZW4gYnVpbGRpbmcgZ2VuZXJhbCBwdXJwb3NlIHNjcmlwdHMgYW5kIHRoZSBWUyBDb2RlLXNwZWNpZmljIChgNjMzYCkgd2hlbiB0YXJnZXRpbmcgb25seSBWU1xuICogQ29kZSBvciB3aGVuIHRoZXJlIGFyZSBubyBvdGhlciBhbHRlcm5hdGl2ZXMgKGVnLiB7QGxpbmsgQ29tbWFuZExpbmUgYDYzMyA7IEVgfSkuIFRoZXNlIHNlcXVlbmNlc1xuICogc3VwcG9ydCBtaXgtYW5kLW1hdGNoaW5nLlxuICovXG5jb25zdCBlbnVtIFZTQ29kZU9zY1B0IHtcblx0LyoqXG5cdCAqIFRoZSBzdGFydCBvZiB0aGUgcHJvbXB0LCB0aGlzIGlzIGV4cGVjdGVkIHRvIGFsd2F5cyBhcHBlYXIgYXQgdGhlIHN0YXJ0IG9mIGEgbGluZS5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEEgU1RgXG5cdCAqXG5cdCAqIEJhc2VkIG9uIHtAbGluayBGaW5hbFRlcm1Pc2NQdC5Qcm9tcHRTdGFydH0uXG5cdCAqL1xuXHRQcm9tcHRTdGFydCA9ICdBJyxcblxuXHQvKipcblx0ICogVGhlIHN0YXJ0IG9mIGEgY29tbWFuZCwgaWUuIHdoZXJlIHRoZSB1c2VyIGlucHV0cyB0aGVpciBjb21tYW5kLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgQiBTVGBcblx0ICpcblx0ICogQmFzZWQgb24gIHtAbGluayBGaW5hbFRlcm1Pc2NQdC5Db21tYW5kU3RhcnR9LlxuXHQgKi9cblx0Q29tbWFuZFN0YXJ0ID0gJ0InLFxuXG5cdC8qKlxuXHQgKiBTZW50IGp1c3QgYmVmb3JlIHRoZSBjb21tYW5kIG91dHB1dCBiZWdpbnMuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBDIFNUYFxuXHQgKlxuXHQgKiBCYXNlZCBvbiB7QGxpbmsgRmluYWxUZXJtT3NjUHQuQ29tbWFuZEV4ZWN1dGVkfS5cblx0ICovXG5cdENvbW1hbmRFeGVjdXRlZCA9ICdDJyxcblxuXHQvKipcblx0ICogU2VudCBqdXN0IGFmdGVyIGEgY29tbWFuZCBoYXMgZmluaXNoZWQuIFRoaXMgc2hvdWxkIGdlbmVyYWxseSBiZSB1c2VkIG9uIHRoZSBuZXcgbGluZVxuXHQgKiBmb2xsb3dpbmcgdGhlIGVuZCBvZiBhIGNvbW1hbmQncyBvdXRwdXQsIGp1c3QgYmVmb3JlIHtAbGluayBQcm9tcHRTdGFydH0uIFRoZSBleGl0IGNvZGUgaXNcblx0ICogb3B0aW9uYWwsIHdoZW4gbm90IHNwZWNpZmllZCBpdCBtZWFucyBubyBjb21tYW5kIHdhcyBydW4gKGllLiBlbnRlciBvbiBlbXB0eSBwcm9tcHQgb3Jcblx0ICogY3RybCtjKS5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEQgWzsgPEV4aXRDb2RlPl0gU1RgXG5cdCAqXG5cdCAqIEJhc2VkIG9uIHtAbGluayBGaW5hbFRlcm1Pc2NQdC5Db21tYW5kRmluaXNoZWR9LlxuXHQgKi9cblx0Q29tbWFuZEZpbmlzaGVkID0gJ0QnLFxuXG5cdC8qKlxuXHQgKiBFeHBsaWNpdGx5IHNldCB0aGUgY29tbWFuZCBsaW5lLiBUaGlzIGhlbHBzIHdvcmthcm91bmQgcGVyZm9ybWFuY2UgYW5kIHJlbGlhYmlsaXR5IHByb2JsZW1zXG5cdCAqIHdpdGggcGFyc2luZyBvdXQgdGhlIGNvbW1hbmQsIHN1Y2ggYXMgY29ucHR5IG5vdCBndWFyYW50ZWVpbmcgdGhlIHBvc2l0aW9uIG9mIHRoZSBzZXF1ZW5jZSBvclxuXHQgKiB0aGUgc2hlbGwgbm90IGd1YXJhbnRlZWluZyB0aGF0IHRoZSBlbnRpcmUgY29tbWFuZCBpcyBldmVuIHZpc2libGUuIElkZWFsbHkgdGhpcyBpcyBjYWxsZWRcblx0ICogaW1tZWRpYXRlbHkgYmVmb3JlIHtAbGluayBDb21tYW5kRXhlY3V0ZWR9LCBpbW1lZGlhdGVseSBiZWZvcmUge0BsaW5rIENvbW1hbmRGaW5pc2hlZH0gd2lsbFxuXHQgKiBhbHNvIHdvcmsgYnV0IHRoYXQgbWVhbnMgdGVybWluYWwgd2lsbCBvbmx5IGtub3cgdGhlIGFjY3VyYXRlIGNvbW1hbmQgbGluZSB3aGVuIHRoZSBjb21tYW5kIGlzXG5cdCAqIGZpbmlzaGVkLlxuXHQgKlxuXHQgKiBUaGUgY29tbWFuZCBsaW5lIGNhbiBlc2NhcGUgYXNjaWkgY2hhcmFjdGVycyB1c2luZyB0aGUgYFxceEFCYCBmb3JtYXQsIHdoZXJlIEFCIGFyZSB0aGVcblx0ICogaGV4YWRlY2ltYWwgcmVwcmVzZW50YXRpb24gb2YgdGhlIGNoYXJhY3RlciBjb2RlIChjYXNlIGluc2Vuc2l0aXZlKSwgYW5kIGVzY2FwZSB0aGUgYFxcYFxuXHQgKiBjaGFyYWN0ZXIgdXNpbmcgYFxcXFxgLiBJdCdzIHJlcXVpcmVkIHRvIGVzY2FwZSBzZW1pLWNvbG9uIChgMHgzYmApIGFuZCBjaGFyYWN0ZXJzIDB4MjAgYW5kXG5cdCAqIGJlbG93LCB0aGlzIGlzIHBhcnRpY3VsYXJseSBpbXBvcnRhbnQgZm9yIG5ldyBsaW5lIGFuZCBzZW1pLWNvbG9uLlxuXHQgKlxuXHQgKiBTb21lIGV4YW1wbGVzOlxuXHQgKlxuXHQgKiBgYGBcblx0ICogXCJcXFwiICAtPiBcIlxcXFxcIlxuXHQgKiBcIlxcblwiIC0+IFwiXFx4MGFcIlxuXHQgKiBcIjtcIiAgLT4gXCJcXHgzYlwiXG5cdCAqIGBgYFxuXHQgKlxuXHQgKiBBbiBvcHRpb25hbCBub25jZSBjYW4gYmUgcHJvdmlkZWQgd2hpY2ggaXMgbWF5IGJlIHJlcXVpcmVkIGJ5IHRoZSB0ZXJtaW5hbCBpbiBvcmRlciBlbmFibGVcblx0ICogc29tZSBmZWF0dXJlcy4gVGhpcyBoZWxwcyBlbnN1cmUgbm8gbWFsaWNpb3VzIGNvbW1hbmQgaW5qZWN0aW9uIGhhcyBvY2N1cnJlZC5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEUgWzsgPENvbW1hbmRMaW5lPiBbOyA8Tm9uY2U+XV0gU1RgXG5cdCAqL1xuXHRDb21tYW5kTGluZSA9ICdFJyxcblxuXHQvKipcblx0ICogU2ltaWxhciB0byBwcm9tcHQgc3RhcnQgYnV0IGZvciBsaW5lIGNvbnRpbnVhdGlvbnMuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBGIFNUYFxuXHQgKlxuXHQgKiBXQVJOSU5HOiBUaGlzIHNlcXVlbmNlIGlzIHVuZmluYWxpemVkLCBETyBOT1QgdXNlIHRoaXMgaW4geW91ciBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuXG5cdCAqL1xuXHRDb250aW51YXRpb25TdGFydCA9ICdGJyxcblxuXHQvKipcblx0ICogU2ltaWxhciB0byBjb21tYW5kIHN0YXJ0IGJ1dCBmb3IgbGluZSBjb250aW51YXRpb25zLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgRyBTVGBcblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0Q29udGludWF0aW9uRW5kID0gJ0cnLFxuXG5cdC8qKlxuXHQgKiBUaGUgc3RhcnQgb2YgdGhlIHJpZ2h0IHByb21wdC5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEggU1RgXG5cdCAqXG5cdCAqIFdBUk5JTkc6IFRoaXMgc2VxdWVuY2UgaXMgdW5maW5hbGl6ZWQsIERPIE5PVCB1c2UgdGhpcyBpbiB5b3VyIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdC5cblx0ICovXG5cdFJpZ2h0UHJvbXB0U3RhcnQgPSAnSCcsXG5cblx0LyoqXG5cdCAqIFRoZSBlbmQgb2YgdGhlIHJpZ2h0IHByb21wdC5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEkgU1RgXG5cdCAqXG5cdCAqIFdBUk5JTkc6IFRoaXMgc2VxdWVuY2UgaXMgdW5maW5hbGl6ZWQsIERPIE5PVCB1c2UgdGhpcyBpbiB5b3VyIHNoZWxsIGludGVncmF0aW9uIHNjcmlwdC5cblx0ICovXG5cdFJpZ2h0UHJvbXB0RW5kID0gJ0knLFxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIHZhbHVlIG9mIGFuIGFyYml0cmFyeSBwcm9wZXJ0eSwgb25seSBrbm93biBwcm9wZXJ0aWVzIHdpbGwgYmUgaGFuZGxlZCBieSBWUyBDb2RlLlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgUCA7IDxQcm9wZXJ0eT49PFZhbHVlPiBTVGBcblx0ICpcblx0ICogS25vd24gcHJvcGVydGllczpcblx0ICpcblx0ICogLSBgQ3dkYCAtIFJlcG9ydHMgdGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkgdG8gdGhlIHRlcm1pbmFsLlxuXHQgKiAtIGBJc1dpbmRvd3NgIC0gUmVwb3J0cyB3aGV0aGVyIHRoZSBzaGVsbCBpcyB1c2luZyBhIFdpbmRvd3MgYmFja2VuZCAoY29ucHR5KS5cblx0ICogICBUaGlzIG1heSBiZSB1c2VkIHRvIGVuYWJsZSBhZGRpdGlvbmFsIGhldXJpc3RpY3MgYXMgdGhlIHBvc2l0aW9uaW5nIG9mIHRoZSBzaGVsbFxuXHQgKiAgIGludGVncmF0aW9uIHNlcXVlbmNlcyBhcmUgbm90IGd1YXJhbnRlZWQgdG8gYmUgY29ycmVjdC4gVmFsaWQgdmFsdWVzOiBgVHJ1ZWAsIGBGYWxzZWAuXG5cdCAqIC0gYENvbnRpbnVhdGlvblByb21wdGAgLSBSZXBvcnRzIHRoZSBjb250aW51YXRpb24gcHJvbXB0IHRoYXQgaXMgcHJpbnRlZCBhdCB0aGUgc3RhcnQgb2Zcblx0ICogICBtdWx0aS1saW5lIGlucHV0cy5cblx0ICogLSBgSGFzUmljaENvbW1hbmREZXRlY3Rpb25gIC0gUmVwb3J0cyB3aGV0aGVyIHRoZSBzaGVsbCBoYXMgcmljaCBjb21tYW5kIGxpbmUgZGV0ZWN0aW9uLFxuXHQgKiAgIG1lYW5pbmcgdGhhdCBzZXF1ZW5jZXMgQSwgQiwgQywgRCBhbmQgRSBhcmUgZXhhY3RseSB3aGVyZSB0aGV5J3JlIG1lYW50IHRvIGJlLiBJblxuXHQgKiAgIHBhcnRpY3VsYXIsIHtAbGluayBDb21tYW5kTGluZX0gbXVzdCBoYXBwZW4gaW1tZWRpYXRlbHkgYmVmb3JlIHtAbGluayBDb21tYW5kRXhlY3V0ZWR9IHNvXG5cdCAqICAgVlMgQ29kZSBrbm93cyB0aGUgY29tbWFuZCBsaW5lIHdoZW4gdGhlIGV4ZWN1dGlvbiBiZWdpbnMuXG5cdCAqXG5cdCAqIFdBUk5JTkc6IEFueSBvdGhlciBwcm9wZXJ0aWVzIG1heSBiZSBjaGFuZ2VkIGFuZCBhcmUgbm90IGd1YXJhbnRlZWQgdG8gd29yayBpbiB0aGUgZnV0dXJlLlxuXHQgKi9cblx0UHJvcGVydHkgPSAnUCcsXG5cblx0LyoqXG5cdCAqIFNldHMgYSBtYXJrL3BvaW50LW9mLWludGVyZXN0IGluIHRoZSBidWZmZXIuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBTZXRNYXJrIFs7IElkPTxzdHJpbmc+XSBbOyBIaWRkZW5dIFNUYFxuXHQgKlxuXHQgKiBgSWRgIC0gVGhlIGlkZW50aWZpZXIgb2YgdGhlIG1hcmsgdGhhdCBjYW4gYmUgdXNlZCB0byByZWZlcmVuY2UgaXRcblx0ICogYEhpZGRlbmAgLSBXaGVuIHNldCwgdGhlIG1hcmsgd2lsbCBiZSBhdmFpbGFibGUgdG8gcmVmZXJlbmNlIGludGVybmFsbHkgYnV0IHdpbGwgbm90IHZpc2libGVcblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0U2V0TWFyayA9ICdTZXRNYXJrJyxcblxuXHQvKipcblx0ICogU2VuZHMgdGhlIHNoZWxsJ3MgY29tcGxldGUgZW52aXJvbm1lbnQgaW4gSlNPTiBmb3JtYXQuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyA2MzMgOyBFbnZKc29uIDsgPEVudmlyb25tZW50PiA7IDxOb25jZT4gU1RgXG5cdCAqXG5cdCAqIC0gYEVudmlyb25tZW50YCAtIEEgc3RyaW5naWZpZWQgSlNPTiBvYmplY3QgY29udGFpbmluZyB0aGUgc2hlbGwncyBjb21wbGV0ZSBlbnZpcm9ubWVudC4gVGhlXG5cdCAqICAgIHZhcmlhYmxlcyBhbmQgdmFsdWVzIHVzZSB0aGUgc2FtZSBlbmNvZGluZyBydWxlcyBhcyB0aGUge0BsaW5rIENvbW1hbmRMaW5lfSBzZXF1ZW5jZS5cblx0ICogLSBgTm9uY2VgIC0gQW4gX21hbmRhdG9yeV8gbm9uY2UgY2FuIGJlIHByb3ZpZGVkIHdoaWNoIG1heSBiZSByZXF1aXJlZCBieSB0aGUgdGVybWluYWwgaW4gb3JkZXJcblx0ICogICB0byBlbmFibGUgc29tZSBmZWF0dXJlcy4gVGhpcyBoZWxwcyBlbnN1cmUgbm8gbWFsaWNpb3VzIGNvbW1hbmQgaW5qZWN0aW9uIGhhcyBvY2N1cnJlZC5cblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0RW52SnNvbiA9ICdFbnZKc29uJyxcblxuXHQvKipcblx0ICogRGVsZXRlIGEgc2luZ2xlIGVudmlyb25tZW50IHZhcmlhYmxlIGZyb20gY2FjaGVkIGVudmlyb25tZW50LlxuXHQgKlxuXHQgKiBGb3JtYXQ6IGBPU0MgNjMzIDsgRW52U2luZ2xlRGVsZXRlIDsgPEVudmlyb25tZW50S2V5PiA7IDxFbnZpcm9ubWVudFZhbHVlPiBbOyA8Tm9uY2U+XSBTVGBcblx0ICpcblx0ICogLSBgTm9uY2VgIC0gQW4gb3B0aW9uYWwgbm9uY2UgY2FuIGJlIHByb3ZpZGVkIHdoaWNoIG1heSBiZSByZXF1aXJlZCBieSB0aGUgdGVybWluYWwgaW4gb3JkZXJcblx0ICogICB0byBlbmFibGUgc29tZSBmZWF0dXJlcy4gVGhpcyBoZWxwcyBlbnN1cmUgbm8gbWFsaWNpb3VzIGNvbW1hbmQgaW5qZWN0aW9uIGhhcyBvY2N1cnJlZC5cblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0RW52U2luZ2xlRGVsZXRlID0gJ0VudlNpbmdsZURlbGV0ZScsXG5cblx0LyoqXG5cdCAqIFRoZSBzdGFydCBvZiB0aGUgY29sbGVjdGluZyB1c2VyJ3MgZW52aXJvbm1lbnQgdmFyaWFibGVzIGluZGl2aWR1YWxseS5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEVudlNpbmdsZVN0YXJ0IDsgPENsZWFyPiBbOyA8Tm9uY2U+XSBTVGBcblx0ICpcblx0ICogLSBgQ2xlYXJgIC0gQW4gX21hbmRhdG9yeV8gZmxhZyBpbmRpY2F0aW5nIGFueSBjYWNoZWQgZW52aXJvbm1lbnQgdmFyaWFibGVzIHdpbGwgYmUgY2xlYXJlZC5cblx0ICogLSBgTm9uY2VgIC0gQW4gb3B0aW9uYWwgbm9uY2UgY2FuIGJlIHByb3ZpZGVkIHdoaWNoIG1heSBiZSByZXF1aXJlZCBieSB0aGUgdGVybWluYWwgaW4gb3JkZXJcblx0ICogICB0byBlbmFibGUgc29tZSBmZWF0dXJlcy4gVGhpcyBoZWxwcyBlbnN1cmUgbm8gbWFsaWNpb3VzIGNvbW1hbmQgaW5qZWN0aW9uIGhhcyBvY2N1cnJlZC5cblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0RW52U2luZ2xlU3RhcnQgPSAnRW52U2luZ2xlU3RhcnQnLFxuXG5cdC8qKlxuXHQgKiBTZXRzIGFuIGVudHJ5IG9mIHNpbmdsZSBlbnZpcm9ubWVudCB2YXJpYWJsZSB0byB0cmFuc2FjdGlvbmFsIHBlbmRpbmcgbWFwIG9mIGVudmlyb25tZW50IHZhcmlhYmxlcy5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEVudlNpbmdsZUVudHJ5IDsgPEVudmlyb25tZW50S2V5PiA7IDxFbnZpcm9ubWVudFZhbHVlPiBbOyA8Tm9uY2U+XSBTVGBcblx0ICpcblx0ICogLSBgTm9uY2VgIC0gQW4gb3B0aW9uYWwgbm9uY2UgY2FuIGJlIHByb3ZpZGVkIHdoaWNoIG1heSBiZSByZXF1aXJlZCBieSB0aGUgdGVybWluYWwgaW4gb3JkZXJcblx0ICogICB0byBlbmFibGUgc29tZSBmZWF0dXJlcy4gVGhpcyBoZWxwcyBlbnN1cmUgbm8gbWFsaWNpb3VzIGNvbW1hbmQgaW5qZWN0aW9uIGhhcyBvY2N1cnJlZC5cblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0RW52U2luZ2xlRW50cnkgPSAnRW52U2luZ2xlRW50cnknLFxuXG5cdC8qKlxuXHQgKiBUaGUgZW5kIG9mIHRoZSBjb2xsZWN0aW5nIHVzZXIncyBlbnZpcm9ubWVudCB2YXJpYWJsZXMgaW5kaXZpZHVhbGx5LlxuXHQgKiBDbGVhcnMgYW55IHBlbmRpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzIGFuZCBmaXJlcyBhbiBldmVudCB0aGF0IGNvbnRhaW5zIHVzZXIncyBlbnZpcm9ubWVudC5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDYzMyA7IEVudlNpbmdsZUVuZCBbOyA8Tm9uY2U+XSBTVGBcblx0ICpcblx0ICogLSBgTm9uY2VgIC0gQW4gb3B0aW9uYWwgbm9uY2UgY2FuIGJlIHByb3ZpZGVkIHdoaWNoIG1heSBiZSByZXF1aXJlZCBieSB0aGUgdGVybWluYWwgaW4gb3JkZXJcblx0ICogICB0byBlbmFibGUgc29tZSBmZWF0dXJlcy4gVGhpcyBoZWxwcyBlbnN1cmUgbm8gbWFsaWNpb3VzIGNvbW1hbmQgaW5qZWN0aW9uIGhhcyBvY2N1cnJlZC5cblx0ICpcblx0ICogV0FSTklORzogVGhpcyBzZXF1ZW5jZSBpcyB1bmZpbmFsaXplZCwgRE8gTk9UIHVzZSB0aGlzIGluIHlvdXIgc2hlbGwgaW50ZWdyYXRpb24gc2NyaXB0LlxuXHQgKi9cblx0RW52U2luZ2xlRW5kID0gJ0VudlNpbmdsZUVuZCdcbn1cblxuLyoqXG4gKiBJVGVybSBzZXF1ZW5jZXNcbiAqL1xuY29uc3QgZW51bSBJVGVybU9zY1B0IHtcblx0LyoqXG5cdCAqIFNldHMgYSBtYXJrL3BvaW50LW9mLWludGVyZXN0IGluIHRoZSBidWZmZXIuXG5cdCAqXG5cdCAqIEZvcm1hdDogYE9TQyAxMzM3IDsgU2V0TWFyayBTVGBcblx0ICovXG5cdFNldE1hcmsgPSAnU2V0TWFyaycsXG5cblx0LyoqXG5cdCAqIFJlcG9ydHMgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSAoQ1dEKS5cblx0ICpcblx0ICogRm9ybWF0OiBgT1NDIDEzMzcgOyBDdXJyZW50RGlyPTxDd2Q+IFNUYFxuXHQgKi9cblx0Q3VycmVudERpciA9ICdDdXJyZW50RGlyJ1xufVxuXG4vKipcbiAqIFRoZSBzaGVsbCBpbnRlZ3JhdGlvbiBhZGRvbiBleHRlbmRzIHh0ZXJtIGJ5IHJlYWRpbmcgc2hlbGwgaW50ZWdyYXRpb24gc2VxdWVuY2VzIGFuZCBjcmVhdGluZ1xuICogY2FwYWJpbGl0aWVzIGFuZCBwYXNzaW5nIGFsb25nIHJlbGV2YW50IHNlcXVlbmNlcyB0byB0aGUgY2FwYWJpbGl0aWVzLiBUaGlzIGlzIG1lYW50IHRvXG4gKiBlbmNhcHN1bGF0ZSBhbGwgaGFuZGxpbmcvcGFyc2luZyBvZiBzZXF1ZW5jZXMgc28gdGhlIGNhcGFiaWxpdGllcyBkb24ndCBuZWVkIHRvLlxuICovXG5leHBvcnQgY2xhc3MgU2hlbGxJbnRlZ3JhdGlvbkFkZG9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTaGVsbEludGVncmF0aW9uLCBJVGVybWluYWxBZGRvbiB7XG5cdHByaXZhdGUgX3Rlcm1pbmFsPzogVGVybWluYWw7XG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0cHJpdmF0ZSBfaGFzVXBkYXRlZFRlbGVtZXRyeTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9hY3RpdmF0aW9uVGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbW9uUHJvdG9jb2xEaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdHByaXZhdGUgX3NlZW5TZXF1ZW5jZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRnZXQgc2VlblNlcXVlbmNlcygpOiBSZWFkb25seVNldDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuX3NlZW5TZXF1ZW5jZXM7IH1cblxuXHRwcml2YXRlIF9zdGF0dXM6IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMgPSBTaGVsbEludGVncmF0aW9uU3RhdHVzLk9mZjtcblx0Z2V0IHN0YXR1cygpOiBTaGVsbEludGVncmF0aW9uU3RhdHVzIHsgcmV0dXJuIHRoaXMuX3N0YXR1czsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU3RhdHVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2hlbGxJbnRlZ3JhdGlvblN0YXR1cz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2VlblNlcXVlbmNlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJlYWRvbmx5U2V0PHN0cmluZz4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlZW5TZXF1ZW5jZXMgPSB0aGlzLl9vbkRpZENoYW5nZVNlZW5TZXF1ZW5jZXMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfbm9uY2U6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaXNhYmxlVGVsZW1ldHJ5OiBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX29uRGlkRXhlY3V0ZVRleHQ6IEV2ZW50PHZvaWQ+IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NsZWFyQWN0aXZhdGlvblRpbWVvdXQoKTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VDb21tb25Qcm90b2NvbCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VDb21tb25Qcm90b2NvbCgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuX2NvbW1vblByb3RvY29sRGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuX2NvbW1vblByb3RvY29sRGlzcG9zYWJsZXMubGVuZ3RoID0gMDtcblx0fVxuXG5cdGFjdGl2YXRlKHh0ZXJtOiBUZXJtaW5hbCkge1xuXHRcdHRoaXMuX3Rlcm1pbmFsID0geHRlcm07XG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5QYXJ0aWFsQ29tbWFuZERldGVjdGlvbiwgdGhpcy5fcmVnaXN0ZXIobmV3IFBhcnRpYWxDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSh0aGlzLl90ZXJtaW5hbCwgdGhpcy5fb25EaWRFeGVjdXRlVGV4dCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5wYXJzZXIucmVnaXN0ZXJPc2NIYW5kbGVyKFNoZWxsSW50ZWdyYXRpb25Pc2NQcy5WU0NvZGUsIGRhdGEgPT4gdGhpcy5faGFuZGxlVlNDb2RlU2VxdWVuY2UoZGF0YSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5wYXJzZXIucmVnaXN0ZXJPc2NIYW5kbGVyKFNoZWxsSW50ZWdyYXRpb25Pc2NQcy5JVGVybSwgZGF0YSA9PiB0aGlzLl9kb0hhbmRsZUlUZXJtU2VxdWVuY2UoZGF0YSkpKTtcblx0XHR0aGlzLl9jb21tb25Qcm90b2NvbERpc3Bvc2FibGVzLnB1c2goXG5cdFx0XHR4dGVybS5wYXJzZXIucmVnaXN0ZXJPc2NIYW5kbGVyKFNoZWxsSW50ZWdyYXRpb25Pc2NQcy5GaW5hbFRlcm0sIGRhdGEgPT4gdGhpcy5faGFuZGxlRmluYWxUZXJtU2VxdWVuY2UoZGF0YSkpXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5wYXJzZXIucmVnaXN0ZXJPc2NIYW5kbGVyKFNoZWxsSW50ZWdyYXRpb25Pc2NQcy5TZXRDd2QsIGRhdGEgPT4gdGhpcy5fZG9IYW5kbGVTZXRDd2QoZGF0YSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5wYXJzZXIucmVnaXN0ZXJPc2NIYW5kbGVyKFNoZWxsSW50ZWdyYXRpb25Pc2NQcy5TZXRXaW5kb3dzRnJpZW5kbHlDd2QsIGRhdGEgPT4gdGhpcy5fZG9IYW5kbGVTZXRXaW5kb3dzRnJpZW5kbHlDd2QoZGF0YSkpKTtcblx0XHR0aGlzLl9lbnN1cmVDYXBhYmlsaXRpZXNPckFkZEZhaWx1cmVUZWxlbWV0cnkoKTtcblx0fVxuXG5cdGdldE1hcmtlcklkKHRlcm1pbmFsOiBUZXJtaW5hbCwgdnNjb2RlTWFya2VySWQ6IHN0cmluZykge1xuXHRcdHRoaXMuX2NyZWF0ZU9yR2V0QnVmZmVyTWFya0RldGVjdGlvbih0ZXJtaW5hbCkuZ2V0TWFyayh2c2NvZGVNYXJrZXJJZCk7XG5cdH1cblxuXHRzZXROZXh0Q29tbWFuZElkKGNvbW1hbmQ6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuc2V0TmV4dENvbW1hbmRJZChjb21tYW5kLCBjb21tYW5kSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21hcmtTZXF1ZW5jZVNlZW4oc2VxdWVuY2U6IHN0cmluZykge1xuXHRcdGlmICghdGhpcy5fc2VlblNlcXVlbmNlcy5oYXMoc2VxdWVuY2UpKSB7XG5cdFx0XHR0aGlzLl9zZWVuU2VxdWVuY2VzLmFkZChzZXF1ZW5jZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlZW5TZXF1ZW5jZXMuZmlyZSh0aGlzLl9zZWVuU2VxdWVuY2VzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVGaW5hbFRlcm1TZXF1ZW5jZShkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBkaWRIYW5kbGUgPSB0aGlzLl9kb0hhbmRsZUZpbmFsVGVybVNlcXVlbmNlKGRhdGEpO1xuXHRcdGlmICh0aGlzLl9zdGF0dXMgPT09IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMuT2ZmKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMgPSBTaGVsbEludGVncmF0aW9uU3RhdHVzLkZpbmFsVGVybTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUodGhpcy5fc3RhdHVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRpZEhhbmRsZTtcblx0fVxuXG5cdHByaXZhdGUgX2RvSGFuZGxlRmluYWxUZXJtU2VxdWVuY2UoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFBhc3MgdGhlIHNlcXVlbmNlIGFsb25nIHRvIHRoZSBjYXBhYmlsaXR5XG5cdFx0Ly8gSXQgd2FzIGNvbnNpZGVyZWQgdG8gZGlzYWJsZSB0aGUgY29tbW9uIHByb3RvY29sIGluIG9yZGVyIHRvIG5vdCBjb25mdXNlIHRoZSBWUyBDb2RlXG5cdFx0Ly8gc2hlbGwgaW50ZWdyYXRpb24gaWYgYm90aCBoYXBwZW4gZm9yIHNvbWUgcmVhc29uLiBUaGlzIGRvZXNuJ3Qgd29yayBmb3IgcG93ZXJsZXZlbDEwa1xuXHRcdC8vIHdoZW4gaW5zdGFudCBwcm9tcHQgaXMgZW5hYmxlZCB0aG91Z2guIElmIHRoaXMgZG9lcyBlbmQgdXAgYmVpbmcgYSBwcm9ibGVtIHdlIGNvdWxkIHBhc3Ncblx0XHQvLyBhIHR5cGUgZmxhZyB0aHJvdWdoIHRoZSBjYXBhYmlsaXR5IGNhbGxzXG5cdFx0Y29uc3QgW2NvbW1hbmQsIC4uLmFyZ3NdID0gZGF0YS5zcGxpdCgnOycpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFNoZWxsSW50ZWdyYXRpb25BZGRvbiNfZG9IYW5kbGVGaW5hbFRlcm1TZXF1ZW5jZTogcmVjZWl2ZWQgc2VxdWVuY2UgJHtjb21tYW5kfWApO1xuXHRcdHRoaXMuX21hcmtTZXF1ZW5jZVNlZW4oY29tbWFuZCk7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlIEZpbmFsVGVybU9zY1B0LlByb21wdFN0YXJ0OlxuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmhhbmRsZVByb21wdFN0YXJ0KCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0Y2FzZSBGaW5hbFRlcm1Pc2NQdC5Db21tYW5kU3RhcnQ6XG5cdFx0XHRcdC8vIElnbm9yZSB0aGUgY29tbWFuZCBsaW5lIGZvciB0aGVzZSBzZXF1ZW5jZXMgYXMgaXQncyB1bnJlbGlhYmxlIGZvciBleGFtcGxlIGluIHBvd2VybGV2ZWwxMGtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb21tYW5kU3RhcnQoeyBpZ25vcmVDb21tYW5kTGluZTogdHJ1ZSB9KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIEZpbmFsVGVybU9zY1B0LkNvbW1hbmRFeGVjdXRlZDpcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb21tYW5kRXhlY3V0ZWQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIEZpbmFsVGVybU9zY1B0LkNvbW1hbmRGaW5pc2hlZDoge1xuXHRcdFx0XHRjb25zdCBleGl0Q29kZSA9IGFyZ3MubGVuZ3RoID09PSAxID8gcGFyc2VJbnQoYXJnc1swXSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuaGFuZGxlQ29tbWFuZEZpbmlzaGVkKGV4aXRDb2RlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVZTQ29kZVNlcXVlbmNlKGRhdGE6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRpZEhhbmRsZSA9IHRoaXMuX2RvSGFuZGxlVlNDb2RlU2VxdWVuY2UoZGF0YSk7XG5cdFx0aWYgKCF0aGlzLl9oYXNVcGRhdGVkVGVsZW1ldHJ5ICYmIGRpZEhhbmRsZSkge1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZT8ucHVibGljTG9nMjx7fSwgeyBvd25lcjogJ21lZ2Fucm9nZ2UnOyBjb21tZW50OiAnSW5kaWNhdGVzIHNoZWxsIGludGVncmF0aW9uIHdhcyBhY3RpdmF0ZWQnIH0+KCd0ZXJtaW5hbC9zaGVsbEludGVncmF0aW9uQWN0aXZhdGlvblN1Y2NlZWRlZCcpO1xuXHRcdFx0dGhpcy5faGFzVXBkYXRlZFRlbGVtZXRyeSA9IHRydWU7XG5cdFx0XHR0aGlzLl9jbGVhckFjdGl2YXRpb25UaW1lb3V0KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGF0dXMgIT09IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMuVlNDb2RlKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMgPSBTaGVsbEludGVncmF0aW9uU3RhdHVzLlZTQ29kZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdHVzLmZpcmUodGhpcy5fc3RhdHVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRpZEhhbmRsZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZUNhcGFiaWxpdGllc09yQWRkRmFpbHVyZVRlbGVtZXRyeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3RlbGVtZXRyeVNlcnZpY2UgfHwgdGhpcy5fZGlzYWJsZVRlbGVtZXRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmF0aW9uVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pICYmICF0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkN3ZERldGVjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZT8ucHVibGljTG9nMjx7fSwgeyBvd25lcjogJ21lZ2Fucm9nZ2UnOyBjb21tZW50OiAnSW5kaWNhdGVzIHNoZWxsIGludGVncmF0aW9uIGFjdGl2YXRpb24gdGltZW91dCcgfT4oJ3Rlcm1pbmFsL3NoZWxsSW50ZWdyYXRpb25BY3RpdmF0aW9uVGltZW91dCcpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1NoZWxsIGludGVncmF0aW9uIGZhaWxlZCB0byBhZGQgY2FwYWJpbGl0aWVzIHdpdGhpbiAxMCBzZWNvbmRzJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9oYXNVcGRhdGVkVGVsZW1ldHJ5ID0gdHJ1ZTtcblx0XHR9LCAxMDAwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckFjdGl2YXRpb25UaW1lb3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmF0aW9uVGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fYWN0aXZhdGlvblRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fYWN0aXZhdGlvblRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZG9IYW5kbGVWU0NvZGVTZXF1ZW5jZShkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUGFzcyB0aGUgc2VxdWVuY2UgYWxvbmcgdG8gdGhlIGNhcGFiaWxpdHlcblx0XHRjb25zdCBhcmdzSW5kZXggPSBkYXRhLmluZGV4T2YoJzsnKTtcblx0XHRjb25zdCBjb21tYW5kID0gYXJnc0luZGV4ID09PSAtMSA/IGRhdGEgOiBkYXRhLnN1YnN0cmluZygwLCBhcmdzSW5kZXgpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFNoZWxsSW50ZWdyYXRpb25BZGRvbiNfZG9IYW5kbGVWU0NvZGVTZXF1ZW5jZTogcmVjZWl2ZWQgc2VxdWVuY2UgJHtjb21tYW5kfWApO1xuXHRcdHRoaXMuX21hcmtTZXF1ZW5jZVNlZW4oY29tbWFuZCk7XG5cdFx0Ly8gQ2FzdCB0byBzdHJpY3QgY2hlY2tlZCBpbmRleCBhY2Nlc3Ncblx0XHRjb25zdCBhcmdzOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdID0gYXJnc0luZGV4ID09PSAtMSA/IFtdIDogZGF0YS5zdWJzdHJpbmcoYXJnc0luZGV4ICsgMSkuc3BsaXQoJzsnKTtcblx0XHRzd2l0Y2ggKGNvbW1hbmQpIHtcblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuUHJvbXB0U3RhcnQ6XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuaGFuZGxlUHJvbXB0U3RhcnQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LkNvbW1hbmRTdGFydDpcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb21tYW5kU3RhcnQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LkNvbW1hbmRFeGVjdXRlZDpcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb21tYW5kRXhlY3V0ZWQoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LkNvbW1hbmRGaW5pc2hlZDoge1xuXHRcdFx0XHRjb25zdCBhcmcwID0gYXJnc1swXTtcblx0XHRcdFx0Y29uc3QgZXhpdENvZGUgPSBhcmcwICE9PSB1bmRlZmluZWQgPyBwYXJzZUludChhcmcwKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb21tYW5kRmluaXNoZWQoZXhpdENvZGUpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuQ29tbWFuZExpbmU6IHtcblx0XHRcdFx0Y29uc3QgYXJnMCA9IGFyZ3NbMF07XG5cdFx0XHRcdGNvbnN0IGFyZzEgPSBhcmdzWzFdO1xuXHRcdFx0XHRsZXQgY29tbWFuZExpbmU6IHN0cmluZztcblx0XHRcdFx0aWYgKGFyZzAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbW1hbmRMaW5lID0gZGVzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGFyZzApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbW1hbmRMaW5lID0gJyc7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5zZXRDb21tYW5kTGluZShjb21tYW5kTGluZSwgYXJnMSA9PT0gdGhpcy5fbm9uY2UpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuQ29udGludWF0aW9uU3RhcnQ6IHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVDb250aW51YXRpb25TdGFydCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuQ29udGludWF0aW9uRW5kOiB7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuaGFuZGxlQ29udGludWF0aW9uRW5kKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5FbnZKc29uOiB7XG5cdFx0XHRcdGNvbnN0IGFyZzAgPSBhcmdzWzBdO1xuXHRcdFx0XHRjb25zdCBhcmcxID0gYXJnc1sxXTtcblx0XHRcdFx0aWYgKGFyZzAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnYgPSBKU09OLnBhcnNlKGRlc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZShhcmcwKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldFNoZWxsRW52RGV0ZWN0aW9uKCkuc2V0RW52aXJvbm1lbnQoZW52LCBhcmcxID09PSB0aGlzLl9ub25jZSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gcGFyc2UgZW52aXJvbm1lbnQgZnJvbSBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZScsIGFyZzApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuRW52U2luZ2xlU3RhcnQ6IHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRTaGVsbEVudkRldGVjdGlvbigpLnN0YXJ0RW52aXJvbm1lbnRTaW5nbGVWYXIoYXJnc1swXSA9PT0gJzEnLCBhcmdzWzFdID09PSB0aGlzLl9ub25jZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5FbnZTaW5nbGVEZWxldGU6IHtcblx0XHRcdFx0Y29uc3QgYXJnMCA9IGFyZ3NbMF07XG5cblx0XHRcdFx0Y29uc3QgYXJnMSA9IGFyZ3NbMV07XG5cdFx0XHRcdGNvbnN0IGFyZzIgPSBhcmdzWzJdO1xuXHRcdFx0XHRpZiAoYXJnMCAhPT0gdW5kZWZpbmVkICYmIGFyZzEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnN0IGVudiA9IGRlc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZShhcmcxKTtcblx0XHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldFNoZWxsRW52RGV0ZWN0aW9uKCkuZGVsZXRlRW52aXJvbm1lbnRTaW5nbGVWYXIoYXJnMCwgZW52LCBhcmcyID09PSB0aGlzLl9ub25jZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LkVudlNpbmdsZUVudHJ5OiB7XG5cdFx0XHRcdGNvbnN0IGFyZzAgPSBhcmdzWzBdO1xuXHRcdFx0XHRjb25zdCBhcmcxID0gYXJnc1sxXTtcblx0XHRcdFx0Y29uc3QgYXJnMiA9IGFyZ3NbMl07XG5cdFx0XHRcdGlmIChhcmcwICE9PSB1bmRlZmluZWQgJiYgYXJnMSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgZW52ID0gZGVzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGFyZzEpO1xuXHRcdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0U2hlbGxFbnZEZXRlY3Rpb24oKS5zZXRFbnZpcm9ubWVudFNpbmdsZVZhcihhcmcwLCBlbnYsIGFyZzIgPT09IHRoaXMuX25vbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuRW52U2luZ2xlRW5kOiB7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0U2hlbGxFbnZEZXRlY3Rpb24oKS5lbmRFbnZpcm9ubWVudFNpbmdsZVZhcihhcmdzWzBdID09PSB0aGlzLl9ub25jZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBWU0NvZGVPc2NQdC5SaWdodFByb21wdFN0YXJ0OiB7XG5cdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuaGFuZGxlUmlnaHRQcm9tcHRTdGFydCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuUmlnaHRQcm9tcHRFbmQ6IHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5oYW5kbGVSaWdodFByb21wdEVuZCgpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNhc2UgVlNDb2RlT3NjUHQuUHJvcGVydHk6IHtcblx0XHRcdFx0Y29uc3QgYXJnMCA9IGFyZ3NbMF07XG5cdFx0XHRcdGNvbnN0IGRlc2VyaWFsaXplZCA9IGFyZzAgIT09IHVuZGVmaW5lZCA/IGRlc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZShhcmcwKSA6ICcnO1xuXHRcdFx0XHRjb25zdCB7IGtleSwgdmFsdWUgfSA9IHBhcnNlS2V5VmFsdWVBc3NpZ25tZW50KGRlc2VyaWFsaXplZCk7XG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoIChrZXkpIHtcblx0XHRcdFx0XHRjYXNlICdDb250aW51YXRpb25Qcm9tcHQnOiB7XG5cdFx0XHRcdFx0XHR0aGlzLl91cGRhdGVDb250aW51YXRpb25Qcm9tcHQocmVtb3ZlQW5zaUVzY2FwZUNvZGVzRnJvbVByb21wdCh2YWx1ZSkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ0N3ZCc6IHtcblx0XHRcdFx0XHRcdC8vIE9TQyA2MzMgOyBQIDsgQ3dkPTx2YWx1ZT4gOyA8bm9uY2U+IFNUIFx1MjAxNCB0aGUgbm9uY2UgaXMgb3B0aW9uYWwgYW5kIG9ubHlcblx0XHRcdFx0XHRcdC8vIHByZXNlbnQgd2hlbiBlbWl0dGVkIGJ5IGEgdHJ1c3RlZCBzaGVsbCBpbnRlZ3JhdGlvbiBzY3JpcHQuIENXRCB1cGRhdGVzXG5cdFx0XHRcdFx0XHQvLyB3aXRob3V0IGEgbWF0Y2hpbmcgbm9uY2UgYXJlIHRyZWF0ZWQgYXMgdW50cnVzdGVkIHRvIG1pdGlnYXRlIHNwb29maW5nXG5cdFx0XHRcdFx0XHQvLyB2aWEgT1NDIHNlcXVlbmNlcyBpbmplY3RlZCB0aHJvdWdoIGFyYml0cmFyeSB0ZXJtaW5hbCBvdXRwdXQuXG5cdFx0XHRcdFx0XHRjb25zdCBub25jZSA9IGFyZ3NbMV07XG5cdFx0XHRcdFx0XHR0aGlzLl91cGRhdGVDd2QodmFsdWUsIG5vbmNlICE9PSB1bmRlZmluZWQgJiYgbm9uY2UgPT09IHRoaXMuX25vbmNlKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdJc1dpbmRvd3MnOiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLnNldElzV2luZG93c1B0eSh2YWx1ZSA9PT0gJ1RydWUnID8gdHJ1ZSA6IGZhbHNlKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdIYXNSaWNoQ29tbWFuZERldGVjdGlvbic6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuc2V0SGFzUmljaENvbW1hbmREZXRlY3Rpb24odmFsdWUgPT09ICdUcnVlJyA/IHRydWUgOiBmYWxzZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnUHJvbXB0Jzoge1xuXHRcdFx0XHRcdFx0Ly8gUmVtb3ZlIGVzY2FwZSBzZXF1ZW5jZXMgZnJvbSB0aGUgdXNlcidzIHByb21wdFxuXHRcdFx0XHRcdFx0Y29uc3Qgc2FuaXRpemVkVmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9cXHgxYlxcW1swLTk7XSptL2csICcnKTtcblx0XHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVByb21wdFRlcm1pbmF0b3Ioc2FuaXRpemVkVmFsdWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ1Byb21wdFR5cGUnOiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldFByb21wdFR5cGVEZXRlY3Rpb24oKS5zZXRQcm9tcHRUeXBlKHZhbHVlKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdUYXNrJzoge1xuXHRcdFx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRCdWZmZXJNYXJrRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKTtcblx0XHRcdFx0XHRcdHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik/LnNldElzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZCgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFZTQ29kZU9zY1B0LlNldE1hcms6IHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlT3JHZXRCdWZmZXJNYXJrRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5hZGRNYXJrKHBhcnNlTWFya1NlcXVlbmNlKGFyZ3MpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVW5yZWNvZ25pemVkIHNlcXVlbmNlXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29udGludWF0aW9uUHJvbXB0KHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NyZWF0ZU9yR2V0Q29tbWFuZERldGVjdGlvbih0aGlzLl90ZXJtaW5hbCkuc2V0Q29udGludWF0aW9uUHJvbXB0KHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVByb21wdFRlcm1pbmF0b3IocHJvbXB0OiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RQcm9tcHRMaW5lID0gcHJvbXB0LnN1YnN0cmluZyhwcm9tcHQubGFzdEluZGV4T2YoJ1xcbicpICsgMSk7XG5cdFx0Y29uc3QgbGFzdFByb21wdExpbmVUcmltbWVkID0gbGFzdFByb21wdExpbmUudHJpbSgpO1xuXHRcdGNvbnN0IHByb21wdFRlcm1pbmF0b3IgPSAoXG5cdFx0XHRsYXN0UHJvbXB0TGluZVRyaW1tZWQubGVuZ3RoID09PSAxXG5cdFx0XHRcdC8vIFRoZSBwcm9tcHQgbGluZSBjb250YWlucyBhIHNpbmdsZSBjaGFyYWN0ZXIsIHRyZWF0IHRoZSBmdWxsIGxpbmUgYXMgdGhlXG5cdFx0XHRcdC8vIHRlcm1pbmF0b3IgZm9yIGV4YW1wbGUgXCJcXHUyYjllIFwiXG5cdFx0XHRcdD8gbGFzdFByb21wdExpbmVcblx0XHRcdFx0OiBsYXN0UHJvbXB0TGluZS5zdWJzdHJpbmcobGFzdFByb21wdExpbmUubGFzdEluZGV4T2YoJyAnKSlcblx0XHQpO1xuXHRcdGlmIChwcm9tcHRUZXJtaW5hdG9yKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLnNldFByb21wdFRlcm1pbmF0b3IocHJvbXB0VGVybWluYXRvciwgbGFzdFByb21wdExpbmUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUN3ZCh2YWx1ZTogc3RyaW5nLCBpc1RydXN0ZWQ6IGJvb2xlYW4gPSB0cnVlKSB7XG5cdFx0dmFsdWUgPSBzYW5pdGl6ZUN3ZCh2YWx1ZSk7XG5cdFx0dGhpcy5fY3JlYXRlT3JHZXRDd2REZXRlY3Rpb24oKS51cGRhdGVDd2QodmFsdWUsIGlzVHJ1c3RlZCk7XG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0Y29tbWFuZERldGVjdGlvbj8uc2V0Q3dkKHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2RvSGFuZGxlSVRlcm1TZXF1ZW5jZShkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2NvbW1hbmRdID0gZGF0YS5zcGxpdCgnOycpO1xuXHRcdHRoaXMuX21hcmtTZXF1ZW5jZVNlZW4oYCR7U2hlbGxJbnRlZ3JhdGlvbk9zY1BzLklUZXJtfTske2NvbW1hbmR9YCk7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlIElUZXJtT3NjUHQuU2V0TWFyazoge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVPckdldEJ1ZmZlck1hcmtEZXRlY3Rpb24odGhpcy5fdGVybWluYWwpLmFkZE1hcmsoKTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0Ly8gQ2hlY2tpbmcgZm9yIGtub3duIGA8a2V5Pj08dmFsdWU+YCBwYWlycy5cblx0XHRcdFx0Ly8gTm90ZSB0aGF0IHVubGlrZSBgVlNDb2RlT3NjUHQuUHJvcGVydHlgLCBpVGVybTIgZG9lcyBub3QgaW50ZXJwcmV0IGJhY2tzbGFzaCBvciBoZXgtZXNjYXBlIHNlcXVlbmNlcy5cblx0XHRcdFx0Ly8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vZ25hY2htYW4vaVRlcm0yL2Jsb2IvYmIwODgyMzMyY2VjNTE5NmU0ZGU0YTQyMjU5NzhkNzQ2ZTkzNTI3OS9zb3VyY2VzL1ZUMTAwVGVybWluYWwubSNMMjA4OS1MMjEwNVxuXHRcdFx0XHRjb25zdCB7IGtleSwgdmFsdWUgfSA9IHBhcnNlS2V5VmFsdWVBc3NpZ25tZW50KGNvbW1hbmQpO1xuXG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gTm8gJz0nIHdhcyBmb3VuZCwgc28gaXQncyBub3QgYSBwcm9wZXJ0eSBhc3NpZ25tZW50LlxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3dpdGNoIChrZXkpIHtcblx0XHRcdFx0XHRjYXNlIElUZXJtT3NjUHQuQ3VycmVudERpcjpcblx0XHRcdFx0XHRcdC8vIEVuY291bnRlcmVkOiBgT1NDIDEzMzcgOyBDdXJyZW50RGlyPTxDd2Q+IFNUYC4gVGhlIGlUZXJtMiBwcm90b2NvbCBoYXMgbm9cblx0XHRcdFx0XHRcdC8vIG5vbmNlLCBzbyBjd2QgdXBkYXRlcyByZWNlaXZlZCB0aGlzIHdheSBhcmUgYWx3YXlzIGNvbnNpZGVyZWQgdW50cnVzdGVkLlxuXHRcdFx0XHRcdFx0dGhpcy5fdXBkYXRlQ3dkKHZhbHVlLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVucmVjb2duaXplZCBzZXF1ZW5jZVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2RvSGFuZGxlU2V0V2luZG93c0ZyaWVuZGx5Q3dkKGRhdGE6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBbY29tbWFuZCwgLi4uYXJnc10gPSBkYXRhLnNwbGl0KCc7Jyk7XG5cdFx0dGhpcy5fbWFya1NlcXVlbmNlU2VlbihgJHtTaGVsbEludGVncmF0aW9uT3NjUHMuU2V0V2luZG93c0ZyaWVuZGx5Q3dkfTske2NvbW1hbmR9YCk7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlICc5Jzpcblx0XHRcdFx0Ly8gRW5jb3VudGVyZWQgYE9TQyA5IDsgOSA7IDxjd2Q+IFNUYC4gVGhlIENvbkVtdS9XaW5kb3dzLWZyaWVuZGx5IGN3ZCBwcm90b2NvbFxuXHRcdFx0XHQvLyBoYXMgbm8gbm9uY2UsIHNvIGN3ZCB1cGRhdGVzIHJlY2VpdmVkIHRoaXMgd2F5IGFyZSBhbHdheXMgY29uc2lkZXJlZCB1bnRydXN0ZWQuXG5cdFx0XHRcdGlmIChhcmdzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUN3ZChhcmdzWzBdLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gVW5yZWNvZ25pemVkIHNlcXVlbmNlXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlIHNlcXVlbmNlOiBgT1NDIDcgOyBzY2hlbWU6Ly9jd2QgU1RgXG5cdCAqL1xuXHRwcml2YXRlIF9kb0hhbmRsZVNldEN3ZChkYXRhOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2NvbW1hbmRdID0gZGF0YS5zcGxpdCgnOycpO1xuXHRcdHRoaXMuX21hcmtTZXF1ZW5jZVNlZW4oYCR7U2hlbGxJbnRlZ3JhdGlvbk9zY1BzLlNldEN3ZH07JHtjb21tYW5kfWApO1xuXG5cdFx0aWYgKGNvbW1hbmQubWF0Y2goL15maWxlOlxcL1xcLy4qXFwvLykpIHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShjb21tYW5kKTtcblx0XHRcdGlmICh1cmkucGF0aCAmJiB1cmkucGF0aC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIFRoZSBgT1NDIDcgOyBzY2hlbWU6Ly9jd2QgU1RgIHByb3RvY29sIGhhcyBubyBub25jZSwgc28gY3dkIHVwZGF0ZXMgcmVjZWl2ZWRcblx0XHRcdFx0Ly8gdGhpcyB3YXkgYXJlIGFsd2F5cyBjb25zaWRlcmVkIHVudHJ1c3RlZC5cblx0XHRcdFx0dGhpcy5fdXBkYXRlQ3dkKHVyaS5wYXRoLCBmYWxzZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVucmVjb2duaXplZCBzZXF1ZW5jZVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IHtcblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsIHx8ICF0aGlzLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpc1dpbmRvd3NQdHk6IGZhbHNlLFxuXHRcdFx0XHRoYXNSaWNoQ29tbWFuZERldGVjdGlvbjogZmFsc2UsXG5cdFx0XHRcdGNvbW1hbmRzOiBbXSxcblx0XHRcdFx0cHJvbXB0SW5wdXRNb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKS5zZXJpYWxpemUoKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZGVzZXJpYWxpemUoc2VyaWFsaXplZDogSVNlcmlhbGl6ZWRDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGVybWluYWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlc3RvcmUgY29tbWFuZHMgYmVmb3JlIGFkZG9uIGlzIGFjdGl2YXRlZCcpO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRoaXMuX3Rlcm1pbmFsKTtcblx0XHRjb21tYW5kRGV0ZWN0aW9uLmRlc2VyaWFsaXplKHNlcmlhbGl6ZWQpO1xuXHRcdGlmIChjb21tYW5kRGV0ZWN0aW9uLmN3ZCkge1xuXHRcdFx0Ly8gQ3dkIGdldHMgc2V0IHdoZW4gdGhlIGNvbW1hbmQgaXMgZGVzZXJpYWxpemVkLCBzbyB3ZSBuZWVkIHRvIHVwZGF0ZSBpdCBoZXJlXG5cdFx0XHR0aGlzLl91cGRhdGVDd2QoY29tbWFuZERldGVjdGlvbi5jd2QsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZU9yR2V0Q3dkRGV0ZWN0aW9uKCk6IElDd2REZXRlY3Rpb25DYXBhYmlsaXR5IHtcblx0XHRsZXQgY3dkRGV0ZWN0aW9uID0gdGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24pO1xuXHRcdGlmICghY3dkRGV0ZWN0aW9uKSB7XG5cdFx0XHRjd2REZXRlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQ3dkRGV0ZWN0aW9uQ2FwYWJpbGl0eSgpKTtcblx0XHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uLCBjd2REZXRlY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gY3dkRGV0ZWN0aW9uO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVPckdldENvbW1hbmREZXRlY3Rpb24odGVybWluYWw6IFRlcm1pbmFsKTogSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IHtcblx0XHRsZXQgY29tbWFuZERldGVjdGlvbiA9IHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0aWYgKCFjb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KHRlcm1pbmFsLCB0aGlzLl9sb2dTZXJ2aWNlKSk7XG5cdFx0XHR0aGlzLmNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24sIGNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gY29tbWFuZERldGVjdGlvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlT3JHZXRCdWZmZXJNYXJrRGV0ZWN0aW9uKHRlcm1pbmFsOiBUZXJtaW5hbCk6IElCdWZmZXJNYXJrQ2FwYWJpbGl0eSB7XG5cdFx0bGV0IGJ1ZmZlck1hcmtEZXRlY3Rpb24gPSB0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24pO1xuXHRcdGlmICghYnVmZmVyTWFya0RldGVjdGlvbikge1xuXHRcdFx0YnVmZmVyTWFya0RldGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdWZmZXJNYXJrQ2FwYWJpbGl0eSh0ZXJtaW5hbCkpO1xuXHRcdFx0dGhpcy5jYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uLCBidWZmZXJNYXJrRGV0ZWN0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGJ1ZmZlck1hcmtEZXRlY3Rpb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZU9yR2V0U2hlbGxFbnZEZXRlY3Rpb24oKTogSVNoZWxsRW52RGV0ZWN0aW9uQ2FwYWJpbGl0eSB7XG5cdFx0bGV0IHNoZWxsRW52RGV0ZWN0aW9uID0gdGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5TaGVsbEVudkRldGVjdGlvbik7XG5cdFx0aWYgKCFzaGVsbEVudkRldGVjdGlvbikge1xuXHRcdFx0c2hlbGxFbnZEZXRlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5KCkpO1xuXHRcdFx0dGhpcy5jYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5TaGVsbEVudkRldGVjdGlvbiwgc2hlbGxFbnZEZXRlY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gc2hlbGxFbnZEZXRlY3Rpb247XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZU9yR2V0UHJvbXB0VHlwZURldGVjdGlvbigpOiBJUHJvbXB0VHlwZURldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRcdGxldCBwcm9tcHRUeXBlRGV0ZWN0aW9uID0gdGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Qcm9tcHRUeXBlRGV0ZWN0aW9uKTtcblx0XHRpZiAoIXByb21wdFR5cGVEZXRlY3Rpb24pIHtcblx0XHRcdHByb21wdFR5cGVEZXRlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUHJvbXB0VHlwZURldGVjdGlvbkNhcGFiaWxpdHkoKSk7XG5cdFx0XHR0aGlzLmNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LlByb21wdFR5cGVEZXRlY3Rpb24sIHByb21wdFR5cGVEZXRlY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvbXB0VHlwZURldGVjdGlvbjtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBtZXNzYWdlLnJlcGxhY2VBbGwoXG5cdFx0Ly8gQmFja3NsYXNoICgnXFwnKSBmb2xsb3dlZCBieSBhbiBlc2NhcGUgb3BlcmF0b3I6IGVpdGhlciBhbm90aGVyICdcXCcsIG9yICd4JyBhbmQgdHdvIGhleCBjaGFycy5cblx0XHQvXFxcXChcXFxcfHgoWzAtOWEtZl17Mn0pKS9naSxcblx0XHQvLyBJZiBpdCdzIGEgaGV4IHZhbHVlLCBwYXJzZSBpdCB0byBhIGNoYXJhY3Rlci5cblx0XHQvLyBPdGhlcndpc2UgdGhlIG9wZXJhdG9yIGlzICdcXCcsIHdoaWNoIHdlIHJldHVybiBsaXRlcmFsbHksIG5vdyB1bmVzY2FwZWQuXG5cdFx0KF9tYXRjaDogc3RyaW5nLCBvcDogc3RyaW5nLCBoZXg/OiBzdHJpbmcpID0+IGhleCA/IFN0cmluZy5mcm9tQ2hhckNvZGUocGFyc2VJbnQoaGV4LCAxNikpIDogb3ApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gbWVzc2FnZS5yZXBsYWNlKFxuXHRcdC8vIE1hdGNoIGJhY2tzbGFzaCAoJ1xcJyksIHNlbWljb2xvbiAoJzsnKSwgb3IgY2hhcmFjdGVycyAweDIwIGFuZCBiZWxvd1xuXHRcdC9bXFxcXDtcXHgwMC1cXHgyMF0vZyxcblx0XHQoY2hhcjogc3RyaW5nKSA9PiB7XG5cdFx0XHQvLyBFc2NhcGUgYmFja3NsYXNoIGFzICdcXFxcJ1xuXHRcdFx0aWYgKGNoYXIgPT09ICdcXFxcJykge1xuXHRcdFx0XHRyZXR1cm4gJ1xcXFxcXFxcJztcblx0XHRcdH1cblx0XHRcdC8vIEVzY2FwZSBvdGhlciBjaGFyYWN0ZXJzIGFzICdcXHhBQicgd2hlcmUgQUIgaXMgdGhlIGhleCByZXByZXNlbnRhdGlvblxuXHRcdFx0Y29uc3QgY2hhckNvZGUgPSBjaGFyLmNoYXJDb2RlQXQoMCk7XG5cdFx0XHRyZXR1cm4gYFxcXFx4JHtjaGFyQ29kZS50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKX1gO1xuXHRcdH1cblx0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlS2V5VmFsdWVBc3NpZ25tZW50KG1lc3NhZ2U6IHN0cmluZyk6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB7XG5cdGNvbnN0IHNlcGFyYXRvckluZGV4ID0gbWVzc2FnZS5pbmRleE9mKCc9Jyk7XG5cdGlmIChzZXBhcmF0b3JJbmRleCA9PT0gLTEpIHtcblx0XHRyZXR1cm4geyBrZXk6IG1lc3NhZ2UsIHZhbHVlOiB1bmRlZmluZWQgfTsgLy8gTm8gJz0nIHdhcyBmb3VuZC5cblx0fVxuXHRyZXR1cm4ge1xuXHRcdGtleTogbWVzc2FnZS5zdWJzdHJpbmcoMCwgc2VwYXJhdG9ySW5kZXgpLFxuXHRcdHZhbHVlOiBtZXNzYWdlLnN1YnN0cmluZygxICsgc2VwYXJhdG9ySW5kZXgpXG5cdH07XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTWFya1NlcXVlbmNlKHNlcXVlbmNlOiAoc3RyaW5nIHwgdW5kZWZpbmVkKVtdKTogeyBpZD86IHN0cmluZzsgaGlkZGVuPzogYm9vbGVhbiB9IHtcblx0bGV0IGlkID0gdW5kZWZpbmVkO1xuXHRsZXQgaGlkZGVuID0gZmFsc2U7XG5cdGZvciAoY29uc3QgcHJvcGVydHkgb2Ygc2VxdWVuY2UpIHtcblx0XHQvLyBTYW5pdHkgY2hlY2ssIHRoaXMgc2hvdWxkbid0IGhhcHBlbiBpbiBwcmFjdGljZVxuXHRcdGlmIChwcm9wZXJ0eSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHByb3BlcnR5ID09PSAnSGlkZGVuJykge1xuXHRcdFx0aGlkZGVuID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHByb3BlcnR5LnN0YXJ0c1dpdGgoJ0lkPScpKSB7XG5cdFx0XHRpZCA9IHByb3BlcnR5LnN1YnN0cmluZygzKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHsgaWQsIGhpZGRlbiB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBNEIsOEJBQThCO0FBQzFELFNBQVMsWUFBWSxTQUFzQixvQkFBb0I7QUFDL0QsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBMkwsMEJBQTBCO0FBQ3JOLFNBQVMseUNBQXlDO0FBR2xELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMscUNBQXFDO0FBaUJ2QyxJQUFXLHdCQUFYLGtC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QUUsS0FBSyxTQUFTLE9BQU8sT0FBVTtBQUFBLEVBQ3pDO0FBQ0EsU0FBTztBQUFBLElBQ04sS0FBSyxRQUFRLFVBQVUsR0FBRyxjQUFjO0FBQUEsSUFDeEMsT0FBTyxRQUFRLFVBQVUsSUFBSSxjQUFjO0FBQUEsRUFDNUM7QUFDRDtBQUdPLFNBQVMsa0JBQWtCLFVBQXFFO0FBQ3RHLE1BQUksS0FBSztBQUNULE1BQUksU0FBUztBQUNiLGFBQVcsWUFBWSxVQUFVO0FBRWhDLFFBQUksYUFBYSxRQUFXO0FBQzNCO0FBQUEsSUFDRDtBQUNBLFFBQUksYUFBYSxVQUFVO0FBQzFCLGVBQVM7QUFBQSxJQUNWO0FBQ0EsUUFBSSxTQUFTLFdBQVcsS0FBSyxHQUFHO0FBQy9CLFdBQUssU0FBUyxVQUFVLENBQUM7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFDQSxTQUFPLEVBQUUsSUFBSSxPQUFPO0FBQ3JCOyIsCiAgIm5hbWVzIjogWyJTaGVsbEludGVncmF0aW9uT3NjUHMiLCAiRmluYWxUZXJtT3NjUHQiLCAiVlNDb2RlT3NjUHQiLCAiSVRlcm1Pc2NQdCJdCn0K
