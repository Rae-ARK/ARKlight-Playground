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
import "./media/changesSummaryWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, derivedObservableWithCache, derivedOpts } from "../../../../base/common/observable.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { AnimatedCounterWidget } from "../../../../workbench/browser/animatedCounterWidget.js";
let ChangesSummaryWidget = class extends Disposable {
  constructor(changesViewService, _instantiationService) {
    super();
    this._instantiationService = _instantiationService;
    const summaryRawObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const isLoading = changesViewService.activeSessionLoadingObs.read(reader);
      if (isLoading) {
        return lastValue;
      }
      const entries = changesViewService.activeSessionChangesObs.read(reader);
      if (entries.length === 0) {
        return void 0;
      }
      let additions = 0, deletions = 0;
      for (const entry of entries) {
        additions += entry.insertions;
        deletions += entry.deletions;
      }
      return {
        additions,
        deletions,
        files: entries.length
      };
    });
    this._summaryObs = derivedOpts({
      equalsFn: structuralEquals
    }, (reader) => summaryRawObs.read(reader));
  }
  get summary() {
    return this._summaryObs;
  }
  render(container) {
    const element = dom.$("div.changes-summary-widget");
    container.appendChild(element);
    this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
      prefix: "+",
      direction: "topToBottom",
      cssClassName: "changes-summary-lines-added",
      count: derived(this, (reader) => {
        return this._summaryObs.read(reader)?.additions;
      })
    }));
    this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
      prefix: "-",
      direction: "bottomToTop",
      cssClassName: "changes-summary-lines-removed",
      count: derived(this, (reader) => {
        return this._summaryObs.read(reader)?.deletions;
      })
    }));
  }
};
ChangesSummaryWidget = __decorateClass([
  __decorateParam(0, IChangesViewService),
  __decorateParam(1, IInstantiationService)
], ChangesSummaryWidget);
export {
  ChangesSummaryWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhbmdlcy9icm93c2VyL2NoYW5nZXNTdW1tYXJ5V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYW5nZXNTdW1tYXJ5V2lkZ2V0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25DaGFuZ2VzU3VtbWFyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQW5pbWF0ZWRDb3VudGVyV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvYW5pbWF0ZWRDb3VudGVyV2lkZ2V0LmpzJztcblxuZXhwb3J0IGNsYXNzIENoYW5nZXNTdW1tYXJ5V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1bW1hcnlPYnM6IElPYnNlcnZhYmxlPElTZXNzaW9uQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQ+O1xuXHRnZXQgc3VtbWFyeSgpIHsgcmV0dXJuIHRoaXMuX3N1bW1hcnlPYnM7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYW5nZXNWaWV3U2VydmljZSBjaGFuZ2VzVmlld1NlcnZpY2U6IElDaGFuZ2VzVmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeVJhd09icyA9IGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlPElTZXNzaW9uQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3QgaXNMb2FkaW5nID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25Mb2FkaW5nT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpc0xvYWRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RWYWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW50cmllcyA9IGNoYW5nZXNWaWV3U2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoZW50cmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGFkZGl0aW9ucyA9IDAsIGRlbGV0aW9ucyA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0YWRkaXRpb25zICs9IGVudHJ5Lmluc2VydGlvbnM7XG5cdFx0XHRcdGRlbGV0aW9ucyArPSBlbnRyeS5kZWxldGlvbnM7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFkZGl0aW9ucyxcblx0XHRcdFx0ZGVsZXRpb25zLFxuXHRcdFx0XHRmaWxlczogZW50cmllcy5sZW5ndGgsXG5cdFx0XHR9IHNhdGlzZmllcyBJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5O1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc3VtbWFyeU9icyA9IGRlcml2ZWRPcHRzPElTZXNzaW9uQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQ+KHtcblx0XHRcdGVxdWFsc0ZuOiBzdHJ1Y3R1cmFsRXF1YWxzXG5cdFx0fSwgcmVhZGVyID0+IHN1bW1hcnlSYXdPYnMucmVhZChyZWFkZXIpKTtcblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvbS4kKCdkaXYuY2hhbmdlcy1zdW1tYXJ5LXdpZGdldCcpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlbGVtZW50KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFuaW1hdGVkQ291bnRlcldpZGdldCwgZWxlbWVudCwge1xuXHRcdFx0cHJlZml4OiAnKycsXG5cdFx0XHRkaXJlY3Rpb246ICd0b3BUb0JvdHRvbScsXG5cdFx0XHRjc3NDbGFzc05hbWU6ICdjaGFuZ2VzLXN1bW1hcnktbGluZXMtYWRkZWQnLFxuXHRcdFx0Y291bnQ6IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fc3VtbWFyeU9icy5yZWFkKHJlYWRlcik/LmFkZGl0aW9ucztcblx0XHRcdH0pXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQW5pbWF0ZWRDb3VudGVyV2lkZ2V0LCBlbGVtZW50LCB7XG5cdFx0XHRwcmVmaXg6ICctJyxcblx0XHRcdGRpcmVjdGlvbjogJ2JvdHRvbVRvVG9wJyxcblx0XHRcdGNzc0NsYXNzTmFtZTogJ2NoYW5nZXMtc3VtbWFyeS1saW5lcy1yZW1vdmVkJyxcblx0XHRcdGNvdW50OiBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3N1bW1hcnlPYnMucmVhZChyZWFkZXIpPy5kZWxldGlvbnM7XG5cdFx0XHR9KVxuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyw0QkFBNEIsbUJBQWdDO0FBRTlFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBRS9CLElBQU0sdUJBQU4sY0FBbUMsV0FBVztBQUFBLEVBSXBELFlBQ3NCLG9CQUNtQix1QkFDdkM7QUFDRCxVQUFNO0FBRmtDO0FBSXhDLFVBQU0sZ0JBQWdCLDJCQUErRCxNQUFNLENBQUMsUUFBUSxjQUFjO0FBQ2pILFlBQU0sWUFBWSxtQkFBbUIsd0JBQXdCLEtBQUssTUFBTTtBQUN4RSxVQUFJLFdBQVc7QUFDZCxlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sVUFBVSxtQkFBbUIsd0JBQXdCLEtBQUssTUFBTTtBQUN0RSxVQUFJLFFBQVEsV0FBVyxHQUFHO0FBQ3pCLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxZQUFZLEdBQUcsWUFBWTtBQUMvQixpQkFBVyxTQUFTLFNBQVM7QUFDNUIscUJBQWEsTUFBTTtBQUNuQixxQkFBYSxNQUFNO0FBQUEsTUFDcEI7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBLE9BQU8sUUFBUTtBQUFBLE1BQ2hCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxjQUFjLFlBQWdEO0FBQUEsTUFDbEUsVUFBVTtBQUFBLElBQ1gsR0FBRyxZQUFVLGNBQWMsS0FBSyxNQUFNLENBQUM7QUFBQSxFQUN4QztBQUFBLEVBbkNBLElBQUksVUFBVTtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWE7QUFBQSxFQXFDekMsT0FBTyxXQUF3QjtBQUM5QixVQUFNLFVBQVUsSUFBSSxFQUFFLDRCQUE0QjtBQUNsRCxjQUFVLFlBQVksT0FBTztBQUU3QixTQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSx1QkFBdUIsU0FBUztBQUFBLE1BQ3hGLFFBQVE7QUFBQSxNQUNSLFdBQVc7QUFBQSxNQUNYLGNBQWM7QUFBQSxNQUNkLE9BQU8sUUFBUSxNQUFNLENBQUMsV0FBVztBQUNoQyxlQUFPLEtBQUssWUFBWSxLQUFLLE1BQU0sR0FBRztBQUFBLE1BQ3ZDLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLHNCQUFzQixlQUFlLHVCQUF1QixTQUFTO0FBQUEsTUFDeEYsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsY0FBYztBQUFBLE1BQ2QsT0FBTyxRQUFRLE1BQU0sQ0FBQyxXQUFXO0FBQ2hDLGVBQU8sS0FBSyxZQUFZLEtBQUssTUFBTSxHQUFHO0FBQUEsTUFDdkMsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNEO0FBN0RhLHVCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
