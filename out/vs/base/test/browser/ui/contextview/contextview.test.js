import assert from "assert";
import sinon from "sinon";
import { $, getWindow } from "../../../../browser/dom.js";
import { CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, CONTEXT_VIEW_MENU_MOTION_CLASS, ContextView, ContextViewDOMPosition } from "../../../../browser/ui/contextview/contextview.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
suite("ContextView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => {
    sinon.restore();
  });
  test("hide() is re-entrant safe and does not double-dispose render result (#319393)", () => {
    const container = $(".container");
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    let disposeCount = 0;
    const delegate = {
      getAnchor: () => ({ x: 0, y: 0 }),
      render: () => ({
        dispose: () => {
          disposeCount++;
          if (disposeCount === 1) {
            contextView.hide();
          }
        }
      })
    };
    contextView.show(delegate);
    assert.doesNotThrow(() => contextView.hide());
    assert.strictEqual(disposeCount, 1, "render disposable must be disposed exactly once");
    contextView.dispose();
    container.remove();
  });
  test("hide() delays render disposal for close animations", () => {
    const clock = sinon.useFakeTimers();
    const container = $(".container");
    container.classList.add("style-override", "monaco-enable-motion");
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    let disposeCount = 0;
    const delegate = {
      getAnchor: () => ({ x: 0, y: 0 }),
      render: () => ({
        dispose: () => {
          disposeCount++;
        }
      }),
      closeAnimation: {
        className: "closing",
        duration: 100,
        requiredAncestorClasses: ["style-override", "monaco-enable-motion"]
      }
    };
    contextView.show(delegate);
    contextView.hide();
    contextView.hide();
    assert.deepStrictEqual({
      disposeCount,
      hasClosingClass: contextView.getViewElement().classList.contains("closing"),
      animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE)
    }, {
      disposeCount: 0,
      hasClosingClass: true,
      animationDuration: "100ms"
    });
    clock.tick(100);
    assert.deepStrictEqual({
      disposeCount,
      hasClosingClass: contextView.getViewElement().classList.contains("closing"),
      animationDuration: contextView.getViewElement().style.getPropertyValue(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE)
    }, {
      disposeCount: 1,
      hasClosingClass: false,
      animationDuration: ""
    });
    contextView.dispose();
    assert.strictEqual(disposeCount, 1);
    container.remove();
  });
  test("menu motion does not retain a containing block for submenus (#326248)", () => {
    const container = $(".container");
    container.classList.add("style-override", "monaco-enable-motion");
    document.body.appendChild(container);
    const surface = $(".monaco-scrollable-element");
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    contextView.show({
      getAnchor: () => ({ x: 0, y: 0 }),
      render: (view) => {
        view.appendChild(surface);
        return null;
      }
    });
    contextView.getViewElement().classList.add(CONTEXT_VIEW_MENU_MOTION_CLASS);
    const style = getWindow(surface).getComputedStyle(surface);
    assert.deepStrictEqual({
      animationFillMode: style.animationFillMode,
      willChange: style.willChange
    }, {
      animationFillMode: "backwards",
      willChange: "opacity"
    });
    contextView.dispose();
    container.remove();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgJCwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRSwgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTLCBDb250ZXh0VmlldywgQ29udGV4dFZpZXdET01Qb3NpdGlvbiwgSURlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnQ29udGV4dFZpZXcnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGUoKSBpcyByZS1lbnRyYW50IHNhZmUgYW5kIGRvZXMgbm90IGRvdWJsZS1kaXNwb3NlIHJlbmRlciByZXN1bHQgKCMzMTkzOTMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5jb250YWluZXInKTtcblx0XHRjb25zdCBjb250ZXh0VmlldyA9IG5ldyBDb250ZXh0Vmlldyhjb250YWluZXIsIENvbnRleHRWaWV3RE9NUG9zaXRpb24uQUJTT0xVVEUpO1xuXG5cdFx0bGV0IGRpc3Bvc2VDb3VudCA9IDA7XG5cdFx0Y29uc3QgZGVsZWdhdGU6IElEZWxlZ2F0ZSA9IHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHsgeDogMCwgeTogMCB9KSxcblx0XHRcdHJlbmRlcjogKCkgPT4gKHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2VDb3VudCsrO1xuXHRcdFx0XHRcdGlmIChkaXNwb3NlQ291bnQgPT09IDEpIHtcblx0XHRcdFx0XHRcdC8vIFNpbXVsYXRlIGEgcmUtZW50cmFudCBoaWRlKCkgY2FsbCAoZS5nLiB2aWEgYSBibHVyIGV2ZW50XG5cdFx0XHRcdFx0XHQvLyBmaXJlZCB3aGlsZSByZW1vdmluZyB0aGUgcmVuZGVyZWQgRE9NIG5vZGUgZnJvbSB0aGUgZG9jdW1lbnQpLlxuXHRcdFx0XHRcdFx0Y29udGV4dFZpZXcuaGlkZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHR9O1xuXG5cdFx0Y29udGV4dFZpZXcuc2hvdyhkZWxlZ2F0ZSk7XG5cblx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IGNvbnRleHRWaWV3LmhpZGUoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VDb3VudCwgMSwgJ3JlbmRlciBkaXNwb3NhYmxlIG11c3QgYmUgZGlzcG9zZWQgZXhhY3RseSBvbmNlJyk7XG5cblx0XHRjb250ZXh0Vmlldy5kaXNwb3NlKCk7XG5cdFx0Y29udGFpbmVyLnJlbW92ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlKCkgZGVsYXlzIHJlbmRlciBkaXNwb3NhbCBmb3IgY2xvc2UgYW5pbWF0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoKTtcblx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuY29udGFpbmVyJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3N0eWxlLW92ZXJyaWRlJywgJ21vbmFjby1lbmFibGUtbW90aW9uJyk7XG5cdFx0Y29uc3QgY29udGV4dFZpZXcgPSBuZXcgQ29udGV4dFZpZXcoY29udGFpbmVyLCBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkFCU09MVVRFKTtcblxuXHRcdGxldCBkaXNwb3NlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGRlbGVnYXRlOiBJRGVsZWdhdGUgPSB7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7IHg6IDAsIHk6IDAgfSksXG5cdFx0XHRyZW5kZXI6ICgpID0+ICh7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NlQ291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRjbG9zZUFuaW1hdGlvbjoge1xuXHRcdFx0XHRjbGFzc05hbWU6ICdjbG9zaW5nJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMCxcblx0XHRcdFx0cmVxdWlyZWRBbmNlc3RvckNsYXNzZXM6IFsnc3R5bGUtb3ZlcnJpZGUnLCAnbW9uYWNvLWVuYWJsZS1tb3Rpb24nXVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb250ZXh0Vmlldy5zaG93KGRlbGVnYXRlKTtcblx0XHRjb250ZXh0Vmlldy5oaWRlKCk7XG5cdFx0Y29udGV4dFZpZXcuaGlkZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkaXNwb3NlQ291bnQsXG5cdFx0XHRoYXNDbG9zaW5nQ2xhc3M6IGNvbnRleHRWaWV3LmdldFZpZXdFbGVtZW50KCkuY2xhc3NMaXN0LmNvbnRhaW5zKCdjbG9zaW5nJyksXG5cdFx0XHRhbmltYXRpb25EdXJhdGlvbjogY29udGV4dFZpZXcuZ2V0Vmlld0VsZW1lbnQoKS5zdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKENPTlRFWFRfVklFV19DTE9TRV9BTklNQVRJT05fRFVSQVRJT05fVkFSSUFCTEUpXG5cdFx0fSwge1xuXHRcdFx0ZGlzcG9zZUNvdW50OiAwLFxuXHRcdFx0aGFzQ2xvc2luZ0NsYXNzOiB0cnVlLFxuXHRcdFx0YW5pbWF0aW9uRHVyYXRpb246ICcxMDBtcydcblx0XHR9KTtcblxuXHRcdGNsb2NrLnRpY2soMTAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcG9zZUNvdW50LFxuXHRcdFx0aGFzQ2xvc2luZ0NsYXNzOiBjb250ZXh0Vmlldy5nZXRWaWV3RWxlbWVudCgpLmNsYXNzTGlzdC5jb250YWlucygnY2xvc2luZycpLFxuXHRcdFx0YW5pbWF0aW9uRHVyYXRpb246IGNvbnRleHRWaWV3LmdldFZpZXdFbGVtZW50KCkuc3R5bGUuZ2V0UHJvcGVydHlWYWx1ZShDT05URVhUX1ZJRVdfQ0xPU0VfQU5JTUFUSU9OX0RVUkFUSU9OX1ZBUklBQkxFKVxuXHRcdH0sIHtcblx0XHRcdGRpc3Bvc2VDb3VudDogMSxcblx0XHRcdGhhc0Nsb3NpbmdDbGFzczogZmFsc2UsXG5cdFx0XHRhbmltYXRpb25EdXJhdGlvbjogJydcblx0XHR9KTtcblxuXHRcdGNvbnRleHRWaWV3LmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcG9zZUNvdW50LCAxKTtcblx0XHRjb250YWluZXIucmVtb3ZlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lbnUgbW90aW9uIGRvZXMgbm90IHJldGFpbiBhIGNvbnRhaW5pbmcgYmxvY2sgZm9yIHN1Ym1lbnVzICgjMzI2MjQ4KScsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuY29udGFpbmVyJyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3N0eWxlLW92ZXJyaWRlJywgJ21vbmFjby1lbmFibGUtbW90aW9uJyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgc3VyZmFjZSA9ICQoJy5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50Jyk7XG5cdFx0Y29uc3QgY29udGV4dFZpZXcgPSBuZXcgQ29udGV4dFZpZXcoY29udGFpbmVyLCBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkFCU09MVVRFKTtcblx0XHRjb250ZXh0Vmlldy5zaG93KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gKHsgeDogMCwgeTogMCB9KSxcblx0XHRcdHJlbmRlcjogdmlldyA9PiB7XG5cdFx0XHRcdHZpZXcuYXBwZW5kQ2hpbGQoc3VyZmFjZSk7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnRleHRWaWV3LmdldFZpZXdFbGVtZW50KCkuY2xhc3NMaXN0LmFkZChDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xBU1MpO1xuXG5cdFx0Y29uc3Qgc3R5bGUgPSBnZXRXaW5kb3coc3VyZmFjZSkuZ2V0Q29tcHV0ZWRTdHlsZShzdXJmYWNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFuaW1hdGlvbkZpbGxNb2RlOiBzdHlsZS5hbmltYXRpb25GaWxsTW9kZSxcblx0XHRcdHdpbGxDaGFuZ2U6IHN0eWxlLndpbGxDaGFuZ2Vcblx0XHR9LCB7XG5cdFx0XHRhbmltYXRpb25GaWxsTW9kZTogJ2JhY2t3YXJkcycsXG5cdFx0XHR3aWxsQ2hhbmdlOiAnb3BhY2l0eSdcblx0XHR9KTtcblxuXHRcdGNvbnRleHRWaWV3LmRpc3Bvc2UoKTtcblx0XHRjb250YWluZXIucmVtb3ZlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsR0FBRyxpQkFBaUI7QUFDN0IsU0FBUyxnREFBZ0QsZ0NBQWdDLGFBQWEsOEJBQXlDO0FBQy9JLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sZUFBZSxNQUFNO0FBQzFCLDBDQUF3QztBQUV4QyxXQUFTLE1BQU07QUFDZCxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFFRCxPQUFLLGlGQUFpRixNQUFNO0FBQzNGLFVBQU0sWUFBWSxFQUFFLFlBQVk7QUFDaEMsVUFBTSxjQUFjLElBQUksWUFBWSxXQUFXLHVCQUF1QixRQUFRO0FBRTlFLFFBQUksZUFBZTtBQUNuQixVQUFNLFdBQXNCO0FBQUEsTUFDM0IsV0FBVyxPQUFPLEVBQUUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLE1BQy9CLFFBQVEsT0FBTztBQUFBLFFBQ2QsU0FBUyxNQUFNO0FBQ2Q7QUFDQSxjQUFJLGlCQUFpQixHQUFHO0FBR3ZCLHdCQUFZLEtBQUs7QUFBQSxVQUNsQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLGdCQUFZLEtBQUssUUFBUTtBQUV6QixXQUFPLGFBQWEsTUFBTSxZQUFZLEtBQUssQ0FBQztBQUM1QyxXQUFPLFlBQVksY0FBYyxHQUFHLGlEQUFpRDtBQUVyRixnQkFBWSxRQUFRO0FBQ3BCLGNBQVUsT0FBTztBQUFBLEVBQ2xCLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFVBQU0sUUFBUSxNQUFNLGNBQWM7QUFDbEMsVUFBTSxZQUFZLEVBQUUsWUFBWTtBQUNoQyxjQUFVLFVBQVUsSUFBSSxrQkFBa0Isc0JBQXNCO0FBQ2hFLFVBQU0sY0FBYyxJQUFJLFlBQVksV0FBVyx1QkFBdUIsUUFBUTtBQUU5RSxRQUFJLGVBQWU7QUFDbkIsVUFBTSxXQUFzQjtBQUFBLE1BQzNCLFdBQVcsT0FBTyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxNQUMvQixRQUFRLE9BQU87QUFBQSxRQUNkLFNBQVMsTUFBTTtBQUNkO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGdCQUFnQjtBQUFBLFFBQ2YsV0FBVztBQUFBLFFBQ1gsVUFBVTtBQUFBLFFBQ1YseUJBQXlCLENBQUMsa0JBQWtCLHNCQUFzQjtBQUFBLE1BQ25FO0FBQUEsSUFDRDtBQUVBLGdCQUFZLEtBQUssUUFBUTtBQUN6QixnQkFBWSxLQUFLO0FBQ2pCLGdCQUFZLEtBQUs7QUFFakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsaUJBQWlCLFlBQVksZUFBZSxFQUFFLFVBQVUsU0FBUyxTQUFTO0FBQUEsTUFDMUUsbUJBQW1CLFlBQVksZUFBZSxFQUFFLE1BQU0saUJBQWlCLDhDQUE4QztBQUFBLElBQ3RILEdBQUc7QUFBQSxNQUNGLGNBQWM7QUFBQSxNQUNkLGlCQUFpQjtBQUFBLE1BQ2pCLG1CQUFtQjtBQUFBLElBQ3BCLENBQUM7QUFFRCxVQUFNLEtBQUssR0FBRztBQUVkLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLGlCQUFpQixZQUFZLGVBQWUsRUFBRSxVQUFVLFNBQVMsU0FBUztBQUFBLE1BQzFFLG1CQUFtQixZQUFZLGVBQWUsRUFBRSxNQUFNLGlCQUFpQiw4Q0FBOEM7QUFBQSxJQUN0SCxHQUFHO0FBQUEsTUFDRixjQUFjO0FBQUEsTUFDZCxpQkFBaUI7QUFBQSxNQUNqQixtQkFBbUI7QUFBQSxJQUNwQixDQUFDO0FBRUQsZ0JBQVksUUFBUTtBQUNwQixXQUFPLFlBQVksY0FBYyxDQUFDO0FBQ2xDLGNBQVUsT0FBTztBQUFBLEVBQ2xCLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFVBQU0sWUFBWSxFQUFFLFlBQVk7QUFDaEMsY0FBVSxVQUFVLElBQUksa0JBQWtCLHNCQUFzQjtBQUNoRSxhQUFTLEtBQUssWUFBWSxTQUFTO0FBRW5DLFVBQU0sVUFBVSxFQUFFLDRCQUE0QjtBQUM5QyxVQUFNLGNBQWMsSUFBSSxZQUFZLFdBQVcsdUJBQXVCLFFBQVE7QUFDOUUsZ0JBQVksS0FBSztBQUFBLE1BQ2hCLFdBQVcsT0FBTyxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxNQUMvQixRQUFRLFVBQVE7QUFDZixhQUFLLFlBQVksT0FBTztBQUN4QixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUNELGdCQUFZLGVBQWUsRUFBRSxVQUFVLElBQUksOEJBQThCO0FBRXpFLFVBQU0sUUFBUSxVQUFVLE9BQU8sRUFBRSxpQkFBaUIsT0FBTztBQUN6RCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLG1CQUFtQixNQUFNO0FBQUEsTUFDekIsWUFBWSxNQUFNO0FBQUEsSUFDbkIsR0FBRztBQUFBLE1BQ0YsbUJBQW1CO0FBQUEsTUFDbkIsWUFBWTtBQUFBLElBQ2IsQ0FBQztBQUVELGdCQUFZLFFBQVE7QUFDcEIsY0FBVSxPQUFPO0FBQUEsRUFDbEIsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
