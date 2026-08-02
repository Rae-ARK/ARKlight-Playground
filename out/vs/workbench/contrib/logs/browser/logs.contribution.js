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
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { OpenWindowSessionLogFileAction } from "../common/logsActions.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { LogsDataCleaner } from "../common/logsDataCleaner.js";
let WebLogOutputChannels = class extends Disposable {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.registerWebContributions();
  }
  registerWebContributions() {
    this.instantiationService.createInstance(LogsDataCleaner);
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: OpenWindowSessionLogFileAction.ID,
          title: OpenWindowSessionLogFileAction.TITLE,
          category: Categories.Developer,
          f1: true
        });
      }
      run(servicesAccessor) {
        return servicesAccessor.get(IInstantiationService).createInstance(OpenWindowSessionLogFileAction, OpenWindowSessionLogFileAction.ID, OpenWindowSessionLogFileAction.TITLE.value).run();
      }
    }));
  }
};
WebLogOutputChannels = __decorateClass([
  __decorateParam(0, IInstantiationService)
], WebLogOutputChannels);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WebLogOutputChannels, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2xvZ3MvYnJvd3Nlci9sb2dzLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBPcGVuV2luZG93U2Vzc2lvbkxvZ0ZpbGVBY3Rpb24gfSBmcm9tICcuLi9jb21tb24vbG9nc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTG9nc0RhdGFDbGVhbmVyIH0gZnJvbSAnLi4vY29tbW9uL2xvZ3NEYXRhQ2xlYW5lci5qcyc7XG5cbmNsYXNzIFdlYkxvZ091dHB1dENoYW5uZWxzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJXZWJDb250cmlidXRpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyV2ViQ29udHJpYnV0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExvZ3NEYXRhQ2xlYW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IE9wZW5XaW5kb3dTZXNzaW9uTG9nRmlsZUFjdGlvbi5JRCxcblx0XHRcdFx0XHR0aXRsZTogT3BlbldpbmRvd1Nlc3Npb25Mb2dGaWxlQWN0aW9uLlRJVExFLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdFx0XHRmMTogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJ1bihzZXJ2aWNlc0FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHJldHVybiBzZXJ2aWNlc0FjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpLmNyZWF0ZUluc3RhbmNlKE9wZW5XaW5kb3dTZXNzaW9uTG9nRmlsZUFjdGlvbiwgT3BlbldpbmRvd1Nlc3Npb25Mb2dGaWxlQWN0aW9uLklELCBPcGVuV2luZG93U2Vzc2lvbkxvZ0ZpbGVBY3Rpb24uVElUTEUudmFsdWUpLnJ1bigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHR9XG5cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFdlYkxvZ091dHB1dENoYW5uZWxzLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBa0UsY0FBYywyQkFBMkI7QUFDM0csU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFFaEMsSUFBTSx1QkFBTixjQUFtQyxXQUE2QztBQUFBLEVBRS9FLFlBQ3lDLHNCQUN2QztBQUNELFVBQU07QUFGa0M7QUFHeEMsU0FBSyx5QkFBeUI7QUFBQSxFQUMvQjtBQUFBLEVBRVEsMkJBQWlDO0FBQ3hDLFNBQUsscUJBQXFCLGVBQWUsZUFBZTtBQUV4RCxTQUFLLFVBQVUsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLE1BQ3BELGNBQWM7QUFDYixjQUFNO0FBQUEsVUFDTCxJQUFJLCtCQUErQjtBQUFBLFVBQ25DLE9BQU8sK0JBQStCO0FBQUEsVUFDdEMsVUFBVSxXQUFXO0FBQUEsVUFDckIsSUFBSTtBQUFBLFFBQ0wsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLElBQUksa0JBQW1EO0FBQ3RELGVBQU8saUJBQWlCLElBQUkscUJBQXFCLEVBQUUsZUFBZSxnQ0FBZ0MsK0JBQStCLElBQUksK0JBQStCLE1BQU0sS0FBSyxFQUFFLElBQUk7QUFBQSxNQUN0TDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFFSDtBQUVEO0FBNUJNLHVCQUFOO0FBQUEsRUFHRztBQUFBLEdBSEc7QUE4Qk4sU0FBUyxHQUFvQyxvQkFBb0IsU0FBUyxFQUFFLDhCQUE4QixzQkFBc0IsZUFBZSxRQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
