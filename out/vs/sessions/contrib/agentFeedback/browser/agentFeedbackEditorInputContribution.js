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
import "./media/agentFeedbackEditorInput.css";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection, SelectionDirection } from "../../../../editor/common/core/selection.js";
import { addStandardDisposableListener, getWindow, isHTMLElement } from "../../../../base/browser/dom.js";
import { isEqual } from "../../../../base/common/resources.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { IAgentFeedbackService } from "./agentFeedbackService.js";
import { createAgentFeedbackContext } from "./agentFeedbackEditorUtils.js";
import { localize, localize2 } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { CHAT_CATEGORY } from "../../../../workbench/contrib/chat/browser/actions/chatActions.js";
import { FeedbackInputWidget } from "./feedbackInputWidget.js";
const addFeedbackAtCurrentLineActionId = "agentFeedbackEditor.action.addAtCurrentLine";
const agentFeedbackHoverGlyphClassName = "agent-feedback-glyph";
const hasAgentFeedbackSessionForEditor = new RawContextKey("agentFeedbackEditor.hasSession", false);
const _AgentFeedbackInputWidget = class _AgentFeedbackInputWidget extends Disposable {
  constructor(_editor) {
    super();
    this._editor = _editor;
    this.allowEditorOverflow = false;
    this._position = null;
    this._core = this._register(new FeedbackInputWidget({
      placeholder: localize("agentFeedback.addFeedback", "Add Feedback"),
      getMaxContentWidth: () => this._computeContentWidth(),
      primaryAction: {
        label: localize("agentFeedback.add", "Add Feedback"),
        icon: Codicon.plus,
        keybindingLabel: localize("enter", "Enter")
      },
      secondaryAction: {
        label: localize("agentFeedback.addAndSubmit", "Add Feedback and Submit"),
        icon: Codicon.send,
        keybindingLabel: localize("altEnter", "Alt+Enter")
      }
    }));
    this.onDidTriggerAdd = this._core.onDidTriggerPrimary;
    this.onDidTriggerAddAndSubmit = this._core.onDidTriggerSecondary;
  }
  getId() {
    return _AgentFeedbackInputWidget._ID;
  }
  getDomNode() {
    return this._core.domNode;
  }
  getPosition() {
    return this._position;
  }
  get inputElement() {
    return this._core.inputElement;
  }
  setPosition(position) {
    this._position = position;
    this._editor.layoutOverlayWidget(this);
  }
  show() {
    this._core.show();
  }
  hide() {
    this._core.hide();
  }
  clearInput() {
    this._core.clearInput();
  }
  setPlaceholder(placeholder) {
    this._core.setPlaceholder(placeholder);
  }
  autoSize() {
    this._core.autoSize();
  }
  updateActionEnabled() {
    this._core.updateActionEnabled();
  }
  _computeContentWidth() {
    const layoutInfo = this._editor.getLayoutInfo();
    return Math.max(0, layoutInfo.width - layoutInfo.contentLeft);
  }
};
_AgentFeedbackInputWidget._ID = "agentFeedback.inputWidget";
let AgentFeedbackInputWidget = _AgentFeedbackInputWidget;
let AgentFeedbackEditorInputContribution = class extends Disposable {
  constructor(_editor, _agentFeedbackService, _codeEditorService, _contextKeyService) {
    super();
    this._editor = _editor;
    this._agentFeedbackService = _agentFeedbackService;
    this._codeEditorService = _codeEditorService;
    this._contextKeyService = _contextKeyService;
    this._visible = false;
    this._mouseDown = false;
    this._suppressSelectionChangeOnce = false;
    this._preferBelow = true;
    this._widgetListeners = this._store.add(new DisposableStore());
    this._hoverDecorations = this._editor.createDecorationsCollection();
    this._store.add({ dispose: () => this._hoverDecorations.clear() });
    this._hasAgentFeedbackSessionContext = hasAgentFeedbackSessionForEditor.bindTo(this._contextKeyService);
    this._store.add(this._editor.onDidChangeCursorSelection(() => this._onSelectionChanged()));
    this._store.add(this._editor.onDidChangeModel(() => this._onModelChanged()));
    this._store.add(this._editor.onDidScrollChange(() => {
      if (this._visible) {
        this._updatePosition();
      }
    }));
    this._store.add(this._editor.onDidLayoutChange(() => {
      if (this._visible && this._widget) {
        this._widget.autoSize();
        this._updatePosition();
      }
    }));
    this._store.add(this._editor.onMouseMove((e) => this._onEditorMouseMove(e)));
    this._store.add(this._editor.onMouseLeave(() => this._clearHoverGlyph()));
    this._store.add(this._editor.onMouseDown((e) => {
      if (this._isWidgetTarget(e.event.target)) {
        return;
      }
      if (this._isHoverGlyphTarget(e)) {
        e.event.preventDefault();
        e.event.stopPropagation();
        const lineNumber = e.target.position?.lineNumber;
        if (lineNumber !== void 0) {
          this._selectLine(lineNumber);
        }
        return;
      }
      this._mouseDown = true;
      this._autoHide();
    }));
    this._store.add(this._editor.onMouseUp((e) => {
      this._mouseDown = false;
      if (this._isWidgetTarget(e.event.target)) {
        return;
      }
      if (this._isHoverGlyphTarget(e)) {
        return;
      }
      this._onSelectionChanged();
    }));
    this._store.add(this._editor.onDidBlurEditorWidget(() => {
      if (!this._visible) {
        return;
      }
      getWindow(this._editor.getDomNode()).setTimeout(() => {
        if (!this._visible) {
          return;
        }
        if (this._isWidgetTarget(getWindow(this._editor.getDomNode()).document.activeElement)) {
          return;
        }
        this._autoHide();
      }, 0);
    }));
    this._store.add(this._editor.onDidFocusEditorText(() => this._onSelectionChanged()));
    this._store.add(this._agentFeedbackService.onDidChangeFeedbackScope(() => {
      this._clearHoverGlyph();
      this._sessionResource = this._getSessionForModel();
      if (this._visible && this._widget) {
        if (!this._sessionResource) {
          this._autoHide();
        } else {
          this._widget.setPlaceholder(this._getPlaceholder());
        }
      }
    }));
    this._getSessionForModel();
  }
  _isWidgetTarget(target) {
    return !!this._widget && !!target && this._widget.getDomNode().contains(target);
  }
  _isHoverGlyphTarget(e) {
    return isHTMLElement(e.target.element) && e.target.element.classList.contains(agentFeedbackHoverGlyphClassName);
  }
  _ensureWidget() {
    if (!this._widget) {
      this._widget = new AgentFeedbackInputWidget(this._editor);
      this._store.add(this._widget.onDidTriggerAdd(() => this._addFeedback()));
      this._store.add(this._widget.onDidTriggerAddAndSubmit(() => this._addFeedbackAndSubmit()));
      this._editor.addOverlayWidget(this._widget);
    }
    return this._widget;
  }
  _onModelChanged() {
    this._hide();
    this._clearHoverGlyph();
    this._suppressSelectionChangeOnce = false;
    this._sessionResource = void 0;
    this._getSessionForModel();
  }
  _onEditorMouseMove(e) {
    if (this._visible || this._hasInputText()) {
      this._clearHoverGlyph();
      return;
    }
    this._updateHoverGlyph(e.target.position?.lineNumber);
  }
  _updateHoverGlyph(lineNumber) {
    const model = this._editor.getModel();
    if (lineNumber === void 0 || !model || lineNumber < 1 || lineNumber > model.getLineCount()) {
      this._clearHoverGlyph();
      return;
    }
    if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
      this._clearHoverGlyph();
      return;
    }
    if (this._hoverLineNumber === lineNumber) {
      return;
    }
    const sessionResource = this._getSessionForModel();
    if (!sessionResource) {
      this._clearHoverGlyph();
      return;
    }
    if (this._lineHasExistingFeedback(sessionResource, model.uri, lineNumber)) {
      this._clearHoverGlyph();
      return;
    }
    this._hoverLineNumber = lineNumber;
    this._hoverDecorations.set([{
      range: new Range(lineNumber, 1, lineNumber, 1),
      options: {
        description: "agent-feedback-hover-glyph",
        lineNumberClassName: `${agentFeedbackHoverGlyphClassName} line-hover`,
        lineNumberHoverMessage: new MarkdownString(localize("agentFeedback.add", "Add Feedback"))
      }
    }]);
  }
  _lineHasExistingFeedback(sessionResource, resourceUri, lineNumber) {
    return this._agentFeedbackService.getFeedback(sessionResource).some((feedback) => isEqual(feedback.resourceUri, resourceUri) && lineNumber >= feedback.range.startLineNumber && lineNumber <= feedback.range.endLineNumber);
  }
  _clearHoverGlyph() {
    if (this._hoverLineNumber === void 0) {
      return;
    }
    this._hoverLineNumber = void 0;
    this._hoverDecorations.clear();
  }
  _onSelectionChanged() {
    if (this._suppressSelectionChangeOnce) {
      this._suppressSelectionChangeOnce = false;
      return;
    }
    if (this._mouseDown || !this._editor.hasTextFocus()) {
      return;
    }
    if (this._visible && this._hasInputText()) {
      return;
    }
    const selection = this._editor.getSelection();
    if (!selection || selection.isEmpty()) {
      this._autoHide();
      return;
    }
    const model = this._editor.getModel();
    if (!model) {
      this._autoHide();
      return;
    }
    const sessionResource = this._getSessionForModel();
    if (!sessionResource) {
      this._autoHide();
      return;
    }
    this._sessionResource = sessionResource;
    const preferBelow = selection.getDirection() === SelectionDirection.LTR;
    const anchorPosition = preferBelow ? selection.getEndPosition() : selection.getStartPosition();
    this._show(Range.lift(selection), anchorPosition, preferBelow);
  }
  _show(range, anchorPosition, preferBelow, focusInput = false) {
    const widget = this._ensureWidget();
    this._clearHoverGlyph();
    if (!this._visible) {
      this._visible = true;
      this._registerWidgetListeners(widget);
    }
    this._pinnedRange = range;
    this._anchorPosition = anchorPosition;
    this._preferBelow = preferBelow;
    widget.setPlaceholder(this._getPlaceholder());
    widget.clearInput();
    widget.show();
    this._updatePosition();
    if (focusInput) {
      widget.inputElement.focus();
    }
  }
  _getPlaceholder() {
    const model = this._editor.getModel();
    const hasChanges = !!model && (this._agentFeedbackService.getSessionForFile(model.uri)?.changes.get().length ?? 0) > 0;
    return hasChanges ? localize("agentFeedback.addFeedback", "Add Feedback") : localize("agentFeedback.addComment", "Add Comment");
  }
  _hide() {
    if (!this._visible) {
      return;
    }
    this._visible = false;
    this._pinnedRange = void 0;
    this._anchorPosition = void 0;
    this._widgetListeners.clear();
    if (this._widget) {
      this._widget.hide();
      this._widget.setPosition(null);
      this._widget.clearInput();
    }
  }
  _hasInputText() {
    return !!this._widget && this._widget.inputElement.value.trim().length > 0;
  }
  showAtCurrentLine(focusInput = true) {
    const position = this._editor.getPosition();
    if (!position) {
      return;
    }
    this._showAtLine(position.lineNumber, focusInput);
  }
  _showAtLine(lineNumber, focusInput) {
    if (this._visible && this._hasInputText()) {
      this.focusInput();
      return;
    }
    const model = this._editor.getModel();
    if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) {
      this._autoHide();
      return;
    }
    const sessionResource = this._getSessionForModel();
    if (!sessionResource) {
      this._autoHide();
      return;
    }
    this._sessionResource = sessionResource;
    this._show(new Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)), new Position(lineNumber, 1), true, focusInput);
  }
  /**
   * Select the whole line as a result of clicking the gutter glyph. Selecting
   * the line triggers the selection-change handler which opens the feedback
   * input automatically, so we don't open it directly here. Empty lines are
   * ignored as there is nothing to give feedback on.
   */
  _selectLine(lineNumber) {
    if (this._visible && this._hasInputText()) {
      this.focusInput();
      return;
    }
    const model = this._editor.getModel();
    if (!model || lineNumber < 1 || lineNumber > model.getLineCount()) {
      return;
    }
    if (model.getLineFirstNonWhitespaceColumn(lineNumber) === 0) {
      return;
    }
    this._editor.setSelection(new Selection(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber)));
    this._editor.focus();
    this.focusInput();
  }
  _getSessionForModel() {
    const model = this._editor.getModel();
    if (!model || !this._contextKeyService.contextMatchesRules(ChatContextKeys.enabled)) {
      this._hasAgentFeedbackSessionContext.set(false);
      this._sessionResource = void 0;
      return void 0;
    }
    const sessionResource = this._agentFeedbackService.getFeedbackSessionResource(model.uri);
    this._hasAgentFeedbackSessionContext.set(!!sessionResource);
    this._sessionResource = sessionResource;
    return sessionResource;
  }
  /**
   * Hide the widget unless the user has typed text. When text is present the
   * widget is preserved so the user does not lose their in-progress feedback;
   * they can close it explicitly via Esc.
   */
  _autoHide() {
    if (this._hasInputText()) {
      return;
    }
    this._hide();
  }
  _registerWidgetListeners(widget) {
    this._widgetListeners.clear();
    const editorDomNode = this._editor.getDomNode();
    if (editorDomNode) {
      this._widgetListeners.add(addStandardDisposableListener(editorDomNode, "keydown", (e) => {
        if (!this._visible) {
          return;
        }
        if (!this._editor.hasTextFocus()) {
          return;
        }
        if (e.keyCode === KeyCode.Ctrl || e.keyCode === KeyCode.Shift || e.keyCode === KeyCode.Alt || e.keyCode === KeyCode.Meta) {
          return;
        }
        if (e.keyCode === KeyCode.Escape) {
          this._hide();
          this._editor.focus();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.keyCode === KeyCode.KeyI) {
          e.preventDefault();
          e.stopPropagation();
          widget.inputElement.focus();
          return;
        }
        if (e.ctrlKey || e.altKey || e.metaKey) {
          return;
        }
        if (e.keyCode === KeyCode.UpArrow || e.keyCode === KeyCode.DownArrow || e.keyCode === KeyCode.LeftArrow || e.keyCode === KeyCode.RightArrow) {
          return;
        }
        if (!this._editor.getOption(EditorOption.readOnly)) {
          return;
        }
        if (getWindow(widget.inputElement).document.activeElement !== widget.inputElement) {
          widget.inputElement.focus();
        }
      }));
    }
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "keydown", (e) => {
      if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._hide();
        this._editor.focus();
        return;
      }
      if (e.keyCode === KeyCode.Enter && e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this._addFeedbackAndSubmit();
        return;
      }
      if (e.keyCode === KeyCode.Enter) {
        e.preventDefault();
        e.stopPropagation();
        this._addFeedback();
        return;
      }
    }));
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "keypress", (e) => {
      e.stopPropagation();
    }));
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "input", () => {
      widget.autoSize();
      widget.updateActionEnabled();
      this._updatePosition();
    }));
    this._widgetListeners.add(addStandardDisposableListener(widget.inputElement, "blur", () => {
      const win = getWindow(widget.inputElement);
      win.setTimeout(() => {
        if (!this._visible) {
          return;
        }
        if (this._editor.hasWidgetFocus()) {
          return;
        }
        this._autoHide();
      }, 0);
    }));
  }
  focusInput() {
    if (this._visible && this._widget) {
      this._widget.inputElement.focus();
    }
  }
  _hideAndRefocusEditor() {
    this._suppressSelectionChangeOnce = true;
    this._hide();
    this._editor.focus();
  }
  _addFeedback() {
    if (!this._widget) {
      return false;
    }
    const text = this._widget.inputElement.value.trim();
    if (!text) {
      return false;
    }
    const range = this._pinnedRange ?? this._editor.getSelection();
    const model = this._editor.getModel();
    if (!range || !model || !this._sessionResource) {
      return false;
    }
    this._agentFeedbackService.addFeedback(this._sessionResource, model.uri, range, text, void 0, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, range));
    this._hideAndRefocusEditor();
    return true;
  }
  _addFeedbackAndSubmit() {
    if (!this._widget) {
      return;
    }
    const text = this._widget.inputElement.value.trim();
    if (!text) {
      return;
    }
    const range = this._pinnedRange ?? this._editor.getSelection();
    const model = this._editor.getModel();
    if (!range || !model || !this._sessionResource) {
      return;
    }
    const sessionResource = this._sessionResource;
    this._hideAndRefocusEditor();
    this._agentFeedbackService.addFeedbackAndSubmit(sessionResource, model.uri, range, text, void 0, createAgentFeedbackContext(this._editor, this._codeEditorService, model.uri, range));
  }
  _updatePosition() {
    if (!this._widget || !this._visible) {
      return;
    }
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const layoutInfo = this._editor.getLayoutInfo();
    const widgetDom = this._widget.getDomNode();
    const widgetHeight = widgetDom.offsetHeight || 30;
    const widgetWidth = widgetDom.offsetWidth || 150;
    const target = this._getPositioningTarget();
    if (!target) {
      this._autoHide();
      return;
    }
    const scrolledPosition = this._editor.getScrolledVisiblePosition(target.anchorPosition);
    if (!scrolledPosition) {
      this._widget.setPosition(null);
      return;
    }
    let top;
    if (target.preferBelow) {
      top = scrolledPosition.top + lineHeight;
      if (top + widgetHeight > layoutInfo.height) {
        top = scrolledPosition.top - widgetHeight;
      }
    } else {
      top = scrolledPosition.top - widgetHeight;
      if (top < 0) {
        top = scrolledPosition.top + lineHeight;
      }
    }
    top = Math.max(0, Math.min(top, layoutInfo.height - widgetHeight));
    const minLeft = layoutInfo.contentLeft;
    const maxLeft = Math.max(minLeft, layoutInfo.width - widgetWidth);
    const left = Math.max(minLeft, Math.min(scrolledPosition.left, maxLeft));
    this._widget.setPosition({ preference: { top, left } });
  }
  _getPositioningTarget() {
    if (this._pinnedRange && this._anchorPosition) {
      return { anchorPosition: this._anchorPosition, preferBelow: this._preferBelow };
    }
    const selection = this._editor.getSelection();
    if (!selection || selection.isEmpty()) {
      return void 0;
    }
    const preferBelow = selection.getDirection() === SelectionDirection.LTR;
    return {
      anchorPosition: preferBelow ? selection.getEndPosition() : selection.getStartPosition(),
      preferBelow
    };
  }
  dispose() {
    if (this._widget) {
      this._editor.removeOverlayWidget(this._widget);
      this._widget.dispose();
      this._widget = void 0;
    }
    super.dispose();
  }
};
AgentFeedbackEditorInputContribution.ID = "agentFeedback.editorInputContribution";
AgentFeedbackEditorInputContribution = __decorateClass([
  __decorateParam(1, IAgentFeedbackService),
  __decorateParam(2, ICodeEditorService),
  __decorateParam(3, IContextKeyService)
], AgentFeedbackEditorInputContribution);
class AddFeedbackAtCurrentLineAction extends Action2 {
  constructor() {
    super({
      id: addFeedbackAtCurrentLineActionId,
      title: localize2("agentFeedback.addAtCurrentLine", "Add Feedback at Current Line"),
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, hasAgentFeedbackSessionForEditor),
      menu: {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.and(ChatContextKeys.enabled, hasAgentFeedbackSessionForEditor)
      }
    });
  }
  run(accessor) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const editor = codeEditorService.getFocusedCodeEditor() ?? codeEditorService.getActiveCodeEditor();
    const contribution = editor?.getContribution(AgentFeedbackEditorInputContribution.ID);
    contribution?.showAtCurrentLine(true);
  }
}
registerAction2(AddFeedbackAtCurrentLineAction);
registerEditorContribution(AgentFeedbackEditorInputContribution.ID, AgentFeedbackEditorInputContribution, EditorContributionInstantiation.Eventually);
export {
  AgentFeedbackEditorInputContribution,
  AgentFeedbackInputWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tFZGl0b3JJbnB1dENvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hZ2VudEZlZWRiYWNrRWRpdG9ySW5wdXQuY3NzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRWRpdG9yTW91c2VFdmVudCwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24sIFNlbGVjdGlvbkRpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIsIGdldFdpbmRvdywgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4vYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRGZWVkYmFja0NvbnRleHQgfSBmcm9tICcuL2FnZW50RmVlZGJhY2tFZGl0b3JVdGlscy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IEZlZWRiYWNrSW5wdXRXaWRnZXQgfSBmcm9tICcuL2ZlZWRiYWNrSW5wdXRXaWRnZXQuanMnO1xuXG5jb25zdCBhZGRGZWVkYmFja0F0Q3VycmVudExpbmVBY3Rpb25JZCA9ICdhZ2VudEZlZWRiYWNrRWRpdG9yLmFjdGlvbi5hZGRBdEN1cnJlbnRMaW5lJztcbmNvbnN0IGFnZW50RmVlZGJhY2tIb3ZlckdseXBoQ2xhc3NOYW1lID0gJ2FnZW50LWZlZWRiYWNrLWdseXBoJztcbmNvbnN0IGhhc0FnZW50RmVlZGJhY2tTZXNzaW9uRm9yRWRpdG9yID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FnZW50RmVlZGJhY2tFZGl0b3IuaGFzU2Vzc2lvbicsIGZhbHNlKTtcblxuLyoqXG4gKiBUaGUgaW5saW5lIFwiQWRkIEZlZWRiYWNrXCIgaW5wdXQgc2hvd24gaW4gdGhlIGVkaXRvciB3aGVuIHRoZSB1c2VyIHNlbGVjdHMgYVxuICogcmFuZ2UgdG8gY29tbWVudCBvbi4gRXhwb3J0ZWQgc28gaXQgY2FuIGJlIHJlbmRlcmVkIGluIGEgY29tcG9uZW50IGZpeHR1cmU7XG4gKiBpdCBvbmx5IGRlcGVuZHMgb24ge0BsaW5rIElDb2RlRWRpdG9yfSBmb3IgaXRzIGxheW91dCBnZW9tZXRyeS4gV3JhcHMgdGhlXG4gKiByZXVzYWJsZSB7QGxpbmsgRmVlZGJhY2tJbnB1dFdpZGdldH0gY29yZSBhcyBhbiB7QGxpbmsgSU92ZXJsYXlXaWRnZXR9LlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRGZWVkYmFja0lucHV0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPdmVybGF5V2lkZ2V0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfSUQgPSAnYWdlbnRGZWVkYmFjay5pbnB1dFdpZGdldCc7XG5cblx0cmVhZG9ubHkgYWxsb3dFZGl0b3JPdmVyZmxvdyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvcmU6IEZlZWRiYWNrSW5wdXRXaWRnZXQ7XG5cdHByaXZhdGUgX3Bvc2l0aW9uOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VyQWRkOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRUcmlnZ2VyQWRkQW5kU3VibWl0OiBFdmVudDx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmVlZGJhY2tJbnB1dFdpZGdldCh7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suYWRkRmVlZGJhY2snLCBcIkFkZCBGZWVkYmFja1wiKSxcblx0XHRcdGdldE1heENvbnRlbnRXaWR0aDogKCkgPT4gdGhpcy5fY29tcHV0ZUNvbnRlbnRXaWR0aCgpLFxuXHRcdFx0cHJpbWFyeUFjdGlvbjoge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suYWRkJywgXCJBZGQgRmVlZGJhY2tcIiksXG5cdFx0XHRcdGljb246IENvZGljb24ucGx1cyxcblx0XHRcdFx0a2V5YmluZGluZ0xhYmVsOiBsb2NhbGl6ZSgnZW50ZXInLCBcIkVudGVyXCIpLFxuXHRcdFx0fSxcblx0XHRcdHNlY29uZGFyeUFjdGlvbjoge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suYWRkQW5kU3VibWl0JywgXCJBZGQgRmVlZGJhY2sgYW5kIFN1Ym1pdFwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zZW5kLFxuXHRcdFx0XHRrZXliaW5kaW5nTGFiZWw6IGxvY2FsaXplKCdhbHRFbnRlcicsIFwiQWx0K0VudGVyXCIpLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dGhpcy5vbkRpZFRyaWdnZXJBZGQgPSB0aGlzLl9jb3JlLm9uRGlkVHJpZ2dlclByaW1hcnk7XG5cdFx0dGhpcy5vbkRpZFRyaWdnZXJBZGRBbmRTdWJtaXQgPSB0aGlzLl9jb3JlLm9uRGlkVHJpZ2dlclNlY29uZGFyeTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEFnZW50RmVlZGJhY2tJbnB1dFdpZGdldC5fSUQ7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fY29yZS5kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9wb3NpdGlvbjtcblx0fVxuXG5cdGdldCBpbnB1dEVsZW1lbnQoKTogSFRNTFRleHRBcmVhRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvcmUuaW5wdXRFbGVtZW50O1xuXHR9XG5cblx0c2V0UG9zaXRpb24ocG9zaXRpb246IElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fcG9zaXRpb24gPSBwb3NpdGlvbjtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0dGhpcy5fY29yZS5zaG93KCk7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvcmUuaGlkZSgpO1xuXHR9XG5cblx0Y2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3JlLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdHNldFBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3JlLnNldFBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyKTtcblx0fVxuXG5cdGF1dG9TaXplKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvcmUuYXV0b1NpemUoKTtcblx0fVxuXG5cdHVwZGF0ZUFjdGlvbkVuYWJsZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29yZS51cGRhdGVBY3Rpb25FbmFibGVkKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlQ29udGVudFdpZHRoKCk6IG51bWJlciB7XG5cdFx0Ly8gVGhlIHdpZGdldCBzdGlja3MgdG8gdGhlIGVkaXRvcidzIGNvbnRlbnQgbGVmdCBlZGdlLCBzbyB0aGUgc3BhY2UgaXRcblx0XHQvLyBoYXMgYXZhaWxhYmxlIGlzIHRoZSBjb250ZW50IGFyZWEgd2lkdGggKHRvIHRoZSByaWdodCBvZiB0aGUgbGluZVxuXHRcdC8vIG51bWJlcnMvZ2x5cGggbWFyZ2luKSwgbm90IHRoZSBmdWxsIGVkaXRvciB3aWR0aC5cblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRyZXR1cm4gTWF0aC5tYXgoMCwgbGF5b3V0SW5mby53aWR0aCAtIGxheW91dEluZm8uY29udGVudExlZnQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEZlZWRiYWNrRWRpdG9ySW5wdXRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FnZW50RmVlZGJhY2suZWRpdG9ySW5wdXRDb250cmlidXRpb24nO1xuXG5cdHByaXZhdGUgX3dpZGdldDogQWdlbnRGZWVkYmFja0lucHV0V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92aXNpYmxlID0gZmFsc2U7XG5cdHByaXZhdGUgX21vdXNlRG93biA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdXBwcmVzc1NlbGVjdGlvbkNoYW5nZU9uY2UgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Bpbm5lZFJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYW5jaG9yUG9zaXRpb246IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcmVmZXJCZWxvdyA9IHRydWU7XG5cdHByaXZhdGUgX2hvdmVyTGluZU51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckRlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNBZ2VudEZlZWRiYWNrU2Vzc2lvbkNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXRMaXN0ZW5lcnMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQWdlbnRGZWVkYmFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRGZWVkYmFja1NlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faG92ZXJEZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiB0aGlzLl9ob3ZlckRlY29yYXRpb25zLmNsZWFyKCkgfSk7XG5cdFx0dGhpcy5faGFzQWdlbnRGZWVkYmFja1Nlc3Npb25Db250ZXh0ID0gaGFzQWdlbnRGZWVkYmFja1Nlc3Npb25Gb3JFZGl0b3IuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKCkgPT4gdGhpcy5fb25TZWxlY3Rpb25DaGFuZ2VkKCkpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5fb25Nb2RlbENoYW5nZWQoKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlUG9zaXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdmlzaWJsZSAmJiB0aGlzLl93aWRnZXQpIHtcblx0XHRcdFx0Ly8gVGhlIGVkaXRvciByZXNpemVkOiByZS1jbGFtcCB0aGUgaW5wdXQgd2lkdGggdG8gdGhlIG5ldyBlZGl0b3Jcblx0XHRcdFx0Ly8gd2lkdGggYW5kIHJlcG9zaXRpb24gaXQuXG5cdFx0XHRcdHRoaXMuX3dpZGdldC5hdXRvU2l6ZSgpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVQb3NpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uTW91c2VNb3ZlKGUgPT4gdGhpcy5fb25FZGl0b3JNb3VzZU1vdmUoZSkpKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uTW91c2VMZWF2ZSgoKSA9PiB0aGlzLl9jbGVhckhvdmVyR2x5cGgoKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZURvd24oKGUpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc1dpZGdldFRhcmdldChlLmV2ZW50LnRhcmdldCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2lzSG92ZXJHbHlwaFRhcmdldChlKSkge1xuXHRcdFx0XHRlLmV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBlLnRhcmdldC5wb3NpdGlvbj8ubGluZU51bWJlcjtcblx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3NlbGVjdExpbmUobGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbW91c2VEb3duID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2F1dG9IaWRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZVVwKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9tb3VzZURvd24gPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLl9pc1dpZGdldFRhcmdldChlLmV2ZW50LnRhcmdldCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2lzSG92ZXJHbHlwaFRhcmdldChlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vblNlbGVjdGlvbkNoYW5nZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIERlZmVyIHNvIGZvY3VzIGhhcyBzZXR0bGVkIHRvIHRoZSBuZXcgdGFyZ2V0XG5cdFx0XHRnZXRXaW5kb3codGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKSEpLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3Zpc2libGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2lzV2lkZ2V0VGFyZ2V0KGdldFdpbmRvdyh0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpISkuZG9jdW1lbnQuYWN0aXZlRWxlbWVudCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYXV0b0hpZGUoKTtcblx0XHRcdH0sIDApO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHRoaXMuX29uU2VsZWN0aW9uQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLm9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jbGVhckhvdmVyR2x5cGgoKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHRoaXMuX2dldFNlc3Npb25Gb3JNb2RlbCgpO1xuXHRcdFx0aWYgKHRoaXMuX3Zpc2libGUgJiYgdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHRcdGlmICghdGhpcy5fc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5fYXV0b0hpZGUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0UGxhY2Vob2xkZXIodGhpcy5fZ2V0UGxhY2Vob2xkZXIoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fZ2V0U2Vzc2lvbkZvck1vZGVsKCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1dpZGdldFRhcmdldCh0YXJnZXQ6IEV2ZW50VGFyZ2V0IHwgRWxlbWVudCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl93aWRnZXQgJiYgISF0YXJnZXQgJiYgdGhpcy5fd2lkZ2V0LmdldERvbU5vZGUoKS5jb250YWlucyh0YXJnZXQgYXMgTm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0hvdmVyR2x5cGhUYXJnZXQoZTogSUVkaXRvck1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNIVE1MRWxlbWVudChlLnRhcmdldC5lbGVtZW50KSAmJiBlLnRhcmdldC5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucyhhZ2VudEZlZWRiYWNrSG92ZXJHbHlwaENsYXNzTmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVXaWRnZXQoKTogQWdlbnRGZWVkYmFja0lucHV0V2lkZ2V0IHtcblx0XHRpZiAoIXRoaXMuX3dpZGdldCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0ID0gbmV3IEFnZW50RmVlZGJhY2tJbnB1dFdpZGdldCh0aGlzLl9lZGl0b3IpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX3dpZGdldC5vbkRpZFRyaWdnZXJBZGQoKCkgPT4gdGhpcy5fYWRkRmVlZGJhY2soKSkpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX3dpZGdldC5vbkRpZFRyaWdnZXJBZGRBbmRTdWJtaXQoKCkgPT4gdGhpcy5fYWRkRmVlZGJhY2tBbmRTdWJtaXQoKSkpO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmFkZE92ZXJsYXlXaWRnZXQodGhpcy5fd2lkZ2V0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldDtcblx0fVxuXG5cdHByaXZhdGUgX29uTW9kZWxDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hpZGUoKTtcblx0XHR0aGlzLl9jbGVhckhvdmVyR2x5cGgoKTtcblx0XHR0aGlzLl9zdXBwcmVzc1NlbGVjdGlvbkNoYW5nZU9uY2UgPSBmYWxzZTtcblx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZ2V0U2Vzc2lvbkZvck1vZGVsKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkVkaXRvck1vdXNlTW92ZShlOiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlIHx8IHRoaXMuX2hhc0lucHV0VGV4dCgpKSB7XG5cdFx0XHR0aGlzLl9jbGVhckhvdmVyR2x5cGgoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlSG92ZXJHbHlwaChlLnRhcmdldC5wb3NpdGlvbj8ubGluZU51bWJlcik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVIb3ZlckdseXBoKGxpbmVOdW1iZXI6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IHVuZGVmaW5lZCB8fCAhbW9kZWwgfHwgbGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHR0aGlzLl9jbGVhckhvdmVyR2x5cGgoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBvZmZlciBmZWVkYmFjayBvbiBlbXB0eSBsaW5lcyAobm90aGluZyB0byBjb21tZW50IG9uKS5cblx0XHRpZiAobW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyKSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fY2xlYXJIb3ZlckdseXBoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2hvdmVyTGluZU51bWJlciA9PT0gbGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX2dldFNlc3Npb25Gb3JNb2RlbCgpO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl9jbGVhckhvdmVyR2x5cGgoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb24ndCByZW5kZXIgdGhlIGFkZCBnbHlwaCBvbiBsaW5lcyB0aGF0IGFscmVhZHkgaGF2ZSBhIGZlZWRiYWNrXG5cdFx0Ly8gY29tbWVudCwgb3RoZXJ3aXNlIHRoZSBhZGQgYWZmb3JkYW5jZSBvdmVybGFwcyB0aGUgZXhpc3RpbmcgY29tbWVudCdzXG5cdFx0Ly8gZ3V0dGVyIGRlY29yYXRpb24gYW5kIGJvdGggYmVjb21lIGNsaWNrYWJsZSBvbiB0aGUgc2FtZSBzcG90LlxuXHRcdGlmICh0aGlzLl9saW5lSGFzRXhpc3RpbmdGZWVkYmFjayhzZXNzaW9uUmVzb3VyY2UsIG1vZGVsLnVyaSwgbGluZU51bWJlcikpIHtcblx0XHRcdHRoaXMuX2NsZWFySG92ZXJHbHlwaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hvdmVyTGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0dGhpcy5faG92ZXJEZWNvcmF0aW9ucy5zZXQoW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgMSksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnYWdlbnQtZmVlZGJhY2staG92ZXItZ2x5cGgnLFxuXHRcdFx0XHRsaW5lTnVtYmVyQ2xhc3NOYW1lOiBgJHthZ2VudEZlZWRiYWNrSG92ZXJHbHlwaENsYXNzTmFtZX0gbGluZS1ob3ZlcmAsXG5cdFx0XHRcdGxpbmVOdW1iZXJIb3Zlck1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5hZGQnLCBcIkFkZCBGZWVkYmFja1wiKSksXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fVxuXG5cdHByaXZhdGUgX2xpbmVIYXNFeGlzdGluZ0ZlZWRiYWNrKHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXNvdXJjZVVyaTogVVJJLCBsaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuZ2V0RmVlZGJhY2soc2Vzc2lvblJlc291cmNlKS5zb21lKGZlZWRiYWNrID0+XG5cdFx0XHRpc0VxdWFsKGZlZWRiYWNrLnJlc291cmNlVXJpLCByZXNvdXJjZVVyaSlcblx0XHRcdCYmIGxpbmVOdW1iZXIgPj0gZmVlZGJhY2sucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyXG5cdFx0XHQmJiBsaW5lTnVtYmVyIDw9IGZlZWRiYWNrLnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJIb3ZlckdseXBoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ob3ZlckxpbmVOdW1iZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9ob3ZlckxpbmVOdW1iZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faG92ZXJEZWNvcmF0aW9ucy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25TZWxlY3Rpb25DaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdXBwcmVzc1NlbGVjdGlvbkNoYW5nZU9uY2UpIHtcblx0XHRcdHRoaXMuX3N1cHByZXNzU2VsZWN0aW9uQ2hhbmdlT25jZSA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tb3VzZURvd24gfHwgIXRoaXMuX2VkaXRvci5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSB3aWRnZXQgaXMgb3BlbiBhbmQgdGhlIHVzZXIgaGFzIHR5cGVkIHRleHQsIGZyZWV6ZSBpdHMgc3RhdGUuXG5cdFx0Ly8gQXV0by1oaWRlIGFuZCBhdXRvLXJlcG9zaXRpb24gYXJlIHN1cHByZXNzZWQ7IHRoZSB1c2VyIG11c3QgZXhwbGljaXRseVxuXHRcdC8vIGNsb3NlIHRoZSB3aWRnZXQgdmlhIEVzYy5cblx0XHRpZiAodGhpcy5fdmlzaWJsZSAmJiB0aGlzLl9oYXNJbnB1dFRleHQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbiB8fCBzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5fYXV0b0hpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl9nZXRTZXNzaW9uRm9yTW9kZWwoKTtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5fYXV0b0hpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgcHJlZmVyQmVsb3cgPSBzZWxlY3Rpb24uZ2V0RGlyZWN0aW9uKCkgPT09IFNlbGVjdGlvbkRpcmVjdGlvbi5MVFI7XG5cdFx0Y29uc3QgYW5jaG9yUG9zaXRpb24gPSBwcmVmZXJCZWxvdyA/IHNlbGVjdGlvbi5nZXRFbmRQb3NpdGlvbigpIDogc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHR0aGlzLl9zaG93KFJhbmdlLmxpZnQoc2VsZWN0aW9uKSwgYW5jaG9yUG9zaXRpb24sIHByZWZlckJlbG93KTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3cocmFuZ2U6IFJhbmdlLCBhbmNob3JQb3NpdGlvbjogUG9zaXRpb24sIHByZWZlckJlbG93OiBib29sZWFuLCBmb2N1c0lucHV0ID0gZmFsc2UpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9lbnN1cmVXaWRnZXQoKTtcblx0XHR0aGlzLl9jbGVhckhvdmVyR2x5cGgoKTtcblxuXHRcdGlmICghdGhpcy5fdmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcldpZGdldExpc3RlbmVycyh3aWRnZXQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Bpbm5lZFJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy5fYW5jaG9yUG9zaXRpb24gPSBhbmNob3JQb3NpdGlvbjtcblx0XHR0aGlzLl9wcmVmZXJCZWxvdyA9IHByZWZlckJlbG93O1xuXHRcdHdpZGdldC5zZXRQbGFjZWhvbGRlcih0aGlzLl9nZXRQbGFjZWhvbGRlcigpKTtcblx0XHR3aWRnZXQuY2xlYXJJbnB1dCgpO1xuXHRcdHdpZGdldC5zaG93KCk7XG5cdFx0dGhpcy5fdXBkYXRlUG9zaXRpb24oKTtcblx0XHRpZiAoZm9jdXNJbnB1dCkge1xuXHRcdFx0d2lkZ2V0LmlucHV0RWxlbWVudC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFBsYWNlaG9sZGVyKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBoYXNDaGFuZ2VzID0gISFtb2RlbCAmJiAodGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuZ2V0U2Vzc2lvbkZvckZpbGUobW9kZWwudXJpKT8uY2hhbmdlcy5nZXQoKS5sZW5ndGggPz8gMCkgPiAwO1xuXHRcdHJldHVybiBoYXNDaGFuZ2VzXG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLmFkZEZlZWRiYWNrJywgXCJBZGQgRmVlZGJhY2tcIilcblx0XHRcdDogbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suYWRkQ29tbWVudCcsIFwiQWRkIENvbW1lbnRcIik7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Zpc2libGUgPSBmYWxzZTtcblx0XHR0aGlzLl9waW5uZWRSYW5nZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9hbmNob3JQb3NpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93aWRnZXRMaXN0ZW5lcnMuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLl93aWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5oaWRlKCk7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0UG9zaXRpb24obnVsbCk7XG5cdFx0XHR0aGlzLl93aWRnZXQuY2xlYXJJbnB1dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhc0lucHV0VGV4dCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl93aWRnZXQgJiYgdGhpcy5fd2lkZ2V0LmlucHV0RWxlbWVudC52YWx1ZS50cmltKCkubGVuZ3RoID4gMDtcblx0fVxuXG5cdHNob3dBdEN1cnJlbnRMaW5lKGZvY3VzSW5wdXQgPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nob3dBdExpbmUocG9zaXRpb24ubGluZU51bWJlciwgZm9jdXNJbnB1dCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93QXRMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgZm9jdXNJbnB1dDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlICYmIHRoaXMuX2hhc0lucHV0VGV4dCgpKSB7XG5cdFx0XHR0aGlzLmZvY3VzSW5wdXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwgfHwgbGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX2dldFNlc3Npb25Gb3JNb2RlbCgpO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHR0aGlzLl9zaG93KG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKSwgbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpLCB0cnVlLCBmb2N1c0lucHV0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWxlY3QgdGhlIHdob2xlIGxpbmUgYXMgYSByZXN1bHQgb2YgY2xpY2tpbmcgdGhlIGd1dHRlciBnbHlwaC4gU2VsZWN0aW5nXG5cdCAqIHRoZSBsaW5lIHRyaWdnZXJzIHRoZSBzZWxlY3Rpb24tY2hhbmdlIGhhbmRsZXIgd2hpY2ggb3BlbnMgdGhlIGZlZWRiYWNrXG5cdCAqIGlucHV0IGF1dG9tYXRpY2FsbHksIHNvIHdlIGRvbid0IG9wZW4gaXQgZGlyZWN0bHkgaGVyZS4gRW1wdHkgbGluZXMgYXJlXG5cdCAqIGlnbm9yZWQgYXMgdGhlcmUgaXMgbm90aGluZyB0byBnaXZlIGZlZWRiYWNrIG9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2VsZWN0TGluZShsaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlzaWJsZSAmJiB0aGlzLl9oYXNJbnB1dFRleHQoKSkge1xuXHRcdFx0dGhpcy5mb2N1c0lucHV0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsIHx8IGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHRoZSBzZWxlY3Rpb24gYmVmb3JlIGZvY3VzaW5nOiB0aGUgc2VsZWN0aW9uIGNoYW5nZSB3aGlsZSB0aGVcblx0XHQvLyBlZGl0b3IgaXMgdW5mb2N1c2VkIGlzIGlnbm9yZWQsIHRoZW4gZm9jdXNpbmcgcmUtZXZhbHVhdGVzIHRoZVxuXHRcdC8vIHNlbGVjdGlvbiBhbmQgb3BlbnMgdGhlIGlucHV0IGZvciB0aGUgZnJlc2hseSBzZWxlY3RlZCBsaW5lLlxuXHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbihsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKSk7XG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cblx0XHQvLyBGb2N1c2luZyB0aGUgZWRpdG9yIHN5bmNocm9ub3VzbHkgb3BlbnMgdGhlIGlucHV0IHZpYSB0aGVcblx0XHQvLyBzZWxlY3Rpb24tY2hhbmdlIGhhbmRsZXIsIHNvIG1vdmUgZm9jdXMgaW50byBpdCBub3cgdGhhdCBpdCBpc1xuXHRcdC8vIHZpc2libGUuIFRoaXMgbGV0cyB0aGUgdXNlciB0eXBlIGZlZWRiYWNrIGltbWVkaWF0ZWx5IGFmdGVyIGNsaWNraW5nXG5cdFx0Ly8gdGhlIGd1dHRlciBnbHlwaCB3aXRob3V0IGhhdmluZyB0byBjbGljayB0aGUgaW5wdXQgZmlyc3QuXG5cdFx0dGhpcy5mb2N1c0lucHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTZXNzaW9uRm9yTW9kZWwoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwgfHwgIXRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQpKSB7XG5cdFx0XHR0aGlzLl9oYXNBZ2VudEZlZWRiYWNrU2Vzc2lvbkNvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLmdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKG1vZGVsLnVyaSk7XG5cdFx0dGhpcy5faGFzQWdlbnRGZWVkYmFja1Nlc3Npb25Db250ZXh0LnNldCghIXNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdHJldHVybiBzZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZSB0aGUgd2lkZ2V0IHVubGVzcyB0aGUgdXNlciBoYXMgdHlwZWQgdGV4dC4gV2hlbiB0ZXh0IGlzIHByZXNlbnQgdGhlXG5cdCAqIHdpZGdldCBpcyBwcmVzZXJ2ZWQgc28gdGhlIHVzZXIgZG9lcyBub3QgbG9zZSB0aGVpciBpbi1wcm9ncmVzcyBmZWVkYmFjaztcblx0ICogdGhleSBjYW4gY2xvc2UgaXQgZXhwbGljaXRseSB2aWEgRXNjLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXV0b0hpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hhc0lucHV0VGV4dCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hpZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyV2lkZ2V0TGlzdGVuZXJzKHdpZGdldDogQWdlbnRGZWVkYmFja0lucHV0V2lkZ2V0KTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0TGlzdGVuZXJzLmNsZWFyKCk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGtleWRvd24gb24gdGhlIGVkaXRvciBkb20gbm9kZSB0byBkZXRlY3Qgd2hlbiB0aGUgdXNlciBzdGFydHMgdHlwaW5nXG5cdFx0Y29uc3QgZWRpdG9yRG9tTm9kZSA9IHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCk7XG5cdFx0aWYgKGVkaXRvckRvbU5vZGUpIHtcblx0XHRcdHRoaXMuX3dpZGdldExpc3RlbmVycy5hZGQoYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoZWRpdG9yRG9tTm9kZSwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gT25seSBzdGVhbCBmb2N1cyB3aGVuIHRoZSBlZGl0b3IgdGV4dCBhcmVhIGl0c2VsZiBpcyBmb2N1c2VkLFxuXHRcdFx0XHQvLyBub3Qgd2hlbiBhbiBvdmVybGF5IHdpZGdldCAoZS5nLiBmaW5kIHdpZGdldCkgaGFzIGZvY3VzXG5cdFx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRG9uJ3QgZm9jdXMgaWYgYSBtb2RpZmllciBrZXkgaXMgcHJlc3NlZCBhbG9uZVxuXHRcdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkN0cmwgfHwgZS5rZXlDb2RlID09PSBLZXlDb2RlLlNoaWZ0IHx8IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5BbHQgfHwgZS5rZXlDb2RlID09PSBLZXlDb2RlLk1ldGEpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEb24ndCBjYXB0dXJlIEVzY2FwZSBhdCB0aGlzIGxldmVsIC0gbGV0IGl0IGZhbGwgdGhyb3VnaCB0byB0aGUgaW5wdXQgaGFuZGxlciBpZiBmb2N1c2VkXG5cdFx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5faGlkZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEN0cmwrSSAvIENtZCtJIGV4cGxpY2l0bHkgZm9jdXNlcyB0aGUgZmVlZGJhY2sgaW5wdXRcblx0XHRcdFx0aWYgKChlLmN0cmxLZXkgfHwgZS5tZXRhS2V5KSAmJiBlLmtleUNvZGUgPT09IEtleUNvZGUuS2V5SSkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHdpZGdldC5pbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEb24ndCBmb2N1cyBpZiBhbnkgbW9kaWZpZXIgaXMgaGVsZCAoa2V5Ym9hcmQgc2hvcnRjdXRzKVxuXHRcdFx0XHRpZiAoZS5jdHJsS2V5IHx8IGUuYWx0S2V5IHx8IGUubWV0YUtleSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEtlZXAgY2FyZXQvbmF2aWdhdGlvbiBrZXlzIGluIHRoZSBlZGl0b3IuIE9ubHkgYWN0dWFsIHR5cGluZyBzaG91bGQgbW92ZSBmb2N1cy5cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGUua2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93XG5cdFx0XHRcdFx0fHwgZS5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvd1xuXHRcdFx0XHRcdHx8IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5MZWZ0QXJyb3dcblx0XHRcdFx0XHR8fCBlLmtleUNvZGUgPT09IEtleUNvZGUuUmlnaHRBcnJvd1xuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IGF1dG8tZm9jdXMgdGhlIGlucHV0IG9uIHR5cGluZyB3aGVuIHRoZSBkb2N1bWVudCBpcyByZWFkb25seTtcblx0XHRcdFx0Ly8gd2hlbiBlZGl0YWJsZSB0aGUgdXNlciBtdXN0IGNsaWNrIG9yIHVzZSBDdHJsK0kgdG8gZm9jdXMuXG5cdFx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIGlucHV0IGlzIG5vdCBmb2N1c2VkLCBmb2N1cyBpdCBhbmQgbGV0IHRoZSBrZXlzdHJva2UgZ28gdGhyb3VnaFxuXHRcdFx0XHRpZiAoZ2V0V2luZG93KHdpZGdldC5pbnB1dEVsZW1lbnQpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgIT09IHdpZGdldC5pbnB1dEVsZW1lbnQpIHtcblx0XHRcdFx0XHR3aWRnZXQuaW5wdXRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGtleWRvd24gb24gdGhlIGlucHV0IGVsZW1lbnRcblx0XHR0aGlzLl93aWRnZXRMaXN0ZW5lcnMuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHdpZGdldC5pbnB1dEVsZW1lbnQsICdrZXlkb3duJywgZSA9PiB7XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2hpZGUoKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiBlLmFsdEtleSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2FkZEZlZWRiYWNrQW5kU3VibWl0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2FkZEZlZWRiYWNrKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTdG9wIHByb3BhZ2F0aW9uIG9mIGlucHV0IGV2ZW50cyBzbyB0aGUgZWRpdG9yIGRvZXNuJ3QgaGFuZGxlIHRoZW1cblx0XHR0aGlzLl93aWRnZXRMaXN0ZW5lcnMuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHdpZGdldC5pbnB1dEVsZW1lbnQsICdrZXlwcmVzcycsIGUgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHQvLyBBdXRvLXNpemUgdGhlIHRleHRhcmVhIGFzIHRoZSB1c2VyIHR5cGVzXG5cdFx0dGhpcy5fd2lkZ2V0TGlzdGVuZXJzLmFkZChhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih3aWRnZXQuaW5wdXRFbGVtZW50LCAnaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHR3aWRnZXQuYXV0b1NpemUoKTtcblx0XHRcdHdpZGdldC51cGRhdGVBY3Rpb25FbmFibGVkKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVQb3NpdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhpZGUgd2hlbiBpbnB1dCBsb3NlcyBmb2N1cyB0byBzb21ldGhpbmcgb3V0c2lkZSBib3RoIGVkaXRvciBhbmQgd2lkZ2V0XG5cdFx0dGhpcy5fd2lkZ2V0TGlzdGVuZXJzLmFkZChhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih3aWRnZXQuaW5wdXRFbGVtZW50LCAnYmx1cicsICgpID0+IHtcblx0XHRcdGNvbnN0IHdpbiA9IGdldFdpbmRvdyh3aWRnZXQuaW5wdXRFbGVtZW50KTtcblx0XHRcdHdpbi5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hdXRvSGlkZSgpO1xuXHRcdFx0fSwgMCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Zm9jdXNJbnB1dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlzaWJsZSAmJiB0aGlzLl93aWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5pbnB1dEVsZW1lbnQuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlQW5kUmVmb2N1c0VkaXRvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9zdXBwcmVzc1NlbGVjdGlvbkNoYW5nZU9uY2UgPSB0cnVlO1xuXHRcdHRoaXMuX2hpZGUoKTtcblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZEZlZWRiYWNrKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHRoaXMuX3dpZGdldC5pbnB1dEVsZW1lbnQudmFsdWUudHJpbSgpO1xuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fcGlubmVkUmFuZ2UgPz8gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFyYW5nZSB8fCAhbW9kZWwgfHwgIXRoaXMuX3Nlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLmFkZEZlZWRiYWNrKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgbW9kZWwudXJpLCByYW5nZSwgdGV4dCwgdW5kZWZpbmVkLCBjcmVhdGVBZ2VudEZlZWRiYWNrQ29udGV4dCh0aGlzLl9lZGl0b3IsIHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLCBtb2RlbC51cmksIHJhbmdlKSk7XG5cdFx0dGhpcy5faGlkZUFuZFJlZm9jdXNFZGl0b3IoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZEZlZWRiYWNrQW5kU3VibWl0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHRoaXMuX3dpZGdldC5pbnB1dEVsZW1lbnQudmFsdWUudHJpbSgpO1xuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fcGlubmVkUmFuZ2UgPz8gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFyYW5nZSB8fCAhbW9kZWwgfHwgIXRoaXMuX3Nlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3Nlc3Npb25SZXNvdXJjZTtcblx0XHR0aGlzLl9oaWRlQW5kUmVmb2N1c0VkaXRvcigpO1xuXHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLmFkZEZlZWRiYWNrQW5kU3VibWl0KHNlc3Npb25SZXNvdXJjZSwgbW9kZWwudXJpLCByYW5nZSwgdGV4dCwgdW5kZWZpbmVkLCBjcmVhdGVBZ2VudEZlZWRiYWNrQ29udGV4dCh0aGlzLl9lZGl0b3IsIHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLCBtb2RlbC51cmksIHJhbmdlKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVQb3NpdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3dpZGdldCB8fCAhdGhpcy5fdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCB3aWRnZXREb20gPSB0aGlzLl93aWRnZXQuZ2V0RG9tTm9kZSgpO1xuXHRcdGNvbnN0IHdpZGdldEhlaWdodCA9IHdpZGdldERvbS5vZmZzZXRIZWlnaHQgfHwgMzA7XG5cdFx0Y29uc3Qgd2lkZ2V0V2lkdGggPSB3aWRnZXREb20ub2Zmc2V0V2lkdGggfHwgMTUwO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZ2V0UG9zaXRpb25pbmdUYXJnZXQoKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhpcy5fYXV0b0hpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxlZFBvc2l0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNjcm9sbGVkVmlzaWJsZVBvc2l0aW9uKHRhcmdldC5hbmNob3JQb3NpdGlvbik7XG5cdFx0aWYgKCFzY3JvbGxlZFBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0UG9zaXRpb24obnVsbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcHV0ZSB2ZXJ0aWNhbCBwb3NpdGlvbiwgZmxpcHBpbmcgaWYgb3V0IG9mIGJvdW5kc1xuXHRcdGxldCB0b3A6IG51bWJlcjtcblx0XHRpZiAodGFyZ2V0LnByZWZlckJlbG93KSB7XG5cdFx0XHQvLyBDdXJzb3IgYXQgZW5kIChib3R0b20pIG9mIHNlbGVjdGlvbiBcdTIxOTIgcHJlZmVyIGJlbG93IHRoZSBjdXJzb3IgbGluZVxuXHRcdFx0dG9wID0gc2Nyb2xsZWRQb3NpdGlvbi50b3AgKyBsaW5lSGVpZ2h0O1xuXHRcdFx0aWYgKHRvcCArIHdpZGdldEhlaWdodCA+IGxheW91dEluZm8uaGVpZ2h0KSB7XG5cdFx0XHRcdC8vIE5vdCBlbm91Z2ggc3BhY2UgYmVsb3cgXHUyMTkyIHBsYWNlIGFib3ZlIHRoZSBjdXJzb3IgbGluZVxuXHRcdFx0XHR0b3AgPSBzY3JvbGxlZFBvc2l0aW9uLnRvcCAtIHdpZGdldEhlaWdodDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ3Vyc29yIGF0IHN0YXJ0ICh0b3ApIG9mIHNlbGVjdGlvbiBcdTIxOTIgcHJlZmVyIGFib3ZlIHRoZSBjdXJzb3IgbGluZVxuXHRcdFx0dG9wID0gc2Nyb2xsZWRQb3NpdGlvbi50b3AgLSB3aWRnZXRIZWlnaHQ7XG5cdFx0XHRpZiAodG9wIDwgMCkge1xuXHRcdFx0XHQvLyBOb3QgZW5vdWdoIHNwYWNlIGFib3ZlIFx1MjE5MiBwbGFjZSBiZWxvdyB0aGUgY3Vyc29yIGxpbmVcblx0XHRcdFx0dG9wID0gc2Nyb2xsZWRQb3NpdGlvbi50b3AgKyBsaW5lSGVpZ2h0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENsYW1wIHZlcnRpY2FsIHBvc2l0aW9uIHdpdGhpbiBlZGl0b3IgYm91bmRzXG5cdFx0dG9wID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odG9wLCBsYXlvdXRJbmZvLmhlaWdodCAtIHdpZGdldEhlaWdodCkpO1xuXG5cdFx0Ly8gQ2xhbXAgaG9yaXpvbnRhbCBwb3NpdGlvbiBzbyB0aGUgd2lkZ2V0IHN0YXlzIHdpdGhpbiB0aGUgZWRpdG9yIGFuZFxuXHRcdC8vIG5ldmVyIHJlbmRlcnMgb24gdG9wIG9mIHRoZSBsaW5lIG51bWJlcnMvZ2x5cGggbWFyZ2luIChjb250ZW50IGxlZnQpLlxuXHRcdC8vIFdoZW4gdGhlIGVkaXRvciBpcyBzY3JvbGxlZCBob3Jpem9udGFsbHkgdGhlIGN1cnNvciBwb3NpdGlvbiBjYW4gZmFsbFxuXHRcdC8vIGJlaGluZCB0aGUgY29udGVudCBhcmVhLCBzbyBzdGljayB0aGUgd2lkZ2V0IHRvIHRoZSBjb250ZW50IGxlZnQgZWRnZS5cblx0XHQvLyBHdWFyZCB0aGF0IHRoZSBsZWZ0IGVkZ2UgKGNvbnRlbnQgbGVmdCkgbmV2ZXIgZXhjZWVkcyB0aGUgcmlnaHQtbW9zdFxuXHRcdC8vIHZhbGlkIHBvc2l0aW9uLCBvdGhlcndpc2UgdGhlIHdpZGdldCB3b3VsZCBvdmVyZmxvdyB0aGUgZWRpdG9yJ3MgcmlnaHRcblx0XHQvLyBlZGdlIG9uIHZlcnkgbmFycm93IGVkaXRvcnMgb3Igd2l0aCBhIHdpZGUgd2lkZ2V0LlxuXHRcdGNvbnN0IG1pbkxlZnQgPSBsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0O1xuXHRcdGNvbnN0IG1heExlZnQgPSBNYXRoLm1heChtaW5MZWZ0LCBsYXlvdXRJbmZvLndpZHRoIC0gd2lkZ2V0V2lkdGgpO1xuXHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1heChtaW5MZWZ0LCBNYXRoLm1pbihzY3JvbGxlZFBvc2l0aW9uLmxlZnQsIG1heExlZnQpKTtcblxuXHRcdHRoaXMuX3dpZGdldC5zZXRQb3NpdGlvbih7IHByZWZlcmVuY2U6IHsgdG9wLCBsZWZ0IH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQb3NpdGlvbmluZ1RhcmdldCgpOiB7IGFuY2hvclBvc2l0aW9uOiBQb3NpdGlvbjsgcHJlZmVyQmVsb3c6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3Bpbm5lZFJhbmdlICYmIHRoaXMuX2FuY2hvclBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBhbmNob3JQb3NpdGlvbjogdGhpcy5fYW5jaG9yUG9zaXRpb24sIHByZWZlckJlbG93OiB0aGlzLl9wcmVmZXJCZWxvdyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbiB8fCBzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZWZlckJlbG93ID0gc2VsZWN0aW9uLmdldERpcmVjdGlvbigpID09PSBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhbmNob3JQb3NpdGlvbjogcHJlZmVyQmVsb3cgPyBzZWxlY3Rpb24uZ2V0RW5kUG9zaXRpb24oKSA6IHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCksXG5cdFx0XHRwcmVmZXJCZWxvdyxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlT3ZlcmxheVdpZGdldCh0aGlzLl93aWRnZXQpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3dpZGdldCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEFkZEZlZWRiYWNrQXRDdXJyZW50TGluZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBhZGRGZWVkYmFja0F0Q3VycmVudExpbmVBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FnZW50RmVlZGJhY2suYWRkQXRDdXJyZW50TGluZScsICdBZGQgRmVlZGJhY2sgYXQgQ3VycmVudCBMaW5lJyksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBoYXNBZ2VudEZlZWRiYWNrU2Vzc2lvbkZvckVkaXRvciksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgaGFzQWdlbnRGZWVkYmFja1Nlc3Npb25Gb3JFZGl0b3IpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvZGVFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKSA/PyBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gZWRpdG9yPy5nZXRDb250cmlidXRpb248QWdlbnRGZWVkYmFja0VkaXRvcklucHV0Q29udHJpYnV0aW9uPihBZ2VudEZlZWRiYWNrRWRpdG9ySW5wdXRDb250cmlidXRpb24uSUQpO1xuXHRcdGNvbnRyaWJ1dGlvbj8uc2hvd0F0Q3VycmVudExpbmUodHJ1ZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKEFkZEZlZWRiYWNrQXRDdXJyZW50TGluZUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihBZ2VudEZlZWRiYWNrRWRpdG9ySW5wdXRDb250cmlidXRpb24uSUQsIEFnZW50RmVlZGJhY2tFZGl0b3JJbnB1dENvbnRyaWJ1dGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUyxpQ0FBaUMsa0NBQWtDO0FBQzVFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMs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
