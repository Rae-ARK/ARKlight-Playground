import { n } from "../../../../../../../base/browser/dom.js";
import { Event } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived } from "../../../../../../../base/common/observable.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { getModifiedBorderColor, INLINE_EDITS_BORDER_RADIUS } from "../theme.js";
import { mapOutFalsy, rectToProps } from "../utils/utils.js";
class InlineEditsWordInsertView extends Disposable {
  constructor(_editor, _edit, _tabAction) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._tabAction = _tabAction;
    this.onDidClick = Event.None;
    this._start = this._editor.observePosition(constObservable(this._edit.range.getStartPosition()), this._store);
    this._layout = derived(this, (reader) => {
      const start = this._start.read(reader);
      if (!start) {
        return void 0;
      }
      const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
      const lineHeight = this._editor.observeLineHeightForPosition(this._edit.range.getStartPosition()).read(reader);
      const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
      const width = this._edit.text.length * w + 5;
      const center = new Point(contentLeft + start.x + w / 2 - this._editor.scrollLeft.read(reader), start.y);
      const modified = Rect.fromLeftTopWidthHeight(center.x - width / 2, center.y + lineHeight + 5, width, lineHeight);
      const background = Rect.hull([Rect.fromPoint(center), modified]).withMargin(4);
      return {
        modified,
        center,
        background,
        lowerBackground: background.intersectVertical(new OffsetRange(modified.top - 2, Number.MAX_SAFE_INTEGER))
      };
    });
    this._div = n.div({
      class: "word-insert"
    }, [
      derived(this, (reader) => {
        const layout = mapOutFalsy(this._layout).read(reader);
        if (!layout) {
          return [];
        }
        const modifiedBorderColor = asCssVariable(getModifiedBorderColor(this._tabAction).read(reader));
        return [
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((reader2) => layout.read(reader2).lowerBackground),
              borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
              background: "var(--vscode-editor-background)"
            }
          }, []),
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((reader2) => layout.read(reader2).modified),
              borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
              padding: "0px",
              textAlign: "center",
              background: "var(--vscode-inlineEdit-modifiedChangedTextBackground)",
              fontFamily: this._editor.getOption(EditorOption.fontFamily),
              fontSize: this._editor.getOption(EditorOption.fontSize),
              fontWeight: this._editor.getOption(EditorOption.fontWeight)
            }
          }, [
            this._edit.text
          ]),
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((reader2) => layout.read(reader2).background),
              borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
              border: `1px solid ${modifiedBorderColor}`,
              //background: 'rgba(122, 122, 122, 0.12)', looks better
              background: "var(--vscode-inlineEdit-wordReplacementView-background)"
            }
          }, []),
          n.svg({
            viewBox: "0 0 12 18",
            width: 12,
            height: 18,
            fill: "none",
            style: {
              position: "absolute",
              left: derived(this, (reader2) => layout.read(reader2).center.x - 9),
              top: derived(this, (reader2) => layout.read(reader2).center.y + 4),
              transform: "scale(1.4, 1.4)"
            }
          }, [
            n.svgElem("path", {
              d: "M5.06445 0H7.35759C7.35759 0 7.35759 8.47059 7.35759 11.1176C7.35759 13.7647 9.4552 18 13.4674 18C17.4795 18 -2.58445 18 0.281373 18C3.14719 18 5.06477 14.2941 5.06477 11.1176C5.06477 7.94118 5.06445 0 5.06445 0Z",
              fill: "var(--vscode-inlineEdit-modifiedChangedTextBackground)"
            })
          ])
        ];
      })
    ]).keepUpdated(this._store);
    this.isHovered = constObservable(false);
    this._register(this._editor.createOverlayWidget({
      domNode: this._div.element,
      minContentWidthInPx: constObservable(0),
      position: constObservable({ preference: { top: 0, left: 0 } }),
      allowEditorOverflow: false
    }));
  }
}
export {
  InlineEditsWordInsertView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzV29yZEluc2VydFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBQb2ludCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3BvaW50LmpzJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9yZWN0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0UmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBJSW5saW5lRWRpdHNWaWV3LCBJbmxpbmVFZGl0VGFiQWN0aW9uIH0gZnJvbSAnLi4vaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IGdldE1vZGlmaWVkQm9yZGVyQ29sb3IsIElOTElORV9FRElUU19CT1JERVJfUkFESVVTIH0gZnJvbSAnLi4vdGhlbWUuanMnO1xuaW1wb3J0IHsgbWFwT3V0RmFsc3ksIHJlY3RUb1Byb3BzIH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNXb3JkSW5zZXJ0VmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblxuXHRyZWFkb25seSBvbkRpZENsaWNrID0gRXZlbnQuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFydDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGl2O1xuXG5cdHJlYWRvbmx5IGlzSG92ZXJlZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IE9ic2VydmFibGVDb2RlRWRpdG9yLFxuXHRcdC8qKiBNdXN0IGJlIHNpbmdsZS1saW5lIGluIGJvdGggc2lkZXMgKi9cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0OiBUZXh0UmVwbGFjZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGFiQWN0aW9uOiBJT2JzZXJ2YWJsZTxJbmxpbmVFZGl0VGFiQWN0aW9uPlxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0YXJ0ID0gdGhpcy5fZWRpdG9yLm9ic2VydmVQb3NpdGlvbihjb25zdE9ic2VydmFibGUodGhpcy5fZWRpdC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fbGF5b3V0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLl9zdGFydC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXN0YXJ0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZW50TGVmdCA9IHRoaXMuX2VkaXRvci5sYXlvdXRJbmZvQ29udGVudExlZnQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5vYnNlcnZlTGluZUhlaWdodEZvclBvc2l0aW9uKHRoaXMuX2VkaXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHcgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbykucmVhZChyZWFkZXIpLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0XHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fZWRpdC50ZXh0Lmxlbmd0aCAqIHcgKyA1O1xuXG5cdFx0XHRjb25zdCBjZW50ZXIgPSBuZXcgUG9pbnQoY29udGVudExlZnQgKyBzdGFydC54ICsgdyAvIDIgLSB0aGlzLl9lZGl0b3Iuc2Nyb2xsTGVmdC5yZWFkKHJlYWRlciksIHN0YXJ0LnkpO1xuXG5cdFx0XHRjb25zdCBtb2RpZmllZCA9IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChjZW50ZXIueCAtIHdpZHRoIC8gMiwgY2VudGVyLnkgKyBsaW5lSGVpZ2h0ICsgNSwgd2lkdGgsIGxpbmVIZWlnaHQpO1xuXHRcdFx0Y29uc3QgYmFja2dyb3VuZCA9IFJlY3QuaHVsbChbUmVjdC5mcm9tUG9pbnQoY2VudGVyKSwgbW9kaWZpZWRdKS53aXRoTWFyZ2luKDQpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtb2RpZmllZCxcblx0XHRcdFx0Y2VudGVyLFxuXHRcdFx0XHRiYWNrZ3JvdW5kLFxuXHRcdFx0XHRsb3dlckJhY2tncm91bmQ6IGJhY2tncm91bmQuaW50ZXJzZWN0VmVydGljYWwobmV3IE9mZnNldFJhbmdlKG1vZGlmaWVkLnRvcCAtIDIsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX2RpdiA9IG4uZGl2KHtcblx0XHRcdGNsYXNzOiAnd29yZC1pbnNlcnQnLFxuXHRcdH0sIFtcblx0XHRcdGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gbWFwT3V0RmFsc3kodGhpcy5fbGF5b3V0KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghbGF5b3V0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRCb3JkZXJDb2xvciA9IGFzQ3NzVmFyaWFibGUoZ2V0TW9kaWZpZWRCb3JkZXJDb2xvcih0aGlzLl90YWJBY3Rpb24pLnJlYWQocmVhZGVyKSk7XG5cblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikubG93ZXJCYWNrZ3JvdW5kKSxcblx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIFtdKSxcblx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikubW9kaWZpZWQpLFxuXHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0XHRcdFx0cGFkZGluZzogJzBweCcsXG5cdFx0XHRcdFx0XHRcdHRleHRBbGlnbjogJ2NlbnRlcicsXG5cdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtaW5saW5lRWRpdC1tb2RpZmllZENoYW5nZWRUZXh0QmFja2dyb3VuZCknLFxuXHRcdFx0XHRcdFx0XHRmb250RmFtaWx5OiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250RmFtaWx5KSxcblx0XHRcdFx0XHRcdFx0Zm9udFNpemU6IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKSxcblx0XHRcdFx0XHRcdFx0Zm9udFdlaWdodDogdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udFdlaWdodCksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdFx0dGhpcy5fZWRpdC50ZXh0LFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5iYWNrZ3JvdW5kKSxcblx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdFx0XHRcdGJvcmRlcjogYDFweCBzb2xpZCAke21vZGlmaWVkQm9yZGVyQ29sb3J9YCxcblx0XHRcdFx0XHRcdFx0Ly9iYWNrZ3JvdW5kOiAncmdiYSgxMjIsIDEyMiwgMTIyLCAwLjEyKScsIGxvb2tzIGJldHRlclxuXHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWlubGluZUVkaXQtd29yZFJlcGxhY2VtZW50Vmlldy1iYWNrZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgW10pLFxuXHRcdFx0XHRcdG4uc3ZnKHtcblx0XHRcdFx0XHRcdHZpZXdCb3g6ICcwIDAgMTIgMTgnLFxuXHRcdFx0XHRcdFx0d2lkdGg6IDEyLFxuXHRcdFx0XHRcdFx0aGVpZ2h0OiAxOCxcblx0XHRcdFx0XHRcdGZpbGw6ICdub25lJyxcblx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHRsZWZ0OiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmNlbnRlci54IC0gOSksXG5cdFx0XHRcdFx0XHRcdHRvcDogZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5jZW50ZXIueSArIDQpLFxuXHRcdFx0XHRcdFx0XHR0cmFuc2Zvcm06ICdzY2FsZSgxLjQsIDEuNCknLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRcdG4uc3ZnRWxlbSgncGF0aCcsIHtcblx0XHRcdFx0XHRcdFx0ZDogJ001LjA2NDQ1IDBINy4zNTc1OUM3LjM1NzU5IDAgNy4zNTc1OSA4LjQ3MDU5IDcuMzU3NTkgMTEuMTE3NkM3LjM1NzU5IDEzLjc2NDcgOS40NTUyIDE4IDEzLjQ2NzQgMThDMTcuNDc5NSAxOCAtMi41ODQ0NSAxOCAwLjI4MTM3MyAxOEMzLjE0NzE5IDE4IDUuMDY0NzcgMTQuMjk0MSA1LjA2NDc3IDExLjExNzZDNS4wNjQ3NyA3Ljk0MTE4IDUuMDY0NDUgMCA1LjA2NDQ1IDBaJyxcblx0XHRcdFx0XHRcdFx0ZmlsbDogJ3ZhcigtLXZzY29kZS1pbmxpbmVFZGl0LW1vZGlmaWVkQ2hhbmdlZFRleHRCYWNrZ3JvdW5kKScsXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdF07XG5cdFx0XHR9KVxuXHRcdF0pLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLmlzSG92ZXJlZCA9IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3IuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiB0aGlzLl9kaXYuZWxlbWVudCxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aEluUHg6IGNvbnN0T2JzZXJ2YWJsZSgwKSxcblx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUoeyBwcmVmZXJlbmNlOiB7IHRvcDogMCwgbGVmdDogMCB9IH0pLFxuXHRcdFx0YWxsb3dFZGl0b3JP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QWEsVUFBVTtBQUFBLGNBQzFELFVBQVUsS0FBSyxRQUFRLFVBQVUsYUFBYSxRQUFRO0FBQUEsY0FDdEQsWUFBWSxLQUFLLFFBQVEsVUFBVSxhQUFhLFVBQVU7QUFBQSxZQUMzRDtBQUFBLFVBQ0QsR0FBRztBQUFBLFlBQ0YsS0FBSyxNQUFNO0FBQUEsVUFDWixDQUFDO0FBQUEsVUFDRCxFQUFFLElBQUk7QUFBQSxZQUNMLE9BQU87QUFBQSxjQUNOLFVBQVU7QUFBQSxjQUNWLEdBQUcsWUFBWSxDQUFBQSxZQUFVLE9BQU8sS0FBS0EsT0FBTSxFQUFFLFVBQVU7QUFBQSxjQUN2RCxjQUFjLEdBQUcsMEJBQTBCO0FBQUEsY0FDM0MsUUFBUSxhQUFhLG1CQUFtQjtBQUFBO0FBQUEsY0FFeEMsWUFBWTtBQUFBLFlBQ2I7QUFBQSxVQUNELEdBQUcsQ0FBQyxDQUFDO0FBQUEsVUFDTCxFQUFFLElBQUk7QUFBQSxZQUNMLFNBQVM7QUFBQSxZQUNULE9BQU87QUFBQSxZQUNQLFFBQVE7QUFBQSxZQUNSLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxjQUNOLFVBQVU7QUFBQSxjQUNWLE1BQU0sUUFBUSxNQUFNLENBQUFBLFlBQVUsT0FBTyxLQUFLQSxPQUFNLEVBQUUsT0FBTyxJQUFJLENBQUM7QUFBQSxjQUM5RCxLQUFLLFFBQVEsTUFBTSxDQUFBQSxZQUFVLE9BQU8sS0FBS0EsT0FBTSxFQUFFLE9BQU8sSUFBSSxDQUFDO0FBQUEsY0FDN0QsV0FBVztBQUFBLFlBQ1o7QUFBQSxVQUNELEdBQUc7QUFBQSxZQUNGLEVBQUUsUUFBUSxRQUFRO0FBQUEsY0FDakIsR0FBRztBQUFBLGNBQ0gsTUFBTTtBQUFBLFlBQ1AsQ0FBQztBQUFBLFVBQ0YsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUMsRUFBRSxZQUFZLEtBQUssTUFBTTtBQUMxQixTQUFLLFlBQVksZ0JBQWdCLEtBQUs7QUFFdEMsU0FBSyxVQUFVLEtBQUssUUFBUSxvQkFBb0I7QUFBQSxNQUMvQyxTQUFTLEtBQUssS0FBSztBQUFBLE1BQ25CLHFCQUFxQixnQkFBZ0IsQ0FBQztBQUFBLE1BQ3RDLFVBQVUsZ0JBQWdCLEVBQUUsWUFBWSxFQUFFLEtBQUssR0FBRyxNQUFNLEVBQUUsRUFBRSxDQUFDO0FBQUEsTUFDN0QscUJBQXFCO0FBQUEsSUFDdEIsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNEOyIsCiAgIm5hbWVzIjogWyJyZWFkZXIiXQp9Cg==
