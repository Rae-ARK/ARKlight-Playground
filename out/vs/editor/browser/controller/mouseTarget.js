import { MouseTargetType } from "../editorBrowser.js";
import { PageCoordinates } from "../editorDom.js";
import { PartFingerprint, PartFingerprints } from "../view/viewPart.js";
import { ViewLine } from "../viewParts/viewLines/viewLine.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { Position } from "../../common/core/position.js";
import { Range as EditorRange } from "../../common/core/range.js";
import { CursorColumns } from "../../common/core/cursorColumns.js";
import * as dom from "../../../base/browser/dom.js";
import { AtomicTabMoveOperations, Direction } from "../../common/cursor/cursorAtomicMoveOperations.js";
import { PositionAffinity, TextDirection } from "../../common/model.js";
import { Lazy } from "../../../base/common/lazy.js";
var HitTestResultType = /* @__PURE__ */ ((HitTestResultType2) => {
  HitTestResultType2[HitTestResultType2["Unknown"] = 0] = "Unknown";
  HitTestResultType2[HitTestResultType2["Content"] = 1] = "Content";
  return HitTestResultType2;
})(HitTestResultType || {});
class UnknownHitTestResult {
  constructor(hitTarget = null) {
    this.hitTarget = hitTarget;
    this.type = 0 /* Unknown */;
  }
}
class ContentHitTestResult {
  constructor(position, spanNode, injectedText) {
    this.position = position;
    this.spanNode = spanNode;
    this.injectedText = injectedText;
    this.type = 1 /* Content */;
  }
  get hitTarget() {
    return this.spanNode;
  }
}
var HitTestResult;
((HitTestResult2) => {
  function createFromDOMInfo(ctx, spanNode, offset) {
    const position = ctx.getPositionFromDOMInfo(spanNode, offset);
    if (position) {
      return new ContentHitTestResult(position, spanNode, null);
    }
    return new UnknownHitTestResult(spanNode);
  }
  HitTestResult2.createFromDOMInfo = createFromDOMInfo;
})(HitTestResult || (HitTestResult = {}));
class PointerHandlerLastRenderData {
  constructor(lastViewCursorsRenderData, lastTextareaPosition) {
    this.lastViewCursorsRenderData = lastViewCursorsRenderData;
    this.lastTextareaPosition = lastTextareaPosition;
  }
}
class MouseTarget {
  static _deduceRage(position, range = null) {
    if (!range && position) {
      return new EditorRange(position.lineNumber, position.column, position.lineNumber, position.column);
    }
    return range ?? null;
  }
  static createUnknown(element, mouseColumn, position) {
    return { type: MouseTargetType.UNKNOWN, element, mouseColumn, position, range: this._deduceRage(position) };
  }
  static createTextarea(element, mouseColumn) {
    return { type: MouseTargetType.TEXTAREA, element, mouseColumn, position: null, range: null };
  }
  static createMargin(type, element, mouseColumn, position, range, detail) {
    return { type, element, mouseColumn, position, range, detail };
  }
  static createViewZone(type, element, mouseColumn, position, detail) {
    return { type, element, mouseColumn, position, range: this._deduceRage(position), detail };
  }
  static createContentText(element, mouseColumn, position, range, detail) {
    return { type: MouseTargetType.CONTENT_TEXT, element, mouseColumn, position, range: this._deduceRage(position, range), detail };
  }
  static createContentEmpty(element, mouseColumn, position, detail) {
    return { type: MouseTargetType.CONTENT_EMPTY, element, mouseColumn, position, range: this._deduceRage(position), detail };
  }
  static createContentWidget(element, mouseColumn, detail) {
    return { type: MouseTargetType.CONTENT_WIDGET, element, mouseColumn, position: null, range: null, detail };
  }
  static createScrollbar(element, mouseColumn, position) {
    return { type: MouseTargetType.SCROLLBAR, element, mouseColumn, position, range: this._deduceRage(position) };
  }
  static createOverlayWidget(element, mouseColumn, detail) {
    return { type: MouseTargetType.OVERLAY_WIDGET, element, mouseColumn, position: null, range: null, detail };
  }
  static createOutsideEditor(mouseColumn, position, outsidePosition, outsideDistance) {
    return { type: MouseTargetType.OUTSIDE_EDITOR, element: null, mouseColumn, position, range: this._deduceRage(position), outsidePosition, outsideDistance };
  }
  static _typeToString(type) {
    if (type === MouseTargetType.TEXTAREA) {
      return "TEXTAREA";
    }
    if (type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
      return "GUTTER_GLYPH_MARGIN";
    }
    if (type === MouseTargetType.GUTTER_LINE_NUMBERS) {
      return "GUTTER_LINE_NUMBERS";
    }
    if (type === MouseTargetType.GUTTER_LINE_DECORATIONS) {
      return "GUTTER_LINE_DECORATIONS";
    }
    if (type === MouseTargetType.GUTTER_VIEW_ZONE) {
      return "GUTTER_VIEW_ZONE";
    }
    if (type === MouseTargetType.CONTENT_TEXT) {
      return "CONTENT_TEXT";
    }
    if (type === MouseTargetType.CONTENT_EMPTY) {
      return "CONTENT_EMPTY";
    }
    if (type === MouseTargetType.CONTENT_VIEW_ZONE) {
      return "CONTENT_VIEW_ZONE";
    }
    if (type === MouseTargetType.CONTENT_WIDGET) {
      return "CONTENT_WIDGET";
    }
    if (type === MouseTargetType.OVERVIEW_RULER) {
      return "OVERVIEW_RULER";
    }
    if (type === MouseTargetType.SCROLLBAR) {
      return "SCROLLBAR";
    }
    if (type === MouseTargetType.OVERLAY_WIDGET) {
      return "OVERLAY_WIDGET";
    }
    return "UNKNOWN";
  }
  static toString(target) {
    return this._typeToString(target.type) + ": " + target.position + " - " + target.range + " - " + JSON.stringify(target.detail);
  }
}
class ElementPath {
  static isTextArea(path) {
    return path.length === 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.TextArea;
  }
  static isChildOfViewLines(path) {
    return path.length >= 4 && path[0] === PartFingerprint.OverflowGuard && path[3] === PartFingerprint.ViewLines;
  }
  static isStrictChildOfViewLines(path) {
    return path.length > 4 && path[0] === PartFingerprint.OverflowGuard && path[3] === PartFingerprint.ViewLines;
  }
  static isChildOfScrollableElement(path) {
    return path.length >= 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.ScrollableElement;
  }
  static isChildOfMinimap(path) {
    return path.length >= 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.Minimap;
  }
  static isChildOfContentWidgets(path) {
    return path.length >= 4 && path[0] === PartFingerprint.OverflowGuard && path[3] === PartFingerprint.ContentWidgets;
  }
  static isChildOfOverflowGuard(path) {
    return path.length >= 1 && path[0] === PartFingerprint.OverflowGuard;
  }
  static isChildOfOverflowingContentWidgets(path) {
    return path.length >= 1 && path[0] === PartFingerprint.OverflowingContentWidgets;
  }
  static isChildOfOverlayWidgets(path) {
    return path.length >= 2 && path[0] === PartFingerprint.OverflowGuard && path[1] === PartFingerprint.OverlayWidgets;
  }
  static isChildOfOverflowingOverlayWidgets(path) {
    return path.length >= 1 && path[0] === PartFingerprint.OverflowingOverlayWidgets;
  }
}
class HitTestContext {
  constructor(context, viewHelper, lastRenderData) {
    this.viewModel = context.viewModel;
    const options = context.configuration.options;
    this.layoutInfo = options.get(EditorOption.layoutInfo);
    this.viewDomNode = viewHelper.viewDomNode;
    this.viewLinesGpu = viewHelper.viewLinesGpu;
    this.lineHeight = options.get(EditorOption.lineHeight);
    this.stickyTabStops = options.get(EditorOption.stickyTabStops);
    this.typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    this.lastRenderData = lastRenderData;
    this._context = context;
    this._viewHelper = viewHelper;
  }
  getZoneAtCoord(mouseVerticalOffset) {
    return HitTestContext.getZoneAtCoord(this._context, mouseVerticalOffset);
  }
  static getZoneAtCoord(context, mouseVerticalOffset) {
    const viewZoneWhitespace = context.viewLayout.getWhitespaceAtVerticalOffset(mouseVerticalOffset);
    if (viewZoneWhitespace) {
      const viewZoneMiddle = viewZoneWhitespace.verticalOffset + viewZoneWhitespace.height / 2;
      const lineCount = context.viewModel.getLineCount();
      let positionBefore = null;
      let position;
      let positionAfter = null;
      if (viewZoneWhitespace.afterLineNumber !== lineCount) {
        positionAfter = new Position(viewZoneWhitespace.afterLineNumber + 1, 1);
      }
      if (viewZoneWhitespace.afterLineNumber > 0) {
        positionBefore = new Position(viewZoneWhitespace.afterLineNumber, context.viewModel.getLineMaxColumn(viewZoneWhitespace.afterLineNumber));
      }
      if (positionAfter === null) {
        position = positionBefore;
      } else if (positionBefore === null) {
        position = positionAfter;
      } else if (mouseVerticalOffset < viewZoneMiddle) {
        position = positionBefore;
      } else {
        position = positionAfter;
      }
      return {
        viewZoneId: viewZoneWhitespace.id,
        afterLineNumber: viewZoneWhitespace.afterLineNumber,
        positionBefore,
        positionAfter,
        position
      };
    }
    return null;
  }
  getFullLineRangeAtCoord(mouseVerticalOffset) {
    if (this._context.viewLayout.isAfterLines(mouseVerticalOffset)) {
      const lineNumber2 = this._context.viewModel.getLineCount();
      const maxLineColumn2 = this._context.viewModel.getLineMaxColumn(lineNumber2);
      return {
        range: new EditorRange(lineNumber2, maxLineColumn2, lineNumber2, maxLineColumn2),
        isAfterLines: true
      };
    }
    const lineNumber = this._context.viewLayout.getLineNumberAtVerticalOffset(mouseVerticalOffset);
    const maxLineColumn = this._context.viewModel.getLineMaxColumn(lineNumber);
    return {
      range: new EditorRange(lineNumber, 1, lineNumber, maxLineColumn),
      isAfterLines: false
    };
  }
  getLineNumberAtVerticalOffset(mouseVerticalOffset) {
    return this._context.viewLayout.getLineNumberAtVerticalOffset(mouseVerticalOffset);
  }
  isAfterLines(mouseVerticalOffset) {
    return this._context.viewLayout.isAfterLines(mouseVerticalOffset);
  }
  isInTopPadding(mouseVerticalOffset) {
    return this._context.viewLayout.isInTopPadding(mouseVerticalOffset);
  }
  isInBottomPadding(mouseVerticalOffset) {
    return this._context.viewLayout.isInBottomPadding(mouseVerticalOffset);
  }
  getVerticalOffsetForLineNumber(lineNumber) {
    return this._context.viewLayout.getVerticalOffsetForLineNumber(lineNumber);
  }
  findAttribute(element, attr) {
    return HitTestContext._findAttribute(element, attr, this._viewHelper.viewDomNode);
  }
  static _findAttribute(element, attr, stopAt) {
    while (element && element !== element.ownerDocument.body) {
      if (element.hasAttribute && element.hasAttribute(attr)) {
        return element.getAttribute(attr);
      }
      if (element === stopAt) {
        return null;
      }
      element = element.parentNode;
    }
    return null;
  }
  getLineWidth(lineNumber) {
    return this._viewHelper.getLineWidth(lineNumber);
  }
  isRtl(lineNumber) {
    return this.viewModel.getTextDirection(lineNumber) === TextDirection.RTL;
  }
  visibleRangeForPosition(lineNumber, column) {
    return this._viewHelper.visibleRangeForPosition(lineNumber, column);
  }
  getPositionFromDOMInfo(spanNode, offset) {
    return this._viewHelper.getPositionFromDOMInfo(spanNode, offset);
  }
  getCurrentScrollTop() {
    return this._context.viewLayout.getCurrentScrollTop();
  }
  getCurrentScrollLeft() {
    return this._context.viewLayout.getCurrentScrollLeft();
  }
}
class BareHitTestRequest {
  constructor(ctx, editorPos, pos, relativePos) {
    this.editorPos = editorPos;
    this.pos = pos;
    this.relativePos = relativePos;
    this.mouseVerticalOffset = Math.max(0, ctx.getCurrentScrollTop() + this.relativePos.y);
    this.mouseContentHorizontalOffset = ctx.getCurrentScrollLeft() + this.relativePos.x - ctx.layoutInfo.contentLeft;
    this.isInMarginArea = this.relativePos.x < ctx.layoutInfo.contentLeft && this.relativePos.x >= ctx.layoutInfo.glyphMarginLeft;
    this.isInContentArea = !this.isInMarginArea;
    this.mouseColumn = Math.max(0, MouseTargetFactory._getMouseColumn(this.mouseContentHorizontalOffset, ctx.typicalHalfwidthCharacterWidth));
  }
}
class HitTestRequest extends BareHitTestRequest {
  constructor(ctx, editorPos, pos, relativePos, eventTarget) {
    super(ctx, editorPos, pos, relativePos);
    this.hitTestResult = new Lazy(() => MouseTargetFactory.doHitTest(this._ctx, this));
    this._targetPathCacheElement = null;
    this._targetPathCacheValue = new Uint8Array(0);
    this._ctx = ctx;
    this._eventTarget = eventTarget;
    const hasEventTarget = Boolean(this._eventTarget);
    this._useHitTestTarget = !hasEventTarget;
  }
  get target() {
    if (this._useHitTestTarget) {
      return this.hitTestResult.value.hitTarget;
    }
    return this._eventTarget;
  }
  get targetPath() {
    if (this._targetPathCacheElement !== this.target) {
      this._targetPathCacheElement = this.target;
      this._targetPathCacheValue = PartFingerprints.collect(this.target, this._ctx.viewDomNode);
    }
    return this._targetPathCacheValue;
  }
  toString() {
    return `pos(${this.pos.x},${this.pos.y}), editorPos(${this.editorPos.x},${this.editorPos.y}), relativePos(${this.relativePos.x},${this.relativePos.y}), mouseVerticalOffset: ${this.mouseVerticalOffset}, mouseContentHorizontalOffset: ${this.mouseContentHorizontalOffset}
	target: ${this.target ? this.target.outerHTML : null}`;
  }
  get wouldBenefitFromHitTestTargetSwitch() {
    return !this._useHitTestTarget && this.hitTestResult.value.hitTarget !== null && this.target !== this.hitTestResult.value.hitTarget;
  }
  switchToHitTestTarget() {
    this._useHitTestTarget = true;
  }
  _getMouseColumn(position = null) {
    if (position && position.column < this._ctx.viewModel.getLineMaxColumn(position.lineNumber)) {
      return CursorColumns.visibleColumnFromColumn(this._ctx.viewModel.getLineContent(position.lineNumber), position.column, this._ctx.viewModel.model.getOptions().tabSize) + 1;
    }
    return this.mouseColumn;
  }
  fulfillUnknown(position = null) {
    return MouseTarget.createUnknown(this.target, this._getMouseColumn(position), position);
  }
  fulfillTextarea() {
    return MouseTarget.createTextarea(this.target, this._getMouseColumn());
  }
  fulfillMargin(type, position, range, detail) {
    return MouseTarget.createMargin(type, this.target, this._getMouseColumn(position), position, range, detail);
  }
  fulfillViewZone(type, position, detail) {
    return MouseTarget.createViewZone(type, this.target, this._getMouseColumn(), position, detail);
  }
  fulfillContentText(position, range, detail) {
    return MouseTarget.createContentText(this.target, this._getMouseColumn(position), position, range, detail);
  }
  fulfillContentEmpty(position, detail) {
    return MouseTarget.createContentEmpty(this.target, this._getMouseColumn(position), position, detail);
  }
  fulfillContentWidget(detail) {
    return MouseTarget.createContentWidget(this.target, this._getMouseColumn(), detail);
  }
  fulfillScrollbar(position) {
    return MouseTarget.createScrollbar(this.target, this._getMouseColumn(position), position);
  }
  fulfillOverlayWidget(detail) {
    return MouseTarget.createOverlayWidget(this.target, this._getMouseColumn(), detail);
  }
}
const EMPTY_CONTENT_AFTER_LINES = { isAfterLines: true };
function createEmptyContentDataInLines(horizontalDistanceToText) {
  return {
    isAfterLines: false,
    horizontalDistanceToText
  };
}
class MouseTargetFactory {
  constructor(context, viewHelper) {
    this._context = context;
    this._viewHelper = viewHelper;
  }
  mouseTargetIsWidget(e) {
    const t = e.target;
    const path = PartFingerprints.collect(t, this._viewHelper.viewDomNode);
    if (ElementPath.isChildOfContentWidgets(path) || ElementPath.isChildOfOverflowingContentWidgets(path)) {
      return true;
    }
    if (ElementPath.isChildOfOverlayWidgets(path) || ElementPath.isChildOfOverflowingOverlayWidgets(path)) {
      return true;
    }
    return false;
  }
  createMouseTarget(lastRenderData, editorPos, pos, relativePos, target) {
    const ctx = new HitTestContext(this._context, this._viewHelper, lastRenderData);
    const request = new HitTestRequest(ctx, editorPos, pos, relativePos, target);
    try {
      const r = MouseTargetFactory._createMouseTarget(ctx, request);
      if (r.type === MouseTargetType.CONTENT_TEXT) {
        if (ctx.stickyTabStops && r.position !== null) {
          const position = MouseTargetFactory._snapToSoftTabBoundary(r.position, ctx.viewModel);
          const range = EditorRange.fromPositions(position, position).plusRange(r.range);
          return request.fulfillContentText(position, range, r.detail);
        }
      }
      return r;
    } catch (err) {
      return request.fulfillUnknown();
    }
  }
  static _createMouseTarget(ctx, request) {
    if (request.target === null) {
      return request.fulfillUnknown();
    }
    const resolvedRequest = request;
    let result = null;
    if (!ElementPath.isChildOfOverflowGuard(request.targetPath) && !ElementPath.isChildOfOverflowingContentWidgets(request.targetPath) && !ElementPath.isChildOfOverflowingOverlayWidgets(request.targetPath)) {
      result = result || request.fulfillUnknown();
    }
    result = result || MouseTargetFactory._hitTestContentWidget(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestOverlayWidget(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestMinimap(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestScrollbarSlider(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestViewZone(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestMargin(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestViewCursor(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestTextArea(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestViewLines(ctx, resolvedRequest);
    result = result || MouseTargetFactory._hitTestScrollbar(ctx, resolvedRequest);
    return result || request.fulfillUnknown();
  }
  static _hitTestContentWidget(ctx, request) {
    if (ElementPath.isChildOfContentWidgets(request.targetPath) || ElementPath.isChildOfOverflowingContentWidgets(request.targetPath)) {
      const widgetId = ctx.findAttribute(request.target, "widgetId");
      if (widgetId) {
        return request.fulfillContentWidget(widgetId);
      } else {
        return request.fulfillUnknown();
      }
    }
    return null;
  }
  static _hitTestOverlayWidget(ctx, request) {
    if (ElementPath.isChildOfOverlayWidgets(request.targetPath) || ElementPath.isChildOfOverflowingOverlayWidgets(request.targetPath)) {
      const widgetId = ctx.findAttribute(request.target, "widgetId");
      if (widgetId) {
        return request.fulfillOverlayWidget(widgetId);
      } else {
        return request.fulfillUnknown();
      }
    }
    return null;
  }
  static _hitTestViewCursor(ctx, request) {
    if (request.target) {
      const lastViewCursorsRenderData = ctx.lastRenderData.lastViewCursorsRenderData;
      for (const d of lastViewCursorsRenderData) {
        if (request.target === d.domNode) {
          return request.fulfillContentText(d.position, null, { mightBeForeignElement: false, injectedText: null });
        }
      }
    }
    if (request.isInContentArea) {
      const lastViewCursorsRenderData = ctx.lastRenderData.lastViewCursorsRenderData;
      const mouseContentHorizontalOffset = request.mouseContentHorizontalOffset;
      const mouseVerticalOffset = request.mouseVerticalOffset;
      for (const d of lastViewCursorsRenderData) {
        if (mouseContentHorizontalOffset < d.contentLeft) {
          continue;
        }
        if (mouseContentHorizontalOffset > d.contentLeft + d.width) {
          continue;
        }
        const cursorVerticalOffset = ctx.getVerticalOffsetForLineNumber(d.position.lineNumber);
        if (cursorVerticalOffset <= mouseVerticalOffset && mouseVerticalOffset <= cursorVerticalOffset + d.height) {
          return request.fulfillContentText(d.position, null, { mightBeForeignElement: false, injectedText: null });
        }
      }
    }
    return null;
  }
  static _hitTestViewZone(ctx, request) {
    const viewZoneData = ctx.getZoneAtCoord(request.mouseVerticalOffset);
    if (viewZoneData) {
      const mouseTargetType = request.isInContentArea ? MouseTargetType.CONTENT_VIEW_ZONE : MouseTargetType.GUTTER_VIEW_ZONE;
      return request.fulfillViewZone(mouseTargetType, viewZoneData.position, viewZoneData);
    }
    return null;
  }
  static _hitTestTextArea(ctx, request) {
    if (ElementPath.isTextArea(request.targetPath)) {
      if (ctx.lastRenderData.lastTextareaPosition) {
        return request.fulfillContentText(ctx.lastRenderData.lastTextareaPosition, null, { mightBeForeignElement: false, injectedText: null });
      }
      return request.fulfillTextarea();
    }
    return null;
  }
  static _hitTestMargin(ctx, request) {
    if (request.isInMarginArea) {
      const res = ctx.getFullLineRangeAtCoord(request.mouseVerticalOffset);
      const pos = res.range.getStartPosition();
      let offset = Math.abs(request.relativePos.x);
      const detail = {
        isAfterLines: res.isAfterLines,
        glyphMarginLeft: ctx.layoutInfo.glyphMarginLeft,
        glyphMarginWidth: ctx.layoutInfo.glyphMarginWidth,
        lineNumbersWidth: ctx.layoutInfo.lineNumbersWidth,
        offsetX: offset
      };
      offset -= ctx.layoutInfo.glyphMarginLeft;
      if (offset <= ctx.layoutInfo.glyphMarginWidth) {
        const modelCoordinate = ctx.viewModel.coordinatesConverter.convertViewPositionToModelPosition(res.range.getStartPosition());
        const lanes = ctx.viewModel.glyphLanes.getLanesAtLine(modelCoordinate.lineNumber);
        detail.glyphMarginLane = lanes[Math.floor(offset / ctx.lineHeight)];
        return request.fulfillMargin(MouseTargetType.GUTTER_GLYPH_MARGIN, pos, res.range, detail);
      }
      offset -= ctx.layoutInfo.glyphMarginWidth;
      if (offset <= ctx.layoutInfo.lineNumbersWidth) {
        return request.fulfillMargin(MouseTargetType.GUTTER_LINE_NUMBERS, pos, res.range, detail);
      }
      offset -= ctx.layoutInfo.lineNumbersWidth;
      return request.fulfillMargin(MouseTargetType.GUTTER_LINE_DECORATIONS, pos, res.range, detail);
    }
    return null;
  }
  static _hitTestViewLines(ctx, request) {
    if (!ElementPath.isChildOfViewLines(request.targetPath)) {
      return null;
    }
    if (ctx.isInTopPadding(request.mouseVerticalOffset)) {
      return request.fulfillContentEmpty(new Position(1, 1), EMPTY_CONTENT_AFTER_LINES);
    }
    if (ctx.isAfterLines(request.mouseVerticalOffset) || ctx.isInBottomPadding(request.mouseVerticalOffset)) {
      const lineCount = ctx.viewModel.getLineCount();
      const maxLineColumn = ctx.viewModel.getLineMaxColumn(lineCount);
      return request.fulfillContentEmpty(new Position(lineCount, maxLineColumn), EMPTY_CONTENT_AFTER_LINES);
    }
    if (ElementPath.isStrictChildOfViewLines(request.targetPath)) {
      const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
      const lineLength = ctx.viewModel.getLineLength(lineNumber);
      const lineWidth = ctx.getLineWidth(lineNumber);
      if (lineLength === 0) {
        const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
        return request.fulfillContentEmpty(new Position(lineNumber, 1), detail);
      }
      const isRtl = ctx.isRtl(lineNumber);
      if (isRtl) {
        if (request.mouseContentHorizontalOffset + lineWidth <= ctx.layoutInfo.contentWidth - ctx.layoutInfo.verticalScrollbarWidth) {
          const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
          const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
          return request.fulfillContentEmpty(pos, detail);
        }
      } else if (request.mouseContentHorizontalOffset >= lineWidth) {
        const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
        const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
        return request.fulfillContentEmpty(pos, detail);
      }
    } else {
      if (ctx.viewLinesGpu) {
        const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
        if (ctx.viewModel.getLineLength(lineNumber) === 0) {
          const lineWidth2 = ctx.getLineWidth(lineNumber);
          const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth2);
          return request.fulfillContentEmpty(new Position(lineNumber, 1), detail);
        }
        const lineWidth = ctx.getLineWidth(lineNumber);
        const isRtl = ctx.isRtl(lineNumber);
        if (isRtl) {
          if (request.mouseContentHorizontalOffset + lineWidth <= ctx.layoutInfo.contentWidth - ctx.layoutInfo.verticalScrollbarWidth) {
            const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
            const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
            return request.fulfillContentEmpty(pos, detail);
          }
        } else if (request.mouseContentHorizontalOffset >= lineWidth) {
          const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
          const pos = new Position(lineNumber, ctx.viewModel.getLineMaxColumn(lineNumber));
          return request.fulfillContentEmpty(pos, detail);
        }
        const position = ctx.viewLinesGpu.getPositionAtCoordinate(lineNumber, request.mouseContentHorizontalOffset);
        if (position) {
          const detail = {
            injectedText: null,
            mightBeForeignElement: false
          };
          return request.fulfillContentText(position, EditorRange.fromPositions(position, position), detail);
        }
      }
    }
    const hitTestResult = request.hitTestResult.value;
    if (hitTestResult.type === 1 /* Content */) {
      return MouseTargetFactory.createMouseTargetFromHitTestPosition(ctx, request, hitTestResult.spanNode, hitTestResult.position, hitTestResult.injectedText);
    }
    if (request.wouldBenefitFromHitTestTargetSwitch) {
      request.switchToHitTestTarget();
      return this._createMouseTarget(ctx, request);
    }
    return request.fulfillUnknown();
  }
  static _hitTestMinimap(ctx, request) {
    if (ElementPath.isChildOfMinimap(request.targetPath)) {
      const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
      const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
      return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
    }
    return null;
  }
  static _hitTestScrollbarSlider(ctx, request) {
    if (ElementPath.isChildOfScrollableElement(request.targetPath)) {
      if (request.target && request.target.nodeType === 1) {
        const className = request.target.className;
        if (className && /\b(slider|scrollbar)\b/.test(className)) {
          const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
          const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
          return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
        }
      }
    }
    return null;
  }
  static _hitTestScrollbar(ctx, request) {
    if (ElementPath.isChildOfScrollableElement(request.targetPath)) {
      const possibleLineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
      const maxColumn = ctx.viewModel.getLineMaxColumn(possibleLineNumber);
      return request.fulfillScrollbar(new Position(possibleLineNumber, maxColumn));
    }
    return null;
  }
  getMouseColumn(relativePos) {
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const mouseContentHorizontalOffset = this._context.viewLayout.getCurrentScrollLeft() + relativePos.x - layoutInfo.contentLeft;
    return MouseTargetFactory._getMouseColumn(mouseContentHorizontalOffset, options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth);
  }
  static _getMouseColumn(mouseContentHorizontalOffset, typicalHalfwidthCharacterWidth) {
    if (mouseContentHorizontalOffset < 0) {
      return 1;
    }
    const chars = Math.round(mouseContentHorizontalOffset / typicalHalfwidthCharacterWidth);
    return chars + 1;
  }
  static createMouseTargetFromHitTestPosition(ctx, request, spanNode, pos, injectedText) {
    const lineNumber = pos.lineNumber;
    const column = pos.column;
    const lineWidth = ctx.getLineWidth(lineNumber);
    if (request.mouseContentHorizontalOffset > lineWidth) {
      const detail = createEmptyContentDataInLines(request.mouseContentHorizontalOffset - lineWidth);
      return request.fulfillContentEmpty(pos, detail);
    }
    const visibleRange = ctx.visibleRangeForPosition(lineNumber, column);
    if (!visibleRange) {
      return request.fulfillUnknown(pos);
    }
    const columnHorizontalOffset = visibleRange.left;
    if (Math.abs(request.mouseContentHorizontalOffset - columnHorizontalOffset) < 1) {
      return request.fulfillContentText(pos, null, { mightBeForeignElement: !!injectedText, injectedText });
    }
    const points = [];
    points.push({ offset: visibleRange.left, column });
    if (column > 1) {
      const visibleRange2 = ctx.visibleRangeForPosition(lineNumber, column - 1);
      if (visibleRange2) {
        points.push({ offset: visibleRange2.left, column: column - 1 });
      }
    }
    const lineMaxColumn = ctx.viewModel.getLineMaxColumn(lineNumber);
    if (column < lineMaxColumn) {
      const visibleRange2 = ctx.visibleRangeForPosition(lineNumber, column + 1);
      if (visibleRange2) {
        points.push({ offset: visibleRange2.left, column: column + 1 });
      }
    }
    points.sort((a, b) => a.offset - b.offset);
    const mouseCoordinates = request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode));
    const spanNodeClientRect = spanNode.getBoundingClientRect();
    const mouseIsOverSpanNode = spanNodeClientRect.left <= mouseCoordinates.clientX && mouseCoordinates.clientX <= spanNodeClientRect.right;
    let rng = null;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      if (prev.offset <= request.mouseContentHorizontalOffset && request.mouseContentHorizontalOffset <= curr.offset) {
        rng = new EditorRange(lineNumber, prev.column, lineNumber, curr.column);
        const prevDelta = Math.abs(prev.offset - request.mouseContentHorizontalOffset);
        const nextDelta = Math.abs(curr.offset - request.mouseContentHorizontalOffset);
        pos = prevDelta < nextDelta ? new Position(lineNumber, prev.column) : new Position(lineNumber, curr.column);
        break;
      }
    }
    return request.fulfillContentText(pos, rng, { mightBeForeignElement: !mouseIsOverSpanNode || !!injectedText, injectedText });
  }
  /**
   * Most probably WebKit browsers and Edge
   */
  static _doHitTestWithCaretRangeFromPoint(ctx, request) {
    const lineNumber = ctx.getLineNumberAtVerticalOffset(request.mouseVerticalOffset);
    const lineStartVerticalOffset = ctx.getVerticalOffsetForLineNumber(lineNumber);
    const lineEndVerticalOffset = lineStartVerticalOffset + ctx.lineHeight;
    const isBelowLastLine = lineNumber === ctx.viewModel.getLineCount() && request.mouseVerticalOffset > lineEndVerticalOffset;
    if (!isBelowLastLine) {
      const lineCenteredVerticalOffset = Math.floor((lineStartVerticalOffset + lineEndVerticalOffset) / 2);
      let adjustedPageY = request.pos.y + (lineCenteredVerticalOffset - request.mouseVerticalOffset);
      if (adjustedPageY <= request.editorPos.y) {
        adjustedPageY = request.editorPos.y + 1;
      }
      if (adjustedPageY >= request.editorPos.y + request.editorPos.height) {
        adjustedPageY = request.editorPos.y + request.editorPos.height - 1;
      }
      const adjustedPage = new PageCoordinates(request.pos.x, adjustedPageY);
      const r = this._actualDoHitTestWithCaretRangeFromPoint(ctx, adjustedPage.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
      if (r.type === 1 /* Content */) {
        return r;
      }
    }
    return this._actualDoHitTestWithCaretRangeFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
  }
  static _actualDoHitTestWithCaretRangeFromPoint(ctx, coords) {
    const shadowRoot = dom.getShadowRoot(ctx.viewDomNode);
    let range;
    if (shadowRoot) {
      if (typeof shadowRoot.caretRangeFromPoint === "undefined") {
        range = shadowCaretRangeFromPoint(shadowRoot, coords.clientX, coords.clientY);
      } else {
        range = shadowRoot.caretRangeFromPoint(coords.clientX, coords.clientY);
      }
    } else {
      range = ctx.viewDomNode.ownerDocument.caretRangeFromPoint(coords.clientX, coords.clientY);
    }
    if (!range || !range.startContainer) {
      return new UnknownHitTestResult();
    }
    const startContainer = range.startContainer;
    if (startContainer.nodeType === startContainer.TEXT_NODE) {
      const parent1 = startContainer.parentNode;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent3 = parent2 ? parent2.parentNode : null;
      const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? parent3.className : null;
      if (parent3ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, parent1, range.startOffset);
      } else {
        return new UnknownHitTestResult(startContainer.parentNode);
      }
    } else if (startContainer.nodeType === startContainer.ELEMENT_NODE) {
      const parent1 = startContainer.parentNode;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? parent2.className : null;
      if (parent2ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, startContainer, startContainer.textContent.length);
      } else {
        return new UnknownHitTestResult(startContainer);
      }
    }
    return new UnknownHitTestResult();
  }
  /**
   * Most probably Gecko
   */
  static _doHitTestWithCaretPositionFromPoint(ctx, coords) {
    const hitResult = ctx.viewDomNode.ownerDocument.caretPositionFromPoint(coords.clientX, coords.clientY);
    if (hitResult.offsetNode.nodeType === hitResult.offsetNode.TEXT_NODE) {
      const parent1 = hitResult.offsetNode.parentNode;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent3 = parent2 ? parent2.parentNode : null;
      const parent3ClassName = parent3 && parent3.nodeType === parent3.ELEMENT_NODE ? parent3.className : null;
      if (parent3ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, hitResult.offsetNode.parentNode, hitResult.offset);
      } else {
        return new UnknownHitTestResult(hitResult.offsetNode.parentNode);
      }
    }
    if (hitResult.offsetNode.nodeType === hitResult.offsetNode.ELEMENT_NODE) {
      const parent1 = hitResult.offsetNode.parentNode;
      const parent1ClassName = parent1 && parent1.nodeType === parent1.ELEMENT_NODE ? parent1.className : null;
      const parent2 = parent1 ? parent1.parentNode : null;
      const parent2ClassName = parent2 && parent2.nodeType === parent2.ELEMENT_NODE ? parent2.className : null;
      if (parent1ClassName === ViewLine.CLASS_NAME) {
        const tokenSpan = hitResult.offsetNode.childNodes[Math.min(hitResult.offset, hitResult.offsetNode.childNodes.length - 1)];
        if (tokenSpan) {
          return HitTestResult.createFromDOMInfo(ctx, tokenSpan, 0);
        }
      } else if (parent2ClassName === ViewLine.CLASS_NAME) {
        return HitTestResult.createFromDOMInfo(ctx, hitResult.offsetNode, 0);
      }
    }
    return new UnknownHitTestResult(hitResult.offsetNode);
  }
  static _snapToSoftTabBoundary(position, viewModel) {
    const lineContent = viewModel.getLineContent(position.lineNumber);
    const { tabSize } = viewModel.model.getOptions();
    const newPosition = AtomicTabMoveOperations.atomicPosition(lineContent, position.column - 1, tabSize, Direction.Nearest);
    if (newPosition !== -1) {
      return new Position(position.lineNumber, newPosition + 1);
    }
    return position;
  }
  static doHitTest(ctx, request) {
    let result = new UnknownHitTestResult();
    if (typeof ctx.viewDomNode.ownerDocument.caretRangeFromPoint === "function") {
      result = this._doHitTestWithCaretRangeFromPoint(ctx, request);
    } else if (ctx.viewDomNode.ownerDocument.caretPositionFromPoint) {
      result = this._doHitTestWithCaretPositionFromPoint(ctx, request.pos.toClientCoordinates(dom.getWindow(ctx.viewDomNode)));
    }
    if (result.type === 1 /* Content */) {
      const injectedText = ctx.viewModel.getInjectedTextAt(result.position);
      const normalizedPosition = ctx.viewModel.normalizePosition(result.position, PositionAffinity.None);
      if (injectedText || !normalizedPosition.equals(result.position)) {
        result = new ContentHitTestResult(normalizedPosition, result.spanNode, injectedText);
      }
    }
    return result;
  }
}
function shadowCaretRangeFromPoint(shadowRoot, x, y) {
  const range = document.createRange();
  let el = shadowRoot.elementFromPoint(x, y);
  if (el?.hasChildNodes()) {
    while (el && el.firstChild && el.firstChild.nodeType !== el.firstChild.TEXT_NODE && el.lastChild && el.lastChild.firstChild) {
      el = el.lastChild;
    }
    const rect = el.getBoundingClientRect();
    const elWindow = dom.getWindow(el);
    const computedStyle = elWindow.getComputedStyle(el, null);
    const fontStyle = computedStyle.getPropertyValue("font-style");
    const fontVariant = computedStyle.getPropertyValue("font-variant");
    const fontWeight = computedStyle.getPropertyValue("font-weight");
    const fontSize = computedStyle.getPropertyValue("font-size");
    const lineHeight = computedStyle.getPropertyValue("line-height");
    const fontFamily = computedStyle.getPropertyValue("font-family");
    const font = `${fontStyle} ${fontVariant} ${fontWeight} ${fontSize}/${lineHeight} ${fontFamily}`;
    const text = el.innerText;
    let pixelCursor = rect.left;
    let offset = 0;
    let step;
    if (x > rect.left + rect.width) {
      offset = text.length;
    } else {
      const charWidthReader = CharWidthReader.getInstance();
      for (let i = 0; i < text.length + 1; i++) {
        step = charWidthReader.getCharWidth(text.charAt(i), font) / 2;
        pixelCursor += step;
        if (x < pixelCursor) {
          offset = i;
          break;
        }
        pixelCursor += step;
      }
    }
    range.setStart(el.firstChild, offset);
    range.setEnd(el.firstChild, offset);
  }
  return range;
}
const _CharWidthReader = class _CharWidthReader {
  static getInstance() {
    if (!_CharWidthReader._INSTANCE) {
      _CharWidthReader._INSTANCE = new _CharWidthReader();
    }
    return _CharWidthReader._INSTANCE;
  }
  constructor() {
    this._cache = {};
    this._canvas = document.createElement("canvas");
  }
  getCharWidth(char, font) {
    const cacheKey = char + font;
    if (this._cache[cacheKey]) {
      return this._cache[cacheKey];
    }
    const context = this._canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(char);
    const width = metrics.width;
    this._cache[cacheKey] = width;
    return width;
  }
};
_CharWidthReader._INSTANCE = null;
let CharWidthReader = _CharWidthReader;
export {
  HitTestContext,
  MouseTarget,
  MouseTargetFactory,
  PointerHandlerLastRenderData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2NvbnRyb2xsZXIvbW91c2VUYXJnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJUG9pbnRlckhhbmRsZXJIZWxwZXIgfSBmcm9tICcuL21vdXNlSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBJTW91c2VUYXJnZXRDb250ZW50RW1wdHlEYXRhLCBJTW91c2VUYXJnZXRNYXJnaW5EYXRhLCBJTW91c2VUYXJnZXQsIElNb3VzZVRhcmdldENvbnRlbnRFbXB0eSwgSU1vdXNlVGFyZ2V0Q29udGVudFRleHQsIElNb3VzZVRhcmdldENvbnRlbnRXaWRnZXQsIElNb3VzZVRhcmdldE1hcmdpbiwgSU1vdXNlVGFyZ2V0T3V0c2lkZUVkaXRvciwgSU1vdXNlVGFyZ2V0T3ZlcmxheVdpZGdldCwgSU1vdXNlVGFyZ2V0U2Nyb2xsYmFyLCBJTW91c2VUYXJnZXRUZXh0YXJlYSwgSU1vdXNlVGFyZ2V0VW5rbm93biwgSU1vdXNlVGFyZ2V0Vmlld1pvbmUsIElNb3VzZVRhcmdldENvbnRlbnRUZXh0RGF0YSwgSU1vdXNlVGFyZ2V0Vmlld1pvbmVEYXRhLCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENsaWVudENvb3JkaW5hdGVzLCBFZGl0b3JNb3VzZUV2ZW50LCBFZGl0b3JQYWdlUG9zaXRpb24sIFBhZ2VDb29yZGluYXRlcywgQ29vcmRpbmF0ZXNSZWxhdGl2ZVRvRWRpdG9yIH0gZnJvbSAnLi4vZWRpdG9yRG9tLmpzJztcbmltcG9ydCB7IFBhcnRGaW5nZXJwcmludCwgUGFydEZpbmdlcnByaW50cyB9IGZyb20gJy4uL3ZpZXcvdmlld1BhcnQuanMnO1xuaW1wb3J0IHsgVmlld0xpbmUgfSBmcm9tICcuLi92aWV3UGFydHMvdmlld0xpbmVzL3ZpZXdMaW5lLmpzJztcbmltcG9ydCB7IElWaWV3Q3Vyc29yUmVuZGVyRGF0YSB9IGZyb20gJy4uL3ZpZXdQYXJ0cy92aWV3Q3Vyc29ycy92aWV3Q3Vyc29yLmpzJztcbmltcG9ydCB7IEVkaXRvckxheW91dEluZm8sIEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIGFzIEVkaXRvclJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSG9yaXpvbnRhbFBvc2l0aW9uIH0gZnJvbSAnLi4vdmlldy9yZW5kZXJpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBJVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb2x1bW5zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvY3Vyc29yQ29sdW1ucy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBdG9taWNUYWJNb3ZlT3BlcmF0aW9ucywgRGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2N1cnNvci9jdXJzb3JBdG9taWNNb3ZlT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbkFmZmluaXR5LCBUZXh0RGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEluamVjdGVkVGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbExpbmVQcm9qZWN0aW9uRGF0YS5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3TGluZXNHcHUgfSBmcm9tICcuLi92aWV3UGFydHMvdmlld0xpbmVzR3B1L3ZpZXdMaW5lc0dwdS5qcyc7XG5cbmNvbnN0IGVudW0gSGl0VGVzdFJlc3VsdFR5cGUge1xuXHRVbmtub3duLFxuXHRDb250ZW50LFxufVxuXG5jbGFzcyBVbmtub3duSGl0VGVzdFJlc3VsdCB7XG5cdHJlYWRvbmx5IHR5cGUgPSBIaXRUZXN0UmVzdWx0VHlwZS5Vbmtub3duO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBoaXRUYXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGxcblx0KSB7IH1cbn1cblxuY2xhc3MgQ29udGVudEhpdFRlc3RSZXN1bHQge1xuXHRyZWFkb25seSB0eXBlID0gSGl0VGVzdFJlc3VsdFR5cGUuQ29udGVudDtcblxuXHRnZXQgaGl0VGFyZ2V0KCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMuc3Bhbk5vZGU7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0cmVhZG9ubHkgc3Bhbk5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHJlYWRvbmx5IGluamVjdGVkVGV4dDogSW5qZWN0ZWRUZXh0IHwgbnVsbCxcblx0KSB7IH1cbn1cblxudHlwZSBIaXRUZXN0UmVzdWx0ID0gVW5rbm93bkhpdFRlc3RSZXN1bHQgfCBDb250ZW50SGl0VGVzdFJlc3VsdDtcblxubmFtZXNwYWNlIEhpdFRlc3RSZXN1bHQge1xuXHRleHBvcnQgZnVuY3Rpb24gY3JlYXRlRnJvbURPTUluZm8oY3R4OiBIaXRUZXN0Q29udGV4dCwgc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBvZmZzZXQ6IG51bWJlcik6IEhpdFRlc3RSZXN1bHQge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gY3R4LmdldFBvc2l0aW9uRnJvbURPTUluZm8oc3Bhbk5vZGUsIG9mZnNldCk7XG5cdFx0aWYgKHBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbmV3IENvbnRlbnRIaXRUZXN0UmVzdWx0KHBvc2l0aW9uLCBzcGFuTm9kZSwgbnVsbCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgVW5rbm93bkhpdFRlc3RSZXN1bHQoc3Bhbk5vZGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQb2ludGVySGFuZGxlckxhc3RSZW5kZXJEYXRhIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhc3RWaWV3Q3Vyc29yc1JlbmRlckRhdGE6IElWaWV3Q3Vyc29yUmVuZGVyRGF0YVtdLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYXN0VGV4dGFyZWFQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBNb3VzZVRhcmdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2RlZHVjZVJhZ2UocG9zaXRpb246IFBvc2l0aW9uKTogRWRpdG9yUmFuZ2U7XG5cdHByaXZhdGUgc3RhdGljIF9kZWR1Y2VSYWdlKHBvc2l0aW9uOiBQb3NpdGlvbiwgcmFuZ2U6IEVkaXRvclJhbmdlIHwgbnVsbCk6IEVkaXRvclJhbmdlO1xuXHRwcml2YXRlIHN0YXRpYyBfZGVkdWNlUmFnZShwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsKTogRWRpdG9yUmFuZ2UgfCBudWxsO1xuXHRwcml2YXRlIHN0YXRpYyBfZGVkdWNlUmFnZShwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsLCByYW5nZTogRWRpdG9yUmFuZ2UgfCBudWxsID0gbnVsbCk6IEVkaXRvclJhbmdlIHwgbnVsbCB7XG5cdFx0aWYgKCFyYW5nZSAmJiBwb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuIG5ldyBFZGl0b3JSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiByYW5nZSA/PyBudWxsO1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlVW5rbm93bihlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIsIHBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGwpOiBJTW91c2VUYXJnZXRVbmtub3duIHtcblx0XHRyZXR1cm4geyB0eXBlOiBNb3VzZVRhcmdldFR5cGUuVU5LTk9XTiwgZWxlbWVudCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uLCByYW5nZTogdGhpcy5fZGVkdWNlUmFnZShwb3NpdGlvbikgfTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZVRleHRhcmVhKGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCwgbW91c2VDb2x1bW46IG51bWJlcik6IElNb3VzZVRhcmdldFRleHRhcmVhIHtcblx0XHRyZXR1cm4geyB0eXBlOiBNb3VzZVRhcmdldFR5cGUuVEVYVEFSRUEsIGVsZW1lbnQsIG1vdXNlQ29sdW1uLCBwb3NpdGlvbjogbnVsbCwgcmFuZ2U6IG51bGwgfTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZU1hcmdpbih0eXBlOiBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0dMWVBIX01BUkdJTiB8IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9OVU1CRVJTIHwgTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX0RFQ09SQVRJT05TLCBlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIsIHBvc2l0aW9uOiBQb3NpdGlvbiwgcmFuZ2U6IEVkaXRvclJhbmdlLCBkZXRhaWw6IElNb3VzZVRhcmdldE1hcmdpbkRhdGEpOiBJTW91c2VUYXJnZXRNYXJnaW4ge1xuXHRcdHJldHVybiB7IHR5cGUsIGVsZW1lbnQsIG1vdXNlQ29sdW1uLCBwb3NpdGlvbiwgcmFuZ2UsIGRldGFpbCB9O1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlVmlld1pvbmUodHlwZTogTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9WSUVXX1pPTkUgfCBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9WSUVXX1pPTkUsIGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCwgbW91c2VDb2x1bW46IG51bWJlciwgcG9zaXRpb246IFBvc2l0aW9uLCBkZXRhaWw6IElNb3VzZVRhcmdldFZpZXdab25lRGF0YSk6IElNb3VzZVRhcmdldFZpZXdab25lIHtcblx0XHRyZXR1cm4geyB0eXBlLCBlbGVtZW50LCBtb3VzZUNvbHVtbiwgcG9zaXRpb24sIHJhbmdlOiB0aGlzLl9kZWR1Y2VSYWdlKHBvc2l0aW9uKSwgZGV0YWlsIH07XG5cdH1cblx0cHVibGljIHN0YXRpYyBjcmVhdGVDb250ZW50VGV4dChlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIsIHBvc2l0aW9uOiBQb3NpdGlvbiwgcmFuZ2U6IEVkaXRvclJhbmdlIHwgbnVsbCwgZGV0YWlsOiBJTW91c2VUYXJnZXRDb250ZW50VGV4dERhdGEpOiBJTW91c2VUYXJnZXRDb250ZW50VGV4dCB7XG5cdFx0cmV0dXJuIHsgdHlwZTogTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCwgZWxlbWVudCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uLCByYW5nZTogdGhpcy5fZGVkdWNlUmFnZShwb3NpdGlvbiwgcmFuZ2UpLCBkZXRhaWwgfTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZUNvbnRlbnRFbXB0eShlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIsIHBvc2l0aW9uOiBQb3NpdGlvbiwgZGV0YWlsOiBJTW91c2VUYXJnZXRDb250ZW50RW1wdHlEYXRhKTogSU1vdXNlVGFyZ2V0Q29udGVudEVtcHR5IHtcblx0XHRyZXR1cm4geyB0eXBlOiBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9FTVBUWSwgZWxlbWVudCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uLCByYW5nZTogdGhpcy5fZGVkdWNlUmFnZShwb3NpdGlvbiksIGRldGFpbCB9O1xuXHR9XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlQ29udGVudFdpZGdldChlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIsIGRldGFpbDogc3RyaW5nKTogSU1vdXNlVGFyZ2V0Q29udGVudFdpZGdldCB7XG5cdFx0cmV0dXJuIHsgdHlwZTogTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfV0lER0VULCBlbGVtZW50LCBtb3VzZUNvbHVtbiwgcG9zaXRpb246IG51bGwsIHJhbmdlOiBudWxsLCBkZXRhaWwgfTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZVNjcm9sbGJhcihlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIG1vdXNlQ29sdW1uOiBudW1iZXIsIHBvc2l0aW9uOiBQb3NpdGlvbik6IElNb3VzZVRhcmdldFNjcm9sbGJhciB7XG5cdFx0cmV0dXJuIHsgdHlwZTogTW91c2VUYXJnZXRUeXBlLlNDUk9MTEJBUiwgZWxlbWVudCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uLCByYW5nZTogdGhpcy5fZGVkdWNlUmFnZShwb3NpdGlvbikgfTtcblx0fVxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZU92ZXJsYXlXaWRnZXQoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsLCBtb3VzZUNvbHVtbjogbnVtYmVyLCBkZXRhaWw6IHN0cmluZyk6IElNb3VzZVRhcmdldE92ZXJsYXlXaWRnZXQge1xuXHRcdHJldHVybiB7IHR5cGU6IE1vdXNlVGFyZ2V0VHlwZS5PVkVSTEFZX1dJREdFVCwgZWxlbWVudCwgbW91c2VDb2x1bW4sIHBvc2l0aW9uOiBudWxsLCByYW5nZTogbnVsbCwgZGV0YWlsIH07XG5cdH1cblx0cHVibGljIHN0YXRpYyBjcmVhdGVPdXRzaWRlRWRpdG9yKG1vdXNlQ29sdW1uOiBudW1iZXIsIHBvc2l0aW9uOiBQb3NpdGlvbiwgb3V0c2lkZVBvc2l0aW9uOiAnYWJvdmUnIHwgJ2JlbG93JyB8ICdsZWZ0JyB8ICdyaWdodCcsIG91dHNpZGVEaXN0YW5jZTogbnVtYmVyKTogSU1vdXNlVGFyZ2V0T3V0c2lkZUVkaXRvciB7XG5cdFx0cmV0dXJuIHsgdHlwZTogTW91c2VUYXJnZXRUeXBlLk9VVFNJREVfRURJVE9SLCBlbGVtZW50OiBudWxsLCBtb3VzZUNvbHVtbiwgcG9zaXRpb24sIHJhbmdlOiB0aGlzLl9kZWR1Y2VSYWdlKHBvc2l0aW9uKSwgb3V0c2lkZVBvc2l0aW9uLCBvdXRzaWRlRGlzdGFuY2UgfTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF90eXBlVG9TdHJpbmcodHlwZTogTW91c2VUYXJnZXRUeXBlKTogc3RyaW5nIHtcblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLlRFWFRBUkVBKSB7XG5cdFx0XHRyZXR1cm4gJ1RFWFRBUkVBJztcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfR0xZUEhfTUFSR0lOKSB7XG5cdFx0XHRyZXR1cm4gJ0dVVFRFUl9HTFlQSF9NQVJHSU4nO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX05VTUJFUlMpIHtcblx0XHRcdHJldHVybiAnR1VUVEVSX0xJTkVfTlVNQkVSUyc7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfREVDT1JBVElPTlMpIHtcblx0XHRcdHJldHVybiAnR1VUVEVSX0xJTkVfREVDT1JBVElPTlMnO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9WSUVXX1pPTkUpIHtcblx0XHRcdHJldHVybiAnR1VUVEVSX1ZJRVdfWk9ORSc7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKSB7XG5cdFx0XHRyZXR1cm4gJ0NPTlRFTlRfVEVYVCc7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9FTVBUWSkge1xuXHRcdFx0cmV0dXJuICdDT05URU5UX0VNUFRZJztcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1ZJRVdfWk9ORSkge1xuXHRcdFx0cmV0dXJuICdDT05URU5UX1ZJRVdfWk9ORSc7XG5cdFx0fVxuXHRcdGlmICh0eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9XSURHRVQpIHtcblx0XHRcdHJldHVybiAnQ09OVEVOVF9XSURHRVQnO1xuXHRcdH1cblx0XHRpZiAodHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLk9WRVJWSUVXX1JVTEVSKSB7XG5cdFx0XHRyZXR1cm4gJ09WRVJWSUVXX1JVTEVSJztcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5TQ1JPTExCQVIpIHtcblx0XHRcdHJldHVybiAnU0NST0xMQkFSJztcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5PVkVSTEFZX1dJREdFVCkge1xuXHRcdFx0cmV0dXJuICdPVkVSTEFZX1dJREdFVCc7XG5cdFx0fVxuXHRcdHJldHVybiAnVU5LTk9XTic7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHRvU3RyaW5nKHRhcmdldDogSU1vdXNlVGFyZ2V0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdHlwZVRvU3RyaW5nKHRhcmdldC50eXBlKSArICc6ICcgKyB0YXJnZXQucG9zaXRpb24gKyAnIC0gJyArIHRhcmdldC5yYW5nZSArICcgLSAnICsgSlNPTi5zdHJpbmdpZnkoKHRhcmdldCBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5kZXRhaWwpO1xuXHR9XG59XG5cbmNsYXNzIEVsZW1lbnRQYXRoIHtcblxuXHRwdWJsaWMgc3RhdGljIGlzVGV4dEFyZWEocGF0aDogVWludDhBcnJheSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHRwYXRoLmxlbmd0aCA9PT0gMlxuXHRcdFx0JiYgcGF0aFswXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJmbG93R3VhcmRcblx0XHRcdCYmIHBhdGhbMV0gPT09IFBhcnRGaW5nZXJwcmludC5UZXh0QXJlYVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGlzQ2hpbGRPZlZpZXdMaW5lcyhwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID49IDRcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd0d1YXJkXG5cdFx0XHQmJiBwYXRoWzNdID09PSBQYXJ0RmluZ2VycHJpbnQuVmlld0xpbmVzXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXNTdHJpY3RDaGlsZE9mVmlld0xpbmVzKHBhdGg6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cGF0aC5sZW5ndGggPiA0XG5cdFx0XHQmJiBwYXRoWzBdID09PSBQYXJ0RmluZ2VycHJpbnQuT3ZlcmZsb3dHdWFyZFxuXHRcdFx0JiYgcGF0aFszXSA9PT0gUGFydEZpbmdlcnByaW50LlZpZXdMaW5lc1xuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGlzQ2hpbGRPZlNjcm9sbGFibGVFbGVtZW50KHBhdGg6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cGF0aC5sZW5ndGggPj0gMlxuXHRcdFx0JiYgcGF0aFswXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJmbG93R3VhcmRcblx0XHRcdCYmIHBhdGhbMV0gPT09IFBhcnRGaW5nZXJwcmludC5TY3JvbGxhYmxlRWxlbWVudFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGlzQ2hpbGRPZk1pbmltYXAocGF0aDogVWludDhBcnJheSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHRwYXRoLmxlbmd0aCA+PSAyXG5cdFx0XHQmJiBwYXRoWzBdID09PSBQYXJ0RmluZ2VycHJpbnQuT3ZlcmZsb3dHdWFyZFxuXHRcdFx0JiYgcGF0aFsxXSA9PT0gUGFydEZpbmdlcnByaW50Lk1pbmltYXBcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZDb250ZW50V2lkZ2V0cyhwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID49IDRcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd0d1YXJkXG5cdFx0XHQmJiBwYXRoWzNdID09PSBQYXJ0RmluZ2VycHJpbnQuQ29udGVudFdpZGdldHNcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZPdmVyZmxvd0d1YXJkKHBhdGg6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cGF0aC5sZW5ndGggPj0gMVxuXHRcdFx0JiYgcGF0aFswXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJmbG93R3VhcmRcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZPdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzKHBhdGg6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cGF0aC5sZW5ndGggPj0gMVxuXHRcdFx0JiYgcGF0aFswXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJmbG93aW5nQ29udGVudFdpZGdldHNcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZPdmVybGF5V2lkZ2V0cyhwYXRoOiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHBhdGgubGVuZ3RoID49IDJcblx0XHRcdCYmIHBhdGhbMF0gPT09IFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd0d1YXJkXG5cdFx0XHQmJiBwYXRoWzFdID09PSBQYXJ0RmluZ2VycHJpbnQuT3ZlcmxheVdpZGdldHNcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkT2ZPdmVyZmxvd2luZ092ZXJsYXlXaWRnZXRzKHBhdGg6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0cGF0aC5sZW5ndGggPj0gMVxuXHRcdFx0JiYgcGF0aFswXSA9PT0gUGFydEZpbmdlcnByaW50Lk92ZXJmbG93aW5nT3ZlcmxheVdpZGdldHNcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBIaXRUZXN0Q29udGV4dCB7XG5cblx0cHVibGljIHJlYWRvbmx5IHZpZXdNb2RlbDogSVZpZXdNb2RlbDtcblx0cHVibGljIHJlYWRvbmx5IGxheW91dEluZm86IEVkaXRvckxheW91dEluZm87XG5cdHB1YmxpYyByZWFkb25seSB2aWV3RG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHB1YmxpYyByZWFkb25seSB2aWV3TGluZXNHcHU6IFZpZXdMaW5lc0dwdSB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IGxpbmVIZWlnaHQ6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IHN0aWNreVRhYlN0b3BzOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBsYXN0UmVuZGVyRGF0YTogUG9pbnRlckhhbmRsZXJMYXN0UmVuZGVyRGF0YTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBWaWV3Q29udGV4dDtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld0hlbHBlcjogSVBvaW50ZXJIYW5kbGVySGVscGVyO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IFZpZXdDb250ZXh0LCB2aWV3SGVscGVyOiBJUG9pbnRlckhhbmRsZXJIZWxwZXIsIGxhc3RSZW5kZXJEYXRhOiBQb2ludGVySGFuZGxlckxhc3RSZW5kZXJEYXRhKSB7XG5cdFx0dGhpcy52aWV3TW9kZWwgPSBjb250ZXh0LnZpZXdNb2RlbDtcblx0XHRjb25zdCBvcHRpb25zID0gY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0dGhpcy5sYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXHRcdHRoaXMudmlld0RvbU5vZGUgPSB2aWV3SGVscGVyLnZpZXdEb21Ob2RlO1xuXHRcdHRoaXMudmlld0xpbmVzR3B1ID0gdmlld0hlbHBlci52aWV3TGluZXNHcHU7XG5cdFx0dGhpcy5saW5lSGVpZ2h0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHRoaXMuc3RpY2t5VGFiU3RvcHMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3RpY2t5VGFiU3RvcHMpO1xuXHRcdHRoaXMudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0dGhpcy5sYXN0UmVuZGVyRGF0YSA9IGxhc3RSZW5kZXJEYXRhO1xuXHRcdHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMuX3ZpZXdIZWxwZXIgPSB2aWV3SGVscGVyO1xuXHR9XG5cblx0cHVibGljIGdldFpvbmVBdENvb3JkKG1vdXNlVmVydGljYWxPZmZzZXQ6IG51bWJlcik6IElNb3VzZVRhcmdldFZpZXdab25lRGF0YSB8IG51bGwge1xuXHRcdHJldHVybiBIaXRUZXN0Q29udGV4dC5nZXRab25lQXRDb29yZCh0aGlzLl9jb250ZXh0LCBtb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0Wm9uZUF0Q29vcmQoY29udGV4dDogVmlld0NvbnRleHQsIG1vdXNlVmVydGljYWxPZmZzZXQ6IG51bWJlcik6IElNb3VzZVRhcmdldFZpZXdab25lRGF0YSB8IG51bGwge1xuXHRcdC8vIFRoZSB0YXJnZXQgaXMgZWl0aGVyIGEgdmlldyB6b25lIG9yIHRoZSBlbXB0eSBzcGFjZSBhZnRlciB0aGUgbGFzdCB2aWV3LWxpbmVcblx0XHRjb25zdCB2aWV3Wm9uZVdoaXRlc3BhY2UgPSBjb250ZXh0LnZpZXdMYXlvdXQuZ2V0V2hpdGVzcGFjZUF0VmVydGljYWxPZmZzZXQobW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cblx0XHRpZiAodmlld1pvbmVXaGl0ZXNwYWNlKSB7XG5cdFx0XHRjb25zdCB2aWV3Wm9uZU1pZGRsZSA9IHZpZXdab25lV2hpdGVzcGFjZS52ZXJ0aWNhbE9mZnNldCArIHZpZXdab25lV2hpdGVzcGFjZS5oZWlnaHQgLyAyO1xuXHRcdFx0Y29uc3QgbGluZUNvdW50ID0gY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRsZXQgcG9zaXRpb25CZWZvcmU6IFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgcG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbDtcblx0XHRcdGxldCBwb3NpdGlvbkFmdGVyOiBQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRpZiAodmlld1pvbmVXaGl0ZXNwYWNlLmFmdGVyTGluZU51bWJlciAhPT0gbGluZUNvdW50KSB7XG5cdFx0XHRcdC8vIFRoZXJlIGFyZSBtb3JlIGxpbmVzIGFmdGVyIHRoaXMgdmlldyB6b25lXG5cdFx0XHRcdHBvc2l0aW9uQWZ0ZXIgPSBuZXcgUG9zaXRpb24odmlld1pvbmVXaGl0ZXNwYWNlLmFmdGVyTGluZU51bWJlciArIDEsIDEpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZpZXdab25lV2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIgPiAwKSB7XG5cdFx0XHRcdC8vIFRoZXJlIGFyZSBtb3JlIGxpbmVzIGFib3ZlIHRoaXMgdmlldyB6b25lXG5cdFx0XHRcdHBvc2l0aW9uQmVmb3JlID0gbmV3IFBvc2l0aW9uKHZpZXdab25lV2hpdGVzcGFjZS5hZnRlckxpbmVOdW1iZXIsIGNvbnRleHQudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4odmlld1pvbmVXaGl0ZXNwYWNlLmFmdGVyTGluZU51bWJlcikpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocG9zaXRpb25BZnRlciA9PT0gbnVsbCkge1xuXHRcdFx0XHRwb3NpdGlvbiA9IHBvc2l0aW9uQmVmb3JlO1xuXHRcdFx0fSBlbHNlIGlmIChwb3NpdGlvbkJlZm9yZSA9PT0gbnVsbCkge1xuXHRcdFx0XHRwb3NpdGlvbiA9IHBvc2l0aW9uQWZ0ZXI7XG5cdFx0XHR9IGVsc2UgaWYgKG1vdXNlVmVydGljYWxPZmZzZXQgPCB2aWV3Wm9uZU1pZGRsZSkge1xuXHRcdFx0XHRwb3NpdGlvbiA9IHBvc2l0aW9uQmVmb3JlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cG9zaXRpb24gPSBwb3NpdGlvbkFmdGVyO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2aWV3Wm9uZUlkOiB2aWV3Wm9uZVdoaXRlc3BhY2UuaWQsXG5cdFx0XHRcdGFmdGVyTGluZU51bWJlcjogdmlld1pvbmVXaGl0ZXNwYWNlLmFmdGVyTGluZU51bWJlcixcblx0XHRcdFx0cG9zaXRpb25CZWZvcmU6IHBvc2l0aW9uQmVmb3JlLFxuXHRcdFx0XHRwb3NpdGlvbkFmdGVyOiBwb3NpdGlvbkFmdGVyLFxuXHRcdFx0XHRwb3NpdGlvbjogcG9zaXRpb24hXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRGdWxsTGluZVJhbmdlQXRDb29yZChtb3VzZVZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiB7IHJhbmdlOiBFZGl0b3JSYW5nZTsgaXNBZnRlckxpbmVzOiBib29sZWFuIH0ge1xuXHRcdGlmICh0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuaXNBZnRlckxpbmVzKG1vdXNlVmVydGljYWxPZmZzZXQpKSB7XG5cdFx0XHQvLyBCZWxvdyB0aGUgbGFzdCBsaW5lXG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBtYXhMaW5lQ29sdW1uID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgRWRpdG9yUmFuZ2UobGluZU51bWJlciwgbWF4TGluZUNvbHVtbiwgbGluZU51bWJlciwgbWF4TGluZUNvbHVtbiksXG5cdFx0XHRcdGlzQWZ0ZXJMaW5lczogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KG1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHRcdGNvbnN0IG1heExpbmVDb2x1bW4gPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogbmV3IEVkaXRvclJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIG1heExpbmVDb2x1bW4pLFxuXHRcdFx0aXNBZnRlckxpbmVzOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQobW91c2VWZXJ0aWNhbE9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KG1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGlzQWZ0ZXJMaW5lcyhtb3VzZVZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmlzQWZ0ZXJMaW5lcyhtb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBpc0luVG9wUGFkZGluZyhtb3VzZVZlcnRpY2FsT2Zmc2V0OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmlzSW5Ub3BQYWRkaW5nKG1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGlzSW5Cb3R0b21QYWRkaW5nKG1vdXNlVmVydGljYWxPZmZzZXQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuaXNJbkJvdHRvbVBhZGRpbmcobW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZmluZEF0dHJpYnV0ZShlbGVtZW50OiBFbGVtZW50LCBhdHRyOiBzdHJpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gSGl0VGVzdENvbnRleHQuX2ZpbmRBdHRyaWJ1dGUoZWxlbWVudCwgYXR0ciwgdGhpcy5fdmlld0hlbHBlci52aWV3RG9tTm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZEF0dHJpYnV0ZShlbGVtZW50OiBFbGVtZW50LCBhdHRyOiBzdHJpbmcsIHN0b3BBdDogRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHdoaWxlIChlbGVtZW50ICYmIGVsZW1lbnQgIT09IGVsZW1lbnQub3duZXJEb2N1bWVudC5ib2R5KSB7XG5cdFx0XHRpZiAoZWxlbWVudC5oYXNBdHRyaWJ1dGUgJiYgZWxlbWVudC5oYXNBdHRyaWJ1dGUoYXR0cikpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuZ2V0QXR0cmlidXRlKGF0dHIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVsZW1lbnQgPT09IHN0b3BBdCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGVsZW1lbnQgPSA8RWxlbWVudD5lbGVtZW50LnBhcmVudE5vZGU7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVXaWR0aChsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl92aWV3SGVscGVyLmdldExpbmVXaWR0aChsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBpc1J0bChsaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWwuZ2V0VGV4dERpcmVjdGlvbihsaW5lTnVtYmVyKSA9PT0gVGV4dERpcmVjdGlvbi5SVEw7XG5cblx0fVxuXG5cdHB1YmxpYyB2aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbihsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogSG9yaXpvbnRhbFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdIZWxwZXIudmlzaWJsZVJhbmdlRm9yUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbkZyb21ET01JbmZvKHNwYW5Ob2RlOiBIVE1MRWxlbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl92aWV3SGVscGVyLmdldFBvc2l0aW9uRnJvbURPTUluZm8oc3Bhbk5vZGUsIG9mZnNldCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3VycmVudFNjcm9sbFRvcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpO1xuXHR9XG5cblx0cHVibGljIGdldEN1cnJlbnRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsTGVmdCgpO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEJhcmVIaXRUZXN0UmVxdWVzdCB7XG5cblx0cHVibGljIHJlYWRvbmx5IGVkaXRvclBvczogRWRpdG9yUGFnZVBvc2l0aW9uO1xuXHRwdWJsaWMgcmVhZG9ubHkgcG9zOiBQYWdlQ29vcmRpbmF0ZXM7XG5cdHB1YmxpYyByZWFkb25seSByZWxhdGl2ZVBvczogQ29vcmRpbmF0ZXNSZWxhdGl2ZVRvRWRpdG9yO1xuXHRwdWJsaWMgcmVhZG9ubHkgbW91c2VWZXJ0aWNhbE9mZnNldDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNJbk1hcmdpbkFyZWE6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBpc0luQ29udGVudEFyZWE6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0OiBudW1iZXI7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IG1vdXNlQ29sdW1uOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoY3R4OiBIaXRUZXN0Q29udGV4dCwgZWRpdG9yUG9zOiBFZGl0b3JQYWdlUG9zaXRpb24sIHBvczogUGFnZUNvb3JkaW5hdGVzLCByZWxhdGl2ZVBvczogQ29vcmRpbmF0ZXNSZWxhdGl2ZVRvRWRpdG9yKSB7XG5cdFx0dGhpcy5lZGl0b3JQb3MgPSBlZGl0b3JQb3M7XG5cdFx0dGhpcy5wb3MgPSBwb3M7XG5cdFx0dGhpcy5yZWxhdGl2ZVBvcyA9IHJlbGF0aXZlUG9zO1xuXG5cdFx0dGhpcy5tb3VzZVZlcnRpY2FsT2Zmc2V0ID0gTWF0aC5tYXgoMCwgY3R4LmdldEN1cnJlbnRTY3JvbGxUb3AoKSArIHRoaXMucmVsYXRpdmVQb3MueSk7XG5cdFx0dGhpcy5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0ID0gY3R4LmdldEN1cnJlbnRTY3JvbGxMZWZ0KCkgKyB0aGlzLnJlbGF0aXZlUG9zLnggLSBjdHgubGF5b3V0SW5mby5jb250ZW50TGVmdDtcblx0XHR0aGlzLmlzSW5NYXJnaW5BcmVhID0gKHRoaXMucmVsYXRpdmVQb3MueCA8IGN0eC5sYXlvdXRJbmZvLmNvbnRlbnRMZWZ0ICYmIHRoaXMucmVsYXRpdmVQb3MueCA+PSBjdHgubGF5b3V0SW5mby5nbHlwaE1hcmdpbkxlZnQpO1xuXHRcdHRoaXMuaXNJbkNvbnRlbnRBcmVhID0gIXRoaXMuaXNJbk1hcmdpbkFyZWE7XG5cdFx0dGhpcy5tb3VzZUNvbHVtbiA9IE1hdGgubWF4KDAsIE1vdXNlVGFyZ2V0RmFjdG9yeS5fZ2V0TW91c2VDb2x1bW4odGhpcy5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0LCBjdHgudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKSk7XG5cdH1cbn1cblxuY2xhc3MgSGl0VGVzdFJlcXVlc3QgZXh0ZW5kcyBCYXJlSGl0VGVzdFJlcXVlc3Qge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHg6IEhpdFRlc3RDb250ZXh0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ldmVudFRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgaGl0VGVzdFJlc3VsdCA9IG5ldyBMYXp5KCgpID0+IE1vdXNlVGFyZ2V0RmFjdG9yeS5kb0hpdFRlc3QodGhpcy5fY3R4LCB0aGlzKSk7XG5cdHByaXZhdGUgX3VzZUhpdFRlc3RUYXJnZXQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX3RhcmdldFBhdGhDYWNoZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3RhcmdldFBhdGhDYWNoZVZhbHVlOiBVaW50OEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG5cblx0cHVibGljIGdldCB0YXJnZXQoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRpZiAodGhpcy5fdXNlSGl0VGVzdFRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaGl0VGVzdFJlc3VsdC52YWx1ZS5oaXRUYXJnZXQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9ldmVudFRhcmdldDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdGFyZ2V0UGF0aCgpOiBVaW50OEFycmF5IHtcblx0XHRpZiAodGhpcy5fdGFyZ2V0UGF0aENhY2hlRWxlbWVudCAhPT0gdGhpcy50YXJnZXQpIHtcblx0XHRcdHRoaXMuX3RhcmdldFBhdGhDYWNoZUVsZW1lbnQgPSB0aGlzLnRhcmdldDtcblx0XHRcdHRoaXMuX3RhcmdldFBhdGhDYWNoZVZhbHVlID0gUGFydEZpbmdlcnByaW50cy5jb2xsZWN0KHRoaXMudGFyZ2V0LCB0aGlzLl9jdHgudmlld0RvbU5vZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGFyZ2V0UGF0aENhY2hlVmFsdWU7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihjdHg6IEhpdFRlc3RDb250ZXh0LCBlZGl0b3JQb3M6IEVkaXRvclBhZ2VQb3NpdGlvbiwgcG9zOiBQYWdlQ29vcmRpbmF0ZXMsIHJlbGF0aXZlUG9zOiBDb29yZGluYXRlc1JlbGF0aXZlVG9FZGl0b3IsIGV2ZW50VGFyZ2V0OiBIVE1MRWxlbWVudCB8IG51bGwpIHtcblx0XHRzdXBlcihjdHgsIGVkaXRvclBvcywgcG9zLCByZWxhdGl2ZVBvcyk7XG5cdFx0dGhpcy5fY3R4ID0gY3R4O1xuXHRcdHRoaXMuX2V2ZW50VGFyZ2V0ID0gZXZlbnRUYXJnZXQ7XG5cblx0XHQvLyBJZiBubyBldmVudCB0YXJnZXQgaXMgcGFzc2VkIGluLCB3ZSB3aWxsIHVzZSB0aGUgaGl0IHRlc3QgdGFyZ2V0XG5cdFx0Y29uc3QgaGFzRXZlbnRUYXJnZXQgPSBCb29sZWFuKHRoaXMuX2V2ZW50VGFyZ2V0KTtcblx0XHR0aGlzLl91c2VIaXRUZXN0VGFyZ2V0ID0gIWhhc0V2ZW50VGFyZ2V0O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBwb3MoJHt0aGlzLnBvcy54fSwke3RoaXMucG9zLnl9KSwgZWRpdG9yUG9zKCR7dGhpcy5lZGl0b3JQb3MueH0sJHt0aGlzLmVkaXRvclBvcy55fSksIHJlbGF0aXZlUG9zKCR7dGhpcy5yZWxhdGl2ZVBvcy54fSwke3RoaXMucmVsYXRpdmVQb3MueX0pLCBtb3VzZVZlcnRpY2FsT2Zmc2V0OiAke3RoaXMubW91c2VWZXJ0aWNhbE9mZnNldH0sIG1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQ6ICR7dGhpcy5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0fVxcblxcdHRhcmdldDogJHt0aGlzLnRhcmdldCA/IHRoaXMudGFyZ2V0Lm91dGVySFRNTCA6IG51bGx9YDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgd291bGRCZW5lZml0RnJvbUhpdFRlc3RUYXJnZXRTd2l0Y2goKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdCF0aGlzLl91c2VIaXRUZXN0VGFyZ2V0XG5cdFx0XHQmJiB0aGlzLmhpdFRlc3RSZXN1bHQudmFsdWUuaGl0VGFyZ2V0ICE9PSBudWxsXG5cdFx0XHQmJiB0aGlzLnRhcmdldCAhPT0gdGhpcy5oaXRUZXN0UmVzdWx0LnZhbHVlLmhpdFRhcmdldFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc3dpdGNoVG9IaXRUZXN0VGFyZ2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3VzZUhpdFRlc3RUYXJnZXQgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TW91c2VDb2x1bW4ocG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCA9IG51bGwpOiBudW1iZXIge1xuXHRcdGlmIChwb3NpdGlvbiAmJiBwb3NpdGlvbi5jb2x1bW4gPCB0aGlzLl9jdHgudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikpIHtcblx0XHRcdC8vIE1vc3QgbGlrZWx5LCB0aGUgbGluZSBjb250YWlucyBmb3JlaWduIGRlY29yYXRpb25zLi4uXG5cdFx0XHRyZXR1cm4gQ3Vyc29yQ29sdW1ucy52aXNpYmxlQ29sdW1uRnJvbUNvbHVtbih0aGlzLl9jdHgudmlld01vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLCBwb3NpdGlvbi5jb2x1bW4sIHRoaXMuX2N0eC52aWV3TW9kZWwubW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemUpICsgMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubW91c2VDb2x1bW47XG5cdH1cblxuXHRwdWJsaWMgZnVsZmlsbFVua25vd24ocG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCA9IG51bGwpOiBJTW91c2VUYXJnZXRVbmtub3duIHtcblx0XHRyZXR1cm4gTW91c2VUYXJnZXQuY3JlYXRlVW5rbm93bih0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4ocG9zaXRpb24pLCBwb3NpdGlvbik7XG5cdH1cblx0cHVibGljIGZ1bGZpbGxUZXh0YXJlYSgpOiBJTW91c2VUYXJnZXRUZXh0YXJlYSB7XG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZVRleHRhcmVhKHRoaXMudGFyZ2V0LCB0aGlzLl9nZXRNb3VzZUNvbHVtbigpKTtcblx0fVxuXHRwdWJsaWMgZnVsZmlsbE1hcmdpbih0eXBlOiBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0dMWVBIX01BUkdJTiB8IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9OVU1CRVJTIHwgTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX0RFQ09SQVRJT05TLCBwb3NpdGlvbjogUG9zaXRpb24sIHJhbmdlOiBFZGl0b3JSYW5nZSwgZGV0YWlsOiBJTW91c2VUYXJnZXRNYXJnaW5EYXRhKTogSU1vdXNlVGFyZ2V0TWFyZ2luIHtcblx0XHRyZXR1cm4gTW91c2VUYXJnZXQuY3JlYXRlTWFyZ2luKHR5cGUsIHRoaXMudGFyZ2V0LCB0aGlzLl9nZXRNb3VzZUNvbHVtbihwb3NpdGlvbiksIHBvc2l0aW9uLCByYW5nZSwgZGV0YWlsKTtcblx0fVxuXHRwdWJsaWMgZnVsZmlsbFZpZXdab25lKHR5cGU6IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfVklFV19aT05FIHwgTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVklFV19aT05FLCBwb3NpdGlvbjogUG9zaXRpb24sIGRldGFpbDogSU1vdXNlVGFyZ2V0Vmlld1pvbmVEYXRhKTogSU1vdXNlVGFyZ2V0Vmlld1pvbmUge1xuXHRcdC8vIEFsd2F5cyByZXR1cm4gdGhlIHVzdWFsIG1vdXNlIGNvbHVtbiBmb3IgYSB2aWV3IHpvbmUuXG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZVZpZXdab25lKHR5cGUsIHRoaXMudGFyZ2V0LCB0aGlzLl9nZXRNb3VzZUNvbHVtbigpLCBwb3NpdGlvbiwgZGV0YWlsKTtcblx0fVxuXHRwdWJsaWMgZnVsZmlsbENvbnRlbnRUZXh0KHBvc2l0aW9uOiBQb3NpdGlvbiwgcmFuZ2U6IEVkaXRvclJhbmdlIHwgbnVsbCwgZGV0YWlsOiBJTW91c2VUYXJnZXRDb250ZW50VGV4dERhdGEpOiBJTW91c2VUYXJnZXRDb250ZW50VGV4dCB7XG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZUNvbnRlbnRUZXh0KHRoaXMudGFyZ2V0LCB0aGlzLl9nZXRNb3VzZUNvbHVtbihwb3NpdGlvbiksIHBvc2l0aW9uLCByYW5nZSwgZGV0YWlsKTtcblx0fVxuXHRwdWJsaWMgZnVsZmlsbENvbnRlbnRFbXB0eShwb3NpdGlvbjogUG9zaXRpb24sIGRldGFpbDogSU1vdXNlVGFyZ2V0Q29udGVudEVtcHR5RGF0YSk6IElNb3VzZVRhcmdldENvbnRlbnRFbXB0eSB7XG5cdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZUNvbnRlbnRFbXB0eSh0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4ocG9zaXRpb24pLCBwb3NpdGlvbiwgZGV0YWlsKTtcblx0fVxuXHRwdWJsaWMgZnVsZmlsbENvbnRlbnRXaWRnZXQoZGV0YWlsOiBzdHJpbmcpOiBJTW91c2VUYXJnZXRDb250ZW50V2lkZ2V0IHtcblx0XHRyZXR1cm4gTW91c2VUYXJnZXQuY3JlYXRlQ29udGVudFdpZGdldCh0aGlzLnRhcmdldCwgdGhpcy5fZ2V0TW91c2VDb2x1bW4oKSwgZGV0YWlsKTtcblx0fVxuXHRwdWJsaWMgZnVsZmlsbFNjcm9sbGJhcihwb3NpdGlvbjogUG9zaXRpb24pOiBJTW91c2VUYXJnZXRTY3JvbGxiYXIge1xuXHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVTY3JvbGxiYXIodGhpcy50YXJnZXQsIHRoaXMuX2dldE1vdXNlQ29sdW1uKHBvc2l0aW9uKSwgcG9zaXRpb24pO1xuXHR9XG5cdHB1YmxpYyBmdWxmaWxsT3ZlcmxheVdpZGdldChkZXRhaWw6IHN0cmluZyk6IElNb3VzZVRhcmdldE92ZXJsYXlXaWRnZXQge1xuXHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVPdmVybGF5V2lkZ2V0KHRoaXMudGFyZ2V0LCB0aGlzLl9nZXRNb3VzZUNvbHVtbigpLCBkZXRhaWwpO1xuXHR9XG59XG5cbmludGVyZmFjZSBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0IGV4dGVuZHMgSGl0VGVzdFJlcXVlc3Qge1xuXHRyZWFkb25seSB0YXJnZXQ6IEhUTUxFbGVtZW50O1xufVxuXG5jb25zdCBFTVBUWV9DT05URU5UX0FGVEVSX0xJTkVTOiBJTW91c2VUYXJnZXRDb250ZW50RW1wdHlEYXRhID0geyBpc0FmdGVyTGluZXM6IHRydWUgfTtcblxuZnVuY3Rpb24gY3JlYXRlRW1wdHlDb250ZW50RGF0YUluTGluZXMoaG9yaXpvbnRhbERpc3RhbmNlVG9UZXh0OiBudW1iZXIpOiBJTW91c2VUYXJnZXRDb250ZW50RW1wdHlEYXRhIHtcblx0cmV0dXJuIHtcblx0XHRpc0FmdGVyTGluZXM6IGZhbHNlLFxuXHRcdGhvcml6b250YWxEaXN0YW5jZVRvVGV4dDogaG9yaXpvbnRhbERpc3RhbmNlVG9UZXh0XG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBNb3VzZVRhcmdldEZhY3Rvcnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHQ6IFZpZXdDb250ZXh0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3SGVscGVyOiBJUG9pbnRlckhhbmRsZXJIZWxwZXI7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQsIHZpZXdIZWxwZXI6IElQb2ludGVySGFuZGxlckhlbHBlcikge1xuXHRcdHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMuX3ZpZXdIZWxwZXIgPSB2aWV3SGVscGVyO1xuXHR9XG5cblx0cHVibGljIG1vdXNlVGFyZ2V0SXNXaWRnZXQoZTogRWRpdG9yTW91c2VFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHQgPSA8RWxlbWVudD5lLnRhcmdldDtcblx0XHRjb25zdCBwYXRoID0gUGFydEZpbmdlcnByaW50cy5jb2xsZWN0KHQsIHRoaXMuX3ZpZXdIZWxwZXIudmlld0RvbU5vZGUpO1xuXG5cdFx0Ly8gSXMgaXQgYSBjb250ZW50IHdpZGdldD9cblx0XHRpZiAoRWxlbWVudFBhdGguaXNDaGlsZE9mQ29udGVudFdpZGdldHMocGF0aCkgfHwgRWxlbWVudFBhdGguaXNDaGlsZE9mT3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0cyhwYXRoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gSXMgaXQgYW4gb3ZlcmxheSB3aWRnZXQ/XG5cdFx0aWYgKEVsZW1lbnRQYXRoLmlzQ2hpbGRPZk92ZXJsYXlXaWRnZXRzKHBhdGgpIHx8IEVsZW1lbnRQYXRoLmlzQ2hpbGRPZk92ZXJmbG93aW5nT3ZlcmxheVdpZGdldHMocGF0aCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVNb3VzZVRhcmdldChsYXN0UmVuZGVyRGF0YTogUG9pbnRlckhhbmRsZXJMYXN0UmVuZGVyRGF0YSwgZWRpdG9yUG9zOiBFZGl0b3JQYWdlUG9zaXRpb24sIHBvczogUGFnZUNvb3JkaW5hdGVzLCByZWxhdGl2ZVBvczogQ29vcmRpbmF0ZXNSZWxhdGl2ZVRvRWRpdG9yLCB0YXJnZXQ6IEhUTUxFbGVtZW50IHwgbnVsbCk6IElNb3VzZVRhcmdldCB7XG5cdFx0Y29uc3QgY3R4ID0gbmV3IEhpdFRlc3RDb250ZXh0KHRoaXMuX2NvbnRleHQsIHRoaXMuX3ZpZXdIZWxwZXIsIGxhc3RSZW5kZXJEYXRhKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IEhpdFRlc3RSZXF1ZXN0KGN0eCwgZWRpdG9yUG9zLCBwb3MsIHJlbGF0aXZlUG9zLCB0YXJnZXQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByID0gTW91c2VUYXJnZXRGYWN0b3J5Ll9jcmVhdGVNb3VzZVRhcmdldChjdHgsIHJlcXVlc3QpO1xuXG5cdFx0XHRpZiAoci50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKSB7XG5cdFx0XHRcdC8vIFNuYXAgdG8gdGhlIG5lYXJlc3Qgc29mdCB0YWIgYm91bmRhcnkgaWYgYXRvbWljIHNvZnQgdGFicyBhcmUgZW5hYmxlZC5cblx0XHRcdFx0aWYgKGN0eC5zdGlja3lUYWJTdG9wcyAmJiByLnBvc2l0aW9uICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBNb3VzZVRhcmdldEZhY3RvcnkuX3NuYXBUb1NvZnRUYWJCb3VuZGFyeShyLnBvc2l0aW9uLCBjdHgudmlld01vZGVsKTtcblx0XHRcdFx0XHRjb25zdCByYW5nZSA9IEVkaXRvclJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24sIHBvc2l0aW9uKS5wbHVzUmFuZ2Uoci5yYW5nZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRUZXh0KHBvc2l0aW9uLCByYW5nZSwgci5kZXRhaWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNvbnNvbGUubG9nKE1vdXNlVGFyZ2V0LnRvU3RyaW5nKHIpKTtcblx0XHRcdHJldHVybiByO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coZXJyKTtcblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxVbmtub3duKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZU1vdXNlVGFyZ2V0KGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHtcblxuXHRcdC8vIGNvbnNvbGUubG9nKGAke2RvbUhpdFRlc3RFeGVjdXRlZCA/ICc9PicgOiAnJ31DQU1FIElOIFJFUVVFU1Q6ICR7cmVxdWVzdH1gKTtcblxuXHRcdGlmIChyZXF1ZXN0LnRhcmdldCA9PT0gbnVsbCkge1xuXHRcdFx0Ly8gTm8gdGFyZ2V0XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsVW5rbm93bigpO1xuXHRcdH1cblxuXHRcdC8vIHdlIGtub3cgZm9yIGEgZmFjdCB0aGF0IHJlcXVlc3QudGFyZ2V0IGlzIG5vdCBudWxsXG5cdFx0Y29uc3QgcmVzb2x2ZWRSZXF1ZXN0ID0gPFJlc29sdmVkSGl0VGVzdFJlcXVlc3Q+cmVxdWVzdDtcblxuXHRcdGxldCByZXN1bHQ6IElNb3VzZVRhcmdldCB8IG51bGwgPSBudWxsO1xuXG5cdFx0aWYgKCFFbGVtZW50UGF0aC5pc0NoaWxkT2ZPdmVyZmxvd0d1YXJkKHJlcXVlc3QudGFyZ2V0UGF0aCkgJiYgIUVsZW1lbnRQYXRoLmlzQ2hpbGRPZk92ZXJmbG93aW5nQ29udGVudFdpZGdldHMocmVxdWVzdC50YXJnZXRQYXRoKSAmJiAhRWxlbWVudFBhdGguaXNDaGlsZE9mT3ZlcmZsb3dpbmdPdmVybGF5V2lkZ2V0cyhyZXF1ZXN0LnRhcmdldFBhdGgpKSB7XG5cdFx0XHQvLyBXZSBvbmx5IHJlbmRlciBkb20gbm9kZXMgaW5zaWRlIHRoZSBvdmVyZmxvdyBndWFyZCBvciBpbiB0aGUgb3ZlcmZsb3dpbmcgY29udGVudCB3aWRnZXRzXG5cdFx0XHRyZXN1bHQgPSByZXN1bHQgfHwgcmVxdWVzdC5mdWxmaWxsVW5rbm93bigpO1xuXHRcdH1cblxuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RDb250ZW50V2lkZ2V0KGN0eCwgcmVzb2x2ZWRSZXF1ZXN0KTtcblx0XHRyZXN1bHQgPSByZXN1bHQgfHwgTW91c2VUYXJnZXRGYWN0b3J5Ll9oaXRUZXN0T3ZlcmxheVdpZGdldChjdHgsIHJlc29sdmVkUmVxdWVzdCk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0IHx8IE1vdXNlVGFyZ2V0RmFjdG9yeS5faGl0VGVzdE1pbmltYXAoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RTY3JvbGxiYXJTbGlkZXIoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RWaWV3Wm9uZShjdHgsIHJlc29sdmVkUmVxdWVzdCk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0IHx8IE1vdXNlVGFyZ2V0RmFjdG9yeS5faGl0VGVzdE1hcmdpbihjdHgsIHJlc29sdmVkUmVxdWVzdCk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0IHx8IE1vdXNlVGFyZ2V0RmFjdG9yeS5faGl0VGVzdFZpZXdDdXJzb3IoY3R4LCByZXNvbHZlZFJlcXVlc3QpO1xuXHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBNb3VzZVRhcmdldEZhY3RvcnkuX2hpdFRlc3RUZXh0QXJlYShjdHgsIHJlc29sdmVkUmVxdWVzdCk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0IHx8IE1vdXNlVGFyZ2V0RmFjdG9yeS5faGl0VGVzdFZpZXdMaW5lcyhjdHgsIHJlc29sdmVkUmVxdWVzdCk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0IHx8IE1vdXNlVGFyZ2V0RmFjdG9yeS5faGl0VGVzdFNjcm9sbGJhcihjdHgsIHJlc29sdmVkUmVxdWVzdCk7XG5cblx0XHRyZXR1cm4gKHJlc3VsdCB8fCByZXF1ZXN0LmZ1bGZpbGxVbmtub3duKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RDb250ZW50V2lkZ2V0KGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHQvLyBJcyBpdCBhIGNvbnRlbnQgd2lkZ2V0P1xuXHRcdGlmIChFbGVtZW50UGF0aC5pc0NoaWxkT2ZDb250ZW50V2lkZ2V0cyhyZXF1ZXN0LnRhcmdldFBhdGgpIHx8IEVsZW1lbnRQYXRoLmlzQ2hpbGRPZk92ZXJmbG93aW5nQ29udGVudFdpZGdldHMocmVxdWVzdC50YXJnZXRQYXRoKSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0SWQgPSBjdHguZmluZEF0dHJpYnV0ZShyZXF1ZXN0LnRhcmdldCwgJ3dpZGdldElkJyk7XG5cdFx0XHRpZiAod2lkZ2V0SWQpIHtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRXaWRnZXQod2lkZ2V0SWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFVua25vd24oKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGl0VGVzdE92ZXJsYXlXaWRnZXQoY3R4OiBIaXRUZXN0Q29udGV4dCwgcmVxdWVzdDogUmVzb2x2ZWRIaXRUZXN0UmVxdWVzdCk6IElNb3VzZVRhcmdldCB8IG51bGwge1xuXHRcdC8vIElzIGl0IGFuIG92ZXJsYXkgd2lkZ2V0P1xuXHRcdGlmIChFbGVtZW50UGF0aC5pc0NoaWxkT2ZPdmVybGF5V2lkZ2V0cyhyZXF1ZXN0LnRhcmdldFBhdGgpIHx8IEVsZW1lbnRQYXRoLmlzQ2hpbGRPZk92ZXJmbG93aW5nT3ZlcmxheVdpZGdldHMocmVxdWVzdC50YXJnZXRQYXRoKSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0SWQgPSBjdHguZmluZEF0dHJpYnV0ZShyZXF1ZXN0LnRhcmdldCwgJ3dpZGdldElkJyk7XG5cdFx0XHRpZiAod2lkZ2V0SWQpIHtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbE92ZXJsYXlXaWRnZXQod2lkZ2V0SWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFVua25vd24oKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGl0VGVzdFZpZXdDdXJzb3IoY3R4OiBIaXRUZXN0Q29udGV4dCwgcmVxdWVzdDogUmVzb2x2ZWRIaXRUZXN0UmVxdWVzdCk6IElNb3VzZVRhcmdldCB8IG51bGwge1xuXG5cdFx0aWYgKHJlcXVlc3QudGFyZ2V0KSB7XG5cdFx0XHQvLyBDaGVjayBpZiB3ZSd2ZSBoaXQgYSBwYWludGVkIGN1cnNvclxuXHRcdFx0Y29uc3QgbGFzdFZpZXdDdXJzb3JzUmVuZGVyRGF0YSA9IGN0eC5sYXN0UmVuZGVyRGF0YS5sYXN0Vmlld0N1cnNvcnNSZW5kZXJEYXRhO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGQgb2YgbGFzdFZpZXdDdXJzb3JzUmVuZGVyRGF0YSkge1xuXG5cdFx0XHRcdGlmIChyZXF1ZXN0LnRhcmdldCA9PT0gZC5kb21Ob2RlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRUZXh0KGQucG9zaXRpb24sIG51bGwsIHsgbWlnaHRCZUZvcmVpZ25FbGVtZW50OiBmYWxzZSwgaW5qZWN0ZWRUZXh0OiBudWxsIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlcXVlc3QuaXNJbkNvbnRlbnRBcmVhKSB7XG5cdFx0XHQvLyBFZGdlIGhhcyBhIGJ1ZyB3aGVuIGhpdC10ZXN0aW5nIHRoZSBleGFjdCBwb3NpdGlvbiBvZiBhIGN1cnNvcixcblx0XHRcdC8vIGluc3RlYWQgb2YgcmV0dXJuaW5nIHRoZSBjb3JyZWN0IGRvbSBub2RlLCBpdCByZXR1cm5zIHRoZVxuXHRcdFx0Ly8gZmlyc3Qgb3IgbGFzdCByZW5kZXJlZCB2aWV3IGxpbmUgZG9tIG5vZGUsIHRoZXJlZm9yZSBoZWxwIGl0IG91dFxuXHRcdFx0Ly8gYW5kIGZpcnN0IGNoZWNrIGlmIHdlIGFyZSBvbiB0b3Agb2YgYSBjdXJzb3JcblxuXHRcdFx0Y29uc3QgbGFzdFZpZXdDdXJzb3JzUmVuZGVyRGF0YSA9IGN0eC5sYXN0UmVuZGVyRGF0YS5sYXN0Vmlld0N1cnNvcnNSZW5kZXJEYXRhO1xuXHRcdFx0Y29uc3QgbW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA9IHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldDtcblx0XHRcdGNvbnN0IG1vdXNlVmVydGljYWxPZmZzZXQgPSByZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQ7XG5cblx0XHRcdGZvciAoY29uc3QgZCBvZiBsYXN0Vmlld0N1cnNvcnNSZW5kZXJEYXRhKSB7XG5cblx0XHRcdFx0aWYgKG1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgPCBkLmNvbnRlbnRMZWZ0KSB7XG5cdFx0XHRcdFx0Ly8gbW91c2UgcG9zaXRpb24gaXMgdG8gdGhlIGxlZnQgb2YgdGhlIGN1cnNvclxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0ID4gZC5jb250ZW50TGVmdCArIGQud2lkdGgpIHtcblx0XHRcdFx0XHQvLyBtb3VzZSBwb3NpdGlvbiBpcyB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnNvclxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3Vyc29yVmVydGljYWxPZmZzZXQgPSBjdHguZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGQucG9zaXRpb24ubGluZU51bWJlcik7XG5cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGN1cnNvclZlcnRpY2FsT2Zmc2V0IDw9IG1vdXNlVmVydGljYWxPZmZzZXRcblx0XHRcdFx0XHQmJiBtb3VzZVZlcnRpY2FsT2Zmc2V0IDw9IGN1cnNvclZlcnRpY2FsT2Zmc2V0ICsgZC5oZWlnaHRcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRUZXh0KGQucG9zaXRpb24sIG51bGwsIHsgbWlnaHRCZUZvcmVpZ25FbGVtZW50OiBmYWxzZSwgaW5qZWN0ZWRUZXh0OiBudWxsIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGl0VGVzdFZpZXdab25lKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHRjb25zdCB2aWV3Wm9uZURhdGEgPSBjdHguZ2V0Wm9uZUF0Q29vcmQocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0XHRpZiAodmlld1pvbmVEYXRhKSB7XG5cdFx0XHRjb25zdCBtb3VzZVRhcmdldFR5cGUgPSAocmVxdWVzdC5pc0luQ29udGVudEFyZWEgPyBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9WSUVXX1pPTkUgOiBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX1ZJRVdfWk9ORSk7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsVmlld1pvbmUobW91c2VUYXJnZXRUeXBlLCB2aWV3Wm9uZURhdGEucG9zaXRpb24sIHZpZXdab25lRGF0YSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGl0VGVzdFRleHRBcmVhKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHQvLyBJcyBpdCB0aGUgdGV4dGFyZWE/XG5cdFx0aWYgKEVsZW1lbnRQYXRoLmlzVGV4dEFyZWEocmVxdWVzdC50YXJnZXRQYXRoKSkge1xuXHRcdFx0aWYgKGN0eC5sYXN0UmVuZGVyRGF0YS5sYXN0VGV4dGFyZWFQb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudFRleHQoY3R4Lmxhc3RSZW5kZXJEYXRhLmxhc3RUZXh0YXJlYVBvc2l0aW9uLCBudWxsLCB7IG1pZ2h0QmVGb3JlaWduRWxlbWVudDogZmFsc2UsIGluamVjdGVkVGV4dDogbnVsbCB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxUZXh0YXJlYSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9oaXRUZXN0TWFyZ2luKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHRpZiAocmVxdWVzdC5pc0luTWFyZ2luQXJlYSkge1xuXHRcdFx0Y29uc3QgcmVzID0gY3R4LmdldEZ1bGxMaW5lUmFuZ2VBdENvb3JkKHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdFx0XHRjb25zdCBwb3MgPSByZXMucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0bGV0IG9mZnNldCA9IE1hdGguYWJzKHJlcXVlc3QucmVsYXRpdmVQb3MueCk7XG5cdFx0XHRjb25zdCBkZXRhaWw6IE11dGFibGU8SU1vdXNlVGFyZ2V0TWFyZ2luRGF0YT4gPSB7XG5cdFx0XHRcdGlzQWZ0ZXJMaW5lczogcmVzLmlzQWZ0ZXJMaW5lcyxcblx0XHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiBjdHgubGF5b3V0SW5mby5nbHlwaE1hcmdpbkxlZnQsXG5cdFx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IGN0eC5sYXlvdXRJbmZvLmdseXBoTWFyZ2luV2lkdGgsXG5cdFx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IGN0eC5sYXlvdXRJbmZvLmxpbmVOdW1iZXJzV2lkdGgsXG5cdFx0XHRcdG9mZnNldFg6IG9mZnNldFxuXHRcdFx0fTtcblxuXHRcdFx0b2Zmc2V0IC09IGN0eC5sYXlvdXRJbmZvLmdseXBoTWFyZ2luTGVmdDtcblxuXHRcdFx0aWYgKG9mZnNldCA8PSBjdHgubGF5b3V0SW5mby5nbHlwaE1hcmdpbldpZHRoKSB7XG5cdFx0XHRcdC8vIE9uIHRoZSBnbHlwaCBtYXJnaW5cblx0XHRcdFx0Y29uc3QgbW9kZWxDb29yZGluYXRlID0gY3R4LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHJlcy5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRjb25zdCBsYW5lcyA9IGN0eC52aWV3TW9kZWwuZ2x5cGhMYW5lcy5nZXRMYW5lc0F0TGluZShtb2RlbENvb3JkaW5hdGUubGluZU51bWJlcik7XG5cdFx0XHRcdGRldGFpbC5nbHlwaE1hcmdpbkxhbmUgPSBsYW5lc1tNYXRoLmZsb29yKG9mZnNldCAvIGN0eC5saW5lSGVpZ2h0KV07XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxNYXJnaW4oTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU4sIHBvcywgcmVzLnJhbmdlLCBkZXRhaWwpO1xuXHRcdFx0fVxuXHRcdFx0b2Zmc2V0IC09IGN0eC5sYXlvdXRJbmZvLmdseXBoTWFyZ2luV2lkdGg7XG5cblx0XHRcdGlmIChvZmZzZXQgPD0gY3R4LmxheW91dEluZm8ubGluZU51bWJlcnNXaWR0aCkge1xuXHRcdFx0XHQvLyBPbiB0aGUgbGluZSBudW1iZXJzXG5cdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxNYXJnaW4oTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9MSU5FX05VTUJFUlMsIHBvcywgcmVzLnJhbmdlLCBkZXRhaWwpO1xuXHRcdFx0fVxuXHRcdFx0b2Zmc2V0IC09IGN0eC5sYXlvdXRJbmZvLmxpbmVOdW1iZXJzV2lkdGg7XG5cblx0XHRcdC8vIE9uIHRoZSBsaW5lIGRlY29yYXRpb25zXG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsTWFyZ2luKE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUywgcG9zLCByZXMucmFuZ2UsIGRldGFpbCk7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RWaWV3TGluZXMoY3R4OiBIaXRUZXN0Q29udGV4dCwgcmVxdWVzdDogUmVzb2x2ZWRIaXRUZXN0UmVxdWVzdCk6IElNb3VzZVRhcmdldCB8IG51bGwge1xuXHRcdGlmICghRWxlbWVudFBhdGguaXNDaGlsZE9mVmlld0xpbmVzKHJlcXVlc3QudGFyZ2V0UGF0aCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChjdHguaXNJblRvcFBhZGRpbmcocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KSkge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRFbXB0eShuZXcgUG9zaXRpb24oMSwgMSksIEVNUFRZX0NPTlRFTlRfQUZURVJfTElORVMpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGl0IGlzIGJlbG93IGFueSBsaW5lcyBhbmQgYW55IHZpZXcgem9uZXNcblx0XHRpZiAoY3R4LmlzQWZ0ZXJMaW5lcyhyZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQpIHx8IGN0eC5pc0luQm90dG9tUGFkZGluZyhyZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQpKSB7XG5cdFx0XHQvLyBUaGlzIG1vc3QgbGlrZWx5IGluZGljYXRlcyBpdCBoYXBwZW5lZCBhZnRlciB0aGUgbGFzdCB2aWV3LWxpbmVcblx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IGN0eC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRjb25zdCBtYXhMaW5lQ29sdW1uID0gY3R4LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVDb3VudCk7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudEVtcHR5KG5ldyBQb3NpdGlvbihsaW5lQ291bnQsIG1heExpbmVDb2x1bW4pLCBFTVBUWV9DT05URU5UX0FGVEVSX0xJTkVTKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB3ZSBhcmUgaGl0dGluZyBhIHZpZXctbGluZSAoY2FuIGhhcHBlbiBpbiB0aGUgY2FzZSBvZiBpbmxpbmUgZGVjb3JhdGlvbnMgb24gZW1wdHkgbGluZXMpXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80Njk0MlxuXHRcdGlmIChFbGVtZW50UGF0aC5pc1N0cmljdENoaWxkT2ZWaWV3TGluZXMocmVxdWVzdC50YXJnZXRQYXRoKSkge1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGN0eC5nZXRMaW5lTnVtYmVyQXRWZXJ0aWNhbE9mZnNldChyZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHRcdFx0Y29uc3QgbGluZUxlbmd0aCA9IGN0eC52aWV3TW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxpbmVXaWR0aCA9IGN0eC5nZXRMaW5lV2lkdGgobGluZU51bWJlcik7XG5cdFx0XHRpZiAobGluZUxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb25zdCBkZXRhaWwgPSBjcmVhdGVFbXB0eUNvbnRlbnREYXRhSW5MaW5lcyhyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgLSBsaW5lV2lkdGgpO1xuXHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudEVtcHR5KG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAxKSwgZGV0YWlsKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNSdGwgPSBjdHguaXNSdGwobGluZU51bWJlcik7XG5cdFx0XHRpZiAoaXNSdGwpIHtcblx0XHRcdFx0aWYgKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCArIGxpbmVXaWR0aCA8PSBjdHgubGF5b3V0SW5mby5jb250ZW50V2lkdGggLSBjdHgubGF5b3V0SW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGV0YWlsID0gY3JlYXRlRW1wdHlDb250ZW50RGF0YUluTGluZXMocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0IC0gbGluZVdpZHRoKTtcblx0XHRcdFx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY3R4LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudEVtcHR5KHBvcywgZGV0YWlsKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgPj0gbGluZVdpZHRoKSB7XG5cdFx0XHRcdGNvbnN0IGRldGFpbCA9IGNyZWF0ZUVtcHR5Q29udGVudERhdGFJbkxpbmVzKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAtIGxpbmVXaWR0aCk7XG5cdFx0XHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjdHgudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpO1xuXHRcdFx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudEVtcHR5KHBvcywgZGV0YWlsKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGN0eC52aWV3TGluZXNHcHUpIHtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGN0eC5nZXRMaW5lTnVtYmVyQXRWZXJ0aWNhbE9mZnNldChyZXF1ZXN0Lm1vdXNlVmVydGljYWxPZmZzZXQpO1xuXHRcdFx0XHRpZiAoY3R4LnZpZXdNb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpID09PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZVdpZHRoID0gY3R4LmdldExpbmVXaWR0aChsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSBjcmVhdGVFbXB0eUNvbnRlbnREYXRhSW5MaW5lcyhyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgLSBsaW5lV2lkdGgpO1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50RW1wdHkobmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpLCBkZXRhaWwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGluZVdpZHRoID0gY3R4LmdldExpbmVXaWR0aChsaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3QgaXNSdGwgPSBjdHguaXNSdGwobGluZU51bWJlcik7XG5cdFx0XHRcdGlmIChpc1J0bCkge1xuXHRcdFx0XHRcdGlmIChyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgKyBsaW5lV2lkdGggPD0gY3R4LmxheW91dEluZm8uY29udGVudFdpZHRoIC0gY3R4LmxheW91dEluZm8udmVydGljYWxTY3JvbGxiYXJXaWR0aCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGV0YWlsID0gY3JlYXRlRW1wdHlDb250ZW50RGF0YUluTGluZXMocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0IC0gbGluZVdpZHRoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjdHgudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRFbXB0eShwb3MsIGRldGFpbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA+PSBsaW5lV2lkdGgpIHtcblx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSBjcmVhdGVFbXB0eUNvbnRlbnREYXRhSW5MaW5lcyhyZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQgLSBsaW5lV2lkdGgpO1xuXHRcdFx0XHRcdGNvbnN0IHBvcyA9IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjdHgudmlld01vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpO1xuXHRcdFx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50RW1wdHkocG9zLCBkZXRhaWwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBjdHgudmlld0xpbmVzR3B1LmdldFBvc2l0aW9uQXRDb29yZGluYXRlKGxpbmVOdW1iZXIsIHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCk7XG5cdFx0XHRcdGlmIChwb3NpdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGRldGFpbDogSU1vdXNlVGFyZ2V0Q29udGVudFRleHREYXRhID0ge1xuXHRcdFx0XHRcdFx0aW5qZWN0ZWRUZXh0OiBudWxsLFxuXHRcdFx0XHRcdFx0bWlnaHRCZUZvcmVpZ25FbGVtZW50OiBmYWxzZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRUZXh0KHBvc2l0aW9uLCBFZGl0b3JSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uLCBwb3NpdGlvbiksIGRldGFpbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEbyB0aGUgaGl0IHRlc3QgKGlmIG5vdCBhbHJlYWR5IGRvbmUpXG5cdFx0Y29uc3QgaGl0VGVzdFJlc3VsdCA9IHJlcXVlc3QuaGl0VGVzdFJlc3VsdC52YWx1ZTtcblxuXHRcdGlmIChoaXRUZXN0UmVzdWx0LnR5cGUgPT09IEhpdFRlc3RSZXN1bHRUeXBlLkNvbnRlbnQpIHtcblx0XHRcdHJldHVybiBNb3VzZVRhcmdldEZhY3RvcnkuY3JlYXRlTW91c2VUYXJnZXRGcm9tSGl0VGVzdFBvc2l0aW9uKGN0eCwgcmVxdWVzdCwgaGl0VGVzdFJlc3VsdC5zcGFuTm9kZSwgaGl0VGVzdFJlc3VsdC5wb3NpdGlvbiwgaGl0VGVzdFJlc3VsdC5pbmplY3RlZFRleHQpO1xuXHRcdH1cblxuXHRcdC8vIFdlIGRpZG4ndCBoaXQgY29udGVudC4uLlxuXHRcdGlmIChyZXF1ZXN0LndvdWxkQmVuZWZpdEZyb21IaXRUZXN0VGFyZ2V0U3dpdGNoKSB7XG5cdFx0XHQvLyBXZSBhY3R1YWxseSBoaXQgc29tZXRoaW5nIGRpZmZlcmVudC4uLiBHaXZlIGl0IG9uZSBsYXN0IGNoYW5nZSBieSB0cnlpbmcgYWdhaW4gd2l0aCB0aGlzIG5ldyB0YXJnZXRcblx0XHRcdHJlcXVlc3Quc3dpdGNoVG9IaXRUZXN0VGFyZ2V0KCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlTW91c2VUYXJnZXQoY3R4LCByZXF1ZXN0KTtcblx0XHR9XG5cblx0XHQvLyBXZSBoYXZlIHRyaWVkIGV2ZXJ5dGhpbmcuLi5cblx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsVW5rbm93bigpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hpdFRlc3RNaW5pbWFwKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHRpZiAoRWxlbWVudFBhdGguaXNDaGlsZE9mTWluaW1hcChyZXF1ZXN0LnRhcmdldFBhdGgpKSB7XG5cdFx0XHRjb25zdCBwb3NzaWJsZUxpbmVOdW1iZXIgPSBjdHguZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdGNvbnN0IG1heENvbHVtbiA9IGN0eC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NzaWJsZUxpbmVOdW1iZXIpO1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFNjcm9sbGJhcihuZXcgUG9zaXRpb24ocG9zc2libGVMaW5lTnVtYmVyLCBtYXhDb2x1bW4pKTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaGl0VGVzdFNjcm9sbGJhclNsaWRlcihjdHg6IEhpdFRlc3RDb250ZXh0LCByZXF1ZXN0OiBSZXNvbHZlZEhpdFRlc3RSZXF1ZXN0KTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0aWYgKEVsZW1lbnRQYXRoLmlzQ2hpbGRPZlNjcm9sbGFibGVFbGVtZW50KHJlcXVlc3QudGFyZ2V0UGF0aCkpIHtcblx0XHRcdGlmIChyZXF1ZXN0LnRhcmdldCAmJiByZXF1ZXN0LnRhcmdldC5ub2RlVHlwZSA9PT0gMSkge1xuXHRcdFx0XHRjb25zdCBjbGFzc05hbWUgPSByZXF1ZXN0LnRhcmdldC5jbGFzc05hbWU7XG5cdFx0XHRcdGlmIChjbGFzc05hbWUgJiYgL1xcYihzbGlkZXJ8c2Nyb2xsYmFyKVxcYi8udGVzdChjbGFzc05hbWUpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zc2libGVMaW5lTnVtYmVyID0gY3R4LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cdFx0XHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gY3R4LnZpZXdNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc3NpYmxlTGluZU51bWJlcik7XG5cdFx0XHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFNjcm9sbGJhcihuZXcgUG9zaXRpb24ocG9zc2libGVMaW5lTnVtYmVyLCBtYXhDb2x1bW4pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9oaXRUZXN0U2Nyb2xsYmFyKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IFJlc29sdmVkSGl0VGVzdFJlcXVlc3QpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHQvLyBJcyBpdCB0aGUgb3ZlcnZpZXcgcnVsZXI/XG5cdFx0Ly8gSXMgaXQgYSBjaGlsZCBvZiB0aGUgc2Nyb2xsYWJsZSBlbGVtZW50P1xuXHRcdGlmIChFbGVtZW50UGF0aC5pc0NoaWxkT2ZTY3JvbGxhYmxlRWxlbWVudChyZXF1ZXN0LnRhcmdldFBhdGgpKSB7XG5cdFx0XHRjb25zdCBwb3NzaWJsZUxpbmVOdW1iZXIgPSBjdHguZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0XHRcdGNvbnN0IG1heENvbHVtbiA9IGN0eC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NzaWJsZUxpbmVOdW1iZXIpO1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbFNjcm9sbGJhcihuZXcgUG9zaXRpb24ocG9zc2libGVMaW5lTnVtYmVyLCBtYXhDb2x1bW4pKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRNb3VzZUNvbHVtbihyZWxhdGl2ZVBvczogQ29vcmRpbmF0ZXNSZWxhdGl2ZVRvRWRpdG9yKTogbnVtYmVyIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRjb25zdCBtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0ID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxMZWZ0KCkgKyByZWxhdGl2ZVBvcy54IC0gbGF5b3V0SW5mby5jb250ZW50TGVmdDtcblx0XHRyZXR1cm4gTW91c2VUYXJnZXRGYWN0b3J5Ll9nZXRNb3VzZUNvbHVtbihtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0LCBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIF9nZXRNb3VzZUNvbHVtbihtb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0OiBudW1iZXIsIHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAobW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA8IDApIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0XHRjb25zdCBjaGFycyA9IE1hdGgucm91bmQobW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAvIHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCk7XG5cdFx0cmV0dXJuIChjaGFycyArIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgY3JlYXRlTW91c2VUYXJnZXRGcm9tSGl0VGVzdFBvc2l0aW9uKGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IEhpdFRlc3RSZXF1ZXN0LCBzcGFuTm9kZTogSFRNTEVsZW1lbnQsIHBvczogUG9zaXRpb24sIGluamVjdGVkVGV4dDogSW5qZWN0ZWRUZXh0IHwgbnVsbCk6IElNb3VzZVRhcmdldCB7XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHBvcy5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGNvbHVtbiA9IHBvcy5jb2x1bW47XG5cblx0XHRjb25zdCBsaW5lV2lkdGggPSBjdHguZ2V0TGluZVdpZHRoKGxpbmVOdW1iZXIpO1xuXG5cdFx0aWYgKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA+IGxpbmVXaWR0aCkge1xuXHRcdFx0Y29uc3QgZGV0YWlsID0gY3JlYXRlRW1wdHlDb250ZW50RGF0YUluTGluZXMocmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0IC0gbGluZVdpZHRoKTtcblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxDb250ZW50RW1wdHkocG9zLCBkZXRhaWwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpc2libGVSYW5nZSA9IGN0eC52aXNpYmxlUmFuZ2VGb3JQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXG5cdFx0aWYgKCF2aXNpYmxlUmFuZ2UpIHtcblx0XHRcdHJldHVybiByZXF1ZXN0LmZ1bGZpbGxVbmtub3duKHBvcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29sdW1uSG9yaXpvbnRhbE9mZnNldCA9IHZpc2libGVSYW5nZS5sZWZ0O1xuXG5cdFx0aWYgKE1hdGguYWJzKHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCAtIGNvbHVtbkhvcml6b250YWxPZmZzZXQpIDwgMSkge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QuZnVsZmlsbENvbnRlbnRUZXh0KHBvcywgbnVsbCwgeyBtaWdodEJlRm9yZWlnbkVsZW1lbnQ6ICEhaW5qZWN0ZWRUZXh0LCBpbmplY3RlZFRleHQgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gTGV0J3MgZGVmaW5lIGEsIGIsIGMgYW5kIGNoZWNrIGlmIHRoZSBvZmZzZXQgaXMgaW4gYmV0d2VlbiB0aGVtLi4uXG5cdFx0aW50ZXJmYWNlIE9mZnNldENvbHVtbiB7IG9mZnNldDogbnVtYmVyOyBjb2x1bW46IG51bWJlciB9XG5cblx0XHRjb25zdCBwb2ludHM6IE9mZnNldENvbHVtbltdID0gW107XG5cdFx0cG9pbnRzLnB1c2goeyBvZmZzZXQ6IHZpc2libGVSYW5nZS5sZWZ0LCBjb2x1bW46IGNvbHVtbiB9KTtcblx0XHRpZiAoY29sdW1uID4gMSkge1xuXHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlID0gY3R4LnZpc2libGVSYW5nZUZvclBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbiAtIDEpO1xuXHRcdFx0aWYgKHZpc2libGVSYW5nZSkge1xuXHRcdFx0XHRwb2ludHMucHVzaCh7IG9mZnNldDogdmlzaWJsZVJhbmdlLmxlZnQsIGNvbHVtbjogY29sdW1uIC0gMSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbGluZU1heENvbHVtbiA9IGN0eC52aWV3TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRpZiAoY29sdW1uIDwgbGluZU1heENvbHVtbikge1xuXHRcdFx0Y29uc3QgdmlzaWJsZVJhbmdlID0gY3R4LnZpc2libGVSYW5nZUZvclBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbiArIDEpO1xuXHRcdFx0aWYgKHZpc2libGVSYW5nZSkge1xuXHRcdFx0XHRwb2ludHMucHVzaCh7IG9mZnNldDogdmlzaWJsZVJhbmdlLmxlZnQsIGNvbHVtbjogY29sdW1uICsgMSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwb2ludHMuc29ydCgoYSwgYikgPT4gYS5vZmZzZXQgLSBiLm9mZnNldCk7XG5cblx0XHRjb25zdCBtb3VzZUNvb3JkaW5hdGVzID0gcmVxdWVzdC5wb3MudG9DbGllbnRDb29yZGluYXRlcyhkb20uZ2V0V2luZG93KGN0eC52aWV3RG9tTm9kZSkpO1xuXHRcdGNvbnN0IHNwYW5Ob2RlQ2xpZW50UmVjdCA9IHNwYW5Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IG1vdXNlSXNPdmVyU3Bhbk5vZGUgPSAoc3Bhbk5vZGVDbGllbnRSZWN0LmxlZnQgPD0gbW91c2VDb29yZGluYXRlcy5jbGllbnRYICYmIG1vdXNlQ29vcmRpbmF0ZXMuY2xpZW50WCA8PSBzcGFuTm9kZUNsaWVudFJlY3QucmlnaHQpO1xuXG5cdFx0bGV0IHJuZzogRWRpdG9yUmFuZ2UgfCBudWxsID0gbnVsbDtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgcG9pbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwcmV2ID0gcG9pbnRzW2kgLSAxXTtcblx0XHRcdGNvbnN0IGN1cnIgPSBwb2ludHNbaV07XG5cdFx0XHRpZiAocHJldi5vZmZzZXQgPD0gcmVxdWVzdC5tb3VzZUNvbnRlbnRIb3Jpem9udGFsT2Zmc2V0ICYmIHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCA8PSBjdXJyLm9mZnNldCkge1xuXHRcdFx0XHRybmcgPSBuZXcgRWRpdG9yUmFuZ2UobGluZU51bWJlciwgcHJldi5jb2x1bW4sIGxpbmVOdW1iZXIsIGN1cnIuY29sdW1uKTtcblxuXHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE1MjgxOVxuXHRcdFx0XHQvLyBEdWUgdG8gdGhlIHVzZSBvZiB6d2osIHRoZSBicm93c2VyJ3MgaGl0IHRlc3QgcmVzdWx0IGlzIHNrZXdlZCB0b3dhcmRzIHRoZSBsZWZ0XG5cdFx0XHRcdC8vIEhlcmUgd2UgdHJ5IHRvIGNvcnJlY3QgdGhhdCBpZiB0aGUgbW91c2UgaG9yaXpvbnRhbCBvZmZzZXQgaXMgY2xvc2VyIHRvIHRoZSByaWdodCB0aGFuIHRoZSBsZWZ0XG5cblx0XHRcdFx0Y29uc3QgcHJldkRlbHRhID0gTWF0aC5hYnMocHJldi5vZmZzZXQgLSByZXF1ZXN0Lm1vdXNlQ29udGVudEhvcml6b250YWxPZmZzZXQpO1xuXHRcdFx0XHRjb25zdCBuZXh0RGVsdGEgPSBNYXRoLmFicyhjdXJyLm9mZnNldCAtIHJlcXVlc3QubW91c2VDb250ZW50SG9yaXpvbnRhbE9mZnNldCk7XG5cblx0XHRcdFx0cG9zID0gKFxuXHRcdFx0XHRcdHByZXZEZWx0YSA8IG5leHREZWx0YVxuXHRcdFx0XHRcdFx0PyBuZXcgUG9zaXRpb24obGluZU51bWJlciwgcHJldi5jb2x1bW4pXG5cdFx0XHRcdFx0XHQ6IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjdXJyLmNvbHVtbilcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVxdWVzdC5mdWxmaWxsQ29udGVudFRleHQocG9zLCBybmcsIHsgbWlnaHRCZUZvcmVpZ25FbGVtZW50OiAhbW91c2VJc092ZXJTcGFuTm9kZSB8fCAhIWluamVjdGVkVGV4dCwgaW5qZWN0ZWRUZXh0IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vc3QgcHJvYmFibHkgV2ViS2l0IGJyb3dzZXJzIGFuZCBFZGdlXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBfZG9IaXRUZXN0V2l0aENhcmV0UmFuZ2VGcm9tUG9pbnQoY3R4OiBIaXRUZXN0Q29udGV4dCwgcmVxdWVzdDogQmFyZUhpdFRlc3RSZXF1ZXN0KTogSGl0VGVzdFJlc3VsdCB7XG5cblx0XHQvLyBJbiBDaHJvbWUsIGVzcGVjaWFsbHkgb24gTGludXggaXQgaXMgcG9zc2libGUgdG8gY2xpY2sgYmV0d2VlbiBsaW5lcyxcblx0XHQvLyBzbyB0cnkgdG8gYWRqdXN0IHRoZSBgaGl0eWAgYmVsb3cgc28gdGhhdCBpdCBsYW5kcyBpbiB0aGUgY2VudGVyIG9mIGEgbGluZVxuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBjdHguZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQocmVxdWVzdC5tb3VzZVZlcnRpY2FsT2Zmc2V0KTtcblx0XHRjb25zdCBsaW5lU3RhcnRWZXJ0aWNhbE9mZnNldCA9IGN0eC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIobGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGluZUVuZFZlcnRpY2FsT2Zmc2V0ID0gbGluZVN0YXJ0VmVydGljYWxPZmZzZXQgKyBjdHgubGluZUhlaWdodDtcblxuXHRcdGNvbnN0IGlzQmVsb3dMYXN0TGluZSA9IChcblx0XHRcdGxpbmVOdW1iZXIgPT09IGN0eC52aWV3TW9kZWwuZ2V0TGluZUNvdW50KClcblx0XHRcdCYmIHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCA+IGxpbmVFbmRWZXJ0aWNhbE9mZnNldFxuXHRcdCk7XG5cblx0XHRpZiAoIWlzQmVsb3dMYXN0TGluZSkge1xuXHRcdFx0Y29uc3QgbGluZUNlbnRlcmVkVmVydGljYWxPZmZzZXQgPSBNYXRoLmZsb29yKChsaW5lU3RhcnRWZXJ0aWNhbE9mZnNldCArIGxpbmVFbmRWZXJ0aWNhbE9mZnNldCkgLyAyKTtcblx0XHRcdGxldCBhZGp1c3RlZFBhZ2VZID0gcmVxdWVzdC5wb3MueSArIChsaW5lQ2VudGVyZWRWZXJ0aWNhbE9mZnNldCAtIHJlcXVlc3QubW91c2VWZXJ0aWNhbE9mZnNldCk7XG5cblx0XHRcdGlmIChhZGp1c3RlZFBhZ2VZIDw9IHJlcXVlc3QuZWRpdG9yUG9zLnkpIHtcblx0XHRcdFx0YWRqdXN0ZWRQYWdlWSA9IHJlcXVlc3QuZWRpdG9yUG9zLnkgKyAxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFkanVzdGVkUGFnZVkgPj0gcmVxdWVzdC5lZGl0b3JQb3MueSArIHJlcXVlc3QuZWRpdG9yUG9zLmhlaWdodCkge1xuXHRcdFx0XHRhZGp1c3RlZFBhZ2VZID0gcmVxdWVzdC5lZGl0b3JQb3MueSArIHJlcXVlc3QuZWRpdG9yUG9zLmhlaWdodCAtIDE7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFkanVzdGVkUGFnZSA9IG5ldyBQYWdlQ29vcmRpbmF0ZXMocmVxdWVzdC5wb3MueCwgYWRqdXN0ZWRQYWdlWSk7XG5cblx0XHRcdGNvbnN0IHIgPSB0aGlzLl9hY3R1YWxEb0hpdFRlc3RXaXRoQ2FyZXRSYW5nZUZyb21Qb2ludChjdHgsIGFkanVzdGVkUGFnZS50b0NsaWVudENvb3JkaW5hdGVzKGRvbS5nZXRXaW5kb3coY3R4LnZpZXdEb21Ob2RlKSkpO1xuXHRcdFx0aWYgKHIudHlwZSA9PT0gSGl0VGVzdFJlc3VsdFR5cGUuQ29udGVudCkge1xuXHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBbHNvIHRyeSB0byBoaXQgdGVzdCB3aXRob3V0IHRoZSBhZGp1c3RtZW50IChmb3IgdGhlIGVkZ2UgY2FzZXMgdGhhdCB3ZSBhcmUgbmVhciB0aGUgdG9wIG9yIGJvdHRvbSlcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsRG9IaXRUZXN0V2l0aENhcmV0UmFuZ2VGcm9tUG9pbnQoY3R4LCByZXF1ZXN0LnBvcy50b0NsaWVudENvb3JkaW5hdGVzKGRvbS5nZXRXaW5kb3coY3R4LnZpZXdEb21Ob2RlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FjdHVhbERvSGl0VGVzdFdpdGhDYXJldFJhbmdlRnJvbVBvaW50KGN0eDogSGl0VGVzdENvbnRleHQsIGNvb3JkczogQ2xpZW50Q29vcmRpbmF0ZXMpOiBIaXRUZXN0UmVzdWx0IHtcblx0XHRjb25zdCBzaGFkb3dSb290ID0gZG9tLmdldFNoYWRvd1Jvb3QoY3R4LnZpZXdEb21Ob2RlKTtcblx0XHRsZXQgcmFuZ2U6IFJhbmdlO1xuXHRcdGlmIChzaGFkb3dSb290KSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdGlmICh0eXBlb2YgKDxhbnk+c2hhZG93Um9vdCkuY2FyZXRSYW5nZUZyb21Qb2ludCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0cmFuZ2UgPSBzaGFkb3dDYXJldFJhbmdlRnJvbVBvaW50KHNoYWRvd1Jvb3QsIGNvb3Jkcy5jbGllbnRYLCBjb29yZHMuY2xpZW50WSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0cmFuZ2UgPSAoPGFueT5zaGFkb3dSb290KS5jYXJldFJhbmdlRnJvbVBvaW50KGNvb3Jkcy5jbGllbnRYLCBjb29yZHMuY2xpZW50WSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0cmFuZ2UgPSAoPGFueT5jdHgudmlld0RvbU5vZGUub3duZXJEb2N1bWVudCkuY2FyZXRSYW5nZUZyb21Qb2ludChjb29yZHMuY2xpZW50WCwgY29vcmRzLmNsaWVudFkpO1xuXHRcdH1cblxuXHRcdGlmICghcmFuZ2UgfHwgIXJhbmdlLnN0YXJ0Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFVua25vd25IaXRUZXN0UmVzdWx0KCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hyb21lIGFsd2F5cyBoaXRzIGEgVEVYVF9OT0RFLCB3aGlsZSBFZGdlIHNvbWV0aW1lcyBoaXRzIGEgdG9rZW4gc3BhblxuXHRcdGNvbnN0IHN0YXJ0Q29udGFpbmVyID0gcmFuZ2Uuc3RhcnRDb250YWluZXI7XG5cblx0XHRpZiAoc3RhcnRDb250YWluZXIubm9kZVR5cGUgPT09IHN0YXJ0Q29udGFpbmVyLlRFWFRfTk9ERSkge1xuXHRcdFx0Ly8gc3RhcnRDb250YWluZXIgaXMgZXhwZWN0ZWQgdG8gYmUgdGhlIHRva2VuIHRleHRcblx0XHRcdGNvbnN0IHBhcmVudDEgPSBzdGFydENvbnRhaW5lci5wYXJlbnROb2RlOyAvLyBleHBlY3RlZCB0byBiZSB0aGUgdG9rZW4gc3BhblxuXHRcdFx0Y29uc3QgcGFyZW50MiA9IHBhcmVudDEgPyBwYXJlbnQxLnBhcmVudE5vZGUgOiBudWxsOyAvLyBleHBlY3RlZCB0byBiZSB0aGUgdmlldyBsaW5lIGNvbnRhaW5lciBzcGFuXG5cdFx0XHRjb25zdCBwYXJlbnQzID0gcGFyZW50MiA/IHBhcmVudDIucGFyZW50Tm9kZSA6IG51bGw7IC8vIGV4cGVjdGVkIHRvIGJlIHRoZSB2aWV3IGxpbmUgZGl2XG5cdFx0XHRjb25zdCBwYXJlbnQzQ2xhc3NOYW1lID0gcGFyZW50MyAmJiBwYXJlbnQzLm5vZGVUeXBlID09PSBwYXJlbnQzLkVMRU1FTlRfTk9ERSA/ICg8SFRNTEVsZW1lbnQ+cGFyZW50MykuY2xhc3NOYW1lIDogbnVsbDtcblxuXHRcdFx0aWYgKHBhcmVudDNDbGFzc05hbWUgPT09IFZpZXdMaW5lLkNMQVNTX05BTUUpIHtcblx0XHRcdFx0cmV0dXJuIEhpdFRlc3RSZXN1bHQuY3JlYXRlRnJvbURPTUluZm8oY3R4LCA8SFRNTEVsZW1lbnQ+cGFyZW50MSwgcmFuZ2Uuc3RhcnRPZmZzZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBVbmtub3duSGl0VGVzdFJlc3VsdCg8SFRNTEVsZW1lbnQ+c3RhcnRDb250YWluZXIucGFyZW50Tm9kZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChzdGFydENvbnRhaW5lci5ub2RlVHlwZSA9PT0gc3RhcnRDb250YWluZXIuRUxFTUVOVF9OT0RFKSB7XG5cdFx0XHQvLyBzdGFydENvbnRhaW5lciBpcyBleHBlY3RlZCB0byBiZSB0aGUgdG9rZW4gc3BhblxuXHRcdFx0Y29uc3QgcGFyZW50MSA9IHN0YXJ0Q29udGFpbmVyLnBhcmVudE5vZGU7IC8vIGV4cGVjdGVkIHRvIGJlIHRoZSB2aWV3IGxpbmUgY29udGFpbmVyIHNwYW5cblx0XHRcdGNvbnN0IHBhcmVudDIgPSBwYXJlbnQxID8gcGFyZW50MS5wYXJlbnROb2RlIDogbnVsbDsgLy8gZXhwZWN0ZWQgdG8gYmUgdGhlIHZpZXcgbGluZSBkaXZcblx0XHRcdGNvbnN0IHBhcmVudDJDbGFzc05hbWUgPSBwYXJlbnQyICYmIHBhcmVudDIubm9kZVR5cGUgPT09IHBhcmVudDIuRUxFTUVOVF9OT0RFID8gKDxIVE1MRWxlbWVudD5wYXJlbnQyKS5jbGFzc05hbWUgOiBudWxsO1xuXG5cdFx0XHRpZiAocGFyZW50MkNsYXNzTmFtZSA9PT0gVmlld0xpbmUuQ0xBU1NfTkFNRSkge1xuXHRcdFx0XHRyZXR1cm4gSGl0VGVzdFJlc3VsdC5jcmVhdGVGcm9tRE9NSW5mbyhjdHgsIDxIVE1MRWxlbWVudD5zdGFydENvbnRhaW5lciwgKDxIVE1MRWxlbWVudD5zdGFydENvbnRhaW5lcikudGV4dENvbnRlbnQubGVuZ3RoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgVW5rbm93bkhpdFRlc3RSZXN1bHQoPEhUTUxFbGVtZW50PnN0YXJ0Q29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFVua25vd25IaXRUZXN0UmVzdWx0KCk7XG5cdH1cblxuXHQvKipcblx0ICogTW9zdCBwcm9iYWJseSBHZWNrb1xuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgX2RvSGl0VGVzdFdpdGhDYXJldFBvc2l0aW9uRnJvbVBvaW50KGN0eDogSGl0VGVzdENvbnRleHQsIGNvb3JkczogQ2xpZW50Q29vcmRpbmF0ZXMpOiBIaXRUZXN0UmVzdWx0IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRjb25zdCBoaXRSZXN1bHQ6IHsgb2Zmc2V0Tm9kZTogTm9kZTsgb2Zmc2V0OiBudW1iZXIgfSA9ICg8YW55PmN0eC52aWV3RG9tTm9kZS5vd25lckRvY3VtZW50KS5jYXJldFBvc2l0aW9uRnJvbVBvaW50KGNvb3Jkcy5jbGllbnRYLCBjb29yZHMuY2xpZW50WSk7XG5cblx0XHRpZiAoaGl0UmVzdWx0Lm9mZnNldE5vZGUubm9kZVR5cGUgPT09IGhpdFJlc3VsdC5vZmZzZXROb2RlLlRFWFRfTk9ERSkge1xuXHRcdFx0Ly8gb2Zmc2V0Tm9kZSBpcyBleHBlY3RlZCB0byBiZSB0aGUgdG9rZW4gdGV4dFxuXHRcdFx0Y29uc3QgcGFyZW50MSA9IGhpdFJlc3VsdC5vZmZzZXROb2RlLnBhcmVudE5vZGU7IC8vIGV4cGVjdGVkIHRvIGJlIHRoZSB0b2tlbiBzcGFuXG5cdFx0XHRjb25zdCBwYXJlbnQyID0gcGFyZW50MSA/IHBhcmVudDEucGFyZW50Tm9kZSA6IG51bGw7IC8vIGV4cGVjdGVkIHRvIGJlIHRoZSB2aWV3IGxpbmUgY29udGFpbmVyIHNwYW5cblx0XHRcdGNvbnN0IHBhcmVudDMgPSBwYXJlbnQyID8gcGFyZW50Mi5wYXJlbnROb2RlIDogbnVsbDsgLy8gZXhwZWN0ZWQgdG8gYmUgdGhlIHZpZXcgbGluZSBkaXZcblx0XHRcdGNvbnN0IHBhcmVudDNDbGFzc05hbWUgPSBwYXJlbnQzICYmIHBhcmVudDMubm9kZVR5cGUgPT09IHBhcmVudDMuRUxFTUVOVF9OT0RFID8gKDxIVE1MRWxlbWVudD5wYXJlbnQzKS5jbGFzc05hbWUgOiBudWxsO1xuXG5cdFx0XHRpZiAocGFyZW50M0NsYXNzTmFtZSA9PT0gVmlld0xpbmUuQ0xBU1NfTkFNRSkge1xuXHRcdFx0XHRyZXR1cm4gSGl0VGVzdFJlc3VsdC5jcmVhdGVGcm9tRE9NSW5mbyhjdHgsIDxIVE1MRWxlbWVudD5oaXRSZXN1bHQub2Zmc2V0Tm9kZS5wYXJlbnROb2RlLCBoaXRSZXN1bHQub2Zmc2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgVW5rbm93bkhpdFRlc3RSZXN1bHQoPEhUTUxFbGVtZW50PmhpdFJlc3VsdC5vZmZzZXROb2RlLnBhcmVudE5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZvciBpbmxpbmUgZGVjb3JhdGlvbnMsIEdlY2tvIHNvbWV0aW1lcyByZXR1cm5zIHRoZSBgPHNwYW4+YCBvZiB0aGUgbGluZSBhbmQgdGhlIG9mZnNldCBpcyB0aGUgYDxzcGFuPmAgd2l0aCB0aGUgaW5saW5lIGRlY29yYXRpb25cblx0XHQvLyBTb21lIG90aGVyIHRpbWVzLCBpdCByZXR1cm5zIHRoZSBgPHNwYW4+YCB3aXRoIHRoZSBpbmxpbmUgZGVjb3JhdGlvblxuXHRcdGlmIChoaXRSZXN1bHQub2Zmc2V0Tm9kZS5ub2RlVHlwZSA9PT0gaGl0UmVzdWx0Lm9mZnNldE5vZGUuRUxFTUVOVF9OT0RFKSB7XG5cdFx0XHRjb25zdCBwYXJlbnQxID0gaGl0UmVzdWx0Lm9mZnNldE5vZGUucGFyZW50Tm9kZTtcblx0XHRcdGNvbnN0IHBhcmVudDFDbGFzc05hbWUgPSBwYXJlbnQxICYmIHBhcmVudDEubm9kZVR5cGUgPT09IHBhcmVudDEuRUxFTUVOVF9OT0RFID8gKDxIVE1MRWxlbWVudD5wYXJlbnQxKS5jbGFzc05hbWUgOiBudWxsO1xuXHRcdFx0Y29uc3QgcGFyZW50MiA9IHBhcmVudDEgPyBwYXJlbnQxLnBhcmVudE5vZGUgOiBudWxsO1xuXHRcdFx0Y29uc3QgcGFyZW50MkNsYXNzTmFtZSA9IHBhcmVudDIgJiYgcGFyZW50Mi5ub2RlVHlwZSA9PT0gcGFyZW50Mi5FTEVNRU5UX05PREUgPyAoPEhUTUxFbGVtZW50PnBhcmVudDIpLmNsYXNzTmFtZSA6IG51bGw7XG5cblx0XHRcdGlmIChwYXJlbnQxQ2xhc3NOYW1lID09PSBWaWV3TGluZS5DTEFTU19OQU1FKSB7XG5cdFx0XHRcdC8vIGl0IHJldHVybmVkIHRoZSBgPHNwYW4+YCBvZiB0aGUgbGluZSBhbmQgdGhlIG9mZnNldCBpcyB0aGUgYDxzcGFuPmAgd2l0aCB0aGUgaW5saW5lIGRlY29yYXRpb25cblx0XHRcdFx0Y29uc3QgdG9rZW5TcGFuID0gaGl0UmVzdWx0Lm9mZnNldE5vZGUuY2hpbGROb2Rlc1tNYXRoLm1pbihoaXRSZXN1bHQub2Zmc2V0LCBoaXRSZXN1bHQub2Zmc2V0Tm9kZS5jaGlsZE5vZGVzLmxlbmd0aCAtIDEpXTtcblx0XHRcdFx0aWYgKHRva2VuU3Bhbikge1xuXHRcdFx0XHRcdHJldHVybiBIaXRUZXN0UmVzdWx0LmNyZWF0ZUZyb21ET01JbmZvKGN0eCwgPEhUTUxFbGVtZW50PnRva2VuU3BhbiwgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocGFyZW50MkNsYXNzTmFtZSA9PT0gVmlld0xpbmUuQ0xBU1NfTkFNRSkge1xuXHRcdFx0XHQvLyBpdCByZXR1cm5lZCB0aGUgYDxzcGFuPmAgd2l0aCB0aGUgaW5saW5lIGRlY29yYXRpb25cblx0XHRcdFx0cmV0dXJuIEhpdFRlc3RSZXN1bHQuY3JlYXRlRnJvbURPTUluZm8oY3R4LCA8SFRNTEVsZW1lbnQ+aGl0UmVzdWx0Lm9mZnNldE5vZGUsIDApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgVW5rbm93bkhpdFRlc3RSZXN1bHQoPEhUTUxFbGVtZW50PmhpdFJlc3VsdC5vZmZzZXROb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zbmFwVG9Tb2Z0VGFiQm91bmRhcnkocG9zaXRpb246IFBvc2l0aW9uLCB2aWV3TW9kZWw6IElWaWV3TW9kZWwpOiBQb3NpdGlvbiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB2aWV3TW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgeyB0YWJTaXplIH0gPSB2aWV3TW9kZWwubW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdGNvbnN0IG5ld1Bvc2l0aW9uID0gQXRvbWljVGFiTW92ZU9wZXJhdGlvbnMuYXRvbWljUG9zaXRpb24obGluZUNvbnRlbnQsIHBvc2l0aW9uLmNvbHVtbiAtIDEsIHRhYlNpemUsIERpcmVjdGlvbi5OZWFyZXN0KTtcblx0XHRpZiAobmV3UG9zaXRpb24gIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIG5ld1Bvc2l0aW9uICsgMSk7XG5cdFx0fVxuXHRcdHJldHVybiBwb3NpdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZG9IaXRUZXN0KGN0eDogSGl0VGVzdENvbnRleHQsIHJlcXVlc3Q6IEJhcmVIaXRUZXN0UmVxdWVzdCk6IEhpdFRlc3RSZXN1bHQge1xuXG5cdFx0bGV0IHJlc3VsdDogSGl0VGVzdFJlc3VsdCA9IG5ldyBVbmtub3duSGl0VGVzdFJlc3VsdCgpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGlmICh0eXBlb2YgKDxhbnk+Y3R4LnZpZXdEb21Ob2RlLm93bmVyRG9jdW1lbnQpLmNhcmV0UmFuZ2VGcm9tUG9pbnQgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJlc3VsdCA9IHRoaXMuX2RvSGl0VGVzdFdpdGhDYXJldFJhbmdlRnJvbVBvaW50KGN0eCwgcmVxdWVzdCk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHR9IGVsc2UgaWYgKCg8YW55PmN0eC52aWV3RG9tTm9kZS5vd25lckRvY3VtZW50KS5jYXJldFBvc2l0aW9uRnJvbVBvaW50KSB7XG5cdFx0XHRyZXN1bHQgPSB0aGlzLl9kb0hpdFRlc3RXaXRoQ2FyZXRQb3NpdGlvbkZyb21Qb2ludChjdHgsIHJlcXVlc3QucG9zLnRvQ2xpZW50Q29vcmRpbmF0ZXMoZG9tLmdldFdpbmRvdyhjdHgudmlld0RvbU5vZGUpKSk7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQudHlwZSA9PT0gSGl0VGVzdFJlc3VsdFR5cGUuQ29udGVudCkge1xuXHRcdFx0Y29uc3QgaW5qZWN0ZWRUZXh0ID0gY3R4LnZpZXdNb2RlbC5nZXRJbmplY3RlZFRleHRBdChyZXN1bHQucG9zaXRpb24pO1xuXG5cdFx0XHRjb25zdCBub3JtYWxpemVkUG9zaXRpb24gPSBjdHgudmlld01vZGVsLm5vcm1hbGl6ZVBvc2l0aW9uKHJlc3VsdC5wb3NpdGlvbiwgUG9zaXRpb25BZmZpbml0eS5Ob25lKTtcblx0XHRcdGlmIChpbmplY3RlZFRleHQgfHwgIW5vcm1hbGl6ZWRQb3NpdGlvbi5lcXVhbHMocmVzdWx0LnBvc2l0aW9uKSkge1xuXHRcdFx0XHRyZXN1bHQgPSBuZXcgQ29udGVudEhpdFRlc3RSZXN1bHQobm9ybWFsaXplZFBvc2l0aW9uLCByZXN1bHQuc3Bhbk5vZGUsIGluamVjdGVkVGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gc2hhZG93Q2FyZXRSYW5nZUZyb21Qb2ludChzaGFkb3dSb290OiBTaGFkb3dSb290LCB4OiBudW1iZXIsIHk6IG51bWJlcik6IFJhbmdlIHtcblx0Y29uc3QgcmFuZ2UgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuXG5cdC8vIEdldCB0aGUgZWxlbWVudCB1bmRlciB0aGUgcG9pbnRcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGxldCBlbDogSFRNTEVsZW1lbnQgfCBudWxsID0gKDxhbnk+c2hhZG93Um9vdCkuZWxlbWVudEZyb21Qb2ludCh4LCB5KTtcblx0Ly8gV2hlbiBlbCBpcyBub3QgbnVsbCwgaXQgbWF5IGJlIGRpdi5tb25hY28tbW91c2UtY3Vyc29yLXRleHQgRWxlbWVudCwgd2hpY2ggaGFzIG5vdCBjaGlsZE5vZGVzLCB3ZSBkb24ndCBuZWVkIHRvIGhhbmRsZSBpdC5cblx0aWYgKGVsPy5oYXNDaGlsZE5vZGVzKCkpIHtcblx0XHQvLyBHZXQgdGhlIGxhc3QgY2hpbGQgb2YgdGhlIGVsZW1lbnQgdW50aWwgaXRzIGZpcnN0Q2hpbGQgaXMgYSB0ZXh0IG5vZGVcblx0XHQvLyBUaGlzIGFzc3VtZXMgdGhhdCB0aGUgcG9pbnRlciBpcyBvbiB0aGUgcmlnaHQgb2YgdGhlIGxpbmUsIG91dCBvZiB0aGUgdG9rZW5zXG5cdFx0Ly8gYW5kIHRoYXQgd2Ugd2FudCB0byBnZXQgdGhlIG9mZnNldCBvZiB0aGUgbGFzdCB0b2tlbiBvZiB0aGUgbGluZVxuXHRcdHdoaWxlIChlbCAmJiBlbC5maXJzdENoaWxkICYmIGVsLmZpcnN0Q2hpbGQubm9kZVR5cGUgIT09IGVsLmZpcnN0Q2hpbGQuVEVYVF9OT0RFICYmIGVsLmxhc3RDaGlsZCAmJiBlbC5sYXN0Q2hpbGQuZmlyc3RDaGlsZCkge1xuXHRcdFx0ZWwgPSA8SFRNTEVsZW1lbnQ+ZWwubGFzdENoaWxkO1xuXHRcdH1cblxuXHRcdC8vIEdyYWIgaXRzIHJlY3Rcblx0XHRjb25zdCByZWN0ID0gZWwuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cblx0XHQvLyBBbmQgaXRzIGZvbnQgKHRoZSBjb21wdXRlZCBzaG9ydGhhbmQgZm9udCBwcm9wZXJ0eSBtaWdodCBiZSBlbXB0eSwgc2VlICMzMjE3KVxuXHRcdGNvbnN0IGVsV2luZG93ID0gZG9tLmdldFdpbmRvdyhlbCk7XG5cdFx0Y29uc3QgY29tcHV0ZWRTdHlsZSA9IGVsV2luZG93LmdldENvbXB1dGVkU3R5bGUoZWwsIG51bGwpO1xuXHRcdGNvbnN0IGZvbnRTdHlsZSA9IGNvbXB1dGVkU3R5bGUuZ2V0UHJvcGVydHlWYWx1ZSgnZm9udC1zdHlsZScpO1xuXHRcdGNvbnN0IGZvbnRWYXJpYW50ID0gY29tcHV0ZWRTdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCdmb250LXZhcmlhbnQnKTtcblx0XHRjb25zdCBmb250V2VpZ2h0ID0gY29tcHV0ZWRTdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCdmb250LXdlaWdodCcpO1xuXHRcdGNvbnN0IGZvbnRTaXplID0gY29tcHV0ZWRTdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCdmb250LXNpemUnKTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gY29tcHV0ZWRTdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKCdsaW5lLWhlaWdodCcpO1xuXHRcdGNvbnN0IGZvbnRGYW1pbHkgPSBjb21wdXRlZFN0eWxlLmdldFByb3BlcnR5VmFsdWUoJ2ZvbnQtZmFtaWx5Jyk7XG5cdFx0Y29uc3QgZm9udCA9IGAke2ZvbnRTdHlsZX0gJHtmb250VmFyaWFudH0gJHtmb250V2VpZ2h0fSAke2ZvbnRTaXplfS8ke2xpbmVIZWlnaHR9ICR7Zm9udEZhbWlseX1gO1xuXG5cdFx0Ly8gQW5kIGFsc28gaXRzIHR4dCBjb250ZW50XG5cdFx0Y29uc3QgdGV4dCA9IGVsLmlubmVyVGV4dDtcblxuXHRcdC8vIFBvc2l0aW9uIHRoZSBwaXhlbCBjdXJzb3IgYXQgdGhlIGxlZnQgb2YgdGhlIGVsZW1lbnRcblx0XHRsZXQgcGl4ZWxDdXJzb3IgPSByZWN0LmxlZnQ7XG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0bGV0IHN0ZXA6IG51bWJlcjtcblxuXHRcdC8vIElmIHRoZSBwb2ludCBpcyBvbiB0aGUgcmlnaHQgb2YgdGhlIGJveCBwdXQgdGhlIGN1cnNvciBhZnRlciB0aGUgbGFzdCBjaGFyYWN0ZXJcblx0XHRpZiAoeCA+IHJlY3QubGVmdCArIHJlY3Qud2lkdGgpIHtcblx0XHRcdG9mZnNldCA9IHRleHQubGVuZ3RoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjaGFyV2lkdGhSZWFkZXIgPSBDaGFyV2lkdGhSZWFkZXIuZ2V0SW5zdGFuY2UoKTtcblx0XHRcdC8vIEdvZXMgdGhyb3VnaCBhbGwgdGhlIGNoYXJhY3RlcnMgb2YgdGhlIGlubmVyVGV4dCwgYW5kIGNoZWNrcyBpZiB0aGUgeCBvZiB0aGUgcG9pbnRcblx0XHRcdC8vIGJlbG9uZ3MgdG8gdGhlIGNoYXJhY3Rlci5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGggKyAxOyBpKyspIHtcblx0XHRcdFx0Ly8gVGhlIHN0ZXAgaXMgaGFsZiB0aGUgd2lkdGggb2YgdGhlIGNoYXJhY3RlclxuXHRcdFx0XHRzdGVwID0gY2hhcldpZHRoUmVhZGVyLmdldENoYXJXaWR0aCh0ZXh0LmNoYXJBdChpKSwgZm9udCkgLyAyO1xuXHRcdFx0XHQvLyBNb3ZlIHRvIHRoZSBjZW50ZXIgb2YgdGhlIGNoYXJhY3RlclxuXHRcdFx0XHRwaXhlbEN1cnNvciArPSBzdGVwO1xuXHRcdFx0XHQvLyBJZiB0aGUgeCBvZiB0aGUgcG9pbnQgaXMgc21hbGxlciB0aGF0IHRoZSBwb3NpdGlvbiBvZiB0aGUgY3Vyc29yLCB0aGUgcG9pbnQgaXMgb3ZlciB0aGF0IGNoYXJhY3RlclxuXHRcdFx0XHRpZiAoeCA8IHBpeGVsQ3Vyc29yKSB7XG5cdFx0XHRcdFx0b2Zmc2V0ID0gaTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBNb3ZlIGJldHdlZW4gdGhlIGN1cnJlbnQgY2hhcmFjdGVyIGFuZCB0aGUgbmV4dFxuXHRcdFx0XHRwaXhlbEN1cnNvciArPSBzdGVwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENyZWF0ZXMgYSByYW5nZSB3aXRoIHRoZSB0ZXh0IG5vZGUgb2YgdGhlIGVsZW1lbnQgYW5kIHNldCB0aGUgb2Zmc2V0IGZvdW5kXG5cdFx0cmFuZ2Uuc2V0U3RhcnQoZWwuZmlyc3RDaGlsZCEsIG9mZnNldCk7XG5cdFx0cmFuZ2Uuc2V0RW5kKGVsLmZpcnN0Q2hpbGQhLCBvZmZzZXQpO1xuXHR9XG5cblx0cmV0dXJuIHJhbmdlO1xufVxuXG5jbGFzcyBDaGFyV2lkdGhSZWFkZXIge1xuXHRwcml2YXRlIHN0YXRpYyBfSU5TVEFOQ0U6IENoYXJXaWR0aFJlYWRlciB8IG51bGwgPSBudWxsO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogQ2hhcldpZHRoUmVhZGVyIHtcblx0XHRpZiAoIUNoYXJXaWR0aFJlYWRlci5fSU5TVEFOQ0UpIHtcblx0XHRcdENoYXJXaWR0aFJlYWRlci5fSU5TVEFOQ0UgPSBuZXcgQ2hhcldpZHRoUmVhZGVyKCk7XG5cdFx0fVxuXHRcdHJldHVybiBDaGFyV2lkdGhSZWFkZXIuX0lOU1RBTkNFO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGU6IHsgW2NhY2hlS2V5OiBzdHJpbmddOiBudW1iZXIgfTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FudmFzOiBIVE1MQ2FudmFzRWxlbWVudDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2NhY2hlID0ge307XG5cdFx0dGhpcy5fY2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2hhcldpZHRoKGNoYXI6IHN0cmluZywgZm9udDogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRjb25zdCBjYWNoZUtleSA9IGNoYXIgKyBmb250O1xuXHRcdGlmICh0aGlzLl9jYWNoZVtjYWNoZUtleV0pIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYWNoZVtjYWNoZUtleV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2NhbnZhcy5nZXRDb250ZXh0KCcyZCcpITtcblx0XHRjb250ZXh0LmZvbnQgPSBmb250O1xuXHRcdGNvbnN0IG1ldHJpY3MgPSBjb250ZXh0Lm1lYXN1cmVUZXh0KGNoYXIpO1xuXHRcdGNvbnN0IHdpZHRoID0gbWV0cmljcy53aWR0aDtcblx0XHR0aGlzLl9jYWNoZVtjYWNoZUtleV0gPSB3aWR0aDtcblx0XHRyZXR1cm4gd2lkdGg7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQW9YLHVCQUF1QjtBQUMzWSxTQUFrRSx1QkFBb0Q7QUFDdEgsU0FBUyxpQkFBaUIsd0JBQXdCO0FBQ2xELFNBQVMsZ0JBQWdCO0FBRXpCLFNBQTJCLG9CQUFvQjtBQUMvQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsbUJBQW1CO0FBSXJDLFNBQVMscUJBQXFCO0FBQzlCLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QixpQkFBaUI7QUFDbkQsU0FBUyxrQkFBa0IscUJBQXFCO0FBR2hELFNBQVMsWUFBWTtBQUdyQixJQUFXLG9CQUFYLGtCQUFXQSx1QkFBWDtBQUNDLEVBQUFBLHNDQUFBO0FBQ0EsRUFBQUEs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QUFHO0FBR2hCLFFBQUksY0FBYyxLQUFLO0FBQ3ZCLFFBQUksU0FBUztBQUNiLFFBQUk7QUFHSixRQUFJLElBQUksS0FBSyxPQUFPLEtBQUssT0FBTztBQUMvQixlQUFTLEtBQUs7QUFBQSxJQUNmLE9BQU87QUFDTixZQUFNLGtCQUFrQixnQkFBZ0IsWUFBWTtBQUdwRCxlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssU0FBUyxHQUFHLEtBQUs7QUFFekMsZUFBTyxnQkFBZ0IsYUFBYSxLQUFLLE9BQU8sQ0FBQyxHQUFHLElBQUksSUFBSTtBQUU1RCx1QkFBZTtBQUVmLFlBQUksSUFBSSxhQUFhO0FBQ3BCLG1CQUFTO0FBQ1Q7QUFBQSxRQUNEO0FBRUEsdUJBQWU7QUFBQSxNQUNoQjtBQUFBLElBQ0Q7QUFHQSxVQUFNLFNBQVMsR0FBRyxZQUFhLE1BQU07QUFDckMsVUFBTSxPQUFPLEdBQUcsWUFBYSxNQUFNO0FBQUEsRUFDcEM7QUFFQSxTQUFPO0FBQ1I7QUFFQSxNQUFNLG1CQUFOLE1BQU0saUJBQWdCO0FBQUEsRUFHckIsT0FBYyxjQUErQjtBQUM1QyxRQUFJLENBQUMsaUJBQWdCLFdBQVc7QUFDL0IsdUJBQWdCLFlBQVksSUFBSSxpQkFBZ0I7QUFBQSxJQUNqRDtBQUNBLFdBQU8saUJBQWdCO0FBQUEsRUFDeEI7QUFBQSxFQUtRLGNBQWM7QUFDckIsU0FBSyxTQUFTLENBQUM7QUFDZixTQUFLLFVBQVUsU0FBUyxjQUFjLFFBQVE7QUFBQSxFQUMvQztBQUFBLEVBRU8sYUFBYSxNQUFjLE1BQXNCO0FBQ3ZELFVBQU0sV0FBVyxPQUFPO0FBQ3hCLFFBQUksS0FBSyxPQUFPLFFBQVEsR0FBRztBQUMxQixhQUFPLEtBQUssT0FBTyxRQUFRO0FBQUEsSUFDNUI7QUFFQSxVQUFNLFVBQVUsS0FBSyxRQUFRLFdBQVcsSUFBSTtBQUM1QyxZQUFRLE9BQU87QUFDZixVQUFNLFVBQVUsUUFBUSxZQUFZLElBQUk7QUFDeEMsVUFBTSxRQUFRLFFBQVE7QUFDdEIsU0FBSyxPQUFPLFFBQVEsSUFBSTtBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBL0JNLGlCQUNVLFlBQW9DO0FBRHBELElBQU0sa0JBQU47IiwKICAibmFtZXMiOiBbIkhpdFRlc3RSZXN1bHRUeXBlIiwgIkhpdFRlc3RSZXN1bHQiLCAibGluZU51bWJlciIsICJtYXhMaW5lQ29sdW1uIiwgImxpbmVXaWR0aCIsICJ2aXNpYmxlUmFuZ2UiXQp9Cg==
