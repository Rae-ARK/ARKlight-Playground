import { createFastDomNode } from "../../../../base/browser/fastDomNode.js";
import { ArrayQueue } from "../../../../base/common/arrays.js";
import "./glyphMargin.css";
import { DynamicViewOverlay } from "../../view/dynamicViewOverlay.js";
import { ViewPart } from "../../view/viewPart.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { GlyphMarginLane } from "../../../common/model.js";
class DecorationToRender {
  constructor(startLineNumber, endLineNumber, className, tooltip, zIndex) {
    this.startLineNumber = startLineNumber;
    this.endLineNumber = endLineNumber;
    this.className = className;
    this.tooltip = tooltip;
    this._decorationToRenderBrand = void 0;
    this.zIndex = zIndex ?? 0;
  }
}
class LineDecorationToRender {
  constructor(className, zIndex, tooltip) {
    this.className = className;
    this.zIndex = zIndex;
    this.tooltip = tooltip;
  }
}
class VisibleLineDecorationsToRender {
  constructor() {
    this.decorations = [];
  }
  add(decoration) {
    this.decorations.push(decoration);
  }
  getDecorations() {
    return this.decorations;
  }
}
class DedupOverlay extends DynamicViewOverlay {
  /**
   * Returns an array with an element for each visible line number.
   */
  _render(visibleStartLineNumber, visibleEndLineNumber, decorations) {
    const output = [];
    for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
      const lineIndex = lineNumber - visibleStartLineNumber;
      output[lineIndex] = new VisibleLineDecorationsToRender();
    }
    if (decorations.length === 0) {
      return output;
    }
    decorations.sort((a, b) => {
      if (a.className === b.className) {
        if (a.startLineNumber === b.startLineNumber) {
          return a.endLineNumber - b.endLineNumber;
        }
        return a.startLineNumber - b.startLineNumber;
      }
      return a.className < b.className ? -1 : 1;
    });
    let prevClassName = null;
    let prevEndLineIndex = 0;
    for (const d of decorations) {
      const className = d.className;
      const zIndex = d.zIndex;
      let startLineIndex = Math.max(d.startLineNumber, visibleStartLineNumber) - visibleStartLineNumber;
      const endLineIndex = Math.min(d.endLineNumber, visibleEndLineNumber) - visibleStartLineNumber;
      if (prevClassName === className) {
        startLineIndex = Math.max(prevEndLineIndex + 1, startLineIndex);
        prevEndLineIndex = Math.max(prevEndLineIndex, endLineIndex);
      } else {
        prevClassName = className;
        prevEndLineIndex = endLineIndex;
      }
      for (let lineIndex = startLineIndex; lineIndex <= prevEndLineIndex; lineIndex++) {
        output[lineIndex].add(new LineDecorationToRender(className, zIndex, d.tooltip));
      }
    }
    return output;
  }
}
class GlyphMarginWidgets extends ViewPart {
  constructor(context) {
    super(context);
    this._widgets = {};
    this._context = context;
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    this.domNode = createFastDomNode(document.createElement("div"));
    this.domNode.setClassName("glyph-margin-widgets");
    this.domNode.setPosition("absolute");
    this.domNode.setTop(0);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._glyphMargin = options.get(EditorOption.glyphMargin);
    this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
    this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
    this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
    this._managedDomNodes = [];
    this._decorationGlyphsToRender = [];
  }
  dispose() {
    this._managedDomNodes = [];
    this._decorationGlyphsToRender = [];
    this._widgets = {};
    super.dispose();
  }
  getWidgets() {
    return Object.values(this._widgets);
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    this._lineHeight = options.get(EditorOption.lineHeight);
    this._glyphMargin = options.get(EditorOption.glyphMargin);
    this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
    this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
    this._glyphMarginDecorationLaneCount = layoutInfo.glyphMarginDecorationLaneCount;
    return true;
  }
  onDecorationsChanged(e) {
    return true;
  }
  onFlushed(e) {
    return true;
  }
  onLinesChanged(e) {
    return true;
  }
  onLinesDeleted(e) {
    return true;
  }
  onLinesInserted(e) {
    return true;
  }
  onScrollChanged(e) {
    return e.scrollTopChanged;
  }
  onZonesChanged(e) {
    return true;
  }
  // --- end event handlers
  // --- begin widget management
  addWidget(widget) {
    const domNode = createFastDomNode(widget.getDomNode());
    this._widgets[widget.getId()] = {
      widget,
      preference: widget.getPosition(),
      domNode,
      renderInfo: null
    };
    domNode.setPosition("absolute");
    domNode.setDisplay("none");
    domNode.setAttribute("widgetId", widget.getId());
    this.domNode.appendChild(domNode);
    this.setShouldRender();
  }
  setWidgetPosition(widget, preference) {
    const myWidget = this._widgets[widget.getId()];
    if (myWidget.preference.lane === preference.lane && myWidget.preference.zIndex === preference.zIndex && Range.equalsRange(myWidget.preference.range, preference.range)) {
      return false;
    }
    myWidget.preference = preference;
    this.setShouldRender();
    return true;
  }
  removeWidget(widget) {
    const widgetId = widget.getId();
    if (this._widgets[widgetId]) {
      const widgetData = this._widgets[widgetId];
      const domNode = widgetData.domNode.domNode;
      delete this._widgets[widgetId];
      domNode.remove();
      this.setShouldRender();
    }
  }
  // --- end widget management
  _collectDecorationBasedGlyphRenderRequest(ctx, requests) {
    const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
    const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
    const decorations = ctx.getDecorationsInViewport();
    for (const d of decorations) {
      const glyphMarginClassName = d.options.glyphMarginClassName;
      if (!glyphMarginClassName) {
        continue;
      }
      const startLineNumber = Math.max(d.range.startLineNumber, visibleStartLineNumber);
      const endLineNumber = Math.min(d.range.endLineNumber, visibleEndLineNumber);
      const lane = d.options.glyphMargin?.position ?? GlyphMarginLane.Center;
      const zIndex = d.options.zIndex ?? 0;
      for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
        const modelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(lineNumber, 0));
        const laneIndex = this._context.viewModel.glyphLanes.getLanesAtLine(modelPosition.lineNumber).indexOf(lane);
        requests.push(new DecorationBasedGlyphRenderRequest(lineNumber, laneIndex, zIndex, glyphMarginClassName));
      }
    }
  }
  _collectWidgetBasedGlyphRenderRequest(ctx, requests) {
    const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
    const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
    for (const widget of Object.values(this._widgets)) {
      const range = widget.preference.range;
      const { startLineNumber, endLineNumber } = this._context.viewModel.coordinatesConverter.convertModelRangeToViewRange(Range.lift(range));
      if (!startLineNumber || !endLineNumber || endLineNumber < visibleStartLineNumber || startLineNumber > visibleEndLineNumber) {
        continue;
      }
      const widgetLineNumber = Math.max(startLineNumber, visibleStartLineNumber);
      const modelPosition = this._context.viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(widgetLineNumber, 0));
      const laneIndex = this._context.viewModel.glyphLanes.getLanesAtLine(modelPosition.lineNumber).indexOf(widget.preference.lane);
      requests.push(new WidgetBasedGlyphRenderRequest(widgetLineNumber, laneIndex, widget.preference.zIndex, widget));
    }
  }
  _collectSortedGlyphRenderRequests(ctx) {
    const requests = [];
    this._collectDecorationBasedGlyphRenderRequest(ctx, requests);
    this._collectWidgetBasedGlyphRenderRequest(ctx, requests);
    requests.sort((a, b) => {
      if (a.lineNumber === b.lineNumber) {
        if (a.laneIndex === b.laneIndex) {
          if (a.zIndex === b.zIndex) {
            if (b.type === a.type) {
              if (a.type === 0 /* Decoration */ && b.type === 0 /* Decoration */) {
                return a.className < b.className ? -1 : 1;
              }
              return 0;
            }
            return b.type - a.type;
          }
          return b.zIndex - a.zIndex;
        }
        return a.laneIndex - b.laneIndex;
      }
      return a.lineNumber - b.lineNumber;
    });
    return requests;
  }
  /**
   * Will store render information in each widget's renderInfo and in `_decorationGlyphsToRender`.
   */
  prepareRender(ctx) {
    if (!this._glyphMargin) {
      this._decorationGlyphsToRender = [];
      return;
    }
    for (const widget of Object.values(this._widgets)) {
      widget.renderInfo = null;
    }
    const requests = new ArrayQueue(this._collectSortedGlyphRenderRequests(ctx));
    const decorationGlyphsToRender = [];
    while (requests.length > 0) {
      const first = requests.peek();
      if (!first) {
        break;
      }
      const requestsAtLocation = requests.takeWhile((el) => el.lineNumber === first.lineNumber && el.laneIndex === first.laneIndex);
      if (!requestsAtLocation || requestsAtLocation.length === 0) {
        break;
      }
      const winner = requestsAtLocation[0];
      if (winner.type === 0 /* Decoration */) {
        const classNames = [];
        for (const request of requestsAtLocation) {
          if (request.zIndex !== winner.zIndex || request.type !== winner.type) {
            break;
          }
          if (classNames.length === 0 || classNames[classNames.length - 1] !== request.className) {
            classNames.push(request.className);
          }
        }
        decorationGlyphsToRender.push(winner.accept(classNames.join(" ")));
      } else {
        winner.widget.renderInfo = {
          lineNumber: winner.lineNumber,
          laneIndex: winner.laneIndex
        };
      }
    }
    this._decorationGlyphsToRender = decorationGlyphsToRender;
  }
  render(ctx) {
    if (!this._glyphMargin) {
      for (const widget of Object.values(this._widgets)) {
        widget.domNode.setDisplay("none");
      }
      while (this._managedDomNodes.length > 0) {
        const domNode = this._managedDomNodes.pop();
        domNode?.domNode.remove();
      }
      return;
    }
    const width = Math.round(this._glyphMarginWidth / this._glyphMarginDecorationLaneCount);
    for (const widget of Object.values(this._widgets)) {
      if (!widget.renderInfo) {
        widget.domNode.setDisplay("none");
      } else {
        const top = ctx.viewportData.relativeVerticalOffset[widget.renderInfo.lineNumber - ctx.viewportData.startLineNumber];
        const left = this._glyphMarginLeft + widget.renderInfo.laneIndex * this._lineHeight;
        widget.domNode.setDisplay("block");
        widget.domNode.setTop(top);
        widget.domNode.setLeft(left);
        widget.domNode.setWidth(width);
        widget.domNode.setHeight(this._lineHeight);
      }
    }
    for (let i = 0; i < this._decorationGlyphsToRender.length; i++) {
      const dec = this._decorationGlyphsToRender[i];
      const decLineNumber = dec.lineNumber;
      const top = ctx.viewportData.relativeVerticalOffset[decLineNumber - ctx.viewportData.startLineNumber];
      const left = this._glyphMarginLeft + dec.laneIndex * this._lineHeight;
      let domNode;
      if (i < this._managedDomNodes.length) {
        domNode = this._managedDomNodes[i];
      } else {
        domNode = createFastDomNode(document.createElement("div"));
        this._managedDomNodes.push(domNode);
        this.domNode.appendChild(domNode);
      }
      const lineHeight = this._context.viewLayout.getLineHeightForLineNumber(decLineNumber);
      domNode.setClassName(`cgmr codicon ` + dec.combinedClassName);
      domNode.setPosition(`absolute`);
      domNode.setTop(top);
      domNode.setLeft(left);
      domNode.setWidth(width);
      domNode.setHeight(lineHeight);
    }
    while (this._managedDomNodes.length > this._decorationGlyphsToRender.length) {
      const domNode = this._managedDomNodes.pop();
      domNode?.domNode.remove();
    }
  }
}
var GlyphRenderRequestType = /* @__PURE__ */ ((GlyphRenderRequestType2) => {
  GlyphRenderRequestType2[GlyphRenderRequestType2["Decoration"] = 0] = "Decoration";
  GlyphRenderRequestType2[GlyphRenderRequestType2["Widget"] = 1] = "Widget";
  return GlyphRenderRequestType2;
})(GlyphRenderRequestType || {});
class DecorationBasedGlyphRenderRequest {
  constructor(lineNumber, laneIndex, zIndex, className) {
    this.lineNumber = lineNumber;
    this.laneIndex = laneIndex;
    this.zIndex = zIndex;
    this.className = className;
    this.type = 0 /* Decoration */;
  }
  accept(combinedClassName) {
    return new DecorationBasedGlyph(this.lineNumber, this.laneIndex, combinedClassName);
  }
}
class WidgetBasedGlyphRenderRequest {
  constructor(lineNumber, laneIndex, zIndex, widget) {
    this.lineNumber = lineNumber;
    this.laneIndex = laneIndex;
    this.zIndex = zIndex;
    this.widget = widget;
    this.type = 1 /* Widget */;
  }
}
class DecorationBasedGlyph {
  constructor(lineNumber, laneIndex, combinedClassName) {
    this.lineNumber = lineNumber;
    this.laneIndex = laneIndex;
    this.combinedClassName = combinedClassName;
  }
}
export {
  DecorationToRender,
  DedupOverlay,
  GlyphMarginWidgets,
  LineDecorationToRender,
  VisibleLineDecorationsToRender
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9nbHlwaE1hcmdpbi9nbHlwaE1hcmdpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEZhc3REb21Ob2RlLCBjcmVhdGVGYXN0RG9tTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBBcnJheVF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCAnLi9nbHlwaE1hcmdpbi5jc3MnO1xuaW1wb3J0IHsgSUdseXBoTWFyZ2luV2lkZ2V0LCBJR2x5cGhNYXJnaW5XaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRHluYW1pY1ZpZXdPdmVybGF5IH0gZnJvbSAnLi4vLi4vdmlldy9keW5hbWljVmlld092ZXJsYXkuanMnO1xuaW1wb3J0IHsgUmVuZGVyaW5nQ29udGV4dCwgUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQgfSBmcm9tICcuLi8uLi92aWV3L3JlbmRlcmluZ0NvbnRleHQuanMnO1xuaW1wb3J0IHsgVmlld1BhcnQgfSBmcm9tICcuLi8uLi92aWV3L3ZpZXdQYXJ0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgR2x5cGhNYXJnaW5MYW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdDb250ZXh0LmpzJztcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgZGVjb3JhdGlvbiB0aGF0IHNob3VsZCBiZSBzaG93biBhbG9uZyB0aGUgbGluZXMgZnJvbSBgc3RhcnRMaW5lTnVtYmVyYCB0byBgZW5kTGluZU51bWJlcmAuXG4gKiBUaGlzIGNhbiBlbmQgdXAgcHJvZHVjaW5nIG11bHRpcGxlIGBMaW5lRGVjb3JhdGlvblRvUmVuZGVyYC5cbiAqL1xuZXhwb3J0IGNsYXNzIERlY29yYXRpb25Ub1JlbmRlciB7XG5cdHB1YmxpYyByZWFkb25seSBfZGVjb3JhdGlvblRvUmVuZGVyQnJhbmQ6IHZvaWQgPSB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IHpJbmRleDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZW5kTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBjbGFzc05hbWU6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdG9vbHRpcDogc3RyaW5nIHwgbnVsbCxcblx0XHR6SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0dGhpcy56SW5kZXggPSB6SW5kZXggPz8gMDtcblx0fVxufVxuXG4vKipcbiAqIEEgZGVjb3JhdGlvbiB0aGF0IHNob3VsZCBiZSBzaG93biBhbG9uZyBhIGxpbmUuXG4gKi9cbmV4cG9ydCBjbGFzcyBMaW5lRGVjb3JhdGlvblRvUmVuZGVyIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSB6SW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgdG9vbHRpcDogc3RyaW5nIHwgbnVsbCxcblx0KSB7IH1cbn1cblxuLyoqXG4gKiBEZWNvcmF0aW9ucyB0byByZW5kZXIgb24gYSB2aXNpYmxlIGxpbmUuXG4gKi9cbmV4cG9ydCBjbGFzcyBWaXNpYmxlTGluZURlY29yYXRpb25zVG9SZW5kZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnM6IExpbmVEZWNvcmF0aW9uVG9SZW5kZXJbXSA9IFtdO1xuXG5cdHB1YmxpYyBhZGQoZGVjb3JhdGlvbjogTGluZURlY29yYXRpb25Ub1JlbmRlcikge1xuXHRcdHRoaXMuZGVjb3JhdGlvbnMucHVzaChkZWNvcmF0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXREZWNvcmF0aW9ucygpOiBMaW5lRGVjb3JhdGlvblRvUmVuZGVyW10ge1xuXHRcdHJldHVybiB0aGlzLmRlY29yYXRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBEZWR1cE92ZXJsYXkgZXh0ZW5kcyBEeW5hbWljVmlld092ZXJsYXkge1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFuIGFycmF5IHdpdGggYW4gZWxlbWVudCBmb3IgZWFjaCB2aXNpYmxlIGxpbmUgbnVtYmVyLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZW5kZXIodmlzaWJsZVN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCB2aXNpYmxlRW5kTGluZU51bWJlcjogbnVtYmVyLCBkZWNvcmF0aW9uczogRGVjb3JhdGlvblRvUmVuZGVyW10pOiBWaXNpYmxlTGluZURlY29yYXRpb25zVG9SZW5kZXJbXSB7XG5cblx0XHRjb25zdCBvdXRwdXQ6IFZpc2libGVMaW5lRGVjb3JhdGlvbnNUb1JlbmRlcltdID0gW107XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHZpc2libGVTdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdmlzaWJsZUVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZUluZGV4ID0gbGluZU51bWJlciAtIHZpc2libGVTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRvdXRwdXRbbGluZUluZGV4XSA9IG5ldyBWaXNpYmxlTGluZURlY29yYXRpb25zVG9SZW5kZXIoKTtcblx0XHR9XG5cblx0XHRpZiAoZGVjb3JhdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gb3V0cHV0O1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgZGVjb3JhdGlvbnMgYnkgY2xhc3NOYW1lLCB0aGVuIGJ5IHN0YXJ0TGluZU51bWJlciBhbmQgdGhlbiBieSBlbmRMaW5lTnVtYmVyXG5cdFx0ZGVjb3JhdGlvbnMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEuY2xhc3NOYW1lID09PSBiLmNsYXNzTmFtZSkge1xuXHRcdFx0XHRpZiAoYS5zdGFydExpbmVOdW1iZXIgPT09IGIuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGEuZW5kTGluZU51bWJlciAtIGIuZW5kTGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYS5zdGFydExpbmVOdW1iZXIgLSBiLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiAoYS5jbGFzc05hbWUgPCBiLmNsYXNzTmFtZSA/IC0xIDogMSk7XG5cdFx0fSk7XG5cblx0XHRsZXQgcHJldkNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IHByZXZFbmRMaW5lSW5kZXggPSAwO1xuXHRcdGZvciAoY29uc3QgZCBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3QgY2xhc3NOYW1lID0gZC5jbGFzc05hbWU7XG5cdFx0XHRjb25zdCB6SW5kZXggPSBkLnpJbmRleDtcblx0XHRcdGxldCBzdGFydExpbmVJbmRleCA9IE1hdGgubWF4KGQuc3RhcnRMaW5lTnVtYmVyLCB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyKSAtIHZpc2libGVTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBlbmRMaW5lSW5kZXggPSBNYXRoLm1pbihkLmVuZExpbmVOdW1iZXIsIHZpc2libGVFbmRMaW5lTnVtYmVyKSAtIHZpc2libGVTdGFydExpbmVOdW1iZXI7XG5cblx0XHRcdGlmIChwcmV2Q2xhc3NOYW1lID09PSBjbGFzc05hbWUpIHtcblx0XHRcdFx0Ly8gSGVyZSB3ZSBhdm9pZCByZW5kZXJpbmcgdGhlIHNhbWUgY2xhc3NOYW1lIG11bHRpcGxlIHRpbWVzIG9uIHRoZSBzYW1lIGxpbmVcblx0XHRcdFx0c3RhcnRMaW5lSW5kZXggPSBNYXRoLm1heChwcmV2RW5kTGluZUluZGV4ICsgMSwgc3RhcnRMaW5lSW5kZXgpO1xuXHRcdFx0XHRwcmV2RW5kTGluZUluZGV4ID0gTWF0aC5tYXgocHJldkVuZExpbmVJbmRleCwgZW5kTGluZUluZGV4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByZXZDbGFzc05hbWUgPSBjbGFzc05hbWU7XG5cdFx0XHRcdHByZXZFbmRMaW5lSW5kZXggPSBlbmRMaW5lSW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGxpbmVJbmRleCA9IHN0YXJ0TGluZUluZGV4OyBsaW5lSW5kZXggPD0gcHJldkVuZExpbmVJbmRleDsgbGluZUluZGV4KyspIHtcblx0XHRcdFx0b3V0cHV0W2xpbmVJbmRleF0uYWRkKG5ldyBMaW5lRGVjb3JhdGlvblRvUmVuZGVyKGNsYXNzTmFtZSwgekluZGV4LCBkLnRvb2x0aXApKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHbHlwaE1hcmdpbldpZGdldHMgZXh0ZW5kcyBWaWV3UGFydCB7XG5cblx0cHVibGljIGRvbU5vZGU6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PjtcblxuXHRwcml2YXRlIF9saW5lSGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgX2dseXBoTWFyZ2luOiBib29sZWFuO1xuXHRwcml2YXRlIF9nbHlwaE1hcmdpbkxlZnQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfZ2x5cGhNYXJnaW5XaWR0aDogbnVtYmVyO1xuXHRwcml2YXRlIF9nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IG51bWJlcjtcblxuXHRwcml2YXRlIF9tYW5hZ2VkRG9tTm9kZXM6IEZhc3REb21Ob2RlPEhUTUxFbGVtZW50PltdO1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uR2x5cGhzVG9SZW5kZXI6IERlY29yYXRpb25CYXNlZEdseXBoW107XG5cblx0cHJpdmF0ZSBfd2lkZ2V0czogeyBba2V5OiBzdHJpbmddOiBJV2lkZ2V0RGF0YSB9ID0ge307XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogVmlld0NvbnRleHQpIHtcblx0XHRzdXBlcihjb250ZXh0KTtcblx0XHR0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRDbGFzc05hbWUoJ2dseXBoLW1hcmdpbi13aWRnZXRzJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRUb3AoMCk7XG5cblx0XHR0aGlzLl9saW5lSGVpZ2h0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdHRoaXMuX2dseXBoTWFyZ2luID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmdseXBoTWFyZ2luKTtcblx0XHR0aGlzLl9nbHlwaE1hcmdpbkxlZnQgPSBsYXlvdXRJbmZvLmdseXBoTWFyZ2luTGVmdDtcblx0XHR0aGlzLl9nbHlwaE1hcmdpbldpZHRoID0gbGF5b3V0SW5mby5nbHlwaE1hcmdpbldpZHRoO1xuXHRcdHRoaXMuX2dseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudCA9IGxheW91dEluZm8uZ2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50O1xuXHRcdHRoaXMuX21hbmFnZWREb21Ob2RlcyA9IFtdO1xuXHRcdHRoaXMuX2RlY29yYXRpb25HbHlwaHNUb1JlbmRlciA9IFtdO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFuYWdlZERvbU5vZGVzID0gW107XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyID0gW107XG5cdFx0dGhpcy5fd2lkZ2V0cyA9IHt9O1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXaWRnZXRzKCk6IElXaWRnZXREYXRhW10ge1xuXHRcdHJldHVybiBPYmplY3QudmFsdWVzKHRoaXMuX3dpZGdldHMpO1xuXHR9XG5cblx0Ly8gLS0tIGJlZ2luIGV2ZW50IGhhbmRsZXJzXG5cdHB1YmxpYyBvdmVycmlkZSBvbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0NvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblxuXHRcdHRoaXMuX2xpbmVIZWlnaHQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW4gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZ2x5cGhNYXJnaW4pO1xuXHRcdHRoaXMuX2dseXBoTWFyZ2luTGVmdCA9IGxheW91dEluZm8uZ2x5cGhNYXJnaW5MZWZ0O1xuXHRcdHRoaXMuX2dseXBoTWFyZ2luV2lkdGggPSBsYXlvdXRJbmZvLmdseXBoTWFyZ2luV2lkdGg7XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50ID0gbGF5b3V0SW5mby5nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRmx1c2hlZChlOiB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0RlbGV0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNEZWxldGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25MaW5lc0luc2VydGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzSW5zZXJ0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblNjcm9sbENoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGUuc2Nyb2xsVG9wQ2hhbmdlZDtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25ab25lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLSBlbmQgZXZlbnQgaGFuZGxlcnNcblxuXHQvLyAtLS0gYmVnaW4gd2lkZ2V0IG1hbmFnZW1lbnRcblxuXHRwdWJsaWMgYWRkV2lkZ2V0KHdpZGdldDogSUdseXBoTWFyZ2luV2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3QgZG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKHdpZGdldC5nZXREb21Ob2RlKCkpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0c1t3aWRnZXQuZ2V0SWQoKV0gPSB7XG5cdFx0XHR3aWRnZXQ6IHdpZGdldCxcblx0XHRcdHByZWZlcmVuY2U6IHdpZGdldC5nZXRQb3NpdGlvbigpLFxuXHRcdFx0ZG9tTm9kZTogZG9tTm9kZSxcblx0XHRcdHJlbmRlckluZm86IG51bGxcblx0XHR9O1xuXG5cdFx0ZG9tTm9kZS5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblx0XHRkb21Ob2RlLnNldERpc3BsYXkoJ25vbmUnKTtcblx0XHRkb21Ob2RlLnNldEF0dHJpYnV0ZSgnd2lkZ2V0SWQnLCB3aWRnZXQuZ2V0SWQoKSk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKGRvbU5vZGUpO1xuXG5cdFx0dGhpcy5zZXRTaG91bGRSZW5kZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRXaWRnZXRQb3NpdGlvbih3aWRnZXQ6IElHbHlwaE1hcmdpbldpZGdldCwgcHJlZmVyZW5jZTogSUdseXBoTWFyZ2luV2lkZ2V0UG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBteVdpZGdldCA9IHRoaXMuX3dpZGdldHNbd2lkZ2V0LmdldElkKCldO1xuXHRcdGlmIChteVdpZGdldC5wcmVmZXJlbmNlLmxhbmUgPT09IHByZWZlcmVuY2UubGFuZVxuXHRcdFx0JiYgbXlXaWRnZXQucHJlZmVyZW5jZS56SW5kZXggPT09IHByZWZlcmVuY2UuekluZGV4XG5cdFx0XHQmJiBSYW5nZS5lcXVhbHNSYW5nZShteVdpZGdldC5wcmVmZXJlbmNlLnJhbmdlLCBwcmVmZXJlbmNlLnJhbmdlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdG15V2lkZ2V0LnByZWZlcmVuY2UgPSBwcmVmZXJlbmNlO1xuXHRcdHRoaXMuc2V0U2hvdWxkUmVuZGVyKCk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVXaWRnZXQod2lkZ2V0OiBJR2x5cGhNYXJnaW5XaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRJZCA9IHdpZGdldC5nZXRJZCgpO1xuXHRcdGlmICh0aGlzLl93aWRnZXRzW3dpZGdldElkXSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0RGF0YSA9IHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdO1xuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IHdpZGdldERhdGEuZG9tTm9kZS5kb21Ob2RlO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX3dpZGdldHNbd2lkZ2V0SWRdO1xuXG5cdFx0XHRkb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5zZXRTaG91bGRSZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gZW5kIHdpZGdldCBtYW5hZ2VtZW50XG5cblx0cHJpdmF0ZSBfY29sbGVjdERlY29yYXRpb25CYXNlZEdseXBoUmVuZGVyUmVxdWVzdChjdHg6IFJlbmRlcmluZ0NvbnRleHQsIHJlcXVlc3RzOiBHbHlwaFJlbmRlclJlcXVlc3RbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHZpc2libGVTdGFydExpbmVOdW1iZXIgPSBjdHgudmlzaWJsZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCB2aXNpYmxlRW5kTGluZU51bWJlciA9IGN0eC52aXNpYmxlUmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IGN0eC5nZXREZWNvcmF0aW9uc0luVmlld3BvcnQoKTtcblxuXHRcdGZvciAoY29uc3QgZCBvZiBkZWNvcmF0aW9ucykge1xuXHRcdFx0Y29uc3QgZ2x5cGhNYXJnaW5DbGFzc05hbWUgPSBkLm9wdGlvbnMuZ2x5cGhNYXJnaW5DbGFzc05hbWU7XG5cdFx0XHRpZiAoIWdseXBoTWFyZ2luQ2xhc3NOYW1lKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBNYXRoLm1heChkLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgdmlzaWJsZVN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gTWF0aC5taW4oZC5yYW5nZS5lbmRMaW5lTnVtYmVyLCB2aXNpYmxlRW5kTGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsYW5lID0gZC5vcHRpb25zLmdseXBoTWFyZ2luPy5wb3NpdGlvbiA/PyBHbHlwaE1hcmdpbkxhbmUuQ2VudGVyO1xuXHRcdFx0Y29uc3QgekluZGV4ID0gZC5vcHRpb25zLnpJbmRleCA/PyAwO1xuXG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBtb2RlbFBvc2l0aW9uID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihuZXcgUG9zaXRpb24obGluZU51bWJlciwgMCkpO1xuXHRcdFx0XHRjb25zdCBsYW5lSW5kZXggPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5nbHlwaExhbmVzLmdldExhbmVzQXRMaW5lKG1vZGVsUG9zaXRpb24ubGluZU51bWJlcikuaW5kZXhPZihsYW5lKTtcblx0XHRcdFx0cmVxdWVzdHMucHVzaChuZXcgRGVjb3JhdGlvbkJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0KGxpbmVOdW1iZXIsIGxhbmVJbmRleCwgekluZGV4LCBnbHlwaE1hcmdpbkNsYXNzTmFtZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbGxlY3RXaWRnZXRCYXNlZEdseXBoUmVuZGVyUmVxdWVzdChjdHg6IFJlbmRlcmluZ0NvbnRleHQsIHJlcXVlc3RzOiBHbHlwaFJlbmRlclJlcXVlc3RbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHZpc2libGVTdGFydExpbmVOdW1iZXIgPSBjdHgudmlzaWJsZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCB2aXNpYmxlRW5kTGluZU51bWJlciA9IGN0eC52aXNpYmxlUmFuZ2UuZW5kTGluZU51bWJlcjtcblxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIE9iamVjdC52YWx1ZXModGhpcy5fd2lkZ2V0cykpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gd2lkZ2V0LnByZWZlcmVuY2UucmFuZ2U7XG5cdFx0XHRjb25zdCB7IHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciB9ID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUmFuZ2VUb1ZpZXdSYW5nZShSYW5nZS5saWZ0KHJhbmdlKSk7XG5cdFx0XHRpZiAoIXN0YXJ0TGluZU51bWJlciB8fCAhZW5kTGluZU51bWJlciB8fCBlbmRMaW5lTnVtYmVyIDwgdmlzaWJsZVN0YXJ0TGluZU51bWJlciB8fCBzdGFydExpbmVOdW1iZXIgPiB2aXNpYmxlRW5kTGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBUaGUgd2lkZ2V0IGlzIG5vdCBpbiB0aGUgdmlld3BvcnRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSB3aWRnZXQgaXMgaW4gdGhlIHZpZXdwb3J0LCBmaW5kIGEgZ29vZCBsaW5lIGZvciBpdFxuXHRcdFx0Y29uc3Qgd2lkZ2V0TGluZU51bWJlciA9IE1hdGgubWF4KHN0YXJ0TGluZU51bWJlciwgdmlzaWJsZVN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBtb2RlbFBvc2l0aW9uID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihuZXcgUG9zaXRpb24od2lkZ2V0TGluZU51bWJlciwgMCkpO1xuXHRcdFx0Y29uc3QgbGFuZUluZGV4ID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuZ2x5cGhMYW5lcy5nZXRMYW5lc0F0TGluZShtb2RlbFBvc2l0aW9uLmxpbmVOdW1iZXIpLmluZGV4T2Yod2lkZ2V0LnByZWZlcmVuY2UubGFuZSk7XG5cdFx0XHRyZXF1ZXN0cy5wdXNoKG5ldyBXaWRnZXRCYXNlZEdseXBoUmVuZGVyUmVxdWVzdCh3aWRnZXRMaW5lTnVtYmVyLCBsYW5lSW5kZXgsIHdpZGdldC5wcmVmZXJlbmNlLnpJbmRleCwgd2lkZ2V0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGVjdFNvcnRlZEdseXBoUmVuZGVyUmVxdWVzdHMoY3R4OiBSZW5kZXJpbmdDb250ZXh0KTogR2x5cGhSZW5kZXJSZXF1ZXN0W10ge1xuXG5cdFx0Y29uc3QgcmVxdWVzdHM6IEdseXBoUmVuZGVyUmVxdWVzdFtdID0gW107XG5cblx0XHR0aGlzLl9jb2xsZWN0RGVjb3JhdGlvbkJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0KGN0eCwgcmVxdWVzdHMpO1xuXHRcdHRoaXMuX2NvbGxlY3RXaWRnZXRCYXNlZEdseXBoUmVuZGVyUmVxdWVzdChjdHgsIHJlcXVlc3RzKTtcblxuXHRcdC8vIHNvcnQgcmVxdWVzdHMgYnkgbGluZU51bWJlciBBU0MsIGxhbmUgIEFTQywgekluZGV4IERFU0MsIHR5cGUgREVTQyAod2lkZ2V0cyBmaXJzdCksIGNsYXNzTmFtZSBBU0Ncblx0XHQvLyBkb24ndCBjaGFuZ2UgdGhpcyBzb3J0IHVubGVzcyB5b3UgdW5kZXJzdGFuZCBgcHJlcGFyZVJlbmRlcmAgYmVsb3cuXG5cdFx0cmVxdWVzdHMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEubGluZU51bWJlciA9PT0gYi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdGlmIChhLmxhbmVJbmRleCA9PT0gYi5sYW5lSW5kZXgpIHtcblx0XHRcdFx0XHRpZiAoYS56SW5kZXggPT09IGIuekluZGV4KSB7XG5cdFx0XHRcdFx0XHRpZiAoYi50eXBlID09PSBhLnR5cGUpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGEudHlwZSA9PT0gR2x5cGhSZW5kZXJSZXF1ZXN0VHlwZS5EZWNvcmF0aW9uICYmIGIudHlwZSA9PT0gR2x5cGhSZW5kZXJSZXF1ZXN0VHlwZS5EZWNvcmF0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIChhLmNsYXNzTmFtZSA8IGIuY2xhc3NOYW1lID8gLTEgOiAxKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBiLnR5cGUgLSBhLnR5cGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBiLnpJbmRleCAtIGEuekluZGV4O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhLmxhbmVJbmRleCAtIGIubGFuZUluZGV4O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGEubGluZU51bWJlciAtIGIubGluZU51bWJlcjtcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXF1ZXN0cztcblx0fVxuXG5cdC8qKlxuXHQgKiBXaWxsIHN0b3JlIHJlbmRlciBpbmZvcm1hdGlvbiBpbiBlYWNoIHdpZGdldCdzIHJlbmRlckluZm8gYW5kIGluIGBfZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyYC5cblx0ICovXG5cdHB1YmxpYyBwcmVwYXJlUmVuZGVyKGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZ2x5cGhNYXJnaW4pIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25HbHlwaHNUb1JlbmRlciA9IFtdO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIE9iamVjdC52YWx1ZXModGhpcy5fd2lkZ2V0cykpIHtcblx0XHRcdHdpZGdldC5yZW5kZXJJbmZvID0gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0cyA9IG5ldyBBcnJheVF1ZXVlPEdseXBoUmVuZGVyUmVxdWVzdD4odGhpcy5fY29sbGVjdFNvcnRlZEdseXBoUmVuZGVyUmVxdWVzdHMoY3R4KSk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyOiBEZWNvcmF0aW9uQmFzZWRHbHlwaFtdID0gW107XG5cdFx0d2hpbGUgKHJlcXVlc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGZpcnN0ID0gcmVxdWVzdHMucGVlaygpO1xuXHRcdFx0aWYgKCFmaXJzdCkge1xuXHRcdFx0XHQvLyBub3QgcG9zc2libGVcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlcXVlc3RzIGFyZSBzb3J0ZWQgYnkgbGluZU51bWJlciBhbmQgbGFuZSwgc28gd2UgcmVhZCBhbGwgcmVxdWVzdHMgZm9yIHRoaXMgcGFydGljdWxhciBsb2NhdGlvblxuXHRcdFx0Y29uc3QgcmVxdWVzdHNBdExvY2F0aW9uID0gcmVxdWVzdHMudGFrZVdoaWxlKChlbCkgPT4gZWwubGluZU51bWJlciA9PT0gZmlyc3QubGluZU51bWJlciAmJiBlbC5sYW5lSW5kZXggPT09IGZpcnN0LmxhbmVJbmRleCk7XG5cdFx0XHRpZiAoIXJlcXVlc3RzQXRMb2NhdGlvbiB8fCByZXF1ZXN0c0F0TG9jYXRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIG5vdCBwb3NzaWJsZVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2lubmVyID0gcmVxdWVzdHNBdExvY2F0aW9uWzBdO1xuXHRcdFx0aWYgKHdpbm5lci50eXBlID09PSBHbHlwaFJlbmRlclJlcXVlc3RUeXBlLkRlY29yYXRpb24pIHtcblx0XHRcdFx0Ly8gY29tYmluZSBhbGwgZGVjb3JhdGlvbnMgd2l0aCB0aGUgc2FtZSB6LWluZGV4XG5cblx0XHRcdFx0Y29uc3QgY2xhc3NOYW1lczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Ly8gcmVxdWVzdHMgYXJlIHNvcnRlZCBieSB6SW5kZXgsIHR5cGUsIGFuZCBjbGFzc05hbWUgc28gd2UgY2FuIGRlZHVwIGNsYXNzTmFtZSBieSBsb29raW5nIGF0IHRoZSBwcmV2aW91cyBvbmVcblx0XHRcdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHJlcXVlc3RzQXRMb2NhdGlvbikge1xuXHRcdFx0XHRcdGlmIChyZXF1ZXN0LnpJbmRleCAhPT0gd2lubmVyLnpJbmRleCB8fCByZXF1ZXN0LnR5cGUgIT09IHdpbm5lci50eXBlKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNsYXNzTmFtZXMubGVuZ3RoID09PSAwIHx8IGNsYXNzTmFtZXNbY2xhc3NOYW1lcy5sZW5ndGggLSAxXSAhPT0gcmVxdWVzdC5jbGFzc05hbWUpIHtcblx0XHRcdFx0XHRcdGNsYXNzTmFtZXMucHVzaChyZXF1ZXN0LmNsYXNzTmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyLnB1c2god2lubmVyLmFjY2VwdChjbGFzc05hbWVzLmpvaW4oJyAnKSkpOyAvLyBUT0RPQGpveWNlZXJobCBJbXBsZW1lbnQgb3ZlcmZsb3cgZm9yIHJlbWFpbmluZyBkZWNvcmF0aW9uc1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gd2lkZ2V0cyBjYW5ub3QgYmUgY29tYmluZWRcblx0XHRcdFx0d2lubmVyLndpZGdldC5yZW5kZXJJbmZvID0ge1xuXHRcdFx0XHRcdGxpbmVOdW1iZXI6IHdpbm5lci5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdGxhbmVJbmRleDogd2lubmVyLmxhbmVJbmRleCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyID0gZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihjdHg6IFJlc3RyaWN0ZWRSZW5kZXJpbmdDb250ZXh0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9nbHlwaE1hcmdpbikge1xuXHRcdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLl93aWRnZXRzKSkge1xuXHRcdFx0XHR3aWRnZXQuZG9tTm9kZS5zZXREaXNwbGF5KCdub25lJyk7XG5cdFx0XHR9XG5cdFx0XHR3aGlsZSAodGhpcy5fbWFuYWdlZERvbU5vZGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuX21hbmFnZWREb21Ob2Rlcy5wb3AoKTtcblx0XHRcdFx0ZG9tTm9kZT8uZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWR0aCA9IChNYXRoLnJvdW5kKHRoaXMuX2dseXBoTWFyZ2luV2lkdGggLyB0aGlzLl9nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQpKTtcblxuXHRcdC8vIFJlbmRlciB3aWRnZXRzXG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLl93aWRnZXRzKSkge1xuXHRcdFx0aWYgKCF3aWRnZXQucmVuZGVySW5mbykge1xuXHRcdFx0XHQvLyB0aGlzIHdpZGdldCBpcyBub3QgdmlzaWJsZVxuXHRcdFx0XHR3aWRnZXQuZG9tTm9kZS5zZXREaXNwbGF5KCdub25lJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0b3AgPSBjdHgudmlld3BvcnREYXRhLnJlbGF0aXZlVmVydGljYWxPZmZzZXRbd2lkZ2V0LnJlbmRlckluZm8ubGluZU51bWJlciAtIGN0eC52aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyXTtcblx0XHRcdFx0Y29uc3QgbGVmdCA9IHRoaXMuX2dseXBoTWFyZ2luTGVmdCArIHdpZGdldC5yZW5kZXJJbmZvLmxhbmVJbmRleCAqIHRoaXMuX2xpbmVIZWlnaHQ7XG5cblx0XHRcdFx0d2lkZ2V0LmRvbU5vZGUuc2V0RGlzcGxheSgnYmxvY2snKTtcblx0XHRcdFx0d2lkZ2V0LmRvbU5vZGUuc2V0VG9wKHRvcCk7XG5cdFx0XHRcdHdpZGdldC5kb21Ob2RlLnNldExlZnQobGVmdCk7XG5cdFx0XHRcdHdpZGdldC5kb21Ob2RlLnNldFdpZHRoKHdpZHRoKTtcblx0XHRcdFx0d2lkZ2V0LmRvbU5vZGUuc2V0SGVpZ2h0KHRoaXMuX2xpbmVIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBkZWNvcmF0aW9ucywgcmV1c2luZyBwcmV2aW91cyBkb20gbm9kZXMgYXMgcG9zc2libGVcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2RlY29yYXRpb25HbHlwaHNUb1JlbmRlci5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZGVjID0gdGhpcy5fZGVjb3JhdGlvbkdseXBoc1RvUmVuZGVyW2ldO1xuXHRcdFx0Y29uc3QgZGVjTGluZU51bWJlciA9IGRlYy5saW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgdG9wID0gY3R4LnZpZXdwb3J0RGF0YS5yZWxhdGl2ZVZlcnRpY2FsT2Zmc2V0W2RlY0xpbmVOdW1iZXIgLSBjdHgudmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcl07XG5cdFx0XHRjb25zdCBsZWZ0ID0gdGhpcy5fZ2x5cGhNYXJnaW5MZWZ0ICsgZGVjLmxhbmVJbmRleCAqIHRoaXMuX2xpbmVIZWlnaHQ7XG5cblx0XHRcdGxldCBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdFx0XHRpZiAoaSA8IHRoaXMuX21hbmFnZWREb21Ob2Rlcy5sZW5ndGgpIHtcblx0XHRcdFx0ZG9tTm9kZSA9IHRoaXMuX21hbmFnZWREb21Ob2Rlc1tpXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0XHRcdHRoaXMuX21hbmFnZWREb21Ob2Rlcy5wdXNoKGRvbU5vZGUpO1xuXHRcdFx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fY29udGV4dC52aWV3TGF5b3V0LmdldExpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKGRlY0xpbmVOdW1iZXIpO1xuXG5cdFx0XHRkb21Ob2RlLnNldENsYXNzTmFtZShgY2dtciBjb2RpY29uIGAgKyBkZWMuY29tYmluZWRDbGFzc05hbWUpO1xuXHRcdFx0ZG9tTm9kZS5zZXRQb3NpdGlvbihgYWJzb2x1dGVgKTtcblx0XHRcdGRvbU5vZGUuc2V0VG9wKHRvcCk7XG5cdFx0XHRkb21Ob2RlLnNldExlZnQobGVmdCk7XG5cdFx0XHRkb21Ob2RlLnNldFdpZHRoKHdpZHRoKTtcblx0XHRcdGRvbU5vZGUuc2V0SGVpZ2h0KGxpbmVIZWlnaHQpO1xuXHRcdH1cblxuXHRcdC8vIHJlbW92ZSBleHRyYSBkb20gbm9kZXNcblx0XHR3aGlsZSAodGhpcy5fbWFuYWdlZERvbU5vZGVzLmxlbmd0aCA+IHRoaXMuX2RlY29yYXRpb25HbHlwaHNUb1JlbmRlci5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGRvbU5vZGUgPSB0aGlzLl9tYW5hZ2VkRG9tTm9kZXMucG9wKCk7XG5cdFx0XHRkb21Ob2RlPy5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXaWRnZXREYXRhIHtcblx0d2lkZ2V0OiBJR2x5cGhNYXJnaW5XaWRnZXQ7XG5cdHByZWZlcmVuY2U6IElHbHlwaE1hcmdpbldpZGdldFBvc2l0aW9uO1xuXHRkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdC8qKlxuXHQgKiBpdCB3aWxsIGNvbnRhaW4gdGhlIGxvY2F0aW9uIHdoZXJlIHRvIHJlbmRlciB0aGUgd2lkZ2V0XG5cdCAqIG9yIG51bGwgaWYgdGhlIHdpZGdldCBpcyBub3QgdmlzaWJsZVxuXHQgKi9cblx0cmVuZGVySW5mbzogSVJlbmRlckluZm8gfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZW5kZXJJbmZvIHtcblx0bGluZU51bWJlcjogbnVtYmVyO1xuXHRsYW5lSW5kZXg6IG51bWJlcjtcbn1cblxuY29uc3QgZW51bSBHbHlwaFJlbmRlclJlcXVlc3RUeXBlIHtcblx0RGVjb3JhdGlvbiA9IDAsXG5cdFdpZGdldCA9IDFcbn1cblxuLyoqXG4gKiBBIHJlcXVlc3QgdG8gcmVuZGVyIGEgZGVjb3JhdGlvbiBpbiB0aGUgZ2x5cGggbWFyZ2luIGF0IGEgY2VydGFpbiBsb2NhdGlvbi5cbiAqL1xuY2xhc3MgRGVjb3JhdGlvbkJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBHbHlwaFJlbmRlclJlcXVlc3RUeXBlLkRlY29yYXRpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFuZUluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHpJbmRleDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBjbGFzc05hbWU6IHN0cmluZyxcblx0KSB7IH1cblxuXHRhY2NlcHQoY29tYmluZWRDbGFzc05hbWU6IHN0cmluZyk6IERlY29yYXRpb25CYXNlZEdseXBoIHtcblx0XHRyZXR1cm4gbmV3IERlY29yYXRpb25CYXNlZEdseXBoKHRoaXMubGluZU51bWJlciwgdGhpcy5sYW5lSW5kZXgsIGNvbWJpbmVkQ2xhc3NOYW1lKTtcblx0fVxufVxuXG4vKipcbiAqIEEgcmVxdWVzdCB0byByZW5kZXIgYSB3aWRnZXQgaW4gdGhlIGdseXBoIG1hcmdpbiBhdCBhIGNlcnRhaW4gbG9jYXRpb24uXG4gKi9cbmNsYXNzIFdpZGdldEJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0IHtcblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBHbHlwaFJlbmRlclJlcXVlc3RUeXBlLldpZGdldDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBsYW5lSW5kZXg6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgekluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHdpZGdldDogSVdpZGdldERhdGEsXG5cdCkgeyB9XG59XG5cbnR5cGUgR2x5cGhSZW5kZXJSZXF1ZXN0ID0gRGVjb3JhdGlvbkJhc2VkR2x5cGhSZW5kZXJSZXF1ZXN0IHwgV2lkZ2V0QmFzZWRHbHlwaFJlbmRlclJlcXVlc3Q7XG5cbmNsYXNzIERlY29yYXRpb25CYXNlZEdseXBoIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFuZUluZGV4OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbWJpbmVkQ2xhc3NOYW1lOiBzdHJpbmdcblx0KSB7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQXNCLHlCQUF5QjtBQUMvQyxTQUFTLGtCQUFrQjtBQUMzQixPQUFPO0FBRVAsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBUXpCLE1BQU0sbUJBQW1CO0FBQUEsRUFLL0IsWUFDaUIsaUJBQ0EsZUFDQSxXQUNBLFNBQ2hCLFFBQ0M7QUFMZTtBQUNBO0FBQ0E7QUFDQTtBQVJqQixTQUFnQiwyQkFBaUM7QUFXaEQsU0FBSyxTQUFTLFVBQVU7QUFBQSxFQUN6QjtBQUNEO0FBS08sTUFBTSx1QkFBdUI7QUFBQSxFQUNuQyxZQUNpQixXQUNBLFFBQ0EsU0FDZjtBQUhlO0FBQ0E7QUFDQTtBQUFBLEVBQ2I7QUFDTDtBQUtPLE1BQU0sK0JBQStCO0FBQUEsRUFBckM7QUFFTixTQUFpQixjQUF3QyxDQUFDO0FBQUE7QUFBQSxFQUVuRCxJQUFJLFlBQW9DO0FBQzlDLFNBQUssWUFBWSxLQUFLLFVBQVU7QUFBQSxFQUNqQztBQUFBLEVBRU8saUJBQTJDO0FBQ2pELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQUVPLE1BQWUscUJBQXFCLG1CQUFtQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS25ELFFBQVEsd0JBQWdDLHNCQUE4QixhQUFxRTtBQUVwSixVQUFNLFNBQTJDLENBQUM7QUFDbEQsYUFBUyxhQUFhLHdCQUF3QixjQUFjLHNCQUFzQixjQUFjO0FBQy9GLFlBQU0sWUFBWSxhQUFhO0FBQy9CLGFBQU8sU0FBUyxJQUFJLElBQUksK0JBQStCO0FBQUEsSUFDeEQ7QUFFQSxRQUFJLFlBQVksV0FBVyxHQUFHO0FBQzdCLGFBQU87QUFBQSxJQUNSO0FBR0EsZ0JBQVksS0FBSyxDQUFDLEdBQUcsTUFBTTtBQUMx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
