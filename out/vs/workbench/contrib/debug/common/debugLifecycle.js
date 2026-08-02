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
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IDebugService } from "./debug.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
let DebugLifecycle = class {
  constructor(lifecycleService, debugService, configurationService, dialogService) {
    this.debugService = debugService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.disposable = lifecycleService.onBeforeShutdown(async (e) => e.veto(this.shouldVetoShutdown(e.reason), "veto.debug"));
  }
  shouldVetoShutdown(_reason) {
    const rootSessions = this.debugService.getModel().getSessions().filter((s) => s.parentSession === void 0);
    if (rootSessions.length === 0) {
      return false;
    }
    const shouldConfirmOnExit = this.configurationService.getValue("debug").confirmOnExit;
    if (shouldConfirmOnExit === "never") {
      return false;
    }
    return this.showWindowCloseConfirmation(rootSessions.length);
  }
  dispose() {
    return this.disposable.dispose();
  }
  async showWindowCloseConfirmation(numSessions) {
    let message;
    if (numSessions === 1) {
      message = nls.localize("debug.debugSessionCloseConfirmationSingular", "There is an active debug session, are you sure you want to stop it?");
    } else {
      message = nls.localize("debug.debugSessionCloseConfirmationPlural", "There are active debug sessions, are you sure you want to stop them?");
    }
    const res = await this.dialogService.confirm({
      message,
      type: "warning",
      primaryButton: nls.localize({ key: "debug.stop", comment: ["&& denotes a mnemonic"] }, "&&Stop Debugging")
    });
    return !res.confirmed;
  }
};
DebugLifecycle = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IDialogService)
], DebugLifecycle);
export {
  DebugLifecycle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2NvbW1vbi9kZWJ1Z0xpZmVjeWNsZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z1NlcnZpY2UgfSBmcm9tICcuL2RlYnVnLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBTaHV0ZG93blJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuZXhwb3J0IGNsYXNzIERlYnVnTGlmZWN5Y2xlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgZGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGUgPSBsaWZlY3ljbGVTZXJ2aWNlLm9uQmVmb3JlU2h1dGRvd24oYXN5bmMgZSA9PiBlLnZldG8odGhpcy5zaG91bGRWZXRvU2h1dGRvd24oZS5yZWFzb24pLCAndmV0by5kZWJ1ZycpKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkVmV0b1NodXRkb3duKF9yZWFzb246IFNodXRkb3duUmVhc29uKTogYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJvb3RTZXNzaW9ucyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0U2Vzc2lvbnMoKS5maWx0ZXIocyA9PiBzLnBhcmVudFNlc3Npb24gPT09IHVuZGVmaW5lZCk7XG5cdFx0aWYgKHJvb3RTZXNzaW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzaG91bGRDb25maXJtT25FeGl0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5jb25maXJtT25FeGl0O1xuXHRcdGlmIChzaG91bGRDb25maXJtT25FeGl0ID09PSAnbmV2ZXInKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2hvd1dpbmRvd0Nsb3NlQ29uZmlybWF0aW9uKHJvb3RTZXNzaW9ucy5sZW5ndGgpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dXaW5kb3dDbG9zZUNvbmZpcm1hdGlvbihudW1TZXNzaW9uczogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRpZiAobnVtU2Vzc2lvbnMgPT09IDEpIHtcblx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2RlYnVnLmRlYnVnU2Vzc2lvbkNsb3NlQ29uZmlybWF0aW9uU2luZ3VsYXInLCBcIlRoZXJlIGlzIGFuIGFjdGl2ZSBkZWJ1ZyBzZXNzaW9uLCBhcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gc3RvcCBpdD9cIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2RlYnVnLmRlYnVnU2Vzc2lvbkNsb3NlQ29uZmlybWF0aW9uUGx1cmFsJywgXCJUaGVyZSBhcmUgYWN0aXZlIGRlYnVnIHNlc3Npb25zLCBhcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gc3RvcCB0aGVtP1wiKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlYnVnLnN0b3AnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTdG9wIERlYnVnZ2luZ1wiKVxuXHRcdH0pO1xuXHRcdHJldHVybiAhcmVzLmNvbmZpcm1lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBOEIscUJBQXFCO0FBQ25ELFNBQVMseUJBQXlDO0FBRTNDLElBQU0saUJBQU4sTUFBdUQ7QUFBQSxFQUc3RCxZQUNvQixrQkFDYSxjQUNRLHNCQUNQLGVBQ2hDO0FBSCtCO0FBQ1E7QUFDUDtBQUVqQyxTQUFLLGFBQWEsaUJBQWlCLGlCQUFpQixPQUFNLE1BQUssRUFBRSxLQUFLLEtBQUssbUJBQW1CLEVBQUUsTUFBTSxHQUFHLFlBQVksQ0FBQztBQUFBLEVBQ3ZIO0FBQUEsRUFFUSxtQkFBbUIsU0FBcUQ7QUFDL0UsVUFBTSxlQUFlLEtBQUssYUFBYSxTQUFTLEVBQUUsWUFBWSxFQUFFLE9BQU8sT0FBSyxFQUFFLGtCQUFrQixNQUFTO0FBQ3pHLFFBQUksYUFBYSxXQUFXLEdBQUc7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLHNCQUFzQixLQUFLLHFCQUFxQixTQUE4QixPQUFPLEVBQUU7QUFDN0YsUUFBSSx3QkFBd0IsU0FBUztBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyw0QkFBNEIsYUFBYSxNQUFNO0FBQUEsRUFDNUQ7QUFBQSxFQUVPLFVBQVU7QUFDaEIsV0FBTyxLQUFLLFdBQVcsUUFBUTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFjLDRCQUE0QixhQUF1QztBQUNoRixRQUFJO0FBQ0osUUFBSSxnQkFBZ0IsR0FBRztBQUN0QixnQkFBVSxJQUFJLFNBQVMsK0NBQStDLHFFQUFxRTtBQUFBLElBQzVJLE9BQU87QUFDTixnQkFBVSxJQUFJLFNBQVMsNkNBQTZDLHNFQUFzRTtBQUFBLElBQzNJO0FBQ0EsVUFBTSxNQUFNLE1BQU0sS0FBSyxjQUFjLFFBQVE7QUFBQSxNQUM1QztBQUFBLE1BQ0EsTUFBTTtBQUFBLE1BQ04sZUFBZSxJQUFJLFNBQVMsRUFBRSxLQUFLLGNBQWMsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsa0JBQWtCO0FBQUEsSUFDMUcsQ0FBQztBQUNELFdBQU8sQ0FBQyxJQUFJO0FBQUEsRUFDYjtBQUNEO0FBNUNhLGlCQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
