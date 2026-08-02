import * as nls from "../../../../nls.js";
import { Schemas } from "./problemMatcher.js";
const schema = {
  definitions: {
    showOutputType: {
      type: "string",
      enum: ["always", "silent", "never"]
    },
    options: {
      type: "object",
      description: nls.localize("JsonSchema.options", "Additional command options"),
      properties: {
        cwd: {
          type: "string",
          description: nls.localize("JsonSchema.options.cwd", "The current working directory of the executed program or script. If omitted Code's current workspace root is used.")
        },
        env: {
          type: "object",
          additionalProperties: {
            type: "string"
          },
          description: nls.localize("JsonSchema.options.env", "The environment of the executed program or shell. If omitted the parent process' environment is used.")
        }
      },
      additionalProperties: {
        type: ["string", "array", "object"]
      }
    },
    problemMatcherType: {
      oneOf: [
        {
          type: "string",
          errorMessage: nls.localize("JsonSchema.tasks.matcherError", "Unrecognized problem matcher. Is the extension that contributes this problem matcher installed?")
        },
        Schemas.LegacyProblemMatcher,
        {
          type: "array",
          items: {
            anyOf: [
              {
                type: "string",
                errorMessage: nls.localize("JsonSchema.tasks.matcherError", "Unrecognized problem matcher. Is the extension that contributes this problem matcher installed?")
              },
              Schemas.LegacyProblemMatcher
            ]
          }
        }
      ]
    },
    shellConfiguration: {
      type: "object",
      additionalProperties: false,
      description: nls.localize("JsonSchema.shellConfiguration", "Configures the shell to be used."),
      properties: {
        executable: {
          type: "string",
          description: nls.localize("JsonSchema.shell.executable", "The shell to be used.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.shell.args", "The shell arguments."),
          items: {
            type: "string"
          }
        }
      }
    },
    commandConfiguration: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: {
          type: "string",
          description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.tasks.args", "Arguments passed to the command when this task is invoked."),
          items: {
            type: "string"
          }
        },
        options: {
          $ref: "#/definitions/options"
        }
      }
    },
    taskDescription: {
      type: "object",
      required: ["taskName"],
      additionalProperties: false,
      properties: {
        taskName: {
          type: "string",
          description: nls.localize("JsonSchema.tasks.taskName", "The task's name")
        },
        command: {
          type: "string",
          description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.tasks.args", "Arguments passed to the command when this task is invoked."),
          items: {
            type: "string"
          }
        },
        options: {
          $ref: "#/definitions/options"
        },
        windows: {
          anyOf: [
            {
              $ref: "#/definitions/commandConfiguration",
              description: nls.localize("JsonSchema.tasks.windows", "Windows specific command configuration")
            },
            {
              properties: {
                problemMatcher: {
                  $ref: "#/definitions/problemMatcherType",
                  description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
                }
              }
            }
          ]
        },
        osx: {
          anyOf: [
            {
              $ref: "#/definitions/commandConfiguration",
              description: nls.localize("JsonSchema.tasks.mac", "Mac specific command configuration")
            },
            {
              properties: {
                problemMatcher: {
                  $ref: "#/definitions/problemMatcherType",
                  description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
                }
              }
            }
          ]
        },
        linux: {
          anyOf: [
            {
              $ref: "#/definitions/commandConfiguration",
              description: nls.localize("JsonSchema.tasks.linux", "Linux specific command configuration")
            },
            {
              properties: {
                problemMatcher: {
                  $ref: "#/definitions/problemMatcherType",
                  description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
                }
              }
            }
          ]
        },
        suppressTaskName: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.suppressTaskName", "Controls whether the task name is added as an argument to the command. If omitted the globally defined value is used."),
          default: true
        },
        showOutput: {
          $ref: "#/definitions/showOutputType",
          description: nls.localize("JsonSchema.tasks.showOutput", "Controls whether the output of the running task is shown or not. If omitted the globally defined value is used.")
        },
        echoCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.echoCommand", "Controls whether the executed command is echoed to the output. Default is false."),
          default: true
        },
        isWatching: {
          type: "boolean",
          deprecationMessage: nls.localize("JsonSchema.tasks.watching.deprecation", "Deprecated. Use isBackground instead."),
          description: nls.localize("JsonSchema.tasks.watching", "Whether the executed task is kept alive and is watching the file system."),
          default: true
        },
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
        isBuildCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.build", "Maps this task to Code's default build command."),
          default: true
        },
        isTestCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.test", "Maps this task to Code's default test command."),
          default: true
        },
        problemMatcher: {
          $ref: "#/definitions/problemMatcherType",
          description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
        }
      }
    },
    taskRunnerConfiguration: {
      type: "object",
      required: [],
      properties: {
        command: {
          type: "string",
          description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.args", "Additional arguments passed to the command."),
          items: {
            type: "string"
          }
        },
        options: {
          $ref: "#/definitions/options"
        },
        showOutput: {
          $ref: "#/definitions/showOutputType",
          description: nls.localize("JsonSchema.showOutput", "Controls whether the output of the running task is shown or not. If omitted 'always' is used.")
        },
        isWatching: {
          type: "boolean",
          deprecationMessage: nls.localize("JsonSchema.watching.deprecation", "Deprecated. Use isBackground instead."),
          description: nls.localize("JsonSchema.watching", "Whether the executed task is kept alive and is watching the file system."),
          default: true
        },
        isBackground: {
          type: "boolean",
          description: nls.localize("JsonSchema.background", "Whether the executed task is kept alive and is running in the background."),
          default: true
        },
        promptOnClose: {
          type: "boolean",
          description: nls.localize("JsonSchema.promptOnClose", "Whether the user is prompted when VS Code closes with a running background task."),
          default: false
        },
        echoCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.echoCommand", "Controls whether the executed command is echoed to the output. Default is false."),
          default: true
        },
        suppressTaskName: {
          type: "boolean",
          description: nls.localize("JsonSchema.suppressTaskName", "Controls whether the task name is added as an argument to the command. Default is false."),
          default: true
        },
        taskSelector: {
          type: "string",
          description: nls.localize("JsonSchema.taskSelector", "Prefix to indicate that an argument is task.")
        },
        problemMatcher: {
          $ref: "#/definitions/problemMatcherType",
          description: nls.localize("JsonSchema.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
        },
        tasks: {
          type: "array",
          description: nls.localize("JsonSchema.tasks", "The task configurations. Usually these are enrichments of task already defined in the external task runner."),
          items: {
            type: "object",
            $ref: "#/definitions/taskDescription"
          }
        }
      }
    }
  }
};
var jsonSchemaCommon_default = schema;
export {
  jsonSchemaCommon_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9qc29uU2NoZW1hQ29tbW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuXG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5cbmNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdGRlZmluaXRpb25zOiB7XG5cdFx0c2hvd091dHB1dFR5cGU6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhbHdheXMnLCAnc2lsZW50JywgJ25ldmVyJ11cblx0XHR9LFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5vcHRpb25zJywgJ0FkZGl0aW9uYWwgY29tbWFuZCBvcHRpb25zJyksXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGN3ZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEub3B0aW9ucy5jd2QnLCAnVGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3Rvcnkgb2YgdGhlIGV4ZWN1dGVkIHByb2dyYW0gb3Igc2NyaXB0LiBJZiBvbWl0dGVkIENvZGVcXCdzIGN1cnJlbnQgd29ya3NwYWNlIHJvb3QgaXMgdXNlZC4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlbnY6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEub3B0aW9ucy5lbnYnLCAnVGhlIGVudmlyb25tZW50IG9mIHRoZSBleGVjdXRlZCBwcm9ncmFtIG9yIHNoZWxsLiBJZiBvbWl0dGVkIHRoZSBwYXJlbnQgcHJvY2Vzc1xcJyBlbnZpcm9ubWVudCBpcyB1c2VkLicpXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdhcnJheScsICdvYmplY3QnXVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cHJvYmxlbU1hdGNoZXJUeXBlOiB7XG5cdFx0XHRvbmVPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MubWF0Y2hlckVycm9yJywgJ1VucmVjb2duaXplZCBwcm9ibGVtIG1hdGNoZXIuIElzIHRoZSBleHRlbnNpb24gdGhhdCBjb250cmlidXRlcyB0aGlzIHByb2JsZW0gbWF0Y2hlciBpbnN0YWxsZWQ/Jylcblx0XHRcdFx0fSxcblx0XHRcdFx0U2NoZW1hcy5MZWdhY3lQcm9ibGVtTWF0Y2hlcixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5tYXRjaGVyRXJyb3InLCAnVW5yZWNvZ25pemVkIHByb2JsZW0gbWF0Y2hlci4gSXMgdGhlIGV4dGVuc2lvbiB0aGF0IGNvbnRyaWJ1dGVzIHRoaXMgcHJvYmxlbSBtYXRjaGVyIGluc3RhbGxlZD8nKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRTY2hlbWFzLkxlZ2FjeVByb2JsZW1NYXRjaGVyXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRzaGVsbENvbmZpZ3VyYXRpb246IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5zaGVsbENvbmZpZ3VyYXRpb24nLCAnQ29uZmlndXJlcyB0aGUgc2hlbGwgdG8gYmUgdXNlZC4nKSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0ZXhlY3V0YWJsZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuc2hlbGwuZXhlY3V0YWJsZScsICdUaGUgc2hlbGwgdG8gYmUgdXNlZC4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhcmdzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnNoZWxsLmFyZ3MnLCAnVGhlIHNoZWxsIGFyZ3VtZW50cy4nKSxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGNvbW1hbmRDb25maWd1cmF0aW9uOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuY29tbWFuZCcsICdUaGUgY29tbWFuZCB0byBiZSBleGVjdXRlZC4gQ2FuIGJlIGFuIGV4dGVybmFsIHByb2dyYW0gb3IgYSBzaGVsbCBjb21tYW5kLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFyZ3M6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuYXJncycsICdBcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBjb21tYW5kIHdoZW4gdGhpcyB0YXNrIGlzIGludm9rZWQuJyksXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvb3B0aW9ucydcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0dGFza0Rlc2NyaXB0aW9uOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHJlcXVpcmVkOiBbJ3Rhc2tOYW1lJ10sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHRhc2tOYW1lOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy50YXNrTmFtZScsIFwiVGhlIHRhc2sncyBuYW1lXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmNvbW1hbmQnLCAnVGhlIGNvbW1hbmQgdG8gYmUgZXhlY3V0ZWQuIENhbiBiZSBhbiBleHRlcm5hbCBwcm9ncmFtIG9yIGEgc2hlbGwgY29tbWFuZC4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhcmdzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmFyZ3MnLCAnQXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZCB3aGVuIHRoaXMgdGFzayBpcyBpbnZva2VkLicpLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL29wdGlvbnMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9jb21tYW5kQ29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3Mud2luZG93cycsICdXaW5kb3dzIHNwZWNpZmljIGNvbW1hbmQgY29uZmlndXJhdGlvbicpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9wcm9ibGVtTWF0Y2hlclR5cGUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5tYXRjaGVycycsICdUaGUgcHJvYmxlbSBtYXRjaGVyKHMpIHRvIHVzZS4gQ2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBhIHByb2JsZW0gbWF0Y2hlciBkZWZpbml0aW9uIG9yIGFuIGFycmF5IG9mIHN0cmluZ3MgYW5kIHByb2JsZW0gbWF0Y2hlcnMuJylcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9zeDoge1xuXHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2NvbW1hbmRDb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5tYWMnLCAnTWFjIHNwZWNpZmljIGNvbW1hbmQgY29uZmlndXJhdGlvbicpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0cHJvYmxlbU1hdGNoZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Byb2JsZW1NYXRjaGVyVHlwZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLm1hdGNoZXJzJywgJ1RoZSBwcm9ibGVtIG1hdGNoZXIocykgdG8gdXNlLiBDYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgcHJvYmxlbSBtYXRjaGVyIGRlZmluaXRpb24gb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncyBhbmQgcHJvYmxlbSBtYXRjaGVycy4nKVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0bGludXg6IHtcblx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9jb21tYW5kQ29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MubGludXgnLCAnTGludXggc3BlY2lmaWMgY29tbWFuZCBjb25maWd1cmF0aW9uJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRwcm9ibGVtTWF0Y2hlcjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcHJvYmxlbU1hdGNoZXJUeXBlJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MubWF0Y2hlcnMnLCAnVGhlIHByb2JsZW0gbWF0Y2hlcihzKSB0byB1c2UuIENhbiBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBwcm9ibGVtIG1hdGNoZXIgZGVmaW5pdGlvbiBvciBhbiBhcnJheSBvZiBzdHJpbmdzIGFuZCBwcm9ibGVtIG1hdGNoZXJzLicpXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdXBwcmVzc1Rhc2tOYW1lOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3Muc3VwcHJlc3NUYXNrTmFtZScsICdDb250cm9scyB3aGV0aGVyIHRoZSB0YXNrIG5hbWUgaXMgYWRkZWQgYXMgYW4gYXJndW1lbnQgdG8gdGhlIGNvbW1hbmQuIElmIG9taXR0ZWQgdGhlIGdsb2JhbGx5IGRlZmluZWQgdmFsdWUgaXMgdXNlZC4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNob3dPdXRwdXQ6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9zaG93T3V0cHV0VHlwZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5zaG93T3V0cHV0JywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIG91dHB1dCBvZiB0aGUgcnVubmluZyB0YXNrIGlzIHNob3duIG9yIG5vdC4gSWYgb21pdHRlZCB0aGUgZ2xvYmFsbHkgZGVmaW5lZCB2YWx1ZSBpcyB1c2VkLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVjaG9Db21tYW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuZWNob0NvbW1hbmQnLCAnQ29udHJvbHMgd2hldGhlciB0aGUgZXhlY3V0ZWQgY29tbWFuZCBpcyBlY2hvZWQgdG8gdGhlIG91dHB1dC4gRGVmYXVsdCBpcyBmYWxzZS4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlzV2F0Y2hpbmc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3Mud2F0Y2hpbmcuZGVwcmVjYXRpb24nLCAnRGVwcmVjYXRlZC4gVXNlIGlzQmFja2dyb3VuZCBpbnN0ZWFkLicpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3Mud2F0Y2hpbmcnLCAnV2hldGhlciB0aGUgZXhlY3V0ZWQgdGFzayBpcyBrZXB0IGFsaXZlIGFuZCBpcyB3YXRjaGluZyB0aGUgZmlsZSBzeXN0ZW0uJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpc0JhY2tncm91bmQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5iYWNrZ3JvdW5kJywgJ1doZXRoZXIgdGhlIGV4ZWN1dGVkIHRhc2sgaXMga2VwdCBhbGl2ZSBhbmQgaXMgcnVubmluZyBpbiB0aGUgYmFja2dyb3VuZC4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb21wdE9uQ2xvc2U6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcm9tcHRPbkNsb3NlJywgJ1doZXRoZXIgdGhlIHVzZXIgaXMgcHJvbXB0ZWQgd2hlbiBWUyBDb2RlIGNsb3NlcyB3aXRoIGEgcnVubmluZyB0YXNrLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlzQnVpbGRDb21tYW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuYnVpbGQnLCAnTWFwcyB0aGlzIHRhc2sgdG8gQ29kZVxcJ3MgZGVmYXVsdCBidWlsZCBjb21tYW5kLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNUZXN0Q29tbWFuZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnRlc3QnLCAnTWFwcyB0aGlzIHRhc2sgdG8gQ29kZVxcJ3MgZGVmYXVsdCB0ZXN0IGNvbW1hbmQuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcm9ibGVtTWF0Y2hlcjoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Byb2JsZW1NYXRjaGVyVHlwZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5tYXRjaGVycycsICdUaGUgcHJvYmxlbSBtYXRjaGVyKHMpIHRvIHVzZS4gQ2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBhIHByb2JsZW0gbWF0Y2hlciBkZWZpbml0aW9uIG9yIGFuIGFycmF5IG9mIHN0cmluZ3MgYW5kIHByb2JsZW0gbWF0Y2hlcnMuJylcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0dGFza1J1bm5lckNvbmZpZ3VyYXRpb246IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cmVxdWlyZWQ6IFtdLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jb21tYW5kJywgJ1RoZSBjb21tYW5kIHRvIGJlIGV4ZWN1dGVkLiBDYW4gYmUgYW4gZXh0ZXJuYWwgcHJvZ3JhbSBvciBhIHNoZWxsIGNvbW1hbmQuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0YXJnczoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5hcmdzJywgJ0FkZGl0aW9uYWwgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZC4nKSxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9vcHRpb25zJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzaG93T3V0cHV0OiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc2hvd091dHB1dFR5cGUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuc2hvd091dHB1dCcsICdDb250cm9scyB3aGV0aGVyIHRoZSBvdXRwdXQgb2YgdGhlIHJ1bm5pbmcgdGFzayBpcyBzaG93biBvciBub3QuIElmIG9taXR0ZWQgXFwnYWx3YXlzXFwnIGlzIHVzZWQuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNXYXRjaGluZzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS53YXRjaGluZy5kZXByZWNhdGlvbicsICdEZXByZWNhdGVkLiBVc2UgaXNCYWNrZ3JvdW5kIGluc3RlYWQuJyksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS53YXRjaGluZycsICdXaGV0aGVyIHRoZSBleGVjdXRlZCB0YXNrIGlzIGtlcHQgYWxpdmUgYW5kIGlzIHdhdGNoaW5nIHRoZSBmaWxlIHN5c3RlbS4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlzQmFja2dyb3VuZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmJhY2tncm91bmQnLCAnV2hldGhlciB0aGUgZXhlY3V0ZWQgdGFzayBpcyBrZXB0IGFsaXZlIGFuZCBpcyBydW5uaW5nIGluIHRoZSBiYWNrZ3JvdW5kLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJvbXB0T25DbG9zZToge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnByb21wdE9uQ2xvc2UnLCAnV2hldGhlciB0aGUgdXNlciBpcyBwcm9tcHRlZCB3aGVuIFZTIENvZGUgY2xvc2VzIHdpdGggYSBydW5uaW5nIGJhY2tncm91bmQgdGFzay4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRlY2hvQ29tbWFuZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmVjaG9Db21tYW5kJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIGV4ZWN1dGVkIGNvbW1hbmQgaXMgZWNob2VkIHRvIHRoZSBvdXRwdXQuIERlZmF1bHQgaXMgZmFsc2UuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdXBwcmVzc1Rhc2tOYW1lOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuc3VwcHJlc3NUYXNrTmFtZScsICdDb250cm9scyB3aGV0aGVyIHRoZSB0YXNrIG5hbWUgaXMgYWRkZWQgYXMgYW4gYXJndW1lbnQgdG8gdGhlIGNvbW1hbmQuIERlZmF1bHQgaXMgZmFsc2UuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0YXNrU2VsZWN0b3I6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tTZWxlY3RvcicsICdQcmVmaXggdG8gaW5kaWNhdGUgdGhhdCBhbiBhcmd1bWVudCBpcyB0YXNrLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcHJvYmxlbU1hdGNoZXJUeXBlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLm1hdGNoZXJzJywgJ1RoZSBwcm9ibGVtIG1hdGNoZXIocykgdG8gdXNlLiBDYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgcHJvYmxlbSBtYXRjaGVyIGRlZmluaXRpb24gb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncyBhbmQgcHJvYmxlbSBtYXRjaGVycy4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0YXNrczoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcycsICdUaGUgdGFzayBjb25maWd1cmF0aW9ucy4gVXN1YWxseSB0aGVzZSBhcmUgZW5yaWNobWVudHMgb2YgdGFzayBhbHJlYWR5IGRlZmluZWQgaW4gdGhlIGV4dGVybmFsIHRhc2sgcnVubmVyLicpLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Rhc2tEZXNjcmlwdGlvbidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG5cbmV4cG9ydCBkZWZh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
