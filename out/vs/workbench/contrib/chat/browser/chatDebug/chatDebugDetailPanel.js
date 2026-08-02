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
import * as DOM from "../../../../../base/browser/dom.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Orientation, Sash, SashState } from "../../../../../base/browser/ui/sash/sash.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { formatEventDetail } from "./chatDebugEventDetailRenderer.js";
import { renderCustomizationDiscoveryContent, fileListToPlainText, renderCustomizationSummaryContent, customizationSummaryToPlainText } from "./chatCustomizationDiscoveryRenderer.js";
import { renderUserMessageContent, renderAgentResponseContent, messageEventToPlainText, renderResolvedMessageContent, resolvedMessageToPlainText } from "./chatDebugMessageContentRenderer.js";
import { renderToolCallContent, toolCallContentToPlainText } from "./chatDebugToolCallContentRenderer.js";
import { renderModelTurnContent, modelTurnContentToPlainText } from "./chatDebugModelTurnContentRenderer.js";
import { renderHookContent, hookContentToPlainText } from "./chatDebugHookContentRenderer.js";
const $ = DOM.$;
const DETAIL_PANEL_DEFAULT_WIDTH = 350;
const DETAIL_PANEL_MIN_WIDTH = 200;
const DETAIL_PANEL_MAX_WIDTH = 800;
let ChatDebugDetailPanel = class extends Disposable {
  constructor(parent, chatDebugService, instantiationService, editorService, clipboardService, hoverService, openerService, languageService) {
    super();
    this.chatDebugService = chatDebugService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.clipboardService = clipboardService;
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.languageService = languageService;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._onDidChangeWidth = this._register(new Emitter());
    this.onDidChangeWidth = this._onDidChangeWidth.event;
    this.detailDisposables = this._register(new DisposableStore());
    this.currentDetailText = "";
    this._width = DETAIL_PANEL_DEFAULT_WIDTH;
    this.element = DOM.append(parent, $(".chat-debug-detail-panel"));
    this.contentContainer = $(".chat-debug-detail-content");
    this.scrollable = this._register(new DomScrollableElement(this.contentContainer, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    this.element.style.width = `${this._width}px`;
    DOM.hide(this.element);
    this.sash = this._register(new Sash(parent, {
      getVerticalSashLeft: () => parent.offsetWidth - this._width
    }, { orientation: Orientation.VERTICAL }));
    this.sash.state = SashState.Disabled;
    let sashStartWidth;
    this._register(this.sash.onDidStart(() => sashStartWidth = this._width));
    this._register(this.sash.onDidEnd(() => {
      sashStartWidth = void 0;
      this.sash.layout();
    }));
    this._register(this.sash.onDidChange((e) => {
      if (sashStartWidth === void 0) {
        return;
      }
      const delta = e.startX - e.currentX;
      const newWidth = Math.max(DETAIL_PANEL_MIN_WIDTH, Math.min(DETAIL_PANEL_MAX_WIDTH, sashStartWidth + delta));
      this._width = newWidth;
      this.element.style.width = `${newWidth}px`;
      this.sash.layout();
      this._onDidChangeWidth.fire(newWidth);
    }));
    this._register(DOM.addDisposableListener(this.element, DOM.EventType.KEY_DOWN, (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        const target = e.target;
        if (target && this.element.contains(target)) {
          e.preventDefault();
          const targetWindow = DOM.getWindow(target);
          const selection = targetWindow.getSelection();
          if (selection) {
            const range = targetWindow.document.createRange();
            range.selectNodeContents(target);
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
      }
    }));
  }
  get width() {
    return this._width;
  }
  async show(event) {
    if (event.id && event.id === this.currentDetailEventId) {
      return;
    }
    this.currentDetailEventId = event.id;
    const resolved = event.id ? await this.chatDebugService.resolveEvent(event.id) : void 0;
    DOM.show(this.element);
    this.sash.state = SashState.Enabled;
    this.sash.layout();
    DOM.clearNode(this.element);
    DOM.clearNode(this.contentContainer);
    this.detailDisposables.clear();
    const header = DOM.append(this.element, $(".chat-debug-detail-header"));
    this.headerElement = header;
    this.element.appendChild(this.scrollable.getDomNode());
    const fullScreenButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize("chatDebug.openInEditor", "Open in Editor"), title: localize("chatDebug.openInEditor", "Open in Editor") }));
    fullScreenButton.element.classList.add("chat-debug-detail-button");
    fullScreenButton.icon = Codicon.goToFile;
    this.firstFocusableElement = fullScreenButton.element;
    this.detailDisposables.add(fullScreenButton.onDidClick(() => {
      this.editorService.openEditor({ contents: this.currentDetailText, resource: void 0 });
    }));
    const copyButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize("chatDebug.copyToClipboard", "Copy"), title: localize("chatDebug.copyToClipboard", "Copy") }));
    copyButton.element.classList.add("chat-debug-detail-button");
    copyButton.icon = Codicon.copy;
    this.detailDisposables.add(copyButton.onDidClick(() => {
      this.clipboardService.writeText(this.currentDetailText);
    }));
    const closeButton = this.detailDisposables.add(new Button(header, { ariaLabel: localize("chatDebug.closeDetail", "Close"), title: localize("chatDebug.closeDetail", "Close") }));
    closeButton.element.classList.add("chat-debug-detail-button");
    closeButton.icon = Codicon.close;
    this.detailDisposables.add(closeButton.onDidClick(() => {
      this.hide();
    }));
    if (resolved && resolved.kind === "fileList") {
      this.currentDetailText = fileListToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = this.instantiationService.invokeFunction(
        (accessor) => renderCustomizationDiscoveryContent(resolved, this.openerService, accessor.get(IModelService), this.languageService, this.hoverService, accessor.get(ILabelService), this.scrollable)
      );
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "customizationSummary") {
      this.currentDetailText = customizationSummaryToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = this.instantiationService.invokeFunction(
        (accessor) => renderCustomizationSummaryContent(resolved, this.openerService, accessor.get(IModelService), this.languageService, this.hoverService, accessor.get(ILabelService), this.scrollable)
      );
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "toolCall") {
      this.currentDetailText = toolCallContentToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderToolCallContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "message") {
      this.currentDetailText = resolvedMessageToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderResolvedMessageContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "modelTurn") {
      this.currentDetailText = modelTurnContentToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderModelTurnContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (resolved && resolved.kind === "hook") {
      this.currentDetailText = hookContentToPlainText(resolved);
      const { element: contentEl, disposables: contentDisposables } = await renderHookContent(resolved, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (event.kind === "userMessage") {
      this.currentDetailText = messageEventToPlainText(event);
      const { element: contentEl, disposables: contentDisposables } = await renderUserMessageContent(event, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else if (event.kind === "agentResponse") {
      this.currentDetailText = messageEventToPlainText(event);
      const { element: contentEl, disposables: contentDisposables } = await renderAgentResponseContent(event, this.languageService, this.clipboardService, this.scrollable);
      if (this.currentDetailEventId !== event.id) {
        contentDisposables.dispose();
        return;
      }
      this.detailDisposables.add(contentDisposables);
      this.contentContainer.appendChild(contentEl);
    } else {
      const pre = DOM.append(this.contentContainer, $("pre"));
      pre.tabIndex = 0;
      if (resolved) {
        this.currentDetailText = resolved.value;
      } else {
        this.currentDetailText = formatEventDetail(event);
      }
      pre.textContent = this.currentDetailText;
    }
    const parentHeight = this.element.parentElement?.clientHeight ?? 0;
    if (parentHeight > 0) {
      this.layout(parentHeight);
    } else {
      this.scrollable.scanDomNode();
    }
  }
  get isVisible() {
    return this.element.style.display !== "none";
  }
  focus() {
    this.firstFocusableElement?.focus();
  }
  /**
   * Set explicit dimensions on the scrollable element so the scrollbar
   * can compute its size. Call after the panel is shown and whenever
   * the available space changes.
   */
  layout(height) {
    const headerHeight = this.headerElement?.offsetHeight ?? 0;
    const scrollableHeight = Math.max(0, height - headerHeight);
    const scrollPos = this.scrollable.getScrollPosition();
    this.contentContainer.style.height = `${scrollableHeight}px`;
    this.scrollable.scanDomNode();
    this.scrollable.setScrollPosition({ scrollTop: scrollPos.scrollTop });
    this.sash.layout();
  }
  layoutSash() {
    this.sash.layout();
  }
  hide() {
    this.currentDetailEventId = void 0;
    this.firstFocusableElement = void 0;
    this.headerElement = void 0;
    DOM.hide(this.element);
    this.sash.state = SashState.Disabled;
    DOM.clearNode(this.element);
    DOM.clearNode(this.contentContainer);
    this.detailDisposables.clear();
    this._onDidHide.fire();
  }
};
ChatDebugDetailPanel = __decorateClass([
  __decorateParam(1, IChatDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IClipboardService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, ILanguageService)
], ChatDebugDetailPanel);
export {
  ChatDebugDetailPanel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RGVidWcvY2hhdERlYnVnRGV0YWlsUGFuZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiwgU2FzaCwgU2FzaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnRXZlbnQsIElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0RXZlbnREZXRhaWwgfSBmcm9tICcuL2NoYXREZWJ1Z0V2ZW50RGV0YWlsUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyQ3VzdG9taXphdGlvbkRpc2NvdmVyeUNvbnRlbnQsIGZpbGVMaXN0VG9QbGFpblRleHQsIHJlbmRlckN1c3RvbWl6YXRpb25TdW1tYXJ5Q29udGVudCwgY3VzdG9taXphdGlvblN1bW1hcnlUb1BsYWluVGV4dCB9IGZyb20gJy4vY2hhdEN1c3RvbWl6YXRpb25EaXNjb3ZlcnlSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyByZW5kZXJVc2VyTWVzc2FnZUNvbnRlbnQsIHJlbmRlckFnZW50UmVzcG9uc2VDb250ZW50LCBtZXNzYWdlRXZlbnRUb1BsYWluVGV4dCwgcmVuZGVyUmVzb2x2ZWRNZXNzYWdlQ29udGVudCwgcmVzb2x2ZWRNZXNzYWdlVG9QbGFpblRleHQgfSBmcm9tICcuL2NoYXREZWJ1Z01lc3NhZ2VDb250ZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyVG9vbENhbGxDb250ZW50LCB0b29sQ2FsbENvbnRlbnRUb1BsYWluVGV4dCB9IGZyb20gJy4vY2hhdERlYnVnVG9vbENhbGxDb250ZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVyTW9kZWxUdXJuQ29udGVudCwgbW9kZWxUdXJuQ29udGVudFRvUGxhaW5UZXh0IH0gZnJvbSAnLi9jaGF0RGVidWdNb2RlbFR1cm5Db250ZW50UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmVuZGVySG9va0NvbnRlbnQsIGhvb2tDb250ZW50VG9QbGFpblRleHQgfSBmcm9tICcuL2NoYXREZWJ1Z0hvb2tDb250ZW50UmVuZGVyZXIuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmNvbnN0IERFVEFJTF9QQU5FTF9ERUZBVUxUX1dJRFRIID0gMzUwO1xuY29uc3QgREVUQUlMX1BBTkVMX01JTl9XSURUSCA9IDIwMDtcbmNvbnN0IERFVEFJTF9QQU5FTF9NQVhfV0lEVEggPSA4MDA7XG5cbi8qKlxuICogUmV1c2FibGUgZGV0YWlsIHBhbmVsIHRoYXQgcmVzb2x2ZXMgYW5kIGRpc3BsYXlzIHRoZSBjb250ZW50IG9mIGFcbiAqIHNpbmdsZSB7QGxpbmsgSUNoYXREZWJ1Z0V2ZW50fS4gVXNlZCBieSBib3RoIHRoZSBsb2dzIHZpZXcgYW5kIHRoZVxuICogZmxvdyBjaGFydCB2aWV3LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRGV0YWlsUGFuZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRIaWRlID0gdGhpcy5fb25EaWRIaWRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV2lkdGggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVdpZHRoID0gdGhpcy5fb25EaWRDaGFuZ2VXaWR0aC5ldmVudDtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzY3JvbGxhYmxlOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzYXNoOiBTYXNoO1xuXHRwcml2YXRlIGhlYWRlckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRldGFpbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBjdXJyZW50RGV0YWlsVGV4dDogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgY3VycmVudERldGFpbEV2ZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmaXJzdEZvY3VzYWJsZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93aWR0aDogbnVtYmVyID0gREVUQUlMX1BBTkVMX0RFRkFVTFRfV0lEVEg7XG5cblx0Z2V0IHdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZHRoO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmNoYXQtZGVidWctZGV0YWlsLXBhbmVsJykpO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lciA9ICQoJy5jaGF0LWRlYnVnLWRldGFpbC1jb250ZW50Jyk7XG5cdFx0dGhpcy5zY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuY29udGVudENvbnRhaW5lciwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdH0pKTtcblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHt0aGlzLl93aWR0aH1weGA7XG5cdFx0RE9NLmhpZGUodGhpcy5lbGVtZW50KTtcblxuXHRcdC8vIFNhc2ggb24gdGhlIHBhcmVudCBjb250YWluZXIsIHBvc2l0aW9uZWQgYXQgdGhlIGxlZnQgZWRnZSBvZiB0aGUgZGV0YWlsIHBhbmVsXG5cdFx0dGhpcy5zYXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNhc2gocGFyZW50LCB7XG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hMZWZ0OiAoKSA9PiBwYXJlbnQub2Zmc2V0V2lkdGggLSB0aGlzLl93aWR0aCxcblx0XHR9LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCB9KSk7XG5cdFx0dGhpcy5zYXNoLnN0YXRlID0gU2FzaFN0YXRlLkRpc2FibGVkO1xuXG5cdFx0bGV0IHNhc2hTdGFydFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zYXNoLm9uRGlkU3RhcnQoKCkgPT4gc2FzaFN0YXJ0V2lkdGggPSB0aGlzLl93aWR0aCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2FzaC5vbkRpZEVuZCgoKSA9PiB7XG5cdFx0XHRzYXNoU3RhcnRXaWR0aCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2FzaC5sYXlvdXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zYXNoLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKHNhc2hTdGFydFdpZHRoID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRHJhZ2dpbmcgbGVmdCAobmVnYXRpdmUgY3VycmVudFggZGVsdGEpIHNob3VsZCBpbmNyZWFzZSB3aWR0aFxuXHRcdFx0Y29uc3QgZGVsdGEgPSBlLnN0YXJ0WCAtIGUuY3VycmVudFg7XG5cdFx0XHRjb25zdCBuZXdXaWR0aCA9IE1hdGgubWF4KERFVEFJTF9QQU5FTF9NSU5fV0lEVEgsIE1hdGgubWluKERFVEFJTF9QQU5FTF9NQVhfV0lEVEgsIHNhc2hTdGFydFdpZHRoICsgZGVsdGEpKTtcblx0XHRcdHRoaXMuX3dpZHRoID0gbmV3V2lkdGg7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHtuZXdXaWR0aH1weGA7XG5cdFx0XHR0aGlzLnNhc2gubGF5b3V0KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVdpZHRoLmZpcmUobmV3V2lkdGgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBDdHJsK0EgLyBDbWQrQSB0byBzZWxlY3QgYWxsIHdpdGhpbiB0aGUgZGV0YWlsIHBhbmVsXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoKGUuY3RybEtleSB8fCBlLm1ldGFLZXkpICYmIGUua2V5ID09PSAnYScpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0XHRpZiAodGFyZ2V0ICYmIHRoaXMuZWxlbWVudC5jb250YWlucyh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IERPTS5nZXRXaW5kb3codGFyZ2V0KTtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0YXJnZXRXaW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcblx0XHRcdFx0XHRcdHJhbmdlLnNlbGVjdE5vZGVDb250ZW50cyh0YXJnZXQpO1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uLnJlbW92ZUFsbFJhbmdlcygpO1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uLmFkZFJhbmdlKHJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBzaG93KGV2ZW50OiBJQ2hhdERlYnVnRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTa2lwIHJlLXJlbmRlcmluZyBpZiB3ZSdyZSBhbHJlYWR5IHNob3dpbmcgdGhpcyBldmVudCdzIGRldGFpbFxuXHRcdGlmIChldmVudC5pZCAmJiBldmVudC5pZCA9PT0gdGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmN1cnJlbnREZXRhaWxFdmVudElkID0gZXZlbnQuaWQ7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGV2ZW50LmlkID8gYXdhaXQgdGhpcy5jaGF0RGVidWdTZXJ2aWNlLnJlc29sdmVFdmVudChldmVudC5pZCkgOiB1bmRlZmluZWQ7XG5cblx0XHRET00uc2hvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdHRoaXMuc2FzaC5zdGF0ZSA9IFNhc2hTdGF0ZS5FbmFibGVkO1xuXHRcdHRoaXMuc2FzaC5sYXlvdXQoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuZWxlbWVudCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmNvbnRlbnRDb250YWluZXIpO1xuXHRcdHRoaXMuZGV0YWlsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIEhlYWRlciB3aXRoIGFjdGlvbiBidXR0b25zXG5cdFx0Y29uc3QgaGVhZGVyID0gRE9NLmFwcGVuZCh0aGlzLmVsZW1lbnQsICQoJy5jaGF0LWRlYnVnLWRldGFpbC1oZWFkZXInKSk7XG5cdFx0dGhpcy5oZWFkZXJFbGVtZW50ID0gaGVhZGVyO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdGNvbnN0IGZ1bGxTY3JlZW5CdXR0b24gPSB0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcub3BlbkluRWRpdG9yJywgXCJPcGVuIGluIEVkaXRvclwiKSwgdGl0bGU6IGxvY2FsaXplKCdjaGF0RGVidWcub3BlbkluRWRpdG9yJywgXCJPcGVuIGluIEVkaXRvclwiKSB9KSk7XG5cdFx0ZnVsbFNjcmVlbkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtZGVidWctZGV0YWlsLWJ1dHRvbicpO1xuXHRcdGZ1bGxTY3JlZW5CdXR0b24uaWNvbiA9IENvZGljb24uZ29Ub0ZpbGU7XG5cdFx0dGhpcy5maXJzdEZvY3VzYWJsZUVsZW1lbnQgPSBmdWxsU2NyZWVuQnV0dG9uLmVsZW1lbnQ7XG5cdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoZnVsbFNjcmVlbkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgY29udGVudHM6IHRoaXMuY3VycmVudERldGFpbFRleHQsIHJlc291cmNlOiB1bmRlZmluZWQgfSBzYXRpc2ZpZXMgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvcHlCdXR0b24gPSB0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY29weVRvQ2xpcGJvYXJkJywgXCJDb3B5XCIpLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jb3B5VG9DbGlwYm9hcmQnLCBcIkNvcHlcIikgfSkpO1xuXHRcdGNvcHlCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWRlYnVnLWRldGFpbC1idXR0b24nKTtcblx0XHRjb3B5QnV0dG9uLmljb24gPSBDb2RpY29uLmNvcHk7XG5cdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29weUJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodGhpcy5jdXJyZW50RGV0YWlsVGV4dCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY2xvc2VCdXR0b24gPSB0aGlzLmRldGFpbERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGhlYWRlciwgeyBhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RGVidWcuY2xvc2VEZXRhaWwnLCBcIkNsb3NlXCIpLCB0aXRsZTogbG9jYWxpemUoJ2NoYXREZWJ1Zy5jbG9zZURldGFpbCcsIFwiQ2xvc2VcIikgfSkpO1xuXHRcdGNsb3NlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1kZWJ1Zy1kZXRhaWwtYnV0dG9uJyk7XG5cdFx0Y2xvc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2xvc2U7XG5cdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY2xvc2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHR9KSk7XG5cblx0XHRpZiAocmVzb2x2ZWQgJiYgcmVzb2x2ZWQua2luZCA9PT0gJ2ZpbGVMaXN0Jykge1xuXHRcdFx0dGhpcy5jdXJyZW50RGV0YWlsVGV4dCA9IGZpbGVMaXN0VG9QbGFpblRleHQocmVzb2x2ZWQpO1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50OiBjb250ZW50RWwsIGRpc3Bvc2FibGVzOiBjb250ZW50RGlzcG9zYWJsZXMgfSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT5cblx0XHRcdFx0cmVuZGVyQ3VzdG9taXphdGlvbkRpc2NvdmVyeUNvbnRlbnQocmVzb2x2ZWQsIHRoaXMub3BlbmVyU2VydmljZSwgYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpLCB0aGlzLmxhbmd1YWdlU2VydmljZSwgdGhpcy5ob3ZlclNlcnZpY2UsIGFjY2Vzc29yLmdldChJTGFiZWxTZXJ2aWNlKSwgdGhpcy5zY3JvbGxhYmxlKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuZGV0YWlsRGlzcG9zYWJsZXMuYWRkKGNvbnRlbnREaXNwb3NhYmxlcyk7XG5cdFx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuYXBwZW5kQ2hpbGQoY29udGVudEVsKTtcblx0XHR9IGVsc2UgaWYgKHJlc29sdmVkICYmIHJlc29sdmVkLmtpbmQgPT09ICdjdXN0b21pemF0aW9uU3VtbWFyeScpIHtcblx0XHRcdHRoaXMuY3VycmVudERldGFpbFRleHQgPSBjdXN0b21pemF0aW9uU3VtbWFyeVRvUGxhaW5UZXh0KHJlc29sdmVkKTtcblx0XHRcdGNvbnN0IHsgZWxlbWVudDogY29udGVudEVsLCBkaXNwb3NhYmxlczogY29udGVudERpc3Bvc2FibGVzIH0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+XG5cdFx0XHRcdHJlbmRlckN1c3RvbWl6YXRpb25TdW1tYXJ5Q29udGVudChyZXNvbHZlZCwgdGhpcy5vcGVuZXJTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSksIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmhvdmVyU2VydmljZSwgYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpLCB0aGlzLnNjcm9sbGFibGUpXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSBpZiAocmVzb2x2ZWQgJiYgcmVzb2x2ZWQua2luZCA9PT0gJ3Rvb2xDYWxsJykge1xuXHRcdFx0dGhpcy5jdXJyZW50RGV0YWlsVGV4dCA9IHRvb2xDYWxsQ29udGVudFRvUGxhaW5UZXh0KHJlc29sdmVkKTtcblx0XHRcdGNvbnN0IHsgZWxlbWVudDogY29udGVudEVsLCBkaXNwb3NhYmxlczogY29udGVudERpc3Bvc2FibGVzIH0gPSBhd2FpdCByZW5kZXJUb29sQ2FsbENvbnRlbnQocmVzb2x2ZWQsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmNsaXBib2FyZFNlcnZpY2UsIHRoaXMuc2Nyb2xsYWJsZSk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCAhPT0gZXZlbnQuaWQpIHtcblx0XHRcdFx0Ly8gQW5vdGhlciBldmVudCB3YXMgc2VsZWN0ZWQgd2hpbGUgd2Ugd2VyZSByZW5kZXJpbmdcblx0XHRcdFx0Y29udGVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSBpZiAocmVzb2x2ZWQgJiYgcmVzb2x2ZWQua2luZCA9PT0gJ21lc3NhZ2UnKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gcmVzb2x2ZWRNZXNzYWdlVG9QbGFpblRleHQocmVzb2x2ZWQpO1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50OiBjb250ZW50RWwsIGRpc3Bvc2FibGVzOiBjb250ZW50RGlzcG9zYWJsZXMgfSA9IGF3YWl0IHJlbmRlclJlc29sdmVkTWVzc2FnZUNvbnRlbnQocmVzb2x2ZWQsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmNsaXBib2FyZFNlcnZpY2UsIHRoaXMuc2Nyb2xsYWJsZSk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCAhPT0gZXZlbnQuaWQpIHtcblx0XHRcdFx0Y29udGVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSBpZiAocmVzb2x2ZWQgJiYgcmVzb2x2ZWQua2luZCA9PT0gJ21vZGVsVHVybicpIHtcblx0XHRcdHRoaXMuY3VycmVudERldGFpbFRleHQgPSBtb2RlbFR1cm5Db250ZW50VG9QbGFpblRleHQocmVzb2x2ZWQpO1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50OiBjb250ZW50RWwsIGRpc3Bvc2FibGVzOiBjb250ZW50RGlzcG9zYWJsZXMgfSA9IGF3YWl0IHJlbmRlck1vZGVsVHVybkNvbnRlbnQocmVzb2x2ZWQsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmNsaXBib2FyZFNlcnZpY2UsIHRoaXMuc2Nyb2xsYWJsZSk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCAhPT0gZXZlbnQuaWQpIHtcblx0XHRcdFx0Ly8gQW5vdGhlciBldmVudCB3YXMgc2VsZWN0ZWQgd2hpbGUgd2Ugd2VyZSByZW5kZXJpbmdcblx0XHRcdFx0Y29udGVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSBpZiAocmVzb2x2ZWQgJiYgcmVzb2x2ZWQua2luZCA9PT0gJ2hvb2snKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gaG9va0NvbnRlbnRUb1BsYWluVGV4dChyZXNvbHZlZCk7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQ6IGNvbnRlbnRFbCwgZGlzcG9zYWJsZXM6IGNvbnRlbnREaXNwb3NhYmxlcyB9ID0gYXdhaXQgcmVuZGVySG9va0NvbnRlbnQocmVzb2x2ZWQsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmNsaXBib2FyZFNlcnZpY2UsIHRoaXMuc2Nyb2xsYWJsZSk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCAhPT0gZXZlbnQuaWQpIHtcblx0XHRcdFx0Ly8gQW5vdGhlciBldmVudCB3YXMgc2VsZWN0ZWQgd2hpbGUgd2Ugd2VyZSByZW5kZXJpbmdcblx0XHRcdFx0Y29udGVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gJ3VzZXJNZXNzYWdlJykge1xuXHRcdFx0dGhpcy5jdXJyZW50RGV0YWlsVGV4dCA9IG1lc3NhZ2VFdmVudFRvUGxhaW5UZXh0KGV2ZW50KTtcblx0XHRcdGNvbnN0IHsgZWxlbWVudDogY29udGVudEVsLCBkaXNwb3NhYmxlczogY29udGVudERpc3Bvc2FibGVzIH0gPSBhd2FpdCByZW5kZXJVc2VyTWVzc2FnZUNvbnRlbnQoZXZlbnQsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLmNsaXBib2FyZFNlcnZpY2UsIHRoaXMuc2Nyb2xsYWJsZSk7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50RGV0YWlsRXZlbnRJZCAhPT0gZXZlbnQuaWQpIHtcblx0XHRcdFx0Y29udGVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5hZGQoY29udGVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjb250ZW50RWwpO1xuXHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gJ2FnZW50UmVzcG9uc2UnKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnREZXRhaWxUZXh0ID0gbWVzc2FnZUV2ZW50VG9QbGFpblRleHQoZXZlbnQpO1xuXHRcdFx0Y29uc3QgeyBlbGVtZW50OiBjb250ZW50RWwsIGRpc3Bvc2FibGVzOiBjb250ZW50RGlzcG9zYWJsZXMgfSA9IGF3YWl0IHJlbmRlckFnZW50UmVzcG9uc2VDb250ZW50KGV2ZW50LCB0aGlzLmxhbmd1YWdlU2VydmljZSwgdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLCB0aGlzLnNjcm9sbGFibGUpO1xuXHRcdFx0aWYgKHRoaXMuY3VycmVudERldGFpbEV2ZW50SWQgIT09IGV2ZW50LmlkKSB7XG5cdFx0XHRcdGNvbnRlbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZGV0YWlsRGlzcG9zYWJsZXMuYWRkKGNvbnRlbnREaXNwb3NhYmxlcyk7XG5cdFx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIuYXBwZW5kQ2hpbGQoY29udGVudEVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcHJlID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRlbnRDb250YWluZXIsICQoJ3ByZScpKTtcblx0XHRcdHByZS50YWJJbmRleCA9IDA7XG5cdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0dGhpcy5jdXJyZW50RGV0YWlsVGV4dCA9IHJlc29sdmVkLnZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jdXJyZW50RGV0YWlsVGV4dCA9IGZvcm1hdEV2ZW50RGV0YWlsKGV2ZW50KTtcblx0XHRcdH1cblx0XHRcdHByZS50ZXh0Q29udGVudCA9IHRoaXMuY3VycmVudERldGFpbFRleHQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcHV0ZSBoZWlnaHQgZnJvbSB0aGUgcGFyZW50IGNvbnRhaW5lciBhbmQgc2V0IGV4cGxpY2l0XG5cdFx0Ly8gZGltZW5zaW9ucyBzbyB0aGUgc2Nyb2xsYWJsZSBlbGVtZW50IGNhbiBzaG93IHByb3BlciBzY3JvbGxiYXJzLlxuXHRcdGNvbnN0IHBhcmVudEhlaWdodCA9IHRoaXMuZWxlbWVudC5wYXJlbnRFbGVtZW50Py5jbGllbnRIZWlnaHQgPz8gMDtcblx0XHRpZiAocGFyZW50SGVpZ2h0ID4gMCkge1xuXHRcdFx0dGhpcy5sYXlvdXQocGFyZW50SGVpZ2h0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZmlyc3RGb2N1c2FibGVFbGVtZW50Py5mb2N1cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCBleHBsaWNpdCBkaW1lbnNpb25zIG9uIHRoZSBzY3JvbGxhYmxlIGVsZW1lbnQgc28gdGhlIHNjcm9sbGJhclxuXHQgKiBjYW4gY29tcHV0ZSBpdHMgc2l6ZS4gQ2FsbCBhZnRlciB0aGUgcGFuZWwgaXMgc2hvd24gYW5kIHdoZW5ldmVyXG5cdCAqIHRoZSBhdmFpbGFibGUgc3BhY2UgY2hhbmdlcy5cblx0ICovXG5cdGxheW91dChoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMuaGVhZGVyRWxlbWVudD8ub2Zmc2V0SGVpZ2h0ID8/IDA7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIGhlYWRlckhlaWdodCk7XG5cdFx0Ly8gUHJlc2VydmUgc2Nyb2xsIHBvc2l0aW9uIGFjcm9zcyBsYXlvdXQgY2hhbmdlcyAoZS5nLiB3aGVuIG9wZW5pbmdcblx0XHQvLyBhbiBlZGl0b3IgY2F1c2VzIHRoZSB3b3JrYmVuY2ggdG8gcmUtbGF5b3V0IHRoaXMgcGFuZWwpLlxuXHRcdGNvbnN0IHNjcm9sbFBvcyA9IHRoaXMuc2Nyb2xsYWJsZS5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtzY3JvbGxhYmxlSGVpZ2h0fXB4YDtcblx0XHR0aGlzLnNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLnNjcm9sbGFibGUuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFBvcy5zY3JvbGxUb3AgfSk7XG5cdFx0dGhpcy5zYXNoLmxheW91dCgpO1xuXHR9XG5cblx0bGF5b3V0U2FzaCgpOiB2b2lkIHtcblx0XHR0aGlzLnNhc2gubGF5b3V0KCk7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuY3VycmVudERldGFpbEV2ZW50SWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5maXJzdEZvY3VzYWJsZUVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5oZWFkZXJFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdERPTS5oaWRlKHRoaXMuZWxlbWVudCk7XG5cdFx0dGhpcy5zYXNoLnN0YXRlID0gU2FzaFN0YXRlLkRpc2FibGVkO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5lbGVtZW50KTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuY29udGVudENvbnRhaW5lcik7XG5cdFx0dGhpcy5kZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWEsTUFBTSxpQkFBaUI7QUFDN0MsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTBCLHlCQUF5QjtBQUNuRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFDQUFxQyxxQkFBcUIsbUNBQW1DLHVDQUF1QztBQUM3SSxTQUFTLDBCQUEwQiw0QkFBNEIseUJBQXlCLDhCQUE4QixrQ0FBa0M7QUFDeEosU0FBUyx1QkFBdUIsa0NBQWtDO0FBQ2xFLFNBQVMsd0JBQXdCLG1DQUFtQztBQUNwRSxTQUFTLG1CQUFtQiw4QkFBOEI7QUFFMUQsTUFBTSxJQUFJLElBQUk7QUFFZCxNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLHlCQUF5QjtBQU94QixJQUFNLHVCQUFO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
