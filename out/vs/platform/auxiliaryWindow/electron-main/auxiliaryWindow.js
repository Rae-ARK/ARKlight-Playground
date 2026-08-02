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
import { BrowserWindow } from "electron";
import { isLinux, isMacintosh, isWindows } from "../../../base/common/platform.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IStateService } from "../../state/node/state.js";
import { hasNativeTitlebar, TitlebarStyle } from "../../window/common/window.js";
import { WindowMode } from "../../window/electron-main/window.js";
import { BaseWindow } from "../../windows/electron-main/windowImpl.js";
let AuxiliaryWindow = class extends BaseWindow {
  constructor(webContents, windowOptions, environmentMainService, logService, configurationService, stateService, lifecycleMainService) {
    super(configurationService, stateService, environmentMainService, logService);
    this.webContents = webContents;
    this.windowOptions = windowOptions;
    this.lifecycleMainService = lifecycleMainService;
    this.parentId = -1;
    this.stateApplied = false;
    this.id = this.webContents.id;
    this.tryClaimWindow();
  }
  get win() {
    if (!super.win) {
      this.tryClaimWindow();
    }
    return super.win;
  }
  tryClaimWindow(options) {
    if (this._store.isDisposed || this.webContents.isDestroyed()) {
      return;
    }
    const effectiveOptions = options ?? this.windowOptions;
    this.doTryClaimWindow(effectiveOptions);
    if (effectiveOptions && !this.stateApplied) {
      this.stateApplied = true;
      this.applyState({
        x: effectiveOptions.x,
        y: effectiveOptions.y,
        width: effectiveOptions.width,
        height: effectiveOptions.height,
        // We currently do not support restoring fullscreen state for auxiliary
        // windows because we do not get hold of the original `features` string
        // that contains that info in `window-fullscreen`. However, we can
        // probe the `options.show` value for whether the window should be maximized
        // or not because we never show maximized windows initially to reduce flicker.
        mode: effectiveOptions.show === false ? WindowMode.Maximized : WindowMode.Normal
      });
    }
  }
  doTryClaimWindow(options) {
    if (this._win) {
      return;
    }
    const window = BrowserWindow.fromWebContents(this.webContents);
    if (window) {
      this.logService.trace("[aux window] Claimed browser window instance");
      this.setWin(window, options);
      window.setMenu(null);
      if ((isWindows || isLinux) && hasNativeTitlebar(
        this.configurationService,
        options?.titleBarStyle === "hidden" ? TitlebarStyle.CUSTOM : void 0
        /* unknown */
      )) {
        window.setAutoHideMenuBar(true);
      }
      this.lifecycleMainService.registerAuxWindow(this);
      if (isMacintosh && options?.frame === false) {
        window.setWindowButtonVisibility(false);
      }
      if (options?.resizable === false) {
        window.setResizable(false);
      }
    }
  }
  matches(webContents) {
    return this.webContents.id === webContents.id;
  }
};
AuxiliaryWindow = __decorateClass([
  __decorateParam(2, IEnvironmentMainService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IStateService),
  __decorateParam(6, ILifecycleMainService)
], AuxiliaryWindow);
export {
  AuxiliaryWindow
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2F1eGlsaWFyeVdpbmRvdy9lbGVjdHJvbi1tYWluL2F1eGlsaWFyeVdpbmRvdy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJyb3dzZXJXaW5kb3csIEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMsIFdlYkNvbnRlbnRzIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZU1haW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2VsZWN0cm9uLW1haW4vbGlmZWN5Y2xlTWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3RhdGUvbm9kZS9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBoYXNOYXRpdmVUaXRsZWJhciwgVGl0bGViYXJTdHlsZSB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElCYXNlV2luZG93LCBXaW5kb3dNb2RlIH0gZnJvbSAnLi4vLi4vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LmpzJztcbmltcG9ydCB7IEJhc2VXaW5kb3cgfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93SW1wbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVdpbmRvdyBleHRlbmRzIElCYXNlV2luZG93IHtcblx0cmVhZG9ubHkgcGFyZW50SWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEF1eGlsaWFyeVdpbmRvdyBleHRlbmRzIEJhc2VXaW5kb3cgaW1wbGVtZW50cyBJQXV4aWxpYXJ5V2luZG93IHtcblxuXHRyZWFkb25seSBpZDogbnVtYmVyO1xuXHRwYXJlbnRJZCA9IC0xO1xuXG5cdG92ZXJyaWRlIGdldCB3aW4oKSB7XG5cdFx0aWYgKCFzdXBlci53aW4pIHtcblx0XHRcdHRoaXMudHJ5Q2xhaW1XaW5kb3coKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIud2luO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0ZUFwcGxpZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdlYkNvbnRlbnRzOiBXZWJDb250ZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd09wdGlvbnM6IEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTdGF0ZVNlcnZpY2Ugc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVNYWluU2VydmljZTogSUxpZmVjeWNsZU1haW5TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGF0ZVNlcnZpY2UsIGVudmlyb25tZW50TWFpblNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5pZCA9IHRoaXMud2ViQ29udGVudHMuaWQ7XG5cblx0XHQvLyBUcnkgdG8gY2xhaW0gd2luZG93XG5cdFx0dGhpcy50cnlDbGFpbVdpbmRvdygpO1xuXHR9XG5cblx0dHJ5Q2xhaW1XaW5kb3cob3B0aW9ucz86IEJyb3dzZXJXaW5kb3dDb25zdHJ1Y3Rvck9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCB0aGlzLndlYkNvbnRlbnRzLmlzRGVzdHJveWVkKCkpIHtcblx0XHRcdHJldHVybjsgLy8gYWxyZWFkeSBkaXNwb3NlZFxuXHRcdH1cblxuXHRcdGNvbnN0IGVmZmVjdGl2ZU9wdGlvbnMgPSBvcHRpb25zID8/IHRoaXMud2luZG93T3B0aW9ucztcblxuXHRcdHRoaXMuZG9UcnlDbGFpbVdpbmRvdyhlZmZlY3RpdmVPcHRpb25zKTtcblxuXHRcdGlmIChlZmZlY3RpdmVPcHRpb25zICYmICF0aGlzLnN0YXRlQXBwbGllZCkge1xuXHRcdFx0dGhpcy5zdGF0ZUFwcGxpZWQgPSB0cnVlO1xuXG5cdFx0XHR0aGlzLmFwcGx5U3RhdGUoe1xuXHRcdFx0XHR4OiBlZmZlY3RpdmVPcHRpb25zLngsXG5cdFx0XHRcdHk6IGVmZmVjdGl2ZU9wdGlvbnMueSxcblx0XHRcdFx0d2lkdGg6IGVmZmVjdGl2ZU9wdGlvbnMud2lkdGgsXG5cdFx0XHRcdGhlaWdodDogZWZmZWN0aXZlT3B0aW9ucy5oZWlnaHQsXG5cdFx0XHRcdC8vIFdlIGN1cnJlbnRseSBkbyBub3Qgc3VwcG9ydCByZXN0b3JpbmcgZnVsbHNjcmVlbiBzdGF0ZSBmb3IgYXV4aWxpYXJ5XG5cdFx0XHRcdC8vIHdpbmRvd3MgYmVjYXVzZSB3ZSBkbyBub3QgZ2V0IGhvbGQgb2YgdGhlIG9yaWdpbmFsIGBmZWF0dXJlc2Agc3RyaW5nXG5cdFx0XHRcdC8vIHRoYXQgY29udGFpbnMgdGhhdCBpbmZvIGluIGB3aW5kb3ctZnVsbHNjcmVlbmAuIEhvd2V2ZXIsIHdlIGNhblxuXHRcdFx0XHQvLyBwcm9iZSB0aGUgYG9wdGlvbnMuc2hvd2AgdmFsdWUgZm9yIHdoZXRoZXIgdGhlIHdpbmRvdyBzaG91bGQgYmUgbWF4aW1pemVkXG5cdFx0XHRcdC8vIG9yIG5vdCBiZWNhdXNlIHdlIG5ldmVyIHNob3cgbWF4aW1pemVkIHdpbmRvd3MgaW5pdGlhbGx5IHRvIHJlZHVjZSBmbGlja2VyLlxuXHRcdFx0XHRtb2RlOiBlZmZlY3RpdmVPcHRpb25zLnNob3cgPT09IGZhbHNlID8gV2luZG93TW9kZS5NYXhpbWl6ZWQgOiBXaW5kb3dNb2RlLk5vcm1hbFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1RyeUNsYWltV2luZG93KG9wdGlvbnM/OiBCcm93c2VyV2luZG93Q29uc3RydWN0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpbikge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGNsYWltZWRcblx0XHR9XG5cblx0XHRjb25zdCB3aW5kb3cgPSBCcm93c2VyV2luZG93LmZyb21XZWJDb250ZW50cyh0aGlzLndlYkNvbnRlbnRzKTtcblx0XHRpZiAod2luZG93KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1thdXggd2luZG93XSBDbGFpbWVkIGJyb3dzZXIgd2luZG93IGluc3RhbmNlJyk7XG5cblx0XHRcdC8vIFJlbWVtYmVyXG5cdFx0XHR0aGlzLnNldFdpbih3aW5kb3csIG9wdGlvbnMpO1xuXG5cdFx0XHQvLyBEaXNhYmxlIE1lbnVcblx0XHRcdHdpbmRvdy5zZXRNZW51KG51bGwpO1xuXHRcdFx0aWYgKChpc1dpbmRvd3MgfHwgaXNMaW51eCkgJiYgaGFzTmF0aXZlVGl0bGViYXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgb3B0aW9ucz8udGl0bGVCYXJTdHlsZSA9PT0gJ2hpZGRlbicgPyBUaXRsZWJhclN0eWxlLkNVU1RPTSA6IHVuZGVmaW5lZCAvKiB1bmtub3duICovKSkge1xuXHRcdFx0XHR3aW5kb3cuc2V0QXV0b0hpZGVNZW51QmFyKHRydWUpOyAvLyBGaXggZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDA2MTVcblx0XHRcdH1cblxuXHRcdFx0Ly8gTGlmZWN5Y2xlXG5cdFx0XHR0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnJlZ2lzdGVyQXV4V2luZG93KHRoaXMpO1xuXG5cdFx0XHQvLyBIaWRlIG1hY09TIHRyYWZmaWMgbGlnaHQgYnV0dG9ucyBmb3IgZnJhbWVsZXNzIHdpbmRvd3Ncblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiBvcHRpb25zPy5mcmFtZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0d2luZG93LnNldFdpbmRvd0J1dHRvblZpc2liaWxpdHkoZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaXNhYmxlIHJlc2l6aW5nIGZvciBub24tcmVzaXphYmxlIHdpbmRvd3Ncblx0XHRcdGlmIChvcHRpb25zPy5yZXNpemFibGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdHdpbmRvdy5zZXRSZXNpemFibGUoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG1hdGNoZXMod2ViQ29udGVudHM6IFdlYkNvbnRlbnRzKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMud2ViQ29udGVudHMuaWQgPT09IHdlYkNvbnRlbnRzLmlkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQW1FO0FBQzVFLFNBQVMsU0FBUyxhQUFhLGlCQUFpQjtBQUNoRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQixxQkFBcUI7QUFDakQsU0FBc0Isa0JBQWtCO0FBQ3hDLFNBQVMsa0JBQWtCO0FBTXBCLElBQU0sa0JBQU4sY0FBOEIsV0FBdUM7QUFBQSxFQWUzRSxZQUNrQixhQUNBLGVBQ1Esd0JBQ1osWUFDVSxzQkFDUixjQUN5QixzQkFDdkM7QUFDRCxVQUFNLHNCQUFzQixjQUFjLHdCQUF3QixVQUFVO0FBUjNEO0FBQ0E7QUFLdUI7QUFuQnpDLG9CQUFXO0FBVVgsU0FBUSxlQUFlO0FBYXRCLFNBQUssS0FBSyxLQUFLLFlBQVk7QUFHM0IsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQXpCQSxJQUFhLE1BQU07QUFDbEIsUUFBSSxDQUFDLE1BQU0sS0FBSztBQUNmLFdBQUssZUFBZTtBQUFBLElBQ3JCO0FBRUEsV0FBTyxNQUFNO0FBQUEsRUFDZDtBQUFBLEVBcUJBLGVBQWUsU0FBaUQ7QUFDL0QsUUFBSSxLQUFLLE9BQU8sY0FBYyxLQUFLLFlBQVksWUFBWSxHQUFHO0FBQzdEO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLFdBQVcsS0FBSztBQUV6QyxTQUFLLGlCQUFpQixnQkFBZ0I7QUFFdEMsUUFBSSxvQkFBb0IsQ0FBQyxLQUFLLGNBQWM7QUFDM0MsV0FBSyxlQUFlO0FBRXBCLFdBQUssV0FBVztBQUFBLFFBQ2YsR0FBRyxpQkFBaUI7QUFBQSxRQUNwQixHQUFHLGlCQUFpQjtBQUFBLFFBQ3BCLE9BQU8saUJBQWlCO0FBQUEsUUFDeEIsUUFBUSxpQkFBaUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFNekIsTUFBTSxpQkFBaUIsU0FBUyxRQUFRLFdBQVcsWUFBWSxXQUFXO0FBQUEsTUFDM0UsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFUSxpQkFBaUIsU0FBaUQ7QUFDekUsUUFBSSxLQUFLLE1BQU07QUFDZDtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsY0FBYyxnQkFBZ0IsS0FBSyxXQUFXO0FBQzdELFFBQUksUUFBUTtBQUNYLFdBQUssV0FBVyxNQUFNLDhDQUE4QztBQUdwRSxXQUFLLE9BQU8sUUFBUSxPQUFPO0FBRzNCLGFBQU8sUUFBUSxJQUFJO0FBQ25CLFdBQUssYUFBYSxZQUFZO0FBQUEsUUFBa0IsS0FBSztBQUFBLFFBQXNCLFNBQVMsa0JBQWtCLFdBQVcsY0FBYyxTQUFTO0FBQUE7QUFBQSxNQUF1QixHQUFHO0FBQ2pLLGVBQU8sbUJBQW1CLElBQUk7QUFBQSxNQUMvQjtBQUdBLFdBQUsscUJBQXFCLGtCQUFrQixJQUFJO0FBR2hELFVBQUksZUFBZSxTQUFTLFVBQVUsT0FBTztBQUM1QyxlQUFPLDBCQUEwQixLQUFLO0FBQUEsTUFDdkM7QUFHQSxVQUFJLFNBQVMsY0FBYyxPQUFPO0FBQ2pDLGVBQU8sYUFBYSxLQUFLO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsUUFBUSxhQUFtQztBQUMxQyxXQUFPLEtBQUssWUFBWSxPQUFPLFlBQVk7QUFBQSxFQUM1QztBQUNEO0FBL0ZhLGtCQUFOO0FBQUEsRUFrQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0QlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
