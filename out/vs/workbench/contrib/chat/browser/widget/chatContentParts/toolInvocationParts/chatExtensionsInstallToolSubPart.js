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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../../nls.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IExtensionManagementService } from "../../../../../../../platform/extensionManagement/common/extensionManagement.js";
import { areSameExtensions } from "../../../../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { CancelChatActionId } from "../../../actions/chatExecuteActions.js";
import { AcceptToolConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { ChatConfirmationWidget } from "../chatConfirmationWidget.js";
import { ChatExtensionsContentPart } from "../chatExtensionsContentPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
let ExtensionsInstallConfirmationWidgetSubPart = class extends BaseChatToolInvocationSubPart {
  get codeblocks() {
    return this._confirmWidget?.codeblocks || [];
  }
  get codeblocksPartId() {
    return this._confirmWidget?.codeblocksPartId || "<none>";
  }
  constructor(toolInvocation, context, keybindingService, contextKeyService, chatWidgetService, extensionManagementService, instantiationService) {
    super(toolInvocation);
    if (toolInvocation.toolSpecificData?.kind !== "extensions") {
      throw new Error("Tool specific data is missing or not of kind extensions");
    }
    const extensionsContent = toolInvocation.toolSpecificData;
    this.domNode = dom.$("");
    const chatExtensionsContentPart = this._register(instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent));
    dom.append(this.domNode, chatExtensionsContentPart.domNode);
    const state = toolInvocation.state.get();
    if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      const allowLabel = localize("allow", "Allow");
      const allowTooltip = keybindingService.appendKeybinding(allowLabel, AcceptToolConfirmationActionId);
      const cancelLabel = localize("cancel", "Cancel");
      const cancelTooltip = keybindingService.appendKeybinding(cancelLabel, CancelChatActionId);
      const enableAllowButtonEvent = this._register(new Emitter());
      const buttons = [
        {
          label: allowLabel,
          data: { type: ToolConfirmKind.UserAction },
          tooltip: allowTooltip,
          disabled: true,
          onDidChangeDisablement: enableAllowButtonEvent.event
        },
        {
          label: cancelLabel,
          data: { type: ToolConfirmKind.Denied },
          isSecondary: true,
          tooltip: cancelTooltip
        }
      ];
      const confirmWidget = this._register(instantiationService.createInstance(
        ChatConfirmationWidget,
        context,
        {
          title: state.confirmationMessages?.title ?? localize("installExtensions", "Install Extensions"),
          message: state.confirmationMessages?.message ?? localize("installExtensionsConfirmation", "Click the Install button on the extension and then press Allow when finished."),
          buttons
        }
      ));
      this._confirmWidget = confirmWidget;
      dom.append(this.domNode, confirmWidget.domNode);
      this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
        IChatToolInvocation.confirmWith(toolInvocation, button.data);
        if (!isTouchClick) {
          chatWidgetService.getWidgetBySessionResource(context.element.sessionResource)?.focusInput();
        }
      }));
      const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(contextKeyService);
      hasToolConfirmationKey.set(true);
      this._register(toDisposable(() => hasToolConfirmationKey.reset()));
      const disposable = this._register(extensionManagementService.onInstallExtension((e) => {
        if (extensionsContent.extensions.some((id) => areSameExtensions({ id }, e.identifier))) {
          disposable.dispose();
          enableAllowButtonEvent.fire(false);
        }
      }));
    }
  }
};
ExtensionsInstallConfirmationWidgetSubPart = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, IExtensionManagementService),
  __decorateParam(6, IInstantiationService)
], ExtensionsInstallConfirmationWidgetSubPart);
export {
  ExtensionsInstallConfirmationWidgetSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRFeHRlbnNpb25zSW5zdGFsbFRvb2xTdWJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENvbmZpcm1lZFJlYXNvbiwgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbENoYXRBY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL2FjdGlvbnMvY2hhdEV4ZWN1dGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjY2VwdFRvb2xDb25maXJtYXRpb25BY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL2FjdGlvbnMvY2hhdFRvb2xBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpcm1hdGlvbldpZGdldCwgSUNoYXRDb25maXJtYXRpb25CdXR0b24gfSBmcm9tICcuLi9jaGF0Q29uZmlybWF0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vY2hhdEV4dGVuc2lvbnNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB9IGZyb20gJy4vY2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zSW5zdGFsbENvbmZpcm1hdGlvbldpZGdldFN1YlBhcnQgZXh0ZW5kcyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlybVdpZGdldD86IENoYXRDb25maXJtYXRpb25XaWRnZXQ8Q29uZmlybWVkUmVhc29uPjtcblxuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3MoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpcm1XaWRnZXQ/LmNvZGVibG9ja3MgfHwgW107XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0IGNvZGVibG9ja3NQYXJ0SWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpcm1XaWRnZXQ/LmNvZGVibG9ja3NQYXJ0SWQgfHwgJzxub25lPic7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbixcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbik7XG5cblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCAhPT0gJ2V4dGVuc2lvbnMnKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rvb2wgc3BlY2lmaWMgZGF0YSBpcyBtaXNzaW5nIG9yIG5vdCBvZiBraW5kIGV4dGVuc2lvbnMnKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25zQ29udGVudCA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJycpO1xuXHRcdGNvbnN0IGNoYXRFeHRlbnNpb25zQ29udGVudFBhcnQgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LCBleHRlbnNpb25zQ29udGVudCkpO1xuXHRcdGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBjaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LmRvbU5vZGUpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0Y29uc3QgYWxsb3dMYWJlbCA9IGxvY2FsaXplKCdhbGxvdycsIFwiQWxsb3dcIik7XG5cdFx0XHRjb25zdCBhbGxvd1Rvb2x0aXAgPSBrZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKGFsbG93TGFiZWwsIEFjY2VwdFRvb2xDb25maXJtYXRpb25BY3Rpb25JZCk7XG5cblx0XHRcdGNvbnN0IGNhbmNlbExhYmVsID0gbG9jYWxpemUoJ2NhbmNlbCcsIFwiQ2FuY2VsXCIpO1xuXHRcdFx0Y29uc3QgY2FuY2VsVG9vbHRpcCA9IGtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoY2FuY2VsTGFiZWwsIENhbmNlbENoYXRBY3Rpb25JZCk7XG5cdFx0XHRjb25zdCBlbmFibGVBbGxvd0J1dHRvbkV2ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbnM6IElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPENvbmZpcm1lZFJlYXNvbj5bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBhbGxvd0xhYmVsLFxuXHRcdFx0XHRcdGRhdGE6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSxcblx0XHRcdFx0XHR0b29sdGlwOiBhbGxvd1Rvb2x0aXAsXG5cdFx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VEaXNhYmxlbWVudDogZW5hYmxlQWxsb3dCdXR0b25FdmVudC5ldmVudFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGNhbmNlbExhYmVsLFxuXHRcdFx0XHRcdGRhdGE6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB9LFxuXHRcdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGNhbmNlbFRvb2x0aXBcblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgY29uZmlybVdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0Q29uZmlybWF0aW9uV2lkZ2V0PENvbmZpcm1lZFJlYXNvbj4sXG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0aXRsZTogc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlID8/IGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9ucycsIFwiSW5zdGFsbCBFeHRlbnNpb25zXCIpLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5tZXNzYWdlID8/IGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uc0NvbmZpcm1hdGlvbicsIFwiQ2xpY2sgdGhlIEluc3RhbGwgYnV0dG9uIG9uIHRoZSBleHRlbnNpb24gYW5kIHRoZW4gcHJlc3MgQWxsb3cgd2hlbiBmaW5pc2hlZC5cIiksXG5cdFx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLl9jb25maXJtV2lkZ2V0ID0gY29uZmlybVdpZGdldDtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBjb25maXJtV2lkZ2V0LmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlybVdpZGdldC5vbkRpZENsaWNrKCh7IGJ1dHRvbiwgaXNUb3VjaENsaWNrIH0pID0+IHtcblx0XHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aCh0b29sSW52b2NhdGlvbiwgYnV0dG9uLmRhdGEpO1xuXHRcdFx0XHRpZiAoIWlzVG91Y2hDbGljaykge1xuXHRcdFx0XHRcdGNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpPy5mb2N1c0lucHV0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IGhhc1Rvb2xDb25maXJtYXRpb25LZXkgPSBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNUb29sQ29uZmlybWF0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRoYXNUb29sQ29uZmlybWF0aW9uS2V5LnNldCh0cnVlKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBoYXNUb29sQ29uZmlybWF0aW9uS2V5LnJlc2V0KCkpKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkluc3RhbGxFeHRlbnNpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChleHRlbnNpb25zQ29udGVudC5leHRlbnNpb25zLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBlLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGVuYWJsZUFsbG93QnV0dG9uRXZlbnQuZmlyZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQTBCLHFCQUFxQix1QkFBdUI7QUFDdEUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQ0FBc0M7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
