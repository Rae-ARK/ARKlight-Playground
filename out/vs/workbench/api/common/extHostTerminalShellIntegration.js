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
import { TerminalShellExecutionCommandLineConfidence } from "./extHostTypes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { IExtHostTerminalService } from "./extHostTerminalService.js";
import { Emitter } from "../../../base/common/event.js";
import { URI } from "../../../base/common/uri.js";
import { AsyncIterableObject, Barrier } from "../../../base/common/async.js";
const IExtHostTerminalShellIntegration = createDecorator("IExtHostTerminalShellIntegration");
let ExtHostTerminalShellIntegration = class extends Disposable {
  constructor(extHostRpc, _extHostTerminalService) {
    super();
    this._extHostTerminalService = _extHostTerminalService;
    this._activeShellIntegrations = /* @__PURE__ */ new Map();
    this._onDidChangeTerminalShellIntegration = this._register(new Emitter());
    this.onDidChangeTerminalShellIntegration = this._onDidChangeTerminalShellIntegration.event;
    this._onDidStartTerminalShellExecution = this._register(new Emitter());
    this.onDidStartTerminalShellExecution = this._onDidStartTerminalShellExecution.event;
    this._onDidEndTerminalShellExecution = this._register(new Emitter());
    this.onDidEndTerminalShellExecution = this._onDidEndTerminalShellExecution.event;
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadTerminalShellIntegration);
    this._register(toDisposable(() => {
      for (const [_, integration] of this._activeShellIntegrations) {
        integration.dispose();
      }
      this._activeShellIntegrations.clear();
    }));
  }
  $shellIntegrationChange(instanceId, supportsExecuteCommandApi) {
    const terminal = this._extHostTerminalService.getTerminalById(instanceId);
    if (!terminal) {
      return;
    }
    const apiTerminal = terminal.value;
    let shellIntegration = this._activeShellIntegrations.get(instanceId);
    if (!shellIntegration) {
      shellIntegration = new InternalTerminalShellIntegration(terminal.value, supportsExecuteCommandApi, this._onDidStartTerminalShellExecution);
      this._activeShellIntegrations.set(instanceId, shellIntegration);
      shellIntegration.store.add(terminal.onWillDispose(() => this._activeShellIntegrations.get(instanceId)?.dispose()));
      shellIntegration.store.add(shellIntegration.onDidRequestShellExecution((commandLine) => this._proxy.$executeCommand(instanceId, commandLine)));
      shellIntegration.store.add(shellIntegration.onDidRequestEndExecution((e) => this._onDidEndTerminalShellExecution.fire(e)));
      shellIntegration.store.add(shellIntegration.onDidRequestChangeShellIntegration((e) => this._onDidChangeTerminalShellIntegration.fire(e)));
      terminal.shellIntegration = shellIntegration.value;
    }
    this._onDidChangeTerminalShellIntegration.fire({
      terminal: apiTerminal,
      shellIntegration: shellIntegration.value
    });
  }
  $shellExecutionStart(instanceId, supportsExecuteCommandApi, commandLineValue, commandLineConfidence, isTrusted, cwd) {
    if (!this._activeShellIntegrations.has(instanceId)) {
      this.$shellIntegrationChange(instanceId, supportsExecuteCommandApi);
    }
    const commandLine = {
      value: commandLineValue,
      confidence: commandLineConfidence,
      isTrusted
    };
    this._activeShellIntegrations.get(instanceId)?.startShellExecution(commandLine, this._convertCwdToUri(cwd));
  }
  $shellExecutionEnd(instanceId, commandLineValue, commandLineConfidence, isTrusted, exitCode) {
    const commandLine = {
      value: commandLineValue,
      confidence: commandLineConfidence,
      isTrusted
    };
    this._activeShellIntegrations.get(instanceId)?.endShellExecution(commandLine, exitCode);
  }
  $shellExecutionData(instanceId, data) {
    this._activeShellIntegrations.get(instanceId)?.emitData(data);
  }
  $shellEnvChange(instanceId, shellEnvKeys, shellEnvValues, isTrusted) {
    this._activeShellIntegrations.get(instanceId)?.setEnv(shellEnvKeys, shellEnvValues, isTrusted);
  }
  $cwdChange(instanceId, cwd) {
    this._activeShellIntegrations.get(instanceId)?.setCwd(this._convertCwdToUri(cwd));
  }
  $closeTerminal(instanceId) {
    this._activeShellIntegrations.get(instanceId)?.dispose();
    this._activeShellIntegrations.delete(instanceId);
  }
  _convertCwdToUri(cwd) {
    return cwd ? URI.file(cwd) : void 0;
  }
};
ExtHostTerminalShellIntegration = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostTerminalService)
], ExtHostTerminalShellIntegration);
class InternalTerminalShellIntegration extends Disposable {
  constructor(_terminal, supportsExecuteCommandApi, _onDidStartTerminalShellExecution) {
    super();
    this._terminal = _terminal;
    this._onDidStartTerminalShellExecution = _onDidStartTerminalShellExecution;
    this._pendingExecutions = [];
    this.store = this._register(new DisposableStore());
    this._onDidRequestChangeShellIntegration = this._register(new Emitter());
    this.onDidRequestChangeShellIntegration = this._onDidRequestChangeShellIntegration.event;
    this._onDidRequestShellExecution = this._register(new Emitter());
    this.onDidRequestShellExecution = this._onDidRequestShellExecution.event;
    this._onDidRequestEndExecution = this._register(new Emitter());
    this.onDidRequestEndExecution = this._onDidRequestEndExecution.event;
    this._onDidRequestNewExecution = this._register(new Emitter());
    this.onDidRequestNewExecution = this._onDidRequestNewExecution.event;
    const that = this;
    this.value = {
      get cwd() {
        return that._cwd;
      },
      get env() {
        if (!that._env) {
          return void 0;
        }
        return Object.freeze({
          isTrusted: that._env.isTrusted,
          value: Object.freeze({ ...that._env.value })
        });
      },
      // executeCommand(commandLine: string): vscode.TerminalShellExecution;
      // executeCommand(executable: string, args: string[]): vscode.TerminalShellExecution;
      executeCommand(commandLineOrExecutable, args) {
        if (!supportsExecuteCommandApi) {
          throw new Error("This terminal does not support the executeCommand API.");
        }
        let commandLineValue = commandLineOrExecutable;
        if (args) {
          for (const arg of args) {
            const wrapInQuotes = !arg.match(/["'`]/) && arg.match(/\s/);
            if (wrapInQuotes) {
              commandLineValue += ` "${arg}"`;
            } else {
              commandLineValue += ` ${arg}`;
            }
          }
        }
        that._onDidRequestShellExecution.fire(commandLineValue);
        const commandLine = {
          value: commandLineValue,
          confidence: TerminalShellExecutionCommandLineConfidence.High,
          isTrusted: true
        };
        const execution = that.requestNewShellExecution(commandLine, that._cwd).value;
        return execution;
      }
    };
  }
  get currentExecution() {
    return this._currentExecution;
  }
  requestNewShellExecution(commandLine, cwd) {
    const execution = new InternalTerminalShellExecution(commandLine, cwd ?? this._cwd);
    const unresolvedCommandLines = splitAndSanitizeCommandLine(commandLine.value);
    if (unresolvedCommandLines.length > 1) {
      this._currentExecutionProperties = {
        isMultiLine: true,
        unresolvedCommandLines: splitAndSanitizeCommandLine(commandLine.value)
      };
    }
    this._pendingExecutions.push(execution);
    this._onDidRequestNewExecution.fire(commandLine.value);
    return execution;
  }
  startShellExecution(commandLine, cwd) {
    if (this._pendingEndingExecution) {
      this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._pendingEndingExecution.value, exitCode: void 0 });
      this._pendingEndingExecution = void 0;
    }
    if (this._currentExecution) {
      if (this._currentExecutionProperties?.isMultiLine && this._currentExecutionProperties.unresolvedCommandLines) {
        const subExecutionResult = isSubExecution(this._currentExecutionProperties.unresolvedCommandLines, commandLine);
        if (subExecutionResult) {
          this._currentExecutionProperties.unresolvedCommandLines = subExecutionResult.unresolvedCommandLines;
          return;
        }
      }
      this._currentExecution.endExecution(void 0);
      this._currentExecution.flush();
      this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._currentExecution.value, exitCode: void 0 });
    }
    let currentExecution;
    if (commandLine.confidence === TerminalShellExecutionCommandLineConfidence.High) {
      for (const [i, execution] of this._pendingExecutions.entries()) {
        if (execution.value.commandLine.value === commandLine.value) {
          currentExecution = execution;
          this._currentExecutionProperties = {
            isMultiLine: false,
            unresolvedCommandLines: void 0
          };
          currentExecution = execution;
          this._pendingExecutions.splice(i, 1);
          break;
        } else {
          const subExecutionResult = isSubExecution(splitAndSanitizeCommandLine(execution.value.commandLine.value), commandLine);
          if (subExecutionResult) {
            this._currentExecutionProperties = {
              isMultiLine: true,
              unresolvedCommandLines: subExecutionResult.unresolvedCommandLines
            };
            currentExecution = execution;
            this._pendingExecutions.splice(i, 1);
            break;
          }
        }
      }
    } else {
      currentExecution = this._pendingExecutions.shift();
    }
    if (!currentExecution) {
      currentExecution = new InternalTerminalShellExecution(commandLine, cwd ?? this._cwd);
    }
    this._currentExecution = currentExecution;
    this._onDidStartTerminalShellExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: this._currentExecution.value });
  }
  emitData(data) {
    this.currentExecution?.emitData(data);
  }
  endShellExecution(commandLine, exitCode) {
    if (this._currentExecutionProperties?.isMultiLine) {
      if (this._currentExecutionProperties.unresolvedCommandLines && this._currentExecutionProperties.unresolvedCommandLines.length > 0) {
        return;
      }
    }
    if (this._currentExecution) {
      const commandLineForEvent = this._currentExecutionProperties?.isMultiLine ? this._currentExecution.value.commandLine : commandLine;
      this._currentExecution.endExecution(commandLineForEvent);
      const currentExecution = this._currentExecution;
      this._pendingEndingExecution = currentExecution;
      this._currentExecution = void 0;
      currentExecution.flush().then(() => {
        if (this._pendingEndingExecution === currentExecution) {
          this._onDidRequestEndExecution.fire({ terminal: this._terminal, shellIntegration: this.value, execution: currentExecution.value, exitCode });
          this._pendingEndingExecution = void 0;
        }
      });
    }
  }
  setEnv(keys, values, isTrusted) {
    const env = {};
    for (let i = 0; i < keys.length; i++) {
      env[keys[i]] = values[i];
    }
    this._env = { value: env, isTrusted };
    this._fireChangeEvent();
  }
  setCwd(cwd) {
    let wasChanged = false;
    if (URI.isUri(this._cwd)) {
      wasChanged = !URI.isUri(cwd) || this._cwd.toString() !== cwd.toString();
    } else if (this._cwd !== cwd) {
      wasChanged = true;
    }
    if (wasChanged) {
      this._cwd = cwd;
      this._fireChangeEvent();
    }
  }
  _fireChangeEvent() {
    this._onDidRequestChangeShellIntegration.fire({ terminal: this._terminal, shellIntegration: this.value });
  }
}
class InternalTerminalShellExecution {
  constructor(_commandLine, cwd) {
    this._commandLine = _commandLine;
    this.cwd = cwd;
    this._isEnded = false;
    const that = this;
    this.value = {
      get commandLine() {
        return that._commandLine;
      },
      get cwd() {
        return that.cwd;
      },
      read() {
        return that._createDataStream();
      }
    };
  }
  _createDataStream() {
    if (!this._dataStream) {
      if (this._isEnded) {
        return AsyncIterableObject.EMPTY;
      }
      this._dataStream = new ShellExecutionDataStream();
    }
    return this._dataStream.createIterable();
  }
  emitData(data) {
    if (!this._isEnded) {
      this._dataStream?.emitData(data);
    }
  }
  endExecution(commandLine) {
    if (commandLine) {
      this._commandLine = commandLine;
    }
    this._dataStream?.endExecution();
    this._isEnded = true;
  }
  async flush() {
    if (this._dataStream) {
      await this._dataStream.flush();
      this._dataStream.dispose();
      this._dataStream = void 0;
    }
  }
}
class ShellExecutionDataStream extends Disposable {
  constructor() {
    super(...arguments);
    this._iterables = [];
    this._emitters = [];
  }
  createIterable() {
    if (!this._barrier) {
      this._barrier = new Barrier();
    }
    const barrier = this._barrier;
    const iterable = new AsyncIterableObject(async (emitter) => {
      this._emitters.push(emitter);
      await barrier.wait();
    });
    this._iterables.push(iterable);
    return iterable;
  }
  emitData(data) {
    for (const emitter of this._emitters) {
      emitter.emitOne(data);
    }
  }
  endExecution() {
    this._barrier?.open();
  }
  async flush() {
    await Promise.all(this._iterables.map((e) => e.toPromise()));
  }
}
function splitAndSanitizeCommandLine(commandLine) {
  return commandLine.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}
