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
import * as nls from "../../../../nls.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IDebugService, State } from "../common/debug.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
let DebugStatusContribution = class {
  constructor(statusBarService, debugService, configurationService) {
    this.statusBarService = statusBarService;
    this.debugService = debugService;
    this.toDispose = [];
    const addStatusBarEntry = () => {
      this.entryAccessor = this.statusBarService.addEntry(
        this.entry,
        "status.debug",
        StatusbarAlignment.LEFT,
        30
        /* Low Priority */
      );
    };
    const setShowInStatusBar = () => {
      this.showInStatusBar = configurationService.getValue("debug").showInStatusBar;
      if (this.showInStatusBar === "always" && !this.entryAccessor) {
        addStatusBarEntry();
      }
    };
    setShowInStatusBar();
    this.toDispose.push(this.debugService.onDidChangeState((state) => {
      if (state !== State.Inactive && this.showInStatusBar === "onFirstSessionStart" && !this.entryAccessor) {
        addStatusBarEntry();
      }
    }));
    this.toDispose.push(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.showInStatusBar")) {
        setShowInStatusBar();
        if (this.entryAccessor && this.showInStatusBar === "never") {
          this.entryAccessor.dispose();
          this.entryAccessor = void 0;
        }
      }
    }));
    this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration((e) => {
      this.entryAccessor?.update(this.entry);
    }));
  }
  get entry() {
    let text = "";
    const manager = this.debugService.getConfigurationManager();
    const name = manager.selectedConfiguration.name || "";
    const nameAndLaunchPresent = name && manager.selectedConfiguration.launch;
    if (nameAndLaunchPresent) {
      text = manager.getLaunches().length > 1 ? `${name} (${manager.selectedConfiguration.launch.name})` : name;
    }
    return {
      name: nls.localize("status.debug", "Debug"),
      text: "$(debug-alt-small) " + text,
      ariaLabel: nls.localize("debugTarget", "Debug: {0}", text),
      tooltip: nls.localize("selectAndStartDebug", "Select and Start Debug Configuration"),
      command: "workbench.action.debug.selectandstart"
    };
  }
  dispose() {
    this.entryAccessor?.dispose();
    dispose(this.toDispose);
  }
};
DebugStatusContribution = __decorateClass([
  __decorateParam(0, IStatusbarService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IConfigurationService)
], DebugStatusContribution);
export {
  DebugStatusContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdTdGF0dXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIFN0YXRlLCBJRGVidWdDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5LCBJU3RhdHVzYmFyU2VydmljZSwgU3RhdHVzYmFyQWxpZ25tZW50LCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVidWdTdGF0dXNDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHNob3dJblN0YXR1c0JhciE6ICduZXZlcicgfCAnYWx3YXlzJyB8ICdvbkZpcnN0U2Vzc2lvblN0YXJ0Jztcblx0cHJpdmF0ZSB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0cHJpdmF0ZSBlbnRyeUFjY2Vzc29yOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNCYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cblx0XHRjb25zdCBhZGRTdGF0dXNCYXJFbnRyeSA9ICgpID0+IHtcblx0XHRcdHRoaXMuZW50cnlBY2Nlc3NvciA9IHRoaXMuc3RhdHVzQmFyU2VydmljZS5hZGRFbnRyeSh0aGlzLmVudHJ5LCAnc3RhdHVzLmRlYnVnJywgU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQsIDMwIC8qIExvdyBQcmlvcml0eSAqLyk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNldFNob3dJblN0YXR1c0JhciA9ICgpID0+IHtcblx0XHRcdHRoaXMuc2hvd0luU3RhdHVzQmFyID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuc2hvd0luU3RhdHVzQmFyO1xuXHRcdFx0aWYgKHRoaXMuc2hvd0luU3RhdHVzQmFyID09PSAnYWx3YXlzJyAmJiAhdGhpcy5lbnRyeUFjY2Vzc29yKSB7XG5cdFx0XHRcdGFkZFN0YXR1c0JhckVudHJ5KCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRzZXRTaG93SW5TdGF0dXNCYXIoKTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZShzdGF0ZSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgIT09IFN0YXRlLkluYWN0aXZlICYmIHRoaXMuc2hvd0luU3RhdHVzQmFyID09PSAnb25GaXJzdFNlc3Npb25TdGFydCcgJiYgIXRoaXMuZW50cnlBY2Nlc3Nvcikge1xuXHRcdFx0XHRhZGRTdGF0dXNCYXJFbnRyeSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkZWJ1Zy5zaG93SW5TdGF0dXNCYXInKSkge1xuXHRcdFx0XHRzZXRTaG93SW5TdGF0dXNCYXIoKTtcblx0XHRcdFx0aWYgKHRoaXMuZW50cnlBY2Nlc3NvciAmJiB0aGlzLnNob3dJblN0YXR1c0JhciA9PT0gJ25ldmVyJykge1xuXHRcdFx0XHRcdHRoaXMuZW50cnlBY2Nlc3Nvci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5lbnRyeUFjY2Vzc29yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKS5vbkRpZFNlbGVjdENvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHR0aGlzLmVudHJ5QWNjZXNzb3I/LnVwZGF0ZSh0aGlzLmVudHJ5KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBlbnRyeSgpOiBJU3RhdHVzYmFyRW50cnkge1xuXHRcdGxldCB0ZXh0ID0gJyc7XG5cdFx0Y29uc3QgbWFuYWdlciA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCk7XG5cdFx0Y29uc3QgbmFtZSA9IG1hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLm5hbWUgfHwgJyc7XG5cdFx0Y29uc3QgbmFtZUFuZExhdW5jaFByZXNlbnQgPSBuYW1lICYmIG1hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLmxhdW5jaDtcblx0XHRpZiAobmFtZUFuZExhdW5jaFByZXNlbnQpIHtcblx0XHRcdHRleHQgPSAobWFuYWdlci5nZXRMYXVuY2hlcygpLmxlbmd0aCA+IDEgPyBgJHtuYW1lfSAoJHttYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbi5sYXVuY2ghLm5hbWV9KWAgOiBuYW1lKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdzdGF0dXMuZGVidWcnLCBcIkRlYnVnXCIpLFxuXHRcdFx0dGV4dDogJyQoZGVidWctYWx0LXNtYWxsKSAnICsgdGV4dCxcblx0XHRcdGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdkZWJ1Z1RhcmdldCcsIFwiRGVidWc6IHswfVwiLCB0ZXh0KSxcblx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgnc2VsZWN0QW5kU3RhcnREZWJ1ZycsIFwiU2VsZWN0IGFuZCBTdGFydCBEZWJ1ZyBDb25maWd1cmF0aW9uXCIpLFxuXHRcdFx0Y29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc2VsZWN0YW5kc3RhcnQnXG5cdFx0fTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5lbnRyeUFjY2Vzc29yPy5kaXNwb3NlKCk7XG5cdFx0ZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQXNCLGVBQWU7QUFDckMsU0FBUyxlQUFlLGFBQWtDO0FBQzFELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQTBCLG1CQUFtQiwwQkFBbUQ7QUFHekYsSUFBTSwwQkFBTixNQUFnRTtBQUFBLEVBTXRFLFlBQ3FDLGtCQUNKLGNBQ1Qsc0JBQ3RCO0FBSG1DO0FBQ0o7QUFMakMsU0FBUSxZQUEyQixDQUFDO0FBU25DLFVBQU0sb0JBQW9CLE1BQU07QUFDL0IsV0FBSyxnQkFBZ0IsS0FBSyxpQkFBaUI7QUFBQSxRQUFTLEtBQUs7QUFBQSxRQUFPO0FBQUEsUUFBZ0IsbUJBQW1CO0FBQUEsUUFBTTtBQUFBO0FBQUEsTUFBcUI7QUFBQSxJQUMvSDtBQUVBLFVBQU0scUJBQXFCLE1BQU07QUFDaEMsV0FBSyxrQkFBa0IscUJBQXFCLFNBQThCLE9BQU8sRUFBRTtBQUNuRixVQUFJLEtBQUssb0JBQW9CLFlBQVksQ0FBQyxLQUFLLGVBQWU7QUFDN0QsMEJBQWtCO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQ0EsdUJBQW1CO0FBRW5CLFNBQUssVUFBVSxLQUFLLEtBQUssYUFBYSxpQkFBaUIsV0FBUztBQUMvRCxVQUFJLFVBQVUsTUFBTSxZQUFZLEtBQUssb0JBQW9CLHlCQUF5QixDQUFDLEtBQUssZUFBZTtBQUN0RywwQkFBa0I7QUFBQSxNQUNuQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixPQUFLO0FBQ3RFLFVBQUksRUFBRSxxQkFBcUIsdUJBQXVCLEdBQUc7QUFDcEQsMkJBQW1CO0FBQ25CLFlBQUksS0FBSyxpQkFBaUIsS0FBSyxvQkFBb0IsU0FBUztBQUMzRCxlQUFLLGNBQWMsUUFBUTtBQUMzQixlQUFLLGdCQUFnQjtBQUFBLFFBQ3RCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssS0FBSyxhQUFhLHdCQUF3QixFQUFFLHlCQUF5QixPQUFLO0FBQzdGLFdBQUssZUFBZSxPQUFPLEtBQUssS0FBSztBQUFBLElBQ3RDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLElBQVksUUFBeUI7QUFDcEMsUUFBSSxPQUFPO0FBQ1gsVUFBTSxVQUFVLEtBQUssYUFBYSx3QkFBd0I7QUFDMUQsVUFBTSxPQUFPLFFBQVEsc0JBQXNCLFFBQVE7QUFDbkQsVUFBTSx1QkFBdUIsUUFBUSxRQUFRLHNCQUFzQjtBQUNuRSxRQUFJLHNCQUFzQjtBQUN6QixhQUFRLFFBQVEsWUFBWSxFQUFFLFNBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLHNCQUFzQixPQUFRLElBQUksTUFBTTtBQUFBLElBQ3hHO0FBRUEsV0FBTztBQUFBLE1BQ04sTUFBTSxJQUFJLFNBQVMsZ0JBQWdCLE9BQU87QUFBQSxNQUMxQyxNQUFNLHdCQUF3QjtBQUFBLE1BQzlCLFdBQVcsSUFBSSxTQUFTLGVBQWUsY0FBYyxJQUFJO0FBQUEsTUFDekQsU0FBUyxJQUFJLFNBQVMsdUJBQXVCLHNDQUFzQztBQUFBLE1BQ25GLFNBQVM7QUFBQSxJQUNWO0FBQUEsRUFDRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLGVBQWUsUUFBUTtBQUM1QixZQUFRLEtBQUssU0FBUztBQUFBLEVBQ3ZCO0FBQ0Q7QUFqRWEsMEJBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogW10KfQo=
