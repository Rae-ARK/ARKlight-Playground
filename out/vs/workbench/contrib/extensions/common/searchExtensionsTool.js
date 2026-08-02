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
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { SortBy } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { EXTENSION_CATEGORIES } from "../../../../platform/extensions/common/extensions.js";
import { ToolDataSource } from "../../chat/common/tools/languageModelToolsService.js";
import { ExtensionState, IExtensionsWorkbenchService } from "../common/extensions.js";
const SearchExtensionsToolId = "vscode_searchExtensions_internal";
const SearchExtensionsToolData = {
  id: SearchExtensionsToolId,
  toolReferenceName: "extensions",
  legacyToolReferenceFullNames: ["extensions"],
  icon: ThemeIcon.fromId(Codicon.extensions.id),
  displayName: localize("searchExtensionsTool.displayName", "Search Extensions"),
  modelDescription: "This is a tool for browsing Visual Studio Code Extensions Marketplace. It allows the model to search for extensions and retrieve detailed information about them. The model should use this tool whenever it needs to discover extensions or resolve information about known ones. To use the tool, the model has to provide the category of the extensions, relevant search keywords, or known extension IDs. Note that search results may include false positives, so reviewing and filtering is recommended.",
  userDescription: localize("searchExtensionsTool.userDescription", "Search for VS Code extensions"),
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "The category of extensions to search for",
        enum: EXTENSION_CATEGORIES
      },
      keywords: {
        type: "array",
        items: {
          type: "string"
        },
        description: "The keywords to search for"
      },
      ids: {
        type: "array",
        items: {
          type: "string"
        },
        description: "The ids of the extensions to search for"
      }
    }
  }
};
let SearchExtensionsTool = class {
  constructor(extensionWorkbenchService) {
    this.extensionWorkbenchService = extensionWorkbenchService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const params = invocation.parameters;
    if (!params.keywords?.length && !params.category && !params.ids?.length) {
      return {
        content: [{
          kind: "text",
          value: localize("searchExtensionsTool.noInput", "Please provide a category or keywords or ids to search for.")
        }]
      };
    }
    const extensionsMap = /* @__PURE__ */ new Map();
    const addExtension = (extensions) => {
      for (const extension of extensions) {
        if (extension.deprecationInfo || extension.isMalicious) {
          continue;
        }
        extensionsMap.set(extension.identifier.id.toLowerCase(), {
          id: extension.identifier.id,
          name: extension.displayName,
          description: extension.description,
          installed: extension.state === ExtensionState.Installed,
          installCount: extension.installCount ?? 0,
          rating: extension.rating ?? 0,
          categories: extension.categories ?? [],
          tags: extension.gallery?.tags ?? []
        });
      }
    };
    const queryAndAddExtensions = async (text) => {
      const extensions = await this.extensionWorkbenchService.queryGallery({
        text,
        pageSize: 10,
        sortBy: SortBy.InstallCount
      }, token);
      if (extensions.firstPage.length) {
        addExtension(extensions.firstPage);
      }
    };
    if (params.ids?.length) {
      const extensions = await this.extensionWorkbenchService.getExtensions(params.ids.map((id) => ({ id })), token);
      addExtension(extensions);
    }
    if (params.keywords?.length) {
      for (const keyword of params.keywords ?? []) {
        if (keyword === "featured") {
          await queryAndAddExtensions("featured");
        } else {
          let text = params.category ? `category:"${params.category}"` : "";
          text = keyword ? `${text} ${keyword}`.trim() : text;
          await queryAndAddExtensions(text);
        }
      }
    } else {
      await queryAndAddExtensions(`category:"${params.category}"`);
    }
    const result = Array.from(extensionsMap.values());
    return {
      content: [{
        kind: "text",
        value: `Here are the list of extensions:
${JSON.stringify(result)}
. Important: Use the following format to display extensions to the user because there is a renderer available to parse these extensions in this format and display them with all details. So, do not describe about the extensions to the user.
\`\`\`vscode-extensions
extensionId1,extensionId2
\`\`\`
.`
      }],
      toolResultDetails: {
        input: JSON.stringify(params),
        output: [{ type: "embed", isText: true, value: JSON.stringify(result.map((extension) => extension.id)) }]
      }
    };
  }
};
SearchExtensionsTool = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], SearchExtensionsTool);
export {
  SearchExtensionsTool,
  SearchExtensionsToolData,
  SearchExtensionsToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvY29tbW9uL3NlYXJjaEV4dGVuc2lvbnNUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTb3J0QnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9DQVRFR09SSUVTIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uU3RhdGUsIElFeHRlbnNpb24sIElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcblxuZXhwb3J0IGNvbnN0IFNlYXJjaEV4dGVuc2lvbnNUb29sSWQgPSAndnNjb2RlX3NlYXJjaEV4dGVuc2lvbnNfaW50ZXJuYWwnO1xuXG5leHBvcnQgY29uc3QgU2VhcmNoRXh0ZW5zaW9uc1Rvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBTZWFyY2hFeHRlbnNpb25zVG9vbElkLFxuXHR0b29sUmVmZXJlbmNlTmFtZTogJ2V4dGVuc2lvbnMnLFxuXHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ2V4dGVuc2lvbnMnXSxcblx0aWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmV4dGVuc2lvbnMuaWQpLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3NlYXJjaEV4dGVuc2lvbnNUb29sLmRpc3BsYXlOYW1lJywgJ1NlYXJjaCBFeHRlbnNpb25zJyksXG5cdG1vZGVsRGVzY3JpcHRpb246ICdUaGlzIGlzIGEgdG9vbCBmb3IgYnJvd3NpbmcgVmlzdWFsIFN0dWRpbyBDb2RlIEV4dGVuc2lvbnMgTWFya2V0cGxhY2UuIEl0IGFsbG93cyB0aGUgbW9kZWwgdG8gc2VhcmNoIGZvciBleHRlbnNpb25zIGFuZCByZXRyaWV2ZSBkZXRhaWxlZCBpbmZvcm1hdGlvbiBhYm91dCB0aGVtLiBUaGUgbW9kZWwgc2hvdWxkIHVzZSB0aGlzIHRvb2wgd2hlbmV2ZXIgaXQgbmVlZHMgdG8gZGlzY292ZXIgZXh0ZW5zaW9ucyBvciByZXNvbHZlIGluZm9ybWF0aW9uIGFib3V0IGtub3duIG9uZXMuIFRvIHVzZSB0aGUgdG9vbCwgdGhlIG1vZGVsIGhhcyB0byBwcm92aWRlIHRoZSBjYXRlZ29yeSBvZiB0aGUgZXh0ZW5zaW9ucywgcmVsZXZhbnQgc2VhcmNoIGtleXdvcmRzLCBvciBrbm93biBleHRlbnNpb24gSURzLiBOb3RlIHRoYXQgc2VhcmNoIHJlc3VsdHMgbWF5IGluY2x1ZGUgZmFsc2UgcG9zaXRpdmVzLCBzbyByZXZpZXdpbmcgYW5kIGZpbHRlcmluZyBpcyByZWNvbW1lbmRlZC4nLFxuXHR1c2VyRGVzY3JpcHRpb246IGxvY2FsaXplKCdzZWFyY2hFeHRlbnNpb25zVG9vbC51c2VyRGVzY3JpcHRpb24nLCAnU2VhcmNoIGZvciBWUyBDb2RlIGV4dGVuc2lvbnMnKSxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRjYXRlZ29yeToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUgY2F0ZWdvcnkgb2YgZXh0ZW5zaW9ucyB0byBzZWFyY2ggZm9yJyxcblx0XHRcdFx0ZW51bTogRVhURU5TSU9OX0NBVEVHT1JJRVMsXG5cdFx0XHR9LFxuXHRcdFx0a2V5d29yZHM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUga2V5d29yZHMgdG8gc2VhcmNoIGZvcicsXG5cdFx0XHR9LFxuXHRcdFx0aWRzOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIGlkcyBvZiB0aGUgZXh0ZW5zaW9ucyB0byBzZWFyY2ggZm9yJyxcblx0XHRcdH0sXG5cdFx0fSxcblx0fVxufTtcblxudHlwZSBJbnB1dFBhcmFtcyA9IHtcblx0Y2F0ZWdvcnk/OiBzdHJpbmc7XG5cdGtleXdvcmRzPzogc3RyaW5nO1xuXHRpZHM/OiBzdHJpbmdbXTtcbn07XG5cbnR5cGUgRXh0ZW5zaW9uRGF0YSA9IHtcblx0aWQ6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRpbnN0YWxsZWQ6IGJvb2xlYW47XG5cdGluc3RhbGxDb3VudDogbnVtYmVyO1xuXHRyYXRpbmc6IG51bWJlcjtcblx0Y2F0ZWdvcmllczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHRhZ3M6IHJlYWRvbmx5IHN0cmluZ1tdO1xufTtcblxuZXhwb3J0IGNsYXNzIFNlYXJjaEV4dGVuc2lvbnNUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSW5wdXRQYXJhbXM7XG5cdFx0aWYgKCFwYXJhbXMua2V5d29yZHM/Lmxlbmd0aCAmJiAhcGFyYW1zLmNhdGVnb3J5ICYmICFwYXJhbXMuaWRzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgnc2VhcmNoRXh0ZW5zaW9uc1Rvb2wubm9JbnB1dCcsICdQbGVhc2UgcHJvdmlkZSBhIGNhdGVnb3J5IG9yIGtleXdvcmRzIG9yIGlkcyB0byBzZWFyY2ggZm9yLicpXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbnNNYXAgPSBuZXcgTWFwPHN0cmluZywgRXh0ZW5zaW9uRGF0YT4oKTtcblxuXHRcdGNvbnN0IGFkZEV4dGVuc2lvbiA9IChleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8gfHwgZXh0ZW5zaW9uLmlzTWFsaWNpb3VzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXh0ZW5zaW9uc01hcC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSwge1xuXHRcdFx0XHRcdGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRuYW1lOiBleHRlbnNpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGV4dGVuc2lvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRpbnN0YWxsZWQ6IGV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkLFxuXHRcdFx0XHRcdGluc3RhbGxDb3VudDogZXh0ZW5zaW9uLmluc3RhbGxDb3VudCA/PyAwLFxuXHRcdFx0XHRcdHJhdGluZzogZXh0ZW5zaW9uLnJhdGluZyA/PyAwLFxuXHRcdFx0XHRcdGNhdGVnb3JpZXM6IGV4dGVuc2lvbi5jYXRlZ29yaWVzID8/IFtdLFxuXHRcdFx0XHRcdHRhZ3M6IGV4dGVuc2lvbi5nYWxsZXJ5Py50YWdzID8/IFtdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBxdWVyeUFuZEFkZEV4dGVuc2lvbnMgPSBhc3luYyAodGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5R2FsbGVyeSh7XG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdHBhZ2VTaXplOiAxMCxcblx0XHRcdFx0c29ydEJ5OiBTb3J0QnkuSW5zdGFsbENvdW50XG5cdFx0XHR9LCB0b2tlbik7XG5cdFx0XHRpZiAoZXh0ZW5zaW9ucy5maXJzdFBhZ2UubGVuZ3RoKSB7XG5cdFx0XHRcdGFkZEV4dGVuc2lvbihleHRlbnNpb25zLmZpcnN0UGFnZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFNlYXJjaCBmb3IgZXh0ZW5zaW9ucyBieSB0aGVpciBpZHNcblx0XHRpZiAocGFyYW1zLmlkcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zID0gYXdhaXQgdGhpcy5leHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMocGFyYW1zLmlkcy5tYXAoaWQgPT4gKHsgaWQgfSkpLCB0b2tlbik7XG5cdFx0XHRhZGRFeHRlbnNpb24oZXh0ZW5zaW9ucyk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcmFtcy5rZXl3b3Jkcz8ubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleXdvcmQgb2YgcGFyYW1zLmtleXdvcmRzID8/IFtdKSB7XG5cdFx0XHRcdGlmIChrZXl3b3JkID09PSAnZmVhdHVyZWQnKSB7XG5cdFx0XHRcdFx0YXdhaXQgcXVlcnlBbmRBZGRFeHRlbnNpb25zKCdmZWF0dXJlZCcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxldCB0ZXh0ID0gcGFyYW1zLmNhdGVnb3J5ID8gYGNhdGVnb3J5OlwiJHtwYXJhbXMuY2F0ZWdvcnl9XCJgIDogJyc7XG5cdFx0XHRcdFx0dGV4dCA9IGtleXdvcmQgPyBgJHt0ZXh0fSAke2tleXdvcmR9YC50cmltKCkgOiB0ZXh0O1xuXHRcdFx0XHRcdGF3YWl0IHF1ZXJ5QW5kQWRkRXh0ZW5zaW9ucyh0ZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCBxdWVyeUFuZEFkZEV4dGVuc2lvbnMoYGNhdGVnb3J5OlwiJHtwYXJhbXMuY2F0ZWdvcnl9XCJgKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKGV4dGVuc2lvbnNNYXAudmFsdWVzKCkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0dmFsdWU6IGBIZXJlIGFyZSB0aGUgbGlzdCBvZiBleHRlbnNpb25zOlxcbiR7SlNPTi5zdHJpbmdpZnkocmVzdWx0KX1cXG4uIEltcG9ydGFudDogVXNlIHRoZSBmb2xsb3dpbmcgZm9ybWF0IHRvIGRpc3BsYXkgZXh0ZW5zaW9ucyB0byB0aGUgdXNlciBiZWNhdXNlIHRoZXJlIGlzIGEgcmVuZGVyZXIgYXZhaWxhYmxlIHRvIHBhcnNlIHRoZXNlIGV4dGVuc2lvbnMgaW4gdGhpcyBmb3JtYXQgYW5kIGRpc3BsYXkgdGhlbSB3aXRoIGFsbCBkZXRhaWxzLiBTbywgZG8gbm90IGRlc2NyaWJlIGFib3V0IHRoZSBleHRlbnNpb25zIHRvIHRoZSB1c2VyLlxcblxcYFxcYFxcYHZzY29kZS1leHRlbnNpb25zXFxuZXh0ZW5zaW9uSWQxLGV4dGVuc2lvbklkMlxcblxcYFxcYFxcYFxcbi5gXG5cdFx0XHR9XSxcblx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiB7XG5cdFx0XHRcdGlucHV0OiBKU09OLnN0cmluZ2lmeShwYXJhbXMpLFxuXHRcdFx0XHRvdXRwdXQ6IFt7IHR5cGU6ICdlbWJlZCcsIGlzVGV4dDogdHJ1ZSwgdmFsdWU6IEpTT04uc3RyaW5naWZ5KHJlc3VsdC5tYXAoZXh0ZW5zaW9uID0+IGV4dGVuc2lvbi5pZCkpIH1dXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQWtGLHNCQUFvQztBQUN0SCxTQUFTLGdCQUE0QixtQ0FBbUM7QUFFakUsTUFBTSx5QkFBeUI7QUFFL0IsTUFBTSwyQkFBc0M7QUFBQSxFQUNsRCxJQUFJO0FBQUEsRUFDSixtQkFBbUI7QUFBQSxFQUNuQiw4QkFBOEIsQ0FBQyxZQUFZO0FBQUEsRUFDM0MsTUFBTSxVQUFVLE9BQU8sUUFBUSxXQUFXLEVBQUU7QUFBQSxFQUM1QyxhQUFhLFNBQVMsb0NBQW9DLG1CQUFtQjtBQUFBLEVBQzdFLGtCQUFrQjtBQUFBLEVBQ2xCLGlCQUFpQixTQUFTLHdDQUF3QywrQkFBK0I7QUFBQSxFQUNqRyxRQUFRLGVBQWU7QUFBQSxFQUN2QixhQUFhO0FBQUEsSUFDWixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsTUFDWCxVQUFVO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxLQUFLO0FBQUEsUUFDSixNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0EsYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FB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
