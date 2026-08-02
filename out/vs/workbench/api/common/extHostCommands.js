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
import { validateConstraint } from "../../../base/common/types.js";
import * as extHostTypes from "./extHostTypes.js";
import * as extHostTypeConverter from "./extHostTypeConverters.js";
import { cloneAndChange } from "../../../base/common/objects.js";
import { MainContext } from "./extHost.protocol.js";
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { revive } from "../../../base/common/marshalling.js";
import { Range } from "../../../editor/common/core/range.js";
import { Position } from "../../../editor/common/core/position.js";
import { URI } from "../../../base/common/uri.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { TestItemImpl } from "./extHostTestItem.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { TelemetryTrustedValue } from "../../../platform/telemetry/common/telemetryUtils.js";
import { IExtHostTelemetry } from "./extHostTelemetry.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { isCancellationError } from "../../../base/common/errors.js";
let ExtHostCommands = class {
  constructor(extHostRpc, logService, extHostTelemetry) {
    this._commands = /* @__PURE__ */ new Map();
    this._apiCommands = /* @__PURE__ */ new Map();
    this.#proxy = extHostRpc.getProxy(MainContext.MainThreadCommands);
    this._logService = logService;
    this.#extHostTelemetry = extHostTelemetry;
    this.#telemetry = extHostRpc.getProxy(MainContext.MainThreadTelemetry);
    this.converter = new CommandsConverter(
      this,
      (id) => {
        const candidate = this._apiCommands.get(id);
        return candidate?.result === ApiCommandResult.Void ? candidate : void 0;
      },
      logService
    );
    this._argumentProcessors = [
      {
        processArgument(a) {
          return revive(a);
        }
      },
      {
        processArgument(arg) {
          return cloneAndChange(arg, function(obj) {
            if (Range.isIRange(obj)) {
              return extHostTypeConverter.Range.to(obj);
            }
            if (Position.isIPosition(obj)) {
              return extHostTypeConverter.Position.to(obj);
            }
            if (Range.isIRange(obj.range) && URI.isUri(obj.uri)) {
              return extHostTypeConverter.location.to(obj);
            }
            if (obj instanceof VSBuffer) {
              return obj.buffer.buffer;
            }
            if (!Array.isArray(obj)) {
              return obj;
            }
          });
        }
      }
    ];
  }
  #proxy;
  #telemetry;
  #extHostTelemetry;
  registerArgumentProcessor(processor) {
    this._argumentProcessors.push(processor);
  }
  registerApiCommand(apiCommand) {
    const registration = this.registerCommand(false, apiCommand.id, async (...apiArgs) => {
      const internalArgs = apiCommand.args.map((arg, i) => {
        if (!arg.validate(apiArgs[i])) {
          throw new Error(`Invalid argument '${arg.name}' when running '${apiCommand.id}', received: ${typeof apiArgs[i] === "object" ? JSON.stringify(apiArgs[i], null, "	") : apiArgs[i]} `);
        }
        return arg.convert(apiArgs[i]);
      });
      const internalResult = await this.executeCommand(apiCommand.internalId, ...internalArgs);
      return apiCommand.result.convert(internalResult, apiArgs, this.converter);
    }, void 0, {
      description: apiCommand.description,
      args: apiCommand.args,
      returns: apiCommand.result.description
    });
    this._apiCommands.set(apiCommand.id, apiCommand);
    return new extHostTypes.Disposable(() => {
      registration.dispose();
      this._apiCommands.delete(apiCommand.id);
    });
  }
  registerCommand(global, id, callback, thisArg, metadata, extension) {
    this._logService.trace("ExtHostCommands#registerCommand", id);
    if (!id.trim().length) {
      throw new Error("invalid id");
    }
    if (this._commands.has(id)) {
      throw new Error(`command '${id}' already exists`);
    }
    this._commands.set(id, { callback, thisArg, metadata, extension });
    if (global) {
      this.#proxy.$registerCommand(id);
    }
    return new extHostTypes.Disposable(() => {
      if (this._commands.delete(id)) {
        if (global) {
          this.#proxy.$unregisterCommand(id);
        }
      }
    });
  }
  executeCommand(id, ...args) {
    this._logService.trace("ExtHostCommands#executeCommand", id);
    return this._doExecuteCommand(id, args, true);
  }
  async _doExecuteCommand(id, args, retry) {
    if (this._commands.has(id)) {
      this.#proxy.$fireCommandActivationEvent(id);
      return this._executeContributedCommand(id, args, false);
    } else {
      let hasBuffers = false;
      const toArgs = cloneAndChange(args, function(value) {
        if (value instanceof extHostTypes.Position) {
          return extHostTypeConverter.Position.from(value);
        } else if (value instanceof extHostTypes.Range) {
          return extHostTypeConverter.Range.from(value);
        } else if (value instanceof extHostTypes.Location) {
          return extHostTypeConverter.location.from(value);
        } else if (extHostTypes.NotebookRange.isNotebookRange(value)) {
          return extHostTypeConverter.NotebookRange.from(value);
        } else if (value instanceof ArrayBuffer) {
          hasBuffers = true;
          return VSBuffer.wrap(new Uint8Array(value));
        } else if (value instanceof Uint8Array) {
          hasBuffers = true;
          return VSBuffer.wrap(value);
        } else if (value instanceof VSBuffer) {
          hasBuffers = true;
          return value;
        }
        if (!Array.isArray(value)) {
          return value;
        }
      });
      try {
        const result = await this.#proxy.$executeCommand(id, hasBuffers ? new SerializableObjectWithBuffers(toArgs) : toArgs, retry);
        return revive(result);
      } catch (e) {
        if (e instanceof Error && e.message === "$executeCommand:retry") {
          return this._doExecuteCommand(id, args, false);
        } else {
          throw e;
        }
      }
    }
  }
  async _executeContributedCommand(id, args, annotateError) {
    const command = this._commands.get(id);
    if (!command) {
      throw new Error("Unknown command");
    }
    const { callback, thisArg, metadata } = command;
    if (metadata?.args) {
      for (let i = 0; i < metadata.args.length; i++) {
        try {
          validateConstraint(args[i], metadata.args[i].constraint);
        } catch (err) {
          throw new Error(`Running the contributed command: '${id}' failed. Illegal argument '${metadata.args[i].name}' - ${metadata.args[i].description}`);
        }
      }
    }
    const stopWatch = StopWatch.create();
    try {
      return await callback.apply(thisArg, args);
    } catch (err) {
      if (id === this.converter.delegatingCommandId) {
        const actual = this.converter.getActualCommand(...args);
        if (actual) {
          id = actual.command;
        }
      }
      if (!isCancellationError(err)) {
        this._logService.error(err, id, command.extension?.identifier);
      }
      if (!annotateError) {
        throw err;
      }
      if (command.extension?.identifier) {
        const reported = this.#extHostTelemetry.onExtensionError(command.extension.identifier, err);
        this._logService.trace("forwarded error to extension?", reported, command.extension?.identifier);
      }
      throw new class CommandError extends Error {
        constructor() {
          super(toErrorMessage(err));
          this.id = id;
          this.source = command.extension?.displayName ?? command.extension?.name;
        }
      }();
    } finally {
      this._reportTelemetry(command, id, stopWatch.elapsed());
    }
  }
  _reportTelemetry(command, id, duration) {
    if (!command.extension) {
      return;
    }
    if (id.startsWith("code.copilot.logStructured")) {
      return;
    }
    this.#telemetry.$publicLog2("Extension:ActionExecuted", {
      extensionId: command.extension.identifier.value,
      id: new TelemetryTrustedValue(id),
      duration
    });
  }
  $executeContributedCommand(id, ...args) {
    this._logService.trace("ExtHostCommands#$executeContributedCommand", id);
    const cmdHandler = this._commands.get(id);
    if (!cmdHandler) {
      return Promise.reject(new Error(`Contributed command '${id}' does not exist.`));
    } else {
      args = args.map((arg) => this._argumentProcessors.reduce((r, p) => p.processArgument(r, cmdHandler.extension), arg));
      return this._executeContributedCommand(id, args, true);
    }
  }
  getCommands(filterUnderscoreCommands = false) {
    this._logService.trace("ExtHostCommands#getCommands", filterUnderscoreCommands);
    return this.#proxy.$getCommands().then((result) => {
      if (filterUnderscoreCommands) {
        result = result.filter((command) => command[0] !== "_");
      }
      return result;
    });
  }
  $getContributedCommandMetadata() {
    const result = /* @__PURE__ */ Object.create(null);
    for (const [id, command] of this._commands) {
      const { metadata } = command;
      if (metadata) {
        result[id] = metadata;
      }
    }
    return Promise.resolve(result);
  }
};
ExtHostCommands = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostTelemetry)
], ExtHostCommands);
const IExtHostCommands = createDecorator("IExtHostCommands");
class CommandsConverter {
  // --- conversion between internal and api commands
  constructor(_commands, _lookupApiCommand, _logService) {
    this._commands = _commands;
    this._lookupApiCommand = _lookupApiCommand;
    this._logService = _logService;
    this.delegatingCommandId = `__vsc${generateUuid()}`;
    this._cache = /* @__PURE__ */ new Map();
    this._cachIdPool = 0;
    this._commands.registerCommand(true, this.delegatingCommandId, this._executeConvertedCommand, this);
  }
  toInternal(command, disposables) {
    if (!command) {
      return void 0;
    }
    const result = {
      $ident: void 0,
      id: command.command,
      title: command.title,
      tooltip: command.tooltip
    };
    if (!command.command) {
      return result;
    }
    const apiCommand = this._lookupApiCommand(command.command);
    if (apiCommand) {
      result.id = apiCommand.internalId;
      result.arguments = apiCommand.args.map((arg, i) => arg.convert(command.arguments && command.arguments[i]));
    } else if (isNonEmptyArray(command.arguments)) {
      const id = `${command.command} /${++this._cachIdPool}`;
      this._cache.set(id, command);
      disposables.add(toDisposable(() => {
        this._cache.delete(id);
        this._logService.trace("CommandsConverter#DISPOSE", id);
      }));
      result.$ident = id;
      result.id = this.delegatingCommandId;
      result.arguments = [id];
      this._logService.trace("CommandsConverter#CREATE", command.command, id);
    }
    return result;
  }
  fromInternal(command) {
    if (typeof command.$ident === "string") {
      return this._cache.get(command.$ident);
    } else {
      return {
        command: command.id,
        title: command.title,
        arguments: command.arguments
      };
    }
  }
  getActualCommand(...args) {
    return this._cache.get(args[0]);
  }
  _executeConvertedCommand(...args) {
    const actualCmd = this.getActualCommand(...args);
    this._logService.trace("CommandsConverter#EXECUTE", args[0], actualCmd ? actualCmd.command : "MISSING");
    if (!actualCmd) {
      return Promise.reject(`Actual command not found, wanted to execute ${args[0]}`);
    }
    return this._commands.executeCommand(actualCmd.command, ...actualCmd.arguments || []);
  }
}
const _ApiCommandArgument = class _ApiCommandArgument {
  constructor(name, description, validate, convert) {
    this.name = name;
    this.description = description;
    this.validate = validate;
    this.convert = convert;
  }
  static Arr(element) {
    return new _ApiCommandArgument(
      `${element.name}_array`,
      `Array of ${element.name}, ${element.description}`,
      (v) => Array.isArray(v) && v.every((e) => element.validate(e)),
      (v) => v.map((e) => element.convert(e))
    );
  }
  optional() {
    return new _ApiCommandArgument(
      this.name,
      `(optional) ${this.description}`,
      (value) => value === void 0 || value === null || this.validate(value),
      (value) => value === void 0 ? void 0 : value === null ? null : this.convert(value)
    );
  }
  with(name, description) {
    return new _ApiCommandArgument(name ?? this.name, description ?? this.description, this.validate, this.convert);
  }
};
_ApiCommandArgument.Uri = new _ApiCommandArgument("uri", "Uri of a text document", (v) => URI.isUri(v), (v) => v);
_ApiCommandArgument.Position = new _ApiCommandArgument("position", "A position in a text document", (v) => extHostTypes.Position.isPosition(v), extHostTypeConverter.Position.from);
_ApiCommandArgument.Range = new _ApiCommandArgument("range", "A range in a text document", (v) => extHostTypes.Range.isRange(v), extHostTypeConverter.Range.from);
_ApiCommandArgument.Selection = new _ApiCommandArgument("selection", "A selection in a text document", (v) => extHostTypes.Selection.isSelection(v), extHostTypeConverter.Selection.from);
_ApiCommandArgument.Number = new _ApiCommandArgument("number", "", (v) => typeof v === "number", (v) => v);
_ApiCommandArgument.String = new _ApiCommandArgument("string", "", (v) => typeof v === "string", (v) => v);
_ApiCommandArgument.CallHierarchyItem = new _ApiCommandArgument("item", "A call hierarchy item", (v) => v instanceof extHostTypes.CallHierarchyItem, extHostTypeConverter.CallHierarchyItem.from);
_ApiCommandArgument.TypeHierarchyItem = new _ApiCommandArgument("item", "A type hierarchy item", (v) => v instanceof extHostTypes.TypeHierarchyItem, extHostTypeConverter.TypeHierarchyItem.from);
_ApiCommandArgument.TestItem = new _ApiCommandArgument("testItem", "A VS Code TestItem", (v) => v instanceof TestItemImpl, extHostTypeConverter.TestItem.from);
_ApiCommandArgument.TestProfile = new _ApiCommandArgument("testProfile", "A VS Code test profile", (v) => v instanceof extHostTypes.TestRunProfileBase, extHostTypeConverter.TestRunProfile.from);
let ApiCommandArgument = _ApiCommandArgument;
const _ApiCommandResult = class _ApiCommandResult {
  constructor(description, convert) {
    this.description = description;
    this.convert = convert;
  }
};
_ApiCommandResult.Void = new _ApiCommandResult("no result", (v) => v);
let ApiCommandResult = _ApiCommandResult;
class ApiCommand {
  constructor(id, internalId, description, args, result) {
    this.id = id;
    this.internalId = internalId;
    this.description = description;
    this.args = args;
    this.result = result;
  }
}
export {
  ApiCommand,
  ApiCommandArgument,
  ApiCommandResult,
  CommandsConverter,
  ExtHostCommands,
  IExtHostCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHZhbGlkYXRlQ29uc3RyYWludCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElDb21tYW5kTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlQ29udmVydGVyIGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IGNsb25lQW5kQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBNYWluQ29udGV4dCwgTWFpblRocmVhZENvbW1hbmRzU2hhcGUsIEV4dEhvc3RDb21tYW5kc1NoYXBlLCBJQ29tbWFuZER0bywgSUNvbW1hbmRNZXRhZGF0YUR0bywgTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgcmV2aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEl0ZW1JbXBsIH0gZnJvbSAnLi9leHRIb3N0VGVzdEl0ZW0uanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFRlbGVtZXRyeSB9IGZyb20gJy4vZXh0SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5pbnRlcmZhY2UgQ29tbWFuZEhhbmRsZXIge1xuXHRjYWxsYmFjazogRnVuY3Rpb247XG5cdHRoaXNBcmc6IGFueTtcblx0bWV0YWRhdGE/OiBJQ29tbWFuZE1ldGFkYXRhO1xuXHRleHRlbnNpb24/OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQXJndW1lbnRQcm9jZXNzb3Ige1xuXHRwcm9jZXNzQXJndW1lbnQoYXJnOiBhbnksIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkKTogYW55O1xufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdENvbW1hbmRzIGltcGxlbWVudHMgRXh0SG9zdENvbW1hbmRzU2hhcGUge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQjcHJveHk6IE1haW5UaHJlYWRDb21tYW5kc1NoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzID0gbmV3IE1hcDxzdHJpbmcsIENvbW1hbmRIYW5kbGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcGlDb21tYW5kcyA9IG5ldyBNYXA8c3RyaW5nLCBBcGlDb21tYW5kPigpO1xuXHQjdGVsZW1ldHJ5OiBNYWluVGhyZWFkVGVsZW1ldHJ5U2hhcGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdHJlYWRvbmx5ICNleHRIb3N0VGVsZW1ldHJ5OiBJRXh0SG9zdFRlbGVtZXRyeTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXJndW1lbnRQcm9jZXNzb3JzOiBBcmd1bWVudFByb2Nlc3NvcltdO1xuXG5cdHJlYWRvbmx5IGNvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFRlbGVtZXRyeSBleHRIb3N0VGVsZW1ldHJ5OiBJRXh0SG9zdFRlbGVtZXRyeVxuXHQpIHtcblx0XHR0aGlzLiNwcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZENvbW1hbmRzKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0XHR0aGlzLiNleHRIb3N0VGVsZW1ldHJ5ID0gZXh0SG9zdFRlbGVtZXRyeTtcblx0XHR0aGlzLiN0ZWxlbWV0cnkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRUZWxlbWV0cnkpO1xuXHRcdHRoaXMuY29udmVydGVyID0gbmV3IENvbW1hbmRzQ29udmVydGVyKFxuXHRcdFx0dGhpcyxcblx0XHRcdGlkID0+IHtcblx0XHRcdFx0Ly8gQVBJIGNvbW1hbmRzIHRoYXQgaGF2ZSBubyByZXR1cm4gdHlwZSAodm9pZCkgY2FuIGJlXG5cdFx0XHRcdC8vIGNvbnZlcnRlZCB0byB0aGVpciBpbnRlcm5hbCBjb21tYW5kIGFuZCBkb24ndCBuZWVkXG5cdFx0XHRcdC8vIGFueSBpbmRpcmVjdGlvbiBjb21tYW5kc1xuXHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLl9hcGlDb21tYW5kcy5nZXQoaWQpO1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlPy5yZXN1bHQgPT09IEFwaUNvbW1hbmRSZXN1bHQuVm9pZFxuXHRcdFx0XHRcdD8gY2FuZGlkYXRlIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGxvZ1NlcnZpY2Vcblx0XHQpO1xuXHRcdHRoaXMuX2FyZ3VtZW50UHJvY2Vzc29ycyA9IFtcblx0XHRcdHtcblx0XHRcdFx0cHJvY2Vzc0FyZ3VtZW50KGEpIHtcblx0XHRcdFx0XHQvLyBVUkksIFJlZ2V4XG5cdFx0XHRcdFx0cmV0dXJuIHJldml2ZShhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cHJvY2Vzc0FyZ3VtZW50KGFyZykge1xuXHRcdFx0XHRcdHJldHVybiBjbG9uZUFuZENoYW5nZShhcmcsIGZ1bmN0aW9uIChvYmopIHtcblx0XHRcdFx0XHRcdC8vIFJldmVyc2Ugb2YgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYmxvYi8xZjI4YzVmYzY4MWY0YzAxMjI2NDYwYjZkMWM3ZTkxYjhhY2I0YTViL3NyYy92cy93b3JrYmVuY2gvYXBpL25vZGUvZXh0SG9zdENvbW1hbmRzLnRzI0wxMTItTDEyN1xuXHRcdFx0XHRcdFx0aWYgKFJhbmdlLmlzSVJhbmdlKG9iaikpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUeXBlQ29udmVydGVyLlJhbmdlLnRvKG9iaik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoUG9zaXRpb24uaXNJUG9zaXRpb24ob2JqKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUG9zaXRpb24udG8ob2JqKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChSYW5nZS5pc0lSYW5nZSgob2JqIGFzIGxhbmd1YWdlcy5Mb2NhdGlvbikucmFuZ2UpICYmIFVSSS5pc1VyaSgob2JqIGFzIGxhbmd1YWdlcy5Mb2NhdGlvbikudXJpKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIubG9jYXRpb24udG8ob2JqKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChvYmogaW5zdGFuY2VvZiBWU0J1ZmZlcikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gb2JqLmJ1ZmZlci5idWZmZXI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkob2JqKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gb2JqO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XTtcblx0fVxuXG5cdHJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3IocHJvY2Vzc29yOiBBcmd1bWVudFByb2Nlc3Nvcik6IHZvaWQge1xuXHRcdHRoaXMuX2FyZ3VtZW50UHJvY2Vzc29ycy5wdXNoKHByb2Nlc3Nvcik7XG5cdH1cblxuXHRyZWdpc3RlckFwaUNvbW1hbmQoYXBpQ29tbWFuZDogQXBpQ29tbWFuZCk6IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlIHtcblxuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gdGhpcy5yZWdpc3RlckNvbW1hbmQoZmFsc2UsIGFwaUNvbW1hbmQuaWQsIGFzeW5jICguLi5hcGlBcmdzKSA9PiB7XG5cblx0XHRcdGNvbnN0IGludGVybmFsQXJncyA9IGFwaUNvbW1hbmQuYXJncy5tYXAoKGFyZywgaSkgPT4ge1xuXHRcdFx0XHRpZiAoIWFyZy52YWxpZGF0ZShhcGlBcmdzW2ldKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBhcmd1bWVudCAnJHthcmcubmFtZX0nIHdoZW4gcnVubmluZyAnJHthcGlDb21tYW5kLmlkfScsIHJlY2VpdmVkOiAke3R5cGVvZiBhcGlBcmdzW2ldID09PSAnb2JqZWN0JyA/IEpTT04uc3RyaW5naWZ5KGFwaUFyZ3NbaV0sIG51bGwsICdcXHQnKSA6IGFwaUFyZ3NbaV19IGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhcmcuY29udmVydChhcGlBcmdzW2ldKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnRlcm5hbFJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZUNvbW1hbmQoYXBpQ29tbWFuZC5pbnRlcm5hbElkLCAuLi5pbnRlcm5hbEFyZ3MpO1xuXHRcdFx0cmV0dXJuIGFwaUNvbW1hbmQucmVzdWx0LmNvbnZlcnQoaW50ZXJuYWxSZXN1bHQsIGFwaUFyZ3MsIHRoaXMuY29udmVydGVyKTtcblx0XHR9LCB1bmRlZmluZWQsIHtcblx0XHRcdGRlc2NyaXB0aW9uOiBhcGlDb21tYW5kLmRlc2NyaXB0aW9uLFxuXHRcdFx0YXJnczogYXBpQ29tbWFuZC5hcmdzLFxuXHRcdFx0cmV0dXJuczogYXBpQ29tbWFuZC5yZXN1bHQuZGVzY3JpcHRpb25cblx0XHR9KTtcblxuXHRcdHRoaXMuX2FwaUNvbW1hbmRzLnNldChhcGlDb21tYW5kLmlkLCBhcGlDb21tYW5kKTtcblxuXHRcdHJldHVybiBuZXcgZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2FwaUNvbW1hbmRzLmRlbGV0ZShhcGlDb21tYW5kLmlkKTtcblx0XHR9KTtcblx0fVxuXG5cdHJlZ2lzdGVyQ29tbWFuZChnbG9iYWw6IGJvb2xlYW4sIGlkOiBzdHJpbmcsIGNhbGxiYWNrOiA8VD4oLi4uYXJnczogYW55W10pID0+IFQgfCBUaGVuYWJsZTxUPiwgdGhpc0FyZz86IGFueSwgbWV0YWRhdGE/OiBJQ29tbWFuZE1ldGFkYXRhLCBleHRlbnNpb24/OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnRXh0SG9zdENvbW1hbmRzI3JlZ2lzdGVyQ29tbWFuZCcsIGlkKTtcblxuXHRcdGlmICghaWQudHJpbSgpLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGlkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NvbW1hbmRzLmhhcyhpZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgY29tbWFuZCAnJHtpZH0nIGFscmVhZHkgZXhpc3RzYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29tbWFuZHMuc2V0KGlkLCB7IGNhbGxiYWNrLCB0aGlzQXJnLCBtZXRhZGF0YSwgZXh0ZW5zaW9uIH0pO1xuXHRcdGlmIChnbG9iYWwpIHtcblx0XHRcdHRoaXMuI3Byb3h5LiRyZWdpc3RlckNvbW1hbmQoaWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1hbmRzLmRlbGV0ZShpZCkpIHtcblx0XHRcdFx0aWYgKGdsb2JhbCkge1xuXHRcdFx0XHRcdHRoaXMuI3Byb3h5LiR1bnJlZ2lzdGVyQ29tbWFuZChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGV4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RDb21tYW5kcyNleGVjdXRlQ29tbWFuZCcsIGlkKTtcblx0XHRyZXR1cm4gdGhpcy5fZG9FeGVjdXRlQ29tbWFuZChpZCwgYXJncywgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb0V4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSwgcmV0cnk6IGJvb2xlYW4pOiBQcm9taXNlPFQ+IHtcblxuXHRcdGlmICh0aGlzLl9jb21tYW5kcy5oYXMoaWQpKSB7XG5cdFx0XHQvLyAtIFdlIHN0YXkgaW5zaWRlIHRoZSBleHRlbnNpb24gaG9zdCBhbmQgc3VwcG9ydFxuXHRcdFx0Ly8gXHQgdG8gcGFzcyBhbnkga2luZCBvZiBwYXJhbWV0ZXJzIGFyb3VuZC5cblx0XHRcdC8vIC0gV2Ugc3RpbGwgZW1pdCB0aGUgY29ycmVzcG9uZGluZyBhY3RpdmF0aW9uIGV2ZW50XG5cdFx0XHQvLyAgIEJVVCB3ZSBkb24ndCBhd2FpdCB0aGF0IGV2ZW50XG5cdFx0XHR0aGlzLiNwcm94eS4kZmlyZUNvbW1hbmRBY3RpdmF0aW9uRXZlbnQoaWQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVDb250cmlidXRlZENvbW1hbmQ8VD4oaWQsIGFyZ3MsIGZhbHNlKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhdXRvbWFnaWNhbGx5IGNvbnZlcnQgc29tZSBhcmd1bWVudCB0eXBlc1xuXHRcdFx0bGV0IGhhc0J1ZmZlcnMgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRvQXJncyA9IGNsb25lQW5kQ2hhbmdlKGFyZ3MsIGZ1bmN0aW9uICh2YWx1ZSkge1xuXHRcdFx0XHRpZiAodmFsdWUgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuUG9zaXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUG9zaXRpb24uZnJvbSh2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuUmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUmFuZ2UuZnJvbSh2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuTG9jYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIubG9jYXRpb24uZnJvbSh2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXh0SG9zdFR5cGVzLk5vdGVib29rUmFuZ2UuaXNOb3RlYm9va1JhbmdlKHZhbHVlKSkge1xuXHRcdFx0XHRcdHJldHVybiBleHRIb3N0VHlwZUNvbnZlcnRlci5Ob3RlYm9va1JhbmdlLmZyb20odmFsdWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0XHRoYXNCdWZmZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheSh2YWx1ZSkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdFx0XHRcdGhhc0J1ZmZlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFZTQnVmZmVyKSB7XG5cdFx0XHRcdFx0aGFzQnVmZmVycyA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLiNwcm94eS4kZXhlY3V0ZUNvbW1hbmQoaWQsIGhhc0J1ZmZlcnMgPyBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnModG9BcmdzKSA6IHRvQXJncywgcmV0cnkpO1xuXHRcdFx0XHRyZXR1cm4gcmV2aXZlPGFueT4ocmVzdWx0KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gUmVydW4gdGhlIGNvbW1hbmQgd2hlbiBpdCB3YXNuJ3Qga25vd24sIGhhZCBhcmd1bWVudHMsIGFuZCB3aGVuIHJldHJ5XG5cdFx0XHRcdC8vIGlzIGVuYWJsZWQuIFdlIGRvIHRoaXMgYmVjYXVzZSB0aGUgY29tbWFuZCBtaWdodCBiZSByZWdpc3RlcmVkIGluc2lkZVxuXHRcdFx0XHQvLyB0aGUgZXh0ZW5zaW9uIGhvc3Qgbm93IGFuZCBjYW4gdGhlcmVmb3JlIGFjY2VwdCB0aGUgYXJndW1lbnRzIGFzLWlzLlxuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yICYmIGUubWVzc2FnZSA9PT0gJyRleGVjdXRlQ29tbWFuZDpyZXRyeScpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZG9FeGVjdXRlQ29tbWFuZChpZCwgYXJncywgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlQ29udHJpYnV0ZWRDb21tYW5kPFQgPSB1bmtub3duPihpZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10sIGFubm90YXRlRXJyb3I6IGJvb2xlYW4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fY29tbWFuZHMuZ2V0KGlkKTtcblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBjb21tYW5kJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHsgY2FsbGJhY2ssIHRoaXNBcmcsIG1ldGFkYXRhIH0gPSBjb21tYW5kO1xuXHRcdGlmIChtZXRhZGF0YT8uYXJncykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtZXRhZGF0YS5hcmdzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dmFsaWRhdGVDb25zdHJhaW50KGFyZ3NbaV0sIG1ldGFkYXRhLmFyZ3NbaV0uY29uc3RyYWludCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUnVubmluZyB0aGUgY29udHJpYnV0ZWQgY29tbWFuZDogJyR7aWR9JyBmYWlsZWQuIElsbGVnYWwgYXJndW1lbnQgJyR7bWV0YWRhdGEuYXJnc1tpXS5uYW1lfScgLSAke21ldGFkYXRhLmFyZ3NbaV0uZGVzY3JpcHRpb259YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBjYWxsYmFjay5hcHBseSh0aGlzQXJnLCBhcmdzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoZSBpbmRpcmVjdGlvbi1jb21tYW5kIGZyb20gdGhlIGNvbnZlcnRlciBjYW4gZmFpbCB3aGVuIGludm9raW5nIHRoZSBhY3R1YWxcblx0XHRcdC8vIGNvbW1hbmQgYW5kIGluIHRoYXQgY2FzZSBpdCBpcyBiZXR0ZXIgdG8gYmxhbWUgdGhlIGNvcnJlY3QgY29tbWFuZFxuXHRcdFx0aWYgKGlkID09PSB0aGlzLmNvbnZlcnRlci5kZWxlZ2F0aW5nQ29tbWFuZElkKSB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbCA9IHRoaXMuY29udmVydGVyLmdldEFjdHVhbENvbW1hbmQoLi4uYXJncyk7XG5cdFx0XHRcdGlmIChhY3R1YWwpIHtcblx0XHRcdFx0XHRpZCA9IGFjdHVhbC5jb21tYW5kO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgaWQsIGNvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhbm5vdGF0ZUVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdGNvbnN0IHJlcG9ydGVkID0gdGhpcy4jZXh0SG9zdFRlbGVtZXRyeS5vbkV4dGVuc2lvbkVycm9yKGNvbW1hbmQuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGVycik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ2ZvcndhcmRlZCBlcnJvciB0byBleHRlbnNpb24/JywgcmVwb3J0ZWQsIGNvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyKTtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgbmV3IGNsYXNzIENvbW1hbmRFcnJvciBleHRlbmRzIEVycm9yIHtcblx0XHRcdFx0cmVhZG9ubHkgaWQgPSBpZDtcblx0XHRcdFx0cmVhZG9ubHkgc291cmNlID0gY29tbWFuZCEuZXh0ZW5zaW9uPy5kaXNwbGF5TmFtZSA/PyBjb21tYW5kIS5leHRlbnNpb24/Lm5hbWU7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHRvRXJyb3JNZXNzYWdlKGVycikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3JlcG9ydFRlbGVtZXRyeShjb21tYW5kLCBpZCwgc3RvcFdhdGNoLmVsYXBzZWQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0VGVsZW1ldHJ5KGNvbW1hbmQ6IENvbW1hbmRIYW5kbGVyLCBpZDogc3RyaW5nLCBkdXJhdGlvbjogbnVtYmVyKSB7XG5cdFx0aWYgKCFjb21tYW5kLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaWQuc3RhcnRzV2l0aCgnY29kZS5jb3BpbG90LmxvZ1N0cnVjdHVyZWQnKSkge1xuXHRcdFx0Ly8gVGhpcyBjb21tYW5kIGlzIHZlcnkgYWN0aXZlLiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1NDE1My5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHlwZSBFeHRlbnNpb25BY3Rpb25UZWxlbWV0cnkgPSB7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0aWQ6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0ZHVyYXRpb246IG51bWJlcjtcblx0XHR9O1xuXHRcdHR5cGUgRXh0ZW5zaW9uQWN0aW9uVGVsZW1ldHJ5TWV0YSA9IHtcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSBleHRlbnNpb24gaGFuZGxpbmcgdGhlIGNvbW1hbmQsIGluZm9ybWluZyB3aGljaCBleHRlbnNpb25zIHByb3ZpZGUgbW9zdC11c2VkIGZ1bmN0aW9uYWxpdHkuJyB9O1xuXHRcdFx0aWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWQgb2YgdGhlIGNvbW1hbmQsIHRvIHVuZGVyc3RhbmQgd2hpY2ggc3BlY2lmaWMgZXh0ZW5zaW9uIGZlYXR1cmVzIGFyZSBtb3N0IHBvcHVsYXIuJyB9O1xuXHRcdFx0ZHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZHVyYXRpb24gb2YgdGhlIGNvbW1hbmQgZXhlY3V0aW9uLCB0byBkZXRlY3QgcGVyZm9ybWFuY2UgaXNzdWVzJyB9O1xuXHRcdFx0b3duZXI6ICdkaWdpdGFyYWxkJztcblx0XHRcdGNvbW1lbnQ6ICdVc2VkIHRvIGdhaW4gaW5zaWdodCBvbiB0aGUgbW9zdCBwb3B1bGFyIGNvbW1hbmRzIHVzZWQgZnJvbSBleHRlbnNpb25zJztcblx0XHR9O1xuXHRcdHRoaXMuI3RlbGVtZXRyeS4kcHVibGljTG9nMjxFeHRlbnNpb25BY3Rpb25UZWxlbWV0cnksIEV4dGVuc2lvbkFjdGlvblRlbGVtZXRyeU1ldGE+KCdFeHRlbnNpb246QWN0aW9uRXhlY3V0ZWQnLCB7XG5cdFx0XHRleHRlbnNpb25JZDogY29tbWFuZC5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdGlkOiBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKGlkKSxcblx0XHRcdGR1cmF0aW9uOiBkdXJhdGlvbixcblx0XHR9KTtcblx0fVxuXG5cdCRleGVjdXRlQ29udHJpYnV0ZWRDb21tYW5kKGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RDb21tYW5kcyMkZXhlY3V0ZUNvbnRyaWJ1dGVkQ29tbWFuZCcsIGlkKTtcblxuXHRcdGNvbnN0IGNtZEhhbmRsZXIgPSB0aGlzLl9jb21tYW5kcy5nZXQoaWQpO1xuXHRcdGlmICghY21kSGFuZGxlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgQ29udHJpYnV0ZWQgY29tbWFuZCAnJHtpZH0nIGRvZXMgbm90IGV4aXN0LmApKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJncyA9IGFyZ3MubWFwKGFyZyA9PiB0aGlzLl9hcmd1bWVudFByb2Nlc3NvcnMucmVkdWNlKChyLCBwKSA9PiBwLnByb2Nlc3NBcmd1bWVudChyLCBjbWRIYW5kbGVyLmV4dGVuc2lvbiksIGFyZykpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVDb250cmlidXRlZENvbW1hbmQoaWQsIGFyZ3MsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldENvbW1hbmRzKGZpbHRlclVuZGVyc2NvcmVDb21tYW5kczogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RDb21tYW5kcyNnZXRDb21tYW5kcycsIGZpbHRlclVuZGVyc2NvcmVDb21tYW5kcyk7XG5cblx0XHRyZXR1cm4gdGhpcy4jcHJveHkuJGdldENvbW1hbmRzKCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0aWYgKGZpbHRlclVuZGVyc2NvcmVDb21tYW5kcykge1xuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQuZmlsdGVyKGNvbW1hbmQgPT4gY29tbWFuZFswXSAhPT0gJ18nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHQkZ2V0Q29udHJpYnV0ZWRDb21tYW5kTWV0YWRhdGEoKTogUHJvbWlzZTx7IFtpZDogc3RyaW5nXTogc3RyaW5nIHwgSUNvbW1hbmRNZXRhZGF0YUR0byB9PiB7XG5cdFx0Y29uc3QgcmVzdWx0OiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIHwgSUNvbW1hbmRNZXRhZGF0YSB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IFtpZCwgY29tbWFuZF0gb2YgdGhpcy5fY29tbWFuZHMpIHtcblx0XHRcdGNvbnN0IHsgbWV0YWRhdGEgfSA9IGNvbW1hbmQ7XG5cdFx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdFx0cmVzdWx0W2lkXSA9IG1ldGFkYXRhO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdENvbW1hbmRzIGV4dGVuZHMgRXh0SG9zdENvbW1hbmRzIHsgfVxuZXhwb3J0IGNvbnN0IElFeHRIb3N0Q29tbWFuZHMgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RDb21tYW5kcz4oJ0lFeHRIb3N0Q29tbWFuZHMnKTtcblxuZXhwb3J0IGNsYXNzIENvbW1hbmRzQ29udmVydGVyIGltcGxlbWVudHMgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuQ29tbWFuZC5JQ29tbWFuZHNDb252ZXJ0ZXIge1xuXG5cdHJlYWRvbmx5IGRlbGVnYXRpbmdDb21tYW5kSWQ6IHN0cmluZyA9IGBfX3ZzYyR7Z2VuZXJhdGVVdWlkKCl9YDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLkNvbW1hbmQ+KCk7XG5cdHByaXZhdGUgX2NhY2hJZFBvb2wgPSAwO1xuXG5cdC8vIC0tLSBjb252ZXJzaW9uIGJldHdlZW4gaW50ZXJuYWwgYW5kIGFwaSBjb21tYW5kc1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvb2t1cEFwaUNvbW1hbmQ6IChpZDogc3RyaW5nKSA9PiBBcGlDb21tYW5kIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2NvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZCh0cnVlLCB0aGlzLmRlbGVnYXRpbmdDb21tYW5kSWQsIHRoaXMuX2V4ZWN1dGVDb252ZXJ0ZWRDb21tYW5kLCB0aGlzKTtcblx0fVxuXG5cdHRvSW50ZXJuYWwoY29tbWFuZDogdnNjb2RlLkNvbW1hbmQsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBJQ29tbWFuZER0bztcblx0dG9JbnRlcm5hbChjb21tYW5kOiB2c2NvZGUuQ29tbWFuZCB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IElDb21tYW5kRHRvIHwgdW5kZWZpbmVkO1xuXHR0b0ludGVybmFsKGNvbW1hbmQ6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSUNvbW1hbmREdG8gfCB1bmRlZmluZWQge1xuXG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSUNvbW1hbmREdG8gPSB7XG5cdFx0XHQkaWRlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGlkOiBjb21tYW5kLmNvbW1hbmQsXG5cdFx0XHR0aXRsZTogY29tbWFuZC50aXRsZSxcblx0XHRcdHRvb2x0aXA6IGNvbW1hbmQudG9vbHRpcFxuXHRcdH07XG5cblx0XHRpZiAoIWNvbW1hbmQuY29tbWFuZCkge1xuXHRcdFx0Ly8gZmFsc3kgY29tbWFuZCBpZCAtPiByZXR1cm4gY29udmVydGVkIGNvbW1hbmQgYnV0IGRvbid0IGF0dGVtcHQgYW55XG5cdFx0XHQvLyBhcmd1bWVudCBvciBBUEktY29tbWFuZCBkYW5jZSBzaW5jZSB0aGlzIGNvbW1hbmQgd29uJ3QgcnVuIGFueXdheXNcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBpQ29tbWFuZCA9IHRoaXMuX2xvb2t1cEFwaUNvbW1hbmQoY29tbWFuZC5jb21tYW5kKTtcblx0XHRpZiAoYXBpQ29tbWFuZCkge1xuXHRcdFx0Ly8gQVBJIGNvbW1hbmQgd2l0aCByZXR1cm4tdmFsdWUgY2FuIGJlIGNvbnZlcnRlZCBpbnBsYWNlXG5cdFx0XHRyZXN1bHQuaWQgPSBhcGlDb21tYW5kLmludGVybmFsSWQ7XG5cdFx0XHRyZXN1bHQuYXJndW1lbnRzID0gYXBpQ29tbWFuZC5hcmdzLm1hcCgoYXJnLCBpKSA9PiBhcmcuY29udmVydChjb21tYW5kLmFyZ3VtZW50cyAmJiBjb21tYW5kLmFyZ3VtZW50c1tpXSkpO1xuXG5cblx0XHR9IGVsc2UgaWYgKGlzTm9uRW1wdHlBcnJheShjb21tYW5kLmFyZ3VtZW50cykpIHtcblx0XHRcdC8vIHdlIGhhdmUgYSBjb250cmlidXRlZCBjb21tYW5kIHdpdGggYXJndW1lbnRzLiB0aGF0XG5cdFx0XHQvLyBtZWFucyB3ZSBkb24ndCB3YW50IHRvIHNlbmQgdGhlIGFyZ3VtZW50cyBhcm91bmRcblxuXHRcdFx0Y29uc3QgaWQgPSBgJHtjb21tYW5kLmNvbW1hbmR9IC8keysrdGhpcy5fY2FjaElkUG9vbH1gO1xuXHRcdFx0dGhpcy5fY2FjaGUuc2V0KGlkLCBjb21tYW5kKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jYWNoZS5kZWxldGUoaWQpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb21tYW5kc0NvbnZlcnRlciNESVNQT1NFJywgaWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cmVzdWx0LiRpZGVudCA9IGlkO1xuXG5cdFx0XHRyZXN1bHQuaWQgPSB0aGlzLmRlbGVnYXRpbmdDb21tYW5kSWQ7XG5cdFx0XHRyZXN1bHQuYXJndW1lbnRzID0gW2lkXTtcblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29tbWFuZHNDb252ZXJ0ZXIjQ1JFQVRFJywgY29tbWFuZC5jb21tYW5kLCBpZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGZyb21JbnRlcm5hbChjb21tYW5kOiBJQ29tbWFuZER0byk6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkIHtcblxuXHRcdGlmICh0eXBlb2YgY29tbWFuZC4kaWRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGUuZ2V0KGNvbW1hbmQuJGlkZW50KTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb21tYW5kOiBjb21tYW5kLmlkLFxuXHRcdFx0XHR0aXRsZTogY29tbWFuZC50aXRsZSxcblx0XHRcdFx0YXJndW1lbnRzOiBjb21tYW5kLmFyZ3VtZW50c1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXG5cdGdldEFjdHVhbENvbW1hbmQoLi4uYXJnczogdW5rbm93bltdKTogdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jYWNoZS5nZXQoYXJnc1swXSBhcyBzdHJpbmcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhlY3V0ZUNvbnZlcnRlZENvbW1hbmQ8Uj4oLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxSPiB7XG5cdFx0Y29uc3QgYWN0dWFsQ21kID0gdGhpcy5nZXRBY3R1YWxDb21tYW5kKC4uLmFyZ3MpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0NvbW1hbmRzQ29udmVydGVyI0VYRUNVVEUnLCBhcmdzWzBdLCBhY3R1YWxDbWQgPyBhY3R1YWxDbWQuY29tbWFuZCA6ICdNSVNTSU5HJyk7XG5cblx0XHRpZiAoIWFjdHVhbENtZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGBBY3R1YWwgY29tbWFuZCBub3QgZm91bmQsIHdhbnRlZCB0byBleGVjdXRlICR7YXJnc1swXX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKGFjdHVhbENtZC5jb21tYW5kLCAuLi4oYWN0dWFsQ21kLmFyZ3VtZW50cyB8fCBbXSkpO1xuXHR9XG5cbn1cblxuXG5leHBvcnQgY2xhc3MgQXBpQ29tbWFuZEFyZ3VtZW50PFYsIE8gPSBWPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFVyaSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8VVJJPigndXJpJywgJ1VyaSBvZiBhIHRleHQgZG9jdW1lbnQnLCB2ID0+IFVSSS5pc1VyaSh2KSwgdiA9PiB2KTtcblx0c3RhdGljIHJlYWRvbmx5IFBvc2l0aW9uID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxleHRIb3N0VHlwZXMuUG9zaXRpb24sIElQb3NpdGlvbj4oJ3Bvc2l0aW9uJywgJ0EgcG9zaXRpb24gaW4gYSB0ZXh0IGRvY3VtZW50JywgdiA9PiBleHRIb3N0VHlwZXMuUG9zaXRpb24uaXNQb3NpdGlvbih2KSwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUG9zaXRpb24uZnJvbSk7XG5cdHN0YXRpYyByZWFkb25seSBSYW5nZSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8ZXh0SG9zdFR5cGVzLlJhbmdlLCBJUmFuZ2U+KCdyYW5nZScsICdBIHJhbmdlIGluIGEgdGV4dCBkb2N1bWVudCcsIHYgPT4gZXh0SG9zdFR5cGVzLlJhbmdlLmlzUmFuZ2UodiksIGV4dEhvc3RUeXBlQ29udmVydGVyLlJhbmdlLmZyb20pO1xuXHRzdGF0aWMgcmVhZG9ubHkgU2VsZWN0aW9uID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxleHRIb3N0VHlwZXMuU2VsZWN0aW9uLCBJU2VsZWN0aW9uPignc2VsZWN0aW9uJywgJ0Egc2VsZWN0aW9uIGluIGEgdGV4dCBkb2N1bWVudCcsIHYgPT4gZXh0SG9zdFR5cGVzLlNlbGVjdGlvbi5pc1NlbGVjdGlvbih2KSwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuU2VsZWN0aW9uLmZyb20pO1xuXHRzdGF0aWMgcmVhZG9ubHkgTnVtYmVyID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxudW1iZXI+KCdudW1iZXInLCAnJywgdiA9PiB0eXBlb2YgdiA9PT0gJ251bWJlcicsIHYgPT4gdik7XG5cdHN0YXRpYyByZWFkb25seSBTdHJpbmcgPSBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHN0cmluZz4oJ3N0cmluZycsICcnLCB2ID0+IHR5cGVvZiB2ID09PSAnc3RyaW5nJywgdiA9PiB2KTtcblxuXHRzdGF0aWMgQXJyPFQsIEsgPSBUPihlbGVtZW50OiBBcGlDb21tYW5kQXJndW1lbnQ8VCwgSz4pIHtcblx0XHRyZXR1cm4gbmV3IEFwaUNvbW1hbmRBcmd1bWVudChcblx0XHRcdGAke2VsZW1lbnQubmFtZX1fYXJyYXlgLFxuXHRcdFx0YEFycmF5IG9mICR7ZWxlbWVudC5uYW1lfSwgJHtlbGVtZW50LmRlc2NyaXB0aW9ufWAsXG5cdFx0XHQodjogdW5rbm93bikgPT4gQXJyYXkuaXNBcnJheSh2KSAmJiB2LmV2ZXJ5KGUgPT4gZWxlbWVudC52YWxpZGF0ZShlKSksXG5cdFx0XHQodjogVFtdKSA9PiB2Lm1hcChlID0+IGVsZW1lbnQuY29udmVydChlKSlcblx0XHQpO1xuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IENhbGxIaWVyYXJjaHlJdGVtID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudCgnaXRlbScsICdBIGNhbGwgaGllcmFyY2h5IGl0ZW0nLCB2ID0+IHYgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2FsbEhpZXJhcmNoeUl0ZW0sIGV4dEhvc3RUeXBlQ29udmVydGVyLkNhbGxIaWVyYXJjaHlJdGVtLmZyb20pO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHlwZUhpZXJhcmNoeUl0ZW0gPSBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50KCdpdGVtJywgJ0EgdHlwZSBoaWVyYXJjaHkgaXRlbScsIHYgPT4gdiBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5UeXBlSGllcmFyY2h5SXRlbSwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuVHlwZUhpZXJhcmNoeUl0ZW0uZnJvbSk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0SXRlbSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ3Rlc3RJdGVtJywgJ0EgVlMgQ29kZSBUZXN0SXRlbScsIHYgPT4gdiBpbnN0YW5jZW9mIFRlc3RJdGVtSW1wbCwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuVGVzdEl0ZW0uZnJvbSk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0UHJvZmlsZSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ3Rlc3RQcm9maWxlJywgJ0EgVlMgQ29kZSB0ZXN0IHByb2ZpbGUnLCB2ID0+IHYgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuVGVzdFJ1blByb2ZpbGVCYXNlLCBleHRIb3N0VHlwZUNvbnZlcnRlci5UZXN0UnVuUHJvZmlsZS5mcm9tKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyxcblx0XHRyZWFkb25seSB2YWxpZGF0ZTogKHY6IFYpID0+IGJvb2xlYW4sXG5cdFx0cmVhZG9ubHkgY29udmVydDogKHY6IFYpID0+IE9cblx0KSB7IH1cblxuXHRvcHRpb25hbCgpOiBBcGlDb21tYW5kQXJndW1lbnQ8ViB8IHVuZGVmaW5lZCB8IG51bGwsIE8gfCB1bmRlZmluZWQgfCBudWxsPiB7XG5cdFx0cmV0dXJuIG5ldyBBcGlDb21tYW5kQXJndW1lbnQoXG5cdFx0XHR0aGlzLm5hbWUsIGAob3B0aW9uYWwpICR7dGhpcy5kZXNjcmlwdGlvbn1gLFxuXHRcdFx0dmFsdWUgPT4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCB8fCB0aGlzLnZhbGlkYXRlKHZhbHVlKSxcblx0XHRcdHZhbHVlID0+IHZhbHVlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB2YWx1ZSA9PT0gbnVsbCA/IG51bGwgOiB0aGlzLmNvbnZlcnQodmFsdWUpXG5cdFx0KTtcblx0fVxuXG5cdHdpdGgobmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogQXBpQ29tbWFuZEFyZ3VtZW50PFYsIE8+IHtcblx0XHRyZXR1cm4gbmV3IEFwaUNvbW1hbmRBcmd1bWVudChuYW1lID8/IHRoaXMubmFtZSwgZGVzY3JpcHRpb24gPz8gdGhpcy5kZXNjcmlwdGlvbiwgdGhpcy52YWxpZGF0ZSwgdGhpcy5jb252ZXJ0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXBpQ29tbWFuZFJlc3VsdDxWLCBPID0gVj4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBWb2lkID0gbmV3IEFwaUNvbW1hbmRSZXN1bHQ8dm9pZCwgdm9pZD4oJ25vIHJlc3VsdCcsIHYgPT4gdik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyxcblx0XHRyZWFkb25seSBjb252ZXJ0OiAodjogViwgYXBpQXJnczogYW55W10sIGNtZENvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIpID0+IE9cblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEFwaUNvbW1hbmQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgaW50ZXJuYWxJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgYXJnczogQXBpQ29tbWFuZEFyZ3VtZW50PGFueSwgYW55PltdLFxuXHRcdHJlYWRvbmx5IHJlc3VsdDogQXBpQ29tbWFuZFJlc3VsdDxhbnksIGFueT5cblx0KSB7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywwQkFBMEI7QUFFbkMsWUFBWSxrQkFBa0I7QUFDOUIsWUFBWSwwQkFBMEI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBOEg7QUFDdkksU0FBUyx1QkFBdUI7QUFHaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQWlCLGFBQWE7QUFDOUIsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUEwQixvQkFBb0I7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFhN0IsSUFBTSxrQkFBTixNQUFzRDtBQUFBLEVBZ0I1RCxZQUNxQixZQUNQ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
