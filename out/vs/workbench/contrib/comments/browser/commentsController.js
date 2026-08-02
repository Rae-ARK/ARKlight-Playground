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
import { Action } from "../../../../base/common/actions.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { findFirstIdxMonotonousOrArrLen } from "../../../../base/common/arraysFind.js";
import { createCancelablePromise, Delayer } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import "./media/review.css";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorType } from "../../../../editor/common/editorCommon.js";
import { ModelDecorationOptions, TextModel } from "../../../../editor/common/model/textModel.js";
import * as languages from "../../../../editor/common/languages.js";
import * as nls from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { CommentGlyphWidget } from "./commentGlyphWidget.js";
import { ICommentService } from "./commentService.js";
import { CommentWidgetFocus, isMouseUpEventDragFromMouseDown, parseMouseDownInfoFromEvent, ReviewZoneWidget } from "./commentThreadZoneWidget.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { COMMENTS_VIEW_ID } from "./commentsTreeViewer.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { COMMENTS_SECTION } from "../common/commentsConfiguration.js";
import { COMMENTEDITOR_DECORATION_KEY } from "./commentReply.js";
import { Emitter } from "../../../../base/common/event.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { CommentThreadRangeDecorator } from "./commentThreadRangeDecorator.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { URI } from "../../../../base/common/uri.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { threadHasMeaningfulComments } from "./commentsModel.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
const ID = "editor.contrib.review";
class CommentingRangeDecoration {
  constructor(_editor, _ownerId, _extensionId, _label, _range, options, commentingRangesInfo, isHover = false) {
    this._editor = _editor;
    this._ownerId = _ownerId;
    this._extensionId = _extensionId;
    this._label = _label;
    this._range = _range;
    this.options = options;
    this.commentingRangesInfo = commentingRangesInfo;
    this.isHover = isHover;
    this._startLineNumber = _range.startLineNumber;
    this._endLineNumber = _range.endLineNumber;
  }
  get id() {
    return this._decorationId;
  }
  set id(id) {
    this._decorationId = id;
  }
  get range() {
    return {
      startLineNumber: this._startLineNumber,
      startColumn: 1,
      endLineNumber: this._endLineNumber,
      endColumn: 1
    };
  }
  getCommentAction() {
    return {
      extensionId: this._extensionId,
      label: this._label,
      ownerId: this._ownerId,
      commentingRangesInfo: this.commentingRangesInfo
    };
  }
  getOriginalRange() {
    return this._range;
  }
  getActiveRange() {
    return this.id ? this._editor.getModel().getDecorationRange(this.id) : void 0;
  }
}
const _CommentingRangeDecorator = class _CommentingRangeDecorator {
  constructor() {
    this.commentingRangeDecorations = [];
    this.decorationIds = [];
    this._lastHover = -1;
    this._onDidChangeDecorationsCount = new Emitter();
    this.onDidChangeDecorationsCount = this._onDidChangeDecorationsCount.event;
    const decorationOptions = {
      description: _CommentingRangeDecorator.description,
      isWholeLine: true,
      linesDecorationsClassName: "comment-range-glyph comment-diff-added"
    };
    this.decorationOptions = ModelDecorationOptions.createDynamic(decorationOptions);
    const hoverDecorationOptions = {
      description: _CommentingRangeDecorator.description,
      isWholeLine: true,
      linesDecorationsClassName: `comment-range-glyph line-hover`
    };
    this.hoverDecorationOptions = ModelDecorationOptions.createDynamic(hoverDecorationOptions);
    const multilineDecorationOptions = {
      description: _CommentingRangeDecorator.description,
      isWholeLine: true,
      linesDecorationsClassName: `comment-range-glyph multiline-add`
    };
    this.multilineDecorationOptions = ModelDecorationOptions.createDynamic(multilineDecorationOptions);
  }
  updateHover(hoverLine) {
    if (this._editor && this._infos && hoverLine !== this._lastHover) {
      this._doUpdate(this._editor, this._infos, hoverLine);
    }
    this._lastHover = hoverLine ?? -1;
  }
  updateSelection(cursorLine, range = new Range(0, 0, 0, 0)) {
    this._lastSelection = range.isEmpty() ? void 0 : range;
    this._lastSelectionCursor = range.isEmpty() ? void 0 : cursorLine;
    if (this._editor && this._infos) {
      this._doUpdate(this._editor, this._infos, cursorLine, range);
    }
  }
  update(editor, commentInfos, cursorLine, range) {
    if (editor) {
      this._editor = editor;
      this._infos = commentInfos;
      this._doUpdate(editor, commentInfos, cursorLine, range);
    }
  }
  _lineHasThread(editor, lineRange) {
    return editor.getDecorationsInRange(lineRange)?.find((decoration) => decoration.options.description === CommentGlyphWidget.description);
  }
  _doUpdate(editor, commentInfos, emphasisLine = -1, selectionRange = this._lastSelection) {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    emphasisLine = this._lastSelectionCursor ?? emphasisLine;
    const commentingRangeDecorations = [];
    for (const info of commentInfos) {
      info.commentingRanges.ranges.forEach((range) => {
        const rangeObject = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
        let intersectingSelectionRange = selectionRange ? rangeObject.intersectRanges(selectionRange) : void 0;
        if (selectionRange && emphasisLine >= 0 && intersectingSelectionRange && !(intersectingSelectionRange.startLineNumber === intersectingSelectionRange.endLineNumber && emphasisLine === intersectingSelectionRange.startLineNumber)) {
          let intersectingEmphasisRange;
          if (emphasisLine <= intersectingSelectionRange.startLineNumber) {
            intersectingEmphasisRange = intersectingSelectionRange.collapseToStart();
            intersectingSelectionRange = new Range(intersectingSelectionRange.startLineNumber + 1, 1, intersectingSelectionRange.endLineNumber, 1);
          } else {
            intersectingEmphasisRange = new Range(intersectingSelectionRange.endLineNumber, 1, intersectingSelectionRange.endLineNumber, 1);
            intersectingSelectionRange = new Range(intersectingSelectionRange.startLineNumber, 1, intersectingSelectionRange.endLineNumber - 1, 1);
          }
          commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, intersectingSelectionRange, this.multilineDecorationOptions, info.commentingRanges, true));
          if (!this._lineHasThread(editor, intersectingEmphasisRange)) {
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, intersectingEmphasisRange, this.hoverDecorationOptions, info.commentingRanges, true));
          }
          const beforeRangeEndLine = Math.min(intersectingEmphasisRange.startLineNumber, intersectingSelectionRange.startLineNumber) - 1;
          const hasBeforeRange = rangeObject.startLineNumber <= beforeRangeEndLine;
          const afterRangeStartLine = Math.max(intersectingEmphasisRange.endLineNumber, intersectingSelectionRange.endLineNumber) + 1;
          const hasAfterRange = rangeObject.endLineNumber >= afterRangeStartLine;
          if (hasBeforeRange) {
            const beforeRange = new Range(range.startLineNumber, 1, beforeRangeEndLine, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, beforeRange, this.decorationOptions, info.commentingRanges, true));
          }
          if (hasAfterRange) {
            const afterRange = new Range(afterRangeStartLine, 1, range.endLineNumber, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, afterRange, this.decorationOptions, info.commentingRanges, true));
          }
        } else if (rangeObject.startLineNumber <= emphasisLine && emphasisLine <= rangeObject.endLineNumber) {
          if (rangeObject.startLineNumber < emphasisLine) {
            const beforeRange = new Range(range.startLineNumber, 1, emphasisLine - 1, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, beforeRange, this.decorationOptions, info.commentingRanges, true));
          }
          const emphasisRange = new Range(emphasisLine, 1, emphasisLine, 1);
          if (!this._lineHasThread(editor, emphasisRange)) {
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, emphasisRange, this.hoverDecorationOptions, info.commentingRanges, true));
          }
          if (emphasisLine < rangeObject.endLineNumber) {
            const afterRange = new Range(emphasisLine + 1, 1, range.endLineNumber, 1);
            commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, afterRange, this.decorationOptions, info.commentingRanges, true));
          }
        } else {
          commentingRangeDecorations.push(new CommentingRangeDecoration(editor, info.uniqueOwner, info.extensionId, info.label, range, this.decorationOptions, info.commentingRanges));
        }
      });
    }
    editor.changeDecorations((accessor) => {
      this.decorationIds = accessor.deltaDecorations(this.decorationIds, commentingRangeDecorations);
      commentingRangeDecorations.forEach((decoration, index) => decoration.id = this.decorationIds[index]);
    });
    const rangesDifference = this.commentingRangeDecorations.length - commentingRangeDecorations.length;
    this.commentingRangeDecorations = commentingRangeDecorations;
    if (rangesDifference) {
      this._onDidChangeDecorationsCount.fire(this.commentingRangeDecorations.length);
    }
  }
  areRangesIntersectingOrTouchingByLine(a, b) {
    if (a.endLineNumber < b.startLineNumber - 1) {
      return false;
    }
    if (b.endLineNumber + 1 < a.startLineNumber) {
      return false;
    }
    return true;
  }
  getMatchedCommentAction(commentRange) {
    if (commentRange === void 0) {
      const foundInfos = this._infos?.filter((info) => info.commentingRanges.fileComments);
      if (foundInfos) {
        return foundInfos.map((foundInfo) => {
          return {
            action: {
              ownerId: foundInfo.uniqueOwner,
              extensionId: foundInfo.extensionId,
              label: foundInfo.label,
              commentingRangesInfo: foundInfo.commentingRanges
            }
          };
        });
      }
      return [];
    }
    const foundHoverActions = /* @__PURE__ */ new Map();
    for (const decoration of this.commentingRangeDecorations) {
      const range = decoration.getActiveRange();
      if (range && this.areRangesIntersectingOrTouchingByLine(range, commentRange)) {
        const action = decoration.getCommentAction();
        const alreadyFoundInfo = foundHoverActions.get(action.ownerId);
        if (alreadyFoundInfo?.action.commentingRangesInfo === action.commentingRangesInfo) {
          const newRange = new Range(
            range.startLineNumber < alreadyFoundInfo.range.startLineNumber ? range.startLineNumber : alreadyFoundInfo.range.startLineNumber,
            range.startColumn < alreadyFoundInfo.range.startColumn ? range.startColumn : alreadyFoundInfo.range.startColumn,
            range.endLineNumber > alreadyFoundInfo.range.endLineNumber ? range.endLineNumber : alreadyFoundInfo.range.endLineNumber,
            range.endColumn > alreadyFoundInfo.range.endColumn ? range.endColumn : alreadyFoundInfo.range.endColumn
          );
          foundHoverActions.set(action.ownerId, { range: newRange, action });
        } else {
          foundHoverActions.set(action.ownerId, { range, action });
        }
      }
    }
    const seenOwners = /* @__PURE__ */ new Set();
    return Array.from(foundHoverActions.values()).filter((action) => {
      if (seenOwners.has(action.action.ownerId)) {
        return false;
      } else {
        seenOwners.add(action.action.ownerId);
        return true;
      }
    });
  }
  getNearestCommentingRange(findPosition, reverse) {
    let findPositionContainedWithin;
    let decorations;
    if (reverse) {
      decorations = [];
      for (let i = this.commentingRangeDecorations.length - 1; i >= 0; i--) {
        decorations.push(this.commentingRangeDecorations[i]);
      }
    } else {
      decorations = this.commentingRangeDecorations;
    }
    for (const decoration of decorations) {
      const range = decoration.getActiveRange();
      if (!range) {
        continue;
      }
      if (findPositionContainedWithin && this.areRangesIntersectingOrTouchingByLine(range, findPositionContainedWithin)) {
        findPositionContainedWithin = Range.plusRange(findPositionContainedWithin, range);
        continue;
      }
      if (range.startLineNumber <= findPosition.lineNumber && findPosition.lineNumber <= range.endLineNumber) {
        findPositionContainedWithin = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
        continue;
      }
      if (!reverse && range.endLineNumber < findPosition.lineNumber) {
        continue;
      }
      if (reverse && range.startLineNumber > findPosition.lineNumber) {
        continue;
      }
      return range;
    }
    return decorations.length > 0 ? decorations[0].getActiveRange() ?? void 0 : void 0;
  }
  dispose() {
    this._onDidChangeDecorationsCount.dispose();
    this.commentingRangeDecorations = [];
  }
};
_CommentingRangeDecorator.description = "commenting-range-decorator";
let CommentingRangeDecorator = _CommentingRangeDecorator;
function moveToNextCommentInThread(commentInfo, type) {
  if (!commentInfo?.comment || !commentInfo?.thread?.comments) {
    return;
  }
  const currentIndex = commentInfo.thread.comments?.indexOf(commentInfo.comment);
  if (currentIndex === void 0 || currentIndex < 0) {
    return;
  }
  if (type === "previous" && currentIndex === 0) {
    return;
  }
  if (type === "next" && currentIndex === commentInfo.thread.comments.length - 1) {
    return;
  }
  const comment = commentInfo.thread.comments?.[type === "previous" ? currentIndex - 1 : currentIndex + 1];
  if (!comment) {
    return;
  }
  return {
    ...commentInfo,
    comment
  };
}
function revealCommentThread(commentService, editorService, uriIdentityService, commentThread, comment, focusReply, pinned, preserveFocus, sideBySide) {
  if (!commentThread.resource) {
    return;
  }
  if (!commentService.isCommentingEnabled) {
    commentService.enableCommenting(true);
  }
  const range = commentThread.range;
  const focus = focusReply ? CommentWidgetFocus.Editor : preserveFocus ? CommentWidgetFocus.None : CommentWidgetFocus.Widget;
  const activeEditor = editorService.activeTextEditorControl;
  const currentActiveResources = isDiffEditor(activeEditor) ? [activeEditor.getOriginalEditor(), activeEditor.getModifiedEditor()] : activeEditor ? [activeEditor] : [];
  const threadToReveal = commentThread.threadId;
  const commentToReveal = comment?.uniqueIdInThread;
  const resource = URI.parse(commentThread.resource);
  for (const editor of currentActiveResources) {
    const model = editor.getModel();
    if (model instanceof TextModel && uriIdentityService.extUri.isEqual(resource, model.uri)) {
      if (threadToReveal && isCodeEditor(editor)) {
        const controller = CommentController.get(editor);
        controller?.revealCommentThread(threadToReveal, commentToReveal, true, focus);
      }
      return;
    }
  }
  editorService.openEditor({
    resource,
    options: {
      pinned,
      preserveFocus,
      selection: range ?? new Range(1, 1, 1, 1)
    }
  }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP).then((editor) => {
    if (editor) {
      const control = editor.getControl();
      if (threadToReveal && isCodeEditor(control)) {
        const controller = CommentController.get(control);
        controller?.revealCommentThread(threadToReveal, commentToReveal, true, focus);
      }
    }
  });
}
let CommentController = class extends Disposable {
  constructor(editor, commentService, instantiationService, codeEditorService, contextMenuService, quickInputService, viewsService, configurationService, contextKeyService, editorService, keybindingService, accessibilityService, notificationService, uriIdentityService) {
    super();
    this.commentService = commentService;
    this.instantiationService = instantiationService;
    this.codeEditorService = codeEditorService;
    this.contextMenuService = contextMenuService;
    this.quickInputService = quickInputService;
    this.viewsService = viewsService;
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.keybindingService = keybindingService;
    this.accessibilityService = accessibilityService;
    this.notificationService = notificationService;
    this.uriIdentityService = uriIdentityService;
    this.localToDispose = this._register(new DisposableStore());
    this.mouseDownInfo = null;
    this._commentingRangeSpaceReserved = false;
    this._commentingRangeAmountReserved = 0;
    this._emptyThreadsToAddQueue = [];
    // uniqueOwner -> threadId -> uniqueIdInThread -> pending comment
    this._inProcessContinueOnComments = /* @__PURE__ */ new Map();
    this._editorDisposables = [];
    this._hasRespondedToEditorChange = false;
    this._commentInfos = [];
    this._commentWidgets = [];
    this._pendingNewCommentCache = {};
    this._pendingEditsCache = {};
    this._computePromise = null;
    this._activeCursorHasCommentingRange = CommentContextKeys.activeCursorHasCommentingRange.bindTo(contextKeyService);
    this._activeCursorHasComment = CommentContextKeys.activeCursorHasComment.bindTo(contextKeyService);
    this._activeEditorHasCommentingRange = CommentContextKeys.activeEditorHasCommentingRange.bindTo(contextKeyService);
    this._commentWidgetVisible = CommentContextKeys.commentWidgetVisible.bindTo(contextKeyService);
    if (editor instanceof EmbeddedCodeEditorWidget) {
      return;
    }
    this.editor = editor;
    this._commentingRangeDecorator = this._register(new CommentingRangeDecorator());
    this._register(this._commentingRangeDecorator.onDidChangeDecorationsCount((count) => {
      if (count === 0) {
        this.clearEditorListeners();
      } else if (this._editorDisposables.length === 0) {
        this.registerEditorListeners();
      }
    }));
    this._register(this._commentThreadRangeDecorator = new CommentThreadRangeDecorator(this.commentService));
    this._register(this.commentService.onDidDeleteDataProvider((ownerId) => {
      if (ownerId) {
        delete this._pendingNewCommentCache[ownerId];
        delete this._pendingEditsCache[ownerId];
      } else {
        this._pendingNewCommentCache = {};
        this._pendingEditsCache = {};
      }
      this.beginCompute();
    }));
    this._register(this.commentService.onDidSetDataProvider((_) => this.beginComputeAndHandleEditorChange()));
    this._register(this.commentService.onDidUpdateCommentingRanges((_) => this.beginComputeAndHandleEditorChange()));
    this._register(this.commentService.onDidSetResourceCommentInfos(async (e) => {
      const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
      if (editorURI && editorURI.toString() === e.resource.toString()) {
        await this.setComments(e.commentInfos.filter((commentInfo) => commentInfo !== null));
      }
    }));
    this._register(this.commentService.onDidChangeCommentingEnabled((e) => {
      if (e) {
        this.registerEditorListeners();
        this.beginCompute();
      } else {
        this.tryUpdateReservedSpace();
        this.clearEditorListeners();
        this._commentingRangeDecorator.update(this.editor, []);
        this._commentThreadRangeDecorator.update(this.editor, []);
        dispose(this._commentWidgets);
        this._commentWidgets = [];
      }
    }));
    this._register(this.editor.onWillChangeModel((e) => this.onWillChangeModel(e)));
    this._register(this.editor.onDidChangeModel((_) => this.onModelChanged()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("diffEditor.renderSideBySide")) {
        this.beginCompute();
      }
    }));
    this.onModelChanged();
    this._register(this.codeEditorService.registerDecorationType("comment-controller", COMMENTEDITOR_DECORATION_KEY, {}));
    this._register(
      this.commentService.registerContinueOnCommentProvider({
        provideContinueOnComments: () => {
          const pendingComments = [];
          if (this._commentWidgets) {
            for (const zone of this._commentWidgets) {
              const zonePendingComments = zone.getPendingComments();
              const pendingNewComment = zonePendingComments.newComment;
              if (!pendingNewComment) {
                continue;
              }
              let lastCommentBody;
              if (zone.commentThread.comments && zone.commentThread.comments.length) {
                const lastComment = zone.commentThread.comments[zone.commentThread.comments.length - 1];
                if (typeof lastComment.body === "string") {
                  lastCommentBody = lastComment.body;
                } else {
                  lastCommentBody = lastComment.body.value;
                }
              }
              if (pendingNewComment.body !== lastCommentBody) {
                pendingComments.push({
                  uniqueOwner: zone.uniqueOwner,
                  uri: zone.editor.getModel().uri,
                  range: zone.commentThread.range,
                  comment: pendingNewComment,
                  isReply: zone.commentThread.comments !== void 0 && zone.commentThread.comments.length > 0
                });
              }
            }
          }
          return pendingComments;
        }
      })
    );
  }
  registerEditorListeners() {
    this._editorDisposables = [];
    if (!this.editor) {
      return;
    }
    this._editorDisposables.push(this.editor.onMouseMove((e) => this.onEditorMouseMove(e)));
    this._editorDisposables.push(this.editor.onMouseLeave(() => this.onEditorMouseLeave()));
    this._editorDisposables.push(this.editor.onDidChangeCursorPosition((e) => this.onEditorChangeCursorPosition(e.position)));
    this._editorDisposables.push(this.editor.onDidFocusEditorWidget(() => this.onEditorChangeCursorPosition(this.editor?.getPosition() ?? null)));
    this._editorDisposables.push(this.editor.onDidChangeCursorSelection((e) => this.onEditorChangeCursorSelection(e)));
    this._editorDisposables.push(this.editor.onDidBlurEditorWidget(() => this.onEditorChangeCursorSelection()));
  }
  clearEditorListeners() {
    dispose(this._editorDisposables);
    this._editorDisposables = [];
  }
  onEditorMouseLeave() {
    this._commentingRangeDecorator.updateHover();
  }
  onEditorMouseMove(e) {
    const position = e.target.position?.lineNumber;
    if (e.event.leftButton.valueOf() && position && this.mouseDownInfo) {
      this._commentingRangeDecorator.updateSelection(position, new Range(this.mouseDownInfo.lineNumber, 1, position, 1));
    } else {
      this._commentingRangeDecorator.updateHover(position);
    }
  }
  onEditorChangeCursorSelection(e) {
    const position = this.editor?.getPosition()?.lineNumber;
    if (position) {
      this._commentingRangeDecorator.updateSelection(position, e?.selection);
    }
  }
  onEditorChangeCursorPosition(e) {
    if (!e) {
      return;
    }
    const range = Range.fromPositions(e, { column: -1, lineNumber: e.lineNumber });
    const decorations = this.editor?.getDecorationsInRange(range);
    let hasCommentingRange = false;
    if (decorations) {
      for (const decoration of decorations) {
        if (decoration.options.description === CommentGlyphWidget.description) {
          hasCommentingRange = false;
          break;
        } else if (decoration.options.description === CommentingRangeDecorator.description) {
          hasCommentingRange = true;
        }
      }
    }
    this._activeCursorHasCommentingRange.set(hasCommentingRange);
    this._activeCursorHasComment.set(this.getCommentsAtLine(range).length > 0);
  }
  isEditorInlineOriginal(testEditor) {
    if (this.configurationService.getValue("diffEditor.renderSideBySide")) {
      return false;
    }
    const foundEditor = this.editorService.visibleTextEditorControls.find((editor) => {
      if (editor.getEditorType() === EditorType.IDiffEditor) {
        const diffEditor = editor;
        return diffEditor.getOriginalEditor() === testEditor;
      }
      return false;
    });
    return !!foundEditor;
  }
  beginCompute() {
    this._computePromise = createCancelablePromise((token) => {
      const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
      if (editorURI) {
        return this.commentService.getDocumentComments(editorURI);
      }
      return Promise.resolve([]);
    });
    this._computeAndSetPromise = this._computePromise.then(async (commentInfos) => {
      await this.setComments(coalesce(commentInfos));
      this._computePromise = null;
    }, (error) => console.log(error));
    this._computePromise.then(() => this._computeAndSetPromise = void 0);
    return this._computeAndSetPromise;
  }
  beginComputeCommentingRanges() {
    if (this._computeCommentingRangeScheduler) {
      this._computeCommentingRangeScheduler.trigger(() => {
        const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
        if (editorURI) {
          return this.commentService.getDocumentComments(editorURI);
        }
        return Promise.resolve([]);
      }).then((commentInfos) => {
        if (this.commentService.isCommentingEnabled) {
          const meaningfulCommentInfos = coalesce(commentInfos);
          this._commentingRangeDecorator.update(this.editor, meaningfulCommentInfos, this.editor?.getPosition()?.lineNumber, this.editor?.getSelection() ?? void 0);
        }
      }, (err) => {
        onUnexpectedError(err);
        return null;
      });
    }
  }
  static get(editor) {
    return editor.getContribution(ID);
  }
  revealCommentThread(threadId, commentUniqueId, fetchOnceIfNotExist, focus) {
    const commentThreadWidget = this._commentWidgets.filter((widget) => widget.commentThread.threadId === threadId);
    if (commentThreadWidget.length === 1) {
      commentThreadWidget[0].reveal(commentUniqueId, focus);
    } else if (fetchOnceIfNotExist) {
      if (this._computeAndSetPromise) {
        this._computeAndSetPromise.then((_) => {
          this.revealCommentThread(threadId, commentUniqueId, false, focus);
        });
      } else {
        this.beginCompute().then((_) => {
          this.revealCommentThread(threadId, commentUniqueId, false, focus);
        });
      }
    }
  }
  collapseAll() {
    for (const widget of this._commentWidgets) {
      widget.collapse(true);
    }
  }
  async collapseVisibleComments() {
    if (!this.editor) {
      return;
    }
    const visibleRanges = this.editor.getVisibleRanges();
    for (const widget of this._commentWidgets) {
      if (widget.expanded && widget.commentThread.range) {
        const isVisible = visibleRanges.some(
          (visibleRange) => Range.areIntersectingOrTouching(visibleRange, widget.commentThread.range)
        );
        if (isVisible) {
          await widget.collapse(true);
        }
      }
    }
  }
  _updateCommentWidgetVisibleContext() {
    const hasExpanded = this._commentWidgets.some((widget) => widget.expanded);
    this._commentWidgetVisible.set(hasExpanded);
  }
  expandAll() {
    for (const widget of this._commentWidgets) {
      widget.expand();
    }
  }
  expandUnresolved() {
    for (const widget of this._commentWidgets) {
      if (widget.commentThread.state === languages.CommentThreadState.Unresolved) {
        widget.expand();
      }
    }
  }
  nextCommentThread(focusThread) {
    this._findNearestCommentThread(focusThread);
  }
  _findNearestCommentThread(focusThread, reverse) {
    if (!this._commentWidgets.length || !this.editor?.hasModel()) {
      return;
    }
    const after = reverse ? this.editor.getSelection().getStartPosition() : this.editor.getSelection().getEndPosition();
    const sortedWidgets = this._commentWidgets.sort((a, b) => {
      if (reverse) {
        const temp = a;
        a = b;
        b = temp;
      }
      if (a.commentThread.range === void 0) {
        return -1;
      }
      if (b.commentThread.range === void 0) {
        return 1;
      }
      if (a.commentThread.range.startLineNumber < b.commentThread.range.startLineNumber) {
        return -1;
      }
      if (a.commentThread.range.startLineNumber > b.commentThread.range.startLineNumber) {
        return 1;
      }
      if (a.commentThread.range.startColumn < b.commentThread.range.startColumn) {
        return -1;
      }
      if (a.commentThread.range.startColumn > b.commentThread.range.startColumn) {
        return 1;
      }
      return 0;
    });
    const idx = findFirstIdxMonotonousOrArrLen(sortedWidgets, (widget) => {
      const lineValueOne = reverse ? after.lineNumber : widget.commentThread.range?.startLineNumber ?? 0;
      const lineValueTwo = reverse ? widget.commentThread.range?.startLineNumber ?? 0 : after.lineNumber;
      const columnValueOne = reverse ? after.column : widget.commentThread.range?.startColumn ?? 0;
      const columnValueTwo = reverse ? widget.commentThread.range?.startColumn ?? 0 : after.column;
      if (lineValueOne > lineValueTwo) {
        return true;
      }
      if (lineValueOne < lineValueTwo) {
        return false;
      }
      if (columnValueOne > columnValueTwo) {
        return true;
      }
      return false;
    });
    const nextWidget = sortedWidgets[idx];
    if (nextWidget !== void 0) {
      this.editor.setSelection(nextWidget.commentThread.range ?? new Range(1, 1, 1, 1));
      nextWidget.reveal(void 0, focusThread ? CommentWidgetFocus.Widget : CommentWidgetFocus.None);
    }
  }
  previousCommentThread(focusThread) {
    this._findNearestCommentThread(focusThread, true);
  }
  _findNearestCommentingRange(reverse) {
    if (!this.editor?.hasModel()) {
      return;
    }
    const after = this.editor.getSelection().getEndPosition();
    const range = this._commentingRangeDecorator.getNearestCommentingRange(after, reverse);
    if (range) {
      const position = reverse ? range.getEndPosition() : range.getStartPosition();
      this.editor.setPosition(position);
      this.editor.revealLineInCenterIfOutsideViewport(position.lineNumber);
    }
    if (this.accessibilityService.isScreenReaderOptimized()) {
      const commentRangeStart = range?.getStartPosition().lineNumber;
      const commentRangeEnd = range?.getEndPosition().lineNumber;
      if (commentRangeStart && commentRangeEnd) {
        const oneLine = commentRangeStart === commentRangeEnd;
        oneLine ? status(nls.localize("commentRange", "Line {0}", commentRangeStart)) : status(nls.localize("commentRangeStart", "Lines {0} to {1}", commentRangeStart, commentRangeEnd));
      }
    }
  }
  nextCommentingRange() {
    this._findNearestCommentingRange();
  }
  previousCommentingRange() {
    this._findNearestCommentingRange(true);
  }
  dispose() {
    super.dispose();
    dispose(this._editorDisposables);
    dispose(this._commentWidgets);
    this.editor = null;
  }
  onWillChangeModel(e) {
    if (e.newModelUrl) {
      this.tryUpdateReservedSpace(e.newModelUrl);
    }
  }
  async handleCommentAdded(editorId, uniqueOwner, thread) {
    const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId);
    if (matchedZones.length) {
      return;
    }
    const matchedNewCommentThreadZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === uniqueOwner && zoneWidget.commentThread.commentThreadHandle === -1 && Range.equalsRange(zoneWidget.commentThread.range, thread.range));
    if (matchedNewCommentThreadZones.length) {
      matchedNewCommentThreadZones[0].update(thread);
      return;
    }
    const continueOnCommentIndex = this._inProcessContinueOnComments.get(uniqueOwner)?.findIndex((pending) => {
      if (pending.range === void 0) {
        return thread.range === void 0;
      } else {
        return Range.lift(pending.range).equalsRange(thread.range);
      }
    });
    let continueOnCommentText;
    if (continueOnCommentIndex !== void 0 && continueOnCommentIndex >= 0) {
      continueOnCommentText = this._inProcessContinueOnComments.get(uniqueOwner)?.splice(continueOnCommentIndex, 1)[0].comment.body;
    }
    const pendingCommentText = (this._pendingNewCommentCache[uniqueOwner] && this._pendingNewCommentCache[uniqueOwner][thread.threadId]) ?? continueOnCommentText;
    const pendingEdits = this._pendingEditsCache[uniqueOwner] && this._pendingEditsCache[uniqueOwner][thread.threadId];
    const shouldReveal = thread.canReply && thread.isTemplate && (!thread.comments || thread.comments.length === 0) && (!thread.editorId || thread.editorId === editorId);
    await this.displayCommentThread(uniqueOwner, thread, shouldReveal, pendingCommentText, pendingEdits);
    this._commentInfos.filter((info) => info.uniqueOwner === uniqueOwner)[0].threads.push(thread);
    this.tryUpdateReservedSpace();
  }
  onModelChanged() {
    this.localToDispose.clear();
    this.tryUpdateReservedSpace();
    this.removeCommentWidgetsAndStoreCache();
    if (!this.editor) {
      return;
    }
    this._hasRespondedToEditorChange = false;
    this.localToDispose.add(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
    this.localToDispose.add(this.editor.onMouseUp((e) => this.onEditorMouseUp(e)));
    if (this._editorDisposables.length) {
      this.clearEditorListeners();
      this.registerEditorListeners();
    }
    this._computeCommentingRangeScheduler = new Delayer(200);
    this.localToDispose.add({
      dispose: () => {
        this._computeCommentingRangeScheduler?.cancel();
        this._computeCommentingRangeScheduler = null;
      }
    });
    this.localToDispose.add(this.editor.onDidChangeModelContent(async () => {
      this.beginComputeCommentingRanges();
    }));
    this.localToDispose.add(this.commentService.onDidUpdateCommentThreads(async (e) => {
      const editorURI = this.editor && this.editor.hasModel() && this.editor.getModel().uri;
      if (!editorURI || !this.commentService.isCommentingEnabled) {
        return;
      }
      if (this._computePromise) {
        await this._computePromise;
      }
      const commentInfo = this._commentInfos.filter((info) => info.uniqueOwner === e.uniqueOwner);
      if (!commentInfo || !commentInfo.length) {
        return;
      }
      const added = e.added.filter((thread) => thread.resource && this.uriIdentityService.extUri.isEqual(URI.parse(thread.resource), editorURI));
      const removed = e.removed.filter((thread) => thread.resource && this.uriIdentityService.extUri.isEqual(URI.parse(thread.resource), editorURI));
      const changed = e.changed.filter((thread) => thread.resource && this.uriIdentityService.extUri.isEqual(URI.parse(thread.resource), editorURI));
      const pending = e.pending.filter((pending2) => this.uriIdentityService.extUri.isEqual(pending2.uri, editorURI));
      removed.forEach((thread) => {
        const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === e.uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId && zoneWidget.commentThread.threadId !== "");
        if (matchedZones.length) {
          const matchedZone = matchedZones[0];
          const index = this._commentWidgets.indexOf(matchedZone);
          this._commentWidgets.splice(index, 1);
          matchedZone.dispose();
        }
        const infosThreads = this._commentInfos.filter((info) => info.uniqueOwner === e.uniqueOwner)[0].threads;
        for (let i = 0; i < infosThreads.length; i++) {
          if (infosThreads[i] === thread) {
            infosThreads.splice(i, 1);
            i--;
          }
        }
      });
      for (const thread of changed) {
        const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === e.uniqueOwner && zoneWidget.commentThread.threadId === thread.threadId);
        if (matchedZones.length) {
          const matchedZone = matchedZones[0];
          matchedZone.update(thread);
          this.openCommentsView(thread);
        }
      }
      const editorId = this.editor?.getId();
      for (const thread of added) {
        await this.handleCommentAdded(editorId, e.uniqueOwner, thread);
      }
      for (const thread of pending) {
        await this.resumePendingComment(editorURI, thread);
      }
      this._commentThreadRangeDecorator.update(this.editor, commentInfo);
    }));
    this.beginComputeAndHandleEditorChange();
  }
  async resumePendingComment(editorURI, thread) {
    const matchedZones = this._commentWidgets.filter((zoneWidget) => zoneWidget.uniqueOwner === thread.uniqueOwner && Range.lift(zoneWidget.commentThread.range)?.equalsRange(thread.range));
    if (thread.isReply && matchedZones.length) {
      this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: true });
      matchedZones[0].setPendingComment(thread.comment);
    } else if (matchedZones.length) {
      this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: false });
      const existingPendingComment = matchedZones[0].getPendingComments().newComment;
      let pendingComment;
      if (!existingPendingComment || thread.comment.body.includes(existingPendingComment.body)) {
        pendingComment = thread.comment;
      } else if (existingPendingComment.body.includes(thread.comment.body)) {
        pendingComment = existingPendingComment;
      } else {
        pendingComment = { body: `${existingPendingComment}
${thread.comment.body}`, cursor: thread.comment.cursor };
      }
      matchedZones[0].setPendingComment(pendingComment);
    } else if (!thread.isReply) {
      const threadStillAvailable = this.commentService.removeContinueOnComment({ uniqueOwner: thread.uniqueOwner, uri: editorURI, range: thread.range, isReply: false });
      if (!threadStillAvailable) {
        return;
      }
      if (!this._inProcessContinueOnComments.has(thread.uniqueOwner)) {
        this._inProcessContinueOnComments.set(thread.uniqueOwner, []);
      }
      this._inProcessContinueOnComments.get(thread.uniqueOwner)?.push(thread);
      await this.commentService.createCommentThreadTemplate(thread.uniqueOwner, thread.uri, thread.range ? Range.lift(thread.range) : void 0);
    }
  }
  beginComputeAndHandleEditorChange() {
    this.beginCompute().then(() => {
      if (!this._hasRespondedToEditorChange) {
        if (this._commentInfos.some((commentInfo) => commentInfo.commentingRanges.ranges.length > 0 || commentInfo.commentingRanges.fileComments)) {
          this._hasRespondedToEditorChange = true;
          const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Comments);
          if (verbose) {
            const keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getAriaLabel();
            if (keybinding) {
              status(nls.localize("hasCommentRangesKb", "Editor has commenting ranges, run the command Open Accessibility Help ({0}), for more information.", keybinding));
            } else {
              status(nls.localize("hasCommentRangesNoKb", "Editor has commenting ranges, run the command Open Accessibility Help, which is currently not triggerable via keybinding, for more information."));
            }
          } else {
            status(nls.localize("hasCommentRanges", "Editor has commenting ranges."));
          }
        }
      }
    });
  }
  async openCommentsView(thread) {
    if (thread.comments && thread.comments.length > 0 && threadHasMeaningfulComments(thread)) {
      const openViewState = this.configurationService.getValue(COMMENTS_SECTION).openView;
      if (openViewState === "file") {
        return this.viewsService.openView(COMMENTS_VIEW_ID);
      } else if (openViewState === "firstFile" || openViewState === "firstFileUnresolved" && thread.state === languages.CommentThreadState.Unresolved) {
        const hasShownView = this.viewsService.getViewWithId(COMMENTS_VIEW_ID)?.hasRendered;
        if (!hasShownView) {
          return this.viewsService.openView(COMMENTS_VIEW_ID);
        }
      }
    }
    return void 0;
  }
  async displayCommentThread(uniqueOwner, thread, shouldReveal, pendingComment, pendingEdits) {
    const editor = this.editor?.getModel();
    if (!editor) {
      return;
    }
    if (!this.editor || this.isEditorInlineOriginal(this.editor)) {
      return;
    }
    let continueOnCommentReply;
    if (thread.range && !pendingComment) {
      continueOnCommentReply = this.commentService.removeContinueOnComment({ uniqueOwner, uri: editor.uri, range: thread.range, isReply: true });
    }
    const zoneWidget = this.instantiationService.createInstance(ReviewZoneWidget, this.editor, uniqueOwner, thread, pendingComment ?? continueOnCommentReply?.comment, pendingEdits);
    await zoneWidget.display(thread.range, shouldReveal);
    this._commentWidgets.push(zoneWidget);
    this.localToDispose.add(zoneWidget.onDidChangeExpandedState(() => this._updateCommentWidgetVisibleContext()));
    this.localToDispose.add(zoneWidget.onDidClose(() => this._updateCommentWidgetVisibleContext()));
    this.openCommentsView(thread);
  }
  onEditorMouseDown(e) {
    this.mouseDownInfo = (e.target.element?.className.indexOf("comment-range-glyph") ?? -1) >= 0 ? parseMouseDownInfoFromEvent(e) : null;
  }
  onEditorMouseUp(e) {
    const matchedLineNumber = isMouseUpEventDragFromMouseDown(this.mouseDownInfo, e);
    this.mouseDownInfo = null;
    if (!this.editor || matchedLineNumber === null || !e.target.element) {
      return;
    }
    const mouseUpIsOnDecorator = e.target.element.className.indexOf("comment-range-glyph") >= 0;
    const lineNumber = e.target.position.lineNumber;
    let range;
    let selection;
    if (matchedLineNumber !== lineNumber) {
      if (matchedLineNumber > lineNumber) {
        selection = new Range(matchedLineNumber, this.editor.getModel().getLineLength(matchedLineNumber) + 1, lineNumber, 1);
      } else {
        selection = new Range(matchedLineNumber, 1, lineNumber, this.editor.getModel().getLineLength(lineNumber) + 1);
      }
    } else if (mouseUpIsOnDecorator) {
      selection = this.editor.getSelection();
    }
    if (selection && selection.startLineNumber <= lineNumber && lineNumber <= selection.endLineNumber) {
      range = selection;
      this.editor.setSelection(new Range(selection.endLineNumber, 1, selection.endLineNumber, 1));
    } else if (mouseUpIsOnDecorator) {
      range = new Range(lineNumber, 1, lineNumber, 1);
    }
    if (range) {
      this.addOrToggleCommentAtLine(range, e);
    }
  }
  getCommentsAtLine(commentRange) {
    return this._commentWidgets.filter((widget) => widget.getGlyphPosition() === (commentRange ? commentRange.endLineNumber : 0));
  }
  async addOrToggleCommentAtLine(commentRange, e) {
    if (!this._addInProgress) {
      this._addInProgress = true;
      const existingCommentsAtLine = this.getCommentsAtLine(commentRange);
      if (existingCommentsAtLine.length) {
        const allExpanded = existingCommentsAtLine.every((widget) => widget.expanded);
        existingCommentsAtLine.forEach(allExpanded ? (widget) => widget.collapse(true) : (widget) => widget.expand(true));
        this.processNextThreadToAdd();
        return;
      } else {
        this.addCommentAtLine(commentRange, e);
      }
    } else {
      this._emptyThreadsToAddQueue.push([commentRange, e]);
    }
  }
  processNextThreadToAdd() {
    this._addInProgress = false;
    const info = this._emptyThreadsToAddQueue.shift();
    if (info) {
      this.addOrToggleCommentAtLine(info[0], info[1]);
    }
  }
  clipUserRangeToCommentRange(userRange, commentRange) {
    if (userRange.startLineNumber < commentRange.startLineNumber) {
      userRange = new Range(commentRange.startLineNumber, commentRange.startColumn, userRange.endLineNumber, userRange.endColumn);
    }
    if (userRange.endLineNumber > commentRange.endLineNumber) {
      userRange = new Range(userRange.startLineNumber, userRange.startColumn, commentRange.endLineNumber, commentRange.endColumn);
    }
    return userRange;
  }
  addCommentAtLine(range, e) {
    const newCommentInfos = this._commentingRangeDecorator.getMatchedCommentAction(range);
    if (!newCommentInfos.length || !this.editor?.hasModel()) {
      this._addInProgress = false;
      if (!newCommentInfos.length) {
        if (range) {
          this.notificationService.error(nls.localize("comments.addCommand.error", "The cursor must be within a commenting range to add a comment."));
        } else {
          this.notificationService.error(nls.localize("comments.addFileCommentCommand.error", "File comments are not allowed on this file."));
        }
      }
      return Promise.resolve();
    }
    if (newCommentInfos.length > 1) {
      if (e && range) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => e.event,
          getActions: () => this.getContextMenuActions(newCommentInfos, range),
          getActionsContext: () => newCommentInfos.length ? newCommentInfos[0] : void 0,
          onHide: () => {
            this._addInProgress = false;
          }
        });
        return Promise.resolve();
      } else {
        const picks = this.getCommentProvidersQuickPicks(newCommentInfos);
        return this.quickInputService.pick(picks, { placeHolder: nls.localize("pickCommentService", "Select Comment Provider"), matchOnDescription: true }).then((pick) => {
          if (!pick) {
            return;
          }
          const commentInfos = newCommentInfos.filter((info) => info.action.ownerId === pick.id);
          if (commentInfos.length) {
            const { ownerId } = commentInfos[0].action;
            const clippedRange = range && commentInfos[0].range ? this.clipUserRangeToCommentRange(range, commentInfos[0].range) : range;
            this.addCommentAtLine2(clippedRange, ownerId);
          }
        }).then(() => {
          this._addInProgress = false;
        });
      }
    } else {
      const { ownerId } = newCommentInfos[0].action;
      const clippedRange = range && newCommentInfos[0].range ? this.clipUserRangeToCommentRange(range, newCommentInfos[0].range) : range;
      this.addCommentAtLine2(clippedRange, ownerId);
    }
    return Promise.resolve();
  }
  getCommentProvidersQuickPicks(commentInfos) {
    const picks = commentInfos.map((commentInfo) => {
      const { ownerId, extensionId, label } = commentInfo.action;
      return {
        label: label ?? extensionId ?? ownerId,
        id: ownerId
      };
    });
    return picks;
  }
  getContextMenuActions(commentInfos, commentRange) {
    const actions = [];
    commentInfos.forEach((commentInfo) => {
      const { ownerId, extensionId, label } = commentInfo.action;
      actions.push(new Action(
        "addCommentThread",
        `${label || extensionId}`,
        void 0,
        true,
        () => {
          const clippedRange = commentInfo.range ? this.clipUserRangeToCommentRange(commentRange, commentInfo.range) : commentRange;
          this.addCommentAtLine2(clippedRange, ownerId);
          return Promise.resolve();
        }
      ));
    });
    return actions;
  }
  addCommentAtLine2(range, ownerId) {
    if (!this.editor) {
      return;
    }
    this.commentService.createCommentThreadTemplate(ownerId, this.editor.getModel().uri, range, this.editor.getId());
    this.processNextThreadToAdd();
    return;
  }
  getExistingCommentEditorOptions(editor) {
    const lineDecorationsWidth = editor.getOption(EditorOption.lineDecorationsWidth);
    let extraEditorClassName = [];
    const configuredExtraClassName = editor.getRawOptions().extraEditorClassName;
    if (configuredExtraClassName) {
      extraEditorClassName = configuredExtraClassName.split(" ");
    }
    return { lineDecorationsWidth, extraEditorClassName };
  }
  getWithoutCommentsEditorOptions(editor, extraEditorClassName, startingLineDecorationsWidth) {
    let lineDecorationsWidth = startingLineDecorationsWidth;
    const inlineCommentPos = extraEditorClassName.findIndex((name) => name === "inline-comment");
    if (inlineCommentPos >= 0) {
      extraEditorClassName.splice(inlineCommentPos, 1);
    }
    const options = editor.getOptions();
    if (options.get(EditorOption.folding) && options.get(EditorOption.showFoldingControls) !== "never") {
      lineDecorationsWidth += 11;
    }
    lineDecorationsWidth -= 24;
    return { extraEditorClassName, lineDecorationsWidth };
  }
  getWithCommentsLineDecorationWidth(editor, startingLineDecorationsWidth) {
    let lineDecorationsWidth = startingLineDecorationsWidth;
    const options = editor.getOptions();
    if (options.get(EditorOption.folding) && options.get(EditorOption.showFoldingControls) !== "never") {
      lineDecorationsWidth -= 11;
    }
    lineDecorationsWidth += 24;
    this._commentingRangeAmountReserved = lineDecorationsWidth;
    return this._commentingRangeAmountReserved;
  }
  getWithCommentsEditorOptions(editor, extraEditorClassName, startingLineDecorationsWidth) {
    extraEditorClassName.push("inline-comment");
    return { lineDecorationsWidth: this.getWithCommentsLineDecorationWidth(editor, startingLineDecorationsWidth), extraEditorClassName };
  }
  updateEditorLayoutOptions(editor, extraEditorClassName, lineDecorationsWidth) {
    editor.updateOptions({
      extraEditorClassName: extraEditorClassName.join(" "),
      lineDecorationsWidth
    });
  }
  ensureCommentingRangeReservedAmount(editor) {
    const existing = this.getExistingCommentEditorOptions(editor);
    if (existing.lineDecorationsWidth !== this._commentingRangeAmountReserved) {
      editor.updateOptions({
        lineDecorationsWidth: this.getWithCommentsLineDecorationWidth(editor, existing.lineDecorationsWidth)
      });
    }
  }
  tryUpdateReservedSpace(uri) {
    if (!this.editor) {
      return;
    }
    const hasCommentsOrRangesInInfo = this._commentInfos.some((info) => {
      const hasRanges = Boolean(info.commentingRanges && (Array.isArray(info.commentingRanges) ? info.commentingRanges : info.commentingRanges.ranges).length);
      return hasRanges || info.threads.length > 0;
    });
    uri = uri ?? this.editor.getModel()?.uri;
    const resourceHasCommentingRanges = uri ? this.commentService.resourceHasCommentingRanges(uri) : false;
    const hasCommentsOrRanges = hasCommentsOrRangesInInfo || resourceHasCommentingRanges;
    if (hasCommentsOrRanges && this.commentService.isCommentingEnabled) {
      if (!this._commentingRangeSpaceReserved) {
        this._commentingRangeSpaceReserved = true;
        const { lineDecorationsWidth, extraEditorClassName } = this.getExistingCommentEditorOptions(this.editor);
        const newOptions = this.getWithCommentsEditorOptions(this.editor, extraEditorClassName, lineDecorationsWidth);
        this.updateEditorLayoutOptions(this.editor, newOptions.extraEditorClassName, newOptions.lineDecorationsWidth);
      } else {
        this.ensureCommentingRangeReservedAmount(this.editor);
      }
    } else if ((!hasCommentsOrRanges || !this.commentService.isCommentingEnabled) && this._commentingRangeSpaceReserved) {
      this._commentingRangeSpaceReserved = false;
      const { lineDecorationsWidth, extraEditorClassName } = this.getExistingCommentEditorOptions(this.editor);
      const newOptions = this.getWithoutCommentsEditorOptions(this.editor, extraEditorClassName, lineDecorationsWidth);
      this.updateEditorLayoutOptions(this.editor, newOptions.extraEditorClassName, newOptions.lineDecorationsWidth);
    }
  }
  async setComments(commentInfos) {
    if (!this.editor || !this.commentService.isCommentingEnabled) {
      return;
    }
    this._commentInfos = commentInfos;
    this.tryUpdateReservedSpace();
    this.removeCommentWidgetsAndStoreCache();
    let hasCommentingRanges = false;
    for (const info of this._commentInfos) {
      if (!hasCommentingRanges && (info.commentingRanges.ranges.length > 0 || info.commentingRanges.fileComments)) {
        hasCommentingRanges = true;
      }
      const providerCacheStore = this._pendingNewCommentCache[info.uniqueOwner];
      const providerEditsCacheStore = this._pendingEditsCache[info.uniqueOwner];
      info.threads = info.threads.filter((thread) => !thread.isDisposed);
      for (const thread of info.threads) {
        let pendingComment = void 0;
        if (providerCacheStore) {
          pendingComment = providerCacheStore[thread.threadId];
        }
        let pendingEdits = void 0;
        if (providerEditsCacheStore) {
          pendingEdits = providerEditsCacheStore[thread.threadId];
        }
        await this.displayCommentThread(info.uniqueOwner, thread, false, pendingComment, pendingEdits);
      }
      for (const thread of info.pendingCommentThreads ?? []) {
        this.resumePendingComment(this.editor.getModel().uri, thread);
      }
    }
    this._commentingRangeDecorator.update(this.editor, this._commentInfos);
    this._commentThreadRangeDecorator.update(this.editor, this._commentInfos);
    if (hasCommentingRanges) {
      this._activeEditorHasCommentingRange.set(true);
    } else {
      this._activeEditorHasCommentingRange.set(false);
    }
  }
  collapseAndFocusRange(threadId) {
    this._commentWidgets?.find((widget) => widget.commentThread.threadId === threadId)?.collapseAndFocusRange();
  }
  removeCommentWidgetsAndStoreCache() {
    if (this._commentWidgets) {
      this._commentWidgets.forEach((zone) => {
        const pendingComments = zone.getPendingComments();
        const pendingNewComment = pendingComments.newComment;
        const providerNewCommentCacheStore = this._pendingNewCommentCache[zone.uniqueOwner];
        let lastCommentBody;
        if (zone.commentThread.comments && zone.commentThread.comments.length) {
          const lastComment = zone.commentThread.comments[zone.commentThread.comments.length - 1];
          if (typeof lastComment.body === "string") {
            lastCommentBody = lastComment.body;
          } else {
            lastCommentBody = lastComment.body.value;
          }
        }
        if (pendingNewComment && pendingNewComment.body !== lastCommentBody) {
          if (!providerNewCommentCacheStore) {
            this._pendingNewCommentCache[zone.uniqueOwner] = {};
          }
          this._pendingNewCommentCache[zone.uniqueOwner][zone.commentThread.threadId] = pendingNewComment;
        } else {
          if (providerNewCommentCacheStore) {
            delete providerNewCommentCacheStore[zone.commentThread.threadId];
          }
        }
        const pendingEdits = pendingComments.edits;
        const providerEditsCacheStore = this._pendingEditsCache[zone.uniqueOwner];
        if (Object.keys(pendingEdits).length > 0) {
          if (!providerEditsCacheStore) {
            this._pendingEditsCache[zone.uniqueOwner] = {};
          }
          this._pendingEditsCache[zone.uniqueOwner][zone.commentThread.threadId] = pendingEdits;
        } else if (providerEditsCacheStore) {
          delete providerEditsCacheStore[zone.commentThread.threadId];
        }
        zone.dispose();
      });
    }
    this._commentWidgets = [];
  }
};
CommentController = __decorateClass([
  __decorateParam(1, ICommentService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, IViewsService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IAccessibilityService),
  __decorateParam(12, INotificationService),
  __decorateParam(13, IUriIdentityService)
], CommentController);
export {
  CommentController,
  ID,
  moveToNextCommentInThread,
  revealCommentThread
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudHNDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBmaW5kRmlyc3RJZHhNb25vdG9ub3VzT3JBcnJMZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICcuL21lZGlhL3Jldmlldy5jc3MnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElFZGl0b3JNb3VzZUV2ZW50LCBpc0NvZGVFZGl0b3IsIGlzRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JUeXBlLCBJRGlmZkVkaXRvciwgSUVkaXRvciwgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSU1vZGVsQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIElNb2RlbERlbHRhRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgQ29tbWVudEdseXBoV2lkZ2V0IH0gZnJvbSAnLi9jb21tZW50R2x5cGhXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbW1lbnRJbmZvLCBJQ29tbWVudFNlcnZpY2UgfSBmcm9tICcuL2NvbW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbW1lbnRXaWRnZXRGb2N1cywgaXNNb3VzZVVwRXZlbnREcmFnRnJvbU1vdXNlRG93biwgcGFyc2VNb3VzZURvd25JbmZvRnJvbUV2ZW50LCBSZXZpZXdab25lV2lkZ2V0IH0gZnJvbSAnLi9jb21tZW50VGhyZWFkWm9uZVdpZGdldC5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENPTU1FTlRTX1ZJRVdfSUQgfSBmcm9tICcuL2NvbW1lbnRzVHJlZVZpZXdlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENPTU1FTlRTX1NFQ1RJT04sIElDb21tZW50c0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vY29tbWVudHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENPTU1FTlRFRElUT1JfREVDT1JBVElPTl9LRVkgfSBmcm9tICcuL2NvbW1lbnRSZXBseS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgQ29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yIH0gZnJvbSAnLi9jb21tZW50VGhyZWFkUmFuZ2VEZWNvcmF0b3IuanMnO1xuaW1wb3J0IHsgSUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCB7IENvbW1lbnRzUGFuZWwgfSBmcm9tICcuL2NvbW1lbnRzVmlldy5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IENvbW1lbnRDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyB0aHJlYWRIYXNNZWFuaW5nZnVsQ29tbWVudHMgfSBmcm9tICcuL2NvbW1lbnRzTW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBJRCA9ICdlZGl0b3IuY29udHJpYi5yZXZpZXcnO1xuXG5pbnRlcmZhY2UgQ29tbWVudFJhbmdlQWN0aW9uIHtcblx0b3duZXJJZDogc3RyaW5nO1xuXHRleHRlbnNpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjb21tZW50aW5nUmFuZ2VzSW5mbzogbGFuZ3VhZ2VzLkNvbW1lbnRpbmdSYW5nZXM7XG59XG5cbmludGVyZmFjZSBNZXJnZWRDb21tZW50UmFuZ2VBY3Rpb25zIHtcblx0cmFuZ2U/OiBSYW5nZTtcblx0YWN0aW9uOiBDb21tZW50UmFuZ2VBY3Rpb247XG59XG5cbmNsYXNzIENvbW1lbnRpbmdSYW5nZURlY29yYXRpb24gaW1wbGVtZW50cyBJTW9kZWxEZWx0YURlY29yYXRpb24ge1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHByaXZhdGUgX2VuZExpbmVOdW1iZXI6IG51bWJlcjtcblxuXHRwdWJsaWMgZ2V0IGlkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25JZDtcblx0fVxuXG5cdHB1YmxpYyBzZXQgaWQoaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2RlY29yYXRpb25JZCA9IGlkO1xuXHR9XG5cblx0cHVibGljIGdldCByYW5nZSgpOiBJUmFuZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IHRoaXMuX3N0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IDEsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiB0aGlzLl9lbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IDFcblx0XHR9O1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfZWRpdG9yOiBJQ29kZUVkaXRvciwgcHJpdmF0ZSBfb3duZXJJZDogc3RyaW5nLCBwcml2YXRlIF9leHRlbnNpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBwcml2YXRlIF9sYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBwcml2YXRlIF9yYW5nZTogSVJhbmdlLCBwdWJsaWMgcmVhZG9ubHkgb3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgcHJpdmF0ZSBjb21tZW50aW5nUmFuZ2VzSW5mbzogbGFuZ3VhZ2VzLkNvbW1lbnRpbmdSYW5nZXMsIHB1YmxpYyByZWFkb25seSBpc0hvdmVyOiBib29sZWFuID0gZmFsc2UpIHtcblx0XHR0aGlzLl9zdGFydExpbmVOdW1iZXIgPSBfcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdHRoaXMuX2VuZExpbmVOdW1iZXIgPSBfcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb21tZW50QWN0aW9uKCk6IENvbW1lbnRSYW5nZUFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4dGVuc2lvbklkOiB0aGlzLl9leHRlbnNpb25JZCxcblx0XHRcdGxhYmVsOiB0aGlzLl9sYWJlbCxcblx0XHRcdG93bmVySWQ6IHRoaXMuX293bmVySWQsXG5cdFx0XHRjb21tZW50aW5nUmFuZ2VzSW5mbzogdGhpcy5jb21tZW50aW5nUmFuZ2VzSW5mb1xuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3JpZ2luYWxSYW5nZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWN0aXZlUmFuZ2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuaWQgPyB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0RGVjb3JhdGlvblJhbmdlKHRoaXMuaWQpIDogdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIENvbW1lbnRpbmdSYW5nZURlY29yYXRvciB7XG5cdHB1YmxpYyBzdGF0aWMgZGVzY3JpcHRpb24gPSAnY29tbWVudGluZy1yYW5nZS1kZWNvcmF0b3InO1xuXHRwcml2YXRlIGRlY29yYXRpb25PcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRwcml2YXRlIGhvdmVyRGVjb3JhdGlvbk9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgbXVsdGlsaW5lRGVjb3JhdGlvbk9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHByaXZhdGUgY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnM6IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb25bXSA9IFtdO1xuXHRwcml2YXRlIGRlY29yYXRpb25JZHM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX2VkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2luZm9zOiBJQ29tbWVudEluZm9bXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEhvdmVyOiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSBfbGFzdFNlbGVjdGlvbjogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RTZWxlY3Rpb25DdXJzb3I6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VEZWNvcmF0aW9uc0NvdW50OiBFbWl0dGVyPG51bWJlcj4gPSBuZXcgRW1pdHRlcigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VEZWNvcmF0aW9uc0NvdW50ID0gdGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9uc0NvdW50LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlY29yYXRpb25PcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBDb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IuZGVzY3JpcHRpb24sXG5cdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdGxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWU6ICdjb21tZW50LXJhbmdlLWdseXBoIGNvbW1lbnQtZGlmZi1hZGRlZCdcblx0XHR9O1xuXG5cdFx0dGhpcy5kZWNvcmF0aW9uT3B0aW9ucyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyhkZWNvcmF0aW9uT3B0aW9ucyk7XG5cblx0XHRjb25zdCBob3ZlckRlY29yYXRpb25PcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBDb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IuZGVzY3JpcHRpb24sXG5cdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdGxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWU6IGBjb21tZW50LXJhbmdlLWdseXBoIGxpbmUtaG92ZXJgXG5cdFx0fTtcblxuXHRcdHRoaXMuaG92ZXJEZWNvcmF0aW9uT3B0aW9ucyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyhob3ZlckRlY29yYXRpb25PcHRpb25zKTtcblxuXHRcdGNvbnN0IG11bHRpbGluZURlY29yYXRpb25PcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBDb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IuZGVzY3JpcHRpb24sXG5cdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdGxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWU6IGBjb21tZW50LXJhbmdlLWdseXBoIG11bHRpbGluZS1hZGRgXG5cdFx0fTtcblxuXHRcdHRoaXMubXVsdGlsaW5lRGVjb3JhdGlvbk9wdGlvbnMgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWMobXVsdGlsaW5lRGVjb3JhdGlvbk9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZUhvdmVyKGhvdmVyTGluZT86IG51bWJlcikge1xuXHRcdGlmICh0aGlzLl9lZGl0b3IgJiYgdGhpcy5faW5mb3MgJiYgKGhvdmVyTGluZSAhPT0gdGhpcy5fbGFzdEhvdmVyKSkge1xuXHRcdFx0dGhpcy5fZG9VcGRhdGUodGhpcy5fZWRpdG9yLCB0aGlzLl9pbmZvcywgaG92ZXJMaW5lKTtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdEhvdmVyID0gaG92ZXJMaW5lID8/IC0xO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVNlbGVjdGlvbihjdXJzb3JMaW5lOiBudW1iZXIsIHJhbmdlOiBSYW5nZSA9IG5ldyBSYW5nZSgwLCAwLCAwLCAwKSkge1xuXHRcdHRoaXMuX2xhc3RTZWxlY3Rpb24gPSByYW5nZS5pc0VtcHR5KCkgPyB1bmRlZmluZWQgOiByYW5nZTtcblx0XHR0aGlzLl9sYXN0U2VsZWN0aW9uQ3Vyc29yID0gcmFuZ2UuaXNFbXB0eSgpID8gdW5kZWZpbmVkIDogY3Vyc29yTGluZTtcblx0XHQvLyBTb21lIHNjZW5hcmlvczpcblx0XHQvLyBTZWxlY3Rpb24gaXMgbWFkZS4gRW1waGFzaXMgc2hvdWxkIHNob3cgb24gdGhlIGRyYWcvc2VsZWN0aW9uIGVuZCBsb2NhdGlvbi5cblx0XHQvLyBTZWxlY3Rpb24gaXMgbWFkZSwgdGhlbiB1c2VyIGNsaWNrcyBlbHNld2hlcmUuIFdlIHNob3VsZCBzdGlsbCBzaG93IHRoZSBkZWNvcmF0aW9uLlxuXHRcdGlmICh0aGlzLl9lZGl0b3IgJiYgdGhpcy5faW5mb3MpIHtcblx0XHRcdHRoaXMuX2RvVXBkYXRlKHRoaXMuX2VkaXRvciwgdGhpcy5faW5mb3MsIGN1cnNvckxpbmUsIHJhbmdlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlKGVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQsIGNvbW1lbnRJbmZvczogSUNvbW1lbnRJbmZvW10sIGN1cnNvckxpbmU/OiBudW1iZXIsIHJhbmdlPzogUmFuZ2UpIHtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0XHR0aGlzLl9pbmZvcyA9IGNvbW1lbnRJbmZvcztcblx0XHRcdHRoaXMuX2RvVXBkYXRlKGVkaXRvciwgY29tbWVudEluZm9zLCBjdXJzb3JMaW5lLCByYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbGluZUhhc1RocmVhZChlZGl0b3I6IElDb2RlRWRpdG9yLCBsaW5lUmFuZ2U6IFJhbmdlKSB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXREZWNvcmF0aW9uc0luUmFuZ2UobGluZVJhbmdlKT8uZmluZChkZWNvcmF0aW9uID0+IGRlY29yYXRpb24ub3B0aW9ucy5kZXNjcmlwdGlvbiA9PT0gQ29tbWVudEdseXBoV2lkZ2V0LmRlc2NyaXB0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2RvVXBkYXRlKGVkaXRvcjogSUNvZGVFZGl0b3IsIGNvbW1lbnRJbmZvczogSUNvbW1lbnRJbmZvW10sIGVtcGhhc2lzTGluZTogbnVtYmVyID0gLTEsIHNlbGVjdGlvblJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZCA9IHRoaXMuX2xhc3RTZWxlY3Rpb24pIHtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSdzIHN0aWxsIGEgc2VsZWN0aW9uLCB1c2UgdGhhdC5cblx0XHRlbXBoYXNpc0xpbmUgPSB0aGlzLl9sYXN0U2VsZWN0aW9uQ3Vyc29yID8/IGVtcGhhc2lzTGluZTtcblxuXHRcdGNvbnN0IGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zOiBDb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGluZm8gb2YgY29tbWVudEluZm9zKSB7XG5cdFx0XHRpbmZvLmNvbW1lbnRpbmdSYW5nZXMucmFuZ2VzLmZvckVhY2gocmFuZ2UgPT4ge1xuXHRcdFx0XHRjb25zdCByYW5nZU9iamVjdCA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHRsZXQgaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2UgPSBzZWxlY3Rpb25SYW5nZSA/IHJhbmdlT2JqZWN0LmludGVyc2VjdFJhbmdlcyhzZWxlY3Rpb25SYW5nZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICgoc2VsZWN0aW9uUmFuZ2UgJiYgKGVtcGhhc2lzTGluZSA+PSAwKSAmJiBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZSlcblx0XHRcdFx0XHQvLyBJZiB0aGVyZSdzIG9ubHkgb25lIHNlbGVjdGlvbiBsaW5lLCB0aGVuIGp1c3QgZHJvcCBpbnRvIHRoZSBlbHNlIGlmIGFuZCBzaG93IGFuIGVtcGhhc2lzIGxpbmUuXG5cdFx0XHRcdFx0JiYgISgoaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5lbmRMaW5lTnVtYmVyKVxuXHRcdFx0XHRcdFx0JiYgKGVtcGhhc2lzTGluZSA9PT0gaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSkpIHtcblx0XHRcdFx0XHQvLyBUaGUgZW1waGFzaXNMaW5lIHNob3VsZCBiZSB3aXRoaW4gdGhlIGNvbW1lbnRpbmcgcmFuZ2UsIGV2ZW4gaWYgdGhlIHNlbGVjdGlvbiByYW5nZSBzdHJldGNoZXNcblx0XHRcdFx0XHQvLyBvdXRzaWRlIG9mIHRoZSBjb21tZW50aW5nIHJhbmdlLlxuXHRcdFx0XHRcdC8vIENsaXAgdGhlIGVtcGhhc2lzIGFuZCBzZWxlY3Rpb24gcmFuZ2VzIHRvIHRoZSBjb21tZW50aW5nIHJhbmdlXG5cdFx0XHRcdFx0bGV0IGludGVyc2VjdGluZ0VtcGhhc2lzUmFuZ2U6IFJhbmdlO1xuXHRcdFx0XHRcdGlmIChlbXBoYXNpc0xpbmUgPD0gaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRpbnRlcnNlY3RpbmdFbXBoYXNpc1JhbmdlID0gaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2UuY29sbGFwc2VUb1N0YXJ0KCk7XG5cdFx0XHRcdFx0XHRpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZSA9IG5ldyBSYW5nZShpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5zdGFydExpbmVOdW1iZXIgKyAxLCAxLCBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5lbmRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aW50ZXJzZWN0aW5nRW1waGFzaXNSYW5nZSA9IG5ldyBSYW5nZShpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5lbmRMaW5lTnVtYmVyLCAxLCBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5lbmRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0XHRcdGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlID0gbmV3IFJhbmdlKGludGVyc2VjdGluZ1NlbGVjdGlvblJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSwgaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2UuZW5kTGluZU51bWJlciAtIDEsIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucy5wdXNoKG5ldyBDb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9uKGVkaXRvciwgaW5mby51bmlxdWVPd25lciwgaW5mby5leHRlbnNpb25JZCwgaW5mby5sYWJlbCwgaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2UsIHRoaXMubXVsdGlsaW5lRGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcywgdHJ1ZSkpO1xuXG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9saW5lSGFzVGhyZWFkKGVkaXRvciwgaW50ZXJzZWN0aW5nRW1waGFzaXNSYW5nZSkpIHtcblx0XHRcdFx0XHRcdGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLnB1c2gobmV3IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb24oZWRpdG9yLCBpbmZvLnVuaXF1ZU93bmVyLCBpbmZvLmV4dGVuc2lvbklkLCBpbmZvLmxhYmVsLCBpbnRlcnNlY3RpbmdFbXBoYXNpc1JhbmdlLCB0aGlzLmhvdmVyRGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcywgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGJlZm9yZVJhbmdlRW5kTGluZSA9IE1hdGgubWluKGludGVyc2VjdGluZ0VtcGhhc2lzUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBpbnRlcnNlY3RpbmdTZWxlY3Rpb25SYW5nZS5zdGFydExpbmVOdW1iZXIpIC0gMTtcblx0XHRcdFx0XHRjb25zdCBoYXNCZWZvcmVSYW5nZSA9IHJhbmdlT2JqZWN0LnN0YXJ0TGluZU51bWJlciA8PSBiZWZvcmVSYW5nZUVuZExpbmU7XG5cdFx0XHRcdFx0Y29uc3QgYWZ0ZXJSYW5nZVN0YXJ0TGluZSA9IE1hdGgubWF4KGludGVyc2VjdGluZ0VtcGhhc2lzUmFuZ2UuZW5kTGluZU51bWJlciwgaW50ZXJzZWN0aW5nU2VsZWN0aW9uUmFuZ2UuZW5kTGluZU51bWJlcikgKyAxO1xuXHRcdFx0XHRcdGNvbnN0IGhhc0FmdGVyUmFuZ2UgPSByYW5nZU9iamVjdC5lbmRMaW5lTnVtYmVyID49IGFmdGVyUmFuZ2VTdGFydExpbmU7XG5cdFx0XHRcdFx0aWYgKGhhc0JlZm9yZVJhbmdlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBiZWZvcmVSYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIDEsIGJlZm9yZVJhbmdlRW5kTGluZSwgMSk7XG5cdFx0XHRcdFx0XHRjb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucy5wdXNoKG5ldyBDb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9uKGVkaXRvciwgaW5mby51bmlxdWVPd25lciwgaW5mby5leHRlbnNpb25JZCwgaW5mby5sYWJlbCwgYmVmb3JlUmFuZ2UsIHRoaXMuZGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcywgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaGFzQWZ0ZXJSYW5nZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWZ0ZXJSYW5nZSA9IG5ldyBSYW5nZShhZnRlclJhbmdlU3RhcnRMaW5lLCAxLCByYW5nZS5lbmRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0XHRcdGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLnB1c2gobmV3IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb24oZWRpdG9yLCBpbmZvLnVuaXF1ZU93bmVyLCBpbmZvLmV4dGVuc2lvbklkLCBpbmZvLmxhYmVsLCBhZnRlclJhbmdlLCB0aGlzLmRlY29yYXRpb25PcHRpb25zLCBpbmZvLmNvbW1lbnRpbmdSYW5nZXMsIHRydWUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoKHJhbmdlT2JqZWN0LnN0YXJ0TGluZU51bWJlciA8PSBlbXBoYXNpc0xpbmUpICYmIChlbXBoYXNpc0xpbmUgPD0gcmFuZ2VPYmplY3QuZW5kTGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRpZiAocmFuZ2VPYmplY3Quc3RhcnRMaW5lTnVtYmVyIDwgZW1waGFzaXNMaW5lKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBiZWZvcmVSYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIDEsIGVtcGhhc2lzTGluZSAtIDEsIDEpO1xuXHRcdFx0XHRcdFx0Y29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMucHVzaChuZXcgQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbihlZGl0b3IsIGluZm8udW5pcXVlT3duZXIsIGluZm8uZXh0ZW5zaW9uSWQsIGluZm8ubGFiZWwsIGJlZm9yZVJhbmdlLCB0aGlzLmRlY29yYXRpb25PcHRpb25zLCBpbmZvLmNvbW1lbnRpbmdSYW5nZXMsIHRydWUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZW1waGFzaXNSYW5nZSA9IG5ldyBSYW5nZShlbXBoYXNpc0xpbmUsIDEsIGVtcGhhc2lzTGluZSwgMSk7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9saW5lSGFzVGhyZWFkKGVkaXRvciwgZW1waGFzaXNSYW5nZSkpIHtcblx0XHRcdFx0XHRcdGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLnB1c2gobmV3IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb24oZWRpdG9yLCBpbmZvLnVuaXF1ZU93bmVyLCBpbmZvLmV4dGVuc2lvbklkLCBpbmZvLmxhYmVsLCBlbXBoYXNpc1JhbmdlLCB0aGlzLmhvdmVyRGVjb3JhdGlvbk9wdGlvbnMsIGluZm8uY29tbWVudGluZ1JhbmdlcywgdHJ1ZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW1waGFzaXNMaW5lIDwgcmFuZ2VPYmplY3QuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWZ0ZXJSYW5nZSA9IG5ldyBSYW5nZShlbXBoYXNpc0xpbmUgKyAxLCAxLCByYW5nZS5lbmRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0XHRcdGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLnB1c2gobmV3IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb24oZWRpdG9yLCBpbmZvLnVuaXF1ZU93bmVyLCBpbmZvLmV4dGVuc2lvbklkLCBpbmZvLmxhYmVsLCBhZnRlclJhbmdlLCB0aGlzLmRlY29yYXRpb25PcHRpb25zLCBpbmZvLmNvbW1lbnRpbmdSYW5nZXMsIHRydWUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMucHVzaChuZXcgQ29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbihlZGl0b3IsIGluZm8udW5pcXVlT3duZXIsIGluZm8uZXh0ZW5zaW9uSWQsIGluZm8ubGFiZWwsIHJhbmdlLCB0aGlzLmRlY29yYXRpb25PcHRpb25zLCBpbmZvLmNvbW1lbnRpbmdSYW5nZXMpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0dGhpcy5kZWNvcmF0aW9uSWRzID0gYWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLmRlY29yYXRpb25JZHMsIGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zKTtcblx0XHRcdGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLmZvckVhY2goKGRlY29yYXRpb24sIGluZGV4KSA9PiBkZWNvcmF0aW9uLmlkID0gdGhpcy5kZWNvcmF0aW9uSWRzW2luZGV4XSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByYW5nZXNEaWZmZXJlbmNlID0gdGhpcy5jb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucy5sZW5ndGggLSBjb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucy5sZW5ndGg7XG5cdFx0dGhpcy5jb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucyA9IGNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zO1xuXHRcdGlmIChyYW5nZXNEaWZmZXJlbmNlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zQ291bnQuZmlyZSh0aGlzLmNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLmxlbmd0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcmVSYW5nZXNJbnRlcnNlY3RpbmdPclRvdWNoaW5nQnlMaW5lKGE6IFJhbmdlLCBiOiBSYW5nZSkge1xuXHRcdC8vIENoZWNrIGlmIGBhYCBpcyBiZWZvcmUgYGJgXG5cdFx0aWYgKGEuZW5kTGluZU51bWJlciA8IChiLnN0YXJ0TGluZU51bWJlciAtIDEpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYGJgIGlzIGJlZm9yZSBgYWBcblx0XHRpZiAoKGIuZW5kTGluZU51bWJlciArIDEpIDwgYS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBUaGVzZSByYW5nZXMgbXVzdCBpbnRlcnNlY3Rcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNYXRjaGVkQ29tbWVudEFjdGlvbihjb21tZW50UmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkKTogTWVyZ2VkQ29tbWVudFJhbmdlQWN0aW9uc1tdIHtcblx0XHRpZiAoY29tbWVudFJhbmdlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGZvdW5kSW5mb3MgPSB0aGlzLl9pbmZvcz8uZmlsdGVyKGluZm8gPT4gaW5mby5jb21tZW50aW5nUmFuZ2VzLmZpbGVDb21tZW50cyk7XG5cdFx0XHRpZiAoZm91bmRJbmZvcykge1xuXHRcdFx0XHRyZXR1cm4gZm91bmRJbmZvcy5tYXAoZm91bmRJbmZvID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdG93bmVySWQ6IGZvdW5kSW5mby51bmlxdWVPd25lcixcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGZvdW5kSW5mby5leHRlbnNpb25JZCxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGZvdW5kSW5mby5sYWJlbCxcblx0XHRcdFx0XHRcdFx0Y29tbWVudGluZ1Jhbmdlc0luZm86IGZvdW5kSW5mby5jb21tZW50aW5nUmFuZ2VzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8ga2V5cyBpcyBvd25lcklkXG5cdFx0Y29uc3QgZm91bmRIb3ZlckFjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgeyByYW5nZTogUmFuZ2U7IGFjdGlvbjogQ29tbWVudFJhbmdlQWN0aW9uIH0+KCk7XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIHRoaXMuY29tbWVudGluZ1JhbmdlRGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gZGVjb3JhdGlvbi5nZXRBY3RpdmVSYW5nZSgpO1xuXHRcdFx0aWYgKHJhbmdlICYmIHRoaXMuYXJlUmFuZ2VzSW50ZXJzZWN0aW5nT3JUb3VjaGluZ0J5TGluZShyYW5nZSwgY29tbWVudFJhbmdlKSkge1xuXHRcdFx0XHQvLyBXZSBjYW4gaGF2ZSBzZXZlcmFsIGNvbW1lbnRpbmcgcmFuZ2VzIHRoYXQgbWF0Y2ggZnJvbSB0aGUgc2FtZSB1bmlxdWVPd25lciBiZWNhdXNlIG9mIGhvd1xuXHRcdFx0XHQvLyB0aGUgbGluZSBob3ZlciBhbmQgc2VsZWN0aW9uIGRlY29yYXRpb24gaXMgZG9uZS5cblx0XHRcdFx0Ly8gVGhlIHJhbmdlcyBtdXN0IGJlIG1lcmdlZCBzbyB0aGF0IHdlIGNhbiBzZWUgaWYgdGhlIG5ldyBjb21tZW50UmFuZ2UgZml0cyB3aXRoaW4gdGhlbS5cblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZGVjb3JhdGlvbi5nZXRDb21tZW50QWN0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGFscmVhZHlGb3VuZEluZm8gPSBmb3VuZEhvdmVyQWN0aW9ucy5nZXQoYWN0aW9uLm93bmVySWQpO1xuXHRcdFx0XHRpZiAoYWxyZWFkeUZvdW5kSW5mbz8uYWN0aW9uLmNvbW1lbnRpbmdSYW5nZXNJbmZvID09PSBhY3Rpb24uY29tbWVudGluZ1Jhbmdlc0luZm8pIHtcblx0XHRcdFx0XHQvLyBNZXJnZSByYW5nZXMuXG5cdFx0XHRcdFx0Y29uc3QgbmV3UmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdFx0XHRyYW5nZS5zdGFydExpbmVOdW1iZXIgPCBhbHJlYWR5Rm91bmRJbmZvLnJhbmdlLnN0YXJ0TGluZU51bWJlciA/IHJhbmdlLnN0YXJ0TGluZU51bWJlciA6IGFscmVhZHlGb3VuZEluZm8ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0cmFuZ2Uuc3RhcnRDb2x1bW4gPCBhbHJlYWR5Rm91bmRJbmZvLnJhbmdlLnN0YXJ0Q29sdW1uID8gcmFuZ2Uuc3RhcnRDb2x1bW4gOiBhbHJlYWR5Rm91bmRJbmZvLnJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0cmFuZ2UuZW5kTGluZU51bWJlciA+IGFscmVhZHlGb3VuZEluZm8ucmFuZ2UuZW5kTGluZU51bWJlciA/IHJhbmdlLmVuZExpbmVOdW1iZXIgOiBhbHJlYWR5Rm91bmRJbmZvLnJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRyYW5nZS5lbmRDb2x1bW4gPiBhbHJlYWR5Rm91bmRJbmZvLnJhbmdlLmVuZENvbHVtbiA/IHJhbmdlLmVuZENvbHVtbiA6IGFscmVhZHlGb3VuZEluZm8ucmFuZ2UuZW5kQ29sdW1uXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRmb3VuZEhvdmVyQWN0aW9ucy5zZXQoYWN0aW9uLm93bmVySWQsIHsgcmFuZ2U6IG5ld1JhbmdlLCBhY3Rpb24gfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm91bmRIb3ZlckFjdGlvbnMuc2V0KGFjdGlvbi5vd25lcklkLCB7IHJhbmdlLCBhY3Rpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZWVuT3duZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20oZm91bmRIb3ZlckFjdGlvbnMudmFsdWVzKCkpLmZpbHRlcihhY3Rpb24gPT4ge1xuXHRcdFx0aWYgKHNlZW5Pd25lcnMuaGFzKGFjdGlvbi5hY3Rpb24ub3duZXJJZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2Vlbk93bmVycy5hZGQoYWN0aW9uLmFjdGlvbi5vd25lcklkKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TmVhcmVzdENvbW1lbnRpbmdSYW5nZShmaW5kUG9zaXRpb246IFBvc2l0aW9uLCByZXZlcnNlPzogYm9vbGVhbik6IFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgZmluZFBvc2l0aW9uQ29udGFpbmVkV2l0aGluOiBSYW5nZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVjb3JhdGlvbnM6IENvbW1lbnRpbmdSYW5nZURlY29yYXRpb25bXTtcblx0XHRpZiAocmV2ZXJzZSkge1xuXHRcdFx0ZGVjb3JhdGlvbnMgPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSB0aGlzLmNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGRlY29yYXRpb25zLnB1c2godGhpcy5jb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9uc1tpXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlY29yYXRpb25zID0gdGhpcy5jb21tZW50aW5nUmFuZ2VEZWNvcmF0aW9ucztcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IGRlY29yYXRpb24uZ2V0QWN0aXZlUmFuZ2UoKTtcblx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmaW5kUG9zaXRpb25Db250YWluZWRXaXRoaW4gJiYgdGhpcy5hcmVSYW5nZXNJbnRlcnNlY3RpbmdPclRvdWNoaW5nQnlMaW5lKHJhbmdlLCBmaW5kUG9zaXRpb25Db250YWluZWRXaXRoaW4pKSB7XG5cdFx0XHRcdGZpbmRQb3NpdGlvbkNvbnRhaW5lZFdpdGhpbiA9IFJhbmdlLnBsdXNSYW5nZShmaW5kUG9zaXRpb25Db250YWluZWRXaXRoaW4sIHJhbmdlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gZmluZFBvc2l0aW9uLmxpbmVOdW1iZXIgJiYgZmluZFBvc2l0aW9uLmxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRmaW5kUG9zaXRpb25Db250YWluZWRXaXRoaW4gPSBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghcmV2ZXJzZSAmJiByYW5nZS5lbmRMaW5lTnVtYmVyIDwgZmluZFBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXZlcnNlICYmIHJhbmdlLnN0YXJ0TGluZU51bWJlciA+IGZpbmRQb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmFuZ2U7XG5cdFx0fVxuXHRcdHJldHVybiAoZGVjb3JhdGlvbnMubGVuZ3RoID4gMCA/IChkZWNvcmF0aW9uc1swXS5nZXRBY3RpdmVSYW5nZSgpID8/IHVuZGVmaW5lZCkgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9uc0NvdW50LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNvbW1lbnRpbmdSYW5nZURlY29yYXRpb25zID0gW107XG5cdH1cbn1cblxuLyoqXG4qIE5hdmlnYXRlIHRvIHRoZSBuZXh0IG9yIHByZXZpb3VzIGNvbW1lbnQgaW4gdGhlIGN1cnJlbnQgdGhyZWFkLlxuKiBAcGFyYW0gdHlwZVxuKi9cbmV4cG9ydCBmdW5jdGlvbiBtb3ZlVG9OZXh0Q29tbWVudEluVGhyZWFkKGNvbW1lbnRJbmZvOiB7IHRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQ8SVJhbmdlPjsgY29tbWVudD86IGxhbmd1YWdlcy5Db21tZW50IH0gfCB1bmRlZmluZWQsIHR5cGU6ICduZXh0JyB8ICdwcmV2aW91cycpIHtcblx0aWYgKCFjb21tZW50SW5mbz8uY29tbWVudCB8fCAhY29tbWVudEluZm8/LnRocmVhZD8uY29tbWVudHMpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgY3VycmVudEluZGV4ID0gY29tbWVudEluZm8udGhyZWFkLmNvbW1lbnRzPy5pbmRleE9mKGNvbW1lbnRJbmZvLmNvbW1lbnQpO1xuXHRpZiAoY3VycmVudEluZGV4ID09PSB1bmRlZmluZWQgfHwgY3VycmVudEluZGV4IDwgMCkge1xuXHRcdHJldHVybjtcblx0fVxuXHRpZiAodHlwZSA9PT0gJ3ByZXZpb3VzJyAmJiBjdXJyZW50SW5kZXggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKHR5cGUgPT09ICduZXh0JyAmJiBjdXJyZW50SW5kZXggPT09IGNvbW1lbnRJbmZvLnRocmVhZC5jb21tZW50cy5sZW5ndGggLSAxKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IGNvbW1lbnQgPSBjb21tZW50SW5mby50aHJlYWQuY29tbWVudHM/Llt0eXBlID09PSAncHJldmlvdXMnID8gY3VycmVudEluZGV4IC0gMSA6IGN1cnJlbnRJbmRleCArIDFdO1xuXHRpZiAoIWNvbW1lbnQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0cmV0dXJuIHtcblx0XHQuLi5jb21tZW50SW5mbyxcblx0XHRjb21tZW50LFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmV2ZWFsQ29tbWVudFRocmVhZChjb21tZW50U2VydmljZTogSUNvbW1lbnRTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRjb21tZW50VGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxJUmFuZ2U+LCBjb21tZW50OiBsYW5ndWFnZXMuQ29tbWVudCB8IHVuZGVmaW5lZCwgZm9jdXNSZXBseT86IGJvb2xlYW4sIHBpbm5lZD86IGJvb2xlYW4sIHByZXNlcnZlRm9jdXM/OiBib29sZWFuLCBzaWRlQnlTaWRlPzogYm9vbGVhbik6IHZvaWQge1xuXHRpZiAoIWNvbW1lbnRUaHJlYWQucmVzb3VyY2UpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKCFjb21tZW50U2VydmljZS5pc0NvbW1lbnRpbmdFbmFibGVkKSB7XG5cdFx0Y29tbWVudFNlcnZpY2UuZW5hYmxlQ29tbWVudGluZyh0cnVlKTtcblx0fVxuXG5cdGNvbnN0IHJhbmdlID0gY29tbWVudFRocmVhZC5yYW5nZTtcblx0Y29uc3QgZm9jdXMgPSBmb2N1c1JlcGx5ID8gQ29tbWVudFdpZGdldEZvY3VzLkVkaXRvciA6IChwcmVzZXJ2ZUZvY3VzID8gQ29tbWVudFdpZGdldEZvY3VzLk5vbmUgOiBDb21tZW50V2lkZ2V0Rm9jdXMuV2lkZ2V0KTtcblxuXHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHQvLyBJZiB0aGUgYWN0aXZlIGVkaXRvciBpcyBhIGRpZmYgZWRpdG9yIHdoZXJlIG9uZSBvZiB0aGUgc2lkZXMgaGFzIHRoZSBjb21tZW50LFxuXHQvLyB0aGVuIHdlIHRyeSB0byByZXZlYWwgdGhlIGNvbW1lbnQgaW4gdGhlIGRpZmYgZWRpdG9yLlxuXHRjb25zdCBjdXJyZW50QWN0aXZlUmVzb3VyY2VzOiBJRWRpdG9yW10gPSBpc0RpZmZFZGl0b3IoYWN0aXZlRWRpdG9yKSA/IFthY3RpdmVFZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKSwgYWN0aXZlRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCldXG5cdFx0OiAoYWN0aXZlRWRpdG9yID8gW2FjdGl2ZUVkaXRvcl0gOiBbXSk7XG5cdGNvbnN0IHRocmVhZFRvUmV2ZWFsID0gY29tbWVudFRocmVhZC50aHJlYWRJZDtcblx0Y29uc3QgY29tbWVudFRvUmV2ZWFsID0gY29tbWVudD8udW5pcXVlSWRJblRocmVhZDtcblx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoY29tbWVudFRocmVhZC5yZXNvdXJjZSk7XG5cblx0Zm9yIChjb25zdCBlZGl0b3Igb2YgY3VycmVudEFjdGl2ZVJlc291cmNlcykge1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKChtb2RlbCBpbnN0YW5jZW9mIFRleHRNb2RlbCkgJiYgdXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCBtb2RlbC51cmkpKSB7XG5cblx0XHRcdGlmICh0aHJlYWRUb1JldmVhbCAmJiBpc0NvZGVFZGl0b3IoZWRpdG9yKSkge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbWVudENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0XHRcdGNvbnRyb2xsZXI/LnJldmVhbENvbW1lbnRUaHJlYWQodGhyZWFkVG9SZXZlYWwsIGNvbW1lbnRUb1JldmVhbCwgdHJ1ZSwgZm9jdXMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0cmVzb3VyY2UsXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0cGlubmVkOiBwaW5uZWQsXG5cdFx0XHRwcmVzZXJ2ZUZvY3VzOiBwcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0c2VsZWN0aW9uOiByYW5nZSA/PyBuZXcgUmFuZ2UoMSwgMSwgMSwgMSlcblx0XHR9XG5cdH0sIHNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKS50aGVuKGVkaXRvciA9PiB7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0Y29uc3QgY29udHJvbCA9IGVkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0XHRpZiAodGhyZWFkVG9SZXZlYWwgJiYgaXNDb2RlRWRpdG9yKGNvbnRyb2wpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tZW50Q29udHJvbGxlci5nZXQoY29udHJvbCk7XG5cdFx0XHRcdGNvbnRyb2xsZXI/LnJldmVhbENvbW1lbnRUaHJlYWQodGhyZWFkVG9SZXZlYWwsIGNvbW1lbnRUb1JldmVhbCwgdHJ1ZSwgZm9jdXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tZW50Q29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbFRvRGlzcG9zZTogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBlZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tZW50V2lkZ2V0czogUmV2aWV3Wm9uZVdpZGdldFtdO1xuXHRwcml2YXRlIF9jb21tZW50SW5mb3M6IElDb21tZW50SW5mb1tdO1xuXHRwcml2YXRlIF9jb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IhOiBDb21tZW50aW5nUmFuZ2VEZWNvcmF0b3I7XG5cdHByaXZhdGUgX2NvbW1lbnRUaHJlYWRSYW5nZURlY29yYXRvciE6IENvbW1lbnRUaHJlYWRSYW5nZURlY29yYXRvcjtcblx0cHJpdmF0ZSBtb3VzZURvd25JbmZvOiB7IGxpbmVOdW1iZXI6IG51bWJlciB9IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbW1lbnRpbmdSYW5nZVNwYWNlUmVzZXJ2ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY29tbWVudGluZ1JhbmdlQW1vdW50UmVzZXJ2ZWQgPSAwO1xuXHRwcml2YXRlIF9jb21wdXRlUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8QXJyYXk8SUNvbW1lbnRJbmZvIHwgbnVsbD4+IHwgbnVsbDtcblx0cHJpdmF0ZSBfY29tcHV0ZUFuZFNldFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FkZEluUHJvZ3Jlc3MhOiBib29sZWFuO1xuXHRwcml2YXRlIF9lbXB0eVRocmVhZHNUb0FkZFF1ZXVlOiBbUmFuZ2UgfCB1bmRlZmluZWQsIElFZGl0b3JNb3VzZUV2ZW50IHwgdW5kZWZpbmVkXVtdID0gW107XG5cdHByaXZhdGUgX2NvbXB1dGVDb21tZW50aW5nUmFuZ2VTY2hlZHVsZXIhOiBEZWxheWVyPEFycmF5PElDb21tZW50SW5mbyB8IG51bGw+PiB8IG51bGw7XG5cdHByaXZhdGUgX3BlbmRpbmdOZXdDb21tZW50Q2FjaGU6IHsgW2tleTogc3RyaW5nXTogeyBba2V5OiBzdHJpbmddOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfSB9O1xuXHRwcml2YXRlIF9wZW5kaW5nRWRpdHNDYWNoZTogeyBba2V5OiBzdHJpbmddOiB7IFtrZXk6IHN0cmluZ106IHsgW2tleTogbnVtYmVyXTogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50IH0gfSB9OyAvLyB1bmlxdWVPd25lciAtPiB0aHJlYWRJZCAtPiB1bmlxdWVJZEluVGhyZWFkIC0+IHBlbmRpbmcgY29tbWVudFxuXHRwcml2YXRlIF9pblByb2Nlc3NDb250aW51ZU9uQ29tbWVudHM6IE1hcDxzdHJpbmcsIGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudFRocmVhZFtdPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSBfZWRpdG9yRGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0cHJpdmF0ZSBfYWN0aXZlQ3Vyc29ySGFzQ29tbWVudGluZ1JhbmdlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYWN0aXZlQ3Vyc29ySGFzQ29tbWVudDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2FjdGl2ZUVkaXRvckhhc0NvbW1lbnRpbmdSYW5nZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2NvbW1lbnRXaWRnZXRWaXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfaGFzUmVzcG9uZGVkVG9FZGl0b3JDaGFuZ2U6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29tbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tZW50U2VydmljZTogSUNvbW1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbW1lbnRJbmZvcyA9IFtdO1xuXHRcdHRoaXMuX2NvbW1lbnRXaWRnZXRzID0gW107XG5cdFx0dGhpcy5fcGVuZGluZ05ld0NvbW1lbnRDYWNoZSA9IHt9O1xuXHRcdHRoaXMuX3BlbmRpbmdFZGl0c0NhY2hlID0ge307XG5cdFx0dGhpcy5fY29tcHV0ZVByb21pc2UgPSBudWxsO1xuXHRcdHRoaXMuX2FjdGl2ZUN1cnNvckhhc0NvbW1lbnRpbmdSYW5nZSA9IENvbW1lbnRDb250ZXh0S2V5cy5hY3RpdmVDdXJzb3JIYXNDb21tZW50aW5nUmFuZ2UuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY3RpdmVDdXJzb3JIYXNDb21tZW50ID0gQ29tbWVudENvbnRleHRLZXlzLmFjdGl2ZUN1cnNvckhhc0NvbW1lbnQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hY3RpdmVFZGl0b3JIYXNDb21tZW50aW5nUmFuZ2UgPSBDb21tZW50Q29udGV4dEtleXMuYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY29tbWVudFdpZGdldFZpc2libGUgPSBDb21tZW50Q29udGV4dEtleXMuY29tbWVudFdpZGdldFZpc2libGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvciA9IGVkaXRvcjtcblxuXHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tbWVudGluZ1JhbmdlRGVjb3JhdG9yLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnNDb3VudChjb3VudCA9PiB7XG5cdFx0XHRpZiAoY291bnQgPT09IDApIHtcblx0XHRcdFx0dGhpcy5jbGVhckVkaXRvckxpc3RlbmVycygpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5yZWdpc3RlckVkaXRvckxpc3RlbmVycygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1lbnRUaHJlYWRSYW5nZURlY29yYXRvciA9IG5ldyBDb21tZW50VGhyZWFkUmFuZ2VEZWNvcmF0b3IodGhpcy5jb21tZW50U2VydmljZSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21tZW50U2VydmljZS5vbkRpZERlbGV0ZURhdGFQcm92aWRlcihvd25lcklkID0+IHtcblx0XHRcdGlmIChvd25lcklkKSB7XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLl9wZW5kaW5nTmV3Q29tbWVudENhY2hlW293bmVySWRdO1xuXHRcdFx0XHRkZWxldGUgdGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGVbb3duZXJJZF07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nTmV3Q29tbWVudENhY2hlID0ge307XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdFZGl0c0NhY2hlID0ge307XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmJlZ2luQ29tcHV0ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbW1lbnRTZXJ2aWNlLm9uRGlkU2V0RGF0YVByb3ZpZGVyKF8gPT4gdGhpcy5iZWdpbkNvbXB1dGVBbmRIYW5kbGVFZGl0b3JDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tbWVudFNlcnZpY2Uub25EaWRVcGRhdGVDb21tZW50aW5nUmFuZ2VzKF8gPT4gdGhpcy5iZWdpbkNvbXB1dGVBbmRIYW5kbGVFZGl0b3JDaGFuZ2UoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21tZW50U2VydmljZS5vbkRpZFNldFJlc291cmNlQ29tbWVudEluZm9zKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yVVJJID0gdGhpcy5lZGl0b3IgJiYgdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSAmJiB0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaTtcblx0XHRcdGlmIChlZGl0b3JVUkkgJiYgZWRpdG9yVVJJLnRvU3RyaW5nKCkgPT09IGUucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNldENvbW1lbnRzKGUuY29tbWVudEluZm9zLmZpbHRlcihjb21tZW50SW5mbyA9PiBjb21tZW50SW5mbyAhPT0gbnVsbCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VDb21tZW50aW5nRW5hYmxlZChlID0+IHtcblx0XHRcdGlmIChlKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMoKTtcblx0XHRcdFx0dGhpcy5iZWdpbkNvbXB1dGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJ5VXBkYXRlUmVzZXJ2ZWRTcGFjZSgpO1xuXHRcdFx0XHR0aGlzLmNsZWFyRWRpdG9yTGlzdGVuZXJzKCk7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci51cGRhdGUodGhpcy5lZGl0b3IsIFtdKTtcblx0XHRcdFx0dGhpcy5fY29tbWVudFRocmVhZFJhbmdlRGVjb3JhdG9yLnVwZGF0ZSh0aGlzLmVkaXRvciwgW10pO1xuXHRcdFx0XHRkaXNwb3NlKHRoaXMuX2NvbW1lbnRXaWRnZXRzKTtcblx0XHRcdFx0dGhpcy5fY29tbWVudFdpZGdldHMgPSBbXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbldpbGxDaGFuZ2VNb2RlbChlID0+IHRoaXMub25XaWxsQ2hhbmdlTW9kZWwoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsKF8gPT4gdGhpcy5vbk1vZGVsQ2hhbmdlZCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJykpIHtcblx0XHRcdFx0dGhpcy5iZWdpbkNvbXB1dGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLm9uTW9kZWxDaGFuZ2VkKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKCdjb21tZW50LWNvbnRyb2xsZXInLCBDT01NRU5URURJVE9SX0RFQ09SQVRJT05fS0VZLCB7fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0dGhpcy5jb21tZW50U2VydmljZS5yZWdpc3RlckNvbnRpbnVlT25Db21tZW50UHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlQ29udGludWVPbkNvbW1lbnRzOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGVuZGluZ0NvbW1lbnRzOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnRUaHJlYWRbXSA9IFtdO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9jb21tZW50V2lkZ2V0cykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCB6b25lIG9mIHRoaXMuX2NvbW1lbnRXaWRnZXRzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHpvbmVQZW5kaW5nQ29tbWVudHMgPSB6b25lLmdldFBlbmRpbmdDb21tZW50cygpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwZW5kaW5nTmV3Q29tbWVudCA9IHpvbmVQZW5kaW5nQ29tbWVudHMubmV3Q29tbWVudDtcblx0XHRcdFx0XHRcdFx0aWYgKCFwZW5kaW5nTmV3Q29tbWVudCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGxldCBsYXN0Q29tbWVudEJvZHk7XG5cdFx0XHRcdFx0XHRcdGlmICh6b25lLmNvbW1lbnRUaHJlYWQuY29tbWVudHMgJiYgem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxhc3RDb21tZW50ID0gem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzW3pvbmUuY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIGxhc3RDb21tZW50LmJvZHkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYXN0Q29tbWVudEJvZHkgPSBsYXN0Q29tbWVudC5ib2R5O1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRsYXN0Q29tbWVudEJvZHkgPSBsYXN0Q29tbWVudC5ib2R5LnZhbHVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmIChwZW5kaW5nTmV3Q29tbWVudC5ib2R5ICE9PSBsYXN0Q29tbWVudEJvZHkpIHtcblx0XHRcdFx0XHRcdFx0XHRwZW5kaW5nQ29tbWVudHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHR1bmlxdWVPd25lcjogem9uZS51bmlxdWVPd25lcixcblx0XHRcdFx0XHRcdFx0XHRcdHVyaTogem9uZS5lZGl0b3IuZ2V0TW9kZWwoKSEudXJpLFxuXHRcdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IHpvbmUuY29tbWVudFRocmVhZC5yYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IHBlbmRpbmdOZXdDb21tZW50LFxuXHRcdFx0XHRcdFx0XHRcdFx0aXNSZXBseTogKHpvbmUuY29tbWVudFRocmVhZC5jb21tZW50cyAhPT0gdW5kZWZpbmVkKSAmJiAoem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCA+IDApXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHBlbmRpbmdDb21tZW50cztcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRWRpdG9yTGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzID0gW107XG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5wdXNoKHRoaXMuZWRpdG9yLm9uTW91c2VNb3ZlKGUgPT4gdGhpcy5vbkVkaXRvck1vdXNlTW92ZShlKSkpO1xuXHRcdHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzLnB1c2godGhpcy5lZGl0b3Iub25Nb3VzZUxlYXZlKCgpID0+IHRoaXMub25FZGl0b3JNb3VzZUxlYXZlKCkpKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oZSA9PiB0aGlzLm9uRWRpdG9yQ2hhbmdlQ3Vyc29yUG9zaXRpb24oZS5wb3NpdGlvbikpKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4gdGhpcy5vbkVkaXRvckNoYW5nZUN1cnNvclBvc2l0aW9uKHRoaXMuZWRpdG9yPy5nZXRQb3NpdGlvbigpID8/IG51bGwpKSk7XG5cdFx0dGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMucHVzaCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbihlID0+IHRoaXMub25FZGl0b3JDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oZSkpKTtcblx0XHR0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB0aGlzLm9uRWRpdG9yQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJFZGl0b3JMaXN0ZW5lcnMoKSB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fZWRpdG9yRGlzcG9zYWJsZXMgPSBbXTtcblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JNb3VzZUxlYXZlKCkge1xuXHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci51cGRhdGVIb3ZlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlTW92ZShlOiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gZS50YXJnZXQucG9zaXRpb24/LmxpbmVOdW1iZXI7XG5cdFx0aWYgKGUuZXZlbnQubGVmdEJ1dHRvbi52YWx1ZU9mKCkgJiYgcG9zaXRpb24gJiYgdGhpcy5tb3VzZURvd25JbmZvKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IudXBkYXRlU2VsZWN0aW9uKHBvc2l0aW9uLCBuZXcgUmFuZ2UodGhpcy5tb3VzZURvd25JbmZvLmxpbmVOdW1iZXIsIDEsIHBvc2l0aW9uLCAxKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci51cGRhdGVIb3Zlcihwb3NpdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvckNoYW5nZUN1cnNvclNlbGVjdGlvbihlPzogSUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lZGl0b3I/LmdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXI7XG5cdFx0aWYgKHBvc2l0aW9uKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IudXBkYXRlU2VsZWN0aW9uKHBvc2l0aW9uLCBlPy5zZWxlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JDaGFuZ2VDdXJzb3JQb3NpdGlvbihlOiBQb3NpdGlvbiB8IG51bGwpIHtcblx0XHRpZiAoIWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGUsIHsgY29sdW1uOiAtMSwgbGluZU51bWJlcjogZS5saW5lTnVtYmVyIH0pO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5lZGl0b3I/LmdldERlY29yYXRpb25zSW5SYW5nZShyYW5nZSk7XG5cdFx0bGV0IGhhc0NvbW1lbnRpbmdSYW5nZSA9IGZhbHNlO1xuXHRcdGlmIChkZWNvcmF0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRcdGlmIChkZWNvcmF0aW9uLm9wdGlvbnMuZGVzY3JpcHRpb24gPT09IENvbW1lbnRHbHlwaFdpZGdldC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdC8vIFdlIGRvbid0IGFsbG93IG11bHRpcGxlIGNvbW1lbnRzIG9uIHRoZSBzYW1lIGxpbmUuXG5cdFx0XHRcdFx0aGFzQ29tbWVudGluZ1JhbmdlID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGVjb3JhdGlvbi5vcHRpb25zLmRlc2NyaXB0aW9uID09PSBDb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRoYXNDb21tZW50aW5nUmFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZUN1cnNvckhhc0NvbW1lbnRpbmdSYW5nZS5zZXQoaGFzQ29tbWVudGluZ1JhbmdlKTtcblx0XHR0aGlzLl9hY3RpdmVDdXJzb3JIYXNDb21tZW50LnNldCh0aGlzLmdldENvbW1lbnRzQXRMaW5lKHJhbmdlKS5sZW5ndGggPiAwKTtcblx0fVxuXG5cdHByaXZhdGUgaXNFZGl0b3JJbmxpbmVPcmlnaW5hbCh0ZXN0RWRpdG9yOiBJQ29kZUVkaXRvcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdkaWZmRWRpdG9yLnJlbmRlclNpZGVCeVNpZGUnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvdW5kRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLnZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMuZmluZChlZGl0b3IgPT4ge1xuXHRcdFx0aWYgKGVkaXRvci5nZXRFZGl0b3JUeXBlKCkgPT09IEVkaXRvclR5cGUuSURpZmZFZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgZGlmZkVkaXRvciA9IGVkaXRvciBhcyBJRGlmZkVkaXRvcjtcblx0XHRcdFx0cmV0dXJuIGRpZmZFZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKSA9PT0gdGVzdEVkaXRvcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0XHRyZXR1cm4gISFmb3VuZEVkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgYmVnaW5Db21wdXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2NvbXB1dGVQcm9taXNlID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UodG9rZW4gPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yVVJJID0gdGhpcy5lZGl0b3IgJiYgdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSAmJiB0aGlzLmVkaXRvci5nZXRNb2RlbCgpLnVyaTtcblxuXHRcdFx0aWYgKGVkaXRvclVSSSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jb21tZW50U2VydmljZS5nZXREb2N1bWVudENvbW1lbnRzKGVkaXRvclVSSSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fY29tcHV0ZUFuZFNldFByb21pc2UgPSB0aGlzLl9jb21wdXRlUHJvbWlzZS50aGVuKGFzeW5jIGNvbW1lbnRJbmZvcyA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnNldENvbW1lbnRzKGNvYWxlc2NlKGNvbW1lbnRJbmZvcykpO1xuXHRcdFx0dGhpcy5fY29tcHV0ZVByb21pc2UgPSBudWxsO1xuXHRcdH0sIGVycm9yID0+IGNvbnNvbGUubG9nKGVycm9yKSk7XG5cdFx0dGhpcy5fY29tcHV0ZVByb21pc2UudGhlbigoKSA9PiB0aGlzLl9jb21wdXRlQW5kU2V0UHJvbWlzZSA9IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXB1dGVBbmRTZXRQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBiZWdpbkNvbXB1dGVDb21tZW50aW5nUmFuZ2VzKCkge1xuXHRcdGlmICh0aGlzLl9jb21wdXRlQ29tbWVudGluZ1JhbmdlU2NoZWR1bGVyKSB7XG5cdFx0XHR0aGlzLl9jb21wdXRlQ29tbWVudGluZ1JhbmdlU2NoZWR1bGVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JVUkkgPSB0aGlzLmVkaXRvciAmJiB0aGlzLmVkaXRvci5oYXNNb2RlbCgpICYmIHRoaXMuZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXG5cdFx0XHRcdGlmIChlZGl0b3JVUkkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jb21tZW50U2VydmljZS5nZXREb2N1bWVudENvbW1lbnRzKGVkaXRvclVSSSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0XHRcdH0pLnRoZW4oY29tbWVudEluZm9zID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY29tbWVudFNlcnZpY2UuaXNDb21tZW50aW5nRW5hYmxlZCkge1xuXHRcdFx0XHRcdGNvbnN0IG1lYW5pbmdmdWxDb21tZW50SW5mb3MgPSBjb2FsZXNjZShjb21tZW50SW5mb3MpO1xuXHRcdFx0XHRcdHRoaXMuX2NvbW1lbnRpbmdSYW5nZURlY29yYXRvci51cGRhdGUodGhpcy5lZGl0b3IsIG1lYW5pbmdmdWxDb21tZW50SW5mb3MsIHRoaXMuZWRpdG9yPy5nZXRQb3NpdGlvbigpPy5saW5lTnVtYmVyLCB0aGlzLmVkaXRvcj8uZ2V0U2VsZWN0aW9uKCkgPz8gdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgKGVycikgPT4ge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBDb21tZW50Q29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvbW1lbnRDb250cm9sbGVyPihJRCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsQ29tbWVudFRocmVhZCh0aHJlYWRJZDogc3RyaW5nLCBjb21tZW50VW5pcXVlSWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZmV0Y2hPbmNlSWZOb3RFeGlzdDogYm9vbGVhbiwgZm9jdXM6IENvbW1lbnRXaWRnZXRGb2N1cyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbW1lbnRUaHJlYWRXaWRnZXQgPSB0aGlzLl9jb21tZW50V2lkZ2V0cy5maWx0ZXIod2lkZ2V0ID0+IHdpZGdldC5jb21tZW50VGhyZWFkLnRocmVhZElkID09PSB0aHJlYWRJZCk7XG5cdFx0aWYgKGNvbW1lbnRUaHJlYWRXaWRnZXQubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb21tZW50VGhyZWFkV2lkZ2V0WzBdLnJldmVhbChjb21tZW50VW5pcXVlSWQsIGZvY3VzKTtcblx0XHR9IGVsc2UgaWYgKGZldGNoT25jZUlmTm90RXhpc3QpIHtcblx0XHRcdGlmICh0aGlzLl9jb21wdXRlQW5kU2V0UHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLl9jb21wdXRlQW5kU2V0UHJvbWlzZS50aGVuKF8gPT4ge1xuXHRcdFx0XHRcdHRoaXMucmV2ZWFsQ29tbWVudFRocmVhZCh0aHJlYWRJZCwgY29tbWVudFVuaXF1ZUlkLCBmYWxzZSwgZm9jdXMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYmVnaW5Db21wdXRlKCkudGhlbihfID0+IHtcblx0XHRcdFx0XHR0aGlzLnJldmVhbENvbW1lbnRUaHJlYWQodGhyZWFkSWQsIGNvbW1lbnRVbmlxdWVJZCwgZmFsc2UsIGZvY3VzKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuX2NvbW1lbnRXaWRnZXRzKSB7XG5cdFx0XHR3aWRnZXQuY29sbGFwc2UodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGNvbGxhcHNlVmlzaWJsZUNvbW1lbnRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5lZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IHRoaXMuZWRpdG9yLmdldFZpc2libGVSYW5nZXMoKTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLl9jb21tZW50V2lkZ2V0cykge1xuXHRcdFx0aWYgKHdpZGdldC5leHBhbmRlZCAmJiB3aWRnZXQuY29tbWVudFRocmVhZC5yYW5nZSkge1xuXHRcdFx0XHRjb25zdCBpc1Zpc2libGUgPSB2aXNpYmxlUmFuZ2VzLnNvbWUodmlzaWJsZVJhbmdlID0+XG5cdFx0XHRcdFx0UmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyh2aXNpYmxlUmFuZ2UsIHdpZGdldC5jb21tZW50VGhyZWFkLnJhbmdlISlcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKGlzVmlzaWJsZSkge1xuXHRcdFx0XHRcdGF3YWl0IHdpZGdldC5jb2xsYXBzZSh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbW1lbnRXaWRnZXRWaXNpYmxlQ29udGV4dCgpOiB2b2lkIHtcblx0XHRjb25zdCBoYXNFeHBhbmRlZCA9IHRoaXMuX2NvbW1lbnRXaWRnZXRzLnNvbWUod2lkZ2V0ID0+IHdpZGdldC5leHBhbmRlZCk7XG5cdFx0dGhpcy5fY29tbWVudFdpZGdldFZpc2libGUuc2V0KGhhc0V4cGFuZGVkKTtcblx0fVxuXG5cdHB1YmxpYyBleHBhbmRBbGwoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy5fY29tbWVudFdpZGdldHMpIHtcblx0XHRcdHdpZGdldC5leHBhbmQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZXhwYW5kVW5yZXNvbHZlZCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLl9jb21tZW50V2lkZ2V0cykge1xuXHRcdFx0aWYgKHdpZGdldC5jb21tZW50VGhyZWFkLnN0YXRlID09PSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlLlVucmVzb2x2ZWQpIHtcblx0XHRcdFx0d2lkZ2V0LmV4cGFuZCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBuZXh0Q29tbWVudFRocmVhZChmb2N1c1RocmVhZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmROZWFyZXN0Q29tbWVudFRocmVhZChmb2N1c1RocmVhZCk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTmVhcmVzdENvbW1lbnRUaHJlYWQoZm9jdXNUaHJlYWQ6IGJvb2xlYW4sIHJldmVyc2U/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb21tZW50V2lkZ2V0cy5sZW5ndGggfHwgIXRoaXMuZWRpdG9yPy5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWZ0ZXIgPSByZXZlcnNlID8gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9uKCkuZ2V0U3RhcnRQb3NpdGlvbigpIDogdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9uKCkuZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRjb25zdCBzb3J0ZWRXaWRnZXRzID0gdGhpcy5fY29tbWVudFdpZGdldHMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKHJldmVyc2UpIHtcblx0XHRcdFx0Y29uc3QgdGVtcCA9IGE7XG5cdFx0XHRcdGEgPSBiO1xuXHRcdFx0XHRiID0gdGVtcDtcblx0XHRcdH1cblx0XHRcdGlmIChhLmNvbW1lbnRUaHJlYWQucmFuZ2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYi5jb21tZW50VGhyZWFkLnJhbmdlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYS5jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0TGluZU51bWJlciA8IGIuY29tbWVudFRocmVhZC5yYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYS5jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0TGluZU51bWJlciA+IGIuY29tbWVudFRocmVhZC5yYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhLmNvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRDb2x1bW4gPCBiLmNvbW1lbnRUaHJlYWQucmFuZ2Uuc3RhcnRDb2x1bW4pIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYS5jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0Q29sdW1uID4gYi5jb21tZW50VGhyZWFkLnJhbmdlLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGlkeCA9IGZpbmRGaXJzdElkeE1vbm90b25vdXNPckFyckxlbihzb3J0ZWRXaWRnZXRzLCB3aWRnZXQgPT4ge1xuXHRcdFx0Y29uc3QgbGluZVZhbHVlT25lID0gcmV2ZXJzZSA/IGFmdGVyLmxpbmVOdW1iZXIgOiAod2lkZ2V0LmNvbW1lbnRUaHJlYWQucmFuZ2U/LnN0YXJ0TGluZU51bWJlciA/PyAwKTtcblx0XHRcdGNvbnN0IGxpbmVWYWx1ZVR3byA9IHJldmVyc2UgPyAod2lkZ2V0LmNvbW1lbnRUaHJlYWQucmFuZ2U/LnN0YXJ0TGluZU51bWJlciA/PyAwKSA6IGFmdGVyLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBjb2x1bW5WYWx1ZU9uZSA9IHJldmVyc2UgPyBhZnRlci5jb2x1bW4gOiAod2lkZ2V0LmNvbW1lbnRUaHJlYWQucmFuZ2U/LnN0YXJ0Q29sdW1uID8/IDApO1xuXHRcdFx0Y29uc3QgY29sdW1uVmFsdWVUd28gPSByZXZlcnNlID8gKHdpZGdldC5jb21tZW50VGhyZWFkLnJhbmdlPy5zdGFydENvbHVtbiA/PyAwKSA6IGFmdGVyLmNvbHVtbjtcblx0XHRcdGlmIChsaW5lVmFsdWVPbmUgPiBsaW5lVmFsdWVUd28pIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChsaW5lVmFsdWVPbmUgPCBsaW5lVmFsdWVUd28pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29sdW1uVmFsdWVPbmUgPiBjb2x1bW5WYWx1ZVR3bykge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IG5leHRXaWRnZXQ6IFJldmlld1pvbmVXaWRnZXQgfCB1bmRlZmluZWQgPSBzb3J0ZWRXaWRnZXRzW2lkeF07XG5cdFx0aWYgKG5leHRXaWRnZXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2VsZWN0aW9uKG5leHRXaWRnZXQuY29tbWVudFRocmVhZC5yYW5nZSA/PyBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXHRcdFx0bmV4dFdpZGdldC5yZXZlYWwodW5kZWZpbmVkLCBmb2N1c1RocmVhZCA/IENvbW1lbnRXaWRnZXRGb2N1cy5XaWRnZXQgOiBDb21tZW50V2lkZ2V0Rm9jdXMuTm9uZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHByZXZpb3VzQ29tbWVudFRocmVhZChmb2N1c1RocmVhZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbmROZWFyZXN0Q29tbWVudFRocmVhZChmb2N1c1RocmVhZCwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTmVhcmVzdENvbW1lbnRpbmdSYW5nZShyZXZlcnNlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3I/Lmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZnRlciA9IHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbigpLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9jb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IuZ2V0TmVhcmVzdENvbW1lbnRpbmdSYW5nZShhZnRlciwgcmV2ZXJzZSk7XG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHJldmVyc2UgPyByYW5nZS5nZXRFbmRQb3NpdGlvbigpIDogcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0dGhpcy5lZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdGNvbnN0IGNvbW1lbnRSYW5nZVN0YXJ0ID0gcmFuZ2U/LmdldFN0YXJ0UG9zaXRpb24oKS5saW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgY29tbWVudFJhbmdlRW5kID0gcmFuZ2U/LmdldEVuZFBvc2l0aW9uKCkubGluZU51bWJlcjtcblx0XHRcdGlmIChjb21tZW50UmFuZ2VTdGFydCAmJiBjb21tZW50UmFuZ2VFbmQpIHtcblx0XHRcdFx0Y29uc3Qgb25lTGluZSA9IGNvbW1lbnRSYW5nZVN0YXJ0ID09PSBjb21tZW50UmFuZ2VFbmQ7XG5cdFx0XHRcdG9uZUxpbmUgPyBzdGF0dXMobmxzLmxvY2FsaXplKCdjb21tZW50UmFuZ2UnLCBcIkxpbmUgezB9XCIsIGNvbW1lbnRSYW5nZVN0YXJ0KSkgOiBzdGF0dXMobmxzLmxvY2FsaXplKCdjb21tZW50UmFuZ2VTdGFydCcsIFwiTGluZXMgezB9IHRvIHsxfVwiLCBjb21tZW50UmFuZ2VTdGFydCwgY29tbWVudFJhbmdlRW5kKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG5leHRDb21tZW50aW5nUmFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluZE5lYXJlc3RDb21tZW50aW5nUmFuZ2UoKTtcblx0fVxuXG5cdHB1YmxpYyBwcmV2aW91c0NvbW1lbnRpbmdSYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9maW5kTmVhcmVzdENvbW1lbnRpbmdSYW5nZSh0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NlKHRoaXMuX2VkaXRvckRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NlKHRoaXMuX2NvbW1lbnRXaWRnZXRzKTtcblxuXHRcdHRoaXMuZWRpdG9yID0gbnVsbCE7IC8vIFN0cmljdCBudWxsIG92ZXJyaWRlIC0gbnVsbGluZyBvdXQgaW4gZGlzcG9zZVxuXHR9XG5cblx0cHJpdmF0ZSBvbldpbGxDaGFuZ2VNb2RlbChlOiBJTW9kZWxDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5uZXdNb2RlbFVybCkge1xuXHRcdFx0dGhpcy50cnlVcGRhdGVSZXNlcnZlZFNwYWNlKGUubmV3TW9kZWxVcmwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlQ29tbWVudEFkZGVkKGVkaXRvcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHVuaXF1ZU93bmVyOiBzdHJpbmcsIHRocmVhZDogbGFuZ3VhZ2VzLkFkZGVkQ29tbWVudFRocmVhZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1hdGNoZWRab25lcyA9IHRoaXMuX2NvbW1lbnRXaWRnZXRzLmZpbHRlcih6b25lV2lkZ2V0ID0+IHpvbmVXaWRnZXQudW5pcXVlT3duZXIgPT09IHVuaXF1ZU93bmVyICYmIHpvbmVXaWRnZXQuY29tbWVudFRocmVhZC50aHJlYWRJZCA9PT0gdGhyZWFkLnRocmVhZElkKTtcblx0XHRpZiAobWF0Y2hlZFpvbmVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoZWROZXdDb21tZW50VGhyZWFkWm9uZXMgPSB0aGlzLl9jb21tZW50V2lkZ2V0cy5maWx0ZXIoem9uZVdpZGdldCA9PiB6b25lV2lkZ2V0LnVuaXF1ZU93bmVyID09PSB1bmlxdWVPd25lciAmJiB6b25lV2lkZ2V0LmNvbW1lbnRUaHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSA9PT0gLTEgJiYgUmFuZ2UuZXF1YWxzUmFuZ2Uoem9uZVdpZGdldC5jb21tZW50VGhyZWFkLnJhbmdlLCB0aHJlYWQucmFuZ2UpKTtcblxuXHRcdGlmIChtYXRjaGVkTmV3Q29tbWVudFRocmVhZFpvbmVzLmxlbmd0aCkge1xuXHRcdFx0bWF0Y2hlZE5ld0NvbW1lbnRUaHJlYWRab25lc1swXS51cGRhdGUodGhyZWFkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250aW51ZU9uQ29tbWVudEluZGV4ID0gdGhpcy5faW5Qcm9jZXNzQ29udGludWVPbkNvbW1lbnRzLmdldCh1bmlxdWVPd25lcik/LmZpbmRJbmRleChwZW5kaW5nID0+IHtcblx0XHRcdGlmIChwZW5kaW5nLnJhbmdlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRocmVhZC5yYW5nZSA9PT0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIFJhbmdlLmxpZnQocGVuZGluZy5yYW5nZSkuZXF1YWxzUmFuZ2UodGhyZWFkLnJhbmdlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRsZXQgY29udGludWVPbkNvbW1lbnRUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKChjb250aW51ZU9uQ29tbWVudEluZGV4ICE9PSB1bmRlZmluZWQpICYmIGNvbnRpbnVlT25Db21tZW50SW5kZXggPj0gMCkge1xuXHRcdFx0Y29udGludWVPbkNvbW1lbnRUZXh0ID0gdGhpcy5faW5Qcm9jZXNzQ29udGludWVPbkNvbW1lbnRzLmdldCh1bmlxdWVPd25lcik/LnNwbGljZShjb250aW51ZU9uQ29tbWVudEluZGV4LCAxKVswXS5jb21tZW50LmJvZHk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ0NvbW1lbnRUZXh0ID0gKHRoaXMuX3BlbmRpbmdOZXdDb21tZW50Q2FjaGVbdW5pcXVlT3duZXJdICYmIHRoaXMuX3BlbmRpbmdOZXdDb21tZW50Q2FjaGVbdW5pcXVlT3duZXJdW3RocmVhZC50aHJlYWRJZF0pXG5cdFx0XHQ/PyBjb250aW51ZU9uQ29tbWVudFRleHQ7XG5cdFx0Y29uc3QgcGVuZGluZ0VkaXRzID0gdGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGVbdW5pcXVlT3duZXJdICYmIHRoaXMuX3BlbmRpbmdFZGl0c0NhY2hlW3VuaXF1ZU93bmVyXVt0aHJlYWQudGhyZWFkSWRdO1xuXHRcdGNvbnN0IHNob3VsZFJldmVhbCA9IHRocmVhZC5jYW5SZXBseSAmJiB0aHJlYWQuaXNUZW1wbGF0ZSAmJiAoIXRocmVhZC5jb21tZW50cyB8fCAodGhyZWFkLmNvbW1lbnRzLmxlbmd0aCA9PT0gMCkpICYmICghdGhyZWFkLmVkaXRvcklkIHx8ICh0aHJlYWQuZWRpdG9ySWQgPT09IGVkaXRvcklkKSk7XG5cdFx0YXdhaXQgdGhpcy5kaXNwbGF5Q29tbWVudFRocmVhZCh1bmlxdWVPd25lciwgdGhyZWFkLCBzaG91bGRSZXZlYWwsIHBlbmRpbmdDb21tZW50VGV4dCwgcGVuZGluZ0VkaXRzKTtcblx0XHR0aGlzLl9jb21tZW50SW5mb3MuZmlsdGVyKGluZm8gPT4gaW5mby51bmlxdWVPd25lciA9PT0gdW5pcXVlT3duZXIpWzBdLnRocmVhZHMucHVzaCh0aHJlYWQpO1xuXHRcdHRoaXMudHJ5VXBkYXRlUmVzZXJ2ZWRTcGFjZSgpO1xuXHR9XG5cblx0cHVibGljIG9uTW9kZWxDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuY2xlYXIoKTtcblx0XHR0aGlzLnRyeVVwZGF0ZVJlc2VydmVkU3BhY2UoKTtcblxuXHRcdHRoaXMucmVtb3ZlQ29tbWVudFdpZGdldHNBbmRTdG9yZUNhY2hlKCk7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhc1Jlc3BvbmRlZFRvRWRpdG9yQ2hhbmdlID0gZmFsc2U7XG5cblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbk1vdXNlRG93bihlID0+IHRoaXMub25FZGl0b3JNb3VzZURvd24oZSkpKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbk1vdXNlVXAoZSA9PiB0aGlzLm9uRWRpdG9yTW91c2VVcChlKSkpO1xuXHRcdGlmICh0aGlzLl9lZGl0b3JEaXNwb3NhYmxlcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuY2xlYXJFZGl0b3JMaXN0ZW5lcnMoKTtcblx0XHRcdHRoaXMucmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb21wdXRlQ29tbWVudGluZ1JhbmdlU2NoZWR1bGVyID0gbmV3IERlbGF5ZXI8SUNvbW1lbnRJbmZvW10+KDIwMCk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb21wdXRlQ29tbWVudGluZ1JhbmdlU2NoZWR1bGVyPy5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fY29tcHV0ZUNvbW1lbnRpbmdSYW5nZVNjaGVkdWxlciA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5iZWdpbkNvbXB1dGVDb21tZW50aW5nUmFuZ2VzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuY29tbWVudFNlcnZpY2Uub25EaWRVcGRhdGVDb21tZW50VGhyZWFkcyhhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvclVSSSA9IHRoaXMuZWRpdG9yICYmIHRoaXMuZWRpdG9yLmhhc01vZGVsKCkgJiYgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cdFx0XHRpZiAoIWVkaXRvclVSSSB8fCAhdGhpcy5jb21tZW50U2VydmljZS5pc0NvbW1lbnRpbmdFbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2NvbXB1dGVQcm9taXNlKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbXB1dGVQcm9taXNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21tZW50SW5mbyA9IHRoaXMuX2NvbW1lbnRJbmZvcy5maWx0ZXIoaW5mbyA9PiBpbmZvLnVuaXF1ZU93bmVyID09PSBlLnVuaXF1ZU93bmVyKTtcblx0XHRcdGlmICghY29tbWVudEluZm8gfHwgIWNvbW1lbnRJbmZvLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFkZGVkID0gZS5hZGRlZC5maWx0ZXIodGhyZWFkID0+IHRocmVhZC5yZXNvdXJjZSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChVUkkucGFyc2UodGhyZWFkLnJlc291cmNlKSwgZWRpdG9yVVJJKSk7XG5cdFx0XHRjb25zdCByZW1vdmVkID0gZS5yZW1vdmVkLmZpbHRlcih0aHJlYWQgPT4gdGhyZWFkLnJlc291cmNlICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKFVSSS5wYXJzZSh0aHJlYWQucmVzb3VyY2UpLCBlZGl0b3JVUkkpKTtcblx0XHRcdGNvbnN0IGNoYW5nZWQgPSBlLmNoYW5nZWQuZmlsdGVyKHRocmVhZCA9PiB0aHJlYWQucmVzb3VyY2UgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoVVJJLnBhcnNlKHRocmVhZC5yZXNvdXJjZSksIGVkaXRvclVSSSkpO1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IGUucGVuZGluZy5maWx0ZXIocGVuZGluZyA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChwZW5kaW5nLnVyaSwgZWRpdG9yVVJJKSk7XG5cblx0XHRcdHJlbW92ZWQuZm9yRWFjaCh0aHJlYWQgPT4ge1xuXHRcdFx0XHRjb25zdCBtYXRjaGVkWm9uZXMgPSB0aGlzLl9jb21tZW50V2lkZ2V0cy5maWx0ZXIoem9uZVdpZGdldCA9PiB6b25lV2lkZ2V0LnVuaXF1ZU93bmVyID09PSBlLnVuaXF1ZU93bmVyICYmIHpvbmVXaWRnZXQuY29tbWVudFRocmVhZC50aHJlYWRJZCA9PT0gdGhyZWFkLnRocmVhZElkICYmIHpvbmVXaWRnZXQuY29tbWVudFRocmVhZC50aHJlYWRJZCAhPT0gJycpO1xuXHRcdFx0XHRpZiAobWF0Y2hlZFpvbmVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoZWRab25lID0gbWF0Y2hlZFpvbmVzWzBdO1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fY29tbWVudFdpZGdldHMuaW5kZXhPZihtYXRjaGVkWm9uZSk7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWVudFdpZGdldHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0XHRtYXRjaGVkWm9uZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaW5mb3NUaHJlYWRzID0gdGhpcy5fY29tbWVudEluZm9zLmZpbHRlcihpbmZvID0+IGluZm8udW5pcXVlT3duZXIgPT09IGUudW5pcXVlT3duZXIpWzBdLnRocmVhZHM7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5mb3NUaHJlYWRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKGluZm9zVGhyZWFkc1tpXSA9PT0gdGhyZWFkKSB7XG5cdFx0XHRcdFx0XHRpbmZvc1RocmVhZHMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0aS0tO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIGNoYW5nZWQpIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2hlZFpvbmVzID0gdGhpcy5fY29tbWVudFdpZGdldHMuZmlsdGVyKHpvbmVXaWRnZXQgPT4gem9uZVdpZGdldC51bmlxdWVPd25lciA9PT0gZS51bmlxdWVPd25lciAmJiB6b25lV2lkZ2V0LmNvbW1lbnRUaHJlYWQudGhyZWFkSWQgPT09IHRocmVhZC50aHJlYWRJZCk7XG5cdFx0XHRcdGlmIChtYXRjaGVkWm9uZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWF0Y2hlZFpvbmUgPSBtYXRjaGVkWm9uZXNbMF07XG5cdFx0XHRcdFx0bWF0Y2hlZFpvbmUudXBkYXRlKHRocmVhZCk7XG5cdFx0XHRcdFx0dGhpcy5vcGVuQ29tbWVudHNWaWV3KHRocmVhZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGVkaXRvcklkID0gdGhpcy5lZGl0b3I/LmdldElkKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBhZGRlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmhhbmRsZUNvbW1lbnRBZGRlZChlZGl0b3JJZCwgZS51bmlxdWVPd25lciwgdGhyZWFkKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCB0aHJlYWQgb2YgcGVuZGluZykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlc3VtZVBlbmRpbmdDb21tZW50KGVkaXRvclVSSSwgdGhyZWFkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRSYW5nZURlY29yYXRvci51cGRhdGUodGhpcy5lZGl0b3IsIGNvbW1lbnRJbmZvKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmJlZ2luQ29tcHV0ZUFuZEhhbmRsZUVkaXRvckNoYW5nZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXN1bWVQZW5kaW5nQ29tbWVudChlZGl0b3JVUkk6IFVSSSwgdGhyZWFkOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnRUaHJlYWQpIHtcblx0XHRjb25zdCBtYXRjaGVkWm9uZXMgPSB0aGlzLl9jb21tZW50V2lkZ2V0cy5maWx0ZXIoem9uZVdpZGdldCA9PiB6b25lV2lkZ2V0LnVuaXF1ZU93bmVyID09PSB0aHJlYWQudW5pcXVlT3duZXIgJiYgUmFuZ2UubGlmdCh6b25lV2lkZ2V0LmNvbW1lbnRUaHJlYWQucmFuZ2UpPy5lcXVhbHNSYW5nZSh0aHJlYWQucmFuZ2UpKTtcblx0XHRpZiAodGhyZWFkLmlzUmVwbHkgJiYgbWF0Y2hlZFpvbmVzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5jb21tZW50U2VydmljZS5yZW1vdmVDb250aW51ZU9uQ29tbWVudCh7IHVuaXF1ZU93bmVyOiB0aHJlYWQudW5pcXVlT3duZXIsIHVyaTogZWRpdG9yVVJJLCByYW5nZTogdGhyZWFkLnJhbmdlLCBpc1JlcGx5OiB0cnVlIH0pO1xuXHRcdFx0bWF0Y2hlZFpvbmVzWzBdLnNldFBlbmRpbmdDb21tZW50KHRocmVhZC5jb21tZW50KTtcblx0XHR9IGVsc2UgaWYgKG1hdGNoZWRab25lcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2UucmVtb3ZlQ29udGludWVPbkNvbW1lbnQoeyB1bmlxdWVPd25lcjogdGhyZWFkLnVuaXF1ZU93bmVyLCB1cmk6IGVkaXRvclVSSSwgcmFuZ2U6IHRocmVhZC5yYW5nZSwgaXNSZXBseTogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBleGlzdGluZ1BlbmRpbmdDb21tZW50ID0gbWF0Y2hlZFpvbmVzWzBdLmdldFBlbmRpbmdDb21tZW50cygpLm5ld0NvbW1lbnQ7XG5cdFx0XHQvLyBXZSBuZWVkIHRvIHRyeSB0byByZWNvbmNpbGUgdGhlIGV4aXN0aW5nIHBlbmRpbmcgY29tbWVudCB3aXRoIHRoZSBpbmNvbWluZyBwZW5kaW5nIGNvbW1lbnRcblx0XHRcdGxldCBwZW5kaW5nQ29tbWVudDogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50O1xuXHRcdFx0aWYgKCFleGlzdGluZ1BlbmRpbmdDb21tZW50IHx8IHRocmVhZC5jb21tZW50LmJvZHkuaW5jbHVkZXMoZXhpc3RpbmdQZW5kaW5nQ29tbWVudC5ib2R5KSkge1xuXHRcdFx0XHRwZW5kaW5nQ29tbWVudCA9IHRocmVhZC5jb21tZW50O1xuXHRcdFx0fSBlbHNlIGlmIChleGlzdGluZ1BlbmRpbmdDb21tZW50LmJvZHkuaW5jbHVkZXModGhyZWFkLmNvbW1lbnQuYm9keSkpIHtcblx0XHRcdFx0cGVuZGluZ0NvbW1lbnQgPSBleGlzdGluZ1BlbmRpbmdDb21tZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGVuZGluZ0NvbW1lbnQgPSB7IGJvZHk6IGAke2V4aXN0aW5nUGVuZGluZ0NvbW1lbnR9XFxuJHt0aHJlYWQuY29tbWVudC5ib2R5fWAsIGN1cnNvcjogdGhyZWFkLmNvbW1lbnQuY3Vyc29yIH07XG5cdFx0XHR9XG5cdFx0XHRtYXRjaGVkWm9uZXNbMF0uc2V0UGVuZGluZ0NvbW1lbnQocGVuZGluZ0NvbW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAoIXRocmVhZC5pc1JlcGx5KSB7XG5cdFx0XHRjb25zdCB0aHJlYWRTdGlsbEF2YWlsYWJsZSA9IHRoaXMuY29tbWVudFNlcnZpY2UucmVtb3ZlQ29udGludWVPbkNvbW1lbnQoeyB1bmlxdWVPd25lcjogdGhyZWFkLnVuaXF1ZU93bmVyLCB1cmk6IGVkaXRvclVSSSwgcmFuZ2U6IHRocmVhZC5yYW5nZSwgaXNSZXBseTogZmFsc2UgfSk7XG5cdFx0XHRpZiAoIXRocmVhZFN0aWxsQXZhaWxhYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5faW5Qcm9jZXNzQ29udGludWVPbkNvbW1lbnRzLmhhcyh0aHJlYWQudW5pcXVlT3duZXIpKSB7XG5cdFx0XHRcdHRoaXMuX2luUHJvY2Vzc0NvbnRpbnVlT25Db21tZW50cy5zZXQodGhyZWFkLnVuaXF1ZU93bmVyLCBbXSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pblByb2Nlc3NDb250aW51ZU9uQ29tbWVudHMuZ2V0KHRocmVhZC51bmlxdWVPd25lcik/LnB1c2godGhyZWFkKTtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWVudFNlcnZpY2UuY3JlYXRlQ29tbWVudFRocmVhZFRlbXBsYXRlKHRocmVhZC51bmlxdWVPd25lciwgdGhyZWFkLnVyaSwgdGhyZWFkLnJhbmdlID8gUmFuZ2UubGlmdCh0aHJlYWQucmFuZ2UpIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGJlZ2luQ29tcHV0ZUFuZEhhbmRsZUVkaXRvckNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLmJlZ2luQ29tcHV0ZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9oYXNSZXNwb25kZWRUb0VkaXRvckNoYW5nZSkge1xuXHRcdFx0XHRpZiAodGhpcy5fY29tbWVudEluZm9zLnNvbWUoY29tbWVudEluZm8gPT4gY29tbWVudEluZm8uY29tbWVudGluZ1Jhbmdlcy5yYW5nZXMubGVuZ3RoID4gMCB8fCBjb21tZW50SW5mby5jb21tZW50aW5nUmFuZ2VzLmZpbGVDb21tZW50cykpIHtcblx0XHRcdFx0XHR0aGlzLl9oYXNSZXNwb25kZWRUb0VkaXRvckNoYW5nZSA9IHRydWU7XG5cdFx0XHRcdFx0Y29uc3QgdmVyYm9zZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5Db21tZW50cyk7XG5cdFx0XHRcdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJpbGl0eUhlbHApPy5nZXRBcmlhTGFiZWwoKTtcblx0XHRcdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0XHRcdHN0YXR1cyhubHMubG9jYWxpemUoJ2hhc0NvbW1lbnRSYW5nZXNLYicsIFwiRWRpdG9yIGhhcyBjb21tZW50aW5nIHJhbmdlcywgcnVuIHRoZSBjb21tYW5kIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwICh7MH0pLCBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIiwga2V5YmluZGluZykpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzKG5scy5sb2NhbGl6ZSgnaGFzQ29tbWVudFJhbmdlc05vS2InLCBcIkVkaXRvciBoYXMgY29tbWVudGluZyByYW5nZXMsIHJ1biB0aGUgY29tbWFuZCBPcGVuIEFjY2Vzc2liaWxpdHkgSGVscCwgd2hpY2ggaXMgY3VycmVudGx5IG5vdCB0cmlnZ2VyYWJsZSB2aWEga2V5YmluZGluZywgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c3RhdHVzKG5scy5sb2NhbGl6ZSgnaGFzQ29tbWVudFJhbmdlcycsIFwiRWRpdG9yIGhhcyBjb21tZW50aW5nIHJhbmdlcy5cIikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQ29tbWVudHNWaWV3KHRocmVhZDogbGFuZ3VhZ2VzLkNvbW1lbnRUaHJlYWQpIHtcblx0XHRpZiAodGhyZWFkLmNvbW1lbnRzICYmICh0aHJlYWQuY29tbWVudHMubGVuZ3RoID4gMCkgJiYgdGhyZWFkSGFzTWVhbmluZ2Z1bENvbW1lbnRzKHRocmVhZCkpIHtcblx0XHRcdGNvbnN0IG9wZW5WaWV3U3RhdGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElDb21tZW50c0NvbmZpZ3VyYXRpb24+KENPTU1FTlRTX1NFQ1RJT04pLm9wZW5WaWV3O1xuXHRcdFx0aWYgKG9wZW5WaWV3U3RhdGUgPT09ICdmaWxlJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy52aWV3c1NlcnZpY2Uub3BlblZpZXcoQ09NTUVOVFNfVklFV19JRCk7XG5cdFx0XHR9IGVsc2UgaWYgKG9wZW5WaWV3U3RhdGUgPT09ICdmaXJzdEZpbGUnIHx8IChvcGVuVmlld1N0YXRlID09PSAnZmlyc3RGaWxlVW5yZXNvbHZlZCcgJiYgdGhyZWFkLnN0YXRlID09PSBsYW5ndWFnZXMuQ29tbWVudFRocmVhZFN0YXRlLlVucmVzb2x2ZWQpKSB7XG5cdFx0XHRcdGNvbnN0IGhhc1Nob3duVmlldyA9IHRoaXMudmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQ8Q29tbWVudHNQYW5lbD4oQ09NTUVOVFNfVklFV19JRCk/Lmhhc1JlbmRlcmVkO1xuXHRcdFx0XHRpZiAoIWhhc1Nob3duVmlldykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyhDT01NRU5UU19WSUVXX0lEKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkaXNwbGF5Q29tbWVudFRocmVhZCh1bmlxdWVPd25lcjogc3RyaW5nLCB0aHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkLCBzaG91bGRSZXZlYWw6IGJvb2xlYW4sIHBlbmRpbmdDb21tZW50OiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfCB1bmRlZmluZWQsIHBlbmRpbmdFZGl0czogeyBba2V5OiBudW1iZXJdOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZWRpdG9yPy5nZXRNb2RlbCgpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5lZGl0b3IgfHwgdGhpcy5pc0VkaXRvcklubGluZU9yaWdpbmFsKHRoaXMuZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBjb250aW51ZU9uQ29tbWVudFJlcGx5OiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnRUaHJlYWQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRocmVhZC5yYW5nZSAmJiAhcGVuZGluZ0NvbW1lbnQpIHtcblx0XHRcdGNvbnRpbnVlT25Db21tZW50UmVwbHkgPSB0aGlzLmNvbW1lbnRTZXJ2aWNlLnJlbW92ZUNvbnRpbnVlT25Db21tZW50KHsgdW5pcXVlT3duZXIsIHVyaTogZWRpdG9yLnVyaSwgcmFuZ2U6IHRocmVhZC5yYW5nZSwgaXNSZXBseTogdHJ1ZSB9KTtcblx0XHR9XG5cdFx0Y29uc3Qgem9uZVdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmV2aWV3Wm9uZVdpZGdldCwgdGhpcy5lZGl0b3IsIHVuaXF1ZU93bmVyLCB0aHJlYWQsIHBlbmRpbmdDb21tZW50ID8/IGNvbnRpbnVlT25Db21tZW50UmVwbHk/LmNvbW1lbnQsIHBlbmRpbmdFZGl0cyk7XG5cdFx0YXdhaXQgem9uZVdpZGdldC5kaXNwbGF5KHRocmVhZC5yYW5nZSwgc2hvdWxkUmV2ZWFsKTtcblx0XHR0aGlzLl9jb21tZW50V2lkZ2V0cy5wdXNoKHpvbmVXaWRnZXQpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHpvbmVXaWRnZXQub25EaWRDaGFuZ2VFeHBhbmRlZFN0YXRlKCgpID0+IHRoaXMuX3VwZGF0ZUNvbW1lbnRXaWRnZXRWaXNpYmxlQ29udGV4dCgpKSk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQoem9uZVdpZGdldC5vbkRpZENsb3NlKCgpID0+IHRoaXMuX3VwZGF0ZUNvbW1lbnRXaWRnZXRWaXNpYmxlQ29udGV4dCgpKSk7XG5cdFx0dGhpcy5vcGVuQ29tbWVudHNWaWV3KHRocmVhZCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdG9yTW91c2VEb3duKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5tb3VzZURvd25JbmZvID0gKGUudGFyZ2V0LmVsZW1lbnQ/LmNsYXNzTmFtZS5pbmRleE9mKCdjb21tZW50LXJhbmdlLWdseXBoJykgPz8gLTEpID49IDAgPyBwYXJzZU1vdXNlRG93bkluZm9Gcm9tRXZlbnQoZSkgOiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlVXAoZTogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBtYXRjaGVkTGluZU51bWJlciA9IGlzTW91c2VVcEV2ZW50RHJhZ0Zyb21Nb3VzZURvd24odGhpcy5tb3VzZURvd25JbmZvLCBlKTtcblx0XHR0aGlzLm1vdXNlRG93bkluZm8gPSBudWxsO1xuXG5cdFx0aWYgKCF0aGlzLmVkaXRvciB8fCBtYXRjaGVkTGluZU51bWJlciA9PT0gbnVsbCB8fCAhZS50YXJnZXQuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb3VzZVVwSXNPbkRlY29yYXRvciA9IChlLnRhcmdldC5lbGVtZW50LmNsYXNzTmFtZS5pbmRleE9mKCdjb21tZW50LXJhbmdlLWdseXBoJykgPj0gMCk7XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gZS50YXJnZXQucG9zaXRpb24hLmxpbmVOdW1iZXI7XG5cdFx0bGV0IHJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2VsZWN0aW9uOiBSYW5nZSB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0Ly8gQ2hlY2sgZm9yIGRyYWcgYWxvbmcgZ3V0dGVyIGRlY29yYXRpb25cblx0XHRpZiAoKG1hdGNoZWRMaW5lTnVtYmVyICE9PSBsaW5lTnVtYmVyKSkge1xuXHRcdFx0aWYgKG1hdGNoZWRMaW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHRzZWxlY3Rpb24gPSBuZXcgUmFuZ2UobWF0Y2hlZExpbmVOdW1iZXIsIHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVMZW5ndGgobWF0Y2hlZExpbmVOdW1iZXIpICsgMSwgbGluZU51bWJlciwgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWxlY3Rpb24gPSBuZXcgUmFuZ2UobWF0Y2hlZExpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVMZW5ndGgobGluZU51bWJlcikgKyAxKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKG1vdXNlVXBJc09uRGVjb3JhdG9yKSB7XG5cdFx0XHRzZWxlY3Rpb24gPSB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3Igc2VsZWN0aW9uIGF0IGxpbmUgbnVtYmVyLlxuXHRcdGlmIChzZWxlY3Rpb24gJiYgKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPD0gbGluZU51bWJlcikgJiYgKGxpbmVOdW1iZXIgPD0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRyYW5nZSA9IHNlbGVjdGlvbjtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgUmFuZ2Uoc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIDEsIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyLCAxKSk7XG5cdFx0fSBlbHNlIGlmIChtb3VzZVVwSXNPbkRlY29yYXRvcikge1xuXHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgMSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHR0aGlzLmFkZE9yVG9nZ2xlQ29tbWVudEF0TGluZShyYW5nZSwgZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldENvbW1lbnRzQXRMaW5lKGNvbW1lbnRSYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQpOiBSZXZpZXdab25lV2lkZ2V0W10ge1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50V2lkZ2V0cy5maWx0ZXIod2lkZ2V0ID0+IHdpZGdldC5nZXRHbHlwaFBvc2l0aW9uKCkgPT09IChjb21tZW50UmFuZ2UgPyBjb21tZW50UmFuZ2UuZW5kTGluZU51bWJlciA6IDApKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhZGRPclRvZ2dsZUNvbW1lbnRBdExpbmUoY29tbWVudFJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZCwgZTogSUVkaXRvck1vdXNlRXZlbnQgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBJZiBhbiBhZGQgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcywgcXVldWUgdGhlIG5leHQgYWRkIGFuZCBwcm9jZXNzIGl0IGFmdGVyIHRoZSBjdXJyZW50IG9uZSBmaW5pc2hlcyB0b1xuXHRcdC8vIHByZXZlbnQgZW1wdHkgY29tbWVudCB0aHJlYWRzIGZyb20gYmVpbmcgYWRkZWQgdG8gdGhlIHNhbWUgbGluZS5cblx0XHRpZiAoIXRoaXMuX2FkZEluUHJvZ3Jlc3MpIHtcblx0XHRcdHRoaXMuX2FkZEluUHJvZ3Jlc3MgPSB0cnVlO1xuXHRcdFx0Ly8gVGhlIHdpZGdldCdzIHBvc2l0aW9uIGlzIHVuZGVmaW5lZCB1bnRpbCB0aGUgd2lkZ2V0IGhhcyBiZWVuIGRpc3BsYXllZCwgc28gcmVseSBvbiB0aGUgZ2x5cGggcG9zaXRpb24gaW5zdGVhZFxuXHRcdFx0Y29uc3QgZXhpc3RpbmdDb21tZW50c0F0TGluZSA9IHRoaXMuZ2V0Q29tbWVudHNBdExpbmUoY29tbWVudFJhbmdlKTtcblx0XHRcdGlmIChleGlzdGluZ0NvbW1lbnRzQXRMaW5lLmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBhbGxFeHBhbmRlZCA9IGV4aXN0aW5nQ29tbWVudHNBdExpbmUuZXZlcnkod2lkZ2V0ID0+IHdpZGdldC5leHBhbmRlZCk7XG5cdFx0XHRcdGV4aXN0aW5nQ29tbWVudHNBdExpbmUuZm9yRWFjaChhbGxFeHBhbmRlZCA/IHdpZGdldCA9PiB3aWRnZXQuY29sbGFwc2UodHJ1ZSkgOiB3aWRnZXQgPT4gd2lkZ2V0LmV4cGFuZCh0cnVlKSk7XG5cdFx0XHRcdHRoaXMucHJvY2Vzc05leHRUaHJlYWRUb0FkZCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFkZENvbW1lbnRBdExpbmUoY29tbWVudFJhbmdlLCBlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZW1wdHlUaHJlYWRzVG9BZGRRdWV1ZS5wdXNoKFtjb21tZW50UmFuZ2UsIGVdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb2Nlc3NOZXh0VGhyZWFkVG9BZGQoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWRkSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLl9lbXB0eVRocmVhZHNUb0FkZFF1ZXVlLnNoaWZ0KCk7XG5cdFx0aWYgKGluZm8pIHtcblx0XHRcdHRoaXMuYWRkT3JUb2dnbGVDb21tZW50QXRMaW5lKGluZm9bMF0sIGluZm9bMV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xpcFVzZXJSYW5nZVRvQ29tbWVudFJhbmdlKHVzZXJSYW5nZTogUmFuZ2UsIGNvbW1lbnRSYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0aWYgKHVzZXJSYW5nZS5zdGFydExpbmVOdW1iZXIgPCBjb21tZW50UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHR1c2VyUmFuZ2UgPSBuZXcgUmFuZ2UoY29tbWVudFJhbmdlLnN0YXJ0TGluZU51bWJlciwgY29tbWVudFJhbmdlLnN0YXJ0Q29sdW1uLCB1c2VyUmFuZ2UuZW5kTGluZU51bWJlciwgdXNlclJhbmdlLmVuZENvbHVtbik7XG5cdFx0fVxuXHRcdGlmICh1c2VyUmFuZ2UuZW5kTGluZU51bWJlciA+IGNvbW1lbnRSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHR1c2VyUmFuZ2UgPSBuZXcgUmFuZ2UodXNlclJhbmdlLnN0YXJ0TGluZU51bWJlciwgdXNlclJhbmdlLnN0YXJ0Q29sdW1uLCBjb21tZW50UmFuZ2UuZW5kTGluZU51bWJlciwgY29tbWVudFJhbmdlLmVuZENvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiB1c2VyUmFuZ2U7XG5cdH1cblxuXHRwdWJsaWMgYWRkQ29tbWVudEF0TGluZShyYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQsIGU6IElFZGl0b3JNb3VzZUV2ZW50IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbmV3Q29tbWVudEluZm9zID0gdGhpcy5fY29tbWVudGluZ1JhbmdlRGVjb3JhdG9yLmdldE1hdGNoZWRDb21tZW50QWN0aW9uKHJhbmdlKTtcblx0XHRpZiAoIW5ld0NvbW1lbnRJbmZvcy5sZW5ndGggfHwgIXRoaXMuZWRpdG9yPy5oYXNNb2RlbCgpKSB7XG5cdFx0XHR0aGlzLl9hZGRJblByb2dyZXNzID0gZmFsc2U7XG5cdFx0XHRpZiAoIW5ld0NvbW1lbnRJbmZvcy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnY29tbWVudHMuYWRkQ29tbWFuZC5lcnJvcicsIFwiVGhlIGN1cnNvciBtdXN0IGJlIHdpdGhpbiBhIGNvbW1lbnRpbmcgcmFuZ2UgdG8gYWRkIGEgY29tbWVudC5cIikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihubHMubG9jYWxpemUoJ2NvbW1lbnRzLmFkZEZpbGVDb21tZW50Q29tbWFuZC5lcnJvcicsIFwiRmlsZSBjb21tZW50cyBhcmUgbm90IGFsbG93ZWQgb24gdGhpcyBmaWxlLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0XHRpZiAobmV3Q29tbWVudEluZm9zLmxlbmd0aCA+IDEpIHtcblx0XHRcdGlmIChlICYmIHJhbmdlKSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmV2ZW50LFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKG5ld0NvbW1lbnRJbmZvcywgcmFuZ2UpLFxuXHRcdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBuZXdDb21tZW50SW5mb3MubGVuZ3RoID8gbmV3Q29tbWVudEluZm9zWzBdIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG9uSGlkZTogKCkgPT4geyB0aGlzLl9hZGRJblByb2dyZXNzID0gZmFsc2U7IH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcGlja3MgPSB0aGlzLmdldENvbW1lbnRQcm92aWRlcnNRdWlja1BpY2tzKG5ld0NvbW1lbnRJbmZvcyk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgncGlja0NvbW1lbnRTZXJ2aWNlJywgXCJTZWxlY3QgQ29tbWVudCBQcm92aWRlclwiKSwgbWF0Y2hPbkRlc2NyaXB0aW9uOiB0cnVlIH0pLnRoZW4ocGljayA9PiB7XG5cdFx0XHRcdFx0aWYgKCFwaWNrKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgY29tbWVudEluZm9zID0gbmV3Q29tbWVudEluZm9zLmZpbHRlcihpbmZvID0+IGluZm8uYWN0aW9uLm93bmVySWQgPT09IHBpY2suaWQpO1xuXG5cdFx0XHRcdFx0aWYgKGNvbW1lbnRJbmZvcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgb3duZXJJZCB9ID0gY29tbWVudEluZm9zWzBdLmFjdGlvbjtcblx0XHRcdFx0XHRcdGNvbnN0IGNsaXBwZWRSYW5nZSA9IHJhbmdlICYmIGNvbW1lbnRJbmZvc1swXS5yYW5nZSA/IHRoaXMuY2xpcFVzZXJSYW5nZVRvQ29tbWVudFJhbmdlKHJhbmdlLCBjb21tZW50SW5mb3NbMF0ucmFuZ2UpIDogcmFuZ2U7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZENvbW1lbnRBdExpbmUyKGNsaXBwZWRSYW5nZSwgb3duZXJJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9hZGRJblByb2dyZXNzID0gZmFsc2U7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB7IG93bmVySWQgfSA9IG5ld0NvbW1lbnRJbmZvc1swXS5hY3Rpb247XG5cdFx0XHRjb25zdCBjbGlwcGVkUmFuZ2UgPSByYW5nZSAmJiBuZXdDb21tZW50SW5mb3NbMF0ucmFuZ2UgPyB0aGlzLmNsaXBVc2VyUmFuZ2VUb0NvbW1lbnRSYW5nZShyYW5nZSwgbmV3Q29tbWVudEluZm9zWzBdLnJhbmdlKSA6IHJhbmdlO1xuXHRcdFx0dGhpcy5hZGRDb21tZW50QXRMaW5lMihjbGlwcGVkUmFuZ2UsIG93bmVySWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29tbWVudFByb3ZpZGVyc1F1aWNrUGlja3MoY29tbWVudEluZm9zOiBNZXJnZWRDb21tZW50UmFuZ2VBY3Rpb25zW10pIHtcblx0XHRjb25zdCBwaWNrczogUXVpY2tQaWNrSW5wdXRbXSA9IGNvbW1lbnRJbmZvcy5tYXAoKGNvbW1lbnRJbmZvKSA9PiB7XG5cdFx0XHRjb25zdCB7IG93bmVySWQsIGV4dGVuc2lvbklkLCBsYWJlbCB9ID0gY29tbWVudEluZm8uYWN0aW9uO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogbGFiZWwgPz8gZXh0ZW5zaW9uSWQgPz8gb3duZXJJZCxcblx0XHRcdFx0aWQ6IG93bmVySWRcblx0XHRcdH0gc2F0aXNmaWVzIElRdWlja1BpY2tJdGVtO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBpY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb250ZXh0TWVudUFjdGlvbnMoY29tbWVudEluZm9zOiBNZXJnZWRDb21tZW50UmFuZ2VBY3Rpb25zW10sIGNvbW1lbnRSYW5nZTogUmFuZ2UpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0Y29tbWVudEluZm9zLmZvckVhY2goY29tbWVudEluZm8gPT4ge1xuXHRcdFx0Y29uc3QgeyBvd25lcklkLCBleHRlbnNpb25JZCwgbGFiZWwgfSA9IGNvbW1lbnRJbmZvLmFjdGlvbjtcblxuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdhZGRDb21tZW50VGhyZWFkJyxcblx0XHRcdFx0YCR7bGFiZWwgfHwgZXh0ZW5zaW9uSWR9YCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY2xpcHBlZFJhbmdlID0gY29tbWVudEluZm8ucmFuZ2UgPyB0aGlzLmNsaXBVc2VyUmFuZ2VUb0NvbW1lbnRSYW5nZShjb21tZW50UmFuZ2UsIGNvbW1lbnRJbmZvLnJhbmdlKSA6IGNvbW1lbnRSYW5nZTtcblx0XHRcdFx0XHR0aGlzLmFkZENvbW1lbnRBdExpbmUyKGNsaXBwZWRSYW5nZSwgb3duZXJJZCk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHQpKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBhZGRDb21tZW50QXRMaW5lMihyYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQsIG93bmVySWQ6IHN0cmluZykge1xuXHRcdGlmICghdGhpcy5lZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jb21tZW50U2VydmljZS5jcmVhdGVDb21tZW50VGhyZWFkVGVtcGxhdGUob3duZXJJZCwgdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEudXJpLCByYW5nZSwgdGhpcy5lZGl0b3IuZ2V0SWQoKSk7XG5cdFx0dGhpcy5wcm9jZXNzTmV4dFRocmVhZFRvQWRkKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeGlzdGluZ0NvbW1lbnRFZGl0b3JPcHRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRjb25zdCBsaW5lRGVjb3JhdGlvbnNXaWR0aDogbnVtYmVyID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZURlY29yYXRpb25zV2lkdGgpO1xuXHRcdGxldCBleHRyYUVkaXRvckNsYXNzTmFtZTogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb25maWd1cmVkRXh0cmFDbGFzc05hbWUgPSBlZGl0b3IuZ2V0UmF3T3B0aW9ucygpLmV4dHJhRWRpdG9yQ2xhc3NOYW1lO1xuXHRcdGlmIChjb25maWd1cmVkRXh0cmFDbGFzc05hbWUpIHtcblx0XHRcdGV4dHJhRWRpdG9yQ2xhc3NOYW1lID0gY29uZmlndXJlZEV4dHJhQ2xhc3NOYW1lLnNwbGl0KCcgJyk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGxpbmVEZWNvcmF0aW9uc1dpZHRoLCBleHRyYUVkaXRvckNsYXNzTmFtZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXaXRob3V0Q29tbWVudHNFZGl0b3JPcHRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IsIGV4dHJhRWRpdG9yQ2xhc3NOYW1lOiBzdHJpbmdbXSwgc3RhcnRpbmdMaW5lRGVjb3JhdGlvbnNXaWR0aDogbnVtYmVyKSB7XG5cdFx0bGV0IGxpbmVEZWNvcmF0aW9uc1dpZHRoID0gc3RhcnRpbmdMaW5lRGVjb3JhdGlvbnNXaWR0aDtcblx0XHRjb25zdCBpbmxpbmVDb21tZW50UG9zID0gZXh0cmFFZGl0b3JDbGFzc05hbWUuZmluZEluZGV4KG5hbWUgPT4gbmFtZSA9PT0gJ2lubGluZS1jb21tZW50Jyk7XG5cdFx0aWYgKGlubGluZUNvbW1lbnRQb3MgPj0gMCkge1xuXHRcdFx0ZXh0cmFFZGl0b3JDbGFzc05hbWUuc3BsaWNlKGlubGluZUNvbW1lbnRQb3MsIDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSBlZGl0b3IuZ2V0T3B0aW9ucygpO1xuXHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9sZGluZykgJiYgb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMpICE9PSAnbmV2ZXInKSB7XG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aCArPSAxMTsgLy8gMTEgY29tZXMgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzk0ZWU1ZjU4NjE5ZDU5MTcwOTgzZjQ1M2ZlNzhmMTU2YzBjYzczYTMvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvbWVkaWEvcmV2aWV3LmNzcyNMNDg1XG5cdFx0fVxuXHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoIC09IDI0O1xuXHRcdHJldHVybiB7IGV4dHJhRWRpdG9yQ2xhc3NOYW1lLCBsaW5lRGVjb3JhdGlvbnNXaWR0aCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXaXRoQ29tbWVudHNMaW5lRGVjb3JhdGlvbldpZHRoKGVkaXRvcjogSUNvZGVFZGl0b3IsIHN0YXJ0aW5nTGluZURlY29yYXRpb25zV2lkdGg6IG51bWJlcikge1xuXHRcdGxldCBsaW5lRGVjb3JhdGlvbnNXaWR0aCA9IHN0YXJ0aW5nTGluZURlY29yYXRpb25zV2lkdGg7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGVkaXRvci5nZXRPcHRpb25zKCk7XG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nKSAmJiBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scykgIT09ICduZXZlcicpIHtcblx0XHRcdGxpbmVEZWNvcmF0aW9uc1dpZHRoIC09IDExO1xuXHRcdH1cblx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aCArPSAyNDtcblx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VBbW91bnRSZXNlcnZlZCA9IGxpbmVEZWNvcmF0aW9uc1dpZHRoO1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50aW5nUmFuZ2VBbW91bnRSZXNlcnZlZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0V2l0aENvbW1lbnRzRWRpdG9yT3B0aW9ucyhlZGl0b3I6IElDb2RlRWRpdG9yLCBleHRyYUVkaXRvckNsYXNzTmFtZTogc3RyaW5nW10sIHN0YXJ0aW5nTGluZURlY29yYXRpb25zV2lkdGg6IG51bWJlcikge1xuXHRcdGV4dHJhRWRpdG9yQ2xhc3NOYW1lLnB1c2goJ2lubGluZS1jb21tZW50Jyk7XG5cdFx0cmV0dXJuIHsgbGluZURlY29yYXRpb25zV2lkdGg6IHRoaXMuZ2V0V2l0aENvbW1lbnRzTGluZURlY29yYXRpb25XaWR0aChlZGl0b3IsIHN0YXJ0aW5nTGluZURlY29yYXRpb25zV2lkdGgpLCBleHRyYUVkaXRvckNsYXNzTmFtZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JMYXlvdXRPcHRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IsIGV4dHJhRWRpdG9yQ2xhc3NOYW1lOiBzdHJpbmdbXSwgbGluZURlY29yYXRpb25zV2lkdGg6IG51bWJlcikge1xuXHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdGV4dHJhRWRpdG9yQ2xhc3NOYW1lOiBleHRyYUVkaXRvckNsYXNzTmFtZS5qb2luKCcgJyksXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogbGluZURlY29yYXRpb25zV2lkdGhcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlQ29tbWVudGluZ1JhbmdlUmVzZXJ2ZWRBbW91bnQoZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5nZXRFeGlzdGluZ0NvbW1lbnRFZGl0b3JPcHRpb25zKGVkaXRvcik7XG5cdFx0aWYgKGV4aXN0aW5nLmxpbmVEZWNvcmF0aW9uc1dpZHRoICE9PSB0aGlzLl9jb21tZW50aW5nUmFuZ2VBbW91bnRSZXNlcnZlZCkge1xuXHRcdFx0ZWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogdGhpcy5nZXRXaXRoQ29tbWVudHNMaW5lRGVjb3JhdGlvbldpZHRoKGVkaXRvciwgZXhpc3RpbmcubGluZURlY29yYXRpb25zV2lkdGgpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRyeVVwZGF0ZVJlc2VydmVkU3BhY2UodXJpPzogVVJJKSB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0NvbW1lbnRzT3JSYW5nZXNJbkluZm8gPSB0aGlzLl9jb21tZW50SW5mb3Muc29tZShpbmZvID0+IHtcblx0XHRcdGNvbnN0IGhhc1JhbmdlcyA9IEJvb2xlYW4oaW5mby5jb21tZW50aW5nUmFuZ2VzICYmIChBcnJheS5pc0FycmF5KGluZm8uY29tbWVudGluZ1JhbmdlcykgPyBpbmZvLmNvbW1lbnRpbmdSYW5nZXMgOiBpbmZvLmNvbW1lbnRpbmdSYW5nZXMucmFuZ2VzKS5sZW5ndGgpO1xuXHRcdFx0cmV0dXJuIGhhc1JhbmdlcyB8fCAoaW5mby50aHJlYWRzLmxlbmd0aCA+IDApO1xuXHRcdH0pO1xuXHRcdHVyaSA9IHVyaSA/PyB0aGlzLmVkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdFx0Y29uc3QgcmVzb3VyY2VIYXNDb21tZW50aW5nUmFuZ2VzID0gdXJpID8gdGhpcy5jb21tZW50U2VydmljZS5yZXNvdXJjZUhhc0NvbW1lbnRpbmdSYW5nZXModXJpKSA6IGZhbHNlO1xuXG5cdFx0Y29uc3QgaGFzQ29tbWVudHNPclJhbmdlcyA9IGhhc0NvbW1lbnRzT3JSYW5nZXNJbkluZm8gfHwgcmVzb3VyY2VIYXNDb21tZW50aW5nUmFuZ2VzO1xuXG5cdFx0aWYgKGhhc0NvbW1lbnRzT3JSYW5nZXMgJiYgdGhpcy5jb21tZW50U2VydmljZS5pc0NvbW1lbnRpbmdFbmFibGVkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2NvbW1lbnRpbmdSYW5nZVNwYWNlUmVzZXJ2ZWQpIHtcblx0XHRcdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlU3BhY2VSZXNlcnZlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHsgbGluZURlY29yYXRpb25zV2lkdGgsIGV4dHJhRWRpdG9yQ2xhc3NOYW1lIH0gPSB0aGlzLmdldEV4aXN0aW5nQ29tbWVudEVkaXRvck9wdGlvbnModGhpcy5lZGl0b3IpO1xuXHRcdFx0XHRjb25zdCBuZXdPcHRpb25zID0gdGhpcy5nZXRXaXRoQ29tbWVudHNFZGl0b3JPcHRpb25zKHRoaXMuZWRpdG9yLCBleHRyYUVkaXRvckNsYXNzTmFtZSwgbGluZURlY29yYXRpb25zV2lkdGgpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckxheW91dE9wdGlvbnModGhpcy5lZGl0b3IsIG5ld09wdGlvbnMuZXh0cmFFZGl0b3JDbGFzc05hbWUsIG5ld09wdGlvbnMubGluZURlY29yYXRpb25zV2lkdGgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lbnN1cmVDb21tZW50aW5nUmFuZ2VSZXNlcnZlZEFtb3VudCh0aGlzLmVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICgoIWhhc0NvbW1lbnRzT3JSYW5nZXMgfHwgIXRoaXMuY29tbWVudFNlcnZpY2UuaXNDb21tZW50aW5nRW5hYmxlZCkgJiYgdGhpcy5fY29tbWVudGluZ1JhbmdlU3BhY2VSZXNlcnZlZCkge1xuXHRcdFx0dGhpcy5fY29tbWVudGluZ1JhbmdlU3BhY2VSZXNlcnZlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgeyBsaW5lRGVjb3JhdGlvbnNXaWR0aCwgZXh0cmFFZGl0b3JDbGFzc05hbWUgfSA9IHRoaXMuZ2V0RXhpc3RpbmdDb21tZW50RWRpdG9yT3B0aW9ucyh0aGlzLmVkaXRvcik7XG5cdFx0XHRjb25zdCBuZXdPcHRpb25zID0gdGhpcy5nZXRXaXRob3V0Q29tbWVudHNFZGl0b3JPcHRpb25zKHRoaXMuZWRpdG9yLCBleHRyYUVkaXRvckNsYXNzTmFtZSwgbGluZURlY29yYXRpb25zV2lkdGgpO1xuXHRcdFx0dGhpcy51cGRhdGVFZGl0b3JMYXlvdXRPcHRpb25zKHRoaXMuZWRpdG9yLCBuZXdPcHRpb25zLmV4dHJhRWRpdG9yQ2xhc3NOYW1lLCBuZXdPcHRpb25zLmxpbmVEZWNvcmF0aW9uc1dpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNldENvbW1lbnRzKGNvbW1lbnRJbmZvczogSUNvbW1lbnRJbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yIHx8ICF0aGlzLmNvbW1lbnRTZXJ2aWNlLmlzQ29tbWVudGluZ0VuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jb21tZW50SW5mb3MgPSBjb21tZW50SW5mb3M7XG5cdFx0dGhpcy50cnlVcGRhdGVSZXNlcnZlZFNwYWNlKCk7XG5cdFx0Ly8gY3JlYXRlIHZpZXd6b25lc1xuXHRcdHRoaXMucmVtb3ZlQ29tbWVudFdpZGdldHNBbmRTdG9yZUNhY2hlKCk7XG5cblx0XHRsZXQgaGFzQ29tbWVudGluZ1JhbmdlcyA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgaW5mbyBvZiB0aGlzLl9jb21tZW50SW5mb3MpIHtcblx0XHRcdGlmICghaGFzQ29tbWVudGluZ1JhbmdlcyAmJiAoaW5mby5jb21tZW50aW5nUmFuZ2VzLnJhbmdlcy5sZW5ndGggPiAwIHx8IGluZm8uY29tbWVudGluZ1Jhbmdlcy5maWxlQ29tbWVudHMpKSB7XG5cdFx0XHRcdGhhc0NvbW1lbnRpbmdSYW5nZXMgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm92aWRlckNhY2hlU3RvcmUgPSB0aGlzLl9wZW5kaW5nTmV3Q29tbWVudENhY2hlW2luZm8udW5pcXVlT3duZXJdO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJFZGl0c0NhY2hlU3RvcmUgPSB0aGlzLl9wZW5kaW5nRWRpdHNDYWNoZVtpbmZvLnVuaXF1ZU93bmVyXTtcblx0XHRcdGluZm8udGhyZWFkcyA9IGluZm8udGhyZWFkcy5maWx0ZXIodGhyZWFkID0+ICF0aHJlYWQuaXNEaXNwb3NlZCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBpbmZvLnRocmVhZHMpIHtcblx0XHRcdFx0bGV0IHBlbmRpbmdDb21tZW50OiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChwcm92aWRlckNhY2hlU3RvcmUpIHtcblx0XHRcdFx0XHRwZW5kaW5nQ29tbWVudCA9IHByb3ZpZGVyQ2FjaGVTdG9yZVt0aHJlYWQudGhyZWFkSWRdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IHBlbmRpbmdFZGl0czogeyBba2V5OiBudW1iZXJdOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHByb3ZpZGVyRWRpdHNDYWNoZVN0b3JlKSB7XG5cdFx0XHRcdFx0cGVuZGluZ0VkaXRzID0gcHJvdmlkZXJFZGl0c0NhY2hlU3RvcmVbdGhyZWFkLnRocmVhZElkXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRoaXMuZGlzcGxheUNvbW1lbnRUaHJlYWQoaW5mby51bmlxdWVPd25lciwgdGhyZWFkLCBmYWxzZSwgcGVuZGluZ0NvbW1lbnQsIHBlbmRpbmdFZGl0cyk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRocmVhZCBvZiBpbmZvLnBlbmRpbmdDb21tZW50VGhyZWFkcyA/PyBbXSkge1xuXHRcdFx0XHR0aGlzLnJlc3VtZVBlbmRpbmdDb21tZW50KHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLnVyaSwgdGhyZWFkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9jb21tZW50aW5nUmFuZ2VEZWNvcmF0b3IudXBkYXRlKHRoaXMuZWRpdG9yLCB0aGlzLl9jb21tZW50SW5mb3MpO1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWRSYW5nZURlY29yYXRvci51cGRhdGUodGhpcy5lZGl0b3IsIHRoaXMuX2NvbW1lbnRJbmZvcyk7XG5cblx0XHRpZiAoaGFzQ29tbWVudGluZ1Jhbmdlcykge1xuXHRcdFx0dGhpcy5fYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlLnNldCh0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYWN0aXZlRWRpdG9ySGFzQ29tbWVudGluZ1JhbmdlLnNldChmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbGxhcHNlQW5kRm9jdXNSYW5nZSh0aHJlYWRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWVudFdpZGdldHM/LmZpbmQod2lkZ2V0ID0+IHdpZGdldC5jb21tZW50VGhyZWFkLnRocmVhZElkID09PSB0aHJlYWRJZCk/LmNvbGxhcHNlQW5kRm9jdXNSYW5nZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVDb21tZW50V2lkZ2V0c0FuZFN0b3JlQ2FjaGUoKSB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRXaWRnZXRzKSB7XG5cdFx0XHR0aGlzLl9jb21tZW50V2lkZ2V0cy5mb3JFYWNoKHpvbmUgPT4ge1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nQ29tbWVudHMgPSB6b25lLmdldFBlbmRpbmdDb21tZW50cygpO1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nTmV3Q29tbWVudCA9IHBlbmRpbmdDb21tZW50cy5uZXdDb21tZW50O1xuXHRcdFx0XHRjb25zdCBwcm92aWRlck5ld0NvbW1lbnRDYWNoZVN0b3JlID0gdGhpcy5fcGVuZGluZ05ld0NvbW1lbnRDYWNoZVt6b25lLnVuaXF1ZU93bmVyXTtcblxuXHRcdFx0XHRsZXQgbGFzdENvbW1lbnRCb2R5O1xuXHRcdFx0XHRpZiAoem9uZS5jb21tZW50VGhyZWFkLmNvbW1lbnRzICYmIHpvbmUuY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBsYXN0Q29tbWVudCA9IHpvbmUuY29tbWVudFRocmVhZC5jb21tZW50c1t6b25lLmNvbW1lbnRUaHJlYWQuY29tbWVudHMubGVuZ3RoIC0gMV07XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBsYXN0Q29tbWVudC5ib2R5ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0bGFzdENvbW1lbnRCb2R5ID0gbGFzdENvbW1lbnQuYm9keTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGFzdENvbW1lbnRCb2R5ID0gbGFzdENvbW1lbnQuYm9keS52YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBlbmRpbmdOZXdDb21tZW50ICYmIChwZW5kaW5nTmV3Q29tbWVudC5ib2R5ICE9PSBsYXN0Q29tbWVudEJvZHkpKSB7XG5cdFx0XHRcdFx0aWYgKCFwcm92aWRlck5ld0NvbW1lbnRDYWNoZVN0b3JlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nTmV3Q29tbWVudENhY2hlW3pvbmUudW5pcXVlT3duZXJdID0ge307XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ05ld0NvbW1lbnRDYWNoZVt6b25lLnVuaXF1ZU93bmVyXVt6b25lLmNvbW1lbnRUaHJlYWQudGhyZWFkSWRdID0gcGVuZGluZ05ld0NvbW1lbnQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHByb3ZpZGVyTmV3Q29tbWVudENhY2hlU3RvcmUpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSBwcm92aWRlck5ld0NvbW1lbnRDYWNoZVN0b3JlW3pvbmUuY29tbWVudFRocmVhZC50aHJlYWRJZF07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcGVuZGluZ0VkaXRzID0gcGVuZGluZ0NvbW1lbnRzLmVkaXRzO1xuXHRcdFx0XHRjb25zdCBwcm92aWRlckVkaXRzQ2FjaGVTdG9yZSA9IHRoaXMuX3BlbmRpbmdFZGl0c0NhY2hlW3pvbmUudW5pcXVlT3duZXJdO1xuXHRcdFx0XHRpZiAoT2JqZWN0LmtleXMocGVuZGluZ0VkaXRzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0aWYgKCFwcm92aWRlckVkaXRzQ2FjaGVTdG9yZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGVbem9uZS51bmlxdWVPd25lcl0gPSB7fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0VkaXRzQ2FjaGVbem9uZS51bmlxdWVPd25lcl1bem9uZS5jb21tZW50VGhyZWFkLnRocmVhZElkXSA9IHBlbmRpbmdFZGl0cztcblx0XHRcdFx0fSBlbHNlIGlmIChwcm92aWRlckVkaXRzQ2FjaGVTdG9yZSkge1xuXHRcdFx0XHRcdGRlbGV0ZSBwcm92aWRlckVkaXRzQ2FjaGVTdG9yZVt6b25lLmNvbW1lbnRUaHJlYWQudGhyZWFkSWRdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0em9uZS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb21tZW50V2lkZ2V0cyA9IFtdO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBNEIseUJBQXlCLGVBQWU7QUFDcEUsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLGlCQUFpQixlQUE0QjtBQUNsRSxPQUFPO0FBQ1AsU0FBeUMsY0FBYyxvQkFBb0I7QUFDM0UsU0FBUywwQkFBMEI7QUFDbkMsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGtCQUFpRjtBQUUxRixTQUFTLHdCQUF3QixpQkFBaUI7QUFDbEQsWUFBWSxlQUFlO0FBQzNCLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwRDtBQUNuRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUF1Qix1QkFBdUI7QUFDOUMsU0FBUyxvQkFBb0IsaUNBQWlDLDZCQUE2Qix3QkFBd0I7QUFDbkgsU0FBUyxjQUFjLGdCQUFnQixrQkFBa0I7QUFDekQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBZ0Q7QUFDekQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxlQUFlO0FBQ3hCLFNBQXNCLDBCQUEwQjtBQUVoRCxTQUFTLG1DQUFtQztBQUc1QyxTQUFTLGNBQWM7QUFDdkIsU0FBUywwQkFBMEI7QUFDbkMsU0FB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
