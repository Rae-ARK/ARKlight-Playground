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
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { AbstractDialogHandler } from "../../../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
let NativeDialogHandler = class extends AbstractDialogHandler {
  constructor(logService, nativeHostService, clipboardService) {
    super();
    this.logService = logService;
    this.nativeHostService = nativeHostService;
    this.clipboardService = clipboardService;
  }
  async prompt(prompt) {
    this.logService.trace("DialogService#prompt", prompt.message);
    const buttons = this.getPromptButtons(prompt);
    const { response, checkboxChecked } = await this.nativeHostService.showMessageBox({
      type: this.getDialogType(prompt.type),
      title: prompt.title,
      message: prompt.message,
      detail: prompt.detail,
      buttons,
      cancelId: prompt.cancelButton ? buttons.length - 1 : -1,
      checkboxLabel: prompt.checkbox?.label,
      checkboxChecked: prompt.checkbox?.checked,
      targetWindowId: getActiveWindow().vscodeWindowId
    });
    return this.getPromptResult(prompt, response, checkboxChecked);
  }
  async confirm(confirmation) {
    this.logService.trace("DialogService#confirm", confirmation.message);
    const buttons = this.getConfirmationButtons(confirmation);
    const { response, checkboxChecked } = await this.nativeHostService.showMessageBox({
      type: this.getDialogType(confirmation.type) ?? "question",
      title: confirmation.title,
      message: confirmation.message,
      detail: confirmation.detail,
      buttons,
      cancelId: buttons.length - 1,
      checkboxLabel: confirmation.checkbox?.label,
      checkboxChecked: confirmation.checkbox?.checked,
      targetWindowId: getActiveWindow().vscodeWindowId
    });
    return { confirmed: response === 0, checkboxChecked };
  }
  input() {
    throw new Error("Unsupported");
  }
  async about(title, details, detailsToCopy) {
    const { response } = await this.nativeHostService.showMessageBox({
      type: "info",
      message: title,
      detail: `
${details}`,
      buttons: [
        localize({ key: "copy", comment: ["&& denotes a mnemonic"] }, "&&Copy"),
        localize("okButton", "OK")
      ],
      targetWindowId: getActiveWindow().vscodeWindowId
    });
    if (response === 0) {
      this.clipboardService.writeText(detailsToCopy);
    }
  }
};
NativeDialogHandler = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, INativeHostService),
  __decorateParam(2, IClipboardService)
], NativeDialogHandler);
export {
  NativeDialogHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9lbGVjdHJvbi1icm93c2VyL3BhcnRzL2RpYWxvZ3MvZGlhbG9nSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0RGlhbG9nSGFuZGxlciwgSUNvbmZpcm1hdGlvbiwgSUNvbmZpcm1hdGlvblJlc3VsdCwgSVByb21wdCwgSUFzeW5jUHJvbXB0UmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlRGlhbG9nSGFuZGxlciBleHRlbmRzIEFic3RyYWN0RGlhbG9nSGFuZGxlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHByb21wdDxUPihwcm9tcHQ6IElQcm9tcHQ8VD4pOiBQcm9taXNlPElBc3luY1Byb21wdFJlc3VsdDxUPj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRGlhbG9nU2VydmljZSNwcm9tcHQnLCBwcm9tcHQubWVzc2FnZSk7XG5cblx0XHRjb25zdCBidXR0b25zID0gdGhpcy5nZXRQcm9tcHRCdXR0b25zKHByb21wdCk7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogdGhpcy5nZXREaWFsb2dUeXBlKHByb21wdC50eXBlKSxcblx0XHRcdHRpdGxlOiBwcm9tcHQudGl0bGUsXG5cdFx0XHRtZXNzYWdlOiBwcm9tcHQubWVzc2FnZSxcblx0XHRcdGRldGFpbDogcHJvbXB0LmRldGFpbCxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRjYW5jZWxJZDogcHJvbXB0LmNhbmNlbEJ1dHRvbiA/IGJ1dHRvbnMubGVuZ3RoIC0gMSA6IC0xIC8qIERpc2FibGVkICovLFxuXHRcdFx0Y2hlY2tib3hMYWJlbDogcHJvbXB0LmNoZWNrYm94Py5sYWJlbCxcblx0XHRcdGNoZWNrYm94Q2hlY2tlZDogcHJvbXB0LmNoZWNrYm94Py5jaGVja2VkLFxuXHRcdFx0dGFyZ2V0V2luZG93SWQ6IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRQcm9tcHRSZXN1bHQocHJvbXB0LCByZXNwb25zZSwgY2hlY2tib3hDaGVja2VkKTtcblx0fVxuXG5cdGFzeW5jIGNvbmZpcm0oY29uZmlybWF0aW9uOiBJQ29uZmlybWF0aW9uKTogUHJvbWlzZTxJQ29uZmlybWF0aW9uUmVzdWx0PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEaWFsb2dTZXJ2aWNlI2NvbmZpcm0nLCBjb25maXJtYXRpb24ubWVzc2FnZSk7XG5cblx0XHRjb25zdCBidXR0b25zID0gdGhpcy5nZXRDb25maXJtYXRpb25CdXR0b25zKGNvbmZpcm1hdGlvbik7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogdGhpcy5nZXREaWFsb2dUeXBlKGNvbmZpcm1hdGlvbi50eXBlKSA/PyAncXVlc3Rpb24nLFxuXHRcdFx0dGl0bGU6IGNvbmZpcm1hdGlvbi50aXRsZSxcblx0XHRcdG1lc3NhZ2U6IGNvbmZpcm1hdGlvbi5tZXNzYWdlLFxuXHRcdFx0ZGV0YWlsOiBjb25maXJtYXRpb24uZGV0YWlsLFxuXHRcdFx0YnV0dG9ucyxcblx0XHRcdGNhbmNlbElkOiBidXR0b25zLmxlbmd0aCAtIDEsXG5cdFx0XHRjaGVja2JveExhYmVsOiBjb25maXJtYXRpb24uY2hlY2tib3g/LmxhYmVsLFxuXHRcdFx0Y2hlY2tib3hDaGVja2VkOiBjb25maXJtYXRpb24uY2hlY2tib3g/LmNoZWNrZWQsXG5cdFx0XHR0YXJnZXRXaW5kb3dJZDogZ2V0QWN0aXZlV2luZG93KCkudnNjb2RlV2luZG93SWRcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IGNvbmZpcm1lZDogcmVzcG9uc2UgPT09IDAsIGNoZWNrYm94Q2hlY2tlZCB9O1xuXHR9XG5cblx0aW5wdXQoKTogbmV2ZXIge1xuXHRcdHRocm93IG5ldyBFcnJvcignVW5zdXBwb3J0ZWQnKTsgLy8gd2UgaGF2ZSBubyBuYXRpdmUgQVBJIGZvciBwYXNzd29yZCBkaWFsb2dzIGluIEVsZWN0cm9uXG5cdH1cblxuXHRhc3luYyBhYm91dCh0aXRsZTogc3RyaW5nLCBkZXRhaWxzOiBzdHJpbmcsIGRldGFpbHNUb0NvcHk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uuc2hvd01lc3NhZ2VCb3goe1xuXHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0bWVzc2FnZTogdGl0bGUsXG5cdFx0XHRkZXRhaWw6IGBcXG4ke2RldGFpbHN9YCxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjb3B5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29weVwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ29rQnV0dG9uJywgXCJPS1wiKVxuXHRcdFx0XSxcblx0XHRcdHRhcmdldFdpbmRvd0lkOiBnZXRBY3RpdmVXaW5kb3coKS52c2NvZGVXaW5kb3dJZFxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlc3BvbnNlID09PSAwKSB7XG5cdFx0XHR0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KGRldGFpbHNU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
