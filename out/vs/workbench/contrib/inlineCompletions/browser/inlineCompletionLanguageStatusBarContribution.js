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
import { createHotClass } from "../../../../base/common/hotReloadHelpers.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorunWithStore, debouncedObservable, derived, observableFromEvent } from "../../../../base/common/observable.js";
import Severity from "../../../../base/common/severity.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { InlineCompletionsController } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { localize } from "../../../../nls.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ILanguageStatusService } from "../../../services/languageStatus/common/languageStatusService.js";
let InlineCompletionLanguageStatusBarContribution = class extends Disposable {
  constructor(_languageStatusService, _editorService, _chatEntitlementService) {
    super();
    this._languageStatusService = _languageStatusService;
    this._editorService = _editorService;
    this._chatEntitlementService = _chatEntitlementService;
    this._activeEditor = observableFromEvent(this, _editorService.onDidActiveEditorChange, () => this._editorService.activeTextEditorControl);
    this._sentiment = this._chatEntitlementService.sentimentObs;
    this._state = derived(this, (reader) => {
      const editor = this._activeEditor.read(reader);
      if (!editor || !isCodeEditor(editor)) {
        return void 0;
      }
      const c = InlineCompletionsController.get(editor);
      const model = c?.model.read(reader);
      if (!model) {
        return void 0;
      }
      return {
        model,
        status: debouncedObservable(model.status, 300)
      };
    });
    this._register(autorunWithStore((reader, store) => {
      const sentiment = this._sentiment.read(reader);
      if (sentiment.hidden) {
        return;
      }
      const state = this._state.read(reader);
      if (!state) {
        return;
      }
      const status = state.status.read(reader);
      const statusMap = {
        loading: { shortLabel: "", label: localize("inlineSuggestionLoading", "Loading..."), loading: true },
        ghostText: { shortLabel: "$(lightbulb)", label: "$(copilot) " + localize("inlineCompletionAvailable", "Inline completion available"), loading: false },
        inlineEdit: { shortLabel: "$(lightbulb-sparkle)", label: "$(copilot) " + localize("inlineEditAvailable", "Inline edit available"), loading: false },
        noSuggestion: { shortLabel: "$(circle-slash)", label: "$(copilot) " + localize("noInlineSuggestionAvailable", "No inline suggestion available"), loading: false }
      };
      store.add(this._languageStatusService.addStatus({
        accessibilityInfo: void 0,
        busy: statusMap[status].loading,
        command: void 0,
        detail: localize("inlineSuggestionsSmall", "Inline suggestions"),
        id: "inlineSuggestions",
        label: { value: statusMap[status].label, shortValue: statusMap[status].shortLabel },
        name: localize("inlineSuggestions", "Inline Suggestions"),
        selector: { pattern: state.model.textModel.uri.fsPath },
        severity: Severity.Info,
        source: "inlineSuggestions"
      }));
    }));
  }
};
InlineCompletionLanguageStatusBarContribution.hot = createHotClass(InlineCompletionLanguageStatusBarContribution);
InlineCompletionLanguageStatusBarContribution.Id = "vs.contrib.inlineCompletionLanguageStatusBarContribution";
InlineCompletionLanguageStatusBarContribution.languageStatusBarDisposables = /* @__PURE__ */ new Set();
InlineCompletionLanguageStatusBarContribution = __decorateClass([
  __decorateParam(0, ILanguageStatusService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IChatEntitlementService)
], InlineCompletionLanguageStatusBarContribution);
export {
  InlineCompletionLanguageStatusBarContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvaW5saW5lQ29tcGxldGlvbkxhbmd1YWdlU3RhdHVzQmFyQ29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlSG90Q2xhc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ob3RSZWxvYWRIZWxwZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuV2l0aFN0b3JlLCBkZWJvdW5jZWRPYnNlcnZhYmxlLCBkZXJpdmVkLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2NvbnRyb2xsZXIvaW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU3RhdHVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xhbmd1YWdlU3RhdHVzL2NvbW1vbi9sYW5ndWFnZVN0YXR1c1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lQ29tcGxldGlvbkxhbmd1YWdlU3RhdHVzQmFyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGhvdCA9IGNyZWF0ZUhvdENsYXNzKHRoaXMpO1xuXG5cdHB1YmxpYyBzdGF0aWMgSWQgPSAndnMuY29udHJpYi5pbmxpbmVDb21wbGV0aW9uTGFuZ3VhZ2VTdGF0dXNCYXJDb250cmlidXRpb24nO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGxhbmd1YWdlU3RhdHVzQmFyRGlzcG9zYWJsZXMgPSBuZXcgU2V0PERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRwcml2YXRlIF9hY3RpdmVFZGl0b3I7XG5cdHByaXZhdGUgX3N0YXRlO1xuXHRwcml2YXRlIF9zZW50aW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZVN0YXR1c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlOiBJTGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblxuXHRcdHRoaXMuX2FjdGl2ZUVkaXRvciA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsICgpID0+IHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRcdHRoaXMuX3NlbnRpbWVudCA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50T2JzO1xuXHRcdHRoaXMuX3N0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fYWN0aXZlRWRpdG9yLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZWRpdG9yIHx8ICFpc0NvZGVFZGl0b3IoZWRpdG9yKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjPy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRzdGF0dXM6IGRlYm91bmNlZE9ic2VydmFibGUobW9kZWwuc3RhdHVzLCAzMDApLFxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdC8vIERvIG5vdCBzaG93IHRoZSBDb3BpbG90IGljb24gaW4gdGhlIGxhbmd1YWdlIHN0YXR1cyB3aGVuIEFJIGZlYXR1cmVzIGFyZSBkaXNhYmxlZFxuXHRcdFx0Y29uc3Qgc2VudGltZW50ID0gdGhpcy5fc2VudGltZW50LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChzZW50aW1lbnQuaGlkZGVuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdHVzID0gc3RhdGUuc3RhdHVzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3Qgc3RhdHVzTWFwOiBSZWNvcmQ8dHlwZW9mIHN0YXR1cywgeyBzaG9ydExhYmVsOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGxvYWRpbmc6IGJvb2xlYW4gfT4gPSB7XG5cdFx0XHRcdGxvYWRpbmc6IHsgc2hvcnRMYWJlbDogJycsIGxhYmVsOiBsb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdGlvbkxvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIiksIGxvYWRpbmc6IHRydWUsIH0sXG5cdFx0XHRcdGdob3N0VGV4dDogeyBzaG9ydExhYmVsOiAnJChsaWdodGJ1bGIpJywgbGFiZWw6ICckKGNvcGlsb3QpICcgKyBsb2NhbGl6ZSgnaW5saW5lQ29tcGxldGlvbkF2YWlsYWJsZScsIFwiSW5saW5lIGNvbXBsZXRpb24gYXZhaWxhYmxlXCIpLCBsb2FkaW5nOiBmYWxzZSwgfSxcblx0XHRcdFx0aW5saW5lRWRpdDogeyBzaG9ydExhYmVsOiAnJChsaWdodGJ1bGItc3BhcmtsZSknLCBsYWJlbDogJyQoY29waWxvdCkgJyArIGxvY2FsaXplKCdpbmxpbmVFZGl0QXZhaWxhYmxlJywgXCJJbmxpbmUgZWRpdCBhdmFpbGFibGVcIiksIGxvYWRpbmc6IGZhbHNlLCB9LFxuXHRcdFx0XHRub1N1Z2dlc3Rpb246IHsgc2hvcnRMYWJlbDogJyQoY2lyY2xlLXNsYXNoKScsIGxhYmVsOiAnJChjb3BpbG90KSAnICsgbG9jYWxpemUoJ25vSW5saW5lU3VnZ2VzdGlvbkF2YWlsYWJsZScsIFwiTm8gaW5saW5lIHN1Z2dlc3Rpb24gYXZhaWxhYmxlXCIpLCBsb2FkaW5nOiBmYWxzZSwgfSxcblx0XHRcdH07XG5cblx0XHRcdHN0b3JlLmFkZCh0aGlzLl9sYW5ndWFnZVN0YXR1c1NlcnZpY2UuYWRkU3RhdHVzKHtcblx0XHRcdFx0YWNjZXNzaWJpbGl0eUluZm86IHVuZGVmaW5lZCxcblx0XHRcdFx0YnVzeTogc3RhdHVzTWFwW3N0YXR1c10ubG9hZGluZyxcblx0XHRcdFx0Y29tbWFuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdpbmxpbmVTdWdnZXN0aW9uc1NtYWxsJywgXCJJbmxpbmUgc3VnZ2VzdGlvbnNcIiksXG5cdFx0XHRcdGlkOiAnaW5saW5lU3VnZ2VzdGlvbnMnLFxuXHRcdFx0XHRsYWJlbDogeyB2YWx1ZTogc3RhdHVzTWFwW3N0YXR1c10ubGFiZWwsIHNob3J0VmFsdWU6IHN0YXR1c01hcFtzdGF0dXNdLnNob3J0TGFiZWwgfSxcblx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2lubGluZVN1Z2dlc3Rpb25zJywgXCJJbmxpbmUgU3VnZ2VzdGlvbnNcIiksXG5cdFx0XHRcdHNlbGVjdG9yOiB7IHBhdHRlcm46IHN0YXRlLm1vZGVsLnRleHRNb2RlbC51cmkuZnNQYXRoIH0sXG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRzb3VyY2U6ICdpbmxpbmVTdWdnZXN0aW9ucycsXG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQW1DO0FBQzVDLFNBQVMsa0JBQWtCLHFCQUFxQixTQUFTLDJCQUEyQjtBQUNwRixPQUFPLGNBQWM7QUFDckIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFFaEMsSUFBTSxnREFBTixjQUE0RCxXQUE2QztBQUFBLEVBVS9HLFlBQzBDLHdCQUNSLGdCQUNTLHlCQUN6QztBQUNELFVBQU07QUFKbUM7QUFDUjtBQUNTO0FBSzFDLFNBQUssZ0JBQWdCLG9CQUFvQixNQUFNLGVBQWUseUJBQXlCLE1BQU0sS0FBSyxlQUFlLHVCQUF1QjtBQUN4SSxTQUFLLGFBQWEsS0FBSyx3QkFBd0I7QUFDL0MsU0FBSyxTQUFTLFFBQVEsTUFBTSxZQUFVO0FBQ3JDLFlBQU0sU0FBUyxLQUFLLGNBQWMsS0FBSyxNQUFNO0FBQzdDLFVBQUksQ0FBQyxVQUFVLENBQUMsYUFBYSxNQUFNLEdBQUc7QUFDckMsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLElBQUksNEJBQTRCLElBQUksTUFBTTtBQUNoRCxZQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssTUFBTTtBQUNsQyxVQUFJLENBQUMsT0FBTztBQUNYLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLFFBQVEsb0JBQW9CLE1BQU0sUUFBUSxHQUFHO0FBQUEsTUFDOUM7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLFVBQVUsaUJBQWlCLENBQUMsUUFBUSxVQUFVO0FBRWxELFlBQU0sWUFBWSxLQUFLLFdBQVcsS0FBSyxNQUFNO0FBQzdDLFVBQUksVUFBVSxRQUFRO0FBQ3JCO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxNQUNEO0FBRUEsWUFBTSxTQUFTLE1BQU0sT0FBTyxLQUFLLE1BQU07QUFFdkMsWUFBTSxZQUE0RjtBQUFBLFFBQ2pHLFNBQVMsRUFBRSxZQUFZLElBQUksT0FBTyxTQUFTLDJCQUEyQixZQUFZLEdBQUcsU0FBUyxLQUFNO0FBQUEsUUFDcEcsV0FBVyxFQUFFLFlBQVksZ0JBQWdCLE9BQU8sZ0JBQWdCLFNBQVMsNkJBQTZCLDZCQUE2QixHQUFHLFNBQVMsTUFBTztBQUFBLFFBQ3RKLFlBQVksRUFBRSxZQUFZLHdCQUF3QixPQUFPLGdCQUFnQixTQUFTLHVCQUF1Qix1QkFBdUIsR0FBRyxTQUFTLE1BQU87QUFBQSxRQUNuSixjQUFjLEVBQUUsWUFBWSxtQkFBbUIsT0FBTyxnQkFBZ0IsU0FBUywrQkFBK0IsZ0NBQWdDLEdBQUcsU0FBUyxNQUFPO0FBQUEsTUFDbEs7QUFFQSxZQUFNLElBQUksS0FBSyx1QkFBdUIsVUFBVTtBQUFBLFFBQy9DLG1CQUFtQjtBQUFBLFFBQ25CLE1BQU0sVUFBVSxNQUFNLEVBQUU7QUFBQSxRQUN4QixTQUFTO0FBQUEsUUFDVCxRQUFRLFNBQVMsMEJBQTBCLG9CQUFvQjtBQUFBLFFBQy9ELElBQUk7QUFBQSxRQUNKLE9BQU8sRUFBRSxPQUFPLFVBQVUsTUFBTSxFQUFFLE9BQU8sWUFBWSxVQUFVLE1BQU0sRUFBRSxXQUFXO0FBQUEsUUFDbEYsTUFBTSxTQUFTLHFCQUFxQixvQkFBb0I7QUFBQSxRQUN4RCxVQUFVLEVBQUUsU0FBUyxNQUFNLE1BQU0sVUFBVSxJQUFJLE9BQU87QUFBQSxRQUN0RCxVQUFVLFNBQVM7QUFBQSxRQUNuQixRQUFRO0FBQUEsTUFDVCxDQUFDLENBQUM7QUFBQSxJQUNILENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQXpFYSw4Q0FDVyxNQUFNLGVBQWUsNkNBQUk7QUFEcEMsOENBR0UsS0FBSztBQUhQLDhDQUlXLCtCQUErQixvQkFBSSxJQUFxQjtBQUpuRSxnREFBTjtBQUFBLEVBV0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBYlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
