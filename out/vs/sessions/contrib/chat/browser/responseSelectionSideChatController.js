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
import * as dom from "../../../../base/browser/dom.js";
import { Disposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { clamp } from "../../../../base/common/numbers.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { editorSelectionBackground, editorSelectionForeground } from "../../../../platform/theme/common/colors/editorColors.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { FeedbackInputWidget } from "../../agentFeedback/browser/feedbackInputWidget.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { resolveResponseSelection } from "./responseSelectionResolver.js";
import { createAndSendSideChat } from "./sideChatOrchestration.js";
const selectionHighlightName = "chat-response-selection";
registerThemingParticipant((theme, collector) => {
  const background = theme.getColor(editorSelectionBackground);
  if (!background) {
    return;
  }
  const foreground = theme.getColor(editorSelectionForeground);
  collector.addRule(`::highlight(${selectionHighlightName}) {
		background-color: ${background};
		${foreground ? `color: ${foreground};` : ""}
	}`);
});
function getSelectionHighlight(targetWindow) {
  const registry = targetWindow.CSS?.highlights;
  if (!registry) {
    return void 0;
  }
  let highlight = registry.get(selectionHighlightName);
  if (!highlight) {
    highlight = new targetWindow.Highlight();
    registry.set(selectionHighlightName, highlight);
  }
  return highlight;
}
function getVisibleBoundingRect(range) {
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let left = Number.POSITIVE_INFINITY;
  for (const rect of range.getClientRects()) {
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
    left = Math.min(left, rect.left);
  }
  if (bottom === Number.NEGATIVE_INFINITY) {
    const fallback = range.getBoundingClientRect();
    return fallback.width || fallback.height ? fallback : void 0;
  }
  return { top, bottom, left };
}
let ResponseSelectionSideChatController = class extends Disposable {
  constructor(_widget, _sessionsManagementService, _sessionsService, _logService, _notificationService) {
    super();
    this._widget = _widget;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    /** Pins the transcript while a selection or the question input is active. */
    this._autoScrollHold = this._register(new MutableDisposable());
    /** Bumped on a genuine chat navigation/force-dismiss so a stale submission's completion/error handler can no-op. */
    this._generation = 0;
    this._input = this._register(new FeedbackInputWidget({
      placeholder: localize("sessions.selectionSideChat.placeholder", "Ask Question"),
      ariaLabel: localize("sessions.selectionSideChat.ariaLabel", "Ask a question about the selected response text"),
      getMaxContentWidth: () => this._widget.domNode.clientWidth,
      primaryAction: {
        label: localize("sessions.selectionSideChat.ask", "Ask Question"),
        icon: Codicon.arrowUpCompact,
        keybindingLabel: localize("sessions.selectionSideChat.enter", "Enter")
      }
    }));
    this._widget.domNode.appendChild(this._input.domNode);
    this._register(this._input.onDidTriggerPrimary(() => this._submit()));
    this._register(dom.addStandardDisposableListener(this._input.inputElement, "keydown", (e) => {
      if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._dismiss();
        return;
      }
      if (e.keyCode === KeyCode.Enter) {
        if (e.browserEvent.isComposing || e.shiftKey) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this._submit();
      }
    }));
    this._register(dom.addStandardDisposableListener(this._input.inputElement, "keypress", (e) => {
      e.stopPropagation();
    }));
    this._register(dom.addStandardDisposableListener(this._input.inputElement, "input", () => {
      this._input.autoSize();
      this._input.updateActionEnabled();
    }));
    const window = dom.getWindow(this._widget.domNode);
    this._register(dom.addDisposableListener(window.document, "selectionchange", () => this._onSelectionChange()));
    this._register(this._widget.onDidScroll(() => this._reposition()));
    this._register(dom.addDisposableListener(this._widget.domNode, "scroll", () => this._reposition(), true));
    this._register(toDisposable(() => this._paintHighlight(void 0)));
  }
  /**
   * Tracks which chat the current transcript belongs to, for side-chat
   * creation. `ChatView` re-invokes this for the same chat on unrelated
   * observable changes, so only force-dismiss on a genuine resource change.
   */
  setChat(chat) {
    const changedChat = !this._chat || this._chat.resource.toString() !== chat.resource.toString();
    this._chat = chat;
    if (changedChat) {
      this._dismiss(true);
    }
  }
  _onSelectionChange() {
    this._updateAutoScrollHold();
    if (dom.isAncestorOfActiveElement(this._input.domNode)) {
      this._syncHighlight();
      return;
    }
    if (this._input.isBusy) {
      this._syncHighlight();
      return;
    }
    const resolved = resolveResponseSelection(this._widget);
    if (!resolved) {
      this._dismiss();
      return;
    }
    this._resolved = resolved;
    this._showFor();
  }
  /**
   * Pins the transcript while the user is working with a selection: a growing
   * response that scrolls itself to the bottom would otherwise drag the text
   * out from under the selection (and the affordance anchored to it). Covers
   * any selection in the transcript, not just ones that resolve to a single
   * response, since auto-scrolling mid-drag is disruptive either way.
   */
  _updateAutoScrollHold() {
    const shouldHold = !!this._resolved || this._hasTranscriptSelection();
    if (shouldHold) {
      this._autoScrollHold.value ??= this._widget.holdAutoScroll();
    } else {
      this._autoScrollHold.clear();
    }
  }
  _hasTranscriptSelection() {
    const selection = dom.getWindow(this._widget.domNode).getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
      return false;
    }
    const range = selection.getRangeAt(0);
    return this._widget.transcriptDomNode.contains(range.commonAncestorContainer);
  }
  /**
   * Keeps the captured selection visible. The native selection disappears as
   * soon as focus moves into the "Ask Question" input, so a CSS custom
   * highlight takes over painting the range for as long as the affordance is
   * open; while the native selection still covers it the browser paints it
   * and the highlight stays off so the two never stack.
   */
  _syncHighlight() {
    const range = this._resolved?.range;
    const nativeSelection = dom.getWindow(this._widget.domNode).getSelection();
    const paintedNatively = !!nativeSelection && !nativeSelection.isCollapsed && !!nativeSelection.toString().trim();
    this._paintHighlight(range && !paintedNatively ? range : void 0);
  }
  _paintHighlight(range) {
    if (this._paintedRange === range) {
      return;
    }
    const highlight = getSelectionHighlight(dom.getWindow(this._widget.domNode));
    if (!highlight) {
      return;
    }
    if (this._paintedRange) {
      highlight.delete(this._paintedRange);
    }
    if (range) {
      highlight.add(range);
    }
    this._paintedRange = range;
  }
  _showFor() {
    this._input.show();
    this._input.autoSize();
    this._input.updateActionEnabled();
    this._syncHighlight();
    this._reposition();
  }
  /**
   * Re-anchors the input to the (live) selection range. Called on every
   * transcript scroll so the overlay tracks the text it belongs to instead of
   * staying pinned where the selection used to be.
   */
  _reposition() {
    const resolved = this._resolved;
    if (!resolved) {
      return;
    }
    const selectionRect = getVisibleBoundingRect(resolved.range);
    if (!selectionRect) {
      this._dismiss();
      return;
    }
    this._input.show();
    const originRect = this._widget.domNode.getBoundingClientRect();
    const bounds = this._transcriptBounds();
    const gap = 4;
    const inputWidth = this._input.domNode.offsetWidth;
    const inputHeight = this._input.domNode.offsetHeight;
    const minLeft = bounds.left - originRect.left;
    const maxLeft = Math.max(minLeft, minLeft + bounds.width - inputWidth);
    const left = clamp(selectionRect.left - originRect.left, minLeft, maxLeft);
    const minTop = bounds.top - originRect.top;
    const maxTop = Math.max(minTop, minTop + bounds.height - inputHeight);
    let top = selectionRect.bottom - originRect.top + gap;
    if (top > maxTop) {
      const aboveTop = selectionRect.top - originRect.top - inputHeight - gap;
      top = aboveTop >= minTop ? aboveTop : maxTop;
    }
    top = clamp(top, minTop, maxTop);
    this._input.domNode.style.top = `${top}px`;
    this._input.domNode.style.left = `${left}px`;
  }
  /**
   * Box the overlay is confined to, in viewport coordinates: the scrollable
   * transcript, further clipped to the window so it can never render out of
   * sight on a small window.
   */
  _transcriptBounds() {
    const rect = this._widget.transcriptDomNode.getBoundingClientRect();
    const viewport = dom.getWindow(this._widget.domNode);
    const top = Math.max(rect.top, 0);
    const left = Math.max(rect.left, 0);
    const bottom = Math.min(rect.top + rect.height, viewport.innerHeight);
    const right = Math.min(rect.left + rect.width, viewport.innerWidth);
    return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }
  /**
   * Dismisses the input. While a submission is pending (`_input.isBusy`),
   * only a genuine view change (`force`, from {@link setChat}) may dismiss
   * it — outside interactions like Escape or selection invalidation must not
   * race the in-flight create/open/send.
   */
  _dismiss(force = false) {
    if (!force && this._input.isBusy) {
      return;
    }
    if (force) {
      this._generation++;
    }
    const hadFocus = dom.isAncestorOfActiveElement(this._input.domNode);
    this._resolved = void 0;
    this._paintHighlight(void 0);
    this._updateAutoScrollHold();
    this._input.setBusy(false);
    this._input.hide();
    this._input.clearInput();
    if (hadFocus) {
      this._widget.focusResponseItem(true);
    }
  }
  _submit() {
    const resolved = this._resolved;
    const chat = this._chat;
    const query = this._input.inputElement.value.trim();
    if (!resolved || !chat || !query || this._input.isBusy) {
      return;
    }
    const found = this._sessionsManagementService.getSessionForChatResource(chat.resource);
    if (!found) {
      this._notificationService.warn(localize("sessions.selectionSideChat.sessionUnavailable", "A side chat cannot be created from this conversation."));
      return;
    }
    const { session } = found;
    if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
      this._notificationService.warn(localize("sessions.selectionSideChat.unsupported", "This conversation does not support side chats."));
      return;
    }
    this._input.setBusy(true, localize("sessions.selectionSideChat.busy", "Asking question\u2026"));
    const generation = this._generation;
    createAndSendSideChat(this._sessionsManagementService, this._sessionsService, session, chat.resource, resolved.response.requestId, query, { text: resolved.text }).then(() => {
      if (this._generation !== generation) {
        return;
      }
      this._input.setBusy(false);
    }).catch((err) => {
      this._logService.error("[selectionSideChat] Failed to create side chat", err);
      if (this._generation !== generation) {
        return;
      }
      this._notificationService.error(localize("sessions.selectionSideChat.createFailed", "The side chat could not be created."));
      this._input.setBusy(false);
      this._input.inputElement.value = query;
      this._input.autoSize();
      this._input.updateActionEnabled();
      this._input.inputElement.focus();
    });
  }
};
ResponseSelectionSideChatController = __decorateClass([
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, ILogService),
  __decorateParam(4, INotificationService)
], ResponseSelectionSideChatController);
export {
  ResponseSelectionSideChatController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3Jlc3BvbnNlU2VsZWN0aW9uU2lkZUNoYXRDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBjbGFtcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGVkaXRvclNlbGVjdGlvbkJhY2tncm91bmQsIGVkaXRvclNlbGVjdGlvbkZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2VkaXRvckNvbG9ycy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBGZWVkYmFja0lucHV0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vYWdlbnRGZWVkYmFjay9icm93c2VyL2ZlZWRiYWNrSW5wdXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0LCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFJlc3BvbnNlU2VsZWN0aW9uLCByZXNvbHZlUmVzcG9uc2VTZWxlY3Rpb24gfSBmcm9tICcuL3Jlc3BvbnNlU2VsZWN0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlQW5kU2VuZFNpZGVDaGF0IH0gZnJvbSAnLi9zaWRlQ2hhdE9yY2hlc3RyYXRpb24uanMnO1xuXG4vKipcbiAqIE5hbWUgb2YgdGhlIENTUyBjdXN0b20gaGlnaGxpZ2h0IHRoYXQgc3RhbmRzIGluIGZvciB0aGUgbmF0aXZlIHNlbGVjdGlvblxuICogb25jZSB0aGUgYnJvd3NlciBjb2xsYXBzZXMgaXQuXG4gKi9cbmNvbnN0IHNlbGVjdGlvbkhpZ2hsaWdodE5hbWUgPSAnY2hhdC1yZXNwb25zZS1zZWxlY3Rpb24nO1xuXG4vLyBIaWdobGlnaHQgcHNldWRvLWVsZW1lbnRzIGluaGVyaXQgY3VzdG9tIHByb3BlcnRpZXMgZnJvbSB0aGUgcm9vdCBlbGVtZW50XG4vLyBvbmx5LCBzbyB0aGV5IGNhbm5vdCBzZWUgdGhlIGAtLXZzY29kZS0qYCB0aGVtZSB2YXJpYWJsZXMgKHdoaWNoIGFyZSBzY29wZWRcbi8vIHRvIGAubW9uYWNvLXdvcmtiZW5jaGApOyB0aGUgY29sb3IgaGFzIHRvIGJlIGJha2VkIGludG8gdGhlIHJ1bGUgaW5zdGVhZC5cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IGJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JTZWxlY3Rpb25CYWNrZ3JvdW5kKTtcblx0aWYgKCFiYWNrZ3JvdW5kKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdC8vIEhpZ2ggY29udHJhc3QgdGhlbWVzIHNlbGVjdCB3aXRoIGFuIG9wYXF1ZSBiYWNrZ3JvdW5kIGFuZCByZWx5IG9uIHRoZVxuXHQvLyBwYWlyZWQgZm9yZWdyb3VuZCB0byBrZWVwIHRoZSB0ZXh0IHJlYWRhYmxlLlxuXHRjb25zdCBmb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yU2VsZWN0aW9uRm9yZWdyb3VuZCk7XG5cdGNvbGxlY3Rvci5hZGRSdWxlKGA6OmhpZ2hsaWdodCgke3NlbGVjdGlvbkhpZ2hsaWdodE5hbWV9KSB7XG5cdFx0YmFja2dyb3VuZC1jb2xvcjogJHtiYWNrZ3JvdW5kfTtcblx0XHQke2ZvcmVncm91bmQgPyBgY29sb3I6ICR7Zm9yZWdyb3VuZH07YCA6ICcnfVxuXHR9YCk7XG59KTtcblxuLyoqXG4gKiBUaGUgaGlnaGxpZ2h0IHJlZ2lzdHJ5IGlzIHBlci13aW5kb3cgYW5kIHNoYXJlZCBieSBldmVyeSBjaGF0IHZpZXcgaW4gaXQsIHNvXG4gKiBhbGwgY29udHJvbGxlcnMgY29udHJpYnV0ZSByYW5nZXMgdG8gb25lIHJlZ2lzdGVyZWQge0BsaW5rIEhpZ2hsaWdodH0gcmF0aGVyXG4gKiB0aGFuIG92ZXJ3cml0aW5nIGVhY2ggb3RoZXIncyBlbnRyeS5cbiAqL1xuZnVuY3Rpb24gZ2V0U2VsZWN0aW9uSGlnaGxpZ2h0KHRhcmdldFdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBIaWdobGlnaHQgfCB1bmRlZmluZWQge1xuXHRjb25zdCByZWdpc3RyeSA9IHRhcmdldFdpbmRvdy5DU1M/LmhpZ2hsaWdodHM7XG5cdGlmICghcmVnaXN0cnkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBDU1MgQ3VzdG9tIEhpZ2hsaWdodCBBUEkgdW5hdmFpbGFibGVcblx0fVxuXHRsZXQgaGlnaGxpZ2h0ID0gcmVnaXN0cnkuZ2V0KHNlbGVjdGlvbkhpZ2hsaWdodE5hbWUpO1xuXHRpZiAoIWhpZ2hsaWdodCkge1xuXHRcdGhpZ2hsaWdodCA9IG5ldyB0YXJnZXRXaW5kb3cuSGlnaGxpZ2h0KCk7XG5cdFx0cmVnaXN0cnkuc2V0KHNlbGVjdGlvbkhpZ2hsaWdodE5hbWUsIGhpZ2hsaWdodCk7XG5cdH1cblx0cmV0dXJuIGhpZ2hsaWdodDtcbn1cblxuLyoqXG4gKiBCb3VuZGluZyBib3ggb2YgdGhlIHJhbmdlJ3MgKnZpc2libGUqIGxpbmUgYm94ZXMuIGBSYW5nZS5nZXRCb3VuZGluZ0NsaWVudFJlY3RgXG4gKiBpbmNsdWRlcyB0aGUgZW1wdHkgYm94IGEgbGluZSBzZWxlY3Rpb24gbGVhdmVzIGF0IHRoZSBzdGFydCBvZiB0aGUgZm9sbG93aW5nXG4gKiBibG9jaywgd2hpY2ggd291bGQgcHVzaCB0aGUgYWZmb3JkYW5jZSBhIGxpbmUgdG9vIGZhciBkb3duLlxuICovXG5mdW5jdGlvbiBnZXRWaXNpYmxlQm91bmRpbmdSZWN0KHJhbmdlOiBSYW5nZSk6IHsgdG9wOiBudW1iZXI7IGJvdHRvbTogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdGxldCB0b3AgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdGxldCBib3R0b20gPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG5cdGxldCBsZWZ0ID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRmb3IgKGNvbnN0IHJlY3Qgb2YgcmFuZ2UuZ2V0Q2xpZW50UmVjdHMoKSkge1xuXHRcdGlmIChyZWN0LndpZHRoID09PSAwIHx8IHJlY3QuaGVpZ2h0ID09PSAwKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0dG9wID0gTWF0aC5taW4odG9wLCByZWN0LnRvcCk7XG5cdFx0Ym90dG9tID0gTWF0aC5tYXgoYm90dG9tLCByZWN0LmJvdHRvbSk7XG5cdFx0bGVmdCA9IE1hdGgubWluKGxlZnQsIHJlY3QubGVmdCk7XG5cdH1cblx0aWYgKGJvdHRvbSA9PT0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZKSB7XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSByYW5nZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4gZmFsbGJhY2sud2lkdGggfHwgZmFsbGJhY2suaGVpZ2h0ID8gZmFsbGJhY2sgOiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgdG9wLCBib3R0b20sIGxlZnQgfTtcbn1cblxuLyoqXG4gKiBBZ2VudHMtd2luZG93LW9ubHkgY29udHJvbGxlciB0aGF0IHNob3dzIGFuIFwiQXNrIFF1ZXN0aW9uXCIgaW5wdXQgKHJldXNpbmdcbiAqIHtAbGluayBGZWVkYmFja0lucHV0V2lkZ2V0fSkgd2hlbiB0aGUgdXNlciBzZWxlY3RzIHRleHQgd2l0aGluIGEgc2luZ2xlXG4gKiBhc3Npc3RhbnQgcmVzcG9uc2UncyByZW5kZXJlZCBtYXJrZG93biwgYW5kIGNyZWF0ZXMgYSBzaWRlIGNoYXQgYW5jaG9yZWQgdG9cbiAqIHRoYXQgcmVzcG9uc2Ugd2hlbiBzdWJtaXR0ZWQuIE93bmVkIGJ5IGBDaGF0Vmlld2Agc28gdGhpcyBhZmZvcmRhbmNlIG5ldmVyXG4gKiBhcHBlYXJzIGluIHRoZSByZWd1bGFyIHdvcmtiZW5jaCBjaGF0IHN1cmZhY2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0OiBGZWVkYmFja0lucHV0V2lkZ2V0O1xuXHRwcml2YXRlIF9yZXNvbHZlZDogSVJlc29sdmVkUmVzcG9uc2VTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdC8qKiBSYW5nZSBjdXJyZW50bHkgcGFpbnRlZCB2aWEgdGhlIENTUyBjdXN0b20gaGlnaGxpZ2h0LCBpZiBhbnkuICovXG5cdHByaXZhdGUgX3BhaW50ZWRSYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdC8qKiBQaW5zIHRoZSB0cmFuc2NyaXB0IHdoaWxlIGEgc2VsZWN0aW9uIG9yIHRoZSBxdWVzdGlvbiBpbnB1dCBpcyBhY3RpdmUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9TY3JvbGxIb2xkID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBfY2hhdDogSUNoYXQgfCB1bmRlZmluZWQ7XG5cdC8qKiBCdW1wZWQgb24gYSBnZW51aW5lIGNoYXQgbmF2aWdhdGlvbi9mb3JjZS1kaXNtaXNzIHNvIGEgc3RhbGUgc3VibWlzc2lvbidzIGNvbXBsZXRpb24vZXJyb3IgaGFuZGxlciBjYW4gbm8tb3AuICovXG5cdHByaXZhdGUgX2dlbmVyYXRpb24gPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldDogSUNoYXRXaWRnZXQsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmVlZGJhY2tJbnB1dFdpZGdldCh7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3Nlc3Npb25zLnNlbGVjdGlvblNpZGVDaGF0LnBsYWNlaG9sZGVyJywgXCJBc2sgUXVlc3Rpb25cIiksXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdzZXNzaW9ucy5zZWxlY3Rpb25TaWRlQ2hhdC5hcmlhTGFiZWwnLCBcIkFzayBhIHF1ZXN0aW9uIGFib3V0IHRoZSBzZWxlY3RlZCByZXNwb25zZSB0ZXh0XCIpLFxuXHRcdFx0Z2V0TWF4Q29udGVudFdpZHRoOiAoKSA9PiB0aGlzLl93aWRnZXQuZG9tTm9kZS5jbGllbnRXaWR0aCxcblx0XHRcdHByaW1hcnlBY3Rpb246IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZXNzaW9ucy5zZWxlY3Rpb25TaWRlQ2hhdC5hc2snLCBcIkFzayBRdWVzdGlvblwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1VwQ29tcGFjdCxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsOiBsb2NhbGl6ZSgnc2Vzc2lvbnMuc2VsZWN0aW9uU2lkZUNoYXQuZW50ZXInLCBcIkVudGVyXCIpLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fd2lkZ2V0LmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faW5wdXQuZG9tTm9kZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnB1dC5vbkRpZFRyaWdnZXJQcmltYXJ5KCgpID0+IHRoaXMuX3N1Ym1pdCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2lucHV0LmlucHV0RWxlbWVudCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fZGlzbWlzcygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdGlmIChlLmJyb3dzZXJFdmVudC5pc0NvbXBvc2luZyB8fCBlLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdFx0Ly8gTGV0IElNRSBjb21wb3NpdGlvbiBmaW5pc2gsIG9yIFNoaWZ0K0VudGVyIGluc2VydCBhIG5ld2xpbmUuXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fc3VibWl0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9pbnB1dC5pbnB1dEVsZW1lbnQsICdrZXlwcmVzcycsIGUgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2lucHV0LmlucHV0RWxlbWVudCwgJ2lucHV0JywgKCkgPT4ge1xuXHRcdFx0dGhpcy5faW5wdXQuYXV0b1NpemUoKTtcblx0XHRcdHRoaXMuX2lucHV0LnVwZGF0ZUFjdGlvbkVuYWJsZWQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB3aW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuX3dpZGdldC5kb21Ob2RlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdy5kb2N1bWVudCwgJ3NlbGVjdGlvbmNoYW5nZScsICgpID0+IHRoaXMuX29uU2VsZWN0aW9uQ2hhbmdlKCkpKTtcblx0XHQvLyBUaGUgdHJhbnNjcmlwdCBpcyBhIHZpcnR1YWxpemVkIGxpc3QgdGhhdCBzY3JvbGxzIGJ5IHRyYW5zZm9ybSwgc28gaXRcblx0XHQvLyBuZXZlciBmaXJlcyBhIERPTSBzY3JvbGwgZXZlbnQ7IGZvbGxvdyBpdHMgb3duIHNjcm9sbCBldmVudCBpbnN0ZWFkLlxuXHRcdC8vIFRoZSBjYXB0dXJlLXBoYXNlIERPTSBsaXN0ZW5lciBhZGRpdGlvbmFsbHkgY292ZXJzIG5lc3RlZCBzY3JvbGxlcnNcblx0XHQvLyAoYSBzY3JvbGxhYmxlIGNvZGUgYmxvY2sgd2l0aGluIGEgcmVzcG9uc2UpLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dpZGdldC5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLl9yZXBvc2l0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3dpZGdldC5kb21Ob2RlLCAnc2Nyb2xsJywgKCkgPT4gdGhpcy5fcmVwb3NpdGlvbigpLCB0cnVlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3BhaW50SGlnaGxpZ2h0KHVuZGVmaW5lZCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFja3Mgd2hpY2ggY2hhdCB0aGUgY3VycmVudCB0cmFuc2NyaXB0IGJlbG9uZ3MgdG8sIGZvciBzaWRlLWNoYXRcblx0ICogY3JlYXRpb24uIGBDaGF0Vmlld2AgcmUtaW52b2tlcyB0aGlzIGZvciB0aGUgc2FtZSBjaGF0IG9uIHVucmVsYXRlZFxuXHQgKiBvYnNlcnZhYmxlIGNoYW5nZXMsIHNvIG9ubHkgZm9yY2UtZGlzbWlzcyBvbiBhIGdlbnVpbmUgcmVzb3VyY2UgY2hhbmdlLlxuXHQgKi9cblx0c2V0Q2hhdChjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWRDaGF0ID0gIXRoaXMuX2NoYXQgfHwgdGhpcy5fY2hhdC5yZXNvdXJjZS50b1N0cmluZygpICE9PSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fY2hhdCA9IGNoYXQ7XG5cdFx0aWYgKGNoYW5nZWRDaGF0KSB7XG5cdFx0XHR0aGlzLl9kaXNtaXNzKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uU2VsZWN0aW9uQ2hhbmdlKCk6IHZvaWQge1xuXHRcdC8vIFJlZmxlY3QgdGhlIG5ldyBzZWxlY3Rpb24gc3RhdGUgZmlyc3Q6IGV2ZXJ5IGJyYW5jaCBiZWxvdyAoaW5jbHVkaW5nXG5cdFx0Ly8gdGhlIGVhcmx5IHJldHVybnMpIG5lZWRzIHRoZSBob2xkIHRvIG1hdGNoIHdoYXQgaXMgY3VycmVudGx5IHNlbGVjdGVkLlxuXHRcdHRoaXMuX3VwZGF0ZUF1dG9TY3JvbGxIb2xkKCk7XG5cdFx0Ly8gVGhlIGJyb3dzZXIgY29sbGFwc2VzIHRoZSBkb2N1bWVudCBzZWxlY3Rpb24gdGhlIG1vbWVudCB0aGUgXCJBc2tcblx0XHQvLyBRdWVzdGlvblwiIHRleHRhcmVhIHJlY2VpdmVzIGZvY3VzICh0ZXh0YXJlYXMgZG9uJ3QgcGFydGljaXBhdGUgaW5cblx0XHQvLyB0aGUgU2VsZWN0aW9uIEFQSSkuIElnbm9yZSBzZWxlY3Rpb25jaGFuZ2UgZW50aXJlbHkgd2hpbGUgZm9jdXMgaXNcblx0XHQvLyBpbnNpZGUgdGhlIGlucHV0IHNvIHR5cGluZyBkb2Vzbid0IGRpc21pc3MgdGhlIHdpZGdldCBpdCBqdXN0XG5cdFx0Ly8gY2FwdHVyZWQ7IGEgcmVhbCBvdXRzaWRlIGludmFsaWRhdGlvbiBpcyBoYW5kbGVkIG9uY2UgZm9jdXNcblx0XHQvLyBhY3R1YWxseSBsZWF2ZXMgKHRoZSBuZXh0IHNlbGVjdGlvbmNoYW5nZSBydW5zIHdpdGggZm9jdXMgb3V0c2lkZSkuXG5cdFx0aWYgKGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuX2lucHV0LmRvbU5vZGUpKSB7XG5cdFx0XHR0aGlzLl9zeW5jSGlnaGxpZ2h0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEEgcGVuZGluZyBzdWJtaXNzaW9uIG93bnMgdGhlIG92ZXJsYXkgdW50aWwgdGhlIHZpZXcgY2hhbmdlcyAoc2VlXG5cdFx0Ly8gYF9kaXNtaXNzYCk7IGRvbid0IGxldCBhbiBpbmNpZGVudGFsIHNlbGVjdGlvbiBjaGFuZ2UgcmVwb3NpdGlvbiBvclxuXHRcdC8vIHN3YXAgdGhlIGNhcHR1cmVkIHNlbGVjdGlvbiBvdXQgZnJvbSB1bmRlciBpdC5cblx0XHRpZiAodGhpcy5faW5wdXQuaXNCdXN5KSB7XG5cdFx0XHR0aGlzLl9zeW5jSGlnaGxpZ2h0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZVJlc3BvbnNlU2VsZWN0aW9uKHRoaXMuX3dpZGdldCk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0dGhpcy5fZGlzbWlzcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNvbHZlZCA9IHJlc29sdmVkO1xuXHRcdHRoaXMuX3Nob3dGb3IoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaW5zIHRoZSB0cmFuc2NyaXB0IHdoaWxlIHRoZSB1c2VyIGlzIHdvcmtpbmcgd2l0aCBhIHNlbGVjdGlvbjogYSBncm93aW5nXG5cdCAqIHJlc3BvbnNlIHRoYXQgc2Nyb2xscyBpdHNlbGYgdG8gdGhlIGJvdHRvbSB3b3VsZCBvdGhlcndpc2UgZHJhZyB0aGUgdGV4dFxuXHQgKiBvdXQgZnJvbSB1bmRlciB0aGUgc2VsZWN0aW9uIChhbmQgdGhlIGFmZm9yZGFuY2UgYW5jaG9yZWQgdG8gaXQpLiBDb3ZlcnNcblx0ICogYW55IHNlbGVjdGlvbiBpbiB0aGUgdHJhbnNjcmlwdCwgbm90IGp1c3Qgb25lcyB0aGF0IHJlc29sdmUgdG8gYSBzaW5nbGVcblx0ICogcmVzcG9uc2UsIHNpbmNlIGF1dG8tc2Nyb2xsaW5nIG1pZC1kcmFnIGlzIGRpc3J1cHRpdmUgZWl0aGVyIHdheS5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUF1dG9TY3JvbGxIb2xkKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNob3VsZEhvbGQgPSAhIXRoaXMuX3Jlc29sdmVkIHx8IHRoaXMuX2hhc1RyYW5zY3JpcHRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2hvdWxkSG9sZCkge1xuXHRcdFx0dGhpcy5fYXV0b1Njcm9sbEhvbGQudmFsdWUgPz89IHRoaXMuX3dpZGdldC5ob2xkQXV0b1Njcm9sbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hdXRvU2Nyb2xsSG9sZC5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc1RyYW5zY3JpcHRTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gZG9tLmdldFdpbmRvdyh0aGlzLl93aWRnZXQuZG9tTm9kZSkuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb24gfHwgc2VsZWN0aW9uLmlzQ29sbGFwc2VkIHx8ICFzZWxlY3Rpb24ucmFuZ2VDb3VudCB8fCAhc2VsZWN0aW9uLnRvU3RyaW5nKCkudHJpbSgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gc2VsZWN0aW9uLmdldFJhbmdlQXQoMCk7XG5cdFx0Ly8gU2NvcGVkIHRvIHRoZSB0cmFuc2NyaXB0IHNwZWNpZmljYWxseTogc2VsZWN0aW5nIHRleHQgZWxzZXdoZXJlIGluIHRoZVxuXHRcdC8vIGNoYXQgdmlldyAoYSBiYW5uZXIsIHRoZSBpbnB1dCkgc2F5cyBub3RoaW5nIGFib3V0IHdhbnRpbmcgdGhlXG5cdFx0Ly8gdHJhbnNjcmlwdCB0byBob2xkIHN0aWxsLlxuXHRcdHJldHVybiB0aGlzLl93aWRnZXQudHJhbnNjcmlwdERvbU5vZGUuY29udGFpbnMocmFuZ2UuY29tbW9uQW5jZXN0b3JDb250YWluZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEtlZXBzIHRoZSBjYXB0dXJlZCBzZWxlY3Rpb24gdmlzaWJsZS4gVGhlIG5hdGl2ZSBzZWxlY3Rpb24gZGlzYXBwZWFycyBhc1xuXHQgKiBzb29uIGFzIGZvY3VzIG1vdmVzIGludG8gdGhlIFwiQXNrIFF1ZXN0aW9uXCIgaW5wdXQsIHNvIGEgQ1NTIGN1c3RvbVxuXHQgKiBoaWdobGlnaHQgdGFrZXMgb3ZlciBwYWludGluZyB0aGUgcmFuZ2UgZm9yIGFzIGxvbmcgYXMgdGhlIGFmZm9yZGFuY2UgaXNcblx0ICogb3Blbjsgd2hpbGUgdGhlIG5hdGl2ZSBzZWxlY3Rpb24gc3RpbGwgY292ZXJzIGl0IHRoZSBicm93c2VyIHBhaW50cyBpdFxuXHQgKiBhbmQgdGhlIGhpZ2hsaWdodCBzdGF5cyBvZmYgc28gdGhlIHR3byBuZXZlciBzdGFjay5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNIaWdobGlnaHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9yZXNvbHZlZD8ucmFuZ2U7XG5cdFx0Y29uc3QgbmF0aXZlU2VsZWN0aW9uID0gZG9tLmdldFdpbmRvdyh0aGlzLl93aWRnZXQuZG9tTm9kZSkuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3QgcGFpbnRlZE5hdGl2ZWx5ID0gISFuYXRpdmVTZWxlY3Rpb24gJiYgIW5hdGl2ZVNlbGVjdGlvbi5pc0NvbGxhcHNlZCAmJiAhIW5hdGl2ZVNlbGVjdGlvbi50b1N0cmluZygpLnRyaW0oKTtcblx0XHR0aGlzLl9wYWludEhpZ2hsaWdodChyYW5nZSAmJiAhcGFpbnRlZE5hdGl2ZWx5ID8gcmFuZ2UgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFpbnRIaWdobGlnaHQocmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BhaW50ZWRSYW5nZSA9PT0gcmFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ID0gZ2V0U2VsZWN0aW9uSGlnaGxpZ2h0KGRvbS5nZXRXaW5kb3codGhpcy5fd2lkZ2V0LmRvbU5vZGUpKTtcblx0XHRpZiAoIWhpZ2hsaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcGFpbnRlZFJhbmdlKSB7XG5cdFx0XHRoaWdobGlnaHQuZGVsZXRlKHRoaXMuX3BhaW50ZWRSYW5nZSk7XG5cdFx0fVxuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0aGlnaGxpZ2h0LmFkZChyYW5nZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3BhaW50ZWRSYW5nZSA9IHJhbmdlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0ZvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dC5zaG93KCk7XG5cdFx0dGhpcy5faW5wdXQuYXV0b1NpemUoKTtcblx0XHR0aGlzLl9pbnB1dC51cGRhdGVBY3Rpb25FbmFibGVkKCk7XG5cdFx0dGhpcy5fc3luY0hpZ2hsaWdodCgpO1xuXHRcdHRoaXMuX3JlcG9zaXRpb24oKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1hbmNob3JzIHRoZSBpbnB1dCB0byB0aGUgKGxpdmUpIHNlbGVjdGlvbiByYW5nZS4gQ2FsbGVkIG9uIGV2ZXJ5XG5cdCAqIHRyYW5zY3JpcHQgc2Nyb2xsIHNvIHRoZSBvdmVybGF5IHRyYWNrcyB0aGUgdGV4dCBpdCBiZWxvbmdzIHRvIGluc3RlYWQgb2Zcblx0ICogc3RheWluZyBwaW5uZWQgd2hlcmUgdGhlIHNlbGVjdGlvbiB1c2VkIHRvIGJlLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVwb3NpdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVkO1xuXHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uUmVjdCA9IGdldFZpc2libGVCb3VuZGluZ1JlY3QocmVzb2x2ZWQucmFuZ2UpO1xuXHRcdGlmICghc2VsZWN0aW9uUmVjdCkge1xuXHRcdFx0Ly8gVGhlIHRyYW5zY3JpcHQgaXMgdmlydHVhbGl6ZWQsIHNvIHNjcm9sbGluZyBmYXIgZW5vdWdoIHJlbW92ZXMgdGhlXG5cdFx0XHQvLyBzZWxlY3RlZCByb3cuIFJlbW92aW5nIGEgbm9kZSByZS1ob21lcyBhbnkgbGl2ZSByYW5nZSBvbnRvIHRoZVxuXHRcdFx0Ly8gc3Vydml2aW5nIHBhcmVudCwgY29sbGFwc2luZyBpdCwgc28gdGhlIHJhbmdlIHN0aWxsIGxvb2tzIGF0dGFjaGVkXG5cdFx0XHQvLyBidXQgbm8gbG9uZ2VyIGNvdmVycyBhbnl0aGluZy4gVGhlIGFuY2hvcmVkIHRleHQgY2Fubm90IGNvbWUgYmFja1xuXHRcdFx0Ly8gXHUyMDE0IHJlLXJlbmRlcmluZyBidWlsZHMgbmV3IG5vZGVzIFx1MjAxNCBzbyBkaXNtaXNzIHJhdGhlciB0aGFuIGxlYXZlIHRoZVxuXHRcdFx0Ly8gaW5wdXQgcG9pbnRpbmcgYXQgbm90aGluZyBhbmQgdGhlIHRyYW5zY3JpcHQgcGlubmVkIGZvcmV2ZXIuXG5cdFx0XHR0aGlzLl9kaXNtaXNzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lucHV0LnNob3coKTtcblxuXHRcdC8vIFRoZSBvdmVybGF5IGlzIGEgY2hpbGQgb2YgdGhlIHdpZGdldCwgc28gaXRzIGNvb3JkaW5hdGVzIGFyZSByZWxhdGl2ZVxuXHRcdC8vIHRvIHRoYXQsIGJ1dCBpdCBpcyBjb25maW5lZCB0byB0aGUgc2Nyb2xsYWJsZSB0cmFuc2NyaXB0OiBvbmNlIHRoZVxuXHRcdC8vIHNlbGVjdGlvbiBzY3JvbGxzIHBhc3QgYW4gZWRnZSB0aGUgb3ZlcmxheSBwYXJrcyBhdCB0aGF0IGVkZ2UgaW5zdGVhZFxuXHRcdC8vIG9mIGRyaWZ0aW5nIG92ZXIgdGhlIGNoYXQgaW5wdXQgb3Igb2ZmIHRoZSB3aW5kb3cuXG5cdFx0Y29uc3Qgb3JpZ2luUmVjdCA9IHRoaXMuX3dpZGdldC5kb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IGJvdW5kcyA9IHRoaXMuX3RyYW5zY3JpcHRCb3VuZHMoKTtcblx0XHRjb25zdCBnYXAgPSA0O1xuXHRcdGNvbnN0IGlucHV0V2lkdGggPSB0aGlzLl9pbnB1dC5kb21Ob2RlLm9mZnNldFdpZHRoO1xuXHRcdGNvbnN0IGlucHV0SGVpZ2h0ID0gdGhpcy5faW5wdXQuZG9tTm9kZS5vZmZzZXRIZWlnaHQ7XG5cblx0XHRjb25zdCBtaW5MZWZ0ID0gYm91bmRzLmxlZnQgLSBvcmlnaW5SZWN0LmxlZnQ7XG5cdFx0Y29uc3QgbWF4TGVmdCA9IE1hdGgubWF4KG1pbkxlZnQsIG1pbkxlZnQgKyBib3VuZHMud2lkdGggLSBpbnB1dFdpZHRoKTtcblx0XHRjb25zdCBsZWZ0ID0gY2xhbXAoc2VsZWN0aW9uUmVjdC5sZWZ0IC0gb3JpZ2luUmVjdC5sZWZ0LCBtaW5MZWZ0LCBtYXhMZWZ0KTtcblxuXHRcdGNvbnN0IG1pblRvcCA9IGJvdW5kcy50b3AgLSBvcmlnaW5SZWN0LnRvcDtcblx0XHRjb25zdCBtYXhUb3AgPSBNYXRoLm1heChtaW5Ub3AsIG1pblRvcCArIGJvdW5kcy5oZWlnaHQgLSBpbnB1dEhlaWdodCk7XG5cdFx0bGV0IHRvcCA9IHNlbGVjdGlvblJlY3QuYm90dG9tIC0gb3JpZ2luUmVjdC50b3AgKyBnYXA7XG5cdFx0aWYgKHRvcCA+IG1heFRvcCkge1xuXHRcdFx0Ly8gTm90IGVub3VnaCByb29tIGJlbG93IHRoZSBzZWxlY3Rpb246IHByZWZlciBwbGFjaW5nIGl0IGFib3ZlIGluc3RlYWQuXG5cdFx0XHRjb25zdCBhYm92ZVRvcCA9IHNlbGVjdGlvblJlY3QudG9wIC0gb3JpZ2luUmVjdC50b3AgLSBpbnB1dEhlaWdodCAtIGdhcDtcblx0XHRcdHRvcCA9IGFib3ZlVG9wID49IG1pblRvcCA/IGFib3ZlVG9wIDogbWF4VG9wO1xuXHRcdH1cblx0XHR0b3AgPSBjbGFtcCh0b3AsIG1pblRvcCwgbWF4VG9wKTtcblxuXHRcdHRoaXMuX2lucHV0LmRvbU5vZGUuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHR0aGlzLl9pbnB1dC5kb21Ob2RlLnN0eWxlLmxlZnQgPSBgJHtsZWZ0fXB4YDtcblx0fVxuXG5cdC8qKlxuXHQgKiBCb3ggdGhlIG92ZXJsYXkgaXMgY29uZmluZWQgdG8sIGluIHZpZXdwb3J0IGNvb3JkaW5hdGVzOiB0aGUgc2Nyb2xsYWJsZVxuXHQgKiB0cmFuc2NyaXB0LCBmdXJ0aGVyIGNsaXBwZWQgdG8gdGhlIHdpbmRvdyBzbyBpdCBjYW4gbmV2ZXIgcmVuZGVyIG91dCBvZlxuXHQgKiBzaWdodCBvbiBhIHNtYWxsIHdpbmRvdy5cblx0ICovXG5cdHByaXZhdGUgX3RyYW5zY3JpcHRCb3VuZHMoKTogeyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyOyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHtcblx0XHRjb25zdCByZWN0ID0gdGhpcy5fd2lkZ2V0LnRyYW5zY3JpcHREb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHZpZXdwb3J0ID0gZG9tLmdldFdpbmRvdyh0aGlzLl93aWRnZXQuZG9tTm9kZSk7XG5cdFx0Y29uc3QgdG9wID0gTWF0aC5tYXgocmVjdC50b3AsIDApO1xuXHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1heChyZWN0LmxlZnQsIDApO1xuXHRcdGNvbnN0IGJvdHRvbSA9IE1hdGgubWluKHJlY3QudG9wICsgcmVjdC5oZWlnaHQsIHZpZXdwb3J0LmlubmVySGVpZ2h0KTtcblx0XHRjb25zdCByaWdodCA9IE1hdGgubWluKHJlY3QubGVmdCArIHJlY3Qud2lkdGgsIHZpZXdwb3J0LmlubmVyV2lkdGgpO1xuXHRcdHJldHVybiB7IHRvcCwgbGVmdCwgd2lkdGg6IE1hdGgubWF4KDAsIHJpZ2h0IC0gbGVmdCksIGhlaWdodDogTWF0aC5tYXgoMCwgYm90dG9tIC0gdG9wKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc21pc3NlcyB0aGUgaW5wdXQuIFdoaWxlIGEgc3VibWlzc2lvbiBpcyBwZW5kaW5nIChgX2lucHV0LmlzQnVzeWApLFxuXHQgKiBvbmx5IGEgZ2VudWluZSB2aWV3IGNoYW5nZSAoYGZvcmNlYCwgZnJvbSB7QGxpbmsgc2V0Q2hhdH0pIG1heSBkaXNtaXNzXG5cdCAqIGl0IFx1MjAxNCBvdXRzaWRlIGludGVyYWN0aW9ucyBsaWtlIEVzY2FwZSBvciBzZWxlY3Rpb24gaW52YWxpZGF0aW9uIG11c3Qgbm90XG5cdCAqIHJhY2UgdGhlIGluLWZsaWdodCBjcmVhdGUvb3Blbi9zZW5kLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGlzbWlzcyhmb3JjZSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCFmb3JjZSAmJiB0aGlzLl9pbnB1dC5pc0J1c3kpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGZvcmNlKSB7XG5cdFx0XHQvLyBBIGdlbnVpbmUgbmF2aWdhdGlvbjogYnVtcCB0aGUgZ2VuZXJhdGlvbiBzbyBhIHN0YWxlIHN1Ym1pc3Npb24ncyBjb21wbGV0aW9uL2Vycm9yIGhhbmRsZXIgbm8tb3BzLlxuXHRcdFx0dGhpcy5fZ2VuZXJhdGlvbisrO1xuXHRcdH1cblx0XHRjb25zdCBoYWRGb2N1cyA9IGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuX2lucHV0LmRvbU5vZGUpO1xuXHRcdHRoaXMuX3Jlc29sdmVkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3BhaW50SGlnaGxpZ2h0KHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fdXBkYXRlQXV0b1Njcm9sbEhvbGQoKTtcblx0XHR0aGlzLl9pbnB1dC5zZXRCdXN5KGZhbHNlKTtcblx0XHR0aGlzLl9pbnB1dC5oaWRlKCk7XG5cdFx0dGhpcy5faW5wdXQuY2xlYXJJbnB1dCgpO1xuXHRcdGlmIChoYWRGb2N1cykge1xuXHRcdFx0Ly8gSGlkaW5nIHRoZSBmb2N1c2VkIGlucHV0IHdvdWxkIG90aGVyd2lzZSBsZWF2ZSBmb2N1cyBzdHJhbmRlZCBvblxuXHRcdFx0Ly8gdGhlIGJvZHk7IHJldHVybiBpdCB0byB0aGUgdHJhbnNjcmlwdCBpdCB3YXMgaW52b2tlZCBmcm9tLlxuXHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzUmVzcG9uc2VJdGVtKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N1Ym1pdCgpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVkO1xuXHRcdGNvbnN0IGNoYXQgPSB0aGlzLl9jaGF0O1xuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5faW5wdXQuaW5wdXRFbGVtZW50LnZhbHVlLnRyaW0oKTtcblx0XHRpZiAoIXJlc29sdmVkIHx8ICFjaGF0IHx8ICFxdWVyeSB8fCB0aGlzLl9pbnB1dC5pc0J1c3kpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb3VuZCA9IHRoaXMuX3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZ2V0U2Vzc2lvbkZvckNoYXRSZXNvdXJjZShjaGF0LnJlc291cmNlKTtcblx0XHRpZiAoIWZvdW5kKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ3Nlc3Npb25zLnNlbGVjdGlvblNpZGVDaGF0LnNlc3Npb25VbmF2YWlsYWJsZScsIFwiQSBzaWRlIGNoYXQgY2Fubm90IGJlIGNyZWF0ZWQgZnJvbSB0aGlzIGNvbnZlcnNhdGlvbi5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IHNlc3Npb24gfSA9IGZvdW5kO1xuXHRcdGlmIChzZXNzaW9uLnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCB8fCBzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCkgfHwgIXNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzU2lkZUNoYXQpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2Fybihsb2NhbGl6ZSgnc2Vzc2lvbnMuc2VsZWN0aW9uU2lkZUNoYXQudW5zdXBwb3J0ZWQnLCBcIlRoaXMgY29udmVyc2F0aW9uIGRvZXMgbm90IHN1cHBvcnQgc2lkZSBjaGF0cy5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgdGhlIG92ZXJsYXkgdmlzaWJsZSB3aXRoIGEgYnVzeSBzdGF0ZSBpbnN0ZWFkIG9mIGVhZ2VybHlcblx0XHQvLyBkaXNtaXNzaW5nOiBvcGVuaW5nIHRoZSBjcmVhdGVkIHNpZGUgY2hhdCBuYXR1cmFsbHkgZGlzbWlzc2VzIGl0IHZpYVxuXHRcdC8vIGBzZXRDaGF0YDsgb24gZmFpbHVyZSB0aGUgcXVlc3Rpb24gYW5kIG5vcm1hbCBjb250cm9scyBhcmUgcmVzdG9yZWRcblx0XHQvLyBiZWxvdyBzbyB0aGUgdXNlciBjYW4gcmV0cnkuXG5cdFx0dGhpcy5faW5wdXQuc2V0QnVzeSh0cnVlLCBsb2NhbGl6ZSgnc2Vzc2lvbnMuc2VsZWN0aW9uU2lkZUNoYXQuYnVzeScsIFwiQXNraW5nIHF1ZXN0aW9uXHUyMDI2XCIpKTtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbjtcblx0XHRjcmVhdGVBbmRTZW5kU2lkZUNoYXQodGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLCBzZXNzaW9uLCBjaGF0LnJlc291cmNlLCByZXNvbHZlZC5yZXNwb25zZS5yZXF1ZXN0SWQsIHF1ZXJ5LCB7IHRleHQ6IHJlc29sdmVkLnRleHQgfSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0Ly8gQSBzdGFsZSBjb21wbGV0aW9uIGFmdGVyIGEgZ2VudWluZSBuYXZpZ2F0aW9uIGZvcmNlLWRpc21pc3NlZCB0aGlzIG92ZXJsYXkgbXVzdCBuby1vcC5cblx0XHRcdFx0aWYgKHRoaXMuX2dlbmVyYXRpb24gIT09IGdlbmVyYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gYHNldENoYXRgIChmaXJlZCBieSB0aGUgdmlldyBjaGFuZ2UgZnJvbSBvcGVuaW5nIHRoZSBzaWRlXG5cdFx0XHRcdC8vIGNoYXQpIG5vcm1hbGx5IGRpc21pc3NlcyB0aGlzIG92ZXJsYXkgYWxyZWFkeTsgY2xlYXIgYnVzeVxuXHRcdFx0XHQvLyBkZWZlbnNpdmVseSBpbiBjYXNlIHRoYXQgZG9lc24ndCBoYXBwZW4uXG5cdFx0XHRcdHRoaXMuX2lucHV0LnNldEJ1c3koZmFsc2UpO1xuXHRcdFx0fSlcblx0XHRcdC5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbc2VsZWN0aW9uU2lkZUNoYXRdIEZhaWxlZCB0byBjcmVhdGUgc2lkZSBjaGF0JywgZXJyKTtcblx0XHRcdFx0aWYgKHRoaXMuX2dlbmVyYXRpb24gIT09IGdlbmVyYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnc2Vzc2lvbnMuc2VsZWN0aW9uU2lkZUNoYXQuY3JlYXRlRmFpbGVkJywgXCJUaGUgc2lkZSBjaGF0IGNvdWxkIG5vdCBiZSBjcmVhdGVkLlwiKSk7XG5cdFx0XHRcdHRoaXMuX2lucHV0LnNldEJ1c3koZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9pbnB1dC5pbnB1dEVsZW1lbnQudmFsdWUgPSBxdWVyeTtcblx0XHRcdFx0dGhpcy5faW5wdXQuYXV0b1NpemUoKTtcblx0XHRcdFx0dGhpcy5faW5wdXQudXBkYXRlQWN0aW9uRW5hYmxlZCgpO1xuXHRcdFx0XHR0aGlzLl9pbnB1dC5pbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLFlBQXlCLG1CQUFtQixvQkFBb0I7QUFDekUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywyQkFBMkIsaUNBQWlDO0FBQ3JFLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQWdCLHFCQUFxQjtBQUNyQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFxQyxnQ0FBZ0M7QUFDckUsU0FBUyw2QkFBNkI7QUFNdEMsTUFBTSx5QkFBeUI7QUFLL0IsMkJBQTJCLENBQUMsT0FBTyxjQUFjO0FBQ2hELFFBQU0sYUFBYSxNQUFNLFNBQVMseUJBQXlCO0FBQzNELE1BQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsRUFDRDtBQUdBLFFBQU0sYUFBYSxNQUFNLFNBQVMseUJBQXlCO0FBQzNELFlBQVUsUUFBUSxlQUFlLHNCQUFzQjtBQUFBLHNCQUNsQyxVQUFVO0FBQUEsSUFDNUIsYUFBYSxVQUFVLFVBQVUsTUFBTSxFQUFFO0FBQUEsR0FDMUM7QUFDSCxDQUFDO0FBT0QsU0FBUyxzQkFBc0IsY0FBaUU7QUFDL0YsUUFBTSxXQUFX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
