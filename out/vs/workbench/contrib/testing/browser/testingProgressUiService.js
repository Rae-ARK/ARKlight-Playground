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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AutoOpenTesting, getTestingConfiguration, TestingConfigKeys } from "../common/configuration.js";
import { Testing } from "../common/constants.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { isFailedState } from "../common/testingStates.js";
import { TestResultItemChangeReason } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ExplorerTestCoverageBars } from "./testCoverageBars.js";
let TestingProgressTrigger = class extends Disposable {
  constructor(resultService, testCoverageService, configurationService, viewsService) {
    super();
    this.configurationService = configurationService;
    this.viewsService = viewsService;
    this._register(resultService.onResultsChanged((e) => {
      if ("started" in e) {
        this.attachAutoOpenForNewResults(e.started);
      }
    }));
    const barContributionRegistration = autorun((reader) => {
      const hasCoverage = !!testCoverageService.selected.read(reader);
      if (!hasCoverage) {
        return;
      }
      barContributionRegistration.dispose();
      ExplorerTestCoverageBars.register();
    });
    this._register(barContributionRegistration);
  }
  attachAutoOpenForNewResults(result) {
    if (result.request.preserveFocus === true) {
      return;
    }
    const cfg = getTestingConfiguration(this.configurationService, TestingConfigKeys.OpenResults);
    if (cfg === AutoOpenTesting.NeverOpen) {
      return;
    }
    if (cfg === AutoOpenTesting.OpenExplorerOnTestStart) {
      return this.openExplorerView();
    }
    if (cfg === AutoOpenTesting.OpenOnTestStart) {
      return this.openResultsView();
    }
    const disposable = new DisposableStore();
    disposable.add(result.onComplete(() => disposable.dispose()));
    disposable.add(result.onChange((e) => {
      if (e.reason === TestResultItemChangeReason.OwnStateChange && isFailedState(e.item.ownComputedState)) {
        this.openResultsView();
        disposable.dispose();
      }
    }));
  }
  openExplorerView() {
    this.viewsService.openView(Testing.ExplorerViewId, false);
  }
  openResultsView() {
    this.viewsService.openView(Testing.ResultsViewId, false);
  }
};
TestingProgressTrigger.ID = "workbench.contrib.testing.progressTrigger";
TestingProgressTrigger = __decorateClass([
  __decorateParam(0, ITestResultService),
  __decorateParam(1, ITestCoverageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IViewsService)
], TestingProgressTrigger);
export {
  TestingProgressTrigger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0aW5nUHJvZ3Jlc3NVaVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdXRvT3BlblRlc3RpbmcsIGdldFRlc3RpbmdDb25maWd1cmF0aW9uLCBUZXN0aW5nQ29uZmlnS2V5cyB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RpbmcgfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElUZXN0Q292ZXJhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RDb3ZlcmFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNGYWlsZWRTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nU3RhdGVzLmpzJztcbmltcG9ydCB7IExpdmVUZXN0UmVzdWx0LCBUZXN0UmVzdWx0SXRlbUNoYW5nZVJlYXNvbiB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UmVzdWx0LmpzJztcbmltcG9ydCB7IElUZXN0UmVzdWx0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UmVzdWx0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlclRlc3RDb3ZlcmFnZUJhcnMgfSBmcm9tICcuL3Rlc3RDb3ZlcmFnZUJhcnMuanMnO1xuXG4vKiogV29ya2JlbmNoIGNvbnRyaWJ1dGlvbiB0aGF0IHRyaWdnZXJzIHVwZGF0ZXMgaW4gdGhlIFRlc3RpbmdQcm9ncmVzc1VpIHNlcnZpY2UgKi9cbmV4cG9ydCBjbGFzcyBUZXN0aW5nUHJvZ3Jlc3NUcmlnZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudGVzdGluZy5wcm9ncmVzc1RyaWdnZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVzdFJlc3VsdFNlcnZpY2UgcmVzdWx0U2VydmljZTogSVRlc3RSZXN1bHRTZXJ2aWNlLFxuXHRcdEBJVGVzdENvdmVyYWdlU2VydmljZSB0ZXN0Q292ZXJhZ2VTZXJ2aWNlOiBJVGVzdENvdmVyYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdFNlcnZpY2Uub25SZXN1bHRzQ2hhbmdlZCgoZSkgPT4ge1xuXHRcdFx0aWYgKCdzdGFydGVkJyBpbiBlKSB7XG5cdFx0XHRcdHRoaXMuYXR0YWNoQXV0b09wZW5Gb3JOZXdSZXN1bHRzKGUuc3RhcnRlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYmFyQ29udHJpYnV0aW9uUmVnaXN0cmF0aW9uID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaGFzQ292ZXJhZ2UgPSAhIXRlc3RDb3ZlcmFnZVNlcnZpY2Uuc2VsZWN0ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFoYXNDb3ZlcmFnZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGJhckNvbnRyaWJ1dGlvblJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRFeHBsb3JlclRlc3RDb3ZlcmFnZUJhcnMucmVnaXN0ZXIoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJhckNvbnRyaWJ1dGlvblJlZ2lzdHJhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGF0dGFjaEF1dG9PcGVuRm9yTmV3UmVzdWx0cyhyZXN1bHQ6IExpdmVUZXN0UmVzdWx0KSB7XG5cdFx0aWYgKHJlc3VsdC5yZXF1ZXN0LnByZXNlcnZlRm9jdXMgPT09IHRydWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjZmcgPSBnZXRUZXN0aW5nQ29uZmlndXJhdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0aW5nQ29uZmlnS2V5cy5PcGVuUmVzdWx0cyk7XG5cdFx0aWYgKGNmZyA9PT0gQXV0b09wZW5UZXN0aW5nLk5ldmVyT3Blbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjZmcgPT09IEF1dG9PcGVuVGVzdGluZy5PcGVuRXhwbG9yZXJPblRlc3RTdGFydCkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3BlbkV4cGxvcmVyVmlldygpO1xuXHRcdH1cblxuXHRcdGlmIChjZmcgPT09IEF1dG9PcGVuVGVzdGluZy5PcGVuT25UZXN0U3RhcnQpIHtcblx0XHRcdHJldHVybiB0aGlzLm9wZW5SZXN1bHRzVmlldygpO1xuXHRcdH1cblxuXHRcdC8vIG9wZW4gb24gZmFpbHVyZVxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZS5hZGQocmVzdWx0Lm9uQ29tcGxldGUoKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpKTtcblx0XHRkaXNwb3NhYmxlLmFkZChyZXN1bHQub25DaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5yZWFzb24gPT09IFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uLk93blN0YXRlQ2hhbmdlICYmIGlzRmFpbGVkU3RhdGUoZS5pdGVtLm93bkNvbXB1dGVkU3RhdGUpKSB7XG5cdFx0XHRcdHRoaXMub3BlblJlc3VsdHNWaWV3KCk7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkV4cGxvcmVyVmlldygpIHtcblx0XHR0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyhUZXN0aW5nLkV4cGxvcmVyVmlld0lkLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW5SZXN1bHRzVmlldygpIHtcblx0XHR0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyhUZXN0aW5nLlJlc3VsdHNWaWV3SWQsIGZhbHNlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZUFBZTtBQUN4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFpQix5QkFBeUIseUJBQXlCO0FBQzVFLFNBQVMsZUFBZTtBQUN4QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQUM5QixTQUF5QixrQ0FBa0M7QUFDM0QsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFHbEMsSUFBTSx5QkFBTixjQUFxQyxXQUFXO0FBQUEsRUFHdEQsWUFDcUIsZUFDRSxxQkFDa0Isc0JBQ1IsY0FDL0I7QUFDRCxVQUFNO0FBSGtDO0FBQ1I7QUFJaEMsU0FBSyxVQUFVLGNBQWMsaUJBQWlCLENBQUMsTUFBTTtBQUNwRCxVQUFJLGFBQWEsR0FBRztBQUNuQixhQUFLLDRCQUE0QixFQUFFLE9BQU87QUFBQSxNQUMzQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSw4QkFBOEIsUUFBUSxZQUFVO0FBQ3JELFlBQU0sY0FBYyxDQUFDLENBQUMsb0JBQW9CLFNBQVMsS0FBSyxNQUFNO0FBQzlELFVBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsTUFDRDtBQUVBLGtDQUE0QixRQUFRO0FBQ3BDLCtCQUF5QixTQUFTO0FBQUEsSUFDbkMsQ0FBQztBQUVELFNBQUssVUFBVSwyQkFBMkI7QUFBQSxFQUMzQztBQUFBLEVBRVEsNEJBQTRCLFFBQXdCO0FBQzNELFFBQUksT0FBTyxRQUFRLGtCQUFrQixNQUFNO0FBQzFDO0FBQUEsSUFDRDtBQUVBLFVBQU0sTUFBTSx3QkFBd0IsS0FBSyxzQkFBc0Isa0JBQWtCLFdBQVc7QUFDNUYsUUFBSSxRQUFRLGdCQUFnQixXQUFXO0FBQ3RDO0FBQUEsSUFDRDtBQUVBLFFBQUksUUFBUSxnQkFBZ0IseUJBQXlCO0FBQ3BELGFBQU8sS0FBSyxpQkFBaUI7QUFBQSxJQUM5QjtBQUVBLFFBQUksUUFBUSxnQkFBZ0IsaUJBQWlCO0FBQzVDLGFBQU8sS0FBSyxnQkFBZ0I7QUFBQSxJQUM3QjtBQUdBLFVBQU0sYUFBYSxJQUFJLGdCQUFnQjtBQUN2QyxlQUFXLElBQUksT0FBTyxXQUFXLE1BQU0sV0FBVyxRQUFRLENBQUMsQ0FBQztBQUM1RCxlQUFXLElBQUksT0FBTyxTQUFTLE9BQUs7QUFDbkMsVUFBSSxFQUFFLFdBQVcsMkJBQTJCLGtCQUFrQixjQUFjLEVBQUUsS0FBSyxnQkFBZ0IsR0FBRztBQUNyRyxhQUFLLGdCQUFnQjtBQUNyQixtQkFBVyxRQUFRO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLG1CQUFtQjtBQUMxQixTQUFLLGFBQWEsU0FBUyxRQUFRLGdCQUFnQixLQUFLO0FBQUEsRUFDekQ7QUFBQSxFQUVRLGtCQUFrQjtBQUN6QixTQUFLLGFBQWEsU0FBUyxRQUFRLGVBQWUsS0FBSztBQUFBLEVBQ3hEO0FBQ0Q7QUFsRWEsdUJBQ1csS0FBSztBQURoQix5QkFBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
