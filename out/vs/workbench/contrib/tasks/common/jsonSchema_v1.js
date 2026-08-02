import * as nls from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import { ProblemMatcherRegistry } from "./problemMatcher.js";
import commonSchema from "./jsonSchemaCommon.js";
const schema = {
  oneOf: [
    {
      allOf: [
        {
          type: "object",
          required: ["version"],
          properties: {
            version: {
              type: "string",
              enum: ["0.1.0"],
              deprecationMessage: nls.localize("JsonSchema.version.deprecated", "Task version 0.1.0 is deprecated. Please use 2.0.0"),
              description: nls.localize("JsonSchema.version", "The config's version number")
            },
            _runner: {
              deprecationMessage: nls.localize("JsonSchema._runner", "The runner has graduated. Use the official runner property")
            },
            runner: {
              type: "string",
              enum: ["process", "terminal"],
              default: "process",
              description: nls.localize("JsonSchema.runner", "Defines whether the task is executed as a process and the output is shown in the output window or inside the terminal.")
            },
            windows: {
              $ref: "#/definitions/taskRunnerConfiguration",
              description: nls.localize("JsonSchema.windows", "Windows specific command configuration")
            },
            osx: {
              $ref: "#/definitions/taskRunnerConfiguration",
              description: nls.localize("JsonSchema.mac", "Mac specific command configuration")
            },
            linux: {
              $ref: "#/definitions/taskRunnerConfiguration",
              description: nls.localize("JsonSchema.linux", "Linux specific command configuration")
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
const shellCommand = {
  type: "boolean",
  default: true,
  description: nls.localize("JsonSchema.shell", "Specifies whether the command is a shell command or an external program. Defaults to false if omitted.")
};
schema.definitions = Objects.deepClone(commonSchema.definitions);
const definitions = schema.definitions;
definitions["commandConfiguration"]["properties"]["isShellCommand"] = Objects.deepClone(shellCommand);
definitions["taskDescription"]["properties"]["isShellCommand"] = Objects.deepClone(shellCommand);
definitions["taskRunnerConfiguration"]["properties"]["isShellCommand"] = Objects.deepClone(shellCommand);
Object.getOwnPropertyNames(definitions).forEach((key) => {
  const newKey = key + "1";
  definitions[newKey] = definitions[key];
  delete definitions[key];
});
function fixReferences(literal) {
  if (Array.isArray(literal)) {
    literal.forEach((element) => {
      if (typeof element === "object" && element !== null) {
        fixReferences(element);
      }
    });
  } else if (typeof literal === "object") {
    if (literal["$ref"]) {
      literal["$ref"] = literal["$ref"] + "1";
    }
    Object.getOwnPropertyNames(literal).forEach((property) => {
      const value = literal[property];
      if (Array.isArray(value) || typeof value === "object") {
        fixReferences(value);
      }
    });
  }
}
fixReferences(schema);
ProblemMatcherRegistry.onReady().then(() => {
  try {
    const matcherIds = ProblemMatcherRegistry.keys().map((key) => "$" + key);
    definitions.problemMatcherType1.oneOf[0].enum = matcherIds;
    definitions.problemMatcherType1.oneOf[2].items.anyOf[1].enum = matcherIds;
  } catch (err) {
    console.log("Installing problem matcher ids failed");
  }
});
var jsonSchema_v1_default = schema;
export {
  jsonSchema_v1_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi9qc29uU2NoZW1hX3YxLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcblxuaW1wb3J0IHsgUHJvYmxlbU1hdGNoZXJSZWdpc3RyeSB9IGZyb20gJy4vcHJvYmxlbU1hdGNoZXIuanMnO1xuXG5pbXBvcnQgY29tbW9uU2NoZW1hIGZyb20gJy4vanNvblNjaGVtYUNvbW1vbi5qcyc7XG5cbmNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdG9uZU9mOiBbXG5cdFx0e1xuXHRcdFx0YWxsT2Y6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3ZlcnNpb24nXSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRlbnVtOiBbJzAuMS4wJ10sXG5cdFx0XHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnZlcnNpb24uZGVwcmVjYXRlZCcsICdUYXNrIHZlcnNpb24gMC4xLjAgaXMgZGVwcmVjYXRlZC4gUGxlYXNlIHVzZSAyLjAuMCcpLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnZlcnNpb24nLCAnVGhlIGNvbmZpZ1xcJ3MgdmVyc2lvbiBudW1iZXInKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF9ydW5uZXI6IHtcblx0XHRcdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuX3J1bm5lcicsICdUaGUgcnVubmVyIGhhcyBncmFkdWF0ZWQuIFVzZSB0aGUgb2ZmaWNpYWwgcnVubmVyIHByb3BlcnR5Jylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRydW5uZXI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGVudW06IFsncHJvY2VzcycsICd0ZXJtaW5hbCddLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAncHJvY2VzcycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEucnVubmVyJywgJ0RlZmluZXMgd2hldGhlciB0aGUgdGFzayBpcyBleGVjdXRlZCBhcyBhIHByb2Nlc3MgYW5kIHRoZSBvdXRwdXQgaXMgc2hvd24gaW4gdGhlIG91dHB1dCB3aW5kb3cgb3IgaW5zaWRlIHRoZSB0ZXJtaW5hbC4nKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHdpbmRvd3M6IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvdGFza1J1bm5lckNvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLndpbmRvd3MnLCAnV2luZG93cyBzcGVjaWZpYyBjb21tYW5kIGNvbmZpZ3VyYXRpb24nKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG9zeDoge1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy90YXNrUnVubmVyQ29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEubWFjJywgJ01hYyBzcGVjaWZpYyBjb21tYW5kIGNvbmZpZ3VyYXRpb24nKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Rhc2tSdW5uZXJDb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5saW51eCcsICdMaW51eCBzcGVjaWZpYyBjb21tYW5kIGNvbmZpZ3VyYXRpb24nKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Rhc2tSdW5uZXJDb25maWd1cmF0aW9uJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHRdXG59O1xuXG5jb25zdCBzaGVsbENvbW1hbmQ6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnYm9vbGVhbicsXG5cdGRlZmF1bHQ6IHRydWUsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuc2hlbGwnLCAnU3BlY2lmaWVzIHdoZXRoZXIgdGhlIGNvbW1hbmQgaXMgYSBzaGVsbCBjb21tYW5kIG9yIGFuIGV4dGVybmFsIHByb2dyYW0uIERlZmF1bHRzIHRvIGZhbHNlIGlmIG9taXR0ZWQuJylcbn07XG5cbnNjaGVtYS5kZWZpbml0aW9ucyA9IE9iamVjdHMuZGVlcENsb25lKGNvbW1vblNjaGVtYS5kZWZpbml0aW9ucyk7XG5jb25zdCBkZWZpbml0aW9ucyA9IHNjaGVtYS5kZWZpbml0aW9ucyE7XG5kZWZpbml0aW9uc1snY29tbWFuZENvbmZpZ3VyYXRpb24nXVsncHJvcGVydGllcyddIVsnaXNTaGVsbENvbW1hbmQnXSA9IE9iamVjdHMuZGVlcENsb25lKHNoZWxsQ29tbWFuZCk7XG5kZWZpbml0aW9uc1sndGFza0Rlc2NyaXB0aW9uJ11bJ3Byb3BlcnRpZXMnXSFbJ2lzU2hlbGxDb21tYW5kJ10gPSBPYmplY3RzLmRlZXBDbG9uZShzaGVsbENvbW1hbmQpO1xuZGVmaW5pdGlvbnNbJ3Rhc2tSdW5uZXJDb25maWd1cmF0aW9uJ11bJ3Byb3BlcnRpZXMnXSFbJ2lzU2hlbGxDb21tYW5kJ10gPSBPYmplY3RzLmRlZXBDbG9uZShzaGVsbENvbW1hbmQpO1xuXG5PYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhkZWZpbml0aW9ucykuZm9yRWFjaChrZXkgPT4ge1xuXHRjb25zdCBuZXdLZXkgPSBrZXkgKyAnMSc7XG5cdGRlZmluaXRpb25zW25ld0tleV0gPSBkZWZpbml0aW9uc1trZXldO1xuXHRkZWxldGUgZGVmaW5pdGlvbnNba2V5XTtcbn0pO1xuXG5mdW5jdGlvbiBmaXhSZWZlcmVuY2VzKGxpdGVyYWw6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5rbm93bltdKSB7XG5cdGlmIChBcnJheS5pc0FycmF5KGxpdGVyYWwpKSB7XG5cdFx0bGl0ZXJhbC5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBlbGVtZW50ID09PSAnb2JqZWN0JyAmJiBlbGVtZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdGZpeFJlZmVyZW5jZXMoZWxlbWVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0gZWxzZSBpZiAodHlwZW9mIGxpdGVyYWwgPT09ICdvYmplY3QnKSB7XG5cdFx0aWYgKGxpdGVyYWxbJyRyZWYnXSkge1xuXHRcdFx0bGl0ZXJhbFsnJHJlZiddID0gbGl0ZXJhbFsnJHJlZiddICsgJzEnO1xuXHRcdH1cblx0XHRPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyhsaXRlcmFsKS5mb3JFYWNoKHByb3BlcnR5ID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gbGl0ZXJhbFtwcm9wZXJ0eV07XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkgfHwgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRmaXhSZWZlcmVuY2VzKHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuZml4UmVmZXJlbmNlcyhzY2hlbWEgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cblByb2JsZW1NYXRjaGVyUmVnaXN0cnkub25SZWFkeSgpLnRoZW4oKCkgPT4ge1xuXHR0cnkge1xuXHRcdGNvbnN0IG1hdGNoZXJJZHMgPSBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmtleXMoKS5tYXAoa2V5ID0+ICckJyArIGtleSk7XG5cdFx0ZGVmaW5pdGlvbnMucHJvYmxlbU1hdGNoZXJUeXBlMS5vbmVPZiFbMF0uZW51bSA9IG1hdGNoZXJJZHM7XG5cdFx0KGRlZmluaXRpb25zLnByb2JsZW1NYXRjaGVyVHlwZTEub25lT2YhWzJdLml0ZW1zIGFzIElKU09OU2NoZW1hKS5hbnlPZiFbMV0uZW51bSA9IG1hdGNoZXJJZHM7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGNvbnNvbGUubG9nKCdJbnN0YWxsaW5nIHByb2JsZW0gbWF0Y2hlciBp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
