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
import { $, getActiveElement, getTotalHeight, getWindow, h, reset, trackFocus } from "../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../nls.js";
import { IAccessibleViewService } from "../../../../platform/accessibility/browser/accessibleView.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { MenuWorkbenchButtonBar } from "../../../../platform/actions/browser/buttonbar.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import product from "../../../../platform/product/common/product.js";
import { asCssVariable, asCssVariableName, editorBackground, inputBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../../common/theme.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { ChatWidget } from "../../chat/browser/widget/chatWidget.js";
import { chatRequestBackground } from "../../chat/common/widget/chatColors.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { ChatMode } from "../../chat/common/chatModes.js";
import { ChatAgentVoteDirection, IChatService } from "../../chat/common/chatService/chatService.js";
import { isResponseVM } from "../../chat/common/model/chatViewModel.js";
import { CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_FOCUSED, inlineChatBackground, inlineChatForeground } from "../common/inlineChat.js";
import "./media/inlineChat.css";
let InlineChatWidget = class {
  constructor(location, options, _instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, _textModelResolverService, chatService, hoverService, chatEntitlementService, markdownRendererService) {
    this._instantiationService = _instantiationService;
    this._textModelResolverService = _textModelResolverService;
    this._elements = h(
      "div.inline-chat@root",
      [
        h("div.chat-widget@chatWidget"),
        h("div.accessibleViewer@accessibleViewer"),
        h("div.status@status", [
          h("div.label.info.hidden@infoLabel"),
          h("div.actions.hidden@toolbar1"),
          h("div.label.status.hidden@statusLabel"),
          h("div.actions.secondary.hidden@toolbar2"),
          h("div.label.disclaimer.hidden@disclaimerLabel")
        ])
      ]
    );
    this._store = new DisposableStore();
    this._onDidChangeHeight = this._store.add(new Emitter());
    this.onDidChangeHeight = Event.filter(this._onDidChangeHeight.event, (_) => !this.#isLayouting);
    this.#requestInProgress = observableValue(this, false);
    this.requestInProgress = this.#requestInProgress;
    this.#isLayouting = false;
    this.#options = options;
    this.#keybindingService = keybindingService;
    this.#accessibilityService = accessibilityService;
    this.#configurationService = configurationService;
    this.#accessibleViewService = accessibleViewService;
    this.#chatService = chatService;
    this.#chatEntitlementService = chatEntitlementService;
    this.#markdownRendererService = markdownRendererService;
    this.scopedContextKeyService = this._store.add(contextKeyService.createScoped(this._elements.chatWidget));
    const scopedInstaService = _instantiationService.createChild(
      new ServiceCollection([
        IContextKeyService,
        this.scopedContextKeyService
      ]),
      this._store
    );
    this.chatWidget = scopedInstaService.createInstance(
      ChatWidget,
      location,
      { isInlineChat: true },
      {
        autoScroll: true,
        defaultElementHeight: 32,
        renderStyle: "minimal",
        renderInputOnTop: false,
        renderFollowups: true,
        supportsFileReferences: true,
        filter: (item) => {
          if (!isResponseVM(item) || item.errorDetails) {
            return true;
          }
          const emptyResponse = item.response.value.length === 0;
          if (emptyResponse) {
            return false;
          }
          if (item.response.value.every((item2) => item2.kind === "textEditGroup" && options.chatWidgetViewOptions?.rendererOptions?.renderTextEditsAsSummary?.(item2.uri))) {
            return false;
          }
          return true;
        },
        dndContainer: this._elements.root,
        defaultMode: ChatMode.Ask,
        ...options.chatWidgetViewOptions
      },
      {
        listForeground: inlineChatForeground,
        listBackground: inlineChatBackground,
        overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
        inputEditorBackground: inputBackground,
        resultEditorBackground: editorBackground
      }
    );
    this._elements.root.classList.toggle("in-zone-widget", !!options.inZoneWidget);
    this.chatWidget.render(this._elements.chatWidget);
    this._elements.chatWidget.style.setProperty(asCssVariableName(chatRequestBackground), asCssVariable(inlineChatBackground));
    this.chatWidget.setVisible(true);
    this._store.add(this.chatWidget);
    const ctxResponse = ChatContextKeys.isResponse.bindTo(this.scopedContextKeyService);
    const ctxResponseVote = ChatContextKeys.responseVote.bindTo(this.scopedContextKeyService);
    const ctxResponseSupportIssues = ChatContextKeys.responseSupportsIssueReporting.bindTo(this.scopedContextKeyService);
    const ctxResponseError = ChatContextKeys.responseHasError.bindTo(this.scopedContextKeyService);
    const ctxResponseErrorFiltered = ChatContextKeys.responseIsFiltered.bindTo(this.scopedContextKeyService);
    const viewModelStore = this._store.add(new DisposableStore());
    this._store.add(this.chatWidget.onDidChangeViewModel(() => {
      viewModelStore.clear();
      const viewModel = this.chatWidget.viewModel;
      if (!viewModel) {
        return;
      }
      viewModelStore.add(toDisposable(() => {
        toolbar2.context = void 0;
        ctxResponse.reset();
        ctxResponseVote.reset();
        ctxResponseError.reset();
        ctxResponseErrorFiltered.reset();
        ctxResponseSupportIssues.reset();
      }));
      viewModelStore.add(viewModel.onDidChange(() => {
        this.#requestInProgress.set(viewModel.model.requestInProgress.get(), void 0);
        const last = viewModel.getItems().at(-1);
        toolbar2.context = last;
        ctxResponse.set(isResponseVM(last));
        ctxResponseVote.set(isResponseVM(last) ? last.vote === ChatAgentVoteDirection.Down ? "down" : last.vote === ChatAgentVoteDirection.Up ? "up" : "" : "");
        ctxResponseError.set(isResponseVM(last) && last.errorDetails !== void 0);
        ctxResponseErrorFiltered.set(!!(isResponseVM(last) && last.errorDetails?.responseIsFiltered));
        ctxResponseSupportIssues.set(isResponseVM(last) && (last.agent?.metadata.supportIssueReporting ?? false));
        this._onDidChangeHeight.fire();
      }));
      this._onDidChangeHeight.fire();
    }));
    this._store.add(this.chatWidget.onDidChangeContentHeight(() => {
      this._onDidChangeHeight.fire();
    }));
    this.#ctxResponseFocused = CTX_INLINE_CHAT_RESPONSE_FOCUSED.bindTo(contextKeyService);
    const tracker = this._store.add(trackFocus(this.domNode));
    this._store.add(tracker.onDidBlur(() => this.#ctxResponseFocused.set(false)));
    this._store.add(tracker.onDidFocus(() => this.#ctxResponseFocused.set(true)));
    this.#ctxInputEditorFocused = CTX_INLINE_CHAT_FOCUSED.bindTo(contextKeyService);
    this._store.add(this.chatWidget.inputEditor.onDidFocusEditorWidget(() => this.#ctxInputEditorFocused.set(true)));
    this._store.add(this.chatWidget.inputEditor.onDidBlurEditorWidget(() => this.#ctxInputEditorFocused.set(false)));
    if (options.statusMenuId) {
      const statusMenuOptions = options.statusMenuId.options;
      const statusButtonBar = scopedInstaService.createInstance(MenuWorkbenchButtonBar, this._elements.toolbar1, options.statusMenuId.menu, {
        toolbarOptions: { primaryGroup: "0_main" },
        telemetrySource: options.chatWidgetViewOptions?.menus?.telemetrySource,
        menuOptions: { renderShortTitle: true },
        ...statusMenuOptions
      });
      this._store.add(statusButtonBar.onDidChange(() => this._onDidChangeHeight.fire()));
      this._store.add(statusButtonBar);
    }
    const toolbar2 = scopedInstaService.createInstance(MenuWorkbenchToolBar, this._elements.toolbar2, options.secondaryMenuId ?? MenuId.for(""), {
      telemetrySource: options.chatWidgetViewOptions?.menus?.telemetrySource,
      menuOptions: { renderShortTitle: true, shouldForwardArgs: true },
      actionViewItemProvider: (action, options2) => {
        return createActionViewItem(scopedInstaService, action, options2);
      }
    });
    this._store.add(toolbar2.onDidChangeMenuItems(() => this._onDidChangeHeight.fire()));
    this._store.add(toolbar2);
    this._store.add(this.#configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.InlineChat)) {
        this.#updateAriaLabel();
      }
    }));
    this._elements.root.tabIndex = 0;
    this._elements.statusLabel.tabIndex = 0;
    this.#updateAriaLabel();
    this.#setupDisclaimer();
    this._store.add(hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this._elements.statusLabel, () => {
      return this._elements.statusLabel.dataset["title"];
    }));
    this._store.add(this.#chatService.onDidPerformUserAction((e) => {
      if (isEqual(e.sessionResource, this.chatWidget.viewModel?.model.sessionResource) && e.action.kind === "vote") {
        this.updateStatus(localize("feedbackThanks", "Thank you for your feedback!"), { resetAfter: 1250 });
      }
    }));
  }
  #ctxInputEditorFocused;
  #ctxResponseFocused;
  #requestInProgress;
  #isLayouting;
  #options;
  #keybindingService;
  #accessibilityService;
  #configurationService;
  #accessibleViewService;
  #chatService;
  #chatEntitlementService;
  #markdownRendererService;
  #updateAriaLabel() {
    this._elements.root.ariaLabel = this.#accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.InlineChat);
    if (this.#accessibilityService.isScreenReaderOptimized()) {
      let label = defaultAriaLabel;
      if (this.#configurationService.getValue(AccessibilityVerbositySettingId.InlineChat)) {
        const kbLabel = this.#keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
        label = kbLabel ? localize("inlineChat.accessibilityHelp", "Inline Chat Input, Use {0} for Inline Chat Accessibility Help.", kbLabel) : localize("inlineChat.accessibilityHelpNoKb", "Inline Chat Input, Run the Inline Chat Accessibility Help command for more information.");
      }
      this.chatWidget.inputEditor.updateOptions({ ariaLabel: label });
    }
  }
  #setupDisclaimer() {
    const disposables = this._store.add(new DisposableStore());
    this._store.add(autorun((reader) => {
      disposables.clear();
      reset(this._elements.disclaimerLabel);
      const sentiment = this.#chatEntitlementService.sentimentObs.read(reader);
      const anonymous = this.#chatEntitlementService.anonymousObs.read(reader);
      const requestInProgress = this.#chatService.requestInProgressObs.read(reader);
      const showDisclaimer = !sentiment.completed && anonymous && !requestInProgress;
      this._elements.disclaimerLabel.classList.toggle("hidden", !showDisclaimer);
      if (showDisclaimer) {
        const renderedMarkdown = disposables.add(this.#markdownRendererService.render(new MarkdownString(localize({ key: "termsDisclaimer", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", product.defaultChatAgent?.provider?.default?.name ?? "", product.defaultChatAgent?.provider?.default?.name ?? "", product.defaultChatAgent?.termsStatementUrl ?? "", product.defaultChatAgent?.privacyStatementUrl ?? ""), { isTrusted: true })));
        this._elements.disclaimerLabel.appendChild(renderedMarkdown.element);
      }
      this._onDidChangeHeight.fire();
    }));
  }
  dispose() {
    this._store.dispose();
  }
  get domNode() {
    return this._elements.root;
  }
  layout(widgetDim) {
    const contentHeight = this.contentHeight;
    this.#isLayouting = true;
    try {
      this._doLayout(widgetDim);
    } finally {
      this.#isLayouting = false;
      if (this.contentHeight !== contentHeight) {
        this._onDidChangeHeight.fire();
      }
    }
  }
  _doLayout(dimension) {
    const extraHeight = this._getExtraHeight();
    const statusHeight = getTotalHeight(this._elements.status);
    this._elements.root.style.height = `${dimension.height - extraHeight}px`;
    this._elements.root.style.width = `${dimension.width}px`;
    this.chatWidget.layout(
      dimension.height - statusHeight - extraHeight,
      dimension.width
    );
  }
  /**
   * The content height of this widget is the size that would require no scrolling
   */
  get contentHeight() {
    const data = {
      chatWidgetContentHeight: this.chatWidget.contentHeight,
      statusHeight: getTotalHeight(this._elements.status),
      extraHeight: this._getExtraHeight()
    };
    const result = data.chatWidgetContentHeight + data.statusHeight + data.extraHeight;
    return result;
  }
  get minHeight() {
    let maxWidgetOutputHeight = 100;
    for (const item of this.chatWidget.viewModel?.getItems() ?? []) {
      if (isResponseVM(item) && item.response.value.some((r) => r.kind === "textEditGroup" && !r.state?.applied)) {
        maxWidgetOutputHeight = 270;
        break;
      }
    }
    let value = this.contentHeight;
    value -= this.chatWidget.contentHeight;
    value += Math.min(this.chatWidget.input.height.get() + maxWidgetOutputHeight, this.chatWidget.contentHeight);
    return value;
  }
  _getExtraHeight() {
    return this.#options.inZoneWidget ? 1 : 2 + 4;
  }
  updateInfo(message) {
    this._elements.infoLabel.classList.toggle("hidden", !message);
    const renderedMessage = renderLabelWithIcons(message);
    reset(this._elements.infoLabel, ...renderedMessage);
    this._onDidChangeHeight.fire();
  }
  updateStatus(message, ops = {}) {
    const isTempMessage = typeof ops.resetAfter === "number";
    if (isTempMessage && !this._elements.statusLabel.dataset["state"]) {
      const statusLabel = this._elements.statusLabel.innerText;
      const title = this._elements.statusLabel.dataset["title"];
      const classes = Array.from(this._elements.statusLabel.classList.values());
      setTimeout(() => {
        this.updateStatus(statusLabel, { classes, keepMessage: true, title });
      }, ops.resetAfter);
    }
    const renderedMessage = renderLabelWithIcons(message);
    reset(this._elements.statusLabel, ...renderedMessage);
    this._elements.statusLabel.className = `label status ${(ops.classes ?? []).join(" ")}`;
    this._elements.statusLabel.classList.toggle("hidden", !message);
    if (isTempMessage) {
      this._elements.statusLabel.dataset["state"] = "temp";
    } else {
      delete this._elements.statusLabel.dataset["state"];
    }
    if (ops.title) {
      this._elements.statusLabel.dataset["title"] = ops.title;
    } else {
      delete this._elements.statusLabel.dataset["title"];
    }
    this._onDidChangeHeight.fire();
  }
  reset() {
    this.chatWidget.attachmentModel.clear(true);
    this.chatWidget.saveState();
    reset(this._elements.statusLabel);
    this._elements.statusLabel.classList.toggle("hidden", true);
    this._elements.toolbar1.classList.add("hidden");
    this._elements.toolbar2.classList.add("hidden");
    this.updateInfo("");
    this._elements.accessibleViewer.classList.toggle("hidden", true);
    this._onDidChangeHeight.fire();
  }
  focus() {
    this.chatWidget.focusInput();
  }
  hasFocus() {
    return this.domNode.contains(getActiveElement());
  }
};
InlineChatWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IAccessibilityService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAccessibleViewService),
  __decorateParam(8, ITextModelService),
  __decorateParam(9, IChatService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IChatEntitlementService),
  __decorateParam(12, IMarkdownRendererService)
], InlineChatWidget);
const defaultAriaLabel = localize("aria-label", "Inline Chat Input");
let EditorBasedInlineChatWidget = class extends InlineChatWidget {
  constructor(location, parentEditor, options, contextKeyService, keybindingService, instantiationService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, chatService, hoverService, layoutService, chatEntitlementService, markdownRendererService) {
    const overflowWidgetsNode = layoutService.getContainer(getWindow(parentEditor.getContainerDomNode())).appendChild($(".inline-chat-overflow.monaco-editor"));
    super(location, {
      ...options,
      chatWidgetViewOptions: {
        ...options.chatWidgetViewOptions,
        editorOverflowWidgetsDomNode: overflowWidgetsNode
      }
    }, instantiationService, contextKeyService, keybindingService, accessibilityService, configurationService, accessibleViewService, textModelResolverService, chatService, hoverService, chatEntitlementService, markdownRendererService);
    this._store.add(toDisposable(() => {
      overflowWidgetsNode.remove();
    }));
  }
  // --- layout
  _doLayout(dimension) {
    const newHeight = dimension.height;
    super._doLayout(dimension.with(void 0, newHeight));
    this._elements.root.style.height = `${dimension.height - this._getExtraHeight()}px`;
  }
  reset() {
    this.chatWidget.setInput();
    super.reset();
  }
};
EditorBasedInlineChatWidget = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IAccessibilityService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IAccessibleViewService),
  __decorateParam(9, ITextModelService),
  __decorateParam(10, IChatService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, ILayoutService),
  __decorateParam(13, IChatEntitlementService),
  __decorateParam(14, IMarkdownRendererService)
], EditorBasedInlineChatWidget);
export {
  EditorBasedInlineChatWidget,
  InlineChatWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBnZXRBY3RpdmVFbGVtZW50LCBnZXRUb3RhbEhlaWdodCwgZ2V0V2luZG93LCBoLCByZXNldCwgdHJhY2tGb2N1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hCdXR0b25CYXJPcHRpb25zLCBNZW51V29ya2JlbmNoQnV0dG9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2J1dHRvbmJhci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgYXNDc3NWYXJpYWJsZU5hbWUsIGVkaXRvckJhY2tncm91bmQsIGlucHV0QmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVESVRPUl9EUkFHX0FORF9EUk9QX0JBQ0tHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUNvbW1hbmRJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHlDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgY2hhdFJlcXVlc3RCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vd2lkZ2V0L2NoYXRDb2xvcnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50Vm90ZURpcmVjdGlvbiwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDVFhfSU5MSU5FX0NIQVRfRk9DVVNFRCwgQ1RYX0lOTElORV9DSEFUX1JFU1BPTlNFX0ZPQ1VTRUQsIGlubGluZUNoYXRCYWNrZ3JvdW5kLCBpbmxpbmVDaGF0Rm9yZWdyb3VuZCB9IGZyb20gJy4uL2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCAnLi9tZWRpYS9pbmxpbmVDaGF0LmNzcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5saW5lQ2hhdFdpZGdldFZpZXdTdGF0ZSB7XG5cdGVkaXRvclZpZXdTdGF0ZTogSUNvZGVFZGl0b3JWaWV3U3RhdGU7XG5cdGlucHV0OiBzdHJpbmc7XG5cdHBsYWNlaG9sZGVyOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUlubGluZUNoYXRXaWRnZXRDb25zdHJ1Y3Rpb25PcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIG1lbnUgdGhhdCByZW5kZXJlZCBhcyBidXR0b24gYmFyLCB1c2UgZm9yIGFjY2VwdCwgZGlzY2FyZCBldGNcblx0ICovXG5cdHN0YXR1c01lbnVJZD86IHsgbWVudTogTWVudUlkOyBvcHRpb25zOiBJV29ya2JlbmNoQnV0dG9uQmFyT3B0aW9ucyB9O1xuXG5cdHNlY29uZGFyeU1lbnVJZD86IE1lbnVJZDtcblxuXHQvKipcblx0ICogVGhlIG9wdGlvbnMgZm9yIHRoZSBjaGF0IHdpZGdldFxuXHQgKi9cblx0Y2hhdFdpZGdldFZpZXdPcHRpb25zPzogSUNoYXRXaWRnZXRWaWV3T3B0aW9ucztcblxuXHRpblpvbmVXaWRnZXQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgSW5saW5lQ2hhdFdpZGdldCB7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9lbGVtZW50cyA9IGgoXG5cdFx0J2Rpdi5pbmxpbmUtY2hhdEByb290Jyxcblx0XHRbXG5cdFx0XHRoKCdkaXYuY2hhdC13aWRnZXRAY2hhdFdpZGdldCcpLFxuXHRcdFx0aCgnZGl2LmFjY2Vzc2libGVWaWV3ZXJAYWNjZXNzaWJsZVZpZXdlcicpLFxuXHRcdFx0aCgnZGl2LnN0YXR1c0BzdGF0dXMnLCBbXG5cdFx0XHRcdGgoJ2Rpdi5sYWJlbC5pbmZvLmhpZGRlbkBpbmZvTGFiZWwnKSxcblx0XHRcdFx0aCgnZGl2LmFjdGlvbnMuaGlkZGVuQHRvb2xiYXIxJyksXG5cdFx0XHRcdGgoJ2Rpdi5sYWJlbC5zdGF0dXMuaGlkZGVuQHN0YXR1c0xhYmVsJyksXG5cdFx0XHRcdGgoJ2Rpdi5hY3Rpb25zLnNlY29uZGFyeS5oaWRkZW5AdG9vbGJhcjInKSxcblx0XHRcdFx0aCgnZGl2LmxhYmVsLmRpc2NsYWltZXIuaGlkZGVuQGRpc2NsYWltZXJMYWJlbCcpLFxuXHRcdFx0XSksXG5cdFx0XVxuXHQpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cmVhZG9ubHkgI2N0eElucHV0RWRpdG9yRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHJlYWRvbmx5ICNjdHhSZXNwb25zZUZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHJlYWRvbmx5IGNoYXRXaWRnZXQ6IENoYXRXaWRnZXQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuZmlsdGVyKHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50LCBfID0+ICF0aGlzLiNpc0xheW91dGluZyk7XG5cblx0cmVhZG9ubHkgI3JlcXVlc3RJblByb2dyZXNzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cmVhZG9ubHkgcmVxdWVzdEluUHJvZ3Jlc3M6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy4jcmVxdWVzdEluUHJvZ3Jlc3M7XG5cblx0I2lzTGF5b3V0aW5nOiBib29sZWFuID0gZmFsc2U7XG5cblx0cmVhZG9ubHkgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblxuXHRyZWFkb25seSAjb3B0aW9uczogSUlubGluZUNoYXRXaWRnZXRDb25zdHJ1Y3Rpb25PcHRpb25zO1xuXHRyZWFkb25seSAja2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZTtcblx0cmVhZG9ubHkgI2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2U7XG5cdHJlYWRvbmx5ICNjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSAjYWNjZXNzaWJsZVZpZXdTZXJ2aWNlOiBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlO1xuXHRyZWFkb25seSAjY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZTtcblx0cmVhZG9ubHkgI2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlO1xuXHRyZWFkb25seSAjbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsb2NhdGlvbjogSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMsXG5cdFx0b3B0aW9uczogSUlubGluZUNoYXRXaWRnZXRDb25zdHJ1Y3Rpb25PcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2libGVWaWV3U2VydmljZSBhY2Nlc3NpYmxlVmlld1NlcnZpY2U6IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuI29wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuI2tleWJpbmRpbmdTZXJ2aWNlID0ga2V5YmluZGluZ1NlcnZpY2U7XG5cdFx0dGhpcy4jYWNjZXNzaWJpbGl0eVNlcnZpY2UgPSBhY2Nlc3NpYmlsaXR5U2VydmljZTtcblx0XHR0aGlzLiNjb25maWd1cmF0aW9uU2VydmljZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuI2FjY2Vzc2libGVWaWV3U2VydmljZSA9IGFjY2Vzc2libGVWaWV3U2VydmljZTtcblx0XHR0aGlzLiNjaGF0U2VydmljZSA9IGNoYXRTZXJ2aWNlO1xuXHRcdHRoaXMuI2NoYXRFbnRpdGxlbWVudFNlcnZpY2UgPSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlO1xuXHRcdHRoaXMuI21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlID0gbWFya2Rvd25SZW5kZXJlclNlcnZpY2U7XG5cblx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fc3RvcmUuYWRkKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLl9lbGVtZW50cy5jaGF0V2lkZ2V0KSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFTZXJ2aWNlID0gX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtcblx0XHRcdFx0SUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXG5cdFx0XHRdKSxcblx0XHRcdHRoaXMuX3N0b3JlXG5cdFx0KTtcblxuXHRcdHRoaXMuY2hhdFdpZGdldCA9IHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRXaWRnZXQsXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdHsgaXNJbmxpbmVDaGF0OiB0cnVlIH0sXG5cdFx0XHR7XG5cdFx0XHRcdGF1dG9TY3JvbGw6IHRydWUsXG5cdFx0XHRcdGRlZmF1bHRFbGVtZW50SGVpZ2h0OiAzMixcblx0XHRcdFx0cmVuZGVyU3R5bGU6ICdtaW5pbWFsJyxcblx0XHRcdFx0cmVuZGVySW5wdXRPblRvcDogZmFsc2UsXG5cdFx0XHRcdHJlbmRlckZvbGxvd3VwczogdHJ1ZSxcblx0XHRcdFx0c3VwcG9ydHNGaWxlUmVmZXJlbmNlczogdHJ1ZSxcblx0XHRcdFx0ZmlsdGVyOiBpdGVtID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSB8fCBpdGVtLmVycm9yRGV0YWlscykge1xuXHRcdFx0XHRcdFx0Ly8gc2hvdyBhbGwgcmVxdWVzdHMgYW5kIGVycm9yc1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGVtcHR5UmVzcG9uc2UgPSBpdGVtLnJlc3BvbnNlLnZhbHVlLmxlbmd0aCA9PT0gMDtcblx0XHRcdFx0XHRpZiAoZW1wdHlSZXNwb25zZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXRlbS5yZXNwb25zZS52YWx1ZS5ldmVyeShpdGVtID0+IGl0ZW0ua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnICYmIG9wdGlvbnMuY2hhdFdpZGdldFZpZXdPcHRpb25zPy5yZW5kZXJlck9wdGlvbnM/LnJlbmRlclRleHRFZGl0c0FzU3VtbWFyeT8uKGl0ZW0udXJpKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRuZENvbnRhaW5lcjogdGhpcy5fZWxlbWVudHMucm9vdCxcblx0XHRcdFx0ZGVmYXVsdE1vZGU6IENoYXRNb2RlLkFzayxcblx0XHRcdFx0Li4ub3B0aW9ucy5jaGF0V2lkZ2V0Vmlld09wdGlvbnNcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiBpbmxpbmVDaGF0Rm9yZWdyb3VuZCxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IGlubGluZUNoYXRCYWNrZ3JvdW5kLFxuXHRcdFx0XHRvdmVybGF5QmFja2dyb3VuZDogRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCxcblx0XHRcdFx0aW5wdXRFZGl0b3JCYWNrZ3JvdW5kOiBpbnB1dEJhY2tncm91bmQsXG5cdFx0XHRcdHJlc3VsdEVkaXRvckJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmRcblx0XHRcdH1cblx0XHQpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnaW4tem9uZS13aWRnZXQnLCAhIW9wdGlvbnMuaW5ab25lV2lkZ2V0KTtcblx0XHR0aGlzLmNoYXRXaWRnZXQucmVuZGVyKHRoaXMuX2VsZW1lbnRzLmNoYXRXaWRnZXQpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLmNoYXRXaWRnZXQuc3R5bGUuc2V0UHJvcGVydHkoYXNDc3NWYXJpYWJsZU5hbWUoY2hhdFJlcXVlc3RCYWNrZ3JvdW5kKSwgYXNDc3NWYXJpYWJsZShpbmxpbmVDaGF0QmFja2dyb3VuZCkpO1xuXHRcdHRoaXMuY2hhdFdpZGdldC5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmNoYXRXaWRnZXQpO1xuXG5cdFx0Y29uc3QgY3R4UmVzcG9uc2UgPSBDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY3R4UmVzcG9uc2VWb3RlID0gQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlVm90ZS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY3R4UmVzcG9uc2VTdXBwb3J0SXNzdWVzID0gQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlU3VwcG9ydHNJc3N1ZVJlcG9ydGluZy5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgY3R4UmVzcG9uc2VFcnJvciA9IENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUhhc0Vycm9yLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdHhSZXNwb25zZUVycm9yRmlsdGVyZWQgPSBDaGF0Q29udGV4dEtleXMucmVzcG9uc2VJc0ZpbHRlcmVkLmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbFN0b3JlID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY2hhdFdpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCgoKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWxTdG9yZS5jbGVhcigpO1xuXG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLmNoYXRXaWRnZXQudmlld01vZGVsO1xuXHRcdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR2aWV3TW9kZWxTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0dG9vbGJhcjIuY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y3R4UmVzcG9uc2UucmVzZXQoKTtcblx0XHRcdFx0Y3R4UmVzcG9uc2VWb3RlLnJlc2V0KCk7XG5cdFx0XHRcdGN0eFJlc3BvbnNlRXJyb3IucmVzZXQoKTtcblx0XHRcdFx0Y3R4UmVzcG9uc2VFcnJvckZpbHRlcmVkLnJlc2V0KCk7XG5cdFx0XHRcdGN0eFJlc3BvbnNlU3VwcG9ydElzc3Vlcy5yZXNldCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR2aWV3TW9kZWxTdG9yZS5hZGQodmlld01vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IHtcblxuXHRcdFx0XHR0aGlzLiNyZXF1ZXN0SW5Qcm9ncmVzcy5zZXQodmlld01vZGVsLm1vZGVsLnJlcXVlc3RJblByb2dyZXNzLmdldCgpLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGNvbnN0IGxhc3QgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKS5hdCgtMSk7XG5cdFx0XHRcdHRvb2xiYXIyLmNvbnRleHQgPSBsYXN0O1xuXG5cdFx0XHRcdGN0eFJlc3BvbnNlLnNldChpc1Jlc3BvbnNlVk0obGFzdCkpO1xuXHRcdFx0XHRjdHhSZXNwb25zZVZvdGUuc2V0KGlzUmVzcG9uc2VWTShsYXN0KSA/IGxhc3Qudm90ZSA9PT0gQ2hhdEFnZW50Vm90ZURpcmVjdGlvbi5Eb3duID8gJ2Rvd24nIDogbGFzdC52b3RlID09PSBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLlVwID8gJ3VwJyA6ICcnIDogJycpO1xuXHRcdFx0XHRjdHhSZXNwb25zZUVycm9yLnNldChpc1Jlc3BvbnNlVk0obGFzdCkgJiYgbGFzdC5lcnJvckRldGFpbHMgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGN0eFJlc3BvbnNlRXJyb3JGaWx0ZXJlZC5zZXQoKCEhKGlzUmVzcG9uc2VWTShsYXN0KSAmJiBsYXN0LmVycm9yRGV0YWlscz8ucmVzcG9uc2VJc0ZpbHRlcmVkKSkpO1xuXHRcdFx0XHRjdHhSZXNwb25zZVN1cHBvcnRJc3N1ZXMuc2V0KGlzUmVzcG9uc2VWTShsYXN0KSAmJiAobGFzdC5hZ2VudD8ubWV0YWRhdGEuc3VwcG9ydElzc3VlUmVwb3J0aW5nID8/IGZhbHNlKSk7XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLmNoYXRXaWRnZXQub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBjb250ZXh0IGtleXNcblx0XHR0aGlzLiNjdHhSZXNwb25zZUZvY3VzZWQgPSBDVFhfSU5MSU5FX0NIQVRfUkVTUE9OU0VfRk9DVVNFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHRyYWNrZXIgPSB0aGlzLl9zdG9yZS5hZGQodHJhY2tGb2N1cyh0aGlzLmRvbU5vZGUpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gdGhpcy4jY3R4UmVzcG9uc2VGb2N1c2VkLnNldChmYWxzZSkpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHRoaXMuI2N0eFJlc3BvbnNlRm9jdXNlZC5zZXQodHJ1ZSkpKTtcblxuXHRcdHRoaXMuI2N0eElucHV0RWRpdG9yRm9jdXNlZCA9IENUWF9JTkxJTkVfQ0hBVF9GT0NVU0VELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuY2hhdFdpZGdldC5pbnB1dEVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHRoaXMuI2N0eElucHV0RWRpdG9yRm9jdXNlZC5zZXQodHJ1ZSkpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5jaGF0V2lkZ2V0LmlucHV0RWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB0aGlzLiNjdHhJbnB1dEVkaXRvckZvY3VzZWQuc2V0KGZhbHNlKSkpO1xuXG5cblx0XHQvLyBCVVRUT04gYmFyXG5cdFx0aWYgKG9wdGlvbnMuc3RhdHVzTWVudUlkKSB7XG5cdFx0XHRjb25zdCBzdGF0dXNNZW51T3B0aW9ucyA9IG9wdGlvbnMuc3RhdHVzTWVudUlkLm9wdGlvbnM7XG5cdFx0XHRjb25zdCBzdGF0dXNCdXR0b25CYXIgPSBzY29wZWRJbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaEJ1dHRvbkJhciwgdGhpcy5fZWxlbWVudHMudG9vbGJhcjEsIG9wdGlvbnMuc3RhdHVzTWVudUlkLm1lbnUsIHtcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAnMF9tYWluJyB9LFxuXHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IG9wdGlvbnMuY2hhdFdpZGdldFZpZXdPcHRpb25zPy5tZW51cz8udGVsZW1ldHJ5U291cmNlLFxuXHRcdFx0XHRtZW51T3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0sXG5cdFx0XHRcdC4uLnN0YXR1c01lbnVPcHRpb25zLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoc3RhdHVzQnV0dG9uQmFyLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKSkpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHN0YXR1c0J1dHRvbkJhcik7XG5cdFx0fVxuXG5cdFx0Ly8gc2Vjb25kYXJ5IHRvb2xiYXJcblx0XHRjb25zdCB0b29sYmFyMiA9IHNjb3BlZEluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5fZWxlbWVudHMudG9vbGJhcjIsIG9wdGlvbnMuc2Vjb25kYXJ5TWVudUlkID8/IE1lbnVJZC5mb3IoJycpLCB7XG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IG9wdGlvbnMuY2hhdFdpZGdldFZpZXdPcHRpb25zPy5tZW51cz8udGVsZW1ldHJ5U291cmNlLFxuXHRcdFx0bWVudU9wdGlvbnM6IHsgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHNjb3BlZEluc3RhU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodG9vbGJhcjIub25EaWRDaGFuZ2VNZW51SXRlbXMoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRvb2xiYXIyKTtcblxuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuI2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuSW5saW5lQ2hhdCkpIHtcblx0XHRcdFx0dGhpcy4jdXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwudGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuI3VwZGF0ZUFyaWFMYWJlbCgpO1xuXHRcdHRoaXMuI3NldHVwRGlzY2xhaW1lcigpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCB0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbCwgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsLmRhdGFzZXRbJ3RpdGxlJ107XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuI2NoYXRTZXJ2aWNlLm9uRGlkUGVyZm9ybVVzZXJBY3Rpb24oZSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChlLnNlc3Npb25SZXNvdXJjZSwgdGhpcy5jaGF0V2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlKSAmJiBlLmFjdGlvbi5raW5kID09PSAndm90ZScpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMobG9jYWxpemUoJ2ZlZWRiYWNrVGhhbmtzJywgXCJUaGFuayB5b3UgZm9yIHlvdXIgZmVlZGJhY2shXCIpLCB7IHJlc2V0QWZ0ZXI6IDEyNTAgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0I3VwZGF0ZUFyaWFMYWJlbCgpOiB2b2lkIHtcblxuXHRcdHRoaXMuX2VsZW1lbnRzLnJvb3QuYXJpYUxhYmVsID0gdGhpcy4jYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLmdldE9wZW5BcmlhSGludChBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLklubGluZUNoYXQpO1xuXG5cdFx0aWYgKHRoaXMuI2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdGxldCBsYWJlbCA9IGRlZmF1bHRBcmlhTGFiZWw7XG5cdFx0XHRpZiAodGhpcy4jY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5JbmxpbmVDaGF0KSkge1xuXHRcdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy4ja2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLk9wZW5BY2Nlc3NpYmlsaXR5SGVscCk/LmdldExhYmVsKCk7XG5cdFx0XHRcdGxhYmVsID0ga2JMYWJlbFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2lubGluZUNoYXQuYWNjZXNzaWJpbGl0eUhlbHAnLCBcIklubGluZSBDaGF0IElucHV0LCBVc2UgezB9IGZvciBJbmxpbmUgQ2hhdCBBY2Nlc3NpYmlsaXR5IEhlbHAuXCIsIGtiTGFiZWwpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnaW5saW5lQ2hhdC5hY2Nlc3NpYmlsaXR5SGVscE5vS2InLCBcIklubGluZSBDaGF0IElucHV0LCBSdW4gdGhlIElubGluZSBDaGF0IEFjY2Vzc2liaWxpdHkgSGVscCBjb21tYW5kIGZvciBtb3JlIGluZm9ybWF0aW9uLlwiKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY2hhdFdpZGdldC5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHsgYXJpYUxhYmVsOiBsYWJlbCB9KTtcblx0XHR9XG5cdH1cblxuXHQjc2V0dXBEaXNjbGFpbWVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHJlc2V0KHRoaXMuX2VsZW1lbnRzLmRpc2NsYWltZXJMYWJlbCk7XG5cblx0XHRcdGNvbnN0IHNlbnRpbWVudCA9IHRoaXMuI2NoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFub255bW91cyA9IHRoaXMuI2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RJblByb2dyZXNzID0gdGhpcy4jY2hhdFNlcnZpY2UucmVxdWVzdEluUHJvZ3Jlc3NPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBzaG93RGlzY2xhaW1lciA9ICFzZW50aW1lbnQuY29tcGxldGVkICYmIGFub255bW91cyAmJiAhcmVxdWVzdEluUHJvZ3Jlc3M7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5kaXNjbGFpbWVyTGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXNob3dEaXNjbGFpbWVyKTtcblxuXHRcdFx0aWYgKHNob3dEaXNjbGFpbWVyKSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkTWFya2Rvd24gPSBkaXNwb3NhYmxlcy5hZGQodGhpcy4jbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSh7IGtleTogJ3Rlcm1zRGlzY2xhaW1lcicsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oezJ9KVwifScsICd7TG9ja2VkPVwiXSh7M30pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nIHdpdGggezB9IENvcGlsb3QsIHlvdSBhZ3JlZSB0byB7MX0ncyBbVGVybXNdKHsyfSkgYW5kIFtQcml2YWN5IFN0YXRlbWVudF0oezN9KVwiLCBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyPy5kZWZhdWx0Py5uYW1lID8/ICcnLCBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyPy5kZWZhdWx0Py5uYW1lID8/ICcnLCBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnRlcm1zU3RhdGVtZW50VXJsID8/ICcnLCBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnByaXZhY3lTdGF0ZW1lbnRVcmwgPz8gJycpLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KSkpO1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50cy5kaXNjbGFpbWVyTGFiZWwuYXBwZW5kQ2hpbGQocmVuZGVyZWRNYXJrZG93bi5lbGVtZW50KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9lbGVtZW50cy5yb290O1xuXHR9XG5cblx0bGF5b3V0KHdpZGdldERpbTogRGltZW5zaW9uKSB7XG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMuY29udGVudEhlaWdodDtcblx0XHR0aGlzLiNpc0xheW91dGluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2RvTGF5b3V0KHdpZGdldERpbSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuI2lzTGF5b3V0aW5nID0gZmFsc2U7XG5cblx0XHRcdGlmICh0aGlzLmNvbnRlbnRIZWlnaHQgIT09IGNvbnRlbnRIZWlnaHQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfZG9MYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHRjb25zdCBleHRyYUhlaWdodCA9IHRoaXMuX2dldEV4dHJhSGVpZ2h0KCk7XG5cdFx0Y29uc3Qgc3RhdHVzSGVpZ2h0ID0gZ2V0VG90YWxIZWlnaHQodGhpcy5fZWxlbWVudHMuc3RhdHVzKTtcblxuXHRcdC8vIGNvbnNvbGUubG9nKCdaT05FI1dpZGdldCNsYXlvdXQnLCB7IGhlaWdodDogZGltZW5zaW9uLmhlaWdodCwgZXh0cmFIZWlnaHQsIHByb2dyZXNzSGVpZ2h0LCBmb2xsb3dVcHNIZWlnaHQsIHN0YXR1c0hlaWdodCwgTElTVDogZGltZW5zaW9uLmhlaWdodCAtIHByb2dyZXNzSGVpZ2h0IC0gZm9sbG93VXBzSGVpZ2h0IC0gc3RhdHVzSGVpZ2h0IC0gZXh0cmFIZWlnaHQgfSk7XG5cblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnN0eWxlLmhlaWdodCA9IGAke2RpbWVuc2lvbi5oZWlnaHQgLSBleHRyYUhlaWdodH1weGA7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS53aWR0aCA9IGAke2RpbWVuc2lvbi53aWR0aH1weGA7XG5cblx0XHR0aGlzLmNoYXRXaWRnZXQubGF5b3V0KFxuXHRcdFx0ZGltZW5zaW9uLmhlaWdodCAtIHN0YXR1c0hlaWdodCAtIGV4dHJhSGVpZ2h0LFxuXHRcdFx0ZGltZW5zaW9uLndpZHRoXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgY29udGVudCBoZWlnaHQgb2YgdGhpcyB3aWRnZXQgaXMgdGhlIHNpemUgdGhhdCB3b3VsZCByZXF1aXJlIG5vIHNjcm9sbGluZ1xuXHQgKi9cblx0Z2V0IGNvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBkYXRhID0ge1xuXHRcdFx0Y2hhdFdpZGdldENvbnRlbnRIZWlnaHQ6IHRoaXMuY2hhdFdpZGdldC5jb250ZW50SGVpZ2h0LFxuXHRcdFx0c3RhdHVzSGVpZ2h0OiBnZXRUb3RhbEhlaWdodCh0aGlzLl9lbGVtZW50cy5zdGF0dXMpLFxuXHRcdFx0ZXh0cmFIZWlnaHQ6IHRoaXMuX2dldEV4dHJhSGVpZ2h0KClcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGRhdGEuY2hhdFdpZGdldENvbnRlbnRIZWlnaHQgKyBkYXRhLnN0YXR1c0hlaWdodCArIGRhdGEuZXh0cmFIZWlnaHQ7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldCBtaW5IZWlnaHQoKTogbnVtYmVyIHtcblx0XHQvLyBUaGUgY2hhdCB3aWRnZXQgaXMgdmFyaWFibGUgaGVpZ2h0IGFuZCBzdXBwb3J0cyBzY3JvbGxpbmcuIEl0IHNob3VsZCBiZVxuXHRcdC8vIGF0IGxlYXN0IFwibWF4V2lkZ2V0SGVpZ2h0XCIgaGlnaCBhbmQgYXQgbW9zdCB0aGUgY29udGVudCBoZWlnaHQuXG5cblx0XHRsZXQgbWF4V2lkZ2V0T3V0cHV0SGVpZ2h0ID0gMTAwO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLmNoYXRXaWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpID8/IFtdKSB7XG5cdFx0XHRpZiAoaXNSZXNwb25zZVZNKGl0ZW0pICYmIGl0ZW0ucmVzcG9uc2UudmFsdWUuc29tZShyID0+IHIua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnICYmICFyLnN0YXRlPy5hcHBsaWVkKSkge1xuXHRcdFx0XHRtYXhXaWRnZXRPdXRwdXRIZWlnaHQgPSAyNzA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCB2YWx1ZSA9IHRoaXMuY29udGVudEhlaWdodDtcblx0XHR2YWx1ZSAtPSB0aGlzLmNoYXRXaWRnZXQuY29udGVudEhlaWdodDtcblx0XHR2YWx1ZSArPSBNYXRoLm1pbih0aGlzLmNoYXRXaWRnZXQuaW5wdXQuaGVpZ2h0LmdldCgpICsgbWF4V2lkZ2V0T3V0cHV0SGVpZ2h0LCB0aGlzLmNoYXRXaWRnZXQuY29udGVudEhlaWdodCk7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFeHRyYUhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLiNvcHRpb25zLmluWm9uZVdpZGdldCA/IDEgOiAoMiAvKmJvcmRlciovICsgNCAvKnNoYWRvdyovKTtcblx0fVxuXG5cdHVwZGF0ZUluZm8obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZWxlbWVudHMuaW5mb0xhYmVsLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFtZXNzYWdlKTtcblx0XHRjb25zdCByZW5kZXJlZE1lc3NhZ2UgPSByZW5kZXJMYWJlbFdpdGhJY29ucyhtZXNzYWdlKTtcblx0XHRyZXNldCh0aGlzLl9lbGVtZW50cy5pbmZvTGFiZWwsIC4uLnJlbmRlcmVkTWVzc2FnZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0dXBkYXRlU3RhdHVzKG1lc3NhZ2U6IHN0cmluZywgb3BzOiB7IGNsYXNzZXM/OiBzdHJpbmdbXTsgcmVzZXRBZnRlcj86IG51bWJlcjsga2VlcE1lc3NhZ2U/OiBib29sZWFuOyB0aXRsZT86IHN0cmluZyB9ID0ge30pIHtcblx0XHRjb25zdCBpc1RlbXBNZXNzYWdlID0gdHlwZW9mIG9wcy5yZXNldEFmdGVyID09PSAnbnVtYmVyJztcblx0XHRpZiAoaXNUZW1wTWVzc2FnZSAmJiAhdGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuZGF0YXNldFsnc3RhdGUnXSkge1xuXHRcdFx0Y29uc3Qgc3RhdHVzTGFiZWwgPSB0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5pbm5lclRleHQ7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRoaXMuX2VsZW1lbnRzLnN0YXR1c0xhYmVsLmRhdGFzZXRbJ3RpdGxlJ107XG5cdFx0XHRjb25zdCBjbGFzc2VzID0gQXJyYXkuZnJvbSh0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5jbGFzc0xpc3QudmFsdWVzKCkpO1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHN0YXR1c0xhYmVsLCB7IGNsYXNzZXMsIGtlZXBNZXNzYWdlOiB0cnVlLCB0aXRsZSB9KTtcblx0XHRcdH0sIG9wcy5yZXNldEFmdGVyKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVuZGVyZWRNZXNzYWdlID0gcmVuZGVyTGFiZWxXaXRoSWNvbnMobWVzc2FnZSk7XG5cdFx0cmVzZXQodGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwsIC4uLnJlbmRlcmVkTWVzc2FnZSk7XG5cdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuY2xhc3NOYW1lID0gYGxhYmVsIHN0YXR1cyAkeyhvcHMuY2xhc3NlcyA/PyBbXSkuam9pbignICcpfWA7XG5cdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIW1lc3NhZ2UpO1xuXHRcdGlmIChpc1RlbXBNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5kYXRhc2V0WydzdGF0ZSddID0gJ3RlbXAnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuZGF0YXNldFsnc3RhdGUnXTtcblx0XHR9XG5cblx0XHRpZiAob3BzLnRpdGxlKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbC5kYXRhc2V0Wyd0aXRsZSddID0gb3BzLnRpdGxlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuZGF0YXNldFsndGl0bGUnXTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cmVzZXQoKSB7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5jbGVhcih0cnVlKTtcblx0XHR0aGlzLmNoYXRXaWRnZXQuc2F2ZVN0YXRlKCk7XG5cblx0XHRyZXNldCh0aGlzLl9lbGVtZW50cy5zdGF0dXNMYWJlbCk7XG5cdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzTGFiZWwuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgdHJ1ZSk7XG5cdFx0dGhpcy5fZWxlbWVudHMudG9vbGJhcjEuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy5fZWxlbWVudHMudG9vbGJhcjIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy51cGRhdGVJbmZvKCcnKTtcblxuXHRcdHRoaXMuX2VsZW1lbnRzLmFjY2Vzc2libGVWaWV3ZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgdHJ1ZSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0Zm9jdXMoKSB7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0fVxuXG5cdGhhc0ZvY3VzKCkge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuY29udGFpbnMoZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0fVxuXG59XG5cbmNvbnN0IGRlZmF1bHRBcmlhTGFiZWwgPSBsb2NhbGl6ZSgnYXJpYS1sYWJlbCcsIFwiSW5saW5lIENoYXQgSW5wdXRcIik7XG5cbmV4cG9ydCBjbGFzcyBFZGl0b3JCYXNlZElubGluZUNoYXRXaWRnZXQgZXh0ZW5kcyBJbmxpbmVDaGF0V2lkZ2V0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsb2NhdGlvbjogSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMsXG5cdFx0cGFyZW50RWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRvcHRpb25zOiBJSW5saW5lQ2hhdFdpZGdldENvbnN0cnVjdGlvbk9wdGlvbnMsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjY2Vzc2libGVWaWV3U2VydmljZSBhY2Nlc3NpYmxlVmlld1NlcnZpY2U6IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgb3ZlcmZsb3dXaWRnZXRzTm9kZSA9IGxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGdldFdpbmRvdyhwYXJlbnRFZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpKSkuYXBwZW5kQ2hpbGQoJCgnLmlubGluZS1jaGF0LW92ZXJmbG93Lm1vbmFjby1lZGl0b3InKSk7XG5cdFx0c3VwZXIobG9jYXRpb24sIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRjaGF0V2lkZ2V0Vmlld09wdGlvbnM6IHtcblx0XHRcdFx0Li4ub3B0aW9ucy5jaGF0V2lkZ2V0Vmlld09wdGlvbnMsXG5cdFx0XHRcdGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IG92ZXJmbG93V2lkZ2V0c05vZGVcblx0XHRcdH1cblx0XHR9LCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBhY2Nlc3NpYmlsaXR5U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGFjY2Vzc2libGVWaWV3U2VydmljZSwgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLCBjaGF0U2VydmljZSwgaG92ZXJTZXJ2aWNlLCBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBtYXJrZG93blJlbmRlcmVyU2VydmljZSk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdG92ZXJmbG93V2lkZ2V0c05vZGUucmVtb3ZlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGxheW91dFxuXG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9kb0xheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXG5cdFx0Y29uc3QgbmV3SGVpZ2h0ID0gZGltZW5zaW9uLmhlaWdodDtcblxuXHRcdHN1cGVyLl9kb0xheW91dChkaW1lbnNpb24ud2l0aCh1bmRlZmluZWQsIG5ld0hlaWdodCkpO1xuXG5cdFx0Ly8gdXBkYXRlL2ZpeCB0aGUgaGVpZ2h0IG9mIHRoZSB6b25lIHdoaWNoIHdhcyBzZXQgdG8gbmV3SGVpZ2h0IGluIHN1cGVyLl9kb0xheW91dFxuXHRcdHRoaXMuX2VsZW1lbnRzLnJvb3Quc3R5bGUuaGVpZ2h0ID0gYCR7ZGltZW5zaW9uLmhlaWdodCAtIHRoaXMuX2dldEV4dHJhSGVpZ2h0KCl9cHhgO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVzZXQoKSB7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LnNldElucHV0KCk7XG5cdFx0c3VwZXIucmVzZXQoKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBYyxrQkFBa0IsZ0JBQWdCLFdBQVcsR0FBRyxPQUFPLGtCQUFrQjtBQUVoRyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxTQUFzQix1QkFBdUI7QUFDdEQsU0FBUyxlQUFlO0FBR3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXFDLDhCQUE4QjtBQUNuRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLE9BQU8sYUFBYTtBQUNwQixTQUFTLGVB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
