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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { REVEAL_IN_EXPLORER_COMMAND_ID } from "../../files/browser/fileConstants.js";
let WorkbenchOpenerContribution = class extends Disposable {
  constructor(openerService, commandService, fileService, workspaceContextService) {
    super();
    this.commandService = commandService;
    this.fileService = fileService;
    this.workspaceContextService = workspaceContextService;
    this._register(openerService.registerOpener(this));
  }
  async open(link, options) {
    try {
      if (options?.openExternal) {
        return false;
      }
      const uri = typeof link === "string" ? URI.parse(link) : link;
      if (this.workspaceContextService.isInsideWorkspace(uri)) {
        if ((await this.fileService.stat(uri)).isDirectory) {
          await this.commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, uri);
          return true;
        }
      }
    } catch {
    }
    return false;
  }
};
WorkbenchOpenerContribution.ID = "workbench.contrib.opener";
WorkbenchOpenerContribution = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IWorkspaceContextService)
], WorkbenchOpenerContribution);
registerWorkbenchContribution2(WorkbenchOpenerContribution.ID, WorkbenchOpenerContribution, WorkbenchPhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL29wZW5lci9icm93c2VyL29wZW5lci5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElPcGVuZXIsIElPcGVuZXJTZXJ2aWNlLCBPcGVuRXh0ZXJuYWxPcHRpb25zLCBPcGVuSW50ZXJuYWxPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFJFVkVBTF9JTl9FWFBMT1JFUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vZmlsZXMvYnJvd3Nlci9maWxlQ29uc3RhbnRzLmpzJztcblxuY2xhc3MgV29ya2JlbmNoT3BlbmVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPcGVuZXIge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm9wZW5lcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob3BlbmVyU2VydmljZS5yZWdpc3Rlck9wZW5lcih0aGlzKSk7XG5cdH1cblxuXHRhc3luYyBvcGVuKGxpbms6IFVSSSB8IHN0cmluZywgb3B0aW9ucz86IE9wZW5JbnRlcm5hbE9wdGlvbnMgfCBPcGVuRXh0ZXJuYWxPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICgob3B0aW9ucyBhcyBPcGVuRXh0ZXJuYWxPcHRpb25zKT8ub3BlbkV4dGVybmFsKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdXJpID0gdHlwZW9mIGxpbmsgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKGxpbmspIDogbGluaztcblx0XHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKHVyaSkpIHtcblx0XHRcdFx0aWYgKChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodXJpKSkuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJFVkVBTF9JTl9FWFBMT1JFUl9DT01NQU5EX0lELCB1cmkpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBub29wXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFdvcmtiZW5jaE9wZW5lckNvbnRyaWJ1dGlvbi5JRCwgV29ya2JlbmNoT3BlbmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQWtCLHNCQUFnRTtBQUNsRixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQyxzQkFBc0I7QUFDL0QsU0FBUyxxQ0FBcUM7QUFFOUMsSUFBTSw4QkFBTixjQUEwQyxXQUE4QjtBQUFBLEVBR3ZFLFlBQ2lCLGVBQ2tCLGdCQUNILGFBQ1kseUJBQzFDO0FBQ0QsVUFBTTtBQUo0QjtBQUNIO0FBQ1k7QUFJM0MsU0FBSyxVQUFVLGNBQWMsZUFBZSxJQUFJLENBQUM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsTUFBTSxLQUFLLE1BQW9CLFNBQXVFO0FBQ3JHLFFBQUk7QUFDSCxVQUFLLFNBQWlDLGNBQWM7QUFDbkQsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLE1BQU0sT0FBTyxTQUFTLFdBQVcsSUFBSSxNQUFNLElBQUksSUFBSTtBQUN6RCxVQUFJLEtBQUssd0JBQXdCLGtCQUFrQixHQUFHLEdBQUc7QUFDeEQsYUFBSyxNQUFNLEtBQUssWUFBWSxLQUFLLEdBQUcsR0FBRyxhQUFhO0FBQ25ELGdCQUFNLEtBQUssZUFBZSxlQUFlLCtCQUErQixHQUFHO0FBQzNFLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUVSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWpDTSw0QkFDa0IsS0FBSztBQUR2Qiw4QkFBTjtBQUFBLEVBSUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBb0NOLCtCQUErQiw0QkFBNEIsSUFBSSw2QkFBNkIsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogW10KfQo=
