import * as dom from "../../../base/browser/dom.js";
import { StandardWheelEvent } from "../../../base/browser/mouseEvent.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as platform from "../../../base/common/platform.js";
import { HitTestContext, MouseTarget, MouseTargetFactory } from "./mouseTarget.js";
import { MouseTargetType } from "../editorBrowser.js";
import { ClientCoordinates, EditorMouseEvent, EditorMouseEventFactory, GlobalEditorPointerMoveMonitor, createEditorPagePosition, createCoordinatesRelativeToEditor } from "../editorDom.js";
import { EditorZoom } from "../../common/config/editorZoom.js";
import { Position } from "../../common/core/position.js";
import { Selection } from "../../common/core/selection.js";
import { ViewEventHandler } from "../../common/viewEventHandler.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { NavigationCommandRevealType } from "../coreCommands.js";
import { MouseWheelClassifier } from "../../../base/browser/ui/scrollbar/scrollableElement.js";
import { TopBottomDragScrolling, LeftRightDragScrolling } from "./dragScrolling.js";
import { TextDirection } from "../../common/model.js";
class MouseHandler extends ViewEventHandler {
  constructor(context, viewController, viewHelper) {
    super();
    this._mouseLeaveMonitor = null;
    this._context = context;
    this.viewController = viewController;
    this.viewHelper = viewHelper;
    this.mouseTargetFactory = new MouseTargetFactory(this._context, viewHelper);
    this._mouseDownOperation = this._register(new MouseDownOperation(
      this._context,
      this.viewController,
      this.viewHelper,
      this.mouseTargetFactory,
      (e, testEventTarget) => this._createMouseTarget(e, testEventTarget),
      (e) => this._getMouseColumn(e)
    ));
    this.lastMouseLeaveTime = -1;
    this._height = this._context.configuration.options.get(EditorOption.layoutInfo).height;
    const mouseEvents = new EditorMouseEventFactory(this.viewHelper.viewDomNode);
    this._register(mouseEvents.onContextMenu(this.viewHelper.viewDomNode, (e) => this._onContextMenu(e, true)));
    this._register(mouseEvents.onMouseMove(this.viewHelper.viewDomNode, (e) => {
      this._onMouseMove(e);
      if (!this._mouseLeaveMonitor) {
        this._mouseLeaveMonitor = dom.addDisposableListener(this.viewHelper.viewDomNode.ownerDocument, "mousemove", (e2) => {
          if (!this.viewHelper.viewDomNode.contains(e2.target)) {
            this._onMouseLeave(new EditorMouseEvent(e2, false, this.viewHelper.viewDomNode));
          }
        });
      }
    }));
    this._register(mouseEvents.onMouseUp(this.viewHelper.viewDomNode, (e) => this._onMouseUp(e)));
    this._register(mouseEvents.onMouseLeave(this.viewHelper.viewDomNode, (e) => this._onMouseLeave(e)));
    let capturePointerId = 0;
    this._register(mouseEvents.onPointerDown(this.viewHelper.viewDomNode, (e, pointerId) => {
      capturePointerId = pointerId;
    }));
    this._register(dom.addDisposableListener(this.viewHelper.viewDomNode, dom.EventType.POINTER_UP, (e) => {
      this._mouseDownOperation.onPointerUp();
    }));
    this._register(mouseEvents.onMouseDown(this.viewHelper.viewDomNode, (e) => this._onMouseDown(e, capturePointerId)));
    this._setupMouseWheelZoomListener();
    this._context.addEventHandler(this);
  }
  _setupMouseWheelZoomListener() {
    const classifier = MouseWheelClassifier.INSTANCE;
    let prevMouseWheelTime = 0;
    let gestureStartZoomLevel = EditorZoom.getZoomLevel();
    let gestureHasZoomModifiers = false;
    let gestureAccumulatedDelta = 0;
    const onMouseWheel = (browserEvent) => {
      this.viewController.emitMouseWheel(browserEvent);
      if (!this._context.configuration.options.get(EditorOption.mouseWheelZoom)) {
        return;
      }
      const e = new StandardWheelEvent(browserEvent);
      classifier.acceptStandardWheelEvent(e);
      if (classifier.isPhysicalMouseWheel()) {
        if (hasMouseWheelZoomModifiers(browserEvent)) {
          const zoomLevel = EditorZoom.getZoomLevel();
          const delta = e.deltaY > 0 ? 1 : -1;
          EditorZoom.setZoomLevel(zoomLevel + delta);
          e.preventDefault();
          e.stopPropagation();
        }
      } else {
        if (Date.now() - prevMouseWheelTime > 50) {
          gestureStartZoomLevel = EditorZoom.getZoomLevel();
          gestureHasZoomModifiers = hasMouseWheelZoomModifiers(browserEvent);
          gestureAccumulatedDelta = 0;
        }
        prevMouseWheelTime = Date.now();
        gestureAccumulatedDelta += e.deltaY;
        if (gestureHasZoomModifiers) {
          EditorZoom.setZoomLevel(gestureStartZoomLevel + gestureAccumulatedDelta / 5);
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    this._register(dom.addDisposableListener(this.viewHelper.viewDomNode, dom.EventType.MOUSE_WHEEL, onMouseWheel, { capture: true, passive: false }));
    function hasMouseWheelZoomModifiers(browserEvent) {
      return platform.isMacintosh ? (browserEvent.metaKey || browserEvent.ctrlKey) && !browserEvent.shiftKey && !browserEvent.altKey : browserEvent.ctrlKey && !browserEvent.metaKey && !browserEvent.shiftKey && !browserEvent.altKey;
    }
  }
  dispose() {
    this._context.removeEventHandler(this);
    if (this._mouseLeaveMonitor) {
      this._mouseLeaveMonitor.dispose();
      this._mouseLeaveMonitor = null;
    }
    super.dispose();
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    if (e.hasChanged(EditorOption.layoutInfo)) {
      const height = this._context.configuration.options.get(EditorOption.layoutInfo).height;
      if (this._height !== height) {
        this._height = height;
        this._mouseDownOperation.onHeightChanged();
      }
    }
    return false;
  }
  onCursorStateChanged(e) {
    this._mouseDownOperation.onCursorStateChanged(e);
    return false;
  }
  onFocusChanged(e) {
    return false;
  }
  // --- end event handlers
  getTargetAtClientPoint(clientX, clientY) {
    const clientPos = new ClientCoordinates(clientX, clientY);
    const pos = clientPos.toPageCoordinates(dom.getWindow(this.viewHelper.viewDomNode));
    const editorPos = createEditorPagePosition(this.viewHelper.viewDomNode);
    if (pos.y < editorPos.y || pos.y > editorPos.y + editorPos.height || pos.x < editorPos.x || pos.x > editorPos.x + editorPos.width) {
      return null;
    }
    const relativePos = createCoordinatesRelativeToEditor(this.viewHelper.viewDomNode, editorPos, pos);
    return this.mouseTargetFactory.createMouseTarget(this.viewHelper.getLastRenderData(), editorPos, pos, relativePos, null);
  }
  _createMouseTarget(e, testEventTarget) {
    let target = e.target;
    if (!this.viewHelper.viewDomNode.contains(target)) {
      const shadowRoot = dom.getShadowRoot(this.viewHelper.viewDomNode);
      if (shadowRoot) {
        const potentialTarget = shadowRoot.elementsFromPoint(e.posx, e.posy).find(
          (el) => this.viewHelper.viewDomNode.contains(el)
        ) ?? null;
        target = potentialTarget;
      }
    }
    return this.mouseTargetFactory.createMouseTarget(this.viewHelper.getLastRenderData(), e.editorPos, e.pos, e.relativePos, testEventTarget ? target : null);
  }
  _getMouseColumn(e) {
    return this.mouseTargetFactory.getMouseColumn(e.relativePos);
  }
  _onContextMenu(e, testEventTarget) {
    this.viewController.emitContextMenu({
      event: e,
      target: this._createMouseTarget(e, testEventTarget)
    });
  }
  _onMouseMove(e) {
    const targetIsWidget = this.mouseTargetFactory.mouseTargetIsWidget(e);
    if (!targetIsWidget) {
      e.preventDefault();
    }
    if (this._mouseDownOperation.isActive()) {
      return;
    }
    const actualMouseMoveTime = e.timestamp;
    if (actualMouseMoveTime < this.lastMouseLeaveTime) {
      return;
    }
    this.viewController.emitMouseMove({
      event: e,
      target: this._createMouseTarget(e, true)
    });
  }
  _onMouseLeave(e) {
    if (this._mouseLeaveMonitor) {
      this._mouseLeaveMonitor.dispose();
      this._mouseLeaveMonitor = null;
    }
    this.lastMouseLeaveTime = (/* @__PURE__ */ new Date()).getTime();
    this.viewController.emitMouseLeave({
      event: e,
      target: null
    });
  }
  _onMouseUp(e) {
    this.viewController.emitMouseUp({
      event: e,
      target: this._createMouseTarget(e, true)
    });
  }
  _onMouseDown(e, pointerId) {
    const t = this._createMouseTarget(e, true);
    const targetIsContent = t.type === MouseTargetType.CONTENT_TEXT || t.type === MouseTargetType.CONTENT_EMPTY;
    const targetIsGutter = t.type === MouseTargetType.GUTTER_GLYPH_MARGIN || t.type === MouseTargetType.GUTTER_LINE_NUMBERS || t.type === MouseTargetType.GUTTER_LINE_DECORATIONS;
    const targetIsLineNumbers = t.type === MouseTargetType.GUTTER_LINE_NUMBERS;
    const selectOnLineNumbers = this._context.configuration.options.get(EditorOption.selectOnLineNumbers);
    const targetIsViewZone = t.type === MouseTargetType.CONTENT_VIEW_ZONE || t.type === MouseTargetType.GUTTER_VIEW_ZONE;
    const targetIsWidget = t.type === MouseTargetType.CONTENT_WIDGET;
    let shouldHandle = e.leftButton || e.middleButton;
    if (platform.isMacintosh && e.leftButton && e.ctrlKey) {
      shouldHandle = false;
    }
    const focus = () => {
      e.preventDefault();
      this.viewHelper.focusTextArea();
    };
    if (shouldHandle && (targetIsContent || targetIsLineNumbers && selectOnLineNumbers)) {
      focus();
      this._mouseDownOperation.start(t.type, e, pointerId);
    } else if (targetIsGutter) {
      e.preventDefault();
    } else if (targetIsViewZone) {
      const viewZoneData = t.detail;
      if (shouldHandle && this.viewHelper.shouldSuppressMouseDownOnViewZone(viewZoneData.viewZoneId)) {
        focus();
        this._mouseDownOperation.start(t.type, e, pointerId);
        e.preventDefault();
      }
    } else if (targetIsWidget && this.viewHelper.shouldSuppressMouseDownOnWidget(t.detail)) {
      focus();
      e.preventDefault();
    }
    this.viewController.emitMouseDown({
      event: e,
      target: t
    });
  }
  _onMouseWheel(e) {
    this.viewController.emitMouseWheel(e);
  }
}
class MouseDownOperation extends Disposable {
  constructor(_context, _viewController, _viewHelper, _mouseTargetFactory, createMouseTarget, getMouseColumn) {
    super();
    this._context = _context;
    this._viewController = _viewController;
    this._viewHelper = _viewHelper;
    this._mouseTargetFactory = _mouseTargetFactory;
    this._createMouseTarget = createMouseTarget;
    this._getMouseColumn = getMouseColumn;
    this._mouseMoveMonitor = this._register(new GlobalEditorPointerMoveMonitor(this._viewHelper.viewDomNode));
    this._topBottomDragScrolling = this._register(new TopBottomDragScrolling(
      this._context,
      this._viewHelper,
      this._mouseTargetFactory,
      (position, inSelectionMode, revealType) => this._dispatchMouse(position, inSelectionMode, revealType)
    ));
    this._leftRightDragScrolling = this._register(new LeftRightDragScrolling(
      this._context,
      this._viewHelper,
      this._mouseTargetFactory,
      (position, inSelectionMode, revealType) => this._dispatchMouse(position, inSelectionMode, revealType)
    ));
    this._mouseState = new MouseDownState();
    this._currentSelection = new Selection(1, 1, 1, 1);
    this._isActive = false;
    this._lastMouseEvent = null;
  }
  isActive() {
    return this._isActive;
  }
  _onMouseDownThenMove(e) {
    this._lastMouseEvent = e;
    this._mouseState.setModifiers(e);
    const position = this._findMousePosition(e, false);
    if (!position) {
      return;
    }
    if (this._mouseState.isDragAndDrop) {
      this._viewController.emitMouseDrag({
        event: e,
        target: position
      });
    } else {
      if (position.type === MouseTargetType.OUTSIDE_EDITOR) {
        if (position.outsidePosition === "above" || position.outsidePosition === "below") {
          this._topBottomDragScrolling.start(position, e);
          this._leftRightDragScrolling.stop();
        } else {
          this._leftRightDragScrolling.start(position, e);
          this._topBottomDragScrolling.stop();
        }
      } else {
        this._topBottomDragScrolling.stop();
        this._leftRightDragScrolling.stop();
        this._dispatchMouse(position, true, NavigationCommandRevealType.Minimal);
      }
    }
  }
  start(targetType, e, pointerId) {
    this._lastMouseEvent = e;
    this._mouseState.setStartedOnLineNumbers(targetType === MouseTargetType.GUTTER_LINE_NUMBERS);
    this._mouseState.setStartButtons(e);
    this._mouseState.setModifiers(e);
    const position = this._findMousePosition(e, true);
    if (!position || !position.position) {
      return;
    }
    this._mouseState.trySetCount(e.detail, position.position);
    e.detail = this._mouseState.count;
    const options = this._context.configuration.options;
    if (!options.get(EditorOption.readOnly) && options.get(EditorOption.dragAndDrop) && !options.get(EditorOption.columnSelection) && !this._mouseState.altKey && e.detail < 2 && !this._isActive && !this._currentSelection.isEmpty() && position.type === MouseTargetType.CONTENT_TEXT && position.position && this._currentSelection.containsPosition(position.position)) {
      this._mouseState.isDragAndDrop = true;
      this._isActive = true;
      this._mouseMoveMonitor.startMonitoring(
        this._viewHelper.viewLinesDomNode,
        pointerId,
        e.buttons,
        (e2) => this._onMouseDownThenMove(e2),
        (browserEvent) => {
          const position2 = this._findMousePosition(this._lastMouseEvent, false);
          if (dom.isKeyboardEvent(browserEvent)) {
            this._viewController.emitMouseDropCanceled();
          } else {
            this._viewController.emitMouseDrop({
              event: this._lastMouseEvent,
              target: position2 ? this._createMouseTarget(this._lastMouseEvent, true) : null
              // Ignoring because position is unknown, e.g., Content View Zone
            });
          }
          this._stop();
        }
      );
      return;
    }
    this._mouseState.isDragAndDrop = false;
    this._dispatchMouse(position, e.shiftKey, NavigationCommandRevealType.Minimal);
    if (!this._isActive) {
      this._isActive = true;
      this._mouseMoveMonitor.startMonitoring(
        this._viewHelper.viewLinesDomNode,
        pointerId,
        e.buttons,
        (e2) => this._onMouseDownThenMove(e2),
        () => this._stop()
      );
    }
  }
  _stop() {
    this._isActive = false;
    this._topBottomDragScrolling.stop();
    this._leftRightDragScrolling.stop();
  }
  onHeightChanged() {
    this._mouseMoveMonitor.stopMonitoring();
  }
  onPointerUp() {
    this._mouseMoveMonitor.stopMonitoring();
  }
  onCursorStateChanged(e) {
    this._currentSelection = e.selections[0];
  }
  _getPositionOutsideEditor(e) {
    const editorContent = e.editorPos;
    const model = this._context.viewModel;
    const viewLayout = this._context.viewLayout;
    const mouseColumn = this._getMouseColumn(e);
    if (e.posy < editorContent.y) {
      const outsideDistance = editorContent.y - e.posy;
      const verticalOffset = Math.max(viewLayout.getCurrentScrollTop() - outsideDistance, 0);
      const viewZoneData = HitTestContext.getZoneAtCoord(this._context, verticalOffset);
      if (viewZoneData) {
        const newPosition = this._helpPositionJumpOverViewZone(viewZoneData);
        if (newPosition) {
          return MouseTarget.createOutsideEditor(mouseColumn, newPosition, "above", outsideDistance);
        }
      }
      const aboveLineNumber = viewLayout.getLineNumberAtVerticalOffset(verticalOffset);
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(aboveLineNumber, 1), "above", outsideDistance);
    }
    if (e.posy > editorContent.y + editorContent.height) {
      const outsideDistance = e.posy - editorContent.y - editorContent.height;
      const verticalOffset = viewLayout.getCurrentScrollTop() + e.relativePos.y;
      const viewZoneData = HitTestContext.getZoneAtCoord(this._context, verticalOffset);
      if (viewZoneData) {
        const newPosition = this._helpPositionJumpOverViewZone(viewZoneData);
        if (newPosition) {
          return MouseTarget.createOutsideEditor(mouseColumn, newPosition, "below", outsideDistance);
        }
      }
      const belowLineNumber = viewLayout.getLineNumberAtVerticalOffset(verticalOffset);
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(belowLineNumber, model.getLineMaxColumn(belowLineNumber)), "below", outsideDistance);
    }
    const possibleLineNumber = viewLayout.getLineNumberAtVerticalOffset(viewLayout.getCurrentScrollTop() + e.relativePos.y);
    const layoutInfo = this._context.configuration.options.get(EditorOption.layoutInfo);
    const xLeftBoundary = layoutInfo.contentLeft;
    if (e.relativePos.x <= xLeftBoundary) {
      const outsideDistance = xLeftBoundary - e.relativePos.x;
      const isRtl = model.getTextDirection(possibleLineNumber) === TextDirection.RTL;
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(possibleLineNumber, isRtl ? model.getLineMaxColumn(possibleLineNumber) : 1), "left", outsideDistance);
    }
    const contentRight = layoutInfo.minimap.minimapLeft === 0 ? layoutInfo.width - layoutInfo.verticalScrollbarWidth : layoutInfo.minimap.minimapLeft;
    const xRightBoundary = contentRight;
    if (e.relativePos.x >= xRightBoundary) {
      const outsideDistance = e.relativePos.x - xRightBoundary;
      const isRtl = model.getTextDirection(possibleLineNumber) === TextDirection.RTL;
      return MouseTarget.createOutsideEditor(mouseColumn, new Position(possibleLineNumber, isRtl ? 1 : model.getLineMaxColumn(possibleLineNumber)), "right", outsideDistance);
    }
    return null;
  }
  _findMousePosition(e, testEventTarget) {
    const positionOutsideEditor = this._getPositionOutsideEditor(e);
    if (positionOutsideEditor) {
      return positionOutsideEditor;
    }
    const t = this._createMouseTarget(e, testEventTarget);
    const hintedPosition = t.position;
    if (!hintedPosition) {
      return null;
    }
    if (t.type === MouseTargetType.CONTENT_VIEW_ZONE || t.type === MouseTargetType.GUTTER_VIEW_ZONE) {
      const newPosition = this._helpPositionJumpOverViewZone(t.detail);
      if (newPosition) {
        return MouseTarget.createViewZone(t.type, t.element, t.mouseColumn, newPosition, t.detail);
      }
    }
    return t;
  }
  _helpPositionJumpOverViewZone(viewZoneData) {
    const selectionStart = new Position(this._currentSelection.selectionStartLineNumber, this._currentSelection.selectionStartColumn);
    const positionBefore = viewZoneData.positionBefore;
    const positionAfter = viewZoneData.positionAfter;
    if (positionBefore && positionAfter) {
      if (positionBefore.isBefore(selectionStart)) {
        return positionBefore;
      } else {
        return positionAfter;
      }
    }
    return null;
  }
  _dispatchMouse(position, inSelectionMode, revealType) {
    if (!position.position) {
      return;
    }
    this._viewController.dispatchMouse({
      position: position.position,
      mouseColumn: position.mouseColumn,
      startedOnLineNumbers: this._mouseState.startedOnLineNumbers,
      revealType,
      inSelectionMode,
      mouseDownCount: this._mouseState.count,
      altKey: this._mouseState.altKey,
      ctrlKey: this._mouseState.ctrlKey,
      metaKey: this._mouseState.metaKey,
      shiftKey: this._mouseState.shiftKey,
      leftButton: this._mouseState.leftButton,
      middleButton: this._mouseState.middleButton,
      onInjectedText: position.type === MouseTargetType.CONTENT_TEXT && position.detail.injectedText !== null
    });
  }
}
const _MouseDownState = class _MouseDownState {
  get altKey() {
    return this._altKey;
  }
  get ctrlKey() {
    return this._ctrlKey;
  }
  get metaKey() {
    return this._metaKey;
  }
  get shiftKey() {
    return this._shiftKey;
  }
  get leftButton() {
    return this._leftButton;
  }
  get middleButton() {
    return this._middleButton;
  }
  get startedOnLineNumbers() {
    return this._startedOnLineNumbers;
  }
  constructor() {
    this._altKey = false;
    this._ctrlKey = false;
    this._metaKey = false;
    this._shiftKey = false;
    this._leftButton = false;
    this._middleButton = false;
    this._startedOnLineNumbers = false;
    this._lastMouseDownPosition = null;
    this._lastMouseDownPositionEqualCount = 0;
    this._lastMouseDownCount = 0;
    this._lastSetMouseDownCountTime = 0;
    this.isDragAndDrop = false;
  }
  get count() {
    return this._lastMouseDownCount;
  }
  setModifiers(source) {
    this._altKey = source.altKey;
    this._ctrlKey = source.ctrlKey;
    this._metaKey = source.metaKey;
    this._shiftKey = source.shiftKey;
  }
  setStartButtons(source) {
    this._leftButton = source.leftButton;
    this._middleButton = source.middleButton;
  }
  setStartedOnLineNumbers(startedOnLineNumbers) {
    this._startedOnLineNumbers = startedOnLineNumbers;
  }
  trySetCount(setMouseDownCount, newMouseDownPosition) {
    const currentTime = (/* @__PURE__ */ new Date()).getTime();
    if (currentTime - this._lastSetMouseDownCountTime > _MouseDownState.CLEAR_MOUSE_DOWN_COUNT_TIME) {
      setMouseDownCount = 1;
    }
    this._lastSetMouseDownCountTime = currentTime;
    if (setMouseDownCount > this._lastMouseDownCount + 1) {
      setMouseDownCount = this._lastMouseDownCount + 1;
    }
    if (this._lastMouseDownPosition && this._lastMouseDownPosition.equals(newMouseDownPosition)) {
      this._lastMouseDownPositionEqualCount++;
    } else {
      this._lastMouseDownPositionEqualCount = 1;
    }
    this._lastMouseDownPosition = newMouseDownPosition;
    this._lastMouseDownCount = Math.min(setMouseDownCount, this._lastMouseDownPositionEqualCount);
  }
};
_MouseDownState.CLEAR_MOUSE_DOWN_COUNT_TIME = 400;
let MouseDownState = _MouseDownState;
export {
  MouseHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2NvbnRyb2xsZXIvbW91c2VIYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRXaGVlbEV2ZW50LCBJTW91c2VXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSGl0VGVzdENvbnRleHQsIE1vdXNlVGFyZ2V0LCBNb3VzZVRhcmdldEZhY3RvcnksIFBvaW50ZXJIYW5kbGVyTGFzdFJlbmRlckRhdGEgfSBmcm9tICcuL21vdXNlVGFyZ2V0LmpzJztcbmltcG9ydCB7IElNb3VzZVRhcmdldCwgSU1vdXNlVGFyZ2V0Vmlld1pvbmVEYXRhLCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IENsaWVudENvb3JkaW5hdGVzLCBFZGl0b3JNb3VzZUV2ZW50LCBFZGl0b3JNb3VzZUV2ZW50RmFjdG9yeSwgR2xvYmFsRWRpdG9yUG9pbnRlck1vdmVNb25pdG9yLCBjcmVhdGVFZGl0b3JQYWdlUG9zaXRpb24sIGNyZWF0ZUNvb3JkaW5hdGVzUmVsYXRpdmVUb0VkaXRvciB9IGZyb20gJy4uL2VkaXRvckRvbS5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udHJvbGxlciB9IGZyb20gJy4uL3ZpZXcvdmlld0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yWm9vbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yWm9vbS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBIb3Jpem9udGFsUG9zaXRpb24gfSBmcm9tICcuLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgVmlld0V2ZW50SGFuZGxlciB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3RXZlbnRIYW5kbGVyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBOYXZpZ2F0aW9uQ29tbWFuZFJldmVhbFR5cGUgfSBmcm9tICcuLi9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTW91c2VXaGVlbENsYXNzaWZpZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB0eXBlIHsgVmlld0xpbmVzR3B1IH0gZnJvbSAnLi4vdmlld1BhcnRzL3ZpZXdMaW5lc0dwdS92aWV3TGluZXNHcHUuanMnO1xuaW1wb3J0IHsgVG9wQm90dG9tRHJhZ1Njcm9sbGluZywgTGVmdFJpZ2h0RHJhZ1Njcm9sbGluZyB9IGZyb20gJy4vZHJhZ1Njcm9sbGluZy5qcyc7XG5pbXBvcnQgeyBUZXh0RGlyZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJUG9pbnRlckhhbmRsZXJIZWxwZXIge1xuXHR2aWV3RG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdGxpbmVzQ29udGVudERvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHR2aWV3TGluZXNEb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0dmlld0xpbmVzR3B1OiBWaWV3TGluZXNHcHUgfCB1bmRlZmluZWQ7XG5cblx0Zm9jdXNUZXh0QXJlYSgpOiB2b2lkO1xuXHRkaXNwYXRjaFRleHRBcmVhRXZlbnQoZXZlbnQ6IEN1c3RvbUV2ZW50KTogdm9pZDtcblxuXHQvKipcblx0ICogR2V0IHRoZSBsYXN0IHJlbmRlcmVkIGluZm9ybWF0aW9uIGZvciBjdXJzb3JzICYgdGV4dGFyZWEuXG5cdCAqL1xuXHRnZXRMYXN0UmVuZGVyRGF0YSgpOiBQb2ludGVySGFuZGxlckxhc3RSZW5kZXJEYXRhO1xuXG5cdC8qKlxuXHQgKiBSZW5kZXIgcmlnaHQgbm93XG5cdCAqL1xuXHRyZW5kZXJOb3coKTogdm9pZDtcblxuXHRzaG91bGRTdXBwcmVzc01vdXNlRG93bk9uVmlld1pvbmUodmlld1pvbmVJZDogc3RyaW5nKTogYm9vbGVhbjtcblx0c2hvdWxkU3VwcHJlc3NNb3VzZURvd25PbldpZGdldCh3aWRnZXRJZDogc3RyaW5nKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRGVjb2RlIGEgcG9zaXRpb24gZnJvbSBhIHJlbmRlcmVkIGRvbSBub2RlXG5cdCAqL1xuXHRnZXRQb3NpdGlvbkZyb21ET01JbmZvKHNwYW5Ob2RlOiBIVE1MRWxlbWVudCwgb2Zmc2V0OiBudW1iZXIpOiBQb3NpdGlvbiB8IG51bGw7XG5cblx0dmlzaWJsZVJhbmdlRm9yUG9zaXRpb24obGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IEhvcml6b250YWxQb3NpdGlvbiB8IG51bGw7XG5cdGdldExpbmVXaWR0aChsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBNb3VzZUhhbmRsZXIgZXh0ZW5kcyBWaWV3RXZlbnRIYW5kbGVyIHtcblxuXHRwcm90ZWN0ZWQgX2NvbnRleHQ6IFZpZXdDb250ZXh0O1xuXHRwcm90ZWN0ZWQgdmlld0NvbnRyb2xsZXI6IFZpZXdDb250cm9sbGVyO1xuXHRwcm90ZWN0ZWQgdmlld0hlbHBlcjogSVBvaW50ZXJIYW5kbGVySGVscGVyO1xuXHRwcm90ZWN0ZWQgbW91c2VUYXJnZXRGYWN0b3J5OiBNb3VzZVRhcmdldEZhY3Rvcnk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbW91c2VEb3duT3BlcmF0aW9uOiBNb3VzZURvd25PcGVyYXRpb247XG5cdHByaXZhdGUgbGFzdE1vdXNlTGVhdmVUaW1lOiBudW1iZXI7XG5cdHByaXZhdGUgX2hlaWdodDogbnVtYmVyO1xuXHRwcml2YXRlIF9tb3VzZUxlYXZlTW9uaXRvcjogSURpc3Bvc2FibGUgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihjb250ZXh0OiBWaWV3Q29udGV4dCwgdmlld0NvbnRyb2xsZXI6IFZpZXdDb250cm9sbGVyLCB2aWV3SGVscGVyOiBJUG9pbnRlckhhbmRsZXJIZWxwZXIpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0dGhpcy52aWV3Q29udHJvbGxlciA9IHZpZXdDb250cm9sbGVyO1xuXHRcdHRoaXMudmlld0hlbHBlciA9IHZpZXdIZWxwZXI7XG5cdFx0dGhpcy5tb3VzZVRhcmdldEZhY3RvcnkgPSBuZXcgTW91c2VUYXJnZXRGYWN0b3J5KHRoaXMuX2NvbnRleHQsIHZpZXdIZWxwZXIpO1xuXG5cdFx0dGhpcy5fbW91c2VEb3duT3BlcmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE1vdXNlRG93bk9wZXJhdGlvbihcblx0XHRcdHRoaXMuX2NvbnRleHQsXG5cdFx0XHR0aGlzLnZpZXdDb250cm9sbGVyLFxuXHRcdFx0dGhpcy52aWV3SGVscGVyLFxuXHRcdFx0dGhpcy5tb3VzZVRhcmdldEZhY3RvcnksXG5cdFx0XHQoZSwgdGVzdEV2ZW50VGFyZ2V0KSA9PiB0aGlzLl9jcmVhdGVNb3VzZVRhcmdldChlLCB0ZXN0RXZlbnRUYXJnZXQpLFxuXHRcdFx0KGUpID0+IHRoaXMuX2dldE1vdXNlQ29sdW1uKGUpXG5cdFx0KSk7XG5cblx0XHR0aGlzLmxhc3RNb3VzZUxlYXZlVGltZSA9IC0xO1xuXHRcdHRoaXMuX2hlaWdodCA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykuaGVpZ2h0O1xuXG5cdFx0Y29uc3QgbW91c2VFdmVudHMgPSBuZXcgRWRpdG9yTW91c2VFdmVudEZhY3RvcnkodGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vdXNlRXZlbnRzLm9uQ29udGV4dE1lbnUodGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLCAoZSkgPT4gdGhpcy5fb25Db250ZXh0TWVudShlLCB0cnVlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobW91c2VFdmVudHMub25Nb3VzZU1vdmUodGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy5fb25Nb3VzZU1vdmUoZSk7XG5cblx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM4Nzg5XG5cdFx0XHQvLyBXaGVuIG1vdmluZyB0aGUgbW91c2UgcmVhbGx5IHF1aWNrbHksIHRoZSBicm93c2VyIHNvbWV0aW1lcyBmb3JnZXRzIHRvXG5cdFx0XHQvLyBzZW5kIHVzIGEgYG1vdXNlbGVhdmVgIG9yIGBtb3VzZW91dGAgZXZlbnQuIFdlIHRoZXJlZm9yZSBpbnN0YWxsIGhlcmVcblx0XHRcdC8vIGEgZ2xvYmFsIGBtb3VzZW1vdmVgIGxpc3RlbmVyIHRvIG1hbnVhbGx5IHJlY292ZXIgaWYgdGhlIG1vdXNlIGdvZXMgb3V0c2lkZVxuXHRcdFx0Ly8gdGhlIGVkaXRvci4gQXMgc29vbiBhcyB0aGUgbW91c2UgbGVhdmVzIG91dHNpZGUgb2YgdGhlIGVkaXRvciwgd2Vcblx0XHRcdC8vIHJlbW92ZSB0aGlzIGxpc3RlbmVyXG5cblx0XHRcdGlmICghdGhpcy5fbW91c2VMZWF2ZU1vbml0b3IpIHtcblx0XHRcdFx0dGhpcy5fbW91c2VMZWF2ZU1vbml0b3IgPSBkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZS5vd25lckRvY3VtZW50LCAnbW91c2Vtb3ZlJywgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZS5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlIHwgbnVsbCkpIHtcblx0XHRcdFx0XHRcdC8vIHdlbnQgb3V0c2lkZSB0aGUgZWRpdG9yIVxuXHRcdFx0XHRcdFx0dGhpcy5fb25Nb3VzZUxlYXZlKG5ldyBFZGl0b3JNb3VzZUV2ZW50KGUsIGZhbHNlLCB0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vdXNlRXZlbnRzLm9uTW91c2VVcCh0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUsIChlKSA9PiB0aGlzLl9vbk1vdXNlVXAoZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vdXNlRXZlbnRzLm9uTW91c2VMZWF2ZSh0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUsIChlKSA9PiB0aGlzLl9vbk1vdXNlTGVhdmUoZSkpKTtcblxuXHRcdC8vIGBwb2ludGVyZG93bmAgZXZlbnRzIGNhbid0IGJlIHVzZWQgdG8gZGV0ZXJtaW5lIGlmIHRoZXJlJ3MgYSBkb3VibGUgY2xpY2ssIG9yIHRyaXBsZSBjbGlja1xuXHRcdC8vIGJlY2F1c2UgdGhlaXIgYGUuZGV0YWlsYCBpcyBhbHdheXMgMC5cblx0XHQvLyBXZSB3aWxsIHRoZXJlZm9yZSBzYXZlIHRoZSBwb2ludGVyIGlkIGZvciB0aGUgbW91c2UgYW5kIHRoZW4gcmV1c2UgaXQgaW4gdGhlIGBtb3VzZWRvd25gIGV2ZW50XG5cdFx0Ly8gZm9yIGBlbGVtZW50LnNldFBvaW50ZXJDYXB0dXJlYC5cblx0XHRsZXQgY2FwdHVyZVBvaW50ZXJJZDogbnVtYmVyID0gMDtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb3VzZUV2ZW50cy5vblBvaW50ZXJEb3duKHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSwgKGUsIHBvaW50ZXJJZCkgPT4ge1xuXHRcdFx0Y2FwdHVyZVBvaW50ZXJJZCA9IHBvaW50ZXJJZDtcblx0XHR9KSk7XG5cdFx0Ly8gVGhlIGBwb2ludGVydXBgIGxpc3RlbmVyIHJlZ2lzdGVyZWQgYnkgYEdsb2JhbEVkaXRvclBvaW50ZXJNb3ZlTW9uaXRvcmAgZG9lcyBub3QgZ2V0IGludm9rZWQgMTAwJSBvZiB0aGUgdGltZXMuXG5cdFx0Ly8gSSBzcGVjdWxhdGUgdGhhdCB0aGlzIGlzIGJlY2F1c2UgdGhlIGBwb2ludGVydXBgIGxpc3RlbmVyIGlzIG9ubHkgcmVnaXN0ZXJlZCBkdXJpbmcgdGhlIGBtb3VzZWRvd25gIGV2ZW50LCBhbmQgcGVyaGFwc1xuXHRcdC8vIHRoZSBgcG9pbnRlcnVwYCBldmVudCBpcyBhbHJlYWR5IHF1ZXVlZCBmb3IgZGlzcGF0Y2hpbmcsIHdoaWNoIG1ha2VzIGl0IHRoYXQgdGhlIG5ldyBsaXN0ZW5lciBkb2Vzbid0IGdldCBmaXJlZC5cblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0NjQ4NiBmb3IgcmVwcm8gc3RlcHMuXG5cdFx0Ly8gVG8gY29tcGVuc2F0ZSBmb3IgdGhhdCwgd2Ugc2ltcGx5IHJlZ2lzdGVyIGhlcmUgYSBgcG9pbnRlcnVwYCBsaXN0ZW5lciBhbmQganVzdCBjb21tdW5pY2F0ZSBpdC5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5QT0lOVEVSX1VQLCAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLl9tb3VzZURvd25PcGVyYXRpb24ub25Qb2ludGVyVXAoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW91c2VFdmVudHMub25Nb3VzZURvd24odGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLCAoZSkgPT4gdGhpcy5fb25Nb3VzZURvd24oZSwgY2FwdHVyZVBvaW50ZXJJZCkpKTtcblx0XHR0aGlzLl9zZXR1cE1vdXNlV2hlZWxab29tTGlzdGVuZXIoKTtcblxuXHRcdHRoaXMuX2NvbnRleHQuYWRkRXZlbnRIYW5kbGVyKHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBNb3VzZVdoZWVsWm9vbUxpc3RlbmVyKCk6IHZvaWQge1xuXG5cdFx0Y29uc3QgY2xhc3NpZmllciA9IE1vdXNlV2hlZWxDbGFzc2lmaWVyLklOU1RBTkNFO1xuXG5cdFx0bGV0IHByZXZNb3VzZVdoZWVsVGltZSA9IDA7XG5cdFx0bGV0IGdlc3R1cmVTdGFydFpvb21MZXZlbCA9IEVkaXRvclpvb20uZ2V0Wm9vbUxldmVsKCk7XG5cdFx0bGV0IGdlc3R1cmVIYXNab29tTW9kaWZpZXJzID0gZmFsc2U7XG5cdFx0bGV0IGdlc3R1cmVBY2N1bXVsYXRlZERlbHRhID0gMDtcblxuXHRcdGNvbnN0IG9uTW91c2VXaGVlbCA9IChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpID0+IHtcblx0XHRcdHRoaXMudmlld0NvbnRyb2xsZXIuZW1pdE1vdXNlV2hlZWwoYnJvd3NlckV2ZW50KTtcblxuXHRcdFx0aWYgKCF0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLm1vdXNlV2hlZWxab29tKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGUgPSBuZXcgU3RhbmRhcmRXaGVlbEV2ZW50KGJyb3dzZXJFdmVudCk7XG5cdFx0XHRjbGFzc2lmaWVyLmFjY2VwdFN0YW5kYXJkV2hlZWxFdmVudChlKTtcblxuXHRcdFx0aWYgKGNsYXNzaWZpZXIuaXNQaHlzaWNhbE1vdXNlV2hlZWwoKSkge1xuXHRcdFx0XHRpZiAoaGFzTW91c2VXaGVlbFpvb21Nb2RpZmllcnMoYnJvd3NlckV2ZW50KSkge1xuXHRcdFx0XHRcdGNvbnN0IHpvb21MZXZlbDogbnVtYmVyID0gRWRpdG9yWm9vbS5nZXRab29tTGV2ZWwoKTtcblx0XHRcdFx0XHRjb25zdCBkZWx0YSA9IGUuZGVsdGFZID4gMCA/IDEgOiAtMTtcblx0XHRcdFx0XHRFZGl0b3Jab29tLnNldFpvb21MZXZlbCh6b29tTGV2ZWwgKyBkZWx0YSk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHdlIGNvbnNpZGVyIG1vdXNld2hlZWwgZXZlbnRzIHRoYXQgb2NjdXIgd2l0aGluIDUwbXMgb2YgZWFjaCBvdGhlciB0byBiZSBwYXJ0IG9mIHRoZSBzYW1lIGdlc3R1cmVcblx0XHRcdFx0Ly8gd2UgZG9uJ3Qgd2FudCB0byBjb25zaWRlciBtb3VzZSB3aGVlbCBldmVudHMgd2hlcmUgY3RybC9jbWQgaXMgcHJlc3NlZCBkdXJpbmcgdGhlIGluZXJ0aWEgcGhhc2Vcblx0XHRcdFx0Ly8gd2UgYWxzbyB3YW50IHRvIGFjY3VtdWxhdGUgZGVsdGFZIHZhbHVlcyBmcm9tIHRoZSBzYW1lIGdlc3R1cmUgYW5kIHVzZSB0aGF0IHRvIHNldCB0aGUgem9vbSBsZXZlbFxuXHRcdFx0XHRpZiAoRGF0ZS5ub3coKSAtIHByZXZNb3VzZVdoZWVsVGltZSA+IDUwKSB7XG5cdFx0XHRcdFx0Ly8gcmVzZXQgaWYgbW9yZSB0aGFuIDUwbXMgaGF2ZSBwYXNzZWRcblx0XHRcdFx0XHRnZXN0dXJlU3RhcnRab29tTGV2ZWwgPSBFZGl0b3Jab29tLmdldFpvb21MZXZlbCgpO1xuXHRcdFx0XHRcdGdlc3R1cmVIYXNab29tTW9kaWZpZXJzID0gaGFzTW91c2VXaGVlbFpvb21Nb2RpZmllcnMoYnJvd3NlckV2ZW50KTtcblx0XHRcdFx0XHRnZXN0dXJlQWNjdW11bGF0ZWREZWx0YSA9IDA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmV2TW91c2VXaGVlbFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRnZXN0dXJlQWNjdW11bGF0ZWREZWx0YSArPSBlLmRlbHRhWTtcblxuXHRcdFx0XHRpZiAoZ2VzdHVyZUhhc1pvb21Nb2RpZmllcnMpIHtcblx0XHRcdFx0XHRFZGl0b3Jab29tLnNldFpvb21MZXZlbChnZXN0dXJlU3RhcnRab29tTGV2ZWwgKyBnZXN0dXJlQWNjdW11bGF0ZWREZWx0YSAvIDUpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9XSEVFTCwgb25Nb3VzZVdoZWVsLCB7IGNhcHR1cmU6IHRydWUsIHBhc3NpdmU6IGZhbHNlIH0pKTtcblxuXHRcdGZ1bmN0aW9uIGhhc01vdXNlV2hlZWxab29tTW9kaWZpZXJzKGJyb3dzZXJFdmVudDogSU1vdXNlV2hlZWxFdmVudCk6IGJvb2xlYW4ge1xuXHRcdFx0cmV0dXJuIChcblx0XHRcdFx0cGxhdGZvcm0uaXNNYWNpbnRvc2hcblx0XHRcdFx0XHQvLyBvbiBtYWNPUyB3ZSBzdXBwb3J0IGNtZCArIHR3byBmaW5nZXJzIHNjcm9sbCAoYG1ldGFLZXlgIHNldClcblx0XHRcdFx0XHQvLyBhbmQgYWxzbyB0aGUgdHdvIGZpbmdlcnMgcGluY2ggZ2VzdHVyZSAoYGN0cktleWAgc2V0KVxuXHRcdFx0XHRcdD8gKChicm93c2VyRXZlbnQubWV0YUtleSB8fCBicm93c2VyRXZlbnQuY3RybEtleSkgJiYgIWJyb3dzZXJFdmVudC5zaGlmdEtleSAmJiAhYnJvd3NlckV2ZW50LmFsdEtleSlcblx0XHRcdFx0XHQ6IChicm93c2VyRXZlbnQuY3RybEtleSAmJiAhYnJvd3NlckV2ZW50Lm1ldGFLZXkgJiYgIWJyb3dzZXJFdmVudC5zaGlmdEtleSAmJiAhYnJvd3NlckV2ZW50LmFsdEtleSlcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dC5yZW1vdmVFdmVudEhhbmRsZXIodGhpcyk7XG5cdFx0aWYgKHRoaXMuX21vdXNlTGVhdmVNb25pdG9yKSB7XG5cdFx0XHR0aGlzLl9tb3VzZUxlYXZlTW9uaXRvci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tb3VzZUxlYXZlTW9uaXRvciA9IG51bGw7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vIC0tLSBiZWdpbiBldmVudCBoYW5kbGVyc1xuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykpIHtcblx0XHRcdC8vIGxheW91dCBjaGFuZ2Vcblx0XHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykuaGVpZ2h0O1xuXHRcdFx0aWYgKHRoaXMuX2hlaWdodCAhPT0gaGVpZ2h0KSB7XG5cdFx0XHRcdHRoaXMuX2hlaWdodCA9IGhlaWdodDtcblx0XHRcdFx0dGhpcy5fbW91c2VEb3duT3BlcmF0aW9uLm9uSGVpZ2h0Q2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0N1cnNvclN0YXRlQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbW91c2VEb3duT3BlcmF0aW9uLm9uQ3Vyc29yU3RhdGVDaGFuZ2VkKGUpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Gb2N1c0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Rm9jdXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gLS0tIGVuZCBldmVudCBoYW5kbGVyc1xuXG5cdHB1YmxpYyBnZXRUYXJnZXRBdENsaWVudFBvaW50KGNsaWVudFg6IG51bWJlciwgY2xpZW50WTogbnVtYmVyKTogSU1vdXNlVGFyZ2V0IHwgbnVsbCB7XG5cdFx0Y29uc3QgY2xpZW50UG9zID0gbmV3IENsaWVudENvb3JkaW5hdGVzKGNsaWVudFgsIGNsaWVudFkpO1xuXHRcdGNvbnN0IHBvcyA9IGNsaWVudFBvcy50b1BhZ2VDb29yZGluYXRlcyhkb20uZ2V0V2luZG93KHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSkpO1xuXHRcdGNvbnN0IGVkaXRvclBvcyA9IGNyZWF0ZUVkaXRvclBhZ2VQb3NpdGlvbih0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUpO1xuXG5cdFx0aWYgKHBvcy55IDwgZWRpdG9yUG9zLnkgfHwgcG9zLnkgPiBlZGl0b3JQb3MueSArIGVkaXRvclBvcy5oZWlnaHQgfHwgcG9zLnggPCBlZGl0b3JQb3MueCB8fCBwb3MueCA+IGVkaXRvclBvcy54ICsgZWRpdG9yUG9zLndpZHRoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZWxhdGl2ZVBvcyA9IGNyZWF0ZUNvb3JkaW5hdGVzUmVsYXRpdmVUb0VkaXRvcih0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUsIGVkaXRvclBvcywgcG9zKTtcblx0XHRyZXR1cm4gdGhpcy5tb3VzZVRhcmdldEZhY3RvcnkuY3JlYXRlTW91c2VUYXJnZXQodGhpcy52aWV3SGVscGVyLmdldExhc3RSZW5kZXJEYXRhKCksIGVkaXRvclBvcywgcG9zLCByZWxhdGl2ZVBvcywgbnVsbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZU1vdXNlVGFyZ2V0KGU6IEVkaXRvck1vdXNlRXZlbnQsIHRlc3RFdmVudFRhcmdldDogYm9vbGVhbik6IElNb3VzZVRhcmdldCB7XG5cdFx0bGV0IHRhcmdldDogSFRNTEVsZW1lbnQgfCBudWxsID0gZS50YXJnZXQ7XG5cdFx0aWYgKCF0aGlzLnZpZXdIZWxwZXIudmlld0RvbU5vZGUuY29udGFpbnModGFyZ2V0KSkge1xuXHRcdFx0Y29uc3Qgc2hhZG93Um9vdCA9IGRvbS5nZXRTaGFkb3dSb290KHRoaXMudmlld0hlbHBlci52aWV3RG9tTm9kZSk7XG5cdFx0XHRpZiAoc2hhZG93Um9vdCkge1xuXHRcdFx0XHRjb25zdCBwb3RlbnRpYWxUYXJnZXQgPSBzaGFkb3dSb290LmVsZW1lbnRzRnJvbVBvaW50KGUucG9zeCwgZS5wb3N5KS5maW5kKFxuXHRcdFx0XHRcdChlbDogRWxlbWVudCkgPT4gdGhpcy52aWV3SGVscGVyLnZpZXdEb21Ob2RlLmNvbnRhaW5zKGVsKVxuXHRcdFx0XHQpID8/IG51bGw7XG5cdFx0XHRcdHRhcmdldCA9IHBvdGVudGlhbFRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubW91c2VUYXJnZXRGYWN0b3J5LmNyZWF0ZU1vdXNlVGFyZ2V0KHRoaXMudmlld0hlbHBlci5nZXRMYXN0UmVuZGVyRGF0YSgpLCBlLmVkaXRvclBvcywgZS5wb3MsIGUucmVsYXRpdmVQb3MsIHRlc3RFdmVudFRhcmdldCA/IHRhcmdldCA6IG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TW91c2VDb2x1bW4oZTogRWRpdG9yTW91c2VFdmVudCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW91c2VUYXJnZXRGYWN0b3J5LmdldE1vdXNlQ29sdW1uKGUucmVsYXRpdmVQb3MpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9vbkNvbnRleHRNZW51KGU6IEVkaXRvck1vdXNlRXZlbnQsIHRlc3RFdmVudFRhcmdldDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMudmlld0NvbnRyb2xsZXIuZW1pdENvbnRleHRNZW51KHtcblx0XHRcdGV2ZW50OiBlLFxuXHRcdFx0dGFyZ2V0OiB0aGlzLl9jcmVhdGVNb3VzZVRhcmdldChlLCB0ZXN0RXZlbnRUYXJnZXQpXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uTW91c2VNb3ZlKGU6IEVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRJc1dpZGdldCA9IHRoaXMubW91c2VUYXJnZXRGYWN0b3J5Lm1vdXNlVGFyZ2V0SXNXaWRnZXQoZSk7XG5cdFx0aWYgKCF0YXJnZXRJc1dpZGdldCkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9tb3VzZURvd25PcGVyYXRpb24uaXNBY3RpdmUoKSkge1xuXHRcdFx0Ly8gSW4gc2VsZWN0aW9uL2RyYWcgb3BlcmF0aW9uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFjdHVhbE1vdXNlTW92ZVRpbWUgPSBlLnRpbWVzdGFtcDtcblx0XHRpZiAoYWN0dWFsTW91c2VNb3ZlVGltZSA8IHRoaXMubGFzdE1vdXNlTGVhdmVUaW1lKSB7XG5cdFx0XHQvLyBEdWUgdG8gdGhyb3R0bGluZywgdGhpcyBldmVudCBvY2N1cnJlZCBiZWZvcmUgdGhlIG1vdXNlIGxlZnQgdGhlIGVkaXRvciwgdGhlcmVmb3JlIGlnbm9yZSBpdC5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdDb250cm9sbGVyLmVtaXRNb3VzZU1vdmUoe1xuXHRcdFx0ZXZlbnQ6IGUsXG5cdFx0XHR0YXJnZXQ6IHRoaXMuX2NyZWF0ZU1vdXNlVGFyZ2V0KGUsIHRydWUpXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uTW91c2VMZWF2ZShlOiBFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21vdXNlTGVhdmVNb25pdG9yKSB7XG5cdFx0XHR0aGlzLl9tb3VzZUxlYXZlTW9uaXRvci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tb3VzZUxlYXZlTW9uaXRvciA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMubGFzdE1vdXNlTGVhdmVUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblx0XHR0aGlzLnZpZXdDb250cm9sbGVyLmVtaXRNb3VzZUxlYXZlKHtcblx0XHRcdGV2ZW50OiBlLFxuXHRcdFx0dGFyZ2V0OiBudWxsXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uTW91c2VVcChlOiBFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy52aWV3Q29udHJvbGxlci5lbWl0TW91c2VVcCh7XG5cdFx0XHRldmVudDogZSxcblx0XHRcdHRhcmdldDogdGhpcy5fY3JlYXRlTW91c2VUYXJnZXQoZSwgdHJ1ZSlcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfb25Nb3VzZURvd24oZTogRWRpdG9yTW91c2VFdmVudCwgcG9pbnRlcklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0ID0gdGhpcy5fY3JlYXRlTW91c2VUYXJnZXQoZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCB0YXJnZXRJc0NvbnRlbnQgPSAodC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUIHx8IHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfRU1QVFkpO1xuXHRcdGNvbnN0IHRhcmdldElzR3V0dGVyID0gKHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9HTFlQSF9NQVJHSU4gfHwgdC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfTlVNQkVSUyB8fCB0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUyk7XG5cdFx0Y29uc3QgdGFyZ2V0SXNMaW5lTnVtYmVycyA9ICh0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9OVU1CRVJTKTtcblx0XHRjb25zdCBzZWxlY3RPbkxpbmVOdW1iZXJzID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zZWxlY3RPbkxpbmVOdW1iZXJzKTtcblx0XHRjb25zdCB0YXJnZXRJc1ZpZXdab25lID0gKHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVklFV19aT05FIHx8IHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9WSUVXX1pPTkUpO1xuXHRcdGNvbnN0IHRhcmdldElzV2lkZ2V0ID0gKHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfV0lER0VUKTtcblxuXHRcdGxldCBzaG91bGRIYW5kbGUgPSBlLmxlZnRCdXR0b24gfHwgZS5taWRkbGVCdXR0b247XG5cdFx0aWYgKHBsYXRmb3JtLmlzTWFjaW50b3NoICYmIGUubGVmdEJ1dHRvbiAmJiBlLmN0cmxLZXkpIHtcblx0XHRcdHNob3VsZEhhbmRsZSA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzID0gKCkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy52aWV3SGVscGVyLmZvY3VzVGV4dEFyZWEoKTtcblx0XHR9O1xuXG5cdFx0aWYgKHNob3VsZEhhbmRsZSAmJiAodGFyZ2V0SXNDb250ZW50IHx8ICh0YXJnZXRJc0xpbmVOdW1iZXJzICYmIHNlbGVjdE9uTGluZU51bWJlcnMpKSkge1xuXHRcdFx0Zm9jdXMoKTtcblx0XHRcdHRoaXMuX21vdXNlRG93bk9wZXJhdGlvbi5zdGFydCh0LnR5cGUsIGUsIHBvaW50ZXJJZCk7XG5cblx0XHR9IGVsc2UgaWYgKHRhcmdldElzR3V0dGVyKSB7XG5cdFx0XHQvLyBEbyBub3Qgc3RlYWwgZm9jdXNcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHR9IGVsc2UgaWYgKHRhcmdldElzVmlld1pvbmUpIHtcblx0XHRcdGNvbnN0IHZpZXdab25lRGF0YSA9IHQuZGV0YWlsO1xuXHRcdFx0aWYgKHNob3VsZEhhbmRsZSAmJiB0aGlzLnZpZXdIZWxwZXIuc2hvdWxkU3VwcHJlc3NNb3VzZURvd25PblZpZXdab25lKHZpZXdab25lRGF0YS52aWV3Wm9uZUlkKSkge1xuXHRcdFx0XHRmb2N1cygpO1xuXHRcdFx0XHR0aGlzLl9tb3VzZURvd25PcGVyYXRpb24uc3RhcnQodC50eXBlLCBlLCBwb2ludGVySWQpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0YXJnZXRJc1dpZGdldCAmJiB0aGlzLnZpZXdIZWxwZXIuc2hvdWxkU3VwcHJlc3NNb3VzZURvd25PbldpZGdldCh0LmRldGFpbCkpIHtcblx0XHRcdGZvY3VzKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3Q29udHJvbGxlci5lbWl0TW91c2VEb3duKHtcblx0XHRcdGV2ZW50OiBlLFxuXHRcdFx0dGFyZ2V0OiB0XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX29uTW91c2VXaGVlbChlOiBJTW91c2VXaGVlbEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy52aWV3Q29udHJvbGxlci5lbWl0TW91c2VXaGVlbChlKTtcblx0fVxufVxuXG5jbGFzcyBNb3VzZURvd25PcGVyYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jcmVhdGVNb3VzZVRhcmdldDogKGU6IEVkaXRvck1vdXNlRXZlbnQsIHRlc3RFdmVudFRhcmdldDogYm9vbGVhbikgPT4gSU1vdXNlVGFyZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nZXRNb3VzZUNvbHVtbjogKGU6IEVkaXRvck1vdXNlRXZlbnQpID0+IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb3VzZU1vdmVNb25pdG9yOiBHbG9iYWxFZGl0b3JQb2ludGVyTW92ZU1vbml0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvcEJvdHRvbURyYWdTY3JvbGxpbmc6IFRvcEJvdHRvbURyYWdTY3JvbGxpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xlZnRSaWdodERyYWdTY3JvbGxpbmc6IExlZnRSaWdodERyYWdTY3JvbGxpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vdXNlU3RhdGU6IE1vdXNlRG93blN0YXRlO1xuXG5cdHByaXZhdGUgX2N1cnJlbnRTZWxlY3Rpb246IFNlbGVjdGlvbjtcblx0cHJpdmF0ZSBfaXNBY3RpdmU6IGJvb2xlYW47XG5cdHByaXZhdGUgX2xhc3RNb3VzZUV2ZW50OiBFZGl0b3JNb3VzZUV2ZW50IHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBWaWV3Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3Q29udHJvbGxlcjogVmlld0NvbnRyb2xsZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0hlbHBlcjogSVBvaW50ZXJIYW5kbGVySGVscGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vdXNlVGFyZ2V0RmFjdG9yeTogTW91c2VUYXJnZXRGYWN0b3J5LFxuXHRcdGNyZWF0ZU1vdXNlVGFyZ2V0OiAoZTogRWRpdG9yTW91c2VFdmVudCwgdGVzdEV2ZW50VGFyZ2V0OiBib29sZWFuKSA9PiBJTW91c2VUYXJnZXQsXG5cdFx0Z2V0TW91c2VDb2x1bW46IChlOiBFZGl0b3JNb3VzZUV2ZW50KSA9PiBudW1iZXJcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jcmVhdGVNb3VzZVRhcmdldCA9IGNyZWF0ZU1vdXNlVGFyZ2V0O1xuXHRcdHRoaXMuX2dldE1vdXNlQ29sdW1uID0gZ2V0TW91c2VDb2x1bW47XG5cblx0XHR0aGlzLl9tb3VzZU1vdmVNb25pdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEdsb2JhbEVkaXRvclBvaW50ZXJNb3ZlTW9uaXRvcih0aGlzLl92aWV3SGVscGVyLnZpZXdEb21Ob2RlKSk7XG5cdFx0dGhpcy5fdG9wQm90dG9tRHJhZ1Njcm9sbGluZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb3BCb3R0b21EcmFnU2Nyb2xsaW5nKFxuXHRcdFx0dGhpcy5fY29udGV4dCxcblx0XHRcdHRoaXMuX3ZpZXdIZWxwZXIsXG5cdFx0XHR0aGlzLl9tb3VzZVRhcmdldEZhY3RvcnksXG5cdFx0XHQocG9zaXRpb24sIGluU2VsZWN0aW9uTW9kZSwgcmV2ZWFsVHlwZSkgPT4gdGhpcy5fZGlzcGF0Y2hNb3VzZShwb3NpdGlvbiwgaW5TZWxlY3Rpb25Nb2RlLCByZXZlYWxUeXBlKVxuXHRcdCkpO1xuXHRcdHRoaXMuX2xlZnRSaWdodERyYWdTY3JvbGxpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgTGVmdFJpZ2h0RHJhZ1Njcm9sbGluZyhcblx0XHRcdHRoaXMuX2NvbnRleHQsXG5cdFx0XHR0aGlzLl92aWV3SGVscGVyLFxuXHRcdFx0dGhpcy5fbW91c2VUYXJnZXRGYWN0b3J5LFxuXHRcdFx0KHBvc2l0aW9uLCBpblNlbGVjdGlvbk1vZGUsIHJldmVhbFR5cGUpID0+IHRoaXMuX2Rpc3BhdGNoTW91c2UocG9zaXRpb24sIGluU2VsZWN0aW9uTW9kZSwgcmV2ZWFsVHlwZSlcblx0XHQpKTtcblx0XHR0aGlzLl9tb3VzZVN0YXRlID0gbmV3IE1vdXNlRG93blN0YXRlKCk7XG5cblx0XHR0aGlzLl9jdXJyZW50U2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKTtcblx0XHR0aGlzLl9pc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2xhc3RNb3VzZUV2ZW50ID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBpc0FjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNBY3RpdmU7XG5cdH1cblxuXHRwcml2YXRlIF9vbk1vdXNlRG93blRoZW5Nb3ZlKGU6IEVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0TW91c2VFdmVudCA9IGU7XG5cdFx0dGhpcy5fbW91c2VTdGF0ZS5zZXRNb2RpZmllcnMoZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2ZpbmRNb3VzZVBvc2l0aW9uKGUsIGZhbHNlKTtcblx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHQvLyBJZ25vcmluZyBiZWNhdXNlIHBvc2l0aW9uIGlzIHVua25vd25cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbW91c2VTdGF0ZS5pc0RyYWdBbmREcm9wKSB7XG5cdFx0XHR0aGlzLl92aWV3Q29udHJvbGxlci5lbWl0TW91c2VEcmFnKHtcblx0XHRcdFx0ZXZlbnQ6IGUsXG5cdFx0XHRcdHRhcmdldDogcG9zaXRpb25cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAocG9zaXRpb24udHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLk9VVFNJREVfRURJVE9SKSB7XG5cdFx0XHRcdGlmIChwb3NpdGlvbi5vdXRzaWRlUG9zaXRpb24gPT09ICdhYm92ZScgfHwgcG9zaXRpb24ub3V0c2lkZVBvc2l0aW9uID09PSAnYmVsb3cnKSB7XG5cdFx0XHRcdFx0dGhpcy5fdG9wQm90dG9tRHJhZ1Njcm9sbGluZy5zdGFydChwb3NpdGlvbiwgZSk7XG5cdFx0XHRcdFx0dGhpcy5fbGVmdFJpZ2h0RHJhZ1Njcm9sbGluZy5zdG9wKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbGVmdFJpZ2h0RHJhZ1Njcm9sbGluZy5zdGFydChwb3NpdGlvbiwgZSk7XG5cdFx0XHRcdFx0dGhpcy5fdG9wQm90dG9tRHJhZ1Njcm9sbGluZy5zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3RvcEJvdHRvbURyYWdTY3JvbGxpbmcuc3RvcCgpO1xuXHRcdFx0XHR0aGlzLl9sZWZ0UmlnaHREcmFnU2Nyb2xsaW5nLnN0b3AoKTtcblx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hNb3VzZShwb3NpdGlvbiwgdHJ1ZSwgTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlLk1pbmltYWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGFydCh0YXJnZXRUeXBlOiBNb3VzZVRhcmdldFR5cGUsIGU6IEVkaXRvck1vdXNlRXZlbnQsIHBvaW50ZXJJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdE1vdXNlRXZlbnQgPSBlO1xuXG5cdFx0dGhpcy5fbW91c2VTdGF0ZS5zZXRTdGFydGVkT25MaW5lTnVtYmVycyh0YXJnZXRUeXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0xJTkVfTlVNQkVSUyk7XG5cdFx0dGhpcy5fbW91c2VTdGF0ZS5zZXRTdGFydEJ1dHRvbnMoZSk7XG5cdFx0dGhpcy5fbW91c2VTdGF0ZS5zZXRNb2RpZmllcnMoZSk7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9maW5kTW91c2VQb3NpdGlvbihlLCB0cnVlKTtcblx0XHRpZiAoIXBvc2l0aW9uIHx8ICFwb3NpdGlvbi5wb3NpdGlvbikge1xuXHRcdFx0Ly8gSWdub3JpbmcgYmVjYXVzZSBwb3NpdGlvbiBpcyB1bmtub3duXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbW91c2VTdGF0ZS50cnlTZXRDb3VudChlLmRldGFpbCwgcG9zaXRpb24ucG9zaXRpb24pO1xuXG5cdFx0Ly8gT3ZlcndyaXRlIHRoZSBkZXRhaWwgb2YgdGhlIE1vdXNlRXZlbnQsIGFzIGl0IHdpbGwgYmUgc2VudCBvdXQgaW4gYW4gZXZlbnQgYW5kIGNvbnRyaWJ1dGlvbnMgbWlnaHQgcmVseSBvbiBpdC5cblx0XHRlLmRldGFpbCA9IHRoaXMuX21vdXNlU3RhdGUuY291bnQ7XG5cblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cblx0XHRpZiAoIW9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yZWFkT25seSlcblx0XHRcdCYmIG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5kcmFnQW5kRHJvcClcblx0XHRcdCYmICFvcHRpb25zLmdldChFZGl0b3JPcHRpb24uY29sdW1uU2VsZWN0aW9uKVxuXHRcdFx0JiYgIXRoaXMuX21vdXNlU3RhdGUuYWx0S2V5IC8vIHdlIGRvbid0IHN1cHBvcnQgbXVsdGlwbGUgbW91c2Vcblx0XHRcdCYmIGUuZGV0YWlsIDwgMiAvLyBvbmx5IHNpbmdsZSBjbGljayBvbiBhIHNlbGVjdGlvbiBjYW4gd29ya1xuXHRcdFx0JiYgIXRoaXMuX2lzQWN0aXZlIC8vIHRoZSBtb3VzZSBpcyBub3QgZG93biB5ZXRcblx0XHRcdCYmICF0aGlzLl9jdXJyZW50U2VsZWN0aW9uLmlzRW1wdHkoKSAvLyB3ZSBkb24ndCBkcmFnIHNpbmdsZSBjdXJzb3Jcblx0XHRcdCYmIChwb3NpdGlvbi50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKSAvLyBzaW5nbGUgY2xpY2sgb24gdGV4dFxuXHRcdFx0JiYgcG9zaXRpb24ucG9zaXRpb24gJiYgdGhpcy5fY3VycmVudFNlbGVjdGlvbi5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uLnBvc2l0aW9uKSAvLyBzaW5nbGUgY2xpY2sgb24gYSBzZWxlY3Rpb25cblx0XHQpIHtcblx0XHRcdHRoaXMuX21vdXNlU3RhdGUuaXNEcmFnQW5kRHJvcCA9IHRydWU7XG5cdFx0XHR0aGlzLl9pc0FjdGl2ZSA9IHRydWU7XG5cblx0XHRcdHRoaXMuX21vdXNlTW92ZU1vbml0b3Iuc3RhcnRNb25pdG9yaW5nKFxuXHRcdFx0XHR0aGlzLl92aWV3SGVscGVyLnZpZXdMaW5lc0RvbU5vZGUsXG5cdFx0XHRcdHBvaW50ZXJJZCxcblx0XHRcdFx0ZS5idXR0b25zLFxuXHRcdFx0XHQoZSkgPT4gdGhpcy5fb25Nb3VzZURvd25UaGVuTW92ZShlKSxcblx0XHRcdFx0KGJyb3dzZXJFdmVudD86IE1vdXNlRXZlbnQgfCBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9maW5kTW91c2VQb3NpdGlvbih0aGlzLl9sYXN0TW91c2VFdmVudCEsIGZhbHNlKTtcblxuXHRcdFx0XHRcdGlmIChkb20uaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkpIHtcblx0XHRcdFx0XHRcdC8vIGNhbmNlbFxuXHRcdFx0XHRcdFx0dGhpcy5fdmlld0NvbnRyb2xsZXIuZW1pdE1vdXNlRHJvcENhbmNlbGVkKCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX3ZpZXdDb250cm9sbGVyLmVtaXRNb3VzZURyb3Aoe1xuXHRcdFx0XHRcdFx0XHRldmVudDogdGhpcy5fbGFzdE1vdXNlRXZlbnQhLFxuXHRcdFx0XHRcdFx0XHR0YXJnZXQ6IChwb3NpdGlvbiA/IHRoaXMuX2NyZWF0ZU1vdXNlVGFyZ2V0KHRoaXMuX2xhc3RNb3VzZUV2ZW50ISwgdHJ1ZSkgOiBudWxsKSAvLyBJZ25vcmluZyBiZWNhdXNlIHBvc2l0aW9uIGlzIHVua25vd24sIGUuZy4sIENvbnRlbnQgVmlldyBab25lXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9tb3VzZVN0YXRlLmlzRHJhZ0FuZERyb3AgPSBmYWxzZTtcblx0XHR0aGlzLl9kaXNwYXRjaE1vdXNlKHBvc2l0aW9uLCBlLnNoaWZ0S2V5LCBOYXZpZ2F0aW9uQ29tbWFuZFJldmVhbFR5cGUuTWluaW1hbCk7XG5cblx0XHRpZiAoIXRoaXMuX2lzQWN0aXZlKSB7XG5cdFx0XHR0aGlzLl9pc0FjdGl2ZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9tb3VzZU1vdmVNb25pdG9yLnN0YXJ0TW9uaXRvcmluZyhcblx0XHRcdFx0dGhpcy5fdmlld0hlbHBlci52aWV3TGluZXNEb21Ob2RlLFxuXHRcdFx0XHRwb2ludGVySWQsXG5cdFx0XHRcdGUuYnV0dG9ucyxcblx0XHRcdFx0KGUpID0+IHRoaXMuX29uTW91c2VEb3duVGhlbk1vdmUoZSksXG5cdFx0XHRcdCgpID0+IHRoaXMuX3N0b3AoKVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzQWN0aXZlID0gZmFsc2U7XG5cdFx0dGhpcy5fdG9wQm90dG9tRHJhZ1Njcm9sbGluZy5zdG9wKCk7XG5cdFx0dGhpcy5fbGVmdFJpZ2h0RHJhZ1Njcm9sbGluZy5zdG9wKCk7XG5cdH1cblxuXHRwdWJsaWMgb25IZWlnaHRDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vdXNlTW92ZU1vbml0b3Iuc3RvcE1vbml0b3JpbmcoKTtcblx0fVxuXG5cdHB1YmxpYyBvblBvaW50ZXJVcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb3VzZU1vdmVNb25pdG9yLnN0b3BNb25pdG9yaW5nKCk7XG5cdH1cblxuXHRwdWJsaWMgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50U2VsZWN0aW9uID0gZS5zZWxlY3Rpb25zWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UG9zaXRpb25PdXRzaWRlRWRpdG9yKGU6IEVkaXRvck1vdXNlRXZlbnQpOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHRjb25zdCBlZGl0b3JDb250ZW50ID0gZS5lZGl0b3JQb3M7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbDtcblx0XHRjb25zdCB2aWV3TGF5b3V0ID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0O1xuXG5cdFx0Y29uc3QgbW91c2VDb2x1bW4gPSB0aGlzLl9nZXRNb3VzZUNvbHVtbihlKTtcblxuXHRcdGlmIChlLnBvc3kgPCBlZGl0b3JDb250ZW50LnkpIHtcblx0XHRcdGNvbnN0IG91dHNpZGVEaXN0YW5jZSA9IGVkaXRvckNvbnRlbnQueSAtIGUucG9zeTtcblx0XHRcdGNvbnN0IHZlcnRpY2FsT2Zmc2V0ID0gTWF0aC5tYXgodmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkgLSBvdXRzaWRlRGlzdGFuY2UsIDApO1xuXHRcdFx0Y29uc3Qgdmlld1pvbmVEYXRhID0gSGl0VGVzdENvbnRleHQuZ2V0Wm9uZUF0Q29vcmQodGhpcy5fY29udGV4dCwgdmVydGljYWxPZmZzZXQpO1xuXHRcdFx0aWYgKHZpZXdab25lRGF0YSkge1xuXHRcdFx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IHRoaXMuX2hlbHBQb3NpdGlvbkp1bXBPdmVyVmlld1pvbmUodmlld1pvbmVEYXRhKTtcblx0XHRcdFx0aWYgKG5ld1Bvc2l0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZU91dHNpZGVFZGl0b3IobW91c2VDb2x1bW4sIG5ld1Bvc2l0aW9uLCAnYWJvdmUnLCBvdXRzaWRlRGlzdGFuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFib3ZlTGluZU51bWJlciA9IHZpZXdMYXlvdXQuZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQodmVydGljYWxPZmZzZXQpO1xuXHRcdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZU91dHNpZGVFZGl0b3IobW91c2VDb2x1bW4sIG5ldyBQb3NpdGlvbihhYm92ZUxpbmVOdW1iZXIsIDEpLCAnYWJvdmUnLCBvdXRzaWRlRGlzdGFuY2UpO1xuXHRcdH1cblxuXHRcdGlmIChlLnBvc3kgPiBlZGl0b3JDb250ZW50LnkgKyBlZGl0b3JDb250ZW50LmhlaWdodCkge1xuXHRcdFx0Y29uc3Qgb3V0c2lkZURpc3RhbmNlID0gZS5wb3N5IC0gZWRpdG9yQ29udGVudC55IC0gZWRpdG9yQ29udGVudC5oZWlnaHQ7XG5cdFx0XHRjb25zdCB2ZXJ0aWNhbE9mZnNldCA9IHZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpICsgZS5yZWxhdGl2ZVBvcy55O1xuXHRcdFx0Y29uc3Qgdmlld1pvbmVEYXRhID0gSGl0VGVzdENvbnRleHQuZ2V0Wm9uZUF0Q29vcmQodGhpcy5fY29udGV4dCwgdmVydGljYWxPZmZzZXQpO1xuXHRcdFx0aWYgKHZpZXdab25lRGF0YSkge1xuXHRcdFx0XHRjb25zdCBuZXdQb3NpdGlvbiA9IHRoaXMuX2hlbHBQb3NpdGlvbkp1bXBPdmVyVmlld1pvbmUodmlld1pvbmVEYXRhKTtcblx0XHRcdFx0aWYgKG5ld1Bvc2l0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZU91dHNpZGVFZGl0b3IobW91c2VDb2x1bW4sIG5ld1Bvc2l0aW9uLCAnYmVsb3cnLCBvdXRzaWRlRGlzdGFuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJlbG93TGluZU51bWJlciA9IHZpZXdMYXlvdXQuZ2V0TGluZU51bWJlckF0VmVydGljYWxPZmZzZXQodmVydGljYWxPZmZzZXQpO1xuXHRcdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZU91dHNpZGVFZGl0b3IobW91c2VDb2x1bW4sIG5ldyBQb3NpdGlvbihiZWxvd0xpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oYmVsb3dMaW5lTnVtYmVyKSksICdiZWxvdycsIG91dHNpZGVEaXN0YW5jZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zc2libGVMaW5lTnVtYmVyID0gdmlld0xheW91dC5nZXRMaW5lTnVtYmVyQXRWZXJ0aWNhbE9mZnNldCh2aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKSArIGUucmVsYXRpdmVQb3MueSk7XG5cblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblxuXHRcdGNvbnN0IHhMZWZ0Qm91bmRhcnkgPSBsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0O1xuXHRcdGlmIChlLnJlbGF0aXZlUG9zLnggPD0geExlZnRCb3VuZGFyeSkge1xuXHRcdFx0Y29uc3Qgb3V0c2lkZURpc3RhbmNlID0geExlZnRCb3VuZGFyeSAtIGUucmVsYXRpdmVQb3MueDtcblx0XHRcdGNvbnN0IGlzUnRsID0gbW9kZWwuZ2V0VGV4dERpcmVjdGlvbihwb3NzaWJsZUxpbmVOdW1iZXIpID09PSBUZXh0RGlyZWN0aW9uLlJUTDtcblx0XHRcdHJldHVybiBNb3VzZVRhcmdldC5jcmVhdGVPdXRzaWRlRWRpdG9yKG1vdXNlQ29sdW1uLCBuZXcgUG9zaXRpb24ocG9zc2libGVMaW5lTnVtYmVyLCBpc1J0bCA/IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zc2libGVMaW5lTnVtYmVyKSA6IDEpLCAnbGVmdCcsIG91dHNpZGVEaXN0YW5jZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudFJpZ2h0ID0gKFxuXHRcdFx0bGF5b3V0SW5mby5taW5pbWFwLm1pbmltYXBMZWZ0ID09PSAwXG5cdFx0XHRcdD8gbGF5b3V0SW5mby53aWR0aCAtIGxheW91dEluZm8udmVydGljYWxTY3JvbGxiYXJXaWR0aCAvLyBIYXBwZW5zIHdoZW4gbWluaW1hcCBpcyBoaWRkZW5cblx0XHRcdFx0OiBsYXlvdXRJbmZvLm1pbmltYXAubWluaW1hcExlZnRcblx0XHQpO1xuXHRcdGNvbnN0IHhSaWdodEJvdW5kYXJ5ID0gY29udGVudFJpZ2h0O1xuXHRcdGlmIChlLnJlbGF0aXZlUG9zLnggPj0geFJpZ2h0Qm91bmRhcnkpIHtcblx0XHRcdGNvbnN0IG91dHNpZGVEaXN0YW5jZSA9IGUucmVsYXRpdmVQb3MueCAtIHhSaWdodEJvdW5kYXJ5O1xuXHRcdFx0Y29uc3QgaXNSdGwgPSBtb2RlbC5nZXRUZXh0RGlyZWN0aW9uKHBvc3NpYmxlTGluZU51bWJlcikgPT09IFRleHREaXJlY3Rpb24uUlRMO1xuXHRcdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZU91dHNpZGVFZGl0b3IobW91c2VDb2x1bW4sIG5ldyBQb3NpdGlvbihwb3NzaWJsZUxpbmVOdW1iZXIsIGlzUnRsID8gMSA6IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zc2libGVMaW5lTnVtYmVyKSksICdyaWdodCcsIG91dHNpZGVEaXN0YW5jZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTW91c2VQb3NpdGlvbihlOiBFZGl0b3JNb3VzZUV2ZW50LCB0ZXN0RXZlbnRUYXJnZXQ6IGJvb2xlYW4pOiBJTW91c2VUYXJnZXQgfCBudWxsIHtcblx0XHRjb25zdCBwb3NpdGlvbk91dHNpZGVFZGl0b3IgPSB0aGlzLl9nZXRQb3NpdGlvbk91dHNpZGVFZGl0b3IoZSk7XG5cdFx0aWYgKHBvc2l0aW9uT3V0c2lkZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHBvc2l0aW9uT3V0c2lkZUVkaXRvcjtcblx0XHR9XG5cblx0XHRjb25zdCB0ID0gdGhpcy5fY3JlYXRlTW91c2VUYXJnZXQoZSwgdGVzdEV2ZW50VGFyZ2V0KTtcblx0XHRjb25zdCBoaW50ZWRQb3NpdGlvbiA9IHQucG9zaXRpb247XG5cdFx0aWYgKCFoaW50ZWRQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVklFV19aT05FIHx8IHQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkdVVFRFUl9WSUVXX1pPTkUpIHtcblx0XHRcdGNvbnN0IG5ld1Bvc2l0aW9uID0gdGhpcy5faGVscFBvc2l0aW9uSnVtcE92ZXJWaWV3Wm9uZSh0LmRldGFpbCk7XG5cdFx0XHRpZiAobmV3UG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIE1vdXNlVGFyZ2V0LmNyZWF0ZVZpZXdab25lKHQudHlwZSwgdC5lbGVtZW50LCB0Lm1vdXNlQ29sdW1uLCBuZXdQb3NpdGlvbiwgdC5kZXRhaWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGVscFBvc2l0aW9uSnVtcE92ZXJWaWV3Wm9uZSh2aWV3Wm9uZURhdGE6IElNb3VzZVRhcmdldFZpZXdab25lRGF0YSk6IFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0Ly8gRm9yY2UgcG9zaXRpb24gb24gdmlldyB6b25lcyB0byBnbyBhYm92ZSBvciBiZWxvdyBkZXBlbmRpbmcgb24gd2hlcmUgc2VsZWN0aW9uIHN0YXJ0ZWQgZnJvbVxuXHRcdGNvbnN0IHNlbGVjdGlvblN0YXJ0ID0gbmV3IFBvc2l0aW9uKHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyLCB0aGlzLl9jdXJyZW50U2VsZWN0aW9uLnNlbGVjdGlvblN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBwb3NpdGlvbkJlZm9yZSA9IHZpZXdab25lRGF0YS5wb3NpdGlvbkJlZm9yZTtcblx0XHRjb25zdCBwb3NpdGlvbkFmdGVyID0gdmlld1pvbmVEYXRhLnBvc2l0aW9uQWZ0ZXI7XG5cblx0XHRpZiAocG9zaXRpb25CZWZvcmUgJiYgcG9zaXRpb25BZnRlcikge1xuXHRcdFx0aWYgKHBvc2l0aW9uQmVmb3JlLmlzQmVmb3JlKHNlbGVjdGlvblN0YXJ0KSkge1xuXHRcdFx0XHRyZXR1cm4gcG9zaXRpb25CZWZvcmU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcG9zaXRpb25BZnRlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwYXRjaE1vdXNlKHBvc2l0aW9uOiBJTW91c2VUYXJnZXQsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiwgcmV2ZWFsVHlwZTogTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlKTogdm9pZCB7XG5cdFx0aWYgKCFwb3NpdGlvbi5wb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl92aWV3Q29udHJvbGxlci5kaXNwYXRjaE1vdXNlKHtcblx0XHRcdHBvc2l0aW9uOiBwb3NpdGlvbi5wb3NpdGlvbixcblx0XHRcdG1vdXNlQ29sdW1uOiBwb3NpdGlvbi5tb3VzZUNvbHVtbixcblx0XHRcdHN0YXJ0ZWRPbkxpbmVOdW1iZXJzOiB0aGlzLl9tb3VzZVN0YXRlLnN0YXJ0ZWRPbkxpbmVOdW1iZXJzLFxuXHRcdFx0cmV2ZWFsVHlwZSxcblxuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiBpblNlbGVjdGlvbk1vZGUsXG5cdFx0XHRtb3VzZURvd25Db3VudDogdGhpcy5fbW91c2VTdGF0ZS5jb3VudCxcblx0XHRcdGFsdEtleTogdGhpcy5fbW91c2VTdGF0ZS5hbHRLZXksXG5cdFx0XHRjdHJsS2V5OiB0aGlzLl9tb3VzZVN0YXRlLmN0cmxLZXksXG5cdFx0XHRtZXRhS2V5OiB0aGlzLl9tb3VzZVN0YXRlLm1ldGFLZXksXG5cdFx0XHRzaGlmdEtleTogdGhpcy5fbW91c2VTdGF0ZS5zaGlmdEtleSxcblxuXHRcdFx0bGVmdEJ1dHRvbjogdGhpcy5fbW91c2VTdGF0ZS5sZWZ0QnV0dG9uLFxuXHRcdFx0bWlkZGxlQnV0dG9uOiB0aGlzLl9tb3VzZVN0YXRlLm1pZGRsZUJ1dHRvbixcblxuXHRcdFx0b25JbmplY3RlZFRleHQ6IHBvc2l0aW9uLnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQgJiYgcG9zaXRpb24uZGV0YWlsLmluamVjdGVkVGV4dCAhPT0gbnVsbFxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIE1vdXNlRG93blN0YXRlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTEVBUl9NT1VTRV9ET1dOX0NPVU5UX1RJTUUgPSA0MDA7IC8vIG1zXG5cblx0cHJpdmF0ZSBfYWx0S2V5OiBib29sZWFuO1xuXHRwdWJsaWMgZ2V0IGFsdEtleSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2FsdEtleTsgfVxuXG5cdHByaXZhdGUgX2N0cmxLZXk6IGJvb2xlYW47XG5cdHB1YmxpYyBnZXQgY3RybEtleSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2N0cmxLZXk7IH1cblxuXHRwcml2YXRlIF9tZXRhS2V5OiBib29sZWFuO1xuXHRwdWJsaWMgZ2V0IG1ldGFLZXkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9tZXRhS2V5OyB9XG5cblx0cHJpdmF0ZSBfc2hpZnRLZXk6IGJvb2xlYW47XG5cdHB1YmxpYyBnZXQgc2hpZnRLZXkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9zaGlmdEtleTsgfVxuXG5cdHByaXZhdGUgX2xlZnRCdXR0b246IGJvb2xlYW47XG5cdHB1YmxpYyBnZXQgbGVmdEJ1dHRvbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2xlZnRCdXR0b247IH1cblxuXHRwcml2YXRlIF9taWRkbGVCdXR0b246IGJvb2xlYW47XG5cdHB1YmxpYyBnZXQgbWlkZGxlQnV0dG9uKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fbWlkZGxlQnV0dG9uOyB9XG5cblx0cHJpdmF0ZSBfc3RhcnRlZE9uTGluZU51bWJlcnM6IGJvb2xlYW47XG5cdHB1YmxpYyBnZXQgc3RhcnRlZE9uTGluZU51bWJlcnMoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9zdGFydGVkT25MaW5lTnVtYmVyczsgfVxuXG5cdHByaXZhdGUgX2xhc3RNb3VzZURvd25Qb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXHRwcml2YXRlIF9sYXN0TW91c2VEb3duUG9zaXRpb25FcXVhbENvdW50OiBudW1iZXI7XG5cdHByaXZhdGUgX2xhc3RNb3VzZURvd25Db3VudDogbnVtYmVyO1xuXHRwcml2YXRlIF9sYXN0U2V0TW91c2VEb3duQ291bnRUaW1lOiBudW1iZXI7XG5cdHB1YmxpYyBpc0RyYWdBbmREcm9wOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2FsdEtleSA9IGZhbHNlO1xuXHRcdHRoaXMuX2N0cmxLZXkgPSBmYWxzZTtcblx0XHR0aGlzLl9tZXRhS2V5ID0gZmFsc2U7XG5cdFx0dGhpcy5fc2hpZnRLZXkgPSBmYWxzZTtcblx0XHR0aGlzLl9sZWZ0QnV0dG9uID0gZmFsc2U7XG5cdFx0dGhpcy5fbWlkZGxlQnV0dG9uID0gZmFsc2U7XG5cdFx0dGhpcy5fc3RhcnRlZE9uTGluZU51bWJlcnMgPSBmYWxzZTtcblx0XHR0aGlzLl9sYXN0TW91c2VEb3duUG9zaXRpb24gPSBudWxsO1xuXHRcdHRoaXMuX2xhc3RNb3VzZURvd25Qb3NpdGlvbkVxdWFsQ291bnQgPSAwO1xuXHRcdHRoaXMuX2xhc3RNb3VzZURvd25Db3VudCA9IDA7XG5cdFx0dGhpcy5fbGFzdFNldE1vdXNlRG93bkNvdW50VGltZSA9IDA7XG5cdFx0dGhpcy5pc0RyYWdBbmREcm9wID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RNb3VzZURvd25Db3VudDtcblx0fVxuXG5cdHB1YmxpYyBzZXRNb2RpZmllcnMoc291cmNlOiBFZGl0b3JNb3VzZUV2ZW50KSB7XG5cdFx0dGhpcy5fYWx0S2V5ID0gc291cmNlLmFsdEtleTtcblx0XHR0aGlzLl9jdHJsS2V5ID0gc291cmNlLmN0cmxLZXk7XG5cdFx0dGhpcy5fbWV0YUtleSA9IHNvdXJjZS5tZXRhS2V5O1xuXHRcdHRoaXMuX3NoaWZ0S2V5ID0gc291cmNlLnNoaWZ0S2V5O1xuXHR9XG5cblx0cHVibGljIHNldFN0YXJ0QnV0dG9ucyhzb3VyY2U6IEVkaXRvck1vdXNlRXZlbnQpIHtcblx0XHR0aGlzLl9sZWZ0QnV0dG9uID0gc291cmNlLmxlZnRCdXR0b247XG5cdFx0dGhpcy5fbWlkZGxlQnV0dG9uID0gc291cmNlLm1pZGRsZUJ1dHRvbjtcblx0fVxuXG5cdHB1YmxpYyBzZXRTdGFydGVkT25MaW5lTnVtYmVycyhzdGFydGVkT25MaW5lTnVtYmVyczogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXJ0ZWRPbkxpbmVOdW1iZXJzID0gc3RhcnRlZE9uTGluZU51bWJlcnM7XG5cdH1cblxuXHRwdWJsaWMgdHJ5U2V0Q291bnQoc2V0TW91c2VEb3duQ291bnQ6IG51bWJlciwgbmV3TW91c2VEb3duUG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Ly8gYS4gSW52YWxpZGF0ZSBtdWx0aXBsZSBjbGlja2luZyBpZiB0b28gbXVjaCB0aW1lIGhhcyBwYXNzZWQgKHdpbGwgYmUgaGl0IGJ5IElFIGJlY2F1c2UgdGhlIGRldGFpbCBmaWVsZCBvZiBtb3VzZSBldmVudHMgY29udGFpbnMgZ2FyYmFnZSBpbiBJRTEwKVxuXHRcdGNvbnN0IGN1cnJlbnRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblx0XHRpZiAoY3VycmVudFRpbWUgLSB0aGlzLl9sYXN0U2V0TW91c2VEb3duQ291bnRUaW1lID4gTW91c2VEb3duU3RhdGUuQ0xFQVJfTU9VU0VfRE9XTl9DT1VOVF9USU1FKSB7XG5cdFx0XHRzZXRNb3VzZURvd25Db3VudCA9IDE7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RTZXRNb3VzZURvd25Db3VudFRpbWUgPSBjdXJyZW50VGltZTtcblxuXHRcdC8vIGIuIEVuc3VyZSB0aGF0IHdlIGRvbid0IGp1bXAgZnJvbSBzaW5nbGUgY2xpY2sgdG8gdHJpcGxlIGNsaWNrIGluIG9uZSBnbyAod2lsbCBiZSBoaXQgYnkgSUUgYmVjYXVzZSB0aGUgZGV0YWlsIGZpZWxkIG9mIG1vdXNlIGV2ZW50cyBjb250YWlucyBnYXJiYWdlIGluIElFMTApXG5cdFx0aWYgKHNldE1vdXNlRG93bkNvdW50ID4gdGhpcy5fbGFzdE1vdXNlRG93bkNvdW50ICsgMSkge1xuXHRcdFx0c2V0TW91c2VEb3duQ291bnQgPSB0aGlzLl9sYXN0TW91c2VEb3duQ291bnQgKyAxO1xuXHRcdH1cblxuXHRcdC8vIGMuIEludmFsaWRhdGUgbXVsdGlwbGUgY2xpY2tpbmcgaWYgdGhlIGxvZ2ljYWwgcG9zaXRpb24gaXMgZGlmZmVyZW50XG5cdFx0aWYgKHRoaXMuX2xhc3RNb3VzZURvd25Qb3NpdGlvbiAmJiB0aGlzLl9sYXN0TW91c2VEb3duUG9zaXRpb24uZXF1YWxzKG5ld01vdXNlRG93blBvc2l0aW9uKSkge1xuXHRcdFx0dGhpcy5fbGFzdE1vdXNlRG93blBvc2l0aW9uRXF1YWxDb3VudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sYXN0TW91c2VEb3duUG9zaXRpb25FcXVhbENvdW50ID0gMTtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdE1vdXNlRG93blBvc2l0aW9uID0gbmV3TW91c2VEb3duUG9zaXRpb247XG5cblx0XHQvLyBGaW5hbGx5IHNldCB0aGUgbGFzdE1vdXNlRG93bkNvdW50XG5cdFx0dGhpcy5fbGFzdE1vdXNlRG93bkNvdW50ID0gTWF0aC5taW4oc2V0TW91c2VEb3duQ291bnQsIHRoaXMuX2xhc3RNb3VzZURvd25Qb3Np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
