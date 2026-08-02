import * as nls from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import { Platform } from "../../../../base/common/platform.js";
import * as Types from "../../../../base/common/types.js";
import * as UUID from "../../../../base/common/uuid.js";
import {
  ProblemMatcherParser,
  isNamedProblemMatcher,
  ProblemMatcherRegistry
} from "./problemMatcher.js";
import * as Tasks from "./tasks.js";
import { TaskDefinitionRegistry } from "./taskDefinitionRegistry.js";
import { ShellExecutionSupportedContext, ProcessExecutionSupportedContext } from "./taskService.js";
var ShellQuoting = /* @__PURE__ */ ((ShellQuoting2) => {
  ShellQuoting2[ShellQuoting2["escape"] = 1] = "escape";
  ShellQuoting2[ShellQuoting2["strong"] = 2] = "strong";
  ShellQuoting2[ShellQuoting2["weak"] = 3] = "weak";
  return ShellQuoting2;
})(ShellQuoting || {});
var ITaskIdentifier;
((ITaskIdentifier2) => {
  function is(value) {
    const candidate = value;
    return candidate !== void 0 && Types.isString(value.type);
  }
  ITaskIdentifier2.is = is;
})(ITaskIdentifier || (ITaskIdentifier = {}));
var CommandString;
((CommandString2) => {
  function value(value2) {
    if (Types.isString(value2)) {
      return value2;
    } else if (Types.isStringArray(value2)) {
      return value2.join(" ");
    } else {
      if (Types.isString(value2.value)) {
        return value2.value;
      } else {
        return value2.value.join(" ");
      }
    }
  }
  CommandString2.value = value;
})(CommandString || (CommandString = {}));
var ProblemMatcherKind = /* @__PURE__ */ ((ProblemMatcherKind2) => {
  ProblemMatcherKind2[ProblemMatcherKind2["Unknown"] = 0] = "Unknown";
  ProblemMatcherKind2[ProblemMatcherKind2["String"] = 1] = "String";
  ProblemMatcherKind2[ProblemMatcherKind2["ProblemMatcher"] = 2] = "ProblemMatcher";
  ProblemMatcherKind2[ProblemMatcherKind2["Array"] = 3] = "Array";
  return ProblemMatcherKind2;
})(ProblemMatcherKind || {});
const EMPTY_ARRAY = [];
Object.freeze(EMPTY_ARRAY);
function assignProperty(target, source, key) {
  const sourceAtKey = source[key];
  if (sourceAtKey !== void 0) {
    target[key] = sourceAtKey;
  }
}
function fillProperty(target, source, key) {
  const sourceAtKey = source[key];
  if (target[key] === void 0 && sourceAtKey !== void 0) {
    target[key] = sourceAtKey;
  }
}
function _isEmpty(value, properties, allowEmptyArray = false) {
  if (value === void 0 || value === null || properties === void 0) {
    return true;
  }
  for (const meta of properties) {
    const property = value[meta.property];
    if (property !== void 0 && property !== null) {
      if (meta.type !== void 0 && !meta.type.isEmpty(property)) {
        return false;
      } else if (!Array.isArray(property) || property.length > 0 || allowEmptyArray) {
        return false;
      }
    }
  }
  return true;
}
function _assignProperties(target, source, properties) {
  if (!source || _isEmpty(source, properties)) {
    return target;
  }
  if (!target || _isEmpty(target, properties)) {
    return source;
  }
  for (const meta of properties) {
    const property = meta.property;
    let value;
    if (meta.type !== void 0) {
      value = meta.type.assignProperties(target[property], source[property]);
    } else {
      value = source[property];
    }
    if (value !== void 0 && value !== null) {
      target[property] = value;
    }
  }
  return target;
}
function _fillProperties(target, source, properties, allowEmptyArray = false) {
  if (!source || _isEmpty(source, properties)) {
    return target;
  }
  if (!target || _isEmpty(target, properties, allowEmptyArray)) {
    return source;
  }
  for (const meta of properties) {
    const property = meta.property;
    let value;
    if (meta.type) {
      value = meta.type.fillProperties(target[property], source[property]);
    } else if (target[property] === void 0) {
      value = source[property];
    }
    if (value !== void 0 && value !== null) {
      target[property] = value;
    }
  }
  return target;
}
function _fillDefaults(target, defaults, properties, context) {
  if (target && Object.isFrozen(target)) {
    return target;
  }
  if (target === void 0 || target === null || defaults === void 0 || defaults === null) {
    if (defaults !== void 0 && defaults !== null) {
      return Objects.deepClone(defaults);
    } else {
      return void 0;
    }
  }
  for (const meta of properties) {
    const property = meta.property;
    if (target[property] !== void 0) {
      continue;
    }
    let value;
    if (meta.type) {
      value = meta.type.fillDefaults(target[property], context);
    } else {
      value = defaults[property];
    }
    if (value !== void 0 && value !== null) {
      target[property] = value;
    }
  }
  return target;
}
function _freeze(target, properties) {
  if (target === void 0 || target === null) {
    return void 0;
  }
  if (Object.isFrozen(target)) {
    return target;
  }
  for (const meta of properties) {
    if (meta.type) {
      const value = target[meta.property];
      if (value) {
        meta.type.freeze(value);
      }
    }
  }
  Object.freeze(target);
  return target;
}
var RunOnOptions;
((RunOnOptions2) => {
  function fromString(value) {
    if (!value) {
      return Tasks.RunOnOptions.default;
    }
    switch (value.toLowerCase()) {
      case "folderopen":
        return Tasks.RunOnOptions.folderOpen;
      case "worktreecreated":
        return Tasks.RunOnOptions.worktreeCreated;
      case "default":
      default:
        return Tasks.RunOnOptions.default;
    }
  }
  RunOnOptions2.fromString = fromString;
})(RunOnOptions || (RunOnOptions = {}));
var RunOptions;
((RunOptions2) => {
  const properties = [{ property: "reevaluateOnRerun" }, { property: "runOn" }, { property: "instanceLimit" }, { property: "instancePolicy" }];
  function fromConfiguration(value) {
    return {
      reevaluateOnRerun: value ? value.reevaluateOnRerun : true,
      runOn: value ? RunOnOptions.fromString(value.runOn) : Tasks.RunOnOptions.default,
      instanceLimit: value?.instanceLimit ? Math.max(value.instanceLimit, 1) : 1,
      instancePolicy: value ? InstancePolicy.fromString(value.instancePolicy) : Tasks.InstancePolicy.prompt
    };
  }
  RunOptions2.fromConfiguration = fromConfiguration;
  function assignProperties(target, source) {
    return _assignProperties(target, source, properties);
  }
  RunOptions2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties);
  }
  RunOptions2.fillProperties = fillProperties;
})(RunOptions || (RunOptions = {}));
var InstancePolicy;
((InstancePolicy2) => {
  function fromString(value) {
    if (!value) {
      return Tasks.InstancePolicy.prompt;
    }
    switch (value.toLowerCase()) {
      case "terminatenewest":
        return Tasks.InstancePolicy.terminateNewest;
      case "terminateoldest":
        return Tasks.InstancePolicy.terminateOldest;
      case "warn":
        return Tasks.InstancePolicy.warn;
      case "silent":
        return Tasks.InstancePolicy.silent;
      case "prompt":
      default:
        return Tasks.InstancePolicy.prompt;
    }
  }
  InstancePolicy2.fromString = fromString;
})(InstancePolicy || (InstancePolicy = {}));
var ShellConfiguration;
((ShellConfiguration2) => {
  const properties = [{ property: "executable" }, { property: "args" }, { property: "quoting" }];
  function is(value) {
    const candidate = value;
    return candidate && (Types.isString(candidate.executable) || Types.isStringArray(candidate.args));
  }
  ShellConfiguration2.is = is;
  function from(config, context) {
    if (!is(config)) {
      return void 0;
    }
    const result = {};
    if (config.executable !== void 0) {
      result.executable = config.executable;
    }
    if (config.args !== void 0) {
      result.args = config.args.slice();
    }
    if (config.quoting !== void 0) {
      result.quoting = Objects.deepClone(config.quoting);
    }
    return result;
  }
  ShellConfiguration2.from = from;
  function isEmpty(value) {
    return _isEmpty(value, properties, true);
  }
  ShellConfiguration2.isEmpty = isEmpty;
  function assignProperties(target, source) {
    return _assignProperties(target, source, properties);
  }
  ShellConfiguration2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties, true);
  }
  ShellConfiguration2.fillProperties = fillProperties;
  function fillDefaults(value, context) {
    return value;
  }
  ShellConfiguration2.fillDefaults = fillDefaults;
  function freeze(value) {
    if (!value) {
      return void 0;
    }
    return Object.freeze(value);
  }
  ShellConfiguration2.freeze = freeze;
})(ShellConfiguration || (ShellConfiguration = {}));
var CommandOptions;
((CommandOptions2) => {
  const properties = [{ property: "cwd" }, { property: "env" }, { property: "shell", type: ShellConfiguration }];
  const defaults = { cwd: "${workspaceFolder}" };
  function from(options, context) {
    const result = {};
    if (options.cwd !== void 0) {
      if (Types.isString(options.cwd)) {
        result.cwd = options.cwd;
      } else {
        context.taskLoadIssues.push(nls.localize("ConfigurationParser.invalidCWD", "Warning: options.cwd must be of type string. Ignoring value {0}\n", options.cwd));
      }
    }
    if (options.env !== void 0) {
      result.env = Objects.deepClone(options.env);
    }
    result.shell = ShellConfiguration.from(options.shell, context);
    return isEmpty(result) ? void 0 : result;
  }
  CommandOptions2.from = from;
  function isEmpty(value) {
    return _isEmpty(value, properties);
  }
  CommandOptions2.isEmpty = isEmpty;
  function assignProperties(target, source) {
    if (source === void 0 || isEmpty(source)) {
      return target;
    }
    if (target === void 0 || isEmpty(target)) {
      return source;
    }
    assignProperty(target, source, "cwd");
    if (target.env === void 0) {
      target.env = source.env;
    } else if (source.env !== void 0) {
      const env = /* @__PURE__ */ Object.create(null);
      if (target.env !== void 0) {
        Object.keys(target.env).forEach((key) => env[key] = target.env[key]);
      }
      if (source.env !== void 0) {
        Object.keys(source.env).forEach((key) => env[key] = source.env[key]);
      }
      target.env = env;
    }
    target.shell = ShellConfiguration.assignProperties(target.shell, source.shell);
    return target;
  }
  CommandOptions2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties);
  }
  CommandOptions2.fillProperties = fillProperties;
  function fillDefaults(value, context) {
    return _fillDefaults(value, defaults, properties, context);
  }
  CommandOptions2.fillDefaults = fillDefaults;
  function freeze(value) {
    return _freeze(value, properties);
  }
  CommandOptions2.freeze = freeze;
})(CommandOptions || (CommandOptions = {}));
var CommandConfiguration;
((CommandConfiguration2) => {
  let PresentationOptions;
  ((PresentationOptions2) => {
    const properties2 = [{ property: "echo" }, { property: "reveal" }, { property: "revealProblems" }, { property: "focus" }, { property: "panel" }, { property: "showReuseMessage" }, { property: "clear" }, { property: "group" }, { property: "close" }, { property: "preserveTerminalName" }];
    function from2(config, context) {
      let echo;
      let reveal;
      let revealProblems;
      let focus;
      let panel;
      let showReuseMessage;
      let clear;
      let group;
      let close;
      let preserveTerminalName;
      let hasProps = false;
      if (Types.isBoolean(config.echoCommand)) {
        echo = config.echoCommand;
        hasProps = true;
      }
      if (Types.isString(config.showOutput)) {
        reveal = Tasks.RevealKind.fromString(config.showOutput);
        hasProps = true;
      }
      const presentation = config.presentation || config.terminal;
      if (presentation) {
        if (Types.isBoolean(presentation.echo)) {
          echo = presentation.echo;
        }
        if (Types.isString(presentation.reveal)) {
          reveal = Tasks.RevealKind.fromString(presentation.reveal);
        }
        if (Types.isString(presentation.revealProblems)) {
          revealProblems = Tasks.RevealProblemKind.fromString(presentation.revealProblems);
        }
        if (Types.isBoolean(presentation.focus)) {
          focus = presentation.focus;
        }
        if (Types.isString(presentation.panel)) {
          panel = Tasks.PanelKind.fromString(presentation.panel);
        }
        if (Types.isBoolean(presentation.showReuseMessage)) {
          showReuseMessage = presentation.showReuseMessage;
        }
        if (Types.isBoolean(presentation.clear)) {
          clear = presentation.clear;
        }
        if (Types.isString(presentation.group)) {
          group = presentation.group;
        }
        if (Types.isBoolean(presentation.close)) {
          close = presentation.close;
        }
        if (Types.isBoolean(presentation.preserveTerminalName)) {
          preserveTerminalName = presentation.preserveTerminalName;
        }
        hasProps = true;
      }
      if (!hasProps) {
        return void 0;
      }
      return { echo, reveal, revealProblems, focus, panel, showReuseMessage, clear, group, close, preserveTerminalName };
    }
    PresentationOptions2.from = from2;
    function assignProperties2(target, source) {
      return _assignProperties(target, source, properties2);
    }
    PresentationOptions2.assignProperties = assignProperties2;
    function fillProperties2(target, source) {
      return _fillProperties(target, source, properties2);
    }
    PresentationOptions2.fillProperties = fillProperties2;
    function fillDefaults2(value, context) {
      const defaultEcho = context.engine === Tasks.ExecutionEngine.Terminal ? true : false;
      return _fillDefaults(value, { echo: defaultEcho, reveal: Tasks.RevealKind.Always, revealProblems: Tasks.RevealProblemKind.Never, focus: false, panel: Tasks.PanelKind.Shared, showReuseMessage: true, clear: false, preserveTerminalName: false }, properties2, context);
    }
    PresentationOptions2.fillDefaults = fillDefaults2;
    function freeze2(value) {
      return _freeze(value, properties2);
    }
    PresentationOptions2.freeze = freeze2;
    function isEmpty2(value) {
      return _isEmpty(value, properties2);
    }
    PresentationOptions2.isEmpty = isEmpty2;
  })(PresentationOptions = CommandConfiguration2.PresentationOptions || (CommandConfiguration2.PresentationOptions = {}));
  let ShellString;
  ((ShellString2) => {
    function from2(value) {
      if (value === void 0 || value === null) {
        return void 0;
      }
      if (Types.isString(value)) {
        return value;
      } else if (Types.isStringArray(value)) {
        return value.join(" ");
      } else {
        const quoting = Tasks.ShellQuoting.from(value.quoting);
        const result = Types.isString(value.value) ? value.value : Types.isStringArray(value.value) ? value.value.join(" ") : void 0;
        if (result) {
          return {
            value: result,
            quoting
          };
        } else {
          return void 0;
        }
      }
    }
    ShellString2.from = from2;
  })(ShellString || (ShellString = {}));
  const properties = [
    { property: "runtime" },
    { property: "name" },
    { property: "options", type: CommandOptions },
    { property: "args" },
    { property: "taskSelector" },
    { property: "suppressTaskName" },
    { property: "presentation", type: PresentationOptions }
  ];
  function from(config, context) {
    let result = fromBase(config, context);
    let osConfig = void 0;
    if (config.windows && context.platform === Platform.Windows) {
      osConfig = fromBase(config.windows, context);
    } else if (config.osx && context.platform === Platform.Mac) {
      osConfig = fromBase(config.osx, context);
    } else if (config.linux && context.platform === Platform.Linux) {
      osConfig = fromBase(config.linux, context);
    }
    if (osConfig) {
      result = assignProperties(result, osConfig, context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0);
    }
    return isEmpty(result) ? void 0 : result;
  }
  CommandConfiguration2.from = from;
  function fromBase(config, context) {
    const name = ShellString.from(config.command);
    let runtime;
    if (Types.isString(config.type)) {
      if (config.type === "shell" || config.type === "process") {
        runtime = Tasks.RuntimeType.fromString(config.type);
      }
    }
    if (Types.isBoolean(config.isShellCommand) || ShellConfiguration.is(config.isShellCommand)) {
      runtime = Tasks.RuntimeType.Shell;
    } else if (config.isShellCommand !== void 0) {
      runtime = !!config.isShellCommand ? Tasks.RuntimeType.Shell : Tasks.RuntimeType.Process;
    }
    const result = {
      name,
      runtime,
      presentation: PresentationOptions.from(config, context)
    };
    if (config.args !== void 0) {
      result.args = [];
      for (const arg of config.args) {
        const converted = ShellString.from(arg);
        if (converted !== void 0) {
          result.args.push(converted);
        } else {
          context.taskLoadIssues.push(
            nls.localize(
              "ConfigurationParser.inValidArg",
              "Error: command argument must either be a string or a quoted string. Provided value is:\n{0}",
              arg ? JSON.stringify(arg, void 0, 4) : "undefined"
            )
          );
        }
      }
    }
    if (config.options !== void 0) {
      result.options = CommandOptions.from(config.options, context);
      if (result.options && result.options.shell === void 0 && ShellConfiguration.is(config.isShellCommand)) {
        result.options.shell = ShellConfiguration.from(config.isShellCommand, context);
        if (context.engine !== Tasks.ExecutionEngine.Terminal) {
          context.taskLoadIssues.push(nls.localize("ConfigurationParser.noShell", "Warning: shell configuration is only supported when executing tasks in the terminal."));
        }
      }
    }
    if (Types.isString(config.taskSelector)) {
      result.taskSelector = config.taskSelector;
    }
    if (Types.isBoolean(config.suppressTaskName)) {
      result.suppressTaskName = config.suppressTaskName;
    }
    return isEmpty(result) ? void 0 : result;
  }
  function hasCommand(value) {
    return value && !!value.name;
  }
  CommandConfiguration2.hasCommand = hasCommand;
  function isEmpty(value) {
    return _isEmpty(value, properties);
  }
  CommandConfiguration2.isEmpty = isEmpty;
  function assignProperties(target, source, overwriteArgs) {
    if (isEmpty(source)) {
      return target;
    }
    if (isEmpty(target)) {
      return source;
    }
    assignProperty(target, source, "name");
    assignProperty(target, source, "runtime");
    assignProperty(target, source, "taskSelector");
    assignProperty(target, source, "suppressTaskName");
    if (source.args !== void 0) {
      if (target.args === void 0 || overwriteArgs) {
        target.args = source.args;
      } else {
        target.args = target.args.concat(source.args);
      }
    }
    target.presentation = PresentationOptions.assignProperties(target.presentation, source.presentation);
    target.options = CommandOptions.assignProperties(target.options, source.options);
    return target;
  }
  CommandConfiguration2.assignProperties = assignProperties;
  function fillProperties(target, source) {
    return _fillProperties(target, source, properties);
  }
  CommandConfiguration2.fillProperties = fillProperties;
  function fillGlobals(target, source, taskName) {
    if (source === void 0 || isEmpty(source)) {
      return target;
    }
    target = target || {
      name: void 0,
      runtime: void 0,
      presentation: void 0
    };
    if (target.name === void 0) {
      fillProperty(target, source, "name");
      fillProperty(target, source, "taskSelector");
      fillProperty(target, source, "suppressTaskName");
      let args = source.args ? source.args.slice() : [];
      if (!target.suppressTaskName && taskName) {
        if (target.taskSelector !== void 0) {
          args.push(target.taskSelector + taskName);
        } else {
          args.push(taskName);
        }
      }
      if (target.args) {
        args = args.concat(target.args);
      }
      target.args = args;
    }
    fillProperty(target, source, "runtime");
    target.presentation = PresentationOptions.fillProperties(target.presentation, source.presentation);
    target.options = CommandOptions.fillProperties(target.options, source.options);
    return target;
  }
  CommandConfiguration2.fillGlobals = fillGlobals;
  function fillDefaults(value, context) {
    if (!value || Object.isFrozen(value)) {
      return;
    }
    if (value.name !== void 0 && value.runtime === void 0) {
      value.runtime = Tasks.RuntimeType.Process;
    }
    value.presentation = PresentationOptions.fillDefaults(value.presentation, context);
    if (!isEmpty(value)) {
      value.options = CommandOptions.fillDefaults(value.options, context);
    }
    if (value.args === void 0) {
      value.args = EMPTY_ARRAY;
    }
    if (value.suppressTaskName === void 0) {
      value.suppressTaskName = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
    }
  }
  CommandConfiguration2.fillDefaults = fillDefaults;
  function freeze(value) {
    return _freeze(value, properties);
  }
  CommandConfiguration2.freeze = freeze;
})(CommandConfiguration || (CommandConfiguration = {}));
var ProblemMatcherConverter;
((ProblemMatcherConverter2) => {
  function namedFrom(declares, context) {
    const result = /* @__PURE__ */ Object.create(null);
    if (!Array.isArray(declares)) {
      return result;
    }
    declares.forEach((value) => {
      const namedProblemMatcher = new ProblemMatcherParser(context.problemReporter).parse(value);
      if (isNamedProblemMatcher(namedProblemMatcher)) {
        result[namedProblemMatcher.name] = namedProblemMatcher;
      } else {
        context.problemReporter.error(nls.localize("ConfigurationParser.noName", "Error: Problem Matcher in declare scope must have a name:\n{0}\n", JSON.stringify(value, void 0, 4)));
      }
    });
    return result;
  }
  ProblemMatcherConverter2.namedFrom = namedFrom;
  function fromWithOsConfig(external, context) {
    let result = {};
    const osExternal = external;
    if (osExternal.windows?.problemMatcher && context.platform === Platform.Windows) {
      result = from(osExternal.windows.problemMatcher, context);
    } else if (osExternal.osx?.problemMatcher && context.platform === Platform.Mac) {
      result = from(osExternal.osx.problemMatcher, context);
    } else if (osExternal.linux?.problemMatcher && context.platform === Platform.Linux) {
      result = from(osExternal.linux.problemMatcher, context);
    } else if (external.problemMatcher) {
      result = from(external.problemMatcher, context);
    }
    return result;
  }
  ProblemMatcherConverter2.fromWithOsConfig = fromWithOsConfig;
  function from(config, context) {
    const result = [];
    if (config === void 0) {
      return { value: result };
    }
    const errors = [];
    function addResult(matcher) {
      if (matcher.value) {
        result.push(matcher.value);
      }
      if (matcher.errors) {
        errors.push(...matcher.errors);
      }
    }
    const kind = getProblemMatcherKind(config);
    if (kind === 0 /* Unknown */) {
      const error = nls.localize(
        "ConfigurationParser.unknownMatcherKind",
        "Warning: the defined problem matcher is unknown. Supported types are string | ProblemMatcher | Array<string | ProblemMatcher>.\n{0}\n",
        JSON.stringify(config, null, 4)
      );
      context.problemReporter.warn(error);
    } else if (kind === 1 /* String */ || kind === 2 /* ProblemMatcher */) {
      addResult(resolveProblemMatcher(config, context));
    } else if (kind === 3 /* Array */) {
      const problemMatchers = config;
      problemMatchers.forEach((problemMatcher) => {
        addResult(resolveProblemMatcher(problemMatcher, context));
      });
    }
    return { value: result, errors };
  }
  ProblemMatcherConverter2.from = from;
  function getProblemMatcherKind(value) {
    if (Types.isString(value)) {
      return 1 /* String */;
    } else if (Array.isArray(value)) {
      return 3 /* Array */;
    } else if (!Types.isUndefined(value)) {
      return 2 /* ProblemMatcher */;
    } else {
      return 0 /* Unknown */;
    }
  }
  function resolveProblemMatcher(value, context) {
    if (Types.isString(value)) {
      let variableName = value;
      if (variableName.length > 1 && variableName[0] === "$") {
        variableName = variableName.substring(1);
        const global = ProblemMatcherRegistry.get(variableName);
        if (global) {
          return { value: Objects.deepClone(global) };
        }
        let localProblemMatcher = context.namedProblemMatchers[variableName];
        if (localProblemMatcher) {
          localProblemMatcher = Objects.deepClone(localProblemMatcher);
          delete localProblemMatcher.name;
          return { value: localProblemMatcher };
        }
      }
      return { errors: [nls.localize("ConfigurationParser.invalidVariableReference", "Error: Invalid problemMatcher reference: {0}\n", value)] };
    } else {
      const json = value;
      return { value: new ProblemMatcherParser(context.problemReporter).parse(json) };
    }
  }
})(ProblemMatcherConverter || (ProblemMatcherConverter = {}));
var GroupKind;
((GroupKind2) => {
  function from(external) {
    if (external === void 0) {
      return void 0;
    } else if (Types.isString(external) && Tasks.TaskGroup.is(external)) {
      return { _id: external, isDefault: false };
    } else if (Types.isString(external.kind) && Tasks.TaskGroup.is(external.kind)) {
      const group = external.kind;
      const isDefault = Types.isUndefined(external.isDefault) ? false : external.isDefault;
      return { _id: group, isDefault };
    }
    return void 0;
  }
  GroupKind2.from = from;
  function to(group) {
    if (Types.isString(group)) {
      return group;
    } else if (!group.isDefault) {
      return group._id;
    }
    return {
      kind: group._id,
      isDefault: group.isDefault
    };
  }
  GroupKind2.to = to;
})(GroupKind || (GroupKind = {}));
var TaskDependency;
((TaskDependency2) => {
  function uriFromSource(context, source) {
    switch (source) {
      case 2 /* User */:
        return Tasks.USER_TASKS_GROUP_KEY;
      case 0 /* TasksJson */:
        return context.workspaceFolder.uri;
      default:
        return context.workspace && context.workspace.configuration ? context.workspace.configuration : context.workspaceFolder.uri;
    }
  }
  function from(external, context, source) {
    if (Types.isString(external)) {
      return { uri: uriFromSource(context, source), task: external };
    } else if (ITaskIdentifier.is(external)) {
      return {
        uri: uriFromSource(context, source),
        task: Tasks.TaskDefinition.createTaskIdentifier(external, context.problemReporter)
      };
    } else {
      return void 0;
    }
  }
  TaskDependency2.from = from;
})(TaskDependency || (TaskDependency = {}));
var DependsOrder;
((DependsOrder2) => {
  function from(order) {
    switch (order) {
      case Tasks.DependsOrder.sequence:
        return Tasks.DependsOrder.sequence;
      case Tasks.DependsOrder.parallel:
      default:
        return Tasks.DependsOrder.parallel;
    }
  }
  DependsOrder2.from = from;
})(DependsOrder || (DependsOrder = {}));
var ConfigurationProperties;
((ConfigurationProperties2) => {
  const properties = [
    { property: "name" },
    { property: "identifier" },
    { property: "group" },
    { property: "isBackground" },
    { property: "promptOnClose" },
    { property: "dependsOn" },
    { property: "presentation", type: CommandConfiguration.PresentationOptions },
    { property: "problemMatchers" },
    { property: "options" },
    { property: "icon" },
    { property: "hide" },
    { property: "inAgents" }
  ];
  function from(external, context, includeCommandOptions, source, properties2) {
    if (!external) {
      return {};
    }
    const result = {};
    if (properties2) {
      for (const propertyName of Object.keys(properties2)) {
        if (external[propertyName] !== void 0) {
          result[propertyName] = Objects.deepClone(external[propertyName]);
        }
      }
    }
    if (Types.isString(external.taskName)) {
      result.name = external.taskName;
    }
    if (Types.isString(external.label) && context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
      result.name = external.label;
    }
    if (Types.isString(external.identifier)) {
      result.identifier = external.identifier;
    }
    result.icon = external.icon;
    result.hide = external.hide;
    result.inAgents = external.inAgents;
    if (external.isBackground !== void 0) {
      result.isBackground = !!external.isBackground;
    }
    if (external.promptOnClose !== void 0) {
      result.promptOnClose = !!external.promptOnClose;
    }
    result.group = GroupKind.from(external.group);
    if (external.dependsOn !== void 0) {
      if (Array.isArray(external.dependsOn)) {
        result.dependsOn = external.dependsOn.reduce((dependencies, item) => {
          const dependency = TaskDependency.from(item, context, source);
          if (dependency) {
            dependencies.push(dependency);
          }
          return dependencies;
        }, []);
      } else {
        const dependsOnValue = TaskDependency.from(external.dependsOn, context, source);
        result.dependsOn = dependsOnValue ? [dependsOnValue] : void 0;
      }
    }
    result.dependsOrder = DependsOrder.from(external.dependsOrder);
    if (includeCommandOptions && (external.presentation !== void 0 || external.terminal !== void 0)) {
      result.presentation = CommandConfiguration.PresentationOptions.from(external, context);
    }
    if (includeCommandOptions && external.options !== void 0) {
      result.options = CommandOptions.from(external.options, context);
    }
    const configProblemMatcher = ProblemMatcherConverter.fromWithOsConfig(external, context);
    if (configProblemMatcher.value !== void 0) {
      result.problemMatchers = configProblemMatcher.value;
    }
    if (external.detail) {
      result.detail = external.detail;
    }
    return isEmpty(result) ? {} : { value: result, errors: configProblemMatcher.errors };
  }
  ConfigurationProperties2.from = from;
  function isEmpty(value) {
    return _isEmpty(value, properties);
  }
  ConfigurationProperties2.isEmpty = isEmpty;
})(ConfigurationProperties || (ConfigurationProperties = {}));
const label = "Workspace";
var ConfiguringTask;
((ConfiguringTask2) => {
  const grunt = "grunt.";
  const jake = "jake.";
  const gulp = "gulp.";
  const npm = "vscode.npm.";
  const typescript = "vscode.typescript.";
  function from(external, context, index, source, registry) {
    if (!external) {
      return void 0;
    }
    const type = external.type;
    const customize = external.customize;
    if (!type && !customize) {
      context.problemReporter.error(nls.localize("ConfigurationParser.noTaskType", "Error: tasks configuration must have a type property. The configuration will be ignored.\n{0}\n", JSON.stringify(external, null, 4)));
      return void 0;
    }
    const typeDeclaration = type ? registry?.get?.(type) || TaskDefinitionRegistry.get(type) : void 0;
    if (!typeDeclaration) {
      const message = nls.localize("ConfigurationParser.noTypeDefinition", "Error: there is no registered task type '{0}'. Did you miss installing an extension that provides a corresponding task provider?", type);
      context.problemReporter.error(message);
      return void 0;
    }
    let identifier;
    if (Types.isString(customize)) {
      if (customize.indexOf(grunt) === 0) {
        identifier = { type: "grunt", task: customize.substring(grunt.length) };
      } else if (customize.indexOf(jake) === 0) {
        identifier = { type: "jake", task: customize.substring(jake.length) };
      } else if (customize.indexOf(gulp) === 0) {
        identifier = { type: "gulp", task: customize.substring(gulp.length) };
      } else if (customize.indexOf(npm) === 0) {
        identifier = { type: "npm", script: customize.substring(npm.length + 4) };
      } else if (customize.indexOf(typescript) === 0) {
        identifier = { type: "typescript", tsconfig: customize.substring(typescript.length + 6) };
      }
    } else {
      if (Types.isString(external.type)) {
        identifier = external;
      }
    }
    if (identifier === void 0) {
      context.problemReporter.error(nls.localize(
        "ConfigurationParser.missingType",
        "Error: the task configuration '{0}' is missing the required property 'type'. The task configuration will be ignored.",
        JSON.stringify(external, void 0, 0)
      ));
      return void 0;
    }
    const taskIdentifier = Tasks.TaskDefinition.createTaskIdentifier(identifier, context.problemReporter);
    if (taskIdentifier === void 0) {
      context.problemReporter.error(nls.localize(
        "ConfigurationParser.incorrectType",
        "Error: the task configuration '{0}' is using an unknown type. The task configuration will be ignored.",
        JSON.stringify(external, void 0, 0)
      ));
      return void 0;
    }
    const configElement = {
      workspaceFolder: context.workspaceFolder,
      file: ".vscode/tasks.json",
      index,
      element: external
    };
    let taskSource;
    switch (source) {
      case 2 /* User */: {
        taskSource = { kind: Tasks.TaskSourceKind.User, config: configElement, label };
        break;
      }
      case 1 /* WorkspaceFile */: {
        taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: configElement, label };
        break;
      }
      default: {
        taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: configElement, label };
        break;
      }
    }
    const result = new Tasks.ConfiguringTask(
      `${typeDeclaration.extensionId}.${taskIdentifier._key}`,
      taskSource,
      void 0,
      type,
      taskIdentifier,
      RunOptions.fromConfiguration(external.runOptions),
      { hide: external.hide, inAgents: external.inAgents }
    );
    const configuration = ConfigurationProperties.from(external, context, true, source, typeDeclaration.properties);
    result.addTaskLoadMessages(configuration.errors);
    if (configuration.value) {
      result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
      if (result.configurationProperties.name) {
        result._label = result.configurationProperties.name;
      } else {
        let label2 = result.configures.type;
        if (typeDeclaration.required && typeDeclaration.required.length > 0) {
          for (const required of typeDeclaration.required) {
            const value = result.configures[required];
            if (value) {
              label2 = label2 + ": " + value;
              break;
            }
          }
        }
        result._label = label2;
      }
      if (!result.configurationProperties.identifier) {
        result.configurationProperties.identifier = taskIdentifier._key;
      }
    }
    return result;
  }
  ConfiguringTask2.from = from;
})(ConfiguringTask || (ConfiguringTask = {}));
var CustomTask;
((CustomTask2) => {
  function from(external, context, index, source) {
    if (!external) {
      return void 0;
    }
    let type = external.type;
    if (type === void 0 || type === null) {
      type = Tasks.CUSTOMIZED_TASK_TYPE;
    }
    if (type !== Tasks.CUSTOMIZED_TASK_TYPE && type !== "shell" && type !== "process") {
      context.problemReporter.error(nls.localize("ConfigurationParser.notCustom", "Error: tasks is not declared as a custom task. The configuration will be ignored.\n{0}\n", JSON.stringify(external, null, 4)));
      return void 0;
    }
    let taskName = external.taskName;
    if (Types.isString(external.label) && context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
      taskName = external.label;
    }
    if (!taskName) {
      context.problemReporter.error(nls.localize("ConfigurationParser.noTaskName", "Error: a task must provide a label property. The task will be ignored.\n{0}\n", JSON.stringify(external, null, 4)));
      return void 0;
    }
    let taskSource;
    switch (source) {
      case 2 /* User */: {
        taskSource = { kind: Tasks.TaskSourceKind.User, config: { index, element: external, file: ".vscode/tasks.json", workspaceFolder: context.workspaceFolder }, label };
        break;
      }
      case 1 /* WorkspaceFile */: {
        taskSource = { kind: Tasks.TaskSourceKind.WorkspaceFile, config: { index, element: external, file: ".vscode/tasks.json", workspaceFolder: context.workspaceFolder, workspace: context.workspace }, label };
        break;
      }
      default: {
        taskSource = { kind: Tasks.TaskSourceKind.Workspace, config: { index, element: external, file: ".vscode/tasks.json", workspaceFolder: context.workspaceFolder }, label };
        break;
      }
    }
    const result = new Tasks.CustomTask(
      context.uuidMap.getUUID(taskName),
      taskSource,
      taskName,
      Tasks.CUSTOMIZED_TASK_TYPE,
      void 0,
      false,
      RunOptions.fromConfiguration(external.runOptions),
      {
        name: taskName,
        identifier: taskName
      }
    );
    const configuration = ConfigurationProperties.from(external, context, false, source);
    result.addTaskLoadMessages(configuration.errors);
    if (configuration.value) {
      result.configurationProperties = Object.assign(result.configurationProperties, configuration.value);
    }
    const supportLegacy = true;
    if (supportLegacy) {
      const legacy = external;
      if (result.configurationProperties.isBackground === void 0 && legacy.isWatching !== void 0) {
        result.configurationProperties.isBackground = !!legacy.isWatching;
      }
      if (result.configurationProperties.group === void 0) {
        if (legacy.isBuildCommand === true) {
          result.configurationProperties.group = Tasks.TaskGroup.Build;
        } else if (legacy.isTestCommand === true) {
          result.configurationProperties.group = Tasks.TaskGroup.Test;
        }
      }
    }
    const command = CommandConfiguration.from(external, context);
    if (command) {
      result.command = command;
    }
    if (external.command !== void 0) {
      command.suppressTaskName = true;
    }
    return result;
  }
  CustomTask2.from = from;
  function fillGlobals(task, globals) {
    if (CommandConfiguration.hasCommand(task.command) || task.configurationProperties.dependsOn === void 0) {
      task.command = CommandConfiguration.fillGlobals(task.command, globals.command, task.configurationProperties.name);
    }
    if (task.configurationProperties.problemMatchers === void 0 && globals.problemMatcher !== void 0) {
      task.configurationProperties.problemMatchers = Objects.deepClone(globals.problemMatcher);
      task.hasDefinedMatchers = true;
    }
    if (task.configurationProperties.promptOnClose === void 0 && task.configurationProperties.isBackground === void 0 && globals.promptOnClose !== void 0) {
      task.configurationProperties.promptOnClose = globals.promptOnClose;
    }
  }
  CustomTask2.fillGlobals = fillGlobals;
  function fillDefaults(task, context) {
    CommandConfiguration.fillDefaults(task.command, context);
    if (task.configurationProperties.promptOnClose === void 0) {
      task.configurationProperties.promptOnClose = task.configurationProperties.isBackground !== void 0 ? !task.configurationProperties.isBackground : true;
    }
    if (task.configurationProperties.isBackground === void 0) {
      task.configurationProperties.isBackground = false;
    }
    if (task.configurationProperties.problemMatchers === void 0) {
      task.configurationProperties.problemMatchers = EMPTY_ARRAY;
    }
  }
  CustomTask2.fillDefaults = fillDefaults;
  function createCustomTask2(contributedTask, configuredProps) {
    const result = new Tasks.CustomTask(
      configuredProps._id,
      Object.assign({}, configuredProps._source, { customizes: contributedTask.defines }),
      configuredProps.configurationProperties.name || contributedTask._label,
      Tasks.CUSTOMIZED_TASK_TYPE,
      contributedTask.command,
      false,
      contributedTask.runOptions,
      {
        name: configuredProps.configurationProperties.name || contributedTask.configurationProperties.name,
        identifier: configuredProps.configurationProperties.identifier || contributedTask.configurationProperties.identifier,
        icon: configuredProps.configurationProperties.icon,
        hide: configuredProps.configurationProperties.hide,
        inAgents: configuredProps.configurationProperties.inAgents
      }
    );
    result.addTaskLoadMessages(configuredProps.taskLoadMessages);
    const resultConfigProps = result.configurationProperties;
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "group");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "isBackground");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "dependsOn");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "problemMatchers");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "promptOnClose");
    assignProperty(resultConfigProps, configuredProps.configurationProperties, "detail");
    result.command.presentation = CommandConfiguration.PresentationOptions.assignProperties(
      result.command.presentation,
      configuredProps.configurationProperties.presentation
    );
    result.command.options = CommandOptions.assignProperties(result.command.options, configuredProps.configurationProperties.options);
    result.runOptions = RunOptions.assignProperties(result.runOptions, configuredProps.runOptions);
    const contributedConfigProps = contributedTask.configurationProperties;
    fillProperty(resultConfigProps, contributedConfigProps, "group");
    fillProperty(resultConfigProps, contributedConfigProps, "isBackground");
    fillProperty(resultConfigProps, contributedConfigProps, "dependsOn");
    fillProperty(resultConfigProps, contributedConfigProps, "problemMatchers");
    fillProperty(resultConfigProps, contributedConfigProps, "promptOnClose");
    fillProperty(resultConfigProps, contributedConfigProps, "detail");
    result.command.presentation = CommandConfiguration.PresentationOptions.fillProperties(
      result.command.presentation,
      contributedConfigProps.presentation
    );
    result.command.options = CommandOptions.fillProperties(result.command.options, contributedConfigProps.options);
    result.runOptions = RunOptions.fillProperties(result.runOptions, contributedTask.runOptions);
    if (contributedTask.hasDefinedMatchers === true) {
      result.hasDefinedMatchers = true;
    }
    return result;
  }
  CustomTask2.createCustomTask = createCustomTask2;
})(CustomTask || (CustomTask = {}));
var TaskParser;
((TaskParser2) => {
  function isCustomTask(value) {
    const type = value.type;
    const customize = value.customize;
    return customize === void 0 && (type === void 0 || type === null || type === Tasks.CUSTOMIZED_TASK_TYPE || type === "shell" || type === "process");
  }
  const builtinTypeContextMap = {
    shell: ShellExecutionSupportedContext,
    process: ProcessExecutionSupportedContext
  };
  function from(externals, globals, context, source, registry) {
    const result = { custom: [], configured: [] };
    if (!externals) {
      return result;
    }
    const defaultBuildTask = { task: void 0, rank: -1 };
    const defaultTestTask = { task: void 0, rank: -1 };
    const schema2_0_0 = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
    const baseLoadIssues = Objects.deepClone(context.taskLoadIssues);
    for (let index = 0; index < externals.length; index++) {
      const external = externals[index];
      const definition = external.type ? registry?.get?.(external.type) || TaskDefinitionRegistry.get(external.type) : void 0;
      let typeNotSupported = false;
      if (definition && definition.when && !context.contextKeyService.contextMatchesRules(definition.when)) {
        typeNotSupported = true;
      } else if (!definition && external.type) {
        for (const key of Object.keys(builtinTypeContextMap)) {
          if (external.type === key) {
            typeNotSupported = !ShellExecutionSupportedContext.evaluate(context.contextKeyService.getContext(null));
            break;
          }
        }
      }
      if (typeNotSupported) {
        context.problemReporter.info(nls.localize(
          "taskConfiguration.providerUnavailable",
          "Warning: {0} tasks are unavailable in the current environment.\n",
          external.type
        ));
        continue;
      }
      if (isCustomTask(external)) {
        const customTask = CustomTask.from(external, context, index, source);
        if (customTask) {
          CustomTask.fillGlobals(customTask, globals);
          CustomTask.fillDefaults(customTask, context);
          if (schema2_0_0) {
            if ((customTask.command === void 0 || customTask.command.name === void 0) && (customTask.configurationProperties.dependsOn === void 0 || customTask.configurationProperties.dependsOn.length === 0)) {
              context.problemReporter.error(nls.localize(
                "taskConfiguration.noCommandOrDependsOn",
                "Error: the task '{0}' neither specifies a command nor a dependsOn property. The task will be ignored. Its definition is:\n{1}",
                customTask.configurationProperties.name,
                JSON.stringify(external, void 0, 4)
              ));
              continue;
            }
          } else {
            if (customTask.command === void 0 || customTask.command.name === void 0) {
              context.problemReporter.warn(nls.localize(
                "taskConfiguration.noCommand",
                "Error: the task '{0}' doesn't define a command. The task will be ignored. Its definition is:\n{1}",
                customTask.configurationProperties.name,
                JSON.stringify(external, void 0, 4)
              ));
              continue;
            }
          }
          if (customTask.configurationProperties.group === Tasks.TaskGroup.Build && defaultBuildTask.rank < 2) {
            defaultBuildTask.task = customTask;
            defaultBuildTask.rank = 2;
          } else if (customTask.configurationProperties.group === Tasks.TaskGroup.Test && defaultTestTask.rank < 2) {
            defaultTestTask.task = customTask;
            defaultTestTask.rank = 2;
          } else if (customTask.configurationProperties.name === "build" && defaultBuildTask.rank < 1) {
            defaultBuildTask.task = customTask;
            defaultBuildTask.rank = 1;
          } else if (customTask.configurationProperties.name === "test" && defaultTestTask.rank < 1) {
            defaultTestTask.task = customTask;
            defaultTestTask.rank = 1;
          }
          customTask.addTaskLoadMessages(context.taskLoadIssues);
          result.custom.push(customTask);
        }
      } else {
        const configuredTask = ConfiguringTask.from(external, context, index, source, registry);
        if (configuredTask) {
          configuredTask.addTaskLoadMessages(context.taskLoadIssues);
          result.configured.push(configuredTask);
        }
      }
      context.taskLoadIssues = Objects.deepClone(baseLoadIssues);
    }
    const defaultBuildGroupName = Types.isString(defaultBuildTask.task?.configurationProperties.group) ? defaultBuildTask.task?.configurationProperties.group : defaultBuildTask.task?.configurationProperties.group?._id;
    const defaultTestTaskGroupName = Types.isString(defaultTestTask.task?.configurationProperties.group) ? defaultTestTask.task?.configurationProperties.group : defaultTestTask.task?.configurationProperties.group?._id;
    if (defaultBuildGroupName !== Tasks.TaskGroup.Build._id && defaultBuildTask.rank > -1 && defaultBuildTask.rank < 2 && defaultBuildTask.task) {
      defaultBuildTask.task.configurationProperties.group = Tasks.TaskGroup.Build;
    } else if (defaultTestTaskGroupName !== Tasks.TaskGroup.Test._id && defaultTestTask.rank > -1 && defaultTestTask.rank < 2 && defaultTestTask.task) {
      defaultTestTask.task.configurationProperties.group = Tasks.TaskGroup.Test;
    }
    return result;
  }
  TaskParser2.from = from;
  function assignTasks(target, source) {
    if (source === void 0 || source.length === 0) {
      return target;
    }
    if (target === void 0 || target.length === 0) {
      return source;
    }
    if (source) {
      const map = /* @__PURE__ */ Object.create(null);
      target.forEach((task) => {
        map[task.configurationProperties.name] = task;
      });
      source.forEach((task) => {
        map[task.configurationProperties.name] = task;
      });
      const newTarget = [];
      target.forEach((task) => {
        newTarget.push(map[task.configurationProperties.name]);
        delete map[task.configurationProperties.name];
      });
      Object.keys(map).forEach((key) => newTarget.push(map[key]));
      target = newTarget;
    }
    return target;
  }
  TaskParser2.assignTasks = assignTasks;
})(TaskParser || (TaskParser = {}));
var Globals;
((Globals2) => {
  function from(config, context) {
    let result = fromBase(config, context);
    let osGlobals = void 0;
    if (config.windows && context.platform === Platform.Windows) {
      osGlobals = fromBase(config.windows, context);
    } else if (config.osx && context.platform === Platform.Mac) {
      osGlobals = fromBase(config.osx, context);
    } else if (config.linux && context.platform === Platform.Linux) {
      osGlobals = fromBase(config.linux, context);
    }
    if (osGlobals) {
      result = Globals2.assignProperties(result, osGlobals);
    }
    const command = CommandConfiguration.from(config, context);
    if (command) {
      result.command = command;
    }
    Globals2.fillDefaults(result, context);
    Globals2.freeze(result);
    return result;
  }
  Globals2.from = from;
  function fromBase(config, context) {
    const result = {};
    if (config.suppressTaskName !== void 0) {
      result.suppressTaskName = !!config.suppressTaskName;
    }
    if (config.promptOnClose !== void 0) {
      result.promptOnClose = !!config.promptOnClose;
    }
    if (config.problemMatcher) {
      result.problemMatcher = ProblemMatcherConverter.from(config.problemMatcher, context).value;
    }
    return result;
  }
  Globals2.fromBase = fromBase;
  function isEmpty(value) {
    return !value || value.command === void 0 && value.promptOnClose === void 0 && value.suppressTaskName === void 0;
  }
  Globals2.isEmpty = isEmpty;
  function assignProperties(target, source) {
    if (isEmpty(source)) {
      return target;
    }
    if (isEmpty(target)) {
      return source;
    }
    assignProperty(target, source, "promptOnClose");
    assignProperty(target, source, "suppressTaskName");
    return target;
  }
  Globals2.assignProperties = assignProperties;
  function fillDefaults(value, context) {
    if (!value) {
      return;
    }
    CommandConfiguration.fillDefaults(value.command, context);
    if (value.suppressTaskName === void 0) {
      value.suppressTaskName = context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0;
    }
    if (value.promptOnClose === void 0) {
      value.promptOnClose = true;
    }
  }
  Globals2.fillDefaults = fillDefaults;
  function freeze(value) {
    Object.freeze(value);
    if (value.command) {
      CommandConfiguration.freeze(value.command);
    }
  }
  Globals2.freeze = freeze;
})(Globals || (Globals = {}));
var ExecutionEngine;
((ExecutionEngine2) => {
  function from(config) {
    const runner = config.runner || config._runner;
    let result;
    if (runner) {
      switch (runner) {
        case "terminal":
          result = Tasks.ExecutionEngine.Terminal;
          break;
        case "process":
          result = Tasks.ExecutionEngine.Process;
          break;
      }
    }
    const schemaVersion = JsonSchemaVersion.from(config);
    if (schemaVersion === Tasks.JsonSchemaVersion.V0_1_0) {
      return result || Tasks.ExecutionEngine.Process;
    } else if (schemaVersion === Tasks.JsonSchemaVersion.V2_0_0) {
      return Tasks.ExecutionEngine.Terminal;
    } else {
      throw new Error("Shouldn't happen.");
    }
  }
  ExecutionEngine2.from = from;
})(ExecutionEngine || (ExecutionEngine = {}));
var JsonSchemaVersion;
((JsonSchemaVersion2) => {
  const _default = Tasks.JsonSchemaVersion.V2_0_0;
  function from(config) {
    const version = config.version;
    if (!version) {
      return _default;
    }
    switch (version) {
      case "0.1.0":
        return Tasks.JsonSchemaVersion.V0_1_0;
      case "2.0.0":
        return Tasks.JsonSchemaVersion.V2_0_0;
      default:
        return _default;
    }
  }
  JsonSchemaVersion2.from = from;
})(JsonSchemaVersion || (JsonSchemaVersion = {}));
class UUIDMap {
  constructor(other) {
    this.current = /* @__PURE__ */ Object.create(null);
    if (other) {
      for (const key of Object.keys(other.current)) {
        const value = other.current[key];
        if (Array.isArray(value)) {
          this.current[key] = value.slice();
        } else {
          this.current[key] = value;
        }
      }
    }
  }
  start() {
    this.last = this.current;
    this.current = /* @__PURE__ */ Object.create(null);
  }
  getUUID(identifier) {
    const lastValue = this.last ? this.last[identifier] : void 0;
    let result = void 0;
    if (lastValue !== void 0) {
      if (Array.isArray(lastValue)) {
        result = lastValue.shift();
        if (lastValue.length === 0) {
          delete this.last[identifier];
        }
      } else {
        result = lastValue;
        delete this.last[identifier];
      }
    }
    if (result === void 0) {
      result = UUID.generateUuid();
    }
    const currentValue = this.current[identifier];
    if (currentValue === void 0) {
      this.current[identifier] = result;
    } else {
      if (Array.isArray(currentValue)) {
        currentValue.push(result);
      } else {
        const arrayValue = [currentValue];
        arrayValue.push(result);
        this.current[identifier] = arrayValue;
      }
    }
    return result;
  }
  finish() {
    this.last = void 0;
  }
}
var TaskConfigSource = /* @__PURE__ */ ((TaskConfigSource2) => {
  TaskConfigSource2[TaskConfigSource2["TasksJson"] = 0] = "TasksJson";
  TaskConfigSource2[TaskConfigSource2["WorkspaceFile"] = 1] = "WorkspaceFile";
  TaskConfigSource2[TaskConfigSource2["User"] = 2] = "User";
  return TaskConfigSource2;
})(TaskConfigSource || {});
class ConfigurationParser {
  constructor(workspaceFolder, workspace, platform, problemReporter, uuidMap) {
    this.workspaceFolder = workspaceFolder;
    this.workspace = workspace;
    this.platform = platform;
    this.problemReporter = problemReporter;
    this.uuidMap = uuidMap;
  }
  run(fileConfig, source, contextKeyService) {
    const engine = ExecutionEngine.from(fileConfig);
    const schemaVersion = JsonSchemaVersion.from(fileConfig);
    const context = {
      workspaceFolder: this.workspaceFolder,
      workspace: this.workspace,
      problemReporter: this.problemReporter,
      uuidMap: this.uuidMap,
      namedProblemMatchers: {},
      engine,
      schemaVersion,
      platform: this.platform,
      taskLoadIssues: [],
      contextKeyService
    };
    const taskParseResult = this.createTaskRunnerConfiguration(fileConfig, context, source);
    return {
      validationStatus: this.problemReporter.status,
      custom: taskParseResult.custom,
      configured: taskParseResult.configured,
      engine
    };
  }
  createTaskRunnerConfiguration(fileConfig, context, source) {
    const globals = Globals.from(fileConfig, context);
    if (this.problemReporter.status.isFatal()) {
      return { custom: [], configured: [] };
    }
    context.namedProblemMatchers = ProblemMatcherConverter.namedFrom(fileConfig.declares, context);
    let globalTasks = void 0;
    let externalGlobalTasks = void 0;
    if (fileConfig.windows && context.platform === Platform.Windows) {
      globalTasks = TaskParser.from(fileConfig.windows.tasks, globals, context, source).custom;
      externalGlobalTasks = fileConfig.windows.tasks;
    } else if (fileConfig.osx && context.platform === Platform.Mac) {
      globalTasks = TaskParser.from(fileConfig.osx.tasks, globals, context, source).custom;
      externalGlobalTasks = fileConfig.osx.tasks;
    } else if (fileConfig.linux && context.platform === Platform.Linux) {
      globalTasks = TaskParser.from(fileConfig.linux.tasks, globals, context, source).custom;
      externalGlobalTasks = fileConfig.linux.tasks;
    }
    if (context.schemaVersion === Tasks.JsonSchemaVersion.V2_0_0 && globalTasks && globalTasks.length > 0 && externalGlobalTasks && externalGlobalTasks.length > 0) {
      const taskContent = [];
      for (const task of externalGlobalTasks) {
        taskContent.push(JSON.stringify(task, null, 4));
      }
      context.problemReporter.error(
        nls.localize(
          { key: "TaskParse.noOsSpecificGlobalTasks", comment: ['"Task version 2.0.0" refers to the 2.0.0 version of the task system. The "version 2.0.0" is not localizable as it is a json key and value.'] },
          "Task version 2.0.0 doesn't support global OS specific tasks. Convert them to a task with a OS specific command. Affected tasks are:\n{0}",
          taskContent.join("\n")
        )
      );
    }
    let result = { custom: [], configured: [] };
    if (fileConfig.tasks) {
      result = TaskParser.from(fileConfig.tasks, globals, context, source);
    }
    if (globalTasks) {
      result.custom = TaskParser.assignTasks(result.custom, globalTasks);
    }
    if ((!result.custom || result.custom.length === 0) && (globals.command && globals.command.name)) {
      const matchers = ProblemMatcherConverter.from(fileConfig.problemMatcher, context).value ?? [];
      const isBackground = fileConfig.isBackground ? !!fileConfig.isBackground : fileConfig.isWatching ? !!fileConfig.isWatching : void 0;
      const name = Tasks.CommandString.value(globals.command.name);
      const task = new Tasks.CustomTask(
        context.uuidMap.getUUID(name),
        Object.assign({}, source, "workspace", { config: { index: -1, element: fileConfig, workspaceFolder: context.workspaceFolder } }),
        name,
        Tasks.CUSTOMIZED_TASK_TYPE,
        {
          name: void 0,
          runtime: void 0,
          presentation: void 0,
          suppressTaskName: true
        },
        false,
        { reevaluateOnRerun: true },
        {
          name,
          identifier: name,
          group: Tasks.TaskGroup.Build,
          isBackground,
          problemMatchers: matchers
        }
      );
      const taskGroupKind = GroupKind.from(fileConfig.group);
      if (taskGroupKind !== void 0) {
        task.configurationProperties.group = taskGroupKind;
      } else if (fileConfig.group === "none") {
        task.configurationProperties.group = void 0;
      }
      CustomTask.fillGlobals(task, globals);
      CustomTask.fillDefaults(task, context);
      result.custom = [task];
    }
    result.custom = result.custom || [];
    result.configured = result.configured || [];
    return result;
  }
}
const uuidMaps = /* @__PURE__ */ new Map();
const recentUuidMaps = /* @__PURE__ */ new Map();
function parse(workspaceFolder, workspace, platform, configuration, logger, source, contextKeyService, isRecents = false) {
  const recentOrOtherMaps = isRecents ? recentUuidMaps : uuidMaps;
  let selectedUuidMaps = recentOrOtherMaps.get(source);
  if (!selectedUuidMaps) {
    recentOrOtherMaps.set(source, /* @__PURE__ */ new Map());
    selectedUuidMaps = recentOrOtherMaps.get(source);
  }
  let uuidMap = selectedUuidMaps.get(workspaceFolder.uri.toString());
  if (!uuidMap) {
    uuidMap = new UUIDMap();
    selectedUuidMaps.set(workspaceFolder.uri.toString(), uuidMap);
  }
  try {
    uuidMap.start();
    return new ConfigurationParser(workspaceFolder, workspace, platform, logger, uuidMap).run(configuration, source, contextKeyService);
  } finally {
    uuidMap.finish();
  }
}
function createCustomTask(contributedTask, configuredProps) {
  return CustomTask.createCustomTask(contributedTask, configuredProps);
}
export {
  CommandString,
  ExecutionEngine,
  GroupKind,
  ITaskIdentifier,
  InstancePolicy,
  JsonSchemaVersion,
  ProblemMatcherConverter,
  RunOnOptions,
  RunOptions,
  ShellQuoting,
  TaskConfigSource,
  TaskParser,
  UUIDMap,
  createCustomTask,
  parse
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrQ29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgUGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBVVUlEIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuXG5pbXBvcnQgeyBWYWxpZGF0aW9uU3RhdHVzLCBJUHJvYmxlbVJlcG9ydGVyIGFzIElQcm9ibGVtUmVwb3J0ZXJCYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGFyc2Vycy5qcyc7XG5pbXBvcnQge1xuXHRJTmFtZWRQcm9ibGVtTWF0Y2hlciwgUHJvYmxlbU1hdGNoZXJQYXJzZXIsIENvbmZpZyBhcyBQcm9ibGVtTWF0Y2hlckNvbmZpZyxcblx0aXNOYW1lZFByb2JsZW1NYXRjaGVyLCBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LCBQcm9ibGVtTWF0Y2hlclxufSBmcm9tICcuL3Byb2JsZW1NYXRjaGVyLmpzJztcblxuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCAqIGFzIFRhc2tzIGZyb20gJy4vdGFza3MuanMnO1xuaW1wb3J0IHsgSVRhc2tEZWZpbml0aW9uUmVnaXN0cnksIFRhc2tEZWZpbml0aW9uUmVnaXN0cnkgfSBmcm9tICcuL3Rhc2tEZWZpbml0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlZElucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNoZWxsRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCwgUHJvY2Vzc0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQgfSBmcm9tICcuL3Rhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBTaGVsbFF1b3Rpbmcge1xuXHQvKipcblx0ICogRGVmYXVsdCBpcyBjaGFyYWN0ZXIgZXNjYXBpbmcuXG5cdCAqL1xuXHRlc2NhcGUgPSAxLFxuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IGlzIHN0cm9uZyBxdW90aW5nXG5cdCAqL1xuXHRzdHJvbmcgPSAyLFxuXG5cdC8qKlxuXHQgKiBEZWZhdWx0IGlzIHdlYWsgcXVvdGluZy5cblx0ICovXG5cdHdlYWsgPSAzXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNoZWxsUXVvdGluZ09wdGlvbnMge1xuXHQvKipcblx0ICogVGhlIGNoYXJhY3RlciB1c2VkIHRvIGRvIGNoYXJhY3RlciBlc2NhcGluZy5cblx0ICovXG5cdGVzY2FwZT86IHN0cmluZyB8IHtcblx0XHRlc2NhcGVDaGFyOiBzdHJpbmc7XG5cdFx0Y2hhcnNUb0VzY2FwZTogc3RyaW5nO1xuXHR9O1xuXG5cdC8qKlxuXHQgKiBUaGUgY2hhcmFjdGVyIHVzZWQgZm9yIHN0cmluZyBxdW90aW5nLlxuXHQgKi9cblx0c3Ryb25nPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgY2hhcmFjdGVyIHVzZWQgZm9yIHdlYWsgcXVvdGluZy5cblx0ICovXG5cdHdlYWs/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNoZWxsQ29uZmlndXJhdGlvbiB7XG5cdGV4ZWN1dGFibGU/OiBzdHJpbmc7XG5cdGFyZ3M/OiBzdHJpbmdbXTtcblx0cXVvdGluZz86IElTaGVsbFF1b3RpbmdPcHRpb25zO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tYW5kT3B0aW9uc0NvbmZpZyB7XG5cdC8qKlxuXHQgKiBUaGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBvZiB0aGUgZXhlY3V0ZWQgcHJvZ3JhbSBvciBzaGVsbC5cblx0ICogSWYgb21pdHRlZCBWU0NvZGUncyBjdXJyZW50IHdvcmtzcGFjZSByb290IGlzIHVzZWQuXG5cdCAqL1xuXHRjd2Q/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBhZGRpdGlvbmFsIGVudmlyb25tZW50IG9mIHRoZSBleGVjdXRlZCBwcm9ncmFtIG9yIHNoZWxsLiBJZiBvbWl0dGVkXG5cdCAqIHRoZSBwYXJlbnQgcHJvY2VzcycgZW52aXJvbm1lbnQgaXMgdXNlZC5cblx0ICovXG5cdGVudj86IElTdHJpbmdEaWN0aW9uYXJ5PHN0cmluZz47XG5cblx0LyoqXG5cdCAqIFRoZSBzaGVsbCBjb25maWd1cmF0aW9uO1xuXHQgKi9cblx0c2hlbGw/OiBJU2hlbGxDb25maWd1cmF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcmVzZW50YXRpb25PcHRpb25zQ29uZmlnIHtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIGV4ZWN1dGluZyBhIHRhc2sgaXMgYnJvdWdodCB0byBmcm9udCBvciBub3QuXG5cdCAqIERlZmF1bHRzIHRvIGBSZXZlYWxLaW5kLkFsd2F5c2AuXG5cdCAqL1xuXHRyZXZlYWw/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHByb2JsZW1zIHBhbmVsIGlzIHJldmVhbGVkIHdoZW4gcnVubmluZyB0aGlzIHRhc2sgb3Igbm90LlxuXHQgKiBEZWZhdWx0cyB0byBgUmV2ZWFsS2luZC5OZXZlcmAuXG5cdCAqL1xuXHRyZXZlYWxQcm9ibGVtcz86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgZXhlY3V0ZWQgY29tbWFuZCBpcyBwcmludGVkIHRvIHRoZSBvdXRwdXQgd2luZG93IG9yIHRlcm1pbmFsIGFzIHdlbGwuXG5cdCAqL1xuXHRlY2hvPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgaXMgZm9jdXMgd2hlbiB0aGlzIHRhc2sgaXMgZXhlY3V0ZWRcblx0ICovXG5cdGZvY3VzPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGFzayBydW5zIGluIGEgbmV3IHRlcm1pbmFsXG5cdCAqL1xuXHRwYW5lbD86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byBzaG93IHRoZSBcIlRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0XCIgbWVzc2FnZS5cblx0ICovXG5cdHNob3dSZXVzZU1lc3NhZ2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCBzaG91bGQgYmUgY2xlYXJlZCBiZWZvcmUgcnVubmluZyB0aGUgdGFzay5cblx0ICovXG5cdGNsZWFyPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGFzayBpcyBleGVjdXRlZCBpbiBhIHNwZWNpZmljIHRlcm1pbmFsIGdyb3VwIHVzaW5nIHNwbGl0IHBhbmVzLlxuXHQgKi9cblx0Z3JvdXA/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHRoYXQgdGhlIHRhc2sgcnVucyBpbiBpcyBjbG9zZWQgd2hlbiB0aGUgdGFzayBjb21wbGV0ZXMuXG5cdCAqIE5vdGUgdGhhdCBpZiB0aGUgdGVybWluYWwgcHJvY2VzcyBleGl0cyB3aXRoIGEgbm9uLXplcm8gZXhpdCBjb2RlLCBpdCB3aWxsIG5vdCBjbG9zZS5cblx0ICovXG5cdGNsb3NlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byBwcmVzZXJ2ZSB0aGUgdGFzayBuYW1lIGluIHRoZSB0ZXJtaW5hbCBhZnRlciB0YXNrIGNvbXBsZXRpb24uXG5cdCAqL1xuXHRwcmVzZXJ2ZVRlcm1pbmFsTmFtZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJ1bk9wdGlvbnNDb25maWcge1xuXHRyZWV2YWx1YXRlT25SZXJ1bj86IGJvb2xlYW47XG5cdHJ1bk9uPzogc3RyaW5nO1xuXHRpbnN0YW5jZUxpbWl0PzogbnVtYmVyO1xuXHRpbnN0YW5jZVBvbGljeT86IFRhc2tzLkluc3RhbmNlUG9saWN5O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrSWRlbnRpZmllciB7XG5cdHR5cGU/OiBzdHJpbmc7XG5cdFtuYW1lOiBzdHJpbmddOiB1bmtub3duO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElUYXNrSWRlbnRpZmllciB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElUYXNrSWRlbnRpZmllciB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlOiBJVGFza0lkZW50aWZpZXIgPSB2YWx1ZSBhcyBJVGFza0lkZW50aWZpZXI7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZSAhPT0gdW5kZWZpbmVkICYmIFR5cGVzLmlzU3RyaW5nKCh2YWx1ZSBhcyBJVGFza0lkZW50aWZpZXIpLnR5cGUpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxlZ2FjeVRhc2tQcm9wZXJ0aWVzIHtcblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBgaXNCYWNrZ3JvdW5kYCBpbnN0ZWFkLlxuXHQgKiBXaGV0aGVyIHRoZSBleGVjdXRlZCBjb21tYW5kIGlzIGtlcHQgYWxpdmUgYW5kIGlzIHdhdGNoaW5nIHRoZSBmaWxlIHN5c3RlbS5cblx0ICovXG5cdGlzV2F0Y2hpbmc/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgYGdyb3VwYCBpbnN0ZWFkLlxuXHQgKiBXaGV0aGVyIHRoaXMgdGFzayBtYXBzIHRvIHRoZSBkZWZhdWx0IGJ1aWxkIGNvbW1hbmQuXG5cdCAqL1xuXHRpc0J1aWxkQ29tbWFuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBgZ3JvdXBgIGluc3RlYWQuXG5cdCAqIFdoZXRoZXIgdGhpcyB0YXNrIG1hcHMgdG8gdGhlIGRlZmF1bHQgdGVzdCBjb21tYW5kLlxuXHQgKi9cblx0aXNUZXN0Q29tbWFuZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxlZ2FjeUNvbW1hbmRQcm9wZXJ0aWVzIHtcblxuXHQvKipcblx0ICogV2hldGhlciB0aGlzIGlzIGEgc2hlbGwgb3IgcHJvY2Vzc1xuXHQgKi9cblx0dHlwZT86IHN0cmluZztcblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIHByZXNlbnRhdGlvbiBvcHRpb25zXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIG91dHB1dCB2aWV3IG9mIHRoZSBydW5uaW5nIHRhc2tzIGlzIGJyb3VnaHQgdG8gZnJvbnQgb3Igbm90LlxuXHQgKiBTZWUgQmFzZVRhc2tSdW5uZXJDb25maWd1cmF0aW9uI3Nob3dPdXRwdXQgZm9yIGRldGFpbHMuXG5cdCAqL1xuXHRzaG93T3V0cHV0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgcHJlc2VudGF0aW9uIG9wdGlvbnNcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgZXhlY3V0ZWQgY29tbWFuZCBpcyBwcmludGVkIHRvIHRoZSBvdXRwdXQgd2luZG93cyBhcyB3ZWxsLlxuXHQgKi9cblx0ZWNob0NvbW1hbmQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBVc2UgcHJlc2VudGF0aW9uIGluc3RlYWRcblx0ICovXG5cdHRlcm1pbmFsPzogSVByZXNlbnRhdGlvbk9wdGlvbnNDb25maWc7XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBpbmxpbmUgY29tbWFuZHMuXG5cdCAqIFNlZSBCYXNlVGFza1J1bm5lckNvbmZpZ3VyYXRpb24jc3VwcHJlc3NUYXNrTmFtZSBmb3IgZGV0YWlscy5cblx0ICovXG5cdHN1cHByZXNzVGFza05hbWU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTb21lIGNvbW1hbmRzIHJlcXVpcmUgdGhhdCB0aGUgdGFzayBhcmd1bWVudCBpcyBoaWdobGlnaHRlZCB3aXRoIGEgc3BlY2lhbFxuXHQgKiBwcmVmaXggKGUuZy4gL3Q6IGZvciBtc2J1aWxkKS4gVGhpcyBwcm9wZXJ0eSBjYW4gYmUgdXNlZCB0byBjb250cm9sIHN1Y2hcblx0ICogYSBwcmVmaXguXG5cdCAqL1xuXHR0YXNrU2VsZWN0b3I/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIHVzZSB0aGUgdGFzayB0eXBlIGluc3RlYWQuXG5cdCAqIFNwZWNpZmllcyB3aGV0aGVyIHRoZSBjb21tYW5kIGlzIGEgc2hlbGwgY29tbWFuZCBhbmQgdGhlcmVmb3JlIG11c3Rcblx0ICogYmUgZXhlY3V0ZWQgaW4gYSBzaGVsbCBpbnRlcnByZXRlciAoZS5nLiBjbWQuZXhlLCBiYXNoLCAuLi4pLlxuXHQgKlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZSBpZiBvbWl0dGVkLlxuXHQgKi9cblx0aXNTaGVsbENvbW1hbmQ/OiBib29sZWFuIHwgSVNoZWxsQ29uZmlndXJhdGlvbjtcbn1cblxuZXhwb3J0IHR5cGUgQ29tbWFuZFN0cmluZyA9IFR5cGVzLlNpbmdsZU9yTWFueTxzdHJpbmc+IHwgeyB2YWx1ZTogVHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz47IHF1b3Rpbmc6ICdlc2NhcGUnIHwgJ3N0cm9uZycgfCAnd2VhaycgfTtcblxuZXhwb3J0IG5hbWVzcGFjZSBDb21tYW5kU3RyaW5nIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHZhbHVlKHZhbHVlOiBDb21tYW5kU3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSBlbHNlIGlmIChUeXBlcy5pc1N0cmluZ0FycmF5KHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLmpvaW4oJyAnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlLnZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWUudmFsdWUuam9pbignICcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCYXNlQ29tbWFuZFByb3BlcnRpZXMge1xuXG5cdC8qKlxuXHQgKiBUaGUgY29tbWFuZCB0byBiZSBleGVjdXRlZC4gQ2FuIGJlIGFuIGV4dGVybmFsIHByb2dyYW0gb3IgYSBzaGVsbFxuXHQgKiBjb21tYW5kLlxuXHQgKi9cblx0Y29tbWFuZD86IENvbW1hbmRTdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBjb21tYW5kIG9wdGlvbnMgdXNlZCB3aGVuIHRoZSBjb21tYW5kIGlzIGV4ZWN1dGVkLiBDYW4gYmUgb21pdHRlZC5cblx0ICovXG5cdG9wdGlvbnM/OiBJQ29tbWFuZE9wdGlvbnNDb25maWc7XG5cblx0LyoqXG5cdCAqIFRoZSBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBjb21tYW5kIG9yIGFkZGl0aW9uYWwgYXJndW1lbnRzIHBhc3NlZCB0byB0aGVcblx0ICogY29tbWFuZCB3aGVuIHVzaW5nIGEgZ2xvYmFsIGNvbW1hbmQuXG5cdCAqL1xuXHRhcmdzPzogQ29tbWFuZFN0cmluZ1tdO1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRQcm9wZXJ0aWVzIGV4dGVuZHMgSUJhc2VDb21tYW5kUHJvcGVydGllcyB7XG5cblx0LyoqXG5cdCAqIFdpbmRvd3Mgc3BlY2lmaWMgY29tbWFuZCBwcm9wZXJ0aWVzXG5cdCAqL1xuXHR3aW5kb3dzPzogSUJhc2VDb21tYW5kUHJvcGVydGllcztcblxuXHQvKipcblx0ICogT1NYIHNwZWNpZmljIGNvbW1hbmQgcHJvcGVydGllc1xuXHQgKi9cblx0b3N4PzogSUJhc2VDb21tYW5kUHJvcGVydGllcztcblxuXHQvKipcblx0ICogbGludXggc3BlY2lmaWMgY29tbWFuZCBwcm9wZXJ0aWVzXG5cdCAqL1xuXHRsaW51eD86IElCYXNlQ29tbWFuZFByb3BlcnRpZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdyb3VwS2luZCB7XG5cdGtpbmQ/OiBzdHJpbmc7XG5cdGlzRGVmYXVsdD86IGJvb2xlYW4gfCBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblx0LyoqXG5cdCAqIFRoZSB0YXNrJ3MgbmFtZVxuXHQgKi9cblx0dGFza05hbWU/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBVSSBsYWJlbCB1c2VkIGZvciB0aGUgdGFzay5cblx0ICovXG5cdGxhYmVsPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBBbiBvcHRpb25hbCBpZGVudGlmaWVyIHdoaWNoIGNhbiBiZSB1c2VkIHRvIHJlZmVyZW5jZSBhIHRhc2tcblx0ICogaW4gYSBkZXBlbmRzT24gb3Igb3RoZXIgYXR0cmlidXRlcy5cblx0ICovXG5cdGlkZW50aWZpZXI/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGV4ZWN1dGVkIGNvbW1hbmQgaXMga2VwdCBhbGl2ZSBhbmQgcnVucyBpbiB0aGUgYmFja2dyb3VuZC5cblx0ICovXG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHRhc2sgc2hvdWxkIHByb21wdCBvbiBjbG9zZSBmb3IgY29uZmlybWF0aW9uIGlmIHJ1bm5pbmcuXG5cdCAqL1xuXHRwcm9tcHRPbkNsb3NlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRGVmaW5lcyB0aGUgZ3JvdXAgdGhlIHRhc2sgYmVsb25ncyB0b28uXG5cdCAqL1xuXHRncm91cD86IHN0cmluZyB8IElHcm91cEtpbmQ7XG5cblx0LyoqXG5cdCAqIEEgZGVzY3JpcHRpb24gb2YgdGhlIHRhc2suXG5cdCAqL1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBvdGhlciB0YXNrcyB0aGUgdGFzayBkZXBlbmQgb25cblx0ICovXG5cdGRlcGVuZHNPbj86IHN0cmluZyB8IElUYXNrSWRlbnRpZmllciB8IEFycmF5PHN0cmluZyB8IElUYXNrSWRlbnRpZmllcj47XG5cblx0LyoqXG5cdCAqIFRoZSBvcmRlciB0aGUgZGVwZW5kc09uIHRhc2tzIHNob3VsZCBiZSBleGVjdXRlZCBpbi5cblx0ICovXG5cdGRlcGVuZHNPcmRlcj86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIGJlaGF2aW9yIG9mIHRoZSB1c2VkIHRlcm1pbmFsXG5cdCAqL1xuXHRwcmVzZW50YXRpb24/OiBJUHJlc2VudGF0aW9uT3B0aW9uc0NvbmZpZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgc2hlbGwgb3B0aW9ucy5cblx0ICovXG5cdG9wdGlvbnM/OiBJQ29tbWFuZE9wdGlvbnNDb25maWc7XG5cblx0LyoqXG5cdCAqIFRoZSBwcm9ibGVtIG1hdGNoZXIocykgdG8gdXNlIHRvIGNhcHR1cmUgcHJvYmxlbXMgaW4gdGhlIHRhc2tzXG5cdCAqIG91dHB1dC5cblx0ICovXG5cdHByb2JsZW1NYXRjaGVyPzogUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXJUeXBlO1xuXG5cdC8qKlxuXHQgKiBUYXNrIHJ1biBvcHRpb25zLiBDb250cm9sIHJ1biByZWxhdGVkIHByb3BlcnRpZXMuXG5cdCAqL1xuXHRydW5PcHRpb25zPzogSVJ1bk9wdGlvbnNDb25maWc7XG5cblx0LyoqXG5cdCAqIFRoZSBpY29uIGZvciB0aGlzIHRhc2sgaW4gdGhlIHRlcm1pbmFsIHRhYnMgbGlzdFxuXHQgKi9cblx0aWNvbj86IHsgaWQ6IHN0cmluZzsgY29sb3I/OiBzdHJpbmcgfTtcblxuXHQvKipcblx0ICogVGhlIGljb24ncyBjb2xvciBpbiB0aGUgdGVybWluYWwgdGFicyBsaXN0XG5cdCAqL1xuXHRjb2xvcj86IHN0cmluZztcblxuXHQvKipcblx0ICogRG8gbm90IHNob3cgdGhpcyB0YXNrIGluIHRoZSBydW4gdGFzayBxdWlja3BpY2tcblx0ICovXG5cdGhpZGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTaG93IHRoaXMgdGFzayBpbiB0aGUgQWdlbnRzIHJ1biBhY3Rpb24gZHJvcGRvd25cblx0ICovXG5cdGluQWdlbnRzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3VzdG9tVGFzayBleHRlbmRzIElDb21tYW5kUHJvcGVydGllcywgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblx0LyoqXG5cdCAqIEN1c3RvbSB0YXNrcyBoYXZlIHRoZSB0eXBlIENVU1RPTUlaRURfVEFTS19UWVBFXG5cdCAqL1xuXHR0eXBlPzogc3RyaW5nO1xuXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyaW5nVGFzayBleHRlbmRzIElDb25maWd1cmF0aW9uUHJvcGVydGllcyB7XG5cdC8qKlxuXHQgKiBUaGUgY29udHJpYnV0ZWQgdHlwZSBvZiB0aGUgdGFza1xuXHQgKi9cblx0dHlwZT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBUaGUgYmFzZSB0YXNrIHJ1bm5lciBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJhc2VUYXNrUnVubmVyQ29uZmlndXJhdGlvbiB7XG5cblx0LyoqXG5cdCAqIFRoZSBjb21tYW5kIHRvIGJlIGV4ZWN1dGVkLiBDYW4gYmUgYW4gZXh0ZXJuYWwgcHJvZ3JhbSBvciBhIHNoZWxsXG5cdCAqIGNvbW1hbmQuXG5cdCAqL1xuXHRjb21tYW5kPzogQ29tbWFuZFN0cmluZztcblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIHR5cGUgaW5zdGVhZFxuXHQgKlxuXHQgKiBTcGVjaWZpZXMgd2hldGhlciB0aGUgY29tbWFuZCBpcyBhIHNoZWxsIGNvbW1hbmQgYW5kIHRoZXJlZm9yZSBtdXN0XG5cdCAqIGJlIGV4ZWN1dGVkIGluIGEgc2hlbGwgaW50ZXJwcmV0ZXIgKGUuZy4gY21kLmV4ZSwgYmFzaCwgLi4uKS5cblx0ICpcblx0ICogRGVmYXVsdHMgdG8gZmFsc2UgaWYgb21pdHRlZC5cblx0ICovXG5cdGlzU2hlbGxDb21tYW5kPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIHRhc2sgdHlwZVxuXHQgKi9cblx0dHlwZT86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGNvbW1hbmQgb3B0aW9ucyB1c2VkIHdoZW4gdGhlIGNvbW1hbmQgaXMgZXhlY3V0ZWQuIENhbiBiZSBvbWl0dGVkLlxuXHQgKi9cblx0b3B0aW9ucz86IElDb21tYW5kT3B0aW9uc0NvbmZpZztcblxuXHQvKipcblx0ICogVGhlIGFyZ3VtZW50cyBwYXNzZWQgdG8gdGhlIGNvbW1hbmQuIENhbiBiZSBvbWl0dGVkLlxuXHQgKi9cblx0YXJncz86IENvbW1hbmRTdHJpbmdbXTtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgb3V0cHV0IHZpZXcgb2YgdGhlIHJ1bm5pbmcgdGFza3MgaXMgYnJvdWdodCB0byBmcm9udCBvciBub3QuXG5cdCAqIFZhbGlkIHZhbHVlcyBhcmU6XG5cdCAqICAgXCJhbHdheXNcIjogYnJpbmcgdGhlIG91dHB1dCB3aW5kb3cgYWx3YXlzIHRvIGZyb250IHdoZW4gYSB0YXNrIGlzIGV4ZWN1dGVkLlxuXHQgKiAgIFwic2lsZW50XCI6IG9ubHkgYnJpbmcgaXQgdG8gZnJvbnQgaWYgbm8gcHJvYmxlbSBtYXRjaGVyIGlzIGRlZmluZWQgZm9yIHRoZSB0YXNrIGV4ZWN1dGVkLlxuXHQgKiAgIFwibmV2ZXJcIjogbmV2ZXIgYnJpbmcgdGhlIG91dHB1dCB3aW5kb3cgdG8gZnJvbnQuXG5cdCAqXG5cdCAqIElmIG9taXR0ZWQgXCJhbHdheXNcIiBpcyB1c2VkLlxuXHQgKi9cblx0c2hvd091dHB1dD86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgZXhlY3V0ZWQgY29tbWFuZCBpcyBwcmludGVkIHRvIHRoZSBvdXRwdXQgd2luZG93cyBhcyB3ZWxsLlxuXHQgKi9cblx0ZWNob0NvbW1hbmQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgZ3JvdXBcblx0ICovXG5cdGdyb3VwPzogc3RyaW5nIHwgSUdyb3VwS2luZDtcblxuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIGJlaGF2aW9yIG9mIHRoZSB1c2VkIHRlcm1pbmFsXG5cdCAqL1xuXHRwcmVzZW50YXRpb24/OiBJUHJlc2VudGF0aW9uT3B0aW9uc0NvbmZpZztcblxuXHQvKipcblx0ICogSWYgc2V0IHRvIGZhbHNlIHRoZSB0YXNrIG5hbWUgaXMgYWRkZWQgYXMgYW4gYWRkaXRpb25hbCBhcmd1bWVudCB0byB0aGVcblx0ICogY29tbWFuZCB3aGVuIGV4ZWN1dGVkLiBJZiBzZXQgdG8gdHJ1ZSB0aGUgdGFzayBuYW1lIGlzIHN1cHByZXNzZWQuIElmXG5cdCAqIG9taXR0ZWQgZmFsc2UgaXMgdXNlZC5cblx0ICovXG5cdHN1cHByZXNzVGFza05hbWU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBTb21lIGNvbW1hbmRzIHJlcXVpcmUgdGhhdCB0aGUgdGFzayBhcmd1bWVudCBpcyBoaWdobGlnaHRlZCB3aXRoIGEgc3BlY2lhbFxuXHQgKiBwcmVmaXggKGUuZy4gL3Q6IGZvciBtc2J1aWxkKS4gVGhpcyBwcm9wZXJ0eSBjYW4gYmUgdXNlZCB0byBjb250cm9sIHN1Y2hcblx0ICogYSBwcmVmaXguXG5cdCAqL1xuXHR0YXNrU2VsZWN0b3I/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBwcm9ibGVtIG1hdGNoZXIocykgdG8gdXNlZCBpZiBhIGdsb2JhbCBjb21tYW5kIGlzIGV4ZWN1dGVkIChlLmcuIG5vIHRhc2tzXG5cdCAqIGFyZSBkZWZpbmVkKS4gQSB0YXNrcy5qc29uIGZpbGUgY2FuIGVpdGhlciBjb250YWluIGEgZ2xvYmFsIHByb2JsZW1NYXRjaGVyXG5cdCAqIHByb3BlcnR5IG9yIGEgdGFza3MgcHJvcGVydHkgYnV0IG5vdCBib3RoLlxuXHQgKi9cblx0cHJvYmxlbU1hdGNoZXI/OiBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlclR5cGU7XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFVzZSBgaXNCYWNrZ3JvdW5kYCBpbnN0ZWFkLlxuXHQgKlxuXHQgKiBTcGVjaWZpZXMgd2hldGhlciBhIGdsb2JhbCBjb21tYW5kIGlzIGEgd2F0Y2hpbmcgdGhlIGZpbGVzeXN0ZW0uIEEgdGFzay5qc29uXG5cdCAqIGZpbGUgY2FuIGVpdGhlciBjb250YWluIGEgZ2xvYmFsIGlzV2F0Y2hpbmcgcHJvcGVydHkgb3IgYSB0YXNrcyBwcm9wZXJ0eVxuXHQgKiBidXQgbm90IGJvdGguXG5cdCAqL1xuXHRpc1dhdGNoaW5nPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU3BlY2lmaWVzIHdoZXRoZXIgYSBnbG9iYWwgY29tbWFuZCBpcyBhIGJhY2tncm91bmQgdGFzay5cblx0ICovXG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHRhc2sgc2hvdWxkIHByb21wdCBvbiBjbG9zZSBmb3IgY29uZmlybWF0aW9uIGlmIHJ1bm5pbmcuXG5cdCAqL1xuXHRwcm9tcHRPbkNsb3NlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVGhlIGNvbmZpZ3VyYXRpb24gb2YgdGhlIGF2YWlsYWJsZSB0YXNrcy4gQSB0YXNrcy5qc29uIGZpbGUgY2FuIGVpdGhlclxuXHQgKiBjb250YWluIGEgZ2xvYmFsIHByb2JsZW1NYXRjaGVyIHByb3BlcnR5IG9yIGEgdGFza3MgcHJvcGVydHkgYnV0IG5vdCBib3RoLlxuXHQgKi9cblx0dGFza3M/OiBBcnJheTxJQ3VzdG9tVGFzayB8IElDb25maWd1cmluZ1Rhc2s+O1xuXG5cdC8qKlxuXHQgKiBQcm9ibGVtIG1hdGNoZXIgZGVjbGFyYXRpb25zLlxuXHQgKi9cblx0ZGVjbGFyZXM/OiBQcm9ibGVtTWF0Y2hlckNvbmZpZy5JTmFtZWRQcm9ibGVtTWF0Y2hlcltdO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCB1c2VyIGlucHV0IHZhcmlhYmxlcy5cblx0ICovXG5cdGlucHV0cz86IENvbmZpZ3VyZWRJbnB1dFtdO1xufVxuXG4vKipcbiAqIEEgY29uZmlndXJhdGlvbiBvZiBhbiBleHRlcm5hbCBidWlsZCBzeXN0ZW0uIEJ1aWxkQ29uZmlndXJhdGlvbi5idWlsZFN5c3RlbVxuICogbXVzdCBiZSBzZXQgdG8gJ3Byb2dyYW0nXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gZXh0ZW5kcyBJQmFzZVRhc2tSdW5uZXJDb25maWd1cmF0aW9uIHtcblxuXHRfcnVubmVyPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBEZXRlcm1pbmVzIHRoZSBydW5uZXIgdG8gdXNlXG5cdCAqL1xuXHRydW5uZXI/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBjb25maWcncyB2ZXJzaW9uIG51bWJlclxuXHQgKi9cblx0dmVyc2lvbjogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaW5kb3dzIHNwZWNpZmljIHRhc2sgY29uZmlndXJhdGlvblxuXHQgKi9cblx0d2luZG93cz86IElCYXNlVGFza1J1bm5lckNvbmZpZ3VyYXRpb247XG5cblx0LyoqXG5cdCAqIE1hYyBzcGVjaWZpYyB0YXNrIGNvbmZpZ3VyYXRpb25cblx0ICovXG5cdG9zeD86IElCYXNlVGFza1J1bm5lckNvbmZpZ3VyYXRpb247XG5cblx0LyoqXG5cdCAqIExpbnV4IHNwZWNpZmljIHRhc2sgY29uZmlndXJhdGlvblxuXHQgKi9cblx0bGludXg/OiBJQmFzZVRhc2tSdW5uZXJDb25maWd1cmF0aW9uO1xufVxuXG5lbnVtIFByb2JsZW1NYXRjaGVyS2luZCB7XG5cdFVua25vd24sXG5cdFN0cmluZyxcblx0UHJvYmxlbU1hdGNoZXIsXG5cdEFycmF5XG59XG5cbnR5cGUgVGFza0NvbmZpZ3VyYXRpb25WYWx1ZVdpdGhFcnJvcnM8VD4gPSB7XG5cdHZhbHVlPzogVDtcblx0ZXJyb3JzPzogc3RyaW5nW107XG59O1xuXG5jb25zdCBFTVBUWV9BUlJBWTogbmV2ZXJbXSA9IFtdO1xuT2JqZWN0LmZyZWV6ZShFTVBUWV9BUlJBWSk7XG5cbmZ1bmN0aW9uIGFzc2lnblByb3BlcnR5PFQsIEsgZXh0ZW5kcyBrZXlvZiBUPih0YXJnZXQ6IFQsIHNvdXJjZTogUGFydGlhbDxUPiwga2V5OiBLKSB7XG5cdGNvbnN0IHNvdXJjZUF0S2V5ID0gc291cmNlW2tleV07XG5cdGlmIChzb3VyY2VBdEtleSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0dGFyZ2V0W2tleV0gPSBzb3VyY2VBdEtleSE7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmlsbFByb3BlcnR5PFQsIEsgZXh0ZW5kcyBrZXlvZiBUPih0YXJnZXQ6IFQsIHNvdXJjZTogUGFydGlhbDxUPiwga2V5OiBLKSB7XG5cdGNvbnN0IHNvdXJjZUF0S2V5ID0gc291cmNlW2tleV07XG5cdGlmICh0YXJnZXRba2V5XSA9PT0gdW5kZWZpbmVkICYmIHNvdXJjZUF0S2V5ICE9PSB1bmRlZmluZWQpIHtcblx0XHR0YXJnZXRba2V5XSA9IHNvdXJjZUF0S2V5ITtcblx0fVxufVxuXG5cbmludGVyZmFjZSBJUGFyc2VyVHlwZTxUPiB7XG5cdGlzRW1wdHkodmFsdWU6IFQgfCB1bmRlZmluZWQpOiBib29sZWFuO1xuXHRhc3NpZ25Qcm9wZXJ0aWVzKHRhcmdldDogVCB8IHVuZGVmaW5lZCwgc291cmNlOiBUIHwgdW5kZWZpbmVkKTogVCB8IHVuZGVmaW5lZDtcblx0ZmlsbFByb3BlcnRpZXModGFyZ2V0OiBUIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFQgfCB1bmRlZmluZWQpOiBUIHwgdW5kZWZpbmVkO1xuXHRmaWxsRGVmYXVsdHModmFsdWU6IFQgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUIHwgdW5kZWZpbmVkO1xuXHRmcmVlemUodmFsdWU6IFQpOiBSZWFkb25seTxUPiB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElNZXRhRGF0YTxULCBVPiB7XG5cdHByb3BlcnR5OiBrZXlvZiBUO1xuXHR0eXBlPzogSVBhcnNlclR5cGU8VT47XG59XG5cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgLS0gSU1ldGFEYXRhIGFycmF5IGhvbGRzIGhldGVyb2dlbmVvdXMgcGFyc2VyIHR5cGVzXG5mdW5jdGlvbiBfaXNFbXB0eTxUPih0aGlzOiB2b2lkLCB2YWx1ZTogVCB8IHVuZGVmaW5lZCwgcHJvcGVydGllczogSU1ldGFEYXRhPFQsIGFueT5bXSB8IHVuZGVmaW5lZCwgYWxsb3dFbXB0eUFycmF5OiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwgfHwgcHJvcGVydGllcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Zm9yIChjb25zdCBtZXRhIG9mIHByb3BlcnRpZXMpIHtcblx0XHRjb25zdCBwcm9wZXJ0eSA9IHZhbHVlW21ldGEucHJvcGVydHldO1xuXHRcdGlmIChwcm9wZXJ0eSAhPT0gdW5kZWZpbmVkICYmIHByb3BlcnR5ICE9PSBudWxsKSB7XG5cdFx0XHRpZiAobWV0YS50eXBlICE9PSB1bmRlZmluZWQgJiYgIW1ldGEudHlwZS5pc0VtcHR5KHByb3BlcnR5KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHByb3BlcnR5KSB8fCAocHJvcGVydHkubGVuZ3RoID4gMCkgfHwgYWxsb3dFbXB0eUFycmF5KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55IC0tIElNZXRhRGF0YSBhcnJheSBob2xkcyBoZXRlcm9nZW5lb3VzIHBhcnNlciB0eXBlc1xuZnVuY3Rpb24gX2Fzc2lnblByb3BlcnRpZXM8VD4odGhpczogdm9pZCwgdGFyZ2V0OiBUIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFQgfCB1bmRlZmluZWQsIHByb3BlcnRpZXM6IElNZXRhRGF0YTxULCBhbnk+W10pOiBUIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzb3VyY2UgfHwgX2lzRW1wdHkoc291cmNlLCBwcm9wZXJ0aWVzKSkge1xuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblx0aWYgKCF0YXJnZXQgfHwgX2lzRW1wdHkodGFyZ2V0LCBwcm9wZXJ0aWVzKSkge1xuXHRcdHJldHVybiBzb3VyY2U7XG5cdH1cblx0Zm9yIChjb25zdCBtZXRhIG9mIHByb3BlcnRpZXMpIHtcblx0XHRjb25zdCBwcm9wZXJ0eSA9IG1ldGEucHJvcGVydHk7XG5cdFx0bGV0IHZhbHVlOiBUW2tleW9mIFRdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChtZXRhLnR5cGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWUgPSBtZXRhLnR5cGUuYXNzaWduUHJvcGVydGllcyh0YXJnZXRbcHJvcGVydHldLCBzb3VyY2VbcHJvcGVydHldKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsdWUgPSBzb3VyY2VbcHJvcGVydHldO1xuXHRcdH1cblx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0KHRhcmdldCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcHJvcGVydHkgYXMgc3RyaW5nXSA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdGFyZ2V0O1xufVxuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAtLSBJTWV0YURhdGEgYXJyYXkgaG9sZHMgaGV0ZXJvZ2VuZW91cyBwYXJzZXIgdHlwZXNcbmZ1bmN0aW9uIF9maWxsUHJvcGVydGllczxUPih0aGlzOiB2b2lkLCB0YXJnZXQ6IFQgfCB1bmRlZmluZWQsIHNvdXJjZTogVCB8IHVuZGVmaW5lZCwgcHJvcGVydGllczogSU1ldGFEYXRhPFQsIGFueT5bXSB8IHVuZGVmaW5lZCwgYWxsb3dFbXB0eUFycmF5OiBib29sZWFuID0gZmFsc2UpOiBUIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzb3VyY2UgfHwgX2lzRW1wdHkoc291cmNlLCBwcm9wZXJ0aWVzKSkge1xuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblx0aWYgKCF0YXJnZXQgfHwgX2lzRW1wdHkodGFyZ2V0LCBwcm9wZXJ0aWVzLCBhbGxvd0VtcHR5QXJyYXkpKSB7XG5cdFx0cmV0dXJuIHNvdXJjZTtcblx0fVxuXHRmb3IgKGNvbnN0IG1ldGEgb2YgcHJvcGVydGllcyEpIHtcblx0XHRjb25zdCBwcm9wZXJ0eSA9IG1ldGEucHJvcGVydHk7XG5cdFx0bGV0IHZhbHVlOiBUW2tleW9mIFRdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChtZXRhLnR5cGUpIHtcblx0XHRcdHZhbHVlID0gbWV0YS50eXBlLmZpbGxQcm9wZXJ0aWVzKHRhcmdldFtwcm9wZXJ0eV0sIHNvdXJjZVtwcm9wZXJ0eV0pO1xuXHRcdH0gZWxzZSBpZiAodGFyZ2V0W3Byb3BlcnR5XSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZSA9IHNvdXJjZVtwcm9wZXJ0eV07XG5cdFx0fVxuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHQodGFyZ2V0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwcm9wZXJ0eSBhcyBzdHJpbmddID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0YXJnZXQ7XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55IC0tIElNZXRhRGF0YSBhcnJheSBob2xkcyBoZXRlcm9nZW5lb3VzIHBhcnNlciB0eXBlc1xuZnVuY3Rpb24gX2ZpbGxEZWZhdWx0czxUPih0aGlzOiB2b2lkLCB0YXJnZXQ6IFQgfCB1bmRlZmluZWQsIGRlZmF1bHRzOiBUIHwgdW5kZWZpbmVkLCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VCwgYW55PltdLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVCB8IHVuZGVmaW5lZCB7XG5cdGlmICh0YXJnZXQgJiYgT2JqZWN0LmlzRnJvemVuKHRhcmdldCkpIHtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cdGlmICh0YXJnZXQgPT09IHVuZGVmaW5lZCB8fCB0YXJnZXQgPT09IG51bGwgfHwgZGVmYXVsdHMgPT09IHVuZGVmaW5lZCB8fCBkZWZhdWx0cyA9PT0gbnVsbCkge1xuXHRcdGlmIChkZWZhdWx0cyAhPT0gdW5kZWZpbmVkICYmIGRlZmF1bHRzICE9PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0cy5kZWVwQ2xvbmUoZGVmYXVsdHMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXHRmb3IgKGNvbnN0IG1ldGEgb2YgcHJvcGVydGllcykge1xuXHRcdGNvbnN0IHByb3BlcnR5ID0gbWV0YS5wcm9wZXJ0eTtcblx0XHRpZiAodGFyZ2V0W3Byb3BlcnR5XSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0bGV0IHZhbHVlOiBUW2tleW9mIFRdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChtZXRhLnR5cGUpIHtcblx0XHRcdHZhbHVlID0gbWV0YS50eXBlLmZpbGxEZWZhdWx0cyh0YXJnZXRbcHJvcGVydHldLCBjb250ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsdWUgPSBkZWZhdWx0c1twcm9wZXJ0eV07XG5cdFx0fVxuXG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwpIHtcblx0XHRcdCh0YXJnZXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3Byb3BlcnR5IGFzIHN0cmluZ10gPSB2YWx1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRhcmdldDtcbn1cblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgLS0gSU1ldGFEYXRhIGFycmF5IGhvbGRzIGhldGVyb2dlbmVvdXMgcGFyc2VyIHR5cGVzXG5mdW5jdGlvbiBfZnJlZXplPFQ+KHRoaXM6IHZvaWQsIHRhcmdldDogVCwgcHJvcGVydGllczogSU1ldGFEYXRhPFQsIGFueT5bXSk6IFJlYWRvbmx5PFQ+IHwgdW5kZWZpbmVkIHtcblx0aWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkIHx8IHRhcmdldCA9PT0gbnVsbCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKE9iamVjdC5pc0Zyb3plbih0YXJnZXQpKSB7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXHRmb3IgKGNvbnN0IG1ldGEgb2YgcHJvcGVydGllcykge1xuXHRcdGlmIChtZXRhLnR5cGUpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGFyZ2V0W21ldGEucHJvcGVydHldO1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdG1ldGEudHlwZS5mcmVlemUodmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRPYmplY3QuZnJlZXplKHRhcmdldCk7XG5cdHJldHVybiB0YXJnZXQ7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUnVuT25PcHRpb25zIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TdHJpbmcodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFRhc2tzLlJ1bk9uT3B0aW9ucyB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIFRhc2tzLlJ1bk9uT3B0aW9ucy5kZWZhdWx0O1xuXHRcdH1cblx0XHRzd2l0Y2ggKHZhbHVlLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdGNhc2UgJ2ZvbGRlcm9wZW4nOlxuXHRcdFx0XHRyZXR1cm4gVGFza3MuUnVuT25PcHRpb25zLmZvbGRlck9wZW47XG5cdFx0XHRjYXNlICd3b3JrdHJlZWNyZWF0ZWQnOlxuXHRcdFx0XHRyZXR1cm4gVGFza3MuUnVuT25PcHRpb25zLndvcmt0cmVlQ3JlYXRlZDtcblx0XHRcdGNhc2UgJ2RlZmF1bHQnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLlJ1bk9uT3B0aW9ucy5kZWZhdWx0O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFJ1bk9wdGlvbnMge1xuXHRjb25zdCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VGFza3MuSVJ1bk9wdGlvbnMsIHZvaWQ+W10gPSBbeyBwcm9wZXJ0eTogJ3JlZXZhbHVhdGVPblJlcnVuJyB9LCB7IHByb3BlcnR5OiAncnVuT24nIH0sIHsgcHJvcGVydHk6ICdpbnN0YW5jZUxpbWl0JyB9LCB7IHByb3BlcnR5OiAnaW5zdGFuY2VQb2xpY3knIH1dO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbUNvbmZpZ3VyYXRpb24odmFsdWU6IElSdW5PcHRpb25zQ29uZmlnIHwgdW5kZWZpbmVkKTogVGFza3MuSVJ1bk9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZWV2YWx1YXRlT25SZXJ1bjogdmFsdWUgPyB2YWx1ZS5yZWV2YWx1YXRlT25SZXJ1biA6IHRydWUsXG5cdFx0XHRydW5PbjogdmFsdWUgPyBSdW5Pbk9wdGlvbnMuZnJvbVN0cmluZyh2YWx1ZS5ydW5PbikgOiBUYXNrcy5SdW5Pbk9wdGlvbnMuZGVmYXVsdCxcblx0XHRcdGluc3RhbmNlTGltaXQ6IHZhbHVlPy5pbnN0YW5jZUxpbWl0ID8gTWF0aC5tYXgodmFsdWUuaW5zdGFuY2VMaW1pdCwgMSkgOiAxLFxuXHRcdFx0aW5zdGFuY2VQb2xpY3k6IHZhbHVlID8gSW5zdGFuY2VQb2xpY3kuZnJvbVN0cmluZyh2YWx1ZS5pbnN0YW5jZVBvbGljeSkgOiBUYXNrcy5JbnN0YW5jZVBvbGljeS5wcm9tcHRcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGFzc2lnblByb3BlcnRpZXModGFyZ2V0OiBUYXNrcy5JUnVuT3B0aW9ucywgc291cmNlOiBUYXNrcy5JUnVuT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFRhc2tzLklSdW5PcHRpb25zIHtcblx0XHRyZXR1cm4gX2Fzc2lnblByb3BlcnRpZXModGFyZ2V0LCBzb3VyY2UsIHByb3BlcnRpZXMpITtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWxsUHJvcGVydGllcyh0YXJnZXQ6IFRhc2tzLklSdW5PcHRpb25zLCBzb3VyY2U6IFRhc2tzLklSdW5PcHRpb25zIHwgdW5kZWZpbmVkKTogVGFza3MuSVJ1bk9wdGlvbnMge1xuXHRcdHJldHVybiBfZmlsbFByb3BlcnRpZXModGFyZ2V0LCBzb3VyY2UsIHByb3BlcnRpZXMpITtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEluc3RhbmNlUG9saWN5IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TdHJpbmcodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFRhc2tzLkluc3RhbmNlUG9saWN5IHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gVGFza3MuSW5zdGFuY2VQb2xpY3kucHJvbXB0O1xuXHRcdH1cblx0XHRzd2l0Y2ggKHZhbHVlLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdGNhc2UgJ3Rlcm1pbmF0ZW5ld2VzdCc6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5JbnN0YW5jZVBvbGljeS50ZXJtaW5hdGVOZXdlc3Q7XG5cdFx0XHRjYXNlICd0ZXJtaW5hdGVvbGRlc3QnOlxuXHRcdFx0XHRyZXR1cm4gVGFza3MuSW5zdGFuY2VQb2xpY3kudGVybWluYXRlT2xkZXN0O1xuXHRcdFx0Y2FzZSAnd2Fybic6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5JbnN0YW5jZVBvbGljeS53YXJuO1xuXHRcdFx0Y2FzZSAnc2lsZW50Jzpcblx0XHRcdFx0cmV0dXJuIFRhc2tzLkluc3RhbmNlUG9saWN5LnNpbGVudDtcblx0XHRcdGNhc2UgJ3Byb21wdCc6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gVGFza3MuSW5zdGFuY2VQb2xpY3kucHJvbXB0O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQYXJzZUNvbnRleHQge1xuXHR3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXI7XG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0cHJvYmxlbVJlcG9ydGVyOiBJUHJvYmxlbVJlcG9ydGVyO1xuXHRuYW1lZFByb2JsZW1NYXRjaGVyczogSVN0cmluZ0RpY3Rpb25hcnk8SU5hbWVkUHJvYmxlbU1hdGNoZXI+O1xuXHR1dWlkTWFwOiBVVUlETWFwO1xuXHRlbmdpbmU6IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZTtcblx0c2NoZW1hVmVyc2lvbjogVGFza3MuSnNvblNjaGVtYVZlcnNpb247XG5cdHBsYXRmb3JtOiBQbGF0Zm9ybTtcblx0dGFza0xvYWRJc3N1ZXM6IHN0cmluZ1tdO1xuXHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xufVxuXG5cbm5hbWVzcGFjZSBTaGVsbENvbmZpZ3VyYXRpb24ge1xuXG5cdGNvbnN0IHByb3BlcnRpZXM6IElNZXRhRGF0YTxUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uLCB2b2lkPltdID0gW3sgcHJvcGVydHk6ICdleGVjdXRhYmxlJyB9LCB7IHByb3BlcnR5OiAnYXJncycgfSwgeyBwcm9wZXJ0eTogJ3F1b3RpbmcnIH1dO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIElTaGVsbENvbmZpZ3VyYXRpb24ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZTogSVNoZWxsQ29uZmlndXJhdGlvbiA9IHZhbHVlIGFzIElTaGVsbENvbmZpZ3VyYXRpb247XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiAoVHlwZXMuaXNTdHJpbmcoY2FuZGlkYXRlLmV4ZWN1dGFibGUpIHx8IFR5cGVzLmlzU3RyaW5nQXJyYXkoY2FuZGlkYXRlLmFyZ3MpKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGNvbmZpZzogSVNoZWxsQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXMoY29uZmlnKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJU2hlbGxDb25maWd1cmF0aW9uID0ge307XG5cdFx0aWYgKGNvbmZpZy5leGVjdXRhYmxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5leGVjdXRhYmxlID0gY29uZmlnLmV4ZWN1dGFibGU7XG5cdFx0fVxuXHRcdGlmIChjb25maWcuYXJncyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQuYXJncyA9IGNvbmZpZy5hcmdzLnNsaWNlKCk7XG5cdFx0fVxuXHRcdGlmIChjb25maWcucXVvdGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQucXVvdGluZyA9IE9iamVjdHMuZGVlcENsb25lKGNvbmZpZy5xdW90aW5nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHkodGhpczogdm9pZCwgdmFsdWU6IFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gX2lzRW1wdHkodmFsdWUsIHByb3BlcnRpZXMsIHRydWUpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGFzc2lnblByb3BlcnRpZXModGhpczogdm9pZCwgdGFyZ2V0OiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkLCBzb3VyY2U6IFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQpOiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gX2Fzc2lnblByb3BlcnRpZXModGFyZ2V0LCBzb3VyY2UsIHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxQcm9wZXJ0aWVzKHRoaXM6IHZvaWQsIHRhcmdldDogVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbiwgc291cmNlOiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uKTogVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIF9maWxsUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcywgdHJ1ZSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbERlZmF1bHRzKHRoaXM6IHZvaWQsIHZhbHVlOiBUYXNrcy5JU2hlbGxDb25maWd1cmF0aW9uLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbiB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyZWV6ZSh0aGlzOiB2b2lkLCB2YWx1ZTogVGFza3MuSVNoZWxsQ29uZmlndXJhdGlvbik6IFJlYWRvbmx5PFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh2YWx1ZSk7XG5cdH1cbn1cblxubmFtZXNwYWNlIENvbW1hbmRPcHRpb25zIHtcblxuXHRjb25zdCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VGFza3MuQ29tbWFuZE9wdGlvbnMsIFRhc2tzLklTaGVsbENvbmZpZ3VyYXRpb24+W10gPSBbeyBwcm9wZXJ0eTogJ2N3ZCcgfSwgeyBwcm9wZXJ0eTogJ2VudicgfSwgeyBwcm9wZXJ0eTogJ3NoZWxsJywgdHlwZTogU2hlbGxDb25maWd1cmF0aW9uIH1dO1xuXHRjb25zdCBkZWZhdWx0czogSUNvbW1hbmRPcHRpb25zQ29uZmlnID0geyBjd2Q6ICcke3dvcmtzcGFjZUZvbGRlcn0nIH07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgb3B0aW9uczogSUNvbW1hbmRPcHRpb25zQ29uZmlnLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza3MuQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdDogVGFza3MuQ29tbWFuZE9wdGlvbnMgPSB7fTtcblx0XHRpZiAob3B0aW9ucy5jd2QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKG9wdGlvbnMuY3dkKSkge1xuXHRcdFx0XHRyZXN1bHQuY3dkID0gb3B0aW9ucy5jd2Q7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250ZXh0LnRhc2tMb2FkSXNzdWVzLnB1c2gobmxzLmxvY2FsaXplKCdDb25maWd1cmF0aW9uUGFyc2VyLmludmFsaWRDV0QnLCAnV2FybmluZzogb3B0aW9ucy5jd2QgbXVzdCBiZSBvZiB0eXBlIHN0cmluZy4gSWdub3JpbmcgdmFsdWUgezB9XFxuJywgb3B0aW9ucy5jd2QpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuZW52ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5lbnYgPSBPYmplY3RzLmRlZXBDbG9uZShvcHRpb25zLmVudik7XG5cdFx0fVxuXHRcdHJlc3VsdC5zaGVsbCA9IFNoZWxsQ29uZmlndXJhdGlvbi5mcm9tKG9wdGlvbnMuc2hlbGwsIGNvbnRleHQpO1xuXHRcdHJldHVybiBpc0VtcHR5KHJlc3VsdCkgPyB1bmRlZmluZWQgOiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNFbXB0eSh2YWx1ZTogVGFza3MuQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gX2lzRW1wdHkodmFsdWUsIHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGFzc2lnblByb3BlcnRpZXModGFyZ2V0OiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCwgc291cmNlOiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCk6IFRhc2tzLkNvbW1hbmRPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoKHNvdXJjZSA9PT0gdW5kZWZpbmVkKSB8fCBpc0VtcHR5KHNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0fVxuXHRcdGlmICgodGFyZ2V0ID09PSB1bmRlZmluZWQpIHx8IGlzRW1wdHkodGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHNvdXJjZTtcblx0XHR9XG5cdFx0YXNzaWduUHJvcGVydHkodGFyZ2V0LCBzb3VyY2UsICdjd2QnKTtcblx0XHRpZiAodGFyZ2V0LmVudiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0YXJnZXQuZW52ID0gc291cmNlLmVudjtcblx0XHR9IGVsc2UgaWYgKHNvdXJjZS5lbnYgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgZW52OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGlmICh0YXJnZXQuZW52ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0T2JqZWN0LmtleXModGFyZ2V0LmVudikuZm9yRWFjaChrZXkgPT4gZW52W2tleV0gPSB0YXJnZXQuZW52IVtrZXldKTtcblx0XHRcdH1cblx0XHRcdGlmIChzb3VyY2UuZW52ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0T2JqZWN0LmtleXMoc291cmNlLmVudikuZm9yRWFjaChrZXkgPT4gZW52W2tleV0gPSBzb3VyY2UuZW52IVtrZXldKTtcblx0XHRcdH1cblx0XHRcdHRhcmdldC5lbnYgPSBlbnY7XG5cdFx0fVxuXHRcdHRhcmdldC5zaGVsbCA9IFNoZWxsQ29uZmlndXJhdGlvbi5hc3NpZ25Qcm9wZXJ0aWVzKHRhcmdldC5zaGVsbCwgc291cmNlLnNoZWxsKTtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxQcm9wZXJ0aWVzKHRhcmdldDogVGFza3MuQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQsIHNvdXJjZTogVGFza3MuQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQpOiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIF9maWxsUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcyk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbERlZmF1bHRzKHZhbHVlOiBUYXNrcy5Db21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IFRhc2tzLkNvbW1hbmRPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gX2ZpbGxEZWZhdWx0cyh2YWx1ZSwgZGVmYXVsdHMsIHByb3BlcnRpZXMsIGNvbnRleHQpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyZWV6ZSh2YWx1ZTogVGFza3MuQ29tbWFuZE9wdGlvbnMpOiBSZWFkb25seTxUYXNrcy5Db21tYW5kT3B0aW9ucz4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBfZnJlZXplKHZhbHVlLCBwcm9wZXJ0aWVzKTtcblx0fVxufVxuXG5uYW1lc3BhY2UgQ29tbWFuZENvbmZpZ3VyYXRpb24ge1xuXG5cdGV4cG9ydCBuYW1lc3BhY2UgUHJlc2VudGF0aW9uT3B0aW9ucyB7XG5cdFx0Y29uc3QgcHJvcGVydGllczogSU1ldGFEYXRhPFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zLCB2b2lkPltdID0gW3sgcHJvcGVydHk6ICdlY2hvJyB9LCB7IHByb3BlcnR5OiAncmV2ZWFsJyB9LCB7IHByb3BlcnR5OiAncmV2ZWFsUHJvYmxlbXMnIH0sIHsgcHJvcGVydHk6ICdmb2N1cycgfSwgeyBwcm9wZXJ0eTogJ3BhbmVsJyB9LCB7IHByb3BlcnR5OiAnc2hvd1JldXNlTWVzc2FnZScgfSwgeyBwcm9wZXJ0eTogJ2NsZWFyJyB9LCB7IHByb3BlcnR5OiAnZ3JvdXAnIH0sIHsgcHJvcGVydHk6ICdjbG9zZScgfSwgeyBwcm9wZXJ0eTogJ3ByZXNlcnZlVGVybWluYWxOYW1lJyB9XTtcblxuXHRcdGludGVyZmFjZSBJUHJlc2VudGF0aW9uT3B0aW9uc1NoYXBlIGV4dGVuZHMgSUxlZ2FjeUNvbW1hbmRQcm9wZXJ0aWVzIHtcblx0XHRcdHByZXNlbnRhdGlvbj86IElQcmVzZW50YXRpb25PcHRpb25zQ29uZmlnO1xuXHRcdH1cblxuXHRcdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGNvbmZpZzogSVByZXNlbnRhdGlvbk9wdGlvbnNTaGFwZSwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRcdGxldCBlY2hvOiBib29sZWFuO1xuXHRcdFx0bGV0IHJldmVhbDogVGFza3MuUmV2ZWFsS2luZDtcblx0XHRcdGxldCByZXZlYWxQcm9ibGVtczogVGFza3MuUmV2ZWFsUHJvYmxlbUtpbmQ7XG5cdFx0XHRsZXQgZm9jdXM6IGJvb2xlYW47XG5cdFx0XHRsZXQgcGFuZWw6IFRhc2tzLlBhbmVsS2luZDtcblx0XHRcdGxldCBzaG93UmV1c2VNZXNzYWdlOiBib29sZWFuO1xuXHRcdFx0bGV0IGNsZWFyOiBib29sZWFuO1xuXHRcdFx0bGV0IGdyb3VwOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY2xvc2U6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgcHJlc2VydmVUZXJtaW5hbE5hbWU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaGFzUHJvcHMgPSBmYWxzZTtcblx0XHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4oY29uZmlnLmVjaG9Db21tYW5kKSkge1xuXHRcdFx0XHRlY2hvID0gY29uZmlnLmVjaG9Db21tYW5kO1xuXHRcdFx0XHRoYXNQcm9wcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoY29uZmlnLnNob3dPdXRwdXQpKSB7XG5cdFx0XHRcdHJldmVhbCA9IFRhc2tzLlJldmVhbEtpbmQuZnJvbVN0cmluZyhjb25maWcuc2hvd091dHB1dCk7XG5cdFx0XHRcdGhhc1Byb3BzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGNvbmZpZy5wcmVzZW50YXRpb24gfHwgY29uZmlnLnRlcm1pbmFsO1xuXHRcdFx0aWYgKHByZXNlbnRhdGlvbikge1xuXHRcdFx0XHRpZiAoVHlwZXMuaXNCb29sZWFuKHByZXNlbnRhdGlvbi5lY2hvKSkge1xuXHRcdFx0XHRcdGVjaG8gPSBwcmVzZW50YXRpb24uZWNobztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcocHJlc2VudGF0aW9uLnJldmVhbCkpIHtcblx0XHRcdFx0XHRyZXZlYWwgPSBUYXNrcy5SZXZlYWxLaW5kLmZyb21TdHJpbmcocHJlc2VudGF0aW9uLnJldmVhbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHByZXNlbnRhdGlvbi5yZXZlYWxQcm9ibGVtcykpIHtcblx0XHRcdFx0XHRyZXZlYWxQcm9ibGVtcyA9IFRhc2tzLlJldmVhbFByb2JsZW1LaW5kLmZyb21TdHJpbmcocHJlc2VudGF0aW9uLnJldmVhbFByb2JsZW1zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNCb29sZWFuKHByZXNlbnRhdGlvbi5mb2N1cykpIHtcblx0XHRcdFx0XHRmb2N1cyA9IHByZXNlbnRhdGlvbi5mb2N1cztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcocHJlc2VudGF0aW9uLnBhbmVsKSkge1xuXHRcdFx0XHRcdHBhbmVsID0gVGFza3MuUGFuZWxLaW5kLmZyb21TdHJpbmcocHJlc2VudGF0aW9uLnBhbmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNCb29sZWFuKHByZXNlbnRhdGlvbi5zaG93UmV1c2VNZXNzYWdlKSkge1xuXHRcdFx0XHRcdHNob3dSZXVzZU1lc3NhZ2UgPSBwcmVzZW50YXRpb24uc2hvd1JldXNlTWVzc2FnZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNCb29sZWFuKHByZXNlbnRhdGlvbi5jbGVhcikpIHtcblx0XHRcdFx0XHRjbGVhciA9IHByZXNlbnRhdGlvbi5jbGVhcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcocHJlc2VudGF0aW9uLmdyb3VwKSkge1xuXHRcdFx0XHRcdGdyb3VwID0gcHJlc2VudGF0aW9uLmdyb3VwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4ocHJlc2VudGF0aW9uLmNsb3NlKSkge1xuXHRcdFx0XHRcdGNsb3NlID0gcHJlc2VudGF0aW9uLmNsb3NlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4ocHJlc2VudGF0aW9uLnByZXNlcnZlVGVybWluYWxOYW1lKSkge1xuXHRcdFx0XHRcdHByZXNlcnZlVGVybWluYWxOYW1lID0gcHJlc2VudGF0aW9uLnByZXNlcnZlVGVybWluYWxOYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGhhc1Byb3BzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghaGFzUHJvcHMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGVjaG86IGVjaG8hLCByZXZlYWw6IHJldmVhbCEsIHJldmVhbFByb2JsZW1zOiByZXZlYWxQcm9ibGVtcyEsIGZvY3VzOiBmb2N1cyEsIHBhbmVsOiBwYW5lbCEsIHNob3dSZXVzZU1lc3NhZ2U6IHNob3dSZXVzZU1lc3NhZ2UhLCBjbGVhcjogY2xlYXIhLCBncm91cCwgY2xvc2U6IGNsb3NlLCBwcmVzZXJ2ZVRlcm1pbmFsTmFtZSB9O1xuXHRcdH1cblxuXHRcdGV4cG9ydCBmdW5jdGlvbiBhc3NpZ25Qcm9wZXJ0aWVzKHRhcmdldDogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMsIHNvdXJjZTogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQpOiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gX2Fzc2lnblByb3BlcnRpZXModGFyZ2V0LCBzb3VyY2UsIHByb3BlcnRpZXMpO1xuXHRcdH1cblxuXHRcdGV4cG9ydCBmdW5jdGlvbiBmaWxsUHJvcGVydGllcyh0YXJnZXQ6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zLCBzb3VyY2U6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zIHwgdW5kZWZpbmVkKTogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdFx0cmV0dXJuIF9maWxsUHJvcGVydGllcyh0YXJnZXQsIHNvdXJjZSwgcHJvcGVydGllcyk7XG5cdFx0fVxuXG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxEZWZhdWx0cyh2YWx1ZTogVGFza3MuSVByZXNlbnRhdGlvbk9wdGlvbnMsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRjb25zdCBkZWZhdWx0RWNobyA9IGNvbnRleHQuZW5naW5lID09PSBUYXNrcy5FeGVjdXRpb25FbmdpbmUuVGVybWluYWwgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRyZXR1cm4gX2ZpbGxEZWZhdWx0cyh2YWx1ZSwgeyBlY2hvOiBkZWZhdWx0RWNobywgcmV2ZWFsOiBUYXNrcy5SZXZlYWxLaW5kLkFsd2F5cywgcmV2ZWFsUHJvYmxlbXM6IFRhc2tzLlJldmVhbFByb2JsZW1LaW5kLk5ldmVyLCBmb2N1czogZmFsc2UsIHBhbmVsOiBUYXNrcy5QYW5lbEtpbmQuU2hhcmVkLCBzaG93UmV1c2VNZXNzYWdlOiB0cnVlLCBjbGVhcjogZmFsc2UsIHByZXNlcnZlVGVybWluYWxOYW1lOiBmYWxzZSB9LCBwcm9wZXJ0aWVzLCBjb250ZXh0KTtcblx0XHR9XG5cblx0XHRleHBvcnQgZnVuY3Rpb24gZnJlZXplKHZhbHVlOiBUYXNrcy5JUHJlc2VudGF0aW9uT3B0aW9ucyk6IFJlYWRvbmx5PFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zPiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gX2ZyZWV6ZSh2YWx1ZSwgcHJvcGVydGllcyk7XG5cdFx0fVxuXG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHkodGhpczogdm9pZCwgdmFsdWU6IFRhc2tzLklQcmVzZW50YXRpb25PcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gX2lzRW1wdHkodmFsdWUsIHByb3BlcnRpZXMpO1xuXHRcdH1cblx0fVxuXG5cdG5hbWVzcGFjZSBTaGVsbFN0cmluZyB7XG5cdFx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgdmFsdWU6IENvbW1hbmRTdHJpbmcgfCB1bmRlZmluZWQpOiBUYXNrcy5Db21tYW5kU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH0gZWxzZSBpZiAoVHlwZXMuaXNTdHJpbmdBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlLmpvaW4oJyAnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHF1b3RpbmcgPSBUYXNrcy5TaGVsbFF1b3RpbmcuZnJvbSh2YWx1ZS5xdW90aW5nKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gVHlwZXMuaXNTdHJpbmcodmFsdWUudmFsdWUpID8gdmFsdWUudmFsdWUgOiBUeXBlcy5pc1N0cmluZ0FycmF5KHZhbHVlLnZhbHVlKSA/IHZhbHVlLnZhbHVlLmpvaW4oJyAnKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR2YWx1ZTogcmVzdWx0LFxuXHRcdFx0XHRcdFx0cXVvdGluZzogcXVvdGluZ1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGludGVyZmFjZSBJQmFzZUNvbW1hbmRDb25maWd1cmF0aW9uU2hhcGUgZXh0ZW5kcyBJQmFzZUNvbW1hbmRQcm9wZXJ0aWVzLCBJTGVnYWN5Q29tbWFuZFByb3BlcnRpZXMge1xuXHR9XG5cblx0aW50ZXJmYWNlIElDb21tYW5kQ29uZmlndXJhdGlvblNoYXBlIGV4dGVuZHMgSUJhc2VDb21tYW5kQ29uZmlndXJhdGlvblNoYXBlIHtcblx0XHR3aW5kb3dzPzogSUJhc2VDb21tYW5kQ29uZmlndXJhdGlvblNoYXBlO1xuXHRcdG9zeD86IElCYXNlQ29tbWFuZENvbmZpZ3VyYXRpb25TaGFwZTtcblx0XHRsaW51eD86IElCYXNlQ29tbWFuZENvbmZpZ3VyYXRpb25TaGFwZTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55IC0tIElNZXRhRGF0YSBhcnJheSBob2xkcyBoZXRlcm9nZW5lb3VzIHBhcnNlciB0eXBlc1xuXHRjb25zdCBwcm9wZXJ0aWVzOiBJTWV0YURhdGE8VGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uLCBhbnk+W10gPSBbXG5cdFx0eyBwcm9wZXJ0eTogJ3J1bnRpbWUnIH0sIHsgcHJvcGVydHk6ICduYW1lJyB9LCB7IHByb3BlcnR5OiAnb3B0aW9ucycsIHR5cGU6IENvbW1hbmRPcHRpb25zIH0sXG5cdFx0eyBwcm9wZXJ0eTogJ2FyZ3MnIH0sIHsgcHJvcGVydHk6ICd0YXNrU2VsZWN0b3InIH0sIHsgcHJvcGVydHk6ICdzdXBwcmVzc1Rhc2tOYW1lJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdwcmVzZW50YXRpb24nLCB0eXBlOiBQcmVzZW50YXRpb25PcHRpb25zIH1cblx0XTtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCBjb25maWc6IElDb21tYW5kQ29uZmlndXJhdGlvblNoYXBlLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcmVzdWx0OiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24gPSBmcm9tQmFzZShjb25maWcsIGNvbnRleHQpITtcblxuXHRcdGxldCBvc0NvbmZpZzogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChjb25maWcud2luZG93cyAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5XaW5kb3dzKSB7XG5cdFx0XHRvc0NvbmZpZyA9IGZyb21CYXNlKGNvbmZpZy53aW5kb3dzLCBjb250ZXh0KTtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZy5vc3ggJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTWFjKSB7XG5cdFx0XHRvc0NvbmZpZyA9IGZyb21CYXNlKGNvbmZpZy5vc3gsIGNvbnRleHQpO1xuXHRcdH0gZWxzZSBpZiAoY29uZmlnLmxpbnV4ICYmIGNvbnRleHQucGxhdGZvcm0gPT09IFBsYXRmb3JtLkxpbnV4KSB7XG5cdFx0XHRvc0NvbmZpZyA9IGZyb21CYXNlKGNvbmZpZy5saW51eCwgY29udGV4dCk7XG5cdFx0fVxuXHRcdGlmIChvc0NvbmZpZykge1xuXHRcdFx0cmVzdWx0ID0gYXNzaWduUHJvcGVydGllcyhyZXN1bHQsIG9zQ29uZmlnLCBjb250ZXh0LnNjaGVtYVZlcnNpb24gPT09IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMCk7XG5cdFx0fVxuXHRcdHJldHVybiBpc0VtcHR5KHJlc3VsdCkgPyB1bmRlZmluZWQgOiByZXN1bHQ7XG5cdH1cblxuXHRmdW5jdGlvbiBmcm9tQmFzZSh0aGlzOiB2b2lkLCBjb25maWc6IElCYXNlQ29tbWFuZENvbmZpZ3VyYXRpb25TaGFwZSwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbmFtZTogVGFza3MuQ29tbWFuZFN0cmluZyB8IHVuZGVmaW5lZCA9IFNoZWxsU3RyaW5nLmZyb20oY29uZmlnLmNvbW1hbmQpO1xuXHRcdGxldCBydW50aW1lOiBUYXNrcy5SdW50aW1lVHlwZTtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoY29uZmlnLnR5cGUpKSB7XG5cdFx0XHRpZiAoY29uZmlnLnR5cGUgPT09ICdzaGVsbCcgfHwgY29uZmlnLnR5cGUgPT09ICdwcm9jZXNzJykge1xuXHRcdFx0XHRydW50aW1lID0gVGFza3MuUnVudGltZVR5cGUuZnJvbVN0cmluZyhjb25maWcudHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChUeXBlcy5pc0Jvb2xlYW4oY29uZmlnLmlzU2hlbGxDb21tYW5kKSB8fCBTaGVsbENvbmZpZ3VyYXRpb24uaXMoY29uZmlnLmlzU2hlbGxDb21tYW5kKSkge1xuXHRcdFx0cnVudGltZSA9IFRhc2tzLlJ1bnRpbWVUeXBlLlNoZWxsO1xuXHRcdH0gZWxzZSBpZiAoY29uZmlnLmlzU2hlbGxDb21tYW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJ1bnRpbWUgPSAhIWNvbmZpZy5pc1NoZWxsQ29tbWFuZCA/IFRhc2tzLlJ1bnRpbWVUeXBlLlNoZWxsIDogVGFza3MuUnVudGltZVR5cGUuUHJvY2Vzcztcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdG5hbWU6IG5hbWUsXG5cdFx0XHRydW50aW1lOiBydW50aW1lISxcblx0XHRcdHByZXNlbnRhdGlvbjogUHJlc2VudGF0aW9uT3B0aW9ucy5mcm9tKGNvbmZpZywgY29udGV4dCkhXG5cdFx0fTtcblxuXHRcdGlmIChjb25maWcuYXJncyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQuYXJncyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBhcmcgb2YgY29uZmlnLmFyZ3MpIHtcblx0XHRcdFx0Y29uc3QgY29udmVydGVkID0gU2hlbGxTdHJpbmcuZnJvbShhcmcpO1xuXHRcdFx0XHRpZiAoY29udmVydGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXN1bHQuYXJncy5wdXNoKGNvbnZlcnRlZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29udGV4dC50YXNrTG9hZElzc3Vlcy5wdXNoKFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHQnQ29uZmlndXJhdGlvblBhcnNlci5pblZhbGlkQXJnJyxcblx0XHRcdFx0XHRcdFx0J0Vycm9yOiBjb21tYW5kIGFyZ3VtZW50IG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgcXVvdGVkIHN0cmluZy4gUHJvdmlkZWQgdmFsdWUgaXM6XFxuezB9Jyxcblx0XHRcdFx0XHRcdFx0YXJnID8gSlNPTi5zdHJpbmdpZnkoYXJnLCB1bmRlZmluZWQsIDQpIDogJ3VuZGVmaW5lZCdcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjb25maWcub3B0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQub3B0aW9ucyA9IENvbW1hbmRPcHRpb25zLmZyb20oY29uZmlnLm9wdGlvbnMsIGNvbnRleHQpO1xuXHRcdFx0aWYgKHJlc3VsdC5vcHRpb25zICYmIHJlc3VsdC5vcHRpb25zLnNoZWxsID09PSB1bmRlZmluZWQgJiYgU2hlbGxDb25maWd1cmF0aW9uLmlzKGNvbmZpZy5pc1NoZWxsQ29tbWFuZCkpIHtcblx0XHRcdFx0cmVzdWx0Lm9wdGlvbnMuc2hlbGwgPSBTaGVsbENvbmZpZ3VyYXRpb24uZnJvbShjb25maWcuaXNTaGVsbENvbW1hbmQsIGNvbnRleHQpO1xuXHRcdFx0XHRpZiAoY29udGV4dC5lbmdpbmUgIT09IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbCkge1xuXHRcdFx0XHRcdGNvbnRleHQudGFza0xvYWRJc3N1ZXMucHVzaChubHMubG9jYWxpemUoJ0NvbmZpZ3VyYXRpb25QYXJzZXIubm9TaGVsbCcsICdXYXJuaW5nOiBzaGVsbCBjb25maWd1cmF0aW9uIGlzIG9ubHkgc3VwcG9ydGVkIHdoZW4gZXhlY3V0aW5nIHRhc2tzIGluIHRoZSB0ZXJtaW5hbC4nKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoY29uZmlnLnRhc2tTZWxlY3RvcikpIHtcblx0XHRcdHJlc3VsdC50YXNrU2VsZWN0b3IgPSBjb25maWcudGFza1NlbGVjdG9yO1xuXHRcdH1cblx0XHRpZiAoVHlwZXMuaXNCb29sZWFuKGNvbmZpZy5zdXBwcmVzc1Rhc2tOYW1lKSkge1xuXHRcdFx0cmVzdWx0LnN1cHByZXNzVGFza05hbWUgPSBjb25maWcuc3VwcHJlc3NUYXNrTmFtZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNFbXB0eShyZXN1bHQpID8gdW5kZWZpbmVkIDogcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGhhc0NvbW1hbmQodmFsdWU6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB2YWx1ZSAmJiAhIXZhbHVlLm5hbWU7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNFbXB0eSh2YWx1ZTogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIF9pc0VtcHR5KHZhbHVlLCBwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBhc3NpZ25Qcm9wZXJ0aWVzKHRhcmdldDogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uLCBzb3VyY2U6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiwgb3ZlcndyaXRlQXJnczogYm9vbGVhbik6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiB7XG5cdFx0aWYgKGlzRW1wdHkoc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHR9XG5cdFx0aWYgKGlzRW1wdHkodGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHNvdXJjZTtcblx0XHR9XG5cdFx0YXNzaWduUHJvcGVydHkodGFyZ2V0LCBzb3VyY2UsICduYW1lJyk7XG5cdFx0YXNzaWduUHJvcGVydHkodGFyZ2V0LCBzb3VyY2UsICdydW50aW1lJyk7XG5cdFx0YXNzaWduUHJvcGVydHkodGFyZ2V0LCBzb3VyY2UsICd0YXNrU2VsZWN0b3InKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3N1cHByZXNzVGFza05hbWUnKTtcblx0XHRpZiAoc291cmNlLmFyZ3MgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHRhcmdldC5hcmdzID09PSB1bmRlZmluZWQgfHwgb3ZlcndyaXRlQXJncykge1xuXHRcdFx0XHR0YXJnZXQuYXJncyA9IHNvdXJjZS5hcmdzO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGFyZ2V0LmFyZ3MgPSB0YXJnZXQuYXJncy5jb25jYXQoc291cmNlLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0YXJnZXQucHJlc2VudGF0aW9uID0gUHJlc2VudGF0aW9uT3B0aW9ucy5hc3NpZ25Qcm9wZXJ0aWVzKHRhcmdldC5wcmVzZW50YXRpb24hLCBzb3VyY2UucHJlc2VudGF0aW9uKSE7XG5cdFx0dGFyZ2V0Lm9wdGlvbnMgPSBDb21tYW5kT3B0aW9ucy5hc3NpZ25Qcm9wZXJ0aWVzKHRhcmdldC5vcHRpb25zLCBzb3VyY2Uub3B0aW9ucyk7XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWxsUHJvcGVydGllcyh0YXJnZXQ6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiwgc291cmNlOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24pOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBfZmlsbFByb3BlcnRpZXModGFyZ2V0LCBzb3VyY2UsIHByb3BlcnRpZXMpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxHbG9iYWxzKHRhcmdldDogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uLCBzb3VyY2U6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCwgdGFza05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbiB7XG5cdFx0aWYgKChzb3VyY2UgPT09IHVuZGVmaW5lZCkgfHwgaXNFbXB0eShzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH1cblx0XHR0YXJnZXQgPSB0YXJnZXQgfHwge1xuXHRcdFx0bmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0cnVudGltZTogdW5kZWZpbmVkLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWRcblx0XHR9O1xuXHRcdGlmICh0YXJnZXQubmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRmaWxsUHJvcGVydHkodGFyZ2V0LCBzb3VyY2UsICduYW1lJyk7XG5cdFx0XHRmaWxsUHJvcGVydHkodGFyZ2V0LCBzb3VyY2UsICd0YXNrU2VsZWN0b3InKTtcblx0XHRcdGZpbGxQcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3N1cHByZXNzVGFza05hbWUnKTtcblx0XHRcdGxldCBhcmdzOiBUYXNrcy5Db21tYW5kU3RyaW5nW10gPSBzb3VyY2UuYXJncyA/IHNvdXJjZS5hcmdzLnNsaWNlKCkgOiBbXTtcblx0XHRcdGlmICghdGFyZ2V0LnN1cHByZXNzVGFza05hbWUgJiYgdGFza05hbWUpIHtcblx0XHRcdFx0aWYgKHRhcmdldC50YXNrU2VsZWN0b3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGFyZ3MucHVzaCh0YXJnZXQudGFza1NlbGVjdG9yICsgdGFza05hbWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFyZ3MucHVzaCh0YXNrTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0YXJnZXQuYXJncykge1xuXHRcdFx0XHRhcmdzID0gYXJncy5jb25jYXQodGFyZ2V0LmFyZ3MpO1xuXHRcdFx0fVxuXHRcdFx0dGFyZ2V0LmFyZ3MgPSBhcmdzO1xuXHRcdH1cblx0XHRmaWxsUHJvcGVydHkodGFyZ2V0LCBzb3VyY2UsICdydW50aW1lJyk7XG5cblx0XHR0YXJnZXQucHJlc2VudGF0aW9uID0gUHJlc2VudGF0aW9uT3B0aW9ucy5maWxsUHJvcGVydGllcyh0YXJnZXQucHJlc2VudGF0aW9uISwgc291cmNlLnByZXNlbnRhdGlvbikhO1xuXHRcdHRhcmdldC5vcHRpb25zID0gQ29tbWFuZE9wdGlvbnMuZmlsbFByb3BlcnRpZXModGFyZ2V0Lm9wdGlvbnMsIHNvdXJjZS5vcHRpb25zKTtcblxuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZmlsbERlZmF1bHRzKHZhbHVlOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiB2b2lkIHtcblx0XHRpZiAoIXZhbHVlIHx8IE9iamVjdC5pc0Zyb3plbih2YWx1ZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLm5hbWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZS5ydW50aW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbHVlLnJ1bnRpbWUgPSBUYXNrcy5SdW50aW1lVHlwZS5Qcm9jZXNzO1xuXHRcdH1cblx0XHR2YWx1ZS5wcmVzZW50YXRpb24gPSBQcmVzZW50YXRpb25PcHRpb25zLmZpbGxEZWZhdWx0cyh2YWx1ZS5wcmVzZW50YXRpb24hLCBjb250ZXh0KSE7XG5cdFx0aWYgKCFpc0VtcHR5KHZhbHVlKSkge1xuXHRcdFx0dmFsdWUub3B0aW9ucyA9IENvbW1hbmRPcHRpb25zLmZpbGxEZWZhdWx0cyh2YWx1ZS5vcHRpb25zLCBjb250ZXh0KTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLmFyZ3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWUuYXJncyA9IEVNUFRZX0FSUkFZO1xuXHRcdH1cblx0XHRpZiAodmFsdWUuc3VwcHJlc3NUYXNrTmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZS5zdXBwcmVzc1Rhc2tOYW1lID0gKGNvbnRleHQuc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJlZXplKHZhbHVlOiBUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24pOiBSZWFkb25seTxUYXNrcy5JQ29tbWFuZENvbmZpZ3VyYXRpb24+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gX2ZyZWV6ZSh2YWx1ZSwgcHJvcGVydGllcyk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBQcm9ibGVtTWF0Y2hlckNvbnZlcnRlciB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIG5hbWVkRnJvbSh0aGlzOiB2b2lkLCBkZWNsYXJlczogUHJvYmxlbU1hdGNoZXJDb25maWcuSU5hbWVkUHJvYmxlbU1hdGNoZXJbXSB8IHVuZGVmaW5lZCwgY29udGV4dDogSVBhcnNlQ29udGV4dCk6IElTdHJpbmdEaWN0aW9uYXJ5PElOYW1lZFByb2JsZW1NYXRjaGVyPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTxJTmFtZWRQcm9ibGVtTWF0Y2hlcj4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGRlY2xhcmVzKSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0KDxQcm9ibGVtTWF0Y2hlckNvbmZpZy5JTmFtZWRQcm9ibGVtTWF0Y2hlcltdPmRlY2xhcmVzKS5mb3JFYWNoKCh2YWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3QgbmFtZWRQcm9ibGVtTWF0Y2hlciA9IChuZXcgUHJvYmxlbU1hdGNoZXJQYXJzZXIoY29udGV4dC5wcm9ibGVtUmVwb3J0ZXIpKS5wYXJzZSh2YWx1ZSk7XG5cdFx0XHRpZiAoaXNOYW1lZFByb2JsZW1NYXRjaGVyKG5hbWVkUHJvYmxlbU1hdGNoZXIpKSB7XG5cdFx0XHRcdHJlc3VsdFtuYW1lZFByb2JsZW1NYXRjaGVyLm5hbWVdID0gbmFtZWRQcm9ibGVtTWF0Y2hlcjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRleHQucHJvYmxlbVJlcG9ydGVyLmVycm9yKG5scy5sb2NhbGl6ZSgnQ29uZmlndXJhdGlvblBhcnNlci5ub05hbWUnLCAnRXJyb3I6IFByb2JsZW0gTWF0Y2hlciBpbiBkZWNsYXJlIHNjb3BlIG11c3QgaGF2ZSBhIG5hbWU6XFxuezB9XFxuJywgSlNPTi5zdHJpbmdpZnkodmFsdWUsIHVuZGVmaW5lZCwgNCkpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21XaXRoT3NDb25maWcodGhpczogdm9pZCwgZXh0ZXJuYWw6IElDb25maWd1cmF0aW9uUHJvcGVydGllcyAmIHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9LCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza0NvbmZpZ3VyYXRpb25WYWx1ZVdpdGhFcnJvcnM8UHJvYmxlbU1hdGNoZXJbXT4ge1xuXHRcdGxldCByZXN1bHQ6IFRhc2tDb25maWd1cmF0aW9uVmFsdWVXaXRoRXJyb3JzPFByb2JsZW1NYXRjaGVyW10+ID0ge307XG5cdFx0Y29uc3Qgb3NFeHRlcm5hbCA9IGV4dGVybmFsIGFzIHVua25vd24gYXMgeyB3aW5kb3dzPzogeyBwcm9ibGVtTWF0Y2hlcj86IFByb2JsZW1NYXRjaGVyQ29uZmlnLlByb2JsZW1NYXRjaGVyVHlwZSB9OyBvc3g/OiB7IHByb2JsZW1NYXRjaGVyPzogUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXJUeXBlIH07IGxpbnV4PzogeyBwcm9ibGVtTWF0Y2hlcj86IFByb2JsZW1NYXRjaGVyQ29uZmlnLlByb2JsZW1NYXRjaGVyVHlwZSB9IH07XG5cdFx0aWYgKG9zRXh0ZXJuYWwud2luZG93cz8ucHJvYmxlbU1hdGNoZXIgJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uV2luZG93cykge1xuXHRcdFx0cmVzdWx0ID0gZnJvbShvc0V4dGVybmFsLndpbmRvd3MucHJvYmxlbU1hdGNoZXIsIGNvbnRleHQpO1xuXHRcdH0gZWxzZSBpZiAob3NFeHRlcm5hbC5vc3g/LnByb2JsZW1NYXRjaGVyICYmIGNvbnRleHQucGxhdGZvcm0gPT09IFBsYXRmb3JtLk1hYykge1xuXHRcdFx0cmVzdWx0ID0gZnJvbShvc0V4dGVybmFsLm9zeC5wcm9ibGVtTWF0Y2hlciwgY29udGV4dCk7XG5cdFx0fSBlbHNlIGlmIChvc0V4dGVybmFsLmxpbnV4Py5wcm9ibGVtTWF0Y2hlciAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5MaW51eCkge1xuXHRcdFx0cmVzdWx0ID0gZnJvbShvc0V4dGVybmFsLmxpbnV4LnByb2JsZW1NYXRjaGVyLCBjb250ZXh0KTtcblx0XHR9IGVsc2UgaWYgKGV4dGVybmFsLnByb2JsZW1NYXRjaGVyKSB7XG5cdFx0XHRyZXN1bHQgPSBmcm9tKGV4dGVybmFsLnByb2JsZW1NYXRjaGVyLCBjb250ZXh0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGNvbmZpZzogUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXJUeXBlIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogVGFza0NvbmZpZ3VyYXRpb25WYWx1ZVdpdGhFcnJvcnM8UHJvYmxlbU1hdGNoZXJbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogUHJvYmxlbU1hdGNoZXJbXSA9IFtdO1xuXHRcdGlmIChjb25maWcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgdmFsdWU6IHJlc3VsdCB9O1xuXHRcdH1cblx0XHRjb25zdCBlcnJvcnM6IHN0cmluZ1tdID0gW107XG5cdFx0ZnVuY3Rpb24gYWRkUmVzdWx0KG1hdGNoZXI6IFRhc2tDb25maWd1cmF0aW9uVmFsdWVXaXRoRXJyb3JzPFByb2JsZW1NYXRjaGVyPikge1xuXHRcdFx0aWYgKG1hdGNoZXIudmFsdWUpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobWF0Y2hlci52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobWF0Y2hlci5lcnJvcnMpIHtcblx0XHRcdFx0ZXJyb3JzLnB1c2goLi4ubWF0Y2hlci5lcnJvcnMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBraW5kID0gZ2V0UHJvYmxlbU1hdGNoZXJLaW5kKGNvbmZpZyk7XG5cdFx0aWYgKGtpbmQgPT09IFByb2JsZW1NYXRjaGVyS2luZC5Vbmtub3duKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J0NvbmZpZ3VyYXRpb25QYXJzZXIudW5rbm93bk1hdGNoZXJLaW5kJyxcblx0XHRcdFx0J1dhcm5pbmc6IHRoZSBkZWZpbmVkIHByb2JsZW0gbWF0Y2hlciBpcyB1bmtub3duLiBTdXBwb3J0ZWQgdHlwZXMgYXJlIHN0cmluZyB8IFByb2JsZW1NYXRjaGVyIHwgQXJyYXk8c3RyaW5nIHwgUHJvYmxlbU1hdGNoZXI+LlxcbnswfVxcbicsXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KGNvbmZpZywgbnVsbCwgNCkpO1xuXHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIud2FybihlcnJvcik7XG5cdFx0fSBlbHNlIGlmIChraW5kID09PSBQcm9ibGVtTWF0Y2hlcktpbmQuU3RyaW5nIHx8IGtpbmQgPT09IFByb2JsZW1NYXRjaGVyS2luZC5Qcm9ibGVtTWF0Y2hlcikge1xuXHRcdFx0YWRkUmVzdWx0KHJlc29sdmVQcm9ibGVtTWF0Y2hlcihjb25maWcgYXMgUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXIsIGNvbnRleHQpKTtcblx0XHR9IGVsc2UgaWYgKGtpbmQgPT09IFByb2JsZW1NYXRjaGVyS2luZC5BcnJheSkge1xuXHRcdFx0Y29uc3QgcHJvYmxlbU1hdGNoZXJzID0gPChzdHJpbmcgfCBQcm9ibGVtTWF0Y2hlckNvbmZpZy5Qcm9ibGVtTWF0Y2hlcilbXT5jb25maWc7XG5cdFx0XHRwcm9ibGVtTWF0Y2hlcnMuZm9yRWFjaChwcm9ibGVtTWF0Y2hlciA9PiB7XG5cdFx0XHRcdGFkZFJlc3VsdChyZXNvbHZlUHJvYmxlbU1hdGNoZXIocHJvYmxlbU1hdGNoZXIsIGNvbnRleHQpKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4geyB2YWx1ZTogcmVzdWx0LCBlcnJvcnMgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldFByb2JsZW1NYXRjaGVyS2luZCh0aGlzOiB2b2lkLCB2YWx1ZTogUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXJUeXBlKTogUHJvYmxlbU1hdGNoZXJLaW5kIHtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gUHJvYmxlbU1hdGNoZXJLaW5kLlN0cmluZztcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gUHJvYmxlbU1hdGNoZXJLaW5kLkFycmF5O1xuXHRcdH0gZWxzZSBpZiAoIVR5cGVzLmlzVW5kZWZpbmVkKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIFByb2JsZW1NYXRjaGVyS2luZC5Qcm9ibGVtTWF0Y2hlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFByb2JsZW1NYXRjaGVyS2luZC5Vbmtub3duO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHJlc29sdmVQcm9ibGVtTWF0Y2hlcih0aGlzOiB2b2lkLCB2YWx1ZTogc3RyaW5nIHwgUHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXIsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiBUYXNrQ29uZmlndXJhdGlvblZhbHVlV2l0aEVycm9yczxQcm9ibGVtTWF0Y2hlcj4ge1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdGxldCB2YXJpYWJsZU5hbWUgPSA8c3RyaW5nPnZhbHVlO1xuXHRcdFx0aWYgKHZhcmlhYmxlTmFtZS5sZW5ndGggPiAxICYmIHZhcmlhYmxlTmFtZVswXSA9PT0gJyQnKSB7XG5cdFx0XHRcdHZhcmlhYmxlTmFtZSA9IHZhcmlhYmxlTmFtZS5zdWJzdHJpbmcoMSk7XG5cdFx0XHRcdGNvbnN0IGdsb2JhbCA9IFByb2JsZW1NYXRjaGVyUmVnaXN0cnkuZ2V0KHZhcmlhYmxlTmFtZSk7XG5cdFx0XHRcdGlmIChnbG9iYWwpIHtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogT2JqZWN0cy5kZWVwQ2xvbmUoZ2xvYmFsKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBsb2NhbFByb2JsZW1NYXRjaGVyOiBQcm9ibGVtTWF0Y2hlciAmIFBhcnRpYWw8SU5hbWVkUHJvYmxlbU1hdGNoZXI+ID0gY29udGV4dC5uYW1lZFByb2JsZW1NYXRjaGVyc1t2YXJpYWJsZU5hbWVdO1xuXHRcdFx0XHRpZiAobG9jYWxQcm9ibGVtTWF0Y2hlcikge1xuXHRcdFx0XHRcdGxvY2FsUHJvYmxlbU1hdGNoZXIgPSBPYmplY3RzLmRlZXBDbG9uZShsb2NhbFByb2JsZW1NYXRjaGVyKTtcblx0XHRcdFx0XHQvLyByZW1vdmUgdGhlIG5hbWVcblx0XHRcdFx0XHRkZWxldGUgbG9jYWxQcm9ibGVtTWF0Y2hlci5uYW1lO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiBsb2NhbFByb2JsZW1NYXRjaGVyIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGVycm9yczogW25scy5sb2NhbGl6ZSgnQ29uZmlndXJhdGlvblBhcnNlci5pbnZhbGlkVmFyaWFibGVSZWZlcmVuY2UnLCAnRXJyb3I6IEludmFsaWQgcHJvYmxlbU1hdGNoZXIgcmVmZXJlbmNlOiB7MH1cXG4nLCB2YWx1ZSldIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGpzb24gPSA8UHJvYmxlbU1hdGNoZXJDb25maWcuUHJvYmxlbU1hdGNoZXI+dmFsdWU7XG5cdFx0XHRyZXR1cm4geyB2YWx1ZTogbmV3IFByb2JsZW1NYXRjaGVyUGFyc2VyKGNvbnRleHQucHJvYmxlbVJlcG9ydGVyKS5wYXJzZShqc29uKSB9O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEdyb3VwS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGV4dGVybmFsOiBzdHJpbmcgfCBJR3JvdXBLaW5kIHwgdW5kZWZpbmVkKTogVGFza3MuVGFza0dyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXh0ZXJuYWwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsKSAmJiBUYXNrcy5UYXNrR3JvdXAuaXMoZXh0ZXJuYWwpKSB7XG5cdFx0XHRyZXR1cm4geyBfaWQ6IGV4dGVybmFsLCBpc0RlZmF1bHQ6IGZhbHNlIH07XG5cdFx0fSBlbHNlIGlmIChUeXBlcy5pc1N0cmluZyhleHRlcm5hbC5raW5kKSAmJiBUYXNrcy5UYXNrR3JvdXAuaXMoZXh0ZXJuYWwua2luZCkpIHtcblx0XHRcdGNvbnN0IGdyb3VwOiBzdHJpbmcgPSBleHRlcm5hbC5raW5kO1xuXHRcdFx0Y29uc3QgaXNEZWZhdWx0OiBib29sZWFuIHwgc3RyaW5nID0gVHlwZXMuaXNVbmRlZmluZWQoZXh0ZXJuYWwuaXNEZWZhdWx0KSA/IGZhbHNlIDogZXh0ZXJuYWwuaXNEZWZhdWx0O1xuXG5cdFx0XHRyZXR1cm4geyBfaWQ6IGdyb3VwLCBpc0RlZmF1bHQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhncm91cDogVGFza3MuVGFza0dyb3VwIHwgc3RyaW5nKTogSUdyb3VwS2luZCB8IHN0cmluZyB7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGdyb3VwKSkge1xuXHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdH0gZWxzZSBpZiAoIWdyb3VwLmlzRGVmYXVsdCkge1xuXHRcdFx0cmV0dXJuIGdyb3VwLl9pZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6IGdyb3VwLl9pZCxcblx0XHRcdGlzRGVmYXVsdDogZ3JvdXAuaXNEZWZhdWx0LFxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tEZXBlbmRlbmN5IHtcblx0ZnVuY3Rpb24gdXJpRnJvbVNvdXJjZShjb250ZXh0OiBJUGFyc2VDb250ZXh0LCBzb3VyY2U6IFRhc2tDb25maWdTb3VyY2UpOiBVUkkgfCBzdHJpbmcge1xuXHRcdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0XHRjYXNlIFRhc2tDb25maWdTb3VyY2UuVXNlcjogcmV0dXJuIFRhc2tzLlVTRVJfVEFTS1NfR1JPVVBfS0VZO1xuXHRcdFx0Y2FzZSBUYXNrQ29uZmlnU291cmNlLlRhc2tzSnNvbjogcmV0dXJuIGNvbnRleHQud29ya3NwYWNlRm9sZGVyLnVyaTtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBjb250ZXh0LndvcmtzcGFjZSAmJiBjb250ZXh0LndvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gY29udGV4dC53b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA6IGNvbnRleHQud29ya3NwYWNlRm9sZGVyLnVyaTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCBleHRlcm5hbDogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0LCBzb3VyY2U6IFRhc2tDb25maWdTb3VyY2UpOiBUYXNrcy5JVGFza0RlcGVuZGVuY3kgfCB1bmRlZmluZWQge1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhleHRlcm5hbCkpIHtcblx0XHRcdHJldHVybiB7IHVyaTogdXJpRnJvbVNvdXJjZShjb250ZXh0LCBzb3VyY2UpLCB0YXNrOiBleHRlcm5hbCB9O1xuXHRcdH0gZWxzZSBpZiAoSVRhc2tJZGVudGlmaWVyLmlzKGV4dGVybmFsKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiB1cmlGcm9tU291cmNlKGNvbnRleHQsIHNvdXJjZSksXG5cdFx0XHRcdHRhc2s6IFRhc2tzLlRhc2tEZWZpbml0aW9uLmNyZWF0ZVRhc2tJZGVudGlmaWVyKGV4dGVybmFsIGFzIFRhc2tzLklUYXNrSWRlbnRpZmllciwgY29udGV4dC5wcm9ibGVtUmVwb3J0ZXIpXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5uYW1lc3BhY2UgRGVwZW5kc09yZGVyIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ob3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFRhc2tzLkRlcGVuZHNPcmRlciB7XG5cdFx0c3dpdGNoIChvcmRlcikge1xuXHRcdFx0Y2FzZSBUYXNrcy5EZXBlbmRzT3JkZXIuc2VxdWVuY2U6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5EZXBlbmRzT3JkZXIuc2VxdWVuY2U7XG5cdFx0XHRjYXNlIFRhc2tzLkRlcGVuZHNPcmRlci5wYXJhbGxlbDpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5EZXBlbmRzT3JkZXIucGFyYWxsZWw7XG5cdFx0fVxuXHR9XG59XG5cbm5hbWVzcGFjZSBDb25maWd1cmF0aW9uUHJvcGVydGllcyB7XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgLS0gSU1ldGFEYXRhIGFycmF5IGhvbGRzIGhldGVyb2dlbmVvdXMgcGFyc2VyIHR5cGVzXG5cdGNvbnN0IHByb3BlcnRpZXM6IElNZXRhRGF0YTxUYXNrcy5JQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIGFueT5bXSA9IFtcblx0XHR7IHByb3BlcnR5OiAnbmFtZScgfSxcblx0XHR7IHByb3BlcnR5OiAnaWRlbnRpZmllcicgfSxcblx0XHR7IHByb3BlcnR5OiAnZ3JvdXAnIH0sXG5cdFx0eyBwcm9wZXJ0eTogJ2lzQmFja2dyb3VuZCcgfSxcblx0XHR7IHByb3BlcnR5OiAncHJvbXB0T25DbG9zZScgfSxcblx0XHR7IHByb3BlcnR5OiAnZGVwZW5kc09uJyB9LFxuXHRcdHsgcHJvcGVydHk6ICdwcmVzZW50YXRpb24nLCB0eXBlOiBDb21tYW5kQ29uZmlndXJhdGlvbi5QcmVzZW50YXRpb25PcHRpb25zIH0sXG5cdFx0eyBwcm9wZXJ0eTogJ3Byb2JsZW1NYXRjaGVycycgfSxcblx0XHR7IHByb3BlcnR5OiAnb3B0aW9ucycgfSxcblx0XHR7IHByb3BlcnR5OiAnaWNvbicgfSxcblx0XHR7IHByb3BlcnR5OiAnaGlkZScgfSxcblx0XHR7IHByb3BlcnR5OiAnaW5BZ2VudHMnIH1cblx0XTtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCBleHRlcm5hbDogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzICYgeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0sIGNvbnRleHQ6IElQYXJzZUNvbnRleHQsXG5cdFx0aW5jbHVkZUNvbW1hbmRPcHRpb25zOiBib29sZWFuLCBzb3VyY2U6IFRhc2tDb25maWdTb3VyY2UsIHByb3BlcnRpZXM/OiBJSlNPTlNjaGVtYU1hcCk6IFRhc2tDb25maWd1cmF0aW9uVmFsdWVXaXRoRXJyb3JzPFRhc2tzLklDb25maWd1cmF0aW9uUHJvcGVydGllcz4ge1xuXHRcdGlmICghZXh0ZXJuYWwpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBUYXNrcy5JQ29uZmlndXJhdGlvblByb3BlcnRpZXMgJiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSA9IHt9O1xuXG5cdFx0aWYgKHByb3BlcnRpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgcHJvcGVydHlOYW1lIG9mIE9iamVjdC5rZXlzKHByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGlmIChleHRlcm5hbFtwcm9wZXJ0eU5hbWVdICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXN1bHRbcHJvcGVydHlOYW1lXSA9IE9iamVjdHMuZGVlcENsb25lKGV4dGVybmFsW3Byb3BlcnR5TmFtZV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsLnRhc2tOYW1lKSkge1xuXHRcdFx0cmVzdWx0Lm5hbWUgPSBleHRlcm5hbC50YXNrTmFtZTtcblx0XHR9XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsLmxhYmVsKSAmJiBjb250ZXh0LnNjaGVtYVZlcnNpb24gPT09IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMCkge1xuXHRcdFx0cmVzdWx0Lm5hbWUgPSBleHRlcm5hbC5sYWJlbDtcblx0XHR9XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXN1bHQuaWRlbnRpZmllciA9IGV4dGVybmFsLmlkZW50aWZpZXI7XG5cdFx0fVxuXHRcdHJlc3VsdC5pY29uID0gZXh0ZXJuYWwuaWNvbjtcblx0XHRyZXN1bHQuaGlkZSA9IGV4dGVybmFsLmhpZGU7XG5cdFx0cmVzdWx0LmluQWdlbnRzID0gZXh0ZXJuYWwuaW5BZ2VudHM7XG5cdFx0aWYgKGV4dGVybmFsLmlzQmFja2dyb3VuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQuaXNCYWNrZ3JvdW5kID0gISFleHRlcm5hbC5pc0JhY2tncm91bmQ7XG5cdFx0fVxuXHRcdGlmIChleHRlcm5hbC5wcm9tcHRPbkNsb3NlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdC5wcm9tcHRPbkNsb3NlID0gISFleHRlcm5hbC5wcm9tcHRPbkNsb3NlO1xuXHRcdH1cblx0XHRyZXN1bHQuZ3JvdXAgPSBHcm91cEtpbmQuZnJvbShleHRlcm5hbC5ncm91cCk7XG5cdFx0aWYgKGV4dGVybmFsLmRlcGVuZHNPbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShleHRlcm5hbC5kZXBlbmRzT24pKSB7XG5cdFx0XHRcdHJlc3VsdC5kZXBlbmRzT24gPSBleHRlcm5hbC5kZXBlbmRzT24ucmVkdWNlKChkZXBlbmRlbmNpZXM6IFRhc2tzLklUYXNrRGVwZW5kZW5jeVtdLCBpdGVtKTogVGFza3MuSVRhc2tEZXBlbmRlbmN5W10gPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGRlcGVuZGVuY3kgPSBUYXNrRGVwZW5kZW5jeS5mcm9tKGl0ZW0sIGNvbnRleHQsIHNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKGRlcGVuZGVuY3kpIHtcblx0XHRcdFx0XHRcdGRlcGVuZGVuY2llcy5wdXNoKGRlcGVuZGVuY3kpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZGVwZW5kZW5jaWVzO1xuXHRcdFx0XHR9LCBbXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkZXBlbmRzT25WYWx1ZSA9IFRhc2tEZXBlbmRlbmN5LmZyb20oZXh0ZXJuYWwuZGVwZW5kc09uLCBjb250ZXh0LCBzb3VyY2UpO1xuXHRcdFx0XHRyZXN1bHQuZGVwZW5kc09uID0gZGVwZW5kc09uVmFsdWUgPyBbZGVwZW5kc09uVmFsdWVdIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXN1bHQuZGVwZW5kc09yZGVyID0gRGVwZW5kc09yZGVyLmZyb20oZXh0ZXJuYWwuZGVwZW5kc09yZGVyKTtcblx0XHRpZiAoaW5jbHVkZUNvbW1hbmRPcHRpb25zICYmIChleHRlcm5hbC5wcmVzZW50YXRpb24gIT09IHVuZGVmaW5lZCB8fCAoZXh0ZXJuYWwgYXMgSUxlZ2FjeUNvbW1hbmRQcm9wZXJ0aWVzKS50ZXJtaW5hbCAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmVzdWx0LnByZXNlbnRhdGlvbiA9IENvbW1hbmRDb25maWd1cmF0aW9uLlByZXNlbnRhdGlvbk9wdGlvbnMuZnJvbShleHRlcm5hbCwgY29udGV4dCk7XG5cdFx0fVxuXHRcdGlmIChpbmNsdWRlQ29tbWFuZE9wdGlvbnMgJiYgKGV4dGVybmFsLm9wdGlvbnMgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJlc3VsdC5vcHRpb25zID0gQ29tbWFuZE9wdGlvbnMuZnJvbShleHRlcm5hbC5vcHRpb25zLCBjb250ZXh0KTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnUHJvYmxlbU1hdGNoZXIgPSBQcm9ibGVtTWF0Y2hlckNvbnZlcnRlci5mcm9tV2l0aE9zQ29uZmlnKGV4dGVybmFsLCBjb250ZXh0KTtcblx0XHRpZiAoY29uZmlnUHJvYmxlbU1hdGNoZXIudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LnByb2JsZW1NYXRjaGVycyA9IGNvbmZpZ1Byb2JsZW1NYXRjaGVyLnZhbHVlO1xuXHRcdH1cblx0XHRpZiAoZXh0ZXJuYWwuZGV0YWlsKSB7XG5cdFx0XHRyZXN1bHQuZGV0YWlsID0gZXh0ZXJuYWwuZGV0YWlsO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNFbXB0eShyZXN1bHQpID8ge30gOiB7IHZhbHVlOiByZXN1bHQsIGVycm9yczogY29uZmlnUHJvYmxlbU1hdGNoZXIuZXJyb3JzIH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNFbXB0eSh0aGlzOiB2b2lkLCB2YWx1ZTogVGFza3MuSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIF9pc0VtcHR5KHZhbHVlLCBwcm9wZXJ0aWVzKTtcblx0fVxufVxuY29uc3QgbGFiZWwgPSAnV29ya3NwYWNlJztcblxubmFtZXNwYWNlIENvbmZpZ3VyaW5nVGFzayB7XG5cblx0Y29uc3QgZ3J1bnQgPSAnZ3J1bnQuJztcblx0Y29uc3QgamFrZSA9ICdqYWtlLic7XG5cdGNvbnN0IGd1bHAgPSAnZ3VscC4nO1xuXHRjb25zdCBucG0gPSAndnNjb2RlLm5wbS4nO1xuXHRjb25zdCB0eXBlc2NyaXB0ID0gJ3ZzY29kZS50eXBlc2NyaXB0Lic7XG5cblx0aW50ZXJmYWNlIElDdXN0b21pemVTaGFwZSB7XG5cdFx0Y3VzdG9taXplOiBzdHJpbmc7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCBleHRlcm5hbDogSUNvbmZpZ3VyaW5nVGFzaywgY29udGV4dDogSVBhcnNlQ29udGV4dCwgaW5kZXg6IG51bWJlciwgc291cmNlOiBUYXNrQ29uZmlnU291cmNlLCByZWdpc3RyeT86IFBhcnRpYWw8SVRhc2tEZWZpbml0aW9uUmVnaXN0cnk+KTogVGFza3MuQ29uZmlndXJpbmdUYXNrIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWV4dGVybmFsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0eXBlID0gZXh0ZXJuYWwudHlwZTtcblx0XHRjb25zdCBjdXN0b21pemUgPSAoZXh0ZXJuYWwgYXMgSUN1c3RvbWl6ZVNoYXBlKS5jdXN0b21pemU7XG5cdFx0aWYgKCF0eXBlICYmICFjdXN0b21pemUpIHtcblx0XHRcdGNvbnRleHQucHJvYmxlbVJlcG9ydGVyLmVycm9yKG5scy5sb2NhbGl6ZSgnQ29uZmlndXJhdGlvblBhcnNlci5ub1Rhc2tUeXBlJywgJ0Vycm9yOiB0YXNrcyBjb25maWd1cmF0aW9uIG11c3QgaGF2ZSBhIHR5cGUgcHJvcGVydHkuIFRoZSBjb25maWd1cmF0aW9uIHdpbGwgYmUgaWdub3JlZC5cXG57MH1cXG4nLCBKU09OLnN0cmluZ2lmeShleHRlcm5hbCwgbnVsbCwgNCkpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHR5cGVEZWNsYXJhdGlvbiA9IHR5cGUgPyByZWdpc3RyeT8uZ2V0Py4odHlwZSkgfHwgVGFza0RlZmluaXRpb25SZWdpc3RyeS5nZXQodHlwZSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0eXBlRGVjbGFyYXRpb24pIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ0NvbmZpZ3VyYXRpb25QYXJzZXIubm9UeXBlRGVmaW5pdGlvbicsICdFcnJvcjogdGhlcmUgaXMgbm8gcmVnaXN0ZXJlZCB0YXNrIHR5cGUgXFwnezB9XFwnLiBEaWQgeW91IG1pc3MgaW5zdGFsbGluZyBhbiBleHRlbnNpb24gdGhhdCBwcm92aWRlcyBhIGNvcnJlc3BvbmRpbmcgdGFzayBwcm92aWRlcj8nLCB0eXBlKTtcblx0XHRcdGNvbnRleHQucHJvYmxlbVJlcG9ydGVyLmVycm9yKG1lc3NhZ2UpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGlkZW50aWZpZXI6IFRhc2tzLklUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoY3VzdG9taXplKSkge1xuXHRcdFx0aWYgKGN1c3RvbWl6ZS5pbmRleE9mKGdydW50KSA9PT0gMCkge1xuXHRcdFx0XHRpZGVudGlmaWVyID0geyB0eXBlOiAnZ3J1bnQnLCB0YXNrOiBjdXN0b21pemUuc3Vic3RyaW5nKGdydW50Lmxlbmd0aCkgfTtcblx0XHRcdH0gZWxzZSBpZiAoY3VzdG9taXplLmluZGV4T2YoamFrZSkgPT09IDApIHtcblx0XHRcdFx0aWRlbnRpZmllciA9IHsgdHlwZTogJ2pha2UnLCB0YXNrOiBjdXN0b21pemUuc3Vic3RyaW5nKGpha2UubGVuZ3RoKSB9O1xuXHRcdFx0fSBlbHNlIGlmIChjdXN0b21pemUuaW5kZXhPZihndWxwKSA9PT0gMCkge1xuXHRcdFx0XHRpZGVudGlmaWVyID0geyB0eXBlOiAnZ3VscCcsIHRhc2s6IGN1c3RvbWl6ZS5zdWJzdHJpbmcoZ3VscC5sZW5ndGgpIH07XG5cdFx0XHR9IGVsc2UgaWYgKGN1c3RvbWl6ZS5pbmRleE9mKG5wbSkgPT09IDApIHtcblx0XHRcdFx0aWRlbnRpZmllciA9IHsgdHlwZTogJ25wbScsIHNjcmlwdDogY3VzdG9taXplLnN1YnN0cmluZyhucG0ubGVuZ3RoICsgNCkgfTtcblx0XHRcdH0gZWxzZSBpZiAoY3VzdG9taXplLmluZGV4T2YodHlwZXNjcmlwdCkgPT09IDApIHtcblx0XHRcdFx0aWRlbnRpZmllciA9IHsgdHlwZTogJ3R5cGVzY3JpcHQnLCB0c2NvbmZpZzogY3VzdG9taXplLnN1YnN0cmluZyh0eXBlc2NyaXB0Lmxlbmd0aCArIDYpIH07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhleHRlcm5hbC50eXBlKSkge1xuXHRcdFx0XHRpZGVudGlmaWVyID0gZXh0ZXJuYWwgYXMgVGFza3MuSVRhc2tJZGVudGlmaWVyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoaWRlbnRpZmllciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci5lcnJvcihubHMubG9jYWxpemUoXG5cdFx0XHRcdCdDb25maWd1cmF0aW9uUGFyc2VyLm1pc3NpbmdUeXBlJyxcblx0XHRcdFx0J0Vycm9yOiB0aGUgdGFzayBjb25maWd1cmF0aW9uIFxcJ3swfVxcJyBpcyBtaXNzaW5nIHRoZSByZXF1aXJlZCBwcm9wZXJ0eSBcXCd0eXBlXFwnLiBUaGUgdGFzayBjb25maWd1cmF0aW9uIHdpbGwgYmUgaWdub3JlZC4nLCBKU09OLnN0cmluZ2lmeShleHRlcm5hbCwgdW5kZWZpbmVkLCAwKVxuXHRcdFx0KSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0YXNrSWRlbnRpZmllcjogVGFza3MuS2V5ZWRUYXNrSWRlbnRpZmllciB8IHVuZGVmaW5lZCA9IFRhc2tzLlRhc2tEZWZpbml0aW9uLmNyZWF0ZVRhc2tJZGVudGlmaWVyKGlkZW50aWZpZXIsIGNvbnRleHQucHJvYmxlbVJlcG9ydGVyKTtcblx0XHRpZiAodGFza0lkZW50aWZpZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIuZXJyb3IobmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnQ29uZmlndXJhdGlvblBhcnNlci5pbmNvcnJlY3RUeXBlJyxcblx0XHRcdFx0J0Vycm9yOiB0aGUgdGFzayBjb25maWd1cmF0aW9uIFxcJ3swfVxcJyBpcyB1c2luZyBhbiB1bmtub3duIHR5cGUuIFRoZSB0YXNrIGNvbmZpZ3VyYXRpb24gd2lsbCBiZSBpZ25vcmVkLicsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCB1bmRlZmluZWQsIDApXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ0VsZW1lbnQ6IFRhc2tzLklUYXNrU291cmNlQ29uZmlnRWxlbWVudCA9IHtcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogY29udGV4dC53b3Jrc3BhY2VGb2xkZXIsXG5cdFx0XHRmaWxlOiAnLnZzY29kZS90YXNrcy5qc29uJyxcblx0XHRcdGluZGV4LFxuXHRcdFx0ZWxlbWVudDogZXh0ZXJuYWxcblx0XHR9O1xuXHRcdGxldCB0YXNrU291cmNlOiBUYXNrcy5GaWxlQmFzZWRUYXNrU291cmNlO1xuXHRcdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0XHRjYXNlIFRhc2tDb25maWdTb3VyY2UuVXNlcjoge1xuXHRcdFx0XHR0YXNrU291cmNlID0geyBraW5kOiBUYXNrcy5UYXNrU291cmNlS2luZC5Vc2VyLCBjb25maWc6IGNvbmZpZ0VsZW1lbnQsIGxhYmVsIH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBUYXNrQ29uZmlnU291cmNlLldvcmtzcGFjZUZpbGU6IHtcblx0XHRcdFx0dGFza1NvdXJjZSA9IHsga2luZDogVGFza3MuVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlRmlsZSwgY29uZmlnOiBjb25maWdFbGVtZW50LCBsYWJlbCB9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0dGFza1NvdXJjZSA9IHsga2luZDogVGFza3MuVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlLCBjb25maWc6IGNvbmZpZ0VsZW1lbnQsIGxhYmVsIH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IFRhc2tzLkNvbmZpZ3VyaW5nVGFzayA9IG5ldyBUYXNrcy5Db25maWd1cmluZ1Rhc2soXG5cdFx0XHRgJHt0eXBlRGVjbGFyYXRpb24uZXh0ZW5zaW9uSWR9LiR7dGFza0lkZW50aWZpZXIuX2tleX1gLFxuXHRcdFx0dGFza1NvdXJjZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHR5cGUsXG5cdFx0XHR0YXNrSWRlbnRpZmllcixcblx0XHRcdFJ1bk9wdGlvbnMuZnJvbUNvbmZpZ3VyYXRpb24oZXh0ZXJuYWwucnVuT3B0aW9ucyksXG5cdFx0XHR7IGhpZGU6IGV4dGVybmFsLmhpZGUsIGluQWdlbnRzOiBleHRlcm5hbC5pbkFnZW50cyB9XG5cdFx0KTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gQ29uZmlndXJhdGlvblByb3BlcnRpZXMuZnJvbShleHRlcm5hbCBhcyBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMgJiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSwgY29udGV4dCwgdHJ1ZSwgc291cmNlLCB0eXBlRGVjbGFyYXRpb24ucHJvcGVydGllcyk7XG5cdFx0cmVzdWx0LmFkZFRhc2tMb2FkTWVzc2FnZXMoY29uZmlndXJhdGlvbi5lcnJvcnMpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uLnZhbHVlKSB7XG5cdFx0XHRyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBPYmplY3QuYXNzaWduKHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcywgY29uZmlndXJhdGlvbi52YWx1ZSk7XG5cdFx0XHRpZiAocmVzdWx0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUpIHtcblx0XHRcdFx0cmVzdWx0Ll9sYWJlbCA9IHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGxhYmVsID0gcmVzdWx0LmNvbmZpZ3VyZXMudHlwZTtcblx0XHRcdFx0aWYgKHR5cGVEZWNsYXJhdGlvbi5yZXF1aXJlZCAmJiB0eXBlRGVjbGFyYXRpb24ucmVxdWlyZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVxdWlyZWQgb2YgdHlwZURlY2xhcmF0aW9uLnJlcXVpcmVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHJlc3VsdC5jb25maWd1cmVzW3JlcXVpcmVkXTtcblx0XHRcdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxhYmVsICsgJzogJyArIHZhbHVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0Ll9sYWJlbCA9IGxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllcikge1xuXHRcdFx0XHRyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciA9IHRhc2tJZGVudGlmaWVyLl9rZXk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxubmFtZXNwYWNlIEN1c3RvbVRhc2sge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0aGlzOiB2b2lkLCBleHRlcm5hbDogSUN1c3RvbVRhc2ssIGNvbnRleHQ6IElQYXJzZUNvbnRleHQsIGluZGV4OiBudW1iZXIsIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSk6IFRhc2tzLkN1c3RvbVRhc2sgfCB1bmRlZmluZWQge1xuXHRcdGlmICghZXh0ZXJuYWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCB0eXBlID0gZXh0ZXJuYWwudHlwZTtcblx0XHRpZiAodHlwZSA9PT0gdW5kZWZpbmVkIHx8IHR5cGUgPT09IG51bGwpIHtcblx0XHRcdHR5cGUgPSBUYXNrcy5DVVNUT01JWkVEX1RBU0tfVFlQRTtcblx0XHR9XG5cdFx0aWYgKHR5cGUgIT09IFRhc2tzLkNVU1RPTUlaRURfVEFTS19UWVBFICYmIHR5cGUgIT09ICdzaGVsbCcgJiYgdHlwZSAhPT0gJ3Byb2Nlc3MnKSB7XG5cdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci5lcnJvcihubHMubG9jYWxpemUoJ0NvbmZpZ3VyYXRpb25QYXJzZXIubm90Q3VzdG9tJywgJ0Vycm9yOiB0YXNrcyBpcyBub3QgZGVjbGFyZWQgYXMgYSBjdXN0b20gdGFzay4gVGhlIGNvbmZpZ3VyYXRpb24gd2lsbCBiZSBpZ25vcmVkLlxcbnswfVxcbicsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCBudWxsLCA0KSkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHRhc2tOYW1lID0gZXh0ZXJuYWwudGFza05hbWU7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGV4dGVybmFsLmxhYmVsKSAmJiBjb250ZXh0LnNjaGVtYVZlcnNpb24gPT09IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMCkge1xuXHRcdFx0dGFza05hbWUgPSBleHRlcm5hbC5sYWJlbDtcblx0XHR9XG5cdFx0aWYgKCF0YXNrTmFtZSkge1xuXHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIuZXJyb3IobmxzLmxvY2FsaXplKCdDb25maWd1cmF0aW9uUGFyc2VyLm5vVGFza05hbWUnLCAnRXJyb3I6IGEgdGFzayBtdXN0IHByb3ZpZGUgYSBsYWJlbCBwcm9wZXJ0eS4gVGhlIHRhc2sgd2lsbCBiZSBpZ25vcmVkLlxcbnswfVxcbicsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCBudWxsLCA0KSkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgdGFza1NvdXJjZTogVGFza3MuRmlsZUJhc2VkVGFza1NvdXJjZTtcblx0XHRzd2l0Y2ggKHNvdXJjZSkge1xuXHRcdFx0Y2FzZSBUYXNrQ29uZmlnU291cmNlLlVzZXI6IHtcblx0XHRcdFx0dGFza1NvdXJjZSA9IHsga2luZDogVGFza3MuVGFza1NvdXJjZUtpbmQuVXNlciwgY29uZmlnOiB7IGluZGV4LCBlbGVtZW50OiBleHRlcm5hbCwgZmlsZTogJy52c2NvZGUvdGFza3MuanNvbicsIHdvcmtzcGFjZUZvbGRlcjogY29udGV4dC53b3Jrc3BhY2VGb2xkZXIgfSwgbGFiZWwgfTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFRhc2tDb25maWdTb3VyY2UuV29ya3NwYWNlRmlsZToge1xuXHRcdFx0XHR0YXNrU291cmNlID0geyBraW5kOiBUYXNrcy5UYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlLCBjb25maWc6IHsgaW5kZXgsIGVsZW1lbnQ6IGV4dGVybmFsLCBmaWxlOiAnLnZzY29kZS90YXNrcy5qc29uJywgd29ya3NwYWNlRm9sZGVyOiBjb250ZXh0LndvcmtzcGFjZUZvbGRlciwgd29ya3NwYWNlOiBjb250ZXh0LndvcmtzcGFjZSB9LCBsYWJlbCB9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0dGFza1NvdXJjZSA9IHsga2luZDogVGFza3MuVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlLCBjb25maWc6IHsgaW5kZXgsIGVsZW1lbnQ6IGV4dGVybmFsLCBmaWxlOiAnLnZzY29kZS90YXNrcy5qc29uJywgd29ya3NwYWNlRm9sZGVyOiBjb250ZXh0LndvcmtzcGFjZUZvbGRlciB9LCBsYWJlbCB9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IFRhc2tzLkN1c3RvbVRhc2sgPSBuZXcgVGFza3MuQ3VzdG9tVGFzayhcblx0XHRcdGNvbnRleHQudXVpZE1hcC5nZXRVVUlEKHRhc2tOYW1lKSxcblx0XHRcdHRhc2tTb3VyY2UsXG5cdFx0XHR0YXNrTmFtZSxcblx0XHRcdFRhc2tzLkNVU1RPTUlaRURfVEFTS19UWVBFLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRSdW5PcHRpb25zLmZyb21Db25maWd1cmF0aW9uKGV4dGVybmFsLnJ1bk9wdGlvbnMpLFxuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiB0YXNrTmFtZSxcblx0XHRcdFx0aWRlbnRpZmllcjogdGFza05hbWUsXG5cdFx0XHR9XG5cdFx0KTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gQ29uZmlndXJhdGlvblByb3BlcnRpZXMuZnJvbShleHRlcm5hbCBhcyBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMgJiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSwgY29udGV4dCwgZmFsc2UsIHNvdXJjZSk7XG5cdFx0cmVzdWx0LmFkZFRhc2tMb2FkTWVzc2FnZXMoY29uZmlndXJhdGlvbi5lcnJvcnMpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uLnZhbHVlKSB7XG5cdFx0XHRyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBPYmplY3QuYXNzaWduKHJlc3VsdC5jb25maWd1cmF0aW9uUHJvcGVydGllcywgY29uZmlndXJhdGlvbi52YWx1ZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHN1cHBvcnRMZWdhY3k6IGJvb2xlYW4gPSB0cnVlOyAvL2NvbnRleHQuc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wO1xuXHRcdGlmIChzdXBwb3J0TGVnYWN5KSB7XG5cdFx0XHRjb25zdCBsZWdhY3k6IElMZWdhY3lUYXNrUHJvcGVydGllcyA9IGV4dGVybmFsIGFzIElMZWdhY3lUYXNrUHJvcGVydGllcztcblx0XHRcdGlmIChyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID09PSB1bmRlZmluZWQgJiYgbGVnYWN5LmlzV2F0Y2hpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID0gISFsZWdhY3kuaXNXYXRjaGluZztcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAobGVnYWN5LmlzQnVpbGRDb21tYW5kID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID0gVGFza3MuVGFza0dyb3VwLkJ1aWxkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGxlZ2FjeS5pc1Rlc3RDb21tYW5kID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID0gVGFza3MuVGFza0dyb3VwLlRlc3Q7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZDogVGFza3MuSUNvbW1hbmRDb25maWd1cmF0aW9uID0gQ29tbWFuZENvbmZpZ3VyYXRpb24uZnJvbShleHRlcm5hbCwgY29udGV4dCkhO1xuXHRcdGlmIChjb21tYW5kKSB7XG5cdFx0XHRyZXN1bHQuY29tbWFuZCA9IGNvbW1hbmQ7XG5cdFx0fVxuXHRcdGlmIChleHRlcm5hbC5jb21tYW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIGlmIHRoZSB0YXNrIGhhcyBpdHMgb3duIGNvbW1hbmQgdGhlbiB3ZSBzdXBwcmVzcyB0aGVcblx0XHRcdC8vIHRhc2sgbmFtZSBieSBkZWZhdWx0LlxuXHRcdFx0Y29tbWFuZC5zdXBwcmVzc1Rhc2tOYW1lID0gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmaWxsR2xvYmFscyh0YXNrOiBUYXNrcy5DdXN0b21UYXNrLCBnbG9iYWxzOiBJR2xvYmFscyk6IHZvaWQge1xuXHRcdC8vIFdlIG9ubHkgbWVyZ2UgYSBjb21tYW5kIGZyb20gYSBnbG9iYWwgZGVmaW5pdGlvbiBpZiB0aGVyZSBpcyBubyBkZXBlbmRzT25cblx0XHQvLyBvciB0aGVyZSBpcyBhIGRlcGVuZHNPbiBhbmQgYSBkZWZpbmVkIGNvbW1hbmQuXG5cdFx0aWYgKENvbW1hbmRDb25maWd1cmF0aW9uLmhhc0NvbW1hbmQodGFzay5jb21tYW5kKSB8fCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRlcGVuZHNPbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0YXNrLmNvbW1hbmQgPSBDb21tYW5kQ29uZmlndXJhdGlvbi5maWxsR2xvYmFscyh0YXNrLmNvbW1hbmQsIGdsb2JhbHMuY29tbWFuZCwgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lKTtcblx0XHR9XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzID09PSB1bmRlZmluZWQgJiYgZ2xvYmFscy5wcm9ibGVtTWF0Y2hlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyA9IE9iamVjdHMuZGVlcENsb25lKGdsb2JhbHMucHJvYmxlbU1hdGNoZXIpO1xuXHRcdFx0dGFzay5oYXNEZWZpbmVkTWF0Y2hlcnMgPSB0cnVlO1xuXHRcdH1cblx0XHQvLyBwcm9tcHRPbkNsb3NlIGlzIGluZmVycmVkIGZyb20gaXNCYWNrZ3JvdW5kIGlmIGF2YWlsYWJsZVxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb21wdE9uQ2xvc2UgPT09IHVuZGVmaW5lZCAmJiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCA9PT0gdW5kZWZpbmVkICYmIGdsb2JhbHMucHJvbXB0T25DbG9zZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb21wdE9uQ2xvc2UgPSBnbG9iYWxzLnByb21wdE9uQ2xvc2U7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxEZWZhdWx0cyh0YXNrOiBUYXNrcy5DdXN0b21UYXNrLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogdm9pZCB7XG5cdFx0Q29tbWFuZENvbmZpZ3VyYXRpb24uZmlsbERlZmF1bHRzKHRhc2suY29tbWFuZCwgY29udGV4dCk7XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvbXB0T25DbG9zZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb21wdE9uQ2xvc2UgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCAhPT0gdW5kZWZpbmVkID8gIXRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kIDogdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyA9IEVNUFRZX0FSUkFZO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBjcmVhdGVDdXN0b21UYXNrKGNvbnRyaWJ1dGVkVGFzazogVGFza3MuQ29udHJpYnV0ZWRUYXNrLCBjb25maWd1cmVkUHJvcHM6IFRhc2tzLkNvbmZpZ3VyaW5nVGFzayB8IFRhc2tzLkN1c3RvbVRhc2spOiBUYXNrcy5DdXN0b21UYXNrIHtcblx0XHRjb25zdCByZXN1bHQ6IFRhc2tzLkN1c3RvbVRhc2sgPSBuZXcgVGFza3MuQ3VzdG9tVGFzayhcblx0XHRcdGNvbmZpZ3VyZWRQcm9wcy5faWQsXG5cdFx0XHRPYmplY3QuYXNzaWduKHt9LCBjb25maWd1cmVkUHJvcHMuX3NvdXJjZSwgeyBjdXN0b21pemVzOiBjb250cmlidXRlZFRhc2suZGVmaW5lcyB9KSxcblx0XHRcdGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIHx8IGNvbnRyaWJ1dGVkVGFzay5fbGFiZWwsXG5cdFx0XHRUYXNrcy5DVVNUT01JWkVEX1RBU0tfVFlQRSxcblx0XHRcdGNvbnRyaWJ1dGVkVGFzay5jb21tYW5kLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRjb250cmlidXRlZFRhc2sucnVuT3B0aW9ucyxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUgfHwgY29udHJpYnV0ZWRUYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUsXG5cdFx0XHRcdGlkZW50aWZpZXI6IGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyIHx8IGNvbnRyaWJ1dGVkVGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyLFxuXHRcdFx0XHRpY29uOiBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbixcblx0XHRcdFx0aGlkZTogY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmhpZGUsXG5cdFx0XHRcdGluQWdlbnRzOiBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaW5BZ2VudHNcblx0XHRcdH0sXG5cblx0XHQpO1xuXHRcdHJlc3VsdC5hZGRUYXNrTG9hZE1lc3NhZ2VzKGNvbmZpZ3VyZWRQcm9wcy50YXNrTG9hZE1lc3NhZ2VzKTtcblx0XHRjb25zdCByZXN1bHRDb25maWdQcm9wczogVGFza3MuSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gcmVzdWx0LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzO1xuXG5cdFx0YXNzaWduUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcywgJ2dyb3VwJyk7XG5cdFx0YXNzaWduUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcywgJ2lzQmFja2dyb3VuZCcpO1xuXHRcdGFzc2lnblByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb25maWd1cmVkUHJvcHMuY29uZmlndXJhdGlvblByb3BlcnRpZXMsICdkZXBlbmRzT24nKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eShyZXN1bHRDb25maWdQcm9wcywgY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCAncHJvYmxlbU1hdGNoZXJzJyk7XG5cdFx0YXNzaWduUHJvcGVydHkocmVzdWx0Q29uZmlnUHJvcHMsIGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcywgJ3Byb21wdE9uQ2xvc2UnKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eShyZXN1bHRDb25maWdQcm9wcywgY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCAnZGV0YWlsJyk7XG5cdFx0cmVzdWx0LmNvbW1hbmQucHJlc2VudGF0aW9uID0gQ29tbWFuZENvbmZpZ3VyYXRpb24uUHJlc2VudGF0aW9uT3B0aW9ucy5hc3NpZ25Qcm9wZXJ0aWVzKFxuXHRcdFx0cmVzdWx0LmNvbW1hbmQucHJlc2VudGF0aW9uISwgY29uZmlndXJlZFByb3BzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByZXNlbnRhdGlvbikhO1xuXHRcdHJlc3VsdC5jb21tYW5kLm9wdGlvbnMgPSBDb21tYW5kT3B0aW9ucy5hc3NpZ25Qcm9wZXJ0aWVzKHJlc3VsdC5jb21tYW5kLm9wdGlvbnMsIGNvbmZpZ3VyZWRQcm9wcy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5vcHRpb25zKTtcblx0XHRyZXN1bHQucnVuT3B0aW9ucyA9IFJ1bk9wdGlvbnMuYXNzaWduUHJvcGVydGllcyhyZXN1bHQucnVuT3B0aW9ucywgY29uZmlndXJlZFByb3BzLnJ1bk9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0ZWRDb25maWdQcm9wczogVGFza3MuSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gY29udHJpYnV0ZWRUYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzO1xuXHRcdGZpbGxQcm9wZXJ0eShyZXN1bHRDb25maWdQcm9wcywgY29udHJpYnV0ZWRDb25maWdQcm9wcywgJ2dyb3VwJyk7XG5cdFx0ZmlsbFByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb250cmlidXRlZENvbmZpZ1Byb3BzLCAnaXNCYWNrZ3JvdW5kJyk7XG5cdFx0ZmlsbFByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb250cmlidXRlZENvbmZpZ1Byb3BzLCAnZGVwZW5kc09uJyk7XG5cdFx0ZmlsbFByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb250cmlidXRlZENvbmZpZ1Byb3BzLCAncHJvYmxlbU1hdGNoZXJzJyk7XG5cdFx0ZmlsbFByb3BlcnR5KHJlc3VsdENvbmZpZ1Byb3BzLCBjb250cmlidXRlZENvbmZpZ1Byb3BzLCAncHJvbXB0T25DbG9zZScpO1xuXHRcdGZpbGxQcm9wZXJ0eShyZXN1bHRDb25maWdQcm9wcywgY29udHJpYnV0ZWRDb25maWdQcm9wcywgJ2RldGFpbCcpO1xuXHRcdHJlc3VsdC5jb21tYW5kLnByZXNlbnRhdGlvbiA9IENvbW1hbmRDb25maWd1cmF0aW9uLlByZXNlbnRhdGlvbk9wdGlvbnMuZmlsbFByb3BlcnRpZXMoXG5cdFx0XHRyZXN1bHQuY29tbWFuZC5wcmVzZW50YXRpb24sIGNvbnRyaWJ1dGVkQ29uZmlnUHJvcHMucHJlc2VudGF0aW9uKSE7XG5cdFx0cmVzdWx0LmNvbW1hbmQub3B0aW9ucyA9IENvbW1hbmRPcHRpb25zLmZpbGxQcm9wZXJ0aWVzKHJlc3VsdC5jb21tYW5kLm9wdGlvbnMsIGNvbnRyaWJ1dGVkQ29uZmlnUHJvcHMub3B0aW9ucyk7XG5cdFx0cmVzdWx0LnJ1bk9wdGlvbnMgPSBSdW5PcHRpb25zLmZpbGxQcm9wZXJ0aWVzKHJlc3VsdC5ydW5PcHRpb25zLCBjb250cmlidXRlZFRhc2sucnVuT3B0aW9ucyk7XG5cblx0XHRpZiAoY29udHJpYnV0ZWRUYXNrLmhhc0RlZmluZWRNYXRjaGVycyA9PT0gdHJ1ZSkge1xuXHRcdFx0cmVzdWx0Lmhhc0RlZmluZWRNYXRjaGVycyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUGFyc2VSZXN1bHQge1xuXHRjdXN0b206IFRhc2tzLkN1c3RvbVRhc2tbXTtcblx0Y29uZmlndXJlZDogVGFza3MuQ29uZmlndXJpbmdUYXNrW107XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGFza1BhcnNlciB7XG5cblx0ZnVuY3Rpb24gaXNDdXN0b21UYXNrKHZhbHVlOiBJQ3VzdG9tVGFzayB8IElDb25maWd1cmluZ1Rhc2spOiB2YWx1ZSBpcyBJQ3VzdG9tVGFzayB7XG5cdFx0Y29uc3QgdHlwZSA9IHZhbHVlLnR5cGU7XG5cdFx0Y29uc3QgY3VzdG9taXplID0gKHZhbHVlIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmN1c3RvbWl6ZTtcblx0XHRyZXR1cm4gY3VzdG9taXplID09PSB1bmRlZmluZWQgJiYgKHR5cGUgPT09IHVuZGVmaW5lZCB8fCB0eXBlID09PSBudWxsIHx8IHR5cGUgPT09IFRhc2tzLkNVU1RPTUlaRURfVEFTS19UWVBFIHx8IHR5cGUgPT09ICdzaGVsbCcgfHwgdHlwZSA9PT0gJ3Byb2Nlc3MnKTtcblx0fVxuXG5cdGNvbnN0IGJ1aWx0aW5UeXBlQ29udGV4dE1hcDogSVN0cmluZ0RpY3Rpb25hcnk8UmF3Q29udGV4dEtleTxib29sZWFuPj4gPSB7XG5cdFx0c2hlbGw6IFNoZWxsRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCxcblx0XHRwcm9jZXNzOiBQcm9jZXNzRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxuXHR9O1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRoaXM6IHZvaWQsIGV4dGVybmFsczogQXJyYXk8SUN1c3RvbVRhc2sgfCBJQ29uZmlndXJpbmdUYXNrPiB8IHVuZGVmaW5lZCwgZ2xvYmFsczogSUdsb2JhbHMsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQsIHNvdXJjZTogVGFza0NvbmZpZ1NvdXJjZSwgcmVnaXN0cnk/OiBQYXJ0aWFsPElUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5Pik6IElUYXNrUGFyc2VSZXN1bHQge1xuXHRcdGNvbnN0IHJlc3VsdDogSVRhc2tQYXJzZVJlc3VsdCA9IHsgY3VzdG9tOiBbXSwgY29uZmlndXJlZDogW10gfTtcblx0XHRpZiAoIWV4dGVybmFscykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3QgZGVmYXVsdEJ1aWxkVGFzazogeyB0YXNrOiBUYXNrcy5UYXNrIHwgdW5kZWZpbmVkOyByYW5rOiBudW1iZXIgfSA9IHsgdGFzazogdW5kZWZpbmVkLCByYW5rOiAtMSB9O1xuXHRcdGNvbnN0IGRlZmF1bHRUZXN0VGFzazogeyB0YXNrOiBUYXNrcy5UYXNrIHwgdW5kZWZpbmVkOyByYW5rOiBudW1iZXIgfSA9IHsgdGFzazogdW5kZWZpbmVkLCByYW5rOiAtMSB9O1xuXHRcdGNvbnN0IHNjaGVtYTJfMF8wOiBib29sZWFuID0gY29udGV4dC5zY2hlbWFWZXJzaW9uID09PSBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbi5WMl8wXzA7XG5cdFx0Y29uc3QgYmFzZUxvYWRJc3N1ZXMgPSBPYmplY3RzLmRlZXBDbG9uZShjb250ZXh0LnRhc2tMb2FkSXNzdWVzKTtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZXh0ZXJuYWxzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgZXh0ZXJuYWwgPSBleHRlcm5hbHNbaW5kZXhdO1xuXHRcdFx0Y29uc3QgZGVmaW5pdGlvbiA9IGV4dGVybmFsLnR5cGUgPyByZWdpc3RyeT8uZ2V0Py4oZXh0ZXJuYWwudHlwZSkgfHwgVGFza0RlZmluaXRpb25SZWdpc3RyeS5nZXQoZXh0ZXJuYWwudHlwZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgdHlwZU5vdFN1cHBvcnRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0aWYgKGRlZmluaXRpb24gJiYgZGVmaW5pdGlvbi53aGVuICYmICFjb250ZXh0LmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZGVmaW5pdGlvbi53aGVuKSkge1xuXHRcdFx0XHR0eXBlTm90U3VwcG9ydGVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoIWRlZmluaXRpb24gJiYgZXh0ZXJuYWwudHlwZSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhidWlsdGluVHlwZUNvbnRleHRNYXApKSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVybmFsLnR5cGUgPT09IGtleSkge1xuXHRcdFx0XHRcdFx0dHlwZU5vdFN1cHBvcnRlZCA9ICFTaGVsbEV4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQuZXZhbHVhdGUoY29udGV4dC5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0KG51bGwpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZU5vdFN1cHBvcnRlZCkge1xuXHRcdFx0XHRjb250ZXh0LnByb2JsZW1SZXBvcnRlci5pbmZvKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHQndGFza0NvbmZpZ3VyYXRpb24ucHJvdmlkZXJVbmF2YWlsYWJsZScsICdXYXJuaW5nOiB7MH0gdGFza3MgYXJlIHVuYXZhaWxhYmxlIGluIHRoZSBjdXJyZW50IGVudmlyb25tZW50LlxcbicsXG5cdFx0XHRcdFx0ZXh0ZXJuYWwudHlwZVxuXHRcdFx0XHQpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0N1c3RvbVRhc2soZXh0ZXJuYWwpKSB7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbVRhc2sgPSBDdXN0b21UYXNrLmZyb20oZXh0ZXJuYWwsIGNvbnRleHQsIGluZGV4LCBzb3VyY2UpO1xuXHRcdFx0XHRpZiAoY3VzdG9tVGFzaykge1xuXHRcdFx0XHRcdEN1c3RvbVRhc2suZmlsbEdsb2JhbHMoY3VzdG9tVGFzaywgZ2xvYmFscyk7XG5cdFx0XHRcdFx0Q3VzdG9tVGFzay5maWxsRGVmYXVsdHMoY3VzdG9tVGFzaywgY29udGV4dCk7XG5cdFx0XHRcdFx0aWYgKHNjaGVtYTJfMF8wKSB7XG5cdFx0XHRcdFx0XHRpZiAoKGN1c3RvbVRhc2suY29tbWFuZCA9PT0gdW5kZWZpbmVkIHx8IGN1c3RvbVRhc2suY29tbWFuZC5uYW1lID09PSB1bmRlZmluZWQpICYmIChjdXN0b21UYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRlcGVuZHNPbiA9PT0gdW5kZWZpbmVkIHx8IGN1c3RvbVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGVwZW5kc09uLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIuZXJyb3IobmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdCd0YXNrQ29uZmlndXJhdGlvbi5ub0NvbW1hbmRPckRlcGVuZHNPbicsICdFcnJvcjogdGhlIHRhc2sgXFwnezB9XFwnIG5laXRoZXIgc3BlY2lmaWVzIGEgY29tbWFuZCBub3IgYSBkZXBlbmRzT24gcHJvcGVydHkuIFRoZSB0YXNrIHdpbGwgYmUgaWdub3JlZC4gSXRzIGRlZmluaXRpb24gaXM6XFxuezF9Jyxcblx0XHRcdFx0XHRcdFx0XHRjdXN0b21UYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCB1bmRlZmluZWQsIDQpXG5cdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGN1c3RvbVRhc2suY29tbWFuZCA9PT0gdW5kZWZpbmVkIHx8IGN1c3RvbVRhc2suY29tbWFuZC5uYW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIud2FybihubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdFx0J3Rhc2tDb25maWd1cmF0aW9uLm5vQ29tbWFuZCcsICdFcnJvcjogdGhlIHRhc2sgXFwnezB9XFwnIGRvZXNuXFwndCBkZWZpbmUgYSBjb21tYW5kLiBUaGUgdGFzayB3aWxsIGJlIGlnbm9yZWQuIEl0cyBkZWZpbml0aW9uIGlzOlxcbnsxfScsXG5cdFx0XHRcdFx0XHRcdFx0Y3VzdG9tVGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lLCBKU09OLnN0cmluZ2lmeShleHRlcm5hbCwgdW5kZWZpbmVkLCA0KVxuXHRcdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjdXN0b21UYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID09PSBUYXNrcy5UYXNrR3JvdXAuQnVpbGQgJiYgZGVmYXVsdEJ1aWxkVGFzay5yYW5rIDwgMikge1xuXHRcdFx0XHRcdFx0ZGVmYXVsdEJ1aWxkVGFzay50YXNrID0gY3VzdG9tVGFzaztcblx0XHRcdFx0XHRcdGRlZmF1bHRCdWlsZFRhc2sucmFuayA9IDI7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChjdXN0b21UYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID09PSBUYXNrcy5UYXNrR3JvdXAuVGVzdCAmJiBkZWZhdWx0VGVzdFRhc2sucmFuayA8IDIpIHtcblx0XHRcdFx0XHRcdGRlZmF1bHRUZXN0VGFzay50YXNrID0gY3VzdG9tVGFzaztcblx0XHRcdFx0XHRcdGRlZmF1bHRUZXN0VGFzay5yYW5rID0gMjtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1c3RvbVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSA9PT0gJ2J1aWxkJyAmJiBkZWZhdWx0QnVpbGRUYXNrLnJhbmsgPCAxKSB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0QnVpbGRUYXNrLnRhc2sgPSBjdXN0b21UYXNrO1xuXHRcdFx0XHRcdFx0ZGVmYXVsdEJ1aWxkVGFzay5yYW5rID0gMTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1c3RvbVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSA9PT0gJ3Rlc3QnICYmIGRlZmF1bHRUZXN0VGFzay5yYW5rIDwgMSkge1xuXHRcdFx0XHRcdFx0ZGVmYXVsdFRlc3RUYXNrLnRhc2sgPSBjdXN0b21UYXNrO1xuXHRcdFx0XHRcdFx0ZGVmYXVsdFRlc3RUYXNrLnJhbmsgPSAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjdXN0b21UYXNrLmFkZFRhc2tMb2FkTWVzc2FnZXMoY29udGV4dC50YXNrTG9hZElzc3Vlcyk7XG5cdFx0XHRcdFx0cmVzdWx0LmN1c3RvbS5wdXNoKGN1c3RvbVRhc2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkVGFzayA9IENvbmZpZ3VyaW5nVGFzay5mcm9tKGV4dGVybmFsLCBjb250ZXh0LCBpbmRleCwgc291cmNlLCByZWdpc3RyeSk7XG5cdFx0XHRcdGlmIChjb25maWd1cmVkVGFzaykge1xuXHRcdFx0XHRcdGNvbmZpZ3VyZWRUYXNrLmFkZFRhc2tMb2FkTWVzc2FnZXMoY29udGV4dC50YXNrTG9hZElzc3Vlcyk7XG5cdFx0XHRcdFx0cmVzdWx0LmNvbmZpZ3VyZWQucHVzaChjb25maWd1cmVkVGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnRleHQudGFza0xvYWRJc3N1ZXMgPSBPYmplY3RzLmRlZXBDbG9uZShiYXNlTG9hZElzc3Vlcyk7XG5cdFx0fVxuXHRcdC8vIFRoZXJlIGlzIHNvbWUgc3BlY2lhbCBsb2dpYyBmb3IgdGFza3Mgd2l0aCB0aGUgbGFiZWxzIFwiYnVpbGRcIiBhbmQgXCJ0ZXN0XCIuXG5cdFx0Ly8gRXZlbiBpZiB0aGV5IGFyZSBub3QgbWFya2VkIGFzIGEgdGFzayBncm91cCBCdWlsZCBvciBUZXN0LCB3ZSBhdXRvbWFnaWNhbGx5IGdyb3VwIHRoZW0gYXMgc3VjaC5cblx0XHQvLyBIb3dldmVyLCBpZiB0aGV5IGFyZSBhbHJlYWR5IGdyb3VwZWQgYXMgQnVpbGQgb3IgVGVzdCwgd2UgZG9uJ3QgbmVlZCB0byBhZGQgdGhpcyBncm91cGluZy5cblx0XHRjb25zdCBkZWZhdWx0QnVpbGRHcm91cE5hbWUgPSBUeXBlcy5pc1N0cmluZyhkZWZhdWx0QnVpbGRUYXNrLnRhc2s/LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKSA/IGRlZmF1bHRCdWlsZFRhc2sudGFzaz8uY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgOiBkZWZhdWx0QnVpbGRUYXNrLnRhc2s/LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwPy5faWQ7XG5cdFx0Y29uc3QgZGVmYXVsdFRlc3RUYXNrR3JvdXBOYW1lID0gVHlwZXMuaXNTdHJpbmcoZGVmYXVsdFRlc3RUYXNrLnRhc2s/LmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKSA/IGRlZmF1bHRUZXN0VGFzay50YXNrPy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCA6IGRlZmF1bHRUZXN0VGFzay50YXNrPy5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cD8uX2lkO1xuXHRcdGlmICgoZGVmYXVsdEJ1aWxkR3JvdXBOYW1lICE9PSBUYXNrcy5UYXNrR3JvdXAuQnVpbGQuX2lkKSAmJiAoZGVmYXVsdEJ1aWxkVGFzay5yYW5rID4gLTEpICYmIChkZWZhdWx0QnVpbGRUYXNrLnJhbmsgPCAyKSAmJiBkZWZhdWx0QnVpbGRUYXNrLnRhc2spIHtcblx0XHRcdGRlZmF1bHRCdWlsZFRhc2sudGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCA9IFRhc2tzLlRhc2tHcm91cC5CdWlsZDtcblx0XHR9IGVsc2UgaWYgKChkZWZhdWx0VGVzdFRhc2tHcm91cE5hbWUgIT09IFRhc2tzLlRhc2tHcm91cC5UZXN0Ll9pZCkgJiYgKGRlZmF1bHRUZXN0VGFzay5yYW5rID4gLTEpICYmIChkZWZhdWx0VGVzdFRhc2sucmFuayA8IDIpICYmIGRlZmF1bHRUZXN0VGFzay50YXNrKSB7XG5cdFx0XHRkZWZhdWx0VGVzdFRhc2sudGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCA9IFRhc2tzLlRhc2tHcm91cC5UZXN0O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gYXNzaWduVGFza3ModGFyZ2V0OiBUYXNrcy5DdXN0b21UYXNrW10sIHNvdXJjZTogVGFza3MuQ3VzdG9tVGFza1tdKTogVGFza3MuQ3VzdG9tVGFza1tdIHtcblx0XHRpZiAoc291cmNlID09PSB1bmRlZmluZWQgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gdW5kZWZpbmVkIHx8IHRhcmdldC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBzb3VyY2U7XG5cdFx0fVxuXG5cdFx0aWYgKHNvdXJjZSkge1xuXHRcdFx0Ly8gVGFza3MgYXJlIGtleWVkIGJ5IElEIGJ1dCB3ZSBuZWVkIHRvIG1lcmdlIGJ5IG5hbWVcblx0XHRcdGNvbnN0IG1hcDogSVN0cmluZ0RpY3Rpb25hcnk8VGFza3MuQ3VzdG9tVGFzaz4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0dGFyZ2V0LmZvckVhY2goKHRhc2spID0+IHtcblx0XHRcdFx0bWFwW3Rhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSFdID0gdGFzaztcblx0XHRcdH0pO1xuXG5cdFx0XHRzb3VyY2UuZm9yRWFjaCgodGFzaykgPT4ge1xuXHRcdFx0XHRtYXBbdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIV0gPSB0YXNrO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBuZXdUYXJnZXQ6IFRhc2tzLkN1c3RvbVRhc2tbXSA9IFtdO1xuXHRcdFx0dGFyZ2V0LmZvckVhY2godGFzayA9PiB7XG5cdFx0XHRcdG5ld1RhcmdldC5wdXNoKG1hcFt0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUhXSk7XG5cdFx0XHRcdGRlbGV0ZSBtYXBbdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lIV07XG5cdFx0XHR9KTtcblx0XHRcdE9iamVjdC5rZXlzKG1hcCkuZm9yRWFjaChrZXkgPT4gbmV3VGFyZ2V0LnB1c2gobWFwW2tleV0pKTtcblx0XHRcdHRhcmdldCA9IG5ld1RhcmdldDtcblx0XHR9XG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHbG9iYWxzIHtcblx0Y29tbWFuZD86IFRhc2tzLklDb21tYW5kQ29uZmlndXJhdGlvbjtcblx0cHJvYmxlbU1hdGNoZXI/OiBQcm9ibGVtTWF0Y2hlcltdO1xuXHRwcm9tcHRPbkNsb3NlPzogYm9vbGVhbjtcblx0c3VwcHJlc3NUYXNrTmFtZT86IGJvb2xlYW47XG59XG5cbm5hbWVzcGFjZSBHbG9iYWxzIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShjb25maWc6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogSUdsb2JhbHMge1xuXHRcdGxldCByZXN1bHQgPSBmcm9tQmFzZShjb25maWcsIGNvbnRleHQpO1xuXHRcdGxldCBvc0dsb2JhbHM6IElHbG9iYWxzIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChjb25maWcud2luZG93cyAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5XaW5kb3dzKSB7XG5cdFx0XHRvc0dsb2JhbHMgPSBmcm9tQmFzZShjb25maWcud2luZG93cywgY29udGV4dCk7XG5cdFx0fSBlbHNlIGlmIChjb25maWcub3N4ICYmIGNvbnRleHQucGxhdGZvcm0gPT09IFBsYXRmb3JtLk1hYykge1xuXHRcdFx0b3NHbG9iYWxzID0gZnJvbUJhc2UoY29uZmlnLm9zeCwgY29udGV4dCk7XG5cdFx0fSBlbHNlIGlmIChjb25maWcubGludXggJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTGludXgpIHtcblx0XHRcdG9zR2xvYmFscyA9IGZyb21CYXNlKGNvbmZpZy5saW51eCwgY29udGV4dCk7XG5cdFx0fVxuXHRcdGlmIChvc0dsb2JhbHMpIHtcblx0XHRcdHJlc3VsdCA9IEdsb2JhbHMuYXNzaWduUHJvcGVydGllcyhyZXN1bHQsIG9zR2xvYmFscyk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kQ29uZmlndXJhdGlvbi5mcm9tKGNvbmZpZywgY29udGV4dCk7XG5cdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdHJlc3VsdC5jb21tYW5kID0gY29tbWFuZDtcblx0XHR9XG5cdFx0R2xvYmFscy5maWxsRGVmYXVsdHMocmVzdWx0LCBjb250ZXh0KTtcblx0XHRHbG9iYWxzLmZyZWV6ZShyZXN1bHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbUJhc2UodGhpczogdm9pZCwgY29uZmlnOiBJQmFzZVRhc2tSdW5uZXJDb25maWd1cmF0aW9uLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0KTogSUdsb2JhbHMge1xuXHRcdGNvbnN0IHJlc3VsdDogSUdsb2JhbHMgPSB7fTtcblx0XHRpZiAoY29uZmlnLnN1cHByZXNzVGFza05hbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LnN1cHByZXNzVGFza05hbWUgPSAhIWNvbmZpZy5zdXBwcmVzc1Rhc2tOYW1lO1xuXHRcdH1cblx0XHRpZiAoY29uZmlnLnByb21wdE9uQ2xvc2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0LnByb21wdE9uQ2xvc2UgPSAhIWNvbmZpZy5wcm9tcHRPbkNsb3NlO1xuXHRcdH1cblx0XHRpZiAoY29uZmlnLnByb2JsZW1NYXRjaGVyKSB7XG5cdFx0XHRyZXN1bHQucHJvYmxlbU1hdGNoZXIgPSBQcm9ibGVtTWF0Y2hlckNvbnZlcnRlci5mcm9tKGNvbmZpZy5wcm9ibGVtTWF0Y2hlciwgY29udGV4dCkudmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNFbXB0eSh2YWx1ZTogSUdsb2JhbHMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXZhbHVlIHx8IHZhbHVlLmNvbW1hbmQgPT09IHVuZGVmaW5lZCAmJiB2YWx1ZS5wcm9tcHRPbkNsb3NlID09PSB1bmRlZmluZWQgJiYgdmFsdWUuc3VwcHJlc3NUYXNrTmFtZSA9PT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGFzc2lnblByb3BlcnRpZXModGFyZ2V0OiBJR2xvYmFscywgc291cmNlOiBJR2xvYmFscyk6IElHbG9iYWxzIHtcblx0XHRpZiAoaXNFbXB0eShzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH1cblx0XHRpZiAoaXNFbXB0eSh0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm4gc291cmNlO1xuXHRcdH1cblx0XHRhc3NpZ25Qcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3Byb21wdE9uQ2xvc2UnKTtcblx0XHRhc3NpZ25Qcm9wZXJ0eSh0YXJnZXQsIHNvdXJjZSwgJ3N1cHByZXNzVGFza05hbWUnKTtcblx0XHRyZXR1cm4gdGFyZ2V0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZpbGxEZWZhdWx0cyh2YWx1ZTogSUdsb2JhbHMsIGNvbnRleHQ6IElQYXJzZUNvbnRleHQpOiB2b2lkIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdENvbW1hbmRDb25maWd1cmF0aW9uLmZpbGxEZWZhdWx0cyh2YWx1ZS5jb21tYW5kLCBjb250ZXh0KTtcblx0XHRpZiAodmFsdWUuc3VwcHJlc3NUYXNrTmFtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZS5zdXBwcmVzc1Rhc2tOYW1lID0gKGNvbnRleHQuc2NoZW1hVmVyc2lvbiA9PT0gVGFza3MuSnNvblNjaGVtYVZlcnNpb24uVjJfMF8wKTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLnByb21wdE9uQ2xvc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWUucHJvbXB0T25DbG9zZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyZWV6ZSh2YWx1ZTogSUdsb2JhbHMpOiB2b2lkIHtcblx0XHRPYmplY3QuZnJlZXplKHZhbHVlKTtcblx0XHRpZiAodmFsdWUuY29tbWFuZCkge1xuXHRcdFx0Q29tbWFuZENvbmZpZ3VyYXRpb24uZnJlZXplKHZhbHVlLmNvbW1hbmQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEV4ZWN1dGlvbkVuZ2luZSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oY29uZmlnOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbik6IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZSB7XG5cdFx0Y29uc3QgcnVubmVyID0gY29uZmlnLnJ1bm5lciB8fCBjb25maWcuX3J1bm5lcjtcblx0XHRsZXQgcmVzdWx0OiBUYXNrcy5FeGVjdXRpb25FbmdpbmUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJ1bm5lcikge1xuXHRcdFx0c3dpdGNoIChydW5uZXIpIHtcblx0XHRcdFx0Y2FzZSAndGVybWluYWwnOlxuXHRcdFx0XHRcdHJlc3VsdCA9IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAncHJvY2Vzcyc6XG5cdFx0XHRcdFx0cmVzdWx0ID0gVGFza3MuRXhlY3V0aW9uRW5naW5lLlByb2Nlc3M7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNjaGVtYVZlcnNpb24gPSBKc29uU2NoZW1hVmVyc2lvbi5mcm9tKGNvbmZpZyk7XG5cdFx0aWYgKHNjaGVtYVZlcnNpb24gPT09IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYwXzFfMCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdCB8fCBUYXNrcy5FeGVjdXRpb25FbmdpbmUuUHJvY2Vzcztcblx0XHR9IGVsc2UgaWYgKHNjaGVtYVZlcnNpb24gPT09IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMCkge1xuXHRcdFx0cmV0dXJuIFRhc2tzLkV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGRuXFwndCBoYXBwZW4uJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSnNvblNjaGVtYVZlcnNpb24ge1xuXG5cdGNvbnN0IF9kZWZhdWx0OiBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbiA9IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMDtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShjb25maWc6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uKTogVGFza3MuSnNvblNjaGVtYVZlcnNpb24ge1xuXHRcdGNvbnN0IHZlcnNpb24gPSBjb25maWcudmVyc2lvbjtcblx0XHRpZiAoIXZlcnNpb24pIHtcblx0XHRcdHJldHVybiBfZGVmYXVsdDtcblx0XHR9XG5cdFx0c3dpdGNoICh2ZXJzaW9uKSB7XG5cdFx0XHRjYXNlICcwLjEuMCc6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbi5WMF8xXzA7XG5cdFx0XHRjYXNlICcyLjAuMCc6XG5cdFx0XHRcdHJldHVybiBUYXNrcy5Kc29uU2NoZW1hVmVyc2lvbi5WMl8wXzA7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gX2RlZmF1bHQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlUmVzdWx0IHtcblx0dmFsaWRhdGlvblN0YXR1czogVmFsaWRhdGlvblN0YXR1cztcblx0Y3VzdG9tOiBUYXNrcy5DdXN0b21UYXNrW107XG5cdGNvbmZpZ3VyZWQ6IFRhc2tzLkNvbmZpZ3VyaW5nVGFza1tdO1xuXHRlbmdpbmU6IFRhc2tzLkV4ZWN1dGlvbkVuZ2luZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvYmxlbVJlcG9ydGVyIGV4dGVuZHMgSVByb2JsZW1SZXBvcnRlckJhc2Uge1xufVxuXG5leHBvcnQgY2xhc3MgVVVJRE1hcCB7XG5cblx0cHJpdmF0ZSBsYXN0OiBJU3RyaW5nRGljdGlvbmFyeTxUeXBlcy5TaW5nbGVPck1hbnk8c3RyaW5nPj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudDogSVN0cmluZ0RpY3Rpb25hcnk8VHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz4+O1xuXG5cdGNvbnN0cnVjdG9yKG90aGVyPzogVVVJRE1hcCkge1xuXHRcdHRoaXMuY3VycmVudCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0aWYgKG90aGVyKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvdGhlci5jdXJyZW50KSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IG90aGVyLmN1cnJlbnRba2V5XTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50W2tleV0gPSB2YWx1ZS5zbGljZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY3VycmVudFtrZXldID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5sYXN0ID0gdGhpcy5jdXJyZW50O1xuXHRcdHRoaXMuY3VycmVudCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VVVJRChpZGVudGlmaWVyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxhc3RWYWx1ZSA9IHRoaXMubGFzdCA/IHRoaXMubGFzdFtpZGVudGlmaWVyXSA6IHVuZGVmaW5lZDtcblx0XHRsZXQgcmVzdWx0OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGxhc3RWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShsYXN0VmFsdWUpKSB7XG5cdFx0XHRcdHJlc3VsdCA9IGxhc3RWYWx1ZS5zaGlmdCgpO1xuXHRcdFx0XHRpZiAobGFzdFZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLmxhc3QhW2lkZW50aWZpZXJdO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQgPSBsYXN0VmFsdWU7XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLmxhc3QhW2lkZW50aWZpZXJdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdCA9IFVVSUQuZ2VuZXJhdGVVdWlkKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHRoaXMuY3VycmVudFtpZGVudGlmaWVyXTtcblx0XHRpZiAoY3VycmVudFZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuY3VycmVudFtpZGVudGlmaWVyXSA9IHJlc3VsdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFZhbHVlKSkge1xuXHRcdFx0XHRjdXJyZW50VmFsdWUucHVzaChyZXN1bHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgYXJyYXlWYWx1ZTogc3RyaW5nW10gPSBbY3VycmVudFZhbHVlXTtcblx0XHRcdFx0YXJyYXlWYWx1ZS5wdXNoKHJlc3VsdCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudFtpZGVudGlmaWVyXSA9IGFycmF5VmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZmluaXNoKCk6IHZvaWQge1xuXHRcdHRoaXMubGFzdCA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgZW51bSBUYXNrQ29uZmlnU291cmNlIHtcblx0VGFza3NKc29uLFxuXHRXb3Jrc3BhY2VGaWxlLFxuXHRVc2VyXG59XG5cbmNsYXNzIENvbmZpZ3VyYXRpb25QYXJzZXIge1xuXG5cdHByaXZhdGUgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyO1xuXHRwcml2YXRlIHdvcmtzcGFjZTogSVdvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcm9ibGVtUmVwb3J0ZXI6IElQcm9ibGVtUmVwb3J0ZXI7XG5cdHByaXZhdGUgdXVpZE1hcDogVVVJRE1hcDtcblx0cHJpdmF0ZSBwbGF0Zm9ybTogUGxhdGZvcm07XG5cblx0Y29uc3RydWN0b3Iod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2U6IElXb3Jrc3BhY2UgfCB1bmRlZmluZWQsIHBsYXRmb3JtOiBQbGF0Zm9ybSwgcHJvYmxlbVJlcG9ydGVyOiBJUHJvYmxlbVJlcG9ydGVyLCB1dWlkTWFwOiBVVUlETWFwKSB7XG5cdFx0dGhpcy53b3Jrc3BhY2VGb2xkZXIgPSB3b3Jrc3BhY2VGb2xkZXI7XG5cdFx0dGhpcy53b3Jrc3BhY2UgPSB3b3Jrc3BhY2U7XG5cdFx0dGhpcy5wbGF0Zm9ybSA9IHBsYXRmb3JtO1xuXHRcdHRoaXMucHJvYmxlbVJlcG9ydGVyID0gcHJvYmxlbVJlcG9ydGVyO1xuXHRcdHRoaXMudXVpZE1hcCA9IHV1aWRNYXA7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGZpbGVDb25maWc6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uLCBzb3VyY2U6IFRhc2tDb25maWdTb3VyY2UsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJUGFyc2VSZXN1bHQge1xuXHRcdGNvbnN0IGVuZ2luZSA9IEV4ZWN1dGlvbkVuZ2luZS5mcm9tKGZpbGVDb25maWcpO1xuXHRcdGNvbnN0IHNjaGVtYVZlcnNpb24gPSBKc29uU2NoZW1hVmVyc2lvbi5mcm9tKGZpbGVDb25maWcpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElQYXJzZUNvbnRleHQgPSB7XG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHRoaXMud29ya3NwYWNlRm9sZGVyLFxuXHRcdFx0d29ya3NwYWNlOiB0aGlzLndvcmtzcGFjZSxcblx0XHRcdHByb2JsZW1SZXBvcnRlcjogdGhpcy5wcm9ibGVtUmVwb3J0ZXIsXG5cdFx0XHR1dWlkTWFwOiB0aGlzLnV1aWRNYXAsXG5cdFx0XHRuYW1lZFByb2JsZW1NYXRjaGVyczoge30sXG5cdFx0XHRlbmdpbmUsXG5cdFx0XHRzY2hlbWFWZXJzaW9uLFxuXHRcdFx0cGxhdGZvcm06IHRoaXMucGxhdGZvcm0sXG5cdFx0XHR0YXNrTG9hZElzc3VlczogW10sXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZVxuXHRcdH07XG5cdFx0Y29uc3QgdGFza1BhcnNlUmVzdWx0ID0gdGhpcy5jcmVhdGVUYXNrUnVubmVyQ29uZmlndXJhdGlvbihmaWxlQ29uZmlnLCBjb250ZXh0LCBzb3VyY2UpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR2YWxpZGF0aW9uU3RhdHVzOiB0aGlzLnByb2JsZW1SZXBvcnRlci5zdGF0dXMsXG5cdFx0XHRjdXN0b206IHRhc2tQYXJzZVJlc3VsdC5jdXN0b20sXG5cdFx0XHRjb25maWd1cmVkOiB0YXNrUGFyc2VSZXN1bHQuY29uZmlndXJlZCxcblx0XHRcdGVuZ2luZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhc2tSdW5uZXJDb25maWd1cmF0aW9uKGZpbGVDb25maWc6IElFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uLCBjb250ZXh0OiBJUGFyc2VDb250ZXh0LCBzb3VyY2U6IFRhc2tDb25maWdTb3VyY2UpOiBJVGFza1BhcnNlUmVzdWx0IHtcblx0XHRjb25zdCBnbG9iYWxzID0gR2xvYmFscy5mcm9tKGZpbGVDb25maWcsIGNvbnRleHQpO1xuXHRcdGlmICh0aGlzLnByb2JsZW1SZXBvcnRlci5zdGF0dXMuaXNGYXRhbCgpKSB7XG5cdFx0XHRyZXR1cm4geyBjdXN0b206IFtdLCBjb25maWd1cmVkOiBbXSB9O1xuXHRcdH1cblx0XHRjb250ZXh0Lm5hbWVkUHJvYmxlbU1hdGNoZXJzID0gUHJvYmxlbU1hdGNoZXJDb252ZXJ0ZXIubmFtZWRGcm9tKGZpbGVDb25maWcuZGVjbGFyZXMsIGNvbnRleHQpO1xuXHRcdGxldCBnbG9iYWxUYXNrczogVGFza3MuQ3VzdG9tVGFza1tdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBleHRlcm5hbEdsb2JhbFRhc2tzOiBBcnJheTxJQ29uZmlndXJpbmdUYXNrIHwgSUN1c3RvbVRhc2s+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChmaWxlQ29uZmlnLndpbmRvd3MgJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uV2luZG93cykge1xuXHRcdFx0Z2xvYmFsVGFza3MgPSBUYXNrUGFyc2VyLmZyb20oZmlsZUNvbmZpZy53aW5kb3dzLnRhc2tzLCBnbG9iYWxzLCBjb250ZXh0LCBzb3VyY2UpLmN1c3RvbTtcblx0XHRcdGV4dGVybmFsR2xvYmFsVGFza3MgPSBmaWxlQ29uZmlnLndpbmRvd3MudGFza3M7XG5cdFx0fSBlbHNlIGlmIChmaWxlQ29uZmlnLm9zeCAmJiBjb250ZXh0LnBsYXRmb3JtID09PSBQbGF0Zm9ybS5NYWMpIHtcblx0XHRcdGdsb2JhbFRhc2tzID0gVGFza1BhcnNlci5mcm9tKGZpbGVDb25maWcub3N4LnRhc2tzLCBnbG9iYWxzLCBjb250ZXh0LCBzb3VyY2UpLmN1c3RvbTtcblx0XHRcdGV4dGVybmFsR2xvYmFsVGFza3MgPSBmaWxlQ29uZmlnLm9zeC50YXNrcztcblx0XHR9IGVsc2UgaWYgKGZpbGVDb25maWcubGludXggJiYgY29udGV4dC5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uTGludXgpIHtcblx0XHRcdGdsb2JhbFRhc2tzID0gVGFza1BhcnNlci5mcm9tKGZpbGVDb25maWcubGludXgudGFza3MsIGdsb2JhbHMsIGNvbnRleHQsIHNvdXJjZSkuY3VzdG9tO1xuXHRcdFx0ZXh0ZXJuYWxHbG9iYWxUYXNrcyA9IGZpbGVDb25maWcubGludXgudGFza3M7XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0LnNjaGVtYVZlcnNpb24gPT09IFRhc2tzLkpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMCAmJiBnbG9iYWxUYXNrcyAmJiBnbG9iYWxUYXNrcy5sZW5ndGggPiAwICYmIGV4dGVybmFsR2xvYmFsVGFza3MgJiYgZXh0ZXJuYWxHbG9iYWxUYXNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCB0YXNrQ29udGVudDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBleHRlcm5hbEdsb2JhbFRhc2tzKSB7XG5cdFx0XHRcdHRhc2tDb250ZW50LnB1c2goSlNPTi5zdHJpbmdpZnkodGFzaywgbnVsbCwgNCkpO1xuXHRcdFx0fVxuXHRcdFx0Y29udGV4dC5wcm9ibGVtUmVwb3J0ZXIuZXJyb3IoXG5cdFx0XHRcdG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ1Rhc2tQYXJzZS5ub09zU3BlY2lmaWNHbG9iYWxUYXNrcycsIGNvbW1lbnQ6IFsnXFxcIlRhc2sgdmVyc2lvbiAyLjAuMFxcXCIgcmVmZXJzIHRvIHRoZSAyLjAuMCB2ZXJzaW9uIG9mIHRoZSB0YXNrIHN5c3RlbS4gVGhlIFxcXCJ2ZXJzaW9uIDIuMC4wXFxcIiBpcyBub3QgbG9jYWxpemFibGUgYXMgaXQgaXMgYSBqc29uIGtleSBhbmQgdmFsdWUuJ10gfSxcblx0XHRcdFx0XHQnVGFzayB2ZXJzaW9uIDIuMC4wIGRvZXNuXFwndCBzdXBwb3J0IGdsb2JhbCBPUyBzcGVjaWZpYyB0YXNrcy4gQ29udmVydCB0aGVtIHRvIGEgdGFzayB3aXRoIGEgT1Mgc3BlY2lmaWMgY29tbWFuZC4gQWZmZWN0ZWQgdGFza3MgYXJlOlxcbnswfScsIHRhc2tDb250ZW50LmpvaW4oJ1xcbicpKVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBJVGFza1BhcnNlUmVzdWx0ID0geyBjdXN0b206IFtdLCBjb25maWd1cmVkOiBbXSB9O1xuXHRcdGlmIChmaWxlQ29uZmlnLnRhc2tzKSB7XG5cdFx0XHRyZXN1bHQgPSBUYXNrUGFyc2VyLmZyb20oZmlsZUNvbmZpZy50YXNrcywgZ2xvYmFscywgY29udGV4dCwgc291cmNlKTtcblx0XHR9XG5cdFx0aWYgKGdsb2JhbFRhc2tzKSB7XG5cdFx0XHRyZXN1bHQuY3VzdG9tID0gVGFza1BhcnNlci5hc3NpZ25UYXNrcyhyZXN1bHQuY3VzdG9tLCBnbG9iYWxUYXNrcyk7XG5cdFx0fVxuXG5cdFx0aWYgKCghcmVzdWx0LmN1c3RvbSB8fCByZXN1bHQuY3VzdG9tLmxlbmd0aCA9PT0gMCkgJiYgKGdsb2JhbHMuY29tbWFuZCAmJiBnbG9iYWxzLmNvbW1hbmQubmFtZSkpIHtcblx0XHRcdGNvbnN0IG1hdGNoZXJzOiBQcm9ibGVtTWF0Y2hlcltdID0gUHJvYmxlbU1hdGNoZXJDb252ZXJ0ZXIuZnJvbShmaWxlQ29uZmlnLnByb2JsZW1NYXRjaGVyLCBjb250ZXh0KS52YWx1ZSA/PyBbXTtcblx0XHRcdGNvbnN0IGlzQmFja2dyb3VuZCA9IGZpbGVDb25maWcuaXNCYWNrZ3JvdW5kID8gISFmaWxlQ29uZmlnLmlzQmFja2dyb3VuZCA6IGZpbGVDb25maWcuaXNXYXRjaGluZyA/ICEhZmlsZUNvbmZpZy5pc1dhdGNoaW5nIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbmFtZSA9IFRhc2tzLkNvbW1hbmRTdHJpbmcudmFsdWUoZ2xvYmFscy5jb21tYW5kLm5hbWUpO1xuXHRcdFx0Y29uc3QgdGFzazogVGFza3MuQ3VzdG9tVGFzayA9IG5ldyBUYXNrcy5DdXN0b21UYXNrKFxuXHRcdFx0XHRjb250ZXh0LnV1aWRNYXAuZ2V0VVVJRChuYW1lKSxcblx0XHRcdFx0T2JqZWN0LmFzc2lnbih7fSwgc291cmNlLCAnd29ya3NwYWNlJywgeyBjb25maWc6IHsgaW5kZXg6IC0xLCBlbGVtZW50OiBmaWxlQ29uZmlnLCB3b3Jrc3BhY2VGb2xkZXI6IGNvbnRleHQud29ya3NwYWNlRm9sZGVyIH0gfSkgc2F0aXNmaWVzIFRhc2tzLklXb3Jrc3BhY2VUYXNrU291cmNlLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRUYXNrcy5DVVNUT01JWkVEX1RBU0tfVFlQRSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRydW50aW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3VwcHJlc3NUYXNrTmFtZTogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0eyByZWV2YWx1YXRlT25SZXJ1bjogdHJ1ZSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogbmFtZSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBuYW1lLFxuXHRcdFx0XHRcdGdyb3VwOiBUYXNrcy5UYXNrR3JvdXAuQnVpbGQsXG5cdFx0XHRcdFx0aXNCYWNrZ3JvdW5kOiBpc0JhY2tncm91bmQsXG5cdFx0XHRcdFx0cHJvYmxlbU1hdGNoZXJzOiBtYXRjaGVyc1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdGFza0dyb3VwS2luZCA9IEdyb3VwS2luZC5mcm9tKGZpbGVDb25maWcuZ3JvdXApO1xuXHRcdFx0aWYgKHRhc2tHcm91cEtpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID0gdGFza0dyb3VwS2luZDtcblx0XHRcdH0gZWxzZSBpZiAoZmlsZUNvbmZpZy5ncm91cCA9PT0gJ25vbmUnKSB7XG5cdFx0XHRcdHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRDdXN0b21UYXNrLmZpbGxHbG9iYWxzKHRhc2ssIGdsb2JhbHMpO1xuXHRcdFx0Q3VzdG9tVGFzay5maWxsRGVmYXVsdHModGFzaywgY29udGV4dCk7XG5cdFx0XHRyZXN1bHQuY3VzdG9tID0gW3Rhc2tdO1xuXHRcdH1cblx0XHRyZXN1bHQuY3VzdG9tID0gcmVzdWx0LmN1c3RvbSB8fCBbXTtcblx0XHRyZXN1bHQuY29uZmlndXJlZCA9IHJlc3VsdC5jb25maWd1cmVkIHx8IFtdO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY29uc3QgdXVpZE1hcHM6IE1hcDxUYXNrQ29uZmlnU291cmNlLCBNYXA8c3RyaW5nLCBVVUlETWFwPj4gPSBuZXcgTWFwKCk7XG5jb25zdCByZWNlbnRVdWlkTWFwczogTWFwPFRhc2tDb25maWdTb3VyY2UsIE1hcDxzdHJpbmcsIFVVSURNYXA+PiA9IG5ldyBNYXAoKTtcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZSh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsIHdvcmtzcGFjZTogSVdvcmtzcGFjZSB8IHVuZGVmaW5lZCwgcGxhdGZvcm06IFBsYXRmb3JtLCBjb25maWd1cmF0aW9uOiBJRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiwgbG9nZ2VyOiBJUHJvYmxlbVJlcG9ydGVyLCBzb3VyY2U6IFRhc2tDb25maWdTb3VyY2UsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIGlzUmVjZW50czogYm9vbGVhbiA9IGZhbHNlKTogSVBhcnNlUmVzdWx0IHtcblx0Y29uc3QgcmVjZW50T3JPdGhlck1hcHMgPSBpc1JlY2VudHMgPyByZWNlbnRVdWlkTWFwcyA6IHV1aWRNYXBzO1xuXHRsZXQgc2VsZWN0ZWRVdWlkTWFwcyA9IHJlY2VudE9yT3RoZXJNYXBzLmdldChzb3VyY2UpO1xuXHRpZiAoIXNlbGVjdGVkVXVpZE1hcHMpIHtcblx0XHRyZWNlbnRPck90aGVyTWFwcy5zZXQoc291cmNlLCBuZXcgTWFwKCkpO1xuXHRcdHNlbGVjdGVkVXVpZE1hcHMgPSByZWNlbnRPck90aGVyTWFwcy5nZXQoc291cmNlKSE7XG5cdH1cblx0bGV0IHV1aWRNYXAgPSBzZWxlY3RlZFV1aWRNYXBzLmdldCh3b3Jrc3BhY2VGb2xkZXIudXJpLnRvU3RyaW5nKCkpO1xuXHRpZiAoIXV1aWRNYXApIHtcblx0XHR1dWlkTWFwID0gbmV3IFVVSURNYXAoKTtcblx0XHRzZWxlY3RlZFV1aWRNYXBzLnNldCh3b3Jrc3BhY2VGb2xkZXIudXJpLnRvU3RyaW5nKCksIHV1aWRNYXApO1xuXHR9XG5cdHRyeSB7XG5cdFx0dXVpZE1hcC5zdGFydCgpO1xuXHRcdHJldHVybiAobmV3IENvbmZpZ3VyYXRpb25QYXJzZXIod29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2UsIHBsYXRmb3JtLCBsb2dnZXIsIHV1aWRNYXApKS5ydW4oY29uZmlndXJhdGlvbiwgc291cmNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdH0gZmluYWxseSB7XG5cdFx0dXVpZE1hcC5maW5pc2goKTtcblx0fVxufVxuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUN1c3RvbVRhc2soY29udHJpYnV0ZWRUYXNrOiBUYXNrcy5Db250cmlidXRlZFRhc2ssIGNvbmZpZ3VyZWRQcm9wczogVGFza3MuQ29uZmlndXJpbmdUYXNrIHwgVGFza3MuQ3VzdG9tVGFzayk6IFRhc2tzLkN1c3RvbVRhc2sge1xuXHRyZXR1cm4gQ3VzdG9tVGFzay5jcmVhdGVDdXN0b21UYXNrKGNvbnRyaWJ1dGVkVGFzaywgY29uZmlndXJlZFByb3BzKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUVyQixZQUFZLGFBQWE7QUFHekIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksVUFBVTtBQUd0QjtBQUFBLEVBQ3VCO0FBQUEsRUFDdEI7QUFBQSxFQUF1QjtBQUFBLE9BQ2pCO0FBR1AsWUFBWSxXQUFXO0FBQ3ZCLFNBQWtDLDhCQUE4QjtBQUdoRSxTQUFTLGdDQUFnQyx3Q0FBd0M7QUFHMUUsSUFBVyxlQUFYLGtCQUFXQSxrQkFBWDtBQUlOLEVBQUFBLDRCQUFBLFlBQVMsS0FBVDtBQUtBLEVBQUFBLDRCQUFBLFlBQVMsS0FBVDtBQUtBLEVBQUFBLDRCQUFBLFVBQU8sS0FBUDtBQWRpQixTQUFBQTtBQUFBLEdBQUE7QUFpSVgsSUFBVTtBQUFBLENBQVYsQ0FBVUMscUJBQVY7QUFDQyxXQUFTLEdBQUcsT0FBMEM7QUFDNUQsVUFBTSxZQUE2QjtBQUNuQyxXQUFPLGNBQWMsVUFBYSxNQUFNLFNBQVUsTUFBMEIsSUFBSTtBQUFBLEVBQ2pGO0FBSE8sRUFBQUEsaUJBQVM7QUFBQSxHQURBO0FBNkVWLElBQVU7QUFBQSxDQUFWLENBQVVDLG1CQUFWO0FBQ0MsV0FBUyxNQUFNQyxRQUE4QjtBQUNuRCxRQUFJLE1BQU0sU0FBU0EsTUFBSyxHQUFHO0FBQzFCLGFBQU9BO0FBQUEsSUFDUixXQUFXLE1BQU0sY0FBY0EsTUFBSyxHQUFHO0FBQ3RDLGFB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LE9BQXFCO0FBQ3JTLFFBQU0sb0JBQW9CLFlBQVksaUJBQWlCO0FBQ3ZELE1BQUksbUJBQW1CLGtCQUFrQixJQUFJLE1BQU07QUFDbkQsTUFBSSxDQUFDLGtCQUFrQjtBQUN0QixzQkFBa0IsSUFBSSxRQUFRLG9CQUFJLElBQUksQ0FBQztBQUN2Qyx1QkFBbUIsa0JBQWtCLElBQUksTUFBTTtBQUFBLEVBQ2hEO0FBQ0EsTUFBSSxVQUFVLGlCQUFpQixJQUFJLGdCQUFnQixJQUFJLFNBQVMsQ0FBQztBQUNqRSxNQUFJLENBQUMsU0FBUztBQUNiLGNBQVUsSUFBSSxRQUFRO0FBQ3RCLHFCQUFpQixJQUFJLGdCQUFnQixJQUFJLFNBQVMsR0FBRyxPQUFPO0FBQUEsRUFDN0Q7QUFDQSxNQUFJO0FBQ0gsWUFBUSxNQUFNO0FBQ2QsV0FBUSxJQUFJLG9CQUFvQixpQkFBaUIsV0FBVyxVQUFVLFFBQVEsT0FBTyxFQUFHLElBQUksZUFBZSxRQUFRLGlCQUFpQjtBQUFBLEVBQ3JJLFVBQUU7QUFDRCxZQUFRLE9BQU87QUFBQSxFQUNoQjtBQUNEO0FBSU8sU0FBUyxpQkFBaUIsaUJBQXdDLGlCQUE2RTtBQUNySixTQUFPLFdBQVcsaUJBQWlCLGlCQUFpQixlQUFlO0FBQ3BFOyIsCiAgIm5hbWVzIjogWyJTaGVsbFF1b3RpbmciLCAiSVRhc2tJZGVudGlmaWVyIiwgIkNvbW1hbmRTdHJpbmciLCAidmFsdWUiLCAiUHJvYmxlbU1hdGNoZXJLaW5kIiwgIlJ1bk9uT3B0aW9ucyIsICJSdW5PcHRpb25zIiwgIkluc3RhbmNlUG9saWN5IiwgIlNoZWxsQ29uZmlndXJhdGlvbiIsICJDb21tYW5kT3B0aW9ucyIsICJDb21tYW5kQ29uZmlndXJhdGlvbiIsICJQcmVzZW50YXRpb25PcHRpb25zIiwgInByb3BlcnRpZXMiLCAiZnJvbSIsICJhc3NpZ25Qcm9wZXJ0aWVzIiwgImZpbGxQcm9wZXJ0aWVzIiwgImZpbGxEZWZhdWx0cyIsICJmcmVlemUiLCAiaXNFbXB0eSIsICJTaGVsbFN0cmluZyIsICJQcm9ibGVtTWF0Y2hlckNvbnZlcnRlciIsICJHcm91cEtpbmQiLCAiVGFza0RlcGVuZGVuY3kiLCAiRGVwZW5kc09yZGVyIiwgIkNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIiwgIkNvbmZpZ3VyaW5nVGFzayIsICJsYWJlbCIsICJDdXN0b21UYXNrIiwgImNyZWF0ZUN1c3RvbVRhc2siLCAiVGFza1BhcnNlciIsICJHbG9iYWxzIiwgIkV4ZWN1dGlvbkVuZ2luZSIsICJKc29uU2NoZW1hVmVyc2lvbiIsICJUYXNrQ29uZmlnU291cmNlIl0KfQo=
