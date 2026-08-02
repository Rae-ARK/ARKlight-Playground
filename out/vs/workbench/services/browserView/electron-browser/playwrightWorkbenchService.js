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
import { mainWindow } from "../../../../base/browser/window.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { IPlaywrightService } from "../../../../platform/browserView/common/playwrightService.js";
import { registerSharedProcessRemoteService } from "../../../../platform/ipc/electron-browser/services.js";
import { ILogService } from "../../../../platform/log/common/log.js";
let PlaywrightChannelClient = class {
  constructor(channel, logService) {
    void channel.call("__initialize", mainWindow.vscodeWindowId).catch((e) => {
      logService.error(`Failed to initialize Playwright service`, e);
    });
    return ProxyChannel.toService(channel);
  }
};
PlaywrightChannelClient = __decorateClass([
  __decorateParam(1, ILogService)
], PlaywrightChannelClient);
registerSharedProcessRemoteService(IPlaywrightService, "playwright", { channelClientCtor: PlaywrightChannelClient });
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9icm93c2VyVmlldy9lbGVjdHJvbi1icm93c2VyL3BsYXl3cmlnaHRXb3JrYmVuY2hTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNoYW5uZWwsIFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgSVBsYXl3cmlnaHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL3BsYXl3cmlnaHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyU2hhcmVkUHJvY2Vzc1JlbW90ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuY2xhc3MgUGxheXdyaWdodENoYW5uZWxDbGllbnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRjaGFubmVsOiBJQ2hhbm5lbCxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0LyoqXG5cdFx0ICogc2VuZCB0aGUgY3VycmVudCB3aW5kb3cncyBJRCBvbmNlIHZpYSBgX19pbml0aWFsaXplYCwgc28gdGhlIHNlcnZlci1zaWRlIHtAbGluayBQbGF5d3JpZ2h0Q2hhbm5lbH1cblx0XHQgKiBjYW4gY3JlYXRlIGEgcGVyLXdpbmRvdyB7QGxpbmsgUGxheXdyaWdodFdpbmRvd0luc3RhbmNlfS4gQWxsIHN1YnNlcXVlbnQgY2FsbHMgYW5kIGV2ZW50cyBhcmUgcHJveGllZCBkaXJlY3RseS5cblx0XHQgKi9cblx0XHR2b2lkIGNoYW5uZWwuY2FsbCgnX19pbml0aWFsaXplJywgbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCkuY2F0Y2goKGUpID0+IHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBpbml0aWFsaXplIFBsYXl3cmlnaHQgc2VydmljZWAsIGUpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElQbGF5d3JpZ2h0U2VydmljZT4oY2hhbm5lbCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaGFyZWRQcm9jZXNzUmVtb3RlU2VydmljZShJUGxheXdyaWdodFNlcnZpY2UsICdwbGF5d3JpZ2h0JywgeyBjaGFubmVsQ2xpZW50Q3RvcjogUGxheXdyaWdodENoYW5uZWxDbGllbnQgfSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQW1CLG9CQUFvQjtBQUN2QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLG1CQUFtQjtBQUU1QixJQUFNLDBCQUFOLE1BQThCO0FBQUEsRUFDN0IsWUFDQyxTQUNhLFlBQ1o7QUFLRCxTQUFLLFFBQVEsS0FBSyxnQkFBZ0IsV0FBVyxjQUFjLEVBQUUsTUFBTSxDQUFDLE1BQU07QUFDekUsaUJBQVcsTUFBTSwyQ0FBMkMsQ0FBQztBQUFBLElBQzlELENBQUM7QUFDRCxXQUFPLGFBQWEsVUFBOEIsT0FBTztBQUFBLEVBQzFEO0FBQ0Q7QUFkTSwwQkFBTjtBQUFBLEVBR0c7QUFBQSxHQUhHO0FBZ0JOLG1DQUFtQyxvQkFBb0IsY0FBYyxFQUFFLG1CQUFtQix3QkFBd0IsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
