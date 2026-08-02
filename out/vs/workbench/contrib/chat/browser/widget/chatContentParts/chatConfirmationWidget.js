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
import * as dom from "../../../../../../base/browser/dom.js";
import { EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { Button, ButtonWithDropdown } from "../../../../../../base/browser/ui/button/button.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action, Separator } from "../../../../../../base/common/actions.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { localize } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { renderFileWidgets } from "./chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { ChatMarkdownContentPart } from "./chatMarkdownContentPart.js";
import "./media/chatConfirmationWidget.css";
let ChatQueryTitlePart = class extends Disposable {
  constructor(element, _title, subtitle, _renderer, _instantiationService, _chatMarkdownAnchorService) {
    super();
    this.element = element;
    this._title = _title;
    this._renderer = _renderer;
    this._instantiationService = _instantiationService;
    this._chatMarkdownAnchorService = _chatMarkdownAnchorService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._renderedTitle = this._register(new MutableDisposable());
    this._fileWidgetStore = this._register(new DisposableStore());
    element.classList.add("chat-query-title-part");
    this._renderedTitle.value = this.renderTitle(_title);
    element.append(this._renderedTitle.value.element);
    if (subtitle) {
      const str = this.toMdString(subtitle);
      const renderedTitle = this._register(_renderer.render(str, this.getRenderOptions()));
      const wrapper = document.createElement("small");
      wrapper.appendChild(renderedTitle.element);
      element.append(wrapper);
    }
  }
  get title() {
    return this._title;
  }
  set title(value) {
    this._title = value;
    const next = this.renderTitle(value);
    const previousEl = this._renderedTitle.value?.element;
    if (previousEl?.parentElement) {
      previousEl.replaceWith(next.element);
    } else {
      this.element.appendChild(next.element);
    }
    this._renderedTitle.value = next;
  }
  toMdString(value) {
    if (typeof value === "string") {
      return new MarkdownString("", { supportThemeIcons: true }).appendText(value);
    } else {
      return new MarkdownString(value.value, { supportThemeIcons: true, isTrusted: value.isTrusted });
    }
  }
  setOptions(options) {
    this.options = options;
    this.title = this._title;
  }
  renderTitle(value) {
    const renderedTitle = this._renderer.render(this.toMdString(value), this.getRenderOptions());
    this._fileWidgetStore.clear();
    if (this.options?.renderFileWidgets) {
      renderFileWidgets(renderedTitle.element, this._instantiationService, this._chatMarkdownAnchorService, this._fileWidgetStore);
    }
    return renderedTitle;
  }
  getRenderOptions() {
    return {
      ...this.options?.markdownRenderOptions,
      asyncRenderCallback: () => this._onDidChangeHeight.fire()
    };
  }
};
ChatQueryTitlePart = __decorateClass([
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IChatMarkdownAnchorService)
], ChatQueryTitlePart);
let BaseSimpleChatConfirmationWidget = class extends Disposable {
  constructor(context, options, instantiationService, _markdownRendererService, contextMenuService, contextKeyService) {
    super();
    this.context = context;
    this.instantiationService = instantiationService;
    this._markdownRendererService = _markdownRendererService;
    this._onDidClick = this._register(new Emitter());
    this.messageContentDisposables = this._register(new MutableDisposable());
    const { title, subtitle, message, buttons } = options;
    const elements = dom.h(".chat-confirmation-widget-container@container", [
      dom.h(".chat-confirmation-widget@root", [
        dom.h(".chat-confirmation-widget-title@title"),
        dom.h(".chat-confirmation-widget-message-container", [
          dom.h(".chat-confirmation-widget-message@message"),
          dom.h(".chat-buttons-container@buttonsContainer", [
            dom.h(".chat-buttons@buttons"),
            dom.h(".chat-toolbar@toolbar")
          ])
        ])
      ])
    ]);
    configureAccessibilityContainer(elements.container, title, message);
    this._domNode = elements.root;
    this._register(instantiationService.createInstance(
      ChatQueryTitlePart,
      elements.title,
      title,
      subtitle
    ));
    this.messageElement = elements.message;
    const messageParent = this.messageElement.parentElement;
    const messageNextSibling = this.messageElement.nextSibling;
    this.messageScrollable = this._register(new DomScrollableElement(this.messageElement, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this.messageScrollable.getDomNode().classList.add("chat-confirmation-widget-message-scrollable");
    messageParent?.insertBefore(this.messageScrollable.getDomNode(), messageNextSibling);
    const messageResizeObserver = this._register(new dom.DisposableResizeObserver("BaseSimpleChatConfirmationWidget.message", () => this.messageScrollable.scanDomNode()));
    this._register(messageResizeObserver.observe(this.messageElement));
    this._register(messageResizeObserver.observe(this.messageScrollable.getDomNode()));
    buttons.forEach((buttonData) => {
      const buttonOptions = { ...defaultButtonStyles, small: true, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };
      let button;
      if (buttonData.moreActions) {
        button = new ButtonWithDropdown(elements.buttons, {
          ...buttonOptions,
          contextMenuProvider: contextMenuService,
          addPrimaryActionToDropdown: false,
          actions: buttonData.moreActions.map((action) => {
            if (action instanceof Separator) {
              return action;
            }
            return this._register(new Action(
              action.label,
              action.label,
              void 0,
              !action.disabled,
              () => {
                this._onDidClick.fire({ button: action, isTouchClick: false });
                return Promise.resolve();
              }
            ));
          })
        });
      } else {
        button = new Button(elements.buttons, buttonOptions);
      }
      this._register(button);
      button.label = buttonData.label;
      this._register(button.onDidClick((event) => this._onDidClick.fire({ button: buttonData, isTouchClick: !!event && event.type === TouchEventType.Tap })));
      if (buttonData.onDidChangeDisablement) {
        this._register(buttonData.onDidChangeDisablement((disabled) => button.enabled = !disabled));
      }
    });
    if (options?.toolbarData) {
      const overlay = contextKeyService.createOverlay([
        ["chatConfirmationPartType", options.toolbarData.partType],
        ["chatConfirmationPartSource", options.toolbarData.partSource]
      ]);
      const nestedInsta = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
      this._register(nestedInsta.createInstance(
        MenuWorkbenchToolBar,
        elements.toolbar,
        MenuId.ChatConfirmationMenu,
        {
          // buttonConfigProvider: () => ({ showLabel: false, showIcon: true }),
          menuOptions: {
            arg: options.toolbarData.arg,
            shouldForwardArgs: true
          }
        }
      ));
    }
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  get domNode() {
    return this._domNode;
  }
  setShowButtons(showButton) {
    this.domNode.classList.toggle("hideButtons", !showButton);
  }
  renderMessage(element) {
    const store = new DisposableStore();
    const messageContentResizeObserver = store.add(new dom.DisposableResizeObserver("BaseSimpleChatConfirmationWidget.messageContent", () => this.messageScrollable.scanDomNode()));
    store.add(messageContentResizeObserver.observe(element));
    this.messageContentDisposables.value = store;
    this.messageElement.append(element);
    this.messageScrollable.scanDomNode();
  }
};
BaseSimpleChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService)
], BaseSimpleChatConfirmationWidget);
let SimpleChatConfirmationWidget = class extends BaseSimpleChatConfirmationWidget {
  constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService) {
    super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService);
    this.updateMessage(options.message);
  }
  updateMessage(message) {
    this._renderedMessage?.remove();
    const renderedMessage = this._register(this._markdownRendererService.render(
      typeof message === "string" ? new MarkdownString(message) : message
    ));
    this.renderMessage(renderedMessage.element);
    this._renderedMessage = renderedMessage.element;
  }
};
SimpleChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService)
], SimpleChatConfirmationWidget);
let BaseChatConfirmationWidget = class extends Disposable {
  constructor(_context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
    super();
    this._context = _context;
    this.instantiationService = instantiationService;
    this.markdownRendererService = markdownRendererService;
    this.contextMenuService = contextMenuService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this._onDidClick = this._register(new Emitter());
    this._buttons = [];
    this.messageContentDisposables = this._register(new MutableDisposable());
    this.markdownContentPart = this._register(new MutableDisposable());
    const { title, subtitle, message, buttons, icon, footerBanner } = options;
    this.fileWidgetOptions = options.fileWidgetOptions;
    const elements = dom.h(".chat-confirmation-widget-container@container", [
      dom.h(".chat-confirmation-widget2@root", [
        dom.h(".chat-confirmation-widget-title", [
          dom.h(".chat-title@title"),
          dom.h(".chat-toolbar-container@buttonsContainer", [
            dom.h(".chat-toolbar@toolbar")
          ])
        ]),
        dom.h(".chat-confirmation-widget-message@message"),
        dom.h(".chat-confirmation-widget-buttons", [
          dom.h(".chat-buttons@buttons")
        ])
      ])
    ]);
    configureAccessibilityContainer(elements.container, title, message, footerBanner);
    this._domNode = elements.root;
    this._buttonsDomNode = elements.buttons;
    this._register(instantiationService.createInstance(
      ChatQueryTitlePart,
      elements.title,
      new MarkdownString(icon ? `$(${icon.id}) ${typeof title === "string" ? title : title.value}` : typeof title === "string" ? title : title.value),
      subtitle
    ));
    this.messageElement = elements.message;
    const messageParent = this.messageElement.parentElement;
    const messageNextSibling = this.messageElement.nextSibling;
    this.messageScrollable = this._register(new DomScrollableElement(this.messageElement, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this.messageScrollable.getDomNode().classList.add("chat-confirmation-widget-message-scrollable");
    messageParent?.insertBefore(this.messageScrollable.getDomNode(), messageNextSibling);
    const messageResizeObserver = this._register(new dom.DisposableResizeObserver("BaseChatConfirmationWidget.message", () => this.messageScrollable.scanDomNode()));
    this._register(messageResizeObserver.observe(this.messageElement));
    this._register(messageResizeObserver.observe(this.messageScrollable.getDomNode()));
    if (footerBanner) {
      this.messageScrollable.getDomNode().insertAdjacentElement("afterend", footerBanner);
      if (!footerBanner.hasAttribute("aria-live")) {
        footerBanner.setAttribute("aria-live", "polite");
      }
    }
    this.updateButtons(buttons);
    if (options?.toolbarData) {
      const overlay = contextKeyService.createOverlay([
        ["chatConfirmationPartType", options.toolbarData.partType],
        ["chatConfirmationPartSource", options.toolbarData.partSource]
      ]);
      const nestedInsta = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, overlay])));
      this._register(nestedInsta.createInstance(
        MenuWorkbenchToolBar,
        elements.toolbar,
        MenuId.ChatConfirmationMenu,
        {
          // buttonConfigProvider: () => ({ showLabel: false, showIcon: true }),
          menuOptions: {
            arg: options.toolbarData.arg,
            shouldForwardArgs: true
          }
        }
      ));
    }
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  get domNode() {
    return this._domNode;
  }
  setShowButtons(showButton) {
    this.domNode.classList.toggle("hideButtons", !showButton);
  }
  get codeblocksPartId() {
    return this.markdownContentPart.value?.codeblocksPartId;
  }
  get codeblocks() {
    return this.markdownContentPart.value?.codeblocks;
  }
  updateButtons(buttons) {
    const focusedButton = this._buttons.find((button) => button.widget.hasFocus());
    const focusedDropdown = focusedButton?.widget instanceof ButtonWithDropdown && focusedButton.widget.dropdownButton.hasFocus();
    this._buttons = [];
    while (this._buttonsDomNode.children.length > 0) {
      this._buttonsDomNode.children[0].remove();
    }
    for (const buttonData of buttons) {
      const buttonOptions = { ...defaultButtonStyles, small: true, secondary: buttonData.isSecondary, title: buttonData.tooltip, disabled: buttonData.disabled };
      let button;
      if (buttonData.moreActions) {
        button = new ButtonWithDropdown(this._buttonsDomNode, {
          ...buttonOptions,
          contextMenuProvider: this.contextMenuService,
          addPrimaryActionToDropdown: false,
          actions: buttonData.moreActions.map((action) => {
            if (action instanceof Separator) {
              return action;
            }
            return this._register(new Action(
              action.label,
              action.label,
              void 0,
              !action.disabled,
              () => {
                this._onDidClick.fire({ button: action, isTouchClick: false });
                return Promise.resolve();
              }
            ));
          })
        });
      } else {
        button = new Button(this._buttonsDomNode, buttonOptions);
      }
      this._register(button);
      this._buttons.push({ label: buttonData.label, widget: button });
      button.label = buttonData.label;
      this._register(button.onDidClick((event) => this._onDidClick.fire({ button: buttonData, isTouchClick: !!event && event.type === TouchEventType.Tap })));
      if (buttonData.onDidChangeDisablement) {
        this._register(buttonData.onDidChangeDisablement((disabled) => button.enabled = !disabled));
      }
    }
    const buttonToFocus = focusedButton && this._buttons.find((button) => button.label === focusedButton.label)?.widget;
    if (focusedDropdown && buttonToFocus instanceof ButtonWithDropdown) {
      buttonToFocus.dropdownButton.focus();
    } else {
      buttonToFocus?.focus();
    }
  }
  renderMessage(element) {
    this.markdownContentPart.clear();
    if (!dom.isHTMLElement(element)) {
      const part = this._register(this.instantiationService.createInstance(
        ChatMarkdownContentPart,
        {
          kind: "markdownContent",
          content: typeof element === "string" ? new MarkdownString().appendMarkdown(element) : element
        },
        this._context,
        this._context.editorPool,
        false,
        this._context.codeBlockStartIndex,
        this.markdownRendererService,
        void 0,
        this._context.currentWidth.get(),
        {
          allowInlineDiffs: true,
          horizontalPadding: 6
        }
      ));
      renderFileWidgets(part.domNode, this.instantiationService, this.chatMarkdownAnchorService, this._store, this.fileWidgetOptions);
      this.markdownContentPart.value = part;
      element = part.domNode;
    }
    dom.clearNode(this.messageElement);
    const store = new DisposableStore();
    const messageContentResizeObserver = store.add(new dom.DisposableResizeObserver("BaseChatConfirmationWidget.messageContent", () => this.messageScrollable.scanDomNode()));
    store.add(messageContentResizeObserver.observe(element));
    if (this.markdownContentPart.value) {
      store.add(this.markdownContentPart.value.onDidChangeHeight(() => this.messageScrollable.scanDomNode()));
    }
    this.messageContentDisposables.value = store;
    this.messageElement.append(element);
    this.messageScrollable.scanDomNode();
  }
};
BaseChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatMarkdownAnchorService)
], BaseChatConfirmationWidget);
let ChatConfirmationWidget = class extends BaseChatConfirmationWidget {
  constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
    super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService);
    this.renderMessage(options.message);
  }
  updateMessage(message) {
    this._renderedMessage?.remove();
    const renderedMessage = this._register(this.markdownRendererService.render(
      typeof message === "string" ? new MarkdownString(message) : message
    ));
    this.renderMessage(renderedMessage.element);
    this._renderedMessage = renderedMessage.element;
  }
};
ChatConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatMarkdownAnchorService)
], ChatConfirmationWidget);
let ChatCustomConfirmationWidget = class extends BaseChatConfirmationWidget {
  constructor(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService) {
    super(context, options, instantiationService, markdownRendererService, contextMenuService, contextKeyService, chatMarkdownAnchorService);
    this.renderMessage(options.message);
  }
};
ChatCustomConfirmationWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatMarkdownAnchorService)
], ChatCustomConfirmationWidget);
function configureAccessibilityContainer(container, title, message, footerBanner) {
  container.tabIndex = 0;
  const titleAsString = typeof title === "string" ? title : title.value;
  const messageAsString = typeof message === "string" ? message : message && "value" in message ? message.value : message && "textContent" in message ? message.textContent : "";
  const bannerAsString = footerBanner?.textContent?.trim() ?? "";
  container.setAttribute("aria-label", bannerAsString ? localize("chat.confirmationWidget.ariaLabelWithBannerTitleMessageBanner", "Chat Confirmation Dialog {0} {1} {2}", titleAsString, messageAsString, bannerAsString) : localize("chat.confirmationWidget.ariaLabel", "Chat Confirmation Dialog {0} {1}", titleAsString, messageAsString));
  container.classList.add("chat-confirmation-widget-container");
}
export {
  ChatConfirmationWidget,
  ChatCustomConfirmationWidget,
  ChatQueryTitlePart,
  SimpleChatConfirmationWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29uZmlybWF0aW9uV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24sIE1hcmtkb3duUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIEJ1dHRvbldpdGhEcm9wZG93biwgSUJ1dHRvbiwgSUJ1dHRvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHR5cGUgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElSZW5kZXJGaWxlV2lkZ2V0c09wdGlvbnMsIHJlbmRlckZpbGVXaWRnZXRzIH0gZnJvbSAnLi9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LCBJQ2hhdE1hcmtkb3duQ29udGVudFBhcnRPcHRpb25zIH0gZnJvbSAnLi9jaGF0TWFya2Rvd25Db250ZW50UGFydC5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvY2hhdENvbmZpcm1hdGlvbldpZGdldC5jc3MnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPFQ+IHtcblx0bGFiZWw6IHN0cmluZztcblx0aXNTZWNvbmRhcnk/OiBib29sZWFuO1xuXHR0b29sdGlwPzogc3RyaW5nO1xuXHRkYXRhOiBUO1xuXHRkaXNhYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlzYWJsZW1lbnQ/OiBFdmVudDxib29sZWFuPjtcblx0bW9yZUFjdGlvbnM/OiAoSUNoYXRDb25maXJtYXRpb25CdXR0b248VD4gfCBTZXBhcmF0b3IpW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRDb25maXJtYXRpb25CdXR0b25DbGlja0V2ZW50PFQ+IHtcblx0cmVhZG9ubHkgYnV0dG9uOiBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbjxUPjtcblx0LyoqXG5cdCAqIFRydWUgd2hlbiB0aGUgY2xpY2sgb3JpZ2luYXRlZCBmcm9tIGEgdG91Y2ggdGFwICh2cy4gbW91c2Uva2V5Ym9hcmQvcHJvZ3JhbW1hdGljKS5cblx0ICogQ2FsbGVycyB0aGF0IHJlc3RvcmUgZm9jdXMgYWZ0ZXIgY29uZmlybWF0aW9uIChlLmcuIHRvIHRoZSBjaGF0IGlucHV0KSBzaG91bGRcblx0ICogc2tpcCB0aGF0IGJlaGF2aW9yIHdoZW4gdGhpcyBpcyB0cnVlIHRvIGF2b2lkIHBvcHBpbmcgdGhlIG9uLXNjcmVlbiBrZXlib2FyZCBvbiBtb2JpbGUuXG5cdCAqL1xuXHRyZWFkb25seSBpc1RvdWNoQ2xpY2s6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRDb25maXJtYXRpb25XaWRnZXRPcHRpb25zPFQ+IHtcblx0dGl0bGU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0bWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRzdWJ0aXRsZT86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0YnV0dG9uczogSUNoYXRDb25maXJtYXRpb25CdXR0b248VD5bXTtcblx0dG9vbGJhckRhdGE/OiB7IGFyZzogdW5rbm93bjsgcGFydFR5cGU6IHN0cmluZzsgcGFydFNvdXJjZT86IHN0cmluZyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UXVlcnlUaXRsZVBhcnRPcHRpb25zIHtcblx0cmVhZG9ubHkgbWFya2Rvd25SZW5kZXJPcHRpb25zPzogTWFya2Rvd25SZW5kZXJPcHRpb25zO1xuXHRyZWFkb25seSByZW5kZXJGaWxlV2lkZ2V0cz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UXVlcnlUaXRsZVBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmVkVGl0bGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVJlbmRlcmVkTWFya2Rvd24+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlV2lkZ2V0U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIG9wdGlvbnM6IElDaGF0UXVlcnlUaXRsZVBhcnRPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBnZXQgdGl0bGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpdGxlO1xuXHR9XG5cblx0cHVibGljIHNldCB0aXRsZSh2YWx1ZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKSB7XG5cdFx0dGhpcy5fdGl0bGUgPSB2YWx1ZTtcblxuXHRcdGNvbnN0IG5leHQgPSB0aGlzLnJlbmRlclRpdGxlKHZhbHVlKTtcblxuXHRcdGNvbnN0IHByZXZpb3VzRWwgPSB0aGlzLl9yZW5kZXJlZFRpdGxlLnZhbHVlPy5lbGVtZW50O1xuXHRcdGlmIChwcmV2aW91c0VsPy5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRwcmV2aW91c0VsLnJlcGxhY2VXaXRoKG5leHQuZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChuZXh0LmVsZW1lbnQpOyAvLyB1bnJlYWNoYWJsZT9cblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJlZFRpdGxlLnZhbHVlID0gbmV4dDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSBfdGl0bGU6IElNYXJrZG93blN0cmluZyB8IHN0cmluZyxcblx0XHRzdWJ0aXRsZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVuZGVyZXI6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U6IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXJ5LXRpdGxlLXBhcnQnKTtcblxuXHRcdHRoaXMuX3JlbmRlcmVkVGl0bGUudmFsdWUgPSB0aGlzLnJlbmRlclRpdGxlKF90aXRsZSk7XG5cdFx0ZWxlbWVudC5hcHBlbmQodGhpcy5fcmVuZGVyZWRUaXRsZS52YWx1ZS5lbGVtZW50KTtcblx0XHRpZiAoc3VidGl0bGUpIHtcblx0XHRcdGNvbnN0IHN0ciA9IHRoaXMudG9NZFN0cmluZyhzdWJ0aXRsZSk7XG5cdFx0XHRjb25zdCByZW5kZXJlZFRpdGxlID0gdGhpcy5fcmVnaXN0ZXIoX3JlbmRlcmVyLnJlbmRlcihzdHIsIHRoaXMuZ2V0UmVuZGVyT3B0aW9ucygpKSk7XG5cdFx0XHRjb25zdCB3cmFwcGVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc21hbGwnKTtcblx0XHRcdHdyYXBwZXIuYXBwZW5kQ2hpbGQocmVuZGVyZWRUaXRsZS5lbGVtZW50KTtcblx0XHRcdGVsZW1lbnQuYXBwZW5kKHdyYXBwZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdG9NZFN0cmluZyh2YWx1ZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSkuYXBwZW5kVGV4dCh2YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcodmFsdWUudmFsdWUsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsIGlzVHJ1c3RlZDogdmFsdWUuaXNUcnVzdGVkIH0pO1xuXHRcdH1cblx0fVxuXG5cdHNldE9wdGlvbnMob3B0aW9uczogSUNoYXRRdWVyeVRpdGxlUGFydE9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMudGl0bGUgPSB0aGlzLl90aXRsZTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVGl0bGUodmFsdWU6IElNYXJrZG93blN0cmluZyB8IHN0cmluZyk6IElSZW5kZXJlZE1hcmtkb3duIHtcblx0XHRjb25zdCByZW5kZXJlZFRpdGxlID0gdGhpcy5fcmVuZGVyZXIucmVuZGVyKHRoaXMudG9NZFN0cmluZyh2YWx1ZSksIHRoaXMuZ2V0UmVuZGVyT3B0aW9ucygpKTtcblx0XHR0aGlzLl9maWxlV2lkZ2V0U3RvcmUuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5vcHRpb25zPy5yZW5kZXJGaWxlV2lkZ2V0cykge1xuXHRcdFx0cmVuZGVyRmlsZVdpZGdldHMocmVuZGVyZWRUaXRsZS5lbGVtZW50LCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5fY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSwgdGhpcy5fZmlsZVdpZGdldFN0b3JlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlbmRlcmVkVGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIGdldFJlbmRlck9wdGlvbnMoKTogTWFya2Rvd25SZW5kZXJPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4udGhpcy5vcHRpb25zPy5tYXJrZG93blJlbmRlck9wdGlvbnMsXG5cdFx0XHRhc3luY1JlbmRlckNhbGxiYWNrOiAoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCksXG5cdFx0fTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlU2ltcGxlQ2hhdENvbmZpcm1hdGlvbldpZGdldDxUPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRDb25maXJtYXRpb25CdXR0b25DbGlja0V2ZW50PFQ+PigpKTtcblx0Z2V0IG9uRGlkQ2xpY2soKTogRXZlbnQ8SUNoYXRDb25maXJtYXRpb25CdXR0b25DbGlja0V2ZW50PFQ+PiB7IHJldHVybiB0aGlzLl9vbkRpZENsaWNrLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdGdldCBkb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdHNldFNob3dCdXR0b25zKHNob3dCdXR0b246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZUJ1dHRvbnMnLCAhc2hvd0J1dHRvbik7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlU2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZUNvbnRlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRvcHRpb25zOiBJQ2hhdENvbmZpcm1hdGlvbldpZGdldE9wdGlvbnM8VD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgeyB0aXRsZSwgc3VidGl0bGUsIG1lc3NhZ2UsIGJ1dHRvbnMgfSA9IG9wdGlvbnM7XG5cblx0XHRjb25zdCBlbGVtZW50cyA9IGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LWNvbnRhaW5lckBjb250YWluZXInLCBbXG5cdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldEByb290JywgW1xuXHRcdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC10aXRsZUB0aXRsZScpLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC1tZXNzYWdlLWNvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC1tZXNzYWdlQG1lc3NhZ2UnKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYnV0dG9ucy1jb250YWluZXJAYnV0dG9uc0NvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1idXR0b25zQGJ1dHRvbnMnKSxcblx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC10b29sYmFyQHRvb2xiYXInKSxcblx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XSksXG5cdFx0XHRdKSxcblx0XHRdKTtcblx0XHRjb25maWd1cmVBY2Nlc3NpYmlsaXR5Q29udGFpbmVyKGVsZW1lbnRzLmNvbnRhaW5lciwgdGl0bGUsIG1lc3NhZ2UpO1xuXHRcdHRoaXMuX2RvbU5vZGUgPSBlbGVtZW50cy5yb290O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0UXVlcnlUaXRsZVBhcnQsXG5cdFx0XHRlbGVtZW50cy50aXRsZSxcblx0XHRcdHRpdGxlLFxuXHRcdFx0c3VidGl0bGUsXG5cdFx0KSk7XG5cblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50ID0gZWxlbWVudHMubWVzc2FnZTtcblx0XHRjb25zdCBtZXNzYWdlUGFyZW50ID0gdGhpcy5tZXNzYWdlRWxlbWVudC5wYXJlbnRFbGVtZW50O1xuXHRcdGNvbnN0IG1lc3NhZ2VOZXh0U2libGluZyA9IHRoaXMubWVzc2FnZUVsZW1lbnQubmV4dFNpYmxpbmc7XG5cdFx0dGhpcy5tZXNzYWdlU2Nyb2xsYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLm1lc3NhZ2VFbGVtZW50LCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMubWVzc2FnZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLmNsYXNzTGlzdC5hZGQoJ2NoYXQtY29uZmlybWF0aW9uLXdpZGdldC1tZXNzYWdlLXNjcm9sbGFibGUnKTtcblx0XHRtZXNzYWdlUGFyZW50Py5pbnNlcnRCZWZvcmUodGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCksIG1lc3NhZ2VOZXh0U2libGluZyk7XG5cdFx0Y29uc3QgbWVzc2FnZVJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0Jhc2VTaW1wbGVDaGF0Q29uZmlybWF0aW9uV2lkZ2V0Lm1lc3NhZ2UnLCAoKSA9PiB0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZXNzYWdlUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLm1lc3NhZ2VFbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWVzc2FnZVJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpKTtcblxuXHRcdC8vIENyZWF0ZSBidXR0b25zXG5cdFx0YnV0dG9ucy5mb3JFYWNoKGJ1dHRvbkRhdGEgPT4ge1xuXHRcdFx0Y29uc3QgYnV0dG9uT3B0aW9uczogSUJ1dHRvbk9wdGlvbnMgPSB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNtYWxsOiB0cnVlLCBzZWNvbmRhcnk6IGJ1dHRvbkRhdGEuaXNTZWNvbmRhcnksIHRpdGxlOiBidXR0b25EYXRhLnRvb2x0aXAsIGRpc2FibGVkOiBidXR0b25EYXRhLmRpc2FibGVkIH07XG5cblx0XHRcdGxldCBidXR0b246IElCdXR0b247XG5cdFx0XHRpZiAoYnV0dG9uRGF0YS5tb3JlQWN0aW9ucykge1xuXHRcdFx0XHRidXR0b24gPSBuZXcgQnV0dG9uV2l0aERyb3Bkb3duKGVsZW1lbnRzLmJ1dHRvbnMsIHtcblx0XHRcdFx0XHQuLi5idXR0b25PcHRpb25zLFxuXHRcdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IGNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdFx0XHRhZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93bjogZmFsc2UsXG5cdFx0XHRcdFx0YWN0aW9uczogYnV0dG9uRGF0YS5tb3JlQWN0aW9ucy5tYXAoYWN0aW9uID0+IHtcblx0XHRcdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFjdGlvbjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHQhYWN0aW9uLmRpc2FibGVkLFxuXHRcdFx0XHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDbGljay5maXJlKHsgYnV0dG9uOiBhY3Rpb24sIGlzVG91Y2hDbGljazogZmFsc2UgfSk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnV0dG9uID0gbmV3IEJ1dHRvbihlbGVtZW50cy5idXR0b25zLCBidXR0b25PcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uKTtcblx0XHRcdGJ1dHRvbi5sYWJlbCA9IGJ1dHRvbkRhdGEubGFiZWw7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljayhldmVudCA9PiB0aGlzLl9vbkRpZENsaWNrLmZpcmUoeyBidXR0b246IGJ1dHRvbkRhdGEsIGlzVG91Y2hDbGljazogISFldmVudCAmJiBldmVudC50eXBlID09PSBUb3VjaEV2ZW50VHlwZS5UYXAgfSkpKTtcblx0XHRcdGlmIChidXR0b25EYXRhLm9uRGlkQ2hhbmdlRGlzYWJsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uRGF0YS5vbkRpZENoYW5nZURpc2FibGVtZW50KGRpc2FibGVkID0+IGJ1dHRvbi5lbmFibGVkID0gIWRpc2FibGVkKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgdG9vbGJhciBpZiBhY3Rpb25zIGFyZSBwcm92aWRlZFxuXHRcdGlmIChvcHRpb25zPy50b29sYmFyRGF0YSkge1xuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0XHRbJ2NoYXRDb25maXJtYXRpb25QYXJ0VHlwZScsIG9wdGlvbnMudG9vbGJhckRhdGEucGFydFR5cGVdLFxuXHRcdFx0XHRbJ2NoYXRDb25maXJtYXRpb25QYXJ0U291cmNlJywgb3B0aW9ucy50b29sYmFyRGF0YS5wYXJ0U291cmNlXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgbmVzdGVkSW5zdGEgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgb3ZlcmxheV0pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihuZXN0ZWRJbnN0YS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0TWVudVdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRcdGVsZW1lbnRzLnRvb2xiYXIsXG5cdFx0XHRcdE1lbnVJZC5DaGF0Q29uZmlybWF0aW9uTWVudSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIGJ1dHRvbkNvbmZpZ1Byb3ZpZGVyOiAoKSA9PiAoeyBzaG93TGFiZWw6IGZhbHNlLCBzaG93SWNvbjogdHJ1ZSB9KSxcblx0XHRcdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRcdFx0YXJnOiBvcHRpb25zLnRvb2xiYXJEYXRhLmFyZyxcblx0XHRcdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlck1lc3NhZ2UoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtZXNzYWdlQ29udGVudFJlc2l6ZU9ic2VydmVyID0gc3RvcmUuYWRkKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdCYXNlU2ltcGxlQ2hhdENvbmZpcm1hdGlvbldpZGdldC5tZXNzYWdlQ29udGVudCcsICgpID0+IHRoaXMubWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKSkpO1xuXHRcdHN0b3JlLmFkZChtZXNzYWdlQ29udGVudFJlc2l6ZU9ic2VydmVyLm9ic2VydmUoZWxlbWVudCkpO1xuXHRcdHRoaXMubWVzc2FnZUNvbnRlbnREaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXHRcdHRoaXMubWVzc2FnZUVsZW1lbnQuYXBwZW5kKGVsZW1lbnQpO1xuXHRcdHRoaXMubWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0fVxufVxuXG4vKiogQGRlcHJlY2F0ZWQgVXNlIENoYXRDb25maXJtYXRpb25XaWRnZXQgaW5zdGVhZCAqL1xuZXhwb3J0IGNsYXNzIFNpbXBsZUNoYXRDb25maXJtYXRpb25XaWRnZXQ8VD4gZXh0ZW5kcyBCYXNlU2ltcGxlQ2hhdENvbmZpcm1hdGlvbldpZGdldDxUPiB7XG5cdHByaXZhdGUgX3JlbmRlcmVkTWVzc2FnZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0b3B0aW9uczogSUNoYXRDb25maXJtYXRpb25XaWRnZXRPcHRpb25zPFQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGV4dCwgb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UsIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnVwZGF0ZU1lc3NhZ2Uob3B0aW9ucy5tZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkTWVzc2FnZT8ucmVtb3ZlKCk7XG5cdFx0Y29uc3QgcmVuZGVyZWRNZXNzYWdlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKFxuXHRcdFx0dHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UpIDogbWVzc2FnZSxcblx0XHQpKTtcblx0XHR0aGlzLnJlbmRlck1lc3NhZ2UocmVuZGVyZWRNZXNzYWdlLmVsZW1lbnQpO1xuXHRcdHRoaXMuX3JlbmRlcmVkTWVzc2FnZSA9IHJlbmRlcmVkTWVzc2FnZS5lbGVtZW50O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRDb25maXJtYXRpb25XaWRnZXQyT3B0aW9uczxUPiB7XG5cdHRpdGxlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IEhUTUxFbGVtZW50O1xuXHRpY29uPzogVGhlbWVJY29uO1xuXHRzdWJ0aXRsZT86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0Zm9vdGVyQmFubmVyPzogSFRNTEVsZW1lbnQ7XG5cdGJ1dHRvbnM6IElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPFQ+W107XG5cdHRvb2xiYXJEYXRhPzogeyBhcmc6IHVua25vd247IHBhcnRUeXBlOiBzdHJpbmc7IHBhcnRTb3VyY2U/OiBzdHJpbmcgfTtcblx0ZmlsZVdpZGdldE9wdGlvbnM/OiBJUmVuZGVyRmlsZVdpZGdldHNPcHRpb25zO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlQ2hhdENvbmZpcm1hdGlvbldpZGdldDxUPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRDb25maXJtYXRpb25CdXR0b25DbGlja0V2ZW50PFQ+PigpKTtcblx0Z2V0IG9uRGlkQ2xpY2soKTogRXZlbnQ8SUNoYXRDb25maXJtYXRpb25CdXR0b25DbGlja0V2ZW50PFQ+PiB7IHJldHVybiB0aGlzLl9vbkRpZENsaWNrLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdGdldCBkb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgX2J1dHRvbnNEb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfYnV0dG9uczogeyByZWFkb25seSBsYWJlbDogc3RyaW5nOyByZWFkb25seSB3aWRnZXQ6IElCdXR0b24gfVtdID0gW107XG5cblx0c2V0U2hvd0J1dHRvbnMoc2hvd0J1dHRvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlQnV0dG9ucycsICFzaG93QnV0dG9uKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VTY3JvbGxhYmxlOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlQ29udGVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25Db250ZW50UGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0TWFya2Rvd25Db250ZW50UGFydD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZVdpZGdldE9wdGlvbnM6IElSZW5kZXJGaWxlV2lkZ2V0c09wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIGdldCBjb2RlYmxvY2tzUGFydElkKCkge1xuXHRcdHJldHVybiB0aGlzLm1hcmtkb3duQ29udGVudFBhcnQudmFsdWU/LmNvZGVibG9ja3NQYXJ0SWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3MoKSB7XG5cdFx0cmV0dXJuIHRoaXMubWFya2Rvd25Db250ZW50UGFydC52YWx1ZT8uY29kZWJsb2Nrcztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0b3B0aW9uczogSUNoYXRDb25maXJtYXRpb25XaWRnZXQyT3B0aW9uczxUPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U6IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgeyB0aXRsZSwgc3VidGl0bGUsIG1lc3NhZ2UsIGJ1dHRvbnMsIGljb24sIGZvb3RlckJhbm5lciB9ID0gb3B0aW9ucztcblx0XHR0aGlzLmZpbGVXaWRnZXRPcHRpb25zID0gb3B0aW9ucy5maWxlV2lkZ2V0T3B0aW9ucztcblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtY29udGFpbmVyQGNvbnRhaW5lcicsIFtcblx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0MkByb290JywgW1xuXHRcdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC10aXRsZScsIFtcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdGl0bGVAdGl0bGUnKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdG9vbGJhci1jb250YWluZXJAYnV0dG9uc0NvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC10b29sYmFyQHRvb2xiYXInKSxcblx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LW1lc3NhZ2VAbWVzc2FnZScpLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldC1idXR0b25zJywgW1xuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1idXR0b25zQGJ1dHRvbnMnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRdKSxdKTtcblxuXHRcdGNvbmZpZ3VyZUFjY2Vzc2liaWxpdHlDb250YWluZXIoZWxlbWVudHMuY29udGFpbmVyLCB0aXRsZSwgbWVzc2FnZSwgZm9vdGVyQmFubmVyKTtcblx0XHR0aGlzLl9kb21Ob2RlID0gZWxlbWVudHMucm9vdDtcblx0XHR0aGlzLl9idXR0b25zRG9tTm9kZSA9IGVsZW1lbnRzLmJ1dHRvbnM7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRRdWVyeVRpdGxlUGFydCxcblx0XHRcdGVsZW1lbnRzLnRpdGxlLFxuXHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKGljb24gPyBgJCgke2ljb24uaWR9KSAke3R5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlLnZhbHVlfWAgOiB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS52YWx1ZSksXG5cdFx0XHRzdWJ0aXRsZSxcblx0XHQpKTtcblxuXHRcdHRoaXMubWVzc2FnZUVsZW1lbnQgPSBlbGVtZW50cy5tZXNzYWdlO1xuXHRcdGNvbnN0IG1lc3NhZ2VQYXJlbnQgPSB0aGlzLm1lc3NhZ2VFbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0Y29uc3QgbWVzc2FnZU5leHRTaWJsaW5nID0gdGhpcy5tZXNzYWdlRWxlbWVudC5uZXh0U2libGluZztcblx0XHR0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMubWVzc2FnZUVsZW1lbnQsIHtcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdGNvbnN1bWVNb3VzZVdoZWVsSWZTY3JvbGxiYXJJc05lZWRlZDogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0dGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkuY2xhc3NMaXN0LmFkZCgnY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LW1lc3NhZ2Utc2Nyb2xsYWJsZScpO1xuXHRcdG1lc3NhZ2VQYXJlbnQ/Lmluc2VydEJlZm9yZSh0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLmdldERvbU5vZGUoKSwgbWVzc2FnZU5leHRTaWJsaW5nKTtcblx0XHRjb25zdCBtZXNzYWdlUmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQmFzZUNoYXRDb25maXJtYXRpb25XaWRnZXQubWVzc2FnZScsICgpID0+IHRoaXMubWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1lc3NhZ2VSZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMubWVzc2FnZUVsZW1lbnQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZXNzYWdlUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLm1lc3NhZ2VTY3JvbGxhYmxlLmdldERvbU5vZGUoKSkpO1xuXG5cdFx0aWYgKGZvb3RlckJhbm5lcikge1xuXHRcdFx0dGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkuaW5zZXJ0QWRqYWNlbnRFbGVtZW50KCdhZnRlcmVuZCcsIGZvb3RlckJhbm5lcik7XG5cdFx0XHRpZiAoIWZvb3RlckJhbm5lci5oYXNBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScpKSB7XG5cdFx0XHRcdGZvb3RlckJhbm5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUJ1dHRvbnMoYnV0dG9ucyk7XG5cblx0XHQvLyBDcmVhdGUgdG9vbGJhciBpZiBhY3Rpb25zIGFyZSBwcm92aWRlZFxuXHRcdGlmIChvcHRpb25zPy50b29sYmFyRGF0YSkge1xuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0XHRbJ2NoYXRDb25maXJtYXRpb25QYXJ0VHlwZScsIG9wdGlvbnMudG9vbGJhckRhdGEucGFydFR5cGVdLFxuXHRcdFx0XHRbJ2NoYXRDb25maXJtYXRpb25QYXJ0U291cmNlJywgb3B0aW9ucy50b29sYmFyRGF0YS5wYXJ0U291cmNlXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgbmVzdGVkSW5zdGEgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgb3ZlcmxheV0pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihuZXN0ZWRJbnN0YS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0TWVudVdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRcdGVsZW1lbnRzLnRvb2xiYXIsXG5cdFx0XHRcdE1lbnVJZC5DaGF0Q29uZmlybWF0aW9uTWVudSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIGJ1dHRvbkNvbmZpZ1Byb3ZpZGVyOiAoKSA9PiAoeyBzaG93TGFiZWw6IGZhbHNlLCBzaG93SWNvbjogdHJ1ZSB9KSxcblx0XHRcdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRcdFx0YXJnOiBvcHRpb25zLnRvb2xiYXJEYXRhLmFyZyxcblx0XHRcdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlQnV0dG9ucyhidXR0b25zOiBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbjxUPltdKSB7XG5cdFx0Y29uc3QgZm9jdXNlZEJ1dHRvbiA9IHRoaXMuX2J1dHRvbnMuZmluZChidXR0b24gPT4gYnV0dG9uLndpZGdldC5oYXNGb2N1cygpKTtcblx0XHRjb25zdCBmb2N1c2VkRHJvcGRvd24gPSBmb2N1c2VkQnV0dG9uPy53aWRnZXQgaW5zdGFuY2VvZiBCdXR0b25XaXRoRHJvcGRvd24gJiYgZm9jdXNlZEJ1dHRvbi53aWRnZXQuZHJvcGRvd25CdXR0b24uaGFzRm9jdXMoKTtcblx0XHR0aGlzLl9idXR0b25zID0gW107XG5cblx0XHR3aGlsZSAodGhpcy5fYnV0dG9uc0RvbU5vZGUuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fYnV0dG9uc0RvbU5vZGUuY2hpbGRyZW5bMF0ucmVtb3ZlKCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBidXR0b25EYXRhIG9mIGJ1dHRvbnMpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbk9wdGlvbnM6IElCdXR0b25PcHRpb25zID0geyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzbWFsbDogdHJ1ZSwgc2Vjb25kYXJ5OiBidXR0b25EYXRhLmlzU2Vjb25kYXJ5LCB0aXRsZTogYnV0dG9uRGF0YS50b29sdGlwLCBkaXNhYmxlZDogYnV0dG9uRGF0YS5kaXNhYmxlZCB9O1xuXG5cdFx0XHRsZXQgYnV0dG9uOiBJQnV0dG9uO1xuXHRcdFx0aWYgKGJ1dHRvbkRhdGEubW9yZUFjdGlvbnMpIHtcblx0XHRcdFx0YnV0dG9uID0gbmV3IEJ1dHRvbldpdGhEcm9wZG93bih0aGlzLl9idXR0b25zRG9tTm9kZSwge1xuXHRcdFx0XHRcdC4uLmJ1dHRvbk9wdGlvbnMsXG5cdFx0XHRcdFx0Y29udGV4dE1lbnVQcm92aWRlcjogdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdFx0YWRkUHJpbWFyeUFjdGlvblRvRHJvcGRvd246IGZhbHNlLFxuXHRcdFx0XHRcdGFjdGlvbnM6IGJ1dHRvbkRhdGEubW9yZUFjdGlvbnMubWFwKGFjdGlvbiA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhY3Rpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihcblx0XHRcdFx0XHRcdFx0YWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0IWFjdGlvbi5kaXNhYmxlZCxcblx0XHRcdFx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZSh7IGJ1dHRvbjogYWN0aW9uLCBpc1RvdWNoQ2xpY2s6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ1dHRvbiA9IG5ldyBCdXR0b24odGhpcy5fYnV0dG9uc0RvbU5vZGUsIGJ1dHRvbk9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24pO1xuXHRcdFx0dGhpcy5fYnV0dG9ucy5wdXNoKHsgbGFiZWw6IGJ1dHRvbkRhdGEubGFiZWwsIHdpZGdldDogYnV0dG9uIH0pO1xuXHRcdFx0YnV0dG9uLmxhYmVsID0gYnV0dG9uRGF0YS5sYWJlbDtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbi5vbkRpZENsaWNrKGV2ZW50ID0+IHRoaXMuX29uRGlkQ2xpY2suZmlyZSh7IGJ1dHRvbjogYnV0dG9uRGF0YSwgaXNUb3VjaENsaWNrOiAhIWV2ZW50ICYmIGV2ZW50LnR5cGUgPT09IFRvdWNoRXZlbnRUeXBlLlRhcCB9KSkpO1xuXHRcdFx0aWYgKGJ1dHRvbkRhdGEub25EaWRDaGFuZ2VEaXNhYmxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihidXR0b25EYXRhLm9uRGlkQ2hhbmdlRGlzYWJsZW1lbnQoZGlzYWJsZWQgPT4gYnV0dG9uLmVuYWJsZWQgPSAhZGlzYWJsZWQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBidXR0b25Ub0ZvY3VzID0gZm9jdXNlZEJ1dHRvbiAmJiB0aGlzLl9idXR0b25zLmZpbmQoYnV0dG9uID0+IGJ1dHRvbi5sYWJlbCA9PT0gZm9jdXNlZEJ1dHRvbi5sYWJlbCk/LndpZGdldDtcblx0XHRpZiAoZm9jdXNlZERyb3Bkb3duICYmIGJ1dHRvblRvRm9jdXMgaW5zdGFuY2VvZiBCdXR0b25XaXRoRHJvcGRvd24pIHtcblx0XHRcdGJ1dHRvblRvRm9jdXMuZHJvcGRvd25CdXR0b24uZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnV0dG9uVG9Gb2N1cz8uZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyTWVzc2FnZShlbGVtZW50OiBIVE1MRWxlbWVudCB8IElNYXJrZG93blN0cmluZyB8IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubWFya2Rvd25Db250ZW50UGFydC5jbGVhcigpO1xuXG5cdFx0aWYgKCFkb20uaXNIVE1MRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1hcmtkb3duQ29udGVudFBhcnQsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0XHRjb250ZW50OiB0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihlbGVtZW50KSA6IGVsZW1lbnRcblx0XHRcdFx0fSxcblx0XHRcdFx0dGhpcy5fY29udGV4dCxcblx0XHRcdFx0dGhpcy5fY29udGV4dC5lZGl0b3JQb29sLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dGhpcy5fY29udGV4dC5jb2RlQmxvY2tTdGFydEluZGV4LFxuXHRcdFx0XHR0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHRoaXMuX2NvbnRleHQuY3VycmVudFdpZHRoLmdldCgpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWxsb3dJbmxpbmVEaWZmczogdHJ1ZSxcblx0XHRcdFx0XHRob3Jpem9udGFsUGFkZGluZzogNixcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRNYXJrZG93bkNvbnRlbnRQYXJ0T3B0aW9ucyxcblx0XHRcdCkpO1xuXHRcdFx0cmVuZGVyRmlsZVdpZGdldHMocGFydC5kb21Ob2RlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIHRoaXMuX3N0b3JlLCB0aGlzLmZpbGVXaWRnZXRPcHRpb25zKTtcblxuXHRcdFx0dGhpcy5tYXJrZG93bkNvbnRlbnRQYXJ0LnZhbHVlID0gcGFydDtcblx0XHRcdGVsZW1lbnQgPSBwYXJ0LmRvbU5vZGU7XG5cdFx0fVxuXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLm1lc3NhZ2VFbGVtZW50KTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtZXNzYWdlQ29udGVudFJlc2l6ZU9ic2VydmVyID0gc3RvcmUuYWRkKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdCYXNlQ2hhdENvbmZpcm1hdGlvbldpZGdldC5tZXNzYWdlQ29udGVudCcsICgpID0+IHRoaXMubWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKSkpO1xuXHRcdHN0b3JlLmFkZChtZXNzYWdlQ29udGVudFJlc2l6ZU9ic2VydmVyLm9ic2VydmUoZWxlbWVudCkpO1xuXHRcdGlmICh0aGlzLm1hcmtkb3duQ29udGVudFBhcnQudmFsdWUpIHtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLm1hcmtkb3duQ29udGVudFBhcnQudmFsdWUub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4gdGhpcy5tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpKSk7XG5cdFx0fVxuXHRcdHRoaXMubWVzc2FnZUNvbnRlbnREaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXHRcdHRoaXMubWVzc2FnZUVsZW1lbnQuYXBwZW5kKGVsZW1lbnQpO1xuXHRcdHRoaXMubWVzc2FnZVNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0fVxufVxuZXhwb3J0IGNsYXNzIENoYXRDb25maXJtYXRpb25XaWRnZXQ8VD4gZXh0ZW5kcyBCYXNlQ2hhdENvbmZpcm1hdGlvbldpZGdldDxUPiB7XG5cdHByaXZhdGUgX3JlbmRlcmVkTWVzc2FnZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0b3B0aW9uczogSUNoYXRDb25maXJtYXRpb25XaWRnZXQyT3B0aW9uczxUPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIGNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U6IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0LCBvcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZSwgbWFya2Rvd25SZW5kZXJlclNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShvcHRpb25zLm1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZU1lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyZWRNZXNzYWdlPy5yZW1vdmUoKTtcblx0XHRjb25zdCByZW5kZXJlZE1lc3NhZ2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihcblx0XHRcdHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlKSA6IG1lc3NhZ2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKHJlbmRlcmVkTWVzc2FnZS5lbGVtZW50KTtcblx0XHR0aGlzLl9yZW5kZXJlZE1lc3NhZ2UgPSByZW5kZXJlZE1lc3NhZ2UuZWxlbWVudDtcblx0fVxufVxuZXhwb3J0IGNsYXNzIENoYXRDdXN0b21Db25maXJtYXRpb25XaWRnZXQ8VD4gZXh0ZW5kcyBCYXNlQ2hhdENvbmZpcm1hdGlvbldpZGdldDxUPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdG9wdGlvbnM6IElDaGF0Q29uZmlybWF0aW9uV2lkZ2V0Mk9wdGlvbnM8VD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGV4dCwgb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UsIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlKTtcblx0XHR0aGlzLnJlbmRlck1lc3NhZ2Uob3B0aW9ucy5tZXNzYWdlKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjb25maWd1cmVBY2Nlc3NpYmlsaXR5Q29udGFpbmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRpdGxlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIG1lc3NhZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCBIVE1MRWxlbWVudCwgZm9vdGVyQmFubmVyPzogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0Y29udGFpbmVyLnRhYkluZGV4ID0gMDtcblx0Y29uc3QgdGl0bGVBc1N0cmluZyA9IHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlLnZhbHVlO1xuXHRjb25zdCBtZXNzYWdlQXNTdHJpbmcgPSB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZSAmJiAndmFsdWUnIGluIG1lc3NhZ2UgPyBtZXNzYWdlLnZhbHVlIDogbWVzc2FnZSAmJiAndGV4dENvbnRlbnQnIGluIG1lc3NhZ2UgPyBtZXNzYWdlLnRleHRDb250ZW50IDogJyc7XG5cdGNvbnN0IGJhbm5lckFzU3RyaW5nID0gZm9vdGVyQmFubmVyPy50ZXh0Q29udGVudD8udHJpbSgpID8/ICcnO1xuXHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYmFubmVyQXNTdHJpbmdcblx0XHQ/IGxvY2FsaXplKCdjaGF0LmNvbmZpcm1hdGlvbldpZGdldC5hcmlhTGFiZWxXaXRoQmFubmVyVGl0bGVNZXNzYWdlQmFubmVyJywgXCJDaGF0IENvbmZpcm1hdGlvbiBEaWFsb2cgezB9IHsxfSB7Mn1cIiwgdGl0bGVBc1N0cmluZywgbWVzc2FnZUFzU3RyaW5nLCBiYW5uZXJBc1N0cmluZylcblx0XHQ6IGxvY2FsaXplKCdjaGF0LmNvbmZpcm1hdGlvbldpZGdldC5hcmlhTGFiZWwnLCBcIkNoYXQgQ29uZmlybWF0aW9uIERpYWxvZyB7MH0gezF9XCIsIHRpdGxlQXNTdHJpbmcsIG1lc3NhZ2VBc1N0cmluZykpO1xuXHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LWNvbnRhaW5lcicpO1xufVxuIl0sCiAgIm1hcHBpbmdz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
