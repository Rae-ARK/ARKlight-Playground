import { OperatingSystem } from "../../../base/common/platform.js";
import { matchesTerminalSandboxCommandRule } from "./terminalSandboxCommandRules.js";
var TerminalSandboxRuntimeConfigurationOperation = /* @__PURE__ */ ((TerminalSandboxRuntimeConfigurationOperation2) => {
  TerminalSandboxRuntimeConfigurationOperation2["GnuPG"] = "gnupg";
  TerminalSandboxRuntimeConfigurationOperation2["Node"] = "node";
  return TerminalSandboxRuntimeConfigurationOperation2;
})(TerminalSandboxRuntimeConfigurationOperation || {});
const terminalSandboxRuntimeConfigurationCommandRules = [
  {
    keywords: ["node", "npm", "npx", "pnpm", "yarn", "corepack", "bun", "deno", "nvm", "volta", "fnm", "asdf", "mise"],
    value: "node" /* Node */
  },
  {
    keywords: ["git"],
    value: "gnupg" /* GnuPG */,
    condition: ({ os }) => os !== OperatingSystem.Windows
  }
];
function getTerminalSandboxRuntimeConfigurationForOperation(operation, os) {
  switch (operation) {
    case "gnupg" /* GnuPG */:
      switch (os) {
        case OperatingSystem.Windows:
          return {};
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return {
            network: {
              allowAllUnixSockets: true
            },
            filesystem: {
              allowRead: [
                "~/.gnupg"
              ],
              allowWrite: [
                "~/.gnupg"
              ]
            }
          };
      }
    case "node" /* Node */:
      switch (os) {
        case OperatingSystem.Windows:
          return {};
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return {
            filesystem: {
              allowWrite: [
                "~/.volta/"
              ]
            }
          };
      }
  }
}
function getTerminalSandboxRuntimeConfigurationForCommands(os, commandDetails) {
  const operations = /* @__PURE__ */ new Set();
  for (const command of commandDetails) {
    for (const rule of terminalSandboxRuntimeConfigurationCommandRules) {
      if (matchesTerminalSandboxCommandRule(command, rule, { os }) && shouldApplyRuntimeConfigurationOperation(rule.value, commandDetails)) {
        operations.add(rule.value);
      }
    }
  }
  const configuration = {};
  for (const operation of operations) {
    mergeAdditionalSandboxConfigProperties(configuration, getTerminalSandboxRuntimeConfigurationForOperation(operation, os));
  }
  return configuration;
}
function shouldApplyRuntimeConfigurationOperation(operation, commandDetails) {
  switch (operation) {
    case "gnupg" /* GnuPG */:
      return commandDetails.every((command) => !command.keyword.toLowerCase().startsWith("docker"));
    case "node" /* Node */:
      return true;
  }
}
function mergeAdditionalSandboxConfigProperties(target, additional) {
  for (const [key, value] of Object.entries(additional)) {
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = value;
      continue;
    }
    const existingValue = target[key];
    if (Array.isArray(existingValue) && Array.isArray(value)) {
      target[key] = [.../* @__PURE__ */ new Set([...existingValue, ...value])];
      continue;
    }
    if (isObjectForSandboxConfigMerge(existingValue) && isObjectForSandboxConfigMerge(value)) {
      mergeAdditionalSandboxConfigProperties(existingValue, value);
    }
  }
}
function isObjectForSandboxConfigMerge(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export {
  TerminalSandboxRuntimeConfigurationOperation,
  getTerminalSandboxRuntimeConfigurationForCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uUGVyT3BlcmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxTYW5kYm94Q29tbWFuZCB9IGZyb20gJy4vdGVybWluYWxTYW5kYm94U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElUZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZSwgbWF0Y2hlc1Rlcm1pbmFsU2FuZGJveENvbW1hbmRSdWxlIH0gZnJvbSAnLi90ZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZXMuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbiB7XG5cdEdudVBHID0gJ2dudXBnJyxcblx0Tm9kZSA9ICdub2RlJyxcbn1cblxuY29uc3QgdGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25Db21tYW5kUnVsZXM6IHJlYWRvbmx5IElUZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZTxUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbj5bXSA9IFtcblx0e1xuXHRcdGtleXdvcmRzOiBbJ25vZGUnLCAnbnBtJywgJ25weCcsICdwbnBtJywgJ3lhcm4nLCAnY29yZXBhY2snLCAnYnVuJywgJ2Rlbm8nLCAnbnZtJywgJ3ZvbHRhJywgJ2ZubScsICdhc2RmJywgJ21pc2UnXSxcblx0XHR2YWx1ZTogVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24uTm9kZSxcblx0fSxcblx0e1xuXHRcdGtleXdvcmRzOiBbJ2dpdCddLFxuXHRcdHZhbHVlOiBUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbi5HbnVQRyxcblx0XHRjb25kaXRpb246ICh7IG9zIH0pID0+IG9zICE9PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyxcblx0fSxcbl07XG5cbmZ1bmN0aW9uIGdldFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uRm9yT3BlcmF0aW9uKG9wZXJhdGlvbjogVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24sIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdHN3aXRjaCAob3BlcmF0aW9uKSB7XG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbi5HbnVQRzpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93czpcblx0XHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG5ldHdvcms6IHtcblx0XHRcdFx0XHRcdFx0YWxsb3dBbGxVbml4U29ja2V0czogdHJ1ZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGZpbGVzeXN0ZW06IHtcblx0XHRcdFx0XHRcdFx0YWxsb3dSZWFkOiBbXG5cdFx0XHRcdFx0XHRcdFx0J34vLmdudXBnJ1xuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRhbGxvd1dyaXRlOiBbXG5cdFx0XHRcdFx0XHRcdFx0J34vLmdudXBnJ1xuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24uTm9kZTpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93czpcblx0XHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZpbGVzeXN0ZW06IHtcblx0XHRcdFx0XHRcdFx0YWxsb3dXcml0ZTogW1xuXHRcdFx0XHRcdFx0XHRcdCd+Ly52b2x0YS8nXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbkZvckNvbW1hbmRzKG9zOiBPcGVyYXRpbmdTeXN0ZW0sIGNvbW1hbmREZXRhaWxzOiByZWFkb25seSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRjb25zdCBvcGVyYXRpb25zID0gbmV3IFNldDxUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbj4oKTtcblx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmREZXRhaWxzKSB7XG5cdFx0Zm9yIChjb25zdCBydWxlIG9mIHRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uQ29tbWFuZFJ1bGVzKSB7XG5cdFx0XHRpZiAobWF0Y2hlc1Rlcm1pbmFsU2FuZGJveENvbW1hbmRSdWxlKGNvbW1hbmQsIHJ1bGUsIHsgb3MgfSkgJiYgc2hvdWxkQXBwbHlSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbihydWxlLnZhbHVlLCBjb21tYW5kRGV0YWlscykpIHtcblx0XHRcdFx0b3BlcmF0aW9ucy5hZGQocnVsZS52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgY29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0Zm9yIChjb25zdCBvcGVyYXRpb24gb2Ygb3BlcmF0aW9ucykge1xuXHRcdG1lcmdlQWRkaXRpb25hbFNhbmRib3hDb25maWdQcm9wZXJ0aWVzKGNvbmZpZ3VyYXRpb24sIGdldFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uRm9yT3BlcmF0aW9uKG9wZXJhdGlvbiwgb3MpKTtcblx0fVxuXHRyZXR1cm4gY29uZmlndXJhdGlvbjtcbn1cblxuZnVuY3Rpb24gc2hvdWxkQXBwbHlSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbihvcGVyYXRpb246IFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uT3BlcmF0aW9uLCBjb21tYW5kRGV0YWlsczogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSk6IGJvb2xlYW4ge1xuXHRzd2l0Y2ggKG9wZXJhdGlvbikge1xuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UnVudGltZUNvbmZpZ3VyYXRpb25PcGVyYXRpb24uR251UEc6XG5cdFx0XHQvLyBEb2NrZXIgc29ja2V0IGFjY2VzcyBjYW4gZ3JhbnQgaG9zdC1sZXZlbCBwcml2aWxlZ2VzLCBzbyBkbyBub3QgYWxsb3cgYWxsIFVuaXhcblx0XHRcdC8vIHNvY2tldHMgd2hlbiBhIERvY2tlci1yZWxhdGVkIGNvbW1hbmQgaXMgcGFydCBvZiB0aGUgc2FuZGJveCBpbnZvY2F0aW9uLlxuXHRcdFx0cmV0dXJuIGNvbW1hbmREZXRhaWxzLmV2ZXJ5KGNvbW1hbmQgPT4gIWNvbW1hbmQua2V5d29yZC50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoJ2RvY2tlcicpKTtcblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJ1bnRpbWVDb25maWd1cmF0aW9uT3BlcmF0aW9uLk5vZGU6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiBtZXJnZUFkZGl0aW9uYWxTYW5kYm94Q29uZmlnUHJvcGVydGllcyh0YXJnZXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBhZGRpdGlvbmFsOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhhZGRpdGlvbmFsKSkge1xuXHRcdGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRhcmdldCwga2V5KSkge1xuXHRcdFx0dGFyZ2V0W2tleV0gPSB2YWx1ZTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nVmFsdWUgPSB0YXJnZXRba2V5XTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShleGlzdGluZ1ZhbHVlKSAmJiBBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0dGFyZ2V0W2tleV0gPSBbLi4ubmV3IFNldChbLi4uZXhpc3RpbmdWYWx1ZSwgLi4udmFsdWVdKV07XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKGlzT2JqZWN0Rm9yU2FuZGJveENvbmZpZ01lcmdlKGV4aXN0aW5nVmFsdWUpICYmIGlzT2JqZWN0Rm9yU2FuZGJveENvbmZpZ01lcmdlKHZhbHVlKSkge1xuXHRcdFx0bWVyZ2VBZGRpdGlvbmFsU2FuZGJveENvbmZpZ1Byb3BlcnRpZXMoZXhpc3RpbmdWYWx1ZSwgdmFsdWUpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBpc09iamVjdEZvclNhbmRib3hDb25maWdNZXJnZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFFaEMsU0FBMkMseUNBQXlDO0FBRTdFLElBQVcsK0NBQVgsa0JBQVdBLGtEQUFYO0FBQ04sRUFBQUEsOENBQUEsV0FBUTtBQUNSLEVBQUFBLDhDQUFBLFVBQU87QUFGVSxTQUFBQTtBQUFBLEdBQUE7QUFLbEIsTUFBTSxrREFBd0k7QUFBQSxFQUM3STtBQUFBLElBQ0MsVUFBVSxDQUFDLFFBQVEsT0FBTyxPQUFPLFFBQVEsUUFBUSxZQUFZLE9BQU8sUUFBUSxPQUFPLFNBQVMsT0FBTyxRQUFRLE1BQU07QUFBQSxJQUNqSCxPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0E7QUFBQSxJQUNDLFVBQVUsQ0FBQyxLQUFLO0FBQUEsSUFDaEIsT0FBTztBQUFBLElBQ1AsV0FBVyxDQUFDLEVBQUUsR0FBRyxNQUFNLE9BQU8sZ0JBQWdCO0FBQUEsRUFDL0M7QUFDRDtBQUVBLFNBQVMsbURBQW1ELFdBQXlELElBQThDO0FBQ2xLLFVBQVEsV0FBVztBQUFBLElBQ2xCLEtBQUs7QUFDSixjQUFRLElBQUk7QUFBQSxRQUNYLEtBQUssZ0JBQWdCO0FBQ3BCLGlCQUFPLENBQUM7QUFBQSxRQUNULEtBQUssZ0JBQWdCO0FBQUEsUUFDckIsS0FBSyxnQkFBZ0I7QUFBQSxRQUNyQjtBQUNDLGlCQUFPO0FBQUEsWUFDTixTQUFTO0FBQUEsY0FDUixxQkFBcUI7QUFBQSxZQUN0QjtBQUFBLFlBQ0EsWUFBWTtBQUFBLGNBQ1gsV0FBVztBQUFBLGdCQUNWO0FBQUEsY0FDRDtBQUFBLGNBQ0EsWUFBWTtBQUFBLGdCQUNYO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsTUFDRjtBQUFBLElBRUQsS0FBSztBQUNKLGNBQVEsSUFBSTtBQUFBLFFBQ1gsS0FBSyxnQkFBZ0I7QUFDcEIsaUJBQU8sQ0FBQztBQUFBLFFBQ1QsS0FBSyxnQkFBZ0I7QUFBQSxRQUNyQixLQUFLLGdCQUFnQjtBQUFBLFFBQ3JCO0FBQ0MsaUJBQU87QUFBQSxZQUNOLFlBQVk7QUFBQSxjQUNYLFlBQVk7QUFBQSxnQkFDWDtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLE1BQ0Y7QUFBQSxFQUNGO0FBQ0Q7QUFFTyxTQUFTLGtEQUFrRCxJQUFxQixnQkFBNkU7QUFDbkssUUFBTSxhQUFhLG9CQUFJLElBQWtEO0FBQ3pFLGFBQVcsV0FBVyxnQkFBZ0I7QUFDckMsZUFBVyxRQUFRLGlEQUFpRDtBQUNuRSxVQUFJLGtDQUFrQyxTQUFTLE1BQU0sRUFBRSxHQUFHLENBQUMsS0FBSyx5Q0FBeUMsS0FBSyxPQUFPLGNBQWMsR0FBRztBQUNySSxtQkFBVyxJQUFJLEtBQUssS0FBSztBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxRQUFNLGdCQUF5QyxDQUFDO0FBQ2hELGFBQVcsYUFBYSxZQUFZO0FBQ25DLDJDQUF1QyxlQUFlLG1EQUFtRCxXQUFXLEVBQUUsQ0FBQztBQUFBLEVBQ3hIO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyx5Q0FBeUMsV0FBeUQsZ0JBQTZEO0FBQ3ZLLFVBQVEsV0FBVztBQUFBLElBQ2xCLEtBQUs7QUFHSixhQUFPLGVBQWUsTUFBTSxhQUFXLENBQUMsUUFBUSxRQUFRLFlBQVksRUFBRSxXQUFXLFFBQVEsQ0FBQztBQUFBLElBQzNGLEtBQUs7QUFDSixhQUFPO0FBQUEsRUFDVDtBQUNEO0FBRUEsU0FBUyx1Q0FBdUMsUUFBaUMsWUFBMkM7QUFDM0gsYUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxVQUFVLEdBQUc7QUFDdEQsUUFBSSxDQUFDLE9BQU8sVUFBVSxlQUFlLEtBQUssUUFBUSxHQUFHLEdBQUc7QUFDdkQsYUFBTyxHQUFHLElBQUk7QUFDZDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGdCQUFnQixPQUFPLEdBQUc7QUFDaEMsUUFBSSxNQUFNLFFBQVEsYUFBYSxLQUFLLE1BQU0sUUFBUSxLQUFLLEdBQUc7QUFDekQsYUFBTyxHQUFHLElBQUksQ0FBQyxHQUFHLG9CQUFJLElBQUksQ0FBQyxHQUFHLGVBQWUsR0FBRyxLQUFLLENBQUMsQ0FBQztBQUN2RDtBQUFBLElBQ0Q7QUFDQSxRQUFJLDhCQUE4QixhQUFhLEtBQUssOEJBQThCLEtBQUssR0FBRztBQUN6Riw2Q0FBdUMsZUFBZSxLQUFLO0FBQUEsSUFDNUQ7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLDhCQUE4QixPQUFrRDtBQUN4RixTQUFPLE9BQU8sVUFBVSxZQUFZLFVBQVUsUUFBUSxDQUFDLE1BQU0sUUFBUSxLQUFLO0FBQzNFOyIsCiAgIm5hbWVzIjogWyJUZXJtaW5hbFNhbmRib3hSdW50aW1lQ29uZmlndXJhdGlvbk9wZXJhdGlvbiJdCn0K
