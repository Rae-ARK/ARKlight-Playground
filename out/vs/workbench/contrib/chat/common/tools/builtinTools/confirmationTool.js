import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ConfirmationOptionKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ToolDataSource, ToolInvocationPresentation } from "../languageModelToolsService.js";
const ConfirmationToolId = "vscode_get_confirmation";
const ConfirmationToolWithOptionsId = "vscode_get_confirmation_with_options";
const ModifiedFilesConfirmationToolId = "vscode_get_modified_files_confirmation";
const ConfirmationToolData = {
  id: ConfirmationToolId,
  displayName: "Confirmation Tool",
  modelDescription: "A tool that demonstrates different types of confirmations. Takes a title, message, and confirmation type (basic or terminal).",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the confirmation dialog"
      },
      message: {
        type: "string",
        description: "Message to show in the confirmation dialog"
      },
      confirmationType: {
        type: "string",
        enum: ["basic", "terminal"],
        description: "Type of confirmation to show - basic for simple confirmation, terminal for terminal command confirmation"
      },
      terminalCommand: {
        type: "string",
        description: 'Terminal command to show (only used when confirmationType is "terminal")'
      }
    },
    required: ["title", "message", "confirmationType"],
    additionalProperties: false
  }
};
const ConfirmationToolWithOptionsData = {
  id: ConfirmationToolWithOptionsId,
  displayName: "Confirmation Tool with Options",
  modelDescription: "A tool that demonstrates different types of confirmations. Takes a title, message, and buttons.",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the confirmation dialog"
      },
      message: {
        type: "string",
        description: "Message to show in the confirmation dialog"
      },
      buttons: {
        type: "array",
        items: { type: "string" },
        description: "Custom button labels to display."
      }
    },
    required: ["title", "message", "buttons"],
    additionalProperties: false
  }
};
const ModifiedFilesConfirmationToolData = {
  id: ModifiedFilesConfirmationToolId,
  displayName: "Modified Files Confirmation Tool",
  modelDescription: "A tool that shows a modified-files confirmation UI with a split primary button and a hardcoded cancel action.",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the confirmation dialog"
      },
      message: {
        type: "string",
        description: "Message to show in the confirmation dialog"
      },
      options: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description: "Selectable option labels. The first option is used for the primary split button and the remaining options are placed in the dropdown menu."
      },
      modifiedFiles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "URI of the modified file."
            },
            originalUri: {
              type: "string",
              description: "Optional original URI used when opening a diff."
            },
            insertions: {
              type: "number",
              description: "Optional number of lines added."
            },
            deletions: {
              type: "number",
              description: "Optional number of lines removed."
            },
            title: {
              type: "string",
              description: "Optional title shown in the file tooltip."
            },
            description: {
              type: "string",
              description: "Optional secondary label shown for the file entry."
            }
          },
          required: ["uri"],
          additionalProperties: false
        },
        description: "Modified files to show in the confirmation UI."
      }
    },
    required: ["title", "message", "options", "modifiedFiles"],
    additionalProperties: false
  }
};
class ConfirmationTool {
  async prepareToolInvocation(context, token) {
    const parameters = context.parameters;
    if (!parameters.title || !parameters.message) {
      throw new Error("Missing required parameters for ConfirmationTool");
    }
    const confirmationType = parameters.confirmationType ?? "basic";
    let toolSpecificData;
    if (confirmationType === "terminal") {
      toolSpecificData = {
        kind: "terminal",
        commandLine: {
          original: parameters.terminalCommand ?? ""
        },
        language: "bash"
      };
    } else {
      toolSpecificData = void 0;
    }
    return {
      confirmationMessages: {
        title: parameters.title,
        message: new MarkdownString(parameters.message),
        allowAutoConfirm: (parameters.buttons || []).length ? false : true,
        // We cannot auto confirm if there are custom buttons, as we don't know which one to select
        customOptions: parameters.buttons?.map((label, index) => ({
          id: label,
          label,
          kind: index === 0 ? ConfirmationOptionKind.Approve : ConfirmationOptionKind.Deny
        }))
      },
      toolSpecificData,
      presentation: ToolInvocationPresentation.HiddenAfterComplete
    };
  }
  async invoke(invocation, countTokens, progress, token) {
    if (invocation.selectedCustomButton) {
      return {
        content: [{
          kind: "text",
          value: invocation.selectedCustomButton
        }]
      };
    }
    return {
      content: [{
        kind: "text",
        value: "yes"
        // Consumers should check for this label to know whether the tool was confirmed or skipped
      }]
    };
  }
}
class ModifiedFilesConfirmationTool {
  async prepareToolInvocation(context, token) {
    const parameters = context.parameters;
    if (!parameters.title || !parameters.message) {
      throw new Error("Missing required parameters for ModifiedFilesConfirmationTool");
    }
    if (!parameters.options?.length) {
      throw new Error("ModifiedFilesConfirmationTool requires at least one option");
    }
    const toolSpecificData = {
      kind: "modifiedFilesConfirmation",
      options: parameters.options,
      modifiedFiles: parameters.modifiedFiles.map((file) => ({
        uri: URI.parse(file.uri).toJSON(),
        originalUri: file.originalUri ? URI.parse(file.originalUri).toJSON() : void 0,
        insertions: file.insertions,
        deletions: file.deletions,
        title: file.title,
        description: file.description
      }))
    };
    return {
      confirmationMessages: {
        title: parameters.title,
        message: new MarkdownString(parameters.message),
        allowAutoConfirm: false
      },
      toolSpecificData,
      presentation: ToolInvocationPresentation.HiddenAfterComplete
    };
  }
  async invoke(invocation, countTokens, progress, token) {
    if (invocation.selectedCustomButton) {
      return {
        content: [{
          kind: "text",
          value: invocation.selectedCustomButton
        }]
      };
    }
    return {
      content: [{
        kind: "text",
        value: "yes"
        // Consumers should check for this label to know whether the tool was confirmed or skipped
      }]
    };
  }
}
export {
  ConfirmationTool,
  ConfirmationToolData,
  ConfirmationToolId,
  ConfirmationToolWithOptionsData,
  ConfirmationToolWithOptionsId,
  ModifiedFilesConfirmationTool,
  ModifiedFilesConfirmationToolData,
  ModifiedFilesConfirmationToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9jb25maXJtYXRpb25Ub29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29uZmlybWF0aW9uT3B0aW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSwgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB9IGZyb20gJy4uLy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24sIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgQ29uZmlybWF0aW9uVG9vbElkID0gJ3ZzY29kZV9nZXRfY29uZmlybWF0aW9uJztcbmV4cG9ydCBjb25zdCBDb25maXJtYXRpb25Ub29sV2l0aE9wdGlvbnNJZCA9ICd2c2NvZGVfZ2V0X2NvbmZpcm1hdGlvbl93aXRoX29wdGlvbnMnO1xuZXhwb3J0IGNvbnN0IE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25Ub29sSWQgPSAndnNjb2RlX2dldF9tb2RpZmllZF9maWxlc19jb25maXJtYXRpb24nO1xuXG5leHBvcnQgY29uc3QgQ29uZmlybWF0aW9uVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IENvbmZpcm1hdGlvblRvb2xJZCxcblx0ZGlzcGxheU5hbWU6ICdDb25maXJtYXRpb24gVG9vbCcsXG5cdG1vZGVsRGVzY3JpcHRpb246ICdBIHRvb2wgdGhhdCBkZW1vbnN0cmF0ZXMgZGlmZmVyZW50IHR5cGVzIG9mIGNvbmZpcm1hdGlvbnMuIFRha2VzIGEgdGl0bGUsIG1lc3NhZ2UsIGFuZCBjb25maXJtYXRpb24gdHlwZSAoYmFzaWMgb3IgdGVybWluYWwpLicsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGlucHV0U2NoZW1hOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGl0bGUgZm9yIHRoZSBjb25maXJtYXRpb24gZGlhbG9nJ1xuXHRcdFx0fSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWVzc2FnZSB0byBzaG93IGluIHRoZSBjb25maXJtYXRpb24gZGlhbG9nJ1xuXHRcdFx0fSxcblx0XHRcdGNvbmZpcm1hdGlvblR5cGU6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnYmFzaWMnLCAndGVybWluYWwnXSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUeXBlIG9mIGNvbmZpcm1hdGlvbiB0byBzaG93IC0gYmFzaWMgZm9yIHNpbXBsZSBjb25maXJtYXRpb24sIHRlcm1pbmFsIGZvciB0ZXJtaW5hbCBjb21tYW5kIGNvbmZpcm1hdGlvbidcblx0XHRcdH0sXG5cdFx0XHR0ZXJtaW5hbENvbW1hbmQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVybWluYWwgY29tbWFuZCB0byBzaG93IChvbmx5IHVzZWQgd2hlbiBjb25maXJtYXRpb25UeXBlIGlzIFwidGVybWluYWxcIiknXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWyd0aXRsZScsICdtZXNzYWdlJywgJ2NvbmZpcm1hdGlvblR5cGUnXSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IENvbmZpcm1hdGlvblRvb2xXaXRoT3B0aW9uc0RhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6IENvbmZpcm1hdGlvblRvb2xXaXRoT3B0aW9uc0lkLFxuXHRkaXNwbGF5TmFtZTogJ0NvbmZpcm1hdGlvbiBUb29sIHdpdGggT3B0aW9ucycsXG5cdG1vZGVsRGVzY3JpcHRpb246ICdBIHRvb2wgdGhhdCBkZW1vbnN0cmF0ZXMgZGlmZmVyZW50IHR5cGVzIG9mIGNvbmZpcm1hdGlvbnMuIFRha2VzIGEgdGl0bGUsIG1lc3NhZ2UsIGFuZCBidXR0b25zLicsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGlucHV0U2NoZW1hOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGl0bGUgZm9yIHRoZSBjb25maXJtYXRpb24gZGlhbG9nJ1xuXHRcdFx0fSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWVzc2FnZSB0byBzaG93IGluIHRoZSBjb25maXJtYXRpb24gZGlhbG9nJ1xuXHRcdFx0fSxcblx0XHRcdGJ1dHRvbnM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdDdXN0b20gYnV0dG9uIGxhYmVscyB0byBkaXNwbGF5Lidcblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3RpdGxlJywgJ21lc3NhZ2UnLCAnYnV0dG9ucyddLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgTW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uVG9vbElkLFxuXHRkaXNwbGF5TmFtZTogJ01vZGlmaWVkIEZpbGVzIENvbmZpcm1hdGlvbiBUb29sJyxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ0EgdG9vbCB0aGF0IHNob3dzIGEgbW9kaWZpZWQtZmlsZXMgY29uZmlybWF0aW9uIFVJIHdpdGggYSBzcGxpdCBwcmltYXJ5IGJ1dHRvbiBhbmQgYSBoYXJkY29kZWQgY2FuY2VsIGFjdGlvbi4nLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RpdGxlIGZvciB0aGUgY29uZmlybWF0aW9uIGRpYWxvZydcblx0XHRcdH0sXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lc3NhZ2UgdG8gc2hvdyBpbiB0aGUgY29uZmlybWF0aW9uIGRpYWxvZydcblx0XHRcdH0sXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdG1pbkl0ZW1zOiAxLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1NlbGVjdGFibGUgb3B0aW9uIGxhYmVscy4gVGhlIGZpcnN0IG9wdGlvbiBpcyB1c2VkIGZvciB0aGUgcHJpbWFyeSBzcGxpdCBidXR0b24gYW5kIHRoZSByZW1haW5pbmcgb3B0aW9ucyBhcmUgcGxhY2VkIGluIHRoZSBkcm9wZG93biBtZW51Lidcblx0XHRcdH0sXG5cdFx0XHRtb2RpZmllZEZpbGVzOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0dXJpOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1VSSSBvZiB0aGUgbW9kaWZpZWQgZmlsZS4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgb3JpZ2luYWwgVVJJIHVzZWQgd2hlbiBvcGVuaW5nIGEgZGlmZi4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aW5zZXJ0aW9uczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdPcHRpb25hbCBudW1iZXIgb2YgbGluZXMgYWRkZWQuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlbGV0aW9uczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdPcHRpb25hbCBudW1iZXIgb2YgbGluZXMgcmVtb3ZlZC4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgdGl0bGUgc2hvd24gaW4gdGhlIGZpbGUgdG9vbHRpcC4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgc2Vjb25kYXJ5IGxhYmVsIHNob3duIGZvciB0aGUgZmlsZSBlbnRyeS4nXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWyd1cmknXSxcblx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdNb2RpZmllZCBmaWxlcyB0byBzaG93IGluIHRoZSBjb25maXJtYXRpb24gVUkuJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFsndGl0bGUnLCAnbWVzc2FnZScsICdvcHRpb25zJywgJ21vZGlmaWVkRmlsZXMnXSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0fVxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlybWF0aW9uVG9vbFBhcmFtcyB7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdG1lc3NhZ2U6IHN0cmluZztcblx0Y29uZmlybWF0aW9uVHlwZT86ICdiYXNpYycgfCAndGVybWluYWwnO1xuXHR0ZXJtaW5hbENvbW1hbmQ/OiBzdHJpbmc7XG5cdGJ1dHRvbnM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2xQYXJhbXMge1xuXHR0aXRsZTogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdG9wdGlvbnM6IHN0cmluZ1tdO1xuXHRtb2RpZmllZEZpbGVzOiB7XG5cdFx0dXJpOiBzdHJpbmc7XG5cdFx0b3JpZ2luYWxVcmk/OiBzdHJpbmc7XG5cdFx0aW5zZXJ0aW9ucz86IG51bWJlcjtcblx0XHRkZWxldGlvbnM/OiBudW1iZXI7XG5cdFx0dGl0bGU/OiBzdHJpbmc7XG5cdFx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdH1bXTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpcm1hdGlvblRvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJQ29uZmlybWF0aW9uVG9vbFBhcmFtcztcblx0XHRpZiAoIXBhcmFtZXRlcnMudGl0bGUgfHwgIXBhcmFtZXRlcnMubWVzc2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIHBhcmFtZXRlcnMgZm9yIENvbmZpcm1hdGlvblRvb2wnKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maXJtYXRpb25UeXBlID0gcGFyYW1ldGVycy5jb25maXJtYXRpb25UeXBlID8/ICdiYXNpYyc7XG5cblx0XHQvLyBDcmVhdGUgZGlmZmVyZW50IHRvb2wtc3BlY2lmaWMgZGF0YSBiYXNlZCBvbiBjb25maXJtYXRpb24gdHlwZVxuXHRcdGxldCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGNvbmZpcm1hdGlvblR5cGUgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRcdC8vIEZvciB0ZXJtaW5hbCBjb25maXJtYXRpb25zLCB1c2UgdGhlIHRlcm1pbmFsIHRvb2wgZGF0YSBzdHJ1Y3R1cmVcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7XG5cdFx0XHRcdFx0b3JpZ2luYWw6IHBhcmFtZXRlcnMudGVybWluYWxDb21tYW5kID8/ICcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhbmd1YWdlOiAnYmFzaCdcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEZvciBiYXNpYyBjb25maXJtYXRpb25zLCBkb24ndCBzZXQgdG9vbFNwZWNpZmljRGF0YSAtIHRoaXMgd2lsbCB1c2UgdGhlIGRlZmF1bHQgY29uZmlybWF0aW9uIFVJXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHR0aXRsZTogcGFyYW1ldGVycy50aXRsZSxcblx0XHRcdFx0bWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKHBhcmFtZXRlcnMubWVzc2FnZSksXG5cdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IChwYXJhbWV0ZXJzLmJ1dHRvbnMgfHwgW10pLmxlbmd0aCA/IGZhbHNlIDogdHJ1ZSwgLy8gV2UgY2Fubm90IGF1dG8gY29uZmlybSBpZiB0aGVyZSBhcmUgY3VzdG9tIGJ1dHRvbnMsIGFzIHdlIGRvbid0IGtub3cgd2hpY2ggb25lIHRvIHNlbGVjdFxuXHRcdFx0XHRjdXN0b21PcHRpb25zOiBwYXJhbWV0ZXJzLmJ1dHRvbnM/Lm1hcCgobGFiZWwsIGluZGV4KSA9PiAoe1xuXHRcdFx0XHRcdGlkOiBsYWJlbCxcblx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRraW5kOiBpbmRleCA9PT0gMCA/IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuQXBwcm92ZSA6IENvbmZpcm1hdGlvbk9wdGlvbktpbmQuRGVueSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRwcmVzZW50YXRpb246IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGVcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIHByb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHQvLyBJZiBhIGN1c3RvbSBidXR0b24gd2FzIHNlbGVjdGVkLCByZXR1cm4gdGhlIGJ1dHRvbiBsYWJlbFxuXHRcdGlmIChpbnZvY2F0aW9uLnNlbGVjdGVkQ3VzdG9tQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogaW52b2NhdGlvbi5zZWxlY3RlZEN1c3RvbUJ1dHRvblxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBEZWZhdWx0OiByZXR1cm4gJ3llcycgZm9yIHN0YW5kYXJkIEFsbG93IGNvbmZpcm1hdGlvblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdHZhbHVlOiAneWVzJyAvLyBDb25zdW1lcnMgc2hvdWxkIGNoZWNrIGZvciB0aGlzIGxhYmVsIHRvIGtub3cgd2hldGhlciB0aGUgdG9vbCB3YXMgY29uZmlybWVkIG9yIHNraXBwZWRcblx0XHRcdH1dXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJTW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2xQYXJhbXM7XG5cdFx0aWYgKCFwYXJhbWV0ZXJzLnRpdGxlIHx8ICFwYXJhbWV0ZXJzLm1lc3NhZ2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBwYXJhbWV0ZXJzIGZvciBNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uVG9vbCcpO1xuXHRcdH1cblxuXHRcdGlmICghcGFyYW1ldGVycy5vcHRpb25zPy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2wgcmVxdWlyZXMgYXQgbGVhc3Qgb25lIG9wdGlvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGE6IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEgPSB7XG5cdFx0XHRraW5kOiAnbW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbicsXG5cdFx0XHRvcHRpb25zOiBwYXJhbWV0ZXJzLm9wdGlvbnMsXG5cdFx0XHRtb2RpZmllZEZpbGVzOiBwYXJhbWV0ZXJzLm1vZGlmaWVkRmlsZXMubWFwKGZpbGUgPT4gKHtcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoZmlsZS51cmkpLnRvSlNPTigpLFxuXHRcdFx0XHRvcmlnaW5hbFVyaTogZmlsZS5vcmlnaW5hbFVyaSA/IFVSSS5wYXJzZShmaWxlLm9yaWdpbmFsVXJpKS50b0pTT04oKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5zZXJ0aW9uczogZmlsZS5pbnNlcnRpb25zLFxuXHRcdFx0XHRkZWxldGlvbnM6IGZpbGUuZGVsZXRpb25zLFxuXHRcdFx0XHR0aXRsZTogZmlsZS50aXRsZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGZpbGUuZGVzY3JpcHRpb24sXG5cdFx0XHR9KSksXG5cdFx0fTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHR0aXRsZTogcGFyYW1ldGVycy50aXRsZSxcblx0XHRcdFx0bWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKHBhcmFtZXRlcnMubWVzc2FnZSksXG5cdFx0XHRcdGFsbG93QXV0b0NvbmZpcm06IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRwcmVzZW50YXRpb246IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGVcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIHByb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHQvLyBJZiBhIGN1c3RvbSBidXR0b24gd2FzIHNlbGVjdGVkLCByZXR1cm4gdGhlIGJ1dHRvbiBsYWJlbFxuXHRcdGlmIChpbnZvY2F0aW9uLnNlbGVjdGVkQ3VzdG9tQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogaW52b2NhdGlvbi5zZWxlY3RlZEN1c3RvbUJ1dHRvblxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBEZWZhdWx0OiByZXR1cm4gJ3llcycgZm9yIHN0YW5kYXJkIEFsbG93IGNvbmZpcm1hdGlvblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdHZhbHVlOiAneWVzJyAvLyBDb25zdW1lcnMgc2hvdWxkIGNoZWNrIGZvciB0aGlzIGxhYmVsIHRvIGtub3cgd2hldGhlciB0aGUgdG9vbCB3YXMgY29uZmlybWVkIG9yIHNraXBwZWRcblx0XHRcdH1dXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsOEJBQThCO0FBRXZDLFNBQThJLGdCQUFnQixrQ0FBZ0Q7QUFFdk0sTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSxrQ0FBa0M7QUFFeEMsTUFBTSx1QkFBa0M7QUFBQSxFQUM5QyxJQUFJO0FBQUEsRUFDSixhQUFhO0FBQUEsRUFDYixrQkFBa0I7QUFBQSxFQUNsQixRQUFRLGVBQWU7QUFBQSxFQUN2QixhQUFhO0FBQUEsSUFDWixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsTUFDWCxPQUFPO0FBQUEs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
