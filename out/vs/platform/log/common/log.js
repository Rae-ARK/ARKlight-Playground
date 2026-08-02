import * as nls from "../../../nls.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { hash } from "../../../base/common/hash.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { isWindows } from "../../../base/common/platform.js";
import { joinPath } from "../../../base/common/resources.js";
import { isNumber, isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { RawContextKey } from "../../contextkey/common/contextkey.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
const ILogService = createDecorator("logService");
const ILoggerService = createDecorator("loggerService");
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isLogLevel(thing) {
  return isNumber(thing);
}
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["Off"] = 0] = "Off";
  LogLevel2[LogLevel2["Trace"] = 1] = "Trace";
  LogLevel2[LogLevel2["Debug"] = 2] = "Debug";
  LogLevel2[LogLevel2["Info"] = 3] = "Info";
  LogLevel2[LogLevel2["Warning"] = 4] = "Warning";
  LogLevel2[LogLevel2["Error"] = 5] = "Error";
  return LogLevel2;
})(LogLevel || {});
const DEFAULT_LOG_LEVEL = 3 /* Info */;
function canLog(loggerLevel, messageLevel) {
  return loggerLevel !== 0 /* Off */ && loggerLevel <= messageLevel;
}
function log(logger, level, message) {
  switch (level) {
    case 1 /* Trace */:
      logger.trace(message);
      break;
    case 2 /* Debug */:
      logger.debug(message);
      break;
    case 3 /* Info */:
      logger.info(message);
      break;
    case 4 /* Warning */:
      logger.warn(message);
      break;
    case 5 /* Error */:
      logger.error(message);
      break;
    case 0 /* Off */:
      break;
    default:
      throw new Error(`Invalid log level ${level}`);
  }
}
const isDevConsoleLogForwardingEnabled = false;
let isConsoleForwarding = false;
let isLogServiceConsoleEcho = false;
function getConsoleMethod(method) {
  switch (method) {
    case "debug":
      return console.debug;
    case "error":
      return console.error;
    case "info":
      return console.info;
    case "log":
      return console.log;
    case "warn":
      return console.warn;
  }
}
function setConsoleMethod(method, fn) {
  switch (method) {
    case "debug":
      console.debug = fn;
      break;
    case "error":
      console.error = fn;
      break;
    case "info":
      console.info = fn;
      break;
    case "log":
      console.log = fn;
      break;
    case "warn":
      console.warn = fn;
      break;
  }
}
function logToConsole(method, ...args) {
  if (isConsoleForwarding) {
    return;
  }
  isLogServiceConsoleEcho = true;
  try {
    getConsoleMethod(method).apply(console, args);
  } finally {
    isLogServiceConsoleEcho = false;
  }
}
function registerDevConsoleLogForwarder(logService) {
  const originalConsoleMethods = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn
  };
  const forward = (method, level, args) => {
    if (!isLogServiceConsoleEcho) {
      isConsoleForwarding = true;
      try {
        log(logService, level, format(args));
      } catch {
      } finally {
        isConsoleForwarding = false;
      }
    }
    originalConsoleMethods[method].apply(console, args);
  };
  const wrappers = {
    debug: (...args) => forward("debug", 2 /* Debug */, args),
    error: (...args) => forward("error", 5 /* Error */, args),
    info: (...args) => forward("info", 3 /* Info */, args),
    log: (...args) => forward("log", 3 /* Info */, args),
    warn: (...args) => forward("warn", 4 /* Warning */, args)
  };
  setConsoleMethod("debug", wrappers.debug);
  setConsoleMethod("error", wrappers.error);
  setConsoleMethod("info", wrappers.info);
  setConsoleMethod("log", wrappers.log);
  setConsoleMethod("warn", wrappers.warn);
  return toDisposable(() => {
    if (console.debug === wrappers.debug) {
      console.debug = originalConsoleMethods.debug;
    }
    if (console.error === wrappers.error) {
      console.error = originalConsoleMethods.error;
    }
    if (console.info === wrappers.info) {
      console.info = originalConsoleMethods.info;
    }
    if (console.log === wrappers.log) {
      console.log = originalConsoleMethods.log;
    }
    if (console.warn === wrappers.warn) {
      console.warn = originalConsoleMethods.warn;
    }
  });
}
function format(args, verbose = false) {
  let result = "";
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    if (a instanceof Error) {
      a = toErrorMessage(a, verbose);
    }
    if (typeof a === "object") {
      try {
        a = JSON.stringify(a);
      } catch (e) {
      }
    }
    result += (i > 0 ? " " : "") + a;
  }
  return result;
}
class AbstractLogger extends Disposable {
  constructor() {
    super(...arguments);
    this.level = DEFAULT_LOG_LEVEL;
    this._onDidChangeLogLevel = this._register(new Emitter());
  }
  get onDidChangeLogLevel() {
    return this._onDidChangeLogLevel.event;
  }
  setLevel(level) {
    if (this.level !== level) {
      this.level = level;
      this._onDidChangeLogLevel.fire(this.level);
    }
  }
  getLevel() {
    return this.level;
  }
  checkLogLevel(level) {
    return canLog(this.level, level);
  }
  canLog(level) {
    if (this._store.isDisposed) {
      return false;
    }
    return this.checkLogLevel(level);
  }
}
class AbstractMessageLogger extends AbstractLogger {
  constructor(logAlways) {
    super();
    this.logAlways = logAlways;
  }
  checkLogLevel(level) {
    return this.logAlways || super.checkLogLevel(level);
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      this.log(1 /* Trace */, format([message, ...args], true));
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      this.log(2 /* Debug */, format([message, ...args]));
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      this.log(3 /* Info */, format([message, ...args]));
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      this.log(4 /* Warning */, format([message, ...args]));
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      if (message instanceof Error) {
        const array = Array.prototype.slice.call(arguments);
        array[0] = message.stack;
        this.log(5 /* Error */, format(array));
      } else {
        this.log(5 /* Error */, format([message, ...args]));
      }
    }
  }
  flush() {
  }
}
class ConsoleMainLogger extends AbstractLogger {
  constructor(logLevel = DEFAULT_LOG_LEVEL) {
    super();
    this.setLevel(logLevel);
    this.useColors = !isWindows;
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      if (this.useColors) {
        logToConsole("log", `\x1B[90m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("log", `[main ${now()}]`, message, ...args);
      }
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      if (this.useColors) {
        logToConsole("log", `\x1B[90m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("log", `[main ${now()}]`, message, ...args);
      }
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      if (this.useColors) {
        logToConsole("log", `\x1B[90m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("log", `[main ${now()}]`, message, ...args);
      }
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      if (this.useColors) {
        logToConsole("warn", `\x1B[93m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("warn", `[main ${now()}]`, message, ...args);
      }
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      if (this.useColors) {
        logToConsole("error", `\x1B[91m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("error", `[main ${now()}]`, message, ...args);
      }
    }
  }
  flush() {
  }
}
class ConsoleLogger extends AbstractLogger {
  constructor(logLevel = DEFAULT_LOG_LEVEL, useColors = true) {
    super();
    this.useColors = useColors;
    this.setLevel(logLevel);
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      if (this.useColors) {
        logToConsole("log", "%cTRACE", "color: #888", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      if (this.useColors) {
        logToConsole("log", "%cDEBUG", "background: #eee; color: #888", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      if (this.useColors) {
        logToConsole("log", "%c INFO", "color: #33f", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      if (this.useColors) {
        logToConsole("warn", "%c WARN", "color: #993", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      if (this.useColors) {
        logToConsole("error", "%c  ERR", "color: #f33", message, ...args);
      } else {
        logToConsole("error", message, ...args);
      }
    }
  }
  flush() {
  }
}
class AdapterLogger extends AbstractLogger {
  constructor(adapter, logLevel = DEFAULT_LOG_LEVEL) {
    super();
    this.adapter = adapter;
    this.setLevel(logLevel);
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      this.adapter.log(1 /* Trace */, [this.extractMessage(message), ...args]);
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      this.adapter.log(2 /* Debug */, [this.extractMessage(message), ...args]);
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      this.adapter.log(3 /* Info */, [this.extractMessage(message), ...args]);
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      this.adapter.log(4 /* Warning */, [this.extractMessage(message), ...args]);
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      this.adapter.log(5 /* Error */, [this.extractMessage(message), ...args]);
    }
  }
  extractMessage(msg) {
    if (typeof msg === "string") {
      return msg;
    }
    return toErrorMessage(msg, this.canLog(1 /* Trace */));
  }
  flush() {
  }
}
class MultiplexLogger extends AbstractLogger {
  constructor(loggers) {
    super();
    this.loggers = loggers;
    if (loggers.length) {
      this.setLevel(loggers[0].getLevel());
    }
  }
  setLevel(level) {
    for (const logger of this.loggers) {
      logger.setLevel(level);
    }
    super.setLevel(level);
  }
  trace(message, ...args) {
    for (const logger of this.loggers) {
      logger.trace(message, ...args);
    }
  }
  debug(message, ...args) {
    for (const logger of this.loggers) {
      logger.debug(message, ...args);
    }
  }
  info(message, ...args) {
    for (const logger of this.loggers) {
      logger.info(message, ...args);
    }
  }
  warn(message, ...args) {
    for (const logger of this.loggers) {
      logger.warn(message, ...args);
    }
  }
  error(message, ...args) {
    for (const logger of this.loggers) {
      logger.error(message, ...args);
    }
  }
  flush() {
    for (const logger of this.loggers) {
      logger.flush();
    }
  }
  dispose() {
    for (const logger of this.loggers) {
      logger.dispose();
    }
    super.dispose();
  }
}
class AbstractLoggerService extends Disposable {
  constructor(logLevel, logsHome, loggerResources) {
    super();
    this.logLevel = logLevel;
    this.logsHome = logsHome;
    this._loggers = new ResourceMap();
    this._onDidChangeLoggers = this._register(new Emitter());
    this.onDidChangeLoggers = this._onDidChangeLoggers.event;
    this._onDidChangeLogLevel = this._register(new Emitter());
    this.onDidChangeLogLevel = this._onDidChangeLogLevel.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    if (loggerResources) {
      for (const loggerResource of loggerResources) {
        this._loggers.set(loggerResource.resource, { logger: void 0, info: loggerResource });
      }
    }
  }
  getLoggerEntry(resourceOrId) {
    if (isString(resourceOrId)) {
      return [...this._loggers.values()].find((logger) => logger.info.id === resourceOrId);
    }
    return this._loggers.get(resourceOrId);
  }
  getLogger(resourceOrId) {
    return this.getLoggerEntry(resourceOrId)?.logger;
  }
  createLogger(idOrResource, options) {
    const resource = this.toResource(idOrResource);
    const id = isString(idOrResource) ? idOrResource : options?.id ?? hash(resource.toString()).toString(16);
    let logger = this._loggers.get(resource)?.logger;
    const logLevel = options?.logLevel === "always" ? 1 /* Trace */ : options?.logLevel;
    if (!logger) {
      logger = this.doCreateLogger(resource, logLevel ?? this.getLogLevel(resource) ?? this.logLevel, { ...options, id });
    }
    const loggerEntry = {
      logger,
      info: {
        resource,
        id,
        logLevel,
        name: options?.name,
        hidden: options?.hidden,
        group: options?.group,
        extensionId: options?.extensionId,
        when: options?.when
      }
    };
    this.registerLogger(loggerEntry.info);
    this._loggers.set(resource, loggerEntry);
    return logger;
  }
  toResource(idOrResource) {
    return isString(idOrResource) ? joinPath(this.logsHome, `${idOrResource.replace(/[\\/:\*\?"<>\|]/g, "")}.log`) : idOrResource;
  }
  setLogLevel(arg1, arg2) {
    if (URI.isUri(arg1)) {
      const resource = arg1;
      const logLevel = arg2;
      const logger = this._loggers.get(resource);
      if (logger && logLevel !== logger.info.logLevel) {
        logger.info.logLevel = logLevel === this.logLevel ? void 0 : logLevel;
        logger.logger?.setLevel(logLevel);
        this._loggers.set(logger.info.resource, logger);
        this._onDidChangeLogLevel.fire([resource, logLevel]);
      }
    } else {
      this.logLevel = arg1;
      for (const [resource, logger] of this._loggers.entries()) {
        if (this._loggers.get(resource)?.info.logLevel === void 0) {
          logger.logger?.setLevel(this.logLevel);
        }
      }
      this._onDidChangeLogLevel.fire(this.logLevel);
    }
  }
  setVisibility(resourceOrId, visibility) {
    const logger = this.getLoggerEntry(resourceOrId);
    if (logger && visibility !== !logger.info.hidden) {
      logger.info.hidden = !visibility;
      this._loggers.set(logger.info.resource, logger);
      this._onDidChangeVisibility.fire([logger.info.resource, visibility]);
    }
  }
  getLogLevel(resource) {
    let logLevel;
    if (resource) {
      logLevel = this._loggers.get(resource)?.info.logLevel;
    }
    return logLevel ?? this.logLevel;
  }
  registerLogger(resource) {
    const existing = this._loggers.get(resource.resource);
    if (existing) {
      if (existing.info.hidden !== resource.hidden) {
        this.setVisibility(resource.resource, !resource.hidden);
      }
    } else {
      this._loggers.set(resource.resource, { info: resource, logger: void 0 });
      this._onDidChangeLoggers.fire({ added: [resource], removed: [] });
    }
  }
  deregisterLogger(idOrResource) {
    const resource = this.toResource(idOrResource);
    const existing = this._loggers.get(resource);
    if (existing) {
      if (existing.logger) {
        existing.logger.dispose();
      }
      this._loggers.delete(resource);
      this._onDidChangeLoggers.fire({ added: [], removed: [existing.info] });
    }
  }
  *getRegisteredLoggers() {
    for (const entry of this._loggers.values()) {
      yield entry.info;
    }
  }
  getRegisteredLogger(resource) {
    return this._loggers.get(resource)?.info;
  }
  dispose() {
    this._loggers.forEach((logger) => logger.logger?.dispose());
    this._loggers.clear();
    super.dispose();
  }
}
class NullLogger {
  constructor() {
    this.onDidChangeLogLevel = new Emitter().event;
  }
  setLevel(level) {
  }
  getLevel() {
    return 3 /* Info */;
  }
  trace(message, ...args) {
  }
  debug(message, ...args) {
  }
  info(message, ...args) {
  }
  warn(message, ...args) {
  }
  error(message, ...args) {
  }
  critical(message, ...args) {
  }
  dispose() {
  }
  flush() {
  }
}
class NullLogService extends NullLogger {
}
class NullLoggerService extends AbstractLoggerService {
  constructor() {
    super(0 /* Off */, URI.parse("log:///log"));
  }
  doCreateLogger(resource, logLevel, options) {
    return new NullLogger();
  }
}
function getLogLevel(environmentService) {
  if (environmentService.verbose) {
    return 1 /* Trace */;
  }
  if (typeof environmentService.logLevel === "string") {
    const logLevel = parseLogLevel(environmentService.logLevel.toLowerCase());
    if (logLevel !== void 0) {
      return logLevel;
    }
  }
  return DEFAULT_LOG_LEVEL;
}
function LogLevelToString(logLevel) {
  switch (logLevel) {
    case 1 /* Trace */:
      return "trace";
    case 2 /* Debug */:
      return "debug";
    case 3 /* Info */:
      return "info";
    case 4 /* Warning */:
      return "warn";
    case 5 /* Error */:
      return "error";
    case 0 /* Off */:
      return "off";
  }
}
function LogLevelToLocalizedString(logLevel) {
  switch (logLevel) {
    case 1 /* Trace */:
      return { original: "Trace", value: nls.localize("trace", "Trace") };
    case 2 /* Debug */:
      return { original: "Debug", value: nls.localize("debug", "Debug") };
    case 3 /* Info */:
      return { original: "Info", value: nls.localize("info", "Info") };
    case 4 /* Warning */:
      return { original: "Warning", value: nls.localize("warn", "Warning") };
    case 5 /* Error */:
      return { original: "Error", value: nls.localize("error", "Error") };
    case 0 /* Off */:
      return { original: "Off", value: nls.localize("off", "Off") };
  }
}
function parseLogLevel(logLevel) {
  switch (logLevel) {
    case "trace":
      return 1 /* Trace */;
    case "debug":
      return 2 /* Debug */;
    case "info":
      return 3 /* Info */;
    case "warn":
      return 4 /* Warning */;
    case "error":
      return 5 /* Error */;
    case "critical":
      return 5 /* Error */;
    case "off":
      return 0 /* Off */;
  }
  return void 0;
}
const CONTEXT_LOG_LEVEL = new RawContextKey("logLevel", LogLevelToString(3 /* Info */));
export {
  AbstractLogger,
  AbstractLoggerService,
  AbstractMessageLogger,
  AdapterLogger,
  CONTEXT_LOG_LEVEL,
  ConsoleLogger,
  ConsoleMainLogger,
  DEFAULT_LOG_LEVEL,
  ILogService,
  ILoggerService,
  LogLevel,
  LogLevelToLocalizedString,
  LogLevelToString,
  MultiplexLogger,
  NullLogService,
  NullLogger,
  NullLoggerService,
  canLog,
  format,
  getLogLevel,
  isDevConsoleLogForwardingEnabled,
  isLogLevel,
  log,
  parseLogLevel,
  registerDevConsoleLogForwarder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSwgaXNOdW1iZXIsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgSUxvZ1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxvZ1NlcnZpY2U+KCdsb2dTZXJ2aWNlJyk7XG5leHBvcnQgY29uc3QgSUxvZ2dlclNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxvZ2dlclNlcnZpY2U+KCdsb2dnZXJTZXJ2aWNlJyk7XG5cbmZ1bmN0aW9uIG5vdygpOiBzdHJpbmcge1xuXHRyZXR1cm4gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMb2dMZXZlbCh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIExvZ0xldmVsIHtcblx0cmV0dXJuIGlzTnVtYmVyKHRoaW5nKTtcbn1cblxuZXhwb3J0IGVudW0gTG9nTGV2ZWwge1xuXHRPZmYsXG5cdFRyYWNlLFxuXHREZWJ1Zyxcblx0SW5mbyxcblx0V2FybmluZyxcblx0RXJyb3Jcbn1cblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTE9HX0xFVkVMOiBMb2dMZXZlbCA9IExvZ0xldmVsLkluZm87XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvZ2dlciBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMb2dMZXZlbDogRXZlbnQ8TG9nTGV2ZWw+O1xuXHRnZXRMZXZlbCgpOiBMb2dMZXZlbDtcblx0c2V0TGV2ZWwobGV2ZWw6IExvZ0xldmVsKTogdm9pZDtcblxuXHR0cmFjZShtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG5cdGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcblx0aW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG5cdHdhcm4obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xuXHRlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcblxuXHQvKipcblx0ICogQW4gb3BlcmF0aW9uIHRvIGZsdXNoIHRoZSBjb250ZW50cy4gQ2FuIGJlIHN5bmNocm9ub3VzLlxuXHQgKi9cblx0Zmx1c2goKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhbkxvZyhsb2dnZXJMZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2VMZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuIHtcblx0cmV0dXJuIGxvZ2dlckxldmVsICE9PSBMb2dMZXZlbC5PZmYgJiYgbG9nZ2VyTGV2ZWwgPD0gbWVzc2FnZUxldmVsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbG9nKGxvZ2dlcjogSUxvZ2dlciwgbGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0c3dpdGNoIChsZXZlbCkge1xuXHRcdGNhc2UgTG9nTGV2ZWwuVHJhY2U6IGxvZ2dlci50cmFjZShtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1ZzogbG9nZ2VyLmRlYnVnKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLkluZm86IGxvZ2dlci5pbmZvKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6IGxvZ2dlci53YXJuKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLkVycm9yOiBsb2dnZXIuZXJyb3IobWVzc2FnZSk7IGJyZWFrO1xuXHRcdGNhc2UgTG9nTGV2ZWwuT2ZmOiAvKiBkbyBub3RoaW5nICovIGJyZWFrO1xuXHRcdGRlZmF1bHQ6IHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBsb2cgbGV2ZWwgJHtsZXZlbH1gKTtcblx0fVxufVxuXG50eXBlIENvbnNvbGVNZXRob2QgPSAnZGVidWcnIHwgJ2Vycm9yJyB8ICdpbmZvJyB8ICdsb2cnIHwgJ3dhcm4nO1xudHlwZSBDb25zb2xlTWV0aG9kRm4gPSAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkO1xuXG4vKipcbiAqIEZsYWcgdG8gZW5hYmxlIGZvcndhcmRpbmcgb2YgY29uc29sZS4qIGNhbGxzIHRvIHRoZSBsb2cgc2VydmljZSBpbiBkZXZlbG9wbWVudC5cbiAqIFRoaXMgaXMgaW50ZW5kZWQgZm9yIHRoZSB1c2Ugb2YgYWdlbnRzIHRvIHF1aWNrbHkgaW5zdHJ1bWVudCB0aGUgY29kZSB3aXRoIGNvbnNvbGUubG9nc1xuICogd2hpY2ggd2lsbCBlbmQgdXAgaW4gdGhlIGxvZyBzZXJ2aWNlJ3MgZmlsZSBvdXRwdXRzLlxuICovXG5leHBvcnQgY29uc3QgaXNEZXZDb25zb2xlTG9nRm9yd2FyZGluZ0VuYWJsZWQgPSBmYWxzZVxuXHQvLyB8fCBCb29sZWFuKFwidHJ1ZVwiKSAvLyBkb25lIFwid2VpcmRseVwiIHNvIHRoYXQgYSBsaW50IHdhcm5pbmcgcHJldmVudHMgeW91IGZyb20gcHVzaGluZyB0aGlzXG5cdDtcblxubGV0IGlzQ29uc29sZUZvcndhcmRpbmcgPSBmYWxzZTtcbmxldCBpc0xvZ1NlcnZpY2VDb25zb2xlRWNobyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBnZXRDb25zb2xlTWV0aG9kKG1ldGhvZDogQ29uc29sZU1ldGhvZCk6IENvbnNvbGVNZXRob2RGbiB7XG5cdHN3aXRjaCAobWV0aG9kKSB7XG5cdFx0Y2FzZSAnZGVidWcnOiByZXR1cm4gY29uc29sZS5kZWJ1Zztcblx0XHRjYXNlICdlcnJvcic6IHJldHVybiBjb25zb2xlLmVycm9yO1xuXHRcdGNhc2UgJ2luZm8nOiByZXR1cm4gY29uc29sZS5pbmZvO1xuXHRcdGNhc2UgJ2xvZyc6IHJldHVybiBjb25zb2xlLmxvZztcblx0XHRjYXNlICd3YXJuJzogcmV0dXJuIGNvbnNvbGUud2Fybjtcblx0fVxufVxuXG5mdW5jdGlvbiBzZXRDb25zb2xlTWV0aG9kKG1ldGhvZDogQ29uc29sZU1ldGhvZCwgZm46IENvbnNvbGVNZXRob2RGbik6IHZvaWQge1xuXHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdGNhc2UgJ2RlYnVnJzogY29uc29sZS5kZWJ1ZyA9IGZuOyBicmVhaztcblx0XHRjYXNlICdlcnJvcic6IGNvbnNvbGUuZXJyb3IgPSBmbjsgYnJlYWs7XG5cdFx0Y2FzZSAnaW5mbyc6IGNvbnNvbGUuaW5mbyA9IGZuOyBicmVhaztcblx0XHRjYXNlICdsb2cnOiBjb25zb2xlLmxvZyA9IGZuOyBicmVhaztcblx0XHRjYXNlICd3YXJuJzogY29uc29sZS53YXJuID0gZm47IGJyZWFrO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGxvZ1RvQ29uc29sZShtZXRob2Q6IENvbnNvbGVNZXRob2QsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRpZiAoaXNDb25zb2xlRm9yd2FyZGluZykge1xuXHRcdHJldHVybjtcblx0fVxuXHRpc0xvZ1NlcnZpY2VDb25zb2xlRWNobyA9IHRydWU7XG5cdHRyeSB7XG5cdFx0Z2V0Q29uc29sZU1ldGhvZChtZXRob2QpLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlzTG9nU2VydmljZUNvbnNvbGVFY2hvID0gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRGV2Q29uc29sZUxvZ0ZvcndhcmRlcihsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3Qgb3JpZ2luYWxDb25zb2xlTWV0aG9kczogUmVjb3JkPENvbnNvbGVNZXRob2QsIENvbnNvbGVNZXRob2RGbj4gPSB7XG5cdFx0ZGVidWc6IGNvbnNvbGUuZGVidWcsXG5cdFx0ZXJyb3I6IGNvbnNvbGUuZXJyb3IsXG5cdFx0aW5mbzogY29uc29sZS5pbmZvLFxuXHRcdGxvZzogY29uc29sZS5sb2csXG5cdFx0d2FybjogY29uc29sZS53YXJuXG5cdH07XG5cblx0Y29uc3QgZm9yd2FyZCA9IChtZXRob2Q6IENvbnNvbGVNZXRob2QsIGxldmVsOiBMb2dMZXZlbCwgYXJnczogdW5rbm93bltdKTogdm9pZCA9PiB7XG5cdFx0aWYgKCFpc0xvZ1NlcnZpY2VDb25zb2xlRWNobykge1xuXHRcdFx0aXNDb25zb2xlRm9yd2FyZGluZyA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsb2cobG9nU2VydmljZSwgbGV2ZWwsIGZvcm1hdChhcmdzKSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gQmVzdC1lZmZvcnQgZGV2ZWxvcG1lbnQgbG9nZ2luZyBtdXN0IG5vdCBicmVhayBub3JtYWwgY29uc29sZSBzZW1hbnRpY3MuXG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpc0NvbnNvbGVGb3J3YXJkaW5nID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0b3JpZ2luYWxDb25zb2xlTWV0aG9kc1ttZXRob2RdLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xuXHR9O1xuXG5cdGNvbnN0IHdyYXBwZXJzOiBSZWNvcmQ8Q29uc29sZU1ldGhvZCwgQ29uc29sZU1ldGhvZEZuPiA9IHtcblx0XHRkZWJ1ZzogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gZm9yd2FyZCgnZGVidWcnLCBMb2dMZXZlbC5EZWJ1ZywgYXJncyksXG5cdFx0ZXJyb3I6ICguLi5hcmdzOiB1bmtub3duW10pID0+IGZvcndhcmQoJ2Vycm9yJywgTG9nTGV2ZWwuRXJyb3IsIGFyZ3MpLFxuXHRcdGluZm86ICguLi5hcmdzOiB1bmtub3duW10pID0+IGZvcndhcmQoJ2luZm8nLCBMb2dMZXZlbC5JbmZvLCBhcmdzKSxcblx0XHRsb2c6ICguLi5hcmdzOiB1bmtub3duW10pID0+IGZvcndhcmQoJ2xvZycsIExvZ0xldmVsLkluZm8sIGFyZ3MpLFxuXHRcdHdhcm46ICguLi5hcmdzOiB1bmtub3duW10pID0+IGZvcndhcmQoJ3dhcm4nLCBMb2dMZXZlbC5XYXJuaW5nLCBhcmdzKVxuXHR9O1xuXG5cdHNldENvbnNvbGVNZXRob2QoJ2RlYnVnJywgd3JhcHBlcnMuZGVidWcpO1xuXHRzZXRDb25zb2xlTWV0aG9kKCdlcnJvcicsIHdyYXBwZXJzLmVycm9yKTtcblx0c2V0Q29uc29sZU1ldGhvZCgnaW5mbycsIHdyYXBwZXJzLmluZm8pO1xuXHRzZXRDb25zb2xlTWV0aG9kKCdsb2cnLCB3cmFwcGVycy5sb2cpO1xuXHRzZXRDb25zb2xlTWV0aG9kKCd3YXJuJywgd3JhcHBlcnMud2Fybik7XG5cblx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0aWYgKGNvbnNvbGUuZGVidWcgPT09IHdyYXBwZXJzLmRlYnVnKSB7XG5cdFx0XHRjb25zb2xlLmRlYnVnID0gb3JpZ2luYWxDb25zb2xlTWV0aG9kcy5kZWJ1Zztcblx0XHR9XG5cdFx0aWYgKGNvbnNvbGUuZXJyb3IgPT09IHdyYXBwZXJzLmVycm9yKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yID0gb3JpZ2luYWxDb25zb2xlTWV0aG9kcy5lcnJvcjtcblx0XHR9XG5cdFx0aWYgKGNvbnNvbGUuaW5mbyA9PT0gd3JhcHBlcnMuaW5mbykge1xuXHRcdFx0Y29uc29sZS5pbmZvID0gb3JpZ2luYWxDb25zb2xlTWV0aG9kcy5pbmZvO1xuXHRcdH1cblx0XHRpZiAoY29uc29sZS5sb2cgPT09IHdyYXBwZXJzLmxvZykge1xuXHRcdFx0Y29uc29sZS5sb2cgPSBvcmlnaW5hbENvbnNvbGVNZXRob2RzLmxvZztcblx0XHR9XG5cdFx0aWYgKGNvbnNvbGUud2FybiA9PT0gd3JhcHBlcnMud2Fybikge1xuXHRcdFx0Y29uc29sZS53YXJuID0gb3JpZ2luYWxDb25zb2xlTWV0aG9kcy53YXJuO1xuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXQoYXJnczogYW55LCB2ZXJib3NlOiBib29sZWFuID0gZmFsc2UpOiBzdHJpbmcge1xuXHRsZXQgcmVzdWx0ID0gJyc7XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDsgaSsrKSB7XG5cdFx0bGV0IGEgPSBhcmdzW2ldO1xuXG5cdFx0aWYgKGEgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0YSA9IHRvRXJyb3JNZXNzYWdlKGEsIHZlcmJvc2UpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgYSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGEgPSBKU09OLnN0cmluZ2lmeShhKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHsgfVxuXHRcdH1cblxuXHRcdHJlc3VsdCArPSAoaSA+IDAgPyAnICcgOiAnJykgKyBhO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IHR5cGUgTG9nZ2VyR3JvdXAgPSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvZ1NlcnZpY2UgZXh0ZW5kcyBJTG9nZ2VyIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMb2dnZXJPcHRpb25zIHtcblxuXHQvKipcblx0ICogSWQgb2YgdGhlIGxvZ2dlci5cblx0ICovXG5cdGlkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBOYW1lIG9mIHRoZSBsb2dnZXIuXG5cdCAqL1xuXHRuYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBEbyBub3QgY3JlYXRlIHJvdGF0aW5nIGZpbGVzIGlmIG1heCBzaXplIGV4Y2VlZHMuXG5cdCAqL1xuXHRkb25vdFJvdGF0ZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIERvIG5vdCB1c2UgZm9ybWF0dGVycy5cblx0ICovXG5cdGRvbm90VXNlRm9ybWF0dGVycz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gdG8gbG9nLiBTZXQgdG8gYGFsd2F5c2AgdG8gbG9nIGFsd2F5cy5cblx0ICovXG5cdGxvZ0xldmVsPzogJ2Fsd2F5cycgfCBMb2dMZXZlbDtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgbG9nIHNob3VsZCBiZSBoaWRkZW4gZnJvbSB0aGUgdXNlci5cblx0ICovXG5cdGhpZGRlbj86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gc2hvdyB0aGlzIGxvZ2dlclxuXHQgKi9cblx0d2hlbj86IHN0cmluZztcblxuXHQvKipcblx0ICogSWQgb2YgdGhlIGV4dGVuc2lvbiB0aGF0IGNyZWF0ZWQgdGhpcyBsb2dnZXIuXG5cdCAqL1xuXHRleHRlbnNpb25JZD86IHN0cmluZztcblxuXHQvKipcblx0ICogR3JvdXAgb2YgdGhlIGxvZ2dlci5cblx0ICovXG5cdGdyb3VwPzogTG9nZ2VyR3JvdXA7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxvZ2dlclJlc291cmNlIHtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgbG9nTGV2ZWw/OiBMb2dMZXZlbDtcblx0cmVhZG9ubHkgaGlkZGVuPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd2hlbj86IHN0cmluZztcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGdyb3VwPzogTG9nZ2VyR3JvdXA7XG59XG5cbmV4cG9ydCB0eXBlIERpZENoYW5nZUxvZ2dlcnNFdmVudCA9IHtcblx0cmVhZG9ubHkgYWRkZWQ6IEl0ZXJhYmxlPElMb2dnZXJSZXNvdXJjZT47XG5cdHJlYWRvbmx5IHJlbW92ZWQ6IEl0ZXJhYmxlPElMb2dnZXJSZXNvdXJjZT47XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElMb2dnZXJTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBsb2dnZXIgZm9yIHRoZSBnaXZlbiByZXNvdXJjZSwgb3IgZ2V0cyBvbmUgaWYgaXQgYWxyZWFkeSBleGlzdHMuXG5cdCAqXG5cdCAqIFRoaXMgd2lsbCBhbHNvIHJlZ2lzdGVyIHRoZSBsb2dnZXIgd2l0aCB0aGUgbG9nZ2VyIHNlcnZpY2UuXG5cdCAqL1xuXHRjcmVhdGVMb2dnZXIocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElMb2dnZXJPcHRpb25zKTogSUxvZ2dlcjtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIGxvZ2dlciB3aXRoIHRoZSBnaXZlbiBpZCBpbiB0aGUgbG9ncyBmb2xkZXIsIG9yIGdldHMgb25lIGlmIGl0IGFscmVhZHkgZXhpc3RzLlxuXHQgKlxuXHQgKiBUaGlzIHdpbGwgYWxzbyByZWdpc3RlciB0aGUgbG9nZ2VyIHdpdGggdGhlIGxvZ2dlciBzZXJ2aWNlLlxuXHQgKi9cblx0Y3JlYXRlTG9nZ2VyKGlkOiBzdHJpbmcsIG9wdGlvbnM/OiBPbWl0PElMb2dnZXJPcHRpb25zLCAnaWQnPik6IElMb2dnZXI7XG5cblx0LyoqXG5cdCAqIEdldHMgYW4gZXhpc3RpbmcgbG9nZ2VyLCBpZiBhbnkuXG5cdCAqL1xuXHRnZXRMb2dnZXIocmVzb3VyY2VPcklkOiBVUkkgfCBzdHJpbmcpOiBJTG9nZ2VyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuIHRoZSBsb2cgbGV2ZWwgb2YgYSBsb2dnZXIgaGFzIGNoYW5nZWRcblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9nTGV2ZWw6IEV2ZW50PExvZ0xldmVsIHwgW1VSSSwgTG9nTGV2ZWxdPjtcblxuXHQvKipcblx0ICogU2V0IGRlZmF1bHQgbG9nIGxldmVsLlxuXHQgKi9cblx0c2V0TG9nTGV2ZWwobGV2ZWw6IExvZ0xldmVsKTogdm9pZDtcblxuXHQvKipcblx0ICogU2V0IGxvZyBsZXZlbCBmb3IgYSBsb2dnZXIuXG5cdCAqL1xuXHRzZXRMb2dMZXZlbChyZXNvdXJjZTogVVJJLCBsZXZlbDogTG9nTGV2ZWwpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBHZXQgbG9nIGxldmVsIGZvciBhIGxvZ2dlciBvciB0aGUgZGVmYXVsdCBsb2cgbGV2ZWwuXG5cdCAqL1xuXHRnZXRMb2dMZXZlbChyZXNvdXJjZT86IFVSSSk6IExvZ0xldmVsO1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuIHRoZSB2aXNpYmlsaXR5IG9mIGEgbG9nZ2VyIGhhcyBjaGFuZ2VkXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50PFtVUkksIGJvb2xlYW5dPjtcblxuXHQvKipcblx0ICogU2V0IHRoZSB2aXNpYmlsaXR5IG9mIGEgbG9nZ2VyLlxuXHQgKi9cblx0c2V0VmlzaWJpbGl0eShyZXNvdXJjZU9ySWQ6IFVSSSB8IHN0cmluZywgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHdoaWNoIGZpcmVzIHdoZW4gdGhlIGxvZ2dlciByZXNvdXJjZXMgYXJlIGNoYW5nZWRcblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9nZ2VyczogRXZlbnQ8RGlkQ2hhbmdlTG9nZ2Vyc0V2ZW50PjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBsb2dnZXIgd2l0aCB0aGUgbG9nZ2VyIHNlcnZpY2UuXG5cdCAqXG5cdCAqIE5vdGUgdGhhdCB0aGlzIHdpbGwgbm90IGNyZWF0ZSBhIGxvZ2dlciwgYnV0IG9ubHkgcmVnaXN0ZXIgaXQuXG5cdCAqXG5cdCAqIFVzZSBgY3JlYXRlTG9nZ2VyYCB0byBjcmVhdGUgYSBsb2dnZXIgYW5kIHJlZ2lzdGVyIGl0LlxuXHQgKlxuXHQgKiBVc2UgaXQgd2hlbiB5b3Ugd2FudCB0byByZWdpc3RlciBhIGxvZ2dlciB0aGF0IGlzIG5vdCBjcmVhdGVkIGJ5IHRoZSBsb2dnZXIgc2VydmljZS5cblx0ICovXG5cdHJlZ2lzdGVyTG9nZ2VyKHJlc291cmNlOiBJTG9nZ2VyUmVzb3VyY2UpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBEZXJlZ2lzdGVyIHRoZSBsb2dnZXIgZm9yIHRoZSBnaXZlbiByZXNvdXJjZS5cblx0ICovXG5cdGRlcmVnaXN0ZXJMb2dnZXIoaWRPclJlc291cmNlOiBVUkkgfCBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBHZXQgYWxsIHJlZ2lzdGVyZWQgbG9nZ2Vyc1xuXHQgKi9cblx0Z2V0UmVnaXN0ZXJlZExvZ2dlcnMoKTogSXRlcmFibGU8SUxvZ2dlclJlc291cmNlPjtcblxuXHQvKipcblx0ICogR2V0IHRoZSByZWdpc3RlcmVkIGxvZ2dlciBmb3IgdGhlIGdpdmVuIHJlc291cmNlLlxuXHQgKi9cblx0Z2V0UmVnaXN0ZXJlZExvZ2dlcihyZXNvdXJjZTogVVJJKTogSUxvZ2dlclJlc291cmNlIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RMb2dnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxvZ2dlciB7XG5cblx0cHJpdmF0ZSBsZXZlbDogTG9nTGV2ZWwgPSBERUZBVUxUX0xPR19MRVZFTDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMb2dMZXZlbDogRW1pdHRlcjxMb2dMZXZlbD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxMb2dMZXZlbD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZUxvZ0xldmVsKCk6IEV2ZW50PExvZ0xldmVsPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUxvZ0xldmVsLmV2ZW50OyB9XG5cblx0c2V0TGV2ZWwobGV2ZWw6IExvZ0xldmVsKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGV2ZWwgIT09IGxldmVsKSB7XG5cdFx0XHR0aGlzLmxldmVsID0gbGV2ZWw7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxvZ0xldmVsLmZpcmUodGhpcy5sZXZlbCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TGV2ZWwoKTogTG9nTGV2ZWwge1xuXHRcdHJldHVybiB0aGlzLmxldmVsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNoZWNrTG9nTGV2ZWwobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNhbkxvZyh0aGlzLmxldmVsLCBsZXZlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY2FuTG9nKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNoZWNrTG9nTGV2ZWwobGV2ZWwpO1xuXHR9XG5cblx0YWJzdHJhY3QgdHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xuXHRhYnN0cmFjdCBkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG5cdGFic3RyYWN0IGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xuXHRhYnN0cmFjdCB3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcblx0YWJzdHJhY3QgZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG5cdGFic3RyYWN0IGZsdXNoKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdE1lc3NhZ2VMb2dnZXIgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlciBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbG9nQWx3YXlzPzogYm9vbGVhbikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY2hlY2tMb2dMZXZlbChsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5sb2dBbHdheXMgfHwgc3VwZXIuY2hlY2tMb2dMZXZlbChsZXZlbCk7XG5cdH1cblxuXHR0cmFjZShtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5UcmFjZSkpIHtcblx0XHRcdHRoaXMubG9nKExvZ0xldmVsLlRyYWNlLCBmb3JtYXQoW21lc3NhZ2UsIC4uLmFyZ3NdLCB0cnVlKSk7XG5cdFx0fVxuXHR9XG5cblx0ZGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuRGVidWcpKSB7XG5cdFx0XHR0aGlzLmxvZyhMb2dMZXZlbC5EZWJ1ZywgZm9ybWF0KFttZXNzYWdlLCAuLi5hcmdzXSkpO1xuXHRcdH1cblx0fVxuXG5cdGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuSW5mbykpIHtcblx0XHRcdHRoaXMubG9nKExvZ0xldmVsLkluZm8sIGZvcm1hdChbbWVzc2FnZSwgLi4uYXJnc10pKTtcblx0XHR9XG5cdH1cblxuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLldhcm5pbmcpKSB7XG5cdFx0XHR0aGlzLmxvZyhMb2dMZXZlbC5XYXJuaW5nLCBmb3JtYXQoW21lc3NhZ2UsIC4uLmFyZ3NdKSk7XG5cdFx0fVxuXHR9XG5cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5FcnJvcikpIHtcblx0XHRcdGlmIChtZXNzYWdlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgYXJyYXkgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXHRcdFx0XHRhcnJheVswXSA9IG1lc3NhZ2Uuc3RhY2s7XG5cdFx0XHRcdHRoaXMubG9nKExvZ0xldmVsLkVycm9yLCBmb3JtYXQoYXJyYXkpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nKExvZ0xldmVsLkVycm9yLCBmb3JtYXQoW21lc3NhZ2UsIC4uLmFyZ3NdKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zmx1c2goKTogdm9pZCB7IH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgbG9nKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nKTogdm9pZDtcbn1cblxuXG5leHBvcnQgY2xhc3MgQ29uc29sZU1haW5Mb2dnZXIgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlciBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdHByaXZhdGUgdXNlQ29sb3JzOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGxvZ0xldmVsOiBMb2dMZXZlbCA9IERFRkFVTFRfTE9HX0xFVkVMKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNldExldmVsKGxvZ0xldmVsKTtcblx0XHR0aGlzLnVzZUNvbG9ycyA9ICFpc1dpbmRvd3M7XG5cdH1cblxuXHR0cmFjZShtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5UcmFjZSkpIHtcblx0XHRcdGlmICh0aGlzLnVzZUNvbG9ycykge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsIGBcXHgxYls5MG1bbWFpbiAke25vdygpfV1cXHgxYlswbWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdsb2cnLCBgW21haW4gJHtub3coKX1dYCwgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuRGVidWcpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdsb2cnLCBgXFx4MWJbOTBtW21haW4gJHtub3coKX1dXFx4MWJbMG1gLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgYFttYWluICR7bm93KCl9XWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuSW5mbykpIHtcblx0XHRcdGlmICh0aGlzLnVzZUNvbG9ycykge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsIGBcXHgxYls5MG1bbWFpbiAke25vdygpfV1cXHgxYlswbWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdsb2cnLCBgW21haW4gJHtub3coKX1dYCwgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0d2FybihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLldhcm5pbmcpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCd3YXJuJywgYFxceDFiWzkzbVttYWluICR7bm93KCl9XVxceDFiWzBtYCwgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ3dhcm4nLCBgW21haW4gJHtub3coKX1dYCwgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuRXJyb3IpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdlcnJvcicsIGBcXHgxYls5MW1bbWFpbiAke25vdygpfV1cXHgxYlswbWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdlcnJvcicsIGBbbWFpbiAke25vdygpfV1gLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmbHVzaCgpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgQ29uc29sZUxvZ2dlciBleHRlbmRzIEFic3RyYWN0TG9nZ2VyIGltcGxlbWVudHMgSUxvZ2dlciB7XG5cblx0Y29uc3RydWN0b3IobG9nTGV2ZWw6IExvZ0xldmVsID0gREVGQVVMVF9MT0dfTEVWRUwsIHByaXZhdGUgcmVhZG9ubHkgdXNlQ29sb3JzOiBib29sZWFuID0gdHJ1ZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXRMZXZlbChsb2dMZXZlbCk7XG5cdH1cblxuXHR0cmFjZShtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5UcmFjZSkpIHtcblx0XHRcdGlmICh0aGlzLnVzZUNvbG9ycykge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsICclY1RSQUNFJywgJ2NvbG9yOiAjODg4JywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkRlYnVnKSkge1xuXHRcdFx0aWYgKHRoaXMudXNlQ29sb3JzKSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgJyVjREVCVUcnLCAnYmFja2dyb3VuZDogI2VlZTsgY29sb3I6ICM4ODgnLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5JbmZvKSkge1xuXHRcdFx0aWYgKHRoaXMudXNlQ29sb3JzKSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgJyVjIElORk8nLCAnY29sb3I6ICMzM2YnLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0d2FybihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLldhcm5pbmcpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCd3YXJuJywgJyVjIFdBUk4nLCAnY29sb3I6ICM5OTMnLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuRXJyb3IpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdlcnJvcicsICclYyAgRVJSJywgJ2NvbG9yOiAjZjMzJywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2Vycm9yJywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblxuXHRmbHVzaCgpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFkYXB0ZXJMb2dnZXIgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlciBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgYWRhcHRlcjogeyBsb2c6IChsb2dMZXZlbDogTG9nTGV2ZWwsIGFyZ3M6IGFueVtdKSA9PiB2b2lkIH0sIGxvZ0xldmVsOiBMb2dMZXZlbCA9IERFRkFVTFRfTE9HX0xFVkVMKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnNldExldmVsKGxvZ0xldmVsKTtcblx0fVxuXG5cdHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLlRyYWNlKSkge1xuXHRcdFx0dGhpcy5hZGFwdGVyLmxvZyhMb2dMZXZlbC5UcmFjZSwgW3RoaXMuZXh0cmFjdE1lc3NhZ2UobWVzc2FnZSksIC4uLmFyZ3NdKTtcblx0XHR9XG5cdH1cblxuXHRkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5EZWJ1ZykpIHtcblx0XHRcdHRoaXMuYWRhcHRlci5sb2coTG9nTGV2ZWwuRGVidWcsIFt0aGlzLmV4dHJhY3RNZXNzYWdlKG1lc3NhZ2UpLCAuLi5hcmdzXSk7XG5cdFx0fVxuXHR9XG5cblx0aW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5JbmZvKSkge1xuXHRcdFx0dGhpcy5hZGFwdGVyLmxvZyhMb2dMZXZlbC5JbmZvLCBbdGhpcy5leHRyYWN0TWVzc2FnZShtZXNzYWdlKSwgLi4uYXJnc10pO1xuXHRcdH1cblx0fVxuXG5cdHdhcm4obWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5XYXJuaW5nKSkge1xuXHRcdFx0dGhpcy5hZGFwdGVyLmxvZyhMb2dMZXZlbC5XYXJuaW5nLCBbdGhpcy5leHRyYWN0TWVzc2FnZShtZXNzYWdlKSwgLi4uYXJnc10pO1xuXHRcdH1cblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuRXJyb3IpKSB7XG5cdFx0XHR0aGlzLmFkYXB0ZXIubG9nKExvZ0xldmVsLkVycm9yLCBbdGhpcy5leHRyYWN0TWVzc2FnZShtZXNzYWdlKSwgLi4uYXJnc10pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZXh0cmFjdE1lc3NhZ2UobXNnOiBzdHJpbmcgfCBFcnJvcik6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiBtc2cgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gbXNnO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b0Vycm9yTWVzc2FnZShtc2csIHRoaXMuY2FuTG9nKExvZ0xldmVsLlRyYWNlKSk7XG5cdH1cblxuXHRmbHVzaCgpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE11bHRpcGxleExvZ2dlciBleHRlbmRzIEFic3RyYWN0TG9nZ2VyIGltcGxlbWVudHMgSUxvZ2dlciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBsb2dnZXJzOiBSZWFkb25seUFycmF5PElMb2dnZXI+KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAobG9nZ2Vycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc2V0TGV2ZWwobG9nZ2Vyc1swXS5nZXRMZXZlbCgpKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZXRMZXZlbChsZXZlbDogTG9nTGV2ZWwpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGxvZ2dlciBvZiB0aGlzLmxvZ2dlcnMpIHtcblx0XHRcdGxvZ2dlci5zZXRMZXZlbChsZXZlbCk7XG5cdFx0fVxuXHRcdHN1cGVyLnNldExldmVsKGxldmVsKTtcblx0fVxuXG5cdHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsb2dnZXIgb2YgdGhpcy5sb2dnZXJzKSB7XG5cdFx0XHRsb2dnZXIudHJhY2UobWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0fVxuXHR9XG5cblx0ZGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGxvZ2dlciBvZiB0aGlzLmxvZ2dlcnMpIHtcblx0XHRcdGxvZ2dlci5kZWJ1ZyhtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHR9XG5cdH1cblxuXHRpbmZvKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsb2dnZXIgb2YgdGhpcy5sb2dnZXJzKSB7XG5cdFx0XHRsb2dnZXIuaW5mbyhtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHR9XG5cdH1cblxuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsb2dnZXIgb2YgdGhpcy5sb2dnZXJzKSB7XG5cdFx0XHRsb2dnZXIud2FybihtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHR9XG5cdH1cblxuXHRlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsb2dnZXIgb2YgdGhpcy5sb2dnZXJzKSB7XG5cdFx0XHRsb2dnZXIuZXJyb3IobWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0fVxuXHR9XG5cblx0Zmx1c2goKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsb2dnZXIgb2YgdGhpcy5sb2dnZXJzKSB7XG5cdFx0XHRsb2dnZXIuZmx1c2goKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbG9nZ2VyIG9mIHRoaXMubG9nZ2Vycykge1xuXHRcdFx0bG9nZ2VyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbnR5cGUgTG9nZ2VyRW50cnkgPSB7IGxvZ2dlcjogSUxvZ2dlciB8IHVuZGVmaW5lZDsgaW5mbzogTXV0YWJsZTxJTG9nZ2VyUmVzb3VyY2U+IH07XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdExvZ2dlclNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxvZ2dlclNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcnMgPSBuZXcgUmVzb3VyY2VNYXA8TG9nZ2VyRW50cnk+KCk7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VMb2dnZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBhZGRlZDogSUxvZ2dlclJlc291cmNlW107IHJlbW92ZWQ6IElMb2dnZXJSZXNvdXJjZVtdIH0+KTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMb2dnZXJzID0gdGhpcy5fb25EaWRDaGFuZ2VMb2dnZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlTG9nTGV2ZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxMb2dMZXZlbCB8IFtVUkksIExvZ0xldmVsXT4pO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvZ0xldmVsID0gdGhpcy5fb25EaWRDaGFuZ2VMb2dMZXZlbC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxbVVJJLCBib29sZWFuXT4pO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIGxvZ0xldmVsOiBMb2dMZXZlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ3NIb21lOiBVUkksXG5cdFx0bG9nZ2VyUmVzb3VyY2VzPzogSXRlcmFibGU8SUxvZ2dlclJlc291cmNlPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAobG9nZ2VyUmVzb3VyY2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGxvZ2dlclJlc291cmNlIG9mIGxvZ2dlclJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXJzLnNldChsb2dnZXJSZXNvdXJjZS5yZXNvdXJjZSwgeyBsb2dnZXI6IHVuZGVmaW5lZCwgaW5mbzogbG9nZ2VyUmVzb3VyY2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRMb2dnZXJFbnRyeShyZXNvdXJjZU9ySWQ6IFVSSSB8IHN0cmluZyk6IExvZ2dlckVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTdHJpbmcocmVzb3VyY2VPcklkKSkge1xuXHRcdFx0cmV0dXJuIFsuLi50aGlzLl9sb2dnZXJzLnZhbHVlcygpXS5maW5kKGxvZ2dlciA9PiBsb2dnZXIuaW5mby5pZCA9PT0gcmVzb3VyY2VPcklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xvZ2dlcnMuZ2V0KHJlc291cmNlT3JJZCk7XG5cdH1cblxuXHRnZXRMb2dnZXIocmVzb3VyY2VPcklkOiBVUkkgfCBzdHJpbmcpOiBJTG9nZ2VyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRMb2dnZXJFbnRyeShyZXNvdXJjZU9ySWQpPy5sb2dnZXI7XG5cdH1cblxuXHRjcmVhdGVMb2dnZXIoaWRPclJlc291cmNlOiBVUkkgfCBzdHJpbmcsIG9wdGlvbnM/OiBJTG9nZ2VyT3B0aW9ucyk6IElMb2dnZXIge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy50b1Jlc291cmNlKGlkT3JSZXNvdXJjZSk7XG5cdFx0Y29uc3QgaWQgPSBpc1N0cmluZyhpZE9yUmVzb3VyY2UpID8gaWRPclJlc291cmNlIDogKG9wdGlvbnM/LmlkID8/IGhhc2gocmVzb3VyY2UudG9TdHJpbmcoKSkudG9TdHJpbmcoMTYpKTtcblx0XHRsZXQgbG9nZ2VyID0gdGhpcy5fbG9nZ2Vycy5nZXQocmVzb3VyY2UpPy5sb2dnZXI7XG5cdFx0Y29uc3QgbG9nTGV2ZWwgPSBvcHRpb25zPy5sb2dMZXZlbCA9PT0gJ2Fsd2F5cycgPyBMb2dMZXZlbC5UcmFjZSA6IG9wdGlvbnM/LmxvZ0xldmVsO1xuXHRcdGlmICghbG9nZ2VyKSB7XG5cdFx0XHRsb2dnZXIgPSB0aGlzLmRvQ3JlYXRlTG9nZ2VyKHJlc291cmNlLCBsb2dMZXZlbCA/PyB0aGlzLmdldExvZ0xldmVsKHJlc291cmNlKSA/PyB0aGlzLmxvZ0xldmVsLCB7IC4uLm9wdGlvbnMsIGlkIH0pO1xuXHRcdH1cblx0XHRjb25zdCBsb2dnZXJFbnRyeTogTG9nZ2VyRW50cnkgPSB7XG5cdFx0XHRsb2dnZXIsXG5cdFx0XHRpbmZvOiB7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0bG9nTGV2ZWwsXG5cdFx0XHRcdG5hbWU6IG9wdGlvbnM/Lm5hbWUsXG5cdFx0XHRcdGhpZGRlbjogb3B0aW9ucz8uaGlkZGVuLFxuXHRcdFx0XHRncm91cDogb3B0aW9ucz8uZ3JvdXAsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBvcHRpb25zPy5leHRlbnNpb25JZCxcblx0XHRcdFx0d2hlbjogb3B0aW9ucz8ud2hlblxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5yZWdpc3RlckxvZ2dlcihsb2dnZXJFbnRyeS5pbmZvKTtcblx0XHQvLyBUT0RPOiBAc2FuZHkwODEgUmVtb3ZlIHRoaXMgb25jZSByZWdpc3RlckxvZ2dlciBjYW4gdGFrZSBJTG9nZ2VyXG5cdFx0dGhpcy5fbG9nZ2Vycy5zZXQocmVzb3VyY2UsIGxvZ2dlckVudHJ5KTtcblx0XHRyZXR1cm4gbG9nZ2VyO1xuXHR9XG5cblx0cHJvdGVjdGVkIHRvUmVzb3VyY2UoaWRPclJlc291cmNlOiBzdHJpbmcgfCBVUkkpOiBVUkkge1xuXHRcdHJldHVybiBpc1N0cmluZyhpZE9yUmVzb3VyY2UpID8gam9pblBhdGgodGhpcy5sb2dzSG9tZSwgYCR7aWRPclJlc291cmNlLnJlcGxhY2UoL1tcXFxcLzpcXCpcXD9cIjw+XFx8XS9nLCAnJyl9LmxvZ2ApIDogaWRPclJlc291cmNlO1xuXHR9XG5cblx0c2V0TG9nTGV2ZWwobG9nTGV2ZWw6IExvZ0xldmVsKTogdm9pZDtcblx0c2V0TG9nTGV2ZWwocmVzb3VyY2U6IFVSSSwgbG9nTGV2ZWw6IExvZ0xldmVsKTogdm9pZDtcblx0c2V0TG9nTGV2ZWwoYXJnMTogYW55LCBhcmcyPzogYW55KTogdm9pZCB7XG5cdFx0aWYgKFVSSS5pc1VyaShhcmcxKSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBhcmcxO1xuXHRcdFx0Y29uc3QgbG9nTGV2ZWwgPSBhcmcyO1xuXHRcdFx0Y29uc3QgbG9nZ2VyID0gdGhpcy5fbG9nZ2Vycy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKGxvZ2dlciAmJiBsb2dMZXZlbCAhPT0gbG9nZ2VyLmluZm8ubG9nTGV2ZWwpIHtcblx0XHRcdFx0bG9nZ2VyLmluZm8ubG9nTGV2ZWwgPSBsb2dMZXZlbCA9PT0gdGhpcy5sb2dMZXZlbCA/IHVuZGVmaW5lZCA6IGxvZ0xldmVsO1xuXHRcdFx0XHRsb2dnZXIubG9nZ2VyPy5zZXRMZXZlbChsb2dMZXZlbCk7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlcnMuc2V0KGxvZ2dlci5pbmZvLnJlc291cmNlLCBsb2dnZXIpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxvZ0xldmVsLmZpcmUoW3Jlc291cmNlLCBsb2dMZXZlbF0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ0xldmVsID0gYXJnMTtcblx0XHRcdGZvciAoY29uc3QgW3Jlc291cmNlLCBsb2dnZXJdIG9mIHRoaXMuX2xvZ2dlcnMuZW50cmllcygpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9sb2dnZXJzLmdldChyZXNvdXJjZSk/LmluZm8ubG9nTGV2ZWwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGxvZ2dlci5sb2dnZXI/LnNldExldmVsKHRoaXMubG9nTGV2ZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxvZ0xldmVsLmZpcmUodGhpcy5sb2dMZXZlbCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0VmlzaWJpbGl0eShyZXNvdXJjZU9ySWQ6IFVSSSB8IHN0cmluZywgdmlzaWJpbGl0eTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGxvZ2dlciA9IHRoaXMuZ2V0TG9nZ2VyRW50cnkocmVzb3VyY2VPcklkKTtcblx0XHRpZiAobG9nZ2VyICYmIHZpc2liaWxpdHkgIT09ICFsb2dnZXIuaW5mby5oaWRkZW4pIHtcblx0XHRcdGxvZ2dlci5pbmZvLmhpZGRlbiA9ICF2aXNpYmlsaXR5O1xuXHRcdFx0dGhpcy5fbG9nZ2Vycy5zZXQobG9nZ2VyLmluZm8ucmVzb3VyY2UsIGxvZ2dlcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZShbbG9nZ2VyLmluZm8ucmVzb3VyY2UsIHZpc2liaWxpdHldKTtcblx0XHR9XG5cdH1cblxuXHRnZXRMb2dMZXZlbChyZXNvdXJjZT86IFVSSSk6IExvZ0xldmVsIHtcblx0XHRsZXQgbG9nTGV2ZWw7XG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRsb2dMZXZlbCA9IHRoaXMuX2xvZ2dlcnMuZ2V0KHJlc291cmNlKT8uaW5mby5sb2dMZXZlbDtcblx0XHR9XG5cdFx0cmV0dXJuIGxvZ0xldmVsID8/IHRoaXMubG9nTGV2ZWw7XG5cdH1cblxuXHRyZWdpc3RlckxvZ2dlcihyZXNvdXJjZTogSUxvZ2dlclJlc291cmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9sb2dnZXJzLmdldChyZXNvdXJjZS5yZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRpZiAoZXhpc3RpbmcuaW5mby5oaWRkZW4gIT09IHJlc291cmNlLmhpZGRlbikge1xuXHRcdFx0XHR0aGlzLnNldFZpc2liaWxpdHkocmVzb3VyY2UucmVzb3VyY2UsICFyZXNvdXJjZS5oaWRkZW4pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sb2dnZXJzLnNldChyZXNvdXJjZS5yZXNvdXJjZSwgeyBpbmZvOiByZXNvdXJjZSwgbG9nZ2VyOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxvZ2dlcnMuZmlyZSh7IGFkZGVkOiBbcmVzb3VyY2VdLCByZW1vdmVkOiBbXSB9KTtcblx0XHR9XG5cdH1cblxuXHRkZXJlZ2lzdGVyTG9nZ2VyKGlkT3JSZXNvdXJjZTogVVJJIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnRvUmVzb3VyY2UoaWRPclJlc291cmNlKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2xvZ2dlcnMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGlmIChleGlzdGluZy5sb2dnZXIpIHtcblx0XHRcdFx0ZXhpc3RpbmcubG9nZ2VyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ2dlcnMuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTG9nZ2Vycy5maXJlKHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbZXhpc3RpbmcuaW5mb10gfSk7XG5cdFx0fVxuXHR9XG5cblx0KmdldFJlZ2lzdGVyZWRMb2dnZXJzKCk6IEl0ZXJhYmxlPElMb2dnZXJSZXNvdXJjZT4ge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fbG9nZ2Vycy52YWx1ZXMoKSkge1xuXHRcdFx0eWllbGQgZW50cnkuaW5mbztcblx0XHR9XG5cdH1cblxuXHRnZXRSZWdpc3RlcmVkTG9nZ2VyKHJlc291cmNlOiBVUkkpOiBJTG9nZ2VyUmVzb3VyY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sb2dnZXJzLmdldChyZXNvdXJjZSk/LmluZm87XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlcnMuZm9yRWFjaChsb2dnZXIgPT4gbG9nZ2VyLmxvZ2dlcj8uZGlzcG9zZSgpKTtcblx0XHR0aGlzLl9sb2dnZXJzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGRvQ3JlYXRlTG9nZ2VyKHJlc291cmNlOiBVUkksIGxvZ0xldmVsOiBMb2dMZXZlbCwgb3B0aW9ucz86IElMb2dnZXJPcHRpb25zKTogSUxvZ2dlcjtcbn1cblxuZXhwb3J0IGNsYXNzIE51bGxMb2dnZXIgaW1wbGVtZW50cyBJTG9nZ2VyIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMb2dMZXZlbDogRXZlbnQ8TG9nTGV2ZWw+ID0gbmV3IEVtaXR0ZXI8TG9nTGV2ZWw+KCkuZXZlbnQ7XG5cdHNldExldmVsKGxldmVsOiBMb2dMZXZlbCk6IHZvaWQgeyB9XG5cdGdldExldmVsKCk6IExvZ0xldmVsIHsgcmV0dXJuIExvZ0xldmVsLkluZm87IH1cblx0dHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHsgfVxuXHRkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQgeyB9XG5cdGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHsgfVxuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7IH1cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQgeyB9XG5cdGNyaXRpY2FsKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHsgfVxuXHRkaXNwb3NlKCk6IHZvaWQgeyB9XG5cdGZsdXNoKCk6IHZvaWQgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBOdWxsTG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dnZXIgaW1wbGVtZW50cyBJTG9nU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgTnVsbExvZ2dlclNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlclNlcnZpY2Uge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihMb2dMZXZlbC5PZmYsIFVSSS5wYXJzZSgnbG9nOi8vL2xvZycpKTtcblx0fVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZG9DcmVhdGVMb2dnZXIocmVzb3VyY2U6IFVSSSwgbG9nTGV2ZWw6IExvZ0xldmVsLCBvcHRpb25zPzogSUxvZ2dlck9wdGlvbnMpOiBJTG9nZ2VyIHtcblx0XHRyZXR1cm4gbmV3IE51bGxMb2dnZXIoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TG9nTGV2ZWwoZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlKTogTG9nTGV2ZWwge1xuXHRpZiAoZW52aXJvbm1lbnRTZXJ2aWNlLnZlcmJvc2UpIHtcblx0XHRyZXR1cm4gTG9nTGV2ZWwuVHJhY2U7XG5cdH1cblx0aWYgKHR5cGVvZiBlbnZpcm9ubWVudFNlcnZpY2UubG9nTGV2ZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0Y29uc3QgbG9nTGV2ZWwgPSBwYXJzZUxvZ0xldmVsKGVudmlyb25tZW50U2VydmljZS5sb2dMZXZlbC50b0xvd2VyQ2FzZSgpKTtcblx0XHRpZiAobG9nTGV2ZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGxvZ0xldmVsO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gREVGQVVMVF9MT0dfTEVWRUw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBMb2dMZXZlbFRvU3RyaW5nKGxvZ0xldmVsOiBMb2dMZXZlbCk6IHN0cmluZyB7XG5cdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRjYXNlIExvZ0xldmVsLlRyYWNlOiByZXR1cm4gJ3RyYWNlJztcblx0XHRjYXNlIExvZ0xldmVsLkRlYnVnOiByZXR1cm4gJ2RlYnVnJztcblx0XHRjYXNlIExvZ0xldmVsLkluZm86IHJldHVybiAnaW5mbyc7XG5cdFx0Y2FzZSBMb2dMZXZlbC5XYXJuaW5nOiByZXR1cm4gJ3dhcm4nO1xuXHRcdGNhc2UgTG9nTGV2ZWwuRXJyb3I6IHJldHVybiAnZXJyb3InO1xuXHRcdGNhc2UgTG9nTGV2ZWwuT2ZmOiByZXR1cm4gJ29mZic7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIExvZ0xldmVsVG9Mb2NhbGl6ZWRTdHJpbmcobG9nTGV2ZWw6IExvZ0xldmVsKTogSUxvY2FsaXplZFN0cmluZyB7XG5cdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRjYXNlIExvZ0xldmVsLlRyYWNlOiByZXR1cm4geyBvcmlnaW5hbDogJ1RyYWNlJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgndHJhY2UnLCBcIlRyYWNlXCIpIH07XG5cdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1ZzogcmV0dXJuIHsgb3JpZ2luYWw6ICdEZWJ1ZycsIHZhbHVlOiBubHMubG9jYWxpemUoJ2RlYnVnJywgXCJEZWJ1Z1wiKSB9O1xuXHRcdGNhc2UgTG9nTGV2ZWwuSW5mbzogcmV0dXJuIHsgb3JpZ2luYWw6ICdJbmZvJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnaW5mbycsIFwiSW5mb1wiKSB9O1xuXHRcdGNhc2UgTG9nTGV2ZWwuV2FybmluZzogcmV0dXJuIHsgb3JpZ2luYWw6ICdXYXJuaW5nJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnd2FybicsIFwiV2FybmluZ1wiKSB9O1xuXHRcdGNhc2UgTG9nTGV2ZWwuRXJyb3I6IHJldHVybiB7IG9yaWdpbmFsOiAnRXJyb3InLCB2YWx1ZTogbmxzLmxvY2FsaXplKCdlcnJvcicsIFwiRXJyb3JcIikgfTtcblx0XHRjYXNlIExvZ0xldmVsLk9mZjogcmV0dXJuIHsgb3JpZ2luYWw6ICdPZmYnLCB2YWx1ZTogbmxzLmxvY2FsaXplKCdvZmYnLCBcIk9mZlwiKSB9O1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxvZ0xldmVsKGxvZ0xldmVsOiBzdHJpbmcpOiBMb2dMZXZlbCB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAobG9nTGV2ZWwpIHtcblx0XHRjYXNlICd0cmFjZSc6XG5cdFx0XHRyZXR1cm4gTG9nTGV2ZWwuVHJhY2U7XG5cdFx0Y2FzZSAnZGVidWcnOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLkRlYnVnO1xuXHRcdGNhc2UgJ2luZm8nOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLkluZm87XG5cdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRyZXR1cm4gTG9nTGV2ZWwuV2FybmluZztcblx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRyZXR1cm4gTG9nTGV2ZWwuRXJyb3I7XG5cdFx0Y2FzZSAnY3JpdGljYWwnOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLkVycm9yO1xuXHRcdGNhc2UgJ29mZic6XG5cdFx0XHRyZXR1cm4gTG9nTGV2ZWwuT2ZmO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8vIENvbnRleHRzXG5leHBvcnQgY29uc3QgQ09OVEVYVF9MT0dfTEVWRUwgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdsb2dMZXZlbCcsIExvZ0xldmVsVG9TdHJpbmcoTG9nTGV2ZWwuSW5mbykpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWtCLFVBQVUsZ0JBQWdCO0FBQzVDLFNBQVMsV0FBVztBQUVwQixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLHVCQUF1QjtBQUV6QixNQUFNLGNBQWMsZ0JBQTZCLFlBQVk7QUFDN0QsTUFBTSxpQkFBaUIsZ0JBQWdDLGVBQWU7QUFFN0UsU0FBUyxNQUFjO0FBQ3RCLFVBQU8sb0JBQUksS0FBSyxHQUFFLFlBQVk7QUFD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RCxVQUFNLFdBQVcsY0FBYyxtQkFBbUIsU0FBUyxZQUFZLENBQUM7QUFDeEUsUUFBSSxhQUFhLFFBQVc7QUFDM0IsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRU8sU0FBUyxpQkFBaUIsVUFBNEI7QUFDNUQsVUFBUSxVQUFVO0FBQUEsSUFDakIsS0FBSztBQUFnQixhQUFPO0FBQUEsSUFDNUIsS0FBSztBQUFnQixhQUFPO0FBQUEsSUFDNUIsS0FBSztBQUFlLGFBQU87QUFBQSxJQUMzQixLQUFLO0FBQWtCLGFBQU87QUFBQSxJQUM5QixLQUFLO0FBQWdCLGFBQU87QUFBQSxJQUM1QixLQUFLO0FBQWMsYUFBTztBQUFBLEVBQzNCO0FBQ0Q7QUFFTyxTQUFTLDBCQUEwQixVQUFzQztBQUMvRSxVQUFRLFVBQVU7QUFBQSxJQUNqQixLQUFLO0FBQWdCLGFBQU8sRUFBRSxVQUFVLFNBQVMsT0FBTyxJQUFJLFNBQVMsU0FBUyxPQUFPLEVBQUU7QUFBQSxJQUN2RixLQUFLO0FBQWdCLGFBQU8sRUFBRSxVQUFVLFNBQVMsT0FBTyxJQUFJLFNBQVMsU0FBUyxPQUFPLEVBQUU7QUFBQSxJQUN2RixLQUFLO0FBQWUsYUFBTyxFQUFFLFVBQVUsUUFBUSxPQUFPLElBQUksU0FBUyxRQUFRLE1BQU0sRUFBRTtBQUFBLElBQ25GLEtBQUs7QUFBa0IsYUFBTyxFQUFFLFVBQVUsV0FBVyxPQUFPLElBQUksU0FBUyxRQUFRLFNBQVMsRUFBRTtBQUFBLElBQzVGLEtBQUs7QUFBZ0IsYUFBTyxFQUFFLFVBQVUsU0FBUyxPQUFPLElBQUksU0FBUyxTQUFTLE9BQU8sRUFBRTtBQUFBLElBQ3ZGLEtBQUs7QUFBYyxhQUFPLEVBQUUsVUFBVSxPQUFPLE9BQU8sSUFBSSxTQUFTLE9BQU8sS0FBSyxFQUFFO0FBQUEsRUFDaEY7QUFDRDtBQUVPLFNBQVMsY0FBYyxVQUF3QztBQUNyRSxVQUFRLFVBQVU7QUFBQSxJQUNqQixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLEVBQ1Q7QUFDQSxTQUFPO0FBQ1I7QUFHTyxNQUFNLG9CQUFvQixJQUFJLGNBQXNCLFlBQVksaUJBQWlCLFlBQWEsQ0FBQzsiLAogICJuYW1lcyI6IFsiTG9nTGV2ZWwiXQp9Cg==
