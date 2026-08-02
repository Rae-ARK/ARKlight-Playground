import * as extensionsRegistry from "../../../services/extensions/common/extensionsRegistry.js";
import * as nls from "../../../../nls.js";
import { launchSchemaId } from "../../../services/configuration/common/configuration.js";
import { inputsSchema } from "../../../services/configurationResolver/common/configurationResolverSchema.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const debuggersExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "debuggers",
  defaultExtensionKind: ["workspace"],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.debuggers", "Contributes debug adapters."),
    type: "array",
    defaultSnippets: [{ body: [{ type: "" }] }],
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { type: "", program: "", runtime: "" } }],
      properties: {
        type: {
          description: nls.localize("vscode.extension.contributes.debuggers.type", "Unique identifier for this debug adapter."),
          type: "string"
        },
        label: {
          description: nls.localize("vscode.extension.contributes.debuggers.label", "Display name for this debug adapter."),
          type: "string"
        },
        program: {
          description: nls.localize("vscode.extension.contributes.debuggers.program", "Path to the debug adapter program. Path is either absolute or relative to the extension folder."),
          type: "string"
        },
        args: {
          description: nls.localize("vscode.extension.contributes.debuggers.args", "Optional arguments to pass to the adapter."),
          type: "array"
        },
        runtime: {
          description: nls.localize("vscode.extension.contributes.debuggers.runtime", "Optional runtime in case the program attribute is not an executable but requires a runtime."),
          type: "string"
        },
        runtimeArgs: {
          description: nls.localize("vscode.extension.contributes.debuggers.runtimeArgs", "Optional runtime arguments."),
          type: "array"
        },
        variables: {
          description: nls.localize("vscode.extension.contributes.debuggers.variables", "Mapping from interactive variables (e.g. ${action.pickProcess}) in `launch.json` to a command."),
          type: "object"
        },
        initialConfigurations: {
          description: nls.localize("vscode.extension.contributes.debuggers.initialConfigurations", "Configurations for generating the initial 'launch.json'."),
          type: ["array", "string"]
        },
        languages: {
          description: nls.localize("vscode.extension.contributes.debuggers.languages", 'List of languages for which the debug extension could be considered the "default debugger".'),
          type: "array"
        },
        configurationSnippets: {
          description: nls.localize("vscode.extension.contributes.debuggers.configurationSnippets", "Snippets for adding new configurations in 'launch.json'."),
          type: "array"
        },
        configurationAttributes: {
          description: nls.localize("vscode.extension.contributes.debuggers.configurationAttributes", "JSON schema configurations for validating 'launch.json'."),
          type: "object"
        },
        when: {
          description: nls.localize("vscode.extension.contributes.debuggers.when", "Condition which must be true to enable this type of debugger. Consider using 'shellExecutionSupported', 'virtualWorkspace', 'resourceScheme' or an extension-defined context key as appropriate for this."),
          type: "string",
          default: ""
        },
        hiddenWhen: {
          description: nls.localize("vscode.extension.contributes.debuggers.hiddenWhen", "When this condition is true, this debugger type is hidden from the debugger list, but is still enabled."),
          type: "string",
          default: ""
        },
        deprecated: {
          description: nls.localize("vscode.extension.contributes.debuggers.deprecated", "Optional message to mark this debug type as being deprecated."),
          type: "string",
          default: ""
        },
        windows: {
          description: nls.localize("vscode.extension.contributes.debuggers.windows", "Windows specific settings."),
          type: "object",
          properties: {
            runtime: {
              description: nls.localize("vscode.extension.contributes.debuggers.windows.runtime", "Runtime used for Windows."),
              type: "string"
            }
          }
        },
        osx: {
          description: nls.localize("vscode.extension.contributes.debuggers.osx", "macOS specific settings."),
          type: "object",
          properties: {
            runtime: {
              description: nls.localize("vscode.extension.contributes.debuggers.osx.runtime", "Runtime used for macOS."),
              type: "string"
            }
          }
        },
        linux: {
          description: nls.localize("vscode.extension.contributes.debuggers.linux", "Linux specific settings."),
          type: "object",
          properties: {
            runtime: {
              description: nls.localize("vscode.extension.contributes.debuggers.linux.runtime", "Runtime used for Linux."),
              type: "string"
            }
          }
        },
        strings: {
          description: nls.localize("vscode.extension.contributes.debuggers.strings", "UI strings contributed by this debug adapter."),
          type: "object",
          properties: {
            unverifiedBreakpoints: {
              description: nls.localize("vscode.extension.contributes.debuggers.strings.unverifiedBreakpoints", "When there are unverified breakpoints in a language supported by this debug adapter, this message will appear on the breakpoint hover and in the breakpoints view. Markdown and command links are supported."),
              type: "string"
            }
          }
        }
      }
    }
  }
});
const breakpointsExtPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "breakpoints",
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.breakpoints", "Contributes breakpoints."),
    type: "array",
    defaultSnippets: [{ body: [{ language: "" }] }],
    items: {
      type: "object",
      additionalProperties: false,
      defaultSnippets: [{ body: { language: "" } }],
      properties: {
        language: {
          description: nls.localize("vscode.extension.contributes.breakpoints.language", "Allow breakpoints for this language."),
          type: "string"
        },
        when: {
          description: nls.localize("vscode.extension.contributes.breakpoints.when", "Condition which must be true to enable breakpoints in this language. Consider matching this to the debugger when clause as appropriate."),
          type: "string",
          default: ""
        }
      }
    }
  }
});
const presentationSchema = {
  type: "object",
  description: nls.localize("presentation", "Presentation options on how to show this configuration in the debug configuration dropdown and the command palette."),
  properties: {
    hidden: {
      type: "boolean",
      default: false,
      description: nls.localize("presentation.hidden", "Controls if this configuration should be shown in the configuration dropdown and the command palette.")
    },
    group: {
      type: "string",
      default: "",
      description: nls.localize("presentation.group", "Group that this configuration belongs to. Used for grouping and sorting in the configuration dropdown and the command palette.")
    },
    order: {
      type: "number",
      default: 1,
      description: nls.localize("presentation.order", "Order of this configuration within a group. Used for grouping and sorting in the configuration dropdown and the command palette.")
    }
  },
  default: {
    hidden: false,
    group: "",
    order: 1
  }
};
const defaultCompound = { name: "Compound", configurations: [] };
const launchSchema = {
  id: launchSchemaId,
  type: "object",
  title: nls.localize("app.launch.json.title", "Launch"),
  allowTrailingCommas: true,
  allowComments: true,
  required: [],
  default: { version: "0.2.0", configurations: [], compounds: [] },
  properties: {
    version: {
      type: "string",
      description: nls.localize("app.launch.json.version", "Version of this file format."),
      default: "0.2.0"
    },
    configurations: {
      type: "array",
      description: nls.localize("app.launch.json.configurations", "List of configurations. Add new configurations or edit existing ones by using IntelliSense."),
      items: {
        defaultSnippets: [],
        "type": "object",
        oneOf: []
      }
    },
    compounds: {
      type: "array",
      description: nls.localize("app.launch.json.compounds", "List of compounds. Each compound references multiple configurations which will get launched together."),
      items: {
        type: "object",
        required: ["name", "configurations"],
        properties: {
          name: {
            type: "string",
            description: nls.localize("app.launch.json.compound.name", "Name of compound. Appears in the launch configuration drop down menu.")
          },
          presentation: presentationSchema,
          configurations: {
            type: "array",
            default: [],
            items: {
              oneOf: [{
                enum: [],
                description: nls.localize("useUniqueNames", "Please use unique configuration names.")
              }, {
                type: "object",
                required: ["name"],
                properties: {
                  name: {
                    enum: [],
                    description: nls.localize("app.launch.json.compound.name", "Name of compound. Appears in the launch configuration drop down menu.")
                  },
                  folder: {
                    enum: [],
                    description: nls.localize("app.launch.json.compound.folder", "Name of folder in which the compound is located.")
                  }
                }
              }]
            },
            description: nls.localize("app.launch.json.compounds.configurations", "Names of configurations that will be started as part of this compound.")
          },
          stopAll: {
            type: "boolean",
            default: false,
            description: nls.localize("app.launch.json.compound.stopAll", "Controls whether manually terminating one session will stop all of the compound sessions.")
          },
          preLaunchTask: {
            type: "string",
            default: "",
            description: nls.localize("compoundPrelaunchTask", "Task to run before any of the compound configurations start.")
          }
        },
        default: defaultCompound
      },
      default: [
        defaultCompound
      ]
    },
    inputs: inputsSchema.definitions.inputs
  }
};
class DebuggersDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.debuggers;
  }
  render(manifest) {
    const contrib = manifest.contributes?.debuggers || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("debugger name", "Name"),
      nls.localize("debugger type", "Type")
    ];
    const rows = contrib.map((d) => {
      return [
        d.label ?? "",
        d.type
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "debuggers",
  label: nls.localize("debuggers", "Debuggers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(DebuggersDataRenderer)
});
export {
  breakpointsExtPoint,
  debuggersExtPoint,
  launchSchema,
  presentationSchema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Z1NjaGVtYXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBleHRlbnNpb25zUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURlYnVnZ2VyQ29udHJpYnV0aW9uLCBJQ29tcG91bmQsIElCcmVha3BvaW50Q29udHJpYnV0aW9uIH0gZnJvbSAnLi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBsYXVuY2hTY2hlbWFJZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IGlucHV0c1NjaGVtYSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG4vLyBkZWJ1Z2dlcnMgZXh0ZW5zaW9uIHBvaW50XG5leHBvcnQgY29uc3QgZGVidWdnZXJzRXh0UG9pbnQgPSBleHRlbnNpb25zUmVnaXN0cnkuRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SURlYnVnZ2VyQ29udHJpYnV0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdkZWJ1Z2dlcnMnLFxuXHRkZWZhdWx0RXh0ZW5zaW9uS2luZDogWyd3b3Jrc3BhY2UnXSxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzJywgJ0NvbnRyaWJ1dGVzIGRlYnVnIGFkYXB0ZXJzLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiBbeyB0eXBlOiAnJyB9XSB9XSxcblx0XHRpdGVtczoge1xuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgdHlwZTogJycsIHByb2dyYW06ICcnLCBydW50aW1lOiAnJyB9IH1dLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMudHlwZScsIFwiVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoaXMgZGVidWcgYWRhcHRlci5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0bGFiZWw6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5sYWJlbCcsIFwiRGlzcGxheSBuYW1lIGZvciB0aGlzIGRlYnVnIGFkYXB0ZXIuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb2dyYW06IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5wcm9ncmFtJywgXCJQYXRoIHRvIHRoZSBkZWJ1ZyBhZGFwdGVyIHByb2dyYW0uIFBhdGggaXMgZWl0aGVyIGFic29sdXRlIG9yIHJlbGF0aXZlIHRvIHRoZSBleHRlbnNpb24gZm9sZGVyLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhcmdzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMuYXJncycsIFwiT3B0aW9uYWwgYXJndW1lbnRzIHRvIHBhc3MgdG8gdGhlIGFkYXB0ZXIuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheSdcblx0XHRcdFx0fSxcblx0XHRcdFx0cnVudGltZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLnJ1bnRpbWUnLCBcIk9wdGlvbmFsIHJ1bnRpbWUgaW4gY2FzZSB0aGUgcHJvZ3JhbSBhdHRyaWJ1dGUgaXMgbm90IGFuIGV4ZWN1dGFibGUgYnV0IHJlcXVpcmVzIGEgcnVudGltZS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0cnVudGltZUFyZ3M6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5ydW50aW1lQXJncycsIFwiT3B0aW9uYWwgcnVudGltZSBhcmd1bWVudHMuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheSdcblx0XHRcdFx0fSxcblx0XHRcdFx0dmFyaWFibGVzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMudmFyaWFibGVzJywgXCJNYXBwaW5nIGZyb20gaW50ZXJhY3RpdmUgdmFyaWFibGVzIChlLmcuICR7YWN0aW9uLnBpY2tQcm9jZXNzfSkgaW4gYGxhdW5jaC5qc29uYCB0byBhIGNvbW1hbmQuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluaXRpYWxDb25maWd1cmF0aW9uczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmluaXRpYWxDb25maWd1cmF0aW9ucycsIFwiQ29uZmlndXJhdGlvbnMgZm9yIGdlbmVyYXRpbmcgdGhlIGluaXRpYWwgXFwnbGF1bmNoLmpzb25cXCcuXCIpLFxuXHRcdFx0XHRcdHR5cGU6IFsnYXJyYXknLCAnc3RyaW5nJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhbmd1YWdlczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmxhbmd1YWdlcycsIFwiTGlzdCBvZiBsYW5ndWFnZXMgZm9yIHdoaWNoIHRoZSBkZWJ1ZyBleHRlbnNpb24gY291bGQgYmUgY29uc2lkZXJlZCB0aGUgXFxcImRlZmF1bHQgZGVidWdnZXJcXFwiLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TbmlwcGV0czoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmNvbmZpZ3VyYXRpb25TbmlwcGV0cycsIFwiU25pcHBldHMgZm9yIGFkZGluZyBuZXcgY29uZmlndXJhdGlvbnMgaW4gXFwnbGF1bmNoLmpzb25cXCcuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheSdcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbkF0dHJpYnV0ZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5jb25maWd1cmF0aW9uQXR0cmlidXRlcycsIFwiSlNPTiBzY2hlbWEgY29uZmlndXJhdGlvbnMgZm9yIHZhbGlkYXRpbmcgXFwnbGF1bmNoLmpzb25cXCcuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy53aGVuJywgXCJDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIGVuYWJsZSB0aGlzIHR5cGUgb2YgZGVidWdnZXIuIENvbnNpZGVyIHVzaW5nICdzaGVsbEV4ZWN1dGlvblN1cHBvcnRlZCcsICd2aXJ0dWFsV29ya3NwYWNlJywgJ3Jlc291cmNlU2NoZW1lJyBvciBhbiBleHRlbnNpb24tZGVmaW5lZCBjb250ZXh0IGtleSBhcyBhcHByb3ByaWF0ZSBmb3IgdGhpcy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJydcblx0XHRcdFx0fSxcblx0XHRcdFx0aGlkZGVuV2hlbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmhpZGRlbldoZW4nLCBcIldoZW4gdGhpcyBjb25kaXRpb24gaXMgdHJ1ZSwgdGhpcyBkZWJ1Z2dlciB0eXBlIGlzIGhpZGRlbiBmcm9tIHRoZSBkZWJ1Z2dlciBsaXN0LCBidXQgaXMgc3RpbGwgZW5hYmxlZC5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVwcmVjYXRlZDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmRlcHJlY2F0ZWQnLCBcIk9wdGlvbmFsIG1lc3NhZ2UgdG8gbWFyayB0aGlzIGRlYnVnIHR5cGUgYXMgYmVpbmcgZGVwcmVjYXRlZC5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJydcblx0XHRcdFx0fSxcblx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLndpbmRvd3MnLCBcIldpbmRvd3Mgc3BlY2lmaWMgc2V0dGluZ3MuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHJ1bnRpbWU6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMud2luZG93cy5ydW50aW1lJywgXCJSdW50aW1lIHVzZWQgZm9yIFdpbmRvd3MuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3N4OiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5kZWJ1Z2dlcnMub3N4JywgXCJtYWNPUyBzcGVjaWZpYyBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cnVudGltZToge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5vc3gucnVudGltZScsIFwiUnVudGltZSB1c2VkIGZvciBtYWNPUy5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLmxpbnV4JywgXCJMaW51eCBzcGVjaWZpYyBzZXR0aW5ncy5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cnVudGltZToge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5saW51eC5ydW50aW1lJywgXCJSdW50aW1lIHVzZWQgZm9yIExpbnV4LlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN0cmluZ3M6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmRlYnVnZ2Vycy5zdHJpbmdzJywgXCJVSSBzdHJpbmdzIGNvbnRyaWJ1dGVkIGJ5IHRoaXMgZGVidWcgYWRhcHRlci5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0dW52ZXJpZmllZEJyZWFrcG9pbnRzOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZGVidWdnZXJzLnN0cmluZ3MudW52ZXJpZmllZEJyZWFrcG9pbnRzJywgXCJXaGVuIHRoZXJlIGFyZSB1bnZlcmlmaWVkIGJyZWFrcG9pbnRzIGluIGEgbGFuZ3VhZ2Ugc3VwcG9ydGVkIGJ5IHRoaXMgZGVidWcgYWRhcHRlciwgdGhpcyBtZXNzYWdlIHdpbGwgYXBwZWFyIG9uIHRoZSBicmVha3BvaW50IGhvdmVyIGFuZCBpbiB0aGUgYnJlYWtwb2ludHMgdmlldy4gTWFya2Rvd24gYW5kIGNvbW1hbmQgbGlua3MgYXJlIHN1cHBvcnRlZC5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuLy8gYnJlYWtwb2ludHMgZXh0ZW5zaW9uIHBvaW50ICM5MDM3XG5leHBvcnQgY29uc3QgYnJlYWtwb2ludHNFeHRQb2ludCA9IGV4dGVuc2lvbnNSZWdpc3RyeS5FeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJQnJlYWtwb2ludENvbnRyaWJ1dGlvbltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnYnJlYWtwb2ludHMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5icmVha3BvaW50cycsICdDb250cmlidXRlcyBicmVha3BvaW50cy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW3sgbGFuZ3VhZ2U6ICcnIH1dIH1dLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBsYW5ndWFnZTogJycgfSB9XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bGFuZ3VhZ2U6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmJyZWFrcG9pbnRzLmxhbmd1YWdlJywgXCJBbGxvdyBicmVha3BvaW50cyBmb3IgdGhpcyBsYW5ndWFnZS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuYnJlYWtwb2ludHMud2hlbicsIFwiQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBlbmFibGUgYnJlYWtwb2ludHMgaW4gdGhpcyBsYW5ndWFnZS4gQ29uc2lkZXIgbWF0Y2hpbmcgdGhpcyB0byB0aGUgZGVidWdnZXIgd2hlbiBjbGF1c2UgYXMgYXBwcm9wcmlhdGUuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG4vLyBkZWJ1ZyBnZW5lcmFsIHNjaGVtYVxuXG5leHBvcnQgY29uc3QgcHJlc2VudGF0aW9uU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ByZXNlbnRhdGlvbicsIFwiUHJlc2VudGF0aW9uIG9wdGlvbnMgb24gaG93IHRvIHNob3cgdGhpcyBjb25maWd1cmF0aW9uIGluIHRoZSBkZWJ1ZyBjb25maWd1cmF0aW9uIGRyb3Bkb3duIGFuZCB0aGUgY29tbWFuZCBwYWxldHRlLlwiKSxcblx0cHJvcGVydGllczoge1xuXHRcdGhpZGRlbjoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwcmVzZW50YXRpb24uaGlkZGVuJywgXCJDb250cm9scyBpZiB0aGlzIGNvbmZpZ3VyYXRpb24gc2hvdWxkIGJlIHNob3duIGluIHRoZSBjb25maWd1cmF0aW9uIGRyb3Bkb3duIGFuZCB0aGUgY29tbWFuZCBwYWxldHRlLlwiKVxuXHRcdH0sXG5cdFx0Z3JvdXA6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwcmVzZW50YXRpb24uZ3JvdXAnLCBcIkdyb3VwIHRoYXQgdGhpcyBjb25maWd1cmF0aW9uIGJlbG9uZ3MgdG8uIFVzZWQgZm9yIGdyb3VwaW5nIGFuZCBzb3J0aW5nIGluIHRoZSBjb25maWd1cmF0aW9uIGRyb3Bkb3duIGFuZCB0aGUgY29tbWFuZCBwYWxldHRlLlwiKVxuXHRcdH0sXG5cdFx0b3JkZXI6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ByZXNlbnRhdGlvbi5vcmRlcicsIFwiT3JkZXIgb2YgdGhpcyBjb25maWd1cmF0aW9uIHdpdGhpbiBhIGdyb3VwLiBVc2VkIGZvciBncm91cGluZyBhbmQgc29ydGluZyBpbiB0aGUgY29uZmlndXJhdGlvbiBkcm9wZG93biBhbmQgdGhlIGNvbW1hbmQgcGFsZXR0ZS5cIilcblx0XHR9XG5cdH0sXG5cdGRlZmF1bHQ6IHtcblx0XHRoaWRkZW46IGZhbHNlLFxuXHRcdGdyb3VwOiAnJyxcblx0XHRvcmRlcjogMVxuXHR9XG59O1xuY29uc3QgZGVmYXVsdENvbXBvdW5kOiBJQ29tcG91bmQgPSB7IG5hbWU6ICdDb21wb3VuZCcsIGNvbmZpZ3VyYXRpb25zOiBbXSB9O1xuZXhwb3J0IGNvbnN0IGxhdW5jaFNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdGlkOiBsYXVuY2hTY2hlbWFJZCxcblx0dHlwZTogJ29iamVjdCcsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi50aXRsZScsIFwiTGF1bmNoXCIpLFxuXHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRhbGxvd0NvbW1lbnRzOiB0cnVlLFxuXHRyZXF1aXJlZDogW10sXG5cdGRlZmF1bHQ6IHsgdmVyc2lvbjogJzAuMi4wJywgY29uZmlndXJhdGlvbnM6IFtdLCBjb21wb3VuZHM6IFtdIH0sXG5cdHByb3BlcnRpZXM6IHtcblx0XHR2ZXJzaW9uOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi52ZXJzaW9uJywgXCJWZXJzaW9uIG9mIHRoaXMgZmlsZSBmb3JtYXQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJzAuMi4wJ1xuXHRcdH0sXG5cdFx0Y29uZmlndXJhdGlvbnM6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhcHAubGF1bmNoLmpzb24uY29uZmlndXJhdGlvbnMnLCBcIkxpc3Qgb2YgY29uZmlndXJhdGlvbnMuIEFkZCBuZXcgY29uZmlndXJhdGlvbnMgb3IgZWRpdCBleGlzdGluZyBvbmVzIGJ5IHVzaW5nIEludGVsbGlTZW5zZS5cIiksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFtdLFxuXHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRvbmVPZjogW11cblx0XHRcdH1cblx0XHR9LFxuXHRcdGNvbXBvdW5kczoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi5jb21wb3VuZHMnLCBcIkxpc3Qgb2YgY29tcG91bmRzLiBFYWNoIGNvbXBvdW5kIHJlZmVyZW5jZXMgbXVsdGlwbGUgY29uZmlndXJhdGlvbnMgd2hpY2ggd2lsbCBnZXQgbGF1bmNoZWQgdG9nZXRoZXIuXCIpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnLCAnY29uZmlndXJhdGlvbnMnXSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXBwLmxhdW5jaC5qc29uLmNvbXBvdW5kLm5hbWUnLCBcIk5hbWUgb2YgY29tcG91bmQuIEFwcGVhcnMgaW4gdGhlIGxhdW5jaCBjb25maWd1cmF0aW9uIGRyb3AgZG93biBtZW51LlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiBwcmVzZW50YXRpb25TY2hlbWEsXG5cdFx0XHRcdFx0Y29uZmlndXJhdGlvbnM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdG9uZU9mOiBbe1xuXHRcdFx0XHRcdFx0XHRcdGVudW06IFtdLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VzZVVuaXF1ZU5hbWVzJywgXCJQbGVhc2UgdXNlIHVuaXF1ZSBjb25maWd1cmF0aW9uIG5hbWVzLlwiKVxuXHRcdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnbmFtZSddLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZW51bTogW10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi5jb21wb3VuZC5uYW1lJywgXCJOYW1lIG9mIGNvbXBvdW5kLiBBcHBlYXJzIGluIHRoZSBsYXVuY2ggY29uZmlndXJhdGlvbiBkcm9wIGRvd24gbWVudS5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRmb2xkZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZW51bTogW10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi5jb21wb3VuZC5mb2xkZXInLCBcIk5hbWUgb2YgZm9sZGVyIGluIHdoaWNoIHRoZSBjb21wb3VuZCBpcyBsb2NhdGVkLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhcHAubGF1bmNoLmpzb24uY29tcG91bmRzLmNvbmZpZ3VyYXRpb25zJywgXCJOYW1lcyBvZiBjb25maWd1cmF0aW9ucyB0aGF0IHdpbGwgYmUgc3RhcnRlZCBhcyBwYXJ0IG9mIHRoaXMgY29tcG91bmQuXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzdG9wQWxsOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FwcC5sYXVuY2guanNvbi5jb21wb3VuZC5zdG9wQWxsJywgXCJDb250cm9scyB3aGV0aGVyIG1hbnVhbGx5IHRlcm1pbmF0aW5nIG9uZSBzZXNzaW9uIHdpbGwgc3RvcCBhbGwgb2YgdGhlIGNvbXBvdW5kIHNlc3Npb25zLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cHJlTGF1bmNoVGFzazoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbXBvdW5kUHJlbGF1bmNoVGFzaycsIFwiVGFzayB0byBydW4gYmVmb3JlIGFueSBvZiB0aGUgY29tcG91bmQgY29uZmlndXJhdGlvbnMgc3RhcnQuXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0Q29tcG91bmRcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiBbXG5cdFx0XHRcdGRlZmF1bHRDb21wb3VuZFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0aW5wdXRzOiBpbnB1dHNTY2hlbWEuZGVmaW5pdGlvbnMhLmlucHV0c1xuXHR9XG59O1xuXG5jbGFzcyBEZWJ1Z2dlcnNEYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5kZWJ1Z2dlcnM7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRyaWIgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uZGVidWdnZXJzIHx8IFtdO1xuXHRcdGlmICghY29udHJpYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRubHMubG9jYWxpemUoJ2RlYnVnZ2VyIG5hbWUnLCBcIk5hbWVcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ2RlYnVnZ2VyIHR5cGUnLCBcIlR5cGVcIiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IGNvbnRyaWIubWFwKGQgPT4ge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0ZC5sYWJlbCA/PyAnJyxcblx0XHRcdFx0ZC50eXBlXG5cdFx0XHRdO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdkZWJ1Z2dlcnMnLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplKCdkZWJ1Z2dlcnMnLCBcIkRlYnVnZ2Vyc1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKERlYnVnZ2Vyc0RhdGFSZW5kZXJlciksXG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSx3QkFBd0I7QUFDcEMsWUFBWSxTQUFTO0FBRXJCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQW1IO0FBRTVILFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBR2xCLE1BQU0sb0JBQW9CLG1CQUFtQixtQkFBbUIsdUJBQWdEO0FBQUEsRUFDdEgsZ0JBQWdCO0FBQUEsRUFDaEIsc0JBQXNCLENBQUMsV0FBVztBQUFBLEVBQ2xDLFlBQVk7QUFBQSxJQUNYLGFBQWEsSUFBSSxTQUFTLDBDQUEwQyw2QkFBNkI7QUFBQSxJQUNqRyxNQUFNO0FBQUEsSUFDTixpQkFBaUIsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzFDLE9BQU87QUFBQSxNQUNOLHNCQUFzQjtBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxFQUFFLE1BQU0sSUFBSSxTQUFTLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztB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
