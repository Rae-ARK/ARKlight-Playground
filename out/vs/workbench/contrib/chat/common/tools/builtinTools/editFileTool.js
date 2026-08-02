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
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { CellUri } from "../../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
import { ICodeMapperService } from "../../editing/chatCodeMapperService.js";
import { IChatService } from "../../chatService/chatService.js";
import { ToolDataSource, ToolInvocationPresentation } from "../languageModelToolsService.js";
const ExtensionEditToolId = "vscode_editFile";
const InternalEditToolId = "vscode_editFile_internal";
const EditToolData = {
  id: InternalEditToolId,
  displayName: "",
  // not used
  modelDescription: "",
  // Not used
  source: ToolDataSource.Internal
};
let EditTool = class {
  constructor(chatService, codeMapperService, notebookService) {
    this.chatService = chatService;
    this.codeMapperService = codeMapperService;
    this.notebookService = notebookService;
  }
  async invoke(invocation, countTokens, _progress, token) {
    if (!invocation.context) {
      throw new Error("toolInvocationToken is required for this tool");
    }
    const parameters = invocation.parameters;
    const fileUri = URI.revive(parameters.uri);
    const uri = CellUri.parse(fileUri)?.notebook || fileUri;
    const model = this.chatService.getSession(invocation.context.sessionResource);
    const request = model.getRequests().at(-1);
    model.acceptResponseProgress(request, {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    });
    model.acceptResponseProgress(request, {
      kind: "codeblockUri",
      uri,
      isEdit: true
    });
    model.acceptResponseProgress(request, {
      kind: "markdownContent",
      content: new MarkdownString("\n````\n")
    });
    if (this.notebookService.hasSupportedNotebooks(uri) && this.notebookService.getNotebookTextModel(uri)) {
      model.acceptResponseProgress(request, {
        kind: "notebookEdit",
        edits: [],
        uri
      });
    } else {
      model.acceptResponseProgress(request, {
        kind: "textEdit",
        edits: [],
        uri
      });
    }
    const editSession = model.editingSession;
    if (!editSession) {
      throw new Error("This tool must be called from within an editing session");
    }
    const result = await this.codeMapperService.mapCode({
      codeBlocks: [{ code: parameters.code, resource: uri, markdownBeforeBlock: parameters.explanation }],
      location: "tool",
      chatRequestId: invocation.chatRequestId,
      chatRequestModel: invocation.modelId,
      chatSessionResource: invocation.context.sessionResource
    }, {
      textEdit: (target, edits) => {
        model.acceptResponseProgress(request, { kind: "textEdit", uri: target, edits });
      },
      notebookEdit(target, edits) {
        model.acceptResponseProgress(request, { kind: "notebookEdit", uri: target, edits });
      }
    }, token);
    if (this.notebookService.hasSupportedNotebooks(uri) && this.notebookService.getNotebookTextModel(uri)) {
      model.acceptResponseProgress(request, { kind: "notebookEdit", uri, edits: [], done: true });
    } else {
      model.acceptResponseProgress(request, { kind: "textEdit", uri, edits: [], done: true });
    }
    if (result?.errorMessage) {
      throw new Error(result.errorMessage);
    }
    let dispose;
    await new Promise((resolve) => {
      let wasFileBeingModified = false;
      dispose = autorun((r) => {
        const entries = editSession.entries.read(r);
        const currentFile = entries?.find((e) => isEqual(e.modifiedURI, uri));
        if (currentFile) {
          if (currentFile.isCurrentlyBeingModifiedBy.read(r)) {
            wasFileBeingModified = true;
          } else if (wasFileBeingModified) {
            resolve(true);
          }
        }
      });
    }).finally(() => {
      dispose.dispose();
    });
    return {
      content: [{ kind: "text", value: "The file was edited successfully" }]
    };
  }
  async prepareToolInvocation(context, token) {
    return {
      presentation: ToolInvocationPresentation.Hidden
    };
  }
};
EditTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, ICodeMapperService),
  __decorateParam(2, INotebookService)
], EditTool);
export {
  EditTool,
  EditToolData,
  ExtensionEditToolId,
  InternalEditToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9lZGl0RmlsZVRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENlbGxVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVNYXBwZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdGluZy9jaGF0Q29kZU1hcHBlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCBJVG9vbERhdGEsIElUb29sSW1wbCwgSVRvb2xJbnZvY2F0aW9uLCBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBUb29sRGF0YVNvdXJjZSwgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24sIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgRXh0ZW5zaW9uRWRpdFRvb2xJZCA9ICd2c2NvZGVfZWRpdEZpbGUnO1xuZXhwb3J0IGNvbnN0IEludGVybmFsRWRpdFRvb2xJZCA9ICd2c2NvZGVfZWRpdEZpbGVfaW50ZXJuYWwnO1xuZXhwb3J0IGNvbnN0IEVkaXRUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogSW50ZXJuYWxFZGl0VG9vbElkLFxuXHRkaXNwbGF5TmFtZTogJycsIC8vIG5vdCB1c2VkXG5cdG1vZGVsRGVzY3JpcHRpb246ICcnLCAvLyBOb3QgdXNlZFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBFZGl0VG9vbFBhcmFtcyB7XG5cdHVyaTogVXJpQ29tcG9uZW50cztcblx0ZXhwbGFuYXRpb246IHN0cmluZztcblx0Y29kZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRWRpdFRvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ29kZU1hcHBlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlTWFwcGVyU2VydmljZTogSUNvZGVNYXBwZXJTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIGNvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGlmICghaW52b2NhdGlvbi5jb250ZXh0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Rvb2xJbnZvY2F0aW9uVG9rZW4gaXMgcmVxdWlyZWQgZm9yIHRoaXMgdG9vbCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgRWRpdFRvb2xQYXJhbXM7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5yZXZpdmUocGFyYW1ldGVycy51cmkpO1xuXHRcdGNvbnN0IHVyaSA9IENlbGxVcmkucGFyc2UoZmlsZVVyaSk/Lm5vdGVib29rIHx8IGZpbGVVcmk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlKSBhcyBDaGF0TW9kZWw7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpITtcblxuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwge1xuXHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1xcbmBgYGBcXG4nKVxuXHRcdH0pO1xuXHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwge1xuXHRcdFx0a2luZDogJ2NvZGVibG9ja1VyaScsXG5cdFx0XHR1cmksXG5cdFx0XHRpc0VkaXQ6IHRydWVcblx0XHR9KTtcblx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHtcblx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdcXG5gYGBgXFxuJylcblx0XHR9KTtcblx0XHQvLyBTaWduYWwgc3RhcnQuXG5cdFx0aWYgKHRoaXMubm90ZWJvb2tTZXJ2aWNlLmhhc1N1cHBvcnRlZE5vdGVib29rcyh1cmkpICYmICh0aGlzLm5vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbCh1cmkpKSkge1xuXHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7XG5cdFx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0XHRlZGl0czogW10sXG5cdFx0XHRcdHVyaVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwge1xuXHRcdFx0XHRraW5kOiAndGV4dEVkaXQnLFxuXHRcdFx0XHRlZGl0czogW10sXG5cdFx0XHRcdHVyaVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdFNlc3Npb24gPSBtb2RlbC5lZGl0aW5nU2Vzc2lvbjtcblx0XHRpZiAoIWVkaXRTZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgdG9vbCBtdXN0IGJlIGNhbGxlZCBmcm9tIHdpdGhpbiBhbiBlZGl0aW5nIHNlc3Npb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvZGVNYXBwZXJTZXJ2aWNlLm1hcENvZGUoe1xuXHRcdFx0Y29kZUJsb2NrczogW3sgY29kZTogcGFyYW1ldGVycy5jb2RlLCByZXNvdXJjZTogdXJpLCBtYXJrZG93bkJlZm9yZUJsb2NrOiBwYXJhbWV0ZXJzLmV4cGxhbmF0aW9uIH1dLFxuXHRcdFx0bG9jYXRpb246ICd0b29sJyxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6IGludm9jYXRpb24uY2hhdFJlcXVlc3RJZCxcblx0XHRcdGNoYXRSZXF1ZXN0TW9kZWw6IGludm9jYXRpb24ubW9kZWxJZCxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0fSwge1xuXHRcdFx0dGV4dEVkaXQ6ICh0YXJnZXQsIGVkaXRzKSA9PiB7XG5cdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyBraW5kOiAndGV4dEVkaXQnLCB1cmk6IHRhcmdldCwgZWRpdHMgfSk7XG5cdFx0XHR9LFxuXHRcdFx0bm90ZWJvb2tFZGl0KHRhcmdldCwgZWRpdHMpIHtcblx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdub3RlYm9va0VkaXQnLCB1cmk6IHRhcmdldCwgZWRpdHMgfSk7XG5cdFx0XHR9LFxuXHRcdH0sIHRva2VuKTtcblxuXHRcdC8vIFNpZ25hbCBlbmQuXG5cdFx0aWYgKHRoaXMubm90ZWJvb2tTZXJ2aWNlLmhhc1N1cHBvcnRlZE5vdGVib29rcyh1cmkpICYmICh0aGlzLm5vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbCh1cmkpKSkge1xuXHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdub3RlYm9va0VkaXQnLCB1cmksIGVkaXRzOiBbXSwgZG9uZTogdHJ1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICd0ZXh0RWRpdCcsIHVyaSwgZWRpdHM6IFtdLCBkb25lOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQ/LmVycm9yTWVzc2FnZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKHJlc3VsdC5lcnJvck1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGxldCBkaXNwb3NlOiBJRGlzcG9zYWJsZTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xuXHRcdFx0Ly8gVGhlIGZpbGUgd2lsbCBub3QgYmUgbW9kaWZpZWQgdW50aWwgdGhlIGZpcnN0IGVkaXRzIHN0YXJ0IHN0cmVhbWluZyBpbixcblx0XHRcdC8vIHNvIHdhaXQgdW50aWwgd2Ugc2VlIHRoYXQgaXQgX3dhc18gbW9kaWZpZWQgYmVmb3JlIHdhaXRpbmcgZm9yIGl0IHRvIGJlIGRvbmUuXG5cdFx0XHRsZXQgd2FzRmlsZUJlaW5nTW9kaWZpZWQgPSBmYWxzZTtcblxuXHRcdFx0ZGlzcG9zZSA9IGF1dG9ydW4oKHIpID0+IHtcblxuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gZWRpdFNlc3Npb24uZW50cmllcy5yZWFkKHIpO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50RmlsZSA9IGVudHJpZXM/LmZpbmQoKGUpID0+IGlzRXF1YWwoZS5tb2RpZmllZFVSSSwgdXJpKSk7XG5cdFx0XHRcdGlmIChjdXJyZW50RmlsZSkge1xuXHRcdFx0XHRcdGlmIChjdXJyZW50RmlsZS5pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeS5yZWFkKHIpKSB7XG5cdFx0XHRcdFx0XHR3YXNGaWxlQmVpbmdNb2RpZmllZCA9IHRydWU7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh3YXNGaWxlQmVpbmdNb2RpZmllZCkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ1RoZSBmaWxlIHdhcyBlZGl0ZWQgc3VjY2Vzc2Z1bGx5JyB9XVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQThJLGdCQUFnQixrQ0FBZ0Q7QUFFdk0sTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSxl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
