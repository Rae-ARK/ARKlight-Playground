import { getWindow, addDisposableListener, n } from "../../../../base/browser/dom.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { autorun, derived, disposableObservableValue, observableValue } from "../../../../base/common/observable.js";
import { observableCodeEditor } from "../../../browser/observableCodeEditor.js";
import { Point } from "../../../common/core/2d/point.js";
import { AnimationFrameScheduler } from "../../../../base/browser/animatedValue.js";
import { appendRemoveOnDispose } from "../../../browser/widget/diffEditor/utils.js";
import "./middleScroll.css";
const _MiddleScrollController = class _MiddleScrollController extends Disposable {
  constructor(_editor) {
    super();
    this._editor = _editor;
    const obsEditor = observableCodeEditor(this._editor);
    const scrollOnMiddleClick = obsEditor.getOption(EditorOption.scrollOnMiddleClick);
    this._register(autorun((reader) => {
      if (!scrollOnMiddleClick.read(reader)) {
        return;
      }
      const editorDomNode = obsEditor.domNode.read(reader);
      if (!editorDomNode) {
        return;
      }
      const scrollingSession = reader.store.add(
        disposableObservableValue(
          "scrollingSession",
          void 0
        )
      );
      reader.store.add(this._editor.onMouseDown((e) => {
        const session = scrollingSession.read(void 0);
        if (session) {
          scrollingSession.set(void 0, void 0);
          return;
        }
        if (!e.event.middleButton) {
          return;
        }
        e.event.stopPropagation();
        e.event.preventDefault();
        const store = new DisposableStore();
        const initialPos = new Point(e.event.posx, e.event.posy);
        const mousePos = observeWindowMousePos(getWindow(editorDomNode), initialPos, store);
        const mouseDeltaAfterThreshold = mousePos.map((v) => v.subtract(initialPos).withThreshold(5));
        const editorDomNodeRect = editorDomNode.getBoundingClientRect();
        const initialMousePosInEditor = new Point(initialPos.x - editorDomNodeRect.left, initialPos.y - editorDomNodeRect.top);
        scrollingSession.set({
          mouseDeltaAfterThreshold,
          initialMousePosInEditor,
          didScroll: false,
          dispose: () => store.dispose()
        }, void 0);
        store.add(this._editor.onMouseUp((e2) => {
          const session2 = scrollingSession.read(void 0);
          if (session2 && session2.didScroll) {
            scrollingSession.set(void 0, void 0);
          }
        }));
        store.add(this._editor.onKeyDown((e2) => {
          scrollingSession.set(void 0, void 0);
        }));
      }));
      reader.store.add(autorun((reader2) => {
        const session = scrollingSession.read(reader2);
        if (!session) {
          return;
        }
        let lastTime = Date.now();
        reader2.store.add(autorun((reader3) => {
          AnimationFrameScheduler.instance.invalidateOnNextAnimationFrame(reader3);
          const curTime = Date.now();
          const frameDurationMs = curTime - lastTime;
          lastTime = curTime;
          const mouseDelta = session.mouseDeltaAfterThreshold.read(void 0);
          const factor = frameDurationMs / 32;
          const scrollDelta = mouseDelta.scale(factor);
          const scrollPos = new Point(this._editor.getScrollLeft(), this._editor.getScrollTop());
          this._editor.setScrollPosition(toScrollPosition(scrollPos.add(scrollDelta)));
          if (!scrollDelta.isZero()) {
            session.didScroll = true;
          }
        }));
        const directionAttr = derived((reader3) => {
          const delta = session.mouseDeltaAfterThreshold.read(reader3);
          let direction = "";
          direction += delta.y < 0 ? "n" : delta.y > 0 ? "s" : "";
          direction += delta.x < 0 ? "w" : delta.x > 0 ? "e" : "";
          return direction;
        });
        reader2.store.add(autorun((reader3) => {
          editorDomNode.setAttribute("data-scroll-direction", directionAttr.read(reader3));
        }));
      }));
      const dotDomElem = reader.store.add(n.div({
        class: ["scroll-editor-on-middle-click-dot", scrollingSession.map((session) => session ? "" : "hidden")],
        style: {
          left: scrollingSession.map((session) => session ? session.initialMousePosInEditor.x : 0),
          top: scrollingSession.map((session) => session ? session.initialMousePosInEditor.y : 0)
        }
      }).toDisposableLiveElement());
      reader.store.add(appendRemoveOnDispose(editorDomNode, dotDomElem.element));
      reader.store.add(autorun((reader2) => {
        const session = scrollingSession.read(reader2);
        editorDomNode.classList.toggle("scroll-editor-on-middle-click-editor", !!session);
      }));
    }));
  }
  static get(editor) {
    return editor.getContribution(_MiddleScrollController.ID);
  }
};
_MiddleScrollController.ID = "editor.contrib.middleScroll";
let MiddleScrollController = _MiddleScrollController;
function observeWindowMousePos(window, initialPos, store) {
  const val = observableValue("pos", initialPos);
  store.add(addDisposableListener(window, "mousemove", (e) => {
    val.set(new Point(e.pageX, e.pageY), void 0);
  }));
  return val;
}
function toScrollPosition(p) {
  return {
    scrollLeft: p.x,
    scrollTop: p.y
  };
}
export {
  MiddleScrollController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL21pZGRsZVNjcm9sbC9icm93c2VyL21pZGRsZVNjcm9sbENvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRXaW5kb3csIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uLCBJTmV3U2Nyb2xsUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgUG9pbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS8yZC9wb2ludC5qcyc7XG5pbXBvcnQgeyBBbmltYXRpb25GcmFtZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9hbmltYXRlZFZhbHVlLmpzJztcbmltcG9ydCB7IGFwcGVuZFJlbW92ZU9uRGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvdXRpbHMuanMnO1xuaW1wb3J0ICcuL21pZGRsZVNjcm9sbC5jc3MnO1xuXG5leHBvcnQgY2xhc3MgTWlkZGxlU2Nyb2xsQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5taWRkbGVTY3JvbGwnO1xuXG5cdHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IE1pZGRsZVNjcm9sbENvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxNaWRkbGVTY3JvbGxDb250cm9sbGVyPihNaWRkbGVTY3JvbGxDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3Jcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG9ic0VkaXRvciA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cdFx0Y29uc3Qgc2Nyb2xsT25NaWRkbGVDbGljayA9IG9ic0VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNjcm9sbE9uTWlkZGxlQ2xpY2spO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFzY3JvbGxPbk1pZGRsZUNsaWNrLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlZGl0b3JEb21Ob2RlID0gb2JzRWRpdG9yLmRvbU5vZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFlZGl0b3JEb21Ob2RlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Nyb2xsaW5nU2Vzc2lvbiA9IHJlYWRlci5zdG9yZS5hZGQoXG5cdFx0XHRcdGRpc3Bvc2FibGVPYnNlcnZhYmxlVmFsdWUoXG5cdFx0XHRcdFx0J3Njcm9sbGluZ1Nlc3Npb24nLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCBhcyB1bmRlZmluZWQgfCB7IG1vdXNlRGVsdGFBZnRlclRocmVzaG9sZDogSU9ic2VydmFibGU8UG9pbnQ+OyBpbml0aWFsTW91c2VQb3NJbkVkaXRvcjogUG9pbnQ7IGRpZFNjcm9sbDogYm9vbGVhbiB9ICYgSURpc3Bvc2FibGVcblx0XHRcdFx0KVxuXHRcdFx0KTtcblxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZURvd24oZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBzY3JvbGxpbmdTZXNzaW9uLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0XHRzY3JvbGxpbmdTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFlLmV2ZW50Lm1pZGRsZUJ1dHRvbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlLmV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRlLmV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxQb3MgPSBuZXcgUG9pbnQoZS5ldmVudC5wb3N4LCBlLmV2ZW50LnBvc3kpO1xuXHRcdFx0XHRjb25zdCBtb3VzZVBvcyA9IG9ic2VydmVXaW5kb3dNb3VzZVBvcyhnZXRXaW5kb3coZWRpdG9yRG9tTm9kZSksIGluaXRpYWxQb3MsIHN0b3JlKTtcblx0XHRcdFx0Y29uc3QgbW91c2VEZWx0YUFmdGVyVGhyZXNob2xkID0gbW91c2VQb3MubWFwKHYgPT4gdi5zdWJ0cmFjdChpbml0aWFsUG9zKS53aXRoVGhyZXNob2xkKDUpKTtcblxuXHRcdFx0XHRjb25zdCBlZGl0b3JEb21Ob2RlUmVjdCA9IGVkaXRvckRvbU5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxNb3VzZVBvc0luRWRpdG9yID0gbmV3IFBvaW50KGluaXRpYWxQb3MueCAtIGVkaXRvckRvbU5vZGVSZWN0LmxlZnQsIGluaXRpYWxQb3MueSAtIGVkaXRvckRvbU5vZGVSZWN0LnRvcCk7XG5cblx0XHRcdFx0c2Nyb2xsaW5nU2Vzc2lvbi5zZXQoe1xuXHRcdFx0XHRcdG1vdXNlRGVsdGFBZnRlclRocmVzaG9sZCxcblx0XHRcdFx0XHRpbml0aWFsTW91c2VQb3NJbkVkaXRvcixcblx0XHRcdFx0XHRkaWRTY3JvbGw6IGZhbHNlLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSxcblx0XHRcdFx0fSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uTW91c2VVcChlID0+IHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uID0gc2Nyb2xsaW5nU2Vzc2lvbi5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0aWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5kaWRTY3JvbGwpIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkgY2FuY2VsIHNlc3Npb24gb24gcmVsZWFzZSBpZiB0aGUgdXNlciBzY3JvbGxlZCBkdXJpbmcgaXRcblx0XHRcdFx0XHRcdHNjcm9sbGluZ1Nlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5fZWRpdG9yLm9uS2V5RG93bihlID0+IHtcblx0XHRcdFx0XHRzY3JvbGxpbmdTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBzY3JvbGxpbmdTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGxhc3RUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0QW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIuaW5zdGFuY2UuaW52YWxpZGF0ZU9uTmV4dEFuaW1hdGlvbkZyYW1lKHJlYWRlcik7XG5cblx0XHRcdFx0XHRjb25zdCBjdXJUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0XHRjb25zdCBmcmFtZUR1cmF0aW9uTXMgPSBjdXJUaW1lIC0gbGFzdFRpbWU7XG5cdFx0XHRcdFx0bGFzdFRpbWUgPSBjdXJUaW1lO1xuXG5cdFx0XHRcdFx0Y29uc3QgbW91c2VEZWx0YSA9IHNlc3Npb24ubW91c2VEZWx0YUFmdGVyVGhyZXNob2xkLnJlYWQodW5kZWZpbmVkKTtcblxuXHRcdFx0XHRcdC8vIHNjcm9sbCBieSBtb3VzZSBkZWx0YSBldmVyeSAzMm1zXG5cdFx0XHRcdFx0Y29uc3QgZmFjdG9yID0gZnJhbWVEdXJhdGlvbk1zIC8gMzI7XG5cdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsRGVsdGEgPSBtb3VzZURlbHRhLnNjYWxlKGZhY3Rvcik7XG5cblx0XHRcdFx0XHRjb25zdCBzY3JvbGxQb3MgPSBuZXcgUG9pbnQodGhpcy5fZWRpdG9yLmdldFNjcm9sbExlZnQoKSwgdGhpcy5fZWRpdG9yLmdldFNjcm9sbFRvcCgpKTtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3Iuc2V0U2Nyb2xsUG9zaXRpb24odG9TY3JvbGxQb3NpdGlvbihzY3JvbGxQb3MuYWRkKHNjcm9sbERlbHRhKSkpO1xuXHRcdFx0XHRcdGlmICghc2Nyb2xsRGVsdGEuaXNaZXJvKCkpIHtcblx0XHRcdFx0XHRcdHNlc3Npb24uZGlkU2Nyb2xsID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zdCBkaXJlY3Rpb25BdHRyID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGRlbHRhID0gc2Vzc2lvbi5tb3VzZURlbHRhQWZ0ZXJUaHJlc2hvbGQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGxldCBkaXJlY3Rpb246IHN0cmluZyA9ICcnO1xuXHRcdFx0XHRcdGRpcmVjdGlvbiArPSAoZGVsdGEueSA8IDAgPyAnbicgOiAoZGVsdGEueSA+IDAgPyAncycgOiAnJykpO1xuXHRcdFx0XHRcdGRpcmVjdGlvbiArPSAoZGVsdGEueCA8IDAgPyAndycgOiAoZGVsdGEueCA+IDAgPyAnZScgOiAnJykpO1xuXHRcdFx0XHRcdHJldHVybiBkaXJlY3Rpb247XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRlZGl0b3JEb21Ob2RlLnNldEF0dHJpYnV0ZSgnZGF0YS1zY3JvbGwtZGlyZWN0aW9uJywgZGlyZWN0aW9uQXR0ci5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGRvdERvbUVsZW0gPSByZWFkZXIuc3RvcmUuYWRkKG4uZGl2KHtcblx0XHRcdFx0Y2xhc3M6IFsnc2Nyb2xsLWVkaXRvci1vbi1taWRkbGUtY2xpY2stZG90Jywgc2Nyb2xsaW5nU2Vzc2lvbi5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uID8gJycgOiAnaGlkZGVuJyldLFxuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdGxlZnQ6IHNjcm9sbGluZ1Nlc3Npb24ubWFwKChzZXNzaW9uKSA9PiBzZXNzaW9uID8gc2Vzc2lvbi5pbml0aWFsTW91c2VQb3NJbkVkaXRvci54IDogMCksXG5cdFx0XHRcdFx0dG9wOiBzY3JvbGxpbmdTZXNzaW9uLm1hcCgoc2Vzc2lvbikgPT4gc2Vzc2lvbiA/IHNlc3Npb24uaW5pdGlhbE1vdXNlUG9zSW5FZGl0b3IueSA6IDApLFxuXHRcdFx0XHR9XG5cdFx0XHR9KS50b0Rpc3Bvc2FibGVMaXZlRWxlbWVudCgpKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXBwZW5kUmVtb3ZlT25EaXNwb3NlKGVkaXRvckRvbU5vZGUsIGRvdERvbUVsZW0uZWxlbWVudCkpO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNjcm9sbGluZ1Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRlZGl0b3JEb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3Njcm9sbC1lZGl0b3Itb24tbWlkZGxlLWNsaWNrLWVkaXRvcicsICEhc2Vzc2lvbik7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG9ic2VydmVXaW5kb3dNb3VzZVBvcyh3aW5kb3c6IFdpbmRvdywgaW5pdGlhbFBvczogUG9pbnQsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBJT2JzZXJ2YWJsZTxQb2ludD4ge1xuXHRjb25zdCB2YWwgPSBvYnNlcnZhYmxlVmFsdWUoJ3BvcycsIGluaXRpYWxQb3MpO1xuXHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdywgJ21vdXNlbW92ZScsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0dmFsLnNldChuZXcgUG9pbnQoZS5wYWdlWCwgZS5wYWdlWSksIHVuZGVmaW5lZCk7XG5cdH0pKTtcblx0cmV0dXJuIHZhbDtcbn1cblxuZnVuY3Rpb24gdG9TY3JvbGxQb3NpdGlvbihwOiBQb2ludCk6IElOZXdTY3JvbGxQb3NpdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0c2Nyb2xsTGVmdDogcC54LFxuXHRcdHNjcm9sbFRvcDogcC55LFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXLHVCQUF1QixTQUFTO0FBQ3BELFNBQVMsWUFBWSx1QkFBb0M7QUFHekQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxTQUFTLFNBQVMsMkJBQXdDLHVCQUF1QjtBQUMxRixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGFBQWE7QUFDdEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFDdEMsT0FBTztBQUVBLE1BQU0sMEJBQU4sTUFBTSxnQ0FBK0IsV0FBMEM7QUFBQSxFQU9yRixZQUNrQixTQUNoQjtBQUNELFVBQU07QUFGVztBQUlqQixVQUFNLFlBQVkscUJBQXFCLEtBQUssT0FBTztBQUNuRCxVQUFNLHNCQUFzQixVQUFVLFVBQVUsYUFBYSxtQkFBbUI7QUFFaEYsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUNoQyxVQUFJLENBQUMsb0JBQW9CLEtBQUssTUFBTSxHQUFHO0FBQ3RDO0FBQUEsTUFDRDtBQUNBLFlBQU0sZ0JBQWdC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aUJBQU87QUFBQSxRQUNSLENBQUM7QUFDRCxRQUFBQSxRQUFPLE1BQU0sSUFBSSxRQUFRLENBQUFBLFlBQVU7QUFDbEMsd0JBQWMsYUFBYSx5QkFBeUIsY0FBYyxLQUFLQSxPQUFNLENBQUM7QUFBQSxRQUMvRSxDQUFDLENBQUM7QUFBQSxNQUNILENBQUMsQ0FBQztBQUVGLFlBQU0sYUFBYSxPQUFPLE1BQU0sSUFBSSxFQUFFLElBQUk7QUFBQSxRQUN6QyxPQUFPLENBQUMscUNBQXFDLGlCQUFpQixJQUFJLGFBQVcsVUFBVSxLQUFLLFFBQVEsQ0FBQztBQUFBLFFBQ3JHLE9BQU87QUFBQSxVQUNOLE1BQU0saUJBQWlCLElBQUksQ0FBQyxZQUFZLFVBQVUsUUFBUSx3QkFBd0IsSUFBSSxDQUFDO0FBQUEsVUFDdkYsS0FBSyxpQkFBaUIsSUFBSSxDQUFDLFlBQVksVUFBVSxRQUFRLHdCQUF3QixJQUFJLENBQUM7QUFBQSxRQUN2RjtBQUFBLE1BQ0QsQ0FBQyxFQUFFLHdCQUF3QixDQUFDO0FBQzVCLGFBQU8sTUFBTSxJQUFJLHNCQUFzQixlQUFlLFdBQVcsT0FBTyxDQUFDO0FBRXpFLGFBQU8sTUFBTSxJQUFJLFFBQVEsQ0FBQUEsWUFBVTtBQUNsQyxjQUFNLFVBQVUsaUJBQWlCLEtBQUtBLE9BQU07QUFDNUMsc0JBQWMsVUFBVSxPQUFPLHdDQUF3QyxDQUFDLENBQUMsT0FBTztBQUFBLE1BQ2pGLENBQUMsQ0FBQztBQUFBLElBQ0gsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBMUhBLE9BQU8sSUFBSSxRQUFvRDtBQUM5RCxXQUFPLE9BQU8sZ0JBQXdDLHdCQUF1QixFQUFFO0FBQUEsRUFDaEY7QUF5SEQ7QUE5SGEsd0JBQ1csS0FBSztBQUR0QixJQUFNLHlCQUFOO0FBZ0lQLFNBQVMsc0JBQXNCLFFBQWdCLFlBQW1CLE9BQTRDO0FBQzdHLFFBQU0sTUFBTSxnQkFBZ0IsT0FBTyxVQUFVO0FBQzdDLFFBQU0sSUFBSSxzQkFBc0IsUUFBUSxhQUFhLENBQUMsTUFBa0I7QUFDdkUsUUFBSSxJQUFJLElBQUksTUFBTSxFQUFFLE9BQU8sRUFBRSxLQUFLLEdBQUcsTUFBUztBQUFBLEVBQy9DLENBQUMsQ0FBQztBQUNGLFNBQU87QUFDUjtBQUVBLFNBQVMsaUJBQWlCLEdBQThCO0FBQ3ZELFNBQU87QUFBQSxJQUNOLFlBQVksRUFBRTtBQUFBLElBQ2QsV0FBVyxFQUFFO0FBQUEsRUFDZDtBQUNEOyIsCiAgIm5hbWVzIjogWyJlIiwgInNlc3Npb24iLCAicmVhZGVyIl0KfQo=
