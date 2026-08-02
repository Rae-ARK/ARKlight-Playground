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
import "./media/chatTipContent.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { onUnexpectedError } from "../../../../../../base/common/errors.js";
import { Disposable, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { getFlatContextMenuActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { openLinkFromMarkdown } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { CHAT_SETUP_ACTION_ID } from "../../actions/chatActions.js";
import { IChatTipService } from "../../chatTipService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
const $ = dom.$;
let ChatTipContentPart = class extends Disposable {
  constructor(tip, _renderer, _chatTipService, _contextMenuService, _menuService, _contextKeyService, _instantiationService, _openerService, _commandService, _chatEntitlementService) {
    super();
    this._renderer = _renderer;
    this._chatTipService = _chatTipService;
    this._contextMenuService = _contextMenuService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._openerService = _openerService;
    this._commandService = _commandService;
    this._chatEntitlementService = _chatEntitlementService;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._renderedContent = this._register(new MutableDisposable());
    this._toolbar = this._register(new MutableDisposable());
    this.domNode = $(".chat-tip-widget");
    this.domNode.tabIndex = 0;
    this.domNode.setAttribute("role", "region");
    this.domNode.setAttribute("aria-roledescription", localize("chatTipRoleDescription", "tip"));
    this._inChatTipContextKey = ChatContextKeys.inChatTip.bindTo(this._contextKeyService);
    this._multipleChatTipsContextKey = ChatContextKeys.multipleChatTips.bindTo(this._contextKeyService);
    const focusTracker = this._register(dom.trackFocus(this.domNode));
    this._register(focusTracker.onDidFocus(() => this._inChatTipContextKey.set(true)));
    this._register(focusTracker.onDidBlur(() => this._inChatTipContextKey.set(false)));
    this._register({
      dispose: () => {
        this._inChatTipContextKey.reset();
        this._multipleChatTipsContextKey.reset();
      }
    });
    this._renderTip(tip);
    this._register(this._chatTipService.onDidDismissTip(() => {
      this._onDidHide.fire();
    }));
    this._register(this._chatTipService.onDidNavigateTip((tip2) => {
      this._renderTip(tip2);
      dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => this.focus());
    }));
    this._register(this._chatTipService.onDidHideTip(() => {
      this._onDidHide.fire();
    }));
    this._register(this._chatTipService.onDidDisableTips(() => {
      this._onDidHide.fire();
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, (e) => {
      dom.EventHelper.stop(e, true);
      const event = new StandardMouseEvent(dom.getWindow(this.domNode), e);
      this._contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => {
          const menu = this._menuService.getMenuActions(MenuId.ChatTipContext, this._contextKeyService);
          return getFlatContextMenuActions(menu);
        }
      });
    }));
  }
  hasFocus() {
    return dom.isAncestorOfActiveElement(this.domNode);
  }
  focus() {
    this.domNode.focus();
  }
  _renderTip(tip) {
    dom.clearNode(this.domNode);
    this._toolbar.clear();
    this._multipleChatTipsContextKey.set(this._chatTipService.hasMultipleTips());
    const markdownContent = this._renderer.render(tip.content, {
      actionHandler: (link, md) => {
        this._handleTipAction(link, md).catch(onUnexpectedError);
      }
    });
    this._renderedContent.value = markdownContent;
    this.domNode.appendChild(markdownContent.element);
    const toolbarContainer = $(".chat-tip-toolbar");
    this._toolbar.value = this._instantiationService.createInstance(MenuWorkbenchToolBar, toolbarContainer, MenuId.ChatTipToolbar, {
      menuOptions: {
        shouldForwardArgs: true
      }
    });
    this.domNode.appendChild(toolbarContainer);
    const textContent = markdownContent.element.textContent ?? localize("chatTip", "Chat tip");
    const hasLink = /\[.*?\]\(.*?\)/.test(tip.content.value);
    const ariaLabel = hasLink ? localize("chatTipWithAction", "{0} Tab to reach the action.", textContent) : textContent;
    this.domNode.setAttribute("aria-label", ariaLabel);
  }
  async _handleTipAction(link, mdStr) {
    if (link.startsWith("command:") && this._shouldTriggerSetup()) {
      const setupSucceeded = await this._commandService.executeCommand(CHAT_SETUP_ACTION_ID);
      if (!setupSucceeded) {
        return;
      }
    }
    await openLinkFromMarkdown(this._openerService, link, mdStr.isTrusted);
  }
  _shouldTriggerSetup() {
    if (this._chatEntitlementService.hasByokModels) {
      return false;
    }
    const sentiment = this._chatEntitlementService.sentiment;
    if (!sentiment?.completed) {
      return true;
    }
    return this._chatEntitlementService.entitlement === ChatEntitlement.Unknown;
  }
};
ChatTipContentPart = __decorateClass([
  __decorateParam(2, IChatTipService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, IChatEntitlementService)
], ChatTipContentPart);
registerAction2(class PreviousTipAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.previousTip",
      title: localize2("chatTip.previous", "Previous tip"),
      icon: Codicon.chevronLeft,
      precondition: ChatContextKeys.multipleChatTips,
      f1: false,
      menu: [{
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 1
      }]
    });
  }
  async run(accessor) {
    const chatTipService = accessor.get(IChatTipService);
    chatTipService.navigateToPreviousTip();
  }
});
registerAction2(class NextTipAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.nextTip",
      title: localize2("chatTip.next", "Next tip"),
      icon: Codicon.chevronRight,
      precondition: ChatContextKeys.multipleChatTips,
      f1: false,
      menu: [{
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 2
      }]
    });
  }
  async run(accessor) {
    const chatTipService = accessor.get(IChatTipService);
    chatTipService.navigateToNextTip();
  }
});
registerAction2(class DismissTipToolbarAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.dismissTipToolbar",
      title: localize2("chatTip.dismissButton", "Dismiss tip"),
      icon: Codicon.check,
      f1: false,
      menu: [{
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 3
      }]
    });
  }
  async run(accessor) {
    accessor.get(IChatTipService).dismissTipForSession();
  }
});
registerAction2(class DismissTipAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.dismissTip",
      title: localize2("chatTip.dismiss", "Dismiss this tip"),
      f1: false,
      menu: [{
        id: MenuId.ChatTipContext,
        group: "chatTip",
        order: 1
      }]
    });
  }
  async run(accessor) {
    accessor.get(IChatTipService).dismissTipForSession();
  }
});
registerAction2(class DisableTipsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.disableTips",
      title: localize2("chatTip.disableTips", "Disable tips"),
      icon: Codicon.bellSlash,
      f1: false,
      menu: [{
        id: MenuId.ChatTipContext,
        group: "chatTip",
        order: 2
      }, {
        id: MenuId.ChatTipToolbar,
        group: "navigation",
        order: 5
      }]
    });
  }
  async run(accessor) {
    const chatTipService = accessor.get(IChatTipService);
    const commandService = accessor.get(ICommandService);
    await chatTipService.disableTips();
    await commandService.executeCommand("workbench.action.openSettings", "chat.tips.enabled");
  }
});
registerAction2(class ResetDismissedTipsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.resetDismissedTips",
      title: localize2("chatTip.resetDismissedTips", "Reset Dismissed Tips"),
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  async run(accessor) {
    accessor.get(IChatTipService).clearDismissedTips();
  }
});
export {
  ChatTipContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VGlwQ29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdFRpcENvbnRlbnQuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIsIG9wZW5MaW5rRnJvbU1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENIQVRfU0VUVVBfQUNUSU9OX0lEIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRpcCwgSUNoYXRUaXBTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdFRpcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGlwQ29udGVudFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkSGlkZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRIaWRlID0gdGhpcy5fb25EaWRIaWRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVkQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxNZW51V29ya2JlbmNoVG9vbEJhcj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5DaGF0VGlwQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX211bHRpcGxlQ2hhdFRpcHNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0aXA6IElDaGF0VGlwLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRASUNoYXRUaXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRUaXBTZXJ2aWNlOiBJQ2hhdFRpcFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gJCgnLmNoYXQtdGlwLXdpZGdldCcpO1xuXHRcdHRoaXMuZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdyZWdpb24nKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLXJvbGVkZXNjcmlwdGlvbicsIGxvY2FsaXplKCdjaGF0VGlwUm9sZURlc2NyaXB0aW9uJywgXCJ0aXBcIikpO1xuXG5cdFx0dGhpcy5faW5DaGF0VGlwQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5pbkNoYXRUaXAuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9tdWx0aXBsZUNoYXRUaXBzQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5tdWx0aXBsZUNoYXRUaXBzLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXModGhpcy5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5faW5DaGF0VGlwQ29udGV4dEtleS5zZXQodHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKCgpID0+IHRoaXMuX2luQ2hhdFRpcENvbnRleHRLZXkuc2V0KGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5faW5DaGF0VGlwQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0XHR0aGlzLl9tdWx0aXBsZUNoYXRUaXBzQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVuZGVyVGlwKHRpcCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0VGlwU2VydmljZS5vbkRpZERpc21pc3NUaXAoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRIaWRlLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0VGlwU2VydmljZS5vbkRpZE5hdmlnYXRlVGlwKHRpcCA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXJUaXAodGlwKTtcblx0XHRcdGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCAoKSA9PiB0aGlzLmZvY3VzKCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRUaXBTZXJ2aWNlLm9uRGlkSGlkZVRpcCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEhpZGUuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRUaXBTZXJ2aWNlLm9uRGlkRGlzYWJsZVRpcHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRIaWRlLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSksIGUpO1xuXHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtZW51ID0gdGhpcy5fbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkNoYXRUaXBDb250ZXh0LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodGhpcy5kb21Ob2RlKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyVGlwKHRpcDogSUNoYXRUaXApOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cdFx0dGhpcy5fdG9vbGJhci5jbGVhcigpO1xuXHRcdHRoaXMuX211bHRpcGxlQ2hhdFRpcHNDb250ZXh0S2V5LnNldCh0aGlzLl9jaGF0VGlwU2VydmljZS5oYXNNdWx0aXBsZVRpcHMoKSk7XG5cblx0XHRjb25zdCBtYXJrZG93bkNvbnRlbnQgPSB0aGlzLl9yZW5kZXJlci5yZW5kZXIodGlwLmNvbnRlbnQsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IChsaW5rLCBtZCkgPT4geyB0aGlzLl9oYW5kbGVUaXBBY3Rpb24obGluaywgbWQpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTsgfVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlbmRlcmVkQ29udGVudC52YWx1ZSA9IG1hcmtkb3duQ29udGVudDtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQobWFya2Rvd25Db250ZW50LmVsZW1lbnQpO1xuXG5cdFx0Ly8gVG9vbGJhciB3aXRoIHByZXZpb3VzLCBuZXh0LCBhbmQgZGlzbWlzcyBhY3Rpb25zIHZpYSBNZW51V29ya2JlbmNoVG9vbEJhclxuXHRcdGNvbnN0IHRvb2xiYXJDb250YWluZXIgPSAkKCcuY2hhdC10aXAtdG9vbGJhcicpO1xuXHRcdHRoaXMuX3Rvb2xiYXIudmFsdWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhckNvbnRhaW5lciwgTWVudUlkLkNoYXRUaXBUb29sYmFyLCB7XG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRvb2xiYXJDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGV4dENvbnRlbnQgPSBtYXJrZG93bkNvbnRlbnQuZWxlbWVudC50ZXh0Q29udGVudCA/PyBsb2NhbGl6ZSgnY2hhdFRpcCcsIFwiQ2hhdCB0aXBcIik7XG5cdFx0Y29uc3QgaGFzTGluayA9IC9cXFsuKj9cXF1cXCguKj9cXCkvLnRlc3QodGlwLmNvbnRlbnQudmFsdWUpO1xuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGhhc0xpbmtcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXRUaXBXaXRoQWN0aW9uJywgXCJ7MH0gVGFiIHRvIHJlYWNoIHRoZSBhY3Rpb24uXCIsIHRleHRDb250ZW50KVxuXHRcdFx0OiB0ZXh0Q29udGVudDtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVRpcEFjdGlvbihsaW5rOiBzdHJpbmcsIG1kU3RyOiBJTWFya2Rvd25TdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAobGluay5zdGFydHNXaXRoKCdjb21tYW5kOicpICYmIHRoaXMuX3Nob3VsZFRyaWdnZXJTZXR1cCgpKSB7XG5cdFx0XHRjb25zdCBzZXR1cFN1Y2NlZWRlZCA9IGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kPGJvb2xlYW4gfCB1bmRlZmluZWQ+KENIQVRfU0VUVVBfQUNUSU9OX0lEKTtcblx0XHRcdGlmICghc2V0dXBTdWNjZWVkZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IG9wZW5MaW5rRnJvbU1hcmtkb3duKHRoaXMuX29wZW5lclNlcnZpY2UsIGxpbmssIG1kU3RyLmlzVHJ1c3RlZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRUcmlnZ2VyU2V0dXAoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuaGFzQnlva01vZGVscykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbnRpbWVudCA9IHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50O1xuXHRcdGlmICghc2VudGltZW50Py5jb21wbGV0ZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93bjtcblx0fVxufVxuXG4vLyNyZWdpb24gVGlwIHRvb2xiYXIgYWN0aW9uc1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUHJldmlvdXNUaXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucHJldmlvdXNUaXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdFRpcC5wcmV2aW91cycsIFwiUHJldmlvdXMgdGlwXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGV2cm9uTGVmdCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLm11bHRpcGxlQ2hhdFRpcHMsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXBUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0VGlwU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFRpcFNlcnZpY2UpO1xuXHRcdGNoYXRUaXBTZXJ2aWNlLm5hdmlnYXRlVG9QcmV2aW91c1RpcCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5leHRUaXBBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubmV4dFRpcCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0VGlwLm5leHQnLCBcIk5leHQgdGlwXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGV2cm9uUmlnaHQsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5tdWx0aXBsZUNoYXRUaXBzLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGlwVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFRpcFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRUaXBTZXJ2aWNlKTtcblx0XHRjaGF0VGlwU2VydmljZS5uYXZpZ2F0ZVRvTmV4dFRpcCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIERpc21pc3NUaXBUb29sYmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmRpc21pc3NUaXBUb29sYmFyJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXRUaXAuZGlzbWlzc0J1dHRvbicsIFwiRGlzbWlzcyB0aXBcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoZWNrLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGlwVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDaGF0VGlwU2VydmljZSkuZGlzbWlzc1RpcEZvclNlc3Npb24oKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gVGlwIGNvbnRleHQgbWVudSBhY3Rpb25zXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEaXNtaXNzVGlwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmRpc21pc3NUaXAnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdFRpcC5kaXNtaXNzJywgXCJEaXNtaXNzIHRoaXMgdGlwXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGlwQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICdjaGF0VGlwJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDaGF0VGlwU2VydmljZSkuZGlzbWlzc1RpcEZvclNlc3Npb24oKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEaXNhYmxlVGlwc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5kaXNhYmxlVGlwcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0VGlwLmRpc2FibGVUaXBzJywgXCJEaXNhYmxlIHRpcHNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmJlbGxTbGFzaCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpcENvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnY2hhdFRpcCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXBUb29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0VGlwU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFRpcFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRhd2FpdCBjaGF0VGlwU2VydmljZS5kaXNhYmxlVGlwcygpO1xuXHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncycsICdjaGF0LnRpcHMuZW5hYmxlZCcpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc2V0RGlzbWlzc2VkVGlwc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5yZXNldERpc21pc3NlZFRpcHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdFRpcC5yZXNldERpc21pc3NlZFRpcHMnLCBcIlJlc2V0IERpc21pc3NlZCBUaXBzXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YWNjZXNzb3IuZ2V0KElDaGF0VGlwU2VydmljZSkuY2xlYXJEaXNtaXNzZWRUaXBzKCk7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSx5QkFBeUI7QUFFOUMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGlDQUFp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
