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
import { Color } from "../../../../base/common/color.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { isCodeEditor, MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { Range } from "../../../../editor/common/core/range.js";
import * as languages from "../../../../editor/common/languages.js";
import { ZoneWidget } from "../../../../editor/contrib/zoneWidget/browser/zoneWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { CommentGlyphWidget } from "./commentGlyphWidget.js";
import { ICommentService } from "./commentService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { CommentThreadWidget } from "./commentThreadWidget.js";
import { commentThreadStateBackgroundColorVar, commentThreadStateColorVar, getCommentThreadStateBorderColor } from "./commentColors.js";
import { peekViewBorder } from "../../../../editor/contrib/peekView/browser/peekView.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { StableEditorScrollState } from "../../../../editor/browser/stableEditorScroll.js";
import Severity from "../../../../base/common/severity.js";
import * as nls from "../../../../nls.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
function getCommentThreadWidgetStateColor(thread, theme) {
  return getCommentThreadStateBorderColor(thread, theme) ?? theme.getColor(peekViewBorder);
}
function commentThreadHasDraft(commentThread) {
  const comments = commentThread.comments;
  if (!comments) {
    return false;
  }
  return comments.some((comment) => comment.state === languages.CommentState.Draft);
}
var CommentWidgetFocus = /* @__PURE__ */ ((CommentWidgetFocus2) => {
  CommentWidgetFocus2[CommentWidgetFocus2["None"] = 0] = "None";
  CommentWidgetFocus2[CommentWidgetFocus2["Widget"] = 1] = "Widget";
  CommentWidgetFocus2[CommentWidgetFocus2["Editor"] = 2] = "Editor";
  return CommentWidgetFocus2;
})(CommentWidgetFocus || {});
function parseMouseDownInfoFromEvent(e) {
  const range = e.target.range;
  if (!range) {
    return null;
  }
  if (!e.event.leftButton) {
    return null;
  }
  if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
    return null;
  }
  const data = e.target.detail;
  const gutterOffsetX = data.offsetX - data.glyphMarginWidth - data.lineNumbersWidth - data.glyphMarginLeft;
  if (gutterOffsetX > 20) {
    return null;
  }
  return { lineNumber: range.startLineNumber };
}
function isMouseUpEventDragFromMouseDown(mouseDownInfo, e) {
  if (!mouseDownInfo) {
    return null;
  }
  const { lineNumber } = mouseDownInfo;
  const range = e.target.range;
  if (!range) {
    return null;
  }
  return lineNumber;
}
function isMouseUpEventMatchMouseDown(mouseDownInfo, e) {
  if (!mouseDownInfo) {
    return null;
  }
  const { lineNumber } = mouseDownInfo;
  const range = e.target.range;
  if (!range || range.startLineNumber !== lineNumber) {
    return null;
  }
  if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
    return null;
  }
  return lineNumber;
}
let ReviewZoneWidget = class extends ZoneWidget {
  constructor(editor, _uniqueOwner, _commentThread, _pendingComment, _pendingEdits, instantiationService, themeService, commentService, contextKeyService, configurationService, dialogService) {
    super(editor, { keepEditorSelection: true, isAccessible: true, showArrow: !!_commentThread.range });
    this._uniqueOwner = _uniqueOwner;
    this._commentThread = _commentThread;
    this._pendingComment = _pendingComment;
    this._pendingEdits = _pendingEdits;
    this.themeService = themeService;
    this.commentService = commentService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this._onDidClose = new Emitter();
    this._onDidCreateThread = new Emitter();
    this._onDidChangeExpandedState = new Emitter();
    this._globalToDispose = new DisposableStore();
    this._commentThreadDisposables = [];
    this._contextKeyService = this._globalToDispose.add(contextKeyService.createScoped(this.domNode));
    this._scopedInstantiationService = this._globalToDispose.add(instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this._contextKeyService]
    )));
    const controller = this.commentService.getCommentController(this._uniqueOwner);
    if (controller) {
      this._commentOptions = controller.options;
    }
    this._initialCollapsibleState = _pendingComment ? languages.CommentThreadCollapsibleState.Expanded : _commentThread.initialCollapsibleState;
    _commentThread.initialCollapsibleState = this._initialCollapsibleState;
    this._commentThreadDisposables = [];
    this.create();
    this._globalToDispose.add(this.themeService.onDidColorThemeChange(this._applyTheme, this));
    this._globalToDispose.add(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._applyTheme();
      }
    }));
    this._applyTheme();
  }
  get uniqueOwner() {
    return this._uniqueOwner;
  }
  get commentThread() {
    return this._commentThread;
  }
  get expanded() {
    return this._isExpanded;
  }
  get onDidClose() {
    return this._onDidClose.event;
  }
  get onDidCreateThread() {
    return this._onDidCreateThread.event;
  }
  get onDidChangeExpandedState() {
    return this._onDidChangeExpandedState.event;
  }
  getPosition() {
    if (this.position) {
      return this.position;
    }
    if (this._commentGlyph) {
      return this._commentGlyph.getPosition().position ?? void 0;
    }
    return void 0;
  }
  revealRange() {
  }
  reveal(commentUniqueId, focus = 0 /* None */) {
    this.makeVisible(commentUniqueId, focus);
    const comment = this._commentThread.comments?.find((comment2) => comment2.uniqueIdInThread === commentUniqueId) ?? this._commentThread.comments?.[0];
    this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread, comment });
  }
  _expandAndShowZoneWidget() {
    if (!this._isExpanded) {
      this.show(this.arrowPosition(this._commentThread.range), 2);
    }
  }
  _setFocus(commentUniqueId, focus) {
    if (focus === 1 /* Widget */) {
      this._commentThreadWidget.focus(commentUniqueId);
    } else if (focus === 2 /* Editor */) {
      this._commentThreadWidget.focusCommentEditor();
    }
  }
  _goToComment(commentUniqueId, focus) {
    const height = this.editor.getLayoutInfo().height;
    const coords = this._commentThreadWidget.getCommentCoords(commentUniqueId);
    if (coords) {
      let scrollTop = 1;
      if (this._commentThread.range) {
        const commentThreadCoords = coords.thread;
        const commentCoords = coords.comment;
        scrollTop = this.editor.getTopForLineNumber(this._commentThread.range.startLineNumber) - height / 2 + commentCoords.top - commentThreadCoords.top;
      }
      this.editor.setScrollTop(scrollTop);
      this._setFocus(commentUniqueId, focus);
    } else {
      this._goToThread(focus);
    }
  }
  _goToThread(focus) {
    const rangeToReveal = this._commentThread.range ? new Range(this._commentThread.range.startLineNumber, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + 1, 1) : new Range(1, 1, 1, 1);
    this.editor.revealRangeInCenter(rangeToReveal);
    this._setFocus(void 0, focus);
  }
  makeVisible(commentUniqueId, focus = 0 /* None */) {
    this._expandAndShowZoneWidget();
    if (commentUniqueId !== void 0) {
      this._goToComment(commentUniqueId, focus);
    } else {
      this._goToThread(focus);
    }
  }
  getPendingComments() {
    return {
      newComment: this._commentThreadWidget.getPendingComment(),
      edits: this._commentThreadWidget.getPendingEdits()
    };
  }
  setPendingComment(pending) {
    this._pendingComment = pending;
    this.expand();
    this._commentThreadWidget.setPendingComment(pending);
  }
  _fillContainer(container) {
    this.setCssClass("review-widget");
    this._commentThreadWidget = this._scopedInstantiationService.createInstance(
      CommentThreadWidget,
      container,
      this.editor,
      this._uniqueOwner,
      this.editor.getModel().uri,
      this._contextKeyService,
      this._scopedInstantiationService,
      this._commentThread,
      this._pendingComment,
      this._pendingEdits,
      { context: this.editor },
      this._commentOptions,
      {
        actionRunner: async () => {
          if (!this._commentThread.comments || !this._commentThread.comments.length) {
            const newPosition = this.getPosition();
            if (newPosition) {
              const originalRange = this._commentThread.range;
              if (!originalRange) {
                return;
              }
              let range;
              if (newPosition.lineNumber !== originalRange.endLineNumber) {
                const distance = newPosition.lineNumber - originalRange.endLineNumber;
                range = new Range(originalRange.startLineNumber + distance, originalRange.startColumn, originalRange.endLineNumber + distance, originalRange.endColumn);
              } else {
                range = new Range(originalRange.startLineNumber, originalRange.startColumn, originalRange.endLineNumber, originalRange.endColumn);
              }
              await this.commentService.updateCommentThreadTemplate(this.uniqueOwner, this._commentThread.commentThreadHandle, range);
            }
          }
        },
        collapse: () => {
          return this.collapse(true);
        }
      }
    );
    this._disposables.add(this._commentThreadWidget);
  }
  arrowPosition(range) {
    if (!range) {
      return void 0;
    }
    return { lineNumber: range.endLineNumber, column: range.endLineNumber === range.startLineNumber ? (range.startColumn + range.endColumn + 1) / 2 : 1 };
  }
  deleteCommentThread() {
    this.dispose();
    this.commentService.disposeCommentThread(this.uniqueOwner, this._commentThread.threadId);
  }
  doCollapse() {
    this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
  }
  async collapse(confirm = false) {
    if (!confirm || await this.confirmCollapse()) {
      this.doCollapse();
      return true;
    } else {
      return false;
    }
  }
  async confirmCollapse() {
    const confirmSetting = this.configurationService.getValue("comments.thread.confirmOnCollapse");
    if (confirmSetting === "whenHasUnsubmittedComments" && this._commentThreadWidget.hasUnsubmittedComments) {
      const result = await this.dialogService.confirm({
        message: nls.localize("confirmCollapse", "Collapsing this comment thread will discard unsubmitted comments. Are you sure you want to discard these comments?"),
        primaryButton: nls.localize("discard", "Discard"),
        type: Severity.Warning,
        checkbox: { label: nls.localize("neverAskAgain", "Never ask me again"), checked: false }
      });
      if (result.checkboxChecked) {
        await this.configurationService.updateValue("comments.thread.confirmOnCollapse", "never");
      }
      return result.confirmed;
    }
    return true;
  }
  expand(setActive) {
    this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
    if (setActive) {
      this.commentService.setActiveCommentAndThread(this.uniqueOwner, { thread: this._commentThread });
    }
  }
  getGlyphPosition() {
    if (this._commentGlyph) {
      return this._commentGlyph.getPosition().position.lineNumber;
    }
    return 0;
  }
  async update(commentThread) {
    if (this._commentThread !== commentThread) {
      this._commentThreadDisposables.forEach((disposable) => disposable.dispose());
      this._commentThread = commentThread;
      this._commentThreadDisposables = [];
      this.bindCommentThreadListeners();
    }
    await this._commentThreadWidget.updateCommentThread(commentThread);
    const lineNumber = this._commentThread.range?.endLineNumber ?? 1;
    let shouldMoveWidget = false;
    if (this._commentGlyph) {
      const hasDraft = commentThreadHasDraft(commentThread);
      this._commentGlyph.setThreadState(commentThread.state, hasDraft);
      if (this._commentGlyph.getPosition().position.lineNumber !== lineNumber) {
        shouldMoveWidget = true;
        this._commentGlyph.setLineNumber(lineNumber);
      }
    }
    if (shouldMoveWidget && this._isExpanded || this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
      this.show(this.arrowPosition(this._commentThread.range), 2);
    } else if (this._commentThread.collapsibleState !== languages.CommentThreadCollapsibleState.Expanded) {
      this.hide();
    }
  }
  _onWidth(widthInPixel) {
    this._commentThreadWidget.layout(widthInPixel);
  }
  _doLayout(heightInPixel, widthInPixel) {
    this._commentThreadWidget.layout(widthInPixel);
  }
  async display(range, shouldReveal) {
    if (range) {
      this._commentGlyph = new CommentGlyphWidget(this.editor, range?.endLineNumber ?? -1);
      const hasDraft = commentThreadHasDraft(this._commentThread);
      this._commentGlyph.setThreadState(this._commentThread.state, hasDraft);
      this._globalToDispose.add(this._commentGlyph.onDidChangeLineNumber(async (e) => {
        if (!this._commentThread.range) {
          return;
        }
        const shift = e - this._commentThread.range.endLineNumber;
        const newRange = new Range(this._commentThread.range.startLineNumber + shift, this._commentThread.range.startColumn, this._commentThread.range.endLineNumber + shift, this._commentThread.range.endColumn);
        this._commentThread.range = newRange;
      }));
    }
    await this._commentThreadWidget.display(this.editor.getOption(EditorOption.lineHeight), shouldReveal);
    this._disposables.add(this._commentThreadWidget.onDidResize((dimension) => {
      this._refresh(dimension);
    }));
    if (this._commentThread.collapsibleState === languages.CommentThreadCollapsibleState.Expanded) {
      this.show(this.arrowPosition(range), 2);
    }
    if (shouldReveal) {
      this.makeVisible();
    }
    this.bindCommentThreadListeners();
  }
  bindCommentThreadListeners() {
    this._commentThreadDisposables.push(this._commentThread.onDidChangeComments(async (_) => {
      await this.update(this._commentThread);
    }));
    this._commentThreadDisposables.push(this._commentThread.onDidChangeCollapsibleState((state) => {
      if (state === languages.CommentThreadCollapsibleState.Expanded && !this._isExpanded) {
        this.show(this.arrowPosition(this._commentThread.range), 2);
        this._commentThreadWidget.ensureFocusIntoNewEditingComment();
        return;
      }
      if (state === languages.CommentThreadCollapsibleState.Collapsed && this._isExpanded) {
        this.hide();
        return;
      }
    }));
    if (this._initialCollapsibleState === void 0) {
      const onDidChangeInitialCollapsibleState = this._commentThread.onDidChangeInitialCollapsibleState((state) => {
        this._initialCollapsibleState = state;
        this._commentThread.collapsibleState = this._initialCollapsibleState;
        onDidChangeInitialCollapsibleState.dispose();
      });
      this._commentThreadDisposables.push(onDidChangeInitialCollapsibleState);
    }
    this._commentThreadDisposables.push(this._commentThread.onDidChangeState(() => {
      const borderColor = getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
      this.style({
        frameColor: borderColor,
        arrowColor: borderColor
      });
      this.container?.style.setProperty(commentThreadStateColorVar, `${borderColor}`);
      this.container?.style.setProperty(commentThreadStateBackgroundColorVar, `${borderColor.transparent(0.1)}`);
    }));
  }
  async submitComment() {
    return this._commentThreadWidget.submitComment();
  }
  _refresh(dimensions) {
    if (this._isExpanded === void 0 && dimensions.height === 0 && dimensions.width === 0) {
      this.commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Collapsed;
      return;
    }
    if (this._isExpanded) {
      this._commentThreadWidget.layout();
      const headHeight = Math.ceil(this.editor.getOption(EditorOption.lineHeight) * 1.2);
      const lineHeight = this.editor.getOption(EditorOption.lineHeight);
      const arrowHeight = Math.round(lineHeight / 3);
      const frameThickness = Math.round(lineHeight / 9) * 2;
      const computedLinesNumber = Math.ceil((headHeight + dimensions.height + arrowHeight + frameThickness + 8) / lineHeight);
      if (this._viewZone?.heightInLines === computedLinesNumber) {
        return;
      }
      const currentPosition = this.getPosition();
      if (this._viewZone && currentPosition && currentPosition.lineNumber !== this._viewZone.afterLineNumber && this._viewZone.afterLineNumber !== 0) {
        this._viewZone.afterLineNumber = currentPosition.lineNumber;
      }
      const capture = StableEditorScrollState.capture(this.editor);
      this._relayout(computedLinesNumber);
      capture.restore(this.editor);
    }
  }
  _applyTheme() {
    const borderColor = getCommentThreadWidgetStateColor(this._commentThread.state, this.themeService.getColorTheme()) || Color.transparent;
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor
    });
    const fontInfo = this.editor.getOption(EditorOption.fontInfo);
    this._commentThreadWidget.applyTheme(fontInfo);
  }
  show(rangeOrPos, heightInLines) {
    const glyphPosition = this._commentGlyph?.getPosition();
    let range = Range.isIRange(rangeOrPos) ? rangeOrPos : rangeOrPos ? Range.fromPositions(rangeOrPos) : void 0;
    if (glyphPosition?.position && range && glyphPosition.position.lineNumber !== range.endLineNumber) {
      const distance = glyphPosition.position.lineNumber - range.endLineNumber;
      range = new Range(range.startLineNumber + distance, range.startColumn, range.endLineNumber + distance, range.endColumn);
    }
    const wasExpanded = this._isExpanded;
    this._isExpanded = true;
    super.show(range ?? new Range(0, 0, 0, 0), heightInLines);
    this._commentThread.collapsibleState = languages.CommentThreadCollapsibleState.Expanded;
    this._refresh(this._commentThreadWidget.getDimensions());
    if (!wasExpanded) {
      this._onDidChangeExpandedState.fire(true);
    }
  }
  async collapseAndFocusRange() {
    if (await this.collapse(true) && Range.isIRange(this.commentThread.range) && isCodeEditor(this.editor)) {
      this.editor.setSelection(this.commentThread.range);
    }
  }
  hide() {
    if (this._isExpanded) {
      this._isExpanded = false;
      if (this.editor.hasWidgetFocus()) {
        this.editor.focus();
      }
      if (!this._commentThread.comments || !this._commentThread.comments.length) {
        this.deleteCommentThread();
      }
      this._onDidChangeExpandedState.fire(false);
    }
    super.hide();
  }
  dispose() {
    super.dispose();
    if (this._commentGlyph) {
      this._commentGlyph.dispose();
      this._commentGlyph = void 0;
    }
    this._globalToDispose.dispose();
    this._commentThreadDisposables.forEach((global) => global.dispose());
    this._onDidClose.fire(void 0);
    this._onDidClose.dispose();
    this._onDidCreateThread.dispose();
    this._onDidChangeExpandedState.dispose();
  }
};
ReviewZoneWidget = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, ICommentService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IDialogService)
], ReviewZoneWidget);
export {
  CommentWidgetFocus,
  ReviewZoneWidget,
  isMouseUpEventDragFromMouseDown,
  isMouseUpEventMatchMouseDown,
  parseMouseDownInfoFromEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudFRocmVhZFpvbmVXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIGlzQ29kZUVkaXRvciwgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgWm9uZVdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3pvbmVXaWRnZXQvYnJvd3Nlci96b25lV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWVudEdseXBoV2lkZ2V0IH0gZnJvbSAnLi9jb21tZW50R2x5cGhXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9jb21tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudFRocmVhZFdpZGdldCB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50VGhyZWFkV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21tZW50VGhyZWFkV2lkZ2V0IH0gZnJvbSAnLi9jb21tZW50VGhyZWFkV2lkZ2V0LmpzJztcbmltcG9ydCB7IGNvbW1lbnRUaHJlYWRTdGF0ZUJhY2tncm91bmRDb2xvclZhciwgY29tbWVudFRocmVhZFN0YXRlQ29sb3JWYXIsIGdldENvbW1lbnRUaHJlYWRTdGF0ZUJvcmRlckNvbG9yIH0gZnJvbSAnLi9jb21tZW50Q29sb3JzLmpzJztcbmltcG9ydCB7IHBlZWtWaWV3Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc3RhYmxlRWRpdG9yU2Nyb2xsLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5cbmZ1bmN0aW9uIGdldENvbW1lbnRUaHJlYWRXaWRnZXRTdGF0ZUNvbG9yKHRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRTdGF0ZSB8IHVuZGVmaW5lZCwgdGhlbWU6IElDb2xvclRoZW1lKTogQ29sb3IgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZ2V0Q29tbWVudFRocmVhZFN0YXRlQm9yZGVyQ29sb3IodGhyZWFkLCB0aGVtZSkgPz8gdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXdCb3JkZXIpO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGEgY29tbWVudCB0aHJlYWQgaGFzIGFueSBkcmFmdCBjb21tZW50c1xuICovXG5mdW5jdGlvbiBjb21tZW50VGhyZWFkSGFzRHJhZnQoY29tbWVudFRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQpOiBib29sZWFuIHtcblx0Y29uc3QgY29tbWVudHMgPSBjb21tZW50VGhyZWFkLmNvbW1lbnRzO1xuXHRpZiAoIWNvbW1lbnRzKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBjb21tZW50cy5zb21lKGNvbW1lbnQgPT4gY29tbWVudC5zdGF0ZSA9PT0gbGFuZ3VhZ2VzLkNvbW1lbnRTdGF0ZS5EcmFmdCk7XG59XG5cbmV4cG9ydCBlbnVtIENvbW1lbnRXaWRnZXRGb2N1cyB7XG5cdE5vbmUgPSAwLFxuXHRXaWRnZXQgPSAxLFxuXHRFZGl0b3IgPSAyXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1vdXNlRG93bkluZm9Gcm9tRXZlbnQoZTogSUVkaXRvck1vdXNlRXZlbnQpIHtcblx0Y29uc3QgcmFuZ2UgPSBlLnRhcmdldC5yYW5nZTtcblxuXHRpZiAoIXJhbmdlKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRpZiAoIWUuZXZlbnQubGVmdEJ1dHRvbikge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUykge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgZGF0YSA9IGUudGFyZ2V0LmRldGFpbDtcblx0Y29uc3QgZ3V0dGVyT2Zmc2V0WCA9IGRhdGEub2Zmc2V0WCAtIGRhdGEuZ2x5cGhNYXJnaW5XaWR0aCAtIGRhdGEubGluZU51bWJlcnNXaWR0aCAtIGRhdGEuZ2x5cGhNYXJnaW5MZWZ0O1xuXG5cdC8vIGRvbid0IGNvbGxpZGUgd2l0aCBmb2xkaW5nIGFuZCBnaXQgZGVjb3JhdGlvbnNcblx0aWYgKGd1dHRlck9mZnNldFggPiAyMCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cmV0dXJuIHsgbGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vdXNlVXBFdmVudERyYWdGcm9tTW91c2VEb3duKG1vdXNlRG93bkluZm86IHsgbGluZU51bWJlcjogbnVtYmVyIH0gfCBudWxsLCBlOiBJRWRpdG9yTW91c2VFdmVudCkge1xuXHRpZiAoIW1vdXNlRG93bkluZm8pIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGNvbnN0IHsgbGluZU51bWJlciB9ID0gbW91c2VEb3duSW5mbztcblxuXHRjb25zdCByYW5nZSA9IGUudGFyZ2V0LnJhbmdlO1xuXG5cdGlmICghcmFuZ2UpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHJldHVybiBsaW5lTnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb3VzZVVwRXZlbnRNYXRjaE1vdXNlRG93bihtb3VzZURvd25JbmZvOiB7IGxpbmVOdW1iZXI6IG51bWJlciB9IHwgbnVsbCwgZTogSUVkaXRvck1vdXNlRXZlbnQpIHtcblx0aWYgKCFtb3VzZURvd25JbmZvKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCB7IGxpbmVOdW1iZXIgfSA9IG1vdXNlRG93bkluZm87XG5cblx0Y29uc3QgcmFuZ2UgPSBlLnRhcmdldC5yYW5nZTtcblxuXHRpZiAoIXJhbmdlIHx8IHJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gbGluZU51bWJlcikge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUykge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cmV0dXJuIGxpbmVOdW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBSZXZpZXdab25lV2lkZ2V0IGV4dGVuZHMgWm9uZVdpZGdldCBpbXBsZW1lbnRzIElDb21tZW50VGhyZWFkV2lkZ2V0IHtcblx0cHJpdmF0ZSBfY29tbWVudFRocmVhZFdpZGdldCE6IENvbW1lbnRUaHJlYWRXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xvc2UgPSBuZXcgRW1pdHRlcjxSZXZpZXdab25lV2lkZ2V0IHwgdW5kZWZpbmVkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENyZWF0ZVRocmVhZCA9IG5ldyBFbWl0dGVyPFJldmlld1pvbmVXaWRnZXQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRXhwYW5kZWRTdGF0ZSA9IG5ldyBFbWl0dGVyPGJvb2xlYW4+KCk7XG5cdHByaXZhdGUgX2lzRXhwYW5kZWQ/OiBib29sZWFuO1xuXHRwcml2YXRlIF9pbml0aWFsQ29sbGFwc2libGVTdGF0ZT86IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZTtcblx0cHJpdmF0ZSBfY29tbWVudEdseXBoPzogQ29tbWVudEdseXBoV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nbG9iYWxUb0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRwcml2YXRlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIF9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHB1YmxpYyBnZXQgdW5pcXVlT3duZXIoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdW5pcXVlT3duZXI7XG5cdH1cblx0cHVibGljIGdldCBjb21tZW50VGhyZWFkKCk6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWVudFRocmVhZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZXhwYW5kZWQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRXhwYW5kZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb21tZW50T3B0aW9uczogbGFuZ3VhZ2VzLkNvbW1lbnRPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSBfdW5pcXVlT3duZXI6IHN0cmluZyxcblx0XHRwcml2YXRlIF9jb21tZW50VGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZCxcblx0XHRwcml2YXRlIF9wZW5kaW5nQ29tbWVudDogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX3BlbmRpbmdFZGl0czogeyBba2V5OiBudW1iZXJdOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfSB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb21tZW50U2VydmljZSBwcml2YXRlIGNvbW1lbnRTZXJ2aWNlOiBJQ29tbWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvciwgeyBrZWVwRWRpdG9yU2VsZWN0aW9uOiB0cnVlLCBpc0FjY2Vzc2libGU6IHRydWUsIHNob3dBcnJvdzogISFfY29tbWVudFRocmVhZC5yYW5nZSB9KTtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX2dsb2JhbFRvRGlzcG9zZS5hZGQoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZG9tTm9kZSkpO1xuXG5cdFx0dGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9nbG9iYWxUb0Rpc3Bvc2UuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlXVxuXHRcdCkpKTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLmNvbW1lbnRTZXJ2aWNlLmdldENvbW1lbnRDb250cm9sbGVyKHRoaXMuX3VuaXF1ZU93bmVyKTtcblx0XHRpZiAoY29udHJvbGxlcikge1xuXHRcdFx0dGhpcy5fY29tbWVudE9wdGlvbnMgPSBjb250cm9sbGVyLm9wdGlvbnM7XG5cdFx0fVxuXG5cdFx0dGhpcy5faW5pdGlhbENvbGxhcHNpYmxlU3RhdGUgPSBfcGVuZGluZ0NvbW1lbnQgPyBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQgOiBfY29tbWVudFRocmVhZC5pbml0aWFsQ29sbGFwc2libGVTdGF0ZTtcblx0XHRfY29tbWVudFRocmVhZC5pbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9IHRoaXMuX2luaXRpYWxDb2xsYXBzaWJsZVN0YXRlO1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcyA9IFtdO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cblx0XHR0aGlzLl9nbG9iYWxUb0Rpc3Bvc2UuYWRkKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGlzLl9hcHBseVRoZW1lLCB0aGlzKSk7XG5cdFx0dGhpcy5fZ2xvYmFsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykpIHtcblx0XHRcdFx0dGhpcy5fYXBwbHlUaGVtZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9hcHBseVRoZW1lKCk7XG5cblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDbG9zZSgpOiBFdmVudDxSZXZpZXdab25lV2lkZ2V0IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2xvc2UuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ3JlYXRlVGhyZWFkKCk6IEV2ZW50PFJldmlld1pvbmVXaWRnZXQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDcmVhdGVUaHJlYWQuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlRXhwYW5kZWRTdGF0ZSgpOiBFdmVudDxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlRXhwYW5kZWRTdGF0ZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbigpOiBJUG9zaXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wb3NpdGlvbjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29tbWVudEdseXBoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29tbWVudEdseXBoLmdldFBvc2l0aW9uKCkucG9zaXRpb24gPz8gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJldmVhbFJhbmdlKCkge1xuXHRcdC8vIHdlIGRvbid0IGRvIGFueXRoaW5nIGhlcmUgYXMgd2UgYWx3YXlzIGRvIHRoZSByZXZlYWwgb3Vyc2VsdmVzLlxuXHR9XG5cblx0cHVibGljIHJldmVhbChjb21tZW50VW5pcXVlSWQ/OiBudW1iZXIsIGZvY3VzOiBDb21tZW50V2lkZ2V0Rm9jdXMgPSBDb21tZW50V2lkZ2V0Rm9jdXMuTm9uZSkge1xuXHRcdHRoaXMubWFrZVZpc2libGUoY29tbWVudFVuaXF1ZUlkLCBmb2N1cyk7XG5cdFx0Y29uc3QgY29tbWVudCA9IHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHM/LmZpbmQoY29tbWVudCA9PiBjb21tZW50LnVuaXF1ZUlkSW5UaHJlYWQgPT09IGNvbW1lbnRVbmlxdWVJZCkgPz8gdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cz8uWzBdO1xuXHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh0aGlzLnVuaXF1ZU93bmVyLCB7IHRocmVhZDogdGhpcy5fY29tbWVudFRocmVhZCwgY29tbWVudCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2V4cGFuZEFuZFNob3dab25lV2lkZ2V0KCkge1xuXHRcdGlmICghdGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5zaG93KHRoaXMuYXJyb3dQb3NpdGlvbih0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlKSwgMik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Rm9jdXMoY29tbWVudFVuaXF1ZUlkOiBudW1iZXIgfCB1bmRlZmluZWQsIGZvY3VzOiBDb21tZW50V2lkZ2V0Rm9jdXMpIHtcblx0XHRpZiAoZm9jdXMgPT09IENvbW1lbnRXaWRnZXRGb2N1cy5XaWRnZXQpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuZm9jdXMoY29tbWVudFVuaXF1ZUlkKTtcblx0XHR9IGVsc2UgaWYgKGZvY3VzID09PSBDb21tZW50V2lkZ2V0Rm9jdXMuRWRpdG9yKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0LmZvY3VzQ29tbWVudEVkaXRvcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dvVG9Db21tZW50KGNvbW1lbnRVbmlxdWVJZDogbnVtYmVyLCBmb2N1czogQ29tbWVudFdpZGdldEZvY3VzKSB7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhlaWdodDtcblx0XHRjb25zdCBjb29yZHMgPSB0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0LmdldENvbW1lbnRDb29yZHMoY29tbWVudFVuaXF1ZUlkKTtcblx0XHRpZiAoY29vcmRzKSB7XG5cdFx0XHRsZXQgc2Nyb2xsVG9wOiBudW1iZXIgPSAxO1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2UpIHtcblx0XHRcdFx0Y29uc3QgY29tbWVudFRocmVhZENvb3JkcyA9IGNvb3Jkcy50aHJlYWQ7XG5cdFx0XHRcdGNvbnN0IGNvbW1lbnRDb29yZHMgPSBjb29yZHMuY29tbWVudDtcblx0XHRcdFx0c2Nyb2xsVG9wID0gdGhpcy5lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcih0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0TGluZU51bWJlcikgLSBoZWlnaHQgLyAyICsgY29tbWVudENvb3Jkcy50b3AgLSBjb21tZW50VGhyZWFkQ29vcmRzLnRvcDtcblx0XHRcdH1cblx0XHRcdHRoaXMuZWRpdG9yLnNldFNjcm9sbFRvcChzY3JvbGxUb3ApO1xuXHRcdFx0dGhpcy5fc2V0Rm9jdXMoY29tbWVudFVuaXF1ZUlkLCBmb2N1cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2dvVG9UaHJlYWQoZm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dvVG9UaHJlYWQoZm9jdXM6IENvbW1lbnRXaWRnZXRGb2N1cykge1xuXHRcdGNvbnN0IHJhbmdlVG9SZXZlYWwgPSB0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlXG5cdFx0XHQ/IG5ldyBSYW5nZSh0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgdGhpcy5fY29tbWVudFRocmVhZC5yYW5nZS5zdGFydENvbHVtbiwgdGhpcy5fY29tbWVudFRocmVhZC5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMSwgMSlcblx0XHRcdDogbmV3IFJhbmdlKDEsIDEsIDEsIDEpO1xuXG5cdFx0dGhpcy5lZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcihyYW5nZVRvUmV2ZWFsKTtcblx0XHR0aGlzLl9zZXRGb2N1cyh1bmRlZmluZWQsIGZvY3VzKTtcblx0fVxuXG5cdHB1YmxpYyBtYWtlVmlzaWJsZShjb21tZW50VW5pcXVlSWQ/OiBudW1iZXIsIGZvY3VzOiBDb21tZW50V2lkZ2V0Rm9jdXMgPSBDb21tZW50V2lkZ2V0Rm9jdXMuTm9uZSkge1xuXHRcdHRoaXMuX2V4cGFuZEFuZFNob3dab25lV2lkZ2V0KCk7XG5cblx0XHRpZiAoY29tbWVudFVuaXF1ZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2dvVG9Db21tZW50KGNvbW1lbnRVbmlxdWVJZCwgZm9jdXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9nb1RvVGhyZWFkKGZvY3VzKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0UGVuZGluZ0NvbW1lbnRzKCk6IHsgbmV3Q29tbWVudDogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50IHwgdW5kZWZpbmVkOyBlZGl0czogeyBba2V5OiBudW1iZXJdOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfSB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmV3Q29tbWVudDogdGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5nZXRQZW5kaW5nQ29tbWVudCgpLFxuXHRcdFx0ZWRpdHM6IHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuZ2V0UGVuZGluZ0VkaXRzKClcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHNldFBlbmRpbmdDb21tZW50KHBlbmRpbmc6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCkge1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tZW50ID0gcGVuZGluZztcblx0XHR0aGlzLmV4cGFuZCgpO1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuc2V0UGVuZGluZ0NvbW1lbnQocGVuZGluZyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2ZpbGxDb250YWluZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0Q3NzQ2xhc3MoJ3Jldmlldy13aWRnZXQnKTtcblx0XHR0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0ID0gdGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDb21tZW50VGhyZWFkV2lkZ2V0PElSYW5nZT4sXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR0aGlzLmVkaXRvcixcblx0XHRcdHRoaXMuX3VuaXF1ZU93bmVyLFxuXHRcdFx0dGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEudXJpLFxuXHRcdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWQsXG5cdFx0XHR0aGlzLl9wZW5kaW5nQ29tbWVudCxcblx0XHRcdHRoaXMuX3BlbmRpbmdFZGl0cyxcblx0XHRcdHsgY29udGV4dDogdGhpcy5lZGl0b3IsIH0sXG5cdFx0XHR0aGlzLl9jb21tZW50T3B0aW9ucyxcblx0XHRcdHtcblx0XHRcdFx0YWN0aW9uUnVubmVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzIHx8ICF0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV3UG9zaXRpb24gPSB0aGlzLmdldFBvc2l0aW9uKCk7XG5cblx0XHRcdFx0XHRcdGlmIChuZXdQb3NpdGlvbikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbFJhbmdlID0gdGhpcy5fY29tbWVudFRocmVhZC5yYW5nZTtcblx0XHRcdFx0XHRcdFx0aWYgKCFvcmlnaW5hbFJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGxldCByYW5nZTogUmFuZ2U7XG5cblx0XHRcdFx0XHRcdFx0aWYgKG5ld1Bvc2l0aW9uLmxpbmVOdW1iZXIgIT09IG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFRoZSB3aWRnZXQgY291bGQgaGF2ZSBtb3ZlZCBhcyBhIHJlc3VsdCBvZiBlZGl0b3IgY2hhbmdlcy5cblx0XHRcdFx0XHRcdFx0XHQvLyBXZSBuZWVkIHRvIHRyeSB0byBjYWxjdWxhdGUgdGhlIG5ldywgbW9yZSBjb3JyZWN0LCByYW5nZSBmb3IgdGhlIGNvbW1lbnQuXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZGlzdGFuY2UgPSBuZXdQb3NpdGlvbi5saW5lTnVtYmVyIC0gb3JpZ2luYWxSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlID0gbmV3IFJhbmdlKG9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgZGlzdGFuY2UsIG9yaWdpbmFsUmFuZ2Uuc3RhcnRDb2x1bW4sIG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlciArIGRpc3RhbmNlLCBvcmlnaW5hbFJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2Uob3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsIG9yaWdpbmFsUmFuZ2Uuc3RhcnRDb2x1bW4sIG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlciwgb3JpZ2luYWxSYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWVudFNlcnZpY2UudXBkYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHRoaXMudW5pcXVlT3duZXIsIHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSwgcmFuZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y29sbGFwc2U6ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jb2xsYXBzZSh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29tbWVudFRocmVhZFdpZGdldCk7XG5cdH1cblxuXHRwcml2YXRlIGFycm93UG9zaXRpb24ocmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCk6IElQb3NpdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gQXJyb3cgb24gdG9wIGVkZ2Ugb2Ygem9uZSB3aWRnZXQgd2lsbCBiZSBhdCB0aGUgc3RhcnQgb2YgdGhlIGxpbmUgaWYgcmFuZ2UgaXMgbXVsdGktbGluZSwgZWxzZSBhdCBtaWRwb2ludCBvZiByYW5nZSAocm91bmRpbmcgcmlnaHR3YXJkcylcblx0XHRyZXR1cm4geyBsaW5lTnVtYmVyOiByYW5nZS5lbmRMaW5lTnVtYmVyLCBjb2x1bW46IHJhbmdlLmVuZExpbmVOdW1iZXIgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlciA/IChyYW5nZS5zdGFydENvbHVtbiArIHJhbmdlLmVuZENvbHVtbiArIDEpIC8gMiA6IDEgfTtcblx0fVxuXG5cdHByaXZhdGUgZGVsZXRlQ29tbWVudFRocmVhZCgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLmRpc3Bvc2VDb21tZW50VGhyZWFkKHRoaXMudW5pcXVlT3duZXIsIHRoaXMuX2NvbW1lbnRUaHJlYWQudGhyZWFkSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NvbGxhcHNlKCkge1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWQuY29sbGFwc2libGVTdGF0ZSA9IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgY29sbGFwc2UoY29uZmlybTogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFjb25maXJtIHx8IChhd2FpdCB0aGlzLmNvbmZpcm1Db2xsYXBzZSgpKSkge1xuXHRcdFx0dGhpcy5kb0NvbGxhcHNlKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybUNvbGxhcHNlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGNvbmZpcm1TZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnd2hlbkhhc1Vuc3VibWl0dGVkQ29tbWVudHMnIHwgJ25ldmVyJz4oJ2NvbW1lbnRzLnRocmVhZC5jb25maXJtT25Db2xsYXBzZScpO1xuXG5cdFx0aWYgKGNvbmZpcm1TZXR0aW5nID09PSAnd2hlbkhhc1Vuc3VibWl0dGVkQ29tbWVudHMnICYmIHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuaGFzVW5zdWJtaXR0ZWRDb21tZW50cykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbmZpcm1Db2xsYXBzZScsIFwiQ29sbGFwc2luZyB0aGlzIGNvbW1lbnQgdGhyZWFkIHdpbGwgZGlzY2FyZCB1bnN1Ym1pdHRlZCBjb21tZW50cy4gQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRpc2NhcmQgdGhlc2UgY29tbWVudHM/XCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoJ2Rpc2NhcmQnLCBcIkRpc2NhcmRcIiksXG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdGNoZWNrYm94OiB7IGxhYmVsOiBubHMubG9jYWxpemUoJ25ldmVyQXNrQWdhaW4nLCBcIk5ldmVyIGFzayBtZSBhZ2FpblwiKSwgY2hlY2tlZDogZmFsc2UgfVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocmVzdWx0LmNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdjb21tZW50cy50aHJlYWQuY29uZmlybU9uQ29sbGFwc2UnLCAnbmV2ZXInKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQuY29uZmlybWVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBleHBhbmQoc2V0QWN0aXZlPzogYm9vbGVhbikge1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWQuY29sbGFwc2libGVTdGF0ZSA9IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZDtcblx0XHRpZiAoc2V0QWN0aXZlKSB7XG5cdFx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnNldEFjdGl2ZUNvbW1lbnRBbmRUaHJlYWQodGhpcy51bmlxdWVPd25lciwgeyB0aHJlYWQ6IHRoaXMuX2NvbW1lbnRUaHJlYWQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldEdseXBoUG9zaXRpb24oKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fY29tbWVudEdseXBoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29tbWVudEdseXBoLmdldFBvc2l0aW9uKCkucG9zaXRpb24hLmxpbmVOdW1iZXI7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlKGNvbW1lbnRUaHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElSYW5nZT4pIHtcblx0XHRpZiAodGhpcy5fY29tbWVudFRocmVhZCAhPT0gY29tbWVudFRocmVhZCkge1xuXHRcdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzLmZvckVhY2goZGlzcG9zYWJsZSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkID0gY29tbWVudFRocmVhZDtcblx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcyA9IFtdO1xuXHRcdFx0dGhpcy5iaW5kQ29tbWVudFRocmVhZExpc3RlbmVycygpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQudXBkYXRlQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkKTtcblxuXHRcdC8vIE1vdmUgY29tbWVudCBnbHlwaCB3aWRnZXQgYW5kIHNob3cgcG9zaXRpb24gaWYgdGhlIGxpbmUgaGFzIGNoYW5nZWQuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX2NvbW1lbnRUaHJlYWQucmFuZ2U/LmVuZExpbmVOdW1iZXIgPz8gMTtcblx0XHRsZXQgc2hvdWxkTW92ZVdpZGdldCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl9jb21tZW50R2x5cGgpIHtcblx0XHRcdGNvbnN0IGhhc0RyYWZ0ID0gY29tbWVudFRocmVhZEhhc0RyYWZ0KGNvbW1lbnRUaHJlYWQpO1xuXHRcdFx0dGhpcy5fY29tbWVudEdseXBoLnNldFRocmVhZFN0YXRlKGNvbW1lbnRUaHJlYWQuc3RhdGUsIGhhc0RyYWZ0KTtcblx0XHRcdGlmICh0aGlzLl9jb21tZW50R2x5cGguZ2V0UG9zaXRpb24oKS5wb3NpdGlvbiEubGluZU51bWJlciAhPT0gbGluZU51bWJlcikge1xuXHRcdFx0XHRzaG91bGRNb3ZlV2lkZ2V0ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY29tbWVudEdseXBoLnNldExpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKChzaG91bGRNb3ZlV2lkZ2V0ICYmIHRoaXMuX2lzRXhwYW5kZWQpIHx8ICh0aGlzLl9jb21tZW50VGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgPT09IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZCAmJiAhdGhpcy5faXNFeHBhbmRlZCkpIHtcblx0XHRcdHRoaXMuc2hvdyh0aGlzLmFycm93UG9zaXRpb24odGhpcy5fY29tbWVudFRocmVhZC5yYW5nZSksIDIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fY29tbWVudFRocmVhZC5jb2xsYXBzaWJsZVN0YXRlICE9PSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25XaWR0aCh3aWR0aEluUGl4ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQubGF5b3V0KHdpZHRoSW5QaXhlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2RvTGF5b3V0KGhlaWdodEluUGl4ZWw6IG51bWJlciwgd2lkdGhJblBpeGVsOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0LmxheW91dCh3aWR0aEluUGl4ZWwpO1xuXHR9XG5cblx0YXN5bmMgZGlzcGxheShyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkLCBzaG91bGRSZXZlYWw6IGJvb2xlYW4pIHtcblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRHbHlwaCA9IG5ldyBDb21tZW50R2x5cGhXaWRnZXQodGhpcy5lZGl0b3IsIHJhbmdlPy5lbmRMaW5lTnVtYmVyID8/IC0xKTtcblx0XHRcdGNvbnN0IGhhc0RyYWZ0ID0gY29tbWVudFRocmVhZEhhc0RyYWZ0KHRoaXMuX2NvbW1lbnRUaHJlYWQpO1xuXHRcdFx0dGhpcy5fY29tbWVudEdseXBoLnNldFRocmVhZFN0YXRlKHRoaXMuX2NvbW1lbnRUaHJlYWQuc3RhdGUsIGhhc0RyYWZ0KTtcblx0XHRcdHRoaXMuX2dsb2JhbFRvRGlzcG9zZS5hZGQodGhpcy5fY29tbWVudEdseXBoLm9uRGlkQ2hhbmdlTGluZU51bWJlcihhc3luYyBlID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNoaWZ0ID0gZSAtICh0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBuZXdSYW5nZSA9IG5ldyBSYW5nZSh0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0TGluZU51bWJlciArIHNoaWZ0LCB0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0Q29sdW1uLCB0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlLmVuZExpbmVOdW1iZXIgKyBzaGlmdCwgdGhpcy5fY29tbWVudFRocmVhZC5yYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlID0gbmV3UmFuZ2U7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5kaXNwbGF5KHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCksIHNob3VsZFJldmVhbCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQub25EaWRSZXNpemUoZGltZW5zaW9uID0+IHtcblx0XHRcdHRoaXMuX3JlZnJlc2goZGltZW5zaW9uKTtcblx0XHR9KSk7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUaHJlYWQuY29sbGFwc2libGVTdGF0ZSA9PT0gbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWRDb2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLnNob3codGhpcy5hcnJvd1Bvc2l0aW9uKHJhbmdlKSwgMik7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhpcyBpcyBhIG5ldyBjb21tZW50IHRocmVhZCBhd2FpdGluZyB1c2VyIGlucHV0IHRoZW4gd2UgbmVlZCB0byByZXZlYWwgaXQuXG5cdFx0aWYgKHNob3VsZFJldmVhbCkge1xuXHRcdFx0dGhpcy5tYWtlVmlzaWJsZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuYmluZENvbW1lbnRUaHJlYWRMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYmluZENvbW1lbnRUaHJlYWRMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzLnB1c2godGhpcy5fY29tbWVudFRocmVhZC5vbkRpZENoYW5nZUNvbW1lbnRzKGFzeW5jIF8gPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGUodGhpcy5fY29tbWVudFRocmVhZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzLnB1c2godGhpcy5fY29tbWVudFRocmVhZC5vbkRpZENoYW5nZUNvbGxhcHNpYmxlU3RhdGUoc3RhdGUgPT4ge1xuXHRcdFx0aWYgKHN0YXRlID09PSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuRXhwYW5kZWQgJiYgIXRoaXMuX2lzRXhwYW5kZWQpIHtcblx0XHRcdFx0dGhpcy5zaG93KHRoaXMuYXJyb3dQb3NpdGlvbih0aGlzLl9jb21tZW50VGhyZWFkLnJhbmdlKSwgMik7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuZW5zdXJlRm9jdXNJbnRvTmV3RWRpdGluZ0NvbW1lbnQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhdGUgPT09IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQgJiYgdGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl9pbml0aWFsQ29sbGFwc2libGVTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZUluaXRpYWxDb2xsYXBzaWJsZVN0YXRlID0gdGhpcy5fY29tbWVudFRocmVhZC5vbkRpZENoYW5nZUluaXRpYWxDb2xsYXBzaWJsZVN0YXRlKHN0YXRlID0+IHtcblx0XHRcdFx0Ly8gRmlsZSBjb21tZW50cyBhbHdheXMgc3RhcnQgZXhwYW5kZWRcblx0XHRcdFx0dGhpcy5faW5pdGlhbENvbGxhcHNpYmxlU3RhdGUgPSBzdGF0ZTtcblx0XHRcdFx0dGhpcy5fY29tbWVudFRocmVhZC5jb2xsYXBzaWJsZVN0YXRlID0gdGhpcy5faW5pdGlhbENvbGxhcHNpYmxlU3RhdGU7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlSW5pdGlhbENvbGxhcHNpYmxlU3RhdGUuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXMucHVzaChvbkRpZENoYW5nZUluaXRpYWxDb2xsYXBzaWJsZVN0YXRlKTtcblx0XHR9XG5cblxuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcy5wdXNoKHRoaXMuX2NvbW1lbnRUaHJlYWQub25EaWRDaGFuZ2VTdGF0ZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBib3JkZXJDb2xvciA9XG5cdFx0XHRcdGdldENvbW1lbnRUaHJlYWRXaWRnZXRTdGF0ZUNvbG9yKHRoaXMuX2NvbW1lbnRUaHJlYWQuc3RhdGUsIHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSkgfHwgQ29sb3IudHJhbnNwYXJlbnQ7XG5cdFx0XHR0aGlzLnN0eWxlKHtcblx0XHRcdFx0ZnJhbWVDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRcdGFycm93Q29sb3I6IGJvcmRlckNvbG9yLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lcj8uc3R5bGUuc2V0UHJvcGVydHkoY29tbWVudFRocmVhZFN0YXRlQ29sb3JWYXIsIGAke2JvcmRlckNvbG9yfWApO1xuXHRcdFx0dGhpcy5jb250YWluZXI/LnN0eWxlLnNldFByb3BlcnR5KGNvbW1lbnRUaHJlYWRTdGF0ZUJhY2tncm91bmRDb2xvclZhciwgYCR7Ym9yZGVyQ29sb3IudHJhbnNwYXJlbnQoLjEpfWApO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHN1Ym1pdENvbW1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuc3VibWl0Q29tbWVudCgpO1xuXHR9XG5cblx0X3JlZnJlc2goZGltZW5zaW9uczogZG9tLkRpbWVuc2lvbikge1xuXHRcdGlmICgodGhpcy5faXNFeHBhbmRlZCA9PT0gdW5kZWZpbmVkKSAmJiAoZGltZW5zaW9ucy5oZWlnaHQgPT09IDApICYmIChkaW1lbnNpb25zLndpZHRoID09PSAwKSkge1xuXHRcdFx0dGhpcy5jb21tZW50VGhyZWFkLmNvbGxhcHNpYmxlU3RhdGUgPSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5fY29tbWVudFRocmVhZFdpZGdldC5sYXlvdXQoKTtcblxuXHRcdFx0Y29uc3QgaGVhZEhlaWdodCA9IE1hdGguY2VpbCh0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpICogMS4yKTtcblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdFx0Y29uc3QgYXJyb3dIZWlnaHQgPSBNYXRoLnJvdW5kKGxpbmVIZWlnaHQgLyAzKTtcblx0XHRcdGNvbnN0IGZyYW1lVGhpY2tuZXNzID0gTWF0aC5yb3VuZChsaW5lSGVpZ2h0IC8gOSkgKiAyO1xuXG5cdFx0XHRjb25zdCBjb21wdXRlZExpbmVzTnVtYmVyID0gTWF0aC5jZWlsKChoZWFkSGVpZ2h0ICsgZGltZW5zaW9ucy5oZWlnaHQgKyBhcnJvd0hlaWdodCArIGZyYW1lVGhpY2tuZXNzICsgOCAvKiogbWFyZ2luIGJvdHRvbSB0byBhdm9pZCBtYXJnaW4gY29sbGFwc2UgKi8pIC8gbGluZUhlaWdodCk7XG5cblx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZT8uaGVpZ2h0SW5MaW5lcyA9PT0gY29tcHV0ZWRMaW5lc051bWJlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRQb3NpdGlvbiA9IHRoaXMuZ2V0UG9zaXRpb24oKTtcblxuXHRcdFx0aWYgKHRoaXMuX3ZpZXdab25lICYmIGN1cnJlbnRQb3NpdGlvbiAmJiBjdXJyZW50UG9zaXRpb24ubGluZU51bWJlciAhPT0gdGhpcy5fdmlld1pvbmUuYWZ0ZXJMaW5lTnVtYmVyICYmIHRoaXMuX3ZpZXdab25lLmFmdGVyTGluZU51bWJlciAhPT0gMCkge1xuXHRcdFx0XHR0aGlzLl92aWV3Wm9uZS5hZnRlckxpbmVOdW1iZXIgPSBjdXJyZW50UG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2FwdHVyZSA9IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlLmNhcHR1cmUodGhpcy5lZGl0b3IpO1xuXHRcdFx0dGhpcy5fcmVsYXlvdXQoY29tcHV0ZWRMaW5lc051bWJlcik7XG5cdFx0XHRjYXB0dXJlLnJlc3RvcmUodGhpcy5lZGl0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VGhlbWUoKSB7XG5cdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSBnZXRDb21tZW50VGhyZWFkV2lkZ2V0U3RhdGVDb2xvcih0aGlzLl9jb21tZW50VGhyZWFkLnN0YXRlLCB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpIHx8IENvbG9yLnRyYW5zcGFyZW50O1xuXHRcdHRoaXMuc3R5bGUoe1xuXHRcdFx0YXJyb3dDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRmcmFtZUNvbG9yOiBib3JkZXJDb2xvclxuXHRcdH0pO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cblx0XHR0aGlzLl9jb21tZW50VGhyZWFkV2lkZ2V0LmFwcGx5VGhlbWUoZm9udEluZm8pO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdyhyYW5nZU9yUG9zOiBJUmFuZ2UgfCBJUG9zaXRpb24gfCB1bmRlZmluZWQsIGhlaWdodEluTGluZXM6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGdseXBoUG9zaXRpb24gPSB0aGlzLl9jb21tZW50R2x5cGg/LmdldFBvc2l0aW9uKCk7XG5cdFx0bGV0IHJhbmdlID0gUmFuZ2UuaXNJUmFuZ2UocmFuZ2VPclBvcykgPyByYW5nZU9yUG9zIDogKHJhbmdlT3JQb3MgPyBSYW5nZS5mcm9tUG9zaXRpb25zKHJhbmdlT3JQb3MpIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoZ2x5cGhQb3NpdGlvbj8ucG9zaXRpb24gJiYgcmFuZ2UgJiYgZ2x5cGhQb3NpdGlvbi5wb3NpdGlvbi5saW5lTnVtYmVyICE9PSByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBUaGUgd2lkZ2V0IGNvdWxkIGhhdmUgbW92ZWQgYXMgYSByZXN1bHQgb2YgZWRpdG9yIGNoYW5nZXMuXG5cdFx0XHQvLyBXZSBuZWVkIHRvIHRyeSB0byBjYWxjdWxhdGUgdGhlIG5ldywgbW9yZSBjb3JyZWN0LCByYW5nZSBmb3IgdGhlIGNvbW1lbnQuXG5cdFx0XHRjb25zdCBkaXN0YW5jZSA9IGdseXBoUG9zaXRpb24ucG9zaXRpb24ubGluZU51bWJlciAtIHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIgKyBkaXN0YW5jZSwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIgKyBkaXN0YW5jZSwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHR9XG5cblx0XHRjb25zdCB3YXNFeHBhbmRlZCA9IHRoaXMuX2lzRXhwYW5kZWQ7XG5cdFx0dGhpcy5faXNFeHBhbmRlZCA9IHRydWU7XG5cdFx0c3VwZXIuc2hvdyhyYW5nZSA/PyBuZXcgUmFuZ2UoMCwgMCwgMCwgMCksIGhlaWdodEluTGluZXMpO1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWQuY29sbGFwc2libGVTdGF0ZSA9IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZDtcblx0XHR0aGlzLl9yZWZyZXNoKHRoaXMuX2NvbW1lbnRUaHJlYWRXaWRnZXQuZ2V0RGltZW5zaW9ucygpKTtcblx0XHRpZiAoIXdhc0V4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4cGFuZGVkU3RhdGUuZmlyZSh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb2xsYXBzZUFuZEZvY3VzUmFuZ2UoKSB7XG5cdFx0aWYgKGF3YWl0IHRoaXMuY29sbGFwc2UodHJ1ZSkgJiYgUmFuZ2UuaXNJUmFuZ2UodGhpcy5jb21tZW50VGhyZWFkLnJhbmdlKSAmJiBpc0NvZGVFZGl0b3IodGhpcy5lZGl0b3IpKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRTZWxlY3Rpb24odGhpcy5jb21tZW50VGhyZWFkLnJhbmdlKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBoaWRlKCkge1xuXHRcdGlmICh0aGlzLl9pc0V4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLl9pc0V4cGFuZGVkID0gZmFsc2U7XG5cdFx0XHQvLyBGb2N1cyB0aGUgY29udGFpbmVyIHNvIHRoYXQgdGhlIGNvbW1lbnQgZWRpdG9yIHdpbGwgYmUgYmx1cnJlZCBiZWZvcmUgaXQgaXMgaGlkZGVuXG5cdFx0XHRpZiAodGhpcy5lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMgfHwgIXRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuZGVsZXRlQ29tbWVudFRocmVhZCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHBhbmRlZFN0YXRlLmZpcmUoZmFsc2UpO1xuXHRcdH1cblx0XHRzdXBlci5oaWRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdGlmICh0aGlzLl9jb21tZW50R2x5cGgpIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRHbHlwaC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9jb21tZW50R2x5cGggPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZ2xvYmFsVG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXMuZm9yRWFjaChnbG9iYWwgPT4gZ2xvYmFsLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5fb25EaWRDbG9zZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb25EaWRDbG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDcmVhdGVUaHJlYWQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRXhwYW5kZWRTdGF0ZS5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxhQUFhO0FBQ3RCLFNBQVMs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
