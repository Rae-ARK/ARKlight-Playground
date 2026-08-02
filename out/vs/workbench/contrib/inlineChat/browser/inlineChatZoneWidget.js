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
import { addDisposableListener, Dimension, $, getWindow } from "../../../../base/browser/dom.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { renderMarkdown, renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Emitter } from "../../../../base/common/event.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { assertType } from "../../../../base/common/types.js";
import { StableEditorBottomScrollState } from "../../../../editor/browser/stableEditorScroll.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { ZoneWidget } from "../../../../editor/contrib/zoneWidget/browser/zoneWidget.js";
import { localize } from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ChatMode } from "../../chat/common/chatModes.js";
import { CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, MENU_INLINE_CHAT_SIDE, MENU_INLINE_CHAT_WIDGET_SECONDARY } from "../common/inlineChat.js";
import { EditorBasedInlineChatWidget } from "./inlineChatWidget.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
const _StatusPlaceholder = class _StatusPlaceholder extends Action2 {
  constructor() {
    super({
      id: _StatusPlaceholder.Id,
      title: "",
      precondition: ContextKeyExpr.false(),
      menu: {
        id: MenuId.ChatInput,
        when: ContextKeyExpr.and(ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline), _StatusPlaceholder.CtxHasStatus),
        group: "navigation",
        order: Number.MAX_SAFE_INTEGER
      }
    });
  }
  run() {
  }
};
_StatusPlaceholder.Id = "inlineChatWidget.statusPlaceholder";
_StatusPlaceholder.CtxHasStatus = new RawContextKey("inlineChatHasStatus", false);
let StatusPlaceholder = _StatusPlaceholder;
registerAction2(StatusPlaceholder);
let InlineChatZoneWidget = class extends ZoneWidget {
  constructor(location, options, editors, clearDelegate, instaService, actionViewItemService, logService, contextKeyService) {
    super(editors.editor, InlineChatZoneWidget.#options);
    this.status = observableValue(this, "");
    this.#terminationStore = new DisposableStore();
    this.notebookEditor = editors.notebookEditor;
    this.#logService = logService;
    this.#terminationCard = $("div.inline-chat-terminated-card.hidden");
    this.#terminationMarkdownContainer = $("div.markdown-scroll-container");
    this.#terminationMarkdownMessage = $("div.markdown-message");
    this.#terminationMarkdownContainer.appendChild(this.#terminationMarkdownMessage);
    this.#terminationMarkdownScrollable = this._disposables.add(new DomScrollableElement(this.#terminationMarkdownContainer, {
      consumeMouseWheelIfScrollbarIsNeeded: true,
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    this.#terminationCard.appendChild(this.#terminationMarkdownScrollable.getDomNode());
    const contentRow = $("div.content-row");
    this.#terminationToolbar = $("div.toolbar");
    contentRow.appendChild(this.#terminationToolbar);
    this.#terminationCard.appendChild(contentRow);
    this._disposables.add(this.#terminationStore);
    this.#ctxCursorPosition = CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.bindTo(contextKeyService);
    this.#ctxHasStatus = StatusPlaceholder.CtxHasStatus.bindTo(contextKeyService);
    this._disposables.add(toDisposable(() => {
      this.#ctxCursorPosition.reset();
      this.#ctxHasStatus.reset();
    }));
    this._disposables.add(autorun((r) => {
      this.#ctxHasStatus.set(!!this.status.read(r));
    }));
    InlineChatZoneWidget.#instances.add(this);
    this._disposables.add(toDisposable(() => {
      InlineChatZoneWidget.#instances.delete(this);
      if (InlineChatZoneWidget.#instances.size === 0) {
        InlineChatZoneWidget.#factoryRegistration?.dispose();
        InlineChatZoneWidget.#factoryRegistration = void 0;
      }
    }));
    this._disposables.add(autorun((r) => {
      this.status.read(r);
      InlineChatZoneWidget.#statusDidChange.fire();
    }));
    if (!InlineChatZoneWidget.#factoryRegistration) {
      InlineChatZoneWidget.#factoryRegistration = actionViewItemService.register(MenuId.ChatInput, StatusPlaceholder.Id, (action, options2) => {
        const item = new class extends ActionViewItem {
          render(container) {
            super.render(container);
            container.classList.add("status-placeholder");
            const targetWindow = getWindow(container);
            let handle = targetWindow.requestAnimationFrame(() => {
              handle = 0;
              const widget = InlineChatZoneWidget.#findByDom(container);
              if (widget) {
                this._store.add(autorun((r) => {
                  const value = widget.status.read(r) ?? "";
                  this.action.label = value;
                  this.updateLabel();
                }));
              }
            });
            this._store.add(toDisposable(() => {
              if (handle) {
                targetWindow.cancelAnimationFrame(handle);
              }
            }));
          }
        }(void 0, action, { ...options2, icon: false, label: true });
        return item;
      }, InlineChatZoneWidget.#statusDidChange.event);
    }
    this.widget = instaService.createInstance(EditorBasedInlineChatWidget, location, this.editor, {
      secondaryMenuId: MENU_INLINE_CHAT_WIDGET_SECONDARY,
      inZoneWidget: true,
      chatWidgetViewOptions: {
        menus: {
          telemetrySource: "interactiveEditorWidget-toolbar",
          inputSideToolbar: MENU_INLINE_CHAT_SIDE
        },
        clear: clearDelegate,
        ...options,
        rendererOptions: {
          renderTextEditsAsSummary: (uri) => {
            return isEqual(uri, editors.editor.getModel()?.uri);
          },
          renderDetectedCommandsWithRequest: true,
          ...options?.rendererOptions
        },
        defaultMode: ChatMode.Ask
      }
    });
    this._disposables.add(this.widget);
    let revealFn;
    this._disposables.add(this.widget.chatWidget.onWillMaybeChangeHeight(() => {
      if (this.position) {
        revealFn = this.#createZoneAndScrollRestoreFn(this.position);
      }
    }));
    this._disposables.add(this.widget.onDidChangeHeight(() => {
      if (this.position && !this._usesResizeHeight) {
        revealFn ??= this.#createZoneAndScrollRestoreFn(this.position);
        const height = this.#computeHeight();
        this._relayout(height.linesValue);
        revealFn?.();
        revealFn = void 0;
      }
    }));
    this.create();
    this._disposables.add(autorun((r) => {
      const isBusy = this.widget.requestInProgress.read(r);
      this.domNode.firstElementChild?.classList.toggle("busy", isBusy);
    }));
    this._disposables.add(addDisposableListener(this.domNode, "click", (e) => {
      if (!this.editor.hasWidgetFocus() && !this.widget.hasFocus()) {
        this.editor.focus();
      }
    }, true));
    const updateCursorIsAboveContextKey = () => {
      if (!this.position || !this.editor.hasModel()) {
        this.#ctxCursorPosition.reset();
      } else if (this.position.lineNumber === this.editor.getPosition().lineNumber) {
        this.#ctxCursorPosition.set("above");
      } else if (this.position.lineNumber + 1 === this.editor.getPosition().lineNumber) {
        this.#ctxCursorPosition.set("below");
      } else {
        this.#ctxCursorPosition.reset();
      }
    };
    this._disposables.add(this.editor.onDidChangeCursorPosition((e) => updateCursorIsAboveContextKey()));
    this._disposables.add(this.editor.onDidFocusEditorText((e) => updateCursorIsAboveContextKey()));
    updateCursorIsAboveContextKey();
  }
  static #options = {
    showFrame: true,
    frameWidth: 1,
    // frameColor: 'var(--vscode-inlineChat-border)',
    isResizeable: true,
    showArrow: false,
    isAccessible: true,
    className: "inline-chat-widget",
    keepEditorSelection: true,
    showInHiddenAreas: true,
    ordinal: 5e4
  };
  static #instances = /* @__PURE__ */ new Set();
  static #statusDidChange = new Emitter();
  static #factoryRegistration;
  static #findByDom(element) {
    const widgetDom = element.closest(".inline-chat-widget");
    if (widgetDom) {
      for (const instance of InlineChatZoneWidget.#instances) {
        if (instance.domNode === widgetDom) {
          return instance;
        }
      }
    }
    return void 0;
  }
  #ctxCursorPosition;
  #ctxHasStatus;
  #dimension;
  #logService;
  #terminationCard;
  #terminationMarkdownContainer;
  #terminationMarkdownMessage;
  #terminationMarkdownScrollable;
  #terminationToolbar;
  #terminationStore;
  _fillContainer(container) {
    container.style.setProperty("--vscode-inlineChat-background", "var(--vscode-editor-background)");
    container.appendChild(this.widget.domNode);
    container.appendChild(this.#terminationCard);
  }
  showTerminationCard(message, instaService) {
    this.#terminationStore.clear();
    const markdownMessage = typeof message === "string" ? new MarkdownString(message, { supportThemeIcons: true }) : message;
    const text = renderAsPlaintext(typeof message === "string" ? new MarkdownString(message) : message);
    this.#terminationMarkdownMessage.replaceChildren();
    const rendered = this.#terminationStore.add(renderMarkdown(markdownMessage));
    this.#terminationMarkdownMessage.appendChild(rendered.element);
    this.#terminationMarkdownScrollable.getDomNode().classList.remove("hidden");
    this.#terminationMarkdownScrollable.scanDomNode();
    const editor = this.editor;
    const actionRunner = this.#terminationStore.add(new class extends ActionRunner {
      async runAction(action, context) {
        editor.focus();
        return super.runAction(action, context);
      }
    }());
    this.#terminationToolbar.replaceChildren();
    this.#terminationStore.add(instaService.createInstance(MenuWorkbenchToolBar, this.#terminationToolbar, MenuId.ChatEditorInlineExecute, {
      telemetrySource: "inlineChatZone.terminationToolbar",
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      actionRunner,
      toolbarOptions: {
        primaryGroup: () => true,
        useSeparatorsInPrimaryActions: true
      },
      menuOptions: { renderShortTitle: true }
    }));
    this.widget.domNode.style.display = "none";
    this.#terminationCard.classList.remove("hidden");
    aria.status(text);
    if (this.position) {
      const revealFn = this.#createZoneAndScrollRestoreFn(this.position);
      const height = this.#computeHeight();
      this._relayout(height.linesValue);
      revealFn();
    }
  }
  hideTerminationCard() {
    this.#terminationStore.clear();
    this.#terminationCard.classList.add("hidden");
    this.widget.domNode.style.display = "";
    if (this.position) {
      const revealFn = this.#createZoneAndScrollRestoreFn(this.position);
      const height = this.#computeHeight();
      this._relayout(height.linesValue);
      revealFn();
    }
  }
  get isShowingTerminationCard() {
    return !this.#terminationCard.classList.contains("hidden");
  }
  _doLayout(heightInPixel) {
    this.#updatePadding();
    const info = this.editor.getLayoutInfo();
    const width = info.contentWidth - info.verticalScrollbarWidth;
    this.#dimension = new Dimension(width, heightInPixel);
    this.widget.layout(this.#dimension);
    if (this.isShowingTerminationCard) {
      const maxHeight = Math.max(50, heightInPixel - 40);
      this.#terminationMarkdownScrollable.getDomNode().style.maxHeight = `${maxHeight}px`;
      this.#terminationMarkdownContainer.style.maxHeight = `${maxHeight}px`;
      this.#terminationMarkdownScrollable.scanDomNode();
    }
  }
  #computeHeight() {
    const editorHeight = this.notebookEditor?.getLayoutInfo().height ?? this.editor.getLayoutInfo().height;
    let innerHeight;
    if (this.isShowingTerminationCard) {
      innerHeight = this.#terminationCard.offsetHeight || 80;
    } else {
      innerHeight = this.widget.contentHeight;
    }
    const contentHeight = this._decoratingElementsHeight() + Math.min(innerHeight, Math.max(this.widget.minHeight, editorHeight * 0.42));
    const heightInLines = contentHeight / this.editor.getOption(EditorOption.lineHeight);
    return { linesValue: heightInLines, pixelsValue: contentHeight };
  }
  _getResizeBounds() {
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const decoHeight = this._decoratingElementsHeight();
    const minHeightPx = decoHeight + this.widget.minHeight;
    const maxHeightPx = decoHeight + this.widget.contentHeight;
    return {
      minLines: minHeightPx / lineHeight,
      maxLines: maxHeightPx / lineHeight
    };
  }
  _onWidth(_widthInPixel) {
    if (this.#dimension) {
      this._doLayout(this.#dimension.height);
    }
  }
  show(position) {
    assertType(this.container);
    this.#updatePadding();
    const revealZone = this.#createZoneAndScrollRestoreFn(position);
    super.show(position, this.#computeHeight().linesValue);
    this.widget.chatWidget.setVisible(true);
    this.widget.focus();
    revealZone();
  }
  #updatePadding() {
    assertType(this.container);
    const info = this.editor.getLayoutInfo();
    const marginWithoutIndentation = info.glyphMarginWidth + info.lineNumbersWidth + info.decorationsWidth;
    this.container.style.paddingLeft = `${marginWithoutIndentation}px`;
  }
  reveal(position) {
    const stickyScroll = this.editor.getOption(EditorOption.stickyScroll);
    const magicValue = stickyScroll.enabled ? stickyScroll.maxLineCount : 0;
    this.editor.revealLines(position.lineNumber + magicValue, position.lineNumber + magicValue, ScrollType.Immediate);
    this.updatePositionAndHeight(position);
  }
  updatePositionAndHeight(position) {
    const revealZone = this.#createZoneAndScrollRestoreFn(position);
    super.updatePositionAndHeight(position, !this._usesResizeHeight ? this.#computeHeight().linesValue : void 0);
    revealZone();
  }
  #createZoneAndScrollRestoreFn(position) {
    const scrollState = StableEditorBottomScrollState.capture(this.editor);
    const lineNumber = position.lineNumber <= 1 ? 1 : 1 + position.lineNumber;
    return () => {
      scrollState.restore(this.editor);
      const scrollTop = this.editor.getScrollTop();
      const lineTop = this.editor.getTopForLineNumber(lineNumber);
      const zoneTop = lineTop - this.#computeHeight().pixelsValue;
      const editorHeight = this.editor.getLayoutInfo().height;
      const lineBottom = this.editor.getBottomForLineNumber(lineNumber);
      let newScrollTop = zoneTop;
      let forceScrollTop = false;
      if (lineBottom >= scrollTop + editorHeight) {
        newScrollTop = lineBottom - editorHeight;
        forceScrollTop = true;
      }
      if (newScrollTop < scrollTop || forceScrollTop) {
        this.#logService.trace("[IE] REVEAL zone", { zoneTop, lineTop, lineBottom, scrollTop, newScrollTop, forceScrollTop });
        this.editor.setScrollTop(newScrollTop, ScrollType.Immediate);
      }
    };
  }
  revealRange(range, isLastLine) {
  }
  hide() {
    const scrollState = StableEditorBottomScrollState.capture(this.editor);
    this.#ctxCursorPosition.reset();
    this.#terminationStore.clear();
    this.#terminationCard.classList.add("hidden");
    this.widget.domNode.style.display = "";
    this.widget.chatWidget.setVisible(false);
    super.hide();
    aria.status(localize("inlineChatClosed", "Closed inline chat widget"));
    scrollState.restore(this.editor);
  }
};
InlineChatZoneWidget = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IActionViewItemService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IContextKeyService)
], InlineChatZoneWidget);
export {
  InlineChatZoneWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0Wm9uZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIERpbWVuc2lvbiwgJCwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgcmVuZGVyTWFya2Rvd24sIHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTdGFibGVFZGl0b3JCb3R0b21TY3JvbGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3N0YWJsZUVkaXRvclNjcm9sbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJT3B0aW9ucywgWm9uZVdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3pvbmVXaWRnZXQvYnJvd3Nlci96b25lV2lkZ2V0LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ1RYX0lOTElORV9DSEFUX09VVEVSX0NVUlNPUl9QT1NJVElPTiwgTUVOVV9JTkxJTkVfQ0hBVF9TSURFLCBNRU5VX0lOTElORV9DSEFUX1dJREdFVF9TRUNPTkRBUlkgfSBmcm9tICcuLi9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JCYXNlZElubGluZUNoYXRXaWRnZXQgfSBmcm9tICcuL2lubGluZUNoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuXG4vLyBhIFwiY3JlYXRpdmVcIiB3YXkgb2YgYWRkaW5nIGN1c3RvbSBVSSBpbnRvIHRoZSBjaGF0IGlucHV0IHBhcnRcbi8vIHdpdGhvdXQga25vd2luZy9tb2RpZnlpbmcgaXRzIGRvbS1zdHJ1Y3R1cmVcbmNsYXNzIFN0YXR1c1BsYWNlaG9sZGVyIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElkID0gJ2lubGluZUNoYXRXaWRnZXQuc3RhdHVzUGxhY2Vob2xkZXInO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ3R4SGFzU3RhdHVzID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2lubGluZUNoYXRIYXNTdGF0dXMnLCBmYWxzZSk7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFN0YXR1c1BsYWNlaG9sZGVyLklkLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5mYWxzZSgpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscyhDaGF0Q29udGV4dEtleXMubG9jYXRpb24ua2V5LCBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpLCBTdGF0dXNQbGFjZWhvbGRlci5DdHhIYXNTdGF0dXMpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bigpIHsgfVxufVxuXG5yZWdpc3RlckFjdGlvbjIoU3RhdHVzUGxhY2Vob2xkZXIpO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lQ2hhdFpvbmVXaWRnZXQgZXh0ZW5kcyBab25lV2lkZ2V0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgI29wdGlvbnM6IElPcHRpb25zID0ge1xuXHRcdHNob3dGcmFtZTogdHJ1ZSxcblx0XHRmcmFtZVdpZHRoOiAxLFxuXHRcdC8vIGZyYW1lQ29sb3I6ICd2YXIoLS12c2NvZGUtaW5saW5lQ2hhdC1ib3JkZXIpJyxcblx0XHRpc1Jlc2l6ZWFibGU6IHRydWUsXG5cdFx0c2hvd0Fycm93OiBmYWxzZSxcblx0XHRpc0FjY2Vzc2libGU6IHRydWUsXG5cdFx0Y2xhc3NOYW1lOiAnaW5saW5lLWNoYXQtd2lkZ2V0Jyxcblx0XHRrZWVwRWRpdG9yU2VsZWN0aW9uOiB0cnVlLFxuXHRcdHNob3dJbkhpZGRlbkFyZWFzOiB0cnVlLFxuXHRcdG9yZGluYWw6IDUwMDAwLFxuXHR9O1xuXG5cdHN0YXRpYyByZWFkb25seSAjaW5zdGFuY2VzID0gbmV3IFNldDxJbmxpbmVDaGF0Wm9uZVdpZGdldD4oKTtcblx0c3RhdGljIHJlYWRvbmx5ICNzdGF0dXNEaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRzdGF0aWMgI2ZhY3RvcnlSZWdpc3RyYXRpb246IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXG5cdHN0YXRpYyAjZmluZEJ5RG9tKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSW5saW5lQ2hhdFpvbmVXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHdpZGdldERvbSA9IGVsZW1lbnQuY2xvc2VzdCgnLmlubGluZS1jaGF0LXdpZGdldCcpO1xuXHRcdGlmICh3aWRnZXREb20pIHtcblx0XHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgSW5saW5lQ2hhdFpvbmVXaWRnZXQuI2luc3RhbmNlcykge1xuXHRcdFx0XHRpZiAoaW5zdGFuY2UuZG9tTm9kZSA9PT0gd2lkZ2V0RG9tKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZWFkb25seSB3aWRnZXQ6IEVkaXRvckJhc2VkSW5saW5lQ2hhdFdpZGdldDtcblxuXHRyZWFkb25seSBzdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgJycpO1xuXG5cdHJlYWRvbmx5ICNjdHhDdXJzb3JQb3NpdGlvbjogSUNvbnRleHRLZXk8J2Fib3ZlJyB8ICdiZWxvdycgfCAnJz47XG5cdHJlYWRvbmx5ICNjdHhIYXNTdGF0dXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHQjZGltZW5zaW9uPzogRGltZW5zaW9uO1xuXHRwcml2YXRlIG5vdGVib29rRWRpdG9yPzogSU5vdGVib29rRWRpdG9yO1xuXG5cdHJlYWRvbmx5ICNsb2dTZXJ2aWNlOiBJTG9nU2VydmljZTtcblxuXHRyZWFkb25seSAjdGVybWluYXRpb25DYXJkOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgI3Rlcm1pbmF0aW9uTWFya2Rvd25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSAjdGVybWluYXRpb25NYXJrZG93bk1lc3NhZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSAjdGVybWluYXRpb25NYXJrZG93blNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRyZWFkb25seSAjdGVybWluYXRpb25Ub29sYmFyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgI3Rlcm1pbmF0aW9uU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bG9jYXRpb246IElDaGF0V2lkZ2V0TG9jYXRpb25PcHRpb25zLFxuXHRcdG9wdGlvbnM6IElDaGF0V2lkZ2V0Vmlld09wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0ZWRpdG9yczogeyBlZGl0b3I6IElDb2RlRWRpdG9yOyBub3RlYm9va0VkaXRvcj86IElOb3RlYm9va0VkaXRvciB9LFxuXHRcdC8qKiBAZGVwcmVjYXRlZCBzaG91bGQgZ28gYXdheSB3aXRoIGlubGluZTIgKi9cblx0XHRjbGVhckRlbGVnYXRlOiAoKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvcnMuZWRpdG9yLCBJbmxpbmVDaGF0Wm9uZVdpZGdldC4jb3B0aW9ucyk7XG5cdFx0dGhpcy5ub3RlYm9va0VkaXRvciA9IGVkaXRvcnMubm90ZWJvb2tFZGl0b3I7XG5cblx0XHR0aGlzLiNsb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblxuXHRcdC8vIEJ1aWxkIHRlcm1pbmF0aW9uIGNhcmQgRE9NXG5cdFx0dGhpcy4jdGVybWluYXRpb25DYXJkID0gJCgnZGl2LmlubGluZS1jaGF0LXRlcm1pbmF0ZWQtY2FyZC5oaWRkZW4nKTtcblxuXHRcdC8vIE1hcmtkb3duIHNjcm9sbGFibGUgYXJlYVxuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25Db250YWluZXIgPSAkKCdkaXYubWFya2Rvd24tc2Nyb2xsLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25NZXNzYWdlID0gJCgnZGl2Lm1hcmtkb3duLW1lc3NhZ2UnKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvbk1hcmtkb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25NZXNzYWdlKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvbk1hcmtkb3duU2Nyb2xsYWJsZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy4jdGVybWluYXRpb25NYXJrZG93bkNvbnRhaW5lciwge1xuXHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiB0cnVlLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdH0pKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvbkNhcmQuYXBwZW5kQ2hpbGQodGhpcy4jdGVybWluYXRpb25NYXJrZG93blNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdC8vIFRvb2xiYXIgcm93XG5cdFx0Y29uc3QgY29udGVudFJvdyA9ICQoJ2Rpdi5jb250ZW50LXJvdycpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uVG9vbGJhciA9ICQoJ2Rpdi50b29sYmFyJyk7XG5cdFx0Y29udGVudFJvdy5hcHBlbmRDaGlsZCh0aGlzLiN0ZXJtaW5hdGlvblRvb2xiYXIpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uQ2FyZC5hcHBlbmRDaGlsZChjb250ZW50Um93KTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy4jdGVybWluYXRpb25TdG9yZSk7XG5cblx0XHR0aGlzLiNjdHhDdXJzb3JQb3NpdGlvbiA9IENUWF9JTkxJTkVfQ0hBVF9PVVRFUl9DVVJTT1JfUE9TSVRJT04uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLiNjdHhIYXNTdGF0dXMgPSBTdGF0dXNQbGFjZWhvbGRlci5DdHhIYXNTdGF0dXMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy4jY3R4Q3Vyc29yUG9zaXRpb24ucmVzZXQoKTtcblx0XHRcdHRoaXMuI2N0eEhhc1N0YXR1cy5yZXNldCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0dGhpcy4jY3R4SGFzU3RhdHVzLnNldCghIXRoaXMuc3RhdHVzLnJlYWQocikpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIHRoaXMgaW5zdGFuY2Ugc28gdGhlIHNpbmdsZXRvbiBmYWN0b3J5IGNhbiBkaXNwYXRjaCBieSBET00gY29udGFpbm1lbnRcblx0XHRJbmxpbmVDaGF0Wm9uZVdpZGdldC4jaW5zdGFuY2VzLmFkZCh0aGlzKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdElubGluZUNoYXRab25lV2lkZ2V0LiNpbnN0YW5jZXMuZGVsZXRlKHRoaXMpO1xuXHRcdFx0aWYgKElubGluZUNoYXRab25lV2lkZ2V0LiNpbnN0YW5jZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRJbmxpbmVDaGF0Wm9uZVdpZGdldC4jZmFjdG9yeVJlZ2lzdHJhdGlvbj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRJbmxpbmVDaGF0Wm9uZVdpZGdldC4jZmFjdG9yeVJlZ2lzdHJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHR0aGlzLnN0YXR1cy5yZWFkKHIpO1xuXHRcdFx0SW5saW5lQ2hhdFpvbmVXaWRnZXQuI3N0YXR1c0RpZENoYW5nZS5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYSBzaW5nbGUgZmFjdG9yeSBmb3IgdGhlIHN0YXR1cyBwbGFjZWhvbGRlciBhY3Rpb24uIE11bHRpcGxlIHpvbmUgd2lkZ2V0XG5cdFx0Ly8gaW5zdGFuY2VzIGNhbiBjb2V4aXN0IChvbmUgcGVyIGVkaXRvcikgc28gdGhlIGZhY3RvcnkgdXNlcyBET00gY29udGFpbm1lbnQgdG8gZmluZFxuXHRcdC8vIHRoZSBvd25pbmcgd2lkZ2V0IGFuZCBvYnNlcnZlIGl0cyBzdGF0dXMuXG5cdFx0aWYgKCFJbmxpbmVDaGF0Wm9uZVdpZGdldC4jZmFjdG9yeVJlZ2lzdHJhdGlvbikge1xuXHRcdFx0SW5saW5lQ2hhdFpvbmVXaWRnZXQuI2ZhY3RvcnlSZWdpc3RyYXRpb24gPSBhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudUlkLkNoYXRJbnB1dCwgU3RhdHVzUGxhY2Vob2xkZXIuSWQsIChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbSA9IG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvblZpZXdJdGVtIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0XHRcdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc3RhdHVzLXBsYWNlaG9sZGVyJyk7XG5cdFx0XHRcdFx0XHQvLyBEZWZlciB0aGUgRE9NLWJhc2VkIHdpZGdldCBsb29rdXAgdG8gdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lXG5cdFx0XHRcdFx0XHQvLyBiZWNhdXNlIGFjdGlvbmJhciBjYWxscyByZW5kZXIoKSBiZWZvcmUgYXBwZW5kaW5nIHRoZSBlbGVtZW50XG5cdFx0XHRcdFx0XHQvLyB0byB0aGUgRE9NLCBzbyBjbG9zZXN0KCkgd291bGQgZmFpbCBkdXJpbmcgcmVuZGVyKCkuXG5cdFx0XHRcdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBnZXRXaW5kb3coY29udGFpbmVyKTtcblx0XHRcdFx0XHRcdGxldCBoYW5kbGUgPSB0YXJnZXRXaW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0aGFuZGxlID0gMDtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gSW5saW5lQ2hhdFpvbmVXaWRnZXQuI2ZpbmRCeURvbShjb250YWluZXIpO1xuXHRcdFx0XHRcdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHdpZGdldC5zdGF0dXMucmVhZChyKSA/PyAnJztcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuYWN0aW9uLmxhYmVsID0gdmFsdWU7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUxhYmVsKCk7XG5cdFx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoaGFuZGxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFyZ2V0V2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0odW5kZWZpbmVkLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaWNvbjogZmFsc2UsIGxhYmVsOiB0cnVlIH0pO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH0sIElubGluZUNoYXRab25lV2lkZ2V0LiNzdGF0dXNEaWRDaGFuZ2UuZXZlbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMud2lkZ2V0ID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckJhc2VkSW5saW5lQ2hhdFdpZGdldCwgbG9jYXRpb24sIHRoaXMuZWRpdG9yLCB7XG5cdFx0XHRzZWNvbmRhcnlNZW51SWQ6IE1FTlVfSU5MSU5FX0NIQVRfV0lER0VUX1NFQ09OREFSWSxcblx0XHRcdGluWm9uZVdpZGdldDogdHJ1ZSxcblx0XHRcdGNoYXRXaWRnZXRWaWV3T3B0aW9uczoge1xuXHRcdFx0XHRtZW51czoge1xuXHRcdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2ludGVyYWN0aXZlRWRpdG9yV2lkZ2V0LXRvb2xiYXInLFxuXHRcdFx0XHRcdGlucHV0U2lkZVRvb2xiYXI6IE1FTlVfSU5MSU5FX0NIQVRfU0lERVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjbGVhcjogY2xlYXJEZWxlZ2F0ZSxcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0cmVuZGVyZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0cmVuZGVyVGV4dEVkaXRzQXNTdW1tYXJ5OiAodXJpKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyByZW5kZXIgd2hlbiBkZWFsaW5nIHdpdGggdGhlIGN1cnJlbnQgZmlsZSBpbiB0aGUgZWRpdG9yXG5cdFx0XHRcdFx0XHRyZXR1cm4gaXNFcXVhbCh1cmksIGVkaXRvcnMuZWRpdG9yLmdldE1vZGVsKCk/LnVyaSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZW5kZXJEZXRlY3RlZENvbW1hbmRzV2l0aFJlcXVlc3Q6IHRydWUsXG5cdFx0XHRcdFx0Li4ub3B0aW9ucz8ucmVuZGVyZXJPcHRpb25zXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlZmF1bHRNb2RlOiBDaGF0TW9kZS5Bc2tcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQpO1xuXG5cdFx0bGV0IHJldmVhbEZuOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMud2lkZ2V0LmNoYXRXaWRnZXQub25XaWxsTWF5YmVDaGFuZ2VIZWlnaHQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMucG9zaXRpb24pIHtcblx0XHRcdFx0cmV2ZWFsRm4gPSB0aGlzLiNjcmVhdGVab25lQW5kU2Nyb2xsUmVzdG9yZUZuKHRoaXMucG9zaXRpb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMucG9zaXRpb24gJiYgIXRoaXMuX3VzZXNSZXNpemVIZWlnaHQpIHtcblx0XHRcdFx0Ly8gb25seSByZWxheW91dCB3aGVuIHZpc2libGVcblx0XHRcdFx0cmV2ZWFsRm4gPz89IHRoaXMuI2NyZWF0ZVpvbmVBbmRTY3JvbGxSZXN0b3JlRm4odGhpcy5wb3NpdGlvbik7XG5cdFx0XHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuI2NvbXB1dGVIZWlnaHQoKTtcblx0XHRcdFx0dGhpcy5fcmVsYXlvdXQoaGVpZ2h0LmxpbmVzVmFsdWUpO1xuXHRcdFx0XHRyZXZlYWxGbj8uKCk7XG5cdFx0XHRcdHJldmVhbEZuID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGlzQnVzeSA9IHRoaXMud2lkZ2V0LnJlcXVlc3RJblByb2dyZXNzLnJlYWQocik7XG5cdFx0XHR0aGlzLmRvbU5vZGUuZmlyc3RFbGVtZW50Q2hpbGQ/LmNsYXNzTGlzdC50b2dnbGUoJ2J1c3knLCBpc0J1c3kpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGlmICghdGhpcy5lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSAmJiAhdGhpcy53aWRnZXQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0sIHRydWUpKTtcblxuXG5cdFx0Ly8gdG9kb0Bqcmlla2VuIGxpc3RlbiBPTkxZIHdoZW4gc2hvd2luZ1xuXHRcdGNvbnN0IHVwZGF0ZUN1cnNvcklzQWJvdmVDb250ZXh0S2V5ID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnBvc2l0aW9uIHx8ICF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHRoaXMuI2N0eEN1cnNvclBvc2l0aW9uLnJlc2V0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMucG9zaXRpb24ubGluZU51bWJlciA9PT0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKS5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRoaXMuI2N0eEN1cnNvclBvc2l0aW9uLnNldCgnYWJvdmUnKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5wb3NpdGlvbi5saW5lTnVtYmVyICsgMSA9PT0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKS5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRoaXMuI2N0eEN1cnNvclBvc2l0aW9uLnNldCgnYmVsb3cnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuI2N0eEN1cnNvclBvc2l0aW9uLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IHVwZGF0ZUN1cnNvcklzQWJvdmVDb250ZXh0S2V5KCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3Iub25EaWRGb2N1c0VkaXRvclRleHQoZSA9PiB1cGRhdGVDdXJzb3JJc0Fib3ZlQ29udGV4dEtleSgpKSk7XG5cdFx0dXBkYXRlQ3Vyc29ySXNBYm92ZUNvbnRleHRLZXkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZmlsbENvbnRhaW5lcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cblx0XHRjb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWlubGluZUNoYXQtYmFja2dyb3VuZCcsICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy53aWRnZXQuZG9tTm9kZSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuI3Rlcm1pbmF0aW9uQ2FyZCk7XG5cdH1cblxuXHRzaG93VGVybWluYXRpb25DYXJkKG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZywgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvblN0b3JlLmNsZWFyKCk7XG5cblx0XHRjb25zdCBtYXJrZG93bk1lc3NhZ2UgPSB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSlcblx0XHRcdDogbWVzc2FnZTtcblx0XHRjb25zdCB0ZXh0ID0gcmVuZGVyQXNQbGFpbnRleHQodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UpIDogbWVzc2FnZSk7XG5cblx0XHQvLyBNYXJrZG93biByZW5kZXJpbmcgd2l0aCAkKGluZm8pIGljb24gcHJlZml4IGluIHNjcm9sbGFibGUgYXJlYVxuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25NZXNzYWdlLnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy4jdGVybWluYXRpb25TdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd25NZXNzYWdlKSk7XG5cdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93bk1lc3NhZ2UuYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0dGhpcy4jdGVybWluYXRpb25NYXJrZG93blNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25TY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cblx0XHQvLyBUb29sYmFyIC0gZm9jdXMgdGhlIG93bmluZyBlZGl0b3IgYmVmb3JlIHJ1bm5pbmcgYW55IGFjdGlvbiBzbyB0aGF0XG5cdFx0Ly8gRWRpdG9yQWN0aW9uMi1iYXNlZCBhY3Rpb25zIHJlc29sdmUgdGhlIGNvcnJlY3QgZWRpdG9yIGluc3RhbmNlLlxuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZWRpdG9yO1xuXHRcdGNvbnN0IGFjdGlvblJ1bm5lciA9IHRoaXMuI3Rlcm1pbmF0aW9uU3RvcmUuYWRkKG5ldyBjbGFzcyBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY29udGV4dD86IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0ZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdHJldHVybiBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvblRvb2xiYXIucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0dGhpcy4jdGVybWluYXRpb25TdG9yZS5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLiN0ZXJtaW5hdGlvblRvb2xiYXIsIE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSwge1xuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnaW5saW5lQ2hhdFpvbmUudGVybWluYXRpb25Ub29sYmFyJyxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0dXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gRmxpcCB2aXNpYmlsaXR5XG5cdFx0dGhpcy53aWRnZXQuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uQ2FyZC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblxuXHRcdC8vIEFubm91bmNlIGZvciBzY3JlZW4gcmVhZGVyc1xuXHRcdGFyaWEuc3RhdHVzKHRleHQpO1xuXG5cdFx0Ly8gUmVsYXlvdXRcblx0XHRpZiAodGhpcy5wb3NpdGlvbikge1xuXHRcdFx0Y29uc3QgcmV2ZWFsRm4gPSB0aGlzLiNjcmVhdGVab25lQW5kU2Nyb2xsUmVzdG9yZUZuKHRoaXMucG9zaXRpb24pO1xuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy4jY29tcHV0ZUhlaWdodCgpO1xuXHRcdFx0dGhpcy5fcmVsYXlvdXQoaGVpZ2h0LmxpbmVzVmFsdWUpO1xuXHRcdFx0cmV2ZWFsRm4oKTtcblx0XHR9XG5cdH1cblxuXHRoaWRlVGVybWluYXRpb25DYXJkKCk6IHZvaWQge1xuXHRcdHRoaXMuI3Rlcm1pbmF0aW9uU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvbkNhcmQuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGhpcy53aWRnZXQuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cblx0XHQvLyBSZWxheW91dFxuXHRcdGlmICh0aGlzLnBvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCByZXZlYWxGbiA9IHRoaXMuI2NyZWF0ZVpvbmVBbmRTY3JvbGxSZXN0b3JlRm4odGhpcy5wb3NpdGlvbik7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLiNjb21wdXRlSGVpZ2h0KCk7XG5cdFx0XHR0aGlzLl9yZWxheW91dChoZWlnaHQubGluZXNWYWx1ZSk7XG5cdFx0XHRyZXZlYWxGbigpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpc1Nob3dpbmdUZXJtaW5hdGlvbkNhcmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLiN0ZXJtaW5hdGlvbkNhcmQuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXQoaGVpZ2h0SW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cblx0XHR0aGlzLiN1cGRhdGVQYWRkaW5nKCk7XG5cblx0XHRjb25zdCBpbmZvID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGNvbnN0IHdpZHRoID0gaW5mby5jb250ZW50V2lkdGggLSBpbmZvLnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg7XG5cdFx0Ly8gd2lkdGggPSBNYXRoLm1pbig4NTAsIHdpZHRoKTtcblxuXHRcdHRoaXMuI2RpbWVuc2lvbiA9IG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodEluUGl4ZWwpO1xuXHRcdHRoaXMud2lkZ2V0LmxheW91dCh0aGlzLiNkaW1lbnNpb24pO1xuXG5cdFx0aWYgKHRoaXMuaXNTaG93aW5nVGVybWluYXRpb25DYXJkKSB7XG5cdFx0XHQvLyBTZXQgZXhwbGljaXQgbWF4SGVpZ2h0IG9uIHRoZSBzY3JvbGxhYmxlIGFuZCBpdHMgY29udGFpbmVyIHNvIERvbVNjcm9sbGFibGVFbGVtZW50XG5cdFx0XHQvLyBrbm93cyBpdCBuZWVkcyB0byBzaG93IGEgc2Nyb2xsYmFyIChzYW1lIHBhdHRlcm4gYXMgdGhlIG92ZXJsYXkgd2lkZ2V0KVxuXHRcdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5tYXgoNTAsIGhlaWdodEluUGl4ZWwgLSA0MCk7IC8vIHJlc2VydmUgc3BhY2UgZm9yIHRvb2xiYXIgcm93XG5cdFx0XHR0aGlzLiN0ZXJtaW5hdGlvbk1hcmtkb3duU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkuc3R5bGUubWF4SGVpZ2h0ID0gYCR7bWF4SGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25Db250YWluZXIuc3R5bGUubWF4SGVpZ2h0ID0gYCR7bWF4SGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuI3Rlcm1pbmF0aW9uTWFya2Rvd25TY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0fVxuXHR9XG5cblx0I2NvbXB1dGVIZWlnaHQoKTogeyBsaW5lc1ZhbHVlOiBudW1iZXI7IHBpeGVsc1ZhbHVlOiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgZWRpdG9ySGVpZ2h0ID0gdGhpcy5ub3RlYm9va0VkaXRvcj8uZ2V0TGF5b3V0SW5mbygpLmhlaWdodCA/PyB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0O1xuXG5cdFx0bGV0IGlubmVySGVpZ2h0OiBudW1iZXI7XG5cdFx0aWYgKHRoaXMuaXNTaG93aW5nVGVybWluYXRpb25DYXJkKSB7XG5cdFx0XHRpbm5lckhlaWdodCA9IHRoaXMuI3Rlcm1pbmF0aW9uQ2FyZC5vZmZzZXRIZWlnaHQgfHwgODA7IC8vIGZhbGxiYWNrIGJlZm9yZSBmaXJzdCBsYXlvdXRcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5uZXJIZWlnaHQgPSB0aGlzLndpZGdldC5jb250ZW50SGVpZ2h0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSB0aGlzLl9kZWNvcmF0aW5nRWxlbWVudHNIZWlnaHQoKSArIE1hdGgubWluKGlubmVySGVpZ2h0LCBNYXRoLm1heCh0aGlzLndpZGdldC5taW5IZWlnaHQsIGVkaXRvckhlaWdodCAqIDAuNDIpKTtcblx0XHRjb25zdCBoZWlnaHRJbkxpbmVzID0gY29udGVudEhlaWdodCAvIHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0cmV0dXJuIHsgbGluZXNWYWx1ZTogaGVpZ2h0SW5MaW5lcywgcGl4ZWxzVmFsdWU6IGNvbnRlbnRIZWlnaHQgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0UmVzaXplQm91bmRzKCk6IHsgbWluTGluZXM6IG51bWJlcjsgbWF4TGluZXM6IG51bWJlciB9IHtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCBkZWNvSGVpZ2h0ID0gdGhpcy5fZGVjb3JhdGluZ0VsZW1lbnRzSGVpZ2h0KCk7XG5cblx0XHRjb25zdCBtaW5IZWlnaHRQeCA9IGRlY29IZWlnaHQgKyB0aGlzLndpZGdldC5taW5IZWlnaHQ7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0UHggPSBkZWNvSGVpZ2h0ICsgdGhpcy53aWRnZXQuY29udGVudEhlaWdodDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtaW5MaW5lczogbWluSGVpZ2h0UHggLyBsaW5lSGVpZ2h0LFxuXHRcdFx0bWF4TGluZXM6IG1heEhlaWdodFB4IC8gbGluZUhlaWdodFxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX29uV2lkdGgoX3dpZHRoSW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuI2RpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5fZG9MYXlvdXQodGhpcy4jZGltZW5zaW9uLmhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdyhwb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcblx0XHRhc3NlcnRUeXBlKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdHRoaXMuI3VwZGF0ZVBhZGRpbmcoKTtcblxuXHRcdGNvbnN0IHJldmVhbFpvbmUgPSB0aGlzLiNjcmVhdGVab25lQW5kU2Nyb2xsUmVzdG9yZUZuKHBvc2l0aW9uKTtcblx0XHRzdXBlci5zaG93KHBvc2l0aW9uLCB0aGlzLiNjb21wdXRlSGVpZ2h0KCkubGluZXNWYWx1ZSk7XG5cdFx0dGhpcy53aWRnZXQuY2hhdFdpZGdldC5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdHRoaXMud2lkZ2V0LmZvY3VzKCk7XG5cblx0XHRyZXZlYWxab25lKCk7XG5cdH1cblxuXHQjdXBkYXRlUGFkZGluZygpIHtcblx0XHRhc3NlcnRUeXBlKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3QgbWFyZ2luV2l0aG91dEluZGVudGF0aW9uID0gaW5mby5nbHlwaE1hcmdpbldpZHRoICsgaW5mby5saW5lTnVtYmVyc1dpZHRoICsgaW5mby5kZWNvcmF0aW9uc1dpZHRoO1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnBhZGRpbmdMZWZ0ID0gYCR7bWFyZ2luV2l0aG91dEluZGVudGF0aW9ufXB4YDtcblx0fVxuXG5cdHJldmVhbChwb3NpdGlvbjogUG9zaXRpb24pIHtcblx0XHRjb25zdCBzdGlja3lTY3JvbGwgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCk7XG5cdFx0Y29uc3QgbWFnaWNWYWx1ZSA9IHN0aWNreVNjcm9sbC5lbmFibGVkID8gc3RpY2t5U2Nyb2xsLm1heExpbmVDb3VudCA6IDA7XG5cdFx0dGhpcy5lZGl0b3IucmV2ZWFsTGluZXMocG9zaXRpb24ubGluZU51bWJlciArIG1hZ2ljVmFsdWUsIHBvc2l0aW9uLmxpbmVOdW1iZXIgKyBtYWdpY1ZhbHVlLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0dGhpcy51cGRhdGVQb3NpdGlvbkFuZEhlaWdodChwb3NpdGlvbik7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVQb3NpdGlvbkFuZEhlaWdodChwb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCByZXZlYWxab25lID0gdGhpcy4jY3JlYXRlWm9uZUFuZFNjcm9sbFJlc3RvcmVGbihwb3NpdGlvbik7XG5cdFx0c3VwZXIudXBkYXRlUG9zaXRpb25BbmRIZWlnaHQocG9zaXRpb24sICF0aGlzLl91c2VzUmVzaXplSGVpZ2h0ID8gdGhpcy4jY29tcHV0ZUhlaWdodCgpLmxpbmVzVmFsdWUgOiB1bmRlZmluZWQpO1xuXHRcdHJldmVhbFpvbmUoKTtcblx0fVxuXG5cdCNjcmVhdGVab25lQW5kU2Nyb2xsUmVzdG9yZUZuKHBvc2l0aW9uOiBQb3NpdGlvbik6ICgpID0+IHZvaWQge1xuXG5cdFx0Y29uc3Qgc2Nyb2xsU3RhdGUgPSBTdGFibGVFZGl0b3JCb3R0b21TY3JvbGxTdGF0ZS5jYXB0dXJlKHRoaXMuZWRpdG9yKTtcblxuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyIDw9IDEgPyAxIDogMSArIHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0c2Nyb2xsU3RhdGUucmVzdG9yZSh0aGlzLmVkaXRvcik7XG5cblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuZWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXHRcdFx0Y29uc3QgbGluZVRvcCA9IHRoaXMuZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB6b25lVG9wID0gbGluZVRvcCAtIHRoaXMuI2NvbXB1dGVIZWlnaHQoKS5waXhlbHNWYWx1ZTtcblx0XHRcdGNvbnN0IGVkaXRvckhlaWdodCA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS5oZWlnaHQ7XG5cdFx0XHRjb25zdCBsaW5lQm90dG9tID0gdGhpcy5lZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblxuXHRcdFx0bGV0IG5ld1Njcm9sbFRvcCA9IHpvbmVUb3A7XG5cdFx0XHRsZXQgZm9yY2VTY3JvbGxUb3AgPSBmYWxzZTtcblxuXHRcdFx0aWYgKGxpbmVCb3R0b20gPj0gKHNjcm9sbFRvcCArIGVkaXRvckhlaWdodCkpIHtcblx0XHRcdFx0Ly8gcmV2ZWFsaW5nIHRoZSB0b3Agb2YgdGhlIHpvbmUgd291bGQgcHVzaCBvdXQgdGhlIGxpbmUgd2UgYXJlIGludGVyZXN0ZWQgaW4gYW5kXG5cdFx0XHRcdC8vIHRoZXJlZm9yZSB3ZSBrZWVwIHRoZSBsaW5lIGluIHRoZSB2aWV3cG9ydFxuXHRcdFx0XHRuZXdTY3JvbGxUb3AgPSBsaW5lQm90dG9tIC0gZWRpdG9ySGVpZ2h0O1xuXHRcdFx0XHRmb3JjZVNjcm9sbFRvcCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChuZXdTY3JvbGxUb3AgPCBzY3JvbGxUb3AgfHwgZm9yY2VTY3JvbGxUb3ApIHtcblx0XHRcdFx0dGhpcy4jbG9nU2VydmljZS50cmFjZSgnW0lFXSBSRVZFQUwgem9uZScsIHsgem9uZVRvcCwgbGluZVRvcCwgbGluZUJvdHRvbSwgc2Nyb2xsVG9wLCBuZXdTY3JvbGxUb3AsIGZvcmNlU2Nyb2xsVG9wIH0pO1xuXHRcdFx0XHR0aGlzLmVkaXRvci5zZXRTY3JvbGxUb3AobmV3U2Nyb2xsVG9wLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZXZlYWxSYW5nZShyYW5nZTogUmFuZ2UsIGlzTGFzdExpbmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRvdmVycmlkZSBoaWRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yQm90dG9tU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLmVkaXRvcik7XG5cdFx0dGhpcy4jY3R4Q3Vyc29yUG9zaXRpb24ucmVzZXQoKTtcblx0XHR0aGlzLiN0ZXJtaW5hdGlvblN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy4jdGVybWluYXRpb25DYXJkLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdHRoaXMud2lkZ2V0LmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMud2lkZ2V0LmNoYXRXaWRnZXQuc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0c3VwZXIuaGlkZSgpO1xuXHRcdGFyaWEuc3RhdHVzKGxvY2FsaXplKCdpbmxpbmVDaGF0Q2xvc2VkJywgJ0Nsb3NlZCBpbmxpbmUgY2hhdCB3aWRnZXQnKSk7XG5cdFx0c2Nyb2xsU3RhdGUucmVzdG9yZSh0aGlzLmVkaXRvcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyx1QkFBdUIsV0FBVyxHQUFHLGlCQUFpQjtBQUMvRCxZQUFZLFVBQVU7QUFDdEIsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQTZCO0FBQ3RDLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLGlCQUE4QixvQkFBb0I7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QkFBOEIsUUFBUTtBQUM5RCxVQUFNLHdCQUF3QixVQUFVLENBQUMsS0FBSyxvQkFBb0IsS0FBSyxlQUFlLEVBQUUsYUFBYSxNQUFTO0FBQzlHLGVBQVc7QUFBQSxFQUNaO0FBQUEsRUFFQSw4QkFBOEIsVUFBZ0M7QUFFN0QsVUFBTSxjQUFjLDhCQUE4QixRQUFRLEtBQUssTUFBTTtBQUVyRSxVQUFNLGFBQWEsU0FBUyxjQUFjLElBQUksSUFBSSxJQUFJLFNBQVM7QUFFL0QsV0FBTyxNQUFNO0FBQ1osa0JBQVksUUFBUSxLQUFLLE1BQU07QUFFL0IsWUFBTSxZQUFZLEtBQUssT0FBTyxhQUFhO0FBQzNDLFlBQU0sVUFBVSxLQUFLLE9BQU8sb0JBQW9CLFVBQVU7QUFDMUQsWUFBTSxVQUFVLFVBQVUsS0FBSyxlQUFlLEVBQUU7QUFDaEQsWUFBTSxlQUFlLEtBQUssT0FBTyxjQUFjLEVBQUU7QUFDakQsWUFBTSxhQUFhLEtBQUssT0FBTyx1QkFBdUIsVUFBVTtBQUVoRSxVQUFJLGVBQWU7QUFDbkIsVUFBSSxpQkFBaUI7QUFFckIsVUFBSSxjQUFlLFlBQVksY0FBZTtBQUc3Qyx1QkFBZSxhQUFhO0FBQzVCLHlCQUFpQjtBQUFBLE1BQ2xCO0FBRUEsVUFBSSxlQUFlLGFBQWEsZ0JBQWdCO0FBQy9DLGFBQUssWUFBWSxNQUFNLG9CQUFvQixFQUFFLFNBQVMsU0FBUyxZQUFZLFdBQVcsY0FBYyxlQUFlLENBQUM7QUFDcEgsYUFBSyxPQUFPLGFBQWEsY0FBYyxXQUFXLFNBQVM7QUFBQSxNQUM1RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFbUIsWUFBWSxPQUFjLFlBQTJCO0FBQUEsRUFFeEU7QUFBQSxFQUVTLE9BQWE7QUFDckIsVUFBTSxjQUFjLDhCQUE4QixRQUFRLEtBQUssTUFBTTtBQUNyRSxTQUFLLG1CQUFtQixNQUFNO0FBQzlCLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxpQkFBaUIsVUFBVSxJQUFJLFFBQVE7QUFDNUMsU0FBSyxPQUFPLFFBQVEsTUFBTSxVQUFVO0FBQ3BDLFNBQUssT0FBTyxXQUFXLFdBQVcsS0FBSztBQUN2QyxVQUFNLEtBQUs7QUFDWCxTQUFLLE9BQU8sU0FBUyxvQkFBb0IsMkJBQTJCLENBQUM7QUFDckUsZ0JBQVksUUFBUSxLQUFLLE1BQU07QUFBQSxFQUNoQztBQUNEO0FBaGJhLHVCQUFOO0FBQUEsRUF1REo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTFEVTsiLAogICJuYW1lcyI6IFsib3B0aW9ucyJdCn0K
