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
import { localize } from "../../../../nls.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { BrowserClipboardService as BaseBrowserClipboardService } from "../../../../platform/clipboard/browser/clipboardService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
let BrowserClipboardService = class extends BaseBrowserClipboardService {
  constructor(notificationService, openerService, environmentService, logService, layoutService) {
    super(layoutService, logService);
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.environmentService = environmentService;
  }
  async writeText(text, type) {
    this.logService.trace("BrowserClipboardService#writeText called with type:", type, " with text.length:", text.length);
    if (!!this.environmentService.extensionTestsLocationURI && typeof type !== "string") {
      type = "vscode-tests";
    }
    this.logService.trace("BrowserClipboardService#super.writeText");
    return super.writeText(text, type);
  }
  async readText(type) {
    this.logService.trace("BrowserClipboardService#readText called with type:", type);
    if (!!this.environmentService.extensionTestsLocationURI && typeof type !== "string") {
      type = "vscode-tests";
    }
    if (type) {
      this.logService.trace("BrowserClipboardService#super.readText");
      return super.readText(type);
    }
    try {
      const readText = await getActiveWindow().navigator.clipboard.readText();
      this.logService.trace("BrowserClipboardService#readText with readText.length:", readText.length);
      return readText;
    } catch (error) {
      return new Promise((resolve) => {
        const listener = new DisposableStore();
        const handle = this.notificationService.prompt(
          Severity.Error,
          localize("clipboardError", "Unable to read from the browser's clipboard. Please make sure you have granted access for this website to read from the clipboard."),
          [{
            label: localize("retry", "Retry"),
            run: async () => {
              listener.dispose();
              resolve(await this.readText(type));
            }
          }, {
            label: localize("learnMore", "Learn More"),
            run: () => this.openerService.open("https://go.microsoft.com/fwlink/?linkid=2151362")
          }],
          {
            sticky: true
          }
        );
        listener.add(Event.once(handle.onDidClose)(() => resolve("")));
      });
    }
  }
};
BrowserClipboardService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, ILogService),
  __decorateParam(4, ILayoutService)
], BrowserClipboardService);
registerSingleton(IClipboardService, BrowserClipboardService, InstantiationType.Delayed);
export {
  BrowserClipboardService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jbGlwYm9hcmQvYnJvd3Nlci9jbGlwYm9hcmRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyQ2xpcGJvYXJkU2VydmljZSBhcyBCYXNlQnJvd3NlckNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvYnJvd3Nlci9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyQ2xpcGJvYXJkU2VydmljZSBleHRlbmRzIEJhc2VCcm93c2VyQ2xpcGJvYXJkU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihsYXlvdXRTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHdyaXRlVGV4dCh0ZXh0OiBzdHJpbmcsIHR5cGU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0Jyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlI3dyaXRlVGV4dCBjYWxsZWQgd2l0aCB0eXBlOicsIHR5cGUsICcgd2l0aCB0ZXh0Lmxlbmd0aDonLCB0ZXh0Lmxlbmd0aCk7XG5cdFx0aWYgKCEhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSAmJiB0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHR5cGUgPSAndnNjb2RlLXRlc3RzJzsgLy8gZm9yY2UgaW4tbWVtb3J5IGNsaXBib2FyZCBmb3IgdGVzdHMgdG8gYXZvaWQgcGVybWlzc2lvbiBpc3N1ZXNcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdCcm93c2VyQ2xpcGJvYXJkU2VydmljZSNzdXBlci53cml0ZVRleHQnKTtcblx0XHRyZXR1cm4gc3VwZXIud3JpdGVUZXh0KHRleHQsIHR5cGUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVhZFRleHQodHlwZT86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdCcm93c2VyQ2xpcGJvYXJkU2VydmljZSNyZWFkVGV4dCBjYWxsZWQgd2l0aCB0eXBlOicsIHR5cGUpO1xuXHRcdGlmICghIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkgJiYgdHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0eXBlID0gJ3ZzY29kZS10ZXN0cyc7IC8vIGZvcmNlIGluLW1lbW9yeSBjbGlwYm9hcmQgZm9yIHRlc3RzIHRvIGF2b2lkIHBlcm1pc3Npb24gaXNzdWVzXG5cdFx0fVxuXG5cdFx0aWYgKHR5cGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQnJvd3NlckNsaXBib2FyZFNlcnZpY2Ujc3VwZXIucmVhZFRleHQnKTtcblx0XHRcdHJldHVybiBzdXBlci5yZWFkVGV4dCh0eXBlKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVhZFRleHQgPSBhd2FpdCBnZXRBY3RpdmVXaW5kb3coKS5uYXZpZ2F0b3IuY2xpcGJvYXJkLnJlYWRUZXh0KCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0Jyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlI3JlYWRUZXh0IHdpdGggcmVhZFRleHQubGVuZ3RoOicsIHJlYWRUZXh0Lmxlbmd0aCk7XG5cdFx0XHRyZXR1cm4gcmVhZFRleHQ7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxzdHJpbmc+KHJlc29sdmUgPT4ge1xuXG5cdFx0XHRcdC8vIEluZm9ybSB1c2VyIGFib3V0IHBlcm1pc3Npb25zIHByb2JsZW0gKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTIwODkpXG5cdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdjbGlwYm9hcmRFcnJvcicsIFwiVW5hYmxlIHRvIHJlYWQgZnJvbSB0aGUgYnJvd3NlcidzIGNsaXBib2FyZC4gUGxlYXNlIG1ha2Ugc3VyZSB5b3UgaGF2ZSBncmFudGVkIGFjY2VzcyBmb3IgdGhpcyB3ZWJzaXRlIHRvIHJlYWQgZnJvbSB0aGUgY2xpcGJvYXJkLlwiKSxcblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXRyeScsIFwiUmV0cnlcIiksXG5cdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKGF3YWl0IHRoaXMucmVhZFRleHQodHlwZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbGVhcm5Nb3JlJywgXCJMZWFybiBNb3JlXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbignaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/bGlua2lkPTIxNTEzNjInKVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHN0aWNreTogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KTtcblxuXHRcdFx0XHQvLyBBbHdheXMgcmVzb2x2ZSB0aGUgcHJvbWlzZSBvbmNlIHRoZSBub3RpZmljYXRpb24gY2xvc2VzXG5cdFx0XHRcdGxpc3RlbmVyLmFkZChFdmVudC5vbmNlKGhhbmRsZS5vbkRpZENsb3NlKSgoKSA9PiByZXNvbHZlKCcnKSkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDbGlwYm9hcmRTZXJ2aWNlLCBCcm93c2VyQ2xpcGJvYXJkU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXll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
