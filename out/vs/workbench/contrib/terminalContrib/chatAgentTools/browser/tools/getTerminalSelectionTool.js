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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { ToolDataSource } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalService } from "../../../../terminal/browser/terminal.js";
import { TerminalToolId } from "./toolIds.js";
const GetTerminalSelectionToolData = {
  id: TerminalToolId.TerminalSelection,
  toolReferenceName: "terminalSelection",
  legacyToolReferenceFullNames: ["runCommands/terminalSelection"],
  displayName: localize("terminalSelectionTool.displayName", "Get Terminal Selection"),
  modelDescription: "Get the current selection in the active terminal.",
  source: ToolDataSource.Internal,
  icon: Codicon.terminal
};
let GetTerminalSelectionTool = class extends Disposable {
  constructor(_terminalService) {
    super();
    this._terminalService = _terminalService;
  }
  async prepareToolInvocation(context, token) {
    return {
      invocationMessage: localize("getTerminalSelection.progressive", "Reading terminal selection"),
      pastTenseMessage: localize("getTerminalSelection.past", "Read terminal selection")
    };
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const activeInstance = this._terminalService.activeInstance;
    if (!activeInstance) {
      return {
        content: [{
          kind: "text",
          value: "No active terminal instance found."
        }]
      };
    }
    const selection = activeInstance.selection;
    if (!selection) {
      return {
        content: [{
          kind: "text",
          value: "No text is currently selected in the active terminal."
        }]
      };
    }
    return {
      content: [{
        kind: "text",
        value: `The active terminal's selection:
${selection}`
      }]
    };
  }
};
GetTerminalSelectionTool = __decorateClass([
  __decorateParam(0, ITerminalService)
], GetTerminalSelectionTool);
export {
  GetTerminalSelectionTool,
  GetTerminalSelectionToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2dldFRlcm1pbmFsU2VsZWN0aW9uVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UsIHR5cGUgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIHR5cGUgSVRvb2xEYXRhLCB0eXBlIElUb29sSW1wbCwgdHlwZSBJVG9vbEludm9jYXRpb24sIHR5cGUgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0eXBlIElUb29sUmVzdWx0LCB0eXBlIENvdW50VG9rZW5zQ2FsbGJhY2ssIHR5cGUgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xJZCB9IGZyb20gJy4vdG9vbElkcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBHZXRUZXJtaW5hbFNlbGVjdGlvblRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBUZXJtaW5hbFRvb2xJZC5UZXJtaW5hbFNlbGVjdGlvbixcblx0dG9vbFJlZmVyZW5jZU5hbWU6ICd0ZXJtaW5hbFNlbGVjdGlvbicsXG5cdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsncnVuQ29tbWFuZHMvdGVybWluYWxTZWxlY3Rpb24nXSxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0ZXJtaW5hbFNlbGVjdGlvblRvb2wuZGlzcGxheU5hbWUnLCAnR2V0IFRlcm1pbmFsIFNlbGVjdGlvbicpLFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnR2V0IHRoZSBjdXJyZW50IHNlbGVjdGlvbiBpbiB0aGUgYWN0aXZlIHRlcm1pbmFsLicsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGljb246IENvZGljb24udGVybWluYWwsXG59O1xuXG5leHBvcnQgY2xhc3MgR2V0VGVybWluYWxTZWxlY3Rpb25Ub29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2dldFRlcm1pbmFsU2VsZWN0aW9uLnByb2dyZXNzaXZlJywgXCJSZWFkaW5nIHRlcm1pbmFsIHNlbGVjdGlvblwiKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdnZXRUZXJtaW5hbFNlbGVjdGlvbi5wYXN0JywgXCJSZWFkIHRlcm1pbmFsIHNlbGVjdGlvblwiKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGlmICghYWN0aXZlSW5zdGFuY2UpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiAnTm8gYWN0aXZlIHRlcm1pbmFsIGluc3RhbmNlIGZvdW5kLidcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gYWN0aXZlSW5zdGFuY2Uuc2VsZWN0aW9uO1xuXHRcdGlmICghc2VsZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJ05vIHRleHQgaXMgY3VycmVudGx5IHNlbGVjdGVkIGluIHRoZSBhY3RpdmUgdGVybWluYWwuJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogYFRoZSBhY3RpdmUgdGVybWluYWwncyBzZWxlY3Rpb246XFxuJHtzZWxlY3Rpb259YFxuXHRcdFx0fV1cblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFpTjtBQUMxTixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUV4QixNQUFNLCtCQUEwQztBQUFBLEVBQ3RELElBQUksZUFBZTtBQUFBLEVBQ25CLG1CQUFtQjtBQUFBLEVBQ25CLDhCQUE4QixDQUFDLCtCQUErQjtBQUFBLEVBQzlELGFBQWEsU0FBUyxxQ0FBcUMsd0JBQXdCO0FBQUEsRUFDbkYsa0JBQWtCO0FBQUEsRUFDbEIsUUFBUSxlQUFlO0FBQUEsRUFDdkIsTUFBTSxRQUFRO0FBQ2Y7QUFFTyxJQUFNLDJCQUFOLGNBQXVDLFdBQWdDO0FBQUEsRUFFN0UsWUFDb0Msa0JBQ2xDO0FBQ0QsVUFBTTtBQUY2QjtBQUFBLEVBR3BDO0FBQUEsRUFFQSxNQUFNLHNCQUFzQixTQUE0QyxPQUF3RTtBQUMvSSxXQUFPO0FBQUEsTUFDTixtQkFBbUIsU0FBUyxvQ0FBb0MsNEJBQTRCO0FBQUEsTUFDNUYsa0JBQWtCLFNBQVMsNkJBQTZCLHlCQUF5QjtBQUFBLElBQ2xGO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxPQUFPLFlBQTZCLGNBQW1DLFdBQXlCLE9BQWdEO0FBQ3JKLFVBQU0saUJBQWlCLEtBQUssaUJBQWlCO0FBQzdDLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsYUFBTztBQUFBLFFBQ04sU0FBUyxDQUFDO0FBQUEsVUFDVCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDUixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksZUFBZTtBQUNqQyxRQUFJLENBQUMsV0FBVztBQUNmLGFBQU87QUFBQSxRQUNOLFNBQVMsQ0FBQztBQUFBLFVBQ1QsTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLE1BQ04sU0FBUyxDQUFDO0FBQUEsUUFDVCxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsRUFBcUMsU0FBUztBQUFBLE1BQ3RELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBM0NhLDJCQUFOO0FBQUEsRUFHSjtBQUFBLEdBSFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
