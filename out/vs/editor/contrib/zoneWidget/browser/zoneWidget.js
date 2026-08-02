import * as dom from "../../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../../base/browser/domStylesheets.js";
import { Orientation, Sash, SashState } from "../../../../base/browser/ui/sash/sash.js";
import { Color, RGBA } from "../../../../base/common/color.js";
import { IdGenerator } from "../../../../base/common/idGenerator.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import * as objects from "../../../../base/common/objects.js";
import "./zoneWidget.css";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
const defaultColor = new Color(new RGBA(0, 122, 204));
const defaultOptions = {
  showArrow: true,
  showFrame: true,
  className: "",
  frameColor: defaultColor,
  arrowColor: defaultColor,
  keepEditorSelection: false
};
const WIDGET_ID = "vs.editor.contrib.zoneWidget";
class ViewZoneDelegate {
  constructor(domNode, afterLineNumber, afterColumn, heightInLines, onDomNodeTop, onComputedHeight, showInHiddenAreas, ordinal) {
    this.id = "";
    this.domNode = domNode;
    this.afterLineNumber = afterLineNumber;
    this.afterColumn = afterColumn;
    this.heightInLines = heightInLines;
    this.showInHiddenAreas = showInHiddenAreas;
    this.ordinal = ordinal;
    this._onDomNodeTop = onDomNodeTop;
    this._onComputedHeight = onComputedHeight;
  }
  onDomNodeTop(top) {
    this._onDomNodeTop(top);
  }
  onComputedHeight(height) {
    this._onComputedHeight(height);
  }
}
class OverlayWidgetDelegate {
  constructor(id, domNode) {
    this._id = id;
    this._domNode = domNode;
  }
  getId() {
    return this._id;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return null;
  }
}
const _Arrow = class _Arrow {
  constructor(_editor) {
    this._editor = _editor;
    this._ruleName = _Arrow._IdGenerator.nextId();
    this._color = null;
    this._height = -1;
    this._decorations = this._editor.createDecorationsCollection();
  }
  dispose() {
    this.hide();
    domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
  }
  set color(value) {
    if (this._color !== value) {
      this._color = value;
      this._updateStyle();
    }
  }
  set height(value) {
    if (this._height !== value) {
      this._height = value;
      this._updateStyle();
    }
  }
  _updateStyle() {
    domStylesheetsJs.removeCSSRulesContainingSelector(this._ruleName);
    domStylesheetsJs.createCSSRule(
      `.monaco-editor ${this._ruleName}`,
      `border-style: solid; border-color: transparent; border-bottom-color: ${this._color}; border-width: ${this._height}px; bottom: -${this._height}px !important; margin-left: -${this._height}px; `
    );
  }
  show(where) {
    if (where.column === 1) {
      where = { lineNumber: where.lineNumber, column: 2 };
    }
    this._decorations.set([{
      range: Range.fromPositions(where),
      options: {
        description: "zone-widget-arrow",
        className: this._ruleName,
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    }]);
  }
  hide() {
    this._decorations.clear();
  }
};
_Arrow._IdGenerator = new IdGenerator(".arrow-decoration-");
let Arrow = _Arrow;
class ZoneWidget {
  constructor(editor, options = {}) {
    this._arrow = null;
    this._overlayWidget = null;
    this._resizeSash = null;
    this._isSashResizeHeight = false;
    this._viewZone = null;
    this._disposables = new DisposableStore();
    this.container = null;
    this._isShowing = false;
    this.editor = editor;
    this._positionMarkerId = this.editor.createDecorationsCollection();
    this.options = objects.deepClone(options);
    objects.mixin(this.options, defaultOptions, false);
    this.domNode = document.createElement("div");
    if (!this.options.isAccessible) {
      this.domNode.setAttribute("aria-hidden", "true");
      this.domNode.setAttribute("role", "presentation");
    }
    this._disposables.add(this.editor.onDidLayoutChange((info) => {
      const width = this._getWidth(info);
      this.domNode.style.width = width + "px";
      this.domNode.style.left = this._getLeft(info) + "px";
      this._onWidth(width);
    }));
  }
  dispose() {
    if (this._overlayWidget) {
      this.editor.removeOverlayWidget(this._overlayWidget);
      this._overlayWidget = null;
    }
    if (this._viewZone) {
      this.editor.changeViewZones((accessor) => {
        if (this._viewZone) {
          accessor.removeZone(this._viewZone.id);
        }
        this._viewZone = null;
      });
    }
    this._positionMarkerId.clear();
    this._disposables.dispose();
  }
  create() {
    this.domNode.classList.add("zone-widget");
    if (this.options.className) {
      this.domNode.classList.add(this.options.className);
    }
    this.container = document.createElement("div");
    this.container.classList.add("zone-widget-container");
    this.domNode.appendChild(this.container);
    if (this.options.showArrow) {
      this._arrow = new Arrow(this.editor);
      this._disposables.add(this._arrow);
    }
    this._fillContainer(this.container);
    this._initSash();
    this._applyStyles();
  }
  style(styles) {
    if (styles.frameColor) {
      this.options.frameColor = styles.frameColor;
    }
    if (styles.arrowColor) {
      this.options.arrowColor = styles.arrowColor;
    }
    this._applyStyles();
  }
  _applyStyles() {
    if (this.container && this.options.frameColor) {
      const frameColor = this.options.frameColor.toString();
      this.container.style.borderTopColor = frameColor;
      this.container.style.borderBottomColor = frameColor;
    }
    if (this._arrow && this.options.arrowColor) {
      const arrowColor = this.options.arrowColor.toString();
      this._arrow.color = arrowColor;
    }
  }
  _getWidth(info) {
    return info.width - info.minimap.minimapWidth - info.verticalScrollbarWidth;
  }
  _getLeft(info) {
    if (info.minimap.minimapWidth > 0 && info.minimap.minimapLeft === 0) {
      return info.minimap.minimapWidth;
    }
    return 0;
  }
  _onViewZoneTop(top) {
    this.domNode.style.top = top + "px";
  }
  _onViewZoneHeight(height) {
    this.domNode.style.height = `${height}px`;
    if (this.container) {
      const containerHeight = height - this._decoratingElementsHeight();
      this.container.style.height = `${containerHeight}px`;
      const layoutInfo = this.editor.getLayoutInfo();
      this._doLayout(containerHeight, this._getWidth(layoutInfo));
    }
    this._resizeSash?.layout();
  }
  get position() {
    const range = this._positionMarkerId.getRange(0);
    if (!range) {
      return void 0;
    }
    return range.getStartPosition();
  }
  hasFocus() {
    return this.domNode.contains(dom.getActiveElement());
  }
  show(rangeOrPos, heightInLines) {
    const range = Range.isIRange(rangeOrPos) ? Range.lift(rangeOrPos) : Range.fromPositions(rangeOrPos);
    this._isShowing = true;
    this._showImpl(range, heightInLines);
    this._isShowing = false;
    this._positionMarkerId.set([{ range, options: ModelDecorationOptions.EMPTY }]);
  }
  updatePositionAndHeight(rangeOrPos, heightInLines) {
    if (this._viewZone) {
      rangeOrPos = Range.isIRange(rangeOrPos) ? Range.getStartPosition(rangeOrPos) : rangeOrPos;
      this._viewZone.afterLineNumber = rangeOrPos.lineNumber;
      this._viewZone.afterColumn = rangeOrPos.column;
      this._viewZone.heightInLines = heightInLines ?? this._viewZone.heightInLines;
      this.editor.changeViewZones((accessor) => {
        accessor.layoutZone(this._viewZone.id);
      });
      this._positionMarkerId.set([{
        range: Range.isIRange(rangeOrPos) ? rangeOrPos : Range.fromPositions(rangeOrPos),
        options: ModelDecorationOptions.EMPTY
      }]);
      this._updateSashEnablement();
    }
  }
  hide() {
    if (this._viewZone) {
      this.editor.changeViewZones((accessor) => {
        if (this._viewZone) {
          accessor.removeZone(this._viewZone.id);
        }
      });
      this._viewZone = null;
    }
    if (this._overlayWidget) {
      this.editor.removeOverlayWidget(this._overlayWidget);
      this._overlayWidget = null;
    }
    this._arrow?.hide();
    this._positionMarkerId.clear();
    this._isSashResizeHeight = false;
  }
  _decoratingElementsHeight() {
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    let result = 0;
    if (this.options.showArrow) {
      const arrowHeight = Math.round(lineHeight / 3);
      result += 2 * arrowHeight;
    }
    if (this.options.showFrame) {
      const frameThickness = this.options.frameWidth ?? Math.round(lineHeight / 9);
      result += 2 * frameThickness;
    }
    return result;
  }
  /** Gets the maximum widget height in lines. */
  _getMaximumHeightInLines() {
    return Math.max(12, this.editor.getLayoutInfo().height / this.editor.getOption(EditorOption.lineHeight) * 0.8);
  }
  _showImpl(where, heightInLines) {
    const position = where.getStartPosition();
    const layoutInfo = this.editor.getLayoutInfo();
    const width = this._getWidth(layoutInfo);
    this.domNode.style.width = `${width}px`;
    this.domNode.style.left = this._getLeft(layoutInfo) + "px";
    const viewZoneDomNode = document.createElement("div");
    viewZoneDomNode.style.overflow = "hidden";
    const lineHeight = this.editor.getOption(EditorOption.lineHeight);
    const maxHeightInLines = this._getMaximumHeightInLines();
    if (maxHeightInLines !== void 0) {
      heightInLines = Math.min(heightInLines, maxHeightInLines);
    }
    let arrowHeight = 0;
    let frameThickness = 0;
    if (this._arrow && this.options.showArrow) {
      arrowHeight = Math.round(lineHeight / 3);
      this._arrow.height = arrowHeight;
      this._arrow.show(position);
    }
    if (this.options.showFrame) {
      frameThickness = Math.round(lineHeight / 9);
    }
    this.editor.changeViewZones((accessor) => {
      if (this._viewZone) {
        accessor.removeZone(this._viewZone.id);
      }
      if (this._overlayWidget) {
        this.editor.removeOverlayWidget(this._overlayWidget);
        this._overlayWidget = null;
      }
      this.domNode.style.top = "-1000px";
      this._viewZone = new ViewZoneDelegate(
        viewZoneDomNode,
        position.lineNumber,
        position.column,
        heightInLines,
        (top) => this._onViewZoneTop(top),
        (height) => this._onViewZoneHeight(height),
        this.options.showInHiddenAreas,
        this.options.ordinal
      );
      this._viewZone.id = accessor.addZone(this._viewZone);
      this._overlayWidget = new OverlayWidgetDelegate(WIDGET_ID + this._viewZone.id, this.domNode);
      this.editor.addOverlayWidget(this._overlayWidget);
    });
    this._updateSashEnablement();
    if (this.container && this.options.showFrame) {
      const width2 = this.options.frameWidth ? this.options.frameWidth : frameThickness;
      this.container.style.borderTopWidth = width2 + "px";
      this.container.style.borderBottomWidth = width2 + "px";
    }
    const containerHeight = heightInLines * lineHeight - this._decoratingElementsHeight();
    if (this.container) {
      this.container.style.top = arrowHeight + "px";
      this.container.style.height = containerHeight + "px";
      this.container.style.overflow = "hidden";
    }
    this._doLayout(containerHeight, width);
    if (!this.options.keepEditorSelection) {
      this.editor.setSelection(where);
    }
    const model = this.editor.getModel();
    if (model) {
      const range = model.validateRange(new Range(where.startLineNumber, 1, where.endLineNumber + 1, 1));
      this.revealRange(range, range.startLineNumber === model.getLineCount());
    }
  }
  revealRange(range, isLastLine) {
    if (isLastLine) {
      this.editor.revealLineNearTop(range.endLineNumber, ScrollType.Smooth);
    } else {
      this.editor.revealRange(range, ScrollType.Smooth);
    }
  }
  setCssClass(className, classToReplace) {
    if (!this.container) {
      return;
    }
    if (classToReplace) {
      this.container.classList.remove(classToReplace);
    }
    this.container.classList.add(className);
  }
  _onWidth(widthInPixel) {
  }
  _doLayout(heightInPixel, widthInPixel) {
  }
  _relayout(_newHeightInLines, useMax) {
    const maxHeightInLines = this._getMaximumHeightInLines();
    const newHeightInLines = useMax && maxHeightInLines !== void 0 ? Math.min(maxHeightInLines, _newHeightInLines) : _newHeightInLines;
    if (this._viewZone && this._viewZone.heightInLines !== newHeightInLines) {
      this.editor.changeViewZones((accessor) => {
        if (this._viewZone) {
          this._viewZone.heightInLines = newHeightInLines;
          accessor.layoutZone(this._viewZone.id);
        }
      });
      this._updateSashEnablement();
    }
  }
  // --- sash
  _initSash() {
    if (this._resizeSash) {
      return;
    }
    this._resizeSash = this._disposables.add(new Sash(this.domNode, this, { orientation: Orientation.HORIZONTAL }));
    if (!this.options.isResizeable) {
      this._resizeSash.state = SashState.Disabled;
    }
    let data;
    this._disposables.add(this._resizeSash.onDidStart((e) => {
      if (this._viewZone) {
        data = {
          startY: e.startY,
          heightInLines: this._viewZone.heightInLines,
          ...this._getResizeBounds()
        };
      }
    }));
    this._disposables.add(this._resizeSash.onDidEnd(() => {
      data = void 0;
    }));
    this._disposables.add(this._resizeSash.onDidChange((evt) => {
      if (data) {
        const lineDelta = (evt.currentY - data.startY) / this.editor.getOption(EditorOption.lineHeight);
        const roundedLineDelta = lineDelta < 0 ? Math.ceil(lineDelta) : Math.floor(lineDelta);
        const newHeightInLines = data.heightInLines + roundedLineDelta;
        if (newHeightInLines > data.minLines && newHeightInLines < data.maxLines) {
          this._isSashResizeHeight = true;
          this._relayout(newHeightInLines);
        }
      }
    }));
  }
  _updateSashEnablement() {
    if (this._resizeSash) {
      const { minLines, maxLines } = this._getResizeBounds();
      this._resizeSash.state = minLines === maxLines ? SashState.Disabled : SashState.Enabled;
    }
  }
  get _usesResizeHeight() {
    return this._isSashResizeHeight;
  }
  _getResizeBounds() {
    return { minLines: 5, maxLines: 35 };
  }
  getHorizontalSashLeft() {
    return 0;
  }
  getHorizontalSashTop() {
    return (this.domNode.style.height === null ? 0 : parseInt(this.domNode.style.height)) - this._decoratingElementsHeight() / 2;
  }
  getHorizontalSashWidth() {
    const layoutInfo = this.editor.getLayoutInfo();
    return layoutInfo.width - layoutInfo.minimap.minimapWidth;
  }
}
export {
  OverlayWidgetDelegate,
  ZoneWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3pvbmVXaWRnZXQvYnJvd3Nlci96b25lV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHNKcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgSUhvcml6b250YWxTYXNoTGF5b3V0UHJvdmlkZXIsIElTYXNoRXZlbnQsIE9yaWVudGF0aW9uLCBTYXNoLCBTYXNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IENvbG9yLCBSR0JBIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSWRHZW5lcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pZEdlbmVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAnLi96b25lV2lkZ2V0LmNzcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24sIElWaWV3Wm9uZSwgSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yTGF5b3V0SW5mbywgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9wdGlvbnMge1xuXHRzaG93RnJhbWU/OiBib29sZWFuO1xuXHRzaG93QXJyb3c/OiBib29sZWFuO1xuXHRmcmFtZVdpZHRoPzogbnVtYmVyO1xuXHRjbGFzc05hbWU/OiBzdHJpbmc7XG5cdGlzQWNjZXNzaWJsZT86IGJvb2xlYW47XG5cdGlzUmVzaXplYWJsZT86IGJvb2xlYW47XG5cdGZyYW1lQ29sb3I/OiBDb2xvciB8IHN0cmluZztcblx0YXJyb3dDb2xvcj86IENvbG9yO1xuXHRrZWVwRWRpdG9yU2VsZWN0aW9uPzogYm9vbGVhbjtcblx0b3JkaW5hbD86IG51bWJlcjtcblx0c2hvd0luSGlkZGVuQXJlYXM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdHlsZXMge1xuXHRmcmFtZUNvbG9yPzogQ29sb3IgfCBzdHJpbmcgfCBudWxsO1xuXHRhcnJvd0NvbG9yPzogQ29sb3IgfCBudWxsO1xufVxuXG5jb25zdCBkZWZhdWx0Q29sb3IgPSBuZXcgQ29sb3IobmV3IFJHQkEoMCwgMTIyLCAyMDQpKTtcblxuY29uc3QgZGVmYXVsdE9wdGlvbnM6IElPcHRpb25zID0ge1xuXHRzaG93QXJyb3c6IHRydWUsXG5cdHNob3dGcmFtZTogdHJ1ZSxcblx0Y2xhc3NOYW1lOiAnJyxcblx0ZnJhbWVDb2xvcjogZGVmYXVsdENvbG9yLFxuXHRhcnJvd0NvbG9yOiBkZWZhdWx0Q29sb3IsXG5cdGtlZXBFZGl0b3JTZWxlY3Rpb246IGZhbHNlXG59O1xuXG5jb25zdCBXSURHRVRfSUQgPSAndnMuZWRpdG9yLmNvbnRyaWIuem9uZVdpZGdldCc7XG5cbmNsYXNzIFZpZXdab25lRGVsZWdhdGUgaW1wbGVtZW50cyBJVmlld1pvbmUge1xuXG5cdGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRpZDogc3RyaW5nID0gJyc7IC8vIEEgdmFsaWQgem9uZSBpZCBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDBcblx0YWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXI7XG5cdGFmdGVyQ29sdW1uOiBudW1iZXI7XG5cdGhlaWdodEluTGluZXM6IG51bWJlcjtcblx0cmVhZG9ubHkgc2hvd0luSGlkZGVuQXJlYXM6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9yZGluYWw6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRvbU5vZGVUb3A6ICh0b3A6IG51bWJlcikgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Db21wdXRlZEhlaWdodDogKGhlaWdodDogbnVtYmVyKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKGRvbU5vZGU6IEhUTUxFbGVtZW50LCBhZnRlckxpbmVOdW1iZXI6IG51bWJlciwgYWZ0ZXJDb2x1bW46IG51bWJlciwgaGVpZ2h0SW5MaW5lczogbnVtYmVyLFxuXHRcdG9uRG9tTm9kZVRvcDogKHRvcDogbnVtYmVyKSA9PiB2b2lkLFxuXHRcdG9uQ29tcHV0ZWRIZWlnaHQ6IChoZWlnaHQ6IG51bWJlcikgPT4gdm9pZCxcblx0XHRzaG93SW5IaWRkZW5BcmVhczogYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRvcmRpbmFsOiBudW1iZXIgfCB1bmRlZmluZWRcblx0KSB7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tTm9kZTtcblx0XHR0aGlzLmFmdGVyTGluZU51bWJlciA9IGFmdGVyTGluZU51bWJlcjtcblx0XHR0aGlzLmFmdGVyQ29sdW1uID0gYWZ0ZXJDb2x1bW47XG5cdFx0dGhpcy5oZWlnaHRJbkxpbmVzID0gaGVpZ2h0SW5MaW5lcztcblx0XHR0aGlzLnNob3dJbkhpZGRlbkFyZWFzID0gc2hvd0luSGlkZGVuQXJlYXM7XG5cdFx0dGhpcy5vcmRpbmFsID0gb3JkaW5hbDtcblx0XHR0aGlzLl9vbkRvbU5vZGVUb3AgPSBvbkRvbU5vZGVUb3A7XG5cdFx0dGhpcy5fb25Db21wdXRlZEhlaWdodCA9IG9uQ29tcHV0ZWRIZWlnaHQ7XG5cdH1cblxuXHRvbkRvbU5vZGVUb3AodG9wOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRvbU5vZGVUb3AodG9wKTtcblx0fVxuXG5cdG9uQ29tcHV0ZWRIZWlnaHQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkNvbXB1dGVkSGVpZ2h0KGhlaWdodCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE92ZXJsYXlXaWRnZXREZWxlZ2F0ZSBpbXBsZW1lbnRzIElPdmVybGF5V2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBkb21Ob2RlOiBIVE1MRWxlbWVudCkge1xuXHRcdHRoaXMuX2lkID0gaWQ7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvbU5vZGU7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmNsYXNzIEFycm93IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfSWRHZW5lcmF0b3IgPSBuZXcgSWRHZW5lcmF0b3IoJy5hcnJvdy1kZWNvcmF0aW9uLScpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3J1bGVOYW1lID0gQXJyb3cuX0lkR2VuZXJhdG9yLm5leHRJZCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblx0cHJpdmF0ZSBfY29sb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9oZWlnaHQ6IG51bWJlciA9IC0xO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3Jcblx0KSB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaGlkZSgpO1xuXHRcdGRvbVN0eWxlc2hlZXRzSnMucmVtb3ZlQ1NTUnVsZXNDb250YWluaW5nU2VsZWN0b3IodGhpcy5fcnVsZU5hbWUpO1xuXHR9XG5cblx0c2V0IGNvbG9yKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fY29sb3IgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLl9jb2xvciA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fdXBkYXRlU3R5bGUoKTtcblx0XHR9XG5cdH1cblxuXHRzZXQgaGVpZ2h0KHZhbHVlOiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5faGVpZ2h0ICE9PSB2YWx1ZSkge1xuXHRcdFx0dGhpcy5faGVpZ2h0ID0gdmFsdWU7XG5cdFx0XHR0aGlzLl91cGRhdGVTdHlsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVN0eWxlKCk6IHZvaWQge1xuXHRcdGRvbVN0eWxlc2hlZXRzSnMucmVtb3ZlQ1NTUnVsZXNDb250YWluaW5nU2VsZWN0b3IodGhpcy5fcnVsZU5hbWUpO1xuXHRcdGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlQ1NTUnVsZShcblx0XHRcdGAubW9uYWNvLWVkaXRvciAke3RoaXMuX3J1bGVOYW1lfWAsXG5cdFx0XHRgYm9yZGVyLXN0eWxlOiBzb2xpZDsgYm9yZGVyLWNvbG9yOiB0cmFuc3BhcmVudDsgYm9yZGVyLWJvdHRvbS1jb2xvcjogJHt0aGlzLl9jb2xvcn07IGJvcmRlci13aWR0aDogJHt0aGlzLl9oZWlnaHR9cHg7IGJvdHRvbTogLSR7dGhpcy5faGVpZ2h0fXB4ICFpbXBvcnRhbnQ7IG1hcmdpbi1sZWZ0OiAtJHt0aGlzLl9oZWlnaHR9cHg7IGBcblx0XHQpO1xuXHR9XG5cblx0c2hvdyh3aGVyZTogSVBvc2l0aW9uKTogdm9pZCB7XG5cblx0XHRpZiAod2hlcmUuY29sdW1uID09PSAxKSB7XG5cdFx0XHQvLyB0aGUgYXJyb3cgaXNuJ3QgcHJldHR5IGF0IGNvbHVtbiAxIGFuZCB3ZSBuZWVkIHRvIHB1c2ggaXQgb3V0IGEgbGl0dGxlXG5cdFx0XHR3aGVyZSA9IHsgbGluZU51bWJlcjogd2hlcmUubGluZU51bWJlciwgY29sdW1uOiAyIH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0KFt7XG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyh3aGVyZSksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnem9uZS13aWRnZXQtYXJyb3cnLFxuXHRcdFx0XHRjbGFzc05hbWU6IHRoaXMuX3J1bGVOYW1lLFxuXHRcdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdFx0fVxuXHRcdH1dKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgWm9uZVdpZGdldCBpbXBsZW1lbnRzIElIb3Jpem9udGFsU2FzaExheW91dFByb3ZpZGVyIHtcblxuXHRwcml2YXRlIF9hcnJvdzogQXJyb3cgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfb3ZlcmxheVdpZGdldDogT3ZlcmxheVdpZGdldERlbGVnYXRlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3Jlc2l6ZVNhc2g6IFNhc2ggfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfaXNTYXNoUmVzaXplSGVpZ2h0OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bvc2l0aW9uTWFya2VySWQ6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0cHJvdGVjdGVkIF92aWV3Wm9uZTogVmlld1pvbmVEZWxlZ2F0ZSB8IG51bGwgPSBudWxsO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0ZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdGVkaXRvcjogSUNvZGVFZGl0b3I7XG5cdG9wdGlvbnM6IElPcHRpb25zO1xuXG5cblx0Y29uc3RydWN0b3IoZWRpdG9yOiBJQ29kZUVkaXRvciwgb3B0aW9uczogSU9wdGlvbnMgPSB7fSkge1xuXHRcdHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX3Bvc2l0aW9uTWFya2VySWQgPSB0aGlzLmVkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvYmplY3RzLmRlZXBDbG9uZShvcHRpb25zKTtcblx0XHRvYmplY3RzLm1peGluKHRoaXMub3B0aW9ucywgZGVmYXVsdE9wdGlvbnMsIGZhbHNlKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5pc0FjY2Vzc2libGUpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncHJlc2VudGF0aW9uJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKChpbmZvOiBFZGl0b3JMYXlvdXRJbmZvKSA9PiB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMuX2dldFdpZHRoKGluZm8pO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLndpZHRoID0gd2lkdGggKyAncHgnO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmxlZnQgPSB0aGlzLl9nZXRMZWZ0KGluZm8pICsgJ3B4Jztcblx0XHRcdHRoaXMuX29uV2lkdGgod2lkdGgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX292ZXJsYXlXaWRnZXQpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcy5fb3ZlcmxheVdpZGdldCk7XG5cdFx0XHR0aGlzLl9vdmVybGF5V2lkZ2V0ID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fdmlld1pvbmUpIHtcblx0XHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodGhpcy5fdmlld1pvbmUuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3ZpZXdab25lID0gbnVsbDtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Bvc2l0aW9uTWFya2VySWQuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGNyZWF0ZSgpOiB2b2lkIHtcblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd6b25lLXdpZGdldCcpO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuY2xhc3NOYW1lKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCh0aGlzLm9wdGlvbnMuY2xhc3NOYW1lKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3pvbmUtd2lkZ2V0LWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLmNvbnRhaW5lcik7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zaG93QXJyb3cpIHtcblx0XHRcdHRoaXMuX2Fycm93ID0gbmV3IEFycm93KHRoaXMuZWRpdG9yKTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9hcnJvdyk7XG5cdFx0fVxuXHRcdHRoaXMuX2ZpbGxDb250YWluZXIodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMuX2luaXRTYXNoKCk7XG5cdFx0dGhpcy5fYXBwbHlTdHlsZXMoKTtcblx0fVxuXG5cdHN0eWxlKHN0eWxlczogSVN0eWxlcyk6IHZvaWQge1xuXHRcdGlmIChzdHlsZXMuZnJhbWVDb2xvcikge1xuXHRcdFx0dGhpcy5vcHRpb25zLmZyYW1lQ29sb3IgPSBzdHlsZXMuZnJhbWVDb2xvcjtcblx0XHR9XG5cdFx0aWYgKHN0eWxlcy5hcnJvd0NvbG9yKSB7XG5cdFx0XHR0aGlzLm9wdGlvbnMuYXJyb3dDb2xvciA9IHN0eWxlcy5hcnJvd0NvbG9yO1xuXHRcdH1cblx0XHR0aGlzLl9hcHBseVN0eWxlcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9hcHBseVN0eWxlcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250YWluZXIgJiYgdGhpcy5vcHRpb25zLmZyYW1lQ29sb3IpIHtcblx0XHRcdGNvbnN0IGZyYW1lQ29sb3IgPSB0aGlzLm9wdGlvbnMuZnJhbWVDb2xvci50b1N0cmluZygpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuYm9yZGVyVG9wQ29sb3IgPSBmcmFtZUNvbG9yO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuYm9yZGVyQm90dG9tQ29sb3IgPSBmcmFtZUNvbG9yO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYXJyb3cgJiYgdGhpcy5vcHRpb25zLmFycm93Q29sb3IpIHtcblx0XHRcdGNvbnN0IGFycm93Q29sb3IgPSB0aGlzLm9wdGlvbnMuYXJyb3dDb2xvci50b1N0cmluZygpO1xuXHRcdFx0dGhpcy5fYXJyb3cuY29sb3IgPSBhcnJvd0NvbG9yO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0V2lkdGgoaW5mbzogRWRpdG9yTGF5b3V0SW5mbyk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGluZm8ud2lkdGggLSBpbmZvLm1pbmltYXAubWluaW1hcFdpZHRoIC0gaW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGVmdChpbmZvOiBFZGl0b3JMYXlvdXRJbmZvKTogbnVtYmVyIHtcblx0XHQvLyBJZiBtaW5pbWFwIGlzIHRvIHRoZSBsZWZ0LCB3ZSBtb3ZlIGJleW9uZCBpdFxuXHRcdGlmIChpbmZvLm1pbmltYXAubWluaW1hcFdpZHRoID4gMCAmJiBpbmZvLm1pbmltYXAubWluaW1hcExlZnQgPT09IDApIHtcblx0XHRcdHJldHVybiBpbmZvLm1pbmltYXAubWluaW1hcFdpZHRoO1xuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHByaXZhdGUgX29uVmlld1pvbmVUb3AodG9wOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUudG9wID0gdG9wICsgJ3B4Jztcblx0fVxuXG5cdHByaXZhdGUgX29uVmlld1pvbmVIZWlnaHQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRcdGlmICh0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0Y29uc3QgY29udGFpbmVySGVpZ2h0ID0gaGVpZ2h0IC0gdGhpcy5fZGVjb3JhdGluZ0VsZW1lbnRzSGVpZ2h0KCk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtjb250YWluZXJIZWlnaHR9cHhgO1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRcdHRoaXMuX2RvTGF5b3V0KGNvbnRhaW5lckhlaWdodCwgdGhpcy5fZ2V0V2lkdGgobGF5b3V0SW5mbykpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jlc2l6ZVNhc2g/LmxheW91dCgpO1xuXHR9XG5cblx0Z2V0IHBvc2l0aW9uKCk6IFBvc2l0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYW5nZSA9IHRoaXMuX3Bvc2l0aW9uTWFya2VySWQuZ2V0UmFuZ2UoMCk7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0fVxuXG5cdGhhc0ZvY3VzKCkge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuY29udGFpbnMoZG9tLmdldEFjdGl2ZUVsZW1lbnQoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2lzU2hvd2luZzogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHNob3cocmFuZ2VPclBvczogSVJhbmdlIHwgSVBvc2l0aW9uLCBoZWlnaHRJbkxpbmVzOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmlzSVJhbmdlKHJhbmdlT3JQb3MpID8gUmFuZ2UubGlmdChyYW5nZU9yUG9zKSA6IFJhbmdlLmZyb21Qb3NpdGlvbnMocmFuZ2VPclBvcyk7XG5cdFx0dGhpcy5faXNTaG93aW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9zaG93SW1wbChyYW5nZSwgaGVpZ2h0SW5MaW5lcyk7XG5cdFx0dGhpcy5faXNTaG93aW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fcG9zaXRpb25NYXJrZXJJZC5zZXQoW3sgcmFuZ2UsIG9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuRU1QVFkgfV0pO1xuXHR9XG5cblx0dXBkYXRlUG9zaXRpb25BbmRIZWlnaHQocmFuZ2VPclBvczogSVJhbmdlIHwgSVBvc2l0aW9uLCBoZWlnaHRJbkxpbmVzPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ZpZXdab25lKSB7XG5cdFx0XHRyYW5nZU9yUG9zID0gUmFuZ2UuaXNJUmFuZ2UocmFuZ2VPclBvcykgPyBSYW5nZS5nZXRTdGFydFBvc2l0aW9uKHJhbmdlT3JQb3MpIDogcmFuZ2VPclBvcztcblx0XHRcdHRoaXMuX3ZpZXdab25lLmFmdGVyTGluZU51bWJlciA9IHJhbmdlT3JQb3MubGluZU51bWJlcjtcblx0XHRcdHRoaXMuX3ZpZXdab25lLmFmdGVyQ29sdW1uID0gcmFuZ2VPclBvcy5jb2x1bW47XG5cdFx0XHR0aGlzLl92aWV3Wm9uZS5oZWlnaHRJbkxpbmVzID0gaGVpZ2h0SW5MaW5lcyA/PyB0aGlzLl92aWV3Wm9uZS5oZWlnaHRJbkxpbmVzO1xuXG5cdFx0XHR0aGlzLmVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5sYXlvdXRab25lKHRoaXMuX3ZpZXdab25lIS5pZCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3Bvc2l0aW9uTWFya2VySWQuc2V0KFt7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5pc0lSYW5nZShyYW5nZU9yUG9zKSA/IHJhbmdlT3JQb3MgOiBSYW5nZS5mcm9tUG9zaXRpb25zKHJhbmdlT3JQb3MpLFxuXHRcdFx0XHRvcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zLkVNUFRZXG5cdFx0XHR9XSk7XG5cdFx0XHR0aGlzLl91cGRhdGVTYXNoRW5hYmxlbWVudCgpO1xuXHRcdH1cblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ZpZXdab25lKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fdmlld1pvbmUpIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKHRoaXMuX3ZpZXdab25lLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl92aWV3Wm9uZSA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vdmVybGF5V2lkZ2V0KSB7XG5cdFx0XHR0aGlzLmVkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMuX292ZXJsYXlXaWRnZXQpO1xuXHRcdFx0dGhpcy5fb3ZlcmxheVdpZGdldCA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX2Fycm93Py5oaWRlKCk7XG5cdFx0dGhpcy5fcG9zaXRpb25NYXJrZXJJZC5jbGVhcigpO1xuXHRcdHRoaXMuX2lzU2FzaFJlc2l6ZUhlaWdodCA9IGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9kZWNvcmF0aW5nRWxlbWVudHNIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRsZXQgcmVzdWx0ID0gMDtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuc2hvd0Fycm93KSB7XG5cdFx0XHRjb25zdCBhcnJvd0hlaWdodCA9IE1hdGgucm91bmQobGluZUhlaWdodCAvIDMpO1xuXHRcdFx0cmVzdWx0ICs9IDIgKiBhcnJvd0hlaWdodDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnNob3dGcmFtZSkge1xuXHRcdFx0Y29uc3QgZnJhbWVUaGlja25lc3MgPSB0aGlzLm9wdGlvbnMuZnJhbWVXaWR0aCA/PyBNYXRoLnJvdW5kKGxpbmVIZWlnaHQgLyA5KTtcblx0XHRcdHJlc3VsdCArPSAyICogZnJhbWVUaGlja25lc3M7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKiBHZXRzIHRoZSBtYXhpbXVtIHdpZGdldCBoZWlnaHQgaW4gbGluZXMuICovXG5cdHByb3RlY3RlZCBfZ2V0TWF4aW11bUhlaWdodEluTGluZXMoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gTWF0aC5tYXgoMTIsICh0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0IC8gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSkgKiAwLjgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0ltcGwod2hlcmU6IFJhbmdlLCBoZWlnaHRJbkxpbmVzOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHdoZXJlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fZ2V0V2lkdGgobGF5b3V0SW5mbyk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5sZWZ0ID0gdGhpcy5fZ2V0TGVmdChsYXlvdXRJbmZvKSArICdweCc7XG5cblx0XHQvLyBSZW5kZXIgdGhlIHdpZGdldCBhcyB6b25lIChyZW5kZXJpbmcpIGFuZCB3aWRnZXQgKGxpZmVjeWNsZSlcblx0XHRjb25zdCB2aWV3Wm9uZURvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR2aWV3Wm9uZURvbU5vZGUuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblxuXHRcdC8vIGFkanVzdCBoZWlnaHRJbkxpbmVzIHRvIHZpZXdwb3J0XG5cdFx0Y29uc3QgbWF4SGVpZ2h0SW5MaW5lcyA9IHRoaXMuX2dldE1heGltdW1IZWlnaHRJbkxpbmVzKCk7XG5cdFx0aWYgKG1heEhlaWdodEluTGluZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aGVpZ2h0SW5MaW5lcyA9IE1hdGgubWluKGhlaWdodEluTGluZXMsIG1heEhlaWdodEluTGluZXMpO1xuXHRcdH1cblxuXHRcdGxldCBhcnJvd0hlaWdodCA9IDA7XG5cdFx0bGV0IGZyYW1lVGhpY2tuZXNzID0gMDtcblxuXHRcdC8vIFJlbmRlciB0aGUgYXJyb3cgb25lIDEvMyBvZiBhbiBlZGl0b3IgbGluZSBoZWlnaHRcblx0XHRpZiAodGhpcy5fYXJyb3cgJiYgdGhpcy5vcHRpb25zLnNob3dBcnJvdykge1xuXHRcdFx0YXJyb3dIZWlnaHQgPSBNYXRoLnJvdW5kKGxpbmVIZWlnaHQgLyAzKTtcblx0XHRcdHRoaXMuX2Fycm93LmhlaWdodCA9IGFycm93SGVpZ2h0O1xuXHRcdFx0dGhpcy5fYXJyb3cuc2hvdyhwb3NpdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIHRoZSBmcmFtZSBhcyAxLzkgb2YgYW4gZWRpdG9yIGxpbmUgaGVpZ2h0XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zaG93RnJhbWUpIHtcblx0XHRcdGZyYW1lVGhpY2tuZXNzID0gTWF0aC5yb3VuZChsaW5lSGVpZ2h0IC8gOSk7XG5cdFx0fVxuXG5cdFx0Ly8gaW5zZXJ0IHpvbmUgd2lkZ2V0XG5cdFx0dGhpcy5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKChhY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKHRoaXMuX3ZpZXdab25lLmlkKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9vdmVybGF5V2lkZ2V0KSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcy5fb3ZlcmxheVdpZGdldCk7XG5cdFx0XHRcdHRoaXMuX292ZXJsYXlXaWRnZXQgPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLnRvcCA9ICctMTAwMHB4Jztcblx0XHRcdHRoaXMuX3ZpZXdab25lID0gbmV3IFZpZXdab25lRGVsZWdhdGUoXG5cdFx0XHRcdHZpZXdab25lRG9tTm9kZSxcblx0XHRcdFx0cG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0cG9zaXRpb24uY29sdW1uLFxuXHRcdFx0XHRoZWlnaHRJbkxpbmVzLFxuXHRcdFx0XHQodG9wOiBudW1iZXIpID0+IHRoaXMuX29uVmlld1pvbmVUb3AodG9wKSxcblx0XHRcdFx0KGhlaWdodDogbnVtYmVyKSA9PiB0aGlzLl9vblZpZXdab25lSGVpZ2h0KGhlaWdodCksXG5cdFx0XHRcdHRoaXMub3B0aW9ucy5zaG93SW5IaWRkZW5BcmVhcyxcblx0XHRcdFx0dGhpcy5vcHRpb25zLm9yZGluYWxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl92aWV3Wm9uZS5pZCA9IGFjY2Vzc29yLmFkZFpvbmUodGhpcy5fdmlld1pvbmUpO1xuXHRcdFx0dGhpcy5fb3ZlcmxheVdpZGdldCA9IG5ldyBPdmVybGF5V2lkZ2V0RGVsZWdhdGUoV0lER0VUX0lEICsgdGhpcy5fdmlld1pvbmUuaWQsIHRoaXMuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLmVkaXRvci5hZGRPdmVybGF5V2lkZ2V0KHRoaXMuX292ZXJsYXlXaWRnZXQpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3VwZGF0ZVNhc2hFbmFibGVtZW50KCk7XG5cblx0XHRpZiAodGhpcy5jb250YWluZXIgJiYgdGhpcy5vcHRpb25zLnNob3dGcmFtZSkge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLm9wdGlvbnMuZnJhbWVXaWR0aCA/IHRoaXMub3B0aW9ucy5mcmFtZVdpZHRoIDogZnJhbWVUaGlja25lc3M7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5ib3JkZXJUb3BXaWR0aCA9IHdpZHRoICsgJ3B4Jztcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmJvcmRlckJvdHRvbVdpZHRoID0gd2lkdGggKyAncHgnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRhaW5lckhlaWdodCA9IGhlaWdodEluTGluZXMgKiBsaW5lSGVpZ2h0IC0gdGhpcy5fZGVjb3JhdGluZ0VsZW1lbnRzSGVpZ2h0KCk7XG5cblx0XHRpZiAodGhpcy5jb250YWluZXIpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnRvcCA9IGFycm93SGVpZ2h0ICsgJ3B4Jztcblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGNvbnRhaW5lckhlaWdodCArICdweCc7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdH1cblxuXHRcdHRoaXMuX2RvTGF5b3V0KGNvbnRhaW5lckhlaWdodCwgd2lkdGgpO1xuXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMua2VlcEVkaXRvclNlbGVjdGlvbikge1xuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2VsZWN0aW9uKHdoZXJlKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IG1vZGVsLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKHdoZXJlLnN0YXJ0TGluZU51bWJlciwgMSwgd2hlcmUuZW5kTGluZU51bWJlciArIDEsIDEpKTtcblx0XHRcdHRoaXMucmV2ZWFsUmFuZ2UocmFuZ2UsIHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCByZXZlYWxSYW5nZShyYW5nZTogUmFuZ2UsIGlzTGFzdExpbmU6IGJvb2xlYW4pIHtcblx0XHRpZiAoaXNMYXN0TGluZSkge1xuXHRcdFx0dGhpcy5lZGl0b3IucmV2ZWFsTGluZU5lYXJUb3AocmFuZ2UuZW5kTGluZU51bWJlciwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxSYW5nZShyYW5nZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBzZXRDc3NDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgY2xhc3NUb1JlcGxhY2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNsYXNzVG9SZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzVG9SZXBsYWNlKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG5cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZmlsbENvbnRhaW5lcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZDtcblxuXHRwcm90ZWN0ZWQgX29uV2lkdGgod2lkdGhJblBpeGVsOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBpbXBsZW1lbnQgaW4gc3ViY2xhc3Ncblx0fVxuXG5cdHByb3RlY3RlZCBfZG9MYXlvdXQoaGVpZ2h0SW5QaXhlbDogbnVtYmVyLCB3aWR0aEluUGl4ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIGltcGxlbWVudCBpbiBzdWJjbGFzc1xuXHR9XG5cblx0cHJvdGVjdGVkIF9yZWxheW91dChfbmV3SGVpZ2h0SW5MaW5lczogbnVtYmVyLCB1c2VNYXg/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0SW5MaW5lcyA9IHRoaXMuX2dldE1heGltdW1IZWlnaHRJbkxpbmVzKCk7XG5cdFx0Y29uc3QgbmV3SGVpZ2h0SW5MaW5lcyA9ICh1c2VNYXggJiYgKG1heEhlaWdodEluTGluZXMgIT09IHVuZGVmaW5lZCkpID8gTWF0aC5taW4obWF4SGVpZ2h0SW5MaW5lcywgX25ld0hlaWdodEluTGluZXMpIDogX25ld0hlaWdodEluTGluZXM7XG5cdFx0aWYgKHRoaXMuX3ZpZXdab25lICYmIHRoaXMuX3ZpZXdab25lLmhlaWdodEluTGluZXMgIT09IG5ld0hlaWdodEluTGluZXMpIHtcblx0XHRcdHRoaXMuZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRcdHRoaXMuX3ZpZXdab25lLmhlaWdodEluTGluZXMgPSBuZXdIZWlnaHRJbkxpbmVzO1xuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUodGhpcy5fdmlld1pvbmUuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3VwZGF0ZVNhc2hFbmFibGVtZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIHNhc2hcblxuXHRwcml2YXRlIF9pbml0U2FzaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVzaXplU2FzaCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNpemVTYXNoID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBTYXNoKHRoaXMuZG9tTm9kZSwgdGhpcywgeyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KSk7XG5cblx0XHRpZiAoIXRoaXMub3B0aW9ucy5pc1Jlc2l6ZWFibGUpIHtcblx0XHRcdHRoaXMuX3Jlc2l6ZVNhc2guc3RhdGUgPSBTYXNoU3RhdGUuRGlzYWJsZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGRhdGE6IHsgc3RhcnRZOiBudW1iZXI7IGhlaWdodEluTGluZXM6IG51bWJlcjsgbWluTGluZXM6IG51bWJlcjsgbWF4TGluZXM6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZXNpemVTYXNoLm9uRGlkU3RhcnQoKGU6IElTYXNoRXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLl92aWV3Wm9uZSkge1xuXHRcdFx0XHRkYXRhID0ge1xuXHRcdFx0XHRcdHN0YXJ0WTogZS5zdGFydFksXG5cdFx0XHRcdFx0aGVpZ2h0SW5MaW5lczogdGhpcy5fdmlld1pvbmUuaGVpZ2h0SW5MaW5lcyxcblx0XHRcdFx0XHQuLi4gdGhpcy5fZ2V0UmVzaXplQm91bmRzKClcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVzaXplU2FzaC5vbkRpZEVuZCgoKSA9PiB7XG5cdFx0XHRkYXRhID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZXNpemVTYXNoLm9uRGlkQ2hhbmdlKChldnQ6IElTYXNoRXZlbnQpID0+IHtcblx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVEZWx0YSA9IChldnQuY3VycmVudFkgLSBkYXRhLnN0YXJ0WSkgLyB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdFx0XHRjb25zdCByb3VuZGVkTGluZURlbHRhID0gbGluZURlbHRhIDwgMCA/IE1hdGguY2VpbChsaW5lRGVsdGEpIDogTWF0aC5mbG9vcihsaW5lRGVsdGEpO1xuXHRcdFx0XHRjb25zdCBuZXdIZWlnaHRJbkxpbmVzID0gZGF0YS5oZWlnaHRJbkxpbmVzICsgcm91bmRlZExpbmVEZWx0YTtcblxuXHRcdFx0XHRpZiAobmV3SGVpZ2h0SW5MaW5lcyA+IGRhdGEubWluTGluZXMgJiYgbmV3SGVpZ2h0SW5MaW5lcyA8IGRhdGEubWF4TGluZXMpIHtcblx0XHRcdFx0XHR0aGlzLl9pc1Nhc2hSZXNpemVIZWlnaHQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3JlbGF5b3V0KG5ld0hlaWdodEluTGluZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2FzaEVuYWJsZW1lbnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Jlc2l6ZVNhc2gpIHtcblx0XHRcdGNvbnN0IHsgbWluTGluZXMsIG1heExpbmVzIH0gPSB0aGlzLl9nZXRSZXNpemVCb3VuZHMoKTtcblx0XHRcdHRoaXMuX3Jlc2l6ZVNhc2guc3RhdGUgPSBtaW5MaW5lcyA9PT0gbWF4TGluZXMgPyBTYXNoU3RhdGUuRGlzYWJsZWQgOiBTYXNoU3RhdGUuRW5hYmxlZDtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IF91c2VzUmVzaXplSGVpZ2h0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1Nhc2hSZXNpemVIZWlnaHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFJlc2l6ZUJvdW5kcygpOiB7IHJlYWRvbmx5IG1pbkxpbmVzOiBudW1iZXI7IHJlYWRvbmx5IG1heExpbmVzOiBudW1iZXIgfSB7XG5cdFx0cmV0dXJuIHsgbWluTGluZXM6IDUsIG1heExpbmVzOiAzNSB9O1xuXHR9XG5cblx0Z2V0SG9yaXpvbnRhbFNhc2hMZWZ0KCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0Z2V0SG9yaXpvbnRhbFNhc2hUb3AoKSB7XG5cdFx0cmV0dXJuICh0aGlzLmRvbU5vZGUuc3R5bGUuaGVpZ2h0ID09PSBudWxsID8gMCA6IHBhcnNlSW50KHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQpKSAtICh0aGlzLl9kZWNvcmF0aW5nRWxlbWVudHNIZWlnaHQoKSAvIDIpO1xuXHR9XG5cblx0Z2V0SG9yaXpvbnRhbFNhc2hXaWR0aCgpIHtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdHJldHVybiBsYXlvdXRJbmZvLndpZHRoIC0gbGF5b3V0SW5mby5taW5pbWFwLm1pbmltYXBXaWR0aDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksc0JBQXNCO0FBQ2xDLFNBQW9ELGFBQWEsTUFBTSxpQkFBaUI7QUFDeEYsU0FBUyxPQUFPLFlBQVk7QUFDNUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxhQUFhO0FBQ3pCLE9BQU87QUFFUCxTQUEyQixvQkFBb0I7QUFFL0MsU0FBaUIsYUFBYTtBQUM5QixTQUF1QyxrQkFBa0I7QUFDekQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw4QkFBOEI7QUFxQnZDLE1BQU0sZUFBZSxJQUFJLE1BQU0sSUFBSSxLQUFLLEdBQUcsS0FBSyxHQUFHLENBQUM7QUFFcEQsTUFBTSxpQkFBMkI7QUFBQSxFQUNoQyxXQUFXO0FBQUEsRUFDWCxXQUFXO0FBQUEsRUFDWCxXQUFXO0FBQUEsRUFDWCxZQUFZO0FBQUEs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
