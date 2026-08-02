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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { debounce } from "../../../../base/common/decorators.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, MandatoryMutableDisposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ILogService } from "../../../log/common/log.js";
import { isString } from "../../../../base/common/types.js";
import { CommandInvalidationReason, TerminalCapability } from "./capabilities.js";
import { isFullTerminalCommand, PartialTerminalCommand, TerminalCommand } from "./commandDetection/terminalCommand.js";
import { PromptInputModel } from "./commandDetection/promptInputModel.js";
let CommandDetectionCapability = class extends Disposable {
  constructor(_terminal, _logService) {
    super();
    this._terminal = _terminal;
    this._logService = _logService;
    this.type = TerminalCapability.CommandDetection;
    this._commands = [];
    this._commandMarkers = [];
    this.__isCommandStorageDisabled = false;
    this._hasRichCommandDetection = false;
    this._isCurrentCommandInterrupted = false;
    this._onCommandStarted = this._register(new Emitter());
    this.onCommandStarted = this._onCommandStarted.event;
    this._onCommandStartChanged = this._register(new Emitter());
    this.onCommandStartChanged = this._onCommandStartChanged.event;
    this._onBeforeCommandFinished = this._register(new Emitter());
    this.onBeforeCommandFinished = this._onBeforeCommandFinished.event;
    this._onCommandFinished = this._register(new Emitter());
    this.onCommandFinished = this._onCommandFinished.event;
    this._onCommandExecuted = this._register(new Emitter());
    this.onCommandExecuted = this._onCommandExecuted.event;
    this._onCommandInvalidated = this._register(new Emitter());
    this.onCommandInvalidated = this._onCommandInvalidated.event;
    this._onCurrentCommandInvalidated = this._register(new Emitter());
    this.onCurrentCommandInvalidated = this._onCurrentCommandInvalidated.event;
    this._onSetRichCommandDetection = this._register(new Emitter());
    this.onSetRichCommandDetection = this._onSetRichCommandDetection.event;
    this._currentCommand = new PartialTerminalCommand(this._terminal);
    this._promptInputModel = this._register(new PromptInputModel(this._terminal, this.onCommandStarted, this.onCommandStartChanged, this.onCommandExecuted, this.onCommandFinished, this._logService));
    this._register(this._promptInputModel.onDidInterrupt(() => this._isCurrentCommandInterrupted = true));
    this._register(this.onCommandExecuted((command) => {
      if (command.commandLineConfidence !== "high") {
        const typedCommand = command;
        command.command = typedCommand.extractCommandLine();
        command.commandLineConfidence = "low";
        if (isFullTerminalCommand(typedCommand)) {
          if (
            // Markers exist
            typedCommand.promptStartMarker && typedCommand.marker && typedCommand.executedMarker && // Single line command
            command.command.indexOf("\n") === -1 && // Start marker is not on the left-most column
            typedCommand.startX !== void 0 && typedCommand.startX > 0
          ) {
            command.commandLineConfidence = "medium";
          }
        } else {
          if (
            // Markers exist
            typedCommand.promptStartMarker && typedCommand.commandStartMarker && typedCommand.commandExecutedMarker && // Single line command
            command.command.indexOf("\n") === -1 && // Start marker is not on the left-most column
            typedCommand.commandStartX !== void 0 && typedCommand.commandStartX > 0
          ) {
            command.commandLineConfidence = "medium";
          }
        }
      }
    }));
    this._register(this._terminal.parser.registerCsiHandler({ final: "J" }, (params) => {
      if (params.length >= 1 && params[0] === 2) {
        if (!this._terminal.options.scrollOnEraseInDisplay) {
          this._clearCommandsInViewport();
        }
        this._currentCommand.wasCleared = true;
      }
      return false;
    }));
    const that = this;
    this._ptyHeuristicsHooks = new class {
      get onCurrentCommandInvalidatedEmitter() {
        return that._onCurrentCommandInvalidated;
      }
      get onCommandStartedEmitter() {
        return that._onCommandStarted;
      }
      get onCommandExecutedEmitter() {
        return that._onCommandExecuted;
      }
      get dimensions() {
        return that._dimensions;
      }
      get isCommandStorageDisabled() {
        return that.__isCommandStorageDisabled;
      }
      get commandMarkers() {
        return that._commandMarkers;
      }
      set commandMarkers(value) {
        that._commandMarkers = value;
      }
      get clearCommandsInViewport() {
        return that._clearCommandsInViewport.bind(that);
      }
    }();
    this._ptyHeuristics = this._register(new MandatoryMutableDisposable(new UnixPtyHeuristics(this._terminal, this, this._ptyHeuristicsHooks, this._logService)));
    this._dimensions = {
      cols: this._terminal.cols,
      rows: this._terminal.rows
    };
    this._register(this._terminal.onResize((e) => this._handleResize(e)));
    this._register(this._terminal.onCursorMove(() => this._handleCursorMove()));
  }
  get promptInputModel() {
    return this._promptInputModel;
  }
  get hasRichCommandDetection() {
    return this._hasRichCommandDetection;
  }
  get commands() {
    return this._commands;
  }
  get executingCommand() {
    return this._currentCommand.command;
  }
  get executingCommandObject() {
    if (this._currentCommand.commandStartMarker) {
      return this._currentCommand.promoteToFullCommand(this._cwd, void 0, this._handleCommandStartOptions?.ignoreCommandLine ?? false, void 0);
    }
    return void 0;
  }
  get executingCommandConfidence() {
    const casted = this._currentCommand;
    return isFullTerminalCommand(casted) ? casted.commandLineConfidence : void 0;
  }
  get currentCommand() {
    return this._currentCommand;
  }
  get cwd() {
    return this._cwd;
  }
  get promptTerminator() {
    return this._promptTerminator;
  }
  _handleResize(e) {
    this._ptyHeuristics.value.preHandleResize?.(e);
    this._dimensions.cols = e.cols;
    this._dimensions.rows = e.rows;
  }
  _handleCursorMove() {
    if (this._store.isDisposed) {
      return;
    }
    if (this._terminal.buffer.active === this._terminal.buffer.normal && this._currentCommand.commandStartMarker) {
      if (this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY < this._currentCommand.commandStartMarker.line) {
        this._clearCommandsInViewport();
        this._currentCommand.isInvalid = true;
        this._onCurrentCommandInvalidated.fire({ reason: CommandInvalidationReason.Windows });
      }
    }
  }
  _clearCommandsInViewport() {
    let count = 0;
    for (let i = this._commands.length - 1; i >= 0; i--) {
      const line = this._commands[i].marker?.line;
      if (line && line < this._terminal.buffer.active.baseY) {
        break;
      }
      count++;
    }
    if (count > 0) {
      this._onCommandInvalidated.fire(this._commands.splice(this._commands.length - count, count));
    }
  }
  setContinuationPrompt(value) {
    this._promptInputModel.setContinuationPrompt(value);
  }
  // TODO: Simplify this, can everything work off the last line?
  setPromptTerminator(promptTerminator, lastPromptLine) {
    this._logService.debug("CommandDetectionCapability#setPromptTerminator", promptTerminator);
    this._promptTerminator = promptTerminator;
    this._promptInputModel.setLastPromptLine(lastPromptLine);
  }
  setCwd(value) {
    this._cwd = value;
  }
  setIsWindowsPty(value) {
    if (value && !(this._ptyHeuristics.value instanceof WindowsPtyHeuristics)) {
      const that = this;
      this._ptyHeuristics.value = new WindowsPtyHeuristics(
        this._terminal,
        this,
        new class {
          get onCurrentCommandInvalidatedEmitter() {
            return that._onCurrentCommandInvalidated;
          }
          get onCommandStartedEmitter() {
            return that._onCommandStarted;
          }
          get onCommandExecutedEmitter() {
            return that._onCommandExecuted;
          }
          get dimensions() {
            return that._dimensions;
          }
          get isCommandStorageDisabled() {
            return that.__isCommandStorageDisabled;
          }
          get commandMarkers() {
            return that._commandMarkers;
          }
          set commandMarkers(value2) {
            that._commandMarkers = value2;
          }
          get clearCommandsInViewport() {
            return that._clearCommandsInViewport.bind(that);
          }
        }(),
        this._logService
      );
    } else if (!value && !(this._ptyHeuristics.value instanceof UnixPtyHeuristics)) {
      this._ptyHeuristics.value = new UnixPtyHeuristics(this._terminal, this, this._ptyHeuristicsHooks, this._logService);
    }
  }
  setHasRichCommandDetection(value) {
    this._hasRichCommandDetection = value;
    this._onSetRichCommandDetection.fire(value);
  }
  setIsCommandStorageDisabled() {
    this.__isCommandStorageDisabled = true;
  }
  getCommandForLine(line) {
    if (this._currentCommand.promptStartMarker && line >= this._currentCommand.promptStartMarker?.line) {
      return this._currentCommand;
    }
    if (this._commands.length === 0) {
      return void 0;
    }
    if ((this._commands[0].promptStartMarker ?? this._commands[0].marker).line > line) {
      return void 0;
    }
    for (let i = this.commands.length - 1; i >= 0; i--) {
      if ((this.commands[i].promptStartMarker ?? this.commands[i].marker).line <= line) {
        return this.commands[i];
      }
    }
    return void 0;
  }
  getCwdForLine(line) {
    if (this._currentCommand.promptStartMarker && line >= this._currentCommand.promptStartMarker?.line) {
      return this._cwd;
    }
    const command = this.getCommandForLine(line);
    if (command && isFullTerminalCommand(command)) {
      return command.cwd;
    }
    return void 0;
  }
  handlePromptStart(options) {
    this._isCurrentCommandInterrupted = false;
    const lastCommand = this.commands.at(-1);
    if (lastCommand?.endMarker && lastCommand?.executedMarker && lastCommand.endMarker.line === lastCommand.executedMarker.line && lastCommand.executedMarker.line < this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY) {
      this._logService.debug("CommandDetectionCapability#handlePromptStart adjusted commandFinished", `${lastCommand.endMarker.line} -> ${lastCommand.executedMarker.line + 1}`);
      lastCommand.endMarker = cloneMarker(this._terminal, lastCommand.executedMarker, 1);
    }
    this._currentCommand.promptStartMarker = options?.marker || // Generally the prompt start should happen at the exact place the endmarker happened.
    // However, after ctrl+l is used to clear the display, we want to ensure the actual
    // prompt start marker position is used. This is mostly a workaround for Windows but we
    // apply it generally.
    (!this._currentCommand.wasCleared && lastCommand?.endMarker ? cloneMarker(this._terminal, lastCommand.endMarker) : this._terminal.registerMarker(0));
    this._currentCommand.wasCleared = false;
  }
  handleContinuationStart() {
    this._currentCommand.currentContinuationMarker = this._terminal.registerMarker(0);
    this._logService.debug("CommandDetectionCapability#handleContinuationStart", this._currentCommand.currentContinuationMarker);
  }
  handleContinuationEnd() {
    if (!this._currentCommand.currentContinuationMarker) {
      this._logService.warn("CommandDetectionCapability#handleContinuationEnd Received continuation end without start");
      return;
    }
    if (!this._currentCommand.continuations) {
      this._currentCommand.continuations = [];
    }
    this._currentCommand.continuations.push({
      marker: this._currentCommand.currentContinuationMarker,
      end: this._terminal.buffer.active.cursorX
    });
    this._currentCommand.currentContinuationMarker = void 0;
    this._logService.debug("CommandDetectionCapability#handleContinuationEnd", this._currentCommand.continuations[this._currentCommand.continuations.length - 1]);
  }
  handleRightPromptStart() {
    this._currentCommand.commandRightPromptStartX = this._terminal.buffer.active.cursorX;
    this._logService.debug("CommandDetectionCapability#handleRightPromptStart", this._currentCommand.commandRightPromptStartX);
  }
  handleRightPromptEnd() {
    this._currentCommand.commandRightPromptEndX = this._terminal.buffer.active.cursorX;
    this._logService.debug("CommandDetectionCapability#handleRightPromptEnd", this._currentCommand.commandRightPromptEndX);
  }
  handleCommandStart(options) {
    this._handleCommandStartOptions = options;
    this._currentCommand.cwd = this._cwd;
    this._currentCommand.commandStartMarker = options?.marker || this._currentCommand.commandStartMarker;
    if (this._currentCommand.commandStartMarker?.line === this._terminal.buffer.active.cursorY) {
      this._currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
      this._onCommandStartChanged.fire();
      this._logService.debug("CommandDetectionCapability#handleCommandStart", this._currentCommand.commandStartX, this._currentCommand.commandStartMarker?.line);
      return;
    }
    this._ptyHeuristics.value.handleCommandStart(options);
  }
  /**
   * Sets the command ID to use for the next command that starts.
   * This is useful when you want to pre-assign an ID before the shell sends the command start sequence.
   */
  setNextCommandId(command, commandId) {
    this._nextCommandId = { command, commandId };
  }
  handleCommandExecuted(options) {
    this._ensureCurrentCommandId(this._currentCommand.command ?? this._currentCommand.extractCommandLine());
    this._ptyHeuristics.value.handleCommandExecuted(options);
    this._currentCommand.markExecutedTime();
  }
  handleCommandFinished(exitCode, options) {
    if (!this._currentCommand.commandExecutedMarker) {
      this.handleCommandExecuted();
    }
    this._currentCommand.markFinishedTime();
    this._ptyHeuristics.value.preHandleCommandFinished?.();
    this._logService.debug("CommandDetectionCapability#handleCommandFinished", this._terminal.buffer.active.cursorX, options?.marker?.line, this._currentCommand.command, this._currentCommand);
    if (exitCode === void 0 && !this._isCurrentCommandInterrupted) {
      const lastCommand = this.commands.length > 0 ? this.commands[this.commands.length - 1] : void 0;
      if (this._currentCommand.command && this._currentCommand.command.length > 0 && lastCommand?.command === this._currentCommand.command) {
        exitCode = lastCommand.exitCode;
      }
    }
    if (this._currentCommand.commandStartMarker === void 0 || !this._terminal.buffer.active) {
      return;
    }
    this._currentCommand.commandFinishedMarker = options?.marker || this._terminal.registerMarker(0);
    this._ptyHeuristics.value.postHandleCommandFinished?.();
    const newCommand = this._currentCommand.promoteToFullCommand(this._cwd, exitCode, this._handleCommandStartOptions?.ignoreCommandLine ?? false, options?.markProperties);
    if (newCommand) {
      this._commands.push(newCommand);
      this._onBeforeCommandFinished.fire(newCommand);
      this._logService.debug("CommandDetectionCapability#onCommandFinished", newCommand);
      this._onCommandFinished.fire(newCommand);
    }
    this._currentCommand = new PartialTerminalCommand(this._terminal);
    this._handleCommandStartOptions = void 0;
  }
  _ensureCurrentCommandId(_commandLine) {
    if (this._nextCommandId?.commandId) {
      if (this._currentCommand.id !== this._nextCommandId.commandId) {
        this._currentCommand.id = this._nextCommandId.commandId;
      }
      this._nextCommandId = void 0;
    }
  }
  setCommandLine(commandLine, isTrusted) {
    this._logService.debug("CommandDetectionCapability#setCommandLine", commandLine, isTrusted);
    this._currentCommand.command = commandLine;
    this._currentCommand.commandLineConfidence = "high";
    this._currentCommand.isTrusted = isTrusted;
    if (isTrusted) {
      this._promptInputModel.setConfidentCommandLine(commandLine);
    }
  }
  serialize() {
    const commands = this.commands.map((e) => e.serialize(this.__isCommandStorageDisabled));
    const partialCommand = this._currentCommand.serialize(this._cwd);
    if (partialCommand) {
      commands.push(partialCommand);
    }
    return {
      isWindowsPty: this._ptyHeuristics.value instanceof WindowsPtyHeuristics,
      hasRichCommandDetection: this._hasRichCommandDetection,
      commands,
      promptInputModel: this._promptInputModel.serialize()
    };
  }
  deserialize(serialized) {
    if (serialized.isWindowsPty) {
      this.setIsWindowsPty(serialized.isWindowsPty);
    }
    if (serialized.hasRichCommandDetection) {
      this.setHasRichCommandDetection(serialized.hasRichCommandDetection);
    }
    const buffer = this._terminal.buffer.normal;
    for (const e of serialized.commands) {
      if (!e.endLine) {
        const marker = e.startLine !== void 0 ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : void 0;
        if (!marker) {
          continue;
        }
        this._currentCommand.commandStartMarker = e.startLine !== void 0 ? this._terminal.registerMarker(e.startLine - (buffer.baseY + buffer.cursorY)) : void 0;
        this._currentCommand.commandStartX = e.startX;
        this._currentCommand.promptStartMarker = e.promptStartLine !== void 0 ? this._terminal.registerMarker(e.promptStartLine - (buffer.baseY + buffer.cursorY)) : void 0;
        this._cwd = e.cwd;
        this._onCommandStarted.fire({ marker });
        continue;
      }
      const newCommand = TerminalCommand.deserialize(this._terminal, e, this.__isCommandStorageDisabled);
      if (!newCommand) {
        continue;
      }
      this._commands.push(newCommand);
      this._logService.debug("CommandDetectionCapability#onCommandFinished", newCommand);
      this._onCommandFinished.fire(newCommand);
    }
    if (serialized.promptInputModel) {
      this._promptInputModel.deserialize(serialized.promptInputModel);
    }
  }
};
__decorateClass([
  debounce(500)
], CommandDetectionCapability.prototype, "_handleCursorMove", 1);
CommandDetectionCapability = __decorateClass([
  __decorateParam(1, ILogService)
], CommandDetectionCapability);
class UnixPtyHeuristics extends Disposable {
  constructor(_terminal, _capability, _hooks, _logService) {
    super();
    this._terminal = _terminal;
    this._capability = _capability;
    this._hooks = _hooks;
    this._logService = _logService;
  }
  handleCommandStart(options) {
    const currentCommand = this._capability.currentCommand;
    currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
    currentCommand.commandStartMarker = options?.marker || this._terminal.registerMarker(0);
    currentCommand.commandExecutedMarker?.dispose();
    currentCommand.commandExecutedMarker = void 0;
    currentCommand.commandExecutedX = void 0;
    for (const m of this._hooks.commandMarkers) {
      m.dispose();
    }
    this._hooks.commandMarkers.length = 0;
    this._hooks.onCommandStartedEmitter.fire({ marker: options?.marker || currentCommand.commandStartMarker, markProperties: options?.markProperties });
    this._logService.debug("CommandDetectionCapability#handleCommandStart", currentCommand.commandStartX, currentCommand.commandStartMarker?.line);
  }
  handleCommandExecuted(options) {
    const currentCommand = this._capability.currentCommand;
    currentCommand.commandExecutedMarker = options?.marker || this._terminal.registerMarker(0);
    currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
    this._logService.debug("CommandDetectionCapability#handleCommandExecuted", currentCommand.commandExecutedX, currentCommand.commandExecutedMarker?.line);
    if (!currentCommand.commandStartMarker || !currentCommand.commandExecutedMarker || currentCommand.commandStartX === void 0) {
      return;
    }
    currentCommand.command = this._capability.promptInputModel.ghostTextIndex > -1 ? this._capability.promptInputModel.value.substring(0, this._capability.promptInputModel.ghostTextIndex) : this._capability.promptInputModel.value;
    this._hooks.onCommandExecutedEmitter.fire(currentCommand);
  }
}
var AdjustCommandStartMarkerConstants = /* @__PURE__ */ ((AdjustCommandStartMarkerConstants2) => {
  AdjustCommandStartMarkerConstants2[AdjustCommandStartMarkerConstants2["MaxCheckLineCount"] = 10] = "MaxCheckLineCount";
  AdjustCommandStartMarkerConstants2[AdjustCommandStartMarkerConstants2["Interval"] = 20] = "Interval";
  AdjustCommandStartMarkerConstants2[AdjustCommandStartMarkerConstants2["MaximumPollCount"] = 10] = "MaximumPollCount";
  return AdjustCommandStartMarkerConstants2;
})(AdjustCommandStartMarkerConstants || {});
let WindowsPtyHeuristics = class extends Disposable {
  constructor(_terminal, _capability, _hooks, _logService) {
    super();
    this._terminal = _terminal;
    this._capability = _capability;
    this._hooks = _hooks;
    this._logService = _logService;
    this._onCursorMoveListener = this._register(new MutableDisposable());
    this._tryAdjustCommandStartMarkerScannedLineCount = 0;
    this._tryAdjustCommandStartMarkerPollCount = 0;
    this._register(this._capability.onBeforeCommandFinished((command) => {
      if (command.command.trim().toLowerCase() === "clear" || command.command.trim().toLowerCase() === "cls") {
        this._tryAdjustCommandStartMarkerScheduler?.cancel();
        this._tryAdjustCommandStartMarkerScheduler = void 0;
        this._hooks.clearCommandsInViewport();
        this._capability.currentCommand.isInvalid = true;
        this._hooks.onCurrentCommandInvalidatedEmitter.fire({ reason: CommandInvalidationReason.Windows });
      }
    }));
  }
  preHandleResize(e) {
    const baseY = this._terminal.buffer.active.baseY;
    const rowsDifference = e.rows - this._hooks.dimensions.rows;
    if (rowsDifference > 0) {
      this._waitForCursorMove().then(() => {
        const potentialShiftedLineCount = Math.min(rowsDifference, baseY);
        for (let i = this._capability.commands.length - 1; i >= 0; i--) {
          const command = this._capability.commands[i];
          if (!command.marker || command.marker.line < baseY || command.commandStartLineContent === void 0) {
            break;
          }
          const line = this._terminal.buffer.active.getLine(command.marker.line);
          if (!line || line.translateToString(true) === command.commandStartLineContent) {
            continue;
          }
          const shiftedY = command.marker.line - potentialShiftedLineCount;
          const shiftedLine = this._terminal.buffer.active.getLine(shiftedY);
          if (shiftedLine?.translateToString(true) !== command.commandStartLineContent) {
            continue;
          }
          this._terminal._core._bufferService.buffer.lines.onDeleteEmitter.fire({
            index: this._terminal.buffer.active.baseY,
            amount: potentialShiftedLineCount
          });
        }
      });
    }
  }
  handleCommandStart() {
    this._capability.currentCommand.commandStartX = this._terminal.buffer.active.cursorX;
    this._hooks.commandMarkers.length = 0;
    const initialCommandStartMarker = this._capability.currentCommand.commandStartMarker = this._capability.currentCommand.promptStartMarker ? cloneMarker(this._terminal, this._capability.currentCommand.promptStartMarker) : this._terminal.registerMarker(0);
    this._capability.currentCommand.commandStartX = 0;
    this._tryAdjustCommandStartMarkerScannedLineCount = 0;
    this._tryAdjustCommandStartMarkerPollCount = 0;
    this._tryAdjustCommandStartMarkerScheduler = new RunOnceScheduler(() => this._tryAdjustCommandStartMarker(initialCommandStartMarker), 20 /* Interval */);
    this._tryAdjustCommandStartMarkerScheduler.schedule();
  }
  _tryAdjustCommandStartMarker(start) {
    if (this._store.isDisposed) {
      return;
    }
    const buffer = this._terminal.buffer.active;
    let scannedLineCount = this._tryAdjustCommandStartMarkerScannedLineCount;
    while (scannedLineCount < 10 /* MaxCheckLineCount */ && start.line + scannedLineCount < buffer.baseY + this._terminal.rows) {
      if (this._cursorOnNextLine()) {
        const prompt = this._getWindowsPrompt(start.line + scannedLineCount);
        if (prompt) {
          const adjustedPrompt = isString(prompt) ? prompt : prompt.prompt;
          this._capability.currentCommand.commandStartMarker = this._terminal.registerMarker(0);
          if (!isString(prompt) && prompt.likelySingleLine) {
            this._logService.debug("CommandDetectionCapability#_tryAdjustCommandStartMarker adjusted promptStart", `${this._capability.currentCommand.promptStartMarker?.line} -> ${this._capability.currentCommand.commandStartMarker.line}`);
            this._capability.currentCommand.promptStartMarker?.dispose();
            this._capability.currentCommand.promptStartMarker = cloneMarker(this._terminal, this._capability.currentCommand.commandStartMarker);
            const lastCommand = this._capability.commands.at(-1);
            if (lastCommand && this._capability.currentCommand.commandStartMarker.line !== lastCommand.endMarker?.line) {
              lastCommand.endMarker?.dispose();
              lastCommand.endMarker = cloneMarker(this._terminal, this._capability.currentCommand.commandStartMarker);
            }
          }
          this._capability.currentCommand.commandStartX = adjustedPrompt.length;
          this._logService.debug("CommandDetectionCapability#_tryAdjustCommandStartMarker adjusted commandStart", `${start.line} -> ${this._capability.currentCommand.commandStartMarker.line}:${this._capability.currentCommand.commandStartX}`);
          this._flushPendingHandleCommandStartTask();
          return;
        }
      }
      scannedLineCount++;
    }
    if (scannedLineCount < 10 /* MaxCheckLineCount */) {
      this._tryAdjustCommandStartMarkerScannedLineCount = scannedLineCount;
      if (++this._tryAdjustCommandStartMarkerPollCount < 10 /* MaximumPollCount */) {
        this._tryAdjustCommandStartMarkerScheduler?.schedule();
      } else {
        this._flushPendingHandleCommandStartTask();
      }
    } else {
      this._flushPendingHandleCommandStartTask();
    }
  }
  _flushPendingHandleCommandStartTask() {
    if (this._tryAdjustCommandStartMarkerScheduler) {
      this._tryAdjustCommandStartMarkerPollCount = 10 /* MaximumPollCount */;
      this._tryAdjustCommandStartMarkerScheduler.flush();
      this._tryAdjustCommandStartMarkerScheduler = void 0;
    }
    if (!this._capability.currentCommand.commandExecutedMarker) {
      this._onCursorMoveListener.value = this._terminal.onCursorMove(() => {
        if (this._hooks.commandMarkers.length === 0 || this._hooks.commandMarkers[this._hooks.commandMarkers.length - 1].line !== this._terminal.buffer.active.cursorY) {
          const marker = this._terminal.registerMarker(0);
          if (marker) {
            this._hooks.commandMarkers.push(marker);
          }
        }
      });
    }
    if (this._capability.currentCommand.commandStartMarker) {
      const line = this._terminal.buffer.active.getLine(this._capability.currentCommand.commandStartMarker.line);
      if (line) {
        this._capability.currentCommand.commandStartLineContent = line.translateToString(true);
      }
    }
    this._hooks.onCommandStartedEmitter.fire({ marker: this._capability.currentCommand.commandStartMarker });
    this._logService.debug("CommandDetectionCapability#_handleCommandStartWindows", this._capability.currentCommand.commandStartX, this._capability.currentCommand.commandStartMarker?.line);
  }
  handleCommandExecuted(options) {
    if (this._tryAdjustCommandStartMarkerScheduler) {
      this._flushPendingHandleCommandStartTask();
    }
    this._onCursorMoveListener.clear();
    this._evaluateCommandMarkers();
    this._capability.currentCommand.commandExecutedX = this._terminal.buffer.active.cursorX;
    this._hooks.onCommandExecutedEmitter.fire(this._capability.currentCommand);
    this._logService.debug("CommandDetectionCapability#handleCommandExecuted", this._capability.currentCommand.commandExecutedX, this._capability.currentCommand.commandExecutedMarker?.line);
  }
  preHandleCommandFinished() {
    if (this._capability.currentCommand.commandExecutedMarker) {
      return;
    }
    if (this._hooks.commandMarkers.length === 0) {
      if (!this._capability.currentCommand.commandStartMarker) {
        this._capability.currentCommand.commandStartMarker = this._terminal.registerMarker(0);
      }
      if (this._capability.currentCommand.commandStartMarker) {
        this._hooks.commandMarkers.push(this._capability.currentCommand.commandStartMarker);
      }
    }
    this._evaluateCommandMarkers();
  }
  postHandleCommandFinished() {
    const currentCommand = this._capability.currentCommand;
    const commandText = currentCommand.command;
    const commandLine = currentCommand.commandStartMarker?.line;
    const executedLine = currentCommand.commandExecutedMarker?.line;
    if (!commandText || commandText.length === 0 || commandLine === void 0 || commandLine === -1 || executedLine === void 0 || executedLine === -1) {
      return;
    }
    let current = 0;
    let found = false;
    for (let i = commandLine; i <= executedLine; i++) {
      const line = this._terminal.buffer.active.getLine(i);
      if (!line) {
        break;
      }
      const text = line.translateToString(true);
      for (let j = 0; j < text.length; j++) {
        while (commandText.length < current && commandText[current] === " ") {
          current++;
        }
        if (text[j] === commandText[current]) {
          current++;
        }
        if (current === commandText.length) {
          const wrapsToNextLine = j >= this._terminal.cols - 1;
          currentCommand.commandExecutedMarker = this._terminal.registerMarker(i - (this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY) + (wrapsToNextLine ? 1 : 0));
          currentCommand.commandExecutedX = wrapsToNextLine ? 0 : j + 1;
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
    }
  }
  _evaluateCommandMarkers() {
    if (this._hooks.commandMarkers.length === 0) {
      return;
    }
    this._hooks.commandMarkers = this._hooks.commandMarkers.sort((a, b) => a.line - b.line);
    this._capability.currentCommand.commandStartMarker = this._hooks.commandMarkers[0];
    if (this._capability.currentCommand.commandStartMarker) {
      const line = this._terminal.buffer.active.getLine(this._capability.currentCommand.commandStartMarker.line);
      if (line) {
        this._capability.currentCommand.commandStartLineContent = line.translateToString(true);
      }
    }
    this._capability.currentCommand.commandExecutedMarker = this._hooks.commandMarkers[this._hooks.commandMarkers.length - 1];
    this._hooks.onCommandExecutedEmitter.fire(this._capability.currentCommand);
  }
  _cursorOnNextLine() {
    const lastCommand = this._capability.commands.at(-1);
    if (!lastCommand) {
      return true;
    }
    const cursorYAbsolute = this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY;
    const lastCommandYAbsolute = (lastCommand.endMarker ? lastCommand.endMarker.line : lastCommand.marker?.line) ?? -1;
    return cursorYAbsolute > lastCommandYAbsolute;
  }
  _waitForCursorMove() {
    const cursorX = this._terminal.buffer.active.cursorX;
    const cursorY = this._terminal.buffer.active.cursorY;
    let totalDelay = 0;
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (cursorX !== this._terminal.buffer.active.cursorX || cursorY !== this._terminal.buffer.active.cursorY) {
          resolve();
          clearInterval(interval);
          return;
        }
        totalDelay += 10;
        if (totalDelay > 1e3) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });
  }
  _getWindowsPrompt(y = this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY) {
    const line = this._terminal.buffer.active.getLine(y);
    if (!line) {
      return;
    }
    const lineText = line.translateToString(true);
    if (!lineText) {
      return;
    }
    const pwshPrompt = lineText.match(/(?<prompt>(\(.+\)\s)?(?:PS.+>\s?))/)?.groups?.prompt;
    if (pwshPrompt) {
      const adjustedPrompt = this._adjustPrompt(pwshPrompt, lineText, ">");
      if (adjustedPrompt) {
        return {
          prompt: adjustedPrompt,
          likelySingleLine: true
        };
      }
    }
    const customPrompt = lineText.match(/.*\u276f(?=[^\u276f]*$)/g)?.[0];
    if (customPrompt) {
      const adjustedPrompt = this._adjustPrompt(customPrompt, lineText, "\u276F");
      if (adjustedPrompt) {
        return adjustedPrompt;
      }
    }
    const bashPrompt = lineText.match(/^(?<prompt>\$)/)?.groups?.prompt;
    if (bashPrompt) {
      const adjustedPrompt = this._adjustPrompt(bashPrompt, lineText, "$");
      if (adjustedPrompt) {
        return adjustedPrompt;
      }
    }
    const pythonPrompt = lineText.match(/^(?<prompt>>>> )/g)?.groups?.prompt;
    if (pythonPrompt) {
      return {
        prompt: pythonPrompt,
        likelySingleLine: true
      };
    }
    if (this._capability.promptTerminator && (lineText === this._capability.promptTerminator || lineText.trim().endsWith(this._capability.promptTerminator))) {
      const adjustedPrompt = this._adjustPrompt(lineText, lineText, this._capability.promptTerminator);
      if (adjustedPrompt) {
        return adjustedPrompt;
      }
    }
    const cmdMatch = lineText.match(/^(?<prompt>(\(.+\)\s)?(?:[A-Z]:\\.*>))/);
    return cmdMatch?.groups?.prompt ? {
      prompt: cmdMatch.groups.prompt,
      likelySingleLine: true
    } : void 0;
  }
  _adjustPrompt(prompt, lineText, char) {
    if (!prompt) {
      return;
    }
    if (lineText === prompt && prompt.endsWith(char)) {
      prompt += " ";
    }
    return prompt;
  }
};
WindowsPtyHeuristics = __decorateClass([
  __decorateParam(3, ILogService)
], WindowsPtyHeuristics);
function getLinesForCommand(buffer, command, cols, outputMatcher) {
  if (!outputMatcher) {
    return void 0;
  }
  const executedMarker = command.executedMarker;
  const endMarker = command.endMarker;
  if (!executedMarker || !endMarker) {
    return void 0;
  }
  const startLine = executedMarker.line;
  const endLine = endMarker.line;
  const linesToCheck = outputMatcher.length;
  const lines = [];
  if (outputMatcher.anchor === "bottom") {
    for (let i = endLine - (outputMatcher.offset || 0); i >= startLine; i--) {
      let wrappedLineStart = i;
      const wrappedLineEnd = i;
      while (wrappedLineStart >= startLine && buffer.getLine(wrappedLineStart)?.isWrapped) {
        wrappedLineStart--;
      }
      i = wrappedLineStart;
      lines.unshift(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
      if (lines.length > linesToCheck) {
        lines.pop();
      }
    }
  } else {
    for (let i = startLine + (outputMatcher.offset || 0); i < endLine; i++) {
      const wrappedLineStart = i;
      let wrappedLineEnd = i;
      while (wrappedLineEnd + 1 < endLine && buffer.getLine(wrappedLineEnd + 1)?.isWrapped) {
        wrappedLineEnd++;
      }
      i = wrappedLineEnd;
      lines.push(getXtermLineContent(buffer, wrappedLineStart, wrappedLineEnd, cols));
      if (lines.length === linesToCheck) {
        lines.shift();
      }
    }
  }
  return lines;
}
function getXtermLineContent(buffer, lineStart, lineEnd, cols) {
  const maxLineLength = Math.max(2048 / cols * 2);
  lineEnd = Math.min(lineEnd, lineStart + maxLineLength);
  let content = "";
  for (let i = lineStart; i <= lineEnd; i++) {
    const line = buffer.getLine(i);
    if (line) {
      content += line.translateToString(true, 0, cols);
    }
  }
  return content;
}
function cloneMarker(xterm, marker, offset = 0) {
  return xterm.registerMarker(marker.line - (xterm.buffer.active.baseY + xterm.buffer.active.cursorY) + offset);
}
export {
  CommandDetectionCapability,
  getLinesForCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGVib3VuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNYW5kYXRvcnlNdXRhYmxlRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENvbW1hbmRJbnZhbGlkYXRpb25SZWFzb24sIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgSUNvbW1hbmRJbnZhbGlkYXRpb25SZXF1ZXN0LCBJSGFuZGxlQ29tbWFuZE9wdGlvbnMsIElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIElTZXJpYWxpemVkVGVybWluYWxDb21tYW5kLCBJVGVybWluYWxDb21tYW5kLCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxPdXRwdXRNYXRjaGVyIH0gZnJvbSAnLi4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUN1cnJlbnRQYXJ0aWFsQ29tbWFuZCwgaXNGdWxsVGVybWluYWxDb21tYW5kLCBQYXJ0aWFsVGVybWluYWxDb21tYW5kLCBUZXJtaW5hbENvbW1hbmQgfSBmcm9tICcuL2NvbW1hbmREZXRlY3Rpb24vdGVybWluYWxDb21tYW5kLmpzJztcbmltcG9ydCB7IFByb21wdElucHV0TW9kZWwsIHR5cGUgSVByb21wdElucHV0TW9kZWwgfSBmcm9tICcuL2NvbW1hbmREZXRlY3Rpb24vcHJvbXB0SW5wdXRNb2RlbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElCdWZmZXIsIElEaXNwb3NhYmxlLCBJTWFya2VyLCBUZXJtaW5hbCB9IGZyb20gJ0B4dGVybS9oZWFkbGVzcyc7XG5cbmludGVyZmFjZSBJVGVybWluYWxEaW1lbnNpb25zIHtcblx0Y29sczogbnVtYmVyO1xuXHRyb3dzOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRyZWFkb25seSB0eXBlID0gVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbXB0SW5wdXRNb2RlbDogUHJvbXB0SW5wdXRNb2RlbDtcblx0Z2V0IHByb21wdElucHV0TW9kZWwoKTogSVByb21wdElucHV0TW9kZWwgeyByZXR1cm4gdGhpcy5fcHJvbXB0SW5wdXRNb2RlbDsgfVxuXG5cdHByb3RlY3RlZCBfY29tbWFuZHM6IFRlcm1pbmFsQ29tbWFuZFtdID0gW107XG5cdHByaXZhdGUgX2N3ZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcm9tcHRUZXJtaW5hdG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRDb21tYW5kOiBQYXJ0aWFsVGVybWluYWxDb21tYW5kO1xuXHRwcml2YXRlIF9jb21tYW5kTWFya2VyczogSU1hcmtlcltdID0gW107XG5cdHByaXZhdGUgX2RpbWVuc2lvbnM6IElUZXJtaW5hbERpbWVuc2lvbnM7XG5cdHByaXZhdGUgX19pc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGFuZGxlQ29tbWFuZFN0YXJ0T3B0aW9ucz86IElIYW5kbGVDb21tYW5kT3B0aW9ucztcblx0cHJpdmF0ZSBfaGFzUmljaENvbW1hbmREZXRlY3Rpb246IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGhhc1JpY2hDb21tYW5kRGV0ZWN0aW9uKCkgeyByZXR1cm4gdGhpcy5faGFzUmljaENvbW1hbmREZXRlY3Rpb247IH1cblx0cHJpdmF0ZSBfbmV4dENvbW1hbmRJZDogeyBjb21tYW5kOiBzdHJpbmc7IGNvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzQ3VycmVudENvbW1hbmRJbnRlcnJ1cHRlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX3B0eUhldXJpc3RpY3NIb29rczogSUNvbW1hbmREZXRlY3Rpb25IZXVyaXN0aWNzSG9va3M7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B0eUhldXJpc3RpY3M6IE1hbmRhdG9yeU11dGFibGVEaXNwb3NhYmxlPElQdHlIZXVyaXN0aWNzPjtcblxuXHRnZXQgY29tbWFuZHMoKTogcmVhZG9ubHkgVGVybWluYWxDb21tYW5kW10geyByZXR1cm4gdGhpcy5fY29tbWFuZHM7IH1cblx0Z2V0IGV4ZWN1dGluZ0NvbW1hbmQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmQ7IH1cblx0Z2V0IGV4ZWN1dGluZ0NvbW1hbmRPYmplY3QoKTogSVRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcikge1xuXHRcdFx0Ly8gSEFDSzogVGhpcyBkb2VzIGEgbG90IG1vcmUgdGhhbiB0aGUgY29uc3VtZXIgb2YgdGhlIEFQSSBuZWVkcy4gSXQncyBhbHNvIGEgbGl0dGxlXG5cdFx0XHQvLyAgICAgICBtaXNsZWFkaW5nIHNpbmNlIGl0J3Mgbm90IHByb21vdGluZyB0aGUgY3VycmVudCBjb21tYW5kIHlldC5cblx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50Q29tbWFuZC5wcm9tb3RlVG9GdWxsQ29tbWFuZCh0aGlzLl9jd2QsIHVuZGVmaW5lZCwgdGhpcy5faGFuZGxlQ29tbWFuZFN0YXJ0T3B0aW9ucz8uaWdub3JlQ29tbWFuZExpbmUgPz8gZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Z2V0IGV4ZWN1dGluZ0NvbW1hbmRDb25maWRlbmNlKCk6ICdsb3cnIHwgJ21lZGl1bScgfCAnaGlnaCcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhc3RlZCA9IHRoaXMuX2N1cnJlbnRDb21tYW5kIGFzIFBhcnRpYWxUZXJtaW5hbENvbW1hbmQgfCBJVGVybWluYWxDb21tYW5kO1xuXHRcdHJldHVybiBpc0Z1bGxUZXJtaW5hbENvbW1hbmQoY2FzdGVkKSA/IGNhc3RlZC5jb21tYW5kTGluZUNvbmZpZGVuY2UgOiB1bmRlZmluZWQ7XG5cdH1cblx0Z2V0IGN1cnJlbnRDb21tYW5kKCk6IElDdXJyZW50UGFydGlhbENvbW1hbmQge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50Q29tbWFuZDtcblx0fVxuXHRnZXQgY3dkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jd2Q7IH1cblx0Z2V0IHByb21wdFRlcm1pbmF0b3IoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Byb21wdFRlcm1pbmF0b3I7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1hbmRTdGFydGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsQ29tbWFuZD4oKSk7XG5cdHJlYWRvbmx5IG9uQ29tbWFuZFN0YXJ0ZWQgPSB0aGlzLl9vbkNvbW1hbmRTdGFydGVkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1hbmRTdGFydENoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25Db21tYW5kU3RhcnRDaGFuZ2VkID0gdGhpcy5fb25Db21tYW5kU3RhcnRDaGFuZ2VkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJlZm9yZUNvbW1hbmRGaW5pc2hlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmQ+KCkpO1xuXHRyZWFkb25seSBvbkJlZm9yZUNvbW1hbmRGaW5pc2hlZCA9IHRoaXMuX29uQmVmb3JlQ29tbWFuZEZpbmlzaGVkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1hbmRGaW5pc2hlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmQ+KCkpO1xuXHRyZWFkb25seSBvbkNvbW1hbmRGaW5pc2hlZCA9IHRoaXMuX29uQ29tbWFuZEZpbmlzaGVkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1hbmRFeGVjdXRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmQ+KCkpO1xuXHRyZWFkb25seSBvbkNvbW1hbmRFeGVjdXRlZCA9IHRoaXMuX29uQ29tbWFuZEV4ZWN1dGVkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1hbmRJbnZhbGlkYXRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmRbXT4oKSk7XG5cdHJlYWRvbmx5IG9uQ29tbWFuZEludmFsaWRhdGVkID0gdGhpcy5fb25Db21tYW5kSW52YWxpZGF0ZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb21tYW5kSW52YWxpZGF0aW9uUmVxdWVzdD4oKSk7XG5cdHJlYWRvbmx5IG9uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZCA9IHRoaXMuX29uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25TZXRSaWNoQ29tbWFuZERldGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvblNldFJpY2hDb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fb25TZXRSaWNoQ29tbWFuZERldGVjdGlvbi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbDogVGVybWluYWwsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQgPSBuZXcgUGFydGlhbFRlcm1pbmFsQ29tbWFuZCh0aGlzLl90ZXJtaW5hbCk7XG5cdFx0dGhpcy5fcHJvbXB0SW5wdXRNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9tcHRJbnB1dE1vZGVsKHRoaXMuX3Rlcm1pbmFsLCB0aGlzLm9uQ29tbWFuZFN0YXJ0ZWQsIHRoaXMub25Db21tYW5kU3RhcnRDaGFuZ2VkLCB0aGlzLm9uQ29tbWFuZEV4ZWN1dGVkLCB0aGlzLm9uQ29tbWFuZEZpbmlzaGVkLCB0aGlzLl9sb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvbXB0SW5wdXRNb2RlbC5vbkRpZEludGVycnVwdCgoKSA9PiB0aGlzLl9pc0N1cnJlbnRDb21tYW5kSW50ZXJydXB0ZWQgPSB0cnVlKSk7XG5cblx0XHQvLyBQdWxsIGNvbW1hbmQgbGluZSBmcm9tIHRoZSBidWZmZXIgaWYgaXQgd2FzIG5vdCBzZXQgZXhwbGljaXRseVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25Db21tYW5kRXhlY3V0ZWQoY29tbWFuZCA9PiB7XG5cdFx0XHRpZiAoY29tbWFuZC5jb21tYW5kTGluZUNvbmZpZGVuY2UgIT09ICdoaWdoJykge1xuXHRcdFx0XHQvLyBIQUNLOiBvbkNvbW1hbmRFeGVjdXRlZCBhY3R1YWxseSBmaXJlZCB3aXRoIFBhcnRpYWxUZXJtaW5hbENvbW1hbmRcblx0XHRcdFx0Y29uc3QgdHlwZWRDb21tYW5kID0gKGNvbW1hbmQgYXMgSVRlcm1pbmFsQ29tbWFuZCB8IFBhcnRpYWxUZXJtaW5hbENvbW1hbmQpO1xuXHRcdFx0XHRjb21tYW5kLmNvbW1hbmQgPSB0eXBlZENvbW1hbmQuZXh0cmFjdENvbW1hbmRMaW5lKCk7XG5cdFx0XHRcdGNvbW1hbmQuY29tbWFuZExpbmVDb25maWRlbmNlID0gJ2xvdyc7XG5cblx0XHRcdFx0Ly8gSVRlcm1pbmFsQ29tbWFuZFxuXHRcdFx0XHRpZiAoaXNGdWxsVGVybWluYWxDb21tYW5kKHR5cGVkQ29tbWFuZCkpIHtcblx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHQvLyBNYXJrZXJzIGV4aXN0XG5cdFx0XHRcdFx0XHR0eXBlZENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIgJiYgdHlwZWRDb21tYW5kLm1hcmtlciAmJiB0eXBlZENvbW1hbmQuZXhlY3V0ZWRNYXJrZXIgJiZcblx0XHRcdFx0XHRcdC8vIFNpbmdsZSBsaW5lIGNvbW1hbmRcblx0XHRcdFx0XHRcdGNvbW1hbmQuY29tbWFuZC5pbmRleE9mKCdcXG4nKSA9PT0gLTEgJiZcblx0XHRcdFx0XHRcdC8vIFN0YXJ0IG1hcmtlciBpcyBub3Qgb24gdGhlIGxlZnQtbW9zdCBjb2x1bW5cblx0XHRcdFx0XHRcdHR5cGVkQ29tbWFuZC5zdGFydFggIT09IHVuZGVmaW5lZCAmJiB0eXBlZENvbW1hbmQuc3RhcnRYID4gMFxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0Y29tbWFuZC5jb21tYW5kTGluZUNvbmZpZGVuY2UgPSAnbWVkaXVtJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gUGFydGlhbFRlcm1pbmFsQ29tbWFuZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHQvLyBNYXJrZXJzIGV4aXN0XG5cdFx0XHRcdFx0XHR0eXBlZENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIgJiYgdHlwZWRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciAmJiB0eXBlZENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyICYmXG5cdFx0XHRcdFx0XHQvLyBTaW5nbGUgbGluZSBjb21tYW5kXG5cdFx0XHRcdFx0XHRjb21tYW5kLmNvbW1hbmQuaW5kZXhPZignXFxuJykgPT09IC0xICYmXG5cdFx0XHRcdFx0XHQvLyBTdGFydCBtYXJrZXIgaXMgbm90IG9uIHRoZSBsZWZ0LW1vc3QgY29sdW1uXG5cdFx0XHRcdFx0XHR0eXBlZENvbW1hbmQuY29tbWFuZFN0YXJ0WCAhPT0gdW5kZWZpbmVkICYmIHR5cGVkQ29tbWFuZC5jb21tYW5kU3RhcnRYID4gMFxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0Y29tbWFuZC5jb21tYW5kTGluZUNvbmZpZGVuY2UgPSAnbWVkaXVtJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbC5wYXJzZXIucmVnaXN0ZXJDc2lIYW5kbGVyKHsgZmluYWw6ICdKJyB9LCBwYXJhbXMgPT4ge1xuXHRcdFx0aWYgKHBhcmFtcy5sZW5ndGggPj0gMSAmJiBwYXJhbXNbMF0gPT09IDIpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl90ZXJtaW5hbC5vcHRpb25zLnNjcm9sbE9uRXJhc2VJbkRpc3BsYXkpIHtcblx0XHRcdFx0XHR0aGlzLl9jbGVhckNvbW1hbmRzSW5WaWV3cG9ydCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLndhc0NsZWFyZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2UgZG9uJ3Qgd2FudCB0byBvdmVycmlkZSB4dGVybS5qcycgZGVmYXVsdCBiZWhhdmlvciwganVzdCBhdWdtZW50IGl0XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2V0IHVwIHBsYXRmb3JtLXNwZWNpZmljIGJlaGF2aW9yc1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3B0eUhldXJpc3RpY3NIb29rcyA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElDb21tYW5kRGV0ZWN0aW9uSGV1cmlzdGljc0hvb2tzIHtcblx0XHRcdGdldCBvbkN1cnJlbnRDb21tYW5kSW52YWxpZGF0ZWRFbWl0dGVyKCkgeyByZXR1cm4gdGhhdC5fb25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkOyB9XG5cdFx0XHRnZXQgb25Db21tYW5kU3RhcnRlZEVtaXR0ZXIoKSB7IHJldHVybiB0aGF0Ll9vbkNvbW1hbmRTdGFydGVkOyB9XG5cdFx0XHRnZXQgb25Db21tYW5kRXhlY3V0ZWRFbWl0dGVyKCkgeyByZXR1cm4gdGhhdC5fb25Db21tYW5kRXhlY3V0ZWQ7IH1cblx0XHRcdGdldCBkaW1lbnNpb25zKCkgeyByZXR1cm4gdGhhdC5fZGltZW5zaW9uczsgfVxuXHRcdFx0Z2V0IGlzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZCgpIHsgcmV0dXJuIHRoYXQuX19pc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQ7IH1cblx0XHRcdGdldCBjb21tYW5kTWFya2VycygpIHsgcmV0dXJuIHRoYXQuX2NvbW1hbmRNYXJrZXJzOyB9XG5cdFx0XHRzZXQgY29tbWFuZE1hcmtlcnModmFsdWUpIHsgdGhhdC5fY29tbWFuZE1hcmtlcnMgPSB2YWx1ZTsgfVxuXHRcdFx0Z2V0IGNsZWFyQ29tbWFuZHNJblZpZXdwb3J0KCkgeyByZXR1cm4gdGhhdC5fY2xlYXJDb21tYW5kc0luVmlld3BvcnQuYmluZCh0aGF0KTsgfVxuXHRcdH07XG5cdFx0dGhpcy5fcHR5SGV1cmlzdGljcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNYW5kYXRvcnlNdXRhYmxlRGlzcG9zYWJsZShuZXcgVW5peFB0eUhldXJpc3RpY3ModGhpcy5fdGVybWluYWwsIHRoaXMsIHRoaXMuX3B0eUhldXJpc3RpY3NIb29rcywgdGhpcy5fbG9nU2VydmljZSkpKTtcblxuXHRcdHRoaXMuX2RpbWVuc2lvbnMgPSB7XG5cdFx0XHRjb2xzOiB0aGlzLl90ZXJtaW5hbC5jb2xzLFxuXHRcdFx0cm93czogdGhpcy5fdGVybWluYWwucm93c1xuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWwub25SZXNpemUoZSA9PiB0aGlzLl9oYW5kbGVSZXNpemUoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbC5vbkN1cnNvck1vdmUoKCkgPT4gdGhpcy5faGFuZGxlQ3Vyc29yTW92ZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZXNpemUoZTogeyBjb2xzOiBudW1iZXI7IHJvd3M6IG51bWJlciB9KSB7XG5cdFx0dGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZS5wcmVIYW5kbGVSZXNpemU/LihlKTtcblx0XHR0aGlzLl9kaW1lbnNpb25zLmNvbHMgPSBlLmNvbHM7XG5cdFx0dGhpcy5fZGltZW5zaW9ucy5yb3dzID0gZS5yb3dzO1xuXHR9XG5cblx0QGRlYm91bmNlKDUwMClcblx0cHJpdmF0ZSBfaGFuZGxlQ3Vyc29yTW92ZSgpIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBFYXJseSB2ZXJzaW9ucyBvZiBjb25wdHkgZG8gbm90IGhhdmUgcmVhbCBzdXBwb3J0IGZvciBhbiBhbHQgYnVmZmVyLCBpbiBhZGRpdGlvbiBjZXJ0YWluXG5cdFx0Ly8gY29tbWFuZHMgc3VjaCBhcyB0c2Mgd2F0Y2ggd2lsbCB3cml0ZSB0byB0aGUgdG9wIG9mIHRoZSBub3JtYWwgYnVmZmVyLiBUaGUgZm9sbG93aW5nXG5cdFx0Ly8gY2hlY2tzIHdoZW4gdGhlIGN1cnNvciBoYXMgbW92ZWQgd2hpbGUgdGhlIG5vcm1hbCBidWZmZXIgaXMgZW1wdHkgYW5kIGlmIGl0IGlzIGFib3ZlIHRoZVxuXHRcdC8vIGN1cnJlbnQgY29tbWFuZCwgYWxsIGRlY29yYXRpb25zIHdpdGhpbiB0aGUgdmlld3BvcnQgd2lsbCBiZSBpbnZhbGlkYXRlZC5cblx0XHQvL1xuXHRcdC8vIFRoaXMgZnVuY3Rpb24gaXMgZGVib3VuY2VkIHNvIHRoYXQgdGhlIGN1cnNvciBpcyBvbmx5IGNoZWNrZWQgd2hlbiBpdCBpcyBzdGFibGUgc29cblx0XHQvLyBjb25wdHkncyBzY3JlZW4gcmVwcmludGluZyB3aWxsIG5vdCB0cmlnZ2VyIGRlY29yYXRpb24gY2xlYXJpbmcuXG5cdFx0Ly9cblx0XHQvLyBUaGlzIGlzIG1vc3RseSBhIHdvcmthcm91bmQgZm9yIFdpbmRvd3MgYnV0IGFwcGxpZXMgdG8gYWxsIE9TJyBiZWNhdXNlIG9mIHRoZSB0c2Mgd2F0Y2hcblx0XHQvLyBjYXNlLlxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlID09PSB0aGlzLl90ZXJtaW5hbC5idWZmZXIubm9ybWFsICYmIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcikge1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuYmFzZVkgKyB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclkgPCB0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIubGluZSkge1xuXHRcdFx0XHR0aGlzLl9jbGVhckNvbW1hbmRzSW5WaWV3cG9ydCgpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5pc0ludmFsaWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9vbkN1cnJlbnRDb21tYW5kSW52YWxpZGF0ZWQuZmlyZSh7IHJlYXNvbjogQ29tbWFuZEludmFsaWRhdGlvblJlYXNvbi5XaW5kb3dzIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQ29tbWFuZHNJblZpZXdwb3J0KCk6IHZvaWQge1xuXHRcdC8vIEZpbmQgdGhlIG51bWJlciBvZiBjb21tYW5kcyBvbiB0aGUgdGFpbCBlbmQgb2YgdGhlIGFycmF5IHRoYXQgYXJlIHdpdGhpbiB0aGUgdmlld3BvcnRcblx0XHRsZXQgY291bnQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9jb21tYW5kcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuX2NvbW1hbmRzW2ldLm1hcmtlcj8ubGluZTtcblx0XHRcdGlmIChsaW5lICYmIGxpbmUgPCB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmJhc2VZKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y291bnQrKztcblx0XHR9XG5cdFx0Ly8gUmVtb3ZlIHRoZW1cblx0XHRpZiAoY291bnQgPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkNvbW1hbmRJbnZhbGlkYXRlZC5maXJlKHRoaXMuX2NvbW1hbmRzLnNwbGljZSh0aGlzLl9jb21tYW5kcy5sZW5ndGggLSBjb3VudCwgY291bnQpKTtcblx0XHR9XG5cdH1cblxuXHRzZXRDb250aW51YXRpb25Qcm9tcHQodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb21wdElucHV0TW9kZWwuc2V0Q29udGludWF0aW9uUHJvbXB0KHZhbHVlKTtcblx0fVxuXG5cdC8vIFRPRE86IFNpbXBsaWZ5IHRoaXMsIGNhbiBldmVyeXRoaW5nIHdvcmsgb2ZmIHRoZSBsYXN0IGxpbmU/XG5cdHNldFByb21wdFRlcm1pbmF0b3IocHJvbXB0VGVybWluYXRvcjogc3RyaW5nLCBsYXN0UHJvbXB0TGluZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjc2V0UHJvbXB0VGVybWluYXRvcicsIHByb21wdFRlcm1pbmF0b3IpO1xuXHRcdHRoaXMuX3Byb21wdFRlcm1pbmF0b3IgPSBwcm9tcHRUZXJtaW5hdG9yO1xuXHRcdHRoaXMuX3Byb21wdElucHV0TW9kZWwuc2V0TGFzdFByb21wdExpbmUobGFzdFByb21wdExpbmUpO1xuXHR9XG5cblx0c2V0Q3dkKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9jd2QgPSB2YWx1ZTtcblx0fVxuXG5cdHNldElzV2luZG93c1B0eSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh2YWx1ZSAmJiAhKHRoaXMuX3B0eUhldXJpc3RpY3MudmFsdWUgaW5zdGFuY2VvZiBXaW5kb3dzUHR5SGV1cmlzdGljcykpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0dGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZSA9IG5ldyBXaW5kb3dzUHR5SGV1cmlzdGljcyhcblx0XHRcdFx0dGhpcy5fdGVybWluYWwsXG5cdFx0XHRcdHRoaXMsXG5cdFx0XHRcdG5ldyBjbGFzcyB7XG5cdFx0XHRcdFx0Z2V0IG9uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZEVtaXR0ZXIoKSB7IHJldHVybiB0aGF0Ll9vbkN1cnJlbnRDb21tYW5kSW52YWxpZGF0ZWQ7IH1cblx0XHRcdFx0XHRnZXQgb25Db21tYW5kU3RhcnRlZEVtaXR0ZXIoKSB7IHJldHVybiB0aGF0Ll9vbkNvbW1hbmRTdGFydGVkOyB9XG5cdFx0XHRcdFx0Z2V0IG9uQ29tbWFuZEV4ZWN1dGVkRW1pdHRlcigpIHsgcmV0dXJuIHRoYXQuX29uQ29tbWFuZEV4ZWN1dGVkOyB9XG5cdFx0XHRcdFx0Z2V0IGRpbWVuc2lvbnMoKSB7IHJldHVybiB0aGF0Ll9kaW1lbnNpb25zOyB9XG5cdFx0XHRcdFx0Z2V0IGlzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZCgpIHsgcmV0dXJuIHRoYXQuX19pc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQ7IH1cblx0XHRcdFx0XHRnZXQgY29tbWFuZE1hcmtlcnMoKSB7IHJldHVybiB0aGF0Ll9jb21tYW5kTWFya2VyczsgfVxuXHRcdFx0XHRcdHNldCBjb21tYW5kTWFya2Vycyh2YWx1ZSkgeyB0aGF0Ll9jb21tYW5kTWFya2VycyA9IHZhbHVlOyB9XG5cdFx0XHRcdFx0Z2V0IGNsZWFyQ29tbWFuZHNJblZpZXdwb3J0KCkgeyByZXR1cm4gdGhhdC5fY2xlYXJDb21tYW5kc0luVmlld3BvcnQuYmluZCh0aGF0KTsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSBpZiAoIXZhbHVlICYmICEodGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZSBpbnN0YW5jZW9mIFVuaXhQdHlIZXVyaXN0aWNzKSkge1xuXHRcdFx0dGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZSA9IG5ldyBVbml4UHR5SGV1cmlzdGljcyh0aGlzLl90ZXJtaW5hbCwgdGhpcywgdGhpcy5fcHR5SGV1cmlzdGljc0hvb2tzLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRzZXRIYXNSaWNoQ29tbWFuZERldGVjdGlvbih2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2hhc1JpY2hDb21tYW5kRGV0ZWN0aW9uID0gdmFsdWU7XG5cdFx0dGhpcy5fb25TZXRSaWNoQ29tbWFuZERldGVjdGlvbi5maXJlKHZhbHVlKTtcblx0fVxuXG5cdHNldElzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9faXNDb21tYW5kU3RvcmFnZURpc2FibGVkID0gdHJ1ZTtcblx0fVxuXG5cdGdldENvbW1hbmRGb3JMaW5lKGxpbmU6IG51bWJlcik6IElUZXJtaW5hbENvbW1hbmQgfCBJQ3VycmVudFBhcnRpYWxDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBIYW5kbGUgdGhlIGN1cnJlbnQgcGFydGlhbCBjb21tYW5kIGZpcnN0LCBhbnl0aGluZyBiZWxvdyBpdCdzIHByb21wdCBpcyBjb25zaWRlcmVkIHBhcnRcblx0XHQvLyBvZiB0aGUgY3VycmVudCBjb21tYW5kXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyICYmIGxpbmUgPj0gdGhpcy5fY3VycmVudENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXI/LmxpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50Q29tbWFuZDtcblx0XHR9XG5cblx0XHQvLyBObyBjb21tYW5kc1xuXHRcdGlmICh0aGlzLl9jb21tYW5kcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTGluZSBpcyBiZWZvcmUgYW55IHJlZ2lzdGVyZWQgY29tbWFuZHNcblx0XHRpZiAoKHRoaXMuX2NvbW1hbmRzWzBdLnByb21wdFN0YXJ0TWFya2VyID8/IHRoaXMuX2NvbW1hbmRzWzBdLm1hcmtlciEpLmxpbmUgPiBsaW5lKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEl0ZXJhdGUgYmFja3dhcmRzIHRocm91Z2ggY29tbWFuZHMgdG8gZmluZCB0aGUgcmlnaHQgb25lXG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuY29tbWFuZHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICgodGhpcy5jb21tYW5kc1tpXS5wcm9tcHRTdGFydE1hcmtlciA/PyB0aGlzLmNvbW1hbmRzW2ldLm1hcmtlciEpLmxpbmUgPD0gbGluZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jb21tYW5kc1tpXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0Q3dkRm9yTGluZShsaW5lOiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIEhhbmRsZSB0aGUgY3VycmVudCBwYXJ0aWFsIGNvbW1hbmQgZmlyc3QsIGFueXRoaW5nIGJlbG93IGl0J3MgcHJvbXB0IGlzIGNvbnNpZGVyZWQgcGFydFxuXHRcdC8vIG9mIHRoZSBjdXJyZW50IGNvbW1hbmRcblx0XHRpZiAodGhpcy5fY3VycmVudENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIgJiYgbGluZSA+PSB0aGlzLl9jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlcj8ubGluZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2N3ZDtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5nZXRDb21tYW5kRm9yTGluZShsaW5lKTtcblx0XHRpZiAoY29tbWFuZCAmJiBpc0Z1bGxUZXJtaW5hbENvbW1hbmQoY29tbWFuZCkpIHtcblx0XHRcdHJldHVybiBjb21tYW5kLmN3ZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aGFuZGxlUHJvbXB0U3RhcnQob3B0aW9ucz86IElIYW5kbGVDb21tYW5kT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX2lzQ3VycmVudENvbW1hbmRJbnRlcnJ1cHRlZCA9IGZhbHNlO1xuXHRcdC8vIEFkanVzdCB0aGUgbGFzdCBjb21tYW5kJ3MgZmluaXNoZWQgbWFya2VyIHdoZW4gbmVlZGVkLiBUaGUgc3RhbmRhcmQgcG9zaXRpb24gZm9yIHRoZVxuXHRcdC8vIGZpbmlzaGVkIG1hcmtlciBgRGAgdG8gYXBwZWFyIGlzIGF0IHRoZSBzYW1lIHBvc2l0aW9uIGFzIHRoZSBmb2xsb3dpbmcgcHJvbXB0IHN0YXJ0ZWRcblx0XHQvLyBgQWAuIE9ubHkgZG8gdGhpcyB3aGVuIGl0IHdvdWxkIG5vdCBleHRlbmQgcGFzdCB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24uXG5cdFx0Y29uc3QgbGFzdENvbW1hbmQgPSB0aGlzLmNvbW1hbmRzLmF0KC0xKTtcblx0XHRpZiAoXG5cdFx0XHRsYXN0Q29tbWFuZD8uZW5kTWFya2VyICYmXG5cdFx0XHRsYXN0Q29tbWFuZD8uZXhlY3V0ZWRNYXJrZXIgJiZcblx0XHRcdGxhc3RDb21tYW5kLmVuZE1hcmtlci5saW5lID09PSBsYXN0Q29tbWFuZC5leGVjdXRlZE1hcmtlci5saW5lICYmXG5cdFx0XHRsYXN0Q29tbWFuZC5leGVjdXRlZE1hcmtlci5saW5lIDwgdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWVxuXHRcdCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlUHJvbXB0U3RhcnQgYWRqdXN0ZWQgY29tbWFuZEZpbmlzaGVkJywgYCR7bGFzdENvbW1hbmQuZW5kTWFya2VyLmxpbmV9IC0+ICR7bGFzdENvbW1hbmQuZXhlY3V0ZWRNYXJrZXIubGluZSArIDF9YCk7XG5cdFx0XHRsYXN0Q29tbWFuZC5lbmRNYXJrZXIgPSBjbG9uZU1hcmtlcih0aGlzLl90ZXJtaW5hbCwgbGFzdENvbW1hbmQuZXhlY3V0ZWRNYXJrZXIsIDEpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyID0gKFxuXHRcdFx0b3B0aW9ucz8ubWFya2VyIHx8XG5cdFx0XHQvLyBHZW5lcmFsbHkgdGhlIHByb21wdCBzdGFydCBzaG91bGQgaGFwcGVuIGF0IHRoZSBleGFjdCBwbGFjZSB0aGUgZW5kbWFya2VyIGhhcHBlbmVkLlxuXHRcdFx0Ly8gSG93ZXZlciwgYWZ0ZXIgY3RybCtsIGlzIHVzZWQgdG8gY2xlYXIgdGhlIGRpc3BsYXksIHdlIHdhbnQgdG8gZW5zdXJlIHRoZSBhY3R1YWxcblx0XHRcdC8vIHByb21wdCBzdGFydCBtYXJrZXIgcG9zaXRpb24gaXMgdXNlZC4gVGhpcyBpcyBtb3N0bHkgYSB3b3JrYXJvdW5kIGZvciBXaW5kb3dzIGJ1dCB3ZVxuXHRcdFx0Ly8gYXBwbHkgaXQgZ2VuZXJhbGx5LlxuXHRcdFx0KCF0aGlzLl9jdXJyZW50Q29tbWFuZC53YXNDbGVhcmVkICYmIGxhc3RDb21tYW5kPy5lbmRNYXJrZXJcblx0XHRcdFx0PyBjbG9uZU1hcmtlcih0aGlzLl90ZXJtaW5hbCwgbGFzdENvbW1hbmQuZW5kTWFya2VyKVxuXHRcdFx0XHQ6IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKDApKVxuXHRcdCk7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQud2FzQ2xlYXJlZCA9IGZhbHNlO1xuXHR9XG5cblx0aGFuZGxlQ29udGludWF0aW9uU3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY3VycmVudENvbnRpbnVhdGlvbk1hcmtlciA9IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKDApO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZUNvbnRpbnVhdGlvblN0YXJ0JywgdGhpcy5fY3VycmVudENvbW1hbmQuY3VycmVudENvbnRpbnVhdGlvbk1hcmtlcik7XG5cdH1cblxuXHRoYW5kbGVDb250aW51YXRpb25FbmQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50Q29tbWFuZC5jdXJyZW50Q29udGludWF0aW9uTWFya2VyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZUNvbnRpbnVhdGlvbkVuZCBSZWNlaXZlZCBjb250aW51YXRpb24gZW5kIHdpdGhvdXQgc3RhcnQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9jdXJyZW50Q29tbWFuZC5jb250aW51YXRpb25zKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb250aW51YXRpb25zID0gW107XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbnRpbnVhdGlvbnMucHVzaCh7XG5cdFx0XHRtYXJrZXI6IHRoaXMuX2N1cnJlbnRDb21tYW5kLmN1cnJlbnRDb250aW51YXRpb25NYXJrZXIsXG5cdFx0XHRlbmQ6IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWFxuXHRcdH0pO1xuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmN1cnJlbnRDb250aW51YXRpb25NYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlQ29udGludWF0aW9uRW5kJywgdGhpcy5fY3VycmVudENvbW1hbmQuY29udGludWF0aW9uc1t0aGlzLl9jdXJyZW50Q29tbWFuZC5jb250aW51YXRpb25zLmxlbmd0aCAtIDFdKTtcblx0fVxuXG5cdGhhbmRsZVJpZ2h0UHJvbXB0U3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFJpZ2h0UHJvbXB0U3RhcnRYID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZVJpZ2h0UHJvbXB0U3RhcnQnLCB0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kUmlnaHRQcm9tcHRTdGFydFgpO1xuXHR9XG5cblx0aGFuZGxlUmlnaHRQcm9tcHRFbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFJpZ2h0UHJvbXB0RW5kWCA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNoYW5kbGVSaWdodFByb21wdEVuZCcsIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRSaWdodFByb21wdEVuZFgpO1xuXHR9XG5cblx0aGFuZGxlQ29tbWFuZFN0YXJ0KG9wdGlvbnM/OiBJSGFuZGxlQ29tbWFuZE9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9oYW5kbGVDb21tYW5kU3RhcnRPcHRpb25zID0gb3B0aW9ucztcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jd2QgPSB0aGlzLl9jd2Q7XG5cdFx0Ly8gT25seSB1cGRhdGUgdGhlIGNvbHVtbiBpZiB0aGUgbGluZSBoYXMgYWxyZWFkeSBiZWVuIHNldFxuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciA9IG9wdGlvbnM/Lm1hcmtlciB8fCB0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXI7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcj8ubGluZSA9PT0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JZKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYO1xuXHRcdFx0dGhpcy5fb25Db21tYW5kU3RhcnRDaGFuZ2VkLmZpcmUoKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZUNvbW1hbmRTdGFydCcsIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFgsIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcj8ubGluZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3B0eUhldXJpc3RpY3MudmFsdWUuaGFuZGxlQ29tbWFuZFN0YXJ0KG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGNvbW1hbmQgSUQgdG8gdXNlIGZvciB0aGUgbmV4dCBjb21tYW5kIHRoYXQgc3RhcnRzLlxuXHQgKiBUaGlzIGlzIHVzZWZ1bCB3aGVuIHlvdSB3YW50IHRvIHByZS1hc3NpZ24gYW4gSUQgYmVmb3JlIHRoZSBzaGVsbCBzZW5kcyB0aGUgY29tbWFuZCBzdGFydCBzZXF1ZW5jZS5cblx0ICovXG5cdHNldE5leHRDb21tYW5kSWQoY29tbWFuZDogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX25leHRDb21tYW5kSWQgPSB7IGNvbW1hbmQsIGNvbW1hbmRJZCB9O1xuXHR9XG5cblx0aGFuZGxlQ29tbWFuZEV4ZWN1dGVkKG9wdGlvbnM/OiBJSGFuZGxlQ29tbWFuZE9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVDdXJyZW50Q29tbWFuZElkKHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmQgPz8gdGhpcy5fY3VycmVudENvbW1hbmQuZXh0cmFjdENvbW1hbmRMaW5lKCkpO1xuXHRcdHRoaXMuX3B0eUhldXJpc3RpY3MudmFsdWUuaGFuZGxlQ29tbWFuZEV4ZWN1dGVkKG9wdGlvbnMpO1xuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLm1hcmtFeGVjdXRlZFRpbWUoKTtcblx0fVxuXG5cdGhhbmRsZUNvbW1hbmRGaW5pc2hlZChleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSUhhbmRsZUNvbW1hbmRPcHRpb25zKTogdm9pZCB7XG5cdFx0Ly8gQ29tbWFuZCBleGVjdXRlZCBtYXkgbm90IGhhdmUgaGFwcGVuZWQgeWV0LCBpZiBub3QgaGFuZGxlIGl0IG5vdyBzbyB0aGUgZXhwZWN0ZWQgZXZlbnRzXG5cdFx0Ly8gcHJvcGVybHkgcHJvcGFnYXRlLiBUaGlzIG1heSBjYXVzZSB0aGUgb3V0cHV0IHRvIHNob3cgdXAgaW4gdGhlIGNvbXB1dGVkIGNvbW1hbmQgbGluZSxcblx0XHQvLyBidXQgdGhlIGNvbW1hbmQgbGluZSBjb25maWRlbmNlIHdpbGwgYmUgbG93IGluIHRoZSBleHRlbnNpb24gaG9zdCBmb3IgZXhhbXBsZSBhbmRcblx0XHQvLyB0aGVyZWZvcmUgY2Fubm90IGJlIHRydXN0ZWQgYW55d2F5LlxuXHRcdGlmICghdGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyKSB7XG5cdFx0XHR0aGlzLmhhbmRsZUNvbW1hbmRFeGVjdXRlZCgpO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5tYXJrRmluaXNoZWRUaW1lKCk7XG5cdFx0dGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZS5wcmVIYW5kbGVDb21tYW5kRmluaXNoZWQ/LigpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjaGFuZGxlQ29tbWFuZEZpbmlzaGVkJywgdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYLCBvcHRpb25zPy5tYXJrZXI/LmxpbmUsIHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmQsIHRoaXMuX2N1cnJlbnRDb21tYW5kKTtcblxuXHRcdC8vIEhBQ0s6IEhhbmRsZSBhIHNwZWNpYWwgY2FzZSBvbiBzb21lIHZlcnNpb25zIG9mIGJhc2ggd2hlcmUgaWRlbnRpY2FsIGNvbW1hbmRzIGdldCBtZXJnZWRcblx0XHQvLyBpbiB0aGUgb3V0cHV0IG9mIGBoaXN0b3J5YCwgdGhpcyBkZXRlY3RzIHRoYXQgY2FzZSBhbmQgc2V0cyB0aGUgZXhpdCBjb2RlIHRvIHRoZSBsYXN0XG5cdFx0Ly8gY29tbWFuZCdzIGV4aXQgY29kZS4gVGhpcyBjb3ZlcmVkIHRoZSBtYWpvcml0eSBvZiBjYXNlcyBidXQgd2lsbCBmYWlsIGlmIHRoZSBzYW1lIGNvbW1hbmRcblx0XHQvLyBydW5zIHdpdGggYSBkaWZmZXJlbnQgZXhpdCBjb2RlLCB0aGF0IHdpbGwgbmVlZCBhIG1vcmUgcm9idXN0IGZpeCB3aGVyZSB3ZSBzZW5kIHRoZVxuXHRcdC8vIGNvbW1hbmQgSUQgYW5kIGV4aXQgY29kZSBvdmVyIHRvIHRoZSBjYXBhYmlsaXR5IHRvIGFkanVzdCB0aGVyZS5cblx0XHQvLyBBIGNhbmNlbGVkIGNvbW1hbmQncyBleGl0IGNvZGUgc2hvdWxkIHJlbWFpbiB1bmRlZmluZWQuXG5cdFx0aWYgKGV4aXRDb2RlID09PSB1bmRlZmluZWQgJiYgIXRoaXMuX2lzQ3VycmVudENvbW1hbmRJbnRlcnJ1cHRlZCkge1xuXHRcdFx0Y29uc3QgbGFzdENvbW1hbmQgPSB0aGlzLmNvbW1hbmRzLmxlbmd0aCA+IDAgPyB0aGlzLmNvbW1hbmRzW3RoaXMuY29tbWFuZHMubGVuZ3RoIC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZCAmJiB0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kLmxlbmd0aCA+IDAgJiYgbGFzdENvbW1hbmQ/LmNvbW1hbmQgPT09IHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmQpIHtcblx0XHRcdFx0ZXhpdENvZGUgPSBsYXN0Q29tbWFuZC5leGl0Q29kZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyID09PSB1bmRlZmluZWQgfHwgIXRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kRmluaXNoZWRNYXJrZXIgPSBvcHRpb25zPy5tYXJrZXIgfHwgdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoMCk7XG5cblx0XHR0aGlzLl9wdHlIZXVyaXN0aWNzLnZhbHVlLnBvc3RIYW5kbGVDb21tYW5kRmluaXNoZWQ/LigpO1xuXG5cdFx0Y29uc3QgbmV3Q29tbWFuZCA9IHRoaXMuX2N1cnJlbnRDb21tYW5kLnByb21vdGVUb0Z1bGxDb21tYW5kKHRoaXMuX2N3ZCwgZXhpdENvZGUsIHRoaXMuX2hhbmRsZUNvbW1hbmRTdGFydE9wdGlvbnM/Lmlnbm9yZUNvbW1hbmRMaW5lID8/IGZhbHNlLCBvcHRpb25zPy5tYXJrUHJvcGVydGllcyk7XG5cblx0XHRpZiAobmV3Q29tbWFuZCkge1xuXHRcdFx0dGhpcy5fY29tbWFuZHMucHVzaChuZXdDb21tYW5kKTtcblx0XHRcdHRoaXMuX29uQmVmb3JlQ29tbWFuZEZpbmlzaGVkLmZpcmUobmV3Q29tbWFuZCk7XG5cdFx0XHQvLyBOT1RFOiBvbkNvbW1hbmRGaW5pc2hlZCB1c2VkIHRvIG5vdCBmaXJlIGlmIHRoZSBjb21tYW5kIHdhcyBpbnZhbGlkLCBidXQgdGhpcyBjYXVzZXNcblx0XHRcdC8vIHByb2JsZW1zIGVzcGVjaWFsbHkgd2l0aCB0aGUgYXNzb2NpYXRlZCBleGVjdXRpb24gZXZlbnQgbmV2ZXIgZmlyaW5nIGluIHRoZSBleHRlbnNpb25cblx0XHRcdC8vIEFQSS4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNTI0ODlcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I29uQ29tbWFuZEZpbmlzaGVkJywgbmV3Q29tbWFuZCk7XG5cdFx0XHR0aGlzLl9vbkNvbW1hbmRGaW5pc2hlZC5maXJlKG5ld0NvbW1hbmQpO1xuXHRcdH1cblx0XHQvLyBDcmVhdGUgbmV3IGNvbW1hbmQgZm9yIG5leHQgZXhlY3V0aW9uXG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQgPSBuZXcgUGFydGlhbFRlcm1pbmFsQ29tbWFuZCh0aGlzLl90ZXJtaW5hbCk7XG5cdFx0dGhpcy5faGFuZGxlQ29tbWFuZFN0YXJ0T3B0aW9ucyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZUN1cnJlbnRDb21tYW5kSWQoX2NvbW1hbmRMaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbmV4dENvbW1hbmRJZD8uY29tbWFuZElkKSB7XG5cdFx0XHQvLyBBc3NpZ24gdGhlIHByZS1zZXQgY29tbWFuZCBJRCB0byB0aGUgY3VycmVudCBjb21tYW5kLiBUaGUgdGltaW5nIG9mIHNldE5leHRDb21tYW5kSWRcblx0XHRcdC8vIChjYWxsZWQgcmlnaHQgYmVmb3JlIHJ1bkNvbW1hbmQpIGFuZCBfZW5zdXJlQ3VycmVudENvbW1hbmRJZCAoY2FsbGVkIG9uIGNvbW1hbmRcblx0XHRcdC8vIGV4ZWN1dGVkKSBlbnN1cmVzIHdlJ3JlIG1hdGNoaW5nIHRoZSByaWdodCBjb21tYW5kIHdpdGhvdXQgbmVlZGluZyBzdHJpbmcgY29tcGFyaXNvbi5cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50Q29tbWFuZC5pZCAhPT0gdGhpcy5fbmV4dENvbW1hbmRJZC5jb21tYW5kSWQpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudENvbW1hbmQuaWQgPSB0aGlzLl9uZXh0Q29tbWFuZElkLmNvbW1hbmRJZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX25leHRDb21tYW5kSWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0c2V0Q29tbWFuZExpbmUoY29tbWFuZExpbmU6IHN0cmluZywgaXNUcnVzdGVkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjc2V0Q29tbWFuZExpbmUnLCBjb21tYW5kTGluZSwgaXNUcnVzdGVkKTtcblx0XHR0aGlzLl9jdXJyZW50Q29tbWFuZC5jb21tYW5kID0gY29tbWFuZExpbmU7XG5cdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZExpbmVDb25maWRlbmNlID0gJ2hpZ2gnO1xuXHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmlzVHJ1c3RlZCA9IGlzVHJ1c3RlZDtcblxuXHRcdGlmIChpc1RydXN0ZWQpIHtcblx0XHRcdHRoaXMuX3Byb21wdElucHV0TW9kZWwuc2V0Q29uZmlkZW50Q29tbWFuZExpbmUoY29tbWFuZExpbmUpO1xuXHRcdH1cblx0fVxuXG5cdHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IHtcblx0XHRjb25zdCBjb21tYW5kczogSVNlcmlhbGl6ZWRUZXJtaW5hbENvbW1hbmRbXSA9IHRoaXMuY29tbWFuZHMubWFwKGUgPT4gZS5zZXJpYWxpemUodGhpcy5fX2lzQ29tbWFuZFN0b3JhZ2VEaXNhYmxlZCkpO1xuXHRcdGNvbnN0IHBhcnRpYWxDb21tYW5kID0gdGhpcy5fY3VycmVudENvbW1hbmQuc2VyaWFsaXplKHRoaXMuX2N3ZCk7XG5cdFx0aWYgKHBhcnRpYWxDb21tYW5kKSB7XG5cdFx0XHRjb21tYW5kcy5wdXNoKHBhcnRpYWxDb21tYW5kKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzV2luZG93c1B0eTogdGhpcy5fcHR5SGV1cmlzdGljcy52YWx1ZSBpbnN0YW5jZW9mIFdpbmRvd3NQdHlIZXVyaXN0aWNzLFxuXHRcdFx0aGFzUmljaENvbW1hbmREZXRlY3Rpb246IHRoaXMuX2hhc1JpY2hDb21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0Y29tbWFuZHMsXG5cdFx0XHRwcm9tcHRJbnB1dE1vZGVsOiB0aGlzLl9wcm9tcHRJbnB1dE1vZGVsLnNlcmlhbGl6ZSgpLFxuXHRcdH07XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShzZXJpYWxpemVkOiBJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KTogdm9pZCB7XG5cdFx0aWYgKHNlcmlhbGl6ZWQuaXNXaW5kb3dzUHR5KSB7XG5cdFx0XHR0aGlzLnNldElzV2luZG93c1B0eShzZXJpYWxpemVkLmlzV2luZG93c1B0eSk7XG5cdFx0fVxuXHRcdGlmIChzZXJpYWxpemVkLmhhc1JpY2hDb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHR0aGlzLnNldEhhc1JpY2hDb21tYW5kRGV0ZWN0aW9uKHNlcmlhbGl6ZWQuaGFzUmljaENvbW1hbmREZXRlY3Rpb24pO1xuXHRcdH1cblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIubm9ybWFsO1xuXHRcdGZvciAoY29uc3QgZSBvZiBzZXJpYWxpemVkLmNvbW1hbmRzKSB7XG5cdFx0XHQvLyBQYXJ0aWFsIGNvbW1hbmRcblx0XHRcdGlmICghZS5lbmRMaW5lKSB7XG5cdFx0XHRcdC8vIENoZWNrIGZvciBpbnZhbGlkIGNvbW1hbmRcblx0XHRcdFx0Y29uc3QgbWFya2VyID0gZS5zdGFydExpbmUgIT09IHVuZGVmaW5lZCA/IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKGUuc3RhcnRMaW5lIC0gKGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghbWFya2VyKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyID0gZS5zdGFydExpbmUgIT09IHVuZGVmaW5lZCA/IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKGUuc3RhcnRMaW5lIC0gKGJ1ZmZlci5iYXNlWSArIGJ1ZmZlci5jdXJzb3JZKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFggPSBlLnN0YXJ0WDtcblx0XHRcdFx0dGhpcy5fY3VycmVudENvbW1hbmQucHJvbXB0U3RhcnRNYXJrZXIgPSBlLnByb21wdFN0YXJ0TGluZSAhPT0gdW5kZWZpbmVkID8gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoZS5wcm9tcHRTdGFydExpbmUgLSAoYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclkpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fY3dkID0gZS5jd2Q7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRcdFx0dGhpcy5fb25Db21tYW5kU3RhcnRlZC5maXJlKHsgbWFya2VyIH0gYXMgSVRlcm1pbmFsQ29tbWFuZCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGdWxsIGNvbW1hbmRcblx0XHRcdGNvbnN0IG5ld0NvbW1hbmQgPSBUZXJtaW5hbENvbW1hbmQuZGVzZXJpYWxpemUodGhpcy5fdGVybWluYWwsIGUsIHRoaXMuX19pc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQpO1xuXHRcdFx0aWYgKCFuZXdDb21tYW5kKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jb21tYW5kcy5wdXNoKG5ld0NvbW1hbmQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkjb25Db21tYW5kRmluaXNoZWQnLCBuZXdDb21tYW5kKTtcblx0XHRcdHRoaXMuX29uQ29tbWFuZEZpbmlzaGVkLmZpcmUobmV3Q29tbWFuZCk7XG5cdFx0fVxuXHRcdGlmIChzZXJpYWxpemVkLnByb21wdElucHV0TW9kZWwpIHtcblx0XHRcdHRoaXMuX3Byb21wdElucHV0TW9kZWwuZGVzZXJpYWxpemUoc2VyaWFsaXplZC5wcm9tcHRJbnB1dE1vZGVsKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBZGRpdGlvbmFsIGhvb2tzIHRvIHByaXZhdGUgbWV0aG9kcyBvbiB7QGxpbmsgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHl9IHRoYXQgYXJlIG5lZWRlZCBieSB0aGVcbiAqIGhldXJpc3RpY3Mgb2JqZWN0cy5cbiAqL1xuaW50ZXJmYWNlIElDb21tYW5kRGV0ZWN0aW9uSGV1cmlzdGljc0hvb2tzIHtcblx0cmVhZG9ubHkgb25DdXJyZW50Q29tbWFuZEludmFsaWRhdGVkRW1pdHRlcjogRW1pdHRlcjxJQ29tbWFuZEludmFsaWRhdGlvblJlcXVlc3Q+O1xuXHRyZWFkb25seSBvbkNvbW1hbmRTdGFydGVkRW1pdHRlcjogRW1pdHRlcjxJVGVybWluYWxDb21tYW5kPjtcblx0cmVhZG9ubHkgb25Db21tYW5kRXhlY3V0ZWRFbWl0dGVyOiBFbWl0dGVyPElUZXJtaW5hbENvbW1hbmQ+O1xuXHRyZWFkb25seSBkaW1lbnNpb25zOiBJVGVybWluYWxEaW1lbnNpb25zO1xuXHRyZWFkb25seSBpc0NvbW1hbmRTdG9yYWdlRGlzYWJsZWQ6IGJvb2xlYW47XG5cblx0Y29tbWFuZE1hcmtlcnM6IElNYXJrZXJbXTtcblxuXHRjbGVhckNvbW1hbmRzSW5WaWV3cG9ydCgpOiB2b2lkO1xufVxuXG50eXBlIElQdHlIZXVyaXN0aWNzID0gKFxuXHQvLyBBbGwgb3B0aW9uYWwgbWV0aG9kc1xuXHRQYXJ0aWFsPFVuaXhQdHlIZXVyaXN0aWNzPiAmIFBhcnRpYWw8V2luZG93c1B0eUhldXJpc3RpY3M+ICZcblx0Ly8gQWxsIGNvbW1vbiBtZXRob2RzXG5cdChVbml4UHR5SGV1cmlzdGljcyB8IFdpbmRvd3NQdHlIZXVyaXN0aWNzKSAmXG5cdElEaXNwb3NhYmxlXG4pO1xuXG4vKipcbiAqIE5vbi1XaW5kb3dzLXNwZWNpZmljIGJlaGF2aW9yLlxuICovXG5jbGFzcyBVbml4UHR5SGV1cmlzdGljcyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbDogVGVybWluYWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2FwYWJpbGl0eTogQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG9va3M6IElDb21tYW5kRGV0ZWN0aW9uSGV1cmlzdGljc0hvb2tzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRoYW5kbGVDb21tYW5kU3RhcnQob3B0aW9ucz86IElIYW5kbGVDb21tYW5kT3B0aW9ucykge1xuXHRcdGNvbnN0IGN1cnJlbnRDb21tYW5kID0gdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZDtcblx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYID0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYO1xuXHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciA9IG9wdGlvbnM/Lm1hcmtlciB8fCB0aGlzLl90ZXJtaW5hbC5yZWdpc3Rlck1hcmtlcigwKTtcblxuXHRcdC8vIENsZWFyIGV4ZWN1dGVkIGFzIGl0IG11c3QgaGFwcGVuIGFmdGVyIGNvbW1hbmQgc3RhcnRcblx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXI/LmRpc3Bvc2UoKTtcblx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0Y3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkWCA9IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IG0gb2YgdGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMpIHtcblx0XHRcdG0uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycy5sZW5ndGggPSAwO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdHRoaXMuX2hvb2tzLm9uQ29tbWFuZFN0YXJ0ZWRFbWl0dGVyLmZpcmUoeyBtYXJrZXI6IG9wdGlvbnM/Lm1hcmtlciB8fCBjdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIsIG1hcmtQcm9wZXJ0aWVzOiBvcHRpb25zPy5tYXJrUHJvcGVydGllcyB9IGFzIElUZXJtaW5hbENvbW1hbmQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I2hhbmRsZUNvbW1hbmRTdGFydCcsIGN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydFgsIGN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcj8ubGluZSk7XG5cdH1cblxuXHRoYW5kbGVDb21tYW5kRXhlY3V0ZWQob3B0aW9ucz86IElIYW5kbGVDb21tYW5kT3B0aW9ucykge1xuXHRcdGNvbnN0IGN1cnJlbnRDb21tYW5kID0gdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZDtcblx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXIgPSBvcHRpb25zPy5tYXJrZXIgfHwgdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoMCk7XG5cdFx0Y3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkWCA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNoYW5kbGVDb21tYW5kRXhlY3V0ZWQnLCBjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRYLCBjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXI/LmxpbmUpO1xuXG5cdFx0Ly8gU2FuaXR5IGNoZWNrIG9wdGlvbmFsIHByb3BzXG5cdFx0aWYgKCFjdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIgfHwgIWN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlciB8fCBjdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kID0gdGhpcy5fY2FwYWJpbGl0eS5wcm9tcHRJbnB1dE1vZGVsLmdob3N0VGV4dEluZGV4ID4gLTEgPyB0aGlzLl9jYXBhYmlsaXR5LnByb21wdElucHV0TW9kZWwudmFsdWUuc3Vic3RyaW5nKDAsIHRoaXMuX2NhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC5naG9zdFRleHRJbmRleCkgOiB0aGlzLl9jYXBhYmlsaXR5LnByb21wdElucHV0TW9kZWwudmFsdWU7XG5cdFx0dGhpcy5faG9va3Mub25Db21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUoY3VycmVudENvbW1hbmQgYXMgSVRlcm1pbmFsQ29tbWFuZCk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJDb25zdGFudHMge1xuXHRNYXhDaGVja0xpbmVDb3VudCA9IDEwLFxuXHRJbnRlcnZhbCA9IDIwLFxuXHRNYXhpbXVtUG9sbENvdW50ID0gMTAsXG59XG5cbi8qKlxuICogQW4gb2JqZWN0IHRoYXQgaW50ZWdyYXRlZCB3aXRoIGFuZCBkZWNvcmF0ZXMgdGhlIGNvbW1hbmQgZGV0ZWN0aW9uIGNhcGFiaWxpdHkgdG8gYWRkIGhldXJpc3RpY3NcbiAqIHRoYXQgYWRqdXN0IHZhcmlvdXMgbWFya2VycyB0byB3b3JrIGJldHRlciB3aXRoIFdpbmRvd3MgYW5kIENvblBUWS4gVGhpcyBpc24ndCBkZXBlbmRlZCB1cG9uIHRoZVxuICogZnJvbnRlbmQgT1MsIG9yIGV2ZW4gdGhlIGJhY2tlbmQgT1MsIGJ1dCB0aGUgYElzV2luZG93c2AgcHJvcGVydHkgd2hpY2ggdGVjaG5pY2FsbHkgYSBub24tV2luZG93c1xuICogY2xpZW50IGNhbiBlbWl0IChmb3IgZXhhbXBsZSBpbiB0ZXN0cykuXG4gKi9cbmNsYXNzIFdpbmRvd3NQdHlIZXVyaXN0aWNzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DdXJzb3JNb3ZlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2NoZWR1bGVyPzogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBfdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2Nhbm5lZExpbmVDb3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyUG9sbENvdW50OiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsOiBUZXJtaW5hbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jYXBhYmlsaXR5OiBDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob29rczogSUNvbW1hbmREZXRlY3Rpb25IZXVyaXN0aWNzSG9va3MsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2FwYWJpbGl0eS5vbkJlZm9yZUNvbW1hbmRGaW5pc2hlZChjb21tYW5kID0+IHtcblx0XHRcdC8vIEZvciBvbGRlciBXaW5kb3dzIGJhY2tlbmRzIHdlIGNhbm5vdCBsaXN0ZW4gdG8gQ1NJIEosIGluc3RlYWQgd2UgYXNzdW1lIHJ1bm5pbmcgY2xlYXJcblx0XHRcdC8vIG9yIGNscyB3aWxsIGNsZWFyIGFsbCBjb21tYW5kcyBpbiB0aGUgdmlld3BvcnQuIFRoaXMgaXMgbm90IHBlcmZlY3QgYnV0IGl0J3MgcmlnaHRcblx0XHRcdC8vIG1vc3Qgb2YgdGhlIHRpbWUuXG5cdFx0XHRpZiAoY29tbWFuZC5jb21tYW5kLnRyaW0oKS50b0xvd2VyQ2FzZSgpID09PSAnY2xlYXInIHx8IGNvbW1hbmQuY29tbWFuZC50cmltKCkudG9Mb3dlckNhc2UoKSA9PT0gJ2NscycpIHtcblx0XHRcdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2NoZWR1bGVyPy5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2NoZWR1bGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9ob29rcy5jbGVhckNvbW1hbmRzSW5WaWV3cG9ydCgpO1xuXHRcdFx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmlzSW52YWxpZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2hvb2tzLm9uQ3VycmVudENvbW1hbmRJbnZhbGlkYXRlZEVtaXR0ZXIuZmlyZSh7IHJlYXNvbjogQ29tbWFuZEludmFsaWRhdGlvblJlYXNvbi5XaW5kb3dzIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByZUhhbmRsZVJlc2l6ZShlOiB7IGNvbHM6IG51bWJlcjsgcm93czogbnVtYmVyIH0pIHtcblx0XHQvLyBSZXNpemUgYmVoYXZpb3IgaXMgZGlmZmVyZW50IHVuZGVyIGNvbnB0eTsgaW5zdGVhZCBvZiBicmluZ2luZyBwYXJ0cyBvZiB0aGUgc2Nyb2xsYmFja1xuXHRcdC8vIGJhY2sgaW50byB0aGUgdmlld3BvcnQsIG5ldyBsaW5lcyBhcmUgaW5zZXJ0ZWQgYXQgdGhlIGJvdHRvbSAoaWUuIHRoZSBzYW1lIGJlaGF2aW9yIGFzIGlmXG5cdFx0Ly8gdGhlcmUgd2FzIG5vIHNjcm9sbGJhY2spLlxuXHRcdC8vXG5cdFx0Ly8gT24gcmVzaXplIHRoaXMgd29ya2Fyb3VuZCB3aWxsIHdhaXQgZm9yIGEgY29ucHR5IHJlcHJpbnQgdG8gb2NjdXIgYnkgd2FpdGluZyBmb3IgdGhlXG5cdFx0Ly8gY3Vyc29yIHRvIG1vdmUsIGl0IHdpbGwgdGhlbiBjYWxjdWxhdGUgdGhlIG51bWJlciBvZiBsaW5lcyB0aGF0IHRoZSBjb21tYW5kcyB3aXRoaW4gdGhlXG5cdFx0Ly8gdmlld3BvcnQgX21heSBoYXZlXyBzaGlmdGVkLiBBZnRlciB2ZXJpZnlpbmcgdGhlIGNvbnRlbnQgb2YgdGhlIGN1cnJlbnQgbGluZSBpc1xuXHRcdC8vIGluY29ycmVjdCwgdGhlIGxpbmUgYWZ0ZXIgc2hpZnRpbmcgaXMgY2hlY2tlZCBhbmQgaWYgdGhhdCBtYXRjaGVzIGRlbGV0ZSBldmVudHMgYXJlIGZpcmVkXG5cdFx0Ly8gb24gdGhlIHh0ZXJtLmpzIGJ1ZmZlciB0byBtb3ZlIHRoZSBtYXJrZXJzLlxuXHRcdC8vXG5cdFx0Ly8gV2hpbGUgYSBiaXQgaGFja3ksIHRoaXMgYXBwcm9hY2ggaXMgcXVpdGUgc2FmZSBhbmQgc2VlbXMgdG8gd29yayBncmVhdCBhdCBsZWFzdCBmb3IgcHdzaC5cblx0XHRjb25zdCBiYXNlWSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuYmFzZVk7XG5cdFx0Y29uc3Qgcm93c0RpZmZlcmVuY2UgPSBlLnJvd3MgLSB0aGlzLl9ob29rcy5kaW1lbnNpb25zLnJvd3M7XG5cdFx0Ly8gT25seSBkbyB3aGVuIHJvd3MgaW5jcmVhc2UsIGRvIGluIHRoZSBuZXh0IGZyYW1lIGFzIHRoaXMgbmVlZHMgdG8gaGFwcGVuIGFmdGVyXG5cdFx0Ly8gY29ucHR5IHJlcHJpbnRzIHRoZSBzY3JlZW5cblx0XHRpZiAocm93c0RpZmZlcmVuY2UgPiAwKSB7XG5cdFx0XHR0aGlzLl93YWl0Rm9yQ3Vyc29yTW92ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHQvLyBDYWxjdWxhdGUgdGhlIG51bWJlciBvZiBsaW5lcyB0aGUgY29udGVudCBtYXkgaGF2ZSBzaGlmdGVkLCB0aGlzIHdpbGwgbWF4IG91dCBhdFxuXHRcdFx0XHQvLyBzY3JvbGxiYWNrIGNvdW50IHNpbmNlIHRoZSBzdGFuZGFyZCBiZWhhdmlvciB3aWxsIGJlIHVzZWQgdGhlblxuXHRcdFx0XHRjb25zdCBwb3RlbnRpYWxTaGlmdGVkTGluZUNvdW50ID0gTWF0aC5taW4ocm93c0RpZmZlcmVuY2UsIGJhc2VZKTtcblx0XHRcdFx0Ly8gRm9yIGVhY2ggY29tbWFuZCB3aXRoaW4gdGhlIHZpZXdwb3J0LCBhc3N1bWUgY29tbWFuZHMgYXJlIGluIHRoZSBjb3JyZWN0IG9yZGVyXG5cdFx0XHRcdGZvciAobGV0IGkgPSB0aGlzLl9jYXBhYmlsaXR5LmNvbW1hbmRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IHRoaXMuX2NhcGFiaWxpdHkuY29tbWFuZHNbaV07XG5cdFx0XHRcdFx0aWYgKCFjb21tYW5kLm1hcmtlciB8fCBjb21tYW5kLm1hcmtlci5saW5lIDwgYmFzZVkgfHwgY29tbWFuZC5jb21tYW5kU3RhcnRMaW5lQ29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuZ2V0TGluZShjb21tYW5kLm1hcmtlci5saW5lKTtcblx0XHRcdFx0XHRpZiAoIWxpbmUgfHwgbGluZS50cmFuc2xhdGVUb1N0cmluZyh0cnVlKSA9PT0gY29tbWFuZC5jb21tYW5kU3RhcnRMaW5lQ29udGVudCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHNoaWZ0ZWRZID0gY29tbWFuZC5tYXJrZXIubGluZSAtIHBvdGVudGlhbFNoaWZ0ZWRMaW5lQ291bnQ7XG5cdFx0XHRcdFx0Y29uc3Qgc2hpZnRlZExpbmUgPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmdldExpbmUoc2hpZnRlZFkpO1xuXHRcdFx0XHRcdGlmIChzaGlmdGVkTGluZT8udHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSkgIT09IGNvbW1hbmQuY29tbWFuZFN0YXJ0TGluZUNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBIQUNLOiB4dGVybS5qcyBkb2Vzbid0IGV4cG9zZSB0aGlzIGJ5IGRlc2lnbiBhcyBpdCdzIGFuIGludGVybmFsIGNvcmVcblx0XHRcdFx0XHQvLyBmdW5jdGlvbiBhbiBlbWJlZGRlciBjb3VsZCBlYXNpbHkgZG8gZGFtYWdlIHdpdGguIEFkZGl0aW9uYWxseSwgdGhpc1xuXHRcdFx0XHRcdC8vIGNhbid0IHJlYWxseSBiZSB1cHN0cmVhbWVkIHNpbmNlIHRoZSBldmVudCByZWxpZXMgb24gc2hlbGwgaW50ZWdyYXRpb24gdG9cblx0XHRcdFx0XHQvLyB2ZXJpZnkgdGhlIHNoaWZ0aW5nIGlzIG5lY2Vzc2FyeS5cblx0XHRcdFx0XHRpbnRlcmZhY2UgSVh0ZXJtV2l0aENvcmUgZXh0ZW5kcyBUZXJtaW5hbCB7XG5cdFx0XHRcdFx0XHRfY29yZToge1xuXHRcdFx0XHRcdFx0XHRfYnVmZmVyU2VydmljZToge1xuXHRcdFx0XHRcdFx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0bGluZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0b25EZWxldGVFbWl0dGVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZmlyZShkYXRhOiB7IGluZGV4OiBudW1iZXI7IGFtb3VudDogbnVtYmVyIH0pOiB2b2lkO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KHRoaXMuX3Rlcm1pbmFsIGFzIElYdGVybVdpdGhDb3JlKS5fY29yZS5fYnVmZmVyU2VydmljZS5idWZmZXIubGluZXMub25EZWxldGVFbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRcdFx0aW5kZXg6IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuYmFzZVksXG5cdFx0XHRcdFx0XHRhbW91bnQ6IHBvdGVudGlhbFNoaWZ0ZWRMaW5lQ291bnRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0aGFuZGxlQ29tbWFuZFN0YXJ0KCkge1xuXHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0WCA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWDtcblxuXHRcdC8vIE9uIFdpbmRvd3MgdHJhY2sgYWxsIGN1cnNvciBtb3ZlbWVudHMgYWZ0ZXIgdGhlIGNvbW1hbmQgc3RhcnQgc2VxdWVuY2Vcblx0XHR0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3QgaW5pdGlhbENvbW1hbmRTdGFydE1hcmtlciA9IHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyID0gKFxuXHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlclxuXHRcdFx0XHQ/IGNsb25lTWFya2VyKHRoaXMuX3Rlcm1pbmFsLCB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLnByb21wdFN0YXJ0TWFya2VyKVxuXHRcdFx0XHQ6IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKDApXG5cdFx0KSE7XG5cdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYID0gMDtcblxuXHRcdC8vIERFQlVHOiBBZGQgYSBkZWNvcmF0aW9uIGZvciB0aGUgb3JpZ2luYWwgdW5hZGp1c3RlZCBjb21tYW5kIHN0YXJ0IHBvc2l0aW9uXG5cdFx0Ly8gaWYgKCdyZWdpc3RlckRlY29yYXRpb24nIGluIHRoaXMuX3Rlcm1pbmFsKSB7XG5cdFx0Ly8gXHRjb25zdCBkID0gKHRoaXMuX3Rlcm1pbmFsIGFzIGFueSkucmVnaXN0ZXJEZWNvcmF0aW9uKHtcblx0XHQvLyBcdFx0bWFya2VyOiB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcixcblx0XHQvLyBcdFx0eDogdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYXG5cdFx0Ly8gXHR9KTtcblx0XHQvLyBcdGQ/Lm9uUmVuZGVyKChlOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdC8vIFx0XHRlLnRleHRDb250ZW50ID0gJ2InO1xuXHRcdC8vIFx0XHRlLmNsYXNzTGlzdC5hZGQoJ3h0ZXJtLXNlcXVlbmNlLWRlY29yYXRpb24nLCAndG9wJywgJ3JpZ2h0Jyk7XG5cdFx0Ly8gXHRcdGUudGl0bGUgPSAnSW5pdGlhbCBjb21tYW5kIHN0YXJ0IHBvc2l0aW9uJztcblx0XHQvLyBcdH0pO1xuXHRcdC8vIH1cblxuXHRcdC8vIFRoZSBjb21tYW5kIHN0YXJ0ZWQgc2VxdWVuY2UgbWF5IGJlIHByaW50ZWQgYmVmb3JlIHRoZSBhY3R1YWwgcHJvbXB0IGlzLCBmb3IgZXhhbXBsZSBhXG5cdFx0Ly8gbXVsdGktbGluZSBwcm9tcHQgd2lsbCB0eXBpY2FsbHkgbG9vayBsaWtlIHRoaXMgd2hlcmUgRCwgQSBhbmQgQiBzaWduaWZ5IHRoZSBjb21tYW5kXG5cdFx0Ly8gZmluaXNoZWQsIHByb21wdCBzdGFydGVkIGFuZCBjb21tYW5kIHN0YXJ0ZWQgc2VxdWVuY2VzIHJlc3BlY3RpdmVseTpcblx0XHQvL1xuXHRcdC8vICAgICBEL215L2N3ZEJcblx0XHQvLyAgICAgPiBDXG5cdFx0Ly9cblx0XHQvLyBEdWUgdG8gdGhpcywgaXQncyBsaWtlbHkgdGhhdCB0aGlzIHdpbGwgYmUgY2FsbGVkIGJlZm9yZSB0aGUgbGluZSBoYXMgYmVlbiBwYXJzZWQuXG5cdFx0Ly8gVW5mb3J0dW5hdGVseSwgaXQgaXMgYWxzbyB0aGUgY2FzZSB0aGF0IHRoZSBhY3R1YWwgY29tbWFuZCBzdGFydCBkYXRhIG1heSBub3QgYmUgcGFyc2VkXG5cdFx0Ly8gYnkgdGhlIGVuZCBvZiB0aGUgdGFzayBlaXRoZXIsIHNvIGEgbWljcm90YXNrIGNhbm5vdCBiZSB1c2VkLlxuXHRcdC8vXG5cdFx0Ly8gVGhlIHN0cmF0ZWd5IHVzZWQgaXMgdG8gYmVnaW4gcG9sbGluZyBhbmQgc2Nhbm5pbmcgZG93bndhcmRzIGZvciB1cCB0byB0aGUgbmV4dCA1IGxpbmVzLlxuXHRcdC8vIElmIGl0IGxvb2tzIGxpa2UgYSBwcm9tcHQgaXMgZm91bmQsIHRoZSBjb21tYW5kIHN0YXJ0ZWQgbG9jYXRpb24gaXMgYWRqdXN0ZWQuIElmIHRoZVxuXHRcdC8vIGNvbW1hbmQgZXhlY3V0ZWQgc2VxdWVuY2VzIGNvbWVzIGluIGJlZm9yZSBwb2xsaW5nIGlzIGRvbmUsIHBvbGxpbmcgaXMgY2FuY2VsZWQgYW5kIHRoZVxuXHRcdC8vIGZpbmFsIHBvbGxpbmcgdGFzayBpcyBleGVjdXRlZCBzeW5jaHJvbm91c2x5LlxuXHRcdHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjYW5uZWRMaW5lQ291bnQgPSAwO1xuXHRcdHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclBvbGxDb3VudCA9IDA7XG5cdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyKGluaXRpYWxDb21tYW5kU3RhcnRNYXJrZXIpLCBBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJDb25zdGFudHMuSW50ZXJ2YWwpO1xuXHRcdHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXG5cdFx0Ly8gVE9ETzogQ2FjaGUgZGV0YWlscyBhYm91dCBwb2xsaW5nIGZvciB0aGUgZnV0dXJlIC0gZWcuIGlmIGl0IGFsd2F5cyBmYWlscywgc3RvcCBib3RoZXJpbmdcblx0fVxuXG5cdHByaXZhdGUgX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlcihzdGFydDogSU1hcmtlcikge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmU7XG5cdFx0bGV0IHNjYW5uZWRMaW5lQ291bnQgPSB0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2FubmVkTGluZUNvdW50O1xuXHRcdHdoaWxlIChzY2FubmVkTGluZUNvdW50IDwgQWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyQ29uc3RhbnRzLk1heENoZWNrTGluZUNvdW50ICYmIHN0YXJ0LmxpbmUgKyBzY2FubmVkTGluZUNvdW50IDwgYnVmZmVyLmJhc2VZICsgdGhpcy5fdGVybWluYWwucm93cykge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnNvck9uTmV4dExpbmUoKSkge1xuXHRcdFx0XHRjb25zdCBwcm9tcHQgPSB0aGlzLl9nZXRXaW5kb3dzUHJvbXB0KHN0YXJ0LmxpbmUgKyBzY2FubmVkTGluZUNvdW50KTtcblx0XHRcdFx0aWYgKHByb21wdCkge1xuXHRcdFx0XHRcdGNvbnN0IGFkanVzdGVkUHJvbXB0ID0gaXNTdHJpbmcocHJvbXB0KSA/IHByb21wdCA6IHByb21wdC5wcm9tcHQ7XG5cdFx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIgPSB0aGlzLl90ZXJtaW5hbC5yZWdpc3Rlck1hcmtlcigwKSE7XG5cdFx0XHRcdFx0aWYgKCFpc1N0cmluZyhwcm9tcHQpICYmIHByb21wdC5saWtlbHlTaW5nbGVMaW5lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNfdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyIGFkanVzdGVkIHByb21wdFN0YXJ0JywgYCR7dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlcj8ubGluZX0gLT4gJHt0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlci5saW5lfWApO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5wcm9tcHRTdGFydE1hcmtlciA9IGNsb25lTWFya2VyKHRoaXMuX3Rlcm1pbmFsLCB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcik7XG5cdFx0XHRcdFx0XHQvLyBBZGp1c3QgdGhlIGxhc3QgY29tbWFuZCBpZiBpdCdzIG5vdCBpbiB0aGUgc2FtZSBwb3NpdGlvbiBhcyB0aGUgZm9sbG93aW5nXG5cdFx0XHRcdFx0XHQvLyBwcm9tcHQgc3RhcnQgbWFya2VyXG5cdFx0XHRcdFx0XHRjb25zdCBsYXN0Q29tbWFuZCA9IHRoaXMuX2NhcGFiaWxpdHkuY29tbWFuZHMuYXQoLTEpO1xuXHRcdFx0XHRcdFx0aWYgKGxhc3RDb21tYW5kICYmIHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyLmxpbmUgIT09IGxhc3RDb21tYW5kLmVuZE1hcmtlcj8ubGluZSkge1xuXHRcdFx0XHRcdFx0XHRsYXN0Q29tbWFuZC5lbmRNYXJrZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0bGFzdENvbW1hbmQuZW5kTWFya2VyID0gY2xvbmVNYXJrZXIodGhpcy5fdGVybWluYWwsIHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gdXNlIHRoZSByZWdleCB0byBzZXQgdGhlIHBvc2l0aW9uIGFzIGl0J3MgcG9zc2libGUgaW5wdXQgaGFzIG9jY3VycmVkXG5cdFx0XHRcdFx0dGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRYID0gYWRqdXN0ZWRQcm9tcHQubGVuZ3RoO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ0NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5I190cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXIgYWRqdXN0ZWQgY29tbWFuZFN0YXJ0JywgYCR7c3RhcnQubGluZX0gLT4gJHt0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlci5saW5lfToke3RoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0WH1gKTtcblx0XHRcdFx0XHR0aGlzLl9mbHVzaFBlbmRpbmdIYW5kbGVDb21tYW5kU3RhcnRUYXNrKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRzY2FubmVkTGluZUNvdW50Kys7XG5cdFx0fVxuXHRcdGlmIChzY2FubmVkTGluZUNvdW50IDwgQWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyQ29uc3RhbnRzLk1heENoZWNrTGluZUNvdW50KSB7XG5cdFx0XHR0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2FubmVkTGluZUNvdW50ID0gc2Nhbm5lZExpbmVDb3VudDtcblx0XHRcdGlmICgrK3RoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclBvbGxDb3VudCA8IEFkanVzdENvbW1hbmRTdGFydE1hcmtlckNvbnN0YW50cy5NYXhpbXVtUG9sbENvdW50KSB7XG5cdFx0XHRcdHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclNjaGVkdWxlcj8uc2NoZWR1bGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2ZsdXNoUGVuZGluZ0hhbmRsZUNvbW1hbmRTdGFydFRhc2soKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZmx1c2hQZW5kaW5nSGFuZGxlQ29tbWFuZFN0YXJ0VGFzaygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZsdXNoUGVuZGluZ0hhbmRsZUNvbW1hbmRTdGFydFRhc2soKSB7XG5cdFx0Ly8gUGVyZm9ybSBmaW5hbCB0cnkgYWRqdXN0IGlmIG5lY2Vzc2FyeVxuXHRcdGlmICh0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXIpIHtcblx0XHRcdC8vIE1heCBvdXQgcG9sbCBjb3VudCB0byBlbnN1cmUgaXQncyB0aGUgbGFzdCBydW5cblx0XHRcdHRoaXMuX3RyeUFkanVzdENvbW1hbmRTdGFydE1hcmtlclBvbGxDb3VudCA9IEFkanVzdENvbW1hbmRTdGFydE1hcmtlckNvbnN0YW50cy5NYXhpbXVtUG9sbENvdW50O1xuXHRcdFx0dGhpcy5fdHJ5QWRqdXN0Q29tbWFuZFN0YXJ0TWFya2VyU2NoZWR1bGVyLmZsdXNoKCk7XG5cdFx0XHR0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlcikge1xuXHRcdFx0dGhpcy5fb25DdXJzb3JNb3ZlTGlzdGVuZXIudmFsdWUgPSB0aGlzLl90ZXJtaW5hbC5vbkN1cnNvck1vdmUoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMubGVuZ3RoID09PSAwIHx8IHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzW3RoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzLmxlbmd0aCAtIDFdLmxpbmUgIT09IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSkge1xuXHRcdFx0XHRcdGNvbnN0IG1hcmtlciA9IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKDApO1xuXHRcdFx0XHRcdGlmIChtYXJrZXIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzLnB1c2gobWFya2VyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcikge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuZ2V0TGluZSh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlci5saW5lKTtcblx0XHRcdGlmIChsaW5lKSB7XG5cdFx0XHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TGluZUNvbnRlbnQgPSBsaW5lLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0dGhpcy5faG9va3Mub25Db21tYW5kU3RhcnRlZEVtaXR0ZXIuZmlyZSh7IG1hcmtlcjogdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIgfSBhcyBJVGVybWluYWxDb21tYW5kKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNfaGFuZGxlQ29tbWFuZFN0YXJ0V2luZG93cycsIHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0WCwgdGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXI/LmxpbmUpO1xuXHR9XG5cblx0aGFuZGxlQ29tbWFuZEV4ZWN1dGVkKG9wdGlvbnM6IElIYW5kbGVDb21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl90cnlBZGp1c3RDb21tYW5kU3RhcnRNYXJrZXJTY2hlZHVsZXIpIHtcblx0XHRcdHRoaXMuX2ZsdXNoUGVuZGluZ0hhbmRsZUNvbW1hbmRTdGFydFRhc2soKTtcblx0XHR9XG5cdFx0Ly8gVXNlIHRoZSBnYXRoZXJlZCBjdXJzb3IgbW92ZSBtYXJrZXJzIHRvIGNvcnJlY3QgdGhlIGNvbW1hbmQgc3RhcnQgYW5kIGV4ZWN1dGVkIG1hcmtlcnNcblx0XHR0aGlzLl9vbkN1cnNvck1vdmVMaXN0ZW5lci5jbGVhcigpO1xuXHRcdHRoaXMuX2V2YWx1YXRlQ29tbWFuZE1hcmtlcnMoKTtcblx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZFggPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclg7XG5cdFx0dGhpcy5faG9va3Mub25Db21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUodGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZCBhcyBJVGVybWluYWxDb21tYW5kKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSNoYW5kbGVDb21tYW5kRXhlY3V0ZWQnLCB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZFgsIHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZEV4ZWN1dGVkTWFya2VyPy5saW5lKTtcblx0fVxuXG5cdHByZUhhbmRsZUNvbW1hbmRGaW5pc2hlZCgpIHtcblx0XHRpZiAodGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhpcyBpcyBkb25lIG9uIGNvbW1hbmQgZmluaXNoZWQganVzdCBpbiBjYXNlIGNvbW1hbmQgZXhlY3V0ZWQgbmV2ZXIgaGFwcGVucyAoZm9yIGV4YW1wbGVcblx0XHQvLyBQU1JlYWRMaW5lIHRhYiBjb21wbGV0aW9uKVxuXHRcdGlmICh0aGlzLl9ob29rcy5jb21tYW5kTWFya2Vycy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIElmIHRoZSBjb21tYW5kIHN0YXJ0IHRpbWVvdXQgZG9lc24ndCBoYXBwZW4gYmVmb3JlIGNvbW1hbmQgZmluaXNoZWQsIGp1c3QgdXNlIHRoZVxuXHRcdFx0Ly8gY3VycmVudCBtYXJrZXIuXG5cdFx0XHRpZiAoIXRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyKSB7XG5cdFx0XHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TWFya2VyID0gdGhpcy5fdGVybWluYWwucmVnaXN0ZXJNYXJrZXIoMCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZC5jb21tYW5kU3RhcnRNYXJrZXIpIHtcblx0XHRcdFx0dGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMucHVzaCh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2V2YWx1YXRlQ29tbWFuZE1hcmtlcnMoKTtcblx0fVxuXG5cdHBvc3RIYW5kbGVDb21tYW5kRmluaXNoZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudENvbW1hbmQgPSB0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kO1xuXHRcdGNvbnN0IGNvbW1hbmRUZXh0ID0gY3VycmVudENvbW1hbmQuY29tbWFuZDtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9IGN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcj8ubGluZTtcblx0XHRjb25zdCBleGVjdXRlZExpbmUgPSBjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRNYXJrZXI/LmxpbmU7XG5cdFx0aWYgKFxuXHRcdFx0IWNvbW1hbmRUZXh0IHx8IGNvbW1hbmRUZXh0Lmxlbmd0aCA9PT0gMCB8fFxuXHRcdFx0Y29tbWFuZExpbmUgPT09IHVuZGVmaW5lZCB8fCBjb21tYW5kTGluZSA9PT0gLTEgfHxcblx0XHRcdGV4ZWN1dGVkTGluZSA9PT0gdW5kZWZpbmVkIHx8IGV4ZWN1dGVkTGluZSA9PT0gLTFcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTY2FuIGRvd253YXJkcyBmcm9tIHRoZSBjb21tYW5kIHN0YXJ0IGxpbmUgYW5kIHNlYXJjaCBmb3IgZXZlcnkgY2hhcmFjdGVyIGluIHRoZSBhY3R1YWxcblx0XHQvLyBjb21tYW5kIGxpbmUuIFRoaXMgbWF5IGVuZCB1cCBtYXRjaGluZyB0aGUgd3JvbmcgY2hhcmFjdGVycywgYnV0IGl0IHNob3VsZG4ndCBtYXR0ZXIgYXRcblx0XHQvLyBsZWFzdCBpbiB0aGUgdHlwaWNhbCBjYXNlIGFzIHRoZSBlbnRpcmUgY29tbWFuZCB3aWxsIHN0aWxsIGdldCBtYXRjaGVkLlxuXHRcdGxldCBjdXJyZW50ID0gMDtcblx0XHRsZXQgZm91bmQgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gY29tbWFuZExpbmU7IGkgPD0gZXhlY3V0ZWRMaW5lOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmdldExpbmUoaSk7XG5cdFx0XHRpZiAoIWxpbmUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0ID0gbGluZS50cmFuc2xhdGVUb1N0cmluZyh0cnVlKTtcblx0XHRcdGZvciAobGV0IGogPSAwOyBqIDwgdGV4dC5sZW5ndGg7IGorKykge1xuXHRcdFx0XHQvLyBTa2lwIHdoaXRlc3BhY2UgaW4gY2FzZSBpdCB3YXMgbm90IGFjdHVhbGx5IHJlbmRlcmVkIG9yIGNvdWxkIGJlIHRyaW1tZWQgZnJvbSB0aGVcblx0XHRcdFx0Ly8gZW5kIG9mIHRoZSBsaW5lXG5cdFx0XHRcdHdoaWxlIChjb21tYW5kVGV4dC5sZW5ndGggPCBjdXJyZW50ICYmIGNvbW1hbmRUZXh0W2N1cnJlbnRdID09PSAnICcpIHtcblx0XHRcdFx0XHRjdXJyZW50Kys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDaGFyYWN0ZXIgbWF0Y2hcblx0XHRcdFx0aWYgKHRleHRbal0gPT09IGNvbW1hbmRUZXh0W2N1cnJlbnRdKSB7XG5cdFx0XHRcdFx0Y3VycmVudCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRnVsbCBjb21tYW5kIG1hdGNoXG5cdFx0XHRcdGlmIChjdXJyZW50ID09PSBjb21tYW5kVGV4dC5sZW5ndGgpIHtcblx0XHRcdFx0XHQvLyBJdCdzIGFtYmlndW91cyB3aGV0aGVyIHRoZSBjb21tYW5kIGV4ZWN1dGVkIG1hcmtlciBzaG91bGQgaWRlYWxseSBhcHBlYXIgYXRcblx0XHRcdFx0XHQvLyB0aGUgZW5kIG9mIHRoZSBsaW5lIG9yIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIG5leHQgbGluZS4gU2luY2UgaXQncyBtb3JlXG5cdFx0XHRcdFx0Ly8gdXNlZnVsIGZvciBleHRyYWN0aW5nIHRoZSBjb21tYW5kIGF0IHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgbGluZSB3ZSBnbyB3aXRoXG5cdFx0XHRcdFx0Ly8gdGhhdC5cblx0XHRcdFx0XHRjb25zdCB3cmFwc1RvTmV4dExpbmUgPSBqID49IHRoaXMuX3Rlcm1pbmFsLmNvbHMgLSAxO1xuXHRcdFx0XHRcdGN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlciA9IHRoaXMuX3Rlcm1pbmFsLnJlZ2lzdGVyTWFya2VyKGkgLSAodGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5iYXNlWSArIHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSkgKyAod3JhcHNUb05leHRMaW5lID8gMSA6IDApKTtcblx0XHRcdFx0XHRjdXJyZW50Q29tbWFuZC5jb21tYW5kRXhlY3V0ZWRYID0gd3JhcHNUb05leHRMaW5lID8gMCA6IGogKyAxO1xuXHRcdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGZvdW5kKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2V2YWx1YXRlQ29tbWFuZE1hcmtlcnMoKTogdm9pZCB7XG5cdFx0Ly8gT24gV2luZG93cywgdXNlIHRoZSBnYXRoZXJlZCBjdXJzb3IgbW92ZSBtYXJrZXJzIHRvIGNvcnJlY3QgdGhlIGNvbW1hbmQgc3RhcnQgYW5kXG5cdFx0Ly8gZXhlY3V0ZWQgbWFya2Vycy5cblx0XHRpZiAodGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzID0gdGhpcy5faG9va3MuY29tbWFuZE1hcmtlcnMuc29ydCgoYSwgYikgPT4gYS5saW5lIC0gYi5saW5lKTtcblx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlciA9IHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzWzBdO1xuXHRcdGlmICh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlcikge1xuXHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuZ2V0TGluZSh0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRTdGFydE1hcmtlci5saW5lKTtcblx0XHRcdGlmIChsaW5lKSB7XG5cdFx0XHRcdHRoaXMuX2NhcGFiaWxpdHkuY3VycmVudENvbW1hbmQuY29tbWFuZFN0YXJ0TGluZUNvbnRlbnQgPSBsaW5lLnRyYW5zbGF0ZVRvU3RyaW5nKHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jYXBhYmlsaXR5LmN1cnJlbnRDb21tYW5kLmNvbW1hbmRFeGVjdXRlZE1hcmtlciA9IHRoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzW3RoaXMuX2hvb2tzLmNvbW1hbmRNYXJrZXJzLmxlbmd0aCAtIDFdO1xuXHRcdC8vIEZpcmUgdGhpcyBub3cgdG8gcHJldmVudCBpc3N1ZXMgbGlrZSAjMTk3NDA5XG5cdFx0dGhpcy5faG9va3Mub25Db21tYW5kRXhlY3V0ZWRFbWl0dGVyLmZpcmUodGhpcy5fY2FwYWJpbGl0eS5jdXJyZW50Q29tbWFuZCBhcyBJVGVybWluYWxDb21tYW5kKTtcblx0fVxuXG5cdHByaXZhdGUgX2N1cnNvck9uTmV4dExpbmUoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbGFzdENvbW1hbmQgPSB0aGlzLl9jYXBhYmlsaXR5LmNvbW1hbmRzLmF0KC0xKTtcblxuXHRcdC8vIFRoZXJlIGlzIG9ubHkgYSBzaW5nbGUgY29tbWFuZCwgc28gdGhpcyBjaGVjayBpcyB1bm5lY2Vzc2FyeVxuXHRcdGlmICghbGFzdENvbW1hbmQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnNvcllBYnNvbHV0ZSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuYmFzZVkgKyB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclk7XG5cdFx0Ly8gSWYgdGhlIGN1cnNvciBwb3NpdGlvbiBpcyB3aXRoaW4gdGhlIGxhc3QgY29tbWFuZCwgd2Ugc2hvdWxkIHBvbGwuXG5cdFx0Y29uc3QgbGFzdENvbW1hbmRZQWJzb2x1dGUgPSAobGFzdENvbW1hbmQuZW5kTWFya2VyID8gbGFzdENvbW1hbmQuZW5kTWFya2VyLmxpbmUgOiBsYXN0Q29tbWFuZC5tYXJrZXI/LmxpbmUpID8/IC0xO1xuXHRcdHJldHVybiBjdXJzb3JZQWJzb2x1dGUgPiBsYXN0Q29tbWFuZFlBYnNvbHV0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3dhaXRGb3JDdXJzb3JNb3ZlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnNvclggPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclg7XG5cdFx0Y29uc3QgY3Vyc29yWSA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWTtcblx0XHRsZXQgdG90YWxEZWxheSA9IDA7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGludGVydmFsID0gc2V0SW50ZXJ2YWwoKCkgPT4ge1xuXHRcdFx0XHRpZiAoY3Vyc29yWCAhPT0gdGhpcy5fdGVybWluYWwuYnVmZmVyLmFjdGl2ZS5jdXJzb3JYIHx8IGN1cnNvclkgIT09IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuY3Vyc29yWSkge1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRjbGVhckludGVydmFsKGludGVydmFsKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dG90YWxEZWxheSArPSAxMDtcblx0XHRcdFx0aWYgKHRvdGFsRGVsYXkgPiAxMDAwKSB7XG5cdFx0XHRcdFx0Y2xlYXJJbnRlcnZhbChpbnRlcnZhbCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAxMCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXaW5kb3dzUHJvbXB0KHk6IG51bWJlciA9IHRoaXMuX3Rlcm1pbmFsLmJ1ZmZlci5hY3RpdmUuYmFzZVkgKyB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmN1cnNvclkpOiBzdHJpbmcgfCB7IHByb21wdDogc3RyaW5nOyBsaWtlbHlTaW5nbGVMaW5lOiB0cnVlIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxpbmUgPSB0aGlzLl90ZXJtaW5hbC5idWZmZXIuYWN0aXZlLmdldExpbmUoeSk7XG5cdFx0aWYgKCFsaW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVUZXh0ID0gbGluZS50cmFuc2xhdGVUb1N0cmluZyh0cnVlKTtcblx0XHRpZiAoIWxpbmVUZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUG93ZXJTaGVsbFxuXHRcdGNvbnN0IHB3c2hQcm9tcHQgPSBsaW5lVGV4dC5tYXRjaCgvKD88cHJvbXB0PihcXCguK1xcKVxccyk/KD86UFMuKz5cXHM/KSkvKT8uZ3JvdXBzPy5wcm9tcHQ7XG5cdFx0aWYgKHB3c2hQcm9tcHQpIHtcblx0XHRcdGNvbnN0IGFkanVzdGVkUHJvbXB0ID0gdGhpcy5fYWRqdXN0UHJvbXB0KHB3c2hQcm9tcHQsIGxpbmVUZXh0LCAnPicpO1xuXHRcdFx0aWYgKGFkanVzdGVkUHJvbXB0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cHJvbXB0OiBhZGp1c3RlZFByb21wdCxcblx0XHRcdFx0XHRsaWtlbHlTaW5nbGVMaW5lOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3VzdG9tIHByb21wdHMgbGlrZSBzdGFyc2hpcCBlbmQgaW4gdGhlIGNvbW1vbiBcXHUyNzZmIGNoYXJhY3RlclxuXHRcdGNvbnN0IGN1c3RvbVByb21wdCA9IGxpbmVUZXh0Lm1hdGNoKC8uKlxcdTI3NmYoPz1bXlxcdTI3NmZdKiQpL2cpPy5bMF07XG5cdFx0aWYgKGN1c3RvbVByb21wdCkge1xuXHRcdFx0Y29uc3QgYWRqdXN0ZWRQcm9tcHQgPSB0aGlzLl9hZGp1c3RQcm9tcHQoY3VzdG9tUHJvbXB0LCBsaW5lVGV4dCwgJ1xcdTI3NmYnKTtcblx0XHRcdGlmIChhZGp1c3RlZFByb21wdCkge1xuXHRcdFx0XHRyZXR1cm4gYWRqdXN0ZWRQcm9tcHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQmFzaCBQcm9tcHRcblx0XHRjb25zdCBiYXNoUHJvbXB0ID0gbGluZVRleHQubWF0Y2goL14oPzxwcm9tcHQ+XFwkKS8pPy5ncm91cHM/LnByb21wdDtcblx0XHRpZiAoYmFzaFByb21wdCkge1xuXHRcdFx0Y29uc3QgYWRqdXN0ZWRQcm9tcHQgPSB0aGlzLl9hZGp1c3RQcm9tcHQoYmFzaFByb21wdCwgbGluZVRleHQsICckJyk7XG5cdFx0XHRpZiAoYWRqdXN0ZWRQcm9tcHQpIHtcblx0XHRcdFx0cmV0dXJuIGFkanVzdGVkUHJvbXB0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFB5dGhvbiBQcm9tcHRcblx0XHRjb25zdCBweXRob25Qcm9tcHQgPSBsaW5lVGV4dC5tYXRjaCgvXig/PHByb21wdD4+Pj4gKS9nKT8uZ3JvdXBzPy5wcm9tcHQ7XG5cdFx0aWYgKHB5dGhvblByb21wdCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvbXB0OiBweXRob25Qcm9tcHQsXG5cdFx0XHRcdGxpa2VseVNpbmdsZUxpbmU6IHRydWVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gRHluYW1pYyBwcm9tcHQgZGV0ZWN0aW9uXG5cdFx0aWYgKHRoaXMuX2NhcGFiaWxpdHkucHJvbXB0VGVybWluYXRvciAmJiAobGluZVRleHQgPT09IHRoaXMuX2NhcGFiaWxpdHkucHJvbXB0VGVybWluYXRvciB8fCBsaW5lVGV4dC50cmltKCkuZW5kc1dpdGgodGhpcy5fY2FwYWJpbGl0eS5wcm9tcHRUZXJtaW5hdG9yKSkpIHtcblx0XHRcdGNvbnN0IGFkanVzdGVkUHJvbXB0ID0gdGhpcy5fYWRqdXN0UHJvbXB0KGxpbmVUZXh0LCBsaW5lVGV4dCwgdGhpcy5fY2FwYWJpbGl0eS5wcm9tcHRUZXJtaW5hdG9yKTtcblx0XHRcdGlmIChhZGp1c3RlZFByb21wdCkge1xuXHRcdFx0XHRyZXR1cm4gYWRqdXN0ZWRQcm9tcHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ29tbWFuZCBQcm9tcHRcblx0XHRjb25zdCBjbWRNYXRjaCA9IGxpbmVUZXh0Lm1hdGNoKC9eKD88cHJvbXB0PihcXCguK1xcKVxccyk/KD86W0EtWl06XFxcXC4qPikpLyk7XG5cdFx0cmV0dXJuIGNtZE1hdGNoPy5ncm91cHM/LnByb21wdCA/IHtcblx0XHRcdHByb21wdDogY21kTWF0Y2guZ3JvdXBzLnByb21wdCxcblx0XHRcdGxpa2VseVNpbmdsZUxpbmU6IHRydWVcblx0XHR9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRqdXN0UHJvbXB0KHByb21wdDogc3RyaW5nIHwgdW5kZWZpbmVkLCBsaW5lVGV4dDogc3RyaW5nLCBjaGFyOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcHJvbXB0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENvbnB0eSBtYXkgbm90ICdyZW5kZXInIHRoZSBzcGFjZSBhdCB0aGUgZW5kIG9mIHRoZSBwcm9tcHRcblx0XHRpZiAobGluZVRleHQgPT09IHByb21wdCAmJiBwcm9tcHQuZW5kc1dpdGgoY2hhcikpIHtcblx0XHRcdHByb21wdCArPSAnICc7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9tcHQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExpbmVzRm9yQ29tbWFuZChidWZmZXI6IElCdWZmZXIsIGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQsIGNvbHM6IG51bWJlciwgb3V0cHV0TWF0Y2hlcj86IElUZXJtaW5hbE91dHB1dE1hdGNoZXIpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdGlmICghb3V0cHV0TWF0Y2hlcikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZXhlY3V0ZWRNYXJrZXIgPSBjb21tYW5kLmV4ZWN1dGVkTWFya2VyO1xuXHRjb25zdCBlbmRNYXJrZXIgPSBjb21tYW5kLmVuZE1hcmtlcjtcblx0aWYgKCFleGVjdXRlZE1hcmtlciB8fCAhZW5kTWFya2VyKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdGFydExpbmUgPSBleGVjdXRlZE1hcmtlci5saW5lO1xuXHRjb25zdCBlbmRMaW5lID0gZW5kTWFya2VyLmxpbmU7XG5cblx0Y29uc3QgbGluZXNUb0NoZWNrID0gb3V0cHV0TWF0Y2hlci5sZW5ndGg7XG5cdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRpZiAob3V0cHV0TWF0Y2hlci5hbmNob3IgPT09ICdib3R0b20nKSB7XG5cdFx0Zm9yIChsZXQgaSA9IGVuZExpbmUgLSAob3V0cHV0TWF0Y2hlci5vZmZzZXQgfHwgMCk7IGkgPj0gc3RhcnRMaW5lOyBpLS0pIHtcblx0XHRcdGxldCB3cmFwcGVkTGluZVN0YXJ0ID0gaTtcblx0XHRcdGNvbnN0IHdyYXBwZWRMaW5lRW5kID0gaTtcblx0XHRcdHdoaWxlICh3cmFwcGVkTGluZVN0YXJ0ID49IHN0YXJ0TGluZSAmJiBidWZmZXIuZ2V0TGluZSh3cmFwcGVkTGluZVN0YXJ0KT8uaXNXcmFwcGVkKSB7XG5cdFx0XHRcdHdyYXBwZWRMaW5lU3RhcnQtLTtcblx0XHRcdH1cblx0XHRcdGkgPSB3cmFwcGVkTGluZVN0YXJ0O1xuXHRcdFx0bGluZXMudW5zaGlmdChnZXRYdGVybUxpbmVDb250ZW50KGJ1ZmZlciwgd3JhcHBlZExpbmVTdGFydCwgd3JhcHBlZExpbmVFbmQsIGNvbHMpKTtcblx0XHRcdGlmIChsaW5lcy5sZW5ndGggPiBsaW5lc1RvQ2hlY2spIHtcblx0XHRcdFx0bGluZXMucG9wKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGZvciAobGV0IGkgPSBzdGFydExpbmUgKyAob3V0cHV0TWF0Y2hlci5vZmZzZXQgfHwgMCk7IGkgPCBlbmRMaW5lOyBpKyspIHtcblx0XHRcdGNvbnN0IHdyYXBwZWRMaW5lU3RhcnQgPSBpO1xuXHRcdFx0bGV0IHdyYXBwZWRMaW5lRW5kID0gaTtcblx0XHRcdHdoaWxlICh3cmFwcGVkTGluZUVuZCArIDEgPCBlbmRMaW5lICYmIGJ1ZmZlci5nZXRMaW5lKHdyYXBwZWRMaW5lRW5kICsgMSk/LmlzV3JhcHBlZCkge1xuXHRcdFx0XHR3cmFwcGVkTGluZUVuZCsrO1xuXHRcdFx0fVxuXHRcdFx0aSA9IHdyYXBwZWRMaW5lRW5kO1xuXHRcdFx0bGluZXMucHVzaChnZXRYdGVybUxpbmVDb250ZW50KGJ1ZmZlciwgd3JhcHBlZExpbmVTdGFydCwgd3JhcHBlZExpbmVFbmQsIGNvbHMpKTtcblx0XHRcdGlmIChsaW5lcy5sZW5ndGggPT09IGxpbmVzVG9DaGVjaykge1xuXHRcdFx0XHRsaW5lcy5zaGlmdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gbGluZXM7XG59XG5cbmZ1bmN0aW9uIGdldFh0ZXJtTGluZUNvbnRlbnQoYnVmZmVyOiBJQnVmZmVyLCBsaW5lU3RhcnQ6IG51bWJlciwgbGluZUVuZDogbnVtYmVyLCBjb2xzOiBudW1iZXIpOiBzdHJpbmcge1xuXHQvLyBDYXAgdGhlIG1heGltdW0gbnVtYmVyIG9mIGxpbmVzIGdlbmVyYXRlZCB0byBwcmV2ZW50IHBvdGVudGlhbCBwZXJmb3JtYW5jZSBwcm9ibGVtcy4gVGhpcyBpc1xuXHQvLyBtb3JlIG9mIGEgc2FuaXR5IGNoZWNrIGFzIHRoZSB3cmFwcGVkIGxpbmUgc2hvdWxkIGFscmVhZHkgYmUgdHJpbW1lZCBkb3duIGF0IHRoaXMgcG9pbnQuXG5cdGNvbnN0IG1heExpbmVMZW5ndGggPSBNYXRoLm1heCgyMDQ4IC8gY29scyAqIDIpO1xuXHRsaW5lRW5kID0gTWF0aC5taW4obGluZUVuZCwgbGluZVN0YXJ0ICsgbWF4TGluZUxlbmd0aCk7XG5cdGxldCBjb250ZW50ID0gJyc7XG5cdGZvciAobGV0IGkgPSBsaW5lU3RhcnQ7IGkgPD0gbGluZUVuZDsgaSsrKSB7XG5cdFx0Ly8gTWFrZSBzdXJlIG9ubHkgMCB0byBjb2xzIGFyZSBjb25zaWRlcmVkIGFzIHJlc2l6aW5nIHdoZW4gd2luZG93cyBtb2RlIGlzIGVuYWJsZWQgd2lsbFxuXHRcdC8vIHJldGFpbiBidWZmZXIgZGF0YSBvdXRzaWRlIG9mIHRoZSB0ZXJtaW5hbCB3aWR0aCBhcyByZWZsb3cgaXMgZGlzYWJsZWQuXG5cdFx0Y29uc3QgbGluZSA9IGJ1ZmZlci5nZXRMaW5lKGkpO1xuXHRcdGlmIChsaW5lKSB7XG5cdFx0XHRjb250ZW50ICs9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcodHJ1ZSwgMCwgY29scyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuXG5mdW5jdGlvbiBjbG9uZU1hcmtlcih4dGVybTogVGVybWluYWwsIG1hcmtlcjogSU1hcmtlciwgb2Zmc2V0OiBudW1iZXIgPSAwKTogSU1hcmtlciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB4dGVybS5yZWdpc3Rlck1hcmtlcihtYXJrZXIubGluZSAtICh4dGVybS5idWZmZXIuYWN0aXZlLmJhc2VZICsgeHRlcm0uYnVmZmVyLmFjdGl2ZS5jdXJzb3JZKSArIG9mZnNldCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksNEJBQTRCLHlCQUF5QjtBQUMxRSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUFpTSwwQkFBMEI7QUFFcE8sU0FBaUMsdUJBQXVCLHdCQUF3Qix1QkFBdUI7QUFDdkcsU0FBUyx3QkFBZ0Q7QUFRbEQsSUFBTSw2QkFBTixjQUF5QyxXQUFrRDtBQUFBLEVBMkRqRyxZQUNrQixXQUNhLGFBQzdCO0FBQ0QsVUFBTTtBQUhXO0FBQ2E7QUE1RC9CLFNBQVMsT0FBTyxtQkFBbUI7QUFLbkMsU0FBVSxZQUErQixDQUFDO0FBSTFDLFNBQVEsa0JBQTZCLENBQUM7QUFFdEMsU0FBUSw2QkFBc0M7QUFFOUMsU0FBUSwyQkFBb0M7QUFHNUMsU0FBUSwrQkFBK0I7QUF5QnZDLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxRQUEwQixDQUFDO0FBQ25GLFNBQVMsbUJBQW1CLEtBQUssa0JBQWtCO0FBQ25ELFNBQWlCLHlCQUF5QixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDNUUsU0FBUyx3QkFBd0IsS0FBSyx1QkFBdUI7QUFDN0QsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDMUYsU0FBUywwQkFBMEIsS0FBSyx5QkFBeUI7QUFDakUsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDcEYs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
