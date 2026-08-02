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
import { AbstractDialogHandler } from "../../../../platform/dialogs/common/dialogs.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import Severity from "../../../../base/common/severity.js";
import { Dialog } from "../../../../base/browser/ui/dialog/dialog.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IMarkdownRendererService, openLinkFromMarkdown } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { createWorkbenchDialogOptions } from "./dialog.js";
import { IHostService } from "../../../services/host/browser/host.js";
let BrowserDialogHandler = class extends AbstractDialogHandler {
  constructor(logService, layoutService, keybindingService, instantiationService, clipboardService, openerService, markdownRendererService, hostService) {
    super();
    this.logService = logService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.clipboardService = clipboardService;
    this.openerService = openerService;
    this.markdownRendererService = markdownRendererService;
    this.hostService = hostService;
  }
  async prompt(prompt) {
    this.logService.trace("DialogService#prompt", prompt.message);
    const buttons = this.getPromptButtons(prompt);
    const { button, checkboxChecked } = await this.doShow(prompt.type, prompt.message, buttons, prompt.detail, prompt.cancelButton ? buttons.length - 1 : -1, prompt.checkbox, void 0, typeof prompt?.custom === "object" ? prompt.custom : void 0, prompt.token);
    return this.getPromptResult(prompt, button, checkboxChecked);
  }
  async confirm(confirmation) {
    this.logService.trace("DialogService#confirm", confirmation.message);
    const buttons = this.getConfirmationButtons(confirmation);
    const { button, checkboxChecked } = await this.doShow(confirmation.type ?? "question", confirmation.message, buttons, confirmation.detail, buttons.length - 1, confirmation.checkbox, void 0, typeof confirmation?.custom === "object" ? confirmation.custom : void 0, confirmation.token);
    return { confirmed: button === 0, checkboxChecked };
  }
  async input(input) {
    this.logService.trace("DialogService#input", input.message);
    const buttons = this.getInputButtons(input);
    const { button, checkboxChecked, values } = await this.doShow(input.type ?? "question", input.message, buttons, input.detail, buttons.length - 1, input?.checkbox, input.inputs, typeof input.custom === "object" ? input.custom : void 0, input.token);
    return { confirmed: button === 0, checkboxChecked, values };
  }
  async about(title, details, detailsToCopy) {
    const { button } = await this.doShow(
      Severity.Info,
      title,
      [
        localize({ key: "copy", comment: ["&& denotes a mnemonic"] }, "&&Copy"),
        localize("ok", "OK")
      ],
      details,
      1
    );
    if (button === 0) {
      this.clipboardService.writeText(detailsToCopy);
    }
  }
  async doShow(type, message, buttons, detail, cancelId, checkbox, inputs, customOptions, token) {
    const dialogDisposables = new DisposableStore();
    const renderBody = customOptions ? (parent) => {
      parent.classList.add(...customOptions.classes || []);
      customOptions.markdownDetails?.forEach((markdownDetail) => {
        const result2 = dialogDisposables.add(this.markdownRendererService.render(markdownDetail.markdown, {
          actionHandler: markdownDetail.actionHandler || ((link, mdStr) => {
            return openLinkFromMarkdown(
              this.openerService,
              link,
              mdStr.isTrusted,
              true
              /* skip URL validation to prevent another dialog from showing which is unsupported */
            );
          })
        }));
        parent.appendChild(result2.element);
        result2.element.classList.add(...markdownDetail.classes || []);
      });
    } : void 0;
    const dialog = new Dialog(
      this.layoutService.activeContainer,
      message,
      buttons,
      createWorkbenchDialogOptions({
        detail,
        cancelId,
        type: this.getDialogType(type),
        renderBody,
        icon: customOptions?.icon,
        disableCloseAction: customOptions?.disableCloseAction,
        buttonOptions: customOptions?.buttonDetails?.map((detail2) => ({ sublabel: detail2 })),
        checkboxLabel: checkbox?.label,
        checkboxChecked: checkbox?.checked,
        inputs
      }, this.keybindingService, this.layoutService, this.hostService, BrowserDialogHandler.ALLOWABLE_COMMANDS)
    );
    dialogDisposables.add(dialog);
    if (token) {
      dialogDisposables.add(token.onCancellationRequested(() => dialogDisposables.dispose()));
    }
    const result = await dialog.show();
    dialogDisposables.dispose();
    return result;
  }
};
BrowserDialogHandler.ALLOWABLE_COMMANDS = /* @__PURE__ */ new Set([
  "copy",
  "cut",
  "editor.action.selectAll",
  "editor.action.clipboardCopyAction",
  "editor.action.clipboardCutAction",
  "editor.action.clipboardPasteAction"
]);
BrowserDialogHandler = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ILayoutService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IClipboardService),
  __decorateParam(5, IOpenerService),
  __decorateParam(6, IMarkdownRendererService),
  __decorateParam(7, IHostService)
], BrowserDialogHandler);
export {
  BrowserDialogHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2RpYWxvZ3MvZGlhbG9nSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maXJtYXRpb24sIElDb25maXJtYXRpb25SZXN1bHQsIElJbnB1dFJlc3VsdCwgSUNoZWNrYm94LCBJSW5wdXRFbGVtZW50LCBJQ3VzdG9tRGlhbG9nT3B0aW9ucywgSUlucHV0LCBBYnN0cmFjdERpYWxvZ0hhbmRsZXIsIERpYWxvZ1R5cGUsIElQcm9tcHQsIElBc3luY1Byb21wdFJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IERpYWxvZywgSURpYWxvZ1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kaWFsb2cvZGlhbG9nLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBvcGVuTGlua0Zyb21NYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZVdvcmtiZW5jaERpYWxvZ09wdGlvbnMgfSBmcm9tICcuL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyRGlhbG9nSGFuZGxlciBleHRlbmRzIEFic3RyYWN0RGlhbG9nSGFuZGxlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQUxMT1dBQkxFX0NPTU1BTkRTID0gbmV3IFNldChbXG5cdFx0J2NvcHknLFxuXHRcdCdjdXQnLFxuXHRcdCdlZGl0b3IuYWN0aW9uLnNlbGVjdEFsbCcsXG5cdFx0J2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkQ29weUFjdGlvbicsXG5cdFx0J2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkQ3V0QWN0aW9uJyxcblx0XHQnZWRpdG9yLmFjdGlvbi5jbGlwYm9hcmRQYXN0ZUFjdGlvbidcblx0XSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgcHJvbXB0PFQ+KHByb21wdDogSVByb21wdDxUPik6IFByb21pc2U8SUFzeW5jUHJvbXB0UmVzdWx0PFQ+PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEaWFsb2dTZXJ2aWNlI3Byb21wdCcsIHByb21wdC5tZXNzYWdlKTtcblxuXHRcdGNvbnN0IGJ1dHRvbnMgPSB0aGlzLmdldFByb21wdEJ1dHRvbnMocHJvbXB0KTtcblxuXHRcdGNvbnN0IHsgYnV0dG9uLCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMuZG9TaG93KHByb21wdC50eXBlLCBwcm9tcHQubWVzc2FnZSwgYnV0dG9ucywgcHJvbXB0LmRldGFpbCwgcHJvbXB0LmNhbmNlbEJ1dHRvbiA/IGJ1dHRvbnMubGVuZ3RoIC0gMSA6IC0xIC8qIERpc2FibGVkICovLCBwcm9tcHQuY2hlY2tib3gsIHVuZGVmaW5lZCwgdHlwZW9mIHByb21wdD8uY3VzdG9tID09PSAnb2JqZWN0JyA/IHByb21wdC5jdXN0b20gOiB1bmRlZmluZWQsIHByb21wdC50b2tlbik7XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRQcm9tcHRSZXN1bHQocHJvbXB0LCBidXR0b24sIGNoZWNrYm94Q2hlY2tlZCk7XG5cdH1cblxuXHRhc3luYyBjb25maXJtKGNvbmZpcm1hdGlvbjogSUNvbmZpcm1hdGlvbik6IFByb21pc2U8SUNvbmZpcm1hdGlvblJlc3VsdD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRGlhbG9nU2VydmljZSNjb25maXJtJywgY29uZmlybWF0aW9uLm1lc3NhZ2UpO1xuXG5cdFx0Y29uc3QgYnV0dG9ucyA9IHRoaXMuZ2V0Q29uZmlybWF0aW9uQnV0dG9ucyhjb25maXJtYXRpb24pO1xuXG5cdFx0Y29uc3QgeyBidXR0b24sIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgdGhpcy5kb1Nob3coY29uZmlybWF0aW9uLnR5cGUgPz8gJ3F1ZXN0aW9uJywgY29uZmlybWF0aW9uLm1lc3NhZ2UsIGJ1dHRvbnMsIGNvbmZpcm1hdGlvbi5kZXRhaWwsIGJ1dHRvbnMubGVuZ3RoIC0gMSwgY29uZmlybWF0aW9uLmNoZWNrYm94LCB1bmRlZmluZWQsIHR5cGVvZiBjb25maXJtYXRpb24/LmN1c3RvbSA9PT0gJ29iamVjdCcgPyBjb25maXJtYXRpb24uY3VzdG9tIDogdW5kZWZpbmVkLCBjb25maXJtYXRpb24udG9rZW4pO1xuXG5cdFx0cmV0dXJuIHsgY29uZmlybWVkOiBidXR0b24gPT09IDAsIGNoZWNrYm94Q2hlY2tlZCB9O1xuXHR9XG5cblx0YXN5bmMgaW5wdXQoaW5wdXQ6IElJbnB1dCk6IFByb21pc2U8SUlucHV0UmVzdWx0PiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEaWFsb2dTZXJ2aWNlI2lucHV0JywgaW5wdXQubWVzc2FnZSk7XG5cblx0XHRjb25zdCBidXR0b25zID0gdGhpcy5nZXRJbnB1dEJ1dHRvbnMoaW5wdXQpO1xuXG5cdFx0Y29uc3QgeyBidXR0b24sIGNoZWNrYm94Q2hlY2tlZCwgdmFsdWVzIH0gPSBhd2FpdCB0aGlzLmRvU2hvdyhpbnB1dC50eXBlID8/ICdxdWVzdGlvbicsIGlucHV0Lm1lc3NhZ2UsIGJ1dHRvbnMsIGlucHV0LmRldGFpbCwgYnV0dG9ucy5sZW5ndGggLSAxLCBpbnB1dD8uY2hlY2tib3gsIGlucHV0LmlucHV0cywgdHlwZW9mIGlucHV0LmN1c3RvbSA9PT0gJ29iamVjdCcgPyBpbnB1dC5jdXN0b20gOiB1bmRlZmluZWQsIGlucHV0LnRva2VuKTtcblxuXHRcdHJldHVybiB7IGNvbmZpcm1lZDogYnV0dG9uID09PSAwLCBjaGVja2JveENoZWNrZWQsIHZhbHVlcyB9O1xuXHR9XG5cblx0YXN5bmMgYWJvdXQodGl0bGU6IHN0cmluZywgZGV0YWlsczogc3RyaW5nLCBkZXRhaWxzVG9Db3B5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IHsgYnV0dG9uIH0gPSBhd2FpdCB0aGlzLmRvU2hvdyhcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHR0aXRsZSxcblx0XHRcdFtcblx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdjb3B5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29weVwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ29rJywgXCJPS1wiKVxuXHRcdFx0XSxcblx0XHRcdGRldGFpbHMsXG5cdFx0XHQxXG5cdFx0KTtcblxuXHRcdGlmIChidXR0b24gPT09IDApIHtcblx0XHRcdHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoZGV0YWlsc1RvQ29weSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1Nob3codHlwZTogU2V2ZXJpdHkgfCBEaWFsb2dUeXBlIHwgdW5kZWZpbmVkLCBtZXNzYWdlOiBzdHJpbmcsIGJ1dHRvbnM/OiBzdHJpbmdbXSwgZGV0YWlsPzogc3RyaW5nLCBjYW5jZWxJZD86IG51bWJlciwgY2hlY2tib3g/OiBJQ2hlY2tib3gsIGlucHV0cz86IElJbnB1dEVsZW1lbnRbXSwgY3VzdG9tT3B0aW9ucz86IElDdXN0b21EaWFsb2dPcHRpb25zLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRGlhbG9nUmVzdWx0PiB7XG5cdFx0Y29uc3QgZGlhbG9nRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCByZW5kZXJCb2R5ID0gY3VzdG9tT3B0aW9ucyA/IChwYXJlbnQ6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCguLi4oY3VzdG9tT3B0aW9ucy5jbGFzc2VzIHx8IFtdKSk7XG5cdFx0XHRjdXN0b21PcHRpb25zLm1hcmtkb3duRGV0YWlscz8uZm9yRWFjaChtYXJrZG93bkRldGFpbCA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGRpYWxvZ0Rpc3Bvc2FibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtYXJrZG93bkRldGFpbC5tYXJrZG93biwge1xuXHRcdFx0XHRcdGFjdGlvbkhhbmRsZXI6IG1hcmtkb3duRGV0YWlsLmFjdGlvbkhhbmRsZXIgfHwgKChsaW5rLCBtZFN0cikgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG9wZW5MaW5rRnJvbU1hcmtkb3duKHRoaXMub3BlbmVyU2VydmljZSwgbGluaywgbWRTdHIuaXNUcnVzdGVkLCB0cnVlIC8qIHNraXAgVVJMIHZhbGlkYXRpb24gdG8gcHJldmVudCBhbm90aGVyIGRpYWxvZyBmcm9tIHNob3dpbmcgd2hpY2ggaXMgdW5zdXBwb3J0ZWQgKi8pO1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHBhcmVudC5hcHBlbmRDaGlsZChyZXN1bHQuZWxlbWVudCk7XG5cdFx0XHRcdHJlc3VsdC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uKG1hcmtkb3duRGV0YWlsLmNsYXNzZXMgfHwgW10pKTtcblx0XHRcdH0pO1xuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBkaWFsb2cgPSBuZXcgRGlhbG9nKFxuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLmFjdGl2ZUNvbnRhaW5lcixcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRidXR0b25zLFxuXHRcdFx0Y3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyh7XG5cdFx0XHRcdGRldGFpbCxcblx0XHRcdFx0Y2FuY2VsSWQsXG5cdFx0XHRcdHR5cGU6IHRoaXMuZ2V0RGlhbG9nVHlwZSh0eXBlKSxcblx0XHRcdFx0cmVuZGVyQm9keSxcblx0XHRcdFx0aWNvbjogY3VzdG9tT3B0aW9ucz8uaWNvbixcblx0XHRcdFx0ZGlzYWJsZUNsb3NlQWN0aW9uOiBjdXN0b21PcHRpb25zPy5kaXNhYmxlQ2xvc2VBY3Rpb24sXG5cdFx0XHRcdGJ1dHRvbk9wdGlvbnM6IGN1c3RvbU9wdGlvbnM/LmJ1dHRvbkRldGFpbHM/Lm1hcChkZXRhaWwgPT4gKHsgc3VibGFiZWw6IGRldGFpbCB9KSksXG5cdFx0XHRcdGNoZWNrYm94TGFiZWw6IGNoZWNrYm94Py5sYWJlbCxcblx0XHRcdFx0Y2hlY2tib3hDaGVja2VkOiBjaGVja2JveD8uY2hlY2tlZCxcblx0XHRcdFx0aW5wdXRzXG5cdFx0XHR9LCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLmxheW91dFNlcnZpY2UsIHRoaXMuaG9zdFNlcnZpY2UsIEJyb3dzZXJEaWFsb2dIYW5kbGVyLkFMTE9XQUJMRV9DT01NQU5EUylcblx0XHQpO1xuXG5cdFx0ZGlhbG9nRGlzcG9zYWJsZXMuYWRkKGRpYWxvZyk7XG5cblx0XHRpZiAodG9rZW4pIHtcblx0XHRcdGRpYWxvZ0Rpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBkaWFsb2dEaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2cuc2hvdygpO1xuXHRcdGRpYWxvZ0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBbUgsNkJBQXNFO0FBQ3pMLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CO0FBQzVCLE9BQU8sY0FBYztBQUNyQixTQUFTLGNBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCLDRCQUE0QjtBQUMvRCxTQUFT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