function isSubExecution(unresolvedCommandLines, commandLine) {
  if (unresolvedCommandLines.length === 0) {
    return false;
  }
  const newUnresolvedCommandLines = [...unresolvedCommandLines];
  const subExecutionLines = splitAndSanitizeCommandLine(commandLine.value);
  if (newUnresolvedCommandLines && newUnresolvedCommandLines.length > 0) {
    while (newUnresolvedCommandLines.length > 0) {
      if (newUnresolvedCommandLines[0] !== subExecutionLines[0]) {
        break;
      }
      newUnresolvedCommandLines.shift();
      subExecutionLines.shift();
    }
    if (subExecutionLines.length === 0) {
      return { unresolvedCommandLines: newUnresolvedCommandLines };
    }
  }
  return false;
}
export {
  ExtHostTerminalShellIntegration,
  IExtHostTerminalShellIntegration,
  InternalTerminalShellIntegration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lQ29uZmlkZW5jZSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIHR5cGUgRXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvblNoYXBlLCB0eXBlIE1haW5UaHJlYWRUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25TaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIHR5cGUgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZU9iamVjdCwgQmFycmllciwgdHlwZSBBc3luY0l0ZXJhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbiBleHRlbmRzIEV4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25TaGFwZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbjogRXZlbnQ8dnNjb2RlLlRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbkNoYW5nZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb246IEV2ZW50PHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uU3RhcnRFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkRW5kVGVybWluYWxTaGVsbEV4ZWN1dGlvbjogRXZlbnQ8dnNjb2RlLlRlcm1pbmFsU2hlbGxFeGVjdXRpb25FbmRFdmVudD47XG59XG5leHBvcnQgY29uc3QgSUV4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24gPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24+KCdJRXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbicpO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbiB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBfcHJveHk6IE1haW5UaHJlYWRUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25TaGFwZTtcblxuXHRwcml2YXRlIF9hY3RpdmVTaGVsbEludGVncmF0aW9uczogTWFwPC8qaW5zdGFuY2VJZCovbnVtYmVyLCBJbnRlcm5hbFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbj4gPSBuZXcgTWFwKCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGVybWluYWxTaGVsbEludGVncmF0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24uZXZlbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuVGVybWluYWxTaGVsbEV4ZWN1dGlvblN0YXJ0RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFN0YXJ0VGVybWluYWxTaGVsbEV4ZWN1dGlvbiA9IHRoaXMuX29uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uLmV2ZW50O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkRW5kVGVybWluYWxTaGVsbEV4ZWN1dGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uRW5kRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVuZFRlcm1pbmFsU2hlbGxFeGVjdXRpb24gPSB0aGlzLl9vbkRpZEVuZFRlcm1pbmFsU2hlbGxFeGVjdXRpb24uZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0VGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RUZXJtaW5hbFNlcnZpY2U6IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24pO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgbGlzdGVuZXJzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgW18sIGludGVncmF0aW9uXSBvZiB0aGlzLl9hY3RpdmVTaGVsbEludGVncmF0aW9ucykge1xuXHRcdFx0XHRpbnRlZ3JhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3RpdmVTaGVsbEludGVncmF0aW9ucy5jbGVhcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENvbnZlbmllbnQgdGVzdCBjb2RlOlxuXHRcdC8vIHRoaXMub25EaWRDaGFuZ2VUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24oZSA9PiB7XG5cdFx0Ly8gXHRjb25zb2xlLmxvZygnKioqIG9uRGlkQ2hhbmdlVGVybWluYWxTaGVsbEludGVncmF0aW9uJywgZSk7XG5cdFx0Ly8gfSk7XG5cdFx0Ly8gdGhpcy5vbkRpZFN0YXJ0VGVybWluYWxTaGVsbEV4ZWN1dGlvbihhc3luYyBlID0+IHtcblx0XHQvLyBcdGNvbnNvbGUubG9nKCcqKiogb25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb24nLCBlKTtcblx0XHQvLyBcdC8vIG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdC8vIFx0Ly8gXHQoYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFx0Ly8gXHRcdGZvciBhd2FpdCAoY29uc3QgZCBvZiBlLmV4ZWN1dGlvbi5yZWFkKCkpIHtcblx0XHQvLyBcdC8vIFx0XHRcdGNvbnNvbGUubG9nKCdkYXRhMicsIGQpO1xuXHRcdC8vIFx0Ly8gXHRcdH1cblx0XHQvLyBcdC8vIFx0fSkoKTtcblx0XHQvLyBcdC8vIH0pO1xuXHRcdC8vIFx0Zm9yIGF3YWl0IChjb25zdCBkIG9mIGUuZXhlY3V0aW9uLnJlYWQoKSkge1xuXHRcdC8vIFx0XHRjb25zb2xlLmxvZygnZGF0YScsIGQpO1xuXHRcdC8vIFx0fVxuXHRcdC8vIH0pO1xuXHRcdC8vIHRoaXMub25EaWRFbmRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uKGUgPT4ge1xuXHRcdC8vIFx0Y29uc29sZS5sb2coJyoqKiBvbkRpZEVuZFRlcm1pbmFsU2hlbGxFeGVjdXRpb24nLCBlKTtcblx0XHQvLyB9KTtcblx0XHQvLyBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHQvLyBcdGNvbnNvbGUubG9nKCdiZWZvcmUgZXhlY3V0ZUNvbW1hbmQoXFxcImVjaG8gaGVsbG9cXFwiKScpO1xuXHRcdC8vIFx0QXJyYXkuZnJvbSh0aGlzLl9hY3RpdmVTaGVsbEludGVncmF0aW9ucy52YWx1ZXMoKSlbMF0udmFsdWUuZXhlY3V0ZUNvbW1hbmQoJ2VjaG8gaGVsbG8nKTtcblx0XHQvLyBcdGNvbnNvbGUubG9nKCdhZnRlciBleGVjdXRlQ29tbWFuZChcXFwiZWNobyBoZWxsb1xcXCIpJyk7XG5cdFx0Ly8gfSwgNDAwMCk7XG5cdH1cblxuXHRwdWJsaWMgJHNoZWxsSW50ZWdyYXRpb25DaGFuZ2UoaW5zdGFuY2VJZDogbnVtYmVyLCBzdXBwb3J0c0V4ZWN1dGVDb21tYW5kQXBpOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl9leHRIb3N0VGVybWluYWxTZXJ2aWNlLmdldFRlcm1pbmFsQnlJZChpbnN0YW5jZUlkKTtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBpVGVybWluYWwgPSB0ZXJtaW5hbC52YWx1ZTtcblx0XHRsZXQgc2hlbGxJbnRlZ3JhdGlvbiA9IHRoaXMuX2FjdGl2ZVNoZWxsSW50ZWdyYXRpb25zLmdldChpbnN0YW5jZUlkKTtcblx0XHRpZiAoIXNoZWxsSW50ZWdyYXRpb24pIHtcblx0XHRcdHNoZWxsSW50ZWdyYXRpb24gPSBuZXcgSW50ZXJuYWxUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24odGVybWluYWwudmFsdWUsIHN1cHBvcnRzRXhlY3V0ZUNvbW1hbmRBcGksIHRoaXMuX29uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uKTtcblx0XHRcdHRoaXMuX2FjdGl2ZVNoZWxsSW50ZWdyYXRpb25zLnNldChpbnN0YW5jZUlkLCBzaGVsbEludGVncmF0aW9uKTtcblx0XHRcdHNoZWxsSW50ZWdyYXRpb24uc3RvcmUuYWRkKHRlcm1pbmFsLm9uV2lsbERpc3Bvc2UoKCkgPT4gdGhpcy5fYWN0aXZlU2hlbGxJbnRlZ3JhdGlvbnMuZ2V0KGluc3RhbmNlSWQpPy5kaXNwb3NlKCkpKTtcblx0XHRcdHNoZWxsSW50ZWdyYXRpb24uc3RvcmUuYWRkKHNoZWxsSW50ZWdyYXRpb24ub25EaWRSZXF1ZXN0U2hlbGxFeGVjdXRpb24oY29tbWFuZExpbmUgPT4gdGhpcy5fcHJveHkuJGV4ZWN1dGVDb21tYW5kKGluc3RhbmNlSWQsIGNvbW1hbmRMaW5lKSkpO1xuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbi5zdG9yZS5hZGQoc2hlbGxJbnRlZ3JhdGlvbi5vbkRpZFJlcXVlc3RFbmRFeGVjdXRpb24oZSA9PiB0aGlzLl9vbkRpZEVuZFRlcm1pbmFsU2hlbGxFeGVjdXRpb24uZmlyZShlKSkpO1xuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbi5zdG9yZS5hZGQoc2hlbGxJbnRlZ3JhdGlvbi5vbkRpZFJlcXVlc3RDaGFuZ2VTaGVsbEludGVncmF0aW9uKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24uZmlyZShlKSkpO1xuXHRcdFx0dGVybWluYWwuc2hlbGxJbnRlZ3JhdGlvbiA9IHNoZWxsSW50ZWdyYXRpb24udmFsdWU7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGVybWluYWxTaGVsbEludGVncmF0aW9uLmZpcmUoe1xuXHRcdFx0dGVybWluYWw6IGFwaVRlcm1pbmFsLFxuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbjogc2hlbGxJbnRlZ3JhdGlvbi52YWx1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICRzaGVsbEV4ZWN1dGlvblN0YXJ0KGluc3RhbmNlSWQ6IG51bWJlciwgc3VwcG9ydHNFeGVjdXRlQ29tbWFuZEFwaTogYm9vbGVhbiwgY29tbWFuZExpbmVWYWx1ZTogc3RyaW5nLCBjb21tYW5kTGluZUNvbmZpZGVuY2U6IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UsIGlzVHJ1c3RlZDogYm9vbGVhbiwgY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBGb3JjZSBzaGVsbEludGVncmF0aW9uIGNyZWF0aW9uIGlmIGl0IGhhc24ndCBiZWVuIGNyZWF0ZWQgeWV0LCB0aGlzIGNvdWxkIHdoZW4gZXZlbnRzXG5cdFx0Ly8gZG9uJ3QgY29tZSB0aHJvdWdoIG9uIHN0YXJ0dXBcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZVNoZWxsSW50ZWdyYXRpb25zLmhhcyhpbnN0YW5jZUlkKSkge1xuXHRcdFx0dGhpcy4kc2hlbGxJbnRlZ3JhdGlvbkNoYW5nZShpbnN0YW5jZUlkLCBzdXBwb3J0c0V4ZWN1dGVDb21tYW5kQXBpKTtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZExpbmU6IHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmUgPSB7XG5cdFx0XHR2YWx1ZTogY29tbWFuZExpbmVWYWx1ZSxcblx0XHRcdGNvbmZpZGVuY2U6IGNvbW1hbmRMaW5lQ29uZmlkZW5jZSxcblx0XHRcdGlzVHJ1c3RlZFxuXHRcdH07XG5cdFx0dGhpcy5fYWN0aXZlU2hlbGxJbnRlZ3JhdGlvbnMuZ2V0KGluc3RhbmNlSWQpPy5zdGFydFNoZWxsRXhlY3V0aW9uKGNvbW1hbmRMaW5lLCB0aGlzLl9jb252ZXJ0Q3dkVG9VcmkoY3dkKSk7XG5cdH1cblxuXHRwdWJsaWMgJHNoZWxsRXhlY3V0aW9uRW5kKGluc3RhbmNlSWQ6IG51bWJlciwgY29tbWFuZExpbmVWYWx1ZTogc3RyaW5nLCBjb21tYW5kTGluZUNvbmZpZGVuY2U6IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UsIGlzVHJ1c3RlZDogYm9vbGVhbiwgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lOiB2c2NvZGUuVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lID0ge1xuXHRcdFx0dmFsdWU6IGNvbW1hbmRMaW5lVmFsdWUsXG5cdFx0XHRjb25maWRlbmNlOiBjb21tYW5kTGluZUNvbmZpZGVuY2UsXG5cdFx0XHRpc1RydXN0ZWRcblx0XHR9O1xuXHRcdHRoaXMuX2FjdGl2ZVNoZWxsSW50ZWdyYXRpb25zLmdldChpbnN0YW5jZUlkKT8uZW5kU2hlbGxFeGVjdXRpb24oY29tbWFuZExpbmUsIGV4aXRDb2RlKTtcblx0fVxuXG5cdHB1YmxpYyAkc2hlbGxFeGVjdXRpb25EYXRhKGluc3RhbmNlSWQ6IG51bWJlciwgZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlU2hlbGxJbnRlZ3JhdGlvbnMuZ2V0KGluc3RhbmNlSWQpPy5lbWl0RGF0YShkYXRhKTtcblx0fVxuXG5cdHB1YmxpYyAkc2hlbGxFbnZDaGFuZ2UoaW5zdGFuY2VJZDogbnVtYmVyLCBzaGVsbEVudktleXM6IHN0cmluZ1tdLCBzaGVsbEVudlZhbHVlczogc3RyaW5nW10sIGlzVHJ1c3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVNoZWxsSW50ZWdyYXRpb25zLmdldChpbnN0YW5jZUlkKT8uc2V0RW52KHNoZWxsRW52S2V5cywgc2hlbGxFbnZWYWx1ZXMsIGlzVHJ1c3RlZCk7XG5cdH1cblxuXHRwdWJsaWMgJGN3ZENoYW5nZShpbnN0YW5jZUlkOiBudW1iZXIsIGN3ZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlU2hlbGxJbnRlZ3JhdGlvbnMuZ2V0KGluc3RhbmNlSWQpPy5zZXRDd2QodGhpcy5fY29udmVydEN3ZFRvVXJpKGN3ZCkpO1xuXHR9XG5cblx0cHVibGljICRjbG9zZVRlcm1pbmFsKGluc3RhbmNlSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVNoZWxsSW50ZWdyYXRpb25zLmdldChpbnN0YW5jZUlkKT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2FjdGl2ZVNoZWxsSW50ZWdyYXRpb25zLmRlbGV0ZShpbnN0YW5jZUlkKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRDd2RUb1VyaShjd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gSU1QT1JUQU5UOiBjd2QgaXMgcHJvdmlkZWQgdG8gdGhlIGV4dGhvc3QgYXMgYSBzdHJpbmcgZnJvbSB0aGUgcmVuZGVyZXIgYW5kIG9ubHlcblx0XHQvLyBjb252ZXJ0ZWQgdG8gYSBVUkkgb24gdGhlIG1hY2hpbmUgaW4gd2hpY2ggdGhlIHB0eSBpcyBob3N0ZWQgb24uIFRoZSBzdHJpbmcgdmVyc2lvbiBvZlxuXHRcdC8vIHRoZSBjd2QgaXMgdXNlZCBmcm9tIHRoZSByZW5kZXJlciBzdWNoIHRoYXQgaXQncyBhY2Nlc3MgaXMgc3luY2hyb25vdXMgYW5kIGl0cyBldmVudFxuXHRcdC8vIGNvbWVzIHRocm91Z2ggaW4gb3JkZXIgcmVsYXRpdmUgdG8gb3RoZXIgc2hlbGwgaW50ZWdyYXRpb24gZXZlbnRzLlxuXHRcdHJldHVybiBjd2QgPyBVUkkuZmlsZShjd2QpIDogdW5kZWZpbmVkO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRXhlY3V0aW9uUHJvcGVydGllcyB7XG5cdGlzTXVsdGlMaW5lOiBib29sZWFuO1xuXHR1bnJlc29sdmVkQ29tbWFuZExpbmVzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIEludGVybmFsVGVybWluYWxTaGVsbEludGVncmF0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX3BlbmRpbmdFeGVjdXRpb25zOiBJbnRlcm5hbFRlcm1pbmFsU2hlbGxFeGVjdXRpb25bXSA9IFtdO1xuXHRwcml2YXRlIF9wZW5kaW5nRW5kaW5nRXhlY3V0aW9uOiBJbnRlcm5hbFRlcm1pbmFsU2hlbGxFeGVjdXRpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY3VycmVudEV4ZWN1dGlvblByb3BlcnRpZXM6IElFeGVjdXRpb25Qcm9wZXJ0aWVzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50RXhlY3V0aW9uOiBJbnRlcm5hbFRlcm1pbmFsU2hlbGxFeGVjdXRpb24gfCB1bmRlZmluZWQ7XG5cdGdldCBjdXJyZW50RXhlY3V0aW9uKCk6IEludGVybmFsVGVybWluYWxTaGVsbEV4ZWN1dGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9jdXJyZW50RXhlY3V0aW9uOyB9XG5cblxuXHRwcml2YXRlIF9lbnY6IHZzY29kZS5UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25FbnZpcm9ubWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3dkOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cmVhZG9ubHkgdmFsdWU6IHZzY29kZS5UZXJtaW5hbFNoZWxsSW50ZWdyYXRpb247XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RDaGFuZ2VTaGVsbEludGVncmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLlRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbkNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0Q2hhbmdlU2hlbGxJbnRlZ3JhdGlvbiA9IHRoaXMuX29uRGlkUmVxdWVzdENoYW5nZVNoZWxsSW50ZWdyYXRpb24uZXZlbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRSZXF1ZXN0U2hlbGxFeGVjdXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RTaGVsbEV4ZWN1dGlvbiA9IHRoaXMuX29uRGlkUmVxdWVzdFNoZWxsRXhlY3V0aW9uLmV2ZW50O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkUmVxdWVzdEVuZEV4ZWN1dGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uRW5kRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RFbmRFeGVjdXRpb24gPSB0aGlzLl9vbkRpZFJlcXVlc3RFbmRFeGVjdXRpb24uZXZlbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRSZXF1ZXN0TmV3RXhlY3V0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0TmV3RXhlY3V0aW9uID0gdGhpcy5fb25EaWRSZXF1ZXN0TmV3RXhlY3V0aW9uLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsOiB2c2NvZGUuVGVybWluYWwsXG5cdFx0c3VwcG9ydHNFeGVjdXRlQ29tbWFuZEFwaTogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN0YXJ0VGVybWluYWxTaGVsbEV4ZWN1dGlvbjogRW1pdHRlcjx2c2NvZGUuVGVybWluYWxTaGVsbEV4ZWN1dGlvblN0YXJ0RXZlbnQ+XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLnZhbHVlID0ge1xuXHRcdFx0Z2V0IGN3ZCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fY3dkO1xuXHRcdFx0fSxcblx0XHRcdGdldCBlbnYoKTogdnNjb2RlLlRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbkVudmlyb25tZW50IHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0aWYgKCF0aGF0Ll9lbnYpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBPYmplY3QuZnJlZXplKHtcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRoYXQuX2Vudi5pc1RydXN0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IE9iamVjdC5mcmVlemUoeyAuLi50aGF0Ll9lbnYudmFsdWUgfSlcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0Ly8gZXhlY3V0ZUNvbW1hbmQoY29tbWFuZExpbmU6IHN0cmluZyk6IHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uO1xuXHRcdFx0Ly8gZXhlY3V0ZUNvbW1hbmQoZXhlY3V0YWJsZTogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSk6IHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uO1xuXHRcdFx0ZXhlY3V0ZUNvbW1hbmQoY29tbWFuZExpbmVPckV4ZWN1dGFibGU6IHN0cmluZywgYXJncz86IHN0cmluZ1tdKTogdnNjb2RlLlRlcm1pbmFsU2hlbGxFeGVjdXRpb24ge1xuXHRcdFx0XHRpZiAoIXN1cHBvcnRzRXhlY3V0ZUNvbW1hbmRBcGkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgdGVybWluYWwgZG9lcyBub3Qgc3VwcG9ydCB0aGUgZXhlY3V0ZUNvbW1hbmQgQVBJLicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBjb21tYW5kTGluZVZhbHVlID0gY29tbWFuZExpbmVPckV4ZWN1dGFibGU7XG5cdFx0XHRcdGlmIChhcmdzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhcmcgb2YgYXJncykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgd3JhcEluUXVvdGVzID0gIWFyZy5tYXRjaCgvW1wiJ2BdLykgJiYgYXJnLm1hdGNoKC9cXHMvKTtcblx0XHRcdFx0XHRcdGlmICh3cmFwSW5RdW90ZXMpIHtcblx0XHRcdFx0XHRcdFx0Y29tbWFuZExpbmVWYWx1ZSArPSBgIFwiJHthcmd9XCJgO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29tbWFuZExpbmVWYWx1ZSArPSBgICR7YXJnfWA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhhdC5fb25EaWRSZXF1ZXN0U2hlbGxFeGVjdXRpb24uZmlyZShjb21tYW5kTGluZVZhbHVlKTtcblx0XHRcdFx0Ly8gRmlyZSB0aGUgZXZlbnQgaW4gYSBtaWNyb3Rhc2sgdG8gYWxsb3cgdGhlIGV4dGVuc2lvbiB0byB1c2UgdGhlIGV4ZWN1dGlvbiBiZWZvcmVcblx0XHRcdFx0Ly8gdGhlIHN0YXJ0IGV2ZW50IGZpcmVzXG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lOiB2c2NvZGUuVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lID0ge1xuXHRcdFx0XHRcdHZhbHVlOiBjb21tYW5kTGluZVZhbHVlLFxuXHRcdFx0XHRcdGNvbmZpZGVuY2U6IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UuSGlnaCxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gdGhhdC5yZXF1ZXN0TmV3U2hlbGxFeGVjdXRpb24oY29tbWFuZExpbmUsIHRoYXQuX2N3ZCkudmFsdWU7XG5cdFx0XHRcdHJldHVybiBleGVjdXRpb247XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHJlcXVlc3ROZXdTaGVsbEV4ZWN1dGlvbihjb21tYW5kTGluZTogdnNjb2RlLlRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZSwgY3dkOiBVUkkgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBleGVjdXRpb24gPSBuZXcgSW50ZXJuYWxUZXJtaW5hbFNoZWxsRXhlY3V0aW9uKGNvbW1hbmRMaW5lLCBjd2QgPz8gdGhpcy5fY3dkKTtcblx0XHRjb25zdCB1bnJlc29sdmVkQ29tbWFuZExpbmVzID0gc3BsaXRBbmRTYW5pdGl6ZUNvbW1hbmRMaW5lKGNvbW1hbmRMaW5lLnZhbHVlKTtcblx0XHRpZiAodW5yZXNvbHZlZENvbW1hbmRMaW5lcy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50RXhlY3V0aW9uUHJvcGVydGllcyA9IHtcblx0XHRcdFx0aXNNdWx0aUxpbmU6IHRydWUsXG5cdFx0XHRcdHVucmVzb2x2ZWRDb21tYW5kTGluZXM6IHNwbGl0QW5kU2FuaXRpemVDb21tYW5kTGluZShjb21tYW5kTGluZS52YWx1ZSksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nRXhlY3V0aW9ucy5wdXNoKGV4ZWN1dGlvbik7XG5cdFx0dGhpcy5fb25EaWRSZXF1ZXN0TmV3RXhlY3V0aW9uLmZpcmUoY29tbWFuZExpbmUudmFsdWUpO1xuXHRcdHJldHVybiBleGVjdXRpb247XG5cdH1cblxuXHRzdGFydFNoZWxsRXhlY3V0aW9uKGNvbW1hbmRMaW5lOiB2c2NvZGUuVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lLCBjd2Q6IFVSSSB8IHVuZGVmaW5lZCk6IHVuZGVmaW5lZCB7XG5cdFx0Ly8gU2luY2UgYW4gZXhlY3V0aW9uIGlzIHN0YXJ0aW5nLCBmaXJlIHRoZSBlbmQgZXZlbnQgZm9yIGFueSBleGVjdXRpb24gdGhhdCBpcyBhd2FpdGluZyB0b1xuXHRcdC8vIGVuZC4gV2hlbiB0aGlzIGhhcHBlbnMgaXQgbWVhbnMgdGhhdCB0aGUgZGF0YSBzdHJlYW0gbWF5IG5vdCBiZSBmbHVzaGVkIGFuZCB0aGVyZWZvcmUgbWF5XG5cdFx0Ly8gZmlyZSBldmVudHMgYWZ0ZXIgdGhlIGVuZCBldmVudC5cblx0XHRpZiAodGhpcy5fcGVuZGluZ0VuZGluZ0V4ZWN1dGlvbikge1xuXHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0RW5kRXhlY3V0aW9uLmZpcmUoeyB0ZXJtaW5hbDogdGhpcy5fdGVybWluYWwsIHNoZWxsSW50ZWdyYXRpb246IHRoaXMudmFsdWUsIGV4ZWN1dGlvbjogdGhpcy5fcGVuZGluZ0VuZGluZ0V4ZWN1dGlvbi52YWx1ZSwgZXhpdENvZGU6IHVuZGVmaW5lZCB9KTtcblx0XHRcdHRoaXMuX3BlbmRpbmdFbmRpbmdFeGVjdXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRFeGVjdXRpb24pIHtcblx0XHRcdC8vIElmIHRoZSBjdXJyZW50IGV4ZWN1dGlvbiBpcyBtdWx0aS1saW5lLCBjaGVjayBpZiB0aGlzIGNvbW1hbmQgbGluZSBpcyBwYXJ0IG9mIGl0LlxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRFeGVjdXRpb25Qcm9wZXJ0aWVzPy5pc011bHRpTGluZSAmJiB0aGlzLl9jdXJyZW50RXhlY3V0aW9uUHJvcGVydGllcy51bnJlc29sdmVkQ29tbWFuZExpbmVzKSB7XG5cdFx0XHRcdGNvbnN0IHN1YkV4ZWN1dGlvblJlc3VsdCA9IGlzU3ViRXhlY3V0aW9uKHRoaXMuX2N1cnJlbnRFeGVjdXRpb25Qcm9wZXJ0aWVzLnVucmVzb2x2ZWRDb21tYW5kTGluZXMsIGNvbW1hbmRMaW5lKTtcblx0XHRcdFx0aWYgKHN1YkV4ZWN1dGlvblJlc3VsdCkge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRFeGVjdXRpb25Qcm9wZXJ0aWVzLnVucmVzb2x2ZWRDb21tYW5kTGluZXMgPSBzdWJFeGVjdXRpb25SZXN1bHQudW5yZXNvbHZlZENvbW1hbmRMaW5lcztcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2N1cnJlbnRFeGVjdXRpb24uZW5kRXhlY3V0aW9uKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50RXhlY3V0aW9uLmZsdXNoKCk7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RFbmRFeGVjdXRpb24uZmlyZSh7IHRlcm1pbmFsOiB0aGlzLl90ZXJtaW5hbCwgc2hlbGxJbnRlZ3JhdGlvbjogdGhpcy52YWx1ZSwgZXhlY3V0aW9uOiB0aGlzLl9jdXJyZW50RXhlY3V0aW9uLnZhbHVlLCBleGl0Q29kZTogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgbWF0Y2hpbmcgcGVuZGluZyBleGVjdXRpb24sIGhvdyBzdHJpY3QgdGhpcyBpcyBkZXBlbmRzIG9uIHRoZSBjb25maWRlbmNlIG9mIHRoZVxuXHRcdC8vIGNvbW1hbmQgbGluZVxuXHRcdGxldCBjdXJyZW50RXhlY3V0aW9uOiBJbnRlcm5hbFRlcm1pbmFsU2hlbGxFeGVjdXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbW1hbmRMaW5lLmNvbmZpZGVuY2UgPT09IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2UuSGlnaCkge1xuXHRcdFx0Zm9yIChjb25zdCBbaSwgZXhlY3V0aW9uXSBvZiB0aGlzLl9wZW5kaW5nRXhlY3V0aW9ucy5lbnRyaWVzKCkpIHtcblx0XHRcdFx0aWYgKGV4ZWN1dGlvbi52YWx1ZS5jb21tYW5kTGluZS52YWx1ZSA9PT0gY29tbWFuZExpbmUudmFsdWUpIHtcblx0XHRcdFx0XHRjdXJyZW50RXhlY3V0aW9uID0gZXhlY3V0aW9uO1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRFeGVjdXRpb25Qcm9wZXJ0aWVzID0ge1xuXHRcdFx0XHRcdFx0aXNNdWx0aUxpbmU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dW5yZXNvbHZlZENvbW1hbmRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y3VycmVudEV4ZWN1dGlvbiA9IGV4ZWN1dGlvbjtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRXhlY3V0aW9ucy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3ViRXhlY3V0aW9uUmVzdWx0ID0gaXNTdWJFeGVjdXRpb24oc3BsaXRBbmRTYW5pdGl6ZUNvbW1hbmRMaW5lKGV4ZWN1dGlvbi52YWx1ZS5jb21tYW5kTGluZS52YWx1ZSksIGNvbW1hbmRMaW5lKTtcblx0XHRcdFx0XHRpZiAoc3ViRXhlY3V0aW9uUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jdXJyZW50RXhlY3V0aW9uUHJvcGVydGllcyA9IHtcblx0XHRcdFx0XHRcdFx0aXNNdWx0aUxpbmU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdHVucmVzb2x2ZWRDb21tYW5kTGluZXM6IHN1YkV4ZWN1dGlvblJlc3VsdC51bnJlc29sdmVkQ29tbWFuZExpbmVzLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdGN1cnJlbnRFeGVjdXRpb24gPSBleGVjdXRpb247XG5cdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nRXhlY3V0aW9ucy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VycmVudEV4ZWN1dGlvbiA9IHRoaXMuX3BlbmRpbmdFeGVjdXRpb25zLnNoaWZ0KCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm8gZXhlY3V0aW9uLCBjcmVhdGUgYSBuZXcgb25lXG5cdFx0aWYgKCFjdXJyZW50RXhlY3V0aW9uKSB7XG5cdFx0XHQvLyBGYWxsYmFjayB0byB0aGUgc2hlbGwgaW50ZWdyYXRpb24ncyBjd2QgYXMgdGhlIGN3ZCBtYXkgbm90IGhhdmUgYmVlbiByZXN0b3JlZCBhZnRlciBhIHJlbG9hZFxuXHRcdFx0Y3VycmVudEV4ZWN1dGlvbiA9IG5ldyBJbnRlcm5hbFRlcm1pbmFsU2hlbGxFeGVjdXRpb24oY29tbWFuZExpbmUsIGN3ZCA/PyB0aGlzLl9jd2QpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRFeGVjdXRpb24gPSBjdXJyZW50RXhlY3V0aW9uO1xuXHRcdHRoaXMuX29uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uLmZpcmUoeyB0ZXJtaW5hbDogdGhpcy5fdGVybWluYWwsIHNoZWxsSW50ZWdyYXRpb246IHRoaXMudmFsdWUsIGV4ZWN1dGlvbjogdGhpcy5fY3VycmVudEV4ZWN1dGlvbi52YWx1ZSB9KTtcblx0fVxuXG5cdGVtaXREYXRhKGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY3VycmVudEV4ZWN1dGlvbj8uZW1pdERhdGEoZGF0YSk7XG5cdH1cblxuXHRlbmRTaGVsbEV4ZWN1dGlvbihjb21tYW5kTGluZTogdnNjb2RlLlRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZSB8IHVuZGVmaW5lZCwgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdC8vIElmIHRoZSBjdXJyZW50IGV4ZWN1dGlvbiBpcyBtdWx0aS1saW5lLCBkb24ndCBlbmQgaXQgdW50aWwgdGhlIG5leHQgY29tbWFuZCBsaW5lIGlzXG5cdFx0Ly8gY29uZmlybWVkIHRvIG5vdCBiZSBhIHBhcnQgb2YgaXQuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRFeGVjdXRpb25Qcm9wZXJ0aWVzPy5pc011bHRpTGluZSkge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRFeGVjdXRpb25Qcm9wZXJ0aWVzLnVucmVzb2x2ZWRDb21tYW5kTGluZXMgJiYgdGhpcy5fY3VycmVudEV4ZWN1dGlvblByb3BlcnRpZXMudW5yZXNvbHZlZENvbW1hbmRMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY3VycmVudEV4ZWN1dGlvbikge1xuXHRcdFx0Y29uc3QgY29tbWFuZExpbmVGb3JFdmVudCA9IHRoaXMuX2N1cnJlbnRFeGVjdXRpb25Qcm9wZXJ0aWVzPy5pc011bHRpTGluZSA/IHRoaXMuX2N1cnJlbnRFeGVjdXRpb24udmFsdWUuY29tbWFuZExpbmUgOiBjb21tYW5kTGluZTtcblx0XHRcdHRoaXMuX2N1cnJlbnRFeGVjdXRpb24uZW5kRXhlY3V0aW9uKGNvbW1hbmRMaW5lRm9yRXZlbnQpO1xuXHRcdFx0Y29uc3QgY3VycmVudEV4ZWN1dGlvbiA9IHRoaXMuX2N1cnJlbnRFeGVjdXRpb247XG5cdFx0XHR0aGlzLl9wZW5kaW5nRW5kaW5nRXhlY3V0aW9uID0gY3VycmVudEV4ZWN1dGlvbjtcblx0XHRcdHRoaXMuX2N1cnJlbnRFeGVjdXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBJTVBPUlRBTlQ6IEVuc3VyZSB0aGUgY3VycmVudCBleGVjdXRpb24ncyBkYXRhIGV2ZW50cyBhcmUgZmx1c2hlZCBpbiBvcmRlciB0b1xuXHRcdFx0Ly8gcHJldmVudCBkYXRhIGV2ZW50cyBmaXJpbmcgYWZ0ZXIgdGhlIGVuZCBldmVudCBmaXJlcy5cblx0XHRcdGN1cnJlbnRFeGVjdXRpb24uZmx1c2goKS50aGVuKCgpID0+IHtcblx0XHRcdFx0Ly8gT25seSBmaXJlIGlmIGl0J3Mgc3RpbGwgdGhlIHNhbWUgZXhlY3V0aW9uLCBpZiBpdCdzIGNoYW5nZWQgaXQgd291bGQgaGF2ZSBhbHJlYWR5XG5cdFx0XHRcdC8vIGJlZW4gZmlyZWQuXG5cdFx0XHRcdGlmICh0aGlzLl9wZW5kaW5nRW5kaW5nRXhlY3V0aW9uID09PSBjdXJyZW50RXhlY3V0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0RW5kRXhlY3V0aW9uLmZpcmUoeyB0ZXJtaW5hbDogdGhpcy5fdGVybWluYWwsIHNoZWxsSW50ZWdyYXRpb246IHRoaXMudmFsdWUsIGV4ZWN1dGlvbjogY3VycmVudEV4ZWN1dGlvbi52YWx1ZSwgZXhpdENvZGUgfSk7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0VuZGluZ0V4ZWN1dGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0RW52KGtleXM6IHN0cmluZ1tdLCB2YWx1ZXM6IHN0cmluZ1tdLCBpc1RydXN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0gPSB7fTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGVudltrZXlzW2ldXSA9IHZhbHVlc1tpXTtcblx0XHR9XG5cdFx0dGhpcy5fZW52ID0geyB2YWx1ZTogZW52LCBpc1RydXN0ZWQgfTtcblx0XHR0aGlzLl9maXJlQ2hhbmdlRXZlbnQoKTtcblx0fVxuXG5cdHNldEN3ZChjd2Q6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGxldCB3YXNDaGFuZ2VkID0gZmFsc2U7XG5cdFx0aWYgKFVSSS5pc1VyaSh0aGlzLl9jd2QpKSB7XG5cdFx0XHR3YXNDaGFuZ2VkID0gIVVSSS5pc1VyaShjd2QpIHx8IHRoaXMuX2N3ZC50b1N0cmluZygpICE9PSBjd2QudG9TdHJpbmcoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N3ZCAhPT0gY3dkKSB7XG5cdFx0XHR3YXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHdhc0NoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2N3ZCA9IGN3ZDtcblx0XHRcdHRoaXMuX2ZpcmVDaGFuZ2VFdmVudCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpcmVDaGFuZ2VFdmVudCgpIHtcblx0XHR0aGlzLl9vbkRpZFJlcXVlc3RDaGFuZ2VTaGVsbEludGVncmF0aW9uLmZpcmUoeyB0ZXJtaW5hbDogdGhpcy5fdGVybWluYWwsIHNoZWxsSW50ZWdyYXRpb246IHRoaXMudmFsdWUgfSk7XG5cdH1cbn1cblxuY2xhc3MgSW50ZXJuYWxUZXJtaW5hbFNoZWxsRXhlY3V0aW9uIHtcblx0cmVhZG9ubHkgdmFsdWU6IHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uO1xuXG5cdHByaXZhdGUgX2RhdGFTdHJlYW06IFNoZWxsRXhlY3V0aW9uRGF0YVN0cmVhbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNFbmRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2NvbW1hbmRMaW5lOiB2c2NvZGUuVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lLFxuXHRcdHJlYWRvbmx5IGN3ZDogVVJJIHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLnZhbHVlID0ge1xuXHRcdFx0Z2V0IGNvbW1hbmRMaW5lKCk6IHZzY29kZS5UZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmUge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fY29tbWFuZExpbmU7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGN3ZCgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5jd2Q7XG5cdFx0XHR9LFxuXHRcdFx0cmVhZCgpOiBBc3luY0l0ZXJhYmxlPHN0cmluZz4ge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fY3JlYXRlRGF0YVN0cmVhbSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVEYXRhU3RyZWFtKCk6IEFzeW5jSXRlcmFibGU8c3RyaW5nPiB7XG5cdFx0aWYgKCF0aGlzLl9kYXRhU3RyZWFtKSB7XG5cdFx0XHRpZiAodGhpcy5faXNFbmRlZCkge1xuXHRcdFx0XHRyZXR1cm4gQXN5bmNJdGVyYWJsZU9iamVjdC5FTVBUWTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RhdGFTdHJlYW0gPSBuZXcgU2hlbGxFeGVjdXRpb25EYXRhU3RyZWFtKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9kYXRhU3RyZWFtLmNyZWF0ZUl0ZXJhYmxlKCk7XG5cdH1cblxuXHRlbWl0RGF0YShkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRW5kZWQpIHtcblx0XHRcdHRoaXMuX2RhdGFTdHJlYW0/LmVtaXREYXRhKGRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdGVuZEV4ZWN1dGlvbihjb21tYW5kTGluZTogdnNjb2RlLlRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChjb21tYW5kTGluZSkge1xuXHRcdFx0dGhpcy5fY29tbWFuZExpbmUgPSBjb21tYW5kTGluZTtcblx0XHR9XG5cdFx0dGhpcy5fZGF0YVN0cmVhbT8uZW5kRXhlY3V0aW9uKCk7XG5cdFx0dGhpcy5faXNFbmRlZCA9IHRydWU7XG5cdH1cblxuXHRhc3luYyBmbHVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fZGF0YVN0cmVhbSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGF0YVN0cmVhbS5mbHVzaCgpO1xuXHRcdFx0dGhpcy5fZGF0YVN0cmVhbS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9kYXRhU3RyZWFtID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTaGVsbEV4ZWN1dGlvbkRhdGFTdHJlYW0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfYmFycmllcjogQmFycmllciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXRlcmFibGVzOiBBc3luY0l0ZXJhYmxlT2JqZWN0PHN0cmluZz5bXSA9IFtdO1xuXHRwcml2YXRlIF9lbWl0dGVyczogQXN5bmNJdGVyYWJsZUVtaXR0ZXI8c3RyaW5nPltdID0gW107XG5cblx0Y3JlYXRlSXRlcmFibGUoKTogQXN5bmNJdGVyYWJsZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuX2JhcnJpZXIpIHtcblx0XHRcdHRoaXMuX2JhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdH1cblx0XHRjb25zdCBiYXJyaWVyID0gdGhpcy5fYmFycmllcjtcblx0XHRjb25zdCBpdGVyYWJsZSA9IG5ldyBBc3luY0l0ZXJhYmxlT2JqZWN0PHN0cmluZz4oYXN5bmMgZW1pdHRlciA9PiB7XG5cdFx0XHR0aGlzLl9lbWl0dGVycy5wdXNoKGVtaXR0ZXIpO1xuXHRcdFx0YXdhaXQgYmFycmllci53YWl0KCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5faXRlcmFibGVzLnB1c2goaXRlcmFibGUpO1xuXHRcdHJldHVybiBpdGVyYWJsZTtcblx0fVxuXG5cdGVtaXREYXRhKGRhdGE6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZW1pdHRlciBvZiB0aGlzLl9lbWl0dGVycykge1xuXHRcdFx0ZW1pdHRlci5lbWl0T25lKGRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdGVuZEV4ZWN1dGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl9iYXJyaWVyPy5vcGVuKCk7XG5cdH1cblxuXHRhc3luYyBmbHVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLl9pdGVyYWJsZXMubWFwKGUgPT4gZS50b1Byb21pc2UoKSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHNwbGl0QW5kU2FuaXRpemVDb21tYW5kTGluZShjb21tYW5kTGluZTogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRyZXR1cm4gY29tbWFuZExpbmVcblx0XHQuc3BsaXQoJ1xcbicpXG5cdFx0Lm1hcChsaW5lID0+IGxpbmUudHJpbSgpKVxuXHRcdC5maWx0ZXIobGluZSA9PiBsaW5lLmxlbmd0aCA+IDApO1xufVxuXG4vKipcbiAqIFdoZW4gZXhlY3V0aW5nIHNvbWV0aGluZyB0aGF0IHRoZSBzaGVsbCBjb25zaWRlcnMgbXVsdGlwbGUgY29tbWFuZHMsIHN1Y2ggYXNcbiAqIGEgY29tbWVudCBmb2xsb3dlZCBieSBhIGNvbW1hbmQsIHRoaXMgbmVlZHMgdG8gYWxsIGJlIHRyYWNrZWQgdW5kZXIgYSBzaW5nbGVcbiAqIGV4ZWN1dGlvbi5cbiAqL1xuZnVuY3Rpb24gaXNTdWJFeGVjdXRpb24odW5yZXNvbHZlZENvbW1hbmRMaW5lczogc3RyaW5nW10sIGNvbW1hbmRMaW5lOiB2c2NvZGUuVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lKTogeyB1bnJlc29sdmVkQ29tbWFuZExpbmVzOiBzdHJpbmdbXSB9IHwgZmFsc2Uge1xuXHRpZiAodW5yZXNvbHZlZENvbW1hbmRMaW5lcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgbmV3VW5yZXNvbHZlZENvbW1hbmRMaW5lcyA9IFsuLi51bnJlc29sdmVkQ29tbWFuZExpbmVzXTtcblx0Y29uc3Qgc3ViRXhlY3V0aW9uTGluZXMgPSBzcGxpdEFuZFNhbml0aXplQ29tbWFuZExpbmUoY29tbWFuZExpbmUudmFsdWUpO1xuXHRpZiAobmV3VW5yZXNvbHZlZENvbW1hbmRMaW5lcyAmJiBuZXdVbnJlc29sdmVkQ29tbWFuZExpbmVzLmxlbmd0aCA+IDApIHtcblx0XHQvLyBJZiBhbGwgc3ViLWV4ZWN1dGlvbiBsaW5lcyBhcmUgaW4gdGhlIGNvbW1hbmQgbGluZSwgdGhpcyBpcyBwYXJ0IG9mIHRoZVxuXHRcdC8vIG11bHRpLWxpbmUgZXhlY3V0aW9uLlxuXHRcdHdoaWxlIChuZXdVbnJlc29sdmVkQ29tbWFuZExpbmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChuZXdVbnJlc29sdmVkQ29tbWFuZExpbmVzWzBdICE9PSBzdWJFeGVjdXRpb25MaW5lc1swXSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdG5ld1VucmVzb2x2ZWRDb21tYW5kTGluZXMuc2hpZnQoKTtcblx0XHRcdHN1YkV4ZWN1dGlvbkxpbmVzLnNoaWZ0KCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN1YkV4ZWN1dGlvbkxpbmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgdW5yZXNvbHZlZENvbW1hbmRMaW5lczogbmV3VW5yZXNvbHZlZENvbW1hbmRMaW5lcyB9O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsbURBQW1EO0FBQzVELFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQTRHO0FBQ3JILFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZUFBMkI7QUFDcEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQXFCLGVBQTBDO0FBU2pFLE1BQU0sbUNBQW1DLGdCQUFrRCxrQ0FBa0M7QUFFN0gsSUFBTSxrQ0FBTixjQUE4QyxXQUF1RDtBQUFBLEVBZTNHLFlBQ3FCLFlBQ3NCLHlCQUN6QztBQUNELFVBQU07QUFGb0M7QUFYM0MsU0FBUSwyQkFBd0Ysb0JBQUksSUFBSTtBQUV4RyxTQUFtQix1Q0FBdUMsS0FBSyxVQUFVLElBQUksUUFBb0QsQ0FBQztBQUNsSSxTQUFTLHNDQUFzQyxLQUFLLHFDQUFxQztBQUN6RixTQUFtQixvQ0FBb0MsS0FBSyxVQUFVLElBQUksUUFBaUQsQ0FBQztBQUM1SCxTQUFTLG1DQUFtQyxLQUFLLGtDQUFrQztBQUNuRixTQUFtQixrQ0FBa0MsS0FBSyxVQUFVLElBQUksUUFBK0MsQ0FBQztBQUN4SCxTQUFTLGlDQUFpQyxLQUFLLGdDQUFnQztBQVE5RSxTQUFLLFNBQVMsV0FBVyxTQUFTLFlBQVksa0NBQWtDO0FBR2hGLFNBQUssVUFBVSxh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
