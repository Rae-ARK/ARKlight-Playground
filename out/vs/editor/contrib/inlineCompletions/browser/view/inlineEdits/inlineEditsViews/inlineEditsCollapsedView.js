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
import { n } from "../../../../../../../base/browser/dom.js";
import { Event } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived } from "../../../../../../../base/common/observable.js";
import { IAccessibilityService } from "../../../../../../../platform/accessibility/common/accessibility.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { singleTextRemoveCommonPrefix } from "../../../model/singleTextEditHelpers.js";
import { inlineEditIndicatorPrimaryBorder } from "../theme.js";
import { getEditorValidOverlayRect, PathBuilder, rectToProps } from "../utils/utils.js";
let InlineEditsCollapsedView = class extends Disposable {
  constructor(_editor, _edit, _accessibilityService) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._accessibilityService = _accessibilityService;
    this.onDidClick = Event.None;
    this._iconRef = n.ref();
    this.isHovered = constObservable(false);
    this._editorObs = observableCodeEditor(this._editor);
    const firstEdit = this._edit.map((inlineEdit) => inlineEdit?.edit?.replacements[0] ?? null);
    const startPosition = firstEdit.map((edit) => edit ? singleTextRemoveCommonPrefix(edit, this._editor.getModel()).range.getStartPosition() : null);
    const observedStartPoint = this._editorObs.observePosition(startPosition, this._store);
    const startPoint = derived((reader) => {
      const point = observedStartPoint.read(reader);
      if (!point) {
        return null;
      }
      const contentLeft = this._editorObs.layoutInfoContentLeft.read(reader);
      const scrollLeft = this._editorObs.scrollLeft.read(reader);
      return new Point(contentLeft + point.x - scrollLeft, point.y);
    });
    const overlayElement = n.div({
      class: "inline-edits-collapsed-view",
      style: {
        position: "absolute",
        overflow: "visible",
        top: "0px",
        left: "0px",
        display: "block"
      }
    }, [
      [this.getCollapsedIndicator(startPoint)]
    ]).keepUpdated(this._store).element;
    this._register(this._editorObs.createOverlayWidget({
      domNode: overlayElement,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: constObservable(0)
    }));
    this.isVisible = this._edit.map((inlineEdit, reader) => !!inlineEdit && startPoint.read(reader) !== null);
  }
  triggerAnimation() {
    if (this._accessibilityService.isMotionReduced()) {
      return new Animation(null, null).finished;
    }
    const animation = this._iconRef.element.animate([
      { offset: 0, transform: "translateY(-3px)" },
      { offset: 0.2, transform: "translateY(1px)" },
      { offset: 0.36, transform: "translateY(-1px)" },
      { offset: 0.52, transform: "translateY(1px)" },
      { offset: 0.68, transform: "translateY(-1px)" },
      { offset: 0.84, transform: "translateY(1px)" },
      { offset: 1, transform: "translateY(0px)" }
    ], { duration: 2e3 });
    return animation.finished;
  }
  getCollapsedIndicator(startPoint) {
    const contentLeft = this._editorObs.layoutInfoContentLeft;
    const startPointTranslated = startPoint.map((p, reader) => p ? p.deltaX(-contentLeft.read(reader)) : null);
    const iconPath = this.createIconPath(startPointTranslated);
    return n.svg({
      class: "collapsedView",
      ref: this._iconRef,
      style: {
        position: "absolute",
        ...rectToProps((r) => getEditorValidOverlayRect(this._editorObs).read(r)),
        overflow: "hidden",
        pointerEvents: "none"
      }
    }, [
      n.svgElem("path", {
        class: "collapsedViewPath",
        d: iconPath,
        fill: asCssVariable(inlineEditIndicatorPrimaryBorder)
      })
    ]);
  }
  createIconPath(indicatorPoint) {
    const width = 6;
    const triangleHeight = 3;
    const baseHeight = 1;
    return indicatorPoint.map((point) => {
      if (!point) {
        return new PathBuilder().build();
      }
      const baseTopLeft = point.deltaX(-width / 2).deltaY(-baseHeight);
      const baseTopRight = baseTopLeft.deltaX(width);
      const baseBottomLeft = baseTopLeft.deltaY(baseHeight);
      const baseBottomRight = baseTopRight.deltaY(baseHeight);
      const triangleBottomCenter = baseBottomLeft.deltaX(width / 2).deltaY(triangleHeight);
      return new PathBuilder().moveTo(baseTopLeft).lineTo(baseTopRight).lineTo(baseBottomRight).lineTo(triangleBottomCenter).lineTo(baseBottomLeft).lineTo(baseTopLeft).build();
    });
  }
};
InlineEditsCollapsedView = __decorateClass([
  __decorateParam(2, IAccessibilityService)
], InlineEditsCollapsedView);
export {
  InlineEditsCollapsedView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzQ29sbGFwc2VkVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IsIG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBQb2ludCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3BvaW50LmpzJztcbmltcG9ydCB7IHNpbmdsZVRleHRSZW1vdmVDb21tb25QcmVmaXggfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9zaW5nbGVUZXh0RWRpdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgSUlubGluZUVkaXRzVmlldyB9IGZyb20gJy4uL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0V2l0aENoYW5nZXMgfSBmcm9tICcuLi9pbmxpbmVFZGl0V2l0aENoYW5nZXMuanMnO1xuaW1wb3J0IHsgaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCb3JkZXIgfSBmcm9tICcuLi90aGVtZS5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JWYWxpZE92ZXJsYXlSZWN0LCBQYXRoQnVpbGRlciwgcmVjdFRvUHJvcHMgfSBmcm9tICcuLi91dGlscy91dGlscy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVFZGl0c0NvbGxhcHNlZFZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUlubGluZUVkaXRzVmlldyB7XG5cblx0cmVhZG9ubHkgb25EaWRDbGljayA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yT2JzOiBPYnNlcnZhYmxlQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfaWNvblJlZiA9IG4ucmVmPFNWR0VsZW1lbnQ+KCk7XG5cblx0cmVhZG9ubHkgaXNWaXNpYmxlOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXQ6IElPYnNlcnZhYmxlPElubGluZUVkaXRXaXRoQ2hhbmdlcyB8IHVuZGVmaW5lZD4sXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKTtcblxuXHRcdGNvbnN0IGZpcnN0RWRpdCA9IHRoaXMuX2VkaXQubWFwKGlubGluZUVkaXQgPT4gaW5saW5lRWRpdD8uZWRpdD8ucmVwbGFjZW1lbnRzWzBdID8/IG51bGwpO1xuXG5cdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IGZpcnN0RWRpdC5tYXAoZWRpdCA9PiBlZGl0ID8gc2luZ2xlVGV4dFJlbW92ZUNvbW1vblByZWZpeChlZGl0LCB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSEpLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSA6IG51bGwpO1xuXHRcdGNvbnN0IG9ic2VydmVkU3RhcnRQb2ludCA9IHRoaXMuX2VkaXRvck9icy5vYnNlcnZlUG9zaXRpb24oc3RhcnRQb3NpdGlvbiwgdGhpcy5fc3RvcmUpO1xuXHRcdGNvbnN0IHN0YXJ0UG9pbnQgPSBkZXJpdmVkPFBvaW50IHwgbnVsbD4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBvaW50ID0gb2JzZXJ2ZWRTdGFydFBvaW50LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghcG9pbnQpIHsgcmV0dXJuIG51bGw7IH1cblxuXHRcdFx0Y29uc3QgY29udGVudExlZnQgPSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mb0NvbnRlbnRMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNjcm9sbExlZnQgPSB0aGlzLl9lZGl0b3JPYnMuc2Nyb2xsTGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gbmV3IFBvaW50KGNvbnRlbnRMZWZ0ICsgcG9pbnQueCAtIHNjcm9sbExlZnQsIHBvaW50LnkpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3ZlcmxheUVsZW1lbnQgPSBuLmRpdih7XG5cdFx0XHRjbGFzczogJ2lubGluZS1lZGl0cy1jb2xsYXBzZWQtdmlldycsXG5cdFx0XHRzdHlsZToge1xuXHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0b3ZlcmZsb3c6ICd2aXNpYmxlJyxcblx0XHRcdFx0dG9wOiAnMHB4Jyxcblx0XHRcdFx0bGVmdDogJzBweCcsXG5cdFx0XHRcdGRpc3BsYXk6ICdibG9jaycsXG5cdFx0XHR9LFxuXHRcdH0sIFtcblx0XHRcdFt0aGlzLmdldENvbGxhcHNlZEluZGljYXRvcihzdGFydFBvaW50KV0sXG5cdFx0XSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpLmVsZW1lbnQ7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JPYnMuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiBvdmVybGF5RWxlbWVudCxcblx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUobnVsbCksXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aEluUHg6IGNvbnN0T2JzZXJ2YWJsZSgwKSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLmlzVmlzaWJsZSA9IHRoaXMuX2VkaXQubWFwKChpbmxpbmVFZGl0LCByZWFkZXIpID0+ICEhaW5saW5lRWRpdCAmJiBzdGFydFBvaW50LnJlYWQocmVhZGVyKSAhPT0gbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgdHJpZ2dlckFuaW1hdGlvbigpOiBQcm9taXNlPEFuaW1hdGlvbj4ge1xuXHRcdGlmICh0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBBbmltYXRpb24obnVsbCwgbnVsbCkuZmluaXNoZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUFVMU0UgQU5JTUFUSU9OOlxuXHRcdGNvbnN0IGFuaW1hdGlvbiA9IHRoaXMuX2ljb25SZWYuZWxlbWVudC5hbmltYXRlKFtcblx0XHRcdHsgb2Zmc2V0OiAwLjAwLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGVZKC0zcHgpJywgfSxcblx0XHRcdHsgb2Zmc2V0OiAwLjIwLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGVZKDFweCknLCB9LFxuXHRcdFx0eyBvZmZzZXQ6IDAuMzYsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoLTFweCknLCB9LFxuXHRcdFx0eyBvZmZzZXQ6IDAuNTIsIHRyYW5zZm9ybTogJ3RyYW5zbGF0ZVkoMXB4KScsIH0sXG5cdFx0XHR7IG9mZnNldDogMC42OCwgdHJhbnNmb3JtOiAndHJhbnNsYXRlWSgtMXB4KScsIH0sXG5cdFx0XHR7IG9mZnNldDogMC44NCwgdHJhbnNmb3JtOiAndHJhbnNsYXRlWSgxcHgpJywgfSxcblx0XHRcdHsgb2Zmc2V0OiAxLjAwLCB0cmFuc2Zvcm06ICd0cmFuc2xhdGVZKDBweCknLCB9LFxuXHRcdF0sIHsgZHVyYXRpb246IDIwMDAgfSk7XG5cblx0XHRyZXR1cm4gYW5pbWF0aW9uLmZpbmlzaGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb2xsYXBzZWRJbmRpY2F0b3Ioc3RhcnRQb2ludDogSU9ic2VydmFibGU8UG9pbnQgfCBudWxsPikge1xuXHRcdGNvbnN0IGNvbnRlbnRMZWZ0ID0gdGhpcy5fZWRpdG9yT2JzLmxheW91dEluZm9Db250ZW50TGVmdDtcblx0XHRjb25zdCBzdGFydFBvaW50VHJhbnNsYXRlZCA9IHN0YXJ0UG9pbnQubWFwKChwLCByZWFkZXIpID0+IHAgPyBwLmRlbHRhWCgtY29udGVudExlZnQucmVhZChyZWFkZXIpKSA6IG51bGwpO1xuXHRcdGNvbnN0IGljb25QYXRoID0gdGhpcy5jcmVhdGVJY29uUGF0aChzdGFydFBvaW50VHJhbnNsYXRlZCk7XG5cblx0XHRyZXR1cm4gbi5zdmcoe1xuXHRcdFx0Y2xhc3M6ICdjb2xsYXBzZWRWaWV3Jyxcblx0XHRcdHJlZjogdGhpcy5faWNvblJlZixcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHQuLi5yZWN0VG9Qcm9wcygocikgPT4gZ2V0RWRpdG9yVmFsaWRPdmVybGF5UmVjdCh0aGlzLl9lZGl0b3JPYnMpLnJlYWQocikpLFxuXHRcdFx0XHRvdmVyZmxvdzogJ2hpZGRlbicsXG5cdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdH1cblx0XHR9LCBbXG5cdFx0XHRuLnN2Z0VsZW0oJ3BhdGgnLCB7XG5cdFx0XHRcdGNsYXNzOiAnY29sbGFwc2VkVmlld1BhdGgnLFxuXHRcdFx0XHRkOiBpY29uUGF0aCxcblx0XHRcdFx0ZmlsbDogYXNDc3NWYXJpYWJsZShpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJvcmRlciksXG5cdFx0XHR9KSxcblx0XHRdKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSWNvblBhdGgoaW5kaWNhdG9yUG9pbnQ6IElPYnNlcnZhYmxlPFBvaW50IHwgbnVsbD4pOiBJT2JzZXJ2YWJsZTxzdHJpbmc+IHtcblx0XHRjb25zdCB3aWR0aCA9IDY7XG5cdFx0Y29uc3QgdHJpYW5nbGVIZWlnaHQgPSAzO1xuXHRcdGNvbnN0IGJhc2VIZWlnaHQgPSAxO1xuXG5cdFx0cmV0dXJuIGluZGljYXRvclBvaW50Lm1hcChwb2ludCA9PiB7XG5cdFx0XHRpZiAoIXBvaW50KSB7IHJldHVybiBuZXcgUGF0aEJ1aWxkZXIoKS5idWlsZCgpOyB9XG5cdFx0XHRjb25zdCBiYXNlVG9wTGVmdCA9IHBvaW50LmRlbHRhWCgtd2lkdGggLyAyKS5kZWx0YVkoLWJhc2VIZWlnaHQpO1xuXHRcdFx0Y29uc3QgYmFzZVRvcFJpZ2h0ID0gYmFzZVRvcExlZnQuZGVsdGFYKHdpZHRoKTtcblx0XHRcdGNvbnN0IGJhc2VCb3R0b21MZWZ0ID0gYmFzZVRvcExlZnQuZGVsdGFZKGJhc2VIZWlnaHQpO1xuXHRcdFx0Y29uc3QgYmFzZUJvdHRvbVJpZ2h0ID0gYmFzZVRvcFJpZ2h0LmRlbHRhWShiYXNlSGVpZ2h0KTtcblx0XHRcdGNvbnN0IHRyaWFuZ2xlQm90dG9tQ2VudGVyID0gYmFzZUJvdHRvbUxlZnQuZGVsdGFYKHdpZHRoIC8gMikuZGVsdGFZKHRyaWFuZ2xlSGVpZ2h0KTtcblx0XHRcdHJldHVybiBuZXcgUGF0aEJ1aWxkZXIoKVxuXHRcdFx0XHQubW92ZVRvKGJhc2VUb3BMZWZ0KVxuXHRcdFx0XHQubGluZVRvKGJhc2VUb3BSaWdodClcblx0XHRcdFx0LmxpbmVUbyhiYXNlQm90dG9tUmlnaHQpXG5cdFx0XHRcdC5saW5lVG8odHJpYW5nbGVCb3R0b21DZW50ZXIpXG5cdFx0XHRcdC5saW5lVG8oYmFzZUJvdHRvbUxlZnQpXG5cdFx0XHRcdC5saW5lVG8oYmFzZVRvcExlZnQpXG5cdFx0XHRcdC5idWlsZCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVhZG9ubHkgaXNIb3ZlcmVkID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQixlQUE0QjtBQUN0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
