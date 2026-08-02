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
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import {
  ToolDataSource,
  ToolInvocationPresentation
} from "../languageModelToolsService.js";
import { IChatArtifactsService } from "../chatArtifactsService.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { IChatService } from "../../chatService/chatService.js";
const SetArtifactsToolId = "setArtifacts";
const inputSchema = {
  type: "object",
  properties: {
    artifacts: {
      type: "array",
      description: "The complete list of artifacts for this session. Overwrites any existing artifacts.",
      items: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Display label for the artifact."
          },
          uri: {
            type: "string",
            description: "Fully qualified URI of the artifact (e.g. https://localhost:3000 or file:///path/to/file). Must include the scheme."
          },
          type: {
            type: "string",
            enum: ["devServer", "screenshot", "plan"],
            description: "The type of artifact."
          }
        },
        required: ["label"]
      }
    }
  },
  required: ["artifacts"]
};
const SetArtifactsToolData = {
  id: SetArtifactsToolId,
  toolReferenceName: "artifacts",
  legacyToolReferenceFullNames: ["Set Session Artifacts"],
  displayName: localize("tool.setArtifacts.displayName", "Set Session Artifacts"),
  modelDescription: "Set the list of artifacts for the current session. Each artifact has a label and either a uri or a toolCallId+dataPartIndex reference, plus an optional type (devServer, screenshot, plan). This overwrites the entire artifact list. URIs must be fully qualified with a scheme (e.g. https://localhost:3000, file:///tmp/plan.md). To reference a screenshot or image from a previous tool result, use toolCallId and dataPartIndex instead of uri.\n\nWhen to use this tool:\n- When creating or updating a plan saved to session memory \u2014 set a plan artifact so the user can view it in the artifact panel\n- When taking screenshots or producing visual output \u2014 set a screenshot artifact to surface the image\n- When starting a dev server \u2014 set a devServer artifact with the URL so the user can access it\n- When producing important documents, drafts, or temporary markdown files \u2014 set an artifact to make them easily accessible\n- After verification steps that produce visual results \u2014 update artifacts with screenshots showing the outcome\n\nWorkflow:\n- Prefer artifacts over printing long content inline in chat. Save content to a file or memory, then set an artifact pointing to it.\n- When updating plans or documents, update both the underlying file AND the artifact list.\n- Keep artifact labels concise and descriptive.",
  canBeReferencedInPrompt: true,
  source: ToolDataSource.Internal,
  inputSchema
};
let SetArtifactsTool = class {
  constructor(_chatArtifactsService, _fileService, _chatService) {
    this._chatArtifactsService = _chatArtifactsService;
    this._fileService = _fileService;
    this._chatService = _chatService;
  }
  async prepareToolInvocation(_context, _token) {
    return {
      pastTenseMessage: new MarkdownString(localize("tool.setArtifacts.pastTense", "Updated session artifacts")),
      presentation: ToolInvocationPresentation.Hidden
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const args = invocation.parameters;
    const chatSessionResource = invocation.context?.sessionResource;
    if (!chatSessionResource) {
      return {
        content: [{ kind: "text", value: "Error: No session resource available" }]
      };
    }
    const artifacts = [];
    for (const a of args.artifacts ?? []) {
      let uri = a.uri;
      if (!uri) {
        uri = "";
      }
      if (uri) {
        const parsed = URI.parse(uri);
        if (parsed.scheme !== "http" && parsed.scheme !== "https") {
          if (!await this._fileService.exists(parsed)) {
            throw new Error(localize("tool.setArtifacts.uriNotFound", "Artifact URI does not exist: {0}", uri));
          }
        }
      }
      artifacts.push({ label: a.label, uri, type: a.type });
    }
    const chatArtifacts = this._chatArtifactsService.getArtifacts(chatSessionResource);
    const subAgentInvocationId = invocation.subAgentInvocationId;
    if (subAgentInvocationId) {
      const agentName = this._resolveSubagentName(chatSessionResource, subAgentInvocationId);
      chatArtifacts.setSubagentArtifacts(subAgentInvocationId, agentName, artifacts);
    } else {
      chatArtifacts.setAgentArtifacts(artifacts);
    }
    return {
      content: [{ kind: "text", value: localize("tool.setArtifacts.success", "Set {0} artifact(s)", artifacts.length) }]
    };
  }
  _resolveSubagentName(sessionResource, subAgentInvocationId) {
    const model = this._chatService.getSession(sessionResource);
    if (!model) {
      return void 0;
    }
    for (const request of model.getRequests()) {
      const response = request.response;
      if (!response) {
        continue;
      }
      for (const part of response.response.value) {
        if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolCallId === subAgentInvocationId && part.toolSpecificData?.kind === "subagent") {
          return part.toolSpecificData.agentName;
        }
      }
    }
    return void 0;
  }
};
SetArtifactsTool = __decorateClass([
  __decorateParam(0, IChatArtifactsService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IChatService)
], SetArtifactsTool);
export {
  SetArtifactsTool,
  SetArtifactsToolData,
  SetArtifactsToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9zZXRBcnRpZmFjdHNUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7XG5cdElUb29sRGF0YSxcblx0SVRvb2xJbXBsLFxuXHRJVG9vbEludm9jYXRpb24sXG5cdElUb29sUmVzdWx0LFxuXHRUb29sRGF0YVNvdXJjZSxcblx0SVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LFxuXHRJUHJlcGFyZWRUb29sSW52b2NhdGlvbixcblx0VG9vbEludm9jYXRpb25QcmVzZW50YXRpb25cbn0gZnJvbSAnLi4vbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFydGlmYWN0LCBJQ2hhdEFydGlmYWN0c1NlcnZpY2UgfSBmcm9tICcuLi9jaGF0QXJ0aWZhY3RzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IFNldEFydGlmYWN0c1Rvb2xJZCA9ICdzZXRBcnRpZmFjdHMnO1xuXG5jb25zdCBpbnB1dFNjaGVtYTogSUpTT05TY2hlbWEgJiB7IHByb3BlcnRpZXM6IElKU09OU2NoZW1hTWFwIH0gPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0YXJ0aWZhY3RzOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdUaGUgY29tcGxldGUgbGlzdCBvZiBhcnRpZmFjdHMgZm9yIHRoaXMgc2Vzc2lvbi4gT3ZlcndyaXRlcyBhbnkgZXhpc3RpbmcgYXJ0aWZhY3RzLicsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGxhYmVsOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRGlzcGxheSBsYWJlbCBmb3IgdGhlIGFydGlmYWN0Lidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHVyaToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Z1bGx5IHF1YWxpZmllZCBVUkkgb2YgdGhlIGFydGlmYWN0IChlLmcuIGh0dHBzOi8vbG9jYWxob3N0OjMwMDAgb3IgZmlsZTovLy9wYXRoL3RvL2ZpbGUpLiBNdXN0IGluY2x1ZGUgdGhlIHNjaGVtZS4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0eXBlOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IFsnZGV2U2VydmVyJywgJ3NjcmVlbnNob3QnLCAncGxhbiddLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUgdHlwZSBvZiBhcnRpZmFjdC4nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydsYWJlbCddXG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXHRyZXF1aXJlZDogWydhcnRpZmFjdHMnXVxufTtcblxuZXhwb3J0IGNvbnN0IFNldEFydGlmYWN0c1Rvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBTZXRBcnRpZmFjdHNUb29sSWQsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAnYXJ0aWZhY3RzJyxcblx0bGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydTZXQgU2Vzc2lvbiBBcnRpZmFjdHMnXSxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0b29sLnNldEFydGlmYWN0cy5kaXNwbGF5TmFtZScsICdTZXQgU2Vzc2lvbiBBcnRpZmFjdHMnKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ1NldCB0aGUgbGlzdCBvZiBhcnRpZmFjdHMgZm9yIHRoZSBjdXJyZW50IHNlc3Npb24uIEVhY2ggYXJ0aWZhY3QgaGFzIGEgbGFiZWwgYW5kIGVpdGhlciBhIHVyaSBvciBhIHRvb2xDYWxsSWQrZGF0YVBhcnRJbmRleCByZWZlcmVuY2UsIHBsdXMgYW4gb3B0aW9uYWwgdHlwZSAoZGV2U2VydmVyLCBzY3JlZW5zaG90LCBwbGFuKS4gVGhpcyBvdmVyd3JpdGVzIHRoZSBlbnRpcmUgYXJ0aWZhY3QgbGlzdC4gVVJJcyBtdXN0IGJlIGZ1bGx5IHF1YWxpZmllZCB3aXRoIGEgc2NoZW1lIChlLmcuIGh0dHBzOi8vbG9jYWxob3N0OjMwMDAsIGZpbGU6Ly8vdG1wL3BsYW4ubWQpLiBUbyByZWZlcmVuY2UgYSBzY3JlZW5zaG90IG9yIGltYWdlIGZyb20gYSBwcmV2aW91cyB0b29sIHJlc3VsdCwgdXNlIHRvb2xDYWxsSWQgYW5kIGRhdGFQYXJ0SW5kZXggaW5zdGVhZCBvZiB1cmkuXFxuXFxuV2hlbiB0byB1c2UgdGhpcyB0b29sOlxcbi0gV2hlbiBjcmVhdGluZyBvciB1cGRhdGluZyBhIHBsYW4gc2F2ZWQgdG8gc2Vzc2lvbiBtZW1vcnkgXHUyMDE0IHNldCBhIHBsYW4gYXJ0aWZhY3Qgc28gdGhlIHVzZXIgY2FuIHZpZXcgaXQgaW4gdGhlIGFydGlmYWN0IHBhbmVsXFxuLSBXaGVuIHRha2luZyBzY3JlZW5zaG90cyBvciBwcm9kdWNpbmcgdmlzdWFsIG91dHB1dCBcdTIwMTQgc2V0IGEgc2NyZWVuc2hvdCBhcnRpZmFjdCB0byBzdXJmYWNlIHRoZSBpbWFnZVxcbi0gV2hlbiBzdGFydGluZyBhIGRldiBzZXJ2ZXIgXHUyMDE0IHNldCBhIGRldlNlcnZlciBhcnRpZmFjdCB3aXRoIHRoZSBVUkwgc28gdGhlIHVzZXIgY2FuIGFjY2VzcyBpdFxcbi0gV2hlbiBwcm9kdWNpbmcgaW1wb3J0YW50IGRvY3VtZW50cywgZHJhZnRzLCBvciB0ZW1wb3JhcnkgbWFya2Rvd24gZmlsZXMgXHUyMDE0IHNldCBhbiBhcnRpZmFjdCB0byBtYWtlIHRoZW0gZWFzaWx5IGFjY2Vzc2libGVcXG4tIEFmdGVyIHZlcmlmaWNhdGlvbiBzdGVwcyB0aGF0IHByb2R1Y2UgdmlzdWFsIHJlc3VsdHMgXHUyMDE0IHVwZGF0ZSBhcnRpZmFjdHMgd2l0aCBzY3JlZW5zaG90cyBzaG93aW5nIHRoZSBvdXRjb21lXFxuXFxuV29ya2Zsb3c6XFxuLSBQcmVmZXIgYXJ0aWZhY3RzIG92ZXIgcHJpbnRpbmcgbG9uZyBjb250ZW50IGlubGluZSBpbiBjaGF0LiBTYXZlIGNvbnRlbnQgdG8gYSBmaWxlIG9yIG1lbW9yeSwgdGhlbiBzZXQgYW4gYXJ0aWZhY3QgcG9pbnRpbmcgdG8gaXQuXFxuLSBXaGVuIHVwZGF0aW5nIHBsYW5zIG9yIGRvY3VtZW50cywgdXBkYXRlIGJvdGggdGhlIHVuZGVybHlpbmcgZmlsZSBBTkQgdGhlIGFydGlmYWN0IGxpc3QuXFxuLSBLZWVwIGFydGlmYWN0IGxhYmVscyBjb25jaXNlIGFuZCBkZXNjcmlwdGl2ZS4nLFxuXHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWFcbn07XG5cbmludGVyZmFjZSBJU2V0QXJ0aWZhY3RzVG9vbElucHV0IHtcblx0YXJ0aWZhY3RzOiBJQ2hhdEFydGlmYWN0W107XG59XG5cbmV4cG9ydCBjbGFzcyBTZXRBcnRpZmFjdHNUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRBcnRpZmFjdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBcnRpZmFjdHNTZXJ2aWNlOiBJQ2hhdEFydGlmYWN0c1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oX2NvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCd0b29sLnNldEFydGlmYWN0cy5wYXN0VGVuc2UnLCBcIlVwZGF0ZWQgc2Vzc2lvbiBhcnRpZmFjdHNcIikpLFxuXHRcdFx0cHJlc2VudGF0aW9uOiBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW4sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogbmV2ZXIsIF9wcm9ncmVzczogbmV2ZXIsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgYXJncyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJU2V0QXJ0aWZhY3RzVG9vbElucHV0O1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uUmVzb3VyY2UgPSBpbnZvY2F0aW9uLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRpZiAoIWNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdFcnJvcjogTm8gc2Vzc2lvbiByZXNvdXJjZSBhdmFpbGFibGUnIH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFydGlmYWN0czogSUNoYXRBcnRpZmFjdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBhIG9mIGFyZ3MuYXJ0aWZhY3RzID8/IFtdKSB7XG5cdFx0XHRsZXQgdXJpID0gYS51cmk7XG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHR1cmkgPSAnJztcblx0XHRcdH1cblxuXHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2UodXJpKTtcblx0XHRcdFx0aWYgKHBhcnNlZC5zY2hlbWUgIT09ICdodHRwJyAmJiBwYXJzZWQuc2NoZW1lICE9PSAnaHR0cHMnKSB7XG5cdFx0XHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMocGFyc2VkKSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd0b29sLnNldEFydGlmYWN0cy51cmlOb3RGb3VuZCcsIFwiQXJ0aWZhY3QgVVJJIGRvZXMgbm90IGV4aXN0OiB7MH1cIiwgdXJpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFydGlmYWN0cy5wdXNoKHsgbGFiZWw6IGEubGFiZWwsIHVyaSwgdHlwZTogYS50eXBlIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRBcnRpZmFjdHMgPSB0aGlzLl9jaGF0QXJ0aWZhY3RzU2VydmljZS5nZXRBcnRpZmFjdHMoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc3ViQWdlbnRJbnZvY2F0aW9uSWQgPSBpbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkO1xuXG5cdFx0aWYgKHN1YkFnZW50SW52b2NhdGlvbklkKSB7XG5cdFx0XHRjb25zdCBhZ2VudE5hbWUgPSB0aGlzLl9yZXNvbHZlU3ViYWdlbnROYW1lKGNoYXRTZXNzaW9uUmVzb3VyY2UsIHN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0XHRcdGNoYXRBcnRpZmFjdHMuc2V0U3ViYWdlbnRBcnRpZmFjdHMoc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSwgYXJ0aWZhY3RzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hhdEFydGlmYWN0cy5zZXRBZ2VudEFydGlmYWN0cyhhcnRpZmFjdHMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBsb2NhbGl6ZSgndG9vbC5zZXRBcnRpZmFjdHMuc3VjY2VzcycsIFwiU2V0IHswfSBhcnRpZmFjdChzKVwiLCBhcnRpZmFjdHMubGVuZ3RoKSB9XVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlU3ViYWdlbnROYW1lKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzdWJBZ2VudEludm9jYXRpb25JZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgbW9kZWwuZ2V0UmVxdWVzdHMoKSkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSByZXF1ZXN0LnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiByZXNwb25zZS5yZXNwb25zZS52YWx1ZSkge1xuXHRcdFx0XHRpZiAoKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJlxuXHRcdFx0XHRcdHBhcnQudG9vbENhbGxJZCA9PT0gc3ViQWdlbnRJbnZvY2F0aW9uSWQgJiZcblx0XHRcdFx0XHRwYXJ0LnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydC50b29sU3BlY2lmaWNEYXRhLmFnZW50TmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsV0FBVztBQUNw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
