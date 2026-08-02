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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { InlineChatController } from "./inlineChatController.js";
import { IInlineChatSessionService } from "./inlineChatSessionService.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellUri } from "../../notebook/common/notebookCommon.js";
let InlineChatNotebookContribution = class {
  #store = new DisposableStore();
  constructor(sessionService, notebookEditorService) {
    this.#store.add(sessionService.onWillStartSession((newSessionEditor) => {
      const candidate = CellUri.parse(newSessionEditor.getModel().uri);
      if (!candidate) {
        return;
      }
      for (const notebookEditor of notebookEditorService.listNotebookEditors()) {
        if (isEqual(notebookEditor.textModel?.uri, candidate.notebook)) {
          let found = false;
          const editors = [];
          for (const [, codeEditor] of notebookEditor.codeEditors) {
            editors.push(codeEditor);
            found = codeEditor === newSessionEditor || found;
          }
          if (found) {
            for (const editor of editors) {
              if (editor !== newSessionEditor) {
                InlineChatController.get(editor)?.acceptSession();
              }
            }
            break;
          }
        }
      }
    }));
  }
  dispose() {
    this.#store.dispose();
  }
};
InlineChatNotebookContribution = __decorateClass([
  __decorateParam(0, IInlineChatSessionService),
  __decorateParam(1, INotebookEditorService)
], InlineChatNotebookContribution);
export {
  InlineChatNotebookContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0Tm90ZWJvb2sudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSW5saW5lQ2hhdENvbnRyb2xsZXIgfSBmcm9tICcuL2lubGluZUNoYXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UgfSBmcm9tICcuL2lubGluZUNoYXRTZXNzaW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVDaGF0Tm90ZWJvb2tDb250cmlidXRpb24ge1xuXG5cdHJlYWRvbmx5ICNzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUlubGluZUNoYXRTZXNzaW9uU2VydmljZSBzZXNzaW9uU2VydmljZTogSUlubGluZUNoYXRTZXNzaW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yU2VydmljZSBub3RlYm9va0VkaXRvclNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2UsXG5cdCkge1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKHNlc3Npb25TZXJ2aWNlLm9uV2lsbFN0YXJ0U2Vzc2lvbihuZXdTZXNzaW9uRWRpdG9yID0+IHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IENlbGxVcmkucGFyc2UobmV3U2Vzc2lvbkVkaXRvci5nZXRNb2RlbCgpLnVyaSk7XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IG5vdGVib29rRWRpdG9yIG9mIG5vdGVib29rRWRpdG9yU2VydmljZS5saXN0Tm90ZWJvb2tFZGl0b3JzKCkpIHtcblx0XHRcdFx0aWYgKGlzRXF1YWwobm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsPy51cmksIGNhbmRpZGF0ZS5ub3RlYm9vaykpIHtcblx0XHRcdFx0XHRsZXQgZm91bmQgPSBmYWxzZTtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JzOiBJQ29kZUVkaXRvcltdID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBbLCBjb2RlRWRpdG9yXSBvZiBub3RlYm9va0VkaXRvci5jb2RlRWRpdG9ycykge1xuXHRcdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKGNvZGVFZGl0b3IpO1xuXHRcdFx0XHRcdFx0Zm91bmQgPSBjb2RlRWRpdG9yID09PSBuZXdTZXNzaW9uRWRpdG9yIHx8IGZvdW5kO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZm91bmQpIHtcblx0XHRcdFx0XHRcdC8vIGZvdW5kIHRoZSB0aGlzIGVkaXRvciBpbiB0aGUgb3V0ZXIgbm90ZWJvb2sgZWRpdG9yIC0+IG1ha2Ugc3VyZSB0b1xuXHRcdFx0XHRcdFx0Ly8gY2FuY2VsIGFsbCBzaWJsaW5nIHNlc3Npb25zXG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChlZGl0b3IgIT09IG5ld1Nlc3Npb25FZGl0b3IpIHtcblx0XHRcdFx0XHRcdFx0XHRJbmxpbmVDaGF0Q29udHJvbGxlci5nZXQoZWRpdG9yKT8uYWNjZXB0U2Vzc2lvbigpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuI3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxlQUFlO0FBRWpCLElBQU0saUNBQU4sTUFBcUM7QUFBQSxFQUVsQyxTQUFTLElBQUksZ0JBQWdCO0FBQUEsRUFFdEMsWUFDNEIsZ0JBQ0gsdUJBQ3ZCO0FBRUQsU0FBSyxPQUFPLElBQUksZUFBZSxtQkFBbUIsc0JBQW9CO0FBQ3JFLFlBQU0sWUFBWSxRQUFRLE1BQU0saUJBQWlCLFNBQVMsRUFBRSxHQUFHO0FBQy9ELFVBQUksQ0FBQyxXQUFXO0FBQ2Y7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsa0JBQWtCLHNCQUFzQixvQkFBb0IsR0FBRztBQUN6RSxZQUFJLFFBQVEsZUFBZSxXQUFXLEtBQUssVUFBVSxRQUFRLEdBQUc7QUFDL0QsY0FBSSxRQUFRO0FBQ1osZ0JBQU0sVUFBeUIsQ0FBQztBQUNoQyxxQkFBVyxDQUFDLEVBQUUsVUFBVSxLQUFLLGVBQWUsYUFBYTtBQUN4RCxvQkFBUSxLQUFLLFVBQVU7QUFDdkIsb0JBQVEsZUFBZSxvQkFBb0I7QUFBQSxVQUM1QztBQUNBLGNBQUksT0FBTztBQUdWLHVCQUFXLFVBQVUsU0FBUztBQUM3QixrQkFBSSxXQUFXLGtCQUFrQjtBQUNoQyxxQ0FBcUIsSUFBSSxNQUFNLEdBQUcsY0FBYztBQUFBLGNBQ2pEO0FBQUEsWUFDRDtBQUNBO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssT0FBTyxRQUFRO0FBQUEsRUFDckI7QUFDRDtBQXhDYSxpQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
