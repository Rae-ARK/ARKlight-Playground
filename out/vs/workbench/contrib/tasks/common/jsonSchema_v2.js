import * as nls from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import commonSchema from "./jsonSchemaCommon.js";
import { ProblemMatcherRegistry } from "./problemMatcher.js";
import { TaskDefinitionRegistry } from "./taskDefinitionRegistry.js";
import * as ConfigurationResolverUtils from "../../../services/configurationResolver/common/configurationResolverUtils.js";
import { inputsSchema } from "../../../services/configurationResolver/common/configurationResolverSchema.js";
import { getAllCodicons } from "../../../../base/common/codicons.js";
function fixReferences(literal) {
  if (Array.isArray(literal)) {
    literal.forEach((element) => {
      if (typeof element === "object" && element !== null) {
        fixReferences(element);
      }
    });
  } else if (typeof literal === "object") {
    if (literal["$ref"]) {
      literal["$ref"] = literal["$ref"] + "2";
    }
    Object.getOwnPropertyNames(literal).forEach((property) => {
      const value = literal[property];
      if (Array.isArray(value) || typeof value === "object" && value !== null) {
        fixReferences(value);
      }
    });
  }
}
const shellCommand = {
  anyOf: [
    {
      type: "boolean",
      default: true,
      description: nls.localize("JsonSchema.shell", "Specifies whether the command is a shell command or an external program. Defaults to false if omitted.")
    },
    {
      $ref: "#/definitions/shellConfiguration"
    }
  ],
  deprecationMessage: nls.localize("JsonSchema.tasks.isShellCommand.deprecated", "The property isShellCommand is deprecated. Use the type property of the task and the shell property in the options instead. See also the 1.14 release notes.")
};
const hide = {
  type: "boolean",
  description: nls.localize("JsonSchema.hide", "Hide this task from the run task quick pick"),
  default: true
};
const inAgents = {
  type: "boolean",
  description: nls.localize("JsonSchema.inAgents", "Show this task in the Agents run action dropdown"),
  default: false
};
const taskIdentifier = {
  type: "object",
  additionalProperties: true,
  properties: {
    type: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.dependsOn.identifier", "The task identifier.")
    }
  }
};
const dependsOn = {
  anyOf: [
    {
      type: "string",
      description: nls.localize("JsonSchema.tasks.dependsOn.string", "Another task this task depends on.")
    },
    taskIdentifier,
    {
      type: "array",
      description: nls.localize("JsonSchema.tasks.dependsOn.array", "The other tasks this task depends on."),
      items: {
        anyOf: [
          {
            type: "string"
          },
          taskIdentifier
        ]
      }
    }
  ],
  description: nls.localize("JsonSchema.tasks.dependsOn", "Either a string representing another task or an array of other tasks that this task depends on.")
};
const dependsOrder = {
  type: "string",
  enum: ["parallel", "sequence"],
  enumDescriptions: [
    nls.localize("JsonSchema.tasks.dependsOrder.parallel", "Run all dependsOn tasks in parallel."),
    nls.localize("JsonSchema.tasks.dependsOrder.sequence", "Run all dependsOn tasks in sequence.")
  ],
  default: "parallel",
  description: nls.localize("JsonSchema.tasks.dependsOrder", "Determines the order of the dependsOn tasks for this task. Note that this property is not recursive.")
};
const detail = {
  type: "string",
  description: nls.localize("JsonSchema.tasks.detail", "An optional description of a task that shows in the Run Task quick pick as a detail.")
};
const icon = {
  type: "object",
  description: nls.localize("JsonSchema.tasks.icon", "An optional icon for the task"),
  properties: {
    id: {
      description: nls.localize("JsonSchema.tasks.icon.id", "An optional codicon ID to use"),
      type: ["string", "null"],
      enum: Array.from(getAllCodicons(), (icon2) => icon2.id),
      markdownEnumDescriptions: Array.from(getAllCodicons(), (icon2) => `$(${icon2.id})`)
    },
    color: {
      description: nls.localize("JsonSchema.tasks.icon.color", "An optional color of the icon"),
      type: ["string", "null"],
      enum: [
        "terminal.ansiBlack",
        "terminal.ansiRed",
        "terminal.ansiGreen",
        "terminal.ansiYellow",
        "terminal.ansiBlue",
        "terminal.ansiMagenta",
        "terminal.ansiCyan",
        "terminal.ansiWhite"
      ]
    }
  }
};
const presentation = {
  type: "object",
  default: {
    echo: true,
    reveal: "always",
    focus: false,
    panel: "shared",
    showReuseMessage: true,
    clear: false
  },
  description: nls.localize("JsonSchema.tasks.presentation", "Configures the panel that is used to present the task's output and reads its input."),
  additionalProperties: false,
  properties: {
    echo: {
      type: "boolean",
      default: true,
      description: nls.localize("JsonSchema.tasks.presentation.echo", "Controls whether the executed command is echoed to the panel. Default is true.")
    },
    focus: {
      type: "boolean",
      default: false,
      description: nls.localize("JsonSchema.tasks.presentation.focus", "Controls whether the panel takes focus. Default is false. If set to true the panel is revealed as well.")
    },
    revealProblems: {
      type: "string",
      enum: ["always", "onProblem", "never"],
      enumDescriptions: [
        nls.localize("JsonSchema.tasks.presentation.revealProblems.always", "Always reveals the problems panel when this task is executed."),
        nls.localize("JsonSchema.tasks.presentation.revealProblems.onProblem", "Only reveals the problems panel if a problem is found."),
        nls.localize("JsonSchema.tasks.presentation.revealProblems.never", "Never reveals the problems panel when this task is executed.")
      ],
      default: "never",
      description: nls.localize("JsonSchema.tasks.presentation.revealProblems", 'Controls whether the problems panel is revealed when running this task or not. Takes precedence over option "reveal". Default is "never".')
    },
    reveal: {
      type: "string",
      enum: ["always", "silent", "never"],
      enumDescriptions: [
        nls.localize("JsonSchema.tasks.presentation.reveal.always", "Always reveals the terminal when this task is executed."),
        nls.localize("JsonSchema.tasks.presentation.reveal.silent", "Only reveals the terminal if the task exits with an error or the problem matcher finds an error."),
        nls.localize("JsonSchema.tasks.presentation.reveal.never", "Never reveals the terminal when this task is executed.")
      ],
      default: "always",
      description: nls.localize("JsonSchema.tasks.presentation.reveal", 'Controls whether the terminal running the task is revealed or not. May be overridden by option "revealProblems". Default is "always".')
    },
    panel: {
      type: "string",
      enum: ["shared", "dedicated", "new"],
      default: "shared",
      description: nls.localize("JsonSchema.tasks.presentation.instance", "Controls if the panel is shared between tasks, dedicated to this task or a new one is created on every run.")
    },
    showReuseMessage: {
      type: "boolean",
      default: true,
      description: nls.localize("JsonSchema.tasks.presentation.showReuseMessage", "Controls whether to show the `Terminal will be reused by tasks, press any key to close it` message.")
    },
    clear: {
      type: "boolean",
      default: false,
      description: nls.localize("JsonSchema.tasks.presentation.clear", "Controls whether the terminal is cleared before executing the task.")
    },
    group: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.presentation.group", "Controls whether the task is executed in a specific terminal group using split panes.")
    },
    close: {
      type: "boolean",
      description: nls.localize("JsonSchema.tasks.presentation.close", "Controls whether the terminal the task runs in is closed when the task exits.")
    },
    preserveTerminalName: {
      type: "boolean",
      default: false,
      description: nls.localize("JsonSchema.tasks.presentation.preserveTerminalName", "Controls whether to preserve the task name in the terminal after task completion.")
    }
  }
};
const terminal = Objects.deepClone(presentation);
terminal.deprecationMessage = nls.localize("JsonSchema.tasks.terminal", "The terminal property is deprecated. Use presentation instead");
const groupStrings = {
  type: "string",
  enum: [
    "build",
    "test",
    "none"
  ],
  enumDescriptions: [
    nls.localize("JsonSchema.tasks.group.build", "Marks the task as a build task accessible through the 'Run Build Task' command."),
    nls.localize("JsonSchema.tasks.group.test", "Marks the task as a test task accessible through the 'Run Test Task' command."),
    nls.localize("JsonSchema.tasks.group.none", "Assigns the task to no group")
  ],
  description: nls.localize("JsonSchema.tasks.group.kind", "The task's execution group.")
};
const group = {
  oneOf: [
    groupStrings,
    {
      type: "object",
      properties: {
        kind: groupStrings,
        isDefault: {
          type: ["boolean", "string"],
          default: false,
          description: nls.localize("JsonSchema.tasks.group.isDefault", "Defines if this task is the default task in the group, or a glob to match the file which should trigger this task.")
        }
      }
    }
  ],
  defaultSnippets: [
    {
      body: { kind: "build", isDefault: true },
      description: nls.localize("JsonSchema.tasks.group.defaultBuild", "Marks the task as the default build task.")
    },
    {
      body: { kind: "test", isDefault: true },
      description: nls.localize("JsonSchema.tasks.group.defaultTest", "Marks the task as the default test task.")
    }
  ],
  description: nls.localize("JsonSchema.tasks.group", 'Defines to which execution group this task belongs to. It supports "build" to add it to the build group and "test" to add it to the test group.')
};
const taskType = {
  type: "string",
  enum: ["shell"],
  default: "process",
  description: nls.localize("JsonSchema.tasks.type", "Defines whether the task is run as a process or as a command inside a shell.")
};
const command = {
  oneOf: [
    {
      oneOf: [
        {
          type: "string"
        },
        {
          type: "array",
          items: {
            type: "string"
          },
          description: nls.localize("JsonSchema.commandArray", "The shell command to be executed. Array items will be joined using a space character")
        }
      ]
    },
    {
      type: "object",
      required: ["value", "quoting"],
      properties: {
        value: {
          oneOf: [
            {
              type: "string"
            },
            {
              type: "array",
              items: {
                type: "string"
              },
              description: nls.localize("JsonSchema.commandArray", "The shell command to be executed. Array items will be joined using a space character")
            }
          ],
          description: nls.localize("JsonSchema.command.quotedString.value", "The actual command value")
        },
        quoting: {
          type: "string",
          enum: ["escape", "strong", "weak"],
          enumDescriptions: [
            nls.localize("JsonSchema.tasks.quoting.escape", "Escapes characters using the shell's escape character (e.g. ` under PowerShell and \\ under bash)."),
            nls.localize("JsonSchema.tasks.quoting.strong", "Quotes the argument using the shell's strong quote character (e.g. ' under PowerShell and bash)."),
            nls.localize("JsonSchema.tasks.quoting.weak", `Quotes the argument using the shell's weak quote character (e.g. " under PowerShell and bash).`)
          ],
          default: "strong",
          description: nls.localize("JsonSchema.command.quotesString.quote", "How the command value should be quoted.")
        }
      }
    }
  ],
  description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
};
const args = {
  type: "array",
  items: {
    oneOf: [
      {
        type: "string"
      },
      {
        type: "object",
        required: ["value", "quoting"],
        properties: {
          value: {
            type: "string",
            description: nls.localize("JsonSchema.args.quotedString.value", "The actual argument value")
          },
          quoting: {
            type: "string",
            enum: ["escape", "strong", "weak"],
            enumDescriptions: [
              nls.localize("JsonSchema.tasks.quoting.escape", "Escapes characters using the shell's escape character (e.g. ` under PowerShell and \\ under bash)."),
              nls.localize("JsonSchema.tasks.quoting.strong", "Quotes the argument using the shell's strong quote character (e.g. ' under PowerShell and bash)."),
              nls.localize("JsonSchema.tasks.quoting.weak", `Quotes the argument using the shell's weak quote character (e.g. " under PowerShell and bash).`)
            ],
            default: "strong",
            description: nls.localize("JsonSchema.args.quotesString.quote", "How the argument value should be quoted.")
          }
        }
      }
    ]
  },
  description: nls.localize("JsonSchema.tasks.args", "Arguments passed to the command when this task is invoked.")
};
const label = {
  type: "string",
  description: nls.localize("JsonSchema.tasks.label", "The task's user interface label")
};
const version = {
  type: "string",
  enum: ["2.0.0"],
  description: nls.localize("JsonSchema.version", "The config's version number.")
};
const identifier = {
  type: "string",
  description: nls.localize("JsonSchema.tasks.identifier", "A user defined identifier to reference the task in launch.json or a dependsOn clause."),
  deprecationMessage: nls.localize("JsonSchema.tasks.identifier.deprecated", "User defined identifiers are deprecated. For custom task use the name as a reference and for tasks provided by extensions use their defined task identifier.")
};
const runOptions = {
  type: "object",
  additionalProperties: false,
  properties: {
    reevaluateOnRerun: {
      type: "boolean",
      description: nls.localize("JsonSchema.tasks.reevaluateOnRerun", "Whether to reevaluate task variables on rerun."),
      default: true
    },
    runOn: {
      type: "string",
      enum: ["default", "folderOpen", "worktreeCreated"],
      description: nls.localize("JsonSchema.tasks.runOn", "Configures when the task should be run. If set to folderOpen, then the task will be run automatically when the folder is opened. If set to worktreeCreated, then the task will be run automatically when an Agent Session worktree is created."),
      default: "default"
    },
    instanceLimit: {
      type: "number",
      description: nls.localize("JsonSchema.tasks.instanceLimit", "The number of instances of the task that are allowed to run simultaneously."),
      default: 1
    },
    instancePolicy: {
      type: "string",
      enum: ["terminateNewest", "terminateOldest", "prompt", "warn", "silent"],
      enumDescriptions: [
        nls.localize("JsonSchema.tasks.instancePolicy.terminateNewest", "Terminates the newest instance."),
        nls.localize("JsonSchema.tasks.instancePolicy.terminateOldest", "Terminates the oldest instance."),
        nls.localize("JsonSchema.tasks.instancePolicy.prompt", "Asks which instance to terminate."),
        nls.localize("JsonSchema.tasks.instancePolicy.warn", "Does nothing but warns that the instance limit has been reached."),
        nls.localize("JsonSchema.tasks.instancePolicy.silent", "Does nothing.")
      ],
      description: nls.localize("JsonSchema.tasks.instancePolicy", "Policy to apply when instance limit is reached."),
      default: "prompt"
    }
  },
  description: nls.localize("JsonSchema.tasks.runOptions", "The task's run related options")
};
const commonSchemaDefinitions = commonSchema.definitions;
const options = Objects.deepClone(commonSchemaDefinitions.options);
const optionsProperties = options.properties;
optionsProperties.shell = Objects.deepClone(commonSchemaDefinitions.shellConfiguration);
const taskConfiguration = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.taskLabel", "The task's label")
    },
    taskName: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.taskName", "The task's name"),
      deprecationMessage: nls.localize("JsonSchema.tasks.taskName.deprecated", "The task's name property is deprecated. Use the label property instead.")
    },
    identifier: Objects.deepClone(identifier),
    group: Objects.deepClone(group),
    isBackground: {
      type: "boolean",
      description: nls.localize("JsonSchema.tasks.background", "Whether the executed task is kept alive and is running in the background."),
      default: true
    },
    promptOnClose: {
      type: "boolean",
      description: nls.localize("JsonSchema.tasks.promptOnClose", "Whether the user is prompted when VS Code closes with a running task."),
      default: false
    },
    presentation: Objects.deepClone(presentation),
    icon: Objects.deepClone(icon),
    hide: Objects.deepClone(hide),
    inAgents: Objects.deepClone(inAgents),
    options,
    problemMatcher: {
      $ref: "#/definitions/problemMatcherType",
      description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
    },
    runOptions: Objects.deepClone(runOptions),
    dependsOn: Objects.deepClone(dependsOn),
    dependsOrder: Objects.deepClone(dependsOrder),
    detail: Objects.deepClone(detail)
  }
};
const taskDefinitions = [];
TaskDefinitionRegistry.onReady().then(() => {
  updateTaskDefinitions();
});
function updateTaskDefinitions() {
  for (const taskType2 of TaskDefinitionRegistry.all()) {
    if (taskDefinitions.find((schema3) => {
      return schema3.properties?.type?.enum?.find ? schema3.properties?.type.enum.find((element) => element === taskType2.taskType) : void 0;
    })) {
      continue;
    }
    const schema2 = Objects.deepClone(taskConfiguration);
    const schemaProperties = schema2.properties;
    schemaProperties.type = {
      type: "string",
      description: nls.localize("JsonSchema.customizations.customizes.type", "The task type to customize"),
      enum: [taskType2.taskType]
    };
    if (taskType2.required) {
      schema2.required = taskType2.required.slice();
    } else {
      schema2.required = [];
    }
    schema2.required.push("type");
    if (taskType2.properties) {
      for (const key of Object.keys(taskType2.properties)) {
        const property = taskType2.properties[key];
        schemaProperties[key] = Objects.deepClone(property);
      }
    }
    fixReferences(schema2);
    taskDefinitions.push(schema2);
  }
}
const customize = Objects.deepClone(taskConfiguration);
customize.properties.customize = {
  type: "string",
  deprecationMessage: nls.localize("JsonSchema.tasks.customize.deprecated", "The customize property is deprecated. See the 1.14 release notes on how to migrate to the new task customization approach")
};
if (!customize.required) {
  customize.required = [];
}
customize.required.push("customize");
taskDefinitions.push(customize);
const definitions = Objects.deepClone(commonSchemaDefinitions);
const taskDescription = definitions.taskDescription;
taskDescription.required = ["label"];
const taskDescriptionProperties = taskDescription.properties;
taskDescriptionProperties.label = Objects.deepClone(label);
taskDescriptionProperties.command = Objects.deepClone(command);
taskDescriptionProperties.args = Objects.deepClone(args);
taskDescriptionProperties.isShellCommand = Objects.deepClone(shellCommand);
taskDescriptionProperties.dependsOn = dependsOn;
taskDescriptionProperties.hide = Objects.deepClone(hide);
taskDescriptionProperties.inAgents = Objects.deepClone(inAgents);
taskDescriptionProperties.dependsOrder = dependsOrder;
taskDescriptionProperties.identifier = Objects.deepClone(identifier);
taskDescriptionProperties.type = Objects.deepClone(taskType);
taskDescriptionProperties.presentation = Objects.deepClone(presentation);
taskDescriptionProperties.terminal = terminal;
taskDescriptionProperties.icon = Objects.deepClone(icon);
taskDescriptionProperties.group = Objects.deepClone(group);
taskDescriptionProperties.runOptions = Objects.deepClone(runOptions);
taskDescriptionProperties.detail = detail;
taskDescriptionProperties.taskName.deprecationMessage = nls.localize(
  "JsonSchema.tasks.taskName.deprecated",
  "The task's name property is deprecated. Use the label property instead."
);
const processTask = Objects.deepClone(taskDescription);
taskDescription.default = {
  label: "My Task",
  type: "shell",
  command: "echo Hello",
  problemMatcher: []
};
definitions.showOutputType.deprecationMessage = nls.localize(
  "JsonSchema.tasks.showOutput.deprecated",
  "The property showOutput is deprecated. Use the reveal property inside the presentation property instead. See also the 1.14 release notes."
);
taskDescriptionProperties.echoCommand.deprecationMessage = nls.localize(
  "JsonSchema.tasks.echoCommand.deprecated",
  "The property echoCommand is deprecated. Use the echo property inside the presentation property instead. See also the 1.14 release notes."
);
taskDescriptionProperties.suppressTaskName.deprecationMessage = nls.localize(
  "JsonSchema.tasks.suppressTaskName.deprecated",
  "The property suppressTaskName is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes."
);
taskDescriptionProperties.isBuildCommand.deprecationMessage = nls.localize(
  "JsonSchema.tasks.isBuildCommand.deprecated",
  "The property isBuildCommand is deprecated. Use the group property instead. See also the 1.14 release notes."
);
taskDescriptionProperties.isTestCommand.deprecationMessage = nls.localize(
  "JsonSchema.tasks.isTestCommand.deprecated",
  "The property isTestCommand is deprecated. Use the group property instead. See also the 1.14 release notes."
);
processTask.properties.type = {
  type: "string",
  enum: ["process"],
  default: "process",
  description: nls.localize("JsonSchema.tasks.type", "Defines whether the task is run as a process or as a command inside a shell.")
};
processTask.required.push("command");
processTask.required.push("type");
taskDefinitions.push(processTask);
taskDefinitions.push({
  $ref: "#/definitions/taskDescription"
});
const definitionsTaskRunnerConfigurationProperties = definitions.taskRunnerConfiguration.properties;
const tasks = definitionsTaskRunnerConfigurationProperties.tasks;
tasks.items = {
  oneOf: taskDefinitions
};
definitionsTaskRunnerConfigurationProperties.inputs = inputsSchema.definitions.inputs;
definitions.commandConfiguration.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.commandConfiguration.properties.args = Objects.deepClone(args);
definitions.options.properties.shell = {
  $ref: "#/definitions/shellConfiguration"
};
definitionsTaskRunnerConfigurationProperties.isShellCommand = Objects.deepClone(shellCommand);
definitionsTaskRunnerConfigurationProperties.type = Objects.deepClone(taskType);
definitionsTaskRunnerConfigurationProperties.group = Objects.deepClone(group);
definitionsTaskRunnerConfigurationProperties.presentation = Objects.deepClone(presentation);
definitionsTaskRunnerConfigurationProperties.suppressTaskName.deprecationMessage = nls.localize(
  "JsonSchema.tasks.suppressTaskName.deprecated",
  "The property suppressTaskName is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes."
);
definitionsTaskRunnerConfigurationProperties.taskSelector.deprecationMessage = nls.localize(
  "JsonSchema.tasks.taskSelector.deprecated",
  "The property taskSelector is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes."
);
const osSpecificTaskRunnerConfiguration = Objects.deepClone(definitions.taskRunnerConfiguration);
delete osSpecificTaskRunnerConfiguration.properties.tasks;
osSpecificTaskRunnerConfiguration.additionalProperties = false;
definitions.osSpecificTaskRunnerConfiguration = osSpecificTaskRunnerConfiguration;
definitionsTaskRunnerConfigurationProperties.version = Objects.deepClone(version);
const schema = {
  oneOf: [
    {
      "allOf": [
        {
          type: "object",
          required: ["version"],
          properties: {
            version: Objects.deepClone(version),
            windows: {
              "$ref": "#/definitions/osSpecificTaskRunnerConfiguration",
              "description": nls.localize("JsonSchema.windows", "Windows specific command configuration")
            },
            osx: {
              "$ref": "#/definitions/osSpecificTaskRunnerConfiguration",
              "description": nls.localize("JsonSchema.mac", "Mac specific command configuration")
            },
            linux: {
              "$ref": "#/definitions/osSpecificTaskRunnerConfiguration",
              "description": nls.localize("JsonSchema.linux", "Linux specific command configuration")
            }
          }
        },
        {
          $ref: "#/definitions/taskRunnerConfiguration"
        }
      ]
    }
  ]
};
schema.definitions = definitions;
function deprecatedVariableMessage(schemaMap, property) {
  const mapAtProperty = schemaMap[property].properties;
  if (mapAtProperty) {
    Object.keys(mapAtProperty).forEach((name) => {
      deprecatedVariableMessage(mapAtProperty, name);
    });
  } else {
    ConfigurationResolverUtils.applyDeprecatedVariableMessage(schemaMap[property]);
  }
}
Object.getOwnPropertyNames(definitions).forEach((key) => {
  const newKey = key + "2";
  definitions[newKey] = definitions[key];
  delete definitions[key];
  deprecatedVariableMessage(definitions, newKey);
});
fixReferences(schema);
function updateProblemMatchers() {
  try {
    const matcherIds = ProblemMatcherRegistry.keys().map((key) => "$" + key);
    definitions.problemMatcherType2.oneOf[0].enum = matcherIds;
    definitions.problemMatcherType2.oneOf[2].items.anyOf[0].enum = matcherIds;
  } catch (err) {
    console.log("Installing problem matcher ids failed");
  }
}
ProblemMatcherRegistry.onReady().then(() => {
  updateProblemMatchers();
});
var jsonSchema_v2_default = schema;
export {
  jsonSchema_v2_default as default,
  updateProblemMatchers,
  updateTaskDefinitions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9qc29uU2NoZW1hX3YyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5cbmltcG9ydCBjb21tb25TY2hlbWEgZnJvbSAnLi9qc29uU2NoZW1hQ29tbW9uLmpzJztcblxuaW1wb3J0IHsgUHJvYmxlbU1hdGNoZXJSZWdpc3RyeSB9IGZyb20gJy4vcHJvYmxlbU1hdGNoZXIuanMnO1xuaW1wb3J0IHsgVGFza0RlZmluaXRpb25SZWdpc3RyeSB9IGZyb20gJy4vdGFza0RlZmluaXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgKiBhcyBDb25maWd1cmF0aW9uUmVzb2x2ZXJVdGlscyBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlclV0aWxzLmpzJztcbmltcG9ydCB7IGlucHV0c1NjaGVtYSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyU2NoZW1hLmpzJztcbmltcG9ydCB7IGdldEFsbENvZGljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuXG5mdW5jdGlvbiBmaXhSZWZlcmVuY2VzKGxpdGVyYWw6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5rbm93bltdKSB7XG5cdGlmIChBcnJheS5pc0FycmF5KGxpdGVyYWwpKSB7XG5cdFx0bGl0ZXJhbC5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBlbGVtZW50ID09PSAnb2JqZWN0JyAmJiBlbGVtZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdGZpeFJlZmVyZW5jZXMoZWxlbWVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAodHlwZW9mIGxpdGVyYWwgPT09ICdvYmplY3QnKSB7XG5cdFx0aWYgKGxpdGVyYWxbJyRyZWYnXSkge1xuXHRcdFx0bGl0ZXJhbFsnJHJlZiddID0gbGl0ZXJhbFsnJHJlZiddICsgJzInO1xuXHRcdH1cblx0XHRPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhsaXRlcmFsKS5mb3JFYWNoKHByb3BlcnR5ID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gbGl0ZXJhbFtwcm9wZXJ0eV07XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwpKSB7XG5cdFx0XHRcdGZpeFJlZmVyZW5jZXModmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNvbnN0IHNoZWxsQ29tbWFuZDogSUpTT05TY2hlbWEgPSB7XG5cdGFueU9mOiBbXG5cdFx0e1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuc2hlbGwnLCAnU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGNvbW1hbmQgaXMgYSBzaGVsbCBjb21tYW5kIG9yIGFuIGV4dGVybmFsIHByb2dyYW0uIERlZmF1bHRzIHRvIGZhbHNlIGlmIG9taXR0ZWQuJylcblx0XHR9LFxuXHRcdHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3NoZWxsQ29uZmlndXJhdGlvbidcblx0XHR9XG5cdF0sXG5cdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmlzU2hlbGxDb21tYW5kLmRlcHJlY2F0ZWQnLCAnVGhlIHByb3BlcnR5IGlzU2hlbGxDb21tYW5kIGlzIGRlcHJlY2F0ZWQuIFVzZSB0aGUgdHlwZSBwcm9wZXJ0eSBvZiB0aGUgdGFzayBhbmQgdGhlIHNoZWxsIHByb3BlcnR5IGluIHRoZSBvcHRpb25zIGluc3RlYWQuIFNlZSBhbHNvIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMuJylcbn07XG5cblxuY29uc3QgaGlkZTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdib29sZWFuJyxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5oaWRlJywgJ0hpZGUgdGhpcyB0YXNrIGZyb20gdGhlIHJ1biB0YXNrIHF1aWNrIHBpY2snKSxcblx0ZGVmYXVsdDogdHJ1ZVxufTtcblxuY29uc3QgaW5BZ2VudHM6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnYm9vbGVhbicsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuaW5BZ2VudHMnLCAnU2hvdyB0aGlzIHRhc2sgaW4gdGhlIEFnZW50cyBydW4gYWN0aW9uIGRyb3Bkb3duJyksXG5cdGRlZmF1bHQ6IGZhbHNlXG59O1xuXG5jb25zdCB0YXNrSWRlbnRpZmllcjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0cHJvcGVydGllczoge1xuXHRcdHR5cGU6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5kZXBlbmRzT24uaWRlbnRpZmllcicsICdUaGUgdGFzayBpZGVudGlmaWVyLicpXG5cdFx0fVxuXHR9XG59O1xuXG5jb25zdCBkZXBlbmRzT246IElKU09OU2NoZW1hID0ge1xuXHRhbnlPZjogW1xuXHRcdHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5kZXBlbmRzT24uc3RyaW5nJywgJ0Fub3RoZXIgdGFzayB0aGlzIHRhc2sgZGVwZW5kcyBvbi4nKVxuXHRcdH0sXG5cdFx0dGFza0lkZW50aWZpZXIsXG5cdFx0e1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZGVwZW5kc09uLmFycmF5JywgJ1RoZSBvdGhlciB0YXNrcyB0aGlzIHRhc2sgZGVwZW5kcyBvbi4nKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0YXNrSWRlbnRpZmllclxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fVxuXHRdLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmRlcGVuZHNPbicsICdFaXRoZXIgYSBzdHJpbmcgcmVwcmVzZW50aW5nIGFub3RoZXIgdGFzayBvciBhbiBhcnJheSBvZiBvdGhlciB0YXNrcyB0aGF0IHRoaXMgdGFzayBkZXBlbmRzIG9uLicpXG59O1xuXG5jb25zdCBkZXBlbmRzT3JkZXI6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0ZW51bTogWydwYXJhbGxlbCcsICdzZXF1ZW5jZSddLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmRlcGVuZHNPcmRlci5wYXJhbGxlbCcsICdSdW4gYWxsIGRlcGVuZHNPbiB0YXNrcyBpbiBwYXJhbGxlbC4nKSxcblx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZGVwZW5kc09yZGVyLnNlcXVlbmNlJywgJ1J1biBhbGwgZGVwZW5kc09uIHRhc2tzIGluIHNlcXVlbmNlLicpLFxuXHRdLFxuXHRkZWZhdWx0OiAncGFyYWxsZWwnLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmRlcGVuZHNPcmRlcicsICdEZXRlcm1pbmVzIHRoZSBvcmRlciBvZiB0aGUgZGVwZW5kc09uIHRhc2tzIGZvciB0aGlzIHRhc2suIE5vdGUgdGhhdCB0aGlzIHByb3BlcnR5IGlzIG5vdCByZWN1cnNpdmUuJylcbn07XG5cbmNvbnN0IGRldGFpbDogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmRldGFpbCcsICdBbiBvcHRpb25hbCBkZXNjcmlwdGlvbiBvZiBhIHRhc2sgdGhhdCBzaG93cyBpbiB0aGUgUnVuIFRhc2sgcXVpY2sgcGljayBhcyBhIGRldGFpbC4nKVxufTtcblxuY29uc3QgaWNvbjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmljb24nLCAnQW4gb3B0aW9uYWwgaWNvbiBmb3IgdGhlIHRhc2snKSxcblx0cHJvcGVydGllczoge1xuXHRcdGlkOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmljb24uaWQnLCAnQW4gb3B0aW9uYWwgY29kaWNvbiBJRCB0byB1c2UnKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0XHRcdGVudW06IEFycmF5LmZyb20oZ2V0QWxsQ29kaWNvbnMoKSwgaWNvbiA9PiBpY29uLmlkKSxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogQXJyYXkuZnJvbShnZXRBbGxDb2RpY29ucygpLCBpY29uID0+IGAkKCR7aWNvbi5pZH0pYCksXG5cdFx0fSxcblx0XHRjb2xvcjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5pY29uLmNvbG9yJywgJ0FuIG9wdGlvbmFsIGNvbG9yIG9mIHRoZSBpY29uJyksXG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ10sXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQmxhY2snLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaVJlZCcsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpR3JlZW4nLFxuXHRcdFx0XHQndGVybWluYWwuYW5zaVllbGxvdycsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQmx1ZScsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpTWFnZW50YScsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpQ3lhbicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpV2hpdGUnXG5cdFx0XHRdLFxuXHRcdH0sXG5cdH1cbn07XG5cbmNvbnN0IHByZXNlbnRhdGlvbjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRkZWZhdWx0OiB7XG5cdFx0ZWNobzogdHJ1ZSxcblx0XHRyZXZlYWw6ICdhbHdheXMnLFxuXHRcdGZvY3VzOiBmYWxzZSxcblx0XHRwYW5lbDogJ3NoYXJlZCcsXG5cdFx0c2hvd1JldXNlTWVzc2FnZTogdHJ1ZSxcblx0XHRjbGVhcjogZmFsc2UsXG5cdH0sXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uJywgJ0NvbmZpZ3VyZXMgdGhlIHBhbmVsIHRoYXQgaXMgdXNlZCB0byBwcmVzZW50IHRoZSB0YXNrXFwncyBvdXRwdXQgYW5kIHJlYWRzIGl0cyBpbnB1dC4nKSxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0ZWNobzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLmVjaG8nLCAnQ29udHJvbHMgd2hldGhlciB0aGUgZXhlY3V0ZWQgY29tbWFuZCBpcyBlY2hvZWQgdG8gdGhlIHBhbmVsLiBEZWZhdWx0IGlzIHRydWUuJylcblx0XHR9LFxuXHRcdGZvY3VzOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLmZvY3VzJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHBhbmVsIHRha2VzIGZvY3VzLiBEZWZhdWx0IGlzIGZhbHNlLiBJZiBzZXQgdG8gdHJ1ZSB0aGUgcGFuZWwgaXMgcmV2ZWFsZWQgYXMgd2VsbC4nKVxuXHRcdH0sXG5cdFx0cmV2ZWFsUHJvYmxlbXM6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhbHdheXMnLCAnb25Qcm9ibGVtJywgJ25ldmVyJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24ucmV2ZWFsUHJvYmxlbXMuYWx3YXlzJywgJ0Fsd2F5cyByZXZlYWxzIHRoZSBwcm9ibGVtcyBwYW5lbCB3aGVuIHRoaXMgdGFzayBpcyBleGVjdXRlZC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5yZXZlYWxQcm9ibGVtcy5vblByb2JsZW0nLCAnT25seSByZXZlYWxzIHRoZSBwcm9ibGVtcyBwYW5lbCBpZiBhIHByb2JsZW0gaXMgZm91bmQuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24ucmV2ZWFsUHJvYmxlbXMubmV2ZXInLCAnTmV2ZXIgcmV2ZWFscyB0aGUgcHJvYmxlbXMgcGFuZWwgd2hlbiB0aGlzIHRhc2sgaXMgZXhlY3V0ZWQuJyksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ25ldmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLnJldmVhbFByb2JsZW1zJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHByb2JsZW1zIHBhbmVsIGlzIHJldmVhbGVkIHdoZW4gcnVubmluZyB0aGlzIHRhc2sgb3Igbm90LiBUYWtlcyBwcmVjZWRlbmNlIG92ZXIgb3B0aW9uIFxcXCJyZXZlYWxcXFwiLiBEZWZhdWx0IGlzIFxcXCJuZXZlclxcXCIuJylcblx0XHR9LFxuXHRcdHJldmVhbDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdzaWxlbnQnLCAnbmV2ZXInXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5yZXZlYWwuYWx3YXlzJywgJ0Fsd2F5cyByZXZlYWxzIHRoZSB0ZXJtaW5hbCB3aGVuIHRoaXMgdGFzayBpcyBleGVjdXRlZC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5yZXZlYWwuc2lsZW50JywgJ09ubHkgcmV2ZWFscyB0aGUgdGVybWluYWwgaWYgdGhlIHRhc2sgZXhpdHMgd2l0aCBhbiBlcnJvciBvciB0aGUgcHJvYmxlbSBtYXRjaGVyIGZpbmRzIGFuIGVycm9yLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLnJldmVhbC5uZXZlcicsICdOZXZlciByZXZlYWxzIHRoZSB0ZXJtaW5hbCB3aGVuIHRoaXMgdGFzayBpcyBleGVjdXRlZC4nKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnYWx3YXlzJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLnJldmVhbCcsICdDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCBydW5uaW5nIHRoZSB0YXNrIGlzIHJldmVhbGVkIG9yIG5vdC4gTWF5IGJlIG92ZXJyaWRkZW4gYnkgb3B0aW9uIFxcXCJyZXZlYWxQcm9ibGVtc1xcXCIuIERlZmF1bHQgaXMgXFxcImFsd2F5c1xcXCIuJylcblx0XHR9LFxuXHRcdHBhbmVsOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnc2hhcmVkJywgJ2RlZGljYXRlZCcsICduZXcnXSxcblx0XHRcdGRlZmF1bHQ6ICdzaGFyZWQnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24uaW5zdGFuY2UnLCAnQ29udHJvbHMgaWYgdGhlIHBhbmVsIGlzIHNoYXJlZCBiZXR3ZWVuIHRhc2tzLCBkZWRpY2F0ZWQgdG8gdGhpcyB0YXNrIG9yIGEgbmV3IG9uZSBpcyBjcmVhdGVkIG9uIGV2ZXJ5IHJ1bi4nKVxuXHRcdH0sXG5cdFx0c2hvd1JldXNlTWVzc2FnZToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLnNob3dSZXVzZU1lc3NhZ2UnLCAnQ29udHJvbHMgd2hldGhlciB0byBzaG93IHRoZSBgVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXRgIG1lc3NhZ2UuJylcblx0XHR9LFxuXHRcdGNsZWFyOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLmNsZWFyJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIGlzIGNsZWFyZWQgYmVmb3JlIGV4ZWN1dGluZyB0aGUgdGFzay4nKVxuXHRcdH0sXG5cdFx0Z3JvdXA6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24uZ3JvdXAnLCAnQ29udHJvbHMgd2hldGhlciB0aGUgdGFzayBpcyBleGVjdXRlZCBpbiBhIHNwZWNpZmljIHRlcm1pbmFsIGdyb3VwIHVzaW5nIHNwbGl0IHBhbmVzLicpXG5cdFx0fSxcblx0XHRjbG9zZToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24uY2xvc2UnLCAnQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgdGhlIHRhc2sgcnVucyBpbiBpcyBjbG9zZWQgd2hlbiB0aGUgdGFzayBleGl0cy4nKVxuXHRcdH0sXG5cdFx0cHJlc2VydmVUZXJtaW5hbE5hbWU6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24ucHJlc2VydmVUZXJtaW5hbE5hbWUnLCAnQ29udHJvbHMgd2hldGhlciB0byBwcmVzZXJ2ZSB0aGUgdGFzayBuYW1lIGluIHRoZSB0ZXJtaW5hbCBhZnRlciB0YXNrIGNvbXBsZXRpb24uJylcblx0XHR9XG5cdH1cbn07XG5cbmNvbnN0IHRlcm1pbmFsOiBJSlNPTlNjaGVtYSA9IE9iamVjdHMuZGVlcENsb25lKHByZXNlbnRhdGlvbik7XG50ZXJtaW5hbC5kZXByZWNhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MudGVybWluYWwnLCAnVGhlIHRlcm1pbmFsIHByb3BlcnR5IGlzIGRlcHJlY2F0ZWQuIFVzZSBwcmVzZW50YXRpb24gaW5zdGVhZCcpO1xuXG5jb25zdCBncm91cFN0cmluZ3M6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0ZW51bTogW1xuXHRcdCdidWlsZCcsXG5cdFx0J3Rlc3QnLFxuXHRcdCdub25lJ1xuXHRdLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmdyb3VwLmJ1aWxkJywgJ01hcmtzIHRoZSB0YXNrIGFzIGEgYnVpbGQgdGFzayBhY2Nlc3NpYmxlIHRocm91Z2ggdGhlIFxcJ1J1biBCdWlsZCBUYXNrXFwnIGNvbW1hbmQuJyksXG5cdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmdyb3VwLnRlc3QnLCAnTWFya3MgdGhlIHRhc2sgYXMgYSB0ZXN0IHRhc2sgYWNjZXNzaWJsZSB0aHJvdWdoIHRoZSBcXCdSdW4gVGVzdCBUYXNrXFwnIGNvbW1hbmQuJyksXG5cdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmdyb3VwLm5vbmUnLCAnQXNzaWducyB0aGUgdGFzayB0byBubyBncm91cCcpXG5cdF0sXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAua2luZCcsICdUaGUgdGFza1xcJ3MgZXhlY3V0aW9uIGdyb3VwLicpXG59O1xuXG5jb25zdCBncm91cDogSUpTT05TY2hlbWEgPSB7XG5cdG9uZU9mOiBbXG5cdFx0Z3JvdXBTdHJpbmdzLFxuXHRcdHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRraW5kOiBncm91cFN0cmluZ3MsXG5cdFx0XHRcdGlzRGVmYXVsdDoge1xuXHRcdFx0XHRcdHR5cGU6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmdyb3VwLmlzRGVmYXVsdCcsICdEZWZpbmVzIGlmIHRoaXMgdGFzayBpcyB0aGUgZGVmYXVsdCB0YXNrIGluIHRoZSBncm91cCwgb3IgYSBnbG9iIHRvIG1hdGNoIHRoZSBmaWxlIHdoaWNoIHNob3VsZCB0cmlnZ2VyIHRoaXMgdGFzay4nKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XSxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0e1xuXHRcdFx0Ym9keTogeyBraW5kOiAnYnVpbGQnLCBpc0RlZmF1bHQ6IHRydWUgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAuZGVmYXVsdEJ1aWxkJywgJ01hcmtzIHRoZSB0YXNrIGFzIHRoZSBkZWZhdWx0IGJ1aWxkIHRhc2suJylcblx0XHR9LFxuXHRcdHtcblx0XHRcdGJvZHk6IHsga2luZDogJ3Rlc3QnLCBpc0RlZmF1bHQ6IHRydWUgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAuZGVmYXVsdFRlc3QnLCAnTWFya3MgdGhlIHRhc2sgYXMgdGhlIGRlZmF1bHQgdGVzdCB0YXNrLicpXG5cdFx0fVxuXHRdLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmdyb3VwJywgJ0RlZmluZXMgdG8gd2hpY2ggZXhlY3V0aW9uIGdyb3VwIHRoaXMgdGFzayBiZWxvbmdzIHRvLiBJdCBzdXBwb3J0cyBcImJ1aWxkXCIgdG8gYWRkIGl0IHRvIHRoZSBidWlsZCBncm91cCBhbmQgXCJ0ZXN0XCIgdG8gYWRkIGl0IHRvIHRoZSB0ZXN0IGdyb3VwLicpXG59O1xuXG5jb25zdCB0YXNrVHlwZTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBbJ3NoZWxsJ10sXG5cdGRlZmF1bHQ6ICdwcm9jZXNzJyxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy50eXBlJywgJ0RlZmluZXMgd2hldGhlciB0aGUgdGFzayBpcyBydW4gYXMgYSBwcm9jZXNzIG9yIGFzIGEgY29tbWFuZCBpbnNpZGUgYSBzaGVsbC4nKVxufTtcblxuY29uc3QgY29tbWFuZDogSUpTT05TY2hlbWEgPSB7XG5cdG9uZU9mOiBbXG5cdFx0e1xuXHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jb21tYW5kQXJyYXknLCAnVGhlIHNoZWxsIGNvbW1hbmQgdG8gYmUgZXhlY3V0ZWQuIEFycmF5IGl0ZW1zIHdpbGwgYmUgam9pbmVkIHVzaW5nIGEgc3BhY2UgY2hhcmFjdGVyJylcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRyZXF1aXJlZDogWyd2YWx1ZScsICdxdW90aW5nJ10sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jb21tYW5kQXJyYXknLCAnVGhlIHNoZWxsIGNvbW1hbmQgdG8gYmUgZXhlY3V0ZWQuIEFycmF5IGl0ZW1zIHdpbGwgYmUgam9pbmVkIHVzaW5nIGEgc3BhY2UgY2hhcmFjdGVyJylcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuY29tbWFuZC5xdW90ZWRTdHJpbmcudmFsdWUnLCAnVGhlIGFjdHVhbCBjb21tYW5kIHZhbHVlJylcblx0XHRcdFx0fSxcblx0XHRcdFx0cXVvdGluZzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnZXNjYXBlJywgJ3N0cm9uZycsICd3ZWFrJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnF1b3RpbmcuZXNjYXBlJywgJ0VzY2FwZXMgY2hhcmFjdGVycyB1c2luZyB0aGUgc2hlbGxcXCdzIGVzY2FwZSBjaGFyYWN0ZXIgKGUuZy4gYCB1bmRlciBQb3dlclNoZWxsIGFuZCBcXFxcIHVuZGVyIGJhc2gpLicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnF1b3Rpbmcuc3Ryb25nJywgJ1F1b3RlcyB0aGUgYXJndW1lbnQgdXNpbmcgdGhlIHNoZWxsXFwncyBzdHJvbmcgcXVvdGUgY2hhcmFjdGVyIChlLmcuIFxcJyB1bmRlciBQb3dlclNoZWxsIGFuZCBiYXNoKS4nKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5xdW90aW5nLndlYWsnLCAnUXVvdGVzIHRoZSBhcmd1bWVudCB1c2luZyB0aGUgc2hlbGxcXCdzIHdlYWsgcXVvdGUgY2hhcmFjdGVyIChlLmcuIFwiIHVuZGVyIFBvd2VyU2hlbGwgYW5kIGJhc2gpLicpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3N0cm9uZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jb21tYW5kLnF1b3Rlc1N0cmluZy5xdW90ZScsICdIb3cgdGhlIGNvbW1hbmQgdmFsdWUgc2hvdWxkIGJlIHF1b3RlZC4nKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9XG5cdF0sXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuY29tbWFuZCcsICdUaGUgY29tbWFuZCB0byBiZSBleGVjdXRlZC4gQ2FuIGJlIGFuIGV4dGVybmFsIHByb2dyYW0gb3IgYSBzaGVsbCBjb21tYW5kLicpXG59O1xuXG5jb25zdCBhcmdzOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ2FycmF5Jyxcblx0aXRlbXM6IHtcblx0XHRvbmVPZjogW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRyZXF1aXJlZDogWyd2YWx1ZScsICdxdW90aW5nJ10sXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmFyZ3MucXVvdGVkU3RyaW5nLnZhbHVlJywgJ1RoZSBhY3R1YWwgYXJndW1lbnQgdmFsdWUnKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cXVvdGluZzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRlbnVtOiBbJ2VzY2FwZScsICdzdHJvbmcnLCAnd2VhayddLFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucXVvdGluZy5lc2NhcGUnLCAnRXNjYXBlcyBjaGFyYWN0ZXJzIHVzaW5nIHRoZSBzaGVsbFxcJ3MgZXNjYXBlIGNoYXJhY3RlciAoZS5nLiBgIHVuZGVyIFBvd2VyU2hlbGwgYW5kIFxcXFwgdW5kZXIgYmFzaCkuJyksXG5cdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5xdW90aW5nLnN0cm9uZycsICdRdW90ZXMgdGhlIGFyZ3VtZW50IHVzaW5nIHRoZSBzaGVsbFxcJ3Mgc3Ryb25nIHF1b3RlIGNoYXJhY3RlciAoZS5nLiBcXCcgdW5kZXIgUG93ZXJTaGVsbCBhbmQgYmFzaCkuJyksXG5cdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5xdW90aW5nLndlYWsnLCAnUXVvdGVzIHRoZSBhcmd1bWVudCB1c2luZyB0aGUgc2hlbGxcXCdzIHdlYWsgcXVvdGUgY2hhcmFjdGVyIChlLmcuIFwiIHVuZGVyIFBvd2VyU2hlbGwgYW5kIGJhc2gpLicpLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdzdHJvbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5hcmdzLnF1b3Rlc1N0cmluZy5xdW90ZScsICdIb3cgdGhlIGFyZ3VtZW50IHZhbHVlIHNob3VsZCBiZSBxdW90ZWQuJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdF1cblx0fSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5hcmdzJywgJ0FyZ3VtZW50cyBwYXNzZWQgdG8gdGhlIGNvbW1hbmQgd2hlbiB0aGlzIHRhc2sgaXMgaW52b2tlZC4nKVxufTtcblxuY29uc3QgbGFiZWw6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5sYWJlbCcsIFwiVGhlIHRhc2sncyB1c2VyIGludGVyZmFjZSBsYWJlbFwiKVxufTtcblxuY29uc3QgdmVyc2lvbjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBbJzIuMC4wJ10sXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudmVyc2lvbicsICdUaGUgY29uZmlnXFwncyB2ZXJzaW9uIG51bWJlci4nKVxufTtcblxuY29uc3QgaWRlbnRpZmllcjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmlkZW50aWZpZXInLCAnQSB1c2VyIGRlZmluZWQgaWRlbnRpZmllciB0byByZWZlcmVuY2UgdGhlIHRhc2sgaW4gbGF1bmNoLmpzb24gb3IgYSBkZXBlbmRzT24gY2xhdXNlLicpLFxuXHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5pZGVudGlmaWVyLmRlcHJlY2F0ZWQnLCAnVXNlciBkZWZpbmVkIGlkZW50aWZpZXJzIGFyZSBkZXByZWNhdGVkLiBGb3IgY3VzdG9tIHRhc2sgdXNlIHRoZSBuYW1lIGFzIGEgcmVmZXJlbmNlIGFuZCBmb3IgdGFza3MgcHJvdmlkZWQgYnkgZXh0ZW5zaW9ucyB1c2UgdGhlaXIgZGVmaW5lZCB0YXNrIGlkZW50aWZpZXIuJylcbn07XG5cbmNvbnN0IHJ1bk9wdGlvbnM6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0cmVldmFsdWF0ZU9uUmVydW46IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucmVldmFsdWF0ZU9uUmVydW4nLCAnV2hldGhlciB0byByZWV2YWx1YXRlIHRhc2sgdmFyaWFibGVzIG9uIHJlcnVuLicpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0cnVuT246IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydkZWZhdWx0JywgJ2ZvbGRlck9wZW4nLCAnd29ya3RyZWVDcmVhdGVkJ10sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnJ1bk9uJywgJ0NvbmZpZ3VyZXMgd2hlbiB0aGUgdGFzayBzaG91bGQgYmUgcnVuLiBJZiBzZXQgdG8gZm9sZGVyT3BlbiwgdGhlbiB0aGUgdGFzayB3aWxsIGJlIHJ1biBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIGZvbGRlciBpcyBvcGVuZWQuIElmIHNldCB0byB3b3JrdHJlZUNyZWF0ZWQsIHRoZW4gdGhlIHRhc2sgd2lsbCBiZSBydW4gYXV0b21hdGljYWxseSB3aGVuIGFuIEFnZW50IFNlc3Npb24gd29ya3RyZWUgaXMgY3JlYXRlZC4nKSxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0J1xuXHRcdH0sXG5cdFx0aW5zdGFuY2VMaW1pdDoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmluc3RhbmNlTGltaXQnLCAnVGhlIG51bWJlciBvZiBpbnN0YW5jZXMgb2YgdGhlIHRhc2sgdGhhdCBhcmUgYWxsb3dlZCB0byBydW4gc2ltdWx0YW5lb3VzbHkuJyksXG5cdFx0XHRkZWZhdWx0OiAxXG5cdFx0fSxcblx0XHRpbnN0YW5jZVBvbGljeToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3Rlcm1pbmF0ZU5ld2VzdCcsICd0ZXJtaW5hdGVPbGRlc3QnLCAncHJvbXB0JywgJ3dhcm4nLCAnc2lsZW50J10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5pbnN0YW5jZVBvbGljeS50ZXJtaW5hdGVOZXdlc3QnLCAnVGVybWluYXRlcyB0aGUgbmV3ZXN0IGluc3RhbmNlLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaW5zdGFuY2VQb2xpY3kudGVybWluYXRlT2xkZXN0JywgJ1Rlcm1pbmF0ZXMgdGhlIG9sZGVzdCBpbnN0YW5jZS4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmluc3RhbmNlUG9saWN5LnByb21wdCcsICdBc2tzIHdoaWNoIGluc3RhbmNlIHRvIHRlcm1pbmF0ZS4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmluc3RhbmNlUG9saWN5Lndhcm4nLCAnRG9lcyBub3RoaW5nIGJ1dCB3YXJucyB0aGF0IHRoZSBpbnN0YW5jZSBsaW1pdCBoYXMgYmVlbiByZWFjaGVkLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaW5zdGFuY2VQb2xpY3kuc2lsZW50JywgJ0RvZXMgbm90aGluZy4nKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmluc3RhbmNlUG9saWN5JywgJ1BvbGljeSB0byBhcHBseSB3aGVuIGluc3RhbmNlIGxpbWl0IGlzIHJlYWNoZWQuJyksXG5cdFx0XHRkZWZhdWx0OiAncHJvbXB0J1xuXHRcdH1cblx0fSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5ydW5PcHRpb25zJywgJ1RoZSB0YXNrXFwncyBydW4gcmVsYXRlZCBvcHRpb25zJylcbn07XG5cbmNvbnN0IGNvbW1vblNjaGVtYURlZmluaXRpb25zID0gY29tbW9uU2NoZW1hLmRlZmluaXRpb25zITtcbmNvbnN0IG9wdGlvbnM6IElKU09OU2NoZW1hID0gT2JqZWN0cy5kZWVwQ2xvbmUoY29tbW9uU2NoZW1hRGVmaW5pdGlvbnMub3B0aW9ucyk7XG5jb25zdCBvcHRpb25zUHJvcGVydGllcyA9IG9wdGlvbnMucHJvcGVydGllcyE7XG5vcHRpb25zUHJvcGVydGllcy5zaGVsbCA9IE9iamVjdHMuZGVlcENsb25lKGNvbW1vblNjaGVtYURlZmluaXRpb25zLnNoZWxsQ29uZmlndXJhdGlvbik7XG5cbmNvbnN0IHRhc2tDb25maWd1cmF0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0cHJvcGVydGllczoge1xuXHRcdGxhYmVsOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MudGFza0xhYmVsJywgXCJUaGUgdGFzaydzIGxhYmVsXCIpXG5cdFx0fSxcblx0XHR0YXNrTmFtZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnRhc2tOYW1lJywgJ1RoZSB0YXNrXFwncyBuYW1lJyksXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy50YXNrTmFtZS5kZXByZWNhdGVkJywgJ1RoZSB0YXNrXFwncyBuYW1lIHByb3BlcnR5IGlzIGRlcHJlY2F0ZWQuIFVzZSB0aGUgbGFiZWwgcHJvcGVydHkgaW5zdGVhZC4nKVxuXHRcdH0sXG5cdFx0aWRlbnRpZmllcjogT2JqZWN0cy5kZWVwQ2xvbmUoaWRlbnRpZmllciksXG5cdFx0Z3JvdXA6IE9iamVjdHMuZGVlcENsb25lKGdyb3VwKSxcblx0XHRpc0JhY2tncm91bmQ6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuYmFja2dyb3VuZCcsICdXaGV0aGVyIHRoZSBleGVjdXRlZCB0YXNrIGlzIGtlcHQgYWxpdmUgYW5kIGlzIHJ1bm5pbmcgaW4gdGhlIGJhY2tncm91bmQuJyksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRwcm9tcHRPbkNsb3NlOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByb21wdE9uQ2xvc2UnLCAnV2hldGhlciB0aGUgdXNlciBpcyBwcm9tcHRlZCB3aGVuIFZTIENvZGUgY2xvc2VzIHdpdGggYSBydW5uaW5nIHRhc2suJyksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0cHJlc2VudGF0aW9uOiBPYmplY3RzLmRlZXBDbG9uZShwcmVzZW50YXRpb24pLFxuXHRcdGljb246IE9iamVjdHMuZGVlcENsb25lKGljb24pLFxuXHRcdGhpZGU6IE9iamVjdHMuZGVlcENsb25lKGhpZGUpLFxuXHRcdGluQWdlbnRzOiBPYmplY3RzLmRlZXBDbG9uZShpbkFnZW50cyksXG5cdFx0b3B0aW9uczogb3B0aW9ucyxcblx0XHRwcm9ibGVtTWF0Y2hlcjoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcHJvYmxlbU1hdGNoZXJUeXBlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MubWF0Y2hlcnMnLCAnVGhlIHByb2JsZW0gbWF0Y2hlcihzKSB0byB1c2UuIENhbiBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBwcm9ibGVtIG1hdGNoZXIgZGVmaW5pdGlvbiBvciBhbiBhcnJheSBvZiBzdHJpbmdzIGFuZCBwcm9ibGVtIG1hdGNoZXJzLicpXG5cdFx0fSxcblx0XHRydW5PcHRpb25zOiBPYmplY3RzLmRlZXBDbG9uZShydW5PcHRpb25zKSxcblx0XHRkZXBlbmRzT246IE9iamVjdHMuZGVlcENsb25lKGRlcGVuZHNPbiksXG5cdFx0ZGVwZW5kc09yZGVyOiBPYmplY3RzLmRlZXBDbG9uZShkZXBlbmRzT3JkZXIpLFxuXHRcdGRldGFpbDogT2JqZWN0cy5kZWVwQ2xvbmUoZGV0YWlsKSxcblx0fVxufTtcblxuY29uc3QgdGFza0RlZmluaXRpb25zOiBJSlNPTlNjaGVtYVtdID0gW107XG5UYXNrRGVmaW5pdGlvblJlZ2lzdHJ5Lm9uUmVhZHkoKS50aGVuKCgpID0+IHtcblx0dXBkYXRlVGFza0RlZmluaXRpb25zKCk7XG59KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVRhc2tEZWZpbml0aW9ucygpIHtcblx0Zm9yIChjb25zdCB0YXNrVHlwZSBvZiBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmFsbCgpKSB7XG5cdFx0Ly8gQ2hlY2sgdGhhdCB3ZSBoYXZlbid0IGFscmVhZHkgYWRkZWQgdGhpcyB0YXNrIHR5cGVcblx0XHRpZiAodGFza0RlZmluaXRpb25zLmZpbmQoc2NoZW1hID0+IHtcblx0XHRcdHJldHVybiBzY2hlbWEucHJvcGVydGllcz8udHlwZT8uZW51bT8uZmluZCA/IHNjaGVtYS5wcm9wZXJ0aWVzPy50eXBlLmVudW0uZmluZChlbGVtZW50ID0+IGVsZW1lbnQgPT09IHRhc2tUeXBlLnRhc2tUeXBlKSA6IHVuZGVmaW5lZDtcblx0XHR9KSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IE9iamVjdHMuZGVlcENsb25lKHRhc2tDb25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBzY2hlbWFQcm9wZXJ0aWVzID0gc2NoZW1hLnByb3BlcnRpZXMhO1xuXHRcdC8vIFNpbmNlIHdlIGRvIHRoaXMgYWZ0ZXIgdGhlIHNjaGVtYSBpcyBhc3NpZ25lZCB3ZSBuZWVkIHRvIHBhdGNoIHRoZSByZWZzLlxuXHRcdHNjaGVtYVByb3BlcnRpZXMudHlwZSA9IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jdXN0b21pemF0aW9ucy5jdXN0b21pemVzLnR5cGUnLCAnVGhlIHRhc2sgdHlwZSB0byBjdXN0b21pemUnKSxcblx0XHRcdGVudW06IFt0YXNrVHlwZS50YXNrVHlwZV1cblx0XHR9O1xuXHRcdGlmICh0YXNrVHlwZS5yZXF1aXJlZCkge1xuXHRcdFx0c2NoZW1hLnJlcXVpcmVkID0gdGFza1R5cGUucmVxdWlyZWQuc2xpY2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2NoZW1hLnJlcXVpcmVkID0gW107XG5cdFx0fVxuXHRcdC8vIEN1c3RvbWl6ZWQgdGFza3MgcmVxdWlyZSB0aGF0IHRoZSB0YXNrIHR5cGUgYmUgc2V0LlxuXHRcdHNjaGVtYS5yZXF1aXJlZC5wdXNoKCd0eXBlJyk7XG5cdFx0aWYgKHRhc2tUeXBlLnByb3BlcnRpZXMpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHRhc2tUeXBlLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5ID0gdGFza1R5cGUucHJvcGVydGllc1trZXldO1xuXHRcdFx0XHRzY2hlbWFQcm9wZXJ0aWVzW2tleV0gPSBPYmplY3RzLmRlZXBDbG9uZShwcm9wZXJ0eSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZpeFJlZmVyZW5jZXMoc2NoZW1hIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pO1xuXHRcdHRhc2tEZWZpbml0aW9ucy5wdXNoKHNjaGVtYSk7XG5cdH1cbn1cblxuY29uc3QgY3VzdG9taXplID0gT2JqZWN0cy5kZWVwQ2xvbmUodGFza0NvbmZpZ3VyYXRpb24pO1xuY3VzdG9taXplLnByb3BlcnRpZXMhLmN1c3RvbWl6ZSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmN1c3RvbWl6ZS5kZXByZWNhdGVkJywgJ1RoZSBjdXN0b21pemUgcHJvcGVydHkgaXMgZGVwcmVjYXRlZC4gU2VlIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMgb24gaG93IHRvIG1pZ3JhdGUgdG8gdGhlIG5ldyB0YXNrIGN1c3RvbWl6YXRpb24gYXBwcm9hY2gnKVxufTtcbmlmICghY3VzdG9taXplLnJlcXVpcmVkKSB7XG5cdGN1c3RvbWl6ZS5yZXF1aXJlZCA9IFtdO1xufVxuY3VzdG9taXplLnJlcXVpcmVkLnB1c2goJ2N1c3RvbWl6ZScpO1xudGFza0RlZmluaXRpb25zLnB1c2goY3VzdG9taXplKTtcblxuY29uc3QgZGVmaW5pdGlvbnMgPSBPYmplY3RzLmRlZXBDbG9uZShjb21tb25TY2hlbWFEZWZpbml0aW9ucyk7XG5jb25zdCB0YXNrRGVzY3JpcHRpb246IElKU09OU2NoZW1hID0gZGVmaW5pdGlvbnMudGFza0Rlc2NyaXB0aW9uO1xudGFza0Rlc2NyaXB0aW9uLnJlcXVpcmVkID0gWydsYWJlbCddO1xuY29uc3QgdGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcyA9IHRhc2tEZXNjcmlwdGlvbi5wcm9wZXJ0aWVzITtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMubGFiZWwgPSBPYmplY3RzLmRlZXBDbG9uZShsYWJlbCk7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmNvbW1hbmQgPSBPYmplY3RzLmRlZXBDbG9uZShjb21tYW5kKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuYXJncyA9IE9iamVjdHMuZGVlcENsb25lKGFyZ3MpO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5pc1NoZWxsQ29tbWFuZCA9IE9iamVjdHMuZGVlcENsb25lKHNoZWxsQ29tbWFuZCk7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmRlcGVuZHNPbiA9IGRlcGVuZHNPbjtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuaGlkZSA9IE9iamVjdHMuZGVlcENsb25lKGhpZGUpO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5pbkFnZW50cyA9IE9iamVjdHMuZGVlcENsb25lKGluQWdlbnRzKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuZGVwZW5kc09yZGVyID0gZGVwZW5kc09yZGVyO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyID0gT2JqZWN0cy5kZWVwQ2xvbmUoaWRlbnRpZmllcik7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLnR5cGUgPSBPYmplY3RzLmRlZXBDbG9uZSh0YXNrVHlwZSk7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLnByZXNlbnRhdGlvbiA9IE9iamVjdHMuZGVlcENsb25lKHByZXNlbnRhdGlvbik7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLnRlcm1pbmFsID0gdGVybWluYWw7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmljb24gPSBPYmplY3RzLmRlZXBDbG9uZShpY29uKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuZ3JvdXAgPSBPYmplY3RzLmRlZXBDbG9uZShncm91cCk7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLnJ1bk9wdGlvbnMgPSBPYmplY3RzLmRlZXBDbG9uZShydW5PcHRpb25zKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuZGV0YWlsID0gZGV0YWlsO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy50YXNrTmFtZS5kZXByZWNhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoXG5cdCdKc29uU2NoZW1hLnRhc2tzLnRhc2tOYW1lLmRlcHJlY2F0ZWQnLFxuXHQnVGhlIHRhc2tcXCdzIG5hbWUgcHJvcGVydHkgaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSBsYWJlbCBwcm9wZXJ0eSBpbnN0ZWFkLidcbik7XG4vLyBDbG9uZSB0aGUgdGFza0Rlc2NyaXB0aW9uIGZvciBwcm9jZXNzIHRhc2sgYmVmb3JlIHNldHRpbmcgYSBkZWZhdWx0IHRvIHByZXZlbnQgdHdvIGRlZmF1bHRzICMxMTUyODFcbmNvbnN0IHByb2Nlc3NUYXNrID0gT2JqZWN0cy5kZWVwQ2xvbmUodGFza0Rlc2NyaXB0aW9uKTtcbnRhc2tEZXNjcmlwdGlvbi5kZWZhdWx0ID0ge1xuXHRsYWJlbDogJ015IFRhc2snLFxuXHR0eXBlOiAnc2hlbGwnLFxuXHRjb21tYW5kOiAnZWNobyBIZWxsbycsXG5cdHByb2JsZW1NYXRjaGVyOiBbXVxufTtcbmRlZmluaXRpb25zLnNob3dPdXRwdXRUeXBlLmRlcHJlY2F0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0J0pzb25TY2hlbWEudGFza3Muc2hvd091dHB1dC5kZXByZWNhdGVkJyxcblx0J1RoZSBwcm9wZXJ0eSBzaG93T3V0cHV0IGlzIGRlcHJlY2F0ZWQuIFVzZSB0aGUgcmV2ZWFsIHByb3BlcnR5IGluc2lkZSB0aGUgcHJlc2VudGF0aW9uIHByb3BlcnR5IGluc3RlYWQuIFNlZSBhbHNvIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMuJ1xuKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuZWNob0NvbW1hbmQuZGVwcmVjYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHQnSnNvblNjaGVtYS50YXNrcy5lY2hvQ29tbWFuZC5kZXByZWNhdGVkJyxcblx0J1RoZSBwcm9wZXJ0eSBlY2hvQ29tbWFuZCBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIGVjaG8gcHJvcGVydHkgaW5zaWRlIHRoZSBwcmVzZW50YXRpb24gcHJvcGVydHkgaW5zdGVhZC4gU2VlIGFsc28gdGhlIDEuMTQgcmVsZWFzZSBub3Rlcy4nXG4pO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5zdXBwcmVzc1Rhc2tOYW1lLmRlcHJlY2F0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0J0pzb25TY2hlbWEudGFza3Muc3VwcHJlc3NUYXNrTmFtZS5kZXByZWNhdGVkJyxcblx0J1RoZSBwcm9wZXJ0eSBzdXBwcmVzc1Rhc2tOYW1lIGlzIGRlcHJlY2F0ZWQuIElubGluZSB0aGUgY29tbWFuZCB3aXRoIGl0cyBhcmd1bWVudHMgaW50byB0aGUgdGFzayBpbnN0ZWFkLiBTZWUgYWxzbyB0aGUgMS4xNCByZWxlYXNlIG5vdGVzLidcbik7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmlzQnVpbGRDb21tYW5kLmRlcHJlY2F0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0J0pzb25TY2hlbWEudGFza3MuaXNCdWlsZENvbW1hbmQuZGVwcmVjYXRlZCcsXG5cdCdUaGUgcHJvcGVydHkgaXNCdWlsZENvbW1hbmQgaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSBncm91cCBwcm9wZXJ0eSBpbnN0ZWFkLiBTZWUgYWxzbyB0aGUgMS4xNCByZWxlYXNlIG5vdGVzLidcbik7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmlzVGVzdENvbW1hbmQuZGVwcmVjYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHQnSnNvblNjaGVtYS50YXNrcy5pc1Rlc3RDb21tYW5kLmRlcHJlY2F0ZWQnLFxuXHQnVGhlIHByb3BlcnR5IGlzVGVzdENvbW1hbmQgaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSBncm91cCBwcm9wZXJ0eSBpbnN0ZWFkLiBTZWUgYWxzbyB0aGUgMS4xNCByZWxlYXNlIG5vdGVzLidcbik7XG5cbi8vIFByb2Nlc3MgdGFza3MgYXJlIGFsbW9zdCBpZGVudGljYWwgc2NoZW1hLXdpc2UgdG8gc2hlbGwgdGFza3MsIGJ1dCB0aGV5IGFyZSByZXF1aXJlZCB0byBoYXZlIGEgY29tbWFuZFxucHJvY2Vzc1Rhc2sucHJvcGVydGllcyEudHlwZSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGVudW06IFsncHJvY2VzcyddLFxuXHRkZWZhdWx0OiAncHJvY2VzcycsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MudHlwZScsICdEZWZpbmVzIHdoZXRoZXIgdGhlIHRhc2sgaXMgcnVuIGFzIGEgcHJvY2VzcyBvciBhcyBhIGNvbW1hbmQgaW5zaWRlIGEgc2hlbGwuJylcbn07XG5wcm9jZXNzVGFzay5yZXF1aXJlZCEucHVzaCgnY29tbWFuZCcpO1xucHJvY2Vzc1Rhc2sucmVxdWlyZWQhLnB1c2goJ3R5cGUnKTtcblxudGFza0RlZmluaXRpb25zLnB1c2gocHJvY2Vzc1Rhc2spO1xuXG50YXNrRGVmaW5pdGlvbnMucHVzaCh7XG5cdCRyZWY6ICcjL2RlZmluaXRpb25zL3Rhc2tEZXNjcmlwdGlvbidcbn0pO1xuXG5jb25zdCBkZWZpbml0aW9uc1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uUHJvcGVydGllcyA9IGRlZmluaXRpb25zLnRhc2tSdW5uZXJDb25maWd1cmF0aW9uLnByb3BlcnRpZXMhO1xuY29uc3QgdGFza3MgPSBkZWZpbml0aW9uc1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uUHJvcGVydGllcy50YXNrcztcbnRhc2tzLml0ZW1zID0ge1xuXHRvbmVPZjogdGFza0RlZmluaXRpb25zXG59O1xuXG5kZWZpbml0aW9uc1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uUHJvcGVydGllcy5pbnB1dHMgPSBpbnB1dHNTY2hlbWEuZGVmaW5pdGlvbnMhLmlucHV0cztcblxuZGVmaW5pdGlvbnMuY29tbWFuZENvbmZpZ3VyYXRpb24ucHJvcGVydGllcyEuaXNTaGVsbENvbW1hbmQgPSBPYmplY3RzLmRlZXBDbG9uZShzaGVsbENvbW1hbmQpO1xuZGVmaW5pdGlvbnMuY29tbWFuZENvbmZpZ3VyYXRpb24ucHJvcGVydGllcyEuYXJncyA9IE9iamVjdHMuZGVlcENsb25lKGFyZ3MpO1xuZGVmaW5pdGlvbnMub3B0aW9ucy5wcm9wZXJ0aWVzIS5zaGVsbCA9IHtcblx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc2hlbGxDb25maWd1cmF0aW9uJ1xufTtcblxuZGVmaW5pdGlvbnNUYXNrUnVubmVyQ29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNTaGVsbENvbW1hbmQgPSBPYmplY3RzLmRlZXBDbG9uZShzaGVsbENvbW1hbmQpO1xuZGVmaW5pdGlvbnNUYXNrUnVubmVyQ29uZmlndXJhdGlvblByb3BlcnRpZXMudHlwZSA9IE9iamVjdHMuZGVlcENsb25lKHRhc2tUeXBlKTtcbmRlZmluaXRpb25zVGFza1J1bm5lckNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwID0gT2JqZWN0cy5kZWVwQ2xvbmUoZ3JvdXApO1xuZGVmaW5pdGlvbnNUYXNrUnVubmVyQ29uZmlndXJhdGlvblByb3BlcnRpZXMucHJlc2VudGF0aW9uID0gT2JqZWN0cy5kZWVwQ2xvbmUocHJlc2VudGF0aW9uKTtcbmRlZmluaXRpb25zVGFza1J1bm5lckNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnN1cHByZXNzVGFza05hbWUuZGVwcmVjYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHQnSnNvblNjaGVtYS50YXNrcy5zdXBwcmVzc1Rhc2tOYW1lLmRlcHJlY2F0ZWQnLFxuXHQnVGhlIHByb3BlcnR5IHN1cHByZXNzVGFza05hbWUgaXMgZGVwcmVjYXRlZC4gSW5saW5lIHRoZSBjb21tYW5kIHdpdGggaXRzIGFyZ3VtZW50cyBpbnRvIHRoZSB0YXNrIGluc3RlYWQuIFNlZSBhbHNvIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMuJ1xuKTtcbmRlZmluaXRpb25zVGFza1J1bm5lckNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnRhc2tTZWxlY3Rvci5kZXByZWNhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoXG5cdCdKc29uU2NoZW1hLnRhc2tzLnRhc2tTZWxlY3Rvci5kZXByZWNhdGVkJyxcblx0J1RoZSBwcm9wZXJ0eSB0YXNrU2VsZWN0b3IgaXMgZGVwcmVjYXRlZC4gSW5saW5lIHRoZSBjb21tYW5kIHdpdGggaXRzIGFyZ3VtZW50cyBpbnRvIHRoZSB0YXNrIGluc3RlYWQuIFNlZSBhbHNvIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMuJ1xuKTtcblxuY29uc3Qgb3NTcGVjaWZpY1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uID0gT2JqZWN0cy5kZWVwQ2xvbmUoZGVmaW5pdGlvbnMudGFza1J1bm5lckNvbmZpZ3VyYXRpb24pO1xuZGVsZXRlIG9zU3BlY2lmaWNUYXNrUnVubmVyQ29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzIS50YXNrcztcbm9zU3BlY2lmaWNUYXNrUnVubmVyQ29uZmlndXJhdGlvbi5hZGRpdGlvbmFsUHJvcGVydGllcyA9IGZhbHNlO1xuZGVmaW5pdGlvbnMub3NTcGVjaWZpY1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uID0gb3NTcGVjaWZpY1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uO1xuZGVmaW5pdGlvbnNUYXNrUnVubmVyQ29uZmlndXJhdGlvblByb3BlcnRpZXMudmVyc2lvbiA9IE9iamVjdHMuZGVlcENsb25lKHZlcnNpb24pO1xuXG5jb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRvbmVPZjogW1xuXHRcdHtcblx0XHRcdCdhbGxPZic6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3ZlcnNpb24nXSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiBPYmplY3RzLmRlZXBDbG9uZSh2ZXJzaW9uKSxcblx0XHRcdFx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy9kZWZpbml0aW9ucy9vc1NwZWNpZmljVGFza1J1bm5lckNvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEud2luZG93cycsICdXaW5kb3dzIHNwZWNpZmljIGNvbW1hbmQgY29uZmlndXJhdGlvbicpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b3N4OiB7XG5cdFx0XHRcdFx0XHRcdCckcmVmJzogJyMvZGVmaW5pdGlvbnMvb3NTcGVjaWZpY1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLm1hYycsICdNYWMgc3BlY2lmaWMgY29tbWFuZCBjb25maWd1cmF0aW9uJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjL2RlZmluaXRpb25zL29zU3BlY2lmaWNUYXNrUnVubmVyQ29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5saW51eCcsICdMaW51eCBzcGVjaWZpYyBjb21tYW5kIGNvbmZpZ3VyYXRpb24nKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Rhc2tSdW5uZXJDb25maWd1cmF0aW9uJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHRdXG59O1xuXG5zY2hlbWEuZGVmaW5pdGlvbnMgPSBkZWZpbml0aW9ucztcblxuZnVuY3Rpb24gZGVwcmVjYXRlZFZhcmlhYmxlTWVzc2FnZShzY2hlbWFNYXA6IElKU09OU2NoZW1hTWFwLCBwcm9wZXJ0eTogc3RyaW5nKSB7XG5cdGNvbnN0IG1hcEF0UHJvcGVydHkgPSBzY2hlbWFNYXBbcHJvcGVydHldLnByb3BlcnRpZXMhO1xuXHRpZiAobWFwQXRQcm9wZXJ0eSkge1xuXHRcdE9iamVjdC5rZXlzKG1hcEF0UHJvcGVydHkpLmZvckVhY2gobmFtZSA9PiB7XG5cdFx0XHRkZXByZWNhdGVkVmFyaWFibGVNZXNzYWdlKG1hcEF0UHJvcGVydHksIG5hbWUpO1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdENvbmZpZ3VyYXRpb25SZXNvbHZlclV0aWxzLmFwcGx5RGVwcmVjYXRlZFZhcmlhYmxlTWVzc2FnZShzY2hlbWFNYXBbcHJvcGVydHldKTtcblx0fVxufVxuXG5PYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhkZWZpbml0aW9ucykuZm9yRWFjaChrZXkgPT4ge1xuXHRjb25zdCBuZXdLZXkgPSBrZXkgKyAnMic7XG5cdGRlZmluaXRpb25zW25ld0tleV0gPSBkZWZpbml0aW9uc1trZXldO1xuXHRkZWxldGUgZGVmaW5pdGlvbnNba2V5XTtcblx0ZGVwcmVjYXRlZFZhcmlhYmxlTWVzc2FnZShkZWZpbml0aW9ucywgbmV3S2V5KTtcbn0pO1xuZml4UmVmZXJlbmNlcyhzY2hlbWEgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVQcm9ibGVtTWF0Y2hlcnMoKSB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgbWF0Y2hlcklkcyA9IFByb2JsZW1NYXRjaGVyUmVnaXN0cnkua2V5cygpLm1hcChrZXkgPT4gJyQnICsga2V5KTtcblx0XHRkZWZpbml0aW9ucy5wcm9ibGVtTWF0Y2hlclR5cGUyLm9uZU9mIVswXS5lbnVtID0gbWF0Y2hlcklkcztcblx0XHQoZGVmaW5pdGlvbnMucHJvYmxlbU1hdGNoZXJUeXBlMi5vbmVPZiFbMl0uaXRlbXMgYXMgSUpTT05TY2hlbWEpLmFueU9mIVswXS5lbnVtID0gbWF0Y2hlcklkcztcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0Y29uc29sZS5sb2coJ0luc3RhbGxpbmcgcHJvYmxlbSBtYXRjaGVyIGlkcyBmYWlsZWQnKTtcblx0fVxufVxuXG5Qcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5Lm9uUmVhZHkoKS50aGVuKCgpID0+IHtcblx0dXBkYXRlUHJvYmxlbU1hdGNoZXJzKCk7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgc2NoZW1hO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksYUFBYTtBQUd6QixPQUFPLGtCQUFrQjtBQUV6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDhCQUE4QjtBQUN2QyxZQUFZLGdDQUFnQztBQUM1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGNBQWMsU0FBOEM7QUFDcEUsTUFBSSxNQUFNLFFBQVEsT0FBTyxHQUFHO0FBQzNCLFlBQVEsUUFBUSxhQUFXO0FBQzFCLFVBQUksT0FBTyxZQUFZLFlBQVksWUFBWSxNQUFNO0FBQ3BELHNCQUFjLE9BQWtDO0FBQUEsTUFDakQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLFdBQVcsT0FBTyxZQUFZLFVBQVU7QUFDdkMsUUFBSSxRQUFRLE1BQU0sR0FBRztBQUNwQixjQUFRLE1BQU0sSUFBSSxRQUFRLE1BQU0sSUFBSTtBQUFBLElBQ3JDO0FBQ0EsV0FBTyxvQkFBb0IsT0FBTyxFQUFFLFFBQVEsY0FBWTtBQUN2RCxZQUFNLFFBQVEsUUFBUSxRQUFRO0FBQzlCLFVBQUksTUFBTSxRQUFRLEtBQUssS0FBTSxPQUFPLFVBQVUsWUFBWSxVQUFVLE1BQU87QUFDMUUsc0JBQWMsS0FBZ0M7QUFBQSxNQUMvQztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQUVBLE1BQU0sZUFBNEI7QUFBQSxFQUNqQyxPQUFPO0FBQUEsSUFDTjtBQUFBLE1BQ0MsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsYUFBYSxJQUFJLFNBQVMsb0JBQW9CLHdHQUF3RztBQUFBLElBQ3ZKO0FBQUEsSUFDQTtBQUFBLE1BQ0MsTUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQUEsRUFDQSxv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
