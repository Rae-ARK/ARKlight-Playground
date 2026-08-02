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
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { PickerQuickAccessProvider } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, SELECT_AND_START_ID } from "./debugCommands.js";
import { IDebugService, REPL_VIEW_ID } from "../common/debug.js";
let DebugConsoleQuickAccess = class extends PickerQuickAccessProvider {
  constructor(_debugService, _viewsService, _commandService) {
    super(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true });
    this._debugService = _debugService;
    this._viewsService = _viewsService;
    this._commandService = _commandService;
  }
  _getPicks(filter, disposables, token) {
    const debugConsolePicks = [];
    this._debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl()).forEach((session, index) => {
      const pick = this._createPick(session, index, filter);
      if (pick) {
        debugConsolePicks.push(pick);
      }
    });
    if (debugConsolePicks.length > 0) {
      debugConsolePicks.push({ type: "separator" });
    }
    const createTerminalLabel = localize("workbench.action.debug.startDebug", "Start a New Debug Session");
    debugConsolePicks.push({
      label: `$(plus) ${createTerminalLabel}`,
      ariaLabel: createTerminalLabel,
      accept: () => this._commandService.executeCommand(SELECT_AND_START_ID)
    });
    return debugConsolePicks;
  }
  _createPick(session, sessionIndex, filter) {
    const label = session.name;
    const highlights = matchesFuzzy(filter, label, true);
    if (highlights) {
      return {
        label,
        highlights: { label: highlights },
        accept: (keyMod, event) => {
          this._debugService.focusStackFrame(void 0, void 0, session, { explicit: true });
          if (!this._viewsService.isViewVisible(REPL_VIEW_ID)) {
            this._viewsService.openView(REPL_VIEW_ID, true);
          }
        }
      };
    }
    return void 0;
  }
};
DebugConsoleQuickAccess = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IViewsService),
  __decorateParam(2, ICommandService)
], DebugConsoleQuickAccess);
export {
  DebugConsoleQuickAccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdDb25zb2xlUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbWF0Y2hlc0Z1enp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEZhc3RBbmRTbG93UGlja3MsIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXIsIFBpY2tzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERFQlVHX0NPTlNPTEVfUVVJQ0tfQUNDRVNTX1BSRUZJWCwgU0VMRUNUX0FORF9TVEFSVF9JRCB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBSRVBMX1ZJRVdfSUQgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVidWdDb25zb2xlUXVpY2tBY2Nlc3MgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoREVCVUdfQ09OU09MRV9RVUlDS19BQ0NFU1NfUFJFRklYLCB7IGNhbkFjY2VwdEluQmFja2dyb3VuZDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFBpY2tzPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHwgUHJvbWlzZTxQaWNrczxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPj4gfCBGYXN0QW5kU2xvd1BpY2tzPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHwgbnVsbCB7XG5cdFx0Y29uc3QgZGVidWdDb25zb2xlUGlja3M6IEFycmF5PElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IFtdO1xuXG5cdFx0dGhpcy5fZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnModHJ1ZSkuZmlsdGVyKHMgPT4gcy5oYXNTZXBhcmF0ZVJlcGwoKSkuZm9yRWFjaCgoc2Vzc2lvbiwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IHBpY2sgPSB0aGlzLl9jcmVhdGVQaWNrKHNlc3Npb24sIGluZGV4LCBmaWx0ZXIpO1xuXHRcdFx0aWYgKHBpY2spIHtcblx0XHRcdFx0ZGVidWdDb25zb2xlUGlja3MucHVzaChwaWNrKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXG5cdFx0aWYgKGRlYnVnQ29uc29sZVBpY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdGRlYnVnQ29uc29sZVBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJyB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjcmVhdGVUZXJtaW5hbExhYmVsID0gbG9jYWxpemUoXCJ3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnN0YXJ0RGVidWdcIiwgXCJTdGFydCBhIE5ldyBEZWJ1ZyBTZXNzaW9uXCIpO1xuXHRcdGRlYnVnQ29uc29sZVBpY2tzLnB1c2goe1xuXHRcdFx0bGFiZWw6IGAkKHBsdXMpICR7Y3JlYXRlVGVybWluYWxMYWJlbH1gLFxuXHRcdFx0YXJpYUxhYmVsOiBjcmVhdGVUZXJtaW5hbExhYmVsLFxuXHRcdFx0YWNjZXB0OiAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTRUxFQ1RfQU5EX1NUQVJUX0lEKVxuXHRcdH0pO1xuXHRcdHJldHVybiBkZWJ1Z0NvbnNvbGVQaWNrcztcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVBpY2soc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgc2Vzc2lvbkluZGV4OiBudW1iZXIsIGZpbHRlcjogc3RyaW5nKTogSVBpY2tlclF1aWNrQWNjZXNzSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGFiZWwgPSBzZXNzaW9uLm5hbWU7XG5cblx0XHRjb25zdCBoaWdobGlnaHRzID0gbWF0Y2hlc0Z1enp5KGZpbHRlciwgbGFiZWwsIHRydWUpO1xuXHRcdGlmIChoaWdobGlnaHRzKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0aGlnaGxpZ2h0czogeyBsYWJlbDogaGlnaGxpZ2h0cyB9LFxuXHRcdFx0XHRhY2NlcHQ6IChrZXlNb2QsIGV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZGVidWdTZXJ2aWNlLmZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwgc2Vzc2lvbiwgeyBleHBsaWNpdDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX3ZpZXdzU2VydmljZS5pc1ZpZXdWaXNpYmxlKFJFUExfVklFV19JRCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlldyhSRVBMX1ZJRVdfSUQsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFtRCxpQ0FBd0M7QUFFM0YsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQ0FBbUMsMkJBQTJCO0FBQ3ZFLFNBQVMsZUFBOEIsb0JBQW9CO0FBRXBELElBQU0sMEJBQU4sY0FBc0MsMEJBQWtEO0FBQUEsRUFFOUYsWUFDaUMsZUFDQSxlQUNFLGlCQUNqQztBQUNELFVBQU0sbUNBQW1DLEVBQUUsdUJBQXVCLEtBQUssQ0FBQztBQUp4QztBQUNBO0FBQ0U7QUFBQSxFQUduQztBQUFBLEVBRVUsVUFBVSxRQUFnQixhQUE4QixPQUFvSjtBQUNyTixVQUFNLG9CQUF5RSxDQUFDO0FBRWhGLFNBQUssY0FBYyxTQUFTLEVBQUUsWUFBWSxJQUFJLEVBQUUsT0FBTyxPQUFLLEVBQUUsZ0JBQWdCLENBQUMsRUFBRSxRQUFRLENBQUMsU0FBUyxVQUFVO0FBQzVHLFlBQU0sT0FBTyxLQUFLLFlBQVksU0FBUyxPQUFPLE1BQU07QUFDcEQsVUFBSSxNQUFNO0FBQ1QsMEJBQWtCLEtBQUssSUFBSTtBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDO0FBR0QsUUFBSSxrQkFBa0IsU0FBUyxHQUFHO0FBQ2pDLHdCQUFrQixLQUFLLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFBQSxJQUM3QztBQUVBLFVBQU0sc0JBQXNCLFNBQVMscUNBQXFDLDJCQUEyQjtBQUNyRyxzQkFBa0IsS0FBSztBQUFBLE1BQ3RCLE9BQU8sV0FBVyxtQkFBbUI7QUFBQSxNQUNyQyxXQUFXO0FBQUEsTUFDWCxRQUFRLE1BQU0sS0FBSyxnQkFBZ0IsZUFBZSxtQkFBbUI7QUFBQSxJQUN0RSxDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFlBQVksU0FBd0IsY0FBc0IsUUFBb0Q7QUFDckgsVUFBTSxRQUFRLFFBQVE7QUFFdEIsVUFBTSxhQUFhLGFBQWEsUUFBUSxPQUFPLElBQUk7QUFDbkQsUUFBSSxZQUFZO0FBQ2YsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLFlBQVksRUFBRSxPQUFPLFdBQVc7QUFBQSxRQUNoQyxRQUFRLENBQUMsUUFBUSxVQUFVO0FBQzFCLGVBQUssY0FBYyxnQkFBZ0IsUUFBVyxRQUFXLFNBQVMsRUFBRSxVQUFVLEtBQUssQ0FBQztBQUNwRixjQUFJLENBQUMsS0FBSyxjQUFjLGNBQWMsWUFBWSxHQUFHO0FBQ3BELGlCQUFLLGNBQWMsU0FBUyxjQUFjLElBQUk7QUFBQSxVQUMvQztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFwRGEsMEJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
