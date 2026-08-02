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
import * as dom from "../../../../../base/browser/dom.js";
import { Orientation, Sash } from "../../../../../base/browser/ui/sash/sash.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { localize } from "../../../../../nls.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import product from "../../../../../platform/product/common/product.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { editorBackground, inputBackground, quickInputBackground, quickInputForeground } from "../../../../../platform/theme/common/colorRegistry.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../../../common/theme.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { isCellTextEditOperationArray } from "../../common/model/chatModel.js";
import { ChatMode } from "../../common/chatModes.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { IChatWidgetService } from "../chat.js";
import { ChatWidget } from "../widget/chatWidget.js";
let QuickChatService = class extends Disposable {
  constructor(quickInputService, chatService, instantiationService) {
    super();
    this.quickInputService = quickInputService;
    this.chatService = chatService;
    this.instantiationService = instantiationService;
    this._onDidClose = this._register(new Emitter());
  }
  get onDidClose() {
    return this._onDidClose.event;
  }
  get enabled() {
    return !!this.chatService.isEnabled(ChatAgentLocation.Chat);
  }
  get focused() {
    const widget = this._input?.widget;
    if (!widget) {
      return false;
    }
    return dom.isAncestorOfActiveElement(widget);
  }
  get sessionResource() {
    return this._input && this._currentChat?.sessionResource;
  }
  toggle(options) {
    if (this.focused && !options?.query) {
      this.close();
    } else {
      this.open(options);
      if (options?.isPartialQuery) {
        const disposable = this._store.add(Event.once(this.onDidClose)(() => {
          this._currentChat?.clearValue();
          this._store.delete(disposable);
        }));
      }
    }
  }
  open(options) {
    if (this._input) {
      if (this._currentChat && options?.query) {
        this._currentChat.focus();
        this._currentChat.setValue(options.query, options.selection);
        if (!options.isPartialQuery) {
          this._currentChat.acceptInput();
        }
        return;
      }
      return this.focus();
    }
    const disposableStore = new DisposableStore();
    this._input = this.quickInputService.createQuickWidget();
    this._input.contextKey = "chatInputVisible";
    this._input.ignoreFocusOut = true;
    disposableStore.add(this._input);
    this._container ??= dom.$(".interactive-session");
    this._input.widget = this._container;
    this._input.show();
    if (!this._currentChat) {
      this._currentChat = this.instantiationService.createInstance(QuickChat);
      this._currentChat.render(this._container);
    } else {
      this._currentChat.show();
    }
    disposableStore.add(this._input.onDidHide(() => {
      disposableStore.dispose();
      this._currentChat.hide();
      this._input = void 0;
      this._onDidClose.fire();
    }));
    this._currentChat.focus();
    if (options?.query) {
      this._currentChat.setValue(options.query, options.selection);
      if (!options.isPartialQuery) {
        this._currentChat.acceptInput();
      }
    }
  }
  focus() {
    this._currentChat?.focus();
  }
  close() {
    this._input?.dispose();
    this._input = void 0;
  }
  async openInChatView() {
    await this._currentChat?.openChatView();
    this.close();
  }
};
QuickChatService = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IInstantiationService)
], QuickChatService);
let QuickChat = class extends Disposable {
  constructor(instantiationService, contextKeyService, chatService, layoutService, chatWidgetService, chatEntitlementService, markdownRendererService) {
    super();
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.chatService = chatService;
    this.layoutService = layoutService;
    this.chatWidgetService = chatWidgetService;
    this.chatEntitlementService = chatEntitlementService;
    this.markdownRendererService = markdownRendererService;
    this.maintainScrollTimer = this._register(new MutableDisposable());
    this._deferUpdatingDynamicLayout = false;
  }
  get sessionResource() {
    return this.modelRef?.object.sessionResource;
  }
  clear() {
    this.modelRef?.dispose();
    this.modelRef = void 0;
    this.updateModel();
    this.widget.inputEditor.setValue("");
    return Promise.resolve();
  }
  focus(selection) {
    if (this.widget) {
      this.widget.focusInput();
      const value = this.widget.inputEditor.getValue();
      if (value) {
        this.widget.inputEditor.setSelection(selection ?? {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: value.length + 1
        });
      }
    }
  }
  hide() {
    this.widget.setVisible(false);
    this.maintainScrollTimer.value = disposableTimeout(() => {
      this.maintainScrollTimer.clear();
    }, 30 * 1e3);
  }
  show() {
    this.widget.setVisible(true);
    if (this._deferUpdatingDynamicLayout) {
      this._deferUpdatingDynamicLayout = false;
      this.widget.updateDynamicChatTreeItemLayout(2, this.maxHeight);
    }
    if (!this.maintainScrollTimer.value) {
      this.widget.layoutDynamicChatTreeItemMode();
    }
  }
  render(parent) {
    if (this.widget) {
      throw new Error("Cannot render quick chat twice");
    }
    const scopedInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([
        IContextKeyService,
        this._register(this.contextKeyService.createScoped(parent))
      ])
    ));
    this.widget = this._register(
      scopedInstantiationService.createInstance(
        ChatWidget,
        ChatAgentLocation.Chat,
        { isQuickChat: true },
        {
          autoScroll: true,
          renderInputOnTop: true,
          renderStyle: "compact",
          menus: { inputSideToolbar: MenuId.ChatInputSide, telemetrySource: "chatQuick" },
          enableImplicitContext: true,
          defaultMode: ChatMode.Ask,
          clear: () => this.clear()
        },
        {
          listForeground: quickInputForeground,
          listBackground: quickInputBackground,
          overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
          inputEditorBackground: inputBackground,
          resultEditorBackground: editorBackground
        }
      )
    );
    this.widget.render(parent);
    this.widget.setVisible(true);
    this.widget.setDynamicChatTreeItemLayout(2, this.maxHeight);
    this.updateModel();
    this.sash = this._register(new Sash(parent, { getHorizontalSashTop: () => parent.offsetHeight }, { orientation: Orientation.HORIZONTAL }));
    this.setupDisclaimer(parent);
    this.registerListeners(parent);
  }
  setupDisclaimer(parent) {
    const disclaimerElement = dom.append(parent, dom.$(".disclaimer.hidden"));
    const disposables = this._store.add(new DisposableStore());
    this._register(autorun((reader) => {
      disposables.clear();
      dom.reset(disclaimerElement);
      const sentiment = this.chatEntitlementService.sentimentObs.read(reader);
      const anonymous = this.chatEntitlementService.anonymousObs.read(reader);
      const requestInProgress = this.chatService.requestInProgressObs.read(reader);
      const showDisclaimer = !sentiment.completed && anonymous && !requestInProgress;
      disclaimerElement.classList.toggle("hidden", !showDisclaimer);
      if (showDisclaimer) {
        const renderedMarkdown = disposables.add(this.markdownRendererService.render(new MarkdownString(localize({ key: "termsDisclaimer", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", product.defaultChatAgent?.provider?.default?.name ?? "", product.defaultChatAgent?.provider?.default?.name ?? "", product.defaultChatAgent?.termsStatementUrl ?? "", product.defaultChatAgent?.privacyStatementUrl ?? ""), { isTrusted: true })));
        disclaimerElement.appendChild(renderedMarkdown.element);
      }
    }));
  }
  get maxHeight() {
    return this.layoutService.mainContainerDimension.height - QuickChat.DEFAULT_HEIGHT_OFFSET;
  }
  registerListeners(parent) {
    this._register(this.layoutService.onDidLayoutMainContainer(() => {
      if (this.widget.visible) {
        this.widget.updateDynamicChatTreeItemLayout(2, this.maxHeight);
      } else {
        this._deferUpdatingDynamicLayout = true;
      }
    }));
    this._register(this.widget.onDidChangeHeight((e) => this.sash.layout()));
    const width = parent.offsetWidth;
    this._register(this.sash.onDidStart(() => {
      this.widget.isDynamicChatTreeItemLayoutEnabled = false;
    }));
    this._register(this.sash.onDidChange((e) => {
      if (e.currentY < QuickChat.DEFAULT_MIN_HEIGHT || e.currentY > this.maxHeight) {
        return;
      }
      this.widget.layout(e.currentY, width);
      this.sash.layout();
    }));
    this._register(this.sash.onDidReset(() => {
      this.widget.isDynamicChatTreeItemLayoutEnabled = true;
      this.widget.layoutDynamicChatTreeItemMode();
    }));
  }
  async acceptInput() {
    return this.widget.acceptInput();
  }
  async openChatView() {
    const widget = await this.chatWidgetService.revealWidget();
    const model = this.modelRef?.object;
    if (!widget?.viewModel || !model) {
      return;
    }
    for (const request of model.getRequests()) {
      if (request.response?.response.value || request.response?.result) {
        const message = [];
        for (const item of request.response.response.value) {
          if (item.kind === "textEditGroup") {
            for (const group of item.edits) {
              message.push({
                kind: "textEdit",
                edits: group,
                uri: item.uri
              });
            }
          } else if (item.kind === "notebookEditGroup") {
            for (const group of item.edits) {
              if (isCellTextEditOperationArray(group)) {
                message.push({
                  kind: "textEdit",
                  edits: group.map((e) => e.edit),
                  uri: group[0].uri
                });
              } else {
                message.push({
                  kind: "notebookEdit",
                  edits: group,
                  uri: item.uri
                });
              }
            }
          } else {
            message.push(item);
          }
        }
        this.chatService.addCompleteRequest(
          widget.viewModel.sessionResource,
          request.message,
          request.variableData,
          request.attempt,
          {
            message,
            result: request.response.result,
            followups: request.response.followups
          }
        );
      } else if (request.message) {
      }
    }
    const value = this.widget.getViewState();
    if (value) {
      widget.viewModel.model.inputModel.setState(value);
    }
    widget.focusInput();
  }
  setValue(value, selection) {
    this.widget.inputEditor.setValue(value);
    this.focus(selection);
  }
  clearValue() {
    this.widget.inputEditor.setValue("");
  }
  updateModel() {
    this.modelRef ??= this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { disableBackgroundKeepAlive: true, debugOwner: "ChatQuick#updateModel" });
    const model = this.modelRef?.object;
    if (!model) {
      throw new Error("Could not start chat session");
    }
    this.modelRef.object.inputModel.setState({ inputText: "", selections: [] });
    this.widget.setModel(model);
  }
  dispose() {
    this.modelRef?.dispose();
    this.modelRef = void 0;
    super.dispose();
  }
};
// TODO@TylerLeonhardt: be responsive to window size
QuickChat.DEFAULT_MIN_HEIGHT = 200;
QuickChat.DEFAULT_HEIGHT_OFFSET = 100;
QuickChat = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IChatWidgetService),
  __decorateParam(5, IChatEntitlementService),
  __decorateParam(6, IMarkdownRendererService)
], QuickChat);
export {
  QuickChatService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy9jaGF0UXVpY2sudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiwgU2FzaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1dpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgZWRpdG9yQmFja2dyb3VuZCwgaW5wdXRCYWNrZ3JvdW5kLCBxdWlja0lucHV0QmFja2dyb3VuZCwgcXVpY2tJbnB1dEZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRFJBR19BTkRfRFJPUF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNDZWxsVGV4dEVkaXRPcGVyYXRpb25BcnJheSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IElQYXJzZWRDaGF0UmVxdWVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsUmVmZXJlbmNlLCBJQ2hhdFByb2dyZXNzLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSwgSVF1aWNrQ2hhdE9wZW5PcHRpb25zLCBJUXVpY2tDaGF0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcblxuZXhwb3J0IGNsYXNzIFF1aWNrQ2hhdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVF1aWNrQ2hhdFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRDbG9zZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7IH1cblxuXHRwcml2YXRlIF9pbnB1dDogSVF1aWNrV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0OiBzdXBwb3J0IG11bHRpcGxlIGNoYXQgcHJvdmlkZXJzIGV2ZW50dWFsbHlcblx0cHJpdmF0ZSBfY3VycmVudENoYXQ6IFF1aWNrQ2hhdCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuY2hhdFNlcnZpY2UuaXNFbmFibGVkKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHR9XG5cblx0Z2V0IGZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5faW5wdXQ/LndpZGdldCBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQod2lkZ2V0KTtcblx0fVxuXG5cdGdldCBzZXNzaW9uUmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faW5wdXQgJiYgdGhpcy5fY3VycmVudENoYXQ/LnNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdHRvZ2dsZShvcHRpb25zPzogSVF1aWNrQ2hhdE9wZW5PcHRpb25zKTogdm9pZCB7XG5cdFx0Ly8gSWYgdGhlIGlucHV0IGlzIGFscmVhZHkgc2hvd24sIGhpZGUgaXQuIFRoaXMgcHJvdmlkZXMgYSB0b2dnbGUgYmVoYXZpb3Igb2YgdGhlIHF1aWNrXG5cdFx0Ly8gcGljay4gVGhpcyBzaG91bGQgbm90IGhhcHBlbiB3aGVuIHRoZXJlIGlzIGEgcXVlcnkuXG5cdFx0aWYgKHRoaXMuZm9jdXNlZCAmJiAhb3B0aW9ucz8ucXVlcnkpIHtcblx0XHRcdHRoaXMuY2xvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5vcGVuKG9wdGlvbnMpO1xuXHRcdFx0Ly8gSWYgdGhpcyBpcyBhIHBhcnRpYWwgcXVlcnksIHRoZSB2YWx1ZSBzaG91bGQgYmUgY2xlYXJlZCB3aGVuIGNsb3NlZCBhcyBvdGhlcndpc2UgaXRcblx0XHRcdC8vIHdvdWxkIHJlbWFpbiBmb3IgdGhlIG5leHQgdGltZSB0aGUgcXVpY2sgY2hhdCBpcyBvcGVuZWQgaW4gYW55IGNvbnRleHQuXG5cdFx0XHRpZiAob3B0aW9ucz8uaXNQYXJ0aWFsUXVlcnkpIHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX3N0b3JlLmFkZChFdmVudC5vbmNlKHRoaXMub25EaWRDbG9zZSkoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRDaGF0Py5jbGVhclZhbHVlKCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmUuZGVsZXRlKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b3BlbihvcHRpb25zPzogSVF1aWNrQ2hhdE9wZW5PcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lucHV0KSB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudENoYXQgJiYgb3B0aW9ucz8ucXVlcnkpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudENoYXQuZm9jdXMoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudENoYXQuc2V0VmFsdWUob3B0aW9ucy5xdWVyeSwgb3B0aW9ucy5zZWxlY3Rpb24pO1xuXHRcdFx0XHRpZiAoIW9wdGlvbnMuaXNQYXJ0aWFsUXVlcnkpIHtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50Q2hhdC5hY2NlcHRJbnB1dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5faW5wdXQgPSB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrV2lkZ2V0KCk7XG5cdFx0dGhpcy5faW5wdXQuY29udGV4dEtleSA9ICdjaGF0SW5wdXRWaXNpYmxlJztcblx0XHR0aGlzLl9pbnB1dC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9pbnB1dCk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPz89IGRvbS4kKCcuaW50ZXJhY3RpdmUtc2Vzc2lvbicpO1xuXHRcdHRoaXMuX2lucHV0LndpZGdldCA9IHRoaXMuX2NvbnRhaW5lcjtcblxuXHRcdHRoaXMuX2lucHV0LnNob3coKTtcblx0XHRpZiAoIXRoaXMuX2N1cnJlbnRDaGF0KSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q2hhdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tDaGF0KTtcblxuXHRcdFx0Ly8gc2hvdyBuZWVkcyB0byBjb21lIGFmdGVyIHRoZSBxdWlja3BpY2sgaXMgc2hvd25cblx0XHRcdHRoaXMuX2N1cnJlbnRDaGF0LnJlbmRlcih0aGlzLl9jb250YWluZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q2hhdC5zaG93KCk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9pbnB1dC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRDaGF0IS5oaWRlKCk7XG5cdFx0XHR0aGlzLl9pbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2N1cnJlbnRDaGF0LmZvY3VzKCk7XG5cblx0XHRpZiAob3B0aW9ucz8ucXVlcnkpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRDaGF0LnNldFZhbHVlKG9wdGlvbnMucXVlcnksIG9wdGlvbnMuc2VsZWN0aW9uKTtcblx0XHRcdGlmICghb3B0aW9ucy5pc1BhcnRpYWxRdWVyeSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q2hhdC5hY2NlcHRJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50Q2hhdD8uZm9jdXMoKTtcblx0fVxuXHRjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2lucHV0ID0gdW5kZWZpbmVkO1xuXHR9XG5cdGFzeW5jIG9wZW5JbkNoYXRWaWV3KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2N1cnJlbnRDaGF0Py5vcGVuQ2hhdFZpZXcoKTtcblx0XHR0aGlzLmNsb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgUXVpY2tDaGF0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IGJlIHJlc3BvbnNpdmUgdG8gd2luZG93IHNpemVcblx0c3RhdGljIERFRkFVTFRfTUlOX0hFSUdIVCA9IDIwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9IRUlHSFRfT0ZGU0VUID0gMTAwO1xuXG5cdHByaXZhdGUgd2lkZ2V0ITogQ2hhdFdpZGdldDtcblx0cHJpdmF0ZSBzYXNoITogU2FzaDtcblx0cHJpdmF0ZSBtb2RlbFJlZjogSUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBtYWludGFpblNjcm9sbFRpbWVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIF9kZWZlclVwZGF0aW5nRHluYW1pY0xheW91dDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHB1YmxpYyBnZXQgc2Vzc2lvblJlc291cmNlKCkge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsUmVmPy5vYmplY3Quc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCkge1xuXHRcdHRoaXMubW9kZWxSZWY/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLm1vZGVsUmVmID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudXBkYXRlTW9kZWwoKTtcblx0XHR0aGlzLndpZGdldC5pbnB1dEVkaXRvci5zZXRWYWx1ZSgnJyk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0Zm9jdXMoc2VsZWN0aW9uPzogU2VsZWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud2lkZ2V0KSB7XG5cdFx0XHR0aGlzLndpZGdldC5mb2N1c0lucHV0KCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmdldFZhbHVlKCk7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbiA/PyB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiB2YWx1ZS5sZW5ndGggKyAxXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQuc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0Ly8gTWFpbnRhaW4gc2Nyb2xsIHBvc2l0aW9uIGZvciBhIHNob3J0IHRpbWUgc28gdGhhdCBpZiB0aGUgdXNlciByZS1zaG93cyB0aGUgY2hhdFxuXHRcdC8vIHRoZSBzYW1lIHNjcm9sbCBwb3NpdGlvbiB3aWxsIGJlIHVzZWQuXG5cdFx0dGhpcy5tYWludGFpblNjcm9sbFRpbWVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCwgY2xlYXIgdGhpcyBtdXRhYmxlIGRpc3Bvc2FibGUgd2hpY2ggd2lsbCBiZSBvdXIgc2lnbmFsIHRoYXRcblx0XHRcdC8vIHRoZSB0aW1lciBoYXMgZXhwaXJlZCBhbmQgd2Ugc2hvdWxkIHN0b3AgbWFpbnRhaW5pbmcgc2Nyb2xsIHBvc2l0aW9uXG5cdFx0XHR0aGlzLm1haW50YWluU2Nyb2xsVGltZXIuY2xlYXIoKTtcblx0XHR9LCAzMCAqIDEwMDApOyAvLyAzMCBzZWNvbmRzXG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnNldFZpc2libGUodHJ1ZSk7XG5cdFx0Ly8gSWYgdGhlIG11dGFibGUgZGlzcG9zYWJsZSBpcyBzZXQsIHRoZW4gd2UgYXJlIGtlZXBpbmcgdGhlIGV4aXN0aW5nIHNjcm9sbCBwb3NpdGlvblxuXHRcdC8vIHNvIHdlIHNob3VsZCBub3QgdXBkYXRlIHRoZSBsYXlvdXQuXG5cdFx0aWYgKHRoaXMuX2RlZmVyVXBkYXRpbmdEeW5hbWljTGF5b3V0KSB7XG5cdFx0XHR0aGlzLl9kZWZlclVwZGF0aW5nRHluYW1pY0xheW91dCA9IGZhbHNlO1xuXHRcdFx0dGhpcy53aWRnZXQudXBkYXRlRHluYW1pY0NoYXRUcmVlSXRlbUxheW91dCgyLCB0aGlzLm1heEhlaWdodCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tYWludGFpblNjcm9sbFRpbWVyLnZhbHVlKSB7XG5cdFx0XHR0aGlzLndpZGdldC5sYXlvdXREeW5hbWljQ2hhdFRyZWVJdGVtTW9kZSgpO1xuXHRcdH1cblx0fVxuXG5cdHJlbmRlcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud2lkZ2V0KSB7XG5cdFx0XHQvLyBOT1RFOiBpZiB0aGlzIGNoYW5nZXMsIHdlIG5lZWQgdG8gbWFrZSBzdXJlIGRpc3Bvc2FibGVzIGluIHRoaXMgZnVuY3Rpb24gYXJlIHRyYWNrZWQgZGlmZmVyZW50bHkuXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZW5kZXIgcXVpY2sgY2hhdCB0d2ljZScpO1xuXHRcdH1cblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHBhcmVudCkpXG5cdFx0XHRdKVxuXHRcdCkpO1xuXHRcdHRoaXMud2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFdpZGdldCxcblx0XHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0eyBpc1F1aWNrQ2hhdDogdHJ1ZSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YXV0b1Njcm9sbDogdHJ1ZSxcblx0XHRcdFx0XHRyZW5kZXJJbnB1dE9uVG9wOiB0cnVlLFxuXHRcdFx0XHRcdHJlbmRlclN0eWxlOiAnY29tcGFjdCcsXG5cdFx0XHRcdFx0bWVudXM6IHsgaW5wdXRTaWRlVG9vbGJhcjogTWVudUlkLkNoYXRJbnB1dFNpZGUsIHRlbGVtZXRyeVNvdXJjZTogJ2NoYXRRdWljaycgfSxcblx0XHRcdFx0XHRlbmFibGVJbXBsaWNpdENvbnRleHQ6IHRydWUsXG5cdFx0XHRcdFx0ZGVmYXVsdE1vZGU6IENoYXRNb2RlLkFzayxcblx0XHRcdFx0XHRjbGVhcjogKCkgPT4gdGhpcy5jbGVhcigpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGlzdEZvcmVncm91bmQ6IHF1aWNrSW5wdXRGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBxdWlja0lucHV0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRvdmVybGF5QmFja2dyb3VuZDogRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCxcblx0XHRcdFx0XHRpbnB1dEVkaXRvckJhY2tncm91bmQ6IGlucHV0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRyZXN1bHRFZGl0b3JCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kXG5cdFx0XHRcdH0pKTtcblx0XHR0aGlzLndpZGdldC5yZW5kZXIocGFyZW50KTtcblx0XHR0aGlzLndpZGdldC5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdHRoaXMud2lkZ2V0LnNldER5bmFtaWNDaGF0VHJlZUl0ZW1MYXlvdXQoMiwgdGhpcy5tYXhIZWlnaHQpO1xuXHRcdHRoaXMudXBkYXRlTW9kZWwoKTtcblx0XHR0aGlzLnNhc2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgU2FzaChwYXJlbnQsIHsgZ2V0SG9yaXpvbnRhbFNhc2hUb3A6ICgpID0+IHBhcmVudC5vZmZzZXRIZWlnaHQgfSwgeyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KSk7XG5cdFx0dGhpcy5zZXR1cERpc2NsYWltZXIocGFyZW50KTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKHBhcmVudCk7XG5cdH1cblxuXHRwcml2YXRlIHNldHVwRGlzY2xhaW1lcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzY2xhaW1lckVsZW1lbnQgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5kaXNjbGFpbWVyLmhpZGRlbicpKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdGRvbS5yZXNldChkaXNjbGFpbWVyRWxlbWVudCk7XG5cblx0XHRcdGNvbnN0IHNlbnRpbWVudCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnRPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYW5vbnltb3VzID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmFub255bW91c09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCByZXF1ZXN0SW5Qcm9ncmVzcyA9IHRoaXMuY2hhdFNlcnZpY2UucmVxdWVzdEluUHJvZ3Jlc3NPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBzaG93RGlzY2xhaW1lciA9ICFzZW50aW1lbnQuY29tcGxldGVkICYmIGFub255bW91cyAmJiAhcmVxdWVzdEluUHJvZ3Jlc3M7XG5cdFx0XHRkaXNjbGFpbWVyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc2hvd0Rpc2NsYWltZXIpO1xuXG5cdFx0XHRpZiAoc2hvd0Rpc2NsYWltZXIpIHtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoeyBrZXk6ICd0ZXJtc0Rpc2NsYWltZXInLCBjb21tZW50OiBbJ3tMb2NrZWQ9XCJdKHsyfSlcIn0nLCAne0xvY2tlZD1cIl0oezN9KVwifSddIH0sIFwiQnkgY29udGludWluZyB3aXRoIHswfSBDb3BpbG90LCB5b3UgYWdyZWUgdG8gezF9J3MgW1Rlcm1zXSh7Mn0pIGFuZCBbUHJpdmFjeSBTdGF0ZW1lbnRdKHszfSlcIiwgcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wcm92aWRlcj8uZGVmYXVsdD8ubmFtZSA/PyAnJywgcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wcm92aWRlcj8uZGVmYXVsdD8ubmFtZSA/PyAnJywgcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py50ZXJtc1N0YXRlbWVudFVybCA/PyAnJywgcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wcml2YWN5U3RhdGVtZW50VXJsID8/ICcnKSwgeyBpc1RydXN0ZWQ6IHRydWUgfSkpKTtcblx0XHRcdFx0ZGlzY2xhaW1lckVsZW1lbnQuYXBwZW5kQ2hpbGQocmVuZGVyZWRNYXJrZG93bi5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBtYXhIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5sYXlvdXRTZXJ2aWNlLm1haW5Db250YWluZXJEaW1lbnNpb24uaGVpZ2h0IC0gUXVpY2tDaGF0LkRFRkFVTFRfSEVJR0hUX09GRlNFVDtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGF5b3V0U2VydmljZS5vbkRpZExheW91dE1haW5Db250YWluZXIoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMud2lkZ2V0LnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy53aWRnZXQudXBkYXRlRHluYW1pY0NoYXRUcmVlSXRlbUxheW91dCgyLCB0aGlzLm1heEhlaWdodCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBJZiB0aGUgY2hhdCBpcyBub3QgdmlzaWJsZSwgdGhlbiB3ZSBzaG91bGQgZGVmZXIgdXBkYXRpbmcgdGhlIGxheW91dFxuXHRcdFx0XHQvLyBiZWNhdXNlIGl0IHJlbGllcyBvbiBvZmZzZXRIZWlnaHQgd2hpY2ggb25seSB3b3JrcyBjb3JyZWN0bHlcblx0XHRcdFx0Ly8gd2hlbiB0aGUgY2hhdCBpcyB2aXNpYmxlLlxuXHRcdFx0XHR0aGlzLl9kZWZlclVwZGF0aW5nRHluYW1pY0xheW91dCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0KChlKSA9PiB0aGlzLnNhc2gubGF5b3V0KCkpKTtcblx0XHRjb25zdCB3aWR0aCA9IHBhcmVudC5vZmZzZXRXaWR0aDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNhc2gub25EaWRTdGFydCgoKSA9PiB7XG5cdFx0XHR0aGlzLndpZGdldC5pc0R5bmFtaWNDaGF0VHJlZUl0ZW1MYXlvdXRFbmFibGVkID0gZmFsc2U7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2FzaC5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuY3VycmVudFkgPCBRdWlja0NoYXQuREVGQVVMVF9NSU5fSEVJR0hUIHx8IGUuY3VycmVudFkgPiB0aGlzLm1heEhlaWdodCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLndpZGdldC5sYXlvdXQoZS5jdXJyZW50WSwgd2lkdGgpO1xuXHRcdFx0dGhpcy5zYXNoLmxheW91dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNhc2gub25EaWRSZXNldCgoKSA9PiB7XG5cdFx0XHR0aGlzLndpZGdldC5pc0R5bmFtaWNDaGF0VHJlZUl0ZW1MYXlvdXRFbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMud2lkZ2V0LmxheW91dER5bmFtaWNDaGF0VHJlZUl0ZW1Nb2RlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgYWNjZXB0SW5wdXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lkZ2V0LmFjY2VwdElucHV0KCk7XG5cdH1cblxuXHRhc3luYyBvcGVuQ2hhdFZpZXcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYXdhaXQgdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxSZWY/Lm9iamVjdDtcblx0XHRpZiAoIXdpZGdldD8udmlld01vZGVsIHx8ICFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBtb2RlbC5nZXRSZXF1ZXN0cygpKSB7XG5cdFx0XHRpZiAocmVxdWVzdC5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWUgfHwgcmVxdWVzdC5yZXNwb25zZT8ucmVzdWx0KSB7XG5cblxuXHRcdFx0XHRjb25zdCBtZXNzYWdlOiBJQ2hhdFByb2dyZXNzW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlcXVlc3QucmVzcG9uc2UucmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSAndGV4dEVkaXRHcm91cCcpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgaXRlbS5lZGl0cykge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdGtpbmQ6ICd0ZXh0RWRpdCcsXG5cdFx0XHRcdFx0XHRcdFx0ZWRpdHM6IGdyb3VwLFxuXHRcdFx0XHRcdFx0XHRcdHVyaTogaXRlbS51cmlcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChpdGVtLmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgaXRlbS5lZGl0cykge1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNDZWxsVGV4dEVkaXRPcGVyYXRpb25BcnJheShncm91cCkpIHtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogJ3RleHRFZGl0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdGVkaXRzOiBncm91cC5tYXAoZSA9PiBlLmVkaXQpLFxuXHRcdFx0XHRcdFx0XHRcdFx0dXJpOiBncm91cFswXS51cmlcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRlZGl0czogZ3JvdXAsXG5cdFx0XHRcdFx0XHRcdFx0XHR1cmk6IGl0ZW0udXJpXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWVzc2FnZS5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2UuYWRkQ29tcGxldGVSZXF1ZXN0KHdpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdHJlcXVlc3QubWVzc2FnZSBhcyBJUGFyc2VkQ2hhdFJlcXVlc3QsXG5cdFx0XHRcdFx0cmVxdWVzdC52YXJpYWJsZURhdGEsXG5cdFx0XHRcdFx0cmVxdWVzdC5hdHRlbXB0LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6IHJlcXVlc3QucmVzcG9uc2UucmVzdWx0LFxuXHRcdFx0XHRcdFx0Zm9sbG93dXBzOiByZXF1ZXN0LnJlc3BvbnNlLmZvbGxvd3Vwc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0Lm1lc3NhZ2UpIHtcblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy53aWRnZXQuZ2V0Vmlld1N0YXRlKCk7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHR3aWRnZXQudmlld01vZGVsLm1vZGVsLmlucHV0TW9kZWwuc2V0U3RhdGUodmFsdWUpO1xuXHRcdH1cblx0XHR3aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0c2V0VmFsdWUodmFsdWU6IHN0cmluZywgc2VsZWN0aW9uPzogU2VsZWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0VmFsdWUodmFsdWUpO1xuXHRcdHRoaXMuZm9jdXMoc2VsZWN0aW9uKTtcblx0fVxuXG5cdGNsZWFyVmFsdWUoKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0VmFsdWUoJycpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNb2RlbCgpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsUmVmID8/PSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmU6IHRydWUsIGRlYnVnT3duZXI6ICdDaGF0UXVpY2sjdXBkYXRlTW9kZWwnIH0pO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFJlZj8ub2JqZWN0O1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHN0YXJ0IGNoYXQgc2Vzc2lvbicpO1xuXHRcdH1cblxuXHRcdHRoaXMubW9kZWxSZWYub2JqZWN0LmlucHV0TW9kZWwuc2V0U3RhdGUoeyBpbnB1dFRleHQ6ICcnLCBzZWxlY3Rpb25zOiBbXSB9KTtcblx0XHR0aGlzLndpZGdldC5zZXRNb2RlbChtb2RlbCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWxSZWY/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLm1vZGVsUmVmID0gdW5kZWZpbmVkO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxhQUFhLFlBQVk7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxlQUFlO0FBR3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxPQUFPLGFBQWE7QUFDcEIsU0FBUywwQkFBd0M7QUFDakQsU0FBUyxrQkFBa0IsaUJBQWlCLHNCQUFzQiw0QkFBNEI7QUFDOUYsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxnQkFBZ0I7QUFFekIsU0FBNkMsb0JBQW9CO0FBQ2pFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQW9FO0FBQzdFLFNBQVMsa0JBQWtCO0FBRXBCLElBQU0sbUJBQU4sY0FBK0IsV0FBd0M7QUFBQSxFQVc3RSxZQUNzQyxtQkFDTixhQUNTLHNCQUN2QztBQUNELFVBQU07QUFKK0I7QUFDTjtBQUNTO0FBWHpDLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQUEsRUFjakU7QUFBQSxFQWJBLElBQUks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
