import "./selections.css";
import { DynamicViewOverlay } from "../../view/dynamicViewOverlay.js";
import { editorSelectionForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
var CornerStyle = /* @__PURE__ */ ((CornerStyle2) => {
  CornerStyle2[CornerStyle2["EXTERN"] = 0] = "EXTERN";
  CornerStyle2[CornerStyle2["INTERN"] = 1] = "INTERN";
  CornerStyle2[CornerStyle2["FLAT"] = 2] = "FLAT";
  return CornerStyle2;
})(CornerStyle || {});
class HorizontalRangeWithStyle {
  constructor(other) {
    this.left = other.left;
    this.width = other.width;
    this.startStyle = null;
    this.endStyle = null;
  }
}
class LineVisibleRangesWithStyle {
  constructor(lineNumber, ranges) {
    this.lineNumber = lineNumber;
    this.ranges = ranges;
  }
}
function toStyledRange(item) {
  return new HorizontalRangeWithStyle(item);
}
function toStyled(item) {
  return new LineVisibleRangesWithStyle(item.lineNumber, item.ranges.map(toStyledRange));
}
const _SelectionsOverlay = class _SelectionsOverlay extends DynamicViewOverlay {
  constructor(context) {
    super();
    this._previousFrameVisibleRangesWithStyle = [];
    this._context = context;
    const options = this._context.configuration.options;
    this._roundedSelection = options.get(EditorOption.roundedSelection);
    this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    this._selections = [];
    this._renderResult = null;
    this._context.addEventHandler(this);
  }
  dispose() {
    this._context.removeEventHandler(this);
    this._renderResult = null;
    super.dispose();
  }
  // --- begin event handlers
  onConfigurationChanged(e) {
    const options = this._context.configuration.options;
    this._roundedSelection = options.get(EditorOption.roundedSelection);
    this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
    return true;
  }
  onCursorStateChanged(e) {
    this._selections = e.selections.slice(0);
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
  _visibleRangesHaveGaps(linesVisibleRanges) {
    for (let i = 0, len = linesVisibleRanges.length; i < len; i++) {
      const lineVisibleRanges = linesVisibleRanges[i];
      if (lineVisibleRanges.ranges.length > 1) {
        return true;
      }
    }
    return false;
  }
  _enrichVisibleRangesWithStyle(viewport, linesVisibleRanges, previousFrame) {
    const epsilon = this._typicalHalfwidthCharacterWidth / 4;
    let previousFrameTop = null;
    let previousFrameBottom = null;
    if (previousFrame && previousFrame.length > 0 && linesVisibleRanges.length > 0) {
      const topLineNumber = linesVisibleRanges[0].lineNumber;
      if (topLineNumber === viewport.startLineNumber) {
        for (let i = 0; !previousFrameTop && i < previousFrame.length; i++) {
          if (previousFrame[i].lineNumber === topLineNumber) {
            previousFrameTop = previousFrame[i].ranges[0];
          }
        }
      }
      const bottomLineNumber = linesVisibleRanges[linesVisibleRanges.length - 1].lineNumber;
      if (bottomLineNumber === viewport.endLineNumber) {
        for (let i = previousFrame.length - 1; !previousFrameBottom && i >= 0; i--) {
          if (previousFrame[i].lineNumber === bottomLineNumber) {
            previousFrameBottom = previousFrame[i].ranges[0];
          }
        }
      }
      if (previousFrameTop && !previousFrameTop.startStyle) {
        previousFrameTop = null;
      }
      if (previousFrameBottom && !previousFrameBottom.startStyle) {
        previousFrameBottom = null;
      }
    }
    for (let i = 0, len = linesVisibleRanges.length; i < len; i++) {
      const curLineRange = linesVisibleRanges[i].ranges[0];
      const curLeft = curLineRange.left;
      const curRight = curLineRange.left + curLineRange.width;
      const startStyle = {
        top: 0 /* EXTERN */,
        bottom: 0 /* EXTERN */
      };
      const endStyle = {
        top: 0 /* EXTERN */,
        bottom: 0 /* EXTERN */
      };
      if (i > 0) {
        const prevLeft = linesVisibleRanges[i - 1].ranges[0].left;
        const prevRight = linesVisibleRanges[i - 1].ranges[0].left + linesVisibleRanges[i - 1].ranges[0].width;
        if (abs(curLeft - prevLeft) < epsilon) {
          startStyle.top = 2 /* FLAT */;
        } else if (curLeft > prevLeft) {
          startStyle.top = 1 /* INTERN */;
        }
        if (abs(curRight - prevRight) < epsilon) {
          endStyle.top = 2 /* FLAT */;
        } else if (prevLeft < curRight && curRight < prevRight) {
          endStyle.top = 1 /* INTERN */;
        }
      } else if (previousFrameTop) {
        startStyle.top = previousFrameTop.startStyle.top;
        endStyle.top = previousFrameTop.endStyle.top;
      }
      if (i + 1 < len) {
        const nextLeft = linesVisibleRanges[i + 1].ranges[0].left;
        const nextRight = linesVisibleRanges[i + 1].ranges[0].left + linesVisibleRanges[i + 1].ranges[0].width;
        if (abs(curLeft - nextLeft) < epsilon) {
          startStyle.bottom = 2 /* FLAT */;
        } else if (nextLeft < curLeft && curLeft < nextRight) {
          startStyle.bottom = 1 /* INTERN */;
        }
        if (abs(curRight - nextRight) < epsilon) {
          endStyle.bottom = 2 /* FLAT */;
        } else if (curRight < nextRight) {
          endStyle.bottom = 1 /* INTERN */;
        }
      } else if (previousFrameBottom) {
        startStyle.bottom = previousFrameBottom.startStyle.bottom;
        endStyle.bottom = previousFrameBottom.endStyle.bottom;
      }
      curLineRange.startStyle = startStyle;
      curLineRange.endStyle = endStyle;
    }
  }
  _getVisibleRangesWithStyle(selection, ctx, previousFrame) {
    const _linesVisibleRanges = ctx.linesVisibleRangesForRange(selection, true) || [];
    const linesVisibleRanges = _linesVisibleRanges.map(toStyled);
    const visibleRangesHaveGaps = this._visibleRangesHaveGaps(linesVisibleRanges);
    if (!visibleRangesHaveGaps && this._roundedSelection) {
      this._enrichVisibleRangesWithStyle(ctx.visibleRange, linesVisibleRanges, previousFrame);
    }
    return linesVisibleRanges;
  }
  _createSelectionPiece(top, bottom, className, left, width) {
    return '<div class="cslr ' + className + '" style="top:' + top.toString() + "px;bottom:" + bottom.toString() + "px;left:" + left.toString() + "px;width:" + width.toString() + 'px;"></div>';
  }
  _actualRenderOneSelection(output2, visibleStartLineNumber, hasMultipleSelections, visibleRanges) {
    if (visibleRanges.length === 0) {
      return;
    }
    const visibleRangesHaveStyle = !!visibleRanges[0].ranges[0].startStyle;
    const firstLineNumber = visibleRanges[0].lineNumber;
    const lastLineNumber = visibleRanges[visibleRanges.length - 1].lineNumber;
    for (let i = 0, len = visibleRanges.length; i < len; i++) {
      const lineVisibleRanges = visibleRanges[i];
      const lineNumber = lineVisibleRanges.lineNumber;
      const lineIndex = lineNumber - visibleStartLineNumber;
      const top = hasMultipleSelections ? lineNumber === firstLineNumber ? 1 : 0 : 0;
      const bottom = hasMultipleSelections ? lineNumber !== firstLineNumber && lineNumber === lastLineNumber ? 1 : 0 : 0;
      let innerCornerOutput = "";
      let restOfSelectionOutput = "";
      for (let j = 0, lenJ = lineVisibleRanges.ranges.length; j < lenJ; j++) {
        const visibleRange = lineVisibleRanges.ranges[j];
        if (visibleRangesHaveStyle) {
          const startStyle = visibleRange.startStyle;
          const endStyle = visibleRange.endStyle;
          if (startStyle.top === 1 /* INTERN */ || startStyle.bottom === 1 /* INTERN */) {
            innerCornerOutput += this._createSelectionPiece(top, bottom, _SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left - _SelectionsOverlay.ROUNDED_PIECE_WIDTH, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
            let className2 = _SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
            if (startStyle.top === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_TOP_RIGHT;
            }
            if (startStyle.bottom === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
            }
            innerCornerOutput += this._createSelectionPiece(top, bottom, className2, visibleRange.left - _SelectionsOverlay.ROUNDED_PIECE_WIDTH, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
          }
          if (endStyle.top === 1 /* INTERN */ || endStyle.bottom === 1 /* INTERN */) {
            innerCornerOutput += this._createSelectionPiece(top, bottom, _SelectionsOverlay.SELECTION_CLASS_NAME, visibleRange.left + visibleRange.width, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
            let className2 = _SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME;
            if (endStyle.top === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_TOP_LEFT;
            }
            if (endStyle.bottom === 1 /* INTERN */) {
              className2 += " " + _SelectionsOverlay.SELECTION_BOTTOM_LEFT;
            }
            innerCornerOutput += this._createSelectionPiece(top, bottom, className2, visibleRange.left + visibleRange.width, _SelectionsOverlay.ROUNDED_PIECE_WIDTH);
          }
        }
        let className = _SelectionsOverlay.SELECTION_CLASS_NAME;
        if (visibleRangesHaveStyle) {
          const startStyle = visibleRange.startStyle;
          const endStyle = visibleRange.endStyle;
          if (startStyle.top === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_TOP_LEFT;
          }
          if (startStyle.bottom === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_BOTTOM_LEFT;
          }
          if (endStyle.top === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_TOP_RIGHT;
          }
          if (endStyle.bottom === 0 /* EXTERN */) {
            className += " " + _SelectionsOverlay.SELECTION_BOTTOM_RIGHT;
          }
        }
        restOfSelectionOutput += this._createSelectionPiece(top, bottom, className, visibleRange.left, visibleRange.width);
      }
      output2[lineIndex][0] += innerCornerOutput;
      output2[lineIndex][1] += restOfSelectionOutput;
    }
  }
  prepareRender(ctx) {
    const output = [];
    const visibleStartLineNumber = ctx.visibleRange.startLineNumber;
    const visibleEndLineNumber = ctx.visibleRange.endLineNumber;
    for (let lineNumber = visibleStartLineNumber; lineNumber <= visibleEndLineNumber; lineNumber++) {
      const lineIndex = lineNumber - visibleStartLineNumber;
      output[lineIndex] = ["", ""];
    }
    const thisFrameVisibleRangesWithStyle = [];
    for (let i = 0, len = this._selections.length; i < len; i++) {
      const selection = this._selections[i];
      if (selection.isEmpty()) {
        thisFrameVisibleRangesWithStyle[i] = null;
        continue;
      }
      const visibleRangesWithStyle = this._getVisibleRangesWithStyle(selection, ctx, this._previousFrameVisibleRangesWithStyle[i]);
      thisFrameVisibleRangesWithStyle[i] = visibleRangesWithStyle;
      this._actualRenderOneSelection(output, visibleStartLineNumber, this._selections.length > 1, visibleRangesWithStyle);
    }
    this._previousFrameVisibleRangesWithStyle = thisFrameVisibleRangesWithStyle;
    this._renderResult = output.map(([internalCorners, restOfSelection]) => internalCorners + restOfSelection);
  }
  render(startLineNumber, lineNumber) {
    if (!this._renderResult) {
      return "";
    }
    const lineIndex = lineNumber - startLineNumber;
    if (lineIndex < 0 || lineIndex >= this._renderResult.length) {
      return "";
    }
    return this._renderResult[lineIndex];
  }
};
_SelectionsOverlay.SELECTION_CLASS_NAME = "selected-text";
_SelectionsOverlay.SELECTION_TOP_LEFT = "top-left-radius";
_SelectionsOverlay.SELECTION_BOTTOM_LEFT = "bottom-left-radius";
_SelectionsOverlay.SELECTION_TOP_RIGHT = "top-right-radius";
_SelectionsOverlay.SELECTION_BOTTOM_RIGHT = "bottom-right-radius";
_SelectionsOverlay.EDITOR_BACKGROUND_CLASS_NAME = "monaco-editor-background";
_SelectionsOverlay.ROUNDED_PIECE_WIDTH = 10;
let SelectionsOverlay = _SelectionsOverlay;
registerThemingParticipant((theme, collector) => {
  const editorSelectionForegroundColor = theme.getColor(editorSelectionForeground);
  if (editorSelectionForegroundColor && !editorSelectionForegroundColor.isTransparent()) {
    collector.addRule(`.monaco-editor .view-line span.inline-selected-text { color: ${editorSelectionForegroundColor}; }`);
  }
});
function abs(n) {
  return n < 0 ? -n : n;
}
export {
  SelectionsOverlay
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXdQYXJ0cy9zZWxlY3Rpb25zL3NlbGVjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vc2VsZWN0aW9ucy5jc3MnO1xuaW1wb3J0IHsgRHluYW1pY1ZpZXdPdmVybGF5IH0gZnJvbSAnLi4vLi4vdmlldy9keW5hbWljVmlld092ZXJsYXkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBIb3Jpem9udGFsUmFuZ2UsIExpbmVWaXNpYmxlUmFuZ2VzLCBSZW5kZXJpbmdDb250ZXh0IH0gZnJvbSAnLi4vLi4vdmlldy9yZW5kZXJpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IGVkaXRvclNlbGVjdGlvbkZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcblxuY29uc3QgZW51bSBDb3JuZXJTdHlsZSB7XG5cdEVYVEVSTixcblx0SU5URVJOLFxuXHRGTEFUXG59XG5cbmludGVyZmFjZSBJVmlzaWJsZVJhbmdlRW5kUG9pbnRTdHlsZSB7XG5cdHRvcDogQ29ybmVyU3R5bGU7XG5cdGJvdHRvbTogQ29ybmVyU3R5bGU7XG59XG5cbmNsYXNzIEhvcml6b250YWxSYW5nZVdpdGhTdHlsZSB7XG5cdHB1YmxpYyBsZWZ0OiBudW1iZXI7XG5cdHB1YmxpYyB3aWR0aDogbnVtYmVyO1xuXHRwdWJsaWMgc3RhcnRTdHlsZTogSVZpc2libGVSYW5nZUVuZFBvaW50U3R5bGUgfCBudWxsO1xuXHRwdWJsaWMgZW5kU3R5bGU6IElWaXNpYmxlUmFuZ2VFbmRQb2ludFN0eWxlIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihvdGhlcjogSG9yaXpvbnRhbFJhbmdlKSB7XG5cdFx0dGhpcy5sZWZ0ID0gb3RoZXIubGVmdDtcblx0XHR0aGlzLndpZHRoID0gb3RoZXIud2lkdGg7XG5cdFx0dGhpcy5zdGFydFN0eWxlID0gbnVsbDtcblx0XHR0aGlzLmVuZFN0eWxlID0gbnVsbDtcblx0fVxufVxuXG5jbGFzcyBMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZSB7XG5cdHB1YmxpYyBsaW5lTnVtYmVyOiBudW1iZXI7XG5cdHB1YmxpYyByYW5nZXM6IEhvcml6b250YWxSYW5nZVdpdGhTdHlsZVtdO1xuXG5cdGNvbnN0cnVjdG9yKGxpbmVOdW1iZXI6IG51bWJlciwgcmFuZ2VzOiBIb3Jpem9udGFsUmFuZ2VXaXRoU3R5bGVbXSkge1xuXHRcdHRoaXMubGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0dGhpcy5yYW5nZXMgPSByYW5nZXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9TdHlsZWRSYW5nZShpdGVtOiBIb3Jpem9udGFsUmFuZ2UpOiBIb3Jpem9udGFsUmFuZ2VXaXRoU3R5bGUge1xuXHRyZXR1cm4gbmV3IEhvcml6b250YWxSYW5nZVdpdGhTdHlsZShpdGVtKTtcbn1cblxuZnVuY3Rpb24gdG9TdHlsZWQoaXRlbTogTGluZVZpc2libGVSYW5nZXMpOiBMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZSB7XG5cdHJldHVybiBuZXcgTGluZVZpc2libGVSYW5nZXNXaXRoU3R5bGUoaXRlbS5saW5lTnVtYmVyLCBpdGVtLnJhbmdlcy5tYXAodG9TdHlsZWRSYW5nZSkpO1xufVxuXG4vKipcbiAqIFRoaXMgdmlldyBwYXJ0IGRpc3BsYXlzIHNlbGVjdGVkIHRleHQgdG8gdGhlIHVzZXIuIEV2ZXJ5IGxpbmUgaGFzIGl0cyBvd24gc2VsZWN0aW9uIG92ZXJsYXkuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb25zT3ZlcmxheSBleHRlbmRzIER5bmFtaWNWaWV3T3ZlcmxheSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VMRUNUSU9OX0NMQVNTX05BTUUgPSAnc2VsZWN0ZWQtdGV4dCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFTEVDVElPTl9UT1BfTEVGVCA9ICd0b3AtbGVmdC1yYWRpdXMnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRUxFQ1RJT05fQk9UVE9NX0xFRlQgPSAnYm90dG9tLWxlZnQtcmFkaXVzJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VMRUNUSU9OX1RPUF9SSUdIVCA9ICd0b3AtcmlnaHQtcmFkaXVzJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VMRUNUSU9OX0JPVFRPTV9SSUdIVCA9ICdib3R0b20tcmlnaHQtcmFkaXVzJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRURJVE9SX0JBQ0tHUk9VTkRfQ0xBU1NfTkFNRSA9ICdtb25hY28tZWRpdG9yLWJhY2tncm91bmQnO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJPVU5ERURfUElFQ0VfV0lEVEggPSAxMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBWaWV3Q29udGV4dDtcblx0cHJpdmF0ZSBfcm91bmRlZFNlbGVjdGlvbjogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgX3NlbGVjdGlvbnM6IFJhbmdlW107XG5cdHByaXZhdGUgX3JlbmRlclJlc3VsdDogc3RyaW5nW10gfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRleHQ6IFZpZXdDb250ZXh0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0dGhpcy5fcm91bmRlZFNlbGVjdGlvbiA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5yb3VuZGVkU2VsZWN0aW9uKTtcblx0XHR0aGlzLl90eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHR0aGlzLl9zZWxlY3Rpb25zID0gW107XG5cdFx0dGhpcy5fcmVuZGVyUmVzdWx0ID0gbnVsbDtcblx0XHR0aGlzLl9jb250ZXh0LmFkZEV2ZW50SGFuZGxlcih0aGlzKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRleHQucmVtb3ZlRXZlbnRIYW5kbGVyKHRoaXMpO1xuXHRcdHRoaXMuX3JlbmRlclJlc3VsdCA9IG51bGw7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8gLS0tIGJlZ2luIGV2ZW50IGhhbmRsZXJzXG5cblx0cHVibGljIG92ZXJyaWRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHR0aGlzLl9yb3VuZGVkU2VsZWN0aW9uID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJvdW5kZWRTZWxlY3Rpb24pO1xuXHRcdHRoaXMuX3R5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbykudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkN1cnNvclN0YXRlQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDdXJzb3JTdGF0ZUNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX3NlbGVjdGlvbnMgPSBlLnNlbGVjdGlvbnMuc2xpY2UoMCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRGVjb3JhdGlvbnNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gdHJ1ZSBmb3IgaW5saW5lIGRlY29yYXRpb25zIHRoYXQgY2FuIGVuZCB1cCByZWxheW91dGluZyB0ZXh0XG5cdFx0cmV0dXJuIHRydWU7Ly9lLmlubGluZURlY29yYXRpb25zQ2hhbmdlZDtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25GbHVzaGVkKGU6IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzRGVsZXRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0RlbGV0ZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvbkxpbmVzSW5zZXJ0ZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNJbnNlcnRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZS5zY3JvbGxUb3BDaGFuZ2VkO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblpvbmVzQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdab25lc0NoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gLS0tIGVuZCBldmVudCBoYW5kbGVyc1xuXG5cdHByaXZhdGUgX3Zpc2libGVSYW5nZXNIYXZlR2FwcyhsaW5lc1Zpc2libGVSYW5nZXM6IExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW10pOiBib29sZWFuIHtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lc1Zpc2libGVSYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVWaXNpYmxlUmFuZ2VzID0gbGluZXNWaXNpYmxlUmFuZ2VzW2ldO1xuXG5cdFx0XHRpZiAobGluZVZpc2libGVSYW5nZXMucmFuZ2VzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0Ly8gVGhlcmUgYXJlIHR3byByYW5nZXMgb24gdGhlIHNhbWUgbGluZVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9lbnJpY2hWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlKHZpZXdwb3J0OiBSYW5nZSwgbGluZXNWaXNpYmxlUmFuZ2VzOiBMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtdLCBwcmV2aW91c0ZyYW1lOiBMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtdIHwgbnVsbCk6IHZvaWQge1xuXHRcdGNvbnN0IGVwc2lsb24gPSB0aGlzLl90eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggLyA0O1xuXHRcdGxldCBwcmV2aW91c0ZyYW1lVG9wOiBIb3Jpem9udGFsUmFuZ2VXaXRoU3R5bGUgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgcHJldmlvdXNGcmFtZUJvdHRvbTogSG9yaXpvbnRhbFJhbmdlV2l0aFN0eWxlIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAocHJldmlvdXNGcmFtZSAmJiBwcmV2aW91c0ZyYW1lLmxlbmd0aCA+IDAgJiYgbGluZXNWaXNpYmxlUmFuZ2VzLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0Y29uc3QgdG9wTGluZU51bWJlciA9IGxpbmVzVmlzaWJsZVJhbmdlc1swXS5saW5lTnVtYmVyO1xuXHRcdFx0aWYgKHRvcExpbmVOdW1iZXIgPT09IHZpZXdwb3J0LnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgIXByZXZpb3VzRnJhbWVUb3AgJiYgaSA8IHByZXZpb3VzRnJhbWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAocHJldmlvdXNGcmFtZVtpXS5saW5lTnVtYmVyID09PSB0b3BMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRwcmV2aW91c0ZyYW1lVG9wID0gcHJldmlvdXNGcmFtZVtpXS5yYW5nZXNbMF07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJvdHRvbUxpbmVOdW1iZXIgPSBsaW5lc1Zpc2libGVSYW5nZXNbbGluZXNWaXNpYmxlUmFuZ2VzLmxlbmd0aCAtIDFdLmxpbmVOdW1iZXI7XG5cdFx0XHRpZiAoYm90dG9tTGluZU51bWJlciA9PT0gdmlld3BvcnQuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gcHJldmlvdXNGcmFtZS5sZW5ndGggLSAxOyAhcHJldmlvdXNGcmFtZUJvdHRvbSAmJiBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdGlmIChwcmV2aW91c0ZyYW1lW2ldLmxpbmVOdW1iZXIgPT09IGJvdHRvbUxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHByZXZpb3VzRnJhbWVCb3R0b20gPSBwcmV2aW91c0ZyYW1lW2ldLnJhbmdlc1swXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHByZXZpb3VzRnJhbWVUb3AgJiYgIXByZXZpb3VzRnJhbWVUb3Auc3RhcnRTdHlsZSkge1xuXHRcdFx0XHRwcmV2aW91c0ZyYW1lVG9wID0gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChwcmV2aW91c0ZyYW1lQm90dG9tICYmICFwcmV2aW91c0ZyYW1lQm90dG9tLnN0YXJ0U3R5bGUpIHtcblx0XHRcdFx0cHJldmlvdXNGcmFtZUJvdHRvbSA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzVmlzaWJsZVJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Ly8gV2Uga25vdyBmb3IgYSBmYWN0IHRoYXQgdGhlcmUgaXMgcHJlY2lzZWx5IG9uZSByYW5nZSBvbiBlYWNoIGxpbmVcblx0XHRcdGNvbnN0IGN1ckxpbmVSYW5nZSA9IGxpbmVzVmlzaWJsZVJhbmdlc1tpXS5yYW5nZXNbMF07XG5cdFx0XHRjb25zdCBjdXJMZWZ0ID0gY3VyTGluZVJhbmdlLmxlZnQ7XG5cdFx0XHRjb25zdCBjdXJSaWdodCA9IGN1ckxpbmVSYW5nZS5sZWZ0ICsgY3VyTGluZVJhbmdlLndpZHRoO1xuXG5cdFx0XHRjb25zdCBzdGFydFN0eWxlID0ge1xuXHRcdFx0XHR0b3A6IENvcm5lclN0eWxlLkVYVEVSTixcblx0XHRcdFx0Ym90dG9tOiBDb3JuZXJTdHlsZS5FWFRFUk5cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGVuZFN0eWxlID0ge1xuXHRcdFx0XHR0b3A6IENvcm5lclN0eWxlLkVYVEVSTixcblx0XHRcdFx0Ym90dG9tOiBDb3JuZXJTdHlsZS5FWFRFUk5cblx0XHRcdH07XG5cblx0XHRcdGlmIChpID4gMCkge1xuXHRcdFx0XHQvLyBMb29rIGFib3ZlXG5cdFx0XHRcdGNvbnN0IHByZXZMZWZ0ID0gbGluZXNWaXNpYmxlUmFuZ2VzW2kgLSAxXS5yYW5nZXNbMF0ubGVmdDtcblx0XHRcdFx0Y29uc3QgcHJldlJpZ2h0ID0gbGluZXNWaXNpYmxlUmFuZ2VzW2kgLSAxXS5yYW5nZXNbMF0ubGVmdCArIGxpbmVzVmlzaWJsZVJhbmdlc1tpIC0gMV0ucmFuZ2VzWzBdLndpZHRoO1xuXG5cdFx0XHRcdGlmIChhYnMoY3VyTGVmdCAtIHByZXZMZWZ0KSA8IGVwc2lsb24pIHtcblx0XHRcdFx0XHRzdGFydFN0eWxlLnRvcCA9IENvcm5lclN0eWxlLkZMQVQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3VyTGVmdCA+IHByZXZMZWZ0KSB7XG5cdFx0XHRcdFx0c3RhcnRTdHlsZS50b3AgPSBDb3JuZXJTdHlsZS5JTlRFUk47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWJzKGN1clJpZ2h0IC0gcHJldlJpZ2h0KSA8IGVwc2lsb24pIHtcblx0XHRcdFx0XHRlbmRTdHlsZS50b3AgPSBDb3JuZXJTdHlsZS5GTEFUO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByZXZMZWZ0IDwgY3VyUmlnaHQgJiYgY3VyUmlnaHQgPCBwcmV2UmlnaHQpIHtcblx0XHRcdFx0XHRlbmRTdHlsZS50b3AgPSBDb3JuZXJTdHlsZS5JTlRFUk47XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocHJldmlvdXNGcmFtZVRvcCkge1xuXHRcdFx0XHQvLyBBY2NlcHQgc29tZSBoaWNjdXBzIG5lYXIgdGhlIHZpZXdwb3J0IGVkZ2VzIHRvIHNhdmUgb24gcmVwYWludHNcblx0XHRcdFx0c3RhcnRTdHlsZS50b3AgPSBwcmV2aW91c0ZyYW1lVG9wLnN0YXJ0U3R5bGUhLnRvcDtcblx0XHRcdFx0ZW5kU3R5bGUudG9wID0gcHJldmlvdXNGcmFtZVRvcC5lbmRTdHlsZSEudG9wO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaSArIDEgPCBsZW4pIHtcblx0XHRcdFx0Ly8gTG9vayBiZWxvd1xuXHRcdFx0XHRjb25zdCBuZXh0TGVmdCA9IGxpbmVzVmlzaWJsZVJhbmdlc1tpICsgMV0ucmFuZ2VzWzBdLmxlZnQ7XG5cdFx0XHRcdGNvbnN0IG5leHRSaWdodCA9IGxpbmVzVmlzaWJsZVJhbmdlc1tpICsgMV0ucmFuZ2VzWzBdLmxlZnQgKyBsaW5lc1Zpc2libGVSYW5nZXNbaSArIDFdLnJhbmdlc1swXS53aWR0aDtcblxuXHRcdFx0XHRpZiAoYWJzKGN1ckxlZnQgLSBuZXh0TGVmdCkgPCBlcHNpbG9uKSB7XG5cdFx0XHRcdFx0c3RhcnRTdHlsZS5ib3R0b20gPSBDb3JuZXJTdHlsZS5GTEFUO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5leHRMZWZ0IDwgY3VyTGVmdCAmJiBjdXJMZWZ0IDwgbmV4dFJpZ2h0KSB7XG5cdFx0XHRcdFx0c3RhcnRTdHlsZS5ib3R0b20gPSBDb3JuZXJTdHlsZS5JTlRFUk47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWJzKGN1clJpZ2h0IC0gbmV4dFJpZ2h0KSA8IGVwc2lsb24pIHtcblx0XHRcdFx0XHRlbmRTdHlsZS5ib3R0b20gPSBDb3JuZXJTdHlsZS5GTEFUO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN1clJpZ2h0IDwgbmV4dFJpZ2h0KSB7XG5cdFx0XHRcdFx0ZW5kU3R5bGUuYm90dG9tID0gQ29ybmVyU3R5bGUuSU5URVJOO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHByZXZpb3VzRnJhbWVCb3R0b20pIHtcblx0XHRcdFx0Ly8gQWNjZXB0IHNvbWUgaGljY3VwcyBuZWFyIHRoZSB2aWV3cG9ydCBlZGdlcyB0byBzYXZlIG9uIHJlcGFpbnRzXG5cdFx0XHRcdHN0YXJ0U3R5bGUuYm90dG9tID0gcHJldmlvdXNGcmFtZUJvdHRvbS5zdGFydFN0eWxlIS5ib3R0b207XG5cdFx0XHRcdGVuZFN0eWxlLmJvdHRvbSA9IHByZXZpb3VzRnJhbWVCb3R0b20uZW5kU3R5bGUhLmJvdHRvbTtcblx0XHRcdH1cblxuXHRcdFx0Y3VyTGluZVJhbmdlLnN0YXJ0U3R5bGUgPSBzdGFydFN0eWxlO1xuXHRcdFx0Y3VyTGluZVJhbmdlLmVuZFN0eWxlID0gZW5kU3R5bGU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VmlzaWJsZVJhbmdlc1dpdGhTdHlsZShzZWxlY3Rpb246IFJhbmdlLCBjdHg6IFJlbmRlcmluZ0NvbnRleHQsIHByZXZpb3VzRnJhbWU6IExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW10gfCBudWxsKTogTGluZVZpc2libGVSYW5nZXNXaXRoU3R5bGVbXSB7XG5cdFx0Y29uc3QgX2xpbmVzVmlzaWJsZVJhbmdlcyA9IGN0eC5saW5lc1Zpc2libGVSYW5nZXNGb3JSYW5nZShzZWxlY3Rpb24sIHRydWUpIHx8IFtdO1xuXHRcdGNvbnN0IGxpbmVzVmlzaWJsZVJhbmdlcyA9IF9saW5lc1Zpc2libGVSYW5nZXMubWFwKHRvU3R5bGVkKTtcblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzSGF2ZUdhcHMgPSB0aGlzLl92aXNpYmxlUmFuZ2VzSGF2ZUdhcHMobGluZXNWaXNpYmxlUmFuZ2VzKTtcblxuXHRcdGlmICghdmlzaWJsZVJhbmdlc0hhdmVHYXBzICYmIHRoaXMuX3JvdW5kZWRTZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuX2VucmljaFZpc2libGVSYW5nZXNXaXRoU3R5bGUoY3R4LnZpc2libGVSYW5nZSwgbGluZXNWaXNpYmxlUmFuZ2VzLCBwcmV2aW91c0ZyYW1lKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgdmlzaWJsZSByYW5nZXMgYXJlIHNvcnRlZCBUT1AtQk9UVE9NIGFuZCBMRUZULVJJR0hUXG5cdFx0cmV0dXJuIGxpbmVzVmlzaWJsZVJhbmdlcztcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVNlbGVjdGlvblBpZWNlKHRvcDogbnVtYmVyLCBib3R0b206IG51bWJlciwgY2xhc3NOYW1lOiBzdHJpbmcsIGxlZnQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIChcblx0XHRcdCc8ZGl2IGNsYXNzPVwiY3NsciAnXG5cdFx0XHQrIGNsYXNzTmFtZVxuXHRcdFx0KyAnXCIgc3R5bGU9XCInXG5cdFx0XHQrICd0b3A6JyArIHRvcC50b1N0cmluZygpICsgJ3B4Oydcblx0XHRcdCsgJ2JvdHRvbTonICsgYm90dG9tLnRvU3RyaW5nKCkgKyAncHg7J1xuXHRcdFx0KyAnbGVmdDonICsgbGVmdC50b1N0cmluZygpICsgJ3B4Oydcblx0XHRcdCsgJ3dpZHRoOicgKyB3aWR0aC50b1N0cmluZygpICsgJ3B4Oydcblx0XHRcdCsgJ1wiPjwvZGl2Pidcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0dWFsUmVuZGVyT25lU2VsZWN0aW9uKG91dHB1dDI6IFtzdHJpbmcsIHN0cmluZ11bXSwgdmlzaWJsZVN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBoYXNNdWx0aXBsZVNlbGVjdGlvbnM6IGJvb2xlYW4sIHZpc2libGVSYW5nZXM6IExpbmVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlW10pOiB2b2lkIHtcblx0XHRpZiAodmlzaWJsZVJhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzSGF2ZVN0eWxlID0gISF2aXNpYmxlUmFuZ2VzWzBdLnJhbmdlc1swXS5zdGFydFN0eWxlO1xuXG5cdFx0Y29uc3QgZmlyc3RMaW5lTnVtYmVyID0gdmlzaWJsZVJhbmdlc1swXS5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGxhc3RMaW5lTnVtYmVyID0gdmlzaWJsZVJhbmdlc1t2aXNpYmxlUmFuZ2VzLmxlbmd0aCAtIDFdLmxpbmVOdW1iZXI7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdmlzaWJsZVJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZVZpc2libGVSYW5nZXMgPSB2aXNpYmxlUmFuZ2VzW2ldO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGxpbmVWaXNpYmxlUmFuZ2VzLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gdmlzaWJsZVN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0Y29uc3QgdG9wID0gaGFzTXVsdGlwbGVTZWxlY3Rpb25zID8gKGxpbmVOdW1iZXIgPT09IGZpcnN0TGluZU51bWJlciA/IDEgOiAwKSA6IDA7XG5cdFx0XHRjb25zdCBib3R0b20gPSBoYXNNdWx0aXBsZVNlbGVjdGlvbnMgPyAobGluZU51bWJlciAhPT0gZmlyc3RMaW5lTnVtYmVyICYmIGxpbmVOdW1iZXIgPT09IGxhc3RMaW5lTnVtYmVyID8gMSA6IDApIDogMDtcblxuXHRcdFx0bGV0IGlubmVyQ29ybmVyT3V0cHV0ID0gJyc7XG5cdFx0XHRsZXQgcmVzdE9mU2VsZWN0aW9uT3V0cHV0ID0gJyc7XG5cblx0XHRcdGZvciAobGV0IGogPSAwLCBsZW5KID0gbGluZVZpc2libGVSYW5nZXMucmFuZ2VzLmxlbmd0aDsgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRjb25zdCB2aXNpYmxlUmFuZ2UgPSBsaW5lVmlzaWJsZVJhbmdlcy5yYW5nZXNbal07XG5cblx0XHRcdFx0aWYgKHZpc2libGVSYW5nZXNIYXZlU3R5bGUpIHtcblx0XHRcdFx0XHRjb25zdCBzdGFydFN0eWxlID0gdmlzaWJsZVJhbmdlLnN0YXJ0U3R5bGUhO1xuXHRcdFx0XHRcdGNvbnN0IGVuZFN0eWxlID0gdmlzaWJsZVJhbmdlLmVuZFN0eWxlITtcblx0XHRcdFx0XHRpZiAoc3RhcnRTdHlsZS50b3AgPT09IENvcm5lclN0eWxlLklOVEVSTiB8fCBzdGFydFN0eWxlLmJvdHRvbSA9PT0gQ29ybmVyU3R5bGUuSU5URVJOKSB7XG5cdFx0XHRcdFx0XHQvLyBSZXZlcnNlIHJvdW5kZWQgY29ybmVyIHRvIHRoZSBsZWZ0XG5cblx0XHRcdFx0XHRcdC8vIEZpcnN0IGNvbWVzIHRoZSBzZWxlY3Rpb24gKGJsdWUgbGF5ZXIpXG5cdFx0XHRcdFx0XHRpbm5lckNvcm5lck91dHB1dCArPSB0aGlzLl9jcmVhdGVTZWxlY3Rpb25QaWVjZSh0b3AsIGJvdHRvbSwgU2VsZWN0aW9uc092ZXJsYXkuU0VMRUNUSU9OX0NMQVNTX05BTUUsIHZpc2libGVSYW5nZS5sZWZ0IC0gU2VsZWN0aW9uc092ZXJsYXkuUk9VTkRFRF9QSUVDRV9XSURUSCwgU2VsZWN0aW9uc092ZXJsYXkuUk9VTkRFRF9QSUVDRV9XSURUSCk7XG5cblx0XHRcdFx0XHRcdC8vIFNlY29uZCBjb21lcyB0aGUgYmFja2dyb3VuZCAod2hpdGUgbGF5ZXIpIHdpdGggaW52ZXJzZSBib3JkZXIgcmFkaXVzXG5cdFx0XHRcdFx0XHRsZXQgY2xhc3NOYW1lID0gU2VsZWN0aW9uc092ZXJsYXkuRURJVE9SX0JBQ0tHUk9VTkRfQ0xBU1NfTkFNRTtcblx0XHRcdFx0XHRcdGlmIChzdGFydFN0eWxlLnRvcCA9PT0gQ29ybmVyU3R5bGUuSU5URVJOKSB7XG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZSArPSAnICcgKyBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fVE9QX1JJR0hUO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHN0YXJ0U3R5bGUuYm90dG9tID09PSBDb3JuZXJTdHlsZS5JTlRFUk4pIHtcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lICs9ICcgJyArIFNlbGVjdGlvbnNPdmVybGF5LlNFTEVDVElPTl9CT1RUT01fUklHSFQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpbm5lckNvcm5lck91dHB1dCArPSB0aGlzLl9jcmVhdGVTZWxlY3Rpb25QaWVjZSh0b3AsIGJvdHRvbSwgY2xhc3NOYW1lLCB2aXNpYmxlUmFuZ2UubGVmdCAtIFNlbGVjdGlvbnNPdmVybGF5LlJPVU5ERURfUElFQ0VfV0lEVEgsIFNlbGVjdGlvbnNPdmVybGF5LlJPVU5ERURfUElFQ0VfV0lEVEgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW5kU3R5bGUudG9wID09PSBDb3JuZXJTdHlsZS5JTlRFUk4gfHwgZW5kU3R5bGUuYm90dG9tID09PSBDb3JuZXJTdHlsZS5JTlRFUk4pIHtcblx0XHRcdFx0XHRcdC8vIFJldmVyc2Ugcm91bmRlZCBjb3JuZXIgdG8gdGhlIHJpZ2h0XG5cblx0XHRcdFx0XHRcdC8vIEZpcnN0IGNvbWVzIHRoZSBzZWxlY3Rpb24gKGJsdWUgbGF5ZXIpXG5cdFx0XHRcdFx0XHRpbm5lckNvcm5lck91dHB1dCArPSB0aGlzLl9jcmVhdGVTZWxlY3Rpb25QaWVjZSh0b3AsIGJvdHRvbSwgU2VsZWN0aW9uc092ZXJsYXkuU0VMRUNUSU9OX0NMQVNTX05BTUUsIHZpc2libGVSYW5nZS5sZWZ0ICsgdmlzaWJsZVJhbmdlLndpZHRoLCBTZWxlY3Rpb25zT3ZlcmxheS5ST1VOREVEX1BJRUNFX1dJRFRIKTtcblxuXHRcdFx0XHRcdFx0Ly8gU2Vjb25kIGNvbWVzIHRoZSBiYWNrZ3JvdW5kICh3aGl0ZSBsYXllcikgd2l0aCBpbnZlcnNlIGJvcmRlciByYWRpdXNcblx0XHRcdFx0XHRcdGxldCBjbGFzc05hbWUgPSBTZWxlY3Rpb25zT3ZlcmxheS5FRElUT1JfQkFDS0dST1VORF9DTEFTU19OQU1FO1xuXHRcdFx0XHRcdFx0aWYgKGVuZFN0eWxlLnRvcCA9PT0gQ29ybmVyU3R5bGUuSU5URVJOKSB7XG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZSArPSAnICcgKyBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fVE9QX0xFRlQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZW5kU3R5bGUuYm90dG9tID09PSBDb3JuZXJTdHlsZS5JTlRFUk4pIHtcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lICs9ICcgJyArIFNlbGVjdGlvbnNPdmVybGF5LlNFTEVDVElPTl9CT1RUT01fTEVGVDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlubmVyQ29ybmVyT3V0cHV0ICs9IHRoaXMuX2NyZWF0ZVNlbGVjdGlvblBpZWNlKHRvcCwgYm90dG9tLCBjbGFzc05hbWUsIHZpc2libGVSYW5nZS5sZWZ0ICsgdmlzaWJsZVJhbmdlLndpZHRoLCBTZWxlY3Rpb25zT3ZlcmxheS5ST1VOREVEX1BJRUNFX1dJRFRIKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgY2xhc3NOYW1lID0gU2VsZWN0aW9uc092ZXJsYXkuU0VMRUNUSU9OX0NMQVNTX05BTUU7XG5cdFx0XHRcdGlmICh2aXNpYmxlUmFuZ2VzSGF2ZVN0eWxlKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRTdHlsZSA9IHZpc2libGVSYW5nZS5zdGFydFN0eWxlITtcblx0XHRcdFx0XHRjb25zdCBlbmRTdHlsZSA9IHZpc2libGVSYW5nZS5lbmRTdHlsZSE7XG5cdFx0XHRcdFx0aWYgKHN0YXJ0U3R5bGUudG9wID09PSBDb3JuZXJTdHlsZS5FWFRFUk4pIHtcblx0XHRcdFx0XHRcdGNsYXNzTmFtZSArPSAnICcgKyBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fVE9QX0xFRlQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChzdGFydFN0eWxlLmJvdHRvbSA9PT0gQ29ybmVyU3R5bGUuRVhURVJOKSB7XG5cdFx0XHRcdFx0XHRjbGFzc05hbWUgKz0gJyAnICsgU2VsZWN0aW9uc092ZXJsYXkuU0VMRUNUSU9OX0JPVFRPTV9MRUZUO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW5kU3R5bGUudG9wID09PSBDb3JuZXJTdHlsZS5FWFRFUk4pIHtcblx0XHRcdFx0XHRcdGNsYXNzTmFtZSArPSAnICcgKyBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fVE9QX1JJR0hUO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZW5kU3R5bGUuYm90dG9tID09PSBDb3JuZXJTdHlsZS5FWFRFUk4pIHtcblx0XHRcdFx0XHRcdGNsYXNzTmFtZSArPSAnICcgKyBTZWxlY3Rpb25zT3ZlcmxheS5TRUxFQ1RJT05fQk9UVE9NX1JJR0hUO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN0T2ZTZWxlY3Rpb25PdXRwdXQgKz0gdGhpcy5fY3JlYXRlU2VsZWN0aW9uUGllY2UodG9wLCBib3R0b20sIGNsYXNzTmFtZSwgdmlzaWJsZVJhbmdlLmxlZnQsIHZpc2libGVSYW5nZS53aWR0aCk7XG5cdFx0XHR9XG5cblx0XHRcdG91dHB1dDJbbGluZUluZGV4XVswXSArPSBpbm5lckNvcm5lck91dHB1dDtcblx0XHRcdG91dHB1dDJbbGluZUluZGV4XVsxXSArPSByZXN0T2ZTZWxlY3Rpb25PdXRwdXQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcHJldmlvdXNGcmFtZVZpc2libGVSYW5nZXNXaXRoU3R5bGU6IChMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtdIHwgbnVsbClbXSA9IFtdO1xuXHRwdWJsaWMgcHJlcGFyZVJlbmRlcihjdHg6IFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkIHtcblxuXHRcdC8vIEJ1aWxkIEhUTUwgZm9yIGlubmVyIGNvcm5lcnMgc2VwYXJhdGUgZnJvbSBIVE1MIGZvciB0aGUgcmVzdCBvZiBzZWxlY3Rpb25zLFxuXHRcdC8vIGFzIHRoZSBpbm5lciBjb3JuZXIgSFRNTCBjYW4gaW50ZXJmZXJlIHdpdGggdGhhdCBvZiBvdGhlciBzZWxlY3Rpb25zLlxuXHRcdC8vIEluIGZpbmFsIHJlbmRlciwgbWFrZSBzdXJlIHRvIHBsYWNlIHRoZSBpbm5lciBjb3JuZXIgSFRNTCBiZWZvcmUgdGhlIHJlc3Qgb2Ygc2VsZWN0aW9uIEhUTUwuIFNlZSBpc3N1ZSAjNzc3NzcuXG5cdFx0Y29uc3Qgb3V0cHV0OiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0XHRjb25zdCB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyID0gY3R4LnZpc2libGVSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgdmlzaWJsZUVuZExpbmVOdW1iZXIgPSBjdHgudmlzaWJsZVJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHZpc2libGVTdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gdmlzaWJsZUVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZUluZGV4ID0gbGluZU51bWJlciAtIHZpc2libGVTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRvdXRwdXRbbGluZUluZGV4XSA9IFsnJywgJyddO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRoaXNGcmFtZVZpc2libGVSYW5nZXNXaXRoU3R5bGU6IChMaW5lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtdIHwgbnVsbClbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0aGlzLl9zZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9zZWxlY3Rpb25zW2ldO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0dGhpc0ZyYW1lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtpXSA9IG51bGw7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzV2l0aFN0eWxlID0gdGhpcy5fZ2V0VmlzaWJsZVJhbmdlc1dpdGhTdHlsZShzZWxlY3Rpb24sIGN0eCwgdGhpcy5fcHJldmlvdXNGcmFtZVZpc2libGVSYW5nZXNXaXRoU3R5bGVbaV0pO1xuXHRcdFx0dGhpc0ZyYW1lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZVtpXSA9IHZpc2libGVSYW5nZXNXaXRoU3R5bGU7XG5cdFx0XHR0aGlzLl9hY3R1YWxSZW5kZXJPbmVTZWxlY3Rpb24ob3V0cHV0LCB2aXNpYmxlU3RhcnRMaW5lTnVtYmVyLCB0aGlzLl9zZWxlY3Rpb25zLmxlbmd0aCA+IDEsIHZpc2libGVSYW5nZXNXaXRoU3R5bGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ByZXZpb3VzRnJhbWVWaXNpYmxlUmFuZ2VzV2l0aFN0eWxlID0gdGhpc0ZyYW1lVmlzaWJsZVJhbmdlc1dpdGhTdHlsZTtcblx0XHR0aGlzLl9yZW5kZXJSZXN1bHQgPSBvdXRwdXQubWFwKChbaW50ZXJuYWxDb3JuZXJzLCByZXN0T2ZTZWxlY3Rpb25dKSA9PiBpbnRlcm5hbENvcm5lcnMgKyByZXN0T2ZTZWxlY3Rpb24pO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgbGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlclJlc3VsdCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGlmIChsaW5lSW5kZXggPCAwIHx8IGxpbmVJbmRleCA+PSB0aGlzLl9yZW5kZXJSZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJSZXN1bHRbbGluZUluZGV4XTtcblx0fVxufVxuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRjb25zdCBlZGl0b3JTZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JTZWxlY3Rpb25Gb3JlZ3JvdW5kKTtcblx0aWYgKGVkaXRvclNlbGVjdGlvbkZvcmVncm91bmRDb2xvciAmJiAhZWRpdG9yU2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yLmlzVHJhbnNwYXJlbnQoKSkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAudmlldy1saW5lIHNwYW4uaW5saW5lLXNlbGVjdGVkLXRleHQgeyBjb2xvcjogJHtlZGl0b3JTZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3J9OyB9YCk7XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBhYnMobjogbnVtYmVyKTogbnVtYmVyIHtcblx0cmV0dXJuIG4gPCAwID8gLW4gOiBuO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTztBQUNQLFNBQVMsMEJBQTBCO0FBS25DLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsb0JBQW9CO0FBRTdCLElBQVcsY0FBWCxrQkFBV0EsaUJBQVg7QUFDQyxFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBQ0EsRUFBQUEsMEJBQUE7QUFIVSxTQUFBQTtBQUFBLEdBQUE7QUFXWCxNQUFNLHlCQUF5QjtBQUFBLEVBTTlCLFlBQVksT0FBd0I7QUFDbkMsU0FBSyxPQUFPLE1BQU07QUFDbEIsU0FBSyxRQUFRLE1BQU07QUFDbkIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQ0Q7QUFFQSxNQUFNLDJCQUEyQjtBQUFBLEVBSWhDLFlBQVksWUFBb0IsUUFBb0M7QUFDbkUsU0FBSyxhQUFhO0FBQ2xCLFNBQUssU0FBUztBQUFBLEVBQ2Y7QUFDRDtBQUVBLFNBQVMsY0FBYyxNQUFpRDtBQUN2RSxTQUFPLElBQUkseUJBQXlCLElBQUk7QUFDekM7QUFFQSxTQUFTLFNBQVMsTUFBcUQ7QUFDdEUsU0FBTyxJQUFJLDJCQUEyQixLQUFLLFlBQVksS0FBSyxPQUFPLElB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QUFhLEtBQUs7QUFBQSxNQUNsSDtBQUVBLGNBQVEsU0FBUyxFQUFFLENBQUMsS0FBSztBQUN6QixjQUFRLFNBQVMsRUFBRSxDQUFDLEtBQUs7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFBQSxFQUdPLGNBQWMsS0FBNkI7QUFLakQsVUFBTSxTQUE2QixDQUFDO0FBQ3BDLFVBQU0seUJBQXlCLElBQUksYUFBYTtBQUNoRCxVQUFNLHVCQUF1QixJQUFJLGFBQWE7QUFDOUMsYUFBUyxhQUFhLHdCQUF3QixjQUFjLHNCQUFzQixjQUFjO0FBQy9GLFlBQU0sWUFBWSxhQUFhO0FBQy9CLGFBQU8sU0FBUyxJQUFJLENBQUMsSUFBSSxFQUFFO0FBQUEsSUFDNUI7QUFFQSxVQUFNLGtDQUEyRSxDQUFDO0FBQ2xGLGFBQVMsSUFBSSxHQUFHLE1BQU0sS0FBSyxZQUFZLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDNUQsWUFBTSxZQUFZLEtBQUssWUFBWSxDQUFDO0FBQ3BDLFVBQUksVUFBVSxRQUFRLEdBQUc7QUFDeEIsd0NBQWdDLENBQUMsSUFBSTtBQUNyQztBQUFBLE1BQ0Q7QUFFQSxZQUFNLHlCQUF5QixLQUFLLDJCQUEyQixXQUFXLEtBQUssS0FBSyxxQ0FBcUMsQ0FBQyxDQUFDO0FBQzNILHNDQUFnQyxDQUFDLElBQUk7QUFDckMsV0FBSywwQkFBMEIsUUFBUSx3QkFBd0IsS0FBSyxZQUFZLFNBQVMsR0FBRyxzQkFBc0I7QUFBQSxJQUNuSDtBQUVBLFNBQUssdUNBQXVDO0FBQzVDLFNBQUssZ0JBQWdCLE9BQU8sSUFBSSxDQUFDLENBQUMsaUJBQWlCLGVBQWUsTUFBTSxrQkFBa0IsZUFBZTtBQUFBLEVBQzFHO0FBQUEsRUFFTyxPQUFPLGlCQUF5QixZQUE0QjtBQUNsRSxRQUFJLENBQUMsS0FBSyxlQUFlO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxZQUFZLGFBQWE7QUFDL0IsUUFBSSxZQUFZLEtBQUssYUFBYSxLQUFLLGNBQWMsUUFBUTtBQUM1RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxjQUFjLFNBQVM7QUFBQSxFQUNwQztBQUNEO0FBaFZhLG1CQUVZLHVCQUF1QjtBQUZuQyxtQkFHWSxxQkFBcUI7QUFIakMsbUJBSVksd0JBQXdCO0FBSnBDLG1CQUtZLHNCQUFzQjtBQUxsQyxtQkFNWSx5QkFBeUI7QUFOckMsbUJBT1ksK0JBQStCO0FBUDNDLG1CQVNZLHNCQUFzQjtBQVR4QyxJQUFNLG9CQUFOO0FBa1ZQLDJCQUEyQixDQUFDLE9BQU8sY0FBYztBQUNoRCxRQUFNLGlDQUFpQyxNQUFNLFNBQVMseUJBQXlCO0FBQy9FLE1BQUksa0NBQWtDLENBQUMsK0JBQStCLGNBQWMsR0FBRztBQUN0RixjQUFVLFFBQVEsZ0VBQWdFLDhCQUE4QixLQUFLO0FBQUEsRUFDdEg7QUFDRCxDQUFDO0FBRUQsU0FBUyxJQUFJLEdBQW1CO0FBQy9CLFNBQU8sSUFBSSxJQUFJLENBQUMsSUFBSTtBQUNyQjsiLAogICJuYW1lcyI6IFsiQ29ybmVyU3R5bGUiLCAiY2xhc3NOYW1lIl0KfQo=
