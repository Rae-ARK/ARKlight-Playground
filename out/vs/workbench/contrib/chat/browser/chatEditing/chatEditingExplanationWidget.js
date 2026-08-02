import "./media/chatEditingExplanationWidget.css";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Event } from "../../../../../base/common/event.js";
import { EditorOption } from "../../../../../editor/common/config/editorOptions.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { $, addDisposableListener, clearNode, getTotalWidth } from "../../../../../base/browser/dom.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { overviewRulerRangeHighlight } from "../../../../../editor/common/core/editorColorRegistry.js";
import { OverviewRulerLane } from "../../../../../editor/common/model.js";
import { themeColorFromId } from "../../../../../platform/theme/common/themeService.js";
import { ChatViewId } from "../chat.js";
import * as nls from "../../../../../nls.js";
import { autorun } from "../../../../../base/common/observable.js";
function getChangeTexts(change, diffInfo) {
  const originalLines = [];
  const modifiedLines = [];
  for (let i = change.original.startLineNumber; i < change.original.endLineNumberExclusive; i++) {
    const line = diffInfo.originalModel.getLineContent(i);
    originalLines.push(line);
  }
  for (let i = change.modified.startLineNumber; i < change.modified.endLineNumberExclusive; i++) {
    const line = diffInfo.modifiedModel.getLineContent(i);
    modifiedLines.push(line);
  }
  return {
    originalText: originalLines.join("\n"),
    modifiedText: modifiedLines.join("\n")
  };
}
function groupNearbyChanges(changes, lineThreshold = 5) {
  if (changes.length === 0) {
    return [];
  }
  const groups = [];
  let currentGroup = [changes[0]];
  for (let i = 1; i < changes.length; i++) {
    const firstChange = currentGroup[0];
    const currentChange = changes[i];
    const widgetLine = firstChange.modified.startLineNumber;
    const lastLine = currentChange.modified.startLineNumber;
    const verticalSpan = lastLine - widgetLine;
    if (verticalSpan <= lineThreshold) {
      currentGroup.push(currentChange);
    } else {
      groups.push(currentGroup);
      currentGroup = [currentChange];
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }
  return groups;
}
const _ChatEditingExplanationWidget = class _ChatEditingExplanationWidget extends Disposable {
  constructor(_editor, _changes, diffInfo, _chatWidgetService, _viewsService, _chatSessionResource) {
    super();
    this._editor = _editor;
    this._changes = _changes;
    this._chatWidgetService = _chatWidgetService;
    this._viewsService = _viewsService;
    this._chatSessionResource = _chatSessionResource;
    this._id = `chat-explanation-widget-${_ChatEditingExplanationWidget._idPool++}`;
    this._explanationItems = /* @__PURE__ */ new Map();
    this._position = null;
    this._explanations = [];
    this._isExpanded = true;
    this._isAllRead = false;
    this._disposed = false;
    this._startLineNumber = 1;
    this._eventStore = this._register(new DisposableStore());
    this._uri = diffInfo.modifiedModel.uri;
    this._rangeHighlightDecoration = this._editor.createDecorationsCollection();
    this._explanations = this._changes.map((change) => {
      const { originalText, modifiedText } = getChangeTexts(change, diffInfo);
      return {
        startLineNumber: change.modified.startLineNumber,
        endLineNumber: change.modified.endLineNumberExclusive - 1,
        explanation: nls.localize("generatingExplanation", "Generating explanation..."),
        read: false,
        loading: true,
        originalText,
        modifiedText
      };
    });
    this._domNode = $("div.chat-explanation-widget");
    this._headerNode = $("div.chat-explanation-header");
    this._readIndicator = $("div.chat-explanation-read-indicator");
    this._updateReadIndicator();
    this._headerNode.appendChild(this._readIndicator);
    this._titleNode = $("span.chat-explanation-title");
    this._updateTitle();
    this._headerNode.appendChild(this._titleNode);
    this._headerNode.appendChild($("span.chat-explanation-spacer"));
    this._toggleButton = $("div.chat-explanation-toggle");
    this._updateToggleButton();
    this._headerNode.appendChild(this._toggleButton);
    this._dismissButton = $("div.chat-explanation-dismiss");
    this._dismissButton.appendChild(renderIcon(Codicon.close));
    this._dismissButton.title = nls.localize("dismiss", "Dismiss");
    this._headerNode.appendChild(this._dismissButton);
    this._domNode.appendChild(this._headerNode);
    this._bodyNode = $("div.chat-explanation-body");
    this._buildExplanationItems();
    this._domNode.appendChild(this._bodyNode);
    const arrow = $("div.chat-explanation-arrow");
    this._domNode.appendChild(arrow);
    this._setupEventHandlers();
    this._domNode.classList.add("visible");
    this._editor.addOverlayWidget(this);
  }
  _setupEventHandlers() {
    this._eventStore.add(addDisposableListener(this._readIndicator, "click", (e) => {
      e.stopPropagation();
      this._isAllRead = !this._isAllRead;
      for (const exp of this._explanations) {
        exp.read = this._isAllRead;
      }
      this._updateReadIndicator();
      this._updateExplanationItemsReadState();
    }));
    this._eventStore.add(addDisposableListener(this._toggleButton, "click", (e) => {
      e.stopPropagation();
      this._toggleExpanded();
    }));
    this._eventStore.add(addDisposableListener(this._headerNode, "click", () => {
      this._toggleExpanded();
    }));
    this._eventStore.add(addDisposableListener(this._dismissButton, "click", (e) => {
      e.stopPropagation();
      this._dismiss();
    }));
  }
  _toggleExpanded() {
    this._isExpanded = !this._isExpanded;
    this._bodyNode.classList.toggle("collapsed", !this._isExpanded);
    this._updateToggleButton();
    this._editor.layoutOverlayWidget(this);
  }
  _dismiss() {
    this._domNode.classList.add("fadeOut");
    const dispose = () => {
      this.dispose();
    };
    const handle = setTimeout(dispose, 150);
    this._domNode.addEventListener("animationend", () => {
      clearTimeout(handle);
      dispose();
    }, { once: true });
  }
  _updateReadIndicator() {
    clearNode(this._readIndicator);
    const allRead = this._explanations.every((e) => e.read);
    const someRead = this._explanations.some((e) => e.read);
    this._isAllRead = allRead;
    if (allRead) {
      this._readIndicator.appendChild(renderIcon(Codicon.circle));
      this._readIndicator.classList.add("read");
      this._readIndicator.classList.remove("partial", "unread");
      this._readIndicator.title = nls.localize("markAsUnread", "Mark as unread");
    } else if (someRead) {
      this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
      this._readIndicator.classList.remove("read", "unread");
      this._readIndicator.classList.add("partial");
      this._readIndicator.title = nls.localize("markAllAsRead", "Mark all as read");
    } else {
      this._readIndicator.appendChild(renderIcon(Codicon.circleFilled));
      this._readIndicator.classList.remove("read", "partial");
      this._readIndicator.classList.add("unread");
      this._readIndicator.title = nls.localize("markAsRead", "Mark as read");
    }
  }
  _updateTitle() {
    const count = this._explanations.length;
    if (count === 1) {
      this._titleNode.textContent = nls.localize("oneChange", "1 change");
    } else {
      this._titleNode.textContent = nls.localize("nChanges", "{0} changes", count);
    }
  }
  _updateToggleButton() {
    clearNode(this._toggleButton);
    if (this._isExpanded) {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronUp));
      this._toggleButton.title = nls.localize("collapse", "Collapse");
    } else {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronDown));
      this._toggleButton.title = nls.localize("expand", "Expand");
    }
  }
  _buildExplanationItems() {
    clearNode(this._bodyNode);
    this._explanationItems.clear();
    for (let i = 0; i < this._explanations.length; i++) {
      const exp = this._explanations[i];
      const item = $("div.chat-explanation-item");
      const lineInfo = $("span.chat-explanation-line-info");
      if (exp.startLineNumber === exp.endLineNumber) {
        lineInfo.textContent = nls.localize("lineNumber", "Line {0}", exp.startLineNumber);
      } else {
        lineInfo.textContent = nls.localize("lineRange", "Lines {0}-{1}", exp.startLineNumber, exp.endLineNumber);
      }
      item.appendChild(lineInfo);
      const text = $("span.chat-explanation-text");
      if (exp.loading) {
        const loadingIcon = renderIcon(ThemeIcon.modify(Codicon.loading, "spin"));
        loadingIcon.classList.add("chat-explanation-loading");
        text.appendChild(loadingIcon);
        const loadingText = document.createTextNode(" " + exp.explanation);
        text.appendChild(loadingText);
      } else {
        text.textContent = exp.explanation;
      }
      item.appendChild(text);
      const itemReadIndicator = $("div.chat-explanation-item-read");
      this._updateItemReadIndicator(itemReadIndicator, exp.read);
      item.appendChild(itemReadIndicator);
      const replyButton = $("div.chat-explanation-reply-button");
      replyButton.appendChild(renderIcon(Codicon.arrowRight));
      replyButton.title = nls.localize("followUpOnChange", "Follow up on this change");
      item.appendChild(replyButton);
      this._eventStore.add(addDisposableListener(replyButton, "click", async (e) => {
        e.stopPropagation();
        const range = new Range(exp.startLineNumber, 1, exp.endLineNumber, 1);
        let chatWidget;
        if (this._chatSessionResource) {
          chatWidget = await this._chatWidgetService.openSession(this._chatSessionResource);
        } else {
          await this._viewsService.openView(ChatViewId, true);
          chatWidget = this._chatWidgetService.lastFocusedWidget;
        }
        if (chatWidget) {
          chatWidget.attachmentModel.addContext(
            chatWidget.attachmentModel.asFileVariableEntry(this._uri, range)
          );
        }
      }));
      this._eventStore.add(addDisposableListener(item, "click", (e) => {
        e.stopPropagation();
        exp.read = !exp.read;
        this._updateItemReadIndicator(itemReadIndicator, exp.read);
        this._updateReadIndicator();
      }));
      this._eventStore.add(addDisposableListener(item, "mouseenter", () => {
        const range = new Range(exp.startLineNumber, 1, exp.endLineNumber, this._editor.getModel()?.getLineMaxColumn(exp.endLineNumber) ?? 1);
        this._rangeHighlightDecoration.set([
          // Line highlight with gutter decoration
          {
            range,
            options: {
              description: "chat-explanation-range-highlight",
              className: "rangeHighlight",
              isWholeLine: true,
              linesDecorationsClassName: "chat-explanation-range-glyph"
            }
          },
          // Overview ruler indicator
          {
            range,
            options: {
              description: "chat-explanation-range-highlight-overview",
              overviewRuler: {
                color: themeColorFromId(overviewRulerRangeHighlight),
                position: OverviewRulerLane.Full
              }
            }
          }
        ]);
      }));
      this._eventStore.add(addDisposableListener(item, "mouseleave", () => {
        this._rangeHighlightDecoration.clear();
      }));
      this._explanationItems.set(i, { item, readIndicator: itemReadIndicator, textElement: text });
      this._bodyNode.appendChild(item);
    }
  }
  /**
   * Sets the explanation for a change matching the given line number range.
   * @returns true if a matching explanation was found and updated
   */
  setExplanationByLineNumber(startLineNumber, endLineNumber, explanation) {
    for (let i = 0; i < this._explanations.length; i++) {
      const exp = this._explanations[i];
      if (exp.startLineNumber === startLineNumber && exp.endLineNumber === endLineNumber) {
        exp.explanation = explanation;
        exp.loading = false;
        this._updateExplanationText(i);
        return true;
      }
    }
    return false;
  }
  /**
   * Gets the number of explanations in this widget.
   */
  get explanationCount() {
    return this._explanations.length;
  }
  _updateExplanationText(index) {
    const itemData = this._explanationItems.get(index);
    const exp = this._explanations[index];
    if (itemData && exp) {
      clearNode(itemData.textElement);
      itemData.textElement.textContent = exp.explanation;
    }
  }
  _updateItemReadIndicator(element, read) {
    clearNode(element);
    if (read) {
      element.appendChild(renderIcon(Codicon.circle));
      element.classList.add("read");
      element.classList.remove("unread");
    } else {
      element.appendChild(renderIcon(Codicon.circleFilled));
      element.classList.remove("read");
      element.classList.add("unread");
    }
  }
  _updateExplanationItemsReadState() {
    this._explanationItems.forEach(({ readIndicator }, index) => {
      const exp = this._explanations[index];
      this._updateItemReadIndicator(readIndicator, exp.read);
    });
  }
  /**
   * Updates the widget position and layout
   */
  layout(startLineNumber) {
    if (this._disposed) {
      return;
    }
    this._startLineNumber = startLineNumber;
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
    const scrollTop = this._editor.getScrollTop();
    const widgetWidth = getTotalWidth(this._domNode) || 280;
    this._position = {
      stackOrdinal: 2,
      preference: {
        top: this._editor.getTopForLineNumber(startLineNumber) - scrollTop - lineHeight,
        left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + widgetWidth)
      }
    };
    this._editor.layoutOverlayWidget(this);
  }
  /**
   * Shows or hides the widget
   */
  toggle(show) {
    this._domNode.classList.toggle("visible", show);
    if (show && this._explanations.length > 0) {
      this.layout(this._explanations[0].startLineNumber);
    }
  }
  /**
   * Relayouts the widget at its current line number
   */
  relayout() {
    if (this._startLineNumber) {
      this.layout(this._startLineNumber);
    }
  }
  // IOverlayWidget implementation
  getId() {
    return this._id;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return this._position;
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._rangeHighlightDecoration.clear();
    this._editor.removeOverlayWidget(this);
    super.dispose();
  }
};
_ChatEditingExplanationWidget._idPool = 0;
let ChatEditingExplanationWidget = _ChatEditingExplanationWidget;
class ChatEditingExplanationWidgetManager extends Disposable {
  constructor(_editor, _chatWidgetService, _viewsService, modelManager, _modelUri) {
    super();
    this._editor = _editor;
    this._chatWidgetService = _chatWidgetService;
    this._viewsService = _viewsService;
    this._modelUri = _modelUri;
    this._widgets = [];
    this._visible = false;
    this._register(this._editor.onDidChangeModel(() => {
      const newUri = this._editor.getModel()?.uri;
      if (this._modelUri) {
        if (newUri && newUri.toString() === this._modelUri.toString()) {
          for (const widget of this._widgets) {
            widget.toggle(this._visible);
            widget.relayout();
          }
        } else {
          for (const widget of this._widgets) {
            widget.toggle(false);
          }
        }
      }
    }));
    this._register(autorun((r) => {
      const state = modelManager.state.read(r);
      const uriState = state.get(this._modelUri);
      if (uriState) {
        this._diffInfo = uriState.diffInfo;
        this._chatSessionResource = uriState.chatSessionResource;
        if (this._widgets.length === 0 && this._diffInfo) {
          this._createWidgets(this._diffInfo, this._chatSessionResource);
        }
        if (uriState.progress === "complete") {
          this._handleExplanations(this._modelUri, uriState.explanations);
        }
        this.show();
      } else {
        this.hide();
      }
    }));
  }
  _createWidgets(diffInfo, chatSessionResource) {
    if (diffInfo.identical || diffInfo.changes.length === 0) {
      return;
    }
    const groups = groupNearbyChanges(diffInfo.changes, 5);
    for (const group of groups) {
      const widget = new ChatEditingExplanationWidget(
        this._editor,
        group,
        diffInfo,
        this._chatWidgetService,
        this._viewsService,
        chatSessionResource
      );
      this._widgets.push(widget);
      this._register(widget);
      widget.layout(group[0].modified.startLineNumber);
    }
    this._register(Event.any(this._editor.onDidScrollChange, this._editor.onDidLayoutChange)(() => {
      for (const widget of this._widgets) {
        widget.relayout();
      }
    }));
  }
  _handleExplanations(uri, explanations) {
    if (!this._modelUri || uri.toString() !== this._modelUri.toString()) {
      return;
    }
    for (const explanation of explanations) {
      for (const widget of this._widgets) {
        if (widget.setExplanationByLineNumber(
          explanation.startLineNumber,
          explanation.endLineNumber,
          explanation.explanation
        )) {
          break;
        }
      }
    }
  }
  /**
   * Shows all widgets
   */
  show() {
    this._visible = true;
    for (const widget of this._widgets) {
      widget.toggle(true);
      widget.relayout();
    }
  }
  /**
   * Hides all widgets
   */
  hide() {
    this._visible = false;
    for (const widget of this._widgets) {
      widget.toggle(false);
    }
  }
  _clearWidgets() {
    for (const widget of this._widgets) {
      widget.dispose();
    }
    this._widgets.length = 0;
  }
  dispose() {
    this._clearWidgets();
    super.dispose();
  }
}
export {
  ChatEditingExplanationWidget,
  ChatEditingExplanationWidgetManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ0V4cGxhbmF0aW9uV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXQuY3NzJztcblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsIExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBjbGVhck5vZGUsIGdldFRvdGFsV2lkdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgb3ZlcnZpZXdSdWxlclJhbmdlSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0lkLCBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFeHBsYW5hdGlvbkRpZmZJbmZvLCBJQ2hhbmdlRXhwbGFuYXRpb24gYXMgSUNoYW5nZUV4cGxhbmF0aW9uTW9kZWwsIElDaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ0V4cGxhbmF0aW9uTW9kZWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuLyoqXG4gKiBFeHBsYW5hdGlvbiBkYXRhIGZvciBhIHNpbmdsZSBjaGFuZ2UgaHVua1xuICovXG5pbnRlcmZhY2UgSUNoYW5nZUV4cGxhbmF0aW9uIHtcblx0cmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0ZXhwbGFuYXRpb246IHN0cmluZztcblx0cmVhZDogYm9vbGVhbjtcblx0bG9hZGluZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3JpZ2luYWxUZXh0OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGlmaWVkVGV4dDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdldHMgdGhlIHRleHQgY29udGVudCBmb3IgYSBjaGFuZ2VcbiAqL1xuZnVuY3Rpb24gZ2V0Q2hhbmdlVGV4dHMoY2hhbmdlOiBMaW5lUmFuZ2VNYXBwaW5nIHwgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLCBkaWZmSW5mbzogSUV4cGxhbmF0aW9uRGlmZkluZm8pOiB7IG9yaWdpbmFsVGV4dDogc3RyaW5nOyBtb2RpZmllZFRleHQ6IHN0cmluZyB9IHtcblx0Y29uc3Qgb3JpZ2luYWxMaW5lczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgbW9kaWZpZWRMaW5lczogc3RyaW5nW10gPSBbXTtcblxuXHQvLyBHZXQgb3JpZ2luYWwgdGV4dFxuXHRmb3IgKGxldCBpID0gY2hhbmdlLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlcjsgaSA8IGNoYW5nZS5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gZGlmZkluZm8ub3JpZ2luYWxNb2RlbC5nZXRMaW5lQ29udGVudChpKTtcblx0XHRvcmlnaW5hbExpbmVzLnB1c2gobGluZSk7XG5cdH1cblxuXHQvLyBHZXQgbW9kaWZpZWQgdGV4dFxuXHRmb3IgKGxldCBpID0gY2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjsgaSA8IGNoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gZGlmZkluZm8ubW9kaWZpZWRNb2RlbC5nZXRMaW5lQ29udGVudChpKTtcblx0XHRtb2RpZmllZExpbmVzLnB1c2gobGluZSk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdG9yaWdpbmFsVGV4dDogb3JpZ2luYWxMaW5lcy5qb2luKCdcXG4nKSxcblx0XHRtb2RpZmllZFRleHQ6IG1vZGlmaWVkTGluZXMuam9pbignXFxuJylcblx0fTtcbn1cblxuLyoqXG4gKiBHcm91cHMgbmVhcmJ5IGNoYW5nZXMgd2l0aGluIGEgdGhyZXNob2xkIG51bWJlciBvZiBsaW5lc1xuICogVXNlcyB0aGUgdmVydGljYWwgc3BhbiBmcm9tIHdpZGdldCBwb3NpdGlvbiB0byBsYXN0IGxpbmUgaXQgcmVmZXJzIHRvXG4gKi9cbmZ1bmN0aW9uIGdyb3VwTmVhcmJ5Q2hhbmdlczxUIGV4dGVuZHMgTGluZVJhbmdlTWFwcGluZz4oY2hhbmdlczogcmVhZG9ubHkgVFtdLCBsaW5lVGhyZXNob2xkOiBudW1iZXIgPSA1KTogVFtdW10ge1xuXHRpZiAoY2hhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBncm91cHM6IFRbXVtdID0gW107XG5cdGxldCBjdXJyZW50R3JvdXA6IFRbXSA9IFtjaGFuZ2VzWzBdXTtcblxuXHRmb3IgKGxldCBpID0gMTsgaSA8IGNoYW5nZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBmaXJzdENoYW5nZSA9IGN1cnJlbnRHcm91cFswXTtcblx0XHRjb25zdCBjdXJyZW50Q2hhbmdlID0gY2hhbmdlc1tpXTtcblxuXHRcdC8vIENhbGN1bGF0ZSB2ZXJ0aWNhbCBzcGFuIGZyb20gd2lkZ2V0IHBvc2l0aW9uIChmaXJzdCBjaGFuZ2UpIHRvIHN0YXJ0IG9mIGN1cnJlbnQgY2hhbmdlXG5cdFx0Y29uc3Qgd2lkZ2V0TGluZSA9IGZpcnN0Q2hhbmdlLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBsYXN0TGluZSA9IGN1cnJlbnRDaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHZlcnRpY2FsU3BhbiA9IGxhc3RMaW5lIC0gd2lkZ2V0TGluZTtcblxuXHRcdGlmICh2ZXJ0aWNhbFNwYW4gPD0gbGluZVRocmVzaG9sZCkge1xuXHRcdFx0Y3VycmVudEdyb3VwLnB1c2goY3VycmVudENoYW5nZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdyb3Vwcy5wdXNoKGN1cnJlbnRHcm91cCk7XG5cdFx0XHRjdXJyZW50R3JvdXAgPSBbY3VycmVudENoYW5nZV07XG5cdFx0fVxuXHR9XG5cblx0aWYgKGN1cnJlbnRHcm91cC5sZW5ndGggPiAwKSB7XG5cdFx0Z3JvdXBzLnB1c2goY3VycmVudEdyb3VwKTtcblx0fVxuXG5cdHJldHVybiBncm91cHM7XG59XG5cbi8qKlxuICogV2lkZ2V0IHRoYXQgZGlzcGxheXMgZXhwbGFuYXRvcnkgY29tbWVudHMgZm9yIGNoYXQtbWFkZSBjaGFuZ2VzXG4gKiBQb3NpdGlvbmVkIG9uIHRoZSByaWdodCBzaWRlIG9mIHRoZSBlZGl0b3IgbGlrZSBhIHNwZWVjaCBidWJibGVcbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9pZFBvb2wgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pZDogc3RyaW5nID0gYGNoYXQtZXhwbGFuYXRpb24td2lkZ2V0LSR7Q2hhdEVkaXRpbmdFeHBsYW5hdGlvbldpZGdldC5faWRQb29sKyt9YDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGVhZGVyTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWRJbmRpY2F0b3I6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNtaXNzQnV0dG9uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9nZ2xlQnV0dG9uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYm9keU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBsYW5hdGlvbkl0ZW1zOiBNYXA8bnVtYmVyLCB7IGl0ZW06IEhUTUxFbGVtZW50OyByZWFkSW5kaWNhdG9yOiBIVE1MRWxlbWVudDsgdGV4dEVsZW1lbnQ6IEhUTUxFbGVtZW50IH0+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgX3Bvc2l0aW9uOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2V4cGxhbmF0aW9uczogSUNoYW5nZUV4cGxhbmF0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBfaXNFeHBhbmRlZDogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX2lzQWxsUmVhZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdGFydExpbmVOdW1iZXI6IG51bWJlciA9IDE7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VyaTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yYW5nZUhpZ2hsaWdodERlY29yYXRpb246IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXZlbnRTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIF9jaGFuZ2VzOiByZWFkb25seSAoTGluZVJhbmdlTWFwcGluZyB8IERldGFpbGVkTGluZVJhbmdlTWFwcGluZylbXSxcblx0XHRkaWZmSW5mbzogSUV4cGxhbmF0aW9uRGlmZkluZm8sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25SZXNvdXJjZT86IFVSSSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3VyaSA9IGRpZmZJbmZvLm1vZGlmaWVkTW9kZWwudXJpO1xuXG5cdFx0Ly8gQ3JlYXRlIGRlY29yYXRpb24gY29sbGVjdGlvbiBmb3IgcmFuZ2UgaGlnaGxpZ2h0aW5nIG9uIGhvdmVyXG5cdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXG5cdFx0Ly8gQnVpbGQgZXhwbGFuYXRpb25zIGZyb20gY2hhbmdlcyB3aXRoIGxvYWRpbmcgc3RhdGVcblx0XHR0aGlzLl9leHBsYW5hdGlvbnMgPSB0aGlzLl9jaGFuZ2VzLm1hcChjaGFuZ2UgPT4ge1xuXHRcdFx0Y29uc3QgeyBvcmlnaW5hbFRleHQsIG1vZGlmaWVkVGV4dCB9ID0gZ2V0Q2hhbmdlVGV4dHMoY2hhbmdlLCBkaWZmSW5mbyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGNoYW5nZS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGNoYW5nZS5tb2RpZmllZC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSxcblx0XHRcdFx0ZXhwbGFuYXRpb246IG5scy5sb2NhbGl6ZSgnZ2VuZXJhdGluZ0V4cGxhbmF0aW9uJywgXCJHZW5lcmF0aW5nIGV4cGxhbmF0aW9uLi4uXCIpLFxuXHRcdFx0XHRyZWFkOiBmYWxzZSxcblx0XHRcdFx0bG9hZGluZzogdHJ1ZSxcblx0XHRcdFx0b3JpZ2luYWxUZXh0LFxuXHRcdFx0XHRtb2RpZmllZFRleHQsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIERPTSBzdHJ1Y3R1cmVcblx0XHR0aGlzLl9kb21Ob2RlID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24td2lkZ2V0Jyk7XG5cblx0XHQvLyBIZWFkZXJcblx0XHR0aGlzLl9oZWFkZXJOb2RlID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24taGVhZGVyJyk7XG5cblx0XHQvLyBSZWFkIGluZGljYXRvciAoY2hlY2tib3gtbGlrZSlcblx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24tcmVhZC1pbmRpY2F0b3InKTtcblx0XHR0aGlzLl91cGRhdGVSZWFkSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9yZWFkSW5kaWNhdG9yKTtcblxuXHRcdC8vIFRpdGxlIHNob3dpbmcgY2hhbmdlIGNvdW50XG5cdFx0dGhpcy5fdGl0bGVOb2RlID0gJCgnc3Bhbi5jaGF0LWV4cGxhbmF0aW9uLXRpdGxlJyk7XG5cdFx0dGhpcy5fdXBkYXRlVGl0bGUoKTtcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKHRoaXMuX3RpdGxlTm9kZSk7XG5cblx0XHQvLyBTcGFjZXJcblx0XHR0aGlzLl9oZWFkZXJOb2RlLmFwcGVuZENoaWxkKCQoJ3NwYW4uY2hhdC1leHBsYW5hdGlvbi1zcGFjZXInKSk7XG5cblx0XHQvLyBUb2dnbGUgZXhwYW5kL2NvbGxhcHNlIGJ1dHRvblxuXHRcdHRoaXMuX3RvZ2dsZUJ1dHRvbiA9ICQoJ2Rpdi5jaGF0LWV4cGxhbmF0aW9uLXRvZ2dsZScpO1xuXHRcdHRoaXMuX3VwZGF0ZVRvZ2dsZUJ1dHRvbigpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdG9nZ2xlQnV0dG9uKTtcblxuXHRcdC8vIERpc21pc3MgYnV0dG9uXG5cdFx0dGhpcy5fZGlzbWlzc0J1dHRvbiA9ICQoJ2Rpdi5jaGF0LWV4cGxhbmF0aW9uLWRpc21pc3MnKTtcblx0XHR0aGlzLl9kaXNtaXNzQnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jbG9zZSkpO1xuXHRcdHRoaXMuX2Rpc21pc3NCdXR0b24udGl0bGUgPSBubHMubG9jYWxpemUoJ2Rpc21pc3MnLCBcIkRpc21pc3NcIik7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9kaXNtaXNzQnV0dG9uKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faGVhZGVyTm9kZSk7XG5cblx0XHQvLyBCb2R5IChjb2xsYXBzaWJsZSlcblx0XHR0aGlzLl9ib2R5Tm9kZSA9ICQoJ2Rpdi5jaGF0LWV4cGxhbmF0aW9uLWJvZHknKTtcblx0XHQvLyBCb2R5IHN0YXJ0cyBleHBhbmRlZCBieSBkZWZhdWx0XG5cdFx0dGhpcy5fYnVpbGRFeHBsYW5hdGlvbkl0ZW1zKCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9ib2R5Tm9kZSk7XG5cblx0XHQvLyBBcnJvdyBwb2ludGVyXG5cdFx0Y29uc3QgYXJyb3cgPSAkKCdkaXYuY2hhdC1leHBsYW5hdGlvbi1hcnJvdycpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQoYXJyb3cpO1xuXG5cdFx0Ly8gRXZlbnQgaGFuZGxlcnNcblx0XHR0aGlzLl9zZXR1cEV2ZW50SGFuZGxlcnMoKTtcblxuXHRcdC8vIEFkZCB2aXNpYmxlIGNsYXNzIGZvciBpbml0aWFsIGRpc3BsYXlcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblxuXHRcdC8vIEFkZCB0byBlZGl0b3Jcblx0XHR0aGlzLl9lZGl0b3IuYWRkT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwRXZlbnRIYW5kbGVycygpOiB2b2lkIHtcblx0XHQvLyBSZWFkIGluZGljYXRvciBjbGljayAtIHRvZ2dsZSBhbGwgcmVhZC91bnJlYWRcblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fcmVhZEluZGljYXRvciwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9pc0FsbFJlYWQgPSAhdGhpcy5faXNBbGxSZWFkO1xuXHRcdFx0Zm9yIChjb25zdCBleHAgb2YgdGhpcy5fZXhwbGFuYXRpb25zKSB7XG5cdFx0XHRcdGV4cC5yZWFkID0gdGhpcy5faXNBbGxSZWFkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlUmVhZEluZGljYXRvcigpO1xuXHRcdFx0dGhpcy5fdXBkYXRlRXhwbGFuYXRpb25JdGVtc1JlYWRTdGF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRvZ2dsZSBidXR0b24gY2xpY2sgLSBleHBhbmQvY29sbGFwc2Vcblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdG9nZ2xlQnV0dG9uLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX3RvZ2dsZUV4cGFuZGVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGVhZGVyIGNsaWNrIC0gYWxzbyB0b2dnbGVzIGV4cGFuZC9jb2xsYXBzZVxuXHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9oZWFkZXJOb2RlLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl90b2dnbGVFeHBhbmRlZCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERpc21pc3MgYnV0dG9uIGNsaWNrXG5cdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2Rpc21pc3NCdXR0b24sICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fZGlzbWlzcygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvZ2dsZUV4cGFuZGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRXhwYW5kZWQgPSAhdGhpcy5faXNFeHBhbmRlZDtcblx0XHR0aGlzLl9ib2R5Tm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCAhdGhpcy5faXNFeHBhbmRlZCk7XG5cdFx0dGhpcy5fdXBkYXRlVG9nZ2xlQnV0dG9uKCk7XG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNtaXNzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCgnZmFkZU91dCcpO1xuXG5cdFx0Y29uc3QgZGlzcG9zZSA9ICgpID0+IHtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH07XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGFuaW1hdGlvbiBlbmRcblx0XHRjb25zdCBoYW5kbGUgPSBzZXRUaW1lb3V0KGRpc3Bvc2UsIDE1MCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25lbmQnLCAoKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoaGFuZGxlKTtcblx0XHRcdGRpc3Bvc2UoKTtcblx0XHR9LCB7IG9uY2U6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVSZWFkSW5kaWNhdG9yKCk6IHZvaWQge1xuXHRcdGNsZWFyTm9kZSh0aGlzLl9yZWFkSW5kaWNhdG9yKTtcblx0XHRjb25zdCBhbGxSZWFkID0gdGhpcy5fZXhwbGFuYXRpb25zLmV2ZXJ5KGUgPT4gZS5yZWFkKTtcblx0XHRjb25zdCBzb21lUmVhZCA9IHRoaXMuX2V4cGxhbmF0aW9ucy5zb21lKGUgPT4gZS5yZWFkKTtcblx0XHR0aGlzLl9pc0FsbFJlYWQgPSBhbGxSZWFkO1xuXG5cdFx0aWYgKGFsbFJlYWQpIHtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNpcmNsZSkpO1xuXHRcdFx0dGhpcy5fcmVhZEluZGljYXRvci5jbGFzc0xpc3QuYWRkKCdyZWFkJyk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLmNsYXNzTGlzdC5yZW1vdmUoJ3BhcnRpYWwnLCAndW5yZWFkJyk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLnRpdGxlID0gbmxzLmxvY2FsaXplKCdtYXJrQXNVbnJlYWQnLCBcIk1hcmsgYXMgdW5yZWFkXCIpO1xuXHRcdH0gZWxzZSBpZiAoc29tZVJlYWQpIHtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNpcmNsZUZpbGxlZCkpO1xuXHRcdFx0dGhpcy5fcmVhZEluZGljYXRvci5jbGFzc0xpc3QucmVtb3ZlKCdyZWFkJywgJ3VucmVhZCcpO1xuXHRcdFx0dGhpcy5fcmVhZEluZGljYXRvci5jbGFzc0xpc3QuYWRkKCdwYXJ0aWFsJyk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLnRpdGxlID0gbmxzLmxvY2FsaXplKCdtYXJrQWxsQXNSZWFkJywgXCJNYXJrIGFsbCBhcyByZWFkXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGVGaWxsZWQpKTtcblx0XHRcdHRoaXMuX3JlYWRJbmRpY2F0b3IuY2xhc3NMaXN0LnJlbW92ZSgncmVhZCcsICdwYXJ0aWFsJyk7XG5cdFx0XHR0aGlzLl9yZWFkSW5kaWNhdG9yLmNsYXNzTGlzdC5hZGQoJ3VucmVhZCcpO1xuXHRcdFx0dGhpcy5fcmVhZEluZGljYXRvci50aXRsZSA9IG5scy5sb2NhbGl6ZSgnbWFya0FzUmVhZCcsIFwiTWFyayBhcyByZWFkXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRpdGxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvdW50ID0gdGhpcy5fZXhwbGFuYXRpb25zLmxlbmd0aDtcblx0XHRpZiAoY291bnQgPT09IDEpIHtcblx0XHRcdHRoaXMuX3RpdGxlTm9kZS50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnb25lQ2hhbmdlJywgXCIxIGNoYW5nZVwiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdGl0bGVOb2RlLnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCduQ2hhbmdlcycsIFwiezB9IGNoYW5nZXNcIiwgY291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRvZ2dsZUJ1dHRvbigpOiB2b2lkIHtcblx0XHRjbGVhck5vZGUodGhpcy5fdG9nZ2xlQnV0dG9uKTtcblx0XHRpZiAodGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5fdG9nZ2xlQnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uVXApKTtcblx0XHRcdHRoaXMuX3RvZ2dsZUJ1dHRvbi50aXRsZSA9IG5scy5sb2NhbGl6ZSgnY29sbGFwc2UnLCBcIkNvbGxhcHNlXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90b2dnbGVCdXR0b24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cdFx0XHR0aGlzLl90b2dnbGVCdXR0b24udGl0bGUgPSBubHMubG9jYWxpemUoJ2V4cGFuZCcsIFwiRXhwYW5kXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkRXhwbGFuYXRpb25JdGVtcygpOiB2b2lkIHtcblx0XHRjbGVhck5vZGUodGhpcy5fYm9keU5vZGUpO1xuXHRcdHRoaXMuX2V4cGxhbmF0aW9uSXRlbXMuY2xlYXIoKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZXhwbGFuYXRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBleHAgPSB0aGlzLl9leHBsYW5hdGlvbnNbaV07XG5cdFx0XHRjb25zdCBpdGVtID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24taXRlbScpO1xuXG5cdFx0XHQvLyBMaW5lIGluZGljYXRvclxuXHRcdFx0Y29uc3QgbGluZUluZm8gPSAkKCdzcGFuLmNoYXQtZXhwbGFuYXRpb24tbGluZS1pbmZvJyk7XG5cdFx0XHRpZiAoZXhwLnN0YXJ0TGluZU51bWJlciA9PT0gZXhwLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0bGluZUluZm8udGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ2xpbmVOdW1iZXInLCBcIkxpbmUgezB9XCIsIGV4cC5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGluZUluZm8udGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ2xpbmVSYW5nZScsIFwiTGluZXMgezB9LXsxfVwiLCBleHAuc3RhcnRMaW5lTnVtYmVyLCBleHAuZW5kTGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0XHRpdGVtLmFwcGVuZENoaWxkKGxpbmVJbmZvKTtcblxuXHRcdFx0Ly8gRXhwbGFuYXRpb24gdGV4dCB3aXRoIGxvYWRpbmcgaW5kaWNhdG9yXG5cdFx0XHRjb25zdCB0ZXh0ID0gJCgnc3Bhbi5jaGF0LWV4cGxhbmF0aW9uLXRleHQnKTtcblx0XHRcdGlmIChleHAubG9hZGluZykge1xuXHRcdFx0XHRjb25zdCBsb2FkaW5nSWNvbiA9IHJlbmRlckljb24oVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmcsICdzcGluJykpO1xuXHRcdFx0XHRsb2FkaW5nSWNvbi5jbGFzc0xpc3QuYWRkKCdjaGF0LWV4cGxhbmF0aW9uLWxvYWRpbmcnKTtcblx0XHRcdFx0dGV4dC5hcHBlbmRDaGlsZChsb2FkaW5nSWNvbik7XG5cdFx0XHRcdGNvbnN0IGxvYWRpbmdUZXh0ID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyAnICsgZXhwLmV4cGxhbmF0aW9uKTtcblx0XHRcdFx0dGV4dC5hcHBlbmRDaGlsZChsb2FkaW5nVGV4dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZXh0LnRleHRDb250ZW50ID0gZXhwLmV4cGxhbmF0aW9uO1xuXHRcdFx0fVxuXHRcdFx0aXRlbS5hcHBlbmRDaGlsZCh0ZXh0KTtcblxuXHRcdFx0Ly8gSXRlbSByZWFkIGluZGljYXRvclxuXHRcdFx0Y29uc3QgaXRlbVJlYWRJbmRpY2F0b3IgPSAkKCdkaXYuY2hhdC1leHBsYW5hdGlvbi1pdGVtLXJlYWQnKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUl0ZW1SZWFkSW5kaWNhdG9yKGl0ZW1SZWFkSW5kaWNhdG9yLCBleHAucmVhZCk7XG5cdFx0XHRpdGVtLmFwcGVuZENoaWxkKGl0ZW1SZWFkSW5kaWNhdG9yKTtcblxuXHRcdFx0Ly8gUmVwbHkgYnV0dG9uIHRvIGFkZCBjb250ZXh0IHRvIGNoYXRcblx0XHRcdGNvbnN0IHJlcGx5QnV0dG9uID0gJCgnZGl2LmNoYXQtZXhwbGFuYXRpb24tcmVwbHktYnV0dG9uJyk7XG5cdFx0XHRyZXBseUJ1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uYXJyb3dSaWdodCkpO1xuXHRcdFx0cmVwbHlCdXR0b24udGl0bGUgPSBubHMubG9jYWxpemUoJ2ZvbGxvd1VwT25DaGFuZ2UnLCBcIkZvbGxvdyB1cCBvbiB0aGlzIGNoYW5nZVwiKTtcblx0XHRcdGl0ZW0uYXBwZW5kQ2hpbGQocmVwbHlCdXR0b24pO1xuXG5cdFx0XHQvLyBSZXBseSBidXR0b24gY2xpY2sgaGFuZGxlclxuXHRcdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJlcGx5QnV0dG9uLCAnY2xpY2snLCBhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShleHAuc3RhcnRMaW5lTnVtYmVyLCAxLCBleHAuZW5kTGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGxldCBjaGF0V2lkZ2V0OiBJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRoaXMuX2NoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRjaGF0V2lkZ2V0ID0gYXdhaXQgdGhpcy5fY2hhdFdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24odGhpcy5fY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3KENoYXRWaWV3SWQsIHRydWUpO1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2hhdFdpZGdldCkge1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoXG5cdFx0XHRcdFx0XHRjaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hc0ZpbGVWYXJpYWJsZUVudHJ5KHRoaXMuX3VyaSwgcmFuZ2UpXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBDbGljayBvbiBpdGVtIHRvIG1hcmsgYXMgcmVhZFxuXHRcdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGl0ZW0sICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGV4cC5yZWFkID0gIWV4cC5yZWFkO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVJdGVtUmVhZEluZGljYXRvcihpdGVtUmVhZEluZGljYXRvciwgZXhwLnJlYWQpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVSZWFkSW5kaWNhdG9yKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEhvdmVyIGhhbmRsZXJzIGZvciByYW5nZSBoaWdobGlnaHRpbmdcblx0XHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpdGVtLCAnbW91c2VlbnRlcicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoZXhwLnN0YXJ0TGluZU51bWJlciwgMSwgZXhwLmVuZExpbmVOdW1iZXIsIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lTWF4Q29sdW1uKGV4cC5lbmRMaW5lTnVtYmVyKSA/PyAxKTtcblx0XHRcdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uLnNldChbXG5cdFx0XHRcdFx0Ly8gTGluZSBoaWdobGlnaHQgd2l0aCBndXR0ZXIgZGVjb3JhdGlvblxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NoYXQtZXhwbGFuYXRpb24tcmFuZ2UtaGlnaGxpZ2h0Jyxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiAncmFuZ2VIaWdobGlnaHQnLFxuXHRcdFx0XHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0bGluZXNEZWNvcmF0aW9uc0NsYXNzTmFtZTogJ2NoYXQtZXhwbGFuYXRpb24tcmFuZ2UtZ2x5cGgnLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ly8gT3ZlcnZpZXcgcnVsZXIgaW5kaWNhdG9yXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhdC1leHBsYW5hdGlvbi1yYW5nZS1oaWdobGlnaHQtb3ZlcnZpZXcnLFxuXHRcdFx0XHRcdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQob3ZlcnZpZXdSdWxlclJhbmdlSGlnaGxpZ2h0KSxcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuRnVsbCxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpdGVtLCAnbW91c2VsZWF2ZScsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uLmNsZWFyKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2V4cGxhbmF0aW9uSXRlbXMuc2V0KGksIHsgaXRlbSwgcmVhZEluZGljYXRvcjogaXRlbVJlYWRJbmRpY2F0b3IsIHRleHRFbGVtZW50OiB0ZXh0IH0pO1xuXHRcdFx0dGhpcy5fYm9keU5vZGUuYXBwZW5kQ2hpbGQoaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGV4cGxhbmF0aW9uIGZvciBhIGNoYW5nZSBtYXRjaGluZyB0aGUgZ2l2ZW4gbGluZSBudW1iZXIgcmFuZ2UuXG5cdCAqIEByZXR1cm5zIHRydWUgaWYgYSBtYXRjaGluZyBleHBsYW5hdGlvbiB3YXMgZm91bmQgYW5kIHVwZGF0ZWRcblx0ICovXG5cdHNldEV4cGxhbmF0aW9uQnlMaW5lTnVtYmVyKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGV4cGxhbmF0aW9uOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2V4cGxhbmF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZXhwID0gdGhpcy5fZXhwbGFuYXRpb25zW2ldO1xuXHRcdFx0aWYgKGV4cC5zdGFydExpbmVOdW1iZXIgPT09IHN0YXJ0TGluZU51bWJlciAmJiBleHAuZW5kTGluZU51bWJlciA9PT0gZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRleHAuZXhwbGFuYXRpb24gPSBleHBsYW5hdGlvbjtcblx0XHRcdFx0ZXhwLmxvYWRpbmcgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRXhwbGFuYXRpb25UZXh0KGkpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIG51bWJlciBvZiBleHBsYW5hdGlvbnMgaW4gdGhpcyB3aWRnZXQuXG5cdCAqL1xuXHRnZXQgZXhwbGFuYXRpb25Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9leHBsYW5hdGlvbnMubGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRXhwbGFuYXRpb25UZXh0KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtRGF0YSA9IHRoaXMuX2V4cGxhbmF0aW9uSXRlbXMuZ2V0KGluZGV4KTtcblx0XHRjb25zdCBleHAgPSB0aGlzLl9leHBsYW5hdGlvbnNbaW5kZXhdO1xuXHRcdGlmIChpdGVtRGF0YSAmJiBleHApIHtcblx0XHRcdGNsZWFyTm9kZShpdGVtRGF0YS50ZXh0RWxlbWVudCk7XG5cdFx0XHRpdGVtRGF0YS50ZXh0RWxlbWVudC50ZXh0Q29udGVudCA9IGV4cC5leHBsYW5hdGlvbjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJdGVtUmVhZEluZGljYXRvcihlbGVtZW50OiBIVE1MRWxlbWVudCwgcmVhZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNsZWFyTm9kZShlbGVtZW50KTtcblx0XHRpZiAocmVhZCkge1xuXHRcdFx0ZWxlbWVudC5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2lyY2xlKSk7XG5cdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3JlYWQnKTtcblx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgndW5yZWFkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVsZW1lbnQuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNpcmNsZUZpbGxlZCkpO1xuXHRcdFx0ZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdyZWFkJyk7XG5cdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3VucmVhZCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUV4cGxhbmF0aW9uSXRlbXNSZWFkU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhwbGFuYXRpb25JdGVtcy5mb3JFYWNoKCh7IHJlYWRJbmRpY2F0b3IgfSwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGV4cCA9IHRoaXMuX2V4cGxhbmF0aW9uc1tpbmRleF07XG5cdFx0XHR0aGlzLl91cGRhdGVJdGVtUmVhZEluZGljYXRvcihyZWFkSW5kaWNhdG9yLCBleHAucmVhZCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgd2lkZ2V0IHBvc2l0aW9uIGFuZCBsYXlvdXRcblx0ICovXG5cdGxheW91dChzdGFydExpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXJ0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCB7IGNvbnRlbnRMZWZ0LCBjb250ZW50V2lkdGgsIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggfSA9IHRoaXMuX2VkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5fZWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXG5cdFx0Ly8gUG9zaXRpb24gYXQgcmlnaHQgZWRnZSBsaWtlIERpZmZIdW5rV2lkZ2V0XG5cdFx0Y29uc3Qgd2lkZ2V0V2lkdGggPSBnZXRUb3RhbFdpZHRoKHRoaXMuX2RvbU5vZGUpIHx8IDI4MDtcblxuXHRcdHRoaXMuX3Bvc2l0aW9uID0ge1xuXHRcdFx0c3RhY2tPcmRpbmFsOiAyLFxuXHRcdFx0cHJlZmVyZW5jZToge1xuXHRcdFx0XHR0b3A6IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKHN0YXJ0TGluZU51bWJlcikgLSBzY3JvbGxUb3AgLSBsaW5lSGVpZ2h0LFxuXHRcdFx0XHRsZWZ0OiBjb250ZW50TGVmdCArIGNvbnRlbnRXaWR0aCAtICgyICogdmVydGljYWxTY3JvbGxiYXJXaWR0aCArIHdpZGdldFdpZHRoKVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyBvciBoaWRlcyB0aGUgd2lkZ2V0XG5cdCAqL1xuXHR0b2dnbGUoc2hvdzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHNob3cpO1xuXHRcdGlmIChzaG93ICYmIHRoaXMuX2V4cGxhbmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9leHBsYW5hdGlvbnNbMF0uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVsYXlvdXRzIHRoZSB3aWRnZXQgYXQgaXRzIGN1cnJlbnQgbGluZSBudW1iZXJcblx0ICovXG5cdHJlbGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX3N0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gSU92ZXJsYXlXaWRnZXQgaW1wbGVtZW50YXRpb25cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9wb3NpdGlvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9yYW5nZUhpZ2hsaWdodERlY29yYXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBNYW5hZ2VyIGZvciBleHBsYW5hdGlvbiB3aWRnZXRzIGluIGFuIGVkaXRvclxuICogR3JvdXBzIGNoYW5nZXMgYW5kIGNyZWF0ZXMgY29tYmluZWQgd2lkZ2V0cyBmb3IgbmVhcmJ5IGNoYW5nZXNcbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nRXhwbGFuYXRpb25XaWRnZXRNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0czogQ2hhdEVkaXRpbmdFeHBsYW5hdGlvbldpZGdldFtdID0gW107XG5cdHByaXZhdGUgX3Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIF9jaGF0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RpZmZJbmZvOiBJRXhwbGFuYXRpb25EaWZmSW5mbyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdG1vZGVsTWFuYWdlcjogSUNoYXRFZGl0aW5nRXhwbGFuYXRpb25Nb2RlbE1hbmFnZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxVcmk6IFVSSSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIExpc3RlbiBmb3IgbW9kZWwgY2hhbmdlcyAtIGhpZGUvc2hvdyB3aWRnZXRzIGJhc2VkIG9uIHdoZXRoZXIgY3VycmVudCBtb2RlbCBtYXRjaGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3VXJpID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LnVyaTtcblx0XHRcdGlmICh0aGlzLl9tb2RlbFVyaSkge1xuXHRcdFx0XHRpZiAobmV3VXJpICYmIG5ld1VyaS50b1N0cmluZygpID09PSB0aGlzLl9tb2RlbFVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0Ly8gU3dpdGNoZWQgYmFjayB0byB0aGUgZmlsZSAtIHNob3cgd2lkZ2V0c1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX3dpZGdldHMpIHtcblx0XHRcdFx0XHRcdHdpZGdldC50b2dnbGUodGhpcy5fdmlzaWJsZSk7XG5cdFx0XHRcdFx0XHR3aWRnZXQucmVsYXlvdXQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gU3dpdGNoZWQgdG8gYSBkaWZmZXJlbnQgZmlsZSAtIGhpZGUgd2lkZ2V0c1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX3dpZGdldHMpIHtcblx0XHRcdFx0XHRcdHdpZGdldC50b2dnbGUoZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE9ic2VydmUgc3RhdGUgZnJvbSBtb2RlbCBtYW5hZ2VyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gbW9kZWxNYW5hZ2VyLnN0YXRlLnJlYWQocik7XG5cdFx0XHRjb25zdCB1cmlTdGF0ZSA9IHN0YXRlLmdldCh0aGlzLl9tb2RlbFVyaSk7XG5cblx0XHRcdGlmICh1cmlTdGF0ZSkge1xuXHRcdFx0XHQvLyBVcGRhdGUgZGlmZkluZm8gYW5kIGNoYXRTZXNzaW9uUmVzb3VyY2UgZnJvbSBzdGF0ZVxuXHRcdFx0XHR0aGlzLl9kaWZmSW5mbyA9IHVyaVN0YXRlLmRpZmZJbmZvO1xuXHRcdFx0XHR0aGlzLl9jaGF0U2Vzc2lvblJlc291cmNlID0gdXJpU3RhdGUuY2hhdFNlc3Npb25SZXNvdXJjZTtcblxuXHRcdFx0XHQvLyBFbnN1cmUgd2lkZ2V0cyBhcmUgY3JlYXRlZFxuXHRcdFx0XHRpZiAodGhpcy5fd2lkZ2V0cy5sZW5ndGggPT09IDAgJiYgdGhpcy5fZGlmZkluZm8pIHtcblx0XHRcdFx0XHR0aGlzLl9jcmVhdGVXaWRnZXRzKHRoaXMuX2RpZmZJbmZvLCB0aGlzLl9jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBIYW5kbGUgZXhwbGFuYXRpb24gc3RhdGUgY2hhbmdlc1xuXHRcdFx0XHRpZiAodXJpU3RhdGUucHJvZ3Jlc3MgPT09ICdjb21wbGV0ZScpIHtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVFeHBsYW5hdGlvbnModGhpcy5fbW9kZWxVcmksIHVyaVN0YXRlLmV4cGxhbmF0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVXaWRnZXRzKGRpZmZJbmZvOiBJRXhwbGFuYXRpb25EaWZmSW5mbywgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGRpZmZJbmZvLmlkZW50aWNhbCB8fCBkaWZmSW5mby5jaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdyb3VwIG5lYXJieSBjaGFuZ2VzXG5cdFx0Y29uc3QgZ3JvdXBzID0gZ3JvdXBOZWFyYnlDaGFuZ2VzKGRpZmZJbmZvLmNoYW5nZXMsIDUpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgd2lkZ2V0IGZvciBlYWNoIGdyb3VwXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IG5ldyBDaGF0RWRpdGluZ0V4cGxhbmF0aW9uV2lkZ2V0KFxuXHRcdFx0XHR0aGlzLl9lZGl0b3IsXG5cdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHRkaWZmSW5mbyxcblx0XHRcdFx0dGhpcy5fY2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX3ZpZXdzU2VydmljZSxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl93aWRnZXRzLnB1c2god2lkZ2V0KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHdpZGdldCk7XG5cblx0XHRcdC8vIExheW91dCBhdCB0aGUgZmlyc3QgY2hhbmdlIGluIHRoZSBncm91cFxuXHRcdFx0d2lkZ2V0LmxheW91dChncm91cFswXS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH1cblxuXHRcdC8vIFJlbGF5b3V0IG9uIHNjcm9sbC9sYXlvdXQgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UsIHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSkoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fd2lkZ2V0cykge1xuXHRcdFx0XHR3aWRnZXQucmVsYXlvdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVFeHBsYW5hdGlvbnModXJpOiBVUkksIGV4cGxhbmF0aW9uczogcmVhZG9ubHkgSUNoYW5nZUV4cGxhbmF0aW9uTW9kZWxbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxVcmkgfHwgdXJpLnRvU3RyaW5nKCkgIT09IHRoaXMuX21vZGVsVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNYXAgZXhwbGFuYXRpb25zIHRvIHdpZGdldHMgYnkgbWF0Y2hpbmcgbGluZSBudW1iZXJzXG5cdFx0Zm9yIChjb25zdCBleHBsYW5hdGlvbiBvZiBleHBsYW5hdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX3dpZGdldHMpIHtcblx0XHRcdFx0Ly8gVHJ5IHRvIHNldCB0aGUgZXhwbGFuYXRpb24gb24gdGhlIHdpZGdldCAtIGl0IHdpbGwgbWF0Y2ggYnkgbGluZSBudW1iZXJcblx0XHRcdFx0aWYgKHdpZGdldC5zZXRFeHBsYW5hdGlvbkJ5TGluZU51bWJlcihcblx0XHRcdFx0XHRleHBsYW5hdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZXhwbGFuYXRpb24uZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRleHBsYW5hdGlvbi5leHBsYW5hdGlvblxuXHRcdFx0XHQpKSB7XG5cdFx0XHRcdFx0YnJlYWs7IC8vIEZvdW5kIHRoZSBtYXRjaGluZyB3aWRnZXQsIG5vIG5lZWQgdG8gY2hlY2sgb3RoZXJzXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgYWxsIHdpZGdldHNcblx0ICovXG5cdHNob3coKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fd2lkZ2V0cykge1xuXHRcdFx0d2lkZ2V0LnRvZ2dsZSh0cnVlKTtcblx0XHRcdHdpZGdldC5yZWxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIaWRlcyBhbGwgd2lkZ2V0c1xuXHQgKi9cblx0aGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fd2lkZ2V0cykge1xuXHRcdFx0d2lkZ2V0LnRvZ2dsZShmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJXaWRnZXRzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX3dpZGdldHMpIHtcblx0XHRcdHdpZGdldC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3dpZGdldHMubGVuZ3RoID0gMDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJXaWRnZXRzKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FBRVAsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxhQUFhO0FBRXRCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsR0FBRyx1QkFBdUIsV0FBVyxxQkFBcUI7QUFDbkUsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUNBQW1DO0FBRTVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQW1EO0FBRTVELFlBQVksU0FBUztBQUVyQixTQUFTLGVBQWU7QUFrQnhCLFNBQVMsZUFBZSxRQUFxRCxVQUFnRjtBQUM1SixRQUFNLGdCQUEwQixDQUFDO0FBQ2pDLFFBQU0sZ0JBQTBCLENBQUM7QUFHakMsV0FBUyxJQUFJLE9BQU8sU0FBUyxpQkFBaUIsSUFBSSxPQUFPLFNBQVMsd0JBQXdCLEtBQUs7QUFDOUYsVUFBTSxPQUFPLFNBQVMsY0FBYyxlQUFlLENBQUM7QUFDcEQsa0JBQWMsS0FBSyxJQUFJO0FBQUEsRUFDeEI7QUFHQSxXQUFTLElBQUksT0FBTyxTQUFTLGlCQUFpQixJQUFJLE9BQU8sU0FBUyx3QkFBd0IsS0FBSztBQUM5RixVQUFNLE9BQU8sU0FBUyxjQUFjLGVBQWUsQ0FBQztBQUNwRCxrQkFBYyxLQUFLLElBQUk7QUFBQSxFQUN4QjtBQUVBLFNBQU87QUFBQSxJQUNOLGNBQWMsY0FBYyxLQUFLLElBQUk7QUFBQSxJQUNyQyxjQUFjLGNBQWMsS0FBSyxJQUFJO0FBQUEsRUFDdEM7QUFDRDtBQU1BLFNBQVMsbUJBQStDLFNBQXVCLGdCQUF3QixHQUFVO0FBQ2hILE1BQUksUUFBUSxXQUFXLEdBQUc7QUFDekIsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUVBLFFBQU0sU0FBZ0IsQ0FBQztBQUN2QixNQUFJ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
